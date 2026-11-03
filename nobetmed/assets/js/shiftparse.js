/* dupcii — nöbet listesi çözümleyici: Excel görüntüleme modelinden kişi başı nöbetleri çıkarır.
 * Saf fonksiyonlar; DOM kullanmaz. core.js'teki trLower ve TR_MONTHS globallerine dayanır.
 *
 *   classifyCode(text, dict?)            -> sözlük kaydı (+raw) | null
 *   extractShifts(model, opts?)          -> { ok, year, month, layout, sheetName, people, entries, warnings, monthSource }
 *   matchPersonName(rosterName, userName)-> boolean
 *   summarizeMonth(entries, year, month) -> { shifts, hours, leaveDays, requiredHours, overtime }
 */
'use strict';

/* ------------------------------------------------------------------ */
/* Vardiya kodları                                                     */
/* ------------------------------------------------------------------ */
const SHIFT_CODES_DEFAULT = [
  { code: '8 8', label: '24 saat', start: '08:00', end: '08:00', hours: 24, kind: 'shift', nextDay: true },
  { code: '8 16', label: 'Gündüz', start: '08:00', end: '16:00', hours: 8, kind: 'shift' },
  { code: '16 8', label: 'Gece', start: '16:00', end: '08:00', hours: 16, kind: 'shift', nextDay: true },
  { code: '24', label: '24 saat', start: '08:00', end: '08:00', hours: 24, kind: 'shift', nextDay: true, aliases: ['24 saat', '24s'] },
  { code: 'G', label: 'Gündüz', start: '08:00', end: '16:00', hours: 8, kind: 'shift', aliases: ['Gündüz'] },
  { code: 'N', label: 'Gece', start: '16:00', end: '08:00', hours: 16, kind: 'shift', nextDay: true, aliases: ['Gece'] },
  { code: '8', label: 'Gündüz (8 saat)', start: '08:00', end: '16:00', hours: 8, kind: 'shift' },
  { code: '16', label: 'Gece (16 saat)', start: '16:00', end: '08:00', hours: 16, kind: 'shift', nextDay: true },
  { code: 'Yİ', label: 'Yıllık izin', start: null, end: null, hours: 0, kind: 'leave', aliases: ['Yıllık izin'] },
  { code: 'Y', label: 'Yıllık izin', start: null, end: null, hours: 0, kind: 'leave' },
  { code: 'Rp', label: 'Raporlu', start: null, end: null, hours: 0, kind: 'leave', aliases: ['RP', 'R', 'Rapor', 'Raporlu'] },
  { code: 'Nİ', label: 'Nöbet izni', start: null, end: null, hours: 0, kind: 'leave', aliases: ['Nöbet izni'] },
  { code: 'İ', label: 'İdari izin', start: null, end: null, hours: 0, kind: 'leave', aliases: ['İzin', 'İdari izin', 'İ.İ'] },
  { code: 'EV.İ', label: 'Evlilik izni', start: null, end: null, hours: 0, kind: 'leave', aliases: ['Evlilik izni'] },
  { code: 'RF', label: 'Refakat izni', start: null, end: null, hours: 0, kind: 'leave', aliases: ['Refakat'] },
  { code: 'Gbl.İ', label: 'Gebelik izni', start: null, end: null, hours: 0, kind: 'leave', aliases: ['Gebelik izni'] },
  { code: 'Dgml', label: 'Doğum izni', start: null, end: null, hours: 0, kind: 'leave', aliases: ['Doğum izni', 'Dğml'] },
  { code: 'S', label: 'Sevkli', start: null, end: null, hours: 0, kind: 'off', aliases: ['Sevk', 'Sevkli'] },
  { code: 'GGr', label: 'Geçici görev', start: null, end: null, hours: 0, kind: 'off', aliases: ['GG', 'Geçici görev'] },
  { code: 'AYR', label: 'Ayrılış', start: null, end: null, hours: 0, kind: 'off', aliases: ['Ayrıldı', 'Ayrılış'] },
];

const SP_FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', ê: 'e', é: 'e' };
/** Türkçe küçük harf + aksan katlama (ç→c, ı→i …) */
function spFold(s) { return trLower(s).replace(/[çğıöşüâîûêé]/g, (ch) => SP_FOLD[ch]); }
function spClean(s) { return String(s == null ? '' : s).replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim(); }

