package com.atomik.kocu.domain

import com.atomik.kocu.content.Insights
import com.atomik.kocu.data.AppData
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.Profile

data class DirectorNote(val title: String, val text: String, val action: String? = null, val route: String? = null, val urgent: Boolean = false)

/**
 * "Yönetmen": kural tabanlı, çevrimdışı koç. Verilere bakar ve o an en çok işe yarayacak tek bir notu seçer.
 */
object Coach {
    fun notes(d: AppData, p: Profile, s: Stats): List<DirectorNote> {
        val out = mutableListOf<DirectorNote>()
        val habits = s.habitsOf(p.id)
        val today = s.today

        if (habits.isEmpty()) {
            out += DirectorNote("Sahne boş", "Filmin başrolü hazır ama sahnede hiç oyuncu yok. Tek bir küçük alışkanlıkla başla.", "Sahne ekle", "habit_new", true)
            return out
        }

        // Kriz sinyali: yakın zamanda yüksek PHQ-9 / 9. madde
        val lastPhq = d.assessments.filter { it.profileId == p.id && it.type == "PHQ9" }.maxByOrNull { it.time }
        if (lastPhq != null && today - Dates.dayOf(lastPhq.time) <= 14 && (lastPhq.answers.getOrNull(8) ?: 0) > 0) {
            out += DirectorNote("Önce sen", "Son taramanda zor düşüncelerden bahsettin. Bu filmde en önemli şey senin güvenliğin. Destek almak bir güç göstergesidir.", "Destek hatları", "crisis", true)
        }

        // İki kez kaçırma kuralı
        val missed = s.missedYesterday(habits)
        val twice = habits.filter { s.missedTwoDays(it) }
        if (twice.isNotEmpty()) {
            out += DirectorNote("Kırmızı alarm: ${twice.first().title}", "İki gündür bu sahne çekilmedi. Bugün sadece mini versiyonu yap: “${twice.first().tinyVersion.ifBlank { "2 dakika" }}”. Zinciri kurtarmak için yeterli.", urgent = true)
        } else if (missed.isNotEmpty()) {
            out += DirectorNote("Asla iki kez kaçırma", "Dün ${missed.size} sahne kaçtı. Sorun değil — bir kez kaçırmak kazadır. Bugün geri dönersen hikâye bozulmaz.", urgent = true)
        }

        // Ruh hali düşüşü -> davranışsal aktivasyon
        val recentMoods = d.moods.filter { it.profileId == p.id && it.day >= today - 4 }.sortedBy { it.day }
        if (recentMoods.size >= 3 && recentMoods.takeLast(3).all { it.mood <= 2 }) {
            out += DirectorNote("Işıkları biraz aç", "Son günlerde ruh halin düşük. Motivasyonu beklemek yerine küçük bir eylemle başla: 10 dakika dışarı çık ya da birine mesaj at. Eylem çoğu zaman duygudan önce gelir.", "Zihin araçları", "mind")
        }

        // Goldilocks: zorlanma / sıkılma
        habits.filter { it.kind == HabitKind.BUILD && today - it.createdEpochDay >= 7 }.forEach { h ->
            val r = s.rate(h, 7)
            if (r < 0.4f) {
                out += DirectorNote("Sahneyi küçült: ${h.title}", "Son 7 günde %${(r * 100).toInt()}. Çok mu büyük? Versiyonu yarıya indir. Küçük ama her gün > büyük ama ara sıra.", "Düzenle", "habit_edit/${h.id}")
            } else if (today - h.createdEpochDay >= 21 && s.rate(h, 21) >= 0.9f && Chapters.unlocked(Chapters.all[7], s.dayIndex(p), s.votes(p.id))) {
                out += DirectorNote("Seviye atlama zamanı: ${h.title}", "21 gündür %90+ başarı. Altın bölgede kalmak için biraz zorlaştır (yaklaşık %5).", "Büyüt", "habit_edit/${h.id}")
            }
        }

        // Dürtü tetikleyicisi örüntüsü
        val urges = d.urges.filter { it.profileId == p.id && it.time > System.currentTimeMillis() - 14L * 86_400_000 }
        val topTrigger = urges.groupingBy { it.trigger }.eachCount().maxByOrNull { it.value }
        if (topTrigger != null && topTrigger.value >= 3 && topTrigger.key.isNotBlank()) {
            out += DirectorNote("Gölgenin izi bulundu", "Son 2 haftada dürtülerinin çoğu “${topTrigger.key}” anında geldi. O ana bir yedek plan yaz: “Eğer ${topTrigger.key.lowercase(Dates.TR)} olursa, …”", "Dürtü SOS", "urge")
        }

        // Kapsül açılabilir
        d.capsules.firstOrNull { it.profileId == p.id && !it.opened && it.openDay <= today }?.let {
            out += DirectorNote("Bir mektup geldi", "Geçmişteki sen sana bir şey söylemek istiyor. Zaman kapsülü açılmaya hazır.", "Aç", "capsule", true)
        }

        // Seri kilometre taşları
        val best = habits.maxByOrNull { s.streak(it) }
        if (best != null) {
            val st = s.streak(best)
            if (st in listOf(3, 7, 14, 21, 30, 50, 66, 100)) {
                out += DirectorNote("$st günlük seri!", "“${best.title}” artık senin hikâyenin bir parçası. Bu sahneyi bir kart olarak paylaş, hesap verebilirlik bağlılığı güçlendirir.", "Paylaş", "share_streak/${best.id}")
            }
        }

        // En iyi gün içgörüsü
        if (today - p.startEpochDay >= 14) {
            val rates = s.weekdayRates(habits)
            val bestDay = rates.indices.maxByOrNull { rates[it] } ?: 0
            val worstDay = rates.indices.minByOrNull { rates[it] } ?: 0
            if (rates[bestDay] - rates[worstDay] > 0.3f) {
                out += DirectorNote("Gizli örüntü", "${Dates.dayNames[bestDay]} günleri yıldızsın (%${(rates[bestDay] * 100).toInt()}), ${Dates.dayNames[worstDay]} günleri zorlanıyorsun (%${(rates[worstDay] * 100).toInt()}). ${Dates.dayNames[worstDay]} için ipucunu değiştirmeyi dene.")
            }
        }

        // Varsayılan: günün yönetmen notu
        val tips = Insights.directorTips
        if (tips.isNotEmpty()) out += DirectorNote("Yönetmenin notu", tips[((today + p.name.length) % tips.size).toInt()])
        return out
    }

    fun top(d: AppData, p: Profile, s: Stats): DirectorNote = notes(d, p, s).first()
}
