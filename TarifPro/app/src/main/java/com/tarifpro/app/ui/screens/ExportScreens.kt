package com.tarifpro.app.ui.screens

import android.app.Activity
import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.tarifpro.app.export.PrintHelper
import com.tarifpro.app.export.RecipeCardRenderer
import com.tarifpro.app.export.RecipeImporter
import com.tarifpro.app.export.ShareHelper
import com.tarifpro.app.export.Templates
import com.tarifpro.app.ui.components.LocalContainer
import kotlinx.coroutines.launch

/** Şablonlarla tarif kartı tasarlama, PNG olarak kaydetme / gönderme ve A4 yazdırma. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CardDesignerScreen(nav: NavController, id: String, initialServings: Int) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recipe by remember(id) { container.recipes.observeRecipe(id) }.collectAsStateWithLifecycle(initialValue = null)
    val session by container.auth.session.collectAsStateWithLifecycle()
    val r = recipe
    var templateId by remember { mutableStateOf<String?>(null) }
    var servings by remember { mutableStateOf(initialServings) }
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var busy by remember { mutableStateOf(false) }

    if (r != null && templateId == null) templateId = r.templateId
    if (r != null && servings <= 0) servings = r.servings

    LaunchedEffect(r?.updatedAt, templateId, servings) {
        val rec = r ?: return@LaunchedEffect
        bitmap = null
        bitmap = RecipeCardRenderer.render(container.images, rec, servings, Templates.byId(templateId))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tarif kartı tasarla") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        if (r == null) {
            Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text("Şablon seçin", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(6.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(Templates.all) { t -> TemplateChip(t.id, templateId == t.id) { templateId = t.id } }
                }
            }
            item {
                Text("Porsiyon: $servings kişilik", style = MaterialTheme.typography.titleMedium)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(listOf(1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24)) { n -> FilterChip(selected = n == servings, onClick = { servings = n }, label = { Text("$n") }) }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        val b = bitmap ?: return@Button
                        busy = true
                        scope.launch {
                            val uri = ShareHelper.writeShareFile(context, b, r.title)
                            busy = false
                            ShareHelper.shareImage(context, uri, r.title)
                        }
                    }, enabled = bitmap != null && !busy, modifier = Modifier.weight(1f)) { Icon(Icons.Filled.Share, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Gönder") }
                    FilledTonalButton(onClick = {
                        val b = bitmap ?: return@FilledTonalButton
                        scope.launch {
                            val ok = ShareHelper.saveToGallery(context, b, r.title)
                            if (ok) {
                                Toast.makeText(context, "Resimler/TarifPro klasörüne kaydedildi 🖼️", Toast.LENGTH_LONG).show()
                            } else {
                                val uri = ShareHelper.writeShareFile(context, b, r.title)
                                ShareHelper.shareImage(context, uri, r.title)
                            }
                        }
                    }, enabled = bitmap != null, modifier = Modifier.weight(1f)) { Icon(Icons.Filled.Download, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("PNG kaydet") }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        scope.launch {
                            val html = PrintHelper.buildHtml(container.images, r, servings, Templates.byId(templateId))
                            PrintHelper.print(context as Activity, html, "TarifPro - ${r.title}")
                        }
                    }, modifier = Modifier.weight(1f)) { Icon(Icons.Filled.Print, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("A4 / PDF") }
                    OutlinedButton(onClick = { nav.navigate("share-chat/${r.id}") }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Sohbete")
                    }
                }
                if (r.authorId == session?.uid && templateId != r.templateId) {
                    Spacer(Modifier.height(8.dp))
                    FilledTonalButton(onClick = {
                        scope.launch {
                            container.recipes.save(r.copy(templateId = templateId ?: r.templateId))
                            Toast.makeText(context, "Şablon tarife uygulandı", Toast.LENGTH_SHORT).show()
                        }
                    }, modifier = Modifier.fillMaxWidth()) { Text("Bu şablonu tarifimin varsayılanı yap") }
                }
            }
            item {
                Card(shape = RoundedCornerShape(16.dp)) {
                    val b = bitmap
                    if (b == null) {
                        Box(Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                CircularProgressIndicator()
                                Spacer(Modifier.height(8.dp))
                                Text("Kart hazırlanıyor…")
                            }
                        }
                    } else {
                        Image(
                            b.asImageBitmap(), contentDescription = "Tarif kartı önizlemesi",
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)), contentScale = ContentScale.FillWidth,
                        )
                    }
                }
            }
        }
    }
}

/** Başka sitelerden / uygulamalardan bağlantı veya metinle tarif içe aktarma. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportScreen(nav: NavController, initialUrl: String) {
    val container = LocalContainer.current
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf(initialUrl) }
    var text by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val online by container.online.collectAsStateWithLifecycle()

    fun importUrl() {
        if (url.isBlank()) return
        loading = true
        error = null
        scope.launch {
            try {
                container.pendingImport = RecipeImporter.fromUrl(url)
                nav.popBackStack()
                nav.navigate("editor?import=true")
            } catch (e: Exception) {
                error = e.message ?: "İçe aktarma başarısız"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(initialUrl) { if (initialUrl.isNotBlank()) importUrl() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tarif içe aktar") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Card(shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("🔗 Bağlantıdan içe aktar", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Profesyonel tarif sitelerinin çoğu (Nefis Yemek Tarifleri, Yemek.com, AllRecipes, BBC Good Food, NYT Cooking…) yapılandırılmış tarif verisi yayınlar. Bağlantıyı yapıştırın; malzemeler, adımlar, süreler ve görsel otomatik doldurulsun.",
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text("Tarif bağlantısı (https://…)") }, singleLine = true, leadingIcon = { Icon(Icons.Filled.Link, null) })
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { importUrl() }, enabled = !loading && url.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                            if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("İçe aktar")
                        }
                        if (!online) Text("İnternet bağlantısı yok – metinden içe aktarmayı kullanabilirsiniz.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        Text("İpucu: Tarayıcıda \"Paylaş → Tarif Pro\" seçerek de doğrudan içe aktarabilirsiniz.", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
            item {
                Card(shape = RoundedCornerShape(20.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("📝 Metinden içe aktar", style = MaterialTheme.typography.titleMedium)
                        Text("WhatsApp mesajı, not veya bir defterden kopyaladığınız tarifi yapıştırın. \"Malzemeler\" ve \"Yapılışı\" başlıkları otomatik algılanır.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(8.dp))
                        OutlinedTextField(
                            text, { text = it }, Modifier.fillMaxWidth().height(240.dp),
                            placeholder = { Text("Mercimek Çorbası\n4 kişilik\nMalzemeler:\n1 su bardağı kırmızı mercimek\n1 adet soğan\nYapılışı:\n1. Soğanı kavurun…") },
                        )
                        Spacer(Modifier.height(8.dp))
                        FilledTonalButton(onClick = {
                            container.pendingImport = RecipeImporter.fromText(text)
                            nav.popBackStack()
                            nav.navigate("editor?import=true")
                        }, enabled = text.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.TextFields, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Metni tarife dönüştür")
                        }
                    }
                }
            }
            error?.let { e -> item { Text("⚠ $e", color = MaterialTheme.colorScheme.error) } }
        }
    }
}
