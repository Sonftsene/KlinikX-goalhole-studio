package com.tarifpro.app.data.cloud

import android.content.Context
import android.util.Base64
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.tarifpro.app.data.CloudConfig
import com.tarifpro.app.data.local.ChatEntity
import com.tarifpro.app.data.local.CollectionEntity
import com.tarifpro.app.data.local.CommentEntity
import com.tarifpro.app.data.local.MessageEntity
import com.tarifpro.app.data.local.NotificationEntity
import com.tarifpro.app.data.local.RatingEntity
import com.tarifpro.app.data.local.RecipeEntity
import com.tarifpro.app.data.local.ReportEntity
import com.tarifpro.app.data.local.UserEntity
import com.tarifpro.app.domain.TurkishText
import kotlinx.coroutines.tasks.await
import java.util.UUID

/**
 * Firebase Auth + Firestore köprüsü. Firestore'un kendi çevrimdışı önbelleği açıktır;
 * yazmalar internet yokken kuyruğa alınır ve bağlantı gelince otomatik gönderilir.
 *
 * Koleksiyon şeması:
 *  users/{uid}                     profil
 *  users/{uid}/followers/{uid}     takipçiler
 *  users/{uid}/following/{uid}     takip edilenler
 *  users/{uid}/favorites/{rid}     favoriler (özel)
 *  users/{uid}/collections/{cid}   yemek defterleri (özel)
 *  users/{uid}/inbox/{nid}         bildirim kutusu
 *  recipes/{rid}                   tarifler (+ comments, ratings alt koleksiyonları)
 *  images/{id}                     sıkıştırılmış fotoğraflar (base64, ücretsiz planla uyumlu)
 *  chats/{cid}/messages/{mid}      özel sohbetler ve topluluk kanalları
 *  reports/{id}                    moderasyon şikayetleri
 *  meta/admins                     yönetici listesi
 */
class FirebaseCloud private constructor(val config: CloudConfig, app: FirebaseApp) {
    val auth: FirebaseAuth = FirebaseAuth.getInstance(app)
    val db: FirebaseFirestore = FirebaseFirestore.getInstance(app)

    val currentUser: FirebaseUser? get() = auth.currentUser

    companion object {
        private const val TAG = "FirebaseCloud"

        fun init(context: Context, config: CloudConfig): FirebaseCloud? {
            if (!config.isConfigured) return null
            return try {
                val existing = FirebaseApp.getApps(context).firstOrNull { it.name == FirebaseApp.DEFAULT_APP_NAME }
                val app = existing ?: FirebaseApp.initializeApp(
                    context,
                    FirebaseOptions.Builder()
                        .setApiKey(config.apiKey)
                        .setApplicationId(config.appId)
                        .setProjectId(config.projectId)
                        .setStorageBucket("${config.projectId}.appspot.com")
                        .build(),
                )
                FirebaseCloud(config, app)
            } catch (e: Exception) {
                Log.w(TAG, "Firebase başlatılamadı", e)
                null
            }
        }
    }

    // ---------- Kimlik ----------

