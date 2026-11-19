// Mesajlaşma 4.8 — uydurma verilerle. e2e-mesaj.mjs (ve e2e-bildirim.mjs) SONRASI aynı sitede çalışır.
// Sunucu birden çok işçiyle: PHP_CLI_SERVER_WORKERS=4 php -S localhost:8240 -t <site>
//   node e2e-mesaj2.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
// Arama testi gerçek WebRTC bağlantısıdır (Chromium sahte mikrofon/kamera ile, iki ayrı tarayıcı oturumu arasında).
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED|stun/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.grantPermissions(['microphone', 'camera', 'geolocation'], { origin: BASE.replace(/\/$/, '') });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-mesaj2.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const status = (p, u, h = {}) => p.evaluate(async ([x, hh]) => { const r = await fetch(x, { headers: hh }); return { s: r.status, cr: r.headers.get('Content-Range'), len: (await r.arrayBuffer()).byteLength }; }, [u, h]);
const noOverflow = async (p, tag) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) fail(`${tag}: telefonda yatay taşma ${w}px`); };
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; nm_tenant_use(nm_tenant_default()); require '${path.join(SITE, 'inc/mod_hastane.php')}'; ${code}`], { encoding: 'utf8' });
/** Dokunmatik: uzun bas ya da kaydır */
const touch = (p, sel, moves, holdMs) => p.evaluate(async ([s, mv, hold]) => {
  const el = document.querySelector(s); const r = el.getBoundingClientRect();
  const x0 = r.left + 30; const y0 = r.top + r.height / 2;
  const T = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [T(x0, y0)], changedTouches: [T(x0, y0)] }));
  for (const dx of mv) { await new Promise((z) => setTimeout(z, 20)); el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [T(x0 + dx, y0)], changedTouches: [T(x0 + dx, y0)] })); }
  await new Promise((z) => setTimeout(z, hold));
  const xe = x0 + (mv[mv.length - 1] || 0);
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [T(xe, y0)] }));
}, [sel, moves, holdMs]);

const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
const B = await ctx('burak'); await login(B.p, 'burak@test.com', 'Sifre1234');
const A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
const N = await ctx('nil'); await login(N.p, 'nil@test.com', 'NilSifre1234');
const K = await ctx('kerem'); await login(K.p, 'kerem@test.com', 'KeremSifre123');
const unitId = (await apiCall(E.p, 'chat.list')).items.find((c) => c.kind === 'unit').id;
const pB = (await apiCall(E.p, 'chat.people')).people.find((p) => p.name === 'Burak Demir');
const pE = (await apiCall(B.p, 'chat.people')).people.find((p) => p.name === 'Elif Yılmaz');
const dm = (await apiCall(E.p, 'chat.direct', { tk: pB.tk, uid: pB.uid })).id;

// ---- 1) Yazma çubuğu, emoji paneli, taslak ----
await E.p.goto(BASE + '#/mesaj/' + dm);
await E.p.locator('#chInput').waitFor();
if ((await E.p.getAttribute('#chInput', 'placeholder')) !== 'Mesaj') fail('yazı alanı ipucu kısa değil');
if (!(await E.p.locator('#chRecBtn').isVisible()) || (await E.p.locator('.ch-sendb').isVisible())) fail('boşken mikrofon görünmeli, gönder gizli olmalı');
await E.p.click('[data-act=ch-emoji]');
await E.p.locator('#chEmo [data-emo="🙏"]').first().click();
if (!(await E.p.inputValue('#chInput')).includes('🙏')) fail('emoji panelinden yazıya eklenmedi');
if (!(await E.p.locator('.ch-sendb').isVisible())) fail('yazı varken gönder düğmesi görünmedi');
await E.p.screenshot({ path: path.join(OUT, 'm2-emoji-mobile.png') });
await E.p.fill('#chInput', 'Yarın vardiya değişimi için konuşalım');
await E.p.goto(BASE + '#/mesaj');
await E.p.locator('.ch-row .ch-draft').first().waitFor({ timeout: 8000 }).catch(() => fail('sohbet listesinde taslak görünmüyor'));
await E.p.goto(BASE + '#/mesaj/' + dm);
await E.p.locator('#chInput').waitFor();
if ((await E.p.inputValue('#chInput')) !== 'Yarın vardiya değişimi için konuşalım') fail('taslak geri gelmedi');
await E.p.click('[data-act=ch-send]');
await E.p.locator('.ch-msg.mine', { hasText: 'vardiya değişimi' }).waitFor();
if (await E.p.evaluate(() => localStorage.getItem('nm-draft-' + CH.id))) fail('gönderilince taslak silinmedi');
step('yazma çubuğu: kısa “Mesaj” ipucu, emoji paneli, boşken mikrofon / yazınca gönder, taslak (listede “Taslak:”, geri geliyor, gönderince siliniyor)');

// ---- 2) Grup: gönderen adına/fotoğrafına dokun → profil (mesaj, sesli/görüntülü ara, telefon) ----
await B.p.goto(BASE + '#/mesaj/' + unitId);
await apiCall(E.p, 'chat.send', { id: unitId, body: 'Profil denemesi 0532 111 22 33 https://ornek.com/protokol' });
await B.p.locator('.ch-msg:not(.mine)', { hasText: 'Profil denemesi' }).waitFor({ timeout: 10000 });
const fromBtn = B.p.locator('.ch-msg:not(.mine) .ch-from', { hasText: 'Elif Yılmaz' }).last();
if (!(await B.p.locator('.ch-msg:not(.mine) a.ch-link[href^="tel:"]').count()) || !(await B.p.locator('.ch-msg:not(.mine) a.ch-link[href="https://ornek.com/protokol"]').count())) fail('telefon numarası / bağlantı tıklanır değil');
if (!(await B.p.locator('.ch-msg:not(.mine) .ch-avb').count())) fail('grupta gönderenin profil fotoğrafı yok');
await fromBtn.click();
await B.p.locator('.modal .ch-pacts [data-pa=call]').waitFor();
if (!(await B.p.locator('.modal .ch-pacts [data-pa=vcall]').count()) || !(await B.p.locator('.modal .ch-pacts a[href^="tel:"]').count())) fail('profilde görüntülü arama / telefonu ara yok');
await B.p.screenshot({ path: path.join(OUT, 'm2-profil-desktop.png') });
await B.p.locator('.modal .ch-pacts [data-pa=dm]').click();
await B.p.waitForFunction((d) => location.hash === '#/mesaj/' + d, dm);
step('grupta gönderen adı ve fotoğrafı tıklanıyor → profil: Mesaj, Sesli ara, Görüntülü, Telefonu ara; mesajdaki telefon ve bağlantı tıklanır');

// ---- 3) Tepki (her emoji), uzun bas → menü (hızlı yıldız), sağa kaydır → yanıt, seçim ----
const em = (await apiCall(E.p, 'chat.send', { id: dm, body: 'Tepki ve yıldız denemesi' })).msg;
await apiCall(B.p, 'chat.react', { id: em.id, emoji: '🎉' });
if (!/Geçersiz/.test(await apiErr(B.p, 'chat.react', { id: em.id, emoji: '<b>x' }))) fail('geçersiz tepki kabul edildi');
await E.p.locator(`.ch-msg[data-id="${em.id}"] .ch-react`, { hasText: '🎉' }).waitFor({ timeout: 10000 });
await touch(E.p, `.ch-msg[data-id="${em.id}"] .ch-bub`, [], 650);
await E.p.locator('.modal .ch-quick').waitFor();
await E.p.locator('.modal .ch-quick button', { hasText: 'Yıldızla' }).click();
await E.p.locator(`.ch-msg[data-id="${em.id}"] .ch-time svg`).first().waitFor();
if (!(await apiCall(E.p, 'chat.starred')).items.some((x) => x.id === em.id)) fail('uzun bas → yıldızla kaydedilmedi');
await touch(E.p, `.ch-msg[data-id="${em.id}"] .ch-bub`, [20, 40, 60, 75], 50);
await E.p.locator('#chReply .ch-replybar', { hasText: 'Tepki ve yıldız' }).waitFor({ timeout: 3000 }).catch(() => fail('sağa kaydırınca yanıt çubuğu açılmadı'));
await E.p.fill('#chInput', 'Kaydırarak yanıt');
await E.p.click('[data-act=ch-send]');
const repl = E.p.locator('.ch-msg.mine', { hasText: 'Kaydırarak yanıt' });
await repl.waitFor();
if (!(await repl.locator('.ch-quote', { hasText: 'Tepki ve yıldız' }).count())) fail('kaydırarak yanıtta alıntı yok');
// Masaüstü: 😊 hızlı tepki ve seçim modu
await B.p.locator(`.ch-msg[data-id="${em.id}"]`).waitFor({ timeout: 10000 });
await B.p.locator(`.ch-msg[data-id="${em.id}"]`).hover();
await B.p.locator(`.ch-msg[data-id="${em.id}"] [data-act=ch-qreact]`).click();
await B.p.locator('.ch-rxpop [data-e="❤️"]').click();
await B.p.locator(`.ch-msg[data-id="${em.id}"] .ch-react.on`, { hasText: '❤️' }).waitFor();
await B.p.locator(`.ch-msg[data-id="${em.id}"] [data-act=ch-menu]`).click();
await B.p.locator('.modal [data-i]', { hasText: 'Seç' }).click();
await B.p.locator('#chSelBar:not(.hidden)').waitFor();
const second = await B.p.evaluate((x) => CH.msgs.filter((m) => m.kind === 'text' && m.id !== x).slice(-1)[0].id, em.id);
await B.p.locator(`.ch-msg[data-id="${second}"] .ch-bub`).click();
await expectText(B.p, '2 seçildi');
await B.p.locator('#chSelBar [data-o=star]').click();
await B.p.waitForFunction(() => !CH.sel);
const bStar = (await apiCall(B.p, 'chat.starred')).items.map((x) => x.id);
if (!bStar.includes(em.id) || !bStar.includes(second)) fail('çoklu seçimle yıldızlama');
step('tepki: her emoji (geçersiz reddedildi); telefonda uzun bas → menü ve tek dokunuşla yıldız; sağa kaydır → alıntılı yanıt; masaüstünde 😊 hızlı tepki; çoklu seçim ve toplu yıldız');

// ---- 4) Okunmamış ayıracı ----
await B.p.goto(BASE + '#/mesaj');
await B.p.locator('.ch-row').first().waitFor();
await B.p.waitForTimeout(1500); // yolda kalan okundu isteği bitsin
for (const t of ['Bir', 'İki', 'Üç']) await apiCall(E.p, 'chat.send', { id: dm, body: 'Sıradaki ' + t });
await B.p.goto(BASE + '#/mesaj/' + dm);
await B.p.locator('#chInput').waitFor();
const divTxt = await B.p.locator('.ch-unread').innerText({ timeout: 8000 }).catch(async () => 'YOK ' + JSON.stringify(await B.p.evaluate(() => ({ lr: CH.chat.last_read, div: CH.divider, ids: CH.msgs.slice(-5).map((m) => [m.id, m.mine, m.body]) }))));
if (!/^[3-9] okunmamış mesaj$/.test(divTxt.trim())) fail('okunmamış ayıracı: ' + divTxt);
else step('okunmamış mesaj ayıracı (“' + divTxt.trim() + '”), açılınca oraya kayıyor');

// ---- 5) @herkes, yazma kısıtlaması, gruptan engelleme ----
await apiCall(B.p, 'notif.read', {});
await apiCall(A.p, 'chat.send', { id: unitId, body: '@herkes yarın 09:00 toplantı' });
if (!(await apiCall(B.p, 'notif.list', { unread: true })).items.some((x) => /herkese seslendi/.test(x.title))) fail('@herkes bildirimi gitmedi (sessizdeki üyeye)');
await apiCall(B.p, 'notif.read', {});
await apiCall(E.p, 'chat.send', { id: unitId, body: '@herkes deneme' });
if ((await apiCall(B.p, 'notif.list', { unread: true })).items.some((x) => /herkese seslendi/.test(x.title))) fail('yönetici olmayan @herkes ile herkese seslendi');
await apiCall(A.p, 'chat.members', { id: unitId, op: 'restrict', tk: pB.tk, uid: pB.uid });
if (!/kısıtladı/.test(await apiErr(B.p, 'chat.send', { id: unitId, body: 'yazabilir miyim' }))) fail('kısıtlanan üye yazabildi');
await B.p.goto(BASE + '#/mesaj/' + unitId);
await expectText(B.p, 'yazmanızı kısıtladı');
if ((await apiErr(E.p, 'chat.members', { id: unitId, op: 'restrict', tk: pB.tk, uid: pB.uid })) === 'kabul') fail('üye kısıtlama yaptı');
await apiCall(A.p, 'chat.members', { id: unitId, op: 'unrestrict', tk: pB.tk, uid: pB.uid });
if ((await apiErr(B.p, 'chat.send', { id: unitId, body: 'Kısıtlama kalktı' })) !== 'kabul') fail('kısıtlama kaldırılınca yazılamadı');
const g2 = (await apiCall(A.p, 'chat.list')).items.find((c) => c.name === 'Eğitim komisyonu 2026');
await apiCall(A.p, 'chat.members', { id: g2.id, op: 'ban', tk: pE.tk, uid: pE.uid });
if (!/erişiminiz yok/.test(await apiErr(E.p, 'chat.open', { id: g2.id }))) fail('engellenen gruba erişti');
const inv = (await apiCall(A.p, 'chat.invite', { id: g2.id, op: 'create', days: 1 })).invite;
await apiCall(A.p, 'chat.update', { id: g2.id, approve_join: false });
if (!/engellendi/.test(await apiErr(E.p, 'chat.join', { token: inv.token }))) fail('engellenen davet bağlantısıyla katıldı');
const addR = await apiCall(A.p, 'chat.members', { id: g2.id, op: 'add', members: [{ tk: pE.tk, uid: pE.uid }] });
if (addR.added !== 0 || !addR.skipped.some((x) => /engelli/.test(x))) fail('engellenen tekrar eklendi: ' + JSON.stringify(addR));
await A.p.goto(BASE + '#/mesaj/' + g2.id);
await A.p.locator('#chInput').waitFor();
await A.p.click('[data-act=ch-info]');
await A.p.locator('.modal [data-act=ch-unban]').click();
await expectText(A.p, 'Engel kaldırıldı');
if ((await apiCall(A.p, 'chat.members', { id: g2.id, op: 'add', members: [{ tk: pE.tk, uid: pE.uid }] })).added !== 1) fail('engel kalkınca eklenemedi');
await apiCall(A.p, 'chat.invite', { id: g2.id, op: 'revoke' });
step('@herkes (yalnız yönetici; sessizdekine de), yazma kısıtlaması (birim grubunda; üye yapamaz), gruptan çıkar ve engelle (davetle/eklemeyle dönemez), arayüzden engel kaldırma');

// ---- 6) Konum, kişi, video (parça parça oynatma), tek seferlik fotoğraf ----
const loc = (await apiCall(E.p, 'chat.share', { id: dm, type: 'location', lat: 41.0151, lng: 28.9795, acc: 12, label: 'Acil girişi' })).msg;
const ct = (await apiCall(E.p, 'chat.share', { id: dm, type: 'contact', name: 'Burak Demir', phone: '0532 222 33 44', title: 'Hemşire', ref_tk: pB.tk, ref_uid: pB.uid })).msg;
if (!ct.contact || ct.contact.uid !== pB.uid) fail('kişi kartında portal kimliği yok');
const vid = await E.p.evaluate(async (id) => {
  const bytes = new Uint8Array(4096); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const a = await uploadFile(new File([bytes], 'kisa-video.mp4', { type: 'video/mp4' }));
  return (await api('chat.send', { id, att_id: a.id, dur: 4 })).msg;
}, dm);
if (vid.kind !== 'video' || vid.dur !== 4) fail('video türü: ' + JSON.stringify(vid));
const rg = await status(B.p, vid.file.url, { Range: 'bytes=100-199' });
if (rg.s !== 206 || rg.cr !== 'bytes 100-199/4096' || rg.len !== 100) fail('video parça isteği (iPhone oynatma): ' + JSON.stringify(rg));
const once = await E.p.evaluate(async (id) => {
  const r = await fetch('assets/icon-192.png'); const b = await r.blob();
  const a = await uploadFile(new File([b], 'tek.png', { type: 'image/png' }));
  return (await api('chat.send', { id, att_id: a.id, once: true })).msg;
}, dm);
if (!once.once || once.file) fail('tek seferlik: gönderende dosya adresi olmamalı');
const bOnce = (await apiCall(B.p, 'chat.open', { id: dm })).msgs.find((m) => m.id === once.id);
if (!bOnce.once || !bOnce.file) fail('tek seferlik alıcıda açılamıyor');
await B.p.goto(BASE + '#/mesaj/' + dm);
await B.p.locator(`.ch-msg[data-id="${loc.id}"] .ch-loc a[href*="google.com/maps"]`).waitFor({ timeout: 10000 });
if (!(await B.p.locator(`.ch-msg[data-id="${ct.id}"] .ch-contact a[href="tel:05322223344"]`).count())) fail('kişi kartında ara bağlantısı yok');
if (!(await B.p.locator(`.ch-msg[data-id="${vid.id}"] video`).count())) fail('video oynatıcı yok');
await B.p.locator(`.ch-msg[data-id="${once.id}"] [data-act=ch-once]`).click();
await B.p.locator('.modal .ch-oncev img').waitFor();
await B.p.keyboard.press('Escape');
await B.p.locator(`.ch-msg[data-id="${once.id}"] .ch-once`, { hasText: 'Açıldı' }).waitFor();
if ((await apiErr(B.p, 'chat.forward', { id: once.id, to: unitId })) === 'kabul') fail('tek seferlik iletildi');
php(`hdb()->prepare("UPDATE c_once SET at = '2020-01-01 10:00:00' WHERE msg_id = ?")->execute([${once.id}]);`);
if ((await status(B.p, bOnce.file.url)).s !== 404) fail('tek seferlik ikinci kez açıldı');
if ((await status(E.p, bOnce.file.url)).s !== 404) fail('gönderen tek seferliği açtı');
if (!(await apiCall(E.p, 'chat.open', { id: dm })).msgs.find((m) => m.id === once.id).opened) fail('gönderen “açıldı” bilgisini görmüyor');
await B.p.screenshot({ path: path.join(OUT, 'm2-icerik-desktop.png') });
step('konum (haritada aç), kişi kartı (ara / mesaj), video (iPhone için parça parça sunum, 206), tek seferlik fotoğraf (bir kez açılır, iletilemez, gönderen açamaz, “Açıldı”)');

// ---- 7) Ekle menüsü ve kamera (telefon) ----
await E.p.goto(BASE + '#/mesaj/' + dm);
await E.p.locator('#chInput').waitFor();
await E.p.click('[data-act=ch-attach]');
for (const o of ['gallery', 'cam', 'file', 'once', 'loc', 'contact', 'poll']) if (!(await E.p.locator(`.modal .ch-attgrid [data-o=${o}]`).count())) fail('ekle menüsünde eksik: ' + o);
await E.p.screenshot({ path: path.join(OUT, 'm2-ekle-mobile.png') });
await E.p.locator('.modal .ch-attgrid [data-o=contact]').click();
await E.p.locator('.modal #ctQ').fill('Ayşe');
await E.p.locator('.modal #ctL [data-i]').first().click();
await E.p.locator('.ch-msg.mine .ch-contact', { hasText: 'Ayşe Kaya' }).waitFor();
await noOverflow(E.p, 'sohbet 4.8');
step('ekle menüsü: fotoğraf/video, kamera, belge, tek seferlik, konum, kişi, anket; arayüzden kişi paylaşımı');

// ---- 8) Sesli arama: gerçek WebRTC bağlantısı (iki tarayıcı) ----
await E.p.goto(BASE + '#/');
await E.p.waitForFunction(() => typeof NB !== 'undefined' && !!NB.since, null, { timeout: 15000 });
await B.p.goto(BASE + '#/mesaj/' + dm);
await B.p.locator('#chCallBtns [data-act=ch-call][data-v="0"]').click();
await B.p.locator('#callOv .call-st').waitFor();
await E.p.locator('#callOv.incoming').waitFor({ timeout: 25000 });
if (!(await apiCall(E.p, 'notif.list', {})).items.some((x) => x.kind === 'call')) fail('gelen arama bildirimi (telefon için) yok');
await E.p.screenshot({ path: path.join(OUT, 'm2-gelen-arama-mobile.png') });
await E.p.click('#callOv [data-ca=accept]');
await B.p.locator('#callOv.live').waitFor({ timeout: 25000 });
await E.p.locator('#callOv.live').waitFor({ timeout: 25000 });
const media = await E.p.evaluate(() => { const s = document.querySelector('#callRA').srcObject; return s ? s.getAudioTracks().length : 0; });
if (media < 1) fail('karşı tarafın sesi gelmiyor');
await B.p.waitForTimeout(2200);
if (!/^\d+:\d\d$/.test(await B.p.locator('#callSt').innerText())) fail('görüşme süresi işlemiyor');
await B.p.click('#callOv [data-ca=mic]');
if (!(await B.p.locator('#callOv [data-ca=mic].off').count())) fail('sessize alma');
await B.p.screenshot({ path: path.join(OUT, 'm2-gorusme-desktop.png') });
await B.p.click('#callOv [data-ca=min]');
await B.p.locator('#callOv.min .call-pill').waitFor();
if ((await apiErr(K.p, 'call.poll', { call: await B.p.evaluate(() => CALL.k.id), after: 0 })) === 'kabul') fail('başka hastane aramanın sinyallerini okudu');
await B.p.click('#callOv .call-pill');
await B.p.click('#callOv [data-ca=end]');
await E.p.locator('#callOv').waitFor({ state: 'detached', timeout: 10000 }).catch(() => fail('karşı tarafta görüşme kapanmadı'));
const callMsg = (await apiCall(E.p, 'chat.open', { id: dm })).msgs.filter((m) => m.kind === 'call').pop();
if (!callMsg || callMsg.call.status !== 'done' || !(callMsg.call.dur >= 1)) fail('görüşme kaydı: ' + JSON.stringify(callMsg));
if ((await apiCall(E.p, 'notif.list', {})).items.some((x) => x.kind === 'call')) fail('cevaplanan aramanın bildirimi kalktı olmalı');
step('sesli arama (gerçek WebRTC): zil, telefona gelen arama bildirimi, yanıtla, iki yönlü ses, süre, sessize al, küçült/büyüt, bitir (karşıda da kapandı), sohbette “Sesli arama m:ss”; başka hastane sinyali okuyamaz');

// Reddedilen, cevapsız (iptal), görüntülü, birimler arası
await B.p.locator('#chCallBtns [data-act=ch-call][data-v="0"]').click();
await E.p.locator('#callOv.incoming').waitFor({ timeout: 25000 });
await E.p.click('#callOv [data-ca=decline]');
await expectText(B.p, 'Arama reddedildi', 12000);
await B.p.locator('#chCallBtns [data-act=ch-call][data-v="0"]').click();
await B.p.locator('#callOv .call-st').waitFor();
await B.p.waitForTimeout(800);
await B.p.click('#callOv [data-ca=end]');
await B.p.locator('#callOv').waitFor({ state: 'detached' });
if (!(await apiCall(E.p, 'notif.list', { unread: true })).items.some((x) => /Cevapsız sesli arama/.test(x.title))) fail('cevapsız arama bildirimi yok');
await B.p.locator('#chCallBtns [data-act=ch-call][data-v="1"]').click();
await E.p.locator('#callOv.incoming.vid').waitFor({ timeout: 25000 });
await E.p.click('#callOv [data-ca=accept]');
await B.p.locator('#callOv.live.vid').waitFor({ timeout: 25000 });
await B.p.waitForFunction(() => { const v = document.querySelector('#callRV'); return v && v.srcObject && v.srcObject.getVideoTracks().length > 0 && v.videoWidth > 0; }, null, { timeout: 15000 }).catch(() => fail('görüntülü aramada karşı görüntü yok'));
await E.p.screenshot({ path: path.join(OUT, 'm2-goruntulu-mobile.png') });
await E.p.click('#callOv [data-ca=end]');
await B.p.locator('#callOv').waitFor({ state: 'detached', timeout: 10000 });
const log = (await apiCall(B.p, 'call.log')).items;
if (!log.some((c) => c.status === 'declined') || !log.some((c) => c.status === 'missed') || !log.some((c) => c.video && c.status === 'done')) fail('arama geçmişi: ' + JSON.stringify(log.slice(0, 4)));
await B.p.goto(BASE + '#/mesaj');
await B.p.locator('[data-act=ch-filter][data-f=calls]').click();
await B.p.locator('#callLog .list-row').first().waitFor();
// Birimler arası: Elif (Yoğun Bakım) → Nil (Dahiliye)
await N.p.goto(BASE + '#/');
await N.p.waitForFunction(() => typeof NB !== 'undefined' && !!NB.since, null, { timeout: 15000 });
const nilP = (await apiCall(E.p, 'chat.people')).people.find((p) => p.name === 'Nil Er');
const dmN = (await apiCall(E.p, 'chat.direct', { tk: nilP.tk, uid: nilP.uid })).id;
await E.p.goto(BASE + '#/mesaj/' + dmN);
await E.p.locator('#chCallBtns [data-act=ch-call][data-v="0"]').click();
await N.p.locator('#callOv.incoming').waitFor({ timeout: 25000 });
await N.p.click('#callOv [data-ca=accept]');
await E.p.locator('#callOv.live').waitFor({ timeout: 25000 });
await E.p.click('#callOv [data-ca=end]');
await N.p.locator('#callOv').waitFor({ state: 'detached', timeout: 10000 });
// Yönetici aramayı kapatabilir
await apiCall(A.p, 'call.cfg', { calls_on: false });
if (!/kapalı/.test(await apiErr(B.p, 'call.start', { id: dm }))) fail('arama kapalıyken başladı');
await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
await A.p.locator('#callCfg [data-cc=on]').waitFor({ state: 'attached' });
await A.p.locator('#callCfg [data-cc=on]').locator('..').click();
await A.p.click('[data-act=call-cfg-save]');
await expectText(A.p, 'Arama ayarları kaydedildi');
if (!(await apiCall(A.p, 'call.cfg', {})).calls_on) fail('arama ayarı arayüzden açılamadı');
if (!/TURN/.test(await apiErr(A.p, 'call.cfg', { turn_url: 'http://kotu' }))) fail('geçersiz TURN adresi kabul edildi');
step('arama: reddet, cevapsız (bildirim), görüntülü (karşı görüntü geldi), arama geçmişi sekmesi, birimler arası arama (Yoğun Bakım → Dahiliye), yönetici aramayı kapatıp açtı, TURN adresi denetimi');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nMESAJLAŞMA 4.8 TESTLERİ GEÇTİ');
