package com.tarifpro.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Kitchen
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.NutritionDb
import com.tarifpro.app.domain.RECIPE_CATEGORIES
import com.tarifpro.app.domain.SearchFilters
import com.tarifpro.app.domain.SearchSort
import com.tarifpro.app.domain.TurkishText
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.RecipeCard
import kotlinx.coroutines.launch
import kotlin.system.measureNanoTime

private val healthTagOptions = listOf("Vejetaryen", "Vegan", "Glutensiz", "Laktozsuz", "Düşük Kalori", "Yüksek Protein", "Lif Kaynağı", "Düşük Karbonhidrat")

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(nav: NavController) {
    val container = LocalContainer.current
    val engine by container.recipes.searchEngine.collectAsStateWithLifecycle()
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val settings by container.settings.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var query by rememberSaveable { mutableStateOf("") }
    var pantry by remember { mutableStateOf(setOf<String>()) }
    var pantryAny by remember { mutableStateOf(false) }
    var difficulties by remember { mutableStateOf(setOf<Int>()) }
    var maxKcal by remember { mutableStateOf<Int?>(null) }
    var maxMinutes by remember { mutableStateOf<Int?>(null) }
    var categories by remember { mutableStateOf(setOf<String>()) }
    var health by remember { mutableStateOf(setOf<String>()) }
    var sort by remember { mutableStateOf(SearchSort.RELEVANCE) }
    var showPantry by remember { mutableStateOf(false) }
    var showFilters by remember { mutableStateOf(false) }
    var sortMenu by remember { mutableStateOf(false) }

    val filters = SearchFilters(query, pantry, pantryAny, difficulties, maxKcal, maxMinutes, categories, health, 0.0, sort)
    val (hits, elapsedMs) = remember(engine, filters) {
        var r = emptyList<com.tarifpro.app.domain.SearchHit>()
        val ms = measureNanoTime { r = engine.search(filters) } / 1_000_000.0
        r to ms
    }
    val byId = remember(recipes) { recipes.associateBy { it.id } }
    val suggestions = remember(engine, query) { engine.suggest(query) }
    val activeFilterCount = difficulties.size + categories.size + health.size + (if (maxKcal != null) 1 else 0) + (if (maxMinutes != null) 1 else 0)

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Tarif, malzeme, şef…") },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Clear, "Temizle") } },
                singleLine = true,
                shape = RoundedCornerShape(28.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { container.settings.addRecentSearch(query) }),
            )
            IconButton(onClick = { showFilters = true }) {
                BadgedBox(badge = { if (activeFilterCount > 0) Badge { Text("$activeFilterCount") } }) { Icon(Icons.Filled.Tune, "Filtreler") }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            FilterChip(
                selected = pantry.isNotEmpty(),
                onClick = { showPantry = true },
                label = { Text(if (pantry.isEmpty()) "Dolapta ne var?" else "Dolabım (${pantry.size})") },
                leadingIcon = { Icon(Icons.Filled.Kitchen, null, Modifier.size(18.dp)) },
            )
            Spacer(Modifier.width(8.dp))
            Box {
                AssistChip(onClick = { sortMenu = true }, label = { Text(sort.label) })
                DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                    SearchSort.entries.forEach { s ->
                        DropdownMenuItem(text = { Text(s.label) }, onClick = { sort = s; sortMenu = false }, leadingIcon = { if (s == sort) Icon(Icons.Filled.Check, null) })
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            Text("${hits.size} sonuç • ${String.format("%.1f", elapsedMs)} ms", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (pantry.isNotEmpty()) {
            FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pantry.forEach { p ->
                    InputChip(selected = true, onClick = { pantry = pantry - p }, label = { Text(p) }, trailingIcon = { Icon(Icons.Filled.Clear, "Kaldır", Modifier.size(16.dp)) })
                }
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Adaptive(170.dp),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            if (query.isNotBlank() && suggestions.isNotEmpty() && hits.size > 1) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        suggestions.forEach { s -> AssistChip(onClick = { query = s; container.settings.addRecentSearch(s) }, label = { Text(s) }) }
                    }
                }
            }
            if (query.isBlank() && pantry.isEmpty() && settings.recentSearches.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column {
                        Text("Son aramalar", style = MaterialTheme.typography.titleSmall)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            settings.recentSearches.forEach { s ->
                                AssistChip(onClick = { query = s }, label = { Text(s) }, leadingIcon = { Icon(Icons.Filled.History, null, Modifier.size(16.dp)) })
                            }
                        }
                    }
                }
            }
            items(hits, key = { it.id }) { hit ->
                val r = byId[hit.id] ?: return@items
                Column {
                    RecipeCard(
                        r, container.recipes.nutrition(r).perServing.kcal.toInt(), r.id in favorites,
                        onClick = { container.settings.addRecentSearch(query); nav.navigate("recipe/${r.id}") },
                        onFavorite = { scope.launch { container.recipes.toggleFavorite(r.id) } },
                    )
                    if (hit.pantryTotal > 0) {
                        Spacer(Modifier.height(4.dp))
                        val missing = r.ingredients.size - hit.pantryMatched
                        Text(
                            "🧺 ${hit.pantryMatched}/${hit.pantryTotal} malzemen var" + if (missing > 0) " • $missing eksik" else "",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.tertiary,
                        )
                    }
                }
            }
            if (hits.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    EmptyState("🔎", "Sonuç bulunamadı", "Farklı bir kelime deneyin veya filtreleri gevşetin. Yazım hatalarını otomatik düzeltiyoruz!")
                }
            }
        }
    }

    if (showPantry) {
        PantrySheet(
            selected = pantry,
            matchAny = pantryAny,
            recipeIngredientNames = recipes.flatMap { r -> r.ingredients.map { TurkishText.capitalize(it.name.trim()) } },
            onDone = { sel, any -> pantry = sel; pantryAny = any; showPantry = false },
        )
    }

    if (showFilters) {
        val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { showFilters = false }, sheetState = sheet) {
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Filtreler", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    TextButton(onClick = { difficulties = emptySet(); categories = emptySet(); health = emptySet(); maxKcal = null; maxMinutes = null }) { Text("Sıfırla") }
                }
                Text("Zorluk", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD).forEach { d ->
                        FilterChip(selected = d in difficulties, onClick = { difficulties = if (d in difficulties) difficulties - d else difficulties + d }, label = { Text(Difficulty.label(d)) })
                    }
                }
                Text("Maksimum kalori (porsiyon): ${maxKcal?.let { "$it kcal" } ?: "Sınırsız"}", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
                Slider(
                    value = (maxKcal ?: 1200).toFloat(),
                    onValueChange = { v -> maxKcal = if (v >= 1200f) null else (v / 50).toInt() * 50 },
                    valueRange = 100f..1200f,
                )
                Text("Toplam süre", style = MaterialTheme.typography.titleSmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(15, 30, 45, 60, 120).forEach { m ->
                        FilterChip(selected = maxMinutes == m, onClick = { maxMinutes = if (maxMinutes == m) null else m }, label = { Text("≤ $m dk") })
                    }
                }
                Text("Kategori", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RECIPE_CATEGORIES.forEach { c ->
                        FilterChip(selected = c in categories, onClick = { categories = if (c in categories) categories - c else categories + c }, label = { Text(c) })
                    }
                }
                Text("Beslenme", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    healthTagOptions.forEach { h ->
                        FilterChip(selected = h in health, onClick = { health = if (h in health) health - h else health + h }, label = { Text(h) })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun PantrySheet(
    selected: Set<String>,
    matchAny: Boolean,
    recipeIngredientNames: List<String>,
    onDone: (Set<String>, Boolean) -> Unit,
) {
    var sel by remember { mutableStateOf(selected) }
    var any by remember { mutableStateOf(matchAny) }
    var filter by remember { mutableStateOf("") }
    val all = remember(recipeIngredientNames) {
        val freq = recipeIngredientNames.groupingBy { it }.eachCount()
        (freq.keys.sortedByDescending { freq[it] } + NutritionDb.allIngredientNames).distinctBy { TurkishText.fold(it) }
    }
    val shown = all.filter { filter.isBlank() || TurkishText.fold(it).contains(TurkishText.fold(filter)) }.take(80)
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = { onDone(sel, any) }, sheetState = sheet) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("🧺 Dolapta ne var?", style = MaterialTheme.typography.titleLarge)
            Text("Evdeki malzemeleri seçin; tümünü içeren tarifleri anında bulalım.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = filter, onValueChange = { filter = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Malzeme ara veya yaz (ör. yumurta)") },
                trailingIcon = {
                    if (filter.isNotBlank()) TextButton(onClick = { sel = sel + TurkishText.capitalize(filter.trim()); filter = "" }) { Text("Ekle") }
                },
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                Switch(checked = any, onCheckedChange = { any = it })
                Spacer(Modifier.width(8.dp))
                Text(if (any) "En az birini içerenler" else "Hepsini içerenler", style = MaterialTheme.typography.bodyMedium)
            }
            Column(Modifier.height(320.dp).verticalScroll(rememberScrollState())) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    shown.forEach { name ->
                        FilterChip(selected = name in sel, onClick = { sel = if (name in sel) sel - name else sel + name }, label = { Text(name) })
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = { sel = emptySet() }) { Text("Temizle") }
                Surface(onClick = { onDone(sel, any) }, shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primary) {
                    Text("Tarifleri göster (${sel.size})", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp))
                }
            }
        }
    }
}
