package com.atomik.kocu.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.atomik.kocu.data.Store
import com.atomik.kocu.domain.Achievement
import com.atomik.kocu.domain.Achievements
import com.atomik.kocu.domain.Stats
import com.atomik.kocu.ui.components.Kicker
import com.atomik.kocu.ui.screens.*
import com.atomik.kocu.ui.theme.Cine
import kotlinx.coroutines.delay

class Navigator(val go: (String) -> Unit, val back: () -> Unit)

val LocalNav = staticCompositionLocalOf<Navigator> { error("Navigator yok") }

private val tabRoutes = listOf("home", "journey", "lab", "mind", "profile")

@Composable
fun AppRoot() {
    val d by Store.data.collectAsStateWithLifecycle()
    var unlocked by rememberSaveable { mutableStateOf(false) }
    val pin = d.settings.pin
    if (pin != null && !unlocked) {
        LockScreen(pin) { unlocked = true }
        return
    }
    if (d.profiles.isEmpty()) {
        Onboarding(firstRun = true, onFinish = {})
        return
    }

    val context = LocalContext.current
    val nav = rememberNavController()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val navigator = remember(nav) {
        Navigator(
            go = { route ->
                val t = tabRoutes.indexOf(route)
                when {
                    t >= 0 -> { tab = t; nav.popBackStack("main", inclusive = false) }
                    route.startsWith("share_") -> ShareActions.handle(context, route)
                    else -> nav.navigate(route) { launchSingleTop = true }
                }
            },
            back = { if (nav.previousBackStackEntry != null) nav.popBackStack() else tab = 0 },
        )
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    // Başarım tespiti
    val toasts = remember { mutableStateListOf<Achievement>() }
    LaunchedEffect(d) {
        val p = Store.activeProfile(d) ?: return@LaunchedEffect
        val earned = Achievements.earned(d, p, Stats(d))
        val fresh = earned - p.achievements.toSet()
        if (fresh.isNotEmpty()) {
            val bonus = fresh.count { it in setOf("streak7", "streak21", "streak30", "streak66") }
            Store.updateProfile(p.id) { it.copy(achievements = it.achievements + fresh, freezeTokens = minOf(5, it.freezeTokens + bonus)) }
            toasts.addAll(fresh.mapNotNull { Achievements.byId(it) })
        }
    }

    CompositionLocalProvider(LocalNav provides navigator) {
        Box(Modifier.fillMaxSize().background(Cine.Ink)) {
            Routes(nav, tab) { tab = it }
            AchievementToast(toasts)
        }
    }
}

@Composable
private fun Routes(nav: NavHostController, tab: Int, onTab: (Int) -> Unit) {
    NavHost(
        nav, startDestination = "main",
        enterTransition = { fadeIn(tween(450)) + scaleIn(tween(450), initialScale = 0.97f) },
        exitTransition = { fadeOut(tween(250)) },
        popEnterTransition = { fadeIn(tween(350)) },
        popExitTransition = { fadeOut(tween(250)) },
    ) {
        composable("main") { MainTabs(tab, onTab) }
        composable("habit_new") { HabitEditor(null) }
        composable("habit_edit/{id}") { HabitEditor(it.arguments?.getString("id")) }
        composable("habit/{id}") { HabitDetail(it.arguments?.getString("id") ?: "") }
        composable("chapter/{id}") { ChapterReveal(it.arguments?.getString("id") ?: "") }
        composable("card/{id}") { CardView(it.arguments?.getString("id") ?: "") }
        composable("archive") { ArchiveScreen() }
        composable("capsule") { CapsuleScreen() }
        composable("chain") { ChainScreen() }
        composable("urge") { UrgeScreen(null) }
        composable("urge/{id}") { UrgeScreen(it.arguments?.getString("id")) }
        composable("breath") { BreathScreen() }
        composable("ground") { GroundScreen() }
        composable("thought") { ThoughtScreen() }
        composable("assess/{type}") { AssessmentScreen(it.arguments?.getString("type") ?: "PHQ9", null) }
        composable("srbai/{id}") { AssessmentScreen("SRBAI", it.arguments?.getString("id")) }
        composable("crisis") { CrisisScreen() }
        composable("body") { BodyScreen() }
        composable("trailer") { TrailerScreen() }
        composable("sources") { SourcesScreen() }
        composable("settings") { SettingsScreen() }
        composable("mood") { MoodScreen() }
        composable("onboarding_add") {
            val n = LocalNav.current
            Onboarding(firstRun = false, onFinish = { n.go("home") }, onCancel = { n.back() })
        }
    }
}

@Composable
private fun MainTabs(tab: Int, onTab: (Int) -> Unit) {
    Box(Modifier.fillMaxSize()) {
        AnimatedContent(tab, transitionSpec = { fadeIn(tween(380)) togetherWith fadeOut(tween(200)) }, label = "tabs") { t ->
            when (t) {
                0 -> HomeTab()
                1 -> JourneyTab()
                2 -> LabTab()
                3 -> MindTab()
                else -> ProfileTab()
            }
        }
        BottomBar(tab, onTab, Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun BottomBar(tab: Int, onTab: (Int) -> Unit, modifier: Modifier) {
    val items = listOf("⚛️" to "Sahne", "🎞️" to "Yolculuk", "🧪" to "Lab", "🌗" to "Denge", "🎭" to "Profil")
    Box(
        modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Cine.Ink.copy(alpha = 0f), Cine.Ink.copy(alpha = 0.95f), Cine.Ink)))
            .navigationBarsPadding().padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 10.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Cine.SurfaceHi.copy(alpha = 0.92f))
                .border(1.dp, Cine.Stroke, RoundedCornerShape(28.dp)).padding(vertical = 8.dp),
        ) {
            items.forEachIndexed { i, (icon, label) ->
                val sel = i == tab
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(20.dp)).clickable { onTab(i) }.padding(vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(icon, fontSize = if (sel) 22.sp else 19.sp, modifier = Modifier.alpha(if (sel) 1f else 0.45f))
                    Text(label, fontSize = 10.sp, color = if (sel) Cine.Gold else Cine.Faint, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal)
                    Box(Modifier.padding(top = 3.dp).width(if (sel) 16.dp else 0.dp).height(2.dp).background(Cine.Gold, RoundedCornerShape(1.dp)))
                }
            }
        }
    }
}

@Composable
private fun AchievementToast(queue: MutableList<Achievement>) {
    val current = queue.firstOrNull()
    LaunchedEffect(current) {
        if (current != null) { delay(3200); queue.removeAt(0) }
    }
    AnimatedVisibility(
        visible = current != null,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
        modifier = Modifier.statusBarsPadding().padding(16.dp),
    ) {
        val a = current ?: return@AnimatedVisibility
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))
                .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Cine.SurfaceHi, Cine.Surface)))
                .border(1.dp, Cine.Gold.copy(alpha = 0.6f), RoundedCornerShape(22.dp)).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(a.emoji, fontSize = 30.sp)
            Spacer(Modifier.width(12.dp))
            Column {
                Kicker("Başarım açıldı")
                Text(a.title, style = MaterialTheme.typography.titleMedium, color = Cine.Text)
                Text(a.description, style = MaterialTheme.typography.bodySmall, color = Cine.Dim)
            }
        }
    }
}
