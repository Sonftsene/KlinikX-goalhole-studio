# NöbetMed — Hostinger Kurulum Rehberi

Klinik ekibiniz için duyuru, protokol, eğitim ve nöbet çizelgesi portalı.
PHP 8.0+ olan her paylaşımlı sunucuda (Hostinger dahil) ek kurulum gerektirmeden çalışır.

## 1. Yükleme (5 dakika)

1. Hostinger hPanel → **Dosya Yöneticisi** → `public_html` klasörünü açın.
   (Alt klasöre de kurabilirsiniz, ör. `public_html/portal`.)
2. ZIP dosyasını yükleyin ve **Çıkart (Extract)** deyin. `index.php` doğrudan bu klasörde olmalı.
3. `data` ve `uploads` klasörlerinin izni **755** olsun (Hostinger'da varsayılan).
4. hPanel → **SSL** bölümünden ücretsiz SSL'i açın ve **HTTPS'e zorla (Force HTTPS)** seçeneğini etkinleştirin.
5. Sitenizi açın.
   - Paketiniz size özel hazırlandıysa (`config.php` içinde `INITIAL_ADMIN_*` dolu) yönetici hesabınız hazırdır: e-posta adresiniz ve size verilen **geçici şifre** ile giriş yapın, ilk girişte kendi şifrenizi belirleyin.
   - Aksi halde ilk ekranda **kurum adı** ve **ilk yönetici hesabını** oluşturun.

Veritabanı ilk açılışta otomatik oluşur (`data/` klasöründe, tahmin edilemez bir adla). SQL içe aktarmanıza gerek yoktur.

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
İsterseniz hPanel → **Gelişmiş → Cron Jobs** ile 5 dakikada bir `php /home/KULLANICI/public_html/cron.php` çalıştırarak yedek gönderim ekleyebilirsiniz (zorunlu değildir).

Ek olarak:
- Zorunlu okumalarda **Okumayanlara e-posta ile hatırlat** düğmesi çıkar.
- Giriş ekranında **Şifremi unuttum** çalışır (1 saat geçerli, tek kullanımlık bağlantı).
- Kullanıcı eklerken giriş bilgileri e-postayla gönderilebilir.
- Her kişi **Hesabım** sayfasından duyuru e-postalarını kapatabilir. Hatırlatma ve hesap e-postaları her zaman gider.

## 5. Şifremi unuttum ve geçici şifreler

- E-posta ayarlıysa kişi giriş ekranındaki **Şifremi unuttum** ile kendi şifresini yeniler.
- Yönetici her zaman **Kullanıcılar → ⋯ → Geçici şifre oluştur** diyebilir.
- Geçici şifreyle giren herkes, devam etmeden önce kendi şifresini belirlemek zorundadır.

## 6. MySQL kullanmak isterseniz (isteğe bağlı)

SQLite yüzlerce kullanıcı için yeterlidir. Yine de MySQL isterseniz:

1. hPanel → **Veritabanları → MySQL** → yeni veritabanı ve kullanıcı oluşturun.
2. `config.php` dosyasında `DB_DRIVER` değerini `'mysql'` yapın, `DB_NAME`, `DB_USER`, `DB_PASS` alanlarını doldurun.
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

## 9. Dosya yükleme

- **Her tür dosya** yüklenebilir. PDF, Excel, Word (.docx), görsel, video, ses ve metin dosyaları sitede doğrudan açılır. Diğerleri (PowerPoint, eski .doc, zip vb.) indirilerek açılır.
- **Boyut sınırı yoktur.** Dosyalar küçük parçalar halinde gönderildiği için sunucunun PHP yükleme sınırına takılmaz. Tek sınır hosting paketinizin disk alanıdır.
- İsterseniz `config.php` → `MAX_UPLOAD_MB` ile dosya başına bir sınır koyabilirsiniz (0 = sınırsız).

## 10. Yedekleme

Tüm veriler iki yerdedir:

- `data/` klasörü — veritabanı (`nm-….sqlite`) ve adını tutan `.dbname.php`
- `uploads/` — yüklenen dosyalar

Bu ikisini düzenli olarak indirmeniz yeterlidir (Hostinger otomatik yedekleri de bunları kapsar).

## 11. Gizlilik ve güvenlik

- Site arama motorlarına kapalıdır (`robots.txt`, `X-Robots-Tag` başlığı ve sayfa etiketleri).
- Giriş yapmayan kişi hiçbir içerik, nöbet listesi veya dosya göremez.
- Misafir bağlantıları varsayılan olarak **kapalıdır**. Ayarlar → Gizlilik bölümünden açılırsa, yetkililer tek bir içeriği süreli bağlantıyla paylaşabilir. Kapatıldığında tüm bağlantılar anında geçersiz olur.
- `data`, `uploads` ve `inc` klasörlerine tarayıcıdan doğrudan erişim engellidir; dosyalar yalnızca yetki kontrolünden sonra indirilir.
- Yüklenen dosyalar sunucuda uzantısız (`.bin`) saklanır, bu yüzden yüklenen hiçbir dosya sunucuda çalıştırılamaz.
- Şifreler tek yönlü şifrelenir; 15 dakikada 8 hatalı denemeden sonra giriş geçici olarak kilitlenir.

## 12. Telefonda uygulama gibi kullanma

Siteyi telefonda açın → tarayıcı menüsü → **Ana ekrana ekle**. Portal, kendi simgesiyle uygulama gibi açılır.
