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
// Göndermeden önce önizleme: Vazgeç → gitmez; açıklama yazıp Gönder → fotoğraf + açıklama
const imgN0 = await E.p.locator('.ch-msg.mine .ch-img').count();
await E.p.setInputFiles('#chFile', path.join(HERE, 'fixtures/kurum-logosu.png'));
await E.p.locator('.modal .ch-pv img').waitFor();
await E.p.locator('.modal [data-close]').last().click();
await E.p.locator('.modal .ch-pv').waitFor({ state: 'detached' });
await E.p.waitForTimeout(500);
if ((await E.p.locator('.ch-msg.mine .ch-img').count()) !== imgN0) fail('önizlemede Vazgeç dendiği hâlde fotoğraf gitti');
await E.p.setInputFiles('#chFile', path.join(HERE, 'fixtures/kurum-logosu.png'));
await E.p.locator('.modal .ch-pv img').waitFor();
await E.p.fill('.modal #pvCap', 'Yeni kurum logosu, panoya asılacak');
await E.p.screenshot({ path: path.join(OUT, 'c-onizleme-mobile.png') });
await E.p.locator('.modal [data-go]').click();
await E.p.locator('.ch-msg.mine', { has: E.p.locator('.ch-img img') }).filter({ hasText: 'panoya asılacak' }).waitFor({ timeout: 15000 });
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

// ---- 4b) 4.6 gizlilik: bulunabilirlik, kimler yazabilir, profil ----
await apiCall(N.p, 'chat.prefs.save', { findable: true, dm_from: 'contacts', about: 'Dahiliye sorumlu hemşiresi', about_vis: 'all' });
await apiCall(K.p, 'chat.prefs.save', { findable: true });
const ePeople2 = (await apiCall(E.p, 'chat.people')).people;
if (!ePeople2.some((p) => p.name === 'Nil Er' && p.unit === 'Dahiliye')) fail('bulunabilir açan diğer birim kişisi listede yok');
if (ePeople2.some((p) => p.name === 'Kerem Acar')) fail('başka hastanedeki bulunabilir kişi listede');
const nilProf = (await apiCall(E.p, 'chat.profile', { tk: nilTk, uid: nilUid })).profile;
if (nilProf.about !== 'Dahiliye sorumlu hemşiresi' || nilProf.last_seen) fail('profil (hakkımda herkese, son görülme kişilere): ' + JSON.stringify(nilProf));
if (!/kişilerinden/.test(await apiErr(E.p, 'chat.direct', { tk: nilTk, uid: nilUid }))) fail('“yalnız kişilerim” açıkken yabancı birebir başlattı');
if (!/T\.C\./.test(await apiErr(E.p, 'chat.prefs.save', { about: 'TC 10000000146' }))) fail('hakkımda alanına T.C. kimlik yazıldı');
await apiCall(N.p, 'chat.prefs.save', { findable: false, dm_from: 'all' });
await apiCall(K.p, 'chat.prefs.save', { findable: false });
if ((await apiCall(E.p, 'chat.people')).people.some((p) => p.name === 'Nil Er')) fail('bulunabilirlik kapanınca kişi listede kaldı');
if ((await apiErr(E.p, 'chat.profile', { tk: nilTk, uid: nilUid })) === 'kabul') fail('bulunamaz kişinin profili açıldı');
step('4.6 gizlilik: diğer birimden bulunabilirlik (başka hastane hariç), hakkımda, son görülme kişilere, “yalnız kişilerim yazsın”, hakkımda alanında T.C. engeli');

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

