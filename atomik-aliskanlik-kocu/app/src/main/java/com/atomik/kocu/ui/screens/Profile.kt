package com.atomik.kocu.ui.screens

import android.app.TimePickerDialog
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.atomik.kocu.content.Insights
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.LogStatus
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Achievements
import com.atomik.kocu.domain.Chapters
import com.atomik.kocu.domain.Coach
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.components.CinemaBackground
import com.atomik.kocu.ui.components.Disclaimer
import com.atomik.kocu.ui.components.EmojiBadge
import com.atomik.kocu.ui.components.Field
import com.atomik.kocu.ui.components.GhostButton
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.Letterbox
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.ScrambleText
import com.atomik.kocu.ui.components.SectionTitle
import com.atomik.kocu.ui.components.StatTile
import com.atomik.kocu.ui.components.SubScreen
import com.atomik.kocu.ui.components.Typewriter
import com.atomik.kocu.ui.components.rememberHaptic
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileTab() {
    val d by Store.data.collectAsStateWithLifecycle()
    val p = Store.activeProfile(d) ?: return
    val s = remember(d) { Stats(d) }
    val nav = LocalNav.current
    var addIdentity by remember { mutableStateOf(false) }
    var newIdentity by remember { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    CinemaBackground(accent = Cine.Gold) {
        LazyColumn(
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + 18.dp, bottom = 140.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    EmojiBadge(p.avatar, Cine.Gold, size = 96.dp)
                    Spacer(Modifier.height(10.dp))
                    Text(p.name, style = MaterialTheme.typography.displayMedium, color = Cine.Text)
                    Kicker("Başrol · Gün ${s.dayIndex(p)} · ${Chapters.current(s.dayIndex(p), s.votes(p.id))?.title ?: "Prolog"}")
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile("${s.votes(p.id)}", "oy", Modifier.weight(1f))
                    StatTile("❄️${p.freezeTokens}", "dondurma hakkı", Modifier.weight(1f), Cine.Teal)
                    StatTile("${p.achievements.size}/${Achievements.all.size}", "başarım", Modifier.weight(1f), Cine.Violet)
                }
            }
            item {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Gold) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Kicker("Kimlik manifestosu", modifier = Modifier.weight(1f))
                        Text("+ ekle", color = Cine.Gold, modifier = Modifier.clickable { addIdentity = true })
                    }
                    p.identities.forEach { idt ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                            Text("✦ $idt", style = MaterialTheme.typography.titleMedium, color = Cine.Text, fontStyle = FontStyle.Italic, modifier = Modifier.weight(1f))
                            if (p.identities.size > 1) Text("×", color = Cine.Faint, fontSize = 20.sp, modifier = Modifier.clickable { Store.updateProfile(p.id) { it.copy(identities = it.identities - idt) } }.padding(6.dp))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    GhostButton("Manifestoyu paylaş", { nav.go("share_identity") }, Modifier.fillMaxWidth(), color = Cine.Gold)
                }
            }
            item { SectionTitle("Ödül vitrini", "Başarımlar") }
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Achievements.all.forEach { a ->
                        val got = a.id in p.achievements
                        Column(
                            Modifier.width(100.dp).clip(RoundedCornerShape(18.dp)).background(if (got) Cine.Gold.copy(alpha = 0.10f) else Cine.Surface)
                                .border(1.dp, if (got) Cine.Gold.copy(alpha = 0.5f) else Cine.Stroke, RoundedCornerShape(18.dp)).padding(10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(if (got) a.emoji else "❔", fontSize = 28.sp, modifier = Modifier.alpha(if (got) 1f else 0.5f))
                            Text(if (got) a.title else "???", style = MaterialTheme.typography.labelLarge, color = if (got) Cine.Text else Cine.Faint, textAlign = TextAlign.Center, maxLines = 2)
                            Text(if (got) a.description else "Gizli", style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp), color = Cine.Faint, textAlign = TextAlign.Center, maxLines = 2)
                        }
                    }
                }
            }
            item { SectionTitle("Oyuncu kadrosu", "Profiller") }
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    d.profiles.forEach { other ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { Store.setActiveProfile(other.id) }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(other.avatar, fontSize = 26.sp)
                            Spacer(Modifier.width(12.dp))
                            Text(other.name, color = Cine.Text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            if (other.id == p.id) Text("Sahnede", color = Cine.Gold, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    GhostButton("+ Yeni başrol ekle", { nav.go("onboarding_add") }, Modifier.fillMaxWidth())
                    Text("Aile üyeleri ya da farklı hedefler için ayrı profiller. Her profilin kendi filmi var.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(top = 8.dp))
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    PrimaryButton("⚙️ Ayarlar ve yedekleme", { nav.go("settings") }, Modifier.fillMaxWidth())
                    GhostButton("📚 Bilimsel kaynaklar", { nav.go("sources") }, Modifier.fillMaxWidth())
                    GhostButton("Bu profili sil", { confirmDelete = true }, Modifier.fillMaxWidth(), color = Cine.Ember)
                }
            }
            item { Disclaimer() }
        }
    }
    if (addIdentity) {
        AlertDialog(
            onDismissRequest = { addIdentity = false }, containerColor = Cine.SurfaceHi,
            title = { Text("Yeni kimlik", color = Cine.Text) },
            text = { Field(newIdentity, { newIdentity = it.take(60) }, "Ben … biriyim") },
            confirmButton = { TextButton({ if (newIdentity.isNotBlank()) Store.updateProfile(p.id) { it.copy(identities = it.identities + newIdentity.trim()) }; newIdentity = ""; addIdentity = false }) { Text("Ekle", color = Cine.Gold) } },
            dismissButton = { TextButton({ addIdentity = false }) { Text("Vazgeç", color = Cine.Text) } },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false }, containerColor = Cine.SurfaceHi,
            title = { Text("${p.name} silinsin mi?", color = Cine.Text) },
            text = { Text("Bu profilin tüm alışkanlıkları, kayıtları ve notları kalıcı olarak silinir. Önce yedek almanı öneririz.", color = Cine.Dim) },
            confirmButton = { TextButton({ confirmDelete = false; Store.deleteProfile(p.id) }) { Text("Kalıcı olarak sil", color = Cine.Ember) } },
            dismissButton = { TextButton({ confirmDelete = false }) { Text("Vazgeç", color = Cine.Text) } },
        )
    }
}

