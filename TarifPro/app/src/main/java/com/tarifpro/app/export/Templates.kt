package com.tarifpro.app.export

/** Tarif kartı şablonları – hem uygulama içi kart görünümü hem PNG/A4 çıktısı bu renkleri kullanır. */
data class RecipeTemplate(
    val id: String,
    val name: String,
    val description: String,
    val emoji: String,
    val primary: Int,
    val onPrimary: Int,
    val secondary: Int,
    val background: Int,
    val card: Int,
    val ink: Int,
    val muted: Int,
    val serifTitles: Boolean,
    /** "ottoman", "stripes", "waves", "leaves", "dots" */
    val decoration: String,
    /** Malzeme grubu kartları için (açık ton, vurgu rengi) çiftleri */
    val groupColors: List<Pair<Int, Int>>,
    val tagline: String,
)

object Templates {
    val all: List<RecipeTemplate> = listOf(
        RecipeTemplate(
            id = "osmanli", name = "Klasik Osmanlı", description = "Bordo ve altın tonları, saray mutfağı zarafeti", emoji = "🕌",
            primary = 0xFF7B1E2B.toInt(), onPrimary = 0xFFFFF8E1.toInt(), secondary = 0xFFC9A227.toInt(),
            background = 0xFFFBF3E4.toInt(), card = 0xFFFFFBF2.toInt(), ink = 0xFF3E2723.toInt(), muted = 0xFF8D6E63.toInt(),
            serifTitles = true, decoration = "ottoman",
            groupColors = listOf(
                0xFFFFF3D6.toInt() to 0xFF9C6B00.toInt(), 0xFFF9E1E1.toInt() to 0xFF7B1E2B.toInt(),
                0xFFE8F0E0.toInt() to 0xFF3E6B1F.toInt(), 0xFFEDE3F5.toInt() to 0xFF5B2C83.toInt(),
            ),
            tagline = "Saray mutfağından sofranıza",
        ),
        RecipeTemplate(
            id = "modern", name = "Modern Şef Masası", description = "Siyah-beyaz, keskin çizgiler ve turuncu vurgu", emoji = "🔪",
            primary = 0xFF1C1C1E.toInt(), onPrimary = 0xFFFFFFFF.toInt(), secondary = 0xFFFF6F00.toInt(),
            background = 0xFFF4F4F2.toInt(), card = 0xFFFFFFFF.toInt(), ink = 0xFF111111.toInt(), muted = 0xFF6E6E73.toInt(),
            serifTitles = false, decoration = "stripes",
            groupColors = listOf(
                0xFFFFF1E5.toInt() to 0xFFE65100.toInt(), 0xFFEFEFEF.toInt() to 0xFF1C1C1E.toInt(),
                0xFFE8F4FD.toInt() to 0xFF0D47A1.toInt(), 0xFFF1F8E9.toInt() to 0xFF33691E.toInt(),
            ),
            tagline = "Şef masasından ilham",
        ),
        RecipeTemplate(
            id = "ege", name = "Ege & Akdeniz", description = "Lacivert, zeytin yeşili ve bembeyaz", emoji = "🫒",
            primary = 0xFF0D47A1.toInt(), onPrimary = 0xFFFFFFFF.toInt(), secondary = 0xFF7CB342.toInt(),
            background = 0xFFF1F7FC.toInt(), card = 0xFFFFFFFF.toInt(), ink = 0xFF0D2137.toInt(), muted = 0xFF546E7A.toInt(),
            serifTitles = true, decoration = "waves",
            groupColors = listOf(
                0xFFE3F2FD.toInt() to 0xFF0D47A1.toInt(), 0xFFF1F8E9.toInt() to 0xFF558B2F.toInt(),
                0xFFFFF8E1.toInt() to 0xFFF9A825.toInt(), 0xFFE0F7FA.toInt() to 0xFF00838F.toInt(),
            ),
            tagline = "Güneş, deniz ve zeytinyağı",
        ),
        RecipeTemplate(
            id = "fit", name = "Fit & Gurme", description = "Taze yeşiller, enerjik ve temiz bir görünüm", emoji = "🥗",
            primary = 0xFF2E7D32.toInt(), onPrimary = 0xFFFFFFFF.toInt(), secondary = 0xFFFFB300.toInt(),
            background = 0xFFF3FAF1.toInt(), card = 0xFFFFFFFF.toInt(), ink = 0xFF1B3A1E.toInt(), muted = 0xFF5F7D61.toInt(),
            serifTitles = false, decoration = "leaves",
            groupColors = listOf(
                0xFFE8F5E9.toInt() to 0xFF2E7D32.toInt(), 0xFFFFF8E1.toInt() to 0xFFEF6C00.toInt(),
                0xFFE1F5FE.toInt() to 0xFF0277BD.toInt(), 0xFFFCE4EC.toInt() to 0xFFAD1457.toInt(),
            ),
            tagline = "Dengeli, besleyici, lezzetli",
        ),
        RecipeTemplate(
            id = "pastane", name = "Pastane & Tatlı Rüyası", description = "Pembe-krem tonlarında görsel referans tarzı", emoji = "🍰",
            primary = 0xFFA3123A.toInt(), onPrimary = 0xFFFFFFFF.toInt(), secondary = 0xFFF48FB1.toInt(),
            background = 0xFFFFF8F4.toInt(), card = 0xFFFFFFFF.toInt(), ink = 0xFF3B1F2B.toInt(), muted = 0xFF8A6A74.toInt(),
            serifTitles = true, decoration = "dots",
            groupColors = listOf(
                0xFFFFF0E0.toInt() to 0xFFD84315.toInt(), 0xFFE3F0FF.toInt() to 0xFF1565C0.toInt(),
                0xFFFFE4EC.toInt() to 0xFFC2185B.toInt(), 0xFFE8F5E9.toInt() to 0xFF2E7D32.toInt(),
            ),
            tagline = "Yumuşak, hafif ve ipeksi",
        ),
    )

    fun byId(id: String?): RecipeTemplate = all.firstOrNull { it.id == id } ?: all.last()
}
