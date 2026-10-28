package com.tarifpro.app.export

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import com.tarifpro.app.data.ImageStore
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Scaler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.roundToInt

object ShareHelper {
    fun shareText(context: Context, recipe: Recipe) {
        val text = buildString {
            appendLine("🍽️ ${recipe.title}")
            if (recipe.tagline.isNotBlank()) appendLine(recipe.tagline)
            appendLine()
            appendLine("👥 ${recipe.servings} kişilik • ⏱ ${QuantityFormat.minutes(recipe.totalMinutes)} • ${Difficulty.label(recipe.difficulty)}")
            appendLine()
            appendLine("🧾 MALZEMELER")
            recipe.ingredientGroups().forEach { (g, items) ->
                if (recipe.ingredientGroups().size > 1) appendLine("— $g")
                items.forEach { appendLine("• " + QuantityFormat.ingredientLine(it)) }
            }
            appendLine()
            appendLine("👩‍🍳 YAPILIŞI")
            recipe.steps.forEachIndexed { i, s -> appendLine("${i + 1}. ${if (s.title.isNotBlank()) s.title + ": " else ""}${s.text}") }
            if (recipe.tips.isNotEmpty()) {
                appendLine()
                appendLine("💡 PÜF NOKTALARI")
                recipe.tips.forEach { appendLine("• $it") }
            }
            appendLine()
            append("Tarif Pro uygulamasıyla paylaşıldı • ${recipe.authorName}")
        }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, recipe.title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        context.startActivity(Intent.createChooser(intent, "Tarifi paylaş").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    suspend fun writeShareFile(context: Context, bitmap: Bitmap, name: String): Uri = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 3_600_000) it.delete() }
        val safe = name.replace(Regex("[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]+"), "_").take(40)
        val file = File(dir, "$safe.png")
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        FileProvider.getUriForFile(context, context.packageName + ".files", file)
    }

    fun shareImage(context: Context, uri: Uri, title: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, "🍽️ $title – Tarif Pro tarif kartı")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Tarif kartını gönder").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** PNG'yi galeriye (Resimler/TarifPro) kaydeder. Android 10+ izinsiz çalışır. */
    suspend fun saveToGallery(context: Context, bitmap: Bitmap, name: String): Boolean = withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < 29) return@withContext false
        try {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "TarifPro_${name.take(30)}_${System.currentTimeMillis()}.png")
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/TarifPro")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return@withContext false
            resolver.openOutputStream(uri)?.use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        } catch (e: Exception) {
            false
        }
    }
}

/** A4 sayfa düzeninde yazdırma / PDF olarak kaydetme (Android yazdırma çerçevesi). */
object PrintHelper {
    private var keepAlive: WebView? = null

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private fun hex(color: Int) = String.format("#%06X", 0xFFFFFF and color)

