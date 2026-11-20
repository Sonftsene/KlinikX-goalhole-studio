/* dupcii — nöbet istekleri: İsteklerim (takvim + yazarak), Pano (herkes), Yönetim (ısı haritası, onay/ret, kura, Excel) */
'use strict';

const RQ = {
  periods: [], pid: null, tab: 'benim', can: false, rosters: [], loaded: false,
  mine: null, draft: new Map(), target: '', rosterSel: null, preview: null,
  board: null, bview: 'kisi', bsel: null, bq: '',
  panel: null, side: null, psel: null, checked: new Set(), tok: 0, openNew: false,
};
const RQ_KIND = { bosluk: { s: 'B', l: 'Boşluk', tone: 'sky' }, izin: { s: 'Yİ', l: 'Yıllık izin', tone: 'violet' } };
const RQ_ST = { pending: ['Beklemede', 'warn'], approved: ['Onaylandı', 'success'], rejected: ['Reddedildi', 'danger'] };
const RQ_LV = { over: ['Yetersiz', 'danger'], tight: ['Sıkışık', 'warn'], ok: ['Rahat', 'success'], na: ['Gereken girilmemiş', ''] };

/* ---------------- Kayıt noktaları ---------------- */
NM_EXT.hubTabs.push({ key: 'istek', mod: 'istekler', href: '#/istekler', icon: 'calendar', label: 'İstekler' });
NM_EXT.routes.istekler = (view, r) => renderRequests(view, r[1]);
NM_EXT.notif.request = ['amber', 'calendar'];
Object.assign(NM_EXT.audit, { 'req.period': 'İstek dönemi', 'req.save': 'Nöbet isteği', 'req.delete': 'İstek silindi', 'req.decide': 'İstek kararı', 'req.draw': 'İstek kurası' });
NM_EXT.homeCards.push({ id: 'istekler', mod: 'istekler', title: 'Nöbet istekleri', icon: 'calendar', order: 30, place: 'side', render: rqHomeCard });

/* ---------------- Yardımcılar ---------------- */
/** Listedeki BÜYÜK HARFLİ adları okunur yapar: "DENİZ ŞAHİN" → "Deniz Şahin" */
function rqName(n) {
  const s = String(n || '');
  if (s !== s.toLocaleUpperCase('tr') || !/[A-ZÇĞİÖŞÜ]/.test(s)) return s;
  return s.split(/(\s+)/).map((w) => (w.trim() ? w[0] + w.slice(1).toLocaleLowerCase('tr') : w)).join('');
}
function rqRanges(days) {
  const a = [...new Set(days)].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < a.length; i++) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(i === j ? String(a[i]) : `${a[i]}-${a[j]}`);
    i = j;
  }
  return out.join(', ');
}
const rqDayN = (d) => +String(d).slice(8, 10);
const rqDaysIn = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const rqShort = (d) => { const x = parseDT(d); return x ? `${x.getDate()} ${TR_MONTHS_S[x.getMonth()]}` : d; };
const rqDow = (d) => { const x = parseDT(d); return x ? TR_DAYS_S[x.getDay()] : ''; };
const rqPeriod = () => RQ.periods.find((p) => p.id === RQ.pid) || null;
function rqLeft(deadline) {
  const n = daysUntil(deadline);
  return n < 0 ? 'süre doldu' : n === 0 ? 'bugün son gün' : n === 1 ? 'yarın son gün' : `${n} gün kaldı`;
}
function rqKindBadge(k) { const x = RQ_KIND[k] || RQ_KIND.bosluk; return html`<span class="badge tone-${x.tone}">${x.l}</span>`; }
function rqStBadge(s) { const x = RQ_ST[s] || RQ_ST.pending; return html`<span class="badge ${x[1]}">${x[0]}</span>`; }

/**
 * Serbest metni çözer: "2,3,4 boşluk; 6,7 boşluk; 15-19 yıllık izin", "15,19 arası yıllık izin", "2 3 4 bos", "izin 15-19".
 * Dönen: { map: {gün: tür}, groups: [{kind, days}], warn: [] }
 */
