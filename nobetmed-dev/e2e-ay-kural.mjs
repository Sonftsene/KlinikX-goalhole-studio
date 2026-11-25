// Kurallar önceki ay ve tüm listelerle bağlantılı (4.54.0) — uydurma verilerle.
// Elif ayın son günü (L) 24 saat çalışıyor (“Ay A” listesi); ertesi ayın listesi başka (“Ay B”). Burak’ın ertesi ayın 1’i (F) 24 saati
// Elif’e “Nöbet al”da uygun görünmemeli (nöbetten çıkıp nöbete gelir); ekstra nöbette de F günü uygun olmamalı.
//   node e2e-ay-kural.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
async function login(email, pw) {
  const c = await browser.newContext({ viewport: { width: 1360, height: 900 } });
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
const pad = (n) => String(n).padStart(2, '0');

const rids = [];
let A = null;
try {
  A = await login('ayse@test.com', 'Sifre1234');
  const E = await login('elif@test.com', 'YeniSifre99');
  // Fikstür verisinden uzak: iki ay sonrası (L = bir sonraki ayın son günü, F = iki ay sonranın 1’i)
  const now = new Date();
  const m1 = new Date(now.getFullYear(), now.getMonth() + 2, 0); // bir sonraki ayın son günü
  const L = `${m1.getFullYear()}-${pad(m1.getMonth() + 1)}-${pad(m1.getDate())}`;
  const m2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const ym2 = `${m2.getFullYear()}-${pad(m2.getMonth() + 1)}`;
  const F = `${ym2}-01`;
  const ym1 = L.slice(0, 7);
  const H24 = { code: '8 8', label: '24 saat', kind: 'shift', start: '08:00', end: '08:00', hours: 24 };
  const mk = async (name, ym, entries) => {
    const id = (await call(A, 'rosters.save', { name })).id; rids.push(id);
    const fid = await A.evaluate(async (t) => (await uploadFile(new File([`%PDF-1.4\n% ${t} ${Math.random()}\n`], `${t}.pdf`, { type: 'application/pdf' }))).id, name);
    await call(A, 'rosters.upload', { id, attachment_id: fid, ym, primary: true });
    await call(A, 'rosters.shifts', { roster_id: id, file_id: fid, period: ym, entries, primary: true });
    return id;
  };
  await mk('Ay A deneme', ym1, [{ name: 'Elif Yılmaz', date: L, ...H24 }]);
  await mk('Ay B deneme', ym2, [{ name: 'Burak Demir', date: F, ...H24 }, { name: 'Elif Yılmaz', date: `${ym2}-10`, ...H24 }]);

  // 1) Nöbet al: F günü Burak’ın 24 saati Elif’e uygun değil (önceki ayın son günü başka listede 24 saat)
  const t = await call(E, 'extra.take', { ym: ym2, date: F });
  const it = ((t.days || [])[0] || { items: [] }).items.find((x) => /Burak/.test(x.display));
  if (!it) throw new Error('Nöbet al listesinde Burak’ın ' + F + ' nöbeti yok: ' + JSON.stringify(t.days));
  if (it.ok) fail(`önceki ayın son günü (${L}) 24 saat çalışan Elif’e ${F} 24 saat “alabilir” görünüyor`);
  step(`Nöbet al: ${L} 24 saat (Ay A) → ${F} 24 saat (Ay B) alınamıyor: ${it.my_why || it.their_why}`);

  // 2) Ekstra nöbet: F günü 24 saat / gündüz uygun değil
  const ex = await call(E, 'extra.me', { ym: ym2 });
  const d1 = (ex.days || []).find((d) => d.date === F);
  if (!d1) fail('ekstra nöbet listesinde ' + F + ' yok');
  else if (d1.types['24'].ok || d1.types.day.ok) fail('ekstra nöbette ' + F + ' 24 saat / gündüz uygun görünüyor: ' + JSON.stringify(d1.types));
  else step(`Ekstra nöbet: ${F} 24 saat uygun değil (${d1.types['24'].why})`);
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
for (const id of rids) { try { await call(A, 'rosters.delete', { id }); } catch (e) { /* */ } }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: ay geçişi kural testleri geçti');
