package com.tarifpro.app.domain

import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

object TurkishText {
    val locale: Locale = Locale.forLanguageTag("tr-TR")

    fun lower(s: String): String = s.lowercase(locale)

    /** Aksan ve Türkçe karakterleri katlayarak arama için normalize eder. */
    fun fold(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in lower(s)) {
            sb.append(
                when (c) {
                    'ç' -> 'c'; 'ğ' -> 'g'; 'ı' -> 'i'; 'ö' -> 'o'; 'ş' -> 's'; 'ü' -> 'u'
                    'â', 'à', 'á', 'ä' -> 'a'; 'î', 'ì', 'í', 'ï' -> 'i'; 'û', 'ù', 'ú' -> 'u'
                    'é', 'è', 'ê', 'ë' -> 'e'; 'ô', 'ó', 'ò' -> 'o'; 'ñ' -> 'n'
                    else -> c
                },
            )
        }
        return sb.toString()
    }

    fun tokens(s: String): List<String> =
        fold(s).split(Regex("[^a-z0-9]+")).filter { it.length >= 2 }

    fun capitalize(s: String): String =
        s.replaceFirstChar { if (it.isLowerCase()) it.titlecase(locale) else it.toString() }
}

/** Birim tanımı: hacim birimleri ml, ağırlık birimleri gram cinsinden. */
data class UnitDef(
    val key: String,
    val aliases: List<String>,
    val ml: Double? = null,
    val grams: Double? = null,
    /** Kesirli gösterim (½ su bardağı gibi) kullanılsın mı? */
    val fractional: Boolean = true,
)

object Units {
    val all: List<UnitDef> = listOf(
        UnitDef("g", listOf("g", "gr", "gram", "grams", "gramm"), grams = 1.0, fractional = false),
        UnitDef("kg", listOf("kg", "kilo", "kilogram", "kilogramme"), grams = 1000.0, fractional = false),
        UnitDef("ml", listOf("ml", "mililitre", "milliliter", "millilitre", "cc"), ml = 1.0, fractional = false),
        UnitDef("l", listOf("l", "lt", "litre", "liter", "litres", "liters"), ml = 1000.0, fractional = false),
        UnitDef("su bardağı", listOf("su bardağı", "su bardagi", "bardak", "su b.", "sb"), ml = 200.0),
        UnitDef("çay bardağı", listOf("çay bardağı", "cay bardagi", "çay b.", "cb"), ml = 100.0),
        UnitDef("kahve fincanı", listOf("kahve fincanı", "kahve fincani", "fincan"), ml = 70.0),
        UnitDef("yemek kaşığı", listOf("yemek kaşığı", "yemek kasigi", "yk", "y.k.", "kaşık", "kasik"), ml = 15.0),
        UnitDef("tatlı kaşığı", listOf("tatlı kaşığı", "tatli kasigi", "tk", "t.k."), ml = 10.0),
        UnitDef("çay kaşığı", listOf("çay kaşığı", "cay kasigi", "çk", "ç.k."), ml = 5.0),
        UnitDef("cup", listOf("cup", "cups", "c."), ml = 240.0),
        UnitDef("tbsp", listOf("tbsp", "tablespoon", "tablespoons", "tbs"), ml = 15.0),
        UnitDef("tsp", listOf("tsp", "teaspoon", "teaspoons"), ml = 5.0),
        UnitDef("oz", listOf("oz", "ounce", "ounces"), grams = 28.35, fractional = false),
        UnitDef("lb", listOf("lb", "lbs", "pound", "pounds"), grams = 453.6),
        UnitDef("adet", listOf("adet", "tane", "piece", "pieces", "pcs", "ad."), fractional = true),
        UnitDef("paket", listOf("paket", "pkt", "package", "packet", "zarf"), fractional = true),
        UnitDef("diş", listOf("diş", "dis", "clove", "cloves"), fractional = true),
        UnitDef("dilim", listOf("dilim", "slice", "slices"), fractional = true),
        UnitDef("demet", listOf("demet", "bunch"), fractional = true),
        UnitDef("tutam", listOf("tutam", "pinch"), fractional = true),
        UnitDef("avuç", listOf("avuç", "avuc", "handful"), fractional = true),
        UnitDef("kutu", listOf("kutu", "can", "cans", "konserve"), fractional = true),
        UnitDef("kase", listOf("kase", "bowl"), ml = 250.0),
    )

