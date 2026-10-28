package com.tarifpro.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.data.repo.CollectionInfo
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.FoodIllustration
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.RecipeCard
import com.tarifpro.app.ui.components.RecipeImage
import com.tarifpro.app.ui.components.formatClock
import kotlinx.coroutines.launch

val collectionColors = listOf(
    Color(0xFFFFE4EC), Color(0xFFE3F0FF), Color(0xFFE8F5E9), Color(0xFFFFF3D6), Color(0xFFEDE3F5), Color(0xFFE0F7FA),
)
private val collectionEmojis = listOf("📒", "🍰", "🥗", "🍲", "🎉", "🥘", "🍝", "🥐", "🐟", "🌶️", "🧁", "☕", "🎄", "👶", "💪", "❤️")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotebookScreen(nav: NavController) {
    val container = LocalContainer.current
    val collections by container.recipes.collections.collectAsStateWithLifecycle()
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val shopping by container.recipes.shopping.collectAsStateWithLifecycle()
    val timers by container.timers.timers.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val byId = remember(recipes) { recipes.associateBy { it.id } }
    var editing by remember { mutableStateOf<CollectionInfo?>(null) }
    var creating by remember { mutableStateOf(false) }
    val mine = recipes.count { it.authorId == session?.uid }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Defterim") }) },
        floatingActionButton = { FloatingActionButton(onClick = { creating = true }) { Icon(Icons.Filled.Add, "Yeni defter") } },
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(160.dp),
            modifier = Modifier.padding(padding),
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { QuickCard("❤️", "Favoriler", "${favorites.count { it in byId }} tarif", Color(0xFFFFE4EC)) { nav.navigate("list/favorites") } }
            item { QuickCard("👩‍🍳", "Tariflerim", "$mine tarif", Color(0xFFFFF3D6)) { nav.navigate("list/mine") } }
            item { QuickCard("🛒", "Alışveriş listesi", "${shopping.count { !it.checked }} eksik", Color(0xFFE8F5E9)) { nav.navigate("shopping") } }
            item { QuickCard("⏱️", "Zamanlayıcılar", if (timers.isEmpty()) "Kronometre & sayaç" else "${timers.size} aktif", Color(0xFFE3F0FF)) { nav.navigate("timers") } }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.padding(top = 8.dp)) {
                    Text("Yemek defterlerim", style = MaterialTheme.typography.titleLarge)
                    Text("Favori tariflerinizi temalı koleksiyonlarda toplayın.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (collections.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    EmptyState("📚", "Henüz defteriniz yok", "\"Misafir Menüsü\", \"Haftalık Plan\", \"Doğum Günü Tatlıları\" gibi defterler oluşturun.", actionLabel = "Defter oluştur") { creating = true }
                }
            }
            items(collections, key = { it.entity.id }) { info ->
                val cover = info.recipeIds.firstNotNullOfOrNull { byId[it] }
                Card(onClick = { nav.navigate("collection/${info.entity.id}") }, shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = collectionColors[info.entity.color % collectionColors.size])) {
                    Box(Modifier.fillMaxWidth().aspectRatio(1.3f)) {
                        if (cover != null) RecipeImage(cover.image, Modifier.fillMaxSize())
                        else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(info.entity.emoji, fontSize = 48.sp) }
                        IconButton(onClick = { editing = info }, modifier = Modifier.align(Alignment.TopEnd)) {
                            Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.35f)) { Icon(Icons.Filled.Edit, "Düzenle", tint = Color.White, modifier = Modifier.padding(6.dp).size(16.dp)) }
                        }
                    }
                    Column(Modifier.padding(10.dp)) {
                        Text("${info.entity.emoji} ${info.entity.name}", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, color = Color(0xFF2B1B20))
                        Text("${info.recipeIds.size} tarif", style = MaterialTheme.typography.labelSmall, color = Color(0xFF5C4A50))
                    }
                }
            }
        }
    }
    if (creating) CollectionDialog(null, onDismiss = { creating = false })
    editing?.let { CollectionDialog(it, onDismiss = { editing = null }) }
}

