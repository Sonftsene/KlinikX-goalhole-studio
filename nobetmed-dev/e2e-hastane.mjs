// Hastane ortak alanları (4.2): ortak telefon rehberi ve hastane belgeleri — uydurma verilerle.
// e2e.mjs, e2e-features.mjs, e2e-tenant.mjs (ve isteğe bağlı e2e-yetki.mjs) SONRASI aynı sitede çalışır:
//   node e2e-hastane.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-hastane.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
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
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' });
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

// ---- 0) Sistem yöneticisi: ilk birimin hastanesine ikinci birim (Dahiliye) + yönetici ----
const sa = JSON.parse(execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; $u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); $t = nm_tenant_default(); $u['hid'] = (int)$t['hospital_id']; echo json_encode($u);`], { encoding: 'utf8' }));
const SA = await ctx('sistem');
await SA.p.goto(BASE);
await apiCall(SA.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await new Promise((r) => setTimeout(r, 1000));
await apiCall(SA.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
const tC = await apiCall(SA.p, 'sa.tenant.save', { hospital_id: sa.hid, name: 'Dahiliye' });
const adm = await apiCall(SA.p, 'sa.tenant.admin', { key: tC.key, name: 'Nil Er', email: 'nil@test.com' });
cron(); // yeni birimin ilk görevi: eski hastane belgeleri bildirilmez, bundan sonrakiler bildirilir
const N = await ctx('nil', true);
await login(N.p, 'nil@test.com', adm.password);
await apiCall(N.p, 'me.password', { password: 'NilSifre1234' });
await N.p.reload();
await N.p.waitForFunction(() => typeof S !== 'undefined' && S.me && !S.me.must_change);
if (!(await N.p.evaluate(() => S.hosp && S.hosp.name))) fail('aynı hastanenin ikinci biriminde hastane bilgisi yok');
step(`aynı hastaneye ikinci birim (Dahiliye) ve yöneticisi açıldı; hastane: ${await N.p.evaluate(() => S.hosp.name)}`);

// ---- 1) Ortak telefon rehberi ----
const A = await ctx('ayse');
await login(A.p, 'ayse@test.com', 'Sifre1234');
await A.p.goto(BASE + '#/telefon');
await A.p.locator('#pbList').waitFor();
await A.p.click('[data-act=pb-add]');
await A.p.fill('.modal [name=name]', 'Kan merkezi');
await A.p.fill('.modal [name=number]', '2315');
await A.p.fill('.modal [name=category]', 'Laboratuvar');
if (!(await A.p.locator('.modal [data-act=pb-scope][data-v=hastane].on').count())) fail('yeni numara varsayılan olarak hastane rehberine gitmiyor');
await A.p.click('.modal button[type=submit]');
await expectText(A.p, 'Kaydedildi');
await A.p.click('[data-act=pb-add]');
await A.p.fill('.modal [name=name]', 'Sorumlu odası');
await A.p.fill('.modal [name=number]', '2201');
await A.p.click('.modal [data-act=pb-scope][data-v=birim]');
await A.p.click('.modal button[type=submit]');
await expectText(A.p, 'Kaydedildi');
const nPb = (await apiCall(N.p, 'phonebook.list')).items;
const kan = nPb.find((x) => x.name === 'Kan merkezi' && x.number === '2315');
if (!kan || kan.scope !== 'hastane' || kan.own || kan.id >= 0) fail('Dahiliye hastane numarasını görmüyor / yanlış: ' + JSON.stringify(kan));
if (nPb.some((x) => x.name === 'Sorumlu odası')) fail('birime özel numara diğer birime gitti');
if (!/yalnız o birim/.test(await apiErr(N.p, 'phonebook.save', { id: kan.id, name: 'Değişti', number: '1' }))) fail('başka birimin hastane numarası düzenlenebildi');
if (!/yalnız o birim/.test(await apiErr(N.p, 'phonebook.delete', { id: kan.id }))) fail('başka birimin hastane numarası silinebildi');
await apiCall(N.p, 'phonebook.save', { name: 'Dahiliye sekreter', number: '3401', scope: 'hastane' });
const aPb = (await apiCall(A.p, 'phonebook.list')).items;
if (!aPb.some((x) => x.name === 'Dahiliye sekreter' && x.unit === 'Dahiliye' && !x.own)) fail('Dahiliye’nin numarası ilk birimde görünmüyor');
const K = await ctx('kerem');
await login(K.p, 'kerem@test.com', 'KeremSifre123');
const kPb = (await apiCall(K.p, 'phonebook.list')).items;
if (kPb.some((x) => /Kan merkezi|Dahiliye sekreter/.test(x.name)) || (await apiCall(K.p, 'phonebook.list')).hospital === (await apiCall(A.p, 'phonebook.list')).hospital) fail('başka hastane ortak rehberi gördü');
// Satırda düzenleme düğmesi yalnız kendi numarasında
await N.p.goto(BASE + '#/telefon');
await N.p.locator(`.pb-row[data-id="${kan.id}"]`).first().waitFor();
if (await N.p.locator(`.pb-row[data-id="${kan.id}"] [data-act=pb-edit]`).count()) fail('başka birimin numarasında düzenle düğmesi var');
await N.p.screenshot({ path: path.join(OUT, 'h-rehber-mobile.png'), fullPage: true });
await noOverflow(N.p, 'rehber');
// Yönetici: birim numaralarını hastaneye taşı
const before = aPb.filter((x) => x.scope === 'birim').length;
const sh = await apiCall(A.p, 'phonebook.share');
if (sh.items.some((x) => x.scope === 'birim') || !before) fail('birim numaraları taşınmadı: ' + before);
if (!(await apiCall(N.p, 'phonebook.list')).items.some((x) => x.name === 'Sorumlu odası')) fail('taşınan numara diğer birimde görünmüyor');
step(`ortak rehber: “Kan merkezi” tüm hastanede, “Sorumlu odası” yalnız birimde; Dahiliye görüyor ama düzenleyemiyor/silemiyor; Dahiliye’nin numarası ilk birimde; başka hastane göremiyor; ${before} birim numarası tek tuşla hastaneye taşındı`);

// ---- 2) Hastane belgeleri ----
await A.p.goto(BASE + '#/hastane');
await A.p.locator('[data-act=hd-new]').click();
await A.p.fill('#hdF [name=title]', 'Çift kontrol protokolü (hastane geneli)');
await A.p.selectOption('#hdF [name=kind]', 'protokol');
await A.p.fill('#hdF [name=body]', 'Yüksek riskli ilaçlarda iki hemşire kontrolü zorunludur.');
await A.p.click('#hdF label.switch:has([name=ack])');
await A.p.setInputFiles('#hdFiles', path.join(HERE, 'fixtures/cift-kontrol-protokolu.pdf'));
await A.p.click('.modal button[form=hdF]');
await expectText(A.p, 'Belge yayımlandı');
await A.p.locator('#hdTitle', { hasText: 'Çift kontrol' }).waitFor();
const docId = +(await A.p.evaluate(() => location.hash.split('/')[2]));
const doc = (await apiCall(A.p, 'hdoc.get', { id: docId })).doc;
if (doc.attachments.length !== 1 || !doc.own || !doc.ack) fail('belge kaydı: ' + JSON.stringify(doc));
// Dosya birimin yükleme klasöründen hastane klasörüne taşındı
const hfile = BASE + doc.attachments[0].url;
// Dahiliye: listede okunmamış, açınca okundu, dosya açılıyor, onay veriyor; düzenleyemiyor
cron();
const nNotif = (await apiCall(N.p, 'notif.list')).items.find((x) => /Hastane belgesi/.test(x.title));
if (!nNotif) fail('diğer birime yeni hastane belgesi bildirimi gitmedi');
const nl = (await apiCall(N.p, 'hdoc.list')).items;
if (!nl.some((d) => d.id === docId && !d.read && !d.own && d.unit)) fail('Dahiliye belgeyi görmüyor: ' + JSON.stringify(nl));
await N.p.goto(BASE + '#/hastane/' + docId);
await N.p.locator('[data-act=hd-ack]').waitFor();
if (await N.p.locator('[data-act=hd-edit], [data-act=hd-remove]').count()) fail('başka birimde düzenle/kaldır düğmesi var');
const nStatus = await N.p.evaluate(async (u) => (await fetch(u)).status, hfile);
if (nStatus !== 200) fail('aynı hastanenin birimi eki açamadı: ' + nStatus);
await N.p.click('[data-act=hd-view]');
await N.p.locator('.modal .hd-prev canvas, .modal .hd-prev .pdf-page, .modal .hd-prev iframe').first().waitFor({ timeout: 15000 }).catch(() => fail('PDF önizlemesi açılmadı'));
await N.p.keyboard.press('Escape');
await N.p.click('[data-act=hd-ack]');
await expectText(N.p, 'Okuduğunuzu onayladınız');
await N.p.screenshot({ path: path.join(OUT, 'h-belge-mobile.png'), fullPage: true });
await noOverflow(N.p, 'hastane belgesi');
if (!/yalnız o birim/.test(await apiErr(N.p, 'hdoc.save', { id: docId, title: 'Değiştirildi' }))) fail('başka birim belgeyi düzenleyebildi');
if (!/yalnız yayımlayan/.test(await apiErr(N.p, 'hdoc.delete', { id: docId }))) fail('başka birim belgeyi silebildi');
// Başka hastane: liste boş, dosya 404
const kl = (await apiCall(K.p, 'hdoc.list')).items;
const kStatus = await K.p.evaluate(async (u) => (await fetch(u)).status, hfile);
if (kl.some((d) => d.id === docId) || kStatus !== 404) fail(`başka hastane belgeyi gördü (liste ${kl.length}, dosya ${kStatus})`);
// Oturumsuz dosya erişimi yok
const anon = await fetch(hfile);
if (anon.status !== 404) fail('oturumsuz hastane dosyası açıldı: ' + anon.status);
// Okuma raporu: kendi birimi adlarla, diğer birim yalnız sayı
const rep = await apiCall(A.p, 'hdoc.report', { id: docId });
if (!rep.people.some((p) => p.name === 'Ayşe Kaya' && p.read_at) || JSON.stringify(rep).includes('Nil') || !rep.units.some((u) => u.unit === 'Dahiliye' && u.read === 1 && u.acked === 1)) fail('okuma raporu: ' + JSON.stringify(rep));
await A.p.click('[data-act=hd-report]');
await expectText(A.p, 'Diğer birimler');
await A.p.screenshot({ path: path.join(OUT, 'h-rapor-desktop.png') });
step('hastane belgeleri: ilk birim PDF ekli protokol yayımladı (okudum onayı), Dahiliye’ye bildirim gitti, okudu/önizledi/onayladı, düzenleyemedi/silemedi; başka hastane ve oturumsuz erişim 404; raporda diğer birim yalnız sayı (ad yok)');

// ---- 3) Modül kapalıysa ----
await apiCall(SA.p, 'sa.modules.save', { kind: 'tenant', id: tC.id, modules: { hbelge: 'off' } });
if (!/kapalı/.test(await apiErr(N.p, 'hdoc.list'))) fail('hastane belgeleri kapalıyken liste açıldı');
const nOff = await N.p.evaluate(async (u) => (await fetch(u)).status, hfile);
if (nOff !== 404) fail('modül kapalıyken dosya açıldı: ' + nOff);
await apiCall(SA.p, 'sa.modules.save', { kind: 'tenant', id: tC.id, modules: { hbelge: 'inherit' } });
// Yayımlayan birim belgeyi kaldırır → herkesten kalkar, dosya silinir
await apiCall(A.p, 'hdoc.delete', { id: docId });
if ((await apiCall(N.p, 'hdoc.list')).items.some((d) => d.id === docId)) fail('silinen belge diğer birimde kaldı');
if (SITE && fs.readdirSync(path.join(SITE, 'uploads/h')).some((h) => fs.readdirSync(path.join(SITE, 'uploads/h', h)).length)) fail('silinen belgenin dosyası sunucuda kaldı');
step('modül kapalıyken belgeler ve dosyalar kapandı; belge kaldırılınca tüm birimlerden ve sunucudan silindi');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nHASTANE ORTAK ALANLARI TESTLERİ GEÇTİ');
