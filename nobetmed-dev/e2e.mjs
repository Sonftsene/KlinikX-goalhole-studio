// Uçtan uca test: node e2e.mjs http://127.0.0.1:8088/ <çıktı klasörü>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import path from 'node:path';
const BASE = process.argv[2] || 'http://127.0.0.1:8088/';
const OUT = process.argv[3] || '.';
const DIR = path.dirname(new URL(import.meta.url).pathname);
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
await a.setInputFiles('#fileInput', [path.join(DIR, 'fixture.png'), path.join(DIR, 'fixture.pdf')]);
await a.waitForFunction(() => document.querySelectorAll('#attList .att').length === 2 && !document.querySelector('#attList .bar'));
await a.click('.switch:has([name=required]) .track');
await a.click('.switch:has([name=pinned]) .track');
await a.click('button[form=composer]');
await expectText(a, 'İçerik yayınlandı');
await expectText(a, 'Yüksek riskli ilaçlarda');
step('içerik + 2 ek yayınlandı');

// Detay, okuma durumu, paylaşım
await a.click('.post >> text=Yüksek riskli');
await expectText(a, 'Okuma durumu');
await a.locator('.preview img').waitFor();
const imgOk = await a.locator('.preview img').evaluate((i) => i.complete && i.naturalWidth > 0);
if (!imgOk) errors.push('görsel ek yüklenmedi');
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
const gImg = await G.p.locator('.preview img').evaluate((i) => new Promise((r) => i.complete ? r(i.naturalWidth > 0) : (i.onload = () => r(true), i.onerror = () => r(false))));
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

// Nöbet çizelgesi
await a.goto(BASE + '#/nobet');
await a.selectOption('[data-change=sh-unit]', { label: 'Yoğun Bakım' });
await a.waitForSelector('.roster');
const cells = a.locator('.cell.editable');
// 1. gün gece: Elif ; 2. gün gündüz: Elif (çakışma), Kemal (kayıtsız)
await cells.nth(1).click();
await a.locator('.pick >> text=Elif Yılmaz').click();
await a.click('.modal [data-save]');
await expectText(a, 'Çizelge güncellendi');
await cells.nth(2).click();
await a.locator('.pick >> text=Elif Yılmaz').click();
await a.fill('#extForm [name=ext]', 'Pers. Kemal B.');
await a.click('#extForm button');
await a.click('.modal [data-save]');
await expectText(a, 'çakışan atama');
await a.screenshot({ path: path.join(OUT, 'd-roster.png') });
await a.click('[data-act=sh-tab][data-tab=summary]');
await expectText(a, 'Pers. Kemal B.');
const dl = a.waitForEvent('download');
await a.click('[data-act=sh-csv]');
const file = await dl;
console.log('  csv:', file.suggestedFilename());
step('nöbet çizelgesi + çakışma + özet + csv');

// Üye nöbetlerim
await m.goto(BASE + '#/nobet');
await m.click('[data-act=sh-tab][data-tab=mine]');
await m.waitForTimeout(500);
await m.screenshot({ path: path.join(OUT, 'm-shifts.png') });

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
