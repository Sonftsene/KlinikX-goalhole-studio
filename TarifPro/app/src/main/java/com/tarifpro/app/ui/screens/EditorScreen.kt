package com.tarifpro.app.ui.screens

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.tarifpro.app.data.Session
import com.tarifpro.app.domain.CUISINES
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.DurationDetector
import com.tarifpro.app.domain.Ingredient
import com.tarifpro.app.domain.IngredientParser
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.RECIPE_CATEGORIES
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Step
import com.tarifpro.app.domain.Units
import com.tarifpro.app.domain.Visibility
import com.tarifpro.app.export.FoodIllustrations
import com.tarifpro.app.export.Templates
import com.tarifpro.app.ui.components.FoodIllustration
import com.tarifpro.app.ui.components.LocalContainer
import com.tarifpro.app.ui.components.RecipeImage
import com.tarifpro.app.ui.components.visibilityIcon
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Stable
class IngRow(ing: Ingredient) {
    var group by mutableStateOf(ing.group)
    var amount by mutableStateOf(
        ing.amount?.let { a -> QuantityFormat.decimal(a) + (ing.amountMax?.let { "-" + QuantityFormat.decimal(it) } ?: "") } ?: "",
    )
    var unit by mutableStateOf(ing.unit)
    var name by mutableStateOf(ing.name)
    var note by mutableStateOf(ing.note)
    var grams by mutableStateOf(ing.grams?.let { QuantityFormat.decimal(it) } ?: "")

    fun toIngredient(): Ingredient? {
        if (name.isBlank()) return null
        var a: Double? = null
        var max: Double? = null
        val t = amount.trim()
        if (t.isNotEmpty()) {
            IngredientParser.readNumber(t)?.let { (v, len) ->
                a = v
                val rest = t.substring(len).trim()
                if (rest.startsWith("-") || rest.startsWith("–")) max = IngredientParser.readNumber(rest.substring(1))?.first
            }
        }
        return Ingredient(group.trim(), a, max, unit, name.trim(), note.trim(), grams.replace(',', '.').toDoubleOrNull())
    }
}

@Stable
class StepRow(s: Step) {
    var title by mutableStateOf(s.title)
    var text by mutableStateOf(s.text)
    var minutes by mutableStateOf(s.minutes?.toString() ?: "")
    var image by mutableStateOf(s.image)
    fun toStep(): Step? = if (text.isBlank() && title.isBlank()) null else Step(title.trim(), text.trim(), minutes.toIntOrNull()?.takeIf { it > 0 }, image)
}

@Stable
class EditorState(val base: Recipe) {
    var title by mutableStateOf(base.title)
    var tagline by mutableStateOf(base.tagline)
    var description by mutableStateOf(base.description)
    var category by mutableStateOf(base.category)
    var cuisine by mutableStateOf(base.cuisine)
    var difficulty by mutableStateOf(base.difficulty)
    var servings by mutableStateOf(base.servings)
    var prep by mutableStateOf(if (base.prepMinutes > 0) base.prepMinutes.toString() else "")
    var cook by mutableStateOf(if (base.cookMinutes > 0) base.cookMinutes.toString() else "")
    var rest by mutableStateOf(if (base.restMinutes > 0) base.restMinutes.toString() else "")
    var template by mutableStateOf(base.templateId)
    var visibility by mutableStateOf(base.visibility)
    var image by mutableStateOf(base.image)
    var tags by mutableStateOf(base.tags.joinToString(", "))
    var source by mutableStateOf(base.sourceUrl ?: "")
    val ingredients = mutableStateListOf<IngRow>().apply { addAll(base.ingredients.map { IngRow(it) }) }
    val steps = mutableStateListOf<StepRow>().apply { addAll(base.steps.map { StepRow(it) }) }
    val tips = mutableStateListOf<String>().apply { addAll(base.tips) }

