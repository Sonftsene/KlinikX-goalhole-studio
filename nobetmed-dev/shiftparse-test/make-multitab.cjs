// Çok sekmeli nöbet çizelgesi üretir (Google E-Tablolar'daki aylık sekmeler gibi): PHP/JS eşdeğerlik testi için.
// Kullanım: node make-multitab.cjs <çıktı.xlsx>    (exceljs gerekir; NODE_PATH ile gösterilebilir)
// Sekmeler: KASIM, KASIM 2.BASAMAK, KASIM 3, BASAMAK (etkin), EKİM 3.BASAMAK, ARALIK 2026, Nöbet Listesi, OCAK, GİZLİ (gizli), Notlar
// İsimler uydurmadır.
const ExcelJS = require('exceljs');

const GUN = ['Paz.', 'Pzt.', 'Sal.', 'Çar.', 'Per.', 'Cum.', 'Cmt.'];
const NAMES = ['ALİ YILDIZ', 'BERNA KAYA', 'CEM AKSU', 'DİLEK ÖZTÜRK', 'EMİNE ŞEN', 'FATİH DEMİR', 'GÜL ARSLAN', 'HAKAN ÇELİK', 'IŞIL KOÇ', 'KAAN POLAT', 'LEYLA ERDEM', 'MERT KURT'];
const TITLES = ['SAĞLIK MEMURU', 'HEMŞİRE', 'HEMŞİRE', 'SORUMLU HEMŞİRE', 'EBE', 'HEMŞİRE', 'ATT', 'HEMŞİRE', 'HEMŞİRE', 'EBE', 'HEMŞİRE', 'TEKNİSYEN'];
const CODES = ['8 8', '8 16', '16 8', '8 20', '20 8', '88', '08:00-16:00', '816', 'Yİ', 'Rp', 'Nİ', 'S', 'GGr', 'Kurs', '24', 'G', 'N', 'İ', 'EV.İ', 'ayr.', '8 16 ', '8 16'];
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
// Belirlenimci sözde rastgele
let seed = 7;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };

