// Günlük blok yerleşimi testi. e2e.mjs + e2e-features.mjs'den SONRA aynı sitede çalışır:
//   node e2e-placement.mjs http://localhost:8250/ <çıktı klasörü> <site klasörü>
// e2e-features: taraflar s3 (3. Basamak · B blok) ve s2 (2. Basamak · A blok, C blok) sonraki ayın listesiyle kurulu.
// Sonraki ay: 13. gün Elif, Burak, Ayşe 24 saat (s3), Kemal 16-08 (s2) · 5. gün Elif 16-08, Burak 16-08, Ayşe 08-16 (s3), Kemal 24 (s2)
// · 10. gün Elif 24, Burak 08-16 (s3) · 4. ve 9. gün Deniz 24 (s3). Eski kura kayıtları 5. ve 13. günde. Tüm adlar uydurmadır.
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
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true } : { viewport: { width: 1360, height: 900 }, acceptDownloads: true });
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
const TEAM = '@sorumlu';
const unitOf = (items, re) => { const it = items.find((x) => re.test(x.name)); return it ? it.segs.map((s) => s.unit + ':' + s.period + ':' + s.status).join('+') : null; };
/** Kayıtlı satırlar → kaydetme biçimi */
const toPeople = (saved) => {
  const by = {};
  saved.filter((s) => s.status !== 'standby').forEach((s) => { (by[s.name] = by[s.name] || []).push({ unit: s.unit, period: s.period, status: s.status }); });
  return Object.entries(by).map(([name, segs]) => ({ name, segs }));
};
const one = (name, unit, period, status = 'work') => ({ name, segs: [{ unit, period, status }] });

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
const month = D.slice(0, 7);

// 0) Hesaplara dahil edilmeyen kişi (Deniz) hiçbir yerde görünmez, yerleştirilemez
const ex0 = await apiCall(a, 'rules.excluded.save', { name: 'DENİZ ŞAHİN', on: true });
if (!ex0.excluded.some((x) => /DENİZ/.test(x.name))) fail('dahil değil listesi: ' + JSON.stringify(ex0));
const d4 = await apiCall(a, 'placement.day', { date: d1(4) });
const mo0x = await apiCall(a, 'placement.month', { month });
const denizSeen = d4.people.some((p) => /DENİZ/.test(p.name)) || mo0x.stats.some((x) => /DENİZ/.test(x.name)) || mo0x.sides.some((sd) => sd.people.some((p) => /DENİZ/.test(p.name)))
  || (await apiCall(a, 'placement.day', { date: D })).others.some((o) => /DENİZ/.test(o.name) && !o.excluded); // 4.30: yalnız "nöbet dışı · elle" grubunda
if (denizSeen) fail('dahil edilmeyen kişi görünüyor');
const denizAuto = await apiErr(a, 'placement.auto', { date: d1(4) });
if (!/nöbetçi görünmüyor/.test(denizAuto)) fail('yalnız dahil edilmeyen kişinin günü: ' + denizAuto);
step('hesaplara dahil edilmeyen kişi: gün, ay tablosu, matris ve çağrılacaklar listesinde yok');

// 1) Gereken sayılar: 3. basamak fazla (3 kişi, B'de 2 gerekli), 2. basamak eksik (A gündüz+gece, C gece)
const same = (day, night) => ({ weekday: { day, night }, weekend: { day, night } });
await apiCall(a, 'rules.needs.save', { needs: { 'B blok': same(2, 2), 'A blok': same(1, 1), 'C blok': same(0, 1) } });
const day0 = await apiCall(a, 'placement.day', { date: D });
const s3 = day0.people.filter((p) => p.side === 's3');
if (s3.length !== 3 || !s3.every((p) => p.shift === '24') || !day0.people.some((p) => p.side === 's2' && p.shift === 'night')) fail('13. gün nöbetçileri: ' + JSON.stringify(day0.people.map((p) => p.name + ':' + p.shift)));
if (!day0.has_needs || day0.needs['A blok'].night !== 1 || !day0.needs[TEAM]) fail('gereken sayılar okunmadı: ' + JSON.stringify(day0.needs));
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
  if (!zeros.includes(dr.winner) || dr.pool.length !== 3) fail('kazanan/adaylar: ' + JSON.stringify(dr));
  const wi = au.items.find((x) => x.name === dr.winner);
  if (!wi || wi.segs[0].unit !== 'A blok' || wi.method !== (zeros.length > 1 ? 'kura' : 'auto')) fail('kazanan A blokta olmalı: ' + JSON.stringify(wi));
}
if (au.deficits.length) fail('eksik kalmamalı: ' + JSON.stringify(au.deficits));
if (unitOf(au.items, /KEMAL/) !== 'C blok:night:work') fail('Kemal C blokta olmalı (A dolu): ' + unitOf(au.items, /KEMAL/));
if (au.items.filter((x) => x.segs[0].unit === 'B blok').length !== 2) fail('B blokta 2 kişi kalmalı');
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
if (!(await apiCall(a, 'placement.day', { date: D })).people.find((p) => p.name === exName).exempt) fail('muaf işareti yok');
await apiCall(a, 'rules.exempt.delete', { id: exId });
step(`muafiyet: ${exName} 5 denemede hiç seçilmedi, kaldırıldı`);

