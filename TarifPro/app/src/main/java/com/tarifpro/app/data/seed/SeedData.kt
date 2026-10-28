package com.tarifpro.app.data.seed

import android.content.Context
import com.tarifpro.app.AppContainer
import com.tarifpro.app.data.local.ChatEntity
import com.tarifpro.app.data.local.CommentEntity
import com.tarifpro.app.data.local.MessageEntity
import com.tarifpro.app.data.local.UserEntity
import com.tarifpro.app.data.local.toEntity
import com.tarifpro.app.domain.Difficulty
import com.tarifpro.app.domain.Ingredient
import com.tarifpro.app.domain.Recipe
import com.tarifpro.app.domain.Step
import com.tarifpro.app.domain.Visibility

/** İlk açılışta yüklenen örnek içerik: demo şefler, tam tarifler, yorumlar ve topluluk kanalları. */
object SeedData {
    private const val DAY = 24 * 60 * 60 * 1000L

    private fun i(group: String, amount: Double?, unit: String, name: String, note: String = "", max: Double? = null) =
        Ingredient(group = group, amount = amount, amountMax = max, unit = unit, name = name, note = note)

    private fun s(title: String, text: String, minutes: Int? = null) = Step(title = title, text = text, minutes = minutes)

    val chefs = listOf(
        UserEntity("demo-ayse", "Ayşe Pastacı", "", null, "İstanbul'da butik pastane şefi. Hafif, meyveli tatlılar ve ipeksi kremalar 🍰", false, false, true, 1840, 120, 0),
        UserEntity("demo-mehmet", "Şef Mehmet Usta", "", null, "30 yıllık Osmanlı saray mutfağı tutkunu. Geleneksel lezzetler, doğru teknikler 👨‍🍳", false, false, true, 3215, 45, 0),
        UserEntity("demo-elif", "Elif Ege Mutfağı", "", null, "Ayvalık'tan zeytinyağlılar ve deniz ürünleri 🫒🐟", false, false, true, 1260, 210, 0),
        UserEntity("demo-can", "Can Fit Gurme", "", null, "Diyetisyen & sporcu. Lezzetli ama dengeli tarifler 💪🥗", false, false, true, 2480, 160, 0),
        UserEntity("demo-zeynep", "Zeynep'in Mutfağı", "", null, "Modern ev yemekleri, pratik ve şık sunumlar ✨", false, false, true, 980, 300, 0),
    )

