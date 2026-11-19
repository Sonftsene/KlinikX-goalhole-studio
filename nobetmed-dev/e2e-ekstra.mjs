// İzin bitişiği hafta sonu kuralı ve ekstra nöbet isteyenler (4.9) — uydurma verilerle.
// e2e-market.mjs (taraflar ve B blok listesi) SONRASI aynı sitede çalışır:
//   node e2e-ekstra.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; nm_tenant_use(nm_tenant_default()); ${code}`], { encoding: 'utf8' });
const noOverflow = async (p, tag) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) fail(`${tag}: telefonda yatay taşma ${w}px`); };

// ---- 0) Kural motoru (doğrudan): önce / sonra, tatil köprüsü, 4 gün yetmez, onaylı izin isteği, kapalı ----
const unit = JSON.parse(php(`require '${path.join(SITE, 'inc/rules.php')}'; require '${path.join(SITE, 'inc/swaps.php')}';
  $L = fn($c = 'Yİ') => ['kind' => 'leave', 'code' => $c, 'label' => 'Yıllık izin'];
  $S = ['kind' => 'shift', 'code' => 'N', 'start_time' => '16:00', 'end_time' => '08:00', 'hours' => 16];
  // 2030-03-04 Pzt … 2030-03-08 Cum izin
  $wk = ['2030-03-04' => $L(), '2030-03-05' => $L(), '2030-03-06' => $L(), '2030-03-07' => $L(), '2030-03-08' => $L()];
  $o = [];
  $o['after_sat'] = rules_leave_weekend($wk, '2030-03-09');
  $o['after_sun'] = rules_leave_weekend($wk, '2030-03-10');
  $o['before_sat'] = rules_leave_weekend($wk, '2030-03-02');
  $o['before_sun'] = rules_leave_weekend($wk, '2030-03-03');
  $o['far'] = rules_leave_weekend($wk, '2030-03-16');
  $o['weekday'] = rules_leave_weekend($wk, '2030-03-11');
  $four = $wk; unset($four['2030-03-08']); $four['2030-03-08'] = $S;
  $o['four'] = rules_leave_weekend($four, '2030-03-09');
  $two = $wk + ['2030-03-11' => $L(), '2030-03-12' => $L(), '2030-03-13' => $L(), '2030-03-14' => $L(), '2030-03-15' => $L()];
  $o['twoweeks_mid'] = rules_leave_weekend($two, '2030-03-09');
  set_setting('rule_leave_wknd', '0');
  $o['off'] = rules_leave_weekend($wk, '2030-03-09');
  set_setting('rule_leave_wknd', '5');
  echo json_encode($o, JSON_UNESCAPED_UNICODE);`));
// Tatil köprüsü ayrı süreçte (tatil önbelleği temiz olsun)
unit.holiday_bridge = php(`require '${path.join(SITE, 'inc/rules.php')}'; require '${path.join(SITE, 'inc/swaps.php')}';
  $L = ['kind' => 'leave', 'code' => 'Yİ', 'label' => 'Yıllık izin'];
  q("INSERT INTO holidays (date, name, half, custom) VALUES ('2030-03-08', 'Deneme tatili', 0, 1)");
  $r = rules_leave_weekend(['2030-03-04' => $L, '2030-03-05' => $L, '2030-03-06' => $L, '2030-03-07' => $L], '2030-03-09');
  q("DELETE FROM holidays WHERE date = '2030-03-08' AND custom = 1");
  echo $r ?? '';`);
for (const k of ['after_sat', 'after_sun', 'before_sat', 'before_sun', 'twoweeks_mid', 'holiday_bridge']) if (!unit[k]) fail('kural: ' + k + ' korunmalı');
for (const k of ['far', 'weekday', 'four', 'off']) if (unit[k]) fail('kural: ' + k + ' korunmamalı: ' + unit[k]);
if (!/sonra/.test(unit.after_sat) || !/öncesi/.test(unit.before_sun)) fail('kural nedeni: ' + JSON.stringify(unit));
step('kural: Pzt–Cum izinliye izin öncesi ve sonrası Cmt/Paz korunuyor; 2 haftalık izin araya giren hafta sonu dahil; Cuma resmî tatil izin haftasına sayılıyor; 4 gün yetmiyor; uzak hafta sonu ve hafta içi etkilenmiyor; 0 = kapalı');

