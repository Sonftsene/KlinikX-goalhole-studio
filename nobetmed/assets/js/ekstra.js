/* dupcii — ekstra nöbet isteyenler (4.9): kişi ay için ekstra nöbet istediğini bildirir; istek tarihinden ay sonuna kadar
   kurallara (izin, istekler, izin bitişiği hafta sonu, dinlenme, üst üste çalışma) uyan günler listelenir.
   Sorumlu gün gün uygun gönüllüleri görür ve çağrı açar. */
'use strict';

ROUTE_MOD.ekstra = 'eksik';
NM_EXT.hubTabs.push({ key: 'ekstra', mod: 'eksik', href: '#/ekstra', icon: 'plus', label: 'Ekstra nöbet' });
NM_EXT.routes.ekstra = (view, r) => (r[1] === 'liste' ? exBoardPage(view, r[2]) : exMePage(view, r[1]));
NM_EXT.notif.extra = ['emerald', 'plus'];
Object.assign(NM_EXT.audit, { 'extra.save': 'Ekstra nöbet isteği verdi', 'extra.cancel': 'Ekstra nöbet isteğini geri çekti' });

const EX = { d: null, sel: null };
const EX_SHORT = { 24: '24 sa', day: 'Gündüz', night: 'Gece' };
function exMonths() {
  const t = new Date();
  const a = `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
  const n = new Date(t.getFullYear(), t.getMonth() + 1, 1);
  return [a, `${n.getFullYear()}-${pad(n.getMonth() + 1)}`];
}
const exMonthName = (ym) => `${TR_MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
function exHead(cur, board, ym) {
  return html`<div class="page-head"><div><h1>Ekstra nöbet</h1><p>${board ? 'Ekstra nöbet almak isteyenler ve kurallara göre uygun oldukları günler' : 'Ekstra nöbet almak istediğini bildir; kurallara uyan günlerin listelenir, eksik çağrılarında öncelikli görünürsün.'}</p></div>
    ${isPublisher() ? html`<div class="seg">${[['me', 'Benim isteğim', '#/ekstra/' + ym], ['board', 'İsteyenler', '#/ekstra/liste/' + ym]].map(([k, l, h]) => html`<a class="${(board ? 'board' : 'me') === k ? 'on' : ''}" href="${h}">${l}</a>`)}</div>` : ''}</div>
    <div class="seg ex-months">${exMonths().map((m) => html`<a class="${m === cur ? 'on' : ''}" href="#/ekstra/${board ? 'liste/' : ''}${m}">${exMonthName(m)}</a>`)}</div>`;
}

/* ---------------- Kişi: benim isteğim ve uygun günlerim ---------------- */
async function exMePage(view, ym0) {
  const ym = exMonths().includes(ym0) ? ym0 : exMonths()[0];
  setHTML(view, html`${exHead(ym, false, ym)}<div id="exBody" style="margin-top:12px">${mkSpin()}</div>`);
  try { EX.d = await api('extra.me', { ym }); } catch (e) { setHTML($('#exBody'), mkErr(e.message)); return; }
  const r = EX.d;
  EX.sel = new Set(r.reg && r.reg.days ? r.reg.days : []);
  EX.mode = r.reg && r.reg.days ? 'pick' : 'all';
  EX.shifts = new Set(r.reg ? r.reg.shifts : ['24', 'day', 'night']);
  exMeDraw();
}
function exMeDraw() {
  const box = $('#exBody'); const r = EX.d; if (!box || !r) return;
  if (!r.found) { setHTML(box, html`<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>${exMonthName(r.ym)} listesinde adın yok</h3><p class="small">Ayın nöbet listesi yayımlanınca ekstra nöbet isteği verebilir, uygun günlerini görebilirsin.</p></div>`); return; }
  const reg = r.reg;
  const okFor = (d) => [...EX.shifts].filter((s) => d.types[s].ok);
  const okDays = r.days.filter((d) => okFor(d).length);
  const rules = r.rules || {};
  setHTML(box, html`
    <div class="card card-pad stack ex-reg">
      ${reg ? html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span><b>Ekstra nöbet isteğin kayıtlı.</b> ${fmtDate(reg.from)} tarihinden ay sonuna kadar · ${reg.shifts.map((s) => EX_SHORT[s]).join(', ')} · ${reg.days ? reg.days.length + ' seçili gün' : 'uygun tüm günler'}. Sorumlular eksik çağrılarında seni en üstte görür.</span></div>` : ''}
      <div class="field"><label>Hangi vardiyaları alabilirsin?</label><div class="row wrap" style="gap:8px">${Object.entries(r.shifts).map(([k, l]) => html`<label class="ex-chk"><input type="checkbox" data-change="ex-shift" value="${k}" ${EX.shifts.has(k) ? raw('checked') : ''}><span>${l}</span></label>`)}</div></div>
      <div class="field"><label>Hangi günler?</label><div class="seg">${[['all', 'Uygun tüm günler'], ['pick', 'Seçtiğim günler']].map(([k, l]) => html`<button type="button" class="${EX.mode === k ? 'on' : ''}" data-act="ex-mode" data-m="${k}">${l}</button>`)}</div></div>
      <div class="field"><label>Not (isteğe bağlı)</label><input class="input" id="exNote" maxlength="200" value="${reg ? reg.note : ''}" placeholder="ör. Hafta sonları tercihim, akşamları ulaşılabilirim"></div>
      <div class="row wrap" style="gap:6px"><button class="btn primary" data-act="ex-save">${icon('check', 'sm')}${reg ? 'İsteği güncelle' : 'Ekstra nöbet istiyorum'}</button>${reg ? html`<button class="btn ghost danger" data-act="ex-cancel">İsteği geri çek</button>` : ''}</div>
      <p class="tiny faint">Kurallar: o gün nöbet/izin yok · onaylı ya da bekleyen boşluk/izin isteği yok · hafta içi en az ${rules.leave_wknd || 5} iş günü izinliysen izninin öncesi/sonrasındaki hafta sonu yok · nöbetten çıkınca en az ${rules.rest} saat dinlenme · üst üste en fazla ${rules.max_cont} saat.</p>
    </div>
    <div class="sec-title mk-sec">${fmtDate(r.days.length ? r.days[0].date : r.ym + '-01')} – ay sonu · <span class="faint">${okDays.length} gün uygun</span></div>
    ${r.days.length ? html`<div class="card"><div class="list ex-days">${r.days.map((d) => { const ok = okFor(d); const why = !ok.length ? (Object.values(d.types).find((t) => t.why) || {}).why : ''; const pick = EX.mode === 'pick';
      return html`<div class="list-row ex-day ${ok.length ? '' : 'dim'}">${pick ? html`<input type="checkbox" data-change="ex-pick" value="${d.date}" ${EX.sel.has(d.date) ? raw('checked') : ''} ${ok.length ? '' : raw('disabled')} aria-label="${d.date} seç">` : ''}
        ${mkDayBlock(d.date)}<div class="grow" style="min-width:0"><div class="row wrap" style="gap:4px">${Object.keys(r.shifts).map((s) => html`<span class="co-c ${d.types[s].ok ? 'ok' : 'no'} ${EX.shifts.has(s) ? '' : 'off'}" title="${d.types[s].why || 'Uygun'}">${icon(d.types[s].ok ? 'check' : 'x', 'sm')}${EX_SHORT[s]}</span>`)}
          ${d.holiday ? html`<span class="badge warn">${d.holiday}</span>` : d.weekend ? html`<span class="badge">hafta sonu</span>` : ''}
          ${d.short && (d.short.day || d.short.night) ? html`<span class="badge danger" title="Gereken sayıya göre">${[d.short.day ? 'gündüz ' + d.short.day : '', d.short.night ? 'gece ' + d.short.night : ''].filter(Boolean).join(', ')} eksik</span>` : ''}</div>
          ${why ? html`<div class="tiny mk-no">${why}</div>` : ''}</div></div>`; })}</div></div>`
      : html`<div class="card empty"><p class="small">Bu ayda kalan gün yok.</p></div>`}`);
}
CHANGE['ex-shift'] = (el) => { if (el.checked) EX.shifts.add(el.value); else EX.shifts.delete(el.value); exMeDraw(); };
CHANGE['ex-pick'] = (el) => { if (el.checked) EX.sel.add(el.value); else EX.sel.delete(el.value); };
ACT['ex-mode'] = (el) => { EX.mode = el.dataset.m; exMeDraw(); };
ACT['ex-save'] = (el) => busy(el, async () => {
  if (!EX.shifts.size) { toast('En az bir vardiya türü seçin', 'err'); return; }
  try {
    EX.d = await api('extra.save', { ym: EX.d.ym, shifts: [...EX.shifts], days: EX.mode === 'pick' ? [...EX.sel] : null, note: ($('#exNote') || {}).value || '' });
    toast('Ekstra nöbet isteğin kaydedildi'); exMeDraw();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['ex-cancel'] = async () => {
  if (!(await confirmDialog({ title: 'Ekstra nöbet isteği geri çekilsin mi?', ok: 'Geri çek', danger: true }))) return;
  try { await api('extra.cancel', { ym: EX.d.ym }); toast('İstek geri çekildi'); route(); } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Sorumlu: gün gün uygun gönüllüler ---------------- */
async function exBoardPage(view, ym0) {
  const ym = exMonths().includes(ym0) ? ym0 : exMonths()[0];
  if (!isPublisher()) { location.hash = '#/ekstra/' + ym; return; }
  setHTML(view, html`${exHead(ym, true, ym)}<div id="exBody" style="margin-top:12px">${mkSpin()}</div>`);
  let r;
  try { r = await api('extra.board', { ym }); } catch (e) { setHTML($('#exBody'), mkErr(e.message)); return; }
  const box = $('#exBody'); if (!box) return;
  if (!r.people.length) { setHTML(box, html`<div class="card empty"><div class="e-ico">${icon('users', 'lg')}</div><h3>${exMonthName(ym)} için ekstra nöbet isteyen yok</h3><p class="small">Kişiler Nöbet › Ekstra nöbet’ten istek verince burada, uygun oldukları günlerle görünür.</p></div>`); return; }
  setHTML(box, html`
    <div class="sec-title mk-sec">İsteyenler <span class="faint">(${r.people.length})</span></div>
    <div class="card"><div class="list">${r.people.map((p) => html`<div class="list-row">${avatar(p.name, 'sm')}<div class="grow" style="min-width:0"><div class="lr-t">${p.name}${p.roster ? html` <span class="tiny faint">· ${p.roster}</span>` : ''}</div>
      <div class="lr-s">${fmtDate(p.from)}’den itibaren · ${p.shifts.map((s) => EX_SHORT[s]).join(', ')} · ${p.days ? p.days.length + ' seçili gün' : 'uygun tüm günler'}${p.note ? ' · “' + p.note + '”' : ''}</div></div>
      <span class="badge ${p.ok_days ? 'success' : 'warn'}">${p.found ? p.ok_days + ' gün uygun' : 'listede yok'}</span></div>`)}</div></div>
    <div class="sec-title mk-sec">Gün gün uygun olanlar</div>
    ${r.days.length ? html`<div class="card"><div class="list ex-days">${r.days.map((d) => html`<div class="list-row ex-day">${mkDayBlock(d.date)}<div class="grow" style="min-width:0">
        ${d.short && (d.short.day || d.short.night) ? html`<span class="badge danger">${[d.short.day ? 'gündüz ' + d.short.day : '', d.short.night ? 'gece ' + d.short.night : ''].filter(Boolean).join(', ')} eksik</span>` : ''}
        <div class="ex-ppl">${d.people.map((p) => html`<span class="ex-p">${avatar(p.name, 'sm')}<b>${p.name}</b><span class="tiny faint">${p.shifts.map((s) => EX_SHORT[s]).join(' / ')}</span></span>`)}</div></div>
        <button class="btn sm" data-act="ex-callout" data-d="${d.date}" data-s="${d.short && d.short.night && !d.short.day ? 'night' : d.short && d.short.day && !d.short.night ? 'day' : (d.people[0].shifts[0] || 'night')}">${icon('alert', 'sm')}Çağrı aç</button></div>`)}</div></div>`
      : html`<div class="card empty"><p class="small">Kalan günlerde kurallara uyan gönüllü yok.</p></div>`}`);
}
ACT['ex-callout'] = (el) => { if (typeof openCalloutModal === 'function') openCalloutModal({ date: el.dataset.d, shift: el.dataset.s }); };
