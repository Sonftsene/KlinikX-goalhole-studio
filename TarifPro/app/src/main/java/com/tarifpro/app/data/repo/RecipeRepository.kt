package com.tarifpro.app.data.repo

import com.tarifpro.app.AppContainer
import com.tarifpro.app.data.Session
import com.tarifpro.app.data.local.CollectionEntity
import com.tarifpro.app.data.local.CollectionItemEntity
import com.tarifpro.app.data.local.CommentEntity
import com.tarifpro.app.data.local.CookProgressEntity
import com.tarifpro.app.data.local.FavoriteEntity
import com.tarifpro.app.data.local.FollowEntity
import com.tarifpro.app.data.local.NotificationEntity
import com.tarifpro.app.data.local.RatingEntity
import com.tarifpro.app.data.local.ReportEntity
import com.tarifpro.app.data.local.ShoppingItemEntity
import com.tarifpro.app.data.local.toDomain
import com.tarifpro.app.data.local.toEntity
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.NutritionReport
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Scaler
import com.tarifpro.app.domain.SearchDoc
import com.tarifpro.app.domain.SearchEngine
import com.tarifpro.app.domain.Visibility
import com.tarifpro.app.notify.NotifType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class CollectionInfo(val entity: CollectionEntity, val recipeIds: List<String>)

@OptIn(ExperimentalCoroutinesApi::class)
class RecipeRepository(private val c: AppContainer) {
    private val db = c.db
    private val me: Session? get() = c.sessionStore.current

    val follows: StateFlow<List<FollowEntity>> =
        db.follows().observeAll().stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    /** Oturumdaki kullanıcının görebileceği tarifler (gizlilik ve moderasyon kurallarına göre). */
    val visibleRecipes: StateFlow<List<Recipe>> = combine(
        db.recipes().observeAll(), c.sessionStore.session, follows,
    ) { list, session, followList ->
        val uid = session?.uid
        val admin = session?.isAdmin == true
        val followed = followList.filter { it.followerId == uid }.map { it.followeeId }.toSet()
        list.asSequence().filter { e ->
            if (e.deleted) return@filter false
            if (e.authorId == uid) return@filter true
            if (e.hidden && !admin) return@filter false
            when (e.visibility) {
                Visibility.PUBLIC.name -> true
                Visibility.FOLLOWERS.name -> e.authorId in followed
                else -> false
            }
        }.map { it.toDomain() }.toList()
    }.flowOn(Dispatchers.Default).stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    private val reportCache = ConcurrentHashMap<String, Pair<Long, NutritionReport>>()

    fun nutrition(recipe: Recipe): NutritionReport {
        val cached = reportCache[recipe.id]
        if (cached != null && cached.first == recipe.updatedAt) return cached.second
        val r = NutritionCalculator.analyze(recipe)
        reportCache[recipe.id] = recipe.updatedAt to r
        return r
    }

    fun healthTags(recipe: Recipe): List<String> =
        NutritionCalculator.healthTags(nutrition(recipe)).filter { it.positive }.map { it.label }

    /** Hızlı arama motoru: görünür tarifler her değiştiğinde ters indeks yeniden kurulur. */
    val searchEngine: StateFlow<SearchEngine> = visibleRecipes.map { list ->
        SearchEngine(
            list.map { r ->
                val rep = nutrition(r)
                SearchDoc(
                    id = r.id, title = r.title, description = r.description + " " + r.tagline, tags = r.tags,
                    ingredientNames = r.ingredients.map { it.name }, author = r.authorName, category = r.category,
                    cuisine = r.cuisine, difficulty = r.difficulty, kcalPerServing = rep.perServing.kcal.toInt(),
                    totalMinutes = r.totalMinutes, rating = r.ratingAvg, ratingCount = r.ratingCount, createdAt = r.createdAt,
                    healthTags = NutritionCalculator.healthTags(rep).filter { it.positive }.map { it.label },
                )
            },
        )
    }.flowOn(Dispatchers.Default).stateIn(c.scope, SharingStarted.Eagerly, SearchEngine(emptyList()))

