// Nöbet istekleri: basamak / liste ayrımı olmayan dönem (4.21) — e2e-placement ve e2e-requests SONRASI.
// Kişiler ay ay farklı listede (2. / 3. basamak) çalışınca istekler tüm birim için toplanır; liste sorulmaz, panel tek grup.
//   node e2e-istek-birlesik.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
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
const p2 = (n) => String(n).padStart(2, '0');

let pid = null, A = null;
try {
  A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  const B = await ctx('burak');
  await login(B.p, 'burak@test.com', 'Sifre1234');

  // Boş bir ay bul (e2e-requests gelecek ayı kullanır)
  let d = await apiCall(A.p, 'req.periods');
  const used = new Set(d.periods.map((p) => p.ym));
  const now = new Date();
  let ym = null;
  for (let k = 1; k <= 3 && !ym; k++) { const t = new Date(now.getFullYear(), now.getMonth() + k, 1); const y = `${t.getFullYear()}-${p2(t.getMonth() + 1)}`; if (!used.has(y)) ym = y; }
  if (!ym) throw new Error('boş ay yok');
  const rosters = d.rosters;
  if (rosters.length < 2) fail('test için en az iki nöbet listesi gerekli');

  // ---- 1) Sorumlu dönemi "ayrım yapma" ile açar (arayüzden) ----
  await A.p.goto(BASE + '#/istekler');
  await A.p.locator('[data-act=rq-new]').first().click();
  await A.p.locator('#rqPerForm').waitFor();
  if (await A.p.locator('#rqPerForm [name=merge]').isChecked()) fail('ilk kez açılırken ayrım kapatma varsayılan olarak açık');
  await A.p.selectOption('#rqPerForm [name=ym]', ym);
  await A.p.locator('label.switch:has([name=merge]) .track').click();
  if (await A.p.locator('#rqPerRoster').isVisible()) fail('ayrım kapalıyken liste seçimi görünüyor');
  await A.p.screenshot({ path: path.join(OUT, 'rqb-donem.png') });
  await A.p.click('.modal button[form=rqPerForm]');
  await A.p.waitForFunction((y) => RQ.periods.some((p) => p.ym === y), ym);
  d = await apiCall(A.p, 'req.periods');
  const per = d.periods.find((p) => p.ym === ym);
  pid = per.id;
  if (!per.merge || per.roster_id !== null) fail('dönem birleşik açılmadı: ' + JSON.stringify(per));
  if (!d.merge_default) fail('seçim hatırlanmadı');
  step('sorumlu dönemi “basamak / liste ayrımı yapma” ile açtı; liste seçimi gizlendi; seçim hatırlandı');

  // ---- 2) Üye liste seçmeden yazar ----
  const mine = await apiCall(E.p, 'req.mine', { period_id: pid });
  if (!mine.roster.merged || mine.choices.length) fail('üyeye liste soruluyor: ' + JSON.stringify(mine.roster));
  await E.p.goto(BASE + '#/istekler');
  await E.p.waitForFunction(() => typeof RQ !== 'undefined' && RQ.loaded);
  await E.p.evaluate((id) => { RQ.pid = id; RQ.mine = null; location.hash = '#/'; }, pid);
  await E.p.waitForTimeout(300);
  await E.p.goto(BASE + '#/istekler');
  await E.p.locator('#rqRost').waitFor({ timeout: 10000 }).catch(() => {});
  const rostTxt = await E.p.locator('#rqRost').innerText().catch(() => '');
  if (rostTxt && !/tüm birim/i.test(rostTxt)) fail('üye ekranında liste notu yanlış: ' + rostTxt);
  const day = (n) => `${ym}-${p2(n)}`;
  // roster_id gönderilse bile yok sayılır
  await apiCall(E.p, 'req.save', { period_id: pid, items: [{ date: day(10), kind: 'bosluk' }, { date: day(11), kind: 'izin' }], roster_id: rosters[0].id });
  await apiCall(B.p, 'req.save', { period_id: pid, items: [{ date: day(10), kind: 'bosluk' }] });
  const m2 = await apiCall(E.p, 'req.mine', { period_id: pid });
  if (m2.items.length !== 2 || m2.roster.id !== null) fail('üye istekleri kaydedilmedi ya da listeye bağlandı');
  await E.p.screenshot({ path: path.join(OUT, 'rqb-uye.png') });
  step('üye: liste sorulmadı (“tüm birim için toplanır”), istekler listeye bağlanmadan kaydedildi');

  // ---- 3) Panel tek grup, pano liste adı göstermez ----
  const pan = await apiCall(A.p, 'req.panel', { period_id: pid });
  if (pan.sides.length !== 1 || pan.sides[0].key !== 'all' || pan.sides[0].name !== 'Tüm birim') fail('panel tek grup değil: ' + pan.sides.map((s) => s.name).join(', '));
  const d10 = pan.sides[0].days.find((x) => x.date === day(10));
  if (!d10 || d10.req !== 2) fail('aynı gündeki iki istek aynı grupta sayılmadı: ' + JSON.stringify(d10));
  if (pan.people.some((x) => x.side !== 'all')) fail('kişiler tek gruba düşmedi');
  if (pan.sides[0].people < 3) fail('grup kişi sayısı tüm listelerin birleşimi değil: ' + pan.sides[0].people);
  const board = await apiCall(B.p, 'req.board', { period_id: pid });
  if (board.people.some((x) => x.roster)) fail('panoda liste adı görünüyor');
  await A.p.goto(BASE + '#/istekler');
  await A.p.evaluate((id) => { RQ.pid = id; RQ.panel = null; }, pid);
  await A.p.goto(BASE + '#/istekler/yonetim');
  await A.p.waitForTimeout(1200);
  if (await A.p.locator('.rq-sides').count()) fail('panelde taraf sekmeleri hâlâ var');
  await A.p.screenshot({ path: path.join(OUT, 'rqb-panel.png'), fullPage: true });
  step(`panel: tek grup “Tüm birim” (${pan.sides[0].people} kişi, iki listenin birleşimi), aynı gündeki istekler birlikte sayıldı; panoda liste adı yok`);

  // ---- 4) Sonraki dönem varsayılanı ----
  await A.p.goto(BASE + '#/istekler');
  await A.p.locator('[data-act=rq-new]').first().click();
  await A.p.locator('#rqPerForm').waitFor();
  if (!(await A.p.locator('#rqPerForm [name=merge]').isChecked())) fail('sonraki dönemde ayrım kapatma hatırlanmadı');
  await A.p.keyboard.press('Escape');
  step('yeni dönem açarken seçenek hatırlanıyor (açık geliyor)');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { if (A && pid) await apiCall(A.p, 'req.period.delete', { id: pid }); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: basamak ayrımı olmayan istek dönemi testleri geçti');
