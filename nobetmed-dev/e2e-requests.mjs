// Nöbet istekleri modülünün uçtan uca testi. e2e.mjs + e2e-features.mjs'den SONRA aynı sitede çalışır:
//   node e2e-requests.mjs http://localhost:8230/ <çıktı klasörü> <site klasörü>
// e2e-features.mjs'in kurduğu 3./2. basamak listelerini (sonraki ay) ve tarafları (s3, s2) kullanır. Adlar uydurmadır.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8230/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'REQ-FAIL.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.locator('#view').waitFor();
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' }).trim();
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth);
const go = async (p, h) => { if (p.url() === BASE + h) await p.reload(); else await p.goto(BASE + h); };
const notifs = async (p) => (await apiCall(p, 'notif.list')).items;

const p2 = (n) => String(n).padStart(2, '0');
const now = new Date();
const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const YM = `${nx.getFullYear()}-${p2(nx.getMonth() + 1)}`;
const MON = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][nx.getMonth()];
const d1 = (d) => `${YM}-${p2(d)}`;
const ymdOf = (dt) => `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
const dayOff = (n) => ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));

const A = await ctx('admin');
const a = A.p;
await login(a, 'ayse@test.com', 'Sifre1234');
const M = await ctx('elif', true);
const m = M.p;
await login(m, 'elif@test.com', 'YeniSifre99');
const B = await ctx('burak');
const b = B.p;
await login(b, 'burak@test.com', 'Sifre1234');

// 0) Gereken nöbetçi sayıları: her blok gündüz 1 + gece 1 → 3. basamak (B blok) günde 2 kişi
await apiCall(a, 'rules.needs.save', { needs: { 'B blok': { weekday: { day: 1, night: 1 }, weekend: { day: 1, night: 1 } }, 'A blok': { weekday: { day: 1, night: 1 }, weekend: { day: 1, night: 1 } }, 'C blok': { weekday: { day: 1, night: 0 }, weekend: { day: 0, night: 0 } } } });
const sides = (await apiCall(a, 'side.get', { month: YM })).sides;
if (sides.length !== 2) fail('taraflar (e2e-features) bulunamadı: ' + sides.length);
const r3 = sides.find((s) => s.key === 's3').roster_id;

// 1) Boş durum + yayıncı sonraki ayı açar (arayüzden)
await go(m, '#/istekler');
await expectText(m, 'Açık istek dönemi yok');
if (await m.locator('[data-act=rq-new]').count()) fail('üyede "Dönem aç" düğmesi var');
if (!/Bu işlem için sorumlu yetkisi/.test(await apiErr(m, 'req.period.save', { ym: YM, deadline: dayOff(3) }))) fail('üye dönem açabildi');
await go(a, '#/istekler');
await a.click('.page-head [data-act=rq-new]');
await a.locator('#rqPerForm').waitFor();
if ((await a.inputValue('#rqPerForm [name=ym]')) !== YM) fail('varsayılan ay sonraki ay değil');
await a.fill('#rqPerForm [name=deadline]', dayOff(1));
await a.fill('#rqPerForm [name=note]', 'Yılbaşı haftası için en fazla 2 gün boşluk yazın.');
await a.click('.modal button[type=submit]');
await expectText(a, 'Dönem açıldı');
await a.locator('.rq-per').waitFor();
const per = (await apiCall(a, 'req.periods')).periods[0];
if (!per || per.ym !== YM || !per.open || per.deadline !== dayOff(1)) fail('dönem: ' + JSON.stringify(per));
const PID = per.id;
const dup = await apiErr(a, 'req.period.save', { ym: YM, deadline: dayOff(2), roster_id: r3 });
if (!/zaten/.test(dup)) fail('çakışan dönem açıldı: ' + dup);
const openN = (await notifs(m)).find((n) => /nöbet istekleri açıldı · son gün/.test(n.title));
if (!openN || !openN.title.startsWith(MON)) fail('açılış bildirimi: ' + JSON.stringify(openN));
step(`yayıncı ${MON} ayını açtı (son gün ${dayOff(1)}), herkese bildirim: "${openN && openN.title}"`);

// 2) Metin çözümleyici
const parsed = await m.evaluate((ym) => {
  const f = (t) => { const r = rqParse(t, ym); return Object.entries(r.map).map(([d, k]) => (d.slice(0, 7) === ym ? +d.slice(8) : d) + (k === 'izin' ? 'i' : 'b')).join(',') + (r.warn.length ? ' !' + r.warn.length : ''); };
  // Aydan aya: önceki ayın son günleri – bu ayın ilk günleri (ör. 28 Aralık – 2 Ocak)
  const MN = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
  const pm = +ym.slice(5, 7), prevM = pm === 1 ? 12 : pm - 1, prevY = pm === 1 ? +ym.slice(0, 4) - 1 : +ym.slice(0, 4);
  const pl = new Date(prevY, prevM, 0).getDate();
  const pds = (d) => `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return {
    a: f('2,3,4 boşluk; 6,7 boşluk; 15-19 yıllık izin'), b: f('15,19 arası yıllık izin'), c: f('2 3 4 bos'), d: f('boşluk 2,3 izin 20-21'),
    e: f('5 YI'), f: f('8, 9'), g: f('40 boş'), h: f('10 ile 12 arası izin'), i: f("12'den 14'e kadar boş"),
    j: f(`${pl - 1} ${MN[prevM - 1]} - 2 ${MN[pm - 1]} yıllık izin`), k: f(`${pl}.${prevM}-1.${pm} boş`), l: f(`${pl - 20} ${MN[prevM - 1]} boş`),
    jw: [pds(pl - 1), pds(pl)].map((d) => d + 'i').concat(['1i', '2i']).join(','), kw: [pds(pl) + 'b', '1b'].join(','),
  };
}, YM);
const want = { a: '2b,3b,4b,6b,7b,15i,16i,17i,18i,19i', b: '15i,16i,17i,18i,19i', c: '2b,3b,4b', d: '2b,3b,20i,21i', e: '5i', f: '8b,9b !1', g: ' !1', h: '10i,11i,12i', i: '12b,13b,14b', j: parsed.jw, k: parsed.kw, l: ' !1' };
const bad = Object.keys(want).filter((k) => parsed[k] !== want[k]);
if (bad.length) fail('metin çözümleme: ' + bad.map((k) => `${k}: ${parsed[k]} ≠ ${want[k]}`).join(' | '));
step('metin çözümleme: "2,3,4 boşluk; 15-19 yıllık izin", "15,19 arası", "2 3 4 bos", önek/sonek, aralık, uyarılar; aydan aya "30 kasım - 2 aralık", "30.11-1.12" (en fazla 7 gün öncesi)');