    fun observeRecipe(id: String): Flow<Recipe?> =
        db.recipes().observe(id).map { e -> e?.takeIf { !it.deleted }?.toDomain() }

    suspend fun get(id: String): Recipe? = db.recipes().get(id)?.takeIf { !it.deleted }?.toDomain()

    fun newId(): String = UUID.randomUUID().toString()

    suspend fun save(recipe: Recipe): Recipe = withContext(Dispatchers.IO) {
        val s = me ?: error("Oturum yok")
        val existing = db.recipes().get(recipe.id)
        val now = System.currentTimeMillis()
        val isNew = existing == null
        val ownedByMe = existing == null || existing.authorId == s.uid
        val r = recipe.copy(
            authorId = if (ownedByMe) s.uid else existing!!.authorId,
            authorName = if (ownedByMe) s.name else existing!!.authorName,
            authorPhoto = if (ownedByMe) s.photo else existing!!.authorPhoto,
            createdAt = existing?.createdAt ?: now,
            updatedAt = now,
            ratingAvg = existing?.ratingAvg ?: 0.0,
            ratingCount = existing?.ratingCount ?: 0,
        )
        db.recipes().upsert(r.toEntity(dirty = true))
        c.sync.requestSync()
        if (isNew && r.visibility != Visibility.PRIVATE && s.isCloud) {
            c.scope.launch { c.social.notifyFollowersOfNewRecipe(r) }
        }
        r
    }

