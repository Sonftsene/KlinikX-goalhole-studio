package com.atomik.kocu

import android.app.Application
import androidx.glance.appwidget.updateAll
import com.atomik.kocu.data.Store
import com.atomik.kocu.notify.Reminders
import com.atomik.kocu.widget.AtomWidget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AtomikApp : Application() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        Store.init(this)
        Reminders.createChannels(this)
        Reminders.syncIfChanged(this)
        Store.onChanged = {
            Reminders.syncIfChanged(this)
            scope.launch { runCatching { AtomWidget().updateAll(this@AtomikApp) } }
        }
    }
}
