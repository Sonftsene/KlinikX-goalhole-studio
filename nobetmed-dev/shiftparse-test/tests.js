/* shiftparse.js tarayıcı testleri — harness.html içinde çalışır, sonucu window.__results'a yazar */
'use strict';
(async () => {
  const log = [];
  let pass = 0, fail = 0;
  const ok = (cond, msg, extra) => {
    if (cond) pass++; else { fail++; log.push('BAŞARISIZ: ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
  };
  const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b });
  const section = (t) => log.push('— ' + t);
  const FX = '/nobetmed-dev/fixtures/';
  const UP = '2026-10-28 10:00:00'; // yükleme tarihi bilerek farklı ay

  try {
    /* ---------------- classifyCode ---------------- */
    section('classifyCode');
    const cc = (t) => { const k = classifyCode(t); return k && k.code; };
    ['8 8', '88', '8-8', '8/8', '08 08', '08-08', '0808', '8.8', ' 8  8 '].forEach((t) => eq(cc(t), '8 8', `classifyCode('${t}')`));
    ['8 16', '816', '8-16', '08-16', '08:00-16:00', '8/16', '0816'].forEach((t) => eq(cc(t), '8 16', `classifyCode('${t}')`));
    ['16 8', '168', '16-08', '1608', '16:00 - 08:00'].forEach((t) => eq(cc(t), '16 8', `classifyCode('${t}')`));
    eq(cc('24'), '24', "classifyCode('24')");
    [['g', 'G'], ['G', 'G'], ['n', 'N'], ['Yİ', 'Yİ'], ['yi', 'Yİ'], ['YI', 'Yİ'], ['Rp', 'Rp'], ['RP', 'Rp'], ['rp', 'Rp'], ['Nİ', 'Nİ'], ['ni', 'Nİ'], ['İ', 'İ'],
      ['Y', 'Y'], ['EV.İ', 'EV.İ'], ['ev i', 'EV.İ'], ['RF', 'RF'], ['Gbl.İ', 'Gbl.İ'], ['GBLİ', 'Gbl.İ'], ['Dgml', 'Dgml'], ['S', 'S'], ['GGr', 'GGr'], ['ggr', 'GGr'], ['AYR', 'AYR'], ['ayr.', 'AYR']]
      .forEach(([t, c]) => eq(cc(t), c, `classifyCode('${t}')`));
    const k88 = classifyCode('88');
    eq([k88.label, k88.start, k88.end, k88.hours, k88.kind, k88.raw], ['24 saat', '08:00', '08:00', 24, 'shift', '88'], 'classifyCode 8 8 kaydı');
    const k816 = classifyCode('8 16');
    eq([k816.label, k816.start, k816.end, k816.hours], ['Gündüz', '08:00', '16:00', 8], 'classifyCode 8 16 kaydı');
    const k168 = classifyCode('16 8');
    eq([k168.label, k168.hours], ['Gece', 16], 'classifyCode 16 8 kaydı');
    ['8 20', '820', '08:00-20:00'].forEach((t) => eq([cc(t), classifyCode(t).hours], ['8 20', 12], `classifyCode('${t}') 12 saat`));
    eq([classifyCode('20 8').hours, !!classifyCode('20 8').nextDay], [12, true], 'classifyCode 20 8 gece');
    eq([classifyCode('Yİ').kind, classifyCode('Yİ').hours, classifyCode('Yİ').label], ['leave', 0, 'Yıllık izin'], 'Yİ izin');
    eq(classifyCode('S').kind, 'off', 'S off');
    eq(classifyCode('Rp').label, 'Raporlu', 'Rp etiketi');
    eq(classifyCode(''), null, 'boş -> null');
    eq(classifyCode('   '), null, 'boşluk -> null');
    eq(classifyCode(null), null, 'null -> null');
    const unk = classifyCode('Kurs');
    eq([unk.code, unk.label, unk.kind, unk.hours, unk.raw], ['Kurs', 'Kurs', 'shift', null, 'Kurs'], 'bilinmeyen kod');
    const custom = [{ code: 'K', label: 'Kurs', start: '09:00', end: '17:00', hours: 8, kind: 'shift' }];
    eq(classifyCode('k', custom).label, 'Kurs', 'özel sözlük');

    /* ---------------- matchPersonName ---------------- */
    section('matchPersonName');
    [['İSMAİL KARTAL', 'İsmail Kartal', true], ['Ceren Sibel Özel Yılmaz', 'Ceren Yılmaz', true], ['Ceren Yılmaz', 'Ceren Sibel Özel Yılmaz', true],
      ['IŞIL KOÇ', 'Işıl Koç', true], ['ışıl koç', 'IŞIL KOÇ', true], ['ALİ YILDIZ', 'Ali Yildiz', true], ['ALİ  YILDIZ ', 'ali yıldız', true],
      ['Uzm. Hem. Ayşe Kaya', 'Ayşe Kaya', true], ['DİLEK ÖZTÜRK', 'Dilek Öztürk', true], ['Ayşe', 'Ayşe', true],
      ['Ali', 'Ali Yıldız', false], ['Ali Yıldız', 'Ali', false], ['Ali Yıldız', 'Ali Kaya', false], ['Ali Yıldız', 'Veli Yıldız', false],
      ['Ayşe Kaya', 'Ayşe Kayan', false], ['', 'Ali Yıldız', false], ['Ali Yıldız', '', false], ['Işık Ak', 'Isık Ak', true], ['Nur Şahin', 'Nur Şahin Kaya', true]]
      .forEach(([a, b, want]) => eq(matchPersonName(a, b), want, `matchPersonName('${a}', '${b}')`));

    /* ---------------- summarizeMonth (sentetik) ---------------- */
    section('summarizeMonth');
    {
      // Kasım 2026: 21 iş günü -> 168 saat
      const E = (day, code) => { const k = classifyCode(code); return { day, date: `2026-11-${String(day).padStart(2, '0')}`, code: k.code, kind: k.kind, hours: k.hours }; };
      const s = summarizeMonth([E(1, '8 8'), E(2, '8 16'), E(3, '16 8'), E(4, 'Yİ'), E(7, 'Yİ'), E(5, 'Rp'), E(6, 'S'), E(9, 'Kurs')], 2026, 11);
      eq(s, { shifts: 4, hours: 48, leaveDays: 2, requiredHours: 168 - 16, overtime: 48 - 152 }, 'summarizeMonth sentetik');
      eq(summarizeMonth([], 2026, 2).requiredHours, 20 * 8, 'Şubat 2026 iş günü');
    }

    /* ---------------- Şablon dosyaları (JSON gerçek değer) ---------------- */
    const spec = await (await fetch(FX + 'cizelge-ornek.json')).json();
    const CODE = { A: '8 8', G: '8 16', N: '16 8', Y: 'Yİ', R: 'Rp' };
    const parseCodes = (s) => {
      const out = {};
      for (const part of String(s || '').trim().split(/\s+/).filter(Boolean)) {
        const [k, list] = part.split(':');
        for (const seg of list.split(',')) { const [a, b] = seg.split('-').map(Number); for (let d = a; d <= (b || a); d++) out[d] = CODE[k]; }
      }
      return out;
    };
    for (const sh of spec.sheets) {
      section('şablon ' + sh.file);
      const model = await loadSheetModel({ name: sh.file, url: FX + sh.file });
      const t0 = performance.now();
      const res = extractShifts(model, { fileName: sh.file, uploadedAt: UP });
      log.push(`   ${res.people.length} kişi, ${res.entries.length} kayıt, ${(performance.now() - t0).toFixed(1)} ms, ay kaynağı=${res.monthSource}, uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.ok, res.layout, res.year, res.month, res.sheetName], [true, 'grid', 2026, 11, sh.sheetName], sh.file + ' düzen/ay');
      eq(res.monthSource, 'period-cells', sh.file + ' ay kaynağı (AİT OLDUĞU DÖNEM)');
      eq(res.warnings, [], sh.file + ' uyarı yok');
      eq(res.people, sh.people.map((p) => ({ name: p.name, title: p.title })), sh.file + ' kişiler ve ünvanlar');
      // Her kişi, her gün
      for (const p of sh.people) {
        const want = parseCodes(p.codes);
        const got = {};
        res.entries.filter((e) => e.name === p.name).forEach((e) => { got[e.day] = e.code; });
        eq(got, want, `${sh.file} ${p.name} kodları`);
      }
      const e1 = res.entries.find((e) => e.code === '8 8');
      ok(e1 && /^2026-11-\d\d$/.test(e1.date) && e1.date.endsWith(String(e1.day).padStart(2, '0')) && e1.hours === 24 && e1.start === '08:00', sh.file + ' kayıt alanları', e1);
      // Formül sonuçlarıyla karşılaştır: T1..T4 = son gün sütunundan sonraki 4 sütun
      const S0 = model.sheets[model.active];
      const days = 30, L = 2 + days; // 0 tabanlı: D=3 -> gün d sütunu 2+d
      let checked = 0;
      for (let r = 0; r < S0.nRows; r++) {
        const nm = S0.cells.get(r * 100000 + 1);
        if (!nm || !sh.people.some((p) => p.name === nm.text)) continue;
        const val = (c) => { const x = S0.cells.get(r * 100000 + c); return x && typeof x.v === 'number' ? x.v : 0; };
        const sum = summarizeMonth(res.entries.filter((e) => matchPersonName(e.name, nm.text)), 2026, 11);
        eq([sum.hours, sum.leaveDays * 8, sum.requiredHours, sum.overtime], [val(L + 1), val(L + 2), val(L + 3), val(L + 4)], `${sh.file} ${nm.text} özet = formül sonuçları`);
        // JSON'dan bağımsız hesap
        const want = parseCodes(sh.people.find((p) => p.name === nm.text).codes);
        const H = { '8 8': 24, '8 16': 8, '16 8': 16 };
        const hours = Object.values(want).reduce((a, c) => a + (H[c] || 0), 0);
        eq(sum.hours, hours, `${sh.file} ${nm.text} saat (JSON)`);
        checked++;
      }
      eq(checked, sh.people.length, sh.file + ' formül satırı sayısı');
      // Kullanıcı adıyla eşleşme
      const mine = res.entries.filter((e) => matchPersonName(e.name, 'Işıl Koç'));
      if (sh.people.some((p) => p.name === 'IŞIL KOÇ')) ok(mine.length === Object.keys(parseCodes(sh.people.find((p) => p.name === 'IŞIL KOÇ').codes)).length, 'IŞIL KOÇ ~ Işıl Koç kayıtları');
    }

    /* ---------------- Hemşire listesi (G/N/24/İ/Y) ---------------- */
    section('hemsire-nobet-kasim-2026.xlsx');
    {
      const f = 'hemsire-nobet-kasim-2026.xlsx';
      const model = await loadSheetModel({ name: f, url: FX + f });
      const res = extractShifts(model, { fileName: f, uploadedAt: UP });
      log.push(`   ${res.people.length} kişi, ${res.entries.length} kayıt, ay kaynağı=${res.monthSource}, uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.ok, res.layout, res.year, res.month, res.sheetName], [true, 'grid', 2026, 11, 'Kasım 2026'], 'hemşire düzen/ay');
      eq(res.monthSource, 'title', 'hemşire ay kaynağı başlık');
      const people = [['Ayşe Kaya', 'Sorumlu Hemşire'], ['Elif Yılmaz', 'Hemşire'], ['Burak Demir', 'Hemşire'], ['Zeynep Koç', 'Hemşire'], ['Seda Nur Aydın', 'Hemşire'], ['Ceren Aksoy', 'Eğitim Hemşiresi'], ['Mert Tan', 'Hemşire'], ['Deniz Şahin', 'Hemşire'], ['Gizem Öztürk', 'Hemşire'], ['Okan Çelik', 'Hemşire']];
      eq(res.people, people.map(([name, title]) => ({ name, title })), 'hemşire 10 kişi');
      let allOk = true;
      people.forEach(([name], i) => {
        const want = {};
        for (let d = 1; d <= 30; d++) {
          const k = (d + i * 2) % 6;
          let code = ['G', 'G', 'N', '', '', ''][k];
          if (i === 0) code = new Date(2026, 10, d).getDay() % 6 === 0 ? '' : 'G';
          if (i === 4 && d >= 16 && d <= 20) code = 'Y';
          if (i === 6 && d % 7 === 3) code = '24';
          if (i === 8 && d === 11) code = 'İ';
          if (code) want[d] = code;
        }
        const got = {};
        res.entries.filter((e) => e.name === name).forEach((e) => { got[e.day] = e.code; });
        if (JSON.stringify(got) !== JSON.stringify(want)) allOk = false;
        eq(got, want, 'hemşire ' + name + ' kodları');
      });
      ok(allOk, 'hemşire tüm kodlar');
      const seda = summarizeMonth(res.entries.filter((e) => matchPersonName(e.name, 'SEDA NUR AYDIN')), 2026, 11);
      eq(seda.leaveDays, 5, 'Seda Nur Aydın 5 gün yıllık izin');
      const mert24 = res.entries.filter((e) => e.name === 'Mert Tan' && e.code === '24');
      ok(mert24.length > 0 && mert24.every((e) => e.hours === 24 && e.label === '24 saat'), 'Mert Tan 24 saat nöbetleri');
      const gizem = res.entries.find((e) => e.name === 'Gizem Öztürk' && e.day === 11);
      eq([gizem.kind, gizem.label], ['leave', 'İdari izin'], 'Gizem 11 Kasım idari izin');
      // Bugün kim nöbette (2 Kasım 2026)
      const today = res.entries.filter((e) => e.date === '2026-11-02' && e.kind === 'shift').map((e) => e.name);
      ok(today.length >= 3 && today.includes('Ayşe Kaya'), '2 Kasım nöbetçileri', today);
    }

    /* ---------------- Personel listesi (tarih satırları) ---------------- */
    section('personel-nobet-kasim-2026.xlsx');
    {
      const f = 'personel-nobet-kasim-2026.xlsx';
      const model = await loadSheetModel({ name: f, url: FX + f });
      const res = extractShifts(model, { fileName: f, uploadedAt: UP });
      log.push(`   ${res.people.length} kişi, ${res.entries.length} kayıt, ay kaynağı=${res.monthSource}, uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.ok, res.layout, res.year, res.month], [true, 'daterows', 2026, 11], 'personel düzen/ay');
      const staff = ['Kemal Bulut', 'Selin Arslan', 'Hakan Yıldız', 'Merve Kaplan', 'Emre Doğan'];
      eq(res.people.length, 7, 'personel 7 kişi');
      let good = 0;
      for (let d = 1; d <= 30; d++) {
        const date = `2026-11-${String(d).padStart(2, '0')}`;
        const got = res.entries.filter((e) => e.date === date).map((e) => [e.name, e.code, e.hours]);
        const want = [[staff[d % 5], '8 16', 8], [staff[(d + 2) % 5], '16 8', 16], [d % 2 ? 'Ayşe Kaya' : 'Mehmet Öztürk', 'Sorumlu', null]];
        if (JSON.stringify(got) === JSON.stringify(want)) good++; else eq(got, want, 'personel ' + date);
      }
      eq(good, 30, 'personel 30 günün hepsi');
      eq(res.entries.length, 90, 'personel 90 kayıt');
    }

    /* ---------------- Sentetik dosyalar ---------------- */
    await loadVendor('exceljs');
    const mk = async (fileName, build) => {
      const wb = new ExcelJS.Workbook();
      build(wb);
      const buf = await wb.xlsx.writeBuffer();
      const url = 'mem://' + fileName;
      window.NM_FILE_REG[url] = new Blob([buf]);
      return loadSheetModel({ name: fileName, url });
    };

    section('sentetik: ay yalnızca dosya adında');
    {
      const f = 'yogun-bakim-nobet-kasim-2026.xlsx';
      const model = await mk(f, (wb) => {
        const ws = wb.addWorksheet('Liste');
        ws.getCell(1, 1).value = 'No'; ws.getCell(1, 2).value = 'Adı Soyadı'; ws.getCell(1, 3).value = 'Görevi';
        for (let d = 1; d <= 30; d++) ws.getCell(1, 3 + d).value = String(d); // metin olarak gün numaraları
        ws.getColumn(3 + 7).hidden = true; // 7. gün sütunu gizli
        const rows = [
          ['Ayşe Nur Yıldırım', 'Hemşire', { 1: '88', 2: '8-16', 7: '16-08', 10: 'Yİ', 15: 'rp', 20: 'XYZ' }],
          ['Mehmet Can', 'Sağlık Memuru', { 3: '08 08', 30: 'G' }],
        ];
        rows.forEach(([n, t, codes], i) => {
          ws.getCell(2 + i, 1).value = i + 1; ws.getCell(2 + i, 2).value = n; ws.getCell(2 + i, 3).value = t;
          Object.entries(codes).forEach(([d, c]) => { ws.getCell(2 + i, 3 + +d).value = c; });
        });
        ws.getCell(4, 2).value = 'Toplam';
        ws.getCell(5, 2).value = 'Zeki Müren Test'; ws.getCell(5, 5).value = '8 8';
      });
      const res = extractShifts(model, { fileName: f, uploadedAt: '2026-09-15 10:00:00' });
      log.push(`   ay kaynağı=${res.monthSource}, uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.ok, res.layout, res.year, res.month], [true, 'grid', 2026, 11], 'dosya adından ay');
      eq(res.monthSource, 'file-name', 'kaynak dosya adı');
      ok(res.warnings.some((w) => /dosya adı/.test(w)), 'dosya adı uyarısı', res.warnings);
      eq(res.people.map((p) => p.name + '|' + p.title), ['Ayşe Nur Yıldırım|Hemşire', 'Mehmet Can|Sağlık Memuru'], 'Toplam satırında durdu');
      eq(res.entries.filter((e) => e.name === 'Ayşe Nur Yıldırım').map((e) => [e.day, e.code, e.kind, e.hours]),
        [[1, '8 8', 'shift', 24], [2, '8 16', 'shift', 8], [7, '16 8', 'shift', 16], [10, 'Yİ', 'leave', 0], [15, 'Rp', 'leave', 0], [20, 'XYZ', 'shift', null]], 'normalleştirilmiş kodlar (gizli sütun dahil)');
      eq(res.entries.filter((e) => e.name === 'Mehmet Can').map((e) => [e.date, e.code]), [['2026-11-03', '8 8'], ['2026-11-30', 'G']], 'Mehmet Can');
    }

    section('sentetik: ay bilgisi yok');
    {
      const f = 'liste.xlsx';
      const model = await mk(f, (wb) => {
        const ws = wb.addWorksheet('Sayfa1');
        ws.getCell(1, 1).value = 'Personel';
        for (let d = 1; d <= 31; d++) ws.getCell(1, 1 + d).value = d;
        ws.getCell(2, 1).value = 'Fatma Gül Ak'; ws.getCell(2, 2).value = 'G'; ws.getCell(2, 32).value = 'N';
        ws.getCell(3, 1).value = 'Hasan Ali Kara'; ws.getCell(3, 5).value = '24';
      });
      const res = extractShifts(model, { fileName: f, uploadedAt: '2026-10-20 09:00:00' });
      log.push(`   ay kaynağı=${res.monthSource}, uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.ok, res.layout, res.year, res.month, res.monthSource], [true, 'grid', 2026, 10, 'uploadedAt'], 'yükleme tarihine düştü');
      ok(res.warnings.includes('Ay bilgisi dosyadan bulunamadı, yükleme tarihi kullanıldı'), 'yükleme tarihi uyarısı', res.warnings);
      eq(res.entries.map((e) => [e.name, e.date, e.code]), [['Fatma Gül Ak', '2026-10-01', 'G'], ['Hasan Ali Kara', '2026-10-04', '24'], ['Fatma Gül Ak', '2026-10-31', 'N']], 'kayıtlar');
      const r2 = extractShifts(model, { fileName: f, uploadedAt: '2026-10-20 09:00:00', year: 2027, month: 1 });
      eq([r2.year, r2.month, r2.monthSource], [2027, 1, 'opts'], 'opts.year/month önceliği');
    }

    section('sentetik: yalnız ay adı dosya adında, Aralık yüklemesi -> ertesi yıl');
    {
      const f = 'OCAK.xlsx';
      const model = await mk(f, (wb) => {
        const ws = wb.addWorksheet('Sayfa1');
        ws.getCell(2, 2).value = 'Ad Soyad';
        for (let d = 1; d <= 31; d++) ws.getCell(2, 2 + d).value = d;
        ws.getCell(3, 2).value = 'Eylül Nisan Kaya'; ws.getCell(3, 4).value = 'N'; // ay adı gibi görünen kişi adı
      });
      const res = extractShifts(model, { fileName: f, uploadedAt: '2026-12-20 12:00:00' });
      eq([res.year, res.month, res.monthSource], [2027, 1, 'file-name'], 'OCAK.xlsx Aralık 2026 yüklemesi -> Ocak 2027');
      eq(res.entries.map((e) => e.date), ['2027-01-02'], 'tarih');
    }

    section('sentetik: yalnız gün adları satırı');
    {
      const f = 'liste2.xlsx';
      const GUN = ['Paz.', 'Pzt.', 'Sal.', 'Çar.', 'Per.', 'Cum.', 'Cmt.'];
      const model = await mk(f, (wb) => {
        const ws = wb.addWorksheet('Sayfa1');
        ws.getCell(1, 1).value = 'İsim';
        for (let d = 1; d <= 30; d++) { ws.getCell(1, 1 + d).value = d; ws.getCell(2, 1 + d).value = GUN[new Date(2026, 10, d).getDay()]; }
        ws.getCell(3, 1).value = 'Okan Çelik'; ws.getCell(3, 3).value = '8 16';
      });
      const res = extractShifts(model, { fileName: f, uploadedAt: '2026-10-25 12:00:00' });
      log.push(`   uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.year, res.month, res.monthSource], [2026, 11, 'weekdays'], 'gün adlarından Kasım 2026');
      eq(res.entries.map((e) => e.date), ['2026-11-02'], 'tarih');
      // Gün adları ile yıl seçimi: ay sayfa adında, yıl yok
      const m2 = await mk('x.xlsx', (wb) => {
        const ws = wb.addWorksheet('KASIM 3.BASAMAK');
        ws.getCell(1, 1).value = 'İsim';
        for (let d = 1; d <= 30; d++) { ws.getCell(1, 1 + d).value = d; ws.getCell(2, 1 + d).value = GUN[new Date(2027, 10, d).getDay()]; }
        ws.getCell(3, 1).value = 'Okan Çelik'; ws.getCell(3, 3).value = '8 16';
      });
      const r2 = extractShifts(m2, { fileName: 'x.xlsx', uploadedAt: '2026-10-25 12:00:00' });
      eq([r2.year, r2.month], [2027, 11], 'sayfa adından ay, gün adlarından yıl (2027)');
    }

    section('sentetik: tarih satırları, gün numarası ve ayraçlar');
    {
      const f = 'destek.xlsx';
      const model = await mk(f, (wb) => {
        const ws = wb.addWorksheet('ARALIK 2026');
        ['Tarih', 'Gündüz', 'Gece', '24 Saat Nöbet', 'Açıklama'].forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
        for (let d = 1; d <= 3; d++) {
          ws.getCell(1 + d, 1).value = d;
          ws.getCell(1 + d, 2).value = 'Ali Veli, Ayşe Fatma';
          ws.getCell(1 + d, 3).value = 'Can Demir / Ece Su ve Deniz Ak';
          ws.getCell(1 + d, 4).value = 'Mert Er; Nil Su\nOya Tan (Ebe)';
          ws.getCell(1 + d, 5).value = 'not';
        }
      });
      const res = extractShifts(model, { fileName: f, uploadedAt: '2026-11-20 12:00:00' });
      log.push(`   ay kaynağı=${res.monthSource}, uyarılar=${JSON.stringify(res.warnings)}`);
      eq([res.ok, res.layout, res.year, res.month, res.monthSource], [true, 'daterows', 2026, 12, 'sheet-name'], 'daterows sayfa adından ay');
      eq(res.entries.filter((e) => e.day === 1).map((e) => [e.name, e.code]),
        [['Ali Veli', '8 16'], ['Ayşe Fatma', '8 16'], ['Can Demir', '16 8'], ['Ece Su', '16 8'], ['Deniz Ak', '16 8'], ['Mert Er', '8 8'], ['Nil Su', '8 8'], ['Oya Tan', '8 8']], 'isim ayırma');
      eq(res.people.find((p) => p.name === 'Oya Tan').title, 'Ebe', 'parantezdeki ünvan');
      eq(res.entries.length, 24, '3 gün × 8 kişi');
    }

    section('boş/uygunsuz model');
    {
      eq(extractShifts({ sheets: [], active: 0 }).ok, false, 'boş model');
      const m = await mk('bos.xlsx', (wb) => { const ws = wb.addWorksheet('A'); ws.getCell(1, 1).value = 'Merhaba'; });
      const r = extractShifts(m, {});
      eq([r.ok, r.layout, r.entries.length], [false, null, 0], 'tanınmayan biçim');
      ok(r.warnings.length > 0, 'tanınmayan biçim uyarısı');
    }

    section('aktif sayfa boşsa diğer sayfa');
    {
      const m = await mk('iki.xlsx', (wb) => {
        const a = wb.addWorksheet('Kapak'); a.getCell(1, 1).value = 'Kapak sayfası';
        const b = wb.addWorksheet('Kasım 2026');
        b.getCell(1, 1).value = 'Ad Soyad';
        for (let d = 1; d <= 30; d++) b.getCell(1, 1 + d).value = d;
        b.getCell(2, 1).value = 'Selin Kara'; b.getCell(2, 2).value = '16 8';
      });
      const r = extractShifts(m, { uploadedAt: UP });
      eq([r.ok, r.sheetName, r.year, r.month, r.entries.length], [true, 'Kasım 2026', 2026, 11, 1], 'ikinci sayfadan okundu');
    }
  } catch (e) {
    fail++;
    log.push('HATA: ' + (e && e.stack || e));
  }
  window.__results = { pass, fail, log };
  document.getElementById('out').textContent = log.join('\n') + `\n${pass} geçti, ${fail} başarısız`;
})();
