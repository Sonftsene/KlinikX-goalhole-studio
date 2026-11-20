// 4.27: Kullanıcılar — sıralama, süzgeçler, çevrimiçi durum ve açık bölüm (anlık) — e2e.mjs SONRASI.
//   node e2e-cevrimici.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; if (function_exists('nm_multi') && nm_multi()) nm_tenant_use(nm_tenant_default()); ${code}`], { encoding: 'utf8' });
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
const apiErr = (p, action, data = {}) => p.evaluate(async ([a, d]) => { try { await api(a, d); return 'kabul'; } catch (e) { return `${e.status}:${e.message}`; } }, [action, data]);
const rowOf = (p, name) => p.locator('tr[data-uid]', { hasText: name }).first();

try {
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  await A.p.evaluate(() => { try { localStorage.removeItem('nm-us'); } catch (e) { /* */ } });
  await A.p.goto(BASE + '#/yonetim/kullanicilar');
  await A.p.locator('#usLive').waitFor();
  const elifId = +php("echo one(\"SELECT id FROM users WHERE email = 'elif@test.com'\")['id'];").trim();

  // ---- 1) Kişi bir bölüme girince yönetimde anlık görünür ----
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  await E.p.goto(BASE + '#/nobetim');
  await E.p.waitForTimeout(800);
  await A.p.waitForFunction(() => { const r = [...document.querySelectorAll('tr[data-uid]')].find((t) => /Elif Yılmaz/.test(t.textContent)); return r && /Çevrimiçi/.test(r.textContent) && /Takvimim/.test(r.textContent); }, null, { timeout: 30000 })
    .catch(() => fail('yönetimde Elif “Çevrimiçi · Nöbet › Takvimim” görünmedi'));
  const live = await A.p.locator('#usLive').innerText();
  if (!/Şu an çevrimiçi: [1-9]/.test(live) || !/Elif Yılmaz/.test(live)) fail('“Şu an çevrimiçi” özeti yanlış: ' + live);
  await A.p.screenshot({ path: path.join(OUT, 'us-cevrimici.png'), fullPage: true });
  // Bölüm değişince
  await E.p.evaluate(() => { location.hash = '#/profil/guvenlik'; });
  await A.p.waitForFunction(() => { const r = [...document.querySelectorAll('tr[data-uid]')].find((t) => /Elif Yılmaz/.test(t.textContent)); return r && /Güvenlik/.test(r.textContent); }, null, { timeout: 30000 })
    .catch(() => fail('bölüm değişince yönetimde güncellenmedi'));
  step('kişi Takvimim’e girince yönetimde “Çevrimiçi · Nöbet › Takvimim”, Hesabım › Güvenlik’e geçince o görünüyor (sayfa yenilemeden)');

  // ---- 2) Kayıt numarası ve içerik saklanmaz ----
  await E.p.evaluate(() => { location.hash = '#/p/12345'; });
  await E.p.waitForTimeout(600);
  await apiCall(E.p, 'live', { since: '', pg: '#/mesaj/98765', pgl: 'Mesajlar', vis: 'visible', dev: 'm' });
  const row = JSON.parse(php(`echo json_encode(one('SELECT page, label FROM presence WHERE user_id = ?', [${elifId}]));`));
  if (/\d/.test(row.page) || row.page !== '#/mesaj') fail('kayıt numarası saklandı: ' + row.page);
  // Arka planda
  await apiCall(E.p, 'live', { since: '', pg: '#/mesaj', pgl: 'Mesajlar', vis: 'hidden', dev: 'm' });
  const pm = (await apiCall(A.p, 'presence.list')).map[elifId];
  if (!pm || pm.state !== 'away') fail('arka plandaki kişi “arka planda” görünmedi: ' + JSON.stringify(pm));
  step('saklanan yalnız bölüm (#/mesaj; sohbet / gönderi numarası yok); sekme arkadayken “Arka planda”');

  // ---- 3) Sıralama ve süzgeçler ----
  await A.p.selectOption('[data-change=us-sort]', 'name_desc');
  await A.p.waitForTimeout(300);
  const names = await A.p.locator('tr[data-uid] td:first-child b').allInnerTexts();
  const pending = await A.p.locator('tr[data-uid]:has(.badge.warn)').count();
  const act = names.slice(pending);
  const sorted = [...act].sort((a, b) => b.localeCompare(a, 'tr'));
  if (JSON.stringify(act) !== JSON.stringify(sorted)) fail('Z–A sıralaması yanlış: ' + act.join(', '));
  await A.p.selectOption('[data-change=us-sort]', 'online');
  await A.p.waitForTimeout(300);
  const firstId = +(await A.p.locator('tr[data-uid]').first().getAttribute('data-uid'));
  const pmap = (await apiCall(A.p, 'presence.list')).map;
  const isOn = (id) => pmap[id] && pmap[id].state !== 'off';
  if (Object.keys(pmap).some(isOn) && !isOn(firstId)) fail('“çevrimiçi önce” sıralamasında ilk satır çevrimiçi değil');
  await A.p.selectOption('[data-change=us-act]', 'online');
  await A.p.waitForTimeout(300);
  const onIds = (await A.p.locator('tr[data-uid]').evaluateAll((els) => els.map((e) => +e.dataset.uid)));
  const pmap2 = (await apiCall(A.p, 'presence.list')).map;
  if (!onIds.includes(elifId) || onIds.some((id) => !(pmap2[id] && pmap2[id].state !== 'off'))) fail('“şu an çevrimiçi” süzgeci yanlış: ' + onIds.join(', '));
  await A.p.screenshot({ path: path.join(OUT, 'us-suzgec.png') });
  await A.p.selectOption('[data-change=us-act]', 'never');
  await A.p.waitForTimeout(300);
  const nev = await A.p.locator('tr[data-uid] .us-pres').allInnerTexts();
  if (nev.some((t) => !/Hiç girmedi/.test(t))) fail('“hiç girmeyenler” süzgecinde giriş yapmış kişi var');
  await A.p.selectOption('[data-change=us-act]', 'all');
  await A.p.selectOption('[data-change=us-role]', 'admin');
  await A.p.waitForTimeout(300);
  const adm = await A.p.locator('tr[data-uid] .badge.brand').count();
  if (adm !== await A.p.locator('tr[data-uid]').count()) fail('yetki süzgeci yanlış');
  await A.p.reload();
  await A.p.locator('#usLive').waitFor();
  if ((await A.p.inputValue('[data-change=us-role]')) !== 'admin' || (await A.p.inputValue('[data-change=us-sort]')) !== 'online') fail('sıralama / süzgeç seçimi hatırlanmadı');
  await A.p.selectOption('[data-change=us-role]', '');
  step('sıralama (Z–A, çevrimiçi önce), süzgeçler (şu an çevrimiçi, hiç girmeyenler, yetki) çalışıyor; seçim hatırlanıyor');

  // ---- 4) Ayar kapalıyken bölüm görünmez ----
  await apiCall(A.p, 'presence.cfg', { pages: false });
  await apiCall(E.p, 'live', { since: '', pg: '#/takvim', pgl: 'Nöbet › Takvimim', vis: 'visible', dev: 'm' });
  const m2 = (await apiCall(A.p, 'presence.list')).map[elifId];
  if (!m2 || m2.state !== 'online' || m2.label || m2.page) fail('ayar kapalıyken bölüm göründü: ' + JSON.stringify(m2));
  await apiCall(A.p, 'presence.cfg', { pages: true });
  step('Ayarlar › Güvenlik’ten kapatınca yalnız “çevrimiçi” görünüyor, bölüm görünmüyor');

  // ---- 5) Çıkışta silinir; üye göremez ----
  const B = await ctx('burak');
  await login(B.p, 'burak@test.com', 'Sifre1234');
  const br = await apiErr(B.p, 'presence.list');
  const bRole = php("echo one(\"SELECT role FROM users WHERE email = 'burak@test.com'\")['role'];").trim();
  if (bRole !== 'admin' && !/^403/.test(br)) fail('yönetici olmayan çevrimiçi listesini görebildi: ' + br);
  await E.p.evaluate(() => api('auth.logout'));
  const m3 = (await apiCall(A.p, 'presence.list')).map[elifId];
  if (m3) fail('çıkış yapınca çevrimiçi kaydı silinmedi');
  step('çıkış yapınca çevrimiçi kaydı silindi; yönetici olmayan listeyi göremiyor');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { php("set_setting('presence_pages', '1');"); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: kullanıcılar ve çevrimiçi durum testleri geçti');
