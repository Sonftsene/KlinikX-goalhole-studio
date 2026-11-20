// 4.27: sohbet — her mesajda tik (tek gri / çift gri / mavi), açılışta en yeni mesaj, yazma kutusu hep ekranda
// (duyuru bandı varken, duyuru paylaştıktan sonra, telefonda) — e2e.mjs SONRASI (mesajlaşma açık, çok birimli).
//   node e2e-sohbet-duzen.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; nm_tenant_use(nm_tenant_default()); require_once NM_ROOT . '/inc/notify.php'; require_once NM_ROOT . '/inc/mod_hastane.php'; require_once NM_ROOT . '/inc/mod_mesaj.php'; ${code}`], { encoding: 'utf8' });
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const ticks = (p) => p.$$eval('#chMsgs .ch-msg.mine .ch-tk', (els) => els.map((e) => (e.classList.contains('read') ? 'read' : e.classList.contains('dlv') ? 'dlv' : 'sent')));
/** Yazma kutusu ekranda mı, sohbet en altta mı */
const layout = (p) => p.evaluate(() => {
  const c = document.getElementById('chCompose'); const s = document.getElementById('chScroll');
  const vh = window.visualViewport ? window.visualViewport.height : innerHeight;
  const bn = document.getElementById('bottomNav');
  const bnTop = bn && getComputedStyle(bn).display !== 'none' ? bn.getBoundingClientRect().top : vh;
  const r = c.getBoundingClientRect();
  const last = [...document.querySelectorAll('#chMsgs .ch-msg')].pop();
  const lr = last ? last.getBoundingClientRect() : null; const sr = s.getBoundingClientRect();
  return { composeVisible: r.top >= 0 && r.bottom <= Math.min(vh, bnTop) + 1, gap: s.scrollHeight - s.scrollTop - s.clientHeight, lastVisible: !!lr && lr.bottom <= sr.bottom + 2 && lr.top >= sr.top - 2, winY: scrollY };
});

