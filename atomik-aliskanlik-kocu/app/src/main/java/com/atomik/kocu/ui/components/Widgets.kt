package com.atomik.kocu.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.atomik.kocu.ui.theme.Cine

val CardShape = RoundedCornerShape(24.dp)

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    accent: Color = Cine.Stroke,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(18.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val sc by animateFloatAsState(if (pressed) 0.98f else 1f, label = "press")
    Column(
        modifier
            .scale(sc)
            .clip(CardShape)
            .background(Brush.verticalGradient(listOf(Cine.SurfaceHi.copy(alpha = 0.92f), Cine.Surface.copy(alpha = 0.88f))))
            .border(BorderStroke(1.dp, Brush.linearGradient(listOf(accent.copy(alpha = if (accent == Cine.Stroke) 0.13f else 0.55f), Cine.Stroke))), CardShape)
            .then(if (onClick != null) Modifier.clickable(interaction, null) { onClick() } else Modifier)
            .padding(padding),
        content = content,
    )
}

@Composable
fun Kicker(text: String, color: Color = Cine.Gold, modifier: Modifier = Modifier) {
    Text(text.uppercase(com.atomik.kocu.data.Dates.TR), style = MaterialTheme.typography.labelSmall, color = color, modifier = modifier)
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, colors: List<Color> = listOf(Cine.Gold, Cine.Amber)) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val sc by animateFloatAsState(if (pressed) 0.96f else 1f, label = "btn")
    Box(
        modifier
            .scale(sc)
            .height(56.dp)
            .clip(RoundedCornerShape(50))
            .background(if (enabled) Brush.horizontalGradient(colors) else Brush.horizontalGradient(listOf(Cine.SurfaceHi, Cine.SurfaceHi)))
            .clickable(interaction, null, enabled = enabled) { onClick() }
            .padding(horizontal = 24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (enabled) Cine.Ink else Cine.Faint, fontWeight = FontWeight.Bold, fontSize = 16.sp, letterSpacing = 0.5.sp)
    }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Cine.Text) {
    Box(
        modifier
            .height(50.dp)
            .clip(RoundedCornerShape(50))
            .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(50))
            .clickable { onClick() }
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
}

@Composable
fun Pill(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Cine.Gold) {
    Box(
        modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) color.copy(alpha = 0.18f) else Cine.SurfaceHi.copy(alpha = 0.7f))
            .border(1.dp, if (selected) color else Cine.Stroke, RoundedCornerShape(50))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 9.dp),
    ) { Text(text, color = if (selected) color else Cine.Dim, fontSize = 13.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium) }
}

/** Büyük seçim kartı (onboarding ve hızlı seçimler için). */
@Composable
fun ChoiceCard(emoji: String, title: String, subtitle: String?, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color = Cine.Gold) {
    val sc by animateFloatAsState(if (selected) 1.02f else 1f, label = "cc")
    Row(
        modifier
            .scale(sc)
            .clip(RoundedCornerShape(20.dp))
            .background(if (selected) color.copy(alpha = 0.14f) else Cine.SurfaceHi.copy(alpha = 0.75f))
            .border(1.dp, if (selected) color else Cine.Stroke, RoundedCornerShape(20.dp))
            .clickable { onClick() }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 28.sp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = if (selected) color else Cine.Text)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
        }
        if (selected) Text("✦", color = color, fontSize = 18.sp)
    }
}

@Composable
fun StatTile(value: String, label: String, modifier: Modifier = Modifier, color: Color = Cine.Gold) {
    GlassCard(modifier, padding = PaddingValues(14.dp)) {
        Text(value, style = MaterialTheme.typography.headlineMedium, color = color, maxLines = 1)
        Text(label, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, maxLines = 2)
    }
}

