/**
 * Service worker testi (Playwright + Chromium):
 *   NM_TMP=/tmp/... node sw-test.cjs
 * nobetmed/ klasörünün bir KOPYASINI geçici klasöre alır, `php -S 127.0.0.1:8073` ile sunar.
 * (a) kayıt + ön önbellek, (c) dosya önbelleği + Range, vendor önbelleği,
 * (d) push (CDP ServiceWorker.deliverPushMessage), (e) sürüm güncelleme + tek yenileme,
 * (b) sunucu kapalı + çevrimdışı: kabuk ve dosya önbellekten.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

let playwright;
try { playwright = require('playwright'); } catch (e) {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = playwright;

const PORT = 8073;
const BASE = `http://127.0.0.1:${PORT}/`;
const SRC = path.resolve(__dirname, '../../nobetmed');
const TMP = fs.mkdtempSync(path.join(process.env.NM_TMP || os.tmpdir(), 'nm-sw-'));
const APP = path.join(TMP, 'app');

let fail = 0;
function check(cond, msg) { console.log((cond ? 'OK   ' : 'HATA ') + msg); if (!cond) fail++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Uygulamanın kopyası (veritabanı/yüklemeler hariç); pwa.js sayfaya eklenir (ana geliştiricinin yapacağı bağlama)
fs.cpSync(SRC, APP, {
  recursive: true,
  filter: (p) => !/[\\/](data|uploads)[\\/](?!\.htaccess$|\.gitkeep$)[^\\/]+$/.test(p),
});
const idx = path.join(APP, 'index.php');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace("'admin', 'main']", "'admin', 'main', 'pwa']"));

let server = null;
function startServer() {
  server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', APP], { stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', () => {});
}
async function waitServer(up) {
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(BASE + 'robots.txt').then(() => true, () => false);
    if (ok === up) return;
    await sleep(100);
  }
  throw new Error('sunucu ' + (up ? 'başlamadı' : 'kapanmadı'));
}
function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) { try { process.kill(server.pid, 'SIGTERM'); } catch (e) { /* zaten kapalı */ } }
}

// Küçük geçerli PDF
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'.repeat(4));