let A = null;
try {
  A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const pE = (await apiCall(A.p, 'chat.people')).people.find((p) => p.name === 'Elif Yılmaz');
  const dm = (await apiCall(A.p, 'chat.direct', { tk: pE.tk, uid: pE.uid })).id;

  // ---- 1) Tikler: Elif uygulamada değilken tek gri ----
  for (let k = 1; k <= 3; k++) await apiCall(A.p, 'chat.send', { id: dm, body: `Tik denemesi ${k}` });
  await A.p.goto(BASE + '#/mesaj/' + dm);
  await A.p.locator('#chMsgs .ch-msg.mine').last().waitFor();
  let t = await ticks(A.p);
  const last3 = t.slice(-3);
  if (last3.length !== 3 || last3.some((x) => x !== 'sent')) fail('karşı taraf çevrimdışıyken son 3 mesaj tek tik değil: ' + last3.join(','));
  // Elif uygulamayı açınca (sohbeti açmadan) çift gri
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  await E.p.goto(BASE + '#/');
  await A.p.waitForFunction(() => { const x = [...document.querySelectorAll('#chMsgs .ch-msg.mine .ch-tk')].slice(-3); return x.length === 3 && x.every((e) => e.classList.contains('dlv')); }, null, { timeout: 25000 })
    .catch(async () => fail('Elif uygulamayı açınca mesajlar çift gri tik olmadı: ' + (await ticks(A.p)).slice(-3).join(',')));
  await A.p.screenshot({ path: path.join(OUT, 'sd-ulasti.png') });
  // Elif sohbeti açınca hepsi mavi (yalnız sonuncusu değil)
  await E.p.goto(BASE + '#/mesaj/' + dm);
  await E.p.locator('#chMsgs .ch-msg').last().waitFor();
  await A.p.waitForFunction(() => { const x = [...document.querySelectorAll('#chMsgs .ch-msg.mine .ch-tk')]; return x.length >= 3 && x.every((e) => e.classList.contains('read')); }, null, { timeout: 15000 })
    .catch(async () => fail('okununca tüm mesajlar mavi olmadı: ' + (await ticks(A.p)).join(',')));
  await A.p.screenshot({ path: path.join(OUT, 'sd-okundu.png') });
  step('her mesajda tik: Elif çevrimdışı → tek gri; uygulamayı açınca (sohbete girmeden) çift gri; sohbeti açınca önceki mesajların hepsi mavi');

  // ---- 2) Açılışta en yeni mesaj (çok mesaj + okunmamış ayıracı) ----
  await E.p.goto(BASE + '#/');
  // Uzun sohbet (gönderim hız sınırına takılmamak için doğrudan yazılır)
  php(`$u = one("SELECT * FROM users WHERE email = 'ayse@test.com'"); for ($k = 1; $k <= 45; $k++) h_q('INSERT INTO c_msgs (chat_id, tkey, user_id, name, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [${dm}, c_tk(), (int)$u['id'], $u['name'], "Uzun sohbet satırı $k — " . str_repeat('nöbet değişimi hakkında bir not. ', 1 + $k % 3), 'text', date('Y-m-d H:i:s', time() - 600 + $k)]); $l = (int)h_val('SELECT MAX(id) FROM c_msgs WHERE chat_id = ?', [${dm}]); h_q('UPDATE c_chats SET last_id = ?, last_at = ? WHERE id = ?', [$l, now(), ${dm}]);`);
  await E.p.goto(BASE + '#/mesaj/' + dm);
  await E.p.locator('#chMsgs .ch-msg').last().waitFor();
  await E.p.waitForTimeout(700);
  let L = await layout(E.p);
  if (L.gap > 4 || !L.lastVisible) fail(`sohbet açılınca en yeni mesaj görünmüyor (alta uzaklık ${L.gap})`);
  if (!L.composeVisible) fail('telefonda yazma kutusu ekranın dışında');
  await E.p.screenshot({ path: path.join(OUT, 'sd-acilis-telefon.png') });
  // Görsel sonradan yüklense de en altta kalır (ekran görüntüsü mesajı)
  const big = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').toString('base64');
  await E.p.evaluate((src) => { const d = document.createElement('div'); d.className = 'ch-msg'; d.innerHTML = `<div class="ch-bub"><img src="${src}" style="width:200px;height:400px;display:block"></div>`; document.getElementById('chMsgs').appendChild(d); }, big);
  await E.p.waitForTimeout(400);
  L = await layout(E.p);
  if (L.gap > 4) fail('içerik büyüyünce en altta kalmadı: ' + L.gap);
  step(`açılışta en yeni mesaj görünüyor (45 okunmamış mesajla), yazma kutusu telefonda ekranda; sonradan uzayan içerikte de en altta`);

  // ---- 3) Duyuru bandı varken ve duyuru paylaştıktan sonra (masaüstü) ----
  await apiCall(A.p, 'settings.save', { banner_on: true, banner_text: 'Sohbet yerleşim denemesi: duyuru bandı açık', banner_tone: 'danger', banner_close: 'none' });
  await A.p.goto(BASE + '#/');
  await A.p.reload();
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await A.p.locator('#bannerSlot .banner').waitFor();
  await A.p.click('[data-act=compose]');
  await A.p.locator('#composer [name=title]').waitFor();
  await A.p.fill('#composer [name=title]', 'Sohbet yerleşimi duyurusu');
  await A.p.fill('#composer [name=body]', 'Duyurudan sonra sohbette yazma kutusu ekranda kalmalı.');
  await A.p.click('.modal button[type=submit][form=composer]');
  await A.p.locator('.modal').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await A.p.waitForTimeout(500);
  await A.p.evaluate(() => window.scrollTo(0, 400));
  await A.p.goto(BASE + '#/mesaj/' + dm);
  await A.p.locator('#chMsgs .ch-msg').last().waitFor();
  await A.p.waitForTimeout(600);
  L = await layout(A.p);
  if (!L.composeVisible) fail('duyuru bandı varken / duyurudan sonra yazma kutusu ekranda değil');
  if (L.gap > 4) fail('masaüstünde açılışta en altta değil: ' + L.gap);
  await A.p.screenshot({ path: path.join(OUT, 'sd-bant-masaustu.png') });
  // Bant kapanınca da sığar
  await apiCall(A.p, 'settings.save', { banner_on: false });
  await A.p.evaluate(() => { S.settings.banner = null; renderBanner(); });
  await A.p.waitForTimeout(400);
  L = await layout(A.p);
  const h = await A.p.evaluate(() => { const v = document.getElementById('chatView'); const vh = innerHeight; return { bottom: v.getBoundingClientRect().bottom, vh }; });
  if (!L.composeVisible || h.vh - h.bottom > 40) fail('bant kalkınca sohbet ekranı yeniden sığmadı');
  // Mesaj gönderince en altta, yazma kutusu yerinde
  await A.p.fill('#chInput', 'Son mesaj');
  await A.p.click('[data-act=ch-send]');
  await A.p.waitForTimeout(800);
  L = await layout(A.p);
  if (!L.composeVisible || L.gap > 4) fail('mesaj gönderince en alt / yazma kutusu bozuldu');
  step('duyuru bandı varken ve duyuru paylaştıktan sonra yazma kutusu ekranda; bant kalkınca ekran yeniden sığdı; gönderince en altta');

  // ---- 4) Telefonda bant varken ----
  await apiCall(A.p, 'settings.save', { banner_on: true, banner_text: 'Telefonda bant denemesi', banner_tone: 'amber', banner_close: 'none' });
  await E.p.goto(BASE + '#/');
  await E.p.reload();
  await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await E.p.goto(BASE + '#/mesaj/' + dm);
  await E.p.locator('#chMsgs .ch-msg').last().waitFor();
  await E.p.waitForTimeout(600);
  L = await layout(E.p);
  if (!L.composeVisible || L.gap > 4) fail('telefonda bant varken yazma kutusu / en alt bozuk');
  await E.p.screenshot({ path: path.join(OUT, 'sd-bant-telefon.png') });
  await apiCall(A.p, 'settings.save', { banner_on: false });
  step('telefonda bant varken de yazma kutusu ekranda ve sohbet en altta');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { if (A) await A.p.evaluate(() => api('settings.save', { banner_on: false })); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: sohbet tik ve yerleşim testleri geçti');
