package com.tarifpro.app.ui.screens

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.BuildConfig
import com.tarifpro.app.data.AppSettings
import com.tarifpro.app.data.CloudConfig
import com.tarifpro.app.data.SessionMode
import com.tarifpro.app.data.ThemeMode
import com.tarifpro.app.export.Templates
import com.tarifpro.app.notify.Notifier
import com.tarifpro.app.ui.components.Avatar
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.relativeTime
import kotlinx.coroutines.launch
import java.security.MessageDigest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(nav: NavController) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settings by container.settings.state.collectAsStateWithLifecycle()
    val session by container.auth.session.collectAsStateWithLifecycle()
    val sync by container.sync.status.collectAsStateWithLifecycle()
    var confirmLogout by remember { mutableStateOf(false) }
    fun update(t: (AppSettings) -> AppSettings) = container.settings.update(t)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ayarlar") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(bottom = 32.dp)) {
            item {
                Card(Modifier.fillMaxWidth().padding(16.dp), shape = RoundedCornerShape(24.dp)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(session?.name ?: "", session?.photo, 56.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(session?.name ?: "", style = MaterialTheme.typography.titleMedium)
                            Text(
                                if (session?.mode == SessionMode.GOOGLE) "Google hesabı • ${session?.email}" else "Misafir (yalnızca bu cihaz)",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (session?.isAdmin == true) Text("🛡️ Yönetici", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        }
                        IconButton(onClick = { confirmLogout = true }) { Icon(Icons.AutoMirrored.Filled.Logout, "Çıkış yap") }
                    }
                    if (session?.mode == SessionMode.GUEST) {
                        Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp)) {
                            Text("Tariflerinizi tüm cihazlarınızda görmek için Google ile giriş yapın. Misafir tarifleriniz hesabınıza taşınır.", style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = {
                                if (!container.auth.googleAvailable) nav.navigate("cloud")
                                else scope.launch {
                                    val r = container.auth.signInWithGoogle(context as Activity)
                                    r.exceptionOrNull()?.let { Toast.makeText(context, it.message, Toast.LENGTH_LONG).show() }
                                }
                            }) { Text("Google ile giriş yap ve senkronize et") }
                        }
                    }
                }
            }
            item { SettingsHeader("☁️ Bulut senkronizasyonu") }
            item {
                ListItem(
                    leadingContent = { Icon(Icons.Filled.CloudSync, null) },
                    headlineContent = { Text(sync.message.ifBlank { "Hazır" }) },
                    supportingContent = { Text(if (sync.lastSync > 0) "Son senkronizasyon: ${relativeTime(sync.lastSync)}" else "Çevrimdışı önbellek her zaman açık") },
                    trailingContent = {
                        IconButton(onClick = { scope.launch { val ok = container.sync.syncNow(); Toast.makeText(context, if (ok) "Senkronize edildi ✓" else "Senkronizasyon yapılamadı", Toast.LENGTH_SHORT).show() } }) {
                            Icon(Icons.Filled.Sync, "Şimdi senkronize et")
                        }
                    },
                )
            }
            item {
                ListItem(
                    modifier = Modifier.padding(horizontal = 0.dp),
                    headlineContent = { Text("Bulut & Google girişi kurulumu") },
                    supportingContent = { Text(if (container.cloudConfig.isConfigured) "Firebase projesi: ${container.cloudConfig.projectId}" else "Henüz yapılandırılmadı – yerel modda çalışıyor") },
                    trailingContent = { TextButton(onClick = { nav.navigate("cloud") }) { Text("Aç") } },
                )
            }
            item { SettingsHeader("🎨 Görünüm") }
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Text("Tema", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(6.dp))
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        ThemeMode.entries.forEachIndexed { i, m ->
                            SegmentedButton(selected = settings.themeMode == m, onClick = { update { it.copy(themeMode = m) } }, shape = SegmentedButtonDefaults.itemShape(i, ThemeMode.entries.size)) {
                                Text(when (m) { ThemeMode.SYSTEM -> "🌓 Sistem"; ThemeMode.LIGHT -> "☀️ Açık"; ThemeMode.DARK -> "🌙 Koyu" })
                            }
                        }
                    }
                }
            }
            if (Build.VERSION.SDK_INT >= 31) {
                item { SwitchRow("Dinamik renkler (Material You)", "Duvar kağıdınızın renklerini kullan", settings.dynamicColor) { v -> update { it.copy(dynamicColor = v) } } }
            }
            item {
                Column(Modifier.padding(16.dp)) {
                    Text("Varsayılan tarif kartı şablonu", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(6.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(Templates.all) { t -> TemplateChip(t.id, settings.defaultTemplate == t.id) { update { s -> s.copy(defaultTemplate = t.id) } } }
                    }
                }
            }
            item { SettingsHeader("🔔 Bildirimler") }
            item {
                val enabled = container.notifier.canPost()
                if (!enabled) {
                    Card(Modifier.padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text("Bildirim izni kapalı. Zamanlayıcı alarmları ve mesajlar için açın.", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = {
                                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                                context.startActivity(intent)
                            }) { Text("Aç") }
                        }
                    }
                }
            }
            item { SwitchRow("💬 Yorumlar", "Tariflerinize yorum yapıldığında", settings.notifyComments) { v -> update { it.copy(notifyComments = v) } } }
            item { SwitchRow("⭐ Puanlar", "Tariflerinize puan verildiğinde", settings.notifyRatings) { v -> update { it.copy(notifyRatings = v) } } }
            item { SwitchRow("👋 Yeni takipçiler", "Biri sizi takip ettiğinde", settings.notifyFollowers) { v -> update { it.copy(notifyFollowers = v) } } }
            item { SwitchRow("✉️ Özel mesajlar", "Size mesaj geldiğinde", settings.notifyMessages) { v -> update { it.copy(notifyMessages = v) } } }
            item { SwitchRow("# Kanal mesajları", "Topluluk kanallarındaki yeni mesajlar", settings.notifyChannels) { v -> update { it.copy(notifyChannels = v) } } }
            item { SwitchRow("🍽️ Takip ettiklerimden yeni tarifler", "Takip ettiğiniz şefler tarif paylaştığında", settings.notifyNewRecipes) { v -> update { it.copy(notifyNewRecipes = v) } } }
            item { SwitchRow("📣 Duyurular ve moderasyon", "Yöneticilerden gelen duyurular", settings.notifyAnnouncements) { v -> update { it.copy(notifyAnnouncements = v) } } }
            item { SwitchRow("🌙 Sessiz saatler", "Bu saatlerde sosyal bildirimler sessize alınır (zamanlayıcılar hariç)", settings.quietHours) { v -> update { it.copy(quietHours = v) } } }
            if (settings.quietHours) {
                item {
                    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        HourPicker("Başlangıç", settings.quietStart) { h -> update { it.copy(quietStart = h) } }
                        HourPicker("Bitiş", settings.quietEnd) { h -> update { it.copy(quietEnd = h) } }
                    }
                }
            }
            item { SettingsHeader("👩‍🍳 Pişirme modu") }
            item { SwitchRow("Ekranı açık tut", "Adım adım yapılış ekranında ekran kararmaz", settings.keepScreenOn) { v -> update { it.copy(keepScreenOn = v) } } }
            item { SwitchRow("Zamanlayıcı alarm sesi", "Süre dolduğunda alarm çalar", settings.timerSound) { v -> update { it.copy(timerSound = v) } } }
            item { SwitchRow("Titreşim", "Süre dolduğunda titreşir", settings.timerVibrate) { v -> update { it.copy(timerVibrate = v) } } }
            item {
                TextButton(onClick = {
                    if (Build.VERSION.SDK_INT >= 26) {
                        context.startActivity(Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, Notifier.CH_TIMER_ALARM))
                    }
                }, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Alarm sesini değiştir…") }
            }
            if (session?.isAdmin == true) {
                item { SettingsHeader("🛡️ Yönetim") }
                item {
                    ListItem(
                        leadingContent = { Icon(Icons.Filled.AdminPanelSettings, null) },
                        headlineContent = { Text("Yönetici paneli") },
                        supportingContent = { Text("İstatistikler, şikayetler, içerik moderasyonu, duyurular") },
                        trailingContent = { TextButton(onClick = { nav.navigate("admin") }) { Text("Aç") } },
                    )
                }
            }
            item { SettingsHeader("ℹ️ Hakkında") }
            item {
                Text(
                    "Tarif Pro ${BuildConfig.VERSION_NAME}\nÇevrimdışı öncelikli, Firebase ile senkronize gurme tarif defteri.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp),
                )
            }
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Çıkış yapılsın mı?") },
            text = { Text(if (session?.mode == SessionMode.GOOGLE) "Verileriniz bulutta güvende; tekrar giriş yaptığınızda geri gelir." else "Misafir verileriniz bu cihazda saklanmaya devam eder.") },
            confirmButton = { TextButton(onClick = { confirmLogout = false; scope.launch { container.auth.signOut() } }) { Text("Çıkış yap") } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Vazgeç") } },
        )
    }
}

