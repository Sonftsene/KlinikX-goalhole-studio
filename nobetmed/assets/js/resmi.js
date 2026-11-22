/* dupcii — Resmi liste (4.34): çizelgenin kurumun kalite formunda çıktısı, saat hesabı, değişiklik raporu.
   Saatler her zaman çizelgenin güncel hâlinden (yayınlanmış liste + kabul edilen değişim / devir / çağrı + yöneticinin düzeltmeleri) hesaplanır.
   Çıktılar: önizleme, yazdır / PDF (A4 yatay, tek sayfa), Word (.docx, düzenlenebilir), Excel (.xlsx). Değişiklik işaretleri çıktıya yansımaz.
   Sunucu: inc/mod_resmi.php (plan.changes, plan.mark, plan.tpl.*, plan.signed). */
'use strict';

const RS2 = { tpl: null, logo: '', names: { org: '', unit: '' }, shared: [], canShare: false, chg: null, chgSel: new Set(), chgKind: '', chgQ: '' };
Object.assign(NM_EXT.audit, { 'plan.changes.delete': 'Çizelge değişiklik kayıtlarını sildi', 'plan.signed': 'İmzalı resmi listeyi ekledi' });

/* ---------------- Kodların yazımı ve saat etkisi ---------------- */
const RS_PRINT = [[/yıllık/i, 'Y.İZİN'], [/doğum/i, 'D.İZNİ'], [/rapor/i, 'RAPOR'], [/mazeret/i, 'M.İZİN'], [/idari/i, 'İ.İZİN'], [/nöbet izni/i, 'N.İZNİ'], [/evlilik/i, 'E.İZNİ'],
  [/refakat/i, 'REFAKAT'], [/gebelik/i, 'G.İZNİ'], [/ücretsiz/i, 'Ü.İZİN'], [/sevk/i, 'SEVK'], [/geçici görev|görevlendirme/i, 'G.GÖREV'], [/eğitim/i, 'EĞİTİM'], [/ayrıl/i, 'AYRILDI']];
function rsHH(v) { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? pad(+m[1]) + (+m[2] ? ':' + m[2] : '') : null; }
/** Kodun çıktıdaki yazımı: şablonda yazılmışsa o, değilse vardiyada saat aralığı (08-16), izinde kısaltma (Y.İZİN) */
function rsPrint(code, tpl) {
  if (!code) return '';
  const t = ((tpl || RS2.tpl || {}).codes || {})[code];
  if (t && t.p) return t.p;
  const c = planCode(code);
  if (!c) return code;
  if (c.kind === 'shift') { const s = rsHH(c.start), e = rsHH(c.end); return s && e ? `${s}-${e}` : code; }
  for (const [re, p] of RS_PRINT) if (re.test(c.label || '')) return p;
  return code;
}
/** Saat etkisi: shift (çalışılan saate eklenir) | deduct (gereken saatten düşer) | work (çalışılmış sayılır) | none */
function rsEffect(code, tpl) {
  const c = planCode(code);
  if (!c) return 'none';
  if (c.kind === 'shift') return 'shift';
  const t = ((tpl || RS2.tpl || {}).codes || {})[code];
  return (t && t.c) || 'deduct';
}
/** Gün tipi: 'work' (tam iş günü) | 'half' (yarım gün tatil / arife) | 'off' (hafta sonu / tam gün tatil) */
function rsDayKind(d, hol, half) {
  const w = new Date(d + 'T12:00:00').getDay();
  if (w === 0 || w === 6) return 'off';
  if ((half || []).includes(d)) return 'half';
  if (hol && hol[d] !== undefined) return 'off';
  return 'work';
}
/** Kişi başı saatler: { ad: { req, work, over } } — Gereken = iş günü × günlük saat − izin / rapor günleri; Çalışılan = vardiya saatleri */
function rsHours(D, ym, tpl, hol, half) {
  tpl = tpl || RS2.tpl || { day_hours: 8, half_hours: 4 };
  const days = planDays(ym);
  const dh = +tpl.day_hours || 8, hh = +tpl.half_hours || 0;
  const dayH = (d) => { const k = rsDayKind(d, hol, half); return k === 'work' ? dh : k === 'half' ? hh : 0; };
  const base = days.reduce((s, d) => s + dayH(d), 0);
  const o = {};
  (D.people || []).forEach((p) => {
    let req = base, work = 0;
    Object.entries((D.cells || {})[p.name] || {}).forEach(([d, code]) => {
      if (d.slice(0, 7) !== ym) return;
      const ef = rsEffect(code, tpl);
      const c = planCode(code);
      if (ef === 'shift') work += +(c && c.hours) || 0;
      else if (ef === 'deduct') req -= dayH(d);
      else if (ef === 'work') work += dayH(d);
    });
    const fix = ((D.hfix || {})[p.name] || {}).req;
    if (fix !== undefined && fix !== null && fix !== '') req = +fix;
    req = Math.max(0, Math.round(req * 10) / 10); work = Math.round(work * 10) / 10;
    o[p.name] = { req, work, over: Math.round((work - req) * 10) / 10, fixed: fix !== undefined && fix !== null && fix !== '' };
  });
  return o;
}
function rsNum(x) { return Number.isInteger(x) ? String(x) : String(x).replace('.', ','); }

/* ---------------- Şablon ---------------- */
async function rsLoadTpl(force) {
  if (RS2.tpl && !force) return RS2.tpl;
  const r = await api('plan.tpl.get');
  RS2.tpl = r.tpl; RS2.logo = r.logo || ''; RS2.names = r.names || RS2.names; RS2.shared = r.shared || []; RS2.canShare = !!r.can_share;
  return RS2.tpl;
}
function rsFill(s, ym) {
  const [y, m] = ym.split('-').map(Number);
  const up = (x) => String(x || '').toLocaleUpperCase('tr');
  return String(s || '').replace(/\{HASTANE\}/g, RS2.names.org || '').replace(/\{BİRİM\}|\{BIRIM\}/g, up(RS2.names.unit)).replace(/\{LİSTE\}|\{LISTE\}/g, up((PL2.roster || {}).name))
    .replace(/\{YIL\}/g, String(y)).replace(/\{AY\}/g, up(TR_MONTHS[m - 1])).replace(/\s{2,}/g, ' ').trim();
}

