package com.atomik.kocu.share

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import java.io.File
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/** Paylaşılabilir sinematik "film afişi" kartları (1080x1350, Instagram dikey). */
object ShareCards {
    private const val W = 1080
    private const val H = 1350
    private val gold = 0xFFE8B76A.toInt()
    private val cream = 0xFFF3EFE6.toInt()
    private val dim = 0xFFA8A3B8.toInt()

    data class Spec(
        val kicker: String,
        val title: String,
        val big: String,
        val bigLabel: String,
        val lines: List<String> = emptyList(),
        val accent: Int = 0xFF8B6CFF.toInt(),
        val footer: String = "ATOMİK · Alışkanlık Koçu",
    )

    fun render(spec: Spec): Bitmap {
        val bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)

        // Arka plan
        p.shader = LinearGradient(0f, 0f, W.toFloat(), H.toFloat(), intArrayOf(0xFF07060D.toInt(), 0xFF141027.toInt(), 0xFF07060D.toInt()), null, Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, W.toFloat(), H.toFloat(), p)
        p.shader = RadialGradient(W / 2f, 470f, 560f, intArrayOf(spec.accent and 0x00FFFFFF or 0x55000000, 0x00000000), null, Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, W.toFloat(), H.toFloat(), p)
        p.shader = null

        // Yıldızlar / film greni
        val rnd = Random(spec.title.hashCode())
        repeat(180) {
            p.color = cream; p.alpha = rnd.nextInt(20, 120)
            c.drawCircle(rnd.nextFloat() * W, rnd.nextFloat() * H, rnd.nextFloat() * 2.2f + 0.4f, p)
        }

        // Film şeridi delikleri
        p.alpha = 255
        p.color = 0xFF000000.toInt()
        c.drawRect(0f, 0f, W.toFloat(), 70f, p)
        c.drawRect(0f, H - 70f, W.toFloat(), H.toFloat(), p)
        p.color = 0xFF1C1A28.toInt()
        var x = 18f
        while (x < W) {
            c.drawRoundRect(RectF(x, 20f, x + 38f, 50f), 6f, 6f, p)
            c.drawRoundRect(RectF(x, H - 50f, x + 38f, H - 20f), 6f, 6f, p)
            x += 70f
        }

        // Atom
        val cx = W / 2f; val cy = 430f
        p.style = Paint.Style.STROKE; p.strokeWidth = 5f
        listOf(0f, 60f, 120f).forEachIndexed { i, rot ->
            p.color = listOf(gold, spec.accent, 0xFF3DDBD9.toInt())[i]; p.alpha = 210
            c.save(); c.rotate(rot, cx, cy)
            c.drawOval(RectF(cx - 250f, cy - 90f, cx + 250f, cy + 90f), p)
            c.restore()
            val a = Math.toRadians((rot * 2 + 40).toDouble())
            val ex = cx + 250f * cos(a).toFloat(); val ey = cy + 90f * sin(a).toFloat()
            c.save(); c.rotate(rot, cx, cy)
            p.style = Paint.Style.FILL; c.drawCircle(ex, ey, 12f, p); p.style = Paint.Style.STROKE
            c.restore()
        }
        p.style = Paint.Style.FILL
        p.shader = RadialGradient(cx, cy, 150f, intArrayOf(0xFFFFF1D6.toInt(), gold and 0x00FFFFFF or 0x88000000.toInt(), 0x00000000), floatArrayOf(0f, 0.35f, 1f), Shader.TileMode.CLAMP)
        c.drawCircle(cx, cy, 150f, p)
        p.shader = null

        val tp = TextPaint(Paint.ANTI_ALIAS_FLAG)
        tp.textAlign = Paint.Align.CENTER

        // Büyük sayı
        tp.color = 0xFF0B0A14.toInt(); tp.typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD); tp.textSize = 110f
        val bigY = cy + 38f
        tp.color = 0xFF120F1E.toInt()
        c.drawText(spec.big, cx, bigY, tp)
        tp.textSize = 30f; tp.typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD); tp.letterSpacing = 0.25f
        tp.color = 0xFF120F1E.toInt()
        c.drawText(spec.bigLabel.uppercase(), cx, bigY + 46f, tp)

        // Kicker
        tp.color = gold; tp.textSize = 32f; tp.letterSpacing = 0.35f
        c.drawText(spec.kicker.uppercase(), cx, 160f, tp)

        // Başlık
        tp.letterSpacing = 0f
        tp.color = cream; tp.typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD); tp.textSize = 76f
        tp.textAlign = Paint.Align.LEFT
        val titleLayout = StaticLayout.Builder.obtain(spec.title, 0, spec.title.length, tp, W - 160)
            .setAlignment(Layout.Alignment.ALIGN_CENTER).setMaxLines(2).build()
        c.save(); c.translate(80f, 720f); titleLayout.draw(c); c.restore()

        // Satırlar
        tp.typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL); tp.textSize = 38f; tp.color = dim
        var y = 720f + titleLayout.height + 50f
        spec.lines.take(5).forEach { line ->
            val l = StaticLayout.Builder.obtain(line, 0, line.length, tp, W - 200).setAlignment(Layout.Alignment.ALIGN_CENTER).setMaxLines(2).build()
            c.save(); c.translate(100f, y); l.draw(c); c.restore()
            y += l.height + 22f
        }

        // Alt bilgi
        tp.textAlign = Paint.Align.CENTER; tp.color = gold; tp.textSize = 28f; tp.letterSpacing = 0.3f
        tp.typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
        c.drawText(spec.footer.uppercase(), cx, H - 110f, tp)
        return bmp
    }

    fun share(context: Context, spec: Spec, message: String) {
        val bmp = render(spec)
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        val file = File(dir, "atomik_${System.currentTimeMillis()}.png")
        file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, message)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Sahneni paylaş").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun shareText(context: Context, text: String) {
        val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
        context.startActivity(Intent.createChooser(intent, "Paylaş").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
