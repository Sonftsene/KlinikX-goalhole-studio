package com.tarifpro.app.ui.screens

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddShoppingCart
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.data.local.CommentEntity
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.DurationDetector
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Scaler
import com.tarifpro.app.domain.TimerSuggestion
import com.tarifpro.app.export.FoodIllustrations
import com.tarifpro.app.export.RecipeCardRenderer
import com.tarifpro.app.export.RecipeTemplate
import com.tarifpro.app.ui.components.Avatar
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.MetaPill
import com.tarifpro.app.ui.components.RatingInput
import com.tarifpro.app.ui.components.RatingStars
import com.tarifpro.app.ui.components.RecipeImage
import com.tarifpro.app.ui.components.formatClock
import com.tarifpro.app.ui.components.relativeTime
import com.tarifpro.app.ui.components.visibilityIcon
import com.tarifpro.app.ui.theme.colors
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// ======================= 1) KART & BESİN =======================

@OptIn(ExperimentalLayoutApi::class, androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun CardTab(nav: NavController, recipe: Recipe, servings: Int, template: RecipeTemplate, onGoTo: (Int) -> Unit) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val tc = template.colors()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val following by container.social.followingIds.collectAsStateWithLifecycle()
    val author by remember(recipe.authorId) { container.social.user(recipe.authorId) }.collectAsStateWithLifecycle(initialValue = null)
    val scaled = remember(recipe, servings) { recipe.copy(ingredients = Scaler.scaleAll(recipe.ingredients, Scaler.factor(recipe.servings, servings)), servings = servings) }
    val report = remember(scaled) { NutritionCalculator.analyze(scaled) }
    var perServing by remember { mutableStateOf(true) }
    var showDetails by remember { mutableStateOf(false) }

    LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
        item {
            Box(Modifier.fillMaxWidth().height(280.dp)) {
                RecipeImage(recipe.image, Modifier.fillMaxSize(), fallback = FoodIllustrations.forCategory(recipe.category))
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, MaterialTheme.colorScheme.background), startY = 500f)))
                Surface(
                    color = tc.primary.copy(alpha = 0.95f), shape = RoundedCornerShape(18.dp),
                    modifier = Modifier.align(Alignment.TopStart).padding(14.dp).fillMaxWidth(0.66f),
                    shadowElevation = 6.dp,
                ) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text(recipe.title, color = tc.onPrimary, fontFamily = if (template.serifTitles) FontFamily.Serif else FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 28.sp)
                        Text("$servings kişilik • ${recipe.category}", color = tc.onPrimary.copy(alpha = 0.9f), fontFamily = FontFamily.Serif, fontSize = 14.sp)
                    }
                }
                val tagline = recipe.tagline.ifBlank { template.tagline }
                Surface(
                    color = Color(0xFFFFFDF7), shape = RoundedCornerShape(6.dp), shadowElevation = 4.dp,
                    modifier = Modifier.align(Alignment.TopEnd).padding(top = 18.dp, end = 12.dp).width(120.dp).rotate(-4f),
                ) {
                    Text(
                        "$tagline ♡", color = Color(template.primary), fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic,
                        fontWeight = FontWeight.Bold, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(8.dp), maxLines = 4,
                    )
                }
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(recipe.authorName, author?.photo ?: recipe.authorPhoto, 44.dp, Modifier.clickable { nav.navigate("user/${recipe.authorId}") })
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f).clickable { nav.navigate("user/${recipe.authorId}") }) {
                    Text(recipe.authorName, style = MaterialTheme.typography.titleMedium)
                    Text(relativeTime(recipe.createdAt) + " • " + recipe.cuisine + " mutfağı", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (recipe.authorId != session?.uid) {
                    val isFollowing = recipe.authorId in following
                    if (isFollowing) OutlinedButton(onClick = { scope.launch { container.social.toggleFollow(recipe.authorId) } }) { Text("Takiptesin") }
                    else Button(onClick = { scope.launch { container.social.toggleFollow(recipe.authorId) } }) { Text("Takip et") }
                } else {
                    MetaPill(visibilityIcon(recipe.visibility), recipe.visibility.label)
                }
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp).clickable { onGoTo(3) }, verticalAlignment = Alignment.CenterVertically) {
                RatingStars(recipe.ratingAvg, size = 20.dp)
                Spacer(Modifier.width(6.dp))
                Text(if (recipe.ratingCount > 0) "${String.format("%.1f", recipe.ratingAvg)} (${recipe.ratingCount} puan)" else "Henüz puan yok – ilk puanı sen ver!", style = MaterialTheme.typography.bodyMedium)
            }
        }
        item {
            FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (recipe.prepMinutes > 0) MetaPill(null, "⏱ Hazırlık ${QuantityFormat.minutes(recipe.prepMinutes)}")
                if (recipe.cookMinutes > 0) MetaPill(null, "🔥 Pişirme ${QuantityFormat.minutes(recipe.cookMinutes)}")
                if (recipe.restMinutes > 0) MetaPill(null, "❄️ Dinlenme ${QuantityFormat.minutes(recipe.restMinutes)}")
                MetaPill(null, "⌛ Toplam ${QuantityFormat.minutes(recipe.totalMinutes)}")
                MetaPill(null, "📊 ${Difficulty.label(recipe.difficulty)}")
                MetaPill(null, "🍽️ ${recipe.ingredients.size} malzeme • ${recipe.steps.size} adım")
            }
        }
        if (recipe.description.isNotBlank()) {
            item { Text(recipe.description, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = 16.dp)) }
        }
        if (recipe.tags.isNotEmpty()) {
            item {
                FlowRow(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    recipe.tags.forEach { AssistChip(onClick = {}, label = { Text("#$it") }) }
                }
            }
        }
        item {
            Card(
                Modifier.fillMaxWidth().padding(16.dp),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = tc.surface),
                border = androidx.compose.foundation.BorderStroke(2.dp, tc.secondary.copy(alpha = 0.6f)),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Besin Değerleri", style = MaterialTheme.typography.titleLarge, color = tc.primary)
                            Text(if (perServing) "1 porsiyon ($servings kişilik tarif)" else "Tüm tarif ($servings porsiyon)", style = MaterialTheme.typography.bodySmall, color = tc.muted)
                        }
                        SingleChoiceSegmentedButtonRow {
                            SegmentedButton(selected = perServing, onClick = { perServing = true }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Porsiyon") }
                            SegmentedButton(selected = !perServing, onClick = { perServing = false }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Toplam") }
                        }
                    }
                    val facts = if (perServing) report.perServing else report.total
                    val (pp, cp, fp) = report.macroSplit()
                    Row(Modifier.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        MacroDonut(pp, cp, fp, Modifier.size(120.dp)) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("${facts.kcal.roundToInt()}", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = tc.primary)
                                Text("kcal", style = MaterialTheme.typography.labelMedium, color = tc.muted)
                            }
                        }
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            MacroLegend("Protein", facts.protein, pp, Color(0xFF1E88E5))
                            MacroLegend("Karbonhidrat", facts.carbs, cp, Color(0xFFFFB300))
                            MacroLegend("Yağ", facts.fat, fp, Color(0xFFE53935))
                        }
                    }
                    NutrientBar("Lif", facts.fiber, if (perServing) 28.0 else 28.0 * servings, Color(0xFF43A047))
                    NutrientBar("Şeker", facts.sugar, if (perServing) 50.0 else 50.0 * servings, Color(0xFF8E24AA))
                    Spacer(Modifier.height(10.dp))
                    val tags = NutritionCalculator.healthTags(report)
                    if (tags.isNotEmpty()) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            tags.forEach { t ->
                                MetaPill(
                                    null, (if (t.positive) "✓ " else "⚠ ") + t.label,
                                    container = if (t.positive) Color(0xFF2E7D32).copy(alpha = 0.14f) else Color(0xFFC62828).copy(alpha = 0.12f),
                                    content = if (t.positive) Color(0xFF2E7D32) else Color(0xFFC62828),
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = { showDetails = !showDetails }) {
                        Text(if (showDetails) "Malzeme bazlı analizi gizle" else "Malzeme bazlı analizi göster (%${(report.coverage * 100).roundToInt()} kapsama)")
                    }
                    AnimatedVisibility(showDetails) {
                        Column {
                            report.items.forEach { item ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                    Text(NutritionCalculator.emojiFor(item.ingredient) + " " + item.ingredient.name, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(item.grams?.let { "${it.roundToInt()} g" } ?: "?", Modifier.width(64.dp), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.End)
                                    Text(if (item.food != null && item.grams != null) "${item.facts.kcal.roundToInt()} kcal" else "eşleşmedi", Modifier.width(80.dp), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.End, color = if (item.food == null) MaterialTheme.colorScheme.error else tc.muted)
                                }
                            }
                            Text(
                                "Değerler 100 g başına standart besin tablolarından tahmin edilir. Eşleşmeyen malzemeler için düzenleyicide gram değeri girebilirsiniz.",
                                style = MaterialTheme.typography.labelSmall, color = tc.muted, modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                    }
                }
            }
        }
        item {
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilledTonalButton(onClick = { nav.navigate("designer/${recipe.id}?servings=$servings") }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Image, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Kart tasarla")
                }
                Button(onClick = { onGoTo(2) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Restaurant, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Pişirmeye başla")
                }
            }
        }
        recipe.sourceUrl?.let { src ->
            item { Text("Kaynak: $src", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
        }
    }
}

