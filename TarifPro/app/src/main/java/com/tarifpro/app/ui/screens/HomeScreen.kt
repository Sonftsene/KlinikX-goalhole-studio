package com.tarifpro.app.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.data.repo.SyncState
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.export.FoodIllustrations
import com.tarifpro.app.ui.components.Avatar
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.FoodIllustration
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.RatingStars
import com.tarifpro.app.ui.components.RecipeCard
import com.tarifpro.app.ui.components.RecipeImage
import com.tarifpro.app.ui.components.SectionHeader
import com.tarifpro.app.domain.QuantityFormat
import kotlinx.coroutines.launch
import java.util.Calendar

private val homeCategories = listOf(
    "Tatlı" to "dessert", "Çorba" to "soup", "Salata" to "salad", "Makarna" to "pasta", "Et & Tavuk" to "kebab",
    "Deniz Ürünleri" to "fish", "Hamur İşi" to "bread", "Kahvaltı" to "breakfast", "Fit & Diyet" to "bowl", "İçecek" to "drink",
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun HomeScreen(nav: NavController) {
    val container = LocalContainer.current
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val sync by container.sync.status.collectAsStateWithLifecycle()
    val unread by container.social.unreadNotifications.collectAsStateWithLifecycle()
    val following by container.social.followingIds.collectAsStateWithLifecycle()
    val timers by container.timers.timers.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }

    val greeting = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
        in 5..11 -> "Günaydın"
        in 12..17 -> "İyi günler"
        else -> "İyi akşamlar"
    }
    val kcalOf = { r: Recipe -> container.recipes.nutrition(r).perServing.kcal.toInt() }
    val openRecipe = { r: Recipe -> nav.navigate("recipe/${r.id}") }
    val toggleFav = { r: Recipe -> scope.launch { container.recipes.toggleFavorite(r.id) }; Unit }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(session?.name ?: "", session?.photo, 36.dp, Modifier.clickable { session?.let { nav.navigate("user/${it.uid}") } })
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text("$greeting, ${session?.name?.split(' ')?.firstOrNull() ?: "Şef"} 👋", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("Bugün ne pişiriyoruz?", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                actions = {
                    val syncIcon = when (sync.state) {
                        SyncState.LOCAL_ONLY -> Icons.Filled.PhoneAndroid
                        SyncState.OFFLINE, SyncState.ERROR -> Icons.Filled.CloudOff
                        SyncState.SYNCING -> Icons.Filled.CloudSync
                        SyncState.IDLE -> Icons.Filled.CloudDone
                    }
                    IconButton(onClick = { nav.navigate("settings") }) { Icon(syncIcon, contentDescription = sync.message) }
                    if (timers.isNotEmpty()) {
                        IconButton(onClick = { nav.navigate("timers") }) {
                            BadgedBox(badge = { Badge { Text(timers.size.toString()) } }) { Icon(Icons.Filled.Timer, "Zamanlayıcılar") }
                        }
                    }
                    IconButton(onClick = { nav.navigate("notifications") }) {
                        BadgedBox(badge = { if (unread > 0) Badge { Text(unread.toString()) } }) { Icon(Icons.Filled.Notifications, "Bildirimler") }
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                scope.launch { container.sync.syncNow(); refreshing = false }
            },
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Surface(
                        onClick = { nav.navigate("search") },
                        shape = RoundedCornerShape(28.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerHigh,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    ) {
                        Row(Modifier.padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Filled.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.width(10.dp))
                            Text("Tarif, malzeme veya şef ara… 🥚🍅", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                val featured = recipes.filter { it.featured }.ifEmpty { recipes.sortedByDescending { it.ratingAvg * it.ratingCount }.take(5) }.take(6)
                if (featured.isNotEmpty()) {
                    item {
                        val pager = rememberPagerState { featured.size }
                        HorizontalPager(pager, contentPadding = PaddingValues(horizontal = 16.dp), pageSpacing = 12.dp) { page ->
                            FeaturedCard(featured[page], onClick = { openRecipe(featured[page]) })
                        }
                    }
                }
                item {
                    SectionHeader("Kategoriler")
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(homeCategories) { (name, illu) ->
                            Column(
                                Modifier.width(76.dp).clickable { nav.navigate("list/category:$name") },
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                FoodIllustration(illu, Modifier.size(68.dp).clip(CircleShape))
                                Spacer(Modifier.height(4.dp))
                                Text(name, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        QuickTile("🧺", "Dolapta ne var?", "Malzemeye göre bul", Modifier.weight(1f)) { nav.navigate("search") }
                        QuickTile("📥", "Tarif içe aktar", "Site bağlantısı / metin", Modifier.weight(1f)) { nav.navigate("import") }
                    }
                }
                val fromFollowed = recipes.filter { it.authorId in following }.sortedByDescending { it.createdAt }
                if (fromFollowed.isNotEmpty()) {
                    item { RecipeRow("Takip ettiğin şeflerden", fromFollowed, favorites, kcalOf, openRecipe, toggleFav) }
                }
                val top = recipes.sortedByDescending { it.ratingAvg + kotlin.math.ln(1.0 + it.ratingCount) / 10 }.take(10)
                item { RecipeRow("En beğenilenler ⭐", top, favorites, kcalOf, openRecipe, toggleFav) { nav.navigate("list/top") } }
                val quick = recipes.filter { it.totalMinutes in 1..30 }
                if (quick.isNotEmpty()) item { RecipeRow("30 dakikada hazır ⚡", quick, favorites, kcalOf, openRecipe, toggleFav) { nav.navigate("list/quick") } }
                val light = recipes.filter { kcalOf(it) in 1..450 }.sortedBy { kcalOf(it) }
                if (light.isNotEmpty()) item { RecipeRow("Hafif & fit 🥗", light, favorites, kcalOf, openRecipe, toggleFav) { nav.navigate("list/light") } }
                val newest = recipes.sortedByDescending { it.createdAt }.take(12)
                item { RecipeRow("Yeni eklenenler 🆕", newest, favorites, kcalOf, openRecipe, toggleFav) { nav.navigate("list/new") } }
                if (recipes.isEmpty()) {
                    item { EmptyState("🍳", "Henüz tarif yok", "İlk tarifinizi ekleyin veya bir siteden içe aktarın.", actionLabel = "Tarif ekle") { nav.navigate("editor") } }
                }
            }
        }
    }
}

@Composable
private fun QuickTile(emoji: String, title: String, subtitle: String, modifier: Modifier, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = modifier) {
        Column(Modifier.padding(14.dp)) {
            Text(emoji, fontSize = 26.sp)
            Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
        }
    }
}

@Composable
fun FeaturedCard(recipe: Recipe, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth().height(220.dp)) {
        Box {
            RecipeImage(recipe.image, Modifier.fillMaxSize(), fallback = FoodIllustrations.forCategory(recipe.category))
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f)), startY = 200f)))
            Surface(color = MaterialTheme.colorScheme.primary, shape = RoundedCornerShape(bottomEnd = 16.dp), modifier = Modifier.align(Alignment.TopStart)) {
                Text("⭐ Öne çıkan", color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium)
            }
            Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
                Text(recipe.title, color = Color.White, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (recipe.tagline.isNotBlank()) Text(recipe.tagline, color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RatingStars(recipe.ratingAvg, size = 14.dp)
                    Text("  ${recipe.authorName} • ${QuantityFormat.minutes(recipe.totalMinutes)}", color = Color.White, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
fun RecipeRow(
    title: String,
    list: List<Recipe>,
    favorites: Set<String>,
    kcalOf: (Recipe) -> Int,
    onOpen: (Recipe) -> Unit,
    onFav: (Recipe) -> Unit,
    onMore: (() -> Unit)? = null,
) {
    Column {
        SectionHeader(title, action = if (onMore != null) "Tümü" else null, onAction = onMore)
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(list, key = { it.id }) { r ->
                RecipeCard(r, kcalOf(r), r.id in favorites, onClick = { onOpen(r) }, onFavorite = { onFav(r) }, modifier = Modifier.width(210.dp))
            }
        }
    }
}
