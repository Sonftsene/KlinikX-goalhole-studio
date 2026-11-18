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
- Son yayımlanan paket: **3.10.2** (kullanıcıya gönderildi; kullanıcının yüklediği 3.10.2 zip'i depodaki `00eecda` ile birebir aynı).
- Dalın ucu **3.10.3 adayı** (`NM_VERSION` = 3.10.3), ara kayıtlar:
  - Google kodu her dakika kontrol eder (`everyMinutes(1)`, `SURUM = 2`, `X-Script` başlığı → `gs_script_v`; eski kod için ayarlarda uyarı).
  - Ana sayfa/takvim dakikada bir ve uygulamaya dönünce liste değişikliğini alır (`rosters.js` → `rosterAutoSync`).
  - Hasta adı koruması (`gs_mask_guard`): yalnız gösterilen sekmelere bakar; altında veri olan ayarsız "Hasta…" sütunu varsa durdurur; ayarlı başlık gösterilen sekmelerde hiç yoksa ve o sekmelerde veri varsa durdurur (sütun "Adı Soyadı" yapılırsa adlar açık kalmasın), yalnız başlıklı sekmede durdurmaz.
  - Birim testi: `php nobetmed-dev/gsync-guard-test.php` (9 durum geçiyor).
- Test durumu: söz dizimi, shiftparse (248+107), push/SW (52), webauthn (13), guard (9) GEÇTİ. Tam e2e takımı guard'ın SON hâliyle henüz çalıştırılmadı (bir önceki hâl e2e-features'ta hasta listesi "yalnız A BLOK" adımında düşmüştü; son düzeltme bunun içindi).
- **Sıradaki iş:** tam e2e takımı (SQLite + MySQL), güncelleme testi (3.10.2 verisi üstüne yeni zip), paket (`dist/dupcii-hostinger.zip`), commit/push, zip'i kullanıcıya gönder. Sonra kullanıcının Chrome'daki canlı siteyi birlikte incele (neler düzeltilmeli analizi) ve Hostinger e-posta/SMTP + cron ayarlarında yardım et.
- Kullanıcıya verilen öneriler: Google'daki kodda `everyMinutes(1)` + `kur`; Hostinger'da e-posta hesabı + dupcii SMTP (smtp.hostinger.com, 465, SSL), PHP 8.1+, HTTPS'ye zorla, 5 dakikalık cron.
- Bilinçli olarak yapılmayanlar: yılı belirsiz ay sekmelerinde yıl tahmini (gün satırı varsa sorun yok); tarayıcı saat dilimi Türkiye dışındaysa geri sayım kayması.

## Test
- Temel + özellikler: `bash fullrun.sh <n> <port>` benzeri: siteyi `data/` ve `uploads/` hariç geçici klasöre kopyala, `php -S localhost:<port> -t <klasör>`, sonra sırayla
  `node nobetmed-dev/e2e.mjs <url> <çıktı>` → `node nobetmed-dev/e2e-features.mjs <url> <çıktı> <site>` → `e2e-placement.mjs`, `e2e-requests.mjs`, `e2e-market.mjs`, `e2e-prefs.mjs` (aynı argümanlar). Sunucu günlüğünde uyarı/SQLSTATE olmamalı.
- Ayrıca: `node nobetmed-dev/shiftparse-test/run.cjs`, `php nobetmed-dev/shiftparse-test/php-unit.php`, `bash nobetmed-dev/push-test/run.sh <geçici>`, `node nobetmed-dev/webauthn-test/run-test.cjs`, `e2e-mail.mjs` (README'de nasıl çalıştırılacağı yazıyor).
- MySQL: geçici MariaDB ile aynı takım (config.php'de `DB_DRIVER mysql`).
- **Güncelleme testi** (her sürümden önce): önceki sürüm commit'iyle veri oluştur, yeni zip'i üzerine aç, yeni testleri çalıştır (README "Güncelleme testi").
- Paket: `bash nobetmed-dev/package.sh dist/dupcii-hostinger.zip`.
