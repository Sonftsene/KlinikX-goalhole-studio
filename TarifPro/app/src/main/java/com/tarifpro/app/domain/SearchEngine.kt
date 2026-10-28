package com.tarifpro.app.domain

import kotlin.math.abs
import kotlin.math.min

data class SearchFilters(
    val query: String = "",
    /** "Dolapta ne var?" – seçili malzemelerin hepsini içeren tarifler */
    val pantry: Set<String> = emptySet(),
    /** true ise seçili malzemelerden en az birini içerenler de listelenir */
    val pantryMatchAny: Boolean = false,
    val difficulties: Set<Int> = emptySet(),
    val maxKcal: Int? = null,
    val maxMinutes: Int? = null,
    val categories: Set<String> = emptySet(),
    val healthTags: Set<String> = emptySet(),
    val minRating: Double = 0.0,
    val sort: SearchSort = SearchSort.RELEVANCE,
) {
    val isEmpty: Boolean
        get() = query.isBlank() && pantry.isEmpty() && difficulties.isEmpty() && maxKcal == null && maxMinutes == null &&
            categories.isEmpty() && healthTags.isEmpty() && minRating <= 0.0
}

enum class SearchSort(val label: String) {
    RELEVANCE("En alakalı"), RATING("En yüksek puan"), NEWEST("En yeni"), QUICKEST("En hızlı"), LIGHTEST("En düşük kalori")
}

data class SearchDoc(
    val id: String,
    val title: String,
    val description: String,
    val tags: List<String>,
    val ingredientNames: List<String>,
    val author: String,
    val category: String,
    val cuisine: String,
    val difficulty: Int,
    val kcalPerServing: Int,
    val totalMinutes: Int,
    val rating: Double,
    val ratingCount: Int,
    val createdAt: Long,
    val healthTags: List<String> = emptyList(),
)

data class SearchHit(val id: String, val score: Double, val pantryMatched: Int, val pantryTotal: Int)

/**
 * Bellek içi ters indeksli arama motoru. Türkçe karakter katlama, önek eşleşmesi,
 * yazım hatası toleransı (Levenshtein ≤ 1) ve alan ağırlıklandırması yapar.
 * Binlerce tarifte milisaniyeler içinde sonuç döner.
 */
class SearchEngine(docs: List<SearchDoc>) {
    private val docsById = docs.associateBy { it.id }

    // token -> (docId -> ağırlık)
    private val inverted = HashMap<String, HashMap<String, Double>>()
    private val sortedTokens: List<String>
    private val ingredientSets: Map<String, List<String>> =
        docs.associate { d -> d.id to d.ingredientNames.map { TurkishText.fold(it) } }

    init {
        for (d in docs) {
            add(d.id, d.title, 6.0)
            d.tags.forEach { add(d.id, it, 3.0) }
            add(d.id, d.category, 2.5)
            add(d.id, d.cuisine, 1.5)
            d.ingredientNames.forEach { add(d.id, it, 2.0) }
            add(d.id, d.description, 1.0)
            add(d.id, d.author, 1.0)
        }
        sortedTokens = inverted.keys.sorted()
    }

    private fun add(id: String, text: String, weight: Double) {
        for (t in TurkishText.tokens(text)) {
            val m = inverted.getOrPut(t) { HashMap() }
            m[id] = (m[id] ?: 0.0) + weight
        }
    }

    private fun prefixTokens(prefix: String): List<String> {
        var lo = 0
        var hi = sortedTokens.size
        while (lo < hi) {
            val mid = (lo + hi) ushr 1
            if (sortedTokens[mid] < prefix) lo = mid + 1 else hi = mid
        }
        val out = mutableListOf<String>()
        var i = lo
        while (i < sortedTokens.size && sortedTokens[i].startsWith(prefix) && out.size < 60) {
            out += sortedTokens[i]; i++
        }
        return out
    }

    private fun fuzzyTokens(token: String): List<String> {
        if (token.length < 4) return emptyList()
        return sortedTokens.filter { abs(it.length - token.length) <= 1 && it[0] == token[0] && levenshtein(it, token) <= 1 }
    }