const A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
const B = await ctx('burak'); await login(B.p, 'burak@test.com', 'Sifre1234');

// ---- 1) Eksik çağrısında: B blok listesinde DENİZ ŞAHİN'e Pzt–Cum izin yaz, hafta sonları çağrılamaz ----
const setup = JSON.parse(php(`
  $r = one('SELECT parsed_file_id FROM rosters WHERE id = 3');
  $mx = (string)val('SELECT MAX(date) FROM roster_shifts WHERE roster_id = 3 AND file_id = ?', [$r['parsed_file_id']]);
  $t = strtotime('+3 days'); while ((int)date('w', $t) !== 1) $t += 86400; // ilk Pazartesi (öncesindeki hafta sonu gelecekte)
  $mon = date('Y-m-d', $t);
  if (date('Y-m-d', $t + 6 * 86400) > $mx) { echo json_encode(['skip' => true]); exit; }
  $dates = []; for ($i = 0; $i < 5; $i++) $dates[] = date('Y-m-d', $t + $i * 86400);
  $old = all('SELECT * FROM roster_shifts WHERE roster_id = 3 AND file_id = ? AND name = ? AND date IN (' . implode(',', array_fill(0, 5, '?')) . ')', [$r['parsed_file_id'], 'DENİZ ŞAHİN', ...$dates]);
  q('DELETE FROM roster_shifts WHERE roster_id = 3 AND file_id = ? AND name = ? AND date IN (' . implode(',', array_fill(0, 5, '?')) . ')', [$r['parsed_file_id'], 'DENİZ ŞAHİN', ...$dates]);
  // Hafta sonlarını da boşalt (çağrılabilir olsun; yalnız izin kuralı elesin)
  $wkend = [date('Y-m-d', $t - 2 * 86400), date('Y-m-d', $t - 86400), date('Y-m-d', $t + 5 * 86400), date('Y-m-d', $t + 6 * 86400)];
  $old2 = all('SELECT * FROM roster_shifts WHERE roster_id = 3 AND file_id = ? AND name = ? AND date IN (?, ?, ?, ?)', [$r['parsed_file_id'], 'DENİZ ŞAHİN', ...$wkend]);
  q('DELETE FROM roster_shifts WHERE roster_id = 3 AND file_id = ? AND name = ? AND date IN (?, ?, ?, ?)', [$r['parsed_file_id'], 'DENİZ ŞAHİN', ...$wkend]);
  foreach ($dates as $d) q("INSERT INTO roster_shifts (roster_id, file_id, name, title, date, code, label, kind, hours, start_time, end_time) VALUES (3, ?, 'DENİZ ŞAHİN', NULL, ?, 'Yİ', 'Yıllık izin', 'leave', 0, NULL, NULL)", [$r['parsed_file_id'], $d]);
  echo json_encode(['mon' => $mon, 'wkend' => $wkend, 'old' => array_merge($old, $old2)], JSON_UNESCAPED_UNICODE);`));
