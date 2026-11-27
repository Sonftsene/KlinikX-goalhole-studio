// 24 saatlik nöbetin yalnız gündüzünü (08-16) ya da gecesini (16-08) devretme / ilana koyma / devralma (4.14) — uydurma verilerle.
// e2e-market.mjs SONRASI aynı sitede (Kasım–Aralık listeleri yüklü) çalışır:
//   node e2e-parca.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const ACC = { 'Ayşe Kaya': ['ayse@test.com', 'Sifre1234'], 'Elif Yılmaz': ['elif@test.com', 'YeniSifre99'], 'Burak Demir': ['burak@test.com', 'Sifre1234'] };
const today = php("echo date('Y-m-d');").trim();
/** Listedeki ad (ör. “BURAK DEMİR”) → test hesabının adı */
const accOf = (name) => Object.keys(ACC).find((k) => k.toLocaleUpperCase('tr') === String(name || '').toLocaleUpperCase('tr')) || null;
const is24 = (e) => e.kind === 'shift' && e.start === '08:00' && e.end === '08:00';

// ---- 1) Doğrudan devir: yalnız gündüz ----
const P = {};
for (const [n, [em, pw]] of Object.entries(ACC)) { P[n] = await ctx(n); await login(P[n].p, em, pw); }
let giver = null, date = null, target = null, opt = null;
for (const n of Object.keys(ACC)) {
  const my = await apiCall(P[n].p, 'shifts.my');
  for (const e of (my.entries || []).filter((x) => is24(x) && x.date > today)) {
    const o = await apiCall(P[n].p, 'swap.options', { date: e.date, part: 'day' }).catch(() => null);
    const t = o && o.give.find((g) => accOf(g.name) && g.user_id);
    if (t) { giver = n; date = e.date; target = t.name; opt = o; break; }
  }
  if (giver) break;
}
if (!giver) { console.log('UYARI: test verisinde parçalı devir için uygun 24 saatlik nöbet bulunamadı'); fail('uygun 24 saatlik nöbet yok'); }
else {
  if (!opt.mine.parts || opt.mine.part !== 'day' || opt.swap.length) fail('parça seçenekleri yanlış: ' + JSON.stringify(opt.mine));
  if (opt.give_error) fail('gündüzünü verirken boşluk hatası çıkmamalı: ' + opt.give_error);
  // Arayüz: Değiş / Devret penceresinde parça seçimi
  const G = P[giver];
  await G.p.goto(BASE + '#/nobetim');
  await G.p.evaluate((d) => { const b = document.createElement('button'); b.dataset.act = 'swap-open'; b.dataset.d = d; b.id = 'tswap'; document.body.appendChild(b); }, date);
  await G.p.click('#tswap');
  await G.p.locator('.modal .seg [data-t=give]').click();
  await G.p.locator('.modal [data-part=day]').waitFor();
  await G.p.locator('.modal [data-part=day]').click();
  await G.p.getByText('gecesi (16-08) sizde kalır').first().waitFor({ timeout: 8000 }).catch(() => fail('pencerede “gecesi sizde kalır” yok'));
  await G.p.screenshot({ path: path.join(OUT, 'p-devret-parca.png') });
  await G.p.locator('.modal .sw-give', { hasText: target }).first().click();
  await G.p.locator('.modal [data-send]').click();
  await G.p.getByText('Teklif gönderildi').first().waitFor();
  const req = (await apiCall(G.p, 'swap.list')).items.find((r) => r.from_date === date && r.to_name === target && r.status === 'pending');
  if (!req || req.part !== 'day') fail('devir isteği parçasız kaydedildi: ' + JSON.stringify(req));
  const T = P[accOf(target)];
  await apiCall(T.p, 'swap.respond', { id: req.id, accept: true });
  // Zaman çizelgesi: veren artık yalnız gece (16-08), alan gündüz (08-16)
  const chk = await apiCall(G.p, 'listing.check', { date });
  if (chk.mine.start !== '16:00' || chk.mine.end !== '08:00' || chk.mine.parts) fail('kabulden sonra verende gece kalmadı: ' + JSON.stringify(chk.mine));
  // Alanın zaman çizelgesi (kabul edilmiş, Excel'e işlenmemiş devir dahil): o gün gündüz 08-16
  const tdays = php(`foreach (['notify', 'mail', 'push', 'rules', 'swaps'] as $f) require_once '${SITE}/inc/' . $f . '.php';
    if (!function_exists('fail')) { function fail($m, $c = 400) { throw new RuntimeException($m); } function s($k, $m = 255) { return ''; } function i($k) { return null; } function b($k) { return false; } function arr($k) { return []; } }
    foreach (glob('${SITE}/inc/mod_*.php') as $f) require_once $f;
    $r = one("SELECT * FROM swap_requests WHERE id = ${req.id}"); $tl = mk_tl((int)$r['roster_id'], '${date}', '${date}');
    $x = $tl[swap_key($r['to_name'])]['days']['${date}'] ?? null; echo $x ? $x['start_time'] . '-' . $x['end_time'] : 'yok';`).trim();
  if (tdays !== '08:00-16:00') fail('alanın zaman çizelgesinde gündüz yok: ' + tdays);
  step(`doğrudan devir: ${giver} ${date} 24 saatin yalnız gündüzünü ${target}’e verdi; kabulde veren gece (16-08), alan gündüz (08-16) olarak hesaplanıyor`);
  // Excel'e işlenince "uygulandı"
  php(`$r = one("SELECT * FROM swap_requests WHERE id = ${req.id}"); $rid = (int)$r['roster_id']; $f = (int)val('SELECT parsed_file_id FROM rosters WHERE id = ?', [$rid]);
    q("UPDATE roster_shifts SET code = '16 8', label = 'Gece', hours = 16, start_time = '16:00', end_time = '08:00' WHERE roster_id = ? AND file_id = ? AND date = ? AND name = ?", [$rid, $f, $r['from_date'], $r['from_name']]);
    q("INSERT INTO roster_shifts (roster_id, file_id, name, title, date, code, label, kind, hours, start_time, end_time) VALUES (?, ?, ?, NULL, ?, '8 16', 'Gündüz', 'shift', 8, '08:00', '16:00')", [$rid, $f, $r['to_name'], $r['from_date']]);
    foreach (['notify', 'mail', 'push', 'rules', 'swaps'] as $f) require_once '${SITE}/inc/' . $f . '.php';
    if (!function_exists('fail')) { function fail($m, $c = 400) { throw new RuntimeException($m); } function s($k, $m = 255) { return ''; } function i($k) { return null; } function b($k) { return false; } function arr($k) { return []; } }
    foreach (glob('${SITE}/inc/mod_*.php') as $f) require_once $f;
    echo swap_check_applied($rid);`);
  const st = (await apiCall(G.p, 'swap.list')).items.find((r) => r.id === req.id);
  if (!st || st.status !== 'applied') fail('Excel’e işlenen parçalı devir “uygulandı” olmadı: ' + (st && st.status));
  else step('Excel’de veren 16-08, alan 08-16 olunca parçalı devir kendiliğinden “listeye işlendi” oldu');
}