    val displayList: List<String> = listOf("") + all.map { it.key }

    private val byAlias: List<Pair<String, UnitDef>> = all
        .flatMap { u -> (u.aliases + u.key).map { TurkishText.fold(it) to u } }
        .sortedByDescending { it.first.length }

    fun find(key: String): UnitDef? {
        val f = TurkishText.fold(key.trim())
        if (f.isEmpty()) return null
        return all.firstOrNull { TurkishText.fold(it.key) == f } ?: byAlias.firstOrNull { it.first == f }?.second
    }

    /** Metnin başındaki birimi bulur; (birim, kalan metin) döner. */
    fun matchPrefix(text: String): Pair<UnitDef, String>? {
        val folded = TurkishText.fold(text)
        for ((alias, unit) in byAlias) {
            if (folded.startsWith(alias)) {
                val next = folded.getOrNull(alias.length)
                if (next == null || !next.isLetterOrDigit()) {
                    return unit to text.substring(alias.length).trimStart(' ', '.', ',')
                }
            }
        }
        return null
    }
}

object QuantityFormat {
    private val fractions = listOf(
        0.0 to "", 0.25 to "¼", 1.0 / 3 to "⅓", 0.5 to "½", 2.0 / 3 to "⅔", 0.75 to "¾", 1.0 to "",
    )

    /** Kesirli gösterim: 1.5 -> "1 ½", 0.33 -> "⅓" */
    fun fraction(value: Double): String {
        if (value <= 0.0) return "0"
        var whole = floor(value).toInt()
        val rest = value - whole
        val (fv, glyph) = fractions.minByOrNull { abs(it.first - rest) }!!
        if (fv == 1.0) whole += 1
        return when {
            whole == 0 && glyph.isEmpty() -> fraction1Decimal(value)
            whole == 0 -> glyph
            glyph.isEmpty() -> whole.toString()
            else -> "$whole $glyph"
        }
    }

    private fun fraction1Decimal(v: Double): String = decimal(v)

    fun decimal(value: Double): String {
        return when {
            value >= 100 -> ((value / 5).roundToInt() * 5).toString()
            value >= 10 -> value.roundToInt().toString()
            else -> {
                val r = (value * 10).roundToInt() / 10.0
                if (r == floor(r)) r.toInt().toString() else r.toString().replace('.', ',')
            }
        }
    }

    fun amount(value: Double, unit: String): String {
        val def = Units.find(unit)
        val useFraction = def?.fractional ?: (value < 10)
        return if (useFraction && value < 50) fraction(value) else decimal(value)
    }

    fun ingredientAmount(ing: Ingredient, factor: Double = 1.0): String {
        val a = ing.amount ?: return ""
        val main = amount(a * factor, ing.unit)
        val max = ing.amountMax?.let { amount(it * factor, ing.unit) }
        return if (max != null && max != main) "$main–$max" else main
    }

    fun ingredientLine(ing: Ingredient, factor: Double = 1.0): String {
        val parts = mutableListOf<String>()
        val amt = ingredientAmount(ing, factor)
        if (amt.isNotEmpty()) parts += amt
        if (ing.unit.isNotBlank()) parts += ing.unit
        parts += ing.name
        val base = parts.joinToString(" ")
        return if (ing.note.isNotBlank()) "$base (${ing.note})" else base
    }

    fun minutes(total: Int): String = when {
        total <= 0 -> "—"
        total < 60 -> "$total dk"
        total % 60 == 0 -> "${total / 60} sa"
        else -> "${total / 60} sa ${total % 60} dk"
    }
}

object Scaler {
    const val MIN_SERVINGS = 1
    const val MAX_SERVINGS = 24

    fun factor(baseServings: Int, targetServings: Int): Double =
        if (baseServings <= 0) 1.0 else targetServings.toDouble() / baseServings

    fun scale(ing: Ingredient, factor: Double): Ingredient = ing.copy(
        amount = ing.amount?.times(factor),
        amountMax = ing.amountMax?.times(factor),
        grams = ing.grams?.times(factor),
    )

    fun scaleAll(list: List<Ingredient>, factor: Double) = list.map { scale(it, factor) }
}
