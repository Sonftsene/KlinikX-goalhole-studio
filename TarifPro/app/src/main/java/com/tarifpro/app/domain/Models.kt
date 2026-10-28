package com.tarifpro.app.domain

/** Tarifin kimlerin görebileceği. */
enum class Visibility(val label: String, val description: String) {
    PUBLIC("Herkese Açık", "Tüm Tarif Pro kullanıcıları görebilir"),
    FOLLOWERS("Sadece Takipçiler", "Yalnızca sizi takip eden şefler görebilir"),
    PRIVATE("Gizli", "Yalnızca siz görebilirsiniz");

    companion object {
        fun parse(value: String?): Visibility = entries.firstOrNull { it.name == value } ?: PUBLIC
    }
}

object Difficulty {
    const val EASY = 1
    const val MEDIUM = 2
    const val HARD = 3
    fun label(level: Int) = when (level) {
        EASY -> "Kolay"
        HARD -> "Zor"
        else -> "Orta"
    }
}

data class Ingredient(
    val group: String = "",
    val amount: Double? = null,
    val amountMax: Double? = null,
    val unit: String = "",
    val name: String = "",
    val note: String = "",
    /** Kullanıcı gram değerini elle girdiyse besin hesabında bu kullanılır. */
    val grams: Double? = null,
)

data class Step(
    val title: String = "",
    val text: String = "",
    /** Bu adım için önerilen zamanlayıcı süresi (dakika). */
    val minutes: Int? = null,
    val image: String? = null,
)

data class Recipe(
    val id: String,
    val authorId: String,
    val authorName: String,
    val authorPhoto: String? = null,
    val title: String,
    val description: String = "",
    val tagline: String = "",
    val category: String = "Ana Yemek",
    val cuisine: String = "Türk",
    val difficulty: Int = Difficulty.MEDIUM,
    val servings: Int = 4,
    val prepMinutes: Int = 0,
    val cookMinutes: Int = 0,
    val restMinutes: Int = 0,
    val templateId: String = "pastane",
    val visibility: Visibility = Visibility.PUBLIC,
    /** "illu:<anahtar>" hazır illüstrasyon, "file:..." yerel foto, "https:..." uzak foto, "fsimg:<id>" bulut fotoğrafı */
    val image: String = "illu:dessert",
    val ingredients: List<Ingredient> = emptyList(),
    val steps: List<Step> = emptyList(),
    val tips: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val ratingAvg: Double = 0.0,
    val ratingCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val hidden: Boolean = false,
    val featured: Boolean = false,
    val sourceUrl: String? = null,
) {
    val totalMinutes: Int get() = prepMinutes + cookMinutes + restMinutes

    /** Malzeme grupları sırasıyla (boş grup adı "Malzemeler" olarak gösterilir). */
    fun ingredientGroups(): List<Pair<String, List<Ingredient>>> {
        val order = LinkedHashMap<String, MutableList<Ingredient>>()
        ingredients.forEach { order.getOrPut(it.group.trim()) { mutableListOf() }.add(it) }
        return order.map { (k, v) -> (k.ifBlank { "Malzemeler" }) to v }
    }
}

data class NutritionFacts(
    val kcal: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
    val fiber: Double = 0.0,
    val sugar: Double = 0.0,
) {
    operator fun plus(o: NutritionFacts) = NutritionFacts(
        kcal + o.kcal, protein + o.protein, carbs + o.carbs, fat + o.fat, fiber + o.fiber, sugar + o.sugar,
    )

    operator fun times(f: Double) = NutritionFacts(kcal * f, protein * f, carbs * f, fat * f, fiber * f, sugar * f)
    operator fun div(d: Double) = if (d == 0.0) this else times(1.0 / d)
}

val RECIPE_CATEGORIES = listOf(
    "Ana Yemek", "Çorba", "Salata", "Tatlı", "Hamur İşi", "Kahvaltı", "Meze", "Makarna", "Et & Tavuk",
    "Deniz Ürünleri", "Vejetaryen", "İçecek", "Atıştırmalık", "Fit & Diyet",
)

val CUISINES = listOf("Türk", "Osmanlı", "Ege", "Akdeniz", "İtalyan", "Fransız", "Asya", "Meksika", "Orta Doğu", "Dünya")
