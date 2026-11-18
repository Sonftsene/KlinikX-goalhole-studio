/* dupcii — kişisel tercihler modülü
 *  · Görünüm: açık/koyu/otomatik, 8 renk paleti, gece siyahı, köşe ve yoğunluk (cihazlar arası eşitlenir)
 *  · Ana sayfa düzeni: kartları gizle / sırala
 *  · Ana sayfada canlı geri sayım (sıradaki nöbet / nöbetin bitişi)
 *  · Kişisel fazla mesai ücreti (yalnız kişinin kendisi görür) — normal, resmî tatil, bayram
 *  · Kişisel hatırlatma saati
 *  · Ayarlar › Nöbet: gereken nöbetçi sayıları, muafiyetler, resmî tatiller
 */
'use strict';

/* =================================================================== */
/* Görünüm tercihleri                                                   */
/* =================================================================== */
const PREF_LS = { theme: 'nm-theme', accent: 'nm-accent', fs: 'nm-fs', shape: 'nm-shape', density: 'nm-density', oled: 'nm-oled' };
const ACCENTS = [
  ['varsayilan', 'dupcii', 'linear-gradient(135deg,#2aa38c,#2f8fc4 55%,#8b6cf0)'],
  ['okyanus', 'Okyanus', 'linear-gradient(135deg,#1d9be0,#1d6fd1 50%,#3d5bdb)'],
  ['lavanta', 'Lavanta', 'linear-gradient(135deg,#8b6cf0,#a35fe0 55%,#c965c8)'],
  ['gul', 'Gül', 'linear-gradient(135deg,#e0577f,#ea6f6d 55%,#f08a5d)'],
  ['gunes', 'Gün batımı', 'linear-gradient(135deg,#f0a12b,#ec7b33 55%,#e2593e)'],
  ['orman', 'Orman', 'linear-gradient(135deg,#2f9a59,#4aa64a 55%,#8bb543)'],
  ['gece', 'Gece mavisi', 'linear-gradient(135deg,#3949ab,#5a4bd1 55%,#7c4dff)'],
  ['grafit', 'Grafit', 'linear-gradient(135deg,#586f7e,#3f5563 55%,#29353d)'],
];
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* */ } }

/** Şu anki görünüm tercihleri (cihazdaki değerler) */
function uiNow() {
  const t = lsGet('nm-theme');
  return {
    theme: t === 'dark' || t === 'light' ? t : 'auto',
    accent: lsGet('nm-accent') || 'varsayilan',
    fs: lsGet('nm-fs') === 'lg' ? 'lg' : '',
    shape: lsGet('nm-shape') === 'sharp' ? 'sharp' : 'round',
    density: lsGet('nm-density') === 'compact' ? 'compact' : 'cozy',
    oled: lsGet('nm-oled') === '1',
  };
}
/** Tercihleri sayfaya uygula ve cihazda sakla */
function applyUi(p) {
  const d = document.documentElement;
  if ('theme' in p) {
    if (p.theme === 'auto') {
      lsSet('nm-theme', null);
      d.setAttribute('data-theme', window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } else if (p.theme === 'dark' || p.theme === 'light') {
      d.setAttribute('data-theme', p.theme);
      lsSet('nm-theme', p.theme);
    }
    const b = $('#themeBtn'); if (b) setHTML(b, icon(isDark() ? 'sun' : 'moon'));
  }
  if ('accent' in p) {
    if (!p.accent || p.accent === 'varsayilan') { d.removeAttribute('data-accent'); lsSet('nm-accent', null); } else { d.setAttribute('data-accent', p.accent); lsSet('nm-accent', p.accent); }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(d).getPropertyValue('--brand').trim() || '#1f8f80');
  }
  if ('fs' in p) { d.classList.toggle('fs-lg', p.fs === 'lg'); lsSet('nm-fs', p.fs === 'lg' ? 'lg' : null); }
  if ('shape' in p) { if (p.shape === 'sharp') d.setAttribute('data-shape', 'sharp'); else d.removeAttribute('data-shape'); lsSet('nm-shape', p.shape === 'sharp' ? 'sharp' : null); }
  if ('density' in p) { if (p.density === 'compact') d.setAttribute('data-density', 'compact'); else d.removeAttribute('data-density'); lsSet('nm-density', p.density === 'compact' ? 'compact' : null); }
  if ('oled' in p) { if (p.oled) d.setAttribute('data-oled', '1'); else d.removeAttribute('data-oled'); lsSet('nm-oled', p.oled ? '1' : null); }
}

let _uiPending = {}, _uiTimer = 0;
/** Değişikliği uygula + hesabına kaydet (diğer cihazlarında da aynı görünsün) */
function prefsRemember(patch) {
  applyUi(patch);
  if (!S.me) return;
  S.my_prefs = S.my_prefs || { ui: {}, pay: {}, remind: null };
  S.my_prefs.ui = Object.assign({}, S.my_prefs.ui, patch);
  Object.assign(_uiPending, patch);
  clearTimeout(_uiTimer);
  _uiTimer = setTimeout(() => {
    const value = _uiPending; _uiPending = {};
    api('me.prefs.save', { kind: 'ui', value }).catch(() => { /* çevrimdışı: cihazda kalır */ });
  }, 600);
}

/** Açılışta: hesaptaki görünüm tercihleri bu cihaza uygulanır; hesapta yoksa cihazdakiler hesaba kaydedilir */
function prefsOnBoot() {
  if (!S.me || !S.my_prefs) return;
  const ui = S.my_prefs.ui || {};
  const keys = Object.keys(ui).filter((k) => k in PREF_LS);
  if (keys.length) {
    const p = {}; keys.forEach((k) => { p[k] = ui[k]; });
    applyUi(p);
  } else {
    const now = uiNow();
    const def = { theme: 'auto', accent: 'varsayilan', fs: '', shape: 'round', density: 'cozy', oled: false };
    const diff = {}; Object.keys(now).forEach((k) => { if (now[k] !== def[k]) diff[k] = now[k]; });
    if (Object.keys(diff).length) { S.my_prefs.ui = diff; api('me.prefs.save', { kind: 'ui', value: diff }).catch(() => {}); }
  }
}

