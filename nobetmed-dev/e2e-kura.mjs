// Kura (4.37) — uydurma verilerle. e2e.mjs SONRASI aynı sitede çalışır (ayse@test.com yönetici, elif@test.com üye).
//   node e2e-kura.mjs http://localhost:8240/ <çıktı klasörü> [site klasörü]
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
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-kura.png') }); throw e; } };
/** Kartlar arası en küçük boşluk / kart eni ve kartlar ekranda mı */
const spacing = (p) => p.evaluate(() => {
  const b = [...document.querySelectorAll('#krGrid .kr-card')].map((e) => e.getBoundingClientRect());
  let gap = Infinity;
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const dx = Math.max(0, Math.max(b[i].left, b[j].left) - Math.min(b[i].right, b[j].right));
    const dy = Math.max(0, Math.max(b[i].top, b[j].top) - Math.min(b[i].bottom, b[j].bottom));
    gap = Math.min(gap, Math.max(dx, dy));
  }
  const inView = b.every((r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1);
  return { n: b.length, gap: Math.round(gap), w: Math.round(b[0].width), inView };
});

try {
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const items = ['Örnek Bir', 'Örnek İki', 'Örnek Üç', 'Örnek Dört', 'Örnek Beş', 'Örnek Altı'];

  // ---- 1) Sayfa, başlat: içerik istemciye gelmez ----
  await A.p.goto(BASE + '#/kura');
  await A.p.locator('#krItems').waitFor();
  if (!(await A.p.locator('#sidebar a[href="#/kura"]').count())) fail('menüde Kura yok');
  await A.p.fill('#krTitle', 'Bayram nöbeti kurası');
  await A.p.fill('#krItems', items.join('\n'));
  await A.p.locator('#krCount', { hasText: '6 madde' }).waitFor();
  const raw = await A.p.evaluate(async (items) => JSON.stringify(await api('kura.start', { items, title: 'Gizlilik denemesi' })), items);
  if (items.some((x) => raw.includes(x))) fail('kura başlarken madde içerikleri istemciye geldi');
  await A.p.click('[data-act=kr-start]');
  await A.p.locator('#krStage #krGrid .kr-card').first().waitFor();
  await A.p.waitForTimeout(1000); // karıştırma gösterisi
  const sp = await spacing(A.p);
  if (sp.n !== 6 || !sp.inView || sp.gap < sp.w * 0.35) fail('kartlar ekrana yayılmadı / birbirine yakın: ' + JSON.stringify(sp));
  if (await A.p.evaluate(() => KR.draw.cards.some((c) => c.value))) fail('açılmamış kartın içeriği tarayıcıda');
  step(`başlat: 6 kart üstü kapalı, içerikler tarayıcıya gelmedi; kartlar ekrana yayıldı (kart ${sp.w}px, aralarında en az ${sp.gap}px)`);

  // ---- 2) Karta dokun → altındaki yazı ----
  await A.p.click('#krGrid .kr-card[data-i="2"]');
  await A.p.locator('#krGrid .kr-card[data-i="2"].shown').waitFor();
  const v2 = await A.p.evaluate(() => KR.draw.cards.find((c) => c.idx === 2).value);
  if (!items.includes(v2)) fail('açılan kartta madde yok: ' + v2);
  const txt = await A.p.locator('#krGrid .kr-card[data-i="2"] .kr-front b').textContent();
  if (txt !== v2) fail('kartın altında yazı görünmüyor');
  const did = await A.p.evaluate(() => KR.draw.id);
  step(`kart açıldı: 3. kartın altından “${v2}” çıktı`);

  // ---- 3) Üye: geçmişte görür, kart açamaz, silemez ----
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  const eg = (await apiCall(E.p, 'kura.get', { id: did })).draw;
  const ec = eg.cards.filter((c) => c.open);
  if (ec.length !== 1 || ec[0].value !== v2 || eg.cards.some((c) => !c.open && c.value)) fail('üye geçmişte açılan kartı göremiyor / açılmamışı görüyor');
  if (!/başlatan/.test(await apiErr(E.p, 'kura.reveal', { id: did, idx: 0 }))) fail('üye başkasının kurasında kart açtı');
  if ((await apiErr(E.p, 'kura.delete', { id: did })) === 'kabul') fail('üye başkasının kura kaydını sildi');
  step('üye: kurayı geçmişte görüyor (yalnız açılan kart), başkasının kurasında kart açamıyor ve kaydı silemiyor');

  // ---- 4) Hepsini aç: sonuçlar maddelerin karışık hâli ----
  await A.p.click('[data-act=kr-finish][data-all="1"]');
  await A.p.locator('.modal .kr-res .list-row').nth(5).waitFor();
  const res = await A.p.evaluate(() => KR.draw.cards.map((c) => c.value));
  if (res.slice().sort().join('|') !== items.slice().sort().join('|')) fail('sonuçlar maddelerle aynı değil: ' + res.join(','));
  await A.p.waitForTimeout(800);
  await A.p.screenshot({ path: path.join(OUT, 'k-sonuc.png') });
  const top = await A.p.evaluate(() => { const m = document.querySelector('.modal .kr-res'); const r = m.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 20); return !!(el && el.closest('.modal')); });
  if (!top) fail('sonuç penceresi kura ekranının arkasında kaldı');
  await A.p.locator('.modal [data-close]').last().click();
  await A.p.click('[data-act=kr-stage-close]');
  await A.p.locator('#krStage').waitFor({ state: 'detached' });
  step('hepsini aç: 6 sonuç, maddelerin karıştırılmış hâli (eksik / fazla yok); sonuçlar penceresi, ekran kapandı');

  // ---- 5) Ad sor, sırayla çekenler, kart sınırı ----
  const s2 = (await apiCall(A.p, 'kura.start', { title: 'Sıra', items: ['1', '2', '3', '4', '5'], opts: { people: ['Ayşe K.', 'Burak D.'], limit: 2 } })).draw;
  const r1 = await apiCall(A.p, 'kura.reveal', { id: s2.id, idx: 4 });
  const r2 = await apiCall(A.p, 'kura.reveal', { id: s2.id, idx: 0 });
  const r3 = await apiErr(A.p, 'kura.reveal', { id: s2.id, idx: 1 });
  const w = r2.draw.cards.filter((c) => c.open).sort((a, b) => a.n - b.n).map((c) => c.who);
  if (w.join(',') !== 'Ayşe K.,Burak D.' || r2.draw.status !== 'done' || r3 === 'kabul') fail('sırayla çekenler / kart sınırı: ' + JSON.stringify({ w, st: r2.draw.status, r3 }));
  await A.p.goto(BASE + '#/kura'); await A.p.locator('#krItems').waitFor();
  await A.p.fill('#krItems', 'Kırmızı\nMavi\nYeşil');
  await A.p.evaluate(() => { KR.opts.ask = true; KR.opts.shuffle = false; KR.opts.people = []; });
  await A.p.click('[data-act=kr-start]');
  await A.p.locator('#krGrid .kr-card').first().waitFor();
  await A.p.click('#krGrid .kr-card[data-i="1"]');
  await A.p.locator('.modal [name=v]').fill('Deniz Örnek');
  await A.p.locator('.modal [data-ok]').click();
  await A.p.locator('#krGrid .kr-card[data-i="1"].shown').waitFor();
  if ((await A.p.locator('#krGrid .kr-card[data-i="1"] .kr-front small').textContent()) !== 'Deniz Örnek') fail('açan kişinin adı kartın altına yazılmadı');
  await A.p.click('[data-act=kr-stage-close]');
  step('ayarlar: sırayla çekenler (Ayşe K., Burak D.) açılan kartlara yazıldı; “en çok 2 kart” sonrası kura bitti, 3. kart açılmadı; “kim çekiyor?” adı kartın altına yazıldı');

  // ---- 6) Hepsini birden kipi ----
  // Ekran kapanınca liste sayfası yeniden çizilir; yazı o ana denk gelirse kaybolur — yazılanı doğrula
  await A.p.locator('#krStage').waitFor({ state: 'detached' });
  for (let k = 0; k < 6; k++) { await A.p.fill('#krItems', 'A\nB\nC\nD'); await A.p.waitForTimeout(250); if ((await A.p.evaluate(() => KR.items)) === 'A\nB\nC\nD') break; }
  await A.p.evaluate(() => { KR.opts.ask = false; KR.opts.mode = 'list'; });
  await A.p.click('[data-act=kr-start]');
  try { await A.p.locator('.modal .kr-res .list-row').nth(3).waitFor({ timeout: 20000 }); } catch (e) {
    await A.p.screenshot({ path: path.join(OUT, 'FAIL-kura-liste.png') });
    console.log('KR:', JSON.stringify(await A.p.evaluate(() => ({ items: KR.items, opts: KR.opts, draw: KR.draw && { id: KR.draw.id, st: KR.draw.status, n: KR.draw.cards.length, open: KR.draw.cards.filter((c) => c.open).length, mode: KR.draw.opts.mode }, stage: !!document.querySelector('#krStage'), modals: [...document.querySelectorAll('.modal')].map((m) => m.innerText.slice(0, 120)) }))));
    throw e;
  }
  await A.p.locator('.modal [data-close]').last().click();
  await A.p.click('[data-act=kr-stage-close]');
  await A.p.evaluate(() => { KR.opts.mode = 'cards'; krSaveOpts(); });
  step('“hepsini birden karıştır”: 4 sonuç hemen listelendi');

  // ---- 7) Şablon: yönetici kaydeder, üye görür ve kullanır, üye kaydedemez ----
  await A.p.goto(BASE + '#/kura'); await A.p.locator('#krItems').waitFor();
  await A.p.fill('#krItems', 'Oda 1\nOda 2\nOda 3\nOda 4');
  await A.p.click('[data-act=kr-tpl-save]');
  await A.p.locator('.modal [name=v]').fill('Oda dağıtımı');
  await A.p.locator('.modal [data-ok]').click();
  await expectText(A.p, 'Şablon kaydedildi');
  await E.p.goto(BASE + '#/kura'); await E.p.locator('#krItems').waitFor();
  const et = await E.p.evaluate(() => KR.d.templates.map((t) => t.name));
  if (!et.includes('Oda dağıtımı')) fail('üye şablonu görmüyor');
  if (await E.p.locator('[data-act=kr-tpl-save]').count()) fail('üyede “şablon olarak kaydet” var');
  if ((await apiErr(E.p, 'kura.tpl.save', { name: 'X', items: ['a', 'b'] })) === 'kabul') fail('üye şablon kaydetti');
  await E.p.click('[data-act=kr-tpl-use]');
  if ((await E.p.inputValue('#krItems')).split('\n').length !== 4) fail('şablon kullanılamadı');
  await E.p.click('[data-act=kr-start]');
  await E.p.locator('#krGrid .kr-card').first().waitFor();
  await E.p.waitForTimeout(1000);
  const ms = await spacing(E.p);
  const ow = await E.p.evaluate(() => document.documentElement.scrollWidth);
  if (!ms.inView || ow > 390 || ms.gap < ms.w * 0.3) fail('telefonda kartlar ekrana sığmadı / sıkışık: ' + JSON.stringify({ ...ms, ow }));
  await E.p.screenshot({ path: path.join(OUT, 'k-tel.png') });
  await E.p.click('#krGrid .kr-card[data-i="0"]');
  await E.p.locator('#krGrid .kr-card[data-i="0"].shown').waitFor();
  await E.p.goBack();
  await E.p.locator('#krStage').waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('geri tuşu kura ekranını kapatmadı'));
  step(`şablon: yönetici “Oda dağıtımı”nı kaydetti; üye gördü, kullandı, kendi kurasını telefonda çekti (kart ${ms.w}px, aralarında ${ms.gap}px, taşma yok); üye şablon kaydedemez; geri tuşu ekranı kapattı`);

  // ---- 8) Karıştırma adil mi (1. kart 3 maddeye yaklaşık eşit dağılır) ----
  const cnt = await A.p.evaluate(async () => {
    const c = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 150; i++) { const d = (await api('kura.start', { items: ['x', 'y', 'z'] })).draw; const r = await api('kura.reveal', { id: d.id, idx: 0 }); c[r.value]++; await api('kura.delete', { id: d.id }); }
    return c;
  });
  if (Object.values(cnt).some((v) => v < 25 || v > 80)) fail('karıştırma dengesiz: ' + JSON.stringify(cnt));
  step(`karıştırma: 150 kurada 1. karttan ${cnt.x} / ${cnt.y} / ${cnt.z} (x / y / z) — dengeli`);

  // ---- 9) Silme ----
  if ((await apiErr(A.p, 'kura.delete', { id: did })) !== 'kabul') fail('yönetici kura kaydını silemedi');
  const tid = (await apiCall(A.p, 'kura.list')).templates.find((t) => t.name === 'Oda dağıtımı').id;
  if ((await apiErr(A.p, 'kura.tpl.delete', { id: tid })) !== 'kabul') fail('yönetici şablonu silemedi');
  step('silme: yönetici kura kaydını ve şablonu sildi');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: kura testleri geçti');
