/* dupcii — Resmi liste (4.34): çizelgenin kurumun kalite formunda çıktısı, saat hesabı, değişiklik raporu.
   Saatler her zaman çizelgenin güncel hâlinden (yayınlanmış liste + kabul edilen değişim / devir / çağrı + yöneticinin düzeltmeleri) hesaplanır.
   Çıktılar: önizleme, yazdır / PDF (A4 yatay, tek sayfa), Word (.docx, düzenlenebilir), Excel (.xlsx). Değişiklik işaretleri çıktıya yansımaz.
   Sunucu: inc/mod_resmi.php (plan.changes, plan.mark, plan.tpl.*, plan.signed). */
'use strict';

const RS2 = { tpl: null, cols: null, typeId: '', logo: '', names: { org: '', unit: '' }, shared: [], canShare: false, chg: null, chgSel: new Set(), chgKind: '', chgQ: '' };
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
/** Dakika: "HH:MM" → 0..1440 */
function rsMin(v) { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; }
/** Vardiyanın gece aralığına (varsayılan 20:00–08:00) düşen saati */
function rsNightH(c, tpl) {
  const total = +(c && c.hours) || 0;
  if (!total) return 0;
  const nf = rsMin(tpl.night_from || '20:00'), nt = rsMin(tpl.night_to || '08:00');
  const win = nf > nt ? [[nf - 1440, nt], [nf, nt + 1440], [nf + 1440, nt + 2880]] : [[nf, nt], [nf + 1440, nt + 1440]];
  const wlen = (nf > nt ? nt + 1440 - nf : nt - nf) / 60;
  const s = rsMin(c.start); let e = rsMin(c.end);
  if (s === null || e === null) return total >= 16 ? Math.min(total, wlen) : 0; // saatsiz kod: 16 saat ve üstü gece içerir
  if (e <= s) e += 1440;
  let m = 0;
  win.forEach(([a, b]) => { m += Math.max(0, Math.min(e, b) - Math.max(s, a)); });
  return Math.min(total, m / 60);
}
/**
 * Kişi başı saatler: { ad: { req, work, over, izin, day, night, night10, count, wkend, fixed } }
 *  izin    = hafta içine denk gelen izin / rapor günleri × günlük saat (gerekenden düşen)
 *  req     = iş günü × günlük saat − izin (elle düzeltme varsa o)
 *  work    = vardiya saatleri (+ "çalışılmış sayılır" günler);  day / night = gece aralığı dışı / içi
 *  over    = work − req;  night10 = fazla çalışmanın gece saatlerine düşen kısmı = min(gece, fazla) (%10 zamlı)
 */
function rsHours(D, ym, tpl, hol, half) {
  tpl = tpl || RS2.tpl || { day_hours: 8, half_hours: 4 };
  const days = planDays(ym);
  const dh = +tpl.day_hours || 8, hh = +tpl.half_hours || 0;
  const dayH = (d) => { const k = rsDayKind(d, hol, half); return k === 'work' ? dh : k === 'half' ? hh : 0; };
  const base = days.reduce((s, d) => s + dayH(d), 0);
  const r1 = (x) => Math.round(x * 10) / 10;
  const o = {};
  (D.people || []).forEach((p) => {
    let izin = 0, work = 0, night = 0, count = 0, wkend = 0;
    Object.entries((D.cells || {})[p.name] || {}).forEach(([d, code]) => {
      if (d.slice(0, 7) !== ym) return;
      const ef = rsEffect(code, tpl);
      const c = planCode(code);
      if (ef === 'shift') {
        const h = +(c && c.hours) || 0;
        work += h; night += rsNightH(c, tpl); count++;
        if (rsDayKind(d, hol, half) === 'off') wkend += h;
      } else if (ef === 'deduct') izin += dayH(d);
      else if (ef === 'work') work += dayH(d);
    });
    let req = base - izin;
    const fix = ((D.hfix || {})[p.name] || {}).req;
    const fixed = fix !== undefined && fix !== null && fix !== '';
    if (fixed) req = +fix;
    req = Math.max(0, r1(req)); work = r1(work); night = r1(night);
    const over = r1(work - req);
    o[p.name] = { req, work, over, izin: r1(izin), day: r1(work - night), night, night10: r1(Math.max(0, Math.min(night, over))), count, wkend: r1(wkend), fixed };
  });
  return o;
}
function rsNum(x) { return Number.isInteger(x) ? String(x) : String(x).replace('.', ','); }

/* ---------------- Şablon ---------------- */
async function rsLoadTpl(force) {
  if (RS2.tpl && !force) return RS2.tpl;
  const r = await api('plan.tpl.get');
  RS2.tpl = r.tpl; RS2.cols = r.cols || RS2.cols; RS2.logo = r.logo || ''; RS2.names = r.names || RS2.names; RS2.shared = r.shared || []; RS2.canShare = !!r.can_share;
  return RS2.tpl;
}
function rsFill(s, ym) {
  const [y, m] = ym.split('-').map(Number);
  const up = (x) => String(x || '').toLocaleUpperCase('tr');
  return String(s || '').replace(/\{HASTANE\}/g, RS2.names.org || '').replace(/\{BİRİM\}|\{BIRIM\}/g, up(RS2.names.unit)).replace(/\{LİSTE\}|\{LISTE\}/g, up((PL2.roster || {}).name))
    .replace(/\{YIL\}/g, String(y)).replace(/\{AY\}/g, up(TR_MONTHS[m - 1])).replace(/\s{2,}/g, ' ').trim();
}

/* ---------------- Liste türü ---------------- */
const RS_COLS_DEF = { izin: 'TOPLAM İZİN', req: 'ÇALIŞILMASI GEREKEN SAAT', work: 'ÇALIŞILAN SAAT', day: 'GÜNDÜZ ÇALIŞMA SAATİ', night: 'GECE MESAİSİ SAATİ', night10: '%10 ZAMLI ÖDENMESİ GEREKEN SAAT', over: 'FAZLA MESAİ SAATİ', count: 'NÖBET SAYISI', wkend: 'HAFTA SONU / TATİL SAATİ' };
function rsTypes() { return (RS2.tpl && RS2.tpl.types) || []; }
function rsType() {
  const ts = rsTypes();
  if (!RS2.typeId) { try { RS2.typeId = localStorage.getItem('nm-rs-type') || ''; } catch (e) { /* */ } }
  return ts.find((t) => t.id === RS2.typeId) || ts[0] || null;
}
function rsColLabel(T, k) { return ((T.labels || {})[k]) || (RS2.cols || RS_COLS_DEF)[k] || k; }
/** Hesap sütunu değeri (0 → boş; gereken saat ve eksi değerler yazılır) */
function rsVal(h, k) { const v = h[k]; return v === 0 && k !== 'req' ? '' : rsNum(v); }

/* ---------------- Çıktı modeli (önizleme, yazdır, Word, Excel aynı veriden) ---------------- */
function rsModel() {
  const tpl = RS2.tpl, T = rsType(), D = PL2.d, ym = PL2.ym;
  const cols = T.cols || {};
  const days = cols.days === false ? [] : planDays(ym);
  const hours = rsHours(D, ym, tpl, PL2.hol, PL2.half);
  const rows = D.people.map((p, i) => ({ no: i + 1, name: p.name, title: p.title || '', cells: days.map((d) => rsPrint(((D.cells || {})[p.name] || {})[d] || '', tpl)), h: hours[p.name] }));
  const sum = (T.sum || []).filter((k) => RS_COLS_DEF[k]);
  return {
    tpl, T, ym, days, rows, cols, sum,
    labels: Object.fromEntries(sum.map((k) => [k, rsColLabel(T, k)])),
    hl: new Set(T.hl || []),
    shade: T.shade !== false,
    docLabels: !!T.doc_labels,
    lines: (T.lines || []).map((l) => rsFill(l, ym)).filter(Boolean),
    doc: (T.doc || []).filter((x) => x.l || x.v),
    sig: (T.sig || []).filter((x) => x.t || x.n),
    logo: RS2.logo,
    off: days.map((d) => rsDayKind(d, PL2.hol, PL2.half) !== 'work'),
  };
}
const RS_DAY_UP = (d) => TR_DAYS[new Date(d + 'T12:00:00').getDay()].toLocaleUpperCase('tr');

/* ---------------- Ortak ölçüler: önizleme, PDF, Word ve Excel aynı sayılarla çizilir ----------------
 * Her sütun genişliği, satır yüksekliği, yazı boyutu (0,5 punto adımlı) ve satır kırılımı burada bir kez
 * hesaplanır; üç çıktı da bu sayıları birebir kullanır (yazı kendiliğinden kaydırılmaz, satır sonları açıkça yazılır). */