// 4) Arayüz: otomatik dağıt → kura → kaydet; (N) artar
await a.goto(BASE + '#/taraf/' + D);
await a.locator('[data-act=pl-auto]').waitFor();
await a.click('[data-act=pl-auto]');
const tie = await a.locator('.modal .draw-roll.win').waitFor({ timeout: 4000 }).then(() => true, () => false);
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
const mo0 = await apiCall(a, 'placement.month', { month });
const target = s3.find((p) => p.name !== W).name;
const tot0 = mo0.stats.find((x) => x.name === target).total;
const adj = await apiCall(a, 'placement.adjust.save', { name: target, cross_count: 2, unit: 'C blok', unit_count: 3, note: 'eski dönem' });
const st1 = (await apiCall(a, 'placement.month', { month })).stats.find((x) => x.name === target);
if (st1.total !== tot0 + 2 || (st1.units['C blok'] || 0) < 3 || !st1.adj) fail(`elle sayı: ${tot0} → ${st1.total} ${JSON.stringify(st1.units)}`);
const memMonth = await apiCall(m, 'placement.month', { month });
if (memMonth.adjust.some((x) => x.note) || memMonth.exempt.length || memMonth.can_edit) fail('üye notları/muafları görmemeli');
if ((await apiCall(a, 'placement.day', { date: D })).people.find((p) => p.name === target).cross !== s3.find((p) => p.name === target).cross + 2) fail('elle sayı kura sırasına eklenmedi');
await a.goto(BASE + '#/taraf/' + D);
await a.reload();
await a.locator('.pl-tbl').waitFor();
await a.locator('.pl-2col .list-row', { hasText: 'eski dönem' }).first().waitFor();
await apiCall(a, 'placement.adjust.delete', { id: adj.id });
if ((await apiCall(a, 'placement.month', { month })).stats.find((x) => x.name === target).total !== tot0) fail('elle sayı silinmedi');
step(`elle geçmiş sayı: ${target} ${tot0} → ${st1.total} (C blok +3), silinince ${tot0}`);

// 7) Yetki ve doğrulama
const ppl13 = toPeople(s2.saved);
const mSave = await apiErr(m, 'placement.save', { date: D, people: ppl13 });
const mAuto = await apiErr(m, 'placement.auto', { date: D });
const mAdj = await apiErr(m, 'placement.adjust.save', { name: target, cross_count: 5 });
const mTeam = await apiErr(m, 'placement.team.save', { name: 'X', members: [] });
if (![mSave, mAuto, mAdj, mTeam].every((x) => x.startsWith('403'))) fail(`üye yetkisi: ${mSave} | ${mAuto} | ${mAdj} | ${mTeam}`);
const badUnit = await apiErr(a, 'placement.save', { date: D, people: ppl13.map((x) => ({ ...x, segs: x.segs.map((s) => ({ ...s, unit: s.unit === 'A blok' ? 'Z blok' : s.unit })) })) });
const missing = await apiErr(a, 'placement.save', { date: D, people: ppl13.slice(1) });
// 4.30: nöbet dışı kişi yalnız elle eklenebilir (çağrılan gibi); karşıya geçişe / sayımlara girmez
const exclCalled = await apiErr(a, 'placement.save', { date: D, people: [...ppl13, one('DENİZ ŞAHİN', 'A blok', 'night')] });
const exclRow = exclCalled === 'kabul' ? (await apiCall(a, 'placement.day', { date: D })).saved.find((x) => /DENİZ ŞAHİN/i.test(x.name)) : null;
if (!/birim bulunamadı/i.test(badUnit) || !/Herkesi/.test(missing) || exclCalled !== 'kabul' || !exclRow || exclRow.counted || exclRow.status !== 'called') fail(`doğrulama: ${badUnit} | ${missing} | ${exclCalled} | ${JSON.stringify(exclRow)}`);
await apiCall(a, 'placement.save', { date: D, people: ppl13 });
const emptyDay = await apiCall(a, 'placement.day', { date: d1(20) });
const emptyAuto = await apiErr(a, 'placement.auto', { date: d1(20) });
if (emptyDay.people.length || !/nöbetçi görünmüyor/.test(emptyAuto)) fail('boş gün: ' + emptyAuto);
const md = await apiCall(m, 'placement.day', { date: D });
if (md.can_edit || md.people.some((p) => p.exempt) || md.others.length || md.saved.some((x) => x.pool || x.why)) fail('üye düzenleme yetkisi / iç bilgi görüyor');
step('yetki ve doğrulama: üye 403 (kaydet, dağıt, sayı, ekip), yanlış birim / eksik kişi reddedildi, nöbet dışı kişi yalnız elle eklendi ve sayılmadı, boş gün çökmedi');

