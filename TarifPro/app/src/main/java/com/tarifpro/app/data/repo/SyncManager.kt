package com.tarifpro.app.data.repo

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.firestore.ListenerRegistration
import com.tarifpro.app.AppContainer
import com.tarifpro.app.TarifProApp
import com.tarifpro.app.data.cloud.FirebaseCloud
import com.tarifpro.app.data.local.ChatEntity
import com.tarifpro.app.data.local.CollectionItemEntity
import com.tarifpro.app.data.local.FavoriteEntity
import com.tarifpro.app.data.local.FollowEntity
import com.tarifpro.app.data.local.NotificationEntity
import com.tarifpro.app.data.local.RatingEntity
import com.tarifpro.app.data.local.RecipeEntity
import com.tarifpro.app.data.local.RecipeJson
import com.tarifpro.app.notify.NotifType
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.TimeUnit

enum class SyncState { LOCAL_ONLY, IDLE, SYNCING, OFFLINE, ERROR }

data class SyncStatus(val state: SyncState, val lastSync: Long = 0, val message: String = "")

/**
 * Yerel Room veritabanı (tek doğruluk kaynağı) ile Firestore arasında iki yönlü senkronizasyon.
 * - Değişiklikler önce yerelde "dirty" olarak işaretlenir (çevrimdışı çalışma),
 * - bağlantı olduğunda buluta itilir, uzak değişiklikler gerçek zamanlı dinleyicilerle alınır,
 * - WorkManager her 15 dakikada bir arka planda senkronize eder ve bildirimleri kontrol eder.
 */
class SyncManager(private val c: AppContainer) {
    private val db = c.db
    private val mutex = Mutex()
    private val listeners = mutableListOf<ListenerRegistration>()
    private var pendingJob: Job? = null
    private val prefs = c.context.getSharedPreferences("sync", Context.MODE_PRIVATE)

    private val _status = MutableStateFlow(SyncStatus(SyncState.LOCAL_ONLY))
    val status: StateFlow<SyncStatus> = _status.asStateFlow()

    /** Şu an açık olan sohbet (bu sohbet için bildirim gösterilmez) */
    @Volatile
    var activeChatId: String? = null

    fun cloudReady(): FirebaseCloud? {
        val cloud = c.cloud ?: return null
        val s = c.sessionStore.current ?: return null
        if (!s.isCloud) return null
        val user = cloud.currentUser ?: return null
        return if (user.uid == s.uid) cloud else null
    }

    fun onAppStart() {
        if (cloudReady() == null) {
            _status.value = SyncStatus(SyncState.LOCAL_ONLY, message = "Yerel mod – veriler bu cihazda saklanıyor")
            return
        }
        schedulePeriodic(c.context)
        startListeners()
        requestSync(0)
    }

    fun onSignedIn() {
        schedulePeriodic(c.context)
        startListeners()
        requestSync(0)
    }

    /** Kısa bir gecikmeyle (yazmaları gruplamak için) senkronizasyon ister. */
    fun requestSync(delayMs: Long = 1500) {
        if (cloudReady() == null) return
        pendingJob?.cancel()
        pendingJob = c.scope.launch {
            delay(delayMs)
            syncNow()
        }
    }

    suspend fun syncNow(): Boolean {
        val cloud = cloudReady() ?: return false
        if (!c.online.value) {
            _status.value = SyncStatus(SyncState.OFFLINE, _status.value.lastSync, "Çevrimdışı – değişiklikler bağlantı gelince gönderilecek")
            return false
        }
        return mutex.withLock {
            _status.value = SyncStatus(SyncState.SYNCING, _status.value.lastSync, "Senkronize ediliyor…")
            try {
                push(cloud)
                pull(cloud)
                _status.value = SyncStatus(SyncState.IDLE, System.currentTimeMillis(), "Tüm cihazlarla senkronize")
                true
            } catch (e: Exception) {
                Log.w("SyncManager", "senkronizasyon hatası", e)
                _status.value = SyncStatus(SyncState.ERROR, _status.value.lastSync, e.message ?: "Senkronizasyon hatası")
                false
            }
        }
    }