@Composable
fun SettingsScreen() {
    val nav = LocalNav.current
    val context = LocalContext.current
    val d by Store.data.collectAsStateWithLifecycle()
    val st = d.settings
    var pinDialog by remember { mutableStateOf(false) }
    var pinInput by remember { mutableStateOf("") }
    var pendingImport by remember { mutableStateOf<String?>(null) }
    fun toast(t: String) = Toast.makeText(context, t, Toast.LENGTH_SHORT).show()

    val exportJson = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(Store.exportJson().toByteArray()) } }
            .onSuccess { toast("Yedek kaydedildi") }.onFailure { toast("Yedek kaydedilemedi") }
    }
    val exportCsv = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(("﻿" + Store.exportCsv()).toByteArray()) } }
            .onSuccess { toast("CSV kaydedildi") }.onFailure { toast("CSV kaydedilemedi") }
    }
    val importJson = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        pendingImport = runCatching { context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText() }.getOrNull()
        if (pendingImport == null) toast("Dosya okunamadı")
    }

    SubScreen("Ayarlar", "Kontrol odası", { nav.back() }) {
        SectionTitle("Bildirimler", "Hatırlatıcılar")
        ToggleRow("Sahne hatırlatıcıları", "Alışkanlık saatinde bildirim; bildirimden tek dokunuşla tamamla", st.remindersEnabled) { v -> Store.updateSettings { it.copy(remindersEnabled = v) } }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable {
            TimePickerDialog(context, android.R.style.Theme_Material_Dialog_Alert, { _, h, m -> Store.updateSettings { it.copy(eveningCheckInMinute = h * 60 + m) } }, st.eveningCheckInMinute / 60, st.eveningCheckInMinute % 60, true).show()
        }.padding(vertical = 12.dp)) {
            Column(Modifier.weight(1f)) {
                Text("Akşam perdesi", color = Cine.Text, style = MaterialTheme.typography.titleMedium)
                Text("Gün kapanmadan kısa kontrol", color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
            }
            Text(Dates.minuteLabel(st.eveningCheckInMinute), color = Cine.Gold, fontWeight = FontWeight.Bold)
        }
        SectionTitle("Deneyim", "Sinema")
        ToggleRow("Dokunsal geri bildirim", "Tamamlarken titreşim", st.haptics) { v -> Store.updateSettings { it.copy(haptics = v) } }
        ToggleRow("Film greni", "Sinematik doku efekti", st.filmGrain) { v -> Store.updateSettings { it.copy(filmGrain = v) } }
        SectionTitle("Gizlilik", "Kilit")
        ToggleRow("PIN kilidi", "Uygulama açılışında 4 haneli PIN", st.pin != null) { v -> if (v) pinDialog = true else Store.updateSettings { it.copy(pin = null) } }
        Text("Tüm veriler sadece bu cihazda saklanır. Hesap yok, reklam yok, takip yok.", style = MaterialTheme.typography.bodySmall, color = Cine.Faint)
        SectionTitle("Veri", "Yedekleme")
        PrimaryButton("💾 Yedek al (JSON)", { exportJson.launch("atomik-yedek-${Dates.today()}.json") }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        GhostButton("📥 Yedekten geri yükle", { importJson.launch(arrayOf("application/json", "text/plain", "*/*")) }, Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        GhostButton("📊 CSV olarak dışa aktar", { exportCsv.launch("atomik-kayitlar-${Dates.today()}.csv") }, Modifier.fillMaxWidth())
        val archived = d.habits.filter { it.archived && it.profileId == d.activeProfileId }
        if (archived.isNotEmpty()) {
            SectionTitle("Arşiv", "Emekli sahneler")
            archived.forEach { h ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${h.emoji} ${h.title}", color = Cine.Dim, modifier = Modifier.weight(1f))
                    Text("Geri al", color = Cine.Gold, modifier = Modifier.clickable { Store.setArchived(h.id, false) })
                }
            }
        }
        Disclaimer("Atomik Alışkanlık Koçu 1.0 · Çevrimdışı · James Clear'ın Atomik Alışkanlıklar ilkelerinden ve davranış bilimi araştırmalarından ilham alır; yazar ya da yayıncıyla bağlantılı değildir.")
    }

    if (pinDialog) {
        AlertDialog(
            onDismissRequest = { pinDialog = false }, containerColor = Cine.SurfaceHi,
            title = { Text("4 haneli PIN", color = Cine.Text) },
            text = { Field(pinInput, { pinInput = it.filter(Char::isDigit).take(4) }, "PIN") },
            confirmButton = { TextButton({ if (pinInput.length == 4) { Store.updateSettings { it.copy(pin = pinInput) }; pinInput = ""; pinDialog = false } }) { Text("Kaydet", color = Cine.Gold) } },
            dismissButton = { TextButton({ pinDialog = false }) { Text("Vazgeç", color = Cine.Text) } },
        )
    }
    pendingImport?.let { text ->
        AlertDialog(
            onDismissRequest = { pendingImport = null }, containerColor = Cine.SurfaceHi,
            title = { Text("Yedek geri yüklensin mi?", color = Cine.Text) },
            text = { Text("Mevcut tüm veriler bu yedekle değiştirilecek.", color = Cine.Dim) },
            confirmButton = { TextButton({ pendingImport = null; toast(if (Store.importJson(text)) "Geri yüklendi" else "Geçersiz yedek dosyası") }) { Text("Geri yükle", color = Cine.Gold) } },
            dismissButton = { TextButton({ pendingImport = null }) { Text("Vazgeç", color = Cine.Text) } },
        )
    }
}

