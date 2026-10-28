package com.tarifpro.app.ui.screens

import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.data.local.ReportEntity
import com.tarifpro.app.domain.TurkishText
import com.tarifpro.app.ui.components.Avatar
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.MetaPill
import com.tarifpro.app.ui.components.RecipeImage
import com.tarifpro.app.ui.components.relativeTime
import com.tarifpro.app.ui.components.visibilityIcon
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun AdminScreen(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val pager = rememberPagerState { 6 }
    LaunchedEffect(Unit) { container.social.refreshAdminData() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("🛡️ Yönetici Paneli") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = { IconButton(onClick = { scope.launch { container.social.refreshAdminData() } }) { Icon(Icons.Filled.Refresh, "Yenile") } },
            )
        },
    ) { padding ->
        if (session?.isAdmin != true) {
            EmptyState("🔒", "Yetkiniz yok", "Bu bölüm yalnızca yöneticilere açıktır.", Modifier.padding(padding))
            return@Scaffold
        }
        Column(Modifier.padding(padding)) {
            ScrollableTabRow(selectedTabIndex = pager.currentPage, edgePadding = 8.dp) {
                listOf("Genel Bakış", "Şikayetler", "Tarifler", "Yorumlar", "Kullanıcılar", "Duyuru").forEachIndexed { i, t ->
                    Tab(selected = pager.currentPage == i, onClick = { scope.launch { pager.animateScrollToPage(i) } }, text = { Text(t) })
                }
            }
            HorizontalPager(pager, Modifier.weight(1f)) { page ->
                when (page) {
                    0 -> OverviewTab()
                    1 -> ReportsTab(nav)
                    2 -> RecipesModerationTab(nav)
                    3 -> CommentsModerationTab(nav)
                    4 -> UsersTab(nav)
                    else -> BroadcastTab()
                }
            }
        }
    }
}

