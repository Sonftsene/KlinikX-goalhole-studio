// Mesajlaşma (4.3) — uydurma verilerle.
// e2e.mjs, e2e-features.mjs, e2e-tenant.mjs ve e2e-hastane.mjs SONRASI aynı sitede çalışır (Dahiliye birimi ve nil@test.com orada açılır):
//   node e2e-mesaj.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-mesaj.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const status = (p, u) => p.evaluate(async (x) => (await fetch(x)).status, u);
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

const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
const B = await ctx('burak'); await login(B.p, 'burak@test.com', 'Sifre1234');
const A = await ctx('ayse'); await login(A.p, 'ayse@test.com', 'Sifre1234');
const N = await ctx('nil'); await login(N.p, 'nil@test.com', 'NilSifre1234');
const K = await ctx('kerem'); await login(K.p, 'kerem@test.com', 'KeremSifre123');

// ---- 1) Birim grubu: arayüzden mesaj, aynı birime anında bildirim ----
await E.p.goto(BASE + '#/mesaj');
await E.p.locator('.ch-row', { hasText: 'birim grubu' }).click();
await E.p.locator('#chInput').waitFor();
await E.p.fill('#chInput', 'Merhaba ekip, yarınki eğitim 10:00’da.');
await E.p.click('[data-act=ch-send]');
await E.p.locator('.ch-msg.mine', { hasText: 'Merhaba ekip' }).waitFor();
const unitId = +(await E.p.evaluate(() => CH.id));
const bU = await apiCall(B.p, 'chat.unread');
if (bU.unread < 1) fail('Burak’ta okunmamış mesaj yok');
const bN = (await apiCall(B.p, 'notif.list')).items.find((x) => x.kind === 'chat' && x.url === '#/mesaj/' + unitId);
if (!bN || !/Merhaba ekip/.test(bN.body)) fail('aynı birime anında bildirim gitmedi: ' + JSON.stringify(bN));
// Yazmaya devam: bildirim tek kalır (sohbet başına bir)
await apiCall(E.p, 'chat.send', { id: unitId, body: 'Not: salon 2' });
const bN2 = (await apiCall(B.p, 'notif.list')).items.filter((x) => x.kind === 'chat' && x.url === '#/mesaj/' + unitId && !x.read);
if (bN2.length !== 1 || !/salon 2/.test(bN2[0].body)) fail('sohbet bildirimi birikti / güncellenmedi: ' + bN2.length);
step('birim grubu: Elif telefondan yazdı; Burak’a anında bildirim (sohbet başına tek, güncelleniyor), okunmamış sayısı');

// ---- 2) KVKK: T.C. kimlik numarası engeli ----
await E.p.fill('#chInput', 'Hasta TC 100 000 001 46 yarın taburcu');
await E.p.click('[data-act=ch-send]');
await expectText(E.p, 'T.C. kimlik');
if (await E.p.locator('.ch-msg', { hasText: 'taburcu' }).count()) fail('T.C. kimlik numaralı mesaj gönderildi');
const okPhone = await apiErr(E.p, 'chat.send', { id: unitId, body: 'Santral 03121234567, dahili 2201' });
if (okPhone !== 'kabul') fail('telefon numarası yanlışlıkla engellendi: ' + okPhone);
await E.p.fill('#chInput', '');
step('KVKK: T.C. kimlik numarası (boşluklu yazılsa da) gönderilmeden reddedildi; telefon numarası engellenmedi');

