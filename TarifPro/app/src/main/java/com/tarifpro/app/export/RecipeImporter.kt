package com.tarifpro.app.export

import com.tarifpro.app.domain.DurationDetector
import com.tarifpro.app.domain.Ingredient
import com.tarifpro.app.domain.IngredientParser
import com.tarifpro.app.domain.PlainTextRecipeParser
import com.tarifpro.app.domain.Step
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class ImportedRecipe(
    val title: String,
    val description: String,
    val image: String?,
    val servings: Int?,
    val prepMinutes: Int,
    val cookMinutes: Int,
    val ingredients: List<Ingredient>,
    val steps: List<Step>,
    val tips: List<String>,
    val tags: List<String>,
    val category: String?,
    val sourceUrl: String?,
)

/**
 * Başka sitelerden / uygulamalardan tarif içe aktarır.
 * Çoğu profesyonel tarif sitesi schema.org "Recipe" JSON-LD verisi yayınlar; bu veri okunur,
 * yoksa sayfa metninden akıllı ayrıştırma denenir.
 */
object RecipeImporter {
    private val client by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
    }

    suspend fun fromUrl(url: String): ImportedRecipe = withContext(Dispatchers.IO) {
        val clean = url.trim().let { if (it.startsWith("http")) it else "https://$it" }
        val req = Request.Builder().url(clean)
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36 TarifPro/1.0")
            .header("Accept-Language", "tr-TR,tr;q=0.9,en;q=0.8")
            .build()
        val html = client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) error("Sayfa açılamadı (HTTP ${resp.code})")
            resp.body?.string() ?: error("Sayfa boş")
        }
        fromHtml(html, clean) ?: error("Bu sayfada tarif verisi bulunamadı. Tarif metnini kopyalayıp \"Metinden içe aktar\" seçeneğini deneyin.")
    }

    fun fromHtml(html: String, sourceUrl: String?): ImportedRecipe? {
        val scripts = Regex("""<script[^>]*type=["']application/ld\+json["'][^>]*>(.*?)</script>""", setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE))
            .findAll(html).map { it.groupValues[1].trim() }.toList()
        for (s in scripts) {
            val recipe = try {
                findRecipe(if (s.startsWith("[")) JSONArray(s) else JSONObject(s))
            } catch (e: Exception) {
                null
            }
            if (recipe != null) return parseRecipe(recipe, sourceUrl)
        }
        // Yedek: görünür metinden ayrıştır
        val text = html.replace(Regex("(?is)<(script|style)[^>]*>.*?</\\1>"), " ")
            .replace(Regex("(?i)<br\\s*/?>|</(p|li|h[1-6]|div)>"), "\n")
            .replace(Regex("<[^>]+>"), " ")
            .replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", "\"")
            .lines().map { it.trim() }.filter { it.isNotEmpty() }.joinToString("\n")
        val parsed = PlainTextRecipeParser.parse(text)
        if (parsed.ingredients.size < 2) return null
        val title = Regex("""<title>(.*?)</title>""", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1)?.trim() ?: parsed.title
        return ImportedRecipe(title, "", null, parsed.servings, 0, 0, parsed.ingredients, parsed.steps, parsed.tips, emptyList(), null, sourceUrl)
    }

    fun fromText(text: String): ImportedRecipe {
        val p = PlainTextRecipeParser.parse(text)
        return ImportedRecipe(p.title, "", null, p.servings, 0, 0, p.ingredients, p.steps, p.tips, emptyList(), null, null)
    }

    private fun isRecipe(o: JSONObject): Boolean {
        val t = o.opt("@type")
        return when (t) {
            is String -> t.equals("Recipe", true)
            is JSONArray -> (0 until t.length()).any { t.optString(it).equals("Recipe", true) }
            else -> false
        }
    }

    private fun findRecipe(node: Any?): JSONObject? {
        when (node) {
            is JSONObject -> {
                if (isRecipe(node)) return node
                node.optJSONArray("@graph")?.let { g -> findRecipe(g)?.let { return it } }
                node.optJSONObject("mainEntity")?.let { findRecipe(it)?.let { r -> return r } }
            }
            is JSONArray -> for (i in 0 until node.length()) findRecipe(node.opt(i))?.let { return it }
        }
        return null
    }

    private fun strings(v: Any?): List<String> = when (v) {
        null -> emptyList()
        is String -> listOf(v)
        is JSONArray -> (0 until v.length()).flatMap { strings(v.opt(it)) }
        is JSONObject -> listOfNotNull(v.optString("text").ifBlank { v.optString("name") }.ifBlank { null })
        else -> listOf(v.toString())
    }

    private fun decode(s: String) = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'")
        .replace("&quot;", "\"").replace(Regex("<[^>]+>"), "").trim()

    private fun parseRecipe(o: JSONObject, sourceUrl: String?): ImportedRecipe {
        val image = when (val img = o.opt("image")) {
            is String -> img
            is JSONArray -> img.opt(0).let { if (it is JSONObject) it.optString("url") else it?.toString() }
            is JSONObject -> img.optString("url")
            else -> null
        }
        val yieldText = strings(o.opt("recipeYield")).firstOrNull() ?: ""
        val servings = Regex("""\d+""").find(yieldText)?.value?.toIntOrNull()
        val ingredients = strings(o.opt("recipeIngredient").let { it ?: o.opt("ingredients") })
            .mapNotNull { IngredientParser.parse(decode(it)) }
        val steps = mutableListOf<Step>()
        fun addInstr(v: Any?, section: String) {
            when (v) {
                is String -> decode(v).split(Regex("\n+")).map { it.trim() }.filter { it.isNotEmpty() }
                    .forEach { steps += Step(title = section, text = it, minutes = DurationDetector.firstMinutes(it)) }
                is JSONArray -> for (i in 0 until v.length()) addInstr(v.opt(i), section)
                is JSONObject -> {
                    val type = v.optString("@type")
                    if (type.equals("HowToSection", true)) {
                        addInstr(v.opt("itemListElement"), v.optString("name"))
                    } else {
                        val text = decode(v.optString("text").ifBlank { v.optString("name") })
                        if (text.isNotEmpty()) steps += Step(title = section.ifBlank { v.optString("name").takeIf { it != text && it.length < 60 } ?: "" }, text = text, minutes = DurationDetector.firstMinutes(text))
                    }
                }
            }
        }
        addInstr(o.opt("recipeInstructions"), "")
        val keywords = strings(o.opt("keywords")).flatMap { it.split(',') }.map { it.trim() }.filter { it.isNotEmpty() }.take(8)
        val category = strings(o.opt("recipeCategory")).firstOrNull()
        return ImportedRecipe(
            title = decode(o.optString("name", "İçe Aktarılan Tarif")),
            description = decode(o.optString("description")),
            image = image?.takeIf { it.startsWith("http") },
            servings = servings,
            prepMinutes = DurationDetector.parseIso(o.optString("prepTime")),
            cookMinutes = DurationDetector.parseIso(o.optString("cookTime")),
            ingredients = ingredients,
            steps = steps,
            tips = emptyList(),
            tags = keywords,
            category = category,
            sourceUrl = sourceUrl,
        )
    }
}
