// Hastane yemek listesi (4.12) — uydurma menüyle.
// Tek birimli sitede (e2e-tenant.mjs ÖNCESİ: liste birimin veritabanında) ya da çok birimli sitede
// (e2e-hastane.mjs SONRASI: liste hastanenin ortak veritabanında, Dahiliye birimi de aynı listeyi görür) çalışır:
//   node e2e-yemek.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  return { c, p };
}
async function login(p, email, pw, timeout = 30000) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me, null, { timeout });
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-yemek.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 1200)); throw e; } };
const pad = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const addD = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymdOf(d); };
const TR_D = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// ---- Uydurma menü: dünden 3 gün sonrasına; uzun kalemler satır kırar, bir gün çok uzun (sayfa bölünür) ----
const MENU = {};
const pool = {
  kahvalti: ['Çay', 'Beyaz peynir', 'Zeytin', 'Domates-salatalık', 'Haşlanmış yumurta', 'Bal-tereyağı', 'Simit'],
  ogle: ['Ezogelin çorbası', 'Fırında sebzeli tavuk baget ve közlenmiş biber', 'Bulgur pilavı', 'Cacık', 'Mevsim meyvesi'],
  aksam: ['Yayla çorbası', 'Etli kuru fasulye', 'Pirinç pilavı', 'Karışık turşu', 'Sütlaç'],
};
for (let i = -1; i <= 3; i++) {
  const d = addD(i);
  MENU[d] = { kahvalti: pool.kahvalti.slice(0, 4 + (i + 1) % 3), ogle: pool.ogle.slice(0, 3 + (i + 1) % 2), aksam: pool.aksam.slice(0, 3 + (i + 2) % 3) };
}
const long = addD(1);
MENU[long].ogle = ['Mercimek çorbası', 'Izgara köfte', 'Patates püresi', 'Şehriyeli pirinç pilavı', 'Çoban salata', 'Ayran', 'Revani', 'Mandalina', 'Kuru cacık', 'Turşu', 'Fırın makarna', 'Elma', 'Kemalpaşa tatlısı', 'Yeşil salata', 'Su'];
const DATES = Object.keys(MENU).sort();

