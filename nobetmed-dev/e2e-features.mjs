// Yeni özelliklerin uçtan uca testi. e2e.mjs'den SONRA aynı sunucuda çalıştırılır:
//   node e2e-features.mjs http://localhost:8088/ <çıktı klasörü> <site klasörü>
// (localhost: parmak izi/passkey testi IP adresinde çalışmaz)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8088/';
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
async function ctx(tag, mobile, withTour) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1360, height: 860 }, acceptDownloads: true });
  if (!withTour) await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 800)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.locator('#view').waitFor();
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' }).trim();

const A = await ctx('admin');
const a = A.p;
await login(a, 'ayse@test.com', 'Sifre1234');
const M = await ctx('elif', true);
const m = M.p;
await login(m, 'elif@test.com', 'YeniSifre99');

// 1) Ana sayfa: sıradaki nöbet + bugün nöbette
await m.goto(BASE + '#/');
await m.locator('#heroShift .hs-t').waitFor();
const kpi = await m.locator('#heroShift').innerText();
if (!/nöbetin var|nöbettesin/.test(kpi)) fail('Bugün kartı: ' + kpi);
if (!(await m.locator('.hero .hchip[href="#/okunacak"]').count())) fail('okunacak çipi yok');
await m.locator('#todayCard .duty-chip').first().waitFor({ timeout: 8000 }).catch(() => fail('bugün nöbette kartı boş'));
await m.screenshot({ path: path.join(OUT, 'f-home-mobile.png') });
step('ana sayfa: sıradaki nöbet (' + kpi.replace(/\s+/g, ' ').slice(0, 60) + ') ve bugün nöbette');

// 2) Nöbetlerim: sonraki nöbet, ay özeti, takvim, ICS
await m.goto(BASE + '#/nobetim');
await m.locator('.next-shift').waitFor();
const stat = await m.locator('#calCard .cal-stats').first().innerText();
const days = await m.locator('#calCard .cal-d.has').count();
const [dl] = await Promise.all([m.waitForEvent('download'), m.click('#icsBtn')]);
const ics = fs.readFileSync(await dl.path(), 'utf8');
const nEv = (ics.match(/BEGIN:VEVENT/g) || []).length;
if (!ics.startsWith('BEGIN:VCALENDAR') || nEv < 3) fail('ICS hatalı: ' + nEv);
await m.locator('#calCard .cal-d.has').first().waitFor();
const calDays = await m.locator('#calCard .cal-d.has').count();
if (calDays < 5) fail('takvimde renkli gün az: ' + calDays);
if (!(await m.locator('#calCard .cal-legend .code-chip').count())) fail('kod açıklaması yok');
await m.locator('#calCard .cal-d.has').nth(1).click();
await m.locator('#dayPanel .dm-row').waitFor();
await m.locator('#dayDuty .duty-g').first().waitFor();
await m.click('[data-act=cal-mv][data-d="1"]');
await m.click('[data-act=cal-mv][data-d="-1"]');
await m.waitForTimeout(300);
await m.screenshot({ path: path.join(OUT, 'f-nobetim.png'), fullPage: true });
const sw1 = await m.evaluate(() => document.documentElement.scrollWidth);
if (sw1 > 390) fail('nöbetlerim mobil taşma: ' + sw1);
step(`nöbetlerim: ${days} gün, ay özeti "${stat.replace(/\s+/g, ' ')}", ICS ${nEv} nöbet`);

