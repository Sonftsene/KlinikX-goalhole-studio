package com.tarifpro.app.export

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Vektörel olarak çizilen hazır gurme illüstrasyonları. Hem uygulama içinde (Compose nativeCanvas)
 * hem de PNG/A4 dışa aktarımda aynı kod kullanılır; internet veya ek dosya gerektirmez.
 */
object FoodIllustrations {
    data class Item(val key: String, val label: String, val bgTop: Int, val bgBottom: Int)

    val all: List<Item> = listOf(
        Item("dessert", "Katlı Tatlı", 0xFFFFE3EA.toInt(), 0xFFF8BBD0.toInt()),
        Item("cake", "Pasta Dilimi", 0xFFFFF1E0.toInt(), 0xFFFFCCBC.toInt()),
        Item("soup", "Çorba", 0xFFFFF4D6.toInt(), 0xFFFFD180.toInt()),
        Item("salad", "Salata", 0xFFE8F5E9.toInt(), 0xFFB9F6CA.toInt()),
        Item("pasta", "Makarna", 0xFFFFF8E1.toInt(), 0xFFFFE082.toInt()),
        Item("kebab", "Izgara & Kebap", 0xFFFBE9E7.toInt(), 0xFFFFAB91.toInt()),
        Item("fish", "Balık", 0xFFE1F5FE.toInt(), 0xFF81D4FA.toInt()),
        Item("bread", "Hamur İşi", 0xFFFFF3E0.toInt(), 0xFFFFCC80.toInt()),
        Item("breakfast", "Kahvaltı", 0xFFFFFDE7.toInt(), 0xFFFFF59D.toInt()),
        Item("drink", "İçecek", 0xFFE0F7FA.toInt(), 0xFF80DEEA.toInt()),
        Item("stew", "Tencere Yemeği", 0xFFFBE9E7.toInt(), 0xFFFFCCBC.toInt()),
        Item("bowl", "Fit Kase", 0xFFF1F8E9.toInt(), 0xFFC5E1A5.toInt()),
    )

    fun item(key: String): Item = all.firstOrNull { it.key == key } ?: all.first()

    fun forCategory(category: String): String = when (category) {
        "Tatlı" -> "dessert"
        "Çorba" -> "soup"
        "Salata" -> "salad"
        "Makarna" -> "pasta"
        "Et & Tavuk" -> "kebab"
        "Deniz Ürünleri" -> "fish"
        "Hamur İşi" -> "bread"
        "Kahvaltı" -> "breakfast"
        "İçecek" -> "drink"
        "Fit & Diyet", "Vejetaryen" -> "bowl"
        "Meze", "Atıştırmalık" -> "salad"
        else -> "stew"
    }

