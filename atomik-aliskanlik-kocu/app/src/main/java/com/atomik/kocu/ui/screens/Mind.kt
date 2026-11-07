package com.atomik.kocu.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atomik.kocu.data.AssessmentResult
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.MoodEntry
import com.atomik.kocu.data.Store
import com.atomik.kocu.data.ThoughtRecord
import com.atomik.kocu.data.UrgeLog
import com.atomik.kocu.data.WeightEntry
import com.atomik.kocu.domain.Assessments
import com.atomik.kocu.domain.Body
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.components.ChoiceCard
import com.atomik.kocu.ui.components.CinemaBackground
import com.atomik.kocu.ui.components.BarMeter
import com.atomik.kocu.ui.components.Disclaimer
import com.atomik.kocu.ui.components.Field
import com.atomik.kocu.ui.components.GhostButton
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.LineChart
import com.atomik.kocu.ui.components.Pill
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.SectionTitle
import com.atomik.kocu.ui.components.StatTile
import com.atomik.kocu.ui.components.SubScreen
import com.atomik.kocu.ui.components.rememberHaptic
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

@Composable
fun MindTab() {
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val nav = LocalNav.current
    val haptic = rememberHaptic()
    val today = Dates.today()
    val mood = d.moods.firstOrNull { it.profileId == p.id && it.day == today }
    CinemaBackground(accent = Cine.Rose) {
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp, bottom = 140.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Kicker("Zihin & beden", Cine.Rose)
                Text("Denge", style = MaterialTheme.typography.displayMedium, color = Cine.Text)
                Text("Kanıta dayalı araçlar. Her biri 1–10 dakika.", style = MaterialTheme.typography.bodyMedium, color = Cine.Dim)
            }
            item {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Rose, onClick = { nav.go("mood") }) {
                    Kicker("Bugünün havası", Cine.Rose)
                    Spacer(Modifier.height(8.dp))
                    if (mood == null) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            MoodFaces.forEachIndexed { i, f ->
                                Text(f, fontSize = 32.sp, modifier = Modifier.clip(CircleShape).clickable { haptic(); Store.addMood(MoodEntry(Store.newId(), p.id, today, mood = i + 1)) }.padding(6.dp))
                            }
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(MoodFaces[mood.mood - 1], fontSize = 40.sp)
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(if (mood.tags.isEmpty()) "Kaydedildi" else mood.tags.joinToString(" · "), color = Cine.Text)
                                Text(if (mood.gratitude.isEmpty()) "3 iyi şey ekle ›" else "${mood.gratitude.size} iyi şey yazıldı", color = Cine.Gold, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            item {
                val tools = listOf(
                    Triple("🌬️", "Nefes", "breath") to "Fizyolojik iç çekiş, kutu, 4-7-8",
                    Triple("🖐️", "Topraklanma", "ground") to "5-4-3-2-1 · panik anında",
                    Triple("🧠", "Düşünce kaydı", "thought") to "BDT ile zihnini yeniden çerçevele",
                    Triple("🌊", "Dürtü SOS", "urge") to "Dürtünün dalgasında sörf yap",
                    Triple("⚖️", "Beden", "body") to "Kalori, protein, su, kilo takibi",
                    Triple("🆘", "Destek", "crisis") to "Zor anlar için hatlar",
                )
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    tools.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { (t, sub) ->
                                GlassCard(Modifier.weight(1f).height(128.dp), onClick = { nav.go(t.third) }, accent = if (t.third == "crisis") Cine.Ember else Cine.Stroke) {
                                    Text(t.first, fontSize = 28.sp)
                                    Spacer(Modifier.height(6.dp))
                                    Text(t.second, style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                                    Text(sub, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, maxLines = 2)
                                }
                            }
                        }
                    }
                }
            }
            item { SectionTitle("Bilimsel taramalar", "Kendini ölç") }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Assessments.all.forEach { q ->
                        val last = d.assessments.filter { it.profileId == p.id && it.type == q.type }.maxByOrNull { it.time }
                        GlassCard(Modifier.fillMaxWidth(), onClick = { nav.go("assess/${q.type}") }) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(q.emoji, fontSize = 26.sp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(q.title, style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                                    Text(q.subtitle, style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                                }
                                if (last != null) Column(horizontalAlignment = Alignment.End) {
                                    Text("${last.score}", style = MaterialTheme.typography.titleLarge, color = Cine.Gold)
                                    Text(Assessments.band(q.type, last.score).label, style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
                                }
                            }
                        }
                    }
                }
            }
            val thoughts = d.thoughts.filter { it.profileId == p.id }.sortedByDescending { it.time }.take(3)
            if (thoughts.isNotEmpty()) {
                item { SectionTitle("Son düşünce kayıtları", "Zihin dedektifi") }
                thoughts.forEach { t ->
                    item(key = t.id) {
                        GlassCard(Modifier.fillMaxWidth()) {
                            Text("“${t.thought}”", color = Cine.Dim, fontStyle = FontStyle.Italic, style = MaterialTheme.typography.bodySmall)
                            Text("→ ${t.balanced}", color = Cine.Text, style = MaterialTheme.typography.bodyMedium)
                            Text("${t.emotion} ${t.intensityBefore} → ${t.intensityAfter}", color = Cine.Teal, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            item { Disclaimer() }
        }
    }
}

private val moodTags = listOf("Huzurlu", "Mutlu", "Enerjik", "Minnettar", "Umutlu", "Kaygılı", "Gergin", "Yorgun", "Üzgün", "Öfkeli", "Yalnız", "Sıkılmış")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MoodScreen() {
    val nav = LocalNav.current
    val d = Store.data.value
    val p = Store.activeProfile(d) ?: return
    val today = Dates.today()
    val existing = d.moods.firstOrNull { it.profileId == p.id && it.day == today }
    var mood by remember { mutableIntStateOf(existing?.mood ?: 3) }
    var energy by remember { mutableIntStateOf(existing?.energy ?: 3) }
    val tags = remember { mutableStateListOf<String>().apply { addAll(existing?.tags.orEmpty()) } }
    val g = remember { mutableStateListOf(*(existing?.gratitude.orEmpty() + List(3) { "" }).take(3).toTypedArray()) }
    var note by remember { mutableStateOf(existing?.note ?: "") }
    SubScreen("Duygu kaydı", Dates.long(today), { nav.back() }, accent = Cine.Rose) {
        Kicker("Ruh hali", Cine.Rose)
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            MoodFaces.forEachIndexed { i, f -> Text(f, fontSize = if (mood == i + 1) 44.sp else 32.sp, modifier = Modifier.clickable { mood = i + 1 }) }
        }
        Kicker("Enerji", Cine.Amber)
        Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (1..5).forEach { i -> Pill("⚡".repeat(i), energy == i, { energy = i }, color = Cine.Amber) }
        }
        Kicker("Duygular · adını koymak yoğunluğu azaltır", Cine.Dim)
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            moodTags.forEach { t -> Pill(t, t in tags, { if (t in tags) tags.remove(t) else tags.add(t) }, color = Cine.Rose) }
        }
        SectionTitle("Seligman egzersizi", "Bugün iyi giden 3 şey")
        (0..2).forEach { i -> Field(g[i], { g[i] = it }, "${i + 1}. iyi şey ve nedeni", Modifier.padding(bottom = 8.dp)) }
        Field(note, { note = it }, "Not (isteğe bağlı)", singleLine = false, minLines = 2)
        Spacer(Modifier.height(18.dp))
        PrimaryButton("Kaydet", {
            Store.addMood(MoodEntry(existing?.id ?: Store.newId(), p.id, today, mood = mood, energy = energy, tags = tags.toList(), gratitude = g.filter { it.isNotBlank() }, note = note))
            nav.back()
        }, Modifier.fillMaxWidth())
        Text("Duyguları adlandırmak (affect labeling) ve şükran yazmak iyi oluşla ilişkilidir (Lieberman 2007; Seligman 2005).", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(vertical = 16.dp))
    }
}

