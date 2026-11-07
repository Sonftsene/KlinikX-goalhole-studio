package com.atomik.kocu.ui.screens

import android.app.TimePickerDialog
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.atomik.kocu.content.Goal
import com.atomik.kocu.content.HabitTemplate
import com.atomik.kocu.content.Templates
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.Habit
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Plan
import com.atomik.kocu.ui.LocalNav
import com.atomik.kocu.ui.components.Field
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.Pill
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.SubScreen
import com.atomik.kocu.ui.components.rememberHaptic
import com.atomik.kocu.ui.theme.Cine

private val habitEmojis = listOf("💧", "🚶", "🏃", "💪", "🧘", "📖", "✍️", "🥗", "🍎", "😴", "🌙", "☀️", "🧠", "🎯", "📵", "🚭", "🍬", "🥤", "🙏", "🤝", "📞", "🎧", "🌿", "🧹", "💊", "🦷", "🎨", "🎸", "💰", "⏰", "🔥", "⚛️")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HabitEditor(id: String?) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val haptic = rememberHaptic()
    val d = Store.data.value
    val p = Store.activeProfile(d) ?: return
    val existing = id?.let { hid -> d.habits.firstOrNull { it.id == hid } }

    var kind by remember { mutableStateOf(existing?.kind ?: HabitKind.BUILD) }
    var emoji by remember { mutableStateOf(existing?.emoji ?: "⚛️") }
    var title by remember { mutableStateOf(existing?.title ?: "") }
    var identity by remember { mutableStateOf(existing?.identity ?: (p.identities.firstOrNull() ?: "")) }
    var cue by remember { mutableStateOf(existing?.cue ?: "") }
    var anchor by remember { mutableStateOf(existing?.anchor ?: "") }
    var attractor by remember { mutableStateOf(existing?.attractor ?: "") }
    var tiny by remember { mutableStateOf(existing?.tinyVersion ?: "") }
    var environment by remember { mutableStateOf(existing?.environment ?: "") }
    var reward by remember { mutableStateOf(existing?.reward ?: "") }
    var target by remember { mutableIntStateOf(existing?.target ?: 1) }
    var unit by remember { mutableStateOf(existing?.unit ?: "") }
    var days by remember { mutableIntStateOf(existing?.daysMask ?: 0b1111111) }
    var reminder by remember { mutableStateOf(existing?.reminderMinute) }
    var color by remember { mutableIntStateOf(existing?.colorIndex ?: d.habits.count { it.profileId == p.id }) }
    var templateId by remember { mutableStateOf(existing?.templateId) }
    var goal by remember { mutableStateOf(p.goals.firstOrNull()?.let { g -> Goal.entries.firstOrNull { it.name == g } } ?: Goal.MOOD) }
    var showTemplates by remember { mutableStateOf(existing == null) }

    fun apply(t: HabitTemplate) {
        haptic()
        kind = t.kind; emoji = t.emoji; title = t.title; identity = t.identity; cue = t.cue; anchor = t.anchor
        attractor = t.attractor; tiny = t.tinyVersion; environment = t.environment; reward = t.reward
        target = t.target; unit = t.unit; reminder = t.defaultMinute; templateId = t.id; showTemplates = false
    }

    val build = kind == HabitKind.BUILD
    SubScreen(if (existing == null) "Yeni sahne" else "Senaryoyu düzenle", "Senaryo stüdyosu", { nav.back() }) {
        Column(Modifier.imePadding()) {
            GlassCard(Modifier.fillMaxWidth(), accent = Cine.Gold) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Kicker("Hazır senaryolar · 60 bilimsel şablon", modifier = Modifier.weight(1f))
                    Text(if (showTemplates) "Gizle" else "Göster", color = Cine.Gold, fontWeight = FontWeight.Bold, modifier = Modifier.clickable { showTemplates = !showTemplates })
                }
                AnimatedVisibility(showTemplates) {
                    Column {
                        Spacer(Modifier.height(10.dp))
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Goal.entries.forEach { g -> Pill("${g.emoji} ${g.title}", g == goal, { goal = g }) }
                        }
                        Spacer(Modifier.height(10.dp))
                        Templates.forGoal(goal).forEach { t ->
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { apply(t) }
                                    .background(if (t.id == templateId) Cine.Gold.copy(alpha = 0.12f) else Color.Transparent).padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(t.emoji, fontSize = 24.sp)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(t.title + if (t.kind == HabitKind.BREAK) "  · bırak" else "", color = Cine.Text, style = MaterialTheme.typography.titleMedium)
                                    Text(t.science, color = Cine.Faint, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("⚛️ Kazan", build, { kind = HabitKind.BUILD })
                Pill("🌑 Bırak (gölge)", !build, { kind = HabitKind.BREAK }, color = Cine.Ember)
            }
            Spacer(Modifier.height(12.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                habitEmojis.forEach { e ->
                    Box(Modifier.size(40.dp).clip(CircleShape).background(if (e == emoji) Cine.Gold.copy(alpha = 0.25f) else Cine.SurfaceHi).clickable { emoji = e }, contentAlignment = Alignment.Center) { Text(e, fontSize = 20.sp) }
                }
            }
            Spacer(Modifier.height(12.dp))
            Field(title, { title = it.take(40) }, if (build) "Sahnenin adı" else "Bırakmak istediğin alışkanlık", placeholder = if (build) "Örn. 10 dakika yürüyüş" else "Örn. Gece telefona bakmak")
            Spacer(Modifier.height(10.dp))
            Field(identity, { identity = it.take(70) }, "Kimlik oyu", placeholder = "Ben … biriyim")
            if (p.identities.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    p.identities.forEach { Pill(it, identity == it, { identity = it }) }
                }
            }

            LawHeader(if (build) "1 · Görünür yap" else "1 · Görünmez yap", if (build) "İpucu olmadan davranış başlamaz." else "Tetikleyiciyi gözünün önünden kaldır.")
            Field(cue, { cue = it }, if (build) "Ne zaman, nerede?" else "İpucunu nasıl gizleyeceksin?", placeholder = if (build) "Saat 07:30'da mutfakta" else "Telefonu yatak odasının dışında şarj edeceğim")
            Spacer(Modifier.height(8.dp))
            Field(anchor, { anchor = it }, if (build) "Zincir: hangi alışkanlıktan sonra?" else "Dürtü genelde ne zaman gelir?", placeholder = if (build) "Sabah kahvemi koyduktan sonra" else "Yemekten sonra canım çektiğinde")
            if (build) {
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Templates.anchors.forEach { a -> Pill(a, anchor == a, { anchor = a }) }
                }
            }

            LawHeader(if (build) "2 · Cazip yap" else "2 · İtici yap", if (build) "Sevdiğin bir şeyle eşleştir." else "Gerçek bedelini görünür kıl.")
            Field(attractor, { attractor = it }, if (build) "Neyle eşleştireceksin?" else "Bu alışkanlık sana neye mal oluyor?", placeholder = if (build) "Sadece yürürken sevdiğim podcast'i dinleyeceğim" else "Her gece 1 saat uykumu çalıyor")

            LawHeader(if (build) "3 · Kolay yap" else "3 · Zorlaştır", if (build) "2 dakika kuralı: başlamak, bitirmekten önemli." else "Arana sürtünme koy, yerine bir eylem hazırla.")
            Field(tiny, { tiny = it }, if (build) "2 dakikalık versiyon" else "Dürtü gelince yerine ne yapacaksın?", placeholder = if (build) "Sadece ayakkabılarımı giyeceğim" else "10 derin nefes alıp su içeceğim")
            Spacer(Modifier.height(8.dp))
            Field(environment, { environment = it }, if (build) "Ortamı nasıl hazırlayacaksın?" else "Hangi engeli ekliyorsun?", placeholder = if (build) "Spor kıyafetimi akşamdan kapının önüne koyacağım" else "Uygulamayı ana ekrandan kaldıracağım")

            LawHeader(if (build) "4 · Tatmin edici yap" else "4 · Tatminsiz yap", if (build) "Beyin anında ödüllendirilen şeyi tekrarlar." else "Birine hesap ver; kaçamağın bir bedeli olsun.")
            Field(reward, { reward = it }, if (build) "Anında ödülün ne?" else "Kime hesap vereceksin?", placeholder = if (build) "Bitirince sevdiğim çayı demleyeceğim" else "Her temiz haftayı kardeşime bildireceğim")

            Spacer(Modifier.height(16.dp))
            val sentence = Plan.sentence(anchor, if (build) tiny.ifBlank { title } else tiny, identity)
            if (sentence.isNotBlank()) {
                GlassCard(Modifier.fillMaxWidth(), accent = Cine.Violet) {
                    Kicker("Eğer–o zaman planın", Cine.Violet)
                    Spacer(Modifier.height(4.dp))
                    Text("“$sentence”", style = MaterialTheme.typography.titleMedium, color = Cine.Text, fontStyle = FontStyle.Italic)
                    Text("Bu tür planlar hedefe ulaşma olasılığını belirgin şekilde artırır (Gollwitzer & Sheeran, 2006).", style = MaterialTheme.typography.bodySmall, color = Cine.Faint, modifier = Modifier.padding(top = 6.dp))
                }
            }

            if (build) {
                LawHeader("Hedef", "Sayılabilir bir hedef ister misin? (bardak, sayfa, dakika…)")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StepButton("−") { if (target > 1) target-- }
                    Text("$target", style = MaterialTheme.typography.headlineMedium, color = Cine.Gold, modifier = Modifier.padding(horizontal = 18.dp))
                    StepButton("+") { if (target < 100) target++ }
                    Spacer(Modifier.width(14.dp))
                    Field(unit, { unit = it.take(14) }, "Birim", Modifier.weight(1f), placeholder = "bardak")
                }
            }

            LawHeader("Takvim", "Her gün şart değil. Gerçekçi ol.")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Dates.dayLetters.forEachIndexed { i, l ->
                    val on = days and (1 shl i) != 0
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(if (on) Cine.Gold else Cine.SurfaceHi)
                            .clickable { val nd = days xor (1 shl i); if (nd != 0) days = nd },
                        contentAlignment = Alignment.Center,
                    ) { Text(l, color = if (on) Cine.Ink else Cine.Dim, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Hatırlatıcı", color = Cine.Text, style = MaterialTheme.typography.titleMedium)
                    Text(reminder?.let { "Her gün ${Dates.minuteLabel(it)} · değiştirmek için dokun" } ?: "Kapalı", color = Cine.Dim, style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.clickable {
                            val m = reminder ?: (9 * 60)
                            TimePickerDialog(context, android.R.style.Theme_Material_Dialog_Alert, { _, hh, mm -> reminder = hh * 60 + mm }, m / 60, m % 60, true).show()
                        })
                }
                Switch(reminder != null, { on ->
                    if (on) {
                        TimePickerDialog(context, android.R.style.Theme_Material_Dialog_Alert, { _, hh, mm -> reminder = hh * 60 + mm }, 9, 0, true).show()
                    } else reminder = null
                }, colors = SwitchDefaults.colors(checkedTrackColor = Cine.Gold, checkedThumbColor = Cine.Ink))
            }
            Spacer(Modifier.height(16.dp))
            Kicker("Renk", Cine.Dim)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Cine.habitColors.forEachIndexed { i, c ->
                    Box(Modifier.size(34.dp).clip(CircleShape).background(c).border(3.dp, if (i == color % Cine.habitColors.size) Cine.Text else Color.Transparent, CircleShape).clickable { color = i })
                }
            }
            Spacer(Modifier.height(24.dp))
            PrimaryButton(if (existing == null) "🎬 Sahneye ekle" else "Kaydet", {
                haptic()
                val h = Habit(
                    id = existing?.id ?: Store.newId(), profileId = existing?.profileId ?: p.id,
                    title = title.trim(), emoji = emoji, kind = kind, identity = identity.trim(), cue = cue.trim(), anchor = anchor.trim(),
                    attractor = attractor.trim(), tinyVersion = tiny.trim(), environment = environment.trim(), reward = reward.trim(),
                    target = if (build) target else 1, unit = if (build) unit.trim() else "", reminderMinute = reminder, daysMask = days,
                    colorIndex = color, createdEpochDay = existing?.createdEpochDay ?: Dates.today(), archived = existing?.archived ?: false,
                    templateId = templateId, order = existing?.order ?: 0,
                )
                Store.upsertHabit(h)
                nav.back()
            }, Modifier.fillMaxWidth(), enabled = title.isNotBlank())
            Spacer(Modifier.height(48.dp))
        }
    }
}

@Composable
private fun LawHeader(title: String, subtitle: String) {
    Spacer(Modifier.height(22.dp))
    Text(title, style = MaterialTheme.typography.headlineSmall, color = Cine.Text)
    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun StepButton(label: String, onClick: () -> Unit) {
    Box(Modifier.size(44.dp).clip(CircleShape).border(1.dp, Cine.Stroke, CircleShape).clickable { onClick() }, contentAlignment = Alignment.Center) {
        Text(label, color = Cine.Text, fontSize = 22.sp)
    }
}