@Composable
fun ProgressRing(progress: Float, modifier: Modifier = Modifier, size: Dp = 48.dp, color: Color = Cine.Gold, stroke: Dp = 4.dp, content: @Composable () -> Unit = {}) {
    val p by animateFloatAsState(progress.coerceIn(0f, 1f), tween(800), label = "ring")
    Box(modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val s = stroke.toPx()
            drawArc(Cine.Stroke, 0f, 360f, false, topLeft = Offset(s / 2, s / 2), size = Size(this.size.width - s, this.size.height - s), style = Stroke(s))
            drawArc(color, -90f, 360f * p, false, topLeft = Offset(s / 2, s / 2), size = Size(this.size.width - s, this.size.height - s), style = Stroke(s, cap = StrokeCap.Round))
        }
        content()
    }
}

@Composable
fun BarMeter(progress: Float, modifier: Modifier = Modifier, color: Color = Cine.Gold, height: Dp = 6.dp) {
    val p by animateFloatAsState(progress.coerceIn(0f, 1f), tween(800), label = "bar")
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(50)).background(Cine.Stroke)) {
        Box(Modifier.fillMaxWidth(p).height(height).clip(RoundedCornerShape(50)).background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.7f), color))))
    }
}

/** GitHub tarzı ısı haritası. values: en eskiden en yeniye, -1 = planlı değil. */
@Composable
fun Heatmap(values: List<Float>, modifier: Modifier = Modifier, color: Color = Cine.Gold, rows: Int = 7) {
    val cols = (values.size + rows - 1) / rows
    Canvas(modifier.fillMaxWidth().height((rows * 14).dp)) {
        val gap = 3.dp.toPx()
        val cell = minOf((size.width - gap * (cols - 1)) / cols, (size.height - gap * (rows - 1)) / rows)
        values.forEachIndexed { i, v ->
            val col = i / rows; val row = i % rows
            val c = when {
                v < 0f -> Cine.Stroke.copy(alpha = 0.06f)
                v == 0f -> Cine.Stroke
                else -> color.copy(alpha = 0.25f + 0.75f * v)
            }
            drawRoundRect(c, Offset(col * (cell + gap), row * (cell + gap)), Size(cell, cell), CornerRadius(3.dp.toPx()))
        }
    }
}

/** Basit çizgi grafiği. null değerler atlanır. */
@Composable
fun LineChart(values: List<Float?>, modifier: Modifier = Modifier, color: Color = Cine.Gold, min: Float? = null, max: Float? = null, height: Dp = 140.dp, fill: Boolean = true, overlay: List<Float?>? = null, overlayColor: Color = Cine.Teal) {
    val present = values.filterNotNull() + (overlay?.filterNotNull() ?: emptyList())
    if (present.isEmpty()) {
        Box(modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) { Text("Henüz veri yok", color = Cine.Faint) }
        return
    }
    val lo = min ?: present.min()
    val hi = (max ?: present.max()).let { if (it - lo < 0.001f) lo + 1f else it }
    Canvas(modifier.fillMaxWidth().height(height)) {
        fun pt(i: Int, v: Float, n: Int) = Offset(if (n <= 1) size.width / 2 else i * size.width / (n - 1), size.height - (v - lo) / (hi - lo) * size.height * 0.9f - size.height * 0.05f)
        for (g in 0..3) {
            val y = size.height * g / 3f
            drawLine(Cine.Stroke, Offset(0f, y), Offset(size.width, y), 1f)
        }
        fun drawSeries(series: List<Float?>, col: Color, withFill: Boolean) {
            val path = Path(); val area = Path()
            var started = false; var firstX = 0f; var lastX = 0f
            series.forEachIndexed { i, v ->
                if (v == null) return@forEachIndexed
                val p = pt(i, v, series.size)
                if (!started) { path.moveTo(p.x, p.y); area.moveTo(p.x, size.height); area.lineTo(p.x, p.y); started = true; firstX = p.x } else { path.lineTo(p.x, p.y); area.lineTo(p.x, p.y) }
                lastX = p.x
            }
            if (withFill && started) {
                area.lineTo(lastX, size.height); area.lineTo(firstX, size.height); area.close()
                drawPath(area, Brush.verticalGradient(listOf(col.copy(alpha = 0.35f), Color.Transparent)))
            }
            drawPath(path, col, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round))
            series.forEachIndexed { i, v -> if (v != null && series.count { it != null } < 40) drawCircle(col, 3.dp.toPx(), pt(i, v, series.size)) }
        }
        drawSeries(values, color, fill)
        overlay?.let { drawSeries(it, overlayColor, false) }
    }
}

