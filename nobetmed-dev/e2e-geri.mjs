// 4.29: Telefonun geri tuşu her zaman tek adım geri gider (pencere, menü, yan menü, sekme, sihirbaz adımı) — e2e.mjs SONRASI.
//   node e2e-geri.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
const back = async (p) => { await p.evaluate(() => history.back()); await p.waitForTimeout(450); };
const hash = (p) => p.evaluate(() => location.hash);
const modals = (p) => p.locator('.overlay').count();
const go = async (p, h) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForTimeout(500); };

try {
  const A = await ctx('ayse');
  const p = A.p;
  await login(p, 'ayse@test.com', 'Sifre1234');
  await go(p, '#/');
  await go(p, '#/nobetim');

  // ---- 1) Yan menü: geri tuşu yalnız menüyü kapatır ----
  await p.click('[data-act=nav-open]');
  await p.waitForTimeout(200);
  if (!(await p.evaluate(() => $('#shell').classList.contains('nav-open')))) fail('yan menü açılmadı');
  await back(p);
  if (await p.evaluate(() => $('#shell').classList.contains('nav-open'))) fail('geri tuşu yan menüyü kapatmadı');
  if ((await hash(p)) !== '#/nobetim') fail('yan menü kapanırken sayfa değişti: ' + await hash(p));
  step('yan menü açıkken geri → menü kapanır, sayfa yerinde');

  // ---- 2) İç içe pencereler: her basış bir pencere ----
  await p.evaluate(() => { openModal({ title: 'Birinci', body: 'a' }); });
  await p.waitForTimeout(100);
  await p.evaluate(() => { openModal({ title: 'İkinci', body: 'b' }); });
  await p.waitForTimeout(150);
  if (await modals(p) !== 2) fail('iki pencere açılmadı');
  await back(p);
  if (await modals(p) !== 1 || !(await p.locator('.overlay h2', { hasText: 'Birinci' }).count())) fail('geri → üstteki pencere kapanmadı (kalan: ' + await modals(p) + ')');
  await back(p);
  if (await modals(p) !== 0) fail('geri → ikinci geri basışta alttaki pencere kapanmadı');
  if ((await hash(p)) !== '#/nobetim') fail('pencereler kapanırken sayfa değişti: ' + await hash(p));
  await back(p);
  if ((await hash(p)) !== '#/') fail('pencereler kapandıktan sonra geri bir önceki sayfaya gitmedi: ' + await hash(p));
  step('iki pencere: 1. geri üstteki, 2. geri alttaki pencereyi kapatır, 3. geri önceki sayfa');

  // ---- 3) Düğmeyle kapatılan pencere geçmişte "ölü adım" bırakmaz ----
  await go(p, '#/nobetim');
  await p.evaluate(() => { openModal({ title: 'Kapat beni', body: 'x' }); });
  await p.waitForTimeout(150);
  await p.click('.overlay [data-act=close-modal]');
  await p.waitForTimeout(300);
  await back(p);
  if ((await hash(p)) !== '#/') fail('düğmeyle kapatılan pencereden sonra geri, önceki sayfaya gitmedi: ' + await hash(p));
  step('pencere ✕ ile kapatıldıktan sonra tek geri → önceki sayfa (boşa basış yok)');

  // ---- 4) Pencere → onay penceresi zinciri; sonra bağlantıyla başka sayfa ----
  await go(p, '#/nobetim');
  await p.click('[data-act=notifs]');
  await p.waitForTimeout(400);
  if (!(await p.locator('.notif-pop').count())) fail('bildirim kutusu açılmadı');
  await back(p);
  if (await p.locator('.notif-pop').count()) fail('geri bildirim kutusunu kapatmadı');
  if ((await hash(p)) !== '#/nobetim') fail('bildirim kutusu kapanırken sayfa değişti');
  await p.click('[data-act=notifs]');
  await p.waitForTimeout(400);
  await p.click('.notif-pop .np-foot');
  await p.waitForTimeout(500);
  if ((await hash(p)) !== '#/bildirimler') fail('bildirim kutusundan sayfaya geçilemedi: ' + await hash(p));
  await back(p);
  await p.waitForTimeout(300);
  if ((await hash(p)) !== '#/nobetim') fail('kutudan açılan sayfadan geri, önceki sayfaya dönmedi: ' + await hash(p));
  await back(p);
  if ((await hash(p)) !== '#/') fail('bir sonraki geri boşa gitti ya da atladı: ' + await hash(p));
  step('bildirim kutusu: geri kutuyu kapatır; kutudaki bağlantıdan açılan sayfadan geri → önceki sayfa → bir önceki (atlama / boşa basış yok)');

  // ---- 5) Açılır menü ----
  await go(p, '#/nobetim');
  await p.evaluate(() => { const b = document.querySelector('[data-act=notifs]'); openMenu(b, [{ id: 'x', label: 'Deneme', icon: 'star' }], () => {}); });
  await p.waitForTimeout(150);
  if (!(await p.locator('.menu').count())) fail('menü açılmadı');
  await back(p);
  if (await p.locator('.menu').count()) fail('geri menüyü kapatmadı');
  if ((await hash(p)) !== '#/nobetim') fail('menü kapanırken sayfa değişti');
  step('açılır menü: geri yalnız menüyü kapatır');

  // ---- 6) Ayarlar bölümleri adım adım ----
  await go(p, '#/yonetim/ayarlar/genel');
  await p.locator('[data-act=set-sec][data-s=bildirim]').waitFor();
  await p.click('[data-act=set-sec][data-s=bildirim]');
  await p.waitForTimeout(250);
  await p.click('[data-act=set-sec][data-s=guvenlik]');
  await p.waitForTimeout(250);
  if ((await hash(p)) !== '#/yonetim/ayarlar/guvenlik') fail('ayar bölümü adrese yazılmadı');
  await back(p);
  if ((await hash(p)) !== '#/yonetim/ayarlar/bildirim' || !(await p.locator('[data-act=set-sec][data-s=bildirim].on').count())) fail('geri bir önceki ayar bölümüne dönmedi: ' + await hash(p));
  await back(p);
  if ((await hash(p)) !== '#/yonetim/ayarlar/genel') fail('ikinci geri “Genel”e dönmedi: ' + await hash(p));
  await back(p);
  if ((await hash(p)) !== '#/nobetim') fail('üçüncü geri ayarlardan önceki sayfaya dönmedi: ' + await hash(p));
  step('Ayarlar: Genel → Bildirimler → Güvenlik; geri sırayla Bildirimler, Genel, önceki sayfa');

  // ---- 7) Destek sihirbazı ----
  await go(p, '#/destek');
  await p.locator('[data-act=sp-new]').first().waitFor();
  await p.click('[data-act=sp-new]');
  await p.locator('.sp-topic').first().waitFor();
  const k = await p.locator('.sp-topic').first().getAttribute('data-k');
  await p.click(`.sp-topic[data-k="${k}"]`);
  await p.waitForTimeout(500);
  if ((await hash(p)) !== '#/destek/yeni/' + k) fail('konu adımı adrese yazılmadı: ' + await hash(p));
  const hasWrite = await p.locator('[data-act=sp-write]').count();
  if (hasWrite) {
    await p.click('[data-act=sp-write]');
    await p.waitForTimeout(500);
    if (!(await p.locator('#spF').count())) fail('yazma adımı açılmadı');
    await back(p);
    if ((await hash(p)) !== '#/destek/yeni/' + k || await p.locator('#spF').count()) fail('yazma adımından geri, öneriler adımına dönmedi');
  }
  await back(p);
  if ((await hash(p)) !== '#/destek/yeni' || !(await p.locator('.sp-topic').count())) fail('konu adımından geri, konu seçimine dönmedi: ' + await hash(p));
  await back(p);
  if ((await hash(p)) !== '#/destek') fail('konu seçiminden geri, destek ana sayfasına dönmedi: ' + await hash(p));
  step(`Destek: Yeni talep → konu → ${hasWrite ? 'yaz → ' : ''}geri tuşu her seferinde bir önceki adım`);

  // ---- 8) Çok hızlı ardışık açma-kapama: geçmiş tutarlı kalır ----
  await go(p, '#/nobetim');
  for (let i = 0; i < 4; i++) {
    await p.evaluate(() => { const m = openModal({ title: 'Hızlı', body: '' }); setTimeout(() => m.close(), 10); });
    await p.waitForTimeout(80);
  }
  await p.waitForTimeout(300);
  await p.evaluate(() => { openModal({ title: 'Son', body: '' }); });
  await p.waitForTimeout(150);
  await back(p);
  if (await modals(p)) fail('art arda açılıp kapanan pencerelerden sonra geri pencereyi kapatmadı');
  await back(p);
  if ((await hash(p)) !== '#/destek') fail('art arda açma-kapamadan sonra geri tek adım gitmedi: ' + await hash(p));
  step('art arda açılıp kapanan pencerelerden sonra da geri tuşu tek adım');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: geri tuşu testleri geçti');
