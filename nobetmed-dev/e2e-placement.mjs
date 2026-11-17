// Günlük blok yerleşimi testi. e2e.mjs + e2e-features.mjs'den SONRA aynı sitede çalışır:
//   node e2e-placement.mjs http://localhost:8250/ <çıktı klasörü> <site klasörü>
// e2e-features: taraflar s3 (3. Basamak · B blok) ve s2 (2. Basamak · A blok, C blok) sonraki ayın listesiyle kurulu;
// 13. gün: 3. basamakta Elif, Burak, Ayşe 24 saat; 2. basamakta Kemal 16-08. Eski kura kayıtları 5. ve 13. günde.
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8250/';
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
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.locator('#view').waitFor();
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d).then(() => 'kabul', (e) => e.status + ' ' + e.message), [action, data]);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth);
const key = (s) => s.toLocaleLowerCase('tr');

const A = await ctx('admin', true);
const a = A.p;
await login(a, 'ayse@test.com', 'Sifre1234');
const M = await ctx('elif', true);
const m = M.p;
await login(m, 'elif@test.com', 'YeniSifre99');

const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const d1 = (d) => `${nx.getFullYear()}-${p2(nx.getMonth() + 1)}-${p2(d)}`;
const D = d1(13);

// 1) Gereken sayılar: 3. basamak fazla (3 kişi, B'de 2 gerekli), 2. basamak eksik (A gündüz+gece, C gece)
const same = (day, night) => ({ weekday: { day, night }, weekend: { day, night } });
await apiCall(a, 'rules.needs.save', { needs: { 'B blok': same(2, 2), 'A blok': same(1, 1), 'C blok': same(0, 1) } });
const day0 = await apiCall(a, 'placement.day', { date: D });
const s3 = day0.people.filter((p) => p.side === 's3');
if (s3.length !== 3 || !s3.every((p) => p.shift === '24') || !day0.people.some((p) => p.side === 's2' && p.shift === 'night')) fail('13. gün nöbetçileri: ' + JSON.stringify(day0.people.map((p) => p.name + ':' + p.shift)));
if (!day0.has_needs || day0.needs['A blok'].night !== 1) fail('gereken sayılar okunmadı: ' + JSON.stringify(day0.needs));
const minCross = Math.min(...s3.map((p) => p.cross));
const zeros = s3.filter((p) => p.cross === minCross).map((p) => p.name);
step(`gereken sayılar: B 2/2, A 1/1, C 0/1 · 13. gün 3. basamakta ${s3.length} kişi (geçiş: ${s3.map((p) => p.name + ' ' + p.cross).join(', ')})`);

// 2) Otomatik öneri: en az geçen karşıya geçer; eşitlikte kura kaydı
const au = await apiCall(a, 'placement.auto', { date: D });
const dr = au.draws[0];
if (au.draws.length !== 1 || !dr) fail('tek geçiş bekleniyordu: ' + JSON.stringify(au.draws));
else {
  if (dr.from !== 's3' || dr.to !== 's2' || dr.period !== 'night') fail('geçiş yönü: ' + JSON.stringify(dr));
  if (JSON.stringify([...dr.group].sort()) !== JSON.stringify([...zeros].sort())) fail(`kura grubu en az geçenler olmalı: ${dr.group} / ${zeros}`);
  if (!zeros.includes(dr.winner)) fail('kazanan en az geçenlerden değil: ' + dr.winner);
  if (dr.pool.length !== 3) fail('adaylar: ' + JSON.stringify(dr.pool));
  const wi = au.items.find((x) => x.name === dr.winner);
  if (!wi || wi.unit !== 'A blok' || wi.method !== (zeros.length > 1 ? 'kura' : 'auto')) fail('kazanan A blokta olmalı: ' + JSON.stringify(wi));
}
if (au.deficits.length) fail('eksik kalmamalı: ' + JSON.stringify(au.deficits));
const kemal = au.items.find((x) => /KEMAL/.test(x.name));
if (!kemal || kemal.unit !== 'C blok') fail('Kemal C blokta olmalı (A dolu): ' + JSON.stringify(kemal));
if (au.items.filter((x) => x.unit === 'B blok').length !== 2) fail('B blokta 2 kişi kalmalı');
step(`otomatik öneri: ${dr && dr.text} · ${zeros.length > 1 ? 'kura kaydı (grup ' + dr.group.length + ')' : 'kurasız'}, eksik yok`);

