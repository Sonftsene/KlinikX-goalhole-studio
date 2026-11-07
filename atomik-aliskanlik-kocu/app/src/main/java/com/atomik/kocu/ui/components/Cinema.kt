package com.atomik.kocu.ui.components

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.atomik.kocu.data.Store
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private class Star(val x: Float, val y: Float, val r: Float, val phase: Float, val speed: Float)

@Composable
fun Starfield(modifier: Modifier = Modifier, count: Int = 70, color: Color = Cine.Text, drift: Float = 1f) {
    val stars = remember { List(count) { Star(Random.nextFloat(), Random.nextFloat(), Random.nextFloat() * 1.5f + 0.4f, Random.nextFloat() * 6.28f, Random.nextFloat() * 0.6f + 0.2f) } }
    val t = rememberInfiniteTransition(label = "stars").animateFloat(0f, 1f, infiniteRepeatable(tween(90_000, easing = LinearEasing)), label = "t")
    Canvas(modifier.fillMaxSize()) {
        val tv = t.value
        stars.forEach { s ->
            val y = ((s.y - tv * s.speed * drift) % 1f + 1f) % 1f
            val tw = 0.5f + 0.5f * sin(tv * 2 * PI.toFloat() * 40 * s.speed + s.phase)
            drawCircle(color.copy(alpha = 0.12f + 0.4f * tw), s.r.dp.toPx(), Offset(s.x * size.width, y * size.height))
        }
    }
}

@Composable
fun FilmGrain(modifier: Modifier = Modifier, alpha: Float = 0.05f) {
    val t = rememberInfiniteTransition(label = "grain").animateFloat(0f, 1f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "g")
    Canvas(modifier.fillMaxSize()) {
        val rnd = Random((t.value * 12).toInt())
        repeat(220) {
            drawCircle(Color.White.copy(alpha = alpha * rnd.nextFloat()), 1.1f.dp.toPx(), Offset(rnd.nextFloat() * size.width, rnd.nextFloat() * size.height))
        }
    }
}

@Composable
fun CinemaBackground(modifier: Modifier = Modifier, accent: Color = Cine.Violet, stars: Boolean = true, content: @Composable BoxScope.() -> Unit) {
    val grain = Store.data.value.settings.filmGrain
    Box(modifier.fillMaxSize().background(Cine.Ink)) {
        Box(
            Modifier.fillMaxSize().background(
                Brush.radialGradient(listOf(accent.copy(alpha = 0.16f), Color.Transparent), center = Offset(200f, 0f), radius = 1400f),
            ),
        )
        if (stars) Starfield()
        content()
        if (grain) FilmGrain()
    }
}

/** Sinema perdesi: üst ve alt siyah bantlar. */
@Composable
fun Letterbox(visible: Boolean, modifier: Modifier = Modifier, height: Dp = 64.dp) {
    val h by animateFloatAsState(if (visible) 1f else 0f, tween(900, easing = FastOutSlowInEasing), label = "lb")
    Box(modifier.fillMaxSize()) {
        Box(Modifier.fillMaxWidth().height(height * h).background(Color.Black).align(Alignment.TopCenter))
        Box(Modifier.fillMaxWidth().height(height * h).background(Color.Black).align(Alignment.BottomCenter))
    }
}

@Composable
fun Typewriter(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodyLarge,
    color: Color = Cine.Text,
    charDelay: Long = 32,
    startDelay: Long = 0,
    textAlign: TextAlign? = null,
    onDone: () -> Unit = {},
) {
    var shown by remember(text) { mutableIntStateOf(0) }
    val done by rememberUpdatedState(onDone)
    LaunchedEffect(text) {
        delay(startDelay)
        while (shown < text.length) {
            delay(if (text[shown] in ".,…!?") charDelay * 6 else charDelay)
            shown++
        }
        done()
    }
    val annotated = buildAnnotatedString {
        append(text.take(shown))
        withStyle(SpanStyle(color = Color.Transparent)) { append(text.drop(shown)) }
    }
    Text(annotated, modifier = modifier, style = style, color = color, textAlign = textAlign)
}

private const val GLYPHS = "█▓▒░#%&@§¤∆◊ΞΨΩ?!"

/** Kilitli içerikler için şifreli, titreşen metin. */
@Composable
fun ScrambleText(
    text: String,
    revealed: Boolean,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.titleMedium,
    color: Color = Cine.Text,
    textAlign: TextAlign? = null,
) {
    var tick by remember { mutableLongStateOf(0L) }
    var revealProgress by remember(text) { mutableIntStateOf(if (revealed) text.length else 0) }
    LaunchedEffect(revealed, text) {
        if (revealed) {
            while (revealProgress < text.length) { delay(28); revealProgress++; tick++ }
        } else {
            while (true) { delay(110); tick++ }
        }
    }
    val rnd = Random(tick)
    val out = buildString {
        text.forEachIndexed { i, ch ->
            when {
                ch == ' ' -> append(' ')
                revealed && i < revealProgress -> append(ch)
                else -> append(GLYPHS[rnd.nextInt(GLYPHS.length)])
            }
        }
    }
    Text(out, modifier = modifier, style = style, color = color, textAlign = textAlign, maxLines = 2)
}

data class Electron(val color: Color, val lit: Boolean)

