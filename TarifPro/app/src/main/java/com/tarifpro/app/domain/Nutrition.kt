package com.tarifpro.app.domain

import kotlin.math.roundToInt

/** Besin içerikleri 100 g başınadır (yaklaşık USDA / TürKomp değerleri). */
data class Food(
    val keys: List<String>,
    val kcal: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
    val sugar: Double,
    /** g/ml – hacim birimlerini grama çevirmek için. */
    val density: Double = 1.0,
    /** Bir adet/tanenin ortalama gramı. */
    val pieceG: Double? = null,
    /** Bir paketin gramı. */
    val packG: Double? = null,
    val flags: Set<String> = emptySet(),
    val emoji: String = "🥄",
) {
    val name: String get() = keys.first()
    fun per100() = NutritionFacts(kcal, protein, carbs, fat, fiber, sugar)
}

object FoodFlags {
    const val MEAT = "et"
    const val FISH = "balik"
    const val DAIRY = "sut"
    const val EGG = "yumurta"
    const val GLUTEN = "gluten"
    const val HONEY = "bal"
    const val NUTS = "kuruyemis"
}

object NutritionDb {
    private fun f(
        keys: String, kcal: Double, p: Double, c: Double, fat: Double, fib: Double, sug: Double,
        density: Double = 1.0, piece: Double? = null, pack: Double? = null, flags: String = "", emoji: String = "🥄",
    ) = Food(
        keys.split("|").map { it.trim() }, kcal, p, c, fat, fib, sug, density, piece, pack,
        flags.split(",").map { it.trim() }.filter { it.isNotEmpty() }.toSet(), emoji,
    )

    private const val M = FoodFlags.MEAT
    private const val FI = FoodFlags.FISH
    private const val D = FoodFlags.DAIRY
    private const val E = FoodFlags.EGG
    private const val G = FoodFlags.GLUTEN
    private const val N = FoodFlags.NUTS