function prefsAppearanceHtml() {
  const u = uiNow();
  const seg = (key, items) => html`<div class="seg seg-block">${items.map(([v, l, ic]) => html`<button type="button" class="${u[key] === v ? 'on' : ''}" data-act="pf-set" data-k="${key}" data-v="${v}">${ic ? icon(ic, 'sm') : ''}${l}</button>`)}</div>`;
  return html`<div class="card card-pad stack">
      <div><h3 class="ph">${icon('palette', 'sm')} Tema</h3><p class="tiny faint">Seçimleriniz hesabınıza kaydedilir; telefonda ve bilgisayarda aynı görünür.</p></div>
      <div class="pf-preview" aria-hidden="true"><span class="pv-dot"></span><div class="grow" style="min-width:140px"><b>${greeting()}, ${S.me.name.split(' ')[0]}</b><div class="tiny muted">Önizleme</div></div><span class="btn primary sm">Ana buton</span><span class="btn sm">Düğme</span><span class="badge brand">Etiket</span></div>
      <div><div class="tiny faint" style="margin-bottom:6px">Mod</div>${seg('theme', [['light', 'Açık', 'sun'], ['dark', 'Koyu', 'moon'], ['auto', 'Otomatik', 'sliders']])}
        <p class="tiny faint" style="margin-top:6px">Otomatik: telefonunuz gece moduna geçince uygulama da koyu olur.</p></div>
      <div><div class="tiny faint" style="margin-bottom:6px">Renk paleti</div>
        <div class="pf-swatches">${ACCENTS.map(([k, l, g]) => html`<button type="button" class="pf-sw ${u.accent === k ? 'on' : ''}" data-act="pf-set" data-k="accent" data-v="${k}" aria-pressed="${u.accent === k ? 'true' : 'false'}"><i style="background:${g}"></i>${l}</button>`)}</div></div>
      <label class="row" style="gap:10px;cursor:pointer"><span class="switch"><input type="checkbox" data-change="pf-oled" ${u.oled ? raw('checked') : ''}><span class="track"></span></span>
        <span class="grow"><b class="small">Gece siyahı</b><span class="tiny faint" style="display:block">Koyu modda tam siyah zemin (OLED ekranlarda pil tasarrufu, gece nöbetinde gözü yormaz)</span></span></label>
    </div>
    <div class="card card-pad stack">
      <h3 class="ph">${icon('sliders', 'sm')} Düzen ve yazı</h3>
      <div><div class="tiny faint" style="margin-bottom:6px">Yazı boyutu</div>${seg('fs', [['', 'Normal'], ['lg', 'Büyük']])}</div>
      <div><div class="tiny faint" style="margin-bottom:6px">Köşeler</div>${seg('shape', [['round', 'Yuvarlak'], ['sharp', 'Keskin']])}</div>
      <div><div class="tiny faint" style="margin-bottom:6px">Yoğunluk</div>${seg('density', [['cozy', 'Ferah'], ['compact', 'Sıkı (daha çok bilgi)']])}</div>
      <div class="row wrap" style="gap:8px"><button type="button" class="btn ghost sm" data-act="pf-reset">${icon('history', 'sm')}Varsayılana dön</button><button type="button" class="btn ghost sm" data-act="tour">${icon('info', 'sm')}Kısa tanıtımı tekrar göster</button></div>
    </div>
    <div class="card card-pad stack" id="homeLayoutCard">${homeLayoutHtml()}</div>`;
}
function prefsAppearanceMount() { /* kartlar statik; olaylar ACT ile */ }

