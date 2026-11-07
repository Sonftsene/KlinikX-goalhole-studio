package com.atomik.kocu.notify

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.atomik.kocu.MainActivity
import com.atomik.kocu.R
import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.LogStatus
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Stats
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

object Reminders {
    const val CH_HABITS = "habits"
    const val CH_EVENING = "evening"
    private const val EVENING_CODE = 770077
    private var lastSignature: String? = null

    fun createChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_HABITS, "Sahne hatırlatıcıları", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Alışkanlıkların zamanı geldiğinde"
        })
        nm.createNotificationChannel(NotificationChannel(CH_EVENING, "Akşam perdesi", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Gün kapanmadan kısa bir kontrol"
        })
    }

    private fun signature(d: AppData): String =
        d.settings.remindersEnabled.toString() + d.settings.eveningCheckInMinute + d.profiles.size +
            d.habits.joinToString { "${it.id}:${it.reminderMinute}:${it.archived}" }

    fun syncIfChanged(context: Context) {
        val d = Store.data.value
        val sig = signature(d)
        if (sig == lastSignature) return
        lastSignature = sig
        rescheduleAll(context)
    }

    fun rescheduleAll(context: Context) {
        val d = Store.data.value
        val am = context.getSystemService(AlarmManager::class.java)
        d.habits.forEach { h ->
            val pi = habitPendingIntent(context, h.id)
            am.cancel(pi)
            if (d.settings.remindersEnabled && !h.archived && h.reminderMinute != null) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger(h.reminderMinute), pi)
            }
        }
        val ev = eveningPendingIntent(context)
        am.cancel(ev)
        if (d.settings.remindersEnabled && d.profiles.isNotEmpty()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger(d.settings.eveningCheckInMinute), ev)
        }
    }

    fun nextTrigger(minute: Int): Long {
        val zone = ZoneId.systemDefault()
        val now = java.time.ZonedDateTime.now(zone)
        var t = LocalDate.now().atTime(LocalTime.of(minute / 60, minute % 60)).atZone(zone)
        if (!t.isAfter(now.plusSeconds(20))) t = t.plusDays(1)
        return t.toInstant().toEpochMilli()
    }

    private fun habitPendingIntent(context: Context, habitId: String): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).putExtra("habitId", habitId)
        return PendingIntent.getBroadcast(context, habitId.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun eveningPendingIntent(context: Context): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java).putExtra("evening", true)
        return PendingIntent.getBroadcast(context, EVENING_CODE, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun canNotify(context: Context) = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun openAppIntent(context: Context, code: Int): PendingIntent {
        val i = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private val habitLines = listOf(
        "Kamera hazır. Sadece mini versiyon yeter: %s",
        "Senaryoda sıradaki sahne bu. %s",
        "Bu, olmak istediğin kişiye bir oy. %s",
        "2 dakika. Hepsi bu. %s",
        "Yönetmen işaret verdi 🎬 %s",
    )

    fun showHabit(context: Context, habitId: String) {
        val d = Store.data.value
        val h = d.habits.firstOrNull { it.id == habitId } ?: return
        if (h.archived || !d.settings.remindersEnabled) return
        val today = Dates.today()
        if (!Dates.isScheduled(h, today)) return
        if (Stats(d, today).completed(h, today)) return
        if (!canNotify(context)) return
        val profileName = d.profiles.firstOrNull { it.id == h.profileId }?.name
        val detail = if (h.kind == HabitKind.BREAK) (h.tinyVersion.ifBlank { "Bugün temiz kal." })
        else h.tinyVersion.ifBlank { h.cue }
        val line = habitLines[(today % habitLines.size).toInt()].format(detail)
        val code = habitId.hashCode()
        val done = PendingIntent.getBroadcast(
            context, code + 1,
            Intent(context, HabitActionReceiver::class.java).putExtra("habitId", habitId).putExtra("status", LogStatus.DONE.name),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val tiny = PendingIntent.getBroadcast(
            context, code + 2,
            Intent(context, HabitActionReceiver::class.java).putExtra("habitId", habitId).putExtra("status", LogStatus.TINY.name),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CH_HABITS)
            .setSmallIcon(R.drawable.ic_stat_atom)
            .setContentTitle("${h.emoji} ${h.title}" + if (d.profiles.size > 1 && profileName != null) " · $profileName" else "")
            .setContentText(line)
            .setStyle(NotificationCompat.BigTextStyle().bigText(line))
            .setContentIntent(openAppIntent(context, code + 3))
            .setAutoCancel(true)
            .addAction(0, if (h.kind == HabitKind.BREAK) "✓ Temizim" else "✓ Yaptım", done)
            .apply { if (h.kind == HabitKind.BUILD) addAction(0, "⚡ Mini versiyon", tiny) }
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(code, n) }
    }

    fun showEvening(context: Context) {
        val d = Store.data.value
        if (!d.settings.remindersEnabled || !canNotify(context)) return
        val p = Store.activeProfile(d) ?: return
        val s = Stats(d)
        val habits = s.habitsOf(p.id)
        val (done, total) = s.dayProgress(habits)
        if (total == 0) return
        val title: String
        val text: String
        if (done < total) {
            title = "🎞️ Perde kapanmadan…"
            text = "${total - done} sahne çekilmeyi bekliyor. Mini versiyonlar da sayılır."
        } else if (p.lastRevealDay != s.today) {
            title = "🔓 Mühürlü dosya açıldı"
            text = "Bugünün filmi tamam. Sana özel gizli dosya seni bekliyor."
        } else return
        val n = NotificationCompat.Builder(context, CH_EVENING)
            .setSmallIcon(R.drawable.ic_stat_atom)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openAppIntent(context, EVENING_CODE))
            .setAutoCancel(true)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(EVENING_CODE, n) }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Store.init(context)
        if (intent.getBooleanExtra("evening", false)) Reminders.showEvening(context)
        intent.getStringExtra("habitId")?.let { Reminders.showHabit(context, it) }
        Reminders.rescheduleAll(context)
    }
}

class HabitActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Store.init(context)
        val id = intent.getStringExtra("habitId") ?: return
        val status = runCatching { LogStatus.valueOf(intent.getStringExtra("status") ?: "DONE") }.getOrDefault(LogStatus.DONE)
        val h = Store.data.value.habits.firstOrNull { it.id == id } ?: return
        Store.log(id, Dates.today(), status, if (status == LogStatus.DONE) h.target else 1)
        Store.saveNow()
        NotificationManagerCompat.from(context).cancel(id.hashCode())
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Store.init(context)
        Reminders.rescheduleAll(context)
    }
}
