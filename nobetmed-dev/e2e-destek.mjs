// 4.23: destek talepleri — e2e.mjs ve e2e-tenant.mjs (sistem yöneticisi hesabı) SONRASI, çok birimli (SQLite) kurulumda.
// Üye konuya göre ayrılır (teknik → sistem yöneticisi, birim konusu → birim sorumlusu), sorumlu (yönetici/yayıncı) sistem yöneticisine yazar,
// birim sorumlusu iletir, sistem yöneticisi yanıtlar / iç not / birime aktarır / hazır yanıt; giriş yapamayan kişi giriş ekranından yazar.
//   node e2e-destek.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const MAILDIR = path.join(OUT, 'destek-mail');
fs.rmSync(MAILDIR, { recursive: true, force: true });
const smtp = spawn('python3', [path.join(DEV, 'fake-smtp.py'), String(port), MAILDIR, 'bildirim@ornek.com', 'SmtpSifre1'], { stdio: 'ignore' });
await sleep(600);
const mailSubj = (f) => {
  const raw = fs.readFileSync(path.join(MAILDIR, f), 'utf8');
  const subj = (raw.match(/^Subject: (.*(?:\r?\n[ \t].*)*)/m) || [])[1] || '';
  return subj.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8')).replace(/\r?\n[ \t]/g, '');
};
const seen = new Set();
async function waitMail(to, re, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { php('nm_tenant_use(nm_tenant_default()); mail_flush(20);'); } catch (e) { /* */ }
    const files = fs.existsSync(MAILDIR) ? fs.readdirSync(MAILDIR).filter((f) => f.endsWith('-' + to + '.eml') && !seen.has(f)).sort() : [];
    for (const f of files) { const s = mailSubj(f); if (re.test(s)) { seen.add(f); return s; } }
    await sleep(400);
  }
  throw new Error(`e-posta gelmedi: ${to} ${re}`);
}

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
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
const getStatus = (p, url) => p.evaluate((u) => fetch(u, { credentials: 'same-origin' }).then((r) => r.status), url);
function totpAt(secret, st) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = ''; for (const ch of secret) bits += abc.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeUInt32BE(st, 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
/** Küçük bir PNG (ekran görüntüsü yerine) */
function pngFile() {
  const w = 64, h = 40;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 30 + x * 3; raw[o + 1] = 120; raw[o + 2] = 200 - y * 3; } }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const MAIL_KEYS = ['mail_on', 'mail_from', 'mail_from_name', 'mail_host', 'mail_port', 'mail_secure', 'mail_user', 'mail_pass'];
const def = JSON.parse(php(`$t = nm_tenant_default(); nm_tenant_use($t); $o = ['mail' => [], 'burak' => one("SELECT role FROM users WHERE email = 'burak@test.com'")['role'] ?? 'member']; foreach (${JSON.stringify(MAIL_KEYS).replace(/"/g, "'")} as $k) $o['mail'][$k] = setting($k); echo json_encode($o);`));
const setMail = (kv) => php(`nm_tenant_use(nm_tenant_default()); foreach (json_decode(base64_decode('${Buffer.from(JSON.stringify(kv)).toString('base64')}'), true) as $k => $v) set_setting($k, (string)$v);`);
const setRole = (email, role) => php(`nm_tenant_use(nm_tenant_default()); q('UPDATE users SET role = ? WHERE email = ?', ['${role}', '${email}']);`);