if (setup.skip) console.log('  (B blok listesi bu tarihlere uzanmıyor; çağrı denetimi atlandı)');
else {
  const deniz = async (date) => (await apiCall(A.p, 'callout.candidates', { date, shift: 'day', side: 's3' })).people.find((x) => /DENİZ/i.test(x.name));
  for (const d of setup.wkend) {
    const x = await deniz(d);
    if (!x) { fail('Deniz aday listesinde yok: ' + d); continue; }
    if (x.c.wknd !== false || x.ok || !/hafta sonu/.test(x.why.wknd || '')) fail(`${d}: izin bitişiği hafta sonunda çağrılabilir görünüyor: ` + JSON.stringify({ c: x.c, why: x.why }));
  }
  const cands = await apiCall(A.p, 'callout.candidates', { date: setup.wkend[0], shift: 'day', side: 's3' });
  if (!cands.conds.some((c) => c.key === 'wknd')) fail('çağrı şartlarında izin hafta sonu yok');
  const later = new Date(setup.wkend[3]); later.setDate(later.getDate() + 7);
  const xl = await deniz(later.toISOString().slice(0, 10));
  if (xl && xl.c.wknd === false) fail('bir sonraki (izinden uzak) hafta sonu da engellendi');
  // Arayüz: çağrı penceresinde şart sütunu
  await A.p.goto(BASE + '#/eksik');
  await A.p.evaluate((d) => openCalloutModal({ date: d, shift: 'day', side: 's3' }), setup.wkend[2]);
  await A.p.locator('.modal .co-chip', { hasText: 'İzin öncesi/sonrası hafta sonu' }).waitFor({ timeout: 15000 });
  await A.p.screenshot({ path: path.join(OUT, 'x-cagri-kural-desktop.png') });
  await A.p.keyboard.press('Escape');
  step(`eksik çağrısı: ${setup.mon} haftası izinli kişi önceki (${setup.wkend.slice(0, 2).join(', ')}) ve sonraki (${setup.wkend.slice(2).join(', ')}) hafta sonunda “İzin hafta sonu” şartıyla elendi; sonraki hafta sonu etkilenmedi; çağrı penceresinde şart görünüyor`);
}

// ---- 2) Ekstra nöbet isteyen kişi: uygun günler (istek tarihinden ay sonuna kadar) ----
const ym = (await apiCall(E.p, 'live', {})).now.slice(0, 7);
const me0 = await apiCall(E.p, 'extra.me', { ym });
if (!me0.found) fail('Elif ayın listesinde bulunamadı');
const today = me0.days[0] && me0.days[0].date;
if (today !== (await apiCall(E.p, 'live', {})).now.slice(0, 10)) fail('liste istek gününden (bugün) başlamıyor: ' + today);
const lastDay = me0.days[me0.days.length - 1].date;
if (lastDay.slice(0, 7) !== ym || new Date(lastDay.slice(0, 4), +lastDay.slice(5, 7), 0).getDate() !== +lastDay.slice(8)) fail('liste ay sonunda bitmiyor: ' + lastDay);
const busy = me0.days.find((d) => !d.types.night.ok && /nöbeti var/.test(d.types.night.why || ''));
const okN = me0.days.find((d) => d.types.night.ok);
if (!okN) fail('Elif için hiç uygun gece yok (veri?)');
if (busy === undefined) console.log('  (Elif’in bu ay kalan günlerde nöbeti yok; “nöbeti var” denetimi atlandı)');
if (!/geçmiş/i.test(await apiErr(E.p, 'extra.me', { ym: '2020-01' }))) fail('geçmiş ay kabul edildi');
if (!/vardiya/.test(await apiErr(E.p, 'extra.save', { ym, shifts: [] }))) fail('vardiyasız istek kabul edildi');
// Arayüzden kaydet (telefon)
await E.p.goto(BASE + '#/ekstra/gonullu/' + ym);
await E.p.locator('.ex-day').first().waitFor();
await E.p.locator('.ex-chk input[value="day"]').locator('..').click();
await E.p.click('[data-act=ex-save]');
await E.p.getByText('Ekstra nöbet isteğin kaydedildi').first().waitFor();
await E.p.locator('.ex-reg .mk-box.ok').waitFor();
await E.p.screenshot({ path: path.join(OUT, 'x-ekstra-mobile.png'), fullPage: true });
await noOverflow(E.p, 'ekstra nöbet');
const reg = (await apiCall(E.p, 'extra.me', { ym })).reg;
if (!reg || reg.shifts.join() !== '24,night' || reg.days !== null || reg.from !== today) fail('kayıt: ' + JSON.stringify(reg));
if (!(await apiCall(A.p, 'notif.list', { unread: true })).items.some((x) => x.kind === 'extra' && /Elif Yılmaz ekstra nöbet istiyor/.test(x.title))) fail('sorumluya bildirim gitmedi');
step(`ekstra nöbet: liste istek gününden (${today}) ay sonuna (${lastDay}) kadar, her gün 24 saat / gündüz / gece için kurallar ✓/✗ ve nedenleriyle; arayüzden kayıt (gündüz hariç), sorumluya bildirim`);

