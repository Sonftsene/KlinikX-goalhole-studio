// Modüller ve yetkiler (4.1) testi — uydurma verilerle.
// e2e.mjs, e2e-features.mjs ve e2e-tenant.mjs'den SONRA aynı sitede çalışır (sistem yöneticisi hesabı orada açılır):
//   node e2e-yetki.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-yetki.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const noOverflow = async (p, tag) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) fail(`${tag}: telefonda yatay taşma ${w}px`); };
const rebootS = (p) => p.evaluate(async () => { const r = await api('boot'); S.mods = r.mods; S.perm = r.perm; S.roles = r.roles; if (typeof renderNav === 'function') renderNav(); return { mods: r.mods, perm: r.perm }; });

function totpAt(secret, st) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret) bits += abc.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeUInt32BE(st, 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

// ---- 1) Rol: "Eksik sorumlusu" — eksik çağrısını yönetir, ilanları göremez ----
const A = await ctx('ayse');
await login(A.p, 'ayse@test.com', 'Sifre1234');
await A.p.goto(BASE + '#/yonetim/ayarlar');
await A.p.click('[data-act=set-sec][data-s=guvenlik]').catch(() => {});
await A.p.locator('#rolesCard').waitFor();
await A.p.click('[data-act=role-new]');
await A.p.fill('#roleF [name=name]', 'Eksik sorumlusu');
await A.p.click('.role-seg[data-k=eksik] button[data-v=manage]');
await A.p.click('.role-seg[data-k=ilan] button[data-v=off]');
await A.p.click('.modal button[form=roleF]');
await expectText(A.p, 'Rol eklendi');
await A.p.locator('#rolesBox .list-row', { hasText: 'Eksik sorumlusu' }).waitFor();
const roles = (await apiCall(A.p, 'roles.list')).roles;
const role = roles.find((r) => r.name === 'Eksik sorumlusu');
if (!role || role.perms.eksik !== 'manage' || role.perms.ilan !== 'off' || role.perms.nobet !== 'use') fail('rol kaydı: ' + JSON.stringify(role));
const M = await ctx('elif', true);
await login(M.p, 'elif@test.com', 'YeniSifre99');
if ((await apiErr(M.p, 'roles.save', { name: 'Kendime', perms: { eksik: 'manage' } })) === 'kabul') fail('üye rol tanımlayabildi');
if ((await apiErr(M.p, 'roles.assign', { user_id: 1, role_id: role.id })) === 'kabul') fail('üye rol atayabildi');
const elif = (await apiCall(A.p, 'admin.users')).users.find((u) => u.email === 'elif@test.com');
// Kullanıcı formundan rol ver (arayüz)
await A.p.goto(BASE + '#/yonetim/kullanicilar');
await A.p.evaluate(() => { const r = api('boot'); return r; });
await A.p.reload();
await A.p.waitForFunction(() => typeof S !== 'undefined' && S.roles && S.roles.length);
await A.p.evaluate((id) => userModal(AD.users.find((u) => u.id === id)), elif.id).catch(async () => { await apiCall(A.p, 'roles.assign', { user_id: elif.id, role_id: role.id }); });
if (await A.p.locator('#userForm [name=role_id]').count()) {
  await A.p.selectOption('#userForm [name=role_id]', String(role.id));
  await A.p.click('.modal button[form=userForm]');
  await expectText(A.p, 'Kullanıcı güncellendi');
}
const elif2 = (await apiCall(A.p, 'admin.users')).users.find((u) => u.email === 'elif@test.com');
if (elif2.role_id !== role.id || elif2.role !== 'member') fail('rol atanmadı: ' + JSON.stringify(elif2));
step('rol: Ayarlar › Güvenlik’ten “Eksik sorumlusu” (eksik: Yönetir, ilan: Göremez), kullanıcı formundan Elif’e verildi; üye rol tanımlayamıyor/atayamıyor');

// ---- 2) Rolün etkisi: arayüz + sunucu ----
await M.p.reload();
await M.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.perm);
const mp = await M.p.evaluate(() => ({ perm: S.perm, nav: [...document.querySelectorAll('#sidebar a, #sidebar .nav-item, #sidebar [href]')].map((a) => a.getAttribute('href')).filter(Boolean) }));
if (mp.perm.eksik !== 'manage' || mp.perm.ilan !== 'off' || mp.perm.nobet !== 'use') fail('Elif yetkileri: ' + JSON.stringify(mp.perm));
if (!mp.nav.includes('#/eksik')) fail('Elif’in menüsünde Eksik personel yok');
const co = await apiCall(M.p, 'callout.list');
if (!co.pub) fail('Elif eksik çağrılarını yönetici görünümünde görmüyor');
const meta = await apiErr(M.p, 'callout.meta');
if (meta !== 'kabul') fail('Elif çağrı açamıyor: ' + meta);
if (!/yetkiniz yok/.test(await apiErr(M.p, 'listing.list'))) fail('ilan modülü Elif’e sunucuda kapanmadı');
if ((await apiErr(M.p, 'history.list', {})) === 'kabul') fail('Elif değişim geçmişini görebildi (rolü kullanır)');
await M.p.goto(BASE + '#/ilanlar');
await M.p.waitForFunction(() => location.hash === '#/' || location.hash === '');
await M.p.goto(BASE + '#/nobetim');
await M.p.locator('.hub-tabs').waitFor();
if (await M.p.locator('.hub-tabs a[href="#/ilanlar"]').count()) fail('ilanlar sekmesi Elif’e görünüyor');
await M.p.goto(BASE + '#/eksik');
await M.p.locator('[data-act=co-new]').waitFor();
await M.p.screenshot({ path: path.join(OUT, 'y-eksik-sorumlusu-mobile.png') });
await noOverflow(M.p, 'eksik (rol)');
step('rol etkisi: Elif eksik çağrılarını yönetiyor (Yeni çağrı, yönetici görünümü, menüde), ilanlar sunucuda “yetkiniz yok”, sayfa açılmıyor, sekme gizli; geçmiş kapalı');