// 8) Sorumlular ekibi: sabit üye hep ekibe, A/B/C'ye ve kuraya asla
const tm = await apiCall(a, 'placement.team.save', { name: 'Sorumlular', members: ['BURAK DEMİR'], need: { day: 0, night: 0 } });
if (tm.team.members.length !== 1) fail('ekip kaydı: ' + JSON.stringify(tm));
const D5 = d1(5);
for (let i = 0; i < 4; i++) {
  const r = await apiCall(a, 'placement.auto', { date: D5 });
  if (unitOf(r.items, /BURAK/) !== `${TEAM}:night:work`) { fail('sabit üye Sorumlular’da değil: ' + unitOf(r.items, /BURAK/)); break; }
}
await apiCall(a, 'placement.counts', { date: D, counts: { 'B blok': { day: 1, night: 1 }, 'A blok': { day: 1, night: 1 }, 'C blok': { day: 0, night: 1 }, [TEAM]: { day: 0, night: 0 } } });
for (let i = 0; i < 4; i++) {
  const r = await apiCall(a, 'placement.auto', { date: D });
  if (unitOf(r.items, /BURAK/) !== `${TEAM}:24:work` || r.draws.some((x) => x.pool.some((c) => /BURAK/.test(c.name)))) { fail('ekip üyesi kuraya girdi: ' + JSON.stringify(r.draws)); break; }
  if (!r.draws.length) { fail('B fazlası kuraya gitmeliydi'); break; }
}
await apiCall(a, 'placement.counts', { date: D, counts: null });
step('Sorumlular ekibi: sabit üye her denemede ekibe yerleşti, A/B/C ve kura havuzuna girmedi');

// 9) İki yer kuralı (gündüz Sorumlular + gece blok), 3. yer / çakışan dönem reddi; gece oflama
const base5 = [one('ELİF YILMAZ', 'B blok', 'night'), one('AYŞE KAYA', 'B blok', 'day'), one('KEMAL BULUT', 'C blok', '24')];
const two = await apiCall(a, 'placement.save', { date: D5, people: [...base5, { name: 'BURAK DEMİR', segs: [{ unit: TEAM, period: 'day', status: 'work' }, { unit: 'A blok', period: 'night', status: 'work' }] }] });
const bRows = two.saved.filter((s) => /BURAK/.test(s.name));
if (bRows.length !== 2 || !bRows.some((s) => s.unit === TEAM && s.period === 'day' && !s.counted) || !bRows.some((s) => s.unit === 'A blok' && s.period === 'night' && s.counted)) fail('iki yer: ' + JSON.stringify(bRows));
// cross_before: o gün hariç sayım (o güne yerleşim kaydı olunca eski taraf kaydı yerine geçer)
const burakTotal0 = bRows[0].cross_before;
const burakTotal1 = bRows[0].cross_total;
if (burakTotal1 !== burakTotal0 + 1) fail(`gece karşı blok sayılmadı: ${burakTotal0} → ${burakTotal1}`);
const three = await apiErr(a, 'placement.save', { date: D5, people: [...base5, { name: 'BURAK DEMİR', segs: [{ unit: TEAM, period: 'day' }, { unit: 'A blok', period: 'night' }, { unit: 'C blok', period: 'night' }] }] });
const overlap = await apiErr(a, 'placement.save', { date: D5, people: [...base5, { name: 'BURAK DEMİR', segs: [{ unit: TEAM, period: '24' }, { unit: 'A blok', period: 'night' }] }] });
if (!/en fazla 2/.test(three) || !/çakışıyor/.test(overlap)) fail(`3. yer / çakışma: ${three} | ${overlap}`);
const off = await apiCall(a, 'placement.save', { date: D5, people: [...base5, { name: 'BURAK DEMİR', segs: [{ unit: TEAM, period: 'day', status: 'work' }, { unit: 'A blok', period: 'night', status: 'off' }] }] });
const offRow = off.saved.find((s) => /BURAK/.test(s.name) && s.unit === 'A blok');
if (!offRow || offRow.status !== 'off' || offRow.counted) fail('oflanan gece: ' + JSON.stringify(offRow));
const burakTotal2 = offRow.cross_total;
const burakMonth = (await apiCall(a, 'placement.month', { month })).stats.find((x) => /BURAK/.test(x.name)).total;
if (burakMonth !== burakTotal2) fail(`ay tablosu sayımı: ${burakMonth} / ${burakTotal2}`);
if (burakTotal2 !== burakTotal0) fail(`oflanan gece geçiş sayıldı: ${burakTotal2}`);
await a.goto(BASE + '#/taraf/' + D5);
await a.locator('.pl-unit[data-unit="A blok"] .pl-p.off').waitFor();
const aNight = await a.locator('.pl-unit[data-unit="A blok"] .pl-need').nth(1).innerText();
const offChip = await a.locator('.pl-unit[data-unit="A blok"] .pl-p.off').innerText();
if (!/^0\s*\/1$/.test(aNight.replace(/\s+/g, ' ').trim()) || !/Ofl\. gece/.test(offChip)) fail(`oflanan kapsama sayıldı: A gece "${aNight}", çip "${offChip}"`);
if (!(await a.locator(`.pl-unit[data-unit="${TEAM}"] .pl-p`, { hasText: 'Burak' }).count())) fail('Sorumlular kartında Burak yok');
await a.screenshot({ path: path.join(OUT, 'pl-team-off-mobile.png'), fullPage: true });
step(`iki yer: gündüz Sorumlular + gece A kabul (geçiş ${burakTotal0}→${burakTotal1}); 3. yer ve çakışan dönem reddedildi; gece oflanınca geçiş ${burakTotal2}, A gece kapsaması 0/1`);

