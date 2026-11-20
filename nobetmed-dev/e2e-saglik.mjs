// Sistem sağlığı paneli (4.18) — uçtan uca. Çok birimlide e2e-tenant SONRASI; tek birimlide temel testlerden sonra.
//   node e2e-saglik.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MULTI = php('echo nm_multi() ? 1 : 0;').trim() === '1';

const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const MAILDIR = path.join(OUT, 'saglik-mail');
fs.rmSync(MAILDIR, { recursive: true, force: true });
const smtp = spawn('python3', [path.join(DEV, 'fake-smtp.py'), String(port), MAILDIR, 'bildirim@ornek.com', 'SmtpSifre1'], { stdio: 'ignore' });
await sleep(600);
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag) {
  const c = await browser.newContext({ viewport: { width: 1360, height: 900 } });
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
const find = (d, t) => { for (const g of d.groups) for (const i of g.items) if (i.t === t) return i; return null; };
const pre = MULTI ? 'nm_tenant_use(nm_tenant_default()); ' : '';
const MAIL_KEYS = ['mail_on', 'mail_from', 'mail_from_name', 'mail_host', 'mail_port', 'mail_secure', 'mail_user', 'mail_pass'];
const mailOrig = JSON.parse(php(`${pre}$o = []; foreach (${JSON.stringify(MAIL_KEYS).replace(/"/g, "'")} as $k) $o[$k] = setting($k); echo json_encode($o);`));
const setMail = (kv) => php(`${pre}foreach (json_decode(base64_decode('${Buffer.from(JSON.stringify(kv)).toString('base64')}'), true) as $k => $v) set_setting($k, (string)$v);`);
const ERRLOG = path.join(SITE, 'error_log');

try {
  setMail({ mail_on: '0' });
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  let P, act;
  if (MULTI) {
    const sa = JSON.parse(php(`$u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); echo json_encode($u);`));
    P = await ctx('sistem');
    await P.p.goto(BASE);
    await P.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
    await apiCall(P.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
    while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await sleep(1000);
    await apiCall(P.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
    act = 'sa.health';
    P.saEmail = sa.email;
    if (!/^401/.test(await apiErr(A.p, 'sa.health'))) fail('birim yöneticisi sistem sağlığını görebildi');
    if (!/^403/.test(await apiErr(A.p, 'health.get'))) fail('çok birimlide birim yöneticisi sağlık uçunu açabildi');
  } else {
    P = A; act = 'health.get';
    const E = await ctx('elif'); await login(E.p, 'elif@test.com', 'YeniSifre99');
    if (!/^403/.test(await apiErr(E.p, 'health.get'))) fail('üye sistem sağlığını görebildi');
  }

  // ---- 1) Genel yapı ve e-posta ayarı yokken ----
  let d = await apiCall(P.p, act);
  const want = ['Sunucu', 'Zamanlanmış görevler', 'E-posta', 'Yedek', 'Güvenlik', 'Sunucu hataları'].concat(MULTI ? ['Yayın ve satış', 'Birimler'] : []);
  for (const g of want) if (!d.groups.some((x) => x.t === g)) fail('grup yok: ' + g);
  const otherMail = MULTI ? +php(`$n = 0; foreach (nm_tenants() as $t) if (nm_tenant_peek_setting($t, 'mail_on') === '1') $n++; echo $n;`).trim() : 0;
  if (!otherMail && find(d, 'E-posta ayarı').s !== 'err') fail('e-posta ayarı yokken hata gösterilmedi');
  if (find(d, 'PHP eklentileri').s === 'err') fail('eklenti denetimi yanlış hata verdi');
  if (find(d, 'Korumalı klasörler').s !== 'ok') fail('korumalı klasör denetimi: ' + JSON.stringify(find(d, 'Korumalı klasörler')));
  if (find(d, 'Cron').s !== 'ok' && !find(d, 'Cron').f.includes('cron.php')) fail('cron için düzeltme talimatı yok');
  if (MULTI && find(d, 'Sunucu dışı yedek').s !== 'warn') fail('kapalı sunucu dışı yedek uyarılmadı');
  if (d.count.ok + d.count.warn + d.count.err + d.count.info !== d.groups.reduce((n, g) => n + g.items.length, 0)) fail('özet sayıları hatalı');
  step(`denetim: ${d.groups.length} grup, ${d.count.ok} tamam / ${d.count.warn} öneri / ${d.count.err} sorun; e-posta ayarı yokken kırmızı${otherMail ? ' (başka birimde ayar var, atlandı)' : ''}, her maddede nasıl düzeltilir`);

  // ---- 2) Cron ve e-posta düzeltilince ----
  execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' });
  setMail({ mail_on: '1', mail_from: 'bildirim@ornek.com', mail_from_name: 'dupcii', mail_host: '127.0.0.1', mail_port: String(port), mail_secure: 'none', mail_user: 'bildirim@ornek.com', mail_pass: 'SmtpSifre1' });
  d = await apiCall(P.p, act);
  if (find(d, 'Cron').s !== 'ok') fail('cron çalıştıktan sonra hâlâ sorun: ' + JSON.stringify(find(d, 'Cron')));
  if (find(d, 'E-posta ayarı').s !== 'ok' || !/bildirim@ornek\.com/.test(find(d, 'E-posta ayarı').d)) fail('e-posta ayarı görülmedi');
  const dns = ['SPF kaydı', 'SPF / DKIM / DMARC'].map((t) => find(d, t)).find(Boolean);
  if (!dns) fail('SPF denetimi yok');
  step('cron çalıştırıldı → yeşil; e-posta ayarı yapıldı → yeşil; SPF/DKIM/DMARC denetlendi (' + dns.s + ': ' + dns.d.slice(0, 80) + ')');

  // ---- 3) Hata günlüğü ----
  const now = new Date();
  const stamp = now.toUTCString().replace(/^\w+, (\d+) (\w+) (\d+) ([\d:]+) GMT$/, '$1-$2-$3 $4 UTC');
  fs.writeFileSync(ERRLOG, `[${stamp}] PHP Warning:  Undefined array key "x" in ${SITE}/inc/ornek.php on line 3\n[${stamp}] PHP Fatal error:  Uncaught Error: deneme in ${SITE}/api.php:10\n`);
  d = await apiCall(P.p, act);
  const hl = find(d, 'Hata günlüğü');
  if (hl.s !== 'err' || hl.lines.length !== 2) fail('hata günlüğü okunmadı: ' + JSON.stringify(hl));
  if (hl.lines.some((l) => l.includes(SITE))) fail('hata satırlarında sunucu yolu kısaltılmadı');
  step('hata günlüğü: son 7 günün ciddi hataları kırmızı, satırlar gösteriliyor (sunucu yolu gizli)');

  // ---- 4) Arayüz ----
  if (MULTI) {
    await P.p.goto(BASE); await P.p.waitForFunction(() => typeof S !== 'undefined' && S.sa);
    await P.p.locator('[data-act=sys-tab][data-t=saglik]').click();
    await P.p.locator('.sh-sum').waitFor({ timeout: 30000 });
    await P.p.locator('.sh-log summary').click();
    await P.p.screenshot({ path: path.join(OUT, 'hl-panel.png'), fullPage: true });
    await P.p.locator('[data-act=sh-mail]').click();
    await P.p.getByText('Deneme e-postası').first().waitFor();
    let got = false;
    for (let i = 0; i < 50 && !got; i++) { got = fs.existsSync(MAILDIR) && fs.readdirSync(MAILDIR).some((f) => f.endsWith(P.saEmail + '.eml')); if (!got) await sleep(200); }
    if (!got) fail('deneme e-postası sistem yöneticisine gelmedi');
    const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: await P.c.storageState() });
    const mp = await mob.newPage();
    await mp.goto(BASE); await mp.waitForFunction(() => typeof S !== 'undefined' && S.sa);
    await mp.locator('[data-act=sys-tab][data-t=saglik]').click();
    await mp.locator('.sh-sum').waitFor({ timeout: 30000 });
    const ow = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (ow > 392) fail('sağlık paneli telefonda taşıyor: ' + ow);
    await mp.screenshot({ path: path.join(OUT, 'hl-mobil.png'), fullPage: true });
    step('sistem yönetimi › Sistem sağlığı sekmesi; deneme e-postası sistem yöneticisine geldi; telefonda taşma yok');
  } else {
    await A.p.goto(BASE + '#/yonetim/ayarlar');
    await A.p.locator('[data-act=sh-open]').click();
    await A.p.locator('#shModal .sh-sum').waitFor({ timeout: 30000 });
    await A.p.screenshot({ path: path.join(OUT, 'hl-tek.png'), fullPage: true });
    step('tek birimli kurulum: Ayarlar › Sistem sağlığı penceresi');
  }
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { fs.rmSync(ERRLOG, { force: true }); setMail(mailOrig); } catch (e) { errors.push('geri alma: ' + e.message); }
  await browser.close();
  smtp.kill();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: sistem sağlığı testleri geçti');