/* ---------------- Çıktı modeli (önizleme, yazdır, Word, Excel aynı veriden) ---------------- */
function rsModel() {
  const tpl = RS2.tpl, D = PL2.d, ym = PL2.ym;
  const days = planDays(ym);
  const hours = rsHours(D, ym, tpl, PL2.hol, PL2.half);
  const cols = tpl.cols || {};
  const rows = D.people.map((p, i) => ({ no: i + 1, name: p.name, title: p.title || '', cells: days.map((d) => rsPrint(((D.cells || {})[p.name] || {})[d] || '', tpl)), h: hours[p.name] }));
  return {
    tpl, ym, days, rows, cols,
    lines: (tpl.lines || []).map((l) => rsFill(l, ym)).filter(Boolean),
    doc: (tpl.doc || []).filter((x) => x.l || x.v),
    sig: (tpl.sig || []).filter((x) => x.t || x.n),
    logo: RS2.logo,
    off: days.map((d) => rsDayKind(d, PL2.hol, PL2.half) !== 'work'),
  };
}
const RS_DAY_UP = (d) => TR_DAYS[new Date(d + 'T12:00:00').getDay()].toLocaleUpperCase('tr');

/** Önizleme ve yazdırma için HTML (yalnız güvenli kaçışlı metin) */
function rsDocHtml(M, opts = {}) {
  const e = esc;
  const n = M.rows.length;
  // Tek sayfaya sığdırma: satır yüksekliği ve yazı boyutu kişi sayısına göre
  const rowMm = Math.max(3.4, Math.min(6.2, 118 / Math.max(1, n)));
  const fs = Math.max(4.6, Math.min(7.5, rowMm * 1.15));
  const nameW = 36, titleW = M.cols.unvan ? 22 : 0, noW = M.cols.sira ? 6 : 0, hW = 9;
  const extra = ['req', 'work', 'over'].filter((k) => M.cols[k]).length;
  const dayW = Math.max(4.4, (281 - nameW - titleW - noW - extra * hW) / M.days.length);
  const head = `<table class="rd-head"><tr>
    <td class="rd-logo">${M.logo ? `<img src="${e(M.logo)}" alt="">` : ''}</td>
    <td class="rd-title">${M.lines.map((l, i) => `<div class="${i === M.lines.length - 1 ? 'rd-t-main' : ''}">${e(l)}</div>`).join('')}</td>
    <td class="rd-docbox">${M.doc.length ? `<table>${M.doc.map((x) => `<tr>${M.tpl.doc_labels ? `<td class="rd-dl">${e(x.l)}</td>` : ''}<td class="rd-dv">${e(x.v)}</td></tr>`).join('')}</table>` : ''}</td></tr></table>`;
  const th = `<tr>${M.cols.sira ? '<th class="rd-no" rowspan="2">Sıra<br>No</th>' : ''}<th class="rd-name" rowspan="2">ADI SOYADI</th>${M.cols.unvan ? '<th class="rd-unv" rowspan="2">UNVAN</th>' : ''}
    ${M.days.map((d, i) => `<th class="rd-dn ${M.tpl.shade && M.off[i] ? 'off' : ''}"><span>${e(RS_DAY_UP(d))}</span></th>`).join('')}
    ${M.cols.req ? '<th class="rd-hc" rowspan="2"><span>ÇALIŞILMASI GEREKEN SAAT</span></th>' : ''}${M.cols.work ? '<th class="rd-hc" rowspan="2"><span>ÇALIŞILAN SAAT</span></th>' : ''}${M.cols.over ? '<th class="rd-hc" rowspan="2"><span>FAZLA MESAİ SAATİ</span></th>' : ''}</tr>
    <tr>${M.days.map((d, i) => `<th class="rd-dd ${M.tpl.shade && M.off[i] ? 'off' : ''}">${+d.slice(8)}</th>`).join('')}</tr>`;
  const body = M.rows.map((r) => `<tr>${M.cols.sira ? `<td class="rd-no">${r.no}</td>` : ''}<td class="rd-name ${r.name.length > 24 ? 'lg' : ''}">${e(r.name.toLocaleUpperCase('tr'))}</td>${M.cols.unvan ? `<td class="rd-unv">${e(r.title.toLocaleUpperCase('tr'))}</td>` : ''}
    ${r.cells.map((c, i) => `<td class="rd-c ${c.length >= 6 ? 'lg' : ''} ${M.tpl.shade && M.off[i] ? 'off' : ''}">${e(c)}</td>`).join('')}
    ${M.cols.req ? `<td class="rd-h">${rsNum(r.h.req)}</td>` : ''}${M.cols.work ? `<td class="rd-h">${rsNum(r.h.work)}</td>` : ''}${M.cols.over ? `<td class="rd-h">${r.h.over ? rsNum(r.h.over) : ''}</td>` : ''}</tr>`).join('');
  const sig = M.sig.length ? `<table class="rd-sig"><tr>${M.sig.map((s) => `<td><b>${e(s.t.toLocaleUpperCase('tr'))}</b><div class="rd-sn">${e(s.n)}</div><div class="rd-sl"></div></td>`).join('')}</tr></table>` : '';
  const css = `
    .rd{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;box-sizing:border-box}
    .rd *{box-sizing:border-box}
    .rd table{border-collapse:collapse}
    .rd-head{width:100%;border:1px solid #000;margin-bottom:2mm}
    .rd-head td{border:1px solid #000;vertical-align:middle}
    .rd-logo{width:30mm;text-align:center;padding:1mm}.rd-logo img{max-height:18mm;max-width:27mm}
    .rd-title{text-align:center;font-weight:700;font-size:8.5pt;line-height:1.35}.rd-t-main{font-size:9.5pt}
    .rd-docbox{width:46mm;padding:0}.rd-docbox table{width:100%}.rd-docbox td{border:0;border-bottom:1px solid #000;font-size:6.5pt;padding:.6mm 1.2mm;height:4.4mm}
    .rd-docbox tr:last-child td{border-bottom:0}.rd-dl{border-right:1px solid #000!important;width:45%;font-weight:700}
    .rd-grid{width:100%;table-layout:fixed;border:1px solid #000}
    .rd-grid th,.rd-grid td{border:1px solid #000;text-align:center;padding:0 .3mm;font-size:${fs}pt;height:${rowMm}mm;overflow:hidden;white-space:nowrap}
    .rd-grid th{font-weight:700}
    .rd-grid .rd-no{width:${noW}mm}.rd-grid .rd-name{width:${nameW}mm;font-weight:700}.rd-grid .rd-unv{width:${titleW}mm;font-weight:700}
    .rd-grid td.rd-name,.rd-grid td.rd-unv{font-size:${Math.max(4.4, fs - .4)}pt}
    .rd-grid .rd-dn{height:16mm;vertical-align:bottom;padding:.4mm 0}.rd-grid .rd-dn span{writing-mode:vertical-rl;text-orientation:upright;font-size:${Math.max(4, Math.min(5.6, fs - .8))}pt;letter-spacing:-.3pt;line-height:1}
    .rd-grid .rd-dd{font-size:${Math.min(7, fs + .3)}pt}
    .rd-grid .rd-hc{width:${hW}mm;vertical-align:middle}.rd-grid .rd-hc span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:5pt;white-space:normal;line-height:1.1;max-height:30mm;display:inline-block}
    .rd-grid .off{background:#ececec}
    .rd-grid .rd-c{font-size:${Math.max(4, fs - .9)}pt;letter-spacing:-.2pt}.rd-grid .rd-c.lg{font-size:${Math.max(3.6, fs - 1.9)}pt;letter-spacing:-.35pt}
    .rd-grid td.rd-name.lg{font-size:${Math.max(3.8, fs - 1.6)}pt;letter-spacing:-.2pt}
    .rd-grid td.rd-unv{white-space:normal;line-height:1.05;font-size:${Math.max(4, fs - 1.2)}pt}
    .rd-sig{width:100%;margin-top:6mm}.rd-sig td{text-align:center;vertical-align:top;font-size:7.5pt;padding:0 6mm}.rd-sig b{display:block}.rd-sn{margin-top:1mm;font-size:7.5pt;min-height:3mm}.rd-sl{height:10mm}
    ${opts.page ? '@page{size:A4 landscape;margin:7mm}html,body{margin:0;background:#fff}' : ''}`;
  const grid = `<table class="rd-grid"><colgroup>${M.cols.sira ? `<col style="width:${noW}mm">` : ''}<col style="width:${nameW}mm">${M.cols.unvan ? `<col style="width:${titleW}mm">` : ''}${M.days.map(() => `<col style="width:${dayW}mm">`).join('')}${`<col style="width:${hW}mm">`.repeat(extra)}</colgroup>
    <thead>${th}</thead><tbody>${body}</tbody></table>`;
  return `<style>${css}</style><div class="rd">${head}${grid}${sig}</div>`;
}