    suspend fun signInWithGoogleIdToken(idToken: String): FirebaseUser {
        val result = auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null)).await()
        return result.user ?: error("Google oturumu açılamadı")
    }

    fun signOut() = auth.signOut()

    // ---------- Kullanıcılar ----------

    private fun userFrom(d: DocumentSnapshot): UserEntity? {
        if (!d.exists()) return null
        return UserEntity(
            id = d.id,
            name = d.getString("name") ?: "Şef",
            email = d.getString("email") ?: "",
            photo = d.getString("photo"),
            bio = d.getString("bio") ?: "",
            isAdmin = d.getBoolean("isAdmin") ?: false,
            banned = d.getBoolean("banned") ?: false,
            isDemo = false,
            followers = (d.getLong("followers") ?: 0L).toInt(),
            following = (d.getLong("following") ?: 0L).toInt(),
            updatedAt = d.getLong("updatedAt") ?: 0L,
        )
    }

    suspend fun upsertUser(u: UserEntity) {
        db.collection("users").document(u.id).set(
            mapOf(
                "name" to u.name,
                "nameLower" to TurkishText.fold(u.name),
                "email" to u.email,
                "photo" to u.photo,
                "bio" to u.bio,
                "updatedAt" to System.currentTimeMillis(),
            ),
            SetOptions.merge(),
        ).await()
    }

    suspend fun fetchUser(id: String): UserEntity? = userFrom(db.collection("users").document(id).get().await())

    suspend fun fetchUsers(limit: Long = 200): List<UserEntity> =
        db.collection("users").limit(limit).get().await().documents.mapNotNull { userFrom(it) }

    suspend fun setUserFlags(uid: String, banned: Boolean? = null, isAdmin: Boolean? = null) {
        val m = mutableMapOf<String, Any>()
        banned?.let { m["banned"] = it }
        isAdmin?.let { m["isAdmin"] = it }
        if (m.isEmpty()) return
        db.collection("users").document(uid).set(m, SetOptions.merge()).await()
        if (isAdmin != null) {
            db.collection("meta").document("admins").set(
                mapOf("uids" to if (isAdmin) FieldValue.arrayUnion(uid) else FieldValue.arrayRemove(uid)),
                SetOptions.merge(),
            ).await()
        }
    }

    /** Yönetici mi? meta/admins yoksa ilk giriş yapan kullanıcı yönetici olarak atanır. */
    suspend fun resolveAdmin(uid: String, email: String): Boolean {
        if (email.lowercase() in config.adminEmails) return true
        val ref = db.collection("meta").document("admins")
        val snap = ref.get().await()
        if (!snap.exists()) {
            ref.set(mapOf("uids" to listOf(uid), "createdAt" to System.currentTimeMillis())).await()
            db.collection("users").document(uid).set(mapOf("isAdmin" to true), SetOptions.merge()).await()
            return true
        }
        @Suppress("UNCHECKED_CAST")
        val uids = snap.get("uids") as? List<String> ?: emptyList()
        return uid in uids
    }

    // ---------- Tarifler ----------

    private fun recipeToMap(e: RecipeEntity): Map<String, Any?> = mapOf(
        "authorId" to e.authorId,
        "authorName" to e.authorName,
        "authorPhoto" to e.authorPhoto,
        "title" to e.title,
        "titleLower" to TurkishText.fold(e.title),
        "description" to e.description,
        "tagline" to e.tagline,
        "category" to e.category,
        "cuisine" to e.cuisine,
        "difficulty" to e.difficulty,
        "servings" to e.servings,
        "prepMinutes" to e.prepMinutes,
        "cookMinutes" to e.cookMinutes,
        "restMinutes" to e.restMinutes,
        "templateId" to e.templateId,
        "visibility" to e.visibility,
        "image" to e.image,
        "ingredientsJson" to e.ingredientsJson,
        "stepsJson" to e.stepsJson,
        "tipsJson" to e.tipsJson,
        "tagsJson" to e.tagsJson,
        "kcalPerServing" to e.kcalPerServing,
        "createdAt" to e.createdAt,
        "updatedAt" to e.updatedAt,
        "hidden" to e.hidden,
        "featured" to e.featured,
        "sourceUrl" to e.sourceUrl,
        "deleted" to e.deleted,
    )

    private fun recipeFrom(d: DocumentSnapshot): RecipeEntity? {
        if (!d.exists()) return null
        return RecipeEntity(
            id = d.id,
            authorId = d.getString("authorId") ?: return null,
            authorName = d.getString("authorName") ?: "Şef",
            authorPhoto = d.getString("authorPhoto"),
            title = d.getString("title") ?: "Tarif",
            description = d.getString("description") ?: "",
            tagline = d.getString("tagline") ?: "",
            category = d.getString("category") ?: "Ana Yemek",
            cuisine = d.getString("cuisine") ?: "Türk",
            difficulty = (d.getLong("difficulty") ?: 2L).toInt(),
            servings = (d.getLong("servings") ?: 4L).toInt(),
            prepMinutes = (d.getLong("prepMinutes") ?: 0L).toInt(),
            cookMinutes = (d.getLong("cookMinutes") ?: 0L).toInt(),
            restMinutes = (d.getLong("restMinutes") ?: 0L).toInt(),
            templateId = d.getString("templateId") ?: "pastane",
            visibility = d.getString("visibility") ?: "PUBLIC",
            image = d.getString("image") ?: "illu:dessert",
            ingredientsJson = d.getString("ingredientsJson") ?: "[]",
            stepsJson = d.getString("stepsJson") ?: "[]",
            tipsJson = d.getString("tipsJson") ?: "[]",
            tagsJson = d.getString("tagsJson") ?: "[]",
            kcalPerServing = (d.getLong("kcalPerServing") ?: 0L).toInt(),
            ratingAvg = d.getDouble("ratingAvg") ?: 0.0,
            ratingCount = (d.getLong("ratingCount") ?: 0L).toInt(),
            createdAt = d.getLong("createdAt") ?: 0L,
            updatedAt = d.getLong("updatedAt") ?: 0L,
            hidden = d.getBoolean("hidden") ?: false,
            featured = d.getBoolean("featured") ?: false,
            sourceUrl = d.getString("sourceUrl"),
            dirty = false,
            deleted = d.getBoolean("deleted") ?: false,
        )
    }

    suspend fun pushRecipe(e: RecipeEntity) {
        db.collection("recipes").document(e.id).set(recipeToMap(e), SetOptions.merge()).await()
    }

    suspend fun fetchPublicRecipes(limit: Long = 400): List<RecipeEntity> =
        db.collection("recipes").whereEqualTo("visibility", "PUBLIC").limit(limit).get().await()
            .documents.mapNotNull { recipeFrom(it) }

    suspend fun fetchRecipesBy(authorId: String): List<RecipeEntity> =
        db.collection("recipes").whereEqualTo("authorId", authorId).get().await().documents.mapNotNull { recipeFrom(it) }

    suspend fun fetchFollowersOnlyRecipes(authorId: String): List<RecipeEntity> =
        db.collection("recipes").whereEqualTo("authorId", authorId).whereEqualTo("visibility", "FOLLOWERS")
            .get().await().documents.mapNotNull { recipeFrom(it) }

    fun listenPublicRecipes(onChange: (List<RecipeEntity>) -> Unit): ListenerRegistration =
        db.collection("recipes").whereEqualTo("visibility", "PUBLIC").limit(400)
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                onChange(snap.documents.mapNotNull { recipeFrom(it) })
            }

    suspend fun setRecipeModeration(id: String, hidden: Boolean? = null, featured: Boolean? = null, deleted: Boolean? = null) {
        val m = mutableMapOf<String, Any>("updatedAt" to System.currentTimeMillis())
        hidden?.let { m["hidden"] = it }
        featured?.let { m["featured"] = it }
        deleted?.let { m["deleted"] = it }
        db.collection("recipes").document(id).set(m, SetOptions.merge()).await()
    }

    // ---------- Fotoğraflar ----------

    suspend fun uploadImage(jpeg: ByteArray, ownerId: String): String {
        val id = UUID.randomUUID().toString()
        val b64 = Base64.encodeToString(jpeg, Base64.NO_WRAP)
        require(b64.length < 900_000) { "Fotoğraf çok büyük" }
        db.collection("images").document(id).set(
            mapOf("data" to b64, "ownerId" to ownerId, "createdAt" to System.currentTimeMillis()),
        ).await()
        return "fsimg:$id"
    }

    suspend fun downloadImage(id: String): ByteArray? {
        val d = db.collection("images").document(id).get().await()
        val data = d.getString("data") ?: return null
        return Base64.decode(data, Base64.DEFAULT)
    }

    // ---------- Yorum ve puan ----------

    private fun commentFrom(recipeId: String, d: DocumentSnapshot): CommentEntity? {
        if (!d.exists()) return null
        return CommentEntity(
            id = d.id,
            recipeId = recipeId,
            authorId = d.getString("authorId") ?: "",
            authorName = d.getString("authorName") ?: "Şef",
            authorPhoto = d.getString("authorPhoto"),
            text = d.getString("text") ?: "",
            rating = (d.getLong("rating") ?: 0L).toInt(),
            createdAt = d.getLong("createdAt") ?: 0L,
            hidden = d.getBoolean("hidden") ?: false,
        )
    }

    suspend fun pushComment(c: CommentEntity) {
        db.collection("recipes").document(c.recipeId).collection("comments").document(c.id).set(
            mapOf(
                "authorId" to c.authorId, "authorName" to c.authorName, "authorPhoto" to c.authorPhoto,
                "text" to c.text, "rating" to c.rating, "createdAt" to c.createdAt, "hidden" to c.hidden,
            ),
        ).await()
    }

    suspend fun setCommentHidden(recipeId: String, commentId: String, hidden: Boolean) {
        db.collection("recipes").document(recipeId).collection("comments").document(commentId)
            .set(mapOf("hidden" to hidden), SetOptions.merge()).await()
    }

    suspend fun deleteComment(recipeId: String, commentId: String) {
        db.collection("recipes").document(recipeId).collection("comments").document(commentId).delete().await()
    }

    suspend fun fetchComments(recipeId: String): List<CommentEntity> =
        db.collection("recipes").document(recipeId).collection("comments")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(200).get().await()
            .documents.mapNotNull { commentFrom(recipeId, it) }

    fun listenComments(recipeId: String, onChange: (List<CommentEntity>) -> Unit): ListenerRegistration =
        db.collection("recipes").document(recipeId).collection("comments")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(200)
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                onChange(snap.documents.mapNotNull { commentFrom(recipeId, it) })
            }

    /** Puanı yazar ve tarifin ortalamasını yeniden hesaplar. */
    suspend fun pushRating(r: RatingEntity): Pair<Double, Int> {
        val ratings = db.collection("recipes").document(r.recipeId).collection("ratings")
        ratings.document(r.userId).set(mapOf("stars" to r.stars, "updatedAt" to r.updatedAt)).await()
        val all = ratings.get().await().documents.mapNotNull { it.getLong("stars")?.toInt() }
        val avg = if (all.isEmpty()) 0.0 else all.average()
        db.collection("recipes").document(r.recipeId)
            .set(mapOf("ratingAvg" to avg, "ratingCount" to all.size), SetOptions.merge()).await()
        return avg to all.size
    }

    suspend fun fetchRatings(recipeId: String): List<RatingEntity> =
        db.collection("recipes").document(recipeId).collection("ratings").get().await().documents.map {
            RatingEntity(recipeId, it.id, (it.getLong("stars") ?: 0L).toInt(), it.getLong("updatedAt") ?: 0L)
        }

    // ---------- Takip ----------

    suspend fun setFollow(followerId: String, followeeId: String, follow: Boolean) {
        val now = System.currentTimeMillis()
        val followerRef = db.collection("users").document(followeeId).collection("followers").document(followerId)
        val followingRef = db.collection("users").document(followerId).collection("following").document(followeeId)
        if (follow) {
            followerRef.set(mapOf("createdAt" to now)).await()
            followingRef.set(mapOf("createdAt" to now)).await()
        } else {
            followerRef.delete().await()
            followingRef.delete().await()
        }
        val delta = if (follow) 1L else -1L
        db.collection("users").document(followeeId).set(mapOf("followers" to FieldValue.increment(delta)), SetOptions.merge()).await()
        db.collection("users").document(followerId).set(mapOf("following" to FieldValue.increment(delta)), SetOptions.merge()).await()
    }

    suspend fun fetchFollowing(uid: String): List<String> =
        db.collection("users").document(uid).collection("following").get().await().documents.map { it.id }

    suspend fun fetchFollowers(uid: String): List<String> =
        db.collection("users").document(uid).collection("followers").get().await().documents.map { it.id }

    // ---------- Favoriler ve defterler ----------

    suspend fun setFavorite(uid: String, recipeId: String, favorite: Boolean) {
        val ref = db.collection("users").document(uid).collection("favorites").document(recipeId)
        if (favorite) ref.set(mapOf("addedAt" to System.currentTimeMillis())).await() else ref.delete().await()
    }

    suspend fun fetchFavorites(uid: String): List<Pair<String, Long>> =
        db.collection("users").document(uid).collection("favorites").get().await().documents.map {
            it.id to (it.getLong("addedAt") ?: 0L)
        }

    suspend fun pushCollection(c: CollectionEntity, recipeIds: List<String>) {
        val ref = db.collection("users").document(c.ownerId).collection("collections").document(c.id)
        if (c.deleted) {
            ref.delete().await(); return
        }
        ref.set(
            mapOf(
                "name" to c.name, "description" to c.description, "emoji" to c.emoji, "color" to c.color,
                "createdAt" to c.createdAt, "updatedAt" to c.updatedAt, "recipeIds" to recipeIds,
            ),
        ).await()
    }

    suspend fun fetchCollections(uid: String): List<Pair<CollectionEntity, List<String>>> =
        db.collection("users").document(uid).collection("collections").get().await().documents.map { d ->
            @Suppress("UNCHECKED_CAST")
            val ids = d.get("recipeIds") as? List<String> ?: emptyList()
            CollectionEntity(
                id = d.id, ownerId = uid, name = d.getString("name") ?: "Defter",
                description = d.getString("description") ?: "", emoji = d.getString("emoji") ?: "📒",
                color = (d.getLong("color") ?: 0L).toInt(), createdAt = d.getLong("createdAt") ?: 0L,
                updatedAt = d.getLong("updatedAt") ?: 0L,
            ) to ids
        }

    // ---------- Sohbet ----------

    private fun chatFrom(d: DocumentSnapshot, readAt: Long): ChatEntity? {
        if (!d.exists()) return null
        @Suppress("UNCHECKED_CAST")
        val members = d.get("members") as? List<String> ?: emptyList()
        return ChatEntity(
            id = d.id,
            kind = d.getString("kind") ?: "DM",
            title = d.getString("title") ?: "",
            emoji = d.getString("emoji") ?: "💬",
            membersCsv = members.joinToString(","),
            lastMessage = d.getString("lastMessage") ?: "",
            lastAt = d.getLong("lastAt") ?: 0L,
            lastSenderId = d.getString("lastSenderId") ?: "",
            readAt = readAt,
        )
    }

    suspend fun upsertChat(c: ChatEntity) {
        db.collection("chats").document(c.id).set(
            mapOf(
                "kind" to c.kind, "title" to c.title, "emoji" to c.emoji,
                "members" to c.membersCsv.split(',').filter { it.isNotBlank() },
                "lastMessage" to c.lastMessage, "lastAt" to c.lastAt, "lastSenderId" to c.lastSenderId,
            ),
            SetOptions.merge(),
        ).await()
    }

    fun listenChats(uid: String, readAtOf: (String) -> Long, onChange: (List<ChatEntity>) -> Unit): List<ListenerRegistration> {
        val dm = db.collection("chats").whereArrayContains("members", uid).addSnapshotListener { snap, err ->
            if (err != null || snap == null) return@addSnapshotListener
            onChange(snap.documents.mapNotNull { chatFrom(it, readAtOf(it.id)) })
        }
        val channels = db.collection("chats").whereEqualTo("kind", "CHANNEL").addSnapshotListener { snap, err ->
            if (err != null || snap == null) return@addSnapshotListener
            onChange(snap.documents.mapNotNull { chatFrom(it, readAtOf(it.id)) })
        }
        return listOf(dm, channels)
    }

    suspend fun fetchChats(uid: String, readAtOf: (String) -> Long): List<ChatEntity> {
        val dm = db.collection("chats").whereArrayContains("members", uid).get().await().documents
        val ch = db.collection("chats").whereEqualTo("kind", "CHANNEL").get().await().documents
        return (dm + ch).mapNotNull { chatFrom(it, readAtOf(it.id)) }.distinctBy { it.id }
    }

    private fun messageFrom(chatId: String, d: DocumentSnapshot): MessageEntity? {
        if (!d.exists()) return null
        return MessageEntity(
            id = d.id, chatId = chatId,
            senderId = d.getString("senderId") ?: "",
            senderName = d.getString("senderName") ?: "",
            senderPhoto = d.getString("senderPhoto"),
            text = d.getString("text") ?: "",
            recipeId = d.getString("recipeId"),
            recipeTitle = d.getString("recipeTitle"),
            recipeImage = d.getString("recipeImage"),
            createdAt = d.getLong("createdAt") ?: 0L,
        )
    }

    suspend fun sendMessage(m: MessageEntity) {
        db.collection("chats").document(m.chatId).collection("messages").document(m.id).set(
            mapOf(
                "senderId" to m.senderId, "senderName" to m.senderName, "senderPhoto" to m.senderPhoto,
                "text" to m.text, "recipeId" to m.recipeId, "recipeTitle" to m.recipeTitle,
                "recipeImage" to m.recipeImage, "createdAt" to m.createdAt,
            ),
        ).await()
        val preview = if (m.recipeId != null) "📖 ${m.recipeTitle ?: "Tarif kartı"}" else m.text
        db.collection("chats").document(m.chatId).set(
            mapOf("lastMessage" to preview.take(120), "lastAt" to m.createdAt, "lastSenderId" to m.senderId),
            SetOptions.merge(),
        ).await()
    }

    suspend fun deleteMessage(chatId: String, id: String) {
        db.collection("chats").document(chatId).collection("messages").document(id).delete().await()
    }

    fun listenMessages(chatId: String, onChange: (List<MessageEntity>) -> Unit): ListenerRegistration =
        db.collection("chats").document(chatId).collection("messages")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(300)
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                onChange(snap.documents.mapNotNull { messageFrom(chatId, it) })
            }

    // ---------- Bildirim kutusu ----------

    suspend fun sendInbox(toUid: String, n: NotificationEntity) {
        db.collection("users").document(toUid).collection("inbox").document(n.id).set(
            mapOf("type" to n.type, "title" to n.title, "body" to n.body, "route" to n.route, "createdAt" to n.createdAt),
        ).await()
    }

    fun listenInbox(uid: String, onChange: (List<NotificationEntity>) -> Unit): ListenerRegistration =
        db.collection("users").document(uid).collection("inbox")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(100)
            .addSnapshotListener { snap, err ->
                if (err != null || snap == null) return@addSnapshotListener
                onChange(
                    snap.documents.map { d ->
                        NotificationEntity(
                            id = d.id, userId = uid, type = d.getString("type") ?: "info",
                            title = d.getString("title") ?: "", body = d.getString("body") ?: "",
                            route = d.getString("route"), createdAt = d.getLong("createdAt") ?: 0L,
                        )
                    },
                )
            }

    suspend fun fetchInbox(uid: String): List<NotificationEntity> =
        db.collection("users").document(uid).collection("inbox")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(100).get().await().documents.map { d ->
                NotificationEntity(
                    id = d.id, userId = uid, type = d.getString("type") ?: "info",
                    title = d.getString("title") ?: "", body = d.getString("body") ?: "",
                    route = d.getString("route"), createdAt = d.getLong("createdAt") ?: 0L,
                )
            }

    // ---------- Moderasyon ----------

    suspend fun pushReport(r: ReportEntity) {
        db.collection("reports").document(r.id).set(
            mapOf(
                "targetType" to r.targetType, "targetId" to r.targetId, "targetTitle" to r.targetTitle,
                "reason" to r.reason, "reporterId" to r.reporterId, "reporterName" to r.reporterName,
                "createdAt" to r.createdAt, "status" to r.status,
            ),
            SetOptions.merge(),
        ).await()
    }

    suspend fun fetchReports(): List<ReportEntity> =
        db.collection("reports").limit(300).get().await().documents.map { d ->
            ReportEntity(
                id = d.id, targetType = d.getString("targetType") ?: "RECIPE", targetId = d.getString("targetId") ?: "",
                targetTitle = d.getString("targetTitle") ?: "", reason = d.getString("reason") ?: "",
                reporterId = d.getString("reporterId") ?: "", reporterName = d.getString("reporterName") ?: "",
                createdAt = d.getLong("createdAt") ?: 0L, status = d.getString("status") ?: "OPEN",
            )
        }

    suspend fun broadcastAnnouncement(title: String, body: String, userIds: List<String>) {
        val now = System.currentTimeMillis()
        val batch = db.batch()
        userIds.take(450).forEach { uid ->
            val ref = db.collection("users").document(uid).collection("inbox").document(UUID.randomUUID().toString())
            batch.set(ref, mapOf("type" to "announcement", "title" to title, "body" to body, "route" to null, "createdAt" to now))
        }
        batch.commit().await()
    }
}
