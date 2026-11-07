package com.atomik.kocu.ui.screens

import android.content.Context
import com.atomik.kocu.content.InsightCard
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.share.ShareCards

/** Paylaşım kartlarını verilerden üretir. */
object ShareActions {
    private const val TAG = "#AtomikAlışkanlık"

    fun handle(context: Context, route: String) {
        when {
            route == "share_identity" -> identity(context)
            route == "share_final" -> final(context)
            route == "share_week" -> week(context)
            route.startsWith("share_streak/") -> streak(context, route.substringAfter("/"))
        }
    }

    fun identity(context: Context) {
        val d = Store.data.value; val p = Store.activeProfile(d) ?: return; val s = Stats(d)
        val votes = s.votes(p.id)
        ShareCards.share(
            context,
            ShareCards.Spec(
                kicker = "Kimlik manifestosu", title = p.identities.firstOrNull() ?: "Kendi hikâyemi yazıyorum",
                big = "$votes", bigLabel = "kimlik oyu",
                lines = p.identities.drop(1).take(3) + "Gün ${s.dayIndex(p)} · ${p.name}",
            ),
            "${p.identities.firstOrNull() ?: ""} — $votes kimlik oyu verdim. $TAG",
        )
    }

    fun final(context: Context) {
        val d = Store.data.value; val p = Store.activeProfile(d) ?: return; val s = Stats(d)
        ShareCards.share(
            context,
            ShareCards.Spec(
                kicker = "Final · Otomatik pilot", title = "${p.name} 66 günü tamamladı",
                big = "66", bigLabel = "gün",
                lines = listOf("${s.votes(p.id)} kimlik oyu", "En uzun seri: ${s.bestEverStreak(p.id)} gün", Dates.full(s.today)),
                accent = 0xFFE8B76A.toInt(),
            ),
            "66 günlük filmimin finalindeyim. Alışkanlıklar artık otomatik pilotta. $TAG",
        )
    }

    fun streak(context: Context, habitId: String) {
        val d = Store.data.value; val s = Stats(d)
        val h = d.habits.firstOrNull { it.id == habitId } ?: return
        val p = d.profiles.firstOrNull { it.id == h.profileId }
        val st = s.streak(h)
        ShareCards.share(
            context,
            ShareCards.Spec(
                kicker = "Seri · ${h.emoji}", title = h.title, big = "$st", bigLabel = "günlük seri",
                lines = listOfNotNull(h.identity.ifBlank { null }, "En iyi: ${s.bestStreak(h)} gün", p?.name),
                accent = com.atomik.kocu.ui.theme.Cine.habit(h.colorIndex).let { android.graphics.Color.argb(255, (it.red * 255).toInt(), (it.green * 255).toInt(), (it.blue * 255).toInt()) },
            ),
            "“${h.title}” sahnesinde $st günlük serideyim 🔥 $TAG",
        )
    }

    fun week(context: Context) {
        val d = Store.data.value; val p = Store.activeProfile(d) ?: return; val s = Stats(d)
        val habits = s.habitsOf(p.id)
        val rate = habits.map { s.rate(it, 7) }.average().takeIf { !it.isNaN() } ?: 0.0
        val star = habits.maxByOrNull { s.rate(it, 7) }
        val chapter = Chapters.current(s.dayIndex(p), s.votes(p.id))
        ShareCards.share(
            context,
            ShareCards.Spec(
                kicker = "Haftanın fragmanı", title = "${p.name}: ${chapter?.title ?: "Uyanış"}",
                big = "%${(rate * 100).toInt()}", bigLabel = "tutarlılık",
                lines = listOfNotNull(star?.let { "Yıldız sahne: ${it.emoji} ${it.title}" }, "${s.votes(p.id)} kimlik oyu", "Gün ${s.dayIndex(p)}"),
                accent = 0xFFFF5C8A.toInt(),
            ),
            "Haftamın fragmanı: %${(rate * 100).toInt()} tutarlılık. $TAG",
        )
    }

    fun card(context: Context, c: InsightCard) {
        ShareCards.share(
            context,
            ShareCards.Spec(kicker = "Gizli dosya · ${c.rarity.label}", title = c.title, big = "#" + c.id.drop(1), bigLabel = c.category, lines = listOf(c.body, c.source)),
            "${c.title}: ${c.body} (${c.source}) $TAG",
        )
    }
}