// 10) Çağrılan (listede yokken gelen) ve nöbete gelecek kişi; "Geldi"
const D10 = d1(10);
const ayseTot0 = (await apiCall(a, 'placement.month', { month })).stats.find((x) => /AYŞE/.test(x.name)).total;
const c10 = await apiCall(a, 'placement.save', { date: D10, people: [one('ELİF YILMAZ', 'B blok', '24'), one('BURAK DEMİR', TEAM, 'day'), one('AYŞE KAYA', 'A blok', 'night'), one('Deniz Ak', 'C blok', 'day')], standby: [{ name: 'MERVE KAPLAN' }] });
const ayseC = c10.saved.find((s) => /AYŞE/.test(s.name));
const freeC = c10.saved.find((s) => /Deniz Ak/i.test(s.name));
const sb = c10.saved.find((s) => s.status === 'standby');
if (!ayseC || ayseC.status !== 'called' || !ayseC.counted) fail('çağrılan karşı taraf gece sayılmadı: ' + JSON.stringify(ayseC));
if (!freeC || freeC.status !== 'called' || freeC.counted) fail('listede olmayan çağrılan: ' + JSON.stringify(freeC));
if (!sb || !/MERVE/.test(sb.name) || sb.counted || sb.unit) fail('nöbete gelecek: ' + JSON.stringify(sb));
const ayseTot1 = (await apiCall(a, 'placement.month', { month })).stats.find((x) => /AYŞE/.test(x.name)).total;
const merveTot = (await apiCall(a, 'placement.month', { month })).stats.find((x) => /MERVE/.test(x.name)).total;
if (ayseTot1 !== ayseTot0 + 1 || merveTot !== 0) fail(`çağrılan sayımı: Ayşe ${ayseTot0}→${ayseTot1}, Merve ${merveTot}`);
const sbBad = await apiErr(a, 'placement.save', { date: D10, people: toPeople(c10.saved), standby: [{ name: 'ELİF YILMAZ' }] });
if (!/zaten yerleşik/.test(sbBad)) fail('yerleşik kişi nöbete gelecek olamaz: ' + sbBad);
await a.goto(BASE + '#/taraf/' + D10);
await a.locator('.pl-standby', { hasText: 'Merve Kaplan' }).waitFor();
if (!(await a.locator('.pl-unit[data-unit="A blok"] .pl-p.called', { hasText: 'Ayşe' }).count())) fail('çağrılan rozeti yok');
const aNight10 = (await a.locator('.pl-unit[data-unit="A blok"] .pl-need').nth(1).innerText()).replace(/\s+/g, '');
if (!/^1/.test(aNight10)) fail('çağrılan kapsamaya sayılmadı: ' + aNight10);
await a.click('[data-act=pl-edit]');
await a.click('.pl-standby [data-act=pl-sb-came]');
await a.click('.modal .pl-cper [data-p=night]');
await a.selectOption('.modal #plcUnit', 'C blok');
await a.click('.modal #plcGo');
await a.click('[data-act=pl-save]');
await a.getByText('Yerleşim kaydedildi').first().waitFor();
const c10b = await apiCall(a, 'placement.day', { date: D10 });
const merveRow = c10b.saved.find((s) => /MERVE/.test(s.name));
if (!merveRow || merveRow.status !== 'called' || merveRow.unit !== 'C blok' || merveRow.period !== 'night' || c10b.saved.some((s) => s.status === 'standby')) fail('Geldi: ' + JSON.stringify(c10b.saved));
// Arayüzden çağrılan ekleme (listede olmayan ad) ve kaldırma
await a.click('[data-act=pl-edit]');
// 4.30: ekstra kişi — gündüz ve gece ayrı bloklarda
await a.locator('[data-act=pl-call-add]').first().click();
await a.selectOption('.modal #plcSel', '__free');
await a.fill('.modal #plcFree', 'Deniz Ek');
await a.click('.modal .pl-cper [data-p=split]');
await a.selectOption('.modal #plcUnitD', 'A blok');
await a.selectOption('.modal #plcUnitN', 'C blok');
await a.click('.modal #plcGo');
await a.locator('.pl-unit[data-unit="A blok"] .pl-p.called', { hasText: 'Deniz Ek' }).waitFor();
if (!(await a.locator('.pl-unit[data-unit="C blok"] .pl-p.called', { hasText: 'Deniz Ek' }).count())) fail('ekstra kişi gece bloğunda (C) görünmedi');
await a.locator('.pl-p.ed', { hasText: 'Deniz Ek' }).first().click();
await a.click('.modal [data-rm]');
await a.click('.modal [data-ok]');
await a.locator('[data-act=pl-call-add]').first().click();
await a.selectOption('.modal #plcSel', '__free');
await a.fill('.modal #plcFree', 'Sena Yurt');
await a.click('.modal .pl-cper [data-p=day]');
await a.selectOption('.modal #plcUnit', TEAM);
await a.click('.modal #plcGo');
await a.locator(`.pl-unit[data-unit="${TEAM}"] .pl-p.called`, { hasText: 'Sena Yurt' }).waitFor();
await a.locator('.pl-p.ed', { hasText: 'Sena Yurt' }).click();
await a.click('.modal [data-rm]');
await a.click('.modal [data-ok]');
if (await a.locator('.pl-p', { hasText: 'Sena Yurt' }).count()) fail('çağrılan kaldırılamadı');
await a.click('[data-act=pl-discard]');
step(`çağrılan: Ayşe A gece (karşı taraf, sayıldı ${ayseTot0}→${ayseTot1}), listede olmayan ad sayılmadı; nöbete gelecek Merve ayrı ve sayılmadı → "Geldi" ile C gece çağrıldı; ekstra kişi gündüz A + gece C ayrı bloklara eklendi`);

