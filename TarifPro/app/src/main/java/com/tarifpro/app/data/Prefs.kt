package com.tarifpro.app.data

import android.content.Context
import android.content.SharedPreferences
import com.tarifpro.app.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

enum class ThemeMode(val label: String) { SYSTEM("Sistem"), LIGHT("Açık"), DARK("Koyu") }

data class AppSettings(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val dynamicColor: Boolean = false,
    val defaultTemplate: String = "pastane",
    val keepScreenOn: Boolean = true,
    val notifyComments: Boolean = true,
    val notifyRatings: Boolean = true,
    val notifyFollowers: Boolean = true,
    val notifyMessages: Boolean = true,
    val notifyNewRecipes: Boolean = true,
    val notifyChannels: Boolean = false,
    val notifyAnnouncements: Boolean = true,
    val timerSound: Boolean = true,
    val timerVibrate: Boolean = true,
    val quietHours: Boolean = false,
    val quietStart: Int = 23,
    val quietEnd: Int = 8,
    val onboardingDone: Boolean = false,
    val recentSearches: List<String> = emptyList(),
)

class SettingsStore(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppSettings> = _state.asStateFlow()
    val value: AppSettings get() = _state.value

    private fun load(): AppSettings {
        val d = AppSettings()
        return AppSettings(
            themeMode = runCatching { ThemeMode.valueOf(prefs.getString("themeMode", d.themeMode.name)!!) }.getOrDefault(d.themeMode),
            dynamicColor = prefs.getBoolean("dynamicColor", d.dynamicColor),
            defaultTemplate = prefs.getString("defaultTemplate", d.defaultTemplate) ?: d.defaultTemplate,
            keepScreenOn = prefs.getBoolean("keepScreenOn", d.keepScreenOn),
            notifyComments = prefs.getBoolean("notifyComments", d.notifyComments),
            notifyRatings = prefs.getBoolean("notifyRatings", d.notifyRatings),
            notifyFollowers = prefs.getBoolean("notifyFollowers", d.notifyFollowers),
            notifyMessages = prefs.getBoolean("notifyMessages", d.notifyMessages),
            notifyNewRecipes = prefs.getBoolean("notifyNewRecipes", d.notifyNewRecipes),
            notifyChannels = prefs.getBoolean("notifyChannels", d.notifyChannels),
            notifyAnnouncements = prefs.getBoolean("notifyAnnouncements", d.notifyAnnouncements),
            timerSound = prefs.getBoolean("timerSound", d.timerSound),
            timerVibrate = prefs.getBoolean("timerVibrate", d.timerVibrate),
            quietHours = prefs.getBoolean("quietHours", d.quietHours),
            quietStart = prefs.getInt("quietStart", d.quietStart),
            quietEnd = prefs.getInt("quietEnd", d.quietEnd),
            onboardingDone = prefs.getBoolean("onboardingDone", d.onboardingDone),
            recentSearches = (prefs.getString("recentSearches", "") ?: "").split('\u0001').filter { it.isNotBlank() },
        )
    }

    fun update(transform: (AppSettings) -> AppSettings) {
        val s = transform(_state.value)
        prefs.edit()
            .putString("themeMode", s.themeMode.name)
            .putBoolean("dynamicColor", s.dynamicColor)
            .putString("defaultTemplate", s.defaultTemplate)
            .putBoolean("keepScreenOn", s.keepScreenOn)
            .putBoolean("notifyComments", s.notifyComments)
            .putBoolean("notifyRatings", s.notifyRatings)
            .putBoolean("notifyFollowers", s.notifyFollowers)
            .putBoolean("notifyMessages", s.notifyMessages)
            .putBoolean("notifyNewRecipes", s.notifyNewRecipes)
            .putBoolean("notifyChannels", s.notifyChannels)
            .putBoolean("notifyAnnouncements", s.notifyAnnouncements)
            .putBoolean("timerSound", s.timerSound)
            .putBoolean("timerVibrate", s.timerVibrate)
            .putBoolean("quietHours", s.quietHours)
            .putInt("quietStart", s.quietStart)
            .putInt("quietEnd", s.quietEnd)
            .putBoolean("onboardingDone", s.onboardingDone)
            .putString("recentSearches", s.recentSearches.take(10).joinToString("\u0001"))
            .apply()
        _state.value = s
    }

    fun addRecentSearch(q: String) {
        val t = q.trim()
        if (t.length < 2) return
        update { it.copy(recentSearches = (listOf(t) + it.recentSearches.filter { s -> !s.equals(t, true) }).take(10)) }
    }
}

