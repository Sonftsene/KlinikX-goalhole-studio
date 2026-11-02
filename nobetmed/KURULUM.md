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

- **Bölüm ve birimler** → Servislerinizi (Yoğun Bakım, Acil…) ve vardiya saatlerinizi düzenleyin.
- **Ayarlar** → Üye kaydı türünü seçin:
  - *Onaylı kayıt* (varsayılan): Herkes kayıt olur, siz onaylayınca giriş yapar.
  - *Açık kayıt*: Kayıt olan hemen girer.
  - *Kapalı*: Yalnızca sizin eklediğiniz kullanıcılar.
- **Kullanıcılar** → Ekibi ekleyin. Şifre boş bırakılırsa geçici şifre üretilir.

## 3. Yetkiler

| Yetki | Neler yapabilir |
|---|---|
| **Yönetici** | Her şey: kullanıcılar, bölümler, ayarlar, içerik onayı, nöbet çizelgesi |
| **Yayıncı** | Onaysız yayın, ekibin içeriklerini onaylama, nöbet çizelgesi düzenleme |
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

## 7. Dosya boyutu sınırı

Varsayılan sınır dosya başına 100 MB'tır (`config.php` → `MAX_UPLOAD_MB`).
Sunucunun PHP sınırı daha düşükse uygulama otomatik olarak onu gösterir.
Büyük videolar için hPanel → **Gelişmiş → PHP Yapılandırması** → `upload_max_filesize` ve `post_max_size` değerlerini artırın.

## 8. Yedekleme

Tüm veriler iki yerdedir:

- `data/nobetmed.sqlite` — veritabanı
- `uploads/` — yüklenen dosyalar

Bu ikisini düzenli olarak indirmeniz yeterlidir (Hostinger otomatik yedekleri de bunları kapsar).

## 9. Gizlilik ve güvenlik

- Site arama motorlarına kapalıdır (`robots.txt`, `X-Robots-Tag` başlığı ve sayfa etiketleri).
- Giriş yapmayan kişi hiçbir içerik göremez. Misafir bağlantısı yalnızca tek bir içeriği, süreli olarak açar ve istediğiniz an iptal edilebilir.
- `data`, `uploads` ve `inc` klasörlerine tarayıcıdan doğrudan erişim engellidir; dosyalar yalnızca yetki kontrolünden sonra indirilir.
- Şifreler tek yönlü şifrelenir; 15 dakikada 8 hatalı denemeden sonra giriş geçici olarak kilitlenir.

## 10. Telefonda uygulama gibi kullanma

Siteyi telefonda açın → tarayıcı menüsü → **Ana ekrana ekle**. Portal, kendi simgesiyle uygulama gibi açılır.
