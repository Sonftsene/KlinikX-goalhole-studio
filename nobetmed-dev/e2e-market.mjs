// Nöbet ilanı, eksik personel çağrısı ve değişim geçmişi uçtan uca testi.
// e2e.mjs ve e2e-features.mjs'den SONRA aynı sitede çalışır:
//   node e2e-market.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
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
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-market.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' }).trim();
const noOverflow = async (p, tag) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) fail(`${tag}: telefonda yatay taşma ${w}px`); };
const go = async (p, hash) => { if (p.url() === BASE + hash) await p.reload(); else await p.goto(BASE + hash); };
const confirmOk = async (p) => { await p.locator('.modal [data-ok]').last().click(); };

const now = new Date();
const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const ym1 = { y: nx.getFullYear(), m: nx.getMonth() + 1 };
const p2 = (n) => String(n).padStart(2, '0');
const d1 = (d) => `${ym1.y}-${p2(ym1.m)}-${p2(d)}`;
const MONTH1 = `${ym1.y}-${p2(ym1.m)}`;

const A = await ctx('admin');
const a = A.p;
await login(a, 'ayse@test.com', 'Sifre1234');
const M = await ctx('elif', true);
const m = M.p;
await login(m, 'elif@test.com', 'YeniSifre99');
const B = await ctx('burak', true);
const bp = B.p;
await login(bp, 'burak@test.com', 'Sifre1234');
// Üçüncü üye: listedeki DENİZ ŞAHİN için hesap
await apiCall(a, 'admin.user.save', { name: 'Deniz Şahin', email: 'deniz@test.com', password: 'DenizSifre12', role: 'member', status: 'active' });
const DZ = await ctx('deniz', true);
const dz = DZ.p;
await login(dz, 'deniz@test.com', 'DenizSifre12');
await apiCall(dz, 'me.password', { password: 'DenizYeni123' });
await dz.reload();
await dz.locator('#view').waitFor();

// 1) Takvimim gün panelinde "İlana koy" → Devret ilanı
await m.goto(BASE + '#/nobetim');
await m.locator('#calCard .cal-d').first().waitFor();
await m.click('[data-act=cal-mv][data-d="1"]');
await m.click(`.cal-d[data-d="${d1(7)}"]`);
await m.locator('#dayPanel [data-act=mk-post]').click();
await m.locator('.modal [data-go]').waitFor();
if (!/kişi kurallara uyarak bu nöbeti alabilir/.test(await m.locator('.modal').innerText())) fail('ilan penceresinde uygun kişi sayısı yok');
await m.fill('#mkNote', 'Düğün var');
await m.click('.modal [data-go]');
await expectText(m, 'İlana kondu');
await m.waitForFunction(() => location.hash.startsWith('#/ilanlar'));
await m.locator('.mk-item').first().waitFor();
const elifList = await apiCall(m, 'listing.list');
const give = elifList.mine.find((x) => x.date === d1(7));
if (!give || give.kind !== 'give' || give.status !== 'open') fail('devret ilanı oluşmadı: ' + JSON.stringify(elifList.mine));
const dup = await apiErr(m, 'listing.create', { date: d1(7), kind: 'give' });
if (!/zaten ilanda/.test(dup)) fail('aynı nöbet iki kez ilana kondu: ' + dup);
const swapL = (await apiCall(m, 'listing.create', { date: d1(12), kind: 'swap', note: '' })).listing;
const pastL = await apiErr(m, 'listing.create', { date: '2020-01-01', kind: 'give' });
if (!/Geçmiş/.test(pastL)) fail('geçmiş nöbet ilana kondu: ' + pastL);
const notMine = await apiErr(m, 'listing.create', { date: d1(2), kind: 'give' });
if (!/nöbetin görünmüyor/.test(notMine)) fail('başkasının nöbeti ilana kondu: ' + notMine);
step(`ilan: Takvimim'den "İlana koy" (${d1(7)} devret), değiş ilanı, tekrar/geçmiş/başkasının nöbeti engellendi`);

