# dupcii — yol haritası (4.x: çok hastaneli, modüllü portal)

Önceki yol haritası (3.9: kural motoru, blok yerleşimi, istekler, ilan, çağrı, tatil, ücret, hatırlatma, geri sayım) tamamlandı.
Kişi adları / gerçek veriler bu dosyaya yazılmaz.

## Kullanıcı kararları
- Bir kişi yalnız **bir birimde** çalışır (birden çok birim yok).
- Hastane içinde **telefon rehberi ortak**; protokoller bazen hastane geneli, bazen birime özel.
- Herkes **tek adresten** girer; giriş sonrası yalnız kendi hastane + birimini görür.
- Ölçek: şimdilik birkaç hastane; gerekirse barındırma büyütülür.
- Çağrı, ilan ve değişimlerde yönetici/yayıncı silebilir (3.11.0'da yapıldı).
- Modüller, yetkiler, aç/kapat ve hastane/birim ayarları **süper yönetici** tarafından yönetilir.
- WhatsApp'a ihtiyaç bırakmayan, portala özgü mesajlaşma (gruplar, birebir, medya, dosya, bağlantı, grup yöneticisi ayarları; sorumlular/yöneticiler ayrı gruplar).
- Excel olmayan birimler için başka kaynaklar (portalda çizelge, CSV, diğer sistemlerden aktarım).
- Şişirme yok: modern, hızlı, donmayan; her özellik test edilerek ayrı sürümle gelir.

## Mimari ilke: tek kod, ayrı veri
- **Merkez** (`data/merkez`): hastaneler, birimler, e-posta → birim dizini (yalnız e-posta özeti/hash), modül ayarları, süper yönetici hesapları, giriş deneme sınırı, süper yönetici günlüğü. Hasta/kişi verisi YOK.
- **Hastane** (`data/h<id>/`): hastane ortak verisi — ortak rehber, hastane geneli belgeler/duyurular, mesajlaşma (birim grupları + birimler arası gruplar; üyelik denetimi sunucuda).
- **Birim** (`data/h<id>/u<id>/`): bugünkü uygulamanın tüm verisi (kullanıcılar, nöbetler, Google tabloları, istekler, ilanlar, dosyalar…). Bir birimin kullanıcısı başka birimin dosyasına teknik olarak ulaşamaz.
- Tüm veritabanı erişimi `db()` üzerinden: istek, oturumdaki birime göre doğru dosyayı açar. Oturum çerezi birime bağlı; birim değişirse oturum geçersiz.
- Tek zip güncelleme → tüm birimler; her birimin şeması ilk istekte kendiliğinden yükseltilir. Tek cron tüm birimleri sırayla dolaşır (süre sınırlı, kaldığı yerden devam).
- Paylaşımlı barındırma (Hostinger) gerçeği: WebSocket yok → mesajlaşma görünürken kısa aralıklı, hafif "son mesajdan beri" sorgusu (değişiklik yoksa boş yanıt), arka planda web push. Uzun bekleten istek (long-poll) kullanılmaz: PHP işlem sınırını doldurur.
- MySQL kurulumu: birim başına ayrı veritabanı Hostinger'da elle açılır; bu yüzden çok hastaneli kurulumda SQLite önerilir. MySQL için tablo öneki yöntemi ayrı aşamada.

## Aşamalar (her biri ayrı sürüm, güncelleme testi + izolasyon testleriyle)
### 3.11.0 — Silme yetkileri ✓
- Eksik çağrısı tamamen silme (yanıtlarıyla; gelecekteki çağrıda gönüllülere haber), Değişim geçmişinden ilan/değişim/devir/çağrı silme (yönetici/yayıncı), yayıncıya sorulan çağrıya kendi yanıtı, "Gelemez" yanıtı da çağrıyı açana bildirilir.

### 4.0 — Çok hastaneli altyapı ✓ (4.0.0)
- Merkez/hastane/birim veri ayrımı, tek giriş (e-posta → birim), birim başına oturum.
- Süper yönetici paneli: hastane ve birim ekle/düzenle/dondur, birim yöneticisi davet et, birim sayıları (kişi, depolama), toplu yedek. Hasta/kişi içeriği görmez.
- Süper yönetici hesabında iki adımlı doğrulama zorunlu (uygulama kodu veya parmak izi).
- Mevcut kurulum kendiliğinden "1. hastane / 1. birim" olur; adresler, şifreler, veriler aynen kalır.
- Testler: A biriminin kullanıcısı B'nin dosyasına, nöbetine, hasta listesine, bildirimine, yedeğine ulaşamaz; aynı e-posta iki birimde açılamaz.

### 4.1 — Modüller ve yetkiler ✓ (4.1.0: modül aç/kapat hastane+birim, roller Göremez/Kullanır/Yönetir; ince ayrım (ekle/sil/onayla ayrı) gerekirse sonra)
- Modül kayıt defteri: her modül hastane ve birim düzeyinde açılır/kapanır (kapalı modülün uçları sunucuda da kapalı).
- Rol + modül bazlı izinler: görüntüle / ekle / düzenle / sil / onayla. Hazır roller (birim yöneticisi, sorumlu, yayıncı, eğitim hemşiresi, üye) + birime özel rol. Süper yönetici şablon verir, birim yöneticisi kendi biriminde (izin verilen kadarını) düzenler.

### 4.2 — Hastane ortak alanları ✓ (4.2.0: hastane veritabanı, ortak rehber, hastane belgeleri; hastane duyurusu = belge türü 'Duyuru')
- Ortak rehber (birim rehberleri + hastane geneli numaralar), hastane geneli belge kütüphanesi (protokol: hastane geneli / birime özel / ikisi), hastane duyurusu.

### 4.3–4.4 — Mesajlaşma (WhatsApp'sız) — 4.3.0 ✓ (birim grubu, gruplar, birebir, fotoğraf/dosya, yanıt, sil, kim okudu, grup yöneticisi, sessize al, T.C. kimlik engeli); 4.4.0 ✓ sesli mesaj, anket, tepki, ilet, sabitle, @bahsetme, davet bağlantısı, saklama süresi (video zaten dosya önizlemesiyle açılıyor)
- Her birime otomatik birim grubu; özel gruplar; birebir sohbet; hastane geneli "sorumlular/yöneticiler" grupları (birimler arası, yalnız davetle).
- Metin, fotoğraf (telefonda sıkıştırılarak), video, sesli mesaj, dosya, bağlantı önizleme; yanıtla, ilet, tepki, sabitle, @bahsetme, okundu bilgisi (kimler okudu), arama, anket, duyuru modu.
- Grup yöneticisi: üye ekle/çıkar, yönetici yap, yalnız yöneticiler yazsın, grup bilgisi/fotoğrafı düzenlesin, davet bağlantısı (süreli), herkesten mesaj silme, sessize alma.
- KVKK: hasta bilgisi uyarısı; T.C. kimlik numarası (algoritma denetimli) ve benzeri içerik gönderilmeden yakalanır; mesaj/medya saklama süresi birim ayarı; silinen dosya sunucudan da silinir.

### 4.5 — Excel olmayan birimler ve entegrasyon ✓ (4.5.0: portalda çizelge, kural denetimi, otomatik doldurma, yapıştır/CSV aktarımı, yayınla; anahtarlı içe aktarma ucu belirli bir sistem görüldüğünde)
- Portalda nöbet çizelgesi hazırlama (kural motoruyla uyarılar, otomatik öneri, yayınla → bugünkü tüm özellikler aynen çalışır).
- Kaynak bağdaştırıcıları: Excel/Google (var), CSV, ICS takvim, başka sistemden düzenli dışa aktarma dosyası; anahtarlı içe aktarma ucu (başka sistemin göndermesi için). Belirli bir hastane bilgi sistemiyle bağlantı, o sistemin dışa aktarma biçimi/izni görüldükten sonra yapılır.

### 4.6 — WhatsApp düzeyinde sohbet, grup ve gizlilik ayarları ✓ (4.6.0)
- Gizlilik (son görülme, hakkımda, okundu bilgisi, gruplara ekleme, bulunabilirlik, kimler yazabilir, engelleme, varsayılan kaybolan mesaj), sohbet (sabitle, arşiv, okunmadı, süreli sessiz, temizle/sil, düzenle, benden sil, yıldız, ara, medya/belge/bağlantı, dışa aktar, yazıyor), grup (fotoğraf, bilgiyi/üye eklemeyi kim yapar, katılma onayı, yöneticilikten ayrılma), cihaz görünüm tercihleri.

### 4.7 — Bildirim sistemi ✓ (4.7.0)
- Sayfa yenilemeden canlı bildirim kartları (hızlı yanıt, ses, titreşim, rozet), uçtan uca şifreli telefon bildirimi (site simgesi, gruplanan sohbet bildirimi, Aç/Okundu düğmeleri), kategori bazlı kişisel tercihler, duraklatma, sessiz saatler, içerik gizleme, cihazlar; yönetici politikası (varsayılanlar, zorunlu kategoriler, KVKK içerik gizleme, kapsama istatistiği); bildirim merkezi sayfası; birimler arası anında bildirim.

### 4.8 — WhatsApp özellikleri ✓ (4.8.0)
- Birebir sesli/görüntülü arama (WebRTC, birimler arası, arama geçmişi, TURN ayarı), grupta gönderen profili (mesaj/ara/telefon), yönetici yazma kısıtlaması ve gruptan engelleme, @herkes, uzun bas menüsü ve her emojiyle tepki, sağa kaydırıp yanıt, çoklu seçim, emoji paneli, kamera (fotoğraf/video), video, tek seferlik görüntüleme, konum ve kişi paylaşımı, taslaklar, okunmamış ayıracı, sesli mesaj hızı, bağlantı/telefon tanıma, yapıştır/sürükle-bırak. (Durum paylaşımı bilinçli olarak yok.)

### 4.9 — İzin bitişiği hafta sonu ve ekstra nöbet ✓ (4.9.0)
- Hafta içi 5 iş günü izinliyi izin öncesi/sonrası hafta sonu ekstra çağırmama (ayarlanabilir); ekstra nöbet isteyenler: istek gününden ay sonuna kurallara uygun günler, sorumlu için gün gün uygun gönüllüler, çağrıda öncelik.

### 4.10–4.11 — Nöbet devral, QR ile giriş ✓ (4.10.0, 4.11.0)
- Hem kişinin hem nöbet sahibinin kurallarına uyan nöbetleri toplu görüp devralma isteği; bilgisayarda karekodla giriş, bağlı cihazlar ve uzaktan çıkış.

### 4.12 — Hastane yemek listesi ✓ (4.12.0)
- Aylık listeyi PDF / Excel / CSV'den içe aktarma (düzenlenebilir önizleme), gün gün ve ay görünümü, saate göre şimdiki/sıradaki öğün (01:00 / 12:00 / 18:00, ayarlanabilir), nöbet saatlerine düşen öğünler, ana sayfa kartı, kişisel görünürlük (her gün / yalnız nöbetlerimde / gizle); çok birimlide hastane ortak.

### 4.13 — Kişi kartı ve güvenlik taraması ✓ (4.13.0)
- Her yerde ada dokununca kişi kartı (mesaj, sesli/görüntülü arama, telefon, SMS, WhatsApp, yaklaşan nöbetler); iletişim gizliliği; QR'da sayı doğrulaması; oturum/kayıt/giriş sertleştirmesi; yemek listesi sahipliği.

### 4.15 — Abonelik ve ödeme ✓ (4.15.0)
- Paketler, birim aboneliği, deneme, ek süre, ücretsiz paket / salt okunur, kişi sınırı; PayTR, iyzico, havale; sistem yöneticisi tam kontrol (görünürlük ve zorunluluk ayrı anahtarlar, varsayılan kapalı); hatırlatmalar; sözleşme onayı.
- Sonra: kayıtlı kartla otomatik yenileme (PayTR kart saklama / iyzico abonelik API), e-Fatura entegrasyonu, kupon/indirim, kendi kendine birim açma (tanıtım sayfası).

### 4.16 — Birim açma başvurusu ve doğrulama ✓ (4.16.0)
- Herkese açık başvuru (e-posta kodu, hastane arama ve o hastanedeki birimler, belge), elle onay; doğrulama işaretleri (kurumsal e-posta, aynı hastanedeki birim yöneticilerinin teyidi, kopya birim, aynı bağlantı), bilgi iste / ret / geçersiz + engel; onayda hastane + birim + yönetici tek adımda; KVKK saklama süreleri.

### 4.17 — Tanıtım, yasal sayfalar, KVKK kişi hakları, sunucu dışı yedek ✓ (4.17.0)
- Herkese açık tanıtım sayfası ve 5 yasal metin (künyeden doldurulan taslaklar), aydınlatma metni okundu kaydı, Verilerim (JSON kopya, silme talebi), şifreli sunucu dışı haftalık yedek (e-posta + indir).
- Kullanıcı tarafı: Hostinger cron, SPF/DKIM/DMARC, metinlerin hukukçuya kontrolü.

### Sırada — kullanıcının aklında tutulmasını istediği fikirler
1. **Davet et, kazan** (kendi kendine birim açma 4.16'da başvuru olarak geldi): birim sorumlusu başka birim/hastane davet eder; davet edilen birim kurulunca iki taraf da 1 ay ücretsiz (bl_extend). Davet kodu, kim kimi getirdi raporu (sistem yöneticisi), tanıtım sayfasından "biriminizi açın" (deneme kendiliğinden başlar, sistem yöneticisi onayı ayarlanabilir).
2. **Gerçekleşen saat (puantaj) — küçültülmüş:** Excel listesinde aylık toplam zaten yazıyor; tam puantaj modülü gerekmiyor. Yalnız Excel'in bilmediği fark: değişim, devir, parça (gündüz/gece) ve ekstra nöbetlerden sonra kişinin **gerçekleşen** saati ve listedeki toplamdan farkı (kişi kendi görür, sorumlu tek tabloda görür, Excel'e aktarır).

### 5.0+ — Ek modüller (her biri aç/kapat)
- Kontrol listeleri (acil arabası, cihaz kontrolleri; günlük/haftalık, kim yaptı), nöbet devir notu (hasta adı korumalı), eğitim ve sertifika takibi (geçerlilik hatırlatması), arıza/malzeme bildirimi, olay/güvenlik bildirimi (isteğe bağlı anonim), anket/oylama, toplantı ve eğitim takvimi + katılım.

### Sürekli: KVKK ve güvenlik
- Aydınlatma metni ve onay kaydı, kişinin kendi verisini indirme/silme talebi, veri saklama süreleri, şifreli yedek, yönetici rollerinde iki adımlı doğrulama, giriş deneme sınırı, günlükte kişisel veri bırakmama, her modülde yetki testleri.
- Hız: modül betikleri yalnız gerektiğinde yüklenir, sayfalı listeler, dizinler, görsel küçültme.
