/* dupcii — Günlük blok yerleşimi (#/taraf): o gün nöbette olanlar bloklara ve Sorumlular ekibine;
   oflama, çağrılan, nöbete gelecek kişi, karşı tarafa geçiş sayımı, kura ve WhatsApp paylaşımı */
'use strict';

/** Blok yerleşimi anlamlı mı: en az iki taraf ya da tek tarafta en az iki blok (tek alanlı birimde liste yeterli) */
function plLayoutOk(sides) { return !!sides && (sides.length >= 2 || (sides.length === 1 && (sides[0].units || []).length >= 2)); }
const PL = { date: '', day: null, prop: null, cur: null, standby: [], removed: [], pins: new Set(), dirty: false, edit: false, ym: '', mon: null, monYm: '', sort: { k: 'total', d: -1 }, tok: 0, countsOpen: false };
const PL_TEAM = '@sorumlu';
const PL_TONES = ['indigo', 'teal', 'sky', 'emerald', 'rose', 'amber'];
const PL_PER = { day: '08-16', night: '16-08', 24: '24 saat' };
const PL_PER_WORD = { day: 'gündüz', night: 'gece', 24: '24' };
const PL_METHOD = { auto: 'otomatik', kura: 'kura', elle: 'elle' };
const PL_SCOPE = { kura: 'Kura / blok yerleşimi', kaydirma: 'Kaydırma', cagri: 'Eksik çağrısı', all: 'Hepsi' };

