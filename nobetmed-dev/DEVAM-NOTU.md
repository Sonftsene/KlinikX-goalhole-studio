# dupcii — devir notu (yeni oturum buradan devam eder)

Bu dosya, önceki geliştirme sohbetinin özetidir. Yeni oturumda önce bunu, sonra `MODUL-REHBERI.md`, `YOL-HARITASI.md` ve `README.md` dosyalarını oku.

## Proje
- **dupcii**: bir hastane servisinin hemşire portalı. Hostinger paylaşımlı barındırma, PHP 8.0+, SQLite (varsayılan; MySQL de desteklenir), vanilla-JS tek sayfa uygulama, PWA.
- Kod: `nobetmed/` (uygulama), `nobetmed-dev/` (testler, araçlar), `dist/dupcii-hostinger.zip` (yükleme paketi).
- Çalışma dalı: `ccr-7521765a-fdg4ql`. Kullanıcı Hostinger'a zip'i açıp üzerine yazarak yükler; `data/`, `uploads/`, `config.php` pakette yoktur (veriler korunur).
- Kullanıcıyla **Türkçe** konuşulur. Kullanıcı yönetici; yayıncı = editor rolü.

## Kesin kurallar
- Depo **HERKESE AÇIK**: gerçek kişi/hastane adı, e-posta, şifre, gerçek Excel/nöbet listesi, dahili numara dosyası depoya girmez. Her commit'ten önce diff'i bu açıdan tara. Testlerde uydurma adlar kullan.
- Hasta adları ("Hastanın Adı Soyadı") asla kısaltılmadan saklanmaz (KVKK). Kişiye özel ücretler (`users.pay_rates`) yalnız kişinin kendisine gider (yedeklere de girmez).
- Tabloya/sütuna her eklemede `inc/bootstrap.php` içindeki **`NM_SCHEMA`** sabitini artır (şu an 12). Artırmazsan güncellenen sitelerde "no such column" hatası çıkar.
- PHP 8.0 uyumlu yaz (8.1+ özellik yok). SQL hem SQLite hem MySQL'de (katı mod) çalışmalı; SQLite VARCHAR uzunluğunu denetlemez, MySQL denetler.
- Commit/push yalnız bu dala; PR açma (istenmedikçe).

## Mimari (kısa)
- `api.php`: POST + CSRF uçları; `inc/mod_*.php` modülleri otomatik yüklenir ve `['eylem' => 'işlev']` döndürür. Kancalar: `$GLOBALS['NM_BOOT']` (açılış verisi → istemcide `S.<anahtar>`), `NM_JOBS` (5 dakikada bir görev), `NM_GET`.
- İstemci kayıt noktaları `assets/js/core.js` içindeki `NM_EXT` (routes, nav, hubTabs, homeCards, settingsCards, dayActions, notif, audit, profileTabs). Ayrıntı: `MODUL-REHBERI.md`.
- Modüller: `placement` (günlük blok yerleşimi, Sorumlular ekibi, oflama, çağrılan, nöbete gelecek, WhatsApp görseli), `requests` (nöbet istekleri), `market` (nöbet ilanı, eksik personel çağrısı, değişim geçmişi), `prefs` (tema/palet, ana sayfa düzeni, geri sayım, ücret, hatırlatma, Ayarlar › Nöbet kartları).
- Kural motoru `inc/rules.php` + `inc/swaps.php`: üst üste en fazla 24 saat, nöbetten sonra en az 16 saat dinlenme, en fazla 4 boş gün; adaylar yalnız o ayın listesinden; `rules_is_excluded()` kişileri hiçbir hesaba girmez; kabul edilmiş ama Excel'e işlenmemiş değişimler `swap_pending_overlay()` ile hesaba katılır.
- Google E-Tablolar: kullanıcının Apps Script kodu (`assets/js/taraf.js` → `gsScript`) tabloları siteye gönderir (`inc/gsync.php`). Nöbet tablolarında çıkarılan sekmeler, hasta listesinde seçilen sekmeler saklanır; hasta adı koruması `gs_mask_guard()`.

