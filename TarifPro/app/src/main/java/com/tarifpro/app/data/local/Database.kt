package com.tarifpro.app.data.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "recipes", indices = [Index("authorId"), Index("updatedAt")])
data class RecipeEntity(
    @PrimaryKey val id: String,
    val authorId: String,
    val authorName: String,
    val authorPhoto: String?,
    val title: String,
    val description: String,
    val tagline: String,
    val category: String,
    val cuisine: String,
    val difficulty: Int,
    val servings: Int,
    val prepMinutes: Int,
    val cookMinutes: Int,
    val restMinutes: Int,
    val templateId: String,
    val visibility: String,
    val image: String,
    val ingredientsJson: String,
    val stepsJson: String,
    val tipsJson: String,
    val tagsJson: String,
    val kcalPerServing: Int,
    val ratingAvg: Double,
    val ratingCount: Int,
    val createdAt: Long,
    val updatedAt: Long,
    val hidden: Boolean,
    val featured: Boolean,
    val sourceUrl: String?,
    val dirty: Boolean,
    val deleted: Boolean,
)

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val name: String,
    val email: String,
    val photo: String?,
    val bio: String,
    val isAdmin: Boolean,
    val banned: Boolean,
    val isDemo: Boolean,
    val followers: Int,
    val following: Int,
    val updatedAt: Long,
)

@Entity(tableName = "follows", primaryKeys = ["followerId", "followeeId"])
data class FollowEntity(
    val followerId: String,
    val followeeId: String,
    val createdAt: Long,
    val dirty: Boolean = false,
    val deleted: Boolean = false,
)

@Entity(tableName = "favorites", primaryKeys = ["userId", "recipeId"])
data class FavoriteEntity(
    val userId: String,
    val recipeId: String,
    val addedAt: Long,
    val dirty: Boolean = false,
    val deleted: Boolean = false,
)

@Entity(tableName = "collections", indices = [Index("ownerId")])
data class CollectionEntity(
    @PrimaryKey val id: String,
    val ownerId: String,
    val name: String,
    val description: String,
    val emoji: String,
    val color: Int,
    val createdAt: Long,
    val updatedAt: Long,
    val dirty: Boolean = false,
    val deleted: Boolean = false,
)

@Entity(tableName = "collection_items", primaryKeys = ["collectionId", "recipeId"])
data class CollectionItemEntity(
    val collectionId: String,
    val recipeId: String,
    val addedAt: Long,
)

@Entity(tableName = "comments", indices = [Index("recipeId")])
data class CommentEntity(
    @PrimaryKey val id: String,
    val recipeId: String,
    val authorId: String,
    val authorName: String,
    val authorPhoto: String?,
    val text: String,
    val rating: Int,
    val createdAt: Long,
    val hidden: Boolean = false,
    val dirty: Boolean = false,
)

@Entity(tableName = "ratings", primaryKeys = ["recipeId", "userId"])
data class RatingEntity(
    val recipeId: String,
    val userId: String,
    val stars: Int,
    val updatedAt: Long,
    val dirty: Boolean = false,
)

@Entity(tableName = "chats")
data class ChatEntity(
    @PrimaryKey val id: String,
    /** "DM" veya "CHANNEL" */
    val kind: String,
    val title: String,
    val emoji: String,
    val membersCsv: String,
    val lastMessage: String,
    val lastAt: Long,
    val lastSenderId: String,
    val readAt: Long,
)

@Entity(tableName = "messages", indices = [Index("chatId")])
data class MessageEntity(
    @PrimaryKey val id: String,
    val chatId: String,
    val senderId: String,
    val senderName: String,
    val senderPhoto: String?,
    val text: String,
    val recipeId: String?,
    val recipeTitle: String?,
    val recipeImage: String?,
    val createdAt: Long,
    val dirty: Boolean = false,
)

@Entity(tableName = "notifications", indices = [Index("userId")])
data class NotificationEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val type: String,
    val title: String,
    val body: String,
    val route: String?,
    val createdAt: Long,
    val read: Boolean = false,
)