    val foods: List<Food> = listOf(
        // Unlu mamuller ve tahıllar
        f("un|buğday unu|beyaz un|flour|all-purpose flour", 364.0, 10.3, 76.3, 1.0, 2.7, 0.3, 0.55, flags = G, emoji = "🌾"),
        f("tam buğday unu|kepekli un|whole wheat flour", 340.0, 13.2, 72.0, 2.5, 10.7, 0.4, 0.55, flags = G, emoji = "🌾"),
        f("mısır unu|corn flour|cornmeal", 361.0, 7.0, 77.0, 3.9, 7.3, 0.6, 0.6, emoji = "🌽"),
        f("pirinç unu|rice flour", 366.0, 6.0, 80.0, 1.4, 2.4, 0.1, 0.6, emoji = "🍚"),
        f("irmik|semolina", 360.0, 12.7, 72.8, 1.0, 3.9, 0.0, 0.7, flags = G, emoji = "🌾"),
        f("nişasta|mısır nişastası|buğday nişastası|cornstarch|corn starch", 381.0, 0.3, 91.0, 0.1, 0.9, 0.0, 0.65, emoji = "🥣"),
        f("kabartma tozu|baking powder", 53.0, 0.0, 28.0, 0.0, 0.2, 0.0, 0.9, pack = 10.0, emoji = "🧂"),
        f("karbonat|baking soda|kabartma sodası", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.1, pack = 10.0, emoji = "🧂"),
        f("vanilin|vanilya|vanilla", 288.0, 0.1, 12.7, 0.1, 0.0, 12.7, 0.6, pack = 5.0, emoji = "🌼"),
        f("instant maya|kuru maya|maya|yeast", 325.0, 40.4, 41.2, 7.6, 26.9, 0.0, 0.6, pack = 10.0, emoji = "🫧"),
        f("pirinç|baldo pirinç|osmancık pirinç|rice", 365.0, 7.1, 80.0, 0.7, 1.3, 0.1, 0.85, emoji = "🍚"),
        f("bulgur|pilavlık bulgur|köftelik bulgur", 342.0, 12.3, 75.9, 1.3, 18.3, 0.4, 0.75, flags = G, emoji = "🌾"),
        f("makarna|spagetti|penne|fettuccine|pasta|spaghetti", 371.0, 13.0, 75.0, 1.5, 3.2, 2.7, 0.4, pack = 500.0, flags = G, emoji = "🍝"),
        f("erişte|şehriye|noodle", 384.0, 14.2, 71.3, 4.4, 3.3, 1.9, 0.45, pack = 500.0, flags = G, emoji = "🍜"),
        f("yulaf|yulaf ezmesi|oats|rolled oats", 389.0, 16.9, 66.3, 6.9, 10.6, 0.0, 0.4, emoji = "🥣"),
        f("kinoa|quinoa", 368.0, 14.1, 64.2, 6.1, 7.0, 0.0, 0.85, emoji = "🍚"),
        f("ekmek|bayat ekmek|bread", 265.0, 9.0, 49.0, 3.2, 2.7, 5.0, 0.3, piece = 30.0, flags = G, emoji = "🍞"),
        f("galeta unu|breadcrumbs|bread crumbs", 395.0, 13.4, 71.9, 5.3, 4.5, 6.2, 0.45, flags = G, emoji = "🍞"),
        f("yufka|baklavalık yufka|phyllo", 300.0, 9.0, 62.0, 1.5, 2.0, 1.0, piece = 120.0, flags = G, emoji = "🫓"),
        f("bisküvi|petibör|biscuit|cookie", 480.0, 7.0, 70.0, 19.0, 2.0, 22.0, 0.5, piece = 8.0, pack = 150.0, flags = G, emoji = "🍪"),
        f("lavaş|tortilla", 310.0, 8.5, 52.0, 7.5, 3.0, 2.0, piece = 60.0, flags = G, emoji = "🫓"),

        // Şekerler
        f("şeker|toz şeker|kristal şeker|sugar|granulated sugar", 387.0, 0.0, 100.0, 0.0, 0.0, 100.0, 0.85, emoji = "🍬"),
        f("pudra şekeri|powdered sugar|icing sugar", 389.0, 0.0, 99.8, 0.0, 0.0, 97.8, 0.56, emoji = "🍬"),
        f("esmer şeker|brown sugar", 380.0, 0.1, 98.1, 0.0, 0.0, 97.0, 0.9, emoji = "🍬"),
        f("bal|honey", 304.0, 0.3, 82.4, 0.0, 0.2, 82.1, 1.42, flags = FoodFlags.HONEY, emoji = "🍯"),
        f("pekmez|üzüm pekmezi|molasses", 293.0, 0.0, 74.0, 0.0, 0.0, 70.0, 1.35, emoji = "🍯"),
        f("reçel|marmelat|jam", 278.0, 0.4, 68.9, 0.1, 1.1, 48.5, 1.33, emoji = "🍓"),
        f("akçaağaç şurubu|maple syrup", 260.0, 0.0, 67.0, 0.1, 0.0, 60.0, 1.32, emoji = "🍁"),

        // Süt ürünleri ve yumurta
        f("yumurta|eggs|egg", 143.0, 12.6, 0.7, 9.5, 0.0, 0.4, 1.03, piece = 50.0, flags = E, emoji = "🥚"),
        f("yumurta sarısı|egg yolk|egg yolks", 322.0, 15.9, 3.6, 26.5, 0.0, 0.6, 1.03, piece = 17.0, flags = E, emoji = "🥚"),
        f("yumurta beyazı|yumurta akı|egg white|egg whites", 52.0, 10.9, 0.7, 0.2, 0.0, 0.7, 1.03, piece = 33.0, flags = E, emoji = "🥚"),
        f("süt|tam yağlı süt|milk|whole milk", 61.0, 3.2, 4.8, 3.3, 0.0, 5.1, 1.03, flags = D, emoji = "🥛"),
        f("yarım yağlı süt|light süt|skim milk", 46.0, 3.4, 4.9, 1.5, 0.0, 5.0, 1.03, flags = D, emoji = "🥛"),
        f("soğuk süt", 61.0, 3.2, 4.8, 3.3, 0.0, 5.1, 1.03, flags = D, emoji = "🥛"),
        f("yoğunlaştırılmış süt|condensed milk|şekerli yoğunlaştırılmış süt", 321.0, 7.9, 54.4, 8.7, 0.0, 54.4, 1.3, flags = D, emoji = "🥫"),
        f("krema|sıvı krema|süt kreması|şanti krema|heavy cream|whipping cream|cream", 340.0, 2.8, 2.7, 36.0, 0.0, 2.9, 1.0, flags = D, emoji = "🥛"),
        f("krem şanti|toz krem şanti|whipped cream powder", 520.0, 4.0, 65.0, 27.0, 0.0, 55.0, 0.4, pack = 75.0, flags = D, emoji = "🍦"),
        f("tereyağı|tereyag|butter|unsalted butter", 717.0, 0.9, 0.1, 81.1, 0.0, 0.1, 0.91, piece = 10.0, pack = 250.0, flags = D, emoji = "🧈"),
        f("margarin|margarine", 717.0, 0.2, 0.7, 80.0, 0.0, 0.0, 0.91, pack = 250.0, emoji = "🧈"),
        f("yoğurt|yogurt|yoghurt", 61.0, 3.5, 4.7, 3.3, 0.0, 4.7, 1.03, flags = D, emoji = "🥣"),
        f("süzme yoğurt|greek yogurt|yunan yoğurdu", 97.0, 9.0, 3.9, 5.0, 0.0, 3.6, 1.1, flags = D, emoji = "🥣"),
        f("labne|krem peynir|cream cheese|mascarpone", 342.0, 6.0, 4.1, 34.0, 0.0, 3.2, 1.0, flags = D, emoji = "🧀"),
        f("beyaz peynir|feta|tulum peyniri", 264.0, 14.2, 4.1, 21.3, 0.0, 4.1, 0.6, flags = D, emoji = "🧀"),
        f("kaşar|kaşar peyniri|cheddar|rendelenmiş kaşar|cheese", 404.0, 24.9, 1.3, 33.1, 0.0, 0.5, 0.45, flags = D, emoji = "🧀"),
        f("parmesan|parmigiano", 431.0, 38.0, 4.1, 29.0, 0.0, 0.9, 0.4, flags = D, emoji = "🧀"),
        f("mozzarella|hellim|halloumi", 280.0, 27.5, 3.1, 17.1, 0.0, 1.0, 0.5, flags = D, emoji = "🧀"),
        f("lor|lor peyniri|ricotta|cottage cheese", 98.0, 11.1, 3.4, 4.3, 0.0, 2.7, 0.9, flags = D, emoji = "🧀"),
        f("ayran|kefir|buttermilk", 38.0, 1.7, 2.6, 2.0, 0.0, 2.6, 1.03, flags = D, emoji = "🥛"),

        // Yağlar, soslar
        f("zeytinyağı|zeytin yağı|sızma zeytinyağı|olive oil", 884.0, 0.0, 0.0, 100.0, 0.0, 0.0, 0.91, emoji = "🫒"),
        f("ayçiçek yağı|sıvı yağ|mısır özü yağı|yağ|vegetable oil|oil", 884.0, 0.0, 0.0, 100.0, 0.0, 0.0, 0.92, emoji = "🫗"),
        f("domates salçası|salça|tomato paste", 82.0, 4.3, 18.9, 0.5, 4.1, 12.2, 1.1, emoji = "🥫"),
        f("biber salçası|pepper paste", 70.0, 3.0, 13.0, 0.8, 4.0, 8.0, 1.1, emoji = "🥫"),
        f("sirke|üzüm sirkesi|elma sirkesi|vinegar", 18.0, 0.0, 0.04, 0.0, 0.0, 0.04, 1.01, emoji = "🫙"),
        f("nar ekşisi|pomegranate molasses", 250.0, 0.5, 62.0, 0.0, 0.5, 55.0, 1.3, emoji = "🫙"),
        f("soya sosu|soy sauce", 53.0, 8.1, 4.9, 0.6, 0.8, 0.4, 1.15, emoji = "🫙"),
        f("hardal|mustard", 66.0, 4.4, 5.8, 3.3, 4.0, 0.9, 1.05, emoji = "🫙"),
        f("mayonez|mayonnaise", 680.0, 1.0, 0.6, 75.0, 0.0, 0.6, 0.95, flags = E, emoji = "🫙"),
        f("ketçap|ketchup", 101.0, 1.0, 27.4, 0.1, 0.3, 22.8, 1.15, emoji = "🥫"),
        f("tahin|tahini", 595.0, 17.0, 21.2, 53.8, 9.3, 0.5, 1.0, emoji = "🫙"),
        f("fıstık ezmesi|peanut butter", 588.0, 25.1, 20.0, 50.4, 6.0, 9.2, 1.05, flags = N, emoji = "🥜"),
        f("et suyu|tavuk suyu|kemik suyu|broth|stock", 7.0, 1.0, 0.5, 0.2, 0.0, 0.2, 1.0, flags = M, emoji = "🍲"),
        f("su|sıcak su|ılık su|soğuk su|water", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, emoji = "💧"),

        // Baharatlar
        f("tuz|deniz tuzu|kaya tuzu|salt", 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.2, emoji = "🧂"),
        f("karabiber|black pepper|pepper", 251.0, 10.4, 64.0, 3.3, 25.3, 0.6, 0.5, emoji = "🧂"),
        f("pul biber|kırmızı biber|toz biber|paprika|chili flakes|isot", 282.0, 13.0, 54.0, 13.0, 35.0, 10.0, 0.45, emoji = "🌶️"),
        f("kimyon|cumin", 375.0, 17.8, 44.2, 22.3, 10.5, 2.3, 0.45, emoji = "🧂"),
        f("kekik|oregano|thyme", 265.0, 9.0, 69.0, 4.3, 42.5, 4.1, 0.25, emoji = "🌿"),
        f("kuru nane|nane|mint", 285.0, 19.9, 52.0, 6.0, 29.8, 0.0, 0.2, emoji = "🌿"),
        f("tarçın|cinnamon", 247.0, 4.0, 80.6, 1.2, 53.1, 2.2, 0.55, emoji = "🌰"),
        f("zerdeçal|turmeric", 312.0, 9.7, 67.1, 3.3, 22.7, 3.2, 0.5, emoji = "🧂"),
        f("zencefil|ginger", 80.0, 1.8, 17.8, 0.8, 2.0, 1.7, 0.6, piece = 15.0, emoji = "🫚"),
        f("sumak|sumac", 239.0, 4.0, 71.0, 6.0, 30.0, 0.0, 0.5, emoji = "🧂"),
        f("defne yaprağı|bay leaf", 313.0, 7.6, 75.0, 8.4, 26.3, 0.0, 0.2, piece = 0.2, emoji = "🍃"),
        f("kakao|cocoa|cocoa powder", 228.0, 19.6, 57.9, 13.7, 37.0, 1.8, 0.45, emoji = "🍫"),

        // Meyveler
        f("frambuaz|ahududu|raspberry|raspberries", 52.0, 1.2, 11.9, 0.7, 6.5, 4.4, 0.55, piece = 4.0, emoji = "🍓"),
        f("çilek|strawberry|strawberries", 32.0, 0.7, 7.7, 0.3, 2.0, 4.9, 0.6, piece = 12.0, emoji = "🍓"),
        f("yaban mersini|blueberry|blueberries", 57.0, 0.7, 14.5, 0.3, 2.4, 10.0, 0.6, emoji = "🫐"),
        f("vişne|kiraz|cherry|cherries", 50.0, 1.0, 12.2, 0.3, 1.6, 8.5, 0.6, piece = 6.0, emoji = "🍒"),
        f("muz|banana", 89.0, 1.1, 22.8, 0.3, 2.6, 12.2, 0.6, piece = 120.0, emoji = "🍌"),
        f("elma|apple", 52.0, 0.3, 13.8, 0.2, 2.4, 10.4, 0.6, piece = 180.0, emoji = "🍎"),
        f("armut|pear", 57.0, 0.4, 15.2, 0.1, 3.1, 9.8, 0.6, piece = 180.0, emoji = "🍐"),
        f("limon|lemon", 29.0, 1.1, 9.3, 0.3, 2.8, 2.5, 0.9, piece = 100.0, emoji = "🍋"),
        f("limon suyu|lemon juice", 22.0, 0.4, 6.9, 0.2, 0.3, 2.5, 1.03, emoji = "🍋"),
        f("limon kabuğu rendesi|lemon zest|portakal kabuğu rendesi", 47.0, 1.5, 16.0, 0.3, 10.6, 4.2, 0.4, emoji = "🍋"),
        f("portakal|orange", 47.0, 0.9, 11.8, 0.1, 2.4, 9.4, 0.9, piece = 150.0, emoji = "🍊"),
        f("portakal suyu|orange juice", 45.0, 0.7, 10.4, 0.2, 0.2, 8.4, 1.04, emoji = "🍊"),
        f("nar|pomegranate", 83.0, 1.7, 18.7, 1.2, 4.0, 13.7, 0.8, piece = 250.0, emoji = "🍎"),
        f("şeftali|kayısı|peach|apricot", 42.0, 1.0, 10.0, 0.3, 1.8, 8.5, 0.6, piece = 120.0, emoji = "🍑"),
        f("üzüm|grape|grapes", 69.0, 0.7, 18.1, 0.2, 0.9, 15.5, 0.6, emoji = "🍇"),
        f("ananas|pineapple", 50.0, 0.5, 13.1, 0.1, 1.4, 9.9, 0.6, emoji = "🍍"),
        f("mango", 60.0, 0.8, 15.0, 0.4, 1.6, 13.7, 0.6, piece = 200.0, emoji = "🥭"),
        f("kuru üzüm|raisin|raisins", 299.0, 3.1, 79.2, 0.5, 3.7, 59.2, 0.6, emoji = "🍇"),
        f("hurma|date|dates", 282.0, 2.5, 75.0, 0.4, 8.0, 63.4, 0.6, piece = 8.0, emoji = "🌴"),
        f("kuru kayısı|kuru incir|dried apricot", 241.0, 3.4, 62.6, 0.5, 7.3, 53.4, 0.6, piece = 8.0, emoji = "🍑"),
        f("avokado|avocado", 160.0, 2.0, 8.5, 14.7, 6.7, 0.7, 0.9, piece = 150.0, emoji = "🥑"),
        f("hindistan cevizi|coconut", 660.0, 6.9, 23.7, 64.5, 16.3, 7.4, 0.35, emoji = "🥥"),
        f("hindistan cevizi sütü|coconut milk", 230.0, 2.3, 5.5, 23.8, 2.2, 3.3, 1.0, emoji = "🥥"),

        // Sebzeler
        f("domates|tomato|tomatoes|cherry domates", 18.0, 0.9, 3.9, 0.2, 1.2, 2.6, 0.95, piece = 150.0, emoji = "🍅"),
        f("rendelenmiş domates|domates püresi|konserve domates|crushed tomatoes", 32.0, 1.6, 7.3, 0.3, 1.9, 4.4, 1.02, pack = 400.0, emoji = "🍅"),
        f("soğan|kuru soğan|kırmızı soğan|onion|onions", 40.0, 1.1, 9.3, 0.1, 1.7, 4.2, 0.6, piece = 110.0, emoji = "🧅"),
        f("taze soğan|yeşil soğan|green onion|scallion", 32.0, 1.8, 7.3, 0.2, 2.6, 2.3, 0.4, piece = 15.0, emoji = "🧅"),
        f("sarımsak|garlic", 149.0, 6.4, 33.1, 0.5, 2.1, 1.0, 0.6, piece = 5.0, emoji = "🧄"),
        f("patates|potato|potatoes", 77.0, 2.0, 17.5, 0.1, 2.2, 0.8, 0.65, piece = 170.0, emoji = "🥔"),
        f("tatlı patates|sweet potato", 86.0, 1.6, 20.1, 0.1, 3.0, 4.2, 0.65, piece = 200.0, emoji = "🍠"),
        f("havuç|carrot|carrots", 41.0, 0.9, 9.6, 0.2, 2.8, 4.7, 0.55, piece = 70.0, emoji = "🥕"),
        f("biber|sivri biber|yeşil biber|çarliston biber|dolmalık biber|bell pepper", 20.0, 0.9, 4.6, 0.2, 1.7, 2.4, 0.5, piece = 40.0, emoji = "🫑"),
        f("kapya biber|kırmızı kapya|red pepper", 31.0, 1.0, 6.0, 0.3, 2.1, 4.2, 0.5, piece = 120.0, emoji = "🫑"),
        f("patlıcan|eggplant|aubergine", 25.0, 1.0, 5.9, 0.2, 3.0, 3.5, 0.5, piece = 250.0, emoji = "🍆"),
        f("kabak|sakız kabağı|zucchini|courgette", 17.0, 1.2, 3.1, 0.3, 1.0, 2.5, 0.6, piece = 200.0, emoji = "🥒"),
        f("balkabağı|bal kabağı|pumpkin", 26.0, 1.0, 6.5, 0.1, 0.5, 2.8, 0.6, emoji = "🎃"),
        f("salatalık|hıyar|cucumber", 15.0, 0.7, 3.6, 0.1, 0.5, 1.7, 0.6, piece = 150.0, emoji = "🥒"),
        f("marul|kıvırcık|göbek marul|lettuce", 15.0, 1.4, 2.9, 0.2, 1.3, 0.8, 0.2, piece = 300.0, emoji = "🥬"),
        f("ıspanak|spinach", 23.0, 2.9, 3.6, 0.4, 2.2, 0.4, 0.2, piece = 250.0, emoji = "🥬"),
        f("roka|arugula|rocket", 25.0, 2.6, 3.7, 0.7, 1.6, 2.0, 0.2, emoji = "🥬"),
        f("lahana|beyaz lahana|kırmızı lahana|cabbage", 25.0, 1.3, 5.8, 0.1, 2.5, 3.2, 0.35, emoji = "🥬"),
        f("maydanoz|parsley", 36.0, 3.0, 6.3, 0.8, 3.3, 0.9, 0.25, piece = 50.0, emoji = "🌿"),
        f("dereotu|dill", 43.0, 3.5, 7.0, 1.1, 2.1, 0.0, 0.25, piece = 40.0, emoji = "🌿"),
        f("taze nane|fesleğen|basil|kişniş|cilantro", 44.0, 3.2, 7.0, 0.6, 3.5, 0.3, 0.25, piece = 30.0, emoji = "🌿"),
        f("mantar|kültür mantarı|mushroom|mushrooms", 22.0, 3.1, 3.3, 0.3, 1.0, 2.0, 0.45, piece = 20.0, emoji = "🍄"),
        f("brokoli|broccoli", 34.0, 2.8, 6.6, 0.4, 2.6, 1.7, 0.4, piece = 300.0, emoji = "🥦"),
        f("karnabahar|cauliflower", 25.0, 1.9, 5.0, 0.3, 2.0, 1.9, 0.4, piece = 500.0, emoji = "🥦"),
        f("mısır|konserve mısır|corn|sweet corn", 86.0, 3.3, 19.0, 1.4, 2.7, 3.2, 0.7, emoji = "🌽"),
        f("bezelye|peas", 81.0, 5.4, 14.5, 0.4, 5.7, 5.7, 0.65, emoji = "🫛"),
        f("taze fasulye|green beans", 31.0, 1.8, 7.0, 0.2, 2.7, 3.3, 0.45, emoji = "🫛"),
        f("pancar|kırmızı pancar|beetroot|beet", 43.0, 1.6, 9.6, 0.2, 2.8, 6.8, 0.6, piece = 150.0, emoji = "🫜"),
        f("kereviz|celery", 16.0, 0.7, 3.0, 0.2, 1.6, 1.3, 0.5, piece = 400.0, emoji = "🥬"),
        f("pırasa|leek", 61.0, 1.5, 14.2, 0.3, 1.8, 3.9, 0.4, piece = 250.0, emoji = "🥬"),
        f("zeytin|siyah zeytin|yeşil zeytin|olive|olives", 115.0, 0.8, 6.3, 10.7, 3.2, 0.0, 0.65, piece = 4.0, emoji = "🫒"),
        f("turşu|kornişon|pickles", 12.0, 0.5, 2.4, 0.2, 1.0, 1.1, 0.7, piece = 20.0, emoji = "🥒"),

        // Bakliyat
        f("nohut|haşlanmış nohut|chickpeas|chickpea", 164.0, 8.9, 27.4, 2.6, 7.6, 4.8, 0.65, pack = 400.0, emoji = "🫘"),
        f("kuru nohut", 364.0, 19.3, 60.7, 6.0, 17.4, 10.7, 0.8, emoji = "🫘"),
        f("kırmızı mercimek|sarı mercimek|mercimek|red lentils|lentils", 358.0, 24.0, 63.0, 2.2, 10.7, 2.0, 0.85, emoji = "🫘"),
        f("yeşil mercimek|green lentils", 353.0, 25.8, 60.1, 1.1, 10.7, 2.0, 0.85, emoji = "🫘"),
        f("kuru fasulye|barbunya|beans|kidney beans", 333.0, 23.4, 60.0, 0.8, 15.2, 2.2, 0.8, emoji = "🫘"),
        f("tofu", 76.0, 8.1, 1.9, 4.8, 0.3, 0.6, 1.0, pack = 400.0, emoji = "⬜"),

        // Et, tavuk, balık
        f("kıyma|dana kıyma|kuzu kıyma|ground beef|minced meat", 250.0, 17.2, 0.0, 20.0, 0.0, 0.0, 1.0, flags = M, emoji = "🥩"),
        f("dana eti|kuşbaşı|biftek|antrikot|bonfile|beef|steak", 217.0, 26.1, 0.0, 11.8, 0.0, 0.0, 1.0, flags = M, emoji = "🥩"),
        f("kuzu eti|kuzu incik|kuzu pirzola|lamb", 294.0, 24.5, 0.0, 20.9, 0.0, 0.0, 1.0, piece = 150.0, flags = M, emoji = "🍖"),
        f("tavuk göğsü|tavuk fileto|chicken breast", 165.0, 31.0, 0.0, 3.6, 0.0, 0.0, 1.0, piece = 200.0, flags = M, emoji = "🍗"),
        f("tavuk but|baget|tavuk kanat|chicken thigh|chicken wings", 209.0, 26.0, 0.0, 10.9, 0.0, 0.0, 1.0, piece = 150.0, flags = M, emoji = "🍗"),
        f("tavuk|bütün tavuk|chicken", 190.0, 29.0, 0.0, 7.4, 0.0, 0.0, 1.0, piece = 1200.0, flags = M, emoji = "🍗"),
        f("hindi|turkey", 135.0, 29.0, 0.0, 1.7, 0.0, 0.0, 1.0, flags = M, emoji = "🍗"),
        f("sucuk|sosis|salam|sausage", 450.0, 20.0, 2.0, 40.0, 0.0, 1.0, 1.0, piece = 50.0, flags = M, emoji = "🌭"),
        f("pastırma|jambon|bacon|pastrami", 250.0, 29.0, 1.0, 14.0, 0.0, 0.0, 1.0, piece = 10.0, flags = M, emoji = "🥓"),
        f("jelatin|toz jelatin|gelatin", 335.0, 85.6, 0.0, 0.1, 0.0, 0.0, 0.7, pack = 10.0, piece = 2.0, flags = M, emoji = "🫙"),
        f("somon|salmon", 208.0, 20.4, 0.0, 13.4, 0.0, 0.0, 1.0, piece = 180.0, flags = FI, emoji = "🐟"),
        f("levrek|çipura|hamsi|palamut|balık|fish|sea bass|cod", 124.0, 23.6, 0.0, 2.7, 0.0, 0.0, 1.0, piece = 350.0, flags = FI, emoji = "🐟"),
        f("karides|shrimp|prawn|prawns", 99.0, 24.0, 0.2, 0.3, 0.0, 0.0, 1.0, piece = 12.0, flags = FI, emoji = "🦐"),
        f("ton balığı|tuna", 132.0, 28.2, 0.0, 1.3, 0.0, 0.0, 1.0, pack = 160.0, flags = FI, emoji = "🐟"),
        f("midye|kalamar|mussels|squid", 86.0, 11.9, 3.7, 2.2, 0.0, 0.0, 1.0, piece = 15.0, flags = FI, emoji = "🦪"),

        // Kuruyemiş ve tohumlar
        f("ceviz|ceviz içi|walnut|walnuts", 654.0, 15.2, 13.7, 65.2, 6.7, 2.6, 0.45, piece = 5.0, flags = N, emoji = "🌰"),
        f("fındık|fındık içi|hazelnut|hazelnuts", 628.0, 15.0, 16.7, 60.8, 9.7, 4.3, 0.55, piece = 1.5, flags = N, emoji = "🌰"),
        f("badem|almond|almonds", 579.0, 21.2, 21.6, 49.9, 12.5, 4.4, 0.55, piece = 1.2, flags = N, emoji = "🌰"),
        f("antep fıstığı|fıstık|pistachio|pistachios", 560.0, 20.2, 27.5, 45.3, 10.6, 7.7, 0.55, flags = N, emoji = "🥜"),
        f("yer fıstığı|peanut|peanuts", 567.0, 25.8, 16.1, 49.2, 8.5, 4.7, 0.6, flags = N, emoji = "🥜"),
        f("çam fıstığı|pine nuts", 673.0, 13.7, 13.1, 68.4, 3.7, 3.6, 0.6, flags = N, emoji = "🌰"),
        f("susam|sesame", 573.0, 17.7, 23.5, 49.7, 11.8, 0.3, 0.6, emoji = "🌰"),
        f("chia tohumu|chia|keten tohumu|flaxseed", 486.0, 16.5, 42.1, 30.7, 34.4, 0.0, 0.65, emoji = "🌱"),

        // Çikolata ve tatlı malzemeleri
        f("bitter çikolata|çikolata|dark chocolate|chocolate", 546.0, 4.9, 61.2, 31.3, 7.0, 48.0, 0.6, piece = 7.0, pack = 80.0, emoji = "🍫"),
        f("sütlü çikolata|milk chocolate", 535.0, 7.6, 59.4, 29.7, 3.4, 51.5, 0.6, piece = 7.0, pack = 80.0, flags = D, emoji = "🍫"),
        f("beyaz çikolata|white chocolate", 539.0, 5.9, 59.2, 32.1, 0.2, 59.0, 0.6, pack = 80.0, flags = D, emoji = "🍫"),
        f("protein tozu|whey|protein powder", 380.0, 80.0, 8.0, 5.0, 0.0, 3.0, 0.4, flags = D, emoji = "💪"),
        f("kahve|espresso|türk kahvesi|coffee", 2.0, 0.1, 0.0, 0.0, 0.0, 0.0, 1.0, emoji = "☕"),
        f("granola|müsli|muesli", 471.0, 10.0, 64.0, 20.0, 7.0, 25.0, 0.45, flags = G, emoji = "🥣"),
    )

