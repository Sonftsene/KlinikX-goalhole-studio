# dupcii — modül geliştirme rehberi (yeni özellikler için)

Uygulama: Türkçe hastane servisi portalı. PHP 8.0+ (Composer yok), SQLite (varsayılan) veya MySQL. İstemci: derleme yok, sırayla yüklenen klasik betikler (ortak global değişkenler).
Kök: `nobetmed/`. Geliştirme/test araçları: `nobetmed-dev/`. Kullanıcıya görünen her metin **Türkçe**, sade ve kısa.

## Dosya sahipliği (paralel çalışma)
Her modül yalnızca KENDİ dosyalarını düzenler:
- Sunucu: `nobetmed/inc/mod_<modül>.php` — işlevlerini tanımlar ve sonda `return ['eylem.adi' => 'islev_adi', ...];` döndürür (api.php bunları kendisi yükler; cron.php de yükler).
- İstemci: `nobetmed/assets/js/<modül>.js` ve `nobetmed/assets/css/<modül>.css` (index.php, sw.js, build-preview zaten kayıtlı).
- Test: `nobetmed-dev/e2e-<modül>.mjs` (aşağıya bakın).
Ortak dosyalara (api.php, bootstrap.php, core.js, posts.js, extras.js, taraf.js, app.css, e2e-features.mjs …) DOKUNMAYIN. Ortak bir değişiklik gerekiyorsa raporunuzda yazın; ana geliştirici yapar.

## Sunucu yardımcıları (hazır)
- Veritabanı: `q($sql, $params)`, `one()`, `all()`, `val()`, `insert_id()`, `db()` (PDO), `now()` ('Y-m-d H:i:s'), `setting($k, $default)`, `set_setting($k, $v)`.
- İstek: `s('ad', maxLen)` metin, `i('ad')` tam sayı|null, `b('ad')` bool, `arr('ad')` dizi; `global $IN` ham JSON. Yanıt: `out([...])` (ok:true ekler, çıkar), `fail('Türkçe mesaj', 4xx)`.
- Yetki: `need_user()`, `need_publisher()` (admin|editor = "yayıncı"), `need_admin()`, `is_publisher($u)`, `is_admin($u)`, `current_user()`.
- Günlük: `audit($me, 'eylem.adi', 'hedef', 'ayrıntı')`. Bildirim: `notify_users($kullaniciSatirlari, 'tur', 'başlık', 'gövde', '#/rota', $mail|null, 'notoff')` (push + uygulama içi + isteğe bağlı e-posta). Yayıncılar: `active_users_sql("AND role IN ('admin', 'editor')")`.
- Ad eşleştirme: `names_match($excelAdi, $kullaniciAdi)` (Türkçe harf/büyüklük duyarsız, ikinci ad isteğe bağlı). `swap_key($ad)` karşılaştırma anahtarı. `swap_user_for($ad)` -> kullanıcı satırı|null.
- Nöbet verisi: tablo `roster_shifts` (roster_id, file_id, name, title, date 'Y-m-d', code, label, kind 'shift'|'leave'|'off'|'role', hours, start_time 'HH:MM', end_time). Yalnız güncel dosyanın satırları geçerlidir: `JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id`.
  - `swap_timeline($rid, $from, $to)` -> [adAnahtarı => ['name','title','days' => [tarih => satır]]]
  - `swap_interval($tarih, $satir)` -> [başlangıçTs, bitişTs]; `shift_is_night($satir)`; `shift_periods($satir)` -> ['day'] | ['night'] | ['day','night'].
  - `swap_fmt_date('2026-11-18')` -> "18 Kas".
- **Kurallar (inc/rules.php):** `rules_cfg()` ['rest' => 16 (dinlenme saati), 'max_cont' => 24, 'max_gap' => 4]; `swap_check($days, $eklenenTarihler, $cikarilanTarihler, rules_cfg(), 'Ad')` -> null (uygun) | Türkçe neden; `rules_check_add($days, $tarih, $satir, 'Ad')`.
  - `rules_is_exempt($ad, 'kura'|'kaydirma'|'cagri', $tarih)`; `rules_exempt_list()`.
  - `rules_fair_stats($rosterId, $tarih)` -> [adAnahtarı => month_hours, month_shifts, last7, prev_end, next_start, rest_before, free_days, cross]; `rules_fair_sort($liste, $stats)` adalet sırası (az geçiş → az saat → son 7 gün az → çok boşluk); `rules_draw($grup)` rastgele (random_int).
  - Tatiller: `holiday_on($tarih)` -> ['name','half']|null; `holidays_between($a, $b)`; `day_type($tarih)` 'weekday'|'weekend'.
  - Gereken nöbetçi: `needs_for_date($tarih)` [birim => ['day' => n, 'night' => n]]; `needs_by_side($tarih)` [tarafAnahtarı => ...]; Ayarlar'da düzenlenir (`rules.get`, `rules.needs.save`).
