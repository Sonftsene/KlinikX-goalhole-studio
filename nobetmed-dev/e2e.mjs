// Uçtan uca test: node e2e.mjs http://127.0.0.1:8088/ <çıktı klasörü>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'node:path';
const BASE = process.argv[2] || 'http://127.0.0.1:8088/';
const OUT = process.argv[3] || '.';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const FX = path.join(DIR, 'fixtures');
import fs from 'node:fs';
import os from 'node:os';
// Sunucu sınırını aşan büyük dosya (parça parça yüklenmeli) ve bilinmeyen bir dosya türü
const BIG = path.join(os.tmpdir(), 'nm-buyuk-video.mp4');
if (!fs.existsSync(BIG) || fs.statSync(BIG).size !== 25 * 1048576) fs.writeFileSync(BIG, Buffer.alloc(25 * 1048576, 7));
const ODD = path.join(os.tmpdir(), 'arsiv-yedek.xyz');
fs.writeFileSync(ODD, 'herhangi bir icerik');
const errors = [];
const browser = await chromium.launch();
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 860 } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
const step = (s) => console.log('✓', s);
const expectText = async (p, t) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout: 6000 }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 600)); throw e; } };

const A = await ctx('admin');
const a = A.p;
await a.goto(BASE);
await expectText(a, 'Kuruluma hoş geldiniz');
await a.fill('[name=org_name]', 'Şehir Hastanesi YBÜ');
await a.fill('[name=name]', 'Ayşe Kaya');
await a.fill('[name=email]', 'ayse@test.com');
await a.fill('[name=password]', 'Sifre1234');
await a.click('button[type=submit]');
await expectText(a, 'Ayşe');
step('kurulum + yönetici girişi');

// Yapı: birim ekle
await a.goto(BASE + '#/yonetim/yapi');
await a.locator('[data-act=tax-edit][data-kind=units]').first().click();
await a.fill('#taxForm [name=name]', 'Yoğun Bakım');
await a.click('button[form=taxForm]');
await expectText(a, 'Yoğun Bakım');
step('birim eklendi');

// Kullanıcı ekle (geçici şifre)
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.click('[data-act=u-new]');
await a.fill('#userForm [name=name]', 'Elif Yılmaz');
await a.fill('#userForm [name=email]', 'elif@test.com');
await a.selectOption('#userForm [name=unit_id]', { label: 'Yoğun Bakım' });
await a.click('button[form=userForm]');
await expectText(a, 'Geçici şifre');
const tempPw = await a.locator('.modal input[readonly]').inputValue();
await a.click('.modal-foot .btn.primary');
step('kullanıcı eklendi, geçici şifre: ' + tempPw);

// İçerik oluştur (ek + zorunlu)
await a.goto(BASE + '#/');
await a.click('.topbar [data-act=compose]');
await a.fill('#composer [name=title]', 'Yüksek riskli ilaçlarda çift kontrol');
await a.fill('#composer [name=body]', 'İnsülin, heparin ve KCl için çift hemşire imzası zorunludur.\nDetaylar ekte. https://ornek.com');
await a.setInputFiles('#fileInput', [path.join(FX, 'cift-kontrol-protokolu.pdf'), path.join(FX, 'personel-nobet-kasim-2026.xlsx'), path.join(FX, 'basinc-yarasi-onleme.docx'), path.join(DIR, 'fixture.png'), BIG, ODD]);
await a.waitForFunction(() => document.querySelectorAll('#attList .att').length === 6 && !document.querySelector('#attList .bar'), null, { timeout: 120000 });
const upErr = await a.locator('#attList').innerText();
if (/sınır|desteklenmiyor|başarısız|hata/i.test(upErr)) errors.push('yükleme hatası: ' + upErr);
await a.click('.switch:has([name=required]) .track');
await a.click('.switch:has([name=pinned]) .track');
await a.click('button[form=composer]');
await expectText(a, 'İçerik yayınlandı');
await expectText(a, 'Yüksek riskli ilaçlarda');
step('içerik + 6 ek yayınlandı (25 MB video ve bilinmeyen tür dahil)');