/** Yazdır / PDF: gizli çerçevede A4 yatay */
function rsPrintDoc() {
  const M = rsModel();
  const doc = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc((PL2.roster || {}).name || '')} ${esc(TR_MONTHS[+PL2.ym.slice(5) - 1])} ${PL2.ym.slice(0, 4)}</title></head><body>${rsDocHtml(M, { page: true })}</body></html>`;
  let f = $('#rsPrintFrame');
  if (f) f.remove();
  f = document.createElement('iframe');
  f.id = 'rsPrintFrame';
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(f);
  const w = f.contentWindow;
  w.document.open(); w.document.write(doc); w.document.close();
  const go = () => { try { w.focus(); w.print(); } catch (e) { toast('Yazdırma açılamadı; tarayıcının yazdır menüsünü kullanın.', 'err'); } };
  const img = w.document.querySelector('img');
  if (img && !img.complete) img.onload = img.onerror = () => setTimeout(go, 50); else setTimeout(go, 80);
}

/* ---------------- Word (.docx): elle yazılmış en küçük OOXML + ZIP ---------------- */
const RS_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function rsCrc(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = RS_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** Sıkıştırmasız ZIP (Word / Excel açar) */
function rsZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let off = 0;
  files.forEach(([name, data]) => {
    const nb = enc.encode(name);
    const u8 = typeof data === 'string' ? enc.encode(data) : data;
    const crc = rsCrc(u8);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, u8.length, true); lh.setUint32(22, u8.length, true);
    lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nb, u8);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, u8.length, true); ch.setUint32(24, u8.length, true);
    ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + u8.length;
  });
  const csize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}
function rsXml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
async function rsImgInfo(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const img = new Image();
  await new Promise((res) => { img.onload = res; img.onerror = res; img.src = dataUrl; });
  return { ext: m[1] === 'png' ? 'png' : 'jpeg', u8, b64: m[2], w: img.naturalWidth || 100, h: img.naturalHeight || 100 };
}
async function rsDocx() {
  const M = rsModel();
  const img = await rsImgInfo(M.logo);
  const X = rsXml;
  const tw = (mm) => Math.round(mm * 56.7); // twip
  const n = M.rows.length;
  const sz = Math.max(9, Math.min(14, Math.round(260 / Math.max(10, n)))); // yarım punto
  const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.b ? '<w:b/>' : ''}<w:sz w:val="${o.sz || sz}"/><w:szCs w:val="${o.sz || sz}"/></w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
  const para = (t, o = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${o.jc || 'center'}"/></w:pPr>${Array.isArray(t) ? t.join('') : run(t, o)}</w:p>`;
  const cell = (inner, o = {}) => `<w:tc><w:tcPr>${o.w ? `<w:tcW w:w="${o.w}" w:type="dxa"/>` : ''}${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.vm ? `<w:vMerge${o.vm === 'start' ? ' w:val="restart"' : ''}/>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.dir ? `<w:textDirection w:val="${o.dir}"/>` : ''}${o.nw ? '<w:noWrap/>' : ''}<w:vAlign w:val="${o.va || 'center'}"/><w:tcMar><w:left w:w="20" w:type="dxa"/><w:right w:w="20" w:type="dxa"/></w:tcMar></w:tcPr>${inner || para('')}</w:tc>`;
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>';
  const tbl = (grid, rows, o = {}) => `<w:tbl><w:tblPr><w:tblW w:w="${grid.reduce((s, x) => s + x, 0)}" w:type="dxa"/>${o.noBorder ? '' : borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="20" w:type="dxa"/><w:right w:w="20" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
  const tr = (cells, h, rule) => `<w:tr><w:trPr>${h ? `<w:trHeight w:val="${h}" w:hRule="${rule || 'atLeast'}"/>` : ''}<w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
  const W = tw(283);
  // Başlık: logo | satırlar | doküman kutusu
  const logoW = tw(30), boxW = tw(48), midW = W - logoW - boxW;
  let drawing = '';
  if (img) {
    const hEmu = 18 * 36000, wEmu = Math.round(hEmu * img.w / img.h);
    const fw = Math.min(wEmu, 27 * 36000), fh = Math.round(fw * img.h / img.w);
    drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${fw}" cy="${fh}"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.${img.ext === 'png' ? 'png' : 'jpg'}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fw}" cy="${fh}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  const box = M.doc.length ? tbl(M.tpl.doc_labels ? [Math.round(boxW * 0.45), boxW - Math.round(boxW * 0.45)] : [boxW],
    M.doc.map((x) => tr(M.tpl.doc_labels ? [cell(para(x.l, { sz: 12, b: true, jc: 'left' })), cell(para(x.v, { sz: 12, jc: 'left' }))] : [cell(para(x.v, { sz: 12, jc: 'left' }))], 220))) + para('', { sz: 2 }) : para('');
  const head = tbl([logoW, midW, boxW], [tr([cell(drawing ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawing}</w:p>` : para('')),
    cell(M.lines.map((l, i) => para(l, { b: true, sz: i === M.lines.length - 1 ? 20 : 18 })).join('')), cell(box, { va: 'top' })], 1000)]);
  // Ana tablo
  const noW = M.cols.sira ? tw(7) : 0, nameW = tw(36), unvW = M.cols.unvan ? tw(22) : 0, hW = tw(9);
  const hk = ['req', 'work', 'over'].filter((k) => M.cols[k]);
  const dayW = Math.floor((W - noW - nameW - unvW - hk.length * hW) / M.days.length);
  const grid = [...(noW ? [noW] : []), nameW, ...(unvW ? [unvW] : []), ...M.days.map(() => dayW), ...hk.map(() => hW)];
  const shade = (i) => (M.tpl.shade && M.off[i] ? 'E6E6E6' : '');
  const hText = { req: 'ÇALIŞILMASI GEREKEN SAAT', work: 'ÇALIŞILAN SAAT', over: 'FAZLA MESAİ SAATİ' };
  const h1 = tr([...(noW ? [cell(para('Sıra No', { b: true, sz: 12 }), { vm: 'start' })] : []), cell(para('ADI SOYADI', { b: true, sz: 14 }), { vm: 'start' }), ...(unvW ? [cell(para('UNVAN', { b: true, sz: 14 }), { vm: 'start' })] : []),
    ...M.days.map((d, i) => cell(para(RS_DAY_UP(d), { b: true, sz: 10 }), { dir: 'btLr', fill: shade(i), va: 'bottom' })), ...hk.map((k) => cell(para(hText[k], { b: true, sz: 9 }), { dir: 'btLr', vm: 'start' }))], 1000, 'exact');
  const h2 = tr([...(noW ? [cell('', { vm: 'cont' })] : []), cell('', { vm: 'cont' }), ...(unvW ? [cell('', { vm: 'cont' })] : []),
    ...M.days.map((d, i) => cell(para(String(+d.slice(8)), { b: true, sz: 12 }), { fill: shade(i) })), ...hk.map(() => cell('', { vm: 'cont' }))], 260);
  const rh = Math.max(200, Math.min(380, Math.round(5800 / Math.max(1, n))));
  const body = M.rows.map((r) => tr([...(noW ? [cell(para(String(r.no)))] : []), cell(para(r.name.toLocaleUpperCase('tr'), { b: true })), ...(unvW ? [cell(para(r.title.toLocaleUpperCase('tr'), { b: true, sz: Math.max(9, sz - 2) }))] : []),
    ...r.cells.map((c, i) => cell(para(c, { sz: Math.max(7, sz - (c.length >= 6 ? 5 : 3)) }), { fill: shade(i), nw: true })),
    ...hk.map((k) => cell(para(k === 'over' && !r.h.over ? '' : rsNum(r.h[k])))) ], rh, 'exact'));
  const sigs = M.sig.length ? tbl(M.sig.map(() => Math.floor(W / M.sig.length)), [tr(M.sig.map((s) => cell(para(s.t.toLocaleUpperCase('tr'), { b: true, sz: 15 }) + para(s.n, { sz: 15 }) + para('') + para(''), { va: 'top' })))], { noBorder: true }) : '';
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${head}${para('', { sz: 6 })}${tbl(grid, [h1, h2, ...body])}${para('', { sz: 10 })}${sigs}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="397" w:right="397" w:bottom="397" w:left="397" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${img ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${img.ext === 'png' ? 'png' : 'jpg'}"/>` : ''}</Relationships>`],
    ['word/document.xml', docXml],
  ];
  if (img) files.push([`word/media/logo.${img.ext === 'png' ? 'png' : 'jpg'}`, img.u8]);
  return rsZip(files);
}