// ---- 2) İlan: yalnız gece ----
let lg = null, ld = null;
for (const n of Object.keys(ACC)) {
  const my = await apiCall(P[n].p, 'shifts.my');
  for (const e of (my.entries || []).filter((x) => is24(x) && x.date > today && x.date !== date)) {
    const c = await apiCall(P[n].p, 'listing.check', { date: e.date }).catch(() => null);
    if (c && c.mine.parts && !c.open && c.can.night > 0) { lg = n; ld = e.date; break; }
  }
  if (lg) break;
}
if (lg) {
  const L = (await apiCall(P[lg].p, 'listing.create', { date: ld, kind: 'give', part: 'night', note: 'yalnız gece' })).listing;
  if (L.part !== 'night' || L.start !== '16:00' || L.hours !== 16 || L.part_code !== '16 8') fail('parçalı ilan yanlış: ' + JSON.stringify(L));
  const other = Object.keys(ACC).find((n) => n !== lg && n !== giver) || Object.keys(ACC).find((n) => n !== lg);
  const b = (await apiCall(P[other].p, 'listing.list')).board.find((x) => x.id === L.id);
  await P[other].p.goto(BASE + '#/ilanlar');
  await P[other].p.locator('.mk-l1 .badge.warn', { hasText: 'Yalnız gece' }).first().waitFor({ timeout: 8000 }).catch(() => fail('ilan panosunda “Yalnız gece” rozeti yok'));
  await P[other].p.screenshot({ path: path.join(OUT, 'p-ilan-gece.png') });
  if (b && b.elig && b.elig.ok) {
    await apiCall(P[other].p, 'listing.apply', { id: L.id });
    const app = (await apiCall(P[lg].p, 'listing.get', { id: L.id })).listing.apps.find((a) => a.status === 'applied');
    await apiCall(P[lg].p, 'listing.choose', { id: L.id, app_id: app.id });
    const sw = (await apiCall(P[lg].p, 'swap.list')).items.find((r) => r.from_date === ld && r.status === 'accepted');
    if (!sw || sw.part !== 'night') fail('ilandan oluşan devir parçasız: ' + JSON.stringify(sw));
    else step(`ilan: ${lg} ${ld} nöbetinin yalnız gecesini ilana koydu, ${other} başvurdu, seçilince “yalnız gece” devri sorumluya iletildi`);
  } else step(`ilan: yalnız gece ilanı açıldı (16-08, kod 16 8)${b ? '; ' + other + ' için uygunluk: ' + (b.elig && b.elig.reason) : ''}`);
} else console.log('(ilan denemesi için uygun ikinci 24 saatlik nöbet yok)');