/* ---------------- Yardımcılar ---------------- */
function plName(n) {
  return String(n || '').toLocaleLowerCase('tr').replace(/(^|[\s\-'’.(])(\S)/gu, (m, a, b) => a + b.toLocaleUpperCase('tr'));
}
/** "Ayşe Kaya" → "Ayşe K." (paylaşım için) */
function plShortName(n) {
  const w = plName(n).split(/\s+/).filter(Boolean);
  return w.length > 1 ? w.slice(0, -1).join(' ') + ' ' + w[w.length - 1][0] + '.' : w.join(' ');
}
function plTeam(src) { return (src && src.team) || (PL.day && PL.day.team) || (PL.mon && PL.mon.team) || { key: PL_TEAM, name: 'Sorumlular', members: [], need: { day: 0, night: 0 } }; }
function plLabel(u, src) { return u === PL_TEAM ? plTeam(src).name : u; }
function plLetter(u, src) {
  const m = /^\s*(\S)/u.exec(String(plLabel(u, src) || ''));
  return m ? m[1].toLocaleUpperCase('tr') : '?';
}
function plSides(src) { return (src && src.sides) || (PL.day && PL.day.sides) || (PL.mon && PL.mon.sides) || []; }
/** Bloklar (taraf sırasıyla) + isteğe bağlı Sorumlular */
function plUnitList(src, withTeam) {
  const out = [];
  plSides(src).forEach((sd) => sd.units.forEach((u) => out.push({ unit: u, label: u, side: sd.key, sideName: sd.name, tone: PL_TONES[out.length % PL_TONES.length] })));
  if (withTeam) out.push({ unit: PL_TEAM, label: plTeam(src).name, side: '', sideName: 'Ekip', tone: 'violet' });
  return out;
}
function plUnitInfo(u, src) { return plUnitList(src, true).find((x) => x.unit === u) || { unit: u, label: u, side: '', sideName: '', tone: 'slate' }; }
function plSideName(k, src) { return (plSides(src).find((s) => s.key === k) || {}).name || ''; }
function plSideShort(k, src) { const n = plSideName(k, src); return n.replace(/\s*Basamak/i, ' bas.'); }
function plIsMe(name) { return S.me && avKey(name) === avKey(S.me.name); }
function plShortDate(d) { const x = parseDT(d); return x ? `${x.getDate()} ${TR_MONTHS_S[x.getMonth()]}` : d; }
function plAddDays(d, n) { const x = parseDT(d); x.setDate(x.getDate() + n); return ymd(x); }
function plPers(per) { return per === '24' ? ['day', 'night'] : [per]; }
function plPerChip(per) {
  const t = { day: ['08:00', '16:00', 8], night: ['16:00', '08:00', 16], 24: ['08:00', '08:00', 24] }[per] || ['08:00', '16:00', 8];
  return codeChip({ code: { day: '8 16', night: '16 8', 24: '8 8' }[per] || per, kind: 'shift', hours: t[2], start: t[0], end: t[1] });
}
function plCodeChip(p) { return codeChip({ code: p.code, kind: p.kind || 'shift', hours: p.hours, start: p.start, end: p.end }); }
function plDutyMap() { return Object.fromEntries(((PL.day && PL.day.people) || []).map((p) => [p.key, p])); }
/** Bir parça karşıya geçiş sayılır mı (Sorumlular, ofl., gündüz sayılmaz) */
function plSegCounts(home, seg, src) {
  if (seg.status === 'off' || seg.unit === PL_TEAM || !home) return false;
  const us = plUnitInfo(seg.unit, src).side;
  return !!us && us !== home && seg.period !== 'day';
}
function plTeamVisible(d, cur) {
  const t = plTeam(d);
  const n = (d.needs && d.needs[PL_TEAM]) || {};
  return t.members.length || n.day || n.night || Object.values(cur || {}).some((e) => e.segs.some((s) => s.unit === PL_TEAM));
}

/* ---------------- Sayfa ---------------- */
async function renderPlacement(view, r) {
  const want = r && /^\d{4}-\d{2}-\d{2}$/.test(r[1] || '') ? r[1] : (PL.date || ymd(new Date()));
  // Geri tuşuyla başka güne dönülürken kaydedilmemiş yerleşim sessizce silinmesin
  if (want !== PL.date && (PL.dirty || PL.prop) && $('#plDay')) {
    if (!(await confirmDialog({ title: 'Kaydedilmedi', text: 'Bu günün yerleşimini kaydetmediniz. Değişiklikler silinsin mi?', ok: 'Sil ve geç', danger: true }))) { navStep('#/taraf/' + PL.date); return; }
  }
  if (want !== PL.date) plReset();
  PL.date = want;
  setHTML(view, html`${hubHead('taraf', 'Günlük blok yerleşimi · kim hangi blokta, kim kaç kez karşıya geçti', html`<div class="row wrap" style="gap:6px" id="plActs">${isAdmin() ? html`<button class="btn" data-act="pl-setup">${icon('sliders', 'sm')}<span>Taraflar</span></button>` : ''}</div>`)}
    <div id="plDay" class="pl-root"><div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>
    <div id="plMonth" class="pl-root"></div>`);
  await plLoadDay();
}
NM_EXT.routes.taraf = (view, r) => renderPlacement(view, r);
function plReset() { PL.prop = null; PL.cur = null; PL.standby = []; PL.removed = []; PL.dirty = false; PL.pins = new Set(); PL.edit = false; }

async function plLoadDay() {
  const tok = ++PL.tok;
  const date = PL.date;
  let d;
  try { d = await api('placement.day', { date }); } catch (e) {
    const b = $('#plDay'); if (b && tok === PL.tok) setHTML(b, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return;
  }
  if (tok !== PL.tok) return;
  PL.day = d;
  PL.sig = d.sig || null;
  plBuildCur();
  plDrawDay();
  plLoadMonth();
  plWatch();
}

/* ---------------- Anlık güncelleme ----------------
   Liste yeni sürüm aldı, değişim / devir oldu, taraflar ya da sayılar değişti, başka bir sorumlu kaydetti ya da oflama yaptıysa
   sayfa kendiliğinden yenilenir (sayılar, adlar, geçişler). Kaydedilmemiş düzenleme varsa üzerine yazılmaz, uyarı çıkar. */
function plWatch() {
  if (PL.watch) return;
  const tick = async () => {
    if (!$('#plDay')) { clearInterval(PL.watch); PL.watch = null; document.removeEventListener('visibilitychange', vis); return; }
    if (document.hidden || !PL.date || !PL.sig || PL.watching) return;
    PL.watching = true;
    try {
      const r = await api('placement.sig', { date: PL.date });
      if (r.sig && r.sig !== PL.sig && $('#plDay')) {
        if (PL.dirty || PL.prop) plStaleBar(true);
        else { PL.mon = null; await plLoadDay(); plLoadMonth(true); }
      }
    } catch (e) { /* çevrimdışı */ } finally { PL.watching = false; }
  };
  const vis = () => { if (!document.hidden) tick(); };
  document.addEventListener('visibilitychange', vis);
  PL.watch = setInterval(tick, 12000);
}
function plStaleBar(on) {
  const host = $('#plDay'); if (!host) return;
  let b = $('#plStale');
  if (!on) { if (b) b.remove(); return; }
  if (b) return;
  host.insertAdjacentHTML('afterbegin', fmtVal(html`<div class="mk-box warn" id="plStale">${icon('alert', 'sm')}<span class="grow">Liste, taraflar ya da bu günün yerleşimi değişti. Kaydedilmemiş düzenlemeniz olduğu için kendiliğinden yenilenmedi.</span><button class="btn sm" data-act="pl-stale-reload">Yenile</button></div>`));
}
ACT['pl-stale-reload'] = async () => {
  if ((PL.dirty || PL.prop) && !(await confirmDialog({ title: 'Kaydedilmemiş düzenleme silinsin mi?', text: 'Sayfa güncel listeyle yeniden yüklenir.', ok: 'Yenile', danger: true }))) return;
  plReset(); PL.mon = null; await plLoadDay(); plLoadMonth(true);
};

async function plLoadMonth(force) {
  const ym = PL.date.slice(0, 7);
  if (!force && PL.mon && PL.monYm === ym) { plDrawMonth(); return; }
  if (!PL.day || !plLayoutOk(PL.day.sides)) { setHTML($('#plMonth'), ''); return; }
  let d;
  try { d = await api('placement.month', { month: ym }); } catch (e) { const b = $('#plMonth'); if (b) setHTML(b, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (ym !== PL.date.slice(0, 7)) return;
  PL.mon = d; PL.monYm = ym;
  plDrawMonth();
}

/** Kayıtlı satırları kişi kişi toplar: {cur, standby, removed} */
function plFromSaved(d) {
  const duty = plDutyMapOf(d);
  const cur = {};
  const standby = [];
  const removed = [];
  (d.saved || []).forEach((s) => {
    if (s.status === 'standby') { standby.push({ key: s.key, name: s.name, side: s.side, cross: s.cross_total }); return; }
    if (s.status === 'removed') { if (duty[s.key]) removed.push({ key: s.key, name: s.name, side: duty[s.key].side }); return; }
    const e = cur[s.key] || (cur[s.key] = { key: s.key, name: s.name, side: duty[s.key] ? duty[s.key].side : s.side, duty: !!duty[s.key], segs: [], method: s.method, why: s.why, pool: null, crossBefore: s.cross_before, plain: !!s.plain });
    e.segs.push({ unit: s.unit, period: s.period, status: s.status === 'called' ? 'called' : s.status });
    if (s.pool) e.pool = s.pool;
  });
  Object.values(cur).forEach((e) => e.segs.sort((a, b) => (a.period === 'night') - (b.period === 'night')));
  return { cur, standby, removed };
}
/** Sebepsiz nöbetten çıkarılanların anahtarları */
function plRemovedKeys() { return new Set((PL.removed || []).map((r) => r.key)); }
function plDutyMapOf(d) { return Object.fromEntries(((d && d.people) || []).map((p) => [p.key, p])); }

/** Çalışılan durum: öneri varsa öneri (+ elle bırakılanlar ve çağrılanlar), yoksa kayıtlı yerleşim */
function plBuildCur(keepManual) {
  const d = PL.day;
  if (PL.prop) {
    const prev = PL.cur || {};
    const cur = {};
    const duty = plDutyMap();
    PL.prop.items.forEach((it) => { cur[it.key] = { key: it.key, name: it.name, side: duty[it.key].side, duty: true, segs: it.segs.map((s) => ({ ...s })), method: it.method, why: it.why, draw: it.draw }; });
    if (keepManual) Object.values(prev).forEach((e) => { if (!e.duty) cur[e.key] = e; });
    PL.cur = cur;
    return;
  }
  if ((d.saved || []).length) {
    const x = plFromSaved(d);
    PL.cur = x.cur;
    PL.standby = x.standby;
    PL.removed = x.removed;
  } else { PL.cur = null; PL.standby = []; PL.removed = []; }
}

/** Elle düzenlemeye boş başlarken: sabit ekip üyeleri Sorumlular'a, diğerleri kendi tarafına (çok birimli tarafta sırayla) */
function plHomeDefault() {
  const d = PL.day;
  const cur = {};
  const idx = {};
  const rm = plRemovedKeys();
  d.people.forEach((p) => {
    if (rm.has(p.key)) return;
    const sd = d.sides.find((s) => s.key === p.side);
    if (!sd) return;
    let unit;
    if (p.team) unit = PL_TEAM;
    else { idx[sd.key] = (idx[sd.key] || 0) + 1; unit = sd.units[(idx[sd.key] - 1) % sd.units.length]; }
    cur[p.key] = { key: p.key, name: p.name, side: p.side, duty: true, segs: [{ unit, period: p.shift, status: 'work' }], method: 'elle', why: '' };
  });
  return cur;
}
function plEnsureCur() { if (!PL.cur) { PL.cur = plHomeDefault(); PL.dirty = true; } }

/** Kişinin (bu durumla birlikte) geçiş sayısı */
function plCrossShown(e) {
  const p = plDutyMap()[e.key];
  const base = p ? p.cross : (e.crossBefore != null ? e.crossBefore : ((PL.day.others || []).find((o) => o.key === e.key) || {}).cross || 0);
  return base + (e.segs.some((s) => plSegCounts(e.side, s)) ? 1 : 0);
}

function plNeedPill(placed, need, per) {
  const tone = !need ? (placed ? 'info' : '') : placed < need ? 'danger' : placed > need ? 'warn' : 'success';
  return html`<span class="badge ${tone} pl-need" title="${per === 'day' ? 'Gündüz 08-16' : 'Gece 16-08'}: ${placed} kişi${need ? ' · gereken ' + need : ''}">${icon(per === 'day' ? 'sun' : 'moon', 'sm')}${placed}${need ? html`<span class="pl-need-of">/${need}</span>` : ''}</span>`;
}

/** Bir kişinin bir yerdeki çipi */
function plSegChip(e, seg, editable) {
  const p = plDutyMap()[e.key];
  const off = seg.status === 'off';
  const ui = plUnitInfo(seg.unit);
  const moved = !off && seg.unit !== PL_TEAM && e.side && ui.side && ui.side !== e.side;
  const chip = p && seg.period === p.shift && e.segs.length === 1 ? plCodeChip(p) : plPerChip(seg.period);
  const inner = html`${chip}<span class="pl-nm">${editable ? plName(e.name) : pName(plName(e.name))}</span><span class="pl-cnt" title="Karşı tarafa toplam geçiş">(${plCrossShown(e)})</span>
    ${moved ? html`<span class="pl-from" title="${plSideName(e.side)} listesinden">${plSideShort(e.side)}</span>` : ''}
    ${seg.status === 'called' && !e.plain ? html`<span class="pl-tag called">Çağrıldı</span>` : ''}
    ${off ? html`<span class="pl-tag off">Ofl. ${PL_PER_WORD[seg.period]}</span>` : ''}
    ${e.method === 'kura' && !off && moved ? html`<span class="pl-m" title="Kura ile">${icon('star', 'sm')}</span>` : ''}
    ${p && p.exempt ? html`<span class="pl-ex" title="Kuradan muaf">muaf</span>` : ''}`;
  const cls = `pl-p ${moved ? 'in' : ''} ${off ? 'off' : ''} ${seg.status === 'called' && !e.plain ? 'called' : ''} ${plIsMe(e.name) ? 'me' : ''} ${editable ? 'ed' : ''}`;
  return editable
    ? html`<button type="button" class="${cls}" data-act="pl-pick" data-k="${e.key}" title="${e.why || 'Düzenle'}">${inner}</button>`
    : html`<span class="${cls}" title="${e.why || ''}">${inner}</span>`;
}

function plDrawDay() {
  const d = PL.day;
  const host = $('#plDay');
  if (!host || !d) return;
  if (!plLayoutOk(d.sides)) {
    setHTML(host, html`<div class="card empty"><div class="e-ico">${icon('layers', 'lg')}</div><h3>Taraflar tanımlanmadı</h3>
      <p class="small">${d.can_admin ? html`Örneğin <b>3. Basamak → B blok</b> ve <b>2. Basamak → A blok, C blok</b>. Her tarafı kendi nöbet listesine bağlayın; günlük blok yerleşimi buradan yapılır. Tek alanlı (tek servisli) birimde blok yerleşimi gerekmez; liste zaten yeterlidir.` : 'Yönetici tarafları (ör. 3. Basamak · B blok, 2. Basamak · A ve C blok) tanımladığında burada görünür.'}</p>
      ${d.can_admin ? html`<button class="btn primary" data-act="pl-setup" style="margin-top:12px">${icon('sliders', 'sm')}Tarafları tanımla</button>` : ''}</div>`);
    return;
  }
  const today = ymd(new Date());
  const tomorrow = plAddDays(today, 1);
  const people = d.people;
  const cur = PL.cur;
  const edit = d.can_edit && PL.edit;
  const dt = parseDT(d.date);
  const typeLbl = d.holiday ? d.holiday.name + (d.holiday.half ? ' (yarım gün)' : '') : d.day_type === 'weekend' ? 'Hafta sonu' : 'Hafta içi';
  const units = plUnitList(d, plTeamVisible(d, cur));

  const nav = html`<div class="card pl-daynav">
    <button class="btn icon" data-act="pl-go" data-d="-1" aria-label="Önceki gün">${icon('chevL')}</button>
    <label class="pl-dl grow"><b>${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${TR_DAYS[dt.getDay()]}</b><span class="tiny faint">${d.date === today ? 'Bugün · ' : d.date === tomorrow ? 'Yarın · ' : d.date < today ? 'Geçmiş · ' : ''}${typeLbl}</span>
      <input type="date" class="pl-date" value="${d.date}" data-change="pl-date" aria-label="Tarih seç"></label>
    <button class="btn icon" data-act="pl-go" data-d="1" aria-label="Sonraki gün">${icon('chevR')}</button>
    <div class="seg pl-quick"><button class="${d.date === today ? 'on' : ''}" data-act="pl-go" data-to="${today}">Bugün</button><button class="${d.date === tomorrow ? 'on' : ''}" data-act="pl-go" data-to="${tomorrow}">Yarın</button></div></div>`;

  if (!people.length && !(d.saved || []).length) {
    setHTML(host, html`${nav}<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>Bu gün listede nöbetçi yok</h3>
      <p class="small">Taraflara bağlı nöbet listelerinde ${plShortDate(d.date)} için nöbet görünmüyor. Liste güncellenince kişiler burada çıkar.</p></div>`);
    plDrawActs();
    return;
  }

  const saved = (d.saved || []).length > 0;
  let status;
  if (PL.prop || PL.dirty) status = html`<span class="badge warn">${icon('edit', 'sm')}Öneri · kaydedilmedi</span>`;
  else if (saved) status = html`<span class="badge success">${icon('checkCircle', 'sm')}Kaydedildi${d.saved_by ? ' · ' + d.saved_by : ''}${d.saved_at ? ' · ' + fmtRel(d.saved_at) : ''}</span>`;
  else status = html`<span class="badge">${icon('clock', 'sm')}Henüz yerleştirilmedi</span>`;
  const rmKeys = cur ? plRemovedKeys() : new Set();
  const bySide = d.sides.map((sd) => [sd, people.filter((p) => p.side === sd.key && !rmKeys.has(p.key))]);
  const summary = html`<div class="pl-sum"><span class="small"><b>${people.length - people.filter((p) => rmKeys.has(p.key)).length}</b> kişi nöbette · ${bySide.map(([sd, l], i) => html`${i ? ' · ' : ''}${sd.name} <b>${l.length}</b>`)}</span><span class="grow"></span>${status}</div>`;

  let board;
  if (cur) {
    const load = {};
    units.forEach((u) => { load[u.unit] = { day: 0, night: 0, list: [] }; });
    Object.values(cur).forEach((e) => e.segs.forEach((s) => {
      const L = load[s.unit];
      if (!L) return;
      L.list.push([e, s]);
      if (s.status !== 'off') plPers(s.period).forEach((per) => { L[per]++; });
    }));
    const order = ([a, sa], [b, sb]) => (sa.status === 'off') - (sb.status === 'off') || (sb.period === '24') - (sa.period === '24') || (sa.period === 'night' ? 0 : 1) - (sb.period === 'night' ? 0 : 1) || a.name.localeCompare(b.name, 'tr');
    const placedKeys = new Set(Object.keys(cur));
    const unassigned = people.filter((p) => !placedKeys.has(p.key) && !rmKeys.has(p.key));
    board = html`<div class="pl-board">${units.map((u) => {
      const L = load[u.unit];
      const need = d.needs[u.unit] || { day: 0, night: 0 };
      return html`<div class="card pl-unit ${u.unit === PL_TEAM ? 'pl-team' : ''}" data-unit="${u.unit}">
        <div class="pl-uh"><span class="pl-ul tone-${u.tone}">${plLetter(u.unit, d)}</span><div class="grow" style="min-width:0"><b>${u.label}</b><div class="tiny faint">${u.unit === PL_TEAM ? 'Ekip · karşıya geçiş sayılmaz' : u.sideName}</div></div>
          <div class="pl-needs">${plNeedPill(L.day, need.day, 'day')}${plNeedPill(L.night, need.night, 'night')}</div></div>
        <div class="pl-chips">${L.list.length ? L.list.sort(order).map(([e, s]) => plSegChip(e, s, edit)) : html`<span class="tiny faint">Kimse yok</span>`}</div></div>`;
    })}</div>
    ${unassigned.length ? html`<div class="card card-pad pl-warn">${icon('alert', 'sm')} <b>Yerleşmemiş:</b> ${unassigned.map((p) => html`<span class="pl-p">${plCodeChip(p)}<span class="pl-nm">${plName(p.name)}</span></span>`)}</div>` : ''}`;
  } else {
    board = html`<div class="pl-board">${bySide.map(([sd, l]) => html`<div class="card pl-unit pl-home-side">
        <div class="pl-uh"><span class="pl-ul tone-slate">${icon('users', 'sm')}</span><div class="grow"><b>${sd.name}</b><div class="tiny faint">${sd.units.join(' · ')} · listede ${l.length} kişi</div></div></div>
        <div class="pl-chips">${l.length ? l.map((p) => html`<span class="pl-p">${plCodeChip(p)}<span class="pl-nm">${plName(p.name)}</span><span class="pl-cnt">(${p.cross_now})</span>${p.team ? html`<span class="pl-tag team">${plTeam(d).name}</span>` : ''}</span>`) : html`<span class="tiny faint">Nöbetçi yok</span>`}</div></div>`)}</div>
      <p class="small muted pl-note">${d.can_edit ? html`Bu günün blok yerleşimi henüz yapılmadı. <b>Otomatik dağıt</b> ile önerini al, gerekirse kişilere dokunup değiştir, sonra <b>Kaydet</b>.` : 'Bu günün blok yerleşimi henüz yapılmadı. Sorumlu yerleştirince burada ve ana sayfada görünür.'}</p>`;
  }

  // Nöbete gelecek kişi
  const sbList = PL.standby || [];
  const standby = sbList.length || edit ? html`<div class="card pl-standby">
      <div class="pl-uh"><span class="pl-ul tone-slate">${icon('clock', 'sm')}</span><div class="grow"><b>Nöbete gelecek kişi</b><div class="tiny faint">Gerekirse (ör. hasta yatışı) gelir · sayılmaz</div></div>
        ${edit ? html`<button class="btn sm" data-act="pl-sb-add">${icon('plus', 'sm')}<span>Ekle</span></button>` : ''}</div>
      <div class="pl-chips">${sbList.length ? sbList.map((s, i) => html`<span class="pl-p sb ${plIsMe(s.name) ? 'me' : ''}"><span class="pl-nm">${plName(s.name)}</span>${s.side ? html`<span class="tiny faint">${plSideShort(s.side)}</span>` : ''}
          ${edit ? html`<button type="button" class="btn sm pl-came" data-act="pl-sb-came" data-i="${i}">Geldi</button><button type="button" class="btn ghost icon sm" data-act="pl-sb-del" data-i="${i}" aria-label="Kaldır">${icon('x', 'sm')}</button>` : ''}</span>`)
        : html`<span class="tiny faint">Kimse yok</span>`}</div></div>` : '';

  // Sebepsiz nöbetten çıkarılanlar: yalnız sorumlular görür (herkese açık görünümde hiç yok)
  const rmList = cur ? PL.removed || [] : [];
  const removed = rmList.length && d.can_edit ? html`<div class="card pl-standby pl-removed">
      <div class="pl-uh"><span class="pl-ul tone-slate">${icon('x', 'sm')}</span><div class="grow"><b>Nöbetten çıkarılanlar</b><div class="tiny faint">Sebep yazılmaz · hiçbir blokta görünmez, sayılmaz</div></div></div>
      <div class="pl-chips">${rmList.map((r, i) => html`<span class="pl-p sb"><span class="pl-nm">${plName(r.name)}</span>${r.side ? html`<span class="tiny faint">${plSideShort(r.side)}</span>` : ''}
          ${edit ? html`<button type="button" class="btn sm" data-act="pl-rm-undo" data-i="${i}">Geri al</button>` : ''}</span>`)}</div></div>` : '';

  // Öneri açıklamaları
  const pr = PL.prop;
  const savedDraws = !pr && cur ? Object.values(cur).filter((e) => e.pool && e.pool.group) : [];
  const explain = pr ? html`<div class="card pl-explain">
      <div class="card-head"><h3>${icon('info', 'sm')} Nasıl dağıtıldı</h3>${pr.draws.some((x) => x.group.length > 1) ? html`<span class="badge brand">${icon('star', 'sm')}Kura çekildi</span>` : ''}</div>
      <div class="list">
        ${!pr.has_needs ? html`<div class="list-row small">${icon('alert', 'sm')}<span class="grow">Gereken kişi sayıları girilmemiş: herkes kendi tarafında kaldı. Sayıları aşağıdaki <b>Gereken kişi</b> bölümünden ya da Ayarlar › Nöbet'ten girin.</span></div>` : ''}
        ${pr.draws.map((x) => html`<div class="list-row pl-draw"><span class="pl-ul sm tone-${plUnitInfo(x.unit).tone}">${plLetter(x.unit)}</span><div class="grow" style="min-width:0">
          <div class="small"><b>${x.from_name} → ${x.unit || x.to_name}</b> · ${x.period === 'night' ? 'gece eksiği' : 'gündüz eksiği'}</div>
          <div class="small">${x.group.length > 1 ? html`Kura: ${x.group.length} kişi ${x.min} geçişle eşitti → <b>${plName(x.winner)}</b> seçildi` : html`<b>${plName(x.winner)}</b> en az geçen kişi (${x.min} geçiş) → kurasız`}</div>
          <div class="tiny faint">Adaylar: ${x.pool.map((c) => `${plName(c.name)} (${c.cross})`).join(', ')}${x.exempt && x.exempt.length ? ' · muaf: ' + x.exempt.map(plName).join(', ') : ''}</div></div></div>`)}
        ${pr.has_needs && !pr.draws.length ? html`<div class="list-row small">${icon('checkCircle', 'sm')}<span class="grow">Karşı tarafa geçiş gerekmedi; herkes kendi tarafında.</span></div>` : ''}
        ${pr.deficits.map((x) => html`<div class="list-row pl-def">${icon('alert', 'sm')}<span class="grow small"><b>${x.label}</b> · ${x.period === 'night' ? 'gece (16-08)' : 'gündüz (08-16)'}: <b>${x.missing} kişi eksik</b> (${x.placed}/${x.need})</span>
          ${d.can_edit && x.unit !== PL_TEAM && typeof window.openCalloutModal === 'function' ? html`<button class="btn sm" data-act="pl-callout" data-unit="${x.unit}" data-side="${x.side}" data-per="${x.period}">${icon('megaphone', 'sm')}<span>Eksik çağrısı</span></button>` : ''}</div>`)}
        ${pr.extra.length ? html`<div class="list-row small faint">${icon('users', 'sm')}<span class="grow">Fazla: ${pr.extra.map((x) => `${x.label} ${x.period === 'night' ? 'gece' : 'gündüz'} +${x.over}`).join(' · ')}</span></div>` : ''}
      </div></div>`
    : savedDraws.length ? html`<div class="card pl-explain"><div class="list">${savedDraws.map((e) => { const s = e.segs.find((x) => x.status !== 'off') || e.segs[0]; return html`<div class="list-row pl-draw"><span class="pl-ul sm tone-${plUnitInfo(s.unit).tone}">${plLetter(s.unit)}</span><div class="grow" style="min-width:0">
        <div class="small">${e.pool.group.length > 1 ? html`Kura: ${e.pool.group.length} kişi ${e.pool.min} geçişle eşitti → <b>${plName(e.name)}</b> ${plLabel(s.unit)}` : html`<b>${plName(e.name)}</b> en az geçen kişi (${e.pool.min}) → ${plLabel(s.unit)}`}</div>
        <div class="tiny faint">Adaylar: ${(e.pool.pool || []).map((c) => `${plName(c.name)} (${c.cross})`).join(', ')}</div></div></div>`; })}</div></div>` : '';

  const stale = !PL.prop && d.stale.length ? html`<div class="card card-pad pl-warn">${icon('alert', 'sm')} <span><b>Liste değişti:</b> ${d.stale.map((x) => `${plName(x.name)} ${x.why}`).join(' · ')}.${d.can_edit ? ' Yeniden dağıtıp kaydedin.' : ''}</span></div>` : '';
  const hint = !d.has_needs && d.can_edit && !PL.prop ? html`<p class="tiny faint pl-note">${icon('info', 'sm')} Gereken kişi sayıları girilmemiş; otomatik dağıtımda herkes kendi tarafında kalır.</p>` : '';
  const editHint = edit ? html`<div class="pl-edit-hint">${icon('edit', 'sm')}<span class="grow">Kişiye dokunun: blok, dönem (gündüz/gece), oflama. Bitince <b>Kaydet</b>.</span>
      <button class="btn sm" data-act="pl-call-add">${icon('plus', 'sm')}<span>Ekstra kişi ekle</span></button></div>` : '';

  setHTML(host, html`${nav}${summary}${stale}${editHint}${board}${removed}${standby}${hint}${explain}${plCountsCard()}`);
  plDrawActs();
}

/** Yayıncı düğmeleri */
function plDrawActs() {
  const d = PL.day;
  const host = $('#plDay');
  if (!host || !d) return;
  let bar = $('#plBar');
  if (!d.can_edit || !plLayoutOk(d.sides) || (!d.people.length && !(d.saved || []).length)) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'plBar'; bar.className = 'pl-bar'; host.prepend(bar); }
  const ties = PL.prop && PL.prop.draws.some((x) => x.group.length > 1);
  const savedClean = !PL.dirty && !PL.prop && (d.saved || []).length;
  setHTML(bar, html`<button class="btn ${PL.cur && !PL.dirty ? '' : 'primary'}" data-act="pl-auto">${icon('layers', 'sm')}<span>Otomatik dağıt</span></button>
    ${ties ? html`<button class="btn" data-act="pl-redraw">${icon('star', 'sm')}<span>Kura</span></button>` : ''}
    <button class="btn ${PL.edit ? 'on' : ''}" data-act="pl-edit" aria-pressed="${PL.edit ? 'true' : 'false'}">${icon('edit', 'sm')}<span>${PL.edit ? 'Düzenleme açık' : 'Elle düzenle'}</span></button>
    <button class="btn" data-act="pl-call-add">${icon('plus', 'sm')}<span>Ekstra kişi</span></button>
    ${PL.dirty || PL.prop ? html`<button class="btn primary" data-act="pl-save">${icon('check', 'sm')}<span>Kaydet</span></button><button class="btn ghost" data-act="pl-discard">Vazgeç</button>` : ''}
    ${savedClean ? html`<button class="btn" data-act="pl-share">${icon('send', 'sm')}<span>Paylaş</span></button><button class="btn ghost icon" data-act="pl-clear" title="Bu günün kaydını sil" aria-label="Bu günün kaydını sil">${icon('trash', 'sm')}</button>` : ''}`);
}

/* ---------------- Gereken kişi (güne özel) ---------------- */
function plCountsCard() {
  const d = PL.day;
  const units = plUnitList(d, true);
  const src = { day: 'Bu güne özel', default: d.day_type === 'weekend' ? 'Varsayılan · hafta sonu / tatil' : 'Varsayılan · hafta içi', none: 'Girilmemiş' }[d.needs_source];
  const sum = units.map((u) => { const n = d.needs[u.unit] || {}; return `${plLetter(u.unit, d)} ${n.day || 0}/${n.night || 0}`; }).join(' · ');
  const num = (u, per) => {
    const v = (d.needs[u.unit] || {})[per] || 0;
    return d.can_edit ? html`<input class="input pl-num" type="number" min="0" max="30" inputmode="numeric" value="${v}" data-u="${u.unit}" data-per="${per}" aria-label="${u.label} ${per === 'day' ? 'gündüz' : 'gece'}">` : html`<b>${v}</b>`;
  };
  return html`<details class="card pl-counts" ${PL.countsOpen ? raw('open') : ''}><summary class="card-head"><h3>${icon('users', 'sm')} Gereken kişi</h3><span class="tiny faint ellipsis">${sum} · ${src}</span></summary>
    <div class="card-pad stack">
      <table class="pl-ct"><thead><tr><th>Yer</th><th>${icon('sun', 'sm')} Gündüz <small>08-16</small></th><th>${icon('moon', 'sm')} Gece <small>16-08</small></th></tr></thead>
        <tbody>${units.map((u) => html`<tr><td><span class="pl-ul sm tone-${u.tone}">${plLetter(u.unit, d)}</span> ${u.label} <span class="tiny faint">${u.sideName}</span></td><td>${num(u, 'day')}</td><td>${num(u, 'night')}</td></tr>`)}</tbody></table>
      <p class="tiny faint">24 saatlik nöbetçi iki dönemde de sayılır. Blok varsayılanları Ayarlar › Nöbet'ten, ${plTeam(d).name} varsayılanı aşağıdaki ekip kartından değiştirilir.</p>
      ${d.can_edit ? html`<div class="row wrap"><button class="btn sm primary" data-act="pl-counts-save">Bu gün için kaydet</button>${d.needs_source === 'day' ? html`<button class="btn sm ghost" data-act="pl-counts-reset">Varsayılana dön</button>` : ''}</div>` : ''}
    </div></details>`;
}
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('pl-counts')) PL.countsOpen = e.target.open; }, true);
ACT['pl-counts-save'] = (el) => busy(el, async () => {
  const counts = {};
  $$('.pl-counts .pl-num').forEach((x) => { (counts[x.dataset.u] = counts[x.dataset.u] || {})[x.dataset.per] = Math.max(0, +x.value || 0); });
  try { const r = await api('placement.counts', { date: PL.date, counts }); Object.assign(PL.day, r); toast('Gereken sayılar bu gün için kaydedildi'); plDrawDay(); } catch (e) { toast(e.message, 'err'); }
});
ACT['pl-counts-reset'] = (el) => busy(el, async () => {
  try { const r = await api('placement.counts', { date: PL.date, counts: null }); Object.assign(PL.day, r); toast('Varsayılan sayılar kullanılıyor'); plDrawDay(); } catch (e) { toast(e.message, 'err'); }
});

/* ---------------- Gün değiştirme ---------------- */
async function plGoto(date) {
  if (!date || date === PL.date) return;
  if ((PL.dirty || PL.prop) && !(await confirmDialog({ title: 'Kaydedilmedi', text: 'Bu günün yerleşimini kaydetmediniz. Değişiklikler silinsin mi?', ok: 'Sil ve geç', danger: true }))) { plDrawDay(); return; }
  PL.date = date;
  plReset();
  navStep('#/taraf/' + date);
  await plLoadDay();
}
ACT['pl-go'] = (el) => plGoto(el.dataset.to || plAddDays(PL.date, +el.dataset.d));
CHANGE['pl-date'] = (el) => { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) plGoto(el.value); };
ACT['pl-day'] = (el) => { plGoto(`${PL.monYm}-${pad(+el.dataset.d)}`); window.scrollTo({ top: 0, behavior: 'smooth' }); };
// Ay gezinme (eski Taraf sayfasıyla aynı düğme adı; o sayfa açıksa onun işleyicisi çalışır)
const plPrevTrMv = ACT['tr-mv'];
ACT['tr-mv'] = (el, ev) => {
  if (!$('#plMonth')) return plPrevTrMv ? plPrevTrMv(el, ev) : undefined;
  const [y, m] = (PL.monYm || PL.date.slice(0, 7)).split('-').map(Number);
  const x = new Date(y, m - 1 + +el.dataset.d, 1);
  const today = ymd(new Date());
  const ym = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
  plGoto(today.startsWith(ym) ? today : ym + '-01');
};

/* ---------------- Dağıtım, kura, elle, kaydet ---------------- */
async function plRunAuto(el, reveal) {
  const keep = [];
  // Korunacaklar: listede olmayan (çağrılan), bu oturumda elle değiştirilen, kayıtlı elle yerleşim, oflanan ve iki yere bölünen kişiler
  if (PL.cur) Object.values(PL.cur).forEach((e) => {
    if (!e.duty || PL.pins.has(e.key) || e.method === 'elle' || e.segs.length > 1 || e.segs.some((s) => s.status === 'off')) keep.push({ name: e.name, segs: e.segs, plain: !!e.plain });
  });
  (PL.removed || []).forEach((r) => keep.push({ name: r.name, removed: true }));
  await busy(el, async () => {
    let r;
    try { r = await api('placement.auto', { date: PL.date, keep }); } catch (e) { toast(e.message, 'err'); return; }
    PL.prop = r;
    PL.dirty = true;
    plBuildCur(true);
    const ties = r.draws.filter((x) => x.group.length > 1);
    if (ties.length && reveal !== false) await plReveal(ties);
    plDrawDay();
    if (!ties.length) toast(keep.length ? 'Yeniden dağıtıldı (elle yapılanlar korundu)' : 'Öneri hazır · kontrol edip kaydedin');
  });
}
ACT['pl-auto'] = (el) => plRunAuto(el);
ACT['pl-redraw'] = (el) => plRunAuto(el, true);
ACT['pl-edit'] = () => { PL.edit = !PL.edit; if (PL.edit) plEnsureCur(); plDrawDay(); };
ACT['pl-discard'] = () => { plReset(); plBuildCur(); plDrawDay(); };
ACT['pl-save'] = (el) => busy(el, async () => {
  if (!PL.cur) return;
  const people = Object.values(PL.cur).map((e) => ({ name: e.name, segs: e.segs.map((s) => ({ unit: s.unit, period: s.period, status: s.status })), ...(e.duty ? {} : { plain: !!e.plain }) }));
  (PL.removed || []).forEach((r) => people.push({ name: r.name, removed: true }));
  const standby = (PL.standby || []).map((s) => ({ name: s.name }));
  try {
    const r = await api('placement.save', { date: PL.date, people, standby });
    PL.day = r;
    plReset();
    plBuildCur();
    plDrawDay();
    toast('Yerleşim kaydedildi' + (r.notified ? ` · ${r.notified} kişiye bildirim gitti` : ''));
    plLoadMonth(true);
  } catch (e) { toast(e.message, 'err'); }
});
ACT['pl-clear'] = async () => {
  if (!(await confirmDialog({ title: 'Kayıt silinsin mi?', text: `${plShortDate(PL.date)} günün blok yerleşimi ve bu güne ait geçiş sayımları silinir.`, ok: 'Sil', danger: true }))) return;
  try { PL.day = await api('placement.clear', { date: PL.date }); plReset(); plBuildCur(); plDrawDay(); toast('Silindi'); plLoadMonth(true); } catch (e) { toast(e.message, 'err'); }
};
ACT['pl-callout'] = (el) => {
  if (typeof window.openCalloutModal !== 'function') return;
  window.openCalloutModal({ date: PL.date, shift: el.dataset.per === 'night' ? 'night' : 'day', side: el.dataset.side, unit: el.dataset.unit });
};

/** Dönem seçimlerinden parçalar: {day: birim|'off'|'', night: ...} */
function plSegsFrom(sel, prevSegs, home) {
  const unitFor = (per) => {
    const s = (prevSegs || []).find((x) => plPers(x.period).includes(per) && x.status !== 'off') || (prevSegs || [])[0];
    return s ? s.unit : home;
  };
  const v = { day: sel.day, night: sel.night };
  const seg = (per) => (v[per] === 'off' ? { unit: unitFor(per), period: per, status: 'off' } : v[per] ? { unit: v[per], period: per, status: 'work' } : null);
  const a = seg('day'), b = seg('night');
  if (a && b && a.unit === b.unit && a.status === b.status) return [{ unit: a.unit, period: '24', status: a.status }];
  return [a, b].filter(Boolean);
}
function plSelOf(segs) {
  const sel = { day: '', night: '' };
  (segs || []).forEach((s) => plPers(s.period).forEach((per) => { sel[per] = s.status === 'off' ? 'off' : s.unit; }));
  return sel;
}

/** Kişi düzenleme: blok, dönem (gündüz/gece), oflama; çağrılan için kaldır */
ACT['pl-pick'] = (el) => {
  const d = PL.day;
  plEnsureCur();
  const e = PL.cur[el.dataset.k];
  if (!e) return;
  const p = plDutyMap()[e.key];
  const units = plUnitList(d, true);
  const counts = (p && p.units) || {};
  const home = p ? (p.team ? PL_TEAM : (d.sides.find((s) => s.key === p.side) || { units: [''] }).units[0]) : (units[0] || {}).unit;
  const sel = plSelOf(e.segs);
  const opt = (per) => html`<select class="select" data-per="${per}"><option value="">— (yok)</option>${units.map((u) => html`<option value="${u.unit}" ${sel[per] === u.unit ? raw('selected') : ''}>${u.label}${u.side && e.side && u.side !== e.side ? ' · karşı taraf' : ''}</option>`)}${e.duty ? html`<option value="off" ${sel[per] === 'off' ? raw('selected') : ''}>Ofl. (eve gönderildi)</option>` : ''}</select>`;
  const m = openModal({ title: plName(e.name), size: 'narrow', body: html`<div class="stack">
      <div class="row wrap">${p ? plCodeChip(p) : e.plain ? html`<span class="pl-tag">Ekstra</span>` : html`<span class="pl-tag called">Çağrıldı</span>`}<span class="small muted">${p ? (PL_PER[p.shift] || '') + ' · ' + (plSideName(p.side) || '') + ' listesi' : (e.side ? plSideName(e.side) + ' listesinden · o gün nöbetçi değil' : 'Listede yok')}</span>${p && p.exempt ? html`<span class="badge warn">Kuradan muaf</span>` : ''}${p && p.team ? html`<span class="badge">${plTeam(d).name} üyesi</span>` : ''}</div>
      ${p ? html`<div class="pl-pstats"><div><b>${p.cross}</b><span>karşıya geçiş</span></div>${units.map((u) => html`<div><b>${counts[u.unit] || 0}</b><span>${u.label}</span></div>`)}</div>
        <p class="tiny faint">${p.last_unit ? `Son yer: ${plLabel(p.last_unit)} (${plShortDate(p.last_date)})` : 'Daha önce kayıtlı yeri yok'}</p>` : ''}
      <div class="sec-label" style="padding:0;border:0">Tek yer${p ? ` (${PL_PER[p.shift]})` : ''}</div>
      <div class="pl-pick">${units.map((u) => html`<button type="button" class="pl-opt ${e.segs.length === 1 && e.segs[0].unit === u.unit && e.segs[0].status !== 'off' ? 'on' : ''}" data-u="${u.unit}">
        <span class="pl-ul tone-${u.tone}">${plLetter(u.unit, d)}</span><span class="grow"><b>${u.label}</b><span class="tiny faint">${u.unit === PL_TEAM ? 'Ekip · geçiş sayılmaz' : u.sideName}${u.side && e.side && u.side !== e.side ? (p && p.shift === 'day' ? ' · karşı taraf (08-16 sayılmaz)' : ' · karşı taraf · geçiş sayılır') : ''}</span></span></button>`)}</div>
      <div class="sec-label" style="padding:0;border:0">Dönem dönem (iki yere bölme, oflama)</div>
      <div class="pl-pers"><label>${icon('sun', 'sm')} Gündüz <small>08-16</small></label>${opt('day')}<label>${icon('moon', 'sm')} Gece <small>16-08</small></label>${opt('night')}</div>
      ${e.duty ? html`<div class="row wrap"><span class="tiny faint">Hızlı ofla:</span><button type="button" class="btn sm" data-off="day">Gündüz</button><button type="button" class="btn sm" data-off="night">Gece</button><button type="button" class="btn sm" data-off="24">Tümü</button></div>` : ''}
      ${!e.duty ? html`<label class="row" style="gap:10px;cursor:pointer"><span class="switch"><input type="checkbox" id="plpTag" ${e.plain ? '' : raw('checked')}><span class="track"></span></span><span class="small">“Çağrıldı” etiketi <span class="faint">(kapalıysa sebepsiz ekstra)</span></span></label>` : ''}
      <p class="tiny faint">Bir kişi en fazla iki yerde olabilir (ör. gündüz ${plTeam(d).name}, gece blok). Oflanan dönem kapsamaya ve karşıya geçişe sayılmaz.${e.duty ? ' <b>Nöbetten çıkar</b>: sebep yazılmadan o günden çıkarılır, hiçbir blokta görünmez ve sayılmaz.' : ''}</p></div>`,
  foot: html`${!e.duty ? html`<button class="btn danger" data-rm="1">Kaldır</button>` : html`<button class="btn danger" data-out="1">Nöbetten çıkar</button>`}<span class="grow"></span><button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-apply="1">Uygula</button>` });
  const apply = (segs) => {
    if (!segs.length) { toast('En az bir dönem seçin ya da oflayın', 'err'); return; }
    const tag = $('#plpTag', m.el);
    PL.cur[e.key] = { ...e, segs, method: 'elle', why: 'Elle', ...(tag ? { plain: !tag.checked } : {}) };
    if (e.duty) PL.pins.add(e.key);
    PL.dirty = true;
    m.close();
    plDrawDay();
  };
  const readSel = () => ({ day: $('select[data-per=day]', m.el).value, night: $('select[data-per=night]', m.el).value });
  m.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('.pl-opt,[data-off],[data-apply],[data-rm],[data-out]');
    if (!b) return;
    if (b.classList.contains('pl-opt')) {
      const per = p ? p.shift : (e.segs.length === 2 ? '24' : e.segs[0].period);
      apply([{ unit: b.dataset.u, period: per, status: e.duty ? 'work' : 'called' }]);
    } else if (b.dataset.off) {
      const cur = readSel();
      plPers(b.dataset.off).forEach((per) => { cur[per] = 'off'; });
      apply(plSegsFrom(cur, e.segs, home).map((s) => (e.duty ? s : { ...s, status: 'called' })));
    } else if (b.dataset.apply) {
      apply(plSegsFrom(readSel(), e.segs, home).map((s) => (e.duty || s.status === 'off' ? s : { ...s, status: 'called' })));
    } else if (b.dataset.rm || b.dataset.out) {
      delete PL.cur[e.key];
      if (b.dataset.out) { PL.pins.delete(e.key); PL.removed = [...(PL.removed || []).filter((r) => r.key !== e.key), { key: e.key, name: e.name, side: e.side }]; }
      PL.dirty = true;
      m.close();
      plDrawDay();
      if (b.dataset.out) toast(`${plName(e.name)} nöbetten çıkarıldı · kaydedince kesinleşir`);
    }
  });
};
/** Nöbetten çıkarmayı geri al: kişi kendi tarafına, kendi saatine döner */
ACT['pl-rm-undo'] = (el) => {
  const r = (PL.removed || [])[+el.dataset.i];
  if (!r) return;
  PL.removed.splice(+el.dataset.i, 1);
  const p = plDutyMap()[r.key];
  if (p && PL.cur) {
    const sd = PL.day.sides.find((s) => s.key === p.side) || { units: [''] };
    PL.cur[r.key] = { key: p.key, name: p.name, side: p.side, duty: true, segs: [{ unit: p.team ? PL_TEAM : sd.units[0], period: p.shift, status: 'work' }], method: 'elle', why: 'Elle' };
    PL.pins.add(r.key);
  }
  PL.dirty = true;
  plDrawDay();
};

/** Kişi seçici (o gün nöbetçi olmayan liste kişileri + elle yazılan ad) */
function plPersonPicker(id) {
  const d = PL.day;
  const used = new Set([...Object.keys(PL.cur || {}), ...(PL.standby || []).map((s) => s.key)]);
  const others = (d.others || []).filter((o) => !used.has(o.key));
  return html`<div class="field"><label>Kişi</label><select class="select" id="${id}Sel"><option value="">Seçin</option>
      ${d.sides.map((sd) => { const l = others.filter((o) => o.side === sd.key); return l.length ? html`<optgroup label="${sd.name}">${l.map((o) => html`<option value="${o.key}">${plName(o.name)} (${o.cross})</option>`)}</optgroup>` : ''; })}
      ${(() => { const l = others.filter((o) => o.excluded); return l.length ? html`<optgroup label="Nöbet dışı (yalnız elle, sayılmaz)">${l.map((o) => html`<option value="${o.key}">${plName(o.name)}</option>`)}</optgroup>` : ''; })()}
      <option value="__free">Listede yok · adı yazın</option></select></div>
    <div class="field hidden" id="${id}FreeF"><label>Ad soyad</label><input class="input" id="${id}Free" maxlength="120" placeholder="ör. Deniz Ak"></div>`;
}
function plPickerBind(m, id) {
  const s = $('#' + id + 'Sel', m.el);
  s.addEventListener('change', () => $('#' + id + 'FreeF', m.el).classList.toggle('hidden', s.value !== '__free'));
}
function plPickerValue(m, id) {
  const v = $('#' + id + 'Sel', m.el).value;
  if (!v) return null;
  if (v === '__free') {
    const n = $('#' + id + 'Free', m.el).value.trim();
    if (n.length < 3) return null;
    const k = 'n:' + avKey(n);
    const o = (PL.day.others || []).find((x) => avKey(x.name) === avKey(n));
    return o ? { key: o.key, name: o.name, side: o.side, cross: o.cross } : { key: k, name: n, side: '', cross: 0 };
  }
  const o = (PL.day.others || []).find((x) => x.key === v);
  return o ? { key: o.key, name: o.name, side: o.side, cross: o.cross } : null;
}
/** Ekstra kişi (listede yokken nöbete getirilen) ya da nöbete gelecek kişi "Geldi": hangi blokta, gündüz / gece / 24 */
function plCalledModal(pre, onDone) {
  const d = PL.day;
  const units = plUnitList(d, true);
  // O an eksik olan blok önce önerilsin (dönem dönem)
  const loadOf = (u, per) => { let n = 0; Object.values(PL.cur || {}).forEach((e) => e.segs.forEach((s) => { if (s.unit === u && s.status !== 'off' && plPers(s.period).includes(per)) n++; })); return n; };
  const firstShort = (per) => (units.find((u) => u.unit !== PL_TEAM && loadOf(u.unit, per) < ((d.needs[u.unit] || {})[per] || 0)) || units[0] || {}).unit;
  const opt = (sel) => units.map((u) => { const nd = d.needs[u.unit] || {}; return html`<option value="${u.unit}" ${u.unit === sel ? raw('selected') : ''}>${u.label} · ${u.sideName} (gündüz ${loadOf(u.unit, 'day')}/${nd.day || 0}, gece ${loadOf(u.unit, 'night')}/${nd.night || 0})</option>`; });
  const m = openModal({ title: pre ? `${plName(pre.name)} geldi` : 'Ekstra kişi ekle', size: 'narrow', body: html`<div class="stack">
      <p class="small muted">${pre ? 'Nereye ve hangi saatlerde geldi?' : 'Listede o gün nöbeti olmayan, nöbete getirilen kişi. Bloğa ve döneme sayılır; karşı taraftaysa ve gece içeriyorsa karşıya geçiş olarak sayılır.'}</p>
      ${pre ? '' : plPersonPicker('plc')}
      <div class="field"><label>Ne zaman geldi?</label><div class="seg seg-block pl-cper" role="group">
        <button type="button" class="on" data-p="night">Gece 16-08</button><button type="button" data-p="day">Gündüz 08-16</button><button type="button" data-p="24">24 saat</button><button type="button" data-p="split">Gündüz + gece ayrı blok</button></div></div>
      <div class="field" id="plcOne"><label>Blok</label><select class="select" id="plcUnit">${opt(firstShort('night'))}</select></div>
      <div class="grid2 hidden" id="plcTwo"><div class="field"><label>Gündüz (08-16) bloğu</label><select class="select" id="plcUnitD">${opt(firstShort('day'))}</select></div>
        <div class="field"><label>Gece (16-08) bloğu</label><select class="select" id="plcUnitN">${opt(firstShort('night'))}</select></div></div>
      <div class="field"><label>Sebep</label><div class="seg seg-block pl-ctag" role="group"><button type="button" class="on" data-t="called">Çağrıldı</button><button type="button" data-t="plain">Sebepsiz ekstra</button></div>
        <p class="tiny faint" style="margin-top:4px">Sebepsiz ekstra: kişi bloğa yazılır, “Çağrıldı” etiketi görünmez. Sayım kuralları aynıdır.</p></div></div>`,
  foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="plcGo">Ekle</button>` });
  if (!pre) plPickerBind(m, 'plc');
  let per = 'night';
  let plain = false;
  $('.pl-ctag', m.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    plain = b.dataset.t === 'plain';
    $$('.pl-ctag [data-t]', m.el).forEach((x) => x.classList.toggle('on', x === b));
  });
  $('.pl-cper', m.el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    per = b.dataset.p;
    $$('.pl-cper [data-p]', m.el).forEach((x) => x.classList.toggle('on', x === b));
    $('#plcOne', m.el).classList.toggle('hidden', per === 'split');
    $('#plcTwo', m.el).classList.toggle('hidden', per !== 'split');
    if (per !== 'split') { const u = firstShort(per === '24' ? 'night' : per); if (u) $('#plcUnit', m.el).value = u; }
  });
  $('#plcGo', m.el).addEventListener('click', () => {
    const who = pre || plPickerValue(m, 'plc');
    if (!who) { toast('Kişiyi seçin ya da adını yazın', 'err'); return; }
    if (plRemovedKeys().has(who.key)) { toast('Bu kişi nöbetten çıkarılmış; “Nöbetten çıkarılanlar” kartından geri alın', 'err'); return; }
    if (plDutyMap()[who.key]) { toast('Bu kişi o gün zaten listede; ona dokunarak düzenleyin', 'err'); return; }
    plEnsureCur();
    let segs;
    if (per === 'split') {
      const ud = $('#plcUnitD', m.el).value, un = $('#plcUnitN', m.el).value;
      segs = ud === un ? [{ unit: ud, period: '24', status: 'called' }] : [{ unit: ud, period: 'day', status: 'called' }, { unit: un, period: 'night', status: 'called' }];
    } else segs = [{ unit: $('#plcUnit', m.el).value, period: per, status: 'called' }];
    PL.cur[who.key] = { key: who.key, name: who.name, side: who.side, duty: false, crossBefore: who.cross || 0, segs, method: 'elle', why: plain ? '' : 'Nöbete getirildi', plain };
    if (onDone) onDone();
    PL.dirty = true;
    PL.edit = true;
    m.close();
    plDrawDay();
  });
}
ACT['pl-call-add'] = () => { plEnsureCur(); plCalledModal(null); };
ACT['pl-sb-add'] = () => {
  const m = openModal({ title: 'Nöbete gelecek kişi', size: 'narrow', body: html`<div class="stack"><p class="small muted">Gerekirse (ör. hasta yatışında) nöbete gelecek kişi. Ayrı gösterilir, sayılmaz; gelince <b>Geldi</b> ile bir yere yerleştirin.</p>${plPersonPicker('pls')}</div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="plsGo">Ekle</button>` });
  plPickerBind(m, 'pls');
  $('#plsGo', m.el).addEventListener('click', () => {
    const who = plPickerValue(m, 'pls');
    if (!who) { toast('Kişiyi seçin ya da adını yazın', 'err'); return; }
    plEnsureCur();
    PL.standby = [...(PL.standby || []), who];
    PL.dirty = true;
    m.close();
    plDrawDay();
  });
};
ACT['pl-sb-del'] = (el) => { PL.standby.splice(+el.dataset.i, 1); PL.dirty = true; plDrawDay(); };
ACT['pl-sb-came'] = (el) => {
  const i = +el.dataset.i;
  const who = PL.standby[i];
  if (who) plCalledModal(who, () => { PL.standby.splice(i, 1); });
};

/** Kura gösterimi: eşit adaylar arasında kısa bir döndürme, sonra kazanan */
function plReveal(ties) {
  return new Promise((resolve) => {
    const m = openModal({ title: 'Kura', size: 'narrow', body: html`<div class="pl-reveal">${ties.map((x, i) => html`<div class="draw-box">
        <div class="tiny faint">${x.from_name} → ${x.unit || x.to_name} · ${x.period === 'night' ? 'gece' : 'gündüz'} · ${x.group.length} kişi ${x.min} geçişle eşit</div>
        <div class="draw-roll" id="plRoll${i}">${plName(x.group[0])}</div><div class="small muted pl-rsub" id="plSub${i}">Kura çekiliyor…</div></div>`)}</div>`,
    foot: html`<button class="btn primary" data-act="close-modal">Tamam</button>`, onClose: () => resolve() });
    let n = 0;
    const t = setInterval(() => { n++; ties.forEach((x, i) => { const r = $('#plRoll' + i, m.el); if (r) r.textContent = plName(x.group[n % x.group.length]); }); }, 90);
    setTimeout(() => {
      clearInterval(t);
      ties.forEach((x, i) => {
        const r = $('#plRoll' + i, m.el);
        if (r) { r.textContent = plName(x.winner); r.classList.add('win'); }
        const s = $('#plSub' + i, m.el);
        if (s) s.textContent = `Adaylar: ${x.group.map(plName).join(', ')} · öneriye eklendi, kaydedince kesinleşir.`;
      });
    }, 1300);
  });
}

/* ---------------- Paylaşım: görsel (PNG) ve metin ---------------- */
/** Bir günün KAYITLI son hâli: {date, units: [{unit, label, side, sideName, tone, rows: [{name, code, period, status, moved, from, n}]}], standby: [...]} */
async function plShareData(date) {
  let d = PL.day && PL.day.date === date ? PL.day : null;
  if (!d) d = await api('placement.day', { date });
  if (!(d.saved || []).length) throw new Error('Bu gün için kayıtlı yerleşim yok. Önce kaydedin.');
  const { cur, standby } = plFromSaved(d);
  const team = plTeamVisible(d, cur);
  const duty = plDutyMapOf(d);
  const units = plUnitList(d, team).map((u) => ({ ...u, rows: [], day: 0, night: 0 }));
  const byU = Object.fromEntries(units.map((u) => [u.unit, u]));
  Object.values(cur).forEach((e) => {
    const n = (d.saved.find((s) => s.key === e.key) || {}).cross_total || 0;
    e.segs.forEach((s) => {
      const U = byU[s.unit];
      if (!U) return;
      const p = duty[e.key];
      const moved = s.status !== 'off' && s.unit !== PL_TEAM && e.side && U.side && U.side !== e.side;
      U.rows.push({ name: e.name, code: p && s.period === p.shift && e.segs.length === 1 ? p.code : { day: '8 16', night: '16 8', 24: '8 8' }[s.period], period: s.period, status: s.status, plain: !!e.plain, moved, from: moved ? plSideShort(e.side, d) : '', n });
      if (s.status !== 'off') plPers(s.period).forEach((per) => { U[per]++; });
    });
  });
  units.forEach((U) => U.rows.sort((a, b) => (a.status === 'off') - (b.status === 'off') || (b.period === '24') - (a.period === '24') || (a.period === 'night' ? 0 : 1) - (b.period === 'night' ? 0 : 1) || a.name.localeCompare(b.name, 'tr')));
  return { date, units, standby, team: plTeam(d) };
}

/** WhatsApp için düz metin */
async function plShareText(date) {
  const x = await plShareData(date);
  const dt = parseDT(date);
  const org = (S.settings && S.settings.org_name) || '';
  const tag = (r) => (r.status === 'off' ? ` (ofl. ${PL_PER_WORD[r.period]})` : r.status === 'called' && !r.plain ? ' (çağrıldı)' : '') + (r.status !== 'off' && r.period !== '24' ? ' ' + PL_PER[r.period] : '');
  const person = (r) => (r.status === 'off' ? `~${plShortName(r.name)}~` : plShortName(r.name)) + ` (${r.n})` + tag(r);
  const lines = [`*Blok yerleşimi · ${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${TR_DAYS[dt.getDay()]}*`];
  if (org) lines.push(org);
  lines.push('');
  x.units.forEach((u) => { lines.push(`*${u.label}*${u.sideName && u.unit !== PL_TEAM ? ' (' + u.sideName + ')' : ''}: ${u.rows.length ? u.rows.map(person).join(', ') : '—'}`); });
  if (x.standby.length) lines.push('', `_(Nöbete gelecek kişi)_: ${x.standby.map((s) => plShortName(s.name)).join(', ')}`);
  lines.push('', '( ) karşı tarafa toplam geçiş');
  return lines.join('\n');
}

const PL_IMG_TONE = { indigo: ['#4a50c9', '#ebecfb'], teal: ['#0b7a75', '#e1f3f1'], sky: ['#1f74b8', '#e3f0fa'], emerald: ['#17844a', '#e2f5ea'], rose: ['#c73a5c', '#fce8ed'], amber: ['#a76300', '#fdf1dc'], violet: ['#7b45c4', '#f1e9fb'], slate: ['#50606a', '#edf1f3'] };
const PL_IMG_CODE = { amber: ['#8a5300', '#fdecc8'], indigo: ['#3a3fb0', '#e1e3fb'], emerald: ['#136e3d', '#d5f2e1'], slate: ['#4b5a63', '#e8edf0'], teal: ['#0b6b66', '#d8f1ee'] };

/** Günün son yerleşimini modern bir PNG tabloya çizer (telefon dostu ~1080 px, 2x) → Blob */
async function plShareImage(date) {
  const x = await plShareData(date);
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { /* */ }
  const W = 1080, SC = 2, P = 44, GAP = 24;
  const F = (w, s) => `${w} ${s}px Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
  const meas = document.createElement('canvas').getContext('2d');
  const tw = (t, f) => { meas.font = f; return meas.measureText(t).width; };
  const fit = (t, f, max) => { if (tw(t, f) <= max) return t; let s = t; while (s.length > 1 && tw(s + '…', f) > max) s = s.slice(0, -1); return s + '…'; };
  const dt = parseDT(date);
  const org = (S.settings && S.settings.org_name) || '';
  const colW = (W - 2 * P - GAP) / 2;
  const ROW = 62, HEAD = 104;
  const cards = x.units.map((u) => ({ u, h: HEAD + Math.max(1, u.rows.length) * ROW + 22 }));
  const cols = [0, 0];
  const place = cards.map((c) => { const i = cols[0] <= cols[1] ? 0 : 1; const y = cols[i]; cols[i] += c.h + GAP; return { ...c, col: i, y }; });
  // Nöbete gelecek kişi şeridi (sarma)
  const sbF = F(600, 26);
  const sbRows = [];
  if (x.standby.length) {
    let line = [], w = 0;
    x.standby.forEach((s) => { const pw = tw(plShortName(s.name), sbF) + 40; if (w + pw > W - 2 * P - 48 && line.length) { sbRows.push(line); line = []; w = 0; } line.push(s); w += pw + 12; });
    if (line.length) sbRows.push(line);
  }
  const headH = 210;
  const bodyH = Math.max(cols[0], cols[1]) - GAP;
  const sbH = sbRows.length ? 86 + sbRows.length * 58 : 0;
  const H = Math.round(headH + 30 + bodyH + (sbH ? GAP + sbH : 0) + 110);
  const cv = document.createElement('canvas');
  cv.width = W * SC; cv.height = H * SC;
  const c = cv.getContext('2d');
  c.scale(SC, SC);
  const rr = (x0, y0, w, h, r) => { c.beginPath(); c.moveTo(x0 + r, y0); c.arcTo(x0 + w, y0, x0 + w, y0 + h, r); c.arcTo(x0 + w, y0 + h, x0, y0 + h, r); c.arcTo(x0, y0 + h, x0, y0, r); c.arcTo(x0, y0, x0 + w, y0, r); c.closePath(); };
  // Zemin ve başlık
  c.fillStyle = '#f3f6f8'; c.fillRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, headH);
  g.addColorStop(0, '#2aa38c'); g.addColorStop(1, '#2f8fc4');
  c.fillStyle = g; c.fillRect(0, 0, W, headH);
  c.fillStyle = 'rgba(255,255,255,.10)'; c.beginPath(); c.arc(W - 90, 30, 170, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.font = F(600, 24); c.textBaseline = 'alphabetic';
  c.fillText(fit(org.toLocaleUpperCase('tr') || 'DUPCII', F(600, 24), W - 2 * P), P, 62);
  c.fillStyle = '#ffffff'; c.font = F(800, 56); c.fillText('Blok yerleşimi', P, 128);
  c.font = F(500, 30); c.fillStyle = 'rgba(255,255,255,.92)';
  c.fillText(`${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${dt.getFullYear()} · ${TR_DAYS[dt.getDay()]}`, P, 176);
  // Kartlar
  const top = headH + 30;
  place.forEach(({ u, h, col, y }) => {
    const x0 = P + col * (colW + GAP), y0 = top + y;
    const [fg, bg] = PL_IMG_TONE[u.tone] || PL_IMG_TONE.slate;
    c.save(); c.shadowColor = 'rgba(15,27,33,.08)'; c.shadowBlur = 18; c.shadowOffsetY = 4; c.fillStyle = '#ffffff'; rr(x0, y0, colW, h, 24); c.fill(); c.restore();
    c.strokeStyle = '#e3e8ec'; c.lineWidth = 1.5; rr(x0, y0, colW, h, 24); c.stroke();
    c.fillStyle = bg; rr(x0 + 20, y0 + 22, 60, 60, 16); c.fill();
    c.fillStyle = fg; c.font = F(800, 32); c.textAlign = 'center'; c.fillText(plLetter(u.unit, { team: x.team, sides: plSides() }), x0 + 50, y0 + 64); c.textAlign = 'left';
    c.fillStyle = '#0f1b21'; c.font = F(700, 30); c.fillText(fit(u.label, F(700, 30), colW - 250), x0 + 96, y0 + 50);
    c.fillStyle = '#7c8a93'; c.font = F(500, 21); c.fillText(fit(u.unit === PL_TEAM ? 'Ekip' : String(u.sideName || ''), F(500, 21), colW - 120), x0 + 96, y0 + 78);
    const cov = `☀ ${u.day}  ☾ ${u.night}`;
    c.font = F(600, 22); c.fillStyle = '#4b5a63'; c.textAlign = 'right'; c.fillText(cov, x0 + colW - 22, y0 + 50); c.textAlign = 'left';
    c.strokeStyle = '#eef2f4'; c.beginPath(); c.moveTo(x0 + 20, y0 + HEAD - 6); c.lineTo(x0 + colW - 20, y0 + HEAD - 6); c.stroke();
    if (!u.rows.length) { c.fillStyle = '#9aa7af'; c.font = F(500, 24); c.fillText('—', x0 + 24, y0 + HEAD + 38); }
    u.rows.forEach((r, i) => {
      const ry = y0 + HEAD + i * ROW;
      const off = r.status === 'off';
      const tone = shiftTone({ kind: 'shift', hours: r.period === '24' ? 24 : 8, start: r.period === 'night' ? '16:00' : '08:00', end: r.period === 'day' ? '16:00' : '08:00' });
      const [cf, cb] = PL_IMG_CODE[tone] || PL_IMG_CODE.slate;
      const code = String(r.code || '');
      c.font = F(800, 20);
      const cw = Math.max(46, tw(code, F(800, 20)) + 20);
      c.globalAlpha = off ? 0.45 : 1;
      c.fillStyle = cb; rr(x0 + 22, ry + 12, cw, 36, 9); c.fill();
      c.fillStyle = cf; c.textAlign = 'center'; c.fillText(code, x0 + 22 + cw / 2, ry + 37); c.textAlign = 'left';
      // Rozetler (sağdan)
      let bx = x0 + colW - 22;
      const badge = (t, f, b) => { c.font = F(700, 18); const w = tw(t, F(700, 18)) + 20; bx -= w; c.fillStyle = b; rr(bx, ry + 15, w, 30, 8); c.fill(); c.fillStyle = f; c.fillText(t, bx + 10, ry + 36); bx -= 8; };
      c.globalAlpha = 1;
      if (off) badge('Ofl. ' + PL_PER_WORD[r.period], '#c73a5c', '#fce8ed');
      if (r.status === 'called' && !r.plain) badge('Çağrıldı', '#a76300', '#fdf1dc');
      if (r.moved) badge(r.from, '#a76300', '#fdf1dc');
      const nx = x0 + 22 + cw + 14;
      const nF = F(600, 27);
      const cnt = ` (${r.n})`;
      const nameMax = bx - nx - tw(cnt, F(600, 24)) - 6;
      const nm = fit(plName(r.name), nF, Math.max(40, nameMax)); // rozetlerin üstüne taşmasın
      c.globalAlpha = off ? 0.5 : 1;
      c.fillStyle = '#0f1b21'; c.font = nF; c.fillText(nm, nx, ry + 39);
      const nw = tw(nm, nF);
      c.fillStyle = '#7c8a93'; c.font = F(600, 24); c.fillText(cnt, nx + nw, ry + 39);
      if (off) { c.strokeStyle = '#4b5a63'; c.lineWidth = 2; c.beginPath(); c.moveTo(nx, ry + 30); c.lineTo(nx + nw, ry + 30); c.stroke(); }
      c.globalAlpha = 1;
    });
  });
  // Nöbete gelecek kişi
  let yy = top + bodyH;
  if (sbH) {
    yy += GAP;
    c.fillStyle = '#ffffff'; rr(P, yy, W - 2 * P, sbH, 24); c.fill();
    c.setLineDash([8, 6]); c.strokeStyle = '#b8c4cb'; c.lineWidth = 2; rr(P, yy, W - 2 * P, sbH, 24); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#0f1b21'; c.font = F(700, 27); c.fillText('(Nöbete gelecek kişi)', P + 24, yy + 50);
    sbRows.forEach((line, li) => {
      let px = P + 24;
      const py = yy + 74 + li * 58;
      line.forEach((s) => {
        const t = plShortName(s.name);
        const w = tw(t, sbF) + 40;
        c.fillStyle = '#edf1f3'; rr(px, py, w, 44, 22); c.fill();
        c.fillStyle = '#26343b'; c.font = sbF; c.fillText(t, px + 20, py + 31);
        px += w + 12;
      });
    });
    yy += sbH;
  }
  // Alt bilgi
  const now = new Date();
  c.fillStyle = '#7c8a93'; c.font = F(500, 21); c.textAlign = 'center';
  c.fillText('( ) karşı tarafa toplam geçiş · ☀ gündüz 08-16 · ☾ gece 16-08', W / 2, yy + 46);
  c.fillStyle = '#9aa7af'; c.font = F(600, 21);
  c.fillText(`dupcii · ${now.getDate()} ${TR_MONTHS_S[now.getMonth()]} ${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`, W / 2, yy + 80);
  c.textAlign = 'left';
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel oluşturulamadı'))), 'image/png'));
}

/** Paylaş penceresi: önizleme, WhatsApp'ta paylaş / indir, metin olarak kopyala */
async function plOpenShare(date) {
  const m = openModal({ title: 'Paylaş', size: 'narrow', body: html`<div class="pl-share"><div class="pl-share-prev"><div class="spinner"></div></div></div>`,
    foot: html`<button class="btn" data-copy="1">${icon('copy', 'sm')}<span>Metin olarak kopyala</span></button>${modOn('mesaj') && S.hosp && typeof shareToChat === 'function' ? html`<button class="btn" data-chat="1" disabled>${icon('chat', 'sm')}<span>Sohbette paylaş</span></button>` : ''}<button class="btn primary" data-share="1" disabled>${icon('send', 'sm')}<span>WhatsApp’ta paylaş</span></button>` });
  let blob = null, url = null, text = '';
  const name = `blok-${date}.png`;
  try {
    [blob, text] = await Promise.all([plShareImage(date), plShareText(date)]);
    url = URL.createObjectURL(blob);
    setHTML($('.pl-share-prev', m.el), html`<img src="${url}" alt="Blok yerleşimi ${date}">`);
    $$('[data-share],[data-chat]', m.el).forEach((b) => { b.disabled = false; });
  } catch (e) { setHTML($('.pl-share-prev', m.el), html`<p class="small muted">${e.message}</p>`); }
  const _close = m.close;
  m.close = () => { if (url) URL.revokeObjectURL(url); _close(); };
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-share],[data-copy],[data-chat]');
    if (!b) return;
    if (b.dataset.chat) {
      if (!blob) return;
      const dt0 = parseDT(date);
      m.close();
      shareToChat({ file: new File([blob], name, { type: 'image/png' }), text: `Blok yerleşimi · ${dt0.getDate()} ${TR_MONTHS[dt0.getMonth()]}`, title: 'Görseli sohbette paylaş' });
      return;
    }
    if (b.dataset.copy) {
      try { if (!text) text = await plShareText(date); await navigator.clipboard.writeText(text); toast('Metin kopyalandı · WhatsApp’a yapıştırabilirsiniz'); }
      catch (e) { toast(e.message && /yerleşim/.test(e.message) ? e.message : 'Kopyalanamadı', 'err'); }
      return;
    }
    if (!blob) return;
    const file = new File([blob], name, { type: 'image/png' });
    const dt = parseDT(date);
    const title = `Blok yerleşimi · ${dt.getDate()} ${TR_MONTHS[dt.getMonth()]}`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title, text: title }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('Görsel indirildi — WhatsApp’ta paylaşabilirsiniz');
  });
}
ACT['pl-share'] = () => plOpenShare(PL.date);
ACT['pl-share-home'] = (el) => plOpenShare(el.dataset.date);

/* ---------------- Ay: kim kaç kez, matris, geçmiş ---------------- */
function plDrawMonth() {
  const d = PL.mon;
  const host = $('#plMonth');
  if (!host || !d) return;
  const [y, m] = d.month.split('-').map(Number);
  const teamOn = d.team.members.length || d.stats.some((r) => r.units[PL_TEAM]);
  const units = plUnitList(d, teamOn);
  const selDay = PL.date.startsWith(d.month) ? +PL.date.slice(8, 10) : 0;
  const today = ymd(new Date());
  const wd = (dd) => new Date(y, m - 1, dd).getDay();
  // Kim kaç kez
  const s = PL.sort;
  const val = (r) => (s.k === 'name' ? r.name : s.k === 'side' ? plSideName(r.side, d) : s.k === 'last' ? (r.last_date || '') : s.k.startsWith('u:') ? (r.units[s.k.slice(2)] || 0) : r[s.k] || 0);
  const rows = [...d.stats].sort((a, b) => { const va = val(a), vb = val(b); return (typeof va === 'string' ? va.localeCompare(vb, 'tr') : va - vb) * s.d || a.name.localeCompare(b.name, 'tr'); });
  const th = (k, label, cls = '', title = '') => html`<th class="${cls} ${s.k === k ? 'on' : ''}" title="${title}"><button type="button" data-act="pl-sort" data-k="${k}">${label}${s.k === k ? (s.d > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const stats = html`<div class="card pl-tbl-card"><div class="pl-tbl-scroll"><table class="pl-tbl">
      <thead><tr>${th('name', 'Ad', 'pl-tn')}${th('month', 'Bu ay')}${th('total', 'Toplam')}${units.map((u) => th('u:' + u.unit, plLetter(u.unit, d), '', u.label))}${th('last', 'Son yer')}</tr></thead>
      <tbody>${rows.map((r) => html`<tr class="${plIsMe(r.name) ? 'me' : ''}"><th class="pl-tn"><span class="ellipsis">${plName(r.name)}</span><small>${plSideName(r.side, d) || 'listede yok'}${r.team ? ' · ' + d.team.name : ''}${r.adj ? ' · elle sayı var' : ''}</small></th>
        <td><b class="${r.month ? 'pl-hot' : 'faint'}">${r.month}</b></td><td><b>${r.total}</b></td>
        ${units.map((u) => html`<td class="${(r.units[u.unit] || 0) ? '' : 'faint'}">${r.units[u.unit] || 0}</td>`)}
        <td>${r.last_unit ? html`<span class="pl-ul sm tone-${plUnitInfo(r.last_unit, d).tone}" title="${plLabel(r.last_unit, d)}">${plLetter(r.last_unit, d)}</span> <span class="tiny faint">${plShortDate(r.last_date)}</span>` : html`<span class="faint">—</span>`}</td></tr>`)}</tbody></table></div>
    <p class="tiny faint pl-foot">Geçiş: karşı taraftaki blokta gece içeren nöbet (16-08 veya 24 saat). 08-16, ${d.team.name} ve oflanan dönem sayılmaz.${d.since ? ` Sayım ${fmtDate(d.since, true)} tarihinden beri.` : ''}</p></div>`;

  // Sorumlular ekibi
  const team = d.team;
  const teamCard = html`<div class="card pl-team-card"><div class="card-head"><h3>${icon('shield', 'sm')} ${team.name} ekibi · sabit kişiler</h3>${d.can_edit ? html`<button class="btn sm" data-act="pl-team">${icon('edit', 'sm')}<span>Düzenle</span></button>` : ''}</div>
    <div class="card-pad stack" style="gap:8px"><div class="pl-chips" style="padding:0">${team.members.length ? team.members.map((n) => html`<span class="pl-p"><span class="pl-nm">${plName(n)}</span></span>`) : html`<span class="small muted">Henüz sabit kişi yok.</span>`}</div>
      <p class="tiny faint">Sabit kişiler nöbetteyse otomatik olarak ${team.name}'a yerleşir; A/B/C'ye ve kuraya girmez. Elle iki yere bölünebilir (ör. gündüz ${team.name}, gece blok).${team.need.day || team.need.night ? ` Gereken: gündüz ${team.need.day}, gece ${team.need.night}.` : ''}</p></div></div>`;

  // Elle sayılar ve muaflar (yayıncı)
  const adj = d.can_edit ? html`<div class="pl-2col">
    <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Geçmiş sayılar (elle)</h3><button class="btn sm" data-act="pl-adj">${icon('plus', 'sm')}<span>Ekle</span></button></div>
      <div class="list">${d.adjust.length ? d.adjust.map((a) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${plName(a.name)}</div>
        <div class="lr-s">${a.cross_count ? `karşıya geçiş ${a.cross_count > 0 ? '+' : ''}${a.cross_count}` : ''}${a.cross_count && a.unit_count ? ' · ' : ''}${a.unit && a.unit_count ? `${plLabel(a.unit, d)} ${a.unit_count > 0 ? '+' : ''}${a.unit_count}` : ''}${a.note ? ' · ' + a.note : ''}</div></div>
        <button class="btn ghost icon sm" data-act="pl-adj" data-id="${a.id}" aria-label="Düzenle">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="pl-adj-del" data-id="${a.id}" aria-label="Sil">${icon('trash', 'sm')}</button></div>`)
        : html`<div class="list-row small muted">Uygulamadan önceki dönemde kim kaç kez karşıya geçtiyse buraya ekleyin; sayılara ve kura sırasına eklenir.</div>`}</div></div>
    <div class="card"><div class="card-head"><h3>${icon('shield', 'sm')} Kuradan muaf</h3><button class="btn sm" data-act="pl-ex">${icon('plus', 'sm')}<span>Ekle</span></button></div>
      <div class="list">${d.exempt.length ? d.exempt.map((x) => html`<div class="list-row ${x.active ? '' : 'pl-off'}"><div class="grow" style="min-width:0"><div class="lr-t">${plName(x.name)}</div>
        <div class="lr-s">${PL_SCOPE[x.scope] || x.scope}${x.until ? ` · ${fmtDate(x.until)} tarihine kadar` : ' · süresiz'}${x.active ? '' : ' · süresi doldu'}${x.note ? ' · ' + x.note : ''}</div></div>
        <button class="btn ghost icon sm" data-act="pl-ex-del" data-id="${x.id}" aria-label="Kaldır">${icon('trash', 'sm')}</button></div>`)
        : html`<div class="list-row small muted">Muaf kişi yok. Muaflar karşı tarafa kura ile gönderilmez.</div>`}</div></div></div>` : '';

  // Matris
  const cell = (pl) => {
    const letters = pl.u.map((u) => plLetter(u, d)).join('');
    const offL = pl.off.map((u) => plLetter(u, d)).join('');
    return pl.st === 'standby' ? html`<span class="pl-cell sb" title="Nöbete gelecek">⋯</span>`
      : letters ? html`<span class="pl-cell tone-${plUnitInfo(pl.u[0], d).tone} ${pl.st === 'called' ? 'called' : ''}">${letters}</span>`
        : offL ? html`<span class="pl-cell offc">${offL}</span>` : '';
  };
  const matrix = (sd) => html`<div class="sec-title">${icon('table', 'sm')} ${sd.name} <span class="tiny faint">· ${sd.units.join(', ')}</span></div>
    <div class="card tr-mx-wrap"><div class="tr-mx-scroll"><table class="tr-mx pl-mx">
      <thead><tr><th class="tr-n">Personel</th>${Array.from({ length: d.days }, (_, i) => i + 1).map((dd) => html`<th class="${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''} ${`${d.month}-${pad(dd)}` === today ? 'td' : ''} ${dd === selDay ? 'sel' : ''}"><button type="button" data-act="pl-day" data-d="${dd}">${dd}<small>${['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][wd(dd)]}</small></button></th>`)}<th class="tr-c" title="Bu ay karşıya geçiş">Ay</th><th class="tr-c" title="Toplam geçiş">Top.</th></tr></thead>
      <tbody>${sd.people.length ? sd.people.map((p) => {
        const st = d.stats.find((x) => x.key === p.key) || { month: 0, total: 0 };
        return html`<tr class="${plIsMe(p.name) ? 'me' : ''}"><th class="tr-n" title="${p.title || ''}">${plName(p.name)}</th>${Array.from({ length: d.days }, (_, i) => i + 1).map((dd) => {
          const x = p.days[dd];
          const pl = (d.placed[`${d.month}-${pad(dd)}`] || {})[p.key];
          const cls = `${dd === selDay ? 'sel' : ''} ${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''} ${pl && pl.x ? 'tr-moved' : ''}`;
          const ttl = pl ? `${x ? x.code + ' · ' : ''}${pl.u.map((u) => plLabel(u, d)).join(' + ')}${pl.off.length ? ' · ofl.' : ''}${pl.st === 'called' ? ' · çağrıldı' : pl.st === 'standby' ? ' · nöbete gelecek' : ''}${pl.x ? (pl.c ? ' · karşıya geçiş (sayıldı)' : ' · karşı taraf (sayılmadı)') : ''} · ${PL_METHOD[pl.m] || pl.m || ''}` : (x ? x.code : '');
          if (!x) return html`<td class="${cls}" title="${ttl}">${pl ? cell(pl) : ''}</td>`;
          const tone = shiftTone(x);
          const c = x.kind === 'shift' ? (tone === 'emerald' ? '24' : tone === 'indigo' ? 'N' : 'G') : String(x.code).slice(0, 3);
          return html`<td class="${cls}" title="${ttl}">${pl && (pl.u.length || pl.off.length) ? cell(pl) : html`<span class="tr-c-${tone}">${c}</span>`}${pl && pl.x ? html`<i>${c}</i>` : ''}</td>`;
        })}<td class="tr-c"><b>${st.month || ''}</b></td><td class="tr-c"><b>${st.total}</b></td></tr>`;
      }) : html`<tr><td colspan="${d.days + 3}" class="small muted" style="text-align:left;padding:10px">Bu ay bu tarafın listesinde kimse yok.</td></tr>`}</tbody></table></div></div>`;

  // Geçmiş
  const log = [...d.log].reverse();
  const itemTxt = (it) => {
    const st = it.status === 'off' ? `ofl. ${PL_PER_WORD[it.period]}` : it.status === 'called' ? 'çağrıldı' : PL_METHOD[it.method] || it.method;
    const per = it.status !== 'off' && it.period && it.period !== '24' ? ' · ' + PL_PER[it.period] : '';
    const move = it.to && it.from && it.to !== it.from ? `${plSideName(it.from, d)} → ` : '';
    return `${move}${plLabel(it.unit, d)}${it.code ? ' · ' + it.code : ''}${per} · ${st}${it.status === 'off' ? '' : it.counted ? ' · sayıldı' : (it.to && it.from && it.to !== it.from ? ' · sayılmadı' : '')}`;
  };
  const logHtml = log.length ? html`<div class="card"><div class="list">${log.map((g) => html`<div class="list-row pl-log">
      <button type="button" class="pl-logd" data-act="pl-day" data-d="${+g.date.slice(8, 10)}"><b>${+g.date.slice(8, 10)}</b><small>${TR_DAYS_S[parseDT(g.date).getDay()]}</small></button>
      <div class="grow" style="min-width:0"><div class="small">${g.legacy ? 'Taraf kaydı (eski)' : `${g.n} kişi yerleşti`}${g.by ? ' · ' + g.by : ''}${g.at ? html` <span class="faint">· ${fmtRel(g.at)}</span>` : ''}</div>
        ${g.items.length ? g.items.map((it) => html`<div class="pl-logi"><span class="pl-ul sm tone-${plUnitInfo(it.unit, d).tone}">${plLetter(it.unit, d)}</span><span class="small"><b>${plName(it.name)}</b> ${itemTxt(it)}</span>
          ${it.pool && it.pool.pool ? html`<div class="tiny faint pl-logp">Adaylar: ${it.pool.pool.map((c) => `${plName(c.name)} (${c.cross})`).join(', ')}${it.pool.group && it.pool.group.length > 1 ? ' · kura: ' + it.pool.group.map(plName).join(', ') : ''}</div>` : ''}</div>`)
        : html`<div class="tiny faint">Herkes kendi tarafında</div>`}</div></div>`)}</div></div>`
    : html`<div class="card empty"><p class="small">Bu ay kayıtlı yerleşim yok.</p></div>`;

  setHTML(host, html`<div class="pl-mhead"><div class="sec-title">${icon('chart', 'sm')} Kim kaç kez</div><span class="grow"></span>
      <div class="pl-mnav"><button class="btn sm icon" data-act="tr-mv" data-d="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b>${TR_MONTHS[m - 1]} ${y}</b><button class="btn sm icon" data-act="tr-mv" data-d="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div></div>
    ${stats}${teamCard}${adj}${d.sides.map(matrix)}
    <div class="sec-title">${icon('history', 'sm')} ${TR_MONTHS[m - 1]} kayıtları</div>${logHtml}`);
}
ACT['pl-sort'] = (el) => { const k = el.dataset.k; PL.sort = PL.sort.k === k ? { k, d: -PL.sort.d } : { k, d: k === 'name' || k === 'side' || k === 'last' ? 1 : -1 }; plDrawMonth(); };

function plMonthPeople() {
  const d = PL.mon;
  const seen = new Set();
  const out = [];
  (d ? d.stats : []).forEach((r) => { if (!seen.has(r.key)) { seen.add(r.key); out.push(r); } });
  return out.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/* Sorumlular ekibi */
ACT['pl-team'] = () => {
  const d = PL.mon;
  const t = d.team;
  const members = [...t.members];
  const ppl = plMonthPeople();
  const m = openModal({ title: `${t.name} ekibi`, size: 'narrow', body: html`<div class="stack">
      <div class="field"><label>Ekip adı</label><input class="input" id="ptName" maxlength="40" value="${t.name}"></div>
      <div class="field"><label>Sabit kişiler</label><div class="pl-chips" id="ptList" style="padding:0"></div></div>
      <div class="row"><select class="select grow" id="ptAdd"><option value="">Kişi ekle…</option>${ppl.map((p) => html`<option value="${p.name}">${plName(p.name)} · ${plSideName(p.side, d) || '—'}</option>`)}</select></div>
      <div class="grid2"><div class="field"><label>Gereken · gündüz</label><input class="input" type="number" min="0" max="30" id="ptDay" value="${t.need.day}"></div><div class="field"><label>Gereken · gece</label><input class="input" type="number" min="0" max="30" id="ptNight" value="${t.need.night}"></div></div>
      <p class="tiny faint">Sabit kişiler nöbetteyse otomatik dağıtımda hep ${t.name}'a yerleşir, A/B/C'ye ve kuraya girmez. Gereken sayı isteğe bağlıdır; güne özel sayı “Gereken kişi”den değiştirilir.</p></div>`,
  foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="ptGo">Kaydet</button>` });
  const draw = () => setHTML($('#ptList', m.el), members.length ? members.map((n, i) => html`<span class="pl-p"><span class="pl-nm">${plName(n)}</span><button type="button" class="btn ghost icon sm" data-rm="${i}" aria-label="Çıkar">${icon('x', 'sm')}</button></span>`) : html`<span class="tiny faint">Kimse yok</span>`);
  draw();
  $('#ptAdd', m.el).addEventListener('change', (e) => { const v = e.target.value; if (v && !members.some((x) => avKey(x) === avKey(v))) members.push(v); e.target.value = ''; draw(); });
  m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { members.splice(+b.dataset.rm, 1); draw(); } });
  $('#ptGo', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { await api('placement.team.save', { name: $('#ptName', m.el).value, members, need: { day: +$('#ptDay', m.el).value || 0, night: +$('#ptNight', m.el).value || 0 } }); m.close(); toast('Ekip kaydedildi'); plRefreshAll(); } catch (err) { toast(err.message, 'err'); }
  }));
};