/* ---------------- Excel (.xlsx) ---------------- */
async function rsXlsx() {
  const M = rsModel();
  await loadVendor('exceljs');
  const wb = new ExcelJS.Workbook();
  const [y, m] = M.ym.split('-').map(Number);
  const ws = wb.addWorksheet(`${TR_MONTHS[m - 1].toLocaleUpperCase('tr')} ${y}`, { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0, footer: 0 } } });
  const hk = ['req', 'work', 'over'].filter((k) => M.cols[k]);
  const lead = (M.cols.sira ? 1 : 0) + 1 + (M.cols.unvan ? 1 : 0);
  const total = lead + M.days.length + hk.length;
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  // Başlık (1–5. satırlar): logo | başlık | doküman kutusu
  const docCols = 6;
  const titleFrom = 4, titleTo = total - docCols;
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = 15;
  ws.mergeCells(1, 1, 5, titleFrom - 1);
  ws.mergeCells(1, titleFrom, 5, titleTo);
  const tc = ws.getCell(1, titleFrom);
  tc.value = M.lines.join('\n'); tc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; tc.font = { bold: true, size: 11, name: 'Arial' };
  M.doc.slice(0, 5).forEach((x, i) => {
    const r = i + 1;
    if (M.tpl.doc_labels) { ws.mergeCells(r, titleTo + 1, r, titleTo + 2); ws.mergeCells(r, titleTo + 3, r, total); ws.getCell(r, titleTo + 1).value = x.l; ws.getCell(r, titleTo + 1).font = { bold: true, size: 8, name: 'Arial' }; ws.getCell(r, titleTo + 3).value = x.v; ws.getCell(r, titleTo + 3).font = { size: 8, name: 'Arial' }; }
    else { ws.mergeCells(r, titleTo + 1, r, total); ws.getCell(r, titleTo + 1).value = x.v; ws.getCell(r, titleTo + 1).font = { size: 8, name: 'Arial' }; }
  });
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= total; c++) ws.getCell(r, c).border = box;
  if (M.logo) {
    const img = await rsImgInfo(M.logo);
    if (img) {
      const id = wb.addImage({ base64: img.b64, extension: img.ext === 'png' ? 'png' : 'jpeg' });
      const h = 70, w = Math.round(h * img.w / img.h);
      ws.addImage(id, { tl: { col: 0.2, row: 0.2 }, ext: { width: Math.min(w, 110), height: Math.round(Math.min(w, 110) * img.h / img.w) } });
    }
  }
  // Tablo başlığı (7–8. satırlar)
  const hr = 7;
  const hText = { req: 'ÇALIŞILMASI GEREKEN SAAT', work: 'ÇALIŞILAN SAAT', over: 'FAZLA MESAİ SAATİ' };
  let c = 1;
  const merge2 = (txt) => { ws.mergeCells(hr, c, hr + 1, c); const x = ws.getCell(hr, c); x.value = txt; x.font = { bold: true, size: 8, name: 'Arial' }; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c++; };
  if (M.cols.sira) merge2('Sıra No');
  merge2('ADI SOYADI');
  if (M.cols.unvan) merge2('UNVAN');
  M.days.forEach((d, i) => {
    const a = ws.getCell(hr, c), b = ws.getCell(hr + 1, c);
    a.value = RS_DAY_UP(d); a.alignment = { textRotation: 90, horizontal: 'center', vertical: 'bottom' }; a.font = { bold: true, size: 6, name: 'Arial' };
    b.value = +d.slice(8); b.alignment = { horizontal: 'center' }; b.font = { bold: true, size: 8, name: 'Arial' };
    if (M.tpl.shade && M.off[i]) [a, b].forEach((x) => { x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }; });
    c++;
  });
  hk.forEach((k) => { ws.mergeCells(hr, c, hr + 1, c); const x = ws.getCell(hr, c); x.value = hText[k]; x.font = { bold: true, size: 6, name: 'Arial' }; x.alignment = { textRotation: 90, horizontal: 'center', vertical: 'middle', wrapText: true }; c++; });
  ws.getRow(hr).height = 62; ws.getRow(hr + 1).height = 13;
  M.rows.forEach((r, ri) => {
    const vals = [...(M.cols.sira ? [r.no] : []), r.name.toLocaleUpperCase('tr'), ...(M.cols.unvan ? [r.title.toLocaleUpperCase('tr')] : []), ...r.cells, ...hk.map((k) => (k === 'over' && !r.h.over ? '' : r.h[k]))];
    const row = ws.getRow(hr + 2 + ri);
    vals.forEach((v, i) => {
      const x = row.getCell(i + 1);
      x.value = v; x.font = { size: 7, name: 'Arial', bold: i < lead && i >= (M.cols.sira ? 1 : 0) }; x.alignment = { horizontal: 'center', vertical: 'middle' };
      const di = i - lead;
      if (di >= 0 && di < M.days.length && M.tpl.shade && M.off[di]) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } };
    });
    row.height = 14;
  });
  for (let r = hr; r <= hr + 1 + M.rows.length; r++) for (let k = 1; k <= total; k++) ws.getCell(r, k).border = box;
  // Sütun genişlikleri
  let ci = 1;
  if (M.cols.sira) ws.getColumn(ci++).width = 4;
  ws.getColumn(ci++).width = 24;
  if (M.cols.unvan) ws.getColumn(ci++).width = 11;
  M.days.forEach(() => { ws.getColumn(ci++).width = 4.6; });
  hk.forEach(() => { ws.getColumn(ci++).width = 5; });
  // İmzalar
  const sr = hr + 3 + M.rows.length;
  if (M.sig.length) {
    const span = Math.floor(total / M.sig.length);
    M.sig.forEach((s, i) => {
      const a = 1 + i * span, b = i === M.sig.length - 1 ? total : a + span - 1;
      ws.mergeCells(sr, a, sr, b); ws.mergeCells(sr + 1, a, sr + 1, b);
      const t = ws.getCell(sr, a); t.value = s.t.toLocaleUpperCase('tr'); t.font = { bold: true, size: 8, name: 'Arial' }; t.alignment = { horizontal: 'center' };
      const nn = ws.getCell(sr + 1, a); nn.value = s.n; nn.font = { size: 8, name: 'Arial' }; nn.alignment = { horizontal: 'center' };
    });
  }
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function rsFileBase() { return `${(PL2.roster || {}).name || 'Liste'} ${TR_MONTHS[+PL2.ym.slice(5) - 1]} ${PL2.ym.slice(0, 4)} resmi liste`; }

