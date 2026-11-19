// QR ile bilgisayara giriş ve bağlı cihazlar / güvenli çıkış (4.11) — uydurma verilerle.
// e2e-tenant.mjs SONRASI aynı sitede çalışır (Acil Servis birimi ve kerem@test.com orada açılır):
//   node e2e-qr.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
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
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; ${code}`], { encoding: 'utf8' });
const mq = (sql) => php(`(nm_multi() ? merkez() : (function () { nm_tenant_use(nm_tenant_default()); return db(); })())->exec(${JSON.stringify(sql)});`);
/** Bilgisayar: giriş ekranında QR → karekod adresi */
async function desktopQr(D, keep) {
  await D.p.goto(BASE);
  await D.p.locator('[data-act=qr-login]').click();
  await D.p.locator('#qrlCode svg').waitFor({ timeout: 10000 });
  if (keep) await D.p.locator('#qrlKeep').locator('..').click();
  const url = await D.p.getAttribute('#qrlCode', 'data-url');
  return (/#\/qr\/([A-Za-z0-9_-]+)/.exec(url) || [])[1];
}
/** Bilgisayarda karekodun yanında görünen sayı (sunucudaki qr_code ile aynı hesap) */
const qcode = (t) => 10 + parseInt(crypto.createHash('sha256').update('qrc|' + t).digest('hex').slice(0, 6), 16) % 90;
const isIn = (D, name) => D.p.waitForFunction((n) => typeof S !== 'undefined' && S.me && S.me.name === n, name, { timeout: 15000 });

const E = await ctx('elif-tel', true); await login(E.p, 'elif@test.com', 'YeniSifre99');

// ---- 1) Bilgisayarda karekod → telefonda onay → bilgisayar girer ----
const D = await ctx('bilgisayar');
const tok = await desktopQr(D, false);
if (!tok) fail('karekod adresi yok');
await D.p.screenshot({ path: path.join(OUT, 'q-karekod-desktop.png') });
await E.p.goto(BASE + '#/qr/' + tok);
await E.p.locator('.qra-dev').waitFor();
if (!/Chrome/.test(await E.p.locator('.qra-dev').innerText())) fail('telefonda bilgisayarın tarayıcısı görünmüyor');
await D.p.getByText('Telefonda onay bekleniyor').first().waitFor({ timeout: 8000 }).catch(() => fail('bilgisayarda “onay bekleniyor” görünmedi'));
await E.p.screenshot({ path: path.join(OUT, 'q-onay-mobile.png') });
const dcode = await D.p.getAttribute('#qrlCode', 'data-code');
if (+dcode !== qcode(tok) || !(await D.p.locator('#qrlNum').innerText()).includes(dcode)) fail('bilgisayarda doğrulama sayısı görünmüyor');
if ((await E.p.locator('[data-act=qr-ok]').count()) !== 3) fail('telefonda 3 sayı seçeneği yok');
await E.p.click(`[data-act=qr-ok][data-c="${dcode}"]`);
await E.p.getByText('Bilgisayarda oturum açıldı').first().waitFor();
await isIn(D, 'Elif Yılmaz');
const ck = (await D.c.cookies()).find((c) => c.name === 'nm_sid');
if (!ck || ck.expires !== -1) fail('QR oturum çerezi tarayıcı kapanınca bitmiyor: ' + (ck && ck.expires));
if ((await apiErr(E.p, 'qr.info', { token: tok })) === 'kabul') fail('kullanılmış karekod yeniden açıldı');
step('QR giriş: bilgisayarda karekod, telefonda tarayıcı/IP bilgisi ve uyarı, bilgisayarda “onay bekleniyor”, Onayla → bilgisayar şifresiz girdi; çerez tarayıcı kapanınca biter; karekod tek kullanımlık');

// ---- 2) Karekodu bilen başka tarayıcı giremez; reddetme; süresi dolmuş ----
const D2 = await ctx('bilgisayar2');
const tok2 = await desktopQr(D2, false);
const X = await ctx('saldirgan');
await X.p.goto(BASE);
await X.p.waitForFunction(() => typeof api === 'function');
await apiCall(E.p, 'qr.approve', { token: tok2, ok: true, code: qcode(tok2) });
const xp = await apiCall(X.p, 'qr.poll', {});
if (xp.state !== 'none') fail('karekodu oluşturmayan tarayıcı oturumu ele geçirdi: ' + JSON.stringify(xp));
await isIn(D2, 'Elif Yılmaz');
const D3 = await ctx('bilgisayar3');
const tok3 = await desktopQr(D3, false);
await E.p.goto(BASE + '#/qr/' + tok3);
await E.p.locator('[data-act=qr-no]').click();
await D3.p.getByText('Telefondan reddedildi').first().waitFor({ timeout: 8000 }).catch(() => fail('bilgisayarda “reddedildi” görünmedi'));
if (await D3.p.evaluate(() => !!(S && S.me))) fail('reddedilen bilgisayar girdi');
await D3.p.locator('[data-act=qr-renew]').click();
await D3.p.locator('#qrlCode:not(.dim) svg').waitFor();
const tok3b = (/#\/qr\/([A-Za-z0-9_-]+)/.exec(await D3.p.getAttribute('#qrlCode', 'data-url')) || [])[1];
// Bağlantıyla gönderilen karekod: yanlış sayı seçilirse giriş reddedilir ve karekod yanar
const D7 = await ctx('bilgisayar7');
const tok7 = await desktopQr(D7, false);
await E.p.goto(BASE + '#/qr/' + tok7);
await E.p.locator('.qra-codes').waitFor();
const wrong = await E.p.evaluate((c) => [...document.querySelectorAll('[data-act=qr-ok]')].map((b) => +b.dataset.c).find((x) => x !== c), qcode(tok7));
await E.p.click(`[data-act=qr-ok][data-c="${wrong}"]`);
await E.p.getByText('Giriş reddedildi').first().waitFor({ timeout: 8000 }).catch(() => fail('yanlış sayıda telefonda “reddedildi” görünmedi'));
await D7.p.getByText('Telefondan reddedildi').first().waitFor({ timeout: 8000 }).catch(() => fail('yanlış sayıda bilgisayar reddedildi demedi'));
if (!/süresi dolmuş/.test(await apiErr(E.p, 'qr.approve', { token: tok7, ok: true, code: qcode(tok7) }))) fail('yanlış sayıdan sonra karekod yeniden onaylandı');
step('bilgisayardaki sayı doğrulaması: telefonda yanlış sayı seçilince giriş reddedildi ve karekod yandı (gönderilen bağlantıyla kandırmaya karşı)');
mq("UPDATE qr_logins SET expires_at = '2020-01-01 00:00:00' WHERE status IN ('wait', 'seen')");
if (!/süresi dolmuş/.test(await apiErr(E.p, 'qr.approve', { token: tok3b, ok: true, code: qcode(tok3b) }))) fail('süresi dolmuş karekod onaylandı');
step('güvenlik: karekod adresini bilen başka tarayıcı giremez (yalnız karekodu oluşturan oturum), telefondan reddet, süresi dolmuş karekod onaylanamaz, yeni karekod');

// ---- 3) Bağlı cihazlar: telefondan uzaktan çıkış (bilgisayardaki izler de silinir), boşta kapanma ----
await D.p.evaluate(() => localStorage.setItem('nm-draft-99', 'yarım kalan mesaj'));
const ses = (await apiCall(E.p, 'me.sessions')).items;
const qrSes = ses.filter((x) => x.via === 'qr');
if (qrSes.length < 2 || !qrSes.every((x) => /\(QR\)/.test(x.label) && x.idle_min === 480) || !ses.some((x) => x.current)) fail('bağlı cihazlar: ' + JSON.stringify(ses));
await E.p.goto(BASE + '#/profil/guvenlik');
await E.p.locator('#usBox .us-list .list-row').first().waitFor();
await E.p.screenshot({ path: path.join(OUT, 'q-cihazlar-mobile.png'), fullPage: true });
const dId = await D.p.evaluate(async () => (await api('me.sessions')).items.find((x) => x.current).id);
await E.p.locator(`[data-act=us-revoke][data-id="${dId}"]`).click();
await E.p.locator('.modal [data-ok]').last().click();
await E.p.getByText('Cihazda oturum kapatıldı').first().waitFor();
await D.p.evaluate(() => api('counts').catch(() => {}));
await D.p.locator('[data-form=login]').waitFor({ timeout: 10000 });
if (await D.p.evaluate(() => localStorage.getItem('nm-draft-99'))) fail('uzaktan çıkışta bilgisayardaki taslak silinmedi');
// Boşta kapanma (8 saat)
const D4 = await ctx('bilgisayar4');
const tok4 = await desktopQr(D4, false);
await apiCall(E.p, 'qr.approve', { token: tok4, ok: true, code: qcode(tok4) });
await isIn(D4, 'Elif Yılmaz');
php(`nm_tenant_use(nm_tenant_default()); q("UPDATE user_sessions SET last_seen = '2020-01-01 00:00:00' WHERE via = 'qr' AND revoked_at IS NULL");`);
if (!/Oturum|giriş/.test(await apiErr(D4.p, 'counts'))) fail('8 saat boşta kalan QR oturumu kapanmadı');
await D4.p.locator('[data-form=login]').waitFor({ timeout: 10000 });
step('bağlı cihazlar: telefondan bilgisayardaki oturumu kapat (bilgisayar hemen giriş ekranına düştü, taslaklar silindi), 8 saat boşta kalan QR oturumu kendiliğinden kapandı');

// ---- 4) "Açık kalsın" seçeneği, diğer tüm cihazlardan çıkış ----
const D5 = await ctx('bilgisayar5');
const tok5 = await desktopQr(D5, true);
await apiCall(E.p, 'qr.approve', { token: tok5, ok: true, code: qcode(tok5) });
await isIn(D5, 'Elif Yılmaz');
const ck5 = (await D5.c.cookies()).find((c) => c.name === 'nm_sid');
if (!ck5 || ck5.expires < Date.now() / 1000 + 86400) fail('“açık kalsın” seçilince kalıcı çerez verilmedi');
const s5 = (await apiCall(D5.p, 'me.sessions')).items.find((x) => x.current);
if (s5.idle_min !== 0) fail('“açık kalsın” oturumunda boşta kapanma var');
const r = await apiCall(E.p, 'me.sessions.revoke', { others: true });
if (!(r.closed >= 1)) fail('diğer cihazlardan çıkış: ' + JSON.stringify(r)); // (bilgisayar2 boşta kalma denemesinde zaten kapanmıştı)
if ((await apiErr(D5.p, 'counts')) === 'kabul' || (await apiErr(D2.p, 'counts')) === 'kabul') fail('diğer cihazlar açık kaldı');
if ((await apiErr(E.p, 'counts')) !== 'kabul') fail('“diğer cihazlar” derken bu cihaz da kapandı');
step('“bu bilgisayarda açık kalsın”: kalıcı çerez ve boşta kapanma yok; “diğer tüm cihazlardan çıkış” bu cihazı bırakıp hepsini kapattı');

// ---- 5) Başka birimden (çok birimli yapı): Kerem (Acil Servis) onaylar → bilgisayar Acil Servis'e girer ----
const multi = php('echo nm_multi() ? 1 : 0;').trim() === '1';
if (multi) {
  const K = await ctx('kerem-tel', true); await login(K.p, 'kerem@test.com', 'KeremSifre123');
  const D6 = await ctx('bilgisayar6');
  const tok6 = await desktopQr(D6, false);
  await apiCall(K.p, 'qr.approve', { token: tok6, ok: true, code: qcode(tok6) });
  await isIn(D6, 'Kerem Acar');
  const unit = await D6.p.evaluate(() => S.settings.org_name);
  if (!/Acil/.test(unit)) fail('bilgisayar Kerem’in birimine girmedi: ' + unit);
  step('çok birimli: Acil Servis’teki kişi onaylayınca bilgisayar doğrudan o birime girdi (giriş ekranı birim bilmiyordu)');
}

// ---- 6) Uygulama içi okuyucu: karekod gerçekten çözülüyor (jsQR) ----
const dec = await E.p.evaluate(async () => {
  await loadVendor('qrcode'); await loadVendor('jsqr');
  const url = location.origin + '/#/qr/Ab12-Cd34_Ef56Gh78Ij90Kl12';
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(url, 300));
  await img.decode();
  const c = document.createElement('canvas'); c.width = 300; c.height = 300; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const r = window.jsQR(x.getImageData(0, 0, 300, 300).data, 300, 300);
  return { want: url, got: r && r.data };
});
if (dec.got !== dec.want) fail('karekod çözülemedi: ' + JSON.stringify(dec));
await E.p.goto(BASE + '#/profil/guvenlik');
await E.p.locator('[data-act=qr-scan]').first().waitFor();
step('uygulama içi okuyucu: Güvenlik’te “QR kodu okut”; karekod jsQR ile çözüldü (BarcodeDetector olmayan iPhone’da da çalışır)');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nQR GİRİŞ TESTLERİ GEÇTİ');
