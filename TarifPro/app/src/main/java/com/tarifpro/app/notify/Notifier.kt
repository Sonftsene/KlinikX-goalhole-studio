package com.tarifpro.app.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.tarifpro.app.MainActivity
import com.tarifpro.app.R
import com.tarifpro.app.data.SettingsStore
import java.util.Calendar

object NotifType {
    const val COMMENT = "comment"
    const val RATING = "rating"
    const val FOLLOW = "follow"
    const val MESSAGE = "message"
    const val CHANNEL = "channel"
    const val RECIPE = "recipe"
    const val ANNOUNCEMENT = "announcement"
    const val MODERATION = "moderation"
    const val INFO = "info"
}

class Notifier(private val context: Context, private val settings: SettingsStore) {

    companion object {
        const val CH_TIMER_ALARM = "timer_alarm_v2"
        const val CH_TIMER_RUNNING = "timer_running"
        const val CH_SOCIAL = "social"
        const val CH_COMMENTS = "comments"
        const val CH_MESSAGES = "messages"
        const val CH_RECIPES = "recipes"
        const val CH_ANNOUNCE = "announcements"
        const val EXTRA_ROUTE = "route"
    }

    fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        val alarm = NotificationChannel(CH_TIMER_ALARM, "Zamanlayıcı alarmı", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Pişirme süresi dolduğunda çalar"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 900)
            setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
            )
        }
        val running = NotificationChannel(CH_TIMER_RUNNING, "Çalışan zamanlayıcılar", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Geri sayım devam ederken gösterilir"
            setShowBadge(false)
        }
        nm.createNotificationChannels(
            listOf(
                alarm, running,
                NotificationChannel(CH_SOCIAL, "Takip ve puanlar", NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CH_COMMENTS, "Yorumlar", NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CH_MESSAGES, "Mesajlar", NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CH_RECIPES, "Yeni tarifler", NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(CH_ANNOUNCE, "Duyurular", NotificationManager.IMPORTANCE_DEFAULT),
            ),
        )
    }

    fun canPost(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun isQuietNow(): Boolean {
        val s = settings.value
        if (!s.quietHours) return false
        val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return if (s.quietStart <= s.quietEnd) h in s.quietStart until s.quietEnd else (h >= s.quietStart || h < s.quietEnd)
    }

    fun allowed(type: String): Boolean {
        val s = settings.value
        return when (type) {
            NotifType.COMMENT -> s.notifyComments
            NotifType.RATING -> s.notifyRatings
            NotifType.FOLLOW -> s.notifyFollowers
            NotifType.MESSAGE -> s.notifyMessages
            NotifType.CHANNEL -> s.notifyChannels
            NotifType.RECIPE -> s.notifyNewRecipes
            NotifType.ANNOUNCEMENT, NotifType.MODERATION -> s.notifyAnnouncements
            else -> true
        }
    }

    fun contentIntent(route: String?, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            route?.let { putExtra(EXTRA_ROUTE, it) }
        }
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Kullanıcının bildirim tercihlerine ve sessiz saatlere uyarak bildirim gösterir. */
    fun post(type: String, title: String, body: String, route: String? = null, id: Int = (title + body).hashCode()) {
        if (!allowed(type) || isQuietNow() || !canPost()) return
        val channel = when (type) {
            NotifType.COMMENT -> CH_COMMENTS
            NotifType.MESSAGE, NotifType.CHANNEL -> CH_MESSAGES
            NotifType.RECIPE -> CH_RECIPES
            NotifType.ANNOUNCEMENT, NotifType.MODERATION, NotifType.INFO -> CH_ANNOUNCE
            else -> CH_SOCIAL
        }
        val n = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_tarif)
            .setColor(0xFFA3123A.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(contentIntent(route, id))
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, n)
        } catch (e: SecurityException) {
            // izin yok
        }
    }
}
