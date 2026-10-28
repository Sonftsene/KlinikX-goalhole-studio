package com.tarifpro.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.StarHalf
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.tarifpro.app.AppContainer
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Visibility
import com.tarifpro.app.export.FoodIllustrations
import java.io.File
import kotlin.math.abs

val LocalContainer = compositionLocalOf<AppContainer> { error("AppContainer sağlanmadı") }

@Composable
fun FoodIllustration(key: String, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        drawIntoCanvas { FoodIllustrations.draw(it.nativeCanvas, key, size.width, size.height) }
    }
}

/** Tarif görseli: hazır illüstrasyon, yerel fotoğraf, bulut fotoğrafı veya web görseli. */
@Composable
fun RecipeImage(model: String?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop, fallback: String = "dessert") {
    when {
        model.isNullOrBlank() -> FoodIllustration(fallback, modifier)
        model.startsWith("illu:") -> FoodIllustration(model.removePrefix("illu:"), modifier)
        model.startsWith("fsimg:") -> {
            val container = LocalContainer.current
            val file by produceState<File?>(null, model) { value = container.images.resolveCloud(model) }
            val f = file
            if (f == null) FoodIllustration(fallback, modifier)
            else AsyncImage(model = f, contentDescription = null, modifier = modifier, contentScale = contentScale)
        }
        else -> AsyncImage(model = model, contentDescription = null, modifier = modifier, contentScale = contentScale)
    }
}

private val avatarColors = listOf(
    Color(0xFFC2185B), Color(0xFF7B1FA2), Color(0xFF303F9F), Color(0xFF0288D1),
    Color(0xFF00796B), Color(0xFF689F38), Color(0xFFF57C00), Color(0xFF5D4037),
)

@Composable
fun Avatar(name: String, photo: String?, size: Dp = 40.dp, modifier: Modifier = Modifier) {
    val color = avatarColors[abs(name.hashCode()) % avatarColors.size]
    Box(
        modifier.size(size).clip(CircleShape).background(color),
        contentAlignment = Alignment.Center,
    ) {
        val initials = name.split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }
        Text(initials.ifBlank { "?" }, color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.38f).sp)
        if (!photo.isNullOrBlank()) {
            RecipeImage(photo, Modifier.fillMaxSize())
        }
    }
}

@Composable
fun RatingStars(rating: Double, modifier: Modifier = Modifier, size: Dp = 16.dp, color: Color = Color(0xFFFFB300)) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        for (i in 1..5) {
            val icon = when {
                rating >= i - 0.25 -> Icons.Filled.Star
                rating >= i - 0.75 -> Icons.Filled.StarHalf
                else -> Icons.Filled.StarBorder
            }
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(size))
        }
    }
}

@Composable
fun RatingInput(value: Int, onChange: (Int) -> Unit, modifier: Modifier = Modifier, size: Dp = 36.dp) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (i in 1..5) {
            val tint by animateColorAsState(if (i <= value) Color(0xFFFFB300) else MaterialTheme.colorScheme.outline, label = "star")
            IconButton(onClick = { onChange(i) }, modifier = Modifier.size(size + 8.dp)) {
                Icon(if (i <= value) Icons.Filled.Star else Icons.Filled.StarBorder, contentDescription = "$i yıldız", tint = tint, modifier = Modifier.size(size))
            }
        }
    }
}

fun visibilityIcon(v: Visibility): ImageVector = when (v) {
    Visibility.PUBLIC -> Icons.Filled.Public
    Visibility.FOLLOWERS -> Icons.Filled.Group
    Visibility.PRIVATE -> Icons.Filled.Lock
}

@Composable
fun MetaPill(icon: ImageVector?, text: String, modifier: Modifier = Modifier, container: Color = MaterialTheme.colorScheme.surfaceContainerHigh, content: Color = MaterialTheme.colorScheme.onSurface) {
    Surface(color = container, shape = RoundedCornerShape(50), modifier = modifier) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(icon, null, Modifier.size(14.dp), tint = content)
                Spacer(Modifier.width(4.dp))
            }
            Text(text, style = MaterialTheme.typography.labelMedium, color = content, maxLines = 1)
        }
    }
}

/** Izgara/yatay listelerde kullanılan şık tarif kartı. */
@Composable
fun RecipeCard(
    recipe: Recipe,
    kcal: Int?,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onFavorite: () -> Unit,
    modifier: Modifier = Modifier,
    showAuthor: Boolean = true,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Box {
            RecipeImage(recipe.image, Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)))
            Surface(
                shape = CircleShape,
                color = Color.Black.copy(alpha = 0.35f),
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).size(36.dp).clickable(onClick = onFavorite),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = if (isFavorite) "Favorilerden çıkar" else "Favorilere ekle",
                        tint = if (isFavorite) Color(0xFFFF4D6D) else Color.White,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            if (recipe.visibility != Visibility.PUBLIC || recipe.hidden) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = if (recipe.hidden) MaterialTheme.colorScheme.error else Color.Black.copy(alpha = 0.45f),
                    modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                ) {
                    Row(Modifier.padding(horizontal = 8.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(visibilityIcon(recipe.visibility), null, tint = Color.White, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(3.dp))
                        Text(if (recipe.hidden) "Gizlendi" else recipe.visibility.label, color = Color.White, fontSize = 10.sp)
                    }
                }
            }
        }
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Text(recipe.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (showAuthor) {
                Text(recipe.authorName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                RatingStars(recipe.ratingAvg, size = 13.dp)
                Spacer(Modifier.width(4.dp))
                Text(if (recipe.ratingCount > 0) String.format("%.1f", recipe.ratingAvg) else "Yeni", style = MaterialTheme.typography.labelSmall)
            }
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Schedule, null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(" " + QuantityFormat.minutes(recipe.totalMinutes), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (kcal != null && kcal > 0) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Filled.LocalFireDepartment, null, Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(" $kcal kcal", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.width(8.dp))
                Text(Difficulty.label(recipe.difficulty), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) TextButton(onClick = onAction) { Text(action) }
    }
}

@Composable
fun EmptyState(emoji: String, title: String, text: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(emoji, fontSize = 56.sp)
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onAction) { Text(actionLabel) }
        }
    }
}

fun formatClock(ms: Long): String {
    val total = (ms + 999) / 1000
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, s) else String.format("%02d:%02d", m, s)
}

fun relativeTime(ts: Long): String {
    val diff = System.currentTimeMillis() - ts
    val min = diff / 60_000
    return when {
        min < 1 -> "şimdi"
        min < 60 -> "$min dk önce"
        min < 60 * 24 -> "${min / 60} sa önce"
        min < 60 * 24 * 7 -> "${min / (60 * 24)} gün önce"
        else -> java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.forLanguageTag("tr-TR")).format(java.util.Date(ts))
    }
}