@Entity(tableName = "shopping")
data class ShoppingItemEntity(
    @PrimaryKey val id: String,
    val ownerId: String,
    val text: String,
    val source: String,
    val checked: Boolean,
    val createdAt: Long,
)

@Entity(tableName = "reports")
data class ReportEntity(
    @PrimaryKey val id: String,
    /** "RECIPE", "COMMENT", "USER", "MESSAGE" */
    val targetType: String,
    val targetId: String,
    val targetTitle: String,
    val reason: String,
    val reporterId: String,
    val reporterName: String,
    val createdAt: Long,
    /** "OPEN", "RESOLVED", "DISMISSED" */
    val status: String,
    val dirty: Boolean = false,
)

@Entity(tableName = "cook_progress")
data class CookProgressEntity(
    @PrimaryKey val recipeId: String,
    val doneSteps: String,
    val checkedIngredients: String,
    val updatedAt: Long,
)

@Dao
interface RecipeDao {
    @Query("SELECT * FROM recipes WHERE deleted = 0 ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<RecipeEntity>>

    @Query("SELECT * FROM recipes WHERE id = :id")
    fun observe(id: String): Flow<RecipeEntity?>

    @Query("SELECT * FROM recipes WHERE id = :id")
    suspend fun get(id: String): RecipeEntity?

    @Query("SELECT * FROM recipes WHERE deleted = 0")
    suspend fun all(): List<RecipeEntity>

    @Upsert
    suspend fun upsert(entity: RecipeEntity)

    @Upsert
    suspend fun upsertAll(entities: List<RecipeEntity>)

    @Query("SELECT * FROM recipes WHERE dirty = 1")
    suspend fun dirty(): List<RecipeEntity>

    @Query("UPDATE recipes SET dirty = 0 WHERE id = :id AND updatedAt = :updatedAt")
    suspend fun markClean(id: String, updatedAt: Long)

    @Query("DELETE FROM recipes WHERE id = :id")
    suspend fun hardDelete(id: String)

    @Query("SELECT COUNT(*) FROM recipes")
    suspend fun count(): Int

    @Query("UPDATE recipes SET authorId = :newId, authorName = :name, authorPhoto = :photo, dirty = 1, updatedAt = :now WHERE authorId = :oldId")
    suspend fun reassign(oldId: String, newId: String, name: String, photo: String?, now: Long)

    @Query("UPDATE recipes SET ratingAvg = :avg, ratingCount = :count WHERE id = :id")
    suspend fun updateRating(id: String, avg: Double, count: Int)
}

@Dao
interface UserDao {
    @Query("SELECT * FROM users ORDER BY followers DESC, name")
    fun observeAll(): Flow<List<UserEntity>>

    @Query("SELECT * FROM users WHERE id = :id")
    fun observe(id: String): Flow<UserEntity?>

    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun get(id: String): UserEntity?

    @Upsert
    suspend fun upsert(user: UserEntity)

    @Upsert
    suspend fun upsertAll(users: List<UserEntity>)
}

@Dao
interface FollowDao {
    @Query("SELECT * FROM follows WHERE deleted = 0")
    fun observeAll(): Flow<List<FollowEntity>>

    @Query("SELECT * FROM follows WHERE followerId = :followerId AND followeeId = :followeeId")
    suspend fun get(followerId: String, followeeId: String): FollowEntity?

    @Upsert
    suspend fun upsert(f: FollowEntity)

    @Upsert
    suspend fun upsertAll(list: List<FollowEntity>)

    @Query("SELECT * FROM follows WHERE dirty = 1")
    suspend fun dirty(): List<FollowEntity>

    @Query("UPDATE follows SET followerId = :newId WHERE followerId = :oldId")
    suspend fun reassignFollower(oldId: String, newId: String)
}

@Dao
interface FavoriteDao {
    @Query("SELECT * FROM favorites WHERE userId = :userId AND deleted = 0 ORDER BY addedAt DESC")
    fun observe(userId: String): Flow<List<FavoriteEntity>>