/* Elle geçmiş sayı */
ACT['pl-adj'] = (el) => {
  const d = PL.mon;
  const a = el.dataset.id ? d.adjust.find((x) => x.id === +el.dataset.id) : null;
  const ppl = plMonthPeople();
  const units = plUnitList(d, true);
  const m = openModal({ title: a ? 'Geçmiş sayıyı düzenle' : 'Geçmiş sayı ekle', size: 'narrow', body: html`<div class="stack">
      <p class="small muted">Uygulamadan önce kim kaç kez karşı tarafa geçtiyse (ve hangi blokta kaç kez çalıştıysa) girin. Sayılar toplamlara ve kura sırasına eklenir.</p>
      <div class="field"><label>Kişi</label><select class="select" id="paName"><option value="">Seçin</option>${ppl.map((p) => html`<option value="${p.name}" ${a && avKey(a.name) === avKey(p.name) ? raw('selected') : ''}>${plName(p.name)} · ${plSideName(p.side, d) || '—'}</option>`)}
        ${a && !ppl.some((p) => avKey(p.name) === avKey(a.name)) ? html`<option value="${a.name}" selected>${plName(a.name)}</option>` : ''}</select></div>
      <div class="field"><label>Karşı tarafa geçiş (gece içeren)</label><input class="input" type="number" id="paCross" min="-50" max="200" inputmode="numeric" value="${a ? a.cross_count : 0}"><p class="hint">Eksi sayı düzeltme içindir (ör. −1).</p></div>
      <div class="grid2"><div class="field"><label>Yer <span class="faint">(isteğe bağlı)</span></label><select class="select" id="paUnit"><option value="">—</option>${units.map((u) => html`<option value="${u.unit}" ${a && a.unit === u.unit ? raw('selected') : ''}>${u.label}</option>`)}</select></div>
        <div class="field"><label>Orada kaç kez</label><input class="input" type="number" id="paUc" min="-50" max="500" inputmode="numeric" value="${a ? a.unit_count : 0}"></div></div>
      <div class="field"><label>Not <span class="faint">(yalnız sorumlular görür)</span></label><input class="input" id="paNote" maxlength="200" value="${(a && a.note) || ''}" placeholder="ör. Ekim 2026 öncesi"></div></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="paGo">Kaydet</button>` });
  $('#paGo', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      await api('placement.adjust.save', { id: a ? a.id : 0, name: $('#paName', m.el).value, cross_count: +$('#paCross', m.el).value || 0, unit: $('#paUnit', m.el).value, unit_count: +$('#paUc', m.el).value || 0, note: $('#paNote', m.el).value });
      m.close(); toast('Kaydedildi'); plRefreshAll();
    } catch (err) { toast(err.message, 'err'); }
  }));
};
ACT['pl-adj-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Geçmiş sayı silinsin mi?', text: 'Bu elle girilen sayı toplamlardan çıkarılır.', ok: 'Sil', danger: true }))) return;
  try { await api('placement.adjust.delete', { id: +el.dataset.id }); toast('Silindi'); plRefreshAll(); } catch (e) { toast(e.message, 'err'); }
};

