package com.tarifpro.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.tarifpro.app.data.ThemeMode
import com.tarifpro.app.export.RecipeTemplate

val Raspberry = Color(0xFFA3123A)

private val LightColors = lightColorScheme(
    primary = Color(0xFFA3123A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFD9DF),
    onPrimaryContainer = Color(0xFF3F0014),
    secondary = Color(0xFF9C4146),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFDAD8),
    onSecondaryContainer = Color(0xFF40000A),
    tertiary = Color(0xFF2E6B30),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFB4F1AE),
    onTertiaryContainer = Color(0xFF002204),
    background = Color(0xFFFFF8F6),
    onBackground = Color(0xFF22191B),
    surface = Color(0xFFFFF8F6),
    onSurface = Color(0xFF22191B),
    surfaceVariant = Color(0xFFF4DDE0),
    onSurfaceVariant = Color(0xFF524346),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFFF0F1),
    surfaceContainer = Color(0xFFFBEAEC),
    surfaceContainerHigh = Color(0xFFF5E4E6),
    surfaceContainerHighest = Color(0xFFEFDEE0),
    outline = Color(0xFF857376),
    outlineVariant = Color(0xFFD7C1C4),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB1C1),
    onPrimary = Color(0xFF65002A),
    primaryContainer = Color(0xFF8A0F33),
    onPrimaryContainer = Color(0xFFFFD9DF),
    secondary = Color(0xFFFFB3B0),
    onSecondary = Color(0xFF5F131B),
    secondaryContainer = Color(0xFF7E2A30),
    onSecondaryContainer = Color(0xFFFFDAD8),
    tertiary = Color(0xFF99D594),
    onTertiary = Color(0xFF003909),
    tertiaryContainer = Color(0xFF14521B),
    onTertiaryContainer = Color(0xFFB4F1AE),
    background = Color(0xFF191113),
    onBackground = Color(0xFFEFDFE1),
    surface = Color(0xFF191113),
    onSurface = Color(0xFFEFDFE1),
    surfaceVariant = Color(0xFF524346),
    onSurfaceVariant = Color(0xFFD7C1C4),
    surfaceContainerLowest = Color(0xFF140C0E),
    surfaceContainerLow = Color(0xFF22191B),
    surfaceContainer = Color(0xFF261D1F),
    surfaceContainerHigh = Color(0xFF312829),
    surfaceContainerHighest = Color(0xFF3C3234),
    outline = Color(0xFFA08C8F),
    outlineVariant = Color(0xFF524346),
)

private val base = Typography()

val AppTypography = Typography(
    displaySmall = base.displaySmall.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
    headlineLarge = base.headlineLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
    headlineMedium = base.headlineMedium.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
    headlineSmall = base.headlineSmall.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.SemiBold),
)

val HandwrittenStyle = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 18.sp)

@Composable
fun isDark(mode: ThemeMode): Boolean = when (mode) {
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
}

@Composable
fun TarifProTheme(mode: ThemeMode, dynamicColor: Boolean, content: @Composable () -> Unit) {
    val dark = isDark(mode)
    val context = LocalContext.current
    val scheme: ColorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= 31 -> if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = scheme, typography = AppTypography, content = content)
}

/** Şablon renklerini mevcut tema (açık/koyu) ile uyumlu Compose renklerine çevirir. */
data class TemplateColors(val primary: Color, val onPrimary: Color, val secondary: Color, val surface: Color, val ink: Color, val muted: Color, val groups: List<Pair<Color, Color>>)

@Composable
fun RecipeTemplate.colors(): TemplateColors {
    val darkTheme = MaterialTheme.colorScheme.background.luminance() < 0.3f
    return if (!darkTheme) {
        TemplateColors(
            Color(primary), Color(onPrimary), Color(secondary), Color(card), Color(ink), Color(muted),
            groupColors.map { Color(it.first) to Color(it.second) },
        )
    } else {
        val p = Color(primary)
        TemplateColors(
            primary = if (p.luminance() < 0.25f) lighten(p, 0.45f) else p,
            onPrimary = Color.White,
            secondary = Color(secondary),
            surface = MaterialTheme.colorScheme.surfaceContainerHigh,
            ink = MaterialTheme.colorScheme.onSurface,
            muted = MaterialTheme.colorScheme.onSurfaceVariant,
            groups = groupColors.map { Color(it.second).copy(alpha = 0.22f) to lighten(Color(it.second), 0.4f) },
        )
    }
}

fun lighten(c: Color, f: Float): Color = Color(
    red = c.red + (1 - c.red) * f,
    green = c.green + (1 - c.green) * f,
    blue = c.blue + (1 - c.blue) * f,
    alpha = c.alpha,
)