ACT['pf-set'] = (el) => {
  const k = el.dataset.k, v = el.dataset.v;
  prefsRemember({ [k]: v });
  $$(`[data-act=pf-set][data-k="${k}"]`).forEach((b) => { b.classList.toggle('on', b === el); if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', b === el ? 'true' : 'false'); });
};
CHANGE['pf-oled'] = (el) => {
  prefsRemember({ oled: el.checked });
  if (el.checked && !isDark()) { prefsRemember({ theme: 'dark' }); $$('[data-act=pf-set][data-k=theme]').forEach((b) => b.classList.toggle('on', b.dataset.v === 'dark')); }
};
ACT['pf-reset'] = () => {
  prefsRemember({ theme: 'auto', accent: 'varsayilan', fs: '', shape: 'round', density: 'cozy', oled: false });
  const body = $('#profBody'); if (body) setHTML(body, prefsAppearanceHtml());
  toast('Görünüm varsayılana döndü');
};
// Eski görünüm kartının düğmeleri de hesaba kaydetsin
ACT.fs = (el) => { prefsRemember({ fs: el.dataset.v === 'lg' ? 'lg' : '' }); $$('[data-act=fs]').forEach((b) => b.classList.toggle('on', b === el)); };
ACT['theme-set'] = (el) => { prefsRemember({ theme: el.dataset.v }); $$('[data-act=theme-set]').forEach((b) => b.classList.toggle('on', b === el)); };
ACT.theme = () => prefsRemember({ theme: isDark() ? 'light' : 'dark' });

/* =================================================================== */
/* Ana sayfa düzeni                                                     */
/* =================================================================== */
const HOME_BUILTIN = [
  { id: 'hero', title: 'Karşılama ve sıradaki nöbetim', place: 'hero', fixed: true },
  { id: 'countdown', title: 'Canlı geri sayım', place: 'hero' },
  { id: 'chips', title: 'Kısayol düğmeleri', place: 'hero' },
  { id: 'feed', title: 'Duyuru ve belge akışı', place: 'main' },
  { id: 'today', title: 'Bugün nöbette', place: 'side' },
  { id: 'rosters', title: 'Nöbet listeleri', place: 'side' },
  { id: 'tips', title: 'İpuçları', place: 'side' },
];
function homePrefs() {
  const h = (S.my_prefs && S.my_prefs.ui && S.my_prefs.ui.home) || {};
  return { hidden: Array.isArray(h.hidden) ? h.hidden : [], order: Array.isArray(h.order) ? h.order : [], side_first: !!h.side_first };
}
function homeItems() {
  const ext = NM_EXT.homeCards.filter((c) => !c.visible || c.visible()).map((c) => ({ id: c.id, title: c.title || c.id, place: c.place === 'top' ? 'top' : 'side', ext: true, order: c.order || 50 }));
  const all = [...HOME_BUILTIN, ...ext];
  const ord = homePrefs().order;
  const rank = (x, i) => { const k = ord.indexOf(x.id); return k < 0 ? 1000 + (x.ext ? x.order : i) : k; };
  return all.map((x, i) => Object.assign({ _r: rank(x, i) }, x)).sort((a, b) => a._r - b._r);
}
function homeLayoutHtml() {
  const P = homePrefs();
  const items = homeItems();
  const groups = [['hero', 'Üst karşılama alanı'], ['top', 'Üst kartlar'], ['main', 'Orta alan'], ['side', 'Yan kartlar (telefonda altta)']];
  const row = (x, list, i) => {
    const off = P.hidden.includes(x.id);
    return html`<div class="hl-item ${off ? 'off' : ''}">
      <span class="hl-t">${x.title}${x.fixed ? html`<span class="hl-s">Her zaman görünür</span>` : ''}</span>
      ${list.length > 1 && (x.place === 'top' || x.place === 'side') ? html`<button type="button" class="btn ghost icon sm" data-act="hl-move" data-id="${x.id}" data-d="-1" ${i === 0 ? raw('disabled') : ''} aria-label="Yukarı taşı">${icon('up', 'sm')}</button>
        <button type="button" class="btn ghost icon sm" data-act="hl-move" data-id="${x.id}" data-d="1" ${i === list.length - 1 ? raw('disabled') : ''} aria-label="Aşağı taşı">${icon('down', 'sm')}</button>` : ''}
      ${x.fixed ? '' : html`<button type="button" class="btn ghost icon sm" data-act="hl-toggle" data-id="${x.id}" aria-label="${off ? 'Göster' : 'Gizle'}">${icon(off ? 'eyeOff' : 'eye', 'sm')}</button>`}
    </div>`;
  };
  return html`<div><h3 class="ph">${icon('grid', 'sm')} Ana sayfam</h3><p class="tiny faint">Ana sayfada görmek istediğiniz kartları seçin ve sıralayın. Yalnız sizin ana sayfanızı etkiler.</p></div>
    ${groups.map(([g, label]) => { const list = items.filter((x) => x.place === g); return list.length ? html`<div class="hl-group">${label}</div><div class="hl-list">${list.map((x, i) => row(x, list, i))}</div>` : ''; })}
    <label class="row" style="gap:10px;cursor:pointer;margin-top:4px"><span class="switch"><input type="checkbox" data-change="hl-sidefirst" ${P.side_first ? raw('checked') : ''}><span class="track"></span></span>
      <span class="grow small">Telefonda kartları duyurulardan önce göster</span></label>
    <div><button type="button" class="btn ghost sm" data-act="hl-reset">${icon('history', 'sm')}Ana sayfayı varsayılana döndür</button></div>`;
}
function saveHome(h) {
  const cur = homePrefs();
  const home = Object.assign({ hidden: cur.hidden, order: cur.order, side_first: cur.side_first }, h);
  S.my_prefs = S.my_prefs || { ui: {}, pay: {}, remind: null };
  S.my_prefs.ui = Object.assign({}, S.my_prefs.ui, { home });
  api('me.prefs.save', { kind: 'ui', value: { home } }).catch((e) => toast(e.message, 'err'));
  const c = $('#homeLayoutCard'); if (c) setHTML(c, homeLayoutHtml());
}
ACT['hl-toggle'] = (el) => {
  const id = el.dataset.id, P = homePrefs();
  saveHome({ hidden: P.hidden.includes(id) ? P.hidden.filter((x) => x !== id) : [...P.hidden, id] });
};
ACT['hl-move'] = (el) => {
  const items = homeItems();
  const me = items.find((x) => x.id === el.dataset.id);
  if (!me) return;
  const same = items.filter((x) => x.place === me.place);
  const i = same.indexOf(me), j = i + +el.dataset.d;
  if (j < 0 || j >= same.length) return;
  [same[i], same[j]] = [same[j], same[i]];
  // Tüm grupların sırası birlikte saklanır
  const order = [];
  ['hero', 'top', 'main', 'side'].forEach((g) => (g === me.place ? same : items.filter((x) => x.place === g)).forEach((x) => order.push(x.id)));
  saveHome({ order });
};
CHANGE['hl-sidefirst'] = (el) => saveHome({ side_first: el.checked });
ACT['hl-reset'] = () => saveHome({ hidden: [], order: [], side_first: false });

/** Ana sayfa çizildikten sonra: gizle / sırala (posts.js renderHome çağırır) */
function applyHomeLayout() {
  const P = homePrefs();
  $$('[data-home]').forEach((el) => el.classList.toggle('home-hidden', P.hidden.includes(el.dataset.home)));
  const grid = $('.home-grid'); if (grid) grid.classList.toggle('side-first', P.side_first);
  const rank = {}; homeItems().forEach((x, i) => { rank[x.id] = i + 1; });
  const side = $('#homeSide');
  if (side) {
    const extSide = $('#homeExtSide'); if (extSide) extSide.style.display = 'contents';
    side.querySelectorAll('[data-home], .home-ext').forEach((el) => {
      const id = el.dataset.home || el.dataset.card;
      if (id && rank[id]) el.style.order = String(rank[id]);
    });
  }
  const top = $('#homeExtTop');
  if (top) top.querySelectorAll('.home-ext').forEach((el) => { const id = el.dataset.card; if (rank[id]) el.style.order = String(rank[id]); });
}

/* =================================================================== */
/* Canlı geri sayım                                                     */
/* =================================================================== */
let _cdTimer = 0;
function shiftStartEnd(e) {
  if (!e.start) return null;
  const st = new Date(`${e.date}T${e.start}:00`);
  let en = e.end ? new Date(`${e.date}T${e.end}:00`) : new Date(st.getTime() + (Number(e.hours) || 8) * 3600000);
  if (en <= st) en = new Date(en.getTime() + DAY_MS);
  return [st, en];
}
/** Kişinin o günkü bloğu (blok yerleşimi modülü S.my_blocks verirse) */
function myBlockOn(date) {
  const b = S.my_blocks;
  if (!b) return null;
  let v = Array.isArray(b) ? b.find((x) => x && x.date === date) : b[date];
  if (!v) return null;
  if (typeof v === 'object') v = v.block_name || v.block || v.unit || v.side_name || v.side || null;
  return v ? String(v) : null;
}
function mountCountdown(anchor, my) {
  clearInterval(_cdTimer);
  const old = $('#cdBox'); if (old) old.remove();
  if (homePrefs().hidden.includes('countdown')) return;
  const ent = (my && my.entries) || [];
  const cur = currentShift(ent);
  const nxt = cur ? null : nextShift(ent);
  const e = cur || nxt;
  if (!e) return;
  const se = shiftStartEnd(e);
  if (!se) return;
  const [st, en] = se;
  const target = cur ? en : st;
  if (!cur && target - Date.now() > 14 * DAY_MS) return;
  const box = document.createElement('div');
  box.id = 'cdBox';
  box.className = 'cd-box';
  box.dataset.home = 'countdown';
  anchor.insertAdjacentElement('afterend', box);
  const blk = myBlockOn(e.date);
  const lbl = cur ? 'Nöbetin bitmesine' : 'Nöbetinin başlamasına';
  const draw = () => {
    if (!document.body.contains(box)) { clearInterval(_cdTimer); return; }
    let ms = target - Date.now();
    if (ms <= 0) { clearInterval(_cdTimer); loadHomeExtras(); return; }
    const d = Math.floor(ms / DAY_MS); ms -= d * DAY_MS;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    const units = d ? [[d, 'gün'], [h, 'saat'], [m, 'dk']] : [[h, 'saat'], [m, 'dk'], [s, 'sn']];
    const pct = cur ? Math.min(100, Math.max(0, ((Date.now() - st) / (en - st)) * 100)) : null;
    setHTML(box, html`<div class="cd-units" role="timer" aria-label="${lbl}">${units.map(([v, l]) => html`<div class="cd-u"><b>${pad(v)}</b><span>${l}</span></div>`)}</div>
      <div class="cd-lbl">${lbl}${blk ? html`<br><span class="cd-block">${icon('layers', 'sm')}${blk}</span>` : ''}</div>
      ${pct !== null ? html`<div class="cd-bar" title="Nöbetin %${Math.round(pct)} tamamlandı"><span style="width:${pct.toFixed(1)}%"></span></div>` : ''}`);
  };
  draw();
  _cdTimer = setInterval(() => { if (!document.hidden) draw(); }, 1000);
}

/* =================================================================== */
/* Kişisel fazla mesai ücreti (yalnız kişinin kendisi görür)            */
/* =================================================================== */
const TL = (n) => { try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n); } catch (e) { return Math.round(n) + ' TL'; } };
const H1 = (n) => (Math.round(n * 10) / 10).toLocaleString('tr-TR');
function myPay() { return (S.my_prefs && S.my_prefs.pay) || {}; }
function payReady(p) { return +p.normal > 0 || +p.resmi > 0 || +p.bayram > 0 || (p.extras || []).length > 0; }