    @Query("SELECT * FROM favorites WHERE userId = :userId AND recipeId = :recipeId")
    suspend fun get(userId: String, recipeId: String): FavoriteEntity?

    @Upsert
    suspend fun upsert(f: FavoriteEntity)

    @Upsert
    suspend fun upsertAll(list: List<FavoriteEntity>)

    @Query("SELECT * FROM favorites WHERE dirty = 1")
    suspend fun dirty(): List<FavoriteEntity>

    @Query("UPDATE favorites SET userId = :newId, dirty = 1 WHERE userId = :oldId")
    suspend fun reassign(oldId: String, newId: String)
}

@Dao
interface CollectionDao {
    @Query("SELECT * FROM collections WHERE ownerId = :ownerId AND deleted = 0 ORDER BY updatedAt DESC")
    fun observe(ownerId: String): Flow<List<CollectionEntity>>

    @Query("SELECT * FROM collections WHERE id = :id")
    fun observeOne(id: String): Flow<CollectionEntity?>

    @Query("SELECT * FROM collections WHERE id = :id")
    suspend fun get(id: String): CollectionEntity?

    @Upsert
    suspend fun upsert(c: CollectionEntity)

    @Upsert
    suspend fun upsertAll(list: List<CollectionEntity>)

    @Query("SELECT * FROM collection_items")
    fun observeItems(): Flow<List<CollectionItemEntity>>

    @Query("SELECT * FROM collection_items WHERE collectionId = :collectionId")
    suspend fun items(collectionId: String): List<CollectionItemEntity>

    @Upsert
    suspend fun addItem(item: CollectionItemEntity)

    @Query("DELETE FROM collection_items WHERE collectionId = :collectionId AND recipeId = :recipeId")
    suspend fun removeItem(collectionId: String, recipeId: String)

    @Query("DELETE FROM collection_items WHERE collectionId = :collectionId")
    suspend fun clearItems(collectionId: String)

    @Query("SELECT * FROM collections WHERE dirty = 1")
    suspend fun dirty(): List<CollectionEntity>

    @Query("UPDATE collections SET ownerId = :newId, dirty = 1 WHERE ownerId = :oldId")
    suspend fun reassign(oldId: String, newId: String)
}

@Dao
interface CommentDao {
    @Query("SELECT * FROM comments WHERE recipeId = :recipeId ORDER BY createdAt DESC")
    fun observe(recipeId: String): Flow<List<CommentEntity>>

    @Query("SELECT * FROM comments ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<CommentEntity>>

    @Upsert
    suspend fun upsert(c: CommentEntity)

    @Upsert
    suspend fun upsertAll(list: List<CommentEntity>)

    @Query("SELECT * FROM comments WHERE id = :id")
    suspend fun get(id: String): CommentEntity?

    @Query("DELETE FROM comments WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT * FROM comments WHERE dirty = 1")
    suspend fun dirty(): List<CommentEntity>

    @Query("SELECT COUNT(*) FROM comments")
    fun observeCount(): Flow<Int>
}

@Dao
interface RatingDao {
    @Query("SELECT * FROM ratings WHERE recipeId = :recipeId")
    fun observe(recipeId: String): Flow<List<RatingEntity>>

    @Query("SELECT * FROM ratings WHERE recipeId = :recipeId")
    suspend fun forRecipe(recipeId: String): List<RatingEntity>

    @Upsert
    suspend fun upsert(r: RatingEntity)

    @Upsert
    suspend fun upsertAll(list: List<RatingEntity>)

    @Query("SELECT * FROM ratings WHERE dirty = 1")
    suspend fun dirty(): List<RatingEntity>
}

@Dao
interface ChatDao {
    @Query("SELECT * FROM chats ORDER BY lastAt DESC")
    fun observeAll(): Flow<List<ChatEntity>>

    @Query("SELECT * FROM chats WHERE id = :id")
    fun observe(id: String): Flow<ChatEntity?>

    @Query("SELECT * FROM chats WHERE id = :id")
    suspend fun get(id: String): ChatEntity?