function rqParse(text, ym) {
  const max = rqDaysIn(ym);
  const s = trLower(text).replace(/[’'`´]/g, "'");
  const re = /(\d{1,2})\s*(?:-|–|—|\.\.|ile)\s*(\d{1,2})|(\d{1,2})|(?<![a-zçğıöşü])(yıllık\s*izin|yillik\s*izin|yıllık|yillik|izin|yi|yı|y\.i\.|y\.ı\.|boşluk|bosluk|boşluğu|boş|bos|b)(?![a-zçğıöşü])|(arası|arasi|kadar)|([;\n]+)/g;
  const groups = [];
  let cur = { items: [], kind: null, prefix: false };
  const flush = () => { if (cur.items.length) groups.push({ kind: cur.kind, items: cur.items }); cur = { items: [], kind: null, prefix: false }; };
  for (const m of s.matchAll(re)) {
    if (m[1]) cur.items.push([+m[1], +m[2]]);
    else if (m[3]) cur.items.push([+m[3], +m[3]]);
    else if (m[4]) {
      const k = /^y|izin/.test(m[4]) ? 'izin' : 'bosluk';
      if (!cur.items.length) { cur.kind = k; cur.prefix = true; } else if (cur.prefix) { flush(); cur.kind = k; cur.prefix = true; } else { cur.kind = k; flush(); }
    } else if (m[5]) {
      const n = cur.items.length;
      if (n >= 2 && cur.items[n - 1][0] === cur.items[n - 1][1] && cur.items[n - 2][0] === cur.items[n - 2][1]) {
        const a = cur.items[n - 2][0], b = cur.items[n - 1][0];
        cur.items.splice(n - 2, 2, [a, b]);
      }
    } else flush();
  }
  flush();
  const map = {};
  const warn = [];
  const bad = new Set();
  const out = [];
  groups.forEach((g) => {
    const kind = g.kind || 'bosluk';
    const days = [];
    g.items.forEach(([a0, b0]) => {
      const a = Math.min(a0, b0), b = Math.max(a0, b0);
      for (let d = a; d <= b; d++) { if (d < 1 || d > max) bad.add(d); else { map[d] = kind; days.push(d); } }
    });
    if (!g.kind && days.length) warn.push(`${rqRanges(days)}: tür yazılmadı, Boşluk sayıldı`);
    if (days.length) out.push({ kind, days });
  });
  if (bad.size) warn.push(`${[...bad].sort((x, y) => x - y).join(', ')} bu ayda yok`);
  return { map, groups: out, warn };
}

/* =================================================================== */
/* Sayfa                                                               */
/* =================================================================== */
async function renderRequests(view, sub) {
  RQ.tab = sub === 'pano' ? 'pano' : sub === 'yonetim' ? 'yonetim' : 'benim';
  setHTML(view, html`<div class="rq-page">${hubHead('istek', 'Sonraki aylar için boşluk ve yıllık izin istekleri', isPublisher() ? html`<button class="btn primary" data-act="rq-new">${icon('plus', 'sm')}<span>Dönem aç</span></button>` : '')}
    <div id="rqTop"></div><div id="rqBody">${rqSkel()}</div></div>`);
  try {
    const d = await api('req.periods');
    RQ.periods = d.periods; RQ.can = d.can_manage; RQ.rosters = d.rosters; RQ.mergeDefault = !!d.merge_default; RQ.loaded = true;
  } catch (e) { setHTML($('#rqBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (!RQ.periods.some((p) => p.id === RQ.pid)) {
    const open = RQ.periods.filter((p) => p.open).sort((a, b) => a.ym.localeCompare(b.ym));
    RQ.pid = (open[0] || RQ.periods[0] || {}).id || null;
  }
  if (RQ.tab === 'yonetim' && !RQ.can) RQ.tab = 'benim';
  drawRqTop();
  loadRqTab();
  if (RQ.openNew) { RQ.openNew = false; rqPeriodModal(null); }
}
function rqSkel() { return html`<div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div>`; }

function drawRqTop() {
  const top = $('#rqTop');
  if (!top) return;
  const p = rqPeriod();
  if (!p) {
    setHTML(top, '');
    setHTML($('#rqBody'), html`<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>Açık istek dönemi yok</h3>
      <p class="small">${RQ.can ? 'Sonraki ayı isteğe açın: herkes boşluk ve yıllık izin isteklerini yazar, siz panelden görür ve onaylarsınız.' : 'Sorumlular sonraki ayı isteğe açtığında boşluk ve yıllık izin isteklerini buradan yazabilirsin.'}</p>
      ${RQ.can ? html`<button class="btn primary" data-act="rq-new" style="margin-top:12px">${icon('plus', 'sm')}<span>Dönem aç</span></button>` : ''}</div>`);
    return;
  }
  const others = RQ.periods.length > 1;
  setHTML(top, html`<div class="card rq-per">
      <div class="rq-per-h"><span class="cat-ico tone-${p.open ? 'amber' : 'slate'}">${icon('calendar')}</span>
        <div class="grow"><div class="lr-t">${p.label} istekleri ${p.open ? html`<span class="badge success">Açık</span>` : html`<span class="badge">Kapandı</span>`}</div>
          <div class="lr-s">${p.deadline ? html`Son gün <b>${fmtDate(p.deadline)}</b>${p.open ? ' · ' + rqLeft(p.deadline) : ''}` : ''} · ${p.merge ? 'Tüm birim' : p.roster || 'Tüm listeler'}${p.total ? ` · ${p.people} kişi, ${p.total} gün` : ''}</div></div>
        ${RQ.can ? html`<button class="btn sm" data-act="rq-edit" aria-label="Dönemi düzenle">${icon('edit', 'sm')}<span class="desk-only">Düzenle</span></button>` : ''}</div>
      ${p.note ? html`<div class="rq-per-note small">${icon('info', 'sm')}<span>${p.note}</span></div>` : ''}
      ${others ? html`<div class="rq-per-pick"><select class="select" data-change="rq-period" aria-label="Dönem">${RQ.periods.map((x) => html`<option value="${x.id}" ${x.id === p.id ? raw('selected') : ''}>${x.label}${x.roster ? ' · ' + x.roster : ''} — ${x.open ? 'açık' : 'kapandı'}</option>`)}</select></div>` : ''}
    </div>
    <div class="seg seg-block rq-tabs" role="tablist">
      <button class="${RQ.tab === 'benim' ? 'on' : ''}" data-act="rq-tab" data-t="benim">${icon('user', 'sm')}<span>İsteklerim</span>${p.mine ? html`<span class="count muted">${p.mine}</span>` : ''}</button>
      <button class="${RQ.tab === 'pano' ? 'on' : ''}" data-act="rq-tab" data-t="pano">${icon('users', 'sm')}<span>Pano</span></button>
      ${RQ.can ? html`<button class="${RQ.tab === 'yonetim' ? 'on' : ''}" data-act="rq-tab" data-t="yonetim">${icon('chart', 'sm')}<span>Yönetim</span>${p.pending ? html`<span class="count warn">${p.pending}</span>` : ''}</button>` : ''}
    </div>`);
}
ACT['rq-tab'] = (el) => {
  RQ.tab = el.dataset.t;
  navStep('#/istekler' + (RQ.tab === 'benim' ? '' : '/' + RQ.tab));
  drawRqTop();
  loadRqTab();
};
CHANGE['rq-period'] = (el) => { RQ.pid = +el.value; RQ.mine = null; RQ.board = null; RQ.panel = null; RQ.psel = null; RQ.bsel = null; RQ.target = ''; drawRqTop(); loadRqTab(); };
function loadRqTab() {
  const p = rqPeriod();
  if (!p) return;
  setHTML($('#rqBody'), rqSkel());
  if (RQ.tab === 'pano') loadBoard(); else if (RQ.tab === 'yonetim') loadPanel(); else loadMine();
}
async function rqRefreshPeriods() {
  try { const d = await api('req.periods'); RQ.periods = d.periods; drawRqTop(); } catch (e) { /* */ }
}

/* =================================================================== */
/* İsteklerim                                                          */
/* =================================================================== */
async function loadMine() {
  const t = ++RQ.tok;
  let d;
  try { d = await api('req.mine', { period_id: RQ.pid, name: RQ.target }); } catch (e) { setHTML($('#rqBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (t !== RQ.tok || RQ.tab !== 'benim') return;
  RQ.mine = d;
  rqInitDraft();
  drawMine();
}
function rqInitDraft() {
  RQ.draft = new Map(RQ.mine.items.map((x) => [x.date, { kind: x.kind, note: x.note || '' }]));
  RQ.rosterSel = RQ.mine.roster.id;
  RQ.preview = null;
}
function rqDirty() {
  const saved = new Map(RQ.mine.items.map((x) => [x.date, x]));
  let n = 0;
  RQ.draft.forEach((v, k) => { const s = saved.get(k); if (!s || s.kind !== v.kind || (s.note || '') !== (v.note || '')) n++; });
  saved.forEach((_, k) => { if (!RQ.draft.has(k)) n++; });
  if ((RQ.rosterSel || null) !== (RQ.mine.roster.id || null) && RQ.draft.size) n++;
  return n;
}
function drawMine() {
  const d = RQ.mine;
  const body = $('#rqBody');
  if (!body || !d) return;
  const p = d.period;
  const self = d.target.self;
  setHTML(body, html`
    ${d.people ? html`<div class="card card-pad rq-who"><div class="field"><label>Kimin için</label>
      <select class="select" data-change="rq-target"><option value="">Kendim (${S.me.name})</option>${d.people.filter((x) => !x.me).map((x) => html`<option value="${x.name}" ${!self && avKey(x.name) === avKey(d.target.name) ? raw('selected') : ''}>${rqName(x.name)}${x.account ? '' : ' · hesabı yok'}${x.roster ? ' · ' + x.roster : ''}</option>`)}</select>
      <span class="hint">Hesabı olmayan ya da isteğini size ileten kişiler adına girebilirsiniz.</span></div></div>` : ''}
    ${!d.can_edit ? html`<div class="form-note warn rq-gap">${icon('lock', 'sm')}<span>${p.label} istek süresi doldu${p.deadline ? ' (' + fmtDate(p.deadline) + ')' : ''}. İstekler artık değiştirilemez; değişiklik için sorumluya yazın.</span></div>` : ''}
    <div class="rq-mine">
      <div class="rq-col">
        ${d.can_edit ? html`<div class="card card-pad rq-text">
          <label class="label" for="rqTxt">${icon('edit', 'sm')} Yazarak ekle</label>
          <div class="rq-text-row"><input class="input" id="rqTxt" data-input="rq-txt" autocomplete="off" placeholder="Örn: 2,3,4 boşluk; 15-19 yıllık izin"><button class="btn primary" data-act="rq-apply" id="rqApply" disabled>Ekle</button></div>
          <div id="rqPrev" class="rq-prev"><span class="tiny faint">Gün numaralarını ve türünü yaz: <b>boşluk</b> (nöbet istemiyorum) ya da <b>yıllık izin</b>. Art arda günler için 15-19 ya da “15, 19 arası” yaz.</span></div>
        </div>` : ''}
        <div class="card rq-calc" id="rqCal"></div>
      </div>
      <div class="rq-col">
        <div class="card rq-rost card-pad" id="rqRost"></div>
        <div class="card" id="rqList"></div>
      </div>
    </div>
    <div id="rqSave" class="rq-save hidden"></div>`);
  drawRqRoster();
  drawRqCal();
  drawRqList();
  drawRqSave();
}
function drawRqRoster() {
  const box = $('#rqRost');
  const d = RQ.mine;
  if (!box || !d) return;
  const ro = d.roster;
  const nm = (id) => (d.choices.find((c) => c.id === id) || {}).name || '';
  let inner;
  if (ro.merged) inner = html`<div class="small muted">${icon('users', 'sm')} İstekler tüm birim için toplanır; hangi listede (basamakta) çalışacağınızı sorumlu belirler.</div>`;
  else if (ro.fixed) inner = html`<div class="small">${icon('table', 'sm')} Liste: <b>${ro.name}</b></div>`;
  else if (d.choices.length <= 1 && ro.id) inner = html`<div class="small">${icon('table', 'sm')} Liste: <b>${nm(ro.id)}</b></div>`;
  else if (ro.found && RQ.rosterSel) inner = html`<div class="row between wrap"><div class="small">${icon('table', 'sm')} ${d.target.self ? 'Listen' : 'Listesi'}: <b>${nm(RQ.rosterSel)}</b> <span class="tiny faint">${ro.auto ? '(adından bulundu)' : ''}</span></div>${d.can_edit ? html`<button class="btn sm ghost" data-act="rq-roster-pick">Değiştir</button>` : ''}</div>`;
  else inner = html`<div class="field"><label>${d.target.self ? 'Hangi listedesin?' : 'Hangi listede?'}</label><select class="select" data-change="rq-roster" ${d.can_edit ? '' : raw('disabled')}><option value="">Seçin</option>${d.choices.map((c) => html`<option value="${c.id}" ${c.id === RQ.rosterSel ? raw('selected') : ''}>${c.name}</option>`)}</select>
    <span class="hint">${ro.found ? '' : 'Adın listelerde bulunamadı; isteklerin doğru panoya düşmesi için listeni seç.'}</span></div>`;
  setHTML(box, inner);
}
ACT['rq-roster-pick'] = () => { RQ.mine.roster.found = false; drawRqRoster(); };
CHANGE['rq-roster'] = (el) => { RQ.rosterSel = el.value ? +el.value : null; drawRqSave(); };
CHANGE['rq-target'] = async (el) => {
  const v = el.value;
  if (rqDirty() && !(await confirmDialog({ title: 'Kaydedilmemiş değişiklikler silinsin mi?', text: 'Başka bir kişiye geçerseniz bu kişi için yaptığınız değişiklikler kaybolur.', ok: 'Devam et', danger: true }))) { el.value = RQ.target; return; }
  RQ.target = v; setHTML($('#rqBody'), rqSkel()); loadMine();
};

function drawRqCal() {
  const box = $('#rqCal');
  const d = RQ.mine;
  if (!box || !d) return;
  const p = d.period;
  const [y, m] = p.ym.split('-').map(Number);
  const days = rqDaysIn(p.ym);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const saved = new Map(d.items.map((x) => [x.date, x]));
  const prev = RQ.preview ? RQ.preview.map : {};
  const today = ymd(new Date());
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="cal-d empty" aria-hidden="true"></span>`);
  for (let dd = 1; dd <= days; dd++) {
    const ds = `${p.ym}-${pad(dd)}`;
    const x = RQ.draft.get(ds);
    const s = saved.get(ds);
    const st = x && s && s.kind === x.kind ? s.status : x ? 'new' : '';
    const wd = new Date(y, m - 1, dd).getDay();
    const cls = ['cal-d', 'rq-d', x ? 'k-' + x.kind : '', st ? 'st-' + st : '', prev[dd] ? 'pv' : '', wd === 0 || wd === 6 ? 'we' : '', ds === today ? 'today' : '', s && s.conflict ? 'cf' : ''].filter(Boolean).join(' ');
    const label = `${dd} ${TR_MONTHS[m - 1]} ${TR_DAYS[wd]}${x ? ' · ' + RQ_KIND[x.kind].l : ''}${st && st !== 'new' ? ' · ' + RQ_ST[st][0] : ''}`;
    cells.push(html`<button type="button" class="${cls}" data-act="rq-tap" data-d="${ds}" aria-label="${label}" ${d.can_edit ? '' : raw('disabled')}><span class="cd-n">${dd}</span>${x ? html`<span class="cd-c">${RQ_KIND[x.kind].s}</span>` : prev[dd] ? html`<span class="cd-c">${RQ_KIND[prev[dd]].s}</span>` : ''}${st === 'approved' ? html`<i class="rq-mk ok">${icon('check')}</i>` : st === 'rejected' ? html`<i class="rq-mk no">${icon('x')}</i>` : st === 'new' ? html`<i class="rq-mk nw"></i>` : ''}</button>`);
  }
  const cnt = { bosluk: 0, izin: 0 };
  RQ.draft.forEach((v) => { cnt[v.kind]++; });
  setHTML(box, html`<div class="cal-head"><b>${TR_MONTHS[m - 1]} ${y}</b><span class="small muted">${cnt.bosluk ? html`<b>${cnt.bosluk}</b> boşluk` : ''}${cnt.bosluk && cnt.izin ? ' · ' : ''}${cnt.izin ? html`<b>${cnt.izin}</b> yıllık izin` : ''}${!cnt.bosluk && !cnt.izin ? 'Henüz istek yok' : ''}</span></div>
    ${d.can_edit ? html`<p class="tiny faint rq-cal-hint">Güne dokun: <b>Boşluk</b> → <b>Yıllık izin</b> → kaldır</p>` : ''}
    <div class="cal-grid" role="grid">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => html`<span class="cal-w">${w}</span>`)}${cells}</div>
    <div class="cal-legend"><span><span class="rq-sw k-bosluk">B</span>Boşluk</span><span><span class="rq-sw k-izin">Yİ</span>Yıllık izin</span><span><i class="rq-mk ok static">${icon('check')}</i>Onaylandı</span><span><i class="rq-mk no static">${icon('x')}</i>Reddedildi</span></div>`);
}
ACT['rq-tap'] = (el) => {
  const d = el.dataset.d;
  const x = RQ.draft.get(d);
  if (!x) RQ.draft.set(d, { kind: 'bosluk', note: '' });
  else if (x.kind === 'bosluk') RQ.draft.set(d, { kind: 'izin', note: x.note });
  else RQ.draft.delete(d);
  drawRqCal(); drawRqList(); drawRqSave();
};
CHANGE['rq-txt'] = (el) => {
  const v = el.value.trim();
  const prev = $('#rqPrev');
  const btn = $('#rqApply');
  RQ.preview = v ? rqParse(v, RQ.mine.period.ym) : null;
  const pv = RQ.preview;
  if (btn) btn.disabled = !pv || !pv.groups.length;
  if (prev) {
    if (!pv) setHTML(prev, html`<span class="tiny faint">Gün numaralarını ve türünü yaz: <b>boşluk</b> ya da <b>yıllık izin</b>.</span>`);
    else {
      const byKind = { bosluk: [], izin: [] };
      Object.entries(pv.map).forEach(([dd, k]) => byKind[k].push(+dd));
      setHTML(prev, html`${Object.entries(byKind).filter(([, a]) => a.length).map(([k, a]) => html`<span class="rq-chip k-${k}"><b>${rqRanges(a)}</b> ${RQ_KIND[k].l}</span>`)}
        ${!pv.groups.length ? html`<span class="tiny faint">Gün bulunamadı. Örn: 2,3,4 boşluk</span>` : html`<span class="tiny faint">${Object.keys(pv.map).length} gün · “Ekle” deyince takvime işlenir</span>`}
        ${pv.warn.map((w) => html`<span class="tiny err-text rq-warn">${icon('alert', 'sm')}${w}</span>`)}`);
    }
  }
  drawRqCal();
};
ACT['rq-apply'] = () => {
  const pv = RQ.preview;
  if (!pv) return;
  const ym = RQ.mine.period.ym;
  Object.entries(pv.map).forEach(([dd, k]) => {
    const ds = `${ym}-${pad(+dd)}`;
    const x = RQ.draft.get(ds);
    RQ.draft.set(ds, { kind: k, note: x ? x.note : '' });
  });
  RQ.preview = null;
  const inp = $('#rqTxt');
  if (inp) { inp.value = ''; CHANGE['rq-txt'](inp); }
  drawRqCal(); drawRqList(); drawRqSave();
  toast('Takvime eklendi · kaydetmeyi unutma');
};

/** Ardışık, aynı tür/durum/notlu günleri tek satırda toplar */
function rqGroups(entries) {
  const out = [];
  entries.sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
    const last = out[out.length - 1];
    if (last && last.kind === e.kind && last.status === e.status && (last.note || '') === (e.note || '') && (last.reason || '') === (e.reason || '') && rqDayN(e.date) === rqDayN(last.dates[last.dates.length - 1]) + 1) last.dates.push(e.date);
    else out.push({ ...e, dates: [e.date] });
  });
  return out;
}
function drawRqList() {
  const box = $('#rqList');
  const d = RQ.mine;
  if (!box || !d) return;
  const saved = new Map(d.items.map((x) => [x.date, x]));
  const list = [...RQ.draft.entries()].map(([date, v]) => {
    const s = saved.get(date);
    const same = s && s.kind === v.kind;
    return { date, kind: v.kind, note: v.note || '', status: same ? s.status : 'new', reason: same && s.status === 'rejected' ? s.reason : '', conflict: same ? s.conflict : null };
  });
  const groups = rqGroups(list);
  const mon = TR_MONTHS_S[+d.period.ym.slice(5, 7) - 1];
  setHTML(box, html`<div class="card-head"><h3>${d.target.self ? 'İsteklerim' : rqName(d.target.name) + ' — istekler'}</h3><span class="tiny faint">${list.length} gün</span></div>
    <div class="list">${groups.length ? groups.map((g) => html`<div class="list-row rq-g st-${g.status}">
      <span class="rq-sw k-${g.kind} big">${RQ_KIND[g.kind].s}</span>
      <div class="grow" style="min-width:0">
        <div class="lr-t">${rqRanges(g.dates.map(rqDayN))} ${mon} <span class="muted small">· ${RQ_KIND[g.kind].l}${g.dates.length > 1 ? ` · ${g.dates.length} gün` : ''}</span></div>
        <div class="row wrap rq-g-b">${g.status === 'new' ? html`<span class="badge info">Kaydedilmedi</span>` : rqStBadge(g.status)}${g.conflict ? html`<span class="badge danger">${icon('alert', 'sm')}Listede nöbet var (${g.conflict})</span>` : ''}</div>
        ${g.status === 'rejected' && g.reason ? html`<div class="rq-reason small">${icon('info', 'sm')}<span><b>Gerekçe:</b> ${g.reason}</span></div>` : ''}
        ${d.can_edit ? html`<input class="input rq-note" maxlength="200" placeholder="Kısa not (isteğe bağlı)" value="${g.note}" data-input="rq-note" data-dates="${g.dates.join(',')}">` : g.note ? html`<div class="tiny faint">Not: ${g.note}</div>` : ''}
      </div>
      ${d.can_edit ? html`<button class="btn sm icon ghost" data-act="rq-rm" data-dates="${g.dates.join(',')}" aria-label="Kaldır">${icon('trash', 'sm')}</button>` : ''}
    </div>`) : html`<div class="list-row small muted">${d.can_edit ? 'Henüz isteğin yok. Takvimde güne dokun ya da yukarıya yaz.' : 'Bu dönemde isteğin yok.'}</div>`}</div>
    <div class="rq-foot tiny faint">${icon('lock', 'sm')} Ret gerekçesini yalnızca sen ve sorumlular görür. Panoda herkes yalnızca günleri ve durumu görür.</div>`);
}
CHANGE['rq-note'] = (el) => {
  el.dataset.dates.split(',').forEach((ds) => { const x = RQ.draft.get(ds); if (x) x.note = el.value.slice(0, 200); });
  drawRqSave();
};
ACT['rq-rm'] = (el) => { el.dataset.dates.split(',').forEach((ds) => RQ.draft.delete(ds)); drawRqCal(); drawRqList(); drawRqSave(); };
function drawRqSave() {
  const box = $('#rqSave');
  if (!box || !RQ.mine) return;
  const n = rqDirty();
  box.classList.toggle('hidden', !n || !RQ.mine.can_edit);
  setHTML(box, n ? html`<div class="rq-save-in"><span class="small"><b>${n}</b> kaydedilmemiş değişiklik</span><button class="btn ghost sm" data-act="rq-undo">Vazgeç</button><button class="btn primary" data-act="rq-save" id="rqSaveBtn">${icon('check', 'sm')}<span>Kaydet</span></button></div>` : '');
}
ACT['rq-undo'] = () => { rqInitDraft(); drawMine(); };
ACT['rq-save'] = (el) => busy(el, async () => {
  const items = [...RQ.draft.entries()].map(([date, v]) => ({ date, kind: v.kind, note: v.note || '' }));
  try {
    const res = await api('req.save', { period_id: RQ.pid, items, name: RQ.target, roster_id: RQ.rosterSel || null });
    RQ.mine = res;
    rqInitDraft();
    drawMine();
    const c = res.changes || {};
    toast(c.added || c.changed || c.removed ? `Kaydedildi · ${items.length} gün` : 'Değişiklik yok');
    rqRefreshPeriods();
  } catch (e) { toast(e.message, 'err'); }
});

/* =================================================================== */
/* Pano (herkes)                                                       */
/* =================================================================== */
async function loadBoard() {
  const t = ++RQ.tok;
  let d;
  try { d = await api('req.board', { period_id: RQ.pid }); } catch (e) { setHTML($('#rqBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (t !== RQ.tok || RQ.tab !== 'pano') return;
  RQ.board = d;
  drawBoard();
}
/** Kişinin isteklerini kısa çiplere çevirir: "2-4 B", "15-19 Yİ" (durum rengiyle) */
function rqChips(items) {
  return rqGroups(items.map((x) => ({ ...x }))).map((g) => html`<span class="rq-chip k-${g.kind} st-${g.status}" title="${RQ_KIND[g.kind].l} · ${RQ_ST[g.status][0]}">${g.status === 'approved' ? icon('check', 'sm') : g.status === 'rejected' ? icon('x', 'sm') : ''}<b>${rqRanges(g.dates.map(rqDayN))}</b> ${RQ_KIND[g.kind].s}</span>`);
}
function drawBoard() {
  const d = RQ.board;
  const body = $('#rqBody');
  if (!body || !d) return;
  const p = d.period;
  const total = d.people.reduce((n, x) => n + x.items.length, 0);
  const q = avKey(RQ.bq);
  const ppl = q ? d.people.filter((x) => avKey(rqName(x.name)).includes(q)) : d.people;
  const seg = html`<div class="row between wrap rq-bar"><div class="seg"><button class="${RQ.bview === 'kisi' ? 'on' : ''}" data-act="rq-bview" data-v="kisi">${icon('list', 'sm')}<span>Kişiler</span></button><button class="${RQ.bview === 'takvim' ? 'on' : ''}" data-act="rq-bview" data-v="takvim">${icon('calendar', 'sm')}<span>Takvim</span></button></div>
    <span class="small muted">${d.people.length} kişi · ${total} gün</span></div>`;
  if (!d.people.length) {
    setHTML(body, html`${seg}<div class="card empty"><div class="e-ico">${icon('users', 'lg')}</div><h3>Henüz istek yok</h3><p class="small">${p.label} için girilen istekler burada herkese görünür.</p></div>`);
    return;
  }
  if (RQ.bview === 'kisi') {
    setHTML(body, html`${seg}
      <div class="card"><div class="card-head rq-bq"><input class="input" type="search" placeholder="Kişi ara" value="${RQ.bq}" data-input="rq-bq" aria-label="Kişi ara"></div>
      <div class="list" id="rqBList">${rqBoardRows(ppl)}</div>
      <div class="cal-legend"><span><span class="rq-sw k-bosluk">B</span>Boşluk</span><span><span class="rq-sw k-izin">Yİ</span>Yıllık izin</span><span>${icon('check', 'sm')} onaylandı</span><span class="rq-strike">reddedildi</span></div></div>`);
    return;
  }
  // Takvim: gün gün kim istedi
  const [y, m] = p.ym.split('-').map(Number);
  const days = rqDaysIn(p.ym);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const by = {};
  d.people.forEach((x) => x.items.forEach((it) => { (by[it.date] = by[it.date] || []).push({ name: x.name, me: x.me, ...it }); }));
  const maxN = Math.max(1, ...Object.values(by).map((a) => a.filter((x) => x.status !== 'rejected').length));
  if (!RQ.bsel || !RQ.bsel.startsWith(p.ym)) RQ.bsel = Object.keys(by).sort()[0] || `${p.ym}-01`;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="cal-d empty" aria-hidden="true"></span>`);
  for (let dd = 1; dd <= days; dd++) {
    const ds = `${p.ym}-${pad(dd)}`;
    const a = (by[ds] || []).filter((x) => x.status !== 'rejected');
    const b = a.filter((x) => x.kind === 'bosluk').length, iz = a.length - b;
    const lv = a.length ? Math.min(4, Math.ceil((a.length / maxN) * 4)) : 0;
    const wd = new Date(y, m - 1, dd).getDay();
    cells.push(html`<button type="button" class="cal-d rq-bd lv${lv} ${ds === RQ.bsel ? 'sel' : ''} ${wd === 0 || wd === 6 ? 'we' : ''} ${(d.holidays || {})[ds] ? 'holiday' : ''}" data-act="rq-bday" data-d="${ds}" aria-label="${dd} ${TR_MONTHS[m - 1]}: ${a.length} istek"><span class="cd-n">${dd}</span>${a.length ? html`<span class="cd-c">${a.length}</span><span class="rq-bd-k">${b ? html`<i class="k-bosluk"></i>` : ''}${iz ? html`<i class="k-izin"></i>` : ''}</span>` : ''}${a.some((x) => x.me) ? html`<i class="rq-me-dot"></i>` : ''}</button>`);
  }
  const sel = (by[RQ.bsel] || []).slice().sort((a, b) => (a.status === 'rejected') - (b.status === 'rejected') || a.kind.localeCompare(b.kind) || rqName(a.name).localeCompare(rqName(b.name), 'tr'));
  setHTML(body, html`${seg}<div class="cal-wrap">
    <div class="card cal-card"><div class="cal-head"><b>${TR_MONTHS[m - 1]} ${y}</b><span class="tiny faint">sayı: o gün isteyen kişi</span></div>
      <div class="cal-grid" role="grid">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => html`<span class="cal-w">${w}</span>`)}${cells}</div>
      <div class="cal-legend"><span><i class="rq-dot k-bosluk"></i>Boşluk</span><span><i class="rq-dot k-izin"></i>Yıllık izin</span><span><i class="rq-me-dot static"></i>Senin isteğin</span></div></div>
    <div class="card"><div class="card-head"><h3>${dateLabel(RQ.bsel)}</h3><span class="tiny faint">${sel.filter((x) => x.status !== 'rejected').length} kişi</span></div>
      <div class="list">${sel.length ? sel.map((x) => html`<div class="list-row ${x.status === 'rejected' ? 'rq-dim' : ''}">${pAvatar(rqName(x.name), 'sm', null, x.user_id)}<div class="grow" style="min-width:0"><div class="lr-t ellipsis">${pName(rqName(x.name), x.user_id)}${x.me ? html` <span class="tiny faint">(sen)</span>` : ''}</div></div>${rqKindBadge(x.kind)}${rqStBadge(x.status)}</div>`)
        : html`<div class="list-row small muted">Bu gün için istek yok.</div>`}</div></div></div>`);
}
function rqBoardRows(ppl) {
  if (!ppl.length) return html`<div class="list-row small muted">Eşleşen kişi yok.</div>`;
  return ppl.map((x) => html`<div class="list-row rq-brow ${x.me ? 'me' : ''}">${pAvatar(rqName(x.name), 'sm', null, x.user_id)}
    <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${pName(rqName(x.name), x.user_id)}${x.me ? html` <span class="badge brand">Sen</span>` : ''}</div>
      <div class="rq-chips">${rqChips(x.items)}</div>${x.roster ? html`<div class="tiny faint">${x.roster}</div>` : ''}</div>
    <span class="tiny faint rq-n">${x.items.filter((i) => i.status !== 'rejected').length} gün</span></div>`);
}
ACT['rq-bview'] = (el) => { RQ.bview = el.dataset.v; drawBoard(); };
ACT['rq-bday'] = (el) => { RQ.bsel = el.dataset.d; drawBoard(); };
CHANGE['rq-bq'] = (el) => {
  RQ.bq = el.value;
  const q = avKey(RQ.bq);
  setHTML($('#rqBList'), rqBoardRows(q ? RQ.board.people.filter((x) => avKey(rqName(x.name)).includes(q)) : RQ.board.people));
};

/* =================================================================== */
/* Yönetim paneli (yayıncı)                                            */
/* =================================================================== */
async function loadPanel() {
  const t = ++RQ.tok;
  let d;
  try { d = await api('req.panel', { period_id: RQ.pid }); } catch (e) { setHTML($('#rqBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (t !== RQ.tok || RQ.tab !== 'yonetim') return;
  rqSetPanel(d);
  drawPanel();
}
function rqSetPanel(d) {
  RQ.panel = d;
  if (!d.sides.some((s) => s.key === RQ.side)) {
    const withReq = d.sides.find((s) => s.days.some((x) => x.req));
    RQ.side = (withReq || d.sides[0] || {}).key || null;
  }
  const sd = rqSide();
  if (sd && (!RQ.psel || !RQ.psel.startsWith(d.period.ym))) {
    const top = sd.days.slice().sort((a, b) => b.req - a.req || a.d - b.d)[0];
    RQ.psel = top ? top.date : null;
  }
}
const rqSide = () => (RQ.panel ? RQ.panel.sides.find((s) => s.key === RQ.side) : null) || null;
const rqSideName = (k) => ((RQ.panel && RQ.panel.sides.find((s) => s.key === k)) || {}).name || 'Diğer';
function drawPanel() {
  const d = RQ.panel;
  const body = $('#rqBody');
  if (!body || !d) return;
  const t = d.totals;
  const sd = rqSide();
  const kpi = (v, l, tone) => html`<div class="rq-kpi"><b class="${tone || ''}">${v}</b><span>${l}</span></div>`;
  setHTML(body, html`
    <div class="card rq-kpis">${kpi(t.people, 'kişi')}${kpi(t.requests, 'gün')}${kpi(t.pending, 'beklemede', t.pending ? 'warn' : '')}${kpi(t.approved, 'onaylı', 'ok')}${kpi(t.rejected, 'reddedildi', t.rejected ? 'no' : '')}</div>
    <div class="row wrap rq-acts">
      ${t.pending ? html`<button class="btn sm" data-act="rq-approve-all">${icon('checkCircle', 'sm')}<span>Bekleyenlerin tümünü onayla</span></button>` : ''}
      <button class="btn sm" data-act="rq-xlsx" id="rqXlsx" ${t.requests ? '' : raw('disabled')}>${icon('download', 'sm')}<span>Excel’e aktar</span></button>
    </div>
    ${!d.needs_set ? html`<div class="form-note warn rq-gap">${icon('info', 'sm')}<span>Gereken nöbetçi sayıları girilmemiş; renkler yalnızca istek yoğunluğunu gösterir. <a href="#/yonetim/ayarlar/nobet">Ayarlar › Nöbet</a>’ten blok başına gündüz/gece sayılarını girin.</span></div>` : ''}
    ${d.conflicts.length ? html`<div class="card rq-conf"><div class="card-head"><h3>${icon('alert', 'sm')} Listeyle uyumsuz onaylı istekler</h3><span class="badge danger">${d.conflicts.length}</span></div>
      <div class="list">${d.conflicts.map((c) => html`<div class="list-row"><span class="rq-sw k-${c.kind}">${RQ_KIND[c.kind].s}</span><div class="grow"><div class="lr-t">${rqName(c.name)}</div><div class="lr-s">${rqShort(c.date)} ${rqDow(c.date)} · onaylı ${RQ_KIND[c.kind].l.toLocaleLowerCase('tr')} ama listede <b>${c.code}</b> nöbeti var</div></div></div>`)}</div></div>` : ''}
    ${d.sides.length > 1 ? html`<div class="seg rq-sides">${d.sides.map((s) => { const n = s.days.reduce((a, x) => a + x.req, 0); return html`<button class="${s.key === RQ.side ? 'on' : ''}" data-act="rq-side" data-k="${s.key}">${s.name}${n ? html`<span class="count muted">${n}</span>` : ''}</button>`; })}</div>` : ''}
    ${sd ? html`<div class="rq-panel">
      <div class="rq-col">
        <div class="card" id="rqHeat"></div>
        <div class="card" id="rqPile"></div>
      </div>
      <div class="rq-col"><div class="card" id="rqDay"></div></div>
    </div>` : html`<div class="card empty"><p class="small">Bu dönem için liste bulunamadı. Taraflar Taraf sekmesinden, listeler Excel liste sekmesinden tanımlanır.</p></div>`}
    <div class="card" id="rqPeople"></div>
    ${d.draws.length ? html`<div class="card"><div class="card-head"><h3>${icon('layers', 'sm')} Kura kayıtları</h3></div><div class="list">${d.draws.map((x) => html`<div class="list-row"><div class="grow"><div class="lr-t">${rqShort(x.date)} · ${rqSideName(x.side)}</div><div class="lr-s">Adaylar: ${(x.cands || []).map(rqName).join(', ')} → ret önerisi: <b>${(x.picked || []).map(rqName).join(', ')}</b> · ${x.by || ''} · ${fmtRel(x.at)}</div></div></div>`)}</div></div>` : ''}`);
  drawHeat(); drawPile(); drawDay(); drawPeople();
}
ACT['rq-side'] = (el) => { RQ.side = el.dataset.k; RQ.psel = null; RQ.checked.clear(); rqSetPanel(RQ.panel); drawPanel(); };

function drawHeat() {
  const box = $('#rqHeat');
  const sd = rqSide();
  if (!box || !sd) return;
  const ym = RQ.panel.period.ym;
  const [y, m] = ym.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const maxR = Math.max(1, ...sd.days.map((x) => x.req));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="rq-h empty" aria-hidden="true"></span>`);
  sd.days.forEach((x) => {
    const lv = x.level === 'na' ? 'na i' + (x.req ? Math.min(4, Math.ceil((x.req / maxR) * 4)) : 0) : x.level;
    const title = `${x.d} ${TR_MONTHS[m - 1]}: ${x.req} istek (${x.b} boşluk, ${x.i} yıllık izin) · müsait ${x.avail}/${sd.people}${x.need_n ? ` · gereken ${x.need.day} gündüz + ${x.need.night} gece` : ''}${x.hol ? ' · ' + x.hol : ''}`;
    cells.push(html`<button type="button" class="rq-h lv-${lv} ${x.req ? '' : 'z'} ${x.date === RQ.psel ? 'sel' : ''} ${x.we ? 'we' : ''} ${x.need_draw ? 'draw' : ''}" data-act="rq-pday" data-d="${x.date}" title="${title}" aria-label="${title}">
      <span class="rh-d">${x.d}</span><span class="rh-c">${x.req || ''}</span><span class="rh-a">${x.need_n || x.req ? `${x.avail}/${sd.people}` : ''}</span>${x.excess ? html`<i class="rh-x">-${x.excess}</i>` : ''}</button>`);
  });
  setHTML(box, html`<div class="card-head"><h3>${icon('calendar', 'sm')} ${sd.name} · ${TR_MONTHS[m - 1]}</h3><span class="tiny faint">${sd.people} kişi${sd.units && sd.units.length ? ' · ' + sd.units.join(', ') : ''}</span></div>
    <div class="rq-heat">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => html`<span class="cal-w">${w}</span>`)}${cells}</div>
    <div class="cal-legend rq-hl">${sd.need_set ? html`<span><i class="rq-lg lv-ok"></i>Rahat</span><span><i class="rq-lg lv-tight"></i>Sıkışık (müsait &lt; 2 × gereken)</span><span><i class="rq-lg lv-over"></i>Yetersiz (müsait &lt; gereken)</span>`
      : html`<span><i class="rq-lg lv-na i3"></i>Koyu = çok istek</span>`}<span class="faint">Ortadaki sayı: istek · alttaki: müsait/kişi${sd.need_set ? ' · −n: reddedilmesi gereken' : ''}</span></div>
    ${!sd.need_set && RQ.panel.needs_set ? html`<p class="tiny faint rq-pad">Bu tarafın blokları için gereken sayı girilmemiş.</p>` : ''}`);
}
ACT['rq-pday'] = (el) => { RQ.psel = el.dataset.d; RQ.checked.clear(); drawHeat(); drawDay(); drawPile(); if (window.innerWidth < 900) { const c = $('#rqDay'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };

function drawPile() {
  const box = $('#rqPile');
  const sd = rqSide();
  if (!box || !sd) return;
  const rank = { over: 0, tight: 1, na: 2, ok: 3 };
  const top = sd.days.filter((x) => x.req).sort((a, b) => b.req - a.req || rank[a.level] - rank[b.level] || a.d - b.d).slice(0, 8);
  setHTML(box, html`<div class="card-head"><h3>${icon('chart', 'sm')} Yığılma</h3><span class="tiny faint">en çok istenen günler</span></div>
    <div class="list">${top.length ? top.map((x) => html`<button type="button" class="list-row rq-pile ${x.date === RQ.psel ? 'on' : ''}" data-act="rq-pday" data-d="${x.date}">
      <span class="rq-pile-d lv-${x.level === 'na' ? 'na i3' : x.level}"><b>${x.d}</b><small>${rqDow(x.date)}</small></span>
      <div class="grow" style="min-width:0"><div class="rq-bar-o"><i style="width:${Math.round((x.req / Math.max(1, sd.people)) * 100)}%"></i></div>
        <div class="lr-s">${x.req} istek (${x.b} B · ${x.i} Yİ) · müsait ${x.avail}/${sd.people}${x.need_n ? ` · gereken ${x.need_n}` : ''}</div></div>
      ${x.excess ? html`<span class="badge danger">${x.excess} fazla</span>` : x.level !== 'na' ? html`<span class="badge ${RQ_LV[x.level][1]}">${RQ_LV[x.level][0]}</span>` : ''}</button>`)
      : html`<div class="list-row small muted">Bu tarafta henüz istek yok.</div>`}</div>`);
}

function drawDay() {
  const box = $('#rqDay');
  const sd = rqSide();
  if (!box || !sd) return;
  const x = sd.days.find((z) => z.date === RQ.psel);
  if (!x) { setHTML(box, html`<div class="list-row small muted">Takvimden bir gün seçin.</div>`); return; }
  const P = new Map(RQ.panel.people.map((p) => [p.key, p]));
  const order = x.order || [];
  const rej = x.rejected || [];
  const ck = (id) => (RQ.checked.has(id) ? raw('checked') : '');
  const lvl = x.level === 'na' ? null : RQ_LV[x.level];
  setHTML(box, html`<div class="card-head"><div style="min-width:0"><h3>${dateLabel(x.date)}</h3><div class="tiny faint">${sd.name}${x.hol ? ' · ' + x.hol : ''}</div></div>${lvl ? html`<span class="badge ${lvl[1]}">${lvl[0]}</span>` : ''}</div>
    <div class="rq-dstats">
      <div><b>${x.req}</b><span>istek</span></div><div><b>${x.avail}<small>/${sd.people}</small></b><span>müsait</span></div>
      <div><b>${x.need_n || '—'}</b><span>${x.need_n ? `gereken (${x.need.day} gündüz + ${x.need.night} gece)` : 'gereken girilmemiş'}</span></div>
    </div>
    ${x.excess ? html`<div class="form-note warn rq-pad2">${icon('alert', 'sm')}<span>Müsait kişi gerekenden az: <b>${x.excess}</b> isteğin reddedilmesi önerilir.${x.need_draw ? html` Sınırda eşit durumda ${order.filter((o) => o.tie).length} kişi var; <b>${x.draw_pick}</b> kişi için kura çekin.` : ''}</span></div>` : ''}
    <div class="list">${order.length ? order.map((o, i) => { const pp = P.get(o.key) || { n: 0, past: { approved: 0, rejected: 0 } }; return html`<label class="list-row rq-o ${o.suggest ? 'sug' : ''}">
      <input type="checkbox" data-change="rq-ck" value="${o.id}" ${ck(o.id)}><span class="rq-rank">${i + 1}</span>
      <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${rqName(o.name)}</div>
        <div class="lr-s">bu ay ${pp.n} gün · geçmişte ${pp.past.approved} onay, ${pp.past.rejected} ret</div>
        <div class="row wrap rq-g-b">${rqKindBadge(o.kind)}${rqStBadge(o.status)}${o.suggest ? html`<span class="badge danger">${o.drawn ? 'Kurayla ret önerisi' : 'Ret önerisi'}</span>` : ''}${o.tie ? html`<span class="badge info">Kura</span>` : ''}</div></div></label>`; })
      : html`<div class="list-row small muted">Bu gün için bekleyen ya da onaylı istek yok.</div>`}
      ${rej.length ? html`<div class="sec-label">Reddedilenler</div>${rej.map((o) => html`<label class="list-row rq-o rq-dim"><input type="checkbox" data-change="rq-ck" value="${o.id}" ${ck(o.id)}><div class="grow"><div class="lr-t">${rqName(o.name)}</div></div>${rqKindBadge(o.kind)}</label>`)}` : ''}
    </div>
    ${order.length || rej.length ? html`<div class="rq-dacts">
      <div class="row wrap"><button class="btn sm ghost" data-act="rq-ck-all">Tümünü seç</button>${order.some((o) => o.suggest) ? html`<button class="btn sm ghost" data-act="rq-ck-sug">Önerileri seç</button>` : ''}${x.need_draw ? html`<button class="btn sm" data-act="rq-draw" data-d="${x.date}">${icon('layers', 'sm')}<span>Kura çek</span></button>` : ''}</div>
      <div class="row wrap"><button class="btn sm" data-act="rq-dec" data-s="approved" ${RQ.checked.size ? '' : raw('disabled')}>${icon('check', 'sm')}<span>Onayla</span></button><button class="btn sm danger" data-act="rq-dec" data-s="rejected" ${RQ.checked.size ? '' : raw('disabled')}>${icon('x', 'sm')}<span>Reddet</span></button><button class="btn sm ghost" data-act="rq-dec" data-s="pending" ${RQ.checked.size ? '' : raw('disabled')}>Beklemeye al</button></div>
      <p class="tiny faint">Sıra: önce boşluk, sonra yıllık izin; bu ay daha çok gün isteyen ve geçmişte daha çok onay alan önce. Eşitlikte kura.</p></div>` : ''}`);
}
CHANGE['rq-ck'] = (el) => { const id = +el.value; if (el.checked) RQ.checked.add(id); else RQ.checked.delete(id); $$('#rqDay [data-act=rq-dec]').forEach((b) => { b.disabled = !RQ.checked.size; }); };
function rqDayObj() { const sd = rqSide(); return sd ? sd.days.find((z) => z.date === RQ.psel) : null; }
ACT['rq-ck-all'] = () => { const x = rqDayObj(); if (!x) return; [...(x.order || []), ...(x.rejected || [])].forEach((o) => RQ.checked.add(o.id)); drawDay(); };
ACT['rq-ck-sug'] = () => { const x = rqDayObj(); if (!x) return; RQ.checked.clear(); (x.order || []).filter((o) => o.suggest).forEach((o) => RQ.checked.add(o.id)); drawDay(); };
ACT['rq-dec'] = (el) => rqDecide([...RQ.checked], el.dataset.s, el);
async function rqDecide(ids, status, btn) {
  if (!ids.length) return;
  let reason = '';
  if (status === 'rejected') {
    const r = await promptDialog({ title: `${ids.length} isteği reddet`, label: 'Gerekçe (yalnızca kişi ve sorumlular görür)', placeholder: 'Örn: O gün servis için yeterli kişi kalmıyor', ok: 'Reddet', danger: true });
    if (r === null) return;
    reason = r;
  }
  const run = async () => {
    try {
      const d = await api('req.decide', { ids, status, reason });
      RQ.checked.clear();
      rqSetPanel(d);
      drawPanel();
      rqRefreshPeriods();
      toast(d.decided ? `${d.decided} istek ${({ approved: 'onaylandı', rejected: 'reddedildi', pending: 'beklemeye alındı' })[status]}` : 'Değişiklik yok');
      return d;
    } catch (e) { toast(e.message, 'err'); return null; }
  };
  return btn && document.body.contains(btn) ? busy(btn, run) : run();
}
ACT['rq-approve-all'] = async (el) => {
  const ids = RQ.panel.people.flatMap((p) => p.items.filter((i) => i.status === 'pending').map((i) => i.id));
  if (!ids.length) return;
  if (!(await confirmDialog({ title: 'Bekleyenlerin tümü onaylansın mı?', text: `${ids.length} bekleyen istek onaylanacak ve kişilere bildirilecek. Önce kırmızı günlerdeki ret önerilerine bakmanız önerilir.`, ok: 'Tümünü onayla' }))) return;
  rqDecide(ids, 'approved', el);
};
ACT['rq-draw'] = async (el) => {
  const sd = rqSide();
  if (!(await confirmDialog({ title: 'Kura çekilsin mi?', text: 'Eşit durumdaki kişiler arasından ret önerisi rastgele seçilir ve kaydedilir. Kura yalnızca öneri üretir; kararı siz verirsiniz.', ok: 'Kura çek' }))) return;
  busy(el, async () => {
    try {
      const d = await api('req.draw', { period_id: RQ.pid, date: el.dataset.d, side: sd.key });
      rqSetPanel(d); drawPanel();
      toast('Kura: ' + d.picked.map(rqName).join(', '));
    } catch (e) { toast(e.message, 'err'); }
  });
};

function drawPeople() {
  const box = $('#rqPeople');
  const d = RQ.panel;
  if (!box || !d) return;
  const sides = d.sides.length > 1;
  setHTML(box, html`<div class="card-head"><h3>${icon('users', 'sm')} Kişiler</h3><span class="tiny faint">${d.people.length} kişi · satıra dokunarak toplu karar</span></div>
    ${d.people.length ? html`<div class="rq-tscroll"><table class="rq-t"><thead><tr><th class="rq-tn">Ad</th>${sides ? html`<th>Taraf</th>` : ''}<th title="Bu dönemde istenen gün (reddedilenler hariç)">Gün</th><th>B</th><th>Yİ</th><th>Bekl.</th><th>Onay</th><th>Ret</th><th title="Geçmiş dönemlerde onay / ret">Geçmiş</th><th></th></tr></thead>
      <tbody>${d.people.map((p) => html`<tr data-act="rq-person" data-k="${p.key}" tabindex="0"><th class="rq-tn"><span class="row" style="gap:8px">${avatar(rqName(p.name), 'sm')}<span class="ellipsis">${rqName(p.name)}</span>${p.user_id ? '' : html`<span class="tiny faint" title="Hesabı yok">•</span>`}</span></th>
        ${sides ? html`<td class="tiny">${rqSideName(p.side)}</td>` : ''}<td><b>${p.n}</b></td><td>${p.b || ''}</td><td>${p.i || ''}</td>
        <td>${p.pending ? html`<span class="badge warn">${p.pending}</span>` : ''}</td><td>${p.approved ? html`<span class="badge success">${p.approved}</span>` : ''}</td><td>${p.rejected ? html`<span class="badge danger">${p.rejected}</span>` : ''}</td>
        <td class="tiny">${p.past.approved} / ${p.past.rejected}</td><td>${p.conflicts ? html`<span class="badge danger" title="Onaylı isteğe rağmen nöbet">${icon('alert', 'sm')}${p.conflicts}</span>` : ''}</td></tr>`)}</tbody></table></div>`
      : html`<div class="list-row small muted">Henüz istek girilmedi.</div>`}`);
}
ACT['rq-person'] = (el) => rqPersonModal(el.dataset.k);
function rqPersonModal(key) {
  const sel = new Set();
  const person = () => RQ.panel.people.find((p) => p.key === key);
  const p0 = person();
  if (!p0) return;
  p0.items.filter((i) => i.status === 'pending').forEach((i) => sel.add(i.id));
  const m = openModal({ title: rqName(p0.name), size: 'wide', body: '', foot: '' });
  const draw = () => {
    const p = person();
    if (!p) { m.close(); return; }
    m.setBody(html`<div class="small muted rq-pm-h">${rqSideName(p.side)} · bu ay ${p.n} gün (${p.b} boşluk, ${p.i} yıllık izin) · geçmişte ${p.past.approved} onay, ${p.past.rejected} ret</div>
      <div class="rq-chips">${rqChips(p.items)}</div>
      <div class="card rq-pm-l"><div class="list">${rqGroups(p.items.map((x) => ({ ...x, note: x.note || '', reason: x.reason || '' }))).map((g) => { const ids = g.dates.map((ds) => p.items.find((i) => i.date === ds).id); const on = ids.every((id) => sel.has(id)); return html`<label class="list-row rq-o">
        <input type="checkbox" data-pm="${ids.join(',')}" ${on ? raw('checked') : ''}><span class="rq-sw k-${g.kind}">${RQ_KIND[g.kind].s}</span>
        <div class="grow" style="min-width:0"><div class="lr-t">${rqRanges(g.dates.map(rqDayN))} ${TR_MONTHS_S[+RQ.panel.period.ym.slice(5, 7) - 1]} <span class="small muted">· ${RQ_KIND[g.kind].l}</span></div>
          ${g.note ? html`<div class="tiny faint">Not: ${g.note}</div>` : ''}${g.reason ? html`<div class="tiny err-text">Gerekçe: ${g.reason}</div>` : ''}${g.conflict ? html`<div class="tiny err-text">${icon('alert', 'sm')} Listede ${g.conflict} nöbeti var</div>` : ''}</div>${rqStBadge(g.status)}</label>`; })}</div></div>`);
    m.setFoot(html`<button class="btn ghost" data-pm-act="pending">Beklemeye al</button><button class="btn danger" data-pm-act="rejected">${icon('x', 'sm')}<span>Reddet</span></button><button class="btn primary" data-pm-act="approved">${icon('check', 'sm')}<span>Onayla</span></button>`);
  };
  draw();
  m.el.addEventListener('change', (e) => { const c = e.target.closest('[data-pm]'); if (!c) return; c.dataset.pm.split(',').forEach((id) => (c.checked ? sel.add(+id) : sel.delete(+id))); });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pm-act]');
    if (!b) return;
    if (!sel.size) { toast('Gün seçin', 'err'); return; }
    const d = await rqDecide([...sel], b.dataset.pmAct, b);
    if (d) draw();
  });
}

/* ---------------- Excel'e aktar (kişi × gün) ---------------- */
ACT['rq-xlsx'] = (el) => busy(el, async () => {
  const d = RQ.panel;
  if (!d) return;
  try {
    await loadVendor('exceljs');
    const p = d.period;
    const [y, m] = p.ym.split('-').map(Number);
    const days = d.days;
    const wb = new ExcelJS.Workbook();
    const FILL = { pending: 'FFFFF1C2', approved: 'FFD5F2E1', rejected: 'FFFDE2E2' };
    const head = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B7A75' } }, alignment: { vertical: 'middle', horizontal: 'center' } };
    const ws = wb.addWorksheet('İstekler', { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
    ws.getCell(1, 1).value = `${S.settings.org_name || ''} — ${p.label} nöbet istekleri${p.roster ? ' (' + p.roster + ')' : ''}`;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    const hdr = ['Ad soyad', 'Taraf / liste'];
    hdr.forEach((h, i) => { const c = ws.getCell(2, i + 1); c.value = h; Object.assign(c, head); ws.mergeCells(2, i + 1, 3, i + 1); });
    for (let dd = 1; dd <= days; dd++) {
      const wd = new Date(y, m - 1, dd).getDay();
      const c = ws.getCell(2, 2 + dd); c.value = dd; Object.assign(c, head);
      const w = ws.getCell(3, 2 + dd); w.value = TR_DAYS_S[wd]; w.alignment = { horizontal: 'center' }; w.font = { size: 9, bold: wd === 0 || wd === 6 };
      if (wd === 0 || wd === 6) w.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E8EC' } };
      ws.getColumn(2 + dd).width = 4.6;
    }
    ['B', 'Yİ', 'Onay', 'Ret'].forEach((h, i) => { const c = ws.getCell(2, 3 + days + i); c.value = h; Object.assign(c, head); ws.mergeCells(2, 3 + days + i, 3, 3 + days + i); ws.getColumn(3 + days + i).width = 6; });
    const sideOrder = d.sides.map((s) => s.key);
    const ppl = d.people.slice().sort((a, b) => sideOrder.indexOf(a.side) - sideOrder.indexOf(b.side) || rqName(a.name).localeCompare(rqName(b.name), 'tr'));
    ppl.forEach((pp, r) => {
      const row = 4 + r;
      ws.getCell(row, 1).value = rqName(pp.name);
      ws.getCell(row, 2).value = rqSideName(pp.side);
      pp.items.forEach((it) => {
        const c = ws.getCell(row, 2 + rqDayN(it.date));
        c.value = RQ_KIND[it.kind].s;
        c.alignment = { horizontal: 'center' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[it.status] } };
        c.font = it.status === 'rejected' ? { strike: true, color: { argb: 'FFB42318' } } : { bold: true, color: { argb: it.kind === 'izin' ? 'FF6B2FB3' : 'FF1F5E99' } };
        if (it.note || it.reason) c.note = [it.note ? 'Not: ' + it.note : '', it.reason ? 'Gerekçe: ' + it.reason : ''].filter(Boolean).join('\n');
      });
      [pp.b, pp.i, pp.approved, pp.rejected].forEach((v, i) => { const c = ws.getCell(row, 3 + days + i); c.value = v; c.alignment = { horizontal: 'center' }; });
    });
    const sumRow = 4 + ppl.length;
    ws.getCell(sumRow, 1).value = 'Gün toplamı (reddedilenler hariç)'; ws.getCell(sumRow, 1).font = { bold: true };
    for (let dd = 1; dd <= days; dd++) {
      const n = ppl.reduce((a, pp) => a + pp.items.filter((it) => rqDayN(it.date) === dd && it.status !== 'rejected').length, 0);
      const c = ws.getCell(sumRow, 2 + dd); c.value = n || null; c.alignment = { horizontal: 'center' }; c.font = { bold: true };
    }
    const lg = sumRow + 2;
    ws.getCell(lg, 1).value = 'B = boşluk (nöbet istemiyor) · Yİ = yıllık izin';
    [['Beklemede', 'pending'], ['Onaylandı', 'approved'], ['Reddedildi', 'rejected']].forEach(([t, k], i) => { const c = ws.getCell(lg + 1 + i, 1); c.value = t; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[k] } }; });
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 16;
    // Günler: taraf başına istek, müsait, gereken
    const g = wb.addWorksheet('Günler');
    g.addRow(['Tarih', 'Gün', 'Taraf', 'Kişi', 'Boşluk', 'Yıllık izin', 'Müsait', 'Gereken gündüz', 'Gereken gece', 'Durum', 'Reddedilmesi önerilen']).eachCell((c) => Object.assign(c, head));
    d.sides.forEach((sd) => sd.days.forEach((x) => {
      const r = g.addRow([`${x.d} ${TR_MONTHS[m - 1]} ${y}`, TR_DAYS[new Date(y, m - 1, x.d).getDay()], sd.name, sd.people, x.b, x.i, x.avail, x.need.day, x.need.night, RQ_LV[x.level][0], x.excess || null]);
      const tone = { over: 'FFFDE2E2', tight: 'FFFFF1C2', ok: 'FFD5F2E1' }[x.level];
      if (tone && x.req) r.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone } };
    }));
    [16, 12, 18, 7, 8, 11, 8, 14, 13, 18, 20].forEach((w, i) => { g.getColumn(i + 1).width = w; });
    // Ayrıntı
    const a = wb.addWorksheet('Ayrıntı');
    a.addRow(['Ad soyad', 'Taraf / liste', 'Tarih', 'Tür', 'Durum', 'Not', 'Gerekçe', 'Listede nöbet']).eachCell((c) => Object.assign(c, head));
    ppl.forEach((pp) => pp.items.forEach((it) => a.addRow([rqName(pp.name), rqSideName(pp.side), fmtDate(it.date, true), RQ_KIND[it.kind].l, RQ_ST[it.status][0], it.note || '', it.reason || '', it.conflict || ''])));
    [24, 18, 16, 12, 12, 30, 30, 12].forEach((w, i) => { a.getColumn(i + 1).width = w; });
    a.autoFilter = { from: 'A1', to: 'H1' };
    const buf = await wb.xlsx.writeBuffer();
    if (downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `nobet-istekleri-${p.ym}.xlsx`) !== false) toast('Excel indirildi');
  } catch (e) { toast('Excel oluşturulamadı: ' + e.message, 'err'); }
});

/* =================================================================== */
/* Dönem aç / düzenle                                                  */
/* =================================================================== */
ACT['rq-new'] = () => rqPeriodModal(null);
ACT['rq-edit'] = () => rqPeriodModal(rqPeriod());
function rqDefDeadline(ym) {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  let d = new Date(y, m - 2, 20);
  if (d < new Date(t.getTime() + 86400000)) d = new Date(t.getTime() + 3 * 86400000);
  const end = new Date(y, m, 0);
  return ymd(d > end ? end : d);
}
function rqPeriodModal(p) {
  const now = new Date();
  const months = [0, 1, 2, 3].map((k) => ymd(new Date(now.getFullYear(), now.getMonth() + k, 1)).slice(0, 7));
  if (p && !months.includes(p.ym)) months.unshift(p.ym);
  const ym = p ? p.ym : months[1];
  const lab = (x) => `${TR_MONTHS[+x.slice(5, 7) - 1]} ${x.slice(0, 4)}`;
  const m = openModal({
    title: p ? `${p.label} istek dönemi` : 'İstek dönemi aç', size: 'narrow',
    body: html`<form class="stack" data-form="rq-period" id="rqPerForm"><input type="hidden" name="id" value="${p ? p.id : ''}">
      <div class="grid2 rq-g2"><div class="field"><label>Ay</label><select class="select" name="ym" data-change="rq-pym">${months.map((x) => html`<option value="${x}" ${x === ym ? raw('selected') : ''}>${lab(x)}</option>`)}</select></div>
        <div class="field"><label>Son gün</label><input class="input" type="date" name="deadline" value="${p ? p.deadline : rqDefDeadline(ym)}" required></div></div>
      ${(() => { const mg = p ? !!p.merge : !!RQ.mergeDefault; return html`
      <label class="switch"><input type="checkbox" name="merge" data-change="rq-merge" ${mg ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Basamak / liste ayrımı yapma</b><span>Kişiler ay ay farklı listede (ör. 2. ve 3. basamak) çalışıyorsa açın: herkes isteğini aya yazar, liste sormaz; panelde tüm birim tek grup görünür.</span></span></label>
      <div class="field ${mg ? 'hidden' : ''}" id="rqPerRoster"><label>Liste</label><select class="select" name="roster_id"><option value="">Tüm listeler</option>${RQ.rosters.map((r) => html`<option value="${r.id}" ${p && p.roster_id === r.id ? raw('selected') : ''}>${r.name}</option>`)}</select></div>`; })()}
      <div class="field"><label>Not (isteğe bağlı)</label><textarea class="textarea" style="min-height:72px" name="note" maxlength="300" placeholder="Örn: Bayram haftasında en fazla 2 gün boşluk yazın.">${p ? p.note || '' : ''}</textarea></div>
      ${p ? html`<label class="switch"><input type="checkbox" name="open" ${p.status === 'open' ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>İsteklere açık</b><span>Kapalıyken üyeler ekleyemez ve değiştiremez; siz düzeltebilirsiniz. Süreyi uzatıp açarsanız herkese bildirilir.</span></span></label>`
        : html`<p class="form-note">${icon('bell', 'sm')} Açınca herkese bildirim gider. Son günden 2 gün önce isteği olmayanlara hatırlatılır; son gün geçince dönem kendiliğinden kapanır.</p>`}
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`${p ? html`<button class="btn danger" data-act="rq-pdel" style="margin-right:auto">${icon('trash', 'sm')}<span>Sil</span></button>` : ''}<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" type="submit" form="rqPerForm">${p ? 'Kaydet' : 'Aç ve duyur'}</button>`,
  });
  return m;
}
CHANGE['rq-merge'] = (el) => { const b = $('#rqPerRoster'); if (b) b.classList.toggle('hidden', el.checked); };
CHANGE['rq-pym'] = (el) => { const f = el.form; if (f && !f.id.value) f.deadline.value = rqDefDeadline(el.value); };
FORMS['rq-period'] = (f) => submitForm(f, async (d) => {
  const res = await api('req.period.save', { id: d.id ? +d.id : 0, ym: d.ym, merge: !!d.merge, roster_id: d.roster_id && !d.merge ? +d.roster_id : null, deadline: d.deadline, note: d.note, status: d.id ? (d.open ? 'open' : 'closed') : 'open' });
  const mm = modalStack.find((x) => x.el === f.closest('.overlay'));
  if (mm) mm.close();
  RQ.periods = res.periods; RQ.pid = res.id; RQ.mine = null; RQ.board = null; RQ.panel = null; RQ.psel = null;
  toast(d.id ? 'Dönem kaydedildi' : 'Dönem açıldı ve herkese duyuruldu');
  if (!$('#rqTop')) { location.hash = '#/istekler'; return; }
  drawRqTop(); loadRqTab();
});
ACT['rq-pdel'] = async (el) => {
  const p = rqPeriod();
  if (!p) return;
  if (!(await confirmDialog({ title: `${p.label} dönemi silinsin mi?`, text: `Bu döneme girilmiş ${p.total} istek de silinir. Bu işlem geri alınamaz.`, ok: 'Sil', danger: true }))) return;
  try {
    const res = await api('req.period.delete', { id: p.id });
    const mm = modalStack.find((x) => x.el === el.closest('.overlay'));
    if (mm) mm.close();
    RQ.periods = res.periods; RQ.pid = null;
    location.hash = '#/istekler';
    renderRequests($('#view'), '');
    toast('Dönem silindi');
  } catch (e) { toast(e.message, 'err'); }
};

/* =================================================================== */
/* Ana sayfa kartı                                                     */
/* =================================================================== */
async function rqHomeCard(el) {
  const d = await api('req.periods');
  const open = d.periods.filter((p) => p.open).sort((a, b) => a.ym.localeCompare(b.ym));
  const now = new Date();
  const next = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1)).slice(0, 7);
  const needOpen = d.can_manage && !open.length && now.getDate() >= 10 && !d.periods.some((p) => p.ym === next);
  if (!open.length && !needOpen) { el.remove(); return; }
  setHTML(el, html`<div class="card rq-home"><div class="card-head"><h3>${icon('calendar', 'sm')} Nöbet istekleri</h3>${open.length ? html`<a class="small" href="#/istekler/pano">Pano</a>` : ''}</div>
    ${open.slice(0, 2).map((p) => html`<div class="rq-home-r"><div class="grow" style="min-width:0"><div class="lr-t">${p.month} istekleri açık</div>
        <div class="lr-s">son gün ${rqShort(p.deadline)} · ${p.mine ? html`<b>${p.mine}</b> isteğin var` : 'henüz isteğin yok'}${p.roster ? ' · ' + p.roster : ''}</div></div>
      <a class="btn sm ${p.mine ? '' : 'primary'}" href="#/istekler">${p.mine ? 'Düzenle' : 'İstek yaz'}</a></div>`)}
    ${needOpen ? html`<div class="rq-home-r"><div class="grow"><div class="lr-t">${TR_MONTHS[+next.slice(5, 7) - 1]} istekleri henüz açılmadı</div><div class="lr-s">Açınca herkes boşluk ve yıllık izin isteklerini yazar.</div></div><button class="btn sm primary" data-act="rq-home-new">Dönem aç</button></div>` : ''}</div>`);
}
ACT['rq-home-new'] = () => { RQ.openNew = true; location.hash = '#/istekler'; };