/** Tatil günlerine denk gelen nöbet saatleri (arife: 13:00'ten sonrası) */
function holidayHours(entries, hol) {
  const out = { resmi: 0, bayram: 0, days: [] };
  if (!hol) return out;
  entries.filter((e) => e.kind === 'shift').forEach((e) => {
    const se = shiftStartEnd(e);
    if (!se) {
      const h = hol[e.date];
      if (h && !h.half) { out[h.kind === 'bayram' ? 'bayram' : 'resmi'] += Number(e.hours) || 0; out.days.push(e.date); }
      return;
    }
    const [st, en] = se;
    const len = (en - st) / 3600000;
    const scale = len > 0 ? (Number(e.hours) || len) / len : 0;
    for (let t = new Date(st.getFullYear(), st.getMonth(), st.getDate()); t < en; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
      const h = hol[ymd(t)];
      if (!h) continue;
      const w0 = new Date(t.getFullYear(), t.getMonth(), t.getDate(), h.half ? 13 : 0);
      const w1 = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
      const ov = (Math.min(en, w1) - Math.max(st, w0)) / 3600000;
      if (ov > 0) { out[h.kind === 'bayram' ? 'bayram' : 'resmi'] += ov * scale; out.days.push(ymd(t)); }
    }
  });
  return out;
}
/** Aylık tahmin: fazla mesai = çalışılan − zorunlu saat (tatiller zorunlu saatten düşer).
 *  Tatil günlerindeki saatler bayram/resmî tatil ücretiyle, kalanı normal ücretle hesaplanır. */
