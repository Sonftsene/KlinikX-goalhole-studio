// 4.30: Excel görüntüleyici — tam ekranda sabit isim sütunu (aynı sekme, dondurulmamış dosyada otomatik), "Sadece ben" yalnız kişinin satırı.
//   node e2e-excel-tam.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>   (e2e.mjs SONRASI; elif@test.com = Elif Yılmaz)
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
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); localStorage.removeItem('nm-onlyme'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', 'elif@test.com');
  await p.fill('[data-form=login] [name=password]', 'YeniSifre99');
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  // Dondurulmamış, iki sekmeli liste: benzer ad ("Elif Yılmaz Kara") ve başka satırda not ("Elif Yılmaz yerine")
  const att = await p.evaluate(async () => {
    await loadVendor('exceljs');
    const wb = new ExcelJS.Workbook();
    // Aralık: bölme ilk kişinin (Ayşe Kaya) satırına kadar dondurulmuş, sıra no + ünvan sütunlu (gerçek listelerdeki gibi)
    const wd = wb.addWorksheet('Aralık', { views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }] });
    wd.addRow(['', 'BİRİM:', '']);
    wd.addRow(['', 'PERSONEL LİSTESİ', 'ÜNVANI', ...Array.from({ length: 31 }, (_, i) => String(i + 1))]);
    wd.addRow(['', '', '', ...Array.from({ length: 31 }, (_, i) => ['Paz..', 'Pzt..', 'Sal..', 'Çar..', 'Per..', 'Cum..', 'Cmt..'][i % 7])]);
    [['4', 'AYŞE KAYA'], ['5', 'BURAK DEMİR'], ['8', 'ELİF YILMAZ'], ['9', 'CEREN AKSOY']].forEach(([n, who], k) => {
      wd.addRow([n, who, 'HEMŞİRE', ...Array.from({ length: 31 }, (_, i) => ((i + k) % 2 === 0 ? '8 8' : ''))]);
    });
    wd.getColumn(2).width = 24;
    for (const name of ['Ekim', 'Kasım']) {
      const ws = wb.addWorksheet(name);
      ws.addRow([`${name} nöbet listesi`]);
      ws.addRow(['Sıra', 'Ad Soyad', ...Array.from({ length: 31 }, (_, i) => String(i + 1)), 'Not']);
      [['1', 'Ayşe Kaya'], ['2', 'Elif Yılmaz'], ['3', 'Elif Yılmaz Kara'], ['4', 'Burak Demir']].forEach(([n, who], k) => {
        const days = Array.from({ length: 31 }, (_, i) => ((i + k) % 3 === 0 ? '16 8' : ''));
        ws.addRow([n, who, ...days, who === 'Burak Demir' ? 'Elif Yılmaz yerine 5’inde' : '']);
      });
      ws.getColumn(2).width = 22;
    }
    const buf = await wb.xlsx.writeBuffer();
    const f = new File([buf], 'deneme-liste.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = await uploadFile(f);
    return { id: a.id, name: 'deneme-liste.xlsx', mime: f.type, size: f.size, url: 'api.php?action=file&id=' + a.id };
  });
  await p.evaluate((a) => {
    const host = document.createElement('div');
    host.id = 'xvHost';
    host.style.cssText = 'position:fixed;inset:60px 0 0 0;z-index:50;display:flex;flex-direction:column;background:#fff';
    document.body.appendChild(host);
    mountPreview(host, a);
  }, att);
  await p.locator('#xvHost .xv-grid').waitFor();
  await p.click('#xvHost .xv-tabs [data-sheet="1"]'); // Ekim
  await p.waitForTimeout(300);
  const stick = (sel) => p.evaluate((s) => {
    const host = document.querySelector(s);
    const sc = host.querySelector('.xv-scroll');
    const cell = [...host.querySelectorAll('.xv-grid tbody td')].find((x) => x.textContent.trim() === 'Ayşe Kaya');
    if (!cell) return { err: 'ad hücresi yok' };
    const b = cell.getBoundingClientRect().left;
    sc.scrollLeft = 500;
    const a2 = cell.getBoundingClientRect().left;
    const moved = sc.scrollLeft;
    sc.scrollLeft = 0;
    return { fz: cell.classList.contains('fz'), b, a: a2, moved };
  }, sel);
  const s1 = await stick('#xvHost');
  if (!s1.fz || s1.moved < 100 || Math.abs(s1.a - s1.b) > 1) fail('dondurulmamış dosyada ad sütunu sabit değil: ' + JSON.stringify(s1));
  step('Dondurulmamış Excel: “Ad Soyad” sütunu kendiliğinden sabit (sağa kaydırınca yerinde)');

  // Sadece ben: yalnız Elif Yılmaz satırı
  await p.click('#xvHost .xv-only');
  await p.waitForTimeout(400);
  const vis = await p.evaluate(() => [...document.querySelectorAll('#xvHost .xv-grid tbody td')].map((x) => x.textContent.trim()).filter((t) => /Kaya|Yılmaz|Demir/.test(t)));
  if (!vis.includes('Elif Yılmaz') || vis.some((t) => /Kara|Demir|Ayşe/.test(t))) fail('“Sadece ben” başka kişileri de gösterdi: ' + vis.join(' | '));
  await p.click('#xvHost .xv-only');
  step('“Sadece ben”: yalnız Elif Yılmaz satırı (Elif Yılmaz Kara ve notunda adı geçen Burak Demir gösterilmedi)');
  // Bölmesi ilk kişinin satırına kadar dondurulmuş sekme (Aralık): ilk kişi başlık sanılmasın
  await p.click('#xvHost .xv-tabs [data-sheet="0"]');
  await p.waitForTimeout(300);
  await p.click('#xvHost .xv-only');
  await p.waitForTimeout(400);
  const vis2 = await p.evaluate(() => [...document.querySelectorAll('#xvHost .xv-grid tbody td')].map((x) => x.textContent.trim()).filter((t) => /KAYA|YILMAZ|DEMİR|AKSOY|PERSONEL|ÜNVAN/.test(t)));
  if (!vis2.includes('ELİF YILMAZ') || vis2.some((t) => /KAYA|DEMİR|AKSOY/.test(t)) || !vis2.some((t) => /PERSONEL/.test(t))) fail('dondurulmuş listede “Sadece ben” başka kişiyi gösterdi ya da başlığı gizledi: ' + vis2.join(' | '));
  await p.click('#xvHost .xv-only');
  step('Bölmesi ilk kişiye kadar dondurulmuş listede “Sadece ben”: başlık satırları + yalnız ELİF YILMAZ (ilk kişi AYŞE KAYA gösterilmedi)');

  // Sekme değiştir → tam ekran aynı sekme, ad sütunu sabit
  await p.click('#xvHost .xv-tabs [data-sheet="2"]');
  await p.waitForTimeout(300);
  const sheet = await p.evaluate(() => document.querySelector('#xvHost').dataset.sheet);
  if (sheet !== 'Kasım') fail('açık sekme okunamadı: ' + sheet);
  await p.evaluate(([a, s]) => openFullViewer(a, 'Tam ekran', { sheetName: s }), [att, sheet]);
  await p.locator('.modal.full .xv-grid').waitFor();
  await p.waitForTimeout(300);
  const tab = await p.locator('.modal.full .xv-tabs button.on').innerText();
  if (tab.trim() !== 'Kasım') fail('tam ekran başka sekmeyle açıldı: ' + tab);
  const s2 = await stick('.modal.full .xv');
  if (!s2.fz || s2.moved < 100 || Math.abs(s2.a - s2.b) > 1) fail('tam ekranda ad sütunu sabit değil: ' + JSON.stringify(s2));
  await p.screenshot({ path: path.join(OUT, 'excel-tam.png') });
  step('Tam ekran: sayfada açık olan sekme (Kasım) açıldı, ad sütunu sabit kaldı');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: Excel tam ekran ve “Sadece ben” testleri geçti');