private data class BreathPattern(val name: String, val desc: String, val phases: List<Triple<String, Int, Float>>, val source: String)

private val patterns = listOf(
    BreathPattern("Fizyolojik iç çekiş", "Burundan iki kısa nefes, ağızdan uzun veriş. Stresi hızla düşürür.", listOf(Triple("Nefes al", 2, 0.85f), Triple("Bir daha al", 1, 1f), Triple("Yavaşça ver", 6, 0.35f)), "Balban ve ark., 2023"),
    BreathPattern("Kutu nefes", "4 al · 4 tut · 4 ver · 4 tut. Odak ve sakinlik.", listOf(Triple("Nefes al", 4, 1f), Triple("Tut", 4, 1f), Triple("Ver", 4, 0.35f), Triple("Tut", 4, 0.35f)), "Klinik gevşeme teknikleri"),
    BreathPattern("4-7-8", "Uykuya geçiş için. Uzun veriş vagus sinirini uyarır.", listOf(Triple("Nefes al", 4, 1f), Triple("Tut", 7, 1f), Triple("Ver", 8, 0.35f)), "Weil; yavaş nefes araştırmaları"),
)

@Composable
fun BreathScreen() {
    val nav = LocalNav.current
    val haptic = rememberHaptic()
    var pattern by remember { mutableIntStateOf(0) }
    var minutes by remember { mutableIntStateOf(2) }
    var running by remember { mutableStateOf(false) }
    var label by remember { mutableStateOf("Hazır") }
    var remaining by remember { mutableIntStateOf(0) }
    val scale = remember { Animatable(0.35f) }
    LaunchedEffect(running) {
        if (!running) { label = "Hazır"; scale.animateTo(0.35f, tween(600)); return@LaunchedEffect }
        val end = System.currentTimeMillis() + minutes * 60_000L
        while (isActive && System.currentTimeMillis() < end) {
            for ((l, sec, target) in patterns[pattern].phases) {
                label = l; haptic()
                remaining = ((end - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0)
                scale.animateTo(target, tween(sec * 1000, easing = LinearEasing))
            }
        }
        label = "Tamamlandı ✓"; running = false
    }
    SubScreen("Nefes", "Sinir sistemini yavaşlat", { nav.back() }, accent = Cine.Teal) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            patterns.forEachIndexed { i, pt -> Pill(pt.name, pattern == i, { if (!running) pattern = i }, color = Cine.Teal) }
        }
        Text(patterns[pattern].desc, style = MaterialTheme.typography.bodySmall, color = Cine.Dim, modifier = Modifier.padding(top = 10.dp))
        Box(Modifier.fillMaxWidth().height(330.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(280.dp).scale(scale.value).clip(CircleShape).background(Brush.radialGradient(listOf(Cine.Teal.copy(alpha = 0.7f), Cine.Violet.copy(alpha = 0.25f), Color.Transparent))))
            Box(Modifier.size(280.dp).clip(CircleShape).background(Color.Transparent))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(label, style = MaterialTheme.typography.headlineMedium, color = Cine.Text)
                if (running) Text("${remaining / 60}:${"%02d".format(remaining % 60)}", color = Cine.Dim)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(1, 2, 5).forEach { m -> Pill("$m dk", minutes == m, { if (!running) minutes = m }, color = Cine.Teal) }
        }
        Spacer(Modifier.height(16.dp))
        PrimaryButton(if (running) "Durdur" else "Başla", { running = !running }, Modifier.fillMaxWidth(), colors = listOf(Cine.Teal, Cine.Sky))
        Text("Kaynak: ${patterns[pattern].source}", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(vertical = 16.dp))
    }
}

