package com.atomik.kocu.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object Cine {
    val Ink = Color(0xFF06060B)
    val Surface = Color(0xFF0F0E18)
    val SurfaceHi = Color(0xFF191728)
    val Stroke = Color(0x22FFFFFF)
    val Text = Color(0xFFF3EFE6)
    val Dim = Color(0xFFA8A3B8)
    val Faint = Color(0xFF6E6981)
    val Gold = Color(0xFFE8B76A)
    val Amber = Color(0xFFFFA94D)
    val Ember = Color(0xFFFF6B4A)
    val Violet = Color(0xFF8B6CFF)
    val Teal = Color(0xFF3DDBD9)
    val Rose = Color(0xFFFF5C8A)
    val Lime = Color(0xFF9BE15D)
    val Sky = Color(0xFF5AA9FF)
    val habitColors = listOf(Gold, Violet, Teal, Ember, Rose, Lime, Sky, Color(0xFFFFD166))
    fun habit(i: Int) = habitColors[((i % habitColors.size) + habitColors.size) % habitColors.size]

    val Serif = FontFamily.Serif
}

private val scheme = darkColorScheme(
    primary = Cine.Gold,
    onPrimary = Cine.Ink,
    secondary = Cine.Violet,
    onSecondary = Cine.Text,
    tertiary = Cine.Teal,
    background = Cine.Ink,
    onBackground = Cine.Text,
    surface = Cine.Surface,
    onSurface = Cine.Text,
    surfaceVariant = Cine.SurfaceHi,
    onSurfaceVariant = Cine.Dim,
    surfaceContainer = Cine.Surface,
    surfaceContainerHigh = Cine.SurfaceHi,
    surfaceContainerLow = Cine.Surface,
    outline = Cine.Stroke,
    error = Cine.Ember,
)

private val type = Typography(
    displayLarge = TextStyle(fontFamily = Cine.Serif, fontWeight = FontWeight.Bold, fontSize = 44.sp, lineHeight = 50.sp),
    displayMedium = TextStyle(fontFamily = Cine.Serif, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp),
    headlineLarge = TextStyle(fontFamily = Cine.Serif, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 34.sp),
    headlineMedium = TextStyle(fontFamily = Cine.Serif, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
    headlineSmall = TextStyle(fontFamily = Cine.Serif, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 24.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 22.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 14.sp, letterSpacing = 0.5.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 2.5.sp),
)

@Composable
fun AtomikTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = type, content = content)
}