    /** Başkasının tarifini kendi defterime kopyalayıp düzenlenebilir hale getirir. */
    suspend fun duplicateAsMine(recipe: Recipe): Recipe {
        val s = me ?: error("Oturum yok")
        val copy = recipe.copy(
            id = newId(), authorId = s.uid, authorName = s.name, authorPhoto = s.photo,
            title = recipe.title + " (benim versiyonum)", visibility = Visibility.PRIVATE,
            ratingAvg = 0.0, ratingCount = 0, featured = false, hidden = false,
            sourceUrl = recipe.sourceUrl ?: "tarifpro://recipe/${recipe.id}",
        )
        return save(copy)
    }

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        val e = db.recipes().get(id) ?: return@withContext
        db.recipes().upsert(e.copy(deleted = true, dirty = true, updatedAt = System.currentTimeMillis()))
        c.sync.requestSync()
    }

    // ---------- Favoriler ----------

    val favoriteIds: StateFlow<Set<String>> = c.sessionStore.session.flatMapLatest { s ->
        if (s == null) flowOf(emptySet()) else db.favorites().observe(s.uid).map { list -> list.map { it.recipeId }.toSet() }
    }.stateIn(c.scope, SharingStarted.Eagerly, emptySet())

    suspend fun toggleFavorite(recipeId: String) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        val existing = db.favorites().get(s.uid, recipeId)
        val nowFav = existing == null || existing.deleted
        db.favorites().upsert(FavoriteEntity(s.uid, recipeId, System.currentTimeMillis(), dirty = true, deleted = !nowFav))
        c.sync.requestSync()
    }

    // ---------- Defterler (koleksiyonlar) ----------

    val collections: StateFlow<List<CollectionInfo>> = c.sessionStore.session.flatMapLatest { s ->
        if (s == null) flowOf(emptyList()) else combine(db.collections().observe(s.uid), db.collections().observeItems()) { cols, items ->
            val byCol = items.groupBy { it.collectionId }
            cols.map { col -> CollectionInfo(col, byCol[col.id].orEmpty().sortedByDescending { it.addedAt }.map { it.recipeId }) }
        }
    }.stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    suspend fun createCollection(name: String, description: String, emoji: String, color: Int): String = withContext(Dispatchers.IO) {
        val s = me ?: error("Oturum yok")
        val id = newId()
        val now = System.currentTimeMillis()
        db.collections().upsert(CollectionEntity(id, s.uid, name.ifBlank { "Yeni Defter" }, description, emoji, color, now, now, dirty = true))
        c.sync.requestSync()
        id
    }

    suspend fun updateCollection(id: String, name: String, description: String, emoji: String, color: Int) = withContext(Dispatchers.IO) {
        val e = db.collections().get(id) ?: return@withContext
        db.collections().upsert(e.copy(name = name, description = description, emoji = emoji, color = color, updatedAt = System.currentTimeMillis(), dirty = true))
        c.sync.requestSync()
    }

    suspend fun deleteCollection(id: String) = withContext(Dispatchers.IO) {
        val e = db.collections().get(id) ?: return@withContext
        db.collections().clearItems(id)
        db.collections().upsert(e.copy(deleted = true, dirty = true, updatedAt = System.currentTimeMillis()))
        c.sync.requestSync()
    }

    suspend fun setInCollection(collectionId: String, recipeId: String, include: Boolean) = withContext(Dispatchers.IO) {
        if (include) db.collections().addItem(CollectionItemEntity(collectionId, recipeId, System.currentTimeMillis()))
        else db.collections().removeItem(collectionId, recipeId)
        db.collections().get(collectionId)?.let { db.collections().upsert(it.copy(updatedAt = System.currentTimeMillis(), dirty = true)) }
        c.sync.requestSync()
    }

    // ---------- Yorumlar ve puanlar ----------

    fun comments(recipeId: String): Flow<List<CommentEntity>> = db.comments().observe(recipeId)

    fun myRating(recipeId: String): Flow<Int?> = combine(db.ratings().observe(recipeId), c.sessionStore.session) { list, s ->
        list.firstOrNull { it.userId == s?.uid }?.stars
    }

    suspend fun addComment(recipe: Recipe, text: String, rating: Int) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        val clean = text.trim()
        if (clean.isEmpty() && rating == 0) return@withContext
        if (rating > 0) rate(recipe, rating)
        if (clean.isEmpty()) return@withContext
        val comment = CommentEntity(
            id = newId(), recipeId = recipe.id, authorId = s.uid, authorName = s.name, authorPhoto = s.photo,
            text = clean, rating = rating, createdAt = System.currentTimeMillis(), dirty = true,
        )
        db.comments().upsert(comment)
        c.sync.requestSync()
        if (recipe.authorId != s.uid) {
            c.social.deliverNotification(
                recipe.authorId, NotifType.COMMENT, "💬 ${s.name} tarifinize yorum yaptı",
                "${recipe.title}: \"${clean.take(80)}\"", "recipe/${recipe.id}?tab=3",
            )
        }
    }

    suspend fun rate(recipe: Recipe, stars: Int) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        val st = stars.coerceIn(1, 5)
        val old = db.ratings().forRecipe(recipe.id).firstOrNull { it.userId == s.uid }?.stars
        db.ratings().upsert(RatingEntity(recipe.id, s.uid, st, System.currentTimeMillis(), dirty = true))
        // Yerel ortalamayı hemen güncelle (bulut senkronunda sunucu değeriyle düzeltilir)
        val current = db.recipes().get(recipe.id) ?: return@withContext
        val count = current.ratingCount
        val (avg, newCount) = if (old == null) {
            (current.ratingAvg * count + st) / (count + 1) to count + 1
        } else {
            (if (count > 0) (current.ratingAvg * count - old + st) / count else st.toDouble()) to count.coerceAtLeast(1)
        }
        db.recipes().updateRating(recipe.id, avg, newCount)
        c.sync.requestSync()
        if (old == null && recipe.authorId != s.uid) {
            c.social.deliverNotification(
                recipe.authorId, NotifType.RATING, "⭐ ${s.name} tarifinize $st yıldız verdi",
                recipe.title, "recipe/${recipe.id}?tab=3",
            )
        }
    }

    suspend fun deleteComment(comment: CommentEntity) = withContext(Dispatchers.IO) {
        db.comments().delete(comment.id)
        try {
            if (c.sync.cloudReady() != null) c.cloud?.deleteComment(comment.recipeId, comment.id)
        } catch (e: Exception) {
            // yetki yoksa yerelde silinmiş kalır
        }
    }

    // ---------- Pişirme ilerlemesi ----------

    fun progress(recipeId: String): Flow<CookProgressEntity?> = db.cookProgress().observe(recipeId)

    private fun csvToggle(csv: String, key: String): String {
        val set = csv.split(',').filter { it.isNotBlank() }.toMutableSet()
        if (!set.add(key)) set.remove(key)
        return set.joinToString(",")
    }

    suspend fun toggleStep(recipeId: String, index: Int, current: CookProgressEntity?) {
        val p = current ?: CookProgressEntity(recipeId, "", "", 0)
        db.cookProgress().upsert(p.copy(doneSteps = csvToggle(p.doneSteps, index.toString()), updatedAt = System.currentTimeMillis()))
    }

    suspend fun toggleIngredient(recipeId: String, index: Int, current: CookProgressEntity?) {
        val p = current ?: CookProgressEntity(recipeId, "", "", 0)
        db.cookProgress().upsert(p.copy(checkedIngredients = csvToggle(p.checkedIngredients, index.toString()), updatedAt = System.currentTimeMillis()))
    }

    suspend fun resetProgress(recipeId: String) = db.cookProgress().clear(recipeId)

    // ---------- Alışveriş listesi ----------

    val shopping: StateFlow<List<ShoppingItemEntity>> = c.sessionStore.session.flatMapLatest { s ->
        if (s == null) flowOf(emptyList()) else db.shopping().observe(s.uid)
    }.stateIn(c.scope, SharingStarted.Eagerly, emptyList())

    suspend fun addToShopping(recipe: Recipe, servings: Int, onlyIndexes: Set<Int>? = null): Int = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext 0
        val factor = Scaler.factor(recipe.servings, servings)
        val now = System.currentTimeMillis()
        val items = recipe.ingredients.mapIndexedNotNull { idx, ing ->
            if (onlyIndexes != null && idx !in onlyIndexes) return@mapIndexedNotNull null
            ShoppingItemEntity(
                id = newId(), ownerId = s.uid, text = QuantityFormat.ingredientLine(Scaler.scale(ing, 1.0), factor),
                source = recipe.title, checked = false, createdAt = now - idx,
            )
        }
        db.shopping().upsertAll(items)
        items.size
    }

    suspend fun addShoppingText(text: String) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        if (text.isBlank()) return@withContext
        db.shopping().upsert(ShoppingItemEntity(newId(), s.uid, text.trim(), "", false, System.currentTimeMillis()))
    }

    suspend fun toggleShopping(item: ShoppingItemEntity) = db.shopping().upsert(item.copy(checked = !item.checked))
    suspend fun deleteShopping(item: ShoppingItemEntity) = db.shopping().delete(item.id)
    suspend fun clearCheckedShopping() {
        val s = me ?: return
        db.shopping().clearChecked(s.uid)
    }

    // ---------- Şikayet ----------

    suspend fun report(targetType: String, targetId: String, targetTitle: String, reason: String) = withContext(Dispatchers.IO) {
        val s = me ?: return@withContext
        db.reports().upsert(
            ReportEntity(
                id = newId(), targetType = targetType, targetId = targetId, targetTitle = targetTitle, reason = reason,
                reporterId = s.uid, reporterName = s.name, createdAt = System.currentTimeMillis(), status = "OPEN", dirty = true,
            ),
        )
        db.notifications().upsert(
            NotificationEntity(
                newId(), s.uid, NotifType.MODERATION, "🛡️ Şikayetiniz alındı",
                "\"$targetTitle\" moderasyon ekibine iletildi. Teşekkürler!", null, System.currentTimeMillis(),
            ),
        )
        c.sync.requestSync()
    }
}