// 11) Bölme ve oflama arayüzden: Elif 24 → gündüz B, gece ofl.
await a.click('[data-act=pl-edit]');
await a.locator('.pl-p.ed', { hasText: 'Elif' }).first().click();
await a.click('.modal [data-off="night"]');
await a.locator('.pl-unit[data-unit="B blok"] .pl-p.off', { hasText: 'Elif' }).waitFor();
await a.click('[data-act=pl-save]');
await a.getByText('Yerleşim kaydedildi').first().waitFor();
const elif10 = (await apiCall(a, 'placement.day', { date: D10 })).saved.filter((s) => /ELİF/.test(s.name)).map((s) => `${s.unit}:${s.period}:${s.status}`).sort().join('+');
if (elif10 !== 'B blok:day:work+B blok:night:off') fail('arayüzden oflama: ' + elif10);
step('arayüz: dönem dönem düzenleme ile 24 saatlik kişinin gecesi oflandı (gündüz B çalışıyor, gece ofl.)');

// 12) Bugün ve dün: listeye ekle, yerleştir; ana sayfa (Sorumlular, nöbete gelecek kişi), geçmiş gün
const gs = (await apiCall(a, 'gsync.get')).gs;
const today = (await apiCall(a, 'placement.today')).date; // sunucunun saat dilimine göre
const ym0 = { y: +today.slice(0, 4), m: +today.slice(5, 7) };
const ym1 = { y: nx.getFullYear(), m: nx.getMonth() + 1 };
const td = +today.slice(8, 10);
const yd = td > 1 ? td - 1 : null;
const MN = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
// e2e-features book(3) ile aynı içerik + bugünün ve dünün nöbetleri
const P1 = { 'Elif Yılmaz': { 1: '8 16', 5: '16 8', 7: '8 16', 8: '8 8', 10: '8 8', 12: '16 8', 13: '8 8' }, 'Burak Demir': { 1: '8 16', 3: '8 8', 5: '16 8', 10: '8 16', 13: '8 8' }, 'Ayşe Kaya': { 2: '8 8', 5: '8 16', 13: '8 8' }, 'Deniz Şahin': { 4: '8 8', 9: '8 8' } };
const P0 = { 'Elif Yılmaz': { 26: '8 8', 28: '8 16', 30: '8 8', [td]: '8 8' }, 'Burak Demir': { 27: '8 8', 29: '8 16', [td]: '16 8' }, 'Ayşe Kaya': { 26: '8 16' }, 'Deniz Şahin': { 25: '8 8', [td]: '8 8' } };
if (yd) { P0['Ayşe Kaya'][yd] = '8 8'; P0['Elif Yılmaz'][yd] = '8 16'; }
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
if (tday.people.length !== 3 || tday.people.some((p) => /DENİZ/.test(p.name))) fail('bugün nöbetçiler (Deniz dahil edilmemeli): ' + JSON.stringify(tday.people.map((p) => p.name)));
await m.goto(BASE + '#/');
await m.reload();
await m.locator('.home-ext-bloklar .pl-home').waitFor();
if (!/henüz yapılmadı/.test(await m.locator('.home-ext-bloklar').innerText())) fail('ana sayfa: kayıtsız durum yazısı yok');
if (await m.locator('.home-ext-bloklar a[href^="#/taraf/"].btn, .home-ext-bloklar [data-act=pl-share-home]').count()) fail('üyede Yerleştir/Paylaş düğmesi olmamalı');
const ta = await apiCall(a, 'placement.auto', { date: today });
if (unitOf(ta.items, /BURAK/) !== `${TEAM}:night:work`) fail('bugün Burak Sorumlular’da olmalı: ' + unitOf(ta.items, /BURAK/));
await apiCall(a, 'placement.save', { date: today, people: ta.items.map((x) => ({ name: x.name, segs: x.segs })), standby: [{ name: 'AYŞE KAYA' }] });
const elifUnit = ta.items.find((x) => /ELİF/.test(x.name)).segs[0].unit;
await m.reload();
await m.locator('.home-ext-bloklar .pl-hu').first().waitFor();
const card = await m.locator('.home-ext-bloklar').innerText();
if (!/Elif Yılmaz\s*\(\d+\)/.test(card) || !/Kemal Bulut\s*\(\d+\)/.test(card) || !card.includes('Siz: ' + elifUnit) || !/SORUMLULAR[\s\S]*Burak Demir/i.test(card) || !/Nöbete gelecek kişi[\s\S]*Ayşe Kaya/.test(card)) fail('ana sayfa kartı: ' + card);
if (/Deniz Şahin/.test(card)) fail('ana sayfada dahil edilmeyen kişi');
const myb = await m.evaluate((t) => (typeof S !== 'undefined' && S.my_blocks ? S.my_blocks[t] : 'yok'), today);
if (myb !== elifUnit) fail('S.my_blocks bugünü göstermiyor: ' + myb);
if (await overflow(m) > 390) fail('ana sayfa mobil taşma: ' + await overflow(m));
await m.locator('.home-ext-bloklar').screenshot({ path: path.join(OUT, 'pl-home-card.png') });
const yDate = `${ym0.y}-${p2(ym0.m)}-${p2(yd || td)}`;
if (yd) {
  const ya = await apiCall(a, 'placement.auto', { date: yDate });
  await apiCall(a, 'placement.save', { date: yDate, people: ya.items.map((x) => ({ name: x.name, segs: x.segs })) });
  await m.click('.home-ext-bloklar a.pl-hist');
  await m.waitForFunction((d) => typeof PL !== 'undefined' && PL.day && PL.day.date === d, yDate);
  await m.locator('.pl-unit .pl-p', { hasText: 'Ayşe Kaya' }).waitFor();
  const yTxt = await m.locator('#plDay').innerText();
  if (!/Kaydedildi/.test(yTxt) || !/Geçmiş/.test(yTxt)) fail('üye geçmiş günü göremedi: ' + yTxt.slice(0, 300));
  if (await m.locator('[data-act=pl-auto], .pl-p.ed, [data-act=pl-share]').count()) fail('üye geçmiş günde düzenleme/paylaş görüyor');
}
step(`bugün: Burak Sorumlular’da, nöbete gelecek Ayşe ana sayfada ayrı; Siz: ${elifUnit}; S.my_blocks; üye geçmiş günü (${yDate}) salt okunur gördü`);