// Detay, okuma durumu, paylaşım
await a.click('.post >> text=Yüksek riskli');
await expectText(a, 'Okuma durumu');
await a.locator('.modal .pv-page canvas').first().waitFor({ timeout: 15000 });
step('PDF sayfada açıldı');
await a.locator('.modal .fv:has-text("personel-nobet")').scrollIntoViewIfNeeded();
await a.locator('.modal .xv-grid').first().waitFor({ timeout: 15000 });
const xText = await a.locator('.modal .xv-grid').first().innerText();
if (!/DESTEK PERSONELİ/.test(xText) || !/01\.11\.2026/.test(xText)) errors.push('excel eki içeriği/tarih biçimi beklenen gibi değil');
step('Excel eki sayfada açıldı');
await a.locator('.modal .fv:has-text("basinc-yarasi")').scrollIntoViewIfNeeded();
await a.locator('.modal .dv-page').first().waitFor({ timeout: 15000 });
if (!/Braden/.test(await a.locator('.modal .dv-page').innerText())) errors.push('word içeriği görünmüyor');
step('Word eki sayfada açıldı');
await a.locator('.modal .fv:has-text("fixture.png")').scrollIntoViewIfNeeded();
await a.locator('.modal .mv img').waitFor();
const imgOk = await a.locator('.modal .mv img').evaluate((i) => new Promise((r) => i.complete ? r(i.naturalWidth > 0) : (i.onload = () => r(true), i.onerror = () => r(false))));
if (!imgOk) errors.push('görsel ek yüklenmedi');
await a.locator('.modal .fv:has-text("nm-buyuk-video")').scrollIntoViewIfNeeded();
const vurl = await a.locator('.modal .fv:has-text("nm-buyuk-video") [data-act=fv-dl]').getAttribute('data-url');
const big = await a.evaluate(async (u) => { const r = await fetch(u, { headers: { Range: 'bytes=0-99' } }); const all = await fetch(u, { method: 'HEAD' }); return [r.status, all.headers.get('content-length')]; }, vurl);
if (big[0] !== 206 || +big[1] !== 25 * 1048576) errors.push('büyük dosya eksik: ' + big);
await a.locator('.modal .fv:has-text("arsiv-yedek")').scrollIntoViewIfNeeded();
if (!(await a.locator('.modal .fv:has-text("arsiv-yedek")').innerText()).includes('indirerek açın')) errors.push('bilinmeyen tür kartı yok');
step('görsel, 25 MB video (tam boyut) ve bilinmeyen tür doğru gösterildi');
await a.screenshot({ path: path.join(OUT, 'd-detail-files.png') });
await a.click('[data-act=share]');
await a.click('[data-share-days="7"]');
await expectText(a, 'Misafir bağlantısı oluşturuldu');
const shareLink = await a.locator('.modal input[readonly]').last().inputValue();
await a.screenshot({ path: path.join(OUT, 'd-detail.png') });
await a.keyboard.press('Escape'); await a.keyboard.press('Escape');
step('detay + misafir linki: ' + shareLink);

