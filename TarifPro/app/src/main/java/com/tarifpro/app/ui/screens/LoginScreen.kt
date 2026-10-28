package com.tarifpro.app.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tarifpro.app.ui.components.FoodIllustration
import com.tarifpro.app.ui.components.LocalContainer
import kotlinx.coroutines.launch

@Composable
fun LoginScreen() {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var showCloud by remember { mutableStateOf(false) }
    var showGuest by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    if (showCloud) {
        CloudSetupScreen(onBack = { showCloud = false })
        return
    }

    Box(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(listOf(Color(0xFF7A0E2A), Color(0xFFA3123A), MaterialTheme.colorScheme.background), endY = 1600f),
        ),
    ) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().navigationBarsPadding().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("dessert", "soup", "salad").forEach {
                    FoodIllustration(it, Modifier.size(96.dp).clip(RoundedCornerShape(24.dp)))
                }
            }
            Spacer(Modifier.height(20.dp))
            Text("Tarif Pro", color = Color.White, fontSize = 44.sp, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold)
            Text("Gurme tarif defteriniz", color = Color.White.copy(alpha = 0.9f), fontSize = 18.sp, fontFamily = FontFamily.Serif)
            Spacer(Modifier.height(20.dp))
            Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp)) {
                    listOf(
                        "📸" to "Fotoğraflı, görsel referans tarzı tarif kartları",
                        "⚖️" to "1–24 kişilik dinamik porsiyon ve besin hesaplayıcı",
                        "⏱️" to "Adım adım pişirme ve akıllı zamanlayıcılar",
                        "🔎" to "\"Dolapta ne var?\" malzeme filtreli hızlı arama",
                        "💬" to "Şefleri takip et, sohbet et, puan ve yorum bırak",
                        "☁️" to "Çevrimdışı çalışır, tüm cihazlarda senkronize olur",
                    ).forEach { (e, t) ->
                        Row(Modifier.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) { Text(e) }
                            Spacer(Modifier.width(12.dp))
                            Text(t, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = {
                    if (!container.auth.googleAvailable) {
                        error = "Google ile giriş ve bulut senkronizasyonu için Firebase projenizin bilgilerini bir kez girmeniz gerekiyor."
                        return@Button
                    }
                    loading = true
                    scope.launch {
                        val r = container.auth.signInWithGoogle(context as Activity)
                        loading = false
                        r.exceptionOrNull()?.let { error = it.message }
                    }
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF1F1F1F)),
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                } else {
                    Text("G", color = Color(0xFF4285F4), fontWeight = FontWeight.Bold, fontSize = 22.sp)
                    Spacer(Modifier.width(12.dp))
                    Text("Google ile Giriş Yap", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = { showGuest = true },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(16.dp),
            ) { Text("Misafir olarak devam et (çevrimdışı)") }
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { showCloud = true }) { Text("☁️ Bulut & Google girişi kurulumu") }
            Text(
                "Misafir modunda tüm özellikler bu cihazda çalışır. Daha sonra Google ile giriş yaptığınızda tarifleriniz hesabınıza taşınır.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }

    if (showGuest) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showGuest = false },
            title = { Text("Şef adınız") },
            text = {
                OutlinedTextField(value = name, onValueChange = { name = it.take(40) }, label = { Text("Ad Soyad veya takma ad") }, singleLine = true)
            },
            confirmButton = {
                Button(onClick = {
                    showGuest = false
                    scope.launch { container.auth.continueAsGuest(name) }
                }) { Text("Mutfağa gir") }
            },
            dismissButton = { TextButton(onClick = { showGuest = false }) { Text("Vazgeç") } },
        )
    }

    error?.let { msg ->
        AlertDialog(
            onDismissRequest = { error = null },
            title = { Text("Google ile giriş") },
            text = { Text(msg) },
            confirmButton = {
                TextButton(onClick = { error = null; showCloud = true }) { Text("Kurulumu aç") }
            },
            dismissButton = { TextButton(onClick = { error = null }) { Text("Kapat") } },
        )
    }
}
