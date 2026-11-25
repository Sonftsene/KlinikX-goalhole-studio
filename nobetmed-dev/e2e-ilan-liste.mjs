// Devir ilanı tüm listelerdeki uygun kişilere açık (4.52.0) — uydurma verilerle.
// Elif “Ek A” listesindeki nöbetini devreder; yalnız “Ek B” listesinde olan Burak görür, başvurur, seçilir. Değişim ilanı başka listeye kapalı.
//   node e2e-ilan-liste.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
async function login(email, pw, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${email}] pageerror: ${e.message}`));
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  return p;
}
const call = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y), [a, d]);
const err = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y).then(() => 'kabul', (e) => e.message || String(e.status)), [a, d]);
const pad = (n) => String(n).padStart(2, '0');
const addDays = (ds, k) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const rids = [];
let A = null;
try {
  A = await login('ayse@test.com', 'Sifre1234');
  const E = await login('elif@test.com', 'YeniSifre99');
  const B = await login('burak@test.com', 'Sifre1234', true);
  // Gelecek ayda ikisinin de (tüm listelerde) ±3 gün boş olduğu bir gün
  const busy = new Set([...(await call(E, 'shifts.my')).entries, ...(await call(B, 'shifts.my')).entries].map((x) => x.date));
  const now = new Date(); const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ym = `${nm.getFullYear()}-${pad(nm.getMonth() + 1)}`;
  let D = null;
  for (let d = 12; d <= 24 && !D; d++) { const ds = `${ym}-${pad(d)}`; if (![-3, -2, -1, 0, 1, 2, 3].some((k) => busy.has(addDays(ds, k)))) D = ds; }
  if (!D) throw new Error('uygun gün bulunamadı (test verisi)');
  const N = { code: 'N', label: 'Gece', kind: 'shift', start: '16:00', end: '08:00', hours: 16 };
  const mk = async (name, entries) => {
    const id = (await call(A, 'rosters.save', { name })).id; rids.push(id);
    const fid = await A.evaluate(async (t) => (await uploadFile(new File([`%PDF-1.4\n% ${t} ${Math.random()}\n`], `${t}.pdf`, { type: 'application/pdf' }))).id, name);
    await call(A, 'rosters.upload', { id, attachment_id: fid, ym, primary: true });
    await call(A, 'rosters.shifts', { roster_id: id, file_id: fid, period: ym, entries, primary: true });
    return id;
  };
  const ridA = await mk('Ek A deneme', [{ name: 'Elif Yılmaz', date: D, ...N }, { name: 'Elif Yılmaz', date: addDays(D, -6), ...N }, { name: 'Elif Yılmaz', date: addDays(D, 6), ...N }]);
  await mk('Ek B deneme', [{ name: 'Burak Demir', date: addDays(D, -9), ...N }, { name: 'Burak Demir', date: addDays(D, 9), ...N }]);

  // 1) Elif devir ilanı açar
  const chk = await call(E, 'listing.check', { date: D });
  if (chk.mine.roster_id !== ridA) fail('ilan yanlış listeden: ' + JSON.stringify(chk.mine));
  const L = (await call(E, 'listing.create', { date: D, kind: 'give', note: 'başka listeden de alınabilir' })).listing;
  // 2) Burak (yalnız Ek B’de) panoda görür ve uygundur
  const board = (await call(B, 'listing.list')).board;
  const mine = board.find((x) => x.id === L.id);
  if (!mine) throw new Error('başka listedeki kişi devir ilanını görmüyor');
  if (!mine.elig || !mine.elig.ok) fail('başka listedeki kişi uygun değil: ' + JSON.stringify(mine.elig));
  await B.goto(BASE + '#/ilanlar');
  await B.locator('.mk-l2', { hasText: 'Ek A deneme' }).first().waitFor({ timeout: 10000 }).catch(() => fail('ilanda liste adı görünmüyor'));
  await B.screenshot({ path: path.join(OUT, 'ilan-liste-pano.png') });
  // 3) Burak başvurur; Elif başvuranlarda “başka listeden” görür, seçer
  await call(B, 'listing.apply', { id: L.id });
  const got = (await call(E, 'listing.get', { id: L.id })).listing;
  const app = (got.apps || []).find((a) => /Burak/.test(a.name));
  if (!app || !app.other_list || !app.valid || !app.valid.ok) fail('başvuru “başka listeden / uygun” değil: ' + JSON.stringify(app));
  await call(E, 'listing.choose', { id: L.id, app_id: app.id });
  const after = (await call(E, 'listing.get', { id: L.id })).listing;
  if (after.status !== 'taken' || !/Burak/.test(after.taker || '')) fail('devir tamamlanmadı: ' + JSON.stringify({ s: after.status, t: after.taker }));
  step(`devir ilanı (${D}, Ek A) yalnız Ek B’de olan Burak’a açık: panoda gördü (liste adıyla), uygun, başvurdu; Elif “başka listeden” görüp seçti`);

  // 4) Değişim ilanı başka listedeki kişiye kapalı
  const S2 = (await call(E, 'listing.create', { date: addDays(D, -6), kind: 'swap' })).listing;
  const b2 = (await call(B, 'listing.list')).board;
  if (b2.some((x) => x.id === S2.id)) fail('değişim ilanı başka listedeki kişiye görünüyor');
  if ((await err(B, 'listing.apply', { id: S2.id, offer_date: addDays(D, -9) })) === 'kabul') fail('başka listedeki kişi değişim ilanına başvurabildi');
  await call(E, 'listing.cancel', { id: S2.id }).catch(() => {});
  step('değişim (takas) ilanı yalnız aynı listedekilere: başka listedeki kişi görmüyor, başvuramıyor');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
for (const id of rids) { try { await call(A, 'rosters.delete', { id }); } catch (e) { /* */ } }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: listeler arası ilan testleri geçti');