// 3) Muaf kişi asla seçilmez
const exName = zeros[0];
const ex = await apiCall(a, 'rules.exempt.save', { name: exName, scope: 'kura', until: '', note: 'test' });
const exId = ex.exempt.find((x) => x.name === exName).id;
for (let i = 0; i < 5; i++) {
  const r = await apiCall(a, 'placement.auto', { date: D });
  const w = r.draws[0];
  if (!w || w.winner === exName || w.group.includes(exName) || !w.exempt.includes(exName)) { fail('muaf kişi kuraya girdi: ' + JSON.stringify(w)); break; }
}
const exDay = await apiCall(a, 'placement.day', { date: D });
if (!exDay.people.find((p) => p.name === exName).exempt) fail('muaf işareti yok');
await apiCall(a, 'rules.exempt.delete', { id: exId });
step(`muafiyet: ${exName} 5 denemede hiç seçilmedi, kaldırıldı`);

// 4) Arayüz: otomatik dağıt → kura → kaydet; (N) artar
await a.goto(BASE + '#/taraf/' + D);
await a.locator('[data-act=pl-auto]').waitFor();
await a.click('[data-act=pl-auto]');
const roll = a.locator('.modal .draw-roll.win');
const tie = await roll.waitFor({ timeout: 4000 }).then(() => true, () => false);
if (zeros.length > 1 && !tie) fail('eşitlikte kura gösterimi açılmadı');
if (tie) await a.locator('.modal [data-act=close-modal]').last().click();
await a.locator('.pl-explain').waitFor();
if (zeros.length > 1 && !(await a.locator('[data-act=pl-redraw]').count())) fail('kura düğmesi yok');
await a.screenshot({ path: path.join(OUT, 'pl-proposal-mobile.png'), fullPage: true });
await a.click('[data-act=pl-save]');
await a.getByText('Yerleşim kaydedildi').first().waitFor();
const saved = await apiCall(a, 'placement.day', { date: D });
const moved = saved.saved.filter((s) => s.unit !== 'B blok' && s.side === 's3');
if (saved.saved.length !== 4 || moved.length !== 1 || !moved[0].counted) fail('kayıt: ' + JSON.stringify(saved.saved));
const W = moved[0].name;
const wp = saved.people.find((p) => p.name === W);
if (wp.cross_now !== wp.cross + 1) fail(`geçiş sayısı artmadı: ${wp.cross} → ${wp.cross_now}`);
if (moved[0].method !== (zeros.length > 1 ? 'kura' : 'auto') || !moved[0].pool || !moved[0].pool.group) fail('yöntem/kura kaydı: ' + JSON.stringify(moved[0]));
const chipTxt = await a.locator('.pl-unit[data-unit="A blok"] .pl-p').first().innerText();
if (!chipTxt.includes(`(${wp.cross + 1})`)) fail('A blok çipinde (N) yok: ' + chipTxt);
if (await overflow(a) > 390) fail('yerleşim sayfası mobil taşma: ' + await overflow(a));
step(`arayüz: öneri → kaydet; ${W} A blokta, geçiş ${wp.cross} → ${wp.cross_now} (çip: ${chipTxt.replace(/\s+/g, ' ')})`);

// 5) Elle değişiklik: Kemal'i A bloğa taşı → yöntem "elle"
await a.click('[data-act=pl-edit]');
await a.locator('.pl-p.ed', { hasText: 'Kemal' }).click();
await a.locator('.modal .pl-opt[data-u="A blok"]').click();
await a.click('[data-act=pl-save]');
await a.getByText('Yerleşim kaydedildi').first().waitFor();
const s2 = await apiCall(a, 'placement.day', { date: D });
const km = s2.saved.find((x) => /KEMAL/.test(x.name));
const wKeep = s2.saved.find((x) => x.name === W);
if (km.unit !== 'A blok' || km.method !== 'elle' || km.counted) fail('elle taşıma: ' + JSON.stringify(km));
if (wKeep.method !== moved[0].method || !wKeep.pool) fail('yeniden kayıtta kura bilgisi kayboldu: ' + JSON.stringify(wKeep));
step('elle düzenleme: kişiye dokun → blok seç → kaydet (yöntem elle, önceki kura kaydı korundu)');