// 3) Profil: fotoğraf, ünvan, telefon, bildirim tercihi
await m.goto(BASE + '#/profil');
await m.setInputFiles('#profBody input[data-change=av-file]', path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture.png'));
await m.locator('.modal .av-preview img').waitFor();
await m.click('.modal [data-ok]');
await expectText(m, 'Profil fotoğrafınız kaydedildi');
await m.locator('#topMe img.av-img').waitFor();
const avOk = await m.evaluate(async () => { const img = document.querySelector('#topMe img.av-img'); await img.decode().catch(() => {}); const r = await fetch(img.src); return { w: img.naturalWidth, st: r.status, ct: r.headers.get('content-type'), src: img.getAttribute('src') }; });
if (avOk.w < 16 || avOk.st !== 200 || !/image\//.test(avOk.ct)) fail('profil fotoğrafı: ' + JSON.stringify(avOk));
const anon = await browser.newContext();
const anonSt = await (await anon.request.get(BASE + avOk.src)).status();
await anon.close();
if (anonSt !== 404) fail('giriş yapmadan profil fotoğrafı açıldı: ' + anonSt);
await m.fill('[data-form=me-profile] [name=phone]', '0532 111 22 33');
await m.fill('[data-form=me-profile] [name=extension]', '4412');
await m.selectOption('[data-form=me-profile] [name=title_id]', { index: 2 });
await m.click('[data-form=me-profile] button[type=submit]');
await expectText(m, 'Profiliniz kaydedildi');
await m.screenshot({ path: path.join(OUT, 'f-profil.png') });
await m.goto(BASE + '#/profil/bildirim');
await m.click('[data-act=nmode][data-m=digest]');
await expectText(m, 'Bildirim tercihiniz kaydedildi');
const me = (await apiCall(m, 'boot')).me;
if (me.phone !== '0532 111 22 33' || me.notify_mode !== 'digest' || !me.avatar || !me.title_id) fail('profil kaydedilmedi: ' + JSON.stringify(me));
step('profil: fotoğraf (girişsiz erişim kapalı), ünvan, telefon/dahili, sabah özeti');

// 4) Rehber: kişi, ara düğmesi, bugün filtresi
await a.goto(BASE + '#/rehber');
await a.locator('#dutyCard .duty-g').first().waitFor();
await a.click('#dutyCard [data-act=duty-day][data-d="1"]');
await a.locator('#dutyCard .duty-g').first().waitFor();
await a.locator('.dir-row').first().waitFor();
if ((await a.locator('.hub-tabs a.on').innerText()).trim() !== 'Kim nöbette') fail('nöbet sekmesi seçili değil');
const elifRow = a.locator('.dir-row', { hasText: 'Elif Yılmaz' });
if (!(await elifRow.locator('a[href^="tel:"]').count())) fail('rehberde ara düğmesi yok');
if (!(await elifRow.locator('a[href*="wa.me/905321112233"]').count())) fail('rehberde WhatsApp yok');
await a.fill('[data-input=dir-q]', 'elif');
await a.waitForTimeout(300);
if ((await a.locator('.dir-row').count()) !== 1) fail('rehber araması');
await a.fill('[data-input=dir-q]', '');
await a.click('[data-act=dir-f][data-f=today]');
await a.waitForTimeout(200);
await a.screenshot({ path: path.join(OUT, 'f-rehber.png') });
step('ekip rehberi: arama, ara/WhatsApp, bugün nöbette filtresi');

// 5) Belge içinde arama
await a.goto(BASE + '#/ara/aPTT');
await a.locator('.post .p-match').first().waitFor();
const pm = await a.locator('.post .p-match').first().innerText();
if (!/cift-kontrol-protokolu\.pdf/.test(pm) || !(await a.locator('.post .p-match mark').count())) fail('belge içi arama: ' + pm);
step('belge içinde arama: "aPTT" PDF ekinde bulundu');

// 6) Şablon + geçerlilik tarihi + WhatsApp paylaş
await a.goto(BASE + '#/');
await a.click('.topbar [data-act=compose]');
await a.locator('#tplBox .chip-btn').first().waitFor();
await a.locator('#tplBox .chip-btn').first().click();
const body = await a.inputValue('#composer [name=body]');
if (body.length < 20) fail('şablon metni gelmedi');
await a.fill('#composer [name=title]', 'Enfeksiyon kontrol talimatı (test)');
const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
await a.fill('#composer [name=review_at]', soon);
await a.click('[data-act=tpl-save]');
await expectText(a, 'Şablon kaydedildi');
await a.click('.modal-foot button[type=submit]');
await expectText(a, 'İçerik yayınlandı');
await a.click('.post >> text=Enfeksiyon kontrol talimatı');
await a.locator('.modal [data-act=wa-share]').waitFor();
if (!(await a.locator('.modal .badge', { hasText: 'Gözden geçir' }).count())) fail('gözden geçirme rozeti yok');
await a.keyboard.press('Escape');
step('duyuru şablonu, şablon kaydetme, geçerlilik tarihi, WhatsApp paylaş');

// 7) Okuma raporu + Excel
await a.goto(BASE + '#/yonetim/raporlar');
await a.locator('[data-act=rep-xlsx]').waitFor();
const [rx] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=rep-xlsx]')]);
const xbuf = fs.readFileSync(await rx.path());
if (xbuf[0] !== 0x50 || xbuf.length < 4000) fail('okuma raporu xlsx değil');
if (!(await a.locator('text=Enfeksiyon kontrol talimatı').count())) fail('gözden geçirilecekler listesinde yok');
await a.screenshot({ path: path.join(OUT, 'f-rapor.png'), fullPage: true });
step(`okuma raporu + Excel indirme (${xbuf.length} bayt)`);

// 8) İşlem günlüğü
await a.goto(BASE + '#/yonetim/gunluk');
await a.locator('.audit-row').first().waitFor();
const nAud = await a.locator('.audit-row').count();
await a.fill('[data-input=aud-q]', 'Nöbet');
await a.waitForTimeout(600);
const audTxt = await a.locator('#audList').innerText();
if (nAud < 10 || !/liste/i.test(audTxt)) fail('işlem günlüğü: ' + nAud);
step(`işlem günlüğü: ${nAud} kayıt, arama çalışıyor`);

// 9) Yedekleme
await a.goto(BASE + '#/yonetim/ayarlar/yedek');
await a.locator('#backupBox [data-act=bk-create]').waitFor();
await a.click('#backupBox [data-act=bk-create]');
await expectText(a, 'Yedek alındı');
await a.locator('#backupBox [data-act=bk-del]').first().waitFor();
const bk = await a.evaluate(async () => { const r = await fetch(`api.php?action=backup.download&csrf=${encodeURIComponent(S.csrf)}&full=0`); const b = new Uint8Array(await r.arrayBuffer()); return { st: r.status, cd: r.headers.get('content-disposition'), len: b.length, head: String.fromCharCode(...b.slice(0, 15)) }; });
if (bk.st !== 200 || !/SQLite format|^PK/.test(bk.head)) fail('yedek indirme: ' + JSON.stringify(bk));
const bkBad = await m.evaluate(async () => (await fetch(`api.php?action=backup.download&csrf=${encodeURIComponent(S.csrf)}&full=0`)).status);
if (bkBad !== 403) fail('üye yedek indirebildi: ' + bkBad);
const bkNoCsrf = await a.evaluate(async () => (await fetch('api.php?action=backup.download&full=0')).status);
if (bkNoCsrf === 200) fail('CSRF olmadan yedek indirildi');
step(`yedekleme: oluşturma, indirme (${bk.len} bayt), yetki`);

// 10) Hatırlatmalar ve sabah özeti (cron)
await a.goto(BASE + '#/yonetim/ayarlar/bildirim');
await a.locator('[name=shift_remind_hour]').waitFor();
await a.selectOption('[name=shift_remind_hour]', '0');
if (!(await a.isChecked('[name=digest_on]'))) await a.click('.switch:has([name=digest_on]) .track');
await a.selectOption('[name=digest_hour]', '0');
await a.click('form[data-form=settings] button[type=submit]');
await expectText(a, 'Ayarlar kaydedildi');
const cronOut = cron();
console.log('  cron:', cronOut);
if (!/shift|digest|review/.test(cronOut)) fail('cron görevleri çalışmadı');
step('cron: hatırlatma, sabah özeti, gözden geçirme görevleri');

// 11) Bildirim merkezi
await m.goto(BASE + '#/');
await m.reload();
await m.locator('#notifBtn').waitFor();
await m.waitForTimeout(500);
const badge = await m.locator('#notifCount').innerText().catch(() => '');
await m.click('#notifBtn');
await m.locator('.notif-pop .np-item').first().waitFor();
const nItems = await m.locator('.notif-pop .np-item').count();
if (!(await m.locator('.notif-pop .np-sec').count())) fail('bildirim grupları yok');
await m.screenshot({ path: path.join(OUT, 'f-notif.png') });
await m.click('[data-act=notif-readall]');
await m.waitForTimeout(300);
if (!(await m.locator('#notifCount.hidden').count())) fail('tümünü okundu sayınca rozet kaybolmadı');
step(`bildirim merkezi: rozet ${badge || 0}, ${nItems} bildirim, tümünü okundu`);

// 12) QR ile kayıt (genel davet)
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.click('[data-act=inv-qr]');
await a.click('.modal [data-qr-make]');
await a.locator('#qrPrint svg path').waitFor();
const qrUrl = await a.locator('.modal #qrOut input[readonly]').inputValue();
if (!/\?davet=[A-Za-z0-9_-]{8,}/.test(qrUrl)) fail('QR bağlantısı: ' + qrUrl);
await a.screenshot({ path: path.join(OUT, 'f-qr.png') });
await a.keyboard.press('Escape');
const Q = await ctx('qr', true);
await Q.p.goto(qrUrl.replace('http://127.0.0.1', 'http://localhost'));
await expectText(Q.p, 'Portala katıl');
await Q.p.fill('[data-form=invite-reg] [name=name]', 'Can Aydın');
await Q.p.fill('[data-form=invite-reg] [name=email]', 'can@test.com');
await Q.p.fill('[data-form=invite-reg] [name=password]', 'CanSifre123');
await Q.p.click('[data-form=invite-reg] button[type=submit]');
await expectText(Q.p, 'Kaydınız alındı');
step('QR davetle kayıt: form açıldı, kayıt onaya düştü');

// 13) Nöbet listesinden kişiye özel davet
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.click('[data-act=inv-roster]');
await a.locator('.modal tbody tr').first().waitFor();
const cand = await a.locator('.modal tbody tr').count();
const firstName = (await a.locator('.modal tbody tr td b').first().innerText()).trim();
await a.locator('.modal tbody input[type=checkbox]').evaluateAll((els) => els.forEach((e, i) => { e.checked = i === 0; }));
await a.click('.modal [data-inv-go]');
await expectText(a, 'Davetler hazır');
const link = await a.locator('.modal [data-copy]').first().getAttribute('data-copy');
await a.keyboard.press('Escape');
const P = await ctx('invite', true, true);
await P.p.goto(link.replace('http://127.0.0.1', 'http://localhost'));
await expectText(P.p, 'Hoş geldin');
if (!(await P.p.locator('[data-form=invite-reg] [name=name][readonly]').count())) fail('kişisel davette ad kilitli değil');
await P.p.fill('[data-form=invite-reg] [name=email]', 'davetli@test.com');
await P.p.fill('[data-form=invite-reg] [name=password]', 'DavetSifre1');
await P.p.click('[data-form=invite-reg] button[type=submit]');
await expectText(P.p, 'Hesabın oluşturuldu');
// İlk girişte 3 adımlık tanıtım
await P.p.locator('.tour .tour-step').waitFor({ timeout: 6000 });
await P.p.screenshot({ path: path.join(OUT, 'f-tour.png') });
await P.p.click('[data-tour=next]'); await P.p.click('[data-tour=next]');
await P.p.click('[data-tour=done]');
await P.p.locator('.tour').waitFor({ state: 'detached' });
// Davetle gelen kişi e-postasını değiştirir (yanlış şifre reddedilir)
await P.p.goto(BASE + '#/profil');
await P.p.fill('[data-form=me-email] [name=email]', 'davetli2@test.com');
await P.p.fill('[data-form=me-email] [name=current]', 'yanlis-sifre');
await P.p.click('[data-form=me-email] button[type=submit]');
await expectText(P.p, 'Şifre hatalı');
await P.p.fill('[data-form=me-email] [name=current]', 'DavetSifre1');
await P.p.click('[data-form=me-email] button[type=submit]');
await expectText(P.p, 'E-posta adresiniz değiştirildi');
if ((await apiCall(P.p, 'boot')).me.email !== 'davetli2@test.com') fail('e-posta değişmedi');
await P.p.goto(BASE + '#/nobetim');
await P.p.locator('.next-shift, .card.empty').first().waitFor();
const hasNext = await P.p.locator('.next-shift').count();
const reuse = await P.p.evaluate(async (tok) => { try { await api('invite.get', { token: tok }); return 'ok'; } catch (e) { return e.message; } }, link.split('davet=')[1]);
if (reuse === 'ok') fail('kişisel davet ikinci kez kullanılabiliyor');
step(`listeden davet: ${cand} aday, "${firstName}" davetle doğrudan girdi${hasNext ? ', nöbetlerini görüyor' : ''}, bağlantı tek kullanımlık`);

// 14) Parmak izi / Face ID (sanal doğrulayıcı)
const cdp = await M.c.newCDPSession(m);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await m.goto(BASE + '#/profil/guvenlik');
await m.locator('#pkBox [data-act=pk-add]').waitFor();
await m.click('#pkBox [data-act=pk-add]');
await expectText(m, 'Parmak izi / Face ID eklendi');
await m.locator('#pkBox [data-act=pk-del]').waitFor();
await m.evaluate(() => logout());
await m.locator('[data-act=pk-login]').waitFor();
await m.click('[data-act=pk-login]');
await m.locator('#shell').waitFor({ timeout: 8000 });
const who = await m.evaluate(() => S.me && S.me.email);
if (who !== 'elif@test.com') fail('passkey girişi: ' + who);
step('parmak izi / Face ID: eklendi, şifresiz giriş yapıldı');

// 15) Çevrimdışı görüntüleme
await m.evaluate(() => navigator.serviceWorker.ready);
await m.goto(BASE);
await m.locator('#view .post').first().waitFor();
await m.goto(BASE + '#/nobet');
await m.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 });
await m.goto(BASE + '#/nobetim');
await m.locator('.next-shift').waitFor();
await m.waitForTimeout(800);
await M.c.setOffline(true);
await m.reload();
await m.locator('#view').waitFor({ timeout: 8000 });
await m.locator('.offline-bar').waitFor({ timeout: 8000 });
await m.locator('.next-shift').waitFor({ timeout: 8000 });
await m.goto(BASE + '#/');
await m.locator('#view .post').first().waitFor({ timeout: 8000 });
await m.goto(BASE + '#/nobet');
const offGrid = await m.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
await m.screenshot({ path: path.join(OUT, 'f-offline.png') });
if (!offGrid) fail('çevrimdışı nöbet listesi açılmadı');
await M.c.setOffline(false);
step('çevrimdışı: kabuk, duyurular, nöbetlerim ve Excel liste internetsiz açıldı');

