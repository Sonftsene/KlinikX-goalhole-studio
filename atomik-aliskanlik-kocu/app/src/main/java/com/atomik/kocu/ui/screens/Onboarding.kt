package com.atomik.kocu.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.atomik.kocu.content.Goal
import com.atomik.kocu.content.HabitTemplate
import com.atomik.kocu.content.Templates
import com.atomik.kocu.data.BodyInfo
import com.atomik.kocu.data.Dates
import com.atomik.kocu.data.HabitKind
import com.atomik.kocu.data.Profile
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Body
import com.atomik.kocu.domain.Plan
import com.atomik.kocu.ui.components.AtomCore
import com.atomik.kocu.ui.components.ChoiceCard
import com.atomik.kocu.ui.components.CinemaBackground
import com.atomik.kocu.ui.components.Electron
import com.atomik.kocu.ui.components.Field
import com.atomik.kocu.ui.components.GhostButton
import com.atomik.kocu.ui.components.GlassCard
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.components.Letterbox
import com.atomik.kocu.ui.components.Pill
import com.atomik.kocu.ui.components.PrimaryButton
import com.atomik.kocu.ui.components.Typewriter
import com.atomik.kocu.ui.components.rememberHaptic
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

val Avatars = listOf("🦁", "🦊", "🐺", "🦅", "🐉", "🌙", "☀️", "🔥", "🌊", "⚡", "🎬", "🧠", "🌱", "💎", "🚀", "🎧", "🦋", "🐢")