// 6) Elle geçmiş sayı (+2) toplamı artırır, silinince geri döner
const mo0 = await apiCall(a, 'placement.month', { month: D.slice(0, 7) });
const target = s3.find((p) => p.name !== W).name;
const tot0 = mo0.stats.find((x) => x.name === target).total;
const adj = await apiCall(a, 'placement.adjust.save', { name: target, cross_count: 2, unit: 'C blok', unit_count: 3, note: 'eski dönem' });
const mo1 = await apiCall(a, 'placement.month', { month: D.slice(0, 7) });
const st1 = mo1.stats.find((x) => x.name === target);
if (st1.total !== tot0 + 2 || (st1.units['C blok'] || 0) < 3 || !st1.adj) fail(`elle sayı: ${tot0} → ${st1.total} ${JSON.stringify(st1.units)}`);
const memMonth = await apiCall(m, 'placement.month', { month: D.slice(0, 7) });
if (memMonth.adjust.some((x) => x.note) || memMonth.exempt.length || memMonth.can_edit) fail('üye notları/muafları görmemeli');
const auAfter = await apiCall(a, 'placement.day', { date: D });
if (auAfter.people.find((p) => p.name === target).cross !== s3.find((p) => p.name === target).cross + 2) fail('elle sayı kura sırasına eklenmedi');
await a.goto(BASE + '#/taraf/' + D);
await a.reload();
await a.locator('.pl-tbl').waitFor();
await a.locator('.pl-2col .list-row', { hasText: 'eski dönem' }).first().waitFor();
await apiCall(a, 'placement.adjust.delete', { id: adj.id });
const mo2 = await apiCall(a, 'placement.month', { month: D.slice(0, 7) });
if (mo2.stats.find((x) => x.name === target).total !== tot0) fail('elle sayı silinmedi');
step(`elle geçmiş sayı: ${target} ${tot0} → ${st1.total} (C blok +3), silinince ${tot0}`);

// 7) Yetki: üye kaydedemez/dağıtamaz; geçersiz girişler
const mSave = await apiErr(m, 'placement.save', { date: D, items: s2.saved.map((x) => ({ name: x.name, unit: x.unit })) });
const mAuto = await apiErr(m, 'placement.auto', { date: D });
const mAdj = await apiErr(m, 'placement.adjust.save', { name: target, cross_count: 5 });
if (!mSave.startsWith('403') || !mAuto.startsWith('403') || !mAdj.startsWith('403')) fail(`üye yetkisi: ${mSave} | ${mAuto} | ${mAdj}`);
const badUnit = await apiErr(a, 'placement.save', { date: D, items: s2.saved.map((x) => ({ name: x.name, unit: x.unit === 'A blok' ? 'Z blok' : x.unit })) });
const missing = await apiErr(a, 'placement.save', { date: D, items: s2.saved.slice(1).map((x) => ({ name: x.name, unit: x.unit })) });
const stranger = await apiErr(a, 'placement.save', { date: D, items: [...s2.saved.map((x) => ({ name: x.name, unit: x.unit })), { name: 'MERVE KAPLAN', unit: 'A blok' }] });
if (!/Birim bulunamadı/.test(badUnit) || !/Herkesi/.test(missing) || !/nöbetçi görünmüyor/.test(stranger)) fail(`doğrulama: ${badUnit} | ${missing} | ${stranger}`);
const emptyDay = await apiCall(a, 'placement.day', { date: d1(20) });
const emptyAuto = await apiErr(a, 'placement.auto', { date: d1(20) });
if (emptyDay.people.length || !/nöbetçi görünmüyor/.test(emptyAuto)) fail('boş gün: ' + emptyAuto);
const md = await apiCall(m, 'placement.day', { date: D });
if (md.can_edit || md.people.some((p) => p.exempt)) fail('üye düzenleme yetkisi görüyor');
step(`yetki ve doğrulama: üye 403, yanlış birim / eksik kişi / listede olmayan kişi reddedildi, boş gün çökmedi`);

