// Abonelik ve ödeme (4.15; 4.32 kişi bazlı) — sahte PayTR ve iyzico sunucusuyla uçtan uca. Gerçek ödeme yapılmaz.
// Abonelik kişi başınadır (anahtar "birim#u<kullanıcı>"); sistem yöneticisi bir birimin tamamını da tanımlayabilir.
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
  const E = await ctx('elif'); await login(E.p, 'elif@test.com', 'YeniSifre99');
  // Kişi bazlı abonelik: anahtar "birim#u<kullanıcı no>"
  const aKey = `${sa.tk}#u${await A.p.evaluate(() => S.me.id)}`;
  const eKey = `${sa.tk}#u${await E.p.evaluate(() => S.me.id)}`;
  const addMonths = (s, n) => { const x = new Date(s.replace(' ', 'T')); x.setMonth(x.getMonth() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

  // ---- 1) Varsayılan: kapalı, kimse etkilenmez ----
  const b0 = await A.p.evaluate(() => S.billing);
  if (!b0 || b0.visible || b0.enforce || b0.mode !== 'open') fail('varsayılan abonelik durumu kapalı değil: ' + JSON.stringify(b0));
  if (!/açılmadı/.test(await apiErr(A.p, 'billing.page'))) fail('kapalıyken abonelik sayfası açıldı');
  if (await A.p.locator('#sidebar a[href="#/abonelik"]').count()) fail('kapalıyken menüde Abonelik var');
  let d = await apiCall(SA.p, 'sa.billing');
  if (d.plans.length < 3 || !d.plans.some((p) => p.is_free)) fail('örnek paketler oluşmadı');
  const pro0 = d.plans.find((p) => p.code === 'pro');
  if (JSON.stringify(pro0.durations.map((x) => x.months)) !== '[1,3,12]') fail('örnek pakette 1 / 3 / 12 aylık süreler yok: ' + JSON.stringify(pro0.durations));
  if (d.units.some((u) => u.status !== 'none')) fail('birimlere kendiliğinden abonelik tanımlandı');
  if (!(d.plans.find((p) => p.is_free)?.modules || []).includes('istekler')) fail('ücretsiz pakette nöbet istekleri yok');
  step('başlangıç: abonelik kapalı (sayfa görünmez, kimse kısıtlanmaz); örnek paketler kişi başı 1 / 3 / 12 aylık fiyatlı (Temel ücretsiz, Profesyonel, Kurumsal)');

  // ---- 2) Sistem yöneticisi: sağlayıcılar, görünürlük, paket süreleri ----
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
  // Paneldeki paket penceresi: 1 aylık fiyatı değiştir, 6 aylık süre ekle, 3 aylığı kaldır
  await SA.p.locator(`[data-act=bls-plan][data-id="${pro.id}"]`).click();
  const rows = SA.p.locator('#blsDur .bls-dur');
  if ((await rows.count()) !== 3) fail('paket penceresinde 3 süre satırı yok');
  await rows.nth(0).locator('[data-dp]').fill('150,00');
  await rows.nth(1).locator('[data-durx]').click();
  await SA.p.click('.modal [data-dur="6"]');
  await SA.p.locator('#blsDur .bls-dur').last().locator('[data-dp]').fill('800');
  await SA.p.click('.modal button[form=blsPlanF]');
  await SA.p.getByText('Paket kaydedildi').first().waitFor();
  let pd = (await apiCall(SA.p, 'sa.billing')).plans.find((p) => p.id === pro.id).durations;
  if (JSON.stringify(pd.map((x) => [x.months, x.net])) !== JSON.stringify([[1, 15000], [6, 80000], [12, 99000]])) fail('panelden paket süreleri kaydedilmedi: ' + JSON.stringify(pd));
  // 3 aylık süreyi API ile geri ekle (sonraki adımlar için) — istenen ay sayısı (ör. 18) da kabul edilir
  d = await apiCall(SA.p, 'sa.billing.plan', { ...pro, prices: [{ months: 1, price: '150' }, { months: 3, price: '400' }, { months: 12, price: '990' }, { months: 18, price: '1400' }], all_modules: !pro.modules });
  pd = d.plans.find((p) => p.id === pro.id).durations;
  if (pd.map((x) => x.months).join(',') !== '1,3,12,18' || pd[3].label !== '18 aylık') fail('özel süre (18 ay) kaydedilmedi: ' + JSON.stringify(pd));
  if (!/süre/.test(await apiErr(SA.p, 'sa.billing.plan', { ...pro, prices: [], price_m: 0, price_y: 0, is_free: false, all_modules: true }))) fail('fiyatsız ücretli paket kaydedildi');
  await SA.p.screenshot({ path: path.join(OUT, 'o-sa-panel.png'), fullPage: true });
  step('paket penceresi: süre başına fiyat (1 ay fiyatı değişti, 3 ay kaldırıldı, 6 ay eklendi); istenen ay sayısı (18 ay) da tanımlanabiliyor; fiyatsız ücretli paket reddedildi');

  // ---- 3) Kişi: sayfa, süre seçimi, fatura bilgisi (üye de kendi aboneliğini öder) ----
  await A.p.reload(); await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.billing && S.billing.visible);
  await A.p.goto(BASE + '#/abonelik');
  await A.p.locator('.bl-plan').first().waitFor();
  if (!(await A.p.locator('#sidebar a[href="#/abonelik"]').count())) fail('menüde Abonelik yok');
  const segs = await A.p.locator('#blPers [data-act=bl-period]').allTextContents();
  if (segs.join('|') !== 'Aylık|3 aylık|Yıllık|18 aylık') fail('süre seçenekleri yanlış: ' + segs.join('|'));
  await A.p.click('[data-act=bl-period][data-p=m3]');
  const saveTxt = await A.p.locator('.bl-plan', { hasText: pro.name }).locator('.bl-save').textContent().catch(() => '');
  if (!/50,00 ₺ tasarruf/.test(saveTxt)) fail('3 aylıkta aylığa göre tasarruf gösterilmedi: ' + saveTxt);
  if (!/fatura|ad/i.test(await apiErr(A.p, 'billing.checkout', { plan_id: pro.id, period: 'm1', provider: 'paytr' }))) fail('fatura bilgisi olmadan ödeme başladı');
  if (!/süre/i.test(await apiErr(A.p, 'billing.checkout', { plan_id: pro.id, period: 'm7', provider: 'havale', accept: true }))) fail('pakette olmayan süreyle ödeme başladı');
  if ((await A.p.inputValue('[data-form=bl-info] [name=title]')) !== (await A.p.evaluate(() => S.me.name))) fail('fatura adı kişinin adıyla dolmadı');
  await A.p.fill('[data-form=bl-info] [name=title]', 'Ayşe Test');
  await A.p.fill('[data-form=bl-info] [name=tax_no]', '10000000146');
  await A.p.fill('[data-form=bl-info] [name=address]', 'Örnek Mah. Deneme Sk. No:1');
  await A.p.fill('[data-form=bl-info] [name=city]', 'Ankara');
  await A.p.fill('[data-form=bl-info] [name=phone]', '05000000000');
  await A.p.click('[data-form=bl-info] button[type=submit]');
  await A.p.getByText('Fatura bilgileri kaydedildi').first().waitFor();
  const ep = await apiCall(E.p, 'billing.page');
  if (ep.billing.tax_no !== '' || ep.payments.length) fail('üye başka kişinin fatura bilgisini / ödemesini görüyor');
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  if (!(await E.p.locator('#sidebar a[href="#/abonelik"]').count())) fail('üyenin menüsünde Abonelik yok');
  step('kişi: süre seçimi (Aylık / 3 aylık / Yıllık / 18 aylık), 3 aylıkta tasarruf; fatura bilgisi kişinin adıyla dolu gelir; pakette olmayan süre reddedilir; üye de kendi sayfasını açar, başkasının bilgisini görmez');
  await A.p.screenshot({ path: path.join(OUT, 'o-abonelik.png'), fullPage: true });

  // ---- 4) PayTR: çerçeve içinde öde → bildirim → kişinin aboneliği uzar ----
  await A.p.click('[data-act=bl-period][data-p=m1]');
  await A.p.locator(`[data-act=bl-buy][data-id="${pro.id}"]`).click();
  await A.p.locator('.modal input[name=blProv][value=paytr]').check();
  if (!/sözleşme/i.test(await apiErr(A.p, 'billing.checkout', { plan_id: pro.id, period: 'm1', provider: 'paytr' }))) fail('sözleşme onayı olmadan ödeme başladı');
  await A.p.locator('#blTerms').check();
  await A.p.click('#blGo');
  const frame = A.p.frameLocator('.bl-frame iframe');
  await frame.locator('#pay').click({ timeout: 15000 });
  for (let i = 0; i < 60 && !FAKE.lastPaytr; i++) await new Promise((r) => setTimeout(r, 250));
  await A.p.waitForURL(/#\/abonelik/, { timeout: 15000 });
  await A.p.waitForFunction(() => S.billing && S.billing.plan && S.billing.ends, null, { timeout: 15000 });
  if (FAKE.lastPaytr?.reply !== 'OK') fail('PayTR bildirimine “OK” dönmedi: ' + FAKE.lastPaytr?.reply);
  const s1 = subOf(aKey);
  const termsNote = php(`echo m_val("SELECT note FROM bl_payments WHERE provider = 'paytr' AND status = 'paid' ORDER BY id DESC LIMIT 1");`);
  if (!/Sözleşme onaylandı/.test(termsNote)) fail('sözleşme onayı ödeme kaydına yazılmadı: ' + termsNote);
  if (!s1 || s1.status !== 'active' || +s1.plan_id !== pro.id || s1.period !== 'm1') fail('PayTR sonrası abonelik yanlış: ' + JSON.stringify(s1));
  if (subOf(sa.tk)) fail('kişinin ödemesi birimin tamamına yazıldı');
  const eb = subOf(eKey);
  if (eb && eb.status === 'active') fail('Ayşe’nin ödemesi Elif’i de kapsadı');
  const end1 = s1.current_end;
  const again = await fetch(BASE + 'odeme.php?p=paytr', { method: 'POST', body: new URLSearchParams(FAKE.lastPaytr.post) });
  if ((await again.text()) !== 'OK' || subOf(aKey).current_end !== end1) fail('tekrarlanan PayTR bildirimi aboneliği yeniden uzattı');
  const forged = await fetch(BASE + 'odeme.php?p=paytr', { method: 'POST', body: new URLSearchParams({ ...FAKE.lastPaytr.post, hash: 'AAAA' }) });
  if (forged.status !== 400) fail('sahte imzalı PayTR bildirimi kabul edildi');
  step(`PayTR: güvenli çerçevede ödeme → imzalı bildirim → yalnız Ayşe’nin aboneliği Profesyonel aylık etkin (bitiş ${end1.slice(0, 10)}); birim ve Elif etkilenmedi; tekrarlanan bildirim işlenmedi, sahte imza reddedildi`);

  // ---- 5) iyzico: yıllık → kalan sürenin üstüne 12 ay ----
  await A.p.goto(BASE + '#/abonelik'); await A.p.locator('.bl-plan').first().waitFor();
  await A.p.click('[data-act=bl-period][data-p=m12]');
  await A.p.locator(`[data-act=bl-buy][data-id="${pro.id}"]`).click();
  await A.p.locator('.modal input[name=blProv][value=iyzico]').check();
  await A.p.locator('#blTerms').check();
  await A.p.click('#blGo');
  await A.p.waitForURL(/\/iyzico\/pay\//, { timeout: 15000 });
  await A.p.click('#pay');
  await A.p.waitForURL(/#\/abonelik/, { timeout: 15000 });
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const s2 = subOf(aKey);
  if (s2.period !== 'm12' || s2.current_end.slice(0, 10) !== addMonths(end1, 12)) fail('iyzico sonrası süre kalan sürenin üstüne eklenmedi: ' + s2.current_end);
  FAKE.underpay = true;
  const ck = await apiCall(A.p, 'billing.checkout', { plan_id: pro.id, period: 'm1', provider: 'iyzico', accept: true });
  await A.p.goto(ck.url); await A.p.click('#pay'); await A.p.waitForURL(/#\/abonelik/, { timeout: 15000 });
  FAKE.underpay = false;
  const under = JSON.parse(php(`echo json_encode(m_one('SELECT status, note FROM bl_payments WHERE oid = ?', ['${ck.oid}']));`));
  if (under.status !== 'failed' || subOf(aKey).current_end !== s2.current_end) fail('eksik tutarlı ödeme kabul edildi: ' + JSON.stringify(under));
  step(`iyzico: ödeme sayfası → dönüş → imzalı sorguyla doğrulandı; yıllık süre kalan aylığın üstüne eklendi (bitiş ${s2.current_end.slice(0, 10)}); eksik tutar reddedildi`);

  // ---- 6) Havale (3 aylık): bekler → sistem yöneticisi onaylar → uzar, yalnız ödeyen kişiye bildirim ----
  const hv = await apiCall(A.p, 'billing.checkout', { plan_id: pro.id, period: 'm3', provider: 'havale', accept: true });
  if (hv.kind !== 'havale' || !/IBAN/.test(hv.text)) fail('havale bilgisi gösterilmedi');
  if (hv.total !== 48000) fail('3 aylık tutar (400 ₺ + %20 KDV) yanlış: ' + hv.total);
  d = await apiCall(SA.p, 'sa.billing');
  if (d.summary.pending_havale < 1) fail('panelde bekleyen havale yok');
  const hp = d.payments.find((p) => p.oid === hv.oid);
  if (!hp || hp.period_txt !== '3 aylık' || !hp.person) fail('panelde ödeme süresi / kişi bilgisi yok: ' + JSON.stringify(hp));
  d = await apiCall(SA.p, 'sa.billing.pay', { id: hp.id, op: 'paid', ref: 'DEKONT-1' });
  const s3 = subOf(aKey);
  if (s3.current_end.slice(0, 10) !== addMonths(s2.current_end, 3)) fail('havale onayı aboneliği 3 ay uzatmadı: ' + s3.current_end);
  await apiCall(SA.p, 'sa.billing.pay', { id: hp.id, op: 'invoice', invoice_no: 'GIB2026000001' });
  cron();
  const paidN = async (p) => ((await apiCall(p, 'notif.list', { limit: 30 })).items || []).filter((n) => /Ödemeniz alındı/.test(n.title)).length;
  if (!(await paidN(A.p))) fail('ödeyen kişiye “Ödemeniz alındı” bildirimi gelmedi');
  if (await paidN(E.p)) fail('ödeme bildirimi başka kişiye de gitti');
  step('havale (3 aylık 480 ₺): bekleyen ödeme → sistem yöneticisi onayı → 3 ay uzadı, fatura no kaydı; bildirim yalnız ödeyen kişiye');

  // ---- 7) Zorunluluk: kişiye deneme, ücretsiz pakete düşme, salt okunur, ücretsiz tanımlama, birimin tamamı ----
  d = await apiCall(SA.p, 'sa.billing');
  const ap = d.people.find((u) => u.key === aKey);
  if (!ap || ap.name !== (await A.p.evaluate(() => S.me.name)) || ap.mode !== 'active' || ap.period_txt !== '3 aylık') fail('kişi listesinde Ayşe yok ya da yanlış: ' + JSON.stringify(ap));
  if (!d.people.some((u) => u.key === eKey)) fail('ilk girişte Elif kişi listesine eklenmedi');
  await apiCall(SA.p, 'sa.billing.sub', { key: eKey, op: 'reset' });
  d = await apiCall(SA.p, 'sa.billing.cfg', { cfg: { enforce: true, trial_days: 30 }, none_action: 'trial' });
  if (subOf(eKey).status !== 'trial') fail('zorunluluk açılırken kaydı olmayan kişiye deneme başlamadı');
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  if ((await E.p.evaluate(() => S.billing.mode)) !== 'trial') fail('Elif denemede görünmüyor');
  // Elif'e elle Profesyonel: pakette çizelge yok, mesaj tam
  await apiCall(SA.p, 'sa.billing.sub', { key: eKey, op: 'activate', plan_id: pro.id, period: 'm1' });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const ep1 = await E.p.evaluate(() => ({ mode: S.billing.mode, cz: modOn('cizelge'), chat: modOn('mesaj'), ro: S.billing.reply_only }));
  if (ep1.mode !== 'active' || ep1.cz || !ep1.chat || ep1.ro.length) fail('Profesyonel paket modülleri uygulanmadı: ' + JSON.stringify(ep1));
  // Askıya al → ücretsiz pakete (Temel) düşer: istekler açık; mesaj / ilan / çağrı yalnız yanıt
  await apiCall(SA.p, 'sa.billing.sub', { key: eKey, op: 'suspend' });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const nb = await E.p.evaluate(() => ({ mode: S.billing.mode, chat: modOn('mesaj'), req: modOn('istekler'), ilan: modOn('ilan'), cz: modOn('cizelge'), ro: S.billing.reply_only }));
  if (nb.mode !== 'free' || !nb.req || !nb.chat || !nb.ilan || nb.cz || !['mesaj', 'ilan', 'eksik'].every((m) => nb.ro.includes(m))) fail('ücretsiz paket (istekler açık, ortak modüller yalnız yanıt) yanlış: ' + JSON.stringify(nb));
  if ((await apiErr(E.p, 'chat.list')) !== 'kabul') fail('ücretsiz pakette gelen mesajlar okunamıyor');
  if ((await apiErr(E.p, 'listing.list')) !== 'kabul') fail('ücretsiz pakette ilanlar görülemiyor');
  const rqm = await apiErr(E.p, 'req.mine');
  if (/paket|kapalı/.test(rqm)) fail('ücretsiz pakette istekler kapalı: ' + rqm);
  const cc = await apiErr(E.p, 'chat.create', { name: 'Deneme grubu', members: [] });
  if (!cc.startsWith('402') || !/yanıt/.test(cc)) fail('ücretsiz pakette yeni grup açılabildi: ' + cc);
  const lc = await apiErr(E.p, 'listing.create', { date: '2031-01-15', kind: 'give' });
  if (!lc.startsWith('402')) fail('ücretsiz pakette ilan verilebildi: ' + lc);
  await E.p.goto(BASE + '#/abonelik'); await E.p.locator('#blReply').waitFor({ timeout: 8000 }).catch(() => fail('abonelik sayfasında “yanıt verebilirsiniz” notu yok'));
  await E.p.goto(BASE + '#/'); await E.p.locator('#blBar .bl-bar').waitFor({ timeout: 8000 }).catch(() => fail('ücretsiz pakette uyarı şeridi yok'));
  // Yönetici / sorumlu her zaman kapsamda: tüm modüller, şerit yok
  await A.p.reload(); await A.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const ab = await A.p.evaluate(() => ({ mode: S.billing.mode, staff: S.billing.staff, cz: modOn('cizelge'), chat: modOn('mesaj'), bar: !!document.querySelector('#blBar .bl-bar'), ro: S.billing.reply_only }));
  if (ab.mode !== 'comp' || !ab.staff || !ab.cz || !ab.chat || ab.bar || ab.ro.length) fail('birim yöneticisi her zaman kapsamda değil: ' + JSON.stringify(ab));
  await A.p.goto(BASE + '#/abonelik'); await A.p.locator('#blStaff').waitFor({ timeout: 8000 }).catch(() => fail('yöneticinin abonelik sayfasında “ücretsiz” notu yok'));
  // Ücretsiz paket yok → salt okunur
  const temel = d.plans.find((p) => p.is_free);
  await apiCall(SA.p, 'sa.billing.plan', { ...temel, prices: [{ months: 1, price: '10' }], is_free: false, active: false, all_modules: false });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  if (!(await E.p.evaluate(() => S.billing.read_only))) fail('ücretsiz paket yokken kişi salt okunur olmadı');
  const ro = await apiErr(E.p, 'phonebook.save', { name: 'Deneme', number: '1234' });
  if (!ro.startsWith('402')) fail('salt okunur kişide yazma yapılabildi: ' + ro);
  if ((await apiErr(E.p, 'posts.list')) !== 'kabul') fail('salt okunur kişide okuma engellendi');
  if ((await apiErr(E.p, 'billing.page')) !== 'kabul') fail('salt okunur kişide abonelik sayfası açılmadı');
  await E.p.goto(BASE + '#/'); await E.p.locator('#blBar .bl-bar.danger').waitFor({ timeout: 8000 }).catch(() => fail('salt okunur uyarı şeridi yok'));
  await E.p.screenshot({ path: path.join(OUT, 'o-salt-okunur.png') });
  // Ücretsiz tanımla → kısıt yok
  await apiCall(SA.p, 'sa.billing.sub', { key: eKey, op: 'comp', note: 'pilot kişi' });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const nc = await E.p.evaluate(() => ({ mode: S.billing.mode, ro: S.billing.read_only, chat: modOn('mesaj') }));
  if (nc.mode !== 'comp' || nc.ro || !nc.chat) fail('ücretsiz tanımlanan kişi kısıtlı kaldı: ' + JSON.stringify(nc));
  step('zorunluluk açık: kaydı olmayan kişiye deneme; Profesyonel’de çizelge kapalı; askıya alınan kişi Temel’e düştü (istekler açık; mesaj / ilan / çağrı görülür ve yanıtlanır, yeni grup ve ilan 402); yönetici her zaman ücretsiz ve tam yetkili; ücretsiz paket yokken salt okunur (yazma 402, okuma ve ödeme açık); “ücretsiz tanımla” kısıtı kaldırdı');

  // Birimin tamamı (sponsor): Dahiliye'de herkes kapsanır, kimse ödemez; sıfırlanınca kişi başına döner
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const n0b = await N.p.evaluate(() => ({ mode: S.billing.mode, sponsor: S.billing.sponsor }));
  if (n0b.sponsor) fail('tanımsız birimde sponsor görünüyor');
  await apiCall(SA.p, 'sa.billing.sub', { key: nilTk, op: 'activate', plan_id: pro.id, period: 'm12', note: 'kurum ödemesi' });
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const ns = await N.p.evaluate(() => ({ mode: S.billing.mode, sponsor: S.billing.sponsor, bar: !!document.querySelector('#blBar .bl-bar') }));
  if (ns.mode !== 'active' || !ns.sponsor || ns.bar) fail('birimin tamamı tanımı kişiyi kapsamadı: ' + JSON.stringify(ns));
  await N.p.goto(BASE + '#/abonelik'); await N.p.locator('#blSponsor').waitFor({ timeout: 8000 }).catch(() => fail('abonelik sayfasında “biriminiz kapsamda” notu yok'));
  d = await apiCall(SA.p, 'sa.billing');
  const du = d.units.find((u) => u.key === nilTk);
  if (!du || du.mode !== 'active' || du.period_txt !== 'Yıllık') fail('panelde birim tanımı yanlış: ' + JSON.stringify(du));
  if (d.summary.units_comp < 1) fail('özette kapsama alınan birim sayılmadı');
  await apiCall(SA.p, 'sa.billing.sub', { key: nilTk, op: 'reset' });
  await N.p.reload(); await N.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  if (await N.p.evaluate(() => S.billing.sponsor)) fail('birim tanımı sıfırlanınca kişi kendi aboneliğine dönmedi');
  step('birimin tamamı: sistem yöneticisi Dahiliye’yi yıllık tanımladı → birimdeki kişi ödemeden etkin, şerit yok, sayfada “biriminiz kapsamda”; sıfırlanınca kişi başına döndü');

  // Yeni kişiye otomatik deneme (gün sayısı süper yöneticide)
  await apiCall(SA.p, 'sa.billing.cfg', { cfg: { trial_on: true, trial_days: 14 } });
  await apiCall(SA.p, 'sa.billing.sub', { key: eKey, op: 'reset' });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.billing);
  const et = await E.p.evaluate(() => ({ mode: S.billing.mode, d: S.billing.days_left }));
  if (et.mode !== 'trial' || et.d < 13 || et.d > 14) fail('yeni kişiye 14 günlük otomatik deneme başlamadı: ' + JSON.stringify(et));
  step('otomatik deneme: kaydı olmayan kişi ilk girişte 14 günlük (süper yöneticinin seçtiği) denemeye başladı');

  // Panel: kişi listesi ve arama
  await SA.p.goto(BASE); await SA.p.waitForFunction(() => typeof S !== 'undefined' && S.sa);
  await SA.p.locator('[data-act=sys-tab][data-t=abonelik]').click();
  await SA.p.locator('#blsPList .list-row').first().waitFor({ timeout: 10000 });
  await SA.p.fill('#blsQ', 'elif@');
  await SA.p.waitForTimeout(200);
  const pl = await SA.p.locator('#blsPList .list-row').allTextContents();
  if (pl.length !== 1 || !/elif@test\.com/.test(pl[0])) fail('kişi aramasında Elif tek sonuç değil: ' + pl.join(' | '));
  await SA.p.fill('#blsQ', '');
  await SA.p.selectOption('#blsF', 'active');
  await SA.p.waitForTimeout(200);
  if (!/ayse@test\.com/.test((await SA.p.locator('#blsPList').textContent()) || '')) fail('“Etkin” süzgecinde Ayşe yok');
  await SA.p.locator(`#blsPList [data-act=bls-unit][data-k="${aKey}"]`).click();
  const opts = await SA.p.locator('.modal #bpPer option').allTextContents();
  if (!opts.includes('18 ay') || !opts.includes('1 yıl') || !opts.includes('Belirli tarihe kadar')) fail('elle etkinleştirmede süreler eksik: ' + opts.join(','));
  await SA.p.keyboard.press('Escape');
  await SA.p.screenshot({ path: path.join(OUT, 'o-sa-kisiler.png'), fullPage: true });
  step('panel: kişi listesi (ad, e-posta, birim, paket, süre), arama ve durum süzgeci; elle etkinleştirmede paket süreleri (18 ay dahil)');

  // ---- 8) Hatırlatma: bitişe 2 gün kala kişinin kendisine bildirim (bir kez) ----
  const remN = async (p) => (await apiCall(p, 'notif.list', { limit: 60 })).items.filter((n) => /bitiyor/.test(n.title)).length;
  const n0 = await remN(E.p), a0 = await remN(A.p);
  php(`m_q("UPDATE bl_subs SET trial_ends = ?, reminded = '' WHERE tkey = ?", [date('Y-m-d H:i:s', time() + 2 * 86400 - 60), '${eKey}']); m_q("UPDATE bl_subs SET current_end = ?, reminded = '' WHERE tkey = ?", [date('Y-m-d H:i:s', time() + 2 * 86400 - 60), '${aKey}']);`);
  cron(); cron();
  const n2 = (await remN(E.p)) - n0;
  if (n2 !== 1) fail('bitiş hatırlatması ' + n2 + ' kez geldi (beklenen 1)');
  else if ((await remN(A.p)) - a0) fail('kapsamdaki yöneticiye kişisel abonelik hatırlatması gitti');
  else step('hatırlatma: deneme bitimine 2 gün kala yalnız kişinin kendisine bir kez bildirim; kapsamdaki yöneticiye hatırlatma yok');
  php(`m_q("UPDATE bl_subs SET current_end = ? WHERE tkey = ?", [date('Y-m-d H:i:s', time() + 200 * 86400), '${aKey}']);`);

  // ---- 8b) Aboneliği taşı (birim değiştiren kişi): Ayşe'nin ödenmiş süresi Nil'in hesabına ----
  const nilKey = `${nilTk}#u${await N.p.evaluate(() => S.me.id)}`;
  const aEnd = subOf(aKey).current_end;
  const aPays = +php(`echo m_val('SELECT COUNT(*) FROM bl_payments WHERE tkey = ?', ['${aKey}']);`);
  d = await apiCall(SA.p, 'sa.billing');
  if (!d.people.find((u) => u.key === aKey)?.staff) fail('panelde yönetici “yönetici / sorumlu” olarak işaretlenmedi');
  if (d.summary.staff < 1) fail('özette yönetici / sorumlu sayılmadı');
  await apiCall(SA.p, 'sa.billing.sub', { key: aKey, op: 'move', to: nilKey, note: 'birim değişikliği' });
  const mv = subOf(nilKey);
  if (!mv || mv.status !== 'active' || mv.current_end !== aEnd || subOf(aKey).status !== 'none') fail('abonelik taşınmadı: ' + JSON.stringify(mv));
  if (+php(`echo m_val('SELECT COUNT(*) FROM bl_payments WHERE tkey = ?', ['${nilKey}']);`) !== aPays || aPays < 1) fail('ödemeler yeni hesaba geçmedi');
  if (!/etkin aboneliği/.test(await apiErr(SA.p, 'sa.billing.sub', { key: eKey, op: 'move', to: nilKey }))) fail('etkin aboneliği olan hesaba üstüne taşındı');
  cron();
  if (!((await apiCall(N.p, 'notif.list', { limit: 30 })).items || []).some((n) => /taşındı/.test(n.title))) fail('yeni hesaba “aboneliğiniz taşındı” bildirimi gelmedi');
  if (!(await apiCall(N.p, 'billing.page')).payments.length) fail('yeni hesabın ödemeler listesi boş');
  step('aboneliği taşı: Ayşe’nin kalan süresi ve ödemeleri Dahiliye’deki hesaba geçti, eski kayıt sıfırlandı, yeni hesaba bildirim; etkin aboneliği olan hesaba üstüne taşınmaz');

  // ---- 8c) Hesap devre dışı / silindi ----
  const eu = (await apiCall(A.p, 'admin.users')).users.find((u) => u.email === 'elif@test.com');
  await apiCall(A.p, 'admin.user.save', { ...eu, status: 'disabled' });
  if (subOf(eKey).acct !== 'disabled') fail('devre dışı bırakılan hesap abonelik kaydında işaretlenmedi');
  await apiCall(A.p, 'admin.user.save', { ...eu, status: 'active' });
  if (subOf(eKey).acct !== '') fail('yeniden etkin hesap işareti kalkmadı');
  const del = JSON.parse(php(`require_once '${path.join(SITE, 'inc/billing.php')}'; require_once '${path.join(SITE, 'inc/mod_odeme.php')}'; $t = nm_tenant(); $k = $t['tkey'] . '#u99999'; bl_sub_put($k, ['status' => 'active', 'plan_id' => ${pro.id}, 'period' => 'm1', 'current_end' => date('Y-m-d H:i:s', time() + 20 * 86400), 'name' => 'Silinecek Kişi'], 'test', 'deneme', 'test'); bl_acct_mark(99999, 'deleted'); echo json_encode(['old' => m_one('SELECT tkey FROM bl_subs WHERE tkey = ?', [$k]), 'new' => m_one("SELECT tkey, acct, status FROM bl_subs WHERE tkey LIKE ? AND tkey LIKE '%#x%'", [$t['tkey'] . '#%#u99999'])]);`));
  if (del.old || !del.new || del.new.acct !== 'deleted' || del.new.status !== 'active') fail('silinen hesabın kaydı ayrı anahtara alınmadı: ' + JSON.stringify(del));
  d = await apiCall(SA.p, 'sa.billing');
  const gone = d.people.find((u) => u.key === del.new.tkey);
  if (!gone || gone.acct !== 'deleted' || d.summary.gone < 1) fail('panelde silinmiş hesap görünmüyor: ' + JSON.stringify(gone));
  step('hesap devre dışı / yeniden etkin abonelik kaydına işlendi; silinen hesabın ödenmiş kaydı ayrı anahtara alındı (aynı numarayla açılacak hesaba geçmez), panelde “hesap silindi” ve özette sayıldı');

  // ---- 9) Telefon görünümü ----
  await N.p.goto(BASE + '#/abonelik').catch(() => {});
  await N.p.locator('.bl-plan').first().waitFor({ timeout: 8000 }).catch(() => {});
  const w = await N.p.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) fail(`telefonda abonelik sayfası yatay taşıyor ${w}px`);
  await N.p.screenshot({ path: path.join(OUT, 'o-abonelik-tel.png'), fullPage: true });
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  // Diğer testler etkilenmesin: zorunluluk ve görünürlük kapalı, Temel ücretsiz paket geri
  try {
    php(`require_once '${path.join(SITE, 'inc/billing.php')}'; bl_cfg_set(['enforce' => '0', 'visible' => '0', 'trial_on' => '0']); m_q("UPDATE bl_plans SET is_free = 1, active = 1, price_m = 0, price_y = 0, prices = NULL, max_users = 0 WHERE code = 'temel'"); m_q("UPDATE bl_plans SET price_m = 9900, price_y = 99000, prices = ? WHERE code = 'pro'", [json_encode([1 => 9900, 3 => 26900, 12 => 99000])]); m_q("DELETE FROM bl_subs");`);
  } catch (e) { fail('ayarlar geri alınamadı: ' + e.message); }
  restoreCfg();
  await browser.close();
  fake.close();
}
if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('TAMAM: abonelik ve ödeme testleri geçti');