// Misafir görünümü
const G = await ctx('guest');
await G.p.goto(shareLink.replace(/^https?:\/\/[^/]+\//, BASE));
await expectText(G.p, 'Yüksek riskli ilaçlarda');
await G.p.locator('.pv-page canvas').first().waitFor({ timeout: 15000 });
await G.p.locator('.fv:has-text("fixture.png")').scrollIntoViewIfNeeded();
const gImg = await G.p.locator('.mv img').evaluate((i) => new Promise((r) => i.complete ? r(i.naturalWidth > 0) : (i.onload = () => r(true), i.onerror = () => r(false))));
if (!gImg) errors.push('misafir görsel açamadı');
await G.p.screenshot({ path: path.join(OUT, 'd-guest.png') });
step('misafir sayfası');

// Kayıt (onaylı)
const R = await ctx('reg');
await R.p.goto(BASE);
await R.p.click('[data-act=auth-mode][data-mode=register]');
await R.p.fill('[name=name]', 'Burak Demir');
await R.p.fill('[name=email]', 'burak@test.com');
await R.p.fill('[name=password]', 'Sifre1234');
await R.p.selectOption('[name=unit_id]', { label: 'Yoğun Bakım' });
await R.p.click('button[type=submit]');
await expectText(R.p, 'Kaydınız alındı');
await R.p.click('[data-mode=login]');
await R.p.fill('[name=email]', 'burak@test.com');
await R.p.fill('[name=password]', 'Sifre1234');
await R.p.click('button[type=submit]');
await expectText(R.p, 'onayı bekliyor');
step('kayıt onay bekliyor');
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.click('[data-act=u-approve]');
await expectText(a, 'Burak Demir onaylandı');
step('admin üyeyi onayladı');

// Üye: Elif giriş, okundu onayı, içerik gönderme
const M = await ctx('member', true);
const m = M.p;
await m.goto(BASE);
await m.fill('[name=email]', 'elif@test.com');
await m.fill('[name=password]', tempPw);
await m.click('button[type=submit]');
await expectText(m, 'Elif');
await m.screenshot({ path: path.join(OUT, 'm-home.png') });
const todo = await m.locator('.kpi .k-val').first().innerText();
if (todo.trim() !== '1') errors.push('todo sayısı beklenen 1, gelen ' + todo);
await m.click('.post >> text=Yüksek riskli');
await m.click('[data-act=ack]');
await expectText(m, 'Okudunuz ve onayladınız');
await m.screenshot({ path: path.join(OUT, 'm-detail.png') });
await m.keyboard.press('Escape');
step('üye okundu onayı verdi');
await m.click('.bottom-nav [data-act=compose]');
await m.fill('#composer [name=title]', 'Nebülizatör temizliği eğitimi');
await m.fill('#composer [name=body]', 'Çocuk hastalarda maske uyumu.');
await m.click('button[form=composer]');
await expectText(m, 'onaya gönderildi');
step('üye içerik gönderdi (onaya)');

// Admin onaylar
await a.goto(BASE + '#/yonetim/onaylar');
await a.click('.post >> text=Nebülizatör');
await a.click('.modal [data-act=approve]');
await expectText(a, 'İçerik yayınlandı');
await a.click('.post-x', { timeout: 1 }).catch(() => {});
step('admin onayladı');

// Okuma durumu kontrolü
await a.goto(BASE + '#/');
await a.click('.post >> text=Yüksek riskli');
await expectText(a, 'Okuyanlar');
const readers = await a.locator('.modal .card-head .small').innerText();
console.log('  okuma durumu:', readers);
await a.keyboard.press('Escape');

// Nöbet listeleri (Excel)
await a.goto(BASE + '#/nobet');
await a.waitForSelector('#rsTabs');
const tabs = await a.locator('#rsTabs button').allInnerTexts();
if (tabs.length !== 2) errors.push('iki liste bekleniyordu: ' + tabs);
await a.setInputFiles('.rs-actions input[data-change=rs-file]', path.join(FX, 'hemsire-nobet-kasim-2026.xlsx'));
await expectText(a, 'güncellendi');
await a.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 });
const hs = await a.evaluate(() => {
  const g = document.querySelector('.rs-view:not(.hidden) .xv-grid');
  const title = [...g.querySelectorAll('td')].find((td) => /HEMŞİRE NÖBET LİSTESİ/.test(td.textContent));
  return { colspan: title && title.colSpan, bg: title && getComputedStyle(title).backgroundColor, frozen: g.querySelectorAll('td.fz').length, me: g.querySelectorAll('td.me').length, sheets: document.querySelectorAll('.rs-view:not(.hidden) .xv-tabs button').length };
});
console.log('  hemşire listesi:', JSON.stringify(hs));
if (hs.colspan < 30 || hs.bg !== 'rgb(11, 106, 102)' || !hs.frozen || !hs.me || hs.sheets !== 2) errors.push('excel görünümü eksik: ' + JSON.stringify(hs));
await a.click('.xv-me');
await a.screenshot({ path: path.join(OUT, 'd-roster.png') });
step('hemşire listesi Excel olarak açıldı (renk, birleşik hücre, dondurma, sayfa sekmeleri)');
await a.click('#rsTabs button >> nth=1');
await a.setInputFiles('.rs-actions input[data-change=rs-file]', path.join(FX, 'personel-nobet-kasim-2026.xlsx'));
await a.locator('.rs-view:not(.hidden) .xv-grid >> text=DESTEK PERSONELİ').waitFor({ timeout: 15000 });
// yeniden adlandır
await a.click('[data-act=rs-menu]');
await a.click('.menu >> text=Yeniden adlandır');
await a.fill('.modal [name=v]', 'Destek Personeli Listesi');
await a.click('.modal [data-ok]');
await expectText(a, 'Liste adı güncellendi');
if (!(await a.locator('#sidebar').innerText()).includes('Destek Personeli Listesi')) errors.push('menüde yeni ad yok');
// hızlı geçiş
const t0 = Date.now();
await a.click('#rsTabs button >> nth=0');
await a.locator('.rs-view:not(.hidden) .xv-grid >> text=HEMŞİRE NÖBET').waitFor();
const t1 = Date.now() - t0;
await a.click('#rsTabs button >> nth=1');
await a.locator('.rs-view:not(.hidden) .xv-grid >> text=DESTEK PERSONELİ').waitFor();
console.log('  listeler arası geçiş:', t1 + ' ms');
if (t1 > 600) errors.push('liste geçişi yavaş: ' + t1);
// yeni sürüm + sürüm geçmişi
await a.setInputFiles('.rs-actions input[data-change=rs-file]', path.join(FX, 'personel-nobet-kasim-2026.xlsx'));
await expectText(a, 'güncellendi');
await a.click('[data-act=rs-menu]');
await a.click('.menu >> text=Önceki sürümler');
await a.locator('.modal [data-ver-restore]').waitFor();
await a.keyboard.press('Escape');
step('ikinci liste, yeniden adlandırma, anında geçiş ve sürüm geçmişi');

