package com.tarifpro.app.data.repo

import com.tarifpro.app.AppContainer
import com.tarifpro.app.data.local.ChatEntity
import com.tarifpro.app.data.local.CommentEntity
import com.tarifpro.app.data.local.FollowEntity
import com.tarifpro.app.data.local.MessageEntity
import com.tarifpro.app.data.local.NotificationEntity
import com.tarifpro.app.data.local.ReportEntity
import com.tarifpro.app.data.local.UserEntity
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.notify.NotifType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.withContext
import java.util.UUID

data class AdminStats(
    val recipes: Int,
    val publicRecipes: Int,
    val privateRecipes: Int,
    val hiddenRecipes: Int,
    val users: Int,
    val comments: Int,
    val messages: Int,
    val openReports: Int,
)

@OptIn(ExperimentalCoroutinesApi::class)
class SocialRepository(private val c: AppContainer) {
    private val db = c.db
    private val me get() = c.sessionStore.current

    val users: StateFlow<List<UserEntity>> = db.users().observeAll().stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    fun user(id: String): Flow<UserEntity?> = db.users().observe(id)

    val followingIds: StateFlow<Set<String>> = combine(c.recipes.follows, c.sessionStore.session) { list, s ->
        list.filter { it.followerId == s?.uid }.map { it.followeeId }.toSet()
    }.stateIn(c.scope, SharingStarted.Eagerly, emptySet())

    fun followerCount(userId: String): Flow<Int> = combine(c.recipes.follows, user(userId)) { list, u ->
        maxOf(list.count { it.followeeId == userId }, u?.followers ?: 0)
    }

    fun followingCount(userId: String): Flow<Int> = combine(c.recipes.follows, user(userId)) { list, u ->
        maxOf(list.count { it.followerId == userId }, u?.following ?: 0)
    }