// ---- 3) Yanıt, fotoğraf, dosya erişimi, silme ----
const bOpen = await apiCall(B.p, 'chat.open', { id: unitId });
const target = bOpen.msgs.find((m) => /Merhaba ekip/.test(m.body));
await apiCall(B.p, 'chat.send', { id: unitId, body: 'Tamam, geliyorum.', reply_to: target.id });
await E.p.locator('.ch-msg:not(.mine) .ch-quote', { hasText: 'Merhaba ekip' }).waitFor({ timeout: 10000 });
await E.p.setInputFiles('#chFile', path.join(HERE, 'fixtures/kurum-logosu.png'));
await E.p.locator('.ch-msg.mine .ch-img img').waitFor({ timeout: 15000 });
const img = await E.p.evaluate(() => CH.msgs.filter((m) => m.kind === 'image').pop());
const imgUrl = BASE + img.file.url;
if ((await status(B.p, imgUrl)) !== 200) fail('aynı birim fotoğrafı açamadı');
if ((await status(N.p, imgUrl)) !== 404) fail('başka birim (aynı hastane) birim grubunun fotoğrafını açtı');
if ((await status(K.p, imgUrl)) !== 404) fail('başka hastane fotoğrafı açtı');
if ((await fetch(imgUrl)).status !== 404) fail('oturumsuz fotoğraf açıldı');
await E.p.screenshot({ path: path.join(OUT, 'c-sohbet-mobile.png') });
await noOverflow(E.p, 'sohbet');
// Silme: arayüzden "Herkesten sil"
await E.p.locator(`.ch-msg[data-id="${img.id}"] [data-act=ch-menu]`).click();
await E.p.locator('.modal [data-i]', { hasText: 'Herkesten sil' }).click();
await E.p.locator('.modal [data-ok]').last().click();
await E.p.locator(`.ch-msg[data-id="${img.id}"] .ch-del`).waitFor();
if ((await status(B.p, imgUrl)) !== 404) fail('silinen fotoğraf sunucuda açılıyor');
const bPoll = await apiCall(B.p, 'chat.poll', { id: unitId, after: img.id });
if (!bPoll.deleted.includes(img.id)) fail('silme diğer üyeye yansımadı');
if ((await apiErr(B.p, 'chat.delete', { id: target.id })) === 'kabul') fail('üye başkasının mesajını sildi');
step('yanıt (alıntı karşıya düştü), fotoğraf (telefonda küçültülerek; yalnız birim açıyor, diğer birim/hastane/oturumsuz 404), herkesten silme (dosya da silindi), üye başkasınınkini silemiyor');

// ---- 4) Birebir ----
const pBurak = (await apiCall(E.p, 'chat.people')).people.find((p) => p.name === 'Burak Demir');
const dm = await apiCall(E.p, 'chat.direct', { tk: pBurak.tk, uid: pBurak.uid });
await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Pazartesi nöbetini değişelim mi?' });
const bl = (await apiCall(B.p, 'chat.list')).items.find((c) => c.id === dm.id);
if (!bl || bl.kind !== 'direct' || bl.name !== 'Elif Yılmaz' || bl.unread !== 1) fail('birebir sohbet Burak’ta yok: ' + JSON.stringify(bl));
const pElif = (await apiCall(B.p, 'chat.people')).people.find((p) => p.name === 'Elif Yılmaz');
const dm2 = await apiCall(B.p, 'chat.direct', { tk: pElif.tk, uid: pElif.uid });
if (dm2.id !== dm.id) fail('aynı iki kişi için ikinci birebir sohbet açıldı');
const nilTk = (await N.p.evaluate(() => S.tenant.b));
const nilUid = await N.p.evaluate(() => S.me.id);
if (!/başlatamazsınız/.test(await apiErr(E.p, 'chat.direct', { tk: nilTk, uid: nilUid }))) fail('başka birimdeki kişiyle (ortak grup yokken) birebir açıldı');
if ((await apiCall(E.p, 'chat.people')).people.some((p) => p.name === 'Nil Er' || p.name === 'Kerem Acar')) fail('üyenin kişi listesinde başka birim/hastane kişileri var');
step('birebir: Elif → Burak açıldı (tekrar açınca aynı sohbet), başka birimdeki kişiyle açılamıyor, üyenin listesinde yalnız kendi birimi');

