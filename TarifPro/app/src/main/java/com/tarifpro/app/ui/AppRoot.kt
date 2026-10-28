package com.tarifpro.app.ui

import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.AddCircleOutline
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Forum
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tarifpro.app.AppContainer
import com.tarifpro.app.MainActivity
import com.tarifpro.app.export.RecipeImporter
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.formatClock
import com.tarifpro.app.ui.screens.AdminScreen
import com.tarifpro.app.ui.screens.CardDesignerScreen
import com.tarifpro.app.ui.screens.ChatScreen
import com.tarifpro.app.ui.screens.CloudSetupScreen
import com.tarifpro.app.ui.screens.CollectionScreen
import com.tarifpro.app.ui.screens.EditorScreen
import com.tarifpro.app.ui.screens.HomeScreen
import com.tarifpro.app.ui.screens.ImportScreen
import com.tarifpro.app.ui.screens.LoginScreen
import com.tarifpro.app.ui.screens.NotebookScreen
import com.tarifpro.app.ui.screens.NotificationsScreen
import com.tarifpro.app.ui.screens.ProfileScreen
import com.tarifpro.app.ui.screens.RecipeDetailScreen
import com.tarifpro.app.ui.screens.RecipeListScreen
import com.tarifpro.app.ui.screens.SearchScreen
import com.tarifpro.app.ui.screens.SettingsScreen
import com.tarifpro.app.ui.screens.ShareToChatScreen
import com.tarifpro.app.ui.screens.ShoppingScreen
import com.tarifpro.app.ui.screens.SocialScreen
import com.tarifpro.app.ui.screens.TimersScreen
import com.tarifpro.app.ui.theme.TarifProTheme

private data class Tab(val route: String, val label: String, val icon: ImageVector, val selectedIcon: ImageVector)

private val tabs = listOf(
    Tab("home", "Keşfet", Icons.Outlined.Explore, Icons.Filled.Explore),
    Tab("search", "Ara", Icons.Outlined.Search, Icons.Filled.Search),
    Tab("create", "Ekle", Icons.Outlined.AddCircleOutline, Icons.Filled.AddCircle),
    Tab("notebook", "Defterim", Icons.Outlined.MenuBook, Icons.Filled.MenuBook),
    Tab("social", "Topluluk", Icons.Outlined.Forum, Icons.Filled.Forum),
)

@Composable
fun AppRoot(container: AppContainer, activity: MainActivity) {
    val settings by container.settings.state.collectAsStateWithLifecycle()
    TarifProTheme(settings.themeMode, settings.dynamicColor) {
        CompositionLocalProvider(LocalContainer provides container) {
            val session by container.auth.session.collectAsStateWithLifecycle()
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                if (session == null) LoginScreen() else MainScaffold(activity)
            }
            RingingTimersDialog()
        }
    }
}

fun NavHostController.openTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MainScaffold(activity: MainActivity) {
    val container = LocalContainer.current
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val unreadChats by container.social.unreadChats.collectAsStateWithLifecycle()

    val pending by activity.pendingRoute
    LaunchedEffect(pending) {
        val r = pending ?: return@LaunchedEffect
        activity.pendingRoute.value = null
        try {
            nav.navigate(r)
        } catch (e: Exception) {
            // bilinmeyen hedef
        }
    }
    val shared by activity.pendingSharedText
    LaunchedEffect(shared) {
        val text = shared ?: return@LaunchedEffect
        activity.pendingSharedText.value = null
        val url = Regex("""https?://\S+""").find(text)?.value
        if (url != null) {
            nav.navigate("import?url=" + Uri.encode(url))
        } else {
            container.pendingImport = RecipeImporter.fromText(text)
            nav.navigate("editor?import=true")
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            if (tabs.any { it.route == route }) {
                NavigationBar {
                    tabs.forEach { tab ->
                        val selected = route == tab.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { if (tab.route == "create") nav.navigate("editor") else nav.openTab(tab.route) },
                            icon = {
                                BadgedBox(badge = { if (tab.route == "social" && unreadChats > 0) Badge { Text(unreadChats.toString()) } }) {
                                    Icon(if (selected) tab.selectedIcon else tab.icon, contentDescription = tab.label)
                                }
                            },
                            label = { Text(tab.label, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(padding).consumeWindowInsets(padding)) {
            composable("home") { HomeScreen(nav) }
            composable("search") { SearchScreen(nav) }
            composable("notebook") { NotebookScreen(nav) }
            composable("social") { SocialScreen(nav) }
            composable(
                "recipe/{id}?tab={tab}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }, navArgument("tab") { type = NavType.IntType; defaultValue = 0 }),
            ) { e -> RecipeDetailScreen(nav, e.arguments?.getString("id") ?: "", e.arguments?.getInt("tab") ?: 0) }
            composable(
                "editor?id={id}&import={import}",
                arguments = listOf(
                    navArgument("id") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("import") { type = NavType.BoolType; defaultValue = false },
                ),
            ) { e -> EditorScreen(nav, e.arguments?.getString("id"), e.arguments?.getBoolean("import") ?: false) }
            composable(
                "import?url={url}",
                arguments = listOf(navArgument("url") { type = NavType.StringType; defaultValue = "" }),
            ) { e -> ImportScreen(nav, e.arguments?.getString("url") ?: "") }
            composable(
                "designer/{id}?servings={servings}",
                arguments = listOf(navArgument("id") { type = NavType.StringType }, navArgument("servings") { type = NavType.IntType; defaultValue = -1 }),
            ) { e -> CardDesignerScreen(nav, e.arguments?.getString("id") ?: "", e.arguments?.getInt("servings") ?: -1) }
            composable("collection/{id}") { e -> CollectionScreen(nav, e.arguments?.getString("id") ?: "") }
            composable("list/{kind}") { e -> RecipeListScreen(nav, e.arguments?.getString("kind") ?: "favorites") }
            composable("shopping") { ShoppingScreen(nav) }
            composable("timers") { TimersScreen(nav) }
            composable("chat/{id}") { e -> ChatScreen(nav, e.arguments?.getString("id") ?: "") }
            composable("share-chat/{recipeId}") { e -> ShareToChatScreen(nav, e.arguments?.getString("recipeId") ?: "") }
            composable("user/{id}") { e -> ProfileScreen(nav, e.arguments?.getString("id") ?: "") }
            composable("settings") { SettingsScreen(nav) }
            composable("cloud") { CloudSetupScreen(onBack = { nav.popBackStack() }) }
            composable("admin") { AdminScreen(nav) }
            composable("notifications") { NotificationsScreen(nav) }
        }
    }
}

@Composable
private fun RingingTimersDialog() {
    val container = LocalContainer.current
    val ringing by container.timers.ringing.collectAsStateWithLifecycle()
    if (ringing.isEmpty()) return
    AlertDialog(
        onDismissRequest = { ringing.forEach { container.timers.dismiss(it.id) } },
        title = { Text("⏰ Süre doldu!") },
        text = {
            Column {
                ringing.forEach { t ->
                    Text("• ${t.label}" + (t.recipeTitle?.let { " — $it" } ?: ""), style = MaterialTheme.typography.bodyLarge)
                    Text("Toplam süre: ${formatClock(t.totalMs)}", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = { TextButton(onClick = { ringing.forEach { container.timers.dismiss(it.id) } }) { Text("Tamam, kapat") } },
        dismissButton = { TextButton(onClick = { ringing.forEach { container.timers.addTime(it.id, 1) } }) { Text("+1 dk ertele") } },
    )
}
