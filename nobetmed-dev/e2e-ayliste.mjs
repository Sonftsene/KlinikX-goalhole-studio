// Aynı listeye gelecek ayın listesi yüklenince bu ayın kalan nöbetleri silinmez; aylar birbirine karışmaz, ad çiftlenmez (4.47.0) — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır (elif@test.com şifresi orada değişir):
//   node e2e-ayliste.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
async function ctx(tag) {
  const c = await browser.newContext({ viewport: { width: 1360, height: 900 } });
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
const pad = (n) => String(n).padStart(2, '0');

let rid = 0;
let A = null;
try {
  A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const E = await ctx('elif'); await login(E.p, 'elif@test.com', 'YeniSifre99');
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const CUR = `${y}-${pad(m)}`;
  const NX = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
  const LAST = `${CUR}-${pad(new Date(y, m, 0).getDate())}`; // bu ayın son günü (bugünden önce olamaz)
  const FIRST = `${CUR}-01`;
  const NXD = `${NX}-05`;
  const WHO = 'Elif Yılmaz';

  rid = (await call(A.p, 'rosters.save', { name: 'Ay geçişi deneme' })).id;
  const up = (tag) => A.p.evaluate(async (t) => (await uploadFile(new File([`%PDF-1.4\n% ${t} ${Math.random()}\n`], `liste-${t}.pdf`, { type: 'application/pdf' }))).id, tag);
  const publish = async (tag, period, entries) => {
    const fid = await up(tag);
    await call(A.p, 'rosters.upload', { id: rid, attachment_id: fid });
    return call(A.p, 'rosters.shifts', { roster_id: rid, file_id: fid, period, entries });
  };
  const mine = async () => (await call(E.p, 'shifts.my')).entries.filter((x) => x.roster_id === rid).map((x) => `${x.date}:${x.code}`).sort();

  // 1) Bu ayın listesi
  await publish('buay', CUR, [{ name: WHO, date: FIRST, code: 'N', kind: 'shift' }, { name: WHO, date: LAST, code: 'N', kind: 'shift' }]);
  let got = await mine();
  if (got.join() !== [`${FIRST}:N`, `${LAST}:N`].join()) fail('bu ayın listesi okunmadı: ' + got.join(' '));

  // 2) Ay bitmeden aynı listeye gelecek ay yüklenir → bu ayın kalan nöbeti (ay sonu) silinmez
  await publish('gelecek', NX, [{ name: WHO, date: NXD, code: 'G', kind: 'shift' }]);
  got = await mine();
  if (!got.includes(`${LAST}:N`)) fail('gelecek ay yüklenince bu ayın ay sonu nöbeti silindi: ' + got.join(' '));
  if (!got.includes(`${NXD}:G`)) fail('gelecek ayın nöbeti görünmüyor: ' + got.join(' '));
  if (got.length !== 3) fail('kayıtlar çiftlendi ya da eksik: ' + got.join(' '));
  const day = await call(E.p, 'shifts.day', { date: LAST });
  const inDay = (day.groups || []).flatMap((g) => g.people).filter((x) => x.roster === 'Ay geçişi deneme' && x.name === WHO).length;
  if (inDay !== 1) fail(`Kim nöbette (${LAST}) listesinde ${WHO} ${inDay} kez geçiyor`);
  const ro = (await call(A.p, 'rosters.list')).rosters.find((r) => r.id === rid);
  if (!ro || ro.period !== NX || ro.parsed_count !== 1) fail('liste gelecek ayı göstermiyor ya da kayıt sayısı ay dışını sayıyor: ' + JSON.stringify(ro && { period: ro.period, n: ro.parsed_count }));
  step(`aynı listeye ${NX} yüklendi: ${CUR} ay sonu nöbeti (${LAST}) duruyor, ${NXD} eklendi; Kim nöbette’de ad bir kez; liste ${NX} ayını gösteriyor`);

  // 3) Bu ayın düzeltilmiş listesi yeniden yüklenir → yalnızca bu ay değişir, gelecek ay korunur
  await publish('duzeltme', CUR, [{ name: WHO, date: LAST, code: 'G', kind: 'shift' }]);
  got = await mine();
  if (got.join() !== [`${LAST}:G`, `${NXD}:G`].join()) fail('düzeltme yalnızca kendi ayını değiştirmedi: ' + got.join(' '));
  step(`${CUR} düzeltmesi yalnızca o ayı değiştirdi (${got.join(', ')}); ${NX} korundu`);

  // 4) Listenin ayı elle düzeltilince yalnızca gösterilen ayın kayıtları taşınır
  const NX2 = m >= 11 ? `${y + 1}-${pad(m - 10)}` : `${y}-${pad(m + 2)}`;
  await call(A.p, 'rosters.period', { id: rid, period: NX2 });
  const all2 = (await call(E.p, 'shifts.my')).entries.filter((x) => x.roster_id === rid).map((x) => x.date);
  if (!all2.includes(NXD)) fail('ay düzeltmesi başka ayın kayıtlarını taşıdı/sildi: ' + all2.join(' '));
  if (all2.includes(LAST)) fail('ay düzeltmesi gösterilen ayı taşımadı: ' + all2.join(' '));
  step('listenin ayı elle düzeltilince yalnızca gösterilen ayın kayıtları taşındı, diğer ay yerinde');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
try { if (rid && A) await call(A.p, 'rosters.delete', { id: rid }); } catch (e) { /* */ }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: ay geçişi testleri geçti');