// 2) Burak panoda: kurallara göre Başvur açık/kapalı + neden
const nB = (await apiCall(bp, 'notif.list')).items.find((x) => x.kind === 'listing' && /Yeni nöbet ilanı/.test(x.title));
if (!nB || !/devrediyor/.test(nB.body)) fail('uygun kişiye yeni ilan bildirimi gitmedi');
await bp.goto(BASE + '#/ilanlar');
const giveRow = bp.locator(`.mk-item[data-lid="${give.id}"]`);
const swapRow = bp.locator(`.mk-item[data-lid="${swapL.id}"]`);
await giveRow.waitFor();
if (!(await giveRow.locator('[data-act=mk-apply]').isEnabled())) fail('Burak devret ilanına başvuramıyor');
if (!(await swapRow.locator('button[disabled]').count())) fail('kurala uymayan ilanda başvuru düğmesi kapalı değil');
const why = await swapRow.locator('.mk-why').innerText();
if (!/üst üste|dinlenme|uygun/.test(why)) fail('kapalı başvurunun nedeni yok: ' + why);
await bp.screenshot({ path: path.join(OUT, 'mk-board-mobile.png'), fullPage: true });
await noOverflow(bp, 'ilan panosu');
const badApply = await apiErr(bp, 'listing.apply', { id: swapL.id, offer_date: d1(13) });
if (badApply === 'kabul') fail('kurala uymayan başvuru kabul edildi');
step(`pano: Burak ${d1(7)} için başvurabilir, ${d1(12)} kapalı (“${why.slice(0, 70)}”), sunucu da reddediyor`);

// 3) Burak başvurur (arayüz), Deniz de başvurur (API)
await giveRow.locator('[data-act=mk-apply]').click();
await bp.locator('.modal [data-go]').click();
await expectText(bp, 'Başvurun iletildi');
await apiCall(dz, 'listing.apply', { id: give.id, note: 'Gelebilirim' });
const again = await apiErr(bp, 'listing.apply', { id: give.id });
if (!/zaten başvurdun/.test(again)) fail('iki kez başvurulabildi: ' + again);
const ownApply = await apiErr(m, 'listing.apply', { id: give.id });
if (!/Kendi ilanına/.test(ownApply)) fail('kendi ilanına başvurulabildi');
const nE = (await apiCall(m, 'notif.list')).items.find((x) => x.title === 'İlanına başvuru var');
if (!nE) fail('ilan sahibine başvuru bildirimi gitmedi');
// Gizlilik: üçüncü kişi başvuranları görmez
const dzList = JSON.stringify(await apiCall(dz, 'listing.list'));
const dzGet = await apiCall(dz, 'listing.get', { id: give.id });
if (/BURAK|Burak/.test(dzList) || /BURAK|Burak/.test(JSON.stringify(dzGet)) || dzGet.listing.apps || 'apps_n' in dzGet.listing) fail('üçüncü kişi başvuranları görüyor');
const elifGet = await apiCall(m, 'listing.get', { id: give.id });
if ((elifGet.listing.apps || []).filter((x) => x.status === 'applied').length !== 2) fail('ilan sahibi başvuranları görmüyor: ' + JSON.stringify(elifGet.listing.apps));
const adminGet = await apiCall(a, 'listing.get', { id: give.id });
if (!(adminGet.listing.apps || []).some((x) => /Burak/i.test(x.name))) fail('yönetici başvuranları görmüyor');
const pubChoose = await apiErr(a, 'listing.choose', { id: give.id, app_id: adminGet.listing.apps[0].id });
if (!/yalnız ilan sahibi/.test(pubChoose)) fail('ilan sahibi dışında seçim yapıldı: ' + pubChoose);
step('başvuru: Burak (arayüz) ve Deniz; sahibine bildirim; tekrar/kendi ilanı engelli; başvuranları yalnız sahibi ve yönetici görüyor');