    fun recipes(now: Long): List<Recipe> = listOf(
        Recipe(
            id = "seed-trilece", authorId = "demo-ayse", authorName = "Ayşe Pastacı",
            title = "Frambuazlı Trileçe", tagline = "Yumuşak, hafif, meyveli ve ipeksi bir lezzet",
            description = "27 × 18 cm borcam için pamuk gibi pandispanya, üç sütlü ıslatma, beyaz krema ve parlak frambuaz sosu.",
            category = "Tatlı", cuisine = "Türk", difficulty = Difficulty.MEDIUM, servings = 8,
            prepMinutes = 30, cookMinutes = 30, restMinutes = 180, templateId = "pastane", image = "illu:dessert",
            ingredients = listOf(
                i("Kek (Pandispanya)", 3.0, "adet", "yumurta", "oda sıcaklığında"),
                i("Kek (Pandispanya)", 90.0, "g", "toz şeker", "1/2 su bardağı"),
                i("Kek (Pandispanya)", 90.0, "g", "un", "1/2 + 1/3 su bardağı"),
                i("Kek (Pandispanya)", 15.0, "g", "nişasta", "1,5 yemek kaşığı"),
                i("Kek (Pandispanya)", 3.0, "g", "kabartma tozu", "1 tatlı kaşığı"),
                i("Süt Karışımı (Trileçe Sütü)", 360.0, "ml", "süt", "1,5 su bardağı"),
                i("Süt Karışımı (Trileçe Sütü)", 120.0, "ml", "krema", "%35 yağlı, 1/2 su bardağı"),
                i("Süt Karışımı (Trileçe Sütü)", 90.0, "g", "yoğunlaştırılmış süt", "1/4 su bardağı"),
                i("Frambuaz Sosu", 180.0, "g", "frambuaz", "taze veya donmuş"),
                i("Frambuaz Sosu", 40.0, "g", "toz şeker", "2 yemek kaşığı"),
                i("Frambuaz Sosu", 7.0, "g", "nişasta", "1 tatlı kaşığı, tepeleme"),
                i("Frambuaz Sosu", 60.0, "ml", "su", "kıvam için", max = 80.0),
                i("Beyaz Krema", 100.0, "ml", "süt kreması", "%35 yağlı, çok soğuk"),
                i("Beyaz Krema", 35.0, "g", "toz krem şanti", "1/2 paket", max = 40.0),
                i("Beyaz Krema", 30.0, "ml", "soğuk süt"),
            ),
            steps = listOf(
                s("Kek karışımını hazırlayın", "Yumurta ve şekeri 3–4 dakika, açık renk ve kabarana kadar çırpın. Un, nişasta ve kabartma tozunu ekleyip spatula ile karıştırın.", 4),
                s("Pişirin", "Yağlı kağıt serili 27 × 18 cm borcamda 170°C'de 25–30 dakika pişirin. Tamamen soğutun.", 25),
                s("Süt karışımını hazırlayın", "Süt, krema ve yoğunlaştırılmış sütü karıştırın. Soğuk tutun."),
                s("Keki ıslatın", "Soğuk süt karışımını keke yavaş yavaş dökün. 2–3 saat buzdolabında dinlendirin.", 120),
                s("Beyaz kremayı hazırlayın", "Soğuk süt kreması, soğuk süt ve toz krem şantiyi 2–3 dakika çırpın. Pudra şekeri eklemeyin.", 2),
                s("Kremayı yayın", "Kekin üzerine 5 mm kalınlığında eşit şekilde yayın. 1–2 yemek kaşığı kremayı beyaz desen için ayırın."),
                s("Frambuaz sosunu yayın", "Frambuaz, şeker, nişasta ve suyu kaynatın; kaynadıktan sonra 1–2 dakika pişirip soğutun. Tamamen soğumuş sosu kremanın üzerine dökün ve spatula ile eşit şekilde yayın.", 2),
                s("Desen yapın", "Ayrılan kremayı sıkma torbasına koyun. Düz çizgiler sıkın. Kürdanla sağa-sola çekerek desen oluşturun."),
                s("Dinlendirin ve servis edin", "En az 2–3 saat buzdolabında dinlendirin. Soğuk olarak servis edin.", 120),
            ),
            tips = listOf(
                "Yumurta ve şeker iyi çırpılmalı: pandispanyanın kabarması için 3–4 dakika boyunca rengi açılıp hacmi artana kadar çırpın.",
                "Un ve nişastayı fazla karıştırmayın: sadece homojenleşecek kadar karıştırın, aşırı karıştırmak keki sertleştirir.",
                "Kek tamamen soğumalı: sıcak kekle süt karışımı dökmeyin, dağılabilir.",
                "Süt karışımı çok soğuk olmalı: buzdolabından yeni çıkmış olursa kek daha iyi emer.",
                "En az 2–3 saat dinlendirin: kekin sütü tamamen çekmesi için bu süre şart.",
                "Frambuaz sosunu fazla pişirmeyin: kaynadıktan sonra 1–2 dakikada ocaktan alın, yoksa rengi matlaşır.",
                "Sosun kıvamı akışkan olmalı: soğuyunca biraz daha koyulaşır; çok katı olursa 60–80 ml su ile açın.",
                "Beyaz kremayı fazla çırpmayın: 2–3 dakika yeter, aşırı çırpılırsa pütürlenebilir.",
                "Pudra şekeri eklemeyin: toz krem şantide zaten şeker var.",
                "Desen için ince uç kullanın: düz çizgiler sıkın, sonra kürdanla tek hamlede sağa-sola çekin.",
                "İyi lezzet için 1 gece dinlendirin: ertesi gün hem kıvamı oturur hem de lezzeti artar.",
            ),
            tags = listOf("trileçe", "frambuaz", "sütlü tatlı", "borcam", "misafir"),
            ratingAvg = 4.9, ratingCount = 212, createdAt = now - 2 * DAY, updatedAt = now - 2 * DAY, featured = true,
        ),
        Recipe(
            id = "seed-mercimek", authorId = "demo-mehmet", authorName = "Şef Mehmet Usta",
            title = "Lokanta Usulü Mercimek Çorbası", tagline = "Kadife kıvamında, limonla servis",
            description = "Esnaf lokantalarının vazgeçilmezi; tereyağlı pul biberli sosuyla.",
            category = "Çorba", cuisine = "Türk", difficulty = Difficulty.EASY, servings = 4,
            prepMinutes = 10, cookMinutes = 35, templateId = "osmanli", image = "illu:soup",
            ingredients = listOf(
                i("Çorba", 1.0, "su bardağı", "kırmızı mercimek", "yıkanmış"),
                i("Çorba", 1.0, "adet", "soğan"),
                i("Çorba", 1.0, "adet", "havuç"),
                i("Çorba", 1.0, "adet", "patates", "küçük"),
                i("Çorba", 1.0, "yemek kaşığı", "un"),
                i("Çorba", 2.0, "yemek kaşığı", "zeytinyağı"),
                i("Çorba", 6.0, "su bardağı", "sıcak su"),
                i("Çorba", 1.0, "tatlı kaşığı", "tuz"),
                i("Çorba", 0.5, "çay kaşığı", "kimyon"),
                i("Üzeri için", 1.0, "yemek kaşığı", "tereyağı"),
                i("Üzeri için", 1.0, "çay kaşığı", "pul biber"),
                i("Üzeri için", 1.0, "adet", "limon"),
            ),
            steps = listOf(
                s("Sebzeleri kavurun", "Soğanı zeytinyağında 3 dakika kavurun, doğranmış havuç ve patatesi ekleyin.", 3),
                s("Unu ekleyin", "Unu ekleyip kokusu çıkana kadar 1 dakika kavurun.", 1),
                s("Pişirin", "Mercimek ve sıcak suyu ekleyin. Kısık ateşte 30 dakika pişirin.", 30),
                s("Blenderdan geçirin", "Tuz ve kimyonu ekleyip blenderdan geçirin; kıvamını sıcak suyla ayarlayın."),
                s("Sosu hazırlayın", "Tereyağını eritip pul biberi ekleyin, çorbanın üzerine gezdirin. Limonla servis edin.", 1),
            ),
            tips = listOf("Mercimeği soğuk suda iyice yıkayın, köpüğü azalır.", "Kimyonu en sonda ekleyin; aroması kaybolmaz.", "Bayatlarsa biraz sıcak su ile açıp tekrar kaynatın."),
            tags = listOf("çorba", "mercimek", "lokanta", "kış"),
            ratingAvg = 4.8, ratingCount = 540, createdAt = now - 5 * DAY, updatedAt = now - 5 * DAY, featured = true,
        ),
        Recipe(
            id = "seed-hunkar", authorId = "demo-mehmet", authorName = "Şef Mehmet Usta",
            title = "Hünkâr Beğendi", tagline = "Közlenmiş patlıcan beğendi üzerinde kuzu tas kebabı",
            description = "Osmanlı saray mutfağının en zarif yemeklerinden.",
            category = "Et & Tavuk", cuisine = "Osmanlı", difficulty = Difficulty.HARD, servings = 4,
            prepMinutes = 30, cookMinutes = 90, templateId = "osmanli", image = "illu:stew",
            ingredients = listOf(
                i("Et", 500.0, "g", "kuzu eti", "kuşbaşı"),
                i("Et", 1.0, "adet", "soğan"),
                i("Et", 2.0, "adet", "domates", "rendelenmiş"),
                i("Et", 1.0, "yemek kaşığı", "domates salçası"),
                i("Et", 2.0, "yemek kaşığı", "tereyağı"),
                i("Et", 2.0, "su bardağı", "sıcak su"),
                i("Beğendi", 4.0, "adet", "patlıcan", "közlenmiş"),
                i("Beğendi", 2.0, "yemek kaşığı", "tereyağı"),
                i("Beğendi", 2.0, "yemek kaşığı", "un"),
                i("Beğendi", 2.0, "su bardağı", "süt", "ılık"),
                i("Beğendi", 60.0, "g", "kaşar peyniri", "rendelenmiş"),
                i("Beğendi", 0.5, "çay kaşığı", "tuz"),
            ),
            steps = listOf(
                s("Eti mühürleyin", "Eti tereyağında suyunu çekene kadar 10 dakika kavurun.", 10),
                s("Sosu ekleyin", "Soğan, salça ve domatesi ekleyip 5 dakika kavurun.", 5),
                s("Pişirin", "Sıcak suyu ekleyin, kapağı kapalı kısık ateşte 75 dakika pişirin.", 75),
                s("Beğendiyi hazırlayın", "Tereyağında unu kavurun, ılık sütü çırparak ekleyin. Közlenmiş patlıcanları ve kaşarı ekleyip 5 dakika pişirin.", 5),
                s("Servis", "Beğendiyi tabağa yayın, ortasına eti yerleştirin."),
            ),
            tips = listOf("Patlıcanları közledikten sonra limonlu suya alın, kararmaz.", "Beğendiyi sürekli karıştırın, topaklanmasın."),
            tags = listOf("osmanlı", "kuzu", "patlıcan", "davet"),
            ratingAvg = 4.9, ratingCount = 188, createdAt = now - 9 * DAY, updatedAt = now - 9 * DAY,
        ),
        Recipe(
            id = "seed-fasulye", authorId = "demo-elif", authorName = "Elif Ege Mutfağı",
            title = "Zeytinyağlı Taze Fasulye", tagline = "Ege'nin klasik soğuk yemeği",
            description = "Kendi suyunda, bol zeytinyağlı ve şekerli dokunuşla.",
            category = "Vejetaryen", cuisine = "Ege", difficulty = Difficulty.EASY, servings = 4,
            prepMinutes = 15, cookMinutes = 45, restMinutes = 60, templateId = "ege", image = "illu:salad",
            ingredients = listOf(
                i("", 750.0, "g", "taze fasulye"),
                i("", 2.0, "adet", "domates"),
                i("", 1.0, "adet", "soğan"),
                i("", 0.5, "su bardağı", "zeytinyağı"),
                i("", 1.0, "tatlı kaşığı", "toz şeker"),
                i("", 1.0, "tatlı kaşığı", "tuz"),
                i("", 0.5, "su bardağı", "sıcak su"),
            ),
            steps = listOf(
                s("Hazırlık", "Fasulyelerin uçlarını kesip ikiye bölün. Soğanı yemeklik doğrayın."),
                s("Kavurun", "Soğanı zeytinyağında 5 dakika kavurun, fasulyeleri ekleyip 5 dakika çevirin.", 5),
                s("Pişirin", "Domates, şeker, tuz ve sıcak suyu ekleyin. Kapağı kapalı kısık ateşte 40 dakika pişirin.", 40),
                s("Dinlendirin", "Tenceresinde soğumaya bırakın ve soğuk servis edin.", 60),
            ),
            tips = listOf("Kapağı ilk 10 dakika açmayın, fasulyenin rengi yeşil kalır.", "Bir gece dinlenirse daha lezzetli olur."),
            tags = listOf("zeytinyağlı", "ege", "vegan", "yaz"),
            ratingAvg = 4.6, ratingCount = 97, createdAt = now - 4 * DAY, updatedAt = now - 4 * DAY,
        ),
        Recipe(
            id = "seed-levrek", authorId = "demo-elif", authorName = "Elif Ege Mutfağı",
            title = "Levrek Buğulama", tagline = "Domates, biber ve limonla hafif balık",
            description = "Tek tavada 25 dakikada hazır, sağlıklı bir akşam yemeği.",
            category = "Deniz Ürünleri", cuisine = "Ege", difficulty = Difficulty.MEDIUM, servings = 2,
            prepMinutes = 10, cookMinutes = 20, templateId = "ege", image = "illu:fish",
            ingredients = listOf(
                i("", 2.0, "adet", "levrek", "fileto"),
                i("", 2.0, "adet", "domates"),
                i("", 2.0, "adet", "sivri biber"),
                i("", 3.0, "diş", "sarımsak"),
                i("", 3.0, "yemek kaşığı", "zeytinyağı"),
                i("", 0.5, "adet", "limon"),
                i("", 0.5, "demet", "maydanoz"),
                i("", 1.0, "çay kaşığı", "tuz"),
            ),
            steps = listOf(
                s("Sebzeleri dizin", "Tavaya zeytinyağı, dilimlenmiş domates, biber ve sarımsakları dizin."),
                s("Balığı ekleyin", "Filetoları sebzelerin üzerine yerleştirin, tuz ve limon suyu gezdirin."),
                s("Buğulayın", "Kapağı kapalı orta ateşte 20 dakika pişirin.", 20),
                s("Servis", "Maydanozla süsleyip sıcak servis edin."),
            ),
            tips = listOf("Balığı çevirmeyin; buğuda kendi kendine pişer.", "Limon dilimlerini balığın üzerine koymak aromayı artırır."),
            tags = listOf("balık", "levrek", "hafif", "glutensiz"),
            ratingAvg = 4.7, ratingCount = 64, createdAt = now - 3 * DAY, updatedAt = now - 3 * DAY,
        ),
        Recipe(
            id = "seed-kinoa", authorId = "demo-can", authorName = "Can Fit Gurme",
            title = "Izgara Tavuklu Kinoa Salatası", tagline = "Yüksek protein, bol lif",
            description = "Antrenman sonrası için dengeli ve doyurucu bir kase.",
            category = "Fit & Diyet", cuisine = "Dünya", difficulty = Difficulty.EASY, servings = 2,
            prepMinutes = 15, cookMinutes = 20, templateId = "fit", image = "illu:bowl",
            ingredients = listOf(
                i("", 1.0, "su bardağı", "kinoa"),
                i("", 300.0, "g", "tavuk göğsü"),
                i("", 1.0, "adet", "avokado"),
                i("", 10.0, "adet", "cherry domates"),
                i("", 1.0, "adet", "salatalık"),
                i("", 2.0, "yemek kaşığı", "zeytinyağı"),
                i("", 1.0, "yemek kaşığı", "limon suyu"),
                i("", 1.0, "avuç", "roka"),
                i("", 1.0, "çay kaşığı", "tuz"),
            ),
            steps = listOf(
                s("Kinoayı haşlayın", "Kinoayı yıkayıp 2 su bardağı suda 15 dakika haşlayın.", 15),
                s("Tavuğu ızgara yapın", "Tavuğu tuz ve zeytinyağıyla marine edip ızgarada her yüzü 6 dakika pişirin.", 12),
                s("Kaseyi hazırlayın", "Kinoa, roka, doğranmış sebzeler, avokado ve dilimlenmiş tavuğu kaseye dizin."),
                s("Sos", "Zeytinyağı ve limon suyunu çırpıp üzerine gezdirin."),
            ),
            tips = listOf("Kinoayı mutlaka yıkayın; acılığı gider.", "Tavuğu dilimlemeden önce 5 dakika dinlendirin, suyunu kaybetmez."),
            tags = listOf("fit", "protein", "kinoa", "meal prep"),
            ratingAvg = 4.7, ratingCount = 143, createdAt = now - 1 * DAY, updatedAt = now - 1 * DAY,
        ),
        Recipe(
            id = "seed-pankek", authorId = "demo-can", authorName = "Can Fit Gurme",
            title = "Yulaflı Muzlu Pankek", tagline = "Şekersiz, 3 malzemeli kahvaltı",
            description = "Un ve şeker kullanmadan, pamuk gibi pankekler.",
            category = "Kahvaltı", cuisine = "Dünya", difficulty = Difficulty.EASY, servings = 2,
            prepMinutes = 5, cookMinutes = 10, templateId = "fit", image = "illu:breakfast",
            ingredients = listOf(
                i("", 1.0, "adet", "muz", "olgun"),
                i("", 2.0, "adet", "yumurta"),
                i("", 0.5, "su bardağı", "yulaf ezmesi"),
                i("", 0.5, "çay kaşığı", "tarçın"),
                i("Servis", 1.0, "yemek kaşığı", "bal"),
                i("Servis", 1.0, "avuç", "yaban mersini"),
            ),
            steps = listOf(
                s("Karıştırın", "Muz, yumurta, yulaf ve tarçını blenderdan geçirin. 5 dakika dinlendirin.", 5),
                s("Pişirin", "Yapışmaz tavada her yüzünü 2 dakika pişirin.", 2),
                s("Servis", "Bal ve yaban mersiniyle servis edin."),
            ),
            tips = listOf("Ne kadar olgun muz, o kadar tatlı pankek.", "Tavayı orta ateşte tutun; yüksek ateşte içi pişmeden yanar."),
            tags = listOf("kahvaltı", "şekersiz", "pratik"),
            ratingAvg = 4.5, ratingCount = 88, createdAt = now - 6 * DAY, updatedAt = now - 6 * DAY,
        ),
        Recipe(
            id = "seed-menemen", authorId = "demo-zeynep", authorName = "Zeynep'in Mutfağı",
            title = "Klasik Menemen", tagline = "Soğanlı mı soğansız mı? İkisi de olur!",
            description = "Pazar kahvaltılarının yıldızı, sucuklu versiyonu notlarda.",
            category = "Kahvaltı", cuisine = "Türk", difficulty = Difficulty.EASY, servings = 2,
            prepMinutes = 5, cookMinutes = 12, templateId = "modern", image = "illu:breakfast",
            ingredients = listOf(
                i("", 3.0, "adet", "yumurta"),
                i("", 3.0, "adet", "domates", "rendelenmiş"),
                i("", 3.0, "adet", "sivri biber"),
                i("", 1.0, "yemek kaşığı", "tereyağı"),
                i("", 1.0, "yemek kaşığı", "zeytinyağı"),
                i("", 0.5, "çay kaşığı", "tuz"),
                i("", 0.5, "çay kaşığı", "pul biber"),
            ),
            steps = listOf(
                s("Biberleri soteleyin", "Biberleri yağda 3 dakika soteleyin.", 3),
                s("Domatesi ekleyin", "Domatesi ekleyip suyunu çekene kadar 6 dakika pişirin.", 6),
                s("Yumurtalar", "Yumurtaları kırın, hafifçe karıştırıp 2 dakika daha pişirin.", 2),
            ),
            tips = listOf("Yumurtayı fazla karıştırmayın; kremamsı kalmalı.", "Sucuklu versiyon için biberlerden önce sucuğu kızartın."),
            tags = listOf("kahvaltı", "yumurta", "pratik"),
            ratingAvg = 4.8, ratingCount = 402, createdAt = now - 8 * DAY, updatedAt = now - 8 * DAY,
        ),
        Recipe(
            id = "seed-sutlac", authorId = "demo-ayse", authorName = "Ayşe Pastacı",
            title = "Fırın Sütlaç", tagline = "Üzeri kızarmış, içi kremamsı",
            description = "Toprak kaselerde, tarçınla.",
            category = "Tatlı", cuisine = "Türk", difficulty = Difficulty.MEDIUM, servings = 6,
            prepMinutes = 10, cookMinutes = 45, restMinutes = 120, templateId = "pastane", image = "illu:cake",
            ingredients = listOf(
                i("", 0.5, "su bardağı", "pirinç"),
                i("", 1.0, "l", "süt"),
                i("", 1.0, "su bardağı", "toz şeker"),
                i("", 2.0, "yemek kaşığı", "pirinç unu"),
                i("", 1.0, "paket", "vanilin"),
                i("", 1.0, "su bardağı", "su"),
            ),
            steps = listOf(
                s("Pirinci haşlayın", "Pirinci suyla 10 dakika haşlayın.", 10),
                s("Sütü ekleyin", "Sütü ekleyip kaynayınca 15 dakika pişirin.", 15),
                s("Koyulaştırın", "Şekeri ve suyla açılmış pirinç ununu ekleyip 5 dakika karıştırarak pişirin. Vanilini ekleyin.", 5),
                s("Fırınlayın", "Kaselere paylaştırın, su dolu tepside 220°C fırının üst rafında 15 dakika kızartın.", 15),
            ),
            tips = listOf("Tepsiye su koymak kaselerin çatlamasını önler.", "Soğuk servis edin, tarçını servis anında serpin."),
            tags = listOf("sütlü tatlı", "fırın", "klasik"),
            ratingAvg = 4.8, ratingCount = 230, createdAt = now - 12 * DAY, updatedAt = now - 12 * DAY,
        ),
        Recipe(
            id = "seed-karniyarik", authorId = "demo-zeynep", authorName = "Zeynep'in Mutfağı",
            title = "Karnıyarık", tagline = "Kızarmış patlıcan, bol kıymalı iç",
            description = "Pilavla ve cacıkla mükemmel üçlü.",
            category = "Ana Yemek", cuisine = "Türk", difficulty = Difficulty.MEDIUM, servings = 4,
            prepMinutes = 25, cookMinutes = 35, templateId = "modern", image = "illu:stew",
            ingredients = listOf(
                i("", 6.0, "adet", "patlıcan", "bostan"),
                i("", 300.0, "g", "kıyma"),
                i("", 1.0, "adet", "soğan"),
                i("", 2.0, "adet", "domates"),
                i("", 2.0, "adet", "sivri biber"),
                i("", 2.0, "diş", "sarımsak"),
                i("", 1.0, "yemek kaşığı", "domates salçası"),
                i("", 0.5, "su bardağı", "ayçiçek yağı", "kızartmak için"),
                i("", 1.0, "tatlı kaşığı", "tuz"),
                i("", 0.5, "çay kaşığı", "karabiber"),
            ),
            steps = listOf(
                s("Patlıcanları kızartın", "Alacalı soyulan patlıcanları kızgın yağda her yüzü 3 dakika kızartın.", 6),
                s("İç harcı", "Soğan ve kıymayı 8 dakika kavurun; sarımsak, salça ve domatesin yarısını ekleyip 4 dakika pişirin.", 12),
                s("Doldurun", "Patlıcanları yarıp harcı doldurun, üzerine domates ve biber dilimleri koyun."),
                s("Fırınlayın", "Yarım su bardağı salçalı su ekleyip 190°C'de 25 dakika pişirin.", 25),
            ),
            tips = listOf("Patlıcanları tuzlu suda 20 dakika bekletin, acılığı gider ve az yağ çeker.", "Fırından çıkınca 10 dakika dinlendirin."),
            tags = listOf("patlıcan", "kıyma", "ana yemek"),
            ratingAvg = 4.7, ratingCount = 315, createdAt = now - 7 * DAY, updatedAt = now - 7 * DAY,
        ),
        Recipe(
            id = "seed-makarna", authorId = "demo-zeynep", authorName = "Zeynep'in Mutfağı",
            title = "Mantarlı Kremalı Fettuccine", tagline = "15 dakikada restoran lezzeti",
            description = "Parmesanlı, sarımsaklı, ipeksi sos.",
            category = "Makarna", cuisine = "İtalyan", difficulty = Difficulty.EASY, servings = 3,
            prepMinutes = 5, cookMinutes = 15, templateId = "modern", image = "illu:pasta",
            ingredients = listOf(
                i("", 250.0, "g", "fettuccine"),
                i("", 250.0, "g", "mantar"),
                i("", 200.0, "ml", "krema"),
                i("", 2.0, "diş", "sarımsak"),
                i("", 1.0, "yemek kaşığı", "tereyağı"),
                i("", 40.0, "g", "parmesan"),
                i("", 0.5, "çay kaşığı", "karabiber"),
                i("", 1.0, "tatlı kaşığı", "tuz"),
            ),
            steps = listOf(
                s("Makarnayı haşlayın", "Bol tuzlu suda paket süresinden 1 dakika az, yaklaşık 9 dakika haşlayın.", 9),
                s("Mantarları soteleyin", "Tereyağında mantarları yüksek ateşte 5 dakika soteleyin, sarımsağı ekleyin.", 5),
                s("Sos", "Kremayı ekleyip 2 dakika kaynatın; makarna ve parmesanı ekleyip karıştırın.", 2),
            ),
            tips = listOf("Makarna suyundan yarım kepçe saklayın; sosu bağlar.", "Mantarları tavaya kalabalık koymayın, suyunu salıp haşlanır."),
            tags = listOf("makarna", "mantar", "pratik", "vejetaryen"),
            ratingAvg = 4.6, ratingCount = 121, createdAt = now - 10 * DAY, updatedAt = now - 10 * DAY,
        ),
        Recipe(
            id = "seed-borek", authorId = "demo-mehmet", authorName = "Şef Mehmet Usta",
            title = "Patatesli Kol Böreği", tagline = "Çıtır yufka, baharatlı patates",
            description = "Hazır yufkayla evde fırın lezzeti.",
            category = "Hamur İşi", cuisine = "Türk", difficulty = Difficulty.MEDIUM, servings = 6,
            prepMinutes = 30, cookMinutes = 40, templateId = "osmanli", image = "illu:bread",
            ingredients = listOf(
                i("Hamur", 3.0, "adet", "yufka"),
                i("Sos", 1.0, "su bardağı", "süt"),
                i("Sos", 0.5, "su bardağı", "ayçiçek yağı"),
                i("Sos", 1.0, "adet", "yumurta"),
                i("İç", 4.0, "adet", "patates", "haşlanmış"),
                i("İç", 1.0, "adet", "soğan"),
                i("İç", 1.0, "çay kaşığı", "pul biber"),
                i("İç", 1.0, "tatlı kaşığı", "tuz"),
                i("Üzeri", 1.0, "adet", "yumurta sarısı"),
                i("Üzeri", 1.0, "yemek kaşığı", "susam"),
            ),
            steps = listOf(
                s("İç harcı", "Soğanı 5 dakika kavurun, ezilmiş patates ve baharatlarla karıştırın.", 5),
                s("Sarın", "Yufkaları sosla yağlayıp harcı yayın, rulo yapıp tepsiye spiral şekilde dizin."),
                s("Pişirin", "Yumurta sarısı ve susam sürüp 180°C'de 40 dakika pişirin.", 40),
            ),
            tips = listOf("Yufkalar kurumasın diye nemli bezle örtün.", "Fırından çıkınca üzerine birkaç kaşık süt serperseniz yumuşacık olur."),
            tags = listOf("börek", "hamur işi", "çay saati"),
            ratingAvg = 4.7, ratingCount = 176, createdAt = now - 11 * DAY, updatedAt = now - 11 * DAY,
        ),
    )

