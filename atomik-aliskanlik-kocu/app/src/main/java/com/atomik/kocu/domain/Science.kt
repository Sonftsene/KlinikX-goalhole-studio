package com.atomik.kocu.domain

import com.atomik.kocu.data.BodyInfo
import com.atomik.kocu.data.Dates
import kotlin.math.roundToInt

data class Questionnaire(
    val type: String,
    val title: String,
    val emoji: String,
    val subtitle: String,
    val prompt: String,
    val items: List<String>,
    val options: List<String>,
    val scores: List<Int>,
    val source: String,
)

data class Band(val label: String, val text: String, val severity: Int)

object Assessments {
    private val freq = listOf("Hiç", "Birkaç gün", "Günlerin yarısından fazlası", "Neredeyse her gün")

    val PHQ9 = Questionnaire(
        type = "PHQ9", title = "Ruh Hali Taraması", emoji = "🌧️", subtitle = "PHQ-9 · 9 soru · 2 dk",
        prompt = "Son 2 hafta içinde, aşağıdakilerden ne sıklıkla rahatsız oldun?",
        items = listOf(
            "Bir şeyler yapmaya karşı ilgi ya da zevk duymamak",
            "Kendini çökkün, depresif ya da umutsuz hissetmek",
            "Uykuya dalmakta veya sürdürmekte güçlük ya da çok fazla uyumak",
            "Yorgun hissetmek ya da enerjinin az olması",
            "İştahsızlık ya da aşırı yemek",
            "Kendini kötü hissetmek; başarısız olduğunu ya da çevreni hayal kırıklığına uğrattığını düşünmek",
            "Okumak ya da bir şey izlemek gibi işlere odaklanmakta güçlük",
            "Başkalarının fark edeceği kadar yavaş hareket etmek ya da tam tersi yerinde duramamak",
            "Ölmüş olmanın daha iyi olacağını ya da kendine zarar vermeyi düşünmek",
        ),
        options = freq, scores = listOf(0, 1, 2, 3),
        source = "Kroenke, Spitzer & Williams, 2001",
    )

    val GAD7 = Questionnaire(
        type = "GAD7", title = "Kaygı Taraması", emoji = "🌊", subtitle = "GAD-7 · 7 soru · 2 dk",
        prompt = "Son 2 hafta içinde, aşağıdakilerden ne sıklıkla rahatsız oldun?",
        items = listOf(
            "Sinirli, kaygılı ya da diken üstünde hissetmek",
            "Endişelenmeyi durduramamak ya da kontrol edememek",
            "Farklı şeyler hakkında çok fazla endişelenmek",
            "Gevşemekte zorlanmak",
            "Yerinde duramayacak kadar huzursuz olmak",
            "Kolayca canı sıkılmak ya da sinirlenmek",
            "Korkunç bir şey olacakmış gibi korku hissetmek",
        ),
        options = freq, scores = listOf(0, 1, 2, 3),
        source = "Spitzer ve ark., 2006",
    )

    val SCOFF = Questionnaire(
        type = "SCOFF", title = "Yeme Davranışı Kontrolü", emoji = "🍽️", subtitle = "SCOFF · 5 soru · 1 dk",
        prompt = "Kendine karşı dürüst ol, cevaplar sadece bu cihazda kalır.",
        items = listOf(
            "Rahatsız edici derecede tok hissettiğin için kendini kusturduğun olur mu?",
            "Ne kadar yediğin üzerindeki kontrolü kaybettiğinden endişelenir misin?",
            "Son 3 ayda 6 kilodan fazla verdin mi?",
            "Başkaları çok zayıf olduğunu söylerken kendini şişman olarak görür müsün?",
            "Yemeğin hayatına hâkim olduğunu söyleyebilir misin?",
        ),
        options = listOf("Hayır", "Evet"), scores = listOf(0, 1),
        source = "Morgan, Reid & Lacey, 1999",
    )

    fun srbai(habitTitle: String) = Questionnaire(
        type = "SRBAI", title = "Otomatiklik Testi", emoji = "🔍", subtitle = "SRBAI · 4 soru · 30 sn",
        prompt = "“$habitTitle” benim için…",
        items = listOf(
            "…otomatik olarak yaptığım bir şey.",
            "…bilinçli olarak hatırlamak zorunda kalmadan yaptığım bir şey.",
            "…düşünmeden yaptığım bir şey.",
            "…farkına varmadan başladığım bir şey.",
        ),
        options = listOf("Kesinlikle hayır", "Hayır", "Biraz hayır", "Kararsızım", "Biraz evet", "Evet", "Kesinlikle evet"),
        scores = listOf(1, 2, 3, 4, 5, 6, 7),
        source = "Gardner, Abraham, Lally & de Bruijn, 2012",
    )

    val all = listOf(PHQ9, GAD7, SCOFF)
    fun byType(type: String) = all.firstOrNull { it.type == type }

    fun maxScore(q: Questionnaire) = q.items.size * q.scores.max()

    /** SRBAI puanını yüzdeye çevirir (4..28 -> 0..100). */
    fun srbaiPercent(score: Int): Int = (((score - 4) / 24.0) * 100).roundToInt().coerceIn(0, 100)

