/* NöbetMed — nöbet çizelgesi */
'use strict';

const SH = { unitId: null, month: null, tab: 'roster', data: [], loading: false, mine: null };

function monthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= n; d++) out.push(`${ym}-${pad(d)}`);
  return out;
}
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const personKey = (s) => (s.user_id ? 'u' + s.user_id : 'n' + trLower(s.name));
const isNight = (t) => t && t.end <= t.start;
function addDays(date, n) { const d = parseDT(date); d.setDate(d.getDate() + n); return ymd(d); }

function renderShifts(view) {
  if (!SH.unitId || !byId(S.units, SH.unitId)) SH.unitId = (S.me.unit_id && byId(S.units, S.me.unit_id)) ? S.me.unit_id : (S.units[0] || {}).id;
  if (!SH.month) { const n = new Date(); SH.month = `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; }
  setHTML(view, html`<div id="shiftsRoot"></div>`);
  drawShifts();
  if (SH.tab === 'mine') loadMine(); else loadShifts();
}

function drawShifts() {
  const root = $('#shiftsRoot');
  if (!root) return;
  const [y, m] = SH.month.split('-').map(Number);
  const monthLabel = `${TR_MONTHS[m - 1]} ${y}`;
  const editable = isPublisher();
  let body;
  if (SH.tab === 'mine') body = mineView();
  else if (SH.loading) body = html`<div class="card card-pad">${[1, 2, 3, 4, 5].map(() => html`<div class="skel" style="height:16px;margin:12px 0"></div>`)}</div>`;
  else if (SH.tab === 'summary') body = summaryView();
  else body = rosterView(editable);

  setHTML(root, html`
    <div class="page-head">
      <div><h1>Nöbet çizelgesi</h1><p>${editable ? 'Bir hücreye tıklayarak nöbet atayın; çakışmalar otomatik işaretlenir.' : 'Birim nöbet listesi ve kendi nöbetleriniz'}</p></div>
      <div class="row wrap no-print">
        ${SH.tab !== 'mine' ? html`
          <button class="btn" data-act="sh-csv">${icon('download', 'sm')}Excel</button>
          ${window.NM_DEMO_API ? '' : html`<button class="btn" data-act="sh-print">${icon('printer', 'sm')}Yazdır</button>`}` : ''}
      </div>
    </div>
    <div class="print-only" style="margin-bottom:10px"><b style="font-size:15px">${S.settings.org_name} — ${unitName(SH.unitId)} Nöbet Listesi · ${monthLabel}</b></div>
    <div class="toolbar no-print">
      <div class="seg">
        <button class="${SH.tab === 'roster' ? 'on' : ''}" data-act="sh-tab" data-tab="roster">${icon('calendar', 'sm')}Çizelge</button>
        <button class="${SH.tab === 'summary' ? 'on' : ''}" data-act="sh-tab" data-tab="summary">${icon('chart', 'sm')}Kişi özeti</button>
        <button class="${SH.tab === 'mine' ? 'on' : ''}" data-act="sh-tab" data-tab="mine">${icon('user', 'sm')}Nöbetlerim</button>
      </div>
      ${SH.tab !== 'mine' ? html`
      <div class="row wrap">
        ${S.units.length > 1 ? html`<select class="select" style="width:auto;height:36px" data-change="sh-unit">${options(S.units, SH.unitId)}</select>` : ''}
        <div class="row" style="gap:4px">
          <button class="btn icon sm" data-act="sh-month" data-d="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button>
          <button class="btn sm" data-act="sh-today" style="min-width:118px">${monthLabel}</button>
          <button class="btn icon sm" data-act="sh-month" data-d="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button>
        </div>
      </div>` : ''}
    </div>
    ${body}`);
}

async function loadShifts() {
  SH.loading = true;
  drawShifts();
  const key = SH.unitId + '|' + SH.month;
  try {
    const r = await api('shifts.month', { unit_id: SH.unitId, month: SH.month });
    if (key !== SH.unitId + '|' + SH.month) return;
    SH.data = r.shifts;
  } catch (e) { toast(e.message, 'err'); SH.data = []; }
  SH.loading = false;
  drawShifts();
}
async function loadMine() {
  SH.mine = null;
  drawShifts();
  try { SH.mine = (await api('shifts.mine')).shifts; } catch (e) { SH.mine = []; toast(e.message, 'err'); }
  drawShifts();
}
ACT['sh-tab'] = (el) => {
  SH.tab = el.dataset.tab;
  if (SH.tab === 'mine') loadMine(); else if (!SH.data.length) loadShifts(); else drawShifts();
};
ACT['sh-month'] = (el) => { SH.month = shiftMonth(SH.month, +el.dataset.d); loadShifts(); };
ACT['sh-today'] = () => { const n = new Date(); SH.month = `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; loadShifts(); };
CHANGE['sh-unit'] = (el) => { SH.unitId = +el.value; loadShifts(); };
ACT['sh-print'] = () => { if (SH.tab !== 'roster') { SH.tab = 'roster'; drawShifts(); } setTimeout(() => window.print(), 50); };

function cellEntries(date, typeId) { return SH.data.filter((s) => s.date === date && s.type_id === typeId); }

function computeConflicts() {
  const byDate = {};
  for (const s of SH.data) {
    (byDate[s.date] = byDate[s.date] || {});
    (byDate[s.date][personKey(s)] = byDate[s.date][personKey(s)] || []).push(s);
  }
  const bad = new Map();
  const flag = (s, msg) => bad.set(s.date + '|' + s.type_id + '|' + personKey(s), msg);
  for (const date of Object.keys(byDate)) {
    for (const [pk, list] of Object.entries(byDate[date])) {
      if (list.length > 1) list.forEach((s) => flag(s, 'Aynı gün birden fazla vardiya'));
      for (const s of list) {
        const t = shiftType(s.type_id);
        if (!isNight(t)) continue;
        const next = (byDate[addDays(date, 1)] || {})[pk] || [];
        for (const n of next) {
          const nt = shiftType(n.type_id);
          if (nt && nt.start <= t.end) { flag(s, 'Gece nöbetinin ardından dinlenmeden vardiya'); flag(n, 'Gece nöbetinin ardından dinlenmeden vardiya'); }
        }
      }
    }
  }
  return bad;
}

function rosterView(editable) {
  const types = S.shift_types;
  if (!types.length) return html`<div class="card empty"><h3>Vardiya türü tanımlı değil</h3><p class="small">Yönetim › Bölüm ve birimler sayfasından vardiya ekleyin.</p></div>`;
  const days = monthDays(SH.month);
  const today = ymd(new Date());
  const bad = computeConflicts();
  const monthBad = [...bad.keys()].filter((k) => k.slice(0, 7) === SH.month).length;
  const filled = days.filter((d) => types.every((t) => cellEntries(d, t.id).length)).length;
  return html`
    ${monthBad ? html`<div class="form-note warn no-print" style="margin-bottom:12px;display:flex;gap:8px;align-items:center">${icon('alert', 'sm')}<span>Bu ay <b>${monthBad}</b> çakışan atama var (kırmızı çerçeveli). Üzerine gelerek nedenini görebilirsiniz.</span></div>` : ''}
    <div class="card">
      <div class="table-wrap">
        <table class="roster">
          <thead><tr><th>Gün</th>${types.map((t) => html`<th><span class="st-pill"><span class="legend-dot tone-${t.color}" style="background:currentColor"></span>${t.name}</span><span class="tm">${t.start} – ${t.end}</span></th>`)}</tr></thead>
          <tbody>${days.map((d) => {
            const dt = parseDT(d);
            const wd = dt.getDay();
            return html`<tr class="${wd === 0 || wd === 6 ? 'weekend' : ''} ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}">
              <td class="day"><b>${dt.getDate()} ${TR_MONTHS_S[dt.getMonth()]}</b><span>${TR_DAYS[wd]}${d === today ? ' · Bugün' : ''}</span></td>
              ${types.map((t) => {
                const list = cellEntries(d, t.id);
                return html`<td><div class="cell ${editable ? 'editable' : ''} ${list.length ? '' : 'empty'}" ${editable ? raw(`data-act="sh-edit" data-date="${d}" data-type="${t.id}" role="button" tabindex="0"`) : ''}>
                  ${list.map((s) => {
                    const why = bad.get(d + '|' + t.id + '|' + personKey(s));
                    const me = s.user_id === S.me.id;
                    return html`<span class="chip ${s.user_id ? '' : 'ext'} ${me ? 'me' : ''} ${why ? 'conflict' : ''}" title="${why || s.name}">${s.user_id ? avatar(s.name, 'sm') : ''}<span class="ellipsis">${s.name}</span></span>`;
                  })}
                  ${editable ? html`<span class="add">${icon('plus', 'sm')}${list.length ? '' : 'Ata'}</span>` : ''}
                  ${!editable && !list.length ? html`<span class="faint tiny" style="padding:4px 6px">—</span>` : ''}
                </div></td>`;
              })}
            </tr>`;
          })}</tbody>
        </table>
      </div>
    </div>
    <p class="tiny faint no-print" style="margin-top:10px">${filled}/${days.length} gün tamamen planlandı · Kendi nöbetleriniz renkli gösterilir.</p>`;
}

function summaryView() {
  const types = S.shift_types;
  const rows = {};
  for (const s of SH.data) {
    if (s.date.slice(0, 7) !== SH.month) continue;
    const k = personKey(s);
    const r = rows[k] = rows[k] || { name: s.name, user_id: s.user_id, total: 0, weekend: 0, by: {} };
    r.by[s.type_id] = (r.by[s.type_id] || 0) + 1;
    r.total++;
    const wd = parseDT(s.date).getDay();
    if (wd === 0 || wd === 6) r.weekend++;
  }
  const list = Object.values(rows).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'tr'));
  if (!list.length) return html`<div class="card empty"><div class="e-ico">${icon('chart', 'lg')}</div><h3>Bu ay için atama yok</h3><p class="small">Çizelgeye nöbet eklendikçe kişi bazlı dağılım burada görünür.</p></div>`;
  const max = Math.max(...list.map((r) => r.total));
  return html`<div class="card"><div class="table-wrap"><table class="t">
    <thead><tr><th>Kişi</th>${types.map((t) => html`<th style="text-align:center">${t.name}</th>`)}<th style="text-align:center">Hafta sonu</th><th>Toplam</th></tr></thead>
    <tbody>${list.map((r) => html`<tr>
      <td><div class="row">${avatar(r.name, 'sm')}<span class="${r.user_id === S.me.id ? '' : ''}"><b>${r.name}</b>${r.user_id ? '' : html` <span class="tiny faint">(kayıtsız)</span>`}</span></div></td>
      ${types.map((t) => html`<td style="text-align:center">${r.by[t.id] || html`<span class="faint">0</span>`}</td>`)}
      <td style="text-align:center">${r.weekend || html`<span class="faint">0</span>`}</td>
      <td style="min-width:150px"><div class="row"><div class="progress grow"><span style="width:${(r.total / max) * 100}%"></span></div><b style="width:24px;text-align:right">${r.total}</b></div></td>
    </tr>`)}</tbody></table></div></div>
    <p class="tiny faint" style="margin-top:10px">Adil dağılımı kontrol etmek için ${TR_MONTHS[+SH.month.slice(5) - 1]} ayı toplamları.</p>`;
}

