/* dupcii — hastane yemek listesi (4.12)
   Aylık liste PDF / Excel'den içe aktarılır (önizlemede düzeltilir) ya da elle yazılır; gün gün değiştirilir.
   Saate göre şimdiki ve sıradaki öğün (varsayılan kahvaltı 01:00, öğle 12:00, akşam 18:00), nöbet saatlerine düşen öğünler,
   isteğe bağlı ana sayfa kartı; kişi menüyü her gün, yalnız nöbetlerinde ya da hiç görmemeyi seçer. */
'use strict';

ICON_PATHS.utensils = 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7';
ICON_PATHS.coffee = 'M17 8h1a4 4 0 1 1 0 8h-1 M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z M6 2v2 M10 2v2 M14 2v2';

ROUTE_MOD.yemek = 'yemek';
NM_EXT.routes.yemek = (view, r) => mlPage(view, r[1]);
NM_EXT.nav.push({ sec: 'genel', mod: 'yemek', href: '#/yemek', icon: 'utensils', label: 'Yemek listesi', match: (r) => r[0] === 'yemek', visible: () => mlEff() !== 'off' || canManage('yemek') });
NM_EXT.homeCards.push({ id: 'yemek', title: 'Yemek menüsü (şimdiki / sıradaki öğün)', icon: 'utensils', order: 12, place: 'side', mod: 'yemek', visible: () => mlEff() !== 'off', render: (el) => mlHomeCard(el) });
Object.assign(NM_EXT.audit, { 'meal.save': 'Yemek listesini güncelledi', 'meal.delete': 'Yemek listesinden sildi', 'meal.cfg': 'Yemek ayarlarını değiştirdi' });

const ML_ORDER = ['kahvalti', 'ogle', 'aksam'];
const ML_LABEL = { kahvalti: 'Kahvaltı', ogle: 'Öğle yemeği', aksam: 'Akşam yemeği' };
const ML_SHORT = { kahvalti: 'Kahvaltı', ogle: 'Öğle', aksam: 'Akşam' };
const ML_ICON = { kahvalti: 'coffee', ogle: 'sun', aksam: 'moon' };
const ML_TONE = { kahvalti: 'amber', ogle: 'emerald', aksam: 'violet' };
const ML = { days: {}, got: {}, sel: null, view: 'gun', info: null, hpos: 0 };

/* ---------------- Tercih ve saat hesapları ---------------- */
function mlTimes() { return (S.meal && S.meal.times) || { kahvalti: '01:00', ogle: '12:00', aksam: '18:00' }; }
/** Kişinin seçimi: '' (birim varsayılanı) | 'all' | 'shift' | 'off' */
function mlPref() { return (S.my_prefs && S.my_prefs.ui && S.my_prefs.ui.meal) || ''; }
/** Geçerli görünürlük: 'all' | 'shift' | 'off' */
function mlEff() { if (!S.meal) return 'off'; return mlPref() || S.meal.mode || 'all'; }
function mlAdd(d, n) { const x = parseDT(d); x.setDate(x.getDate() + n); return ymd(x); }
/** Saate göre şimdiki öğün (gelmiş olan) ve sıradaki: kahvaltı 01:00'den, öğle 12:00'den, akşam 18:00'den itibaren */
function mlNow(now = new Date()) {
  const T = mlTimes(), d = ymd(now), t = hm(now);
  if (t < T.kahvalti) return { cur: { date: mlAdd(d, -1), meal: 'aksam' }, next: { date: d, meal: 'kahvalti' } };
  if (t < T.ogle) return { cur: { date: d, meal: 'kahvalti' }, next: { date: d, meal: 'ogle' } };
  if (t < T.aksam) return { cur: { date: d, meal: 'ogle' }, next: { date: d, meal: 'aksam' } };
  return { cur: { date: d, meal: 'aksam' }, next: { date: mlAdd(d, 1), meal: 'kahvalti' } };
}
/** Nöbet saatlerinin içine düşen öğünler: 08–08 → öğle, akşam, ertesi gün kahvaltı; 16–08 → akşam, ertesi gün kahvaltı */
function mlShiftMeals(e) {
  const T = mlTimes();
  const s = e.start || '08:00', en = e.end || s;
  const a = `${e.date} ${s}`, b = `${en <= s ? mlAdd(e.date, 1) : e.date} ${en}`;
  const out = [];
  [e.date, mlAdd(e.date, 1)].forEach((d) => ML_ORDER.forEach((m) => { const at = `${d} ${T[m]}`; if (at >= a && at < b) out.push({ date: d, meal: m }); }));
  return out;
}
/** Menüsü gösterilecek nöbet: şu an süren ya da 18 saat içinde başlayacak olan */
function mlDutyShift(entries) {
  const cur = currentShift(entries);
  if (cur) return cur;
  const n = nextShift(entries);
  if (!n) return null;
  const st = parseDT(`${n.date} ${n.start || '08:00'}`);
  return st - Date.now() <= 18 * 3600000 ? n : null;
}
function mlShiftLabel(list) {
  return list.map((x) => ML_SHORT[x.meal] + ' ' + mlTimes()[x.meal]).join(' · ');
}

/* ---------------- Veri ---------------- */
async function mlFetchRange(from, to) {
  const r = await api('meal.get', { from, to });
  for (let d = from; d <= to; d = mlAdd(d, 1)) delete ML.days[d];
  Object.assign(ML.days, r.days || {});
  mlInfo(r);
  return r;
}
async function mlFetchMonth(ym, force) {
  if (ML.got[ym] && !force && Date.now() - ML.got[ym] < 120000) return;
  const r = await api('meal.get', { ym });
  Object.keys(ML.days).filter((d) => d.startsWith(ym)).forEach((d) => { delete ML.days[d]; });
  Object.assign(ML.days, r.days || {});
  ML.got[ym] = Date.now();
  mlInfo(r);
}
function mlInfo(r) {
  ML.info = { months: r.months || [], last: r.last, can: !!r.can_edit, manage: !!r.manage, owner: r.owner || null, shared: !!r.shared, hospital: r.hospital || '' };
  S.meal = Object.assign({}, S.meal || {}, { times: r.times, mode: r.mode });
}
function mlItems(date, meal) { return ((ML.days[date] || {})[meal]) || []; }

