package com.atomik.kocu.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atomik.kocu.content.Insights
import com.atomik.kocu.content.Rarity
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Store
import com.atomik.kocu.data.TimeCapsule
import com.atomik.kocu.domain.Chapter
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.components.BarMeter
import com.atomik.kocu.ui.components.CinemaBackground
import com.atomik.kocu.ui.components.EmojiBadge
import com.atomik.kocu.ui.components.Field
import com.atomik.kocu.ui.components.GhostButton
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.Letterbox
import com.atomik.kocu.ui.components.Pill
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.ScrambleText
import com.atomik.kocu.ui.components.SectionTitle
import com.atomik.kocu.ui.components.SubScreen
import com.atomik.kocu.ui.components.Typewriter
import com.atomik.kocu.ui.components.rememberHaptic
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay

@Composable
fun JourneyTab() {
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val s = remember(d) { Stats(d) }
    val nav = LocalNav.current
    val dayIdx = s.dayIndex(p)
    val votes = s.votes(p.id)
    val chainOpen = Chapters.unlocked(Chapters.all[2], dayIdx, votes)
    CinemaBackground(accent = Cine.Violet) {
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp, bottom = 140.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Kicker("66 günlük film")
                Text("Yolculuk", style = MaterialTheme.typography.displayMedium, color = Cine.Text)
                Spacer(Modifier.height(10.dp))
                BarMeter(minOf(1f, dayIdx / 66f), color = Cine.Gold, height = 8.dp)
                Spacer(Modifier.height(6.dp))
                Text("Gün $dayIdx / 66 · $votes oy · Araştırmalara göre otomatikleşme ortalama 66 gün sürer.", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MiniTile("🗂️", "Arşiv", "${p.revealedCards.size}/${Insights.cards.size}", Modifier.weight(1f)) { nav.go("archive") }
                    MiniTile("⏳", "Kapsül", "${d.capsules.count { it.profileId == p.id }}", Modifier.weight(1f)) { nav.go("capsule") }
                    MiniTile(if (chainOpen) "⛓️" else "🔒", "Zincir", if (chainOpen) "Harita" else "Bölüm III", Modifier.weight(1f)) { if (chainOpen) nav.go("chain") }
                    MiniTile("🎬", "Fragman", "Haftalık", Modifier.weight(1f)) { nav.go("trailer") }
                }
            }
            item { SectionTitle("Senaryo", "Bölümler") }
            items(Chapters.all, key = { it.id }) { c ->
                FilmFrame(c, Chapters.unlocked(c, dayIdx, votes), c.id in p.seenChapters, dayIdx, votes) { nav.go("chapter/${c.id}") }
            }
        }
    }
}

@Composable
private fun MiniTile(icon: String, title: String, sub: String, modifier: Modifier, onClick: () -> Unit) {
    GlassCard(modifier, onClick = onClick, padding = PaddingValues(vertical = 14.dp, horizontal = 8.dp)) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(icon, fontSize = 24.sp)
            Text(title, style = MaterialTheme.typography.labelLarge, color = Cine.Text)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = Cine.Faint, maxLines = 1)
        }
    }
}

@Composable
private fun FilmFrame(c: Chapter, unlocked: Boolean, seen: Boolean, dayIdx: Int, votes: Int, onClick: () -> Unit) {
    val accent = if (unlocked) Cine.Gold else Cine.Faint
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(10.dp)).background(Color.Black)
            .clickable(enabled = unlocked) { onClick() },
    ) {
        Sprockets()
        Column(
            Modifier.weight(1f).padding(vertical = 6.dp).clip(RoundedCornerShape(8.dp))
                .background(if (unlocked) Brush.linearGradient(listOf(Cine.SurfaceHi, Color(0xFF221A33))) else Brush.linearGradient(listOf(Cine.Surface, Cine.Surface)))
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Kicker(c.label, accent, Modifier.weight(1f))
                when {
                    !unlocked -> Text("🔒", fontSize = 14.sp)
                    !seen -> Text("YENİ", fontSize = 10.sp, color = Cine.Ink, fontWeight = FontWeight.Black, modifier = Modifier.clip(RoundedCornerShape(50)).background(Cine.Gold).padding(horizontal = 8.dp, vertical = 2.dp))
                    else -> Text("✓", color = Cine.Gold)
                }
            }
            if (unlocked) {
                Text(c.title, style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
                Text(c.power, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, modifier = Modifier.padding(top = 4.dp))
            } else {
                ScrambleText(c.title, false, style = MaterialTheme.typography.headlineSmall, color = Cine.Faint)
                Text(c.teaser, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, fontStyle = FontStyle.Italic, modifier = Modifier.padding(top = 4.dp))
                Spacer(Modifier.height(8.dp))
                BarMeter(minOf(dayIdx.toFloat() / c.day, votes.toFloat() / c.votes), color = Cine.Violet, height = 4.dp)
                Text("Gün ${c.day} · ${c.votes} oy gerekli", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(top = 4.dp))
            }
        }
        Sprockets()
    }
}