function payEstimate(entries, sm, p, hol) {
  const ot = Math.max(0, sm ? sm.overtime : 0);
  const hh = holidayHours(entries, hol);
  const holTot = hh.resmi + hh.bayram;
  const f = holTot > ot ? (holTot ? ot / holTot : 0) : 1;
  const bay = hh.bayram * f, res = hh.resmi * f, nor = Math.max(0, ot - bay - res);
  const rN = +p.normal || 0, rR = +p.resmi || rN, rB = +p.bayram || +p.resmi || rN;
  const lines = [
    { k: 'Normal fazla mesai', h: nor, r: rN },
    { k: 'Resmî tatil', h: res, r: rR },
    { k: 'Bayram', h: bay, r: rB },
  ].filter((x) => x.h > 0.05 || x.k === 'Normal fazla mesai');
  (p.extras || []).forEach((x) => lines.push({ k: x.name, h: +x.hours || 0, r: +x.rate || 0, extra: true }));
  const gross = lines.reduce((a, x) => a + x.h * x.r, 0);
  const tax = +p.tax || 0;
  return { ot, lines, gross, net: tax ? gross * (1 - tax / 100) : null, tax, holDays: [...new Set(hh.days)], rawHol: holTot };
}
function payBoxHtml(y, m, monthList, sm) {
  const p = myPay();
  if (!payReady(p)) {
    return html`<div class="card card-pad row wrap" style="gap:12px"><span class="cat-ico tone-emerald">${icon('wallet')}</span>
      <div class="grow" style="min-width:180px"><b class="small">Fazla mesai ücretim ne kadar?</b><div class="tiny faint">Saat ücretinizi bir kez girin; her ay normal, resmî tatil ve bayram mesainiz otomatik hesaplansın. Yalnız siz görürsünüz.</div></div>
      <a class="btn sm" href="#/profil/ucret">${icon('wallet', 'sm')}Ücretimi gir</a></div>`;
  }
  const est = payEstimate(monthList, sm, p, holidayMapOrNull());
  return html`<div class="card card-pad stack">
    <div class="row wrap" style="gap:8px"><h3 class="grow" style="font-size:15px">${icon('wallet', 'sm')} ${TR_MONTHS[m - 1]} fazla mesai tahmini</h3><span class="pay-lock">${icon('lock', 'sm')}Yalnız siz görürsünüz</span><a class="btn ghost sm" href="#/profil/ucret">${icon('edit', 'sm')}Ücretler</a></div>
    <div class="pay-grid">
      ${est.lines.map((x) => html`<div class="pay-stat"><div class="ps-l">${x.k}</div><div class="ps-v">${TL(x.h * x.r)}</div><div class="ps-s">${H1(x.h)} saat × ${TL(x.r)}${x.extra ? ' · sabit kalem' : ''}</div></div>`)}
      <div class="pay-stat total"><div class="ps-l">Toplam (brüt)</div><div class="ps-v">${TL(est.gross)}</div><div class="ps-s">${est.net !== null ? html`Kesinti %${est.tax} sonrası ≈ <b>${TL(est.net)}</b>` : `${H1(est.ot)} saat fazla mesai`}</div></div>
    </div>
    <p class="tiny faint">Tahminidir: zorunlu çalışma saati hafta içi 8 saat üzerinden, izin ve resmî tatiller düşülerek hesaplanır (arife yarım gün). ${est.holDays.length ? `Tatile denk gelen nöbet: ${est.holDays.map((d) => +d.slice(8) + ' ' + TR_MONTHS_S[+d.slice(5, 7) - 1]).join(', ')}.` : ''}</p>
  </div>`;
}
function mountPayBox(y, m, monthList, sm) {
  const wrap = $('.cal-wrap');
  if (!wrap) return;
  let box = $('#payBox');
  if (!box) { box = document.createElement('div'); box.id = 'payBox'; box.style.marginTop = '16px'; wrap.insertAdjacentElement('afterend', box); }
  setHTML(box, payBoxHtml(y, m, monthList, sm));
}

/* Profil › Ücretim */
function payTabHtml() {
  const p = myPay();
  const ex = (p.extras || []).length ? p.extras : [];
  const inp = (name, v, ph) => html`<input class="input" type="number" inputmode="decimal" min="0" step="0.01" name="${name}" value="${v ? v : ''}" placeholder="${ph}">`;
  return html`<form class="card card-pad stack" data-form="pay-save">
      <div class="row wrap" style="gap:8px"><h3 class="ph grow">${icon('wallet', 'sm')} Saat ücretlerim</h3><span class="pay-lock">${icon('lock', 'sm')}Yalnız siz görürsünüz — yönetici dahil kimse göremez</span></div>
      <div class="grid2">
        <div class="field"><label>Normal fazla mesai (TL / saat)</label>${inp('normal', p.normal, 'ör. 120')}</div>
        <div class="field"><label>Resmî tatil (TL / saat)</label>${inp('resmi', p.resmi, 'Boşsa normal ücret')}<p class="hint">23 Nisan, 29 Ekim, yılbaşı gibi günler</p></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Bayram (TL / saat)</label>${inp('bayram', p.bayram, 'Boşsa resmî tatil ücreti')}<p class="hint">Ramazan ve Kurban bayramı günleri</p></div>
        <div class="field"><label>Kesinti oranı (%) — isteğe bağlı</label><input class="input" type="number" min="0" max="60" step="0.1" name="tax" value="${p.tax || ''}" placeholder="ör. 15"><p class="hint">Girerseniz yaklaşık net tutar da gösterilir</p></div>
      </div>
      <div><div class="small" style="font-weight:600;margin-bottom:6px">Ek kalemler <span class="tiny faint">(ör. icap, ek görev — aylık saatiyle)</span></div>
        <div class="stack" id="payExtras" style="gap:6px">${ex.map((x) => payExtraRow(x))}</div>
        <button type="button" class="btn ghost sm" data-act="pay-extra-add" style="margin-top:6px">${icon('plus', 'sm')}Kalem ekle</button></div>
      <div class="form-error hidden" data-err></div>
      <div class="row wrap" style="gap:8px"><button class="btn primary" type="submit">Kaydet</button>${payReady(p) ? html`<button type="button" class="btn ghost" data-act="pay-clear">${icon('trash', 'sm')}Ücretlerimi sil</button>` : ''}</div>
    </form>
    <div id="payPreview"></div>`;
}
function payExtraRow(x) {
  x = x || {};
  return html`<div class="pay-x"><input class="input" name="x_name" maxlength="40" placeholder="Kalem adı" value="${x.name || ''}"><input class="input" type="number" min="0" step="0.01" name="x_rate" placeholder="TL/saat" value="${x.rate || ''}"><input class="input" type="number" min="0" step="0.5" name="x_hours" placeholder="Saat" value="${x.hours || ''}"><button type="button" class="btn ghost icon sm" data-act="pay-extra-del" aria-label="Kaldır">${icon('x', 'sm')}</button></div>`;
}
ACT['pay-extra-add'] = () => { const b = $('#payExtras'); if (b && b.children.length < 8) b.insertAdjacentHTML('beforeend', fmtVal(payExtraRow())); };
ACT['pay-extra-del'] = (el) => { const r = el.closest('.pay-x'); if (r) r.remove(); };
FORMS['pay-save'] = (f) => submitForm(f, async (d) => {
  const extras = [...f.querySelectorAll('.pay-x')].map((r) => ({ name: r.querySelector('[name=x_name]').value.trim(), rate: r.querySelector('[name=x_rate]').value, hours: r.querySelector('[name=x_hours]').value })).filter((x) => x.name && +x.rate > 0);
  const res = await api('me.prefs.save', { kind: 'pay', value: { normal: d.normal, resmi: d.resmi, bayram: d.bayram, tax: d.tax, extras } });
  S.my_prefs = res.prefs;
  toast('Ücretleriniz kaydedildi');
  renderPayPreview();
});
ACT['pay-clear'] = async () => {
  if (!(await confirmDialog({ title: 'Ücretlerim silinsin mi?', text: 'Girdiğiniz saat ücretleri silinir; aylık tahmin gösterilmez.', ok: 'Sil', danger: true }))) return;
  const res = await api('me.prefs.save', { kind: 'pay', value: {} });
  S.my_prefs = res.prefs;
  const b = $('#profBody'); if (b) setHTML(b, payTabHtml());
  toast('Silindi');
};
async function renderPayPreview() {
  const box = $('#payPreview');
  if (!box) return;
  const my = await loadMyShifts(false).catch(() => null);
  if (!document.body.contains(box)) return;
  if (!my || !my.entries || !my.entries.length) { setHTML(box, ''); return; }
  const now = new Date();
  const months = [[now.getFullYear(), now.getMonth() + 1], [now.getMonth() ? now.getFullYear() : now.getFullYear() - 1, now.getMonth() || 12]];
  setHTML(box, html`${months.map(([y, m]) => {
    const list = my.entries.filter((e) => e.date.startsWith(`${y}-${pad(m)}`));
    if (!list.length) return '';
    const sm = summarizeMonth(list, y, m, holidayMapOrNull());
    return payBoxHtml(y, m, list, sm);
  })}`);
}
NM_EXT.profileTabs.push({ key: 'ucret', label: 'Ücretim', icon: 'wallet', html: payTabHtml, mount: renderPayPreview });

