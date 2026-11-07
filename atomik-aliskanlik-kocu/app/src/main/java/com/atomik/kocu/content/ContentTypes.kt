package com.atomik.kocu.content

import com.atomik.kocu.data.HabitKind

/** Kullanıcının seçebileceği hikâyeler (hedefler). */
enum class Goal(val title: String, val emoji: String, val tagline: String) {
    LOSE_WEIGHT("Kilo vermek", "🔥", "Hafiflemek, enerjiyi geri almak"),
    GAIN_WEIGHT("Kilo almak", "💪", "Güçlenmek, sağlıklı kütle kazanmak"),
    MOOD("Moral & mutluluk", "☀️", "Daha neşeli ve umutlu günler"),
    ANXIETY("Kaygı & stres", "🌊", "Zihni sakinleştirmek"),
    SLEEP("Derin uyku", "🌙", "Dinlenmiş uyanmak"),
    QUIT_SMOKING("Sigarayı bırakmak", "🚭", "Nefesini geri kazanmak"),
    DIGITAL("Telefon bağımlılığı", "📵", "Dikkatini geri almak"),
    FOCUS("Odak & ders", "🎯", "Derin çalışma ve öğrenme"),
    FITNESS("Spor & form", "🏃", "Hareketi hayatın parçası yapmak"),
    GROWTH("Okuma & gelişim", "📚", "Her gün biraz daha bilge"),
    PROCRASTINATION("Ertelemeyi yenmek", "⏳", "Başlamayı kolaylaştırmak"),
    RELATIONSHIPS("İlişkiler & bağ", "🤝", "Sevdiklerinle daha yakın"),
}

enum class Rarity(val label: String) { COMMON("Sıradan"), RARE("Nadir"), EPIC("Destansı"), LEGENDARY("Efsanevi") }

data class HabitTemplate(
    val id: String,
    val goal: Goal,
    val title: String,
    val emoji: String,
    val kind: HabitKind = HabitKind.BUILD,
    val identity: String,
    val cue: String,
    val anchor: String,
    val attractor: String,
    val tinyVersion: String,
    val environment: String,
    val reward: String,
    val target: Int = 1,
    val unit: String = "",
    /** Gün içindeki dakika (ör. 7*60+30) ya da null */
    val defaultMinute: Int? = null,
    /** Kısa bilimsel gerekçe + kaynak */
    val science: String,
)

data class InsightCard(
    val id: String,
    val title: String,
    val body: String,
    val source: String,
    val rarity: Rarity,
    val category: String,
)

data class Reference(val authors: String, val year: Int, val title: String, val where: String, val usedFor: String)