@Composable
private fun ToggleRow(title: String, sub: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Cine.Text, style = MaterialTheme.typography.titleMedium)
            Text(sub, color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
        }
        Switch(value, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Cine.Gold, checkedThumbColor = Cine.Ink))
    }
}

@Composable
fun SourcesScreen() {
    val nav = LocalNav.current
    SubScreen("Bilimsel kaynaklar", "${Insights.references.size} kaynak", { nav.back() }) {
        Text("Uygulamadaki her yöntem hakemli araştırmalara ya da kabul görmüş klinik ölçeklere dayanır. Metinler bu kaynaklardan esinlenerek kendi cümlelerimizle yazılmıştır.", color = Cine.Dim, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(14.dp))
        Insights.references.sortedBy { it.authors }.forEach { r ->
            GlassCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), padding = PaddingValues(14.dp)) {
                Text("${r.authors} (${r.year})", color = Cine.Gold, style = MaterialTheme.typography.labelLarge)
                Text(r.title, color = Cine.Text, fontStyle = FontStyle.Italic, style = MaterialTheme.typography.bodyMedium)
                Text(r.where, color = Cine.Faint, style = MaterialTheme.typography.bodySmall)
                Text("→ ${r.usedFor}", color = Cine.Dim, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}

@Composable
fun LockScreen(pin: String, onUnlock: () -> Unit) {
    var entered by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    val haptic = rememberHaptic()
    LaunchedEffect(entered) {
        if (entered.length == 4) {
            if (entered == pin) onUnlock() else { error = true; delay(500); entered = "" }
        }
    }
    CinemaBackground {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("🔒", fontSize = 48.sp)
            Kicker("Gizli set")
            Text("PIN'ini gir", style = MaterialTheme.typography.headlineMedium, color = Cine.Text)
            Spacer(Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                (0 until 4).forEach { i -> Box(Modifier.size(16.dp).clip(CircleShape).background(if (i < entered.length) (if (error) Cine.Ember else Cine.Gold) else Cine.Stroke)) }
            }
            if (error) Text("Yanlış PIN", color = Cine.Ember, modifier = Modifier.padding(top = 10.dp))
            Spacer(Modifier.height(30.dp))
            listOf(listOf("1", "2", "3"), listOf("4", "5", "6"), listOf("7", "8", "9"), listOf("", "0", "⌫")).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                    row.forEach { k ->
                        Box(
                            Modifier.size(72.dp).clip(CircleShape).background(if (k.isEmpty()) Color.Transparent else Cine.SurfaceHi)
                                .clickable(enabled = k.isNotEmpty()) {
                                    haptic(); error = false
                                    if (k == "⌫") entered = entered.dropLast(1) else if (entered.length < 4) entered += k
                                },
                            contentAlignment = Alignment.Center,
                        ) { Text(k, fontSize = 26.sp, color = Cine.Text) }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("PIN'i unuttuysan: Android Ayarlar › Uygulamalar › Atomik › Depolama › Verileri temizle (tüm veriler silinir).", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, textAlign = TextAlign.Center)
        }
    }
}

@Composable
fun TrailerScreen() {
    val nav = LocalNav.current
    val d = Store.data.value
    val p = Store.activeProfile(d) ?: return
    val s = remember { Stats(d) }
    LaunchedEffect(Unit) { Store.updateProfile(p.id) { it.copy(lastTrailerDay = s.today) } }
    val habits = s.habitsOf(p.id)
    val week = (s.today - 6)..s.today
    val votes7 = d.logs.count { l -> l.day in week && habits.firstOrNull { it.id == l.habitId }?.let { s.completed(it, l.day) } == true }
    val rate = habits.map { s.rate(it, 7) }.average().let { if (it.isNaN()) 0.0 else it }
    val perfect = week.count { day -> val (a, b) = s.dayProgress(habits, day); b > 0 && a == b }
    val star = habits.maxByOrNull { s.rate(it, 7) }
    val weak = habits.filter { it != star }.minByOrNull { s.rate(it, 7) }
    val moodNow = d.moods.filter { it.profileId == p.id && it.day in week }.map { it.mood }.average()
    val moodPrev = d.moods.filter { it.profileId == p.id && it.day in (s.today - 13)..(s.today - 7) }.map { it.mood }.average()
    val next = Chapters.next(s.dayIndex(p), s.votes(p.id))
    val note = Coach.top(d, p, s)

    data class Slide(val kicker: String, val big: String, val text: String, val accent: Color)
    val slides = buildList {
        add(Slide("Geçen hafta…", p.avatar, "${p.name}, olmak istediği kişi için ${if (votes7 > 0) "sahneye çıktı" else "sessizce bekledi"}.", Cine.Violet))
        add(Slide("Verilen oylar", "$votes7", "7 günde $votes7 kimlik oyu. Her biri: “${p.identities.firstOrNull() ?: "yeni ben"}”.", Cine.Gold))
        add(Slide("Tutarlılık", "%${(rate * 100).toInt()}", "$perfect kusursuz gün. " + if (rate >= 0.8) "Bu bir alışkanlık makinesi." else if (rate >= 0.5) "Zincir güçleniyor." else "Küçült ve devam et; vadi geçici.", Cine.Teal))
        if (star != null) add(Slide("Haftanın yıldızı", star.emoji, "“${star.title}” · %${(s.rate(star, 7) * 100).toInt()} · 🔥 ${s.streak(star)}", Cine.Amber))
        if (weak != null) add(Slide("Zor sahne", weak.emoji, "“${weak.title}” zorladı. Gelecek hafta sadece mini versiyon: ${weak.tinyVersion.ifBlank { "2 dakika" }}.", Cine.Ember))
        if (!moodNow.isNaN()) add(Slide("Ruh hali", MoodFaces[(moodNow.toInt() - 1).coerceIn(0, 4)], "Ortalama ${"%.1f".format(moodNow)}/5" + if (!moodPrev.isNaN()) (if (moodNow >= moodPrev) " · önceki haftadan iyi ↗" else " · önceki haftanın gerisinde ↘") else "", Cine.Rose))
        add(Slide("Yönetmenin notu", "🎬", note.text, Cine.Violet))
        add(Slide("Gelecek hafta…", "⏳", next?.teaser ?: "Final sahnesindesin. Sezon 2 seni bekliyor.", Cine.Gold))
    }
    var index by remember { mutableIntStateOf(0) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(index) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(6500, easing = LinearEasing))
        if (index < slides.lastIndex) index++
    }
    val slide = slides[index]
    CinemaBackground(accent = slide.accent) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(top = 70.dp, bottom = 70.dp, start = 20.dp, end = 20.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                slides.indices.forEach { i ->
                    Box(Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(2.dp)).background(Cine.Stroke)) {
                        Box(Modifier.fillMaxWidth(if (i < index) 1f else if (i == index) progress.value else 0f).height(3.dp).background(Cine.Text))
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Kicker(slide.kicker, slide.accent)
                    Spacer(Modifier.height(16.dp))
                    Text(slide.big, fontSize = 84.sp, fontWeight = FontWeight.Black, color = Cine.Text, fontFamily = Cine.Serif)
                    Spacer(Modifier.height(16.dp))
                    Typewriter(slide.text, style = MaterialTheme.typography.headlineSmall, color = Cine.Text, textAlign = TextAlign.Center, charDelay = 22)
                    if (index == slides.lastIndex && next != null) {
                        Spacer(Modifier.height(12.dp))
                        ScrambleText(next.title, false, style = MaterialTheme.typography.headlineMedium, color = Cine.Gold)
                    }
                }
                Row(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(1f).fillMaxSize().clickable(MutableInteractionSource(), null) { if (index > 0) index-- })
                    Box(Modifier.weight(2f).fillMaxSize().clickable(MutableInteractionSource(), null) { if (index < slides.lastIndex) index++ })
                }
            }
            if (index == slides.lastIndex) {
                PrimaryButton("Fragmanı paylaş", { nav.go("share_week") }, Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
            }
            GhostButton(if (index == slides.lastIndex) "Kapat" else "Atla", { nav.back() }, Modifier.fillMaxWidth())
        }
        Letterbox(true, height = 48.dp)
    }
}
