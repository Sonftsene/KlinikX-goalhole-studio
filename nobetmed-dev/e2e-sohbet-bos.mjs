// Kişi kartından “Mesaj” ile açılıp yazılmayan birebir sohbet listede kalmaz (4.50.1) — uydurma verilerle.
// e2e-mesaj.mjs SONRASI aynı sitede çalışır:
//   node e2e-sohbet-bos.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
async function login(email, pw) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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

try {
  const A = await login('ayse@test.com', 'Sifre1234');
  // Ayşe’nin henüz birebir sohbeti olmayan biri
  const list0 = (await call(A, 'chat.list')).items;
  const had = new Set(list0.filter((c) => c.kind === 'direct' && c.other).map((c) => c.other.tk + ':' + c.other.uid));
  const ppl = (await call(A, 'chat.people')).people || [];
  const free = ppl.filter((x) => !had.has(x.tk + ':' + x.uid));
  const who = free.find((x) => ['Burak Demir', 'Elif Yılmaz'].includes(x.name)) || free[0];
  if (!who) throw new Error('sohbeti olmayan kişi yok (test verisi)');
  // Kişi kartındaki “Mesaj” gibi: sohbet açılır, hiçbir şey yazılmaz, geri dönülür
  const id = (await call(A, 'chat.direct', { tk: who.tk, uid: who.uid })).id;
  await A.goto(BASE + '#/mesaj/' + id);
  await A.locator('#chMsgs').waitFor({ timeout: 10000 });
  await A.goto(BASE + '#/mesaj');
  await A.locator('#chList .ch-filters').waitFor({ timeout: 10000 });
  await A.waitForTimeout(400);
  if (await A.locator(`#chList a[href="#/mesaj/${id}"]`).count()) fail('yazılmayan sohbet listede kaldı');
  await A.screenshot({ path: path.join(OUT, 'sohbet-bos-liste.png') });
  if ((await call(A, 'chat.list')).items.some((c) => c.id === id)) fail('sunucu listesinde boş sohbet var');
  if (!(await call(A, 'chat.list', { open: id })).items.some((c) => c.id === id)) fail('açık sohbet listeden düştü');
  // Karşı taraf: giriş bilgisi bilinen bir kişiyse onun listesinde de yok
  const LOGIN = { 'Burak Demir': ['burak@test.com', 'Sifre1234'], 'Elif Yılmaz': ['elif@test.com', 'YeniSifre99'] };
  if (LOGIN[who.name]) {
    const O = await login(...LOGIN[who.name]);
    if ((await call(O, 'chat.list')).items.some((c) => c.id === id)) fail('yazılmayan sohbet karşı tarafın listesinde görünüyor');
    await O.goto(BASE + '#/mesaj'); await O.locator('#chList .ch-filters').waitFor({ timeout: 10000 });
    if (await O.locator(`#chList a[href="#/mesaj/${id}"]`).count()) fail('karşı tarafın ekranında boş sohbet var');
    await O.context().close();
  }
  // Arama: kişi “yeni sohbet” olarak bulunur; dokununca aynı sohbet açılır (yeni boş sohbet çoğalmaz)
  const again = (await call(A, 'chat.direct', { tk: who.tk, uid: who.uid })).id;
  if (again !== id) fail('aynı kişiyle ikinci boş sohbet oluştu');
  // Mesaj yazılınca listede görünür
  await call(A, 'chat.send', { id, body: 'Merhaba, deneme' });
  if (!(await call(A, 'chat.list')).items.some((c) => c.id === id)) fail('mesaj yazılınca sohbet listede görünmedi');
  step(`kişi kartından açılıp yazılmayan sohbet (${who.name}) listede görünmüyor (karşı tarafta da); aynı kişiye tekrar dokununca aynı sohbet açılıyor; mesaj yazılınca listede`);
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: boş sohbet testleri geçti');
