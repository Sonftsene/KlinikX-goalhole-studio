// Aydan aya nöbet isteği (4.31.5): ör. 28 Şubat – 2 Mart; her gün kendi ayının dönemine düşer — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır:
//   node e2e-istek-ay.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`)); return { c, p };
}
async function login(p, email, pws) {
  for (const pw of pws) {
    await p.goto(BASE);
    await p.fill('[data-form=login] [name=email]', email);
    await p.fill('[data-form=login] [name=password]', pw);
    await p.click('[data-form=login] button[type=submit]');
    if (await p.waitForFunction(() => typeof S !== 'undefined' && S.me, null, { timeout: 6000 }).then(() => true, () => false)) return true;
  }
  return false;
}
const call = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y), [a, d]);
const err = (p, a, d = {}) => call(p, a, d).then(() => 'kabul', (e) => e.message);

try {
  const A = await ctx('admin', false); await login(A.p, 'ayse@test.com', ['Sifre1234']);
  const M = await ctx('elif', true); if (!(await login(M.p, 'elif@test.com', ['YeniSifre99', 'Sifre1234']))) fail('Elif giriş yapamadı');
  // Mart 2031 dönemi (1 Mart Cumartesi: takvimin ilk haftasında 24–28 Şubat görünür)
  const p1 = (await call(A.p, 'req.period.save', { ym: '2031-03', deadline: '2031-03-20', silent: true })).id;
  // 1) Aydan aya kayıt: 27–28 Şubat + 1 Mart yıllık izin, 31 Mart + 1–2 Nisan boşluk
  const items = [['2031-02-27', 'izin'], ['2031-02-28', 'izin'], ['2031-03-01', 'izin'], ['2031-03-31', 'bosluk'], ['2031-04-01', 'bosluk'], ['2031-04-02', 'bosluk']].map(([date, kind]) => ({ date, kind }));
  await call(M.p, 'req.save', { period_id: p1, items });
  const m1 = await call(M.p, 'req.mine', { period_id: p1 });
  const got = m1.items.map((x) => x.date).join(',');
  if (got !== items.map((x) => x.date).join(',')) fail('aydan aya kayıt: ' + got);
  if (!m1.items.find((x) => x.date === '2031-02-27').month || m1.items.find((x) => x.date === '2031-03-01').month) fail('ay dışı günler işaretlenmedi');
  if (!/içinde olmalı/.test(await err(M.p, 'req.save', { period_id: p1, items: [...items, { date: '2031-04-09', kind: 'bosluk' }] }))) fail('7 günden uzak tarih kabul edildi');
  step('aydan aya kayıt: 27 Şubat – 1 Mart yıllık izin ve 31 Mart – 2 Nisan boşluk tek dönemde yazıldı; 7 günden uzak gün reddedildi');
  // 2) Nisan dönemi açılınca 1–2 Nisan oraya geçer; Mart'ta komşu gün olarak görünmeye devam eder
  const p2 = (await call(A.p, 'req.period.save', { ym: '2031-04', deadline: '2031-04-20', silent: true })).id;
  const m2 = await call(M.p, 'req.mine', { period_id: p2 });
  const apr = m2.items.filter((x) => x.date.startsWith('2031-04')).map((x) => x.date).join(',');
  if (apr !== '2031-04-01,2031-04-02') fail('Nisan dönemi açılınca günler oraya geçmedi: ' + apr);
  if (!m2.items.some((x) => x.date === '2031-03-31')) fail('Nisan dönemi önceki ayın komşu gününü (31 Mart) göstermedi');
  const panel2 = await call(A.p, 'req.panel', { period_id: p2 });
  if (!JSON.stringify(panel2).includes('2031-04-01')) fail('Nisan panelinde 1 Nisan yok');
  const m1b = await call(M.p, 'req.mine', { period_id: p1 });
  if (m1b.items.length !== 6) fail('Mart dönemi komşu günleri kaybetti: ' + m1b.items.length);
  step('Nisan dönemi açılınca 1–2 Nisan kendiliğinden Nisan dönemine geçti (panelde görünür); Mart ekranında komşu gün olarak görünmeye devam ediyor');
  // 3) Arayüz: takvimde komşu ayın günleri, dokunarak ekle, yazarak "25 şubat izin"
  await M.p.goto(BASE + '#/istekler');
  await M.p.waitForFunction(() => typeof RQ !== 'undefined' && RQ.loaded);
  await M.p.evaluate((pid) => { RQ.pid = pid; RQ.tab = 'benim'; drawRqTop(); loadRqTab(); }, p1);
  await M.p.locator('.rq-d.adj[data-d="2031-02-27"]').waitFor({ timeout: 8000 });
  if (!/k-izin/.test(await M.p.getAttribute('.rq-d.adj[data-d="2031-02-27"]', 'class'))) fail('takvimde 27 Şubat yıllık izin görünmüyor');
  await M.p.click('.rq-d.adj[data-d="2031-02-26"]');
  await M.p.fill('#rqTxt', '24 şubat izin');
  await M.p.click('#rqApply');
  await M.p.screenshot({ path: path.join(OUT, 'istek-aydan-aya.png'), fullPage: true });
  await M.p.click('[data-act=rq-save]');
  await M.p.getByText('Kaydedildi').first().waitFor();
  const m3 = await call(M.p, 'req.mine', { period_id: p1 });
  const k = (d) => (m3.items.find((x) => x.date === d) || {}).kind;
  if (k('2031-02-26') !== 'bosluk' || k('2031-02-24') !== 'izin') fail('arayüzden komşu gün eklenmedi: ' + JSON.stringify(m3.items.map((x) => x.date + x.kind)));
  const lt = await M.p.locator('#rqList').innerText();
  if (!/27 Şub, 28 Şub, 1 Mar|27, 28 Şub/.test(lt)) fail('listede aydan aya aralık yazılmadı: ' + lt.slice(0, 200));
  step('arayüz: takvimin ilk haftasında Şubat günleri; 26 Şubat dokunarak, 24 Şubat “24 şubat izin” yazarak eklendi; listede “27 Şub – 1 Mar” gibi');
  // 4) Kapanmış komşu dönem: üye o ayın gününü ekleyemez / değiştiremez
  await call(A.p, 'req.period.save', { id: p2, ym: '2031-04', deadline: '2031-04-20', status: 'closed', silent: true });
  const m4 = await call(M.p, 'req.mine', { period_id: p1 });
  if (!(m4.locked_months || []).includes('2031-04')) fail('kapanmış Nisan dönemi kilitli bildirilmedi');
  const cur = m4.items.map((x) => ({ date: x.date, kind: x.kind }));
  if (!/kapandı/.test(await err(M.p, 'req.save', { period_id: p1, items: [...cur, { date: '2031-04-03', kind: 'bosluk' }] }))) fail('kapanmış döneme gün eklendi');
  await call(M.p, 'req.save', { period_id: p1, items: cur.filter((x) => !x.date.startsWith('2031-04')) });
  const m5 = await call(M.p, 'req.mine', { period_id: p2 });
  if (m5.items.filter((x) => x.date.startsWith('2031-04')).length !== 2) fail('kapanmış dönemdeki günler üye kaydıyla silindi');
  step('kapanmış komşu dönem: üye o ayın gününü ekleyemedi, var olanları silemedi');
  // Temizlik
  await call(A.p, 'req.period.delete', { id: p2 });
  await call(A.p, 'req.period.delete', { id: p1 });
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: aydan aya istek testleri geçti');