// ---- 5) Birimler arası grup (yetkili), bildirim görevle ----
if (!/yetki/.test(await apiErr(E.p, 'chat.create', { name: 'Gizli grup', members: [] }))) fail('üye grup kurabildi');
const aPeople = (await apiCall(A.p, 'chat.people')).people;
const nilP = aPeople.find((p) => p.name === 'Nil Er');
if (!nilP || nilP.unit !== 'Dahiliye') fail('yönetici kişi listesinde diğer birimin yöneticisi yok');
if (aPeople.some((p) => p.name === 'Kerem Acar')) fail('başka hastanenin yöneticisi listede');
const elifP = aPeople.find((p) => p.name === 'Elif Yılmaz');
// Arayüzden grup kur
await A.p.goto(BASE + '#/mesaj');
await A.p.click('[data-act=ch-new]');
await A.p.click('[data-act=ch-newgroup]');
await A.p.fill('#chGname', 'Sorumlu hemşireler');
await A.p.check(`.ch-pick input[value="${nilP.tk}:${nilP.uid}"]`);
await A.p.check(`.ch-pick input[value="${elifP.tk}:${elifP.uid}"]`);
await A.p.click('#chPickGo');
await A.p.locator('#chTitle', { hasText: 'Sorumlu hemşireler' }).waitFor();
const gid = +(await A.p.evaluate(() => CH.id));
await A.p.fill('#chInput', 'Haftalık toplantı perşembe.');
await A.p.click('[data-act=ch-send]');
await A.p.locator('.ch-msg.mine', { hasText: 'Haftalık' }).waitFor();
const nl = (await apiCall(N.p, 'chat.list')).items.find((c) => c.id === gid);
if (!nl || nl.unread < 1) fail('Nil grubu görmüyor');
// Diğer birim (Dahiliye) için bildirim kendi biriminin görevinde
cron();
if (!(await apiCall(N.p, 'notif.list')).items.some((x) => x.kind === 'chat' && x.url === '#/mesaj/' + gid)) fail('diğer birimdeki üyeye görevle bildirim gitmedi');
await apiCall(N.p, 'chat.open', { id: gid });
await apiCall(N.p, 'chat.send', { id: gid, body: 'Katılıyorum.' });
await A.p.locator('.ch-msg:not(.mine)', { hasText: 'Katılıyorum' }).waitFor({ timeout: 10000 });
if (!(await A.p.locator('.ch-msg:not(.mine) .ch-from', { hasText: 'Nil Er' }).count())) fail('grupta gönderen adı görünmüyor');
// Kim okudu
const myMsg = (await apiCall(A.p, 'chat.open', { id: gid })).msgs.find((m) => /Haftalık/.test(m.body));
const rd = await apiCall(A.p, 'chat.readers', { id: myMsg.id });
if (!rd.read.some((p) => p.name === 'Nil Er' && p.unit === 'Dahiliye')) fail('kim okudu: ' + JSON.stringify(rd));
if ((await apiErr(E.p, 'chat.readers', { id: myMsg.id })) === 'kabul') fail('başkasının mesajının okuyanlarını üye gördü');
// Ortak grup sonrası Elif ↔ Nil birebir mümkün
const dmN = await apiErr(E.p, 'chat.direct', { tk: nilTk, uid: nilUid });
if (dmN !== 'kabul') fail('ortak gruptaki kişiyle birebir açılamadı: ' + dmN);
await A.p.screenshot({ path: path.join(OUT, 'c-grup-desktop.png') });
step('birimler arası grup: yönetici arayüzden “Sorumlu hemşireler” kurdu (Dahiliye’nin yöneticisi + Elif), Nil gördü, görevle bildirim aldı, yanıtladı (gönderen adı görünüyor), kim okudu; üye grup kuramıyor; başka hastane listede yok');

