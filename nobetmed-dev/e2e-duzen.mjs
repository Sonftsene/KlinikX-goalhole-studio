// Herkes için ana ekran (4.50.0): hazır düzen, kilit, kısayollar, üst / alt çubuk, sorumlulara ayrı düzen, menü araması — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır (elif@test.com şifresi orada değişir):
//   node e2e-duzen.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); localStorage.setItem('nm-push-nag', new Date().toISOString().slice(0, 10)); } catch (e) { /* */ } });
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
const vis = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; }, sel);
const homeReady = async (p) => { await p.goto(BASE + '#/'); await p.locator('#view .hero').waitFor(); await p.waitForTimeout(500); };
let A = null;

try {
  A = await ctx('ayse', false); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const M = await ctx('elif', true); await login(M.p, 'elif@test.com', 'YeniSifre99');

  // 1) Yönetici: Ayarlar › Genel › Herkes için ana ekran → Sade → Herkese uygula (kişilerin düzenini de sıfırla)
  await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.p.locator('#ulCard .ul-presets').waitFor({ timeout: 10000 });
  await A.p.click('#ulCard [data-act=ul-preset][data-k=sade]');
  await A.p.locator('#ulCard .ul-pre.on', { hasText: 'Sade' }).waitFor();
  if (!(await A.p.locator('#ulCard .ul-chips.big .ul-chip').count())) fail('önizlemede büyük kısayollar yok');
  if (await A.p.locator('#ulCard [data-change=ul-lock]').isChecked()) fail('Sade düzende kişiler değiştirebilir görünüyor');
  await A.p.evaluate(() => { const r = document.querySelector('#ulReset'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await A.p.locator('#ulCard').screenshot({ path: path.join(OUT, 'duzen-yonetici.png') });
  await A.p.click('#ulCard [data-act=ul-save]');
  await A.p.locator('.modal [data-ok]').click();
  await A.p.getByText('Ana sayfa herkes için kaydedildi').first().waitFor();
  const saved = await call(A.p, 'ui.layout.get');
  if (!saved.base || saved.base.preset !== 'sade' || !saved.base.lock || !saved.base.chips_big || !saved.base.chips.length) fail('düzen kaydedilmedi: ' + JSON.stringify(saved.base));
  step(`yönetici “Sade” düzeni herkese uyguladı (${saved.base.chips.length} büyük kısayol, kilitli, üstte ${saved.base.top_hide.length} simge gizli)`);

  // 2) Üye (telefon): büyük kısayollar, düzenleme yok, akış gizli, üst telefon / arama simgesi yok, alt “+” yok, bir kerelik not
  await M.p.reload(); await M.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await homeReady(M.p);
  const tiles = await M.p.locator('.hero-chips.big .hchip').count();
  if (tiles < 2) fail('üyede büyük kısayollar yok: ' + tiles);
  if (await M.p.locator('[data-act=chips-edit]').count()) fail('üye kısayolları düzenleyebiliyor');
  if (!(await M.p.locator('#feedHost.home-hidden').count())) fail('akış gizlenmedi');
  if (await vis(M.p, '.topbar a[href="#/telefon"]')) fail('üst çubukta telefon simgesi duruyor');
  if (await vis(M.p, '.topbar [data-act=search-open]')) fail('üst çubukta arama simgesi duruyor');
  if (!(await vis(M.p, '#notifBtn'))) fail('bildirim zili gizlendi');
  if (await vis(M.p, '#bottomNav .plus')) fail('alt menüde “+” duruyor');
  if (!(await vis(M.p, '#bottomNav [data-bn=todo]'))) fail('alt menüde Okunacak gizlendi');
  await M.p.locator('#ulNote').waitFor({ timeout: 5000 }).catch(() => fail('bir kerelik “ana ekranınız sadeleştirildi” notu çıkmadı'));
  await M.p.screenshot({ path: path.join(OUT, 'duzen-uye.png') });
  await M.p.click('#ulNote [data-act=ul-note-ok]');
  await homeReady(M.p);
  if (await M.p.locator('#ulNote').count()) fail('not “Tamam” sonrası yeniden çıktı');
  // Kişinin kendi düzeni geçersiz: Hesabım › Görünüm’de kilit bilgisi
  await M.p.goto(BASE + '#/profil/gorunum');
  await M.p.locator('#homeLayoutCard', { hasText: 'yöneticiniz herkes için belirledi' }).waitFor({ timeout: 8000 }).catch(() => fail('Ana sayfam kartında kilit bilgisi yok'));
  step(`üye: ${tiles} büyük kısayol, düzenleme kapalı, akış gizli, üstte yalnız zil + profil, altta “+” yok; bir kerelik not çıktı ve kapandı; Ana sayfam kilitli`);

  // 3) Menü araması: “izin” → İstekler; olmayan sözcük → bulunamadı
  await M.p.goto(BASE + '#/menu');
  await M.p.locator('#mnQ').fill('izin');
  await M.p.waitForTimeout(200);
  const shown = await M.p.evaluate(() => [...document.querySelectorAll('.mn-tile:not(.hidden) .mn-l')].map((x) => x.textContent.trim()));
  if (!shown.some((t) => /İstek/i.test(t)) || shown.length > 4) fail('“izin” araması: ' + shown.join(', '));
  await M.p.screenshot({ path: path.join(OUT, 'duzen-menu-ara.png') });
  await M.p.locator('#mnQ').fill('qqzzxx');
  await M.p.locator('#mnNone').waitFor({ state: 'visible', timeout: 3000 }).catch(() => fail('bulunamadı yazısı çıkmadı'));
  step(`menü araması: “izin” → ${shown.join(', ')}; olmayan sözcükte “Menüde bulunamadı”`);

  // 4) Sorumlulara ayrı düzen (Standart): yönetici kendi ekranında standart kısayolları görür, üye Sade’de kalır
  await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.p.locator('#ulCard .ul-presets').waitFor({ timeout: 10000 });
  await A.p.click('#ulCard [data-act=ul-scope][data-s=publisher]');
  await A.p.locator('#ulCard [data-change=ul-pub]').check({ force: true });
  await A.p.click('#ulCard [data-act=ul-preset][data-k=standart]');
  await A.p.click('#ulCard [data-act=ul-save]');
  await A.p.getByText('Ana sayfa herkes için kaydedildi').first().waitFor();
  const mine = await A.p.evaluate(() => S.ui_layout);
  if (!mine || mine.scope !== 'publisher' || mine.chips_big) fail('yöneticiye sorumlu düzeni uygulanmadı: ' + JSON.stringify(mine));
  const mm = (await call(M.p, 'boot')).ui_layout;
  if (!mm || mm.scope !== 'base' || mm.preset !== 'sade') fail('üye düzeni değişti: ' + JSON.stringify(mm));
  await homeReady(A.p);
  if (await A.p.locator('.hero-chips.big').count()) fail('yönetici ekranında büyük kısayol (sorumlu düzeni standart)');
  step('sorumlulara ayrı düzen (Standart): yönetici standart ekranı görüyor, üye Sade’de kalıyor');

  // 5) Sayfa ve menü adları: yönetici değiştirir, herkeste (menü, alt menü, nöbet sekmesi, sayfa başlığı) görünür
  await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.p.locator('#lbCard [data-lb="#/nobetim"]').waitFor({ timeout: 10000 });
  await A.p.fill('#lbCard [data-lb="#/nobetim"]', 'Nöbetlerim');
  await A.p.fill('#lbCard [data-lb="#/telefon"]', 'Dahili numaralar');
  await A.p.fill('#lbCard [data-lb="bn:menu"]', 'Diğer');
  await A.p.fill('#lbCard [data-lb="@nobet"]', 'Nöbet işleri');
  await A.p.locator('#lbCard').screenshot({ path: path.join(OUT, 'duzen-adlar.png') });
  await A.p.click('#lbCard [data-act=lb-save]');
  await A.p.getByText('Adlar kaydedildi').first().waitFor();
  if (!(await A.p.locator('#sidebar', { hasText: 'Nöbetlerim' }).count())) fail('yöneticinin menüsünde yeni ad yok');
  await M.p.reload(); await M.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await homeReady(M.p);
  const sb = await M.p.evaluate(() => document.querySelector('#sidebar').textContent);
  if (!sb.includes('Nöbetlerim') || sb.includes('Takvimim') || !sb.includes('Nöbet işleri')) fail('üyenin menüsünde yeni adlar yok');
  if (!(await M.p.locator('#bottomNav', { hasText: 'Diğer' }).count())) fail('alt menüde “Diğer” yok');
  await M.p.goto(BASE + '#/nobetim');
  await M.p.locator('.hub-tabs a.on', { hasText: 'Nöbetlerim' }).waitFor({ timeout: 8000 }).catch(() => fail('nöbet sekmesinde yeni ad yok'));
  await M.p.locator('.page-head h1', { hasText: 'Nöbet işleri' }).waitFor({ timeout: 5000 }).catch(() => fail('nöbet sayfa başlığı değişmedi'));
  await M.p.goto(BASE + '#/telefon');
  await M.p.locator('.page-head h1', { hasText: 'Dahili numaralar' }).waitFor({ timeout: 8000 }).catch(() => fail('telefon rehberi sayfa başlığı değişmedi'));
  await M.p.goto(BASE + '#/menu');
  await M.p.locator('.mn-tile', { hasText: 'Dahili numaralar' }).waitFor({ timeout: 5000 }).catch(() => fail('Menü kutucuğunda yeni ad yok'));
  await M.p.locator('#mnQ').fill('dahili');
  await M.p.waitForTimeout(200);
  if (!(await M.p.locator('.mn-tile:not(.hidden)', { hasText: 'Dahili numaralar' }).count())) fail('menü aramasında yeni ad bulunamadı');
  await M.p.screenshot({ path: path.join(OUT, 'duzen-adlar-uye.png') });
  const lb = (await call(M.p, 'boot')).ui_labels;
  if (lb['#/nobetim'] !== 'Nöbetlerim') fail('adlar sunucuda saklanmadı: ' + JSON.stringify(lb));
  if ((await M.p.evaluate(() => api('ui.labels.save', { labels: {} }).then(() => 'kabul', (e) => e.status))) === 'kabul') fail('üye adları değiştirebildi');
  await call(A.p, 'ui.labels.save', { labels: {} });
  step('yönetici “Takvimim → Nöbetlerim”, “Telefon rehberi → Dahili numaralar”, “Menü → Diğer”, “Nöbet → Nöbet işleri” yaptı; üyede yan menü, alt menü, nöbet sekmesi, sayfa başlıkları, Menü kutucuğu ve menü aramasında yeni adlar; üye değiştiremiyor');

  // 6) Kaldır: her şey eski hâline
  await call(A.p, 'ui.layout.save', { base: null });
  await M.p.reload(); await M.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await homeReady(M.p);
  if (await M.p.locator('.hero-chips.big').count() || !(await vis(M.p, '#bottomNav .plus'))) fail('düzen kaldırılınca eski hâline dönmedi');
  if (!(await M.p.locator('[data-act=chips-edit]').count())) fail('düzen kaldırılınca kısayol düzenleme geri gelmedi');
  step('herkes için düzen kaldırıldı: kısayol düzenleme, “+” ve üst simgeler geri geldi');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
try { if (A) { await call(A.p, 'ui.layout.save', { base: null }); await call(A.p, 'ui.labels.save', { labels: {} }); } } catch (e) { /* */ }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: herkes için ana ekran testleri geçti');
