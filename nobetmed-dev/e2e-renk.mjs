// Excel liste renkleri ve kişi seçme süzgeci (4.58.0) — uydurma verilerle.
// Hafta sonu sütunları renkli, kişinin kendi nöbet hücreleri belirgin, “Kişi seç” ile yalnız kendisi + seçtikleri görünür,
// düğmeler renkli; çizelgede de hafta sonu sütunları ve kişinin kendi satırı renkli.
//   node e2e-renk.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>   (e2e.mjs SONRASI; elif@test.com = Elif Yılmaz)
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
try {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); localStorage.removeItem('nm-onlyme'); localStorage.removeItem('nm-xv-pick'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', 'elif@test.com');
  await p.fill('[data-form=login] [name=password]', 'YeniSifre99');
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  // Mart 2027: 1 Mart Pazartesi → hafta sonları 6-7, 13-14, 20-21, 27-28
  const att = await p.evaluate(async () => {
    await loadVendor('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mart 2027');
    ws.addRow(['MART 2027 NÖBET LİSTESİ']);
    ws.addRow(['Sıra', 'Ad Soyad', ...Array.from({ length: 31 }, (_, i) => String(i + 1))]);
    [['1', 'Ayşe Kaya'], ['2', 'Elif Yılmaz'], ['3', 'Burak Demir'], ['4', 'Ceren Aksoy'], ['5', 'Deniz Şahin']].forEach(([n, who], k) => {
      ws.addRow([n, who, ...Array.from({ length: 31 }, (_, i) => ((i + k) % 3 === 0 ? '8 8' : ''))]);
    });
    ws.getColumn(2).width = 22;
    const buf = await wb.xlsx.writeBuffer();
    const f = new File([buf], 'renk-liste.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = await uploadFile(f);
    return { id: a.id, name: 'renk-liste.xlsx', mime: f.type, size: f.size, url: 'api.php?action=file&id=' + a.id };
  });
  await p.evaluate((a) => {
    const host = document.createElement('div');
    host.id = 'xvHost';
    host.style.cssText = 'position:fixed;inset:60px 0 0 0;z-index:50;display:flex;flex-direction:column;background:#fff';
    document.body.appendChild(host);
    mountPreview(host, a, { ym: '2027-03' });
  }, att);
  await p.locator('#xvHost .xv-grid').waitFor();
  await p.waitForTimeout(300);

  // 1) Hafta sonu sütunları renkli (6, 7, 13 … ) — hafta içi (8) renksiz
  const we = await p.evaluate(() => {
    const host = document.querySelector('#xvHost');
    const hdrRow = [...host.querySelectorAll('.xv-grid tbody tr')].find((tr) => [...tr.querySelectorAll('td.xc')].some((td) => td.textContent.trim() === '31'));
    const colOf = (d) => { const td = [...hdrRow.querySelectorAll('td.xc')].find((x) => x.textContent.trim() === String(d)); return td ? td.dataset.c : null; };
    const has = (d) => { const c = colOf(d); return c != null && [...host.querySelectorAll(`.xv-grid td.xc[data-c="${c}"]`)].some((td) => td.classList.contains('we')); };
    return { d6: has(6), d7: has(7), d13: has(13), d8: has(8), d1: has(1) };
  });
  if (!we.d6 || !we.d7 || !we.d13) fail('hafta sonu sütunları renkli değil: ' + JSON.stringify(we));
  if (we.d8 || we.d1) fail('hafta içi sütunu hafta sonu sayıldı: ' + JSON.stringify(we));
  // 2) Kendi satırım ve nöbet hücrelerim belirgin
  const mine = await p.evaluate(() => ({ row: document.querySelectorAll('#xvHost tr.me-row').length, cells: document.querySelectorAll('#xvHost tr.me-row td.mine-c').length, legend: (document.querySelector('#xvHost .xv-legend') || {}).textContent || '' }));
  if (mine.row !== 1 || mine.cells < 5) fail('kendi nöbet hücreleri belirgin değil: ' + JSON.stringify(mine));
  if (!/Hafta sonu/.test(mine.legend) || !/Sizin nöbetleriniz/.test(mine.legend)) fail('renk açıklaması yok: ' + mine.legend);
  await p.locator('#xvHost').screenshot({ path: path.join(OUT, 'renk-liste.png') });
  step(`Excel liste: hafta sonu sütunları renkli (6, 7, 13 Mart), hafta içi renksiz; kendi satırım ve ${mine.cells} nöbet hücrem belirgin; renk açıklaması görünüyor`);

  // 3) Kişi seç: Burak ve Ceren seçilince yalnız ben + onlar görünür
  const pick = p.locator('#xvHost .xv-pick');
  if (!(await pick.isVisible())) throw new Error('“Kişi seç” düğmesi yok');
  await pick.click();
  const md = p.locator('.modal').last();
  await md.locator('.xv-pick-list').waitFor();
  const names = await md.locator('.xv-pick-list .list-row').allInnerTexts();
  if (names.some((n) => /Elif/.test(n))) fail('kişi listesinde kendi adım var');
  for (const who of ['Burak Demir', 'Ceren Aksoy']) await md.locator('.xv-pick-list .list-row', { hasText: who }).locator('input').check();
  await md.locator('[data-go]').click();
  await p.waitForTimeout(400);
  const vis = await p.evaluate(() => [...document.querySelectorAll('#xvHost .xv-grid tbody tr')].map((tr) => tr.textContent).join('\n'));
  if (!/Elif Yılmaz/.test(vis) || !/Burak Demir/.test(vis) || !/Ceren Aksoy/.test(vis)) fail('seçilen kişiler / ben görünmüyor');
  if (/Ayşe Kaya|Deniz Şahin/.test(vis)) fail('seçilmeyen kişiler hâlâ görünüyor');
  if (!/^\s*1\s*$/m.test(vis.split('\n')[0]) && !/31/.test(vis)) fail('gün başlığı satırı kayboldu');
  if (!/Seçtiğiniz kişiler/.test(await p.locator('#xvHost .xv-legend').innerText())) fail('renk açıklamasında seçilen kişiler yok');
  const btn = await p.evaluate(() => ({ only: document.querySelector('#xvHost .xv-only').textContent.trim(), pick: document.querySelector('#xvHost .xv-pick').textContent.trim(), act: document.querySelector('#xvHost .xv-pick').classList.contains('active'), rows: document.querySelectorAll('#xvHost tr.pick-row').length }));
  if (!/Ben \+ 2 kişi/.test(btn.only) || !/\(2\)/.test(btn.pick) || !btn.act || btn.rows !== 2) fail('düğme durumları / seçilen satır rengi: ' + JSON.stringify(btn));
  await p.locator('#xvHost').screenshot({ path: path.join(OUT, 'renk-kisi-sec.png') });
  // Renkli düğmeler: “Kişi seç” arka planı beyaz / saydam değil
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('#xvHost .xv-pick')).backgroundColor);
  if (/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/.test(bg)) fail('düğme renkli değil: ' + bg);
  // Seçimi temizle → herkes geri gelir
  await pick.click();
  await p.locator('.modal').last().locator('[data-clear]').click();
  await p.waitForTimeout(300);
  const back = await p.evaluate(() => document.querySelector('#xvHost .xv-grid').textContent);
  if (!/Ayşe Kaya/.test(back) || !/Deniz Şahin/.test(back)) fail('seçim temizlenince herkes geri gelmedi');
  step('Kişi seç: Burak ve Ceren seçildi → yalnız ben + ikisi (başlık satırları duruyor), düğmeler “Ben + 2 kişi” / “Kişi seç (2)”, seçilenlerin satırı renkli; temizleyince herkes geri geldi');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: Excel liste renk ve kişi seçme testleri geçti');