/* Muafiyet */
ACT['pl-ex'] = () => {
  const ppl = plMonthPeople();
  const d = PL.mon;
  const m = openModal({ title: 'Kuradan muaf tut', size: 'narrow', body: html`<div class="stack">
      <div class="field"><label>Kişi</label><select class="select" id="peName"><option value="">Seçin</option>${ppl.map((p) => html`<option value="${p.name}">${plName(p.name)} · ${plSideName(p.side, d) || '—'}</option>`)}</select></div>
      <div class="field"><label>Neden muaf</label><select class="select" id="peScope">${Object.entries(PL_SCOPE).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
      <div class="field"><label>Bitiş <span class="faint">(boş = süresiz)</span></label><input class="input" type="date" id="peUntil"></div>
      <div class="field"><label>Gerekçe <span class="faint">(yalnız sorumlular görür)</span></label><input class="input" id="peNote" maxlength="200"></div></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="peGo">Kaydet</button>` });
  $('#peGo', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { await api('rules.exempt.save', { name: $('#peName', m.el).value, scope: $('#peScope', m.el).value, until: $('#peUntil', m.el).value, note: $('#peNote', m.el).value }); m.close(); toast('Muaf tutuldu'); plRefreshAll(); } catch (err) { toast(err.message, 'err'); }
  }));
};
ACT['pl-ex-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Muafiyet kaldırılsın mı?', text: 'Kişi bundan sonra kuraya girer.', ok: 'Kaldır', danger: true }))) return;
  try { await api('rules.exempt.delete', { id: +el.dataset.id }); toast('Kaldırıldı'); plRefreshAll(); } catch (e) { toast(e.message, 'err'); }
};

