// Liste adı ↔ hesap kalıcı bağı, bağlı adın korunması, ana sayfa kısayolları, kura silme kuralı (4.44.0) — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır (elif@test.com şifresi orada değişir):
//   node e2e-adbag.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-adbag.png') }); throw e; } };

try {
  const A = await ctx('ayse', false); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
  const B = await ctx('burak', false); await login(B.p, 'burak@test.com', 'Sifre1234');

  // 1) Kendiliğinden bağ: listedeki ad hesaba bağlanır
  await call(A.p, 'names.auto');
  let L = await call(A.p, 'names.list');
  const eu = L.users.find((u) => u.name === 'Elif Yılmaz');
  if (!eu) throw new Error('Elif hesabı yok');
  const en = L.names.find((x) => x.uid === eu.id);
  if (!en || !eu.links.length) fail('Elif listedeki adına kendiliğinden bağlanmadı: ' + JSON.stringify({ en, links: eu.links }));
  const LIST = en ? en.name : 'Elif Yılmaz';
  const before = (await call(E.p, 'shifts.my')).entries.length;
  if (!before) fail('Elif’in nöbeti yok (test verisi)');
  step(`kendiliğinden bağ: “${LIST}” ↔ Elif Yılmaz hesabı; ${L.names.length} liste adından ${L.names.filter((x) => x.uid !== null).length} tanesi bağlı`);

  // 2) Bağlı kişi adını kendisi değiştiremez; başkası bu adı alamaz
  const e1 = await err(E.p, 'me.update', { name: 'Elif Yılmaz Başka' });
  if (!/bağlı/.test(e1)) fail('bağlı kişi adını değiştirebildi: ' + e1);
  const e2 = await err(B.p, 'me.update', { name: 'Elif Yılmaz' });
  if (e2 === 'kabul') fail('başka biri bağlı adı aldı');
  await E.p.goto(BASE + '#/profil/bilgiler');
  await E.p.locator('[data-form=me-profile] [name=name][readonly]').waitFor({ timeout: 6000 }).catch(() => fail('Kişisel bilgilerde ad alanı kilitli değil'));
  await E.p.screenshot({ path: path.join(OUT, 'adbag-profil.png') });
  step('bağlı kişi adını değiştiremiyor (ad alanı kilitli, sunucu reddediyor); Burak “Elif Yılmaz” adını alamadı');

  // 3) Liste adı değişti (ör. Excel’de düzeltildi): yönetici yeni adı bağlar → hesap adı güncellenir, nöbetler kopmaz
  const NEW = 'Elif Yılmazer Deneme';
  const r1 = await call(A.p, 'names.link', { user_id: eu.id, name: NEW, sync: true });
  if (r1.name !== NEW) fail('hesap adı yeni liste adına güncellenmedi: ' + r1.name);
  const after = (await call(E.p, 'shifts.my')).entries.length;
  if (after !== before) fail(`ad değişince nöbetler koptu: ${before} → ${after}`);
  const bootName = (await call(E.p, 'boot')).me.name;
  if (bootName !== NEW) fail('kişinin hesap adı güncellenmedi: ' + bootName);
  // geri al
  await call(A.p, 'names.link', { user_id: eu.id, name: 'Elif Yılmaz', sync: true });
  L = await call(A.p, 'names.list');
  const al = L.users.find((u) => u.id === eu.id).links.find((x) => x.name === NEW);
  if (al) await call(A.p, 'names.unlink', { id: al.id });
  if ((await call(E.p, 'boot')).me.name !== 'Elif Yılmaz') fail('ad geri alınamadı');
  step(`liste adı “${NEW}” olarak değişince hesap adı da değişti, nöbetler kopmadı (${before} kayıt); geri alındı`);

  // 4) Yönetici kartı: Ayarlar › Nöbet › Liste adları ve hesaplar
  await A.p.goto(BASE + '#/yonetim/ayarlar/nobet');
  await A.p.locator('#nlCard .nl-list').waitFor({ timeout: 10000 });
  await A.p.click('#nlCard [data-act=nl-f][data-f=bound]');
  await A.p.locator('#nlCard .list-row', { hasText: LIST }).first().waitFor();
  await A.p.locator('#nlCard').screenshot({ path: path.join(OUT, 'adbag-yonetim.png') });
  step('yönetici kartı: bağlı / bağsız liste adları, elle bağlama ve bağı kaldırma');

  // 5) Kısayollar kişiye özel: Telefon rehberi çıkarılır, Takvimim eklenir; sayfa yenilenince de durur
  await E.p.goto(BASE + '#/');
  await E.p.locator('[data-act=chips-edit]').click();
  const telI = await E.p.evaluate(() => { const cat = chipCatalog(); return chipList().filter((id) => cat.some((k) => k.id === id)).indexOf('telefon'); });
  if (telI >= 0) await E.p.click(`#chE [data-ch=del][data-i="${telI}"]`);
  await E.p.click('#chE [data-ch=add][data-id="p:#/nobetim"]');
  await E.p.click('#chSave');
  await expectText(E.p, 'Kısayollar kaydedildi');
  await E.p.waitForTimeout(900);
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await E.p.locator('[data-home=chips] a').first().waitFor();
  const hrefs = await E.p.evaluate(() => [...document.querySelectorAll('[data-home=chips] a')].map((a) => a.getAttribute('href')));
  if (!hrefs.includes('#/nobetim') || hrefs.includes('#/telefon')) fail('kısayol değişikliği kaydedilmedi: ' + hrefs.join(' '));
  await E.p.screenshot({ path: path.join(OUT, 'adbag-kisayol.png') });
  await call(E.p, 'me.prefs.save', { kind: 'ui', value: { chips: null } });
  step('kısayollar: Telefon rehberi çıkarıldı, Takvimim eklendi; sayfa yenilenince de aynı (hesaba kaydedildi); varsayılana dönüldü');

  // 6) Kura: kartı açılmış kurayı başlatan üye silemez, yönetici siler
  const d = (await call(E.p, 'kura.start', { title: 'Silme deneme', items: ['A', 'B', 'C'], opts: {} })).draw;
  await call(E.p, 'kura.reveal', { id: d.id, idx: 0 });
  const e3 = await err(E.p, 'kura.delete', { id: d.id });
  if (e3 === 'kabul') fail('kartı açılmış kura başlatan üye tarafından silindi');
  if ((await err(A.p, 'kura.delete', { id: d.id })) !== 'kabul') fail('yönetici kurayı silemedi');
  step('kura: kartı açılmış kurayı başlatan üye silemedi (adalet), yönetici sildi');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: ad bağı, kısayol ve kura testleri geçti');