// 13) Paylaşım: PNG görsel ve metin (yalnız sorumlular)
await a.goto(BASE + '#/taraf/' + today);
await a.locator('[data-act=pl-share]').waitFor();
const img = await a.evaluate(async (d) => { const b = await plShareImage(d); const bmp = await createImageBitmap(b); return { type: b.type, size: b.size, w: bmp.width, h: bmp.height }; }, today);
if (img.type !== 'image/png' || img.w !== 2160 || img.h < 900 || img.h > 6000 || img.size < 20000) fail('paylaşım görseli: ' + JSON.stringify(img));
const txt = await a.evaluate((d) => plShareText(d), today);
if (!/^\*Blok yerleşimi · /.test(txt) || !/\*Sorumlular\*: Burak D\. \(\d+\)/.test(txt) || !/_\(Nöbete gelecek kişi\)_: Ayşe K\./.test(txt) || !/\*B blok\* \(3\. Basamak\)/.test(txt)) fail('paylaşım metni: ' + txt);
const txt10 = await a.evaluate((d) => plShareText(d), D10);
if (!/Ayşe K\. \(\d+\) \(çağrıldı\)/.test(txt10) || !/~Elif Y\.~ \(\d+\) \(ofl\. gece\)/.test(txt10)) fail('paylaşım metni (çağrılan/ofl.): ' + txt10);
await a.click('[data-act=pl-share]');
await a.locator('.modal .pl-share-prev img').waitFor();
const nat = await a.locator('.modal .pl-share-prev img').evaluate((i) => i.naturalWidth);
if (nat !== 2160) fail('önizleme genişliği: ' + nat);
const imgBuf = await a.evaluate(async (d) => { const b = await plShareImage(d); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); }, D10);
(await import('node:fs')).writeFileSync(path.join(OUT, 'pl-share-' + D10 + '.png'), Buffer.from(imgBuf, 'base64'));
await a.locator('.modal [data-act=close-modal]').first().click();
const mShare = await m.evaluate(() => document.querySelectorAll('[data-act=pl-share],[data-act=pl-share-home]').length);
if (mShare) fail('üye paylaş düğmesi görüyor');
step(`paylaşım: PNG ${img.w}×${img.h} (${Math.round(img.size / 1024)} KB), metin "${txt.split('\n')[0]}" · çağrılan/ofl. rozetleri · üyede düğme yok`);

