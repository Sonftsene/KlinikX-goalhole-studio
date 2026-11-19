# dupcii — Hostinger Kurulum Rehberi

Klinik ekibiniz için duyuru, protokol, eğitim ve nöbet çizelgesi portalı.
PHP 8.0+ olan her paylaşımlı sunucuda (Hostinger dahil) ek kurulum gerektirmeden çalışır.

## 1. Yükleme (5 dakika)

1. Hostinger hPanel → **Dosya Yöneticisi** → `public_html` klasörünü açın.
   (Alt klasöre de kurabilirsiniz, ör. `public_html/portal`.)
2. ZIP dosyasını yükleyin ve **Çıkart (Extract)** deyin. `index.php` doğrudan bu klasörde olmalı.
3. `data` ve `uploads` klasörlerinin izni **755** olsun (Hostinger'da varsayılan).
4. hPanel → **SSL** bölümünden ücretsiz SSL'i açın ve **HTTPS'e zorla (Force HTTPS)** seçeneğini etkinleştirin.
5. Sitenizi açın.
   - Paketiniz size özel hazırlandıysa (içinde `INITIAL_ADMIN_*` dolu bir `config.php` varsa) yönetici hesabınız hazırdır: e-posta adresiniz ve size verilen **geçici şifre** ile giriş yapın, ilk girişte kendi şifrenizi belirleyin.
   - Aksi halde ilk ekranda **kurum adı** ve **ilk yönetici hesabını** oluşturun.

Veritabanı ilk açılışta otomatik oluşur (`data/` klasöründe, tahmin edilemez bir adla). SQL içe aktarmanıza gerek yoktur.

Ayarları değiştirmek isterseniz (MySQL, Google ile giriş, ilk yönetici) `config.sample.php` dosyasının bir kopyasını **`config.php`** adıyla oluşturup onu düzenleyin. Paket `config.php` içermez; böylece güncellemelerde ayarlarınız asla ezilmez.

### Yeni sürüme güncelleme

Verileriniz `data/` (veritabanı) ve `uploads/` (dosyalar) klasörlerindedir; ayarlarınız `config.php` dosyasındadır. Güncellemede bunlara dokunmayın.

1. hPanel → **Dosya Yöneticisi** → `public_html`. Paket `data`, `uploads` ve `config.php` içermez; bunlar yerinde kalır. İsterseniz önce `data` ve `uploads` klasörleriyle `config.php` dosyasını bilgisayarınıza indirin (yedek).
2. Yeni ZIP'i `public_html` içine yükleyin. Aynı adlı ZIP zaten varsa önce eskisini silin.
3. ZIP'e sağ tıklayıp **Çıkart (Extract)** deyin. Dosya Yöneticisi “dosya zaten var” diye sorarsa **Üzerine yaz / Değiştir (Replace / Overwrite)** seçin, “ikisini de tut / yeniden adlandır (Keep both / Rename)” **seçmeyin**: o zaman yeni dosyalar `api (1).php` gibi adlarla kaydedilir ve eski kod çalışmaya devam eder.
4. Sitenizi açın; veritabanı kendiliğinden güncellenir.

Yanlışlıkla “yeniden adlandır” seçildiyse: `(1)`, `_1` gibi eklerle oluşan dosyaları silin ve ZIP'i yeniden **üzerine yazarak** çıkartın. `data` ve `uploads` klasörlerini silmeyin. Uygulama, veritabanı adı kaybolsa bile `data/` içindeki eski veritabanını bulup kendiliğinden kullanır; kurulum ekranı açılırsa yeni hesap oluşturmadan önce sayfayı yenileyin.

## 2. İlk ayarlar (önerilen)

Yönetici olarak giriş yaptıktan sonra sol menüden:

- **Nöbet listeleri** → Hazır gelen iki listenin (*Hemşire Nöbet Listesi*, *Personel Nöbet Listesi*) adını **⋯ → Yeniden adlandır** ile değiştirin ve Excel dosyalarınızı yükleyin.
- **Bölüm ve birimler** → Servislerinizi (Yoğun Bakım, Acil…) düzenleyin.
- **Ayarlar** → Üye kaydı türünü seçin:
  - *Onaylı kayıt* (varsayılan): Herkes kayıt olur, siz onaylayınca giriş yapar.
  - *Açık kayıt*: Kayıt olan hemen girer.
  - *Kapalı*: Yalnızca sizin eklediğiniz kullanıcılar.
- **Kullanıcılar** → Ekibi ekleyin. Şifre boş bırakılırsa geçici şifre üretilir.

## 3. Yetkiler

| Yetki | Neler yapabilir |
|---|---|
| **Yönetici** | Her şey: kullanıcılar, bölümler, ayarlar, içerik onayı, nöbet listeleri |
| **Yayıncı** | Onaysız yayın, ekibin içeriklerini onaylama, nöbet listelerini yükleme ve düzenleme |
| **Üye** | Görüntüleme, okundu onayı; eklediği içerikler onaya düşer |

Sorumlu hemşireye *Yönetici*, yardımcısına ve eğitim hemşiresine *Yayıncı* vermeniz önerilir.

## 4. E-posta bildirimleri (önerilir)

1. hPanel → **E-postalar** → alan adınızda bir adres oluşturun, ör. `bildirim@alanadiniz.com`.
2. Portalda **Yönetim → Ayarlar → E-posta bildirimleri**:
   - *E-posta bildirimlerini aç*
   - Gönderen e-posta ve kullanıcı adı: `bildirim@alanadiniz.com`, şifre: o adresin şifresi
   - SMTP sunucusu `smtp.hostinger.com`, port `465`, güvenlik `SSL`
3. **Ayarları kaydet** → **Bana test e-postası gönder**. Gelmezse gereksiz (spam) klasörüne bakın; hata varsa **Gönderim geçmişi** nedenini gösterir.
4. **Hangi durumlarda e-posta gitsin?** bölümünden olayları seçin:
   - Yeni duyuru / içerik yayınlandığında
   - Nöbet listesi güncellendiğinde
   - Onay bekleyen içerik gönderildiğinde (yöneticilere ve yayıncılara)
   - Yeni üyelik başvurusu geldiğinde (yöneticilere)
   - Üyelik onaylandığında (başvurana)

E-postalar sayfa yanıtı gönderildikten sonra arka planda yollanır, portal yavaşlamaz. Gönderilemeyenler otomatik olarak tekrar denenir.
Zamanlanmış görevlerin (hatırlatmalar, sabah özeti, haftalık yedek) saatinde çalışması için cron görevi kurun (bkz. bölüm 13).

Ek olarak:
- Zorunlu okumalarda **Okumayanlara e-posta ile hatırlat** düğmesi çıkar.
- Giriş ekranında **Şifremi unuttum** çalışır (1 saat geçerli, tek kullanımlık bağlantı).
- Kullanıcı eklerken giriş bilgileri e-postayla gönderilebilir.
- Her kişi **Hesabım** sayfasından bildirim tercihini seçer: **Anlık** (her duyuruda e-posta), **Sabah özeti** (günde tek e-posta) veya **Kapalı**. Nöbet hatırlatmaları ve hesap e-postaları her zaman gider.

## 5. Şifremi unuttum ve geçici şifreler

- E-posta ayarlıysa kişi giriş ekranındaki **Şifremi unuttum** ile kendi şifresini yeniler.
- Yönetici her zaman **Kullanıcılar → ⋯ → Geçici şifre oluştur** diyebilir.
- Geçici şifreyle giren herkes, devam etmeden önce kendi şifresini belirlemek zorundadır.

## 6. MySQL kullanmak isterseniz (isteğe bağlı)

SQLite yüzlerce kullanıcı için yeterlidir. Yine de MySQL isterseniz:

1. hPanel → **Veritabanları → MySQL** → yeni veritabanı ve kullanıcı oluşturun.
2. `config.php` dosyasında (yoksa `config.sample.php`'yi `config.php` adıyla kopyalayın) `DB_DRIVER` değerini `'mysql'` yapın, `DB_NAME`, `DB_USER`, `DB_PASS` alanlarını doldurun.
3. Siteyi açın; tablolar otomatik oluşur.

## 7. Google ile giriş (isteğe bağlı)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **OAuth istemci kimliği** → *Web uygulaması*.
2. **Yetkili JavaScript kaynakları** kısmına site adresinizi ekleyin (ör. `https://portal.hastaneniz.com`).
3. Oluşan istemci kimliğini `config.php` içindeki `GOOGLE_CLIENT_ID` satırına yapıştırın.

Google ile gelen yeni kişiler de kayıt ayarınıza (onaylı / açık / kapalı) tabidir.

## 8. Nöbet listeleri (Excel)

- Nöbet listeleri **Excel dosyası olarak yüklenir** ve sitede doğrudan, Excel'deki gibi açık görünür: renkler, kalın yazılar, kenarlıklar, birleştirilmiş hücreler, sütun genişlikleri, dondurulmuş satır/sütunlar ve birden fazla sayfa (alt sekmeler).
- Desteklenen biçimler: `.xlsx`, `.xlsm`, `.xls`, `.ods`, `.csv` (PDF veya fotoğraf da yüklenebilir).
- İstediğiniz kadar liste açabilir, her birine ad verebilirsiniz. Listeler arasındaki geçiş anında olur.
- Listeyi güncellemek için **Yeni sürüm yükle** deyin. Son 15 sürüm saklanır. Yanlış dosya yüklenirse **⋯ → Önceki sürümler** bölümünden geri alabilirsiniz.
- Ekip üyeleri listede arama yapabilir. **Beni bul** düğmesi, kendi adlarının geçtiği hücreleri işaretler.
- Liste yüklenince ana sayfaya otomatik olarak “… nöbet listesi güncellendi” duyurusu düşer (Ayarlar → Otomatik duyuru; isterseniz zorunlu okuma yapılabilir) ve seçiliyse ekibe e-posta gider.
- **Nöbetlerim:** Liste yüklendiğinde (yükleyen kişinin tarayıcısında) kişi başı nöbetler okunur. Herkes **Nöbetlerim** sayfasında sıradaki nöbetini, aylık nöbet/saat/fazla mesai özetini görür ve nöbetlerini **telefon takvimine** ekleyebilir. Eşleştirme ad soyada göre yapılır; listedeki ad ile portaldaki ad aynı olmalıdır.
- Listenin ayı otomatik bulunur. Yanlışsa liste başlığının altındaki **Ayı değiştir** bağlantısıyla düzeltin.
- **Nöbet sekmesi** tek yerde üç bölümden oluşur: **Takvimim** (renkli ay takvimi; bir güne dokununca o gün kimlerle çalıştığınız görünür), **Kim nöbette** (gün gün nöbetçiler ve ekip rehberi: tek dokunuşla arama, WhatsApp) ve **Excel liste**.
- Renkler her yerde aynıdır: sarı gündüz, lacivert gece, yeşil 24 saat, gri izin, turkuaz görev (ör. Sorumlu).
- **Nöbet kodları:** Ayarlar › Nöbet › Nöbet kodları bölümünden kısaltmaların anlamını, saatlerini ve türünü düzenleyin (ör. “8 16” = Gündüz 08–16). Kaydedince listeler yeniden okunur.
- Excel listede **Sadece ben** düğmesi, yalnızca başlıkları ve sizin satırınızı gösterir.

### 8a. Google E-Tablolar'dan otomatik güncelleme

Liste Google E-Tablolar'da tutuluyorsa (siz yalnızca **görüntüleyen** olsanız bile) uygulama onu kendiliğinden izler:

1. **Ayarlar › Nöbet › Google E-Tablolar bağlantısı** bölümüne tablonun adresini yapıştırın ve **Yalnızca bana paylaşıldı** seçiliyken **Kaydet** deyin.
2. Ekranda çıkan kodu kopyalayın. Tabloyu görebildiğiniz Google hesabıyla **script.google.com** adresini açın, yeni projeye kodu yapıştırıp kaydedin.
3. Üstteki listeden **kur** işlevini seçip **Çalıştır**'a basın ve izin verin (Gelişmiş → projeye git → İzin ver). Bu sizin kendi betiğinizdir; veriler yalnızca sizin sitenize gider.
4. İlk veri gelince uygulamada tablodaki sekme türleri listelenir (ör. “3. BASAMAK”, “2. BASAMAK”). Her türü bir nöbet listesine bağlayın veya **+ Yeni liste oluştur** deyin. Her ayın sekmesi (KASIM 3, BASAMAK · ARALIK 3.BASAMAK …) aynı listeye kendiliğinden eklenir.

**Birden fazla tablo:** Aynı bölümde **Tablo ekle** ile başka Google tabloları da ekleyebilirsiniz. Türü **Nöbet listesi** olan tabloların nöbetleri takvime işlenir; **Yalnızca görüntülenen tablo** (ör. hasta listesi) menüde “Tablolar” altında salt okunur görünür. Kod hangi tabloları göndereceğini uygulamadan öğrenir; yeni tablo eklediğinizde kodu yeniden yapıştırmanız gerekmez (3.8.0'dan önceki kodu kurduysanız bir kez yeni kodla değiştirin). Yalnızca görüntülenen tablolarda **“Hastanın Adı Soyadı”** sütunundaki adlar, dosya sunucuya kaydedilmeden önce kısaltılır (Ayşe Yılmaz → Ayşe Y.; istenirse A. Y.). Tam ad uygulamada ve indirilen dosyada bulunmaz. Sütun başlığı ve biçim tablonun yanındaki **Değiştir** ile ayarlanır. TC, tanı gibi bilgiler de özel nitelikli kişisel veridir (KVKK); kurumunuzun izni olmadan paylaşmayın.

Liste görüntüsünde yalnızca o listeye ait sekmeler görünür (ör. 3. Basamak listesinde yalnızca “… 3. BASAMAK” ayları); açılışta bu ayın sekmesi seçilidir.

**Görünen sekmeler:** Her tablonun yanındaki **Görünen sekmeler › Seç** ile ekibin göreceği sekmeleri işaretleyin (nöbet tablosu ve hasta listesi için). İşaretlenmeyen sekmelerin içeriği uygulamaya hiç kaydedilmez; nöbet tablosunda o sekmelerdeki nöbetler de okunmaz. Tekrar işaretleyince geri gelir.

Sonrasında sorumlu Excel'i düzenledikçe yaklaşık 1–2 dakika içinde (Google kodu her dakika kontrol eder; 3.10.3'ten önce kurduysanız kodu bir kez yenisiyle değiştirip **kur**'u çalıştırın): liste görüntüsü, herkesin Takvimi, Kim nöbette ve hatırlatmalar güncellenir; nöbeti değişen kişiye “Nöbetinde değişiklik var” bildirimi gider. Bağlı listelere uygulamadan dosya yüklenemez, kimse listeyi uygulamada değiştiremez.
Tablo “bağlantıya sahip herkes görüntüleyebilir” olarak paylaşıldıysa betik gerekmez; ikinci seçeneği seçmeniz yeterli (sunucu her 5 dakikada kendisi indirir; zamanlanmış görev önerilir, bkz. 13. bölüm).

### 8b. Günlük blok yerleşimi ve taraf listesi (kura)

**Nöbet › Taraf / Bloklar** sayfasında yayıncı ve yönetici o günkü nöbetçileri bloklara yerleştirir: **Otomatik dağıt** gereken sayılara göre önce herkesi kendi tarafına koyar, eksik taraf için diğer taraftan en az geçmiş kişiler arasından kura çeker (muaflar hariç; 24 saat tutan kişi gün boyu aynı blokta kalır). Sonuç **Kaydet**'le kesinleşir; elle de düzenlenebilir. Son yerleşim ana sayfada herkese görünür, her adın yanında parantez içinde karşı tarafa geçiş sayısı yazar. Herkes geçmiş veya ileri bir günü seçip o günün yerleşimine bakabilir. Geçmişe dönük geçiş sayıları yayıncı/yönetici tarafından elle girilebilir. Gereken nöbetçi sayıları ve muafiyetler **Ayarlar › Nöbet**'tedir.

- **Sorumlular ekibi:** Taraf sayfasındaki “Sorumlular ekibi · sabit kişiler” kartından sabit kişileri seçin. Nöbetteyseler her zaman Sorumlular'a yerleşir, otomatik dağıtımda A/B/C'ye ve kuraya girmez. İstisna olarak bir kişi aynı gün en fazla 2 yerde olabilir (ör. 08-16 Sorumlular, 16-08 A blok); saatler çakışamaz.
- **Elle düzenleme:** Kişiye dokunup başka bloğa/tarafa/Sorumlular'a taşıyın, gündüz-gece bölün.
- **Oflama:** Gündüz, gece veya 24 saat “oflandı” işaretlenir; oflanan kısım blok sayısına ve karşıya geçişe dahil olmaz.
- **Çağrılan kişi:** Eksik olunca o gün listede olmayan birini bloğa veya Sorumlular'a ekleyin; hesaba dahil olur.
- **Nöbete gelecek kişi:** (ör. hasta yatışı olursa gelecek kişi) A/B/C'den ayrı satırda görünür, hesaba girmez; gelince “Geldi” ile bir yere alınır.
- **WhatsApp'ta paylaş:** Yönetici ve yayıncı kaydedilmiş günü **Paylaş** ile tablo görseli olarak WhatsApp'a gönderebilir (veya metin olarak kopyalayabilir).
- **Nöbet hesaplarına dahil edilmeyenler:** Listede adı olup nöbet düzenine girmeyen kişiler (ör. yaşlı bakım personeli) Kullanıcılar menüsünden veya Ayarlar › Nöbet'ten işaretlenir; yerleşime, kuraya, sayımlara, çağrıya ve değişime hiç girmez.

Eski yöntem: **Nöbet › Taraf** sayfasında taraflar tanımlanır (ör. 3. Basamak → B blok, 2. Basamak → A blok ve C blok) ve her taraf bir nöbet listesine bağlanır. Bir gün karşı tarafa personel gerekince o gün nöbetçi olanlar arasından **Kura çek** denir: önce hiç ya da en az geçmiş olanlar seçilir, eşitlik varsa aralarında kura çekilir. Gece içeren nöbetler (16-08, 08-08) 1 geçiş sayılır; 08-16 sayılmaz. Sayfada aylık tablo (kim hangi gün nerede), kişi başı aylık ve toplam geçiş sayısı, adaylar ve kura sonucu kayıtlı görünür. Kura başka yerde çekildiyse **Elle kaydet** kullanılır. Kaydı o gün nöbette olanlar veya sorumlular yapabilir.

### 8c. Nöbet değişimi ve devri

Takvimde kendi nöbet gününüze dokunup **Değiş / Devret** deyin: yalnızca kurallara uyan kişiler ve günler listelenir (üst üste en fazla 24 saat — 24 saat çıkışına nöbet eklenemez; nöbetler arası en fazla 4 boş gün — 5 günlük boşluk olamaz; izinli günler boşluk sayılmaz). Kurallar Ayarlar › Nöbet bölümünden değiştirilebilir. İstek karşı tarafa gider; kabul edilince sorumluya “Excel'e işlenecek” olarak bildirilir. Sorumlu Excel'i güncelleyince istek kendiliğinden “Listeye işlendi” olur.

### 8d. Nöbet istekleri, ilanlar, eksik personel

- **İstekler (Nöbet › İstekler):** Yayıncı ay için istek dönemi açar ve son tarih belirler. Herkes **boşluk** ve **yıllık izin** isteğini takvimden ya da “2,3,4 boşluk; 15-19 izin” diye yazarak girer; son tarihten 2 gün önce hatırlatma gider. Yönetim sekmesinde gün gün yoğunluk haritası, adil ret önerisi, kura, gerekçeli onay/ret ve Excel çıktısı vardır. Liste gelince onaylı istekle çakışan nöbetler uyarılır.
- **Nöbet ilanı (Nöbet › İlanlar):** Takvimde kendi nöbetinize **İlana koy** deyin. Panoda ilan sahibi görünür; başvuranları ve alanı yalnız ilan sahibi, yayıncılar ve yönetici görür. Yalnız kurallara (16 saat dinlenme, 48 saat, 5 gün boşluk) uyan kişiler başvurabilir.
- **Eksik personel (Yönetim › Eksik personel):** Bir gün eksik olduğunda kurallara uyan adaylar (o gün nöbeti yok, izinli değil, 16 saat dinlenmiş, 48 saat / 5 gün boşluk olmaz, muaf değil) ve kaydırılabilecek kişiler sıralı listelenir; Excel indirilebilir, seçilenlere “Gelebilir misin?” sorulur.
- **Değişim geçmişi (Yönetim › Değişim geçmişi):** Tüm değişim, devir, ilan ve çağrı kayıtları, yalnız yayıncılar.
- Sonuçlanan değişim isteklerini herkes kendi listesinden kaldırabilir; sorumlu hatalı isteği silebilir veya “İşlendi” diye kapatabilir.

### 8e. Kişisel ayarlar

- **Hesabım › Görünüm:** açık / koyu / otomatik mod, 8 renk paleti, gece siyahı, köşe ve yoğunluk, yazı boyutu; **Ana sayfam** ile kartları gizleme ve sıralama. Ayarlar hesaba kaydedilir, her cihazda aynı görünür.
- **Hesabım › Ücretim:** normal fazla mesai, resmî tatil ve bayram saat ücretleri; aylık tahmini tutar Nöbetlerim sayfasında görünür. Ücretleri yalnızca kişinin kendisi görür (yönetici dahil kimse göremez).
- **Hesabım › Bildirimler › Nöbet hatırlatmam:** “bir gün önce saat X” ve/veya “nöbetten X saat önce”.
- Ana sayfada sıradaki nöbete (veya nöbetin bitişine) canlı geri sayım.
- Resmî tatil ve bayramlar takvimde işaretlidir; **Ayarlar › Nöbet**'ten düzenlenir (dini bayram tarihleri Diyanet takvimine göre girilmiştir, gerekirse düzeltin).

## 9. Dosya yükleme

- **Her tür dosya** yüklenebilir. PDF, Excel, Word (.docx), görsel, video, ses ve metin dosyaları sitede doğrudan açılır. Diğerleri (PowerPoint, eski .doc, zip vb.) indirilerek açılır.
- **Boyut sınırı yoktur.** Dosyalar küçük parçalar halinde gönderildiği için sunucunun PHP yükleme sınırına takılmaz. Tek sınır hosting paketinizin disk alanıdır.
- İsterseniz `config.php` → `MAX_UPLOAD_MB` ile dosya başına bir sınır koyabilirsiniz (0 = sınırsız).

## 10. Yedekleme

- **Ayarlar → Yedekleme:** tek tıkla veritabanı yedeği veya dosyalar dahil tam yedek indirilir.
- Veritabanı **her hafta otomatik** yedeklenir; son 4 otomatik ve son 8 elle alınmış yedek `data/backups` klasöründe saklanır (tarayıcıdan erişilemez). Yedeklere kişilerin ücret bilgileri girmez.

Tüm veriler iki yerdedir: `data/` (veritabanı ve yedekler) ve `uploads/` (yüklenen dosyalar). Hostinger'ın otomatik yedekleri de bunları kapsar.

## 11. Gizlilik ve güvenlik

- Site arama motorlarına kapalıdır (`robots.txt`, `X-Robots-Tag` başlığı ve sayfa etiketleri).
- Giriş yapmayan kişi hiçbir içerik, nöbet listesi veya dosya göremez.
- Misafir bağlantıları varsayılan olarak **kapalıdır**. Ayarlar → Gizlilik bölümünden açılırsa, yetkililer tek bir içeriği süreli bağlantıyla paylaşabilir. Kapatıldığında tüm bağlantılar anında geçersiz olur.
- `data`, `uploads` ve `inc` klasörlerine tarayıcıdan doğrudan erişim engellidir; dosyalar yalnızca yetki kontrolünden sonra indirilir.
- Yüklenen dosyalar sunucuda uzantısız (`.bin`) saklanır, bu yüzden yüklenen hiçbir dosya sunucuda çalıştırılamaz.
- Şifreler tek yönlü şifrelenir; 15 dakikada 8 hatalı denemeden sonra giriş geçici olarak kilitlenir.

## 12. Telefonda uygulama gibi kullanma

Siteyi telefonda açın → tarayıcı menüsü → **Ana ekrana ekle**. Portal, kendi simgesiyle uygulama gibi açılır.

- **Telefon bildirimleri:** Hesabım → Bildirimler → **Bildirimleri aç** (ayrıntı: 22. bölüm). Android'de tarayıcıdan çalışır; **iPhone'da** önce “Ana Ekrana Ekle” yapılmalı (iOS 16.4 ve üstü), sonra ana ekrandaki simgeden açılıp izin verilmelidir. Yönetici Ayarlar → Telefon bildirimleri bölümünden tamamen kapatabilir. Sunucuda ek bir şey gerekmez (anahtarlar otomatik oluşur, PHP OpenSSL yeterli).
- **Çevrimdışı görüntüleme:** Bir kez açılan duyurular, nöbet listeleri, Nöbetlerim ve PDF/Excel dosyaları internet yokken de açılır. Çıkış yapınca bu cihazdaki kayıtlar silinir.
- **Parmak izi / Face ID ile giriş:** Hesabım → **Bu cihaza ekle**. Sonraki girişlerde şifre gerekmez. Site **HTTPS** ile açılmalıdır (Hostinger'da ücretsiz SSL'i açın).

## 13. Zamanlanmış görevler (cron) — önerilir

hPanel → **Gelişmiş → Cron Jobs** → *Özel*: her **5 dakikada** bir şu komut:

```
/usr/bin/php /home/u123456789/domains/alanadiniz.com/public_html/cron.php
```

(`u123456789` ve `alanadiniz.com` kısmını kendi hesabınıza göre yazın; tam yolu Dosya Yöneticisi’nde `public_html` klasörünün üstünde görürsünüz.) Bu görev şunları saatinde yapar:

- **Nöbet hatırlatması:** nöbetten bir gün önce (varsayılan 18:00) kişiye e-posta ve telefon bildirimi
- **Sabah özeti:** “Sabah özeti” seçenlere tek e-posta (bugünkü nöbet, yeni duyurular, okunacaklar)
- **Okuma hatırlatması:** zorunlu okumayı X gün içinde yapmayanlara otomatik hatırlatma
- **Belge gözden geçirme:** geçerlilik tarihi yaklaşan protokol/formlar için uyarı
- **Haftalık yedek** ve eski kayıtların temizliği

Cron kurmasanız da bu görevler site ziyaret edildikçe arka planda çalışır; cron yalnızca saatinde çalışmalarını garanti eder. Saatler ve gün sayıları **Ayarlar → Hatırlatmalar ve sabah özeti** bölümünden değiştirilir.

## 14. Ekibi hızlıca eklemek

- **QR ile kayıt:** Kullanıcılar → **QR ile kayıt** → yazdırıp servise asın. Okutan kişi kayıt formuna gider (varsayılan olarak sizin onayınızla aktifleşir).
- **Listeden davet et:** Nöbet listelerinde adı geçip hesabı olmayan herkes listelenir. E-posta yazdıklarınıza davet e-postası gider; diğerleri için kişiye özel bağlantı oluşur (WhatsApp'tan gönderin). Davetle gelen kişi onay beklemeden girer; bağlantı tek kullanımlıktır ve 60 gün geçerlidir.

## 15. Diğer kolaylıklar

- **Ana sayfa:** En üstte tek “Bugün” kartı: sıradaki/süren nöbetiniz, okumanız gerekenler, yeni içerik ve (yöneticiye) onay bekleyenler.
- **Yönetici kurulum listesi:** Ana sayfada; liste, nöbet okuma, ekip daveti, e-posta, zamanlanmış görev ve SSL adımlarını tamamlandıkça işaretler.
- **İlk açılış tanıtımı:** Yeni gelen herkese 3 adımlık kısa tanıtım; Hesabım › Görünüm’den tekrar açılır.
- **Hesabım (profil ayarları):** Sağ üstteki yuvarlak profil resminize dokunun. Sekmeler:
  - **Profil:** profil fotoğrafı (telefon kamerası/galeri; kare kırpılır, yalnızca giriş yapanlar görür), ad soyad, ünvan, cep telefonu, dahili ve e-posta adresi (şifreyle onaylanır). Birimi yönetici değiştirir.
  - **Bildirimler:** e-posta (Anlık / Sabah özeti / Kapalı) ve telefon bildirimleri.
  - **Güvenlik:** şifre, parmak izi / Face ID, çıkış.
  - **Görünüm:** büyük yazı ve açık/koyu tema. **Gönderilerim:** gönderdiğiniz içerikler.
  - Yönetici, uygunsuz bir profil fotoğrafını Kullanıcılar › ⋯ › Profil fotoğrafını kaldır ile silebilir.
- **Bildirim zili:** sağ üstte; duyurular, liste güncellemeleri ve hatırlatmalar “Bugün / Bu hafta / Daha eski” diye gruplanır.
- **Duyuru şablonları:** Yeni içerikte “Şablondan başla” (denetim, eğitim, toplantı…); kendi metninizi “Şablon olarak kaydet” ile ekleyin.
- **Geçerlilik / gözden geçirme tarihi:** Protokol ve formlara tarih girin; yaklaşınca yöneticilere uyarı gider, Okuma raporu sayfasında listelenir.
- **Okuma raporu:** Zorunlu okumalarda kim, ne zaman okudu; **Excel olarak indir** (denetimlerde kanıt).
- **İşlem günlüğü:** Kim, ne zaman, ne yaptı (giriş, yayın, silme, liste yükleme, ayar değişikliği…).
- **Belge içinde arama:** Arama kutusu PDF, Word ve Excel eklerinin içindeki metni de arar.
- **WhatsApp ile paylaş:** İçerik ekranındaki WhatsApp düğmesi, portal bağlantısını gruba gönderir (içerik yine yalnızca giriş yapanlara açıktır).

## 16. Birden çok hastane ve birim (4.0)

Aynı siteyi başka birimler ve başka hastaneler de kullanabilir. **Kod tek, veriler ayrı:** her birimin kendi veritabanı ve dosya klasörü vardır; bir birimin kullanıcısı başka birimin kişilerini, nöbetlerini, hasta listelerini, dosyalarını ve bildirimlerini göremez.

1. **Sistem yöneticisi hesabı (bir kez):** İlk birimin yöneticisi **Yönetim → Ayarlar → Güvenlik → Sistem yönetimi** kartından hesabı oluşturur. Telefonunuza Google Authenticator veya Microsoft Authenticator kurun, ekrandaki QR kodu okutun ve uygulamanın verdiği 6 haneli kodu girin. Anahtarı güvenli bir yere not edin.
2. **Giriş:** Giriş ekranının altındaki **Sistem yönetimi** bağlantısı → e-posta + şifre + uygulamadaki kod. Bu hesap birimlerin içeriğini görmez; 30 dakika işlem yapılmazsa oturum kapanır.
3. **Hastane ve birim ekleme:** Sistem yönetimi → **Hastane ekle** → hastanenin altında **Birim ekle** → **Yönetici ekle** (ad, e-posta). Geçici şifre bir kez gösterilir; ilk girişte değiştirilir. İsterseniz e-posta (SMTP) ayarları başka bir birimden kopyalanır.
4. **Herkes aynı adresten girer:** E-posta ve şifre kişiyi kendi birimine götürür. Bir kişi yalnız bir birimde hesap açabilir. Birim yöneticisi ekibini kendi biriminden davet eder (QR ve davet bağlantıları birime özeldir).
5. **Dondurma:** Bir birim veya hastanenin tüm birimleri geçici olarak kapatılabilir; veriler silinmez, açınca kaldığı yerden devam eder.
6. **Cron:** Tek cron görevi yeterlidir; her birim ayrı ayrı çalıştırılır.

Mevcut kurulumunuz güncellemede hiçbir şey taşınmadan **ilk birim** olarak kaydolur; adresler, şifreler ve veriler aynen kalır. (Çok birimli yapı SQLite ile çalışır; MySQL kurulumları tek birimli kalır.)

## 17. Modüller ve roller (4.1)

**Modülleri açıp kapatmak (sistem yöneticisi):** Sistem yönetimi → hastanenin ⋯ menüsü → **Modüller (hastane geneli)**, ya da birimin ⋯ menüsü → **Modüller (bu birim)**. Birim için “Hastaneye uy / Açık / Kapalı” seçilir. Modüller: Nöbet listeleri ve takvim, Taraf / blok yerleşimi, Nöbet istekleri, Nöbet ilanı ve değişim, Eksik personel çağrısı, Değişim geçmişi, Telefon rehberi, Fazla mesai ücreti. Nöbet listeleri kapanırsa ona bağlı modüller de kapanır. Kapalı modül menüde görünmez ve sunucuda da kapanır; veriler silinmez, açınca geri gelir. Duyurular, belgeler, okuma takibi ve kullanıcılar her zaman açıktır.

**Roller (birim yöneticisi):** Yönetim → Ayarlar → **Güvenlik → Roller ve yetkiler → Rol ekle**. Her modül için kişinin **Göremez / Kullanır / Yönetir** olacağını seçin (ör. “Eksik sorumlusu”: Eksik personel çağrısı = Yönetir). Rolü kişiye **Kullanıcılar → Düzenle → Birime özel rol** ile verin. Rolü olmayan kişide temel yetki geçerlidir: Yayıncı yönetir, Üye kullanır. Yönetici her zaman tam yetkilidir. “Yönetir” verilen kişiye o modülün sorumlu bildirimleri de gider.

## 18. Hastane ortak alanları (4.2)

Aynı hastanedeki birimler iki şeyi paylaşır; başka hastaneler hiçbirini göremez.

**Ortak telefon rehberi:** Telefon rehberinde **Numara ekle** derken “Kimler görsün?” → **Tüm hastane** (varsayılan) ya da **Yalnız birimimiz**. Hastane rehberindeki numarayı yalnız ekleyen birim düzenleyip silebilir; diğer birimler numaranın yanında hangi birimin eklediğini görür. Excel'den / yapıştırarak eklerken “Hastane rehberine ekle” seçilebilir. Yönetici, biriminin mevcut numaralarını **Birim numaralarını hastaneye taşı** düğmesiyle tek seferde ortak rehbere aktarabilir.

**Hastane belgeleri:** Soldaki menüde **Hastane belgeleri** (sistem yöneticisi modülü kapatmadıysa). Yayıncı/yönetici **Belge ekle** ile protokol, talimat, form veya duyuru yayımlar; PDF, Word, Excel, resim eklenebilir, isteğe bağlı “Okudum, anladım” onayı istenir. Belge hastanedeki tüm birimlerde görünür ve diğer birimlere bildirim gider. Belgeyi yalnız yayımlayan birim düzenler veya kaldırır. **Okuma raporu**nda kendi biriminizin kişileri adıyla, diğer birimler yalnız sayıyla görünür (başka birimin personel adları gösterilmez). Hasta bilgisi içeren belge eklemeyin.

## 19. Mesajlaşma (4.3)

Üst çubuktaki konuşma balonu (veya soldaki **Mesajlar**). Her birimin **birim grubu** kendiliğinden vardır; birimin tüm etkin kişileri içindedir.

- **Birebir sohbet:** Yeni sohbet → kişiyi seçin. Kendi biriminizdeki kişilerle ve aynı grupta olduğunuz kişilerle yazışabilirsiniz.
- **Grup:** Yönetici / yayıncı (ya da rolünde “Mesajlaşma: Yönetir” olan) **Yeni grup kur** ile grup açar. Kendi biriminden herkesi; hastanenin diğer birimlerinden yönetici ve sorumluları ekleyebilir (ör. “Sorumlu hemşireler” grubu).
- **Grup yöneticisi:** grup bilgisinden ad/açıklama, “Yalnız yöneticiler yazsın” (duyuru grubu), üye ekle/çıkar, yönetici yap; herkesten mesaj silme. Herkes kendi mesajını herkesten silebilir, sohbeti sessize alabilir, gruptan çıkabilir.
- Fotoğraf (telefonda küçültülerek), PDF/Word/Excel ve diğer dosyalar (en fazla 25 MB) gönderilir; yalnız sohbetin üyeleri açabilir. Yanıtla, metni kopyala, kimler okudu.
- **KVKK:** T.C. kimlik numarası içeren mesaj gönderilmeden reddedilir. Hasta adı ve hasta bilgisi paylaşmayın.
- Bildirim: aynı birimdeki kişiye anında; başka birimdeki grup üyesine en geç ~5 dakika içinde (zamanlanmış görev). Sohbet açıkken yeni mesajlar birkaç saniyede gelir.

**4.4 ile eklenenler:**
- **Sesli mesaj:** yazı kutusunun yanındaki mikrofon → kayıt başlar, tekrar dokununca gönderilir (en fazla 5 dk). Tarayıcı mikrofon izni ister. Güncellemede yeni `.htaccess` dosyası da yüklenmeli (mikrofon yalnız kendi sitemize açıktır).
- **Anket:** ataç → Anket; tek ya da çok seçimli. Oy verenleri anketi açan ve grup yöneticisi görür.
- **Tepki:** mesajın ⋯ menüsünün üstündeki 👍 ❤️ 😂 😮 😢 🙏; aynısına tekrar dokununca kalkar.
- **İlet:** ⋯ → İlet → sohbeti seçin (fotoğraf/dosya da kopyalanır, “İletildi” yazar).
- **Sabitle:** ⋯ → Sabitle (grupta yönetici, birebirde iki taraf). Sohbetin üstünde çubuk olarak görünür.
- **@bahsetme:** “@” yazınca üyeler önerilir. Adı geçen kişiye sohbeti sessize almış olsa bile bildirim gider.
- **Davet bağlantısı:** grup bilgisi → Davet bağlantısı (1/7/30 gün). Hastanenizdeki biri bağlantıyla gruba katılır; işiniz bitince kapatın.
- **Saklama süresi (KVKK):** grup bilgisi → Mesajları sakla (süresiz / 30 gün / 90 gün / 6 ay / 1 yıl / 2 yıl). Süresi geçen mesajlar ve dosyaları her gün kendiliğinden silinir.

**4.6 ile eklenenler (sohbet, grup ve gizlilik ayarları):**
- **Mesaj ayarları** (Mesajlar sayfasında ⚙): son görülme ve çevrimiçi (herkes / kişilerim / hiç kimse — kapatan başkalarınınkini de göremez), hakkımda ve kimler görsün, okundu bilgisi (birebirde karşılıklı; gruplarda hep açık), **beni gruplara kim ekleyebilir** (herkes / yalnız birimim / hiç kimse — eklenemeyenlere davet bağlantısı gönderilir), **diğer birimler beni bulabilsin** (açan kişiye hastanenin diğer birimlerinden özel mesaj yazılabilir), **bana kimler yazabilir**, yeni sohbetlerde varsayılan kaybolan mesaj süresi, engellenenler, yazı boyutu, sohbet arka planı, Enter ile gönder, fotoğrafları otomatik göster.
- “Kişilerim” = biriminiz + ortak grup ya da sohbetiniz olan kişiler. Başka hastanedekiler hiçbir ayarla görünmez.
- **Engelle:** birebir sohbette ⋯ → Engelle. Engellenen kişi size yazamaz, sizi gruba ekleyemez; ortak gruplarda mesajları görünmeye devam eder.
- **Sohbet listesi:** Tümü / Okunmamış / Gruplar / Arşiv süzgeçleri; satırın ⋯ menüsünden listede sabitle (en fazla 3), arşivle, okunmadı işaretle, sessize al (8 saat / 1 hafta / her zaman), sohbeti temizle, birebir sohbeti sil (yeni mesaj gelirse yeniden görünür, eski mesajlar gelmez).
- **Mesaj:** kendi yazı mesajınızı 15 dakika içinde düzenleyin (“düzenlendi” yazar), **benden sil**, yıldızla (Mesajlar → ★ Yıldızlı mesajlar).
- **Sohbet ⋯:** sohbette ara, medya / belgeler / bağlantılar, sessize al, sohbeti dışa aktar (.txt), temizle, engelle, sil. Başlıkta “çevrimiçi / son görülme” ve “yazıyor…”. Başlığa dokununca grup bilgisi ya da kişinin profili açılır.
- **Grup ayarları (grup yöneticisi):** grup fotoğrafı, grup bilgisini kimler düzenleyebilir (yöneticiler / tüm üyeler), kimler üye ekleyebilir, **yeni katılımcıları onayla** (davet bağlantısıyla gelenler yöneticinin onayını bekler), yalnız yöneticiler mesaj göndersin, saklama süresi (24 saat ve 7 gün de seçilebilir). Yönetici kendi yöneticiliğinden ayrılabilir (en az bir yönetici kalır).

## 20. Sistem yöneticisinin birime girmesi

Sistem yönetimi → birimin satırında **Birime gir**. Birimde yönetici yetkisiyle her şeyi görür ve yönetirsiniz (kişiler, nöbet listeleri, ayarlar, roller, belgeler); dondurulmuş birime de girilebilir. Ekranın üstünde “Sistem yöneticisi olarak … birimindesiniz” şeridi görünür; **Sistem paneline dön** ile çıkılır. Giriş, çıkış ve yapılan her işlem birimin kendi **İşlem günlüğü**ne “Sistem yöneticisi” adıyla yazılır. Sistem yöneticisi birimde bir kişi olmadığı için kişi listelerinde görünmez, bildirim almaz, birim adına mesaj yazmaz.

## 21. Nöbet çizelgesini portalda hazırlama (4.5)

Excel kullanmayan birimler için: **Nöbet → Çizelge** sekmesi (yönetici, yayıncı ya da rolünde “Nöbet çizelgesi hazırlama: Yönetir” olan; Google E-Tablolar’a bağlı listelerde kullanılmaz).

1. Listeyi ve ayı seçin. Taslak yoksa nöbete dahil kişilerle boş çizelge açılır (listede o ayın nöbetleri varsa onlar gelir). **+** ile kişi ekleyin, adına dokunup satırı temizleyin ya da çıkarın.
2. **Gereken kişi** sayılarını (hafta içi / hafta sonu-tatil, gündüz / gece) ve gündüz, gece kodlarını seçin.
3. **Fırça:** üstteki koddan birini seçip hücrelere dokunun; fırça seçili değilken hücreye dokununca kod listesi açılır. Onaylı istek günleri taralıdır (B boşluk, İ yıllık izin). Sağda kişi başı saat, altta gün gün gündüz/gece sayısı (eksikse kırmızı).
4. **Denetle:** dinlenme (en az 16 saat), üst üste çalışma (en fazla 24 saat), uzun boşluk (en fazla 4 gün), onaylı isteğe yazılan nöbet ve eksik günler listelenir; hücreler kırmızı çerçevelenir.
5. **Otomatik doldur:** eksik günlere kurallara ve onaylı isteklere uyan kişileri adalet sırasıyla yazar (ay içinde az saat → son 7 günde az nöbet → kura); dolu hücrelere dokunmaz.
6. **Yapıştır / CSV:** başka bir programdan (hastane bilgi sistemi dışa aktarımı dahil) kopyalanan tablo (ilk sütun ad, başlıkta gün numaraları) ya da “Ad; tarih; kod” satırları aktarılır.
7. Taslak 20 saniyede bir kendiliğinden kaydedilir; ekip görmez. **Yayınla:** çizelge Excel görünümüyle listenin yeni sürümü olur; Takvimim, Kim nöbette, blok yerleşimi, ilan, eksik çağrısı ve hatırlatmalar bu çizelgeyle çalışır. (Liste bir anda tek ay gösterir; gelecek ayı yayınlayınca liste o aya geçer, önceki ay sürümlerde kalır.)


## 22. Bildirimler (4.7)

**Anlık, sayfa yenilemeden:** Uygulama açıkken yeni mesaj, çağrı, duyuru ve diğer bildirimler birkaç saniye içinde sağ üstte (telefonda en üstte) kart olarak çıkar. Kartta gönderen, metin ve sitenin simgesi görünür; mesaj kartından **Yanıtla** ile sohbeti açmadan yanıt verilir, **Okundu say** ile kapatılır. Zil ve mesaj simgesindeki sayılar, sekme başlığı “(3) …” ve ana ekrana eklenmiş uygulamanın simgesindeki rozet de kendiliğinden güncellenir. Kısa bir ses ve (telefonda) titreşim olur.

**Telefona üstten bildirim:** Hesabım → Bildirimler → **Bildirimleri aç**. Uygulama kapalıyken de bildirim telefona, sitenin simgesi/logosuyla gelir (logo: Ayarlar → Genel → marka; yüklenmediyse dupcii simgesi). Aynı sohbetten art arda gelen mesajlar tek bildirimde toplanır; bildirimde **Sohbeti aç / Okundu say** düğmeleri vardır. Eksik personel çağrısı kapatılana kadar ekranda kalır.
- **Android:** Chrome ile siteyi açın → Bildirimler → Aç. “Uygulama olarak yükle” düğmesiyle ana ekrana ekleyin; bildirimler uygulama gibi üstten (açılır) gelir.
- **iPhone (iOS 16.4+):** Safari → Paylaş → **Ana Ekrana Ekle** → ana ekrandaki dupcii simgesinden açın → Bildirimler → Aç. iPhone Ayarlar → Bildirimler → dupcii'de “Afişler: Kalıcı” seçilirse bildirim üstte kalır.
- Bildirim içeriği telefona **uçtan uca şifreli** gider (Google/Apple içeriği göremez).

**Kişisel ayarlar (Hesabım → Bildirimler):** her kategori (mesajlar, eksik personel çağrısı, duyurular, hastane belgeleri, nöbet, değişim/ilan, istekler, onay bekleyenler, sistem) için ayrı ayrı “Telefon” ve “Ekranda”; **Duraklat** (1 saat / 8 saat / yarın sabaha kadar); **sessiz saatler** (bildirim sessiz gelir); kilit ekranında içeriği gösterme; ses ve titreşim; **Bildirim alan cihazlarım** (cihaz başına deneme, kaybolan cihazı kaldırma). E-posta tercihi artık telefon bildirimini etkilemez.

**Yönetici (Ayarlar → Bildirimler → Bildirim politikası):** kaç kişide telefon bildiriminin açık olduğu ve açmayanların listesi; kategori başına birim varsayılanları; **zorunlu** kategoriler (kişi kapatamaz; sessiz saat ve duraklatmada da gelir — varsayılan: eksik personel çağrısı); **telefonda içeriği gizle (KVKK)** — kilit ekranında yalnız “Yeni mesaj” gibi genel yazı; sessiz saatlere izin.

**Bildirim merkezi:** zil → **Tüm bildirimler**: kategori süzgeci, okunmamışlar, tek tek silme, tümünü okundu say, okunanları sil (bildirimler 90 gün saklanır).

Başka birimdeki grup üyelerine mesaj ve hastane belgesi bildirimi de artık zamanlanmış görevi beklemeden hemen gider (site kendi adresine imzalı kısa bir istek atar; zamanlanmış görev yedek olarak çalışmaya devam eder).

## 23. Mesajlaşma 4.8 — WhatsApp özellikleri

**Yazma çubuğu:** solda 😊 emoji paneli (son kullanılanlar + kategoriler), sağda 📎 Ekle ve 📷 Kamera; boşken mikrofon (sesli mesaj), yazınca gönder düğmesi. Yazdığınız ama göndermediğiniz mesaj **taslak** olarak kalır (listede “Taslak:”). Ekran görüntüsünü yapıştırabilir, bilgisayarda dosyaları sohbete sürükleyip bırakabilirsiniz.

**Ekle:** Fotoğraf ve video (birden çok), **Kamera** (telefonda kamera uygulaması açılır; bilgisayarda tarayıcı içinden fotoğraf çekme ve video kaydı), Belge, **Tek seferlik fotoğraf/video** (alıcı bir kez açar, iletilemez, gönderen de açamaz; “Açıldı” görünür), **Konum** (Google Haritalar / OpenStreetMap ile açılır), **Kişi** (birim kişileri ve telefon rehberinden; kartta “Ara” ve “Mesaj”), Anket. Video en fazla 64 MB, diğer dosyalar 25 MB; videolar iPhone'da da oynar.

**Mesaja dokunma:**
- **Telefonda mesaja uzun basın** (bilgisayarda sağ tık ya da ⋯): üstte tepki emojileri (+ ile istediğiniz emoji), tek dokunuşla **Yanıtla, Yıldızla, Kopyala, İlet**; altta Özelden yanıtla, Seç, Düzenle, Sabitle, Bilgi (kimler okudu), Benden sil, Herkesten sil.
- **Mesajı sağa kaydırın** → alıntıyla yanıt. Alıntıya dokununca asıl mesaja gider.
- Bilgisayarda mesajın yanındaki 😊 → hızlı tepki, yıldız, yanıt.
- **Seç** ile birden çok mesajı birlikte yıldızlayın, kopyalayın, iletin ya da silin.
- Sesli mesajlarda **1× / 1,5× / 2×** hız; metindeki bağlantılar ve telefon numaraları tıklanır; tek emoji büyük görünür.
- Sohbete girince “**N okunmamış mesaj**” ayıracı ve aşağıda yeni mesaj sayılı “en alta in” düğmesi.

**Grupta gönderene dokunun** (ad ya da fotoğraf): profil açılır — **Mesaj**, **Sesli ara**, **Görüntülü ara**, **Telefonu ara** (birim kişisinin kayıtlı telefonu), engelle.

**Grup yöneticisi:** üye menüsünde **Yazmasını kısıtla** (okur ama yazamaz; birim grubunda da), **Gruptan çıkar ve engelle** (davet bağlantısıyla ya da eklenerek dönemez; grup bilgisinde “Gruptan engellenenler” → Engeli kaldır). **@herkes** ile gruptaki herkese (sessize alanlara da) seslenebilir.

**Sesli ve görüntülü arama:** birebir sohbetin üstündeki 📞 / 🎥 ya da profilden. Aranan kişiye uygulama kapalıyken de telefon bildirimi gider; açınca gelen arama ekranı çalar (Yanıtla / Reddet). Görüşmede sessize alma, kamera aç/kapa, kamerayı çevirme, küçültüp sohbete dönme. Ses ve görüntü cihazlar arasında doğrudan, şifreli akar; sunucudan geçmez, kaydedilmez. Sohbette “Sesli arama 2:31”, “Cevapsız arama” kaydı ve **Mesajlar › Aramalar** sekmesinde geçmiş. Hastanenin farklı birimleri arasında da çalışır.
- Yönetici: **Ayarlar › Genel › Sesli ve görüntülü arama** ile kapatabilir. Bazı hastane ağları / mobil operatörler doğrudan bağlantıyı engellerse orada bir **TURN sunucusu** (adres, kullanıcı adı, parola) tanımlayın; böylece arama her ağda çalışır.
- Güncellemede yeni `.htaccess` dosyası da yüklenmeli (kamera ve konum izni yalnız kendi sitemize açılır).

## 24. İzin bitişiği hafta sonu ve ekstra nöbet (4.9)

**İzin bitişiği hafta sonu:** Hafta içi en az 5 iş günü (Pazartesi–Cuma) izinli olan kişi, izninin **hemen öncesindeki** ve **hemen sonrasındaki** Cumartesi–Pazar günlerinde ekstra nöbete çağrılmaz. Eksik personel çağrısında (ve kaydırmada) “İzin hafta sonu” şartı olarak görünür, nedeni yazar. İzin: listedeki izin kodları (Yİ, Rp, İ…) ya da onaylı yıllık izin isteği; o haftadaki tam gün resmî tatil izin haftasına sayılır; iki haftalık izinde aradaki hafta sonu da korunur. Gün sayısı **Ayarlar › Nöbet › Nöbet kuralları**ndan değiştirilir (0 = kapalı).

**Ekstra nöbet:** Nöbet › **Ekstra nöbet**. Kişi ay için “Ekstra nöbet istiyorum” der; hangi vardiyaları (24 saat / gündüz / gece) alabileceğini ve uygun tüm günler mi yoksa seçtiği günler mi olduğunu belirtir. İstek gününden ay sonuna kadar her gün, her vardiya için kurallara göre ✓/✗ ve nedeni listelenir: o gün nöbeti ya da izni olmaması, onaylı/bekleyen boşluk ve yıllık izin isteği, izin bitişiği hafta sonu, dinlenme süresi, üst üste çalışma (kabul edilmiş değişimler ve seçilmiş çağrılar dahil); gereken sayıya göre eksik olan günler işaretlenir. İstek verince sorumlulara bildirim gider.
- Sorumlu: aynı sayfada **İsteyenler** sekmesi — kimler istedi, gün gün kimler uygun, o gün kaç kişi eksik; satırdan doğrudan **Çağrı aç**.
- Eksik personel çağrısında ekstra nöbet isteyen ve uygun olan kişiler **“Ekstra istiyor”** rozetiyle en üstte çıkar.
- Kurallar her açılışta güncel listeye göre yeniden hesaplanır (liste değişirse uygun günler de değişir).