@Composable
fun GroundScreen() {
    val nav = LocalNav.current
    val haptic = rememberHaptic()
    val steps = listOf(
        Triple(5, "👀", "Etrafında GÖREBİLDİĞİN 5 şeyi say."),
        Triple(4, "✋", "DOKUNABİLDİĞİN 4 şeyi hisset."),
        Triple(3, "👂", "DUYABİLDİĞİN 3 sesi fark et."),
        Triple(2, "👃", "KOKLAYABİLDİĞİN 2 şeyi bul."),
        Triple(1, "👅", "TADABİLDİĞİN 1 şeye odaklan."),
    )
    var step by remember { mutableIntStateOf(0) }
    var count by remember { mutableIntStateOf(0) }
    SubScreen("Topraklanma", "5-4-3-2-1", { nav.back() }, accent = Cine.Lime) {
        AnimatedContent(step, transitionSpec = { fadeIn(tween(500)) togetherWith fadeOut(tween(300)) }, label = "gr") { s ->
            Column(Modifier.fillMaxWidth().padding(vertical = 30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                if (s < steps.size) {
                    val (n, e, t) = steps[s]
                    Text(e, fontSize = 64.sp)
                    Text("$n", style = MaterialTheme.typography.displayLarge, color = Cine.Lime)
                    Text(t, style = MaterialTheme.typography.headlineSmall, color = Cine.Text, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(24.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        (0 until n).forEach { i -> Box(Modifier.size(22.dp).clip(CircleShape).background(if (i < count) Cine.Lime else Cine.Stroke)) }
                    }
                    Spacer(Modifier.height(28.dp))
                    PrimaryButton(if (count < n) "Bir tane buldum" else "Devam", {
                        haptic()
                        if (count < n) count++ else { count = 0; step++ }
                    }, Modifier.fillMaxWidth(), colors = listOf(Cine.Lime, Cine.Teal))
                } else {
                    Text("🌿", fontSize = 64.sp)
                    Text("Buradasın.", style = MaterialTheme.typography.displayMedium, color = Cine.Text)
                    Text("Şu an, bu anda. Dikkatini bedenine geri getirdin.", color = Cine.Dim, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(24.dp))
                    GhostButton("Tekrarla", { step = 0; count = 0 })
                }
            }
        }
    }
}

private val distortions = listOf(
    "Felaketleştirme", "Ya hep ya hiç", "Zihin okuma", "Falcılık", "Aşırı genelleme",
    "Etiketleme", "Olumluyu yok sayma", "-meli/-malı", "Duygusal çıkarım", "Kişiselleştirme",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ThoughtScreen() {
    val nav = LocalNav.current
    val p = Store.activeProfile() ?: return
    var situation by remember { mutableStateOf("") }
    var thought by remember { mutableStateOf("") }
    var emotion by remember { mutableStateOf("") }
    var before by remember { mutableFloatStateOf(70f) }
    val chosen = remember { mutableStateListOf<String>() }
    var forE by remember { mutableStateOf("") }
    var against by remember { mutableStateOf("") }
    var balanced by remember { mutableStateOf("") }
    var after by remember { mutableFloatStateOf(40f) }
    SubScreen("Düşünce kaydı", "Bilişsel davranışçı teknik", { nav.back() }, accent = Cine.Violet) {
        Text("Düşünceler gerçek değildir; test edilebilir hipotezlerdir. 6 adımda bir düşünceyi sorgula.", color = Cine.Dim, style = MaterialTheme.typography.bodyMedium)
        SectionTitle("1", "Ne oldu?")
        Field(situation, { situation = it }, "Durum", singleLine = false, placeholder = "Toplantıda sunumum sırasında biri esnedi")
        SectionTitle("2", "Aklından ne geçti?")
        Field(thought, { thought = it }, "Otomatik düşünce", singleLine = false, placeholder = "Herkes sıkıldı, berbat bir sunumdu")
        SectionTitle("3", "Ne hissettin?")
        Field(emotion, { emotion = it }, "Duygu", placeholder = "Utanç")
        com.atomik.kocu.ui.screens.SliderRow("Yoğunluk", "${before.roundToInt()}", before, 0f..100f) { before = it }
        SectionTitle("4", "Düşünce tuzakları")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            distortions.forEach { t -> Pill(t, t in chosen, { if (t in chosen) chosen.remove(t) else chosen.add(t) }, color = Cine.Violet) }
        }
        SectionTitle("5", "Kanıtlar")
        Field(forE, { forE = it }, "Düşünceyi destekleyen", singleLine = false)
        Spacer(Modifier.height(8.dp))
        Field(against, { against = it }, "Düşünceyi desteklemeyen", singleLine = false, placeholder = "İki kişi soru sordu, yöneticim teşekkür etti")
        SectionTitle("6", "Dengeli düşünce")
        Field(balanced, { balanced = it }, "Daha dengeli bir bakış", singleLine = false, placeholder = "Biri yorgun olabilir; sunumun bazı kısımları ilgi çekti")
        com.atomik.kocu.ui.screens.SliderRow("Şimdi yoğunluk", "${after.roundToInt()}", after, 0f..100f) { after = it }
        Spacer(Modifier.height(18.dp))
        PrimaryButton("Kaydet", {
            Store.addThought(ThoughtRecord(Store.newId(), p.id, situation = situation, thought = thought, emotion = emotion, intensityBefore = before.roundToInt(), distortions = chosen.toList(), evidenceFor = forE, evidenceAgainst = against, balanced = balanced, intensityAfter = after.roundToInt()))
            nav.back()
        }, Modifier.fillMaxWidth(), enabled = thought.isNotBlank() && balanced.isNotBlank())
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
fun AssessmentScreen(type: String, habitId: String?) {
    val nav = LocalNav.current
    val d = Store.data.value
    val p = Store.activeProfile(d) ?: return
    val habit = habitId?.let { id -> d.habits.firstOrNull { it.id == id } }
    val q = if (type == "SRBAI") Assessments.srbai(habit?.title ?: "Bu alışkanlık") else Assessments.byType(type) ?: return
    val answers = remember { mutableStateListOf<Int>() }
    val haptic = rememberHaptic()
    var saved by remember { mutableStateOf(false) }
    SubScreen(q.title, q.subtitle, { nav.back() }, accent = Cine.Teal) {
        val i = answers.size
        if (i < q.items.size) {
            BarMeter(i.toFloat() / q.items.size, color = Cine.Teal)
            Spacer(Modifier.height(16.dp))
            Text(q.prompt, style = MaterialTheme.typography.bodyMedium, color = Cine.Dim)
            Spacer(Modifier.height(8.dp))
            AnimatedContent(i, transitionSpec = { fadeIn(tween(350)) togetherWith fadeOut(tween(150)) }, label = "q") { idx ->
                Column {
                    Text("${idx + 1}/${q.items.size}", color = Cine.Teal, fontWeight = FontWeight.Bold)
                    Text(q.items[idx], style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
                    Spacer(Modifier.height(18.dp))
                    q.options.forEachIndexed { oi, o ->
                        ChoiceCard("", o, null, false, { haptic(); answers.add(q.scores[oi]) }, Modifier.fillMaxWidth().padding(vertical = 4.dp), color = Cine.Teal)
                    }
                }
            }
            if (i > 0) Text("‹ geri", color = Cine.Faint, modifier = Modifier.clickable { answers.removeAt(answers.lastIndex) }.padding(12.dp))
        } else {
            val score = answers.sum()
            LaunchedEffect(Unit) {
                if (!saved) { saved = true; Store.addAssessment(AssessmentResult(Store.newId(), p.id, q.type, score = score, answers = answers.toList(), habitId = habitId)) }
            }
            val band = Assessments.band(q.type, score)
            val col = when (band.severity) { 0 -> Cine.Lime; 1 -> Cine.Gold; 2 -> Cine.Amber; else -> Cine.Ember }
            Spacer(Modifier.height(20.dp))
            Kicker("Sonuç", col)
            Text(if (q.type == "SRBAI") "%${Assessments.srbaiPercent(score)}" else "$score / ${Assessments.maxScore(q)}", style = MaterialTheme.typography.displayLarge, color = Cine.Text)
            Text(band.label, style = MaterialTheme.typography.headlineSmall, color = col)
            Spacer(Modifier.height(10.dp))
            Text(band.text, style = MaterialTheme.typography.bodyLarge, color = Cine.Text)
            if (q.type == "PHQ9" && (answers.getOrNull(8) ?: 0) > 0) {
                Spacer(Modifier.height(16.dp))
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Ember, onClick = { nav.go("crisis") }) {
                    Kicker("Önemli", Cine.Ember)
                    Text("Kendine zarar verme düşüncelerinden bahsettin. Bunu biriyle paylaşmak çok değerli. Lütfen şimdi destek al.", color = Cine.Text)
                    Text("Destek hatlarını aç ›", color = Cine.Gold, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                }
            }
            if (q.type == "SCOFF" && score >= 2) {
                Spacer(Modifier.height(12.dp))
                Text("Kilo verme önerileri kapatıldı. Lütfen bir uzmana başvur.", color = Cine.Ember, style = MaterialTheme.typography.bodyMedium)
            }
            Spacer(Modifier.height(20.dp))
            Text("Ölçek: ${q.source}. Bu bir tanı değildir; sadece kendini izlemen için bir göstergedir.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
            Spacer(Modifier.height(20.dp))
            PrimaryButton("Tamam", { nav.back() }, Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
fun CrisisScreen() {
    val nav = LocalNav.current
    val context = LocalContext.current
    fun dial(n: String) = runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$n")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    SubScreen("Yalnız değilsin", "Destek", { nav.back() }, accent = Cine.Teal) {
        Text("Şu an zor bir an yaşıyorsan bu çok insani bir şey. Bu duygular geçicidir ve yardım almak gerçekten işe yarar.", style = MaterialTheme.typography.bodyLarge, color = Cine.Text)
        Spacer(Modifier.height(18.dp))
        PrimaryButton("📞 112 Acil Çağrı", { dial("112") }, Modifier.fillMaxWidth(), colors = listOf(Cine.Ember, Cine.Rose))
        Spacer(Modifier.height(10.dp))
        GhostButton("📞 ALO 183 Sosyal Destek Hattı", { dial("183") }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        GhostButton("📞 ALO 171 Sigara Bırakma Hattı", { dial("171") }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(18.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            Kicker("Şimdi yapabileceklerin", Cine.Teal)
            listOf(
                "Güvendiğin birini ara ya da yanına çağır.",
                "Kendine zarar verebileceğin şeyleri uzaklaştır.",
                "En yakın hastanenin acil servisine git.",
                "Aşağıdaki nefes ya da topraklanma egzersizini dene.",
            ).forEach { Text("• $it", color = Cine.Text, modifier = Modifier.padding(top = 6.dp)) }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("🌬️ Nefes", { nav.go("breath") }, Modifier.weight(1f))
            GhostButton("🖐️ Topraklanma", { nav.go("ground") }, Modifier.weight(1f))
        }
        Disclaimer("Atomik bir kriz hizmeti değildir. Acil bir durumda lütfen 112'yi ara.")
    }
}

private val triggers = listOf("Stres", "Can sıkıntısı", "Yalnızlık", "Yorgunluk", "Sosyal ortam", "Ekran", "Yemek sonrası", "Kahve/çay", "Gece", "Diğer")
private val surfLines = listOf(
    "Dürtü bir dalgadır. Yükselir, zirve yapar ve iner.",
    "Onunla savaşma. Sadece izle. Bedeninde nerede hissediyorsun?",
    "Göğüs mü, boğaz mı, eller mi? Merakla gözlemle.",
    "Nefesini dalganın üstünde bir sörf tahtası gibi kullan.",
    "Yoğunluğa 1'den 10'a bir puan ver. Değişiyor mu?",
    "Dürtüye uymadan geçen her dakika beynine yeni bir yol öğretiyor.",
    "Dalga zirveyi geçiyor olabilir. Biraz daha kal.",
    "Sen dürtü değilsin. Sen dürtüyü fark edensin.",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun UrgeScreen(habitId: String?) {
    val nav = LocalNav.current
    val d = Store.data.value
    val p = Store.activeProfile(d) ?: return
    val shadows = d.habits.filter { it.profileId == p.id && it.kind == HabitKind.BREAK && !it.archived }
    var habit by remember { mutableStateOf(habitId ?: shadows.firstOrNull()?.id) }
    var step by remember { mutableIntStateOf(0) }
    var before by remember { mutableFloatStateOf(7f) }
    var after by remember { mutableFloatStateOf(4f) }
    var trigger by remember { mutableStateOf("") }
    var minutes by remember { mutableIntStateOf(5) }
    var elapsed by remember { mutableIntStateOf(0) }
    val haptic = rememberHaptic()
    SubScreen("Dürtü SOS", "Dalga sörfü", { nav.back() }, accent = Cine.Sky) {
        when (step) {
            0 -> {
                Text("Bir dürtü geldi. Harika: bu, gölgenle yüzleşme fırsatı.", style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                if (shadows.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        shadows.forEach { h -> Pill("${h.emoji} ${h.title}", habit == h.id, { habit = h.id }, color = Cine.Sky) }
                    }
                }
                com.atomik.kocu.ui.screens.SliderRow("Dürtünün şiddeti", "${before.roundToInt()}/10", before, 1f..10f) { before = it }
                Spacer(Modifier.height(10.dp))
                Kicker("Ne tetikledi?", Cine.Dim)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    triggers.forEach { t -> Pill(t, trigger == t, { trigger = t }, color = Cine.Sky) }
                }
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(3, 5, 10).forEach { m -> Pill("$m dk", minutes == m, { minutes = m }, color = Cine.Sky) } }
                Spacer(Modifier.height(18.dp))
                PrimaryButton("🌊 Sörfe başla", { haptic(); step = 1 }, Modifier.fillMaxWidth(), colors = listOf(Cine.Sky, Cine.Teal))
                Text("Dürtü sörfü, bağımlılık davranışlarında dürtüleri yönetmek için geliştirilmiş farkındalık temelli bir tekniktir (Bowen & Marlatt, 2009).", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(top = 12.dp))
            }
            1 -> {
                LaunchedEffect(Unit) {
                    elapsed = 0
                    while (elapsed < minutes * 60) { delay(1000); elapsed++ }
                    haptic(); step = 2
                }
                Waves(Modifier.fillMaxWidth().height(220.dp))
                val left = minutes * 60 - elapsed
                Text("${left / 60}:${"%02d".format(left % 60)}", style = MaterialTheme.typography.displayLarge, color = Cine.Text, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(12.dp))
                AnimatedContent(elapsed / 20 % surfLines.size, transitionSpec = { fadeIn(tween(800)) togetherWith fadeOut(tween(600)) }, label = "surf") { li ->
                    Text(surfLines[li], style = MaterialTheme.typography.headlineSmall, color = Cine.Text, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(24.dp))
                GhostButton("Dalga geçti", { step = 2 }, Modifier.fillMaxWidth())
            }
            else -> {
                Text("Dalga nasıl geçti?", style = MaterialTheme.typography.headlineMedium, color = Cine.Text)
                com.atomik.kocu.ui.screens.SliderRow("Şimdiki şiddet", "${after.roundToInt()}/10", after, 0f..10f) { after = it }
                Spacer(Modifier.height(18.dp))
                PrimaryButton("💪 Direndim", {
                    Store.addUrge(UrgeLog(Store.newId(), p.id, habit, intensityBefore = before.roundToInt(), intensityAfter = after.roundToInt(), trigger = trigger, resisted = true))
                    nav.back()
                }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                GhostButton("Bu sefer olmadı", {
                    Store.addUrge(UrgeLog(Store.newId(), p.id, habit, intensityBefore = before.roundToInt(), intensityAfter = after.roundToInt(), trigger = trigger, resisted = false))
                    nav.back()
                }, Modifier.fillMaxWidth())
                Text("Her iki cevap da veridir. Hangi tetikleyicinin güçlü olduğunu öğreniyoruz; Yönetmen bunu fark edecek.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(top = 14.dp))
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
private fun Waves(modifier: Modifier) {
    val t = rememberInfiniteTransition(label = "w").animateFloat(0f, 1f, infiniteRepeatable(tween(6000, easing = LinearEasing)), label = "wt")
    Canvas(modifier) {
        listOf(Cine.Sky to 0f, Cine.Teal to 0.33f, Cine.Violet to 0.66f).forEachIndexed { i, (c, off) ->
            val path = Path()
            val amp = size.height * (0.18f - i * 0.04f)
            val base = size.height * (0.45f + i * 0.12f)
            path.moveTo(0f, base)
            var x = 0f
            while (x <= size.width) {
                val y = base + amp * sin((x / size.width * 2 * PI + (t.value + off) * 2 * PI).toFloat())
                path.lineTo(x, y); x += 6f
            }
            drawPath(path, c.copy(alpha = 0.8f - i * 0.2f), style = Stroke(3.dp.toPx()))
        }
    }
}

@Composable
fun BodyScreen() {
    val nav = LocalNav.current
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    var editing by remember { mutableStateOf(p.body == null) }
    var input by remember { mutableStateOf("") }
    SubScreen("Beden", "Kalori · protein · su", { nav.back() }, accent = Cine.Lime) {
        val b = p.body
        if (editing || b == null) {
            BodyStep(b ?: com.atomik.kocu.data.BodyInfo(), gaining = p.goals.contains("GAIN_WEIGHT"), onDone = { info ->
                Store.updateProfile(p.id) { it.copy(body = info) }
                Store.addWeight(WeightEntry(p.id, Dates.today(), info.weightKg))
                editing = false
            }, onSkip = if (b != null) ({ editing = false }) else null)
            return@SubScreen
        }
        val scoffFlag = d.assessments.filter { it.profileId == p.id && it.type == "SCOFF" }.maxByOrNull { it.time }?.let { it.score >= 2 } == true
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile("%.1f".format(Body.bmi(b)), "VKİ · ${Body.bmiLabel(Body.bmi(b))}", Modifier.weight(1f), Cine.Lime)
            StatTile("${Body.tdee(b)}", "günlük ihtiyaç kcal", Modifier.weight(1f), Cine.Gold)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            val pr = Body.proteinRange(b)
            StatTile(if (Body.lossUnsafe(b) || scoffFlag) "${Body.tdee(b)}" else "${Body.targetCalories(b)}", "hedef kcal", Modifier.weight(1f), Cine.Amber)
            StatTile("${pr.first}–${pr.second}g", "protein / gün", Modifier.weight(1f), Cine.Rose)
            StatTile("${Body.waterLiters(b)} L", "su / gün", Modifier.weight(1f), Cine.Sky)
        }
        Spacer(Modifier.height(12.dp))
        if (Body.lossUnsafe(b) || scoffFlag) {
            GlassCard(Modifier.fillMaxWidth(), accent = Cine.Ember) {
                Kicker("Güvenlik", Cine.Ember)
                Text("Kalori açığı önerilmiyor. Bedenine iyi bakmak için bir sağlık uzmanıyla görüşmeni öneririz.", color = Cine.Text)
            }
        } else Body.weeksToTarget(b)?.let {
            GlassCard(Modifier.fillMaxWidth(), accent = Cine.Lime) {
                Kicker("Yol haritası", Cine.Lime)
                Text("${b.weightKg} → ${b.targetKg} kg · güvenli hızla ≈ $it hafta", color = Cine.Text)
                Text(if (Body.wantsLoss(b)) "Haftada ~0,5 kg: kas kaybını ve geri alımı azaltan sürdürülebilir hız." else "Haftada ~0,25 kg: kuvvet antrenmanı + yeterli protein ile kaliteli kazanım.", color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
            }
        }
        SectionTitle("Kilo günlüğü", "Haftada 1–2 ölçüm yeter")
        Row(verticalAlignment = Alignment.CenterVertically) {
            Field(input, { input = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(5) }, "Bugünkü kilo (kg)", Modifier.weight(1f))
            Spacer(Modifier.width(10.dp))
            GhostButton("Kaydet", {
                input.replace(',', '.').toDoubleOrNull()?.takeIf { it in 25.0..300.0 }?.let { Store.addWeight(WeightEntry(p.id, Dates.today(), it)); input = "" }
            }, color = Cine.Lime)
        }
        Spacer(Modifier.height(10.dp))
        val ws = d.weights.filter { it.profileId == p.id }.sortedBy { it.day }.takeLast(60)
        GlassCard(Modifier.fillMaxWidth()) {
            LineChart(ws.map { it.kg.toFloat() }, color = Cine.Lime, height = 150.dp, overlay = ws.map { b.targetKg.toFloat() }, overlayColor = Cine.Gold.copy(alpha = 0.5f))
            if (ws.isNotEmpty()) Text("İlk: ${ws.first().kg} kg · Son: ${ws.last().kg} kg · Hedef çizgisi altın", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Bilgileri düzenle", { editing = true }, Modifier.weight(1f))
            GhostButton("🍽️ SCOFF testi", { nav.go("assess/SCOFF") }, Modifier.weight(1f))
        }
        Spacer(Modifier.height(10.dp))
        PrimaryButton("Beden sahnesi ekle", { nav.go("habit_new") }, Modifier.fillMaxWidth(), colors = listOf(Cine.Lime, Cine.Teal))
        Disclaimer("Hesaplar Mifflin-St Jeor (1990) denklemine ve genel beslenme önerilerine dayanır; kişisel tıbbi tavsiye değildir.")
    }
}