(async () => {
  startServer();
  await waitServer(true);
  // Not: headless-shell bildirim iznini her zaman reddeder; tam Chromium (yeni headless) gerekir
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await context.grantPermissions(['notifications'], { origin: BASE.slice(0, -1) });

  // Sahte API yanıtları (gerçek API giriş ister)
  let fileHits = 0;
  let pendingHits = 0;
  let pendingMode = 'two';
  const pendingHeaders = [];
  await context.route(/api\.php\?action=file&id=1(&|$)/, (route) => {
    fileHits++;
    route.fulfill({ status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(PDF.length), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' }, body: PDF });
  });
  await context.route(/api\.php\?action=push\.pending/, (route) => {
    pendingHits++;
    pendingHeaders.push(route.request().headers());
    if (pendingMode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
    const n = pendingMode === 'many' ? 5 : 2;
    const items = Array.from({ length: n }, (_, i) => ({ id: 100 + i, title: 'Duyuru ' + (i + 1), body: 'İçerik ' + (i + 1), url: i ? '#/nobet/3' : '#/p/12', tag: 'post-' + (100 + i) }));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items }) });
  });

  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [sayfa hatası]', e.message));

  // ---------- (a) kayıt + ön önbellek ----------
  await page.goto(BASE);
  const reg = await page.evaluate(async () => {
    const r = await registerSW();
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((res) => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true }));
    const keys = (await (await caches.open('nm-shell-v' + BOOT.v)).keys()).map((k) => k.url.replace(location.origin, ''));
    return { scope: r && r.scope, controlled: !!navigator.serviceWorker.controller, keys, names: await caches.keys() };
  });
  check(reg.scope === BASE, 'SW kapsamı uygulama kökü: ' + reg.scope);
  check(reg.controlled, 'sayfa SW tarafından kontrol ediliyor (clients.claim)');
  const expected = ['/', '/assets/app.css', '/assets/theme.js', '/assets/icon.svg', '/assets/icon-192.png', '/manifest.webmanifest',
    ...['core', 'auth', 'posts', 'viewer', 'rosters', 'admin', 'main', 'pwa'].map((n) => `/assets/js/${n}.js`)];
  const missing = expected.filter((k) => !reg.keys.includes(k));
  check(missing.length === 0, `ön önbellek ${reg.keys.length} öğe (eksik: ${missing.join(', ') || 'yok'}; henüz olmayan shiftparse/extras atlandı)`);
  const swVersion = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r.active && r.active.scriptURL;
  });
  check(/sw\.js(\?v=[\w.-]+)?$/.test(swVersion || ''), 'etkin SW: ' + swVersion);

  // Kontrollü yeniden yükleme: ?v= ile istenen dosyalar SW'den gelir ve sürümlü anahtarla saklanır
  const fromSW = new Set();
  page.on('response', (r) => { if (r.fromServiceWorker()) fromSW.add(new URL(r.url()).pathname); });
  await page.reload();
  await page.waitForFunction(() => typeof api === 'function');
  await page.evaluate(() => registerSW()); // ana uygulamada main.js açılışta çağırır
  check(fromSW.has('/assets/js/core.js') && fromSW.has('/assets/app.css'), 'çevrimiçi yeniden yüklemede varlıklar SW üzerinden geldi');
  const versioned = await page.evaluate(async () => (await (await caches.open('nm-shell-v' + BOOT.v)).keys()).filter((k) => k.url.includes('core.js')).map((k) => k.url.replace(location.origin, '')));
  check(versioned.some((u) => /core\.js\?v=/.test(u)), 'sürümlü anahtar saklandı: ' + versioned.join(', '));

  // ---------- (c) dosya önbelleği ----------
  const f1 = await page.evaluate(async () => {
    const r = await fetch('api.php?action=file&id=1');
    const b = await r.arrayBuffer();
    await new Promise((res) => setTimeout(res, 300));
    const c = await caches.open('nm-files');
    return { status: r.status, size: b.byteLength, cached: !!(await c.match('api.php?action=file&id=1')) };
  });
  check(f1.status === 200 && f1.size === PDF.length, 'dosya isteği 200 PDF');
  check(f1.cached, "dosya 'nm-files' önbelleğine alındı");
  const f2 = await page.evaluate(async () => {
    const r = await fetch('api.php?action=file&id=1');
    return { status: r.status, size: (await r.arrayBuffer()).byteLength };
  });
  check(f2.status === 200 && f2.size === PDF.length && fileHits === 1, `ikinci istek önbellekten (ağ isteği sayısı: ${fileHits})`);
  const rr = await page.evaluate(async () => {
    const r = await fetch('api.php?action=file&id=1', { headers: { Range: 'bytes=0-7' } });
    return { status: r.status, text: await r.text(), cr: r.headers.get('Content-Range') };
  });
  check(rr.status === 206 && rr.text === '%PDF-1.4' && /^bytes 0-7\//.test(rr.cr || ''), `Range isteği önbellekteki dosyadan 206 (${rr.cr})`);
  const vend = await page.evaluate(async () => {
    const r = await fetch('assets/vendor/pdf.min.js');
    await r.arrayBuffer();
    await new Promise((res) => setTimeout(res, 300));
    return !!(await (await caches.open('nm-vendor-1')).match('assets/vendor/pdf.min.js'));
  });
  check(vend, "vendor kitaplığı ilk kullanımda 'nm-vendor-1' önbelleğine alındı");
  const nofile = await page.evaluate(async () => {
    const r = await fetch('api.php?action=file&id=999');
    await new Promise((res) => setTimeout(res, 200));
    return { status: r.status, cached: !!(await (await caches.open('nm-files')).match('api.php?action=file&id=999')) };
  });
  check(nofile.status !== 200 && !nofile.cached, `başarısız dosya yanıtı (${nofile.status}) önbelleğe alınmadı`);

  // ---------- (d) push ----------
  const cdp = await context.newCDPSession(page);
  const regs = {};
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const r of e.registrations) if (!r.isDeleted) regs[r.scopeURL] = r.registrationId; });
  await cdp.send('ServiceWorker.enable');
  for (let i = 0; i < 30 && !regs[BASE]; i++) await sleep(100);
  check(!!regs[BASE], 'CDP kayıt kimliği: ' + regs[BASE]);

  const notifs = () => page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return (await r.getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data && n.data.url, icon: n.icon }));
  });
  const clearNotifs = () => page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    (await r.getNotifications()).forEach((n) => n.close());
  });
  const deliver = async () => {
    const before = pendingHits;
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: BASE.slice(0, -1), registrationId: regs[BASE], data: '' });
    for (let i = 0; i < 50 && pendingHits === before; i++) await sleep(100);
    await sleep(500);
  };

  let usedHook = false;
  await deliver();
  if (pendingHits === 0) {
    // deliverPushMessage bu ortamda çalışmadıysa yerel test kancası
    usedHook = true;
    await page.evaluate(() => navigator.serviceWorker.controller.postMessage({ type: 'TEST_PUSH' }));
    for (let i = 0; i < 50 && pendingHits === 0; i++) await sleep(100);
    await sleep(500);
  }
  console.log('  push tetikleme: ' + (usedHook ? "TEST_PUSH kancası" : 'CDP ServiceWorker.deliverPushMessage'));
  check(pendingHits === 1, 'SW push.pending isteği yaptı');
  check(pendingHeaders[0] && pendingHeaders[0]['x-nm-sw'] === '1' && /nm_sid=/.test(pendingHeaders[0].cookie || ''), 'istek X-NM-SW başlığı ve oturum çereziyle gitti');
  let n = await notifs();
  check(n.length === 2, '2 bildirim gösterildi: ' + n.map((x) => x.title).join(', '));
  check(n.some((x) => x.url === BASE + '#/p/12') && n.some((x) => x.url === BASE + '#/nobet/3'), 'bildirim adresleri kapsama göre çözüldü');
  check(n.every((x) => x.tag.startsWith('post-') && /icon-192\.png$/.test(x.icon)), 'tag ve simge doğru');

  await clearNotifs();
  pendingMode = 'many';
  await deliver();
  n = await notifs();
  check(n.length === 1 && n[0].title === '5 yeni bildirim', 'çok öğede tek özet bildirim: ' + (n[0] && n[0].title));

  await clearNotifs();
  pendingMode = 'fail';
  await deliver();
  n = await notifs();
  check(n.length === 1 && n[0].title === 'dupcii' && n[0].tag === 'nm-generic', 'sunucu hatasında genel bildirim gösterildi');
  await deliver();
  n = await notifs();
  check(n.length === 1, 'boş yanıtta mevcut bildirim sessizce yenilendi (yığılma yok)');
  await clearNotifs();

  // Bildirim tıklaması → sayfaya NAVIGATE mesajı (pwa.js dinleyicisi hash'i değiştirir)
  await page.evaluate(() => { const ch = new MessageEvent('message', { data: { type: 'NAVIGATE', url: location.origin + location.pathname + '#/nobet/3' } }); navigator.serviceWorker.dispatchEvent(ch); });
  check((await page.evaluate(() => location.hash)) === '#/nobet/3', 'NAVIGATE mesajı hash yönlendirmesi yaptı');

  // ---------- (e) güncelleme: yeni sürüm → SKIP_WAITING → tek yenileme, eski önbellek silinir ----------
  // Yeni sürüm: index.php yeni NM_VERSION ile sw.js?v=<yeni> kaydeder
  const oldV = await page.evaluate(() => BOOT.v);
  const newV = oldV + '-yeni';
  let loads = 0;
  page.on('load', () => { loads++; });
  await page.evaluate((v) => navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(v), { scope: './', updateViaCache: 'none' }), newV);
  for (let i = 0; i < 100 && loads === 0; i++) await sleep(100);
  await sleep(1500);
  await page.waitForFunction(() => typeof api === 'function');
  await page.evaluate((v) => { BOOT.v = v; return registerSW(); }, newV);
  const after = await page.evaluate(async () => ({ names: await caches.keys(), v: (await navigator.serviceWorker.getRegistration()).active.scriptURL }));
  check(loads === 1, 'yeni sürümde sayfa bir kez yenilendi (' + loads + ')');
  check(after.names.includes('nm-shell-v' + newV) && !after.names.includes('nm-shell-v' + oldV), 'eski kabuk önbelleği silindi: ' + after.names.join(', '));
  // nm-files: oturum açık değilken uygulama kişisel dosya önbelleğini bilerek temizler (test sayfası girişsiz)
  check(after.names.includes('nm-vendor-1'), 'vendor önbelleği sürüm değişiminde korundu');

  // ---------- (b) çevrimdışı ----------
  stopServer();
  await waitServer(false);
  await context.setOffline(true);
  fromSW.clear();
  const failed = [];
  page.on('requestfailed', (r) => failed.push(new URL(r.url()).pathname + new URL(r.url()).search));
  await page.reload();
  await page.waitForFunction(() => typeof api === 'function', null, { timeout: 10000 });
  const off = await page.evaluate(() => ({
    app: !!document.getElementById('app'),
    css: [...document.styleSheets].some((s) => s.href && s.href.includes('app.css') && s.cssRules.length > 10),
    core: typeof api === 'function' && typeof S === 'object',
    title: document.title,
  }));
  check(off.app && off.title === 'dupcii', 'çevrimdışı: HTML kabuğu önbellekten (#app var)');
  check(off.css, 'çevrimdışı: app.css yüklendi');
  check(off.core, 'çevrimdışı: core.js yüklendi');
  check(fromSW.has('/') && fromSW.has('/assets/js/core.js'), 'çevrimdışı yanıtlar SW kaynaklı');
  const offFile = await page.evaluate(async () => {
    const r = await fetch('api.php?action=file&id=1');
    return { status: r.status, head: (await r.text()).slice(0, 8) };
  });
  check(offFile.status === 200 && offFile.head === '%PDF-1.4', 'çevrimdışı: önbellekteki dosya sunuldu');
  console.log('  çevrimdışı başarısız istekler (beklenen: API çağrıları/fontlar):', [...new Set(failed)].slice(0, 6).join(' '));

  await browser.close();
  console.log(fail ? `\n${fail} HATA` : '\nTüm SW testleri geçti');
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
  stopServer();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* */ }
});