    suspend fun toggleFollow(userId: String) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        if (userId == s.uid) return@withContext
        val existing = db.follows().get(s.uid, userId)
        val follow = existing == null || existing.deleted
        db.follows().upsert(FollowEntity(s.uid, userId, System.currentTimeMillis(), dirty = true, deleted = !follow))
        c.sync.requestSync()
        if (follow) deliverNotification(userId, NotifType.FOLLOW, "👋 ${s.name} sizi takip etmeye başladı", "Profiline göz atın ve tariflerini keşfedin.", "user/${s.uid}")
    }

    /** Hedef kullanıcıya bildirim kutusu kaydı gönderir (bulutta) veya yerelde saklar. */
    suspend fun deliverNotification(toUserId: String, type: String, title: String, body: String, route: String?) {
        val n = NotificationEntity(UUID.randomUUID().toString(), toUserId, type, title, body, route, System.currentTimeMillis())
        val cloud = c.sync.cloudReady()
        if (cloud != null && !toUserId.startsWith("demo-") && !toUserId.startsWith("local-")) {
            try {
                cloud.sendInbox(toUserId, n)
            } catch (e: Exception) {
                // çevrimdışıysa Firestore kuyruğa alır
            }
        }
        if (toUserId == me?.uid) {
            db.notifications().upsert(n)
            c.notifier.post(type, title, body, route)
        }
    }

    suspend fun notifyFollowersOfNewRecipe(r: Recipe) {
        val cloud = c.sync.cloudReady() ?: return
        try {
            val followers = cloud.fetchFollowers(r.authorId)
            followers.take(300).forEach { uid ->
                cloud.sendInbox(
                    uid,
                    NotificationEntity(
                        UUID.randomUUID().toString(), uid, NotifType.RECIPE, "🍽️ ${r.authorName} yeni bir tarif paylaştı",
                        r.title, "recipe/${r.id}", System.currentTimeMillis(),
                    ),
                )
            }
        } catch (e: Exception) {
            // önemsiz
        }
    }

    // ---------- Sohbet ----------

    val chats: StateFlow<List<ChatEntity>> = combine(db.chats().observeAll(), c.sessionStore.session) { list, s ->
        list.filter { it.kind == "CHANNEL" || s?.uid in it.membersCsv.split(',') }
    }.stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    val unreadChats: StateFlow<Int> = combine(chats, c.sessionStore.session) { list, s ->
        list.count { it.lastAt > it.readAt && it.lastSenderId != s?.uid && it.lastSenderId.isNotEmpty() && it.kind == "DM" }
    }.stateIn(c.scope, SharingStarted.Eagerly, 0)

    fun chat(id: String): Flow<ChatEntity?> = db.chats().observe(id)
    fun messages(chatId: String): Flow<List<MessageEntity>> = db.chats().observeMessages(chatId)

    fun dmId(a: String, b: String): String = "dm_" + listOf(a, b).sorted().joinToString("_")

    suspend fun openDm(other: UserEntity): String = withContext(Dispatchers.IO) {
        val s = me ?: error("Oturum yok")
        val id = dmId(s.uid, other.id)
        val existing = db.chats().get(id)
        if (existing == null) {
            val chat = ChatEntity(id, "DM", other.name, "💬", listOf(s.uid, other.id).joinToString(","), "", System.currentTimeMillis(), "", System.currentTimeMillis())
            db.chats().upsert(chat)
            c.sync.cloudReady()?.let { cloud ->
                try {
                    cloud.upsertChat(chat.copy(title = ""))
                } catch (e: Exception) {
                    // sonra
                }
            }
        }
        id
    }

    /** Sohbet başlığı: DM ise karşı tarafın adı */
    fun chatTitle(chat: ChatEntity, allUsers: List<UserEntity>): String {
        if (chat.kind == "CHANNEL") return chat.title
        val other = chat.membersCsv.split(',').firstOrNull { it != me?.uid }
        return allUsers.firstOrNull { it.id == other }?.name ?: chat.title.ifBlank { "Sohbet" }
    }

    fun chatPartner(chat: ChatEntity, allUsers: List<UserEntity>): UserEntity? {
        if (chat.kind == "CHANNEL") return null
        val other = chat.membersCsv.split(',').firstOrNull { it != me?.uid }
        return allUsers.firstOrNull { it.id == other }
    }

    suspend fun send(chatId: String, text: String, recipe: Recipe? = null) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        if (text.isBlank() && recipe == null) return@withContext
        val now = System.currentTimeMillis()
        val m = MessageEntity(
            id = UUID.randomUUID().toString(), chatId = chatId, senderId = s.uid, senderName = s.name, senderPhoto = s.photo,
            text = text.trim(), recipeId = recipe?.id, recipeTitle = recipe?.title, recipeImage = recipe?.image,
            createdAt = now, dirty = true,
        )
        db.chats().upsertMessage(m)
        db.chats().get(chatId)?.let {
            val preview = if (recipe != null) "📖 ${recipe.title}" else m.text
            db.chats().upsert(it.copy(lastMessage = preview.take(120), lastAt = now, lastSenderId = s.uid, readAt = now))
        }
        c.sync.requestSync()
    }

    suspend fun deleteMessage(m: MessageEntity) = withContext(Dispatchers.IO) {
        db.chats().deleteMessage(m.id)
        try {
            c.sync.cloudReady()?.deleteMessage(m.chatId, m.id)
        } catch (e: Exception) {
            // yetki yok
        }
    }

    suspend fun markRead(chatId: String) = db.chats().markRead(chatId, System.currentTimeMillis())

    // ---------- Bildirimler ----------

    val notifications: StateFlow<List<NotificationEntity>> = c.sessionStore.session.flatMapLatest { s ->
        if (s == null) flowOf(emptyList()) else db.notifications().observe(s.uid)
    }.stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    val unreadNotifications: StateFlow<Int> = notifications.map { list -> list.count { !it.read } }
        .stateIn(c.scope, SharingStarted.Eagerly, 0)

    suspend fun markAllNotificationsRead() {
        val s = me ?: return
        db.notifications().markAllRead(s.uid)
    }

    suspend fun clearNotifications() {
        val s = me ?: return
        db.notifications().clear(s.uid)
    }

    // ---------- Yönetici paneli ----------

    val reports: StateFlow<List<ReportEntity>> = db.reports().observeAll().stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    val recentComments: Flow<List<CommentEntity>> = db.comments().observeRecent(100)

    val stats: Flow<AdminStats> = combine(
        db.recipes().observeAll(), users, db.comments().observeCount(), db.chats().observeMessageCount(), reports,
    ) { recipes, us, comments, messages, reps ->
        val live = recipes.filter { !it.deleted }
        AdminStats(
            recipes = live.size,
            publicRecipes = live.count { it.visibility == "PUBLIC" },
            privateRecipes = live.count { it.visibility == "PRIVATE" },
            hiddenRecipes = live.count { it.hidden },
            users = us.size,
            comments = comments,
            messages = messages,
            openReports = reps.count { it.status == "OPEN" },
        )
    }

    suspend fun refreshAdminData() {
        val cloud = c.sync.cloudReady() ?: return
        try {
            db.reports().upsertAll(cloud.fetchReports())
            db.users().upsertAll(cloud.fetchUsers())
            db.recipes().upsertAll(cloud.fetchPublicRecipes().filter { remote -> db.recipes().get(remote.id)?.dirty != true })
        } catch (e: Exception) {
            // yetki veya ağ sorunu
        }
    }

    suspend fun setReportStatus(r: ReportEntity, status: String) = withContext(Dispatchers.IO) {
        val updated = r.copy(status = status, dirty = true)
        db.reports().upsert(updated)
        c.sync.requestSync()
    }

    suspend fun moderateRecipe(id: String, hidden: Boolean? = null, featured: Boolean? = null, delete: Boolean = false) = withContext(Dispatchers.IO) {
        val e = c.db.recipes().get(id) ?: return@withContext
        val updated = e.copy(
            hidden = hidden ?: e.hidden, featured = featured ?: e.featured, deleted = delete || e.deleted,
            updatedAt = System.currentTimeMillis(),
        )
        db.recipes().upsert(updated.copy(dirty = false))
        c.sync.cloudReady()?.let { cloud ->
            try {
                cloud.setRecipeModeration(id, hidden, featured, if (delete) true else null)
            } catch (e2: Exception) {
                db.recipes().upsert(updated.copy(dirty = updated.authorId == me?.uid))
            }
        }
        if (hidden == true || delete) {
            deliverNotification(
                e.authorId, NotifType.MODERATION, "🛡️ Tarifiniz moderasyona takıldı",
                "\"${e.title}\" topluluk kurallarına uymadığı için ${if (delete) "kaldırıldı" else "gizlendi"}.", null,
            )
        }
    }

    suspend fun moderateComment(comment: CommentEntity, hide: Boolean, delete: Boolean) = withContext(Dispatchers.IO) {
        if (delete) db.comments().delete(comment.id) else db.comments().upsert(comment.copy(hidden = hide))
        c.sync.cloudReady()?.let { cloud ->
            try {
                if (delete) cloud.deleteComment(comment.recipeId, comment.id) else cloud.setCommentHidden(comment.recipeId, comment.id, hide)
            } catch (e: Exception) {
                // yetki yok
            }
        }
    }

    suspend fun setUserFlags(user: UserEntity, banned: Boolean? = null, admin: Boolean? = null) = withContext(Dispatchers.IO) {
        db.users().upsert(user.copy(banned = banned ?: user.banned, isAdmin = admin ?: user.isAdmin))
        c.sync.cloudReady()?.let { cloud ->
            try {
                cloud.setUserFlags(user.id, banned, admin)
            } catch (e: Exception) {
                // yetki yok
            }
        }
    }

    suspend fun broadcast(title: String, body: String) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        val all = users.value.map { it.id }
        c.sync.cloudReady()?.let { cloud ->
            try {
                cloud.broadcastAnnouncement(title, body, all.filter { !it.startsWith("demo-") && !it.startsWith("local-") })
            } catch (e: Exception) {
                // ağ
            }
        }
        db.notifications().upsert(NotificationEntity(UUID.randomUUID().toString(), s.uid, NotifType.ANNOUNCEMENT, "📣 $title", body, null, System.currentTimeMillis()))
        c.notifier.post(NotifType.ANNOUNCEMENT, "📣 $title", body)
    }
}
