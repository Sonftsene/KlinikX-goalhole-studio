package com.tarifpro.app.domain

/** "2 su bardağı un (elenmiş)" gibi satırları yapılandırılmış malzemeye çevirir. */
object IngredientParser {
    private val unicodeFractions = mapOf(
        '¼' to 0.25, '½' to 0.5, '¾' to 0.75, '⅓' to 1.0 / 3, '⅔' to 2.0 / 3, '⅛' to 0.125,
    )

    private val numberToken = Regex("""^(\d+(?:[.,]\d+)?)?(?:\s*([¼½¾⅓⅔⅛]))?(?:\s+(\d+)/(\d+)|/(\d+))?""")

    private val wordNumbers = mapOf(
        "bir" to 1.0, "iki" to 2.0, "üç" to 3.0, "uc" to 3.0, "dört" to 4.0, "dort" to 4.0, "beş" to 5.0, "bes" to 5.0,
        "altı" to 6.0, "alti" to 6.0, "yarım" to 0.5, "yarim" to 0.5, "çeyrek" to 0.25, "ceyrek" to 0.25,
        "one" to 1.0, "two" to 2.0, "three" to 3.0, "half" to 0.5,
    )

    /** Metnin başındaki sayıyı okur. Dönen değer: (sayı, okunan karakter sayısı) */
    fun readNumber(text: String): Pair<Double, Int>? {
        val t = text.trimStart()
        val offset = text.length - t.length
        // "1 1/2", "1/2", "1,5", "½", "1½"
        val m = numberToken.find(t)
        if (m != null && m.value.isNotBlank()) {
            var value = 0.0
            var any = false
            val whole = m.groupValues[1]
            if (whole.isNotEmpty()) {
                value += whole.replace(',', '.').toDouble(); any = true
            }
            val glyph = m.groupValues[2]
            if (glyph.isNotEmpty()) {
                value += unicodeFractions[glyph[0]] ?: 0.0; any = true
            }
            if (m.groupValues[3].isNotEmpty() && m.groupValues[4].isNotEmpty()) {
                val den = m.groupValues[4].toDouble()
                if (den != 0.0) value += m.groupValues[3].toDouble() / den
            } else if (m.groupValues[5].isNotEmpty() && whole.isNotEmpty()) {
                // "1/2" -> whole = 1, den = 2
                val den = m.groupValues[5].toDouble()
                value = if (den != 0.0) whole.replace(',', '.').toDouble() / den else value
            }
            if (any) return value to (offset + m.value.trimEnd().length)
        }
        val firstWord = t.takeWhile { !it.isWhitespace() }
        val w = wordNumbers[TurkishText.lower(firstWord)]
        if (w != null) return w to (offset + firstWord.length)
        return null
    }

    fun parse(rawLine: String, group: String = ""): Ingredient? {
        var line = rawLine.trim().trimStart('-', '*', '•', '·', '–', '—', '○', '◦', '▪').trim()
        if (line.isBlank()) return null
        var note = ""
        val paren = Regex("""\(([^)]*)\)""").find(line)
        if (paren != null) {
            note = paren.groupValues[1].trim()
            line = line.removeRange(paren.range).replace(Regex("\\s{2,}"), " ").trim()
        }
        var amount: Double? = null
        var amountMax: Double? = null
        var rest = line
        readNumber(rest)?.let { (v, len) ->
            amount = v
            rest = rest.substring(len).trimStart()
            // Aralık: "2-3", "60–80"
            if (rest.startsWith("-") || rest.startsWith("–") || rest.startsWith("—")) {
                val after = rest.substring(1)
                readNumber(after)?.let { (v2, len2) ->
                    amountMax = v2
                    rest = after.substring(len2).trimStart()
                }
            }
        }
        var unit = ""
        Units.matchPrefix(rest)?.let { (u, remaining) ->
            unit = u.key
            rest = remaining
        }
        // "yarım su bardağı" gibi kelime ile başlayan miktarlardan sonra gelebilen sayı yoksa sorun değil
        var name = rest.trim().trimStart(',', ':', '-').trim()
        // "un, elenmiş" -> not
        val comma = name.indexOf(',')
        if (comma > 0 && note.isEmpty()) {
            note = name.substring(comma + 1).trim()
            name = name.substring(0, comma).trim()
        }
        if (name.isEmpty()) {
            name = line
            amount = null; amountMax = null; unit = ""
        }
        return Ingredient(group = group, amount = amount, amountMax = amountMax, unit = unit, name = name, note = note)
    }
}

data class TimerSuggestion(val minutes: Int, val maxMinutes: Int?, val label: String)

/** Adım metnindeki süreleri ("25–30 dakika", "2 saat", "45 sn") bularak akıllı zamanlayıcı önerir. */
object DurationDetector {
    private val pattern = Regex(
        """(\d+(?:[.,]\d+)?)\s*(?:[-–—]|ile|to)?\s*(\d+(?:[.,]\d+)?)?\s*(saat|sa\b|dakika|dk|dak\b|saniye|sn\b|hours?|hrs?|minutes?|mins?|seconds?|secs?)""",
        RegexOption.IGNORE_CASE,
    )