    fun band(type: String, score: Int): Band = when (type) {
        "PHQ9" -> when {
            score <= 4 -> Band("Minimal", "Belirtiler çok az. Koruyucu alışkanlıklarını sürdür.", 0)
            score <= 9 -> Band("Hafif", "Hafif belirtiler. Hareket, uyku ve sosyal bağ alışkanlıkları iyi gelebilir; 2 hafta sonra tekrar ölç.", 1)
            score <= 14 -> Band("Orta", "Orta düzey belirtiler. Bir uzmanla (psikolog/psikiyatrist ya da aile hekimin) görüşmen önerilir.", 2)
            score <= 19 -> Band("Orta-şiddetli", "Belirtiler belirgin. Bir ruh sağlığı uzmanına başvurman önemle önerilir.", 3)
            else -> Band("Şiddetli", "Belirtiler şiddetli. Lütfen en kısa sürede bir uzmana başvur. Yalnız değilsin.", 3)
        }
        "GAD7" -> when {
            score <= 4 -> Band("Minimal", "Kaygı düzeyin düşük görünüyor.", 0)
            score <= 9 -> Band("Hafif", "Hafif kaygı. Nefes, hareket ve uyku düzeni destek olabilir.", 1)
            score <= 14 -> Band("Orta", "Orta düzey kaygı. Bir uzmanla görüşmek faydalı olabilir.", 2)
            else -> Band("Şiddetli", "Kaygı belirtilerin yüksek. Bir ruh sağlığı uzmanına başvurman önerilir.", 3)
        }
        "SCOFF" -> if (score >= 2) Band("Dikkat", "2 veya daha fazla “evet”, yeme bozukluğu açısından bir uzmanla görüşmeyi gerektirebilir. Kilo verme programları senin için kapatıldı; önce destek almak en iyisi.", 3)
        else Band("Olağan", "Belirgin bir risk işareti yok.", 0)
        "SRBAI" -> {
            val p = srbaiPercent(score)
            when {
                p < 35 -> Band("Kurulum aşaması", "Henüz bilinçli çaba istiyor. İpucunu daha görünür, versiyonu daha küçük yap.", 1)
                p < 70 -> Band("Oluşuyor", "Beynin bu yolu öğreniyor. Aynı ipucunda tekrar etmeye devam.", 0)
                else -> Band("Otomatik", "Bu artık senin bir parçan. Goldilocks kuralıyla biraz zorlaştırmayı düşünebilirsin.", 0)
            }
        }
        else -> Band("", "", 0)
    }
}

object Body {
    val activityLabels = listOf("Hareketsiz", "Az aktif", "Orta aktif", "Çok aktif", "Sporcu")
    private val factors = listOf(1.2, 1.375, 1.55, 1.725, 1.9)

    fun age(b: BodyInfo) = (Dates.year() - b.birthYear).coerceIn(10, 100)
    fun bmi(b: BodyInfo): Double { val m = b.heightCm / 100.0; return b.weightKg / (m * m) }
    fun bmiAt(b: BodyInfo, kg: Double): Double { val m = b.heightCm / 100.0; return kg / (m * m) }
    fun bmiLabel(v: Double) = when {
        v < 18.5 -> "Zayıf"
        v < 25 -> "Normal"
        v < 30 -> "Fazla kilolu"
        else -> "Obez"
    }

    /** Mifflin-St Jeor (1990) bazal metabolizma */
    fun bmr(b: BodyInfo): Double = 10 * b.weightKg + 6.25 * b.heightCm - 5 * age(b) + if (b.female) -161 else 5
    fun tdee(b: BodyInfo): Int = (bmr(b) * factors[b.activity.coerceIn(0, 4)]).roundToInt()

    fun wantsLoss(b: BodyInfo) = b.targetKg < b.weightKg - 0.4
    fun wantsGain(b: BodyInfo) = b.targetKg > b.weightKg + 0.4

    fun targetCalories(b: BodyInfo): Int {
        val t = tdee(b)
        val floor = if (b.female) 1200 else 1500
        return when {
            wantsLoss(b) -> maxOf(t - 500, floor)
            wantsGain(b) -> t + 350
            else -> t
        }
    }

    fun proteinRange(b: BodyInfo): Pair<Int, Int> =
        if (wantsGain(b)) (b.weightKg * 1.6).roundToInt() to (b.weightKg * 2.2).roundToInt()
        else (b.weightKg * 1.2).roundToInt() to (b.weightKg * 1.6).roundToInt()

    fun waterLiters(b: BodyInfo): Double = (b.weightKg * 0.033 * 10).roundToInt() / 10.0

    /** Güvenli hızla (verme: 0,5 kg/hafta, alma: 0,25 kg/hafta) hedefe hafta sayısı */
    fun weeksToTarget(b: BodyInfo): Int? = when {
        wantsLoss(b) -> ((b.weightKg - b.targetKg) / 0.5).roundToInt().coerceAtLeast(1)
        wantsGain(b) -> ((b.targetKg - b.weightKg) / 0.25).roundToInt().coerceAtLeast(1)
        else -> null
    }

    /** Zayıf kategorisindeyken ya da hedef zayıf aralığa düşüyorsa kilo verme programı güvenli değildir. */
    fun lossUnsafe(b: BodyInfo) = wantsLoss(b) && (bmi(b) < 18.5 || bmiAt(b, b.targetKg) < 18.5)
}