## Durum
- Son paket: **4.0.0** (çok hastaneli altyapı). Önceki: 3.11.0 (silme yetkileri), 3.10.4 (bildirim simgesi), 3.10.3.
- Kullanıcının sitesi **SQLite** (config.php `DB_DRIVER sqlite`) → çok birimli yapı etkin olacak.
- 4.0 mimarisi (ayrıntı `MODUL-REHBERI.md` › Çok birimli yapı, kullanıcı için `KURULUM.md` §16):
  - `inc/tenant.php`: merkez SQLite (`data/merkez/`: hospitals, tenants, dir_email (HMAC), superadmins, sa_audit, sa_attempts, m_settings), `nm_tenant()` istek başına tek birim (oturum `t` → bağlantı `b`/oturum `tb` → varsayılan), `nm_tenant_use()` yalnız db açılmadan, `nm_data_dir()/nm_upload_dir()`, `nm_link_param()`, dizin `nm_dir_put/del/find`, `nm_email_guard`.
  - Eski kurulum yerinde kalır = varsayılan birim (`dir=''`); yeni birimler `data/b/<anahtar>/`, `uploads/b/<anahtar>/`.
  - Giriş: `nm_route_tenant()` (auth.login/forgot → e-posta dizini; passkey → userHandle `u<id>@<anahtar>`; Google → a_google içinde). Oturum birime bağlı (`$_SESSION['t']`); dondurulmuş birim 423.
  - Birden çok birim varken oturumsuz açılış tarafsız (org_name "dupcii", kayıt kapalı) — bağlantıda `?b=` yoksa.
  - `inc/mod_sistem.php` (`sa.*`): ilk birimin yöneticisi Ayarlar › Güvenlik'ten bir kez sistem yöneticisi açar (TOTP zorunlu, kod tekrar kullanılamaz, 30 dk boşta kapanır); panel: hastane/birim ekle, birim yöneticisi (geçici şifre, SMTP kopyalama), dondur, günlük. İçerik görmez.
  - `cron.php`: birden çok birimde her birim ayrı süreç (`--tenant=`); proc_open yoksa sırayla bir birim.
  - Test: `nobetmed-dev/e2e-tenant.mjs` (diğer testlerden sonra).
- **Sıradaki iş (YOL-HARITASI):** 4.1 modüller + yetkiler (süper yönetici modül aç/kapat; rol × modül izinleri), 4.2 hastane ortak rehber/belgeler (hastane DB'si), 4.3–4.4 mesajlaşma, 4.5 Excel'siz çizelge + aktarım, 4.6 ek modüller.
- Kullanıcı kararları: kişi tek birimde; hastane içinde rehber ortak, protokoller hastane geneli/birime özel; tek adres; birkaç hastane ile başlanacak.
- Bilinçli olarak yapılmayanlar: yılı belirsiz ay sekmelerinde yıl tahmini; tarayıcı saat dilimi Türkiye dışındaysa geri sayım kayması; MySQL'de çok birim.

## Test
- Temel + özellikler: `bash fullrun.sh <n> <port>` benzeri: siteyi `data/` ve `uploads/` hariç geçici klasöre kopyala, `php -S localhost:<port> -t <klasör>`, sonra sırayla
  `node nobetmed-dev/e2e.mjs <url> <çıktı>` → `node nobetmed-dev/e2e-features.mjs <url> <çıktı> <site>` → `e2e-placement.mjs`, `e2e-requests.mjs`, `e2e-market.mjs`, `e2e-prefs.mjs` (aynı argümanlar). Sunucu günlüğünde uyarı/SQLSTATE olmamalı.
- Ayrıca: `node nobetmed-dev/shiftparse-test/run.cjs`, `php nobetmed-dev/shiftparse-test/php-unit.php`, `bash nobetmed-dev/push-test/run.sh <geçici>`, `node nobetmed-dev/webauthn-test/run-test.cjs`, `e2e-mail.mjs` (README'de nasıl çalıştırılacağı yazıyor).
- MySQL: geçici MariaDB ile aynı takım (config.php'de `DB_DRIVER mysql`).
- **Güncelleme testi** (her sürümden önce): önceki sürüm commit'iyle veri oluştur, yeni zip'i üzerine aç, yeni testleri çalıştır (README "Güncelleme testi").
- Paket: `bash nobetmed-dev/package.sh dist/dupcii-hostinger.zip`.