// 16) Push uç noktaları ve güvenlik
const pk = await apiCall(m, 'push.key').catch((e) => ({ error: e.message }));
const badEp = await m.evaluate(async () => { try { await api('push.subscribe', { endpoint: 'https://evil.example.com/x', p256dh: 'a', auth: 'b' }); return 'ok'; } catch (e) { return e.message; } });
if (badEp === 'ok') fail('bilinmeyen push adresi kabul edildi');
const pend = await m.evaluate(async () => (await fetch('api.php?action=push.pending')).status);
if (pend !== 400) fail('push.pending başlıksız: ' + pend);
step(`push: anahtar ${pk.key ? 'hazır' : 'yok (' + (pk.error || '') + ')'}, yabancı adres reddedildi, başlıksız istek reddedildi`);

// 17) Excel: Sadece ben
await m.goto(BASE + '#/nobet');
await m.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 });
await m.click('#rsTabs button >> nth=0');
await m.locator('.rs-view:not(.hidden) .xv-grid >> text=HEMŞİRE NÖBET').waitFor();
const rowsAll = await m.locator('.rs-view:not(.hidden) .xv-grid tbody tr').count();
await m.click('.rs-view:not(.hidden) .xv-only');
await m.waitForTimeout(400);
const rowsMe = await m.locator('.rs-view:not(.hidden) .xv-grid tbody tr').count();
const meVisible = await m.locator('.rs-view:not(.hidden) .xv-grid td.me').count();
await m.screenshot({ path: path.join(OUT, 'f-onlyme.png') });
if (!(rowsMe < rowsAll && meVisible)) fail(`sadece ben: ${rowsAll} → ${rowsMe}, me=${meVisible}`);
await m.click('.rs-view:not(.hidden) .xv-only');
step(`Excel "Sadece ben": ${rowsAll} satır → ${rowsMe} satır`);

