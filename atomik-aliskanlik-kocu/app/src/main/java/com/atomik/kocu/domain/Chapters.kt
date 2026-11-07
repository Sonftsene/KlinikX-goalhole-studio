package com.atomik.kocu.domain

/**
 * 66 günlük yolculuk bir film gibi bölümlere ayrılır. Her bölüm gün ve "kimlik oyu" sayısıyla açılır.
 * Kilitli bölümlerin başlıkları gizlidir; sadece şifreli bir fragman görünür (merak boşluğu, Loewenstein 1994).
 */
data class Chapter(
    val id: String,
    val label: String,
    val title: String,
    val teaser: String,
    val day: Int,
    val votes: Int,
    val scenes: List<String>,
    val power: String,
    val route: String? = null,
    val science: String,
)

object Chapters {
    val all = listOf(
        Chapter(
            id = "ch1", label = "BÖLÜM I", title = "İlk Atom", day = 1, votes = 1,
            teaser = "Her şey neredeyse görünmeyecek kadar küçük bir şeyle başlar…",
            scenes = listOf(
                "Büyük değişimler büyük kararlarla değil, gülünç derecede küçük adımlarla başlar.",
                "Bugün %1 daha iyi olmak fark edilmez. Ama bir yıl boyunca her gün %1, seni başlangıçtakinden yaklaşık 37 kat ileri taşır.",
                "Bu yüzden ilk kural basit: Bir alışkanlığı 2 dakikada yapılabilecek kadar küçült. Önce ortaya çıkmayı ustalaş, sonra büyüt.",
            ),
            power = "2 Dakika Kuralı açıldı: Her sahneye uzun bas → “Mini versiyonu yaptım”.",
            science = "Fogg, 2019; Clear, 2018",
        ),
        Chapter(
            id = "ch2", label = "BÖLÜM II", title = "Görünmez İpler", day = 2, votes = 3,
            teaser = "Seni her gün yöneten ipler var. Hiçbirini görmüyorsun.",
            scenes = listOf(
                "Davranışlarının çoğu bir ipucuyla tetiklenir: bir saat, bir yer, bir duygu, bir kişi, az önce yaptığın şey.",
                "Niyet zayıftır; plan güçlüdür. “Eğer saat 07:00 olursa, mutfakta 1 bardak su içeceğim.” gibi eğer–o zaman planları, yapılan meta-analizlerde hedefe ulaşmayı belirgin şekilde artırdı.",
                "Her alışkanlığına bir zaman ve bir yer ver. İpucu görünürse, davranış kendini hatırlatır.",
            ),
            power = "Eğer–O Zaman cümle motoru: Senaryo Stüdyosu artık planını tek cümleye çeviriyor.",
            route = "habit_new",
            science = "Gollwitzer & Sheeran, 2006",
        ),
        Chapter(
            id = "ch3", label = "BÖLÜM III", title = "Zincir", day = 4, votes = 6,
            teaser = "Bir halka diğerini çeker. Ya da hepsini koparır.",
            scenes = listOf(
                "Beynin zaten sahip olduğun alışkanlıklara bağlıdır: kahve koymak, diş fırçalamak, eve girmek.",
                "Yeni bir alışkanlığı eskisinin hemen ardına bağla: “Kahvemi koyduktan sonra 1 dakika nefes alacağım.”",
                "Bu zincirleme, hatırlamayı iradeye değil, rutine devreder.",
            ),
            power = "Zincir Haritası açıldı: alışkanlıklarının birbirine nasıl bağlandığını gör.",
            route = "chain",
            science = "Clear, 2018; Wood & Rünger, 2016",
        ),
        Chapter(
            id = "ch4", label = "BÖLÜM IV", title = "Gölge", day = 6, votes = 10,
            teaser = "Her kahramanın bir gölgesi vardır. Seninki seni çok iyi tanıyor.",
            scenes = listOf(
                "Kötü alışkanlıklar da aynı dört yasayla çalışır, sadece ters yönde.",
                "Görünmez yap (ipucunu kaldır), itici yap (bedelini hatırla), zorlaştır (sürtünme ekle), tatmin etmeyen yap (hesap ver).",
                "Dürtü bir dalgadır: yükselir, zirve yapar ve iner. Onunla savaşmak yerine üstünde sörf yapmayı öğrenebilirsin.",
            ),
            power = "Dürtü SOS açıldı: 10 dakikalık dalga sörfü ile dürtüyü geçir.",
            route = "urge",
            science = "Bowen & Marlatt, 2009",
        ),
        Chapter(
            id = "ch5", label = "BÖLÜM V", title = "Hayal Kırıklığı Vadisi", day = 10, votes = 15,
            teaser = "Burada çoğu insan vazgeçer. Çünkü haritada bu vadi yoktur.",
            scenes = listOf(
                "Beklentimiz düz bir çizgidir: emek ver, sonuç gör. Gerçek ise bileşiktir: uzun süre hiçbir şey olmuyor gibi görünür.",
                "Buz 0 derecede erir; -5'ten -1'e kadar harcanan ısı boşa gitmemiştir, sadece görünmezdir.",
                "Sonuç görmüyorsan başarısız değilsin. Henüz kritik eşiğe ulaşmadın.",
            ),
            power = "Bileşik Büyüme eğrisi açıldı: Laboratuvar'da görünmez ilerlemeni izle.",
            route = "lab",
            science = "Clear, 2018",
        ),
        Chapter(
            id = "ch6", label = "BÖLÜM VI", title = "Ayna", day = 14, votes = 22,
            teaser = "21 gün sana söylenen bir yalandı. Gerçek sayı aynada yazıyor.",
            scenes = listOf(
                "Popüler “21 gün” iddiasının bilimsel dayanağı yoktur.",
                "Londra'da yapılan bir çalışmada bir davranışın otomatikleşmesi ortalama 66 gün sürdü; kişiden kişiye 18 ile 254 gün arasında değişti.",
                "Daha önemlisi: bir günü kaçırmak süreci bozmadı. Mükemmellik değil, süreklilik kazanır.",
            ),
            power = "Otomatiklik Testi açıldı: Bir alışkanlığın ne kadar “sen” olduğunu ölç.",
            route = "lab",
            science = "Lally ve ark., 2010; Gardner ve ark., 2012",
        ),
        Chapter(
            id = "ch7", label = "BÖLÜM VII", title = "Kırılma Noktası", day = 21, votes = 30,
            teaser = "Bir gün düşeceksin. Asıl soru: ikinci gün ne olacak?",
            scenes = listOf(
                "Bir kez kaçırmak bir kazadır. İki kez kaçırmak yeni bir alışkanlığın başlangıcıdır.",
                "Kaçırdığın gün kendini cezalandırmak yerine öz-şefkat göster: araştırmalar öz-şefkatin hatalardan sonra yeniden denemeyi artırdığını gösteriyor.",
                "Kötü günde mini versiyonu yap. Yönetmen, sahneyi en kısa haliyle çekmeyi kabul eder.",
            ),
            power = "+1 Dondurma hakkı kazandın. Kötü bir günde serini koru.",
            science = "Breines & Chen, 2012; Neff, 2003",
        ),
        Chapter(
            id = "ch8", label = "BÖLÜM VIII", title = "Altın Bölge", day = 30, votes = 45,
            teaser = "Çok kolay sıkar. Çok zor korkutur. Aradaki ince çizgi…",
            scenes = listOf(
                "İnsan motivasyonu, yeteneklerinin hemen sınırındaki görevlerde zirve yapar. Buna Goldilocks kuralı denir.",
                "Bir alışkanlık sıkıcı gelmeye başladıysa onu biraz (yaklaşık %5) zorlaştır. Bunaltıyorsa küçült.",
                "Ustalık, sıkıcılığa aşık olmaktır: en iyiler de sıkılır, ama yine de sahneye çıkarlar.",
            ),
            power = "Seviye Atlama: Yönetmen artık alışkanlıklarını ne zaman büyüteceğini söyleyecek.",
            science = "Csikszentmihalyi, 1990; Clear, 2018",
        ),
        Chapter(
            id = "ch9", label = "BÖLÜM IX", title = "Kimlik", day = 45, votes = 65,
            teaser = "Sen yaptıklarının toplamısın. Peki kim olduğunu kim yazıyor?",
            scenes = listOf(
                "En derin değişim sonuçlarda değil, kimlikte olur: “Sigarayı bırakmaya çalışıyorum” yerine “Ben sigara içmeyen biriyim.”",
                "Yaptığın her tekrar, olmak istediğin kişiye verilmiş bir oydur. Çoğunluğu kazanman için oyların hepsini kazanman gerekmez.",
                "Şimdiye kadar verdiğin oylar bir manifesto oluşturdu.",
            ),
            power = "Kimlik Manifestosu açıldı: oylarını paylaşılabilir bir karta dönüştür.",
            route = "share_identity",
            science = "Clear, 2018; Oyserman, 2015",
        ),
        Chapter(
            id = "ch10", label = "FİNAL", title = "Otomatik Pilot", day = 66, votes = 90,
            teaser = "Bir sabah uyanacaksın ve fark etmeden yapmış olacaksın.",
            scenes = listOf(
                "66. gün. Araştırmaların medyan sayısına ulaştın.",
                "Artık bazı sahneler kendiliğinden çekiliyor. Beynin bu yolları otoyola çevirdi.",
                "Ama hikâye bitmez. Otomatikleşen her alışkanlık, bir sonrakinin temelidir.",
            ),
            power = "Final Sertifikası açıldı ve Sezon 2 fragmanı yüklendi.",
            route = "share_final",
            science = "Lally ve ark., 2010",
        ),
        Chapter(
            id = "s2", label = "SEZON 2", title = "Ustalık", day = 100, votes = 150,
            teaser = "Herkes başlangıcı izler. Çok azı ikinci sezona kalır.",
            scenes = listOf(
                "Alışkanlık + bilinçli pratik = ustalık. Otomatikleşen şeyi şimdi düşünerek geliştir.",
                "Düzenli değerlendirme yap: neler işe yarıyor, neler artık sana hizmet etmiyor?",
                "Kimliğine fazla sıkı sarılma. Esnek kal; gelecekteki sen bugünkünden farklı olabilir.",
            ),
            power = "Yıllık değerlendirme ve yeni sezon senaryoları.",
            science = "Ericsson ve ark., 1993; Clear, 2018",
        ),
    )

    fun unlocked(c: Chapter, dayIndex: Int, votes: Int) = dayIndex >= c.day && votes >= c.votes
    fun current(dayIndex: Int, votes: Int): Chapter? = all.lastOrNull { unlocked(it, dayIndex, votes) }
    fun next(dayIndex: Int, votes: Int): Chapter? = all.firstOrNull { !unlocked(it, dayIndex, votes) }
    fun byId(id: String) = all.firstOrNull { it.id == id }
}