const RS_W = 279;      // tablo genişliği (mm): A4 yatay 297 − 2 × 7 mm kenar boşluğu − 4 mm pay
const RS_H = 191;      // kullanılabilir yükseklik (mm): 210 − 2 × 7 − 5 mm pay (çizgiler, yuvarlama)
const RS_LH = 1.15;    // satır aralığı (Arial “tek satır”: Word, Excel ve tarayıcıda aynı)
const RS_PAD = 0.9;    // hücre iç boşluğu toplamı (mm; sağ + sol)
const rsF5 = (pt) => Math.max(1, Math.floor(pt * 2 + 1e-6) / 2);
const RS_AW = (() => {
  const m = {};
  const set = (s, w) => { for (const c of s) m[c] = w; };
  set('ABEKPSVXYŞ', 0.667); set('CDHNRUÇÜ', 0.722); set('GOQĞÖ', 0.778); set('FTZ', 0.611); set('Iİ', 0.278); set('J', 0.5); set('L', 0.556); set('M', 0.833); set('W', 0.944);
  set('0123456789', 0.556); set(' ', 0.278); set('.,:;/!', 0.278); set('-()', 0.333); set('%', 0.889); set('+=<>', 0.584);
  set('abcdeghknopqsuvxyzçğöşü', 0.556); set('fjrtı', 0.3); set('il', 0.222); set('mw', 0.833);
  return m;
})();
/** Yazının Arial’da em cinsinden genişliği (kalın yazı ≈ %6 geniş, %4 güvenlik payı) */
function rsEm(t, bold) { let w = 0; for (const ch of String(t == null ? '' : t)) w += RS_AW[ch] || 0.62; return w * (bold ? 1.06 : 1) * 1.04; }
const rsTextMm = (t, pt, bold) => (rsEm(t, bold) * pt) / 2.835;
/** Tek satırda sütuna sığan punto (0,5 adımlı; üst sınır base) */
function rsFit(t, mm, base, bold, min = 3) { const em = rsEm(t, bold); return rsF5(Math.max(min, em ? Math.min(base, ((mm - RS_PAD) * 2.835) / em) : base)); }
/** Kelimeleri k satıra en kısa uzun satırla böl */
function rsSplit(words, k, bold) {
  let best = null;
  const rec = (i, left, acc) => {
    if (left === 1) { const l = acc.concat([words.slice(i).join(' ')]); const mx = Math.max(...l.map((x) => rsEm(x, bold))); if (!best || mx < best.mx) best = { l, mx }; return; }
    for (let j = i + 1; j <= words.length - left + 1; j++) rec(j, left - 1, acc.concat([words.slice(i, j).join(' ')]));
  };
  rec(0, k, []);
  return best.l;
}
/** Yazıyı en çok maxLines satıra böl: satır uzunluğu len mm, satırların dizildiği yön across mm; en büyük puntoyu veren bölüm */
function rsWrap(text, len, across, base, bold, maxLines = 2, min = 3) {
  const t = String(text == null ? '' : text).trim();
  const words = t.split(/\s+/).filter(Boolean);
  const hp = (k) => rsF5(((across - 0.5) * 2.835) / (k * RS_LH));
  let best = { lines: [t], pt: Math.max(min, Math.min(rsFit(t, len, base, bold, min), hp(1))) };
  for (let k = 2; k <= Math.min(maxLines, words.length); k++) {
    const lines = rsSplit(words, k, bold);
    const pt = Math.max(min, Math.min(...lines.map((l) => rsFit(l, len, base, bold, min)), hp(k)));
    if (pt > best.pt + 0.01) best = { lines, pt };
  }
  return best;
}
/** Sütun genişlikleri (mm). Şablondaki elle ayar (T.widths) önce gelir; gün sütunları kalan genişliği paylaşır. */
function rsWidths(M) {
  const hasDays = M.days.length > 0, u = (M.T && M.T.widths) || {};
  const pick = (k, def) => (+u[k] > 0 ? +u[k] : def);
  const noW = M.cols.sira ? pick('no', 6) : 0;
  let nameW = pick('name', hasDays ? 36 : 52), titleW = M.cols.unvan ? pick('unvan', hasDays ? 22 : 34) : 0;
  let hW = M.sum.length ? pick('h', hasDays ? 9 : 0) : 0;
  if (!hasDays) {
    if (!hW) hW = Math.min(34, (RS_W - noW - nameW - titleW) / Math.max(1, M.sum.length));
    nameW = Math.max(12, RS_W - noW - titleW - hW * M.sum.length);
    return { noW, nameW, titleW, hW, dayW: 0, auto: { name: true } };
  }
  const fixed = noW + nameW + titleW + hW * M.sum.length;
  let dayW = (RS_W - fixed) / M.days.length;
  const minDay = 4.4;
  if (dayW < minDay) { const k = (RS_W - minDay * M.days.length - noW) / (fixed - noW); nameW *= k; titleW *= k; hW *= k; dayW = minDay; }
  return { noW, nameW, titleW, hW, dayW, auto: {} };
}
/** “Yazıya göre sığdır”: ad, unvan ve hesap sütunu en uzun yazıya göre (mm) */
function rsAutoWidths(M) {
  const hasDays = M.days.length > 0;
  const n = Math.max(1, M.rows.length);
  const rowMm = Math.max(3, Math.min(6.2, 118 / n)), fs = rsF5(Math.max(4.5, Math.min(7.5, rowMm * 1.15)));
  const nm = Math.max(rsTextMm('ADI SOYADI', 7, true), ...M.rows.map((r) => rsTextMm(r.name.toLocaleUpperCase('tr'), fs))) + RS_PAD + 0.6;
  const un = Math.max(rsTextMm('UNVAN', 7, true), ...M.rows.map((r) => { const w = String(r.title || '').toLocaleUpperCase('tr').split(/\s+/).filter(Boolean); if (!w.length) return 0; const l = w.length > 1 ? rsSplit(w, 2, false) : w; return Math.max(...l.map((x) => rsTextMm(x, fs - 0.5))); })) + RS_PAD + 0.6;
  const hv = Math.max(...M.rows.flatMap((r) => M.sum.map((k) => rsTextMm(rsVal(r.h, k), hasDays ? fs : Math.min(9, fs + 1.5), true))), 0) + RS_PAD + 1;
  const r1 = (x) => Math.round(x * 2) / 2;
  return { no: 6, name: r1(Math.min(80, Math.max(18, nm))), unvan: r1(Math.min(60, Math.max(10, un))), h: hasDays ? r1(Math.min(20, Math.max(6, hv))) : 0 };
}

