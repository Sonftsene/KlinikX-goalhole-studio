// Yanlış giden bildirimi herkesten geri alma (4.48.0) — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır (elif@test.com şifresi orada değişir):
//   node e2e-geri-al.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const err = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y).then(() => 'kabul', (e) => e.message || String(e.status)), [a, d]);
const TITLE = 'Yanlış duyuru deneme ' + Date.now().toString(36);

try {
  const A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const E = await ctx('elif'); await login(E.p, 'elif@test.com', 'YeniSifre99');
  const bootA = await call(A.p, 'boot');
  // 1) Yönetici duyuru yayınlar → herkese bildirim gider
  await call(A.p, 'posts.save', { title: TITLE, body: 'Bu duyuru yanlışlıkla gönderildi.', category_id: bootA.categories[0].id, notify: true });
  await E.p.waitForTimeout(500);
  const hasIt = async () => (await call(E.p, 'notif.list', { limit: 60 })).items.some((x) => x.title.includes(TITLE));
  if (!(await hasIt())) throw new Error('Elif’e bildirim gitmedi (test verisi)');
  const before = (await call(E.p, 'live', {})).now;

  // 2) Üye geri alamaz
  const e1 = await err(E.p, 'notif.sent');
  if (e1 === 'kabul') fail('üye gönderilen bildirimleri görebildi');

  // 3) Yönetici: Bildirimler › Gönderilenler › Herkesten sil
  await A.p.goto(BASE + '#/bildirimler');
  await A.p.click('[data-act=nb-sent]');
  const row = A.p.locator('.nbs-list .list-row', { hasText: TITLE }).first();
  await row.waitFor({ timeout: 8000 });
  const meta = await row.innerText();
  if (!/kişi/.test(meta)) fail('gönderimde kişi sayısı yok: ' + meta);
  await A.p.locator('.nbs-list').screenshot({ path: path.join(OUT, 'geri-al.png') }).catch(() => {});
  await row.locator('[data-sent-del]').click();
  await A.p.locator('[data-ok]').last().click();
  await A.p.getByText(/kişiden silindi/).first().waitFor({ timeout: 8000 }).catch(() => fail('“kişiden silindi” bildirimi çıkmadı'));
  if (await hasIt()) fail('bildirim Elif’in listesinden silinmedi');

  // 4) Telefonda duran bildirim kapansın diye kimlik canlı uçta ve push içeriğinde gelir
  const live = await call(E.p, 'live', { since: before });
  if (!Array.isArray(live.gone) || !live.gone.length) fail('canlı uçta geri alınan bildirim kimliği yok: ' + JSON.stringify(live.gone));
  // Gönderim artık listede yok
  const sent = await call(A.p, 'notif.sent');
  if (sent.items.some((x) => x.title.includes(TITLE))) fail('silinen gönderim listede duruyor');
  // Mesaj bildirimi geri alınamaz
  const e2 = await err(A.p, 'notif.retract', { g: 'x', kind: 'chat', title: 'x' });
  if (e2 === 'kabul') fail('kişisel mesaj bildirimi geri alınabildi');
  step(`yönetici yanlış duyurunun bildirimini “Gönderilenler”den herkesten sildi; üye göremedi; Elif’in listesinden kalktı, telefon için kimlik (${live.gone.length}) iletildi`);
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: bildirim geri alma testleri geçti');