    @Upsert
    suspend fun upsert(c: ChatEntity)

    @Upsert
    suspend fun upsertAll(list: List<ChatEntity>)

    @Query("UPDATE chats SET readAt = :at WHERE id = :id")
    suspend fun markRead(id: String, at: Long)

    @Query("SELECT * FROM messages WHERE chatId = :chatId ORDER BY createdAt ASC")
    fun observeMessages(chatId: String): Flow<List<MessageEntity>>

    @Upsert
    suspend fun upsertMessage(m: MessageEntity)

    @Upsert
    suspend fun upsertMessages(list: List<MessageEntity>)

    @Query("DELETE FROM messages WHERE id = :id")
    suspend fun deleteMessage(id: String)

    @Query("SELECT * FROM messages WHERE dirty = 1")
    suspend fun dirtyMessages(): List<MessageEntity>

    @Query("SELECT COUNT(*) FROM messages")
    fun observeMessageCount(): Flow<Int>
}

@Dao
interface NotificationDao {
    @Query("SELECT * FROM notifications WHERE userId = :userId ORDER BY createdAt DESC LIMIT 200")
    fun observe(userId: String): Flow<List<NotificationEntity>>

    @Upsert
    suspend fun upsert(n: NotificationEntity)

    @Query("SELECT * FROM notifications WHERE id = :id")
    suspend fun get(id: String): NotificationEntity?

    @Query("UPDATE notifications SET read = 1 WHERE userId = :userId")
    suspend fun markAllRead(userId: String)

    @Query("DELETE FROM notifications WHERE userId = :userId")
    suspend fun clear(userId: String)
}

@Dao
interface ShoppingDao {
    @Query("SELECT * FROM shopping WHERE ownerId = :ownerId ORDER BY checked, createdAt DESC")
    fun observe(ownerId: String): Flow<List<ShoppingItemEntity>>

    @Upsert
    suspend fun upsert(item: ShoppingItemEntity)

    @Upsert
    suspend fun upsertAll(items: List<ShoppingItemEntity>)

    @Query("DELETE FROM shopping WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM shopping WHERE ownerId = :ownerId AND checked = 1")
    suspend fun clearChecked(ownerId: String)
}

@Dao
interface ReportDao {
    @Query("SELECT * FROM reports ORDER BY status = 'OPEN' DESC, createdAt DESC")
    fun observeAll(): Flow<List<ReportEntity>>

    @Upsert
    suspend fun upsert(r: ReportEntity)

    @Upsert
    suspend fun upsertAll(list: List<ReportEntity>)

    @Query("SELECT * FROM reports WHERE dirty = 1")
    suspend fun dirty(): List<ReportEntity>
}

@Dao
interface CookProgressDao {
    @Query("SELECT * FROM cook_progress WHERE recipeId = :recipeId")
    fun observe(recipeId: String): Flow<CookProgressEntity?>

    @Upsert
    suspend fun upsert(p: CookProgressEntity)

    @Query("DELETE FROM cook_progress WHERE recipeId = :recipeId")
    suspend fun clear(recipeId: String)
}

@Database(
    entities = [
        RecipeEntity::class, UserEntity::class, FollowEntity::class, FavoriteEntity::class,
        CollectionEntity::class, CollectionItemEntity::class, CommentEntity::class, RatingEntity::class,
        ChatEntity::class, MessageEntity::class, NotificationEntity::class, ShoppingItemEntity::class,
        ReportEntity::class, CookProgressEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun recipes(): RecipeDao
    abstract fun users(): UserDao
    abstract fun follows(): FollowDao
    abstract fun favorites(): FavoriteDao
    abstract fun collections(): CollectionDao
    abstract fun comments(): CommentDao
    abstract fun ratings(): RatingDao
    abstract fun chats(): ChatDao
    abstract fun notifications(): NotificationDao
    abstract fun shopping(): ShoppingDao
    abstract fun reports(): ReportDao
    abstract fun cookProgress(): CookProgressDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "tarifpro.db")
                .fallbackToDestructiveMigration()
                .build()
    }
}