@Composable
private fun MacroDonut(protein: Int, carbs: Int, fat: Int, modifier: Modifier, center: @Composable () -> Unit) {
    val track = MaterialTheme.colorScheme.surfaceVariant
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 16.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(track, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
            var start = -90f
            listOf(protein to Color(0xFF1E88E5), carbs to Color(0xFFFFB300), fat to Color(0xFFE53935)).forEach { (pct, color) ->
                val sweep = pct * 3.6f
                if (sweep > 0) drawArc(color, start, sweep - 1.5f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                start += sweep
            }
        }
        center()
    }
}

@Composable
private fun MacroLegend(label: String, grams: Double, pct: Int, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(8.dp))
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("${QuantityFormat.decimal(grams)} g", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        Text("  %$pct", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NutrientBar(label: String, value: Double, reference: Double, color: Color) {
    Column(Modifier.padding(vertical = 4.dp)) {
        Row {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text("${QuantityFormat.decimal(value)} g", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        }
        LinearProgressIndicator(
            progress = { (value / reference).toFloat().coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
            color = color, trackColor = color.copy(alpha = 0.18f),
        )
    }
}

// ======================= 2) MALZEMELER =======================

@Composable
fun IngredientsTab(recipe: Recipe, servings: Int, template: RecipeTemplate, onServings: (Int) -> Unit) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val tc = template.colors()
    val progress by remember(recipe.id) { container.recipes.progress(recipe.id) }.collectAsStateWithLifecycle(initialValue = null)
    val checked = progress?.checkedIngredients?.split(',')?.mapNotNull { it.toIntOrNull() }?.toSet() ?: emptySet()
    val factor = Scaler.factor(recipe.servings, servings)
    val indexed = recipe.ingredients.withIndex().toList()
    val groups = indexed.groupBy { it.value.group.trim() }.toList()

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column {
                Text("Malzeme Listesi", style = MaterialTheme.typography.headlineSmall, color = tc.primary)
                Text(
                    "Orijinal tarif ${recipe.servings} kişilik. Seçtiğiniz $servings kişiye göre tüm miktarlar otomatik hesaplandı.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                androidx.compose.material3.Slider(
                    value = servings.toFloat(), onValueChange = { onServings(it.roundToInt()) },
                    valueRange = Scaler.MIN_SERVINGS.toFloat()..Scaler.MAX_SERVINGS.toFloat(), steps = Scaler.MAX_SERVINGS - Scaler.MIN_SERVINGS - 1,
                )
                Row {
                    Text("${Scaler.MIN_SERVINGS} kişi", style = MaterialTheme.typography.labelSmall)
                    Spacer(Modifier.weight(1f))
                    Text("${Scaler.MAX_SERVINGS} kişi", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        groups.forEachIndexed { gi, (groupName, items) ->
            item(key = "g$gi") {
                val (tint, accent) = tc.groups[gi % tc.groups.size]
                Surface(color = tint, shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            NumberBadge(gi + 1, accent)
                            Spacer(Modifier.width(10.dp))
                            Text(groupName.ifBlank { "Malzemeler" }, style = MaterialTheme.typography.titleMedium, color = accent, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(6.dp))
                        items.forEach { (idx, ing) ->
                            val isChecked = idx in checked
                            val scaled = Scaler.scale(ing, factor)
                            val food = remember(ing.name) { com.tarifpro.app.domain.NutritionDb.match(ing.name) }
                            val grams = NutritionCalculator.gramsOf(scaled, food)
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                    .clickable { scope.launch { container.recipes.toggleIngredient(recipe.id, idx, progress) } }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(checked = isChecked, onCheckedChange = { scope.launch { container.recipes.toggleIngredient(recipe.id, idx, progress) } })
                                Text(NutritionCalculator.emojiFor(ing), fontSize = 22.sp)
                                Spacer(Modifier.width(8.dp))
                                Column(Modifier.weight(1f)) {
                                    val amount = listOf(QuantityFormat.ingredientAmount(scaled), scaled.unit).filter { it.isNotBlank() }.joinToString(" ")
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        if (amount.isNotBlank()) Text("$amount ", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge, textDecoration = if (isChecked) TextDecoration.LineThrough else null)
                                        Text(ing.name, style = MaterialTheme.typography.bodyLarge, textDecoration = if (isChecked) TextDecoration.LineThrough else null)
                                    }
                                    if (ing.note.isNotBlank()) Text(ing.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                if (grams != null && scaled.unit != "g") Text("≈${grams.roundToInt()} g", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilledTonalButton(onClick = {
                    scope.launch {
                        val missing = recipe.ingredients.indices.filter { it !in checked }.toSet()
                        val n = container.recipes.addToShopping(recipe, servings, missing)
                        Toast.makeText(context, "Eksik $n malzeme alışveriş listesine eklendi 🛒", Toast.LENGTH_SHORT).show()
                    }
                }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.AddShoppingCart, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Eksikleri listeye ekle")
                }
                OutlinedButton(onClick = { scope.launch { container.recipes.resetProgress(recipe.id) } }) { Text("Sıfırla") }
            }
        }
    }
}

// ======================= 3) ADIM ADIM YAPILIŞ =======================

@Composable
fun StepsTab(recipe: Recipe, template: RecipeTemplate, onRate: () -> Unit) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val tc = template.colors()
    val settings by container.settings.state.collectAsStateWithLifecycle()
    val progress by remember(recipe.id) { container.recipes.progress(recipe.id) }.collectAsStateWithLifecycle(initialValue = null)
    val timers by container.timers.timers.collectAsStateWithLifecycle()
    val now by container.timers.tick.collectAsStateWithLifecycle()
    val sw by container.timers.stopwatch.collectAsStateWithLifecycle()
    val done = progress?.doneSteps?.split(',')?.mapNotNull { it.toIntOrNull() }?.toSet() ?: emptySet()
    val view = LocalView.current
    DisposableEffect(settings.keepScreenOn) {
        view.keepScreenOn = settings.keepScreenOn
        onDispose { view.keepScreenOn = false }
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            val total = recipe.steps.size.coerceAtLeast(1)
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Adım Adım Yapılış", style = MaterialTheme.typography.headlineSmall, color = tc.primary, modifier = Modifier.weight(1f))
                    Text("${done.size}/${recipe.steps.size}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { done.size.toFloat() / total },
                    modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)),
                    color = tc.primary, trackColor = tc.primary.copy(alpha = 0.15f),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Ekranı açık tut", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                    Switch(checked = settings.keepScreenOn, onCheckedChange = { v -> container.settings.update { it.copy(keepScreenOn = v) } })
                }
            }
        }
        item {
            // Mutfak kronometresi
            val mine = sw.recipeId == recipe.id
            val elapsed = if (mine) sw.elapsed(now) else 0L
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                Column(Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("⏱️", fontSize = 26.sp)
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Mutfak Kronometresi • ${if (mine) sw.phase else "Hazırlık"}", style = MaterialTheme.typography.titleSmall)
                            Text(formatClock(elapsed), style = MaterialTheme.typography.headlineMedium, fontFamily = FontFamily.Monospace)
                        }
                        if (mine && sw.running) {
                            IconButton(onClick = { container.timers.stopwatchPause() }) { Icon(Icons.Filled.Pause, "Duraklat") }
                        } else {
                            IconButton(onClick = { container.timers.stopwatchStart(recipe.id, if (mine) sw.phase else "Hazırlık") }) { Icon(Icons.Filled.PlayArrow, "Başlat") }
                        }
                        IconButton(onClick = { container.timers.stopwatchReset(recipe.id) }) { Icon(Icons.Filled.Refresh, "Sıfırla") }
                    }
                    if (mine && sw.phase == "Hazırlık" && sw.running) {
                        TextButton(onClick = { container.timers.stopwatchSwitchPhase("Pişirme") }) { Text("Hazırlık bitti → Pişirmeye geç 🔥") }
                    }
                    if (mine && sw.laps.isNotEmpty()) {
                        sw.laps.forEach { (label, t) -> Text("• $label: ${formatClock(t)}", style = MaterialTheme.typography.bodySmall) }
                    }
                    Text(
                        "Tahmini: hazırlık ${QuantityFormat.minutes(recipe.prepMinutes)}, pişirme ${QuantityFormat.minutes(recipe.cookMinutes)}" +
                            if (recipe.restMinutes > 0) ", dinlenme ${QuantityFormat.minutes(recipe.restMinutes)}" else "",
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }
        itemsIndexed(recipe.steps) { idx, step ->
            val isDone = idx in done
            val bg by animateColorAsState(if (isDone) MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surfaceContainerLow, label = "stepbg")
            val suggestions = remember(step) {
                (listOfNotNull(step.minutes?.let { TimerSuggestion(it, null, QuantityFormat.minutes(it)) }) + DurationDetector.detect(step.text)).distinctBy { it.minutes }
            }
            val running = timers.filter { it.recipeId == recipe.id && it.stepIndex == idx }
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = bg)) {
                Column(Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        NumberBadge(idx + 1, tc.primary, done = isDone, size = 36)
                        Spacer(Modifier.width(10.dp))
                        Text(step.title.ifBlank { "Adım ${idx + 1}" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text(RecipeCardRenderer.stepEmoji(step.title + " " + step.text), fontSize = 22.sp)
                    }
                    if (!step.image.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        RecipeImage(step.image, Modifier.fillMaxWidth().aspectRatio(16f / 10f).clip(RoundedCornerShape(14.dp)))
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(step.text, style = MaterialTheme.typography.bodyLarge, color = if (isDone) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                    running.forEach { t ->
                        val remaining = t.remaining(now)
                        Spacer(Modifier.height(8.dp))
                        Surface(shape = RoundedCornerShape(14.dp), color = tc.primary.copy(alpha = 0.12f)) {
                            Column(Modifier.padding(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.Timer, null, tint = tc.primary)
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (t.finished) "Süre doldu!" else formatClock(remaining), style = MaterialTheme.typography.titleLarge, fontFamily = FontFamily.Monospace, color = tc.primary, modifier = Modifier.weight(1f))
                                    if (!t.finished) {
                                        if (t.running) IconButton(onClick = { container.timers.pause(t.id) }) { Icon(Icons.Filled.Pause, "Duraklat") }
                                        else IconButton(onClick = { container.timers.resume(t.id) }) { Icon(Icons.Filled.PlayArrow, "Devam") }
                                    }
                                    TextButton(onClick = { container.timers.addTime(t.id, 1) }) { Text("+1 dk") }
                                    IconButton(onClick = { container.timers.cancel(t.id) }) { Icon(Icons.Filled.Close, "İptal") }
                                }
                                LinearProgressIndicator(progress = { t.progress(now) }, modifier = Modifier.fillMaxWidth(), color = tc.primary)
                            }
                        }
                    }
                    if (running.isEmpty() && suggestions.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        FlowRowCompat {
                            suggestions.forEach { s ->
                                AssistChip(
                                    onClick = { container.timers.start("Adım ${idx + 1}: ${step.title.ifBlank { s.label }}", s.minutes.toDouble(), recipe.id, recipe.title, idx) },
                                    label = { Text("⏲ ${QuantityFormat.minutes(s.minutes)} zamanlayıcı") },
                                    leadingIcon = { Icon(Icons.Filled.Timer, null, Modifier.size(16.dp)) },
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                            .clickable { scope.launch { container.recipes.toggleStep(recipe.id, idx, progress) } },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = isDone, onCheckedChange = { scope.launch { container.recipes.toggleStep(recipe.id, idx, progress) } })
                        Text(if (isDone) "Bu aşama tamamlandı ✓" else "Tamamlandı olarak işaretle", color = if (isDone) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface, fontWeight = if (isDone) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
        }
        if (recipe.steps.isNotEmpty() && done.size >= recipe.steps.size) {
            item {
                Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = tc.primary)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("🎉 Afiyet olsun!", style = MaterialTheme.typography.headlineSmall, color = tc.onPrimary)
                        if (sw.recipeId == recipe.id && sw.elapsed(now) > 0) Text("Toplam süreniz: ${formatClock(sw.elapsed(now))}", color = tc.onPrimary)
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { container.timers.stopwatchPause(); onRate() }) { Text("Puan ver ve yorum yaz ⭐") }
                    }
                }
            }
        }
        if (recipe.tips.isNotEmpty()) {
            item {
                Card(shape = RoundedCornerShape(20.dp), border = androidx.compose.foundation.BorderStroke(2.dp, tc.primary.copy(alpha = 0.5f)), colors = CardDefaults.cardColors(containerColor = tc.surface)) {
                    Column(Modifier.padding(16.dp)) {
                        Surface(color = tc.primary, shape = RoundedCornerShape(50)) {
                            Text("👨‍🍳 Püf Noktaları", color = tc.onPrimary, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp))
                        }
                        Spacer(Modifier.height(8.dp))
                        recipe.tips.forEachIndexed { i, tip ->
                            Row(Modifier.padding(vertical = 4.dp)) {
                                NumberBadge(i + 1, tc.primary, size = 24)
                                Spacer(Modifier.width(8.dp))
                                Text(tip, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowCompat(content: @Composable () -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { content() }
}

// ======================= 4) YORUM & PUANLAMA =======================

@Composable
fun CommentsTab(recipe: Recipe, comments: List<CommentEntity>) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val myRating by remember(recipe.id) { container.recipes.myRating(recipe.id) }.collectAsStateWithLifecycle(initialValue = null)
    var text by remember { mutableStateOf("") }
    var stars by remember(myRating) { mutableStateOf(myRating ?: 0) }
    var reportTarget by remember { mutableStateOf<CommentEntity?>(null) }
    val isAdmin = session?.isAdmin == true
    val visible = comments.filter { !it.hidden || isAdmin || it.authorId == session?.uid }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (recipe.ratingCount > 0) String.format("%.1f", recipe.ratingAvg) else "–", fontSize = 42.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        RatingStars(recipe.ratingAvg, size = 16.dp)
                        Text("${recipe.ratingCount} puan", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (myRating != null) "Puanınız: $myRating ★ (değiştirebilirsiniz)" else "Bu tarifi denediniz mi? Puan verin!", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        RatingInput(stars, onChange = { s ->
                            stars = s
                            scope.launch { container.recipes.rate(recipe, s) }
                        }, size = 30.dp)
                    }
                }
            }
        }
        item {
            Card(shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(12.dp)) {
                    OutlinedTextField(
                        value = text, onValueChange = { text = it.take(1000) }, modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Gurme yorumunuzu yazın… (ipucu, değişiklik, sonuç)") }, minLines = 2,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${text.length}/1000", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                        Button(onClick = {
                            val t = text
                            text = ""
                            scope.launch { container.recipes.addComment(recipe, t, stars) }
                        }, enabled = text.isNotBlank()) {
                            Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Gönder")
                        }
                    }
                }
            }
        }
        if (visible.isEmpty()) {
            item { EmptyState("💬", "Henüz yorum yok", "İlk yorumu siz yazın; diğer şeflere ilham olun!") }
        }
        items(visible, key = { it.id }) { c ->
            var menu by remember { mutableStateOf(false) }
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Avatar(c.authorName, c.authorPhoto, 38.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(c.authorName, style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.width(6.dp))
                        Text(relativeTime(c.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (c.hidden) Text("  • gizlendi", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                    }
                    if (c.rating > 0) RatingStars(c.rating.toDouble(), size = 13.dp)
                    Text(c.text, style = MaterialTheme.typography.bodyMedium)
                }
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Seçenekler") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (c.authorId == session?.uid || isAdmin) {
                            DropdownMenuItem(text = { Text("Sil") }, leadingIcon = { Icon(Icons.Filled.Delete, null) }, onClick = {
                                menu = false
                                scope.launch { if (isAdmin && c.authorId != session?.uid) container.social.moderateComment(c, hide = false, delete = true) else container.recipes.deleteComment(c) }
                            })
                        }
                        if (isAdmin) {
                            DropdownMenuItem(
                                text = { Text(if (c.hidden) "Göster" else "Gizle (moderasyon)") },
                                leadingIcon = { Icon(if (c.hidden) Icons.Filled.Visibility else Icons.Filled.VisibilityOff, null) },
                                onClick = { menu = false; scope.launch { container.social.moderateComment(c, hide = !c.hidden, delete = false) } },
                            )
                        }
                        if (c.authorId != session?.uid) {
                            DropdownMenuItem(text = { Text("Şikayet et") }, leadingIcon = { Icon(Icons.Filled.Flag, null) }, onClick = { menu = false; reportTarget = c })
                        }
                    }
                }
            }
        }
    }

    reportTarget?.let { c ->
        ReportDialog("Yorumu şikayet et", onDismiss = { reportTarget = null }, onSend = { reason ->
            reportTarget = null
            scope.launch { container.recipes.report("COMMENT", c.id, "${c.authorName}: ${c.text.take(60)}", reason) }
            Toast.makeText(context, "Şikayetiniz iletildi", Toast.LENGTH_SHORT).show()
        })
    }
}