// 4) Elif Burak'ı seçer → Excel'e işlenecek değişim; diğerleri "Kapandı"
await m.goto(BASE + '#/ilanlar/' + give.id);
await m.locator('.modal [data-ch]').first().waitFor();
await m.waitForTimeout(400);
await m.screenshot({ path: path.join(OUT, 'mk-applicants-mobile.png') });
await m.locator('.modal .mk-app', { hasText: 'Burak' }).locator('[data-ch]').click();
await confirmOk(m);
await expectText(m, 'Seçildi; sorumluya iletildi');
const todo = (await apiCall(a, 'swap.list')).todo;
const sr = todo.find((x) => x.from_date === d1(7) && /BURAK/i.test(x.to_name));
if (!sr || sr.kind !== 'give' || sr.status !== 'accepted') fail('sorumlunun Excel’e işlenecek listesinde yok: ' + JSON.stringify(todo));
await a.goto(BASE + '#/nobetim');
await a.locator('#swapBox .swap-card').first().waitFor({ timeout: 8000 }).catch(() => {});
if (!/Excel’e işlenecek/.test(await a.locator('#swapBox').innerText())) fail('yöneticinin Takvimim’inde Excel’e işlenecek kartı yok');
const nBur = (await apiCall(bp, 'notif.list')).items.find((x) => x.title === 'İlan: seçildin');
const nDen = (await apiCall(dz, 'notif.list')).items.find((x) => x.title === 'İlan kapandı');
if (!nBur) fail('seçilen kişiye bildirim gitmedi');
if (!nDen || /Burak/i.test(nDen.body)) fail('seçilmeyene bildirim yok ya da alan kişinin adı var: ' + JSON.stringify(nDen));
const dzAfter = await apiCall(dz, 'listing.list');
const dzItem = dzAfter.board.find((x) => x.id === give.id);
if (!dzItem || dzItem.status !== 'closed' || 'taker' in dzItem || /Burak/i.test(JSON.stringify(dzAfter))) fail('başkaları için ilan “Kapandı” değil ya da alan görünüyor: ' + JSON.stringify(dzItem));
await dz.goto(BASE + '#/ilanlar');
await dz.locator(`.mk-item[data-lid="${give.id}"]`).waitFor();
if (!/Kapandı/.test(await dz.locator(`.mk-item[data-lid="${give.id}"]`).innerText())) fail('panoda “Kapandı” yazmıyor');
const elifMine = (await apiCall(m, 'listing.list')).mine.find((x) => x.id === give.id);
if (elifMine.status !== 'taken' || !/Burak/i.test(elifMine.taker) || elifMine.swap_status !== 'accepted') fail('ilan sahibi alanı görmüyor: ' + JSON.stringify(elifMine));
const lateApply = await apiErr(dz, 'listing.apply', { id: give.id });
if (!/kapandı/.test(lateApply)) fail('kapanan ilana başvurulabildi');
step('seçim: Burak → değişim isteği “accepted”, yöneticinin “Excel’e işlenecek” listesinde; Deniz “Kapandı” görüyor (alan adı yok)');