@Composable
private fun OverviewTab() {
    val container = LocalContainer.current
    val stats by container.social.stats.collectAsStateWithLifecycle(initialValue = null)
    val sync by container.sync.status.collectAsStateWithLifecycle()
    val s = stats
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Platform istatistikleri", style = MaterialTheme.typography.titleLarge) }
        if (s != null) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("📖", "${s.recipes}", "Tarif", Modifier.weight(1f))
                    StatCard("👩‍🍳", "${s.users}", "Kullanıcı", Modifier.weight(1f))
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("💬", "${s.comments}", "Yorum", Modifier.weight(1f))
                    StatCard("✉️", "${s.messages}", "Mesaj", Modifier.weight(1f))
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("🚩", "${s.openReports}", "Açık şikayet", Modifier.weight(1f), highlight = s.openReports > 0)
                    StatCard("🙈", "${s.hiddenRecipes}", "Gizlenen tarif", Modifier.weight(1f))
                }
            }
            item {
                Card(shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Görünürlük dağılımı", style = MaterialTheme.typography.titleMedium)
                        val total = s.recipes.coerceAtLeast(1)
                        listOf(
                            "Herkese açık" to s.publicRecipes,
                            "Sadece takipçiler" to (s.recipes - s.publicRecipes - s.privateRecipes),
                            "Gizli" to s.privateRecipes,
                        ).forEach { (label, n) ->
                            Row(Modifier.padding(vertical = 4.dp)) {
                                Text(label, Modifier.weight(1f))
                                Text("$n (%${n * 100 / total})", fontWeight = FontWeight.Bold)
                            }
                            androidx.compose.material3.LinearProgressIndicator(progress = { n.toFloat() / total }, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }
        item { Text("Senkronizasyon: ${sync.message}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun StatCard(emoji: String, value: String, label: String, modifier: Modifier, highlight: Boolean = false) {
    Card(
        modifier, shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = if (highlight) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(emoji, fontSize = 24.sp)
            Text(value, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun ReportsTab(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val reports by container.social.reports.collectAsStateWithLifecycle()
    var showClosed by remember { mutableStateOf(false) }
    val list = reports.filter { showClosed || it.status == "OPEN" }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${reports.count { it.status == "OPEN" }} açık şikayet", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                FilterChip(selected = showClosed, onClick = { showClosed = !showClosed }, label = { Text("Kapananları göster") })
            }
        }
        if (list.isEmpty()) item { EmptyState("✅", "Şikayet yok", "Topluluk kurallarına uyuluyor. Harika!") }
        items(list, key = { it.id }) { r -> ReportCard(r, nav, onStatus = { st -> scope.launch { container.social.setReportStatus(r, st) } }) }
    }
}

@Composable
private fun ReportCard(r: ReportEntity, nav: NavController, onStatus: (String) -> Unit) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = if (r.status == "OPEN") MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MetaPill(null, when (r.targetType) { "RECIPE" -> "📖 Tarif"; "COMMENT" -> "💬 Yorum"; "USER" -> "👤 Kullanıcı"; else -> "✉️ Mesaj" })
                Spacer(Modifier.width(8.dp))
                Text(relativeTime(r.createdAt), style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                Text(when (r.status) { "OPEN" -> "Açık"; "RESOLVED" -> "Çözüldü"; else -> "Reddedildi" }, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(6.dp))
            Text(r.targetTitle, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("Sebep: ${r.reason}", style = MaterialTheme.typography.bodySmall)
            Text("Bildiren: ${r.reporterName}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (r.status == "OPEN") {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 8.dp)) {
                    if (r.targetType == "RECIPE") {
                        OutlinedButton(onClick = { nav.navigate("recipe/${r.targetId}") }) { Text("İncele") }
                        Button(onClick = { scope.launch { container.social.moderateRecipe(r.targetId, hidden = true) }; onStatus("RESOLVED") }) { Text("Gizle") }
                    } else {
                        Button(onClick = { onStatus("RESOLVED") }) { Text("Çözüldü") }
                    }
                    TextButton(onClick = { onStatus("DISMISSED") }) { Text("Reddet") }
                }
            }
        }
    }
}

@Composable
private fun RecipesModerationTab(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    var q by remember { mutableStateOf("") }
    var onlyHidden by remember { mutableStateOf(false) }
    val list = recipes.filter { (!onlyHidden || it.hidden) && (q.isBlank() || TurkishText.fold(it.title + " " + it.authorName).contains(TurkishText.fold(q))) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text("Tarif veya şef ara") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = onlyHidden, onClick = { onlyHidden = !onlyHidden }, label = { Text("Sadece gizlenenler") })
                AssistChip(onClick = {}, label = { Text("${list.size} tarif") })
            }
        }
        items(list, key = { it.id }) { r ->
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.clickable { nav.navigate("recipe/${r.id}") }) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    RecipeImage(r.image, Modifier.size(60.dp).clip(RoundedCornerShape(12.dp)))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${r.authorName} • ★ ${String.format("%.1f", r.ratingAvg)}", style = MaterialTheme.typography.labelSmall)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            MetaPill(visibilityIcon(r.visibility), r.visibility.label)
                            if (r.hidden) MetaPill(null, "Gizlendi", container = MaterialTheme.colorScheme.errorContainer)
                            if (r.featured) MetaPill(null, "⭐ Öne çıkan")
                        }
                    }
                    Column {
                        TextButton(onClick = { scope.launch { container.social.moderateRecipe(r.id, hidden = !r.hidden) } }) { Text(if (r.hidden) "Göster" else "Gizle") }
                        TextButton(onClick = { scope.launch { container.social.moderateRecipe(r.id, featured = !r.featured) } }) { Text(if (r.featured) "Öne çıkma" else "Öne çıkar") }
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentsModerationTab(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val comments by container.social.recentComments.collectAsStateWithLifecycle(initialValue = emptyList())
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (comments.isEmpty()) item { EmptyState("💬", "Yorum yok", "Son yorumlar burada listelenir.") }
        items(comments, key = { it.id }) { c ->
            Card(shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(c.authorName, c.authorPhoto, 30.dp)
                        Spacer(Modifier.width(8.dp))
                        Text(c.authorName, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        Text(relativeTime(c.createdAt), style = MaterialTheme.typography.labelSmall)
                    }
                    Text(c.text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 4.dp))
                    Row {
                        TextButton(onClick = { nav.navigate("recipe/${c.recipeId}?tab=3") }) { Text("Tarife git") }
                        TextButton(onClick = { scope.launch { container.social.moderateComment(c, hide = !c.hidden, delete = false) } }) { Text(if (c.hidden) "Göster" else "Gizle") }
                        TextButton(onClick = { scope.launch { container.social.moderateComment(c, hide = false, delete = true) } }) { Text("Sil", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }
}

@Composable
private fun UsersTab(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val users by container.social.users.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    var q by remember { mutableStateOf("") }
    val list = users.filter { q.isBlank() || TurkishText.fold(it.name + " " + it.email).contains(TurkishText.fold(q)) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth(), placeholder = { Text("Kullanıcı ara") }, singleLine = true) }
        items(list, key = { it.id }) { u ->
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.clickable { nav.navigate("user/${u.id}") }) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(u.name, u.photo, 44.dp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(u.name + (if (u.isAdmin) " 🛡️" else "") + (if (u.banned) " ⛔" else ""), style = MaterialTheme.typography.titleSmall)
                        Text(u.email.ifBlank { if (u.isDemo) "Demo şef" else "–" }, style = MaterialTheme.typography.labelSmall)
                    }
                    if (u.id != session?.uid) {
                        Column {
                            TextButton(onClick = { scope.launch { container.social.setUserFlags(u, banned = !u.banned) } }) { Text(if (u.banned) "Yasağı kaldır" else "Engelle", color = if (u.banned) Color.Unspecified else MaterialTheme.colorScheme.error) }
                            TextButton(onClick = { scope.launch { container.social.setUserFlags(u, admin = !u.isAdmin) } }) { Text(if (u.isAdmin) "Yöneticiliği al" else "Yönetici yap") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BroadcastTab() {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("📣 Topluluk duyurusu", style = MaterialTheme.typography.titleLarge)
        Text("Tüm kullanıcıların bildirim kutusuna gönderilir (duyuru bildirimlerini açık tutanlara anında bildirim düşer).", style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(title, { title = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Başlık") }, singleLine = true)
        OutlinedTextField(body, { body = it.take(400) }, Modifier.fillMaxWidth().height(150.dp), label = { Text("Mesaj") })
        Button(onClick = {
            val t = title
            val b = body
            title = ""; body = ""
            scope.launch {
                container.social.broadcast(t, b)
                Toast.makeText(context, "Duyuru gönderildi", Toast.LENGTH_SHORT).show()
            }
        }, enabled = title.isNotBlank() && body.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Duyuruyu gönder") }
    }
}
