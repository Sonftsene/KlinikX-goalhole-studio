package com.tarifpro.app.timer

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.tarifpro.app.R
import com.tarifpro.app.TarifProApp
import com.tarifpro.app.notify.Notifier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

data class KitchenTimer(
    val id: String,
    val label: String,
    val recipeId: String?,
    val recipeTitle: String?,
    val stepIndex: Int?,
    val totalMs: Long,
    /** Çalışıyorsa bitiş anı (elapsedRealtime), duraklatılmışsa null */
    val endAt: Long?,
    /** Duraklatılmışken kalan süre */
    val pausedRemaining: Long,
    val finished: Boolean = false,
) {
    fun remaining(now: Long = SystemClock.elapsedRealtime()): Long =
        if (finished) 0 else endAt?.let { (it - now).coerceAtLeast(0) } ?: pausedRemaining

    val running: Boolean get() = endAt != null && !finished
    fun progress(now: Long = SystemClock.elapsedRealtime()): Float =
        if (totalMs <= 0) 1f else 1f - remaining(now).toFloat() / totalMs
}

/** Hazırlık ve pişirme sürelerini takip eden mutfak kronometresi. */
data class Stopwatch(
    val recipeId: String? = null,
    val phase: String = "Hazırlık",
    val startedAt: Long? = null,
    val accumulated: Long = 0,
    val laps: List<Pair<String, Long>> = emptyList(),
) {
    fun elapsed(now: Long = SystemClock.elapsedRealtime()): Long = accumulated + (startedAt?.let { now - it } ?: 0)
    val running: Boolean get() = startedAt != null
}

/**
 * Uygulama genelindeki tüm akıllı zamanlayıcıları ve kronometreyi yönetir.
 * Zamanlayıcılar ön plan servisi ile arka planda da çalışmaya devam eder.
 */
class TimerManager(private val context: Context) {
    private val _timers = MutableStateFlow<List<KitchenTimer>>(emptyList())
    val timers: StateFlow<List<KitchenTimer>> = _timers.asStateFlow()

    private val _stopwatch = MutableStateFlow(Stopwatch())
    val stopwatch: StateFlow<Stopwatch> = _stopwatch.asStateFlow()

    /** UI'ı saniyede birkaç kez yenilemek için tik akışı */
    private val _tick = MutableStateFlow(SystemClock.elapsedRealtime())
    val tick: StateFlow<Long> = _tick.asStateFlow()

    /** Süresi dolan ve henüz kapatılmamış zamanlayıcılar (uygulama içi uyarı için) */
    private val _ringing = MutableStateFlow<List<KitchenTimer>>(emptyList())
    val ringing: StateFlow<List<KitchenTimer>> = _ringing.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var loop: Job? = null

    private fun ensureLoop() {
        if (loop?.isActive == true) return
        loop = scope.launch {
            while (isActive) {
                val now = SystemClock.elapsedRealtime()
                _tick.value = now
                val list = _timers.value
                val newlyFinished = list.filter { it.running && it.remaining(now) <= 0 }
                if (newlyFinished.isNotEmpty()) {
                    _timers.value = list.map { t -> if (newlyFinished.any { it.id == t.id }) t.copy(finished = true, endAt = null, pausedRemaining = 0) else t }
                    newlyFinished.forEach { onFinished(it) }
                }
                val anyActive = _timers.value.any { it.running } || _stopwatch.value.running
                if (!anyActive && _ringing.value.isEmpty()) {
                    TimerService.update(context)
                    break
                }
                delay(250)
            }
        }
    }

    fun start(label: String, minutes: Double, recipeId: String? = null, recipeTitle: String? = null, stepIndex: Int? = null): String {
        val ms = (minutes * 60_000).toLong().coerceAtLeast(1000)
        val id = UUID.randomUUID().toString()
        val t = KitchenTimer(id, label, recipeId, recipeTitle, stepIndex, ms, SystemClock.elapsedRealtime() + ms, ms)
        _timers.value = _timers.value + t
        ensureLoop()
        TimerService.update(context)
        return id
    }

