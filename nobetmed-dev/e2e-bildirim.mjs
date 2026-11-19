// Bildirim sistemi (4.7) — uydurma verilerle.
// e2e-mesaj.mjs SONRASI aynı sitede çalışır. Sunucu birden çok işçiyle başlatılmalı (birimler arası anında tetik kendi sitesine istek atar):
//   PHP_CLI_SERVER_WORKERS=4 php -S localhost:8240 -t <site>
//   node e2e-bildirim.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-bildirim.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
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
const live = (p) => p.waitForFunction(() => typeof NB !== 'undefined' && !!NB.since, null, { timeout: 15000 });

// ---- Sahte push servisi (şifreli içeriği kaydeder) ----
const FP = 8078;
const FLOG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nm-fp-')), 'log.json');
const fp = spawn('php', ['-S', '127.0.0.1:' + FP, path.join(HERE, 'push-test/fake-push.php')], { env: { ...process.env, FAKE_PUSH_LOG: FLOG }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { if (await fetch(`http://127.0.0.1:${FP}/`).then(() => true, () => false)) break; await sleep(100); }
const fpLog = () => { try { return JSON.parse(fs.readFileSync(FLOG, 'utf8')); } catch (e) { return []; } };
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const expand = (prk, info, len) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len);
/** Tarayıcının yaptığı gibi RFC 8291 içeriğini çözer */
function decrypt(dev, auth, b64) {
  const body = Buffer.from(b64, 'base64');
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPub = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  const prk = hmac(salt, expand(hmac(auth, dev.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), dev.getPublicKey(), asPub]), 32));
  const d = crypto.createDecipheriv('aes-128-gcm', expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16), expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.length - 1).toString('utf8'));
}
async function nextPush(pathName, after, timeout = 10000) {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    const e = fpLog().filter((x) => x.path === pathName).slice(after);
    if (e.length) return e[0];
    await sleep(200);
  }
  return null;
}