/** Tablo PDF'i (Chromium yazdırır): tarih hücresi dikeyde ortalı, başlık her sayfada tekrar eder */
async function makePdf() {
  const p = await (await browser.newContext()).newPage();
  const cell = (a) => a.map((x) => `<div>${x}</div>`).join('');
  const rows = DATES.map((d) => `<tr><td class="dt">${dmy(d)}<br>${TR_D[new Date(d + 'T12:00').getDay()]}</td><td>${cell(MENU[d].kahvalti)}</td><td>${cell(MENU[d].ogle)}</td><td>${cell(MENU[d].aksam)}</td></tr>`).join('');
  await p.setContent(`<html><head><style>body{font:13px Arial;margin:0} h1{font-size:16px;text-align:center} table{border-collapse:collapse;width:100%} td,th{border:1px solid #000;padding:6px 8px;vertical-align:top;text-align:left} td div{margin:0 0 9px} td.dt{vertical-align:middle;width:90px;text-align:center} th{text-align:center} td:nth-child(3){width:150px}</style></head>
    <body><h1>AYLIK YEMEK LİSTESİ FORMU</h1><table><thead><tr><th>TARİH</th><th>KAHVALTI</th><th>ÖĞLE YEMEĞİ</th><th>AKŞAM YEMEĞİ</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  const buf = await p.pdf({ format: 'A5', margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  await p.context().close();
  return buf;
}
const pdfBuf = await makePdf();
fs.writeFileSync(path.join(OUT, 'yemek-ornek.pdf'), pdfBuf);

const A = await ctx('ayse');
await login(A.p, 'ayse@test.com', 'Sifre1234');
const shared = await A.p.evaluate(() => api('meal.get', {}).then((r) => r.shared));
step(`yemek listesi ${shared ? 'hastanenin ortak veritabanında (çok birimli)' : 'birimin veritabanında (tek birimli)'}`);
// temiz başla
for (const ym of [...new Set(DATES.map((d) => d.slice(0, 7)))]) await apiCall(A.p, 'meal.delete', { ym });

// ---- 1) Saat kuralları ve nöbetteki öğünler ----
const rules = await A.p.evaluate(() => {
  const f = (h, m) => { const r = mlNow(new Date(2026, 10, 10, h, m)); return `${r.cur.date} ${r.cur.meal} → ${r.next.date} ${r.next.meal}`; };
  const sm = (start, end) => mlShiftMeals({ date: '2026-11-10', start, end }).map((x) => x.date.slice(8) + ' ' + x.meal).join(', ');
  return { t0030: f(0, 30), t0100: f(1, 0), t1159: f(11, 59), t1200: f(12, 0), t1800: f(18, 0), t2330: f(23, 30), s24: sm('08:00', '08:00'), sNight: sm('16:00', '08:00'), sDay: sm('08:00', '16:00') };
});
const expR = { t0030: '2026-11-09 aksam → 2026-11-10 kahvalti', t0100: '2026-11-10 kahvalti → 2026-11-10 ogle', t1159: '2026-11-10 kahvalti → 2026-11-10 ogle', t1200: '2026-11-10 ogle → 2026-11-10 aksam', t1800: '2026-11-10 aksam → 2026-11-11 kahvalti', t2330: '2026-11-10 aksam → 2026-11-11 kahvalti',
  s24: '10 ogle, 10 aksam, 11 kahvalti', sNight: '10 aksam, 11 kahvalti', sDay: '10 ogle' };
for (const k of Object.keys(expR)) if (rules[k] !== expR[k]) fail(`saat kuralı ${k}: ${rules[k]} (beklenen ${expR[k]})`);
step('öğün saatleri: 01:00 kahvaltı, 12:00 öğle, 18:00 akşam; 24 saatlik nöbette öğle + akşam + ertesi kahvaltı, gece nöbetinde akşam + kahvaltı');

// ---- 2) Boş sayfa → PDF yükle → önizleme → kaydet ----
await A.p.goto(BASE + '#/yemek');
await expectText(A.p, 'yemek listesi yok');
await A.p.screenshot({ path: path.join(OUT, 'y-bos.png') });
const fc = A.p.waitForEvent('filechooser');
await A.p.locator('#mlActs [data-act=ml-import]').click();
await (await fc).setFiles({ name: 'yemek-listesi.pdf', mimeType: 'application/pdf', buffer: pdfBuf });
await A.p.locator('#mlEdSave').waitFor({ timeout: 15000 });
const parsed = await A.p.evaluate(() => mlCollect(document.querySelector('.modal')));
let bad = 0;
for (const d of DATES) for (const m of ['kahvalti', 'ogle', 'aksam']) {
  const got = ((parsed[d] || {})[m] || []).join(' | '), want = MENU[d][m].join(' | ');
  if (got !== want) { bad++; fail(`PDF ${d} ${m}: “${got}” (beklenen “${want}”)`); }
}
if (Object.keys(parsed).length !== DATES.length) fail(`PDF'den ${Object.keys(parsed).length} gün okundu (beklenen ${DATES.length})`);
if (!bad) step(`PDF okundu: ${DATES.length} gün, satır kıran kalemler birleşti, sayfaya bölünen gün ve ortalı tarih doğru`);
await A.p.screenshot({ path: path.join(OUT, 'y-onizleme.png') });
// önizlemede düzelt: bugünün kahvaltısına bir kalem ekle
const today = addD(0);
const ta = A.p.locator(`[data-mle="${today}|kahvalti"]`);
await ta.fill((await ta.inputValue()) + '\nTaze ekmek');
await A.p.click('#mlEdSave');
await expectText(A.p, 'öğün kaydedildi');
const got1 = await apiCall(A.p, 'meal.get', { from: DATES[0], to: DATES[DATES.length - 1] });
if (Object.keys(got1.days).length !== DATES.length) fail('kaydedilen gün sayısı yanlış');
if (got1.days[today].kahvalti.slice(-1)[0] !== 'Taze ekmek') fail('önizlemedeki düzeltme kaydedilmedi');
else step('önizlemede düzeltilen liste kaydedildi');

// ---- 3) Gün gün sayfa: şimdiki öğün, gün değiştirme, ay görünümü ----
await A.p.goto(BASE + '#/yemek');
await A.p.locator('.ml-meal').first().waitFor();
const cur = await A.p.evaluate(() => mlNow());
const curMealLabel = { kahvalti: 'Kahvaltı', ogle: 'Öğle yemeği', aksam: 'Akşam yemeği' }[cur.cur.meal];
const curTxt = (await A.p.locator('.ml-meal.cur').count()) ? await A.p.locator('.ml-meal.cur').innerText() : '';
if (!curTxt.includes(curMealLabel) || !curTxt.includes('Şimdi')) fail('şimdiki öğün kartı yanlış: ' + curTxt.slice(0, 80));
await A.p.screenshot({ path: path.join(OUT, 'y-gun.png') });
const mlAddJs = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return ymdOf(x); };
const nd = mlAddJs(cur.cur.date, 1);
await A.p.click('[data-act=ml-day][data-d="1"]');
await A.p.waitForFunction((d) => ML.sel === d, nd);
if (MENU[nd] && !(await A.p.locator('#mlGrid').innerText()).includes(MENU[nd].aksam[0])) fail('sonraki güne geçince o günün menüsü görünmüyor');
await A.p.click('[data-act=ml-view][data-v=ay]');
await A.p.locator('.ml-month table').waitFor();
if (!(await A.p.locator('.ml-month').innerText()).includes('Etli kuru fasulye')) fail('ay görünümünde menü yok');
step('gün gün değiştirme (oklar), şimdiki / sıradaki öğün rozetleri ve ay görünümü çalışıyor');
await A.p.click('[data-act=ml-view][data-v=gun]');

// ---- 4) Tek günü düzenle ----
await A.p.goto(BASE + '#/yemek/' + today);
await A.p.locator('[data-act=ml-edit-day]').click();
await A.p.locator(`[data-mle="${today}|aksam"]`).fill('Tavuk sote\nBulgur pilavı\nAyran');
await A.p.click('#mlEdSave');
await expectText(A.p, 'öğün kaydedildi');
await A.p.waitForFunction(() => document.querySelector('#mlGrid') && document.querySelector('#mlGrid').innerText.includes('Tavuk sote'));
step('tek günün menüsü düzenlendi');

// ---- 5) Excel/CSV (PDF formundaki gibi: tarih yalnız ilk satırda, her kalem ayrı satırda) ----
const next = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 2); return ymdOf(d).slice(0, 7); })();
const csv = ['TARİH;KAHVALTI;ÖĞLE YEMEĞİ;AKŞAM YEMEĞİ', `01.${next.slice(5)}.${next.slice(0, 4)};Çay;Mercimek çorbası;Et sote`, 'Pazar;Kaşar peynir;Salçalı köfte;Pirinç pilavı', ';Zeytin;Yoğurtlu makarna salatası;', `02.${next.slice(5)}.${next.slice(0, 4)};"Çay, Simit, Zeytin";Nohut;Kuru köfte`].join('\n');
const fc2 = A.p.waitForEvent('filechooser');
await A.p.locator('#mlActs [data-act=ml-import]').click();
await (await fc2).setFiles({ name: 'liste.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
await A.p.locator('#mlEdSave').waitFor({ timeout: 15000 });
const pc = await A.p.evaluate(() => mlCollect(document.querySelector('.modal')));
const d1 = next + '-01', d2 = next + '-02';
if ((pc[d1] || {}).kahvalti?.join('|') !== 'Çay|Kaşar peynir|Zeytin' || pc[d1].ogle.join('|') !== 'Mercimek çorbası|Salçalı köfte|Yoğurtlu makarna salatası' || (pc[d2] || {}).kahvalti?.join('|') !== 'Çay|Simit|Zeytin') fail('CSV yanlış okundu: ' + JSON.stringify(pc).slice(0, 300));
else step('Excel/CSV: tarih yalnız ilk satırdaysa alt satırlar aynı güne eklenir; virgüllü hücre kalemlere bölünür');
await A.p.click('#mlEdSave');
await expectText(A.p, 'öğün kaydedildi');
// "listeyi tamamen değiştir": aynı ayı yalnız 2. günle yeniden yükle → 1. gün silinir
await apiCall(A.p, 'meal.save', { days: { [d2]: { kahvalti: ['Çay'] } }, replace_ym: next });
const g2 = await apiCall(A.p, 'meal.get', { ym: next });
if (g2.days[d1] || !g2.days[d2]) fail('ayı tamamen değiştir çalışmadı');
await apiCall(A.p, 'meal.delete', { ym: next });

// ---- 6) Doğrulama ve yetki ----
if (!/Geçersiz tarih/.test(await apiErr(A.p, 'meal.save', { days: { '2026-02-30': { kahvalti: ['x'] } } }))) fail('geçersiz tarih kabul edildi');
if (!/sırayla/.test(await apiErr(A.p, 'meal.cfg', { times: { kahvalti: '13:00', ogle: '12:00', aksam: '18:00' } }))) fail('sırasız saatler kabul edildi');
const B = await ctx('burak');
await login(B.p, 'burak@test.com', 'Sifre1234');
if (!/yetkiniz yok/.test(await apiErr(B.p, 'meal.save', { days: { [today]: { kahvalti: ['x'] } } }))) fail('üye yemek listesini değiştirebildi');
const bView = await apiCall(B.p, 'meal.get', { from: today, to: today });
if (!bView.days[today] || bView.can_edit) fail('üye listeyi göremiyor ya da düzenleme yetkisi var');
step('üye listeyi görür, değiştiremez; geçersiz tarih ve sırasız saatler reddedilir');

// ---- 7) Ana sayfa kartı ve kişisel görünürlük ----
await B.p.goto(BASE + '#/');
await B.p.locator('.home-ext-yemek .ml-home').waitFor({ timeout: 10000 });
const hc = await B.p.locator('.home-ext-yemek').innerText();
if (!hc.includes('Şimdi')) fail('ana sayfa kartında “Şimdi” yok: ' + hc.slice(0, 120));
await B.p.screenshot({ path: path.join(OUT, 'y-anasayfa.png') });
await B.p.locator('.home-ext-yemek [data-act=ml-hmove][data-d="1"]').first().click();
if (!(await B.p.locator('.home-ext-yemek').innerText()).includes('Sıradaki')) fail('ana sayfada sıradaki öğüne geçilemedi');
step('ana sayfa kartı: şimdiki öğün, oklarla sıradaki öğünler');
// yalnız nöbetlerimde: nöbet yoksa kart görünmez
await B.p.evaluate(() => { prefsRemember({ meal: 'shift' }); MY.entries = []; MY.at = Date.now(); });
await B.p.waitForTimeout(800);
const vis = await B.p.evaluate(async () => { const el = document.createElement('div'); document.body.appendChild(el); await mlHomeCard(el); return document.body.contains(el); });
if (vis) fail('“yalnız nöbetlerimde” seçiliyken nöbeti olmayan kişide kart göründü');
const visDuty = await B.p.evaluate(async () => {
  const d = new Date(); const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const h = d.getHours();
  MY.entries = [{ kind: 'shift', date: ds, code: 'N', start: `${String(Math.max(0, h - 1)).padStart(2, '0')}:00`, end: `${String(Math.max(0, h - 1)).padStart(2, '0')}:00` }]; MY.at = Date.now();
  const el = document.createElement('div'); document.body.appendChild(el); await mlHomeCard(el); return document.body.contains(el) ? el.innerText : '';
});
if (!/öğünler/.test(visDuty)) fail('nöbetteyken kartta nöbetteki öğünler yok: ' + visDuty.slice(0, 160));
step('“yalnız nöbetlerimde”: nöbet yokken gizli, nöbetteyken o nöbetin öğünleriyle görünür');
// gizle: menüde ve ana sayfada yok
await B.p.goto(BASE + '#/yemek');
await B.p.locator('[data-act=ml-settings]').first().click();
await B.p.locator('input[name=mlPref][value=off]').check();
await B.p.waitForTimeout(900);
const saved = await apiCall(B.p, 'boot');
if ((saved.my_prefs && saved.my_prefs.ui && saved.my_prefs.ui.meal) !== 'off') fail('gizleme tercihi hesaba kaydedilmedi');
await B.p.goto(BASE + '#/');
await B.p.reload();
await B.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
await B.p.waitForTimeout(1200);
if (await B.p.locator('.home-ext-yemek').count()) fail('gizlenen yemek kartı ana sayfada');
if (await B.p.locator('nav a[href="#/yemek"]').count()) fail('gizlenen yemek listesi menüde');
await B.p.evaluate(() => prefsRemember({ meal: '' }));
await B.p.waitForTimeout(800);
step('kişi menüyü kendisi için gizleyebilir / yeniden açabilir (hesabına kaydedilir)');

// ---- 8) Takvimim gün paneli: nöbetteki yemekler ----
const panel = await B.p.evaluate(async (d) => {
  const box = document.createElement('div'); document.body.appendChild(box);
  CAL.sel = d;
  await mlDayPanel(box, d, [{ kind: 'shift', date: d, code: 'N', start: '16:00', end: '08:00' }]);
  return box.innerText;
}, today);
const pl = panel.toLocaleLowerCase('tr');
if (!pl.includes('bu nöbetteki yemekler') || !pl.includes('akşam · 18:00') || !pl.includes('ertesi gün')) fail('Takvimim gün panelinde nöbetteki yemekler yok: ' + panel.slice(0, 200));
else step('Takvimim: gece nöbetinin günü seçilince akşam yemeği ve ertesi günün kahvaltısı görünür');

// ---- 9) Telefon görünümü ----
const M = await ctx('ayse-tel', true);
await login(M.p, 'ayse@test.com', 'Sifre1234');
await M.p.goto(BASE + '#/yemek/' + today);
await M.p.locator('.ml-meal').first().waitFor();
const w = await M.p.evaluate(() => document.documentElement.scrollWidth);
if (w > 390) fail(`telefonda yatay taşma ${w}px`);
await M.p.screenshot({ path: path.join(OUT, 'y-telefon.png'), fullPage: true });
step('telefonda gün görünümü taşmadan çalışıyor');

// ---- 10) Çok birimli: aynı hastanenin diğer birimi aynı listeyi görür ----
const N = shared ? await ctx('nil') : null;
const nilIn = N ? await login(N.p, 'nil@test.com', 'NilSifre1234', 6000).then(() => true, () => false) : false;
if (N && !nilIn) { step('(Dahiliye birimi yok: e2e-hastane.mjs sonrası çalıştırılınca birimler arası paylaşım da denenir)'); await N.c.close(); }
if (nilIn) {
  const nv = await apiCall(N.p, 'meal.get', { from: today, to: today });
  if (!nv.days[today] || !nv.days[today].aksam.includes('Tavuk sote')) fail('aynı hastanenin diğer birimi listeyi görmüyor');
  else step('aynı hastanenin diğer birimi (Dahiliye) aynı listeyi görüyor');
  // Liste ilk yükleyen birime ait: başka birimin yöneticisi değiştiremez / silemez
  if (nv.can_edit || !nv.manage || !nv.owner || nv.owner.me) fail('diğer birimde liste sahipliği yanlış: ' + JSON.stringify(nv.owner));
  if (!/yönetiyor/.test(await apiErr(N.p, 'meal.delete', { ym: today.slice(0, 7) }))) fail('başka birim hastanenin yemek listesini silebildi');
  if (!/yönetiyor|değiştirir/.test(await apiErr(N.p, 'meal.cfg', { times: { kahvalti: '02:00', ogle: '12:00', aksam: '18:00' } }))) fail('başka birim öğün saatlerini değiştirebildi');
  await apiCall(N.p, 'meal.cfg', { mode: 'shift' }); // kendi biriminin varsayılanı serbest
  await N.p.goto(BASE + '#/yemek');
  await N.p.getByText('birimi yönetiyor').first().waitFor({ timeout: 8000 }).catch(() => fail('diğer birimde “listeyi X birimi yönetiyor” notu yok'));
  if (await N.p.locator('#mlActs [data-act=ml-import]').count()) fail('diğer birimde “Liste yükle” düğmesi görünüyor');
  step('liste sahipliği: diğer birim yöneticisi listeyi ve saatleri değiştiremez/silemez, yalnız kendi biriminin görünürlük ayarını yapar');
  // Devret: sahip birim bırakınca diğer birim yükleyebilir
  await apiCall(A.p, 'meal.cfg', { release: true });
  await apiCall(N.p, 'meal.save', { days: { [today]: { kahvalti: ['Çay', 'Peynir'] } } });
  const own2 = (await apiCall(A.p, 'meal.get', { from: today, to: today }));
  if (own2.can_edit || !own2.owner || own2.owner.me) fail('devirden sonra sahiplik geçmedi');
  await apiCall(N.p, 'meal.cfg', { release: true });
  step('liste yönetimi devredilebilir (bırakınca ilk kaydeden birim sahiplenir)');
  await N.c.close();
}

await browser.close();
if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('TAMAM: yemek listesi testleri geçti');