@Composable
private fun Sprockets() {
    Canvas(Modifier.width(22.dp).fillMaxHeight()) {
        val h = 10.dp.toPx(); val w = 10.dp.toPx(); val gap = 9.dp.toPx()
        var y = 6.dp.toPx()
        while (y + h < size.height) {
            drawRoundRect(Color(0xFF26232F), Offset((size.width - w) / 2, y), Size(w, h), CornerRadius(2.dp.toPx()))
            y += h + gap
        }
    }
}

@Composable
fun ChapterReveal(id: String) {
    val nav = LocalNav.current
    val c = Chapters.byId(id) ?: return
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    LaunchedEffect(id) {
        if (id !in p.seenChapters) {
            Store.updateProfile(p.id) { it.copy(seenChapters = it.seenChapters + id, freezeTokens = if (id == "ch7") minOf(5, it.freezeTokens + 1) else it.freezeTokens) }
        }
    }
    var phase by remember { mutableIntStateOf(0) }
    var titleDone by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(900); phase = 1 }
    LaunchedEffect(titleDone) {
        if (titleDone) {
            for (i in 0..c.scenes.size) { delay(if (i == 0) 500 else 1600); phase = 2 + i }
        }
    }
    CinemaBackground(accent = Cine.Gold) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 26.dp, vertical = 80.dp)
                .clickable(indication = null, interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }) { if (titleDone && phase < 2 + c.scenes.size) phase++ },
        ) {
            AnimatedVisibility(phase >= 1, enter = fadeIn(tween(1200))) {
                Kicker(c.label, Cine.Gold)
            }
            Spacer(Modifier.height(10.dp))
            if (phase >= 1) Typewriter(c.title, style = MaterialTheme.typography.displayLarge, color = Cine.Text, charDelay = 70, onDone = { titleDone = true })
            Spacer(Modifier.height(26.dp))
            c.scenes.forEachIndexed { i, scene ->
                AnimatedVisibility(phase >= 2 + i, enter = fadeIn(tween(1200)) + slideInVertically(tween(1200)) { it / 4 }) {
                    Text(scene, style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp, lineHeight = 28.sp), color = Cine.Text.copy(alpha = 0.92f), modifier = Modifier.padding(bottom = 18.dp))
                }
            }
            AnimatedVisibility(phase >= 2 + c.scenes.size, enter = fadeIn(tween(1000))) {
                Column {
                    GlassCard(Modifier.fillMaxWidth(), accent = Cine.Gold) {
                        Kicker("Açılan güç")
                        Text(c.power, style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                        Text("Bilimsel dayanak: ${c.science}", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(top = 6.dp))
                    }
                    Spacer(Modifier.height(18.dp))
                    if (c.route != null) {
                        PrimaryButton("Gücü kullan", { nav.back(); nav.go(c.route) }, Modifier.fillMaxWidth())
                        Spacer(Modifier.height(10.dp))
                    }
                    GhostButton("Sahneye dön", { nav.back() }, Modifier.fillMaxWidth())
                }
            }
        }
        Letterbox(true, height = 56.dp)
    }
}

