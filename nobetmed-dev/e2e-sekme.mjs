// Sekmeler kimsede gizli kalmasın (4.31.2): dar telefonda ve büyük yazıda tüm sekmeler ekranın içinde; yan menüde İstekler, İlanlar, Ekstra nöbet
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır:
//   node e2e-sekme.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };

async function check(tag, email, pws, big) {
  const c = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript((b) => { try { localStorage.setItem('nm-tour', 'done'); if (b) localStorage.setItem('nm-fs', 'lg'); } catch (e) { /* */ } }, big);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  let ok = false;
  for (const pw of pws) {
    await p.goto(BASE);
    await p.fill('[data-form=login] [name=email]', email);
    await p.fill('[data-form=login] [name=password]', pw);
    await p.click('[data-form=login] button[type=submit]');
    ok = await p.waitForFunction(() => typeof S !== 'undefined' && S.me, null, { timeout: 6000 }).then(() => true, () => false);
    if (ok) break;
  }
  if (!ok) { fail(`[${tag}] giriş yapılamadı`); await c.close(); return; }
  const e0 = errors.length;
  // Nöbet sekmeleri: hepsi ekranın içinde
  await p.goto(BASE + '#/nobetim');
  await p.locator('.hub-tabs a').first().waitFor();
  await p.waitForTimeout(400);
  const tabs = await p.locator('.hub-tabs a').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), l: Math.round(r.left), r: Math.round(r.right) }; }));
  const out = tabs.filter((t) => t.l < 0 || t.r > 360);
  if (out.length) fail(`[${tag}] ekran dışında kalan sekmeler: ${out.map((t) => t.t).join(', ')}`);
  const names = tabs.map((t) => t.t);
  for (const want of ['Takvimim', 'Kim nöbette', 'İstekler', 'İlanlar', 'Excel liste']) if (!names.some((n) => n.includes(want))) fail(`[${tag}] “${want}” sekmesi yok: ${names.join(' | ')}`);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  if (w > 360) fail(`[${tag}] yatay taşma ${w}px`);
  await p.screenshot({ path: path.join(OUT, `sekme-${tag}.png`) });
  // Yan menü (☰): Nöbet bölümünde İstekler / İlanlar / Ekstra nöbet
  const side = await p.evaluate(() => [...document.querySelectorAll('#sidebar a')].map((a) => a.getAttribute('href')));
  for (const h of ['#/istekler', '#/ilanlar', '#/ekstra']) if (!side.includes(h)) fail(`[${tag}] yan menüde ${h} yok`);
  // Diğer sekme şeritleri: Hesabım
  await p.goto(BASE + '#/profil');
  await p.locator('.prof-tabs').first().waitFor({ timeout: 8000 }).catch(() => {});
  const pt = await p.locator('.prof-tabs > *').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > 360); }).map((e) => e.textContent.trim()));
  if (pt.length) fail(`[${tag}] Hesabım sekmelerinden ekran dışında kalan: ${pt.join(', ')}`);
  if (errors.length === e0) step(`[${tag}] 360 px${big ? ' + büyük yazı' : ''}: ${tabs.length} Nöbet sekmesinin hepsi ekranda (${names.join(', ')}); yan menüde İstekler, İlanlar, Ekstra nöbet; Hesabım sekmeleri ekranda`);
  await c.close();
}

try {
  await check('uye', 'elif@test.com', ['YeniSifre99', 'Sifre1234', 'Elif1234'], false);
  await check('uye-buyuk', 'elif@test.com', ['YeniSifre99', 'Sifre1234', 'Elif1234'], true);
  await check('yonetici-buyuk', 'ayse@test.com', ['Sifre1234'], true);
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: sekme görünürlüğü testleri geçti');
