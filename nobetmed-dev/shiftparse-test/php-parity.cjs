// PHP nöbet çözümleyicisi (nobetmed/inc/xlsx.php + shiftparse.php) ile tarayıcıdaki shiftparse.js'i karşılaştırır.
// Kullanım: node nobetmed-dev/shiftparse-test/php-parity.cjs [dosya.xlsx | klasör ...] [--uploaded=2026-10-28] [--no-gen] [--big] [-v]
//   - nobetmed-dev/fixtures altındaki tüm .xlsx dosyaları + argümanla verilen dosya/klasörler
//   - exceljs bulunursa (NODE_PATH) make-multitab.cjs ile çok sekmeli bir çalışma kitabı üretilip eklenir (--no-gen: üretme)
//   - her dosya için: tüm dosya (extractShifts / sp_extract), her görünür sayfa tek başına (sp_extract_sheet),
//     ve hücre metinleri (tarayıcı modeli / xlsx_read) karşılaştırılır. Fark varsa çıkış kodu 1.
//   - 4 MB'tan büyük dosyalar tarayıcıda SheetJS ile okunduğundan atlanır (--big: yine de dene)
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +(process.env.PORT || 8076);
const BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const UPLOADED = ((args.find((a) => a.startsWith('--uploaded=')) || '').split('=')[1] || '2026-10-28') + ' 10:00:00';
const VERBOSE = flag('-v');

function waitPort(port, ms) {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(); });
      s.on('error', () => { if (Date.now() > until) reject(new Error('sunucu açılmadı')); else setTimeout(tryOnce, 100); });
    };
    tryOnce();
  });
}

function listXlsx(p, recursive = true) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.xlsx$/i.test(p) ? [path.resolve(p)] : [];
  const out = [];
  for (const n of fs.readdirSync(p).sort()) {
    const q = path.join(p, n);
    if (fs.statSync(q).isDirectory()) { if (recursive) out.push(...listXlsx(q)); } else if (/\.xlsx$/i.test(n) && !n.startsWith('~$')) out.push(path.resolve(q));
  }
  return out;
}

