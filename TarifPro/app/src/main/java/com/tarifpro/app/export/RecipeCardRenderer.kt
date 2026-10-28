package com.tarifpro.app.export

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import com.tarifpro.app.data.ImageStore
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.Ingredient
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.NutritionReport
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Scaler
import com.tarifpro.app.domain.TurkishText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Görsel referans tarzında (başlık bandı, kahraman fotoğraf, renkli malzeme kartları,
 * numaralı adım kartları, püf noktaları ve besin kutusu) uzun formatlı PNG tarif kartı üretir.
 */
object RecipeCardRenderer {
    const val WIDTH = 1240
    private const val PAD = 44f
    private const val GAP = 22f

    suspend fun render(
        images: ImageStore,
        recipe: Recipe,
        servings: Int,
        template: RecipeTemplate,
    ): Bitmap {
        val hero = images.loadBitmap(recipe.image, WIDTH, 640)
        val stepBitmaps = recipe.steps.map { st -> st.image?.let { images.loadBitmap(it, 600, 380) } }
        return withContext(Dispatchers.Default) {
            val factor = Scaler.factor(recipe.servings, servings)
            val scaled = recipe.copy(ingredients = Scaler.scaleAll(recipe.ingredients, factor), servings = servings)
            val report = NutritionCalculator.analyze(scaled)
            val painter = CardPainter(scaled, template, report, hero, stepBitmaps, recipe.image)
            val height = painter.paint(null)
            val bmp = Bitmap.createBitmap(WIDTH, height.roundToInt(), Bitmap.Config.ARGB_8888)
            painter.paint(Canvas(bmp))
            bmp
        }
    }

    fun stepEmoji(text: String): String {
        val f = TurkishText.fold(text)
        return when {
            "cirp" in f -> "🥣"
            "buzdolab" in f || "dinlendir" in f || "sogut" in f -> "❄️"
            "firin" in f -> "🔥"
            "kaynat" in f || "hasla" in f -> "♨️"
            "kizart" in f || "kavur" in f || "sotele" in f || "tava" in f -> "🍳"
            "dok" in f || "islat" in f -> "🥛"
            "desen" in f || "susle" in f -> "🎨"
            "yay" in f || "sur" in f -> "🧁"
            "dogra" in f || "kes" in f || "rendele" in f -> "🔪"
            "servis" in f -> "🍽️"
            "pisir" in f -> "🔥"
            "karistir" in f || "ekle" in f -> "🥄"
            else -> "👩‍🍳"
        }
    }

    private class CardPainter(
        val recipe: Recipe,
        val t: RecipeTemplate,
        val report: NutritionReport,
        val hero: Bitmap?,
        val stepBitmaps: List<Bitmap?>,
        val imageModel: String,
    ) {
        val w = WIDTH.toFloat()
        val serif: Typeface = if (t.serifTitles) Typeface.create(Typeface.SERIF, Typeface.BOLD) else Typeface.create("sans-serif-condensed", Typeface.BOLD)

        fun tp(size: Float, color: Int, bold: Boolean = false, face: Typeface? = null, italic: Boolean = false) =
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                textSize = size
                this.color = color
                typeface = face ?: Typeface.create(Typeface.SANS_SERIF, if (bold && italic) Typeface.BOLD_ITALIC else if (bold) Typeface.BOLD else if (italic) Typeface.ITALIC else Typeface.NORMAL)
            }