// 3) Üye (telefon): yazarak + takvimde dokunarak
await go(m, '#/');
await m.locator('.home-ext-istekler .rq-home').waitFor({ timeout: 8000 }).catch(() => fail('ana sayfa istek kartı yok'));
const homeTxt = await m.locator('.home-ext-istekler').innerText().catch(() => '');
if (!/istekleri açık/.test(homeTxt) || !/henüz isteğin yok/.test(homeTxt)) fail('ana sayfa kartı: ' + homeTxt);
await m.click('.home-ext-istekler a.btn');
await m.locator('#rqTxt').waitFor();
if (!/3\. Basamak/.test(await m.locator('#rqRost').innerText())) fail('liste adından bulunamadı: ' + await m.locator('#rqRost').innerText());
await m.fill('#rqTxt', '2,3,4 boşluk; 15-19 yıllık izin');
const prevTxt = await m.locator('#rqPrev').innerText();
if (!/2, 3, 4/.test(prevTxt) || !/15, 16, 17, 18, 19/.test(prevTxt) || !/8 gün/.test(prevTxt)) fail('önizleme: ' + prevTxt);
if ((await m.locator('.rq-d.pv').count()) !== 8) fail('takvim önizlemesi: ' + await m.locator('.rq-d.pv').count());
await m.click('#rqApply');
await m.click(`.rq-d[data-d="${d1(10)}"]`);
await m.click(`.rq-d[data-d="${d1(11)}"]`); await m.click(`.rq-d[data-d="${d1(11)}"]`);
for (let k = 0; k < 3; k++) await m.click(`.rq-d[data-d="${d1(12)}"]`);
const cls10 = await m.getAttribute(`.rq-d[data-d="${d1(10)}"]`, 'class'), cls11 = await m.getAttribute(`.rq-d[data-d="${d1(11)}"]`, 'class'), cls12 = await m.getAttribute(`.rq-d[data-d="${d1(12)}"]`, 'class');
if (!/k-bosluk/.test(cls10) || !/k-izin/.test(cls11) || /k-/.test(cls12)) fail(`dokunma döngüsü: ${cls10} | ${cls11} | ${cls12}`);
await m.locator('.rq-note').first().fill('Aile ziyareti');
await m.screenshot({ path: path.join(OUT, 'req-m-entry.png'), fullPage: true });
if (!/10 kaydedilmemiş/.test(await m.locator('#rqSave').innerText())) fail('kaydet çubuğu: ' + await m.locator('#rqSave').innerText());
await m.click('#rqSaveBtn');
await expectText(m, 'Kaydedildi');
const mine = await apiCall(m, 'req.mine', { period_id: PID });
const mineS = mine.items.map((x) => rqd(x)).join(',');
function rqd(x) { return +x.date.slice(8) + (x.kind === 'izin' ? 'i' : 'b'); }
if (mineS !== '2b,3b,4b,10b,11i,15i,16i,17i,18i,19i' || mine.items[0].note !== 'Aile ziyareti' || mine.items.some((x) => x.status !== 'pending')) fail('kaydedilen: ' + mineS + ' ' + JSON.stringify(mine.items[0]));
if (mine.roster.id !== r3 || !mine.roster.auto) fail('liste otomatik bulunamadı: ' + JSON.stringify(mine.roster));
if (await m.locator('#rqSave:not(.hidden)').count()) fail('kayıttan sonra kaydet çubuğu kaldı');
const ow1 = await overflow(m);
if (ow1 > 390) fail('İsteklerim telefonda yatay taşma: ' + ow1);
await m.screenshot({ path: path.join(OUT, 'req-m-mine.png'), fullPage: true });
// Doğrulama: ay dışı tarih, geçersiz tür, başkası adına
if (!/içinde olmalı/.test(await apiErr(m, 'req.save', { period_id: PID, items: [{ date: ymdOf(new Date(+YM.slice(0, 4), +YM.slice(5, 7) - 1, -19)), kind: 'bosluk' }] }))) fail('ay dışı (7 günden uzak) tarih kabul edildi');
if (!/yalnızca Boşluk/.test(await apiErr(m, 'req.save', { period_id: PID, items: [{ date: d1(5), kind: 'rapor' }] }))) fail('geçersiz tür kabul edildi');
if (!/sorumlular/.test(await apiErr(m, 'req.save', { period_id: PID, name: 'Burak Demir', items: [{ date: d1(5), kind: 'bosluk' }] }))) fail('üye başkası adına istek girdi');
if (!/sorumlu yetkisi/.test(await apiErr(m, 'req.panel', { period_id: PID }))) fail('üye paneli açabildi');
step(`üye (telefon): yazarak 8 gün + dokunarak 2 gün (döngü B → Yİ → yok), not, liste adından bulundu, kayıt: ${mineS}`);

