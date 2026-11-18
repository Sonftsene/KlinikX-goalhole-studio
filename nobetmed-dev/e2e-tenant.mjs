// Çok hastaneli / çok birimli yapı ve birimler arası izolasyon testi (uydurma verilerle).
// e2e.mjs ve e2e-features.mjs'den SONRA aynı sitede çalışır:
//   node e2e-tenant.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-tenant.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw, url = BASE) {
  await p.goto(url);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const noOverflow = async (p, tag) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) fail(`${tag}: telefonda yatay taşma ${w}px`); };

/** RFC 6238 TOTP (doğrulama uygulamasının yaptığı) */
function totp(secret, offset = 0) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '')) bits += abc.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeUInt32BE(Math.floor(Date.now() / 30000) + offset, 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

// ---- 1) Sistem yöneticisi hesabı: ilk birimin yöneticisi Ayarlar › Güvenlik'ten bir kez açar ----
const A = await ctx('ayse');
await login(A.p, 'ayse@test.com', 'Sifre1234');
if (!(await A.p.evaluate(() => S.tenant && S.tenant.sa_setup))) fail('yöneticiye sistem hesabı kurulumu önerilmedi');
const M = await ctx('elif-uye');
await login(M.p, 'elif@test.com', 'YeniSifre99');
if ((await apiErr(M.p, 'sa.create', { name: 'Deneme', email: 'x@test.com', password: 'CokUzunSifre123', current: 'YeniSifre99' })) === 'kabul') fail('üye sistem hesabı açabildi');
await A.p.goto(BASE + '#/yonetim/ayarlar');
await A.p.click('[data-act=set-sec][data-s=guvenlik]').catch(() => {});
await A.p.locator('#saSetupF').waitFor();
await A.p.fill('#saSetupF [name=email]', 'sistem@test.com');
await A.p.fill('#saSetupF [name=password]', 'SistemSifre123');
await A.p.fill('#saSetupF [name=current]', 'Sifre1234');
await A.p.click('#saSetupGo');
await A.p.locator('#saCodeF').waitFor();
const secret = await A.p.locator('.modal input[readonly]').inputValue();
if (!/^[A-Z2-7]{32}$/.test(secret)) fail('anahtar biçimi: ' + secret);
if (!(await A.p.locator('.modal svg').count())) fail('QR kod çizilmedi');
await A.p.fill('#saCodeF [name=code]', '000000');
await A.p.click('.modal button[form=saCodeF]');
await expectText(A.p, 'Kod hatalı');
const usedCode = totp(secret);
await A.p.fill('#saCodeF [name=code]', usedCode);
await A.p.click('.modal button[form=saCodeF]');
await expectText(A.p, 'Sistem yöneticisi hesabı etkin');
if ((await apiErr(A.p, 'sa.create', { name: 'İkinci', email: 'y@test.com', password: 'CokUzunSifre123', current: 'Sifre1234' })) === 'kabul') fail('ikinci sistem hesabı açılabildi');
if ((await apiErr(A.p, 'sa.overview')) === 'kabul') fail('birim yöneticisi sistem paneline erişti');
step('sistem yöneticisi: Ayarlar › Güvenlik, QR + anahtar, yanlış kod reddedildi, doğru kodla etkin; ikinci hesap / üye / birim yöneticisi engelli');

// ---- 2) Sistem yönetimi girişi: şifre + kod; yanlış şifre/kod ----
const SA = await ctx('sistem');
await SA.p.goto(BASE);
await SA.p.click('[data-act=sys-login]');
await SA.p.fill('[data-form=sys-login] [name=email]', 'sistem@test.com');
await SA.p.fill('[data-form=sys-login] [name=password]', 'YanlisSifre1234');
await SA.p.click('[data-form=sys-login] button[type=submit]');
await expectText(SA.p, 'hatalı');
await SA.p.fill('[data-form=sys-login] [name=password]', 'SistemSifre123');
await SA.p.click('[data-form=sys-login] button[type=submit]');
await SA.p.locator('[data-form=sys-totp]').waitFor();
await SA.p.fill('[data-form=sys-totp] [name=code]', usedCode); // kurulumda kullanılan kod tekrar kabul edilmez
await SA.p.click('[data-form=sys-totp] button[type=submit]');
await expectText(SA.p, 'kullanılmış');
await SA.p.fill('[data-form=sys-totp] [name=code]', totp(secret, 1));
await SA.p.click('[data-form=sys-totp] button[type=submit]');
await SA.p.locator('.sys-main').waitFor();
await expectText(SA.p, 'Hastaneler ve birimler');
const ov0 = await apiCall(SA.p, 'sa.overview');
if (ov0.hospitals.length !== 1 || ov0.hospitals[0].tenants.length !== 1 || !ov0.hospitals[0].tenants[0].is_default) fail('eski kurulum ilk birim olarak görünmüyor: ' + JSON.stringify(ov0));
if (/test\.com|Ayşe|Elif|Burak/i.test(JSON.stringify(ov0))) fail('sistem paneline kişi bilgisi sızdı');
if ((await apiErr(SA.p, 'admin.users')) === 'kabul' || (await apiErr(SA.p, 'rosters.list')) === 'kabul') fail('sistem yöneticisi birim içeriğine erişti');
step(`sistem girişi: yanlış şifre ve tekrar kullanılan kod reddedildi; panel açıldı; ilk birim (${ov0.hospitals[0].tenants[0].active_users} etkin kişi) görünüyor, kişi bilgisi yok, birim içeriğine erişemiyor`);

// ---- 3) Yeni hastane + birim + birim yöneticisi (arayüzden) ----
await SA.p.click('[data-act=sys-h-new]');
await SA.p.fill('#sysNameF [name=name]', 'Deneme Devlet Hastanesi');
await SA.p.click('.modal button[form=sysNameF]');
await expectText(SA.p, 'Hastane eklendi');
await SA.p.locator('.sys-h', { hasText: 'Deneme Devlet Hastanesi' }).locator('[data-act=sys-t-new]').click();
await SA.p.fill('#sysNameF [name=name]', 'Acil Servis');
await SA.p.click('.modal button[form=sysNameF]');
await expectText(SA.p, 'Birim eklendi');
await SA.p.locator('.sys-t', { hasText: 'Acil Servis' }).locator('[data-act=sys-t-admin]').click();
await SA.p.fill('#sysAdmF [name=name]', 'Kerem Acar');
await SA.p.fill('#sysAdmF [name=email]', 'ayse@test.com');
await SA.p.click('.modal button[form=sysAdmF]');
await expectText(SA.p, 'başka bir birimde kayıtlı'.slice(0, 10)).catch(() => {});
if (!/kayıtlı/.test(await SA.p.locator('#sysAdmF [data-err]').innerText())) fail('başka birimdeki e-posta yönetici yapılabildi');
await SA.p.fill('#sysAdmF [name=email]', 'kerem@test.com');
await SA.p.click('.modal button[form=sysAdmF]');
await expectText(SA.p, 'birim yöneticisi olarak eklendi');
const tmpPw = await SA.p.locator('.modal input[readonly]').first().inputValue();
const linkB = await SA.p.locator('.modal input[readonly]').nth(1).inputValue();
await SA.p.click('.modal [data-close]');
const ov1 = await apiCall(SA.p, 'sa.overview');
const tB = ov1.hospitals.find((h) => h.name === 'Deneme Devlet Hastanesi').tenants[0];
if (!/\?b=[a-z0-9]{8}$/.test(linkB) || tB.users !== 1) fail('yeni birim bağlantısı / sayısı: ' + linkB + ' ' + tB.users);
if (!SITE || !fs.existsSync(path.join(SITE, 'data/b', tB.key)) || !fs.readdirSync(path.join(SITE, 'data/b', tB.key)).some((f) => /^nm-.*\.sqlite$/.test(f))) fail('yeni birimin ayrı veritabanı yok');
await SA.p.screenshot({ path: path.join(OUT, 't-sistem-desktop.png'), fullPage: true });
step(`yeni hastane ve birim (“Acil Servis”, ayrı veritabanı data/b/${tB.key}/), birim yöneticisi geçici şifreyle açıldı; başka birimdeki e-posta reddedildi`);

// ---- 4) Tek adresten giriş: e-posta doğru birime götürür ----
const N = await ctx('neutral', true);
await N.p.goto(BASE);
await N.p.locator('[data-form=login]').waitFor();
const neutral = await N.p.evaluate(() => S.settings.org_name);
if (neutral !== 'dupcii') fail('birden çok birim varken giriş ekranı bir birimin adını gösteriyor: ' + neutral);
const K = await ctx('kerem', true);
await login(K.p, 'kerem@test.com', tmpPw);
if (!(await K.p.evaluate(() => S.me.must_change))) fail('geçici şifrede şifre değişikliği istenmedi');
await apiCall(K.p, 'me.password', { password: 'KeremSifre123' });
await K.p.reload();
await K.p.waitForFunction(() => typeof S !== 'undefined' && S.me && !S.me.must_change && S.tenant);
const kb = await K.p.evaluate(() => ({ t: S.tenant, me: S.me, people: S.people.length, rosters: S.rosters.filter((r) => r.file).length, org: S.settings.org_name }));
if (kb.t.name !== 'Acil Servis' || kb.me.role !== 'admin' || kb.people !== 1 || kb.rosters !== 0) fail('Kerem yanlış birimde / başka birimin verisini görüyor: ' + JSON.stringify(kb));
if (!/Deneme Devlet Hastanesi/.test(kb.org)) fail('yeni birimin adı ayarlanmadı: ' + kb.org);
step(`tek adres: giriş ekranı tarafsız (“${neutral}”); kerem@test.com aynı adresten girip kendi birimine düştü (${kb.org}), geçici şifreyi değiştirdi; başka birimin kişileri/listeleri yok`);

// ---- 5) İzolasyon: kullanıcılar, dosyalar, e-posta tekliği, Google eşitlemesi, bildirimler ----
const kUsers = (await apiCall(K.p, 'admin.users')).users;
if (kUsers.length !== 1 || kUsers.some((u) => /test\.com$/.test(u.email) && u.email !== 'kerem@test.com')) fail('B birimi A biriminin kullanıcılarını görüyor');
const aUsers = (await apiCall(A.p, 'admin.users')).users;
if (aUsers.some((u) => u.email === 'kerem@test.com')) fail('A birimi B biriminin kullanıcısını görüyor');
if (!/başka bir birimde/.test(await apiErr(K.p, 'admin.user.save', { name: 'Ayşe Kopya', email: 'ayse@test.com', role: 'member', status: 'active' }))) fail('başka birimdeki e-postayla hesap açılabildi');
if (!/başka bir birimde/.test(await apiErr(A.p, 'admin.user.save', { name: 'Kerem Kopya', email: 'kerem@test.com', role: 'member', status: 'active' }))) fail('A biriminde B’nin e-postasıyla hesap açılabildi');
// A'nın dosyası (nöbet listesi) B oturumundan açılamaz
const aRoster = (await apiCall(A.p, 'rosters.list')).rosters.find((r) => r.file);
const fileUrl = BASE + aRoster.file.url.replace(/^\.?\//, '');
const fromB = await K.p.evaluate(async (u) => (await fetch(u)).status, fileUrl);
const fromA = await A.p.evaluate(async (u) => (await fetch(u)).status, fileUrl);
if (fromA !== 200 || fromB !== 404) fail(`dosya erişimi: A ${fromA}, B ${fromB}`);
// Bağlantıya başka birimin anahtarını eklemek işe yaramaz (oturum birimi geçerli)
const fromBhint = await K.p.evaluate(async (u) => (await fetch(u + '&b=zzzzzzzz')).status, fileUrl);
if (fromBhint !== 404) fail('b= ile başka birimin dosyasına erişildi');
// Google eşitleme anahtarı birime özel: A'nın anahtarı B adresinde geçmez
const gsA = (await apiCall(A.p, 'gsync.get')).gs;
const tA = await fetch(gsA.tables_url, { headers: { 'X-Sync-Token': gsA.token } });
const tAB = await fetch(BASE + 'api.php?action=gsync.tables&b=' + tB.key, { headers: { 'X-Sync-Token': gsA.token } });
if (tA.status !== 200 || tAB.status !== 403) fail(`gsync: A ${tA.status}, A anahtarı B'de ${tAB.status}`);
const kN = (await apiCall(K.p, 'notif.list')).items;
if (kN.length) fail('B birimine A’nın bildirimleri geldi');
step(`izolasyon: kullanıcı listeleri ayrı, e-posta iki birimde açılamıyor, A’nın dosyası B oturumundan 404 (b= hilesi dahil), Google anahtarı birime özel (${tA.status}/${tAB.status}), bildirimler ayrı`);

// ---- 6) Dondurma ----
await apiCall(SA.p, 'sa.status', { kind: 'tenant', id: tB.id, status: 'frozen' });
const frozenCall = await apiErr(K.p, 'counts');
const K2 = await ctx('kerem2');
await K2.p.goto(BASE);
await K2.p.fill('[data-form=login] [name=email]', 'kerem@test.com');
await K2.p.fill('[data-form=login] [name=password]', 'KeremSifre123');
await K2.p.click('[data-form=login] button[type=submit]');
await expectText(K2.p, 'kullanıma kapatıldı');
if (!/kapatıldı/.test(frozenCall)) fail('dondurulan birimde açık oturum çalışmaya devam etti: ' + frozenCall);
if (!(await A.p.evaluate(async () => !!(await api('counts')).counts))) fail('B dondurulunca A etkilendi');
await apiCall(SA.p, 'sa.status', { kind: 'tenant', id: tB.id, status: 'active' });
await login(K2.p, 'kerem@test.com', 'KeremSifre123');
step('dondurma: B dondurulunca açık oturum ve yeni giriş durdu, A çalışmaya devam etti; açılınca giriş yapıldı');

// ---- 7) Cron: her birim ayrı süreçte ----
if (SITE) {
  const out = execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' });
  const keys = ov1.hospitals.flatMap((h) => h.tenants.map((t) => t.key));
  if (!keys.every((k) => out.includes('[' + k + ']')) || !/görevler:/.test(out)) fail('cron her birimi çalıştırmadı: ' + out.slice(0, 400));
  step(`cron: ${keys.length} birim ayrı süreçlerde çalıştı`);
}

// ---- 8) Telefonda sistem paneli ----
const SAm = await ctx('sistem-mobil', true);
await SAm.p.goto(BASE);
await SAm.p.click('[data-act=sys-login]');
await SAm.p.fill('[data-form=sys-login] [name=email]', 'sistem@test.com');
await SAm.p.fill('[data-form=sys-login] [name=password]', 'SistemSifre123');
await SAm.p.click('[data-form=sys-login] button[type=submit]');
await SAm.p.locator('[data-form=sys-totp]').waitFor();
await new Promise((r) => setTimeout(r, Math.max(0, 30000 - (Date.now() % 30000)) + 1500)); // yeni zaman adımı
await SAm.p.fill('[data-form=sys-totp] [name=code]', totp(secret, 1));
await SAm.p.click('[data-form=sys-totp] button[type=submit]');
await SAm.p.locator('.sys-t').first().waitFor();
await SAm.p.screenshot({ path: path.join(OUT, 't-sistem-mobile.png'), fullPage: true });
await noOverflow(SAm.p, 'sistem paneli');
await SAm.p.click('[data-act=sys-tab][data-t=gunluk]');
await expectText(SAm.p, 'Birim yöneticisi açıldı');
await SAm.p.click('[data-act=sys-out]');
await SAm.p.locator('[data-form=login]').waitFor();
step('telefonda sistem paneli (taşma yok), işlem günlüğü, çıkış');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nÇOK BİRİMLİ YAPI TESTLERİ GEÇTİ');
