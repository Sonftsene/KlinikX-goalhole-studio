package com.tarifpro.app

import android.Manifest
import android.graphics.Bitmap
import android.util.Log
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.tarifpro.app.data.seed.SeedData
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.export.RecipeCardRenderer
import com.tarifpro.app.export.Templates
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.io.File
import java.io.FileOutputStream

/**
 * Uygulamanın tüm ana ekranlarını gezen duman testi. Her adımda ekran görüntüsü alır;
 * CI bu görüntüleri GitHub Release'e "ekran-goruntuleri.zip" olarak ekler.
 */
@RunWith(AndroidJUnit4::class)
class SmokeTest {
    private val compose = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val rules: TestRule = RuleChain.outerRule(GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)).around(compose)

    private val failures = mutableListOf<String>()
    private val dir: File by lazy {
        File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "screens").apply { mkdirs() }
    }

    private fun save(bmp: Bitmap, name: String) {
        FileOutputStream(File(dir, "$name.png")).use { bmp.compress(Bitmap.CompressFormat.PNG, 92, it) }
    }

    private fun shot(name: String) {
        try {
            compose.waitForIdle()
            Thread.sleep(700)
            compose.waitForIdle()
            val roots = compose.onAllNodes(isRoot())
            val count = roots.fetchSemanticsNodes().size
            save(roots[count - 1].captureToImage().asAndroidBitmap(), name)
        } catch (e: Throwable) {
            Log.w("SmokeTest", "ekran görüntüsü alınamadı: $name", e)
        }
    }

    private fun step(name: String, block: () -> Unit) {
        try {
            block()
            Log.i("SmokeTest", "ADIM OK: $name")
        } catch (e: Throwable) {
            Log.e("SmokeTest", "ADIM HATA: $name", e)
            failures += "$name: ${e.javaClass.simpleName}: ${e.message?.take(200)}"
            shot("HATA_${name.replace(' ', '_')}")
        }
    }

    private fun waitText(text: String, substring: Boolean = false, timeout: Long = 15_000) {
        compose.waitUntil(timeout) { compose.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun firstText(text: String, substring: Boolean = false): SemanticsNodeInteraction =
        compose.onAllNodesWithText(text, substring = substring)[0]

    private fun back() {
        compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
        compose.waitForIdle()
    }

    @Test
    fun tourOfTheApp() {
        step("giris") {
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("Misafir olarak devam et (çevrimdışı)").fetchSemanticsNodes().isNotEmpty() ||
                    compose.onAllNodesWithText("Kategoriler").fetchSemanticsNodes().isNotEmpty()
            }
            if (compose.onAllNodesWithText("Misafir olarak devam et (çevrimdışı)").fetchSemanticsNodes().isNotEmpty()) {
                shot("01_giris")
                compose.onNodeWithText("Misafir olarak devam et (çevrimdışı)").performClick()
                compose.waitUntil(5_000) { compose.onAllNodes(hasSetTextAction()).fetchSemanticsNodes().isNotEmpty() }
                compose.onAllNodes(hasSetTextAction())[0].performTextInput("Deneme Şef")
                compose.onNodeWithText("Mutfağa gir").performClick()
            }
            waitText("Kategoriler", timeout = 20_000)
        }
        step("anasayfa") {
            waitText("Frambuazlı Trileçe", timeout = 20_000)
            shot("02_kesfet")
        }
        step("tarif_karti") {
            firstText("Frambuazlı Trileçe").performClick()
            waitText("Kart & Besin")
            shot("03_tarif_kart_besin")
        }
        step("malzemeler") {
            compose.onNodeWithText("Malzemeler").performClick()
            waitText("Malzeme Listesi")
            shot("04_malzemeler_8_kisi")
            compose.onNodeWithContentDescription("Artır").performClick()
            compose.onNodeWithContentDescription("Artır").performClick()
            shot("05_malzemeler_10_kisi")
        }
        step("yapilis") {
            compose.onNodeWithText("Yapılış").performClick()
            waitText("Adım Adım Yapılış")
            shot("06_adim_adim")
            firstText("zamanlayıcı", substring = true).performClick()
            Thread.sleep(1500)
            shot("07_akilli_zamanlayici")
        }
        step("yorumlar") {
            firstText("Yorumlar (", substring = true).performClick()
            waitText("Gönder")
            shot("08_yorum_puan")
        }
        step("kart_tasarla") {
            compose.onNodeWithContentDescription("Paylaş").performClick()
            compose.onNodeWithText("Tarif kartı tasarla (PNG)").performClick()
            compose.waitUntil(30_000) { compose.onAllNodes(hasContentDescription("Tarif kartı önizlemesi")).fetchSemanticsNodes().isNotEmpty() }
            shot("09_kart_tasarlayici")
            back()
            waitText("Kart & Besin")
            back()
        }
        step("png_sablonlari") {
            val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as TarifProApp
            val recipe = SeedData.recipes(System.currentTimeMillis()).first()
            Templates.all.forEach { t ->
                val bmp = runBlocking { RecipeCardRenderer.render(app.container.images, recipe.copy(templateId = t.id), recipe.servings, t) }
                save(bmp, "kart_${t.id}")
            }
            val report = NutritionCalculator.analyze(recipe)
            Log.i("SmokeTest", "Trileçe kcal/porsiyon=${report.perServing.kcal} eşleşmeyen=${report.unmatched.map { it.name }}")
        }
        step("arama") {
            waitText("Kategoriler")
            compose.onNodeWithText("Ara").performClick()
            waitText("Dolapta ne var?")
            shot("10_arama")
            compose.onNodeWithText("Dolapta ne var?").performClick()
            waitText("🧺 Dolapta ne var?")
            firstText("Yumurta").performClick()
            shot("11_dolapta_ne_var")
            firstText("Tarifleri göster", substring = true).performClick()
            Thread.sleep(800)
            shot("12_malzemeye_gore_sonuc")
        }
        step("tarif_ekle") {
            compose.onNodeWithText("Ekle").performClick()
            waitText("Yeni tarif")
            shot("13_tarif_editoru")
            back()
        }
        step("defterim") {
            waitText("Ara")
            compose.onNodeWithText("Defterim").performClick()
            waitText("Yemek defterlerim")
            shot("14_defterim")
        }
        step("topluluk") {
            compose.onNodeWithText("Topluluk").performClick()
            waitText("Akış")
            shot("15_topluluk_akis")
            compose.onNodeWithText("Kanallar").performClick()
            waitText("# Tatlı Severler")
            shot("16_kanallar")
            compose.onNodeWithText("# Tatlı Severler").performClick()
            waitText("Topluluk kanalı")
            shot("17_sohbet")
            back()
            compose.onNodeWithText("Şefler").performClick()
            waitText("Ayşe Pastacı", substring = true)
            shot("18_sefler")
        }
        step("profil_ayarlar") {
            firstText("Ayşe Pastacı", substring = true).performClick()
            waitText("Takipçi")
            shot("19_sef_profili")
            back()
            compose.onNodeWithText("Akış").performClick()
            Thread.sleep(500)
        }
        step("ayarlar_karanlik_mod") {
            compose.onNodeWithText("Keşfet").performClick()
            waitText("Kategoriler")
            compose.onNodeWithContentDescription("Bildirimler").performClick()
            waitText("Bildirimler")
            shot("20_bildirimler")
            back()
            waitText("Kategoriler")
            compose.onAllNodes(hasContentDescription("Yerel mod – veriler bu cihazda saklanıyor"))[0].performClick()
            waitText("Ayarlar")
            shot("21_ayarlar")
            compose.onNodeWithText("🌙 Koyu").performClick()
            Thread.sleep(600)
            shot("22_ayarlar_koyu")
            back()
            waitText("Kategoriler")
            shot("23_kesfet_koyu")
        }
        step("yonetici_paneli") {
            compose.onNodeWithText("Topluluk").performClick()
            waitText("Akış")
            compose.onNodeWithContentDescription("Profilim").performClick()
            waitText("Profilim")
            shot("24_profilim")
            compose.onNodeWithContentDescription("Yönetici paneli").performClick()
            waitText("Genel Bakış")
            shot("25_yonetici_paneli")
            compose.onNodeWithText("Şikayetler").performClick()
            Thread.sleep(600)
            shot("26_yonetici_sikayetler")
        }
        assertTrue("Başarısız adımlar:\n" + failures.joinToString("\n"), failures.isEmpty())
    }
}
