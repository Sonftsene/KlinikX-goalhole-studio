# NöbetMed — Hostinger Kurulum Rehberi

Klinik ekibiniz için duyuru, protokol, eğitim ve nöbet çizelgesi portalı.
PHP 8.0+ olan her paylaşımlı sunucuda (Hostinger dahil) ek kurulum gerektirmeden çalışır.

## 1. Yükleme (5 dakika)

1. Hostinger hPanel → **Dosya Yöneticisi** → `public_html` klasörünü açın.
   (Alt klasöre de kurabilirsiniz, ör. `public_html/portal`.)
2. ZIP dosyasını yükleyin ve **Çıkart (Extract)** deyin. `index.php` doğrudan bu klasörde olmalı.
3. `data` ve `uploads` klasörlerinin izni **755** olsun (Hostinger'da varsayılan).
4. hPanel → **SSL** bölümünden ücretsiz SSL'i açın ve **HTTPS'e zorla (Force HTTPS)** seçeneğini etkinleştirin.
5. Sitenizi açın. İlk ekranda **kurum adı** ve **ilk yönetici hesabını** oluşturun. Hepsi bu.

Veritabanı ilk açılışta otomatik oluşur (`data/nobetmed.sqlite`). SQL içe aktarmanıza gerek yoktur.

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

## 4. Şifremi unuttum

Sunucudan e-posta gönderimi güvenilir olmadığı için şifre sıfırlama yöneticiden yapılır:
**Kullanıcılar → ⋯ → Geçici şifre oluştur.** Kişi giriş yaptıktan sonra **Hesabım** sayfasından şifresini değiştirir.

## 5. MySQL kullanmak isterseniz (isteğe bağlı)

SQLite yüzlerce kullanıcı için yeterlidir. Yine de MySQL isterseniz:

1. hPanel → **Veritabanları → MySQL** → yeni veritabanı ve kullanıcı oluşturun.
2. `config.php` dosyasında `DB_DRIVER` değerini `'mysql'` yapın, `DB_NAME`, `DB_USER`, `DB_PASS` alanlarını doldurun.
3. Siteyi açın; tablolar otomatik oluşur.

## 6. Google ile giriş (isteğe bağlı)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **OAuth istemci kimliği** → *Web uygulaması*.
2. **Yetkili JavaScript kaynakları** kısmına site adresinizi ekleyin (ör. `https://portal.hastaneniz.com`).
3. Oluşan istemci kimliğini `config.php` içindeki `GOOGLE_CLIENT_ID` satırına yapıştırın.

Google ile gelen yeni kişiler de kayıt ayarınıza (onaylı / açık / kapalı) tabidir.

## 7. Nöbet listeleri (Excel)

- Nöbet listeleri **Excel dosyası olarak yüklenir** ve sitede doğrudan, Excel'deki gibi açık görünür: renkler, kalın yazılar, kenarlıklar, birleştirilmiş hücreler, sütun genişlikleri, dondurulmuş satır/sütunlar ve birden fazla sayfa (alt sekmeler).
- Desteklenen biçimler: `.xlsx`, `.xlsm`, `.xls`, `.ods`, `.csv` (PDF veya fotoğraf da yüklenebilir).
- İstediğiniz kadar liste açabilir, her birine ad verebilirsiniz. Listeler arasındaki geçiş anında olur.
- Listeyi güncellemek için **Yeni sürüm yükle** deyin. Son 15 sürüm saklanır. Yanlış dosya yüklenirse **⋯ → Önceki sürümler** bölümünden geri alabilirsiniz.
- Ekip üyeleri listede arama yapabilir. **Beni bul** düğmesi, kendi adlarının geçtiği hücreleri işaretler.

## 8. Dosya yükleme

- **Her tür dosya** yüklenebilir. PDF, Excel, Word (.docx), görsel, video, ses ve metin dosyaları sitede doğrudan açılır. Diğerleri (PowerPoint, eski .doc, zip vb.) indirilerek açılır.
- **Boyut sınırı yoktur.** Dosyalar küçük parçalar halinde gönderildiği için sunucunun PHP yükleme sınırına takılmaz. Tek sınır hosting paketinizin disk alanıdır.
- İsterseniz `config.php` → `MAX_UPLOAD_MB` ile dosya başına bir sınır koyabilirsiniz (0 = sınırsız).

## 9. Yedekleme

Tüm veriler iki yerdedir:

- `data/nobetmed.sqlite` — veritabanı
- `uploads/` — yüklenen dosyalar

Bu ikisini düzenli olarak indirmeniz yeterlidir (Hostinger otomatik yedekleri de bunları kapsar).

## 10. Gizlilik ve güvenlik

- Site arama motorlarına kapalıdır (`robots.txt`, `X-Robots-Tag` başlığı ve sayfa etiketleri).
- Giriş yapmayan kişi hiçbir içerik göremez. Misafir bağlantısı yalnızca tek bir içeriği, süreli olarak açar ve istediğiniz an iptal edilebilir.
- `data`, `uploads` ve `inc` klasörlerine tarayıcıdan doğrudan erişim engellidir; dosyalar yalnızca yetki kontrolünden sonra indirilir.
- Yüklenen dosyalar sunucuda uzantısız (`.bin`) saklanır, bu yüzden yüklenen hiçbir dosya sunucuda çalıştırılamaz.
- Şifreler tek yönlü şifrelenir; 15 dakikada 8 hatalı denemeden sonra giriş geçici olarak kilitlenir.

## 11. Telefonda uygulama gibi kullanma

Siteyi telefonda açın → tarayıcı menüsü → **Ana ekrana ekle**. Portal, kendi simgesiyle uygulama gibi açılır.