@Composable
fun WeekBars(values: List<Float>, labels: List<String>, modifier: Modifier = Modifier, color: Color = Cine.Violet) {
    Row(modifier.fillMaxWidth().height(120.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
        values.forEachIndexed { i, v ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                val h by animateFloatAsState(v.coerceIn(0.02f, 1f), tween(900), label = "wb")
                Text("${(v * 100).toInt()}", fontSize = 10.sp, color = Cine.Faint)
                Box(Modifier.width(18.dp).height((80 * h).dp).clip(RoundedCornerShape(6.dp)).background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.3f)))))
                Spacer(Modifier.height(4.dp))
                Text(labels[i], fontSize = 11.sp, color = Cine.Dim)
            }
        }
    }
}

/** Alt ekranlar için sinematik üst bar + kaydırılabilir içerik. */
@Composable
fun SubScreen(
    title: String,
    kicker: String? = null,
    onBack: () -> Unit,
    accent: Color = Cine.Violet,
    scroll: Boolean = true,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    CinemaBackground(accent = accent) {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri", tint = Cine.Text) }
                Column(Modifier.weight(1f)) {
                    if (kicker != null) Kicker(kicker)
                    Text(title, style = MaterialTheme.typography.headlineSmall, color = Cine.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                actions()
            }
            Column(
                Modifier.fillMaxSize().then(if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                    .padding(horizontal = 18.dp).navigationBarsPadding(),
                content = content,
            )
        }
    }
}

@Composable
fun Field(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, singleLine: Boolean = true, placeholder: String? = null, minLines: Int = 1) {
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    OutlinedTextField(
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            imeAction = if (singleLine) androidx.compose.ui.text.input.ImeAction.Done else androidx.compose.ui.text.input.ImeAction.Default,
            capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { focus.clearFocus() }),
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it, color = Cine.Faint) } },
        singleLine = singleLine,
        minLines = minLines,
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Cine.Gold, unfocusedBorderColor = Cine.Stroke,
            focusedLabelColor = Cine.Gold, unfocusedLabelColor = Cine.Dim,
            cursorColor = Cine.Gold, focusedTextColor = Cine.Text, unfocusedTextColor = Cine.Text,
            focusedContainerColor = Cine.Surface.copy(alpha = 0.6f), unfocusedContainerColor = Cine.Surface.copy(alpha = 0.6f),
        ),
    )
}

@Composable
fun SectionTitle(kicker: String, title: String, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(top = 22.dp, bottom = 10.dp), verticalAlignment = Alignment.Bottom) {
        Column(Modifier.weight(1f)) {
            Kicker(kicker)
            Text(title, style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
        }
        trailing()
    }
}

@Composable
fun EmojiBadge(emoji: String, color: Color, modifier: Modifier = Modifier, size: Dp = 46.dp) {
    Box(modifier.size(size).clip(CircleShape).background(color.copy(alpha = 0.16f)).border(1.dp, color.copy(alpha = 0.4f), CircleShape), contentAlignment = Alignment.Center) {
        Text(emoji, fontSize = (size.value * 0.48f).sp)
    }
}

@Composable
fun Disclaimer(text: String = "Bu uygulama tıbbi bir cihaz değildir ve profesyonel tanı ya da tedavinin yerini tutmaz.") {
    Text(text, style = MaterialTheme.typography.bodySmall, color = Cine.Faint, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp))
}
