<?php
/**
 * Yasal metin taslakları (4.17). Sistem yöneticisi değiştirmezse bunlar yayımlanır.
 * Yer tutucular künye bilgileriyle doldurulur: {MARKA} {UNVAN} {ADRES} {VERGI} {MERSIS} {EPOSTA} {TELEFON} {KEP} {SITE} {BARINDIRMA} {MAHKEME} {TARIH}
 * Biçim: "## " başlık, "- " madde, boş satır paragraf, **kalın**.
 * Bu metinler genel taslaktır; yayımlamadan önce bir hukukçuya kontrol ettirilmelidir.
 */
declare(strict_types=1);

const LG_PAGES = [
    'kvkk' => 'KVKK Aydınlatma Metni',
    'gizlilik' => 'Gizlilik ve Çerez Politikası',
    'kosullar' => 'Kullanım Koşulları',
    'satis' => 'Mesafeli Hizmet Sözleşmesi',
    'iade' => 'İptal ve İade Koşulları',
];

const LG_TPL = [
'kvkk' => <<<'TXT'
## Veri sorumlusu
{MARKA} hizmeti **{UNVAN}** tarafından sunulur ("{MARKA}" ya da "biz"). Adres: {ADRES}. E-posta: {EPOSTA}.

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, {MARKA} portalını kullanan sağlık çalışanlarını ve birim açma başvurusu yapanları bilgilendirmek için hazırlanmıştır.

Birimlerin portala yüklediği nöbet listeleri, duyurular ve benzeri içerikler bakımından ilgili sağlık kurumu da veri sorumlusu olabilir; bu durumda {MARKA}, o içerikleri kurumun talimatıyla işleyen veri işleyen konumundadır.

## İşlenen kişisel veriler
- **Kimlik ve iletişim:** ad soyad, unvan, birim, e-posta adresi; isteğe bağlı cep telefonu, dahili numara ve profil fotoğrafı.
- **Hesap ve güvenlik:** şifrenin geri döndürülemez özeti, giriş ve oturum kayıtları (tarih, IP adresi, tarayıcı ve cihaz bilgisi), parmak izi / yüz tanıma ile girişte cihazın ürettiği açık anahtar (biyometrik veri cihazdan çıkmaz).
- **Çalışma düzeni:** nöbet listelerinde adınızın geçtiği satırlar, nöbet istekleri, nöbet değişimi / devri / ilanları, eksik personel çağrılarına verdiğiniz yanıtlar, blok yerleşimi.
- **İletişim içerikleri:** gönderdiğiniz mesajlar ve dosyalar, sesli / görüntülü arama kayıtları (yalnız zaman ve taraflar; görüşme içeriği kaydedilmez), duyuru okuma ve onay kayıtları, bildirimler.
- **İsteğe bağlı:** yalnız sizin gördüğünüz fazla mesai ücreti bilgileri, görünüm ve bildirim tercihleri.
- **Destek taleplerinde:** yazdığınız mesajlar ve isteğe bağlı ekran görüntüsü; talebe kendiliğinden eklenen birim, rol, açık sayfa, uygulama sürümü ve cihaz / tarayıcı türü. Talebi konusuna göre destek ekibi (sistem yöneticisi) ya da birim sorumlusu görür.
- **Birim açma başvurusunda:** görev bilgisi, cep telefonu ve isteğe bağlı görevlendirme belgesi.
- **Ödeme yapan birim yöneticileri için:** fatura bilgileri ve ödeme kayıtları. Kart bilgileri ödeme kuruluşunda işlenir, bize ulaşmaz.

Portal hasta verisi işlemek için tasarlanmamıştır. Mesajlara, belgelere ve duyurulara hasta kimlik bilgisi yazmayın.

## İşleme amaçları
- Nöbet listelerinin ve çalışma düzeninin ekibe gösterilmesi, değişim ve devir süreçlerinin yürütülmesi,
- ekip içi iletişim, duyuru ve bildirimlerin iletilmesi,
- hesabınızın oluşturulması, kimliğinizin doğrulanması ve hesap güvenliğinin sağlanması,
- kötüye kullanımın ve yetkisiz erişimin önlenmesi, hizmetin iyileştirilmesi,
- destek taleplerinin yanıtlanması,
- birim açma başvurularının değerlendirilmesi,
- abonelik, faturalandırma ve mevzuattan doğan yükümlülüklerin yerine getirilmesi.

## Hukuki sebepler
Kişisel verileriniz KVKK'nın 5. maddesinin 2. fıkrasındaki şu sebeplere dayanarak işlenir: (c) hizmet sözleşmesinin kurulması ve ifası, (ç) hukuki yükümlülüklerimizin yerine getirilmesi (ör. 5651 sayılı Kanun kapsamındaki kayıtlar, vergi mevzuatı), (f) temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz (güvenlik kayıtları, kötüye kullanımın önlenmesi). Açık rızanızı gerektiren bir işleme olursa ayrıca onayınız istenir.

## Aktarım
- **Biriminizdeki yetkili kişiler** (birim yöneticisi, sorumlular) ve ortak alanlarda (hastane rehberi, mesajlaşma, hastane belgeleri) aynı hastanedeki kullanıcılar: hizmetin gerektirdiği ölçüde.
- **Hizmet sağlayıcılarımız:** barındırma ({BARINDIRMA}), e-posta gönderimi, telefon bildirimi altyapısı (bildirim içeriği uçtan uca şifrelenir), ödeme kuruluşları (yalnız ödeme yapanlar için).
- **Yetkili kamu kurum ve kuruluşları:** hukuken zorunlu olduğunda.

Sunucuların ya da hizmet sağlayıcıların yurt dışında bulunması halinde aktarım KVKK'nın 9. maddesine ve ilgili mevzuata uygun olarak yapılır.

## Toplama yöntemi
Verileriniz; sizin ya da birim yöneticinizin portala girdiği bilgilerden, biriminizin yüklediği nöbet listelerinden ve portalı kullanırken otomatik oluşan kayıtlardan elektronik ortamda toplanır.

## Saklama süreleri
- Hesap verileri hesabınız açık olduğu sürece saklanır; hesap silindiğinde silinir ya da anonim hale getirilir. Yedeklerdeki kopyalar en geç 90 gün içinde ortadan kalkar.
- Güvenlik ve erişim kayıtları mevzuatın öngördüğü süre boyunca saklanır.
- Reddedilen birim başvuruları 90 gün sonra, onaylananların iletişim ayrıntıları 1 yıl sonra silinir; başvuru belgesi karar verilince silinir.
- Kapanan destek talepleri 1 yıl, giriş yapamayanların talepleri son yazışmadan 6 ay sonra silinir.
- Fatura ve ödeme kayıtları vergi mevzuatındaki süreler boyunca saklanır.

## Haklarınız
KVKK'nın 11. maddesi uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işleme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde / yurt dışında aktarıldığı üçüncü kişileri bilme, eksik ya da yanlış işlenmişse düzeltilmesini, KVKK'nın 7. maddesindeki şartlar çerçevesinde silinmesini ya da yok edilmesini ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.

Portalda **Hesabım › Verilerim** bölümünden verilerinizin bir kopyasını indirebilir ve hesabınızın silinmesini isteyebilirsiniz. Diğer başvurularınızı portala kayıtlı e-posta adresinizden {EPOSTA} adresine{KEP_VEYA} ya da {ADRES} adresine yazılı olarak iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır.

Son güncelleme: {TARIH}
TXT,

'gizlilik' => <<<'TXT'
## Kısaca
{MARKA}, hastane birimlerinin kapalı ekip portalıdır. İçerikler yalnız giriş yapmış ve birim yöneticisinin onayladığı kişilere görünür; portal arama motorlarına kapalıdır. Reklam yoktur, verileriniz satılmaz ve reklam amacıyla kullanılmaz.

Kişisel verilerinizin işlenmesine ilişkin ayrıntılar KVKK Aydınlatma Metni'ndedir.

## Çerezler ve tarayıcı depolama
- **Oturum çerezi** (zorunlu): giriş yaptığınızı hatırlamak ve güvenliği sağlamak için. Çıkış yaptığınızda ya da süresi dolunca geçersiz olur.
- **Tarayıcı depolaması** (zorunlu / işlevsel): tema, görünüm tercihleri ve bağlantı koptuğunda son görüntülenen sayfaların cihazda açılabilmesi için. Ortak bilgisayardan QR ile girildiğinde bu bilgiler tarayıcı kapanınca silinir.
- Reklam, izleme ya da üçüncü taraf analiz çerezi kullanılmaz.
- "Google ile giriş" kullanırsanız giriş sırasında Google'ın kendi çerezleri devreye girer; bu, Google'ın gizlilik politikasına tabidir.

## Güvenlik önlemleri
- Bağlantı HTTPS ile şifrelenir; şifreler geri döndürülemez biçimde (özet olarak) saklanır.
- Her birimin verisi ayrı bir veritabanında tutulur; bir birimin kullanıcısı başka birimin verisine erişemez.
- Sistem yönetimi hesabında iki adımlı doğrulama zorunludur; giriş denemeleri sınırlandırılır, oturumlar "Bağlı cihazlar"dan kapatılabilir.
- Telefon bildirimlerinin içeriği uçtan uca şifrelenir; isteğe bağlı olarak kilit ekranında içerik gizlenir.
- Düzenli yedek alınır; yedekler şifreli saklanır.

## Hasta verisi
Portal hasta verisi işlemek için tasarlanmamıştır. Mesajlara ve belgelere hasta adı, T.C. kimlik numarası gibi bilgiler yazılmamalıdır; portal T.C. kimlik numarası biçimindeki içerikleri gönderilmeden önce uyarır.

## İletişim
Sorularınız için: {EPOSTA}{TELEFON_SATIR}

Son güncelleme: {TARIH}
TXT,

'kosullar' => <<<'TXT'
## Taraflar ve kapsam
Bu koşullar, **{UNVAN}** ("{MARKA}") tarafından {SITE} adresinde sunulan {MARKA} portalının kullanımına ilişkindir. Portala giriş yapan ya da birim açma başvurusu yapan herkes bu koşulları kabul etmiş sayılır.

## Hizmet
{MARKA}; hastane birimlerinin nöbet listelerini paylaşması, nöbet değişimi ve devri, eksik personel çağrısı, ekip içi mesajlaşma, duyuru ve belge paylaşımı gibi işlerini yürütmesi için çevrim içi bir portaldır. Özellikler zaman içinde geliştirilebilir ya da değiştirilebilir.

## Hesaplar
- Hesap kişiseldir; şifrenizi kimseyle paylaşmayın. Hesabınızla yapılan işlemlerden siz sorumlusunuz.
- Bir kişi yalnız bir birimde hesap açabilir. Birime kimin katılacağına birim yöneticisi karar verir.
- Birim yöneticisi; biriminin kullanıcılarını, içeriklerini ve ayarlarını yönetmekten ve birim adına verilen bilgilerin doğruluğundan sorumludur.

## Kullanım kuralları
- Portala hasta kimlik bilgisi, sağlık kaydı ya da paylaşma yetkiniz olmayan kişisel veri yüklemeyin.
- Hukuka aykırı, hakaret içeren, başkalarının haklarını ihlal eden içerik paylaşmayın.
- Portalın güvenliğini aşmaya, başka birimlerin verisine erişmeye ya da hizmeti aksatmaya çalışmayın.
- Bu kurallara aykırılık halinde ilgili içerik kaldırılabilir, hesap ya da birim askıya alınabilir.

## Nöbet bilgilerinin doğruluğu
Nöbet listeleri ve çizelgeler birimler tarafından hazırlanır. Portal, kurallara uygunluk denetimi gibi yardımcı araçlar sunar; ancak resmi nöbet listesinin doğruluğu ve kesinleşmesi ilgili birimin ve kurumun sorumluluğundadır.

## Ücretlendirme
Portalın bazı paketleri ücretlidir. Paketler, fiyatlar ve deneme süresi portalda gösterilir. Ücretli paket satın alımında Mesafeli Hizmet Sözleşmesi ile İptal ve İade Koşulları geçerlidir.

## Hizmetin sürekliliği
Hizmetin kesintisiz sunulması için makul özen gösterilir; bakım, güncelleme ya da elimizde olmayan nedenlerle kısa süreli kesintiler olabilir. Planlı bakımlar mümkün olduğunca önceden duyurulur.

## Fikri mülkiyet
Portalın yazılımı, tasarımı ve markası {UNVAN}'a aittir. Birimlerin ve kullanıcıların yüklediği içeriklerin hakları sahiplerinde kalır; bu içerikler yalnız hizmetin sunulması için kullanılır.

## Sorumluluğun sınırı
Yürürlükteki mevzuatın izin verdiği ölçüde; dolaylı zararlardan ve kullanıcıların yüklediği içerikten {MARKA} sorumlu tutulamaz. Ücretli hizmetlerde sorumluluk, ilgili dönem için ödenen bedelle sınırlıdır. Tüketicilerin kanundan doğan hakları saklıdır.

## Fesih
Kullanıcı hesabını dilediği zaman silinmesini isteyerek kapatabilir. Koşullara aykırılık halinde hesap ya da birim askıya alınabilir veya kapatılabilir.

## Değişiklikler
Bu koşullar güncellenebilir; önemli değişiklikler portalda duyurulur. Güncel metin her zaman bu sayfadadır.

## Uygulanacak hukuk
Bu koşullara Türk hukuku uygulanır. Uyuşmazlıklarda tüketiciler için tüketici hakem heyetleri ve tüketici mahkemeleri, diğer durumlarda {MAHKEME} mahkemeleri ve icra daireleri yetkilidir.

İletişim: {EPOSTA}

Son güncelleme: {TARIH}
TXT,

'satis' => <<<'TXT'
## Madde 1 — Taraflar
**Hizmet sağlayıcı:** {UNVAN}
Adres: {ADRES}
{VERGI}{MERSIS_SATIR}
E-posta: {EPOSTA}{TELEFON_SATIR}

**Alıcı:** Ödeme sayfasında fatura bilgilerini giren gerçek ya da tüzel kişi (birim adına ödeme yapan birim yöneticisi).

## Madde 2 — Konu
Bu sözleşme, alıcının {SITE} adresindeki {MARKA} portalında seçtiği abonelik paketinin, seçilen dönem (aylık ya da yıllık) boyunca biriminde kullanılmasına ilişkin hakların ve yükümlülüklerin, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümlerine göre belirlenmesidir.

## Madde 3 — Hizmetin özellikleri ve bedeli
Paketin içeriği (modüller, kişi sınırı), dönemi ve vergiler dahil toplam bedeli ödeme sayfasında, ödemeden önce gösterilir. Ödeme banka / kredi kartıyla (ödeme kuruluşu aracılığıyla) ya da havale / EFT ile yapılır. Kart bilgileri hizmet sağlayıcıya ulaşmaz.

## Madde 4 — İfa
Hizmet, ödemenin onaylanmasıyla birlikte alıcının birimi için elektronik ortamda derhal kullanıma açılır. Havale / EFT ödemelerinde hizmet, ödemenin hesaba geçtiğinin görülmesiyle açılır. Abonelik dönem sonunda kendiliğinden yenilenmez ve kartınızdan otomatik çekim yapılmaz.

## Madde 5 — Cayma hakkı
Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesinin 1. fıkrasının (ğ) bendi uyarınca, elektronik ortamda anında ifa edilen hizmetlerde cayma hakkı kullanılamaz. Bununla birlikte iade talepleri İptal ve İade Koşulları'na göre değerlendirilir. Alıcı tacir ise tüketici mevzuatındaki cayma hakkı uygulanmaz.

## Madde 6 — Tarafların yükümlülükleri
Hizmet sağlayıcı, hizmeti Kullanım Koşulları'na uygun ve makul özenle sunar. Alıcı, fatura bilgilerinin doğruluğundan ve portalın Kullanım Koşulları'na uygun kullanılmasından sorumludur.

## Madde 7 — Fatura
Fatura, alıcının ödeme sayfasında girdiği bilgilerle düzenlenir ve elektronik ortamda iletilir.

## Madde 8 — Uyuşmazlıklar
Tüketici işlemlerinde, Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde tüketicinin yerleşim yerindeki ya da işlemin yapıldığı yerdeki tüketici hakem heyetleri, sınırları aşan durumlarda tüketici mahkemeleri yetkilidir. Diğer durumlarda {MAHKEME} mahkemeleri ve icra daireleri yetkilidir.

## Madde 9 — Yürürlük
Alıcı, ödeme sayfasında bu sözleşmeyi onaylayarak ödemeyi başlattığında sözleşme kurulmuş olur. Onayın tarihi, onaylayan kişi ve IP adresi ödeme kaydında saklanır.

Son güncelleme: {TARIH}
TXT,

'iade' => <<<'TXT'
## Deneme süresi
Deneme süresi ücretsizdir; deneme bitince kendiliğinden ücretli pakete geçilmez ve kartınızdan çekim yapılmaz.

## Abonelik iptali
Abonelik dönem sonunda kendiliğinden yenilenmez. Yenilemek istemezseniz bir şey yapmanız gerekmez; dönem sonuna kadar hizmet sürer. Süre dolunca birim, sistemde tanımlı ise ücretsiz pakete geçer ya da yalnız görüntülenebilir hale gelir; verileriniz silinmez.

## İade
- İlk ödemenizden sonraki **14 gün** içinde {EPOSTA} adresine yazarak iade isteyebilirsiniz. Tutarın tamamı, ödemenin yapıldığı yönteme (kart ya da banka hesabı) iade edilir.
- 14 günden sonra kalan dönem için iade yapılmaz; hizmet dönem sonuna kadar sürer.
- Hizmetten kaynaklanan uzun süreli kesintilerde kesinti süresi kadar ek süre tanınır ya da orantılı iade yapılır.
- Karta iadelerin hesabınıza yansıma süresi bankanıza bağlıdır (genellikle 2-10 iş günü).

## İletişim
İptal ve iade talepleriniz için: {EPOSTA}{TELEFON_SATIR}

Son güncelleme: {TARIH}
TXT,
];