- Taraflar: `sides_cfg()` -> [['key' => 's3', 'name' => '3. Basamak', 'roster_id' => 3, 'units' => ['B blok']], ['key' => 's2', ..., 'units' => ['A blok', 'C blok']]]. Mevcut eski taraf kayıtları: tablo `side_moves`.
- Değişim akışı (hazır): `swap_requests` tablosu (status pending|accepted|declined|cancelled|applied|expired). Kabul edilen bir değişim/devir için kayıt eklemek, sorumluya bildirim ve "Excel güncellenince uygulandı" otomatik (`swap_check_applied`). Var olan işlevleri okuyun: `nobetmed/inc/swaps.php`, `nobetmed/inc/api_sync.php` (a_swap_*).
- Kancalar: `$GLOBALS['NM_JOBS']['ad'] = fn(bool $force) => ...` (5 dakikada bir/cron), `$GLOBALS['NM_BOOT'][] = fn(array $me): array` (açılış verisine ekler; dönen anahtarlar istemcide doğrudan `S.<anahtar>` olur, hesap değişince silinir), `$GLOBALS['NM_GET']['eylem'] = fn()` (oturumsuz GET).

## Veritabanı (hazır, sürüm 11 — şemayı değiştirmeyin; ek alan gerekirse `meta` TEXT sütununa JSON yazın)
- `req_periods` (id, ym 'YYYY-MM', roster_id NULL=hepsi, deadline 'Y-m-d', status open|closed, note, created_by, created_at, meta)
- `shift_requests` (id, period_id, user_id, name, roster_id, date, kind 'bosluk'|'izin', note, status pending|approved|rejected, reason, decided_by, decided_at, created_at, meta)
- `staff_needs` (unit, day_type weekday|weekend, period day|night, count)
- `listings` (id, roster_id, user_id, name, date, code, kind give|swap, note, status open|taken|cancelled|expired, taker_user, taker_name, taker_date, taker_code, swap_request_id, created_at, closed_at, meta)
- `listing_apps` (id, listing_id, user_id, name, offer_date, offer_code, note, status applied|chosen|rejected|withdrawn, created_at)
- `callouts` (id, roster_id, side, unit, date, shift day|night|24, code, need, status open|filled|cancelled, note, filters JSON, created_by, created_at, closed_at, meta)
- `callout_resp` (id, callout_id, user_id, name, answer asked|yes|no, chosen 0/1, move_from 'Y-m-d' (kaydırma ise eski gün), created_at, answered_at)
- `placements` (id, date, name, user_id, roster_id, side, unit, code, period day|night|24, method auto|kura|elle, counted 0/1, pool JSON, created_by, created_at, meta)
- `placement_adjust` (id, name, user_id, side, unit, cross_count, unit_count, note, created_by, created_at) — geçmişe dönük elle girilen sayılar
- `rule_exempt`, `holidays` (rules.php kullanır)

