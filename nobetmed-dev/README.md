# dupcii geliştirme araçları

Bu klasör sunucuya **yüklenmez**; yalnızca test ve önizleme içindir.

- `e2e.mjs` — Uçtan uca test (kurulum, içerik, her türden ek ve 25 MB parçalı yükleme, PDF/Excel/Word önizleme, okundu takibi, misafir linki, kayıt/onay, Excel nöbet listeleri, ayarlar, yetki kontrolleri).
  ```
  cd nobetmed && php -S 127.0.0.1:8088 -t .
  node ../nobetmed-dev/e2e.mjs http://127.0.0.1:8088/ /tmp
  ```
- `e2e-mail.mjs` + `fake-smtp.py` — E-posta, ilk yönetici, şifre sıfırlama ve gizlilik testleri (sahte SMTP sunucusuyla):
  ```
  python3 fake-smtp.py 2525 /tmp/mails bildirim@ornek.com SmtpSifre1 &
  ADMIN_EMAIL=... ADMIN_PASS=... node e2e-mail.mjs http://127.0.0.1:8097/ /tmp/mails 2525 /tmp
  ```
  (sitenin config.php dosyasında INITIAL_ADMIN_* dolu olmalı)
- `e2e-features.mjs` — Yeni özellikler (e2e.mjs'den sonra aynı sunucuda): Nöbetlerim/ICS, rehber, belge içinde arama, şablonlar, okuma raporu Excel, işlem günlüğü, yedek, cron, bildirim merkezi, QR ve listeden davet, parmak izi (sanal doğrulayıcı), çevrimdışı.
  ```
  node ../nobetmed-dev/e2e-features.mjs http://localhost:8088/ /tmp <site klasörü>
  ```
- `shiftparse-test/`, `push-test/`, `webauthn-test/` — nöbet çözümleyici, web push + service worker ve parmak izi birim/uçtan uca testleri (`run.cjs` / `run.sh` / `run-test.cjs`).
- `fixtures/` — Örnek nöbet listeleri (.xlsx), PDF protokol ve Word belgesi; testte ve önizlemede kullanılır.
- `make-fixtures.cjs` — Örnek Excel listelerini üretir (`npm i exceljs` gerekir).
- `make-cizelge.cjs` — "Aylık Nöbet Ücret Çizelgesi" biçiminde Excel üretir: `node make-cizelge.cjs fixtures/cizelge-ornek.json fixtures`
  (veri dosyası kişileri ve vardiya kodlarını içerir; repodaki örnek uydurma isimlerle hazırlanmıştır).
- `demo-api.js` — Sunucusuz canlı önizleme için tarayıcı içi sahte API (api.php ile aynı kurallar, örnek veriler).
- `build-preview.mjs` — Uygulamayı demo API ile tek HTML dosyasına paketler: `node build-preview.mjs onizleme.html [liste-klasörü]`
  (ikinci argüman verilirse o klasördeki .xlsx dosyaları önizlemede nöbet listesi olarak kullanılır; gerçek isimli listeler repoya konmaz)
- `package.sh` — Hostinger'a yüklenecek ZIP'i üretir.
