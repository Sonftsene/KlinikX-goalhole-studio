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

**Önerilen yol (4.24 ve sonrası):** Sistem yönetimi › **Site ve yedek** › **Güncelleme** bölümünden yeni `dupcii-hostinger.zip` dosyasını seçip **Güncellemeyi uygula**. Tek birimli kurulumda bu bölüm Ayarlar › Genel'dedir.
- Dosyalar birkaç saniyede değişir. O sırada yapılan işlemler bekletilir ve kendiliğinden tamamlanır, kimsenin işi yarıda kalmaz.
- Açık sayfalarda yazılanlar silinmez. Ayrıntılar §37'de.

Dosya yöneticisiyle güncelleyecekseniz önce aynı bölümden **Bakım modu**nu açın, bitince kapatın.

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

**Göndermeden önce önizleme:** Fotoğraf, video ya da dosya seçince (galeri, kamera, yapıştırma, sürükle-bırak) her zaman önizleme açılır: altına açıklama yazabilir, tek seferlik seçebilir, **Gönder** ya da **Vazgeç** diyebilirsiniz. Yazı kutusunda yazılmış metin açıklamaya taşınır.

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

**Nöbet devral (4.10):** Nöbet › **Ekstra nöbet** › **Nöbet devral**. Birinden nöbet almak istediğinizde, bugünden ay sonuna kadar **hem sizin alabileceğiniz hem de nöbet sahibinin bırakabileceği** tüm nöbetler gün gün, kişi kişi listelenir. Sizin için: o gün boş olmanız, boşluk/izin isteğinizin olmaması, dinlenme süresi, üst üste çalışma. Nöbet sahibi için: nöbeti bırakınca kendi boşluk kuralının bozulmaması. Kabul edilmiş değişimler hesaba katılır; ilana konmuş nöbetler “İlanda” rozetiyle üstte. Üstteki gün şeridinden bir güne dokununca **yalnız o gün** açılır ve uygun olmayan nöbetler de nedenleriyle (“Sen: …”, “Ayşe: …”) görünür; vardiya türüne göre süzülebilir. **İste** → nöbet sahibine bildirim gider; aynı sayfada “Senden nöbet isteyenler” bölümünden **Ver / Verme** der. Verince kurallar yeniden denetlenir, devir kaydı oluşur, sorumluya “Excel’e işlenecek” bildirimi gider; aynı nöbet için diğer istekler kapanır.

**Eksik çağrılarına gönüllü:** Nöbet › Ekstra nöbet › **Eksik çağrılarına gönüllü**. Kişi ay için “Ekstra nöbet istiyorum” der; hangi vardiyaları (24 saat / gündüz / gece) alabileceğini ve uygun tüm günler mi yoksa seçtiği günler mi olduğunu belirtir. İstek gününden ay sonuna kadar her gün, her vardiya için kurallara göre ✓/✗ ve nedeni listelenir: o gün nöbeti ya da izni olmaması, onaylı/bekleyen boşluk ve yıllık izin isteği, izin bitişiği hafta sonu, dinlenme süresi, üst üste çalışma (kabul edilmiş değişimler ve seçilmiş çağrılar dahil); gereken sayıya göre eksik olan günler işaretlenir. İstek verince sorumlulara bildirim gider.
- Sorumlu: aynı sayfada **İsteyenler** sekmesi — kimler istedi, gün gün kimler uygun, o gün kaç kişi eksik; satırdan doğrudan **Çağrı aç**.
- Eksik personel çağrısında ekstra nöbet isteyen ve uygun olan kişiler **“Ekstra istiyor”** rozetiyle en üstte çıkar.
- Kurallar her açılışta güncel listeye göre yeniden hesaplanır (liste değişirse uygun günler de değişir).

## 25. QR ile bilgisayara giriş ve bağlı cihazlar (4.11)

**Bilgisayarda şifresiz giriş:** Giriş ekranında **Telefonla QR kod okutarak giriş** → karekod çıkar. Telefonda dupcii açıkken **Hesabım › Güvenlik › Bilgisayarda oturum aç › QR kodu okut** (ya da telefonun kendi kamerasıyla okutun). Telefonda bilgisayarın tarayıcısı ve IP adresi görünür; **Onayla** deyince bilgisayar girer.
- Karekod 2 dakika geçerli ve tek kullanımlık; süresi dolunca yenisi kendiliğinden çıkar.
- Karekodun fotoğrafını çeken başkası giremez: oturum yalnız karekodu ekranında gösteren tarayıcıda açılır.
- Karekodu siz okutmadıysanız onaylamayın (başkası size karekod okutarak hesabınıza girmeye çalışıyor olabilir).
- Çok birimli kurulumda bilgisayar doğrudan sizin biriminize girer.

**Güvenli çıkış:** QR ile açılan bilgisayar oturumu **tarayıcı kapanınca** ve **8 saat işlem yapılmayınca** kendiliğinden kapanır (ortak bilgisayarlar için). Kendi bilgisayarınızda karekod ekranındaki “Bu bilgisayarda oturumum açık kalsın”ı açabilirsiniz.

**Bağlı cihazlar:** Hesabım › Güvenlik › **Bağlı cihazlar** — hesabınızın açık olduğu her cihaz (tarayıcı, giriş yolu, son etkinlik, IP). Herhangi birinde **Çıkış yap** ya da **Diğer tüm cihazlardan çıkış yap**: o cihaz bir sonraki işleminde giriş ekranına düşer ve o cihazdaki önbellek ve taslaklar silinir. Hesabım › Çıkış yap da bu cihazdaki oturumu kapatır.

## 26. Hastane yemek listesi (4.12)

**Listeyi yükleme (yöneticiler / “Yemek listesi: Yönetir” yetkisi olanlar):** Sol menü › **Yemek listesi** › **Liste yükle** → mutfağın aylık listesi (PDF, Excel ya da CSV). Okunan menü kaydetmeden önce gün gün tabloda gösterilir; yanlış bölünen ya da birleşen satırları düzeltip **Kaydet**. “Bu dosyada olmayan günleri sil” açıksa o ayın listesi tamamen yenilenir.
- PDF: “TARİH / KAHVALTI / ÖĞLE YEMEĞİ / AKŞAM YEMEĞİ” sütunlu tablo (aylık yemek listesi formu). Satır kıran yemekler (“Domates-” + “salatalık”) birleştirilir; sayfaya bölünen günler ve satırın ortasındaki tarihler doğru güne yazılır.
- Excel / CSV: aynı sütunlar. Tarih yalnız günün ilk satırındaysa alt satırlar aynı güne eklenir; hücrede alt alta ya da virgülle yazılmış yemekler ayrı kalem olur.
- **Elle gir:** ayın tüm günleri tabloda açılır (her satıra bir yemek). **Bu günü düzenle:** tek günü değiştirir.
- Çok birimli kurulumda liste hastanenin ortak veritabanındadır: bir birimin yüklediğini aynı hastanenin tüm birimleri görür.

**Görüntüleme:** Gün gün (oklar, gün şeridi, telefonda sağa/sola kaydırma) ya da **Ay** tablosu. Saate göre o an geçerli öğün **Şimdi**, ardından gelen **Sıradaki** olarak işaretlenir: kahvaltı 01:00'den, öğle 12:00'den, akşam 18:00'den itibaren (saatler yemek ayarlarından değişir). Nöbet günlerinde o nöbetin saatlerine düşen öğünler **Nöbetinde** olarak işaretlenir (ör. 08–08 nöbette öğle, akşam ve ertesi günün kahvaltısı; 16–08 nöbette akşam ve kahvaltı). Takvimim'de nöbet günü seçilince “Bu nöbetteki yemekler” de görünür.

**Ana sayfa kartı:** Şimdiki öğün ve oklarla sıradaki öğünler; nöbet yaklaşırken o nöbetin öğünleri. Kart Hesabım › Görünüm › Ana sayfam'dan ya da yemek ayarlarındaki “Ana sayfamda göster” ile kapatılır.

**Kim görür:** Yemek listesi › ayarlar (kaydırıcı simgesi):
- Yönetici: öğün saatleri ve birim varsayılanı (**Herkes, her gün** ya da **Yalnız nöbetçiler**).
- Herkes kendisi için: birimin ayarına uy / her gün göster / **yalnız nöbetlerimde göster** (nöbet sürerken ya da 18 saat içinde başlayacakken) / **gizle** (menüde ve ana sayfada görünmez). Aynı seçim Ayarlar › Genel'de de var.
- Modül sistem yöneticisi tarafından hastane ya da birim için kapatılabilir; rollerde “Yemek listesi” yetkisi ayrıca verilir.

## 27. Kişi kartı ve güvenlik güncellemesi (4.13)

**Kişi kartı:** Uygulamanın her yerinde bir kişinin adına ya da fotoğrafına dokununca kart açılır. Bu yerler:
- ana sayfa "Bugün nöbette" ve bloklar, ekip rehberi, telefon rehberindeki ekip
- nöbet ilanları ve başvurular, eksik personel çağrısı, ekstra nöbet / devral listeleri
- nöbet istekleri, duyuru yazarları, okuma raporu

Kartta şunlar bulunur:
- **Mesaj**, **Sesli ara**, **Görüntülü** (uygulama içi)
- **Telefon**, **SMS**, **WhatsApp**, **E-posta** (kişi izin verdiyse)
- dahili numara, son görülme
- **yaklaşan nöbetleri** (şu an nöbetteyse işaretli) ve izin günleri

Hesabı olmayan, yalnız listede adı geçen kişide nöbetler görünür.

**İletişim gizliliği (KVKK):** Hesabım › Profil:
- "Cep telefonum ekip rehberinde görünsün" — varsayılan açık.
- "E-posta adresim ekip arkadaşlarıma görünsün" — varsayılan kapalı.

Yöneticiler ve sorumlular her zaman görür.

**QR girişi:** Bilgisayarda karekodun yanında 2 haneli bir sayı çıkar. Telefonda 3 sayıdan doğrusuna dokunmadan onay olmaz; yanlış sayı seçilirse karekod iptal olur. Size bağlantı gönderilerek hesabınıza girilmesine karşı.

**Yemek listesi sahipliği:** Çok birimli kurulumda hastanenin yemek listesini ilk yükleyen birim yönetir. Diğer birimler listeyi görür ve yalnız kendi görünürlük ayarını değiştirir. Yöneten birim, yemek ayarlarından "Liste yönetimini bırak" ile listeyi devredebilir.

**Güvenlik:**
- Şifre değişince diğer tüm cihazlardaki oturumlar kapanır; sıfırlanınca hepsi kapanır.
- Geçici şifreyle giren kişi şifresini değiştirmeden uygulamayı kullanamaz.
- Giriş denemeleri hesap başına da sınırlıdır. E-postanın kayıtlı olup olmadığı yanıttan anlaşılmaz.
- Davetsiz kayıt IP başına saatte 20 ile sınırlıdır.
- Nöbet listesi ve mesaj / hastane belgesi dosyaları rol yetkisine göre indirilir.
- Ortak bilgisayardaki (tarayıcı kapanınca biten) oturumda kişisel önbellek kalıcı tutulmaz.
- HTTPS'te HSTS açıktır.

## 28. 24 saatlik nöbetin gündüzünü / gecesini ayrı verme (4.14)

24 saatlik (08-08) nöbetin tamamı yerine yalnız **gündüzü (08-16)** ya da yalnız **gecesi (16-08)** de verilip alınabilir. Kalan kısım nöbet sahibinde kalır; o gün boşalmadığı için uzun boşluk kuralı etkilenmez.

**Nerede seçilir:**
- **Değiş / Devret** penceresinin Devret sekmesinde: Tümü / Yalnız gündüz / Yalnız gece.
- **Nöbetini ilana koy** penceresinde (Devret).
- **Ekstra nöbet › Nöbet devral** sayfasında. 24 saatlik nöbetlerde "Tümünü iste", "Gündüzü 08-16" ve "Gecesi 16-08" düğmeleri çıkar. Gündüz / Gece süzgeci, alınabilir parçası olan 24 saatlik nöbetleri de gösterir.

**Kurallar:** Alan kişi için dinlenme ve üst üste çalışma süresi parçaya göre denetlenir. Alanın o gün tamamlayan parçası varsa (ör. kendisi 08-16, gecesini alıyor) iki parça 24 saate birleşir.

**Excel'e işleme:** Sorumluya "Excel'e işlenecek" olarak hangi parçanın kime geçtiği yazılır (ör. "8 8, yalnız gündüz 08-16"). Excel'de veren 16-08 (ya da 08-16), alan diğer parça olarak güncellenince istek kendiliğinden "listeye işlendi" olur.

**Excel görüntüleyicide "Sadece ben":** Ad artık kelime kelime ve sırasıyla eşleşir. Adı benzeyen başka kişiler (ör. ad ve soyadı yer değiştirmiş biri ya da adının içinde sizin adınız geçen biri) artık sizin satırınız sayılmaz.

**4.14.1 görünüm düzeltmeleri:**
- Telefonda birden çok düğmesi olan satırlarda (ör. Nöbet devral) düğmeler yazının altına iner; yazı tam genişlikte kalır, kelimeler alt alta dizilmez.
- Masaüstünde Nöbet sekmeleri (Takvimim … Excel liste) tek satıra sığmazsa alt satıra geçer.
- Yatay kayan şeritler (gün şeridi, filtreler) fare tekerleğiyle ve basılı tutup sürükleyerek kaydırılır; ince kaydırma çubuğu da görünür.
- Geliştirici için `nobetmed-dev/audit-mobil.mjs` tüm sayfaları telefonda ve masaüstünde gezip sıkışan yazıyı, yatay taşmayı ve fareyle ulaşılamayan şeritleri raporlar (test setinin sonunda çalışır).

## 29. Abonelik ve ödeme (4.15)

> **4.32.0'dan itibaren abonelik kişi başınadır** (birim başına değil). Bu bölümdeki “birim” anlatımları için güncel kurallar **§52**'dedir; ödeme yöntemleri, PayTR / iyzico / havale kurulumu aynen geçerlidir.

Tamamı **sistem yöneticisi panelinde, "Abonelik ve ödeme" sekmesinde** yönetilir. Kurulumda her şey kapalıdır; siz açana kadar hiçbir birim bir şey görmez ve kısıtlanmaz. Yalnız çok birimli (SQLite) kurulumda çalışır; tek birimli MySQL kurulumunda abonelik yoktur.

### Anahtarlar (birbirinden bağımsız)
- **Abonelik sayfası birimlere görünsün:** Birim yöneticileri Yönetim › Abonelik sayfasında paketleri görür ve isterse öder. Kimse kısıtlanmaz. Yayılma döneminde gönüllü ödemeye açmak için kullanın.
- **Ödeme zorunluluğu:** Açıkken süresi dolan birim önce *ek süre* (varsayılan 7 gün) boyunca çalışır, sonra **ücretsiz pakete** düşer. Ücretsiz paket yoksa **salt okunur** olur: görüntüleme ve ödeme açık, yazma kapalı. Paketteki modüller ve kişi sınırı uygulanır.
  - Açarken aboneliği olmayan birimler için seçim sorulur: deneme başlat / ücretsiz tanımla / dokunma.
- **Yeni birimlere otomatik deneme:** Aboneliği olmayan birim ilk açılışta deneme süresini (varsayılan 30 gün) başlatır.
- **Hatırlatmalar:** Deneme ya da abonelik bitmeden 7, 3 ve 1 gün önce ve bitince birim yöneticilerine bildirim gider; her eşik bir kez.

### Birim işlemleri ("İşlemler" düğmesi)
- **Etkinleştir:** Bir paketi 1 / 3 / 6 ay, 1 yıl ya da belirli bir tarihe kadar açar (sözleşmeli kurum, havale vb.).
- **Deneme:** İstediğiniz gün sayısıyla deneme başlatır.
- **Uzat:** Denemeye ya da aboneliğe gün ekler.
- **Diğer:** Ücretsiz tanımla (süresiz, kısıtsız; pilot birim), Askıya al, Kaydı sıfırla, not.
- **Geçmiş:** Birimin abonelik olayları ve fatura bilgileri.
- Toplu: "Aboneliği olmayan tüm birimlere deneme başlat".

### Paketler
Ad, açıklama, aylık ve yıllık fiyat (TL, KDV hariç), kişi sınırı (0 = sınırsız), açık modüller, "ücretsiz paket" ve "satışta" işaretlerinden oluşur.
- Duyurular, belgeler, kullanıcılar ve ayarlar her pakette vardır.
- Örnek paketler (Temel ücretsiz, Profesyonel, Kurumsal) ve fiyatları yalnızca başlangıç içindir; satıştan önce fiyatları kendiniz belirleyin.
- Kullanılmış paket silinmez, satıştan kaldırılır.