        fun layout(text: CharSequence, p: TextPaint, width: Float, align: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL, maxLines: Int = Int.MAX_VALUE): StaticLayout {
            val b = StaticLayout.Builder.obtain(text, 0, text.length, p, max(1, width.toInt()))
                .setAlignment(align)
                .setLineSpacing(0f, 1.08f)
                .setIncludePad(false)
            if (maxLines != Int.MAX_VALUE) b.setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END)
            return b.build()
        }

        fun draw(c: Canvas?, l: StaticLayout, x: Float, y: Float) {
            if (c == null) return
            c.save()
            c.translate(x, y)
            l.draw(c)
            c.restore()
        }

        fun fill(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

        fun maxLineWidth(l: StaticLayout): Float = (0 until l.lineCount).maxOfOrNull { l.getLineWidth(it) } ?: 0f

        fun drawBitmapCover(c: Canvas, bmp: Bitmap, dst: RectF, radius: Float) {
            val srcRatio = bmp.width.toFloat() / bmp.height
            val dstRatio = dst.width() / dst.height()
            val src = if (srcRatio > dstRatio) {
                val newW = (bmp.height * dstRatio).toInt()
                val x = (bmp.width - newW) / 2
                Rect(x, 0, x + newW, bmp.height)
            } else {
                val newH = (bmp.width / dstRatio).toInt()
                val y = (bmp.height - newH) / 2
                Rect(0, y, bmp.width, y + newH)
            }
            c.save()
            val clip = Path().apply { addRoundRect(dst, radius, radius, Path.Direction.CW) }
            c.clipPath(clip)
            c.drawBitmap(bmp, src, dst, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
            c.restore()
        }

        fun withAlpha(color: Int, alpha: Int) = Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color))

        /** Tüm kartı çizer (c == null ise yalnızca yüksekliği ölçer). */
        fun paint(c: Canvas?): Float {
            if (c != null) background(c)
            var y = heroSection(c)
            y = metaChips(c, y + 20f)
            y = sectionLabel(c, y + 26f, "Malzemeler", "${recipe.servings} kişilik ölçüler")
            y = ingredientCards(c, y + 18f)
            if (recipe.steps.isNotEmpty()) {
                y = sectionLabel(c, y + 34f, "Yapılışı", "${recipe.steps.size} adım")
                y = stepCards(c, y + 18f)
            }
            y = bottomBoxes(c, y + 34f)
            y = footer(c, y + 26f)
            return y
        }

        // ---------- Arka plan ----------
        fun background(c: Canvas) {
            c.drawColor(t.background)
            val h = c.height.toFloat()
            when (t.decoration) {
                "dots" -> {
                    val p = fill(withAlpha(t.secondary, 40))
                    var yy = 30f
                    var row = 0
                    while (yy < h) {
                        var xx = if (row % 2 == 0) 30f else 70f
                        while (xx < w) { c.drawCircle(xx, yy, 5f, p); xx += 80f }
                        yy += 70f; row++
                    }
                }
                "stripes" -> {
                    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x0C000000; strokeWidth = 2f }
                    var x = -h
                    while (x < w) { c.drawLine(x, 0f, x + h, h, p); x += 36f }
                }
                "waves" -> {
                    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = withAlpha(t.primary, 22); style = Paint.Style.STROKE; strokeWidth = 3f }
                    var yy = 40f
                    while (yy < h) {
                        val path = Path()
                        path.moveTo(0f, yy)
                        var x = 0f
                        while (x < w) { path.quadTo(x + 30f, yy - 14f, x + 60f, yy); path.quadTo(x + 90f, yy + 14f, x + 120f, yy); x += 120f }
                        c.drawPath(path, p)
                        yy += 90f
                    }
                }
                "leaves" -> {
                    val p = fill(withAlpha(t.primary, 20))
                    var i = 0
                    var yy = 60f
                    while (yy < h) {
                        val x = ((i * 397) % WIDTH).toFloat()
                        val path = Path()
                        path.moveTo(x, yy)
                        path.quadTo(x - 30f, yy - 20f, x - 36f, yy - 50f)
                        path.quadTo(x + 6f, yy - 40f, x, yy)
                        c.drawPath(path, p)
                        yy += 110f; i++
                    }
                }
                "ottoman" -> {
                    val gold = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = t.secondary; style = Paint.Style.STROKE; strokeWidth = 4f }
                    c.drawRect(14f, 14f, w - 14f, h - 14f, gold)
                    gold.strokeWidth = 1.5f
                    c.drawRect(24f, 24f, w - 24f, h - 24f, gold)
                    val diamond = fill(t.secondary)
                    listOf(14f to 14f, w - 14f to 14f, 14f to h - 14f, w - 14f to h - 14f).forEach { (x, yy) ->
                        val d = Path()
                        d.moveTo(x, yy - 14f); d.lineTo(x + 14f, yy); d.lineTo(x, yy + 14f); d.lineTo(x - 14f, yy); d.close()
                        c.drawPath(d, diamond)
                    }
                }
            }
        }

        // ---------- Kahraman görsel ve başlık ----------
        fun heroSection(c: Canvas?): Float {
            val heroH = 620f
            if (c != null) {
                val rect = RectF(0f, 0f, w, heroH)
                if (hero != null) {
                    drawBitmapCover(c, hero, rect, 0f)
                } else {
                    c.save(); c.clipRect(rect)
                    FoodIllustrations.draw(c, imageModel.removePrefix("illu:"), w, heroH)
                    c.restore()
                }
                val shade = Paint().apply { shader = LinearGradient(0f, heroH - 160f, 0f, heroH, 0x00000000, withAlpha(t.background, 255), Shader.TileMode.CLAMP) }
                c.drawRect(0f, heroH - 160f, w, heroH, shade)
            }
            // Başlık kutusu
            val titleP = tp(64f, t.onPrimary, face = serif)
            val subP = tp(32f, t.onPrimary, face = serif)
            val maxW = w * 0.6f - 60f
            val title = layout(recipe.title, titleP, maxW, maxLines = 3)
            val subtitle = layout("${recipe.servings} kişilik • ${recipe.category}", subP, maxW, maxLines = 1)
            val boxW = max(maxLineWidth(title), maxLineWidth(subtitle)) + 60f
            val boxH = title.height + subtitle.height + 52f
            if (c != null) {
                val box = RectF(30f, 30f, 30f + boxW, 30f + boxH)
                c.drawRoundRect(RectF(box.left + 6f, box.top + 8f, box.right + 6f, box.bottom + 8f), 26f, 26f, fill(0x33000000))
                c.drawRoundRect(box, 26f, 26f, fill(withAlpha(t.primary, 242)))
                draw(c, title, box.left + 30f, box.top + 22f)
                draw(c, subtitle, box.left + 30f, box.top + 26f + title.height)
            }
            // El yazısı not (tagline)
            val tagline = recipe.tagline.ifBlank { t.tagline }
            if (c != null && tagline.isNotBlank()) {
                val noteP = tp(34f, t.primary, face = Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC))
                val noteW = 380f
                val note = layout(tagline, noteP, noteW - 40f, Layout.Alignment.ALIGN_CENTER, maxLines = 3)
                val nh = note.height + 70f
                c.save()
                c.rotate(-4f, w - 230f, 90f)
                val r = RectF(w - 30f - noteW, 40f, w - 30f, 40f + nh)
                c.drawRoundRect(RectF(r.left + 5f, r.top + 7f, r.right + 5f, r.bottom + 7f), 10f, 10f, fill(0x26000000))
                c.drawRoundRect(r, 10f, 10f, fill(0xFFFFFDF7.toInt()))
                draw(c, note, r.left + 20f, r.top + 22f)
                val heart = tp(30f, t.primary)
                c.drawText("♡", r.centerX() - 10f, r.bottom - 14f, heart)
                c.restore()
            }
            return heroH
        }

        fun metaChips(c: Canvas?, top: Float): Float {
            val chips = buildList {
                if (recipe.prepMinutes > 0) add("⏱ Hazırlık ${QuantityFormat.minutes(recipe.prepMinutes)}")
                if (recipe.cookMinutes > 0) add("🔥 Pişirme ${QuantityFormat.minutes(recipe.cookMinutes)}")
                if (recipe.restMinutes > 0) add("❄ Dinlenme ${QuantityFormat.minutes(recipe.restMinutes)}")
                add("📊 ${Difficulty.label(recipe.difficulty)}")
                add("🔥 ${report.perServing.kcal.roundToInt()} kcal/porsiyon")
                add("👩‍🍳 ${recipe.authorName}")
            }
            val p = tp(25f, t.ink, bold = true)
            var x = PAD
            var y = top
            val h = 50f
            for (chip in chips) {
                val tw = p.measureText(chip) + 36f
                if (x + tw > w - PAD) { x = PAD; y += h + 12f }
                if (c != null) {
                    val r = RectF(x, y, x + tw, y + h)
                    c.drawRoundRect(r, 25f, 25f, fill(t.card))
                    c.drawRoundRect(r, 25f, 25f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = withAlpha(t.primary, 60); style = Paint.Style.STROKE; strokeWidth = 2f })
                    c.drawText(chip, x + 18f, y + 34f, p)
                }
                x += tw + 12f
            }
            return y + h
        }

        fun sectionLabel(c: Canvas?, top: Float, text: String, hint: String): Float {
            val p = tp(38f, t.onPrimary, face = serif)
            val tw = p.measureText(text) + 56f
            val h = 64f
            if (c != null) {
                val r = RectF(PAD, top, PAD + tw, top + h)
                c.drawRoundRect(r, 32f, 32f, fill(t.primary))
                c.drawText(text, PAD + 28f, top + 45f, p)
                val hp = tp(24f, t.muted, italic = true)
                c.drawText(hint, PAD + tw + 20f, top + 42f, hp)
                c.drawLine(PAD + tw + 30f + hp.measureText(hint), top + h / 2, w - PAD, top + h / 2, Paint().apply { color = withAlpha(t.primary, 50); strokeWidth = 2f })
            }
            return top + h
        }

        // ---------- Malzeme kartları ----------
        inner class Tile(val emoji: StaticLayout, val amount: StaticLayout?, val name: StaticLayout, val note: StaticLayout?) {
            val height: Float get() = emoji.height + 6f + (amount?.height ?: 0) + 4f + name.height + (note?.let { it.height + 4f } ?: 0f)
        }

        fun buildTile(ing: Ingredient, tileW: Float): Tile {
            val inner = tileW - 10f
            val emoji = layout(NutritionCalculator.emojiFor(ing), tp(50f, t.ink), inner, Layout.Alignment.ALIGN_CENTER, 1)
            val amt = QuantityFormat.ingredientAmount(ing)
            val amountText = listOf(amt, ing.unit).filter { it.isNotBlank() }.joinToString(" ")
            val amount = if (amountText.isNotBlank()) layout(amountText, tp(25f, t.ink, bold = true), inner, Layout.Alignment.ALIGN_CENTER, 2) else null
            val name = layout(ing.name, tp(21f, t.ink), inner, Layout.Alignment.ALIGN_CENTER, 2)
            val note = if (ing.note.isNotBlank()) layout("(${ing.note})", tp(16f, t.muted), inner, Layout.Alignment.ALIGN_CENTER, 2) else null
            return Tile(emoji, amount, name, note)
        }

        fun ingredientCards(c: Canvas?, top: Float): Float {
            val groups = recipe.ingredientGroups()
            if (groups.isEmpty()) return top
            var y = top
            var index = 0
            groups.chunked(4).forEach { rowGroups ->
                val cols = rowGroups.size
                val cardW = (w - 2 * PAD - (cols - 1) * GAP) / cols
                // Ölç
                data class Built(val title: StaticLayout, val rows: List<List<Tile>>, val tileW: Float, val height: Float)
                val built = rowGroups.map { (name, items) ->
                    val title = layout(name, tp(28f, Color.BLACK, bold = true), cardW - 100f, maxLines = 2)
                    val perRow = max(1, floor((cardW - 28f) / 132f).toInt())
                    val tileW = (cardW - 28f) / perRow
                    val tiles = items.map { buildTile(it, tileW) }
                    val rows = tiles.chunked(perRow)
                    val h = 24f + max(48f, title.height.toFloat()) + 18f + rows.sumOf { r -> (r.maxOf { it.height } + 18f).toDouble() }.toFloat() + 10f
                    Built(title, rows, tileW, h)
                }
                val rowH = built.maxOf { it.height }
                built.forEachIndexed { i, b ->
                    val x = PAD + i * (cardW + GAP)
                    val (tint, accent) = t.groupColors[(index + i) % t.groupColors.size]
                    if (c != null) {
                        val r = RectF(x, y, x + cardW, y + rowH)
                        c.drawRoundRect(RectF(r.left + 3f, r.top + 5f, r.right + 3f, r.bottom + 5f), 26f, 26f, fill(0x14000000))
                        c.drawRoundRect(r, 26f, 26f, fill(tint))
                        c.drawCircle(x + 38f, y + 48f, 24f, fill(accent))
                        val numP = tp(28f, Color.WHITE, bold = true)
                        val num = (index + i + 1).toString()
                        c.drawText(num, x + 38f - numP.measureText(num) / 2, y + 58f, numP)
                        val titleColored = layout(rowGroups[i].first, tp(28f, accent, bold = true), cardW - 100f, maxLines = 2)
                        draw(c, titleColored, x + 72f, y + 48f - titleColored.height / 2f)
                        var ty = y + 24f + max(48f, b.title.height.toFloat()) + 18f
                        for (row in b.rows) {
                            val rh = row.maxOf { it.height }
                            row.forEachIndexed { k, tile ->
                                val tx = x + 14f + k * b.tileW + 5f
                                var yy = ty
                                draw(c, tile.emoji, tx, yy); yy += tile.emoji.height + 6f
                                tile.amount?.let { draw(c, it, tx, yy); yy += it.height + 4f }
                                draw(c, tile.name, tx, yy); yy += tile.name.height + 4f
                                tile.note?.let { draw(c, it, tx, yy) }
                            }
                            ty += rh + 18f
                        }
                    }
                }
                index += cols
                y += rowH + GAP
            }
            return y - GAP
        }

        // ---------- Adım kartları ----------
        fun stepCards(c: Canvas?, top: Float): Float {
            val steps = recipe.steps
            val cols = min(4, max(1, steps.size))
            val cardW = (w - 2 * PAD - (cols - 1) * GAP) / cols
            var y = top
            steps.chunked(cols).forEachIndexed { rowIdx, row ->
                data class B(val title: StaticLayout, val text: StaticLayout, val bannerH: Float, val height: Float)
                val built = row.mapIndexed { k, st ->
                    val n = rowIdx * cols + k + 1
                    val title = layout(st.title.ifBlank { "Adım $n" }, tp(24f, t.ink, bold = true), cardW - 84f, maxLines = 3)
                    val text = layout(st.text, tp(20f, t.ink), cardW - 32f)
                    val bannerH = cardW * 0.58f
                    val h = 18f + max(46f, title.height.toFloat()) + 14f + bannerH + 14f + text.height + 22f
                    B(title, text, bannerH, h)
                }
                val rowH = built.maxOf { it.height }
                built.forEachIndexed { k, b ->
                    val st = row[k]
                    val n = rowIdx * cols + k + 1
                    val x = PAD + k * (cardW + GAP)
                    if (c != null) {
                        val r = RectF(x, y, x + cardW, y + rowH)
                        c.drawRoundRect(RectF(r.left + 3f, r.top + 5f, r.right + 3f, r.bottom + 5f), 24f, 24f, fill(0x16000000))
                        c.drawRoundRect(r, 24f, 24f, fill(t.card))
                        val (tint, accent) = t.groupColors[(n - 1) % t.groupColors.size]
                        c.drawCircle(x + 36f, y + 18f + 23f, 23f, fill(t.primary))
                        val numP = tp(26f, t.onPrimary, bold = true)
                        c.drawText(n.toString(), x + 36f - numP.measureText(n.toString()) / 2, y + 18f + 32f, numP)
                        draw(c, b.title, x + 68f, y + 18f + 23f - b.title.height / 2f)
                        val by = y + 18f + max(46f, b.title.height.toFloat()) + 14f
                        val banner = RectF(x + 14f, by, x + cardW - 14f, by + b.bannerH)
                        val bmp = stepBitmaps.getOrNull(n - 1)
                        if (bmp != null) {
                            drawBitmapCover(c, bmp, banner, 16f)
                        } else {
                            val g = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = LinearGradient(0f, banner.top, 0f, banner.bottom, tint, withAlpha(accent, 70), Shader.TileMode.CLAMP) }
                            c.drawRoundRect(banner, 16f, 16f, g)
                            val ep = tp(b.bannerH * 0.42f, Color.BLACK)
                            val emoji = stepEmoji(st.title + " " + st.text)
                            c.drawText(emoji, banner.centerX() - ep.measureText(emoji) / 2, banner.centerY() + ep.textSize * 0.35f, ep)
                        }
                        st.minutes?.let { m ->
                            val badge = "⏱ ${QuantityFormat.minutes(m)}"
                            val bp = tp(20f, Color.WHITE, bold = true)
                            val bw = bp.measureText(badge) + 24f
                            val br = RectF(banner.right - bw - 10f, banner.bottom - 44f, banner.right - 10f, banner.bottom - 10f)
                            c.drawRoundRect(br, 17f, 17f, fill(withAlpha(t.primary, 230)))
                            c.drawText(badge, br.left + 12f, br.bottom - 10f, bp)
                        }
                        draw(c, b.text, x + 16f, by + b.bannerH + 14f)
                    }
                }
                y += rowH + GAP
            }
            return y - GAP
        }

        // ---------- Püf noktaları + besin değerleri ----------
        fun tipText(tip: String, color: Int): CharSequence {
            val idx = tip.indexOf(':')
            val sb = SpannableStringBuilder()
            if (idx in 3..70) {
                val head = tip.substring(0, idx).trim()
                sb.append(head)
                sb.setSpan(StyleSpan(Typeface.BOLD), 0, head.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                sb.setSpan(ForegroundColorSpan(color), 0, head.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                sb.append("\n").append(tip.substring(idx + 1).trim().replaceFirstChar { it.titlecase(TurkishText.locale) })
            } else {
                sb.append(tip)
            }
            return sb
        }

        fun bottomBoxes(c: Canvas?, top: Float): Float {
            val tips = recipe.tips.take(12)
            val full = w - 2 * PAD
            val tipsW = if (tips.isEmpty()) 0f else full * 0.63f
            val nutW = if (tips.isEmpty()) full else full - tipsW - GAP
            // Püf noktaları ölçümü
            val colW = (tipsW - 48f - 20f) / 2
            val tipLayouts = tips.map { layout(tipText(it, t.primary), tp(19f, t.ink), colW - 50f) }
            val half = (tipLayouts.size + 1) / 2
            val left = tipLayouts.take(half)
            val right = tipLayouts.drop(half)
            fun colHeight(list: List<StaticLayout>) = list.sumOf { (max(36, it.height) + 16).toDouble() }.toFloat()
            val tipsH = if (tips.isEmpty()) 0f else 86f + max(colHeight(left), colHeight(right)) + 16f
            // Besin kutusu ölçümü
            val tags = NutritionCalculator.healthTags(report)
            val nutH = 96f + 90f + 4 * 58f + 40f + tagsHeight(null, tags, nutW - 40f, 0f, 0f) + 30f
            val h = max(tipsH, nutH)
            if (c != null) {
                if (tips.isNotEmpty()) {
                    val r = RectF(PAD, top, PAD + tipsW, top + h)
                    c.drawRoundRect(r, 28f, 28f, fill(t.card))
                    c.drawRoundRect(r, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = withAlpha(t.primary, 120); style = Paint.Style.STROKE; strokeWidth = 3f })
                    val hp = tp(34f, t.onPrimary, face = serif)
                    val label = "👨‍🍳 Püf Noktaları"
                    val lw = hp.measureText(label) + 50f
                    c.drawRoundRect(RectF(r.left + 20f, r.top + 18f, r.left + 20f + lw, r.top + 74f), 28f, 28f, fill(t.primary))
                    c.drawText(label, r.left + 45f, r.top + 58f, hp)
                    var number = 1
                    listOf(left to (r.left + 24f), right to (r.left + 24f + colW + 20f)).forEach { (col, cx) ->
                        var ty = r.top + 92f
                        for (l in col) {
                            c.drawCircle(cx + 18f, ty + 18f, 18f, fill(t.primary))
                            val np = tp(19f, t.onPrimary, bold = true)
                            c.drawText(number.toString(), cx + 18f - np.measureText(number.toString()) / 2, ty + 25f, np)
                            draw(c, l, cx + 48f, ty)
                            ty += max(36, l.height) + 16f
                            number++
                        }
                    }
                }
                val nx = if (tips.isEmpty()) PAD else PAD + tipsW + GAP
                val r = RectF(nx, top, nx + nutW, top + h)
                c.drawRoundRect(r, 28f, 28f, fill(t.card))
                c.drawRoundRect(r, 28f, 28f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = withAlpha(t.secondary, 160); style = Paint.Style.STROKE; strokeWidth = 3f })
                c.drawText("Besin Değerleri", r.left + 24f, r.top + 52f, tp(32f, t.primary, face = serif))
                c.drawText("1 porsiyon • ${recipe.servings} kişilik tarif", r.left + 24f, r.top + 84f, tp(19f, t.muted))
                val kcal = report.perServing.kcal.roundToInt().toString()
                val kp = tp(72f, t.primary, bold = true)
                c.drawText(kcal, r.left + 24f, r.top + 168f, kp)
                c.drawText("kcal", r.left + 34f + kp.measureText(kcal), r.top + 168f, tp(28f, t.muted, bold = true))
                c.drawText("Toplam ${report.total.kcal.roundToInt()} kcal", r.right - 24f - tp(19f, t.muted).measureText("Toplam ${report.total.kcal.roundToInt()} kcal"), r.top + 166f, tp(19f, t.muted))
                val p = report.perServing
                val rows = listOf(
                    Triple("Protein", p.protein, 50.0), Triple("Karbonhidrat", p.carbs, 275.0),
                    Triple("Yağ", p.fat, 78.0), Triple("Lif", p.fiber, 28.0),
                )
                var ry = r.top + 200f
                rows.forEachIndexed { idx, (label, value, daily) ->
                    val (_, accent) = t.groupColors[idx % t.groupColors.size]
                    c.drawText(label, r.left + 24f, ry + 20f, tp(21f, t.ink, bold = true))
                    val vt = "${QuantityFormat.decimal(value)} g"
                    val vp = tp(21f, t.ink)
                    c.drawText(vt, r.right - 24f - vp.measureText(vt), ry + 20f, vp)
                    val barR = RectF(r.left + 24f, ry + 30f, r.right - 24f, ry + 42f)
                    c.drawRoundRect(barR, 6f, 6f, fill(withAlpha(accent, 40)))
                    val frac = (value / daily).coerceIn(0.0, 1.0).toFloat()
                    c.drawRoundRect(RectF(barR.left, barR.top, barR.left + barR.width() * max(frac, 0.02f), barR.bottom), 6f, 6f, fill(accent))
                    ry += 58f
                }
                tagsHeight(c, tags, nutW - 40f, r.left + 20f, ry + 16f)
            }
            return top + h
        }

        fun tagsHeight(c: Canvas?, tags: List<com.tarifpro.app.domain.HealthTag>, width: Float, x0: Float, y0: Float): Float {
            if (tags.isEmpty()) return 0f
            val p = tp(18f, t.ink, bold = true)
            var x = 0f
            var y = 0f
            val h = 36f
            for (tag in tags) {
                val text = (if (tag.positive) "✓ " else "! ") + tag.label
                val tw = p.measureText(text) + 24f
                if (x + tw > width) { x = 0f; y += h + 8f }
                if (c != null) {
                    val r = RectF(x0 + x, y0 + y, x0 + x + tw, y0 + y + h)
                    c.drawRoundRect(r, 18f, 18f, fill(if (tag.positive) 0xFFE8F5E9.toInt() else 0xFFFFEBEE.toInt()))
                    p.color = if (tag.positive) 0xFF2E7D32.toInt() else 0xFFC62828.toInt()
                    c.drawText(text, r.left + 12f, r.bottom - 11f, p)
                }
                x += tw + 8f
            }
            return y + h
        }

        fun footer(c: Canvas?, top: Float): Float {
            if (c != null) {
                c.drawLine(PAD, top, w - PAD, top, Paint().apply { color = withAlpha(t.primary, 60); strokeWidth = 2f })
                val date = SimpleDateFormat("d MMMM yyyy", TurkishText.locale).format(Date())
                val text = "Tarif Pro ile hazırlandı  •  ${recipe.authorName}  •  $date"
                val p = tp(21f, t.muted)
                c.drawText(text, (w - p.measureText(text)) / 2, top + 44f, p)
            }
            return top + 70f
        }
    }
}