// Üye listeyi görür, yükleyemez, adını bulur
await m.goto(BASE + '#/nobet');
await m.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 });
if (await m.locator('.rs-actions input[data-change=rs-file]').count()) errors.push('üye liste yükleyebiliyor');
await m.click('#rsTabs button >> nth=0');
await m.locator('.rs-view:not(.hidden) .xv-grid >> text=HEMŞİRE NÖBET').waitFor();
await m.click('.rs-view:not(.hidden) .xv-me');
await m.waitForTimeout(600);
await m.screenshot({ path: path.join(OUT, 'm-roster.png') });
const sw = await m.evaluate(() => document.documentElement.scrollWidth);
if (sw > 390) errors.push('mobil taşma: ' + sw);
const ru = await m.evaluate(async () => (await fetch('api.php?action=rosters.save', { method: 'POST', headers: { 'X-CSRF': S.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x y' }) })).status);
if (ru !== 403) errors.push('üye liste oluşturabildi: ' + ru);
step('üye listeyi görüyor, adını buluyor, düzenleyemiyor');

// Ayarlar: bant
await a.goto(BASE + '#/yonetim/ayarlar');
await a.click('.switch:has([name=banner_on]) .track');
await a.fill('[name=banner_text]', '6 Kasım Cuma 09:30 kalite denetimi');
await a.click('form[data-form=settings] button[type=submit]');
await expectText(a, 'Ayarlar kaydedildi');
await a.goto(BASE + '#/');
await a.waitForTimeout(400);
await a.screenshot({ path: path.join(OUT, 'd-home.png') });
await a.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
await a.screenshot({ path: path.join(OUT, 'd-home-dark.png') });
step('ayarlar + bant');

// Profil şifre değişimi (üye)
await m.goto(BASE + '#/profil');
await m.fill('[data-form=me-pw] [name=current]', tempPw);
await m.fill('[data-form=me-pw] [name=password]', 'YeniSifre99');
await m.click('[data-form=me-pw] button[type=submit]');
await expectText(m, 'Şifreniz değiştirildi');
step('şifre değiştirildi');

// Yetkisiz erişim
const st = await m.evaluate(async () => (await fetch('api.php?action=admin.users', { method: 'POST', headers: { 'X-CSRF': S.csrf, 'Content-Type': 'application/json' }, body: '{}' })).status);
if (st !== 403) errors.push('üye admin uç noktasına erişebildi: ' + st);
const st2 = await G.p.evaluate(async () => (await fetch('api.php?action=file&id=1')).status);
if (st2 !== 404) errors.push('misafir token olmadan dosyaya erişti: ' + st2);
step('yetki kontrolleri');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTÜM TESTLER GEÇTİ');