// ---- 3) Devral: 24 saatlik nöbetlerde gündüz / gece ayrı istenebilir ----
let found = null;
for (const n of Object.keys(ACC)) {
  const ym = today.slice(0, 7);
  for (const m of [ym, (() => { const d = new Date(today + 'T12:00'); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 7); })()]) {
    const r = await apiCall(P[n].p, 'extra.take', { ym: m }).catch(() => null);
    const it = r && r.days.flatMap((x) => x.items.map((i) => ({ ...i, date: x.date }))).find((i) => i.parts && (i.parts.day.ok || i.parts.night.ok) && i.user_id && accOf(i.display));
    if (it) { found = { n, it, ym: m }; break; }
  }
  if (found) break;
}
if (found) {
  const { n, it, ym } = found;
  const part = it.parts.night.ok ? 'night' : 'day';
  await P[n].p.goto(BASE + '#/ekstra/' + ym + '/' + it.date);
  const pbtn = P[n].p.locator(`[data-act=tk-ask][data-p=${part}][data-n="${it.name}"]`).first(); // o gün birden çok kişinin parçası olabilir: istenen kişininki
  await pbtn.waitFor({ timeout: 10000 }).catch(() => fail('devral sayfasında parça düğmesi yok'));
  await P[n].p.screenshot({ path: path.join(OUT, 'p-devral-parca.png') });
  await pbtn.click();
  await P[n].p.locator('.modal [data-go]').click();
  await P[n].p.getByText('Devir teklifi gönderildi').first().waitFor();
  const GV = P[accOf(it.display)];
  // Önceki adımdan kalan bildirim beklemeyi erken bitirebilir: istek kaydını birkaç saniye yokla
  let tr = null;
  for (let k = 0; k < 20 && !tr; k++) {
    tr = (await apiCall(GV.p, 'extra.take', { ym })).requests.find((r) => r.dir === 'in' && r.status === 'pending' && r.date === it.date);
    if (!tr) await P[n].p.waitForTimeout(250);
  }
  if (!tr || tr.part !== part) fail('devralma isteğinde parça yok: ' + JSON.stringify(tr));
  else {
    await apiCall(GV.p, 'extra.take.respond', { id: tr.id, accept: true });
    const sw = (await apiCall(GV.p, 'swap.list')).items.find((r) => r.from_date === it.date && r.status === 'accepted');
    if (!sw || sw.part !== part) fail('devralmadan oluşan devir parçasız: ' + JSON.stringify(sw));
    else step(`devral: ${n}, ${it.display}’in ${it.date} 24 saatlik nöbetinin yalnız ${part === 'day' ? 'gündüzünü' : 'gecesini'} istedi; kabulde parçalı devir oluştu`);
  }
} else console.log('(devral denemesi için parçası alınabilir 24 saatlik nöbet yok)');

// ---- 4) Doğrulama: 24 saat olmayan nöbet parça olarak verilemez ----
let checked = false;
for (const n of Object.keys(ACC)) {
  const my = await apiCall(P[n].p, 'shifts.my');
  for (const e of (my.entries || []).filter((x) => x.kind === 'shift' && x.date > today && !is24(x))) {
    const res = await apiCall(P[n].p, 'swap.options', { date: e.date, part: 'day' }).then((r) => r, (er) => er.message);
    // Kabul edilmiş devirle o gün 24 saate tamamlanmışsa (kendi gündüzü + aldığı gece) bölünebilir: atla
    if (typeof res === 'object' && res.mine && res.mine.hours === 24) continue;
    const msg = typeof res === 'object' ? 'kabul' : res;
    if (msg === 'kabul') { fail(`24 saat olmayan nöbet (${e.date} ${e.code}) parça olarak verilebildi`); checked = true; break; }
    if (/24 saatlik/.test(msg)) { step('24 saat olmayan nöbette parça seçimi reddediliyor'); checked = true; break; }
    // başka neden (ör. önceki testlerde devredilmiş): sıradakini dene
  }
  if (checked) break;
}

await browser.close();
if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('TAMAM: parçalı devir testleri geçti');