// 8) Bugün: listeye bugünün nöbetini ekle, yerleştir; üyenin ana sayfasında görünür
const gs = (await apiCall(a, 'gsync.get')).gs;
// "bugün" sunucunun saat dilimine göre (tarayıcıyla farklı olabilir)
const today = (await apiCall(a, 'placement.today')).date;
const ym0 = { y: +today.slice(0, 4), m: +today.slice(5, 7) };
const ym1 = { y: nx.getFullYear(), m: nx.getMonth() + 1 };
const td = +today.slice(8, 10);
const MN = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
// e2e-features book(3) ile aynı içerik + bugünün nöbetleri
const P1 = { 'Elif Yılmaz': { 1: '8 16', 5: '16 8', 7: '8 16', 8: '8 8', 10: '8 8', 12: '16 8', 13: '8 8' }, 'Burak Demir': { 1: '8 16', 3: '8 8', 5: '16 8', 10: '8 16', 13: '8 8' }, 'Ayşe Kaya': { 2: '8 8', 5: '8 16', 13: '8 8' }, 'Deniz Şahin': { 4: '8 8', 9: '8 8' } };
const yd = td > 1 ? td - 1 : null; // dün (geçmiş gün görünümü için)
const P0 = { 'Elif Yılmaz': { 26: '8 8', 28: '8 16', 30: '8 8', [td]: '8 8' }, 'Burak Demir': { 27: '8 8', 29: '8 16', [td]: '16 8' }, 'Ayşe Kaya': { 26: '8 16' }, 'Deniz Şahin': { 25: '8 8' } };
if (yd) { P0['Ayşe Kaya'][yd] = '8 8'; P0['Deniz Şahin'][yd] = '16 8'; }
const P2 = { 'Kemal Bulut': { 5: '8 8', 13: '16 8' }, 'Merve Kaplan': { 6: '8 8' } };
const P20 = { 'Kemal Bulut': { 26: '8 8', [td]: '8 8' } };
const b64 = await a.evaluate(async ([ym0, ym1, MN, P0, P1, P2, P20]) => {
  await loadVendor('exceljs');
  const wb = new ExcelJS.Workbook();
  const tab = (name, y, m, people) => {
    const ws = wb.addWorksheet(name);
    ws.getCell(5, 4).value = 'AYLIK NÖBET ÜCRET ÇİZELGESİ';
    ws.getCell(7, 20).value = 'AİT OLDUĞU DÖNEM'; ws.getCell(7, 26).value = y; ws.getCell(7, 27).value = m;
    const days = new Date(y, m, 0).getDate();
    ws.getCell(9, 2).value = 'PERSONEL LİSTESİ'; ws.getCell(9, 3).value = 'ÜNVANI';
    for (let d = 1; d <= days; d++) { ws.getCell(9, 3 + d).value = d; ws.getCell(10, 3 + d).value = ['Paz.', 'Pzt.', 'Sal.', 'Çar.', 'Per.', 'Cum.', 'Cmt.'][new Date(y, m - 1, d).getDay()]; }
    Object.entries(people).forEach(([nm, codes], i) => { ws.getCell(11 + i, 1).value = i + 1; ws.getCell(11 + i, 2).value = nm.toLocaleUpperCase('tr'); ws.getCell(11 + i, 3).value = 'HEMŞİRE'; Object.entries(codes).forEach(([d, c]) => { ws.getCell(11 + i, 3 + +d).value = c; }); });
    ws.getCell(11 + Object.keys(people).length + 1, 3).value = 'Topl Saat';
  };
  tab(MN[ym0.m - 1], ym0.y, ym0.m, { 'Selin Arslan': { 3: '8 8' } });
  tab(MN[ym0.m - 1] + ' 2.BASAMAK', ym0.y, ym0.m, P20);
  tab(MN[ym0.m - 1] + ' 3, BASAMAK', ym0.y, ym0.m, P0);
  tab(MN[ym1.m - 1] + ' 3.BASAMAK', ym1.y, ym1.m, P1);
  tab(MN[ym1.m - 1] + ' 2.BASAMAK', ym1.y, ym1.m, P2);
  const buf = await wb.xlsx.writeBuffer();
  let bin = ''; new Uint8Array(buf).forEach((x) => { bin += String.fromCharCode(x); });
  return btoa(bin);
}, [ym0, ym1, MN, P0, P1, P2, P20]);
const pr = await fetch(BASE + 'api.php?action=gsync.push', { method: 'POST', headers: { 'X-Sync-Token': gs.token, 'Content-Type': 'application/octet-stream', 'X-Title': encodeURIComponent('YOĞUN BAKIM') }, body: Buffer.from(b64, 'base64') });
if (pr.status !== 200) fail('bugünün listesi gönderilemedi: ' + pr.status);
const tday = await apiCall(a, 'placement.day', { date: today });
if (tday.people.length !== 3) fail('bugün nöbetçiler: ' + JSON.stringify(tday.people.map((p) => p.name)));
// ana sayfa kartı kayıttan önce: "henüz yapılmadı"
await m.goto(BASE + '#/');
await m.reload();
await m.locator('.home-ext-bloklar .pl-home').waitFor();
if (!/henüz yapılmadı/.test(await m.locator('.home-ext-bloklar').innerText())) fail('ana sayfa: kayıtsız durum yazısı yok');
if (await m.locator('.home-ext-bloklar a[href^="#/taraf/"].btn').count()) fail('üyede Yerleştir düğmesi olmamalı');
const ta = await apiCall(a, 'placement.auto', { date: today });
await apiCall(a, 'placement.save', { date: today, items: ta.items.map((x) => ({ name: x.name, unit: x.unit })) });
const elifUnit = ta.items.find((x) => /ELİF/.test(x.name)).unit;
await m.reload();
await m.locator('.home-ext-bloklar .pl-hu').first().waitFor();
const card = await m.locator('.home-ext-bloklar').innerText();
if (!/Elif Yılmaz\s*\(\d+\)/.test(card) || !/Kemal Bulut\s*\(\d+\)/.test(card) || !card.includes('Sen: ' + elifUnit)) fail('ana sayfa kartı: ' + card);
const myb = await m.evaluate((t) => (typeof S !== 'undefined' && S.my_blocks ? S.my_blocks[t] : 'yok'), today);
if (myb !== elifUnit) fail('S.my_blocks bugünü göstermiyor: ' + myb);
if (await overflow(m) > 390) fail('ana sayfa mobil taşma: ' + await overflow(m));
await m.locator('.home-ext-bloklar').screenshot({ path: path.join(OUT, 'pl-home-card.png') });
await m.screenshot({ path: path.join(OUT, 'pl-home-mobile.png') });
// Geçmiş gün: yönetici dünü yerleştirir; üye ana sayfadaki "Geçmiş günler" bağlantısıyla salt okunur görür
const yDate = `${ym0.y}-${p2(ym0.m)}-${p2(yd || td)}`;
if (yd) {
  const ya = await apiCall(a, 'placement.auto', { date: yDate });
  await apiCall(a, 'placement.save', { date: yDate, items: ya.items.map((x) => ({ name: x.name, unit: x.unit })) });
  await m.click('.home-ext-bloklar a.pl-hist');
  await m.waitForFunction((d) => typeof PL !== 'undefined' && PL.day && PL.day.date === d, yDate);
  await m.locator('.pl-unit .pl-p', { hasText: 'Ayşe Kaya' }).waitFor();
  const yTxt = await m.locator('#plDay').innerText();
  if (!/Kaydedildi/.test(yTxt) || !/Deniz Şahin/.test(yTxt)) fail('üye geçmiş günü göremedi: ' + yTxt.slice(0, 300));
  if (await m.locator('[data-act=pl-auto], .pl-p.ed').count()) fail('üye geçmiş günde düzenleme görüyor');
  await m.click('[data-act=pl-go][data-d="1"]');
  await m.waitForFunction((d) => PL.day && PL.day.date === d, today);
}
const mPast = await apiCall(m, 'placement.day', { date: yDate });
const mD = await apiCall(m, 'placement.day', { date: D });
if (!mPast.saved.length || !mD.saved.length || [...mPast.saved, ...mD.saved].some((x) => x.pool || x.why)) fail('üyeye kura iç bilgisi gitti: ' + JSON.stringify(mD.saved.find((x) => x.pool || x.why)));
const mLog = (await apiCall(m, 'placement.month', { month: D.slice(0, 7) })).log;
if (mLog.some((g) => g.items.some((x) => x.pool))) fail('üye ay kaydında kura adayları var');
if (!(await apiCall(a, 'placement.day', { date: D })).saved.some((x) => x.pool && x.pool.group)) fail('yayıncı kura kaydını görmeli');
step(`geçmiş gün: üye "Geçmiş günler" ile ${yDate} yerleşimini salt okunur gördü; kura adayları/gerekçe yalnız sorumlulara`);
step(`ana sayfa "Bugün bloklar": kayıtsızken uyarı, kayıttan sonra bloklar ve (N); Sen: ${elifUnit}; S.my_blocks`);