function mineView() {
  if (SH.mine === null) return html`<div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:70%"></div></div>`;
  const today = ymd(new Date());
  const list = SH.mine.filter((s) => s.date >= today);
  if (!list.length) return html`<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>Yaklaşan nöbetiniz yok</h3><p class="small">Önümüzdeki 60 gün içinde size atanmış bir nöbet bulunmuyor.</p></div>`;
  return html`<div class="card">
    <div class="card-head"><h3>Önümüzdeki ${list.length} nöbetiniz</h3><button class="btn sm" data-act="sh-ics">${icon('download', 'sm')}Telefon takvimine aktar</button></div>
    <div>${list.map(myShiftRow)}</div></div>`;
}

/* ---------------- Dışa aktarma ---------------- */
ACT['sh-csv'] = () => {
  const types = S.shift_types;
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['Tarih', 'Gün', ...types.map((t) => `${t.name} (${t.start}-${t.end})`)].map(q).join(';')];
  for (const d of monthDays(SH.month)) {
    const dt = parseDT(d);
    lines.push([`${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`, TR_DAYS[dt.getDay()], ...types.map((t) => cellEntries(d, t.id).map((s) => s.name).join(', '))].map(q).join(';'));
  }
  const slug = trLower(unitName(SH.unitId)).replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const name = `nobet-${slug || 'liste'}-${SH.month}.csv`;
  if (downloadBlob(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), name) !== false) toast('Excel dosyası indirildi');
};

