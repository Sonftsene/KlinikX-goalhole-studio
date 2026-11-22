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
  await apiCall(A.p, 'plan.tpl.save', { logo, tpl: { ...t0, lines: ['T.C. Örnek Bakanlığı', 'Örnek Şehir Hastanesi', '{BİRİM} {YIL} {AY} ÇALIŞMA LİSTESİ'], doc: [{ l: 'Doküman No', v: 'KY.LS.99' }, { l: 'Yayın Tarihi', v: '01.01.2025' }, { l: 'Revizyon No', v: '0' }],
    sig: [{ t: 'Birim Sorumlusu', n: 'Ayşe Kaya' }, { t: 'Sağlık Bakım Hizmetleri Müdürü', n: '' }], codes: { [nov.yi]: { p: 'Y.İZİN', c: 'deduct' } } } });
  await A.p.click('[data-act=pl2-tab][data-t=resmi]');
  await A.p.locator('#rsPaper .rd-grid').waitFor();
  const pv = await A.p.evaluate(() => ({ rows: document.querySelectorAll('#rsPaper .rd-grid tbody tr').length, people: PL2.d.people.length, html: document.querySelector('#rsPaper').innerHTML, img: !!document.querySelector('#rsPaper .rd-logo img') }));
  if (pv.rows !== pv.people || !pv.img || !pv.html.includes('KY.LS.99') || !pv.html.includes('Örnek Şehir Hastanesi') || !pv.html.includes('Y.İZİN') || !pv.html.includes('ÇALIŞILMASI GEREKEN SAAT')) fail('önizleme eksik: ' + JSON.stringify({ rows: pv.rows, people: pv.people, img: pv.img }));
  if (/\bchg\b|pl2-c|Değişim:|Devir:/.test(pv.html)) fail('önizlemede değişiklik izi var');
  // Şablon penceresi açılıp kaydedilebiliyor
  await A.p.click('[data-act=rs-tpl]');
  await A.p.locator('#rsTplF').waitFor();
  await A.p.click('#rsDocAdd');
  await A.p.locator('#rsDoc .rs-tr').last().locator('[data-k=l]').fill('Revizyon Tarihi');
  await A.p.click('.modal button[form=rsTplF]');
  await expectText(A.p, 'Şablon kaydedildi');
  if (!(await apiCall(A.p, 'plan.tpl.get')).tpl.doc.some((x) => x.l === 'Revizyon Tarihi')) fail('şablon penceresinden kayıt yapılamadı');
  await A.p.screenshot({ path: path.join(OUT, 'r-resmi-onizleme.png') });
  step('şablon: logo, 3 başlık satırı, doküman kutusu (KY.LS.99), imzalar, kod yazımı (Y.İZİN); önizleme kişi sayısı kadar satır, değişiklik izi yok; şablon penceresinden satır eklenip kaydedildi');

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
  for (const N of [20, 30]) {
    const big = await A.p.evaluate(([N, c24, c8]) => {
      const keep = PL2.d;
      const days = planDays(PL2.ym);
      const people = Array.from({ length: N }, (_, i) => ({ name: `Örnek Kişi ${i + 1} Uzunsoyadlıoğlu`, title: i % 3 ? 'Hemşire' : 'Sorumlu Hemşire' }));
      const cells = {};
      people.forEach((p, i) => { cells[p.name] = {}; days.forEach((d, k) => { if ((k + i) % 3 === 0) cells[p.name][d] = k % 2 ? c24 : c8; }); });
      PL2.d = { people, cells, reqs: {}, hfix: {} };
      const h = `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body>${rsDocHtml(rsModel(), { page: true })}</body></html>`;
      PL2.d = keep;
      return h;
    }, [N, nov.c24, nov.c8]);
    const PB = await browser.newPage();
    await PB.setContent(big, { waitUntil: 'load' });
    const pb = await PB.pdf({ preferCSSPageSize: true, printBackground: true });
    if (N === 20) fs.writeFileSync(path.join(OUT, 'r-resmi-20.pdf'), pb);
    const pn = (pb.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (pn !== 1) fail(`${N} kişilik resmi liste ${pn} sayfa (tek sayfa olmalı)`);
    await PB.close();
  }
  const docx = Buffer.from(await blobBytes(A.p, 'rsDocx'));
  const dpath = path.join(OUT, 'r-resmi.docx'); fs.writeFileSync(dpath, docx);
  execFileSync('unzip', ['-tq', dpath]);
  const dxml = execFileSync('unzip', ['-p', dpath, 'word/document.xml'], { encoding: 'utf8' });
  execFileSync('python3', ['-c', 'import sys,xml.dom.minidom;xml.dom.minidom.parseString(sys.stdin.buffer.read())'], { input: dxml });
  if (!dxml.includes('KY.LS.99') || !dxml.includes('SELİN ÖRNEK') || !dxml.includes('w:orient="landscape"') || !/r:embed="rIdLogo"/.test(dxml)) fail('Word belgesi eksik');
  if (!execFileSync('unzip', ['-l', dpath], { encoding: 'utf8' }).includes('word/media/logo.')) fail('Word belgesinde logo yok');
  const xlsx = Buffer.from(await blobBytes(A.p, 'rsXlsx'));
  const xpath = path.join(OUT, 'r-resmi.xlsx'); fs.writeFileSync(xpath, xlsx);
  execFileSync('unzip', ['-tq', xpath]);
  const ss = execFileSync('unzip', ['-p', xpath, 'xl/sharedStrings.xml'], { encoding: 'utf8' });
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
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: resmi liste testleri geçti');