// 5) Eksik personel çağrısı: aday filtreleri, sıralama, Excel, gönder
await a.goto(BASE + '#/eksik');
await a.locator('[data-act=co-new]').waitFor();
if (!(await a.locator('.nav-item[href="#/eksik"]').count())) fail('yönetim menüsünde Eksik personel yok');
await a.evaluate((d) => openCalloutModal({ date: d, shift: '16 8', unit: 'B blok' }), d1(11));
const panel = a.locator('#coModalPanel');
await panel.locator('table.co-t').first().waitFor();
const cand = await apiCall(a, 'callout.candidates', { date: d1(11), shift: 'night', side: 's3' });
const byName = (n) => cand.people.find((x) => x.name === n);
const bur = byName('BURAK DEMİR'), eli = byName('ELİF YILMAZ');
if (cand.row.code !== '16 8') fail('gece kodu: ' + cand.row.code);
if (!bur || !bur.ok) fail('Burak uygun aday olmalı: ' + JSON.stringify(bur && bur.why));
if (!eli || eli.ok || eli.c.rest !== false) fail('Elif dinlenme yüzünden elenmeli (24 saat çıkışı): ' + JSON.stringify(eli && eli.c));
// Yalnız önceki ayın listesinde adı olan kişi (ör. bölümden ayrılan) bu ayın çağrısında aday olmamalı
const insOld = (sql) => execFileSync('php', ['-r', `chdir(${JSON.stringify(SITE)}); require 'inc/bootstrap.php'; ${sql}`], { encoding: 'utf8' });
const prevYm = (() => { const d = new Date(ym1.y, ym1.m - 2, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; })();
insOld(`$r = one("SELECT r.id, r.parsed_file_id FROM rosters r JOIN roster_shifts s ON s.roster_id = r.id WHERE s.name = 'BURAK DEMİR' LIMIT 1"); q("INSERT INTO roster_shifts (roster_id, file_id, name, date, code, kind, hours, start_time, end_time) VALUES (?, ?, 'ESKİ AYLI KİŞİ', ?, '8 16', 'shift', 8, '08:00', '16:00')", [$r['id'], $r['parsed_file_id'], '${prevYm}-28']);`);
const candOld = await apiCall(a, 'callout.candidates', { date: d1(11), shift: 'night', side: 's3' });
if ([...candOld.people, ...(candOld.moves || [])].some((x) => x.name === 'ESKİ AYLI KİŞİ')) fail('önceki ayın listesindeki kişi bu ayın çağrısında aday çıktı');
insOld(`q("DELETE FROM roster_shifts WHERE name = 'ESKİ AYLI KİŞİ'");`);
step('eksik personel: yalnız önceki ayın listesindeki kişi bu ayın adaylarında yok');
const okList = cand.people.filter((x) => x.ok);
for (let i = 1; i < okList.length; i++) {
  const p = okList[i - 1], q = okList[i];
  const kp = [-p.free_days, p.month_hours, p.last7], kq = [-q.free_days, q.month_hours, q.last7];
  if (kp[0] > kq[0] || (kp[0] === kq[0] && (kp[1] > kq[1] || (kp[1] === kq[1] && kp[2] > kq[2])))) fail('adalet sırası bozuk: ' + p.name + ' > ' + q.name);
}
const shownBefore = await panel.locator('table.co-t').first().locator('tbody tr').count();
if (await panel.locator('table.co-t').first().locator('tr', { hasText: 'Elif' }).count()) fail('şarta uymayan Elif filtrede görünüyor');
await panel.locator('[data-act=co-filter][data-k=rest]').click();
await panel.locator('table.co-t').first().locator('tr', { hasText: 'Elif' }).waitFor();
const restOff = await panel.locator('table.co-t').first().locator('tbody tr').count();
await panel.locator('[data-act=co-filter][data-k=rest]').click();
await panel.locator('[data-change=co-all]').check();
const elifRow = panel.locator('table.co-t').first().locator('tr', { hasText: 'Elif' });
const elifChips = await elifRow.locator('.co-c.no').allInnerTexts();
if (!elifChips.some((t) => /Dinlenme/.test(t))) fail('Elif satırında dinlenme ✗ yok: ' + elifChips.join(','));
if ((await panel.locator('table.co-t').first().locator('tr', { hasText: 'Burak' }).locator('.co-c.ok').count()) !== cand.conds.length) fail('Burak satırında tüm şartlar ✓ değil');
await panel.locator('[data-change=co-all]').uncheck();
if (!/Kaydırma adayları/.test(await panel.innerText())) fail('kaydırma bölümü yok');
if (!cand.moves.some((x) => x.name === 'ELİF YILMAZ' && x.move.from === d1(12))) fail('kaydırma adayı (ertesi gün aynı vardiya) yok: ' + JSON.stringify(cand.moves.map((x) => x.name + x.move.from)));
await a.screenshot({ path: path.join(OUT, 'mk-callout-modal.png') });
// Excel indir
const [dl] = await Promise.all([a.waitForEvent('download'), a.click('.modal [data-act=co-xlsx]')]);
const xb = fs.readFileSync(await dl.path()).toString('base64');
const xinfo = await a.evaluate(async (b64) => {
  await loadVendor('exceljs');
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(u.buffer);
  const ad = wb.getWorksheet('Adaylar'), ay = wb.getWorksheet('Ay çizelgesi');
  const names = []; ad.eachRow((r, i) => { if (i > 3) names.push(String(r.getCell(2).value)); });
  let fillDay = null; ay.getRow(2).eachCell((c) => { if (c.fill && c.fill.fgColor && c.fill.fgColor.argb === 'FFE0A100') fillDay = c.value; });
  return { sheets: wb.worksheets.map((w) => w.name), names, fillDay, rows: ay.rowCount };
}, xb);
if (xinfo.sheets.join('|') !== 'Adaylar|Ay çizelgesi' || !xinfo.names.some((n) => /Burak/i.test(n)) || xinfo.names.some((n) => /Elif/i.test(n)) || xinfo.fillDay !== 11 || xinfo.rows < 5) fail('Excel içeriği: ' + JSON.stringify(xinfo));
// Kura (eşitler arasında, kayıtlı)
const draw = await apiCall(a, 'callout.draw', { names: ['AYŞE KAYA', 'BURAK DEMİR'], context: 'test' });
if (!['AYŞE KAYA', 'BURAK DEMİR'].includes(draw.picked)) fail('kura sonucu: ' + JSON.stringify(draw));
// Elenmiş kişiye sorulamaz (etkin şart)
const badAsk = await apiErr(a, 'callout.create', { date: d1(11), shift: 'night', side: 's3', need: 1, filters: cand.conds.map((c) => c.key), asks: [{ name: 'ELİF YILMAZ', from: '' }] });
if (!/Elif|ELİF/.test(badAsk) || badAsk === 'kabul') fail('şarta uymayan kişiye çağrı gönderildi: ' + badAsk);
// Burak'ı seç ve gönder
await panel.locator('table.co-t').first().locator('tr', { hasText: 'Burak' }).locator('input[data-change=co-sel]').check();
await a.click('.modal [data-co-send]');
await expectText(a, 'Çağrı açıldı');
await a.waitForFunction(() => /^#\/eksik\/\d+/.test(location.hash));
const coId = +(await a.evaluate(() => location.hash.split('/')[2]));
await a.locator('.co-resp').first().waitFor();
step(`eksik çağrısı: ${d1(11)} 16-08 adaylar (Burak ✓, Elif dinlenme ✗), şart çipleri filtreliyor (${shownBefore}→${restOff}), adalet sırası, kaydırma adayı, Excel (${xinfo.sheets.join(' + ')}), kura (${draw.picked}), gönderildi`);

// 6) Burak yanıtlar; gizlilik
const nCall = (await apiCall(bp, 'notif.list')).items.find((x) => x.kind === 'callout');
if (!nCall || !/16-08 için 1 kişi eksik\. Gelebilir misin\?/.test(nCall.body) || nCall.url !== '#/eksik/' + coId) fail('çağrı bildirimi: ' + JSON.stringify(nCall));
if (!/forbidden|gönderilmemiş/i.test(await apiErr(m, 'callout.get', { id: coId }))) fail('sorulmayan kişi çağrıyı görebildi');
if ((await apiErr(bp, 'callout.candidates', { id: coId })) === 'kabul') fail('üye aday listesini görebildi');
if ((await apiErr(bp, 'history.list', {})) === 'kabul') fail('üye geçmişi görebildi');
await bp.goto(BASE + '#/eksik/' + coId);
await bp.locator('[data-act=co-ans][data-y="1"]').click();
await expectText(bp, 'Teşekkürler');
await bp.locator('.co-member .mk-box.ok').waitFor();
await bp.screenshot({ path: path.join(OUT, 'mk-callout-member-mobile.png') });
await noOverflow(bp, 'çağrı (üye)');
const burGet = await apiCall(bp, 'callout.get', { id: coId });
if (burGet.resp || burGet.callout.counts || burGet.me.answer !== 'yes') fail('üye başkalarının yanıtını görüyor ya da yanıt kaydı yanlış');
const nAns = (await apiCall(a, 'notif.list')).items.find((x) => /Çağrıya yanıt/.test(x.title));
if (!nAns) fail('açan kişiye “gelebilir” bildirimi gitmedi');
step('yanıt: Burak bildirimden “Gelebilirim” dedi; yanıtları yalnız yönetici ve kendisi görüyor');

// 7) Yönetici seçer → Excel'e işlenecek
const A2 = await ctx('admin-m', true);
await login(A2.p, 'ayse@test.com', 'Sifre1234');
await A2.p.goto(BASE + '#/eksik/' + coId);
await A2.p.locator('#coPagePanel table.co-t').first().waitFor();
await A2.p.waitForTimeout(400);
await A2.p.screenshot({ path: path.join(OUT, 'mk-callout-open-admin-mobile.png'), fullPage: true });
await noOverflow(A2.p, 'açık çağrı (yönetici)');
await go(a, '#/eksik/' + coId);
await a.locator('[data-act=co-choose]').click();
await confirmOk(a);
await expectText(a, 'çağrı tamamlandı');
await a.locator('.mk-box', { hasText: 'Excel’e işlenecek' }).waitFor();
const nSel = (await apiCall(bp, 'notif.list')).items.find((x) => /seçildin/.test(x.title) && x.kind === 'callout');
if (!nSel) fail('seçilen kişiye çağrı bildirimi gitmedi');
const coL = (await apiCall(a, 'callout.list')).items.find((x) => x.id === coId);
if (coL.status !== 'filled' || !coL.chosen.some((x) => /Burak/i.test(x.name))) fail('çağrı tamamlanmadı: ' + JSON.stringify(coL));
await go(A2.p, '#/eksik/' + coId);
await A2.p.locator('.co-resp').first().waitFor();
await A2.p.waitForTimeout(600);
await A2.p.screenshot({ path: path.join(OUT, 'mk-callout-admin-mobile.png'), fullPage: true });
await noOverflow(A2.p, 'çağrı (yönetici)');
step('seçim: çağrı tamamlandı, “Excel’e işlenecek: Burak …” bildirimleri ve sayfa kutusu');

// 8) Excel güncellenince: ilan değişimi ve çağrı “listeye işlendi”
const gs = (await apiCall(a, 'gsync.get')).gs;
const MN = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
const ym0 = { y: now.getFullYear(), m: now.getMonth() + 1 };
const book = () => a.evaluate(async ([ym0, ym1, MN]) => {
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
  // e2e-features.mjs 3. sürüm + ilan (Elif 7 → Burak) + çağrı (Burak 11 gece)
  const P1 = { 'Elif Yılmaz': { 1: '8 16', 5: '16 8', 8: '8 8', 10: '8 8', 12: '16 8', 13: '8 8' }, 'Burak Demir': { 1: '8 16', 3: '8 8', 5: '16 8', 7: '8 16', 10: '8 16', 11: '16 8', 13: '8 8' }, 'Ayşe Kaya': { 2: '8 8', 5: '8 16', 13: '8 8' }, 'Deniz Şahin': { 4: '8 8', 9: '8 8' } };
  const P0 = { 'Elif Yılmaz': { 26: '8 8', 28: '8 16', 30: '8 8' }, 'Burak Demir': { 27: '8 8', 29: '8 16' }, 'Ayşe Kaya': { 26: '8 16' }, 'Deniz Şahin': { 25: '8 8' } };
  tab(MN[ym0.m - 1], ym0.y, ym0.m, { 'Selin Arslan': { 3: '8 8' } });
  tab(MN[ym0.m - 1] + ' 2.BASAMAK', ym0.y, ym0.m, { 'Kemal Bulut': { 26: '8 8' } });
  tab(MN[ym0.m - 1] + ' 3, BASAMAK', ym0.y, ym0.m, P0);
  tab(MN[ym1.m - 1] + ' 3.BASAMAK', ym1.y, ym1.m, P1);
  tab(MN[ym1.m - 1] + ' 2.BASAMAK', ym1.y, ym1.m, { 'Kemal Bulut': { 5: '8 8', 13: '16 8' }, 'Merve Kaplan': { 6: '8 8' } });
  const buf = await wb.xlsx.writeBuffer();
  let bin = ''; new Uint8Array(buf).forEach((x) => { bin += String.fromCharCode(x); });
  return btoa(bin);
}, [ym0, ym1, MN]);
const pr = await fetch(BASE + 'api.php?action=gsync.push', { method: 'POST', headers: { 'X-Sync-Token': gs.token, 'Content-Type': 'application/octet-stream', 'X-Title': encodeURIComponent('YOĞUN BAKIM') }, body: Buffer.from(await book(), 'base64') });
const pj = await pr.json().catch(() => null);
if (!pj || !pj.changed) fail('Excel gönderimi: ' + JSON.stringify(pj));
const cr = cron();
const elifMine2 = (await apiCall(m, 'listing.list')).mine.find((x) => x.id === give.id);
if (elifMine2.swap_status !== 'applied') fail('ilan değişimi listeye işlenmedi: ' + elifMine2.swap_status);
const coL2 = (await apiCall(a, 'callout.list')).items.find((x) => x.id === coId);
if (!coL2.applied) fail('çağrı listeye işlendi olmadı · cron: ' + cr);
if (!(await apiCall(bp, 'notif.list')).items.some((x) => x.kind === 'callout' && /Listeye işlendi/.test(x.title))) fail('“listeye işlendi” bildirimi yok');
if ((await apiCall(m, 'listing.list')).mine.find((x) => x.id === swapL.id).status !== 'open') fail('Excel güncellemesi açık ilanı kapattı');
step('Excel güncellendi: ilan devri ve çağrı kendiliğinden “listeye işlendi”, bildirim gitti; nöbeti duran ilan açık kaldı');

// 9) Geçmiş (yalnız yönetici): filtreler, Excel/CSV
await a.goto(BASE + '#/gecmis');
await a.locator('.hist-month').fill(MONTH1);
await a.locator('.hist-month').dispatchEvent('change');
await a.locator('.hist-item').first().waitFor();
const histTxt = await a.locator('#histBody').innerText();
if (!/İlan/.test(histTxt) || !/Eksik çağrısı/.test(histTxt) || !/Değişim/.test(histTxt) || !/Burak/i.test(histTxt)) fail('geçmişte kayıtlar eksik: ' + histTxt.slice(0, 300));
const nAll = await a.locator('.hist-item').count();
await a.click('[data-act=hist-type][data-t=callout]');
await a.waitForFunction(() => [...document.querySelectorAll('.hist-item')].every((x) => /Eksik çağrısı/.test(x.innerText)) && document.querySelectorAll('.hist-item').length >= 1);
await a.click('[data-act=hist-type][data-t=all]');
await a.locator('.hist-q').fill('deniz');
await a.waitForFunction(() => !document.querySelector('.hist-item') || [...document.querySelectorAll('.hist-item')].every((x) => /Deniz/i.test(x.innerText)));
await a.locator('.hist-q').fill('');
await a.waitForFunction((n) => document.querySelectorAll('.hist-item').length === n, nAll);
const [csv] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=hist-csv]')]);
const csvTxt = fs.readFileSync(await csv.path(), 'utf8');
if (!/^﻿Tür;Tarih/.test(csvTxt) || !/Burak/i.test(csvTxt)) fail('CSV: ' + csvTxt.slice(0, 200));
const [xl] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=hist-xlsx]')]);
if (fs.statSync(await xl.path()).size < 3000) fail('geçmiş Excel boş');
await a.screenshot({ path: path.join(OUT, 'mk-history-desktop.png') });
await A2.p.goto(BASE + '#/gecmis');
await A2.p.locator('.hist-month').fill(MONTH1);
await A2.p.locator('.hist-month').dispatchEvent('change');
await A2.p.locator('.hist-item').first().waitFor();
await A2.p.screenshot({ path: path.join(OUT, 'mk-history-mobile.png'), fullPage: true });
await noOverflow(A2.p, 'geçmiş');
await m.goto(BASE + '#/gecmis');
await m.waitForFunction(() => location.hash !== '#/gecmis');
step(`geçmiş: ${nAll} kayıt (ilan, değişim, çağrı; alan kişiler), tür ve kişi filtresi, CSV + Excel; üye açamıyor`);

