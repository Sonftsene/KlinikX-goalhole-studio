// Listede aylar (4.48.0): ay ekleme, güncel ay, sıradaki ay, geçmiş aylar, ayı kaldırma, dosyadaki ayı sorma — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır:
//   node e2e-listeay.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const FX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const call = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y), [a, d]);
const expectText = async (p, t, timeout = 10000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-listeay.png') }); throw e; } };
const NOV = '2026-11', DEC = '2026-12';
const FILE = path.join(FX, 'hemsire-nobet-kasim-2026.xlsx');

let rid = 0, A = null;
try {
  A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const p = A.p;
  rid = (await call(p, 'rosters.save', { name: 'Aylık deneme' })).id;
  const ro = async () => (await call(p, 'rosters.list')).rosters.find((r) => r.id === rid);
  const waitParsed = async (ym) => {
    for (let i = 0; i < 40; i++) { const r = await ro(); const m = (r.months || []).find((x) => x.ym === ym); if (m && m.parsed && m.count > 0) return m; await p.waitForTimeout(500); }
    throw new Error(ym + ' okunmadı');
  };
  const rowsOn = async (date) => (await call(p, 'shifts.day', { date })).groups.flatMap((g) => g.people).filter((x) => x.roster === 'Aylık deneme').length;
  await p.goto(BASE + '#/nobet/' + rid);
  await p.locator('#rsInfo').waitFor();

  // 1) İlk yükleme: ay dosyanın içinden bulunur (Kasım), güncel ay olur
  await p.setInputFiles('.rs-actions input[data-change=rs-file]', FILE);
  await expectText(p, 'Kasım 2026 güncellendi');
  const m1 = await waitParsed(NOV);
  let r = await ro();
  if (r.period !== NOV) fail('ilk yüklenen ay güncel olmadı: ' + r.period);
  await p.locator('.rs-months .rs-mo.on', { hasText: 'Kasım 2026' }).waitFor({ timeout: 8000 });
  step(`ilk yükleme: ay dosyadan bulundu (Kasım 2026), güncel ay oldu, ${m1.count} nöbet kaydı okundu`);

  // 2) Ay ekle: Aralık, güncel yapmadan (sıradaki ay)
  await p.click('.rs-months [data-act=rs-addmo]');
  await p.selectOption('#rmYm', DEC);
  if (await p.isChecked('#rmPrim')) fail('gelecek ay için “Güncel ay yap” varsayılan işaretli');
  await p.setInputFiles('#rmFile', FILE);
  await p.click('.modal [data-ok]');
  await expectText(p, 'Aralık 2026 güncellendi');
  const m2 = await waitParsed(DEC);
  r = await ro();
  if (r.period !== NOV) fail('sıradaki ay eklenince güncel ay değişti: ' + r.period);
  if (r.months.length !== 2) fail('iki ay bekleniyordu: ' + r.months.map((x) => x.ym));
  await p.locator('.rs-notcur', { hasText: 'Sıradaki ay' }).waitFor({ timeout: 8000 });
  const nov15 = await rowsOn('2026-11-15'), dec15 = await rowsOn('2026-12-15');
  if (!nov15 || !dec15) fail(`aylar kendi günlerinde geçerli değil: 15 Kasım ${nov15}, 15 Aralık ${dec15}`);
  await p.locator('#rsInfo').screenshot({ path: path.join(OUT, 'listeay-sirada.png') });
  step(`Aralık sıradaki ay olarak eklendi (${m2.count} kayıt); Kasım güncel kaldı; Kim nöbette 15 Kasım: ${nov15}, 15 Aralık: ${dec15}`);

  // 3) Aralık’ı güncel yap → Kasım geçmiş aylara
  await p.click('.rs-notcur [data-act=rs-primary]');
  await expectText(p, 'artık güncel ay');
  r = await ro();
  if (r.period !== DEC) fail('güncel ay Aralık olmadı: ' + r.period);
  await p.locator('.rs-months [data-act=rs-past]', { hasText: 'Geçmiş aylar (1)' }).waitFor({ timeout: 8000 });
  if (!(await rowsOn('2026-11-15'))) fail('Kasım geçmiş olunca nöbetleri kalktı');
  // Geçmiş aydan Kasım’ı aç
  await p.click('.rs-months [data-act=rs-past]');
  await p.click('.menu >> text=Kasım 2026');
  await p.locator('.rs-notcur', { hasText: 'Geçmiş ay' }).waitFor({ timeout: 8000 });
  await p.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 });
  await p.locator('#rsInfo').screenshot({ path: path.join(OUT, 'listeay-gecmis.png') });
  step('Aralık güncel ay yapıldı; Kasım “Geçmiş aylar”da duruyor, açılıp bakılabiliyor, nöbetleri kendi günlerinde geçerli');

  // 4) Bu ayı (Kasım) listeden kaldır
  await p.click('[data-act=rs-menu]');
  await p.click('.menu >> text=Kasım 2026 ayını listeden kaldır');
  await p.click('.modal [data-ok]');
  await expectText(p, 'Kasım 2026 kaldırıldı');
  r = await ro();
  if (r.months.length !== 1 || r.months[0].ym !== DEC || r.period !== DEC) fail('Kasım kaldırılamadı: ' + JSON.stringify(r.months.map((x) => x.ym)));
  if (await rowsOn('2026-11-15')) fail('kaldırılan ayın nöbetleri duruyor');
  if (!(await rowsOn('2026-12-15'))) fail('Kasım kaldırılınca Aralık etkilendi');
  step('Kasım listeden kaldırıldı (dosyaları ve nöbetleri), Aralık yerinde');

  // 5) Açık ay Aralık iken Kasım dosyası yüklenince hangi ay olduğu sorulur
  await p.setInputFiles('.rs-actions input[data-change=rs-file]', FILE);
  await p.locator('.modal', { hasText: 'Bu dosya hangi ayın?' }).waitFor({ timeout: 10000 });
  await p.click('.modal [data-ym="2026-11"]');
  await expectText(p, 'Kasım 2026 güncellendi');
  await waitParsed(NOV);
  r = await ro();
  if (r.period !== DEC) fail('geçmiş ay yüklenince güncel ay değişti: ' + r.period);
  step('Aralık açıkken Kasım dosyası yüklenince “Bu dosya hangi ayın?” soruldu; Kasım’a eklendi, Aralık güncel kaldı');

  // 6) Üye: ay çubuğunu görür, ay ekleyemez
  const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
  await E.p.goto(BASE + '#/nobet/' + rid);
  await E.p.locator('.rs-months .rs-mo', { hasText: 'Aralık 2026' }).waitFor({ timeout: 10000 });
  if (await E.p.locator('[data-act=rs-addmo]').count()) fail('üye ay ekleyebiliyor');
  await E.p.screenshot({ path: path.join(OUT, 'listeay-uye.png') });
  step('üye ay çubuğunu görüyor (güncel ay + geçmiş aylar), ay ekleyemiyor');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
try { if (rid && A) await call(A.p, 'rosters.delete', { id: rid }); } catch (e) { /* */ }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: listede ay testleri geçti');
