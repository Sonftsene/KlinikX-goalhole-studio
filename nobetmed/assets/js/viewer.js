/* dupcii — dosya görüntüleyici: Excel, PDF, Word, görsel, video, ses, metin */
'use strict';

const VENDOR = Object.assign({
  exceljs: 'assets/vendor/exceljs.min.js',
  xlsx: 'assets/vendor/xlsx.full.min.js',
  pdf: 'assets/vendor/pdf.min.js',
  pdfWorker: 'assets/vendor/pdf.worker.min.js',
  mammoth: 'assets/vendor/mammoth.browser.min.js',
  qrcode: 'assets/vendor/qrcode.js',
}, window.NM_VENDOR || {});

const _scripts = {};
function loadVendor(key) {
  if (!_scripts[key]) {
    _scripts[key] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = VENDOR[key];
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { delete _scripts[key]; reject(new Error('Görüntüleyici yüklenemedi. Bağlantınızı kontrol edin.')); };
      document.head.appendChild(s);
    });
  }
  return _scripts[key];
}

/* ---------------- Dosya türü ---------------- */
const EXT_KIND = {
  sheet: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv'],
  pdf: ['pdf'],
  docx: ['docx'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg'],
  video: ['mp4', 'm4v', 'webm', 'mov', 'ogv'],
  audio: ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'opus'],
  text: ['txt', 'md', 'log', 'json', 'xml'],
};
function extOf(name) { const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
function previewKind(att) {
  const ext = extOf(att.name);
  for (const [k, list] of Object.entries(EXT_KIND)) if (list.includes(ext)) return k;
  const m = att.mime || '';
  if (m.startsWith('image/') && !/heic|heif|tiff/.test(m)) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  return 'none';
}

/* ---------------- İndirme önbelleği ---------------- */
const _buf = new Map();
function dataUrlToBuffer(url) {
  const i = url.indexOf(',');
  const meta = url.slice(5, i), data = url.slice(i + 1);
  if (/;base64/i.test(meta)) {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out.buffer;
  }
  return new TextEncoder().encode(decodeURIComponent(data)).buffer;
}
function fetchBuffer(url) {
  if (_buf.has(url)) return _buf.get(url);
  let p;
  const local = window.NM_FILE_REG && window.NM_FILE_REG[url];
  if (local) p = local.arrayBuffer();
  else if (url.startsWith('data:')) p = Promise.resolve().then(() => dataUrlToBuffer(url));
  else {
    p = fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(r.status === 404 ? 'Dosya bulunamadı veya erişim yetkiniz yok.' : 'Dosya alınamadı (' + r.status + ').');
      return r.arrayBuffer();
    }, () => { throw new Error('Dosya alınamadı. Bağlantınızı kontrol edin.'); });
  }
  _buf.set(url, p);
  p.catch(() => _buf.delete(url));
  if (_buf.size > 12) _buf.delete(_buf.keys().next().value);
  return p;
}
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1254').decode(buf); }
}

/* =================================================================== */
/* Excel                                                                */
/* =================================================================== */
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

