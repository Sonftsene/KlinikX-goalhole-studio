# NöbetMed geliştirme araçları

Bu klasör sunucuya **yüklenmez**; yalnızca test ve önizleme içindir.

- `e2e.mjs` — Uçtan uca test (kurulum, içerik, ekler, okundu takibi, misafir linki, kayıt/onay, nöbet çizelgesi, ayarlar, yetki kontrolleri).
  ```
  cd nobetmed && php -S 127.0.0.1:8088 -t .
  node ../nobetmed-dev/e2e.mjs http://127.0.0.1:8088/ /tmp
  ```
- `demo-api.js` — Sunucusuz canlı önizleme için tarayıcı içi sahte API (api.php ile aynı kurallar, örnek veriler).
- `build-preview.mjs` — Uygulamayı demo API ile tek HTML dosyasına paketler: `node build-preview.mjs onizleme.html`
- `package.sh` — Hostinger'a yüklenecek ZIP'i üretir.
