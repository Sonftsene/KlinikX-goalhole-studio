package com.tarifpro.app.ui.screens

import android.app.Activity
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.BookmarkAdd
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TextSnippet
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Scaler
import com.tarifpro.app.export.PrintHelper
import com.tarifpro.app.export.ShareHelper
import com.tarifpro.app.export.Templates
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.theme.colors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun RecipeDetailScreen(nav: NavController, id: String, initialTab: Int) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recipeState = remember(id) { container.recipes.observeRecipe(id) }.collectAsStateWithLifecycle(initialValue = null)
    val recipe = recipeState.value
    val session by container.auth.session.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    var waited by remember { mutableStateOf(false) }
    LaunchedEffect(id) { delay(1200); waited = true }

    DisposableEffect(id) {
        val stop = container.sync.listenComments(id)
        onDispose { stop() }
    }

    if (recipe == null) {
        Scaffold(topBar = { TopAppBar(title = {}, navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } }) }) { p ->
            if (waited) EmptyState("🍽️", "Tarif bulunamadı", "Bu tarif silinmiş, gizlenmiş ya da size kapalı olabilir.", Modifier.padding(p))
        }
        return
    }

    var servings by rememberSaveable(recipe.id) { mutableStateOf(recipe.servings) }
    val pager = rememberPagerState(initialPage = initialTab.coerceIn(0, 3)) { 4 }
    val template = Templates.byId(recipe.templateId)
    val tc = template.colors()
    val isMine = recipe.authorId == session?.uid
    val isAdmin = session?.isAdmin == true
    var shareMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }
    var showCollections by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val comments by remember(id) { container.recipes.comments(id) }.collectAsStateWithLifecycle(initialValue = emptyList())

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(recipe.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = {
                    val fav = recipe.id in favorites
                    IconButton(onClick = { scope.launch { container.recipes.toggleFavorite(recipe.id) } }) {
                        Icon(if (fav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, if (fav) "Favorilerden çıkar" else "Favorilere ekle", tint = if (fav) Color(0xFFE91E63) else MaterialTheme.colorScheme.onSurface)
                    }
                    Box {
                        IconButton(onClick = { shareMenu = true }) { Icon(Icons.Filled.Share, "Paylaş") }
                        DropdownMenu(expanded = shareMenu, onDismissRequest = { shareMenu = false }) {
                            DropdownMenuItem(text = { Text("Tarif kartı tasarla (PNG)") }, leadingIcon = { Icon(Icons.Filled.Image, null) }, onClick = { shareMenu = false; nav.navigate("designer/${recipe.id}?servings=$servings") })
                            DropdownMenuItem(text = { Text("Metin olarak paylaş") }, leadingIcon = { Icon(Icons.Filled.TextSnippet, null) }, onClick = {
                                shareMenu = false
                                ShareHelper.shareText(context, recipe.copy(ingredients = Scaler.scaleAll(recipe.ingredients, Scaler.factor(recipe.servings, servings)), servings = servings))
                            })
                            DropdownMenuItem(text = { Text("A4 yazdır / PDF") }, leadingIcon = { Icon(Icons.Filled.Print, null) }, onClick = {
                                shareMenu = false
                                scope.launch {
                                    val html = PrintHelper.buildHtml(container.images, recipe, servings, template)
                                    PrintHelper.print(context as Activity, html, "TarifPro - ${recipe.title}")
                                }
                            })
                            DropdownMenuItem(text = { Text("Sohbette gönder") }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.Send, null) }, onClick = { shareMenu = false; nav.navigate("share-chat/${recipe.id}") })
                        }
                    }
                    Box {
                        IconButton(onClick = { moreMenu = true }) { Icon(Icons.Filled.MoreVert, "Diğer") }
                        DropdownMenu(expanded = moreMenu, onDismissRequest = { moreMenu = false }) {
                            if (isMine) DropdownMenuItem(text = { Text("Düzenle") }, leadingIcon = { Icon(Icons.Filled.Edit, null) }, onClick = { moreMenu = false; nav.navigate("editor?id=${recipe.id}") })
                            if (!isMine) DropdownMenuItem(text = { Text("Kopyala ve düzenle") }, leadingIcon = { Icon(Icons.Filled.ContentCopy, null) }, onClick = {
                                moreMenu = false
                                scope.launch {
                                    val copy = container.recipes.duplicateAsMine(recipe)
                                    nav.navigate("editor?id=${copy.id}")
                                }
                            })
                            DropdownMenuItem(text = { Text("Deftere ekle") }, leadingIcon = { Icon(Icons.Filled.BookmarkAdd, null) }, onClick = { moreMenu = false; showCollections = true })
                            DropdownMenuItem(text = { Text("Alışveriş listesine ekle") }, leadingIcon = { Icon(Icons.Filled.ShoppingCart, null) }, onClick = {
                                moreMenu = false
                                scope.launch {
                                    val n = container.recipes.addToShopping(recipe, servings)
                                    Toast.makeText(context, "$n malzeme alışveriş listesine eklendi", Toast.LENGTH_SHORT).show()
                                }
                            })
                            if (!isMine) DropdownMenuItem(text = { Text("Şikayet et") }, leadingIcon = { Icon(Icons.Filled.Flag, null) }, onClick = { moreMenu = false; showReport = true })
                            if (isAdmin && !isMine) {
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text(if (recipe.hidden) "Moderasyon: Görünür yap" else "Moderasyon: Gizle") },
                                    leadingIcon = { Icon(if (recipe.hidden) Icons.Filled.Visibility else Icons.Filled.VisibilityOff, null) },
                                    onClick = { moreMenu = false; scope.launch { container.social.moderateRecipe(recipe.id, hidden = !recipe.hidden) } },
                                )
                                DropdownMenuItem(
                                    text = { Text(if (recipe.featured) "Öne çıkarmayı kaldır" else "Öne çıkar") },
                                    leadingIcon = { Icon(Icons.Filled.Star, null) },
                                    onClick = { moreMenu = false; scope.launch { container.social.moderateRecipe(recipe.id, featured = !recipe.featured) } },
                                )
                                DropdownMenuItem(text = { Text("Yönetici paneli") }, leadingIcon = { Icon(Icons.Filled.AdminPanelSettings, null) }, onClick = { moreMenu = false; nav.navigate("admin") })
                            }
                            if (isMine || isAdmin) DropdownMenuItem(text = { Text("Sil", color = MaterialTheme.colorScheme.error) }, leadingIcon = { Icon(Icons.Filled.Delete, null, tint = MaterialTheme.colorScheme.error) }, onClick = { moreMenu = false; confirmDelete = true })
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            ServingsBar(recipe, servings, onChange = { servings = it }, accent = tc.primary)
            ScrollableTabRow(selectedTabIndex = pager.currentPage, edgePadding = 8.dp, containerColor = MaterialTheme.colorScheme.surface) {
                val titles = listOf("Kart & Besin", "Malzemeler", "Yapılış", "Yorumlar (${comments.count { !it.hidden }})")
                titles.forEachIndexed { i, t ->
                    Tab(selected = pager.currentPage == i, onClick = { scope.launch { pager.animateScrollToPage(i) } }, text = { Text(t, fontWeight = if (pager.currentPage == i) FontWeight.Bold else FontWeight.Normal) })
                }
            }
            HorizontalPager(pager, modifier = Modifier.weight(1f), beyondViewportPageCount = 1) { page ->
                when (page) {
                    0 -> CardTab(nav, recipe, servings, template, onGoTo = { scope.launch { pager.animateScrollToPage(it) } })
                    1 -> IngredientsTab(recipe, servings, template, onServings = { servings = it })
                    2 -> StepsTab(recipe, template, onRate = { scope.launch { pager.animateScrollToPage(3) } })
                    else -> CommentsTab(recipe, comments)
                }
            }
        }
    }

    if (showCollections) CollectionPickerDialog(recipe, onDismiss = { showCollections = false })
    if (showReport) ReportDialog(
        title = "Tarifi şikayet et",
        onDismiss = { showReport = false },
        onSend = { reason ->
            showReport = false
            scope.launch { container.recipes.report("RECIPE", recipe.id, recipe.title, reason) }
            Toast.makeText(context, "Şikayetiniz moderatörlere iletildi", Toast.LENGTH_SHORT).show()
        },
    )
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Tarif silinsin mi?") },
            text = { Text("\"${recipe.title}\" kalıcı olarak silinecek ve tüm cihazlarınızdan kaldırılacak.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    scope.launch {
                        if (isMine) container.recipes.delete(recipe.id) else container.social.moderateRecipe(recipe.id, delete = true)
                        nav.popBackStack()
                    }
                }) { Text("Sil", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Vazgeç") } },
        )
    }
}

