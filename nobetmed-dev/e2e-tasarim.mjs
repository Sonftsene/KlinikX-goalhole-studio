// Tasarım düzeltmeleri ve kısayol kutu boyutu (4.56.0) — uydurma verilerle.
// e2e.mjs ve e2e-features.mjs SONRASI aynı sitede çalışır:
//   node e2e-tasarim.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
// 1) Yönetici büyük kısayolların kutu boyutunu ve telefonda yan yana sayısını seçer; üyenin ana sayfası buna göre çizilir.
// 2) Aynı liste / ay için yeniden yüklenen listede yeni duyuru açılmaz, var olan güncellenir.
// 3) Telefonda ayar sayfası: “Ayarları kaydet” çubuğu değişiklik olunca çıkar; önizleme yapışkan değil; yatay taşma yok.
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
async function login(email, pw, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${email}] pageerror: ${e.message}`));
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  return p;
}
const call = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y), [a, d]);

let A = null;
const rids = [];
try {
  A = await login('ayse@test.com', 'Sifre1234');

  // ---- 1) Kısayol kutu boyutu: yönetici arayüzden seçer ----
  await A.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.locator('#ulCard [data-act=ul-preset][data-k=sade]').waitFor({ timeout: 10000 });
  await A.click('#ulCard [data-act=ul-preset][data-k=sade]');
  await A.locator('#ulCard [data-act=ul-size]').first().waitFor({ timeout: 5000 });
  await A.click('#ulCard [data-act=ul-size][data-k=xl]');
  await A.click('#ulCard [data-act=ul-cols][data-k="3"]');
  if (!(await A.locator('#ulCard .ul-chips.big.us-xl').count())) fail('önizleme seçilen boyutu göstermiyor');
  await A.locator('#ulCard').screenshot({ path: path.join(OUT, 'tasarim-kutu-boyutu.png') }).catch(() => {});
  await A.click('#ulCard [data-act=ul-save]');
  await A.getByText(/uygulandı|kaydedildi/).first().waitFor({ timeout: 8000 }).catch(() => {});
  const lay = await call(A, 'ui.layout.get');
  if (!lay.base || lay.base.chips_size !== 'xl' || lay.base.chips_cols !== 3) fail('kutu boyutu / sütun kaydedilmedi: ' + JSON.stringify(lay.base && { s: lay.base.chips_size, c: lay.base.chips_cols }));
  // Geçersiz değer sunucuda temizlenir
  const bad = await call(A, 'ui.layout.save', { base: Object.assign({}, lay.base, { chips_size: 'dev', chips_cols: 9 }) });
  if (bad.base.chips_size !== 'm' || bad.base.chips_cols !== 0) fail('geçersiz boyut temizlenmedi: ' + JSON.stringify([bad.base.chips_size, bad.base.chips_cols]));
  await call(A, 'ui.layout.save', { base: lay.base });

  const M = await login('elif@test.com', 'YeniSifre99', true);
  const hc = M.locator('[data-home="chips"]');
  await hc.waitFor({ timeout: 10000 });
  const info = await hc.evaluate((el) => ({ cls: el.className, cols: getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length, h: el.querySelector('.hchip') ? el.querySelector('.hchip').getBoundingClientRect().height : 0, sw: document.documentElement.scrollWidth, w: innerWidth }));
  if (!/\bbig\b/.test(info.cls) || !/hs-xl/.test(info.cls) || !/hs-cols/.test(info.cls)) fail('üyenin ana sayfasında kutu sınıfları yok: ' + info.cls);
  if (info.cols !== 3) fail('telefonda yan yana 3 kutu değil: ' + info.cols);
  if (info.h < 120) fail('“Çok büyük” kutu yüksekliği küçük: ' + info.h);
  if (info.sw > info.w + 1) fail('ana sayfada yatay taşma: ' + info.sw);
  await M.screenshot({ path: path.join(OUT, 'tasarim-kutular-telefon.png') });
  step(`kısayol kutusu: yönetici “Çok büyük” + telefonda 3 yan yana seçti; üyede ${info.cols} sütun, kutu ${Math.round(info.h)} px; geçersiz değer temizlendi`);
  await M.context().close();
  await call(A, 'ui.layout.save', { base: null });

  // ---- 2) Liste yeniden yüklenince duyuru tekrar etmez ----
  const id = (await call(A, 'rosters.save', { name: 'Tasarım deneme listesi' })).id; rids.push(id);
  const now = new Date(); const nm = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const ym = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}`;
  const up = async (t) => {
    const fid = await A.evaluate(async (x) => (await uploadFile(new File([`%PDF-1.4\n% ${x} ${Math.random()}\n`], `${x}.pdf`, { type: 'application/pdf' }))).id, t);
    return call(A, 'rosters.upload', { id, attachment_id: fid, ym, primary: true });
  };
  const r1 = await up('ilk'); const r2 = await up('ikinci');
  if (r1.post_id && r2.post_id && r1.post_id !== r2.post_id) fail(`aynı liste/ay için ikinci duyuru açıldı (${r1.post_id} → ${r2.post_id})`);
  const feed = (await call(A, 'posts.list', { filter: 'all' })).items || [];
  const same = feed.filter((x) => /Tasarım deneme listesi/.test(x.title));
  if (same.length > 1) fail('akışta aynı liste için ' + same.length + ' kart var');
  step(`liste aynı ay için iki kez yüklendi: tek duyuru güncellendi (${same.length} kart)`);

  // ---- 3) Telefonda ayar sayfası ----
  const AM = await login('ayse@test.com', 'Sifre1234', true);
  await AM.goto(BASE + '#/yonetim/ayarlar/genel');
  await AM.locator('form[data-form=settings]').waitFor({ timeout: 10000 });
  await AM.waitForTimeout(500);
  if (await AM.locator('.settings-save').isVisible()) fail('telefonda kaydet çubuğu değişiklik yokken görünüyor');
  const fld = AM.locator('form[data-form=settings] input.input[name][type=text]:visible, form[data-form=settings] input.input[name]:not([type]):visible').first();
  await fld.focus(); await AM.keyboard.type(' ');
  await AM.locator('.settings-save').waitFor({ state: 'visible', timeout: 5000 }).catch(() => fail('değişiklik sonrası kaydet çubuğu çıkmadı'));
  const pv = await AM.evaluate(() => { const e = document.querySelector('.ul-prev'); return e ? getComputedStyle(e).position : 'yok'; });
  if (pv === 'sticky') fail('telefonda önizleme hâlâ yapışkan');
  const sw = await AM.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (sw > 1) fail('ayar sayfasında yatay taşma: ' + sw);
  step('telefonda ayarlar: kaydet çubuğu yalnız değişince çıkıyor, önizleme yapışkan değil, taşma yok');
  await AM.context().close();
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
for (const id of rids) { try { await call(A, 'rosters.delete', { id }); } catch (e) { /* */ } }
try { if (A) await call(A, 'ui.layout.save', { base: null }); } catch (e) { /* */ }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: tasarım testleri geçti');