// 18) Ayar bölümleri + nöbet kodu sözlüğü
await a.goto(BASE + '#/yonetim/ayarlar/nobet');
await a.locator('#codesBox tbody tr').first().waitFor();
const visCards = await a.locator('form[data-form=settings] [data-sec]:not(.hidden)').count();
const allCards = await a.locator('form[data-form=settings] [data-sec]').count();
if (visCards >= allCards) fail('ayar bölümleri ayrılmıyor');
await a.click('[data-act=code-add]');
const last = a.locator('#codesBox tbody tr').last();
await last.locator('input[data-k=code]').fill('X9');
await last.locator('input[data-k=label]').fill('Test vardiyası');
await last.locator('input[data-k=start]').fill('09:00');
await last.locator('input[data-k=end]').fill('17:00');
await a.click('[data-act=code-save]');
await expectText(a, 'Kodlar kaydedildi');
const codes = (await apiCall(a, 'boot')).settings.shift_codes || [];
const x9 = codes.find((c) => c.code === 'X9');
if (!x9 || x9.hours !== 8) fail('kod kaydedilmedi: ' + JSON.stringify(x9));
await a.click('[data-act=set-sec][data-s=bildirim]');
if (!(await a.locator('[data-sec=bildirim]:not(.hidden)').count())) fail('bildirim bölümü açılmadı');
await a.click('[data-act=set-sec][data-s=nobet]');
await a.click('[data-act=code-reset]');
await a.click('.modal [data-ok]');
await expectText(a, 'Varsayılan kodlar');
step(`ayarlar ${allCards} kart → bölüm başına ${visCards}; kod sözlüğü kaydet/varsayılan`);

// 19) Kurulum listesi + büyük yazı
await a.goto(BASE + '#/');
await a.locator('#setupBox .setup-row').first().waitFor();
const su = await a.locator('#setupBox .setup-row').count();
const suOk = await a.locator('#setupBox .setup-row.ok').count();
await m.goto(BASE + '#/profil/gorunum');
await m.click('[data-act=fs][data-v=lg]');
if (!(await m.evaluate(() => document.documentElement.classList.contains('fs-lg')))) fail('büyük yazı açılmadı');
await m.reload();
if (!(await m.evaluate(() => document.documentElement.classList.contains('fs-lg')))) fail('büyük yazı hatırlanmadı');
await m.goto(BASE + '#/');
await m.locator('#heroShift .hs-t').waitFor();
await m.screenshot({ path: path.join(OUT, 'f-home-buyuk.png') });
await m.goto(BASE + '#/profil/gorunum');
await m.click('[data-act=fs][data-v=""]');
step(`kurulum listesi ${suOk}/${su}, büyük yazı seçeneği`);

// 20) Profil fotoğrafı rehberde ve yönetici kaldırabiliyor
await a.goto(BASE + '#/rehber');
await a.click('[data-act=dir-f][data-f=all]');
await a.locator('.dir-row', { hasText: 'Elif Yılmaz' }).locator('img.av-img').waitFor();
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.locator('tr', { hasText: 'Elif Yılmaz' }).locator('[data-act=u-menu]').click();
await a.click('.menu >> text=Profil fotoğrafını kaldır');
await a.click('.modal [data-ok]');
await expectText(a, 'Profil fotoğrafı kaldırıldı');
step('profil fotoğrafı rehberde görünüyor; yönetici kaldırabiliyor');