/** Firebase / Google giriş yapılandırması. */
data class CloudConfig(
    val apiKey: String,
    val appId: String,
    val projectId: String,
    val webClientId: String,
    val adminEmails: List<String>,
) {
    val isConfigured: Boolean get() = apiKey.isNotBlank() && appId.isNotBlank() && projectId.isNotBlank()
    val googleSignInReady: Boolean get() = isConfigured && webClientId.isNotBlank()

    companion object {
        /** google-services.json içeriğinden yapılandırma okur. */
        fun fromGoogleServicesJson(json: String, packageName: String): CloudConfig? = try {
            val root = JSONObject(json)
            val projectId = root.getJSONObject("project_info").getString("project_id")
            val clients = root.getJSONArray("client")
            var chosen: JSONObject? = null
            for (i in 0 until clients.length()) {
                val c = clients.getJSONObject(i)
                val pkg = c.optJSONObject("client_info")?.optJSONObject("android_client_info")?.optString("package_name")
                if (pkg == packageName) chosen = c
            }
            val client = chosen ?: clients.getJSONObject(0)
            val appId = client.getJSONObject("client_info").getString("mobilesdk_app_id")
            val apiKey = client.getJSONArray("api_key").getJSONObject(0).getString("current_key")
            var web = ""
            val oauth = client.optJSONArray("oauth_client")
            if (oauth != null) {
                for (i in 0 until oauth.length()) {
                    val o = oauth.getJSONObject(i)
                    if (o.optInt("client_type") == 3) web = o.optString("client_id")
                }
            }
            if (web.isBlank()) {
                val other = client.optJSONObject("services")?.optJSONObject("appinvite_service")?.optJSONArray("other_platform_oauth_client")
                if (other != null) {
                    for (i in 0 until other.length()) {
                        val o = other.getJSONObject(i)
                        if (o.optInt("client_type") == 3) web = o.optString("client_id")
                    }
                }
            }
            CloudConfig(apiKey, appId, projectId, web, emptyList())
        } catch (e: Exception) {
            null
        }
    }
}

class CloudConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences("cloud", Context.MODE_PRIVATE)

    fun load(): CloudConfig {
        fun pick(key: String, fallback: String) = prefs.getString(key, null)?.takeIf { it.isNotBlank() } ?: fallback
        return CloudConfig(
            apiKey = pick("apiKey", BuildConfig.FIREBASE_API_KEY),
            appId = pick("appId", BuildConfig.FIREBASE_APP_ID),
            projectId = pick("projectId", BuildConfig.FIREBASE_PROJECT_ID),
            webClientId = pick("webClientId", BuildConfig.GOOGLE_WEB_CLIENT_ID),
            adminEmails = (pick("adminEmails", BuildConfig.ADMIN_EMAILS)).split(',', ';', ' ')
                .map { it.trim().lowercase() }.filter { it.contains('@') },
        )
    }

    fun save(config: CloudConfig) {
        prefs.edit()
            .putString("apiKey", config.apiKey.trim())
            .putString("appId", config.appId.trim())
            .putString("projectId", config.projectId.trim())
            .putString("webClientId", config.webClientId.trim())
            .putString("adminEmails", config.adminEmails.joinToString(","))
            .apply()
    }

    fun clear() = prefs.edit().clear().apply()
}

enum class SessionMode { GUEST, GOOGLE }

data class Session(
    val uid: String,
    val name: String,
    val email: String,
    val photo: String?,
    val mode: SessionMode,
    val isAdmin: Boolean,
) {
    val isCloud: Boolean get() = mode == SessionMode.GOOGLE
}

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)
    private val _session = MutableStateFlow(load())
    val session: StateFlow<Session?> = _session.asStateFlow()
    val current: Session? get() = _session.value

    private fun load(): Session? {
        val uid = prefs.getString("uid", null) ?: return null
        return Session(
            uid = uid,
            name = prefs.getString("name", "") ?: "",
            email = prefs.getString("email", "") ?: "",
            photo = prefs.getString("photo", null),
            mode = runCatching { SessionMode.valueOf(prefs.getString("mode", "GUEST")!!) }.getOrDefault(SessionMode.GUEST),
            isAdmin = prefs.getBoolean("isAdmin", false),
        )
    }

    fun set(session: Session?) {
        if (session == null) {
            prefs.edit().remove("uid").remove("name").remove("email").remove("photo").remove("mode").remove("isAdmin").apply()
        } else {
            prefs.edit()
                .putString("uid", session.uid)
                .putString("name", session.name)
                .putString("email", session.email)
                .putString("photo", session.photo)
                .putString("mode", session.mode.name)
                .putBoolean("isAdmin", session.isAdmin)
                .apply()
        }
        _session.value = session
    }

    /** Misafir hesaplarının kalıcı yerel kimliği (oturum kapatılsa da tarifler kaybolmaz). */
    fun guestId(): String {
        val existing = prefs.getString("guestId", null)
        if (existing != null) return existing
        val id = "local-" + java.util.UUID.randomUUID().toString().take(12)
        prefs.edit().putString("guestId", id).apply()
        return id
    }
}