@Composable
private fun QuickCard(emoji: String, title: String, subtitle: String, color: Color, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(20.dp), color = color) {
        Column(Modifier.fillMaxWidth().padding(14.dp)) {
            Text(emoji, fontSize = 28.sp)
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color(0xFF2B1B20))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF5C4A50))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CollectionDialog(existing: CollectionInfo?, onDismiss: () -> Unit) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(existing?.entity?.name ?: "") }
    var desc by remember { mutableStateOf(existing?.entity?.description ?: "") }
    var emoji by remember { mutableStateOf(existing?.entity?.emoji ?: "📒") }
    var color by remember { mutableStateOf(existing?.entity?.color ?: 0) }
    var confirmDelete by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "Yeni yemek defteri" else "Defteri düzenle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it.take(40) }, label = { Text("Defter adı") }, singleLine = true)
                OutlinedTextField(desc, { desc = it.take(120) }, label = { Text("Açıklama") })
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    collectionEmojis.forEach { e ->
                        Surface(onClick = { emoji = e }, shape = CircleShape, color = if (e == emoji) MaterialTheme.colorScheme.primaryContainer else Color.Transparent) {
                            Text(e, fontSize = 22.sp, modifier = Modifier.padding(6.dp))
                        }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    collectionColors.forEachIndexed { i, c ->
                        Surface(onClick = { color = i }, shape = CircleShape, color = c, border = if (i == color) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null, modifier = Modifier.size(30.dp)) {}
                    }
                }
                if (existing != null) {
                    TextButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, null, tint = MaterialTheme.colorScheme.error); Text(" Defteri sil", color = MaterialTheme.colorScheme.error) }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                scope.launch {
                    if (existing == null) container.recipes.createCollection(name, desc, emoji, color)
                    else container.recipes.updateCollection(existing.entity.id, name.ifBlank { existing.entity.name }, desc, emoji, color)
                }
                onDismiss()
            }) { Text("Kaydet") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } },
    )
    if (confirmDelete && existing != null) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Defter silinsin mi?") },
            text = { Text("Tarifler silinmez, yalnızca defter kaldırılır.") },
            confirmButton = { TextButton(onClick = { scope.launch { container.recipes.deleteCollection(existing.entity.id) }; confirmDelete = false; onDismiss() }) { Text("Sil") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Vazgeç") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionScreen(nav: NavController, id: String) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val collections by container.recipes.collections.collectAsStateWithLifecycle()
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val info = collections.firstOrNull { it.entity.id == id }
    val byId = remember(recipes) { recipes.associateBy { it.id } }
    var editing by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(info?.let { "${it.entity.emoji} ${it.entity.name}" } ?: "Defter") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = { if (info != null) IconButton(onClick = { editing = true }) { Icon(Icons.Filled.Edit, "Düzenle") } },
            )
        },
    ) { padding ->
        val list = info?.recipeIds?.mapNotNull { byId[it] } ?: emptyList()
        LazyVerticalGrid(
            GridCells.Adaptive(170.dp), Modifier.padding(padding), contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (info != null && info.entity.description.isNotBlank()) {
                item(span = { GridItemSpan(maxLineSpan) }) { Text(info.entity.description, style = MaterialTheme.typography.bodyMedium) }
            }
            if (list.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) { EmptyState("📒", "Defter boş", "Bir tarifin menüsünden \"Deftere ekle\" seçeneğini kullanın.") }
            }
            items(list, key = { it.id }) { r ->
                Box {
                    RecipeCard(r, container.recipes.nutrition(r).perServing.kcal.toInt(), r.id in favorites, onClick = { nav.navigate("recipe/${r.id}") }, onFavorite = { scope.launch { container.recipes.toggleFavorite(r.id) } })
                    IconButton(onClick = { scope.launch { container.recipes.setInCollection(id, r.id, false) } }, modifier = Modifier.align(Alignment.TopStart)) {
                        Surface(shape = CircleShape, color = Color.Black.copy(alpha = 0.4f)) { Icon(Icons.Filled.Close, "Defterden çıkar", tint = Color.White, modifier = Modifier.padding(4.dp).size(16.dp)) }
                    }
                }
            }
        }
    }
    if (editing && info != null) CollectionDialog(info, onDismiss = { editing = false; if (collections.none { it.entity.id == id }) nav.popBackStack() })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeListScreen(nav: NavController, kind: String) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val kcal = { r: Recipe -> container.recipes.nutrition(r).perServing.kcal.toInt() }
    val (title, list) = when {
        kind == "favorites" -> "❤️ Favoriler" to recipes.filter { it.id in favorites }
        kind == "mine" -> "👩‍🍳 Tariflerim" to recipes.filter { it.authorId == session?.uid }.sortedByDescending { it.updatedAt }
        kind == "top" -> "⭐ En beğenilenler" to recipes.sortedByDescending { it.ratingAvg * 10 + kotlin.math.ln(1.0 + it.ratingCount) }
        kind == "quick" -> "⚡ 30 dakikada hazır" to recipes.filter { it.totalMinutes in 1..30 }.sortedBy { it.totalMinutes }
        kind == "light" -> "🥗 Hafif & fit" to recipes.filter { kcal(it) in 1..450 }.sortedBy { kcal(it) }
        kind == "new" -> "🆕 Yeni eklenenler" to recipes.sortedByDescending { it.createdAt }
        kind.startsWith("category:") -> kind.removePrefix("category:").let { c -> c to recipes.filter { it.category == c } }
        else -> "Tarifler" to recipes
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        LazyVerticalGrid(
            GridCells.Adaptive(170.dp), Modifier.padding(padding), contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (list.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    if (kind == "mine") EmptyState("👩‍🍳", "Henüz tarifiniz yok", "İlk tarifinizi fotoğraflarıyla ekleyin.", actionLabel = "Tarif ekle") { nav.navigate("editor") }
                    else EmptyState("🍽️", "Burada henüz tarif yok", "Keşfet sayfasından yeni tarifler bulun.")
                }
            }
            items(list, key = { it.id }) { r ->
                RecipeCard(r, kcal(r), r.id in favorites, onClick = { nav.navigate("recipe/${r.id}") }, onFavorite = { scope.launch { container.recipes.toggleFavorite(r.id) } })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShoppingScreen(nav: NavController) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val items by container.recipes.shopping.collectAsStateWithLifecycle()
    var newItem by remember { mutableStateOf("") }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🛒 Alışveriş listesi") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = {
                    IconButton(onClick = {
                        val text = "🛒 Alışveriş listem\n" + items.filter { !it.checked }.joinToString("\n") { "☐ " + it.text }
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Listeyi paylaş"))
                    }) { Icon(Icons.Filled.Share, "Paylaş") }
                    IconButton(onClick = { scope.launch { container.recipes.clearCheckedShopping() } }) { Icon(Icons.Filled.DeleteSweep, "Alınanları temizle") }
                },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp)) {
            item {
                OutlinedTextField(
                    newItem, { newItem = it }, Modifier.fillMaxWidth(), placeholder = { Text("Ürün ekle (ör. 1 kg domates)") }, singleLine = true,
                    trailingIcon = { IconButton(onClick = { val t = newItem; newItem = ""; scope.launch { container.recipes.addShoppingText(t) } }) { Icon(Icons.Filled.Add, "Ekle") } },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { val t = newItem; newItem = ""; scope.launch { container.recipes.addShoppingText(t) } }),
                )
                Spacer(Modifier.height(8.dp))
            }
            if (items.isEmpty()) item { EmptyState("🛒", "Liste boş", "Bir tarifin malzeme sayfasından eksikleri tek dokunuşla ekleyin.") }
            val groups = items.groupBy { it.source }
            groups.forEach { (source, list) ->
                item { Text(source.ifBlank { "Diğer" }, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)) }
                items(list, key = { it.id }) { item ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = item.checked, onCheckedChange = { scope.launch { container.recipes.toggleShopping(item) } })
                        Text(item.text, Modifier.weight(1f), textDecoration = if (item.checked) TextDecoration.LineThrough else null, color = if (item.checked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
                        IconButton(onClick = { scope.launch { container.recipes.deleteShopping(item) } }) { Icon(Icons.Filled.Close, "Sil") }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TimersScreen(nav: NavController) {
    val container = LocalContainer.current
    val timers by container.timers.timers.collectAsStateWithLifecycle()
    val now by container.timers.tick.collectAsStateWithLifecycle()
    val sw by container.timers.stopwatch.collectAsStateWithLifecycle()
    var label by remember { mutableStateOf("") }
    var custom by remember { mutableStateOf("") }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("⏱️ Mutfak zamanlayıcıları") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Kronometre • ${sw.phase}", style = MaterialTheme.typography.titleMedium)
                        Text(formatClock(sw.elapsed(now)), fontSize = 44.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (sw.running) Button(onClick = { container.timers.stopwatchPause() }) { Icon(Icons.Filled.Pause, null); Text(" Duraklat") }
                            else Button(onClick = { container.timers.stopwatchStart(sw.recipeId, sw.phase) }) { Icon(Icons.Filled.PlayArrow, null); Text(" Başlat") }
                            TextButton(onClick = { container.timers.stopwatchLap("Tur ${sw.laps.size + 1}") }, enabled = sw.running) { Text("Tur") }
                            IconButton(onClick = { container.timers.stopwatchReset(null) }) { Icon(Icons.Filled.Refresh, "Sıfırla") }
                        }
                        sw.laps.forEach { (l, t) -> Text("• $l — ${formatClock(t)}", style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
            item {
                Card(shape = RoundedCornerShape(24.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Yeni geri sayım", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(label, { label = it.take(40) }, Modifier.fillMaxWidth(), placeholder = { Text("Etiket (ör. Makarna suyu)") }, singleLine = true)
                        Spacer(Modifier.height(8.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(1, 3, 5, 10, 15, 20, 30, 45, 60).forEach { m ->
                                AssistChip(onClick = { container.timers.start(label.ifBlank { "$m dakika" }, m.toDouble()) }, label = { Text("$m dk") }, leadingIcon = { Icon(Icons.Filled.Timer, null, Modifier.size(16.dp)) })
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(custom, { v -> custom = v.filter { it.isDigit() }.take(3) }, Modifier.width(140.dp), label = { Text("Dakika") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                            Spacer(Modifier.width(8.dp))
                            Button(onClick = { custom.toIntOrNull()?.let { container.timers.start(label.ifBlank { "$it dakika" }, it.toDouble()); custom = "" } }, enabled = custom.isNotBlank()) { Text("Başlat") }
                        }
                    }
                }
            }
            if (timers.isEmpty()) item { EmptyState("⏲️", "Aktif zamanlayıcı yok", "Tarif adımlarındaki süre çiplerine dokunarak akıllı zamanlayıcı başlatabilirsiniz.") }
            items(timers, key = { it.id }) { t ->
                Card(shape = RoundedCornerShape(20.dp), onClick = { t.recipeId?.let { nav.navigate("recipe/$it?tab=2") } }) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(t.label, style = MaterialTheme.typography.titleSmall)
                                t.recipeTitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            Text(if (t.finished) "Bitti!" else formatClock(t.remaining(now)), fontSize = 30.sp, fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.primary)
                        }
                        LinearProgressIndicator(progress = { t.progress(now) }, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp))
                        Row {
                            if (!t.finished) {
                                if (t.running) TextButton(onClick = { container.timers.pause(t.id) }) { Text("Duraklat") }
                                else TextButton(onClick = { container.timers.resume(t.id) }) { Text("Devam") }
                            }
                            TextButton(onClick = { container.timers.addTime(t.id, 1) }) { Text("+1 dk") }
                            TextButton(onClick = { container.timers.addTime(t.id, 5) }) { Text("+5 dk") }
                            Spacer(Modifier.weight(1f))
                            TextButton(onClick = { container.timers.cancel(t.id) }) { Text("İptal", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
        }
    }
}
