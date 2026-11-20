// Birim açma başvurusu ve doğrulama (4.16) — uçtan uca.
// e2e-tenant.mjs ve e2e-hastane.mjs SONRASI aynı sitede çalışır (sistem yöneticisi, ana birim ve Dahiliye birimi orada açılır).
// Ana birime sahte SMTP sunucusu (fake-smtp.py) bağlanır; doğrulama kodları ve bildirim e-postaları oradan okunur. Sonunda ayarlar geri alınır.
//   node e2e-basvuru.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const DEV = path.dirname(new URL(import.meta.url).pathname);
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; ${code}`], { encoding: 'utf8' });
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Sahte SMTP ----------------
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const MAILDIR = path.join(OUT, 'basvuru-mail');
fs.rmSync(MAILDIR, { recursive: true, force: true });
const smtp = spawn('python3', [path.join(DEV, 'fake-smtp.py'), String(port), MAILDIR, 'bildirim@ornek.com', 'SmtpSifre1'], { stdio: 'ignore' });
await sleep(600);
const mailText = (f) => {
  const raw = fs.readFileSync(path.join(MAILDIR, f), 'utf8');
  const subj = (raw.match(/^Subject: (.*(?:\r?\n[ \t].*)*)/m) || [])[1] || '';
  const dec = (s) => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8')).replace(/\r?\n[ \t]/g, '');
  const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/g)].map((m) => Buffer.from(m[1].replace(/\s+/g, ''), 'base64').toString('utf8'));
  return { subject: dec(subj), text: parts[0] || '', html: parts[1] || '' };
};
const seen = new Set();
async function waitMail(to, re, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const files = fs.existsSync(MAILDIR) ? fs.readdirSync(MAILDIR).filter((f) => f.endsWith('-' + to + '.eml') && !seen.has(f)).sort() : [];
    for (const f of files) { const m = mailText(f); if (re.test(m.subject)) { seen.add(f); return m; } }
    await sleep(200);
  }
  throw new Error(`e-posta gelmedi: ${to} ${re}`);
}

// ---------------- Tarayıcı ----------------
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
const apiErr = (p, action, data = {}) => p.evaluate(async ([a, d]) => { try { await api(a, d); return 'kabul'; } catch (e) { return `${e.status}:${e.message}`; } }, [action, data]);
function totpAt(secret, st) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = ''; for (const ch of secret) bits += abc.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeUInt32BE(st, 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
async function fresh(tag, mobile) {
  const x = await ctx(tag, mobile);
  await x.p.goto(BASE);
  await x.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf);
  return x;
}
/** Durum sayfası (aynı adresteyken de yeniden yüklenir) */
async function openStatus(p, tok) { await p.goto(BASE + '#/basvuru/' + tok); await p.reload(); }
/** API ile başvuru (e-posta kodu postadan okunur) */
async function applyApi(p, email, body) {
  await apiCall(p, 'apply.code', { email });
  const m = await waitMail(email, /Doğrulama kodu/);
  await apiCall(p, 'apply.verify', { code: (m.subject.match(/(\d{6})/) || [])[1] });
  return apiCall(p, 'apply.submit', { declare: true, kvkk: true, title: 'Hemşire', duty: 'Sorumlu hemşire', phone: '05001112244', staff: 12, ...body });
}

const MAIL_KEYS = ['mail_on', 'mail_from', 'mail_from_name', 'mail_host', 'mail_port', 'mail_secure', 'mail_user', 'mail_pass'];
const def = JSON.parse(php(`$t = nm_tenant_default(); nm_tenant_use($t); $o = ['tk' => $t['tkey'], 'unit' => $t['name'], 'hid' => (int)$t['hospital_id'], 'hosp' => m_val('SELECT name FROM hospitals WHERE id = ?', [$t['hospital_id']]), 'mail' => []]; foreach (${JSON.stringify(MAIL_KEYS).replace(/"/g, "'")} as $k) $o['mail'][$k] = setting($k); echo json_encode($o);`));
const setMail = (kv) => php(`nm_tenant_use(nm_tenant_default()); foreach (json_decode(base64_decode('${Buffer.from(JSON.stringify(kv)).toString('base64')}'), true) as $k => $v) set_setting($k, (string)$v);`);

try {
  // ---- 0) Temiz başlangıç: başvuru kayıtları, ana birime sahte SMTP ----
  php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; ap_ensure(); foreach (['ap_apps', 'ap_votes', 'ap_peer_sent', 'ap_hits', 'ap_blocks'] as $t) m_q("DELETE FROM $t"); ap_cfg_put(['on' => '0', 'doc' => 'optional', 'peer' => '1', 'mail_tkey' => '', 'notice' => '', 'domains' => "saglik.gov.tr\\ngov.tr\\nedu.tr"]); foreach (glob(ap_dir() . '/*.bin') as $f) unlink($f);`);
  setMail({ mail_on: '1', mail_from: 'bildirim@ornek.com', mail_from_name: 'dupcii', mail_host: '127.0.0.1', mail_port: String(port), mail_secure: 'none', mail_user: 'bildirim@ornek.com', mail_pass: 'SmtpSifre1' });
  const sa = JSON.parse(php(`$u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); echo json_encode($u);`));
  const SA = await ctx('sistem');
  await SA.p.goto(BASE);
  await SA.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
  await apiCall(SA.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
  while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await sleep(1000);
  await apiCall(SA.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });

  // ---- 1) Varsayılan kapalı ----
  const G0 = await fresh('misafir0');
  if (await G0.p.evaluate(() => S.apply)) fail('başvuru varsayılan olarak açık');
  if (await G0.p.locator('.ap-cta').count()) fail('kapalıyken giriş ekranında başvuru bağlantısı var');
  if (!/^403/.test(await apiErr(G0.p, 'apply.code', { email: 'x@saglik.gov.tr' }))) fail('kapalıyken kod gönderildi');
  await G0.c.close();
  step('varsayılan: başvuru formu kapalı (giriş ekranında bağlantı yok, uçlar 403)');

  // ---- 2) Sistem yöneticisi açar ----
  let L = await apiCall(SA.p, 'sa.apply.cfg', { on: true, doc: 'optional', peer: true, notice: 'Başvurular 1-2 iş günü içinde incelenir.' });
  if (L.cfg.on !== '1') fail('başvuru açılamadı');
  L = await apiCall(SA.p, 'sa.apply.list', { filter: 'open' });
  if (!L.cfg.mail_src) fail('e-posta gönderen birim bulunamadı');
  step('sistem yöneticisi başvuruları açtı; e-postalar ana birimin e-posta ayarıyla gidiyor: ' + L.cfg.mail_src);

  // ---- 3) Başvuran (telefon): e-posta kodu → bilgiler → belge → gönder ----
  const P = await fresh('basvuran', true);
  await P.p.locator('.ap-cta [data-act=ap-open]').click();
  await P.p.locator('[data-form=ap-email]').waitFor();
  if (!/1-2 iş günü/.test(await P.p.textContent('.auth-box'))) fail('formda sistem yöneticisinin notu yok');
  if (!/^409/.test(await apiErr(P.p, 'apply.code', { email: 'ayse@test.com' }))) fail('kayıtlı e-postayla başvuru başladı');
  if (!/^401/.test(await apiErr(P.p, 'apply.submit', { name: 'Kimse Yok', unit_name: 'X' }))) fail('e-posta doğrulanmadan başvuru gönderildi');
  const EM1 = 'deniz.ornek@saglik.gov.tr';
  await P.p.fill('[data-form=ap-email] [name=email]', EM1);
  await P.p.click('[data-form=ap-email] button[type=submit]');
  await P.p.locator('[data-form=ap-code]').waitFor();
  const codeMail = await waitMail(EM1, /Doğrulama kodu/);
  const code = (codeMail.subject.match(/(\d{6})/) || [])[1];
  if (!code || !codeMail.text.includes(code)) fail('doğrulama kodu e-postası hatalı');
  if (/Yoğun|Hastane/.test(codeMail.html.match(/dupc[\s\S]{0,400}?<\/td>/)?.[0] || '')) fail('başvuru e-postasında birim adı görünüyor');
  await P.p.fill('[data-form=ap-code] [name=code]', '000000');
  await P.p.click('[data-form=ap-code] button[type=submit]');
  await P.p.getByText('Kod hatalı').waitFor();
  await P.p.fill('[data-form=ap-code] [name=code]', code);
  await P.p.click('[data-form=ap-code] button[type=submit]');
  await P.p.locator('#apForm').waitFor();
  await P.p.fill('#apHq', def.hosp.slice(0, 5));
  await P.p.locator(`[data-act=ap-hpick][data-id="${def.hid}"]`).click();
  await P.p.locator('#apUnits .mk-box').waitFor();
  if (!(await P.p.textContent('#apUnits')).includes(def.unit)) fail('seçilen hastanedeki birimler gösterilmedi');
  await P.p.fill('#apForm [name=unit_name]', 'Kardiyoloji');
  await P.p.fill('#apForm [name=staff]', '22');
  await P.p.fill('#apForm [name=name]', 'Deniz Örnek');
  await P.p.fill('#apForm [name=title]', 'Sorumlu Hemşire');
  await P.p.selectOption('#apForm [name=duty]', 'Sorumlu hemşire');
  await P.p.fill('#apForm [name=phone]', '0500 111 22 33');
  await P.p.setInputFiles('#apDoc', path.join(DEV, 'fixture.png'));
  await P.p.waitForFunction(() => AP.doc && AP.doc.data.startsWith('data:image/jpeg'));
  await P.p.click('#apForm button[type=submit]');
  await P.p.getByText('Beyan kutusunu').waitFor();
  await P.p.check('#apForm [name=declare]');
  await P.p.check('#apForm [name=kvkk]');
  await P.p.screenshot({ path: path.join(OUT, 'ap-form.png'), fullPage: true });
  await P.p.click('#apForm button[type=submit]');
  await P.p.getByText('Başvurunuz alındı').first().waitFor();
  const link1 = await P.p.inputValue('.auth-box input[readonly]');
  const tok1 = link1.split('#/basvuru/')[1];
  await P.p.screenshot({ path: path.join(OUT, 'ap-done.png'), fullPage: true });
  const got = await waitMail(EM1, /başvurunuz alındı/i);
  if (!got.text.includes('#/basvuru/' + tok1)) fail('başvurana takip bağlantısı gitmedi');
  await waitMail(sa.email, /Yeni birim başvurusu/);
  const bins = fs.readdirSync(path.join(SITE, 'data/merkez/basvuru')).filter((f) => f.endsWith('.bin'));
  if (bins.length !== 1) fail('belge kaydedilmedi');
  else if (fs.readFileSync(path.join(SITE, 'data/merkez/basvuru', bins[0])).subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) fail('belge şifrelenmeden saklandı');
  if (!/^4\d\d/.test(await apiErr(P.p, 'apply.hospitals', { q: 'has' }))) fail('başvurudan sonra oturum hâlâ doğrulanmış');
  step('başvuran (telefon): e-posta kodu (hatalı kod reddedildi) → hastane arama ve o hastanedeki birimler → bilgiler + belge (fotoğraf küçültüldü) → gönderildi; belge şifreli; başvurana takip bağlantısı, sistem yöneticisine haber gitti');

  // Durum sayfası
  await openStatus(P.p, tok1);
  await P.p.getByText('İncelemede').first().waitFor();
  if (!/^404/.test(await apiErr(P.p, 'apply.status', { token: 'x'.repeat(30) }))) fail('geçersiz anahtarla başvuru açıldı');
  // Aynı e-posta yeniden: bekleyen başvuru bağlantısı yeniden gönderilir
  if (!(await apiCall(P.p, 'apply.code', { email: EM1 })).pending) fail('bekleyen başvuru yeniden başlatılabildi');
  await waitMail(EM1, /Birim başvurunuz/);
  step('durum sayfası; geçersiz bağlantı 404; aynı e-postayla ikinci başvuru açılamaz (bağlantı yeniden gönderilir)');

  // ---- 4) Kötüye kullanım: kopya birim, hatalı kod sınırı, bot tuzağı ----
  const Q = await fresh('kopya');
  const EM2 = 'birisi.kopya@gmail.com';
  await apiCall(Q.p, 'apply.code', { email: EM2 });
  await waitMail(EM2, /Doğrulama kodu/);
  for (let i = 0; i < 5; i++) await apiErr(Q.p, 'apply.verify', { code: '111111' });
  if (!/^429/.test(await apiErr(Q.p, 'apply.verify', { code: '111111' }))) fail('hatalı kod denemesi sınırlanmadı');
  let r = await applyApi(Q.p, EM2, { hospital_id: def.hid, unit_name: def.unit + ' Servisi', name: 'Bir Kişi' });
  if (r.dup !== def.unit) fail('aynı hastanede aynı adlı birim için uyarı verilmedi: ' + JSON.stringify(r));
  r = await apiCall(Q.p, 'apply.submit', { declare: true, kvkk: true, title: 'Hemşire', duty: 'Birimde görevliyim (yönetici değilim)', phone: '05001112244', hospital_id: def.hid, unit_name: def.unit + ' Servisi', name: 'Bir Kişi', dup_ok: true });
  const tok2 = r.token;
  if (!tok2) fail('kopya uyarısından sonra başvuru gönderilemedi');
  const B = await fresh('bot');
  r = await apiCall(B.p, 'apply.code', { email: 'bot@ornek.com', website: 'http://spam' });
  await sleep(800);
  if (fs.readdirSync(MAILDIR).some((f) => f.includes('bot@ornek.com'))) fail('bot tuzağına düşen isteğe kod gönderildi');
  step('kötüye kullanım: kopya birim uyarısı (yine de gönderilebilir, yöneticiye işaretlenir), 5 hatalı koddan sonra kilit, bot tuzağı');

  // ---- 5) Aynı hastanedeki birim yöneticilerinin teyidi ----
  cron();
  const sent = php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; echo m_val('SELECT COUNT(*) FROM ap_peer_sent');`).trim();
  if (+sent < 2) fail('aynı hastanedeki birimlere bildirim gitmedi: ' + sent);
  const nN = php(`foreach (nm_tenants() as $t) if ($t['name'] === 'Dahiliye') nm_tenant_use($t); echo val("SELECT COUNT(*) FROM notifications WHERE kind = 'apply'");`).trim();
  if (+nN < 2) fail('Dahiliye yöneticisine başvuru bildirimi düşmedi');
  cron();
  if (php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; echo m_val('SELECT COUNT(*) FROM ap_peer_sent');`).trim() !== sent) fail('başvuru bildirimi tekrarlandı');
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  await A.p.locator('.home-ext-apply-peer .ap-peer').first().waitFor({ timeout: 10000 });
  if ((await A.p.locator('.home-ext-apply-peer .ap-peer').count()) !== 2) fail('teyit kartında 2 başvuru yok');
  const peerTxt = await A.p.textContent('.home-ext-apply-peer');
  if (/0500|@saglik|@gmail/.test(peerTxt)) fail('teyit kartında başvuranın telefonu / e-postası görünüyor');
  await A.p.screenshot({ path: path.join(OUT, 'ap-peer.png') });
  const ids = await A.p.evaluate(() => S.apply_peer.map((x) => [x.id, x.unit]));
  const id1 = ids.find((x) => x[1] === 'Kardiyoloji')[0];
  const id2 = ids.find((x) => x[1] !== 'Kardiyoloji')[0];
  await A.p.locator(`.home-ext-apply-peer [data-act=ap-vote][data-id="${id1}"][data-v=yes]`).click();
  await A.p.getByText('Tanıyorum dediniz').waitFor();
  const N = await ctx('nil', true);
  await login(N.p, 'nil@test.com', 'NilSifre1234');
  await apiCall(N.p, 'peer.apply.vote', { id: id2, vote: 'no', note: 'Böyle bir kişi birimde çalışmıyor' });
  const E = await ctx('elif');
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  if (!/^403/.test(await apiErr(E.p, 'peer.apply.vote', { id: id1, vote: 'no' }))) fail('üye başvuruya teyit verebildi');
  if (await E.p.evaluate(() => (S.apply_peer || []).length)) fail('üyeye teyit kartı gösterildi');
  step('aynı hastanedeki birim yöneticilerine bir kez bildirildi (telefon/e-posta gösterilmeden); Ayşe “Tanıyorum”, Dahiliye yöneticisi “Tanımıyorum” dedi; üye teyit veremez');

  // ---- 6) Sistem yöneticisi: doğrulama işaretleri ve belge ----
  L = await apiCall(SA.p, 'sa.apply.list', { filter: 'open' });
  const a1 = L.items.find((x) => x.id === id1), a2 = L.items.find((x) => x.id === id2);
  if (!a1 || !a1.email_ok || !a1.corp || a1.yes !== 1 || a1.level !== 'strong' || !a1.doc) fail('1. başvurunun işaretleri hatalı: ' + JSON.stringify(a1));
  if (!a2 || !a2.free || a2.no !== 1 || a2.dup !== def.unit || a2.level !== 'weak') fail('2. başvurunun işaretleri hatalı: ' + JSON.stringify(a2));
  if (L.open !== 2) fail('bekleyen sayısı hatalı');
  const doc = await SA.p.evaluate(async (id) => { const r = await fetch('api.php?action=sa.apply.doc&id=' + id); const b = new Uint8Array(await r.arrayBuffer()); return [r.status, r.headers.get('content-type'), b[0], b[1]]; }, id1);
  if (doc[0] !== 200 || doc[1] !== 'image/jpeg' || doc[2] !== 0xff || doc[3] !== 0xd8) fail('sistem yöneticisi belgeyi açamadı: ' + doc);
  const docA = await A.p.evaluate(async (id) => (await fetch('api.php?action=sa.apply.doc&id=' + id)).status, id1);
  if (docA !== 401) fail('birim yöneticisi başvuru belgesini açabildi');
  if (!/^401/.test(await apiErr(A.p, 'sa.apply.list'))) fail('birim yöneticisi başvuru listesini açabildi');
  await SA.p.goto(BASE); await SA.p.waitForFunction(() => typeof S !== 'undefined' && S.sa);
  await SA.p.waitForFunction(() => document.querySelector('#sysApN') && document.querySelector('#sysApN').textContent === '2');
  await SA.p.locator('[data-act=sys-tab][data-t=basvuru]').click();
  await SA.p.locator('.ap-card').first().waitFor();
  await SA.p.screenshot({ path: path.join(OUT, 'ap-sa.png'), fullPage: true });
  step('sistem yöneticisi: işaretler (doğrulanmış kurumsal e-posta + hastaneden teyit + belge = güçlü; kişisel e-posta + kopya birim + “tanımıyorum” = dikkat), belge yalnız ona açılıyor, sekmede bekleyen sayısı');

  // ---- 7) Bilgi iste → başvuran yanıtlar ----
  await SA.p.locator(`[data-act=aps-do][data-x=info][data-id="${id2}"]`).click();
  await SA.p.fill('.modal [name=v]', 'Görevlendirme yazınızı ekler misiniz?');
  await SA.p.click('.modal [data-ok]');
  await SA.p.getByText('başvurana e-posta gönderildi').first().waitFor();
  const infoMail = await waitMail(EM2, /ek bilgi/);
  if (!infoMail.text.includes('#/basvuru/' + tok2)) fail('bilgi isteği e-postasında bağlantı yok');
  await openStatus(Q.p, tok2);
  await Q.p.locator('[data-form=ap-reply]').waitFor();
  await Q.p.fill('[data-form=ap-reply] [name=text]', 'Birimde hemşireyim, yöneticimiz izinde olduğu için ben başvurdum.');
  await Q.p.click('[data-form=ap-reply] button[type=submit]');
  await Q.p.getByText('Yanıtınız gönderildi').first().waitFor();
  await waitMail(sa.email, /yanıt geldi/);
  L = await apiCall(SA.p, 'sa.apply.list', { filter: 'open' });
  if (L.items.find((x) => x.id === id2).status !== 'pending' || !/izinde/.test(L.items.find((x) => x.id === id2).reply)) fail('başvuranın yanıtı kaydedilmedi');
  step('bilgi iste: başvurana e-posta + durum sayfasından yanıt; başvuru yeniden incelemeye döndü');

  // ---- 8) Ret ----
  await apiCall(SA.p, 'sa.apply.decide', { id: id2, act: 'reject', msg: 'Birim yöneticisi olarak doğrulanamadı.' });
  await waitMail(EM2, /sonuçlandı/);
  await openStatus(Q.p, tok2);
  await Q.p.getByText('Reddedildi').first().waitFor();
  if (!/^409/.test(await apiErr(Q.p, 'apply.withdraw', { token: tok2 }))) fail('reddedilen başvuru geri çekilebildi');
  step('ret: gerekçe başvurana e-postayla ve durum sayfasında');

  // ---- 9) Onay → hastane içinde yeni birim + başvuran yönetici ----
  await SA.p.locator('[data-act=sys-tab][data-t=basvuru]').click();
  await SA.p.locator(`[data-act=aps-ok][data-id="${id1}"]`).click();
  await SA.p.locator('#apOkF').waitFor();
  if ((await SA.p.inputValue('#apOkF [name=hospital_id]')) !== String(def.hid)) fail('onay penceresinde hastane seçili gelmedi');
  await SA.p.fill('#apOkF [name=msg]', 'Hoş geldiniz.');
  await SA.p.click('.modal button[form=apOkF]');
  await SA.p.getByText('Birim açıldı').first().waitFor();
  const cred = await waitMail(EM1, /hesabınız oluşturuldu/i);
  const pw = (cred.text.match(/Geçici şifre: (\S+)/) || [])[1];
  if (!pw) fail('giriş bilgileri e-postası gelmedi');
  const nt = JSON.parse(php(`foreach (nm_tenants() as $t) if ($t['name'] === 'Kardiyoloji') echo json_encode($t);`) || 'null');
  if (!nt || +nt.hospital_id !== def.hid) fail('birim doğru hastanede açılmadı');
  if (fs.readdirSync(path.join(SITE, 'data/merkez/basvuru')).some((f) => f.endsWith('.bin'))) fail('karar verilince belge silinmedi');
  const K = await ctx('kardiyoloji', true);
  await login(K.p, EM1, pw);
  const me = await K.p.evaluate(() => [S.me.role, S.me.must_change, S.settings.org_name]);
  if (me[0] !== 'admin' || !me[1]) fail('başvuran birim yöneticisi olarak açılmadı: ' + me);
  await openStatus(P.p, tok1);
  await P.p.getByText('Onaylandı').first().waitFor();
  if (!(await P.p.locator('a.btn.primary[href*="?b="]').count())) fail('durum sayfasında birime giriş bağlantısı yok');
  if (!/Hoş geldiniz/.test(await P.p.textContent('.auth-box'))) fail('onay notu durum sayfasında yok');
  if (!/^409/.test(await apiErr(SA.p, 'sa.apply.approve', { id: id1 }))) fail('aynı başvuru iki kez onaylandı');
  await P.p.screenshot({ path: path.join(OUT, 'ap-onay.png'), fullPage: true });
  step('onay: aynı hastanede “Kardiyoloji” birimi açıldı, başvuran birim yöneticisi (geçici şifre e-postayla, ilk girişte değişir); belge silindi; durum sayfasında giriş bağlantısı');

  // ---- 10) Yeni hastane, geri çekme, geçersiz + engel ----
  const R3 = await fresh('yeni');
  r = await applyApi(R3.p, 'ali.yeni@ornek.edu.tr', { hospital_id: 0, hospital_name: 'Örnek Şehir Hastanesi', city: 'Ankara', unit_name: 'Acil Servis', name: 'Ali Yeni' });
  if (!r.token) fail('yeni hastane için başvuru gönderilemedi');
  await openStatus(R3.p, r.token);
  await R3.p.locator('[data-act=ap-withdraw]').click();
  await R3.p.click('.modal [data-ok]');
  await R3.p.getByText('Başvurunuz silindi').first().waitFor();
  if (+php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; echo m_val("SELECT COUNT(*) FROM ap_apps WHERE email = 'ali.yeni@ornek.edu.tr'");`) !== 0) fail('geri çekilen başvuru silinmedi');
  const S4 = await fresh('sahte');
  r = await applyApi(S4.p, 'sahte@ornek.com', { hospital_id: 0, hospital_name: 'Olmayan Hastane Adı', city: 'Yok', unit_name: 'Deneme', name: 'Sahte Kişi' });
  L = await apiCall(SA.p, 'sa.apply.list', { filter: 'open' });
  const a4 = L.items.find((x) => x.email === 'sahte@ornek.com');
  if (!a4 || !a4.new_hospital) fail('yeni hastane başvurusu işaretlenmedi');
  await apiCall(SA.p, 'sa.apply.decide', { id: a4.id, act: 'spam', block: true });
  if (!/^403/.test(await apiErr(S4.p, 'apply.code', { email: 'sahte@ornek.com' }))) fail('engellenen e-posta yeniden başvurabildi');
  step('yeni hastane başvurusu; başvuran geri çekince kayıt hemen silinir; geçersiz sayılan e-posta engellendi');

  // ---- 11) Saklama süresi: 90 günü geçen ret kaydı silinir ----
  php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; m_q("UPDATE ap_apps SET decided_at = '2000-01-01 00:00:00' WHERE status IN ('rejected', 'spam')"); ap_gc(true);`);
  if (+php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; echo m_val("SELECT COUNT(*) FROM ap_apps WHERE status IN ('rejected', 'spam')");`) !== 0) fail('eski ret kayıtları silinmedi');
  L = await apiCall(SA.p, 'sa.apply.list', { filter: 'all' });
  if (L.items.length !== 1 || L.items[0].status !== 'approved') fail('saklama sonrası liste hatalı');
  const aud = await apiCall(SA.p, 'sa.audit');
  if (!aud.items.some((x) => x.action === 'apply.approve')) fail('onay sistem günlüğüne yazılmadı');
  step('saklama: 90 günü geçen ret / geçersiz kayıtlar silindi; onay sistem günlüğünde');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  // Ayarları geri al: başvuru kapalı, ana birimin e-posta ayarı eski hâline
  try {
    php(`$r = include '${path.join(SITE, 'inc/mod_basvuru.php')}'; ap_cfg_put(['on' => '0', 'notice' => '']);`);
    setMail(def.mail);
  } catch (e) { errors.push('geri alma: ' + e.message); }
  await browser.close();
  smtp.kill();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nbaşvuru testleri tamam');