/** Sayılar değişince gün (öneri korunur) ve ay yenilenir */
async function plRefreshAll() {
  try {
    const d = await api('placement.day', { date: PL.date });
    PL.day = d;
    if (!PL.prop && !PL.dirty) plBuildCur();
    plDrawDay();
  } catch (e) { /* */ }
  plLoadMonth(true);
}

/* Taraflar (yönetici) */
ACT['pl-setup'] = async () => {
  let g;
  try { g = await api('side.get', { month: PL.date.slice(0, 7) }); } catch (e) { toast(e.message, 'err'); return; }
  const rosters = g.rosters || [];
  const list = g.sides.length ? g.sides.map((s) => ({ ...s, units: s.units.join(', ') })) : [
    { key: 's3', name: '3. Basamak', roster_id: 0, units: 'B blok', cross_in: [], max_streak: 0 }, { key: 's2', name: '2. Basamak', roster_id: 0, units: 'A blok, C blok', cross_in: ['A blok'], max_streak: 2 }];
  list.forEach((s) => { if (!s.roster_id) { const n = (s.name.match(/\d/) || [])[0]; const r = n && rosters.find((x) => x.name.includes(n)); if (r) s.roster_id = r.id; } });
  const unitsOf = (c) => c.querySelector('[name=units]').value.split(',').map((x) => x.trim()).filter(Boolean);
  const crossHtml = (units, sel) => units.length > 1 ? units.map((u) => html`<label class="small pl-cin"><input type="checkbox" value="${u}" ${sel.includes(u) ? raw('checked') : ''}> ${u}</label>`) : html`<span class="tiny faint">Tek blok</span>`;
  const row = (s) => html`<div class="card card-pad stack pl-side-f">
    <div class="row" style="gap:8px"><b class="grow">Taraf</b><button type="button" class="btn sm ghost danger" data-rm="1">${icon('trash', 'sm')}Kaldır</button></div>
    <div class="grid2"><div class="field"><label>Taraf adı</label><input class="input" name="name" value="${s.name}" placeholder="3. Basamak"></div>
      <div class="field"><label>Nöbet listesi</label><select class="select" name="roster_id"><option value="0">— Seçin</option>${rosters.map((r) => html`<option value="${r.id}" ${r.id === +s.roster_id ? raw('selected') : ''}>${r.name}</option>`)}</select></div></div>
    <div class="field"><label>Bloklar / alanlar <span class="faint">(virgülle; sıra öncelik: eksikte önce üstteki dolar, eşitlemede alttaki)</span></label><input class="input" name="units" value="${s.units}" placeholder="A blok, C blok"><input type="hidden" name="key" value="${s.key}"></div>
    <div class="grid2"><div class="field"><label>Karşı taraftan gelen yalnız şu bloklara</label><div class="row wrap pl-cins" style="gap:10px">${crossHtml(String(s.units).split(',').map((x) => x.trim()).filter(Boolean), s.cross_in || [])}</div><p class="hint">Hiçbiri seçilmezse tüm bloklara. Ör. 3. basamaktan gelen yalnız A blok.</p></div>
      <div class="field"><label>Aynı blokta üst üste en fazla</label><input class="input" type="number" min="0" max="10" name="max_streak" value="${s.max_streak || 0}" style="max-width:110px"><p class="hint">Ör. 2: A'da üst üste 2 nöbetten sonra C'ye (tersi de). 0: sınırsız. Önceki ay da sayılır.</p></div></div></div>`;
  const m = openModal({ title: 'Taraflar ve bloklar', size: 'wide', body: html`<div class="stack"><p class="small muted">Her taraf bir nöbet listesine bağlanır. Listesindeki kişiler normalde o tarafın bloklarında çalışır; karşı tarafın bloğuna gece içeren nöbetle geçenler sayılır. Tek servisli birimde tek taraf ve tek alan yeterlidir. Sorumlular ekibi ayrıdır (Taraf sayfasındaki ekip kartı).</p>
      <div class="stack" id="plSidesL">${list.map(row)}</div>
      <div><button type="button" class="btn sm" id="plSideAdd">${icon('plus', 'sm')}Taraf ekle</button></div>
      <div class="field"><label>Sayımın başlangıcı <span class="faint">(isteğe bağlı)</span></label><input class="input" type="date" id="plSince" value="${g.since || ''}" style="max-width:200px"><p class="hint">Yeni bir dönem başlatmak için tarih seçin; bu tarihten önceki yerleşimler sayılmaz (elle girilen geçmiş sayılar her zaman eklenir).</p></div></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="plSidesSave">Kaydet</button>` });
  const L = $('#plSidesL', m.el);
  L.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) b.closest('.pl-side-f').remove(); });
  L.addEventListener('input', (e) => {
    if (e.target.name !== 'units') return;
    const c = e.target.closest('.pl-side-f');
    const box = c.querySelector('.pl-cins');
    const sel = $$('input:checked', box).map((x) => x.value);
    setHTML(box, crossHtml(unitsOf(c), sel));
  });
  $('#plSideAdd', m.el).addEventListener('click', () => { L.insertAdjacentHTML('beforeend', fmtVal(row({ key: '', name: '', roster_id: 0, units: '', cross_in: [], max_streak: 0 }))); });
  $('#plSidesSave', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const sides = $$('.pl-side-f', m.el).map((c) => ({ key: c.querySelector('[name=key]').value, name: c.querySelector('[name=name]').value, roster_id: +c.querySelector('[name=roster_id]').value, units: unitsOf(c),
      cross_in: $$('.pl-cins input:checked', c).map((x) => x.value), max_streak: +c.querySelector('[name=max_streak]').value || 0 }));
    try { await api('side.settings', { sides, since: $('#plSince', m.el).value }); m.close(); toast('Taraflar kaydedildi'); PL.mon = null; plReset(); await plLoadDay(); } catch (err) { toast(err.message, 'err'); }
  }));
};