// ---- 3) Sorumlu: gün gün uygun olanlar; çağrıda “Ekstra istiyor” en üstte ----
const board = await apiCall(A.p, 'extra.board', { ym });
const pe = board.people.find((p) => p.name === 'Elif Yılmaz');
if (!pe || !(pe.ok_days > 0)) fail('isteyenlerde Elif yok: ' + JSON.stringify(board.people));
const bd = board.days.find((d) => d.people.some((p) => p.name === 'Elif Yılmaz'));
if (!bd || bd.people.find((p) => p.name === 'Elif Yılmaz').shifts.includes('day')) fail('gün listesi (gündüz seçilmedi): ' + JSON.stringify(bd));
if (board.days.some((d) => d.date < today)) fail('istek tarihinden önceki gün listelendi');
if ((await apiErr(B.p, 'extra.board', { ym })) === 'kabul') fail('üye isteyenler listesini gördü');
// Elif'in uygun olduğu (B blok) bir gün: çağrı adaylarında işaretli ve uygunlar arasında en üstte
const cand = await apiCall(A.p, 'callout.candidates', { date: bd.date, shift: 'night', side: 's3' });
const ce = cand.people.find((x) => /ELİF/i.test(x.name));
if (ce && !ce.extra) fail('çağrı adayında “ekstra istiyor” işareti yok');
if (ce && ce.ok && cand.people.filter((x) => x.ok)[0] !== undefined && !cand.people.filter((x) => x.ok)[0].extra) fail('ekstra isteyen uygunlar arasında en üstte değil');
await A.p.goto(BASE + '#/ekstra/liste/' + ym);
await A.p.locator('.ex-p', { hasText: 'Elif Yılmaz' }).first().waitFor();
await A.p.screenshot({ path: path.join(OUT, 'x-isteyenler-desktop.png'), fullPage: true });
await A.p.locator('[data-act=ex-callout]').first().click();
await A.p.locator('.modal').first().waitFor();
if (ce) { await A.p.locator('.modal .badge', { hasText: 'Ekstra istiyor' }).first().waitFor({ timeout: 15000 }).catch(() => fail('çağrı penceresinde “Ekstra istiyor” rozeti yok')); }
await A.p.keyboard.press('Escape');
// Seçtiğim günler: yalnız o gün
const pickDay = okN.date;
await apiCall(E.p, 'extra.save', { ym, shifts: ['night'], days: [pickDay] });
const b2 = await apiCall(A.p, 'extra.board', { ym });
const elifDays = b2.days.filter((d) => d.people.some((p) => p.name === 'Elif Yılmaz')).map((d) => d.date);
if (elifDays.join() !== pickDay) fail('seçili gün modu: ' + elifDays.join());
await apiCall(E.p, 'extra.cancel', { ym });
if ((await apiCall(A.p, 'extra.board', { ym })).people.length) fail('geri çekilen istek listede');
step('sorumlu: isteyenler ve gün gün uygun olanlar (eksik sayısıyla), çağrı adaylarında “Ekstra istiyor” rozeti ve öncelik, listeden “Çağrı aç”; seçili gün modu; geri çekme; üye listeyi göremez');

