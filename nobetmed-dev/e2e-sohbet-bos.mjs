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

  // Tepkiler: rozete dokununca liste açılır (dokunmak tepkiyi kaldırmaz); kendi tepkisini oradan kaldırır (4.53.0)
  const msgId = (await call(A, 'chat.open', { id })).msgs.find((x) => /Merhaba, deneme/.test(x.body)).id;
  await call(A, 'chat.react', { id: msgId, emoji: '❤️' });
  if (LOGIN[who.name]) { const O = await login(...LOGIN[who.name]); await call(O, 'chat.react', { id: msgId, emoji: '👍' }); await O.context().close(); }
  await A.goto(BASE + '#/mesaj/' + id);
  const chip = A.locator(`.ch-msg[data-id="${msgId}"] .ch-react.on`);
  await chip.waitFor({ timeout: 10000 });
  await chip.click();
  await A.locator('.modal .ch-rx-list .list-row', { hasText: 'Siz' }).waitFor({ timeout: 5000 });
  if (LOGIN[who.name] && !(await A.locator('.modal .ch-rx-list', { hasText: who.name }).count())) fail('tepki listesinde karşı taraf yok');
  const still = (await call(A, 'chat.open', { id })).msgs.find((x) => x.id === msgId).reacts || [];
  if (!still.some((r) => r.mine)) fail('rozete dokununca tepki kaldırıldı');
  await A.locator('.modal').last().screenshot({ path: path.join(OUT, 'sohbet-tepkiler.png') }).catch(() => {});
  await A.click('.modal [data-rx-del]');
  await A.getByText('Tepkin kaldırıldı').first().waitFor({ timeout: 5000 });
  const after = (await call(A, 'chat.open', { id })).msgs.find((x) => x.id === msgId).reacts || [];
  if (after.some((r) => r.mine)) fail('“Kaldır” tepkiyi kaldırmadı');
  step('tepki rozetine dokununca “Tepkiler” listesi açıldı (tepki kalktı değil); kendi tepkisi “Kaldır” ile kaldırıldı');

  // Yönetici: Tüm sohbetler — kimde duruyor; karşı taraf kendisi silince “sildi” görünür
  if (LOGIN[who.name]) { const O = await login(...LOGIN[who.name]); await call(O, 'chat.state', { id, op: 'delete' }); await O.context().close(); }
  const row1 = (await call(A, 'chat.admin.all')).items.find((c) => c.id === id);
  if (!row1 || !/ ↔ /.test(row1.name)) throw new Error('tüm sohbetlerde yok: ' + JSON.stringify(row1));
  const sideOf = (r, nm) => (r.sides.find((x) => x.name === nm) || {}).has;
  if (sideOf(row1, 'Ayşe Kaya') !== true) fail('Ayşe’de duruyor görünmüyor');
  if (LOGIN[who.name] && sideOf(row1, who.name) !== false) fail('karşı taraf sildiği hâlde “var” görünüyor');
  await A.goto(BASE + '#/yonetim/kullanicilar');
  await A.click('[data-act=adc-all]');
  await A.locator('.adc-list .list-row', { hasText: row1.name }).first().waitFor({ timeout: 8000 });
  await A.locator('.modal').last().screenshot({ path: path.join(OUT, 'sohbet-tumu.png') }).catch(() => {});
  // Sil (bildirim işaretsiz) → çöp kutusu
  await A.locator('.adc-list .list-row', { hasText: row1.name }).first().locator('[data-adc]').click();
  if (await A.isChecked('#adcNotify')) fail('bildirim varsayılan işaretli');
  await A.locator('[data-ok]').last().click();
  await A.getByText('Sohbet çöp kutusuna taşındı').first().waitFor({ timeout: 8000 });
  if ((await call(A, 'chat.list', { open: 0 })).items.some((c) => c.id === id)) fail('silinen sohbet Ayşe’nin listesinde duruyor');
  if ((await call(A, 'chat.admin.all')).items.some((c) => c.id === id)) fail('silinen sohbet yönetici listesinde duruyor');
  if (LOGIN[who.name]) {
    const O = await login(...LOGIN[who.name]);
    const nl = (await call(O, 'notif.list', { limit: 20 })).items.map((x) => x.title);
    if (nl.some((t) => /yönetici tarafından kaldırıldı/.test(t))) fail('bildirim işaretsizken kişiye bildirim gitti');
    if ((await O.evaluate(() => api('chat.admin.trash').then(() => 'kabul', (e) => e.status))) === 'kabul') fail('üye çöp kutusunu görebildi');
    await O.context().close();
  }
  // Çöp kutusu → geri yükle: Ayşe’de geçmişiyle geri gelir
  await A.click('[data-adc-trash]');
  const trow = A.locator('.adt-list .list-row', { hasText: row1.name }).first();
  await trow.waitFor({ timeout: 8000 });
  await A.locator('.modal').last().screenshot({ path: path.join(OUT, 'sohbet-cop.png') }).catch(() => {});
  await trow.locator('[data-op=restore]').click();
  await A.getByText('Sohbet geri yüklendi').first().waitFor({ timeout: 8000 });
  if (!(await call(A, 'chat.list')).items.some((c) => c.id === id)) fail('geri yüklenen sohbet Ayşe’de yok');
  if (!(await call(A, 'chat.open', { id })).msgs.some((x) => /Merhaba, deneme/.test(x.body))) fail('geri yüklenen sohbetin geçmişi yok');
  // Yeniden sil (bildirimli) → kalıcı sil
  const r2 = await call(A, 'chat.admin.delete', { id, notify: true });
  if (LOGIN[who.name] && !r2.notified) fail('bildirim işaretliyken kimseye bildirilmedi');
  const tr = (await call(A, 'chat.admin.trash')).items.find((t) => /Ayşe Kaya/.test(t.people) && !t.gone);
  await call(A, 'chat.admin.purge', { id: tr.id });
  if ((await call(A, 'chat.admin.trash')).items.some((t) => t.id === tr.id)) fail('kalıcı silinen çöp kutusunda duruyor');
  if ((await A.evaluate((cid) => api('chat.open', { id: cid }).then(() => 'kabul', (e) => e.status), id)) === 'kabul') fail('kalıcı silinen sohbet açılabiliyor');
  step(`yönetici listesi kimde duruyor gösteriyor (Ayşe: var, ${who.name}: sildi); sil → bildirimsiz çöp kutusu; geri yükle → geçmişiyle döndü; bildirimli sil → kalıcı sil`);

} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: boş sohbet testleri geçti');
