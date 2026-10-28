package com.tarifpro.app

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.tarifpro.app.data.CloudConfig
import com.tarifpro.app.data.CloudConfigStore
import com.tarifpro.app.data.ImageStore
import com.tarifpro.app.data.SessionStore
import com.tarifpro.app.data.SettingsStore
import com.tarifpro.app.data.cloud.FirebaseCloud
import com.tarifpro.app.data.local.AppDatabase
import com.tarifpro.app.data.repo.AuthRepository
import com.tarifpro.app.data.repo.RecipeRepository
import com.tarifpro.app.data.repo.SocialRepository
import com.tarifpro.app.data.repo.SyncManager
import com.tarifpro.app.data.seed.SeedData
import com.tarifpro.app.notify.Notifier
import com.tarifpro.app.timer.TimerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class TarifProApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.start()
    }
}

/** Basit bağımlılık kabı: tüm depolar ve servisler tek yerde oluşturulur. */
class AppContainer(val context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val db: AppDatabase = AppDatabase.create(context)
    val settings = SettingsStore(context)
    val cloudConfigStore = CloudConfigStore(context)
    val cloudConfig: CloudConfig = cloudConfigStore.load()
    val cloud: FirebaseCloud? = FirebaseCloud.init(context, cloudConfig)
    val sessionStore = SessionStore(context)
    val images = ImageStore(context) { cloud }
    val notifier = Notifier(context, settings)
    val timers = TimerManager(context)

    val auth by lazy { AuthRepository(this) }
    val recipes by lazy { RecipeRepository(this) }
    val social by lazy { SocialRepository(this) }
    val sync by lazy { SyncManager(this) }

    /** İçe aktarma ekranından düzenleyiciye aktarılan tarif taslağı */
    @Volatile
    var pendingImport: com.tarifpro.app.export.ImportedRecipe? = null

    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online.asStateFlow()

    fun start() {
        notifier.createChannels()
        watchConnectivity()
        scope.launch {
            SeedData.seedIfNeeded(this@AppContainer)
            sync.onAppStart()
        }
    }

    private fun watchConnectivity() {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return
        _online.value = cm.activeNetwork?.let { cm.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } == true
        try {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    val was = _online.value
                    _online.value = true
                    if (!was) sync.requestSync()
                }

                override fun onLost(network: Network) {
                    _online.value = false
                }
            })
        } catch (e: Exception) {
            // bazı cihazlarda izin/servis sorunu
        }
    }
}