@Composable
private fun ServingsBar(recipe: Recipe, servings: Int, onChange: (Int) -> Unit, accent: Color) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            FilledTonalIconButton(onClick = { onChange((servings - 1).coerceAtLeast(Scaler.MIN_SERVINGS)) }, modifier = Modifier.size(36.dp)) { Icon(Icons.Filled.Remove, "Azalt") }
            Column(Modifier.padding(horizontal = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$servings kişilik", style = MaterialTheme.typography.titleMedium, color = accent, fontWeight = FontWeight.Bold)
                val f = Scaler.factor(recipe.servings, servings)
                Text(if (servings == recipe.servings) "orijinal tarif" else "×${String.format("%.2f", f).trimEnd('0').trimEnd(',', '.')} ölçü", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            FilledTonalIconButton(onClick = { onChange((servings + 1).coerceAtMost(Scaler.MAX_SERVINGS)) }, modifier = Modifier.size(36.dp)) { Icon(Icons.Filled.Add, "Artır") }
            Spacer(Modifier.width(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(end = 8.dp)) {
                items(listOf(1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24)) { n ->
                    FilterChip(selected = servings == n, onClick = { onChange(n) }, label = { Text("$n") })
                }
            }
        }
    }
}

@Composable
fun CollectionPickerDialog(recipe: Recipe, onDismiss: () -> Unit) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val collections by container.recipes.collections.collectAsStateWithLifecycle()
    var newName by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Deftere ekle") },
        text = {
            Column {
                if (collections.isEmpty()) Text("Henüz defteriniz yok. Aşağıdan yeni bir defter oluşturun.", style = MaterialTheme.typography.bodySmall)
                collections.forEach { info ->
                    val checked = recipe.id in info.recipeIds
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                        Checkbox(checked = checked, onCheckedChange = { scope.launch { container.recipes.setInCollection(info.entity.id, recipe.id, it) } })
                        Text("${info.entity.emoji} ${info.entity.name}", modifier = Modifier.weight(1f))
                        Text("${info.recipeIds.size}", style = MaterialTheme.typography.labelSmall)
                    }
                }
                Spacer(Modifier.size(8.dp))
                OutlinedTextField(value = newName, onValueChange = { newName = it }, label = { Text("Yeni defter adı") }, singleLine = true)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (newName.isNotBlank()) {
                    val n = newName
                    newName = ""
                    scope.launch {
                        val id = container.recipes.createCollection(n, "", "📒", 0)
                        container.recipes.setInCollection(id, recipe.id, true)
                    }
                } else onDismiss()
            }) { Text(if (newName.isNotBlank()) "Oluştur ve ekle" else "Tamam") }
        },
    )
}

@Composable
fun ReportDialog(title: String, onDismiss: () -> Unit, onSend: (String) -> Unit) {
    val reasons = listOf("Uygunsuz içerik", "Spam veya reklam", "Telif hakkı ihlali", "Yanlış / tehlikeli bilgi", "Taciz veya nefret söylemi", "Diğer")
    var selected by remember { mutableStateOf(reasons.first()) }
    var detail by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                reasons.forEach { r ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.RadioButton(selected = selected == r, onClick = { selected = r })
                        Text(r)
                    }
                }
                OutlinedTextField(value = detail, onValueChange = { detail = it }, label = { Text("Açıklama (isteğe bağlı)") })
            }
        },
        confirmButton = { TextButton(onClick = { onSend(if (detail.isBlank()) selected else "$selected: $detail") }) { Text("Gönder") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } },
    )
}

@Composable
fun NumberBadge(n: Int, color: Color, done: Boolean = false, size: Int = 32) {
    Surface(shape = CircleShape, color = if (done) MaterialTheme.colorScheme.tertiary else color, modifier = Modifier.size(size.dp)) {
        Box(contentAlignment = Alignment.Center) {
            Text(if (done) "✓" else "$n", color = Color.White, fontWeight = FontWeight.Bold)
        }
    }
}
