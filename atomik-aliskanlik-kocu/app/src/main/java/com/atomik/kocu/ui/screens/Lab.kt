package com.atomik.kocu.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Habit
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Assessments
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.components.BarMeter
import com.atomik.kocu.ui.components.CinemaBackground
import com.atomik.kocu.ui.components.EmojiBadge
import com.atomik.kocu.ui.components.GhostButton
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Heatmap
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.LineChart
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.ProgressRing
import com.atomik.kocu.ui.components.ScrambleText
import com.atomik.kocu.ui.components.SectionTitle
import com.atomik.kocu.ui.components.StatTile
import com.atomik.kocu.ui.components.SubScreen
import com.atomik.kocu.ui.components.WeekBars
import com.atomik.kocu.ui.theme.Cine

/** Hizalanmış ısı haritası değerleri: sütunlar hafta, satırlar Pzt..Pzr. */
fun heatValues(s: Stats, habits: List<Habit>, weeks: Int): List<Float> {
    val start = s.today - Dates.weekdayIndex(s.today) - (weeks - 1) * 7L
    return (0 until weeks * 7).map { i ->
        val day = start + i
        if (day > s.today) -1f else s.dayRatio(habits, day)
    }
}

@Composable
fun LabTab() {
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val s = remember(d) { Stats(d) }
    val nav = LocalNav.current
    val habits = s.habitsOf(p.id)
    val dayIdx = s.dayIndex(p)
    val votes = s.votes(p.id)
    val compoundOpen = Chapters.unlocked(Chapters.all[4], dayIdx, votes)
    val weekRate = habits.map { s.rate(it, 7) }.average().let { if (it.isNaN()) 0.0 else it }
    CinemaBackground(accent = Cine.Teal) {
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 12.dp, bottom = 140.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Kicker("Veriler yalan söylemez", Cine.Teal)
                Text("Laboratuvar", style = MaterialTheme.typography.displayMedium, color = Cine.Text)
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile("$votes", "kimlik oyu", Modifier.weight(1f))
                    StatTile("${s.activeDays(p.id)}", "aktif gün", Modifier.weight(1f), Cine.Teal)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile("${s.bestEverStreak(p.id)}", "en uzun seri", Modifier.weight(1f), Cine.Amber)
                    StatTile("%${(weekRate * 100).toInt()}", "son 7 gün tutarlılık", Modifier.weight(1f), Cine.Violet)
                }
            }
            item {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Gold) {
                    Kicker("Bileşik büyüme · %1 kuralı")
                    if (compoundOpen) {
                        Text("×${"%.2f".format(Stats.compound(dayIdx))}", style = MaterialTheme.typography.displayMedium, color = Cine.Gold)
                        Text("$dayIdx gündür her gün %1 daha iyi olsaydın. 365. günde: ×37,8", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                        Spacer(Modifier.height(10.dp))
                        val n = maxOf(60, dayIdx + 10)
                        LineChart(
                            (0..n).map { Stats.compound(it).toFloat() },
                            color = Cine.Gold, height = 120.dp,
                            overlay = (0..n).map { if (it <= dayIdx) Stats.compound(it).toFloat() else null }, overlayColor = Cine.Ember,
                        )
                        Text("Hayal kırıklığı vadisi: ilk haftalarda eğri düz görünür. Ama ısı birikiyor.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, fontStyle = FontStyle.Italic)
                    } else {
                        ScrambleText("GİZLİ EĞRİ", false, style = MaterialTheme.typography.headlineMedium)
                        Text("Bölüm V'te açılır.", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                    }
                }
            }
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    Kicker("Son 18 hafta", Cine.Teal)
                    Spacer(Modifier.height(10.dp))
                    Heatmap(heatValues(s, habits, 18), color = Cine.Teal)
                    Spacer(Modifier.height(6.dp))
                    Text("Koyu = kusursuz gün. Mükemmellik değil, desen önemli.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
                }
            }
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    Kicker("Haftanın ritmi · son 8 hafta", Cine.Violet)
                    Spacer(Modifier.height(8.dp))
                    WeekBars(s.weekdayRates(habits), Dates.dayLetters)
                }
            }
            item {
                val moods = (29 downTo 0).map { back -> d.moods.firstOrNull { it.profileId == p.id && it.day == s.today - back }?.mood?.toFloat() }
                GlassCard(Modifier.fillMaxWidth()) {
                    Kicker("Ruh hali · 30 gün", Cine.Rose)
                    Spacer(Modifier.height(8.dp))
                    LineChart(moods, color = Cine.Rose, min = 1f, max = 5f, height = 110.dp)
                    val avg = moods.filterNotNull().average()
                    if (!avg.isNaN()) Text("Ortalama ${MoodFaces[(avg.toInt() - 1).coerceIn(0, 4)]} ${"%.1f".format(avg)}/5", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                }
            }
            item { SectionTitle("Sahne sahne", "Alışkanlıklar") }
            items(habits, key = { it.id }) { h ->
                val col = Cine.habit(h.colorIndex)
                val auto = Stats.automaticity(s.reps(h))
                GlassCard(Modifier.fillMaxWidth(), onClick = { nav.go("habit/${h.id}") }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EmojiBadge(h.emoji, col)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(h.title, style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                            Text("🔥 ${s.streak(h)} · 30 gün %${(s.rate(h, 30) * 100).toInt()} · ${s.reps(h)} tekrar", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                            Spacer(Modifier.height(6.dp))
                            BarMeter(auto, color = col)
                        }
                        Spacer(Modifier.width(10.dp))
                        ProgressRing(auto, size = 46.dp, color = col) { Text("${(auto * 100).toInt()}", fontSize = 12.sp, color = Cine.Text, fontWeight = FontWeight.Bold) }
                    }
                }
            }
            item {
                Spacer(Modifier.height(6.dp))
                PrimaryButton("Haftalık kartımı paylaş", { nav.go("share_week") }, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
fun HabitDetail(id: String) {
    val nav = LocalNav.current
    val d by Store.data.collectAsStateWithLifecycle()
    val h = d.habits.firstOrNull { it.id == id } ?: return
    val s = remember(d) { Stats(d) }
    val col = Cine.habit(h.colorIndex)
    var confirmDelete by remember { mutableStateOf(false) }
    val reps = s.reps(h)
    val srbai = d.assessments.filter { it.type == "SRBAI" && it.habitId == h.id }.sortedBy { it.time }
    SubScreen(h.emoji + " " + h.title, if (h.kind == HabitKind.BREAK) "Gölge · kötü alışkanlık" else "Sahne", { nav.back() }, accent = col) {
        if (h.identity.isNotBlank()) Text("“${h.identity}”", style = MaterialTheme.typography.titleMedium, color = col, fontStyle = FontStyle.Italic)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile("${s.streak(h)}", if (h.kind == HabitKind.BREAK) "temiz seri" else "seri", Modifier.weight(1f), col)
            StatTile("${s.bestStreak(h)}", "en iyi", Modifier.weight(1f), Cine.Amber)
            StatTile("%${(s.rate(h, 30) * 100).toInt()}", "30 gün", Modifier.weight(1f), Cine.Teal)
        }
        Spacer(Modifier.height(12.dp))
        GlassCard(Modifier.fillMaxWidth(), accent = col) {
            Kicker("Otomatiklik", col)
            val auto = Stats.automaticity(reps)
            Row(verticalAlignment = Alignment.Bottom) {
                Text("%${(auto * 100).toInt()}", style = MaterialTheme.typography.displayMedium, color = Cine.Text)
                Spacer(Modifier.width(10.dp))
                Text("tahmini · $reps tekrar", color = Cine.Dim, modifier = Modifier.padding(bottom = 8.dp))
            }
            srbai.lastOrNull()?.let { Text("Son test (SRBAI): %${Assessments.srbaiPercent(it.score)} · ${Dates.full(Dates.dayOf(it.time))}", color = Cine.Teal, style = MaterialTheme.typography.bodySmall) }
            Spacer(Modifier.height(8.dp))
            val elapsed = (s.today - h.createdEpochDay).toInt().coerceAtLeast(0)
            val n = maxOf(66, elapsed)
            var cum = 0
            val actual = (0..n).map { i ->
                val day = h.createdEpochDay + i
                if (day > s.today) null else { if (s.completed(h, day)) cum++; Stats.automaticity(cum) }
            }
            val model = (0..n).map { Stats.automaticity(it) }
            val tests = (0..n).map { i -> srbai.firstOrNull { Dates.dayOf(it.time) == h.createdEpochDay + i }?.let { Assessments.srbaiPercent(it.score) / 100f } }
            LineChart(model, color = Cine.Faint, min = 0f, max = 1f, height = 120.dp, fill = false, overlay = actual, overlayColor = col)
            if (tests.any { it != null }) LineChart(tests, color = Cine.Teal, min = 0f, max = 1f, height = 40.dp, fill = false)
            Text("Gri: her gün yapılırsa beklenen eğri (Lally ve ark., 2010). Renkli: senin eğrin.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
            Spacer(Modifier.height(10.dp))
            GhostButton("🔍 Otomatiklik testini yap (30 sn)", { nav.go("srbai/${h.id}") }, Modifier.fillMaxWidth(), color = Cine.Teal)
        }
        Spacer(Modifier.height(12.dp))
        val laws = if (h.kind == HabitKind.BUILD) listOf(
            Triple("1 · Görünür yap", h.cue, "👁️"), Triple("2 · Cazip yap", h.attractor, "✨"),
            Triple("3 · Kolay yap", listOf(h.tinyVersion, h.environment).filter { it.isNotBlank() }.joinToString("\n"), "🍃"), Triple("4 · Tatmin edici yap", h.reward, "🏆"),
        ) else listOf(
            Triple("1 · Görünmez yap", h.cue, "🙈"), Triple("2 · İtici yap", h.attractor, "🥀"),
            Triple("3 · Zorlaştır", listOf(h.tinyVersion, h.environment).filter { it.isNotBlank() }.joinToString("\n"), "🧱"), Triple("4 · Tatminsiz yap", h.reward, "⚖️"),
        )
        Kicker("Dört yasa", Cine.Dim)
        Spacer(Modifier.height(8.dp))
        laws.forEach { (t, v, e) ->
            GlassCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), padding = PaddingValues(14.dp)) {
                Text("$e  $t", style = MaterialTheme.typography.labelLarge, color = col)
                Text(v.ifBlank { "— henüz yazılmadı" }, style = MaterialTheme.typography.bodyMedium, color = if (v.isBlank()) Cine.Faint else Cine.Text)
            }
        }
        if (h.anchor.isNotBlank()) Text("⛓️ Çapa: ${h.anchor}", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
        Spacer(Modifier.height(12.dp))
        GlassCard(Modifier.fillMaxWidth()) {
            Kicker("Son 12 hafta", col)
            Spacer(Modifier.height(8.dp))
            Heatmap(heatValues(s, listOf(h), 12), color = col)
        }
        if (h.kind == HabitKind.BREAK) {
            val urges = d.urges.filter { it.habitId == h.id }
            Spacer(Modifier.height(12.dp))
            GlassCard(Modifier.fillMaxWidth(), accent = Cine.Ember) {
                Kicker("Dürtü dosyası", Cine.Ember)
                Text("${urges.size} dürtü · ${urges.count { it.resisted }} kez yenildi", color = Cine.Text)
                val top = urges.groupingBy { it.trigger }.eachCount().entries.sortedByDescending { it.value }.take(3)
                if (top.isNotEmpty()) Text("En sık tetikleyiciler: " + top.joinToString { "${it.key} (${it.value})" }, style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                val avgDrop = urges.map { it.intensityBefore - it.intensityAfter }.average()
                if (!avgDrop.isNaN()) Text("Dalga sörfü sonrası yoğunluk ortalama ${"%.1f".format(avgDrop)} puan düştü.", style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
                Spacer(Modifier.height(8.dp))
                GhostButton("🌊 Dürtü SOS", { nav.go("urge/${h.id}") }, Modifier.fillMaxWidth(), color = Cine.Ember)
            }
        }
        val notes = d.logs.filter { it.habitId == h.id && it.note.isNotBlank() }.sortedByDescending { it.day }.take(10)
        if (notes.isNotEmpty()) {
            SectionTitle("Set notları", "Günlük")
            notes.forEach { Text("${Dates.short(it.day)} · ${it.note}", color = Cine.Dim, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 6.dp)) }
        }
        Spacer(Modifier.height(16.dp))
        PrimaryButton("✏️ Senaryoyu düzenle", { nav.go("habit_edit/${h.id}") }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GhostButton("Paylaş", { nav.go("share_streak/${h.id}") }, Modifier.weight(1f))
            GhostButton(if (h.archived) "Geri al" else "Arşivle", { Store.setArchived(h.id, !h.archived); if (!h.archived) nav.back() }, Modifier.weight(1f))
            GhostButton("Sil", { confirmDelete = true }, Modifier.weight(1f), color = Cine.Ember)
        }
        Spacer(Modifier.height(40.dp))
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = Cine.SurfaceHi,
            title = { Text("Sahne silinsin mi?", color = Cine.Text) },
            text = { Text("Tüm kayıtlar da silinir. Bunun yerine arşivlemek geçmişi korur.", color = Cine.Dim) },
            confirmButton = { TextButton({ confirmDelete = false; Store.deleteHabit(h.id); nav.back() }) { Text("Sil", color = Cine.Ember) } },
            dismissButton = { TextButton({ confirmDelete = false }) { Text("Vazgeç", color = Cine.Text) } },
        )
    }
}