    private val index: List<Pair<String, Food>> = foods
        .flatMap { food -> food.keys.map { TurkishText.fold(it) to food } }
        .sortedByDescending { it.first.length }

    /** İsimle en iyi eşleşen besini bulur (en uzun anahtar, kelime başından). */
    fun match(name: String): Food? {
        val folded = " " + TurkishText.fold(name).replace(Regex("[^a-z0-9 ]"), " ") + " "
        for ((key, food) in index) {
            var idx = folded.indexOf(key)
            while (idx >= 0) {
                val before = folded.getOrNull(idx - 1)
                if (before == null || before == ' ') return food
                idx = folded.indexOf(key, idx + 1)
            }
        }
        return null
    }

    val allIngredientNames: List<String> = foods.map { TurkishText.capitalize(it.keys.first()) }.distinct().sorted()
}

data class IngredientNutrition(
    val ingredient: Ingredient,
    val food: Food?,
    val grams: Double?,
    val facts: NutritionFacts,
)

data class NutritionReport(
    val total: NutritionFacts,
    val perServing: NutritionFacts,
    val servings: Int,
    val items: List<IngredientNutrition>,
    val totalGrams: Double,
) {
    val unmatched: List<Ingredient> get() = items.filter { it.food == null || it.grams == null }.map { it.ingredient }
    val coverage: Double get() = if (items.isEmpty()) 0.0 else items.count { it.food != null && it.grams != null }.toDouble() / items.size

    /** Makro besinlerin kaloriye katkı yüzdesi (protein, karbonhidrat, yağ). */
    fun macroSplit(): Triple<Int, Int, Int> {
        val p = perServing.protein * 4
        val c = perServing.carbs * 4
        val f = perServing.fat * 9
        val sum = p + c + f
        if (sum <= 0) return Triple(0, 0, 0)
        val pp = (p / sum * 100).roundToInt()
        val cc = (c / sum * 100).roundToInt()
        return Triple(pp, cc, 100 - pp - cc)
    }
}