// 4) Hatırlatma: son günden ≤2 gün önce, isteği olmayanlara bir kez
const nb0 = (await notifs(b)).filter((n) => /nöbet istekleri ·/.test(n.title)).length;
console.log('  cron:', cron());
const nb1 = (await notifs(b)).filter((n) => /nöbet istekleri ·/.test(n.title));
const ne1 = (await notifs(m)).filter((n) => /nöbet istekleri ·/.test(n.title)).length;
cron();
const nb2 = (await notifs(b)).filter((n) => /nöbet istekleri ·/.test(n.title)).length;
if (nb1.length !== nb0 + 1 || nb2 !== nb1.length || ne1 !== 0) fail(`hatırlatma: Burak ${nb0}→${nb1.length}→${nb2}, Elif ${ne1}`);
step('hatırlatma: isteği olmayan Burak’a bir kez (“' + (nb1[0] || {}).title + '”), isteği olan Elif’e yok');

// 5) Diğer istekler: Burak (kendisi), yönetici (kendisi) ve hesabı olmayan Deniz adına (arayüzden)
await apiCall(b, 'req.save', { period_id: PID, items: [{ date: d1(3), kind: 'bosluk' }, { date: d1(25), kind: 'bosluk' }] });
await apiCall(a, 'req.save', { period_id: PID, items: [{ date: d1(2), kind: 'bosluk' }, { date: d1(25), kind: 'bosluk' }] });
await go(a, '#/istekler');
await a.locator('[data-change=rq-target]').waitFor();
const denizOpt = await a.locator('[data-change=rq-target] option', { hasText: 'Deniz Şahin' }).getAttribute('value');
if (!denizOpt) fail('başkası adına listesinde Deniz yok');
await a.selectOption('[data-change=rq-target]', denizOpt);
await a.locator(`.rq-d[data-d="${d1(25)}"]`).waitFor();
await expectText(a, 'Deniz Şahin — istekler');
await a.click(`.rq-d[data-d="${d1(25)}"]`);
await a.click(`.rq-d[data-d="${d1(26)}"]`);
await a.click('#rqSaveBtn');
await expectText(a, 'Kaydedildi');
const dz = await apiCall(a, 'req.mine', { period_id: PID, name: denizOpt });
if (dz.items.length !== 2 || dz.target.user_id !== 0) fail('Deniz adına: ' + JSON.stringify(dz.items) + ' ' + JSON.stringify(dz.target));
step('yönetici hesabı olmayan Deniz Şahin adına takvimden 2 gün girdi; Burak ve yönetici kendi isteklerini girdi');

