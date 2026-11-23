// Resmi liste (4.34) — uydurma verilerle. e2e-plan.mjs SONRASI aynı sitede çalışır (gelecek ayın çizelgesi yayınlanmış olur).
// Saat hesabı, elle istek, otomatik dağıtım, yayından sonra devir → güncel hâl + işaret + Değişiklikler sekmesi (silme),
// düzeltme kaydı, şablon, önizleme, tek sayfa PDF, Word (.docx) ve Excel (.xlsx), imzalı belge, yetkiler, telefon.
//   node e2e-resmi.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; ${code}`], { encoding: 'utf8' });
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
const expectText = async (p, t, timeout = 10000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-resmi.png') }); console.log('BODY:', (await p.locator('body').innerText()).slice(0, 900)); throw e; } };
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);
const confirmOk = async (p) => { await p.locator('.modal [data-ok]').last().click(); };
// Yayın bitene kadar: kural uyarısı sorulursa “Yine de yayınla”; bildirim görünce tamam
async function pubDone(p) {
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    if (await p.getByText('yayınlandı', { exact: false }).count()) return;
    const k = p.locator('.modal', { hasText: 'Kural uyarıları' }).locator('[data-ok]');
    if (await k.count()) await k.first().click().catch(() => {});
    await p.waitForTimeout(150);
  }
  await p.screenshot({ path: path.join(OUT, 'FAIL-resmi.png') });
  throw new Error('yayın tamamlanmadı');
}
const blobBytes = (p, fn) => p.evaluate(async (f) => { const b = await window[f](); return Array.from(new Uint8Array(await b.arrayBuffer())); }, fn);