    fun build(): Recipe = base.copy(
        title = title.trim(), tagline = tagline.trim(), description = description.trim(), category = category, cuisine = cuisine,
        difficulty = difficulty, servings = servings, prepMinutes = prep.toIntOrNull() ?: 0, cookMinutes = cook.toIntOrNull() ?: 0,
        restMinutes = rest.toIntOrNull() ?: 0, templateId = template, visibility = visibility, image = image,
        ingredients = ingredients.mapNotNull { it.toIngredient() }, steps = steps.mapNotNull { it.toStep() },
        tips = tips.map { it.trim() }.filter { it.isNotEmpty() },
        tags = tags.split(',', '#').map { it.trim() }.filter { it.isNotEmpty() }.distinct(),
        sourceUrl = source.trim().ifBlank { null },
    )
}

private fun newRecipe(id: String, s: Session?, template: String) = Recipe(
    id = id, authorId = s?.uid ?: "", authorName = s?.name ?: "", authorPhoto = s?.photo, title = "",
    templateId = template, image = "illu:stew", ingredients = listOf(Ingredient()), steps = listOf(Step()),
)

@Composable
fun EditorScreen(nav: NavController, id: String?, fromImport: Boolean) {
    val container = LocalContainer.current
    var state by remember { mutableStateOf<EditorState?>(null) }
    LaunchedEffect(id, fromImport) {
        val session = container.sessionStore.current
        val defaultTemplate = container.settings.value.defaultTemplate
        state = when {
            id != null -> container.recipes.get(id)?.let { EditorState(it) } ?: EditorState(newRecipe(container.recipes.newId(), session, defaultTemplate))
            fromImport && container.pendingImport != null -> {
                val imp = container.pendingImport!!
                container.pendingImport = null
                val category = imp.category?.let { c -> RECIPE_CATEGORIES.firstOrNull { it.equals(c, true) } } ?: "Ana Yemek"
                EditorState(
                    newRecipe(container.recipes.newId(), session, defaultTemplate).copy(
                        title = imp.title, description = imp.description, image = imp.image ?: "illu:" + FoodIllustrations.forCategory(category),
                        servings = imp.servings?.coerceIn(1, 24) ?: 4, prepMinutes = imp.prepMinutes, cookMinutes = imp.cookMinutes,
                        ingredients = imp.ingredients.ifEmpty { listOf(Ingredient()) }, steps = imp.steps.ifEmpty { listOf(Step()) },
                        tips = imp.tips, tags = imp.tags, category = category, sourceUrl = imp.sourceUrl, visibility = Visibility.PRIVATE,
                    ),
                )
            }
            else -> EditorState(newRecipe(container.recipes.newId(), session, defaultTemplate))
        }
    }
    val s = state
    if (s == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    } else {
        EditorContent(nav, s, isEdit = id != null)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun EditorContent(nav: NavController, st: EditorState, isEdit: Boolean) {
    val container = LocalContainer.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var showIllustrations by remember { mutableStateOf(false) }
    var showBulk by remember { mutableStateOf(false) }
    var photoTarget by remember { mutableStateOf(-1) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    fun assignImage(model: String?) {
        if (model == null) {
            Toast.makeText(context, "Görsel okunamadı", Toast.LENGTH_SHORT).show(); return
        }
        if (photoTarget < 0) st.image = model else st.steps.getOrNull(photoTarget)?.image = model
    }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = cameraUri
        if (ok && uri != null) scope.launch { assignImage(container.images.importImage(uri)) }
    }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch { assignImage(container.images.importImage(uri)) }
    }
    fun openCamera(target: Int) {
        photoTarget = target
        val uri = container.images.newCameraTarget()
        cameraUri = uri
        try {
            camera.launch(uri)
        } catch (e: Exception) {
            Toast.makeText(context, "Kamera uygulaması bulunamadı", Toast.LENGTH_SHORT).show()
        }
    }
    fun openGallery(target: Int) {
        photoTarget = target
        gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    val preview = st.build()
    val kcal = remember(preview.ingredients, preview.servings) { NutritionCalculator.analyze(preview.ingredients, preview.servings).perServing.kcal.roundToInt() }

    fun save() {
        val r = st.build()
        when {
            r.title.isBlank() -> Toast.makeText(context, "Lütfen tarif adını yazın", Toast.LENGTH_SHORT).show()
            r.ingredients.isEmpty() -> Toast.makeText(context, "En az bir malzeme ekleyin", Toast.LENGTH_SHORT).show()
            else -> {
                saving = true
                scope.launch {
                    val saved = container.recipes.save(r)
                    saving = false
                    Toast.makeText(context, if (isEdit) "Tarif güncellendi ✓" else "Tarif kaydedildi ✓", Toast.LENGTH_SHORT).show()
                    nav.popBackStack()
                    if (!isEdit) nav.navigate("recipe/${saved.id}")
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Tarifi düzenle" else "Yeni tarif") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") } },
                actions = {
                    if (!isEdit) TextButton(onClick = { nav.navigate("import") }) { Text("İçe aktar") }
                    Button(onClick = { save() }, enabled = !saving, modifier = Modifier.padding(end = 8.dp)) {
                        if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                        else { Icon(Icons.Filled.Save, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Kaydet") }
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.padding(padding).imePadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // ---- Kapak fotoğrafı ----
            item {
                Card(shape = RoundedCornerShape(24.dp)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f)) {
                        RecipeImage(st.image, Modifier.fillMaxSize())
                        Surface(color = Color.Black.copy(alpha = 0.45f), shape = RoundedCornerShape(topEnd = 16.dp), modifier = Modifier.align(Alignment.BottomStart)) {
                            Text("Kapak görseli", color = Color.White, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
                        }
                    }
                    Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                        TextButton(onClick = { openCamera(-1) }) { Icon(Icons.Filled.PhotoCamera, null); Spacer(Modifier.width(4.dp)); Text("Çek") }
                        TextButton(onClick = { openGallery(-1) }) { Icon(Icons.Filled.PhotoLibrary, null); Spacer(Modifier.width(4.dp)); Text("Galeri") }
                        TextButton(onClick = { photoTarget = -1; showIllustrations = true }) { Icon(Icons.Filled.Brush, null); Spacer(Modifier.width(4.dp)); Text("İllüstrasyon") }
                    }
                }
            }
            // ---- Temel bilgiler ----
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(st.title, { st.title = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("Tarif adı *") }, singleLine = true)
                    OutlinedTextField(st.tagline, { st.tagline = it.take(70) }, Modifier.fillMaxWidth(), label = { Text("Kısa slogan (ör. Yumuşak, hafif, meyveli)") }, singleLine = true)
                    OutlinedTextField(st.description, { st.description = it.take(600) }, Modifier.fillMaxWidth(), label = { Text("Açıklama") }, minLines = 2)
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PickerField("Kategori", st.category, RECIPE_CATEGORIES, Modifier.weight(1f)) {
                        st.category = it
                        if (st.image.startsWith("illu:")) st.image = "illu:" + FoodIllustrations.forCategory(it)
                    }
                    PickerField("Mutfak", st.cuisine, CUISINES, Modifier.weight(1f)) { st.cuisine = it }
                }
            }
            item {
                Column {
                    Text("Zorluk", style = MaterialTheme.typography.titleSmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD).forEach { d ->
                            FilterChip(selected = st.difficulty == d, onClick = { st.difficulty = d }, label = { Text(Difficulty.label(d)) })
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Porsiyon", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        FilledTonalIconButton(onClick = { st.servings = (st.servings - 1).coerceAtLeast(1) }) { Text("−", fontSize = 20.sp) }
                        Text("${st.servings} kişilik", Modifier.padding(horizontal = 12.dp), fontWeight = FontWeight.Bold)
                        FilledTonalIconButton(onClick = { st.servings = (st.servings + 1).coerceAtMost(24) }) { Text("+", fontSize = 20.sp) }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        NumberField("Hazırlık (dk)", st.prep, Modifier.weight(1f)) { st.prep = it }
                        NumberField("Pişirme (dk)", st.cook, Modifier.weight(1f)) { st.cook = it }
                        NumberField("Dinlenme (dk)", st.rest, Modifier.weight(1f)) { st.rest = it }
                    }
                }
            }
            // ---- Şablon ----
            item {
                Column {
                    Text("Tarif kartı şablonu", style = MaterialTheme.typography.titleMedium)
                    Text("Kart görünümü, PNG ve A4 çıktısı bu şablonla tasarlanır.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(Templates.all) { t ->
                            TemplateChip(t.id, st.template == t.id) { st.template = t.id }
                        }
                    }
                }
            }
            // ---- Görünürlük ----
            item {
                Column {
                    Text("Kimler görebilir?", style = MaterialTheme.typography.titleMedium)
                    Visibility.entries.forEach { v ->
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { st.visibility = v }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = st.visibility == v, onClick = { st.visibility = v })
                            Icon(visibilityIcon(v), null, Modifier.size(20.dp))
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(v.label, fontWeight = FontWeight.SemiBold)
                                Text(v.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            // ---- Malzemeler ----
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Malzemeler", style = MaterialTheme.typography.titleLarge)
                        Text("≈ $kcal kcal / porsiyon (canlı hesaplama)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                    }
                    TextButton(onClick = { showBulk = true }) { Icon(Icons.Filled.ContentPaste, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text("Toplu yapıştır") }
                }
            }
            itemsIndexed(st.ingredients, key = { _, row -> System.identityHashCode(row) }) { idx, row ->
                IngredientEditorRow(
                    row, idx, st.ingredients.size,
                    onMove = { dir -> val n = idx + dir; if (n in st.ingredients.indices) { val x = st.ingredients.removeAt(idx); st.ingredients.add(n, x) } },
                    onDelete = { st.ingredients.removeAt(idx) },
                )
            }
            item {
                OutlinedButton(onClick = { st.ingredients.add(IngRow(Ingredient(group = st.ingredients.lastOrNull()?.group ?: ""))) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("Malzeme ekle")
                }
            }
            // ---- Adımlar ----
            item { Text("Yapılış adımları", style = MaterialTheme.typography.titleLarge) }
            itemsIndexed(st.steps, key = { _, row -> System.identityHashCode(row) }) { idx, row ->
                StepEditorRow(
                    row, idx,
                    onCamera = { openCamera(idx) }, onGallery = { openGallery(idx) },
                    onMove = { dir -> val n = idx + dir; if (n in st.steps.indices) { val x = st.steps.removeAt(idx); st.steps.add(n, x) } },
                    onDelete = { st.steps.removeAt(idx) },
                )
            }
            item {
                OutlinedButton(onClick = { st.steps.add(StepRow(Step())) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("Adım ekle")
                }
            }
            // ---- Püf noktaları ----
            item { Text("Püf noktaları", style = MaterialTheme.typography.titleLarge) }
            itemsIndexed(st.tips) { idx, tip ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(tip, { st.tips[idx] = it }, Modifier.weight(1f), label = { Text("İpucu ${idx + 1} (Başlık: açıklama)") })
                    IconButton(onClick = { st.tips.removeAt(idx) }) { Icon(Icons.Filled.Close, "Sil") }
                }
            }
            item {
                OutlinedButton(onClick = { st.tips.add("") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("Püf noktası ekle") }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(st.tags, { st.tags = it }, Modifier.fillMaxWidth(), label = { Text("Etiketler (virgülle ayırın)") })
                    OutlinedTextField(st.source, { st.source = it }, Modifier.fillMaxWidth(), label = { Text("Kaynak bağlantısı (isteğe bağlı)") }, singleLine = true)
                }
            }
            item {
                Button(onClick = { save() }, enabled = !saving, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                    Icon(Icons.Filled.Check, null); Spacer(Modifier.width(8.dp)); Text(if (isEdit) "Değişiklikleri kaydet" else "Tarifi kaydet")
                }
            }
        }
    }

    if (showIllustrations) {
        AlertDialog(
            onDismissRequest = { showIllustrations = false },
            title = { Text("Hazır gurme illüstrasyonları") },
            text = {
                LazyVerticalGrid(GridCells.Fixed(3), Modifier.height(360.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(FoodIllustrations.all) { item ->
                        Column(
                            Modifier.clip(RoundedCornerShape(12.dp)).clickable {
                                val model = "illu:${item.key}"
                                if (photoTarget < 0) st.image = model else st.steps.getOrNull(photoTarget)?.image = model
                                showIllustrations = false
                            },
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            FoodIllustration(item.key, Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)))
                            Text(item.label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showIllustrations = false }) { Text("Kapat") } },
        )
    }

    if (showBulk) {
        var text by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showBulk = false },
            title = { Text("Malzemeleri toplu ekle") },
            text = {
                Column {
                    Text("Her satıra bir malzeme yazın. \"Sos:\" gibi iki nokta ile biten satırlar grup başlığı olur.", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(text, { text = it }, Modifier.fillMaxWidth().height(220.dp), placeholder = { Text("Kek:\n3 adet yumurta\n1 su bardağı şeker\nSos:\n200 ml krema") })
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    var group = ""
                    val parsed = text.lines().mapNotNull { line ->
                        val l = line.trim()
                        if (l.endsWith(":") && IngredientParser.readNumber(l) == null) { group = l.trimEnd(':').trim(); null } else IngredientParser.parse(l, group)
                    }
                    st.ingredients.removeAll { it.name.isBlank() }
                    st.ingredients.addAll(parsed.map { IngRow(it) })
                    showBulk = false
                }) { Text("Ekle") }
            },
            dismissButton = { TextButton(onClick = { showBulk = false }) { Text("Vazgeç") } },
        )
    }
}

@Composable
fun TemplateChip(id: String, selected: Boolean, onClick: () -> Unit) {
    val t = Templates.byId(id)
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = Color(t.background),
        border = BorderStroke(if (selected) 3.dp else 1.dp, if (selected) Color(t.primary) else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.width(150.dp),
    ) {
        Column(Modifier.padding(10.dp)) {
            Row {
                Box(Modifier.size(22.dp).clip(CircleShape).background(Color(t.primary)))
                Spacer(Modifier.width(4.dp))
                Box(Modifier.size(22.dp).clip(CircleShape).background(Color(t.secondary)))
                Spacer(Modifier.width(4.dp))
                t.groupColors.take(2).forEach { (tint, _) ->
                    Box(Modifier.size(22.dp).clip(CircleShape).background(Color(tint)).border(1.dp, Color(0x22000000), CircleShape))
                    Spacer(Modifier.width(4.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            Text("${t.emoji} ${t.name}", color = Color(t.ink), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge, maxLines = 1)
            Text(t.description, color = Color(t.muted), style = MaterialTheme.typography.labelSmall, maxLines = 2)
        }
    }
}

@Composable
fun PickerField(label: String, value: String, options: List<String>, modifier: Modifier = Modifier, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.fillMaxWidth()) {
                Text(label, style = MaterialTheme.typography.labelSmall)
                Text(value.ifBlank { "Seçin" }, maxLines = 1)
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { o -> DropdownMenuItem(text = { Text(o) }, onClick = { onPick(o); open = false }) }
        }
    }
}

@Composable
private fun NumberField(label: String, value: String, modifier: Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = { v -> onChange(v.filter { it.isDigit() }.take(4)) }, modifier = modifier,
        label = { Text(label, maxLines = 1) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
    )
}

@Composable
private fun IngredientEditorRow(row: IngRow, idx: Int, count: Int, onMove: (Int) -> Unit, onDelete: () -> Unit) {
    var unitMenu by remember { mutableStateOf(false) }
    val ing = row.toIngredient()
    val matched = ing?.let { NutritionCalculator.analyze(listOf(it), 1).items.firstOrNull() }
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(ing?.let { NutritionCalculator.emojiFor(it) } ?: "🥄", fontSize = 22.sp)
                Spacer(Modifier.width(6.dp))
                OutlinedTextField(row.group, { row.group = it }, Modifier.weight(1f), label = { Text("Grup (ör. Sos)") }, singleLine = true)
                IconButton(onClick = { onMove(-1) }, enabled = idx > 0) { Icon(Icons.Filled.ArrowUpward, "Yukarı") }
                IconButton(onClick = { onMove(1) }, enabled = idx < count - 1) { Icon(Icons.Filled.ArrowDownward, "Aşağı") }
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "Sil") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(row.amount, { row.amount = it.take(12) }, Modifier.width(90.dp), label = { Text("Miktar") }, singleLine = true, placeholder = { Text("1/2") })
                Box {
                    OutlinedButton(onClick = { unitMenu = true }, shape = RoundedCornerShape(12.dp), contentPadding = PaddingValues(horizontal = 10.dp)) { Text(row.unit.ifBlank { "birim" }, maxLines = 1) }
                    DropdownMenu(expanded = unitMenu, onDismissRequest = { unitMenu = false }) {
                        Units.displayList.forEach { u -> DropdownMenuItem(text = { Text(u.ifBlank { "(birimsiz)" }) }, onClick = { row.unit = u; unitMenu = false }) }
                    }
                }
                OutlinedTextField(row.name, { row.name = it.take(60) }, Modifier.weight(1f), label = { Text("Malzeme") }, singleLine = true)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(row.note, { row.note = it.take(60) }, Modifier.weight(1f), label = { Text("Not (oda sıcaklığında…)") }, singleLine = true)
                OutlinedTextField(row.grams, { row.grams = it.filter { c -> c.isDigit() || c == ',' || c == '.' }.take(6) }, Modifier.width(96.dp), label = { Text("Gram") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            }
            if (row.name.isNotBlank()) {
                val food = matched?.food
                val grams = matched?.grams
                val kcalText = (matched?.facts?.kcal ?: 0.0).roundToInt()
                val info = when {
                    food == null -> "⚠ Besin veritabanında eşleşmedi – gram ve kalori için \"Gram\" alanını kullanabilirsiniz"
                    grams == null -> "≈ ${food.name} • miktar/birim girin"
                    else -> "≈ ${grams.roundToInt()} g • $kcalText kcal (${food.name})"
                }
                Text(info, style = MaterialTheme.typography.labelSmall, color = if (food == null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 4.dp))
            }
        }
    }
}

@Composable
private fun StepEditorRow(row: StepRow, idx: Int, onCamera: () -> Unit, onGallery: () -> Unit, onMove: (Int) -> Unit, onDelete: () -> Unit) {
    val detected = remember(row.text) { DurationDetector.detect(row.text) }
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NumberBadge(idx + 1, MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(row.title, { row.title = it.take(50) }, Modifier.weight(1f), label = { Text("Adım başlığı (ör. Pişirin)") }, singleLine = true)
                IconButton(onClick = { onMove(-1) }) { Icon(Icons.Filled.ArrowUpward, "Yukarı") }
                IconButton(onClick = { onMove(1) }) { Icon(Icons.Filled.ArrowDownward, "Aşağı") }
                IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "Sil") }
            }
            OutlinedTextField(row.text, { row.text = it.take(800) }, Modifier.fillMaxWidth(), label = { Text("Ne yapılacak?") }, minLines = 2)
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(row.minutes, { v -> row.minutes = v.filter { it.isDigit() }.take(4) }, Modifier.width(130.dp), label = { Text("Süre (dk)") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Spacer(Modifier.width(8.dp))
                val first = detected.firstOrNull()
                if (first != null && row.minutes != first.minutes.toString()) {
                    AssistChip(onClick = { row.minutes = first.minutes.toString() }, label = { Text("⏱ \"${first.label}\" algılandı") }, leadingIcon = { Icon(Icons.Filled.AutoAwesome, null, Modifier.size(16.dp)) })
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!row.image.isNullOrBlank()) {
                    RecipeImage(row.image, Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)))
                    IconButton(onClick = { row.image = null }) { Icon(Icons.Filled.Close, "Fotoğrafı kaldır") }
                }
                FilledTonalButton(onClick = onCamera, contentPadding = PaddingValues(horizontal = 12.dp)) { Icon(Icons.Filled.PhotoCamera, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text("Adım fotoğrafı") }
                Spacer(Modifier.width(6.dp))
                IconButton(onClick = onGallery) { Icon(Icons.Filled.PhotoLibrary, "Galeriden") }
            }
        }
    }
}