// 13b) Sebepsiz nöbetten çıkarma ve etiketsiz (sebepsiz) ekstra kişi
const burak5 = { name: 'BURAK DEMİR', segs: [{ unit: TEAM, period: 'day', status: 'work' }, { unit: 'A blok', period: 'night', status: 'work' }] };
const rm5 = await apiCall(a, 'placement.save', { date: D5, people: [one('ELİF YILMAZ', 'B blok', 'night'), one('AYŞE KAYA', 'B blok', 'day'), { name: 'KEMAL BULUT', removed: true }, burak5, { ...one('Deniz Ak', 'C blok', 'night'), plain: true }] });
const kRow = rm5.saved.find((s) => /KEMAL/.test(s.name));
const dRow = rm5.saved.find((s) => /Deniz Ak/i.test(s.name));
if (!kRow || kRow.status !== 'removed' || kRow.counted || kRow.unit) fail('nöbetten çıkarılan satır: ' + JSON.stringify(kRow));
if (!dRow || dRow.status !== 'called' || !dRow.plain || dRow.why) fail('etiketsiz ekstra satır: ' + JSON.stringify(dRow));
if (rm5.stale.length) fail('çıkarılan kişi "yerleştirilmedi" uyarısı verdi: ' + JSON.stringify(rm5.stale));
const rmBad = await apiErr(a, 'placement.save', { date: D5, people: [...toPeople(rm5.saved.filter((s) => s.status !== 'removed')), { name: 'MERVE KAPLAN', removed: true }] });
if (!/listede nöbetçi değil/.test(rmBad)) fail('listede olmayanı nöbetten çıkarma: ' + rmBad);
const rmDup = await apiErr(a, 'placement.save', { date: D5, people: [one('ELİF YILMAZ', 'B blok', 'night'), one('AYŞE KAYA', 'B blok', 'day'), one('KEMAL BULUT', 'C blok', '24'), { name: 'KEMAL BULUT', removed: true }, burak5] });
if (!/iki kez/.test(rmDup)) fail('hem yerleşik hem çıkarılmış: ' + rmDup);
for (let i = 0; i < 3; i++) {
  const r = await apiCall(a, 'placement.auto', { date: D5, keep: [{ name: 'KEMAL BULUT', removed: true }] });
  if (r.items.some((x) => /KEMAL/.test(x.name)) || r.draws.some((x) => x.pool.some((c) => /KEMAL/.test(c.name)))) { fail('çıkarılan kişi otomatik dağıtıma girdi'); break; }
}
const mo5 = await apiCall(a, 'placement.month', { month });
if (Object.keys(mo5.placed[D5] || {}).some((k) => /kemal/i.test(k))) fail('çıkarılan kişi ay tablosunda: ' + JSON.stringify(mo5.placed[D5]));
const mdx = mo5.placed[D5] && Object.entries(mo5.placed[D5]).find(([k]) => /deniz ak/i.test(k));
if (mdx && mdx[1].st === 'called') fail('etiketsiz ekstra ay tablosunda "çağrıldı": ' + JSON.stringify(mdx));
await a.goto(BASE + '#/taraf/' + D5);
await a.locator('.pl-removed', { hasText: 'Kemal' }).waitFor();
const dChip = a.locator('.pl-unit[data-unit="C blok"] .pl-p', { hasText: 'Deniz' });
if (!(await dChip.count()) || /Çağrıldı/.test(await dChip.innerText()) || await a.locator('.pl-unit[data-unit="C blok"] .pl-p.called', { hasText: 'Deniz' }).count()) fail('etiketsiz ekstra çipinde Çağrıldı var');
if (await a.locator('.pl-unit .pl-p', { hasText: 'Kemal' }).count()) fail('çıkarılan kişi blokta görünüyor');
if (await a.locator('.pl-warn', { hasText: 'Kemal' }).count()) fail('çıkarılan kişi uyarıda');
// Arayüz: Ayşe'yi sebepsiz çıkar, kaydet; sonra Kemal'i geri al ve sebepsiz ekstra ekle
await a.click('[data-act=pl-edit]');
await a.click('.pl-unit[data-unit="B blok"] .pl-p.ed:has-text("Ayşe")');
await a.click('.modal [data-out]');
await a.click('.modal [data-ok]');
await a.locator('.pl-removed', { hasText: 'Ayşe' }).waitFor();
await a.click('[data-act=pl-save]');
await a.getByText('Yerleşim kaydedildi').first().waitFor();
const rm5b = await apiCall(a, 'placement.day', { date: D5 });
if (rm5b.saved.find((s) => /AYŞE/.test(s.name)).status !== 'removed') fail('arayüzden nöbetten çıkarma kaydedilmedi');
await a.click('[data-act=pl-edit]');
await a.click('.pl-removed .pl-p:has-text("Kemal") [data-act=pl-rm-undo]');
await a.locator('.pl-unit .pl-p', { hasText: 'Kemal' }).waitFor();
await a.click('[data-act=pl-call-add]');
await a.selectOption('.modal #plcSel', '__free');
await a.fill('.modal #plcFree', 'Selin Er');
await a.click('.modal .pl-ctag [data-t=plain]');
await a.click('.modal .pl-cper [data-p=day]');
await a.selectOption('.modal #plcUnit', 'A blok');
await a.click('.modal #plcGo');
await a.screenshot({ path: path.join(OUT, 'pl-removed-mobile.png'), fullPage: true });
await a.click('[data-act=pl-save]');
await a.getByText('Yerleşim kaydedildi').first().waitFor();
const rm5c = await apiCall(a, 'placement.day', { date: D5 });
const kc = rm5c.saved.find((s) => /KEMAL/.test(s.name));
const sc = rm5c.saved.find((s) => /Selin Er/i.test(s.name));
if (!kc || kc.status !== 'work' || !kc.unit) fail('geri alınan kişi yerleşmedi: ' + JSON.stringify(kc));
if (!sc || sc.status !== 'called' || !sc.plain || sc.unit !== 'A blok' || sc.period !== 'day') fail('arayüzden etiketsiz ekstra: ' + JSON.stringify(sc));
if (!rm5c.saved.some((s) => /AYŞE/.test(s.name) && s.status === 'removed')) fail('kayıtta Ayşe çıkarılmış kalmalıydı');
const txt5 = await a.evaluate((d) => plShareText(d), D5);
if (/Ayşe/.test(txt5) || /Selin E\. \(\d+\) \(çağrıldı\)/.test(txt5) || !/Selin E\./.test(txt5)) fail('paylaşım metni (çıkarılan / etiketsiz): ' + txt5);
const md5 = await apiCall(m, 'placement.day', { date: D5 });
if (md5.saved.some((s) => s.status === 'removed' && s.why)) fail('üye çıkarma sebebi görüyor');
await apiCall(a, 'placement.save', { date: D5, people: [...base5, burak5] });
step('sebepsiz nöbetten çıkarma (sayılmaz, blokta/ay tablosunda/paylaşımda yok, uyarı yok, dağıtıma girmez, geri alınır) ve etiketsiz ekstra (Çağrıldı etiketi yok) · API + arayüz');