// 10) Ana sayfa kartı, ilan iptali, süresi geçen ilan
await m.goto(BASE + '#/ilanlar');
await m.click('[data-act=mk-tab][data-t=mine]');
await m.locator(`.mk-item[data-lid="${swapL.id}"] [data-act=mk-cancel]`).click();
await confirmOk(m);
await expectText(m, 'İlan geri çekildi');
const cancelled = (await apiCall(m, 'listing.list')).mine.find((x) => x.id === swapL.id);
if (cancelled.status !== 'cancelled') fail('ilan geri çekilmedi');
await m.screenshot({ path: path.join(OUT, 'mk-mine-mobile.png'), fullPage: true });
await noOverflow(m, 'ilanlarım');
// İlan silme: geri çekilmiş ilan kalıcı olarak silinir; başkası silemez
const delOther = await apiCall(bp, 'listing.delete', { id: swapL.id }).then(() => 'silindi', (e) => e.message);
if (delOther === 'silindi') fail('başkasının ilanı silinebildi');
await m.locator(`.mk-item[data-lid="${swapL.id}"] [data-act=mk-del]`).click();
await confirmOk(m);
await expectText(m, 'İlan silindi');
if ((await apiCall(m, 'listing.list')).mine.some((x) => x.id === swapL.id)) fail('silinen ilan listede kaldı');
step('ilan silme: sahibi sildi, listeden kalktı; başkası silemiyor');
// Yeni çağrı → Burak'ın ana sayfasında yanıt kartı
const c2 = await apiCall(a, 'callout.create', { date: d1(9), shift: 'day', side: 's3', need: 1, filters: ['free', 'leave', 'rest', 'cont', 'gap', 'exempt', 'req'], asks: [{ name: 'BURAK DEMİR', from: '' }] }).catch((e) => ({ err: e.message }));
if (c2.err) fail('ikinci çağrı: ' + c2.err);
else {
  await bp.goto(BASE + '#/');
  await bp.locator('.mk-home .mk-ask').waitFor({ timeout: 8000 }).catch(() => fail('ana sayfada çağrı kartı yok'));
  await bp.screenshot({ path: path.join(OUT, 'mk-home-mobile.png') });
  await bp.locator('.mk-home [data-act=co-ans][data-y="0"]').click();
  await expectText(bp, 'Yanıtın kaydedildi');
  const r2 = await apiCall(bp, 'callout.get', { id: c2.id });
  if (r2.me.answer !== 'no') fail('ana sayfadan “Gelemem” kaydedilmedi');
  await apiCall(a, 'callout.cancel', { id: c2.id });
}
// Süresi geçen ilan görevle kapanır
execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; q("UPDATE listings SET status = 'open', date = '2020-01-02' WHERE id = ?", [${swapL.id}]);`]);
cron();
const exp = (await apiCall(m, 'listing.list')).mine.find((x) => x.id === swapL.id);
if (exp && exp.status !== 'expired') fail('tarihi geçen ilan kapanmadı: ' + exp.status);
step('ilan geri çekme, ana sayfa çağrı kartından yanıt, tarihi geçen ilan görevle kapandı');

// Yönetici/yayıncı silmesi: çağrı (yanıtlarıyla) Değişim geçmişinden silinir; üye silemez; gelmeyi bekleyene haber gider
const c3 = await apiCall(a, 'callout.create', { date: d1(9), shift: 'day', side: 's3', need: 1, filters: ['free', 'leave', 'rest', 'cont', 'gap', 'exempt', 'req'], asks: [{ name: 'BURAK DEMİR', from: '' }] }).catch((e) => ({ err: e.message }));
if (c3.err) fail('silme testi çağrısı: ' + c3.err);
else {
  await apiCall(bp, 'callout.answer', { id: c3.id, yes: true });
  if ((await apiErr(bp, 'callout.delete', { id: c3.id })) === 'kabul') fail('üye çağrı silebildi');
  await a.goto(BASE + '#/gecmis');
  await a.locator('.hist-month').fill(d1(9).slice(0, 7));
  await a.locator('.hist-month').dispatchEvent('change');
  await a.click('[data-act=hist-type][data-t=callout]');
  await a.locator(`[data-act=hist-del][data-t=callout][data-id="${c3.id}"]`).click();
  await confirmOk(a);
  await expectText(a, 'Silindi');
  if ((await apiErr(a, 'callout.get', { id: c3.id })) === 'kabul') fail('silinen çağrı hâlâ açılıyor');
  if (await a.locator(`[data-act=hist-del][data-t=callout][data-id="${c3.id}"]`).count()) fail('silinen çağrı geçmişte kaldı');
  const nDel = (await apiCall(bp, 'notif.list')).items.find((x) => /kaldırıldı/.test(x.title));
  if (!nDel) fail('çağrı silinince gönüllüye bildirim gitmedi');
  const lg = (await apiCall(a, 'audit.list', {}).catch(() => ({ items: [] }))).items || [];
  step('silme: yönetici çağrıyı Değişim geçmişinden sildi (yanıtlarıyla), gönüllüye “kaldırıldı” bildirimi, üye silemiyor' + (lg.some((x) => x.action === 'callout.delete') ? ', günlükte kaldı' : ''));
}

await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nİLAN / ÇAĞRI / GEÇMİŞ TESTLERİ GEÇTİ');