### Ödeme (birim yöneticisi öder)
Yönetim › Abonelik sayfasında birim yöneticisi:
1. Fatura bilgilerini girer: unvan, vergi no ya da T.C. kimlik no, adres, il, telefon, e-posta.
2. Paketi ve aylık ya da yıllık dönemi seçer.
3. Sözleşmeyi onaylar (metin girildiyse).
4. Yöntemi seçer:
   - **PayTR:** Ödeme sayfası pencere içinde açılır. PayTR'nin imzalı bildirimi gelince abonelik uzar.
   - **iyzico:** iyzico ödeme sayfasına gider ve geri döner. Sonuç iyzico'dan imzalı sorguyla doğrulanır.
   - **Havale / EFT:** Banka bilgisi ve **ödeme kodu** gösterilir; açıklamaya bu kod yazılır. Para hesaba geçince panelde Ödemeler › ilgili kayıt › "Ödeme alındı" ile onaylarsınız.

Ödemeden sonra:
- Süre, kalan deneme ya da abonelik süresinin üstüne eklenir.
- Otomatik yenileme yoktur; bitişe yakın hatırlatma gider.
- Tutar her zaman sunucuda paketten hesaplanır.
- Aynı bildirim iki kez işlenmez; eksik tutar kabul edilmez.
- Kart bilgisi sunucuya hiç gelmez.

Paneldeki Ödemeler bölümünden fatura numarası girilir ve iade edilen ödemeler işaretlenir. Paranın iadesi sağlayıcı panelinden yapılır; abonelik süresini gerekirse elle kısaltın.

### PayTR kurulumu
1. PayTR'de mağaza başvurusu yapın; onaylanınca Mağaza Paneli › Bilgi sayfasında **Mağaza no**, **Mağaza parola** ve **Mağaza gizli anahtar** yazar.
2. Mağaza Paneli › Destek & Kurulum › Ayarlar › **Bildirim URL** alanına panelde gösterilen adresi girin: `https://siteniz/odeme.php?p=paytr`.
3. Panelde PayTR'yi açın, üç bilgiyi girin, **Test modu** açıkken PayTR test kartlarıyla deneyin, sonra test modunu kapatın.

### iyzico kurulumu
1. iyzico'da üye iş yeri başvurusu yapın. Önce **sandbox** (sandbox-merchant.iyzipay.com) hesabıyla deneyin.
2. Ayarlar › Firma Ayarları'ndaki **API anahtarı** ve **Gizli anahtar**ı panele girin; deneme ortamı açıkken deneyin, sonra canlı anahtarlarla deneme ortamını kapatın.
3. Dönüş adresi (`https://siteniz/odeme.php?p=iyzico`) ödeme başlatılırken otomatik gönderilir.

### Satışa geçmeden önce
- **Sözleşme metni:** Paneldeki "Mesafeli satış sözleşmesi ve ön bilgilendirme metni" alanını doldurun. Birim yöneticisi ödeme öncesi onaylar; onay (tarih, kişi, IP) ödeme kaydına yazılır.
- **Sağlayıcıların istedikleri:** PayTR ve iyzico başvuruda sitenizde iletişim bilgisi, iade/iptal koşulları, gizlilik ve KVKK metinleri ile mesafeli satış sözleşmesi görmek ister.
- **Fatura:** e-Fatura / e-Arşiv faturayı muhasebe programınızdan kesip numarasını panele girin.
- **Sunucu:** Hostinger'da PHP **cURL** eklentisi açık olmalı; kapalıysa panel uyarır. Site **HTTPS** üzerinden yayında olmalı.
- **KVKK:** Sağlık personeli verisi için sunucunun Türkiye'de olması, VERBİS kaydı ve hastanelerle veri işleme sözleşmesi önerilir.
- **Gizli anahtarlar:** Veritabanında şifreli saklanır ve panele geri gönderilmez. Değiştirmek için yeniden yazmanız yeterli.

## 30. Birim açma başvurusu ve doğrulama (4.16)

Yeni bir birimin sorumlusu portala kendisi başvurur; **hiçbir birim sistem yöneticisi onaylamadan açılmaz.** Yalnız çok birimli (SQLite) kurulumda çalışır. Kurulumda kapalıdır.