try {
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const ro = (await A.p.evaluate(() => S.rosters)).find((r) => r.kind !== 'tablo' && !r.linked);
  const now = new Date();
  const nx = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const ym = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}`;
  const d = (n) => `${ym}-${String(n).padStart(2, '0')}`;
  const nDays = new Date(nx.getFullYear(), nx.getMonth() + 1, 0).getDate();
  const wd = (n) => { const w = new Date(nx.getFullYear(), nx.getMonth(), n).getDay(); return w >= 1 && w <= 5; };

  // ---- 1) Sekmeler ve saat hesabı ----
  await A.p.goto(BASE + `#/cizelge/${ro.id}/${ym}`);
  await A.p.locator('#plGrid').waitFor();
  if ((await A.p.locator('[data-act=pl2-tab]').count()) !== 3) fail('çizelgede 3 sekme (Çizelge / Değişiklikler / Resmi liste) yok');
  if ((await A.p.locator('#plGrid thead .pl2-hh').count()) !== 3) fail('çizelgede Gereken / Çalışılan / Fazla sütunları yok');
  // Görseldeki örnek: Kasım 2026 — 21 iş günü × 8 = 168; hafta içi 5 gün yıllık izin → 128
  const nov = await A.p.evaluate(() => {
    const yi = (PL2.codes.find((c) => c.kind !== 'shift' && /yıllık/i.test(c.label)) || {}).code;
    const sh = (h, st) => (PL2.codes.find((c) => c.kind === 'shift' && +c.hours === h && (!st || c.start === st)) || {}).code;
    const c24 = sh(24), c8 = sh(8, '08:00'), c16 = sh(16, '16:00');
    const t = { day_hours: 8, half_hours: 4, codes: {} };
    const a = rsHours({ people: [{ name: 'X' }], cells: { X: {} } }, '2026-11', t, {}, []).X;
    const b = rsHours({ people: [{ name: 'X' }], cells: { X: { '2026-11-02': yi, '2026-11-03': yi, '2026-11-04': yi, '2026-11-05': yi, '2026-11-06': yi } } }, '2026-11', t, {}, []).X;
    const c = rsHours({ people: [{ name: 'X' }], cells: { X: { '2026-11-01': c24, '2026-11-02': c24, '2026-11-09': c8, '2026-11-10': c16 } } }, '2026-11', t, {}, []).X;
    return { a, b, c, yi, c24, c8, c16 };
  });
  if (nov.a.req !== 168 || nov.b.req !== 128 || nov.c.work !== 72 || nov.c.over !== 72 - 168) fail('saat hesabı (Kasım 2026: 168 / izinli 128 / 24+24+8+16=72) yanlış: ' + JSON.stringify(nov));
  // Gerçek çizelgede bir kişi: 2 hafta içi yıllık izin + 24 saat + 8 saat
  const P = 'Selin Örnek';
  const wds = Array.from({ length: nDays }, (_, i) => i + 1).filter((n) => wd(n) && !(n in {}));
  const hol = await A.p.evaluate(() => PL2.hol);
  const work = wds.filter((n) => hol[d(n)] === undefined);
  const [l1, l2, s1, s2] = [work[2], work[3], work[6], work[8]];
  await A.p.evaluate(([P, c]) => { PL2.d.people.push({ name: P, title: 'Hemşire' }); PL2.d.cells[P] = c; planDirty(); planDraw(); },
    [P, { [d(l1)]: nov.yi, [d(l2)]: nov.yi, [d(s1)]: nov.c24, [d(s2)]: nov.c8 }]);
  const rowH = await A.p.evaluate((P) => { const tr = [...document.querySelectorAll('#plGrid tbody tr')].find((x) => x.textContent.includes(P)); return [...tr.querySelectorAll('.pl2-h')].map((x) => x.textContent.trim()); }, P);
  const base = await A.p.evaluate((ym) => rsHours({ people: [{ name: 'X' }], cells: { X: {} } }, ym, RS2.tpl, PL2.hol, PL2.half).X.req, ym);
  if (rowH[0] !== String(base - 16) || rowH[1] !== '32' || rowH[2] !== String(32 - (base - 16))) fail(`çizelgede saatler yanlış: ${rowH.join(' / ')} (beklenen ${base - 16} / 32 / ${32 - base + 16})`);
  step(`saat hesabı: Kasım 2026 = 168, 5 gün izinli = 128 (görseldeki gibi); çizelgede ${P}: gereken ${base - 16} (2 gün izin düştü), çalışılan 32, fazla ${32 - base + 16}`);

  // ---- 2) Elle istek + otomatik dağıtım ----
  const bDay = d(work[10]), iDay = d(work[12]);
  await A.p.click(`[data-act=pl2-cell][data-n="${P}"][data-d="${bDay}"]`);
  await A.p.locator('.modal [data-rq=bosluk]').click();
  await A.p.click(`[data-act=pl2-cell][data-n="${P}"][data-d="${iDay}"]`);
  await A.p.locator('.modal [data-rq=izin]').click();
  const rq = await A.p.evaluate(([P, b, i]) => ({ r: PL2.d.reqs[P], ci: (PL2.d.cells[P] || {})[i], lc: PL2.d.leave_code }), [P, bDay, iDay]);
  if (rq.r[bDay] !== 'bosluk' || rq.r[iDay] !== 'izin' || rq.ci !== rq.lc) fail('elle istek kaydedilmedi / izin kodu yazılmadı: ' + JSON.stringify(rq));
  await A.p.evaluate(() => { PL2.d.needs.weekday.day = 2; PL2.d.needs.weekday.night = 1; PL2.d.needs.weekend.day = 1; PL2.d.needs.weekend.night = 1; });
  await A.p.click('[data-act=pl2-auto]');
  await confirmOk(A.p);
  await expectText(A.p, 'nöbet yazıldı', 20000);
  const af = await A.p.evaluate(([P, b]) => ({ b: (PL2.d.cells[P] || {})[b] || '' }), [P, bDay]);
  if (af.b) fail('boşluk isteği olan güne otomatik nöbet yazıldı: ' + af.b);
  await A.p.click('[data-act=pl2-save]');
  await expectText(A.p, 'Taslak kaydedildi');
  await A.p.reload(); await A.p.locator('#plGrid').waitFor();
  if ((await A.p.evaluate(([P, b]) => (PL2.d.reqs[P] || {})[b], [P, bDay])) !== 'bosluk') fail('elle istek taslakta saklanmadı');
  step('elle istek: boşluk ve yıllık izin isteği hücre penceresinden girildi (izin kodu kendiliğinden yazıldı); otomatik dağıtım boşluk gününe nöbet yazmadı; taslakta saklandı');

  // ---- 3) Yayınla → yayından sonra devir (kabul edilmiş) → güncel hâl + işaret ----
  await A.p.click('[data-act=pl2-publish]');
  await confirmOk(A.p);
  await pubDone(A.p);
  await A.p.locator('#plGrid').waitFor();
  const giver = P, gDay = d(s1);
  const taker = await A.p.evaluate(([P, g]) => PL2.d.people.map((p) => p.name).find((n) => n !== P && !(PL2.d.cells[n] || {})[g]), [P, gDay]);
  if (!taker) throw new Error('devralacak boş kişi yok');
  const workOf = (P) => A.p.evaluate((P) => { const tr = [...document.querySelectorAll('#plGrid tbody tr')].find((x) => x.textContent.includes(P)); return +tr.querySelectorAll('.pl2-h')[1].textContent.trim().replace(',', '.'); }, P);
  const w0 = await workOf(giver);
  php(`q("INSERT INTO swap_requests (roster_id, kind, from_user, from_name, from_date, from_code, to_user, to_name, status, created_at, decided_at) VALUES (?, 'give', 0, ?, ?, ?, NULL, ?, 'accepted', ?, ?)", [${ro.id}, '${giver}', '${gDay}', '${nov.c24}', '${taker}', now(), now()]);`);
  await A.p.reload(); await A.p.locator('#plGrid').waitFor();
  const sy = await A.p.evaluate(([P, T, g]) => ({ synced: PL2.synced, g: (PL2.d.cells[P] || {})[g] || '', t: (PL2.d.cells[T] || {})[g] || '', mk: !!(PL2.marks[P] || {})[g] && !!(PL2.marks[T] || {})[g] }), [giver, taker, gDay]);
  if (sy.synced < 1 || sy.g !== '' || sy.t !== nov.c24 || !sy.mk) fail('yayından sonra devir çizelgeye işlenmedi / işaretlenmedi: ' + JSON.stringify(sy));
  if (!(await A.p.locator(`td.chg [data-act=pl2-cell][data-n="${taker}"][data-d="${gDay}"]`).count())) fail('değişen hücrede işaret yok');
  await A.p.locator('#pl2Synced').waitFor({ timeout: 5000 }).catch(() => fail('“yayından sonra işlendi” uyarısı yok'));
  const rowH2 = await workOf(giver);
  if (rowH2 !== w0 - 24) fail(`devirden sonra çalışılan saat güncellenmedi: ${w0} → ${rowH2} (beklenen ${w0 - 24})`);
  await A.p.screenshot({ path: path.join(OUT, 'r-cizelge.png') });
  step(`yayından sonra devir: ${giver} → ${taker} (${gDay} 24 saat) çizelgeye kendiliğinden işlendi, iki hücre işaretli, saatler güncellendi (çalışılan ${w0} → ${rowH2})`);

  // ---- 4) Değişiklikler sekmesi: listele, Excel, sil ----
  await A.p.click('[data-act=pl2-tab][data-t=chg]');
  await A.p.locator('#rsChgQ').waitFor();
  const ch = await A.p.evaluate(() => RS2.chg);
  const dv = ch.find((x) => x.kind === 'give' && x.names.includes(taker));
  if (!dv) fail('Değişiklikler sekmesinde devir yok: ' + JSON.stringify(ch));
  const dl = A.p.waitForEvent('download');
  await A.p.click('[data-act=rs-chg-xlsx]');
  const f1 = await dl;
  // Test tarayıcısı blob indirmesine kendi adını verebilir: içerik denetlenir
  const p1 = await f1.path();
  if (!p1 || !execFileSync('unzip', ['-p', p1, 'xl/sharedStrings.xml'], { encoding: 'utf8' }).includes(taker)) fail('değişiklikler Excel indirilmedi / içeriği eksik');
  await A.p.locator(`[data-cid="${dv.id}"]`).check();
  await A.p.click('[data-act=rs-chg-del]');
  await confirmOk(A.p);
  await expectText(A.p, 'kayıt silindi');
  await A.p.click('[data-act=pl2-tab][data-t=grid]');
  await A.p.locator('#plGrid').waitFor();
  await A.p.reload(); await A.p.locator('#plGrid').waitFor();
  const after = await A.p.evaluate(([T, g]) => ({ mk: !!(PL2.marks[T] || {})[g], cell: (PL2.d.cells[T] || {})[g] }), [taker, gDay]);
  if (after.mk || after.cell !== nov.c24) fail('silinen kayıt geri geldi ya da liste bozuldu: ' + JSON.stringify(after));
  if ((await apiCall(A.p, 'plan.changes', { roster_id: ro.id, ym })).changes.some((x) => x.id === dv.id)) fail('silinen değişiklik kaydı yeniden okundu');
  step('Değişiklikler: devir “Devir” olarak listelendi, Excel indirildi; kayıt silinince rapordan ve hücre işaretinden kalktı, liste güncel hâlinde kaldı, yeniden gelmedi');

  // ---- 5) Yayından sonra elle düzeltme (rapor) → yayınla → kayıt ----
  const rp = await A.p.evaluate(() => (PL2.codes.find((c) => /rapor/i.test(c.label)) || {}).code);
  const rDay = d(s2);
  await A.p.click(`[data-act=pl2-cell][data-n="${giver}"][data-d="${rDay}"]`);
  await A.p.locator(`.modal [data-c="${rp}"]`).click();
  await A.p.click('[data-act=pl2-publish]');
  await confirmOk(A.p);
  await pubDone(A.p);
  const ch2 = (await apiCall(A.p, 'plan.changes', { roster_id: ro.id, ym })).changes;
  if (!ch2.some((x) => x.kind === 'report' && x.names === giver && x.date === rDay)) fail('yayından sonra rapor düzeltmesi kaydedilmedi: ' + JSON.stringify(ch2));
  if (ch2.some((x) => x.kind === 'give' && x.names.includes(taker))) fail('devir (yeniden yayında) düzeltme gibi kaydedildi');
  step(`yayından sonra düzeltme: ${giver} ${rDay} → ${rp} (rapor) yayınlanınca “Rapor” olarak kaydedildi; devir düzeltme sayılmadı`);

  // ---- 6) Şablon ----
  const logo = await A.p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#c00'; x.beginPath(); x.arc(60, 60, 55, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 40px Arial'; x.fillText('ÖR', 28, 75); return c.toDataURL('image/png'); });
  const t0 = (await apiCall(A.p, 'plan.tpl.get')).tpl;
  const ty0 = { ...t0.types[0], lines: ['T.C. Örnek Bakanlığı', 'Örnek Şehir Hastanesi', '{BİRİM} {YIL} {AY} ÇALIŞMA LİSTESİ'], doc: [{ l: 'Doküman No', v: 'KY.LS.99' }, { l: 'Yayın Tarihi', v: '01.01.2025' }, { l: 'Revizyon No', v: '0' }],
    sig: [{ t: 'Birim Sorumlusu', n: 'Ayşe Kaya' }, { t: 'Sağlık Bakım Hizmetleri Müdürü', n: '' }] };
  await apiCall(A.p, 'plan.tpl.save', { logo, tpl: { ...t0, codes: { [nov.yi]: { p: 'Y.İZİN', c: 'deduct' } }, types: [ty0] } });
  await A.p.click('[data-act=pl2-tab][data-t=resmi]');
  await A.p.locator('#rsPaper .rd-grid').waitFor();
  const pv = await A.p.evaluate(() => ({ rows: document.querySelectorAll('#rsPaper .rd-grid tbody tr').length, people: PL2.d.people.length, html: document.querySelector('#rsPaper').innerHTML.replace(/<br>/g, ' '), img: !!document.querySelector('#rsPaper .rd-logo img') }));
  if (pv.rows !== pv.people || !pv.img || !pv.html.includes('KY.LS.99') || !pv.html.includes('Örnek Şehir Hastanesi') || !pv.html.includes('Y.İZİN') || !pv.html.includes('ÇALIŞILMASI GEREKEN SAAT')) fail('önizleme eksik: ' + JSON.stringify({ rows: pv.rows, people: pv.people, img: pv.img }));
  if (/\bchg\b|pl2-c|Değişim:|Devir:/.test(pv.html)) fail('önizlemede değişiklik izi var');
  // Şablon penceresi açılıp kaydedilebiliyor
  await A.p.click('[data-act=rs-tpl]');
  await A.p.locator('#rsTplF').waitFor();
  await A.p.click('#rsDocAdd');
  await A.p.locator('#rsDoc .rs-tr').last().locator('[data-k=l]').fill('Revizyon Tarihi');
  await A.p.click('.modal button[form=rsTplF]');
  await expectText(A.p, 'Şablon kaydedildi');
  if (!(await apiCall(A.p, 'plan.tpl.get')).tpl.types[0].doc.some((x) => x.l === 'Revizyon Tarihi')) fail('şablon penceresinden kayıt yapılamadı');
  await A.p.screenshot({ path: path.join(OUT, 'r-resmi-onizleme.png') });
  step('şablon: logo, 3 başlık satırı, doküman kutusu (KY.LS.99), imzalar, kod yazımı (Y.İZİN); önizleme kişi sayısı kadar satır, değişiklik izi yok; şablon penceresinden satır eklenip kaydedildi');

  // Sütun genişlikleri: unvan daraltılır, ad genişletilir → önizleme hemen değişir, şablona kaydedilir; Word ve Excel aynı genişlik
  await A.p.click('#rsCw summary');
  const cw0 = await A.p.evaluate(() => rsWidths(rsModel()));
  await A.p.locator('#rsCw-unvan').fill('14');
  await A.p.locator('#rsCw-unvan').press('Tab');
  await A.p.click('[data-act=rs-cw][data-k=name][data-d="1"]');
  await expectText(A.p, 'Sütun genişlikleri kaydedildi');
  const ctw1 = (await apiCall(A.p, 'plan.tpl.get')).tpl.types[0].widths || {};
  const cw1 = await A.p.evaluate(() => ({ W: rsWidths(rsModel()), col: [...document.querySelectorAll('#rsPaper .rd-grid col')].map((c) => c.style.width) }));
  if (ctw1.unvan !== 14 || ctw1.name !== cw0.nameW + 1 || parseFloat(cw1.col[2]) !== 14 || Math.abs(parseFloat(cw1.col[1]) - (cw0.nameW + 1)) > 0.01 || !(cw1.W.dayW > cw0.dayW)) fail('sütun genişliği ayarı: ' + JSON.stringify({ ctw1, col: cw1.col.slice(0, 4), d0: cw0.dayW, d1: cw1.W.dayW }));
  await A.p.locator('#rsCw').screenshot({ path: path.join(OUT, 'r-genislik.png') });
  const cwx = path.join(OUT, 'r-genislik.xlsx'); fs.writeFileSync(cwx, Buffer.from(await blobBytes(A.p, 'rsXlsx')));
  const cwd = path.join(OUT, 'r-genislik.docx'); fs.writeFileSync(cwd, Buffer.from(await blobBytes(A.p, 'rsDocx')));
  const xcols = [...execFileSync('unzip', ['-p', cwx, 'xl/worksheets/sheet1.xml'], { encoding: 'utf8' }).matchAll(/<col min="(\d+)" max="\d+" width="([\d.]+)"/g)].map((m) => +m[2]);
  const dgrid = [...execFileSync('unzip', ['-p', cwd, 'word/document.xml'], { encoding: 'utf8' }).split('<w:tbl>')[2].matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => +m[1]);
  if (Math.abs(xcols[2] - (14 * 96 / 25.4) / 7) > 0.02 || Math.abs(dgrid[2] - 14 * 56.693) > 2) fail('Word / Excel sütun genişliği önizlemeyle aynı değil: ' + JSON.stringify({ x: xcols.slice(0, 4), d: dgrid.slice(0, 4) }));
  await A.p.click('[data-act=rs-cw-auto]');
  await A.p.locator('#rsCw', { hasText: 'elle ayarlı' }).waitFor();
  const cwa = await A.p.evaluate(() => ({ T: rsType().widths, W: rsWidths(rsModel()) }));
  if (!(cwa.T.name >= 18 && cwa.T.unvan >= 10 && cwa.W.dayW >= 4.4)) fail('yazıya göre sığdır: ' + JSON.stringify(cwa));
  await A.p.click('[data-act=rs-cw-def]');
  await A.p.locator('#rsCw', { hasText: 'otomatik' }).waitFor();
  await expectText(A.p, 'Sütun genişlikleri kaydedildi');
  await A.p.waitForTimeout(900);
  if (Object.keys((await apiCall(A.p, 'plan.tpl.get')).tpl.types[0].widths || {}).length) fail('varsayılan genişliğe dönülmedi');
  step(`sütun genişlikleri: unvan 14 mm, ad ${cw0.nameW + 1} mm yapıldı → önizleme anında, gün sütunu ${cw0.dayW.toFixed(1)} → ${cw1.W.dayW.toFixed(1)} mm; şablona kaydedildi; Word ve Excel aynı genişlikte; “yazıya göre sığdır” ve “varsayılan” çalışıyor`);

  // ---- 6b) Gündüz / gece / %10 / toplam izin: kullanıcının tablosundaki satırlarla aynı (Kasım 2026, gece 20:00–08:00) ----
  const fx = await A.p.evaluate(([c24, c8, yi]) => {
    const t = { day_hours: 8, half_hours: 4, night_from: '20:00', night_to: '08:00', codes: {} };
    const D = (n) => `2026-11-${String(n).padStart(2, '0')}`;
    const mk = (list) => Object.fromEntries(list.map(([n, c]) => [D(n), c]));
    const cells = {
      A: mk([...[1, 4, 7, 10, 13, 16, 19, 22, 25].map((n) => [n, c24]), [27, c8], [28, c8]]),
      B: mk([...[2, 3, 4, 5, 6].map((n) => [n, yi]), ...[8, 11, 14, 17, 20, 23].map((n) => [n, c24]), [25, c8], [26, c8]]),
      C: mk([...[1, 8, 15, 22].map((n) => [n, c24]), ...[2, 3, 4, 5, 6, 9, 10, 11, 12, 13].map((n) => [n, c8])]),
    };
    const h = rsHours({ people: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], cells }, '2026-11', t, {}, []);
    const pick = (x) => [x.izin, x.req, x.day, x.night, x.night10, x.over].join('/');
    return { A: pick(h.A), B: pick(h.B), C: pick(h.C) };
  }, [nov.c24, nov.c8, nov.yi]);
  const want = { A: '0/168/124/108/64/64', B: '40/128/88/72/32/32', C: '0/168/128/48/8/8' };
  for (const k of ['A', 'B', 'C']) if (fx[k] !== want[k]) fail(`formül ${k}: ${fx[k]} (beklenen izin/gereken/gündüz/gece/%10/fazla = ${want[k]})`);
  step('hesaplar kullanıcının tablosuyla aynı: 0/168/124/108/64/64, 40/128/88/72/32/32, 0/168/128/48/8/8 (toplam izin / gereken / gündüz / gece / %10 zamlı / fazla)');

  // Yeni liste türü: fazla mesai listesi (gün sütunsuz özet), kendi doküman numarasıyla
  await A.p.click('[data-act=rs-type-new]');
  await A.p.locator('.modal [name=v]').fill('Fazla Mesai Listesi');
  await A.p.locator('.modal [data-ok]').click();
  await expectText(A.p, 'Liste türü oluşturuldu');
  const tp = (await apiCall(A.p, 'plan.tpl.get')).tpl;
  if (tp.types.length !== 2 || tp.types[1].name !== 'Fazla Mesai Listesi' || tp.types[1].sum.join(',') !== 'izin,req,day,night,night10,over') fail('yeni liste türü oluşmadı: ' + JSON.stringify(tp.types.map((x) => [x.name, x.sum])));
  const t2 = { ...tp.types[1], cols: { sira: true, unvan: true, days: false }, doc: [{ l: 'Doküman No', v: 'FM.LS.07' }], labels: { izin: 'Topl İzin' }, hl: ['over'] };
  await apiCall(A.p, 'plan.tpl.save', { tpl: { ...tp, types: [tp.types[0], t2] } });
  await A.p.click('[data-act=pl2-tab][data-t=grid]'); await A.p.locator('#plGrid').waitFor();
  await A.p.click('[data-act=pl2-tab][data-t=resmi]'); await A.p.locator('#rsPaper .rd-grid').waitFor();
  await A.p.selectOption('#rsTypeSel', t2.id);
  await A.p.locator('#rsPaper', { hasText: 'FM.LS.07' }).waitFor();
  const fm = await A.p.evaluate(() => ({ html: document.querySelector('#rsPaper').innerHTML.replace(/<br>/g, ' '), dn: document.querySelectorAll('#rsPaper .rd-dn').length, hl: document.querySelectorAll('#rsPaper td.hl').length, rows: document.querySelectorAll('#rsPaper .rd-grid tbody tr').length }));
  if (fm.dn || !fm.html.includes('Topl İzin') || !fm.html.includes('%10 ZAMLI') || !fm.html.includes('GECE MESAİSİ') || fm.hl !== fm.rows) fail('fazla mesai listesi (özet) yanlış: ' + JSON.stringify({ dn: fm.dn, hl: fm.hl, rows: fm.rows }));
  const fmPdf = await (async () => { const h = await A.p.evaluate(() => `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body>${rsDocHtml(rsModel(), { page: true })}</body></html>`); const PG2 = await browser.newPage(); await PG2.setContent(h); const b = await PG2.pdf({ preferCSSPageSize: true, printBackground: true }); await PG2.close(); return b; })();
  fs.writeFileSync(path.join(OUT, 'r-fazla-mesai.pdf'), fmPdf);
  if ((fmPdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length !== 1) fail('fazla mesai listesi tek sayfa değil');
  const fmx = Buffer.from(await blobBytes(A.p, 'rsXlsx'));
  const fxp = path.join(OUT, 'r-fazla-mesai.xlsx'); fs.writeFileSync(fxp, fmx);
  if (!execFileSync('unzip', ['-p', fxp, 'xl/sharedStrings.xml'], { encoding: 'utf8' }).replace(/\s*\n\s*/g, ' ').includes('Topl İzin')) fail('fazla mesai listesi Excel’de sütun başlığı yok');
  const fmd = Buffer.from(await blobBytes(A.p, 'rsDocx'));
  const fdp = path.join(OUT, 'r-fazla-mesai.docx'); fs.writeFileSync(fdp, fmd);
  const fdx = execFileSync('unzip', ['-p', fdp, 'word/document.xml'], { encoding: 'utf8' });
  execFileSync('python3', ['-c', 'import sys,xml.dom.minidom;xml.dom.minidom.parseString(sys.stdin.buffer.read())'], { input: fdx });
  if (!fdx.includes('FM.LS.07') || !fdx.includes('C6EFCE')) fail('fazla mesai listesi Word’de doküman no / vurgu yok');
  await A.p.screenshot({ path: path.join(OUT, 'r-fazla-mesai.png') });
  await A.p.selectOption('#rsTypeSel', tp.types[0].id);
  await A.p.locator('#rsPaper', { hasText: 'KY.LS.99' }).waitFor();
  step('liste türü: “Fazla Mesai Listesi” oluşturuldu (kendi doküman no FM.LS.07, gün sütunsuz özet, Topl İzin / Gereken / Gündüz / Gece / %10 / Fazla, fazla sütunu yeşil); PDF tek sayfa, Excel ve Word üretildi; asıl liste türü değişmedi');

  // ---- 6c) Dağıtım: önce 24 saat, kalan gündüz / gece ----
  await A.p.click('[data-act=pl2-tab][data-t=grid]'); await A.p.locator('#plGrid').waitFor();
  await A.p.selectOption('#pl2Mode', '24');
  await A.p.locator('[data-change=pl2-code][data-k=full_code]').waitFor();
  if ((await A.p.evaluate(() => PL2.d.full_code)) !== nov.c24) fail('24 saat kodu kendiliğinden seçilmedi');
  await A.p.selectOption('#pl2Mode', 'split');
  const ppl = Array.from({ length: 8 }, (_, i) => ({ name: `Dağıtım Örnek ${i + 1}`, title: '' }));
  const au = await apiCall(A.p, 'plan.auto', { roster_id: ro.id, ym, draft: { people: ppl, cells: {}, needs: { weekday: { day: 2, night: 1 }, weekend: { day: 1, night: 1 } }, mode: '24', full_code: nov.c24, day_code: nov.c8, night_code: nov.c16, balance: false } });
  const holD = await A.p.evaluate(() => PL2.hol);
  const bad = [];
  for (let k = 1; k <= nDays; k++) {
    const dd = d(k);
    const codes = ppl.map((p) => (au.cells[p.name] || {})[dd]).filter(Boolean);
    const cnt = (c) => codes.filter((x) => x === c).length;
    const we = !wd(k) || holD[dd] !== undefined;
    const ok = we ? cnt(nov.c24) === 1 && codes.length === 1 : cnt(nov.c24) === 1 && cnt(nov.c8) === 1 && codes.length === 2;
    if (!ok) bad.push(`${dd}: ${codes.join(',')}`);
  }
  for (const p of ppl) for (let k = 1; k < nDays; k++) if ((au.cells[p.name] || {})[d(k)] === nov.c24 && (au.cells[p.name] || {})[d(k + 1)]) bad.push(`${p.name} 24 saat sonrası ${d(k + 1)}`);
  if (bad.length || au.unfilled.length) fail('önce 24 saat dağıtımı yanlış: ' + bad.slice(0, 5).join(' | ') + (au.unfilled.length ? ' · eksik ' + au.unfilled.length : ''));
  if (!/24 saat/.test(await apiErr(A.p, 'plan.auto', { roster_id: ro.id, ym, draft: { people: ppl, cells: {}, needs: {}, mode: '24', full_code: nov.c8, day_code: nov.c8, night_code: nov.c16 } }))) fail('gündüz kodu 24 saat kodu olarak kabul edildi');
  step(`dağıtım “önce 24 saat”: ${au.full} gün 24 saat (${nov.c24}) yazıldı, hafta içi kalan gündüz ihtiyacı ${nov.c8} ile tamamlandı, hafta sonu yalnız 24 saat; 24’ün ertesi günü aynı kişiye nöbet yok; 24 saat olmayan kod reddedildi`);
  // Saat eşitleme: aynı dağıtım eşitlemeyle — kişiler arası saat farkı küçülür, gün gün kapsama ve kurallar korunur
  const H = { [nov.c24]: 24, [nov.c8]: 8, [nov.c16]: 16 }, CV = { [nov.c24]: [1, 1], [nov.c8]: [1, 0], [nov.c16]: [0, 1] };
  const spread = (cells) => { const h = ppl.map((p) => Object.values(cells[p.name] || {}).reduce((a, c) => a + (H[c] || 0), 0)); return Math.max(...h) - Math.min(...h); };
  const bl = await apiCall(A.p, 'plan.auto', { roster_id: ro.id, ym, draft: { people: ppl, cells: {}, needs: { weekday: { day: 2, night: 1 }, weekend: { day: 1, night: 1 } }, mode: '24', full_code: nov.c24, day_code: nov.c8, night_code: nov.c16, balance: true } });
  const sp0 = spread(au.cells), sp1 = spread(bl.cells);
  const cov = [];
  for (let k = 1; k <= nDays; k++) {
    const dd = d(k); const we = !wd(k) || holD[dd] !== undefined;
    const c = ppl.map((p) => CV[(bl.cells[p.name] || {})[dd]] || [0, 0]).reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]);
    if (c[0] < (we ? 1 : 2) || c[1] < 1) cov.push(`${dd}: ${c.join('/')}`);
  }
  const chk2 = await apiCall(A.p, 'plan.check', { roster_id: ro.id, ym, draft: { people: ppl, cells: bl.cells, needs: { weekday: { day: 2, night: 1 }, weekend: { day: 1, night: 1 } } } });
  const kural = chk2.issues.filter((x) => x.type === 'kural');
  if (sp1 > sp0 || sp1 > 16 || cov.length || kural.length || !bl.balanced) fail(`saat eşitleme: fark ${sp0} → ${sp1} saat, ${bl.balanced} değişiklik; kapsama eksik ${cov.slice(0, 3).join(' | ')}; kural ${kural.length}`);
  const parts = ppl.reduce((a, p) => a + Object.values(bl.cells[p.name] || {}).filter((c) => c === nov.c16).length, 0);
  step(`saat eşitleme: kişiler arası saat farkı ${sp0} → ${sp1} saat (${bl.balanced} değişiklik, ${parts} adet 24 saat 08-16 / 16-08 olarak bölündü); her günün gündüz / gece ihtiyacı karşılandı; kural ihlali yok`);

  // Nöbet dışı (sorumlu): otomatik dağıtıma girmez; kendi mesaisi (hafta içi gündüz) gereken sayıya sayılmaz; ek nöbeti (hafta sonu / gece) sayılır
  const S0 = ppl[0].name;
  const ks = Array.from({ length: nDays }, (_, i) => i + 1);
  const kWd = ks.find((k) => wd(k) && holD[d(k)] === undefined), kWe = ks.find((k) => !wd(k));
  const ownC = { [d(kWd)]: nov.c8, [d(kWe)]: nov.c24 };
  const NEED = { weekday: { day: 2, night: 1 }, weekend: { day: 1, night: 1 } };
  const ob = await apiCall(A.p, 'plan.auto', { roster_id: ro.id, ym, draft: { people: ppl, cells: { [S0]: ownC }, outside: { [S0]: true }, needs: NEED, mode: '24', full_code: nov.c24, day_code: nov.c8, night_code: nov.c16, balance: true } });
  const covO = (dd, withS0) => ppl.filter((p) => withS0 || p.name !== S0).map((p) => CV[(ob.cells[p.name] || {})[dd]] || [0, 0]).reduce((a, x) => [a[0] + x[0], a[1] + x[1]], [0, 0]);
  const s0c = JSON.stringify(ob.cells[S0]) === JSON.stringify(ownC);
  const cWd = covO(d(kWd), false), cWe = covO(d(kWe), false);
  if (!s0c || cWd[0] < 2 || cWd[1] < 1 || cWe[0] !== 0 || cWe[1] !== 0) fail('nöbet dışı kişi: ' + JSON.stringify({ s0: ob.cells[S0], cWd, cWe }));
  const chkO = await apiCall(A.p, 'plan.check', { roster_id: ro.id, ym, draft: { people: ppl, cells: ob.cells, outside: { [S0]: true }, needs: NEED } });
  if (chkO.short.length || chkO.issues.some((x) => x.name === S0 && x.type === 'bosluk')) fail('nöbet dışı kişi denetimi: ' + JSON.stringify({ short: chkO.short.slice(0, 3), bos: chkO.issues.filter((x) => x.name === S0).slice(0, 2) }));
  // Ek nöbet işareti kapatılırsa hafta sonu 24’ü de sayılmaz → o gün eksik kalır
  const chkX = await apiCall(A.p, 'plan.check', { roster_id: ro.id, ym, draft: { people: ppl, cells: ob.cells, outside: { [S0]: true }, xtra: { [S0]: { [d(kWe)]: 0 } }, needs: NEED } });
  if (!chkX.short.some((x) => x.date === d(kWe))) fail('ek nöbet işareti kaldırılınca gün eksik görünmedi');
  step(`nöbet dışı (sorumlu): otomatik dağıtıma girmedi; hafta içi kendi mesaisi (${d(kWd)} 08-16) gereken sayıya sayılmadı, başkaları 2 gündüz + 1 gece yazıldı; hafta sonu ek nöbeti (${d(kWe)} 24 saat) sayıldı, o güne başkası yazılmadı; boşluk kuralı aranmadı; ek nöbet işareti kaldırılınca gün eksik göründü`);

  // Arayüz: kişi menüsünden nöbet dışı yap → satır işaretlenir, hücre penceresinde “ek nöbet” seçeneği; geri al
  const PO = await A.p.evaluate(() => PL2.d.people.find((p) => !planOutside(p.name)).name);
  await A.p.click(`[data-act=pl2-pmenu][data-n="${PO}"]`);
  await A.p.locator('.modal [data-o=outside]').click();
  await expectText(A.p, `${PO} nöbet dışı`);
  if (!(await A.p.evaluate((n) => !!document.querySelector(`[data-act=pl2-pmenu][data-n="${n}"]`).closest('tr.pl2-out') && PL2.d.outside[n] === true, PO))) fail('nöbet dışı işareti satıra / taslağa işlenmedi');
  const dO = await A.p.evaluate(() => planDays(PL2.ym)[2]);
  await A.p.click(`[data-act=pl2-cell][data-n="${PO}"][data-d="${dO}"]`);
  await A.p.locator('#pl2Xtra').waitFor();
  await A.p.keyboard.press('Escape');
  await A.p.locator('#pl2Xtra').waitFor({ state: 'detached' });
  await A.p.click(`[data-act=pl2-pmenu][data-n="${PO}"]`);
  await A.p.locator('.modal [data-o=outside]').click();
  await expectText(A.p, `${PO} yeniden nöbete dahil`);
  if (await A.p.evaluate((n) => planOutside(n), PO)) fail('nöbet dışı işareti kaldırılamadı');
  step(`arayüz: “${PO}” kişi menüsünden nöbet dışı yapıldı (satır işaretli, hücrede “ek nöbet” seçeneği), sonra yeniden nöbete alındı`);

  // Kolay düzenleme: temizle (yalnız nöbetler / tümü), kişinin nöbetleri, gün; hepsi Geri al ile döner
  await A.p.evaluate(() => { window.__isSh = (c) => { const k = PL2.codes.find((x) => x.code === c); return !k || k.kind === 'shift'; }; });
  const snap = () => A.p.evaluate(() => JSON.stringify(Object.keys(PL2.d.cells).sort().map((n) => [n, Object.entries(PL2.d.cells[n]).sort()])));
  const before = await snap();
  const leaveOf = await A.p.evaluate(() => Object.values(PL2.d.cells).reduce((a, r) => a + Object.values(r).filter((c) => !window.__isSh(c)).length, 0));
  await A.p.click('[data-act=pl2-clear]');
  await A.p.locator('.modal [data-o=shifts]').click();
  await A.p.locator('.modal [data-ok]').last().click();
  await expectText(A.p, 'Nöbetler temizlendi');
  const af1 = await A.p.evaluate(() => { const v = Object.values(PL2.d.cells).flatMap((r) => Object.values(r)); return { shifts: v.filter((c) => window.__isSh(c)).length, other: v.filter((c) => !window.__isSh(c)).length }; });
  if (af1.shifts || af1.other !== leaveOf) fail('yalnız nöbetleri temizle yanlış: ' + JSON.stringify(af1));
  await A.p.click('[data-act=pl2-undo]');
  if ((await snap()) !== before) fail('geri al çizelgeyi eski hâline döndürmedi');
  await A.p.click('[data-act=pl2-clear]');
  await A.p.locator('.modal [data-o=all]').click();
  await A.p.locator('.modal [data-ok]').last().click();
  await expectText(A.p, 'Çizelge temizlendi');
  if (await A.p.evaluate(() => Object.values(PL2.d.cells).some((r) => Object.keys(r).length))) fail('tüm çizelge temizlenmedi');
  await A.p.click('[data-act=pl2-undo]');
  await A.p.click(`[data-act=pl2-pmenu][data-n="${P}"]`);
  await A.p.locator('.modal [data-o=clearsh]').click();
  const pr = await A.p.evaluate((P) => Object.values(PL2.d.cells[P] || {}), P);
  if (pr.some((c) => c === nov.c24 || c === nov.c8 || c === nov.c16) || !pr.length) fail('kişinin nöbetleri temizlenmedi ya da izinleri de silindi: ' + pr.join(','));
  await A.p.click('[data-act=pl2-undo]');
  await A.p.click(`[data-act=pl2-day][data-d="${d(15)}"]`);
  await A.p.locator('.modal [data-o=shifts]').click();
  if (await A.p.evaluate((dd) => Object.values(PL2.d.cells).some((r) => r[dd] && window.__isSh(r[dd])), d(15))) fail('gün temizlenmedi');
  await A.p.click('[data-act=pl2-undo]');
  if ((await snap()) !== before) fail('art arda geri al çizelgeyi eski hâline döndürmedi');
  step('kolay düzenleme: “yalnız nöbetleri temizle” (izin / rapor kaldı), “tüm çizelgeyi temizle”, kişinin nöbetlerini temizle, günü temizle; her biri Geri al ile aynen geri döndü');

  // Unvan: daha önce eklenen unvanlardan seç, unvanı boş olanlara da ver, yeni eklenene kendiliğinden; toplu düzenleme
  const emptyT = await A.p.evaluate(() => PL2.d.people.filter((p) => !p.title).map((p) => p.name));
  if (!emptyT.length) fail('unvan testi için unvanı boş kişi yok');
  await A.p.click(`[data-act=pl2-pmenu][data-n="${emptyT[0]}"]`);
  await A.p.locator('.modal [data-o=title]').click();
  await A.p.locator('#pl2TChips [data-t="Hemşire"]').click();
  if ((await A.p.locator('#pl2TIn').inputValue()) !== 'Hemşire') fail('unvan çipi seçilmedi');
  if (await A.p.locator('#pl2TAll').count()) await A.p.check('#pl2TAll');
  await A.p.check('#pl2TDef');
  await A.p.locator('.modal').last().screenshot({ path: path.join(OUT, 'r-unvan.png') });
  await A.p.click('#pl2TGo');
  await expectText(A.p, emptyT.length > 1 ? 'Unvan verildi' : 'Unvan kaydedildi');
  const tt = await A.p.evaluate(() => ({ e: PL2.d.people.filter((p) => !p.title).length, def: PL2.titles.def }));
  if (tt.e || tt.def !== 'Hemşire') fail('unvan herkese / varsayılan olarak verilmedi: ' + JSON.stringify(tt));
  await A.p.evaluate(() => planSave(true));
  const pg = await apiCall(A.p, 'plan.get', { roster_id: ro.id, ym });
  if (pg.titles.def !== 'Hemşire' || !pg.titles.known.includes('Hemşire') || !Object.values(pg.titles.map).includes('Hemşire')) fail('unvan hatırlanmadı: ' + JSON.stringify(pg.titles).slice(0, 300));
  // Yeni eklenen kişiye varsayılan unvan kendiliğinden
  await A.p.evaluate(() => ACT['pl2-addp']());
  await A.p.locator('#pl2AddName').fill('Deniz Deneme');
  await A.p.click('#pl2AddGo');
  await expectText(A.p, '1 kişi eklendi');
  if ((await A.p.evaluate(() => (PL2.d.people.find((p) => p.name === 'Deniz Deneme') || {}).title)) !== 'Hemşire') fail('yeni eklenen kişiye varsayılan unvan verilmedi');
  // Toplu: Unvanlar penceresi
  await A.p.evaluate(() => ACT['pl2-titles']());
  const di = await A.p.evaluate(() => PL2.d.people.findIndex((p) => p.name === 'Deniz Deneme'));
  await A.p.locator(`.pl2-tlist input[data-i="${di}"]`).fill('Ebe');
  await A.p.locator('#pl2TDefIn').fill('');
  await A.p.click('#pl2TSave');
  await expectText(A.p, 'Unvanlar kaydedildi');
  const t3 = await A.p.evaluate(() => ({ d: (PL2.d.people.find((p) => p.name === 'Deniz Deneme') || {}).title, def: PL2.titles.def }));
  if (t3.d !== 'Ebe' || t3.def !== '') fail('toplu unvan düzenleme: ' + JSON.stringify(t3));
  await A.p.evaluate(() => { PL2.d.people = PL2.d.people.filter((p) => p.name !== 'Deniz Deneme'); delete PL2.d.cells['Deniz Deneme']; planDirty(); planDraw(); return planSave(true); });
  step(`unvan: kişi menüsünden hazır unvan (çip) seçildi, unvanı boş ${emptyT.length - 1} kişiye de verildi, varsayılan yapıldı ve hatırlandı; yeni eklenen kişiye kendiliğinden “Hemşire”; toplu Unvanlar penceresi çalışıyor`);

  // Onaylı istekler çizelgeye: istek girilir → onaylanır → çizelge açılınca kendiliğinden yazılır (hafta sonuna yazılmaz);
  // ayar penceresinde “hafta sonuna da yaz” → uygulanır; istek reddedilince yazdığı hücre silinir
  await apiCall(A.p, 'plan.rqopts', { opts: { auto: true, izin_we: false, bos_code: '', conflict: 'skip', remove: true } });
  await A.p.evaluate(() => planSave(true));
  const RQ = await A.p.evaluate(() => {
    const acc = new Set((S.people || []).map((p) => avKey(p.name)));
    const p = PL2.d.people.find((x) => acc.has(avKey(x.name)) && !planOutside(x.name));
    const row = PL2.d.cells[p.name] || {}, own = PL2.d.reqs[p.name] || {};
    const free = planDays(PL2.ym).filter((d) => !row[d] && !own[d] && !Object.keys(planReqFor(p.name)).includes(d));
    return { n: p.name, wd: free.find((d) => !planWe(d)), we: free.find((d) => planWe(d)), lc: PL2.d.leave_code };
  });
  if (!RQ.wd || !RQ.we || !RQ.lc) fail('istek testi için boş gün / izin kodu yok: ' + JSON.stringify(RQ));
  const pers = (await apiCall(A.p, 'req.periods')).periods.filter((p) => p.ym === ym);
  let PID = (pers.find((p) => +p.roster_id === +ro.id) || pers.find((p) => !p.roster_id) || {}).id;
  if (!PID) PID = (await apiCall(A.p, 'req.period.save', { ym, roster_id: ro.id, deadline: `${ym}-10`, note: '', status: 'open' })).id;
  const mine0 = await apiCall(A.p, 'req.mine', { period_id: PID, name: RQ.n });
  const keepItems = (mine0.items || []).map((x) => ({ date: x.date, kind: x.kind, note: x.note || '' }));
  const sv = await apiCall(A.p, 'req.save', { period_id: PID, name: RQ.n, roster_id: ro.id, items: [...keepItems, { date: RQ.wd, kind: 'izin' }, { date: RQ.we, kind: 'izin' }] });
  const ids = sv.items.filter((x) => x.date === RQ.wd || x.date === RQ.we).map((x) => x.id);
  await apiCall(A.p, 'req.decide', { ids, status: 'approved' });
  await A.p.evaluate(() => planLoad());
  await expectText(A.p, 'onaylı istek değişikliği çizelgeye işlendi');
  const r1 = await A.p.evaluate((R) => ({ wd: (PL2.d.cells[R.n] || {})[R.wd], we: (PL2.d.cells[R.n] || {})[R.we], w: (PL2.d.rqw[R.n] || {})[R.wd] }), RQ);
  if (r1.wd !== RQ.lc || r1.we || r1.w !== 'izin') fail('onaylı istek kendiliğinden yazılmadı: ' + JSON.stringify(r1));
  // Ayar penceresi: hafta sonuna da yaz → önizleme → uygula
  await A.p.evaluate(() => ACT['pl2-reqs']());
  await A.p.locator('#pl2RqPrev').waitFor();
  await A.p.locator('#pl2RqF [data-k=izin_we]').check({ force: true });
  await A.p.locator('#pl2RqPrev', { hasText: '1 hücre yazılacak' }).waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'r-istekler.png') });
  await A.p.click('#pl2RqGo');
  await A.p.locator('#pl2RqF').waitFor({ state: 'detached' });
  await A.p.waitForFunction((R) => (PL2.d.cells[R.n] || {})[R.we] === R.lc, RQ, { timeout: 8000 }).catch(() => {});
  const r2 = await A.p.evaluate((R) => (PL2.d.cells[R.n] || {})[R.we], RQ);
  if (r2 !== RQ.lc || !(await apiCall(A.p, 'plan.get', { roster_id: ro.id, ym })).rq_opts.izin_we) fail('hafta sonu izni ayarı uygulanmadı / kaydedilmedi: ' + r2);
  await A.p.evaluate(() => planSave(true));
  // Reddedilen istek çizelgeden silinir
  await apiCall(A.p, 'req.decide', { ids, status: 'rejected', reason: 'deneme' });
  await A.p.evaluate(() => planLoad());
  await expectText(A.p, 'onaylı istek değişikliği çizelgeye işlendi');
  const r3 = await A.p.evaluate((R) => ({ wd: (PL2.d.cells[R.n] || {})[R.wd], we: (PL2.d.cells[R.n] || {})[R.we], w: PL2.d.rqw[R.n] }), RQ);
  if (r3.wd || r3.we || (r3.w && (r3.w[RQ.wd] || r3.w[RQ.we]))) fail('reddedilen isteğin hücresi silinmedi: ' + JSON.stringify(r3));
  await apiCall(A.p, 'req.save', { period_id: PID, name: RQ.n, items: keepItems });
  await apiCall(A.p, 'plan.rqopts', { opts: { izin_we: false } });
  await A.p.evaluate(() => planSave(true));
  step(`onaylı istekler: ${RQ.n} için 2 yıllık izin isteği onaylandı → çizelge açılınca iş gününe ${RQ.lc} kendiliğinden yazıldı, hafta sonuna yazılmadı; “hafta sonuna da yaz” ayarıyla eklendi (önizleme 1 hücre); istekler reddedilince çizelgeden silindi`);

  // Kişi adını düzenleme: nöbetler, unvan ve saat düzeltmesi yeni ada taşınır; aynı ad reddedilir; Geri al döner
  const rn0 = await A.p.evaluate(() => { const p = PL2.d.people.find((x) => Object.keys(PL2.d.cells[x.name] || {}).length); return { n: p.name, t: p.title, cells: JSON.stringify(PL2.d.cells[p.name]), other: PL2.d.people.find((x) => x.name !== p.name).name }; });
  const RN = rn0.n + ' Düzeltme';
  await A.p.click(`[data-act=pl2-pmenu][data-n="${rn0.n}"]`);
  await A.p.locator('.modal [data-o=rename]').click();
  await A.p.locator('#pl2RnIn').fill(rn0.other.toLocaleUpperCase('tr'));
  await A.p.click('.modal button[form=pl2RnF]');
  await expectText(A.p, 'zaten çizelgede');
  await A.p.locator('#pl2RnIn').fill(RN);
  await A.p.click('.modal button[form=pl2RnF]');
  await expectText(A.p, `Ad değiştirildi: ${RN}`);
  const rn1 = await A.p.evaluate(([o, nn]) => ({ old: PL2.d.cells[o] !== undefined || PL2.d.people.some((p) => p.name === o), cells: JSON.stringify(PL2.d.cells[nn]), t: (PL2.d.people.find((p) => p.name === nn) || {}).title, btn: !!document.querySelector(`[data-act=pl2-pmenu][data-n="${nn}"]`) }), [rn0.n, RN]);
  if (rn1.old || rn1.cells !== rn0.cells || rn1.t !== rn0.t || !rn1.btn) fail('ad düzenleme: ' + JSON.stringify(rn1).slice(0, 200));
  await A.p.evaluate(() => planSave(true));
  const rs1 = await apiCall(A.p, 'plan.get', { roster_id: ro.id, ym });
  if (!rs1.draft.people.some((p) => p.name === RN) || JSON.stringify(rs1.draft.cells[RN]) !== rn0.cells) fail('yeni ad kaydedilmedi');
  await A.p.click('[data-act=pl2-undo]');
  if (!(await A.p.evaluate((o) => PL2.d.people.some((p) => p.name === o) && Object.keys(PL2.d.cells[o] || {}).length > 0, rn0.n))) fail('ad değişikliği geri alınamadı');
  await A.p.evaluate(() => planSave(true));
  step(`kişi adı düzenlendi (“${rn0.n}” → “${RN}”): nöbetleri ve unvanı yeni ada taşındı, kaydedildi; aynı ad reddedildi; Geri al ile eski ada döndü`);

  await A.p.click('[data-act=pl2-tab][data-t=resmi]'); await A.p.locator('#rsPaper .rd-grid').waitFor();

  // ---- 7) Tek sayfa PDF, Word, Excel ----
  const docHtml = await A.p.evaluate(() => `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body>${rsDocHtml(rsModel(), { page: true })}</body></html>`);
  const PG = await browser.newPage();
  await PG.setContent(docHtml, { waitUntil: 'load' });
  const pdf = await PG.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(OUT, 'r-resmi.pdf'), pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  if (pages !== 1) fail(`resmi liste PDF ${pages} sayfa (tek sayfa olmalı)`);
  await PG.close();
  // Kalabalık birim: 20 ve 30 kişi de tek sayfaya sığmalı
  // LibreOffice ile basılınca kaç sayfa (Word / Excel çıktısının A4'e sığması); soffice yoksa denetim atlanır
  const soPdf = (file) => {
    try {
      const dir = fs.mkdtempSync(path.join(OUT, 'so-'));
      execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, file], { stdio: 'ignore', timeout: 120000 });
      const f = fs.readdirSync(dir).find((x) => x.endsWith('.pdf'));
      return f ? path.join(dir, f) : null;
    } catch (e) { return null; }
  };
  // Sayfadaki tablonun kutusu (mm): koyu dikey / yatay çizgilerin sınırları
  const BOX_PY = `import sys, subprocess, tempfile, os
from PIL import Image
d = tempfile.mkdtemp(); out = []
for pdf in sys.argv[1:]:
    subprocess.run(['pdftoppm', '-r', '100', '-gray', '-png', '-f', '1', '-l', '1', pdf, os.path.join(d, 'x')], check=True)
    f = [x for x in os.listdir(d) if x.startswith('x')][0]
    im = Image.open(os.path.join(d, f)).convert('L'); os.remove(os.path.join(d, f))
    w, h = im.size; px = im.load()
    cols = [x for x in range(w) if sum(1 for y in range(0, h, 2) if px[x, y] < 128) > h * 0.125]
    rows = [y for y in range(h) if sum(1 for x in range(0, w, 2) if px[x, y] < 128) > w * 0.25]
    out.append([round(v / 100 * 25.4, 1) for v in (cols[0], cols[-1], rows[0], rows[-1])])
print(out)`;
  const pdfBoxes = (...pdfs) => { try { return JSON.parse(execFileSync('python3', ['-I', '-c', BOX_PY, ...pdfs], { encoding: 'utf8', timeout: 60000 })); } catch (e) { return null; } };
  const soPages = (file) => {
    try {
      const dir = fs.mkdtempSync(path.join(OUT, 'so-'));
      execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, file], { stdio: 'ignore', timeout: 120000 });
      const pdfF = fs.readdirSync(dir).find((f) => f.endsWith('.pdf'));
      const info = execFileSync('pdfinfo', [path.join(dir, pdfF)], { encoding: 'utf8' });
      const m = /Pages:\s+(\d+)/.exec(info); const sz = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
      return { pages: m ? +m[1] : 0, land: sz ? +sz[1] > +sz[2] : false };
    } catch (e) { return null; }
  };
  // Kalabalık birim: 20 ve 30 kişi, uzun ad ve unvan — PDF, Word ve Excel A4 yatay tek sayfa, hücrede taşan yazı yok
  const parity = [];
  for (const N of [20, 30]) {
    const big = await A.p.evaluate(async ([N, c24, c8, yi]) => {
      const keep = PL2.d;
      const days = planDays(PL2.ym);
      const people = Array.from({ length: N }, (_, i) => ({ name: `Örnek Kişi ${i + 1} Uzunsoyadlıoğlu Çağlayangil`, title: i % 3 ? 'Hemşire' : 'Sorumlu Hemşire Yardımcısı' }));
      const cells = {};
      people.forEach((p, i) => { cells[p.name] = {}; days.forEach((d, k) => { if ((k + i) % 3 === 0) cells[p.name][d] = k % 2 ? c24 : (k % 5 ? c8 : yi); }); });
      PL2.d = { people, cells, reqs: {}, hfix: {} };
      const h = `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body>${rsDocHtml(rsModel(), { page: true })}</body></html>`;
      const dx = Array.from(new Uint8Array(await (await rsDocx()).arrayBuffer()));
      const xx = Array.from(new Uint8Array(await (await rsXlsx()).arrayBuffer()));
      PL2.d = keep;
      return { h, dx, xx };
    }, [N, nov.c24, nov.c8, nov.yi]);
    fs.writeFileSync(path.join(OUT, `r-resmi-${N}.html`), big.h);
    const PB = await browser.newPage();
    await PB.setContent(big.h, { waitUntil: 'load' });
    const over = await PB.evaluate(() => [...document.querySelectorAll('.rd-grid td')].filter((td) => td.scrollWidth > td.clientWidth + 1 || td.scrollHeight > td.clientHeight + 2).map((td) => td.textContent.trim()).slice(0, 5));
    if (over.length) fail(`${N} kişilik resmi listede hücreden taşan yazı: ${over.join(' | ')}`);
    const pb = await PB.pdf({ preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(path.join(OUT, `r-resmi-${N}.pdf`), pb);
    const pn = (pb.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (pn !== 1) fail(`${N} kişilik resmi liste ${pn} sayfa (tek sayfa olmalı)`);
    await PB.close();
    const dF = path.join(OUT, `r-resmi-${N}.docx`), xF = path.join(OUT, `r-resmi-${N}.xlsx`);
    fs.writeFileSync(dF, Buffer.from(big.dx)); fs.writeFileSync(xF, Buffer.from(big.xx));
    for (const [f, t] of [[dF, 'Word'], [xF, 'Excel']]) {
      const r = soPages(f);
      if (r && (r.pages !== 1 || !r.land)) fail(`${N} kişilik ${t} çıktısı A4 yatay tek sayfa değil: ${JSON.stringify(r)}`);
    }
    // Göründüğü gibi: Word çıktısında tablonun yeri ve boyu PDF ile aynı (±1,5 mm)
    const wp = soPdf(dF), bx = wp ? pdfBoxes(path.join(OUT, `r-resmi-${N}.pdf`), wp) : null;
    if (bx) {
      const [h, w] = bx;
      if (h.some((v, i) => Math.abs(v - w[i]) > 1.5)) fail(`${N} kişilik Word çıktısı PDF ile aynı görünmüyor (tablo kutusu mm): PDF ${h.join('/')} · Word ${w.join('/')}`);
      const f1 = (v) => v.toFixed(1).replace('.', ',');
      parity.push(`${N} kişi: PDF ${f1(h[1] - h[0])}×${f1(h[3] - h[2])} mm, Word ${f1(w[1] - w[0])}×${f1(w[3] - w[2])} mm`);
    }
  }
  step(`kalabalık birim (20 ve 30 kişi, uzun ad ve unvan): PDF, Word ve Excel A4 yatay tek sayfa; hücrelerden taşan yazı yok; ${parity.length ? 'Word = PDF (' + parity.join('; ') + ')' : 'görünüş karşılaştırması atlandı (LibreOffice / PIL yok)'}`);
  const docx = Buffer.from(await blobBytes(A.p, 'rsDocx'));
  const dpath = path.join(OUT, 'r-resmi.docx'); fs.writeFileSync(dpath, docx);
  execFileSync('unzip', ['-tq', dpath]);
  const dxml = execFileSync('unzip', ['-p', dpath, 'word/document.xml'], { encoding: 'utf8' });
  execFileSync('python3', ['-c', 'import sys,xml.dom.minidom;xml.dom.minidom.parseString(sys.stdin.buffer.read())'], { input: dxml });
  if (!dxml.includes('KY.LS.99') || !dxml.includes('SELİN ÖRNEK') || !dxml.includes('w:orient="landscape"') || !/r:embed="rIdLogo"/.test(dxml)) fail('Word belgesi eksik');
  if (!execFileSync('unzip', ['-l', dpath], { encoding: 'utf8' }).includes('word/media/logo.')) fail('Word belgesinde logo yok');
  const dlist = execFileSync('unzip', ['-l', dpath], { encoding: 'utf8' });
  if (!dxml.includes('w:lang w:val="tr-TR"') || !dlist.includes('word/styles.xml') || !execFileSync('unzip', ['-p', dpath, 'word/styles.xml'], { encoding: 'utf8' }).includes('tr-TR')) fail('Word belgesinde Türkçe dil / varsayılan yazı tipi tanımı yok');
  if (!/ŞEHİR|ÖRNEK|SELİN/.test(dxml)) fail('Word belgesinde Türkçe büyük harfler yok');
  const xlsx = Buffer.from(await blobBytes(A.p, 'rsXlsx'));
  const xpath = path.join(OUT, 'r-resmi.xlsx'); fs.writeFileSync(xpath, xlsx);
  execFileSync('unzip', ['-tq', xpath]);
  const ss = execFileSync('unzip', ['-p', xpath, 'xl/sharedStrings.xml'], { encoding: 'utf8' }).replace(/\s*\n\s*/g, ' ');
  if (!ss.includes('KY.LS.99') || !ss.includes('ÇALIŞILMASI GEREKEN SAAT') || !ss.includes('SELİN ÖRNEK')) fail('Excel çıktısı eksik');
  if (!execFileSync('unzip', ['-l', xpath], { encoding: 'utf8' }).includes('xl/media/')) fail('Excel çıktısında logo yok');
  const dlb = A.p.waitForEvent('download');
  await A.p.click('[data-act=rs-docx]');
  const p2 = await (await dlb).path();
  if (!p2 || !execFileSync('unzip', ['-p', p2, 'word/document.xml'], { encoding: 'utf8' }).includes('KY.LS.99')) fail('Word düğmesi indirmedi / içeriği eksik');
  step(`çıktılar: PDF tek sayfa (A4 yatay), Word (.docx geçerli XML, yatay, logolu), Excel (.xlsx, logolu, saat sütunlu) üretildi ve indirildi`);

  // ---- 8) İmzalı belge → ekip görür ----
  const sg = await A.p.evaluate(async () => {
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
    const att = await uploadFile(new File([pdf], 'imzali.pdf', { type: 'application/pdf' }));
    return (await api('plan.signed', { roster_id: PL2.rid, ym: PL2.ym, attachment_id: att.id })).signed;
  });
  if (!sg || !sg.url) fail('imzalı belge eklenmedi');
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  const er = (await apiCall(E.p, 'rosters.list')).rosters.find((r) => r.id === ro.id);
  if (!er.signed || er.signed.id !== sg.id) fail('ekip imzalı belgeyi listede görmüyor: ' + JSON.stringify(er.signed));
  else if ((await E.p.evaluate(async (u) => (await fetch(u)).status, BASE + er.signed.url)) !== 200) fail('ekip imzalı belgeyi açamadı');
  step('imzalı belge: taranmış hâl eklendi; üye nöbet listesinde “İmzalı resmi liste” olarak görüyor ve açabiliyor');

  // ---- 9) Yetkiler: üye giremez, yayıncı her şeyi yapar ----
  for (const a of ['plan.changes', 'plan.tpl.save', 'plan.changes.delete', 'plan.signed']) if ((await apiErr(E.p, a, { roster_id: ro.id, ym, ids: [1], tpl: {} })) === 'kabul') fail(`üye ${a} yapabildi`);
  const eu = (await apiCall(A.p, 'admin.users')).users.find((u) => u.email === 'elif@test.com');
  await apiCall(A.p, 'admin.user.save', { ...eu, role: 'editor' });
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me && S.me.role === 'editor');
  const ed = [await apiErr(E.p, 'plan.changes', { roster_id: ro.id, ym }), await apiErr(E.p, 'plan.tpl.get'), await apiErr(E.p, 'plan.changes.delete', { roster_id: ro.id, ym, all: true })];
  await apiCall(A.p, 'admin.user.save', { ...eu, role: 'member' });
  if (ed.some((x) => x !== 'kabul')) fail('yayıncı resmi liste / değişiklikleri yönetemedi: ' + ed.join(' | '));
  step('yetki: üye değişiklik raporu, şablon, silme, imzalı belge uçlarına giremiyor; yayıncı (editör) görüntüleyip silebiliyor');

  // ---- 10) Telefon ----
  const Am = await ctx('ayse-mobil', true);
  await login(Am.p, 'ayse@test.com', 'Sifre1234');
  for (const t of ['degisiklik', 'resmi']) {
    await Am.p.goto(BASE + `#/cizelge/${ro.id}/${ym}/${t}`);
    await Am.p.locator(t === 'resmi' ? '#rsPaper' : '#rsChgQ').waitFor();
    const w = await Am.p.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) fail(`telefonda ${t} sekmesi yatay taşıyor ${w}px`);
  }
  await Am.p.screenshot({ path: path.join(OUT, 'r-resmi-tel.png') });
  step('telefon: Değişiklikler ve Resmi liste sekmelerinde taşma yok (önizleme ekrana sığacak şekilde küçülür)');
  await Am.p.goto(BASE + `#/cizelge/${ro.id}/${ym}`);
  await Am.p.locator('#plGrid').waitFor();
  const mob = await Am.p.evaluate(() => ({ set: document.querySelector('.pl2-set').open, more: getComputedStyle(document.querySelector('.pl2-more')).display !== 'none', auto: getComputedStyle(document.querySelector('[data-act=pl2-auto].pl2-xbtn')).display === 'none', top: document.querySelector('.pl2-wrap').getBoundingClientRect().top + window.scrollY }));
  if (mob.set || !mob.more || !mob.auto) fail('telefonda üst kısım kompakt değil: ' + JSON.stringify(mob));
  await Am.p.click('[data-act=pl2-more]');
  await Am.p.locator('.modal [data-o=pl2-auto]').waitFor();
  await Am.p.keyboard.press('Escape');
  const sc = await Am.p.evaluate(([n, d, c]) => {
    const w = document.querySelector('.pl2-wrap'); w.scrollLeft = 420;
    const before = w.scrollLeft;
    PL2.brush = c;
    document.querySelector(`[data-act=pl2-cell][data-n="${n}"][data-d="${d}"]`).click();
    const after = document.querySelector('.pl2-wrap').scrollLeft;
    PL2.brush = null;
    return { before, after, code: (PL2.d.cells[n] || {})[d] };
  }, [P, d(20), nov.c8]);
  if (sc.before < 100 || Math.abs(sc.after - sc.before) > 2 || sc.code !== nov.c8) fail('telefonda hücre doldurunca kaydırma başa döndü: ' + JSON.stringify(sc));
  await Am.p.screenshot({ path: path.join(OUT, 'r-cizelge-tel.png') });
  await Am.p.evaluate(() => { PL2.dirty = false; });
  step(`telefon çizelge: ayarlar katlı, işlemler “Diğer” menüsünde (üstten tabloya ${Math.round(mob.top)} px); hücre doldurunca yatay kaydırma yerinde kaldı (${sc.before} → ${sc.after})`);

  // Masaüstü: toplu kişi ekleme ve birim kuralı (boşluk sınırı)
  await A.p.click('[data-act=pl2-tab][data-t=grid]'); await A.p.locator('#plGrid').waitFor();
  // Listeden seçilebilsin diye hesabı olan iki kişi çizelgeden geçici çıkarılır
  const orig = await A.p.evaluate(() => { const o = JSON.parse(JSON.stringify(PL2.d.people)); const users = new Set((S.people || []).map((p) => avKey(p.name))); let k = 0; PL2.d.people = PL2.d.people.filter((p) => !(users.has(avKey(p.name)) && k++ < 2)); planDraw(); return o; });
  const n0 = await A.p.evaluate(() => PL2.d.people.length);
  await A.p.click('#pl2AddBtn');
  await A.p.locator('#pl2AddName').waitFor();
  const boxes = await A.p.locator('#pl2AddL input[type=checkbox]').count();
  for (let i = 0; i < Math.min(2, boxes); i++) await A.p.locator('#pl2AddL input[type=checkbox]').nth(i).check();
  await A.p.fill('#pl2AddName', 'Toplu Kişi Örnek');
  await A.p.click('#pl2AddGo');
  await expectText(A.p, 'kişi eklendi');
  const n1 = await A.p.evaluate(() => PL2.d.people.length);
  if (boxes < 2) fail('toplu ekleme listesinde çizelgede olmayan kişiler görünmedi');
  if (n1 !== n0 + Math.min(2, boxes) + 1) fail(`toplu kişi ekleme: ${n0} → ${n1} (beklenen +${Math.min(2, boxes) + 1})`);
  const g0 = (await apiCall(A.p, 'plan.get', { roster_id: ro.id, ym })).rules.max_gap;
  await A.p.fill('#pl2RGap', '3');
  await A.p.click('[data-act=pl2-rules]');
  await expectText(A.p, 'Birim kuralları kaydedildi');
  const g1 = (await apiCall(A.p, 'plan.get', { roster_id: ro.id, ym })).rules.max_gap;
  const chk = await apiCall(A.p, 'plan.check', { roster_id: ro.id, ym, draft: { people: [{ name: 'Boşluk Deneme' }], cells: { 'Boşluk Deneme': { [d(1)]: nov.c8, [d(6)]: nov.c8 } }, needs: {} } });
  await apiCall(A.p, 'plan.rules', { max_gap: g0 });
  if (g1 !== 3 || !chk.issues.some((x) => x.type === 'bosluk' && /en fazla 3 gün/.test(x.msg))) fail('birim kuralı (en fazla 3 gün boşluk) uygulanmadı: ' + JSON.stringify({ g1, iss: chk.issues.slice(0, 3) }));
  // Diğer testler etkilenmesin: eklenen kişiler çıkarılır, taslak kaydedilir
  await A.p.evaluate((o) => { PL2.d.people = o; planDirty(); }, orig);
  await A.p.click('[data-act=pl2-save]'); await expectText(A.p, 'Taslak kaydedildi');
  step(`toplu kişi ekleme: ${Math.min(2, boxes)} kişi listeden + 1 hesabı olmayan kişi tek seferde eklendi; birim kuralı “iki nöbet arası en fazla 3 gün” kaydedildi ve denetim 4 günlük boşluğu yakaladı (sonra ${g0} gün geri alındı)`);
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: resmi liste testleri geçti');