/* ---------------- Ana sayfa kartı ---------------- */
async function mlHomeCard(el) {
  const eff = mlEff();
  if (eff === 'off') { el.remove(); return; }
  const my = await loadMyShifts().catch(() => ({ entries: [] }));
  const duty = mlDutyShift(my.entries || []);
  if (eff === 'shift' && !duty) { el.remove(); return; }
  const today = ymd(new Date());
  await mlFetchRange(mlAdd(today, -1), mlAdd(today, 2));
  const seq = [];
  for (let d = mlAdd(today, -1); d <= mlAdd(today, 2); d = mlAdd(d, 1)) ML_ORDER.forEach((m) => seq.push({ date: d, meal: m }));
  const n = mlNow();
  const curIdx = seq.findIndex((x) => x.date === n.cur.date && x.meal === n.cur.meal);
  if (!seq.some((x) => mlItems(x.date, x.meal).length)) {
    if (!ML.info.can) { el.remove(); return; }
    setHTML(el, html`<div class="card card-pad stack"><h3 style="font-size:15px">${icon('utensils', 'sm')} Yemek menüsü</h3><p class="small muted">Bu günlerin yemek listesi yüklenmedi.</p><div><a class="btn sm" href="#/yemek">${icon('upload', 'sm')}<span>Listeyi yükle</span></a></div></div>`);
    return;
  }
  ML.hpos = curIdx;
  const draw = () => {
    const x = seq[ML.hpos];
    const items = mlItems(x.date, x.meal);
    const isCur = ML.hpos === curIdx, isNext = ML.hpos === curIdx + 1;
    const dm = duty ? mlShiftMeals(duty) : [];
    const inDuty = dm.some((y) => y.date === x.date && y.meal === x.meal);
    setHTML(el, html`<div class="card ml-home">
      <div class="card-head"><h3>${icon('utensils', 'sm')} Yemek menüsü</h3><a class="small" href="#/yemek/${x.date}">Tüm liste</a></div>
      <div class="ml-hbody">
        <div class="row" style="gap:8px;align-items:center">
          <button type="button" class="btn ghost icon sm" data-act="ml-hmove" data-d="-1" ${ML.hpos <= 0 ? raw('disabled') : ''} aria-label="Önceki öğün">${icon('chevL', 'sm')}</button>
          <div class="grow ml-hwhen"><span class="cat-ico sm tone-${ML_TONE[x.meal]}">${icon(ML_ICON[x.meal])}</span>
            <span><b>${ML_LABEL[x.meal]}</b><span class="tiny faint" style="display:block">${dateLabel(x.date).replace(/ · /, ', ')} · ${mlTimes()[x.meal]}</span></span></div>
          <button type="button" class="btn ghost icon sm" data-act="ml-hmove" data-d="1" ${ML.hpos >= seq.length - 1 ? raw('disabled') : ''} aria-label="Sonraki öğün">${icon('chevR', 'sm')}</button>
        </div>
        <div class="row wrap" style="gap:6px;margin:8px 0 2px">${isCur ? html`<span class="badge brand">Şimdi</span>` : isNext ? html`<span class="badge">Sıradaki</span>` : ''}${inDuty ? html`<span class="badge tone-sky">Nöbetinde</span>` : ''}</div>
        ${items.length ? html`<ul class="ml-items">${items.map((t) => html`<li>${t}</li>`)}</ul>` : html`<p class="small muted" style="margin:6px 0">Bu öğünün menüsü listede yok.</p>`}
        ${isCur && mlItems(seq[curIdx + 1].date, seq[curIdx + 1].meal).length ? html`<button type="button" class="ml-next" data-act="ml-hmove" data-d="1">${icon('clock', 'sm')}<span class="grow ellipsis">Sırada ${ML_SHORT[seq[curIdx + 1].meal].toLocaleLowerCase('tr')} (${mlTimes()[seq[curIdx + 1].meal]}): ${mlItems(seq[curIdx + 1].date, seq[curIdx + 1].meal).join(', ')}</span></button>` : ''}
        ${duty && dm.length ? html`<div class="ml-duty">${icon('calendar', 'sm')}<span>${currentShift(my.entries || []) === duty ? 'Bu nöbetindeki' : 'Sıradaki nöbetindeki'} öğünler: <b>${mlShiftLabel(dm)}</b></span></div>` : ''}
      </div></div>`);
  };
  ML.hdraw = draw;
  draw();
}
ACT['ml-hmove'] = (el) => { ML.hpos += +el.dataset.d; if (ML.hdraw) ML.hdraw(); };

/* ---------------- Takvimim: o günkü nöbetteki öğünler ---------------- */
async function mlDayPanel(box, date, mine) {
  if (!box || !modOn('yemek') || mlEff() === 'off') return;
  const sh = (mine || []).find((e) => e.kind === 'shift');
  if (!sh) return;
  const dm = mlShiftMeals(sh);
  if (!dm.length) return;
  try { await mlFetchRange(date, mlAdd(date, 1)); } catch (e) { return; }
  const has = dm.filter((x) => mlItems(x.date, x.meal).length);
  if (!has.length || CAL.sel !== date) return;
  setHTML(box, html`<div class="sec-label">${icon('utensils', 'sm')} Bu nöbetteki yemekler</div>
    <div class="ml-mini">${has.map((x) => html`<a class="ml-mrow" href="#/yemek/${x.date}"><span class="cat-ico sm tone-${ML_TONE[x.meal]}">${icon(ML_ICON[x.meal])}</span>
      <span class="grow" style="min-width:0"><b class="small">${ML_SHORT[x.meal]} · ${mlTimes()[x.meal]}${x.date !== date ? ' (ertesi gün)' : ''}</b><span class="tiny faint" style="display:block">${mlItems(x.date, x.meal).join(', ')}</span></span></a>`)}</div>`);
}

/* ---------------- Sayfa ---------------- */
async function mlPage(view, arg) {
  const today = ymd(new Date());
  if (arg === 'ay') ML.view = 'ay';
  else if (arg && /^\d{4}-\d{2}-\d{2}$/.test(arg)) { ML.sel = arg; ML.view = 'gun'; }
  if (!ML.sel) ML.sel = mlNow().cur.date;
  if (!arg && ML.view !== 'ay') ML.sel = mlNow().cur.date;
  setHTML(view, html`<div class="page-head"><div><h1>Yemek listesi</h1><p id="mlSub">Hastane yemek menüsü · gün gün</p></div>
      <div class="row" style="gap:8px" id="mlActs"></div></div>
    <div id="mlBody">${mkSpin()}</div>`);
  const ym = ML.sel.slice(0, 7);
  try { await Promise.all([mlFetchMonth(ym, true), mlAdd(ML.sel, 1).slice(0, 7) !== ym ? mlFetchMonth(mlAdd(ML.sel, 1).slice(0, 7)) : null, loadMyShifts().catch(() => null)]); }
  catch (e) { setHTML($('#mlBody'), mkErr(e.message)); return; }
  const I = ML.info;
  const sub = $('#mlSub');
  if (sub) sub.textContent = [I.hospital ? I.hospital + ' yemek menüsü' : 'Yemek menüsü', I.last ? 'son güncelleme ' + fmtRel(I.last.at) + (I.last.unit ? ' (' + I.last.unit + ')' : '') : ''].filter(Boolean).join(' · ');
  setHTML($('#mlActs'), html`<button type="button" class="btn icon" data-act="ml-settings" aria-label="Görünüm ayarları" title="Görünüm ayarları">${icon('sliders')}</button>
    ${I.can ? html`<button type="button" class="btn" data-act="ml-manual">${icon('edit', 'sm')}<span>Elle gir</span></button><button type="button" class="btn primary" data-act="ml-import">${icon('upload', 'sm')}<span>Liste yükle</span></button>` : ''}`);
  mlDraw();
}