// 6) Son gün: üyeler değiştiremez, yayıncı düzeltebilir; görev dönemi kapatır; yeniden açma
await apiCall(a, 'req.period.save', { id: PID, ym: YM, roster_id: null, deadline: dayOff(-1), note: per.note, status: 'open' });
const late = await apiErr(m, 'req.save', { period_id: PID, items: [] });
if (!/süresi doldu/.test(late)) fail('son gün sonrası üye kaydetti: ' + late);
if (!/süresi doldu/.test(await apiErr(m, 'req.delete', { id: mine.items[0].id }))) fail('son gün sonrası üye sildi');
const pubFix = await apiCall(a, 'req.save', { period_id: PID, name: 'Elif Yılmaz', items: mine.items.map((x) => ({ date: x.date, kind: x.kind, note: x.note || '' })) });
if (pubFix.items.length !== 10) fail('yayıncı düzeltmesi: ' + pubFix.items.length);
await go(m, '#/istekler');
await expectText(m, 'süresi doldu');
if (await m.locator('#rqTxt').count() || !(await m.locator(`.rq-d[data-d="${d1(2)}"]`).isDisabled())) fail('süre dolunca giriş alanları açık');
cron();
const closed = (await apiCall(a, 'req.periods')).periods.find((x) => x.id === PID);
if (closed.status !== 'closed') fail('görev dönemi kapatmadı: ' + closed.status);
if (!(await notifs(a)).some((n) => /istekleri kapandı/.test(n.title))) fail('kapanış özeti yayıncıya gitmedi');
await apiCall(a, 'req.period.save', { id: PID, ym: YM, roster_id: null, deadline: dayOff(5), note: per.note, status: 'open' });
if (!(await notifs(m)).some((n) => /yeniden açıldı/.test(n.title))) fail('yeniden açılış bildirimi yok');
await apiCall(m, 'req.save', { period_id: PID, items: mine.items.map((x) => ({ date: x.date, kind: x.kind, note: x.note || '' })) });
step('son gün: üye kaydedemedi/silemedi, yayıncı düzeltti, görev dönemi kapattı (özet bildirimi), yeniden açıldı ve üye tekrar kaydetti');