    private suspend fun push(cloud: FirebaseCloud) {
        val uid = c.sessionStore.current?.uid ?: return
        // Tarifler (+ fotoğraflar)
        for (e in db.recipes().dirty()) {
            if (e.authorId.startsWith("demo-")) {
                db.recipes().markClean(e.id, e.updatedAt); continue
            }
            if (e.authorId != uid) continue
            var entity = e
            val newImage = c.images.uploadIfLocal(e.image, uid) ?: e.image
            val steps = RecipeJson.stepsFromJson(e.stepsJson)
            var stepsChanged = false
            val newSteps = steps.map { st ->
                val img = st.image
                if (img != null && c.images.isLocal(img)) {
                    stepsChanged = true
                    st.copy(image = c.images.uploadIfLocal(img, uid))
                } else st
            }
            if (newImage != e.image || stepsChanged) {
                entity = e.copy(image = newImage, stepsJson = if (stepsChanged) RecipeJson.stepsToJson(newSteps) else e.stepsJson)
                db.recipes().upsert(entity)
            }
            cloud.pushRecipe(entity)
            db.recipes().markClean(entity.id, entity.updatedAt)
        }
        // Yorumlar
        for (cm in db.comments().dirty()) {
            if (cm.recipeId.startsWith("seed-")) {
                db.comments().upsert(cm.copy(dirty = false)); continue
            }
            cloud.pushComment(cm)
            db.comments().upsert(cm.copy(dirty = false))
        }
        // Puanlar
        for (r in db.ratings().dirty()) {
            if (r.recipeId.startsWith("seed-")) {
                db.ratings().upsert(r.copy(dirty = false)); continue
            }
            val (avg, count) = cloud.pushRating(r)
            db.ratings().upsert(r.copy(dirty = false))
            db.recipes().updateRating(r.recipeId, avg, count)
        }
        // Takip
        for (f in db.follows().dirty()) {
            if (f.followerId != uid || f.followeeId.startsWith("demo-")) {
                db.follows().upsert(f.copy(dirty = false)); continue
            }
            cloud.setFollow(f.followerId, f.followeeId, !f.deleted)
            db.follows().upsert(f.copy(dirty = false))
        }
        // Favoriler
        for (f in db.favorites().dirty()) {
            if (f.userId != uid) continue
            cloud.setFavorite(uid, f.recipeId, !f.deleted)
            db.favorites().upsert(f.copy(dirty = false))
        }
        // Defterler
        for (col in db.collections().dirty()) {
            if (col.ownerId != uid) continue
            cloud.pushCollection(col, db.collections().items(col.id).map { it.recipeId })
            db.collections().upsert(col.copy(dirty = false))
        }
        // Mesajlar
        for (m in db.chats().dirtyMessages()) {
            if (m.senderId != uid) continue
            val chat = db.chats().get(m.chatId)
            if (chat != null && chat.membersCsv.split(',').any { it.startsWith("demo-") }) {
                db.chats().upsertMessage(m.copy(dirty = false)); continue
            }
            if (chat != null && chat.kind == "DM") cloud.upsertChat(chat.copy(title = ""))
            cloud.sendMessage(m)
            db.chats().upsertMessage(m.copy(dirty = false))
        }
        // Şikayetler
        for (r in db.reports().dirty()) {
            cloud.pushReport(r)
            db.reports().upsert(r.copy(dirty = false))
        }
    }

    private suspend fun mergeRemoteRecipes(remote: List<RecipeEntity>) {
        if (remote.isEmpty()) return
        val local = db.recipes().all().associateBy { it.id }
        val toWrite = remote.filter { r ->
            val l = local[r.id]
            l == null || !l.dirty || l.updatedAt < r.updatedAt
        }
        db.recipes().upsertAll(toWrite)
    }

    private suspend fun pull(cloud: FirebaseCloud) {
        val uid = c.sessionStore.current?.uid ?: return
        // Takip edilenler
        val following = cloud.fetchFollowing(uid)
        val localFollows = db.follows().dirty().map { it.followeeId }.toSet()
        db.follows().upsertAll(following.filter { it !in localFollows }.map { FollowEntity(uid, it, System.currentTimeMillis()) })
        // Tarifler: herkese açık + benimkiler + takip ettiklerimin takipçilere özel tarifleri
        val remote = mutableListOf<RecipeEntity>()
        remote += cloud.fetchPublicRecipes()
        remote += cloud.fetchRecipesBy(uid)
        for (f in following.take(40)) {
            try {
                remote += cloud.fetchFollowersOnlyRecipes(f)
            } catch (e: Exception) {
                // izin yoksa geç
            }
        }
        mergeRemoteRecipes(remote.distinctBy { it.id })
        // Favoriler
        val favs = cloud.fetchFavorites(uid)
        val dirtyFavs = db.favorites().dirty().map { it.recipeId }.toSet()
        db.favorites().upsertAll(favs.filter { it.first !in dirtyFavs }.map { FavoriteEntity(uid, it.first, it.second) })
        // Defterler
        val dirtyCols = db.collections().dirty().map { it.id }.toSet()
        for ((col, ids) in cloud.fetchCollections(uid)) {
            if (col.id in dirtyCols) continue
            db.collections().upsert(col)
            db.collections().clearItems(col.id)
            ids.forEachIndexed { i, rid -> db.collections().addItem(CollectionItemEntity(col.id, rid, col.updatedAt - i)) }
        }
        // Kullanıcılar (şef keşfi)
        db.users().upsertAll(cloud.fetchUsers().map { remoteUser ->
            val local = db.users().get(remoteUser.id)
            if (local != null && local.updatedAt > remoteUser.updatedAt) local else remoteUser
        })
        // Sohbetler
        ensureChannels(cloud)
        val chats = cloud.fetchChats(uid) { 0L }
        db.chats().upsertAll(chats.map { chat ->
            val local = db.chats().get(chat.id)
            chat.copy(readAt = local?.readAt ?: 0L, title = if (chat.kind == "DM") (local?.title ?: chat.title) else chat.title)
        })
        // Bildirim kutusu
        handleInbox(cloud.fetchInbox(uid), uid)
    }