data class HealthTag(val label: String, val positive: Boolean)

object NutritionCalculator {

    fun gramsOf(ing: Ingredient, food: Food?): Double? {
        ing.grams?.let { return it }
        val base = ing.amount ?: return null
        val amt = ing.amountMax?.let { (base + it) / 2 } ?: base
        val unit = Units.find(ing.unit)
        if (unit == null) {
            if (ing.unit.isBlank()) {
                // "3 yumurta" gibi birimsiz sayım
                return food?.pieceG?.let { amt * it } ?: if (food != null && amt >= 20) amt else null
            }
            return null
        }
        unit.grams?.let { return amt * it }
        unit.ml?.let { return amt * it * (food?.density ?: 1.0) }
        return when (unit.key) {
            "adet" -> amt * (food?.pieceG ?: 100.0)
            "paket" -> amt * (food?.packG ?: 10.0)
            "diş" -> amt * 5.0
            "dilim" -> amt * (food?.pieceG?.coerceAtMost(40.0) ?: 30.0)
            "demet" -> amt * (food?.pieceG ?: 50.0)
            "tutam" -> amt * 0.5
            "avuç" -> amt * 30.0
            "kutu" -> amt * (food?.packG ?: 400.0)
            else -> null
        }
    }

    fun analyze(ingredients: List<Ingredient>, servings: Int): NutritionReport {
        var total = NutritionFacts()
        var grams = 0.0
        val items = ingredients.map { ing ->
            val food = NutritionDb.match(ing.name)
            val g = gramsOf(ing, food)
            val facts = if (food != null && g != null) food.per100() * (g / 100.0) else NutritionFacts()
            total += facts
            if (g != null) grams += g
            IngredientNutrition(ing, food, g, facts)
        }
        val s = servings.coerceAtLeast(1)
        return NutritionReport(total, total / s.toDouble(), s, items, grams)
    }

