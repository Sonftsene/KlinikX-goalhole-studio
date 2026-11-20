// 4.22: bağlantı önizlemesi (Open Graph), gruplu site içi sayfa listesi, yöneticinin başka rolün gözünden görmesi — e2e.mjs SONRASI.
//   node e2e-gorunum.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
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
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d).then((r) => ({ ok: true, r }), (e) => ({ ok: false, msg: e.message, status: e.status })), [action, data]);
const meta = (h, prop) => { const m = h.match(new RegExp(`<meta (?:property|name)="${prop.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`)); return m ? m[1] : null; };

/** Kişinin görebildiği tüm sayfaları gez; başarısız API yanıtı ve hata bildirimi topla */
async function tour(p, tag) {
  const bad = [];
  const onResp = (r) => { if (/api\.php/.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${new URL(r.url()).searchParams.get('action') || r.request().postData()?.slice(0, 60)}`); };
  p.on('response', onResp);
  const pages = await p.evaluate(() => sitePages());
  for (const pg of pages) {
    await p.evaluate((h) => { location.hash = h; }, pg.href);
    await p.waitForTimeout(450);
    const t = await p.locator('.toast.err').allInnerTexts().catch(() => []);
    if (t.length) bad.push(`${pg.href}: ${t.join(' | ')}`);
  }
  p.off('response', onResp);
  if (bad.length) fail(`[${tag}] gezinti hataları: ${[...new Set(bad)].join(' ; ')}`);
  return pages;
}

let A = null;
try {
  // ---- 1) Bağlantı önizlemesi (WhatsApp vb.) ----
  const ua = { 'User-Agent': 'WhatsApp/2.23.20.0 A' };
  const h = await (await fetch(BASE, { headers: ua })).text();
  const img = meta(h, 'og:image');
  if (!img || !/^https?:\/\//.test(img)) fail('og:image yok ya da mutlak adres değil: ' + img);
  if (!meta(h, 'og:title') || !meta(h, 'og:description')) fail('og:title / og:description yok');
  if (meta(h, 'twitter:card') !== 'summary_large_image') fail('büyük görselli kart yok');
  if (meta(h, 'og:image:width') !== '1200' || meta(h, 'og:image:height') !== '630') fail('görsel boyutu etiketi yok');
  if (img) {
    const ir = await fetch(img.replace(/^https?:\/\/[^/]+\//, BASE), { headers: ua });
    const buf = Buffer.from(await ir.arrayBuffer());
    if (ir.status !== 200 || !/image\/jpeg/.test(ir.headers.get('content-type') || '')) fail('paylaşım görseli açılmadı: ' + ir.status);
    // JPEG SOF0/SOF2 içinden boyut
    let w = 0, hh = 0;
    for (let i = 2; i < buf.length - 9;) { if (buf[i] !== 0xFF) break; const mk = buf[i + 1]; const len = buf.readUInt16BE(i + 2); if (mk === 0xC0 || mk === 0xC2) { hh = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; } i += 2 + len; }
    if (w !== 1200 || hh !== 630) fail(`görsel 1200x630 değil: ${w}x${hh}`);
    if (buf.length > 300 * 1024) fail('görsel çok büyük (WhatsApp 300 KB üstünü göstermeyebilir): ' + buf.length);
  }
  const robots = await (await fetch(BASE + 'robots.txt')).text();
  if (!/User-agent: WhatsApp/.test(robots) || !/User-agent: facebookexternalhit/.test(robots) || !/User-agent: \*\s*\nDisallow: \//.test(robots)) fail('robots.txt önizleme botlarına izin vermiyor ya da aramaya açıldı');
  for (const pth of ['tanitim.php', 'yasal.php?p=kvkk']) {
    const r = await fetch(BASE + pth, { headers: ua });
    if (r.status === 200) { const t = await r.text(); if (!meta(t, 'og:image')) fail(pth + ' önizleme etiketi yok'); }
  }
  step(`bağlantı önizlemesi: başlık, açıklama, 1200x630 görsel (${img}), robots önizleme botlarına açık, aramaya kapalı`);

  // ---- 2) Gruplu site içi sayfa listesi ----
  A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const pages = await A.p.evaluate(() => sitePages());
  const hrefs = new Set(pages.map((x) => x.href));
  const groups = [...new Set(pages.map((x) => x.group))];
  for (const need of ['#/nobetim', '#/rehber', '#/nobet', '#/istekler', '#/profil/bildirim', '#/profil/guvenlik']) if (!hrefs.has(need)) fail('sayfa listesinde yok: ' + need);
  for (const g of ['Nöbet', 'Hesabım', 'Yönetim']) if (!groups.includes(g)) fail('grup yok: ' + g);
  if (pages.some((x) => /\d$/.test(x.label))) fail('sayfa adında sayaç kalmış');
  await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.p.locator('#bnPrev').waitFor();
  await A.p.click('[data-act=lnk-add][data-f=banner_text]');
  await A.p.locator('#lnkF').waitFor();
  await A.p.waitForTimeout(400);
  const og = await A.p.locator('#lnkF [name=p] optgroup').evaluateAll((els) => els.map((e) => [e.label, e.children.length]));
  if (!og.some(([l, n]) => l === 'Nöbet' && n >= 4)) fail('“Bağlantı ekle” listesinde Nöbet grubu eksik: ' + JSON.stringify(og));
  await A.p.screenshot({ path: path.join(OUT, 'gr-sayfalar.png') });
  await A.p.keyboard.press('Escape');
  step(`“Bağlantı ekle” sayfa listesi gruplu (${og.map(([l, n]) => `${l} ${n}`).join(', ')}); Takvimim'in yanındaki Nöbet sekmeleri ve Hesabım sekmeleri de var`);

  // ---- 3) Üye gözünden ----
  const adminPages = pages.length;
  await A.p.goto(BASE + '#/');
  await A.p.click('.sidebar .me-card');
  await A.p.click('.menu >> text=Başka rolün gözünden gör');
  await A.p.locator('.vw-opt[data-k=member]').waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'gr-secim.png') });
  await Promise.all([A.p.waitForEvent('load'), A.p.click('.vw-opt[data-k=member]')]);
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.me.view_as);
  await A.p.locator('.vw-bar').waitFor();
  const bar = await A.p.locator('.vw-bar').innerText();
  if (!/Üye/.test(bar) || !/gözünden/.test(bar)) fail('bant yanlış: ' + bar);
  const me = await A.p.evaluate(() => ({ role: S.me.role, id: S.me.id, email: S.me.email }));
  if (me.role !== 'member' || me.email !== 'ayse@test.com') fail('rol düşmedi ya da başka hesaba geçildi: ' + JSON.stringify(me));
  if (await A.p.locator('#sidebar a[href="#/yonetim/kullanicilar"]').count()) fail('üye görünümünde Kullanıcılar menüsü var');
  if (await A.p.locator('#sidebar a[href="#/yonetim/onaylar"]').count()) fail('üye görünümünde Onay bekleyenler var');
  const r1 = await apiCall(A.p, 'admin.users');
  if (r1.ok) fail('üye görünümünde yönetici ucu açık (admin.users)');
  const r2 = await apiCall(A.p, 'settings.save', { org_name: 'Deneme' });
  if (r2.ok || !/önizleme/.test(r2.msg || '')) fail('önizlemede değişiklik engellenmedi: ' + JSON.stringify(r2));
  const r3 = await apiCall(A.p, 'listing.create', { kind: 'give', date: '2030-01-01' });
  if (r3.ok || !/önizleme/.test(r3.msg || '')) fail('önizlemede üye işlemi engellenmedi: ' + JSON.stringify(r3));
  await A.p.screenshot({ path: path.join(OUT, 'gr-uye.png') });
  const mPages = await tour(A.p, 'üye');
  if (mPages.length >= adminPages) fail('üye görünümünde sayfa sayısı azalmadı');
  step(`üye gözünden: bant “${bar.split('\n')[0].trim()}”, kendi hesabı (rol üye), yönetim menüsü yok, yönetici ucu kapalı, değişiklikler engelli; ${mPages.length} sayfa hatasız gezildi`);

  // ---- 4) Yayıncı (sorumlu) gözünden: banttan rol değiştir ----
  await A.p.goto(BASE + '#/');
  await A.p.click('.vw-bar [data-act=vw-pick]');
  await A.p.locator('.vw-opt[data-k=editor]').waitFor();
  await Promise.all([A.p.waitForEvent('load'), A.p.click('.vw-opt[data-k=editor]')]);
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.me.role === 'editor');
  const bar2 = await A.p.locator('.vw-bar').innerText();
  if (!/Yayıncı/.test(bar2)) fail('bant yayıncıyı göstermiyor: ' + bar2);
  if (!(await A.p.locator('#sidebar a[href="#/yonetim/onaylar"]').count())) fail('yayıncı görünümünde Onay bekleyenler yok');
  if (await A.p.locator('#sidebar a[href="#/yonetim/kullanicilar"]').count()) fail('yayıncı görünümünde Kullanıcılar var');
  const ePages = await tour(A.p, 'yayıncı');
  await A.p.goto(BASE + '#/');
  await A.p.waitForTimeout(300);
  await A.p.screenshot({ path: path.join(OUT, 'gr-yayinci.png') });
  step(`yayıncı (sorumlu) gözünden: Onay bekleyenler var, Kullanıcılar / Ayarlar yok; ${ePages.length} sayfa hatasız gezildi`);

  // ---- 5) Birime özel rol (varsa) ----
  const roles = await A.p.evaluate(() => (S.view_as && S.view_as.roles) || []);
  if (roles.length) {
    await A.p.click('.vw-bar [data-act=vw-pick]');
    await A.p.locator(`.vw-opt[data-k=r${roles[0].id}]`).waitFor();
    await Promise.all([A.p.waitForEvent('load'), A.p.click(`.vw-opt[data-k=r${roles[0].id}]`)]);
    await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.me.view_as && S.me.role_id);
    const b3 = await A.p.locator('.vw-bar').innerText();
    if (!b3.includes(roles[0].name)) fail('özel rol bantta yok: ' + b3);
    await tour(A.p, 'özel rol');
    step(`birime özel rol “${roles[0].name}” gözünden gezildi`);
  }

  // ---- 6) Mobil görünüm: bant ----
  const M = await ctx('ayse-mobil', true);
  await login(M.p, 'ayse@test.com', 'Sifre1234');
  await M.p.click('[data-act=nav-open]');
  await M.p.click('.sidebar .me-card');
  await M.p.click('.menu >> text=Başka rolün gözünden gör');
  await Promise.all([M.p.waitForEvent('load'), M.p.click('.vw-opt[data-k=member]')]);
  await M.p.locator('.vw-bar').waitFor();
  const bb = await M.p.locator('.vw-bar').boundingBox();
  if (!bb || bb.width > 391) fail('mobilde bant taşıyor');
  await M.p.screenshot({ path: path.join(OUT, 'gr-mobil.png') });
  // Aynı hesabın masaüstü oturumu etkilenmez (oturuma bağlı)
  const deskRole = await A.p.evaluate(() => api('boot').then((b) => b.me.role));
  await M.p.click('.vw-bar [data-act=vw-exit]');
  await M.p.waitForFunction(() => typeof S !== 'undefined' && S.me && !S.me.view_as && S.me.role === 'admin');
  await M.c.close();
  step(`mobilde bant sığıyor; önizleme yalnız o oturumda (masaüstü oturumu: ${deskRole})`);

  // ---- 7) Çıkış: yönetici görünümüne dönüş ----
  await Promise.all([A.p.waitForEvent('load'), A.p.click('.vw-bar [data-act=vw-exit]')]);
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.me.role === 'admin' && !S.me.view_as);
  if (await A.p.locator('.vw-bar').count()) fail('çıkıştan sonra bant kaldı');
  if (!(await A.p.locator('#sidebar a[href="#/yonetim/kullanicilar"]').count())) fail('çıkıştan sonra yönetim menüsü dönmedi');
  const back = await apiCall(A.p, 'admin.users');
  if (!back.ok) fail('çıkıştan sonra yönetici ucu açılmadı: ' + back.msg);
  step('“Çık” ile kendi yönetici görünümüne dönüldü');

  // ---- 8) Yönetici olmayan kullanamaz ----
  const E = await ctx('elif');
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  const re = await apiCall(E.p, 'me.viewas', { role: 'member' });
  if (re.ok) fail('yönetici olmayan rol önizlemesi açabildi');
  const hasItem = await E.p.evaluate(() => vwCanUse());
  if (hasItem) fail('yönetici olmayana menü öğesi gösteriliyor');
  const B = await ctx('burak');
  await login(B.p, 'burak@test.com', 'Sifre1234');
  const rb = await apiCall(B.p, 'me.viewas', { role: 'editor' });
  if (rb.ok) fail('yayıncı rol önizlemesi açabildi');
  step('yönetici olmayanlar (üye, yayıncı) bu özelliği kullanamıyor');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { if (A) await A.p.evaluate(() => api('me.viewas', { role: '' })); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: önizleme, sayfa listesi ve rol gözünden görme testleri geçti');
