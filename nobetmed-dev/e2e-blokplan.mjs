// 4.30: Taraf kura kuralları + basamakları birlikte planlama — e2e.mjs SONRASI (ayse yönetici).
//   node e2e-blokplan.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const phpFile = path.join(OUT, 'blokplan-tmp.php');
const php = (code) => {
  fs.writeFileSync(phpFile, `<?php require '${path.join(SITE, 'inc/bootstrap.php')}'; if (function_exists('nm_multi') && nm_multi()) nm_tenant_use(nm_tenant_default()); foreach (['mail', 'notify', 'api_extra', 'gsync', 'swaps', 'api_sync', 'rules'] as $f) require_once '${path.join(SITE, 'inc')}/' . $f . '.php'; foreach (glob('${path.join(SITE, 'inc')}/mod_*.php') as $f) require_once $f; ${code}`);
  return execFileSync('php', [phpFile], { encoding: 'utf8' });
};
const J = (code) => JSON.parse(php(code));
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });

// Ayarları yedekle (testten sonra geri konur)
const KEYS = ['sides', 'pl_counts', 'pl_team', 'duty_excluded', 'side_since', 'plan_side_opts'];
const backup = J(`echo json_encode(['s' => array_map(fn($k) => val('SELECT v FROM settings WHERE k = ?', [$k]), ${JSON.stringify(KEYS).replace(/"/g, "'")}), 'needs' => all('SELECT unit, day_type, period, count FROM staff_needs')]);`);
const restore = () => php(`$b = json_decode(base64_decode('${Buffer.from(JSON.stringify(backup)).toString('base64')}'), true);
  foreach (${JSON.stringify(KEYS).replace(/"/g, "'")} as $i => $k) { if ($b['s'][$i] === null) q('DELETE FROM settings WHERE k = ?', [$k]); else set_setting($k, $b['s'][$i]); }
  q('DELETE FROM staff_needs'); foreach ($b['needs'] as $r) q('INSERT INTO staff_needs (unit, day_type, period, count) VALUES (?, ?, ?, ?)', [$r['unit'], $r['day_type'], $r['period'], $r['count']]);
  q("DELETE FROM placements WHERE date >= '2031-01-01'");
  foreach (all("SELECT id FROM rosters WHERE name LIKE 'BP %'") as $r) { q('DELETE FROM plan_drafts WHERE roster_id = ?', [$r['id']]); q('DELETE FROM rosters WHERE id = ?', [$r['id']]); }`);