    fun pause(id: String) {
        val now = SystemClock.elapsedRealtime()
        _timers.value = _timers.value.map { if (it.id == id && it.running) it.copy(pausedRemaining = it.remaining(now), endAt = null) else it }
        TimerService.update(context)
    }

    fun resume(id: String) {
        val now = SystemClock.elapsedRealtime()
        _timers.value = _timers.value.map { if (it.id == id && !it.running && !it.finished) it.copy(endAt = now + it.pausedRemaining) else it }
        ensureLoop()
        TimerService.update(context)
    }

    fun addTime(id: String, minutes: Int) {
        val delta = minutes * 60_000L
        _timers.value = _timers.value.map {
            when {
                it.id != id -> it
                it.finished -> it.copy(finished = false, endAt = SystemClock.elapsedRealtime() + delta, totalMs = delta, pausedRemaining = delta)
                it.running -> it.copy(endAt = it.endAt!! + delta, totalMs = it.totalMs + delta)
                else -> it.copy(pausedRemaining = it.pausedRemaining + delta, totalMs = it.totalMs + delta)
            }
        }
        _ringing.value = _ringing.value.filter { it.id != id }
        ensureLoop()
        TimerService.update(context)
    }

    fun cancel(id: String) {
        _timers.value = _timers.value.filter { it.id != id }
        dismiss(id)
        TimerService.update(context)
    }

    fun dismiss(id: String) {
        _ringing.value = _ringing.value.filter { it.id != id }
        NotificationManagerCompat.from(context).cancel(id.hashCode())
        if (_timers.value.any { it.id == id && it.finished }) _timers.value = _timers.value.filter { it.id != id }
        TimerService.update(context)
    }

    fun timerForStep(recipeId: String, stepIndex: Int): KitchenTimer? =
        _timers.value.firstOrNull { it.recipeId == recipeId && it.stepIndex == stepIndex }

    // ----- Kronometre -----
    fun stopwatchStart(recipeId: String?, phase: String) {
        val sw = _stopwatch.value
        val now = SystemClock.elapsedRealtime()
        _stopwatch.value = if (sw.recipeId != recipeId) Stopwatch(recipeId, phase, now) else sw.copy(phase = phase, startedAt = sw.startedAt ?: now)
        ensureLoop()
        TimerService.update(context)
    }

    fun stopwatchPause() {
        val sw = _stopwatch.value
        val now = SystemClock.elapsedRealtime()
        _stopwatch.value = sw.copy(accumulated = sw.elapsed(now), startedAt = null)
        TimerService.update(context)
    }

    fun stopwatchLap(label: String) {
        val sw = _stopwatch.value
        _stopwatch.value = sw.copy(laps = sw.laps + (label to sw.elapsed()))
    }

    fun stopwatchSwitchPhase(phase: String) {
        val sw = _stopwatch.value
        _stopwatch.value = sw.copy(phase = phase, laps = sw.laps + ("${sw.phase} bitti" to sw.elapsed()))
    }

    fun stopwatchReset(recipeId: String?) {
        _stopwatch.value = Stopwatch(recipeId)
        TimerService.update(context)
    }