function phpParse(f) {
  try {
    const out = execFileSync('php', [path.join(__dirname, 'php-parse.php'), f.path, '--all', '--uploaded=' + f.uploaded, '--file-name=' + f.name], { maxBuffer: 512 * 1048576, encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    const txt = String(e.stdout || '');
    try { return JSON.parse(txt); } catch (_) { return { error: 'php: ' + (e.stderr || e.message).toString().slice(0, 300) }; }
  }
}

/** tests.js'teki sentetik dosyalar; sayfada çalışır, [{name, uploaded, b64}] döner */
const SYNTH = async () => {
  await loadVendor('exceljs');
  const GUN = ['Paz.', 'Pzt.', 'Sal.', 'Çar.', 'Per.', 'Cum.', 'Cmt.'];
  const cases = [
    ['yogun-bakim-nobet-kasim-2026.xlsx', '2026-09-15 10:00:00', (wb) => {
      const ws = wb.addWorksheet('Liste');
      ws.getCell(1, 1).value = 'No'; ws.getCell(1, 2).value = 'Adı Soyadı'; ws.getCell(1, 3).value = 'Görevi';
      for (let d = 1; d <= 30; d++) ws.getCell(1, 3 + d).value = String(d);
      ws.getColumn(3 + 7).hidden = true;
      const rows = [['Ayşe Nur Yıldırım', 'Hemşire', { 1: '88', 2: '8-16', 7: '16-08', 10: 'Yİ', 15: 'rp', 20: 'XYZ' }], ['Mehmet Can', 'Sağlık Memuru', { 3: '08 08', 30: 'G' }]];
      rows.forEach(([n, t, codes], i) => {
        ws.getCell(2 + i, 1).value = i + 1; ws.getCell(2 + i, 2).value = n; ws.getCell(2 + i, 3).value = t;
        Object.entries(codes).forEach(([d, c]) => { ws.getCell(2 + i, 3 + +d).value = c; });
      });
      ws.getCell(4, 2).value = 'Toplam';
      ws.getCell(5, 2).value = 'Zeki Müren Test'; ws.getCell(5, 5).value = '8 8';
    }],
    ['liste.xlsx', '2026-10-20 09:00:00', (wb) => {
      const ws = wb.addWorksheet('Sayfa1');
      ws.getCell(1, 1).value = 'Personel';
      for (let d = 1; d <= 31; d++) ws.getCell(1, 1 + d).value = d;
      ws.getCell(2, 1).value = 'Fatma Gül Ak'; ws.getCell(2, 2).value = 'G'; ws.getCell(2, 32).value = 'N';
      ws.getCell(3, 1).value = 'Hasan Ali Kara'; ws.getCell(3, 5).value = '24';
    }],
    ['OCAK.xlsx', '2026-12-20 12:00:00', (wb) => {
      const ws = wb.addWorksheet('Sayfa1');
      ws.getCell(2, 2).value = 'Ad Soyad';
      for (let d = 1; d <= 31; d++) ws.getCell(2, 2 + d).value = d;
      ws.getCell(3, 2).value = 'Eylül Nisan Kaya'; ws.getCell(3, 4).value = 'N';
    }],
    ['liste2.xlsx', '2026-10-25 12:00:00', (wb) => {
      const ws = wb.addWorksheet('Sayfa1');
      ws.getCell(1, 1).value = 'İsim';
      for (let d = 1; d <= 30; d++) { ws.getCell(1, 1 + d).value = d; ws.getCell(2, 1 + d).value = GUN[new Date(2026, 10, d).getDay()]; }
      ws.getCell(3, 1).value = 'Okan Çelik'; ws.getCell(3, 3).value = '8 16';
    }],
    ['x.xlsx', '2026-10-25 12:00:00', (wb) => {
      const ws = wb.addWorksheet('KASIM 3.BASAMAK');
      ws.getCell(1, 1).value = 'İsim';
      for (let d = 1; d <= 30; d++) { ws.getCell(1, 1 + d).value = d; ws.getCell(2, 1 + d).value = GUN[new Date(2027, 10, d).getDay()]; }
      ws.getCell(3, 1).value = 'Okan Çelik'; ws.getCell(3, 3).value = '8 16';
    }],
    ['destek.xlsx', '2026-11-20 12:00:00', (wb) => {
      const ws = wb.addWorksheet('ARALIK 2026');
      ['Tarih', 'Gündüz', 'Gece', '24 Saat Nöbet', 'Açıklama'].forEach((h, i) => { ws.getCell(1, i + 1).value = h; });
      for (let d = 1; d <= 3; d++) {
        ws.getCell(1 + d, 1).value = d;
        ws.getCell(1 + d, 2).value = 'Ali Veli, Ayşe Fatma';
        ws.getCell(1 + d, 3).value = 'Can Demir / Ece Su ve Deniz Ak';
        ws.getCell(1 + d, 4).value = 'Mert Er; Nil Su\nOya Tan (Ebe)';
        ws.getCell(1 + d, 5).value = 'not';
      }
    }],
    ['bos.xlsx', '2026-10-28 10:00:00', (wb) => { const ws = wb.addWorksheet('A'); ws.getCell(1, 1).value = 'Merhaba'; }],
    ['iki.xlsx', '2026-10-28 10:00:00', (wb) => {
      const a = wb.addWorksheet('Kapak'); a.getCell(1, 1).value = 'Kapak sayfası';
      const b = wb.addWorksheet('Kasım 2026');
      b.getCell(1, 1).value = 'Ad Soyad';
      for (let d = 1; d <= 30; d++) b.getCell(1, 1 + d).value = d;
      b.getCell(2, 1).value = 'Selin Kara'; b.getCell(2, 2).value = '16 8';
    }],
    // 28 günlük ay + 31 sütun: "günden sonraki sütunlar" uyarısı, ikinci sayfadan okuma uyarısıyla birlikte
    ['subat-listesi.xlsx', '2027-01-25 10:00:00', (wb) => {
      wb.addWorksheet('Kapak').getCell(1, 1).value = 'Kapak';
      const ws = wb.addWorksheet('ŞUBAT 2027');
      ws.getCell(1, 1).value = 'Ad Soyad';
      for (let d = 1; d <= 31; d++) ws.getCell(1, 1 + d).value = d;
      ws.getCell(2, 1).value = 'Deniz Ak Kaya'; ws.getCell(2, 2).value = '20 8'; ws.getCell(2, 30).value = '8 20'; ws.getCell(2, 32).value = 'N';
    }],
  ];
  const out = [];
  for (const [name, uploaded, build] of cases) {
    const wb = new ExcelJS.Workbook();
    build(wb);
    const u8 = new Uint8Array(await wb.xlsx.writeBuffer());
    let bin = '';
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    out.push({ name, uploaded, b64: btoa(bin) });
  }
  return out;
};

const RES_KEYS = ['ok', 'year', 'month', 'layout', 'sheetName', 'warnings', 'monthSource'];
const ENTRY_KEYS = ['name', 'title', 'day', 'date', 'code', 'raw', 'label', 'kind', 'hours', 'start', 'end'];
const norm = (v) => (v === undefined ? null : v);
/** İki çözümleme sonucunu karşılaştırır; farkların listesi */
function diffRes(js, php, where) {
  const d = [];
  if (!js || !php) return [`${where}: sonuç yok (js=${!!js}, php=${!!php})`];
  for (const k of RES_KEYS) {
    if (k === 'monthSource' && !js.ok) continue;
    if (JSON.stringify(norm(js[k])) !== JSON.stringify(norm(php[k]))) d.push(`${where} ${k}: js=${JSON.stringify(js[k])} php=${JSON.stringify(php[k])}`);
  }
  const pj = JSON.stringify(js.people || []), pp = JSON.stringify(php.people || []);
  if (pj !== pp) {
    const a = js.people || [], b = php.people || [];
    const i = a.findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(b[j]));
    d.push(`${where} people (${a.length}/${b.length}) #${i}: js=${JSON.stringify(a[i])} php=${JSON.stringify(b[i])}`);
  }
  const ej = (js.entries || []).map((e) => JSON.stringify(ENTRY_KEYS.map((k) => norm(e[k]))));
  const ep = (php.entries || []).map((e) => JSON.stringify(ENTRY_KEYS.map((k) => norm(e[k]))));
  if (ej.length !== ep.length) d.push(`${where} entries sayısı: js=${ej.length} php=${ep.length}`);
  let shown = 0;
  for (let i = 0; i < Math.max(ej.length, ep.length) && shown < 3; i++) {
    if (ej[i] !== ep[i]) { d.push(`${where} entries[${i}]: js=${ej[i]} php=${ep[i]}`); shown++; }
  }
  return d;
}

(async () => {
  const inputs = [];
  const fx = path.join(ROOT, 'nobetmed-dev', 'fixtures');
  inputs.push(...listXlsx(fx));
  for (const a of args) if (!a.startsWith('-')) inputs.push(...listXlsx(a));
  let tmp = null;
  if (!flag('--no-gen')) {
    try {
      require.resolve('exceljs');
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-parity-'));
      const out = path.join(tmp, 'cok-sekmeli-cizelge.xlsx');
      execFileSync(process.execPath, [path.join(__dirname, 'make-multitab.cjs'), out], { env: process.env, stdio: 'ignore' });
      inputs.push(out);
    } catch (e) { console.log('(exceljs bulunamadı; çok sekmeli örnek üretilmedi — NODE_PATH ile gösterin)'); }
  }
  const uniq = [...new Set(inputs)];
  const files = uniq.filter((f) => flag('--big') || fs.statSync(f).size < 4 * 1048576).map((f) => ({ path: f, name: path.basename(f), uploaded: UPLOADED }));
  const skipped = uniq.length - files.length;

  const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { stdio: ['ignore', 'ignore', 'ignore'] });
  let code = 1, browser;
  try {
    await waitPort(PORT, 10000);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    // harness.html'in kendi testleri çalışmasın
    await page.route('**/shiftparse-test/tests.js', (r) => r.fulfill({ body: '/* parity */', contentType: 'application/javascript' }));
    await page.route('**/__fx/**', (r) => {
      const i = +r.request().url().split('/__fx/')[1].split('/')[0];
      r.fulfill({ body: fs.readFileSync(files[i].path), contentType: 'application/octet-stream' });
    });
    await page.goto(`${BASE}/nobetmed-dev/shiftparse-test/harness.html`);
    await page.waitForFunction(() => typeof extractShifts === 'function' && typeof loadSheetModel === 'function');
    // tests.js'teki sentetik çalışma kitapları (tarayıcıda ExcelJS ile üretilir, kendi dosya adı/yükleme tarihiyle)
    if (!flag('--no-gen')) {
      tmp = tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'sp-parity-'));
      const synth = await page.evaluate(SYNTH);
      for (const x of synth) {
        const dir = fs.mkdtempSync(path.join(tmp, 's-'));
        const p = path.join(dir, x.name);
        fs.writeFileSync(p, Buffer.from(x.b64, 'base64'));
        files.push({ path: p, name: x.name, uploaded: x.uploaded });
      }
    }

    let nOk = 0, nDiff = 0, nSheets = 0, nCells = 0, nEntries = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const base = f.name;
      const js = await page.evaluate(async ({ i, base, up }) => {
        try {
          const model = await loadSheetModel({ name: base, url: `/__fx/${i}/${encodeURIComponent(base)}` });
          const opts = { fileName: base, uploadedAt: up };
          const full = extractShifts(model, opts);
          const sheets = model.sheets.map((sh) => {
            const cells = {};
            sh.cells.forEach((x, k) => { if (x && x.text !== '' && x.text != null) cells[k] = x.text; });
            return { name: sh.name, res: extractShifts({ sheets: [sh], active: 0 }, opts), cells, merges: sh.merges };
          });
          return { engine: model.sheets.length && !model.sheets[0].styled ? 'sheetjs' : 'exceljs', full, sheets };
        } catch (e) { return { error: String(e && e.message || e) }; }
      }, { i, base, up: f.uploaded });
      const ph = phpParse(f);
      const diffs = [];
      const notes = [];
      if (js.error || ph.error) {
        if (js.error && ph.error) notes.push('her ikisi de açamadı');
        // Kabul edilen fark: bozuk dosyada PHP Türkçe hata verir, tarayıcı (SheetJS) boş/tanınmayan sayfa gösterir
        else if (ph.error && js.full && !js.full.ok) notes.push(`bozuk dosya: PHP hata veriyor ("${ph.error}"), tarayıcıda nöbet listesi yok (kabul edilen fark)`);
        else diffs.push(`hata: js=${js.error || '-'} php=${ph.error || '-'}`);
      } else {
        if (js.engine === 'sheetjs') notes.push('tarayıcıda ExcelJS açamadı, SheetJS kullanıldı');
        diffs.push(...diffRes(js.full, ph.full, 'tüm dosya'));
        const vis = ph.sheets.filter((s) => !s.hidden);
        const visModel = ph.model.filter((s) => !s.hidden);
        if (vis.length !== js.sheets.length) diffs.push(`sayfa sayısı: js=${js.sheets.length} php=${vis.length}`);
        js.sheets.forEach((s, k) => {
          const p = vis[k], pm = visModel[k];
          if (!p) return;
          nSheets++;
          if (s.name !== p.name) diffs.push(`sayfa ${k} adı: js=${s.name} php=${p.name}`);
          diffs.push(...diffRes(s.res, p.res, `sayfa "${s.name}"`));
          nEntries += (s.res.entries || []).length;
          // Hücre metinleri
          const keys = new Set([...Object.keys(s.cells), ...Object.keys(pm.cells)]);
          let bad = 0; const ex = [];
          keys.forEach((key) => {
            nCells++;
            if (s.cells[key] !== pm.cells[key]) { bad++; if (ex.length < 3) ex.push(`${key}: js=${JSON.stringify(s.cells[key])} php=${JSON.stringify(pm.cells[key])}`); }
          });
          if (bad) (js.engine === 'sheetjs' ? notes : diffs).push(`sayfa "${s.name}" hücre metni farkı ${bad}/${keys.size}: ${ex.join(' | ')}`);
          const mj = JSON.stringify((s.merges || []).map((m) => [m.r1, m.c1, m.r2, m.c2]).sort());
          const mp = JSON.stringify((pm.merges || []).map((m) => [m.r1, m.c1, m.r2, m.c2]).sort());
          if (mj !== mp) (js.engine === 'sheetjs' ? notes : diffs).push(`sayfa "${s.name}" birleşik hücreler farklı`);
        });
      }
      const sum = js.full ? `${js.full.ok ? `${js.full.layout} ${js.full.year}-${String(js.full.month).padStart(2, '0')} "${js.full.sheetName}" ${js.full.people.length} kişi ${js.full.entries.length} kayıt` : 'nöbet listesi değil'}; ${js.sheets.length} sayfa` : '';
      if (diffs.length) {
        nDiff++;
        console.log(`DIFF ${base}  ${sum}`);
        diffs.slice(0, VERBOSE ? 50 : 8).forEach((d) => console.log('     ' + d));
        if (diffs.length > 8 && !VERBOSE) console.log(`     … ${diffs.length - 8} fark daha (-v)`);
      } else {
        nOk++;
        console.log(`OK   ${base}  ${sum}` + (f.uploaded !== UPLOADED ? ` (yükleme ${f.uploaded.slice(0, 10)})` : ''));
      }
      notes.forEach((n) => console.log('     not: ' + n));
    }
    if (errors.length) console.log('\nTarayıcı hataları:\n' + errors.join('\n'));
    console.log(`\n${files.length} dosya: ${nOk} aynı, ${nDiff} farklı; ${nSheets} sayfa, ${nCells} hücre, ${nEntries} kayıt karşılaştırıldı` + (skipped ? `; ${skipped} büyük dosya atlandı` : ''));
    code = nDiff === 0 ? 0 : 1;
  } catch (e) {
    console.error(e);
  } finally {
    if (browser) await browser.close();
    php.kill('SIGTERM');
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(code);
})();