// 21) Logo ve favicon ayarı + boyut; telefonda üst çubukta logo
await a.goto(BASE + '#/yonetim/ayarlar/genel');
await a.locator('#brandCard').waitFor();
await a.setInputFiles('#brandCard input[data-change=brand-logo][data-k=logo]', path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture.png'));
await expectText(a, 'Açık mod logosu güncellendi');
await a.setInputFiles('#brandCard input[data-change=brand-logo][data-k=logo_dark]', path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'kurum-logosu.png'));
await expectText(a, 'Koyu mod logosu güncellendi');
const themeLogo = async (t) => a.evaluate((th) => { document.documentElement.setAttribute('data-theme', th); const v = [...document.querySelectorAll('.sidebar .brand-img')].filter((i) => getComputedStyle(i).display !== 'none'); return v.length === 1 ? v[0].getAttribute('src') : 'yok:' + v.length; }, t);
const lightSrc = await themeLogo('light'), darkSrc = await themeLogo('dark');
await themeLogo('light');
if (!/f=logo&/.test(lightSrc) || !/f=logo_dark&/.test(darkSrc)) fail(`tema logoları: ${lightSrc} / ${darkSrc}`);
await a.setInputFiles('#brandCard input[data-change=brand-icon]', path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture.png'));
await expectText(a, 'Favicon ve uygulama simgesi güncellendi');
await a.locator('#brandCard input[data-input=brand-h]').fill('48');
await expectText(a, 'Logo boyutu kaydedildi');
const br = await a.evaluate(async () => ({ side: getComputedStyle(document.querySelector('.sidebar .brand-img')).height, fav: document.getElementById('favicon').getAttribute('href'), man: (await (await fetch('manifest.php')).json()).icons.length }));
if (br.side !== '48px' || !/action=brand/.test(br.fav) || br.man !== 2) fail('logo ayarı: ' + JSON.stringify(br));
await m.goto(BASE + '#/');
await m.reload();
await m.locator('.topbar .top-logo img.brand-img.logo-light').waitFor();
await a.click('#brandCard [data-act=brand-del][data-k=logo]');
await expectText(a, 'Açık mod logosu kaldırıldı');
await a.click('#brandCard [data-act=brand-del][data-k=logo_dark]');
await expectText(a, 'Koyu mod logosu kaldırıldı');
step('açık/koyu mod logoları, favicon, boyut ayarı, telefonda üst çubukta logo');

// 22) Telefon rehberi: yapıştırarak toplu ekleme, acil numara, santral, arama, ters arama, sık arananlar, yetki
await a.goto(BASE + '#/telefon');
await expectText(a, 'Rehber henüz boş');
await a.locator('.empty [data-act=pb-import]').click();
await a.fill('#pbPaste', 'LABORATUVAR\nBiyokimya\t2310\nKan merkezi: 2315 / 2316\nRADYOLOJİ\nRöntgen - 2401\n2405 Tomografi\nDış hat hasta hakları\t0312 000 00 00\tİdari');
await a.waitForTimeout(400);
const impTxt = (await a.locator('#pbImpBtn').innerText()).trim();
if (impTxt !== '5 numarayı ekle') fail('yapıştırma önizlemesi: ' + impTxt);
await a.click('#pbImpBtn');
await expectText(a, '5 numara eklendi');
const grp = await a.locator('#pbList .sec-title').allInnerTexts();
if (grp.map((x) => x.trim()).join('|') !== 'LABORATUVAR|RADYOLOJİ|Ekip') fail('rehber grupları: ' + grp.join('|'));
if ((await a.locator('#pbList .pb-row', { hasText: 'Kan merkezi' }).locator('.pb-num').count()) !== 2) fail('iki numaralı satır');
await a.click('.page-head [data-act=pb-add]');
await a.fill('.modal [name=name]', 'Beyaz kod');
await a.fill('.modal [name=number]', '1111');
await a.locator('.modal [name=pinned]').check({ force: true });
await a.click('.modal [type=submit]');
await expectText(a, 'Kaydedildi');
if (!(await a.locator('.pb-pinned .pb-row', { hasText: 'Beyaz kod' }).count())) fail('acil numara üstte değil');
if (await a.locator('#pbList a.pb-num[href*="2310"]').count()) fail('santral yokken dahili tel: bağlantısı olmamalı');
await a.click('.pb-tip [data-act=pb-santral]');
await a.fill('.modal [name=santral]', '0312 555 00 00');
await a.click('.modal [data-ok]');
await expectText(a, 'Santral kaydedildi');
if ((await a.locator('#pbList a.pb-num[href="tel:03125550000,2310"]').count()) !== 1) fail('santral + dahili bağlantısı');
await a.click('.page-head [data-act=pb-santral]');
await a.locator('.modal [name=dial][value=ask]').check();
await a.click('.modal [data-ok]');
await a.locator('#pbList a.pb-num[href="tel:03125550000;2310"]').waitFor();
await a.click('.page-head [data-act=pb-santral]');
await a.locator('.modal [name=dial][value=auto]').check();
await a.click('.modal [data-ok]');
await a.locator('#pbList a.pb-num[href="tel:03125550000,2310"]').waitFor();
const bad = await apiCall(a, 'phonebook.save', { name: 'Kötü', number: 'abc<script>' }).then(() => 'kabul', (e) => e.message);
if (!/yalnızca rakam/.test(bad)) fail('geçersiz numara: ' + bad);
// Telefon: üst çubuktan aç, ara, ters ara, sık arananlara ekle; düzenleme yetkisi yok
await m.goto(BASE + '#/');
await m.click('.topbar a[href="#/telefon"]');
await m.locator('#pbList .pb-row').first().waitFor();
if (await m.locator('[data-act=pb-add], [data-act=pb-edit]').count()) fail('üye rehberi düzenleyebiliyor');
await m.fill('#pbQ', 'biyo');
await m.waitForTimeout(300);
if ((await m.locator('#pbList .pb-row').count()) !== 1) fail('rehber araması (biyo)');
await m.fill('#pbQ', '2316');
await m.waitForTimeout(300);
if ((await m.locator('#pbList .pb-row .lr-t').allInnerTexts()).join() !== 'Kan merkezi') fail('ters arama (2316)');
await m.fill('#pbQ', 'elif');
await m.waitForTimeout(300);
if (!(await m.locator('#pbList .pb-row', { hasText: 'Elif Yılmaz' }).count())) fail('rehber aramasında ekip yok');
await m.fill('#pbQ', '');
await m.locator('#pbList .pb-row', { hasText: 'Röntgen' }).locator('[data-act=pb-fav]').click();
await m.waitForTimeout(200);
if ((await m.locator('#pbList .sec-title').first().innerText()).trim() !== 'Sık aradıklarım') fail('sık arananlar en üstte değil');
const memberSave = await apiCall(m, 'phonebook.save', { name: 'Deneme', number: '1234' }).then(() => 'kabul', (e) => e.message);
if (!/yetki/.test(memberSave)) fail('üye numara ekleyebildi: ' + memberSave);
const ov = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (ov > 0) fail('rehber telefonda yatay taşıyor: ' + ov);
await m.screenshot({ path: path.join(OUT, 'f-telefon-mobil.png') });
await a.screenshot({ path: path.join(OUT, 'f-telefon-desktop.png') });
await a.click('.page-head [data-act=pb-import]');
await a.setInputFiles('#pbFile', { name: 'rehber.csv', mimeType: 'text/csv', buffer: Buffer.from('HORMON LAB\nHormon;2330\nTiroid;2331 / 2332\n') });
await expectText(a, 'rehber.csv okundu');
if ((await a.locator('#pbImpBtn').innerText()).trim() !== '2 numarayı ekle') fail('dosyadan rehber önizlemesi: ' + await a.locator('#pbImpBtn').innerText());
await a.setInputFiles('#pbFile', { name: 'rehber2.csv', mimeType: 'text/csv', buffer: Buffer.from('Grup;Ad;Numara;Not\n112 Servisi;Ambulans Desk;1199;\nACİL;Kırmızı alan;1161;gece 1162\n') });
await expectText(a, 'rehber2.csv okundu');
const prevTxt = await a.locator('#pbPrev').innerText();
if ((await a.locator('#pbImpBtn').innerText()).trim() !== '2 numarayı ekle' || !/Ambulans Desk\s+1199\s+112 Servisi/.test(prevTxt)) fail('başlıklı sütunlar okunmadı: ' + prevTxt.slice(0, 200));
await a.click('.modal [data-act=close-modal]');
await a.locator('.modal [data-ok]').click();
await a.locator('.modal').first().waitFor({ state: 'detached' });
step('telefon rehberi: yapıştırarak 5 numara, Excel/CSV dosyasından (başlıklı sütunlar dahil), acil numara, santral ile dahili arama (tuşlama şekli), arama/ters arama/ekip, sık arananlar, yetki');

// 23) Google E-Tablolar: kod gönderimi, sekme→liste bağlama, salt okunur, değişiklik bildirimi, ikinci (görüntüleme) tablosu
await a.goto(BASE + '#/yonetim/ayarlar/nobet');
await a.locator('#gsCard #gsSheet').waitFor();
await a.fill('#gsSheet', 'https://docs.google.com/spreadsheets/d/1TestTestTestTestTestTestTestTestTestTest12/edit#gid=0');
await a.click('[data-act=gs-add-save]');
await a.locator('#gsCode').waitFor();
let gsAll = (await apiCall(a, 'gsync.get')).gs;
const gs = { token: gsAll.token };
const srcN = gsAll.sources[0];
if (!/liste: '.*gsync\.tables'/.test(await a.locator('#gsCode').innerText()) || !gs.token || srcN.purpose !== 'nobet') fail('Apps Script kodu/anahtar/tablo');
const now = new Date();
const ym0 = { y: now.getFullYear(), m: now.getMonth() + 1 };
const nx = new Date(ym0.y, ym0.m, 1);
const ym1 = { y: nx.getFullYear(), m: nx.getMonth() + 1 };
const MN = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const P1 = { 'Elif Yılmaz': { 1: '8 16', 3: '8 8', 5: '16 8', 7: '8 16', 10: '8 8', 12: '8 16', 13: '8 8' }, 'Burak Demir': { 1: '8 16', 5: '16 8', 8: '8 8', 10: '8 16', 13: '8 8' }, 'Ayşe Kaya': { 2: '8 8', 5: '8 16', 13: '8 8' }, 'Deniz Şahin': { 4: '8 8', 9: '8 8' } };
const P0 = { 'Elif Yılmaz': { 26: '8 8', 28: '8 16', 30: '8 8' }, 'Burak Demir': { 27: '8 8', 29: '8 16' }, 'Ayşe Kaya': { 26: '8 16' }, 'Deniz Şahin': { 25: '8 8' } };
const P2 = { 'Kemal Bulut': { 5: '8 8', 13: '16 8' }, 'Merve Kaplan': { 6: '8 8' } };
const book = (v) => a.evaluate(async ([v, ym0, ym1, MN, P0, P1, P2]) => {
  await loadVendor('exceljs');
  const wb = new ExcelJS.Workbook();
  const tab = (name, y, m, people) => {
    const ws = wb.addWorksheet(name);
    ws.getCell(5, 4).value = 'AYLIK NÖBET ÜCRET ÇİZELGESİ';
    ws.getCell(7, 20).value = 'AİT OLDUĞU DÖNEM'; ws.getCell(7, 26).value = y; ws.getCell(7, 27).value = m;
    const days = new Date(y, m, 0).getDate();
    ws.getCell(9, 2).value = 'PERSONEL LİSTESİ'; ws.getCell(9, 3).value = 'ÜNVANI';
    for (let d = 1; d <= days; d++) { ws.getCell(9, 3 + d).value = d; ws.getCell(10, 3 + d).value = ['Paz.', 'Pzt.', 'Sal.', 'Çar.', 'Per.', 'Cum.', 'Cmt.'][new Date(y, m - 1, d).getDay()]; }
    Object.entries(people).forEach(([nm, codes], i) => { ws.getCell(11 + i, 1).value = i + 1; ws.getCell(11 + i, 2).value = nm.toLocaleUpperCase('tr'); ws.getCell(11 + i, 3).value = 'HEMŞİRE'; Object.entries(codes).forEach(([d, c]) => { ws.getCell(11 + i, 3 + +d).value = c; }); });
    ws.getCell(11 + Object.keys(people).length + 1, 3).value = 'Topl Saat';
  };
  const p1 = JSON.parse(JSON.stringify(P1));
  if (v >= 2) p1['Elif Yılmaz'][12] = '16 8';
  if (v >= 3) { delete p1['Elif Yılmaz'][3]; p1['Elif Yılmaz'][8] = '8 8'; delete p1['Burak Demir'][8]; p1['Burak Demir'][3] = '8 8'; }
  tab(MN[ym0.m - 1], ym0.y, ym0.m, { 'Selin Arslan': { 3: '8 8' } });
  tab(MN[ym0.m - 1] + ' 2.BASAMAK', ym0.y, ym0.m, { 'Kemal Bulut': { 26: '8 8' } });
  tab(MN[ym0.m - 1] + ' 3, BASAMAK', ym0.y, ym0.m, P0);
  tab(MN[ym1.m - 1] + ' 3.BASAMAK', ym1.y, ym1.m, p1);
  tab(MN[ym1.m - 1] + ' 2.BASAMAK', ym1.y, ym1.m, P2);
  const buf = await wb.xlsx.writeBuffer();
  let bin = ''; new Uint8Array(buf).forEach((x) => { bin += String.fromCharCode(x); });
  return btoa(bin);
}, [v, ym0, ym1, MN, P0, P1, P2]);
const push = async (body, token, type = 'application/octet-stream') => {
  const r = await fetch(BASE + 'api.php?action=gsync.push', { method: 'POST', headers: { 'X-Sync-Token': token, 'Content-Type': type, 'X-Title': encodeURIComponent('YOĞUN BAKIM') }, body });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const badTok = await push(Buffer.from(await book(1), 'base64'), 'yanlis');
if (badTok.status !== 403) fail('yanlış anahtar kabul edildi: ' + badTok.status);
const p1r = await push(Buffer.from(await book(1), 'base64'), gs.token);
if (p1r.status !== 200 || !p1r.json.changed) fail('ilk gönderim: ' + JSON.stringify(p1r));
const same = await push(Buffer.from(await book(1), 'base64'), gs.token);
if (!same.json || same.json.changed) fail('aynı dosya değişiklik sayıldı: ' + JSON.stringify(same.json));
await a.reload();
await a.locator('#gsCard [data-change=gs-bind]').first().waitFor();
const kinds = (await apiCall(a, 'gsync.get')).gs.sources[0].kinds.map((k) => k.kind + ':' + k.label).sort().join('|');
if (kinds !== '2basamak:2. BASAMAK|3basamak:3. BASAMAK|:Ay adı (genel liste)') fail('sekme türleri: ' + kinds);
const c3 = await apiCall(a, 'gsync.create', { name: '3. Basamak (B blok)', kind: '3basamak', source_id: srcN.id });
const c2 = await apiCall(a, 'gsync.create', { name: '2. Basamak (A-C blok)', kind: '2basamak', source_id: srcN.id });
const linked = c2.gs.rosters.filter((r) => r.linked);
if (linked.length !== 2 || !/kayıt/.test(linked[0].status || '')) fail('bağlama: ' + JSON.stringify(linked));
const r3 = linked.find((r) => r.tab === '3basamak').id, r2 = linked.find((r) => r.tab === '2basamak').id;
const p2 = (n) => String(n).padStart(2, '0');
const d1 = (d) => `${ym1.y}-${p2(ym1.m)}-${p2(d)}`;
const myE = await apiCall(m, 'shifts.my');
if (!myE.entries.some((e) => e.date === d1(3) && e.code === '8 8' && e.roster === '3. Basamak (B blok)')) fail('Elif sonraki ay nöbeti okunmadı');
const upl = await apiCall(a, 'rosters.upload', { id: r3, attachment_id: 1 }).then(() => 'kabul', (e) => e.message);
if (!/Google E-Tablolar/.test(upl)) fail('bağlı listeye yükleme engellenmedi: ' + upl);
const per = await apiCall(a, 'rosters.period', { id: r3, period: '2026-01' }).then(() => 'kabul', (e) => e.message);
if (!/Google E-Tablolar/.test(per)) fail('bağlı listenin ayı değişti: ' + per);
await a.goto(BASE + '#/nobet/' + r3);
await expectText(a, 'Google E-Tablolar’a bağlı');
await a.locator('.xv-tabs button').first().waitFor();
const vt = await a.locator('.xv-tabs button').allInnerTexts();
if (vt.length !== 2 || !vt.every((t) => /BASAMAK/.test(t) && /3/.test(t)) || !(await a.locator('.xv-tabs button.on').innerText()).startsWith(MN[ym0.m - 1])) fail('liste sekmeleri yalnızca bu listenin ayları olmalı: ' + vt.join(' | '));
if (await a.locator('#rsInfo [data-change=rs-file]').count()) fail('bağlı listede yükleme düğmesi var');
// Değişiklik: Elif'in sonraki ay 12. günü 8 16 -> 16 8
const nBefore = (await apiCall(m, 'notif.list')).items.length;
const p2r = await push(Buffer.from(await book(2), 'base64'), gs.token);
if (!p2r.json || !p2r.json.changed) fail('ikinci gönderim: ' + JSON.stringify(p2r.json));
const nl = (await apiCall(m, 'notif.list')).items;
const chg = nl.find((x) => /Nöbetinde değişiklik/.test(x.title));
if (!chg || !/8 16 → 16 8/.test(chg.body) || nl[0] !== chg || nl.filter((x) => /Nöbetinde değişiklik/.test(x.title)).length !== 1) fail('değişiklik bildirimi: ' + JSON.stringify(nl.slice(0, 2)) + ' önce ' + nBefore);
// İndirme kapalı tablolar: görünen değerlerle (JSON) gönderim
const grid = await push(JSON.stringify({ title: 'YOĞUN BAKIM', grid: [{ name: MN[ym1.m - 1] + ' 3.BASAMAK', values: [['', 'PERSONEL', 'ÜNVANI', ...Array.from({ length: 28 }, (_, i) => String(i + 1))], ['1', 'ELİF YILMAZ', 'HEMŞİRE', '8 8']], merges: [] }] }), gs.token, 'application/json');
if (grid.status !== 200) fail('JSON gönderimi: ' + JSON.stringify(grid));
await push(Buffer.from(await book(2), 'base64'), gs.token);
// İkinci tablo: hasta listesi (yalnızca görüntüleme); kod tablo listesini sunucudan alır
const HS = '1HastaHastaHastaHastaHastaHastaHasta123456';
const hs = await apiCall(a, 'gsync.source.save', { sheet: 'https://docs.google.com/spreadsheets/d/' + HS + '/edit', name: 'Hasta listesi', purpose: 'tablo' });
const tl = await (await fetch(BASE + 'api.php?action=gsync.tables', { headers: { 'X-Sync-Token': gs.token } })).json();
if (!tl.tables || tl.tables.length !== 2 || !tl.tables.includes(HS)) fail('tablo listesi: ' + JSON.stringify(tl));
const hasta = await a.evaluate(async () => { await loadVendor('exceljs'); const wb = new ExcelJS.Workbook(); const w1 = wb.addWorksheet('B BLOK'); w1.addRow(['Yatak', 'Hastanın Adı Soyadı', 'Tanı']); w1.addRow(['1', 'Mehmet Ali Kaplanoğlu', 'Pnömoni']); w1.addRow(['2', { richText: [{ text: 'Zeynep ' }, { text: 'Karakurtlu' }] }, 'KKY']); const w2 = wb.addWorksheet('A BLOK'); w2.addRow(['Yatak', 'Hasta']); wb.addWorksheet('ESKİ').state = 'hidden';
  const buf = await wb.xlsx.writeBuffer(); let bin = ''; new Uint8Array(buf).forEach((x) => { bin += String.fromCharCode(x); }); return btoa(bin); });
const hp = await fetch(BASE + 'api.php?action=gsync.push', { method: 'POST', headers: { 'X-Sync-Token': gs.token, 'X-Sheet': HS, 'Content-Type': 'application/octet-stream' }, body: Buffer.from(hasta, 'base64') });
if (hp.status !== 200) fail('hasta listesi gönderimi: ' + hp.status);
const gerr = await fetch(BASE + 'api.php?action=gsync.push', { method: 'POST', headers: { 'X-Sync-Token': gs.token, 'X-Sheet': HS, 'X-Sync-Error': encodeURIComponent('Tabloya bu Google hesabıyla erişilemiyor.'), 'Content-Type': 'text/plain' }, body: 'hata' });
const hsSt = (await apiCall(a, 'gsync.get')).gs.sources.find((x) => x.sheet_id === HS);
if (gerr.status !== 200 || hsSt.status_ok || !/erişilemiyor/.test(hsSt.status)) fail('Google hata bildirimi: ' + JSON.stringify(hsSt && hsSt.status));
if (!(await apiCall(a, 'gsync.get')).gs.tables_at) fail('kod çalışma zamanı kaydedilmedi');
const unknown = await fetch(BASE + 'api.php?action=gsync.push', { method: 'POST', headers: { 'X-Sync-Token': gs.token, 'X-Sheet': '1BilinmeyenBilinmeyenBilinmeyen0000', 'Content-Type': 'application/octet-stream' }, body: Buffer.from(hasta, 'base64') });
if (unknown.status !== 404) fail('eklenmemiş tablo kabul edildi: ' + unknown.status);
const hr = (await apiCall(m, 'rosters.list')).rosters.find((r) => r.name === 'Hasta listesi');
if (!hr || hr.kind !== 'tablo' || !hr.file || JSON.stringify(hr.tabs) !== '["B BLOK","A BLOK"]') fail('hasta listesi: ' + JSON.stringify(hr));
const hbytes = Buffer.from(await m.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); }, hr.file.url), 'base64');
const JSZipLike = hbytes.toString('latin1');
if (!hbytes.length || /Kaplano|Karakurtlu/.test(JSZipLike)) fail('hasta listesi dosyasında tam soyad var (veya dosya boş)');
await m.goto(BASE + '#/nobet/' + hr.id);
await m.locator('.xv-tabs button').first().waitFor();
await expectText(m, 'Mehmet Ali K.');
await expectText(m, 'Zeynep K.');
if ((await m.locator('.hub-tabs').count()) || (await m.locator('.xv-tabs button').count()) !== 2) fail('hasta listesi görünümü');
if (await m.locator('#rsTabs button', { hasText: '3. Basamak' }).count()) fail('hasta listesi sayfasında nöbet listeleri sekmesi var');
step('Google E-Tablolar: anahtar, gönderim, sekme türleri, bağlama, yalnızca kendi sekmeleri, salt okunur liste, değişiklik bildirimi, JSON yedek yolu, ikinci tablo (hasta listesi, adlar kısaltılmış: Mehmet Ali K.)');