/**
 * Kimlik çekirdeği: Merkez = kimlik, yörüngedeki elektronlar = bugünün alışkanlıkları.
 * Tamamlanan alışkanlıklar parlar; ilerleme arttıkça çekirdek ısınır.
 */
@Composable
fun AtomCore(
    progress: Float,
    electrons: List<Electron>,
    modifier: Modifier = Modifier,
    size: Dp = 260.dp,
    content: @Composable BoxScope.() -> Unit = {},
) {
    val inf = rememberInfiniteTransition(label = "atom")
    val spin = inf.animateFloat(0f, 360f, infiniteRepeatable(tween(16_000, easing = LinearEasing)), label = "spin")
    val pulse = inf.animateFloat(0.92f, 1.06f, infiniteRepeatable(tween(2200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse")
    val prog by animateFloatAsState(progress.coerceIn(0f, 1f), tween(1200, easing = FastOutSlowInEasing), label = "prog")
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val c = center
            val rx = this.size.minDimension * 0.46f
            val ry = rx * 0.36f
            val orbitCount = maxOf(3, minOf(electrons.size, 6))
            val glowColor = lerpColor(Cine.Violet, Cine.Gold, prog)
            drawCircle(
                Brush.radialGradient(listOf(glowColor.copy(alpha = 0.35f + 0.35f * prog), Color.Transparent), c, rx * 0.95f * pulse.value),
                rx * 0.95f * pulse.value, c,
            )
            for (i in 0 until orbitCount) {
                val angle = i * 180f / orbitCount
                rotate(angle + spin.value * 0.08f, c) {
                    drawOval(
                        Cine.Text.copy(alpha = 0.10f),
                        topLeft = Offset(c.x - rx, c.y - ry), size = Size(rx * 2, ry * 2),
                        style = Stroke(1.2.dp.toPx()),
                    )
                }
            }
            electrons.forEachIndexed { i, e ->
                val orbit = i % orbitCount
                val angle = orbit * 180f / orbitCount + spin.value * 0.08f
                val speed = 1f + (i % 3) * 0.35f
                val theta = Math.toRadians((spin.value * speed + i * 137.5f).toDouble())
                val px = rx * cos(theta).toFloat()
                val py = ry * sin(theta).toFloat()
                val rad = Math.toRadians(angle.toDouble())
                val x = c.x + px * cos(rad).toFloat() - py * sin(rad).toFloat()
                val y = c.y + px * sin(rad).toFloat() + py * cos(rad).toFloat()
                if (e.lit) {
                    drawCircle(Brush.radialGradient(listOf(e.color.copy(alpha = 0.7f), Color.Transparent), Offset(x, y), 16.dp.toPx()), 16.dp.toPx(), Offset(x, y))
                    drawCircle(e.color, 5.dp.toPx(), Offset(x, y))
                } else {
                    drawCircle(e.color.copy(alpha = 0.35f), 4.dp.toPx(), Offset(x, y), style = Stroke(1.5.dp.toPx()))
                }
            }
            val nucleus = rx * 0.30f * pulse.value
            drawCircle(
                Brush.radialGradient(
                    listOf(Color(0xFFFFF4DF), glowColor, glowColor.copy(alpha = 0f)),
                    c, nucleus * 1.6f,
                ),
                nucleus * 1.6f, c,
            )
            drawArc(
                Cine.Gold, -90f, 360f * prog, false,
                topLeft = Offset(c.x - nucleus * 1.9f, c.y - nucleus * 1.9f), size = Size(nucleus * 3.8f, nucleus * 3.8f),
                style = Stroke(3.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round),
            )
        }
        content()
    }
}

fun lerpColor(a: Color, b: Color, t: Float) = Color(
    red = a.red + (b.red - a.red) * t,
    green = a.green + (b.green - a.green) * t,
    blue = a.blue + (b.blue - a.blue) * t,
    alpha = a.alpha + (b.alpha - a.alpha) * t,
)

/** Tamamlama anında patlayan parçacıklar. [trigger] her değiştiğinde oynar. */
@Composable
fun ParticleBurst(trigger: Int, color: Color, modifier: Modifier = Modifier) {
    val anim = remember { Animatable(1f) }
    val seeds = remember(trigger) { List(36) { Random.nextFloat() * 6.28f to (Random.nextFloat() * 0.6f + 0.4f) } }
    LaunchedEffect(trigger) {
        if (trigger > 0) { anim.snapTo(0f); anim.animateTo(1f, tween(1100, easing = FastOutSlowInEasing)) }
    }
    if (anim.value < 1f) {
        Canvas(modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height * 0.30f)
            val p = anim.value
            seeds.forEachIndexed { i, (a, sp) ->
                val dist = size.minDimension * 0.55f * sp * p
                val pos = Offset(c.x + cos(a) * dist, c.y + sin(a) * dist + 120f * p * p)
                val col = if (i % 3 == 0) Cine.Gold else color
                drawCircle(col.copy(alpha = (1f - p)), (4f * (1f - p) + 1.5f).dp.toPx(), pos)
            }
        }
    }
}

@Composable
fun rememberHaptic(): () -> Unit {
    val view = LocalView.current
    return remember(view) {
        {
            if (Store.data.value.settings.haptics) {
                view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
            }
        }
    }
}
