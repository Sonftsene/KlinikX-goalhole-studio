// Nöbet çizelgesi hazırlama (4.5) — uydurma verilerle.
// e2e.mjs ve e2e-features.mjs SONRASI aynı sitede (en sona) çalışır; Google'a bağlı OLMAYAN bir nöbet listesi kullanır:
//   node e2e-plan.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-plan.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const noOverflow = async (p, tag) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) fail(`${tag}: telefonda yatay taşma ${w}px`); };
const confirmOk = async (p) => { await p.locator('.modal [data-ok]').last().click(); };

const A = await ctx('ayse');
await login(A.p, 'ayse@test.com', 'Sifre1234');
const ro = (await A.p.evaluate(() => S.rosters)).find((r) => r.kind !== 'tablo' && !r.linked);
if (!ro) { fail('Google’a bağlı olmayan liste yok'); await browser.close(); process.exit(1); }
const now = new Date();
const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const ym = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}`;
const d = (n) => `${ym}-${String(n).padStart(2, '0')}`;

// ---- 1) Yetki: üye çizelgeye giremez ----
const M = await ctx('elif', true);
await login(M.p, 'elif@test.com', 'YeniSifre99');
if ((await apiErr(M.p, 'plan.get', { roster_id: ro.id, ym })) === 'kabul') fail('üye çizelgeyi açtı');
await M.p.goto(BASE + '#/nobetim');
await M.p.locator('.hub-tabs').waitFor();
if (await M.p.locator('.hub-tabs a[href="#/cizelge"]').count()) fail('üyeye Çizelge sekmesi görünüyor');
const linked = (await A.p.evaluate(() => S.rosters)).find((r) => r.linked);
if (linked && !/Google/.test(await apiErr(A.p, 'plan.get', { roster_id: linked.id, ym }))) fail('Google’a bağlı listede çizelge açıldı');
step('yetki: üye çizelgeyi açamıyor, sekme görünmüyor; Google’a bağlı listede çizelge hazırlanamıyor');

// ---- 2) Editör: fırça, gereken sayılar, kural uyarısı ----
await A.p.goto(BASE + `#/cizelge/${ro.id}/${ym}`);
await A.p.locator('#plGrid').waitFor();
const st = await A.p.evaluate(() => ({ people: PL2.d.people.map((p) => p.name), day: PL2.d.day_code, night: PL2.d.night_code }));
if (!st.people.includes('Ayşe Kaya') || !st.people.includes('Burak Demir') || !st.day || !st.night) fail('çizelge başlangıcı: ' + JSON.stringify(st));
for (const [k, v] of [['weekday.day', '2'], ['weekday.night', '1'], ['weekend.day', '1'], ['weekend.night', '1']]) await A.p.fill(`[data-input=pl2-need][data-k="${k}"]`, v);
await A.p.click(`[data-act=pl2-brush][data-c="${st.night}"]`);
await A.p.click(`[data-act=pl2-cell][data-n="Burak Demir"][data-d="${d(3)}"]`);
await A.p.click(`[data-act=pl2-cell][data-n="Burak Demir"][data-d="${d(4)}"]`); // art arda iki gece: dinlenme 8 saat (en az 16)
await A.p.click(`[data-act=pl2-brush][data-c="${st.day}"]`);
await A.p.click(`[data-act=pl2-cell][data-n="Ayşe Kaya"][data-d="${d(1)}"]`);
await A.p.click('[data-act=pl2-brush-off]');
await A.p.click('[data-act=pl2-check]');
await A.p.locator('#plIssues .list-row', { hasText: 'Burak Demir' }).first().waitFor();
const iss = await A.p.evaluate(() => PL2.chk.issues);
if (!iss.some((x) => x.name === 'Burak Demir' && x.type === 'kural' && /dinlenme/.test(x.msg))) fail('dinlenme ihlali yakalanmadı: ' + JSON.stringify(iss.slice(0, 3)));
if (!(await A.p.locator(`td.bad [data-act=pl2-cell][data-n="Burak Demir"]`).count())) fail('kural uyarısı hücrede işaretlenmedi');
step(`editör: fırça (${st.night}/${st.day}) ile boyandı; gereken sayılar girildi; Burak’ın art arda iki gecesi “dinlenme” ihlali olarak yakalandı ve hücre işaretlendi`);

// ---- 3) Otomatik doldur ----
await A.p.click('[data-act=pl2-auto]');
await confirmOk(A.p);
await expectText(A.p, 'nöbet yazıldı', 20000);
const after = await A.p.evaluate(() => ({ cells: PL2.d.cells, chk: PL2.chk }));
if (after.cells['Ayşe Kaya'][d(1)] !== st.day || after.cells['Burak Demir'][d(3)] !== st.night) fail('otomatik doldurma elle girilen hücreleri değiştirdi');
const autoRule = after.chk.issues.filter((x) => x.type === 'kural' && !(x.name === 'Burak Demir' && [d(3), d(4)].includes(x.date)));
if (autoRule.length) fail('otomatik doldurma kurala aykırı nöbet yazdı: ' + JSON.stringify(autoRule.slice(0, 3)));
const filled = Object.values(after.cells).reduce((a, r) => a + Object.keys(r).length, 0);
if (filled < 20) fail('otomatik doldurma çok az nöbet yazdı: ' + filled);
await A.p.screenshot({ path: path.join(OUT, 'p-cizelge-desktop.png') });
step(`otomatik doldurma: ${filled} hücre; elle girilenlere dokunmadı; yeni kural ihlali yok; ${after.chk.short.length} gün eksik kaldı (kişi sayısı yetmeyen günler)`);