// 14) Üye görünümü (salt okunur) ve masaüstü
await m.goto(BASE + '#/taraf/' + D);
await m.locator('.pl-unit[data-unit="A blok"]').waitFor();
if (await m.locator('[data-act=pl-auto], [data-act=pl-save], [data-act=pl-share], .pl-p.ed').count()) fail('üye düzenleme düğmeleri görüyor');
await m.locator('.pl-tbl').waitFor();
await m.locator('.tr-mx td.tr-moved').first().waitFor();
if (await m.locator('.pl-tbl', { hasText: 'Deniz Şahin' }).count() || await m.locator('.tr-mx', { hasText: 'Deniz Şahin' }).count()) fail('dahil edilmeyen kişi tabloda/matriste');
if (await overflow(m) > 390) fail('taraf sayfası (üye) mobil taşma: ' + await overflow(m));
await m.screenshot({ path: path.join(OUT, 'pl-member-mobile.png'), fullPage: true });
await m.click('.pl-tbl thead [data-k=name]');
const names = await m.locator('.pl-tbl tbody tr .pl-tn .ellipsis').allInnerTexts();
if (JSON.stringify(names) !== JSON.stringify([...names].sort((x, y) => key(x).localeCompare(key(y), 'tr')))) fail('ada göre sıralama: ' + names.join(','));
await m.click('[data-act=tr-mv][data-d="-1"]');
await m.locator('.pl-mnav b', { hasText: String(ym0.y) }).waitFor();
const D2 = await m.evaluate(() => PL.date);
if (D2.slice(0, 7) !== today.slice(0, 7)) fail('önceki ay: ' + D2);
await m.click('[data-act=pl-go][data-d="1"]');
await m.waitForFunction((d) => PL.day && PL.day.date !== d, D2);
await m.goto(BASE + '#/taraf/' + D10);
await m.locator('.pl-standby, .pl-unit').first().waitFor();
if (await overflow(m) > 390) fail('10. gün (üye) mobil taşma: ' + await overflow(m));
await m.screenshot({ path: path.join(OUT, 'pl-member-d10-mobile.png'), fullPage: true });
step(`üye görünümü: salt okunur, tablo/matris (dahil edilmeyen yok), sıralama, ay/gün gezinme, taşma yok`);

const DK = await ctx('admin-desktop', false);
await login(DK.p, 'ayse@test.com', 'Sifre1234');
await DK.p.goto(BASE + '#/taraf/' + D5);
await DK.p.locator('.pl-unit').first().waitFor();
await DK.p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await DK.p.waitForTimeout(400);
await DK.p.screenshot({ path: path.join(OUT, 'pl-desktop-dark.png'), fullPage: true });
const aud = await apiCall(DK.p, 'audit.list', {}).catch(() => null);
if (aud && aud.items && !['placement.save', 'placement.team'].every((k) => aud.items.some((x) => x.action === k))) fail('işlem günlüğünde blok kaydı / ekip yok');
await apiCall(a, 'rules.excluded.save', { name: 'DENİZ ŞAHİN', on: false });
step('masaüstü (koyu tema) ekran görüntüsü, işlem günlüğü');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nBLOK YERLEŞİMİ TESTLERİ GEÇTİ');
