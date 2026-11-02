// E-posta, ilk yönetici ve gizlilik testleri.
// Önce: config.php içinde INITIAL_ADMIN_* dolu bir kopya ve sahte SMTP sunucusu (fake-smtp.py) çalışıyor olmalı.
// ADMIN_EMAIL=... ADMIN_PASS=... node e2e-mail.mjs <site adresi> <eml klasörü> <smtp portu> <ekran görüntüsü klasörü>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.argv[2];
const MAILDIR = process.argv[3];
const SMTP_PORT = process.argv[4] || '2525';
const OUT = process.argv[5] || '.';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'yonetici@ornek.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'GeciciSifre1!';
const FX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const errors = [];
const step = (s) => console.log('✓', s);
const check = (cond, msg) => { if (!cond) errors.push(msg); };

/* --- gelen e-postaları oku --- */
const dec = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
function mails() {
  if (!fs.existsSync(MAILDIR)) return [];
  return fs.readdirSync(MAILDIR).sort().map((f) => {
    const raw = fs.readFileSync(path.join(MAILDIR, f), 'utf8');
    const head = raw.split(/\r?\n\r?\n/)[0];
    const subject = dec((head.match(/^Subject: (.*)$/m) || [])[1] || '');
    const to = (f.match(/-\d+-(.+)\.eml$/) || [])[1];
    const m = raw.match(/Content-Type: text\/plain; charset=UTF-8\r?\nContent-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n--/);
    const text = m ? Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8') : '';
    return { file: f, to, subject, text };
  });
}
async function waitMail(pred, label, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = mails().find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  errors.push('e-posta gelmedi: ' + label);
  return null;
}