    private val defaultChannels = listOf(
        Triple("ch_genel", "Genel Mutfak", "👩‍🍳"),
        Triple("ch_tatli", "Tatlı Severler", "🍰"),
        Triple("ch_hamur", "Hamur İşi Ustaları", "🥐"),
        Triple("ch_fit", "Fit Mutfak", "🥗"),
        Triple("ch_ege", "Ege & Akdeniz Sofrası", "🫒"),
    )

    private suspend fun ensureChannels(cloud: FirebaseCloud) {
        if (prefs.getBoolean("channelsEnsured", false)) return
        val existing = cloud.fetchChats(c.sessionStore.current?.uid ?: return) { 0L }.map { it.id }.toSet()
        for ((id, title, emoji) in defaultChannels) {
            if (id !in existing) {
                cloud.upsertChat(ChatEntity(id, "CHANNEL", title, emoji, "", "Kanal oluşturuldu", System.currentTimeMillis(), "", 0))
            }
        }
        prefs.edit().putBoolean("channelsEnsured", true).apply()
    }

    /** Bildirim kutusundaki yeni kayıtları yerel veritabanına alır ve tercihlere göre bildirim gösterir. */
    private suspend fun handleInbox(list: List<NotificationEntity>, uid: String) {
        val seenAt = prefs.getLong("inboxSeenAt_$uid", -1L)
        var maxSeen = seenAt
        for (n in list) {
            val existing = db.notifications().get(n.id)
            if (existing == null) {
                db.notifications().upsert(n)
                if (seenAt >= 0 && n.createdAt > seenAt) c.notifier.post(n.type, n.title, n.body, n.route, n.id.hashCode())
            }
            if (n.createdAt > maxSeen) maxSeen = n.createdAt
        }
        if (seenAt < 0) maxSeen = maxOf(maxSeen, System.currentTimeMillis())
        prefs.edit().putLong("inboxSeenAt_$uid", maxSeen).apply()
    }

    fun startListeners() {
        val cloud = cloudReady() ?: return
        stopListeners()
        val uid = c.sessionStore.current?.uid ?: return
        listeners += cloud.listenPublicRecipes { list -> c.scope.launch { mergeRemoteRecipes(list) } }
        listeners += cloud.listenInbox(uid) { list -> c.scope.launch { handleInbox(list, uid) } }
        listeners += cloud.listenChats(uid, { 0L }) { list ->
            c.scope.launch {
                for (chat in list) {
                    val local = db.chats().get(chat.id)
                    val merged = chat.copy(readAt = local?.readAt ?: 0L, title = if (chat.kind == "DM") (local?.title ?: chat.title) else chat.title)
                    db.chats().upsert(merged)
                    val isNew = local == null || chat.lastAt > local.lastAt
                    if (isNew && local != null && chat.lastSenderId != uid && chat.lastSenderId.isNotEmpty() && chat.id != activeChatId) {
                        val type = if (chat.kind == "CHANNEL") NotifType.CHANNEL else NotifType.MESSAGE
                        val title = if (chat.kind == "CHANNEL") "${chat.emoji} ${chat.title}" else "💬 Yeni mesaj"
                        c.notifier.post(type, title, chat.lastMessage, "chat/${chat.id}", chat.id.hashCode())
                    }
                }
            }
        }
    }

    fun stopListeners() {
        listeners.forEach { it.remove() }
        listeners.clear()
    }

    /** Açık tarif detayında yorumları gerçek zamanlı dinler. Dönen fonksiyon dinlemeyi durdurur. */
    fun listenComments(recipeId: String): () -> Unit {
        val cloud = cloudReady() ?: return {}
        if (recipeId.startsWith("seed-")) return {}
        val reg = cloud.listenComments(recipeId) { list ->
            c.scope.launch {
                val dirty = db.comments().dirty().map { it.id }.toSet()
                db.comments().upsertAll(list.filter { it.id !in dirty })
            }
        }
        c.scope.launch {
            try {
                val ratings = cloud.fetchRatings(recipeId)
                db.ratings().upsertAll(ratings.filter { r -> db.ratings().dirty().none { it.recipeId == r.recipeId && it.userId == r.userId } }
                    .map { RatingEntity(it.recipeId, it.userId, it.stars, it.updatedAt) })
            } catch (e: Exception) {
                // ağ
            }
        }
        return { reg.remove() }
    }

    fun listenMessages(chatId: String): () -> Unit {
        val cloud = cloudReady() ?: return {}
        val reg = cloud.listenMessages(chatId) { list ->
            c.scope.launch {
                val dirty = db.chats().dirtyMessages().map { it.id }.toSet()
                db.chats().upsertMessages(list.filter { it.id !in dirty })
            }
        }
        return { reg.remove() }
    }

    companion object {
        fun schedulePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("tarifpro-sync", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as TarifProApp
        return if (app.container.sync.cloudReady() == null) Result.success()
        else if (app.container.sync.syncNow()) Result.success() else Result.retry()
    }
}
