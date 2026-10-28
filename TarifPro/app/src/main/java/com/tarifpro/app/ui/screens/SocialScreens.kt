package com.tarifpro.app.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.data.local.ChatEntity
import com.tarifpro.app.data.local.MessageEntity
import com.tarifpro.app.data.local.UserEntity
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.TurkishText
import com.tarifpro.app.ui.components.Avatar
import com.tarifpro.app.ui.components.EmptyState
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.RecipeCard
import com.tarifpro.app.ui.components.RecipeImage
import com.tarifpro.app.ui.components.relativeTime
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun SocialScreen(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val pager = rememberPagerState { 4 }
    val chats by container.social.chats.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val unreadDm = chats.count { it.kind == "DM" && it.lastAt > it.readAt && it.lastSenderId != session?.uid && it.lastSenderId.isNotEmpty() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Topluluk") },
                actions = {
                    IconButton(onClick = { nav.navigate("notifications") }) { Icon(Icons.Filled.Notifications, "Bildirimler") }
                    IconButton(onClick = { session?.let { nav.navigate("user/${it.uid}") } }, modifier = Modifier.semantics { contentDescription = "Profilim" }) { Avatar(session?.name ?: "", session?.photo, 30.dp) }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            TabRow(selectedTabIndex = pager.currentPage) {
                listOf("Akış", "Mesajlar", "Kanallar", "Şefler").forEachIndexed { i, t ->
                    Tab(selected = pager.currentPage == i, onClick = { scope.launch { pager.animateScrollToPage(i) } }, text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t)
                            if (i == 1 && unreadDm > 0) { Spacer(Modifier.width(4.dp)); Badge { Text("$unreadDm") } }
                        }
                    })
                }
            }
            HorizontalPager(pager, Modifier.weight(1f)) { page ->
                when (page) {
                    0 -> FeedTab(nav)
                    1 -> ChatListTab(nav, chats.filter { it.kind == "DM" }, emptyText = "Henüz mesajınız yok. \"Şefler\" sekmesinden birine mesaj gönderin.")
                    2 -> ChatListTab(nav, chats.filter { it.kind == "CHANNEL" }, emptyText = "Kanal bulunamadı.")
                    else -> ChefsTab(nav)
                }
            }
        }
    }
}

@Composable
private fun FeedTab(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val following by container.social.followingIds.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val feed = remember(recipes, following) {
        val followed = recipes.filter { it.authorId in following }.sortedByDescending { it.createdAt }
        val rest = recipes.filter { it.authorId !in following && it.authorId != session?.uid }.sortedByDescending { it.createdAt }
        followed + rest
    }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (following.isEmpty()) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                    Text(
                        "👋 Şefleri takip edin, yeni tarifleri ilk siz görün. Takip ettiklerinizin \"sadece takipçilere açık\" tarifleri de akışınıza düşer.",
                        Modifier.padding(14.dp), color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
        }
        items(feed, key = { it.id }) { r ->
            Column {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { nav.navigate("user/${r.authorId}") }.padding(bottom = 6.dp)) {
                    Avatar(r.authorName, r.authorPhoto, 32.dp)
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.authorName, style = MaterialTheme.typography.titleSmall)
                        Text("yeni tarif paylaştı • ${relativeTime(r.createdAt)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (r.authorId in following) Text("Takiptesin", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                RecipeCard(r, container.recipes.nutrition(r).perServing.kcal.toInt(), r.id in favorites, onClick = { nav.navigate("recipe/${r.id}") }, onFavorite = { scope.launch { container.recipes.toggleFavorite(r.id) } }, showAuthor = false)
            }
        }
    }
}