/* ---------------- Resmi liste sekmesi ---------------- */
async function rsDocTab(box) {
  setHTML(box, html`<div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div></div>`);
  try { await rsLoadTpl(true); } catch (e) { setHTML(box, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  rsDocDraw(box);
}
function rsDocDraw(box) {
  box = box || $('#plTabBody');
  if (!box || !RS2.tpl || !PL2.d) return;
  const M = rsModel();
  const sg = PL2.signed;
  setHTML(box, html`<div class="stack">
    <div class="card card-pad stack" style="gap:8px">
      <p class="small muted" style="margin:0">Kurumun formu: logo, başlık, doküman kutusu, saatler ve imzalar. Güncel çizelgeden üretilir; değişiklik işaretleri çıktıda görünmez.</p>
      <div class="row wrap" style="gap:8px">
      <button class="btn sm" data-act="rs-tpl">${icon('sliders', 'sm')}<span>Şablon</span></button>
      <button class="btn sm primary" data-act="rs-print">${icon('file', 'sm')}<span>Yazdır / PDF</span></button>
      <button class="btn sm" data-act="rs-docx">${icon('file', 'sm')}<span>Word</span></button>
      <button class="btn sm" data-act="rs-xlsx">${icon('table', 'sm')}<span>Excel</span></button>
    </div></div>
    ${!RS2.logo && !(RS2.tpl.doc || []).some((x) => x.v) ? html`<div class="mk-box">${icon('info', 'sm')}<span>Şablon henüz ayarlanmadı: <b>Şablon</b>’dan kurum logosunu, başlık satırlarını, doküman numarası ve tarihini, imza alanlarını girin. Bir kez yapılır.</span></div>` : ''}
    <div class="rs-paper-wrap"><div class="rs-paper" id="rsPaper">${raw(rsDocHtml(M))}</div></div>
    <div class="card card-pad stack" id="rsSigned">
      <div class="row wrap" style="gap:8px;align-items:center"><b class="grow">${icon('checkCircle', 'sm')} Islak imzalı belge</b>
        <label class="btn sm">${icon('upload', 'sm')}<span>${sg ? 'Değiştir' : 'Taranmış hâlini ekle'}</span><input type="file" hidden accept="application/pdf,image/jpeg,image/png" data-change="rs-signed"></label>
        ${sg ? html`<button class="btn sm ghost danger" data-act="rs-signed-x">Kaldır</button>` : ''}</div>
      <div class="small muted">${sg ? html`<a href="${sg.url}" target="_blank" rel="noopener">${sg.name}</a> · ${fmtRel(sg.at)}${sg.by ? ' · ' + sg.by : ''} — ekip listeyi açınca görür.` : 'İmzalandıktan sonra PDF ya da fotoğrafını ekleyin; ekip nöbet listesi sayfasında “İmzalı resmi liste” olarak görür.'}</div>
    </div></div>`);
  // Önizleme kâğıdı ekrana sığsın
  const fit = () => { const w = $('.rs-paper-wrap', box), p = $('#rsPaper', box); if (!w || !p) return; const s = Math.min(1, (w.clientWidth - 2) / p.offsetWidth); p.style.transform = `scale(${s})`; w.style.height = Math.ceil(p.offsetHeight * s) + 'px'; };
  requestAnimationFrame(fit);
  if (!RS2.onResize) { RS2.onResize = debounce(() => { if ($('#rsPaper')) { const w = $('.rs-paper-wrap'), p = $('#rsPaper'); const s = Math.min(1, (w.clientWidth - 2) / p.offsetWidth); p.style.transform = `scale(${s})`; w.style.height = Math.ceil(p.offsetHeight * s) + 'px'; } }, 150); window.addEventListener('resize', RS2.onResize); }
}
ACT['rs-print'] = () => { if (PL2.dirty) planSave(true); rsPrintDoc(); };
ACT['rs-docx'] = (el) => busy(el, async () => { try { downloadBlob(await rsDocx(), rsFileBase() + '.docx'); } catch (e) { toast(e.message, 'err'); } });
ACT['rs-xlsx'] = (el) => busy(el, async () => { try { downloadBlob(await rsXlsx(), rsFileBase() + '.xlsx'); } catch (e) { toast(e.message, 'err'); } });
CHANGE['rs-signed'] = async (el) => {
  const f = el.files && el.files[0]; if (!f) return;
  try {
    const att = await uploadFile(f);
    const r = await api('plan.signed', { roster_id: PL2.rid, ym: PL2.ym, attachment_id: att.id });
    PL2.signed = r.signed; toast('İmzalı belge eklendi'); rsDocDraw(); refreshRosters && refreshRosters();
  } catch (e) { toast(e.message, 'err'); }
};
ACT['rs-signed-x'] = async () => {
  if (!(await confirmDialog({ title: 'İmzalı belge kaldırılsın mı?', text: 'Ekip artık imzalı belgeyi görmez. Çizelge ve liste değişmez.', ok: 'Kaldır', danger: true }))) return;
  try { await api('plan.signed', { roster_id: PL2.rid, ym: PL2.ym, remove: true }); PL2.signed = null; rsDocDraw(); refreshRosters && refreshRosters(); } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Şablon düzenleyici ---------------- */
async function rsLogoFrom(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Görsel açılamadı.')); img.src = url; });
  for (const max of [360, 280, 200, 150]) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
    for (const q of [0.9, 0.8, 0.7]) { const d = cv.toDataURL('image/jpeg', q); if (d.length <= 58000) return d; }
  }
  throw new Error('Logo çok büyük; daha küçük bir görsel seçin.');
}
ACT['rs-tpl'] = async () => {
  try { await rsLoadTpl(true); } catch (e) { toast(e.message, 'err'); return; } // başka yerde değiştirildiyse eskisiyle ezilmesin
  const t = JSON.parse(JSON.stringify(RS2.tpl));
  let logo = RS2.logo;
  const used = [...new Set(Object.values(PL2.d.cells || {}).flatMap((r) => Object.values(r)))].filter(Boolean);
  const codes = PL2.codes.filter((c) => used.includes(c.code) || c.kind !== 'shift');
  const EF = [['deduct', 'Gerekenden düşer'], ['work', 'Çalışılmış sayılır'], ['none', 'Etkisiz']];
  const docRow = (x) => html`<div class="row rs-tr" style="gap:6px"><input class="input" data-k="l" value="${x.l}" placeholder="Etiket (ör. Doküman No)" style="max-width:170px"><input class="input grow" data-k="v" value="${x.v}" placeholder="Değer (ör. KY.LS.20)"><button type="button" class="btn ghost icon sm" data-x aria-label="Satırı kaldır">${icon('x', 'sm')}</button></div>`;
  const sigRow = (x) => html`<div class="row rs-tr" style="gap:6px"><input class="input" data-k="t" value="${x.t}" placeholder="Görev (ör. Birim Sorumlusu)"><input class="input grow" data-k="n" value="${x.n}" placeholder="Ad soyad (boş bırakılabilir)"><button type="button" class="btn ghost icon sm" data-x aria-label="İmzayı kaldır">${icon('x', 'sm')}</button></div>`;
  const m = openModal({ title: 'Resmi liste şablonu', size: 'wide', body: html`<form class="stack" id="rsTplF">
      <div class="row wrap" style="gap:12px;align-items:center"><div class="rs-logo-prev" id="rsLogoPrev">${logo ? html`<img src="${logo}" alt="Logo">` : html`<span class="tiny faint">Logo yok</span>`}</div>
        <label class="btn sm">${icon('upload', 'sm')}<span>Kurum logosu yükle</span><input type="file" hidden accept="image/png,image/jpeg" id="rsLogoIn"></label>
        <button type="button" class="btn sm ghost" id="rsLogoX">Logoyu kaldır</button></div>
      <div class="field"><label>Başlık satırları</label><div class="stack" style="gap:6px">${[0, 1, 2, 3].map((i) => html`<input class="input" data-line="${i}" value="${(t.lines || [])[i] || ''}" placeholder="${['T.C. Sağlık Bakanlığı', '{HASTANE}', '{BİRİM} {YIL} {AY} ÇALIŞMA LİSTESİ', '(isteğe bağlı)'][i]}">`)}</div>
        <span class="hint">Değişkenler: {HASTANE} ${RS2.names.org ? `(${RS2.names.org})` : ''}, {BİRİM} ${RS2.names.unit ? `(${RS2.names.unit})` : ''}, {LİSTE}, {YIL}, {AY}. Son satır büyük yazılır.</span></div>
      <div class="field"><label>Doküman kutusu (sağ üst)</label><div class="stack" id="rsDoc" style="gap:6px">${(t.doc || []).map(docRow)}</div>
        <div class="row wrap" style="gap:8px;margin-top:6px"><button type="button" class="btn sm" id="rsDocAdd">${icon('plus', 'sm')}<span>Satır ekle</span></button><label class="small"><input type="checkbox" id="rsDocL" ${t.doc_labels ? raw('checked') : ''}> Etiketleri de yaz</label></div></div>
      <div class="field"><label>Sütunlar</label><div class="row wrap" style="gap:12px">${[['sira', 'Sıra No'], ['unvan', 'Unvan'], ['req', 'Çalışılması gereken saat'], ['work', 'Çalışılan saat'], ['over', 'Fazla mesai saati']].map(([k, l]) => html`<label class="small"><input type="checkbox" data-col="${k}" ${t.cols[k] ? raw('checked') : ''}> ${l}</label>`)}
        <label class="small"><input type="checkbox" id="rsShade" ${t.shade ? raw('checked') : ''}> Hafta sonu ve tatil sütunlarını gölgele</label></div></div>
      <div class="grid2"><div class="field"><label>Günlük çalışma saati</label><input class="input" type="number" min="1" max="12" step="0.5" id="rsDayH" value="${t.day_hours}"></div>
        <div class="field"><label>Yarım gün tatilde (arife) gereken saat</label><input class="input" type="number" min="0" max="12" step="0.5" id="rsHalfH" value="${t.half_hours}"></div></div>
      <div class="field"><label>Kodların çıktıdaki yazımı ve saat etkisi</label>
        <div class="rs-codes">${codes.map((c) => { const x = (t.codes || {})[c.code] || {}; return html`<div class="row rs-tr" data-code="${c.code}" style="gap:6px;align-items:center"><span class="code-chip tone-${planTone(c.code)}"><b>${c.code}</b></span><span class="small grow ellipsis">${c.label}${c.kind === 'shift' ? ` · ${c.hours || 0} saat` : ''}</span>
          <input class="input" data-k="p" value="${x.p || ''}" placeholder="${rsPrint(c.code, { codes: {} })}" style="max-width:110px" aria-label="Çıktıda yazım">
          ${c.kind === 'shift' ? html`<span class="tiny faint" style="width:150px">Çalışılan saate eklenir</span>` : html`<select class="select" data-k="c" style="width:150px">${EF.map(([k, l]) => html`<option value="${k}" ${(x.c || 'deduct') === k ? raw('selected') : ''}>${l}</option>`)}</select>`}</div>`; })}</div>
        <span class="hint">Boş bırakılan yazımda vardiya saat aralığıyla (08-16, 08-08), izin kısaltmasıyla (Y.İZİN, D.İZNİ, RAPOR) yazılır. “Gerekenden düşer”: hafta içine denk gelen her gün için günlük saat gereken saatten düşülür.</span></div>
      <div class="field"><label>İmza alanları</label><div class="stack" id="rsSig" style="gap:6px">${(t.sig || []).map(sigRow)}</div>
        <div><button type="button" class="btn sm" id="rsSigAdd" style="margin-top:6px">${icon('plus', 'sm')}<span>İmza ekle</span></button></div></div>
      ${RS2.canShare ? html`<div class="field"><label>Hastanedeki diğer birimler</label>
        <label class="small"><input type="checkbox" id="rsShare"> Kaydederken bu şablonu hastanemdeki birimlerle paylaş</label>
        ${RS2.shared.length ? html`<div class="row wrap" style="gap:6px;margin-top:6px"><select class="select" id="rsCopyK" style="width:auto">${RS2.shared.map((x) => html`<option value="${x.key}">${x.unit}</option>`)}</select><button type="button" class="btn sm" id="rsCopy">Bu birimin şablonunu kopyala</button></div>` : html`<span class="hint">Henüz şablon paylaşan birim yok.</span>`}</div>` : ''}
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="rsTplF">Kaydet</button>` });
  const f = $('#rsTplF', m.el);
  const del = (e) => { const x = e.target.closest('[data-x]'); if (x) x.closest('.rs-tr').remove(); };
  $('#rsDoc', m.el).addEventListener('click', del); $('#rsSig', m.el).addEventListener('click', del);
  $('#rsDocAdd', m.el).addEventListener('click', () => $('#rsDoc', m.el).insertAdjacentHTML('beforeend', String(docRow({ l: '', v: '' }))));
  $('#rsSigAdd', m.el).addEventListener('click', () => $('#rsSig', m.el).insertAdjacentHTML('beforeend', String(sigRow({ t: '', n: '' }))));
  $('#rsLogoIn', m.el).addEventListener('change', async (e) => { const fl = e.target.files[0]; if (!fl) return; try { logo = await rsLogoFrom(fl); setHTML($('#rsLogoPrev', m.el), html`<img src="${logo}" alt="Logo">`); } catch (er) { toast(er.message, 'err'); } });
  $('#rsLogoX', m.el).addEventListener('click', () => { logo = ''; setHTML($('#rsLogoPrev', m.el), html`<span class="tiny faint">Logo yok</span>`); });
  const cp = $('#rsCopy', m.el);
  if (cp) cp.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Şablon kopyalansın mı?', text: 'Bu birimin şablonu ve logosu seçilen birimin şablonuyla değişir.', ok: 'Kopyala' }))) return;
    try { await api('plan.tpl.copy', { key: $('#rsCopyK', m.el).value }); await rsLoadTpl(true); m.close(); toast('Şablon kopyalandı'); rsAfterTpl(); } catch (e) { toast(e.message, 'err'); }
  });
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async () => {
      const tpl = {
        lines: $$('[data-line]', f).map((i) => i.value.trim()).filter(Boolean),
        doc: $$('#rsDoc .rs-tr', f).map((r) => ({ l: $('[data-k=l]', r).value, v: $('[data-k=v]', r).value })),
        doc_labels: $('#rsDocL', f).checked,
        cols: Object.fromEntries($$('[data-col]', f).map((i) => [i.dataset.col, i.checked])),
        shade: $('#rsShade', f).checked, day_hours: +$('#rsDayH', f).value || 8, half_hours: +$('#rsHalfH', f).value || 0,
        sig: $$('#rsSig .rs-tr', f).map((r) => ({ t: $('[data-k=t]', r).value, n: $('[data-k=n]', r).value })),
        codes: Object.assign({}, RS2.tpl.codes || {}, Object.fromEntries($$('[data-code]', f).map((r) => [r.dataset.code, { p: $('[data-k=p]', r).value.trim(), c: ($('[data-k=c]', r) || {}).value || '' }]))),
      };
      const r = await api('plan.tpl.save', { tpl, logo, share: !!($('#rsShare', f) || {}).checked });
      RS2.tpl = r.tpl; RS2.logo = r.logo || ''; RS2.shared = r.shared || [];
      m.close(); toast('Şablon kaydedildi'); rsAfterTpl();
    });
  });
};
function rsAfterTpl() { if (PL2.tab === 'resmi') rsDocDraw(); else if (typeof planDraw === 'function') planDraw(); }

