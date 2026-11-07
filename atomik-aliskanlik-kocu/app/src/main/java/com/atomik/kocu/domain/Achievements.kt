package com.atomik.kocu.domain

import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.Profile

data class Achievement(val id: String, val emoji: String, val title: String, val description: String)

object Achievements {
    val all = listOf(
        Achievement("first_vote", "⚛️", "İlk Atom", "İlk kimlik oyunu verdin."),
        Achievement("streak3", "🔥", "Kıvılcım", "3 günlük seri."),
        Achievement("streak7", "🎞️", "Bir Haftalık Film", "7 günlük seri."),
        Achievement("streak21", "🧭", "Efsaneyi Aşan", "21 gün: efsaneyi geçtin, gerçeğe devam."),
        Achievement("streak30", "🌕", "Dolunay", "30 günlük seri."),
        Achievement("streak66", "🛸", "Otomatik Pilot", "66 günlük seri."),
        Achievement("votes50", "🗳️", "Seçim Kazanıldı", "50 kimlik oyu."),
        Achievement("votes250", "🏛️", "Anayasa", "250 kimlik oyu."),
        Achievement("perfect7", "💎", "Kusursuz Hafta", "7 kusursuz gün."),
        Achievement("mood7", "🌈", "Duygu Haritacısı", "7 ruh hali kaydı."),
        Achievement("thought1", "🧠", "Zihin Dedektifi", "İlk düşünce kaydı."),
        Achievement("urge1", "🌊", "Dalga Sörfçüsü", "Bir dürtüyü yendin."),
        Achievement("urge10", "🏄", "Fırtına Avcısı", "10 dürtüyü yendin."),
        Achievement("cards10", "🗂️", "Arşivci", "10 gizli dosya topladın."),
        Achievement("cards30", "🕵️", "Baş Dedektif", "30 gizli dosya topladın."),
        Achievement("capsule", "⏳", "Zaman Yolcusu", "Geleceğe bir mesaj gönderdin."),
        Achievement("breaker", "⛓️", "Zincir Kıran", "Bir kötü alışkanlıkta 14 temiz gün."),
        Achievement("comeback", "🦅", "Geri Dönüş", "Kaçırdıktan sonra hemen ertesi gün döndün."),
    )

    fun byId(id: String) = all.firstOrNull { it.id == id }

    fun earned(d: AppData, p: Profile, s: Stats): Set<String> {
        val out = mutableSetOf<String>()
        val votes = s.votes(p.id)
        val best = s.bestEverStreak(p.id)
        if (votes >= 1) out += "first_vote"
        if (best >= 3) out += "streak3"
        if (best >= 7) out += "streak7"
        if (best >= 21) out += "streak21"
        if (best >= 30) out += "streak30"
        if (best >= 66) out += "streak66"
        if (votes >= 50) out += "votes50"
        if (votes >= 250) out += "votes250"
        if (s.perfectDays(p.id) >= 7) out += "perfect7"
        if (d.moods.count { it.profileId == p.id } >= 7) out += "mood7"
        if (d.thoughts.any { it.profileId == p.id }) out += "thought1"
        val resisted = d.urges.count { it.profileId == p.id && it.resisted }
        if (resisted >= 1) out += "urge1"
        if (resisted >= 10) out += "urge10"
        if (p.revealedCards.size >= 10) out += "cards10"
        if (p.revealedCards.size >= 30) out += "cards30"
        if (d.capsules.any { it.profileId == p.id }) out += "capsule"
        val habits = d.habits.filter { it.profileId == p.id }
        if (habits.any { it.kind == HabitKind.BREAK && s.streak(it) >= 14 }) out += "breaker"
        val today = s.today
        if (habits.any { h ->
                (3..60).any { back ->
                    val miss = today - back
                    val ret = miss + 1
                    com.atomik.kocu.data.Dates.isScheduled(h, miss) && h.createdEpochDay < miss &&
                        !s.completed(h, miss) && s.log(h.id, miss) == null && s.completed(h, ret) && s.completed(h, miss - 1)
                }
            }) out += "comeback"
        return out
    }
}