// ---- 7c) 4.6: engelleme, okundu bilgisi, gruplara ekleme izni, grup izinleri, katılma onayı, fotoğraf ----
// Engelleme (birebir)
await apiCall(B.p, 'chat.block', { tk: pElif.tk, uid: pElif.uid, on: true });
if (!/gönderilemiyor/.test(await apiErr(E.p, 'chat.send', { id: dm.id, body: 'Engelli mi?' }))) fail('engelleyen kişiye mesaj gitti');
if (!/engellediniz/.test(await apiErr(B.p, 'chat.send', { id: dm.id, body: 'deneme' }))) fail('engelleyen, engellediğine yazabildi');
if (!(await apiCall(B.p, 'chat.prefs.get')).blocked.some((x) => x.name === 'Elif Yılmaz')) fail('engellenenler listesi');
await B.p.goto(BASE + '#/mesaj/ayarlar');
await B.p.locator('[data-act=chs-unblock]').click();
await B.p.waitForFunction(() => !document.querySelector('[data-act=chs-unblock]'));
if ((await apiErr(E.p, 'chat.send', { id: dm.id, body: 'Engel kalktı' })) !== 'kabul') fail('engel kaldırılınca yazılamadı');
// Okundu bilgisi birebirde karşılıklı
await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Okundu denemesi' });
await apiCall(B.p, 'chat.open', { id: dm.id });
const rOn = (await apiCall(E.p, 'chat.poll', { id: dm.id, after: 0 })).read;
if (rOn.n !== 1) fail('okundu bilgisi açıkken görünmedi: ' + JSON.stringify(rOn));
await apiCall(B.p, 'chat.prefs.save', { receipts: false });
if ((await apiCall(E.p, 'chat.poll', { id: dm.id, after: 0 })).read.n !== 0) fail('karşı taraf okundu bilgisini kapattı ama görünüyor');
await apiCall(B.p, 'chat.prefs.save', { receipts: true });
// Beni gruplara kim ekleyebilir
await apiCall(E.p, 'chat.prefs.save', { add_groups: 'none' });
const g2 = await apiCall(A.p, 'chat.create', { name: 'Eğitim komisyonu', members: [{ tk: elifP.tk, uid: elifP.uid }, { tk: pBurak.tk, uid: pBurak.uid }] });
if (!(g2.skipped || []).includes('Elif Yılmaz')) fail('gruplara ekleme kapalıyken eklendi: ' + JSON.stringify(g2));
if ((await apiErr(E.p, 'chat.open', { id: g2.id })) === 'kabul') fail('eklenemeyen kişi gruba erişti');
await apiCall(E.p, 'chat.prefs.save', { add_groups: 'all' });
// Grup izinleri: bilgiyi kim düzenler, kim üye ekler
if ((await apiErr(B.p, 'chat.update', { id: g2.id, name: 'Komisyon' })) === 'kabul') fail('üye grup adını değiştirdi (yalnız yöneticiler)');
await apiCall(A.p, 'chat.update', { id: g2.id, perm_edit: 'all' });
if ((await apiErr(B.p, 'chat.update', { id: g2.id, name: 'Eğitim komisyonu 2026', descr: 'Hizmet içi eğitim planı' })) !== 'kabul') fail('“herkes düzenler” açıkken üye adı değiştiremedi');
if ((await apiErr(B.p, 'chat.update', { id: g2.id, only_admins: true })) === 'kabul') fail('üye yönetici ayarını değiştirdi');
if ((await apiErr(B.p, 'chat.members', { id: g2.id, op: 'add', members: [{ tk: elifP.tk, uid: elifP.uid }] })) === 'kabul') fail('üye ekleme yalnız yöneticilerdeyken üye ekledi');
await apiCall(A.p, 'chat.update', { id: g2.id, perm_add: 'all' });
const addR = await apiCall(B.p, 'chat.members', { id: g2.id, op: 'add', members: [{ tk: elifP.tk, uid: elifP.uid }] });
if (addR.added !== 1) fail('“herkes ekler” açıkken üye ekleyemedi: ' + JSON.stringify(addR));
// Katılma onayı
await apiCall(A.p, 'chat.update', { id: g2.id, approve_join: true });
const inv2 = (await apiCall(A.p, 'chat.invite', { id: g2.id, op: 'create', days: 7 })).invite;
const jr = await apiCall(N.p, 'chat.join', { token: inv2.token });
if (!jr.pending) fail('katılma onayı açıkken doğrudan katıldı');
if ((await apiErr(N.p, 'chat.open', { id: g2.id })) === 'kabul') fail('onay beklerken grup açıldı');
const g2o = await apiCall(A.p, 'chat.open', { id: g2.id });
if (!(g2o.chat.joinreqs || []).some((x) => x.name === 'Nil Er')) fail('yönetici katılma isteğini görmüyor: ' + JSON.stringify(g2o.chat.joinreqs));
if ((await apiErr(B.p, 'chat.joinreq', { id: g2.id, tk: nilTk, uid: nilUid, op: 'approve' })) === 'kabul') fail('üye katılma isteğini onayladı');
await apiCall(A.p, 'chat.joinreq', { id: g2.id, tk: nilTk, uid: nilUid, op: 'approve' });
if ((await apiErr(N.p, 'chat.open', { id: g2.id })) !== 'kabul') fail('onaylanan kişi gruba giremedi');
// Grup fotoğrafı
const ph = await B.p.evaluate(async (id) => {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
  const a = await uploadFile(new File([png], 'grup.png', { type: 'image/png' }));
  return (await api('chat.photo', { id, att_id: a.id })).photo;
}, g2.id);
if (!ph || (await status(E.p, ph)) !== 200) fail('grup fotoğrafı yüklenmedi / üye göremiyor: ' + ph);
if ((await status(K.p, ph)) === 200) fail('başka hastane grup fotoğrafını açtı');
// Arayüz: grup bilgisi (yönetici ayarları)
await A.p.goto(BASE + '#/mesaj/' + g2.id);
await A.p.locator('#chInput').waitFor();
await A.p.click('[data-act=ch-info]');
await A.p.locator('.modal .ch-gphoto img').waitFor();
await expectText(A.p, 'Katılma');
await A.p.waitForTimeout(500);
await A.p.screenshot({ path: path.join(OUT, 'c-46-grup-ayar.png') });
await A.p.keyboard.press('Escape');
step('4.6 grup ve gizlilik: engelleme (iki yönlü, ayarlardan kaldırma), okundu bilgisi karşılıklı, “beni gruplara kim ekleyebilir”, bilgiyi/üye eklemeyi kim yapar, katılma onayı (yalnız yönetici onaylar), grup fotoğrafı (başka hastane açamaz), grup bilgi ekranı');