/** Bütün çıktıların ortak yerleşimi */
function rsLayout(M) {
  const hasDays = M.days.length > 0;
  const W = rsWidths(M);
  const cols = [...(M.cols.sira ? [W.noW] : []), W.nameW, ...(M.cols.unvan ? [W.titleW] : []), ...M.days.map(() => W.dayW), ...M.sum.map(() => W.hW)];
  const C = cols.length;
  const edges = [0];
  cols.forEach((w) => edges.push(edges[edges.length - 1] + w));
  const total = edges[C];
  const near = (x, lo, hi) => { let b = Math.max(0, Math.min(lo, hi)); for (let i = lo; i <= hi; i++) if (Math.abs(edges[i] - x) < Math.abs(edges[b] - x)) b = i; return b; };
  // Başlık kutusu sütunları tablonun sütun sınırlarına oturur (Excel’de aynı hücreler birleşir)
  // Logo kutusu en az ~18 mm, doküman kutusu en az ~30 mm olacak sütun sınırı (yoksa en yakını)
  const nearMin = (x, lo, hi, ok) => { const c = []; for (let i = lo; i <= hi; i++) if (ok(i)) c.push(i); if (!c.length) return near(x, lo, hi); return c.reduce((b, i) => (Math.abs(edges[i] - x) < Math.abs(edges[b] - x) ? i : b), c[0]); };
  const logoC = C >= 3 ? nearMin(30, 1, C - 2, (i) => edges[i] >= 18 && edges[i] <= 70) : 0;
  const boxC = C >= 2 ? nearMin(total - 46, logoC + 1, C - 1, (i) => total - edges[i] >= 30 && total - edges[i] <= 90) : C;
  const split = M.docLabels && boxC <= C - 2;
  const lblC = split ? near(edges[boxC] + (total - edges[boxC]) * 0.45, boxC + 1, C - 1) : boxC;
  const N = Math.max(1, M.doc.length);
  const head = { N, logoC, boxC, lblC, split, logoW: edges[logoC], midW: edges[boxC] - edges[logoC], boxW: total - edges[boxC], lblW: edges[lblC] - edges[boxC], valW: total - edges[lblC] };
  head.lines = M.lines.map((l, i) => ({ t: l, pt: rsFit(l, head.midW - 3, i === M.lines.length - 1 ? 9.5 : 8.5, true, 5) }));
  const linesMm = head.lines.reduce((a, x) => a + (x.pt * RS_LH) / 2.835, 0);
  head.mm = Math.max(18, N * 4.4, linesMm + 3);
  head.rowMm = head.mm / N;
  head.logoBox = { w: Math.max(4, head.logoW - 3), h: Math.max(4, Math.min(18, head.mm - 3)) };
  const docPt = (t, mm, b) => Math.min(rsFit(t, mm, 6.5, b, 3.5), rsF5(((head.rowMm - 0.6) * 2.835) / RS_LH));
  head.doc = M.doc.map((x) => (split ? { l: x.l, v: x.v, lp: docPt(x.l, head.lblW, true), vp: docPt(x.v, head.valW, false) } : { v: M.docLabels ? (x.l && x.v ? `${x.l}: ${x.v}` : x.l || x.v) : x.v, vp: docPt(M.docLabels ? `${x.l}: ${x.v}` : x.v, head.boxW, false) }));
  // Tablo başlığı
  const dnPt = hasDays ? rsF5(Math.min(4.5, ((W.dayW - RS_PAD) * 2.835) / 0.85)) : 0;
  const maxL = hasDays ? Math.max(...M.days.map((d) => RS_DAY_UP(d).length)) : 0;
  const dnMm = hasDays ? Math.ceil(((maxL * dnPt * RS_LH) / 2.835 + 1.5) * 2) / 2 : 0;
  const sigMm = M.sig.length ? 6 + 4 + 4 + 10 : 0;
  const n = Math.max(1, M.rows.length);
  // Satır yüksekliği: sayfaya sığacak kadar (kişi sayısına göre)
  const ddGuess = 4.5;
  const avail = RS_H - head.mm - 2 - (hasDays ? dnMm + ddGuess : 34) - sigMm;
  const rowMm = Math.floor(Math.max(3, Math.min(6.2, avail / n)) * 10) / 10;
  const fs = rsF5(Math.max(4.5, Math.min(7.5, rowMm * 1.15)));
  const ddMm = hasDays ? Math.max(3.8, Math.min(ddGuess, rowMm)) : 0;
  const hdrMm = hasDays ? dnMm + ddMm : 34;
  const hdr = {
    dnMm, ddMm, mm: hdrMm, dnPt,
    ddPt: hasDays ? Math.min(rsF5(Math.min(7, fs + 0.5)), rsFit('31', W.dayW, 7, true)) : 0,
    no: M.cols.sira ? rsWrap('Sıra No', W.noW, hdrMm, 6, true, 2) : null,
    name: rsFit('ADI SOYADI', W.nameW, 7, true),
    unvan: M.cols.unvan ? rsFit('UNVAN', W.titleW, 7, true) : 0,
    sum: M.sum.map((k) => rsWrap(M.labels[k], hdrMm - 1.5, W.hW, hasDays ? 5.5 : 7, true, 4)),
  };
  const hPt = hasDays ? fs : Math.min(9, fs + 1.5);
  const rows = M.rows.map((r) => {
    const nm = r.name.toLocaleUpperCase('tr'), un = r.title.toLocaleUpperCase('tr');
    return {
      no: String(r.no), noPt: M.cols.sira ? rsFit(String(r.no), W.noW, fs) : 0,
      name: nm, namePt: rsFit(nm, W.nameW, fs),
      unvan: M.cols.unvan ? rsWrap(un, W.titleW, rowMm, fs - 0.5, false, 2) : null,
      cells: r.cells.map((c) => ({ t: c, pt: rsFit(c, W.dayW, fs - 0.5) })),
      h: M.sum.map((k) => { const t = rsVal(r.h, k); return { t, pt: rsFit(t, W.hW, hPt, M.hl.has(k)) }; }),
    };
  });
  // İmzalar: tablo genişliği imza sayısına bölünür, sınırlar sütun sınırlarına oturur
  const sig = [];
  if (M.sig.length) {
    const S = Math.min(M.sig.length, C);
    let prev = 0;
    for (let k = 1; k <= S; k++) {
      const e = k === S ? C : near((k * total) / S, prev + 1, C - (S - k));
      const w = edges[e] - edges[prev];
      const s = M.sig[k - 1];
      sig.push({ c0: prev, c1: e, w, t: s.t.toLocaleUpperCase('tr'), tp: rsFit(s.t.toLocaleUpperCase('tr'), w - 6, 7.5, true, 4), n: s.n, np: rsFit(s.n, w - 6, 7.5, false, 4) });
      prev = e;
    }
  }
  return { W, cols, C, edges, total, head, hdr, rows, rowMm, fs, sig, sigRows: [6, 4, 4, 10], gap: 2 };
}