// 7) Panel: ısı haritası sayıları, yığılma, kura
await go(a, '#/istekler/yonetim');
await a.locator('#rqHeat .rq-h[data-d]').first().waitFor();
const cell = async (d) => ({ c: (await a.locator(`#rqHeat .rq-h[data-d="${d1(d)}"] .rh-c`).innerText()).trim(), cls: await a.getAttribute(`#rqHeat .rq-h[data-d="${d1(d)}"]`, 'class') });
const h2 = await cell(2), h25 = await cell(25), h15 = await cell(15), h6 = await cell(6);
if (h2.c !== '2' || !/lv-tight/.test(h2.cls)) fail('ısı 2. gün: ' + JSON.stringify(h2));
if (h25.c !== '3' || !/lv-over/.test(h25.cls) || !/draw/.test(h25.cls)) fail('ısı 25. gün: ' + JSON.stringify(h25));
if (h15.c !== '1' || h6.c !== '' || !/lv-ok/.test(h6.cls)) fail('ısı 15/6. gün: ' + JSON.stringify([h15, h6]));
const panel = await apiCall(a, 'req.panel', { period_id: PID });
const s3 = panel.sides.find((s) => s.key === 's3');
const p25 = s3.days[24];
if (s3.people !== 4 || p25.avail !== 1 || p25.need_n !== 2 || p25.excess !== 1 || !p25.need_draw || p25.order.filter((o) => o.tie).length !== 3) fail('panel 25. gün: ' + JSON.stringify({ people: s3.people, ...p25 }));
const pile = await a.locator('#rqPile .rq-pile').first().innerText();
if (!/^25/.test(pile.trim())) fail('yığılma listesi ilk gün: ' + pile);
const elifRow = panel.people.find((p) => /Elif/.test(p.name));
if (!elifRow || elifRow.n !== 10 || elifRow.b !== 4 || elifRow.i !== 6) fail('kişi tablosu Elif: ' + JSON.stringify(elifRow));
if ((await a.locator('#rqPeople tbody tr').count()) !== 4) fail('kişi tablosu satır sayısı');
await a.click(`#rqHeat .rq-h[data-d="${d1(25)}"]`);
await a.locator('#rqDay [data-act=rq-draw]').click();
await a.locator('.modal [data-ok]').click();
await expectText(a, 'Kura:');
await a.locator('#rqDay .badge', { hasText: 'Kurayla ret önerisi' }).waitFor();
const pd = await apiCall(a, 'req.panel', { period_id: PID });
const p25b = pd.sides.find((s) => s.key === 's3').days[24];
if (pd.draws.length !== 1 || p25b.need_draw || p25b.order.filter((o) => o.suggest).length !== 1) fail('kura kaydı: ' + JSON.stringify(pd.draws) + JSON.stringify(p25b.order));
if (!/Bu gün için kura gerekmiyor/.test(await apiErr(a, 'req.draw', { period_id: PID, date: d1(25), side: 's3' }))) fail('kura ikinci kez çekildi');
await a.screenshot({ path: path.join(OUT, 'req-d-panel.png'), fullPage: true });
step(`panel: 3. basamak 4 kişi, gereken 2; 2. gün sarı (2 istek), 25. gün kırmızı (3 istek, müsait 1, 1 ret önerisi), eşitlikte kura → ${pd.draws[0].picked.join(', ')}`);

// 8) Ret (gerekçeli): yalnız kişi ve yayıncı görür
await a.click(`#rqHeat .rq-h[data-d="${d1(2)}"]`);
await a.locator('#rqDay .rq-o', { hasText: 'Elif' }).locator('input').check();
await a.click('#rqDay [data-act=rq-dec][data-s=rejected]');
await a.fill('.modal [name=v]', 'Servis o gün yoğun');
await a.click('.modal [data-ok]');
await expectText(a, '1 istek reddedildi');
const REASON = 'Servis o gün yoğun';
const mine2 = await apiCall(m, 'req.mine', { period_id: PID });
const rj = mine2.items.find((x) => x.date === d1(2));
if (rj.status !== 'rejected' || rj.reason !== REASON) fail('Elif ret gerekçesini görmüyor: ' + JSON.stringify(rj));
const elN = (await notifs(m)).find((n) => /isteğiniz reddedildi/.test(n.title));
if (!elN || !elN.body.includes(REASON)) fail('ret bildirimi: ' + JSON.stringify(elN));
const boardB = await apiCall(b, 'req.board', { period_id: PID });
const bj = JSON.stringify(boardB);
if (bj.includes(REASON) || bj.includes('Aile ziyareti') || /"reason"/.test(bj)) fail('panoda gerekçe/not sızıyor');
const elifB = boardB.people.find((p) => /Elif/.test(p.name));
if (!elifB || elifB.items.find((x) => x.date === d1(2)).status !== 'rejected') fail('panoda durum yok');
if ((await notifs(b)).some((n) => (n.body || '').includes(REASON))) fail('gerekçe başkasına bildirildi');
await go(m, '#/istekler');
await expectText(m, 'Gerekçe:');
await expectText(m, REASON);
step('ret: Elif gerekçeyi uygulamada ve bildirimde görüyor; Burak’ın panosunda gerekçe/not yok, durum görünüyor');