// 24) Taraf listesi: kura en az geçene, geçiş sayımı, takvimde blok
const sides = await apiCall(a, 'side.settings', { sides: [{ key: 's3', name: '3. Basamak', roster_id: r3, units: ['B blok'] }, { key: 's2', name: '2. Basamak', roster_id: r2, units: ['A blok', 'C blok'] }] });
if (sides.sides.length !== 2) fail('taraf ayarı');
const dr1 = await apiCall(a, 'side.draw', { date: d1(5), from: 's3', unit: 'A blok', count: 1, names: ['ELİF YILMAZ', 'BURAK DEMİR'] });
const w1 = dr1.chosen[0].name;
if (dr1.chosen[0].group.length !== 2) fail('ilk kura grubu: ' + JSON.stringify(dr1.chosen));
const dr2 = await apiCall(a, 'side.draw', { date: d1(13), from: 's3', unit: 'C blok', count: 1, names: ['ELİF YILMAZ', 'BURAK DEMİR', 'AYŞE KAYA'] });
if (dr2.chosen[0].group.includes(w1) || dr2.chosen[0].group.length !== 2) fail('öncelik en az geçene: ' + JSON.stringify(dr2.chosen) + ' ilk: ' + w1);
const memberDraw = await apiCall(m, 'side.draw', { date: d1(2), from: 's3', unit: 'A blok', count: 1, names: [] }).then(() => 'kabul', (e) => e.message);
if (!/nöbette olanlar/.test(memberDraw)) fail('nöbette olmayan üye kura çekti: ' + memberDraw);
const sg = await apiCall(m, 'side.get', { month: `${ym1.y}-${p2(ym1.m)}` });
const tot = sg.sides[0].people.reduce((x, p) => x + p.total, 0);
if (tot !== 2 || sg.moves.length !== 2) fail(`geçiş sayımı ${tot}, kayıt ${sg.moves.length}`);
await m.goto(BASE + '#/taraf');
await m.click('[data-act=tr-mv][data-d="1"]');
await m.locator('.tr-mx td.tr-moved').first().waitFor();
const elifMoved = [w1, dr2.chosen[0].name].includes('ELİF YILMAZ');
await m.goto(BASE + '#/nobetim');
await m.locator('#calCard .cal-d').first().waitFor();
await m.click('[data-act=cal-mv][data-d="1"]');
if (elifMoved && !(await m.locator('#calCard .cd-mv').count())) fail('takvimde blok işareti yok');
step(`taraf listesi: kura (${w1} → A blok), öncelik en az geçene (${dr2.chosen[0].name}), sayım 2, yetki, tablo ve takvim`);