    private fun scoreQuery(query: String): Map<String, Double>? {
        val qTokens = TurkishText.tokens(query)
        if (qTokens.isEmpty()) return null
        var result: MutableMap<String, Double>? = null
        for (qt in qTokens) {
            val partial = HashMap<String, Double>()
            inverted[qt]?.forEach { (id, w) -> partial[id] = (partial[id] ?: 0.0) + w * 2 }
            for (pt in prefixTokens(qt)) {
                if (pt == qt) continue
                val closeness = qt.length.toDouble() / pt.length
                inverted[pt]?.forEach { (id, w) -> partial[id] = (partial[id] ?: 0.0) + w * closeness }
            }
            if (partial.isEmpty()) {
                for (ft in fuzzyTokens(qt)) {
                    inverted[ft]?.forEach { (id, w) -> partial[id] = (partial[id] ?: 0.0) + w * 0.6 }
                }
            }
            // AND semantiği: her sorgu kelimesi eşleşmeli
            result = if (result == null) partial.toMutableMap() else {
                val merged = HashMap<String, Double>()
                for ((id, s) in result) partial[id]?.let { merged[id] = s + it }
                merged
            }
            if (result.isEmpty()) return result
        }
        return result
    }

    fun search(filters: SearchFilters): List<SearchHit> {
        val scored = scoreQuery(filters.query)
        val candidates = scored?.keys ?: docsById.keys
        val pantry = filters.pantry.map { TurkishText.fold(it) }
        val hits = ArrayList<SearchHit>()
        for (id in candidates) {
            val d = docsById[id] ?: continue
            if (filters.difficulties.isNotEmpty() && d.difficulty !in filters.difficulties) continue
            if (filters.maxKcal != null && d.kcalPerServing > filters.maxKcal) continue
            if (filters.maxMinutes != null && d.totalMinutes > filters.maxMinutes) continue
            if (filters.categories.isNotEmpty() && d.category !in filters.categories) continue
            if (filters.minRating > 0 && d.rating < filters.minRating) continue
            if (filters.healthTags.isNotEmpty() && !d.healthTags.containsAll(filters.healthTags)) continue
            var matched = 0
            if (pantry.isNotEmpty()) {
                val ings = ingredientSets[id].orEmpty()
                matched = pantry.count { p -> ings.any { it.contains(p) } }
                if (filters.pantryMatchAny) {
                    if (matched == 0) continue
                } else if (matched < pantry.size) continue
            }
            val base = scored?.get(id) ?: 0.0
            val pantryBonus = if (pantry.isNotEmpty()) matched * 4.0 - (ingredientSets[id].orEmpty().size - matched) * 0.2 else 0.0
            val popularity = d.rating * 0.3 + min(d.ratingCount, 50) * 0.02
            hits += SearchHit(id, base + pantryBonus + popularity, matched, pantry.size)
        }
        return when (filters.sort) {
            SearchSort.RELEVANCE -> hits.sortedByDescending { it.score }
            SearchSort.RATING -> hits.sortedWith(compareByDescending<SearchHit> { docsById[it.id]!!.rating }.thenByDescending { docsById[it.id]!!.ratingCount })
            SearchSort.NEWEST -> hits.sortedByDescending { docsById[it.id]!!.createdAt }
            SearchSort.QUICKEST -> hits.sortedBy { docsById[it.id]!!.totalMinutes.let { m -> if (m <= 0) Int.MAX_VALUE else m } }
            SearchSort.LIGHTEST -> hits.sortedBy { docsById[it.id]!!.kcalPerServing.let { k -> if (k <= 0) Int.MAX_VALUE else k } }
        }
    }

    /** Otomatik tamamlama önerileri */
    fun suggest(prefix: String, limit: Int = 6): List<String> {
        val folded = TurkishText.fold(prefix.trim())
        if (folded.length < 2) return emptyList()
        val titles = docsById.values.map { it.title }.filter { TurkishText.fold(it).contains(folded) }
        val tokens = prefixTokens(folded.split(' ').last())
        return (titles + tokens).distinct().take(limit)
    }

    companion object {
        fun levenshtein(a: String, b: String): Int {
            val dp = IntArray(b.length + 1) { it }
            for (i in 1..a.length) {
                var prev = dp[0]
                dp[0] = i
                for (j in 1..b.length) {
                    val tmp = dp[j]
                    dp[j] = minOf(dp[j] + 1, dp[j - 1] + 1, prev + if (a[i - 1] == b[j - 1]) 0 else 1)
                    prev = tmp
                }
            }
            return dp[b.length]
        }
    }
}