    private val seedComments = listOf(
        Triple("seed-trilece", "demo-zeynep", "Tarifteki görsel adımlar harika! Misafirler bayıldı, sos rengi tam fotoğraftaki gibi oldu 😍") to 5,
        Triple("seed-trilece", "demo-can", "Krem şantiyi light krema ile denedim, yine çok güzel oldu.") to 5,
        Triple("seed-trilece", "demo-elif", "Bir gece dinlendirme tavsiyesi altın değerinde 👌") to 5,
        Triple("seed-mercimek", "demo-ayse", "Tam lokanta kıvamı, kimyon ipucu çok iyi.") to 5,
        Triple("seed-mercimek", "demo-zeynep", "Limonsuz asla! 🍋") to 4,
        Triple("seed-kinoa", "demo-mehmet", "Spor sonrası favorim oldu, avokado şart.") to 5,
        Triple("seed-karniyarik", "demo-can", "Patlıcanları fırında közleyerek daha hafif yaptım.") to 4,
        Triple("seed-menemen", "demo-elif", "Soğanlı ekibindeyim 😄") to 5,
    )

    suspend fun seedIfNeeded(c: AppContainer) {
        val prefs = c.context.getSharedPreferences("seed", Context.MODE_PRIVATE)
        if (prefs.getBoolean("seeded_v1", false)) return
        val now = System.currentTimeMillis()
        c.db.users().upsertAll(chefs.map { it.copy(updatedAt = now) })
        c.db.recipes().upsertAll(recipes(now).map { it.toEntity(dirty = false) })
        val names = chefs.associate { it.id to it.name }
        c.db.comments().upsertAll(
            seedComments.mapIndexed { idx, (t, rating) ->
                CommentEntity("seed-c$idx", t.first, t.second, names[t.second] ?: "Şef", null, t.third, rating, now - (idx + 1) * 3_600_000L)
            },
        )
        val channels = listOf(
            Triple("ch_genel", "Genel Mutfak", "👩‍🍳"),
            Triple("ch_tatli", "Tatlı Severler", "🍰"),
            Triple("ch_hamur", "Hamur İşi Ustaları", "🥐"),
            Triple("ch_fit", "Fit Mutfak", "🥗"),
            Triple("ch_ege", "Ege & Akdeniz Sofrası", "🫒"),
        )
        val channelMessages = mapOf(
            "ch_genel" to listOf("demo-mehmet" to "Hoş geldiniz şefler! Bu hafta hangi tarifleri deniyorsunuz? 👨‍🍳", "demo-zeynep" to "Karnıyarık yaptım, tarifini profilime ekledim 🍆"),
            "ch_tatli" to listOf("demo-ayse" to "Frambuazlı trileçenin PNG tarif kartını paylaştım, desen ipuçları kartta 🍓", "demo-elif" to "Çok şık olmuş, hemen deniyorum!"),
            "ch_hamur" to listOf("demo-mehmet" to "Yufkayı kurutmamak için nemli bez şart arkadaşlar."),
            "ch_fit" to listOf("demo-can" to "Kinoa salatasının porsiyon başı ~550 kcal, protein 40 g üzeri 💪"),
            "ch_ege" to listOf("demo-elif" to "Zeytinyağlılar bir gece dinlenince bambaşka oluyor 🫒"),
        )
        channels.forEach { (id, title, emoji) ->
            val msgs = channelMessages[id].orEmpty()
            msgs.forEachIndexed { idx, (sender, text) ->
                c.db.chats().upsertMessage(
                    MessageEntity("seed-$id-$idx", id, sender, names[sender] ?: "Şef", null, text, null, null, null, now - (msgs.size - idx) * 1_800_000L),
                )
            }
            val last = msgs.lastOrNull()
            c.db.chats().upsert(ChatEntity(id, "CHANNEL", title, emoji, "", last?.second ?: "", now - 1_800_000L, last?.first ?: "", now))
        }
        prefs.edit().putBoolean("seeded_v1", true).apply()
    }
}
