/* dupcii — ekstra nöbet isteyenler (4.9): kişi ay için ekstra nöbet istediğini bildirir; istek tarihinden ay sonuna kadar
   kurallara (izin, istekler, izin bitişiği hafta sonu, dinlenme, üst üste çalışma) uyan günler listelenir.
   Sorumlu gün gün uygun gönüllüleri görür ve çağrı açar. */
'use strict';

ROUTE_MOD.ekstra = 'ilan';
NM_EXT.hubTabs.push({ key: 'ekstra', mod: 'ilan', href: '#/ekstra', icon: 'plus', label: 'Ekstra nöbet' });
NM_EXT.routes.ekstra = (view, r) => (r[1] === 'liste' ? exBoardPage(view, r[2]) : r[1] === 'gonullu' ? exMePage(view, r[2]) : tkPage(view, r[1], r[2]));
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
/** tab: 'take' (nöbet devral) | 'me' (eksik çağrıları için gönüllü) | 'board' (sorumlu) */
function exHead(cur, tab, ym) {
  const tabs = [['take', 'Nöbet devral', '#/ekstra/' + ym]];
  if (modOn('eksik')) tabs.push(['me', 'Eksik çağrılarına gönüllü', '#/ekstra/gonullu/' + ym]);
  if (modOn('eksik') && isPublisherBase()) tabs.push(['board', 'Gönüllüler', '#/ekstra/liste/' + ym]);
  const pre = { take: '', me: 'gonullu/', board: 'liste/' }[tab];
  const sub = { take: 'Kimden nöbet alabilirsin? Hem senin hem nöbet sahibinin kurallarına uyan nöbetler, bugünden ay sonuna kadar. Seçip iste; kabul edilince sorumluya iletilir.',
    me: 'Eksik personel çağrılarında öncelikli sorulmak için gönüllü ol; kurallara uyan günlerin listelenir.', board: 'Eksik çağrılarına gönüllü olanlar ve kurallara göre uygun oldukları günler' }[tab];
  return html`<div class="page-head"><div><h1>Ekstra nöbet</h1><p>${sub}</p></div></div>
    ${tabs.length > 1 ? html`<div class="seg">${tabs.map(([k, l, h]) => html`<a class="${tab === k ? 'on' : ''}" href="${h}">${l}</a>`)}</div>` : ''}
    <div class="seg ex-months">${exMonths().map((m) => html`<a class="${m === cur ? 'on' : ''}" href="#/ekstra/${pre}${m}">${exMonthName(m)}</a>`)}</div>`;
}

/* ---------------- Kişi: benim isteğim ve uygun günlerim ---------------- */
async function exMePage(view, ym0) {
  const ym = exMonths().includes(ym0) ? ym0 : exMonths()[0];
  setHTML(view, html`${exHead(ym, 'me', ym)}<div id="exBody" style="margin-top:12px">${mkSpin()}</div>`);
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
  if (!isPublisherBase()) { location.hash = '#/ekstra/' + ym; return; }
  setHTML(view, html`${exHead(ym, 'board', ym)}<div id="exBody" style="margin-top:12px">${mkSpin()}</div>`);
  let r;
  try { r = await api('extra.board', { ym }); } catch (e) { setHTML($('#exBody'), mkErr(e.message)); return; }
  const box = $('#exBody'); if (!box) return;
  if (!r.people.length) { setHTML(box, html`<div class="card empty"><div class="e-ico">${icon('users', 'lg')}</div><h3>${exMonthName(ym)} için ekstra nöbet isteyen yok</h3><p class="small">Kişiler Nöbet › Ekstra nöbet’ten istek verince burada, uygun oldukları günlerle görünür.</p></div>`); return; }
  setHTML(box, html`
    <div class="sec-title mk-sec">İsteyenler <span class="faint">(${r.people.length})</span></div>
    <div class="card"><div class="list">${r.people.map((p) => html`<div class="list-row">${pAvatar(p.name, 'sm', null, p.user_id)}<div class="grow" style="min-width:0"><div class="lr-t">${pName(p.name, p.user_id)}${p.roster ? html` <span class="tiny faint">· ${p.roster}</span>` : ''}</div>
      <div class="lr-s">${fmtDate(p.from)}’den itibaren · ${p.shifts.map((s) => EX_SHORT[s]).join(', ')} · ${p.days ? p.days.length + ' seçili gün' : 'uygun tüm günler'}${p.note ? ' · “' + p.note + '”' : ''}</div></div>
      <span class="badge ${p.ok_days ? 'success' : 'warn'}">${p.found ? p.ok_days + ' gün uygun' : 'listede yok'}</span></div>`)}</div></div>
    <div class="sec-title mk-sec">Gün gün uygun olanlar</div>
    ${r.days.length ? html`<div class="card"><div class="list ex-days">${r.days.map((d) => html`<div class="list-row ex-day">${mkDayBlock(d.date)}<div class="grow" style="min-width:0">
        ${d.short && (d.short.day || d.short.night) ? html`<span class="badge danger">${[d.short.day ? 'gündüz ' + d.short.day : '', d.short.night ? 'gece ' + d.short.night : ''].filter(Boolean).join(', ')} eksik</span>` : ''}
        <div class="ex-ppl">${d.people.map((p) => html`<span class="ex-p">${pAvatar(p.name, 'sm', null, p.user_id)}<b>${pName(p.name, p.user_id)}</b><span class="tiny faint">${p.shifts.map((s) => EX_SHORT[s]).join(' / ')}</span></span>`)}</div></div>
        <button class="btn sm" data-act="ex-callout" data-d="${d.date}" data-s="${d.short && d.short.night && !d.short.day ? 'night' : d.short && d.short.day && !d.short.night ? 'day' : (d.people[0].shifts[0] || 'night')}">${icon('alert', 'sm')}Çağrı aç</button></div>`)}</div></div>`
      : html`<div class="card empty"><p class="small">Kalan günlerde kurallara uyan gönüllü yok.</p></div>`}`);
}
ACT['ex-callout'] = (el) => { if (typeof openCalloutModal === 'function') openCalloutModal({ date: el.dataset.d, shift: el.dataset.s }); };