try {
  // ---- 0) Temiz başlangıç ----
  php(`$r = include '${path.join(SITE, 'inc/mod_destek.php')}'; sp_ensure(); foreach (['sp_tickets', 'sp_msgs', 'sp_hits'] as $t) m_q("DELETE FROM $t"); m_q("DELETE FROM m_settings WHERE k = 'sp_canned'");`);
  setMail({ mail_on: '1', mail_from: 'bildirim@ornek.com', mail_from_name: 'dupcii', mail_host: '127.0.0.1', mail_port: String(port), mail_secure: 'none', mail_user: 'bildirim@ornek.com', mail_pass: 'SmtpSifre1' });
  setRole('burak@test.com', 'editor');
  const sa = JSON.parse(php(`$u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); echo json_encode($u);`));

  // ---- 1) Üye: teknik konu → sistem yöneticisi (arayüzden, telefonda, ekran görüntüsüyle) ----
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  await E.p.goto(BASE + '#/nobetim');
  await E.p.waitForTimeout(500);
  if (await E.p.locator('#spTop').count()) fail('üst çubukta destek düğmesi hâlâ var');
  // Telefonda: menü › Destek
  await E.p.click('[data-act=nav-open]');
  await E.p.click('#sidebar a[href="#/destek"]');
  await E.p.locator('[data-act=sp-new]').first().click();
  await E.p.locator('.sp-topic').first().waitFor();
  const topics = await E.p.locator('.sp-topic').evaluateAll((els) => els.map((e) => e.dataset.k));
  if (topics.includes('kurulum') || !topics.includes('nobet') || !topics.includes('giris')) fail('üyeye yanlış konular: ' + topics.join(','));
  await E.p.screenshot({ path: path.join(OUT, 'sp-konular.png') });
  await E.p.click('.sp-topic[data-k=bildirim]');
  await E.p.locator('.sp-tip').first().waitFor();
  if (await E.p.locator('#spF').count()) fail('hazır çözümler gösterilmeden form açıldı');
  await E.p.click('[data-act=sp-write]');
  await E.p.fill('#spF [name=subject]', 'Telefona bildirim gelmiyor');
  await E.p.fill('#spF [name=body]', 'Hesabım › Bildirimler açık ama nöbet hatırlatması telefona düşmüyor. Uygulamayı ana ekrana ekledim.');
  await E.p.setInputFiles('#spAtt input[type=file]', { name: 'ekran.png', mimeType: 'image/png', buffer: pngFile() });
  await E.p.locator('#spAtt .sp-att-prev img').waitFor();
  await E.p.locator('.sp-ctx-prev summary').click();
  const ctxTxt = await E.p.locator('.sp-ctx-prev').innerText();
  if (!/Takvimim|nobetim/.test(ctxTxt) || !/Üye/.test(ctxTxt)) fail('eklenecek bilgilerde sayfa/rol yok: ' + ctxTxt.replace(/\n/g, ' | '));
  await E.p.screenshot({ path: path.join(OUT, 'sp-form.png'), fullPage: true });
  await E.p.click('#spF button[type=submit]');
  await E.p.waitForFunction(() => /^#\/destek\/\d+$/.test(location.hash));
  await E.p.locator('.sp-thread .sp-img img').waitFor();
  const t1 = +(await E.p.evaluate(() => location.hash.split('/')[2]));
  await E.p.screenshot({ path: path.join(OUT, 'sp-talep-uye.png'), fullPage: true });
  await waitMail(sa.email, /Yeni destek talebi: Telefona bildirim gelmiyor/);
  const bad = await apiErr(E.p, 'sp.create', { topic: 'hata', subject: 'Deneme', body: 'Hastanın kimlik no 10000000146 sistemde görünmüyor' });
  if (!/T\.C\. kimlik/.test(bad)) fail('T.C. kimlik numarası engellenmedi: ' + bad);
  step('üye: üst çubuktaki “?” → kullanıcı konuları (kurulum yok) → önce hazır çözümler → ekran görüntülü talep; sistem yöneticisine e-posta; T.C. kimlik engellendi');

  // ---- 2) Üye: birim konusu → birim sorumlusu; sorumlu yanıtlar ve iletir ----
  const t2 = (await apiCall(E.p, 'sp.create', { topic: 'nobet', subject: 'Aralık nöbetlerim görünmüyor', body: 'Takvimimde aralık ayı boş, listede adım var.', ctx: { page: '#/nobetim', title: 'Takvimim' } }));
  if (t2.route !== 'unit') fail('birim konusu sorumluya gitmedi: ' + t2.route);
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const ab = await A.p.evaluate(() => S.support);
  if (!ab || ab.inbox < 1 || !ab.handler) fail('sorumluda birim talebi sayısı yok: ' + JSON.stringify(ab));
  await A.p.goto(BASE + '#/destek/birim');
  await A.p.locator('.sp-row').first().waitFor();
  const rows = await A.p.locator('.sp-row').allInnerTexts();
  if (!rows.some((r) => /Aralık nöbetlerim/.test(r)) || rows.some((r) => /Telefona bildirim/.test(r))) fail('birim talepleri listesi yanlış: ' + rows.join(' || '));
  await A.p.click('.sp-row:has-text("Aralık nöbetlerim")');
  await A.p.locator('.sp-ctx-card').waitFor();
  const card = await A.p.locator('.sp-ctx-card').innerText();
  if (!/Elif Yılmaz/.test(card) || !/Takvimim/.test(card)) fail('sorumluya kişi / sayfa bilgisi gitmedi: ' + card);
  await A.p.fill('[data-form=sp-reply] [name=body]', 'Merhaba, aralık listesini yeniden yükledim; şimdi bakar mısınız?');
  await A.p.click('[data-form=sp-reply] button[type=submit].primary');
  await A.p.locator('.sp-msg.who-unit').waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'sp-sorumlu.png'), fullPage: true });
  let g = await apiCall(E.p, 'sp.get', { id: t2.ticket.id });
  if (g.ticket.status !== 'answered' || !g.msgs.some((m) => m.who === 'unit')) fail('sorumlunun yanıtı üyeye ulaşmadı');
  const nt = await apiCall(E.p, 'notif.list').catch(() => null);
  if (nt && !(nt.items || []).some((n) => n.kind === 'support')) fail('üyeye uygulama bildirimi gitmedi');
  await apiCall(E.p, 'sp.reply', { id: t2.ticket.id, body: 'Hâlâ boş görünüyor.' });
  await apiCall(A.p, 'sp.forward', { id: t2.ticket.id, note: 'Liste doğru yüklü, ad eşleşmesi çalışmıyor olabilir.' });
  await waitMail(sa.email, /Birimden iletilen destek talebi/);
  g = await apiCall(E.p, 'sp.get', { id: t2.ticket.id });
  if (g.ticket.route !== 'sa' || !g.ticket.forwarded) fail('iletilen talep sistem yöneticisine geçmedi');
  const ag = await apiCall(A.p, 'sp.get', { id: t2.ticket.id });
  if (ag.can.reply) fail('iletildikten sonra sorumlu hâlâ yanıtlayabiliyor');
  step('üye: birim konusu sorumluya gitti; sorumlu kişi ve sayfa bilgisini gördü, yanıtladı (üyeye bildirim), çözemeyince destek ekibine iletti');

  // ---- 3) Sorumlu yolu: yayıncı ve yönetici sistem yöneticisine yazar ----
  const B = await ctx('burak');
  await login(B.p, 'burak@test.com', 'Sifre1234');
  const bc = await apiCall(B.p, 'sp.cfg');
  if (bc.track !== 'lead' || !bc.topics.some((x) => x.key === 'liste') || bc.topics.some((x) => x.route !== 'sa')) fail('yayıncıya sorumlu konuları gelmedi: ' + JSON.stringify(bc.topics.map((x) => x.key + ':' + x.route)));
  const t3 = await apiCall(B.p, 'sp.create', { topic: 'liste', subject: 'Excel yüklenince iki kişi eksik', body: 'Aralık listesini yükledim, iki kişinin satırı okunmadı.', ctx: { page: '#/nobet', title: 'Liste' } });
  const t4 = await apiCall(A.p, 'sp.create', { topic: 'kurulum', subject: 'Duyuru bandı rengi', body: 'Duyuru bandının rengini nasıl değiştiririm?' });
  if (t3.route !== 'sa' || t4.route !== 'sa') fail('sorumlu talepleri sistem yöneticisine gitmedi');
  const inbox = await apiCall(A.p, 'sp.inbox');
  if (inbox.items.some((x) => x.id === t3.ticket.id)) fail('yayıncının sorumlu talebi birim yöneticisinin kutusuna düştü');
  if (!/^40[34]/.test(await apiErr(B.p, 'sp.get', { id: t1 }))) fail('başka kişinin talebi açılabildi');
  const st = await getStatus(B.p, BASE + 'api.php?action=sp.file&id=' + g.msgs[0].id);
  const own = (await apiCall(E.p, 'sp.get', { id: t1 })).msgs.find((m) => m.file);
  if ((await getStatus(B.p, BASE + 'api.php?action=sp.file&id=' + own.file)) !== 404) fail('başka kişi ekran görüntüsünü indirebildi');
  if ((await getStatus(E.p, BASE + 'api.php?action=sp.file&id=' + own.file)) !== 200) fail('kişi kendi ekran görüntüsünü açamadı');
  void st;
  step('sorumlu yolu: yayıncı ve yönetici liste ve birim ayarları konularında sistem yöneticisine yazdı; başkasının talebi ve ekran görüntüsü açılmıyor');

  // ---- 3b) Hazır çözümler ve sık sorulanlar yetkiye göre ----
  const cats = (c) => [...new Set(c.faq.map((x) => x.cat))];
  const has = (c, re) => c.faq.some((x) => re.test(x.q + ' ' + x.a));
  const ec = await apiCall(E.p, 'sp.cfg');
  if (cats(ec).some((k) => /Birim yönetimi|Sunucu|Sorumlu işleri/.test(k))) fail('üyeye yönetici / sorumlu / sunucu çözümleri gösteriliyor: ' + cats(ec).join(', '));
  if (has(ec, /cron|Cron Jobs|Hostinger|SMTP/i)) fail('üyeye sunucu çözümü gösteriliyor');
  if (!has(ec, /Şifremi unuttum/) || !has(ec, /Devret/)) fail('üyenin kendi yapabileceği çözümler eksik');
  if (ec.topics.some((t) => ['kurulum', 'kullanici', 'abonelik', 'liste'].includes(t.key))) fail('üyeye sorumlu konuları açıldı');
  const bc2 = await apiCall(B.p, 'sp.cfg');
  if (!has(bc2, /Yeni ayın nöbet listesini yüklemek/) || !has(bc2, /Nöbet isteği dönemi açmak/)) fail('yayıncıya yönettiği modüllerin çözümleri gelmedi');
  if (cats(bc2).some((k) => /Birim yönetimi|Sunucu/.test(k))) fail('yayıncıya yönetici / sunucu çözümleri gösteriliyor: ' + cats(bc2).join(', '));
  if (bc2.topics.some((t) => ['kurulum', 'kullanici', 'abonelik'].includes(t.key)) || !bc2.topics.some((t) => t.key === 'liste')) fail('yayıncı konuları yanlış: ' + bc2.topics.map((t) => t.key).join(','));
  if (!has(bc2, /Şifremi değiştirmek/)) fail('yayıncı kendi (alt) yetkisindeki çözümleri görmüyor');
  const ac = await apiCall(A.p, 'sp.cfg');
  if (!has(ac, /Ekibi davet etmek/) || !has(ac, /modül .*görünmüyor/)) fail('yöneticiye birim yönetimi çözümleri gelmedi');
  if (has(ac, /cron|Cron Jobs/i) || cats(ac).includes('Sunucu ve güncelleme')) fail('çok birimli kurulumda birim yöneticisine sunucu (cron) çözümü gösteriliyor');
  // Birime özel rol: üye + "İstekler: yönetir" → yalnız o modülün sorumlu çözümü
  php(`nm_tenant_use(nm_tenant_default()); q("INSERT INTO roles (name, perms, sort, created_at) VALUES ('İstek sorumlusu (test)', ?, 0, ?)", [json_encode(['istekler' => 'manage']), now()]); $id = (int)insert_id(); q('UPDATE users SET role_id = ? WHERE email = ?', [$id, 'elif@test.com']);`);
  const er = await apiCall(E.p, 'sp.cfg');
  if (!has(er, /Nöbet isteği dönemi açmak/) || has(er, /Yeni ayın nöbet listesini yüklemek/)) fail('özel rolde yalnız yönettiği modülün çözümü gelmedi');
  php(`nm_tenant_use(nm_tenant_default()); $id = (int)val("SELECT id FROM roles WHERE name = 'İstek sorumlusu (test)'"); q('UPDATE users SET role_id = NULL WHERE role_id = ?', [$id]); q('DELETE FROM roles WHERE id = ?', [$id]);`);
  // Rol önizlemesinde yönetici üyenin gördüğünü görür
  await apiCall(A.p, 'me.viewas', { role: 'member' });
  const av = await apiCall(A.p, 'sp.cfg');
  await apiCall(A.p, 'me.viewas', { role: '' });
  if (cats(av).some((k) => /Birim yönetimi|Sorumlu işleri/.test(k))) fail('üye önizlemesinde yönetici çözümleri görünüyor');
  // Arayüz: sık sorulanlarda arama
  await E.p.goto(BASE + '#/destek');
  await E.p.locator('#spFaqQ').waitFor();
  await E.p.fill('#spFaqQ', 'bildirim gelmiyor');
  await E.p.waitForTimeout(300);
  const fq = await E.p.locator('#spFaqBody').innerText();
  if (!/Telefona bildirim gelmiyor/.test(fq) || /Şifremi unuttum/.test(fq)) fail('sık sorulanlarda arama çalışmıyor: ' + fq.slice(0, 200));
  await E.p.screenshot({ path: path.join(OUT, 'sp-sss-uye.png'), fullPage: true });
  await A.p.goto(BASE + '#/destek');
  await A.p.locator('#spFaqBody').waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'sp-sss-yonetici.png'), fullPage: true });
  step(`hazır çözümler yetkiye göre: üye ${ec.faq.length} madde (yönetim / sunucu yok), yayıncı ${bc2.faq.length} (yönettiği modüller + kendi hesabı), yönetici ${ac.faq.length} (cron yok: çok birimlide sistem yöneticisinin işi); özel rol yalnız yönettiği modülü görüyor; önizlemede üyenin gördüğü; arama çalışıyor`);

  // ---- 4) Sistem yöneticisi ----
  const SA = await ctx('sistem');
  await SA.p.goto(BASE);
  await SA.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
  await apiCall(SA.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
  while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await sleep(1000);
  await apiCall(SA.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
  await SA.p.goto(BASE); await SA.p.reload();
  await SA.p.locator('[data-act=sys-tab][data-t=destek]').waitFor();
  const badge = await SA.p.locator('#sysSpN').innerText();
  if (+badge < 4) fail('destek sekmesi rozeti yanlış: ' + badge);
  await SA.p.click('[data-act=sys-tab][data-t=destek]');
  await SA.p.locator('.sp-row').first().waitFor();
  const list = await apiCall(SA.p, 'sa.sp.list', { status: 'open' });
  const ids = list.items.map((x) => x.id);
  for (const id of [t1, t2.ticket.id, t3.ticket.id, t4.ticket.id]) if (!ids.includes(id)) fail('sistem yöneticisi listesinde yok: #' + id);
  const r3 = list.items.find((x) => x.id === t3.ticket.id);
  if (r3.track !== 'lead' || !r3.unit_name || !r3.hosp_name || r3.role !== 'editor') fail('sorumlu talebinde birim / hastane / rol yok: ' + JSON.stringify(r3));
  await SA.p.screenshot({ path: path.join(OUT, 'sp-sa-liste.png'), fullPage: true });
  await SA.p.click(`.sp-row[data-id="${t3.ticket.id}"]`);
  await SA.p.locator('.modal .sp-ctx-card').waitFor();
  const sctx = await SA.p.locator('.modal .sp-ctx-card').innerText();
  for (const need of ['Hastane', 'Birim', 'Burak Demir', 'Sorumlu', 'Yönettiği modüller', 'Liste']) if (!sctx.includes(need)) fail('sistem yöneticisi bağlamında eksik: ' + need + ' — ' + sctx.replace(/\n/g, ' | '));
  await SA.p.waitForTimeout(500);
  await SA.p.screenshot({ path: path.join(OUT, 'sp-sa-talep.png') });
  // iç not + yanıt
  await SA.p.fill('#spsF [name=body]', 'Excel’de iki satırda ad hücresi birleştirilmiş olabilir.');
  await SA.p.click('#spsF label.switch:has([name=internal]) .track');
  await SA.p.click('.modal button[form=spsF].primary');
  await SA.p.locator('.modal .sp-msg.internal').waitFor();
  await SA.p.fill('#spsF [name=body]', 'Merhaba, iki satırda ad hücresi birleştirilmiş görünüyor; ayırıp yeniden yükleyin.');
  await SA.p.click('.modal button[form=spsF].primary');
  await SA.p.waitForFunction(() => document.querySelectorAll('.modal .sp-msg.who-sa:not(.internal)').length >= 1);
  const bb = await B.p.evaluate(() => api('boot').then((x) => x.support));
  if (!bb || bb.mine < 1) fail('yanıt gelince kişide okunmamış sayısı yok');
  const bg = await apiCall(B.p, 'sp.get', { id: t3.ticket.id });
  if (bg.msgs.some((m) => m.internal || /birleştirilmiş olabilir/.test(m.body))) fail('iç not kişiye göründü');
  if (bg.ticket.status !== 'answered' || !bg.msgs.some((m) => m.who === 'sa' && m.name === 'dupcii destek')) fail('sistem yöneticisi yanıtı kişiye ulaşmadı');
  // hazır yanıt, birime aktar, kapat
  const can = await apiCall(SA.p, 'sa.sp.canned', { items: [{ t: 'Şifre sıfırlama', b: 'Merhaba {ad}, “Şifremi unuttum” bağlantısını kullanın.' }] });
  if (can.canned.length !== 1) fail('hazır yanıt kaydedilmedi');
  await apiCall(SA.p, 'sa.sp.set', { id: t1, act: 'unit', note: 'Bildirim ayarlarınızı birim sorumlunuz kontrol edecek.' });
  const in2 = await apiCall(A.p, 'sp.inbox');
  if (!in2.items.some((x) => x.id === t1)) fail('birime aktarılan talep sorumluya düşmedi');
  if (!/^4/.test(await apiErr(SA.p, 'sa.sp.set', { id: t3.ticket.id, act: 'unit' }))) fail('sorumlu talebi birime aktarılabildi');
  await apiCall(SA.p, 'sa.sp.reply', { id: t2.ticket.id, body: 'Ad eşleşmesini düzelttik, takviminiz doldu.', close: true });
  const eg = await apiCall(E.p, 'sp.get', { id: t2.ticket.id });
  if (eg.ticket.status !== 'closed' || !eg.can.rate) fail('kapanan talep puanlanamıyor');
  await apiCall(E.p, 'sp.rate', { id: t2.ticket.id, rating: 5 });
  step(`sistem yöneticisi: Destek sekmesi (rozet ${badge}), hastane › birim, kişi, rol, yönettiği modüller ve sayfa görünüyor; iç not kişiye gitmedi, yanıt “dupcii destek” adıyla ulaştı; hazır yanıt; üye talebi birime aktarıldı; yanıtla-kapat ve puan`);

  // ---- 5) Giriş yapamayan kişi ----
  const G = await ctx('misafir', true);
  await G.p.goto(BASE);
  await G.p.locator('[data-act=sp-help]').waitFor();
  await G.p.click('[data-act=sp-help]');
  await G.p.fill('#spHelpF [name=name]', 'Mert Tan');
  await G.p.fill('#spHelpF [name=email]', 'mert.tan@ornek.com');
  await G.p.fill('#spHelpF [name=unit]', 'Şehir Hastanesi · Yoğun Bakım');
  await G.p.fill('#spHelpF [name=body]', 'Şifremi doğru yazıyorum ama hatalı diyor, sıfırlama e-postası da gelmiyor.');
  await G.p.screenshot({ path: path.join(OUT, 'sp-giris-yapamiyorum.png') });
  await G.p.click('.modal button[form=spHelpF]');
  await G.p.locator('.modal a:has-text("Talebimi izle")').waitFor();
  await waitMail('mert.tan@ornek.com', /Destek talebiniz alındı/);
  await waitMail(sa.email, /Giriş yapamayan kişiden/);
  await G.p.click('.modal a:has-text("Talebimi izle")');
  await G.p.locator('#spPub .sp-thread').waitFor();
  const pub = (await apiCall(SA.p, 'sa.sp.list', { track: 'public' })).items[0];
  if (!pub || pub.user_name !== 'Mert Tan') fail('giriş yapamayanın talebi sistem yöneticisine düşmedi');
  await apiCall(SA.p, 'sa.sp.reply', { id: pub.id, body: 'Merhaba, hesabınızı birim yöneticiniz onayladığında giriş yapabileceksiniz.' });
  await waitMail('mert.tan@ornek.com', /Destek talebinize yanıt geldi/);
  await G.p.reload();
  await G.p.locator('#spPub .sp-msg.who-sa').waitFor();
  await G.p.fill('#spPub [name=body]', 'Teşekkürler, bekliyorum.');
  await G.p.click('#spPub button[type=submit]');
  await G.p.waitForFunction(() => document.querySelectorAll('#spPub .sp-msg').length >= 3);
  await G.p.screenshot({ path: path.join(OUT, 'sp-izle.png'), fullPage: true });
  const hp = await G.p.evaluate(() => api('help.ask', { name: 'Bot', email: 'bot@ornek.com', body: 'spam spam spam', website: 'http://x' }));
  const nPub = (await apiCall(SA.p, 'sa.sp.list', { track: 'public' })).items.length;
  if (!hp.ok || nPub !== 1) fail('bal küpü doldurulan talep kaydedildi');
  step('giriş yapamayan: giriş ekranındaki “Giriş yapamıyorum” → talep; alındı e-postası, sistem yöneticisine haber; yanıt e-postayla geldi, izleme sayfasından okundu ve yanıtlandı; bot talebi kaydedilmedi');

  // ---- 6) Rol önizlemesinde talep açılamaz; mobilde düzen ----
  await apiCall(A.p, 'me.viewas', { role: 'member' });
  if (!/^423/.test(await apiErr(A.p, 'sp.create', { topic: 'hata', subject: 'Deneme', body: 'önizlemede deneme talebi' }))) fail('rol önizlemesinde talep açılabildi');
  await apiCall(A.p, 'me.viewas', { role: '' });
  await E.p.goto(BASE + '#/destek');
  await E.p.locator('.sp-row').first().waitFor();
  const ov = await E.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (ov > 1) fail('telefonda destek sayfası yatay taşıyor: ' + ov);
  await E.p.screenshot({ path: path.join(OUT, 'sp-mobil-liste.png') });
  step('rol önizlemesinde talep açılmıyor; telefonda liste taşmıyor');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { setMail(def.mail); setRole('burak@test.com', def.burak); } catch (e) { errors.push('geri alma: ' + e.message); }
  await browser.close();
  smtp.kill();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: destek testleri geçti');
