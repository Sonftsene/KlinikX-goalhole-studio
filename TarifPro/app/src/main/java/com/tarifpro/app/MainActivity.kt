package com.tarifpro.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import com.tarifpro.app.notify.Notifier
import com.tarifpro.app.ui.AppRoot

class MainActivity : ComponentActivity() {
    /** Bildirimden veya paylaşım menüsünden gelen hedef */
    val pendingRoute = mutableStateOf<String?>(null)
    val pendingSharedText = mutableStateOf<String?>(null)

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        val container = (application as TarifProApp).container
        setContent { AppRoot(container, this) }
        if (Build.VERSION.SDK_INT >= 33) {
            val prefs = getSharedPreferences("ui", MODE_PRIVATE)
            if (!prefs.getBoolean("askedNotif", false)) {
                prefs.edit().putBoolean("askedNotif", true).apply()
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        intent.getStringExtra(Notifier.EXTRA_ROUTE)?.let { pendingRoute.value = it }
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            intent.getStringExtra(Intent.EXTRA_TEXT)?.let { pendingSharedText.value = it }
        }
    }
}