// ---- 4) Nöbet devral: hem benim alabileceğim hem sahibinin bırakabileceği nöbetler ----
const tg = await apiCall(E.p, 'extra.take', { ym });
if (!tg.found) fail('devral: Elif listede bulunamadı');
const okItems = tg.days.flatMap((d) => d.items.filter((x) => x.ok).map((x) => ({ ...x, date: d.date })));
if (!okItems.length) fail('devral: hiç alınabilir nöbet yok (veri?)');
// 4.14: tamamı alınamasa da gündüzü / gecesi alınabilen 24 saatlik nöbet de genel listede yer alır
if (tg.days.some((d) => d.date < today || d.items.some((x) => !(x.any ?? x.ok) || (!x.ok && !(x.parts && (x.parts.day.ok || x.parts.night.ok)))))) fail('genel listede uygunsuz ya da geçmiş gün var');
const isElif = (n) => String(n).toLocaleLowerCase('tr').includes('elif');
if (tg.days.some((d) => d.items.some((x) => isElif(x.name)))) fail('kendi nöbetim listede');
// Elif'in kendi nöbeti olan günde (örn. listede nöbeti var) o günden bir şey alınamaz; seçili gün görünümü nedenleri verir
const myShiftDay = me0.days.find((d) => /nöbeti var/.test(d.types.night.why || ''));
if (myShiftDay) {
  const td = await apiCall(E.p, 'extra.take', { ym, date: myShiftDay.date });
  if (td.days.some((d) => d.items.some((x) => x.ok))) fail('kendi nöbetim olan gün başkasının nöbeti alınabilir göründü');
  if (td.days.length && !td.days[0].items.every((x) => /senin de/.test(x.my_why || ''))) fail('seçili günde neden (o gün senin de nöbetin var) yok');
}
// Seçili gün: o günün tüm nöbetleri (uygun olmayanlar da) nedenleriyle
const pickT = okItems[0];
const tday = await apiCall(E.p, 'extra.take', { ym, date: pickT.date });
if (!tday.days.length || tday.days[0].date !== pickT.date || !tday.days[0].items.some((x) => x.name === pickT.name && x.ok)) fail('seçili gün görünümü');
// Kural doğrulaması: alınabilir denen her nöbet hem benim için hem sahibi için kurallara uyuyor (bağımsız denetim)
const chk = JSON.parse(php(`require '${path.join(SITE, 'inc/rules.php')}'; require '${path.join(SITE, 'inc/swaps.php')}'; require_once '${path.join(SITE, 'inc/notify.php')}'; require_once '${path.join(SITE, 'inc/api_sync.php')}';
  $items = json_decode('${JSON.stringify(okItems.slice(0, 25).map((x) => [x.roster_id, x.name, x.date])).replace(/'/g, "\\'")}', true);
  $bad = [];
  foreach ($items as [$rid, $name, $date]) {
    $tl = swap_pending_overlay(swap_timeline($rid, date('Y-m-d', strtotime($date . ' -40 days')), date('Y-m-d', strtotime($date . ' +40 days'))), date('Y-m-d', strtotime($date . ' -40 days')), date('Y-m-d', strtotime($date . ' +40 days')), $rid);
    $me = null; foreach ($tl as $k => $p) if (names_match((string)$p['name'], 'Elif Yılmaz')) $me = $k;
    $pk = swap_key($name); $row = $tl[$pk]['days'][$date];
    $mine = $tl[$me]['days']; if (isset($mine[$date])) { $bad[] = "$date $name: benim kaydım var"; continue; }
    $mine[$date] = $row;
    if ($e = swap_check($mine, [$date], [], swap_rules(), 'Sen')) $bad[] = "$date $name: $e";
    $th = $tl[$pk]['days']; unset($th[$date]);
    if ($e = swap_check($th, [], [$date], swap_rules(), 'O')) $bad[] = "$date $name: $e";
  }
  echo json_encode($bad, JSON_UNESCAPED_UNICODE);`));