// ---- 7d) 4.6 sohbet: sabitle, arşiv, okunmadı, süreli sessiz, temizle/sil, düzenle, benden sil, yıldız, ara, medya, yazıyor ----
const eList = async () => (await apiCall(E.p, 'chat.list')).items;
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'pin' });
if ((await eList())[0].id !== dm.id) fail('sabitlenen sohbet üstte değil');
await apiCall(E.p, 'chat.state', { id: unitId, op: 'pin' });
await apiCall(E.p, 'chat.state', { id: g2.id, op: 'pin' });
const dmN2 = (await apiCall(E.p, 'chat.list')).items.find((c) => c.kind === 'direct' && c.id !== dm.id);
if (dmN2 && !/En fazla 3/.test(await apiErr(E.p, 'chat.state', { id: dmN2.id, op: 'pin' }))) fail('3’ten fazla sohbet sabitlendi');
await apiCall(E.p, 'chat.state', { id: unitId, op: 'unpin' });
await apiCall(E.p, 'chat.state', { id: g2.id, op: 'archive' });
const arch = (await eList()).find((c) => c.id === g2.id);
if (!arch.archived || arch.pinned) fail('arşivleme: ' + JSON.stringify(arch));
await apiCall(E.p, 'chat.state', { id: g2.id, op: 'unarchive' });
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'read' });
const u0 = (await apiCall(E.p, 'chat.unread')).unread;
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'unread' });
if ((await apiCall(E.p, 'chat.unread')).unread <= u0) fail('okunmadı işareti sayıya yansımadı');
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'read' });
// Süreli sessiz: bildirim yok, süre geçince geri gelir
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'mute', dur: '8h' });
await apiCall(E.p, 'notif.read', {});
await apiCall(B.p, 'chat.send', { id: dm.id, body: 'Sessizdeyken' });
if ((await apiCall(E.p, 'notif.list')).items.some((x) => x.kind === 'chat' && !x.read && x.url === '#/mesaj/' + dm.id)) fail('8 saat sessizdeyken bildirim geldi');
if (!(await eList()).find((c) => c.id === dm.id).mute_until) fail('sessiz bitiş zamanı yok');
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'mute', dur: '' });
await apiCall(B.p, 'chat.send', { id: dm.id, body: 'Sessiz bitti' });
if (!(await apiCall(E.p, 'notif.list')).items.some((x) => x.kind === 'chat' && !x.read && x.url === '#/mesaj/' + dm.id)) fail('sessizden çıkınca bildirim gelmedi');
// Düzenle (15 dk) ve benden sil, yıldız
const ed = (await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Saat 10’da buluşalım' })).msg;
const edR = (await apiCall(E.p, 'chat.edit', { id: ed.id, body: 'Saat 11’de buluşalım' })).msg;
if (!edR.edited || !/11/.test(edR.body)) fail('düzenleme: ' + JSON.stringify(edR));
if (!(await apiCall(B.p, 'chat.open', { id: dm.id })).msgs.some((m) => m.id === ed.id && m.edited && /11/.test(m.body))) fail('düzenlenen mesaj karşıda güncellenmedi');
if ((await apiErr(B.p, 'chat.edit', { id: ed.id, body: 'ele geçirildi' })) === 'kabul') fail('başkasının mesajı düzenlendi');
if (!/T\.C\./.test(await apiErr(E.p, 'chat.edit', { id: ed.id, body: 'TC 10000000146' }))) fail('düzenlemede T.C. engeli yok');
execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; nm_tenant_use(nm_tenant_default()); require '${path.join(SITE, 'inc/mod_hastane.php')}'; hdb()->prepare("UPDATE c_msgs SET created_at = '2020-01-01 10:00:00' WHERE id = ?")->execute([${ed.id}]);`]);
if (!/15 dakika/.test(await apiErr(E.p, 'chat.edit', { id: ed.id, body: 'geç' }))) fail('15 dakika sonra düzenlendi');
const hid = (await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Yalnız benden silinecek' })).msg;
await apiCall(E.p, 'chat.hide', { id: hid.id });
if ((await apiCall(E.p, 'chat.open', { id: dm.id })).msgs.some((m) => m.id === hid.id)) fail('benden sil: hâlâ görünüyor');
if (!(await apiCall(B.p, 'chat.open', { id: dm.id })).msgs.some((m) => m.id === hid.id)) fail('benden sil karşıdan da sildi');
await apiCall(E.p, 'chat.star', { id: ed.id, on: true });
const st = (await apiCall(E.p, 'chat.starred')).items;
if (!st.some((m) => m.id === ed.id && m.chat_id === dm.id)) fail('yıldızlı listesi: ' + JSON.stringify(st));
if ((await apiCall(B.p, 'chat.starred')).items.length) fail('yıldız başkasına göründü');
// Ara, medya, bağlantılar
await apiCall(E.p, 'chat.send', { id: dm.id, body: 'Protokol: https://example.org/protokol' });
if (!(await apiCall(E.p, 'chat.search', { id: dm.id, q: 'buluşalım' })).msgs.some((m) => m.id === ed.id)) fail('sohbette arama bulmadı');
if ((await apiCall(E.p, 'chat.media', { id: dm.id, kind: 'links' })).msgs.length !== 1) fail('bağlantılar listesi');
if ((await apiErr(K.p, 'chat.search', { id: dm.id, q: 'buluşalım' })) === 'kabul') fail('başka hastane sohbette arama yaptı');
// Yazıyor…
await apiCall(B.p, 'chat.typing', { id: dm.id });
if (!(await apiCall(E.p, 'chat.poll', { id: dm.id, after: 0 })).typing.includes('Burak Demir')) fail('yazıyor göstergesi yok');
// Arayüz: sohbet ekranı (Elif, telefon) → başlıkta yazıyor, menüden ara
await E.p.goto(BASE + '#/mesaj/' + dm.id);
await E.p.locator('#chInput').waitFor();
await apiCall(B.p, 'chat.typing', { id: dm.id });
await E.p.locator('#chSub.ch-typing').waitFor({ timeout: 10000 }).catch(() => fail('başlıkta “yazıyor…” görünmedi'));
await E.p.click('[data-act=ch-more]');
await expectText(E.p, 'Sohbette ara');
await E.p.screenshot({ path: path.join(OUT, 'c-46-menu-mobile.png') });
await E.p.keyboard.press('Escape');
// Temizle ve sil (benim için)
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'clear' });
if ((await apiCall(E.p, 'chat.open', { id: dm.id })).msgs.filter((m) => m.kind !== 'system').length) fail('sohbet temizlenmedi');
if (!(await apiCall(B.p, 'chat.open', { id: dm.id })).msgs.length) fail('temizleme karşı tarafı etkiledi');
if (!/Birim grubu silinemez/.test(await apiErr(E.p, 'chat.state', { id: unitId, op: 'delete' }))) fail('birim grubu silindi');
await apiCall(E.p, 'chat.state', { id: dm.id, op: 'delete' });
if ((await eList()).some((c) => c.id === dm.id)) fail('silinen sohbet listede');
await apiCall(B.p, 'chat.send', { id: dm.id, body: 'Yeni mesaj' });
const back = (await eList()).find((c) => c.id === dm.id);
if (!back || back.pinned) fail('yeni mesajla sohbet geri gelmedi: ' + JSON.stringify(back));
if ((await apiCall(E.p, 'chat.open', { id: dm.id })).msgs.some((m) => /buluşalım/.test(m.body || ''))) fail('silinen sohbetin eski mesajları geri geldi');
// Ayarlar sayfası (telefon)
await E.p.goto(BASE + '#/mesaj/ayarlar');
await E.p.locator('[data-k=seen_vis]').selectOption('none');
await E.p.waitForFunction(async () => (await api('chat.prefs.get')).prefs.seen_vis === 'none');
await E.p.screenshot({ path: path.join(OUT, 'c-46-ayarlar-mobile.png') });
await noOverflow(E.p, 'mesaj ayarları');
if ((await apiCall(E.p, 'chat.profile', { tk: pBurak.tk, uid: pBurak.uid })).profile.last_seen) fail('son görülmeyi gizleyen başkalarınınkini gördü');
await apiCall(E.p, 'chat.prefs.save', { seen_vis: 'contacts' });
await E.p.goto(BASE + '#/mesaj/yildizli');
await E.p.locator('h1', { hasText: 'Yıldızlı mesajlar' }).waitFor();
step('4.6 sohbet: sabitle (en fazla 3), arşiv, okunmadı işareti, 8 saat sessiz, düzenle (15 dk, T.C. engeli, karşıda “düzenlendi”), benden sil, yıldızlı, arama, bağlantılar, yazıyor (başlıkta), temizle/sil (yeni mesajla geri gelir, eskiler gelmez), ayarlar sayfası, son görülme karşılıklı');

// ---- 8) Telefonda liste ----
await E.p.goto(BASE + '#/mesaj');
await E.p.locator('.ch-row').first().waitFor();
await E.p.screenshot({ path: path.join(OUT, 'c-liste-mobile.png') });
await noOverflow(E.p, 'mesaj listesi');
if (!(await E.p.locator('#chatTopBtn').count())) fail('üst çubukta mesaj simgesi yok');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nMESAJLAŞMA TESTLERİ GEÇTİ');