### Açmak
1. Sistem yönetimi › **Başvurular** › **Ayarlar** › "Birim başvurularını kabul et".
2. Giriş ekranında "Biriminiz portalda yok mu? **Birim açma başvurusu**" bağlantısı görünür. Doğrudan bağlantı: `https://siteniz/#/basvuru` (Ayarlar'daki "Bağlantıyı kopyala").
3. Doğrulama kodları ve sonuç e-postaları, e-posta ayarı yapılmış bir birimin (Ayarlar › E-posta) ayarıyla gider. Hangi birimin kullanılacağını Başvurular › Ayarlar'dan seçebilirsiniz. Hiçbir birimde e-posta ayarı yoksa kod gönderilemez ve başvurular "e-posta doğrulanmadı" işaretiyle gelir. O durumda başvuranı telefonla doğrulayın.

### Sorumlu ne yapar (başvuru adımları)
1. **E-posta:** İş e-postasını yazar ve gelen 6 haneli kodu girer. Kod 10 dakika geçerlidir ve 5 hatalı denemede kilitlenir. Bu e-posta biriminin yönetici hesabı olur. Kurum e-postası (saglik.gov.tr gibi) güven işaretidir.
2. **Hastane:** Hastanesini arayıp seçer ve o hastanede portalı kullanan birimleri görür. Birimi zaten varsa yeni başvuru yerine o birimin yöneticisinden davet ister. Hastanesi listede yoksa "Hastanem listede yok" deyip hastanenin adını ve ilini yazar.
3. **Birim ve kendisi:** Birim adı, yaklaşık kişi sayısı, ad soyad, unvan, birimdeki görevi ve cep telefonu.
4. **Belge (isteğe bağlı ya da zorunlu):** Görevlendirme yazısı ya da kurum kimlik kartı (PDF, JPG ya da PNG, en fazla 3 MB). Fotoğraf telefonda küçültülür.
5. **Onaylar ve gönderim:** Beyan ve aydınlatma metni onaylanır, başvuru gönderilir. Sorumluya bir **takip bağlantısı** e-postayla gelir. Bu bağlantıdan durumu görür, istenen bilgiyi ya da belgeyi gönderir ya da başvurusunu geri çekip siler.

### Sahte birim açılmasını önleyen katmanlar
- **Elle onay:** Sistem yöneticisi onaylamadan birim açılmaz.
- **E-posta doğrulama:** Kod olmadan form açılmaz. Bir kişi yalnız bir birimde hesap açabildiği için başka birimde kayıtlı e-postayla başvuru yapılamaz. Aynı e-postayla ikinci bir bekleyen başvuru açılamaz.
- **Hastaneden teyit:** Başvurulan hastanede portalı kullanan birimlerin yöneticilerine bildirim gider. Ana sayfalarında "Bu kişiyi tanıyor musunuz?" kartı çıkar ve **Tanıyorum / Tanımıyorum** derler. Bu kartta başvuranın telefonu ve e-postası gösterilmez. Yanıtı yalnız sistem yöneticisi görür. Ayarlardan kapatılabilir.
- **Kopya birim uyarısı:** Aynı hastanede benzer adlı birim varsa başvurana uyarı çıkar ve sistem yöneticisi bunu kartta görür. Onay sırasında da ayrıca onay istenir.
- **Kötüye kullanım sınırları:**
  - Aynı internet bağlantısından saatte 12 kod ve günde 10 başvuru.
  - Aynı e-postaya saatte 4 kod.
  - Botlara görünmeyen bir tuzak alanı.
  - Geçersiz sayılan başvurunun e-postası istenirse engellenir.
- **Doğrulama düzeyi:** Her başvuru kartında bir özet görünür:
  - **Güçlü:** Doğrulanmış kurumsal e-posta ya da hastaneden "tanıyorum" yanıtı var, olumsuz işaret yok.
  - **Dikkat:** E-posta doğrulanmamış, "tanımıyorum" yanıtı var, kopya birim var ya da aynı bağlantıdan çok başvuru gelmiş.
  - **Olağan:** Diğer durumlar.
  - Zayıf başvurularda onaydan önce başvuranı ya da hastaneyi telefonla arayın.

### Sistem yöneticisi işlemleri (Başvurular sekmesi)
- **Onayla ve birimi aç:**
  - Hastane seçilir; yeni hastane gerekiyorsa açılır. Birim adı düzeltilebilir.
  - Birim açılır ve başvuran o birimin yöneticisi olur. Geçici şifre e-postayla gider (e-posta yoksa size bir kez gösterilir). İlk girişte kendi şifresini belirler.
  - Abonelikte "yeni birimlere otomatik deneme" açıksa deneme kendiliğinden başlar.
- **Bilgi iste:** Mesajınız başvurana e-postayla gider. Başvuran takip bağlantısından yanıt ve belge gönderir, başvuru yeniden "incelemede" olur. 60 gün yanıt gelmezse başvuru kapanır.
- **Reddet:** Gerekçe başvurana e-postayla gider ve durum sayfasında görünür.
- **Geçersiz:** Sahte ya da anlamsız başvurular için. E-posta gitmez; istenirse o adres bir daha başvuramaz.
- **Diğer:** Yeniden aç, iç not, kalıcı sil. Her işlem sistem günlüğüne yazılır.

### KVKK
- Belge sunucuda **şifreli** saklanır. Yalnız sistem yöneticisi açabilir. Karar verilince silinir.
- Reddedilen ya da geçersiz sayılan başvurular 90 gün sonra silinir. Onaylanan başvuruların telefon ve not gibi iletişim ayrıntıları 1 yıl sonra temizlenir.
- Başvuran takip bağlantısından başvurusunu istediği an geri çekip silebilir.
- Aydınlatma metni formda gösterilir ve onaylatılır. Kendi aydınlatma metniniz varsa ona da başvuru verilerini (amaç, saklama süresi, aktarım: aynı hastanedeki birim yöneticilerine ad, unvan ve birim adı) ekleyin.

## 31. Tanıtım sayfası, yasal sayfalar, KVKK ve sunucu dışı yedek (4.17)

Hepsi kurulumda kapalıdır. Çok birimli kurulumda **Sistem yönetimi › Site ve yedek** sekmesinden, tek birimli (MySQL) kurulumda **Yönetim › Ayarlar › Tanıtım ve yasal metinler** kartından yönetilir.

### Künye ve yasal metinler
1. **Künye:** Hizmeti sunan kişinin ya da şirketin bilgilerini doldurun: unvan, adres, vergi dairesi ve numarası, e-posta, telefon, barındırma sağlayıcısı (sunucu konumuyla), yetkili mahkeme. MERSİS ve KEP isteğe bağlıdır.
2. **Metinler:** Beş metin hazır taslak olarak gelir: KVKK Aydınlatma Metni, Gizlilik ve Çerez Politikası, Kullanım Koşulları, Mesafeli Hizmet Sözleşmesi, İptal ve İade Koşulları.
   - Yer tutucular (`{UNVAN}`, `{EPOSTA}` …) künyeden doldurulur. Boş kalan zorunlu bilgi metinde sarı `[…]` olarak görünür.
   - **Bu metinler genel taslaktır. Yayımlamadan önce bir avukata ya da KVKK danışmanına kontrol ettirin.** Özellikle iade süresi (taslakta 14 gün) bir işletme kararıdır.
   - Biçim: `## ` başlık, `- ` madde, `**kalın**`. "Taslağa döndür" özel değişikliği siler.
3. **Yayımla:** "Tanıtım ve yasal sayfaları yayımla" açılınca sayfalar herkese açılır:
   - Tanıtım: `https://siteniz/tanitim.php`
   - Yasal: `https://siteniz/yasal.php?s=kvkk`; diğerleri `s=gizlilik`, `s=kosullar`, `s=satis`, `s=iade`
   - Giriş ve kayıt ekranının altında bu sayfaların bağlantıları görünür. Başvuru formunda aydınlatma metni bağlantısı çıkar.
4. **PayTR / iyzico başvurusu:** Mağaza başvurusunda site adresi olarak tanıtım sayfasını, istenen sözleşme ve politika adresleri olarak yukarıdaki yasal sayfaları verin. İletişim bilgileri sayfaların altında künye olarak görünür.

### Tanıtım sayfası
- Sayfa görsellidir: üstte telefon görünümü, ardından sekiz özellik bölümü. Bölümler nöbet listeleri, değişim/devir, eksik personel, çizelge, mesajlaşma, duyuru ve protokoller, yemek ve rehber, bildirimler. Her bölümde uygulamanın arayüzünü gösteren bir çizim vardır.
- Ardından **Neden dupcii?** gelir: “alışılmış yol / dupcii ile” karşılaştırması; nöbet listesi, değişim, eksik personel, iletişim, duyuru, Türkiye’deki nöbet düzeni, hastane ölçeği ve kurulum başlıklarında. Rakip adı geçmez.
- Sonra roller (personel, sorumlu, hastane idaresi), güvenlik ve KVKK, nasıl başlanır, fiyatlar ve sık sorulanlar gelir.
- Görseller ekran görüntüsü değil, kodla çizilmiştir: paket küçük kalır, her ekranda net görünür. İçlerindeki adlar uydurmadır.
- Başlık ve alt metin değiştirilebilir; özellikler hazır gelir.
- "Biriminizi açın" düğmesi ve "Nasıl başlanır" bölümü yalnız birim başvurusu açıkken görünür.
- Fiyatlar yalnız "Abonelik sayfası birimlere görünsün" açıkken görünür.
- Sayfa arama motorlarına kapalıdır; bağlantı paylaşarak kullanılır.

### Aydınlatma metni bildirimi (KVKK)
- "Kullanıcılardan aydınlatma metnini okumalarını iste" açıkken her kullanıcı girişte metni görür ve "Okudum, bilgilendirildim" der. Tarih ve metnin sürümü kaydedilir.
- Metin ya da künye değişince sürüm değişir ve herkese yeniden gösterilir.

### Hesabım › Verilerim (KVKK md. 11)
- **Verilerimi indir:** Kişi kendi verisinin kopyasını tek bir dosya (JSON) olarak indirir. İçinde hesap, oturumlar, bildirimler, nöbet satırları, istekler, değişimler, ilanlar, gönderdiği mesajlar ve okuma kayıtları vardır. Şifre özeti ve güvenlik anahtarları dosyaya girmez.
- **Silme talebi:** Kişi hesabının silinmesini ister. Birim yöneticilerine bildirim gider ve Kullanıcılar listesinde **"Silme talebi"** rozeti çıkar. Yönetici kişiyi silerek talebi sonuçlandırır.
  - 20 gün dolunca yöneticiye hatırlatma gider. Yasal süre 30 gündür.
  - Kişi talebini geri alabilir.
  - Nöbet listelerindeki ad biriminizin resmi kaydı olduğu için listelerden çıkarılmaz.

### Sunucu dışı yedek (yalnız çok birimli kurulum)
Birim içindeki haftalık yedekler aynı sunucuda durur. Hosting hesabına bir şey olursa onlar da gider. Sunucu dışı yedek bu riski kapatır.

**Kurulum (Sistem yönetimi › Site ve yedek › Sunucu dışı yedek):**
1. Yedeklerin gideceği e-postayı yazın. Kurum dışı, sizin her zaman erişeceğiniz bir adres seçin.
2. En az 10 karakterlik bir **yedek şifresi** belirleyin. Şifreyi bir yere not edin: şifre olmadan yedek açılamaz ve e-postayla gönderilmez.
3. Günü seçin, "Haftalık yedek gönder"i açıp kaydedin. "Şimdi gönder" ile hemen deneyin.
4. Yedek e-postası, e-posta ayarı yapılmış bir birimin ayarıyla gider (bkz. 30. bölüm, başvuru e-postaları).

**Yedeğin içeriği:**
- Merkez, tüm birimler ve hastane ortak veritabanları tek bir AES-256 şifreli ZIP dosyasında.
- Yüklenen belge ve fotoğraflar eklenmez; onlar için Hostinger'ın kendi yedeğini kullanın.
- Dosya e-posta ek sınırını (varsayılan 20 MB) aşarsa gönderilmez; panelden **İndir** ile alınır.
- Sunucuda PHP zip eklentisi şifreli ZIP desteklemiyorsa panel uyarır.

**Açma:** Windows'ta 7-Zip ya da WinRAR, Mac'te Keka ya da The Unarchiver ile yedek şifresi girilerek. Windows'un kendi "Tümünü ayıkla"sı bu şifrelemeyi açamaz.

**Geri yükleme:** Her veritabanı dosyası, sunucudaki karşılığının **yerine ve onun adıyla** konur. Böylece sitenin dosya adı kayıtları (`.name.php`, `.dbname.php`) değişmeden kalır.
1. Yeni sunucuysa paketi kurup siteyi bir kez açın.
2. **Merkez:** `data/merkez/m-….sqlite` dosyasının yerine yedekteki `merkez/` dosyasını aynı adla koyun.
3. Merkez yerine konduktan sonra birimler sistem yönetiminde görünür. Her birimin giriş bağlantısını bir kez açın; böylece `data/b/<anahtar>/` klasörü oluşur.
4. **Birimler:** Yedekteki `birimler/<hastane>--<birim>--<anahtar>/` dosyası şu dosyanın yerine, aynı adla konur:
   - ilk kurulum birimi için `data/nm-….sqlite`,
   - diğer birimler için `data/b/<anahtar>/nm-….sqlite`.
5. **Hastaneler:** Yedekteki `hastaneler/<no>/` dosyası `data/h/<no>/h-….sqlite` dosyasının yerine, aynı adla konur.
6. Varsa yanındaki `-wal` ve `-shm` dosyalarını silin.

Emin değilseniz geri yüklemeyi destek alarak yapın.

### Canlıya almadan önce sizin yapmanız gerekenler
- **Cron:** Hostinger › Gelişmiş › Cron İşleri bölümünde 5 dakikada bir `cron.php` çalıştırın (bkz. 13. bölüm). Yoksa haftalık yedek, hatırlatmalar ve başvuru bildirimleri yalnız biri siteye girdiğinde çalışır.
- **E-posta teslimi (SPF / DKIM / DMARC):** Hostinger › E-postalar › alan adınız › DNS kayıtlarında SPF ve DKIM'in "etkin" olduğundan emin olun. DMARC için `v=DMARC1; p=none;` kaydı ekleyin. Bunlar yoksa doğrulama kodları ve giriş bilgileri spam klasörüne düşer.

## 32. Sistem sağlığı (4.18)

Canlıya geçmeden önce ve sorun çıktığında ilk bakılacak yer. Çok birimli kurulumda **Sistem yönetimi › Sistem sağlığı**, tek birimli kurulumda **Yönetim › Ayarlar › Sistem sağlığı › Denetle**.

Her madde **yeşil** (tamam), **sarı** (öneri), **kırmızı** (düzeltilmeli) ya da **gri** (bilgi) görünür; sarı ve kırmızıların altında nasıl düzeltileceği yazar. Panel hiçbir ayarı değiştirmez, yalnız okur.

- **Sunucu:**
  - PHP sürümü ve eklentileri, HTTPS
  - Dosya yükleme ve bellek sınırları, disk kullanımı
  - Klasör yazma izinleri, korumalı klasörler (.htaccess)
  - Veritabanı sürümü, saat dilimi
- **Zamanlanmış görevler:** Cron'un ve arka plan görevlerinin son çalışma zamanı. Cron 20 dakikadır çalışmadıysa kırmızı olur.
- **E-posta:**
  - Ayar var mı, son gönderim ne zaman, son 7 günde gönderilemeyenler.
  - Gönderen alan adının **SPF**, **DKIM** ve **DMARC** kayıtları, sunucunun DNS sorgusuyla.
  - **Deneme e-postası** düğmesi sistem yöneticisinin adresine e-posta gönderir. Gelen kutusuna mı, spam'e mi düştüğüne bakın.
- **Yedek:** Sunucu dışı yedeğin durumu ve son başarılı yedek; haftalık iç yedek.
- **Güvenlik:** config.php'de ilk yönetici bilgileri kalmış mı, hatalar ziyaretçiye gösteriliyor mu, sistem yönetimi hesabında iki adımlı doğrulama.
- **Yayın ve satış:**
  - Yasal sayfalar yayında mı, künye eksik mi.
  - Başvuru formu açıksa e-posta kodu gidebiliyor mu.
  - Ödeme yöntemleri açık mı, test modunda mı, cURL var mı.
- **Birimler:** Yöneticisi olmayan birimler; 30 gündür kimsenin girmediği birimler.
- **Sunucu hataları:** PHP hata günlüğünden (Hostinger'da genelde `public_html/error_log`) son 7 günün satırları. Sunucu yolları gizlenir. Sorun bildirirken bu satırları iletin.

## 33. Duyuru bandı, bağlantı paylaşma ve sohbette paylaşma (4.20)

### Duyuru bandı (Ayarlar › Genel › Duyuru bandı)
- **Metin:** En fazla 600 karakter. **Bağlantı ekle** düğmesi metindeki seçili kelimeye site içi bir sayfa (menüdeki sayfalardan seçilir) ya da bir web adresi verir. Metinde `[yazı](adres)` olarak görünür; okuyana yalnız yazı bağlantı olarak çıkar.
- **Renk:** Kırmızı (acil), turuncu (uyarı), mavi (bilgi), yeşil (olumlu), mor (duyuru).
- **Düğme:** İsteğe bağlı bir yazı ve bağlantı (ör. "Ayrıntılar" → bir gönderi ya da sayfa). Bağlantı listeden seçilebilir ya da yazılabilir; yalnız site içi (`#/…`) ve `https://` adresleri kabul edilir.
- **Başlangıç / bitiş:** Band yalnız bu aralıkta görünür. Boş bırakılırsa hemen başlar, siz kapatana kadar sürer.
- **Kimler görsün:** Herkes ya da yalnız yöneticiler ve yayıncılar.
- **Kapatma:**
  - Kapatılabilir; sayfa yenilenince yine görünür.
  - Kapatılabilir; duyuru değişene kadar görünmez.
  - Kapatılamaz (sabit).
- **Önizleme:** Yazarken bandın nasıl görüneceği hemen altında gösterilir.

### Sayfa bağlantısını paylaşma
- Her sayfanın başlığının yanında **Paylaş** düğmesi vardır. Pencerede sayfanın bağlantısı, **Bağlantıyı kopyala**, telefonun **Paylaş…** menüsü, **WhatsApp** ve **Sohbette paylaş** seçenekleri bulunur.
- Bağlantıyı açan kişi giriş yapmışsa doğrudan o sayfaya gelir; giriş yapmamışsa önce giriş ekranı açılır. Çok birimli kurulumda bağlantı birimin anahtarını taşır.
- Site içi bağlantılar (bant, gönderi, sohbet) uygulamanın içinde, aynı sekmede açılır. Sohbette tam adres yerine sayfanın adıyla (ör. "Takvimim") görünür.
- **Gönderi yazarken** de **Bağlantı ekle** ile seçili kelimeye bağlantı verilebilir.

### Taraf görselini sohbette paylaşma
- Taraf listesinde **Paylaş** penceresinde **Sohbette paylaş** düğmesi vardır. Oluşan görsel, seçilen sohbete (birim grubu, özel grup ya da kişi) resim olarak gider; not eklenebilir.
- WhatsApp'ta paylaşma, indirme ve metin olarak kopyalama aynen duruyor.

## 34. Basamak / liste ayrımı olmadan nöbet istekleri (4.21)

Bazı birimlerde kişiler ay ay farklı listede (ör. bir ay 2. basamak, bir ay 3. basamak) çalışır. İstekler toplanırken o ayın listesi henüz belli değildir; herkes isteğini yalnız aya yazar, sorumlu listeyi hazırlarken istekleri ilgili basamağa yerleştirir.

- **Dönem açarken** (Nöbet › İstekler › Dönem aç) **"Basamak / liste ayrımı yapma"** seçeneğini açın.
  - Üyeye liste sorulmaz; ekranında "İstekler tüm birim için toplanır" yazar.
  - Yönetim panelinde tüm birim tek grup ("Tüm birim") görünür. Kişi sayısı bütün listelerdeki kişilerin birleşimidir; gereken kişi sayıları tarafların toplamından hesaplanır.
  - Panoda ve kişi tablosunda liste adı gösterilmez.
- Seçim hatırlanır: bir kez açınca sonraki dönemlerde açık gelir. Açık bir dönemi **Düzenle** ile sonradan da bu şekle çevirebilirsiniz; girilmiş istekler korunur.
- Kişilerin hep aynı listede çalıştığı birimlerde seçeneği kapalı bırakın; istekler eskisi gibi listeye / tarafa göre ayrılır.

## 35. Bağlantı önizlemesi, sayfa listesi ve rol gözünden görme (4.22)

**WhatsApp / Telegram önizlemesi.** Sitenin bağlantısı paylaşılınca artık düz adres yerine dupcii logolu büyük bir kart çıkar (başlık, kısa açıklama, görsel). Bağlantıda birim belliyse başlıkta birimin adı yazar. Tanıtım ve yasal sayfalar da aynı kartı verir.
- Görsel: `assets/og-image.jpg` (1200 × 630). Kendi görselinizi kullanmak isterseniz aynı ad ve boyutta değiştirebilirsiniz (300 KB'tan küçük olsun).
- `robots.txt` arama motorlarına kapalı kalır; yalnız önizleme botlarına (WhatsApp, Facebook, Telegram, X, LinkedIn, Slack, Discord) izin verir. Giriş gerektiren içerik önizlemede görünmez.
- WhatsApp önizlemeyi bir süre önbellekte tutar: daha önce paylaşılmış bir bağlantı eski (düz) haliyle görünebilir. Denemek için adresin sonuna `?v=2` gibi bir ek koyun.
- Önizleme görselinin görünmesi için sitenin HTTPS ile açılması önerilir (Hostinger › SSL).

**Bağlantı ekle › Site içi sayfa.** Liste artık gruplu: Genel, Nöbet (Takvimim, Kim nöbette, Taraf listesi, İstekler, İlanlar, Ekstra nöbet, Çizelge, Excel liste ve nöbet listeleri), Bölümler, Yönetim ve Hesabım sekmeleri. Duyuru bandındaki düğme bağlantısı da aynı listeyi kullanır.

**Başka rolün gözünden gör (yönetici).** Sol alttaki adınıza tıklayın › **Başka rolün gözünden gör** › Yayıncı (sorumlu), Üye ya da birime özel bir rol seçin.
- Kimsenin hesabına girilmez; kendi hesabınızla, seçtiğiniz rolün menülerini ve sayfalarını görürsünüz.
- Önizleme **salt okunurdur**: gönderi, ilan, istek, ayar gibi değişiklikler bu sırada yapılamaz (yanlışlıkla üye adına işlem yapılmasın).
- Üstteki mor bant hangi rolün gözünden baktığınızı gösterir; **Rolü değiştir** ile başka role geçer, **Çık** ile kendi görünümünüze dönersiniz.
- Önizleme yalnız o tarayıcı oturumunda geçerlidir (telefonunuzdaki oturum etkilenmez); çıkış yapınca biter. İşlem günlüğüne “viewas” olarak yazılır.

## 36. Destek (4.23)

Herkes uygulamanın içinden destek talebi açabilir. Talep, konusuna göre doğru kişiye gider ve kişinin hangi hastane, birim ve rolden yazdığı kendiliğinden eklenir.

**Nereden açılır**
- Sol menüde **Destek** (telefonda menü düğmesiyle açılır). Yanıt gelince yanında sayı çıkar. Üst çubukta ayrıca düğme yoktur (4.27).
- Sol menüde **Destek**, adınıza tıklayınca açılan menüde **Destek**.
- Giriş ekranında **Giriş yapamıyorum**: hesabına giremeyen kişi ad, e-posta ve sorununu yazar. Yanıt e-postasına gelir; e-postadaki bağlantıdan yazışmayı izleyip yanıtlayabilir.

**İki ayrı yol**
- **Sorumlu desteği** (birim yöneticisi ve yayıncılar): kurulum ve ayarlar, Excel / nöbet listesi yükleme, kullanıcılar ve yetkiler, abonelik ve ödeme, hata, öneri. Hepsi doğrudan **sistem yöneticisine (dupcii destek)** gider.
- **Kullanıcı desteği** (üyeler), konuya göre ayrılır:
  - Birim konuları (“Nöbetim görünmüyor”, “İzin, istek, ilan ve değişimler”, “Diğer”) önce **birim sorumlusuna** gider. Sorumlu çözemezse **Destek ekibine ilet** ile tek tuşla sistem yöneticisine geçirir.
  - Teknik konular (giriş ve şifre, bildirim / e-posta, uygulama hatası, öneri) doğrudan **sistem yöneticisine** gider.
- Konu seçilince önce kısa hazır çözümler gösterilir. Çoğu soru form gönderilmeden çözülür; çözülmezse “Yine de yazmak istiyorum”.
- **Sık sorulanlar · Ne nereden yapılır** (Destek sayfasının başında, aranabilir): hesap, uygulama, nöbet, değişim, istek, mesaj, sorumlu işleri, birim yönetimi.
- **Herkes yalnız kendi yetkisiyle (ve altındaki yetkilerle) yapabileceklerini görür (4.25):**
  - Üye kendi hesabını, nöbetini ve değişimlerini görür.
  - Yayıncı ya da birime özel rolü olan kişi, bunlara ek olarak yalnız **yönettiği modüllerin** işlerini görür (ör. yalnız “İstekler: yönetir” ise istek dönemi açma).
  - Birim yöneticisi bunlara ek olarak birim yönetimini görür.
  - Sunucu işleri (cron, güncelleme, sistem sağlığı) çok birimli kurulumda yalnız sistem yöneticisinindir; birimlere gösterilmez. Tek birimli kurulumda birim yöneticisi görür.
  - Kapalı modüllerin maddeleri hiç görünmez.
  - Konular da aynı kurala uyar: “Birim ayarları” ve “Kullanıcılar” yalnız yöneticide, “Excel / nöbet listesi yükleme” yalnız listeyi yönetende, “Abonelik” yalnız abonelik açıksa görünür.
  - “Başka rolün gözünden gör” ile o rolün gördüğü maddeleri görebilirsiniz.

**Talebe kendiliğinden eklenenler** (kişi formda görebilir): hastane › birim, ad ve e-posta, rol (Yönetici / Yayıncı / Üye), birime özel rolün adı ve yönettiği modüller, talebin açıldığı sayfa, uygulama sürümü, cihaz / tarayıcı, varsa son hata.

**Birim sorumlusu** (yönetici ve yayıncılar): Destek › **Birim talepleri** sekmesi. Yanıtla, yanıtla ve kapat, talebi kapat, destek ekibine ilet. Yayıncıların kendi sorumlu talepleri birim yöneticisine düşmez, doğrudan sistem yöneticisine gider.

**Sistem yöneticisi:** Sistem yönetimi › **Destek** sekmesi (bekleyen sayısı sekmede yazar).
- Süzgeçler: yanıt bekleyen / yanıtlanan / birimde / kapanan; hastane, birim, sorumlu / kullanıcı / giriş yapamayan; arama.
- Her talepte kişi ve bağlam kartı; yanıt kişiye **“dupcii destek”** adıyla gider (uygulama içi bildirim ve e-posta).
- **İç not** yalnız sistem yöneticilerine görünür.
- **Hazır yanıtlar** (`{ad}` kişinin adıyla değişir). Birim konusu olan bir üye talebini **Birim sorumlusuna aktar**. Kapat / yeniden aç / sil (spam).
- Yeni talep ve yanıtlar sistem yöneticisinin e-postasına gelir. Bunun için en az bir birimde e-posta ayarlı olmalı (bkz. §4).

**Tek birimli (MySQL) kurulum:** sistem yöneticisi yoktur. Bütün talepler (üyelerinki, yayıncılarınki, giriş yapamayanlarınki) birim yöneticisine gelir; birim yöneticisi kendine talep açmaz.

**KVKK**
- T.C. kimlik numarası içeren mesaj gönderilemez. Formda hasta ve kişisel bilgi uyarısı vardır.
- Ekran görüntüleri şifreli saklanır; yalnız talebin sahibi, ilgili sorumlu ve sistem yöneticisi açabilir.
- Kapanan talepler 1 yıl, giriş yapamayanların talepleri 6 ay sonra kendiliğinden silinir. Talepler **Verilerim › indir** dosyasında da yer alır.
- Aydınlatma metni taslağına destek talepleri eklendi. Metni kendi metninizle değiştirmediyseniz kişilerden yeniden onay istenir.

## 37. Güncelleme sırasında işler yarıda kalmasın (4.24)

**Uygulama içinden güncelleme** (önerilen). Çok birimli kurulumda Sistem yönetimi › Site ve yedek › **Güncelleme**; tek birimli kurulumda Ayarlar › Genel › **Güncelleme**.
1. **Güncelleme paketini seç**: yeni `dupcii-hostinger.zip`. Paket önce denetlenir:
   - dupcii paketi mi, sürümü ne;
   - kaç dosya değişecek, kaç dosya yeni;
   - PHP dosyalarında bozukluk var mı.
   Bozuk ya da eksik paket siteye hiç dokunmaz.
2. **Güncellemeyi uygula**: dosyalar ara klasörden birkaç saniyede yerine konur.
   - Bu kısa sürede gelen istekler işlenmez. Kişinin ekranında “Site güncelleniyor… işleminiz birkaç saniye içinde kendiliğinden tamamlanacak” şeridi çıkar ve aynı istek kendiliğinden yeniden gönderilir.
   - Kayıt kaybolmaz, iki kez de yazılmaz. Dosya yüklemeleri de kaldığı yerden devam eder.
   - `data/`, `uploads/` ve `config.php` hiç değişmez.
3. **Geri al**: sorun çıkarsa son güncellemede değişen dosyalar eski hâline döner. Son iki güncellemenin geri alması saklanır.

**Açık sayfalar ve yarım kalan işler**
- Yeni sürüm kişi bir şey yazarken yüklenmez. Ekranda “Yeni sürüm hazır” notu çıkar.
- Sayfa yeni sürüme, kişi başka sayfaya geçerken ya da uygulama arka plandayken geçer. Bu da yalnız kaydedilmemiş yazı ya da açık pencere yoksa olur.
- Kişi **Şimdi yükle**'ye basarsa açık sayfa, açık pencere (ör. duyuru yazma) ve formlara yazılanlar saklanır; yenilenince geri konur.
- Duyuru taslakları ve sohbet taslakları zaten ayrıca saklanır.

**Dosya yöneticisiyle (elle) güncelleme.** PHP'de “zip” eklentisi yoksa ya da dosyalar PHP tarafından yazılamıyorsa bu yol kullanılır.
1. Önce Güncelleme bölümünden **Bakım modu**nu açın (5–60 dakika).
2. Bakım modunda kişilerin işlemleri bekletilir; ekranlarında “Site kısa bir bakımda… sayfayı kapatmayın” yazar.
3. Zip'i üzerine yazarak çıkartın (bkz. §1).
4. Bitince **Bakım modunu kapat**. Bekleyen işlemler kendiliğinden tamamlanır. Süre dolunca bakım modu kendiliğinden kapanır.
- Bakım modu açıkken yönetim paneli çalışır.
- Bakım modunu açmadan elle güncellerseniz de, dosyalar karışık olduğu için işlem başlamadan oluşan hatalarda istekler kendiliğinden yeniden denenir. Yine de bakım modu daha güvenlidir.
- Zamanlanmış görevler (cron) bakım ve güncelleme sırasında bekler, bir sonraki çalıştırmada yapılır.

## 38. Nöbetler telefon takviminde, liste güncellendikçe kendiliğinden (4.26)

Nöbet › Takvimim › **Telefon takvimine ekle**. Her kişinin kendine özel, gizli bir takvim bağlantısı vardır. Takvim uygulaması bu bağlantıyı düzenli olarak yeniden okur.
- **iPhone / iPad / Mac Takvim’e ekle**: takvim uygulaması “Abone ol” diye sorar, onaylayın.
- **Google Takvim’e ekle (Android)**: Google Takvim açılır, “Ekle” deyin. Telefonda görünmesi için Google Takvim uygulamasında bu takvimin eşitlemesi açık olmalı (Ayarlar › takvimin adı › Eşitle).
- **Outlook’a ekle**, ya da bağlantıyı kopyalayıp başka bir takvim uygulamasına “internetten takvim ekle / abone ol” ile ekleyin.

**Kendiliğinden güncellenir**
- Yeni ayın listesi yüklenince, liste değişince, değişim ve devirler Excel’e işlenince telefondaki nöbetler de değişir; listeden çıkan nöbet takvimden düşer.
- iPhone genellikle 15 dakika–1 saatte, Google Takvim birkaç saatte bir yeniler. Bu sıklığı takvim uygulaması belirler.
- Takvimde geçen ayın başından 4 ay ilerisine kadar nöbetler bulunur (Takvimim ile aynı).

**Gizlilik**
- Bağlantı kişiye özeldir ve giriş istemez; kimseyle paylaşılmamalıdır. Paylaşıldıysa **Bağlantıyı yenile**: eskisi hemen çalışmaz, takvime yeni bağlantı eklenir.
- **Aboneliği kapat** ile bağlantı iptal edilir.
- Hesap devre dışı bırakılırsa ya da nöbet modülü kapatılırsa takvim de güncellenmez.
- Google Takvim ve Outlook yalnız **HTTPS** adresleri ekler; sitenizde SSL açık olmalı (Hostinger › SSL).

Eski yöntem (tek seferlik **Dosya olarak indir**) aynı pencerede durur, ama o dosya sonradan güncellenmez.

## 39. Kullanıcılar: sıralama, süzgeçler, çevrimiçi durum (4.27)

Yönetim › **Kullanıcılar** sayfasında:
- **Sıralama**: ada göre (A–Z / Z–A), çevrimiçi olanlar önce, son görülme (yeniden eskiye / eskiden yeniye), kayıt tarihi, yetkiye göre.
- **Süzgeçler**:
  - etkinlik: şu an çevrimiçi, bugün girenler, son 7 günde girenler, 30 günden uzun girmeyenler, hiç girmeyenler;
  - yetki: yönetici, yayıncı, üye, birime özel roller;
  - durum: onay bekleyen, aktif, pasif.
- Seçimleriniz bu cihazda hatırlanır.

**Şu an çevrimiçi** (sayfanın başında, 10 saniyede bir kendiliğinden yenilenir)
- **Çevrimiçi**: portal son 1,5 dakikada açıktı. **Arka planda**: sekme ya da uygulama arkada. Diğerleri için “son görülme”. Telefon / bilgisayar bilgisi de yazar.
- Kişinin şu an hangi **bölümde** olduğu yazar, ör. “Mesajlar”, “Nöbet › Takvimim”, “Hesabım › Güvenlik”.

**KVKK**
- Açık bölüm yalnız bölüm adıdır: hangi sohbetin, hangi gönderinin açık olduğu ya da içerik gönderilmez.
- Yalnız birim yöneticisi görür, geçmişi tutulmaz (kişi başına yalnız son durum). Çıkış yapınca silinir, 1 günden eskiler kendiliğinden temizlenir.
- Bölüm gösterimini **Ayarlar › Güvenlik › Çevrimiçi durum**dan kapatabilirsiniz; o zaman yalnız çevrimiçi / son görülme görünür.
- Aydınlatma metni taslağına bu bilgi eklendi. Kendi metninizi kullanıyorsanız benzer bir cümle eklemeniz önerilir. Taslağı kullanıyorsanız kişilerden bir kez yeniden onay istenir.

## 40. Mesajlar: her mesajda tik, açılışta son mesaj, yazma kutusu hep ekranda (4.27)

- **Tikler** (kendi mesajlarınızda, hepsinde):
  - tek gri ✓ gönderildi;
  - çift gri ✓✓ karşı tarafın uygulamasına ulaştı (uygulamayı açtığında, sohbete girmese de);
  - mavi ✓✓ okundu.
- **Gruplarda:** çift gri herkese ulaşınca, mavi herkes okuyunca çıkar. Son mesajınızın yanında okuyan sayısı yazar; mesaja dokunup “Okuyanlar”dan kimin okuduğunu görürsünüz.
- **Gizlilik:** okundu bilgisini kapatan kişi başkalarının okuduğunu da göremez. Birebirde karşı taraf kapattıysa mavi çıkmaz, en fazla çift gri görünür.
- **Sohbet açılınca** en yeni mesaj görünür; okunmamış mesaj ayıracı yerinde durur. Fotoğraf ve ekler sonradan yüklense de sohbet en altta kalır; siz yukarı kaydırdıysanız yeriniz korunur.
- **Yazma kutusu her zaman ekranda kalır:** üstte duyuru bandı varken de, duyuru paylaştıktan sonra da, telefonda klavye açıkken de. Bant açılıp kapanınca sohbet ekranı kendiliğinden yeniden sığar.

## 41. Sohbet görünümü, temalar ve iletme (4.28)

**İlet ve sohbette paylaş**
- Açılan pencerede arama kutusu vardır; yalnız var olan sohbetler değil, biriminizdeki ve size izin verilen diğer birimlerdeki **tüm kişiler** adıyla aranır.
- Birden çok sohbet ya da kişi seçilebilir (seçilenler üstte çip olarak görünür).
- Kişiyle henüz sohbetiniz yoksa kendiliğinden açılır.

**Sohbet listesi**
- Aralıklı, renkli kartlar. Okunmamış sohbetler renkli bir çizgi ve sayıyla öne çıkar.
- Üstteki “Birim grubu, gruplar ve birebir sohbetler” yazısı kaldırıldı.
- Arama kutusuna kişi adı yazınca sohbetiniz olmayan kişiler de çıkar; dokununca yeni sohbet açılır.

**Görünüm** (Mesajlar’da 🎨 düğmesi ya da Mesaj ayarları › Tema). Bu cihazda saklanır, başkalarının ekranını değiştirmez:
- **Renk teması**: Deniz, Gece, Gül, Zümrüt, Gün batımı, Lavanta, Sade.
- **Balon biçimi**: Yumuşak (renk geçişli), Balon (yuvarlak), Kart (gölgeli), Çizgi (sade).
- **Duvar kağıdı**: sohbet ve sohbet listesi için ayrı ayrı. Düz, Renk geçişi, Noktalar, Dalgalar, Sağlık, Geometri, Kâğıt, Gece.
- Pencerede canlı önizleme vardır.

**Efektler ve kaydırma**
- Yeni gelen mesaj yumuşakça belirir, liste kartları sırayla gelir, okunmamış sayısı belirirken hafifçe büyür.
- Telefonda “hareketi azalt” açıksa efektler kapanır.
- Mesajı sağa kaydırarak yanıtlarken ekran artık yana kaymaz.

## 42. Geri tuşu, hız ve güvenlik düzeltmeleri (4.29)

**Hız**
- Sohbetteki animasyonlar ve efektler kaldırıldı (kartların sırayla belirmesi, mesaj balonu açılma efekti, rozet büyümesi, gölgeler, geçişler). Liste ve mesajlar beklemeden görünür.
- Üst çubuk, alt menü, pencere arka planı, bildirim kartı ve sohbet kartlarındaki “buzlu cam” bulanıklığı kaldırıldı: telefonda kaydırma akıcı.
- Sunucu: yalnız okuyan isteklerde oturum kilidi hemen bırakılır. Önceden aynı kişinin aynı anda giden istekleri (ana sayfada ~10, sohbet açılışında 3) sunucuda tek tek sırayla bekliyordu; artık paralel işlenir.
- Açılış verisi, uygulama dosyaları yüklenirken paralel istenir (bir gidiş-dönüş kazanılır); Google yazı tipi sayfanın çizilmesini bekletmez.
- Ana sayfada aynı nöbet bilgisi iki kez istenmez.
- Ölçüm (yavaş telefon benzetimi): ana sayfa ~%25, Nöbetim ~%20, Mesajlar ~%20, sohbet açılışı ~%55 daha hızlı; gerçek sunucuda ağ gecikmesi olduğundan kazanç daha büyüktür.


**Telefonun geri tuşu her zaman bir önceki adıma gider, atlamaz**
- Açık bir pencere, açılır menü, yan menü (☰), bildirim kutusu, sohbette emoji paneli ya da mesaj seçimi varsa geri tuşu **yalnız onu kapatır**; sayfa yerinde kalır. İç içe pencerelerde her basış bir pencere kapatır.
- Pencere ✕ ya da “Vazgeç” ile kapatıldıktan sonra geri tuşu doğrudan bir önceki sayfaya gider (boşa basış yok).
- Sekmeler ve adımlar artık geçmişe yazılır; geri tuşu bir önceki sekmeye / adıma döner:
  - Ayarlar bölümleri (Genel, Bildirimler, Nöbet, Güvenlik, Yedek), İstekler sekmeleri (İsteklerim, Pano, Yönetim), İlanlar sekmeleri (Pano, İlanlarım, Başvurularım), nöbet listeleri arasında geçiş, Destek (Taleplerim / Birim talepleri).
  - Çizelgede ay / liste, Taraf'ta gün, yemek listesinde gün.
  - Destek'te yeni talep sihirbazı: konu seçimi → öneriler → yazma (adres: #/destek/yeni/<konu>/yaz).
  - Sistem yönetimi paneli sekmeleri (adres: #/sistem/<sekme>).
- Taraf'ta kaydedilmemiş yerleşim varken geri tuşuyla başka güne dönülürse önce sorulur; çizelgede kaydedilmemiş taslak geri tuşunda kendiliğinden kaydedilir.

**Güvenlik taraması sonucu yapılan düzeltmeler**
- Excel önizlemesi: dosyanın içindeki biçim bilgisiyle sayfaya HTML sokulabiliyordu (tıklamayla başka bir bilgisayarın QR girişini onaylatma riski). Hizalama artık yalnız izinli değerler, tüm biçim değerleri kaçışlı; dosya önizlemesinin içindeki hiçbir düğme uygulama işlemi tetikleyemez.
- Kayıt ve Google ile kayıt: başka bir hesabın adı (ör. “Elif Yılmaz”, “Elif Nur Yılmaz”) alınamaz — nöbetler ada göre eşleştiği için o kişinin nöbetleri yeni hesaba geçebiliyordu. Google'da aynı adlı hesap varsa yeni hesap yönetici onayına düşer.
- Şifre sıfırlama: sitenin adresi henüz bilinmiyorsa bağlantı sahte alan adına gönderilemez; kurulumda adres kaydedilir. Sıfırlama bağlantısı aynı anda iki istekle iki kez kullanılamaz.
- Gönderilen geçici şifre / sıfırlama / davet e-postalarının içeriği gönderildikten sonra veritabanından (ve yedeklerden) silinir.
- Abonelik süresi bittiğinde ya da “rol gözünden görme”de salt okunur kipte sohbet üyeliği, bildirim politikası, güncelleme yükleme ve nöbet tablosu yazma artık engellenir.
- Çok birimli kurulumda e-posta (SMTP) ayarı sunucunun iç ağına bağlanmak için kullanılamaz (yalnız 25 / 465 / 587 / 2525 ve genel adresler; hata metni gizlenir). Site sahibi sunucu içi bir SMTP rölesi (127.0.0.1 vb.) kullanacaksa `data` klasörüne `.smtp-yerel` adlı boş bir dosya koyar.
- Bir kişi bir günde, bir yere eklenmemiş en çok 2 GB dosya yükleyebilir (tek kişi diski dolduramasın).
- Sistem yöneticisi girişi başkası tarafından e-posta yazılarak kilitlenemez (kilit kişi + cihaz bazında).
- İlan / çağrı seçiminde aynı anda iki kişi işlem yapınca “database is locked” yerine anlaşılır uyarı; nöbet değişimi kabul / ret / iptal aynı anda iki kez sonuçlanamaz.
- Sunucu dışı yedeği indirme bağlantısı oturum anahtarı ister; güncelleme paketinde “./config.php” gibi yollar korunan dosyaların üzerine yazamaz; sistem yöneticisi birime girip çıkınca telefondaki ek dosyası önbelleği temizlenir.
- Not: Excel/ODS okumak için kullanılan SheetJS kütüphanesi 0.18.5 sürümündedir (bilinen iki açığı bulunur; dosyalar zaten tarayıcıda ve sanal alanda açılır). Yeni sürüm yalnız cdn.sheetjs.com'dan indirilebiliyor; bir sonraki güncellemede değiştirilecek.

## 43. Blok planı kuralları ve basamakları birlikte planlama (4.30)

**Taraflar ve bloklar (Taraf › Taraflar)**
- Birim kendi çalışma yerlerini tanımlar: **tek alan** (tek servis; blok yerleşimi gerekmez, liste yeterli) ya da **birden çok blok/alan**, istediği adlarla (A blok, B blok, Yoğun bakım…). Taraf eklenip kaldırılabilir.
- Blokların **sırası önceliktir**: kişi eksikse önce üstteki blok dolar, fazlada eşitleme alttakine gelir. Örnek 2. basamak (A blok, C blok; A 3 + C 3 gerekli): 5 kişi → A3 C2, 6 kişi → A3 C3, 7 kişi → A4 C3.
- **Karşı taraftan gelen yalnız şu bloklara:** örneğin 2. basamak tarafında yalnız A seçilir → 3. basamaktan karşıya geçen kişi yalnız A bloğa yerleşir.
- **Aynı blokta üst üste en fazla N nöbet:** örneğin 2 → kişi A'da üst üste 2 nöbetten sonra C'ye, C'de 2 nöbetten sonra A'ya geçer. Önceki ayın son nöbetleri de sayılır.
- Kurallar çakışırsa öncelik: blok sayıları → karşıdan gelenin bloğu → üst üste kuralı. Uyulamayan kural yerleşimin açıklamasında yazar.
- **Ekstra kişi (nöbete getirilen):** Taraf'ta her zaman görünen **Ekstra kişi** düğmesiyle eklenir: kişi (listeden, nöbet dışı grubundan ya da adı yazılarak), **ne zaman geldiği** (Gece 16-08, Gündüz 08-16, 24 saat ya da **gündüz ve gece ayrı bloklarda**) ve **blok**. Pencerede her bloğun o anki gündüz / gece doluluğu görünür; eksik olan blok önce önerilir. "Nöbete gelecek kişi" geldiğinde **Geldi** ile aynı pencere açılır.
- **Nöbet dışı kişiler** kuraya, otomatik dağıtıma ve sayımlara hiç girmez; Taraf'ta yalnız elle eklenebilir (Ekstra kişi › Nöbet dışı).
- **Anlık güncelleme:** liste yeni sürüm alınca, değişim / devir olunca, taraflar ya da sayılar değişince, başka bir sorumlu kaydedince ya da oflayınca Taraf sayfası birkaç saniye içinde kendiliğinden yenilenir (adlar, sayılar, geçişler). Kaydedilmemiş düzenleme varsa üzerine yazılmaz; "Yenile" uyarısı çıkar.

**Basamakları birlikte planla (Çizelge › Basamakları birlikte planla)**
- En az iki taraf ve her birine nöbet listesi tanımlıysa görünür. İki basamak **aynı ekranda ama ayrı tablolarda** hazırlanır; birbirine karışmaz, her biri kendi listesinin taslağına kaydedilir ve **ayrı Excel** olarak indirilir / yayınlanır.
- Ay değişince basamak kişileri değişebilir: kişi ekle, çıkar ya da "diğer basamağa taşı". Yeni ayın taslağı önceki ayın kişileriyle başlar.
- **Gereken kişi sayıları blok planından gelir:** "Blok sayıları" (hafta içi / hafta sonu-tatil, gündüz / gece, blok blok) ve gün başlığına dokunarak o güne özel sayı. Taraf sayfasındaki gün gün sayılarla aynıdır. Sorumlular alan sayısına girmez.
- **Otomatik dağıt:**
  1. Onaylı izin / boşluk istekleri ve elle yazılan hücreler korunur; nöbet dışı kişilere yazılmaz.
  2. Sorumlulara (Taraf › Sorumlular ekibi) isteğe bağlı hafta içi gündüz yazılır.
  3. Her gün önce herkes kendi basamağından dolar; adalet sırası: ay içinde az saat → hafta sonu sayısı → son 7 gün → kura.
  4. Bir taraf o gün dolmuyorsa eksik diğer basamağın listesinden tamamlanır: o kişi o gün karşıya geçecek kişidir, bloğu Taraf kurasında belli olur.
  5. **Saatleri eşitle** (varsayılan açık): aynı basamakta saati fazla olan kişinin otomatik yazılmış nöbeti saati az olana geçer; 24 saatlik nöbet gerekirse **8-16 ve 16-8** olarak bölünüp bir parçası verilir. Günün sayıları değişmez, her değişiklik kurallarla denetlenir, elle yazılan hücrelere dokunulmaz; izinli günü çok olanın hedefi orantılı olarak küçülür. Örnek: 8-16 / 16-8 düzeninde kişiler arası fark en fazla 8 saat, 24 saatlik düzende çoğunlukla 0.
  6. Herkes yerleştikten sonra Cuma (seçilen kod, ör. 16-08) ve isteğe bağlı Cumartesi (ör. 24) sorumlular sırayla atanır.
- **Önceki ay hatırlanır:** dinlenme, üst üste çalışma ve 24 saat çıkışı kuralları önceki ayın son günleriyle birlikte denetlenir (ör. 31'inde 24 tutan 1'inde yazılmaz). Tablonun başında önceki ayın son 3 günü soluk görünür. Bu kural tek liste çizelgesinde de geçerlidir.
- **Anlık sayılar:** her hücre değişikliğinde basamağın gece / gündüz alan sayısı (alan / gereken), gün gün toplam ve karşıya geçecek kişi sayısı (↔) hemen yeniden hesaplanır.

**Her türlü vardiya (Ayarlar › Nöbet › Nöbet kodları)**
- Birim kendi vardiyalarını tanımlar: 8-16, 16-8, 8-8 (24 saat), 8-24, 16-24, 24-8, 8-20, 20-8… Saat “8”, “08:30” ya da “24” biçiminde yazılabilir; **24:00** gece yarısıdır (8-24 gece yarısına kadar, 24-8 gece yarısından sabaha). Varsayılan kodlara 8 24, 16 24 ve 24 8 eklendi.
- Saatler, dinlenme / üst üste çalışma kuralları, takvim aboneliği ve “gece içerir” sayımı her vardiyanın gerçek başlangıç ve bitişiyle hesaplanır.
- **Sayımlarda kısmi vardiya kesirli sayılır:** vardiya gündüzün (08-16) ve gecenin (16-08) kapsadığı kadar sayılır. 16-24 ve 24-8 gecenin ½'si, 8-24 gündüzün tamamı + gecenin ½'si, 8-8 ikisinin tamamı. Çizelgede alan / gereken sayıları ½, ¼ ile gösterilir (ör. 2½/3).
- **Vardiya takımı:** Basamakları birlikte planla ekranında gündüz ve gece için birden çok kod seçilebilir; takım bir kişilik yeri doldurur. Ör. gece vardiyası = **16 24 + 24 8** (iki kişi, geceyi birlikte kapatır), gündüz = 8 16; ya da gece = 8 8 (24 saat). Takımın toplam kapsaması 1 değilse ekranda uyarı çıkar.
- Taraf'ta (günlük blok yerleşimi) kişi, vardiyasının en az yarısını kapsadığı dönemde sayılır (16-24 → gece, 8-24 → gündüz + gece).

## 44. Excel görüntüleyici düzeltmeleri (4.30.1)
- **Tam ekranda sabit isim sütunu:** tam ekran artık sayfada açık olan sekmeyle (ay) açılır; isim sütunu ve başlık satırları sayfadaki gibi sabit kalır. Excel'de "bölmeleri dondur" yapılmamış dosyalarda "Ad Soyad" (ya da adların bulunduğu) sütun ve başlık satırı kendiliğinden sabitlenir.
- **Sadece ben:** yalnız hücresi sizin adınız olan satır gösterilir ("Elif Yılmaz", "ELİF NUR YILMAZ", "YILMAZ Elif"). Benzer ad ("Elif Yılmaz Kara") ya da başka birinin satırındaki not ("Elif Yılmaz yerine…") artık eşleşmez. Adınız hiçbir hücrede tek başına yazılı değilse adınızın geçtiği satırlar gösterilir.
- **4.30.2:** Excel'de bölme ilk kişinin satırına kadar dondurulmuşsa o kişi "başlık" sanılıp sizinle birlikte gösteriliyordu. Artık sizin satırınızla aynı yapıdaki satırlar (sıra no sütununda sayı, ünvan sütununda aynı yazı ya da gün sütunlarında nöbet kodu) kişi satırı sayılır ve gizlenir; başlık satırları (Personel listesi, Ünvanı, günler) görünmeye devam eder.
- **4.30.3:** İstekler › Yönetim'de **Kişiler** bölümü (kişi kişi toplu onay / ret) en üste, özet sayıların ve basamak seçiminin hemen altına alındı; takvim ve yığılma onun altında.
- **4.30.3:** Telefon rehberinde dar ekranda iki numarası olan kişinin numaraları alt satıra iner (ad ve ünvan sıkışmaz).

## 45. Taraf: sebepsiz nöbetten çıkarma ve sebepsiz ekstra kişi (4.30.4)
- **Nöbetten çıkar:** Taraf › Elle düzenle'de listede nöbetçi olan kişiye dokunun → **Nöbetten çıkar**. Sebep sorulmaz. Kişi o gün hiçbir blokta, ana sayfa kartında, paylaşım görselinde / metninde ve ay tablosunda görünmez; kapsamaya, karşıya geçişe ve kuraya sayılmaz; otomatik dağıtıma girmez; "yerleştirilmedi" uyarısı çıkmaz. Sorumlular günün altında **Nöbetten çıkarılanlar** kartında görür, **Geri al** ile kişiyi kendi tarafına döndürür. ("Ofl." eve gönderme olarak ayrıca durur.)
- **Sebepsiz ekstra:** **Ekstra kişi** penceresinde **Sebep: Çağrıldı / Sebepsiz ekstra** seçimi var. Sebepsiz eklenen kişi bloğa yazılır ama "Çağrıldı" etiketi hiçbir yerde görünmez; kişiye giden bildirimde "Blok yerleşimi" yazar. Sayım kuralları aynıdır (karşı tarafta gece içeriyorsa geçiş sayılır). Eklenmiş kişide etiket, kişiye dokunup **"Çağrıldı" etiketi** anahtarıyla sonradan da açılıp kapatılır.
- İşlem günlüğünde kayıt satırına "nöbetten çıkarılan: …" ve "(ekstra)" eklenir.

## 46. dupcii logosu (4.31.0)
- Uygulamanın varsayılan logosu "dupcii | by fırtına" oldu: açık temada lacivert-kırmızı, koyu temada beyaz-kırmızı (assets/logo-light.png, logo-dark.png). Menüde, telefonda üst çubukta, giriş ekranında ve uygulama açılırken (yükleme ekranında) görünür.
- Simge: d+ ve nabız çizgisi. Tarayıcı sekmesi (favicon.png), Android ana ekran simgesi (icon-192/512: çerçeveli; icon-maskable-192/512: beyaz zeminli, Android'in yuvarlak/kare kesimine uygun), iPhone ana ekran simgesi (apple-touch-icon.png), bildirim rozeti (badge-96.png) ve bağlantı önizleme görseli (og-image.jpg) yenilendi.
- Yönetici Ayarlar › Genel › "Logo ve simge"den kendi logosunu yüklerse o kullanılır (öncekiyle aynı).
- Telefona daha önce eklenmiş uygulamada simge: Android birkaç gün içinde kendisi yeniler (bazen sorar); iPhone yenilemez, ana ekrandan kaldırıp Safari'den yeniden eklemek gerekir.
- Düzeltme: "Hatırlatma saatim" seçen kişiye, genel "yarın nöbetiniz var" hatırlatması o gün kendisine gitmediyse (ör. liste sonradan yüklendiyse) kişisel hatırlatma artık gönderiliyor; önceden o gün hiç gitmiyordu.
- Bağlantı paylaşınca çıkan önizleme görseli: ortada "dupcii | by fırtına" logosu ve "Nöbet ve ekip portalı" yazısı (WhatsApp'ın kare kırpmasında da tam görünür). WhatsApp daha önce paylaşılmış bir bağlantının önizlemesini bir süre eski hâliyle saklar; yeni paylaşımlarda yenisi çıkar.
- Düzeltme: sistem yönetimine geçerken ana sayfa ipuçları kartı ara sıra hata veriyordu.
- Düzeltme: çizelgede saat eşitleme, fazla saatli kişiden eksik olana doğrudan aktarım kurala takılınca araya üçüncü bir kişi alarak (aynı saatte iki aktarım) eşitliyor; 24 saatlik düzende 16 saate varan farklar kalabiliyordu.
- İstekler: tek havuzlu birimde (liste sorulmayan) "İstekler tüm birim için toplanır…" notu kaldırıldı. Takvimin üstünde açık anlatım: **Boşluk için güne bir kez, Yıllık izin için iki kez dokunun, vazgeçmek için bir kez daha dokunun; bitince Kaydet.**

## 47. Yanlışlıkla silme ve onaya karşı koruma (4.31.1)
- Sitenin her yerinde silen, kaldıran, iptal eden ya da onaylayan her işlem önce sorar: "Mesaj sizden silinsin mi?", "İlan silinsin mi?", "3 istek onaylansın mı?", "Değişimi kabul ediyor musunuz?", "Kişi gruptan çıkarılsın mı?" gibi. **Vazgeç** denince hiçbir şey yapılmaz.
- Kapsam: mesajlar (benden sil, herkesten sil, toplu silme, gruptan çık, kişiyi çıkar / at / kısıtla, engelle), bildirimler, duyuru / içerik (sil, onayla, reddet), istekler (onay, ret, dönem silme), değişim ve devir (kabul, ret, iptal), ilan ve eksik personel çağrısı (seç, iptal, sil), nöbet listeleri (sil, eski sürüme dön), Taraf (günü sil, elle sayı, nöbetten çıkar, kaldır), rehber, belgeler, roller, şablonlar, kullanıcı silme / şifre sıfırlama, oturum kapatma, cihaz ve parmak izi girişi kaldırma, yedek silme, abonelik iptali, başvurular, destek talebi kapatma, güncelleme kurma / geri alma.
- Sayfa aynı işlem için zaten soruyorsa ikinci kez sorulmaz; toplu işlemde tek kez sorulur.

## 48. Herkesin ana sayfası ve "Bildirimleriniz kapalı" uyarısı (4.31.1)
- **Yönetici:** Ayarlar › Genel › **Herkesin ana sayfası (varsayılan düzen)**. Kartları göz simgesiyle gizleyin / gösterin, oklarla sıralayın, "Telefonda kartları duyurulardan önce göster"i seçin, **Kaydet**. Kendi düzenini değiştirmemiş herkes bu düzeni görür. "Kendi düzenini yapmış kişileri de bu düzene döndür" işaretlenirse (onay sorulur) herkesin düzeni bu düzene döner.
- **Kişi:** Hesabım › Görünüm › Ana sayfam'da kendi düzenini yapabilir; **Birimin varsayılan düzenine dön** ile yöneticinin düzenine döner.
- **Bildirimleriniz kapalı:** Bu cihazda telefon bildirimleri kapalı olan kişide ana sayfanın üstünde uyarı çıkar: **Bildirimleri aç** ya da **Daha sonra**. "Daha sonra" denirse ertesi gün yeniden hatırlatılır. İzin tarayıcıda reddedildiyse "Nasıl açılır?" bağlantısı çıkar.
- Günlük hatırlatmayı kişi **Hesabım › Bildirimler › "Bildirimler kapalıyken her gün hatırlat"** anahtarından kapatabilir.
- Düzeltme: Ekstra nöbet listesi, kişi ay içinde birden çok listede (ör. iki basamakta) görünüyorsa öbür listedeki nöbet gününü boş sanıyordu; artık tüm listelerindeki nöbetlerine bakar. Ekstra listesinden açılan eksik çağrısında karşı taraftaki gönüllüler de görünür.

## 49. Sekmeler kimsede gizli kalmasın (4.31.2)
- Telefonda Nöbet sekmeleri (Takvimim, Kim nöbette, Taraf, İstekler, İlanlar, Ekstra nöbet, Çizelge, Excel liste) tek satırda yana kayıyordu; dar telefonda ya da büyük yazı tercihinde bazı sekmeler (ör. İstekler) ekranın dışında kalıyor ve görünmüyordu. Artık sığmayan sekmeler alt satıra geçer; hepsi her zaman görünür. Aynı düzen Hesabım, Ayarlar ve diğer sekme şeritlerinde de geçerli.
- Yan menüde (telefonda ☰) Nöbet bölümüne İstekler, İlanlar, Ekstra nöbet ve (yöneticilerde) Çizelge eklendi.
- Bir sekme yine görünmüyorsa: Ayarlar › Roller'de kişinin rolünde o modül "Göremez" olabilir ya da modül birimde kapatılmış olabilir.
- Düzeltme: "Büyük yazı" seçen kişide ekran yüksekliğine göre boyutlanan alanlar taşıyordu: yan menünün altındaki hesap kartına ulaşılamıyor, sohbette yazma kutusu ekranın altında kalabiliyordu, yan menü uzayınca öğeler üst üste biniyordu. Artık hepsi ekrana sığar.

## 50. "Bu kişi neden görmüyor?" (4.31.3)
- Yönetim › Kullanıcılar'da, birimde açık olduğu hâlde bir bölümü göremeyen kişinin yanında uyarı çıkar: ör. **"Nöbet istekleri görünmüyor"**. Üzerine gelince ya da kişiyi düzenleyince nedeni yazar: ör. "“Destek personeli” rolünde “Göremez”".
- Düzeltmek için kişinin **Birime özel rol**ünü "Yok" yapın ya da Ayarlar › Güvenlik › Roller'de o rolde bölümü **Kullanır** yapın.
- Uyarı yoksa ve kişi yine göremiyorsa: kişi uygulamayı kapatıp yeniden açsın (telefonda eski sürüm açık kalmış olabilir) ya da başka bir birimin hesabıyla giriyor olabilir (o birimde modül kapalı olabilir).
- **4.31.4:** Kişinin kendi ekranında **Hesabım › Profil › Hesap bilgisi** kartı: hangi birimde olduğu (ve hastanesi), yetkisi, sürüm ve **size görünmeyen bölümler** nedeniyle (ör. "Nöbet istekleri: biriminizde kapalı (sistem yöneticisi ayarı)", "abonelik paketinizde yok", "“X” rolünüzde kapalı"). Görünmeyen bölüm varsa kart en üstte çıkar; kişi ekran görüntüsünü yöneticisine gönderir. Kişi sizin Kullanıcılar listenizde yoksa hesabı başka bir birimdedir.
- **4.31.4 — eski iPhone düzeltmesi:** iOS 16.4'ten eski iPhone'larda **İstekler** sekmesi hiç görünmüyordu. İstekler dosyasındaki bir yazı ayrıştırma ifadesini (geriye bakan düzenli ifade) eski Safari tanımıyor ve dosyanın tamamını çalıştırmıyordu. İfade eski Safari'nin anladığı biçimde yeniden yazıldı; sonuç aynı ("2,3 boşluk; 15-19 yıllık izin" gibi yazımlar). Tüm uygulama dosyaları eski iPhone (iOS 15 – 16.3) uyumu için tarandı; bundan sonra her sürümde otomatik denetleniyor.

## 51. Aydan aya nöbet isteği (4.31.4)
- Bir istek dönemi, ayın **7 gün öncesine ve 7 gün sonrasına** kadar gün alır: ör. Ocak dönemindeyken **28 Aralık – 2 Ocak** yıllık izin tek seferde yazılır.
- **Takvimde:** ayın ilk ve son haftasındaki gri günler önceki / sonraki aya aittir (altında ay adı yazar); dokunarak işaretlenir.
- **Yazarak:** "28 aralık - 2 ocak izin", "28.12-2.1 izin", "30 kasım boş". Ay adı yazılmayan günler eskisi gibi dönemin ayıdır.
- **Her gün kendi ayının dönemine düşer:** komşu ayın dönemi açıksa gün oraya yazılır (o ayın panelinde görünür). O ayın dönemi henüz açılmadıysa gün şimdilik bu dönemde bekler; o ay için dönem açılınca kendiliğinden oraya geçer. Kapanmış bir dönemin günlerini üye ekleyemez / değiştiremez (sorumluya yazar).
- Çizelge hazırlarken onaylı istekler tarihe göre okunur: hangi dönemde yazılmış olursa olsun o ayın çizelgesinde dikkate alınır.
- **4.32.1:** Ay pazartesi başlıyor ya da pazar bitiyorsa da takvimde önceki / sonraki ayın bir haftası gri olarak görünür; böylece her ayda aydan aya istek takvimden işaretlenebilir. “Yazarak ekle” ipucunda örnek: “28 aralık - 2 ocak izin”.
- **Gri günleri göremiyorsanız** sitede eski sürüm çalışıyordur: Hesabım › Profil › Hesap bilgisi'nde sürüm 4.31.4 ya da üstü olmalı. Değilse paketi yükleyin; telefonda uygulamayı kapatıp açın.

## 52. Kişi bazlı abonelik (4.32.0)
Abonelik artık **her kişinin kendisine** aittir; birim başına ödeme yoktur. Her kullanıcı kendi paketini ve süresini seçip kendisi öder.

### Kullanıcı (herkes)
- Menüde **Abonelik** (Genel bölümünde) ve Ayarlar › Genel'de kısa bilgi kartı. Abonelik sayfası açıksa üye, sorumlu, yönetici herkes görür.
- Sayfada üstte **süre seçici** (ör. Aylık · 3 aylık · Yıllık): seçilen süreye göre her paketin fiyatı, KDV dahil tutarı, aylık karşılığı ve aylığa göre **tasarruf** gösterilir.
- **Fatura bilgileri:** ad soyad (ya da şirket unvanı), T.C. kimlik no (ya da vergi no), adres, il, telefon, e-posta. Ad ve e-posta hesaptan dolu gelir. Her kişinin fatura bilgisi ve ödemeleri ayrıdır; kimse başkasınınkini görmez.
- Ödeme yöntemleri (PayTR, iyzico, havale) §29'daki gibidir. Süre, kalan deneme / abonelik süresinin üstüne eklenir.
- Süre bitince (ek süreden sonra) kişi **ücretsiz pakete** düşer; ücretsiz paket tanımlı değilse yalnız görüntüler. Aynı birimdeki diğer kişiler etkilenmez.
- Hatırlatmalar (7, 3, 1 gün kala ve bitince) yalnız kişinin kendisine gider.

### Sistem yöneticisi (Sistem paneli › Abonelik ve ödeme)
- **Paketler › Düzenle › Süreler ve fiyatlar:** istediğiniz kadar süre ekleyin (1–36 ay; hızlı düğmeler 1 ay, 3 ay, 6 ay, 1 yıl), her birine kişi başı fiyat yazın (KDV hariç). Kullanıcı yalnız tanımladığınız süreleri görür. Bir süreyi kaldırmak için satırdaki ✕.
- **Yeni kişilere otomatik deneme:** açıksa kaydı olmayan kişi ilk girişinde **Deneme süresi (gün)** kutusundaki gün kadar deneme başlatır. Gün sayısını siz belirlersiniz.
- **Kişilerin abonelikleri:** herkes listelenir (ilk girişte eklenir): ad, e-posta, hastane › birim, paket, süre, bitiş. Ad / e-posta / birim araması ve durum süzgeci (Deneme, Etkin, Ücretsiz, Süresi dolan, Kaydı yok). “İşlemler” ile kişiye özel: Etkinleştir (paket + 1/3/6/12 ay, paketteki diğer süreler ya da belirli tarihe kadar), Deneme, Uzat, Ücretsiz tanımla, Askıya al, Kaydı sıfırla, Geçmiş.
- **Birimler (birimin tamamı):** bir birimi “Ücretsiz tanımla” ya da “Etkinleştir” ile kapsama alırsanız o birimdeki **herkes** ödemesiz kullanır (kurum sözleşmesi, pilot birim). Kişilerin sayfasında “Biriminizin tamamı kapsama alındı” yazar, uyarı şeridi çıkmaz. Tanım bitince ya da “Kaydı sıfırla” ile herkes kendi aboneliğine döner.
- **Zorunluluğu açarken** kaydı olmayan kişiler için yine seçim sorulur (deneme / ücretsiz / dokunma). “Süresi dolan kişilere yeniden deneme” düğmesi toplu deneme verir.
- **Özet:** ücretli etkin kişi, denemede, ücretsiz tanımlı, süresi dolan, kapsama alınan birim, aylığa çevrilmiş tekrarlayan gelir (KDV hariç), bu ay tahsilat, onay bekleyen havale.
- Ödemeler listesinde ödeyen kişi, birim ve süre (ör. “3 aylık”) yazar.

### Notlar
- Kişi sınırı artık yoktur (paketler kişi başı ücretlendirildiği için).
- Eski birim kayıtları silinmez; panelde “Birimler” bölümünde görünür ve birimin tamamı tanımı olarak çalışmaya devam eder (etkin / ücretsiz olduğu sürece).
- Tanıtım sayfasındaki fiyatlar kişi başı ve tanımlı tüm sürelerle gösterilir.

## 53. Abonelikte yönetici, ücretsiz paket ve hesap değişiklikleri (4.33.0)
- **Yönetici ve sorumlular her zaman ücretsiz:** birim yöneticisi, yayıncı ve herhangi bir modülü yöneten (özel rolde "yönetir" yetkisi olan) kişiler ödeme zorunluluğundan etkilenmez; tüm özellikler açık kalır, uyarı şeridi ve hatırlatma gitmez. Abonelik sayfalarında “Yönetici / sorumlu olarak ücretsiz” yazar. Böylece birim (liste yükleme, istek dönemi, onaylar) hiç aksamaz.
- **Temel (ücretsiz) pakette Nöbet istekleri var:** süresi dolan kişi de boşluk / yıllık izin isteği yapabilir. (Değiştirmediğiniz örnek Temel paketine güncellemede kendiliğinden eklenir; kendi düzenlediğiniz pakete siz eklersiniz.)
- **Ücretsiz kişi yanıt verebilir:** paketinde mesajlaşma, nöbet ilanı / değişim ya da eksik personel çağrısı olmasa da bunları görür ve kendisine gelene yanıt verir (mesaja cevap, ilana başvuru, değişim isteğini kabul / ret, çağrıya gönüllü olma). Yeni sohbet ya da grup açmak, ilan vermek, değişim istemek, arama başlatmak ücretli pakettedir; denerse “Bu işlemi başlatmak ücretli pakette…” uyarısı çıkar.
- **Aboneliği taşı (birim değiştiren kişi):** Sistem paneli › Abonelik › Kişiler › İşlemler › Diğer › “Aboneliği başka hesaba taşı”. Kalan süre, ödemeler ve fatura bilgisi yeni hesaba geçer; eski kayıt sıfırlanır; kişiye bildirim gider. Yeni hesap en az bir kez giriş yapmış olmalı; kendi etkin aboneliği olan hesaba taşınmaz.
- **Silinen / devre dışı hesap:** birim yöneticisi bir kişiyi silerse ya da devre dışı bırakırsa abonelik kaydında “hesap silindi” / “devre dışı” rozeti çıkar (süzgeç: Silinmiş / devre dışı). Ödenmiş süresi varsa size bildirim gelir: kişi başka birime geçtiyse taşıyın, değilse iade kararını verin. Silinen hesabın kaydı ayrı tutulur; aynı numarayla açılan yeni bir hesap eskisinin aboneliğini devralmaz.

## 54. Çizelgede resmi liste, saatler ve değişiklik raporu (4.34.0)
Yönetici ve yayıncı (çizelgeyi yönetenler) için **Nöbet › Çizelge** sayfasında üç sekme var: **Çizelge**, **Değişiklikler**, **Resmi liste**. Üyeler yalnız yayınlanan güncel listeyi (ve eklendiyse imzalı belgeyi) görür.

### Çizelge
- **İstekler önce yerleşir:** onaylı boşluk / yıllık izin istekleri hücrelerde B / İ olarak görünür. Otomatik doldurmada yıllık izin isteği olan boş günlere seçtiğiniz **İzin kodu** (ör. Yİ) yazılır, boşluk isteği olan güne nöbet yazılmaz.
- **Elle istek:** bir güne dokunun → pencerenin altında “B · Boşluk isteği” / “İ · Yıllık izin isteği”. İstek sisteminden gelmemiş istekleri de böyle girersiniz; otomatik dağıtım bunlara da uyar.
- **Adil dağıtım:** boş vardiyalar kurallara uyarak, ay içinde az saat çalışan → hafta sonu / tatilde az nöbeti olan → son 7 günde az nöbeti olan → kura sırasıyla doldurulur. Dolu hücrelere dokunulmaz; sonra elle düzenlersiniz.
- **Elle düzenleme:** güne dokununca tüm türler gruplu çıkar: çalışma saatleri (08-16, 16-08, 08-08…), izin ve rapor (yıllık, doğum, mazeret, idari, rapor, refakat…), görev ve diğer. Fırça ile art arda boyama da var. Kod listesi Ayarlar › Nöbet › Nöbet kodları’ndan genişletilir.
- **Kişi menüsü** (ada dokunun): unvan (resmi listede yazar), sırada yukarı / aşağı taşı, çalışılması gereken saati elle düzelt (ör. arife), satırı temizle, çizelgeden çıkar.
- **Saat sütunları:** Ger. (çalışılması gereken), Çal. (çalışılan), Fazla (fazla mesai). Her düzenlemede anında yeniden hesaplanır.

### Saat hesabı
- Çalışılması gereken = ayın iş günleri × günlük saat (varsayılan 8) − hafta içine denk gelen izin / rapor günleri × 8. Resmi tatiller (Ayarlar › Nöbet › Tatiller) düşülür; yarım gün tatilde (arife) şablondaki saat (varsayılan 4) sayılır. Örnek: Kasım 2026 = 21 iş günü × 8 = 168; 5 gün yıllık izinli = 128.
- Çalışılan = vardiya saatlerinin toplamı (08-08 = 24, 08-16 = 8, 16-08 = 16).
- Fazla mesai = çalışılan − gereken (eksik saatte eksi yazılır).
- Her kodun saat etkisi şablonda değiştirilebilir: “gerekenden düşer” (izin, rapor), “çalışılmış sayılır” (ör. eğitim, görevlendirme), “etkisiz”.

### Her zaman güncel
- Liste yayınlandıktan sonra kabul edilen **nöbet değişimi, devir (parçalı dahil) ve eksik personel çağrısı** çizelge açılınca kendiliğinden işlenir (o hücreyi siz değiştirmediyseniz). Saatler ve resmi liste güncel hâlden hesaplanır. Sarı uyarı çıkar: listeye de işlemek için **Yayınla**.
- Yayından sonra yaptığınız düzeltmeler (rapor, izin, silinen / değişen nöbet) yeniden yayınlarken kaydedilir.
- Excel ile yüklenmiş (çizelgede hazırlanmamış) listeler de çizelgede açılır; güncel hâli, saatleri ve resmi çıktısı aynı şekilde alınır.

### Değişiklikler sekmesi
- O ay yayından sonra olan değişim, devir, eksik çağrısı ve düzeltmeler: tarih, kişi(ler), eski → yeni, kim yaptı / onayladı.
- Çizelgede bu hücrelerin köşesinde küçük işaret olur (üstüne gelince ya da dokununca ayrıntı). **Resmi çıktıda iz yoktur.**
- Arama, türe göre süzme, Excel olarak indirme.
- **Silme:** bir ya da birden çok kaydı seçip silin. Yalnız rapordaki kayıt ve hücre işareti kalkar; liste güncel hâliyle kalır, silinen kayıt geri gelmez.

### Resmi liste sekmesi
- Ekranda kâğıdın birebir önizlemesi. **Yazdır / PDF** (A4 yatay, tek sayfaya sığar; 30 kişiye kadar denendi), **Word** (.docx, tam düzenlenebilir), **Excel** (.xlsx).
- **Şablon** (birim başına, bir kez): kurum logosu (PNG / JPG, otomatik küçültülür), başlık satırları ({HASTANE}, {BİRİM}, {LİSTE}, {YIL}, {AY} değişkenleriyle), sağ üst doküman kutusu (Doküman No, Yayın Tarihi, Revizyon No… istediğiniz kadar satır), sütunlar (Sıra, Unvan, 3 saat sütunu), hafta sonu / tatil gölgesi, günlük ve yarım gün saati, kodların çıktıdaki yazımı (08-16, Y.İZİN, D.İZNİ, RAPOR…) ve saat etkisi, imza alanları (Birim Sorumlusu, Sağlık Bakım Hizmetleri Müdürü…).
- Çok birimli kurulumda şablonu hastanedeki diğer birimlerle paylaşabilir, başka birimin şablonunu kopyalayabilirsiniz.
- **Islak imzalı belge:** imzalandıktan sonra taranmış PDF / fotoğrafı ekleyin; ekip Nöbet listesi sayfasında “İmzalı resmi liste” olarak görür. Kaldırılabilir.
- Kısayol: Ayarlar › Nöbet › Resmi liste şablonu.

## 55. Liste türleri, gece / %10 hesapları, telefonda çizelge, birim kuralları (4.35.0)
### Liste türleri (Resmi liste sekmesi)
- Aynı çizelgeden birden çok resmi liste: ör. **Çalışma listesi** ve **Fazla mesai listesi**. Üstteki **Liste türü** seçiminden geçilir; **Yeni liste türü** ile eklenir, gerekirse silinir (en az bir tür kalır).
- Her türün kendi adı, başlık satırları, doküman kutusu (doküman no, yayın / revizyon tarihi), imzaları ve sütunları vardır. Logo, günlük saat, gece aralığı ve kod yazımları tüm türler için ortaktır.
- **Gün sütunları (1–31)** isteğe bağlıdır: kapatılırsa yalnız hesap sütunlu özet liste çıkar.
- **Hesap sütunları** (Şablon › Hesap sütunları; işaretle, sırala, başlığını değiştir, yeşil vurgula):
  - Toplam izin = hafta içine düşen izin / rapor günleri × günlük saat (6 gün → 48)
  - Çalışılması gereken saat = iş günü × günlük saat − toplam izin
  - Çalışılan saat, Nöbet sayısı, Hafta sonu / tatil saati
  - Gündüz çalışma saati / Gece mesaisi saati: vardiyanın gece aralığına (varsayılan **20:00–08:00**, şablondan değişir) düşen saatleri gece sayılır; 08-08 = 12 gündüz + 12 gece, 16-08 = 4 + 12, 08-16 = 8 + 0
  - Fazla mesai = gündüz + gece − gereken
  - **%10 zamlı ödenmesi gereken saat** = fazla mesainin gece saatlerine düşen kısmı = gece saati ile fazla mesaiden küçük olanı (ör. gece 108, fazla 64 → 64; gece 48, fazla 8 → 8)
- PDF (tek sayfa), Word ve Excel her tür için çıkar.

### Telefonda çizelge
- Üst kısım küçüldü: **Kaydet** ve **Yayınla** görünür; Otomatik doldur, Denetle, Yapıştır / CSV ve Kişi ekle **Diğer** menüsünde.
- Gereken kişi sayıları, kodlar ve birim kuralları katlanır **Çizelge ayarları** bölümünde (telefonda kapalı gelir).
- Fırça tek satırda yana kayar; ad sütunu dar.
- Bir hücreyi doldurunca tablo **kaldığınız yerde kalır** (başa dönmez).
- **Kişi ekle** (tablonun altında ve Diğer menüsünde): birimde olup çizelgede olmayan herkes işaretlenebilir listede, aramayla; birden çok kişi tek seferde eklenir. Hesabı olmayan kişi de adıyla eklenir.

### Birim kuralları (Çizelge ayarları içinde; yönetici ve yayıncı)
- İki nöbet arası **en fazla N gün boşluk** (ör. 3), nöbet çıkışı en az dinlenme saati, üst üste en fazla çalışma saati. Her birime özgüdür.
- Çizelge denetimi bu kurallara göre uyarır; otomatik dağıtım, boşluk sınırına gelen kişiye önce nöbet yazar. Nöbet değişimi, ilan ve eksik çağrısı da aynı kurallara uyar (Ayarlar › Nöbet › Nöbet kuralları ile aynı ayar).

## 56. Otomatik dağıtımda “Önce 24 saat” (4.36.0)
Çizelge › Çizelge ayarları › **Dağıtım**:
- **Gündüz / gece ayrı** (varsayılan, eskisi gibi): gündüz ihtiyacı gündüz koduyla (08-16), gece ihtiyacı gece koduyla (16-08) doldurulur.
- **Önce 24 saat, kalan gündüz / gece**: her gün önce **24 saat kodu** (ör. 08-08) yazılır; bir 24 saatlik nöbet hem gündüzden hem geceden birer kişilik ihtiyacı karşılar. 24’lerle kapanmayan kısım gündüz / gece koduyla tamamlanır.
  - Örnek: hafta içi gündüz 2, gece 1 → 1 kişiye 08-08 + 1 kişiye 08-16; hafta sonu gündüz 1, gece 1 → yalnız 1 kişiye 08-08; gündüz 1, gece 2 → 1 kişiye 08-08 + 1 kişiye 16-08.
  - Adalet sırası, istekler, birim kuralları (24 saatten sonra dinlenme, boşluk sınırı) ve elle yazılan hücreler aynen geçerli; 24 saat için kurala uyan kimse yoksa ihtiyaç gündüz / gece koduyla denenir.
- 24 saat kodu, gündüzü ve geceyi tam kapsayan bir vardiya olmalı (08-08 gibi); seçilmezse otomatik doldurma uyarır.
- **Resmi liste çıktıları (4.36.0):** logo, logo hücresinin tam ortasında (önizleme / PDF, Word, Excel). Word belgesine Türkçe dil (tr-TR) ve varsayılan yazı tipi (Arial) tanımı eklendi; Türkçe harfler (Ç, Ğ, İ, Ö, Ş, Ü, ı) her görüntüleyicide doğru çıkar. Excel’de uzun unvanlar hücrede alt satıra geçer.
- **A4’e uygunluk (4.36.0):** indirilen her çıktı A4 yatay tek sayfadır ve hiçbir yazı hücreden taşmaz:
  - PDF / yazdır: satır yüksekliği kişi sayısına göre ayarlanır; her hücrenin yazısı (ad, unvan, kod) kendi sütun genişliğine göre küçültülür, kesilmez.
  - Word: hücrelerde “yazıyı sığdır” (Word’ün kendi özelliği) ve hesaplanmış punto; sayfa A4 yatay, kenar boşluğu 7 mm.
  - Excel: “sayfaya sığdır” (1 × 1 sayfa), yazdırma alanı başlık + tablo + imzalar, hücrelerde “sığdırmak için küçült”, unvan alt satıra geçer, doküman kutusu etiketleri sığar.
  - 20 ve 30 kişilik, uzun ad ve unvanlı çizelgeyle denendi (PDF, Word ve Excel tek sayfa).

## 57. Kura (4.37.0)
Menüde **Kura** (herkes görür). İsim ya da sayılardan adil kura; kartlar üstü kapalı, tek ekranda.

### Kura yapmak
1. İsimleri ya da sayıları yazın (her satıra bir tane; en çok 200). Kısayollar: **Sayılar 1–N**, **Birimdeki kişiler**, **Hazır şablondan…**
2. İsterseniz kuraya ad verin (ör. “Bayram nöbeti kurası”).
3. **Kurayı başlat**: ekran tam ekrana geçer, kartlar karışır ve üstü kapalı olarak ekrana **olabildiğince birbirinden uzak** dağılır (kart sayısına ve ekran boyutuna göre en büyük kart, en geniş aralık).
4. Herkes sırayla bir karta dokunur; kart döner ve altındaki isim / sayı görünür.
5. **Sonuçlar**: açılış sırası, kim açtı, saati; **Kopyala** ya da **Sohbette paylaş**. **Hepsini aç** kalan kartları açar ve kurayı bitirir.

### Ayarlar (Kura ayarları)
- **Nasıl çekilsin?** Kartla tek tek (dokunarak) ya da hepsini birden karıştır (sıralı liste hemen çıkar).
- **Kart arkası:** numara, harf ya da düz. **Renk:** mor, yeşil, turuncu, pembe, gri.
- **Sırayla çekenler:** ad listesi yazılırsa ekranda “Sıradaki: …” görünür ve açılan karta kendiliğinden yazılır.
- **En çok N kart açılsın:** ör. 20 kişiden 3 kazanan; N kart açılınca kura biter, kalan kartlar kapalı kalır.
- **Açan kişinin adını sor**, **açılan kart birkaç saniye sonra kapansın** (sıradaki kişi öncekileri görmesin), karıştırma gösterisi, ses, titreşim.

### Hazır şablonlar ve geçmiş
- Yönetici ve yayıncı yazdıkları listeyi **Şablon olarak kaydet** ile saklar; birimdeki **herkes** görür ve “Kullan” ile kura yapar. Yönetici / yayıncı şablonu siler.
- **Geçmiş kuralar** birimde herkese görünür: kim başlattı, ne zaman, açılan kartlar ve kimin açtığı. Yarım kalan kendi kuranıza **Devam et** ile dönersiniz. Kaydı başlatan kişi, yönetici ya da yayıncı silebilir (onay sorulur).

### Güvenilirlik
- Karıştırma **sunucuda** yapılır (kriptografik rastgele sayı, Fisher–Yates). Kartların içeriği açılana kadar telefona / bilgisayara hiç gelmez; kimse önceden göremez.
- Her açılış kim / ne zaman olarak kaydedilir; aynı kart iki kez açılamaz. Kartları yalnız kurayı başlatan kişinin ekranından açılabilir.


## 58. Çizelgeyi kolay düzenleme ve saat eşitleme (4.38.0)
### Temizle ve Geri al
- Çizelgenin üstünde **Temizle** (telefonda **⋯ › Temizle**):
  - **Yalnız nöbetleri temizle**: izin, rapor ve diğer günler kalır; otomatik doldurmayı baştan yapmak için.
  - **Tüm çizelgeyi temizle**: bütün hücreler boşalır; kişiler ve istekler kalır.
- **Kişinin adına dokunun** › **Bu kişinin nöbetlerini temizle** (izin / rapor kalır) ya da **Satırı tamamen temizle**.
- **Gün başlığına (gün numarasına) dokunun** › o günün nöbetlerini ya da günü tamamen temizleyin.
- Toplu işlemlerden (otomatik doldur, temizle, yapıştır, kişi çıkar) sonra **Geri al** düğmesi çıkar; son 20 işlem sırayla geri alınır.

### Saatleri eşitle (24’ü 08-16 / 16-08 bölerek)
Çizelge ayarlarında **Saatleri eşitle** (varsayılan açık). Otomatik doldurmadan sonra:
- Her kişinin saati, ay içinde çalışabileceği gün sayısına göre (izin / rapor / istek günleri düşülür) olması gereken paya göre karşılaştırılır.
- Fazla çalışanın **otomatik yazılan** nöbeti az çalışana geçer. 24 saatlik nöbet bütün olarak ya da **08-16 / 16-08 parçalarına bölünerek** paylaştırılır (ör. 08-16 bir kişide kalır, 16-08 diğerine geçer); hangisi farkı daha çok kapatıyorsa o seçilir.
- Gün gün gündüz / gece ihtiyacı hiç azalmaz; birim kuralları (24 saatten sonra dinlenme, iki nöbet arası en çok boşluk, art arda gün) her iki kişi için de denetlenir.
- Elle yazılan hücrelere, isteklere ve izinlere dokunulmaz. Sonuç mesajında kaç değişiklik yapıldığı yazar; beğenmezseniz **Geri al**.

## 59. Resmi liste: göründüğü gibi Word / Excel, sütun genişlikleri, unvan seçimi (4.39.0)
### Word ve Excel, ekranda ve PDF’te göründüğü gibi
- Önizleme, Yazdır / PDF, Word ve Excel artık **aynı ölçülerden** üretilir: her sütun genişliği (mm), satır yüksekliği, yazı boyutu (0,5 punto adımlı) ve satır kırılımı bir kez hesaplanır, üç çıktı da birebir kullanır.
- Yazılar kendiliğinden kaydırılmaz; iki satıra inen unvan ve sütun başlıkları her çıktıda aynı yerden bölünür. Gün adları her çıktıda harf harf alt alta, hesap sütunu başlıkları aşağıdan yukarı yazılır.
- Word’de “yazıyı sığdır” (harfleri esneten) özelliği kaldırıldı; hücre ölçüleri PDF ile aynıdır (20 ve 30 kişilik listede tablo PDF ile ±0,2 mm aynı çıktı).
- Excel’de sütun genişlikleri ve satır yükseklikleri milimetreden hesaplanır; başlık kutusu (logo / başlık / doküman kutusu) ve imzalar tablo sütunlarına oturur. Not: LibreOffice Excel sütun birimini biraz geniş yorumlar; orada sayfa yine tek parça ama yaklaşık %5 küçük basılır. Microsoft Excel’de ölçüler aynıdır.

### Sütun genişlikleri
- Resmi liste sekmesinde **Sütun genişlikleri**: Sıra No, Adı soyadı, Unvan ve hesap sütunları için − / + ya da milimetre yazarak. Daraltılan sütunun yeri gün sütunlarına kalır; önizleme hemen değişir, liste türüne kaydedilir (her liste türünün kendi genişlikleri olur).
- **Yazıya göre sığdır**: en uzun ad ve unvana göre genişlik. **Varsayılan**: otomatik genişliğe döner.

### Unvanlar
- Çizelgede kişinin adına dokunun › **Unvan**: daha önce eklenen unvanlar (Yönetim › Ünvanlar’daki tanımlar ve daha önce yazılanlar) dokunarak seçilir; yeni unvan da yazılabilir.
  - “Unvanı boş olan N kişiye de ver” ve “Yeni eklenen kişilere bu unvan kendiliğinden verilsin” seçenekleri.
- **⋯ › Unvanlar (toplu seç)**: herkes tek ekranda; seçilen unvanı “boş olanlara” ya da “hepsine” verin; yeni eklenenler için varsayılan unvan.
- Kişiye verilen unvan **hatırlanır**: sonraki aylarda, başka listede ya da kişi yeniden eklendiğinde kendiliğinden gelir. Unvanı olmayan yeni kişiye (Kişi ekle, yapıştır, yeni ay çizelgesi) varsayılan unvan yazılır.

### Kişi adını düzenleme (4.39.1)
- Çizelgede kişinin adına dokunun › **Adını düzenle**. Nöbetleri, istekleri, saat düzeltmesi ve unvanı yeni ada taşınır; aynı adla ikinci kişi olamaz; **Geri al** ile dönülür.
- Kişinin portaldaki hesabıyla eşleşme ada göre yapılır: yazım hatasını düzeltirken hesaptaki adla aynı yazın.

## 60. Nöbet dışı kişiler (sorumlu) ve profil fotoğrafını büyütme (4.40.0)
### Çizelgede nöbet dışı (sorumlu) kişiler
- **Varsayılan olarak nöbet dışı**: Blok yerleşimindeki **Sorumlular** listesindekiler ve Kurallar’daki **hesaplara dahil edilmeyenler**. Çizelgede kişinin adına dokunup **Nöbet dışı (sorumlu): evet / hayır** ile kişi kişi değiştirilir (o ayın çizelgesine kaydedilir).
- Nöbet dışı kişi:
  - **Otomatik doldurmaya girmez** (saat eşitlemeye de girmez).
  - Kendi mesaisi (ör. hafta içi 08-16) **günün gereken kişi sayısına sayılmaz**; hasta bakan kişi sayısı yalnız diğerlerinden hesaplanır. Otomatik doldurma ve Denetle buna göre eksik günü bulur.
  - Kendi saatleri (gereken / çalışılan / fazla mesai, resmi liste) ayrı hesaplanır; “iki nöbet arası en çok boşluk” uyarısı aranmaz.
  - Satırı mor işaretli, adının altında “nöbet dışı” yazar.
- **Ek nöbet**: nöbet dışı kişiye elle yazılan **gece kapsayan** (16-08, 08-08) ya da **hafta sonu / tatil** nöbeti kendiliğinden ek nöbet sayılır ve gereken kişi sayısına eklenir (hücrede mor çerçeve). Hücreye dokununca çıkan **Ek nöbet — gereken kişi sayısına say** kutusuyla her hücre ayrıca açılıp kapatılabilir (ör. hafta içi gündüz ek nöbeti saymak için işaretleyin).

### Profil fotoğrafına uzun basınca büyütme
- Uygulamanın her yerinde (üst çubuk, rehber, sohbet, kişi listeleri) profil fotoğrafına **basılı tutunca** fotoğraf tam ekran açılır; dokununca ya da geri tuşuyla kapanır.
- Fotoğrafın **kırpılmamış hâli** gösterilir: 4.40.0’dan sonra yüklenen fotoğrafların orijinal oranlı hâli (en çok 1600 px) ayrıca saklanır. Daha önce yüklenen fotoğraflarda kare hâli büyütülür; kişi fotoğrafını yeniden yüklerse orijinali de görünür.
- Fotoğraflar yalnız giriş yapmış kişilere açıktır (orijinal hâl dahil).

## 61. Onaylı istekleri çizelgeye ekleme (4.41.0)
Çizelgenin üstünde **İstekler (N)** düğmesi (telefonda **⋯ › Onaylı istekleri ekle**); N, henüz çizelgeye işlenmemiş istek sayısıdır. Pencerede ayarlar ve önizleme bulunur:
- **Kendiliğinden ekle** (varsayılan açık): çizelge her açıldığında yeni onaylanan istekler yazılır, geri çekilen / reddedilenlerin yazdığı hücreler silinir; ekranda kaç değişiklik yapıldığı yazar ve **Geri al** ile dönülebilir.
- **Yıllık izin isteği için kod**: izin / rapor kodlarından biri ya da “Yazma”. (Çizelge ayarlarındaki “İzin kodu” ile aynıdır.)
- **Boşluk isteği için kod**: bir kodla işaretleyin ya da “Boş bırak” (o güne yalnız nöbet yazılmaz).
- **Yıllık izni hafta sonu ve tatile de yaz**: kapalıysa yalnız iş günlerine yazılır.
- **Geri çekilen / reddedilen isteği çizelgeden de sil**: yalnız isteğin yazdığı hücre silinir; elle değiştirdiğiniz hücreye dokunulmaz.
- **İstek dolu bir güne denk gelirse**: “Dokunma, listede göster” ya da “İsteği yaz (nöbet silinir)”.
- **Önizleme**: bu aydaki istek günü sayısı, yazılacak / silinecek hücreler ve dolu güne denk gelenlerin listesi (kişi · gün · mevcut → yeni kod).
- **Yalnız ayarları kaydet** ya da **Kaydet ve uygula**. Ayarlar birim geneldir; otomatik doldurma da aynı ayarlara uyar (hafta sonu izni, boşluk kodu).
- Çizelgede elle girilen istekler (hücreye dokun › istek) de aynı şekilde işlenir.
- Not: onaylanan istek çizelge açıldığında işlenir; liste daha önce yayınlandıysa değişikliğin ekibe gitmesi için yeniden **Yayınla**.

## 62. Bildirim durumu listesi (4.42.0)
Ayarlar › Bildirimler › **Bildirim durumu** (yönetici; uç yayıncıya da açık):
- Uygulamayı açan her cihaz kendi durumunu bildirir (uygulama açılınca, öne gelince ve bildirim açılıp kapatılınca).
- Kişi kişi durum: **Açık** (kaç cihaz), **Açmamış**, **İzni reddetmiş**, **iPhone: ana ekrana eklememiş**, **iPhone: iOS güncel değil**, **Tarayıcı desteklemiyor**, **Bilinmiyor** (bu sürümden beri uygulamayı açmadı), **Hiç giriş yapmamış**; cihaz türü (Android / iPhone / Bilgisayar), son giriş, son hatırlatma.
- Filtreler (Açık değil, Herkes, duruma göre), kişi arama.
- **Hatırlat** (tek kişi), **Seçilenlere hatırlat**, **Açmayan herkese hatırlat**: kişiye uygulama içi bildirim ve e-posta (e-posta ayarlıysa) gider; metin kişinin durumuna göre adım adım ne yapacağını yazar (iPhone’da ana ekrana ekleme, reddedilmiş izni yeniden açma, Android pil tasarrufu). Aynı kişiye 12 saatte bir gönderilir; işlem günlüğüne yazılır.

## 63. Menü sekmesi ve yeni Hesabım (4.43.0)
### Alt çubukta “Menü”
- Telefonda alt çubuğun son sekmesi herkes için **Menü** (önceden üyede “Hesabım”, yayıncıda “Yönetim”). Yönetimde onay bekleyen varsa Menü’de sayı görünür.
- Menü ekranı: en üstte kişinin kartı (Hesabım; telefon bildirimi kapalıysa “Bildirim kapalı” uyarısı), altında uygulamanın **tüm bölümleri renkli kutucuklarla** gruplar hâlinde (Genel, Nöbet, Tablolar, Bölümler, Yönetim). İçerik yan menüyle aynıdır; kişinin yetkisi olmayan bölüm görünmez, okunmamış sayıları kutucukta yazar.
- Ana sayfa, üst çubuk ve yan menü (☰) değişmedi.

### Hesabım
- **Özet ekranı** (`#/profil`): büyük fotoğraf (dokununca değiştirilir), ad, unvan · birim, yetki.
- **Yapılacaklar** kartları: bildirimler kapalı (Şimdi aç / Nasıl açılır?), fotoğraf yok, şifre yok, telefon yok. Yapılacak yoksa görünmez.
- **Kısa liste**: Kişisel bilgiler, E-posta adresi, Bildirimler (Açık / Kapalı), Görünüm, Güvenlik ve şifre, (açıksa) Ücretim, Verilerim, Gönderilerim; altta Hesap bilgisi kartı ve **Çıkış yap**.
- Her satır **tek işi olan sade bir sayfa** açar; üstte “‹ Hesabım” geri düğmesi. Eski sekme bağlantıları (`#/profil/bildirim`, `#/profil/guvenlik`…) aynen çalışır.

## 64. Liste adı ↔ hesap kalıcı bağı, kısayollar, güvenlik (4.44.0)
### Ad bağı
- Nöbet listesindeki ad bir hesapla **bir kez eşleşince kalıcı olarak bağlanır** (hesap kimliğiyle saklanır). Listedeki ad (Excel) ya da hesaptaki ad sonradan değişse de kişinin nöbetleri, istekleri, değişimleri hesabında kalır.
- Bağ kendiliğinden kurulur: liste yüklenince / Google E-Tablolar eşitlenince ve kişi uygulamayı açınca, bağsız liste adı **tek bir** hesapla eşleşiyorsa. (Kendiliğinden bağda hesap adına dokunulmaz.)
- **Bağlı ad başkasına verilemez**: başka biri kayıt olurken, profilinden ya da yönetici kullanıcı düzenlerken o adı alamaz. Benzer adlı iki bağlı kişi de artık birbirine karışmaz.
- **Bağlı kişi adını kendisi değiştiremez** (Hesabım › Kişisel bilgiler’de ad kilitli, yanında hangi liste adına bağlı olduğu yazar).
- **Ayarlar › Nöbet › Liste adları ve hesaplar** (yönetici): bağsız / bağlı liste adları; bağsız ada hesap seçip **Bağla** (hesap adı liste adına güncellenir; Excel’de ad değiştiyse yeni adı böyle bağlayın), **Bağı kaldır**, **Otomatik eşleştir**.
- Çizelgede kişinin adı düzeltilirse (**Adını düzenle**) bağlı hesap yeni ada geçer, hesap adı da güncellenir; başka hesaba bağlı ad verilemez.

### Ana sayfa kısayolları
- Selam kartındaki kısayolların sonunda **kalem** düğmesi: kısayolları sıralayın, çıkarın, menüdeki herhangi bir sayfayı ekleyin (en çok 12). Hesaba kaydedilir; **Varsayılan** ile eski beşliye dönülür.

### Diğer
- Koyu temada Menü kutucukları ve Hesabım listesi düzeltildi.
- Fotoğrafı kırpılmamış hâli olmayan kişiye Hesabım’da “Fotoğrafınızı yeniden yükleyin” kartı.
- Güvenlik: fotoğraf yüklerken kırpılmamış hâl önizlemede gösterilir ve kişi isterse kaydedilmez; kartı açılmış kurayı başlatan üye silemez (yalnız yönetici / yayıncı), saatte en çok 30 kura; otomatik doldurmada süre sınırı her adımda denetlenir.

## 65. E-posta tasarımı (4.45.0)
Ayarlar › Bildirimler › **E-posta tasarımı** (yönetici). Bildirim, hatırlatma, davet ve diğer bütün e-postalar bu tasarımla gider.
- **Stil**: Kurumsal (üstte renkli çizgi), Sade (kartsız), Modern (ortalanmış logo, geniş düğme), Resmi yazı (tırnaklı yazı, çift çizgi), Renkli başlık (başlık bandı kurum renginde).
- **Kurum rengi**: hazır renkler ya da istediğiniz renk (düğme ve vurgular; açık renkte yazı kendiliğinden koyu olur).
- **Logo**: PNG, JPG ya da SVG yükleyin; e-posta programları SVG göstermediği için PNG’ye çevrilir. **Genişlik** 24–240 px, **hizası** sola / ortaya, isteğe bağlı logonun altında kurum adı. Ayrı e-posta logosu yoksa site logosu (SVG değilse) kullanılır.
- **Alt bilgi**: adres, birim, dahili gibi bir satır.
- **Önizleme** (telefon / bilgisayar genişliği) seçerken anında değişir; **Deneme e-postası** kayıtlı tasarımla gönderir.
- Logo e-postada sitenin herkese açık adresinden yüklenir (giriş gerekmez); bazı e-posta programları ilk açılışta “resimleri göster” diye sorabilir.

### Gmail’de gönderen resmi
Gelen kutusundaki yuvarlak resmi e-postanın içi değil gönderen adres belirler:
1. **Gmail / Google Workspace adresiyle** gönderiliyorsa o Google hesabına profil fotoğrafı koyun.
2. **Kendi alan adınızla** (ör. Hostinger e-postası) gönderiliyorsa **BIMI** gerekir: SPF + DKIM + DMARC (`p=quarantine` ya da `reject`), kare **SVG Tiny P/S** logo ve `default._bimi` DNS kaydı. **Gmail ayrıca ücretli marka sertifikası (VMC ya da CMC) ister**; Yahoo / AOL sertifikasız gösterir. Kart içindeki “Gmail’de gönderen resmi neden yok?” bölümü alan adınıza göre kayıtları yazar.

## 66. Güncellemeden sonra telefon bildirimlerinin kendiliğinden geri gelmesi (4.46.0 / 4.47.0)
Uygulama güncellenince arka plandaki bildirim servisi (service worker) yenilenir. Bazı telefonlarda (özellikle iPhone'da) bu sırada tarayıcı bildirim aboneliğini düşürür; izin verili kaldığı hâlde kişiye “Bildirimleriniz kapalı · Bildirimleri aç” uyarısı çıkardı.
- Artık uygulama açılınca **izin verili + bu cihazda daha önce açıktı + abonelik yok** durumunu görür ve izin penceresi açmadan **sessizce yeniden abone olur** (pwa.js `pushHeal`); uyarı çıkmaz, sunucudaki cihaz kaydı yenilenir.
- Kişi bildirimi o cihazda **kendisi kapattıysa** ya da **çıkış yaptıysa** onarılmaz (cihazda `nm-push-off` işareti).
- Bu sürüme geçişte cihazda henüz iz yoksa sunucuya en son aynı tür cihazdan “açık” bildirilmişse (push_state) yine onarılır.
- Onarım olmazsa (tarayıcı izin vermezse) uyarı “bağlantı kopmuş, tek dokunuşla yeniden bağlayın; izin sorulmaz” der.

## 67. Ay bitmeden gelecek ayın listesini yüklemek (4.47.0)
Gelecek ayın Excel listesini (ya da çizelgede yayınladığınız ayı) **aynı listeye** yükleyebilirsiniz; bu ayın kalan nöbetleri silinmez.
- Yalnızca yüklenen listenin kapsadığı günler değişir. Bu ayın nöbetleri **Takvimim**, **Kim nöbette**, hatırlatmalar ve nöbet değişimlerinde ay sonuna kadar görünür; gelecek ay da hemen görünür.
- Aylar birbirine karışmaz, ad çiftlenmez: bir günün nöbetleri tek ayın listesinden gelir. Bu ayın düzeltilmiş listesini yeniden yüklerseniz yalnızca bu ay değişir, gelecek ay korunur.
- Liste sayfası en son yüklenen ayı (Excel’i) gösterir; önceki ayın dosyası **Sürümler**’dedir.
- “Listenin ayı” düzeltmesi yalnızca listenin gösterdiği ayın kayıtlarını taşır.
- Bir yıldan eski aylar kendiliğinden temizlenir.
- Önceki sürümlerde aynı listeye yeni ay yüklenince bu ayın kalan nöbetleri siliniyordu; o listeyi bu sürümde bu ay için yeniden yüklerseniz geri gelir (önce bu ayın dosyasını Sürümler’den geri yükleyin, sonra gelecek ayınkini).
- Ayrı ayrı listeler (ör. “Kasım”, “Aralık”) açmaya gerek yok; açarsanız da çalışır ama İstekler ve ilanlar kişiyi iki listede görür.

## 68. Listede aylar: güncel ay, sıradaki ay, geçmiş aylar (4.48.0)
Bir nöbet listesi (ör. “Hemşire Nöbet Listesi”) artık birden çok ayı tutar; her ayın kendi Excel dosyası (son 5 sürümü) ve kendi nöbet kayıtları vardır. Ayrı ayrı liste açmanıza gerek yok.
- Liste sayfasında başlığın altında **ay çubuğu**: ★ **güncel ay** önde, yanında **sıradaki** aylar, eskiler **Geçmiş aylar** menüsünde. Herkes geçmiş aylara bakabilir.
- **Ay ekle** (yönetici / sorumlu): hangi ayın listesi olduğunu seçip Excel’i yükleyin. **Güncel ay yap** işaretliyse liste açılınca bu ay görünür; işaretsizse sıradaki / geçmiş ay olarak eklenir.
- **Güncel ay yap**: sıradaki ayı açıp düğmeye basın; önceki güncel ay geçmiş aylara geçer. Yeni ay başlayıp liste hâlâ eski ayı güncel gösteriyorsa yöneticiye “Aralık başladı, Aralık’ı güncel yap” önerisi çıkar.
- **Hesaplar**: her ayın nöbetleri kendi günlerinde geçerlidir; Takvimim, Kim nöbette, hatırlatmalar, kurallar, ilanlar ve değişimler hangi ayın güncel olduğundan bağımsız olarak doğru günün listesini kullanır. Bir ayı yüklemek / düzeltmek yalnızca o ayın günlerini değiştirir.
- **Yeni sürüm yükle** açık olan aya yükler. Dosyanın içindeki ay açık olan aydan farklıysa “Bu dosya hangi ayın?” diye sorulur. İlk yüklemede ay dosyanın içinden bulunur.
- **⋯ › “<ay> ayını listeden kaldır”**: o ayın dosyaları ve nöbet kayıtları silinir, diğer aylar kalır.
- Çizelgeden yayınlarken: bu ay ya da geçmiş güncel aydan yeni (bugünü aşmayan) ay güncel olur; gelecek ay **sıradaki ay** olarak eklenir.
- Google E-Tablolar’a bağlı listeler sekmeleriyle çalışmaya devam eder.

## 69. Yanlış giden bildirimi herkesten geri alma (4.48.0)
**Bildirimler › Gönderilenler** (yönetici ve sorumlu) ya da **Ayarlar › Bildirimler › Gönderilen bildirimler** (yönetici): son 30 günde giden bildirimler gönderim gönderim listelenir (kaç kişiye gitti, kaçı okudu, kim gönderdi).
- **Herkesten sil**: bildirim herkesin bildirim listesinden silinir. Telefon / bilgisayar ekranında duruyorsa uygulama açılınca ya da sıradaki bildirim geldiğinde kendiliğinden kapanır.
- Yönetici tüm gönderimleri, sorumlu yalnızca kendi gönderdiklerini görür ve siler.
- Gönderilmiş **e-postalar geri alınamaz**; kişisel mesaj ve arama bildirimleri listede görünmez.

## 70. İstek günleri açıkça yazılır (4.49.0)
İsteklerde günler artık “3-5” gibi kısaltılmaz (3 ile 5 diye okunuyordu):
- 5 güne kadar ardışık günler tek tek yazılır: **“3, 4, 5 B”**.
- Daha uzun aralık başlangıç → bitiş ve gün sayısıyla yazılır: **“7 → 18 (12 gün) Yİ”**; ay aşan: “28 Ara → 2 Oca (6 gün)”.
- Pano, İsteklerim, Yönetim, önizleme ve bildirim metinlerinde aynı yazım kullanılır.

## 71. Herkes için ana ekran (4.50.0)
Ayarlar › Genel › **Herkes için ana ekran** (yönetici). Ana ekranı bir kez herkes için kurun; kişiler ayar yapmadan hazır ve sade bir ekran görür.
- **Hazır düzen**: **Sade** (bugünkü nöbet, okunacaklar, 4 büyük kısayol, akış ve diğer kartlar gizli, kişiler değiştiremez — hiç anlamayanlar için), **Standart** (bugünkü düzen), **Tam** (her şey açık, geri sayım dahil). Sonra tek tek değiştirilebilir (Özel).
- **Ana sayfa bölümleri**: gizle / göster / sırala. **“Kişiler kendi ana sayfasını değiştirebilsin”** kapalıyken herkes tam olarak bu düzeni görür.
- **Kısayollar**: herkes için siz seçip sıralarsınız; **Büyük düğmeler** (simgeli kutucuklar); **“Kişi yanına kendi kısayolunu ekleyebilsin”** kapalıyken düzenleme kalemi görünmez.
- **Üst çubuk simgeleri**: telefon rehberi, arama, mesajlar, yeni içerik, tema ayrı ayrı gizlenir (zil ve profil her zaman görünür).
- **Alt menü (telefon)**: Nöbet, “+”, Okunacak gizlenebilir (Ana sayfa ve Menü her zaman).
- **Sorumlular** sekmesi: sorumlular ve yöneticiler için ayrı düzen (kapalıyken herkesinkini görürler).
- Yanda **canlı önizleme** (“Üye böyle görecek”); **Herkese uygula**; isteğe bağlı kişilerin kendi değişikliklerini sıfırla; **Herkes için düzeni kaldır** ile eski hâline döner.
- Düzen değişince kişiye ana sayfada bir kez “Ana ekranınız sadeleştirildi; aradığınız her şey Menü’de” notu çıkar.
- **Menü** sayfasının üstünde **“Ne arıyorsunuz?”** arama kutusu: “izin” → İstekler, “numara” → Telefon rehberi gibi gündelik sözcüklerle de bulur.
- Eski “Herkesin ana sayfası” kartı bu kartın içine taşındı (aynı düzen).

## 72. Sayfa ve menü adları (4.50.0)
Ayarlar › Genel › **Sayfa ve menü adları** (yönetici): her adın karşısına yenisini yazın (ör. “Takvimim” → “Nöbetlerim”); boş bırakılan varsayılan kalır.
- Yeni ad yan menüde, Menü kutucuklarında ve menü aramasında, ana sayfa kısayollarında, nöbet sekmelerinde, menü başlıklarında (Nöbet, Bölümler, Yönetim, Tablolar), telefondaki alt menüde ve sayfa başlıklarında görünür.
- Adlar **veritabanında** saklanır (setting ui_labels); güncelleme paketi veritabanına dokunmadığı için **güncellemelerde değişmez**.
- Bölüm (kategori) ve nöbet listesi adları kendi sayfalarından değiştirilir.

## 73. Boş sohbetler ve yöneticinin sohbet silmesi (4.50.1 / 4.51.0)
- Kişi kartından **Mesaj** ile açılıp hiç yazılmayan birebir sohbet artık iki tarafın listesinde de görünmez; ilk mesajla listeye gelir. Aynı kişiye tekrar dokununca aynı sohbet açılır.
- **Yönetim › Kullanıcılar › Tüm sohbetler** (yönetici): biriminizden birinin bulunduğu bütün sohbetler tek listede — birebirde kim kiminle (“Ayşe Kaya ↔ Burak Demir”, başka birimdense birim adıyla), gruplarda üyeler, mesaj sayısı, son mesaj. Arama kutusuyla bulunur.
- Kişi bazında: **Kullanıcılar › kişi › ⋯ › Sohbetleri**.
- **Herkesten sil**: birebir sohbetler (karşı taraf başka birimde olsa da) ve biriminizde kurulan gruplar mesajlar, dosyalar, tepkiler ve aramalarla birlikte herkes için kalıcı silinir. Başka birimin kurduğu grupta yalnız biriminizdeki kişiler listeden çıkarılır.
- **Mesaj içerikleri gösterilmez** (KVKK). Her silme işlem günlüğüne yazılır; sohbetteki kişilere “Bir sohbetiniz yönetici tarafından silindi” bildirimi gider. Birim grubu silinemez.

## 74. Devir ilanı tüm listelere açık (4.52.0)
- **Devret** ilanı, kurallara uyan herkese açıktır: ilan sahibiyle aynı listede olmayan (başka nöbet listesindeki) kişiler de görür, başvurur; yeni ilanda uygun olanlara bildirim gider.
- Uygunluk kişinin **tüm listelerindeki** nöbetleriyle denetlenir (başka listedeki nöbet günü boş sanılmaz); ilan sahibinin boşluk denetimi de tüm listeleriyle yapılır.
- İlan kartında nöbetin hangi listeden olduğu yazar. İlan sahibi başvuranlarda “Başka listeden · Excel’de bu listeye eklenir” görür; seçince sorumluya “Excel’e işlenecek” bildirimi gider.
- **Değiş** (takas) ilanı yalnız aynı listedeki kişilere açıktır (iki listenin Excel’i birlikte değişmesin).