// 25) Nöbet değişimi: seçenekler kurallara göre, istek → kabul → Excel güncellenince "uygulandı"
const so = await apiCall(m, 'swap.options', { date: d1(3) });
const burakOpts = (so.swap.find((p) => p.name === 'BURAK DEMİR') || { options: [] }).options.map((x) => x.date);
if (!burakOpts.includes(d1(8))) fail('Burak 8. gün seçeneği yok: ' + JSON.stringify(so.swap));
const blockedWhy = so.blocked.map((x) => x.reason).join(' | ');
await m.click('.cal-d[data-d="' + d1(3) + '"]');
await m.click('#dayPanel [data-act=swap-open]');
await m.locator('.modal .sw-opt').first().waitFor();
await m.locator('.modal .sw-row', { hasText: 'BURAK DEMİR' }).locator(`.sw-opt[data-x="${d1(8)}"]`).click();
await m.click('.modal [data-send]');
await expectText(m, 'İstek gönderildi');
const B = await ctx('burak', true);
await login(B.p, 'burak@test.com', 'Sifre1234');
await B.p.goto(BASE + '#/nobetim');
await B.p.locator('#swapBox [data-act=swap-ans][data-a="1"]').click();
await expectText(B.p, 'Kabul edildi');
const todo = (await apiCall(a, 'swap.list')).todo;
if (todo.length !== 1) fail('sorumlu Excel’e işlenecek listesi: ' + todo.length);
const p3r = await push(Buffer.from(await book(3), 'base64'), gs.token);
if (!p3r.json || !p3r.json.changed) fail('üçüncü gönderim');
const st3 = (await apiCall(m, 'swap.list')).items[0];
if (st3.status !== 'applied') fail('değişim uygulandı olmadı: ' + st3.status);
// 48 saat kuralı: Burak 3. gün 24 saat aldı; 4. gün kimse 24 saat devredemez ona
step('nöbet değişimi: kurallı seçenekler, istek, kabul, sorumlu listesi, Excel güncellenince uygulandı' + (blockedWhy ? ' · engel örneği: ' + blockedWhy.slice(0, 80) : ''));
await B.c.close();

// Masaüstü ekran görüntüleri
await a.goto(BASE + '#/');
await a.locator('#todayCard .duty-g, #todayCard .list-row').first().waitFor();
await a.waitForTimeout(500);
await a.screenshot({ path: path.join(OUT, 'f-home-desktop.png') });
await a.goto(BASE + '#/nobetim');
await a.waitForTimeout(800);
await a.screenshot({ path: path.join(OUT, 'f-nobetim-desktop.png') });

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nYENİ ÖZELLİK TESTLERİ GEÇTİ');