function mlDraw() {
  const box = $('#mlBody');
  if (!box) return;
  const ym = ML.sel.slice(0, 7);
  const monthHas = Object.keys(ML.days).some((d) => d.startsWith(ym));
  const y = +ym.slice(0, 4), mo = +ym.slice(5, 7);
  const n = mlNow();
  const lock = ML.info.manage && !ML.info.can && ML.info.owner ? html`<div class="mk-box">${icon('lock', 'sm')}<span>Hastanenin yemek listesini <b>${ML.info.owner.unit}</b> birimi yönetiyor; liste ve öğün saatleri o birimden değiştirilir.</span></div>` : '';
  const off = mlEff() === 'off' ? html`<div class="mk-box">${icon('eyeOff', 'sm')}<span>Yemek menüsünü kendin için gizledin; menüde ve ana sayfada görünmüyor. <button type="button" class="btn sm ghost" data-act="ml-settings">Değiştir</button></span></div>` : '';
  const seg = html`<div class="row wrap" style="gap:8px;justify-content:space-between;align-items:center">
    <div class="seg"><button type="button" class="${ML.view === 'gun' ? 'on' : ''}" data-act="ml-view" data-v="gun">Gün</button><button type="button" class="${ML.view === 'ay' ? 'on' : ''}" data-act="ml-view" data-v="ay">Ay</button></div>
    <div class="row" style="gap:6px;align-items:center"><button type="button" class="btn ghost icon sm" data-act="ml-month" data-d="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b class="small">${TR_MONTHS[mo - 1]} ${y}</b><button type="button" class="btn ghost icon sm" data-act="ml-month" data-d="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div></div>`;
  if (!monthHas) {
    setHTML(box, html`${lock}${off}${seg}<div class="card empty" style="margin-top:12px"><div class="e-ico">${icon('utensils', 'lg')}</div><h3>${TR_MONTHS[mo - 1]} ayının yemek listesi yok</h3>
      <p class="small">${ML.info.can ? 'Aylık listeyi PDF ya da Excel olarak yükleyin; okunan menüyü kaydetmeden önce görüp düzeltebilirsiniz.' : 'Liste yüklenince burada gün gün görünür.'}</p>
      ${ML.info.can ? html`<div class="row" style="gap:8px;justify-content:center"><button type="button" class="btn primary" data-act="ml-import">${icon('upload', 'sm')}<span>Liste yükle</span></button><button type="button" class="btn" data-act="ml-manual">Elle gir</button></div>` : ''}</div>`);
    return;
  }
  if (ML.view === 'ay') { setHTML(box, html`${lock}${off}${seg}${mlMonthHtml(ym)}`); return; }
  // Gün şeridi
  const last = new Date(y, mo, 0).getDate();
  const shiftDays = new Set((MY.entries || []).filter((e) => e.kind === 'shift').map((e) => e.date));
  const strip = [];
  for (let i = 1; i <= last; i++) {
    const d = `${ym}-${pad(i)}`, dt = parseDT(d), has = !!ML.days[d];
    strip.push(html`<a class="tk-dc ${d === ML.sel ? 'on' : ''} ${has ? '' : 'none'} ${dt.getDay() === 0 || dt.getDay() === 6 ? 'wk' : ''}" href="#/yemek/${d}" data-ml-day="${d}"><b>${i}</b><span>${TR_DAYS_S[dt.getDay()]}</span>${shiftDays.has(d) ? html`<em class="ml-dot" title="Nöbet günün">N</em>` : ''}</a>`);
  }
  const mine = (MY.entries || []).filter((e) => e.kind === 'shift' && (e.date === ML.sel || (e.date === mlAdd(ML.sel, -1) && e.end && e.start && e.end <= e.start)));
  const dutyMeals = mine.flatMap((e) => mlShiftMeals(e));
  const inDuty = (m) => dutyMeals.some((x) => x.date === ML.sel && x.meal === m);
  const card = (m) => {
    const items = mlItems(ML.sel, m);
    const isCur = n.cur.date === ML.sel && n.cur.meal === m, isNext = n.next.date === ML.sel && n.next.meal === m;
    return html`<div class="card ml-meal ${isCur ? 'cur' : ''}">
      <div class="ml-mh"><span class="cat-ico tone-${ML_TONE[m]}">${icon(ML_ICON[m])}</span><div class="grow"><b>${ML_LABEL[m]}</b><span class="tiny faint" style="display:block">${mlTimes()[m]}’den itibaren</span></div>
        <div class="row wrap" style="gap:4px;justify-content:flex-end">${isCur ? html`<span class="badge brand">Şimdi</span>` : isNext ? html`<span class="badge">Sıradaki</span>` : ''}${inDuty(m) ? html`<span class="badge tone-sky">Nöbetinde</span>` : ''}</div></div>
      ${items.length ? html`<ul class="ml-items">${items.map((t) => html`<li>${t}</li>`)}</ul>` : html`<p class="small muted" style="margin:8px 0 0">Listede yok.</p>`}</div>`;
  };
  const dutyLine = mine.length ? html`<div class="mk-box">${icon('calendar', 'sm')}<span>${mine.map((e) => html`${codeChip(e)} ${e.date === ML.sel ? '' : 'Dünden süren '}nöbetin (${shiftDesc(e)}) · bu nöbette: <b>${mlShiftLabel(mlShiftMeals(e))}</b>${raw('<br>')}`)}</span></div>` : '';
  setHTML(box, html`${lock}${off}${seg}<div class="tk-strip" id="mlStrip">${strip}</div>
    <div class="row" style="gap:8px;align-items:center;margin:4px 0 10px">
      <button type="button" class="btn ghost icon" data-act="ml-day" data-d="-1" aria-label="Önceki gün">${icon('chevL')}</button>
      <h2 class="grow" style="font-size:17px;margin:0;text-align:center">${dateLabel(ML.sel)}</h2>
      <button type="button" class="btn ghost icon" data-act="ml-day" data-d="1" aria-label="Sonraki gün">${icon('chevR')}</button></div>
    ${ML.sel !== ymd(new Date()) ? html`<div style="text-align:center;margin:-4px 0 10px"><button type="button" class="btn sm" data-act="ml-today">Bugüne dön</button></div>` : ''}
    ${dutyLine}
    <div class="ml-grid" id="mlGrid">${ML_ORDER.map(card)}</div>
    ${ML.info.can ? html`<div class="row" style="gap:8px;margin-top:12px"><button type="button" class="btn sm" data-act="ml-edit-day" data-d="${ML.sel}">${icon('edit', 'sm')}<span>Bu günü düzenle</span></button></div>` : ''}`);
  const on = $('#mlStrip .tk-dc.on');
  if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  mlSwipe($('#mlGrid'));
}
function mlMonthHtml(ym) {
  const y = +ym.slice(0, 4), mo = +ym.slice(5, 7), last = new Date(y, mo, 0).getDate(), today = ymd(new Date());
  const shiftDays = new Set((MY.entries || []).filter((e) => e.kind === 'shift').map((e) => e.date));
  const rows = [];
  for (let i = 1; i <= last; i++) {
    const d = `${ym}-${pad(i)}`, dt = parseDT(d);
    rows.push(html`<tr class="${d === today ? 'today' : ''} ${dt.getDay() === 0 || dt.getDay() === 6 ? 'wk' : ''}"><th><a href="#/yemek/${d}"><b>${i}</b> <span class="tiny faint">${TR_DAYS_S[dt.getDay()]}</span></a>${shiftDays.has(d) ? html` <span class="ml-dot" title="Nöbet günün">N</span>` : ''}</th>
      ${ML_ORDER.map((m) => html`<td>${mlItems(d, m).join(', ') || html`<span class="faint">—</span>`}</td>`)}</tr>`);
  }
  return html`<div class="card ml-month" style="margin-top:12px"><table><thead><tr><th>Gün</th>${ML_ORDER.map((m) => html`<th>${ML_LABEL[m]} <span class="tiny faint">${mlTimes()[m]}</span></th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function mlSwipe(el) {
  if (!el) return;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) mlGo(mlAdd(ML.sel, dx < 0 ? 1 : -1));
  });
}
async function mlGo(d) {
  ML.sel = d;
  navStep('#/yemek/' + d);
  const ym = d.slice(0, 7);
  if (!ML.got[ym]) { try { await mlFetchMonth(ym); } catch (e) { toast(e.message, 'err'); } }
  const nx = mlAdd(d, 1).slice(0, 7);
  if (nx !== ym && !ML.got[nx]) mlFetchMonth(nx).catch(() => {});
  mlDraw();
}
ACT['ml-day'] = (el) => mlGo(mlAdd(ML.sel, +el.dataset.d));
ACT['ml-today'] = () => mlGo(ymd(new Date()));
ACT['ml-view'] = (el) => { ML.view = el.dataset.v; mlDraw(); };
ACT['ml-month'] = (el) => {
  const d = parseDT(ML.sel.slice(0, 7) + '-01'); d.setMonth(d.getMonth() + +el.dataset.d);
  const ym = ymd(d).slice(0, 7), today = ymd(new Date());
  mlGo(today.startsWith(ym) ? today : ym + '-01');
};