/* =================================================================== */
/* Kişisel hatırlatma saati (Profil › Bildirimler)                     */
/* =================================================================== */
function remindCardHtml() {
  const r = (S.my_prefs && S.my_prefs.remind) || null;
  const defH = S.remind_default_hour ?? 18, defOn = S.remind_default_on !== false;
  const custom = !!r;
  const day = (r && r.day) || { on: true, hour: 20 }, pre = (r && r.pre) || { on: false, hours: 2 };
  const hours = (name, v) => html`<select class="select" name="${name}" style="width:auto" aria-label="Saat">${Array.from({ length: 24 }, (_, h) => html`<option value="${h}" ${+v === h ? raw('selected') : ''}>${pad(h)}:00</option>`)}</select>`;
  return html`<form class="card card-pad stack" data-form="remind-save" id="remindCard">
    <div><h3 class="ph">${icon('clock', 'sm')} Nöbet hatırlatmam</h3><p class="tiny faint">Hatırlatma, listede adınız olan nöbetler için telefon bildirimi ve e-posta ile gelir.</p></div>
    <div class="seg seg-block"><button type="button" class="${custom ? '' : 'on'}" data-act="remind-mode" data-v="def">Varsayılan</button><button type="button" class="${custom ? 'on' : ''}" data-act="remind-mode" data-v="own">Kendi saatim</button></div>
    <p class="tiny faint ${custom ? 'hidden' : ''}" data-rm="def">${defOn ? `Nöbetten bir gün önce saat ${pad(defH)}:00’de hatırlatılır (yöneticinin ayarı).` : 'Yönetici genel hatırlatmayı kapattı. Kendi saatinizi seçerek hatırlatma alabilirsiniz.'}</p>
    <div class="stack ${custom ? '' : 'hidden'}" data-rm="own" style="gap:10px">
      <div class="row wrap" style="gap:10px"><label class="row grow" style="gap:10px;cursor:pointer"><span class="switch"><input type="checkbox" name="day_on" ${day.on ? raw('checked') : ''}><span class="track"></span></span><span class="small">Bir gün önce, saat</span></label>${hours('day_hour', day.hour)}</div>
      <div class="row wrap" style="gap:10px"><label class="row grow" style="gap:10px;cursor:pointer"><span class="switch"><input type="checkbox" name="pre_on" ${pre.on ? raw('checked') : ''}><span class="track"></span></span><span class="small">Nöbet başlamadan</span></label>
        <select class="select" name="pre_hours" style="width:auto" aria-label="Kaç saat önce">${[1, 2, 3, 4, 6, 8, 12].map((h) => html`<option value="${h}" ${+pre.hours === h ? raw('selected') : ''}>${h} saat önce</option>`)}</select></div>
      <p class="tiny faint">İkisini de kapatırsanız nöbet hatırlatması almazsınız.</p>
    </div>
    <div class="form-error hidden" data-err></div>
    <div><button class="btn primary" type="submit">Kaydet</button></div>
  </form>`;
}
function remindCardMount() { /* */ }
ACT['remind-mode'] = (el) => {
  const card = el.closest('form');
  $$('[data-act=remind-mode]', card).forEach((b) => b.classList.toggle('on', b === el));
  card.dataset.mode = el.dataset.v;
  card.querySelector('[data-rm=def]').classList.toggle('hidden', el.dataset.v !== 'def');
  card.querySelector('[data-rm=own]').classList.toggle('hidden', el.dataset.v !== 'own');
};
FORMS['remind-save'] = (f) => submitForm(f, async (d) => {
  const own = f.dataset.mode ? f.dataset.mode === 'own' : !!(S.my_prefs && S.my_prefs.remind);
  const value = own ? { day: { on: d.day_on, hour: +d.day_hour }, pre: { on: d.pre_on, hours: +d.pre_hours } } : { reset: true };
  const res = await api('me.prefs.save', { kind: 'remind', value });
  S.my_prefs = res.prefs;
  toast(own ? 'Hatırlatma saatiniz kaydedildi' : 'Varsayılan hatırlatmaya dönüldü');
});