function hexToHsl(hex) {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  let r, g, b;
  if (s === 0) { r = g = b = l; } else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
  return [r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
function applyTint(hex, tint) {
  if (!tint) return hex;
  const [h, s, l] = hexToHsl(hex);
  const nl = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return hslToHex(h, s, Math.max(0, Math.min(1, nl)));
}
function themePalette(wb) {
  try {
    const xml = wb._themes && (wb._themes.theme1 || Object.values(wb._themes)[0]);
    if (!xml) return DEFAULT_THEME;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const scheme = doc.getElementsByTagNameNS('*', 'clrScheme')[0];
    if (!scheme) return DEFAULT_THEME;
    const pick = (tag) => {
      const el = scheme.getElementsByTagNameNS('*', tag)[0];
      if (!el) return null;
      const c = el.firstElementChild;
      return c ? (c.getAttribute('val') && c.localName === 'srgbClr' ? c.getAttribute('val') : c.getAttribute('lastClr') || null) : null;
    };
    const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    return order.map((t, i) => pick(t) || DEFAULT_THEME[i]);
  } catch (e) { return DEFAULT_THEME; }
}
function resolveColor(c, theme) {
  if (!c) return null;
  let hex = null;
  if (c.argb) hex = String(c.argb).slice(-6);
  else if (c.theme !== undefined) hex = theme[c.theme] || null;
  else if (c.indexed !== undefined) hex = c.indexed >= 64 ? null : INDEXED[c.indexed];
  // Dosyadan gelen renk yalnızca 6 haneli onaltılık olabilir (stil özniteliğine kaçış olmasın)
  if (!hex || !/^[0-9a-f]{6}$/i.test(String(hex))) return null;
  return '#' + applyTint(hex, c.tint);
}

/* ---- Sayı ve tarih biçimleri ---- */
function cleanFmt(fmt) {
  return String(fmt || '').split(';')[0].replace(/\[\$[^\]]*\]/g, '').replace(/\[(?:Red|Black|Blue|Green|White|Yellow|Cyan|Magenta|Color ?\d+|Kırmızı|Siyah|Mavi|Yeşil)\]/gi, '');
}
function isDateFmt(fmt) {
  const f = cleanFmt(fmt).replace(/"[^"]*"/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(f) && !/^[#0.,%\s]*$/.test(f) && !/General/i.test(f);
}
function serialToDate(n) { return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000)); }
function formatDate(d, fmt) {
  let f = cleanFmt(fmt);
  if (!f || /^General$/i.test(f) || f === 'mm-dd-yy' || f === 'm/d/yy' || f === 'd/m/yyyy') f = 'dd.mm.yyyy';
  const tokens = f.match(/"[^"]*"|\\.|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|\[h+\]|hh|h|ss|s|AM\/PM|am\/pm|A\/P|\.0+|./gi) || [];
  const ampm = tokens.some((t) => /AM\/PM|A\/P/i.test(t));
  const H = d.getUTCHours();
  let out = '';
  tokens.forEach((t, i) => {
    const lt = t.toLowerCase();
    const prev = tokens.slice(0, i).reverse().find((x) => /^[a-z[]/i.test(x) && !/^".*"$/.test(x));
    const next = tokens.slice(i + 1).find((x) => /^[a-z[]/i.test(x) && !/^".*"$/.test(x));
    const minute = (lt === 'm' || lt === 'mm') && ((prev && /^\[?h/i.test(prev)) || (next && /^s/i.test(next)));
    if (t[0] === '"') out += t.slice(1, -1);
    else if (t[0] === '\\') out += t[1];
    else if (lt === 'yyyy') out += d.getUTCFullYear();
    else if (lt === 'yy') out += String(d.getUTCFullYear()).slice(-2);
    else if (lt === 'mmmmm') out += TR_MONTHS[d.getUTCMonth()][0];
    else if (lt === 'mmmm') out += TR_MONTHS[d.getUTCMonth()];
    else if (lt === 'mmm') out += TR_MONTHS_S[d.getUTCMonth()];
    else if (minute) out += lt === 'mm' ? pad(d.getUTCMinutes()) : d.getUTCMinutes();
    else if (lt === 'mm') out += pad(d.getUTCMonth() + 1);
    else if (lt === 'm') out += d.getUTCMonth() + 1;
    else if (lt === 'dddd') out += TR_DAYS[d.getUTCDay()];
    else if (lt === 'ddd') out += TR_DAYS_S[d.getUTCDay()];
    else if (lt === 'dd') out += pad(d.getUTCDate());
    else if (lt === 'd') out += d.getUTCDate();
    else if (/^\[h+\]$/.test(lt)) out += Math.floor((d.getTime() - Date.UTC(1899, 11, 30)) / 3600000);
    else if (lt === 'hh') out += pad(ampm ? (H % 12 || 12) : H);
    else if (lt === 'h') out += ampm ? (H % 12 || 12) : H;
    else if (lt === 'ss') out += pad(d.getUTCSeconds());
    else if (lt === 's') out += d.getUTCSeconds();
    else if (/am\/pm/i.test(t)) out += H < 12 ? 'ÖÖ' : 'ÖS';
    else if (/a\/p/i.test(t)) out += H < 12 ? 'Ö' : 'S';
    else if (/^\.0+$/.test(t)) out += ',' + String(d.getUTCMilliseconds()).padStart(3, '0').slice(0, t.length - 1);
    else if (t === '_' || t === '*') { /* boşluk dolgusu */ }
    else out += t;
  });
  return out;
}
function formatNumber(v, fmt) {
  const sections = String(fmt || 'General').split(';');
  let f = sections[0];
  let n = v;
  if (v < 0 && sections[1]) { f = sections[1]; n = Math.abs(v); }
  else if (v === 0 && sections[2]) f = sections[2];
  f = cleanFmt(f);
  if (!f || /General|Genel/i.test(f)) {
    if (Number.isInteger(n)) return String(n);
    if (Math.abs(n) >= 1e11 || (Math.abs(n) < 1e-9 && n !== 0)) return n.toExponential(5).replace('.', ',');
    return Number(n.toPrecision(10)).toLocaleString('tr-TR', { maximumFractionDigits: 10, useGrouping: false });
  }
  if (f === '@') return String(n);
  const pct = /%/.test(f.replace(/"[^"]*"/g, ''));
  if (pct) n *= 100;
  const body = f.replace(/"[^"]*"|\\.|_.|\*./g, '');
  const dm = body.match(/\.([0#?]+)/);
  const dec = dm ? dm[1].replace(/[#?]/g, '').length : 0;
  const decMax = dm ? dm[1].length : 0;
  const grp = /[#0],[#0]/.test(body);
  const sci = /E[+-]/i.test(body);
  let num = sci ? n.toExponential(dec).replace('.', ',') : n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: Math.max(dec, decMax), useGrouping: grp });
  const first = f.search(/[0#?]/), last = Math.max(f.lastIndexOf('0'), f.lastIndexOf('#'), f.lastIndexOf('?'));
  const lit = (s) => s.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_./g, ' ').replace(/\*./g, '').replace(/[%]/g, '');
  const pre = first > 0 ? lit(f.slice(0, first)) : '';
  const post = last >= 0 ? lit(f.slice(last + 1)) : '';
  if (v < 0 && !sections[1]) num = '-' + num.replace('-', '');
  return pre + num + (pct ? '%' : '') + post;
}
function formatValue(v, fmt) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'DOĞRU' : 'YANLIŞ';
  if (v instanceof Date) return isNaN(v) ? '' : formatDate(v, fmt && isDateFmt(fmt) ? fmt : 'dd.mm.yyyy');
  if (typeof v === 'number') return fmt && isDateFmt(fmt) ? formatDate(serialToDate(v), fmt) : formatNumber(v, fmt);
  if (typeof v === 'object' && v.error) return v.error;
  return String(v);
}

function colName(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
function decodeAddr(a) {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a);
  let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: +m[2] - 1, c: c - 1 };
}

const MAX_CELLS = 250000;

function parseRef(ref) {
  const m = /^\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(String(ref).trim());
  if (!m) return null;
  const col = (s) => { let c = 0; for (const ch of s.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; };
  return { r1: +m[2] - 1, c1: col(m[1]), r2: +(m[4] || m[2]) - 1, c2: col(m[3] || m[1]) };
}
function cfLiteral(f) {
  const t = String(f == null ? '' : f).trim();
  const q = /^"(.*)"$/s.exec(t);
  if (q) return q[1].replace(/""/g, '"');
  if (t !== '' && !isNaN(+t.replace(',', '.'))) return +t.replace(',', '.');
  return undefined; // hücre başvurusu veya formül: desteklenmiyor
}
/** Bir koşullu biçim kuralının hücreye uyup uymadığı (yaygın kural türleri) */
function cfMatch(rule, cell) {
  const text = trLower(cell.text || '');
  const num = typeof cell.v === 'number' ? cell.v : (cell.text !== '' && !isNaN(+String(cell.text).replace(',', '.')) ? +String(cell.text).replace(',', '.') : NaN);
  const cmp = (lit) => (typeof lit === 'number' && !isNaN(num) ? num - lit : text.localeCompare(trLower(String(lit)), 'tr'));
  if (rule.type === 'cellIs') {
    const a = cfLiteral(rule.formulae && rule.formulae[0]);
    const b = cfLiteral(rule.formulae && rule.formulae[1]);
    if (a === undefined) return false;
    const d = cmp(a);
    switch (rule.operator) {
      case 'equal': return d === 0;
      case 'notEqual': return d !== 0;
      case 'greaterThan': return d > 0;
      case 'lessThan': return d < 0;
      case 'greaterThanOrEqual': return d >= 0;
      case 'lessThanOrEqual': return d <= 0;
      case 'between': return b !== undefined && d >= 0 && cmp(b) <= 0;
      case 'notBetween': return b !== undefined && (d < 0 || cmp(b) > 0);
      default: return false;
    }
  }
  if (rule.type === 'containsText') {
    const t = trLower(rule.text || '');
    if (!t) return false;
    if (rule.operator === 'notContains') return !text.includes(t);
    if (rule.operator === 'beginsWith') return text.startsWith(t);
    if (rule.operator === 'endsWith') return text.endsWith(t);
    return text.includes(t);
  }
  if (rule.type === 'notContainsBlanks') return text.trim() !== '';
  if (rule.type === 'expression') {
    const f = String((rule.formulae && rule.formulae[0]) || '');
    let m;
    if ((m = /SEARCH\(\s*"([^"]*)"/i.exec(f))) return /^\s*ISERROR/i.test(f) ? !text.includes(trLower(m[1])) : text.includes(trLower(m[1]));
    if ((m = /^\s*\$?[A-Z]+\$?\d+\s*=\s*"([^"]*)"\s*$/i.exec(f))) return text === trLower(m[1]);
    if ((m = /^\s*LEFT\(.*\)\s*=\s*"([^"]*)"\s*$/i.exec(f))) return text.startsWith(trLower(m[1]));
    if ((m = /^\s*RIGHT\(.*\)\s*=\s*"([^"]*)"\s*$/i.exec(f))) return text.endsWith(trLower(m[1]));
    if (/LEN\(TRIM\(.*\)\)\s*>\s*0/i.test(f)) return text.trim() !== '';
  }
  return false;
}
function applyConditional(ws, cells, theme) {
  const list = (ws.conditionalFormattings || []).map((cf) => ({
    ranges: String(cf.ref || '').split(/\s+/).map(parseRef).filter(Boolean),
    rules: (cf.rules || []).slice().sort((a, b) => (a.priority || 0) - (b.priority || 0)),
  })).filter((x) => x.ranges.length && x.rules.length);
  if (!list.length) return;
  const all = [];
  list.forEach((cf) => cf.rules.forEach((rule) => all.push({ ranges: cf.ranges, rule })));
  all.sort((a, b) => (a.rule.priority || 0) - (b.rule.priority || 0));
  cells.forEach((cell, key) => {
    const r = Math.floor(key / 100000), c = key % 100000;
    for (const { ranges, rule } of all) {
      if (!ranges.some((g) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2)) continue;
      if (!cfMatch(rule, cell)) continue;
      const st = rule.style || {};
      if (st.fill) {
        const col = resolveColor(st.fill.bgColor || st.fill.fgColor || (st.fill.stops && st.fill.stops[0] && st.fill.stops[0].color), theme);
        if (col && !cell.cfFill) cell.cfFill = col;
      }
      if (st.font && !cell.cfFont) cell.cfFont = st.font;
      if (rule.stopIfTrue) break;
    }
  });
}
function bytesToDataUrl(bytes, ext) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  const mime = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', bmp: 'bmp', webp: 'webp' }[String(ext || 'png').toLowerCase()] || 'png';
  return `data:image/${mime};base64,` + btoa(bin);
}
/** Sayfadaki resimleri (logo vb.) hücre konumlarıyla birlikte çıkarır */
function sheetImages(wb, ws) {
  if (typeof ws.getImages !== 'function') return [];
  const out = [];
  for (const im of ws.getImages()) {
    try {
      const media = wb.getImage(+im.imageId);
      if (!media) continue;
      let src = null;
      if (media.buffer) src = bytesToDataUrl(media.buffer, media.extension);
      else if (media.base64) src = String(media.base64).startsWith('data:') ? media.base64 : `data:image/${media.extension || 'png'};base64,${media.base64}`;
      if (!src) continue;
      const rg = im.range || {};
      const tl = rg.tl || {};
      const pos = (a) => ({
        c: a.nativeCol !== undefined ? a.nativeCol : Math.floor(a.col || 0),
        r: a.nativeRow !== undefined ? a.nativeRow : Math.floor(a.row || 0),
        dx: a.nativeColOff !== undefined ? a.nativeColOff / 9525 : null,
        dy: a.nativeRowOff !== undefined ? a.nativeRowOff / 9525 : null,
        fc: (a.col || 0) % 1, fr: (a.row || 0) % 1,
      });
      out.push({ src, tl: pos(tl), br: rg.br ? pos(rg.br) : null, ext: rg.ext || null });
    } catch (e) { /* resim okunamadı, atla */ }
  }
  return out;
}

/** ExcelJS çalışma kitabını görüntüleme modeline çevirir */
function modelFromExcelJS(wb) {
  const theme = themePalette(wb);
  const sheets = [];
  wb.worksheets.forEach((ws) => {
    if (ws.state === 'hidden' || ws.state === 'veryHidden') return;
    const cells = new Map();
    let maxR = -1, maxC = -1;
    const merges = [];
    const mergeSrc = ws._merges ? Object.values(ws._merges).map((m) => m.model || m) : [];
    mergeSrc.forEach((m) => {
      if (m && m.top) { merges.push({ r1: m.top - 1, c1: m.left - 1, r2: m.bottom - 1, c2: m.right - 1 }); maxR = Math.max(maxR, m.bottom - 1); maxC = Math.max(maxC, m.right - 1); }
    });
    const rowH = [], hiddenR = new Set();
    ws.eachRow({ includeEmpty: true }, (row, rn) => {
      const r = rn - 1;
      if (row.height) rowH[r] = row.height;
      if (row.hidden) hiddenR.add(r);
      row.eachCell({ includeEmpty: true }, (cell, cn) => {
        const c = cn - 1;
        if (cell.type === 1) return; // birleşik hücrenin bağlı parçası
        const st = cell.style || {};
        let text = '', rich = null, isNum = false, isBool = false;
        let v = cell.value;
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          if (v.richText) { rich = v.richText; text = v.richText.map((t) => t.text).join(''); v = undefined; }
          else if ('formula' in v || 'sharedFormula' in v || 'result' in v) v = v.result;
          else if ('hyperlink' in v || 'text' in v) { v = v.text && v.text.richText ? v.text.richText.map((t) => t.text).join('') : v.text; }
        }
        if (!rich) {
          if (v && typeof v === 'object' && v.error) text = v.error;
          else text = formatValue(v, cell.numFmt || st.numFmt);
          isNum = typeof v === 'number' || v instanceof Date;
          isBool = typeof v === 'boolean';
        }
        const fill = st.fill && st.fill.type === 'pattern' && st.fill.pattern && st.fill.pattern !== 'none'
          ? resolveColor(st.fill.fgColor || st.fill.bgColor, theme)
          : st.fill && st.fill.type === 'gradient' && st.fill.stops && st.fill.stops[0] ? resolveColor(st.fill.stops[0].color, theme) : null;
        const hasBorder = st.border && Object.values(st.border).some((b) => b && b.style);
        if (text === '' && !fill && !hasBorder) return;
        cells.set(r * 100000 + c, { text, rich, isNum, isBool, st, fill, v: typeof v === 'number' ? v : undefined });
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      });
    });
    applyConditional(ws, cells, theme);
    const imgs = sheetImages(wb, ws);
    imgs.forEach((im) => { maxR = Math.max(maxR, im.tl.r); maxC = Math.max(maxC, im.tl.c); });
    const props = ws.properties || {};
    const defColW = props.defaultColWidth || 8.43;
    const defRowH = props.defaultRowHeight || 15;
    const nCols = Math.min(maxC + 1, 400);
    let nRows = maxR + 1;
    if (nRows * Math.max(nCols, 1) > MAX_CELLS) nRows = Math.floor(MAX_CELLS / Math.max(nCols, 1));
    const colW = [], hiddenC = new Set();
    for (let c = 0; c < nCols; c++) {
      const col = ws.getColumn(c + 1);
      colW[c] = Math.round(((col && col.width) || defColW) * 7 + 5);
      if (col && col.hidden) hiddenC.add(c);
    }
    const rows = [];
    for (let r = 0; r < nRows; r++) rows[r] = Math.round((rowH[r] || defRowH) * 4 / 3);
    const view = (ws.views && ws.views[0]) || {};
    sheets.push({
      name: ws.name, nRows, nCols, cells, merges, colW, rowH: rows, hiddenR, hiddenC, theme,
      frozenR: view.state === 'frozen' ? (view.ySplit || 0) : 0,
      frozenC: view.state === 'frozen' ? (view.xSplit || 0) : 0,
      grid: view.showGridLines !== false,
      truncated: maxR + 1 > nRows,
      imgs,
      images: 0,
      styled: true,
    });
  });
  // Dosya en son hangi sekmede kaydedildiyse onunla aç
  let active = 0;
  try {
    const at = wb.views && wb.views[0] && wb.views[0].activeTab;
    const nm = at !== undefined && wb.worksheets[at] ? wb.worksheets[at].name : null;
    const i = sheets.findIndex((x) => x.name === nm);
    if (i >= 0) active = i;
  } catch (e) { /* */ }
  return { sheets, active };
}

/** SheetJS (xls, ods, csv) çalışma kitabını görüntüleme modeline çevirir */
function modelFromSheetJS(wb) {
  const sheets = [];
  wb.SheetNames.forEach((name, idx) => {
    const meta = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[idx];
    if (meta && meta.Hidden) return;
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) { sheets.push({ name, nRows: 0, nCols: 0, cells: new Map(), merges: [], colW: [], rowH: [], hiddenR: new Set(), hiddenC: new Set(), frozenR: 0, frozenC: 0, grid: true }); return; }
    const range = XLSX.utils.decode_range(ws['!ref']);
    const nCols = Math.min(range.e.c + 1, 400);
    let nRows = range.e.r + 1;
    if (nRows * nCols > MAX_CELLS) nRows = Math.floor(MAX_CELLS / nCols);
    const cells = new Map();
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        let text = cell.w !== undefined ? cell.w : cell.v !== undefined && cell.v !== null ? String(cell.v) : '';
        if (cell.t === 'b' && cell.w === undefined) text = cell.v ? 'DOĞRU' : 'YANLIŞ';
        const s = cell.s || {};
        const rgb = s.fgColor ? String(s.fgColor.rgb || '').slice(-6) : '';
        const fill = s.patternType && s.patternType !== 'none' && /^[0-9a-f]{6}$/i.test(rgb) ? '#' + rgb : null;
        if (text === '' && !fill) continue;
        cells.set(r * 100000 + c, { text, isNum: cell.t === 'n' || cell.t === 'd', isBool: cell.t === 'b', st: {}, fill });
      }
    }
    const colW = [], hiddenC = new Set(), rowH = [], hiddenR = new Set();
    const cols = ws['!cols'] || [], rws = ws['!rows'] || [];
    for (let c = 0; c < nCols; c++) {
      const ci = cols[c] || {};
      colW[c] = Math.round(ci.wpx || (ci.wch ? ci.wch * 7 + 5 : ci.width ? ci.width * 7 + 5 : 64));
      if (ci.hidden) hiddenC.add(c);
    }
    for (let r = 0; r < nRows; r++) {
      const ri = rws[r] || {};
      rowH[r] = Math.round(ri.hpx || (ri.hpt ? ri.hpt * 4 / 3 : 20));
      if (ri.hidden) hiddenR.add(r);
    }
    const merges = (ws['!merges'] || []).map((m) => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
    sheets.push({ name, nRows, nCols, cells, merges, colW, rowH, hiddenR, hiddenC, frozenR: 0, frozenC: 0, grid: true, truncated: range.e.r + 1 > nRows });
  });
  let active = 0;
  try {
    const at = wb.Workbook && wb.Workbook.WBView && wb.Workbook.WBView[0] && wb.Workbook.WBView[0].activeTab;
    const i = at !== undefined ? sheets.findIndex((x) => x.name === wb.SheetNames[at]) : -1;
    if (i >= 0) active = i;
  } catch (e) { /* */ }
  return { sheets, active };
}

const _models = new Map();
async function loadSheetModel(att) {
  const key = att.url;
  if (_models.has(key)) return _models.get(key);
  const p = (async () => {
    const ext = extOf(att.name);
    const buf = await fetchBuffer(att.url);
    const zip = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    const isZip = zip[0] === 0x50 && zip[1] === 0x4b;
    // Çok büyük dosyalarda renk/biçim yerine hız öncelikli okuyucu kullanılır
    if (isZip && (ext === 'xlsx' || ext === 'xlsm' || ext === '') && buf.byteLength < 4 * 1048576) {
      try {
        await loadVendor('exceljs');
        const wb = new ExcelJS.Workbook();
        // Görüntüleme için gerekmeyen kısımları atla: tüm sütuna/sayfaya uygulanmış açılır liste,
        // koşullu biçim veya köprü kuralları okuyucuyu dakikalarca kilitleyebiliyor.
        await wb.xlsx.load(buf, { ignoreNodes: ['dataValidations', 'hyperlinks', 'extLst', 'tableParts', 'autoFilter', 'sheetProtection', 'rowBreaks', 'colBreaks', 'pageSetup', 'printOptions', 'headerFooter', 'picture', 'legacyDrawing'] });
        return modelFromExcelJS(wb);
      } catch (e) {
        if (/Görüntüleyici yüklenemedi/.test(e.message)) throw e;
        // bazı dosyalar ExcelJS ile açılamaz; SheetJS ile dene
      }
    }
    await loadVendor('xlsx');
    const wb = ext === 'csv' ? XLSX.read(decodeText(buf), { type: 'string', raw: false, sheetRows: 20001 }) : XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true, cellNF: true, sheetRows: 20001 });
    return modelFromSheetJS(wb);
  })();
  _models.set(key, p);
  p.catch(() => _models.delete(key));
  if (_models.size > 8) _models.delete(_models.keys().next().value);
  return p;
}

const BORDER_W = { thin: 1, hair: 1, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1, slantDashDot: 2, medium: 2, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2, thick: 3, double: 3 };
function borderCss(b, theme) {
  if (!b || !b.style) return '';
  const style = b.style === 'double' ? 'double' : /dot/i.test(b.style) && !/dash/i.test(b.style) ? 'dotted' : /dash/i.test(b.style) ? 'dashed' : 'solid';
  return `${BORDER_W[b.style] || 1}px ${style} ${resolveColor(b.color, theme) || '#000'}`;
}
function fontCss(font, theme, z) {
  if (!font) return '';
  let css = '';
  if (font.size) css += `font-size:${(font.size * 4 / 3 * z).toFixed(1)}px;`;
  if (font.bold) css += 'font-weight:700;';
  if (font.italic) css += 'font-style:italic;';
  if (font.underline || font.strike) css += `text-decoration:${font.underline ? 'underline ' : ''}${font.strike ? 'line-through' : ''};`;
  const col = resolveColor(font.color, theme);
  if (col) css += `color:${col};`;
  if (font.name && !/^(Calibri|Arial)$/i.test(font.name)) css += `font-family:'${String(font.name).replace(/['";<>]/g, '')}',Calibri,Carlito,Arial,sans-serif;`;
  return css;
}

/** Görünür satır/sütun dizinleri ve birleşik hücre haritası */
function sheetLayout(sh) {
  const vr = [], vc = [];
  for (let r = 0; r < sh.nRows; r++) if (!sh.hiddenR.has(r)) vr.push(r);
  for (let c = 0; c < sh.nCols; c++) if (!sh.hiddenC.has(c)) vc.push(c);
  const master = new Map(), covered = new Set();
  for (const m of sh.merges) {
    if (m.r1 >= sh.nRows || m.c1 >= sh.nCols) continue;
    let rs = 0, cs = 0;
    for (let r = m.r1; r <= Math.min(m.r2, sh.nRows - 1); r++) if (!sh.hiddenR.has(r)) rs++;
    for (let c = m.c1; c <= Math.min(m.c2, sh.nCols - 1); c++) if (!sh.hiddenC.has(c)) cs++;
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(r * 100000 + c);
    master.set(m.r1 * 100000 + m.c1, { rs: Math.max(1, rs), cs: Math.max(1, cs), m });
  }
  return { vr, vc, master, covered };
}

function sheetHTML(sh, z, lay, maxRows, fz) {
  const { vc, master, covered } = lay;
  const vr = maxRows && lay.vr.length > maxRows ? lay.vr.slice(0, maxRows) : lay.vr;
  // Sabit (dondurulmuş) satır/sütunlar: ekrana göre daraltılmış küme gelebilir
  const fzR = fz ? fz.rows : new Set(vr.filter((r) => r < sh.frozenR));
  const fzC = fz ? fz.cols : new Set(vc.filter((c) => c < sh.frozenC));
  const hdrW = Math.round(44 * z), hdrH = Math.round(22 * z);
  const fs = (11 * 4 / 3 * z).toFixed(1);
  const total = hdrW + vc.reduce((a, c) => a + Math.round(sh.colW[c] * z), 0);
  const leftOf = {}, topOf = {};
  let acc = hdrW;
  vc.forEach((c) => { if (fzC.has(c)) { leftOf[c] = acc; acc += Math.round(sh.colW[c] * z); } });
  acc = hdrH;
  vr.forEach((r) => { if (fzR.has(r)) { topOf[r] = acc; acc += Math.round(sh.rowH[r] * z); } });
  const theme = sh.theme || DEFAULT_THEME;
  const picsAt = new Map();
  (sh.imgs || []).forEach((im) => {
    const { r, c } = im.tl;
    if (sh.hiddenR.has(r) || sh.hiddenC.has(c) || r >= sh.nRows || c >= sh.nCols) return;
    const cw = (cc) => sh.colW[cc] || 64, rh = (rr) => sh.rowH[rr] || 20;
    const dx = im.tl.dx !== null ? im.tl.dx : im.tl.fc * cw(c);
    const dy = im.tl.dy !== null ? im.tl.dy : im.tl.fr * rh(r);
    let w = 0, hgt = 0;
    if (im.ext && im.ext.width) { w = im.ext.width; hgt = im.ext.height; }
    else if (im.br) {
      for (let cc = c; cc < im.br.c; cc++) w += cw(cc);
      for (let rr = r; rr < im.br.r; rr++) hgt += rh(rr);
      w += (im.br.dx !== null ? im.br.dx : im.br.fc * cw(im.br.c)) - dx;
      hgt += (im.br.dy !== null ? im.br.dy : im.br.fr * rh(im.br.r)) - dy;
    }
    if (w <= 0 || hgt <= 0) return;
    // Resim birleşik bir hücrenin içindeyse, ana hücreye bağla
    let key = r * 100000 + c, x = dx, y = dy;
    if (covered.has(key)) {
      const owner = [...master.values()].find(({ m }) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
      if (!owner) return;
      for (let cc = owner.m.c1; cc < c; cc++) if (!sh.hiddenC.has(cc)) x += cw(cc);
      for (let rr = owner.m.r1; rr < r; rr++) if (!sh.hiddenR.has(rr)) y += rh(rr);
      key = owner.m.r1 * 100000 + owner.m.c1;
    }
    if (!picsAt.has(key)) picsAt.set(key, []);
    picsAt.get(key).push({ src: im.src, x, y, w, h: hgt });
  });
  let h = `<table class="xv-grid ${sh.grid ? '' : 'nogrid'}" style="width:${total}px;font-size:${fs}px"><colgroup><col style="width:${hdrW}px">`;
  vc.forEach((c) => { h += `<col style="width:${Math.round(sh.colW[c] * z)}px">`; });
  h += `</colgroup><thead><tr style="height:${hdrH}px"><th class="xv-corner"></th>`;
  vc.forEach((c) => { h += `<th class="xv-ch${fzC.has(c) ? ' fz' : ''}"${fzC.has(c) ? ` style="left:${leftOf[c]}px"` : ''}>${colName(c)}</th>`; });
  h += '</tr></thead><tbody>';
  vr.forEach((r) => {
    const fr = fzR.has(r);
    h += `<tr${fr ? ' data-fr="1"' : ''} style="height:${Math.round(sh.rowH[r] * z)}px"><th class="xv-rn${fr ? ' fz' : ''}"${fr ? ` style="top:${topOf[r]}px"` : ''}>${r + 1}</th>`;
    vc.forEach((c, ci) => {
      const key = r * 100000 + c;
      if (covered.has(key)) return;
      const cell = sh.cells.get(key);
      const mg = master.get(key);
      const st = (cell && cell.st) || {};
      let css = '';
      const fc = fzC.has(c);
      if (fr || fc) css += `${fr ? `top:${topOf[r]}px;` : ''}${fc ? `left:${leftOf[c]}px;` : ''}`;
      const bg = cell && (cell.cfFill || cell.fill);
      if (bg) css += `background-color:${bg};`;
      css += fontCss(cell && cell.cfFont ? { ...(st.font || {}), ...cell.cfFont } : st.font, theme, z);
      const al = st.alignment || {};
      const wrap = al.wrapText || al.shrinkToFit === false && al.wrapText;
      const ha = al.horizontal === 'centerContinuous' || al.horizontal === 'distributed' ? 'center' : al.horizontal === 'fill' ? 'left' : al.horizontal;
      if (ha && ha !== 'general') css += `text-align:${ha};`;
      else if (cell && (cell.isNum)) css += 'text-align:right;';
      else if (cell && cell.isBool) css += 'text-align:center;';
      if (al.vertical) css += `vertical-align:${al.vertical === 'middle' || al.vertical === 'center' ? 'middle' : al.vertical === 'top' ? 'top' : 'bottom'};`;
      if (al.indent) css += `padding-left:${(3 + al.indent * 9) * z}px;`;
      if (wrap) css += 'white-space:pre-wrap;';
      const rot = al.textRotation === 90 ? 'up' : (al.textRotation === 180 || al.textRotation === -90) ? 'down' : al.textRotation === 'vertical' || al.textRotation === 255 ? 'stack' : '';
      const bd = st.border || {};
      let right = bd.right, bottom = bd.bottom;
      if (mg) {
        const rc = sh.cells.get(mg.m.r1 * 100000 + mg.m.c2); if (rc && rc.st && rc.st.border && rc.st.border.right) right = rc.st.border.right;
        const bc = sh.cells.get(mg.m.r2 * 100000 + mg.m.c1); if (bc && bc.st && bc.st.border && bc.st.border.bottom) bottom = bc.st.border.bottom;
      }
      const bt = borderCss(bd.top, theme), bl = borderCss(bd.left, theme), br = borderCss(right, theme), bb = borderCss(bottom, theme);
      if (bt) css += `border-top:${bt};`;
      if (bl) css += `border-left:${bl};`;
      if (br) css += `border-right:${br};`;
      if (bb) css += `border-bottom:${bb};`;
      let cls = 'xc';
      if (fr || fc) cls += ' fz' + (fr && fc ? ' fz2' : fr ? ' fzr' : '');
      // Boş komşuya taşan metin (Excel davranışı)
      if (cell && cell.text && !wrap && !mg && !cell.isNum && (!ha || ha === 'left' || ha === 'general')) {
        const nc = vc[ci + 1];
        if (nc !== undefined && !sh.cells.get(r * 100000 + nc)?.text && !covered.has(r * 100000 + nc) && !master.has(r * 100000 + nc)) cls += ' ov';
      }
      let content = '';
      if (cell) {
        if (cell.rich) {
          content = cell.rich.map((run) => `<span style="${fontCss(run.font, theme, z)}">${esc(run.text)}</span>`).join('');
        } else content = esc(cell.text);
      }
      if (rot && content) content = `<span class="rot-${rot}">${content}</span>`;
      // Bu hücreye bağlı resimler (logo vb.)
      const pics = picsAt.get(key);
      let picHtml = '';
      if (pics) {
        cls += ' imgc';
        if (!(fr || fc)) css += 'position:relative;';
        css += `z-index:${fr && fc ? 4 : fr ? 3 : fc ? 2 : 0};`;
        picHtml = pics.map((p) => `<img class="xv-img" alt="" src="${esc(p.src)}" style="left:${p.x * z}px;top:${p.y * z}px;width:${p.w * z}px;height:${p.h * z}px">`).join('');
      }
      const span = mg ? `${mg.rs > 1 ? ` rowspan="${mg.rs}"` : ''}${mg.cs > 1 ? ` colspan="${mg.cs}"` : ''}` : '';
      h += `<td class="${cls}"${span}${css ? ` style="${css}"` : ''}>${cls.includes(' ov') ? `<span class="ovt">${content}</span>` : content}${picHtml}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody></table>';
  return { html: h, width: total };
}

/** Türkçe harf/aksan farkını yok sayan küçük harf ('DEMIR' ~ 'Demir') */
function foldName(s) { return trLower(s).replace(/[çğıöşüâîûê]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', ê: 'e' }[c])); }
function nameMatcher(name) {
  const full = foldName(name || '').replace(/\s+/g, ' ').trim();
  const parts = full.split(' ').filter((p) => p.length >= 2);
  if (!parts.length) return () => false;
  const first = parts[0], last = parts[parts.length - 1];
  return (text) => {
    const t = foldName(text).replace(/\s+/g, ' ');
    if (!t) return false;
    if (t.includes(full)) return true;
    return parts.length > 1 && t.includes(first) && t.includes(last);
  };
}

/** Excel görüntüleyiciyi kurar */
async function mountSheet(el, att, opts = {}) {
  setHTML(el, html`<div class="fv-loading"><div class="spinner"></div><span>Excel açılıyor…</span></div>`);
  const model = await loadSheetModel(att);
  if (!model.sheets.length) throw new Error('Bu dosyada görüntülenecek sayfa yok.');
  const state = { limit: {}, sheet: Math.min(model.active || 0, model.sheets.length - 1), z: opts.zoom || (window.innerWidth < 700 ? 0.7 : 0), hits: [], hitIdx: -1, mine: [], mineIdx: -1, q: '' };
  const meMatch = S.me ? nameMatcher(S.me.name) : () => false;
  setHTML(el, html`<div class="xv">
    <div class="xv-bar">
      <div class="search xv-search">${icon('search')}<input class="input" type="search" placeholder="Listede ara (isim, tarih…)" aria-label="Listede ara"></div>
      <span class="xv-count tiny faint"></span>
      ${S.me ? html`<button class="btn sm xv-me" type="button" title="Adımın geçtiği hücreler">${icon('user', 'sm')}<span>Beni bul</span></button><button class="btn sm xv-only hidden" type="button" title="Yalnızca adımın geçtiği satırları göster" aria-pressed="false">${icon('eye', 'sm')}<span>Sadece ben</span></button>` : ''}
      <div class="grow"></div>
      <div class="row" style="gap:4px">
        <button class="btn sm icon xv-zo" type="button" aria-label="Uzaklaştır">−</button>
        <button class="btn sm xv-zr" type="button" style="min-width:58px">100%</button>
        <button class="btn sm icon xv-zi" type="button" aria-label="Yakınlaştır">+</button>
        <button class="btn sm xv-fit" type="button" title="Genişliğe sığdır">Sığdır</button>
      </div>
    </div>
    <div class="xv-scroll"></div>
    <div class="xv-tabs"></div>
  </div>`);
  const scroll = el.querySelector('.xv-scroll');
  const tabs = el.querySelector('.xv-tabs');
  const countEl = el.querySelector('.xv-count');
  const input = el.querySelector('.xv-search input');
  const layouts = new Map();
  let width = 0;

  /** Dondurulmuş alan ekranın çoğunu kaplıyorsa (ör. telefonda logo + başlık bloğu),
   *  yalnızca veriye en yakın başlık satırlarını ve isim sütununu sabit tut. */
  const frozenFor = (sh, lay) => {
    const z = state.z;
    const H = scroll.clientHeight || 600, W = scroll.clientWidth || 1000;
    let rows = lay.vr.filter((r) => r < sh.frozenR);
    let cols = lay.vc.filter((c) => c < sh.frozenC);
    const hOf = (r) => sh.rowH[r] * z, wOf = (c) => sh.colW[c] * z;
    if (rows.reduce((a, r) => a + hOf(r), 0) > H * 0.3) {
      const keep = [];
      let acc = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (keep.length && acc + hOf(rows[i]) > H * 0.22) break;
        keep.unshift(rows[i]); acc += hOf(rows[i]);
      }
      rows = keep;
    }
    if (cols.reduce((a, c) => a + wOf(c), 0) > W * 0.5) {
      // En geniş sütunu (genelde isimler) ve solundaki dar sütunları (sıra no) sabit tut
      const widest = cols.slice().sort((a, b) => sh.colW[b] - sh.colW[a])[0];
      const upTo = cols.filter((c) => c <= widest);
      cols = upTo.reduce((a, c) => a + wOf(c), 0) <= W * 0.5 ? upTo : widest !== undefined && wOf(widest) <= W * 0.5 ? [widest] : [];
    }
    return { rows: new Set(rows), cols: new Set(cols) };
  };
  /** "Sadece ben": başlık satırları + adımın geçtiği satırlar dışındakileri gizle */
  const meRowsOf = (sh) => {
    const rows = [];
    for (let r = 0; r < sh.nRows; r++) {
      if (sh.hiddenR.has(r)) continue;
      for (let c = 0; c < sh.nCols; c++) { const x = sh.cells.get(r * 100000 + c); if (x && x.text && meMatch(x.text)) { rows.push(r); break; } }
    }
    return rows;
  };
  const onlyMeSheet = (sh) => {
    const mine = meRowsOf(sh);
    if (!mine.length) return null;
    const keep = new Set(mine);
    const first = mine[0];
    const hdrCell = /^(\d{1,2}\.?|pzt|pazartesi|sal|salı|çar|çarşamba|per|perşembe|cum|cuma|cmt|cts|cumartesi|paz|pazar)$/;
    for (let r = 0; r < first; r++) {
      if (r < sh.frozenR) { keep.add(r); continue; }
      let n = 0, title = false;
      for (let c = 0; c < sh.nCols; c++) {
        const x = sh.cells.get(r * 100000 + c);
        if (!x || !x.text) continue;
        const t = trLower(String(x.text).trim());
        if (hdrCell.test(t)) n++;
        if (/ad[ıi]? ?soyad|ünvan|unvan|^isim|^personel$/.test(t)) title = true;
      }
      if (n >= 7 || title) keep.add(r);
    }
    for (const m of sh.merges) {
      if (m.r2 - m.r1 > 3) continue;
      for (let r = m.r1; r <= m.r2; r++) if (keep.has(r)) { for (let k = m.r1; k <= m.r2; k++) keep.add(k); break; }
    }
    const hiddenR = new Set(sh.hiddenR);
    for (let r = 0; r < sh.nRows; r++) if (!keep.has(r)) hiddenR.add(r);
    return { ...sh, hiddenR };
  };
  const onlyBtn = el.querySelector('.xv-only');
  try { state.onlyMe = localStorage.getItem('nm-onlyme') === '1'; } catch (e) { state.onlyMe = false; }
  const draw = () => {
    let sh = model.sheets[state.sheet];
    const lk = state.sheet + (state.onlyMe ? ':me' : '');
    if (state.onlyMe && !layouts.has(lk)) { const v = onlyMeSheet(sh); if (v) { layouts.set(lk, sheetLayout(v)); layouts.set(lk + ':sh', v); } }
    const useMe = state.onlyMe && layouts.has(lk);
    if (useMe) sh = layouts.get(lk + ':sh');
    if (onlyBtn) { onlyBtn.classList.toggle('hidden', !meRowsOf(model.sheets[state.sheet]).length); onlyBtn.classList.toggle('active', useMe); onlyBtn.setAttribute('aria-pressed', useMe ? 'true' : 'false'); }
    const key = useMe ? lk : state.sheet;
    if (!layouts.has(key)) layouts.set(key, sheetLayout(sh));
    const keepL = scroll.scrollLeft / Math.max(1, scroll.scrollWidth), keepT = scroll.scrollTop / Math.max(1, scroll.scrollHeight);
    const lay = layouts.get(key);
    if (!state.limit[state.sheet]) state.limit[state.sheet] = Math.max(200, Math.floor(30000 / Math.max(1, lay.vc.length)));
    const limit = state.limit[state.sheet];
    const out = sheetHTML(sh, state.z, lay, limit, frozenFor(sh, lay));
    width = out.width;
    const left = lay.vr.length - limit;
    scroll.innerHTML = out.html
      + (left > 0 ? `<div class="xv-note"><button type="button" class="btn sm xv-more">Sonraki ${Math.min(left, limit)} satırı göster</button> <span>${lay.vr.length} satırın ${limit} tanesi gösteriliyor</span></div>` : '')
      + (sh.truncated ? '<div class="xv-note">Dosya çok büyük olduğu için ilk satırlar gösteriliyor. Tamamı için dosyayı indirin.</div>' : '')
      + (sh.images ? '<div class="xv-note">Bu sayfada görsel veya şekil var; onlar burada gösterilemiyor. Tam görünüm için dosyayı indirin.</div>' : '')
      + (!sh.nRows ? '<div class="xv-note">Bu sayfada gösterilecek hücre yok.</div>' : '');
    // Sabit satırların konumunu gerçek (ekranda ölçülen) yüksekliklere göre düzelt
    const headRow = scroll.querySelector('thead tr');
    let fTop = headRow ? headRow.getBoundingClientRect().height : 0;
    scroll.querySelectorAll('tbody tr[data-fr]').forEach((tr) => {
      const t = Math.floor(fTop * 2) / 2;
      tr.querySelectorAll('th.fz, td.fzr, td.fz2').forEach((c) => { c.style.top = t + 'px'; });
      fTop += tr.getBoundingClientRect().height;
    });
    scroll.scrollLeft = keepL * scroll.scrollWidth; scroll.scrollTop = keepT * scroll.scrollHeight;
    el.querySelector('.xv-zr').textContent = Math.round(state.z * 100) + '%';
    tabs.innerHTML = model.sheets.length > 1 ? model.sheets.map((s, i) => `<button type="button" class="${i === state.sheet ? 'on' : ''}" data-sheet="${i}">${esc(s.name)}</button>`).join('') : '';
    tabs.classList.toggle('hidden', model.sheets.length < 2);
    const tds = scroll.querySelectorAll('td.xc');
    state.mine = [];
    tds.forEach((td) => { if (td.textContent && meMatch(td.textContent)) { td.classList.add('me'); state.mine.push(td); } });
    const meBtn = el.querySelector('.xv-me');
    if (meBtn) meBtn.classList.toggle('hidden', !state.mine.length);
    applySearch(false);
  };
  const applySearch = (jump) => {
    const q = foldName(state.q.trim());
    scroll.querySelectorAll('td.hit').forEach((td) => td.classList.remove('hit', 'hit-cur'));
    state.hits = [];
    if (q) scroll.querySelectorAll('td.xc').forEach((td) => { if (td.textContent && foldName(td.textContent).includes(q)) { td.classList.add('hit'); state.hits.push(td); } });
    countEl.textContent = q ? (state.hits.length ? `${state.hits.length} sonuç` : 'Sonuç yok') : '';
    if (jump && state.hits.length) { state.hitIdx = 0; focusCell(state.hits[0], 'hit-cur'); }
  };
  const focusCell = (td, cls) => {
    scroll.querySelectorAll('.hit-cur').forEach((x) => x.classList.remove('hit-cur'));
    td.classList.add(cls);
    const sr = scroll.getBoundingClientRect(), tr = td.getBoundingClientRect();
    scroll.scrollBy({ left: tr.left - sr.left - sr.width / 2 + tr.width / 2, top: tr.top - sr.top - sr.height / 2 + tr.height / 2, behavior: 'smooth' });
  };
  const setZoom = (z) => { state.z = Math.max(0.3, Math.min(2.5, Math.round(z * 100) / 100)); draw(); };
  el.querySelector('.xv-zi').addEventListener('click', () => setZoom(state.z + 0.1));
  el.querySelector('.xv-zo').addEventListener('click', () => setZoom(state.z - 0.1));
  el.querySelector('.xv-zr').addEventListener('click', () => setZoom(1));
  el.querySelector('.xv-fit').addEventListener('click', () => setZoom(state.z * (scroll.clientWidth - 2) / Math.max(1, width)));
  scroll.addEventListener('click', (e) => {
    if (!e.target.closest('.xv-more')) return;
    state.limit[state.sheet] *= 2;
    const top = scroll.scrollTop;
    draw();
    scroll.scrollTop = top;
  });
  tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-sheet]'); if (b) { state.sheet = +b.dataset.sheet; scroll.scrollTo(0, 0); draw(); } });
  input.addEventListener('input', debounce(() => { state.q = input.value; applySearch(true); }, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !state.hits.length) return;
    e.preventDefault();
    state.hitIdx = (state.hitIdx + 1) % state.hits.length;
    focusCell(state.hits[state.hitIdx], 'hit-cur');
  });
  if (onlyBtn) onlyBtn.addEventListener('click', () => {
    state.onlyMe = !state.onlyMe;
    try { localStorage.setItem('nm-onlyme', state.onlyMe ? '1' : '0'); } catch (e) { /* */ }
    scroll.scrollTo(0, 0);
    draw();
    countEl.textContent = state.onlyMe ? 'Yalnızca sizin satırlarınız gösteriliyor' : '';
  });
  const meBtn = el.querySelector('.xv-me');
  if (meBtn) meBtn.addEventListener('click', () => {
    if (!state.mine.length) return;
    state.mineIdx = (state.mineIdx + 1) % state.mine.length;
    focusCell(state.mine[state.mineIdx], 'hit-cur');
    countEl.textContent = `${state.mineIdx + 1}/${state.mine.length} hücrede adınız geçiyor`;
  });
  if (!state.z) {
    // Masaüstü: tüm ayı tek ekranda göstermek için genişliğe sığdır (en az %60, en fazla %100)
    const sh0 = model.sheets[state.sheet];
    const lay0 = sheetLayout(sh0);
    layouts.set(state.sheet, lay0);
    const w1 = 44 + lay0.vc.reduce((a, c) => a + sh0.colW[c], 0);
    const avail = (scroll.clientWidth || 1000) - 4;
    state.z = Math.max(0.6, Math.min(1, Math.floor((avail / w1) * 100) / 100));
  }
  draw();
  return { model };
}

/* =================================================================== */
/* PDF                                                                  */
/* =================================================================== */
async function mountPdf(el, att) {
  setHTML(el, html`<div class="fv-loading"><div class="spinner"></div><span>PDF açılıyor…</span></div>`);
  await loadVendor('pdf');
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = new URL(VENDOR.pdfWorker, location.href).href;
  const src = /^(data|blob):/.test(att.url) ? { data: new Uint8Array(await fetchBuffer(att.url)) } : { url: att.url, withCredentials: true, disableAutoFetch: true };
  const doc = await lib.getDocument({ ...src, isEvalSupported: false }).promise;
  const first = await doc.getPage(1);
  const vp1 = first.getViewport({ scale: 1 });
  const state = { z: 1 };
  setHTML(el, html`<div class="pv">
    <div class="xv-bar"><span class="small muted pv-info">${doc.numPages} sayfa</span><div class="grow"></div>
      <div class="row" style="gap:4px"><button class="btn sm icon pv-zo" type="button" aria-label="Uzaklaştır">−</button><button class="btn sm pv-zr" type="button" style="min-width:58px">100%</button><button class="btn sm icon pv-zi" type="button" aria-label="Yakınlaştır">+</button></div>
    </div>
    <div class="pv-pages"></div>
  </div>`);
  const pagesEl = el.querySelector('.pv-pages');
  let io = null;
  const rendered = new Map();
  const build = () => {
    if (io) io.disconnect();
    rendered.clear();
    const w = Math.min(pagesEl.clientWidth - 24, 980) * state.z;
    let h = '';
    for (let i = 1; i <= doc.numPages; i++) h += `<div class="pv-page" data-p="${i}" style="width:${w}px;height:${(w * vp1.height / vp1.width).toFixed(0)}px"></div>`;
    pagesEl.innerHTML = h;
    el.querySelector('.pv-zr').textContent = Math.round(state.z * 100) + '%';
    io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) Promise.resolve(renderPage(+en.target.dataset.p, en.target, w)).catch(() => rendered.delete(+en.target.dataset.p)); }), { root: pagesEl, rootMargin: '800px 0px' });
    pagesEl.querySelectorAll('.pv-page').forEach((p) => io.observe(p));
  };
  const renderPage = async (n, box, w) => {
    if (rendered.has(n)) return;
    rendered.set(n, true);
    const page = n === 1 ? first : await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = w / base.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    canvas.style.width = w + 'px'; canvas.style.height = (w * base.height / base.width) + 'px';
    box.style.height = canvas.style.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    box.innerHTML = '';
    box.appendChild(canvas);
  };
  const setZoom = (z) => { state.z = Math.max(0.4, Math.min(3, Math.round(z * 10) / 10)); build(); };
  el.querySelector('.pv-zi').addEventListener('click', () => setZoom(state.z + 0.2));
  el.querySelector('.pv-zo').addEventListener('click', () => setZoom(state.z - 0.2));
  el.querySelector('.pv-zr').addEventListener('click', () => setZoom(1));
  build();
}

/* =================================================================== */
/* Word, metin, medya                                                   */
/* =================================================================== */
function sanitizeHTML(htmlStr) {
  const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,style,link,meta,form').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    [...n.attributes].forEach((a) => {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      if (/^(href|xlink:href|formaction|action)$/i.test(a.name) && !/^(https?:|mailto:|tel:|#)/i.test(a.value.trim())) n.removeAttribute(a.name);
      if (a.name === 'src' && !/^(data:image\/|blob:|https?:)/i.test(a.value.trim())) n.removeAttribute(a.name);
    });
    if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
  });
  return doc.body.innerHTML;
}
async function mountDocx(el, att) {
  setHTML(el, html`<div class="fv-loading"><div class="spinner"></div><span>Belge açılıyor…</span></div>`);
  const [buf] = await Promise.all([fetchBuffer(att.url), loadVendor('mammoth')]);
  const res = await window.mammoth.convertToHtml({ arrayBuffer: buf.slice(0) });
  el.innerHTML = `<div class="dv-wrap"><article class="dv-page">${sanitizeHTML(res.value) || '<p><em>Belge boş görünüyor.</em></p>'}</article></div>`;
}
async function mountText(el, att) {
  const buf = await fetchBuffer(att.url);
  let txt = decodeText(buf.byteLength > 2097152 ? buf.slice(0, 2097152) : buf);
  if (extOf(att.name) === 'json') { try { txt = JSON.stringify(JSON.parse(txt), null, 2); } catch (e) { /* olduğu gibi */ } }
  el.innerHTML = `<pre class="tv">${esc(txt)}</pre>`;
}
function unsupported(el, att, msg, detail) {
  const fk = fileKind(att.mime || '', att.name);
  const ext = extOf(att.name);
  const tip = ['ppt', 'pptx', 'doc', 'odt', 'rtf'].includes(ext) ? 'İpucu: Dosyayı PDF olarak kaydedip yüklerseniz herkes sitede doğrudan görebilir.' : '';
  setHTML(el, html`<div class="fv-none"><span class="a-ico tone-${fk.tone}" style="width:52px;height:52px;border-radius:12px;font-size:12px">${fk.label}</span>
    <div><b>${msg || 'Bu dosya türü sitede önizlenemiyor.'}</b><div class="small muted">İndirerek cihazınızdaki uygulamayla açabilirsiniz.${tip ? ' ' + tip : ''}</div>${detail ? html`<div class="tiny faint" style="margin-top:4px">Teknik ayrıntı: ${detail}</div>` : ''}</div>
    <button class="btn sm" data-act="fv-dl" data-url="${att.url}" data-name="${att.name}">${icon('download', 'sm')}İndir</button></div>`);
}
function mountMedia(el, att, kind) {
  if (kind === 'image') el.innerHTML = `<div class="mv"><img src="${esc(att.url)}" alt="${esc(att.name)}" loading="lazy"></div>`;
  else if (kind === 'video') el.innerHTML = `<div class="mv"><video src="${esc(att.url)}" controls playsinline preload="metadata"></video></div>`;
  else el.innerHTML = `<div class="mv mv-audio"><audio src="${esc(att.url)}" controls preload="metadata"></audio></div>`;
  const m = el.querySelector('img,video,audio');
  m.addEventListener('error', () => unsupported(el, att, 'Bu medya dosyası tarayıcınızda oynatılamıyor.'));
}

/** Herhangi bir dosyayı verilen kapsayıcıda gösterir */
async function mountPreview(el, att, opts = {}) {
  const kind = previewKind(att);
  try {
    if (kind === 'sheet') return await mountSheet(el, att, opts);
    if (kind === 'pdf') return await mountPdf(el, att);
    if (kind === 'docx') return await mountDocx(el, att);
    if (kind === 'text') return await mountText(el, att);
    if (kind === 'image' || kind === 'video' || kind === 'audio') return mountMedia(el, att, kind);
    return unsupported(el, att);
  } catch (e) {
    console.error('[dupcii] Önizleme hatası:', att.name, e);
    const known = e && e.message && /yüklenemedi|bulunamadı|alınamadı|sayfa yok/.test(e.message);
    unsupported(el, att, known ? e.message : 'Dosya açılamadı. Bozuk veya desteklenmeyen bir biçimde olabilir.', known ? '' : String((e && e.message) || e).slice(0, 160));
  }
}

/* ---------------- Ek kartları ---------------- */
const ATT_REG = new Map();
function fileCard(att, open = true) {
  ATT_REG.set(String(att.id), att);
  const fk = fileKind(att.mime || '', att.name);
  const kind = previewKind(att);
  const big = kind === 'sheet' || kind === 'pdf' || kind === 'docx' || kind === 'text';
  return html`<div class="fv ${big ? 'fv-big' : ''} ${kind === 'none' ? 'fv-plain' : ''}" data-att="${att.id}" data-open="${open && kind !== 'none' ? 1 : 0}">
    <div class="fv-head">
      <span class="a-ico tone-${fk.tone}">${fk.label}</span>
      <div class="grow" style="min-width:0"><div class="a-name">${att.name}</div><div class="a-sub">${fmtSize(att.size)}${kind === 'none' ? ' · Önizleme yok, indirerek açın' : ''}</div></div>
      ${kind !== 'none' ? html`<button class="btn sm icon ghost" data-act="fv-full" data-att="${att.id}" title="Tam ekran" aria-label="Tam ekran">${icon('expand', 'sm')}</button>` : ''}
      <button class="btn sm icon ghost" data-act="fv-dl" data-url="${att.url}" data-name="${att.name}" title="İndir" aria-label="İndir">${icon('download', 'sm')}</button>
      ${kind !== 'none' ? html`<button class="btn sm icon ghost fv-toggle" data-act="fv-toggle" title="Göster / gizle" aria-label="Göster / gizle">${icon('chevD', 'sm')}</button>` : ''}
    </div>
    ${kind !== 'none' ? html`<div class="fv-body"></div>` : ''}
  </div>`;
}

let _io = null;
function hydrateViewers(root) {
  if (!_io) {
    _io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      _io.unobserve(en.target);
      const card = en.target.closest('.fv');
      const att = ATT_REG.get(card.dataset.att);
      if (att && !en.target.dataset.mounted) { en.target.dataset.mounted = '1'; mountPreview(en.target, att); }
    }), { rootMargin: '300px 0px' });
  }
  $$('.fv', root).forEach((card) => {
    const body = card.querySelector('.fv-body');
    if (!body) return;
    if (card.dataset.open === '1') _io.observe(body);
    else card.classList.add('closed');
  });
}
ACT['fv-toggle'] = (el) => {
  const card = el.closest('.fv');
  const body = card.querySelector('.fv-body');
  card.classList.toggle('closed');
  if (!card.classList.contains('closed') && !body.dataset.mounted) {
    body.dataset.mounted = '1';
    mountPreview(body, ATT_REG.get(card.dataset.att));
  }
};
ACT['fv-dl'] = (el) => {
  if (window.NM_DEMO_API) { toast('Önizlemede dosya indirme kapalıdır; sitenize kurduğunuzda çalışır.'); return; }
  const url = el.dataset.url;
  const a = document.createElement('a');
  a.href = url + (url.startsWith('api.php') ? '&dl=1' : '');
  a.download = el.dataset.name || '';
  document.body.appendChild(a); a.click(); a.remove();
};
function openFullViewer(att, title) {
  const m = openModal({ title: title || att.name, size: 'full' });
  m.body.classList.add('fv-fullbody');
  setHTML(m.body, html`<div class="fv-fill"></div>`);
  mountPreview(m.body.querySelector('.fv-fill'), att);
  return m;
}
ACT['fv-full'] = (el) => { const att = ATT_REG.get(String(el.dataset.att)); if (att) openFullViewer(att); };
