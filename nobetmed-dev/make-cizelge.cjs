// "Aylık Nöbet Ücret Çizelgesi" biçiminde Excel üretir.
// Kullanım: node make-cizelge.cjs <veri.json> <çıktı klasörü>   (exceljs gerekir: npm i exceljs)
// Vardiya kodları: A = "8 8" (24 saat), G = "8 16" (gündüz 8 saat), N = "16 8" (gece 16 saat), Y = "Yİ" (yıllık izin), R = "Rp" (raporlu)
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3];
const CODE = { A: '8 8', G: '8 16', N: '16 8', Y: 'Yİ', R: 'Rp' };
const HOURS = { '8 8': 24, '8 16': 8, '16 8': 16 };
const LEAVE = ['Yİ', 'Rp'];
const GUN = ['Paz.', 'Pzt.', 'Sal.', 'Çar.', 'Per.', 'Cum.', 'Cmt.'];
const AYLAR = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];

const thin = { style: 'thin', color: { argb: 'FF000000' } };
const hair = { style: 'thin', color: { argb: 'FFB7B7B7' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const gridBox = { top: hair, left: hair, bottom: hair, right: hair };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const font = (o = {}) => ({ name: 'Calibri', size: 11, ...o });

/** "A:2,4,9-11 G:6" -> { 2: '8 8', ... } */
function parseCodes(s) {
  const out = {};
  for (const part of String(s || '').trim().split(/\s+/).filter(Boolean)) {
    const [k, list] = part.split(':');
    for (const seg of list.split(',')) {
      const [a, b] = seg.split('-').map(Number);
      for (let d = a; d <= (b || a); d++) out[d] = CODE[k];
    }
  }
  return out;
}

async function build(sheetSpec) {
  const { year, month } = spec;
  const days = new Date(year, month, 0).getDate();
  const wd = (d) => new Date(year, month - 1, d).getDay();
  const weekend = (d) => wd(d) === 0 || wd(d) === 6;
  const workdays = Array.from({ length: days }, (_, i) => i + 1).filter((d) => !weekend(d)).length;
  const mesai = workdays * 8;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'NöbetMed';
  const ws = wb.addWorksheet(sheetSpec.sheetName, { views: [{ state: 'frozen', xSplit: 3, ySplit: 10, showGridLines: true }], properties: { defaultRowHeight: 15 } });
  const D = 4; // ilk gün sütunu (D)
  const L = D + days - 1; // son gün sütunu
  const T1 = L + 1, T2 = L + 2, T3 = L + 3, T4 = L + 4; // toplam sütunları
  const col = (c) => ws.getColumn(c).letter;

  ws.getColumn(1).width = 3.3;
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 12;
  for (let c = D; c <= L; c++) ws.getColumn(c).width = 5.4;
  [T1, T2, T3, T4].forEach((c) => { ws.getColumn(c).width = 5.6; });

  // Başlık bloğu ve logo alanı
  ws.mergeCells(1, 1, 6, 3);
  ws.mergeCells(1, D, 2, L - 4);
  ws.mergeCells(3, D, 3, L - 4); ws.mergeCells(4, D, 4, L - 4); ws.mergeCells(5, D, 5, L - 4);
  [['T.C.', 3], ['SAĞLIK BAKANLIĞI', 4], [spec.hospital, 5]].forEach(([t, r]) => {
    const c = ws.getCell(r, D); c.value = t; c.font = font({ bold: true, size: 11 }); c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  if (spec.logo) {
    const id = wb.addImage({ filename: path.resolve(path.dirname(process.argv[2]), spec.logo), extension: 'png' });
    ws.addImage(id, { tl: { col: 1.25, row: 0.25 }, ext: { width: 96, height: 96 } });
  }
  // Doküman bilgileri
  const docInfo = [['Doküman No:', spec.docNo || 'KU.FR.031'], ['Yayın Tarihi', '04.01.2016'], ['Revizyon No', '01'], ['Revizyon Tarihi', '28.04.2022'], ['Sayfa No:', '1/1']];
  docInfo.forEach(([k, v], i) => {
    const r = 1 + i;
    ws.mergeCells(r, L - 3, r, L - 1); ws.mergeCells(r, L, r, T4);
    const a = ws.getCell(r, L - 3), b = ws.getCell(r, L);
    a.value = k; b.value = v;
    a.font = font({ bold: true, size: 9 }); b.font = font({ bold: true, size: 9 });
    for (let c = L - 3; c <= T4; c++) ws.getCell(r, c).border = box;
  });
  // Çizelge başlığı
  ws.mergeCells(6, D, 6, L - 4);
  ws.mergeCells(7, D, 7, L - 8);
  const title = ws.getCell(7, D); title.value = 'AYLIK NÖBET ÜCRET ÇİZELGESİ'; title.font = font({ bold: true, size: 12 }); title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(7, L - 7, 7, L - 3);
  const ait = ws.getCell(7, L - 7); ait.value = 'AİT OLDUĞU DÖNEM'; ait.font = font({ bold: true, size: 10 }); ait.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(7, L - 2, 7, L - 1);
  ws.getCell(7, L - 2).value = year; ws.getCell(7, L - 2).font = font({ bold: true, size: 10 }); ws.getCell(7, L - 2).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(7, L).value = month; ws.getCell(7, L).font = font({ bold: true, size: 10 }); ws.getCell(7, L).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(7, T1, 8, T4);
  const ay = ws.getCell(7, T1); ay.value = AYLAR[month - 1]; ay.font = font({ bold: true, size: 13 }); ay.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(7).height = 22;
  ws.getCell(8, 3).value = 'BİRİM:'; ws.getCell(8, 3).font = font({ bold: true, size: 9 });
  ws.mergeCells(8, D, 8, D + 7);
  const birim = ws.getCell(8, D); birim.value = spec.unit; birim.font = font({ bold: true, size: 10 }); birim.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(8, L - 7, 8, L - 3);
  const mes = ws.getCell(8, L - 7); mes.value = 'AYLIK MESAİ SAATİ'; mes.font = font({ bold: true, size: 8 }); mes.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(8, L - 2, 8, L - 1);
  const mesV = ws.getCell(8, L - 2); mesV.value = mesai; mesV.alignment = { horizontal: 'center' }; mesV.font = font({ size: 9 });
  for (let r = 6; r <= 8; r++) for (let c = 3; c <= T4; c++) ws.getCell(r, c).border = { top: r === 6 ? thin : undefined, bottom: r === 8 ? thin : undefined, left: c === 3 ? thin : undefined, right: c === T4 ? thin : undefined };

  // Sütun başlıkları
  ws.mergeCells(9, 1, 10, 2);
  const pl = ws.getCell(9, 1); pl.value = 'PERSONEL LİSTESİ'; pl.font = font({ bold: true, size: 9 }); pl.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(9, 3, 10, 3);
  const un = ws.getCell(9, 3); un.value = 'ÜNVANI'; un.font = font({ bold: true, size: 9 }); un.alignment = { horizontal: 'center', vertical: 'middle' };
  for (let d = 1; d <= days; d++) {
    const c = D + d - 1;
    const n = ws.getCell(9, c), g = ws.getCell(10, c);
    n.value = d; g.value = GUN[wd(d)];
    n.font = font({ bold: true, size: 11 }); g.font = font({ size: 7 });
    n.alignment = { horizontal: 'center', vertical: 'middle' }; g.alignment = { horizontal: 'center', vertical: 'middle' };
    if (wd(d) === 6) { n.fill = fill('FFD9D9D9'); g.fill = fill('FFD9D9D9'); }
  }
  [['Topl. Çalışma', T1], ['Topl İzin', T2], ['ÇALIŞMASI GEREKEN SAAT', T3], ['Fazla çalışma Saati', T4]].forEach(([t, c]) => {
    ws.mergeCells(9, c, 10, c);
    const h = ws.getCell(9, c); h.value = t; h.font = font({ bold: true, size: 7 }); h.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true };
  });
  ws.getRow(9).height = 30; ws.getRow(10).height = 30;
  for (let r = 9; r <= 10; r++) for (let c = 1; c <= T4; c++) ws.getCell(r, c).border = box;

  // Personel satırları
  const first = 11;
  const lastRow = first + sheetSpec.rows - 1;
  for (let i = 0; i < sheetSpec.rows; i++) {
    const r = first + i;
    const p = sheetSpec.people[i];
    ws.getRow(r).height = 17;
    const idx = ws.getCell(r, 1); idx.value = i + 1; idx.font = font({ size: 8 }); idx.alignment = { horizontal: 'right', vertical: 'bottom' };
    const nm = ws.getCell(r, 2); nm.font = font({ size: 12 }); nm.alignment = { vertical: 'middle' };
    const tt = ws.getCell(r, 3); tt.font = font({ size: 7 }); tt.alignment = { vertical: 'bottom' };
    const codes = p ? parseCodes(p.codes) : {};
    if (p) { nm.value = p.name; tt.value = p.title; }
    let work = 0, leave = 0;
    for (let d = 1; d <= days; d++) {
      const c = ws.getCell(r, D + d - 1);
      const v = codes[d] || null;
      c.value = v;
      c.font = font({ size: 10 });
      c.alignment = { horizontal: 'left', vertical: 'middle' };
      if (v && HOURS[v]) work += HOURS[v];
      if (v && LEAVE.includes(v) && !weekend(d)) leave += 8;
    }
    for (let c = 1; c <= T4; c++) ws.getCell(r, c).border = c <= 3 ? box : gridBox;
    if (p) {
      const rng = `${col(D)}${r}:${col(L)}${r}`;
      const hdr = `${col(D)}$10:${col(L)}$10`;
      const set = (c, formula, result, extra = {}) => { const x = ws.getCell(r, c); x.value = { formula, result }; x.alignment = { horizontal: 'right' }; x.font = font({ size: 11, ...extra }); };
      set(T1, `COUNTIF(${rng},"8 16")*8+COUNTIF(${rng},"8 8")*24+COUNTIF(${rng},"16 8")*16`, work);
      set(T2, `8*SUMPRODUCT(((${rng}="Yİ")+(${rng}="Rp"))*(${hdr}<>"Cmt.")*(${hdr}<>"Paz."))`, leave || null);
      if (!leave) ws.getCell(r, T2).value = { formula: ws.getCell(r, T2).value.formula, result: '' };
      set(T3, `$${col(L - 2)}$8-${col(T2)}${r}`, mesai - leave);
      set(T4, `${col(T1)}${r}-${col(T3)}${r}`, work - (mesai - leave), { bold: true });
    }
    ws.getCell(r, T4).fill = fill('FFD9EAD3');
  }
  // Kullanılmayan satırları gizle (orijinal şablondaki gibi)
  // (boş satırlar dosyaya yazılmadığı için her gizli satıra biçimli bir hücre konur)
  for (let r = lastRow + 1; r <= 97; r++) { ws.getRow(r).hidden = true; ws.getCell(r, 2).font = font({ size: 10 }); }

  // Günlük toplam saat satırı
  ws.getCell(98, 3).value = 'Topl Saat'; ws.getCell(98, 3).font = font({ bold: true, size: 7 });
  let grand = [0, 0, 0, 0];
  for (let d = 1; d <= days; d++) {
    const c = D + d - 1;
    let sum = 0;
    for (let i = 0; i < sheetSpec.people.length; i++) { const v = parseCodes(sheetSpec.people[i].codes)[d]; if (v && HOURS[v]) sum += HOURS[v]; }
    const rng = `${col(c)}${first}:${col(c)}${lastRow}`;
    const x = ws.getCell(98, c);
    x.value = { formula: `COUNTIF(${rng},"8 16")*8+COUNTIF(${rng},"8 8")*24+COUNTIF(${rng},"16 8")*16`, result: sum };
    x.font = font({ size: 8 }); x.alignment = { horizontal: 'left' };
  }
  [T1, T2, T3, T4].forEach((c, k) => {
    let s = 0;
    for (let r = first; r <= lastRow; r++) { const v = ws.getCell(r, c).value; if (v && typeof v.result === 'number') s += v.result; }
    grand[k] = s;
    const x = ws.getCell(98, c);
    x.value = { formula: `SUM(${col(c)}${first}:${col(c)}${lastRow})`, result: s };
    x.font = font({ size: 7 }); x.alignment = { horizontal: 'right' };
  });
  for (let c = 1; c <= T4; c++) ws.getCell(98, c).border = { top: thin, bottom: thin };
  ws.mergeCells(99, 3, 99, T4);
  const kis = ws.getCell(99, 3);
  kis.value = 'KISALTMALAR: EV.İ: Evlilik İzni   Nİ: Nöbet İzni   Yİ: Yıllık İzin   RF: Refakat İzni   Gbl.İ: Gebelik İzni   Dgml: Doğum İzni   S: Sevkli   GGr: Geçici Görev   RP: Raporlu   AYR: Ayrılış';
  kis.font = font({ size: 7 });
  ws.mergeCells(100, 3, 100, T4);
  ws.getCell(100, 3).value = 'Açıklamalar(Varsa):'; ws.getCell(100, 3).font = font({ size: 8 });
  ws.getRow(100).height = 30;

  // Vardiya kodlarına göre renk (koşullu biçimlendirme) ve açılır liste
  const area = `${col(D)}${first}:${col(L)}${lastRow}`;
  const cf = (text, argb, priority) => ({ type: 'cellIs', operator: 'equal', formulae: [`"${text}"`], priority, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } } });
  ws.addConditionalFormatting({ ref: area, rules: [cf('8 8', 'FFCBE8C4', 1), cf('8 16', 'FFFBE7B5', 2), cf('16 8', 'FFF5C2CF', 3)] });
  ws.dataValidations.add(area, { type: 'list', allowBlank: true, formulae: ['"8 8,8 16,16 8,Yİ,Rp,Nİ,RF,S,GGr,AYR"'] });
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const file = path.join(outDir, sheetSpec.file);
  await wb.xlsx.writeFile(file);
  console.log('yazıldı:', file, '· toplam saat', grand[0]);
}

(async () => {
  for (const sh of spec.sheets) await build(sh);
})();