/** Önizleme ve yazdırma için HTML (yalnız güvenli kaçışlı metin) */
function rsDocHtml(M, opts = {}) {
  const e = esc, L = rsLayout(M), H = L.head, hasDays = M.days.length > 0;
  const mm = (x) => `${(+x).toFixed(2)}mm`;
  const lines = (a) => a.map(e).join('<br>');
  const off = (i) => (M.shade && M.off[i] ? ' off' : '');
  const hl = (k) => (M.hl.has(k) ? ' hl' : '');
  // Başlık: logo | satırlar | doküman kutusu (Word ve Excel’de aynı ızgara)
  const hcols = [H.logoW, H.midW, ...(H.split ? [H.lblW, H.valW] : H.boxW ? [H.boxW] : [])].filter((w) => w > 0);
  const logoImg = M.logo ? `<img src="${e(M.logo)}" alt="" style="max-width:${mm(H.logoBox.w)};max-height:${mm(H.logoBox.h)}">` : '';
  const hrows = [];
  for (let r = 0; r < H.N; r++) {
    const x = H.doc[r];
    const first = r === 0 ? `${H.logoW ? `<td class="rd-logo" rowspan="${H.N}">${logoImg}</td>` : ''}<td class="rd-title" rowspan="${H.N}">${H.lines.map((l) => `<div style="font-size:${l.pt}pt">${e(l.t)}</div>`).join('')}</td>` : '';
    const box = !H.boxW ? '' : H.split ? `<td class="rd-dl" style="font-size:${x ? x.lp : 6.5}pt">${x ? e(x.l) : ''}</td><td class="rd-dv" style="font-size:${x ? x.vp : 6.5}pt">${x ? e(x.v) : ''}</td>` : `<td class="rd-dv" style="font-size:${x ? x.vp : 6.5}pt">${x ? e(x.v) : ''}</td>`;
    hrows.push(`<tr style="height:${mm(H.rowMm)}">${first}${box}</tr>`);
  }
  const head = `<table class="rd-head" style="width:${mm(L.total)}"><colgroup>${hcols.map((w) => `<col style="width:${mm(w)}">`).join('')}</colgroup>${hrows.join('')}</table>`;
  const rs = hasDays ? ' rowspan="2"' : '';
  const hd = L.hdr;
  const th1 = `<tr style="height:${mm(hasDays ? hd.dnMm : hd.mm)}">${M.cols.sira ? `<th class="rd-no"${rs} style="font-size:${hd.no.pt}pt">${lines(hd.no.lines)}</th>` : ''}<th class="rd-name"${rs} style="font-size:${hd.name}pt">ADI SOYADI</th>${M.cols.unvan ? `<th class="rd-unv"${rs} style="font-size:${hd.unvan}pt">UNVAN</th>` : ''}`
    + M.days.map((d, i) => `<th class="rd-dn${off(i)}" style="font-size:${hd.dnPt}pt">${lines([...RS_DAY_UP(d)])}</th>`).join('')
    + M.sum.map((k, i) => `<th class="rd-hc${hl(k)}"${rs}><div class="rd-rot" style="font-size:${hd.sum[i].pt}pt;width:${mm(hd.mm - 1.5)}">${lines(hd.sum[i].lines)}</div></th>`).join('') + '</tr>';
  const th2 = hasDays ? `<tr style="height:${mm(hd.ddMm)}">${M.days.map((d, i) => `<th class="rd-dd${off(i)}" style="font-size:${hd.ddPt}pt">${+d.slice(8)}</th>`).join('')}</tr>` : '';
  const body = L.rows.map((r) => `<tr style="height:${mm(L.rowMm)}">${M.cols.sira ? `<td class="rd-no" style="font-size:${r.noPt}pt">${r.no}</td>` : ''}<td class="rd-name" style="font-size:${r.namePt}pt">${e(r.name)}</td>${r.unvan ? `<td class="rd-unv" style="font-size:${r.unvan.pt}pt">${lines(r.unvan.lines)}</td>` : ''}`
    + r.cells.map((c, i) => `<td class="rd-c${off(i)}" style="font-size:${c.pt}pt">${e(c.t)}</td>`).join('')
    + r.h.map((x, i) => `<td class="rd-h${hl(M.sum[i])}" style="font-size:${x.pt}pt">${e(x.t)}</td>`).join('') + '</tr>').join('');
  const sig = L.sig.length ? `<table class="rd-sig" style="width:${mm(L.total)};margin-top:${mm(L.sigRows[0])}"><colgroup>${L.sig.map((s) => `<col style="width:${mm(s.w)}">`).join('')}</colgroup>
    <tr style="height:${mm(L.sigRows[1])}">${L.sig.map((s) => `<td><b style="font-size:${s.tp}pt">${e(s.t)}</b></td>`).join('')}</tr>
    <tr style="height:${mm(L.sigRows[2])}">${L.sig.map((s) => `<td style="font-size:${s.np}pt">${e(s.n)}</td>`).join('')}</tr>
    <tr style="height:${mm(L.sigRows[3])}">${L.sig.map(() => '<td></td>').join('')}</tr></table>` : '';
  const css = `
    .rd{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;box-sizing:border-box;width:${mm(L.total)};line-height:${RS_LH}}
    .rd *{box-sizing:border-box}
    .rd table{border-collapse:collapse;table-layout:fixed}
    .rd td,.rd th{padding:0 ${mm(RS_PAD / 2)};overflow:hidden;white-space:nowrap;text-align:center;vertical-align:middle;line-height:${RS_LH}}
    .rd-head{margin-bottom:${mm(L.gap)}}
    .rd-head td{border:1px solid #000}
    .rd-logo{line-height:0!important}.rd-logo img{display:block;margin:0 auto}
    .rd-title{font-weight:700}
    .rd-head .rd-dl,.rd-head .rd-dv{text-align:left}.rd-dl{font-weight:700}
    .rd-grid{width:${mm(L.total)};border:1px solid #000}
    .rd-grid th,.rd-grid td{border:1px solid #000}
    .rd-grid th{font-weight:700}
    .rd-grid .rd-dn{vertical-align:bottom;padding-bottom:.5mm}
    .rd-grid .rd-hc{padding:0}.rd-rot{display:inline-block;transform:rotate(-90deg);white-space:nowrap;text-align:center}
    .rd-grid .rd-hc{position:relative}.rd-grid .rd-hc .rd-rot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-90deg)}
    .rd-grid .off{background:#e6e6e6}.rd-grid .hl{background:#c6efce}.rd-grid td.hl{font-weight:700}
    .rd-sig td{text-align:center;vertical-align:top}.rd-sig b{font-weight:700}
    ${opts.page ? '@page{size:A4 landscape;margin:7mm}html,body{margin:0;background:#fff}' : ''}`;
  const grid = `<table class="rd-grid"><colgroup>${L.cols.map((w) => `<col style="width:${mm(w)}">`).join('')}</colgroup>
    <thead>${th1}${th2}</thead><tbody>${body}</tbody></table>`;
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
  const M = rsModel(), L = rsLayout(M), H = L.head, hd = L.hdr, hasDays = M.days.length > 0;
  const img = await rsImgInfo(M.logo);
  const X = rsXml;
  const tw = (mm) => Math.round(mm * 56.693); // twip
  const hp = (pt) => Math.round(pt * 2); // yarım punto (ölçüler 0,5 punto adımlı)
  // Türkçe karakterler: yazı tipi tüm alanlarda Arial, dil tr-TR
  const run = (t, pt, b) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/>${b ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${hp(pt)}"/><w:szCs w:val="${hp(pt)}"/><w:lang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="ar-SA"/></w:rPr><w:t xml:space="preserve">${X(String(t == null ? '' : t).normalize('NFC'))}</w:t></w:r>`;
  const brk = '<w:r><w:br/></w:r>';
  const pPr = (jc) => `<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc || 'center'}"/></w:pPr>`;
  /** Tek paragraf; satırlar açık satır sonuyla (hiçbir yazı kendiliğinden kaydırılmaz) */
  const para = (lines, pt, b, jc) => `<w:p>${pPr(jc)}${(Array.isArray(lines) ? lines : [lines]).map((l) => run(l, pt, b)).join(brk)}</w:p>`;
  const spacer = (mm) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.max(20, Math.round(mm * 56.693))}" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t></w:t></w:r></w:p>`;
  const padT = tw(RS_PAD / 2);
  const cell = (inner, o = {}) => `<w:tc><w:tcPr>${o.w ? `<w:tcW w:w="${o.w}" w:type="dxa"/>` : ''}${o.span > 1 ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.vm ? `<w:vMerge${o.vm === 'start' ? ' w:val="restart"' : ''}/>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}${o.dir ? `<w:textDirection w:val="${o.dir}"/>` : ''}${o.nw ? '<w:noWrap/>' : ''}<w:vAlign w:val="${o.va || 'center'}"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${padT}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${padT}" w:type="dxa"/></w:tcMar></w:tcPr>${inner || para('', 1)}</w:tc>`;
  const bd = (v) => `<w:top w:val="${v}" w:sz="6" w:color="000000"/><w:left w:val="${v}" w:sz="6" w:color="000000"/><w:bottom w:val="${v}" w:sz="6" w:color="000000"/><w:right w:val="${v}" w:sz="6" w:color="000000"/><w:insideH w:val="${v}" w:sz="6" w:color="000000"/><w:insideV w:val="${v}" w:sz="6" w:color="000000"/>`;
  const tbl = (grid, rows, o = {}) => `<w:tbl><w:tblPr><w:tblW w:w="${grid.reduce((s, x) => s + x, 0)}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${bd(o.noBorder ? 'nil' : 'single')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${padT}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${padT}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
  const tr = (cells, mm) => `<w:tr><w:trPr><w:trHeight w:val="${tw(mm)}" w:hRule="exact"/><w:cantSplit/></w:trPr>${cells.join('')}</w:tr>`;
  // Twip ızgarası: yuvarlama farkı birikmesin diye sınırlardan
  const gridOf = (edges) => edges.slice(1).map((x, i) => tw(x) - tw(edges[i]));
  // Başlık: logo | satırlar | doküman kutusu
  let drawing = '';
  if (img) {
    const sc = Math.min(H.logoBox.w / img.w, H.logoBox.h / img.h);
    const fw = Math.round(img.w * sc * 36000), fh = Math.round(img.h * sc * 36000);
    drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${fw}" cy="${fh}"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.${img.ext === 'png' ? 'png' : 'jpg'}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fw}" cy="${fh}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  const hEdges = [0, H.logoW, H.logoW + H.midW, ...(H.split ? [H.logoW + H.midW + H.lblW] : []), ...(H.boxW ? [L.total] : [])].filter((x, i, a) => i === 0 || x > a[i - 1]);
  const hGrid = gridOf(hEdges);
  const headRows = [];
  for (let r = 0; r < H.N; r++) {
    const x = H.doc[r];
    const vm = H.N > 1 ? (r === 0 ? 'start' : 'cont') : '';
    const cs = [];
    if (H.logoW) cs.push(cell(r === 0 && drawing ? `<w:p>${pPr('center')}${drawing}</w:p>` : '', { vm }));
    cs.push(cell(r === 0 ? H.lines.map((l) => para(l.t, l.pt, true)).join('') || para('', 1) : '', { vm }));
    if (H.boxW) {
      if (H.split) cs.push(cell(x ? para(x.l, x.lp, true, 'left') : ''), cell(x ? para(x.v, x.vp, false, 'left') : ''));
      else cs.push(cell(x ? para(x.v, x.vp, false, 'left') : ''));
    }
    headRows.push(tr(cs, H.rowMm));
  }
  const head = tbl(hGrid, headRows);
  // Ana tablo
  const grid = gridOf(L.edges);
  const shade = (i) => (M.shade && M.off[i] ? 'E6E6E6' : '');
  const hlf = (k) => (M.hl.has(k) ? 'C6EFCE' : '');
  const vm1 = hasDays ? { vm: 'start' } : {};
  const h1 = tr([...(M.cols.sira ? [cell(para(hd.no.lines, hd.no.pt, true), vm1)] : []), cell(para('ADI SOYADI', hd.name, true), Object.assign({ nw: true }, vm1)), ...(M.cols.unvan ? [cell(para('UNVAN', hd.unvan, true), Object.assign({ nw: true }, vm1))] : []),
    ...M.days.map((d, i) => cell(para([...RS_DAY_UP(d)], hd.dnPt, true), { fill: shade(i), va: 'bottom' })),
    ...M.sum.map((k, i) => cell(para(hd.sum[i].lines, hd.sum[i].pt, true), Object.assign({ dir: 'btLr', fill: hlf(k) }, vm1)))], hasDays ? hd.dnMm : hd.mm);
  const h2 = hasDays ? tr([...(M.cols.sira ? [cell('', { vm: 'cont' })] : []), cell('', { vm: 'cont' }), ...(M.cols.unvan ? [cell('', { vm: 'cont' })] : []),
    ...M.days.map((d, i) => cell(para(String(+d.slice(8)), hd.ddPt, true), { fill: shade(i), nw: true })), ...M.sum.map((k) => cell('', { vm: 'cont', fill: hlf(k) }))], hd.ddMm) : '';
  const body = L.rows.map((r) => tr([...(M.cols.sira ? [cell(para(r.no, r.noPt), { nw: true })] : []), cell(para(r.name, r.namePt), { nw: true }), ...(r.unvan ? [cell(para(r.unvan.lines, r.unvan.pt))] : []),
    ...r.cells.map((c, i) => cell(para(c.t, c.pt), { fill: shade(i), nw: true })),
    ...r.h.map((x, i) => cell(para(x.t, x.pt, M.hl.has(M.sum[i])), { fill: hlf(M.sum[i]), nw: true }))], L.rowMm));
  const sigs = L.sig.length ? spacer(L.sigRows[0]) + tbl(gridOf([0, ...L.sig.map((s) => L.edges[s.c1])]), [
    tr(L.sig.map((s) => cell(para(s.t, s.tp, true), { va: 'top' })), L.sigRows[1]),
    tr(L.sig.map((s) => cell(para(s.n, s.np), { va: 'top' })), L.sigRows[2]),
    tr(L.sig.map(() => cell('')), L.sigRows[3])], { noBorder: true }) : '';
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${head}${spacer(L.gap)}${tbl(grid, [h1, ...(h2 ? [h2] : []), ...body])}${sigs}${spacer(0.4)}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="397" w:right="397" w:bottom="397" w:left="397" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:lang w:val="tr-TR" w:eastAsia="tr-TR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${padT}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${padT}" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`],
    ['word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:themeFontLang w:val="tr-TR"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(rsFileBase())}</dc:title><dc:language>tr-TR</dc:language><dc:creator>dupcii</dc:creator></cp:coreProperties>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${img ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${img.ext === 'png' ? 'png' : 'jpg'}"/>` : ''}</Relationships>`],
    ['word/document.xml', docXml],
  ];
  if (img) files.push([`word/media/logo.${img.ext === 'png' ? 'png' : 'jpg'}`, img.u8]);
  return rsZip(files);
}