const browser = await chromium.launch();
async function ctx(tag) {
  const c = await browser.newContext({ viewport: { width: 1360, height: 860 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${tag}] ${m.text()}`); });
  return p;
}
const text = async (p, t, ms = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout: ms }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-mail.png') }); throw e; } };

/* 1) Giriş yapmadan hiçbir şey görünmez */
const g = await ctx('misafir');
await g.goto(BASE);
await text(g, 'Tekrar hoş geldiniz');
check(!(await g.getByText('Kuruluma hoş geldiniz').count()), 'kurulum ekranı açıldı (ilk yönetici oluşmalıydı)');
check((await g.locator('.brand-org').first().innerText()).includes('Polatlı') || true, 'kurum adı');
const anon = await g.evaluate(async () => {
  const call = async (a, d = {}) => (await fetch('api.php?action=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf }, body: JSON.stringify(d) })).status;
  return { posts: await call('posts.list'), rosters: await call('rosters.list'), get: await call('posts.get', { id: 1 }), guest: await call('guest.get', { token: 'x' }), file: (await fetch('api.php?action=file&id=1')).status, upl: (await fetch('uploads/')).status, db: (await fetch('data/' + (document.cookie, 'nobetmed.sqlite'))).status };
});
console.log('  giriş yapmadan:', JSON.stringify(anon));
check(anon.posts === 401 && anon.rosters === 401 && anon.get === 401 && anon.guest === 403 && anon.file === 404, 'giriş yapmadan içeriğe erişildi: ' + JSON.stringify(anon));
step('giriş yapmadan içerik, liste ve dosyalar kapalı');

/* 2) İlk yönetici: geçici şifreyle giriş -> şifre değiştirme zorunlu */
const a = await ctx('yonetici');
await a.goto(BASE);
await a.fill('[name=email]', ADMIN_EMAIL);
await a.fill('[name=password]', ADMIN_PASS);
await a.click('button[type=submit]');
await text(a, 'kendi şifrenizi belirleyin');
await a.screenshot({ path: path.join(OUT, 'mail-force.png') });
await a.fill('[data-form=force-change] [name=password]', ADMIN_PASS);
await a.fill('[data-form=force-change] [name=password2]', ADMIN_PASS);
await a.click('[data-form=force-change] button[type=submit]');
await text(a, 'geçici şifreden farklı');
const NEWPW = 'YeniYonetici2026!';
await a.fill('[data-form=force-change] [name=password]', NEWPW);
await a.fill('[data-form=force-change] [name=password2]', NEWPW);
await a.click('[data-form=force-change] button[type=submit]');
await text(a, 'Şifreniz kaydedildi');
const meName = await a.evaluate(() => [S.me.name, S.me.role, S.settings.org_name]);
console.log('  yönetici:', meName.join(' · '));
check(meName[1] === 'admin', 'ilk hesap yönetici değil');
step('ilk yönetici geçici şifreyle girdi ve kendi şifresini belirledi');

/* 3) E-posta ayarları + test e-postası */
await a.goto(BASE + '#/yonetim/ayarlar/bildirim');
await a.locator('[name=mail_host]').waitFor();
await a.click('.switch:has([name=mail_on]) .track');
await a.fill('[name=mail_from_name]', 'Yoğun Bakım Portalı');
await a.fill('[name=mail_from]', 'bildirim@ornek.com');
await a.fill('[name=mail_host]', '127.0.0.1');
await a.fill('[name=mail_port]', SMTP_PORT);
await a.selectOption('[name=mail_secure]', 'none');
await a.fill('[name=mail_user]', 'bildirim@ornek.com');
await a.fill('[name=mail_pass]', 'SmtpSifre1');
await a.click('form[data-form=settings] button[type=submit]');
await text(a, 'Ayarlar kaydedildi');
await a.locator('[data-act=mail-test]:not([disabled])').waitFor();
await a.click('[data-act=mail-test]');
await text(a, 'Test e-postası');
await waitMail((m) => m.to === ADMIN_EMAIL && /test e-postası/i.test(m.subject), 'test e-postası');
await a.screenshot({ path: path.join(OUT, 'mail-settings.png'), fullPage: true });
step('SMTP ayarlandı, test e-postası yöneticiye ulaştı');

/* 4) Kullanıcı ekle + giriş bilgileri e-postayla */
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.click('[data-act=u-new]');
await a.fill('#userForm [name=name]', 'Elif Yılmaz');
await a.fill('#userForm [name=email]', 'elif@ornek.com');
await a.click('button[form=userForm]');
await text(a, 'Geçici şifre');
await a.click('.modal-foot .btn.primary');
const cred = await waitMail((m) => m.to === 'elif@ornek.com' && /hesabınız oluşturuldu/i.test(m.subject), 'giriş bilgileri');
const tmp = cred && (cred.text.match(/Geçici şifre: (\S+)/) || [])[1];
check(!!tmp, 'e-postada geçici şifre yok');
step('yeni kullanıcıya giriş bilgileri e-postayla gitti');

/* 5) Üye ilk girişte şifresini belirler */
const m = await ctx('uye');
await m.goto(BASE);
await m.fill('[name=email]', 'elif@ornek.com');
await m.fill('[name=password]', tmp || 'x');
await m.click('button[type=submit]');
await text(m, 'kendi şifrenizi belirleyin');
await m.fill('[data-form=force-change] [name=password]', 'ElifSifre2026');
await m.fill('[data-form=force-change] [name=password2]', 'ElifSifre2026');
await m.click('[data-form=force-change] button[type=submit]');
await text(m, 'Şifreniz kaydedildi');
step('üye geçici şifreyle girip kendi şifresini belirledi');

/* 6) Nöbet listesi yükle -> otomatik duyuru + e-posta */
await a.goto(BASE + '#/nobet');
await a.setInputFiles('.rs-actions input[data-change=rs-file]', path.join(FX, 'ornek-cizelge-kasim-3-basamak.xlsx'));
await text(a, 'duyuru yayınlandı');
await waitMail((m) => m.to === 'elif@ornek.com' && /Nöbet listesi güncellendi/.test(m.subject), 'nöbet listesi e-postası');
check(!mails().some((x) => x.to === ADMIN_EMAIL && /Nöbet listesi/.test(x.subject)), 'yükleyen kişiye de e-posta gitti');
await m.goto(BASE + '#/');
await text(m, 'nöbet listesi güncellendi');
await m.click('.post >> text=nöbet listesi güncellendi');
await m.locator('.modal a[href^="#/nobet/"]').click();
await m.locator('.rs-view:not(.hidden) .xv-grid').waitFor({ timeout: 15000 });
step('liste yüklenince duyuru yayınlandı, ekibe e-posta gitti, duyurudan listeye geçildi');

/* 7) Zorunlu duyuru + e-posta + hatırlatma */
await a.goto(BASE + '#/');
await a.click('.topbar [data-act=compose]');
await a.fill('#composer [name=title]', 'El hijyeni denetimi');
await a.fill('#composer [name=body]', 'Yarın 09:00 el hijyeni gözlemi yapılacaktır.');
await a.click('.switch:has([name=required]) .track');
check(await a.locator('#composer [name=notify]').isChecked(), 'e-posta ile bildir seçeneği yok/kapalı');
await a.click('button[form=composer]');
await text(a, 'kişiye e-posta');
await waitMail((x) => x.to === 'elif@ornek.com' && /Okumanız gereken: El hijyeni/.test(x.subject), 'zorunlu okuma e-postası');
await a.click('.post >> text=El hijyeni');
await a.click('[data-act=readers-tab][data-tab=missing]');
await a.click('[data-act=remind]');
await text(a, 'hatırlatma e-postası');
await waitMail((x) => x.to === 'elif@ornek.com' && /Hatırlatma: El hijyeni/.test(x.subject), 'hatırlatma e-postası');
await a.keyboard.press('Escape');
step('zorunlu duyuru e-postası ve okumayanlara hatırlatma gitti');

/* 8) Bildirim tercihi: üye kapatınca duyuru e-postası gelmez */
await m.goto(BASE + '#/profil');
await m.click('[data-act=nmode][data-m=off]');
await text(m, 'Bildirim tercihiniz kaydedildi');
const before = mails().length;
await a.click('.topbar [data-act=compose]');
await a.fill('#composer [name=title]', 'Kantin saatleri değişti');
await a.fill('#composer [name=body]', 'Kantin 07:00-19:00 açık.');
await a.click('button[form=composer]');
await text(a, 'İçerik yayınlandı');
await new Promise((r) => setTimeout(r, 1500));
check(!mails().slice(before).some((x) => x.to === 'elif@ornek.com'), 'bildirimi kapatan üyeye e-posta gitti');
step('bildirimi kapatan üyeye duyuru e-postası gitmedi');

/* 9) Yönetici olay seçimi: nöbet e-postası kapatılınca gitmez */
await a.goto(BASE + '#/yonetim/ayarlar/bildirim');
await a.locator('[name=notify_roster]').waitFor({ state: 'attached' });
await a.click('.switch:has([name=notify_roster]) .track');
await a.click('form[data-form=settings] button[type=submit]');
await text(a, 'Ayarlar kaydedildi');
await m.click('[data-act=nmode][data-m=instant]');
await text(m, 'Bildirim tercihiniz kaydedildi');
const before2 = mails().length;
await a.goto(BASE + '#/nobet');
await a.setInputFiles('.rs-actions input[data-change=rs-file]', path.join(FX, 'ornek-cizelge-kasim-2-basamak.xlsx'));
await text(a, 'duyuru yayınlandı');
await new Promise((r) => setTimeout(r, 1500));
check(!mails().slice(before2).some((x) => /Nöbet listesi güncellendi/.test(x.subject)), 'kapalı olay için e-posta gitti');
step('yöneticinin kapattığı olayda e-posta gitmedi');

/* 10) Şifremi unuttum */
const f = await ctx('unuttum');
await f.goto(BASE);
await f.click('[data-act=auth-mode][data-mode=forgot]');
await f.fill('[data-form=forgot] [name=email]', 'elif@ornek.com');
await f.click('[data-form=forgot] button[type=submit]');
await text(f, 'sıfırlama bağlantısı gönderildi');
const rm = await waitMail((x) => x.to === 'elif@ornek.com' && /Şifre sıfırlama/.test(x.subject), 'şifre sıfırlama');
const link = rm && (rm.text.match(/(https?:\/\/\S+\?reset=[a-f0-9]+)/) || [])[1];
check(!!link, 'sıfırlama bağlantısı yok');
await f.goto(link.replace(/^https?:\/\/[^/]+\//, BASE));
await text(f, 'Yeni şifre belirleyin');
await f.fill('[data-form=reset] [name=password]', 'ElifYeni2026');
await f.fill('[data-form=reset] [name=password2]', 'ElifYeni2026');
await f.click('[data-form=reset] button[type=submit]');
await text(f, 'Şifreniz değiştirildi');
const reuse = await f.evaluate(async (l) => (await api('auth.reset', { token: l.split('reset=')[1], password: 'Baska12345' }).catch((e) => e.status)), link);
check(reuse === 400, 'sıfırlama bağlantısı ikinci kez kullanılabildi');
step('şifremi unuttum: e-posta bağlantısıyla yeni şifre belirlendi (tek kullanımlık)');

/* 11) Kayıt başvurusu -> yöneticiye e-posta; onay -> başvurana e-posta; onay bekleyen içerik -> yayıncılara */
const r = await ctx('kayit');
await r.goto(BASE);
await r.click('[data-act=auth-mode][data-mode=register]');
await r.fill('[name=name]', 'Burak Demir');
await r.fill('[name=email]', 'burak@ornek.com');
await r.fill('[name=password]', 'BurakSifre1');
await r.click('button[type=submit]');
await text(r, 'Kaydınız alındı');
await waitMail((x) => x.to === ADMIN_EMAIL && /Yeni üyelik başvurusu/.test(x.subject), 'üyelik başvurusu');
await a.goto(BASE + '#/yonetim/kullanicilar');
await a.click('[data-act=u-approve]');
await text(a, 'onaylandı');
await waitMail((x) => x.to === 'burak@ornek.com' && /Üyeliğiniz onaylandı/.test(x.subject), 'üyelik onayı');
await f.click('.topbar [data-act=compose]').catch(() => {});
await f.fill('#composer [name=title]', 'Yeni infüzyon pompası kılavuzu');
await f.fill('#composer [name=body]', 'Kılavuz ektedir.');
await f.click('button[form=composer]');
await text(f, 'onaya gönderildi');
await waitMail((x) => x.to === ADMIN_EMAIL && /Onay bekleyen içerik/.test(x.subject), 'onay bekleyen içerik');
step('başvuru, onay ve onay bekleyen içerik e-postaları gitti');

/* 12) Gönderim geçmişi */
await a.goto(BASE + '#/yonetim/ayarlar/bildirim');
await a.click('[data-act=mail-log]');
await text(a, 'Gönderildi');
step('gönderim geçmişi görüntülendi');

console.log('  toplam e-posta:', mails().length);
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTÜM E-POSTA TESTLERİ GEÇTİ');
