// Tanıtım + yasal sayfalar, aydınlatma metni, Verilerim (KVKK), sunucu dışı yedek (4.17) — uçtan uca.
// Çok birimli (SQLite) kurulumda e2e-tenant / e2e-hastane SONRASI; tek birimli (MySQL) kurulumda temel testlerden sonra çalışır.
//   node e2e-yasal.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const MAILDIR = path.join(OUT, 'yasal-mail');
fs.rmSync(MAILDIR, { recursive: true, force: true });
const smtp = spawn('python3', [path.join(DEV, 'fake-smtp.py'), String(port), MAILDIR, 'bildirim@ornek.com', 'SmtpSifre1'], { stdio: 'ignore' });
await sleep(600);

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
const fetchText = async (u) => { const r = await fetch(BASE + u, { redirect: 'manual' }); return [r.status, await r.text(), r.headers.get('location') || '']; };
const MAIL_KEYS = ['mail_on', 'mail_from', 'mail_from_name', 'mail_host', 'mail_port', 'mail_secure', 'mail_user', 'mail_pass'];
const mailOrig = JSON.parse(php(`nm_tenant_use(nm_tenant_default()); $o = []; foreach (${JSON.stringify(MAIL_KEYS).replace(/"/g, "'")} as $k) $o[$k] = setting($k); echo json_encode($o);`));
const setMail = (kv) => php(`nm_tenant_use(nm_tenant_default()); foreach (json_decode(base64_decode('${Buffer.from(JSON.stringify(kv)).toString('base64')}'), true) as $k => $v) set_setting($k, (string)$v);`);
const lgReset = () => php(`$r = include '${path.join(SITE, 'inc/mod_yasal.php')}'; $k = []; foreach (array_merge(LG_INFO_KEYS, array_map(fn($x) => 't_' . $x, array_keys(LG_PAGES))) as $x) $k[$x] = ''; lg_put($k);`);