private const val PROLOG = 0
private const val NAME = 1
private const val GOALS = 2
private const val IDENTITY = 3
private const val ENERGY = 4
private const val BODY = 5
private const val WRITING = 6
private const val REVEAL = 7

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Onboarding(firstRun: Boolean, onFinish: () -> Unit, onCancel: (() -> Unit)? = null) {
    var step by rememberSaveable { mutableIntStateOf(if (firstRun) PROLOG else NAME) }
    var name by rememberSaveable { mutableStateOf("") }
    var avatar by rememberSaveable { mutableStateOf(Avatars.first()) }
    val goals = remember { mutableStateListOf<Goal>() }
    val identities = remember { mutableStateListOf<String>() }
    var customIdentity by rememberSaveable { mutableStateOf("") }
    var energy by rememberSaveable { mutableIntStateOf(1) }
    var body by remember { mutableStateOf<BodyInfo?>(null) }
    val plan = remember { mutableStateListOf<HabitTemplate>() }
    val included = remember { mutableStateListOf<String>() }
    val haptic = rememberHaptic()

    fun needsBody() = goals.contains(Goal.LOSE_WEIGHT) || goals.contains(Goal.GAIN_WEIGHT)
    fun next(to: Int) { haptic(); step = to }

    CinemaBackground(accent = if (step == REVEAL) Cine.Gold else Cine.Violet) {
        AnimatedContent(
            targetState = step,
            transitionSpec = { (fadeIn(tween(800)) + slideInVertically(tween(800)) { it / 14 }) togetherWith fadeOut(tween(350)) },
            label = "onb",
            modifier = Modifier.fillMaxSize(),
        ) { s ->
            Column(
                Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()
                    .then(if (s != PROLOG && s != WRITING) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = if (s == PROLOG || s == WRITING) Arrangement.Center else Arrangement.Top,
            ) {
                when (s) {
                    PROLOG -> Prolog(onOpen = { next(NAME) })

                    NAME -> {
                        StepHeader("Sahne 1 · Başrol", "Bu filmin başrolü kim?", "Sadece adın yeter. Gerisini biz yazacağız.")
                        Field(name, { name = it.take(24) }, "Adın ya da takma adın")
                        Spacer(Modifier.height(20.dp))
                        Kicker("Karakterini seç", Cine.Dim)
                        Spacer(Modifier.height(10.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Avatars.forEach { a ->
                                val sel = a == avatar
                                Box(
                                    Modifier.size(52.dp).clip(CircleShape)
                                        .background(if (sel) Cine.Gold.copy(alpha = 0.22f) else Cine.SurfaceHi)
                                        .clickable { avatar = a; haptic() },
                                    contentAlignment = Alignment.Center,
                                ) { Text(a, fontSize = 26.sp) }
                            }
                        }
                        Spacer(Modifier.height(32.dp))
                        PrimaryButton("Devam", { next(GOALS) }, Modifier.fillMaxWidth(), enabled = name.isNotBlank())
                        if (onCancel != null) { Spacer(Modifier.height(10.dp)); GhostButton("Vazgeç", onCancel, Modifier.fillMaxWidth()) }
                    }

                    GOALS -> {
                        StepHeader("Sahne 2 · Senaryo", "Hangi hikâyeyi yazıyoruz, $name?", "En fazla 3 tane seç. Her şey sonradan değiştirilebilir.")
                        Goal.entries.forEach { g ->
                            val sel = g in goals
                            ChoiceCard(g.emoji, g.title, g.tagline, sel, {
                                haptic()
                                if (sel) goals.remove(g) else if (goals.size < 3) goals.add(g)
                            }, Modifier.fillMaxWidth().padding(vertical = 5.dp))
                        }
                        Spacer(Modifier.height(20.dp))
                        PrimaryButton("Devam", {
                            identities.clear()
                            goals.forEach { g -> Templates.identities[g]?.firstOrNull()?.let { if (it !in identities) identities.add(it) } }
                            next(IDENTITY)
                        }, Modifier.fillMaxWidth(), enabled = goals.isNotEmpty())
                    }

                    IDENTITY -> {
                        StepHeader("Sahne 3 · Karakter", "Filmin sonunda kim olacaksın?", "Kalıcı değişim “ne elde etmek istediğinden” değil, “kim olmak istediğinden” başlar. Her tekrar bu kimliğe verilen bir oy olacak.")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            goals.flatMap { Templates.identities[it].orEmpty() }.distinct().forEach { idt ->
                                Pill(idt, idt in identities, { haptic(); if (idt in identities) identities.remove(idt) else identities.add(idt) })
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                        Field(customIdentity, { customIdentity = it.take(60) }, "Kendi cümlen (isteğe bağlı)", placeholder = "Ben … biriyim")
                        Spacer(Modifier.height(28.dp))
                        PrimaryButton("Devam", {
                            if (customIdentity.isNotBlank() && customIdentity !in identities) identities.add(customIdentity.trim())
                            next(ENERGY)
                        }, Modifier.fillMaxWidth(), enabled = identities.isNotEmpty() || customIdentity.isNotBlank())
                    }

                    ENERGY -> {
                        StepHeader("Sahne 4 · Yakıt", "Dürüst ol: ne kadar enerjin var?", "Az ile başlayanlar daha uzun sürdürür. Motivasyon dalgalanır; küçük alışkanlık dalgalanmaz.")
                        listOf(
                            Triple(1, "🕯️  Az enerji", "Tek bir minik sahne. Üşengeçler için en akıllı başlangıç."),
                            Triple(2, "🔋  Orta", "İki küçük sahne."),
                            Triple(3, "⚡  Hazırım", "Üç sahne. Yine de hepsi 2 dakikalık versiyonlu."),
                        ).forEach { (v, t, sub) ->
                            ChoiceCard("", t, sub, energy == v, { haptic(); energy = v }, Modifier.fillMaxWidth().padding(vertical = 6.dp))
                        }
                        Spacer(Modifier.height(28.dp))
                        PrimaryButton("Devam", { next(if (needsBody()) BODY else WRITING) }, Modifier.fillMaxWidth())
                    }

                    BODY -> BodyStep(
                        initial = body ?: BodyInfo(),
                        gaining = goals.contains(Goal.GAIN_WEIGHT) && !goals.contains(Goal.LOSE_WEIGHT),
                        onDone = { body = it; next(WRITING) },
                        onSkip = { body = null; next(WRITING) },
                    )

                    WRITING -> WritingScene(name) {
                        plan.clear(); included.clear()
                        val unsafe = body?.let { Body.lossUnsafe(it) } == true
                        plan.addAll(Plan.generate(goals.toList(), energy, excludeLoss = unsafe))
                        included.addAll(plan.map { it.id })
                        step = REVEAL
                    }

                    REVEAL -> {
                        var shown by remember { mutableIntStateOf(0) }
                        LaunchedEffect(Unit) { while (shown < plan.size + 1) { delay(550); shown++ } }
                        Spacer(Modifier.height(10.dp))
                        Kicker("Senaryo hazır")
                        Text("$avatar $name: Bölüm I", style = MaterialTheme.typography.displayMedium, color = Cine.Text)
                        Spacer(Modifier.height(6.dp))
                        Text(identities.firstOrNull() ?: "", style = MaterialTheme.typography.titleMedium, color = Cine.Gold)
                        Spacer(Modifier.height(18.dp))
                        if (body?.let { Body.lossUnsafe(it) } == true) {
                            GlassCard(accent = Cine.Ember) {
                                Text("⚠️ Kilo verme sahneleri senin için kapatıldı", color = Cine.Ember, fontWeight = FontWeight.Bold)
                                Text("Vücut kitle indeksin sağlıklı aralığın altında ya da hedefin oraya düşüyor. Bunun yerine güç ve iyi oluş sahneleri ekledik. Bir sağlık uzmanıyla görüşmeni öneririz.", color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
                            }
                            Spacer(Modifier.height(12.dp))
                        }
                        plan.forEachIndexed { i, t ->
                            AnimatedVisibility(visible = shown > i, enter = fadeIn(tween(600)) + slideInVertically(tween(600)) { it / 3 }) {
                                val on = t.id in included
                                GlassCard(Modifier.fillMaxWidth().padding(vertical = 6.dp).alpha(if (on) 1f else 0.45f), accent = Cine.habit(i)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(t.emoji, fontSize = 30.sp)
                                        Spacer(Modifier.width(12.dp))
                                        Column(Modifier.weight(1f)) {
                                            Kicker("Sahne ${i + 1}" + if (t.kind == HabitKind.BREAK) " · Gölge" else "", Cine.habit(i))
                                            Text(t.title, style = MaterialTheme.typography.titleLarge, color = Cine.Text)
                                        }
                                        Switch(on, { if (on) included.remove(t.id) else included.add(t.id) }, colors = SwitchDefaults.colors(checkedTrackColor = Cine.Gold, checkedThumbColor = Cine.Ink))
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    Text("“" + Plan.sentence(t.anchor, t.tinyVersion, "") + "”", style = MaterialTheme.typography.bodyMedium, color = Cine.Text.copy(alpha = 0.85f))
                                    t.defaultMinute?.let { Text("⏰ ${Dates.minuteLabel(it)} hatırlatma", style = MaterialTheme.typography.bodySmall, color = Cine.Dim, modifier = Modifier.padding(top = 6.dp)) }
                                }
                            }
                        }
                        AnimatedVisibility(visible = shown > plan.size, enter = fadeIn(tween(800))) {
                            Column {
                                Spacer(Modifier.height(10.dp))
                                Text("Kalan bölümler kilitli. Her gün verdiğin oylarla açılacaklar.", color = Cine.Dim, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                                Spacer(Modifier.height(18.dp))
                                PrimaryButton("🎬  Çekim başlasın", {
                                    haptic()
                                    val today = Dates.today()
                                    val pid = Store.newId()
                                    val profile = Profile(
                                        id = pid, name = name.trim(), avatar = avatar, identities = identities.toList(),
                                        goals = goals.map { it.name }, energy = energy, startEpochDay = today, body = body,
                                    )
                                    val habits = plan.filter { it.id in included }.mapIndexed { i, t -> Plan.toHabit(t, pid, today, i, Store.newId(), i) }
                                    Store.addProfile(profile, habits)
                                    onFinish()
                                }, Modifier.fillMaxWidth())
                            }
                        }
                    }
                }
            }
        }
        Letterbox(visible = step == PROLOG || step == WRITING)
    }
}

@Composable
private fun StepHeader(kicker: String, title: String, subtitle: String) {
    Spacer(Modifier.height(18.dp))
    Kicker(kicker)
    Spacer(Modifier.height(6.dp))
    Text(title, style = MaterialTheme.typography.headlineLarge, color = Cine.Text)
    Spacer(Modifier.height(8.dp))
    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Cine.Dim)
    Spacer(Modifier.height(22.dp))
}

@Composable
private fun Prolog(onOpen: () -> Unit) {
    val lines = listOf(
        "Her gün, farkında olmadan bir oy veriyorsun.",
        "Kim olacağına dair.",
        "Çoğu insan bu oyları hiç saymaz.",
        "Sen sayacaksın.",
    )
    var idx by remember { mutableIntStateOf(0) }
    var titleShown by remember { mutableStateOf(false) }
    val spacing by animateFloatAsState(if (titleShown) 10f else 40f, tween(2200), label = "sp")
    val alpha by animateFloatAsState(if (titleShown) 1f else 0f, tween(2000), label = "al")
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth().height(170.dp), contentAlignment = Alignment.Center) {
            if (!titleShown) {
                Typewriter(
                    lines[idx], style = MaterialTheme.typography.headlineSmall, color = Cine.Text,
                    textAlign = TextAlign.Center, startDelay = 500, charDelay = 45,
                    onDone = {},
                )
                LaunchedEffect(idx) {
                    delay(500L + lines[idx].length * 45L + 1700L)
                    if (idx < lines.lastIndex) idx++ else titleShown = true
                }
            } else {
                AtomCore(0.35f, List(3) { Electron(Cine.habit(it), true) }, size = 170.dp)
            }
        }
        Spacer(Modifier.height(20.dp))
        Text("ATOMİK", fontSize = 46.sp, letterSpacing = spacing.sp, fontWeight = FontWeight.Black, color = Cine.Gold, modifier = Modifier.alpha(alpha), fontFamily = Cine.Serif)
        Text("ALIŞKANLIK KOÇU", style = MaterialTheme.typography.labelSmall, color = Cine.Dim, modifier = Modifier.alpha(alpha))
        Spacer(Modifier.height(48.dp))
        if (titleShown) {
            PrimaryButton("Perdeyi aç", onOpen, Modifier.fillMaxWidth())
        } else {
            Text("atla ›", color = Cine.Faint, modifier = Modifier.clickable { titleShown = true }.padding(12.dp))
        }
    }
}

@Composable
private fun WritingScene(name: String, onDone: () -> Unit) {
    val lines = listOf(
        "Kimliğin analiz ediliyor…",
        "Sürtünme noktaları hesaplanıyor…",
        "İpuçları sahneye yerleştiriliyor…",
        "2 dakikalık versiyonlar kısaltılıyor…",
        "Gizli bölümler mühürleniyor…",
    )
    var idx by remember { mutableIntStateOf(0) }
    var prog by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        lines.indices.forEach { i -> idx = i; prog = (i + 1f) / lines.size; delay(900) }
        delay(400)
        onDone()
    }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        AtomCore(prog, List(5) { Electron(Cine.habit(it), it < (prog * 5).roundToInt()) }, size = 220.dp)
        Spacer(Modifier.height(30.dp))
        Kicker("Senaryo yazılıyor · $name")
        Spacer(Modifier.height(10.dp))
        Box(Modifier.height(30.dp)) { Typewriter(lines[idx], style = MaterialTheme.typography.titleMedium, color = Cine.Text, charDelay = 18) }
    }
}

