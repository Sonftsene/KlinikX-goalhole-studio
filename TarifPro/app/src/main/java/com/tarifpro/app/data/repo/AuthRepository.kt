package com.tarifpro.app.data.repo

import android.app.Activity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.tarifpro.app.AppContainer
import com.tarifpro.app.data.Session
import com.tarifpro.app.data.SessionMode
import com.tarifpro.app.data.local.UserEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext

class AuthRepository(private val c: AppContainer) {
    val session: StateFlow<Session?> = c.sessionStore.session

    val googleAvailable: Boolean get() = c.cloud != null && c.cloudConfig.googleSignInReady

    suspend fun continueAsGuest(name: String) = withContext(Dispatchers.IO) {
        val id = c.sessionStore.guestId()
        val display = name.trim().ifBlank { "Misafir Şef" }
        val existing = c.db.users().get(id)
        c.db.users().upsert(
            UserEntity(
                id = id, name = display, email = "", photo = existing?.photo,
                bio = existing?.bio ?: "Tarif Pro ile mutfakta 👩‍🍳", isAdmin = true, banned = false, isDemo = false,
                followers = existing?.followers ?: 0, following = existing?.following ?: 0, updatedAt = System.currentTimeMillis(),
            ),
        )
        // Yerel modda cihaz sahibi kendi verilerinin yöneticisidir.
        c.sessionStore.set(Session(id, display, "", existing?.photo, SessionMode.GUEST, isAdmin = true))
    }

    /** Jetpack Credential Manager ile Google hesabı seçtirip Firebase oturumu açar. */
    suspend fun signInWithGoogle(activity: Activity): Result<Session> {
        val cloud = c.cloud ?: return Result.failure(IllegalStateException("Bulut yapılandırması eksik. Ayarlar > Bulut & Google Girişi bölümünden Firebase bilgilerinizi girin."))
        val webClientId = c.cloudConfig.webClientId
        if (webClientId.isBlank()) return Result.failure(IllegalStateException("Google Web İstemci Kimliği (Web Client ID) girilmemiş."))
        return try {
            val option = GetSignInWithGoogleOption.Builder(webClientId).build()
            val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
            val result = CredentialManager.create(activity).getCredential(activity, request)
            val credential = result.credential
            if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                return Result.failure(IllegalStateException("Beklenmeyen kimlik bilgisi türü"))
            }
            val google = GoogleIdTokenCredential.createFrom(credential.data)
            val user = cloud.signInWithGoogleIdToken(google.idToken)
            val email = user.email ?: google.id
            val isAdmin = try {
                cloud.resolveAdmin(user.uid, email)
            } catch (e: Exception) {
                false
            }
            val name = user.displayName ?: google.displayName ?: "Şef"
            val photo = user.photoUrl?.toString() ?: google.profilePictureUri?.toString()
            val session = Session(user.uid, name, email, photo, SessionMode.GOOGLE, isAdmin)
            withContext(Dispatchers.IO) {
                val guestId = c.sessionStore.guestId()
                migrateGuestData(guestId, session)
                val existing = c.db.users().get(user.uid)
                val entity = UserEntity(
                    id = user.uid, name = name, email = email, photo = photo, bio = existing?.bio ?: "",
                    isAdmin = isAdmin, banned = existing?.banned ?: false, isDemo = false,
                    followers = existing?.followers ?: 0, following = existing?.following ?: 0,
                    updatedAt = System.currentTimeMillis(),
                )
                c.db.users().upsert(entity)
                c.sessionStore.set(session)
                try {
                    cloud.upsertUser(entity)
                } catch (e: Exception) {
                    // çevrimdışı: Firestore kuyruğa alır
                }
            }
            c.sync.onSignedIn()
            Result.success(session)
        } catch (e: GetCredentialCancellationException) {
            Result.failure(IllegalStateException("Giriş iptal edildi."))
        } catch (e: NoCredentialException) {
            Result.failure(IllegalStateException("Cihazda Google hesabı bulunamadı. Ayarlar'dan bir Google hesabı ekleyin."))
        } catch (e: GetCredentialException) {
            Result.failure(IllegalStateException("Google girişi başarısız: ${e.message ?: e.type}"))
        } catch (e: Exception) {
            Result.failure(IllegalStateException("Giriş başarısız: ${e.message ?: e.javaClass.simpleName}. SHA-1 parmak izinin Firebase'e eklendiğinden emin olun."))
        }
    }

    /** Misafir olarak oluşturulan tarif, favori ve defterleri yeni Google hesabına taşır. */
    private suspend fun migrateGuestData(guestId: String, session: Session) {
        if (guestId == session.uid) return
        val now = System.currentTimeMillis()
        c.db.recipes().reassign(guestId, session.uid, session.name, session.photo, now)
        c.db.favorites().reassign(guestId, session.uid)
        c.db.collections().reassign(guestId, session.uid)
        c.db.follows().reassignFollower(guestId, session.uid)
    }

    suspend fun signOut() {
        try {
            CredentialManager.create(c.context).clearCredentialState(ClearCredentialStateRequest())
        } catch (e: Exception) {
            // önemli değil
        }
        c.sync.stopListeners()
        c.cloud?.signOut()
        c.sessionStore.set(null)
    }

    suspend fun updateProfile(name: String, bio: String, photo: String?) = withContext(Dispatchers.IO) {
        val s = c.sessionStore.current ?: return@withContext
        val existing = c.db.users().get(s.uid)
        var finalPhoto = photo
        if (s.isCloud && photo != null && c.images.isLocal(photo)) {
            finalPhoto = try {
                c.images.uploadIfLocal(photo, s.uid)
            } catch (e: Exception) {
                photo
            }
        }
        val entity = (
            existing ?: UserEntity(s.uid, name, s.email, finalPhoto, bio, s.isAdmin, false, false, 0, 0, 0)
            ).copy(name = name.ifBlank { s.name }, bio = bio, photo = finalPhoto, updatedAt = System.currentTimeMillis())
        c.db.users().upsert(entity)
        c.sessionStore.set(s.copy(name = entity.name, photo = entity.photo))
        if (s.isCloud) {
            try {
                c.cloud?.upsertUser(entity)
            } catch (e: Exception) {
                // sonra senkronize edilir
            }
        }
    }
}