const OWNER = 'Örnek Yazılım Hizmetleri Ltd. Şti.';
try {
  lgReset();
  if (MULTI) php(`$r = include '${path.join(SITE, 'inc/mod_yedek.php')}'; obk_put(OBK_DEFAULTS);`);
  // ---- 1) Varsayılan kapalı ----
  let [st, body, loc] = await fetchText('tanitim.php');
  if (st !== 302 || !/index\.php/.test(loc)) fail('yayın kapalıyken tanıtım sayfası açıldı: ' + st);
  [st] = await fetchText('yasal.php?s=kvkk');
  if (st !== 404) fail('yayın kapalıyken yasal sayfa açıldı: ' + st);
  const G = await ctx('misafir');
  await G.p.goto(BASE); await G.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
  if (await G.p.locator('.lg-links').count()) fail('kapalıyken giriş ekranında yasal bağlantılar var');
  step('varsayılan: tanıtım ve yasal sayfalar kapalı (yönlendirme / 404), giriş ekranında bağlantı yok');

  // ---- 2) Düzenleyici: çok birimlide sistem yöneticisi, tek birimlide birim yöneticisi ----
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  let ED, pre;
  if (MULTI) {
    const sa = JSON.parse(php(`$u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); echo json_encode($u);`));
    ED = await ctx('sistem');
    await ED.p.goto(BASE);
    await ED.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
    await apiCall(ED.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
    while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await sleep(1000);
    await apiCall(ED.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
    pre = 'sa.legal';
    if (!/^401/.test(await apiErr(A.p, 'legal.save', { on: true }))) fail('çok birimlide birim yöneticisi yasal metinleri değiştirebildi');
    await ED.p.goto(BASE); await ED.p.waitForFunction(() => typeof S !== 'undefined' && S.sa);
    await ED.p.locator('[data-act=sys-tab][data-t=site]').click();
    await ED.p.locator('.lg-ed').waitFor();
  } else {
    ED = A; pre = 'legal';
    if (!(await A.p.evaluate(() => S.legal_admin))) fail('tek birimde yöneticiye yasal metin kartı açılmadı');
    await A.p.goto(BASE + '#/yonetim/ayarlar'); await A.p.locator('#lgAdmBox .lg-ed').waitFor({ timeout: 15000 });
  }
  const E = await ctx('elif');
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  if (!/^40[13]/.test(await apiErr(E.p, 'legal.save', { on: true }))) fail('üye yasal metinleri değiştirebildi');
  let d = await apiCall(ED.p, pre + '.get');
  if (!d.missing.includes('Unvan') || d.texts.kvkk.custom) fail('başlangıç künye/taslak durumu hatalı');
  // Panelden doldur ve yayımla
  const box = MULTI ? ED.p.locator('#lgBox') : ED.p.locator('#lgAdmBox');
  await box.locator('[data-lg=owner]').fill(OWNER);
  await box.locator('[data-lg=address]').fill('Örnek Mah. Deneme Cad. No:1 Çankaya / Ankara');
  await box.locator('[data-lg=tax_office]').fill('Çankaya');
  await box.locator('[data-lg=tax_no]').fill('1234567890');
  await box.locator('[data-lg=email]').fill('destek@ornek.com');
  await box.locator('[data-lg=phone]').fill('0312 000 00 00');
  await box.locator('[data-lg=host]').fill('Örnek Barındırma A.Ş. (sunucu konumu: Avrupa Birliği)');
  await box.locator('[data-lg=court]').fill('Ankara');
  await box.locator('label.switch:has([data-lg=on]) .track').click();
  await box.locator('label.switch:has([data-lg=notice]) .track').click();
  await box.locator('[data-act=lg-page][data-k=gizlilik]').click();
  await box.locator('#lgText').fill('## Kısaca\nÖzel gizlilik metni: {MARKA} reklam göstermez.\n- Madde bir\n- Madde **iki**');
  await box.locator('[data-act=lg-save]').click();
  await ED.p.getByText('Kaydedildi').first().waitFor();
  d = await apiCall(ED.p, pre + '.get');
  if (d.info.on !== '1' || d.info.owner !== OWNER || !d.texts.gizlilik.custom || d.texts.kvkk.custom) fail('panelden kaydedilmedi: ' + JSON.stringify(d.info));
  if (d.missing.length) fail('künye eksik görünüyor: ' + d.missing.join(', '));
  if (!/^4\d\d/.test(await apiErr(ED.p, pre + '.save', { tax_no: '12ab' }))) fail('geçersiz vergi no kabul edildi');
  await ED.p.screenshot({ path: path.join(OUT, 'lg-panel.png'), fullPage: true });
  step((MULTI ? 'sistem yöneticisi' : 'birim yöneticisi (tek birimli kurulum)') + ' künyeyi doldurdu, gizlilik metnini özelleştirdi, yayımladı; diğerleri değiştiremez');

  // ---- 3) Herkese açık sayfalar ----
  [st, body] = await fetchText('tanitim.php');
  if (st !== 200 || !/Nöbet listeleri her an cepte/.test(body) || !body.includes('Örnek Yazılım Hizmetleri Ltd. Şti.')) fail('tanıtım sayfası içeriği eksik: ' + st);
  if (!/yasal\.php\?s=kvkk/.test(body)) fail('tanıtım sayfasında yasal bağlantılar yok');
  if ((body.match(/class="lp-vis"/g) || []).length < 8 || !/Sık sorulanlar/.test(body) || !/Herkes için ayrı kolaylık/.test(body) || !/class="phone"/.test(body)) fail('tanıtım sayfasında görselli bölümler eksik');
  [st, body] = await fetchText('yasal.php?s=kvkk');
  if (st !== 200 || !body.includes(OWNER) || !body.includes('Örnek Barındırma A.Ş.') || !/11\. maddesi/.test(body)) fail('KVKK aydınlatma metni hatalı');
  if (/KEP adres/.test(body)) fail('girilmeyen (isteğe bağlı) KEP adresi metinde göründü');
  await apiCall(ED.p, pre + '.save', { court: '' });
  [st, body] = await fetchText('yasal.php?s=kosullar');
  if (!/<mark>\[Yetkili mahkeme[^\]]*\]<\/mark>/.test(body)) fail('boş zorunlu künye alanı belirgin gösterilmedi');
  await apiCall(ED.p, pre + '.save', { court: 'Ankara' });
  [st, body] = await fetchText('yasal.php?s=gizlilik');
  if (!/Özel gizlilik metni: dupcii reklam göstermez/.test(body) || !/<li>Madde <strong>iki<\/strong><\/li>/.test(body)) fail('özel gizlilik metni biçimlenmedi');
  [st, body] = await fetchText('yasal.php?s=satis');
  if (!/Çankaya Vergi Dairesi, VKN\/TCKN: 1234567890/.test(body) || !/15\. maddesinin/.test(body)) fail('mesafeli satış metninde künye yok');
  [st, body] = await fetchText('yasal.php?s=iade');
  if (!/14 gün/.test(body)) fail('iade sayfası hatalı');
  [st, body] = await fetchText('yasal.php?s=%3Cscript%3E');
  if (st !== 200 || /<script>/.test(body)) fail('bilinmeyen sayfa adı güvenli işlenmedi');
  const P = await ctx('tanitim-tel', true);
  await P.p.goto(BASE + 'tanitim.php');
  await P.p.screenshot({ path: path.join(OUT, 'lg-tanitim-mobil.png'), fullPage: true });
  const ow = await P.p.evaluate(() => document.documentElement.scrollWidth);
  if (ow > 392) fail('tanıtım sayfası telefonda taşıyor: ' + ow);
  const W = await ctx('tanitim-pc');
  await W.p.goto(BASE + 'tanitim.php'); await W.p.screenshot({ path: path.join(OUT, 'lg-tanitim.png'), fullPage: true });
  await W.p.goto(BASE + 'yasal.php?s=kvkk'); await W.p.screenshot({ path: path.join(OUT, 'lg-kvkk.png'), fullPage: true });
  await G.p.goto(BASE); await G.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
  if ((await G.p.locator('.lg-links a').count()) !== 4) fail('giriş ekranında yasal bağlantılar yok');
  step('herkese açık: tanıtım (telefonda taşma yok), KVKK / gizlilik (özel metin) / mesafeli satış / iade; künye ve boş alan işareti; giriş ekranında bağlantılar');

  // ---- 4) Aydınlatma metni bildirimi ----
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const ack0 = await E.p.evaluate(() => S.legal && S.legal.ack);
  if (!ack0) fail('kullanıcıya aydınlatma metni bildirimi düşmedi');
  await E.p.locator('#lgAckOk').waitFor({ timeout: 10000 });
  await E.p.screenshot({ path: path.join(OUT, 'lg-ack.png') });
  await E.p.click('#lgAckOk');
  await E.p.getByText('Teşekkürler').first().waitFor();
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  if (await E.p.evaluate(() => S.legal && S.legal.ack)) fail('okundu kaydedilmedi');
  if (!/^409/.test(await apiErr(E.p, 'me.kvkk.ack', { ver: 'eski' }))) fail('eski sürüm okundu sayıldı');
  // Metin değişince yeniden sorulur
  await apiCall(ED.p, pre + '.save', { texts: { kvkk: d.texts.kvkk.tpl + '\n\nEk madde: test.' } });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  if (!(await E.p.evaluate(() => S.legal && S.legal.ack))) fail('metin değişince yeniden sorulmadı');
  await E.p.locator('#lgAckOk').click({ timeout: 10000 });
  await E.p.getByText('Teşekkürler').first().waitFor();
  step('aydınlatma metni: girişte bir kez gösterildi, “Okudum” kaydedildi; metin değişince yeniden soruldu');

  // ---- 5) Verilerim: indir ve silme talebi ----
  await E.p.goto(BASE + '#/profil/veri');
  await E.p.locator('#lgPriv a[href*="me.export"]').waitFor();
  const exp = await E.p.evaluate(async () => { const r = await fetch('api.php?action=me.export'); return [r.status, r.headers.get('content-disposition'), await r.text()]; });
  if (exp[0] !== 200 || !/attachment/.test(exp[1])) fail('veri kopyası indirilemedi');
  const J = JSON.parse(exp[2]);
  if (J.Hesap.email !== 'elif@test.com' || 'password_hash' in J.Hesap) fail('veri kopyası hesabı hatalı');
  if (/password_hash|sk_hash|p256dh|public_key|credential_id/.test(exp[2])) fail('veri kopyasında gizli alan var');
  if (/ayse@test\.com|kerem@test\.com/.test(exp[2])) fail('veri kopyasında başka kişinin e-postası var');
  const anon = await G.p.evaluate(async () => (await fetch('api.php?action=me.export')).status);
  if (anon !== 401) fail('girişsiz veri kopyası alınabildi');
  await E.p.locator('[data-act=lg-del]').click();
  await E.p.fill('.modal [name=v]', 'Birimden ayrıldım');
  await E.p.click('.modal [data-ok]');
  await E.p.getByText('yöneticinize iletildi').first().waitFor();
  await E.p.locator('[data-act=lg-del-cancel]').waitFor();
  await E.p.screenshot({ path: path.join(OUT, 'lg-verilerim.png'), fullPage: true });
  const users = (await apiCall(A.p, 'admin.users')).users;
  if (!users.find((u) => u.email === 'elif@test.com').del_req) fail('yönetici listesinde silme talebi yok');
  const nt = php(`${MULTI ? 'nm_tenant_use(nm_tenant_default()); ' : ''}echo val("SELECT COUNT(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.kind = 'privacy' AND u.email = 'ayse@test.com'");`).trim();
  if (+nt < 1) fail('yöneticiye silme talebi bildirimi gitmedi');
  await A.p.goto(BASE + '#/yonetim/kullanicilar');
  await A.p.getByText('Silme talebi').first().waitFor({ timeout: 10000 }).catch(() => fail('kişiler sayfasında silme talebi rozeti görünmedi'));
  await E.p.locator('[data-act=lg-del-cancel]').click();
  await E.p.getByText('geri alındı').first().waitFor();
  if ((await apiCall(A.p, 'admin.users')).users.find((u) => u.email === 'elif@test.com').del_req) fail('silme talebi geri alınmadı');
  step('Verilerim: kişisel veri kopyası (gizli alan ve başka kişinin bilgisi yok, girişsiz 401); silme talebi yöneticiye bildirildi, listede rozet, geri alındı');

  // ---- 6) Sunucu dışı yedek (yalnız çok birimli) ----
  if (MULTI) {
    setMail({ mail_on: '1', mail_from: 'bildirim@ornek.com', mail_from_name: 'dupcii', mail_host: '127.0.0.1', mail_port: String(port), mail_secure: 'none', mail_user: 'bildirim@ornek.com', mail_pass: 'SmtpSifre1' });
    if (!/şifre/i.test(await apiErr(ED.p, 'sa.obk.save', { on: true, email: 'yedek@ornek.com' }))) fail('şifresiz yedek açılabildi');
    if (!/10 karakter/.test(await apiErr(ED.p, 'sa.obk.save', { pass: 'kisa' }))) fail('kısa yedek şifresi kabul edildi');
    await ED.p.goto(BASE); await ED.p.waitForFunction(() => typeof S !== 'undefined' && S.sa);
    await ED.p.locator('[data-act=sys-tab][data-t=site]').click();
    await ED.p.locator('#obkEmail').waitFor();
    await ED.p.locator('label.switch:has(#obkOn) .track').click();
    await ED.p.fill('#obkEmail', 'yedek@ornek.com');
    await ED.p.fill('#obkPass', 'YedekSifre-2026!');
    await ED.p.click('[data-act=obk-save]');
    await ED.p.getByText('Kaydedildi').first().waitFor();
    const raw = php(`echo m_setting('obk_pass');`);
    if (!raw || raw.includes('YedekSifre')) fail('yedek şifresi açık saklandı');
    await ED.p.click('[data-act=obk-run]');
    await ED.p.getByText('Yedek gönderildi').first().waitFor({ timeout: 60000 });
    let eml = null;
    for (let i = 0; i < 50 && !eml; i++) { const f = fs.existsSync(MAILDIR) ? fs.readdirSync(MAILDIR).find((x) => x.endsWith('yedek@ornek.com.eml')) : null; if (f) eml = fs.readFileSync(path.join(MAILDIR, f), 'utf8'); else await sleep(200); }
    if (!eml) fail('yedek e-postası gelmedi');
    else {
      const m = eml.match(/Content-Type: application\/zip; name="([^"]+)"\r?\nContent-Transfer-Encoding: base64\r?\nContent-Disposition: attachment[^\n]*\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/);
      if (!m) fail('yedek e-postasında ek yok');
      else {
        const zp = path.join(OUT, 'yedek-test.zip');
        fs.writeFileSync(zp, Buffer.from(m[2].replace(/\s+/g, ''), 'base64'));
        const chk = php(`$z = new ZipArchive(); $z->open('${zp}'); $names = []; for ($i = 0; $i < $z->numFiles; $i++) $names[] = $z->getNameIndex($i);
          $sq = ''; foreach ($names as $n) if (str_starts_with($n, 'birimler/') && str_ends_with($n, '.sqlite')) { $sq = $n; break; }
          $no = @$z->getFromName($sq); $z->setPassword('YedekSifre-2026!'); $yes = $z->getFromName($sq);
          $st = $z->statName($sq);
          echo json_encode(['n' => count($names), 'birim' => count(array_filter($names, fn($x) => str_starts_with($x, 'birimler/') && str_ends_with($x, '.sqlite'))), 'merkez' => count(array_filter($names, fn($x) => str_starts_with($x, 'merkez/'))), 'h' => count(array_filter($names, fn($x) => str_starts_with($x, 'hastaneler/'))), 'enc' => $st['encryption_method'] ?? 0, 'nopass' => $no === false, 'sqlite' => is_string($yes) && str_starts_with($yes, 'SQLite format 3')]);`);
        const z = JSON.parse(chk);
        const tc = +php('echo count(nm_tenants());').trim();
        if (z.birim !== tc || z.merkez < 1 || z.h < 1) fail('yedekte eksik veritabanı: ' + chk);
        if (!z.enc || !z.nopass || !z.sqlite) fail('yedek şifreli değil ya da şifreyle açılmadı: ' + chk);
      }
    }
    const dl = await ED.p.evaluate(async () => { const r = await fetch('api.php?action=sa.obk.download'); const b = new Uint8Array(await r.arrayBuffer()); return [r.status, r.headers.get('content-type'), b[0], b[1], b.length]; });
    if (dl[0] !== 200 || dl[1] !== 'application/zip' || dl[2] !== 0x50 || dl[3] !== 0x4b) fail('yedek indirilemedi: ' + dl);
    const dlA = await A.p.evaluate(async () => (await fetch('api.php?action=sa.obk.download')).status);
    if (dlA !== 401) fail('birim yöneticisi sistem yedeğini indirebildi');
    if (fs.readdirSync(path.join(SITE, 'data/merkez/tmp')).some((f) => /\.(zip|sqlite)$/.test(f))) fail('geçici yedek dosyaları silinmedi');
    const o = await apiCall(ED.p, 'sa.obk.get');
    if (!o.last_ok || !o.last_size) fail('son yedek durumu yazılmadı');
    await ED.p.locator('#obkBox').screenshot({ path: path.join(OUT, 'lg-yedek.png') });
    step(`sunucu dışı yedek: şifre şifreli saklanıyor; “Şimdi gönder” e-posta eki AES-256 ZIP (${o.last_size} bayt): merkez + tüm birimler + hastane; şifresiz açılmıyor, şifreyle SQLite; “İndir” yalnız sistem yöneticisine; geçici dosya kalmıyor`);
  }
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try {
    lgReset();
    if (MULTI) { php(`$r = include '${path.join(SITE, 'inc/mod_yedek.php')}'; obk_put(OBK_DEFAULTS);`); setMail(mailOrig); }
    php(`${MULTI ? 'nm_tenant_use(nm_tenant_default()); ' : ''}q('UPDATE users SET kvkk_ack = NULL, del_req = NULL');`);
  } catch (e) { errors.push('geri alma: ' + e.message); }
  await browser.close();
  smtp.kill();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: tanıtım, yasal, KVKK ve yedek testleri geçti');