/* ---------------- Excel (.xlsx): aynı ölçüler — sütun genişliği mm’den, satır yüksekliği mm’den ---------------- */
async function rsXlsx() {
  const M = rsModel(), L = rsLayout(M), H = L.head, hd = L.hdr, hasDays = M.days.length > 0;
  await loadVendor('exceljs');
  const wb = new ExcelJS.Workbook();
  const [y, m] = M.ym.split('-').map(Number);
  const mar = 7 / 25.4;
  const ws = wb.addWorksheet(`${TR_MONTHS[m - 1].toLocaleUpperCase('tr')} ${y}`, { properties: { defaultRowHeight: 12 }, views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, margins: { left: mar, right: mar, top: mar, bottom: mar, header: 0, footer: 0 } } });
  wb.creator = 'dupcii'; wb.title = rsFileBase();
  const C = L.C;
  const pxOf = (mm) => (mm * 96) / 25.4;
  const ptOf = (mm) => Math.round(mm * 2.8346 * 100) / 100;
  // Sütun genişliği: Excel birimi = piksel / 7 (varsayılan yazı tipinin rakam genişliği)
  L.cols.forEach((w, i) => { ws.getColumn(i + 1).width = Math.round((pxOf(w) / 7) * 1000) / 1000; });
  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const F = (pt, b) => ({ name: 'Arial', size: pt, bold: !!b });
  const fillOf = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const merge = (r1, c1, r2, c2) => { if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2); };
  const put = (r, c, v, o = {}) => { const x = ws.getCell(r, c); x.value = typeof v === 'string' ? v.normalize('NFC') : v; x.font = F(o.pt || 6, o.b); x.alignment = Object.assign({ horizontal: 'center', vertical: 'middle', wrapText: !!o.wrap }, o.al || {}); if (o.fill) x.fill = fillOf(o.fill); return x; };
  // 1) Başlık: N satır
  let row = 1;
  for (let r = 0; r < H.N; r++) ws.getRow(row + r).height = ptOf(H.rowMm);
  if (H.logoC > 0) merge(row, 1, row + H.N - 1, H.logoC);
  merge(row, H.logoC + 1, row + H.N - 1, H.boxC);
  const tc = ws.getCell(row, H.logoC + 1);
  tc.value = { richText: H.lines.map((l, i) => ({ text: (i ? '\n' : '') + String(l.t).normalize('NFC'), font: F(l.pt, true) })) };
  tc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let r = 0; r < H.N; r++) {
    const x = H.doc[r];
    if (H.boxC >= C) break;
    if (H.split) {
      merge(row + r, H.boxC + 1, row + r, H.lblC); merge(row + r, H.lblC + 1, row + r, C);
      if (x) { put(row + r, H.boxC + 1, x.l, { pt: x.lp, b: true, al: { horizontal: 'left' } }); put(row + r, H.lblC + 1, x.v, { pt: x.vp, al: { horizontal: 'left' } }); }
    } else {
      merge(row + r, H.boxC + 1, row + r, C);
      if (x) put(row + r, H.boxC + 1, x.v, { pt: x.vp, al: { horizontal: 'left' } });
    }
  }
  for (let r = row; r < row + H.N; r++) for (let c = 1; c <= C; c++) ws.getCell(r, c).border = box;
  if (M.logo && H.logoC > 0) {
    const img = await rsImgInfo(M.logo);
    if (img) {
      const id = wb.addImage({ base64: img.b64, extension: img.ext === 'png' ? 'png' : 'jpeg' });
      const sc = Math.min(H.logoBox.w / img.w, H.logoBox.h / img.h);
      const iwMm = img.w * sc, ihMm = img.h * sc;
      // Logo hücresinin tam ortası (sütun ve satır içindeki kesirli konum)
      let x = (H.logoW - iwMm) / 2, col = 0;
      while (col < H.logoC - 1 && x >= L.cols[col]) { x -= L.cols[col]; col++; }
      let yy = (H.mm - ihMm) / 2, rr = 0;
      while (rr < H.N - 1 && yy >= H.rowMm) { yy -= H.rowMm; rr++; }
      ws.addImage(id, { tl: { nativeCol: col, nativeColOff: Math.round(x * 36000), nativeRow: rr, nativeRowOff: Math.round(yy * 36000) }, ext: { width: pxOf(iwMm), height: pxOf(ihMm) }, editAs: 'oneCell' });
    }
  }
  row += H.N;
  ws.getRow(row).height = ptOf(L.gap); row++;
  // 2) Tablo başlığı
  const hr = row;
  let c = 1;
  const lead = (txt, pt) => { if (hasDays) merge(hr, c, hr + 1, c); put(hr, c, txt, { pt, b: true, wrap: true }); c++; };
  if (M.cols.sira) lead(hd.no.lines.join('\n'), hd.no.pt);
  lead('ADI SOYADI', hd.name);
  if (M.cols.unvan) lead('UNVAN', hd.unvan);
  M.days.forEach((d, i) => {
    const f = M.shade && M.off[i] ? 'FFE6E6E6' : '';
    put(hr, c, [...RS_DAY_UP(d)].join('\n'), { pt: hd.dnPt, b: true, wrap: true, fill: f, al: { vertical: 'bottom' } });
    put(hr + 1, c, +d.slice(8), { pt: hd.ddPt, b: true, fill: f });
    c++;
  });
  M.sum.forEach((k, i) => { if (hasDays) merge(hr, c, hr + 1, c); put(hr, c, hd.sum[i].lines.join('\n'), { pt: hd.sum[i].pt, b: true, wrap: true, fill: M.hl.has(k) ? 'FFC6EFCE' : '', al: { textRotation: 90 } }); c++; });
  ws.getRow(hr).height = ptOf(hasDays ? hd.dnMm : hd.mm);
  if (hasDays) ws.getRow(hr + 1).height = ptOf(hd.ddMm);
  row = hr + (hasDays ? 2 : 1);
  // 3) Kişiler
  const r0 = row;
  L.rows.forEach((r) => {
    let k = 1;
    if (M.cols.sira) put(row, k++, +r.no, { pt: r.noPt });
    put(row, k++, r.name, { pt: r.namePt });
    if (r.unvan) put(row, k++, r.unvan.lines.join('\n'), { pt: r.unvan.pt, wrap: r.unvan.lines.length > 1 });
    r.cells.forEach((x, i) => put(row, k++, x.t, { pt: x.pt, fill: M.shade && M.off[i] ? 'FFE6E6E6' : '' }));
    r.h.forEach((x, i) => { const key = M.sum[i]; const v = x.t === '' ? '' : (Number.isFinite(+String(x.t).replace(',', '.')) ? +String(x.t).replace(',', '.') : x.t); put(row, k++, v, { pt: x.pt, b: M.hl.has(key), fill: M.hl.has(key) ? 'FFC6EFCE' : '' }); });
    ws.getRow(row).height = ptOf(L.rowMm);
    row++;
  });
  for (let r = hr; r < row; r++) for (let k = 1; k <= C; k++) ws.getCell(r, k).border = box;
  // 4) İmzalar
  if (L.sig.length) {
    ws.getRow(row).height = ptOf(L.sigRows[0]); row++;
    const sr = row;
    L.sig.forEach((s) => {
      merge(sr, s.c0 + 1, sr, s.c1); merge(sr + 1, s.c0 + 1, sr + 1, s.c1);
      put(sr, s.c0 + 1, s.t, { pt: s.tp, b: true, al: { vertical: 'top' } });
      put(sr + 1, s.c0 + 1, s.n, { pt: s.np, al: { vertical: 'top' } });
    });
    ws.getRow(sr).height = ptOf(L.sigRows[1]); ws.getRow(sr + 1).height = ptOf(L.sigRows[2]); ws.getRow(sr + 2).height = ptOf(L.sigRows[3]);
    row = sr + 3;
  }
  // Yazdırma alanı: başlık, tablo ve imzalar tek A4 sayfasında
  const colL = (n) => { let t = ''; while (n > 0) { const r = (n - 1) % 26; t = String.fromCharCode(65 + r) + t; n = Math.floor((n - 1) / 26); } return t; };
  ws.pageSetup.printArea = `A1:${colL(C)}${row - 1}`;
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function rsFileBase() { return `${(PL2.roster || {}).name || 'Liste'} ${TR_MONTHS[+PL2.ym.slice(5) - 1]} ${PL2.ym.slice(0, 4)} ${((rsType() || {}).name || 'resmi liste').toLocaleLowerCase('tr')}`; }

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
      <div class="row wrap" style="gap:8px;align-items:center"><label class="small muted" for="rsTypeSel">Liste türü</label>
        <select class="select" id="rsTypeSel" data-change="rs-type" style="width:auto;max-width:100%">${rsTypes().map((x) => html`<option value="${x.id}" ${x.id === M.T.id ? raw('selected') : ''}>${x.name}</option>`)}</select>
        <button class="btn sm ghost" data-act="rs-type-new">${icon('plus', 'sm')}<span>Yeni liste türü</span></button>
        ${rsTypes().length > 1 ? html`<button class="btn sm ghost danger" data-act="rs-type-del">${icon('trash', 'sm')}<span>Bu türü sil</span></button>` : ''}</div>
      <div class="row wrap" style="gap:8px">
      <button class="btn sm" data-act="rs-tpl">${icon('sliders', 'sm')}<span>Şablon</span></button>
      <button class="btn sm primary" data-act="rs-print">${icon('file', 'sm')}<span>Yazdır / PDF</span></button>
      <button class="btn sm" data-act="rs-docx">${icon('file', 'sm')}<span>Word</span></button>
      <button class="btn sm" data-act="rs-xlsx">${icon('table', 'sm')}<span>Excel</span></button>
    </div></div>
    ${rsCwHtml(M)}
    ${!RS2.logo && !(M.T.doc || []).some((x) => x.v) ? html`<div class="mk-box">${icon('info', 'sm')}<span>Şablon henüz ayarlanmadı: <b>Şablon</b>’dan kurum logosunu, başlık satırlarını, doküman numarası ve tarihini, imza alanlarını girin. Bir kez yapılır.</span></div>` : ''}
    <div class="rs-paper-wrap"><div class="rs-paper" id="rsPaper">${raw(rsDocHtml(M))}</div></div>
    <div class="card card-pad stack" id="rsSigned">
      <div class="row wrap" style="gap:8px;align-items:center"><b class="grow">${icon('checkCircle', 'sm')} Islak imzalı belge</b>
        <label class="btn sm">${icon('upload', 'sm')}<span>${sg ? 'Değiştir' : 'Taranmış hâlini ekle'}</span><input type="file" hidden accept="application/pdf,image/jpeg,image/png" data-change="rs-signed"></label>
        ${sg ? html`<button class="btn sm ghost danger" data-act="rs-signed-x">Kaldır</button>` : ''}</div>
      <div class="small muted">${sg ? html`<a href="${sg.url}" target="_blank" rel="noopener">${sg.name}</a> · ${fmtRel(sg.at)}${sg.by ? ' · ' + sg.by : ''} — ekip listeyi açınca görür.` : 'İmzalandıktan sonra PDF ya da fotoğrafını ekleyin; ekip nöbet listesi sayfasında “İmzalı resmi liste” olarak görür.'}</div>
    </div></div>`);
  const cwd = $('#rsCw', box);
  if (cwd) cwd.addEventListener('toggle', () => { RS2.cwOpen = cwd.open; });
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
  const T = JSON.parse(JSON.stringify(rsType()));
  let logo = RS2.logo;
  const used = [...new Set(Object.values(PL2.d.cells || {}).flatMap((r) => Object.values(r)))].filter(Boolean);
  const codes = PL2.codes.filter((c) => used.includes(c.code) || c.kind !== 'shift');
  const EF = [['deduct', 'Gerekenden düşer'], ['work', 'Çalışılmış sayılır'], ['none', 'Etkisiz']];
  const CD = RS2.cols || RS_COLS_DEF;
  const sumKeys = [...(T.sum || []).filter((k) => CD[k]), ...Object.keys(CD).filter((k) => !(T.sum || []).includes(k))];
  const docRow = (x) => html`<div class="row rs-tr" style="gap:6px"><input class="input" data-k="l" value="${x.l}" placeholder="Etiket (ör. Doküman No)" style="max-width:170px"><input class="input grow" data-k="v" value="${x.v}" placeholder="Değer (ör. KY.LS.20)"><button type="button" class="btn ghost icon sm" data-x aria-label="Satırı kaldır">${icon('x', 'sm')}</button></div>`;
  const sigRow = (x) => html`<div class="row rs-tr" style="gap:6px"><input class="input" data-k="t" value="${x.t}" placeholder="Görev (ör. Birim Sorumlusu)"><input class="input grow" data-k="n" value="${x.n}" placeholder="Ad soyad (boş bırakılabilir)"><button type="button" class="btn ghost icon sm" data-x aria-label="İmzayı kaldır">${icon('x', 'sm')}</button></div>`;
  const sumRow = (k) => html`<div class="row rs-tr rs-sum" data-sum="${k}" style="gap:6px;align-items:center"><input type="checkbox" data-k="on" ${(T.sum || []).includes(k) ? raw('checked') : ''} aria-label="Listede göster">
    <input class="input grow" data-k="lab" value="${(T.labels || {})[k] || ''}" placeholder="${CD[k]}" aria-label="Başlık">
    <label class="tiny" title="Sütunu yeşil vurgula"><input type="checkbox" data-k="hl" ${(T.hl || []).includes(k) ? raw('checked') : ''}> vurgu</label>
    <button type="button" class="btn ghost icon sm" data-mv="-1" aria-label="Yukarı">${icon('chevL', 'sm')}</button><button type="button" class="btn ghost icon sm" data-mv="1" aria-label="Aşağı">${icon('chevR', 'sm')}</button></div>`;
  const m = openModal({ title: `Şablon · ${T.name}`, size: 'wide', body: html`<form class="stack" id="rsTplF">
      <div class="field"><label>Liste türünün adı</label><input class="input" id="rsTName" value="${T.name}" maxlength="60" placeholder="ör. Çalışma listesi, Fazla mesai listesi"></div>
      <div class="field"><label>Başlık satırları</label><div class="stack" style="gap:6px">${[0, 1, 2, 3].map((i) => html`<input class="input" data-line="${i}" value="${(T.lines || [])[i] || ''}" placeholder="${['T.C. Sağlık Bakanlığı', '{HASTANE}', '{BİRİM} {YIL} {AY} ÇALIŞMA LİSTESİ', '(isteğe bağlı)'][i]}">`)}</div>
        <span class="hint">Değişkenler: {HASTANE} ${RS2.names.org ? `(${RS2.names.org})` : ''}, {BİRİM} ${RS2.names.unit ? `(${RS2.names.unit})` : ''}, {LİSTE}, {YIL}, {AY}. Son satır büyük yazılır.</span></div>
      <div class="field"><label>Doküman kutusu (sağ üst)</label><div class="stack" id="rsDoc" style="gap:6px">${(T.doc || []).map(docRow)}</div>
        <div class="row wrap" style="gap:8px;margin-top:6px"><button type="button" class="btn sm" id="rsDocAdd">${icon('plus', 'sm')}<span>Satır ekle</span></button><label class="small"><input type="checkbox" id="rsDocL" ${T.doc_labels ? raw('checked') : ''}> Etiketleri de yaz</label></div></div>
      <div class="field"><label>Sütunlar</label><div class="row wrap" style="gap:12px">${[['sira', 'Sıra No'], ['unvan', 'Unvan'], ['days', 'Gün sütunları (1–31)']].map(([k, l]) => html`<label class="small"><input type="checkbox" data-col="${k}" ${(T.cols || {})[k] !== false && ((T.cols || {})[k] || k === 'days') ? raw('checked') : ''}> ${l}</label>`)}
        <label class="small"><input type="checkbox" id="rsShade" ${T.shade !== false ? raw('checked') : ''}> Hafta sonu ve tatil sütunlarını gölgele</label></div>
        <span class="hint">Gün sütunları kapatılırsa yalnız hesap sütunlu özet liste çıkar (ör. fazla mesai listesi).</span></div>
      <div class="field"><label>Hesap sütunları (işaretlileri, bu sırayla)</label><div class="stack" id="rsSum" style="gap:6px">${sumKeys.map(sumRow)}</div>
        <span class="hint">Gündüz / gece: vardiyanın gece aralığına (aşağıda) düşen saatleri gece sayılır. %10 zamlı: fazla çalışmanın gece saatlerine düşen kısmı (gece saati ile fazla çalışmadan küçük olanı). Toplam izin: hafta içine denk gelen izin / rapor günleri × günlük saat.</span></div>
      <div class="field"><label>İmza alanları</label><div class="stack" id="rsSig" style="gap:6px">${(T.sig || []).map(sigRow)}</div>
        <div><button type="button" class="btn sm" id="rsSigAdd" style="margin-top:6px">${icon('plus', 'sm')}<span>İmza ekle</span></button></div></div>
      <h3 style="font-size:14px;margin:6px 0 0;border-top:1px solid var(--border);padding-top:12px">Tüm liste türleri için</h3>
      <div class="row wrap" style="gap:12px;align-items:center"><div class="rs-logo-prev" id="rsLogoPrev">${logo ? html`<img src="${logo}" alt="Logo">` : html`<span class="tiny faint">Logo yok</span>`}</div>
        <label class="btn sm">${icon('upload', 'sm')}<span>Kurum logosu yükle</span><input type="file" hidden accept="image/png,image/jpeg" id="rsLogoIn"></label>
        <button type="button" class="btn sm ghost" id="rsLogoX">Logoyu kaldır</button></div>
      <div class="grid2"><div class="field"><label>Günlük çalışma saati</label><input class="input" type="number" min="1" max="12" step="0.5" id="rsDayH" value="${t.day_hours}"></div>
        <div class="field"><label>Yarım gün tatilde (arife) gereken saat</label><input class="input" type="number" min="0" max="12" step="0.5" id="rsHalfH" value="${t.half_hours}"></div></div>
      <div class="grid2"><div class="field"><label>Gece aralığı başlangıcı</label><input class="input" type="time" id="rsNf" value="${t.night_from || '20:00'}"></div>
        <div class="field"><label>Gece aralığı bitişi</label><input class="input" type="time" id="rsNt" value="${t.night_to || '08:00'}"></div></div>
      <div class="field"><label>Kodların çıktıdaki yazımı ve saat etkisi</label>
        <div class="rs-codes">${codes.map((c) => { const x = (t.codes || {})[c.code] || {}; return html`<div class="row rs-tr" data-code="${c.code}" style="gap:6px;align-items:center"><span class="code-chip tone-${planTone(c.code)}"><b>${c.code}</b></span><span class="small grow ellipsis">${c.label}${c.kind === 'shift' ? ` · ${c.hours || 0} saat` : ''}</span>
          <input class="input" data-k="p" value="${x.p || ''}" placeholder="${rsPrint(c.code, { codes: {} })}" style="max-width:110px" aria-label="Çıktıda yazım">
          ${c.kind === 'shift' ? html`<span class="tiny faint" style="width:150px">Çalışılan saate eklenir</span>` : html`<select class="select" data-k="c" style="width:150px">${EF.map(([k, l]) => html`<option value="${k}" ${(x.c || 'deduct') === k ? raw('selected') : ''}>${l}</option>`)}</select>`}</div>`; })}</div>
        <span class="hint">Boş bırakılan yazımda vardiya saat aralığıyla (08-16, 08-08), izin kısaltmasıyla (Y.İZİN, D.İZNİ, RAPOR) yazılır. “Gerekenden düşer”: hafta içine denk gelen her gün için günlük saat gereken saatten düşülür.</span></div>
      ${RS2.canShare ? html`<div class="field"><label>Hastanedeki diğer birimler</label>
        <label class="small"><input type="checkbox" id="rsShare"> Kaydederken bu şablonu (tüm liste türleriyle) hastanemdeki birimlerle paylaş</label>
        ${RS2.shared.length ? html`<div class="row wrap" style="gap:6px;margin-top:6px"><select class="select" id="rsCopyK" style="width:auto">${RS2.shared.map((x) => html`<option value="${x.key}">${x.unit}</option>`)}</select><button type="button" class="btn sm" id="rsCopy">Bu birimin şablonunu kopyala</button></div>` : html`<span class="hint">Henüz şablon paylaşan birim yok.</span>`}</div>` : ''}
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="rsTplF">Kaydet</button>` });
  const f = $('#rsTplF', m.el);
  const del = (e) => { const x = e.target.closest('[data-x]'); if (x) x.closest('.rs-tr').remove(); };
  $('#rsDoc', m.el).addEventListener('click', del); $('#rsSig', m.el).addEventListener('click', del);
  $('#rsSum', m.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-mv]'); if (!b) return;
    const row = b.closest('.rs-sum');
    if (b.dataset.mv === '-1' && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
    else if (b.dataset.mv === '1' && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
  });
  $('#rsDocAdd', m.el).addEventListener('click', () => $('#rsDoc', m.el).insertAdjacentHTML('beforeend', String(docRow({ l: '', v: '' }))));
  $('#rsSigAdd', m.el).addEventListener('click', () => $('#rsSig', m.el).insertAdjacentHTML('beforeend', String(sigRow({ t: '', n: '' }))));
  $('#rsLogoIn', m.el).addEventListener('change', async (e) => { const fl = e.target.files[0]; if (!fl) return; try { logo = await rsLogoFrom(fl); setHTML($('#rsLogoPrev', m.el), html`<img src="${logo}" alt="Logo">`); } catch (er) { toast(er.message, 'err'); } });
  $('#rsLogoX', m.el).addEventListener('click', () => { logo = ''; setHTML($('#rsLogoPrev', m.el), html`<span class="tiny faint">Logo yok</span>`); });
  const cp = $('#rsCopy', m.el);
  if (cp) cp.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Şablon kopyalansın mı?', text: 'Bu birimin şablonu (tüm liste türleri) ve logosu seçilen birimin şablonuyla değişir.', ok: 'Kopyala' }))) return;
    try { await api('plan.tpl.copy', { key: $('#rsCopyK', m.el).value }); await rsLoadTpl(true); m.close(); toast('Şablon kopyalandı'); rsAfterTpl(); } catch (e) { toast(e.message, 'err'); }
  });
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async () => {
      const sumRows = $$('#rsSum .rs-sum', f);
      const type = Object.assign({}, T, {
        name: $('#rsTName', f).value.trim() || T.name,
        lines: $$('[data-line]', f).map((i) => i.value.trim()).filter(Boolean),
        doc: $$('#rsDoc .rs-tr', f).map((r) => ({ l: $('[data-k=l]', r).value, v: $('[data-k=v]', r).value })),
        doc_labels: $('#rsDocL', f).checked,
        cols: Object.fromEntries($$('[data-col]', f).map((i) => [i.dataset.col, i.checked])),
        shade: $('#rsShade', f).checked,
        sum: sumRows.filter((r) => $('[data-k=on]', r).checked).map((r) => r.dataset.sum),
        labels: Object.fromEntries(sumRows.map((r) => [r.dataset.sum, $('[data-k=lab]', r).value.trim()]).filter((x) => x[1])),
        hl: sumRows.filter((r) => $('[data-k=hl]', r).checked).map((r) => r.dataset.sum),
        sig: $$('#rsSig .rs-tr', f).map((r) => ({ t: $('[data-k=t]', r).value, n: $('[data-k=n]', r).value })),
      });
      const tpl = Object.assign({}, t, {
        day_hours: +$('#rsDayH', f).value || 8, half_hours: +$('#rsHalfH', f).value || 0,
        night_from: $('#rsNf', f).value || '20:00', night_to: $('#rsNt', f).value || '08:00',
        codes: Object.assign({}, t.codes || {}, Object.fromEntries($$('[data-code]', f).map((r) => [r.dataset.code, { p: $('[data-k=p]', r).value.trim(), c: ($('[data-k=c]', r) || {}).value || '' }]))),
        types: (t.types || []).map((x) => (x.id === T.id ? type : x)),
      });
      const r = await api('plan.tpl.save', { tpl, logo, share: !!($('#rsShare', f) || {}).checked });
      RS2.tpl = r.tpl; RS2.logo = r.logo || ''; RS2.shared = r.shared || [];
      m.close(); toast('Şablon kaydedildi'); rsAfterTpl();
    });
  });
};
CHANGE['rs-type'] = (el) => { RS2.typeId = el.value; try { localStorage.setItem('nm-rs-type', el.value); } catch (e) { /* */ } rsDocDraw(); };
ACT['rs-type-new'] = async () => {
  const name = await promptDialog({ title: 'Yeni liste türü', label: 'Adı (ör. Fazla mesai listesi)', ok: 'Oluştur' });
  if (!name) return;
  try {
    await rsLoadTpl(true);
    const base = JSON.parse(JSON.stringify(rsType()));
    const id = 't' + Date.now().toString(36).slice(-6);
    const type = Object.assign(base, { id, name: name.slice(0, 60), lines: (base.lines || []).map((l) => l.replace(/ÇALIŞMA LİSTESİ/i, name.toLocaleUpperCase('tr'))), sum: ['izin', 'req', 'day', 'night', 'night10', 'over'], hl: ['over'], labels: {} });
    const r = await api('plan.tpl.save', { tpl: Object.assign({}, RS2.tpl, { types: [...(RS2.tpl.types || []), type] }) });
    RS2.tpl = r.tpl; RS2.typeId = id; try { localStorage.setItem('nm-rs-type', id); } catch (e) { /* */ }
    rsDocDraw(); toast('Liste türü oluşturuldu; Şablon’dan sütunlarını ve doküman bilgilerini düzenleyin');
  } catch (e) { toast(e.message, 'err'); }
};
ACT['rs-type-del'] = async () => {
  const T = rsType();
  if (!T || rsTypes().length < 2) return;
  if (!(await confirmDialog({ title: `“${T.name}” silinsin mi?`, text: 'Bu liste türünün başlık, doküman ve sütun ayarları silinir. Çizelge ve diğer türler değişmez.', ok: 'Sil', danger: true }))) return;
  try {
    const r = await api('plan.tpl.save', { tpl: Object.assign({}, RS2.tpl, { types: rsTypes().filter((x) => x.id !== T.id) }) });
    RS2.tpl = r.tpl; RS2.typeId = ''; rsDocDraw(); toast('Liste türü silindi');
  } catch (e) { toast(e.message, 'err'); }
};
/* ---------------- Sütun genişlikleri (liste türüne kaydedilir; PDF, Word ve Excel aynı) ---------------- */
const RS_CW = [['no', 'Sıra No', 4, 15], ['name', 'Adı soyadı', 15, 90], ['unvan', 'Unvan', 8, 60], ['h', 'Hesap sütunları', 5, 40]];
function rsCwHtml(M) {
  const W = rsWidths(M), cur = { no: W.noW, name: W.nameW, unvan: W.titleW, h: W.hW };
  const show = { no: M.cols.sira, name: !W.auto.name, unvan: M.cols.unvan, h: M.sum.length > 0 };
  const set = (M.T.widths || {});
  return html`<details class="card card-pad rs-cw" id="rsCw" ${RS2.cwOpen ? raw('open') : ''}>
    <summary class="row" style="gap:6px;align-items:center;cursor:pointer">${icon('sliders', 'sm')}<b class="grow">Sütun genişlikleri</b><span class="tiny faint" id="rsCwMode">${Object.keys(set).some((k) => +set[k] > 0) ? 'elle ayarlı' : 'otomatik'}</span></summary>
    <p class="tiny faint" style="margin:6px 0 8px">Milimetre (A4 yatay tablo 279 mm). Daralttığınız sütunun yeri gün sütunlarına kalır; PDF, Word ve Excel aynı genişlikle çıkar.</p>
    <div class="rs-cw-grid">${RS_CW.filter(([k]) => show[k]).map(([k, l, lo, hi]) => html`<label class="small" for="rsCw-${k}">${l}</label>
      <div class="row" style="gap:4px;align-items:center"><button type="button" class="btn sm icon" data-act="rs-cw" data-k="${k}" data-d="-1" aria-label="${l}: daralt">−</button>
      <input class="input" id="rsCw-${k}" type="number" inputmode="decimal" min="${lo}" max="${hi}" step="0.5" value="${Math.round(cur[k] * 10) / 10}" data-change="rs-cw-in" data-k="${k}" style="width:76px;text-align:center">
      <button type="button" class="btn sm icon" data-act="rs-cw" data-k="${k}" data-d="1" aria-label="${l}: genişlet">+</button></div>`)}
      ${M.days.length ? html`<span class="small muted">Gün sütunu</span><span class="small" id="rsCwDay"><b>${(Math.round(W.dayW * 10) / 10).toString().replace('.', ',')} mm</b> <span class="tiny faint">(kalan genişlik)</span></span>` : ''}</div>
    <div class="row wrap" style="gap:8px;margin-top:8px"><button type="button" class="btn sm" data-act="rs-cw-auto">${icon('star', 'sm')}<span>Yazıya göre sığdır</span></button>
      <button type="button" class="btn sm ghost" data-act="rs-cw-def">Varsayılan</button></div>
  </details>`;
}
/** Genişlik değişince önizleme anında yenilenir, şablon kısa süre sonra kaydedilir */
function rsCwApply(widths) {
  const T = rsType(); if (!T) return;
  T.widths = widths;
  RS2.cwOpen = true;
  const M = rsModel();
  const p = $('#rsPaper');
  if (p) { p.innerHTML = rsDocHtml(M); if (RS2.onResize) RS2.onResize(); }
  const cw = $('#rsCw');
  const md = $('#rsCwMode'); if (md) md.textContent = Object.keys(widths || {}).some((k) => +widths[k] > 0) ? 'elle ayarlı' : 'otomatik';
  if (cw) { const W = rsWidths(M), cur = { no: W.noW, name: W.nameW, unvan: W.titleW, h: W.hW }; Object.keys(cur).forEach((k) => { const i = $(`#rsCw-${k}`); if (i && document.activeElement !== i) i.value = Math.round(cur[k] * 10) / 10; }); const d = $('#rsCwDay'); if (d) d.firstElementChild.textContent = `${(Math.round(W.dayW * 10) / 10).toString().replace('.', ',')} mm`; }
  RS2.cwSave = RS2.cwSave || debounce(async () => { try { const r = await api('plan.tpl.save', { tpl: RS2.tpl }); RS2.tpl = r.tpl; toast('Sütun genişlikleri kaydedildi'); } catch (e) { toast(e.message, 'err'); } }, 700);
  RS2.cwSave();
}
const rsCwCur = () => { const W = rsWidths(rsModel()); return { no: W.noW, name: W.nameW, unvan: W.titleW, h: W.hW }; };
ACT['rs-cw'] = (el) => {
  const k = el.dataset.k, d = +el.dataset.d, def = RS_CW.find((x) => x[0] === k);
  const T = rsType(); const w = Object.assign({}, (T && T.widths) || {});
  w[k] = Math.max(def[2], Math.min(def[3], Math.round((rsCwCur()[k] + d) * 2) / 2));
  rsCwApply(w);
};
CHANGE['rs-cw-in'] = (el) => {
  const k = el.dataset.k, def = RS_CW.find((x) => x[0] === k), v = parseFloat(String(el.value).replace(',', '.'));
  if (!Number.isFinite(v)) return;
  const T = rsType(); const w = Object.assign({}, (T && T.widths) || {});
  w[k] = Math.max(def[2], Math.min(def[3], Math.round(v * 2) / 2));
  rsCwApply(w);
};
ACT['rs-cw-auto'] = () => { const M = rsModel(); rsCwApply(rsAutoWidths(M)); rsDocDraw(); };
ACT['rs-cw-def'] = () => { rsCwApply({}); rsDocDraw(); };
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