// ---- 3) Sistem yöneticisi: modül kapatma (hastane → birim devralma) ----
const sa = JSON.parse(execFileSync('php', ['-r', `define('NM_ROOT_X', 1); require '${path.join(SITE, 'inc/bootstrap.php')}'; $u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); $t = nm_tenant_default(); $u['tid'] = (int)$t['id']; $u['hid'] = (int)$t['hospital_id']; echo json_encode($u);`], { encoding: 'utf8' }));
const SA = await ctx('sistem');
await SA.p.goto(BASE);
await apiCall(SA.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await new Promise((r) => setTimeout(r, 1000));
await apiCall(SA.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
await SA.p.reload();
await SA.p.locator('.sys-t').first().waitFor();
// Hastane geneli: istekler + rehber kapalı; birim: rehber açık (üstüne yazar)
await apiCall(SA.p, 'sa.modules.save', { kind: 'hospital', id: sa.hid, modules: { istekler: 'off', rehber: 'off' } });
await SA.p.locator('.sys-t', { hasText: 'ilk kurulum' }).locator('[data-act=sys-t-menu]').click();
await SA.p.locator('.modal [data-i]', { hasText: 'Modüller (bu birim)' }).click();
await SA.p.locator('.role-seg[data-k=rehber]').waitFor();
if (!(await SA.p.locator('.role-seg[data-k=istekler] button.on[data-v=inherit]').count())) fail('birim modülleri varsayılan “Hastaneye uy” değil');
await SA.p.click('.role-seg[data-k=rehber] button[data-v=on]');
await SA.p.click('#sysModSave');
await expectText(SA.p, 'Modüller kaydedildi');
await SA.p.click('[data-act=sys-tab][data-t=gunluk]');
await expectText(SA.p, 'Modüller değişti');
const am = await rebootS(A.p);
if (am.mods.istekler !== false || am.mods.rehber !== true || am.mods.nobet !== true) fail('devralma: ' + JSON.stringify(am.mods));
if (am.perm.istekler !== 'off') fail('kapalı modülde yönetici yetkisi: ' + am.perm.istekler);
if (!/kapalı/.test(await apiErr(A.p, 'req.mine'))) fail('istekler kapalıyken sunucu yanıt verdi');
await A.p.goto(BASE + '#/istekler');
await A.p.waitForFunction(() => location.hash === '#/' || location.hash === '');
await A.p.goto(BASE + '#/nobetim');
await A.p.locator('.hub-tabs').waitFor();
if (await A.p.locator('.hub-tabs a[href="#/istekler"]').count()) fail('kapalı modülün sekmesi görünüyor');
if (!(await A.p.locator('#sidebar [href="#/telefon"]').count())) fail('birimde açılan rehber menüde yok');
// Nöbet listeleri kapanınca bağlı modüller de kapanır
await apiCall(SA.p, 'sa.modules.save', { kind: 'tenant', id: sa.tid, modules: { nobet: 'off' } });
const am2 = await rebootS(A.p);
if (am2.mods.taraf !== false || am2.mods.eksik !== false || am2.mods.ilan !== false) fail('bağlı modüller kapanmadı: ' + JSON.stringify(am2.mods));
await A.p.goto(BASE + '#/');
await A.p.locator('#feedHost').waitFor();
if (await A.p.locator('#todayCard, #sidebar [href="#/nobetim"]').count()) fail('nöbet kapalıyken nöbet kartı/menüsü görünüyor');
if (!/kapalı/.test(await apiErr(A.p, 'rosters.list'))) fail('nöbet kapalıyken liste uçları açık');
if ((await apiErr(A.p, 'posts.list', {})) !== 'kabul') fail('çekirdek (duyurular) etkilendi');
// Cron kapalı modülde hata vermez
execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' });
step('modüller: hastanede istekler+rehber kapalı, birim rehberi açtı (devralma); kapalı modül menüden/sekmeden/rotadan ve sunucudan kalktı; nöbet kapanınca bağlı modüller de kapandı; duyurular etkilenmedi; günlüğe yazıldı');

// ---- 4) Geri aç: her şey eski hâline ----
await apiCall(SA.p, 'sa.modules.save', { kind: 'tenant', id: sa.tid, modules: { nobet: 'inherit', rehber: 'inherit' } });
await apiCall(SA.p, 'sa.modules.save', { kind: 'hospital', id: sa.hid, modules: { istekler: 'on', rehber: 'on' } });
const am3 = await rebootS(A.p);
if (Object.values(am3.mods).some((v) => !v)) fail('modüller geri açılmadı: ' + JSON.stringify(am3.mods));
// Rolü kaldır → Elif temel yetkiye döner
await A.p.goto(BASE + '#/yonetim/ayarlar');
await A.p.click('[data-act=set-sec][data-s=guvenlik]').catch(() => {});
await A.p.locator('#rolesBox .list-row', { hasText: 'Eksik sorumlusu' }).locator('[data-act=role-remove]').click();
await A.p.locator('.modal [data-ok]').last().click();
await expectText(A.p, 'Rol kaldırıldı');
const ep = (await rebootS(M.p)).perm;
if (ep.eksik !== 'use' || ep.ilan !== 'use') fail('rol kaldırılınca temel yetkiye dönmedi: ' + JSON.stringify(ep));
await A.p.screenshot({ path: path.join(OUT, 'y-roller-desktop.png'), fullPage: true });
step('geri alma: modüller açıldı; rol kaldırılınca Elif temel (üye) yetkisine döndü');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nMODÜL VE YETKİ TESTLERİ GEÇTİ');