    private fun onFinished(t: KitchenTimer) {
        _ringing.value = _ringing.value + t
        val app = context.applicationContext as TarifProApp
        val s = app.container.settings.value
        if (s.timerVibrate) vibrate()
        val notifier = app.container.notifier
        if (!notifier.canPost()) return
        val n = NotificationCompat.Builder(context, Notifier.CH_TIMER_ALARM)
            .setSmallIcon(R.drawable.ic_stat_tarif)
            .setColor(0xFFA3123A.toInt())
            .setContentTitle("⏰ Süre doldu: ${t.label}")
            .setContentText(t.recipeTitle ?: "Zamanlayıcı tamamlandı")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setSilent(!s.timerSound)
            .setContentIntent(notifier.contentIntent(t.recipeId?.let { "recipe/$it?tab=2" } ?: "timers", t.id.hashCode()))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(t.id.hashCode(), n)
        } catch (e: SecurityException) {
            // bildirim izni yok
        }
    }

    private fun vibrate() {
        try {
            val v = ContextCompat.getSystemService(context, Vibrator::class.java) ?: return
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 500, 250, 500, 250, 800), -1))
        } catch (e: Exception) {
            // titreşim yok
        }
    }

    fun buildOngoingNotification(): Notification? {
        val now = SystemClock.elapsedRealtime()
        val active = _timers.value.filter { it.running }.sortedBy { it.remaining(now) }
        val sw = _stopwatch.value
        if (active.isEmpty() && !sw.running) return null
        val app = context.applicationContext as TarifProApp
        val b = NotificationCompat.Builder(context, Notifier.CH_TIMER_RUNNING)
            .setSmallIcon(R.drawable.ic_stat_tarif)
            .setColor(0xFFA3123A.toInt())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        if (active.isNotEmpty()) {
            val first = active.first()
            val remaining = first.remaining(now)
            b.setContentTitle("⏳ ${first.label}")
                .setContentText(
                    (first.recipeTitle ?: "Mutfak zamanlayıcısı") +
                        if (active.size > 1) " • +${active.size - 1} zamanlayıcı daha" else "",
                )
                .setUsesChronometer(true)
                .setWhen(System.currentTimeMillis() + remaining)
                .setShowWhen(true)
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true)
            b.setContentIntent(app.container.notifier.contentIntent(first.recipeId?.let { "recipe/$it?tab=2" } ?: "timers", 4242))
        } else {
            b.setContentTitle("⏱️ Kronometre: ${sw.phase}")
                .setContentText("Hazırlık ve pişirme süreniz ölçülüyor")
                .setUsesChronometer(true)
                .setWhen(System.currentTimeMillis() - sw.elapsed(now))
                .setShowWhen(true)
                .setContentIntent(app.container.notifier.contentIntent("timers", 4243))
        }
        return b.build()
    }

    fun hasActive(): Boolean = _timers.value.any { it.running } || _stopwatch.value.running
}

class TimerService : Service() {
    companion object {
        private const val NOTIFICATION_ID = 7001

        @Volatile
        var isRunning = false

        fun update(context: Context) {
            val app = context.applicationContext as TarifProApp
            val active = app.container.timers.hasActive()
            val intent = Intent(context, TimerService::class.java).putExtra("fg", active)
            try {
                if (active) {
                    ContextCompat.startForegroundService(context, intent)
                } else if (isRunning) {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                // Arka plandan başlatma kısıtlaması: zamanlayıcı uygulama içinde çalışmaya devam eder
            }
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val app = application as TarifProApp
        val fromForegroundStart = intent?.getBooleanExtra("fg", true) ?: true
        val notification = app.container.timers.buildOngoingNotification()
        if (notification == null && !fromForegroundStart) {
            stopSelf()
            return START_NOT_STICKY
        }
        val shown = notification ?: NotificationCompat.Builder(this, Notifier.CH_TIMER_RUNNING)
            .setSmallIcon(R.drawable.ic_stat_tarif)
            .setContentTitle("Zamanlayıcılar")
            .setSilent(true)
            .build()
        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, shown,
                if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
            )
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (notification == null) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        if (job?.isActive != true) {
            job = scope.launch {
                while (isActive) {
                    delay(3000)
                    val n = app.container.timers.buildOngoingNotification()
                    if (n == null) {
                        stopSelf(); break
                    }
                    try {
                        NotificationManagerCompat.from(this@TimerService).notify(NOTIFICATION_ID, n)
                    } catch (e: SecurityException) {
                        // izin yok
                    }
                }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        scope.coroutineContext[Job]?.cancel()
        super.onDestroy()
    }
}
