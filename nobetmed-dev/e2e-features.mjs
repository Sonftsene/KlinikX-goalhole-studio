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
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1360, height: 860 }, acceptDownloads: true });
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
await m.locator('#kpiMyShift .k-val:not(:has(.skel))').waitFor();
const kpi = await m.locator('#kpiMyShift').innerText();
if (!/Pzt|Sal|Çar|Per|Cum|Cmt|Paz|Bugün|Yarın/.test(kpi)) fail('sıradaki nöbet KPI: ' + kpi);
await m.locator('#todayCard .duty-chip').first().waitFor({ timeout: 8000 }).catch(() => fail('bugün nöbette kartı boş'));
await m.screenshot({ path: path.join(OUT, 'f-home-mobile.png') });
step('ana sayfa: sıradaki nöbet (' + kpi.replace(/\s+/g, ' ').slice(0, 60) + ') ve bugün nöbette');

// 2) Nöbetlerim: sonraki nöbet, ay özeti, takvim, ICS
await m.goto(BASE + '#/nobetim');
await m.locator('.next-shift').waitFor();
const stat = await m.locator('.stat-month').first().innerText();
const days = await m.locator('.my-day').count();
if (days < 5) fail('takvimde az gün: ' + days);
const [dl] = await Promise.all([m.waitForEvent('download'), m.click('#icsBtn')]);
const ics = fs.readFileSync(await dl.path(), 'utf8');
const nEv = (ics.match(/BEGIN:VEVENT/g) || []).length;
if (!ics.startsWith('BEGIN:VCALENDAR') || nEv < 3) fail('ICS hatalı: ' + nEv);
await m.locator('#dutyCard .duty-g').first().waitFor();
await m.click('[data-act=duty-day][data-d="1"]');
await m.waitForTimeout(300);
await m.screenshot({ path: path.join(OUT, 'f-nobetim.png'), fullPage: true });
const sw1 = await m.evaluate(() => document.documentElement.scrollWidth);
if (sw1 > 390) fail('nöbetlerim mobil taşma: ' + sw1);
step(`nöbetlerim: ${days} gün, ay özeti "${stat.replace(/\s+/g, ' ')}", ICS ${nEv} nöbet`);

// 3) Profil: telefon, bildirim tercihi
await m.goto(BASE + '#/profil');
await m.fill('[data-form=me-contact] [name=phone]', '0532 111 22 33');
await m.fill('[data-form=me-contact] [name=extension]', '4412');
await m.click('[data-form=me-contact] button[type=submit]');
await expectText(m, 'Rehber bilgileriniz kaydedildi');
await m.click('[data-act=nmode][data-m=digest]');
await expectText(m, 'Bildirim tercihiniz kaydedildi');
const me = (await apiCall(m, 'boot')).me;
if (me.phone !== '0532 111 22 33' || me.notify_mode !== 'digest') fail('profil kaydedilmedi: ' + JSON.stringify(me));
step('profil: telefon/dahili ve sabah özeti tercihi');

// 4) Rehber: kişi, ara düğmesi, bugün filtresi
await a.goto(BASE + '#/rehber');
await a.locator('.dir-row').first().waitFor();
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
await a.goto(BASE + '#/yonetim/ayarlar');
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
const P = await ctx('invite', true);
await P.p.goto(link.replace('http://127.0.0.1', 'http://localhost'));
await expectText(P.p, 'Hoş geldin');
if (!(await P.p.locator('[data-form=invite-reg] [name=name][readonly]').count())) fail('kişisel davette ad kilitli değil');
await P.p.fill('[data-form=invite-reg] [name=email]', 'davetli@test.com');
await P.p.fill('[data-form=invite-reg] [name=password]', 'DavetSifre1');
await P.p.click('[data-form=invite-reg] button[type=submit]');
await expectText(P.p, 'Hesabın oluşturuldu');
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
await m.goto(BASE + '#/profil');
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
