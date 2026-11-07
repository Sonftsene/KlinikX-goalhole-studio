package com.atomik.kocu.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atomik.kocu.content.Insights
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Habit
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.LogStatus
import com.atomik.kocu.data.MoodEntry
import com.atomik.kocu.data.Profile
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Coach
import com.atomik.kocu.domain.Plan
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.components.AtomCore
import com.atomik.kocu.ui.components.BarMeter
import com.atomik.kocu.ui.components.CinemaBackground
import com.atomik.kocu.ui.components.Electron
import com.atomik.kocu.ui.components.EmojiBadge
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.ParticleBurst
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.ScrambleText
import com.atomik.kocu.ui.components.SectionTitle
import com.atomik.kocu.ui.components.rememberHaptic
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay

val MoodFaces = listOf("😞", "😕", "😐", "🙂", "😄")

fun trailerReady(p: Profile, s: Stats): Boolean {
    val last = p.lastTrailerDay
    return if (last == null) s.dayIndex(p) >= 7 else s.today - last >= 7
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeTab() {
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val s = remember(d) { Stats(d) }
    val nav = LocalNav.current
    val haptic = rememberHaptic()
    val habits = s.habitsOf(p.id)
    val todays = habits.filter { Dates.isScheduled(it, s.today) }
    val resting = habits.filterNot { Dates.isScheduled(it, s.today) }
    val (done, total) = s.dayProgress(todays)
    val votes = s.votes(p.id)
    val dayIdx = s.dayIndex(p)
    val chapter = Chapters.current(dayIdx, votes)
    val next = Chapters.next(dayIdx, votes)
    val unseen = Chapters.all.firstOrNull { Chapters.unlocked(it, dayIdx, votes) && it.id !in p.seenChapters }
    val missed = s.missedYesterday(habits)
    val note = remember(d) { Coach.top(d, p, s) }

    var burst by remember { mutableIntStateOf(0) }
    var burstColor by remember { mutableStateOf(Cine.Gold) }
    var flash by remember { mutableStateOf<String?>(null) }
    var sheet by remember { mutableStateOf<Habit?>(null) }

    fun celebrate(h: Habit) {
        haptic()
        burstColor = Cine.habit(h.colorIndex)
        burst++
        flash = h.identity.ifBlank { p.identities.firstOrNull() ?: "Kimliğine bir oy" }
    }

    LaunchedEffect(flash) { if (flash != null) { delay(1900); flash = null } }

    CinemaBackground(accent = if (total > 0 && done == total) Cine.Gold else Cine.Violet) {
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 8.dp, bottom = 150.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    EmojiBadge(p.avatar, Cine.Gold, size = 44.dp, modifier = Modifier.clickable { nav.go("profile") })
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Kicker("Gün $dayIdx · ${chapter?.label ?: "Prolog"}")
                        Text(chapter?.title ?: "Uyanış", style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
                    }
                    if (trailerReady(p, s)) PulsingIcon("🎬") { nav.go("trailer") }
                }
            }
            item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    AtomCore(
                        progress = if (total == 0) 1f else done.toFloat() / total,
                        electrons = todays.map { Electron(Cine.habit(it.colorIndex), s.completed(it, s.today)) }.ifEmpty { listOf(Electron(Cine.Gold, true)) },
                        size = 270.dp,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(if (total == 0) "☾" else "$done/$total", fontSize = 34.sp, fontWeight = FontWeight.Black, color = Cine.Ink, fontFamily = Cine.Serif)
                            Text(if (total == 0) "DİNLENME" else "SAHNE", fontSize = 9.sp, letterSpacing = 3.sp, fontWeight = FontWeight.Bold, color = Cine.Ink.copy(alpha = 0.7f))
                        }
                    }
                    Text(p.identities.firstOrNull() ?: "", style = MaterialTheme.typography.titleMedium, color = Cine.Gold, fontStyle = FontStyle.Italic, textAlign = TextAlign.Center)
                    Text("$votes kimlik oyu · ${Dates.long(s.today)}", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                }
            }

            if (unseen != null) item {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Gold, onClick = { nav.go("chapter/${unseen.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PulsingIcon("🔓") { nav.go("chapter/${unseen.id}") }
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Kicker("Yeni bölüm açıldı · ${unseen.label}")
                            ScrambleText(unseen.title, revealed = false, style = MaterialTheme.typography.titleLarge)
                            Text("Perdeyi kaldırmak için dokun", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                        }
                    }
                }
            }

            if (missed.isNotEmpty() && done < total) item {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Ember) {
                    Kicker("Kırılma noktası", Cine.Ember)
                    Text("Dün ${missed.size} sahne kaçtı. Kural tek: asla iki kez kaçırma.", color = Cine.Text, style = MaterialTheme.typography.bodyLarge)
                    Text("Bugün sadece mini versiyonu yapman bile zinciri kurtarır.", color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
                    if (p.freezeTokens > 0) {
                        Spacer(Modifier.height(10.dp))
                        PrimaryButton("❄️ Dünü dondur (${p.freezeTokens} hak)", {
                            haptic(); Store.useFreeze(p.id, missed.map { it.id }, s.today - 1)
                        }, Modifier.fillMaxWidth(), colors = listOf(Cine.Teal, Cine.Sky))
                    }
                }
            }

            if (trailerReady(p, s)) item {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Rose, onClick = { nav.go("trailer") }) {
                    Kicker("Yeni fragman", Cine.Rose)
                    Text("Bu haftanın fragmanı hazır 🎬", style = MaterialTheme.typography.titleLarge, color = Cine.Text)
                    Text("Son 7 gününün sinematik özeti. 40 saniye.", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                }
            }

            item {
                SectionTitle("Bugünün sahneleri", if (todays.isEmpty()) "Sahne boş" else "${todays.size} çekim") {
                    Text(
                        "+ Sahne", color = Cine.Ink, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(Brush.linearGradient(listOf(Cine.Gold, Cine.Amber)))
                            .clickable { nav.go("habit_new") }.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
            if (habits.isEmpty()) item {
                GlassCard(Modifier.fillMaxWidth(), onClick = { nav.go("habit_new") }) {
                    Text("Henüz oyuncu yok. İlk küçük sahneni ekle →", color = Cine.Text)
                }
            }
            items(todays, key = { it.id }) { h ->
                HabitRow(h, s, onCheck = {
                    val was = s.completed(h, s.today)
                    val log = s.log(h.id, s.today)
                    Store.tap(h, s.today)
                    val willComplete = !was && (h.target <= 1 || h.kind == HabitKind.BREAK || (log?.amount ?: 0) + 1 >= h.target)
                    if (willComplete) celebrate(h) else haptic()
                }, onOpen = { nav.go("habit/${h.id}") }, onLong = { haptic(); sheet = h }, onSos = { nav.go("urge/${h.id}") })
            }
            if (resting.isNotEmpty()) item {
                Text("Bugün dinlenen: " + resting.joinToString(" · ") { it.emoji + " " + it.title }, style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(horizontal = 4.dp))
            }

            item {
                GlassCard(Modifier.fillMaxWidth().padding(top = 8.dp), accent = if (note.urgent) Cine.Ember else Cine.Violet, onClick = note.route?.let { r -> { nav.go(r) } }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("🎬", fontSize = 22.sp)
                        Spacer(Modifier.width(10.dp))
                        Kicker("Yönetmen · " + note.title, if (note.urgent) Cine.Ember else Cine.Violet, Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(note.text, style = MaterialTheme.typography.bodyMedium, color = Cine.Text)
                    note.action?.let { Text("$it ›", color = Cine.Gold, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
                }
            }

            item { SecretFileCard(p, done, total) }

            if (d.moods.none { it.profileId == p.id && it.day == s.today }) item {
                GlassCard(Modifier.fillMaxWidth()) {
                    Kicker("Bugün nasılsın?", Cine.Teal)
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        MoodFaces.forEachIndexed { i, f ->
                            Text(f, fontSize = 32.sp, modifier = Modifier.clip(CircleShape).clickable {
                                haptic(); Store.addMood(MoodEntry(Store.newId(), p.id, s.today, mood = i + 1))
                            }.padding(6.dp))
                        }
                    }
                    Text("Tek dokunuş yeter. Ayrıntılar Denge sekmesinde.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
                }
            }

            if (next != null) item {
                GlassCard(Modifier.fillMaxWidth(), onClick = { nav.go("journey") }) {
                    Kicker("Sıradaki · ${next.label}", Cine.Dim)
                    ScrambleText(next.title, revealed = false, style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
                    Text(next.teaser, style = MaterialTheme.typography.bodyMedium, color = Cine.Dim, fontStyle = FontStyle.Italic)
                    Spacer(Modifier.height(10.dp))
                    BarMeter(minOf(dayIdx.toFloat() / next.day, votes.toFloat() / next.votes), color = Cine.Violet)
                    Spacer(Modifier.height(6.dp))
                    val dayLeft = maxOf(0, next.day - dayIdx); val voteLeft = maxOf(0, next.votes - votes)
                    Text(listOfNotNull(if (dayLeft > 0) "⏳ $dayLeft gün" else null, if (voteLeft > 0) "🗳️ $voteLeft oy" else null).joinToString(" · ") + " sonra açılır", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
                }
            }

            d.capsules.filter { it.profileId == p.id && !it.opened }.minByOrNull { it.openDay }?.let { c ->
                item {
                    GlassCard(Modifier.fillMaxWidth(), accent = Cine.Teal, onClick = { nav.go("capsule") }) {
                        Kicker("Zaman kapsülü", Cine.Teal)
                        val left = c.openDay - s.today
                        Text(if (left <= 0) "Mühür çözüldü. Geçmişteki sen konuşmak istiyor. ✉️" else "Geleceğe gönderdiğin mektup $left gün sonra açılacak.", color = Cine.Text)
                    }
                }
            }
        }

        ParticleBurst(burst, burstColor)
        AnimatedVisibility(flash != null, enter = fadeIn() + scaleIn(initialScale = 0.8f), exit = fadeOut(), modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 120.dp)) {
            Column(
                Modifier.clip(RoundedCornerShape(20.dp)).background(Cine.Ink.copy(alpha = 0.85f)).border(1.dp, Cine.Gold.copy(alpha = 0.5f), RoundedCornerShape(20.dp)).padding(horizontal = 22.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("+1 OY", color = Cine.Gold, fontWeight = FontWeight.Black, fontSize = 22.sp, letterSpacing = 4.sp)
                Text(flash ?: "", color = Cine.Text, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            }
        }
    }

    sheet?.let { h ->
        ModalBottomSheet(onDismissRequest = { sheet = null }, containerColor = Cine.SurfaceHi) {
            HabitActionsSheet(h, s) { sheet = null }
        }
    }
}

@Composable
fun PulsingIcon(icon: String, onClick: () -> Unit) {
    val inf = rememberInfiniteTransition(label = "pi")
    val sc by inf.animateFloat(0.9f, 1.15f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "pis")
    Text(icon, fontSize = 26.sp, modifier = Modifier.scale(sc).clip(CircleShape).clickable { onClick() }.padding(6.dp))
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun HabitRow(h: Habit, s: Stats, onCheck: () -> Unit, onOpen: () -> Unit, onLong: () -> Unit, onSos: () -> Unit) {
    val color = Cine.habit(h.colorIndex)
    val done = s.completed(h, s.today)
    val log = s.log(h.id, s.today)
    val streak = s.streak(h)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))
            .background(if (done) color.copy(alpha = 0.12f) else Cine.SurfaceHi.copy(alpha = 0.85f))
            .border(1.dp, if (done) color.copy(alpha = 0.5f) else Cine.Stroke, RoundedCornerShape(22.dp))
            .combinedClickable(onClick = onOpen, onLongClick = onLong)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EmojiBadge(h.emoji, color)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(h.title, style = MaterialTheme.typography.titleMedium, color = if (done) Cine.Text.copy(alpha = 0.75f) else Cine.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val sub = when {
                h.kind == HabitKind.BREAK -> "Gölge · son kaymadan beri ${s.daysSinceSlip(h)} gün"
                log?.status == LogStatus.TINY -> "⚡ Mini versiyon çekildi"
                log?.status == LogStatus.FREEZE -> "❄️ Donduruldu"
                log?.status == LogStatus.SKIP -> "⏭️ Bilinçli atlandı"
                h.anchor.isNotBlank() -> h.anchor
                else -> h.cue
            }
            Text(sub, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (h.target > 1 && h.kind == HabitKind.BUILD) {
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BarMeter((log?.amount ?: 0).toFloat() / h.target, Modifier.weight(1f), color)
                    Spacer(Modifier.width(8.dp))
                    Text("${log?.amount ?: 0}/${h.target} ${h.unit}", style = MaterialTheme.typography.bodySmall, color = color)
                }
            }
        }
        if (streak > 0) Text("🔥$streak", style = MaterialTheme.typography.bodySmall, color = Cine.Amber, modifier = Modifier.padding(horizontal = 6.dp))
        if (h.kind == HabitKind.BREAK && !done) {
            Text("SOS", fontSize = 11.sp, fontWeight = FontWeight.Black, color = Cine.Ember, modifier = Modifier.clip(RoundedCornerShape(50)).border(1.dp, Cine.Ember, RoundedCornerShape(50)).clickable { onSos() }.padding(horizontal = 8.dp, vertical = 5.dp))
            Spacer(Modifier.width(6.dp))
        }
        Box(
            Modifier.size(44.dp).clip(CircleShape)
                .background(if (done) color else Color.Transparent)
                .border(2.dp, color.copy(alpha = if (done) 1f else 0.6f), CircleShape)
                .clickable { onCheck() },
            contentAlignment = Alignment.Center,
        ) {
            Text(if (done) "✓" else if (h.target > 1 && h.kind == HabitKind.BUILD) "+" else "", color = if (done) Cine.Ink else color, fontWeight = FontWeight.Black, fontSize = 20.sp)
        }
    }
}

@Composable
fun HabitActionsSheet(h: Habit, s: Stats, close: () -> Unit) {
    val nav = LocalNav.current
    val haptic = rememberHaptic()
    val log = s.log(h.id, s.today)
    Column(Modifier.fillMaxWidth().padding(horizontal = 22.dp).padding(bottom = 32.dp)) {
        Text("${h.emoji} ${h.title}", style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
        val sentence = Plan.sentence(h.anchor, h.tinyVersion, h.identity)
        if (sentence.isNotBlank()) Text(sentence, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
        @Composable
        fun action(icon: String, label: String, sub: String? = null, color: Color = Cine.Text, onClick: () -> Unit) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { haptic(); onClick(); close() }.padding(vertical = 12.dp, horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(icon, fontSize = 22.sp, modifier = Modifier.width(36.dp))
                Column {
                    Text(label, color = color, style = MaterialTheme.typography.titleMedium)
                    if (sub != null) Text(sub, color = Cine.Faint, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (h.kind == HabitKind.BUILD) {
            action("✓", "Tamamen yaptım", if (h.target > 1) "${h.target} ${h.unit}" else null, Cine.Gold) { Store.log(h.id, s.today, LogStatus.DONE, h.target) }
            action("⚡", "Mini versiyonu yaptım", h.tinyVersion.ifBlank { "2 dakikalık versiyon" }) { Store.log(h.id, s.today, LogStatus.TINY) }
        } else {
            action("✓", "Bugün temiz kaldım", null, Cine.Gold) { Store.log(h.id, s.today, LogStatus.DONE) }
            action("🌊", "Dürtü geldi · SOS", "10 dakikalık dalga sörfü") { nav.go("urge/${h.id}") }
            action("🤗", "Kaydım", "Dürüstlük de bir oydur. Yarın yeni bir sahne.", Cine.Ember) { Store.log(h.id, s.today, LogStatus.SLIP) }
        }
        action("⏭️", "Bilinçli atla", "Hastalık, izin… Seri bozulmaz, sayılmaz.") { Store.log(h.id, s.today, LogStatus.SKIP) }
        if (log != null) action("↺", "Bugünün kaydını sil") { Store.clearLog(h.id, s.today) }
        action("📊", "Detay ve istatistik") { nav.go("habit/${h.id}") }
        action("✏️", "Senaryoyu düzenle") { nav.go("habit_edit/${h.id}") }
    }
}

object Mystery {
    private val weights = mapOf(
        com.atomik.kocu.content.Rarity.COMMON to 60,
        com.atomik.kocu.content.Rarity.RARE to 25,
        com.atomik.kocu.content.Rarity.EPIC to 12,
        com.atomik.kocu.content.Rarity.LEGENDARY to 3,
    )

    fun pick(p: Profile): com.atomik.kocu.content.InsightCard {
        val pool = Insights.cards.filterNot { it.id in p.revealedCards }.ifEmpty { Insights.cards }
        val total = pool.sumOf { weights[it.rarity] ?: 1 }
        var r = kotlin.random.Random.nextInt(total)
        for (c in pool) { r -= weights[c.rarity] ?: 1; if (r < 0) return c }
        return pool.first()
    }

    fun rarityColor(r: com.atomik.kocu.content.Rarity) = when (r) {
        com.atomik.kocu.content.Rarity.COMMON -> Cine.Dim
        com.atomik.kocu.content.Rarity.RARE -> Cine.Sky
        com.atomik.kocu.content.Rarity.EPIC -> Cine.Violet
        com.atomik.kocu.content.Rarity.LEGENDARY -> Cine.Gold
    }
}

@Composable
private fun SecretFileCard(p: Profile, done: Int, total: Int) {
    val nav = LocalNav.current
    val haptic = rememberHaptic()
    val today = Dates.today()
    val openedToday = p.lastRevealDay == today
    val ready = total == 0 || done >= total
    val inf = rememberInfiniteTransition(label = "sf")
    val glow by inf.animateFloat(0.3f, 1f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "sfg")
    GlassCard(
        Modifier.fillMaxWidth(),
        accent = if (ready && !openedToday) Cine.Gold.copy(alpha = glow) else Cine.Stroke,
        onClick = {
            when {
                openedToday -> p.revealedCards.lastOrNull()?.let { nav.go("card/$it") }
                ready -> {
                    haptic()
                    val c = Mystery.pick(p)
                    Store.updateProfile(p.id) { it.copy(revealedCards = (it.revealedCards - c.id) + c.id, lastRevealDay = today) }
                    nav.go("card/${c.id}")
                }
                else -> Unit
            }
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (openedToday) "📂" else if (ready) "✉️" else "🔒", fontSize = 30.sp, modifier = Modifier.alpha(if (ready) 1f else 0.6f))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Kicker("Gizli dosya · ${p.revealedCards.size}/${Insights.cards.size}", if (ready) Cine.Gold else Cine.Dim)
                when {
                    openedToday -> {
                        val c = Insights.cards.firstOrNull { it.id == p.revealedCards.lastOrNull() }
                        Text(c?.title ?: "Bugünün dosyası", style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                        Text("Yarın yeni bir mühür. Arşivini Yolculuk'ta topla.", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                    }
                    ready -> {
                        Text("Mühür çözüldü. Dosyayı aç.", style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                        Text("İçinde ne olduğunu bilmiyoruz. Nadir olabilir…", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                    }
                    else -> {
                        ScrambleText("SINIFLANDIRILMIŞ BELGE", false, style = MaterialTheme.typography.titleMedium, color = Cine.Faint)
                        Text("Mührü çözmek için ${total - done} sahne daha.", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                    }
                }
            }
        }
    }
}