    private fun toDataUri(bmp: Bitmap?): String? {
        bmp ?: return null
        val bos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 82, bos)
        return "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
    }

    suspend fun buildHtml(images: ImageStore, recipe: Recipe, servings: Int, template: RecipeTemplate): String {
        val factor = Scaler.factor(recipe.servings, servings)
        val scaled = recipe.copy(ingredients = Scaler.scaleAll(recipe.ingredients, factor), servings = servings)
        val report = NutritionCalculator.analyze(scaled)
        val hero = toDataUri(images.loadBitmap(recipe.image, 1100, 560))
        val stepImgs = recipe.steps.map { st -> st.image?.let { toDataUri(images.loadBitmap(it, 500, 320)) } }
        val p = hex(template.primary)
        val bg = hex(template.background)
        val ink = hex(template.ink)
        val muted = hex(template.muted)
        val serif = if (template.serifTitles) "Georgia, 'Noto Serif', serif" else "'Roboto Condensed', 'Roboto', sans-serif"
        val groupsHtml = scaled.ingredientGroups().mapIndexed { gi, (g, items) ->
            val (tint, accent) = template.groupColors[gi % template.groupColors.size]
            """<div class="group" style="background:${hex(tint)}"><h3 style="color:${hex(accent)}"><span class="num" style="background:${hex(accent)}">${gi + 1}</span>${esc(g)}</h3><ul>""" +
                items.joinToString("") { ing ->
                    val amt = listOf(QuantityFormat.ingredientAmount(ing), ing.unit).filter { it.isNotBlank() }.joinToString(" ")
                    """<li><span class="emo">${NutritionCalculator.emojiFor(ing)}</span><b>${esc(amt)}</b> ${esc(ing.name)}${if (ing.note.isNotBlank()) " <i>(${esc(ing.note)})</i>" else ""}</li>"""
                } + "</ul></div>"
        }.joinToString("")
        val stepsHtml = recipe.steps.mapIndexed { i, st ->
            val img = stepImgs.getOrNull(i)?.let { """<img src="$it"/>""" } ?: ""
            val time = st.minutes?.let { """<span class="badge">⏱ ${QuantityFormat.minutes(it)}</span>""" } ?: ""
            """<div class="step"><div class="sh"><span class="num" style="background:$p">${i + 1}</span><b>${esc(st.title.ifBlank { "Adım ${i + 1}" })}</b>$time</div>$img<p>${esc(st.text)}</p></div>"""
        }.joinToString("")
        val tipsHtml = if (recipe.tips.isEmpty()) "" else
            """<div class="tips"><h2 style="background:$p">👨‍🍳 Püf Noktaları</h2><ol>${recipe.tips.joinToString("") { "<li>${esc(it)}</li>" }}</ol></div>"""
        val ps = report.perServing
        val tags = NutritionCalculator.healthTags(report).filter { it.positive }.joinToString(" ") { """<span class="tag">✓ ${esc(it.label)}</span>""" }
        return """
<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
<style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: 'Roboto', sans-serif; color: $ink; background: $bg; margin: 0; font-size: 10.5pt; }
.hero { position: relative; border-radius: 14px; overflow: hidden; height: 72mm; background: #eee; }
.hero img { width: 100%; height: 100%; object-fit: cover; }
.title { position: absolute; left: 12px; top: 12px; background: $p; color: ${hex(template.onPrimary)}; padding: 10px 18px; border-radius: 12px; max-width: 65%; }
.title h1 { font-family: $serif; margin: 0; font-size: 24pt; line-height: 1.1; }
.title div { font-family: $serif; font-size: 12pt; margin-top: 4px; }
.tagline { position: absolute; right: 14px; top: 16px; background: #fffdf7; color: $p; font-family: Georgia, serif; font-style: italic; font-weight: bold; padding: 10px 14px; border-radius: 6px; transform: rotate(-3deg); max-width: 32%; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
.meta { margin: 8px 0; display: flex; flex-wrap: wrap; gap: 6px; }
.meta span { border: 1px solid $p; border-radius: 20px; padding: 3px 10px; background: #fff; font-weight: bold; font-size: 9.5pt; }
h2.label { display: inline-block; background: $p; color: #fff; font-family: $serif; padding: 4px 16px; border-radius: 20px; margin: 10px 0 6px; font-size: 14pt; }
.groups { display: grid; grid-template-columns: repeat(${minOf(4, maxOf(1, scaled.ingredientGroups().size))}, 1fr); gap: 8px; }
.group { border-radius: 12px; padding: 8px 10px; page-break-inside: avoid; }
.group h3 { margin: 0 0 6px; font-size: 11pt; display: flex; align-items: center; gap: 6px; }
.group ul { list-style: none; margin: 0; padding: 0; }
.group li { margin: 3px 0; }
.emo { margin-right: 4px; }
.num { display: inline-flex; width: 20px; height: 20px; border-radius: 50%; color: #fff; align-items: center; justify-content: center; font-size: 9pt; font-weight: bold; margin-right: 6px; flex-shrink: 0; }
.steps { display: grid; grid-template-columns: repeat(${if (recipe.steps.size >= 4) 4 else maxOf(1, recipe.steps.size)}, 1fr); gap: 8px; }
.step { background: #fff; border-radius: 12px; padding: 8px; page-break-inside: avoid; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.step img { width: 100%; border-radius: 8px; margin: 4px 0; }
.sh { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.badge { margin-left: auto; background: $p; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 8.5pt; }
.step p { margin: 4px 0 0; }
.bottom { display: grid; grid-template-columns: ${if (recipe.tips.isEmpty()) "1fr" else "2fr 1fr"}; gap: 8px; margin-top: 10px; page-break-inside: avoid; }
.tips { background: #fff; border: 2px solid $p; border-radius: 14px; padding: 8px 12px; }
.tips h2 { display: inline-block; color: #fff; font-family: $serif; padding: 3px 14px; border-radius: 16px; margin: 0 0 4px; font-size: 13pt; }
.tips ol { margin: 0; padding-left: 20px; columns: 2; column-gap: 18px; }
.tips li { margin-bottom: 4px; break-inside: avoid; }
.nut { background: #fff; border-radius: 14px; padding: 10px 12px; border: 2px solid ${hex(template.secondary)}; }
.nut .k { font-size: 26pt; color: $p; font-weight: bold; }
.nut table { width: 100%; border-collapse: collapse; }
.nut td { padding: 2px 0; border-bottom: 1px dashed #ddd; }
.tag { display: inline-block; background: #E8F5E9; color: #2E7D32; border-radius: 10px; padding: 1px 8px; margin: 2px; font-size: 8.5pt; font-weight: bold; }
.foot { text-align: center; color: $muted; font-size: 9pt; margin-top: 10px; }
</style></head><body>
<div class="hero">${hero?.let { """<img src="$it"/>""" } ?: ""}
<div class="title"><h1>${esc(recipe.title)}</h1><div>${servings} kişilik • ${esc(recipe.category)}</div></div>
${if (recipe.tagline.isNotBlank()) """<div class="tagline">${esc(recipe.tagline)} ♡</div>""" else ""}
</div>
<div class="meta">
${if (recipe.prepMinutes > 0) "<span>⏱ Hazırlık ${QuantityFormat.minutes(recipe.prepMinutes)}</span>" else ""}
${if (recipe.cookMinutes > 0) "<span>🔥 Pişirme ${QuantityFormat.minutes(recipe.cookMinutes)}</span>" else ""}
${if (recipe.restMinutes > 0) "<span>❄ Dinlenme ${QuantityFormat.minutes(recipe.restMinutes)}</span>" else ""}
<span>📊 ${Difficulty.label(recipe.difficulty)}</span><span>🔥 ${ps.kcal.roundToInt()} kcal/porsiyon</span><span>👩‍🍳 ${esc(recipe.authorName)}</span>
</div>
${if (recipe.description.isNotBlank()) "<p>${esc(recipe.description)}</p>" else ""}
<h2 class="label">Malzemeler</h2>
<div class="groups">$groupsHtml</div>
<h2 class="label">Yapılışı</h2>
<div class="steps">$stepsHtml</div>
<div class="bottom">$tipsHtml
<div class="nut"><b>Besin Değerleri</b> <small>(1 porsiyon)</small><div class="k">${ps.kcal.roundToInt()} <small>kcal</small></div>
<table><tr><td>Protein</td><td align="right">${QuantityFormat.decimal(ps.protein)} g</td></tr>
<tr><td>Karbonhidrat</td><td align="right">${QuantityFormat.decimal(ps.carbs)} g</td></tr>
<tr><td>Yağ</td><td align="right">${QuantityFormat.decimal(ps.fat)} g</td></tr>
<tr><td>Lif</td><td align="right">${QuantityFormat.decimal(ps.fiber)} g</td></tr></table>
<div style="margin-top:6px">$tags</div></div>
</div>
<div class="foot">Tarif Pro ile hazırlandı • ${esc(recipe.authorName)}</div>
</body></html>
        """.trimIndent()
    }

    /** HTML'i WebView ile işleyip A4 yazdırma iletişim kutusunu açar (PDF olarak kaydetme dahil). */
    fun print(activity: Activity, html: String, jobName: String) {
        val webView = WebView(activity)
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                val pm = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
                val adapter = view.createPrintDocumentAdapter(jobName)
                pm.print(
                    jobName, adapter,
                    PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .build(),
                )
            }
        }
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        keepAlive = webView
    }
}
