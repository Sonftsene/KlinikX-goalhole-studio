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

### 4.3–4.4 — Mesajlaşma (WhatsApp'sız)
- Her birime otomatik birim grubu; özel gruplar; birebir sohbet; hastane geneli "sorumlular/yöneticiler" grupları (birimler arası, yalnız davetle).
- Metin, fotoğraf (telefonda sıkıştırılarak), video, sesli mesaj, dosya, bağlantı önizleme; yanıtla, ilet, tepki, sabitle, @bahsetme, okundu bilgisi (kimler okudu), arama, anket, duyuru modu.
- Grup yöneticisi: üye ekle/çıkar, yönetici yap, yalnız yöneticiler yazsın, grup bilgisi/fotoğrafı düzenlesin, davet bağlantısı (süreli), herkesten mesaj silme, sessize alma.
- KVKK: hasta bilgisi uyarısı; T.C. kimlik numarası (algoritma denetimli) ve benzeri içerik gönderilmeden yakalanır; mesaj/medya saklama süresi birim ayarı; silinen dosya sunucudan da silinir.

### 4.5 — Excel olmayan birimler ve entegrasyon
- Portalda nöbet çizelgesi hazırlama (kural motoruyla uyarılar, otomatik öneri, yayınla → bugünkü tüm özellikler aynen çalışır).
- Kaynak bağdaştırıcıları: Excel/Google (var), CSV, ICS takvim, başka sistemden düzenli dışa aktarma dosyası; anahtarlı içe aktarma ucu (başka sistemin göndermesi için). Belirli bir hastane bilgi sistemiyle bağlantı, o sistemin dışa aktarma biçimi/izni görüldükten sonra yapılır.

### 4.6+ — Ek modüller (her biri aç/kapat)
- Kontrol listeleri (acil arabası, cihaz kontrolleri; günlük/haftalık, kim yaptı), nöbet devir notu (hasta adı korumalı), eğitim ve sertifika takibi (geçerlilik hatırlatması), arıza/malzeme bildirimi, olay/güvenlik bildirimi (isteğe bağlı anonim), anket/oylama, toplantı ve eğitim takvimi + katılım.

### Sürekli: KVKK ve güvenlik
- Aydınlatma metni ve onay kaydı, kişinin kendi verisini indirme/silme talebi, veri saklama süreleri, şifreli yedek, yönetici rollerinde iki adımlı doğrulama, giriş deneme sınırı, günlükte kişisel veri bırakmama, her modülde yetki testleri.
- Hız: modül betikleri yalnız gerektiğinde yüklenir, sayfalı listeler, dizinler, görsel küçültme.
