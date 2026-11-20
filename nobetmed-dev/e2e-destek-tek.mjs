// 4.23: destek — tek birimli (MySQL) kurulum: sistem yöneticisi yok; bütün talepler birim yöneticisine gider. e2e.mjs SONRASI.
//   node e2e-destek-tek.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
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
const burak = php(`echo one("SELECT role FROM users WHERE email = 'burak@test.com'")['role'] ?? 'member';`).trim();
const setRole = (role) => php(`q('UPDATE users SET role = ? WHERE email = ?', ['${role}', 'burak@test.com']);`);

try {
  if (php('echo nm_multi() ? 1 : 0;').trim() === '1') { console.log('(çok birimli kurulum: bu test tek birimli içindir)'); }
  else {
    setRole('editor');
    const E = await ctx('elif');
    await login(E.p, 'elif@test.com', 'YeniSifre99');
    const cfg = await apiCall(E.p, 'sp.cfg');
    if (cfg.multi || cfg.topics.some((x) => x.route !== 'unit')) fail('tek birimde konular birime gitmiyor');
    const t1 = await apiCall(E.p, 'sp.create', { topic: 'bildirim', subject: 'Bildirim gelmiyor', body: 'Telefona bildirim düşmüyor, ayarlar açık.' });
    const B = await ctx('burak');
    await login(B.p, 'burak@test.com', 'Sifre1234');
    const t2 = await apiCall(B.p, 'sp.create', { topic: 'liste', subject: 'Liste yükleme', body: 'Excel yüklenince bir kişi eksik.' });
    if (t1.route !== 'unit' || t2.route !== 'unit') fail('tek birimde talepler birime gitmedi');
    const A = await ctx('ayse');
    await login(A.p, 'ayse@test.com', 'Sifre1234');
    const ac = await apiCall(A.p, 'sp.cfg');
    if (!ac.cant || !ac.handler) fail('tek birimde yöneticiye “sistem yöneticisi yok” notu yok');
    if (!/^403/.test(await apiErr(A.p, 'sp.create', { topic: 'hata', subject: 'Deneme', body: 'deneme talebi metni' }))) fail('tek birimde yönetici kendine talep açabildi');
    const inbox = await apiCall(A.p, 'sp.inbox');
    if (!inbox.items.some((x) => x.id === t1.ticket.id) || !inbox.items.some((x) => x.id === t2.ticket.id)) fail('yöneticinin kutusunda talepler yok');
    const bi = await apiCall(B.p, 'sp.inbox');
    if (bi.items.some((x) => x.id === t2.ticket.id)) fail('yayıncı kendi talebini birim kutusunda görüyor');
    await apiCall(A.p, 'sp.reply', { id: t1.ticket.id, body: 'Ayarlarınızı kontrol ettim, şimdi deneyin.', close: true });
    const g = await apiCall(E.p, 'sp.get', { id: t1.ticket.id });
    if (g.ticket.status !== 'closed' || g.can.forward) fail('tek birimde yanıt/kapama ya da iletme düğmesi yanlış');
    await A.p.goto(BASE + '#/destek/birim');
    await A.p.locator('.sp-row').first().waitFor();
    await A.p.screenshot({ path: path.join(OUT, 'sp-tek-yonetici.png') });
    const G = await ctx('misafir');
    await G.p.goto(BASE);
    await G.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf);
    const h = await G.p.evaluate(() => api('help.ask', { name: 'Mert Tan', email: 'mert.tan@ornek.com', body: 'Giriş yapamıyorum, şifre hatalı diyor.' }));
    const pg = await G.p.evaluate((tok) => api('help.get', { token: tok }), h.token);
    if (!pg.msgs.length) fail('giriş yapamayanın talebi okunamadı');
    const in2 = await apiCall(A.p, 'sp.inbox');
    if (!in2.items.some((x) => x.track === 'public')) fail('giriş yapamayanın talebi yöneticiye düşmedi');
    step('tek birimli kurulum: üye ve yayıncı talepleri birim yöneticisine gitti; yönetici kendine talep açamıyor; yanıtla-kapat; giriş yapamayanın talebi yöneticide');
  }
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { if (php('echo nm_multi() ? 1 : 0;').trim() !== '1') setRole(burak); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: tek birimli destek testleri geçti');