try {
  // ---- Kurulum: iki taraf, bloklar, kurallar ----
  const ids = J(`q("INSERT INTO rosters (name, sort, created_at) VALUES ('BP 3. Basamak', 90, ?)", [now()]); $a = insert_id();
    q("INSERT INTO rosters (name, sort, created_at) VALUES ('BP 2. Basamak', 91, ?)", [now()]); $b = insert_id();
    set_setting('sides', json_encode([['key' => 's3', 'name' => '3. Basamak', 'roster_id' => $a, 'units' => ['B blok']],
      ['key' => 's2', 'name' => '2. Basamak', 'roster_id' => $b, 'units' => ['A blok', 'C blok'], 'cross_in' => ['A blok'], 'max_streak' => 2]], JSON_UNESCAPED_UNICODE));
    set_setting('side_since', ''); set_setting('pl_counts', '{}'); set_setting('pl_team', json_encode(['name' => 'Sorumlular', 'members' => ['Sorumlu Bir', 'Sorumlu İki'], 'need' => ['day' => 0, 'night' => 0]], JSON_UNESCAPED_UNICODE));
    set_setting('duty_excluded', json_encode(['Dışarıda Kişi'], JSON_UNESCAPED_UNICODE));
    q('DELETE FROM staff_needs');
    foreach (['B blok' => 2, 'A blok' => 2, 'C blok' => 1] as $u => $n) foreach (['weekday', 'weekend'] as $dt) { q('INSERT INTO staff_needs (unit, day_type, period, count) VALUES (?, ?, ?, ?)', [$u, $dt, 'night', $n]); q('INSERT INTO staff_needs (unit, day_type, period, count) VALUES (?, ?, ?, ?)', [$u, $dt, 'day', $n]); }
    echo json_encode([$a, $b]);`);
  const [r3, r2] = ids;
  const cfg = J("echo json_encode(sides_cfg());");
  if (JSON.stringify(cfg[1].cross_in) !== '["A blok"]' || cfg[1].max_streak !== 2) fail('taraf ayarı (gelen blok / üst üste) saklanmadı: ' + JSON.stringify(cfg[1]));
  step('Taraflar: 2. basamak A + C, karşıdan gelen yalnız A, aynı blokta üst üste en fazla 2');

  // ---- 1) Kura kuralları (pl_auto) — rastgelelik için 25 kez ----
  const kura = J(`
    $mk = fn($name, $side) => ['key' => swap_key($name), 'name' => $name, 'title' => '', 'side' => $side, 'roster_id' => 0, 'row' => ['code' => '24', 'kind' => 'shift', 'start_time' => '08:00', 'end_time' => '08:00', 'hours' => 24], 'periods' => ['day', 'night'], 'shift' => '24', 'team' => false];
    $ins = fn($d, $n, $u, $side) => q("INSERT INTO placements (date, name, user_id, roster_id, side, unit, code, period, method, counted, pool, created_by, created_at, meta, status) VALUES (?, ?, NULL, 0, ?, ?, '24', '24', 'auto', 0, NULL, 1, ?, NULL, 'work')", [$d, $n, $side, $u, now()]);
    q("DELETE FROM placements WHERE date >= '2031-01-01'");
    // Ali: A'da üst üste 2; Veli: C'de üst üste 2
    $ins('2031-03-06', 'Ali Deneme', 'A blok', 's2'); $ins('2031-03-08', 'Ali Deneme', 'A blok', 's2');
    $ins('2031-03-06', 'Veli Deneme', 'C blok', 's2'); $ins('2031-03-08', 'Veli Deneme', 'C blok', 's2');
    pl_records_reset();
    $res = ['streak' => [], 'crossin' => [], 'prio' => []];
    for ($i = 0; $i < 25; $i++) {
      // a) üst üste kuralı: A 1, C 1 gerek; Ali → C, Veli → A
      $people = []; foreach ([$mk('Ali Deneme', 's2'), $mk('Veli Deneme', 's2')] as $p) $people[$p['key']] = $p;
      $needs = ['B blok' => ['day' => 0, 'night' => 0], 'A blok' => ['day' => 1, 'night' => 1], 'C blok' => ['day' => 1, 'night' => 1], PL_TEAM => ['day' => 0, 'night' => 0]];
      $r = pl_auto('2031-03-10', $people, $needs, true);
      $res['streak'][] = $r['items'][swap_key('Ali Deneme')]['segs'][0]['unit'] . '|' . $r['items'][swap_key('Veli Deneme')]['segs'][0]['unit'];
      // b) karşıdan gelen yalnız A: 3. basamakta 3 kişi (B 2 gerek), 2. basamakta 2 kişi (A 2 + C 1 gerek)
      $people = []; foreach ([$mk('Bir Üçüncü', 's3'), $mk('İki Üçüncü', 's3'), $mk('Üç Üçüncü', 's3'), $mk('Dört İkinci', 's2'), $mk('Beş İkinci', 's2')] as $p) $people[$p['key']] = $p;
      $needs = ['B blok' => ['day' => 2, 'night' => 2], 'A blok' => ['day' => 2, 'night' => 2], 'C blok' => ['day' => 1, 'night' => 1], PL_TEAM => ['day' => 0, 'night' => 0]];
      $r = pl_auto('2031-03-11', $people, $needs, true);
      $in = []; foreach ($r['items'] as $k => $it) if ($people[$k]['side'] === 's3' && $it['segs'][0]['unit'] !== 'B blok') $in[] = $it['segs'][0]['unit'];
      $res['crossin'][] = implode(',', $in);
      // c) öncelik: 2. basamakta 5 kişi, A 3 + C 3 gerek, karşıdan gelen yok → A3 C2
      $people = []; foreach (['Altı', 'Yedi', 'Sekiz', 'Dokuz', 'On'] as $n) { $p = $mk($n . ' İkinci', 's2'); $people[$p['key']] = $p; }
      $needs = ['B blok' => ['day' => 0, 'night' => 0], 'A blok' => ['day' => 3, 'night' => 3], 'C blok' => ['day' => 3, 'night' => 3], PL_TEAM => ['day' => 0, 'night' => 0]];
      $r = pl_auto('2031-03-12', $people, $needs, true);
      $c = ['A blok' => 0, 'C blok' => 0]; foreach ($r['items'] as $it) $c[$it['segs'][0]['unit']]++;
      $res['prio'][] = 'A' . $c['A blok'] . 'C' . $c['C blok'];
      // d) fazla: 7 kişi, A3 C3 → A4 C3 (eşitlemede alttaki)
      $people = []; foreach (['Altı', 'Yedi', 'Sekiz', 'Dokuz', 'On', 'Onbir', 'Oniki'] as $n) { $p = $mk($n . ' İkinci', 's2'); $people[$p['key']] = $p; }
      $r = pl_auto('2031-03-13', $people, $needs, true);
      $c = ['A blok' => 0, 'C blok' => 0]; foreach ($r['items'] as $it) $c[$it['segs'][0]['unit']]++;
      $res['prio7'][] = 'A' . $c['A blok'] . 'C' . $c['C blok'];
    }
    // e) nöbet dışı kişi elle eklenebilir (çağrılan, sayılmaz)
    $parsed = pl_parse_people([], [['name' => 'Dışarıda Kişi', 'segs' => [['unit' => 'A blok', 'period' => '24', 'status' => 'work']]]], '2031-03-10');
    $res['excl'] = array_values($parsed['called'])[0]['segs'][0]['status'] ?? '';
    $res['excl_cross'] = pl_counts_cross('', 'A blok', '24', 'called');
    echo json_encode($res);`);
  const bad = (arr, ok) => arr.filter((x) => x !== ok);
  if (bad(kura.streak, 'C blok|A blok').length) fail('üst üste 2 kuralı: Ali A’da 2 kez → C, Veli C’de 2 kez → A olmalıydı: ' + [...new Set(kura.streak)].join(' / '));
  if (kura.crossin.some((x) => !x || x.split(',').some((u) => u !== 'A blok'))) fail('3. basamaktan karşıya geçen yalnız A’ya gitmeliydi: ' + [...new Set(kura.crossin)].join(' / '));
  if (bad(kura.prio, 'A3C2').length) fail('blok önceliği (5 kişi → A3 C2) yanlış: ' + [...new Set(kura.prio)].join(' / '));
  if (bad(kura.prio7, 'A4C3').length) fail('fazlada eşitleme (7 kişi → A4 C3) yanlış: ' + [...new Set(kura.prio7)].join(' / '));
  if (kura.excl !== 'called' || kura.excl_cross) fail('nöbet dışı kişi elle eklenmedi ya da sayıldı: ' + JSON.stringify([kura.excl, kura.excl_cross]));
  step('Kura (25 tekrar): A’da üst üste 2 → C’ye, C’de 2 → A’ya; 3. basamaktan gelen yalnız A; 5 kişi A3 C2, 7 kişi A4 C3; nöbet dışı kişi yalnız elle ve sayılmıyor');

  // ---- 2) Basamakları birlikte planla ----
  const ym = '2031-04';
  const three = ['Üç Ayşe', 'Üç Banu', 'Üç Cem', 'Üç Derya', 'Üç Ece', 'Üç Fatma', 'Üç Gül', 'Üç Hale', 'Üç İpek', 'Sorumlu Bir', 'Dışarıda Kişi'];
  const two = ['İki Ali', 'İki Bora', 'İki Can', 'İki Deniz', 'İki Emre', 'İki Ferhat', 'İki Gökhan', 'İki Hakan', 'İki Işıl', 'İki Jale', 'İki Kaan', 'İki Leyla', 'Sorumlu İki'];
  // Önceki ay: Üç Ayşe ayın son günü 24 saat → 1 Nisan'a yazılamaz
  php(`q('DELETE FROM plan_drafts WHERE roster_id IN (?, ?)', [${r3}, ${r2}]);
    q("INSERT INTO plan_drafts (roster_id, ym, data, status, updated_by, updated_at) VALUES (?, '2031-03', ?, 'draft', 1, ?)", [${r3}, json_encode(['people' => [['name' => 'Üç Ayşe', 'title' => '']], 'cells' => ['Üç Ayşe' => ['2031-03-31' => '24']]], JSON_UNESCAPED_UNICODE), now()]);`);
  const A = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await A.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await A.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', 'ayse@test.com');
  await p.fill('[data-form=login] [name=password]', 'Sifre1234');
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const g = await p.evaluate(([y]) => api('plan.sides.get', { ym: y }), [ym]);
  if (g.sides.length !== 2) fail('iki basamak gelmedi: ' + g.sides.length);
  const drafts = { [r3]: { people: three.map((name) => ({ name, title: '' })), cells: {} }, [r2]: { people: two.map((name) => ({ name, title: '' })), cells: {} } };
  // İzin: 10 Nisan'da 3. basamakta 8 kişi izinli → B (2) dolmaz, 2. basamaktan tamamlanır
  php(`foreach (${JSON.stringify(three.slice(1, 9)).replace(/"/g, "'")} as $n) { $pid = (int)val("SELECT id FROM req_periods WHERE ym = '${ym}'") ?: (function () { q("INSERT INTO req_periods (ym, roster_id, status, created_at) VALUES ('${ym}', NULL, 'closed', ?)", [now()]); return insert_id(); })();
    q("INSERT INTO shift_requests (period_id, roster_id, user_id, name, date, kind, status, created_at) VALUES (?, NULL, 0, ?, '${ym}-10', 'izin', 'approved', ?)", [$pid, $n, now()]); }`);
  const opts = { day_code: 'G', night_code: 'N', team_day: true, fri_on: true, fri_code: 'N', fri_n: 1, sat_on: false };
  const r = await p.evaluate(([y, d, o]) => api('plan.sides.auto', { ym: y, drafts: d, opts: o }), [ym, drafts, opts]);
  const cells3 = r.cells[r3] || {}, cells2 = r.cells[r2] || {};
  const days = Array.from({ length: 30 }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
  const own = (cells, names, d, per) => names.filter((n) => !/^Sorumlu|Dışarıda/.test(n)).filter((n) => { const c = (cells[n] || {})[d]; return per === 'night' ? c === 'N' : c === 'G'; }).length;
  let okDays = 0;
  const probs = [];
  days.forEach((d) => {
    if (d === `${ym}-10`) return;
    const b = own(cells3, three, d, 'night'), ac = own(cells2, two, d, 'night');
    if (b === 2 && ac === 3) okDays++; else probs.push(`${d.slice(8)}: B ${b}/2, A+C ${ac}/3`);
  });
  if (okDays < 25) fail('günlerin çoğunda taraflar kendi kişileriyle tam dolmalıydı: ' + probs.slice(0, 6).join(' · '));
  // 10 Nisan: 3. basamaktan yalnız 2 kişi (Üç Ayşe + Üç İpek) — B eksikse 2. basamaktan tamamlanır
  const d10 = `${ym}-10`;
  const b10 = own(cells3, three, d10, 'night'), ac10 = own(cells2, two, d10, 'night');
  const izinli = three.slice(1, 9).filter((n) => (cells3[n] || {})[d10]);
  if (izinli.length) fail('onaylı izinli kişiye nöbet yazıldı: ' + izinli.join(', '));
  if (b10 + ac10 < 5) fail(`10 Nisan toplam alan eksik: B ${b10} + A/C ${ac10} < 5`);
  if (b10 < 2 && !r.cross.some((x) => x.date === d10 && x.to === '3. Basamak')) fail('3. basamak eksiği 2. basamaktan tamamlanmadı: ' + JSON.stringify(r.cross.filter((x) => x.date === d10)));
  // Önceki ay kuralı
  if ((cells3['Üç Ayşe'] || {})[`${ym}-01`]) fail('önceki ayın son günü 24 saat tutan kişiye 1’inde nöbet yazıldı');
  // Nöbet dışı
  if (Object.keys(cells3['Dışarıda Kişi'] || {}).length) fail('nöbet dışı kişiye otomatik nöbet yazıldı');
  // Sorumlular: hafta içi gündüz, Cuma gece sırayla
  const fridays = days.filter((d) => new Date(d).getDay() === 5);
  const friN = fridays.map((d) => ['Sorumlu Bir', 'Sorumlu İki'].filter((n) => ((cells3[n] || cells2[n] || {})[d] || ((n === 'Sorumlu İki' ? cells2 : cells3)[n] || {})[d]) === 'N').length);
  if (friN.some((x) => x !== 1)) fail('her Cuma 1 sorumlu 16-08 almalıydı: ' + friN.join(','));
  const s1 = fridays.filter((d) => (cells3['Sorumlu Bir'] || {})[d] === 'N').length, s2 = fridays.filter((d) => (cells2['Sorumlu İki'] || {})[d] === 'N').length;
  if (Math.abs(s1 - s2) > 1) fail(`Cuma sorumlu nöbeti adil dağılmadı: ${s1} / ${s2}`);
  const tueDay = days.find((d) => new Date(d).getDay() === 2);
  if ((cells3['Sorumlu Bir'] || {})[tueDay] !== 'G') fail('sorumluya hafta içi gündüz yazılmadı');
  if (own(cells3, ['Sorumlu Bir'], tueDay, 'day') !== 0) fail('sorumlu alan sayısına girdi');
  // Adalet: 3. basamak alan kişilerinin saatleri birbirine yakın
  const hrs = (cells, n) => Object.values(cells[n] || {}).reduce((a, c) => a + (c === 'N' ? 16 : c === 'G' ? 8 : c === '24' ? 24 : 0), 0);
  const h2 = two.filter((n) => !/^Sorumlu/.test(n)).map((n) => hrs(cells2, n));
  if (Math.max(...h2) - Math.min(...h2) > 8) fail('2. basamakta saatler eşitlenmedi (en fazla 8 saat fark beklenir): ' + h2.join(','));
  // 24 saatlik düzen: gece kodu 24 → saat eşitlemede 24 nöbet 8-16 / 16-8 parçalarına bölünebilir
  const r24 = await p.evaluate(([y, d, o]) => api('plan.sides.auto', { ym: y, drafts: d, opts: o }), [ym, drafts, { ...opts, night_code: '24', fri_code: '16 8' }]);
  const hrs24 = (cells, n) => Object.values(cells[n] || {}).reduce((a, c) => a + ({ '24': 24, G: 8, '8 16': 8, '16 8': 16, N: 16 }[c] || 0), 0);
  const h24 = two.filter((n) => !/^Sorumlu/.test(n)).map((n) => hrs24(r24.cells[r2] || {}, n));
  const splits = Object.values(r24.cells[r2] || {}).reduce((a, row) => a + Object.values(row).filter((c) => c === '16 8').length, 0);
  if (Math.max(...h24) - Math.min(...h24) > 8) fail('24 saatlik düzende saatler eşitlenmedi: ' + h24.join(','));
  step(`Saat eşitleme: 8-16 / 16-8 düzeninde 2. basamak fark ${Math.max(...h2) - Math.min(...h2)} saat; 24 saatlik düzende fark ${Math.max(...h24) - Math.min(...h24)} saat (${r24.balanced} değişiklik, ${splits} parça 16-8)`);
  step(`Birlikte planlama: ${okDays} günde B 2 ve A+C 3 kendi basamağından; 10 Nisan izinler korundu, eksik ${r.cross.filter((x) => x.date === d10).length ? 'diğer basamaktan tamamlandı' : 'yok'}; önceki ayın 24'ü sonrası 1'inde yazılmadı; nöbet dışına yazılmadı; Cuma sorumlular ${s1}/${s2}; 2. basamak saat farkı ${Math.max(...h2) - Math.min(...h2)}`);
  const chk = await p.evaluate(([y, d]) => api('plan.sides.check', { ym: y, drafts: d }), [ym, { [r3]: { ...drafts[r3], cells: cells3 }, [r2]: { ...drafts[r2], cells: cells2 } }]);
  const kural = chk.sides.flatMap((s) => s.issues.filter((x) => x.type === 'kural'));
  if (kural.length) fail('otomatik dağıtım kural uyarısı üretti: ' + kural.slice(0, 3).map((x) => x.msg).join(' · '));
  step('Denetim: otomatik dağıtımda kural uyarısı yok (önceki ay dahil)');

  // ---- 3) Ekran: iki ayrı tablo, otomatik dağıt, anlık sayılar, ayrı Excel ----
  await p.evaluate(([y]) => { location.hash = '#/cizelge/taraflar/' + y; }, [ym]);
  await p.locator('.pj-side').first().waitFor();
  if (await p.locator('.pj-side').count() !== 2) fail('iki basamak tablosu görünmedi');
  // Kişileri ekranda ekle (taslaklar boşsa)
  await p.evaluate(([d3, d2, a, b]) => { PJ.sides[0].draft.people = d3; PJ.sides[1].draft.people = d2; PJ.sides.forEach((s) => { s.draft.cells = {}; }); pjDraw(); }, [drafts[r3].people, drafts[r2].people, r3, r2]);
  p.once('dialog', (d) => d.accept());
  await p.click('[data-act=pj-auto]');
  await p.locator('.modal [data-ok], .overlay .btn.primary').last().click();
  await p.waitForFunction(() => PJ.last && /nöbet yazıldı/.test(PJ.last), null, { timeout: 30000 });
  const foot1 = await p.locator('.pj-side').first().locator('tfoot tr').first().locator('td.pl2-cov').nth(1).innerText();
  // Bir hücreyi boşalt → alt satır anında değişir
  const firstNight = await p.evaluate(() => { const sd = PJ.sides[0]; const d = Object.keys(PJ.needs).sort()[1]; const n = sd.draft.people.find((x) => (sd.draft.cells[x.name] || {})[d] === 'N'); return n ? [n.name, d] : null; });
  if (firstNight) {
    await p.evaluate(([n, d]) => { pjSet(PJ.sides[0], n, d, ''); pjDraw(); }, firstNight);
    const foot2 = await p.locator('.pj-side').first().locator('tfoot tr').first().locator('td.pl2-cov').nth(1).innerText();
    if (foot1 === foot2) fail('hücre silinince alt satırdaki sayı güncellenmedi: ' + foot1);
  }
  await p.screenshot({ path: path.join(OUT, 'blokplan.png'), fullPage: false });
  // Excel: iki ayrı dosya
  const names = [];
  for (let i = 0; i < 2; i++) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.locator('[data-act=pj-xlsx]').nth(i).click()]);
    names.push(dl.suggestedFilename());
  }
  if (!names[0].includes('3. Basamak') || !names[1].includes('2. Basamak')) fail('basamak Excel’leri ayrı inmedi: ' + names.join(' | '));
  step('Ekran: iki ayrı tablo, otomatik dağıt, hücre değişince sayılar anında güncellendi, her basamak ayrı Excel (' + names.join(', ') + ')');
  await p.locator('[data-act=pj-save]').click();
  await p.waitForTimeout(800);
  const saved = J(`echo json_encode(array_map(fn($r) => count((array)(json_decode($r['data'], true)['people'] ?? [])), all("SELECT data FROM plan_drafts WHERE ym = '${ym}' AND roster_id IN (${r3}, ${r2}) ORDER BY roster_id")));`);
  if (saved.join(',') !== `${three.length},${two.length}`) fail('basamak taslakları ayrı kaydedilmedi: ' + saved.join(','));
  step('Kaydet: her basamak kendi listesinin taslağına ayrı kaydedildi');

  // ---- 4) Taraf anlık güncelleme ----
  const sig1 = await p.evaluate(() => api('placement.sig', { date: '2031-03-10' }));
  php("set_setting('pl_counts', json_encode(['2031-03-10' => ['B blok' => ['day' => 3, 'night' => 3]]]));");
  const sig2 = await p.evaluate(() => api('placement.sig', { date: '2031-03-10' }));
  if (sig1.sig === sig2.sig) fail('sayı değişince Taraf imzası değişmedi (sayfa kendini yenilemez)');
  step('Taraf: liste / sayı / yerleşim değişince imza değişiyor → sayfa kendiliğinden yenilenir');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { restore(); php(`q("DELETE FROM shift_requests WHERE date LIKE '2031-04-%'"); q("DELETE FROM req_periods WHERE ym = '2031-04'");`); } catch (e) { console.log('geri yükleme hatası: ' + e.message); }
  try { fs.unlinkSync(phpFile); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: blok planı ve basamak planlama testleri geçti');