if (chk.length) fail('kurala uymayan nöbet “alınabilir” göründü: ' + chk.slice(0, 3).join(' | '));
// Arayüz (telefon): genel liste, gün şeridi, vardiya süzgeci, seçili gün
await E.p.goto(BASE + '#/ekstra');
await E.p.locator('.tk-strip .tk-dc').first().waitFor();
await E.p.locator('.tk-it').first().waitFor();
await E.p.screenshot({ path: path.join(OUT, 'x-devral-mobile.png'), fullPage: true });
await noOverflow(E.p, 'nöbet devral');
await E.p.locator(`.tk-dc[href$="${pickT.date}"]`).click();
await E.p.waitForFunction((d) => location.hash.endsWith(d), pickT.date);
await E.p.locator('.tk-it', { hasText: pickT.display }).first().waitFor();
// İste → sahibi kabul eder (sahibi uygulamada kayıtlıysa)
const askable = okItems.find((x) => x.user_id);
if (!askable) console.log('  (alınabilir nöbetlerin sahiplerinin hesabı yok; istek akışı atlandı)');
else {
  const owner = { 'Ayşe Kaya': A, 'Burak Demir': B }[askable.display];
  await E.p.goto(BASE + '#/ekstra/' + ym + '/' + askable.date);
  await E.p.locator(`.tk-it [data-act=tk-ask][data-n="${askable.name}"]`).click();
  await E.p.fill('.modal #tkNote', 'Uygunsa ben alırım');
  await E.p.locator('.modal [data-go]').click();
  await E.p.getByText('İstek gönderildi').first().waitFor();
  await E.p.locator('.tk-req .badge', { hasText: 'Yanıt bekliyor' }).first().waitFor();
  if (!/zaten/.test(await apiErr(E.p, 'extra.take.ask', { date: askable.date, name: askable.name }))) fail('aynı istek iki kez gönderildi');
  if (owner) {
    const inc = (await apiCall(owner.p, 'extra.take', { ym })).requests.find((r) => r.dir === 'in' && r.status === 'pending' && r.date === askable.date);
    if (!inc) fail('nöbet sahibine istek düşmedi');
    if (!(await apiCall(owner.p, 'notif.list', { unread: true })).items.some((x) => /Nöbet devralma isteği/.test(x.title))) fail('sahibine bildirim gitmedi');
    if ((await apiErr(E.p, 'extra.take.respond', { id: inc.id, accept: true })) === 'kabul') fail('isteyen kendi isteğini kabul etti');
    await owner.p.goto(BASE + '#/ekstra');
    await owner.p.locator(`[data-act=tk-resp][data-id="${inc.id}"][data-a="1"]`).click();
    await owner.p.locator('.modal [data-ok]').last().click();
    await owner.p.getByText('Nöbet devri kabul edildi').first().waitFor();
    const sw = JSON.parse(php(`echo json_encode(one("SELECT kind, status, from_name, to_name, from_date FROM swap_requests WHERE from_date = ? AND status = 'accepted' ORDER BY id DESC LIMIT 1", ['${askable.date}']), JSON_UNESCAPED_UNICODE);`));
    if (!sw || sw.kind !== 'give' || !isElif(sw.to_name)) fail('kabul edilen devir değişim kayıtlarına geçmedi: ' + JSON.stringify(sw));
    const after = await apiCall(E.p, 'extra.take', { ym, date: askable.date });
    if (after.days.some((d) => d.items.some((x) => x.name === askable.name && x.ok))) fail('devredilen nöbet hâlâ alınabilir görünüyor');
    if (!(await apiCall(E.p, 'notif.list', { unread: true })).items.some((x) => /kabul edildi/.test(x.title))) fail('isteyene kabul bildirimi gitmedi');
    php(`q("UPDATE swap_requests SET status = 'cancelled' WHERE from_date = ? AND status = 'accepted' AND (to_name LIKE '%lif%' OR to_name LIKE '%LİF%')", ['${askable.date}']);`);
  } else {
    const myReq = (await apiCall(E.p, 'extra.take', { ym })).requests.find((r) => r.dir === 'out' && r.status === 'pending');
    await apiCall(E.p, 'extra.take.cancel', { id: myReq.id });
  }
}
step(`nöbet devral: ${okItems.length} alınabilir nöbet (hem benim hem sahibinin kuralları bağımsız denetimle doğrulandı), kendi nöbetim olan gün nedenli, gün şeridi ve seçili gün görünümü, İste → sahibine bildirim → Ver → devir kaydı (sorumluya iletilir), çift istek engeli`);

// Temizlik: geçici izin kayıtlarını geri al
if (!setup.skip) php(`$r = one('SELECT parsed_file_id FROM rosters WHERE id = 3');
  q("DELETE FROM roster_shifts WHERE roster_id = 3 AND file_id = ? AND name = 'DENİZ ŞAHİN' AND kind = 'leave' AND code = 'Yİ'", [$r['parsed_file_id']]);
  foreach (json_decode('${JSON.stringify(setup.old).replace(/'/g, "\\'")}', true) as $x) { unset($x['id']); q('INSERT INTO roster_shifts (' . implode(',', array_keys($x)) . ') VALUES (' . implode(',', array_fill(0, count($x), '?')) . ')', array_values($x)); }`);

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nEKSTRA NÖBET TESTLERİ GEÇTİ');