// ---- 6) Grup yönetimi ----
await apiCall(A.p, 'chat.update', { id: gid, only_admins: true });
if (!/yalnız yöneticiler/.test(await apiErr(N.p, 'chat.send', { id: gid, body: 'deneme' }))) fail('yalnız yöneticiler açıkken üye yazabildi');
if ((await apiErr(N.p, 'chat.update', { id: gid, name: 'Ele geçirildi' })) === 'kabul') fail('üye grup ayarını değiştirdi');
await apiCall(A.p, 'chat.members', { id: gid, op: 'admin', tk: nilP.tk, uid: nilP.uid });
if ((await apiErr(N.p, 'chat.send', { id: gid, body: 'Yönetici olarak yazıyorum' })) !== 'kabul') fail('yönetici yapılan üye yazamadı');
await apiCall(A.p, 'chat.members', { id: gid, op: 'remove', tk: elifP.tk, uid: elifP.uid });
if (!/erişiminiz yok/.test(await apiErr(E.p, 'chat.open', { id: gid }))) fail('çıkarılan üye grubu açabildi');
const sysTxt = (await apiCall(A.p, 'chat.open', { id: gid })).msgs.filter((m) => m.kind === 'system').map((m) => m.body).join(' | ');
if (!/kurdu/.test(sysTxt) || !/yönetici/.test(sysTxt) || !/çıkardı/.test(sysTxt)) fail('sistem mesajları: ' + sysTxt);
await apiCall(A.p, 'chat.update', { id: gid, only_admins: false });
// Başka birimin birim grubuna erişim yok
if (!/erişiminiz yok/.test(await apiErr(N.p, 'chat.open', { id: unitId }))) fail('başka birimin birim grubu açıldı');
if ((await apiErr(K.p, 'chat.open', { id: gid })) === 'kabul') fail('başka hastane grubu açtı');
// Sessize alma
await apiCall(B.p, 'chat.mute', { id: unitId, muted: true });
await apiCall(B.p, 'chat.open', { id: unitId });
await apiCall(E.p, 'chat.send', { id: unitId, body: 'Sessizdeyken mesaj' });
if ((await apiCall(B.p, 'notif.list')).items.some((x) => x.kind === 'chat' && x.url === '#/mesaj/' + unitId && !x.read)) fail('sessize alınan sohbetten bildirim geldi');
step('grup yönetimi: yalnız yöneticiler yazsın, üye ayar değiştiremiyor, yönetici yapma, üye çıkarma (erişimi kesildi), sistem mesajları; başka birim/hastane erişemiyor; sessize alma');