/** İki saat sayısına bölünebilen rakam dizisini çözer: '816' -> [8,16], '1608' -> [16,8] */
function spSplitHours(d) {
  for (let i = 1; i < d.length; i++) {
    const a = d.slice(0, i), b = d.slice(i);
    if (a.length > 2 || b.length > 2) continue;
    if (+a <= 24 && +b <= 24) return [+a, +b];
  }
  return null;
}
/** Kodu karşılaştırma anahtarına çevirir: büyük/küçük harf, boşluk, nokta, tire, eğik çizgi önemsiz. */
function codeKey(text) {
  let t = spClean(text);
  if (!t) return '';
  // Saat aralığı: '08:00-16:00', '8.00 - 16.00', '08–16', '8/8', '08 08'
  let m = /^(\d{1,2})(?:[:.]00)?\s*[-–—/ .]\s*(\d{1,2})(?:[:.]00)?$/.exec(t);
  if (m) return `${+m[1]} ${+m[2]}`;
  const digits = t.replace(/[\s.\-–—/_:]+/g, '');
  if (/^\d+$/.test(digits)) {
    if (/^0*(8|12|16|24)$/.test(digits)) return String(+digits);
    const hs = spSplitHours(digits);
    if (hs) return `${hs[0]} ${hs[1]}`;
    return digits;
  }
  return spFold(t).replace(/[\s.\-–—/_:'’]+/g, '');
}

const _dictIndex = new WeakMap();
function spDictIndex(dict) {
  let idx = _dictIndex.get(dict);
  if (!idx) {
    idx = new Map();
    dict.forEach((e) => {
      [e.code].concat(e.aliases || []).forEach((a) => { const k = codeKey(a); if (k && !idx.has(k)) idx.set(k, e); });
    });
    _dictIndex.set(dict, idx);
  }
  return idx;
}

/** Hücre metnini vardiya koduna çevirir. Boşsa null; bilinmeyen kod -> { kind:'shift', hours:null } */
function classifyCode(text, dict = SHIFT_CODES_DEFAULT) {
  const raw = spClean(text);
  if (!raw) return null;
  const e = spDictIndex(dict || SHIFT_CODES_DEFAULT).get(codeKey(raw));
  if (e) {
    const out = { code: e.code, label: e.label, start: e.start || null, end: e.end || null, hours: e.hours === undefined ? null : e.hours, kind: e.kind || 'shift', raw };
    if (e.nextDay) out.nextDay = true;
    return out;
  }
  return { code: raw, label: raw, start: null, end: null, hours: null, kind: 'shift', raw };
}

/* ------------------------------------------------------------------ */
/* Tarih yardımcıları                                                  */
/* ------------------------------------------------------------------ */
const SP_MONTH_KEYS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const SP_WEEKDAYS = {
  0: ['pazar', 'paz', 'pz', 'pzr', 'pa'],
  1: ['pazartesi', 'pzt', 'pt', 'pts', 'ptesi', 'pzts'],
  2: ['sali', 'sal', 'sa', 'sl'],
  3: ['carsamba', 'car', 'ca', 'crs', 'crsm', 'cr'],
  4: ['persembe', 'per', 'pe', 'prs', 'prsm', 'pr'],
  5: ['cuma', 'cum', 'cu', 'cm'],
  6: ['cumartesi', 'cmt', 'ct', 'cts', 'cmts', 'cumt'],
};
const SP_WD_MAP = (() => { const m = new Map(); Object.entries(SP_WEEKDAYS).forEach(([d, l]) => l.forEach((k) => m.set(k, +d))); return m; })();
function spWeekday(text) {
  const k = spFold(text).replace(/[\s.]+/g, '');
  return k && SP_WD_MAP.has(k) ? SP_WD_MAP.get(k) : -1;
}
const spDaysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const spDow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const sp2 = (n) => String(n).padStart(2, '0');
const spIso = (y, m, d) => `${y}-${sp2(m)}-${sp2(d)}`;

/** Metinde ay adı arar (Türkçe, büyük/küçük harf ve aksan duyarsız). 1–12 veya 0 döner. */
function spFindMonth(text) {
  const t = ' ' + spFold(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
  for (let i = 0; i < 12; i++) if (t.includes(' ' + SP_MONTH_KEYS[i] + ' ')) return i + 1;
  return 0;
}
/** Tarih parçası olmayan 4 haneli yıl (2020–2099) */
function spFindYear(text) {
  const m = /(?:^|[^\d./-])(20[2-9]\d)(?![\d]|[./-]\d)/.exec(String(text || ''));
  return m ? +m[1] : 0;
}
/** 'gg.aa.yyyy', 'g.a.yy', 'yyyy-aa-gg' -> [a, b, y, iso] (a/b sırası belirsiz olabilir) */
function spDateParts(text) {
  const t = spClean(text);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return { iso: true, y: +m[1], mo: +m[2], d: +m[3] };
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\s+\S.*)?$/.exec(t);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return { iso: false, a: +m[1], b: +m[2], y, sep: /\//.test(t) ? '/' : '.' }; }
  return null;
}

/* ------------------------------------------------------------------ */
/* Sayfa erişimi                                                       */
/* ------------------------------------------------------------------ */
function spSheetView(sh) {
  const cells = sh.cells || new Map();
  const txt = (r, c) => { const x = cells.get(r * 100000 + c); return x ? spClean(x.text) : ''; };
  const rawTxt = (r, c) => { const x = cells.get(r * 100000 + c); return x && x.text != null ? String(x.text) : ''; };
  const num = (r, c) => {
    const x = cells.get(r * 100000 + c);
    if (!x) return NaN;
    if (typeof x.v === 'number') return x.v;
    const t = spClean(x.text);
    return /^\d+(?:[.,]0+)?$/.test(t) ? parseFloat(t.replace(',', '.')) : NaN;
  };
  // Sayfanın gerçek sınırları (nRows/nCols kesilmiş olabilir)
  let nRows = sh.nRows || 0, nCols = sh.nCols || 0;
  cells.forEach((_, k) => { nRows = Math.max(nRows, Math.floor(k / 100000) + 1); nCols = Math.max(nCols, (k % 100000) + 1); });
  const rowsWith = new Set();
  cells.forEach((x, k) => { if (x && spClean(x.text)) rowsWith.add(Math.floor(k / 100000)); });
  const mergeAt = new Map();
  (sh.merges || []).forEach((m) => mergeAt.set(m.r1 * 100000 + m.c1, m));
  return { sh, txt, rawTxt, num, nRows, nCols, rowsWith, mergeAt };
}

const SP_NAME_RE = /^[\p{L}][\p{L}.'’\- ]*$/u;
/** Kişi adına benziyor mu: ≥ 2 kelime, harf, rakamsız, 5–40 karakter */
function spIsName(t) {
  t = spClean(t);
  if (t.length < 5 || t.length > 40 || !SP_NAME_RE.test(t)) return false;
  const words = t.split(' ').filter((w) => /\p{L}{2,}/u.test(w));
  return words.length >= 2 && words.length <= 6;
}
const SP_STOP_RE = /^(topl\b|toplam|genel toplam|kısaltma|kisaltma|açıklama|aciklama|notlar?\s*[:.]|imza|onay|düzenleyen|duzenleyen|hazırlayan|hazirlayan|tasdik|olur\b)/;
const SP_TITLE_RE = /(hemş|hems|ebe\b|memur|personel|tekni|doktor|hekim|uzman|sağlık|saglik|bakım|bakim|sorumlu|şef|sef\b|asistan|stajyer|sekreter|temizlik|güvenlik|guvenlik|fizyoterap|diyetisyen|psikolog|eczac|laborant|biyolog|ambulans|paramedik|att\b|acil tıp|görevli|gorevli|işçi|isci|hizmet)/;

/* ------------------------------------------------------------------ */
/* Izgara düzeni: kişi satırları × gün sütunları                       */
/* ------------------------------------------------------------------ */
/** Bir hücre metninden gün numarası (ve varsa ay/yıl) çıkarır */
function spDayCell(V, r, c) {
  const t = V.txt(r, c);
  if (!t) return null;
  const n = V.num(r, c);
  if (Number.isInteger(n) && n >= 1 && n <= 31 && /^\d{1,2}(?:[.,]0+)?$/.test(t)) return { d: n };
  let m = /^(\d{1,2})\.?(?:\s+\p{L}+\.?)?$/u.exec(t); // '1.' veya '1 Pzt'
  if (m && +m[1] >= 1 && +m[1] <= 31) return { d: +m[1] };
  const p = spDateParts(t);
  if (p) return p.iso ? { d: p.d, mo: p.mo, y: p.y } : { d: p.a, mo: p.b, y: p.y, alt: { d: p.b, mo: p.a } };
  m = /^(\d{1,2})[./](\d{1,2})\.?$/.exec(t); // '01.11'
  if (m) return { d: +m[1], mo: +m[2] };
  return null;
}

/** Gün başlığı satırını bulur: soldan sağa 1,2,3… diye artan ≥ 28 hücre */
function spFindDayHeader(V) {
  let best = null;
  const rows = [...V.rowsWith].sort((a, b) => a - b);
  for (const r of rows) {
    const seq = [];
    for (let c = 0; c < V.nCols; c++) { const x = spDayCell(V, r, c); if (x) seq.push({ c, ...x }); }
    if (seq.length < 28) continue;
    // Gün sırası: d/m karışıklığında hangi yorumun 1,2,3… verdiğine bak
    const tryRun = (pick) => {
      let run = null;
      for (let i = 0; i < seq.length; i++) {
        const d = pick(seq[i]);
        if (d === 1) {
          const cur = [{ ...seq[i], day: 1 }];
          for (let j = i + 1; j < seq.length; j++) {
            const dj = pick(seq[j]);
            if (dj === cur[cur.length - 1].day + 1) cur.push({ ...seq[j], day: dj });
            else if (dj === cur[cur.length - 1].day) continue; // aynı gün iki sütun
            else break;
          }
          if (cur.length >= 28 && cur.length <= 31 && (!run || cur.length > run.length)) run = cur;
        }
      }
      return run;
    };
    let run = tryRun((x) => x.d);
    if (!run) run = tryRun((x) => (x.alt ? x.alt.d : -1));
    if (run && (!best || run.length > best.run.length)) best = { r, run };
    if (best) break; // en üstteki geçerli başlık
  }
  if (!best) return null;
  const colDay = new Map();
  best.run.forEach((x) => {
    const m = V.mergeAt.get(best.r * 100000 + x.c);
    for (let c = x.c; c <= (m ? m.c2 : x.c); c++) colDay.set(c, x.day);
  });
  // Başlık hücreleri tam tarihse ay/yıl
  let y = 0, mo = 0;
  const first = best.run[0];
  if (first.y) {
    const alt = best.run[1] && best.run[1].alt && best.run[1].d !== 2;
    y = first.y; mo = alt ? first.alt.mo : first.mo;
  } else if (first.mo) mo = first.mo;
  return { r: best.r, colDay, firstCol: best.run[0].c, lastCol: Math.max(...colDay.keys()), days: best.run.length, y, mo };
}

/** Gün başlığının altında/üstünde haftanın günü satırı varsa 1. günün haftanın kaçıncı günü olduğunu döner */
function spWeekdayRow(V, hdr) {
  for (const r of [hdr.r + 1, hdr.r - 1, hdr.r + 2, hdr.r - 2]) {
    if (r < 0) continue;
    let hits = 0, consistent = 0, w0 = -1;
    const votes = new Map();
    hdr.colDay.forEach((day, c) => {
      const w = spWeekday(V.txt(r, c));
      if (w < 0) return;
      hits++;
      const s = (((w - (day - 1)) % 7) + 7) % 7;
      votes.set(s, (votes.get(s) || 0) + 1);
    });
    votes.forEach((n, s) => { if (n > consistent) { consistent = n; w0 = s; } });
    if (hits >= 20 && consistent >= hits * 0.9) return { r, w0 };
  }
  return null;
}

function spRowIsStop(V, r, maxCol) {
  for (let c = 0; c <= maxCol; c++) {
    const t = V.txt(r, c);
    if (t && SP_STOP_RE.test(trLower(t))) return true;
  }
  return false;
}

function spGrid(V, dict) {
  const hdr = spFindDayHeader(V);
  if (!hdr) return null;
  const wdRow = spWeekdayRow(V, hdr);
  const leftCols = [];
  for (let c = 0; c < hdr.firstCol; c++) if (!hdr.colDay.has(c)) leftCols.push(c);
  // Veri satırları: başlığın altından durdurucu satıra kadar
  const dataRows = [];
  for (let r = hdr.r + 1; r < V.nRows; r++) {
    if (wdRow && r === wdRow.r) continue;
    if (!V.rowsWith.has(r)) continue;
    if (spRowIsStop(V, r, hdr.firstCol - 1)) break;
    dataRows.push(r);
  }
  // İsim sütunu: en çok kişi adı içeren sol sütun
  let nameCol = -1, bestN = 0;
  for (const c of leftCols) {
    let n = 0;
    dataRows.forEach((r) => { if (spIsName(V.txt(r, c))) n++; });
    if (n > bestN) { bestN = n; nameCol = c; }
  }
  if (nameCol < 0) return null;
  const personRows = dataRows.filter((r) => spIsName(V.txt(r, nameCol)));
  // Ünvan sütunu: kişi satırlarında kısa metin içeren, tercihen ünvan sözcükleri geçen diğer sol sütun
  let titleCol = -1, bestT = 0;
  for (const c of leftCols) {
    if (c === nameCol) continue;
    let n = 0, kw = 0;
    personRows.forEach((r) => {
      const t = V.txt(r, c);
      if (!t || t.length > 40 || /^\d+[.,]?\d*$/.test(t)) return;
      n++;
      if (SP_TITLE_RE.test(trLower(t))) kw++;
    });
    const score = n + kw * 2;
    if (n >= Math.max(1, personRows.length * 0.4) && score > bestT) { bestT = score; titleCol = c; }
  }
  const people = [], entries = [];
  const seen = new Set();
  personRows.forEach((r) => {
    const name = V.txt(r, nameCol);
    const title = titleCol >= 0 ? V.txt(r, titleCol) : '';
    const key = trLower(name);
    if (!seen.has(key)) { seen.add(key); people.push({ name, title }); }
    hdr.colDay.forEach((day, c) => {
      const t = V.txt(r, c);
      if (!t) return;
      const k = classifyCode(t, dict);
      if (k) entries.push({ name, title, day, code: k.code, raw: k.raw, label: k.label, kind: k.kind, hours: k.hours, start: k.start, end: k.end });
    });
  });
  if (!people.length) return null;
  return { layout: 'grid', people, entries, hdr, wdRow, days: hdr.days, nameCol, titleCol, dataRows: new Set([hdr.r].concat(personRows)) };
}

/* ------------------------------------------------------------------ */
/* Tarih satırları düzeni: her satır bir gün, sütunlar vardiya          */
/* ------------------------------------------------------------------ */
const SP_DATE_HDR = /^(tarih|tarihi|nöbet tarihi|nobet tarihi|gün\s*\/\s*tarih|date|gün no|gun no)$/;
const SP_SKIP_HDR = /^(gün|gun|günler|gunler|gün adı|gun adi|sıra|sira|sıra no|sira no|no|açıklama|aciklama|not|notlar|day|hafta|izinliler|izinli)$/;
const SP_SHIFT_HDR = /(gündüz|gunduz|gece|nöbet|nobet|vardiya|sabah|akşam|aksam|öğle|ogle|icap|24|\d{1,2}\s*[-–—:]\s*\d{1,2}|sorumlu|nöbetçi|nobetci|mesai|hemşire|hemsire|personel|ekip)/;

function spHeaderCode(h, dict) {
  const t = trLower(h);
  const m = /(\d{1,2})(?:[:.]\d\d)?\s*[-–—]\s*(\d{1,2})(?:[:.]\d\d)?/.exec(h);
  if (m) { const k = classifyCode(`${+m[1]} ${+m[2]}`, dict); if (k && k.hours !== null) return k; }
  let code = null;
  if (/gündüz|gunduz|sabah/.test(t)) code = '8 16';
  else if (/gece|akşam|aksam/.test(t)) code = '16 8';
  else if (/\b24\b|nöbet|nobet/.test(t)) code = '8 8';
  if (code) { const k = classifyCode(code, dict); if (k) return { ...k, label: k.label }; }
  // Saat bilgisi olmayan sütun (ör. "Sorumlu"): nöbet saati sayılmayan görev
  return { code: h, label: h, start: null, end: null, hours: null, kind: 'role', raw: h };
}

function spSplitNames(t) {
  return String(t || '').split(/\s*(?:[,;/\r\n&+]|\s-\s|\sve\s)\s*/i)
    .map((x) => spClean(x)).filter((x) => x && /\p{L}{2,}/u.test(x) && !/^\d/.test(x) && x.length <= 60)
    .map((x) => {
      const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(x);
      return m ? { name: spClean(m[1]), title: spClean(m[2]) } : { name: x, title: '' };
    })
    .filter((x) => x.name && /\p{L}{2,}/u.test(x.name) && !/^[-–—x]$/i.test(x.name));
}

function spDateRows(V, dict) {
  // Başlık satırı: 'Tarih' benzeri bir hücre + en az bir vardiya başlığı
  let hdrRow = -1, dateCol = -1;
  const rows = [...V.rowsWith].sort((a, b) => a - b);
  for (const r of rows.slice(0, 40)) {
    let dc = -1, shiftish = 0;
    for (let c = 0; c < V.nCols; c++) {
      const t = trLower(V.txt(r, c));
      if (!t) continue;
      if (dc < 0 && SP_DATE_HDR.test(t)) dc = c;
      else if (SP_SHIFT_HDR.test(t)) shiftish++;
    }
    if (dc >= 0 && shiftish >= 1) { hdrRow = r; dateCol = dc; break; }
  }
  if (hdrRow < 0) return null;
  const cols = [];
  for (let c = 0; c < V.nCols; c++) {
    if (c === dateCol) continue;
    const h = V.txt(hdrRow, c);
    if (!h || SP_SKIP_HDR.test(trLower(h)) || SP_DATE_HDR.test(trLower(h))) continue;
    cols.push({ c, h, k: spHeaderCode(h, dict) });
  }
  // Tarih hücreleri
  const raw = [];
  for (let r = hdrRow + 1; r < V.nRows; r++) {
    if (!V.rowsWith.has(r)) continue;
    const t = V.txt(r, dateCol);
    if (!t) continue;
    if (SP_STOP_RE.test(trLower(t))) break;
    const p = spDateParts(t);
    if (p) { raw.push({ r, p }); continue; }
    const m = /^(\d{1,2})\.?(?:\s+\p{L}+)?$/u.exec(t);
    if (m && +m[1] >= 1 && +m[1] <= 31) raw.push({ r, p: { dayOnly: +m[1] } });
  }
  if (!raw.length) return null;
  // gg.aa mı aa/gg mi: değişen ve 12'yi aşan alan gündür
  const full = raw.filter((x) => x.p.y && !x.p.iso);
  let dayFirst = true;
  if (full.length) {
    const aBig = full.some((x) => x.p.a > 12), bBig = full.some((x) => x.p.b > 12);
    const aVar = new Set(full.map((x) => x.p.a)).size, bVar = new Set(full.map((x) => x.p.b)).size;
    if (bBig && !aBig) dayFirst = false;
    else if (!aBig && !bBig && bVar > aVar) dayFirst = false;
  }
  const rowsOut = raw.map(({ r, p }) => {
    if (p.dayOnly) return { r, d: p.dayOnly };
    if (p.iso) return { r, d: p.d, mo: p.mo, y: p.y };
    return dayFirst ? { r, d: p.a, mo: p.b, y: p.y } : { r, d: p.b, mo: p.a, y: p.y };
  }).filter((x) => x.d >= 1 && x.d <= 31 && (!x.mo || (x.mo >= 1 && x.mo <= 12)));
  const people = [], entries = [], seen = new Set();
  rowsOut.forEach((row) => {
    cols.forEach(({ c, k }) => {
      spSplitNames(V.rawTxt(row.r, c)).forEach(({ name, title }) => {
        const key = trLower(name);
        if (!seen.has(key)) { seen.add(key); people.push({ name, title }); }
        entries.push({ name, title, day: row.d, _mo: row.mo, _y: row.y, code: k.code, raw: V.txt(row.r, c), label: k.label, kind: k.kind, hours: k.hours, start: k.start, end: k.end });
      });
    });
  });
  if (!entries.length) return null;
  // En sık görülen ay/yıl
  const votes = new Map();
  rowsOut.forEach((x) => { if (x.y && x.mo) { const k = x.y * 100 + x.mo; votes.set(k, (votes.get(k) || 0) + 1); } });
  let ym = 0, best = 0;
  votes.forEach((n, k) => { if (n > best) { best = n; ym = k; } });
  return { layout: 'daterows', people, entries, y: ym ? Math.floor(ym / 100) : 0, mo: ym ? ym % 100 : 0, days: rowsOut.length, dataRows: new Set(rowsOut.map((x) => x.r)) };
}

/* ------------------------------------------------------------------ */
/* Ay/yıl tespiti                                                      */
/* ------------------------------------------------------------------ */
function spDetectFromSheet(V, skipRows) {
  const found = { monthYear: null, yearCell: null, monthName: null, yearText: 0, mmYYYY: null };
  const keys = [];
  V.sh.cells.forEach((x, k) => { if (x && spClean(x.text)) keys.push(k); });
  keys.sort((a, b) => a - b);
  for (const k of keys) {
    const r = Math.floor(k / 100000), c = k % 100000;
    if (skipRows.has(r)) continue; // başlık ve kişi satırları ('Nisan', 'Eylül' kişi adı olabilir)
    const t = V.txt(r, c);
    const mo = spFindMonth(t);
    const y = spFindYear(t);
    if (mo && y && !found.monthYear) found.monthYear = { y, mo };
    if (mo && !found.monthName) found.monthName = mo;
    if (/^20[2-9]\d$/.test(t) && !found.yearCell) {
      // Yanındaki (sağ, sonra alt) ilk dolu hücrede 1–12 arası ay numarası
      const m = V.mergeAt.get(k);
      let monthNum = 0;
      for (let cc = (m ? m.c2 : c) + 1; cc <= (m ? m.c2 : c) + 4 && !monthNum; cc++) {
        const tt = V.txt(r, cc);
        if (!tt) continue;
        if (/^(0?[1-9]|1[0-2])$/.test(tt)) monthNum = +tt;
        else if (spFindMonth(tt)) monthNum = spFindMonth(tt);
        break;
      }
      if (!monthNum) {
        const tt = V.txt((m ? m.r2 : r) + 1, c);
        if (/^(0?[1-9]|1[0-2])$/.test(tt)) monthNum = +tt;
      }
      if (!monthNum && c > 0) {
        const tt = V.txt(r, c - 1);
        if (/^(0?[1-9]|1[0-2])$/.test(tt)) monthNum = +tt;
      }
      found.yearCell = { y: +t, mo: monthNum };
    }
    if (y && !found.yearText) found.yearText = y;
    if (!found.mmYYYY) {
      // "11.2026" (önünde gün olmayan ay.yıl); eski Safari'de çalışsın diye geriye bakışsız
      const re = /(^|[^\d])(0?[1-9]|1[0-2])[./-](20[2-9]\d)(?!\d)/g;
      let mm;
      while ((mm = re.exec(t))) {
        const at = mm.index + mm[1].length;
        if (/[./-]/.test(mm[1]) && at >= 2 && /\d/.test(t[at - 2])) { re.lastIndex = mm.index + 1; continue; }
        found.mmYYYY = { mo: +mm[2], y: +mm[3] };
        break;
      }
    }
  }
  return found;
}

function spNameInfo(name) {
  const s = String(name || '');
  let mo = spFindMonth(s), y = spFindYear(s.replace(/[_]/g, ' '));
  if (!y) { const m = /(?:^|\D)(20[2-9]\d)(?!\d)/.exec(s); if (m) y = +m[1]; }
  if (!mo) {
    const m = /(?:^|\D)(20[2-9]\d)[-_.](0?[1-9]|1[0-2])(?!\d)/.exec(s) || null;
    const m2 = /(?:^|\D)(0?[1-9]|1[0-2])[-_.](20[2-9]\d)(?!\d)/.exec(s) || null;
    if (m) { mo = +m[2]; y = +m[1]; } else if (m2) { mo = +m2[1]; y = +m2[2]; }
  }
  return { mo, y };
}

function spParseUploaded(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (m) return { y: +m[1], mo: +m[2] };
  const d = new Date();
  return { y: d.getFullYear(), mo: d.getMonth() + 1 };
}

/** Yıl bilinmiyorsa yükleme tarihine en yakın mantıklı yıl (Aralık'ta yüklenen Ocak listesi -> ertesi yıl) */
function spYearNear(mo, up) {
  if (up.mo === 12 && mo <= 2) return up.y + 1;
  if (up.mo <= 2 && mo >= 11) return up.y - 1;
  return up.y;
}

function spResolvePeriod(V, res, opts, sheetName) {
  const warnings = [];
  const up = spParseUploaded(opts.uploadedAt);
  let year = 0, month = 0, src = '', ysrc = '';
  const set = (y, mo, s) => {
    if (!month && mo) { month = mo; src = s; }
    if (!year && y && (!mo || mo === month)) { year = y; ysrc = s; }
  };
  if (opts.month) { month = +opts.month; src = 'opts'; }
  if (opts.year) { year = +opts.year; ysrc = 'opts'; }
  if (res.layout === 'grid' && res.hdr.mo) set(res.hdr.y, res.hdr.mo, 'header-dates');
  if (res.layout === 'daterows' && res.mo) set(res.y, res.mo, 'dates');
  const f = spDetectFromSheet(V, res.dataRows || new Set());
  if (f.monthYear) set(f.monthYear.y, f.monthYear.mo, 'title');
  if (f.yearCell && f.yearCell.mo) set(f.yearCell.y, f.yearCell.mo, 'period-cells');
  if (f.monthName) set(0, f.monthName, 'month-name');
  if (f.mmYYYY) set(f.mmYYYY.y, f.mmYYYY.mo, 'mm.yyyy');
  const sn = spNameInfo(sheetName);
  if (sn.mo) set(sn.y, sn.mo, 'sheet-name');
  const fn = spNameInfo(opts.fileName ? String(opts.fileName).replace(/\.[a-z0-9]+$/i, '') : '');
  if (fn.mo) set(fn.y, fn.mo, 'file-name');
  // Yalnız yıl bilgisi
  if (month && !year) {
    if (f.yearCell) { year = f.yearCell.y; ysrc = 'year-cell'; }
    else if (f.yearText) { year = f.yearText; ysrc = 'year-text'; }
    else if (sn.y) { year = sn.y; ysrc = 'sheet-name'; }
    else if (fn.y) { year = fn.y; ysrc = 'file-name'; }
  }
  // Haftanın günü satırı: ay/yılı doğrula veya tamamla
  const wd = res.layout === 'grid' ? res.wdRow : null;
  const fits = (y, mo) => !wd || spDow(y, mo, 1) === wd.w0;
  const dayCountOk = (y, mo) => res.layout !== 'grid' || spDaysIn(y, mo) >= res.days;
  if (!month && wd) {
    // Ay bulunamadı: yükleme ayı, sonraki ay, önceki ay sırasıyla haftanın günü ve gün sayısıyla uyanı seç
    for (const off of [0, 1, -1, 2]) {
      const dt = new Date(Date.UTC(up.y, up.mo - 1 + off, 1));
      const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1;
      if (fits(y, mo) && spDaysIn(y, mo) === res.days) { month = mo; year = y; src = ysrc = 'weekdays'; break; }
    }
    if (month) warnings.push(`Ay bilgisi dosyada yazmıyor; gün adlarına göre ${TR_MONTHS[month - 1]} ${year} kabul edildi`);
  }
  if (!month) {
    month = up.mo; year = year || up.y; src = 'uploadedAt'; ysrc = ysrc || 'uploadedAt';
    warnings.push(opts.uploadedAt ? 'Ay bilgisi dosyadan bulunamadı, yükleme tarihi kullanıldı' : 'Ay bilgisi dosyadan bulunamadı, bugünün tarihi kullanıldı');
  }
  if (!year) {
    if (wd) {
      const base = spYearNear(month, up);
      for (const y of [base, base + 1, base - 1, base + 2, base - 2]) if (fits(y, month)) { year = y; ysrc = 'weekdays'; break; }
    }
    if (!year) { year = spYearNear(month, up); ysrc = 'uploadedAt'; warnings.push('Yıl bilgisi dosyadan bulunamadı, yükleme tarihine göre ' + year + ' kabul edildi'); }
  } else if (wd && !fits(year, month) && ysrc !== 'opts') {
    warnings.push(`Gün adları ${TR_MONTHS[month - 1]} ${year} takvimiyle uyuşmuyor; listeyi kontrol edin`);
  }
  if (res.layout === 'grid' && !dayCountOk(year, month)) warnings.push(`Listede ${res.days} gün var, ${TR_MONTHS[month - 1]} ${year} ise ${spDaysIn(year, month)} gün`);
  if (src === 'file-name') warnings.push('Ay bilgisi dosya adından alındı');
  else if (src === 'sheet-name') warnings.push('Ay bilgisi sayfa adından alındı');
  return { year, month, warnings, monthSource: src, yearSource: ysrc };
}

/* ------------------------------------------------------------------ */
/* Ana fonksiyon                                                       */
/* ------------------------------------------------------------------ */
function extractShifts(model, opts = {}) {
  const empty = { ok: false, year: null, month: null, layout: null, sheetName: null, people: [], entries: [], warnings: [] };
  const sheets = (model && model.sheets) || [];
  if (!sheets.length) { empty.warnings.push('Dosyada sayfa yok'); return empty; }
  const dict = opts.dict || SHIFT_CODES_DEFAULT;
  const act = Math.min(Math.max(0, model.active || 0), sheets.length - 1);
  const order = [act].concat(sheets.map((_, i) => i).filter((i) => i !== act));
  for (const i of order) {
    const sh = sheets[i];
    if (!sh || !sh.cells || !sh.cells.size) continue;
    const V = spSheetView(sh);
    let res = null;
    try { res = spGrid(V, dict) || spDateRows(V, dict); } catch (e) { res = null; }
    if (!res) continue;
    const per = spResolvePeriod(V, res, opts, sh.name);
    const { year, month } = per;
    const dim = spDaysIn(year, month);
    const entries = [];
    res.entries.forEach((e) => {
      let y = year, mo = month;
      if (e._y && e._mo) { y = e._y; mo = e._mo; }
      if (e.day > spDaysIn(y, mo)) return;
      const out = { name: e.name, title: e.title, day: e.day, date: spIso(y, mo, e.day), code: e.code, raw: e.raw, label: e.label, kind: e.kind, hours: e.hours, start: e.start, end: e.end };
      entries.push(out);
    });
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const warnings = per.warnings.slice();
    if (i !== act) warnings.push(`Nöbetler "${sh.name}" sayfasından okundu`);
    if (res.layout === 'grid' && res.days > dim) warnings.push(`${dim}. günden sonraki sütunlar yok sayıldı`);
    return { ok: true, year, month, layout: res.layout, sheetName: sh.name, people: res.people, entries, warnings, monthSource: per.monthSource };
  }
  empty.warnings.push('Bu dosyada nöbet listesi biçimi tanınamadı');
  return empty;
}

/* ------------------------------------------------------------------ */
/* İsim eşleştirme ve aylık özet                                       */
/* ------------------------------------------------------------------ */
const SP_HONORIFIC = new Set(['dr', 'uzm', 'hem', 'hems', 'op', 'doc', 'prof', 'yrd', 'ogr', 'gor', 'sb', 'sor']);
function spNameTokens(s) {
  return spFold(s).replace(/[.,;:()'’"-]+/g, ' ').split(/\s+/).filter((t) => t && !SP_HONORIFIC.has(t));
}
/** Listedeki isim ile kullanıcı adı aynı kişi mi (Türkçe harf/büyüklük duyarsız; ikinci ad/soyad eksik olabilir) */
function matchPersonName(rosterName, userName) {
  const a = spNameTokens(rosterName), b = spNameTokens(userName);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 2) return false;
  const pool = new Map();
  l.forEach((t) => pool.set(t, (pool.get(t) || 0) + 1));
  for (const t of s) { const n = pool.get(t) || 0; if (!n) return false; pool.set(t, n - 1); }
  // Ad ilk, soyad son kelime olarak tutmalı (ör. 'Ceren Yılmaz' ~ 'Ceren Sibel Özel Yılmaz')
  return s[0] === l[0] || s[s.length - 1] === l[l.length - 1];
}

/** Bir kişinin aylık özeti. entries: o kişiye ait kayıtlar. */
function summarizeMonth(entries, year, month) {
  const list = (entries || []).filter((e) => {
    if (!e || !e.date) return true;
    const [y, m] = e.date.split('-').map(Number);
    return y === +year && m === +month;
  });
  const days = spDaysIn(year, month);
  let weekdays = 0;
  for (let d = 1; d <= days; d++) { const w = spDow(year, month, d); if (w !== 0 && w !== 6) weekdays++; }
  let shifts = 0, hours = 0;
  const leave = new Set();
  list.forEach((e) => {
    if (e.kind === 'shift') { shifts++; hours += Number(e.hours) || 0; }
    else if (e.kind === 'leave') {
      const day = e.day || +String(e.date || '').slice(8, 10);
      const w = spDow(year, month, day);
      if (day && w !== 0 && w !== 6) leave.add(day);
    }
  });
  const requiredHours = weekdays * 8 - leave.size * 8;
  return { shifts, hours, leaveDays: leave.size, requiredHours, overtime: hours - requiredHours };
}