/** Izgara düzeni: başlık bloğu + gün başlığı + (isteğe bağlı) gün adları + kişiler + toplam satırı */
function gridSheet(wb, name, o) {
  const ws = wb.addWorksheet(name);
  const { y, m } = o;
  const days = o.days || daysIn(y, m);
  const D = 4, HR = o.headerRow || 9;
  if (o.title !== false) {
    ws.mergeCells(1, D, 2, D + 20);
    ws.getCell(1, D).value = 'T.C. SAĞLIK BAKANLIĞI';
    ws.mergeCells(5, D, 5, D + 15);
    ws.getCell(5, D).value = o.title || 'AYLIK NÖBET ÜCRET ÇİZELGESİ';
  }
  if (o.period) {
    ws.getCell(6, D + 20).value = 'AİT OLDUĞU DÖNEM';
    ws.mergeCells(6, D + 24, 6, D + 25);
    ws.getCell(6, D + 24).value = y;
    ws.getCell(6, D + 26).value = o.period === 'name' ? 'EKİM' : m;
  }
  ws.getCell(HR, 1).value = 'S.NO';
  ws.getCell(HR, 2).value = 'ADI SOYADI';
  ws.getCell(HR, 3).value = 'ÜNVANI';
  for (let d = 1; d <= days; d++) {
    const c = ws.getCell(HR, D + d - 1);
    if (o.header === 'date-d') { c.value = utc(y, m, d); c.numFmt = 'd'; }
    else if (o.header === 'date-full') { c.value = utc(y, m, d); c.numFmt = 'dd.mm.yyyy'; }
    else if (o.header === 'date-default') { c.value = utc(y, m, d); }
    else if (o.header === 'formula') { c.value = d === 1 ? 1 : { formula: `${ws.getColumn(D + d - 2).letter}${HR}+1`, result: d }; }
    else if (o.header === 'text') c.value = String(d);
    else if (o.header === 'dotted') c.value = d + '.';
    else c.value = d;
    if (o.weekdays) {
      const g = ws.getCell(HR + 1, D + d - 1);
      if (o.weekdays === 'date') { g.value = utc(y, m, d); g.numFmt = 'ddd'; }
      else g.value = GUN[dow(y, m, d)];
    }
  }
  const first = HR + (o.weekdays ? 2 : 1);
  const n = o.people || 8;
  for (let i = 0; i < n; i++) {
    const r = first + i;
    ws.getCell(r, 1).value = i + 1;
    const nm = NAMES[(i + (o.shift || 0)) % NAMES.length];
    if (o.rich && i % 3 === 0) ws.getCell(r, 2).value = { richText: [{ font: { bold: true }, text: nm.split(' ')[0] + ' ' }, { text: nm.split(' ').slice(1).join(' ') }] };
    else ws.getCell(r, 2).value = o.honorific && i === 1 ? 'Uzm. Hem. ' + nm : nm;
    ws.getCell(r, 3).value = TITLES[(i + (o.shift || 0)) % TITLES.length];
    let hours = 0;
    for (let d = 1; d <= days; d++) {
      if (rnd(3) === 0) continue;
      const code = CODES[rnd(o.codes || CODES.length)];
      ws.getCell(r, D + d - 1).value = code;
      if (/^8 ?16$|^816$/.test(code)) hours += 8;
    }
    ws.getCell(r, D + days).value = { formula: `COUNTIF(D${r}:${ws.getColumn(D + days - 1).letter}${r},"8 16")*8`, result: hours };
    ws.getCell(r, D + days + 1).value = hours / 160;
    ws.getCell(r, D + days + 1).numFmt = '0.0%';
    ws.getCell(r, D + days + 2).value = hours + 0.5;
  }
  ws.getCell(first + n, 3).value = 'Topl Saat';
  ws.getCell(first + n + 1, 3).value = 'KISALTMALAR: Yİ: Yıllık İzin   Rp: Raporlu';
  ws.getCell(first + n + 2, 2).value = 'Düzenleyen';
  if (!o.misc) return ws;
  ws.getCell(first + n + 2, 6).value = true;
  ws.getCell(first + n + 2, 7).value = { error: '#N/A' };
  ws.getCell(first + n + 2, 8).value = { formula: '1/0', result: { error: '#DIV/0!' } };
  ws.getCell(first + n + 2, 9).value = 1234567.891;
  ws.getCell(first + n + 2, 9).numFmt = '#,##0.00 "TL"';
  ws.getCell(first + n + 2, 10).value = utc(y, m, 15);
  ws.getCell(first + n + 2, 10).numFmt = 'dd mmmm yyyy dddd';
  ws.getCell(first + n + 2, 11).value = new Date(Date.UTC(y, m - 1, 3, 8, 30, 0));
  ws.getCell(first + n + 2, 11).numFmt = 'd/m/yyyy h:mm AM/PM';
  ws.getCell(first + n + 2, 12).value = 0.000012345;
  ws.getCell(first + n + 2, 13).value = 2 / 3;
  return ws;
}