// 9) Pano (başka üye): kişi listesi çipleri ve takvim
await go(b, '#/istekler/pano');
await b.locator('.rq-brow').first().waitFor();
const elifRowTxt = await b.locator('.rq-brow', { hasText: 'Elif' }).innerText();
// Günler açıkça yazılır: “2, 3, 4 B” (3-4 diye okunmasın)
const flat = elifRowTxt.replace(/\s+/g, '');
if (!/2,3,4/.test(flat) && !/3,4/.test(flat)) fail('pano çipleri: ' + elifRowTxt);
if (!/15,16,17,18,19Yİ/.test(flat) || !/10B/.test(flat)) fail('pano çipleri (Yİ/B): ' + elifRowTxt);
if ((await b.locator('body').innerText()).includes(REASON)) fail('Burak ekranında gerekçe görünüyor');
await b.click('[data-act=rq-bview][data-v=takvim]');
await b.locator(`.rq-bd[data-d="${d1(25)}"]`).click();
const d25 = await b.locator('.cal-wrap .card').nth(1).innerText();
if ((await b.locator(`.rq-bd[data-d="${d1(25)}"] .cd-c`).innerText()) !== '3' || !/Deniz Şahin/.test(d25) || !/Ayşe Kaya/.test(d25)) fail('pano takvim 25. gün: ' + d25);
await b.screenshot({ path: path.join(OUT, 'req-d-board.png'), fullPage: true });
step('pano (Burak): kişi çipleri “2, 3, 4 B · 15, 16, 17, 18, 19 Yİ”, takvimde 25. gün 3 kişi');

// 10) Uyum kontrolü: onaylı boşluk gününe listede nöbet yazılmış (Elif, 10. gün)
const id10 = mine2.items.find((x) => x.date === d1(10)).id;
const dec = await apiCall(a, 'req.decide', { ids: [id10], status: 'approved' });
if (!dec.conflicts.some((c) => c.id === id10)) fail('panel uyum uyarısı yok: ' + JSON.stringify(dec.conflicts));
cron(); cron();
const cfE = (await notifs(m)).filter((n) => /Onaylı isteğinize nöbet yazılmış/.test(n.title));
const cfA = (await notifs(a)).filter((n) => /onaylı isteklerle çakışma/.test(n.title));
if (cfE.length !== 1 || cfA.length !== 1 || !/Elif/i.test(cfA[0].body)) fail(`uyum bildirimi: kişi ${cfE.length}, yayıncı ${cfA.length} ${cfA[0] && cfA[0].body}`);
await go(a, '#/istekler/yonetim');
await a.locator('.rq-conf').waitFor();
if (!(await a.locator('#rqPeople .badge.danger').count())) fail('kişi tablosunda uyarı yok');
const mine3 = await apiCall(m, 'req.mine', { period_id: PID });
if (!mine3.items.find((x) => x.id === id10).conflict) fail('kişinin görünümünde uyum uyarısı yok');
step('uyum: onaylı 10. gün boşluğa listede nöbet var → kişiye ve yayıncıya birer kez bildirim, panelde uyarı');

// 11) Kişi penceresi: toplu onay
await a.locator('#rqPeople tbody tr', { hasText: 'Burak' }).click();
await a.locator('.modal [data-pm-act=approved]').click();
await expectText(a, 'istek onaylandı');
const bz = (await apiCall(a, 'req.panel', { period_id: PID })).people.find((p) => /Burak/.test(p.name));
if (bz.approved !== 2) fail('kişi toplu onay: ' + JSON.stringify(bz));
await a.locator('.modal [data-act=close-modal]').first().click();
step('kişi penceresi: Burak’ın tüm bekleyen istekleri tek seferde onaylandı');