/* ---------------- Görünüm tercihi (kişisel) ve yönetici ayarları ---------------- */
function mlPrefHtml() {
  const p = mlPref(), def = (S.meal && S.meal.mode) === 'shift' ? 'yalnız nöbet günlerimde' : 'her gün';
  const opt = (v, t, s) => html`<label class="ml-opt"><input type="radio" name="mlPref" value="${v}" data-change="ml-pref" ${p === v ? raw('checked') : ''}><span><b>${t}</b><span class="tiny faint" style="display:block">${s}</span></span></label>`;
  const homeOn = typeof homeOff === 'function' ? !homeOff('yemek') : true;
  return html`<div class="stack" style="gap:6px">
    ${opt('', 'Birimin ayarına uy', `Şu an: ${def}`)}
    ${opt('all', 'Her gün göster', 'Menü sol menüde ve ana sayfada her gün görünür.')}
    ${opt('shift', 'Yalnız nöbetlerimde göster', 'Ana sayfada yalnız nöbetin sürerken ya da 18 saat içinde başlayacakken, o nöbetin öğünleriyle görünür.')}
    ${opt('off', 'Gizle', 'Yemek menüsü size hiç gösterilmez (istediğinizde yeniden açabilirsiniz).')}
    <label class="row" style="gap:10px;cursor:pointer;margin-top:6px"><span class="switch"><input type="checkbox" data-change="ml-home" ${homeOn ? raw('checked') : ''}><span class="track"></span></span><span class="grow small">Ana sayfamda yemek kartını göster</span></label></div>`;
}
CHANGE['ml-pref'] = (el) => {
  if (typeof prefsRemember === 'function') prefsRemember({ meal: el.value });
  toast(el.value === 'off' ? 'Yemek menüsü gizlendi' : 'Kaydedildi');
  if (typeof renderNav === 'function') renderNav();
  if (location.hash.startsWith('#/yemek')) mlDraw();
};
CHANGE['ml-home'] = (el) => {
  if (typeof saveHome !== 'function') return;
  const P = homePrefs();
  saveHome({ hidden: el.checked ? P.hidden.filter((x) => x !== 'yemek') : [...new Set([...P.hidden, 'yemek'])] });
};
function mlCfgHtml() {
  const T = mlTimes(), mode = (S.meal && S.meal.mode) || 'all', I = ML.info || {};
  const own = I.owner;
  return html`<div class="stack" style="gap:10px">
    ${I.can ? html`<div class="ml-times">${ML_ORDER.map((m) => html`<div class="field"><label>${ML_SHORT[m]} saati</label><input class="input" type="time" data-mlt="${m}" value="${T[m]}"></div>`)}</div>
      <p class="tiny faint" style="margin:0">Bu saatten itibaren o öğünün menüsü “şimdi” olarak gösterilir; nöbet saatlerine düşen öğünler bu saatlere göre bulunur.${I.shared ? ' Saatler hastanedeki tüm birimler için ortaktır.' : ''}</p>`
    : html`<p class="small muted" style="margin:0">Öğün saatleri: ${ML_ORDER.map((m) => `${ML_SHORT[m]} ${T[m]}`).join(' · ')}${own ? ` (listeyi “${own.unit}” birimi yönetiyor)` : ''}</p>`}
    <div class="field"><label>Birimde kim görsün (kişi kendisi için değiştirebilir)</label><select class="input" data-mlmode><option value="all" ${mode === 'all' ? raw('selected') : ''}>Herkes, her gün</option><option value="shift" ${mode === 'shift' ? raw('selected') : ''}>Yalnız nöbetçiler (nöbet günlerinde)</option></select></div>
    <div class="row wrap" style="gap:8px"><button type="button" class="btn" data-act="ml-cfg-save">Yemek ayarlarını kaydet</button>
      ${I.shared && own && own.me ? html`<button type="button" class="btn ghost" data-act="ml-release">Liste yönetimini bırak</button>` : ''}</div>
    ${I.shared && own && own.me ? html`<p class="tiny faint" style="margin:0">Hastanenin yemek listesini biriminiz yönetiyor; diğer birimler yalnız görüntüler. Bırakırsanız listeyi ilk kaydeden birim yönetir.</p>` : ''}</div>`;
}
ACT['ml-settings'] = async () => {
  if (!ML.info) { try { await mlFetchRange(ymd(new Date()), ymd(new Date())); } catch (e) { /* */ } }
  const man = ML.info && ML.info.manage;
  openModal({ title: 'Yemek menüsü ayarları', body: html`<h3 class="ph" style="font-size:14px">Benim için</h3>${mlPrefHtml()}${man ? html`<hr class="sep"><h3 class="ph" style="font-size:14px">Birim / hastane (yönetici)</h3><div id="mlCfgBox">${mlCfgHtml()}</div>` : ''}`, foot: html`<button type="button" class="btn" data-close>Kapat</button>` });
};
ACT['ml-cfg-save'] = (el) => busy(el, async () => {
  const box = el.closest('.modal, .card') || document;
  const times = {}; $$('[data-mlt]', box).forEach((i) => { times[i.dataset.mlt] = i.value; });
  try {
    const r = await api('meal.cfg', Object.assign({ mode: $('[data-mlmode]', box).value }, Object.keys(times).length ? { times } : {}));
    S.meal = Object.assign({}, S.meal || {}, { times: r.times, mode: r.mode });
    if (ML.info) ML.info.owner = r.owner;
    toast('Yemek ayarları kaydedildi');
    if (location.hash.startsWith('#/yemek')) mlDraw();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['ml-release'] = (el) => busy(el, async () => {
  if (!(await confirmDialog({ title: 'Liste yönetimi bırakılsın mı?', text: 'Hastanenin yemek listesini bundan sonra listeyi ilk kaydeden birim yönetir. Mevcut liste silinmez.', ok: 'Bırak' }))) return;
  try {
    await api('meal.cfg', { release: true });
    toast('Liste yönetimi bırakıldı');
    while (modalStack.length) modalStack[modalStack.length - 1].close();
    if (location.hash.startsWith('#/yemek')) mlPage($('#view'), ML.sel);
  } catch (e) { toast(e.message, 'err'); }
});
NM_EXT.settingsCards.push({
  sec: 'genel',
  html: () => (S.meal ? html`<div class="card card-pad stack" data-sec="genel" id="mlSetCard"><div><h3 style="font-size:15px">${icon('utensils', 'sm')} Yemek menüsü</h3><p class="small muted">Hastane yemek listesini nerede ve ne zaman görmek istediğinizi seçin.</p></div>${mlPrefHtml()}</div>` : ''),
});

/* =================================================================== */
/* İçe aktarma: PDF / Excel / CSV                                       */
/* =================================================================== */
const ML_TRM = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
function mlFold(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[âà]/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
}
/** Metindeki tarih: 01.11.2026 · 1/11/26 · 2026-11-01 · 1 Kasım 2026 → 'YYYY-MM-DD' ya da null */
function mlParseDate(s, yHint) {
  const t = String(s || '').trim();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/(?:^|[^\d])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = mlFold(t).match(/(?:^|[^\d])(\d{1,2})\s+([a-z]+)\s*(\d{4})?/))) {
    const k = ML_TRM.findIndex((x) => m[2].startsWith(x.slice(0, 3)) && x.startsWith(m[2].slice(0, 3)));
    if (k < 0) return null;
    d = +m[1]; mo = k + 1; y = m[3] ? +m[3] : yHint || new Date().getFullYear();
  } else return null;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  const dt = new Date(y, mo - 1, d);
  return dt.getMonth() === mo - 1 ? ymd(dt) : null;
}
function mlMealOf(text) {
  const k = mlFold(text).replace(/\s+/g, ' ').trim();
  if (k.length > 24) return null;
  if (/kahvalti|sabah/.test(k)) return 'kahvalti';
  if (/ogle/.test(k)) return 'ogle';
  if (/aksam/.test(k)) return 'aksam';
  return null;
}
const ML_UP = (c) => c && c.toLocaleUpperCase('tr') !== c.toLocaleLowerCase('tr');
/** Satırları kalemlere birleştir: "Domates-" + "salatalık" → "Domates-salatalık"; küçük harfle başlayan satır öncekinin devamı */
function mlJoinLines(lines, caseRule) {
  const out = [];
  lines.forEach((ln) => {
    const t = ln.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const prev = out.length ? out[out.length - 1] : null;
    const c0 = t[0];
    if (prev !== null) {
      if (/[A-Za-zÇĞİÖŞÜçğıöşü]-$/.test(prev)) { out[out.length - 1] = prev + t; return; }
      if (/[,/\\&+(]$/.test(prev) || /\sve$/i.test(prev)) { out[out.length - 1] = prev + ' ' + t; return; }
      if (/^[/\\),.]/.test(t)) { out[out.length - 1] = prev + t; return; }
      if (/^[&+-]/.test(t)) { out[out.length - 1] = prev + ' ' + t; return; }
      if (caseRule && ML_UP(c0) && c0 === c0.toLocaleLowerCase('tr')) { out[out.length - 1] = prev + ' ' + t; return; }
    }
    out.push(t);
  });
  return out;
}
/**
 * pdf.js metin öğelerinden aylık liste. pages: [{items: [{x, y, w, s}]}] (y aşağıdan yukarı).
 * Başlıklar (TARİH / KAHVALTI / ÖĞLE / AKŞAM) sütunları, tarih hücreleri satırları belirler; tarihi olmayan satırlar (sayfa başında
 * devam eden hücre dahil) bir önceki güne eklenir. Dönen: { days: {tarih: {kahvalti: [], ogle: [], aksam: []}}, warn: [] }
 */
function mlFromPdfItems(pages) {
  const warn = [];
  // 1) Başlık satırı (her sayfada aranır; bulunduğu sayfada üstündeki her şey atlanır)
  let H = null;
  const headY = {}, headLo = {};
  pages.forEach((pg, pi) => {
    const hs = pg.items.map((it) => ({ it, m: mlMealOf(it.s), t: /^tarih$|^gun$|^tarih\s*\/?\s*gun$/.test(mlFold(it.s).trim()) })).filter((x) => x.m || x.t);
    const byY = {};
    hs.forEach((x) => { const k = Math.round(x.it.y / 4); (byY[k] = byY[k] || []).push(x); });
    const row = Object.values(byY).find((r) => new Set(r.filter((x) => x.m).map((x) => x.m)).size >= 2);
    if (!row) return;
    headY[pi] = Math.max(...row.map((x) => x.it.y));
    headLo[pi] = Math.min(...row.map((x) => x.it.y));
    if (!H) {
      const cols = {};
      row.filter((x) => x.m).forEach((x) => { if (!cols[x.m]) cols[x.m] = { meal: x.m, l: x.it.x, r: x.it.x + x.it.w, c: x.it.x + x.it.w / 2 }; });
      const t = row.find((x) => x.t);
      H = { cols: Object.values(cols).sort((a, b) => a.c - b.c), date: t ? { l: t.it.x, r: t.it.x + t.it.w, c: t.it.x + t.it.w / 2 } : null };
    }
  });
  // 2) Sütun sınırları: başlık yoksa x kümelerinden (soldan: tarih, kahvaltı, öğle, akşam)
  const body = [];
  pages.forEach((pg, pi) => pg.items.forEach((it) => {
    if (!it.s || !it.s.trim() || (headY[pi] !== undefined && it.y >= headY[pi] - 2)) return;
    if (/^(yemegi|yemek|tarih|gun)$/.test(mlFold(it.s).trim())) return; // iki satıra bölünmüş başlığın ikinci satırı
    body.push(Object.assign({ p: pi }, it));
  }));
  let cols;
  if (H) cols = H.cols;
  else {
    const xs = {};
    body.filter((it) => !mlParseDate(it.s)).forEach((it) => { const k = Math.round(it.x / 6); xs[k] = (xs[k] || 0) + 1; });
    const top = Object.entries(xs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => +k * 6).sort((a, b) => a - b);
    const dx = body.filter((it) => mlParseDate(it.s)).map((it) => it.x);
    const dateX = dx.length ? Math.min(...dx) : -1;
    const mealXs = top.filter((x) => x > dateX + 6).slice(-3);
    if (mealXs.length < 3) return { days: {}, warn: ['Tabloda KAHVALTI / ÖĞLE / AKŞAM sütunları bulunamadı.'] };
    cols = mealXs.map((x, i) => ({ meal: ML_ORDER[i], l: x, r: x + 40, c: x + 20 }));
    warn.push('Sütun başlıkları bulunamadı; sütunlar sırayla kahvaltı, öğle, akşam kabul edildi.');
  }
  // Sınırlar: sol kenarı sütun kümelerine göre (hücre metni sola yaslı); her sütun bir önceki başlığın sağ kenarı ile kendi sol kenarının ortasından başlar
  const firstL = cols[0].l;
  const lefts = {};
  body.forEach((it) => { if (it.x >= firstL - 30) { const k = Math.round(it.x / 3) * 3; lefts[k] = (lefts[k] || 0) + 1; } });
  const starts = cols.map((c, i) => {
    const lo = i === 0 ? (H && H.date ? (H.date.r + c.l) / 2 : c.l - 30) : (cols[i - 1].r + c.l) / 2;
    // Hücre metni sola yaslıysa sütunun asıl başı: başlığın solunda/hizasında en sık görülen sol kenar
    const cand = Object.entries(lefts).map(([x, n]) => [+x, n]).filter(([x]) => x >= (i === 0 ? lo - 20 : (cols[i - 1].l + c.l) / 2) && x <= c.c).sort((a, b) => b[1] - a[1])[0];
    return cand && cand[1] >= 3 ? Math.min(lo, cand[0] - 3) : lo;
  });
  const colOf = (it) => { let k = -1; starts.forEach((s, i) => { if (it.x >= s - 1) k = i; }); return k; };
  // 3) Satırlar: tablonun yatay çizgileri varsa her bant bir satırdır (tarih hücrede ortalı olsa da doğru gün bulunur);
  //    çizgi yoksa öğe kendi sayfasında üstündeki en yakın tarihe bağlanır. Tarihsiz satır (sayfa başında süren hücre) önceki güne eklenir.
  const right = cols[cols.length - 1].r + 60;
  const bands = {};
  pages.forEach((pg, pi) => {
    const ys = [];
    (pg.hr || []).filter((h) => h.x2 > starts[0] && h.x1 < right).map((h) => h.y).sort((a, b) => b - a).forEach((y) => { if (!ys.length || ys[ys.length - 1] - y > 1.5) ys.push(y); });
    if (ys.length >= 2) bands[pi] = ys;
  });
  const anchorY = {};
  body.forEach((it) => { if (colOf(it) < 0 && mlParseDate(it.s)) (anchorY[it.p] = anchorY[it.p] || []).push(it.y); });
  Object.values(anchorY).forEach((a) => a.sort((x, y) => y - x));
  const unitOf = (it) => {
    const ys = bands[it.p];
    if (ys) {
      for (let j = 0; j < ys.length - 1; j++) {
        if (!(it.y < ys[j] && it.y > ys[j + 1])) continue;
        // başlık satırının bandı (tekrarlanan başlık dahil) atlanır
        if (headLo[it.p] !== undefined && headLo[it.p] < ys[j] && headLo[it.p] > ys[j + 1]) return null;
        return j;
      }
      return null;
    }
    const a = anchorY[it.p] || [];
    let o = -1;
    a.forEach((y, j) => { if (y >= it.y - 3) o = j; });
    return o;
  };
  const units = {};
  body.forEach((it) => {
    const o = unitOf(it);
    if (o === null) return;
    const k = it.p * 10000 + o + 1;
    const U = (units[k] = units[k] || { k, date: null, its: [] });
    const ci = colOf(it);
    if (ci < 0) { const d = mlParseDate(it.s); if (d && !U.date) U.date = d; return; }
    U.its.push(Object.assign({ ci }, it));
  });
  const order = Object.values(units).sort((a, b) => a.k - b.k);
  if (!order.some((u) => u.date)) return { days: {}, warn: ['Tabloda tarih bulunamadı (ör. 01.11.2026).'] };
  const cells = {};
  const dates = [];
  let curD = null;
  order.forEach((u) => {
    if (u.date) { curD = u.date; dates.push(u.date); }
    if (!curD) return;
    u.its.forEach((it) => { const k = curD + '|' + cols[it.ci].meal; (cells[k] = cells[k] || []).push(it); });
  });
  // Satırlar ve büyük harf kuralı
  const linesOf = (its) => {
    const s = its.slice().sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
    const lines = [];
    s.forEach((it) => {
      const L = lines[lines.length - 1];
      if (L && L.p === it.p && Math.abs(L.y - it.y) <= 2) { L.t += (it.x - L.r > 1.5 ? ' ' : '') + it.s; L.r = it.x + it.w; }
      else lines.push({ p: it.p, y: it.y, r: it.x + it.w, t: it.s });
    });
    return lines.map((l) => l.t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  };
  const all = {};
  let up = 0, lo = 0;
  Object.entries(cells).forEach(([k, its]) => { all[k] = linesOf(its); all[k].forEach((t) => { if (ML_UP(t[0])) { if (t[0] === t[0].toLocaleUpperCase('tr')) up++; else lo++; } }); });
  const caseRule = up >= (up + lo) * 0.6;
  const days = {};
  dates.forEach((d) => { days[d] = days[d] || { kahvalti: [], ogle: [], aksam: [] }; });
  Object.entries(all).forEach(([k, lines]) => { const [d, m] = k.split('|'); days[d][m] = mlJoinLines(lines, caseRule); });
  return { days, warn };
}
/** Sayfadaki yatay çizgiler (tablo satır sınırları): ince dikdörtgenler ve yatay doğrular, sayfa koordinatında */
function mlPdfRules(fns, args, OPS) {
  const out = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const st = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const ap = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const seg = (x1, y1, x2, y2) => {
    const [a, b] = ap(x1, y1), [c, d] = ap(x2, y2);
    if (Math.abs(b - d) < 2.5 && Math.abs(a - c) > 15) out.push({ y: (b + d) / 2, x1: Math.min(a, c), x2: Math.max(a, c) });
  };
  for (let i = 0; i < fns.length && out.length < 4000; i++) {
    const f = fns[i], a = args[i];
    if (f === OPS.save) st.push(ctm.slice());
    else if (f === OPS.restore) ctm = st.pop() || [1, 0, 0, 1, 0, 0];
    else if (f === OPS.transform) ctm = mul(ctm, a);
    else if (f === OPS.constructPath && a) {
      const ops = a[0] || [], co = a[1] || [];
      let k = 0, cx = 0, cy = 0;
      ops.forEach((op) => {
        if (op === OPS.rectangle) {
          const [x, y, w, h] = co.slice(k, k + 4); k += 4;
          const [p, q] = ap(x, y), [r, t] = ap(x + w, y + h);
          if (Math.abs(q - t) < 2.5) seg(x, y + h / 2, x + w, y + h / 2);
          else if (Math.abs(p - r) > 2.5) { seg(x, y, x + w, y); seg(x, y + h, x + w, y + h); }
        } else if (op === OPS.moveTo) { cx = co[k]; cy = co[k + 1]; k += 2; }
        else if (op === OPS.lineTo) { seg(cx, cy, co[k], co[k + 1]); cx = co[k]; cy = co[k + 1]; k += 2; }
        else if (op === OPS.curveTo) k += 6;
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) k += 4;
      });
    }
  }
  return out;
}
async function mlPdfPages(buf) {
  await loadVendor('pdf');
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = new URL(VENDOR.pdfWorker, location.href).href;
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    let hr = [];
    try { const ol = await pg.getOperatorList(); hr = mlPdfRules(ol.fnArray, ol.argsArray, lib.OPS); } catch (e) { /* çizgisiz devam */ }
    pages.push({ hr, items: tc.items.filter((t) => typeof t.str === 'string').map((t) => ({ x: t.transform[4], y: t.transform[5], w: t.width, s: t.str })) });
  }
  return pages;
}
/** Excel / CSV satırları ([[hücre]]) → aynı biçim. Başlık satırı aranır; tarihi boş satırlar bir önceki güne eklenir. */
function mlFromRows(rows) {
  const warn = [];
  let hi = -1, map = null, dc = 0;
  for (let r = 0; r < Math.min(rows.length, 20) && hi < 0; r++) {
    const m = {};
    (rows[r] || []).forEach((v, c) => { const k = mlMealOf(v); if (k && m[k] === undefined) m[k] = c; });
    if (Object.keys(m).length >= 2) {
      hi = r; map = m;
      const t = (rows[r] || []).findIndex((v) => /tarih|gun/.test(mlFold(v)));
      dc = t >= 0 ? t : Math.max(0, Math.min(...Object.values(m)) - 1);
    }
  }
  if (!map) { map = { kahvalti: 1, ogle: 2, aksam: 3 }; dc = 0; warn.push('Başlık satırı bulunamadı; sütunlar sırayla tarih, kahvaltı, öğle, akşam kabul edildi.'); }
  const days = {};
  let cur = null;
  const lines = {};
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const dv = row[dc];
    let d = null;
    if (typeof dv === 'number' && dv > 30000 && dv < 80000) { const x = new Date(Date.UTC(1899, 11, 30) + Math.round(dv) * 86400000); d = `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; }
    else if (dv instanceof Date) d = ymd(new Date(dv.getTime() + 12 * 3600000));
    else if (dv !== undefined && dv !== null && String(dv).trim()) d = mlParseDate(String(dv), cur ? +cur.slice(0, 4) : undefined);
    if (d) { cur = d; days[d] = days[d] || { kahvalti: [], ogle: [], aksam: [] }; }
    if (!cur) continue;
    Object.entries(map).forEach(([m, c]) => {
      const v = row[c];
      if (v === undefined || v === null || !String(v).trim()) return;
      let parts = String(v).split(/\r\n|\r|\n/).map((x) => x.trim()).filter(Boolean);
      if (parts.length === 1 && (parts[0].match(/[,;]/g) || []).length >= 1) parts = parts[0].split(/\s*[,;]\s*/).filter(Boolean);
      (lines[cur + '|' + m] = lines[cur + '|' + m] || []).push(...parts);
    });
  }
  Object.entries(lines).forEach(([k, ls]) => { const [d, m] = k.split('|'); days[d][m] = mlJoinLines(ls, false); });
  if (!Object.keys(days).length) warn.push('Dosyada tarih bulunamadı.');
  return { days, warn };
}
async function mlParseFile(file) {
  const ext = extOf(file.name);
  const buf = await file.arrayBuffer();
  if (ext === 'pdf') return mlFromPdfItems(await mlPdfPages(buf));
  if (['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'txt'].includes(ext)) {
    await loadVendor('xlsx');
    const wb = ext === 'csv' || ext === 'txt' ? XLSX.read(decodeText(buf), { type: 'string', raw: true }) : XLSX.read(new Uint8Array(buf), { type: 'array' });
    let best = { days: {}, warn: ['Dosyada tablo bulunamadı.'] };
    wb.SheetNames.slice(0, 6).forEach((n) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      const r = mlFromRows(rows);
      if (Object.keys(r.days).length > Object.keys(best.days).length) best = r;
    });
    return best;
  }
  throw new Error('PDF, Excel (.xlsx / .xls) ya da CSV dosyası seçin.');
}

/* ---------------- Önizleme / düzenleme tablosu ---------------- */
function mlEditorHtml(dates, days) {
  return html`<div class="ml-ed"><table><thead><tr><th>Gün</th>${ML_ORDER.map((m) => html`<th>${ML_LABEL[m]}</th>`)}</tr></thead><tbody>
    ${dates.map((d) => { const dt = parseDT(d); return html`<tr><th><b>${dt.getDate()} ${TR_MONTHS[dt.getMonth()].slice(0, 3)}</b><span class="tiny faint" style="display:block">${TR_DAYS[dt.getDay()]}</span></th>
      ${ML_ORDER.map((m) => html`<td><textarea class="textarea" rows="${Math.max(3, ((days[d] || {})[m] || []).reduce((a, x) => a + Math.ceil((x.length || 1) / 24), 0))}" data-mle="${d}|${m}" aria-label="${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${ML_LABEL[m]}" placeholder="Her satıra bir yemek">${((days[d] || {})[m] || []).join('\n')}</textarea></td>`)}</tr>`; })}
  </tbody></table></div>`;
}
function mlCollect(box) {
  const days = {};
  $$('[data-mle]', box).forEach((t) => { const [d, m] = t.dataset.mle.split('|'); (days[d] = days[d] || {})[m] = t.value.split('\n').map((x) => x.trim()).filter(Boolean); });
  return days;
}
async function mlSaveDays(days, replaceYm) {
  const byM = {};
  Object.entries(days).forEach(([d, v]) => { (byM[d.slice(0, 7)] = byM[d.slice(0, 7)] || {})[d] = v; });
  let saved = 0;
  for (const [ym, part] of Object.entries(byM)) {
    const r = await api('meal.save', { days: part, replace_ym: replaceYm && replaceYm.includes(ym) ? ym : '' });
    saved += r.saved;
  }
  Object.keys(byM).forEach((ym) => { delete ML.got[ym]; });
  return saved;
}
function mlEditorModal({ title, dates, days, warn = [], replaceOpt = null, note = '' }) {
  const empty = dates.filter((d) => !ML_ORDER.some((m) => ((days[d] || {})[m] || []).length));
  const m = openModal({
    title, size: 'wide ml-edm',
    body: html`${note ? html`<p class="small muted" style="margin-top:0">${note}</p>` : ''}
      ${warn.map((w) => html`<div class="mk-box">${icon('alert', 'sm')}<span>${w}</span></div>`)}
      ${empty.length && empty.length < dates.length ? html`<div class="mk-box">${icon('info', 'sm')}<span>Menüsü boş günler: ${empty.map((d) => +d.slice(8)).join(', ')}. Boş günler listeye eklenmez.</span></div>` : ''}
      ${replaceOpt ? html`<label class="row" style="gap:10px;cursor:pointer;margin:6px 0 10px"><span class="switch"><input type="checkbox" id="mlReplace" checked><span class="track"></span></span><span class="grow small">${replaceOpt.label}</span></label>` : ''}
      ${mlEditorHtml(dates, days)}`,
    foot: html`<button type="button" class="btn" data-close>Vazgeç</button><button type="button" class="btn primary" id="mlEdSave">${icon('check', 'sm')}<span>Kaydet</span></button>`,
  });
  const orig = JSON.stringify(mlCollect(m.body));
  m.guard = () => JSON.stringify(mlCollect(m.body)) !== orig && !m.saved;
  $('#mlEdSave', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const d = mlCollect(m.body);
    const rep = replaceOpt && $('#mlReplace', m.el) && $('#mlReplace', m.el).checked ? replaceOpt.yms : null;
    try {
      const n = await mlSaveDays(d, rep);
      m.saved = true; m.close();
      toast(`${n} öğün kaydedildi`);
      if (S.meal) S.meal.any = true;
      if (location.hash.startsWith('#/yemek')) { const first = Object.keys(d).sort()[0]; if (first && !(ML.sel || '').startsWith(first.slice(0, 7)) && !ymd(new Date()).startsWith(first.slice(0, 7))) ML.sel = first; mlPage($('#view'), ML.sel); }
    } catch (err) { toast(err.message, 'err'); }
  }));
  return m;
}
function mlMonthDates(ym) {
  const y = +ym.slice(0, 4), mo = +ym.slice(5, 7), last = new Date(y, mo, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`);
}
ACT['ml-import'] = () => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pdf,.xlsx,.xls,.xlsm,.ods,.csv,application/pdf';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast('Dosya çok büyük (en çok 15 MB).', 'err'); return; }
    toast('Liste okunuyor…');
    let r;
    try { r = await mlParseFile(f); } catch (e) { toast('Dosya okunamadı: ' + e.message, 'err'); return; }
    const dates = Object.keys(r.days).sort();
    if (!dates.length) { toast(r.warn[0] || 'Dosyada yemek listesi bulunamadı.', 'err'); return; }
    const yms = [...new Set(dates.map((d) => d.slice(0, 7)))];
    const missing = [];
    yms.forEach((ym) => mlMonthDates(ym).forEach((d) => { if (!r.days[d]) missing.push(d); }));
    const warn = r.warn.slice();
    if (missing.length && missing.length < 25) warn.push('Listede olmayan günler: ' + missing.map((d) => +d.slice(8) + ' ' + TR_MONTHS[+d.slice(5, 7) - 1].slice(0, 3)).join(', ') + '.');
    const label = yms.map((ym) => TR_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4)).join(', ');
    mlEditorModal({
      title: `Yemek listesi önizleme · ${label}`, dates, days: r.days, warn,
      note: `“${f.name}” dosyasından ${dates.length} gün okundu. Kaydetmeden önce kontrol edin; yanlış bölünen ya da birleşen satırları düzeltebilirsiniz (her satıra bir yemek).`,
      replaceOpt: { yms, label: `${label} için daha önce kaydedilmiş, bu dosyada olmayan günleri sil (listeyi tamamen değiştir)` },
    });
  });
  inp.click();
};
ACT['ml-manual'] = async () => {
  const ym = (ML.sel || ymd(new Date())).slice(0, 7);
  try { await mlFetchMonth(ym, true); } catch (e) { toast(e.message, 'err'); return; }
  mlEditorModal({ title: `Yemek listesi · ${TR_MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`, dates: mlMonthDates(ym), days: ML.days, note: 'Her satıra bir yemek yazın. Boş bırakılan öğün listeden kaldırılır.' });
};
ACT['ml-edit-day'] = (el) => {
  const d = el.dataset.d;
  mlEditorModal({ title: `${dateLabel(d)} menüsü`, dates: [d], days: ML.days, note: 'Her satıra bir yemek yazın. Boş bırakılan öğün listeden kaldırılır.' });
};
