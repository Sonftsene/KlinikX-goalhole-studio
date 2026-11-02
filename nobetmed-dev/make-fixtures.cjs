const ExcelJS = require('exceljs');
const out = process.argv[2];
const Y = 2026, M = 10; // Kasım (0 tabanlı)
const days = new Date(Y, M + 1, 0).getDate();
const GUN = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const thin = { style: 'thin', color: { argb: 'FF9CA3AF' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

(async () => {
  // 1) Hemşire listesi: kişi satırları x gün sütunları
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Kasım 2026', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }] });
  const lastCol = 3 + days + 1;
  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = 'ŞEHİR HASTANESİ YOĞUN BAKIM ÜNİTESİ — KASIM 2026 HEMŞİRE NÖBET LİSTESİ';
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.fill = fill('FF0B6A66');
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;
  const hdr = ['Sıra', 'Ad Soyad', 'Ünvan'];
  hdr.forEach((h, i) => { ws.mergeCells(2, i + 1, 3, i + 1); const c = ws.getCell(2, i + 1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.fill = fill('FFE2F3F1'); c.border = box; });
  for (let d = 1; d <= days; d++) {
    const wd = new Date(Y, M, d).getDay();
    const we = wd === 0 || wd === 6;
    const a = ws.getCell(2, 3 + d), b = ws.getCell(3, 3 + d);
    a.value = d; b.value = GUN[wd];
    [a, b].forEach((c) => { c.alignment = { horizontal: 'center' }; c.border = box; c.font = { bold: true, color: { argb: we ? 'FFFFFFFF' : 'FF1F2937' }, size: 10 }; c.fill = fill(we ? 'FFDC2626' : 'FFE2F3F1'); });
  }
  ws.mergeCells(2, lastCol, 3, lastCol);
  const tc = ws.getCell(2, lastCol); tc.value = 'Toplam'; tc.font = { bold: true }; tc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; tc.fill = fill('FFE2F3F1'); tc.border = box;
  const people = [['Ayşe Kaya', 'Sorumlu Hemşire'], ['Elif Yılmaz', 'Hemşire'], ['Burak Demir', 'Hemşire'], ['Zeynep Koç', 'Hemşire'], ['Seda Nur Aydın', 'Hemşire'], ['Ceren Aksoy', 'Eğitim Hemşiresi'], ['Mert Tan', 'Hemşire'], ['Deniz Şahin', 'Hemşire'], ['Gizem Öztürk', 'Hemşire'], ['Okan Çelik', 'Hemşire']];
  const CODE = { G: 'FFFEF3C7', N: 'FFC7D2FE', 24: 'FFFED7AA', 'İ': 'FFE5E7EB', Y: 'FFBBF7D0' };
  people.forEach(([name, title], i) => {
    const r = 4 + i;
    ws.getCell(r, 1).value = i + 1; ws.getCell(r, 2).value = name; ws.getCell(r, 3).value = title;
    for (let c = 1; c <= 3; c++) { ws.getCell(r, c).border = box; ws.getCell(r, c).alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' }; }
    ws.getCell(r, 2).font = { bold: true };
    for (let d = 1; d <= days; d++) {
      const k = (d + i * 2) % 6;
      let code = ['G', 'G', 'N', '', '', ''][k];
      if (i === 0) code = new Date(Y, M, d).getDay() % 6 === 0 ? '' : 'G';
      if (i === 4 && d >= 16 && d <= 20) code = 'Y';
      if (i === 6 && d % 7 === 3) code = '24';
      if (i === 8 && d === 11) code = 'İ';
      const c = ws.getCell(r, 3 + d);
      c.value = code || null; c.border = box; c.alignment = { horizontal: 'center' };
      if (code) { c.fill = fill(CODE[code]); c.font = { bold: code === '24' || code === 'N', size: 10 }; }
    }
    const L = ws.getColumn(4).letter, R = ws.getColumn(3 + days).letter;
    const tot = ws.getCell(r, lastCol);
    tot.value = { formula: `COUNTA(${L}${r}:${R}${r})`, result: 0 };
    let n = 0; for (let d = 1; d <= days; d++) if (ws.getCell(r, 3 + d).value) n++;
    tot.value = { formula: `COUNTA(${L}${r}:${R}${r})`, result: n };
    tot.border = box; tot.alignment = { horizontal: 'center' }; tot.font = { bold: true };
  });
  const lr = 4 + people.length + 1;
  [['G', 'Gündüz nöbeti 08:00–16:00'], ['N', 'Gece nöbeti 16:00–08:00'], ['24', '24 saat nöbet 08:00–08:00'], ['İ', 'İdari izin'], ['Y', 'Yıllık izin']].forEach(([k, txt], i) => {
    const a = ws.getCell(lr + i, 2); a.value = k; a.fill = fill(CODE[k]); a.alignment = { horizontal: 'center' }; a.border = box; a.font = { bold: true };
    ws.getCell(lr + i, 3).value = txt;
  });
  ws.getCell(lr + 6, 2).value = 'Nöbet değişikliği için en geç 3 gün önce sorumlu hemşireye başvurunuz.';
  ws.getCell(lr + 6, 2).font = { italic: true, color: { argb: 'FF6B7280' } };
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 20; ws.getColumn(3).width = 17;
  for (let d = 1; d <= days; d++) ws.getColumn(3 + d).width = 4.3;
  ws.getColumn(lastCol).width = 8;
  const notes = wb.addWorksheet('Açıklamalar');
  notes.getCell('A1').value = 'Nöbet teslim saatleri'; notes.getCell('A1').font = { bold: true, size: 13 };
  notes.getCell('A2').value = 'Gündüz teslim: 07:45 · Gece teslim: 15:45'; notes.getCell('A3').value = 'Son güncelleme'; notes.getCell('B3').value = new Date(Date.UTC(2026, 9, 30)); notes.getCell('B3').numFmt = 'dd.mm.yyyy dddd';
  notes.getColumn(1).width = 40; notes.getColumn(2).width = 24;
  await wb.xlsx.writeFile(out + '/hemsire-nobet-kasim-2026.xlsx');

  // 2) Personel listesi: gün satırları
  const wb2 = new ExcelJS.Workbook();
  const w2 = wb2.addWorksheet('Personel', { views: [{ state: 'frozen', ySplit: 2 }] });
  w2.mergeCells('A1:E1');
  w2.getCell('A1').value = 'KASIM 2026 — DESTEK PERSONELİ NÖBET LİSTESİ';
  w2.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
  w2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  w2.getRow(1).height = 26;
  ['Tarih', 'Gün', 'Gündüz (08–16)', 'Gece (16–08)', 'Sorumlu'].forEach((h, i) => { const c = w2.getCell(2, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill('FF1E40AF'); c.border = box; c.alignment = { horizontal: 'center' }; });
  const staff = ['Kemal Bulut', 'Selin Arslan', 'Hakan Yıldız', 'Merve Kaplan', 'Emre Doğan'];
  const GUNL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  for (let d = 1; d <= days; d++) {
    const r = 2 + d; const wd = new Date(Y, M, d).getDay(); const we = wd === 0 || wd === 6;
    const vals = [new Date(Date.UTC(Y, M, d)), GUNL[wd], staff[d % 5], staff[(d + 2) % 5], d % 2 ? 'Ayşe Kaya' : 'Mehmet Öztürk'];
    vals.forEach((v, i) => { const c = w2.getCell(r, i + 1); c.value = v; c.border = box; if (we) c.fill = fill('FFFEE2E2'); });
    w2.getCell(r, 1).numFmt = 'dd.mm.yyyy';
  }
  [12, 12, 22, 22, 18].forEach((w, i) => { w2.getColumn(i + 1).width = w; });
  await wb2.xlsx.writeFile(out + '/personel-nobet-kasim-2026.xlsx');
  console.log('ok');
})();