/* ---------------- Ana sayfa kartı: bugün bloklar ---------------- */
NM_EXT.homeCards.push({
  id: 'bloklar', mod: 'taraf', title: 'Bugün bloklar', icon: 'layers', order: 10, place: 'top',
  render: async (el) => {
    let r;
    try { r = await api('placement.today'); } catch (e) { el.remove(); return; }
    if (!r.sides || !plLayoutOk(r.sides) || (!r.saved.length && !r.on_duty)) { el.remove(); return; }
    const src = { sides: r.sides, team: r.team };
    const sb = r.saved.filter((s) => s.status === 'standby');
    const work = r.saved.filter((s) => s.status !== 'standby');
    const teamOn = work.some((s) => s.unit === PL_TEAM);
    const units = plUnitList(src, teamOn);
    const sideOf = {};
    r.sides.forEach((sd) => sd.units.forEach((u) => { sideOf[u] = sd.key; }));
    const person = (s) => {
      const moved = s.status !== 'off' && s.unit !== PL_TEAM && s.side && sideOf[s.unit] && sideOf[s.unit] !== s.side;
      return html`<span class="pl-hp ${moved ? 'in' : ''} ${s.status === 'off' ? 'off' : ''} ${plIsMe(s.name) ? 'me' : ''}" title="${s.code || PL_PER[s.period]}${moved ? ' · ' + plSideName(s.side, src) + ' listesinden' : ''}"><span class="pl-hpn">${pName(plName(s.name))}</span> <small>(${s.cross_total})</small>${s.period !== '24' && s.status !== 'off' ? html` <small class="pl-hper">${PL_PER_WORD[s.period]}</small>` : ''}${s.status === 'off' ? html` <span class="pl-tag off">Ofl. ${PL_PER_WORD[s.period]}</span>` : ''}${s.status === 'called' && !s.plain ? html` <span class="pl-tag called">Çağrıldı</span>` : ''}</span>`;
    };
    const body = work.length
      ? html`<div class="pl-hgrid">${units.map((u) => {
          const l = work.filter((s) => s.unit === u.unit).sort((a, b) => (a.status === 'off') - (b.status === 'off') || a.name.localeCompare(b.name, 'tr'));
          return html`<div class="pl-hu"><span class="pl-ul tone-${u.tone}" title="${u.label} · ${u.sideName}">${plLetter(u.unit, src)}</span><div class="pl-hn">${u.unit === PL_TEAM ? html`<span class="pl-hlbl">${u.label}</span>` : ''}${l.length ? l.map(person) : html`<span class="tiny faint">—</span>`}</div></div>`;
        })}</div>
        ${sb.length ? html`<div class="pl-hsb"><span class="tiny faint">(Nöbete gelecek kişi)</span>${sb.map((s) => html`<span class="pl-hp sb ${plIsMe(s.name) ? 'me' : ''}">${pName(plName(s.name))}</span>`)}</div>` : ''}`
      : html`<div class="pl-hempty small muted">${icon('clock', 'sm')}<span class="grow">Bugünün blok yerleşimi henüz yapılmadı${r.on_duty ? ` · ${r.on_duty} kişi nöbette` : ''}.</span>${r.can_edit ? html`<a class="btn sm primary" href="#/taraf/${r.date}">Yerleştir</a>` : ''}</div>`;
    setHTML(el, html`<div class="card pl-home"><div class="card-head"><h3>${icon('layers', 'sm')} Bugün bloklar</h3>
      ${r.mine ? html`<span class="badge brand pl-mine">Sen: ${r.mine}</span>` : ''}
      ${r.can_edit && work.length ? html`<button class="btn ghost icon sm" data-act="pl-share-home" data-date="${r.date}" title="Paylaş" aria-label="Paylaş">${icon('send', 'sm')}</button>` : ''}<a class="small" href="#/taraf/${r.date}">Tümü</a></div>${body}
      <div class="tiny faint pl-hfoot">${work.length ? html`<span class="grow">( ) karşı tarafa toplam geçiş · <span class="pl-hp in sm">renkli</span> karşı taraftan gelen</span>` : html`<span class="grow"></span>`}
        <a class="pl-hist" href="#/taraf/${plAddDays(r.date, -1)}">${icon('history', 'sm')}Geçmiş günler</a></div></div>`);
  },
});

/* ---------------- Kayıt etiketleri ---------------- */
Object.assign(NM_EXT.audit, {
  'placement.save': 'Blok yerleşimini kaydetti', 'placement.draw': 'Blok kurası çekti', 'placement.clear': 'Blok yerleşimini sildi',
  'placement.counts': 'Güne özel kişi sayısı', 'placement.adjust': 'Geçmiş geçiş sayısı girdi', 'placement.team': 'Sorumlular ekibini düzenledi',
});