(async () => {
  const out = process.argv[2];
  if (!out) { console.error('Kullanım: node make-multitab.cjs <çıktı.xlsx>'); process.exit(2); }
  const wb = new ExcelJS.Workbook();
  // Ay yalnızca sekme adında; gün adları satırı var (yıl gün adlarından)
  gridSheet(wb, 'KASIM', { y: 2026, m: 11, weekdays: 'text', title: 'AYLIK NÖBET ÇİZELGESİ', people: 10 });
  // Gün başlığı tarih hücresi ('d' biçimi), gün adları 'ddd' biçimli tarih; ay/yıl sekme adı + gün adları
  gridSheet(wb, 'KASIM 2.BASAMAK', { y: 2027, m: 11, header: 'date-d', weekdays: 'date', title: false, shift: 3, rich: true });
  // Tam tarih başlıkları (dd.mm.yyyy) -> ay/yıl başlıktan
  gridSheet(wb, 'KASIM 3, BASAMAK', { y: 2026, m: 11, header: 'date-full', shift: 5, honorific: true, codes: 10 });
  // Dönem hücreleri: 2026 + EKİM; başlık formüllerle (önbellek değerleri)
  gridSheet(wb, 'EKİM 3.BASAMAK', { y: 2026, m: 10, header: 'formula', period: 'name', weekdays: 'text', shift: 7 });
  // Dönem hücreleri: 2026 + 12; varsayılan tarih biçimli başlık
  gridSheet(wb, 'ARALIK 2026', { y: 2026, m: 12, header: 'date-default', period: 'num', shift: 2, misc: true });
  // Tarih satırları düzeni
  {
    const ws = wb.addWorksheet('Nöbet Listesi');
    ws.getCell(1, 1).value = 'ACİL SERVİS NÖBET LİSTESİ - ŞUBAT 2027';
    ['Tarih', 'Gün', 'Gündüz (08-16)', 'Gece 16-08', '24 Saat', 'Sorumlu', 'Açıklama'].forEach((h, i) => { ws.getCell(3, i + 1).value = h; });
    for (let d = 1; d <= 28; d++) {
      const r = 3 + d;
      ws.getCell(r, 1).value = utc(2027, 2, d); ws.getCell(r, 1).numFmt = 'dd.mm.yyyy';
      ws.getCell(r, 2).value = utc(2027, 2, d); ws.getCell(r, 2).numFmt = 'dddd';
      ws.getCell(r, 3).value = `${NAMES[d % 12]}, ${NAMES[(d + 1) % 12]}`;
      ws.getCell(r, 4).value = `${NAMES[(d + 4) % 12]} / ${NAMES[(d + 5) % 12]} ve ${NAMES[(d + 6) % 12]}`;
      ws.getCell(r, 5).value = d % 4 ? `${NAMES[(d + 8) % 12]} (Ebe)` : '-';
      ws.getCell(r, 6).value = NAMES[(d + 9) % 12];
    }
    ws.getCell(33, 1).value = 'İmza';
  }
  // Ay adı yalnızca sekme adında, yıl yok, gün adları yok -> yükleme tarihine göre yıl
  gridSheet(wb, 'OCAK', { y: 2027, m: 1, header: 'dotted', title: 'NÖBET ÇİZELGESİ', shift: 4, people: 5 });
  const gz = gridSheet(wb, 'GİZLİ', { y: 2026, m: 9, shift: 1 });
  gz.state = 'hidden';
  {
    const ws = wb.addWorksheet('Notlar');
    ws.getCell(1, 1).value = 'Bu sekme nöbet listesi değildir.';
    ws.getCell(2, 1).value = 42; ws.getCell(2, 2).value = 3.14159; ws.getCell(2, 3).value = -1500.5; ws.getCell(2, 3).numFmt = '#,##0.00;[Red]-#,##0.00';
    ws.getCell(3, 1).value = 0.25; ws.getCell(3, 1).numFmt = '0%';
    ws.getCell(3, 2).value = 1e12; ws.getCell(3, 3).value = 45000.75; ws.getCell(3, 3).numFmt = 'hh:mm:ss';
    ws.getCell(4, 1).value = 'Satır\nsonu'; ws.getCell(4, 2).value = '  baştaki boşluk';
    ws.getCell(5, 1).value = 46327; ws.getCell(5, 1).numFmt = 'mmmm yyyy';
    ws.getCell(5, 2).value = 46327; ws.getCell(5, 2).numFmt = '[$-41F]d mmmm yyyy;@';
    ws.getCell(5, 3).value = 46327.5; ws.getCell(5, 3).numFmt = '[h]:mm';
  }
  wb.views = [{ x: 0, y: 0, width: 20000, height: 10000, firstSheet: 0, activeTab: 2, visibility: 'visible' }];
  await wb.xlsx.writeFile(out);
  console.log('yazıldı: ' + out);
})().catch((e) => { console.error(e); process.exit(1); });