// ---- 7) Modül kapalı ----
const sa = JSON.parse(execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; $u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); $u['tid'] = (int)m_val("SELECT id FROM tenants WHERE name = 'Dahiliye'"); echo json_encode($u);`], { encoding: 'utf8' }));
const SA = await ctx('sistem');
await SA.p.goto(BASE);
await apiCall(SA.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await new Promise((r) => setTimeout(r, 1000));
await apiCall(SA.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
await apiCall(SA.p, 'sa.modules.save', { kind: 'tenant', id: sa.tid, modules: { mesaj: 'off' } });
if (!/kapalı/.test(await apiErr(N.p, 'chat.list'))) fail('mesajlaşma kapalıyken liste açıldı');
await N.p.goto(BASE + '#/');
await N.p.reload();
await N.p.waitForFunction(() => typeof S !== 'undefined' && S.mods && S.mods.mesaj === false);
if (await N.p.locator('#chatTopBtn, #sidebar [href="#/mesaj"]').count()) fail('kapalı modülün mesaj simgesi/menüsü görünüyor');
await N.p.goto(BASE + '#/mesaj');
await N.p.waitForFunction(() => location.hash === '#/' || location.hash === '');
await apiCall(SA.p, 'sa.modules.save', { kind: 'tenant', id: sa.tid, modules: { mesaj: 'inherit' } });
step('modül: Dahiliye’de mesajlaşma kapanınca sunucu ve sayfa kapandı; geri açıldı');

// ---- 7b) 4.4: tepki, anket, ilet, sabitle, @bahsetme, davet, saklama, sesli mesaj ----
await E.p.goto(BASE + '#/mesaj/' + unitId);
await E.p.locator('#chInput').waitFor();
const eMsg = (await apiCall(E.p, 'chat.open', { id: unitId })).msgs.find((m) => /Merhaba ekip/.test(m.body));
await apiCall(B.p, 'chat.react', { id: eMsg.id, emoji: '👍' });
await E.p.locator(`.ch-msg[data-id="${eMsg.id}"] .ch-react`, { hasText: '👍 1' }).waitFor({ timeout: 10000 });
await E.p.locator(`.ch-msg[data-id="${eMsg.id}"] [data-act=ch-menu]`).click();
await E.p.locator('.modal .ch-emo', { hasText: '👍' }).click();
await E.p.locator(`.ch-msg[data-id="${eMsg.id}"] .ch-react.on`, { hasText: '👍 2' }).waitFor();
// Anket (arayüzden)
await E.p.click('[data-act=ch-attach]');
await E.p.locator('.modal [data-o=poll]').click();
await E.p.fill('#chPollF [name=question]', 'Eğitim hangi gün olsun?');
await E.p.fill('#chPollF [name=o1]', 'Salı');
await E.p.fill('#chPollF [name=o2]', 'Perşembe');
await E.p.click('.modal button[form=chPollF]');
await E.p.locator('.ch-poll', { hasText: 'Eğitim hangi gün' }).waitFor();
const pollId = +(await E.p.locator('.ch-msg', { has: E.p.locator('.ch-poll') }).last().getAttribute('data-id'));
await apiCall(B.p, 'chat.vote', { id: pollId, opts: [1] });
await apiCall(A.p, 'chat.vote', { id: pollId, opts: [1] });
await E.p.locator(`.ch-msg[data-id="${pollId}"]`, { hasText: '2 kişi oy verdi' }).waitFor({ timeout: 10000 });
await E.p.locator(`.ch-msg[data-id="${pollId}"] [data-act=ch-vote][data-i="0"]`).click();
await E.p.locator(`.ch-msg[data-id="${pollId}"]`, { hasText: '3 kişi oy verdi' }).waitFor();
const voters = await apiCall(E.p, 'chat.voters', { id: pollId });
if (!voters.opts[1].names.includes('Burak Demir') || !voters.opts[0].names.includes('Elif Yılmaz')) fail('oy verenler: ' + JSON.stringify(voters));
if ((await apiErr(B.p, 'chat.voters', { id: pollId })) === 'kabul') fail('anketi açmayan üye oy verenleri gördü');
// İlet (birim grubundan birebire)
const fw = await apiCall(E.p, 'chat.forward', { id: eMsg.id, to: dm.id });
const bDm = (await apiCall(B.p, 'chat.open', { id: dm.id })).msgs.find((m) => m.id === fw.id);
if (!bDm || !bDm.fwd || !/Merhaba ekip/.test(bDm.body)) fail('iletilen mesaj: ' + JSON.stringify(bDm));
if ((await apiErr(N.p, 'chat.forward', { id: eMsg.id, to: gid })) === 'kabul') fail('başka birim, erişemediği mesajı iletti');
// Sabitle (birim yöneticisi) → üyede çubuk
if (!/yönetici/.test(await apiErr(E.p, 'chat.pin', { id: unitId, msg: eMsg.id }))) fail('üye birim grubunda sabitleyebildi');
await apiCall(A.p, 'chat.pin', { id: unitId, msg: eMsg.id });
await E.p.locator('.ch-pinbar', { hasText: 'Merhaba ekip' }).waitFor({ timeout: 10000 });
await E.p.screenshot({ path: path.join(OUT, 'c-44-mobile.png') });
await noOverflow(E.p, 'sohbet 4.4');
// @bahsetme: Burak birim grubunu sessize aldı; adı geçince yine bildirim
await apiCall(B.p, 'notif.read', {});
await apiCall(E.p, 'chat.send', { id: unitId, body: '@Burak Demir yarın 08:00 devir sende.' });
if (!(await apiCall(B.p, 'notif.list')).items.some((x) => x.kind === 'chat' && !x.read && /bahsetti/.test(x.title))) fail('sessizdeyken @bahsetme bildirimi gelmedi');
// Başka birimdeki üyeye bahsetme (görevle)
await apiCall(N.p, 'chat.mute', { id: gid, muted: true });
await apiCall(N.p, 'notif.read', {});
await apiCall(A.p, 'chat.send', { id: gid, body: 'Raporu @Nil Er hazırlayacak.' });
cron();
if (!(await apiCall(N.p, 'notif.list')).items.some((x) => x.kind === 'chat' && !x.read && /bahsetti/.test(x.title))) fail('diğer birimdeki üyeye @bahsetme bildirimi gitmedi');
// Davet bağlantısı
const inv = (await apiCall(A.p, 'chat.invite', { id: gid, op: 'create', days: 7 })).invite;
await B.p.goto(BASE + '#/mesaj/katil/' + inv.token);
await B.p.waitForFunction((g) => location.hash === '#/mesaj/' + g, gid, { timeout: 10000 });
if (!(await apiCall(B.p, 'chat.list')).items.some((c) => c.id === gid)) fail('davet bağlantısıyla katılınamadı');
if ((await apiErr(K.p, 'chat.join', { token: inv.token })) === 'kabul') fail('başka hastane davet bağlantısıyla katıldı');
await apiCall(A.p, 'chat.invite', { id: gid, op: 'revoke' });
if ((await apiErr(E.p, 'chat.join', { token: inv.token })) === 'kabul') fail('kapatılan davet bağlantısı çalıştı');
// Saklama süresi: 30 gün; eski mesaj görevle silinir
if ((await apiErr(E.p, 'chat.update', { id: unitId, retention: 30 })) === 'kabul') fail('üye saklama süresini değiştirdi');
await apiCall(A.p, 'chat.update', { id: unitId, retention: 30 });
execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; nm_tenant_use(nm_tenant_default()); require '${path.join(SITE, 'inc/mod_hastane.php')}'; hdb()->prepare("UPDATE c_msgs SET created_at = '2020-01-01 10:00:00' WHERE body LIKE 'Not: salon%'")->execute();`]);
cron();
if ((await apiCall(E.p, 'chat.open', { id: unitId })).msgs.some((m) => /Not: salon/.test(m.body))) fail('saklama süresi geçen mesaj silinmedi');
// Sesli mesaj (yükleme + tür)
const vm = await E.p.evaluate(async (id) => {
  const f = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 1, 2, 3, 4])], 'sesli-mesaj.weba', { type: 'audio/webm' });
  const a = await uploadFile(f);
  return (await api('chat.send', { id, att_id: a.id, dur: 7 })).msg;
}, unitId);
if (vm.kind !== 'audio' || vm.dur !== 7 || !/audio\/webm/.test(vm.file.mime)) fail('sesli mesaj: ' + JSON.stringify(vm));
await E.p.locator(`.ch-msg[data-id="${vm.id}"] audio`).waitFor({ timeout: 10000 }).catch(() => fail('sesli mesaj oynatıcısı görünmedi'));
if (!/microphone=\(self\)/.test(fs.readFileSync(path.join(SITE, '.htaccess'), 'utf8'))) fail('.htaccess mikrofon izni (self) yok');
step('4.4: tepki (karşılıklı, menüden), anket (arayüzden; oylar canlı yansıdı, oy verenler yalnız açana), ilet (iletildi etiketi; erişemeyen iletemez), sabitle (yalnız yönetici; üyede çubuk), @bahsetme sessizdeyken de (aynı birim anında, diğer birim görevle), davet bağlantısı (başka hastane ve kapatılan bağlantı çalışmadı), 30 gün saklama (eski mesaj silindi), sesli mesaj');

// ---- 8) Telefonda liste ----
await E.p.goto(BASE + '#/mesaj');
await E.p.locator('.ch-row').first().waitFor();
await E.p.screenshot({ path: path.join(OUT, 'c-liste-mobile.png') });
await noOverflow(E.p, 'mesaj listesi');
if (!(await E.p.locator('#chatTopBtn').count())) fail('üst çubukta mesaj simgesi yok');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nMESAJLAŞMA TESTLERİ GEÇTİ');