    fun bitmap(key: String, width: Int, height: Int): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        draw(Canvas(bmp), key, width.toFloat(), height.toFloat())
        return bmp
    }

    private fun paint(color: Int, style: Paint.Style = Paint.Style.FILL) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color
        this.style = style
    }

    fun draw(canvas: Canvas, key: String, w: Float, h: Float) {
        val item = item(key)
        val bg = paint(0)
        bg.shader = LinearGradient(0f, 0f, 0f, h, item.bgTop, item.bgBottom, Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, w, h, bg)
        // Arka plan süsü: yumuşak noktalar
        val dot = paint(0x22FFFFFF)
        val step = min(w, h) / 6f
        var y = step / 2
        var row = 0
        while (y < h) {
            var x = if (row % 2 == 0) step / 2 else step
            while (x < w) {
                canvas.drawCircle(x, y, step * 0.12f, dot); x += step
            }
            y += step; row++
        }
        val cx = w / 2f
        val cy = h * 0.56f
        val s = min(w, h * 1.4f) * 0.42f
        // Gölge + tabak
        val shadow = paint(0x33000000)
        canvas.drawOval(RectF(cx - s * 1.05f, cy + s * 0.25f, cx + s * 1.05f, cy + s * 0.75f), shadow)
        val plate = paint(0xFFFFFFFF.toInt())
        plate.shader = RadialGradient(cx, cy + s * 0.4f, s, 0xFFFFFFFF.toInt(), 0xFFECEFF1.toInt(), Shader.TileMode.CLAMP)
        if (key != "drink") {
            canvas.drawOval(RectF(cx - s, cy + s * 0.1f, cx + s, cy + s * 0.68f), plate)
            canvas.drawOval(RectF(cx - s * 0.78f, cy + s * 0.2f, cx + s * 0.78f, cy + s * 0.58f), paint(0xFFF5F5F5.toInt()))
        }
        when (key) {
            "dessert" -> layered(canvas, cx, cy, s, top = 0xFFC2185B.toInt(), cream = 0xFFFFFFFF.toInt(), cake = 0xFFFFE0A3.toInt(), swirl = true)
            "cake" -> slice(canvas, cx, cy, s)
            "soup" -> soup(canvas, cx, cy, s)
            "salad" -> salad(canvas, cx, cy, s)
            "pasta" -> pasta(canvas, cx, cy, s)
            "kebab" -> kebab(canvas, cx, cy, s)
            "fish" -> fish(canvas, cx, cy, s)
            "bread" -> bread(canvas, cx, cy, s)
            "breakfast" -> breakfast(canvas, cx, cy, s)
            "drink" -> drink(canvas, cx, cy, s)
            "bowl" -> fitBowl(canvas, cx, cy, s)
            else -> stew(canvas, cx, cy, s)
        }
    }

    private fun layered(c: Canvas, cx: Float, cy: Float, s: Float, top: Int, cream: Int, cake: Int, swirl: Boolean) {
        val left = cx - s * 0.62f
        val right = cx + s * 0.62f
        val base = cy + s * 0.38f
        val r = s * 0.08f
        // Kek katmanı
        val cakeP = paint(cake)
        c.drawRoundRect(RectF(left, base - s * 0.45f, right, base), r, r, cakeP)
        val crumb = paint(0x33A1887F)
        for (i in 0 until 26) {
            val x = left + (i * 37 % 100) / 100f * (right - left)
            val y = base - s * 0.4f + (i * 53 % 100) / 100f * s * 0.35f
            c.drawCircle(x, y, s * 0.018f, crumb)
        }
        // Krema
        c.drawRoundRect(RectF(left, base - s * 0.62f, right, base - s * 0.42f), r, r, paint(cream))
        // Sos
        c.drawRoundRect(RectF(left, base - s * 0.78f, right, base - s * 0.6f), r, r, paint(top))
        if (swirl) {
            val wave = paint(0xFFFFFFFF.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.025f; strokeCap = Paint.Cap.ROUND }
            var x = left + s * 0.1f
            while (x < right - s * 0.05f) {
                val p = Path()
                p.moveTo(x, base - s * 0.76f)
                p.cubicTo(x + s * 0.06f, base - s * 0.72f, x - s * 0.04f, base - s * 0.66f, x + s * 0.03f, base - s * 0.62f)
                c.drawPath(p, wave); x += s * 0.16f
            }
        }
        berry(c, cx + s * 0.25f, base - s * 0.86f, s * 0.11f)
        berry(c, cx + s * 0.4f, base - s * 0.82f, s * 0.08f)
        leaf(c, cx + s * 0.15f, base - s * 0.95f, s * 0.12f)
    }

    private fun berry(c: Canvas, x: Float, y: Float, r: Float) {
        c.drawCircle(x, y, r, paint(0xFFD81B60.toInt()))
        val d = paint(0xFFAD1457.toInt())
        for (i in 0 until 7) {
            val a = i * Math.PI * 2 / 7
            c.drawCircle(x + (cos(a) * r * 0.55).toFloat(), y + (sin(a) * r * 0.55).toFloat(), r * 0.28f, d)
        }
        c.drawCircle(x - r * 0.3f, y - r * 0.35f, r * 0.18f, paint(0x88FFFFFF.toInt()))
    }

    private fun leaf(c: Canvas, x: Float, y: Float, size: Float, color: Int = 0xFF43A047.toInt()) {
        val p = Path()
        p.moveTo(x, y)
        p.quadTo(x - size, y - size * 0.6f, x - size * 1.2f, y - size * 1.4f)
        p.quadTo(x + size * 0.2f, y - size * 1.2f, x, y)
        c.drawPath(p, paint(color))
    }

    private fun slice(c: Canvas, cx: Float, cy: Float, s: Float) {
        val base = cy + s * 0.38f
        val p = Path()
        p.moveTo(cx - s * 0.6f, base)
        p.lineTo(cx + s * 0.55f, base)
        p.lineTo(cx + s * 0.55f, base - s * 0.55f)
        p.lineTo(cx - s * 0.6f, base - s * 0.25f)
        p.close()
        c.drawPath(p, paint(0xFF6D4C41.toInt()))
        val cream = paint(0xFFFFF8E1.toInt())
        c.drawRect(cx - s * 0.6f, base - s * 0.22f, cx + s * 0.55f, base - s * 0.16f, cream)
        c.drawRect(cx - s * 0.6f, base - s * 0.1f, cx + s * 0.55f, base - s * 0.04f, cream)
        val topP = Path()
        topP.moveTo(cx - s * 0.6f, base - s * 0.25f)
        topP.lineTo(cx + s * 0.55f, base - s * 0.55f)
        topP.lineTo(cx + s * 0.55f, base - s * 0.62f)
        topP.lineTo(cx - s * 0.6f, base - s * 0.32f)
        topP.close()
        c.drawPath(topP, paint(0xFF4E342E.toInt()))
        berry(c, cx + s * 0.3f, base - s * 0.68f, s * 0.1f)
        c.drawCircle(cx, base - s * 0.5f, s * 0.08f, paint(0xFFFFFFFF.toInt()))
    }

    private fun soup(c: Canvas, cx: Float, cy: Float, s: Float) {
        val bowl = Path()
        bowl.moveTo(cx - s * 0.75f, cy - s * 0.05f)
        bowl.quadTo(cx, cy + s * 0.95f, cx + s * 0.75f, cy - s * 0.05f)
        bowl.close()
        c.drawPath(bowl, paint(0xFF8D6E63.toInt()))
        c.drawOval(RectF(cx - s * 0.75f, cy - s * 0.2f, cx + s * 0.75f, cy + s * 0.1f), paint(0xFF6D4C41.toInt()))
        c.drawOval(RectF(cx - s * 0.68f, cy - s * 0.16f, cx + s * 0.68f, cy + s * 0.06f), paint(0xFFFF8F00.toInt()))
        c.drawCircle(cx - s * 0.2f, cy - s * 0.06f, s * 0.05f, paint(0xFFE65100.toInt()))
        c.drawCircle(cx + s * 0.25f, cy - s * 0.03f, s * 0.04f, paint(0xFF2E7D32.toInt()))
        c.drawCircle(cx + s * 0.05f, cy - s * 0.1f, s * 0.035f, paint(0xFF2E7D32.toInt()))
        lemon(c, cx + s * 0.55f, cy - s * 0.1f, s * 0.13f)
        steam(c, cx, cy - s * 0.3f, s)
    }

    private fun lemon(c: Canvas, x: Float, y: Float, r: Float) {
        c.drawCircle(x, y, r, paint(0xFFFDD835.toInt()))
        c.drawCircle(x, y, r * 0.82f, paint(0xFFFFF59D.toInt()))
        val seg = paint(0xFFFDD835.toInt(), Paint.Style.STROKE).apply { strokeWidth = r * 0.08f }
        for (i in 0 until 6) {
            val a = i * Math.PI / 3
            c.drawLine(x, y, x + (cos(a) * r * 0.8).toFloat(), y + (sin(a) * r * 0.8).toFloat(), seg)
        }
    }

    private fun steam(c: Canvas, cx: Float, top: Float, s: Float) {
        val st = paint(0x99FFFFFF.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.04f; strokeCap = Paint.Cap.ROUND }
        for (i in -1..1) {
            val x = cx + i * s * 0.22f
            val p = Path()
            p.moveTo(x, top)
            p.cubicTo(x - s * 0.1f, top - s * 0.15f, x + s * 0.1f, top - s * 0.25f, x, top - s * 0.4f)
            c.drawPath(p, st)
        }
    }

    private fun salad(c: Canvas, cx: Float, cy: Float, s: Float) {
        c.drawOval(RectF(cx - s * 0.8f, cy - s * 0.25f, cx + s * 0.8f, cy + s * 0.55f), paint(0xFFFFFFFF.toInt()))
        val greens = intArrayOf(0xFF66BB6A.toInt(), 0xFF43A047.toInt(), 0xFF9CCC65.toInt(), 0xFF2E7D32.toInt())
        for (i in 0 until 14) {
            val a = i * 0.9
            val x = cx + (cos(a) * s * 0.45 * ((i % 3) / 3.0 + 0.4)).toFloat()
            val y = cy + (sin(a) * s * 0.18).toFloat()
            leaf(c, x, y + s * 0.05f, s * 0.2f, greens[i % greens.size])
        }
        c.drawCircle(cx - s * 0.25f, cy - s * 0.05f, s * 0.1f, paint(0xFFE53935.toInt()))
        c.drawCircle(cx + s * 0.3f, cy, s * 0.09f, paint(0xFFE53935.toInt()))
        c.drawCircle(cx + s * 0.05f, cy + s * 0.08f, s * 0.07f, paint(0xFFFDD835.toInt()))
        c.drawCircle(cx - s * 0.05f, cy - s * 0.12f, s * 0.05f, paint(0xFF212121.toInt()))
    }

    private fun pasta(c: Canvas, cx: Float, cy: Float, s: Float) {
        val noodle = paint(0xFFFFCA28.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.045f; strokeCap = Paint.Cap.ROUND }
        for (i in 0 until 9) {
            val p = Path()
            val off = (i - 4) * s * 0.08f
            p.moveTo(cx - s * 0.55f, cy + off * 0.4f)
            p.cubicTo(cx - s * 0.2f, cy - s * 0.3f + off, cx + s * 0.2f, cy + s * 0.3f + off, cx + s * 0.55f, cy + off * 0.3f)
            c.drawPath(p, noodle)
        }
        c.drawCircle(cx, cy - s * 0.02f, s * 0.22f, paint(0xFFD84315.toInt()))
        c.drawCircle(cx - s * 0.08f, cy - s * 0.08f, s * 0.05f, paint(0xFFBF360C.toInt()))
        leaf(c, cx + s * 0.05f, cy - s * 0.12f, s * 0.12f)
        c.drawCircle(cx + s * 0.25f, cy + s * 0.15f, s * 0.04f, paint(0xFFFFFDE7.toInt()))
    }

    private fun kebab(c: Canvas, cx: Float, cy: Float, s: Float) {
        val stick = paint(0xFF795548.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.03f }
        for (k in 0..1) {
            val y = cy - s * 0.05f + k * s * 0.28f
            c.drawLine(cx - s * 0.8f, y + s * 0.1f, cx + s * 0.8f, y - s * 0.1f, stick)
            val colors = intArrayOf(0xFF6D4C41.toInt(), 0xFFE53935.toInt(), 0xFF5D4037.toInt(), 0xFF43A047.toInt(), 0xFF6D4C41.toInt(), 0xFFFDD835.toInt())
            for (i in colors.indices) {
                val x = cx - s * 0.55f + i * s * 0.22f
                val yy = y + s * 0.07f - i * s * 0.03f
                c.drawRoundRect(RectF(x - s * 0.09f, yy - s * 0.09f, x + s * 0.09f, yy + s * 0.09f), s * 0.04f, s * 0.04f, paint(colors[i]))
            }
        }
        val grill = paint(0x55000000, Paint.Style.STROKE).apply { strokeWidth = s * 0.012f }
        for (i in 0 until 5) c.drawLine(cx - s * 0.5f + i * s * 0.2f, cy - s * 0.15f, cx - s * 0.45f + i * s * 0.2f, cy + s * 0.35f, grill)
    }

    private fun fish(c: Canvas, cx: Float, cy: Float, s: Float) {
        val body = Path()
        body.moveTo(cx - s * 0.6f, cy + s * 0.15f)
        body.quadTo(cx, cy - s * 0.3f, cx + s * 0.45f, cy + s * 0.15f)
        body.quadTo(cx, cy + s * 0.55f, cx - s * 0.6f, cy + s * 0.15f)
        c.drawPath(body, paint(0xFF90A4AE.toInt()))
        val tail = Path()
        tail.moveTo(cx + s * 0.4f, cy + s * 0.15f)
        tail.lineTo(cx + s * 0.75f, cy - s * 0.05f)
        tail.lineTo(cx + s * 0.75f, cy + s * 0.35f)
        tail.close()
        c.drawPath(tail, paint(0xFF78909C.toInt()))
        c.drawCircle(cx - s * 0.42f, cy + s * 0.08f, s * 0.04f, paint(0xFF263238.toInt()))
        val grill = paint(0xFF5D4037.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.02f }
        for (i in 0 until 4) c.drawLine(cx - s * 0.25f + i * s * 0.15f, cy - s * 0.02f, cx - s * 0.3f + i * s * 0.15f, cy + s * 0.32f, grill)
        lemon(c, cx - s * 0.1f, cy - s * 0.25f, s * 0.12f)
        leaf(c, cx + s * 0.25f, cy - s * 0.15f, s * 0.13f)
    }

    private fun bread(c: Canvas, cx: Float, cy: Float, s: Float) {
        val loaf = paint(0xFFD7A15A.toInt())
        c.drawOval(RectF(cx - s * 0.7f, cy - s * 0.3f, cx + s * 0.7f, cy + s * 0.4f), loaf)
        c.drawOval(RectF(cx - s * 0.62f, cy - s * 0.32f, cx + s * 0.62f, cy + s * 0.18f), paint(0xFFE6B877.toInt()))
        val cut = paint(0xFFB7793A.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.035f; strokeCap = Paint.Cap.ROUND }
        for (i in -1..1) c.drawLine(cx + i * s * 0.28f - s * 0.08f, cy - s * 0.15f, cx + i * s * 0.28f + s * 0.08f, cy + s * 0.08f, cut)
        val seed = paint(0xFFFFF8E1.toInt())
        for (i in 0 until 20) c.drawCircle(cx - s * 0.5f + (i * 31 % 100) / 100f * s, cy - s * 0.2f + (i * 17 % 30) / 100f * s, s * 0.012f, seed)
    }

    private fun breakfast(c: Canvas, cx: Float, cy: Float, s: Float) {
        c.drawCircle(cx, cy + s * 0.05f, s * 0.6f, paint(0xFF37474F.toInt()))
        c.drawCircle(cx, cy + s * 0.05f, s * 0.52f, paint(0xFF455A64.toInt()))
        c.drawRoundRect(RectF(cx + s * 0.55f, cy - s * 0.02f, cx + s * 1.05f, cy + s * 0.1f), s * 0.05f, s * 0.05f, paint(0xFF263238.toInt()))
        c.drawOval(RectF(cx - s * 0.45f, cy - s * 0.25f, cx + s * 0.05f, cy + s * 0.2f), paint(0xFFFFFFFF.toInt()))
        c.drawCircle(cx - s * 0.2f, cy - s * 0.03f, s * 0.12f, paint(0xFFFFB300.toInt()))
        c.drawOval(RectF(cx - s * 0.05f, cy - s * 0.05f, cx + s * 0.42f, cy + s * 0.38f), paint(0xFFFFFFFF.toInt()))
        c.drawCircle(cx + s * 0.18f, cy + s * 0.16f, s * 0.11f, paint(0xFFFFA000.toInt()))
        c.drawCircle(cx + s * 0.25f, cy - s * 0.2f, s * 0.07f, paint(0xFFE53935.toInt()))
        c.drawCircle(cx - s * 0.25f, cy + s * 0.32f, s * 0.05f, paint(0xFF43A047.toInt()))
    }

    private fun drink(c: Canvas, cx: Float, cy: Float, s: Float) {
        val glass = Path()
        glass.moveTo(cx - s * 0.4f, cy - s * 0.6f)
        glass.lineTo(cx + s * 0.4f, cy - s * 0.6f)
        glass.lineTo(cx + s * 0.3f, cy + s * 0.6f)
        glass.lineTo(cx - s * 0.3f, cy + s * 0.6f)
        glass.close()
        c.drawPath(glass, paint(0x66FFFFFF))
        val juice = Path()
        juice.moveTo(cx - s * 0.37f, cy - s * 0.35f)
        juice.lineTo(cx + s * 0.37f, cy - s * 0.35f)
        juice.lineTo(cx + s * 0.3f, cy + s * 0.58f)
        juice.lineTo(cx - s * 0.3f, cy + s * 0.58f)
        juice.close()
        c.drawPath(juice, paint(0xFFFF7043.toInt()))
        c.drawRect(cx - s * 0.25f, cy - s * 0.2f, cx - s * 0.1f, cy - s * 0.05f, paint(0x99FFFFFF.toInt()))
        c.drawRect(cx + s * 0.05f, cy + s * 0.05f, cx + s * 0.2f, cy + s * 0.2f, paint(0x99FFFFFF.toInt()))
        val straw = paint(0xFF26A69A.toInt(), Paint.Style.STROKE).apply { strokeWidth = s * 0.05f; strokeCap = Paint.Cap.ROUND }
        c.drawLine(cx + s * 0.1f, cy + s * 0.3f, cx + s * 0.35f, cy - s * 0.85f, straw)
        lemon(c, cx - s * 0.38f, cy - s * 0.6f, s * 0.16f)
        leaf(c, cx, cy - s * 0.62f, s * 0.15f)
    }

    private fun fitBowl(c: Canvas, cx: Float, cy: Float, s: Float) {
        c.drawOval(RectF(cx - s * 0.8f, cy - s * 0.25f, cx + s * 0.8f, cy + s * 0.55f), paint(0xFFECEFF1.toInt()))
        val parts = listOf(
            0xFFFFF59D.toInt() to (-0.4f to -0.02f), 0xFF66BB6A.toInt() to (0f to -0.08f), 0xFFE57373.toInt() to (0.4f to -0.02f),
            0xFF8D6E63.toInt() to (-0.25f to 0.2f), 0xFF81C784.toInt() to (0.25f to 0.2f),
        )
        parts.forEach { (col, pos) ->
            c.drawCircle(cx + pos.first * s, cy + pos.second * s, s * 0.2f, paint(col))
        }
        val av = paint(0xFF9CCC65.toInt())
        c.drawOval(RectF(cx - s * 0.12f, cy + s * 0.02f, cx + s * 0.14f, cy + s * 0.18f), av)
        c.drawCircle(cx + s * 0.01f, cy + s * 0.1f, s * 0.04f, paint(0xFF6D4C41.toInt()))
        for (i in 0 until 10) c.drawCircle(cx - s * 0.5f + i * s * 0.1f, cy - s * 0.12f + (i % 2) * s * 0.03f, s * 0.012f, paint(0xFF212121.toInt()))
    }

    private fun stew(c: Canvas, cx: Float, cy: Float, s: Float) {
        c.drawRoundRect(RectF(cx - s * 0.7f, cy - s * 0.2f, cx + s * 0.7f, cy + s * 0.5f), s * 0.2f, s * 0.2f, paint(0xFFB71C1C.toInt()))
        c.drawRoundRect(RectF(cx - s * 0.9f, cy - s * 0.12f, cx - s * 0.65f, cy + s * 0.0f), s * 0.05f, s * 0.05f, paint(0xFF7F0000.toInt()))
        c.drawRoundRect(RectF(cx + s * 0.65f, cy - s * 0.12f, cx + s * 0.9f, cy + s * 0.0f), s * 0.05f, s * 0.05f, paint(0xFF7F0000.toInt()))
        c.drawOval(RectF(cx - s * 0.65f, cy - s * 0.3f, cx + s * 0.65f, cy - s * 0.05f), paint(0xFFD84315.toInt()))
        c.drawCircle(cx - s * 0.25f, cy - s * 0.2f, s * 0.08f, paint(0xFF6D4C41.toInt()))
        c.drawCircle(cx + s * 0.1f, cy - s * 0.17f, s * 0.07f, paint(0xFFFFA000.toInt()))
        c.drawCircle(cx + s * 0.35f, cy - s * 0.2f, s * 0.06f, paint(0xFF2E7D32.toInt()))
        steam(c, cx, cy - s * 0.4f, s)
    }
}