## İstemci yardımcıları (hazır)
- Şablon: `` html`...${deger}...` `` (otomatik kaçış), `raw('...')`, `setHTML(el, icerik)`, `$(sec, kok)`, `$$(sec, kok)`.
- Olay bağlama: `ACT['ad'] = (el, ev) => {}` + `data-act="ad"`; `FORMS['ad'] = (form) => {}` + `<form data-form="ad">`; `CHANGE['ad'] = (el) => {}` + `data-change="ad"` / `data-input="ad"`.
- `api('eylem', veri)` (Promise; hata ApiError), `toast('metin', 'err'?)`, `openModal({title, body, foot, size: 'wide'|'narrow'})` -> m (m.close(), m.setBody(), m.setFoot(), m.el), `confirmDialog({title, text, ok, danger})`, `promptDialog`, `busy(buton, async fn)`, `icon('ad', 'sm')`.
- Tarih: `ymd(Date)`, `parseDT('Y-m-d H:i')`, `dateLabel('Y-m-d')` ("Bugün · 18 Kasım Çarşamba"), `fmtRel`, `fmtDate`, `TR_MONTHS`, `TR_DAYS`, `pad`.
- Nöbet: `codeChip({code, kind, hours, start, end})`, `shiftTone(...)`, `shiftDesc(...)`, `MY` (kendi nöbetlerim: `await loadMyShifts(true)` -> MY.entries [{date, code, kind, hours, start, end, roster_id, roster}]).
- Kişi: `S.me` ({id, name, role}), `isPublisher()`, `isAdmin()`, `S.people`, `S.rosters`, `avatar(ad, 'sm', url)`.
- Sayfa başlığı (Nöbet sekmeleri): `hubHead('anahtar', 'alt yazı', aksiyonHtml)` — sekmeyi `NM_EXT.hubTabs` ile ekleyin.
- **Kayıt noktaları (core.js `NM_EXT`):** `routes`, `nav`, `hubTabs`, `homeCards` ({id, title, icon, order, place: 'top'|'side', render: async (el) => {}}), `settingsCards` ({sec: 'nobet', html: (A) => html, mount}), `dayActions` ((entry, tarih) => html — Takvimim'de kendi nöbet satırına düğme), `notif[tur] = [renkTonu, ikon]`, `audit[eylem] = 'etiket'`.
- Mevcut stil sınıfları: card, card-pad, card-head, list, list-row, lr-t, lr-s, btn (primary, sm, icon, ghost, danger), badge (brand, success, warn, danger, info), seg, sec-title, field, input, select, textarea, switch, grid2, row, wrap, stack, small, tiny, muted, faint, empty, tone-* renkleri. Değişkenler: --brand, --violet, --surface, --surface-2, --border, --text-2, --danger, --c-emerald, --c-indigo, --c-amber … Koyu temada da düzgün görünmeli; telefon (390 px) önce.

## Çok birimli yapı (4.0) — her modül için kurallar
- Bir istek yalnız TEK birimin veritabanını açar (`db()` ilk çağrıda `nm_tenant()` ile kesinleşir). Modül kodu birim seçmez, başka birimin verisine bakmaz.
- Dosya yolları için **her zaman** `nm_data_dir()` (veritabanı yanındaki dosyalar, yedek, geçici) ve `nm_upload_dir()` (ekler, fotoğraflar) kullanın; `NM_ROOT . '/data'` / `'/uploads'` YAZMAYIN.
- Oturumsuz bağlantı üreten yerler (e-posta bağlantıları, davet, misafir, dış sistemin çağıracağı adres) sona `nm_link_param()` ekler (istemcide `tenantQ()`).
- Kullanıcı ekleyen / e-posta değiştiren / silen kod: önce `nm_email_guard($email)`, sonra `nm_dir_put($email)` / `nm_dir_del($email)` (e-posta → birim dizini).
- Önbellek (`static`) serbesttir: bir PHP süreci tek birimle çalışır (cron her birimi ayrı süreçte çalıştırır).
- Süper yönetici uçları `inc/mod_sistem.php` (`sa.*`); birim içeriği görmez, `nm_tenant_peek()` yalnız sayılar ve ayar kopyalama içindir.
- Test: `nobetmed-dev/e2e-tenant.mjs` (diğer testlerden SONRA çalışır; ikinci birim açar).

## Modüller ve yetkiler (4.1) — yeni modül eklerken
- Sunucu: `inc/mod_yetki.php` › `NM_MODULES` (anahtar, ad, açıklama, bağlı modül) ve `NM_ACTION_MODULE` (eylem öneki → modül). Dağıtıcı `nm_perm_gate()` modül kapalıysa / kişi "Göremez" ise durdurur ve `$GLOBALS['NM_MOD']` ayarlar; bu sayede modül içindeki `is_publisher()` / `need_publisher()` kişinin o modüldeki "Yönetir" yetkisine göre çalışır. Sorumlu bildirimleri için `module_managers('<modül>')` kullanın (`role IN ('admin','editor')` YAZMAYIN).
- Zamanlanmış görev bir modüle aitse `$GLOBALS['NM_JOB_MODULE']['<görev>'] = '<modül>'` (kapalıyken çalışmaz).
- İstemci: `modOn(m)`, `canManage(m)`, `ROUTE_MOD` (rota → modül; `isPublisher()` modül sayfasında o modüle göre). `NM_EXT` kayıtlarına `mod: '<modül>'` ekleyin (nav, hubTabs, homeCards (dizi olabilir), profileTabs).
- Test: `nobetmed-dev/e2e-yetki.mjs` (e2e-tenant'tan sonra).

## Hastane ortak verisi (4.2)
- `inc/mod_hastane.php` › `hdb()` aynı hastanenin ortak SQLite'ı (`data/h/<hastane id>/`), dosyalar `h_upload_dir()` (`uploads/h/<id>/`). Bir istek kendi birimi + kendi hastanesinin ortak veritabanını açabilir; başka hastaneye yol yok.
- Ortak kayıtlarda ekleyen birim `tkey` ile tutulur; düzenleme/silme yalnız `tkey === h_tkey()` ise. Kişi adı içeren ortak kayıtlar (ör. `h_reads`) yalnız kendi birimine adıyla, diğer birimlere sayı olarak gösterilir.
- Birimler arası bildirim: bir birim başka birimin veritabanına YAZMAZ; her birimin kendi görevi (`NM_JOBS`) hastane verisini okuyup kendi kişilerine bildirir (ör. `hdoc_notify`).
- Test: `nobetmed-dev/e2e-hastane.mjs` (e2e-tenant'tan sonra).

## Gizlilik ve güvenlik
- Depo HERKESE AÇIK: gerçek kişi/hastane adı, e-posta, şifre, gerçek Excel dosyaları depoya girmez. Testlerde uydurma adlar kullanın.
- Her uçta yetki denetimi; yalnız yetkili kişiye görünmesi gereken bilgiyi sunucu hiç göndermesin (istemcide gizlemek yetmez).

## Test
- Taban: `nobetmed-dev/e2e.mjs` taze bir sitede hesapları ve örnek listeleri kurar (yönetici ayse@test.com / Sifre1234, üye elif@test.com / YeniSifre99, üye burak@test.com / Sifre1234). Ardından `nobetmed-dev/e2e-features.mjs` Google E-Tablolar bağlı 3./2. basamak listelerini, tarafları ve değişimleri kurar.
- Kendi testiniz: `nobetmed-dev/e2e-<modül>.mjs` — e2e.mjs + e2e-features.mjs bittikten sonra aynı sitede çalışır (e2e-features.mjs'in 23-25. adımları sonraki ay için uydurma bir 3./2. basamak listesi gönderir; o verileri kullanın ya da kendi `gsync.push` gönderiminizi yapın — örnek: e2e-features.mjs içindeki `book()` ve `push()`).
- Çalıştırma: taze kopya + php -S + iki betik + sizinki. Hazır betik: `/tmp/claude-0/-home-user-KlinikX-goalhole-studio/4d7744e8-ab7f-5308-b766-65f9f8511e50/scratchpad/fullrun.sh <no> <port>` taban+features'ı çalıştırır, site `scratchpad/run<no>`, çıktı `scratchpad/r<no>`; sonra kendi testinizi `node e2e-<modül>.mjs http://localhost:<port>/ <çıktı> <site>` ile çalıştırın (sunucuyu sonra `pkill -f "localhost:<port>"`). Her ajan FARKLI port kullansın.
- Playwright/Chromium kurulu (`require('playwright')`), kurulum yapmayın. Telefon görünümünü (390×844) ekran görüntüsüyle kontrol edin; yatay taşma olmamalı.
- Bitince: php -l, node --check, kendi testiniz geçmeli. git commit YAPMAYIN (ana geliştirici yapar).

## Ortak yardımcılar (prefs modülü)
- `holidayMapOrNull()` → `{ 'YYYY-MM-DD': { name, half, kind: 'resmi'|'bayram' } }` (S.holidays'ten); `summarizeMonth(entries, y, m, holidays)` tatilleri zorunlu saatten düşer.
- Ana sayfa kartları kişinin “Ana sayfam” ayarına göre gizlenir/sıralanır (`homePrefs()`); yerleşik bloklar `data-home` ile işaretlidir.
- Profil sekmesi eklemek: `NM_EXT.profileTabs.push({ key, label, icon, html, mount })`.

## Veritabanı değişikliği yaparken
- `inc/bootstrap.php`'de tablo veya sütun eklediyseniz **`NM_SCHEMA` sabitini bir artırın**. Artırılmazsa yeni kurulumlarda çalışır ama mevcut sitelerde güncelleme adımı atlanır ve “no such column” hatası çıkar.
- Bunu yakalayan test: önceki sürümle veri oluşturup yeni paketi üzerine açmak, ardından yeni testleri çalıştırmak (bkz. README “Güncelleme testi”).