try {
  const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
  const B = await ctx('burak'); await login(B.p, 'burak@test.com', 'Sifre1234');
  const A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const N = await ctx('nil'); await login(N.p, 'nil@test.com', 'NilSifre1234');
  await E.p.goto(BASE + '#/'); await B.p.goto(BASE + '#/'); await N.p.goto(BASE + '#/');
  await live(E.p); await live(B.p); await live(N.p);

  // ---- 1) Canlı bildirim: sayfa yenilenmeden ekranda kart ----
  const pB = (await apiCall(E.p, 'chat.people')).people.find((p) => p.name === 'Burak Demir');
  const dm = await apiCall(E.p, 'chat.direct', { tk: pB.tk, uid: pB.uid });
  const t0 = Date.now();
  await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Canlı bildirim denemesi: yarın 08:00 devir' });
  const card = B.p.locator('.nbc', { hasText: 'Canlı bildirim denemesi' });
  await card.waitFor({ timeout: 15000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!(await card.locator('.nbc-t', { hasText: 'Elif Yılmaz' }).count())) fail('kartta gönderen adı yok');
  if (!(await card.locator('.nbc-top img').count())) fail('kartta site simgesi yok');
  if (!/^\(\d+\)/.test(await B.p.title())) fail('sekme başlığında okunmamış sayısı yok: ' + (await B.p.title()));
  if (!(await B.p.locator('#chatCount:not(.hidden)').count())) fail('mesaj simgesinde sayı görünmüyor');
  await B.p.screenshot({ path: path.join(OUT, 'n-kart-desktop.png') });
  // Hızlı yanıt (karttan)
  await card.locator('[data-k=reply]').click();
  await card.locator('.nbc-reply input').fill('Tamam, karttan yanıtlıyorum');
  await card.locator('.nbc-reply input').press('Enter');
  await expectText(B.p, 'Yanıt gönderildi');
  // Elif telefonda: yanıt kartı
  const eCard = E.p.locator('.nbc', { hasText: 'karttan yanıtlıyorum' });
  await eCard.waitFor({ timeout: 15000 }).catch(() => fail('telefonda yanıt kartı görünmedi'));
  await E.p.waitForTimeout(400);
  await E.p.screenshot({ path: path.join(OUT, 'n-kart-mobile.png') });
  await noOverflow(E.p, 'bildirim kartı');
  if (!(await apiCall(E.p, 'chat.open', { id: dm.id })).msgs.some((m) => m.body === 'Tamam, karttan yanıtlıyorum')) fail('karttan yanıt sohbete düşmedi');
  step(`canlı bildirim: mesaj ${secs} sn içinde sayfa yenilenmeden kart olarak çıktı (gönderen, site simgesi, başlıkta ve mesaj simgesinde sayı); karttan hızlı yanıt; telefonda kart`);

  // ---- 2) Kategori: ekranda kart kapalı / zorunlu ----
  await apiCall(B.p, 'notif.prefs.save', { cats: { sistem: { pop: false } } });
  await B.p.evaluate(() => { S.me.notif.cats.sistem.pop = 0; });
  const u0 = await B.p.evaluate(() => S.counts.notif_unread);
  await apiCall(B.p, 'push.test');
  await B.p.waitForFunction((u) => S.counts.notif_unread > u, u0, { timeout: 15000 });
  if (await B.p.locator('.nbc', { hasText: 'Bildirimler çalışıyor' }).count()) fail('ekranda kartı kapalı kategoride kart çıktı');
  await apiCall(B.p, 'notif.prefs.save', { cats: { sistem: { pop: true } } });
  await B.p.evaluate(() => { S.me.notif.cats.sistem.pop = 1; });
  if (!/zorunlu/.test(await apiErr(B.p, 'notif.prefs.save', { cats: { eksik: { push: false } } }))) fail('zorunlu kategori kapatılabildi');
  step('kategori: “ekranda” kapalıyken kart çıkmadı ama zil sayısı arttı; zorunlu kategori (eksik personel) kapatılamıyor');

  // ---- 3) Telefon bildirimi: uçtan uca şifreli içerik ----
  const dev = crypto.createECDH('prime256v1'); dev.generateKeys();
  const auth = crypto.randomBytes(16);
  const EP = '/push/burak1';
  await apiCall(B.p, 'push.subscribe', { endpoint: `http://127.0.0.1:${FP}${EP}`, p256dh: b64u(dev.getPublicKey()), auth: b64u(auth), app: true });
  let n0 = fpLog().filter((x) => x.path === EP).length;
  await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Şifreli bildirim: ilaç odası anahtarı bende' });
  let ent = await nextPush(EP, n0);
  if (!ent) fail('telefon bildirimi gönderilmedi');
  else {
    const pl = decrypt(dev, auth, ent.body_b64);
    const it = pl.items[0];
    if (ent.encoding !== 'aes128gcm' || ent.status !== 201) fail('şifreli gövde başlığı: ' + JSON.stringify({ e: ent.encoding, s: ent.status }));
    if (it.title !== 'Elif Yılmaz' || !/ilaç odası/.test(it.body) || it.cat !== 'mesaj' || it.url !== '#/mesaj/' + dm.id || it.tag !== 'c' + dm.id) fail('çözülen içerik: ' + JSON.stringify(it));
    if (!/^http:\/\/.+(icon-192\.png|f=icon192)/.test(pl.icon) || !(pl.unread >= 1) || pl.silent !== 0) fail('simge/sayı/sessiz: ' + JSON.stringify({ icon: pl.icon, u: pl.unread, s: pl.silent }));
    if (pl.items.length === 1 && ent.topic !== 'c' + dm.id) fail('Topic başlığı (aynı sohbetin bekleyen bildirimi birleşir): ' + ent.topic);
    if (Buffer.from(ent.body_b64, 'base64').includes(Buffer.from('ilaç'))) fail('gövdede düz metin var');
  }
  // İçerik gizleme (yönetici politikası, KVKK)
  await apiCall(A.p, 'notif.policy.save', { hide_preview: true });
  n0 = fpLog().filter((x) => x.path === EP).length;
  await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Hasta yatak 4 kontrol' });
  ent = await nextPush(EP, n0);
  const hid = ent && decrypt(dev, auth, ent.body_b64).items[0];
  if (!hid || hid.body !== 'Yeni mesaj' || /Elif|yatak/.test(hid.title + hid.body)) fail('içerik gizleme: ' + JSON.stringify(hid));
  if ((await apiCall(B.p, 'notif.prefs.get')).prefs.preview !== 0) fail('politika kişinin önizleme ayarına yansımadı');
  await apiCall(A.p, 'notif.policy.save', { hide_preview: false });
  // Sessiz saatler: şu an sessiz aralıkta → sessiz bildirim
  // Sunucu saatine göre (saat dilimi Türkiye): şimdiden 1 saat önce → 1 saat sonra
  const srvH = +(await apiCall(B.p, 'live', {})).now.slice(11, 13);
  const hh = (h) => String((h + 24) % 24).padStart(2, '0') + ':00';
  await apiCall(B.p, 'notif.prefs.save', { quiet: { on: true, from: hh(srvH - 1), to: hh(srvH + 1) } });
  n0 = fpLog().filter((x) => x.path === EP).length;
  await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Gece mesajı' });
  ent = await nextPush(EP, n0);
  if (!ent || decrypt(dev, auth, ent.body_b64).silent !== 1) fail('sessiz saatte bildirim sessiz gitmedi');
  await apiCall(B.p, 'notif.prefs.save', { quiet: { on: false } });
  // Duraklatma ve kategori kapalı: telefona gitmez
  await apiCall(B.p, 'notif.prefs.save', { pause: '1h' });
  n0 = fpLog().filter((x) => x.path === EP).length;
  await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Duraklatılmışken' });
  if (await nextPush(EP, n0, 3500)) fail('duraklatılmışken telefon bildirimi gitti');
  await apiCall(B.p, 'notif.prefs.save', { pause: '', cats: { mesaj: { push: false } } });
  await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Kategori kapalıyken' });
  if (await nextPush(EP, n0, 3500)) fail('kategori kapalıyken telefon bildirimi gitti');
  await apiCall(B.p, 'notif.prefs.save', { cats: { mesaj: { push: true } } });
  // Cihazlarım: ad, tek cihaza deneme, kaldırma
  const devs = (await apiCall(B.p, 'notif.devices', {})).items;
  const myDev = devs.find((d) => /Uygulama \(ana ekran\)/.test(d.label));
  if (!myDev) fail('cihaz adı: ' + JSON.stringify(devs));
  n0 = fpLog().filter((x) => x.path === EP).length;
  await apiCall(B.p, 'notif.device.test', { id: myDev.id });
  ent = await nextPush(EP, n0, 4000);
  if (!ent || !/çalışıyor/.test(decrypt(dev, auth, ent.body_b64).items[0].title)) fail('tek cihaza deneme bildirimi');
  if ((await apiErr(A.p, 'notif.device.del', { id: myDev.id })) !== 'kabul' || !(await apiCall(B.p, 'notif.devices', {})).items.length) fail('başkasının cihazı silinebildi');
  // SW uçları: X-NM-SW başlığı olmadan çalışmaz; "Okundu say" düğmesi
  const sw = await B.p.evaluate(async () => {
    const bad = (await fetch('api.php?action=push.pending')).status;
    const pend = await (await fetch('api.php?action=push.pending', { headers: { 'X-NM-SW': '1' } })).json();
    const nid = (await api('notif.list', { unread: true })).items[0];
    const rd = await (await fetch('api.php?action=push.read&id=' + nid.id, { headers: { 'X-NM-SW': '1' } })).json();
    const after = (await api('notif.list', {})).items.find((x) => x.id === nid.id);
    return { bad, pend: pend.ok && Array.isArray(pend.items), unread: rd.unread, read: after && after.read };
  });
  if (sw.bad !== 400 || !sw.pend || !sw.read || typeof sw.unread !== 'number') fail('SW uçları: ' + JSON.stringify(sw));
  await apiCall(B.p, 'notif.device.del', { id: myDev.id });
  if ((await apiCall(B.p, 'notif.devices', {})).items.length) fail('cihaz kaldırılamadı');
  step('telefon bildirimi: içerik uçtan uca şifreli (çözüldü: gönderen, metin, sohbet adresi, site simgesi, okunmamış sayısı; gövdede düz metin yok), KVKK içerik gizleme, sessiz saat, duraklatma, kategori kapalı, cihaz adı, tek cihaza deneme, “Okundu say”');

  // ---- 4) Birimler arası anında bildirim (zamanlanmış görev beklenmeden) ----
  const g2 = (await apiCall(A.p, 'chat.list')).items.find((c) => c.name === 'Eğitim komisyonu 2026');
  if (!g2) fail('ortak grup bulunamadı');
  else {
    const tk0 = Date.now();
    await apiCall(A.p, 'chat.send', { id: g2.id, body: 'Birimler arası anında bildirim' });
    const nCard = N.p.locator('.nbc', { hasText: 'Eğitim komisyonu 2026' });
    await nCard.waitFor({ timeout: 20000 }).then(() => step(`birimler arası: Dahiliye’deki üyeye ${((Date.now() - tk0) / 1000).toFixed(1)} sn içinde kart (zamanlanmış görev beklenmedi)`), () => fail('diğer birimdeki üyeye anında bildirim gitmedi'));
  }

  // ---- 5) Bildirim merkezi sayfası ----
  await B.p.click('[data-act=notifs]');
  await B.p.locator('.notif-pop .np-foot').click();
  await B.p.waitForFunction(() => location.hash === '#/bildirimler');
  await B.p.locator('.nbl-row').first().waitFor();
  await B.p.locator('[data-act=nbl-f][data-f=mesaj]').click();
  await B.p.waitForFunction(() => document.querySelectorAll('.nbl-row').length > 0 && [...document.querySelectorAll('.nbl-row .tiny')].every((x) => x.textContent.startsWith('Mesaj')));
  const rows0 = await B.p.locator('.nbl-row').count();
  await B.p.locator('.nbl-row [data-act=nbl-del]').first().click();
  await B.p.waitForFunction((n) => document.querySelectorAll('.nbl-row').length === n - 1, rows0);
  await B.p.locator('[data-act=nbl-readall]').click();
  await B.p.waitForFunction(() => !document.querySelector('.nbl-row.unread') && document.querySelectorAll('.nbl-row').length > 0);
  await B.p.screenshot({ path: path.join(OUT, 'n-merkez-desktop.png') });
  step('bildirim merkezi: zilden “Tüm bildirimler”, kategori süzgeci, tek silme, tümünü okundu say');

  // ---- 6) Kişisel ayarlar ekranı ----
  await B.p.goto(BASE + '#/profil/bildirim');
  await B.p.locator('.nb-cats').waitFor();
  if (!(await B.p.locator('input[data-k=eksik][data-f=push]').isDisabled())) fail('zorunlu kategori ayar ekranında kapatılabilir görünüyor');
  await B.p.locator('input[data-k=duyuru][data-f=push]').locator('..').click();
  await B.p.waitForFunction(async () => (await api('notif.prefs.get')).prefs.cats.duyuru.push === 0);
  await B.p.locator('[data-act=nb-pause][data-v="8h"]').click();
  await expectText(B.p, 'saatine kadar bildirimler duraklatıldı');
  await B.p.screenshot({ path: path.join(OUT, 'n-ayar-desktop.png'), fullPage: true });
  await B.p.locator('[data-act=nb-pause][data-v=""]').click();
  await B.p.locator('[data-act=nb-pause][data-v="1h"]').waitFor();
  await apiCall(B.p, 'notif.prefs.save', { cats: { duyuru: { push: true } } });
  await E.p.goto(BASE + '#/profil/bildirim');
  await E.p.locator('.nb-cats').waitFor();
  await E.p.screenshot({ path: path.join(OUT, 'n-ayar-mobile.png'), fullPage: true });
  await noOverflow(E.p, 'bildirim ayarları');
  step('kişisel ayarlar: bu cihaz (önizleme, aç/kapat, yükle, sesi dene), duraklat (8 saat / devam), kategori tablosu (zorunlu kilitli), sessiz saatler, görünüm ve gizlilik, cihazlarım; telefonda taşma yok');

  // ---- 7) Yönetici: bildirim politikası ----
  await A.p.goto(BASE + '#/yonetim/ayarlar/bildirim');
  await A.p.locator('#nbPolicy .nb-stat').waitFor();
  await A.p.locator('#nbPolicy input[data-pol=hide_preview]').locator('..').click();
  await A.p.locator('#nbPolicy input[data-pol=locked][data-k=mesaj]').locator('..').click();
  await A.p.click('[data-act=nbp-save]');
  await expectText(A.p, 'Bildirim politikası kaydedildi');
  const pol = (await apiCall(A.p, 'notif.policy.get')).policy;
  if (!pol.hide_preview || !pol.locked.includes('mesaj') || !pol.locked.includes('eksik')) fail('politika kaydı: ' + JSON.stringify(pol));
  await A.p.locator('#nbPolicy .nb-stat').waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'n-politika-desktop.png') });
  if (!/zorunlu/.test(await apiErr(B.p, 'notif.prefs.save', { cats: { mesaj: { push: false } } }))) fail('yöneticinin zorunlu tuttuğu mesaj bildirimi kapatıldı');
  if ((await apiErr(B.p, 'notif.policy.save', { hide_preview: false })) === 'kabul') fail('üye politika değiştirdi');
  await apiCall(A.p, 'notif.policy.save', { hide_preview: false, locked: ['eksik'] });
  step('yönetici politikası: istatistik (kimde açık), içerik gizleme ve zorunlu kategori arayüzden kaydedildi, kişiye yansıdı; üye değiştiremiyor');
} finally {
  try { fp.kill(); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nBİLDİRİM TESTLERİ GEÇTİ');
