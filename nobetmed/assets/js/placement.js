/* dupcii — Günlük blok yerleşimi (#/taraf): o gün nöbette olanlar bloklara; karşı tarafa geçiş sayımı ve kura */
'use strict';

const PL = { date: '', day: null, prop: null, cur: null, pins: new Set(), dirty: false, edit: false, ym: '', mon: null, monYm: '', sort: { k: 'total', d: -1 }, tok: 0 };
const PL_TONES = ['indigo', 'teal', 'sky', 'emerald', 'rose', 'violet'];
const PL_PER = { day: '08-16', night: '16-08', 24: '24 saat' };
const PL_METHOD = { auto: 'otomatik', kura: 'kura', elle: 'elle' };
const PL_SCOPE = { kura: 'Kura / blok yerleşimi', kaydirma: 'Kaydırma', cagri: 'Eksik çağrısı', all: 'Hepsi' };

/* ---------------- Yardımcılar ---------------- */
function plLetter(u) {
  const m = /^\s*(\S)/u.exec(String(u || ''));
  return m ? m[1].toLocaleUpperCase('tr') : '?';
}
function plName(n) {
  return String(n || '').toLocaleLowerCase('tr').replace(/(^|[\s\-'’.(])(\S)/gu, (m, a, b) => a + b.toLocaleUpperCase('tr'));
}
function plSides() { return (PL.day && PL.day.sides) || (PL.mon && PL.mon.sides) || []; }
function plUnitList(sides) {
  const out = [];
  (sides || plSides()).forEach((sd) => sd.units.forEach((u) => out.push({ unit: u, side: sd.key, sideName: sd.name, tone: PL_TONES[out.length % PL_TONES.length] })));
  return out;
}
function plUnitInfo(u, sides) { return plUnitList(sides).find((x) => x.unit === u) || { unit: u, side: '', sideName: '', tone: 'slate' }; }
function plSideName(k, sides) { return ((sides || plSides()).find((s) => s.key === k) || {}).name || k || ''; }
function plChip(p) { return codeChip({ code: p.code, kind: p.kind || 'shift', hours: p.hours, start: p.start, end: p.end }); }
function plIsMe(name) { return S.me && avKey(name) === avKey(S.me.name); }
function plShortDate(d) { const x = parseDT(d); return x ? `${x.getDate()} ${TR_MONTHS_S[x.getMonth()]}` : d; }
function plAddDays(d, n) { const x = parseDT(d); x.setDate(x.getDate() + n); return ymd(x); }
function plPeriodsOf(p) { return p.shift === '24' ? ['day', 'night'] : [p.shift]; }

/* ---------------- Sayfa ---------------- */
async function renderPlacement(view, r) {
  const want = r && /^\d{4}-\d{2}-\d{2}$/.test(r[1] || '') ? r[1] : (PL.date || ymd(new Date()));
  if (want !== PL.date) { PL.prop = null; PL.cur = null; PL.dirty = false; PL.pins = new Set(); PL.edit = false; }
  PL.date = want;
  setHTML(view, html`${hubHead('taraf', 'Günlük blok yerleşimi · kim hangi blokta, kim kaç kez karşıya geçti', html`<div class="row wrap" style="gap:6px" id="plActs">${isAdmin() ? html`<button class="btn" data-act="pl-setup">${icon('sliders', 'sm')}<span>Taraflar</span></button>` : ''}</div>`)}
    <div id="plDay" class="pl-root"><div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>
    <div id="plMonth" class="pl-root"></div>`);
  await plLoadDay();
}
NM_EXT.routes.taraf = (view, r) => renderPlacement(view, r);

async function plLoadDay() {
  const tok = ++PL.tok;
  const date = PL.date;
  let d;
  try { d = await api('placement.day', { date }); } catch (e) {
    const b = $('#plDay'); if (b && tok === PL.tok) setHTML(b, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return;
  }
  if (tok !== PL.tok) return;
  PL.day = d;
  plBuildCur();
  plDrawDay();
  plLoadMonth();
}

async function plLoadMonth(force) {
  const ym = PL.date.slice(0, 7);
  if (!force && PL.mon && PL.monYm === ym) { plDrawMonth(); return; }
  if (!PL.day || PL.day.sides.length < 2) { setHTML($('#plMonth'), ''); return; }
  let d;
  try { d = await api('placement.month', { month: ym }); } catch (e) { const b = $('#plMonth'); if (b) setHTML(b, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (ym !== PL.date.slice(0, 7)) return;
  PL.mon = d; PL.monYm = ym;
  plDrawMonth();
}

/** Çalışılan atama: öneri varsa öneri (+ elle değişiklikler), yoksa kayıtlı yerleşim */
function plBuildCur() {
  const d = PL.day;
  PL.cur = null;
  if (PL.prop) {
    PL.cur = {};
    PL.prop.items.forEach((it) => { PL.cur[it.key] = { unit: it.unit, method: it.method, why: it.why, draw: it.draw }; });
  } else if (d.saved.length) {
    const keys = new Set(d.people.map((p) => p.key));
    PL.cur = {};
    d.saved.forEach((s) => { if (keys.has(s.key)) PL.cur[s.key] = { unit: s.unit, method: s.method, why: s.why, pool: s.pool }; });
  }
}

/** Elle düzenlemeye boş başlarken: herkes kendi tarafında (çok birimli tarafta sırayla) */
function plHomeDefault() {
  const d = PL.day;
  const cur = {};
  const idx = {};
  d.people.forEach((p) => {
    const sd = d.sides.find((s) => s.key === p.side);
    if (!sd) return;
    idx[sd.key] = (idx[sd.key] || 0) + 1;
    cur[p.key] = { unit: sd.units[(idx[sd.key] - 1) % sd.units.length], method: 'elle', why: '' };
  });
  return cur;
}

function plUnitOfSide(u) { const x = plUnitInfo(u); return x.side; }

/** Kişinin bu yerleşimle birlikte geçiş sayısı */
function plCrossShown(p) {
  const c = PL.cur && PL.cur[p.key];
  if (!c) return p.cross_now;
  const counted = plUnitOfSide(c.unit) !== p.side && p.shift !== 'day';
  return p.cross + (counted ? 1 : 0);
}

function plNeedPill(placed, need, per) {
  const tone = !need ? (placed ? 'info' : '') : placed < need ? 'danger' : placed > need ? 'warn' : 'success';
  return html`<span class="badge ${tone} pl-need" title="${per === 'day' ? 'Gündüz 08-16' : 'Gece 16-08'}: ${placed} yerleşti${need ? ' · gereken ' + need : ''}">${icon(per === 'day' ? 'sun' : 'moon', 'sm')}${placed}${need ? html`<span class="pl-need-of">/${need}</span>` : ''}</span>`;
}

function plPersonChip(p, c, editable) {
  const d = PL.day;
  const moved = c && plUnitOfSide(c.unit) !== p.side;
  const n = plCrossShown(p);
  const inner = html`${plChip(p)}<span class="pl-nm">${plName(p.name)}</span><span class="pl-cnt" title="Karşı tarafa toplam geçiş">(${n})</span>
    ${moved ? html`<span class="pl-from" title="${plSideName(p.side)} listesinden">${plSideName(p.side).replace(/\s*Basamak/i, '. bas.').replace('..', '.')}</span>` : ''}
    ${c && c.method === 'kura' ? html`<span class="pl-m" title="Kura ile">${icon('star', 'sm')}</span>` : ''}
    ${c && c.method === 'elle' && (PL.pins.has(p.key) || !PL.prop) && PL.cur && editable ? html`<span class="pl-m" title="Elle">${icon('pin', 'sm')}</span>` : ''}
    ${p.exempt ? html`<span class="pl-ex" title="Kuradan muaf">muaf</span>` : ''}`;
  const cls = `pl-p ${moved ? 'in' : ''} ${plIsMe(p.name) ? 'me' : ''} ${editable ? 'ed' : ''}`;
  return editable
    ? html`<button type="button" class="${cls}" data-act="pl-pick" data-k="${p.key}" title="${c && c.why ? c.why : 'Bloğunu değiştir'}">${inner}</button>`
    : html`<span class="${cls}" title="${c && c.why ? c.why : ''}">${inner}</span>`;
}

function plDrawDay() {
  const d = PL.day;
  const host = $('#plDay');
  if (!host || !d) return;
  if (d.sides.length < 2) {
    setHTML(host, html`<div class="card empty"><div class="e-ico">${icon('layers', 'lg')}</div><h3>Taraflar tanımlanmadı</h3>
      <p class="small">${d.can_admin ? html`Örneğin <b>3. Basamak → B blok</b> ve <b>2. Basamak → A blok, C blok</b>. Her tarafı kendi nöbet listesine bağlayın; günlük blok yerleşimi buradan yapılır.` : 'Yönetici tarafları (ör. 3. Basamak · B blok, 2. Basamak · A ve C blok) tanımladığında burada görünür.'}</p>
      ${d.can_admin ? html`<button class="btn primary" data-act="pl-setup" style="margin-top:12px">${icon('sliders', 'sm')}Tarafları tanımla</button>` : ''}</div>`);
    return;
  }
  const units = plUnitList(d.sides);
  const today = ymd(new Date());
  const tomorrow = plAddDays(today, 1);
  const people = d.people;
  const byKey = Object.fromEntries(people.map((p) => [p.key, p]));
  const cur = PL.cur;
  const edit = d.can_edit && PL.edit;
  const dt = parseDT(d.date);
  const typeLbl = d.holiday ? d.holiday.name + (d.holiday.half ? ' (yarım gün)' : '') : d.day_type === 'weekend' ? 'Hafta sonu' : 'Hafta içi';

  // Gün seçici
  const nav = html`<div class="card pl-daynav">
    <button class="btn icon" data-act="pl-go" data-d="-1" aria-label="Önceki gün">${icon('chevL')}</button>
    <label class="pl-dl grow"><b>${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${TR_DAYS[dt.getDay()]}</b><span class="tiny faint">${d.date === today ? 'Bugün · ' : d.date === tomorrow ? 'Yarın · ' : ''}${typeLbl}</span>
      <input type="date" class="pl-date" value="${d.date}" data-change="pl-date" aria-label="Tarih seç"></label>
    <button class="btn icon" data-act="pl-go" data-d="1" aria-label="Sonraki gün">${icon('chevR')}</button>
    <div class="seg pl-quick"><button class="${d.date === today ? 'on' : ''}" data-act="pl-go" data-to="${today}">Bugün</button><button class="${d.date === tomorrow ? 'on' : ''}" data-act="pl-go" data-to="${tomorrow}">Yarın</button></div></div>`;

  if (!people.length) {
    setHTML(host, html`${nav}<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>Bu gün listede nöbetçi yok</h3>
      <p class="small">Taraflara bağlı nöbet listelerinde ${plShortDate(d.date)} için nöbet görünmüyor. Liste güncellenince kişiler burada çıkar.</p></div>`);
    plDrawActs();
    return;
  }

  // Durum
  const saved = d.saved.length > 0;
  let status;
  if (PL.prop || PL.dirty) status = html`<span class="badge warn">${icon('edit', 'sm')}Öneri · kaydedilmedi</span>`;
  else if (saved) status = html`<span class="badge success">${icon('checkCircle', 'sm')}Kaydedildi${d.saved_by ? ' · ' + d.saved_by : ''}${d.saved_at ? ' · ' + fmtRel(d.saved_at) : ''}</span>`;
  else status = html`<span class="badge">${icon('clock', 'sm')}Henüz yerleştirilmedi</span>`;
  const bySide = d.sides.map((sd) => [sd, people.filter((p) => p.side === sd.key)]);
  const summary = html`<div class="pl-sum"><span class="small"><b>${people.length}</b> kişi nöbette · ${bySide.map(([sd, l], i) => html`${i ? ' · ' : ''}${sd.name} <b>${l.length}</b>`)}</span><span class="grow"></span>${status}</div>`;

  // Birim kartları
  let board;
  if (cur) {
    const load = {};
    units.forEach((u) => { load[u.unit] = { day: 0, night: 0, list: [] }; });
    people.forEach((p) => {
      const c = cur[p.key];
      if (!c || !load[c.unit]) return;
      load[c.unit].list.push(p);
      plPeriodsOf(p).forEach((per) => { load[c.unit][per]++; });
    });
    const unassigned = people.filter((p) => !cur[p.key] || !load[cur[p.key].unit]);
    const order = (a, b) => (b.shift === '24') - (a.shift === '24') || (a.shift === 'night' ? 0 : 1) - (b.shift === 'night' ? 0 : 1) || a.name.localeCompare(b.name, 'tr');
    board = html`<div class="pl-board">${units.map((u) => {
      const L = load[u.unit];
      const need = d.needs[u.unit] || { day: 0, night: 0 };
      return html`<div class="card pl-unit" data-unit="${u.unit}">
        <div class="pl-uh"><span class="pl-ul tone-${u.tone}">${plLetter(u.unit)}</span><div class="grow" style="min-width:0"><b>${u.unit}</b><div class="tiny faint">${u.sideName}</div></div>
          <div class="pl-needs">${plNeedPill(L.day, need.day, 'day')}${plNeedPill(L.night, need.night, 'night')}</div></div>
        <div class="pl-chips">${L.list.length ? L.list.sort(order).map((p) => plPersonChip(p, cur[p.key], edit)) : html`<span class="tiny faint">Kimse yok</span>`}</div></div>`;
    })}</div>
    ${unassigned.length ? html`<div class="card card-pad pl-warn">${icon('alert', 'sm')} <b>Yerleşmemiş:</b> ${unassigned.map((p) => plPersonChip(p, null, edit))}</div>` : ''}`;
  } else {
    board = html`<div class="pl-board">${bySide.map(([sd, l]) => html`<div class="card pl-unit pl-home-side">
        <div class="pl-uh"><span class="pl-ul tone-slate">${icon('users', 'sm')}</span><div class="grow"><b>${sd.name}</b><div class="tiny faint">${sd.units.join(' · ')} · listede ${l.length} kişi</div></div></div>
        <div class="pl-chips">${l.length ? l.map((p) => plPersonChip(p, null, false)) : html`<span class="tiny faint">Nöbetçi yok</span>`}</div></div>`)}</div>
      <p class="small muted pl-note">${d.can_edit ? html`Bu günün blok yerleşimi henüz yapılmadı. <b>Otomatik dağıt</b> ile önerini al, gerekirse kişilere dokunup değiştir, sonra <b>Kaydet</b>.` : 'Bu günün blok yerleşimi henüz yapılmadı. Sorumlu yerleştirince burada ve ana sayfada görünür.'}</p>`;
  }

  // Öneri açıklamaları
  const pr = PL.prop;
  const savedDraws = !pr && saved ? d.saved.filter((s) => s.pool && s.pool.group) : [];
  const explain = pr ? html`<div class="card pl-explain">
      <div class="card-head"><h3>${icon('info', 'sm')} Nasıl dağıtıldı</h3>${pr.draws.some((x) => x.group.length > 1) ? html`<span class="badge brand">${icon('star', 'sm')}Kura çekildi</span>` : ''}</div>
      <div class="list">
        ${!pr.has_needs ? html`<div class="list-row small">${icon('alert', 'sm')}<span class="grow">Gereken kişi sayıları girilmemiş: herkes kendi tarafında kaldı. Sayıları aşağıdaki <b>Gereken kişi</b> bölümünden ya da Ayarlar › Nöbet'ten girin.</span></div>` : ''}
        ${pr.draws.map((x) => html`<div class="list-row pl-draw"><span class="pl-ul sm tone-${plUnitInfo(x.unit).tone}">${plLetter(x.unit)}</span><div class="grow" style="min-width:0">
          <div class="small"><b>${x.from_name} → ${x.unit || x.to_name}</b> · ${x.period === 'night' ? 'gece eksiği' : 'gündüz eksiği'}</div>
          <div class="small">${x.group.length > 1 ? html`Kura: ${x.group.length} kişi ${x.min} geçişle eşitti → <b>${plName(x.winner)}</b> seçildi` : html`<b>${plName(x.winner)}</b> en az geçen kişi (${x.min} geçiş) → kurasız`}</div>
          <div class="tiny faint">Adaylar: ${x.pool.map((c) => `${plName(c.name)} (${c.cross})`).join(', ')}${x.exempt && x.exempt.length ? ' · muaf: ' + x.exempt.map(plName).join(', ') : ''}</div></div></div>`)}
        ${pr.has_needs && !pr.draws.length ? html`<div class="list-row small">${icon('checkCircle', 'sm')}<span class="grow">Karşı tarafa geçiş gerekmedi; herkes kendi tarafında.</span></div>` : ''}
        ${pr.deficits.length ? pr.deficits.map((x) => html`<div class="list-row pl-def">${icon('alert', 'sm')}<span class="grow small"><b>${x.unit}</b> · ${x.period === 'night' ? 'gece (16-08)' : 'gündüz (08-16)'}: <b>${x.missing} kişi eksik</b> (${x.placed}/${x.need})</span>
          ${d.can_edit && typeof window.openCalloutModal === 'function' ? html`<button class="btn sm" data-act="pl-callout" data-unit="${x.unit}" data-side="${x.side}" data-per="${x.period}">${icon('megaphone', 'sm')}<span>Eksik çağrısı</span></button>` : ''}</div>`) : ''}
        ${pr.extra.length ? html`<div class="list-row small faint">${icon('users', 'sm')}<span class="grow">Fazla: ${pr.extra.map((x) => `${x.unit} ${x.period === 'night' ? 'gece' : 'gündüz'} +${x.over}`).join(' · ')}</span></div>` : ''}
      </div></div>`
    : savedDraws.length ? html`<div class="card pl-explain"><div class="list">${savedDraws.map((s) => html`<div class="list-row pl-draw"><span class="pl-ul sm tone-${plUnitInfo(s.unit).tone}">${plLetter(s.unit)}</span><div class="grow" style="min-width:0">
        <div class="small">${s.pool.group.length > 1 ? html`Kura: ${s.pool.group.length} kişi ${s.pool.min} geçişle eşitti → <b>${plName(s.name)}</b> ${s.unit}` : html`<b>${plName(s.name)}</b> en az geçen kişi (${s.pool.min}) → ${s.unit}`}</div>
        <div class="tiny faint">Adaylar: ${(s.pool.pool || []).map((c) => `${plName(c.name)} (${c.cross})`).join(', ')}</div></div></div>`)}</div></div>` : '';

  const stale = !PL.prop && d.stale.length ? html`<div class="card card-pad pl-warn">${icon('alert', 'sm')} <span><b>Liste değişti:</b> ${d.stale.map((x) => `${plName(x.name)} ${x.why}`).join(' · ')}.${d.can_edit ? ' Yeniden dağıtıp kaydedin.' : ''}</span></div>` : '';
  const hint = !d.has_needs && d.can_edit && !PL.prop ? html`<p class="tiny faint pl-note">${icon('info', 'sm')} Gereken kişi sayıları girilmemiş; otomatik dağıtımda herkes kendi tarafında kalır.</p>` : '';
  const editHint = edit ? html`<p class="small pl-edit-hint">${icon('edit', 'sm')} Elle düzenleme: kişiye dokunup bloğunu seçin. Bitince <b>Kaydet</b>.</p>` : '';

  setHTML(host, html`${nav}${summary}${stale}${editHint}${board}${hint}${explain}${plCountsCard()}`);
  plDrawActs();
}

/** Yayıncı düğmeleri (gün kartının altında yapışkan çubuk) */
function plDrawActs() {
  const d = PL.day;
  const host = $('#plDay');
  if (!host || !d) return;
  let bar = $('#plBar');
  if (!d.can_edit || d.sides.length < 2 || !d.people.length) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'plBar'; bar.className = 'pl-bar'; host.prepend(bar); }
  const ties = PL.prop && PL.prop.draws.some((x) => x.group.length > 1);
  setHTML(bar, html`<button class="btn ${PL.cur && !PL.dirty ? '' : 'primary'}" data-act="pl-auto">${icon('layers', 'sm')}<span>Otomatik dağıt</span></button>
    ${ties ? html`<button class="btn" data-act="pl-redraw">${icon('star', 'sm')}<span>Kura</span></button>` : ''}
    <button class="btn ${PL.edit ? 'on' : ''}" data-act="pl-edit" aria-pressed="${PL.edit ? 'true' : 'false'}">${icon('edit', 'sm')}<span>${PL.edit ? 'Düzenleme açık' : 'Elle düzenle'}</span></button>
    ${PL.dirty || PL.prop ? html`<button class="btn primary" data-act="pl-save">${icon('check', 'sm')}<span>Kaydet</span></button><button class="btn ghost" data-act="pl-discard">Vazgeç</button>` : ''}
    ${!PL.dirty && !PL.prop && d.saved.length ? html`<button class="btn ghost icon" data-act="pl-clear" title="Bu günün kaydını sil" aria-label="Bu günün kaydını sil">${icon('trash', 'sm')}</button>` : ''}`);
}

/* ---------------- Gereken kişi (güne özel) ---------------- */
function plCountsCard() {
  const d = PL.day;
  const units = plUnitList(d.sides);
  const src = { day: 'Bu güne özel', default: d.day_type === 'weekend' ? 'Varsayılan · hafta sonu / tatil' : 'Varsayılan · hafta içi', none: 'Girilmemiş' }[d.needs_source];
  const sum = units.map((u) => { const n = d.needs[u.unit] || {}; return `${plLetter(u.unit)} ${n.day || 0}/${n.night || 0}`; }).join(' · ');
  const num = (u, per) => {
    const v = (d.needs[u.unit] || {})[per] || 0;
    return d.can_edit ? html`<input class="input pl-num" type="number" min="0" max="30" inputmode="numeric" value="${v}" data-u="${u.unit}" data-per="${per}" aria-label="${u.unit} ${per === 'day' ? 'gündüz' : 'gece'}">` : html`<b>${v}</b>`;
  };
  return html`<details class="card pl-counts" ${PL.countsOpen ? raw('open') : ''}><summary class="card-head"><h3>${icon('users', 'sm')} Gereken kişi</h3><span class="tiny faint ellipsis">${sum} · ${src}</span></summary>
    <div class="card-pad stack">
      <table class="pl-ct"><thead><tr><th>Blok</th><th>${icon('sun', 'sm')} Gündüz <small>08-16</small></th><th>${icon('moon', 'sm')} Gece <small>16-08</small></th></tr></thead>
        <tbody>${units.map((u) => html`<tr><td><span class="pl-ul sm tone-${u.tone}">${plLetter(u.unit)}</span> ${u.unit} <span class="tiny faint">${u.sideName}</span></td><td>${num(u, 'day')}</td><td>${num(u, 'night')}</td></tr>`)}</tbody></table>
      <p class="tiny faint">24 saatlik nöbetçi iki dönemde de sayılır ve aynı blokta kalır. Varsayılanlar Ayarlar › Nöbet'ten değiştirilir.</p>
      ${d.can_edit ? html`<div class="row wrap"><button class="btn sm primary" data-act="pl-counts-save">Bu gün için kaydet</button>${d.needs_source === 'day' ? html`<button class="btn sm ghost" data-act="pl-counts-reset">Varsayılana dön</button>` : ''}</div>` : ''}
    </div></details>`;
}
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('pl-counts')) PL.countsOpen = e.target.open; }, true);
ACT['pl-counts-save'] = (el) => busy(el, async () => {
  const counts = {};
  $$('.pl-counts .pl-num').forEach((x) => { (counts[x.dataset.u] = counts[x.dataset.u] || {})[x.dataset.per] = Math.max(0, +x.value || 0); });
  try {
    const r = await api('placement.counts', { date: PL.date, counts });
    Object.assign(PL.day, r);
    toast('Gereken sayılar bu gün için kaydedildi');
    plDrawDay();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['pl-counts-reset'] = (el) => busy(el, async () => {
  try { const r = await api('placement.counts', { date: PL.date, counts: null }); Object.assign(PL.day, r); toast('Varsayılan sayılar kullanılıyor'); plDrawDay(); } catch (e) { toast(e.message, 'err'); }
});

/* ---------------- Gün değiştirme ---------------- */
async function plGoto(date) {
  if (!date || date === PL.date) return;
  if ((PL.dirty || PL.prop) && !(await confirmDialog({ title: 'Kaydedilmedi', text: 'Bu günün yerleşimini kaydetmediniz. Değişiklikler silinsin mi?', ok: 'Sil ve geç', danger: true }))) { plDrawDay(); return; }
  PL.date = date; PL.prop = null; PL.cur = null; PL.dirty = false; PL.pins = new Set(); PL.edit = false;
  try { history.replaceState(null, '', '#/taraf/' + date); } catch (e) { /* */ }
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
  const d = PL.day;
  const fixed = {};
  if (PL.cur) PL.pins.forEach((k) => { const p = d.people.find((x) => x.key === k); if (p && PL.cur[k]) fixed[p.name] = PL.cur[k].unit; });
  await busy(el, async () => {
    let r;
    try { r = await api('placement.auto', { date: PL.date, fixed }); } catch (e) { toast(e.message, 'err'); return; }
    PL.prop = r;
    PL.dirty = true;
    plBuildCur();
    const ties = r.draws.filter((x) => x.group.length > 1);
    if (ties.length && reveal !== false) await plReveal(ties);
    plDrawDay();
    if (!ties.length) toast(Object.keys(fixed).length ? 'Yeniden dağıtıldı (elle seçilenler korundu)' : 'Öneri hazır · kontrol edip kaydedin');
  });
}
ACT['pl-auto'] = (el) => plRunAuto(el);
ACT['pl-redraw'] = (el) => plRunAuto(el, true);
ACT['pl-edit'] = () => {
  PL.edit = !PL.edit;
  if (PL.edit && !PL.cur) { PL.cur = plHomeDefault(); PL.dirty = true; }
  plDrawDay();
};
ACT['pl-discard'] = () => { PL.prop = null; PL.dirty = false; PL.pins = new Set(); PL.edit = false; plBuildCur(); plDrawDay(); };
ACT['pl-save'] = (el) => busy(el, async () => {
  const d = PL.day;
  if (!PL.cur) return;
  const items = d.people.filter((p) => PL.cur[p.key]).map((p) => ({ name: p.name, unit: PL.cur[p.key].unit }));
  try {
    const r = await api('placement.save', { date: PL.date, items });
    PL.day = r; PL.prop = null; PL.dirty = false; PL.pins = new Set(); PL.edit = false;
    plBuildCur();
    plDrawDay();
    toast('Yerleşim kaydedildi' + (r.notified ? ` · ${r.notified} kişiye bildirim gitti` : ''));
    plLoadMonth(true);
  } catch (e) { toast(e.message, 'err'); }
});
ACT['pl-clear'] = async () => {
  if (!(await confirmDialog({ title: 'Kayıt silinsin mi?', text: `${plShortDate(PL.date)} günün blok yerleşimi ve bu güne ait geçiş sayımları silinir.`, ok: 'Sil', danger: true }))) return;
  try { PL.day = await api('placement.clear', { date: PL.date }); plBuildCur(); plDrawDay(); toast('Silindi'); plLoadMonth(true); } catch (e) { toast(e.message, 'err'); }
};
ACT['pl-callout'] = (el) => {
  if (typeof window.openCalloutModal !== 'function') return;
  window.openCalloutModal({ date: PL.date, shift: el.dataset.per === 'night' ? 'night' : 'day', side: el.dataset.side, unit: el.dataset.unit });
};

/** Kişiye dokununca: blok seç */
ACT['pl-pick'] = (el) => {
  const d = PL.day;
  const p = d.people.find((x) => x.key === el.dataset.k);
  if (!p) return;
  if (!PL.cur) { PL.cur = plHomeDefault(); }
  const c = PL.cur[p.key];
  const units = plUnitList(d.sides);
  const cnt = (u) => (p.units && p.units[u]) || 0;
  const m = openModal({ title: plName(p.name), size: 'narrow', body: html`<div class="stack">
      <div class="row wrap">${plChip(p)}<span class="small muted">${PL_PER[p.shift] || ''} · ${plSideName(p.side)} listesi</span>${p.exempt ? html`<span class="badge warn">Kuradan muaf</span>` : ''}</div>
      <div class="pl-pstats"><div><b>${p.cross}</b><span>karşıya geçiş</span></div>${units.map((u) => html`<div><b>${cnt(u.unit)}</b><span>${u.unit}</span></div>`)}</div>
      <p class="tiny faint">${p.last_unit ? `Son blok: ${p.last_unit} (${plShortDate(p.last_date)})` : 'Daha önce kayıtlı bloğu yok'}</p>
      <div class="pl-pick">${units.map((u) => html`<button type="button" class="pl-opt ${c && c.unit === u.unit ? 'on' : ''}" data-u="${u.unit}">
        <span class="pl-ul tone-${u.tone}">${plLetter(u.unit)}</span><span class="grow"><b>${u.unit}</b><span class="tiny faint">${u.sideName}${u.side !== p.side ? (p.shift === 'day' ? ' · karşı taraf (08-16 sayılmaz)' : ' · karşı taraf · geçiş sayılır') : ''}</span></span>${c && c.unit === u.unit ? icon('check', 'sm') : ''}</button>`)}</div></div>` });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('.pl-opt');
    if (!b) return;
    PL.cur[p.key] = { unit: b.dataset.u, method: 'elle', why: 'Elle seçildi' };
    PL.pins.add(p.key);
    PL.dirty = true;
    m.close();
    plDrawDay();
  });
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

/* ---------------- Ay: kim kaç kez, matris, geçmiş ---------------- */
function plDrawMonth() {
  const d = PL.mon;
  const host = $('#plMonth');
  if (!host || !d) return;
  const [y, m] = d.month.split('-').map(Number);
  const units = plUnitList(d.sides);
  const selDay = PL.date.startsWith(d.month) ? +PL.date.slice(8, 10) : 0;
  const today = ymd(new Date());
  const wd = (dd) => new Date(y, m - 1, dd).getDay();
  // Kim kaç kez
  const s = PL.sort;
  const val = (r) => (s.k === 'name' ? r.name : s.k === 'side' ? plSideName(r.side, d.sides) : s.k === 'last' ? (r.last_date || '') : s.k.startsWith('u:') ? (r.units[s.k.slice(2)] || 0) : r[s.k] || 0);
  const rows = [...d.stats].sort((a, b) => { const va = val(a), vb = val(b); return (typeof va === 'string' ? va.localeCompare(vb, 'tr') : va - vb) * s.d || a.name.localeCompare(b.name, 'tr'); });
  const th = (k, label, cls = '') => html`<th class="${cls} ${s.k === k ? 'on' : ''}"><button type="button" data-act="pl-sort" data-k="${k}">${label}${s.k === k ? (s.d > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const stats = html`<div class="card pl-tbl-card"><div class="pl-tbl-scroll"><table class="pl-tbl">
      <thead><tr>${th('name', 'Ad', 'pl-tn')}${th('month', 'Bu ay')}${th('total', 'Toplam')}${units.map((u) => th('u:' + u.unit, plLetter(u.unit)))}${th('last', 'Son blok')}</tr></thead>
      <tbody>${rows.map((r) => html`<tr class="${plIsMe(r.name) ? 'me' : ''}"><th class="pl-tn"><span class="ellipsis">${plName(r.name)}</span><small>${plSideName(r.side, d.sides) || 'listede yok'}${r.adj ? ' · elle sayı var' : ''}</small></th>
        <td><b class="${r.month ? 'pl-hot' : 'faint'}">${r.month}</b></td><td><b>${r.total}</b></td>
        ${units.map((u) => html`<td class="${(r.units[u.unit] || 0) ? '' : 'faint'}">${r.units[u.unit] || 0}</td>`)}
        <td>${r.last_unit ? html`<span class="pl-ul sm tone-${plUnitInfo(r.last_unit, d.sides).tone}" title="${r.last_unit}">${plLetter(r.last_unit)}</span> <span class="tiny faint">${plShortDate(r.last_date)}</span>` : html`<span class="faint">—</span>`}</td></tr>`)}</tbody></table></div>
    <p class="tiny faint pl-foot">Geçiş: karşı taraftaki blokta gece içeren nöbet (16-08 veya 24 saat). 08-16 kaydedilir, sayılmaz.${d.since ? ` Sayım ${fmtDate(d.since, true)} tarihinden beri.` : ''}</p></div>`;

  // Elle sayılar ve muaflar (yayıncı)
  const adj = d.can_edit ? html`<div class="pl-2col">
    <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Geçmiş sayılar (elle)</h3><button class="btn sm" data-act="pl-adj">${icon('plus', 'sm')}<span>Ekle</span></button></div>
      <div class="list">${d.adjust.length ? d.adjust.map((a) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${plName(a.name)}</div>
        <div class="lr-s">${a.cross_count ? `karşıya geçiş ${a.cross_count > 0 ? '+' : ''}${a.cross_count}` : ''}${a.cross_count && a.unit_count ? ' · ' : ''}${a.unit && a.unit_count ? `${a.unit} ${a.unit_count > 0 ? '+' : ''}${a.unit_count}` : ''}${a.note ? ' · ' + a.note : ''}</div></div>
        <button class="btn ghost icon sm" data-act="pl-adj" data-id="${a.id}" aria-label="Düzenle">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="pl-adj-del" data-id="${a.id}" aria-label="Sil">${icon('trash', 'sm')}</button></div>`)
        : html`<div class="list-row small muted">Uygulamadan önceki dönemde kim kaç kez karşıya geçtiyse buraya ekleyin; sayılara ve kura sırasına eklenir.</div>`}</div></div>
    <div class="card"><div class="card-head"><h3>${icon('shield', 'sm')} Kuradan muaf</h3><button class="btn sm" data-act="pl-ex">${icon('plus', 'sm')}<span>Ekle</span></button></div>
      <div class="list">${d.exempt.length ? d.exempt.map((x) => html`<div class="list-row ${x.active ? '' : 'pl-off'}"><div class="grow" style="min-width:0"><div class="lr-t">${plName(x.name)}</div>
        <div class="lr-s">${PL_SCOPE[x.scope] || x.scope}${x.until ? ` · ${fmtDate(x.until)} tarihine kadar` : ' · süresiz'}${x.active ? '' : ' · süresi doldu'}${x.note ? ' · ' + x.note : ''}</div></div>
        <button class="btn ghost icon sm" data-act="pl-ex-del" data-id="${x.id}" aria-label="Kaldır">${icon('trash', 'sm')}</button></div>`)
        : html`<div class="list-row small muted">Muaf kişi yok. Muaflar karşı tarafa kura ile gönderilmez.</div>`}</div></div></div>` : '';

  // Matris
  const matrix = (sd) => html`<div class="sec-title">${icon('table', 'sm')} ${sd.name} <span class="tiny faint">· ${sd.units.join(', ')}</span></div>
    <div class="card tr-mx-wrap"><div class="tr-mx-scroll"><table class="tr-mx pl-mx">
      <thead><tr><th class="tr-n">Personel</th>${Array.from({ length: d.days }, (_, i) => i + 1).map((dd) => html`<th class="${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''} ${`${d.month}-${pad(dd)}` === today ? 'td' : ''} ${dd === selDay ? 'sel' : ''}"><button type="button" data-act="pl-day" data-d="${dd}">${dd}<small>${['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][wd(dd)]}</small></button></th>`)}<th class="tr-c" title="Bu ay karşıya geçiş">Ay</th><th class="tr-c" title="Toplam geçiş">Top.</th></tr></thead>
      <tbody>${sd.people.length ? sd.people.map((p) => {
        const st = d.stats.find((x) => x.key === p.key) || { month: 0, total: 0 };
        return html`<tr class="${plIsMe(p.name) ? 'me' : ''}"><th class="tr-n" title="${p.title || ''}">${plName(p.name)}</th>${Array.from({ length: d.days }, (_, i) => i + 1).map((dd) => {
          const x = p.days[dd];
          const pl = (d.placed[`${d.month}-${pad(dd)}`] || {})[p.key];
          const cls = `${dd === selDay ? 'sel' : ''} ${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''} ${pl && pl.x ? 'tr-moved' : ''}`;
          if (!x) return html`<td class="${cls}">${pl ? html`<i>${plLetter(pl.unit)}</i>` : ''}</td>`;
          const tone = shiftTone(x);
          const c = x.kind === 'shift' ? (tone === 'emerald' ? '24' : tone === 'indigo' ? 'N' : 'G') : String(x.code).slice(0, 3);
          return html`<td class="${cls}" title="${x.code}${pl ? ' · ' + pl.unit + (pl.x ? (pl.c ? ' · karşıya geçiş (sayıldı)' : ' · karşı taraf (sayılmadı)') : '') + ' · ' + (PL_METHOD[pl.m] || pl.m) : ''}">${pl ? html`<span class="pl-cell tone-${plUnitInfo(pl.unit, d.sides).tone}">${plLetter(pl.unit)}</span>` : html`<span class="tr-c-${tone}">${c}</span>`}${pl && pl.x ? html`<i>${c}</i>` : ''}</td>`;
        })}<td class="tr-c"><b>${st.month || ''}</b></td><td class="tr-c"><b>${st.total}</b></td></tr>`;
      }) : html`<tr><td colspan="${d.days + 3}" class="small muted" style="text-align:left;padding:10px">Bu ay bu tarafın listesinde kimse yok.</td></tr>`}</tbody></table></div></div>`;

  // Geçmiş
  const log = [...d.log].reverse();
  const logHtml = log.length ? html`<div class="card"><div class="list">${log.map((g) => html`<div class="list-row pl-log">
      <button type="button" class="pl-logd" data-act="pl-day" data-d="${+g.date.slice(8, 10)}"><b>${+g.date.slice(8, 10)}</b><small>${TR_DAYS_S[parseDT(g.date).getDay()]}</small></button>
      <div class="grow" style="min-width:0"><div class="small">${g.legacy ? 'Taraf kaydı (eski)' : `${g.n} kişi yerleşti`}${g.by ? ' · ' + g.by : ''}${g.at ? html` <span class="faint">· ${fmtRel(g.at)}</span>` : ''}</div>
        ${g.items.length ? g.items.map((it) => html`<div class="pl-logi"><span class="pl-ul sm tone-${plUnitInfo(it.unit, d.sides).tone}">${plLetter(it.unit)}</span><span class="small"><b>${plName(it.name)}</b> ${plSideName(it.from, d.sides)} → ${it.unit} · ${it.code} · ${PL_METHOD[it.method] || it.method}${it.counted ? ' · sayıldı' : ' · sayılmadı'}</span>
          ${it.pool && it.pool.pool ? html`<div class="tiny faint pl-logp">Adaylar: ${it.pool.pool.map((c) => `${plName(c.name)} (${c.cross})`).join(', ')}${it.pool.group && it.pool.group.length > 1 ? ' · kura: ' + it.pool.group.map(plName).join(', ') : ''}</div>` : ''}</div>`)
        : html`<div class="tiny faint">Herkes kendi tarafında</div>`}</div></div>`)}</div></div>`
    : html`<div class="card empty"><p class="small">Bu ay kayıtlı yerleşim yok.</p></div>`;

  setHTML(host, html`<div class="pl-mhead"><div class="sec-title">${icon('chart', 'sm')} Kim kaç kez</div><span class="grow"></span>
      <div class="pl-mnav"><button class="btn sm icon" data-act="tr-mv" data-d="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b>${TR_MONTHS[m - 1]} ${y}</b><button class="btn sm icon" data-act="tr-mv" data-d="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div></div>
    ${stats}${adj}${d.sides.map(matrix)}
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

/* Elle geçmiş sayı */
ACT['pl-adj'] = (el) => {
  const d = PL.mon;
  const a = el.dataset.id ? d.adjust.find((x) => x.id === +el.dataset.id) : null;
  const ppl = plMonthPeople();
  const units = plUnitList(d.sides);
  const m = openModal({ title: a ? 'Geçmiş sayıyı düzenle' : 'Geçmiş sayı ekle', size: 'narrow', body: html`<div class="stack">
      <p class="small muted">Uygulamadan önce kim kaç kez karşı tarafa geçtiyse (ve hangi blokta kaç kez çalıştıysa) girin. Sayılar toplamlara ve kura sırasına eklenir.</p>
      <div class="field"><label>Kişi</label><select class="select" id="paName"><option value="">Seçin</option>${ppl.map((p) => html`<option value="${p.name}" ${a && avKey(a.name) === avKey(p.name) ? raw('selected') : ''}>${plName(p.name)} · ${plSideName(p.side, d.sides) || '—'}</option>`)}
        ${a && !ppl.some((p) => avKey(p.name) === avKey(a.name)) ? html`<option value="${a.name}" selected>${plName(a.name)}</option>` : ''}</select></div>
      <div class="field"><label>Karşı tarafa geçiş (gece içeren)</label><input class="input" type="number" id="paCross" min="-50" max="200" inputmode="numeric" value="${a ? a.cross_count : 0}"><p class="hint">Eksi sayı düzeltme içindir (ör. −1).</p></div>
      <div class="grid2"><div class="field"><label>Blok <span class="faint">(isteğe bağlı)</span></label><select class="select" id="paUnit"><option value="">—</option>${units.map((u) => html`<option ${a && a.unit === u.unit ? raw('selected') : ''}>${u.unit}</option>`)}</select></div>
        <div class="field"><label>O blokta kaç kez</label><input class="input" type="number" id="paUc" min="-50" max="500" inputmode="numeric" value="${a ? a.unit_count : 0}"></div></div>
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
      <div class="field"><label>Kişi</label><select class="select" id="peName"><option value="">Seçin</option>${ppl.map((p) => html`<option value="${p.name}">${plName(p.name)} · ${plSideName(p.side, d.sides) || '—'}</option>`)}</select></div>
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
    { key: 's3', name: '3. Basamak', roster_id: 0, units: 'B blok' }, { key: 's2', name: '2. Basamak', roster_id: 0, units: 'A blok, C blok' }];
  list.forEach((s) => { if (!s.roster_id) { const n = (s.name.match(/\d/) || [])[0]; const r = n && rosters.find((x) => x.name.includes(n)); if (r) s.roster_id = r.id; } });
  const row = (s) => html`<div class="card card-pad stack pl-side-f">
    <div class="grid2"><div class="field"><label>Taraf adı</label><input class="input" name="name" value="${s.name}" placeholder="3. Basamak"></div>
      <div class="field"><label>Nöbet listesi</label><select class="select" name="roster_id"><option value="0">— Seçin</option>${rosters.map((r) => html`<option value="${r.id}" ${r.id === +s.roster_id ? raw('selected') : ''}>${r.name}</option>`)}</select></div></div>
    <div class="field"><label>Bloklar <span class="faint">(virgülle)</span></label><input class="input" name="units" value="${s.units}" placeholder="A blok, C blok"><input type="hidden" name="key" value="${s.key}"></div></div>`;
  const m = openModal({ title: 'Taraflar', size: 'wide', body: html`<div class="stack"><p class="small muted">Her taraf bir nöbet listesine bağlanır. Listesindeki kişiler normalde o tarafın bloklarında çalışır; karşı tarafın bloğuna gece içeren nöbetle geçenler sayılır.</p>
      <div class="stack">${list.map(row)}</div>
      <div class="field"><label>Sayımın başlangıcı <span class="faint">(isteğe bağlı)</span></label><input class="input" type="date" id="plSince" value="${g.since || ''}" style="max-width:200px"><p class="hint">Yeni bir dönem başlatmak için tarih seçin; bu tarihten önceki yerleşimler sayılmaz (elle girilen geçmiş sayılar her zaman eklenir).</p></div></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="plSidesSave">Kaydet</button>` });
  $('#plSidesSave', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const sides = $$('.pl-side-f', m.el).map((c) => ({ key: c.querySelector('[name=key]').value, name: c.querySelector('[name=name]').value, roster_id: +c.querySelector('[name=roster_id]').value, units: c.querySelector('[name=units]').value.split(',').map((x) => x.trim()).filter(Boolean) }));
    try { await api('side.settings', { sides, since: $('#plSince', m.el).value }); m.close(); toast('Taraflar kaydedildi'); PL.mon = null; PL.prop = null; PL.dirty = false; await plLoadDay(); } catch (err) { toast(err.message, 'err'); }
  }));
};

/* ---------------- Ana sayfa kartı: bugün bloklar ---------------- */
NM_EXT.homeCards.push({
  id: 'bloklar', title: 'Bugün bloklar', icon: 'layers', order: 10, place: 'top',
  render: async (el) => {
    let r;
    try { r = await api('placement.today'); } catch (e) { el.remove(); return; }
    if (!r.sides || r.sides.length < 2 || (!r.saved.length && !r.on_duty)) { el.remove(); return; }
    const units = plUnitList(r.sides);
    const side2name = (k) => plSideName(k, r.sides);
    const body = r.saved.length
      ? html`<div class="pl-hgrid">${units.map((u) => {
          const l = r.saved.filter((s) => s.unit === u.unit).sort((a, b) => (plUnitInfo(a.unit, r.sides).side !== a.side) - (plUnitInfo(b.unit, r.sides).side !== b.side) || a.name.localeCompare(b.name, 'tr'));
          return html`<div class="pl-hu"><span class="pl-ul tone-${u.tone}" title="${u.unit} · ${u.sideName}">${plLetter(u.unit)}</span><div class="pl-hn">${l.length ? l.map((s) => {
            const moved = u.side !== s.side;
            return html`<span class="pl-hp ${moved ? 'in' : ''} ${plIsMe(s.name) ? 'me' : ''}" title="${s.code}${moved ? ' · ' + side2name(s.side) + ' listesinden' : ''}">${plName(s.name)} <small>(${s.cross_total})</small></span>`;
          }) : html`<span class="tiny faint">—</span>`}</div></div>`;
        })}</div>`
      : html`<div class="pl-hempty small muted">${icon('clock', 'sm')}<span class="grow">Bugünün blok yerleşimi henüz yapılmadı${r.on_duty ? ` · ${r.on_duty} kişi nöbette` : ''}.</span>${r.can_edit ? html`<a class="btn sm primary" href="#/taraf/${r.date}">Yerleştir</a>` : ''}</div>`;
    setHTML(el, html`<div class="card pl-home"><div class="card-head"><h3>${icon('layers', 'sm')} Bugün bloklar</h3>
      ${r.mine ? html`<span class="badge brand">Sen: ${r.mine}</span>` : ''}<a class="small" href="#/taraf/${r.date}">Tümü</a></div>${body}
      <div class="tiny faint pl-hfoot">${r.saved.length ? html`<span class="grow">( ) karşı tarafa toplam geçiş · <span class="pl-hp in sm">renkli</span> karşı taraftan gelen</span>` : html`<span class="grow"></span>`}
        <a class="pl-hist" href="#/taraf/${plAddDays(r.date, -1)}">${icon('history', 'sm')}Geçmiş günler</a></div></div>`);
  },
});

/* ---------------- Kayıt etiketleri ---------------- */
Object.assign(NM_EXT.audit, {
  'placement.save': 'Blok yerleşimini kaydetti', 'placement.draw': 'Blok kurası çekti', 'placement.clear': 'Blok yerleşimini sildi',
  'placement.counts': 'Güne özel kişi sayısı', 'placement.adjust': 'Geçmiş geçiş sayısı girdi',
});