@Composable
fun BodyStep(initial: BodyInfo, gaining: Boolean, onDone: (BodyInfo) -> Unit, onSkip: (() -> Unit)?) {
    var female by remember { mutableStateOf(initial.female) }
    var birth by remember { mutableFloatStateOf(initial.birthYear.toFloat()) }
    var height by remember { mutableFloatStateOf(initial.heightCm.toFloat()) }
    var weight by remember { mutableFloatStateOf(initial.weightKg.toFloat()) }
    var target by remember { mutableFloatStateOf((if (initial.targetKg == initial.weightKg) initial.weightKg + if (gaining) 4 else -4 else initial.targetKg).toFloat()) }
    var activity by remember { mutableIntStateOf(initial.activity) }
    val info = BodyInfo(female, birth.roundToInt(), height.roundToInt(), (weight * 2).roundToInt() / 2.0, (target * 2).roundToInt() / 2.0, activity)
    StepHeader("Sahne 5 · Beden", "Bedenini tanıyalım", "Hesaplamalar bilimsel formüllerle (Mifflin-St Jeor) yapılır ve sadece cihazında saklanır.")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Pill("Kadın", female, { female = true })
        Pill("Erkek", !female, { female = false })
    }
    SliderRow("Doğum yılı", "${birth.roundToInt()}", birth, 1940f..2012f) { birth = it }
    SliderRow("Boy", "${height.roundToInt()} cm", height, 140f..210f) { height = it }
    SliderRow("Kilo", "${"%.1f".format(info.weightKg)} kg", weight, 35f..180f) { weight = it }
    SliderRow("Hedef kilo", "${"%.1f".format(info.targetKg)} kg", target, 35f..180f) { target = it }
    Spacer(Modifier.height(8.dp))
    Kicker("Hareket düzeyi", Cine.Dim)
    Spacer(Modifier.height(8.dp))
    @OptIn(ExperimentalLayoutApi::class)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Body.activityLabels.forEachIndexed { i, l -> Pill(l, activity == i, { activity = i }) }
    }
    Spacer(Modifier.height(16.dp))
    GlassCard(accent = if (Body.lossUnsafe(info)) Cine.Ember else Cine.Teal) {
        Text("VKİ ${"%.1f".format(Body.bmi(info))} · ${Body.bmiLabel(Body.bmi(info))}", color = Cine.Text, fontWeight = FontWeight.Bold)
        Text("Günlük ihtiyaç ≈ ${Body.tdee(info)} kcal · Hedef ≈ ${Body.targetCalories(info)} kcal", color = Cine.Dim, style = MaterialTheme.typography.bodySmall)
        Body.weeksToTarget(info)?.let { Text("Güvenli hızla hedefe ≈ $it hafta", color = Cine.Dim, style = MaterialTheme.typography.bodySmall) }
        if (Body.lossUnsafe(info)) Text("Bu hedef sağlıklı aralığın altında. Kilo verme önerilmeyecek.", color = Cine.Ember, style = MaterialTheme.typography.bodySmall)
    }
    Spacer(Modifier.height(20.dp))
    PrimaryButton("Kaydet ve devam", { onDone(info) }, Modifier.fillMaxWidth())
    if (onSkip != null) {
        Spacer(Modifier.height(10.dp))
        GhostButton("Şimdilik atla", onSkip, Modifier.fillMaxWidth())
    }
}

@Composable
fun SliderRow(label: String, value: String, v: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit) {
    Spacer(Modifier.height(10.dp))
    Row(Modifier.fillMaxWidth()) {
        Text(label, color = Cine.Dim, modifier = Modifier.weight(1f))
        Text(value, color = Cine.Gold, fontWeight = FontWeight.Bold)
    }
    Slider(v, onChange, valueRange = range, colors = SliderDefaults.colors(thumbColor = Cine.Gold, activeTrackColor = Cine.Gold, inactiveTrackColor = Cine.Stroke))
}