@Composable
private fun ChatListTab(nav: NavController, chats: List<ChatEntity>, emptyText: String) {
    val container = LocalContainer.current
    val users by container.social.users.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    if (chats.isEmpty()) {
        EmptyState("💬", "Sohbet yok", emptyText)
        return
    }
    LazyColumn {
        items(chats, key = { it.id }) { chat ->
            val title = container.social.chatTitle(chat, users)
            val partner = container.social.chatPartner(chat, users)
            val unread = chat.lastAt > chat.readAt && chat.lastSenderId != session?.uid && chat.lastSenderId.isNotEmpty()
            ListItem(
                modifier = Modifier.clickable { nav.navigate("chat/${chat.id}") },
                leadingContent = {
                    if (chat.kind == "CHANNEL") {
                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(48.dp)) {
                            Box(contentAlignment = Alignment.Center) { Text(chat.emoji, fontSize = 24.sp) }
                        }
                    } else Avatar(title, partner?.photo, 48.dp)
                },
                headlineContent = { Text(if (chat.kind == "CHANNEL") "# $title" else title, fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal) },
                supportingContent = { Text(chat.lastMessage.ifBlank { "Sohbeti başlatın 👋" }, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                trailingContent = {
                    Column(horizontalAlignment = Alignment.End) {
                        if (chat.lastAt > 0) Text(relativeTime(chat.lastAt), style = MaterialTheme.typography.labelSmall)
                        if (unread) Badge { Text("•") }
                    }
                },
            )
            HorizontalDivider()
        }
    }
}

@Composable
private fun ChefsTab(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val users by container.social.users.collectAsStateWithLifecycle()
    val following by container.social.followingIds.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    val shown = users.filter { it.id != session?.uid && !it.banned && (query.isBlank() || TurkishText.fold(it.name).contains(TurkishText.fold(query))) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), placeholder = { Text("Şef ara") }, leadingIcon = { Icon(Icons.Filled.Search, null) }, singleLine = true, shape = RoundedCornerShape(24.dp))
        }
        if (shown.isEmpty()) item { EmptyState("👩‍🍳", "Şef bulunamadı", "Bulut senkronizasyonu açıkken tüm Tarif Pro kullanıcıları burada listelenir.") }
        items(shown, key = { it.id }) { u ->
            val isFollowing = u.id in following
            Card(onClick = { nav.navigate("user/${u.id}") }, shape = RoundedCornerShape(20.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(u.name, u.photo, 52.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(u.name + if (u.isDemo) " ✨" else "", style = MaterialTheme.typography.titleMedium)
                        Text(u.bio, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${u.followers + if (isFollowing && u.isDemo) 1 else 0} takipçi", style = MaterialTheme.typography.labelSmall)
                    }
                    if (isFollowing) OutlinedButton(onClick = { scope.launch { container.social.toggleFollow(u.id) } }) { Text("Takipte") }
                    else Button(onClick = { scope.launch { container.social.toggleFollow(u.id) } }) { Text("Takip et") }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ChatScreen(nav: NavController, chatId: String) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val chat by remember(chatId) { container.social.chat(chatId) }.collectAsStateWithLifecycle(initialValue = null)
    val messages by remember(chatId) { container.social.messages(chatId) }.collectAsStateWithLifecycle(initialValue = emptyList())
    val users by container.social.users.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    var text by remember { mutableStateOf("") }
    var pickRecipe by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<MessageEntity?>(null) }
    val listState = rememberLazyListState()

    DisposableEffect(chatId) {
        container.sync.activeChatId = chatId
        val stop = container.sync.listenMessages(chatId)
        onDispose {
            container.sync.activeChatId = null
            stop()
        }
    }
    LaunchedEffect(messages.size) {
        container.social.markRead(chatId)
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }
    val c = chat
    val title = c?.let { container.social.chatTitle(it, users) } ?: "Sohbet"
    val partner = c?.let { container.social.chatPartner(it, users) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(enabled = partner != null) { partner?.let { nav.navigate("user/${it.id}") } }) {
                        if (c?.kind == "CHANNEL") Text(c?.emoji ?: "💬", fontSize = 26.sp) else Avatar(title, partner?.photo, 36.dp)
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(if (c?.kind == "CHANNEL") "# $title" else title, style = MaterialTheme.typography.titleMedium)
                            Text(if (c?.kind == "CHANNEL") "Topluluk kanalı" else "Özel sohbet", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().imePadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { pickRecipe = true }) { Icon(Icons.Filled.MenuBook, "Tarif kartı ekle") }
                    OutlinedTextField(text, { text = it.take(2000) }, Modifier.weight(1f), placeholder = { Text("Mesaj yazın…") }, maxLines = 4, shape = RoundedCornerShape(24.dp))
                    IconButton(onClick = {
                        val t = text
                        text = ""
                        scope.launch { container.social.send(chatId, t) }
                    }, enabled = text.isNotBlank()) { Icon(Icons.AutoMirrored.Filled.Send, "Gönder", tint = MaterialTheme.colorScheme.primary) }
                }
            }
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).fillMaxSize(), state = listState, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (messages.isEmpty()) item { EmptyState("👋", "Sohbeti başlatın", "Mesaj yazabilir veya 📖 simgesiyle bir tarif kartı gönderebilirsiniz.") }
            items(messages, key = { it.id }) { m ->
                val mine = m.senderId == session?.uid
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    if (!mine) {
                        Avatar(m.senderName, m.senderPhoto, 28.dp, Modifier.clickable { nav.navigate("user/${m.senderId}") })
                        Spacer(Modifier.width(6.dp))
                    }
                    Surface(
                        shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = if (mine) 18.dp else 4.dp, bottomEnd = if (mine) 4.dp else 18.dp),
                        color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
                        modifier = Modifier.widthIn(max = 290.dp).combinedClickable(
                            onClick = { m.recipeId?.let { nav.navigate("recipe/$it") } },
                            onLongClick = { if (mine || session?.isAdmin == true) deleteTarget = m },
                        ),
                    ) {
                        Column(Modifier.padding(10.dp)) {
                            if (!mine && c?.kind == "CHANNEL") Text(m.senderName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                            if (m.recipeId != null) {
                                Card(shape = RoundedCornerShape(14.dp), modifier = Modifier.width(240.dp)) {
                                    RecipeImage(m.recipeImage, Modifier.fillMaxWidth().aspectRatio(16f / 10f))
                                    Column(Modifier.padding(8.dp)) {
                                        Text("📖 Tarif kartı", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                        Text(m.recipeTitle ?: "Tarif", style = MaterialTheme.typography.titleSmall)
                                        Text("Açmak için dokunun", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                            if (m.text.isNotBlank()) Text(m.text, color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                            Text(
                                relativeTime(m.createdAt) + if (mine && m.dirty) " • gönderiliyor" else "",
                                style = MaterialTheme.typography.labelSmall,
                                color = (if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant).copy(alpha = 0.7f),
                            )
                        }
                    }
                }
            }
        }
    }

    if (pickRecipe) {
        RecipePickerSheet(onDismiss = { pickRecipe = false }) { r ->
            pickRecipe = false
            scope.launch { container.social.send(chatId, text, r); text = "" }
        }
    }
    deleteTarget?.let { m ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Mesaj silinsin mi?") },
            confirmButton = { TextButton(onClick = { scope.launch { container.social.deleteMessage(m) }; deleteTarget = null }) { Text("Sil") } },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("Vazgeç") } },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipePickerSheet(onDismiss: () -> Unit, onPick: (Recipe) -> Unit) {
    val container = LocalContainer.current
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    var q by remember { mutableStateOf("") }
    val list = recipes.filter { q.isBlank() || TurkishText.fold(it.title).contains(TurkishText.fold(q)) }
        .sortedByDescending { (if (it.authorId == session?.uid) 2 else 0) + (if (it.id in favorites) 1 else 0) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text("Tarif kartı gönder", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth().padding(vertical = 8.dp), placeholder = { Text("Tarif ara") }, singleLine = true)
            LazyColumn(Modifier.height(420.dp)) {
                items(list, key = { it.id }) { r ->
                    ListItem(
                        modifier = Modifier.clickable { onPick(r) },
                        leadingContent = { RecipeImage(r.image, Modifier.size(52.dp).clip(RoundedCornerShape(12.dp))) },
                        headlineContent = { Text(r.title) },
                        supportingContent = { Text(r.authorName + if (r.id in favorites) " • ❤️" else "") },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareToChatScreen(nav: NavController, recipeId: String) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val chats by container.social.chats.collectAsStateWithLifecycle()
    val users by container.social.users.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    var note by remember { mutableStateOf("") }
    fun sendTo(chatId: String) {
        scope.launch {
            val r = container.recipes.get(recipeId) ?: return@launch
            container.social.send(chatId, note, r)
            nav.popBackStack()
            nav.navigate("chat/$chatId")
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Sohbette gönder") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding)) {
            item { OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth().padding(16.dp), label = { Text("Not ekle (isteğe bağlı)") }) }
            item { Text("Sohbetler ve kanallar", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(horizontal = 16.dp)) }
            items(chats, key = { it.id }) { chat ->
                ListItem(
                    modifier = Modifier.clickable { sendTo(chat.id) },
                    leadingContent = { if (chat.kind == "CHANNEL") Text(chat.emoji, fontSize = 26.sp) else Avatar(container.social.chatTitle(chat, users), container.social.chatPartner(chat, users)?.photo, 40.dp) },
                    headlineContent = { Text(container.social.chatTitle(chat, users)) },
                )
            }
            item { Text("Şefler", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(16.dp)) }
            items(users.filter { it.id != session?.uid }, key = { "u" + it.id }) { u ->
                ListItem(
                    modifier = Modifier.clickable { scope.launch { val id = container.social.openDm(u); sendTo(id) } },
                    leadingContent = { Avatar(u.name, u.photo, 40.dp) },
                    headlineContent = { Text(u.name) },
                    supportingContent = { Text("Özel mesaj olarak gönder") },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(nav: NavController, userId: String) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val user by remember(userId) { container.social.user(userId) }.collectAsStateWithLifecycle(initialValue = null)
    val recipes by container.recipes.visibleRecipes.collectAsStateWithLifecycle()
    val favorites by container.recipes.favoriteIds.collectAsStateWithLifecycle()
    val following by container.social.followingIds.collectAsStateWithLifecycle()
    val followers by remember(userId) { container.social.followerCount(userId) }.collectAsStateWithLifecycle(initialValue = 0)
    val followingCount by remember(userId) { container.social.followingCount(userId) }.collectAsStateWithLifecycle(initialValue = 0)
    val isMe = userId == session?.uid
    val list = recipes.filter { it.authorId == userId }.sortedByDescending { it.createdAt }
    val name = user?.name ?: list.firstOrNull()?.authorName ?: (if (isMe) session?.name else null) ?: "Şef"
    val photo = user?.photo ?: if (isMe) session?.photo else null
    var editing by remember { mutableStateOf(false) }
    val avgRating = list.filter { it.ratingCount > 0 }.map { it.ratingAvg }.average().takeIf { !it.isNaN() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isMe) "Profilim" else name) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = {
                    if (isMe) {
                        if (session?.isAdmin == true) IconButton(onClick = { nav.navigate("admin") }) { Icon(Icons.Filled.AdminPanelSettings, "Yönetici paneli") }
                        IconButton(onClick = { nav.navigate("settings") }) { Icon(Icons.Filled.Settings, "Ayarlar") }
                    }
                },
            )
        },
    ) { padding ->
        LazyVerticalGrid(
            GridCells.Adaptive(170.dp), Modifier.padding(padding), contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Avatar(name, photo, 96.dp)
                    Spacer(Modifier.height(8.dp))
                    Text(name, style = MaterialTheme.typography.headlineSmall)
                    if (user?.isAdmin == true) Text("🛡️ Yönetici", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    user?.bio?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp)) }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        Stat("${list.size}", "Tarif")
                        Stat("${followers + if (!isMe && userId in following && (user?.isDemo == true)) 1 else 0}", "Takipçi")
                        Stat("$followingCount", "Takip")
                        Stat(avgRating?.let { String.format("%.1f★", it) } ?: "–", "Ort. puan")
                    }
                    Spacer(Modifier.height(12.dp))
                    if (isMe) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { editing = true }) { Icon(Icons.Filled.Edit, null, Modifier.size(16.dp)); Text(" Profili düzenle") }
                            Button(onClick = { nav.navigate("editor") }) { Text("+ Tarif ekle") }
                        }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val isFollowing = userId in following
                            if (isFollowing) OutlinedButton(onClick = { scope.launch { container.social.toggleFollow(userId) } }) { Text("Takiptesin ✓") }
                            else Button(onClick = { scope.launch { container.social.toggleFollow(userId) } }) { Text("Takip et") }
                            OutlinedButton(onClick = {
                                val u = user ?: UserEntity(userId, name, "", photo, "", false, false, false, 0, 0, 0)
                                scope.launch { nav.navigate("chat/${container.social.openDm(u)}") }
                            }) { Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(16.dp)); Text(" Mesaj") }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    HorizontalDivider()
                }
            }
            if (list.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    EmptyState("🍳", if (isMe) "Henüz tarif eklemediniz" else "Görünür tarif yok", if (isMe) "Fotoğraflı ilk tarifinizi ekleyin." else "Bu şefin tarifleri gizli veya sadece takipçilerine açık olabilir.")
                }
            }
            items(list.size) { i ->
                val r = list[i]
                RecipeCard(r, container.recipes.nutrition(r).perServing.kcal.toInt(), r.id in favorites, onClick = { nav.navigate("recipe/${r.id}") }, onFavorite = { scope.launch { container.recipes.toggleFavorite(r.id) } }, showAuthor = false)
            }
        }
    }
    if (editing) EditProfileDialog(onDismiss = { editing = false })
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EditProfileDialog(onDismiss: () -> Unit) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val session = container.sessionStore.current ?: return
    val existing by remember { container.social.user(session.uid) }.collectAsStateWithLifecycle(initialValue = null)
    var name by remember { mutableStateOf(session.name) }
    var bio by remember(existing) { mutableStateOf(existing?.bio ?: "") }
    var photo by remember { mutableStateOf(session.photo) }
    val gallery = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { photo = container.images.importImage(uri, 512) ?: photo }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Profili düzenle") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box {
                    Avatar(name, photo, 84.dp)
                    IconButton(onClick = { gallery.launch(androidx.activity.result.PickVisualMediaRequest(androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia.ImageOnly)) }, modifier = Modifier.align(Alignment.BottomEnd)) {
                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary) { Icon(Icons.Filled.PhotoCamera, "Fotoğraf", tint = Color.White, modifier = Modifier.padding(6.dp).size(16.dp)) }
                    }
                }
                OutlinedTextField(name, { name = it.take(40) }, label = { Text("Ad") }, singleLine = true)
                OutlinedTextField(bio, { bio = it.take(160) }, label = { Text("Hakkımda") })
            }
        },
        confirmButton = { Button(onClick = { scope.launch { container.auth.updateProfile(name, bio, photo) }; onDismiss() }) { Text("Kaydet") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(nav: NavController) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    val list by container.social.notifications.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(1500); container.social.markAllNotificationsRead() }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Bildirimler") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = {
                    IconButton(onClick = { scope.launch { container.social.markAllNotificationsRead() } }) { Icon(Icons.Filled.DoneAll, "Tümünü okundu yap") }
                    IconButton(onClick = { nav.navigate("settings") }) { Icon(Icons.Filled.Settings, "Bildirim ayarları") }
                },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding)) {
            if (list.isEmpty()) item { EmptyState("🔔", "Bildirim yok", "Yorumlar, puanlar, takipçiler ve mesajlar burada görünür. Ayarlardan hangi bildirimleri alacağınızı seçebilirsiniz.") }
            items(list, key = { it.id }) { n ->
                ListItem(
                    modifier = Modifier.clickable { n.route?.let { r -> try { nav.navigate(r) } catch (e: Exception) { } } },
                    headlineContent = { Text(n.title, fontWeight = if (n.read) FontWeight.Normal else FontWeight.Bold) },
                    supportingContent = { Text(n.body, maxLines = 3, overflow = TextOverflow.Ellipsis) },
                    trailingContent = { Text(relativeTime(n.createdAt), style = MaterialTheme.typography.labelSmall) },
                    leadingContent = { if (!n.read) Badge() },
                )
                HorizontalDivider()
            }
        }
    }
}
