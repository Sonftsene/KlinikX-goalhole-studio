// Abonelik ve ödeme (4.15) — sahte PayTR ve iyzico sunucusuyla uçtan uca. Gerçek ödeme yapılmaz.
// e2e-tenant.mjs ve e2e-hastane.mjs SONRASI aynı sitede çalışır (sistem yöneticisi ve Dahiliye birimi orada açılır).
// Test, sitenin config.php dosyasına sahte sağlayıcı adreslerini yazar ve sonunda kaldırır; ayarları kapalı duruma döndürür.
//   node e2e-odeme.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; ${code}`], { encoding: 'utf8' });
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' });

// ---------------- Sahte ödeme sağlayıcısı ----------------
const PAYTR = { id: '123456', key: 'testkey0123456789', salt: 'testsalt98765' };
const IYZ = { key: 'sandbox-testkey', secret: 'sandbox-testsecret' };
const FAKE = { tokens: new Map(), iyz: new Map(), log: [] };
const b64hmac = (s, k) => crypto.createHmac('sha256', k).update(s).digest('base64');
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });
const fake = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const body = req.method === 'POST' ? await readBody(req) : '';
  FAKE.log.push(req.method + ' ' + u.pathname);
  // PayTR: jeton
  if (u.pathname === '/odeme/api/get-token') {
    const f = Object.fromEntries(new URLSearchParams(body));
    const want = b64hmac(f.merchant_id + f.user_ip + f.merchant_oid + f.email + f.payment_amount + f.user_basket + f.no_installment + f.max_installment + f.currency + f.test_mode + PAYTR.salt, PAYTR.key);
    if (f.merchant_id !== PAYTR.id || want !== f.paytr_token) { res.end(JSON.stringify({ status: 'failed', reason: 'paytr_token hatalı' })); return; }
    const tok = 'T' + crypto.randomBytes(6).toString('hex');
    FAKE.tokens.set(tok, f);
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'success', token: tok })); return;
  }
  // PayTR: ödeme çerçevesi
  let m = u.pathname.match(/^\/odeme\/guvenli\/(T[0-9a-f]+)$/);
  if (m && req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><body><h3>Sahte PayTR</h3><form method="post" action="/odeme/guvenli/${m[1]}/pay"><button id="pay">Öde</button></form></body>`); return;
  }
  m = u.pathname.match(/^\/odeme\/guvenli\/(T[0-9a-f]+)\/pay$/);
  if (m) {
    const f = FAKE.tokens.get(m[1]);
    const post = { merchant_oid: f.merchant_oid, status: 'success', total_amount: f.payment_amount, payment_amount: f.payment_amount, payment_type: 'card', currency: 'TL', test_mode: '1' };
    post.hash = b64hmac(post.merchant_oid + PAYTR.salt + post.status + post.total_amount, PAYTR.key);
    const r = await fetch(BASE + 'odeme.php?p=paytr', { method: 'POST', body: new URLSearchParams(post) });
    FAKE.lastPaytr = { post, reply: await r.text() };
    res.writeHead(302, { Location: f.merchant_ok_url }); res.end(); return;
  }
  // iyzico: imza denetimi
  const iyzAuth = (pathname) => {
    const a = String(req.headers.authorization || '');
    if (!a.startsWith('IYZWSv2 ')) return false;
    const dec = Buffer.from(a.slice(8), 'base64').toString();
    const mm = dec.match(/^apiKey:(.*)&randomKey:(.*)&signature:([0-9a-f]+)$/);
    if (!mm || mm[1] !== IYZ.key) return false;
    return crypto.createHmac('sha256', IYZ.secret).update(mm[2] + pathname + body).digest('hex') === mm[3];
  };
  if (u.pathname === '/payment/iyzipos/checkoutform/initialize/auth/ecom') {
    res.setHeader('Content-Type', 'application/json');
    if (!iyzAuth(u.pathname)) { res.end(JSON.stringify({ status: 'failure', errorMessage: 'imza hatalı' })); return; }
    const j = JSON.parse(body);
    const tok = 'I' + crypto.randomBytes(8).toString('hex');
    FAKE.iyz.set(tok, j);
    res.end(JSON.stringify({ status: 'success', token: tok, paymentPageUrl: `http://127.0.0.1:${FAKE.port}/iyzico/pay/${tok}` })); return;
  }
  m = u.pathname.match(/^\/iyzico\/pay\/(I[0-9a-f]+)$/);
  if (m) {
    const j = FAKE.iyz.get(m[1]);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><body><h3>Sahte iyzico</h3><form method="post" action="${j.callbackUrl}"><input type="hidden" name="token" value="${m[1]}"><button id="pay">Öde</button></form></body>`); return;
  }
  if (u.pathname === '/payment/iyzipos/checkoutform/auth/ecom/detail') {
    res.setHeader('Content-Type', 'application/json');
    if (!iyzAuth(u.pathname)) { res.end(JSON.stringify({ status: 'failure', errorMessage: 'imza hatalı' })); return; }
    const q = JSON.parse(body);
    const j = FAKE.iyz.get(q.token);
    if (!j) { res.end(JSON.stringify({ status: 'failure', errorMessage: 'jeton yok' })); return; }
    const paid = FAKE.underpay ? (Number(j.paidPrice) - 1).toFixed(2) : j.paidPrice;
    res.end(JSON.stringify({ status: 'success', paymentStatus: 'SUCCESS', paymentId: 'P' + q.token.slice(1, 9), basketId: j.basketId, conversationId: j.conversationId, price: j.price, paidPrice: paid, currency: 'TRY', fraudStatus: 1 })); return;
  }
  res.statusCode = 404; res.end('yok');
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
FAKE.port = fake.address().port;
const FAKE_BASE = `http://127.0.0.1:${FAKE.port}`;
// Sitenin yapılandırmasına sahte sağlayıcı adresleri (test sonunda geri alınır)
const CFG = path.join(SITE, 'config.php');
const hadCfg = fs.existsSync(CFG);
const cfgOrig = hadCfg ? fs.readFileSync(CFG, 'utf8') : null;
fs.writeFileSync(CFG, (hadCfg ? cfgOrig : fs.readFileSync(path.join(SITE, 'config.sample.php'), 'utf8')).replace(/\?>\s*$/, '') + `\ndefine('NM_PAY_PAYTR_BASE', '${FAKE_BASE}');\ndefine('NM_PAY_IYZICO_BASE', '${FAKE_BASE}');\n`);
const restoreCfg = () => { if (hadCfg) fs.writeFileSync(CFG, cfgOrig); else fs.rmSync(CFG, { force: true }); };

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
const subOf = (tk) => JSON.parse(php(`echo json_encode(m_one('SELECT * FROM bl_subs WHERE tkey = ?', ['${tk}']));`) || 'null');

try {
  // ---- 0) Temiz başlangıç (önceki çalıştırmadan kalan sağlayıcı ayarları) ve sistem yöneticisi ----
  php(`require_once '${path.join(SITE, 'inc/billing.php')}'; bl_cfg_set(['enforce' => '0', 'visible' => '0', 'trial_on' => '0', 'paytr_on' => '0', 'paytr_id' => '', 'paytr_key' => '', 'paytr_salt' => '', 'iyzico_on' => '0', 'iyzico_key' => '', 'iyzico_secret' => '', 'havale_on' => '0', 'terms' => '']); bl_ensure(); foreach (['bl_billing', 'bl_subs', 'bl_payments', 'bl_outbox', 'bl_events'] as $t) m_q("DELETE FROM $t");`);
  const sa = JSON.parse(php(`$u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); $t = nm_tenant_default(); $u['tk'] = $t['tkey']; echo json_encode($u);`));
  const SA = await ctx('sistem');
  await SA.p.goto(BASE);
  await SA.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
  await apiCall(SA.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
  while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await new Promise((r) => setTimeout(r, 1000));
  await apiCall(SA.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const N = await ctx('nil', true);
  await login(N.p, 'nil@test.com', 'NilSifre1234');
  const nilTk = php(`foreach (nm_tenants() as $t) if ($t['name'] === 'Dahiliye') echo $t['tkey'];`).trim();

  // ---- 1) Varsayılan: kapalı, kimse etkilenmez ----
  const b0 = await A.p.evaluate(() => S.billing);
  if (!b0 || b0.visible || b0.enforce || b0.mode !== 'open') fail('varsayılan abonelik durumu kapalı değil: ' + JSON.stringify(b0));
  if (!/açılmadı/.test(await apiErr(A.p, 'billing.page'))) fail('kapalıyken abonelik sayfası açıldı');
  if (await A.p.locator('#sidebar a[href="#/abonelik"]').count()) fail('kapalıyken menüde Abonelik var');
  let d = await apiCall(SA.p, 'sa.billing');
  if (d.plans.length < 3 || !d.plans.some((p) => p.is_free)) fail('örnek paketler oluşmadı');
  step('başlangıç: abonelik kapalı (sayfa görünmez, kimse kısıtlanmaz); örnek paketler (Temel ücretsiz, Profesyonel, Kurumsal) hazır');

  // ---- 2) Sistem yöneticisi: sağlayıcılar ve görünürlük ----
  if (!/PayTR/.test(await apiErr(SA.p, 'sa.billing.cfg', { cfg: { paytr_on: true } }))) fail('anahtarsız PayTR açılabildi');
  d = await apiCall(SA.p, 'sa.billing.cfg', { cfg: { visible: true, havale_on: true, havale_text: 'Alıcı: Örnek Yazılım · IBAN: TR00 0000 0000 0000 0000 0000 00', paytr_on: true, paytr_test: true, paytr_id: PAYTR.id, paytr_key: PAYTR.key, paytr_salt: PAYTR.salt, iyzico_on: true, iyzico_sandbox: true, iyzico_key: IYZ.key, iyzico_secret: IYZ.secret, kdv: 20, terms: 'MESAFELİ SATIŞ SÖZLEŞMESİ (örnek metin)\nMadde 1 — Taraflar …' } });
  if (d.cfg.paytr_key !== '' || !d.cfg.paytr_key_set || d.cfg.iyzico_secret !== '' || !d.cfg.iyzico_secret_set) fail('gizli anahtarlar panele geri gönderildi');
  const raw = php(`echo m_val("SELECT v FROM m_settings WHERE k = 'bl.paytr_key'");`);
  if (!raw.startsWith('e1:') || raw.includes(PAYTR.key)) fail('PayTR anahtarı şifrelenmeden saklandı');
  const pro = d.plans.find((p) => p.code === 'pro');
  step('sistem yöneticisi: PayTR / iyzico (test) ve havale açıldı; gizli anahtarlar şifreli saklanıyor, panele geri gönderilmiyor');
  await SA.p.goto(BASE); await SA.p.waitForFunction(() => typeof S !== 'undefined' && S.sa);
  await SA.p.locator('[data-act=sys-tab][data-t=abonelik]').click();
  await SA.p.locator('.bl-stats').waitFor({ timeout: 10000 });
  // Paneldeki paket düzenleme penceresi
  await SA.p.locator(`[data-act=bls-plan][data-id="${pro.id}"]`).click();
  await SA.p.locator('#blsPlanF [name=price_m]').fill('1.500,00'.replace('.', ''));
  await SA.p.click('.modal button[form=blsPlanF]');
  await SA.p.getByText('Paket kaydedildi').first().waitFor();
  if ((await apiCall(SA.p, 'sa.billing')).plans.find((p) => p.id === pro.id).price_m !== 150000) fail('panelden paket fiyatı kaydedilmedi');
  await SA.p.screenshot({ path: path.join(OUT, 'o-sa-panel.png'), fullPage: true });

  // ---- 3) Birim yöneticisi: sayfa, fatura bilgisi ----
  await A.p.reload(); await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.billing && S.billing.visible);
  await A.p.goto(BASE + '#/abonelik');
  await A.p.locator('.bl-plan').first().waitFor();
  if (!(await A.p.locator('#sidebar a[href="#/abonelik"]').count())) fail('menüde Abonelik yok');
  if (!/fatura|unvan/i.test(await apiErr(A.p, 'billing.checkout', { plan_id: pro.id, period: 'month', provider: 'paytr' }))) fail('fatura bilgisi olmadan ödeme başladı');
  await A.p.fill('[data-form=bl-info] [name=title]', 'Örnek Hastane Yoğun Bakım');
  await A.p.fill('[data-form=bl-info] [name=tax_no]', '1234567890');
  await A.p.fill('[data-form=bl-info] [name=tax_office]', 'Merkez');
  await A.p.fill('[data-form=bl-info] [name=address]', 'Örnek Mah. Deneme Sk. No:1');
  await A.p.fill('[data-form=bl-info] [name=city]', 'Ankara');
  await A.p.fill('[data-form=bl-info] [name=phone]', '05000000000');
  await A.p.click('[data-form=bl-info] button[type=submit]');
  await A.p.getByText('Fatura bilgileri kaydedildi').first().waitFor();
  const E = await ctx('elif'); await login(E.p, 'elif@test.com', 'YeniSifre99');
  if (!/yönetici/.test(await apiErr(E.p, 'billing.page'))) fail('üye abonelik sayfasını açabildi');
  step('birim yöneticisi: paketler ve fatura bilgileri; fatura bilgisi olmadan ödeme başlamaz; üye ödeme sayfasını açamaz');
  await A.p.goto(BASE + '#/abonelik'); await A.p.locator('.bl-plan').first().waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'o-abonelik.png'), fullPage: true });

  // ---- 4) PayTR: çerçeve içinde öde → bildirim → abonelik uzar ----
  await A.p.locator(`[data-act=bl-buy][data-id="${pro.id}"]`).click();
  await A.p.locator('.modal input[name=blProv][value=paytr]').check();
  if (!/sözleşme/i.test(await apiErr(A.p, 'billing.checkout', { plan_id: pro.id, period: 'month', provider: 'paytr' }))) fail('sözleşme onayı olmadan ödeme başladı');
  await A.p.locator('#blTerms').check();
  await A.p.click('#blGo');
  const frame = A.p.frameLocator('.bl-frame iframe');
  await frame.locator('#pay').click({ timeout: 15000 });
  for (let i = 0; i < 60 && !FAKE.lastPaytr; i++) await new Promise((r) => setTimeout(r, 250));
  await A.p.waitForURL(/#\/abonelik/, { timeout: 15000 });
  await A.p.waitForFunction(() => S.billing && S.billing.plan && S.billing.ends, null, { timeout: 15000 });
  if (FAKE.lastPaytr?.reply !== 'OK') fail('PayTR bildirimine “OK” dönmedi: ' + FAKE.lastPaytr?.reply);
  let s1 = subOf(sa.tk);
  const termsNote = php(`echo m_val("SELECT note FROM bl_payments WHERE provider = 'paytr' AND status = 'paid' ORDER BY id DESC LIMIT 1");`);
  if (!/Sözleşme onaylandı/.test(termsNote)) fail('sözleşme onayı ödeme kaydına yazılmadı: ' + termsNote);
  if (s1.status !== 'active' || +s1.plan_id !== pro.id || s1.period !== 'month') fail('PayTR sonrası abonelik yanlış: ' + JSON.stringify(s1));
  const end1 = s1.current_end;
  // Aynı bildirim tekrar gelir: ikinci kez uzatmaz; sahte imza reddedilir
  const again = await fetch(BASE + 'odeme.php?p=paytr', { method: 'POST', body: new URLSearchParams(FAKE.lastPaytr.post) });
  if ((await again.text()) !== 'OK' || subOf(sa.tk).current_end !== end1) fail('tekrarlanan PayTR bildirimi aboneliği yeniden uzattı');
  const forged = await fetch(BASE + 'odeme.php?p=paytr', { method: 'POST', body: new URLSearchParams({ ...FAKE.lastPaytr.post, hash: 'AAAA' }) });
  if (forged.status !== 400) fail('sahte imzalı PayTR bildirimi kabul edildi');
  step(`PayTR: güvenli çerçevede ödeme → imzalı bildirim → Profesyonel aylık etkin (bitiş ${end1.slice(0, 10)}); tekrarlanan bildirim ikinci kez işlenmedi, sahte imza reddedildi`);

  // ---- 5) iyzico: ödeme sayfasına git → dönüş → sorgula → uzar ----
  await A.p.goto(BASE + '#/abonelik'); await A.p.locator('.bl-plan').first().waitFor();
  await A.p.click('[data-act=bl-period][data-p=year]');
  await A.p.locator(`[data-act=bl-buy][data-id="${pro.id}"]`).click();
  await A.p.locator('.modal input[name=blProv][value=iyzico]').check();
  await A.p.locator('#blTerms').check();
  await A.p.click('#blGo');
  await A.p.waitForURL(/\/iyzico\/pay\//, { timeout: 15000 });
  await A.p.click('#pay');
  await A.p.waitForURL(/#\/abonelik/, { timeout: 15000 });
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const s2 = subOf(sa.tk);
  const exp2 = new Date(end1.replace(' ', 'T')); exp2.setFullYear(exp2.getFullYear() + 1);
  if (s2.period !== 'year' || s2.current_end.slice(0, 10) !== `${exp2.getFullYear()}-${String(exp2.getMonth() + 1).padStart(2, '0')}-${String(exp2.getDate()).padStart(2, '0')}`) fail('iyzico sonrası süre kalan sürenin üstüne eklenmedi: ' + s2.current_end);
  // Eksik tutar: ödendi sayılmaz
  FAKE.underpay = true;
  const ck = await apiCall(A.p, 'billing.checkout', { plan_id: pro.id, period: 'month', provider: 'iyzico', accept: true });
  await A.p.goto(ck.url); await A.p.click('#pay'); await A.p.waitForURL(/#\/abonelik/, { timeout: 15000 });
  FAKE.underpay = false;
  const under = JSON.parse(php(`echo json_encode(m_one('SELECT status, note FROM bl_payments WHERE oid = ?', ['${ck.oid}']));`));
  if (under.status !== 'failed' || subOf(sa.tk).current_end !== s2.current_end) fail('eksik tutarlı ödeme kabul edildi: ' + JSON.stringify(under));
  step(`iyzico: ödeme sayfası → dönüş → sonuç iyzico’dan imzalı sorguyla doğrulandı; yıllık süre kalan aylığın üstüne eklendi (bitiş ${s2.current_end.slice(0, 10)}); eksik tutar reddedildi`);

  // ---- 6) Havale: bekler → sistem yöneticisi onaylar → uzar, birim yöneticisine bildirim ----
  const hv = await apiCall(A.p, 'billing.checkout', { plan_id: pro.id, period: 'month', provider: 'havale', accept: true });
  if (hv.kind !== 'havale' || !/IBAN/.test(hv.text)) fail('havale bilgisi gösterilmedi');
  d = await apiCall(SA.p, 'sa.billing');
  if (d.summary.pending_havale < 1) fail('panelde bekleyen havale yok');
  const hp = d.payments.find((p) => p.oid === hv.oid);
  d = await apiCall(SA.p, 'sa.billing.pay', { id: hp.id, op: 'paid', ref: 'DEKONT-1' });
  const s3 = subOf(sa.tk);
  if (s3.current_end <= s2.current_end) fail('havale onayı aboneliği uzatmadı');
  await apiCall(SA.p, 'sa.billing.pay', { id: hp.id, op: 'invoice', invoice_no: 'GIB2026000001' });
  cron();
  const notes = await apiCall(A.p, 'notif.list', { limit: 30 });
  if (!(notes.items || []).some((n) => /Ödemeniz alındı/.test(n.title))) fail('birim yöneticisine “Ödemeniz alındı” bildirimi gelmedi');
  step('havale: kod ile bekleyen ödeme → sistem yöneticisi “ödeme alındı” → abonelik uzadı, fatura no kaydı, birim yöneticisine bildirim (kuyruk → birimin görevi)');

  // ---- 7) Zorunluluk: deneme, ücretsiz pakete düşme, kişi sınırı, salt okunur, ücretsiz tanımlama ----
  await apiCall(SA.p, 'sa.billing.sub', { key: nilTk, op: 'reset' });
  d = await apiCall(SA.p, 'sa.billing.cfg', { cfg: { enforce: true, trial_days: 30 }, none_action: 'trial' });
  if (subOf(nilTk).status !== 'trial') fail('zorunluluk açılırken kaydı olmayan birime deneme başlamadı');
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  if ((await N.p.evaluate(() => S.billing.mode)) !== 'trial') fail('Dahiliye denemede görünmüyor');
  // Askıya al → ücretsiz pakete (Temel) düşer: mesajlaşma kapalı
  await apiCall(SA.p, 'sa.billing.sub', { key: nilTk, op: 'suspend' });
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const nb = await N.p.evaluate(() => ({ mode: S.billing.mode, chat: modOn('mesaj') }));
  if (nb.mode !== 'free' || nb.chat) fail('süresi dolan birim ücretsiz pakete düşmedi: ' + JSON.stringify(nb));
  if (!/kapalı/.test(await apiErr(N.p, 'chat.list'))) fail('ücretsiz pakette mesajlaşma ucu açık');
  await N.p.locator('#blBar .bl-bar').waitFor({ timeout: 8000 }).catch(() => fail('ücretsiz pakette uyarı şeridi yok'));
  // Kişi sınırı
  const temel = d.plans.find((p) => p.is_free);
  await apiCall(SA.p, 'sa.billing.plan', { ...temel, price_m: 0, price_y: 0, max_users: 1, is_free: true, active: true, all_modules: false });
  const lim = await apiErr(N.p, 'admin.user.save', { name: 'Deneme Kişi', email: 'deneme.kisi@test.com', role: 'member', status: 'active' });
  if (!/kişi sınırı/.test(lim) || !lim.startsWith('402')) fail('kişi sınırı uygulanmadı: ' + lim);
  // Ücretsiz paket yok → salt okunur
  await apiCall(SA.p, 'sa.billing.plan', { ...temel, name: temel.name, price_m: '10', price_y: '100', max_users: 15, is_free: false, active: false, all_modules: false });
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  if (!(await N.p.evaluate(() => S.billing.read_only))) fail('ücretsiz paket yokken birim salt okunur olmadı');
  const ro = await apiErr(N.p, 'phonebook.save', { name: 'Deneme', number: '1234' });
  if (!ro.startsWith('402')) fail('salt okunur birimde yazma yapılabildi: ' + ro);
  if ((await apiErr(N.p, 'posts.list')) !== 'kabul') fail('salt okunur birimde okuma engellendi');
  if ((await apiErr(N.p, 'billing.page')) !== 'kabul') fail('salt okunur birimde abonelik sayfası açılmadı');
  await N.p.goto(BASE + '#/'); await N.p.locator('#blBar .bl-bar.danger').waitFor({ timeout: 8000 }).catch(() => fail('salt okunur uyarı şeridi yok'));
  await N.p.screenshot({ path: path.join(OUT, 'o-salt-okunur.png') });
  // Ücretsiz tanımla → kısıt yok
  await apiCall(SA.p, 'sa.billing.sub', { key: nilTk, op: 'comp', note: 'pilot birim' });
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const nc = await N.p.evaluate(() => ({ mode: S.billing.mode, ro: S.billing.read_only, chat: modOn('mesaj') }));
  if (nc.mode !== 'comp' || nc.ro || !nc.chat) fail('ücretsiz tanımlanan birim kısıtlı kaldı: ' + JSON.stringify(nc));
  // Ödenmiş birim (Ayşe) zorunlulukta etkin, Profesyonel modülleri: çizelge kapalı
  await A.p.reload(); await A.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const ab = await A.p.evaluate(() => ({ mode: S.billing.mode, plan: S.billing.plan && S.billing.plan.name, plan2: modOn('cizelge'), chat: modOn('mesaj') }));
  if (ab.mode !== 'active' || ab.plan2 || !ab.chat) fail('Profesyonel paket modülleri uygulanmadı: ' + JSON.stringify(ab));
  step('zorunluluk açık: kaydı olmayan birime deneme; askıya alınan birim ücretsiz pakete düştü (mesajlaşma kapalı, uyarı şeridi), kişi sınırı uygulandı; ücretsiz paket yokken salt okunur (yazma 402, okuma ve ödeme açık); “ücretsiz tanımla” kısıtı kaldırdı; Profesyonel pakette çizelge kapalı');

  // ---- 8) Hatırlatma: bitişe 2 gün kala birim yöneticisine bildirim (bir kez) ----
  const remN = async () => (await apiCall(A.p, 'notif.list', { limit: 60 })).items.filter((n) => /Aboneliğiniz bitiyor/.test(n.title)).length;
  const n0 = await remN();
  php(`m_q("UPDATE bl_subs SET current_end = ?, reminded = '' WHERE tkey = ?", [date('Y-m-d H:i:s', time() + 2 * 86400 - 60), '${sa.tk}']);`);
  cron(); cron();
  const n2 = (await remN()) - n0;
  if (n2 !== 1) fail('bitiş hatırlatması ' + n2 + ' kez geldi (beklenen 1)');
  else step('hatırlatma: abonelik bitimine 2 gün kala birim yöneticisine bir kez bildirim');

  // ---- 9) Telefon görünümü ----
  await N.p.goto(BASE + '#/abonelik').catch(() => {});
  const w = await N.p.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) fail(`telefonda abonelik sayfası yatay taşıyor ${w}px`);
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  // Diğer testler etkilenmesin: zorunluluk ve görünürlük kapalı, Temel ücretsiz paket geri
  try {
    php(`require_once '${path.join(SITE, 'inc/billing.php')}'; bl_cfg_set(['enforce' => '0', 'visible' => '0', 'trial_on' => '0']); m_q("UPDATE bl_plans SET is_free = 1, active = 1, price_m = 0, price_y = 0, max_users = 15 WHERE code = 'temel'");`);
  } catch (e) { fail('ayarlar geri alınamadı: ' + e.message); }
  restoreCfg();
  await browser.close();
  fake.close();
}
if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('TAMAM: abonelik ve ödeme testleri geçti');