/* =================================================================== */
/* Ayarlar › Nöbet: gereken sayılar, muafiyetler, resmî tatiller        */
/* =================================================================== */
const RL = { data: null };
const SCOPE_LABEL = { all: 'Tümünden', kura: 'Blok kurasından', kaydirma: 'Kaydırmadan', cagri: 'Eksik personel çağrısından' };
NM_EXT.settingsCards.push({
  sec: 'nobet', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="nobet" id="rulesCard"><h3 style="font-size:15px">${icon('users', 'sm')} Gereken nöbetçi sayıları</h3><div class="skel" style="height:14px;width:60%"></div></div>
    <div class="card card-pad stack" data-sec="nobet" id="exclCard"><h3 style="font-size:15px">${icon('eyeOff', 'sm')} Nöbet hesaplarına dahil edilmeyenler</h3><div class="skel" style="height:14px;width:50%"></div></div>
    <div class="card card-pad stack" data-sec="nobet" id="exemptCard"><h3 style="font-size:15px">${icon('shield', 'sm')} Muafiyetler</h3><div class="skel" style="height:14px;width:50%"></div></div>
    <div class="card card-pad stack" data-sec="nobet" id="holCard"><h3 style="font-size:15px">${icon('calendar', 'sm')} Resmî tatiller ve bayramlar</h3><div class="skel" style="height:14px;width:50%"></div></div>`,
  mount: () => loadRulesCards(),
});
async function loadRulesCards() {
  try { RL.data = await api('rules.get'); } catch (e) { const c = $('#rulesCard'); if (c) setHTML(c, html`<p class="small muted">${e.message}</p>`); return; }
  drawNeeds(); drawExcluded(); drawExempt(); drawHolidays();
}
function drawNeeds() {
  const c = $('#rulesCard'); if (!c || !RL.data) return;
  const { units, needs } = RL.data;
  const v = (u, dt, pr) => ((needs[u] || {})[dt] || {})[pr] || 0;
  const cell = (u, dt, pr) => html`<td><input class="input" type="number" min="0" max="30" data-nd="${u}|${dt}|${pr}" value="${v(u, dt, pr)}" aria-label="${u} ${dt === 'weekday' ? 'hafta içi' : 'hafta sonu'} ${pr === 'day' ? 'gündüz' : 'gece'}"></td>`;
  setHTML(c, html`<div><h3 style="font-size:15px">${icon('users', 'sm')} Gereken nöbetçi sayıları</h3>
      <p class="small muted">Her birimde bir vardiyada kaç kişi olması gerektiği. Blok yerleşimi, eksik personel çağrısı ve istek ısı haritası bu sayılara göre çalışır. Resmî tatil ve bayramlar hafta sonu sayılır.</p></div>
    ${units.length ? html`<div class="nd-wrap"><table class="nd-table"><thead><tr><th>Birim</th><th>Hafta içi<br><span class="tiny faint">08–16</span></th><th>Hafta içi<br><span class="tiny faint">16–08</span></th><th>Hafta sonu<br><span class="tiny faint">gündüz</span></th><th>Hafta sonu<br><span class="tiny faint">gece</span></th></tr></thead>
      <tbody>${units.map((x) => html`<tr><td><b class="small">${x.unit}</b><div class="tiny faint">${x.side_name}</div></td>${cell(x.unit, 'weekday', 'day')}${cell(x.unit, 'weekday', 'night')}${cell(x.unit, 'weekend', 'day')}${cell(x.unit, 'weekend', 'night')}</tr>`)}</tbody></table></div>
      <div><button type="button" class="btn" data-act="needs-save">Sayıları kaydet</button></div>`
    : html`<p class="small muted">Önce “Taraf ve bloklar” ayarından blokları tanımlayın; birimler burada listelenir.</p>`}`);
}
ACT['needs-save'] = (el) => busy(el, async () => {
  const needs = {};
  $$('[data-nd]').forEach((i) => { const [u, dt, pr] = i.dataset.nd.split('|'); ((needs[u] = needs[u] || {})[dt] = needs[u][dt] || {})[pr] = +i.value || 0; });
  try { const r = await api('rules.needs.save', { needs }); RL.data.needs = r.needs; toast('Gereken sayılar kaydedildi'); } catch (e) { toast(e.message, 'err'); }
});
/** Ad önerileri: kullanıcılar + listelerde adı geçen herkes */
function rlNameOptions() {
  const seen = new Set(), out = [];
  [...(S.people || []).map((p) => p.name), ...((RL.data && RL.data.names) || [])].forEach((n) => { const k = n.toLocaleLowerCase('tr'); if (!seen.has(k)) { seen.add(k); out.push(n); } });
  return out.map((n) => html`<option value="${n}"></option>`);
}
function drawExcluded() {
  const c = $('#exclCard'); if (!c || !RL.data) return;
  const list = RL.data.excluded || [];
  setHTML(c, html`<div><h3 style="font-size:15px">${icon('eyeOff', 'sm')} Nöbet hesaplarına dahil edilmeyenler</h3><p class="small muted">Listede adı olsa da hemşire nöbet düzenine girmeyen kişiler (ör. yaşlı bakım personeli). Blok yerleşimine, kuraya, karşıya geçiş sayılarına, eksik personel çağrısına ve nöbet değişimine hiç girmezler. Hesabı olanları <a href="#/yonetim/kullanicilar">Kullanıcılar</a> sayfasından da işaretleyebilirsiniz.</p></div>
    ${list.length ? html`<div>${list.map((x) => html`<div class="ex-row"><span class="grow"><b>${x.name}</b><span class="tiny faint" style="display:block">${x.source === 'user' ? 'Kullanıcı hesabından işaretli' : 'Ad ile eklendi'}</span></span><button type="button" class="btn ghost icon sm" data-act="excl-del" data-uid="${x.user_id || ''}" data-name="${x.name}" aria-label="Yeniden dahil et" title="Yeniden dahil et">${icon('x', 'sm')}</button></div>`)}</div>` : html`<p class="tiny faint">Herkes nöbet hesaplarına dahil.</p>`}
    <div class="row wrap" style="gap:8px"> <datalist id="exclNames">${rlNameOptions()}</datalist><input class="input grow" id="exclName" list="exclNames" placeholder="Listedeki adı (ör. hesabı olmayan kişi)" style="min-width:200px"><button type="button" class="btn" data-act="excl-add">${icon('plus', 'sm')}Ekle</button></div>`);
}
ACT['excl-add'] = (el) => busy(el, async () => {
  const name = $('#exclName').value.trim();
  if (name.length < 3) { toast('Kişinin adını yazın.', 'err'); return; }
  const p = (S.people || []).find((x) => x.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'));
  try { const r = await api('rules.excluded.save', p ? { user_id: p.id, on: true } : { name, on: true }); RL.data.excluded = r.excluded; drawExcluded(); toast('Nöbet hesaplarından çıkarıldı'); } catch (e) { toast(e.message, 'err'); }
});
ACT['excl-del'] = (el) => busy(el, async () => {
  try { const r = await api('rules.excluded.save', el.dataset.uid ? { user_id: +el.dataset.uid, on: false } : { name: el.dataset.name, on: false }); RL.data.excluded = r.excluded; drawExcluded(); toast('Yeniden dahil edildi'); } catch (e) { toast(e.message, 'err'); }
});
function drawExempt() {
  const c = $('#exemptCard'); if (!c || !RL.data) return;
  const list = RL.data.exempt || [];
  setHTML(c, html`<div><h3 style="font-size:15px">${icon('shield', 'sm')} Muafiyetler</h3><p class="small muted">Gebelik, sağlık raporu, sendika temsilciliği gibi durumlarda kişiyi blok kurasından, kaydırmadan veya eksik personel çağrısından muaf tutun. Bitiş tarihi geçince muafiyet kendiliğinden kalkar.</p></div>
    ${list.length ? html`<div>${list.map((x) => html`<div class="ex-row"><span class="grow"><b>${x.name}</b><span class="tiny faint" style="display:block">${SCOPE_LABEL[x.scope] || x.scope} muaf${x.until ? ` · ${fmtDate(x.until, true)} tarihine kadar` : ''}${x.note ? ' · ' + x.note : ''}</span></span>${x.active ? html`<span class="badge success">Etkin</span>` : html`<span class="badge">Süresi doldu</span>`}<button type="button" class="btn ghost icon sm" data-act="ex-del" data-id="${x.id}" aria-label="Kaldır">${icon('trash', 'sm')}</button></div>`)}</div>` : html`<p class="tiny faint">Muaf kişi yok.</p>`}
    <div class="stack" style="gap:8px">
      <div class="grid2"><div class="field"><label for="exName">Kişi</label><input class="input" id="exName" list="exPeople" minlength="3" placeholder="Ad soyad"><datalist id="exPeople">${rlNameOptions()}</datalist></div>
        <div class="field"><label for="exScope">Neyden muaf</label><select class="select" id="exScope">${Object.entries(SCOPE_LABEL).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div></div>
      <div class="grid2"><div class="field"><label for="exUntil">Bitiş tarihi (isteğe bağlı)</label><input class="input" type="date" id="exUntil"></div><div class="field"><label for="exNote">Not</label><input class="input" id="exNote" maxlength="200" placeholder="ör. rapor"></div></div>
      <div><button class="btn" type="button" data-act="ex-add">${icon('plus', 'sm')}Muafiyet ekle</button></div>
    </div>`);
}
ACT['ex-add'] = (el) => busy(el, async () => {
  try {
    const r = await api('rules.exempt.save', { name: $('#exName').value.trim(), scope: $('#exScope').value, until: $('#exUntil').value, note: $('#exNote').value.trim() });
    RL.data.exempt = r.exempt; drawExempt(); toast('Muafiyet eklendi');
  } catch (e) { toast(e.message, 'err'); }
});
ACT['ex-del'] = (el) => busy(el, async () => { try { const r = await api('rules.exempt.delete', { id: +el.dataset.id }); RL.data.exempt = r.exempt; drawExempt(); } catch (e) { toast(e.message, 'err'); } });
function drawHolidays() {
  const c = $('#holCard'); if (!c || !RL.data) return;
  const today = ymd(new Date());
  const list = (RL.data.holidays || []).filter((h) => h.date >= today.slice(0, 4) + '-01-01');
  const yrs = [...new Set(list.map((h) => h.date.slice(0, 4)))];
  setHTML(c, html`<div><h3 style="font-size:15px">${icon('calendar', 'sm')} Resmî tatiller ve bayramlar</h3><p class="small muted">Takvimde işaretlenir, zorunlu çalışma saatinden düşülür ve kişisel ücret tahmininde bayram/resmî tatil ücreti uygulanır. Dini bayram tarihleri Diyanet takvimine göre girilmiştir; gerekirse düzeltin.</p></div>
    ${yrs.map((y) => html`<details ${y === today.slice(0, 4) ? raw('open') : ''}><summary class="small" style="cursor:pointer;font-weight:700;padding:6px 0">${y} (${list.filter((h) => h.date.startsWith(y)).length} gün)</summary>
      ${list.filter((h) => h.date.startsWith(y)).map((h) => html`<div class="hd-row"><span class="hol-mark"></span><span style="min-width:92px" class="small">${fmtDate(h.date, true)}</span><span class="grow small">${h.name}${h.half ? html` <span class="badge">yarım gün</span>` : ''}</span><button type="button" class="btn ghost icon sm" data-act="hol-del" data-d="${h.date}" aria-label="Sil">${icon('trash', 'sm')}</button></div>`)}</details>`)}
    <div class="stack" style="gap:8px">
      <div class="grid2"><div class="field"><label for="holDate">Tarih</label><input class="input" type="date" id="holDate"></div><div class="field"><label for="holName">Adı</label><input class="input" id="holName" maxlength="80" placeholder="ör. Ramazan Bayramı 1. gün"></div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="holHalf"><span class="small">Yarım gün (arife — 13:00’ten sonrası tatil)</span></label>
      <div><button class="btn" type="button" data-act="hol-add">${icon('plus', 'sm')}Tatil ekle / düzelt</button></div>
    </div>`);
}
ACT['hol-add'] = (el) => busy(el, async () => {
  const date = $('#holDate').value, name = $('#holName').value.trim();
  if (!date || !name) { toast('Tarih ve adı girin.', 'err'); return; }
  try { RL.data = await api('holidays.save', { date, name, half: $('#holHalf').checked }); drawHolidays(); syncHolidaysToBoot(); toast('Tatil kaydedildi'); } catch (e) { toast(e.message, 'err'); }
});
ACT['hol-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Tatil silinsin mi?', text: el.dataset.d + ' tatil listesinden çıkarılır.', ok: 'Sil', danger: true }))) return;
  try { RL.data = await api('holidays.save', { date: el.dataset.d, name: '' }); drawHolidays(); syncHolidaysToBoot(); } catch (e) { toast(e.message, 'err'); }
};
function syncHolidaysToBoot() {
  S.holidays = (RL.data.holidays || []).map((h) => Object.assign({ kind: /ramazan|kurban/i.test(h.name) ? 'bayram' : 'resmi' }, h));
}