ACT['sh-ics'] = () => {
  const today = ymd(new Date());
  const list = (SH.mine || []).filter((s) => s.date >= today);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = list.map((s, i) => {
    const t = shiftType(s.type_id) || { name: 'Nöbet', start: '08:00', end: '16:00' };
    const start = s.date.replace(/-/g, '') + 'T' + t.start.replace(':', '') + '00';
    const endDate = isNight(t) ? addDays(s.date, 1) : s.date;
    const end = endDate.replace(/-/g, '') + 'T' + t.end.replace(':', '') + '00';
    return ['BEGIN:VEVENT', `UID:nobetmed-${S.me.id}-${s.date}-${s.type_id}-${i}@nobetmed`, `DTSTAMP:${stamp}`,
      `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${t.name} nöbeti${S.units.length > 1 ? ' – ' + unitName(s.unit_id) : ''}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Nöbet hatırlatması', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NobetMed//TR', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
  if (downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'nobetlerim.ics') !== false) toast('Takvim dosyası indirildi. Açarak telefonunuzun takvimine ekleyin.');
};

/* ---------------- Hücre düzenleme ---------------- */
ACT['sh-edit'] = (el) => {
  const date = el.dataset.date;
  const type = shiftType(+el.dataset.type);
  const dt = parseDT(date);
  let sel = cellEntries(date, type.id).map((s) => ({ user_id: s.user_id, name: s.name }));
  let filter = '';
  const unitPeople = S.people.filter((p) => p.unit_id === SH.unitId);
  const others = S.people.filter((p) => p.unit_id !== SH.unitId);

  const m = openModal({
    title: `${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${TR_DAYS[dt.getDay()]} · ${type.name}`,
    body: html`<div class="stack" style="gap:14px">
      <div><div class="label" style="margin-bottom:8px">Atananlar</div><div class="selected-chips" id="selChips"></div></div>
      <div class="search" style="max-width:none">${icon('search')}<input class="input" id="pickSearch" placeholder="Kişi ara…" autocomplete="off"></div>
      <div class="picker-list" id="pickList"></div>
      <form class="row" id="extForm"><input class="input" name="ext" placeholder="Listede olmayan kişi (ör. Pers. Kemal B.)" maxlength="120"><button class="btn" type="submit">${icon('plus', 'sm')}Ekle</button></form>
    </div>`,
    foot: html`<button class="btn danger" data-clear>Temizle</button><div class="grow"></div><button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
  });
  const chips = m.el.querySelector('#selChips');
  const listEl = m.el.querySelector('#pickList');
  const isSel = (p) => sel.some((s) => s.user_id === p.id);
  const draw = () => {
    setHTML(chips, sel.length ? sel.map((s, i) => html`<span class="chip ${s.user_id ? '' : 'ext'}">${s.user_id ? avatar(s.name, 'sm') : ''}<span>${s.name}</span><button class="x" data-unsel="${i}" aria-label="Çıkar">${icon('x', 'sm')}</button></span>`) : html`<span class="small faint">Henüz kimse atanmadı</span>`);
    const f = trLower(filter);
    const match = (p) => !f || trLower(p.name).includes(f);
    const row = (p) => html`<label class="pick"><input type="checkbox" data-pid="${p.id}" ${isSel(p) ? raw('checked') : ''}>${avatar(p.name, 'sm')}<div class="grow"><div class="small"><b>${p.name}</b></div><div class="tiny faint">${titleName(p.title_id)}${p.unit_id !== SH.unitId && unitName(p.unit_id) ? ' · ' + unitName(p.unit_id) : ''}</div></div></label>`;
    const a = unitPeople.filter(match), b = others.filter(match);
    setHTML(listEl, html`
      ${a.length ? html`<div class="tiny faint" style="padding:8px 12px 4px;font-weight:600">${unitName(SH.unitId).toLocaleUpperCase('tr-TR')}</div>${a.map(row)}` : ''}
      ${b.length ? html`<div class="tiny faint" style="padding:8px 12px 4px;font-weight:600">DİĞER BİRİMLER</div>${b.map(row)}` : ''}
      ${!a.length && !b.length ? html`<div class="small faint" style="padding:14px">Eşleşen kişi yok. Aşağıdan elle ekleyebilirsiniz.</div>` : ''}`);
  };
  draw();
  m.el.querySelector('#pickSearch').addEventListener('input', (e) => { filter = e.target.value; draw(); });
  listEl.addEventListener('change', (e) => {
    const id = +e.target.dataset.pid;
    const p = byId(S.people, id);
    if (!p) return;
    if (e.target.checked) { if (!isSel(p)) sel.push({ user_id: p.id, name: p.name }); } else sel = sel.filter((s) => s.user_id !== id);
    draw();
  });
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-unsel]'); if (b) { sel.splice(+b.dataset.unsel, 1); draw(); } });
  m.el.querySelector('#extForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.ext.value.trim();
    if (!v) return;
    const match = S.people.find((p) => trLower(p.name) === trLower(v));
    if (match) { if (!isSel(match)) sel.push({ user_id: match.id, name: match.name }); }
    else if (!sel.some((s) => !s.user_id && trLower(s.name) === trLower(v))) sel.push({ user_id: null, name: v });
    e.target.ext.value = '';
    draw();
  });
  const save = async (btn, people) => busy(btn, async () => {
    try {
      await api('shifts.set', { unit_id: SH.unitId, date, type_id: type.id, people });
      SH.data = SH.data.filter((s) => !(s.date === date && s.type_id === type.id)).concat(people.map((p) => ({ ...p, date, type_id: type.id })));
      m.close();
      drawShifts();
      toast('Çizelge güncellendi');
    } catch (e) { toast(e.message, 'err'); }
  });
  m.el.querySelector('[data-save]').addEventListener('click', (e) => save(e.currentTarget, sel));
  m.el.querySelector('[data-clear]').addEventListener('click', (e) => save(e.currentTarget, []));
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.cell[data-act]')) { e.preventDefault(); e.target.click(); }
});