    fun detect(text: String): List<TimerSuggestion> {
        val result = mutableListOf<TimerSuggestion>()
        for (m in pattern.findAll(text)) {
            val a = m.groupValues[1].replace(',', '.').toDoubleOrNull() ?: continue
            val b = m.groupValues[2].replace(',', '.').toDoubleOrNull()
            val unit = TurkishText.lower(m.groupValues[3])
            val mult = when {
                unit.startsWith("sa") || unit.startsWith("h") -> 60.0
                unit.startsWith("sn") || unit.startsWith("san") || unit.startsWith("sec") -> 1.0 / 60
                else -> 1.0
            }
            val minA = (a * mult).let { if (it < 1) 1.0 else it }.toInt()
            val minB = b?.let { (it * mult).toInt() }
            if (minA <= 0 || minA > 72 * 60) continue
            val label = m.value.trim()
            if (result.none { it.minutes == minA }) result += TimerSuggestion(minA, minB, label)
        }
        return result
    }

    fun firstMinutes(text: String): Int? = detect(text).firstOrNull()?.minutes

    /** ISO-8601 süre (PT1H30M) -> dakika */
    fun parseIso(iso: String?): Int {
        if (iso.isNullOrBlank()) return 0
        val m = Regex("""P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?""", RegexOption.IGNORE_CASE).find(iso.trim()) ?: return 0
        val d = m.groupValues[1].toIntOrNull() ?: 0
        val h = m.groupValues[2].toIntOrNull() ?: 0
        val min = m.groupValues[3].toIntOrNull() ?: 0
        return d * 24 * 60 + h * 60 + min
    }
}

/** Serbest metinden (WhatsApp mesajı, not vb.) tarif çıkarır. */
object PlainTextRecipeParser {
    private val ingredientHeaders = listOf("malzemeler", "malzeme", "ingredients", "gerekli malzemeler", "içindekiler")
    private val stepHeaders = listOf("yapılışı", "yapilisi", "hazırlanışı", "hazirlanisi", "tarifi", "yapılış", "talimatlar", "instructions", "directions", "method", "hazırlık")
    private val tipHeaders = listOf("püf noktaları", "puf noktalari", "püf noktası", "ipuçları", "notlar", "tips", "notes")

    data class Parsed(
        val title: String,
        val ingredients: List<Ingredient>,
        val steps: List<Step>,
        val tips: List<String>,
        val servings: Int?,
    )

    private fun headerType(line: String): Int? {
        val f = TurkishText.fold(line.trim().trimEnd(':').trim())
        if (f.length > 40) return null
        if (ingredientHeaders.any { f == TurkishText.fold(it) || f.startsWith(TurkishText.fold(it) + "") }) return 1
        if (stepHeaders.any { f == TurkishText.fold(it) || f.startsWith(TurkishText.fold(it)) }) return 2
        if (tipHeaders.any { f.startsWith(TurkishText.fold(it)) }) return 3
        return null
    }

    fun parse(text: String): Parsed {
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        var title = ""
        var mode = 0
        var group = ""
        val ingredients = mutableListOf<Ingredient>()
        val steps = mutableListOf<Step>()
        val tips = mutableListOf<String>()
        var servings: Int? = null
        val servingRegex = Regex("""(\d+)\s*(kişilik|kisilik|porsiyon|servings|serves|kişi)""", RegexOption.IGNORE_CASE)
        for (line in lines) {
            val servingMatch = servingRegex.find(line)
            if (servingMatch != null && servings == null) servings = servingMatch.groupValues[1].toIntOrNull()
            if (mode == 0 && servingMatch != null && line.length < 30) continue
            val h = headerType(line)
            if (h != null) {
                mode = h; group = ""; continue
            }
            when (mode) {
                0 -> if (title.isEmpty()) title = line.trimEnd(':') else {
                    // Başlıktan sonra miktar içeren satırlar gelirse malzeme say
                    if (IngredientParser.readNumber(line) != null) {
                        mode = 1
                        IngredientParser.parse(line)?.let { ingredients += it }
                    }
                }
                1 -> {
                    if (line.endsWith(":") && IngredientParser.readNumber(line) == null) {
                        group = line.trimEnd(':').trim()
                    } else {
                        IngredientParser.parse(line, group)?.let { ingredients += it }
                    }
                }
                2 -> {
                    val clean = line.replace(Regex("""^(\d+[.)\-:]|adım\s*\d+[:.)]?|step\s*\d+[:.)]?)\s*""", RegexOption.IGNORE_CASE), "").trim()
                    if (clean.isNotEmpty()) steps += Step(text = clean, minutes = DurationDetector.firstMinutes(clean))
                }
                3 -> tips += line.trimStart('-', '*', '•').trim()
            }
        }
        return Parsed(title.ifBlank { "Yeni Tarif" }, ingredients, steps, tips, servings)
    }
}