/* =================================================================== */
/* Nöbet devral: hem benim alabileceğim hem sahibinin bırakabileceği     */
/* =================================================================== */
const TK = { gen: {}, f: 'all' };
const TK_ST = { pending: ['Yanıt bekliyor', 'warn'], accepted: ['Kabul edildi', 'success'], declined: ['Reddedildi', 'danger'], cancelled: ['Geri çekildi', ''], closed: ['Başkasına verildi', ''] };
const tkShiftOf = (x) => x.shift || 'day';
/** Alınabilir mi: tamamı ya da (24 saatte) gündüzü / gecesi */
const tkAny = (x) => (x.any !== undefined ? x.any : x.ok);
const TK_PART = { day: 'gündüzü (08-16)', night: 'gecesi (16-08)' };
async function tkPage(view, ym0, date) {
  const ym = exMonths().includes(ym0) ? ym0 : exMonths()[0];
  if (date && (!/^\d{4}-\d\d-\d\d$/.test(date) || date.slice(0, 7) !== ym)) date = '';
  setHTML(view, html`${exHead(ym, 'take', ym)}<div id="tkBody" style="margin-top:12px">${mkSpin()}</div>`);
  try {
    const gen = await api('extra.take', { ym });
    TK.gen[ym] = gen;
    TK.d = date ? await api('extra.take', { ym, date }) : gen;
  } catch (e) { setHTML($('#tkBody'), mkErr(e.message)); return; }
  TK.ym = ym; TK.date = date || '';
  tkDraw();
}
function tkReqHtml(reqs) {
  const inc = reqs.filter((r) => r.dir === 'in' && r.status === 'pending');
  const out = reqs.filter((r) => r.dir === 'out');
  if (!inc.length && !out.length) return '';
  return html`${inc.length ? html`<div class="sec-title mk-sec">Senden nöbet isteyenler <span class="faint">(${inc.length})</span></div>
    <div class="card"><div class="list">${inc.map((r) => html`<div class="list-row tk-req">${mkDayBlock(r.date)}<div class="grow" style="min-width:0"><div class="lr-t"><b>${r.taker}</b> ${r.code} nöbetinin ${r.part ? html`<b>yalnız ${TK_PART[r.part]}</b>` : 'tamamını'} senden almak istiyor</div>${r.note ? html`<div class="lr-s">“${r.note}”</div>` : ''}</div>
      <div class="row" style="gap:6px"><button class="btn sm primary" data-act="tk-resp" data-id="${r.id}" data-a="1">Ver</button><button class="btn sm ghost" data-act="tk-resp" data-id="${r.id}" data-a="0">Verme</button></div></div>`)}</div></div>` : ''}
    ${out.length ? html`<div class="sec-title mk-sec">İsteklerim</div>
    <div class="card"><div class="list">${out.map((r) => html`<div class="list-row tk-req">${mkDayBlock(r.date)}<div class="grow" style="min-width:0"><div class="lr-t"><b>${r.giver}</b> · ${r.code}${r.part ? html` <span class="badge warn">yalnız ${TK_PART[r.part]}</span>` : ''}</div>${r.reason ? html`<div class="lr-s">${r.reason}</div>` : ''}</div>
      <span class="badge ${(TK_ST[r.status] || [])[1] || ''}">${(TK_ST[r.status] || [r.status])[0]}</span>${r.status === 'pending' ? html`<button class="btn sm ghost" data-act="tk-cancel" data-id="${r.id}">Geri çek</button>` : ''}</div>`)}</div></div>` : ''}`;
}
function tkDraw() {
  const box = $('#tkBody'); const d = TK.d; if (!box || !d) return;
  const gen = TK.gen[TK.ym] || d;
  if (!d.found) { setHTML(box, html`${tkReqHtml(d.requests)}<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>${exMonthName(TK.ym)} listesinde adın yok</h3><p class="small">Ayın nöbet listesi yayımlanınca kimden nöbet alabileceğini burada görürsün.</p></div>`); return; }
  // Gün şeridi (genel listeden sayılar)
  const counts = {}; gen.days.forEach((x) => { counts[x.date] = x.items.filter(tkAny).length; });
  const start = new Date(); const s0 = TK.ym === ymd(start).slice(0, 7) ? ymd(start) : TK.ym + '-01';
  const last = new Date(+TK.ym.slice(0, 4), +TK.ym.slice(5, 7), 0).getDate();
  const strip = [];
  for (let i = +s0.slice(8); i <= last; i++) { const ds = `${TK.ym}-${pad(i)}`; const dt = parseDT(ds); strip.push(html`<a class="tk-dc ${TK.date === ds ? 'on' : ''} ${counts[ds] ? '' : 'none'} ${dt.getDay() % 6 === 0 ? 'wk' : ''}" href="#/ekstra/${TK.ym}/${ds}"><b>${i}</b><span>${TR_DAYS_S[dt.getDay()]}</span><em>${counts[ds] || '–'}</em></a>`); }
  // Gündüz / gece süzgecinde 24 saatlik nöbetin alınabilir parçası da görünür
  const flt = (x) => TK.f === 'all' || tkShiftOf(x) === TK.f || (x.parts && x.parts[TK.f] && x.parts[TK.f].ok);
  const days = d.days.map((x) => ({ ...x, items: x.items.filter(flt) })).filter((x) => x.items.length);
  const total = days.reduce((a, x) => a + x.items.filter(tkAny).length, 0);
  const askBtn = (x, date, part, label, primary) => html`<button class="btn sm ${primary ? 'primary' : ''}" data-act="tk-ask" data-d="${date}" data-n="${x.name}" data-l="${x.display}" data-c="${x.code}" data-p="${part}">${icon('send', 'sm')}${label}</button>`;
  const acts = (x, date) => {
    if (!tkAny(x)) return '';
    if (x.asked) return html`<span class="badge warn">İstendi</span>`;
    if (!x.user_id) return html`<span class="badge" title="Uygulamada hesabı yok; telefonla sorun">hesabı yok</span>`;
    if (!x.parts) return askBtn(x, date, '', 'İste', true);
    return html`<div class="tk-parts">${x.ok ? askBtn(x, date, '', 'Tümünü iste', true) : ''}${x.parts.day.ok ? askBtn(x, date, 'day', 'Gündüzü 08-16', !x.ok) : ''}${x.parts.night.ok ? askBtn(x, date, 'night', 'Gecesi 16-08', !x.ok && !x.parts.day.ok) : ''}</div>`;
  };
  const item = (x, date) => html`<div class="list-row tk-it ${tkAny(x) ? '' : 'dim'}">${pAvatar(x.display, 'sm', null, x.user_id)}<div class="grow" style="min-width:0">
      <div class="lr-t"><b>${pName(x.display, x.user_id)}</b>${x.title ? html` <span class="tiny faint">· ${x.title}</span>` : ''}</div>
      <div class="row wrap" style="gap:4px;margin-top:2px">${codeChip(mkEntry(x))}<span class="small muted">${shiftDesc(mkEntry(x))}</span>${x.listed ? html`<span class="badge brand" title="Bu nöbeti ilana koydu">${icon('megaphone', 'sm')}İlanda</span>` : ''}${x.roster ? html`<span class="tiny faint">${x.roster}</span>` : ''}</div>
      ${x.ok ? '' : html`${x.parts && tkAny(x) ? html`<div class="tiny faint">Tamamı alınamaz; ${x.parts.day.ok && x.parts.night.ok ? 'gündüzü ya da gecesi' : x.parts.day.ok ? 'yalnız gündüzü (08-16)' : 'yalnız gecesi (16-08)'} alınabilir.</div>` : ''}${x.my_why ? html`<div class="tiny mk-no">${x.parts && tkAny(x) ? 'Tamamı · ' : ''}Sen: ${x.my_why}</div>` : ''}${x.their_why ? html`<div class="tiny mk-no">${x.display.split(' ')[0]}: ${x.their_why}</div>` : ''}`}</div>
    ${acts(x, date)}</div>`;
  setHTML(box, html`${tkReqHtml(d.requests)}
    <div class="tk-strip"><a class="tk-dc all ${TK.date ? '' : 'on'}" href="#/ekstra/${TK.ym}"><b>Tümü</b><span>gün</span><em>${gen.days.reduce((a, x) => a + x.items.filter(tkAny).length, 0)}</em></a>${strip}</div>
    <div class="row wrap" style="gap:8px;margin:10px 0"><div class="seg">${[['all', 'Tüm vardiyalar'], ['24', '24 saat'], ['day', 'Gündüz'], ['night', 'Gece']].map(([k, l]) => html`<button type="button" class="${TK.f === k ? 'on' : ''}" data-act="tk-f" data-f="${k}">${l}</button>`)}</div>
      <span class="small muted">${TK.date ? dateLabel(TK.date) + ' · ' : ''}${total} nöbet alınabilir</span></div>
    ${TK.date && d.days[0] && d.days[0].mine ? html`<div class="mk-box">${icon('info', 'sm')}<span>${d.days[0].items.some(tkAny) ? `O gün senin ${d.days[0].mine} nöbetin var; 24 saatlik nöbetlerin yalnız tamamlayan kısmını alabilirsin (ikisi 24 saate birleşir).` : `O gün senin de ${d.days[0].mine} kaydın var; bu yüzden o günün nöbetlerini alamazsın.`}</span></div>` : ''}
    ${days.length ? days.map((x) => html`${TK.date ? '' : html`<div class="sec-title mk-sec">${dateLabel(x.date)} <span class="faint">(${x.items.length})</span></div>`}<div class="card"><div class="list">${x.items.map((i) => item(i, x.date))}</div></div>`)
      : html`<div class="card empty"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>${TK.date ? 'Bu gün alabileceğin nöbet yok' : 'Alabileceğin nöbet yok'}</h3><p class="small">${TK.date ? 'O gün nöbeti olan kimse yok ya da kurallar uymuyor.' : 'Kalan günlerde hem senin hem nöbet sahibinin kurallarına uyan bir nöbet bulunamadı.'}</p></div>`}
    <p class="tiny faint" style="margin-top:10px">Senin için: o gün boş olman, boşluk/izin isteğin olmaması, nöbetten çıkınca en az ${d.rules.rest} saat dinlenme, üst üste en fazla ${d.rules.max_cont} saat. Nöbet sahibi için: bırakınca ${d.rules.max_gap + 1} günlük boşluk oluşmaması. Kabul edilmiş değişimler hesaba katılır.</p>`);
  const on = $('.tk-dc.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}
ACT['tk-f'] = (el) => { TK.f = el.dataset.f; tkDraw(); };
ACT['tk-ask'] = (el) => {
  const part = el.dataset.p || '';
  const md = openModal({ title: 'Nöbeti iste', size: 'narrow', body: html`<div class="stack"><p class="small"><b>${el.dataset.l}</b> kişisinden <b>${dateLabel(el.dataset.d)}</b> ${el.dataset.c} nöbetinin ${part ? html`<b>yalnız ${TK_PART[part]}</b>` : 'tamamını'} istiyorsun.${part ? ` ${part === 'day' ? 'Gecesi (16-08)' : 'Gündüzü (08-16)'} onda kalır.` : ''} Kabul ederse sorumluya “Excel’e işlenecek” olarak iletilir.</p>
    <div class="field"><label>Not (isteğe bağlı)</label><input class="input" id="tkNote" maxlength="200" placeholder="ör. Uygunsa ben alabilirim"></div></div>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-go>${icon('send', 'sm')}İste</button>` });
  md.el.querySelector('[data-go]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    try { await api('extra.take.ask', { date: el.dataset.d, name: el.dataset.n, part, note: $('#tkNote', md.el).value.trim() }); md.close(); toast('İstek gönderildi'); route(); } catch (e) { toast(e.message, 'err'); }
  }));
};
ACT['tk-resp'] = async (el) => {
  const yes = el.dataset.a === '1';
  if (yes && !(await confirmDialog({ title: 'Nöbeti veriyor musun?', text: 'Kabul edince nöbet devri sorumluya “Excel’e işlenecek” olarak iletilir.', ok: 'Ver' }))) return;
  try { await api('extra.take.respond', { id: +el.dataset.id, accept: yes }); toast(yes ? 'Nöbet devri kabul edildi' : 'İstek reddedildi'); route(); } catch (e) { toast(e.message, 'err'); }
};
ACT['tk-cancel'] = async (el) => { try { await api('extra.take.cancel', { id: +el.dataset.id }); toast('İstek geri çekildi'); route(); } catch (e) { toast(e.message, 'err'); } };
Object.assign(NM_EXT.audit, { 'take.ask': 'Nöbet devralma isteği gönderdi', 'take.accept': 'Nöbetini devretmeyi kabul etti', 'take.decline': 'Nöbet devralma isteğini reddetti' });