@Composable
fun CardView(id: String) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val card = Insights.cards.firstOrNull { it.id == id } ?: return
    val color = Mystery.rarityColor(card.rarity)
    val rot = remember { Animatable(0f) }
    var flip by remember { mutableStateOf(false) }
    val haptic = rememberHaptic()
    LaunchedEffect(flip) {
        if (flip) { haptic(); rot.animateTo(180f, tween(1100, easing = FastOutSlowInEasing)) }
    }
    LaunchedEffect(Unit) { delay(1300); flip = true }
    val density = LocalDensity.current.density
    SubScreen(title = "Gizli Dosya", kicker = "#" + card.id.uppercase(), onBack = { nav.back() }, accent = color) {
        Spacer(Modifier.height(20.dp))
        Box(
            Modifier.fillMaxWidth().aspectRatio(0.72f)
                .graphicsLayer { rotationY = rot.value; cameraDistance = 14f * density }
                .clip(RoundedCornerShape(28.dp))
                .background(Brush.linearGradient(listOf(Cine.SurfaceHi, Color(0xFF1B1530), Cine.Surface)))
                .border(1.5.dp, Brush.linearGradient(listOf(color, color.copy(alpha = 0.1f), color)), RoundedCornerShape(28.dp))
                .clickable { flip = true },
        ) {
            if (rot.value <= 90f) {
                Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text("🔏", fontSize = 64.sp)
                    Spacer(Modifier.height(16.dp))
                    Kicker("Sınıflandırılmış belge", color)
                    ScrambleText("ERİŞİM İZNİ VERİLDİ", false, style = MaterialTheme.typography.titleLarge, color = Cine.Text)
                    Spacer(Modifier.height(10.dp))
                    Text(card.rarity.label.uppercase(Dates.TR), color = color, fontWeight = FontWeight.Black, letterSpacing = 4.sp)
                }
            } else {
                Column(Modifier.fillMaxSize().graphicsLayer { rotationY = 180f }.padding(24.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Kicker(card.category, color, Modifier.weight(1f))
                        Text(card.rarity.label, color = color, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(card.title, style = MaterialTheme.typography.headlineLarge, color = Cine.Text)
                    Spacer(Modifier.height(16.dp))
                    Text(card.body, style = MaterialTheme.typography.bodyLarge, color = Cine.Text.copy(alpha = 0.9f))
                    Spacer(Modifier.weight(1f))
                    Text("Kaynak: ${card.source}", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        if (rot.value > 170f) {
            PrimaryButton("Dosyayı paylaş", { ShareActions.card(context, card) }, Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            GhostButton("Arşive git", { nav.go("archive") }, Modifier.fillMaxWidth())
        } else {
            Text("Mühür çözülüyor…", color = Cine.Faint, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(30.dp))
    }
}

@Composable
fun ArchiveScreen() {
    val nav = LocalNav.current
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    CinemaBackground {
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("‹", fontSize = 30.sp, color = Cine.Text, modifier = Modifier.clickable { nav.back() }.padding(end = 14.dp))
                Column {
                    Kicker("${p.revealedCards.size}/${Insights.cards.size} dosya")
                    Text("Arşiv", style = MaterialTheme.typography.headlineMedium, color = Cine.Text)
                }
            }
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Rarity.entries.forEach { r ->
                    val total = Insights.cards.count { it.rarity == r }
                    val got = Insights.cards.count { it.rarity == r && it.id in p.revealedCards }
                    Text("${r.label} $got/$total", color = Mystery.rarityColor(r), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
            LazyVerticalGrid(
                GridCells.Fixed(2),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.navigationBarsPadding(),
            ) {
                items(Insights.cards, key = { it.id }) { c ->
                    val got = c.id in p.revealedCards
                    val col = Mystery.rarityColor(c.rarity)
                    Column(
                        Modifier.aspectRatio(0.8f).clip(RoundedCornerShape(18.dp))
                            .background(if (got) Brush.verticalGradient(listOf(col.copy(alpha = 0.18f), Cine.Surface)) else Brush.verticalGradient(listOf(Cine.Surface, Cine.Surface)))
                            .border(1.dp, if (got) col.copy(alpha = 0.6f) else Cine.Stroke, RoundedCornerShape(18.dp))
                            .clickable(enabled = got) { nav.go("card/${c.id}") }.padding(14.dp),
                    ) {
                        Text("#" + c.id.uppercase(), color = if (got) col else Cine.Faint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        if (got) {
                            Text(c.title, style = MaterialTheme.typography.titleMedium, color = Cine.Text, maxLines = 3)
                            Text(c.category, style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                        } else {
                            Text("🔒", fontSize = 26.sp, modifier = Modifier.alpha(0.5f))
                            ScrambleText("??? ???", false, style = MaterialTheme.typography.titleMedium, color = Cine.Faint)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CapsuleScreen() {
    val nav = LocalNav.current
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val today = Dates.today()
    var message by remember { mutableStateOf("") }
    var days by remember { mutableIntStateOf(66) }
    var opening by remember { mutableStateOf<TimeCapsule?>(null) }
    val haptic = rememberHaptic()
    val capsules = d.capsules.filter { it.profileId == p.id }.sortedByDescending { it.createdDay }
    SubScreen("Zaman Kapsülü", "Geleceğe mektup", { nav.back() }, accent = Cine.Teal) {
        opening?.let { c ->
            GlassCard(Modifier.fillMaxWidth(), accent = Cine.Gold) {
                Kicker("${Dates.full(c.createdDay)} tarihinden sana", Cine.Gold)
                Spacer(Modifier.height(10.dp))
                SerifTypewriter(c.message, style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp, lineHeight = 28.sp), color = Cine.Text, charDelay = 28)
            }
            Spacer(Modifier.height(16.dp))
        }
        Text("Bugünkü sen, gelecekteki sana bir mektup yazar. Mektup mühürlenir ve sadece seçtiğin gün açılabilir. Gelecekteki benliğe yakınlık hissetmek, uzun vadeli kararları güçlendirir.", style = MaterialTheme.typography.bodyMedium, color = Cine.Dim)
        Spacer(Modifier.height(14.dp))
        Field(message, { message = it.take(1200) }, "Gelecekteki sana…", singleLine = false, minLines = 4, placeholder = "Şu an neler hissediyorsun? Neyi başarmış olmayı umuyorsun?")
        Spacer(Modifier.height(10.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(30, 66, 100, 365).forEach { n -> Pill("$n gün", days == n, { days = n }, color = Cine.Teal) }
        }
        Spacer(Modifier.height(14.dp))
        PrimaryButton("🔒 Mühürle", {
            haptic()
            Store.addCapsule(TimeCapsule(Store.newId(), p.id, today, today + days, message.trim()))
            message = ""
        }, Modifier.fillMaxWidth(), enabled = message.isNotBlank(), colors = listOf(Cine.Teal, Cine.Sky))
        SectionTitle("Kapsüller", if (capsules.isEmpty()) "Henüz yok" else "${capsules.size} mektup")
        capsules.forEach { c ->
            val left = c.openDay - today
            GlassCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), accent = if (left <= 0 && !c.opened) Cine.Gold else Cine.Stroke) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (c.opened) "📜" else if (left <= 0) "✉️" else "🔒", fontSize = 26.sp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("${Dates.full(c.createdDay)} → ${Dates.full(c.openDay)}", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
                        when {
                            c.opened -> Text(c.message, color = Cine.Text, style = MaterialTheme.typography.bodyMedium)
                            left > 0 -> ScrambleText(c.message.take(40), false, style = MaterialTheme.typography.bodyMedium, color = Cine.Faint)
                            else -> Text("Mühür çözüldü", color = Cine.Gold, fontWeight = FontWeight.Bold)
                        }
                        if (!c.opened && left > 0) Text("$left gün kaldı", color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
                    }
                    if (!c.opened && left <= 0) GhostButton("Aç", { haptic(); opening = c; Store.openCapsule(c.id) }, color = Cine.Gold)
                }
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun SerifTypewriter(text: String, style: androidx.compose.ui.text.TextStyle, color: Color, charDelay: Long) =
    Typewriter(text, style = style.copy(fontFamily = Cine.Serif), color = color, charDelay = charDelay)

@Composable
fun ChainScreen() {
    val nav = LocalNav.current
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val s = remember(d) { Stats(d) }
    val habits = s.habitsOf(p.id).filter { it.kind == com.atomik.kocu.data.HabitKind.BUILD }.sortedBy { it.reminderMinute ?: (24 * 60 + it.order) }
    SubScreen("Zincir Haritası", "Bölüm III", { nav.back() }) {
        Text("Her halka bir öncekine bağlı. Hatırlamayı iradeye değil, rutine bırak. Bir halkayı uzun bas ile düzenle.", style = MaterialTheme.typography.bodyMedium, color = Cine.Dim)
        Spacer(Modifier.height(16.dp))
        habits.forEachIndexed { i, h ->
            val col = Cine.habit(h.colorIndex)
            Row {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(56.dp)) {
                    EmojiBadge(h.emoji, col, size = 50.dp)
                    if (i < habits.lastIndex) Box(Modifier.width(3.dp).height(70.dp).background(Brush.verticalGradient(listOf(col, Cine.habit(habits[i + 1].colorIndex)))))
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f).clickable { nav.go("habit_edit/${h.id}") }) {
                    Text(h.anchor.ifBlank { "Çapa yok — bağlantı ekle" }, style = MaterialTheme.typography.bodySmall, color = if (h.anchor.isBlank()) Cine.Ember else Cine.Dim)
                    Text("→ ${h.title}", style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                    h.reminderMinute?.let { Text("⏰ ${Dates.minuteLabel(it)}  ·  🔥 ${s.streak(h)}", style = MaterialTheme.typography.bodySmall, color = col) }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        PrimaryButton("+ Yeni halka ekle", { nav.go("habit_new") }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(40.dp))
    }
}