// 9) Üye görünümü (salt okunur) ve masaüstü
await m.goto(BASE + '#/taraf/' + D);
await m.locator('.pl-unit[data-unit="A blok"]').waitFor();
if (await m.locator('[data-act=pl-auto], [data-act=pl-save], .pl-p.ed').count()) fail('üye düzenleme düğmeleri görüyor');
await m.locator('.pl-tbl').waitFor();
await m.locator('.tr-mx td.tr-moved').first().waitFor();
if (await overflow(m) > 390) fail('taraf sayfası (üye) mobil taşma: ' + await overflow(m));
await m.screenshot({ path: path.join(OUT, 'pl-member-mobile.png'), fullPage: true });
// sıralama
await m.click('.pl-tbl thead [data-k=name]');
const firstName = await m.locator('.pl-tbl tbody tr .pl-tn .ellipsis').first().innerText();
const names = await m.locator('.pl-tbl tbody tr .pl-tn .ellipsis').allInnerTexts();
if (JSON.stringify(names) !== JSON.stringify([...names].sort((x, y) => key(x).localeCompare(key(y), 'tr')))) fail('ada göre sıralama: ' + names.join(','));
// ay gezinme ve gün seçimi
await m.click('[data-act=tr-mv][data-d="-1"]');
await m.locator('.pl-mnav b', { hasText: String(ym0.y) }).waitFor();
await m.waitForFunction(() => /taraf\/\d{4}-\d{2}-\d{2}/.test(location.hash));
const D2 = await m.evaluate(() => PL.date);
if (D2.slice(0, 7) !== today.slice(0, 7)) fail('önceki ay: ' + D2);
await m.click('[data-act=pl-go][data-d="1"]');
await m.waitForFunction((d) => PL.day && PL.day.date !== d, D2);
step(`üye görünümü: salt okunur, matris/tablo (ilk: ${firstName}), sıralama, ay/gün gezinme, taşma yok`);

const DK = await ctx('admin-desktop', false);
await login(DK.p, 'ayse@test.com', 'Sifre1234');
await DK.p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await DK.p.goto(BASE + '#/taraf/' + D);
await DK.p.locator('.pl-unit').first().waitFor();
await DK.p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await DK.p.waitForTimeout(400);
await DK.p.screenshot({ path: path.join(OUT, 'pl-desktop-dark.png'), fullPage: true });
const aud = await apiCall(DK.p, 'audit.list', {}).catch(() => null);
if (aud && aud.items && !aud.items.some((x) => x.action === 'placement.save')) fail('işlem günlüğünde blok kaydı yok');
step('masaüstü (koyu tema) ekran görüntüsü, işlem günlüğü');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nBLOK YERLEŞİMİ TESTLERİ GEÇTİ');