@Composable
private fun SettingsHeader(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp))
}

@Composable
private fun SwitchRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        trailingContent = { Switch(checked = checked, onCheckedChange = onChange) },
    )
}

@Composable
private fun HourPicker(label: String, value: Int, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { open = true }) { Text("$label: ${"%02d".format(value)}:00") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            (0..23).forEach { h -> DropdownMenuItem(text = { Text("%02d:00".format(h)) }, onClick = { onPick(h); open = false }) }
        }
    }
}

fun signingSha1(context: Context): String = try {
    val pm = context.packageManager
    val sigBytes = if (Build.VERSION.SDK_INT >= 28) {
        pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
    } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures?.firstOrNull()?.toByteArray()
    }
    if (sigBytes == null) "bilinmiyor"
    else MessageDigest.getInstance("SHA-1").digest(sigBytes).joinToString(":") { "%02X".format(it) }
} catch (e: Exception) {
    "bilinmiyor"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CloudSetupScreen(onBack: () -> Unit) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val current = remember { container.cloudConfigStore.load() }
    var apiKey by remember { mutableStateOf(current.apiKey) }
    var appId by remember { mutableStateOf(current.appId) }
    var projectId by remember { mutableStateOf(current.projectId) }
    var webClient by remember { mutableStateOf(current.webClientId) }
    var admins by remember { mutableStateOf(current.adminEmails.joinToString(", ")) }
    var json by remember { mutableStateOf("") }
    var saved by remember { mutableStateOf(false) }
    val sha1 = remember { signingSha1(context) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Bulut & Google girişi") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Kurulum (bir kez, ~5 dakika)", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "1. console.firebase.google.com adresinde ücretsiz bir proje oluşturun.\n" +
                                "2. Android uygulaması ekleyin: paket adı com.tarifpro.app ve aşağıdaki SHA-1 parmak izi.\n" +
                                "3. Authentication › Sign-in method › Google sağlayıcısını etkinleştirin.\n" +
                                "4. Firestore Database oluşturun ve depodaki firestore.rules kurallarını yayınlayın.\n" +
                                "5. google-services.json dosyasını indirip içeriğini aşağıya yapıştırın.\n" +
                                "6. Kaydedin ve uygulamayı yeniden başlatın. İlk giriş yapan hesap yönetici olur.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            item {
                Card(shape = RoundedCornerShape(20.dp)) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("SHA-1 parmak izi", style = MaterialTheme.typography.titleSmall)
                            SelectionContainer { Text(sha1, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall) }
                            Text("Paket: ${context.packageName}", style = MaterialTheme.typography.labelSmall)
                        }
                        IconButton(onClick = {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            cm.setPrimaryClip(ClipData.newPlainText("SHA-1", sha1))
                            Toast.makeText(context, "SHA-1 kopyalandı", Toast.LENGTH_SHORT).show()
                        }) { Icon(Icons.Filled.ContentCopy, "Kopyala") }
                    }
                }
            }
            item {
                OutlinedTextField(json, { json = it }, Modifier.fillMaxWidth().height(160.dp), label = { Text("google-services.json içeriğini yapıştırın") })
                Spacer(Modifier.height(6.dp))
                FilledTonalButton(onClick = {
                    val parsed = CloudConfig.fromGoogleServicesJson(json, context.packageName)
                    if (parsed == null) Toast.makeText(context, "JSON okunamadı", Toast.LENGTH_SHORT).show()
                    else {
                        apiKey = parsed.apiKey; appId = parsed.appId; projectId = parsed.projectId
                        if (parsed.webClientId.isNotBlank()) webClient = parsed.webClientId
                        Toast.makeText(context, "Bilgiler dolduruldu ✓", Toast.LENGTH_SHORT).show()
                    }
                }, enabled = json.isNotBlank()) { Text("JSON'dan doldur") }
            }
            item { HorizontalDivider() }
            item { OutlinedTextField(projectId, { projectId = it.trim() }, Modifier.fillMaxWidth(), label = { Text("Project ID") }, singleLine = true) }
            item { OutlinedTextField(appId, { appId = it.trim() }, Modifier.fillMaxWidth(), label = { Text("App ID (1:…:android:…)") }, singleLine = true) }
            item { OutlinedTextField(apiKey, { apiKey = it.trim() }, Modifier.fillMaxWidth(), label = { Text("API anahtarı (AIza…)") }, singleLine = true) }
            item {
                OutlinedTextField(webClient, { webClient = it.trim() }, Modifier.fillMaxWidth(), label = { Text("Web Client ID (…apps.googleusercontent.com)") }, singleLine = true)
                Text("Authentication › Google sağlayıcısı › Web SDK yapılandırması bölümünde bulunur.", style = MaterialTheme.typography.labelSmall)
            }
            item { OutlinedTextField(admins, { admins = it }, Modifier.fillMaxWidth(), label = { Text("Yönetici e-postaları (isteğe bağlı, virgülle)") }) }
            item {
                Button(onClick = {
                    container.cloudConfigStore.save(
                        CloudConfig(apiKey, appId, projectId, webClient, admins.split(',', ';', ' ').map { it.trim().lowercase() }.filter { it.contains('@') }),
                    )
                    saved = true
                }, modifier = Modifier.fillMaxWidth()) { Text("Kaydet") }
                TextButton(onClick = { container.cloudConfigStore.clear(); saved = true }, modifier = Modifier.fillMaxWidth()) { Text("Yerel moda dön (ayarları temizle)") }
            }
        }
    }

    if (saved) {
        AlertDialog(
            onDismissRequest = { saved = false },
            title = { Text("Yeniden başlatma gerekli") },
            text = { Text("Bulut ayarlarının etkinleşmesi için uygulama yeniden başlatılacak.") },
            confirmButton = {
                TextButton(onClick = {
                    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                    intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    context.startActivity(intent)
                    (context as? Activity)?.finishAffinity()
                    Runtime.getRuntime().exit(0)
                }) { Text("Yeniden başlat") }
            },
            dismissButton = { TextButton(onClick = { saved = false }) { Text("Sonra") } },
        )
    }
}

@Suppress("unused")
private fun openUrl(context: Context, url: String) = context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