/* ---------------- Değişiklikler sekmesi ---------------- */
async function rsChgTab(box) {
  setHTML(box, html`<div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div></div>`);
  try { RS2.chg = (await api('plan.changes', { roster_id: PL2.rid, ym: PL2.ym })).changes; } catch (e) { setHTML(box, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  RS2.chgSel = new Set();
  rsChgDraw(box);
}
function rsChgList() {
  const q = trLower(RS2.chgQ.trim());
  return (RS2.chg || []).filter((x) => (!RS2.chgKind || x.kind === RS2.chgKind) && (!q || trLower(`${x.names} ${x.text} ${x.by}`).includes(q)));
}
function rsChgDraw(box) {
  box = box || $('#plTabBody');
  if (!box || !RS2.chg) return;
  const rows = rsChgList();
  const kinds = [...new Set(RS2.chg.map((x) => x.kind))];
  const KT = Object.fromEntries(RS2.chg.map((x) => [x.kind, x.kind_txt]));
  setHTML(box, html`<div class="stack">
    <div class="card card-pad row wrap" style="gap:8px;align-items:center">
      <input class="input grow" type="search" id="rsChgQ" placeholder="Kişi ya da metin ara" value="${RS2.chgQ}" style="min-width:160px">
      <select class="select" id="rsChgK" style="width:auto"><option value="">Tüm türler</option>${kinds.map((k) => html`<option value="${k}" ${RS2.chgKind === k ? raw('selected') : ''}>${KT[k]}</option>`)}</select>
      <button class="btn sm" data-act="rs-chg-xlsx" ${rows.length ? '' : raw('disabled')}>${icon('table', 'sm')}<span>Excel</span></button>
      <button class="btn sm ghost danger" data-act="rs-chg-del" ${RS2.chgSel.size ? '' : raw('disabled')}>${icon('trash', 'sm')}<span>Seçilenleri sil${RS2.chgSel.size ? ` (${RS2.chgSel.size})` : ''}</span></button>
    </div>
    <p class="tiny faint" style="margin:0">Yayından sonra olan değişim, devir, eksik çağrısı ve düzeltmeler. Hücrelerde küçük işaretle görünür, resmi çıktıda görünmez. Silmek yalnız bu kaydı kaldırır; liste güncel hâliyle kalır.</p>
    <div class="card"><div class="list">${rows.length ? html`<label class="list-row small" style="gap:8px"><input type="checkbox" id="rsChgAll" ${rows.every((x) => RS2.chgSel.has(x.id)) ? raw('checked') : ''}><b>Tümünü seç (${rows.length})</b></label>
      ${rows.map((x) => html`<label class="list-row" style="gap:8px;align-items:flex-start"><input type="checkbox" data-cid="${x.id}" ${RS2.chgSel.has(x.id) ? raw('checked') : ''} style="margin-top:3px">
        <div class="grow" style="min-width:0"><div class="lr-t"><span class="badge ${x.kind === 'swap' || x.kind === 'give' || x.kind === 'part' ? 'brand' : x.kind === 'report' || x.kind === 'leave' ? 'warn' : x.kind === 'remove' ? 'danger' : ''}">${x.kind_txt}</span> ${mkShortDate(x.date)} · ${x.names}</div>
        <div class="lr-s">${x.text}${x.by ? ' · ' + x.by : ''}${x.at ? ' · ' + fmtDateTime(x.at) : ''}</div></div></label>`)}`
      : html`<div class="list-row small muted">${RS2.chg.length ? 'Eşleşen kayıt yok.' : 'Bu ay yayından sonra değişiklik yok.'}</div>`}</div></div></div>`);
  $('#rsChgQ', box).addEventListener('input', debounce((e) => { RS2.chgQ = e.target.value; rsChgDraw(); const i = $('#rsChgQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250));
  $('#rsChgK', box).addEventListener('change', (e) => { RS2.chgKind = e.target.value; rsChgDraw(); });
  const all = $('#rsChgAll', box);
  if (all) all.addEventListener('change', () => { rows.forEach((x) => { if (all.checked) RS2.chgSel.add(x.id); else RS2.chgSel.delete(x.id); }); rsChgDraw(); });
  $$('[data-cid]', box).forEach((c) => c.addEventListener('change', () => { const id = +c.dataset.cid; if (c.checked) RS2.chgSel.add(id); else RS2.chgSel.delete(id); rsChgDraw(); }));
}
ACT['rs-chg-del'] = async () => {
  const ids = [...RS2.chgSel];
  if (!ids.length) return;
  if (!(await confirmDialog({ title: `${ids.length} kayıt silinsin mi?`, text: 'Kayıtlar değişiklik raporundan ve hücre işaretlerinden kaldırılır. Çizelge ve liste değişmez.', ok: 'Sil', danger: true }))) return;
  try {
    RS2.chg = (await api('plan.changes.delete', { roster_id: PL2.rid, ym: PL2.ym, ids })).changes;
    RS2.chgSel = new Set();
    const r = await api('plan.get', { roster_id: PL2.rid, ym: PL2.ym });
    PL2.marks = r.marks || {};
    toast(`${ids.length} kayıt silindi`); rsChgDraw();
  } catch (e) { toast(e.message, 'err'); }
};
ACT['rs-chg-xlsx'] = (el) => busy(el, async () => {
  await loadVendor('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Değişiklikler');
  ws.addRow([`${(PL2.roster || {}).name || ''} · ${TR_MONTHS[+PL2.ym.slice(5) - 1]} ${PL2.ym.slice(0, 4)} · yayından sonraki değişiklikler`]).font = { bold: true };
  ws.addRow(['Tarih', 'Tür', 'Kişi(ler)', 'Açıklama', 'Eski', 'Yeni', 'Yapan / onaylayan', 'Kayıt zamanı']).font = { bold: true };
  rsChgList().forEach((x) => ws.addRow([x.date.split('-').reverse().join('.'), x.kind_txt, x.names, x.text, x.old, x.new, x.by, x.at]));
  [12, 14, 30, 70, 8, 8, 22, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${(PL2.roster || {}).name || 'Liste'} ${TR_MONTHS[+PL2.ym.slice(5) - 1]} ${PL2.ym.slice(0, 4)} değişiklikler.xlsx`);
});

/* Ayarlar › Nöbet: resmi liste şablonuna kısayol (çizelgeyi yönetenler) */
NM_EXT.settingsCards.push({
  sec: 'nobet',
  html: () => (typeof canManage === 'function' && canManage('cizelge') && planRosters().length ? html`<div class="card card-pad stack" data-sec="nobet" id="rsSetCard"><div><h3 style="font-size:15px">${icon('file', 'sm')} Resmi liste şablonu</h3>
    <p class="small muted">Çizelgenin kurum formunda çıktısı: logo, başlık satırları, doküman numarası ve tarihi, saat sütunları, imza alanları. Çizelge › Resmi liste sekmesinden yazdırılır; Word ve Excel olarak indirilir.</p></div>
    <div><a class="btn" href="#/cizelge/${planRosters()[0].id}/${ymd(new Date()).slice(0, 7)}/resmi">${icon('sliders', 'sm')}<span>Resmi liste ve şablon</span></a></div></div>` : ''),
});