    fun analyze(recipe: Recipe): NutritionReport = analyze(recipe.ingredients, recipe.servings)

    fun kcalPerServing(recipe: Recipe): Int = analyze(recipe).perServing.kcal.roundToInt()

    fun healthTags(report: NutritionReport): List<HealthTag> {
        val p = report.perServing
        val tags = mutableListOf<HealthTag>()
        val flags = report.items.mapNotNull { it.food }.flatMap { it.flags }.toSet()
        if (FoodFlags.MEAT !in flags && FoodFlags.FISH !in flags) {
            if (FoodFlags.DAIRY !in flags && FoodFlags.EGG !in flags && FoodFlags.HONEY !in flags) {
                tags += HealthTag("Vegan", true)
            } else {
                tags += HealthTag("Vejetaryen", true)
            }
        }
        if (FoodFlags.GLUTEN !in flags) tags += HealthTag("Glutensiz", true)
        if (FoodFlags.DAIRY !in flags) tags += HealthTag("Laktozsuz", true)
        if (p.kcal in 1.0..350.0) tags += HealthTag("Düşük Kalori", true)
        if (p.protein >= 20 || (p.kcal > 0 && p.protein * 4 / p.kcal >= 0.25)) tags += HealthTag("Yüksek Protein", true)
        if (p.fiber >= 5) tags += HealthTag("Lif Kaynağı", true)
        if (p.carbs in 0.1..15.0) tags += HealthTag("Düşük Karbonhidrat", true)
        if (p.sugar >= 25) tags += HealthTag("Yüksek Şeker", false)
        if (p.fat >= 30) tags += HealthTag("Yüksek Yağ", false)
        if (p.kcal >= 700) tags += HealthTag("Yüksek Kalori", false)
        if (FoodFlags.NUTS in flags) tags += HealthTag("Kuruyemiş İçerir", false)
        return tags
    }

    fun emojiFor(ing: Ingredient): String = NutritionDb.match(ing.name)?.emoji ?: "🥄"
}
