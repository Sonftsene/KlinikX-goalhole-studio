package com.tarifpro.app

import com.tarifpro.app.domain.DurationDetector
import com.tarifpro.app.domain.Ingredient
import com.tarifpro.app.domain.IngredientParser
import com.tarifpro.app.domain.NutritionCalculator
import com.tarifpro.app.domain.NutritionDb
import com.tarifpro.app.domain.PlainTextRecipeParser
import com.tarifpro.app.domain.QuantityFormat
import com.tarifpro.app.domain.Scaler
import com.tarifpro.app.domain.SearchDoc
import com.tarifpro.app.domain.SearchEngine
import com.tarifpro.app.domain.SearchFilters
import com.tarifpro.app.domain.TurkishText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainTest {

    @Test
    fun foldsTurkishCharacters() {
        assertEquals("cilek sut soguk", TurkishText.fold("Çilek SÜT Soğuk"))
        assertEquals("isik", TurkishText.fold("IŞIK"))
    }

    @Test
    fun parsesIngredientLines() {
        val a = IngredientParser.parse("2 su bardağı un (elenmiş)")!!
        assertEquals(2.0, a.amount!!, 0.001)
        assertEquals("su bardağı", a.unit)
        assertEquals("un", a.name)
        assertEquals("elenmiş", a.note)

        val b = IngredientParser.parse("1 1/2 yemek kaşığı nişasta")!!
        assertEquals(1.5, b.amount!!, 0.001)
        assertEquals("yemek kaşığı", b.unit)

        val c = IngredientParser.parse("60–80 ml su")!!
        assertEquals(60.0, c.amount!!, 0.001)
        assertEquals(80.0, c.amountMax!!, 0.001)
        assertEquals("ml", c.unit)
        assertEquals("su", c.name)

        val d = IngredientParser.parse("½ çay kaşığı tuz")!!
        assertEquals(0.5, d.amount!!, 0.001)
        assertEquals("çay kaşığı", d.unit)

        val e = IngredientParser.parse("3 yumurta")!!
        assertEquals(3.0, e.amount!!, 0.001)
        assertEquals("", e.unit)
        assertEquals("yumurta", e.name)

        val f = IngredientParser.parse("Tuz, karabiber")!!
        assertEquals(null, f.amount)

        val g = IngredientParser.parse("1/2 su bardağı süt")!!
        assertEquals(0.5, g.amount!!, 0.001)

        val h = IngredientParser.parse("2 cups flour")!!
        assertEquals("cup", h.unit)
        assertEquals("flour", h.name)
    }

    @Test
    fun scalesAndFormats() {
        val ing = Ingredient(amount = 0.5, unit = "su bardağı", name = "şeker")
        val scaled = Scaler.scale(ing, Scaler.factor(2, 6))
        assertEquals("1 ½", QuantityFormat.ingredientAmount(scaled))
        assertEquals("⅓", QuantityFormat.fraction(0.33))
        assertEquals("135", QuantityFormat.amount(90.0 * 1.5, "g"))
        assertEquals("2,5", QuantityFormat.amount(2.5, "g"))
        assertEquals("3 adet yumurta", QuantityFormat.ingredientLine(Ingredient(amount = 3.0, unit = "adet", name = "yumurta")))
    }

    @Test
    fun matchesFoods() {
        assertEquals("yumurta sarısı", NutritionDb.match("Yumurta sarısı")!!.name)
        assertEquals("yoğunlaştırılmış süt", NutritionDb.match("yoğunlaştırılmış süt")!!.name)
        assertEquals("krem şanti", NutritionDb.match("toz krem şanti")!!.name)
        assertEquals("tereyağı", NutritionDb.match("Tereyağı (oda sıcaklığında)")!!.name)
        assertEquals("frambuaz", NutritionDb.match("frambuaz")!!.name)
        assertEquals("karabiber", NutritionDb.match("karabiber")!!.name)
        assertEquals("hindistan cevizi", NutritionDb.match("hindistan cevizi")!!.name)
    }

    @Test
    fun computesNutritionForCake() {
        val ings = listOf(
            Ingredient(amount = 3.0, unit = "adet", name = "yumurta"),
            Ingredient(amount = 90.0, unit = "g", name = "toz şeker"),
            Ingredient(amount = 90.0, unit = "g", name = "un"),
        )
        val r = NutritionCalculator.analyze(ings, 2)
        // 150g yumurta=214.5, 90g şeker=348.3, 90g un=327.6 => 890.4
        assertEquals(890.4, r.total.kcal, 1.0)
        assertEquals(445.2, r.perServing.kcal, 1.0)
        assertTrue(r.unmatched.isEmpty())
        val tags = NutritionCalculator.healthTags(r).map { it.label }
        assertTrue("Vejetaryen" in tags)
    }

    @Test
    fun detectsDurations() {
        val s = DurationDetector.detect("170°C'de 25–30 dakika pişirin. Sonra 2-3 saat dinlendirin.")
        assertEquals(25, s[0].minutes)
        assertEquals(30, s[0].maxMinutes)
        assertEquals(120, s[1].minutes)
        assertEquals(90, DurationDetector.parseIso("PT1H30M"))
        assertEquals(45, DurationDetector.parseIso("PT45M"))
    }

    @Test
    fun parsesPlainText() {
        val text = """
            Mercimek Çorbası
            4 kişilik
            Malzemeler:
            1 su bardağı kırmızı mercimek
            1 adet soğan
            2 yemek kaşığı tereyağı
            Yapılışı:
            1. Soğanı tereyağında 3 dakika kavurun.
            2. Mercimeği ekleyip 25 dakika pişirin.
            Püf Noktaları:
            - Limonla servis edin.
        """.trimIndent()
        val p = PlainTextRecipeParser.parse(text)
        assertEquals("Mercimek Çorbası", p.title)
        assertEquals(3, p.ingredients.size)
        assertEquals(2, p.steps.size)
        assertEquals(25, p.steps[1].minutes)
        assertEquals(1, p.tips.size)
        assertEquals(4, p.servings)
    }

    @Test
    fun searchesWithTyposAndPantry() {
        val docs = listOf(
            SearchDoc("1", "Frambuazlı Trileçe", "Hafif tatlı", listOf("tatlı"), listOf("süt", "yumurta", "frambuaz"), "Ayşe", "Tatlı", "Türk", 2, 450, 60, 4.8, 10, 1),
            SearchDoc("2", "Mercimek Çorbası", "Klasik", listOf("çorba"), listOf("mercimek", "soğan", "tereyağı"), "Mehmet", "Çorba", "Türk", 1, 210, 40, 4.5, 3, 2),
            SearchDoc("3", "Menemen", "Kahvaltı", listOf("kahvaltı"), listOf("yumurta", "domates", "biber"), "Ali", "Kahvaltı", "Türk", 1, 300, 15, 4.9, 30, 3),
        )
        val engine = SearchEngine(docs)
        assertEquals("1", engine.search(SearchFilters(query = "trilece")).first().id)
        assertEquals("2", engine.search(SearchFilters(query = "mercimk")).first().id)
        assertEquals("2", engine.search(SearchFilters(query = "çor")).first().id)
        val pantry = engine.search(SearchFilters(pantry = setOf("Yumurta", "Domates")))
        assertEquals(listOf("3"), pantry.map { it.id })
        assertEquals(2, engine.search(SearchFilters(pantry = setOf("yumurta"))).size)
        assertEquals(listOf("2"), engine.search(SearchFilters(maxKcal = 250)).map { it.id })
        assertNotNull(engine.suggest("mer").firstOrNull())
    }
}