// 12) Excel: kişi × gün matrisi
const [dl] = await Promise.all([a.waitForEvent('download'), a.click('#rqXlsx')]);
const xb64 = fs.readFileSync(await dl.path()).toString('base64');
if (dl.suggestedFilename() !== `nobet-istekleri-${YM}.xlsx`) fail('Excel adı: ' + dl.suggestedFilename());
const xl = await a.evaluate(async (b64) => {
  await loadVendor('exceljs');
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(u.buffer);
  const ws = wb.getWorksheet('İstekler');
  let row = null; ws.eachRow((r, n) => { if (/Elif/.test(String(r.getCell(1).value))) row = n; });
  const v = (d) => ws.getCell(row, 2 + d).value;
  const fill = (d) => ws.getCell(row, 2 + d).fill.fgColor.argb;
  return { sheets: wb.worksheets.map((w) => w.name), d2: v(2), d3: v(3), d15: v(15), d10: v(10), f2: fill(2), f3: fill(3), f10: fill(10), strike2: !!ws.getCell(row, 4).font.strike };
}, xb64);
if (xl.d3 !== 'B' || xl.d15 !== 'Yİ' || xl.d2 !== 'B' || !xl.strike2 || xl.f2 !== 'FFFDE2E2' || xl.f10 !== 'FFD5F2E1' || xl.f3 !== 'FFFFF1C2' || xl.sheets.join() !== 'İstekler,Günler,Ayrıntı') fail('Excel içeriği: ' + JSON.stringify(xl));
step('Excel: kişi × gün matrisi (B / Yİ, durum renkleri, ret üstü çizili) + Günler + Ayrıntı sayfaları');

// 13) Telefon görünümü: üç sekme, taşma yok, koyu tema
const AM = await ctx('admin-m', true);
await login(AM.p, 'ayse@test.com', 'Sifre1234');
for (const [h, sel, name] of [['#/istekler/yonetim', '#rqHeat .rq-h[data-d]', 'req-m-panel.png'], ['#/istekler/pano', '.rq-brow', 'req-m-board.png']]) {
  await go(AM.p, h);
  await AM.p.locator(sel).first().waitFor();
  await AM.p.waitForTimeout(250);
  await AM.p.screenshot({ path: path.join(OUT, name), fullPage: true });
  const ow = await overflow(AM.p);
  if (ow > 390) fail(`${h} telefonda yatay taşma: ${ow}`);
}
await AM.p.evaluate(() => setTheme('dark'));
await go(AM.p, '#/istekler/yonetim');
await AM.p.locator('#rqHeat .rq-h[data-d]').first().waitFor();
await AM.p.screenshot({ path: path.join(OUT, 'req-m-panel-dark.png'), fullPage: true });
await go(m, '#/istekler/pano');
await m.locator('.rq-brow').first().waitFor();
if ((await overflow(m)) > 390) fail('pano (üye) telefonda yatay taşma: ' + await overflow(m));
await go(m, '#/istekler');
await m.locator('.rq-g').first().waitFor();
await m.screenshot({ path: path.join(OUT, 'req-m-mine-after.png'), fullPage: true });
if ((await overflow(m)) > 390) fail('İsteklerim (sonra) telefonda yatay taşma');
step('telefon (390 px): İsteklerim, Pano, Yönetim yatay taşma yok; koyu tema ekran görüntüsü');

// 14) Dönem silme yetkisi ve işlem günlüğü
if (!/sorumlu yetkisi/.test(await apiErr(m, 'req.period.delete', { id: PID }))) fail('üye dönem sildi');
const aud = await apiCall(a, 'audit.list', {}).catch(() => null);
if (aud && aud.items && !aud.items.some((x) => /^req\./.test(x.action))) fail('işlem günlüğünde istek kaydı yok');
step('yetki ve işlem günlüğü');

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nİSTEK TESTLERİ GEÇTİ');