// ---- 4) Taslak kaydı ve geri yükleme ----
await A.p.click('[data-act=pl2-save]');
await expectText(A.p, 'Taslak kaydedildi');
await A.p.reload();
await A.p.locator('#plGrid').waitFor();
const reloaded = await A.p.evaluate(() => ({ cells: PL2.d.cells, needs: PL2.d.needs }));
const canon = (c) => JSON.stringify(Object.keys(c).sort().map((k) => [k, Object.keys(c[k]).sort().map((x) => [x, c[k][x]])]));
if (canon(reloaded.cells) !== canon(after.cells) || reloaded.needs.weekday.day !== 2) fail('taslak geri yüklenmedi');
step('taslak sunucuda saklandı, sayfa yenilenince aynen geldi (gereken sayılar dahil)');

// ---- 5) Başka sistemden yapıştır ----
await A.p.click('[data-act=pl2-import]');
const n = new Date(nx.getFullYear(), nx.getMonth() + 1, 0).getDate();
const header = ['Ad Soyad', ...Array.from({ length: n }, (_, i) => String(i + 1))].join('\t');
const row = ['Deniz Aktarma', st.day, '', st.night, ...Array.from({ length: n - 3 }, () => '')].join('\t');
await A.p.fill('#pl2Paste', header + '\n' + row);
await A.p.locator('#pl2Prev', { hasText: '2 hücre' }).waitFor();
await A.p.click('#pl2ImpGo');
await expectText(A.p, '2 hücre aktarıldı');
const imp = await A.p.evaluate((x) => PL2.d.cells['Deniz Aktarma'], null);
if (!imp || imp[d(1)] !== st.day || imp[d(3)] !== st.night) fail('yapıştırılan çizelge aktarılmadı: ' + JSON.stringify(imp));
step('başka sistemden yapıştırma: tablo biçimi (sekmeyle ayrılmış, başlıkta gün numaraları) yeni kişiyle aktarıldı');

// ---- 6) Yayınla ----
// Elle bıraktığımız ihlali düzelt: Burak'ın 4. günü boş
await A.p.click(`[data-act=pl2-cell][data-n="Burak Demir"][data-d="${d(4)}"]`);
await A.p.locator('.modal button[data-c=""]').click();
const vBefore = (await apiCall(A.p, 'rosters.versions', { id: ro.id })).versions.length;
await A.p.click('[data-act=pl2-publish]');
await confirmOk(A.p);
await expectText(A.p, 'Yayınlandı', 30000);
const rr = (await apiCall(A.p, 'rosters.list')).rosters.find((r) => r.id === ro.id);
if (rr.period !== ym || rr.parsed_file_id !== rr.file.id) fail('liste yayınlanan aya geçmedi: ' + JSON.stringify({ p: rr.period, pf: rr.parsed_file_id, f: rr.file && rr.file.id }));
if ((await apiCall(A.p, 'rosters.versions', { id: ro.id })).versions.length !== vBefore + 1) fail('yeni liste sürümü oluşmadı');
if (!/\.xlsx$/.test(rr.file.name)) fail('yayınlanan dosya Excel değil: ' + rr.file.name);
const fileStatus = await M.p.evaluate(async (u) => (await fetch(u)).status, BASE + rr.file.url);
if (fileStatus !== 200) fail('ekip yayınlanan listeyi açamadı: ' + fileStatus);
const ayseShifts = (await apiCall(A.p, 'shifts.my', { from: d(1), to: d(n) }).catch(() => ({ entries: [] }))).entries || [];
const dayRow = await A.p.evaluate(async (x) => (await api('shifts.day', { date: x })), d(1));
if (!JSON.stringify(dayRow).includes('Ayşe Kaya')) fail('yayınlanan çizelge “Kim nöbette”ye yansımadı');
step(`yayınla: çizelge “${ro.name}” listesinin yeni sürümü oldu (${rr.file.name}), ay ${ym}; nöbetler kaydedildi (Kim nöbette ${d(1)}: Ayşe), ekip dosyayı açıyor${ayseShifts.length ? `, Takvimim ${ayseShifts.length} kayıt` : ''}`);

// ---- 7) Telefonda ----
const Am = await ctx('ayse-mobil', true);
await login(Am.p, 'ayse@test.com', 'Sifre1234');
await Am.p.goto(BASE + `#/cizelge/${ro.id}/${ym}`);
await Am.p.locator('#plGrid').waitFor();
await Am.p.screenshot({ path: path.join(OUT, 'p-cizelge-mobile.png') });
await noOverflow(Am.p, 'çizelge');
step('telefonda çizelge: tablo kendi içinde kayıyor, sayfada taşma yok');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nÇİZELGE TESTLERİ GEÇTİ');
