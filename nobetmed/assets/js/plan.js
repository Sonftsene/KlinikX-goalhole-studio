/* dupcii — nöbet çizelgesi hazırlama (4.5): Excel kullanmayan birimler çizelgeyi portalda hazırlar.
   Taslak sunucuda; kural denetimi ve otomatik doldurma sunucuda (aynı kural motoru); yayınlanınca Excel görünümüyle
   listeye yeni sürüm yüklenir ve nöbetler kaydedilir (Takvimim, Kim nöbette, blok yerleşimi, ilan, çağrı aynen çalışır). */
'use strict';

NM_EXT.routes.cizelge = (view, r) => planPage(view, r);
NM_EXT.hubTabs.push({ key: 'cizelge', mod: 'cizelge', pub: true, href: '#/cizelge', icon: 'edit', label: 'Çizelge' });
Object.assign(NM_EXT.audit, { 'plan.publish': 'Nöbet çizelgesini yayınladı' });

const PL2 = { rid: 0, ym: '', d: null, codes: [], req: {}, hol: {}, half: [], brush: null, dirty: false, chk: null, timer: null, roster: null, tab: 'grid', marks: {}, signed: null, published: false, synced: 0 };
const PL2_TABS = [['grid', 'Çizelge', 'table'], ['chg', 'Değişiklikler', 'history'], ['resmi', 'Resmi liste', 'file']];
const PL2_TAB_URL = { grid: '', chg: 'degisiklik', resmi: 'resmi' };

function planRosters() { return (S.rosters || []).filter((r) => r.kind !== 'tablo' && !r.linked); }
function planDays(ym) { const [y, m] = ym.split('-').map(Number); const n = new Date(y, m, 0).getDate(); return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`); }
function planCode(code) { return PL2.codes.find((c) => c.code === code) || null; }
function planTone(code) {
  const c = planCode(code);
  if (!c) return 'slate';
  if (c.kind !== 'shift') return c.kind === 'leave' ? 'emerald' : 'slate';
  if ((c.hours || 0) >= 20 || (c.start && c.start === c.end)) return 'violet';
  return c.start && c.end && c.end <= c.start ? 'indigo' : 'amber';
}
/** Vardiya gündüzün (08-16) ve gecenin (16-08) kaçta kaçını kapsar (sunucudaki shift_cover ile aynı) */
function shiftCover(c) {
  if (!c || c.kind !== 'shift') return { day: 0, night: 0 };
  const hm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? +m[1] + +m[2] / 60 : null; };
  const s = hm(c.start); let e = hm(c.end);
  if (s === null || e === null) { const h = +c.hours || 0; return h >= 20 ? { day: 1, night: 1 } : h >= 16 ? { day: 0, night: 1 } : { day: 1, night: 0 }; }
  if (e <= s) e += 24;
  const ov = (a, b) => Math.max(0, Math.min(e, b) - Math.max(s, a));
  return { day: Math.min(1, (ov(8, 16) + ov(32, 40)) / 8), night: Math.min(1, (ov(16, 32) + ov(-8, 8)) / 16) };
}
/** Kesirli kişi sayısı: 2, 2½, 2¼ … */
function fmtN(x) {
  const r = Math.round(x * 4) / 4;
  const w = Math.floor(r + 1e-9); const f = r - w;
  const fr = f >= 0.74 ? '¾' : f >= 0.49 ? '½' : f >= 0.24 ? '¼' : '';
  return fr ? (w ? w + fr : fr) : String(w);
}
function planNextYm(ym, k) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

async function planPage(view, r) {
  if (!canManage('cizelge')) { location.hash = '#/'; return; }
  if (PL2.dirty && PL2.d) planSave(true); // geri tuşuyla başka aya / listeye geçilirken taslak kaybolmasın
  if (typeof pjSaveDirty === 'function') pjSaveDirty();
  if (r[1] === 'taraflar') return pjPage(view, r[2]);
  const list = planRosters();
  if (r[1] && /^\d+$/.test(r[1])) PL2.rid = +r[1];
  if (!list.some((x) => x.id === PL2.rid)) PL2.rid = list.length ? list[0].id : 0;
  if (r[2] && /^\d{4}-\d{2}$/.test(r[2])) PL2.ym = r[2];
  PL2.tab = r[3] === 'degisiklik' ? 'chg' : r[3] === 'resmi' ? 'resmi' : 'grid';
  if (!PL2.ym) PL2.ym = planNextYm(ymd(new Date()).slice(0, 7), new Date().getDate() > 15 ? 1 : 0);
  setHTML(view, html`${hubHead('cizelge', 'Excel kullanmadan nöbet çizelgesi hazırlayın; kurallar denetlenir, eksik günler otomatik doldurulabilir.')}
    <div id="plBody">${list.length ? html`<div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div></div>`
      : html`<div class="card empty"><h3>Uygun liste yok</h3><p class="small">Çizelge, Google E-Tablolar’a bağlı olmayan bir nöbet listesi için hazırlanır. Nöbet listeleri sayfasından bir liste oluşturun.</p></div>`}</div>`);
  if (!list.length) return;
  await planLoad();
}
async function planLoad() {
  const box = $('#plBody');
  if (!box) return;
  let r;
  try { r = await api('plan.get', { roster_id: PL2.rid, ym: PL2.ym }); } catch (e) { setHTML(box, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  PL2.d = r.draft; PL2.codes = r.codes; PL2.req = r.requests || {}; PL2.hol = r.holidays || {}; PL2.roster = r.roster; PL2.dirty = false; PL2.chk = null; PL2.joint = !!r.joint;
  PL2.half = r.half || []; PL2.marks = r.marks && !Array.isArray(r.marks) ? r.marks : {}; PL2.signed = r.signed || null; PL2.published = !!r.published; PL2.synced = r.synced || 0;
  PL2.d.cells = PL2.d.cells && !Array.isArray(PL2.d.cells) ? PL2.d.cells : {};
  PL2.d.reqs = PL2.d.reqs && !Array.isArray(PL2.d.reqs) ? PL2.d.reqs : {};
  PL2.d.hfix = PL2.d.hfix && !Array.isArray(PL2.d.hfix) ? PL2.d.hfix : {};
  if (!PL2.d.leave_code) PL2.d.leave_code = (PL2.codes.find((c) => c.kind !== 'shift' && /yıllık/i.test(c.label || '')) || {}).code || '';
  if (PL2.synced) PL2.dirty = true; // yayından sonraki değişim / devirler taslağa işlendi: kaydedilsin
  try { await rsLoadTpl(); } catch (e) { /* şablon okunamadıysa varsayılan saatlerle */ }
  PL2.d.needs = PL2.d.needs || { weekday: { day: 0, night: 0 }, weekend: { day: 0, night: 0 } };
  const shiftCodes = PL2.codes.filter((c) => c.kind === 'shift');
  if (!PL2.d.day_code) PL2.d.day_code = (shiftCodes.find((c) => c.start === '08:00' && c.end === '16:00') || shiftCodes[0] || {}).code || '';
  if (!PL2.d.night_code) PL2.d.night_code = (shiftCodes.find((c) => c.start === '16:00' && c.end === '08:00') || shiftCodes[1] || {}).code || '';
  PL2.info = r.from === 'liste' ? 'Taslak yoktu; listede bu ayın nöbetleri bulundu ve çizelgeye alındı.' : r.from === 'bos' ? 'Yeni çizelge: nöbete dahil kişiler eklendi.' : (r.updated_at ? `Taslak · son kayıt ${fmtRel(r.updated_at)}${r.updated_by ? ' · ' + r.updated_by : ''}` : '');
  planDraw();
  clearInterval(PL2.timer);
  PL2.timer = setInterval(() => { if (!$('#plGrid')) { clearInterval(PL2.timer); return; } if (PL2.dirty) planSave(true); }, 20000);
}
function planReqFor(name) {
  const k = avKey(name);
  for (const [n, days] of Object.entries(PL2.req)) if (avKey(n) === k) return days;
  return {};
}
function planTabsHtml() {
  return html`<div class="seg pl2-tabs" role="tablist">${PL2_TABS.map(([k, l, ic]) => html`<button type="button" role="tab" class="${PL2.tab === k ? 'on' : ''}" data-act="pl2-tab" data-t="${k}" aria-selected="${PL2.tab === k ? 'true' : 'false'}">${icon(ic, 'sm')}<span>${l}</span></button>`)}</div>`;
}
function planNavHtml() {
  const [y, m] = PL2.ym.split('-').map(Number);
  return html`<select class="select" data-change="pl2-roster" style="width:auto">${planRosters().map((r) => html`<option value="${r.id}" ${r.id === PL2.rid ? raw('selected') : ''}>${r.name}</option>`)}</select>
    <div class="row" style="gap:4px"><button class="btn sm icon" data-act="pl2-month" data-k="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b class="pl2-ym">${TR_MONTHS[m - 1]} ${y}</b><button class="btn sm icon" data-act="pl2-month" data-k="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div>`;
}
ACT['pl2-tab'] = (el) => {
  if (PL2.dirty) planSave(true);
  PL2.tab = el.dataset.t;
  navStep(`#/cizelge/${PL2.rid}/${PL2.ym}${PL2_TAB_URL[PL2.tab] ? '/' + PL2_TAB_URL[PL2.tab] : ''}`);
  planDraw();
};
function planDraw() {
  const box = $('#plBody');
  if (!box || !PL2.d) return;
  if (PL2.tab !== 'grid') {
    setHTML(box, html`<div class="stack"><div class="card card-pad row wrap pl2-head" style="gap:8px">${planNavHtml()}<span class="grow"></span>${planTabsHtml()}</div><div id="plTabBody"></div></div>`);
    if (PL2.tab === 'chg') rsChgTab($('#plTabBody')); else rsDocTab($('#plTabBody'));
    return;
  }
  const days = planDays(PL2.ym);
  const [y, m] = PL2.ym.split('-').map(Number);
  const cells = PL2.d.cells;
  const issues = {};
  (PL2.chk ? PL2.chk.issues : []).forEach((x) => { issues[x.name + '|' + x.date] = x.msg; });
  const cov = {};
  days.forEach((d) => { cov[d] = { day: 0, night: 0 }; });
  const hours = {};
  PL2.d.people.forEach((p) => {
    let h = 0;
    Object.entries(cells[p.name] || {}).forEach(([d, code]) => {
      const c = planCode(code);
      if (!c || c.kind !== 'shift' || !cov[d]) return;
      h += +c.hours || 0;
      const cv = shiftCover(c);
      cov[d].day += cv.day; cov[d].night += cv.night;
    });
    hours[p.name] = Math.round(h);
  });
  const offH = rsHours(PL2.d, PL2.ym, RS2.tpl, PL2.hol, PL2.half);
  const need = (d) => { const dt = new Date(d).getDay(); const we = dt === 0 || dt === 6 || (PL2.hol[d] !== undefined); return PL2.d.needs[we ? 'weekend' : 'weekday']; };
  const shiftCodes = PL2.codes.filter((c) => c.kind === 'shift');
  setHTML(box, html`<div class="stack">
    <div class="card card-pad stack pl2-head">
      <div class="row wrap" style="gap:8px">${planNavHtml()}<span class="grow"></span>${planTabsHtml()}</div>
      <div class="row wrap" style="gap:8px">
        <span class="grow"></span>
        ${PL2.joint ? html`<a class="btn sm" href="#/cizelge/taraflar/${PL2.ym}">${icon('layers', 'sm')}<span>Basamakları birlikte planla</span></a>` : ''}
        <button class="btn sm" data-act="pl2-import">${icon('upload', 'sm')}<span>Yapıştır / CSV</span></button>
        <button class="btn sm" data-act="pl2-check">${icon('shield', 'sm')}<span>Denetle</span></button>
        <button class="btn sm" data-act="pl2-auto">${icon('star', 'sm')}<span>Otomatik doldur</span></button>
        <button class="btn sm" data-act="pl2-save">${icon('check', 'sm')}<span>Kaydet</span></button>
        <button class="btn sm primary" data-act="pl2-publish">${icon('send', 'sm')}<span>Yayınla</span></button>
      </div>
      ${PL2.info ? html`<div class="tiny faint">${PL2.info}</div>` : ''}
      ${PL2.synced ? html`<div class="mk-box warn" id="pl2Synced">${icon('history', 'sm')}<span>Yayından sonra kabul edilen değişim / devir / çağrılar çizelgeye işlendi (<b>${PL2.synced}</b> hücre). Saatler güncel; listeye de işlemek için <b>Yayınla</b>.</span></div>` : ''}
      <div class="row wrap pl2-needs" style="gap:10px">
        <span class="small muted">Gereken kişi</span>
        <label class="small">Hafta içi gündüz <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekday.day" value="${PL2.d.needs.weekday.day}"></label>
        <label class="small">gece <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekday.night" value="${PL2.d.needs.weekday.night}"></label>
        <label class="small">Hafta sonu/tatil gündüz <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekend.day" value="${PL2.d.needs.weekend.day}"></label>
        <label class="small">gece <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekend.night" value="${PL2.d.needs.weekend.night}"></label>
        <label class="small">Gündüz kodu <select class="select" data-change="pl2-code" data-k="day_code" style="width:auto">${shiftCodes.map((c) => html`<option ${c.code === PL2.d.day_code ? raw('selected') : ''}>${c.code}</option>`)}</select></label>
        <label class="small">Gece kodu <select class="select" data-change="pl2-code" data-k="night_code" style="width:auto">${shiftCodes.map((c) => html`<option ${c.code === PL2.d.night_code ? raw('selected') : ''}>${c.code}</option>`)}</select></label>
        <label class="small" title="Otomatik dağıtımda onaylı (ya da elle girilen) yıllık izin isteği olan boş günlere yazılır">İzin kodu <select class="select" data-change="pl2-code" data-k="leave_code" style="width:auto"><option value="">Yazma</option>${PL2.codes.filter((c) => c.kind !== 'shift').map((c) => html`<option value="${c.code}" ${c.code === PL2.d.leave_code ? raw('selected') : ''}>${c.code} · ${c.label}</option>`)}</select></label>
      </div>
      <div class="pl2-brush" role="toolbar" aria-label="Fırça"><span class="tiny faint">Fırça:</span>
        ${PL2.codes.map((c) => html`<button type="button" class="code-chip tone-${planTone(c.code)} ${PL2.brush === c.code ? 'on' : ''}" data-act="pl2-brush" data-c="${c.code}" title="${c.label}">${c.code}</button>`)}
        <button type="button" class="btn sm ghost ${PL2.brush === '' ? 'on' : ''}" data-act="pl2-brush" data-c="">${icon('x', 'sm')}Sil</button>
        ${PL2.brush !== null ? html`<button type="button" class="btn sm ghost" data-act="pl2-brush-off">Fırçayı bırak</button>` : ''}</div>
    </div>
    <div class="pl2-wrap"><table class="pl2-grid" id="plGrid"><thead><tr><th class="pl2-name">Kişi <button type="button" class="btn sm ghost icon" data-act="pl2-addp" aria-label="Kişi ekle">${icon('plus', 'sm')}</button></th>
      ${days.map((d) => { const w = new Date(d).getDay(); return html`<th class="${w === 0 || w === 6 ? 'we' : ''} ${PL2.hol[d] !== undefined ? 'hol' : ''}" title="${PL2.hol[d] || ''}">${+d.slice(8)}<small>${TR_DAYS_S[w].slice(0, 2)}</small></th>`; })}<th class="pl2-hh" title="Çalışılması gereken saat (iş günü × günlük saat − izin / rapor)">Ger.</th><th class="pl2-hh" title="Çalışılan saat">Çal.</th><th class="pl2-hh" title="Fazla mesai (çalışılan − gereken)">Fazla</th></tr></thead>
      <tbody>${PL2.d.people.map((p) => { const rq = Object.assign({}, planReqFor(p.name), PL2.d.reqs[p.name] || {}); const mk = PL2.marks[p.name] || {}; const oh = offH[p.name] || { req: 0, work: 0, over: 0 }; return html`<tr><th class="pl2-name"><button type="button" class="pl2-pn" data-act="pl2-pmenu" data-n="${p.name}">${p.name}${p.title ? html`<small>${p.title}</small>` : ''}</button></th>
        ${days.map((d) => { const code = (cells[p.name] || {})[d] || ''; const iss = issues[p.name + '|' + d]; const man = (PL2.d.reqs[p.name] || {})[d]; return html`<td class="${rq[d] ? 'rq' : ''} ${iss ? 'bad' : ''} ${mk[d] ? 'chg' : ''}" title="${[mk[d], iss, rq[d] ? (rq[d] === 'izin' ? (man ? 'Yıllık izin isteği (elle)' : 'Onaylı yıllık izin isteği') : (man ? 'Boşluk isteği (elle)' : 'Onaylı boşluk isteği')) : ''].filter(Boolean).join(' · ')}"><button type="button" class="pl2-c ${code ? 'tone-' + planTone(code) : ''}" data-act="pl2-cell" data-n="${p.name}" data-d="${d}">${code || (rq[d] ? (rq[d] === 'izin' ? 'İ' : 'B') : '')}</button></td>`; })}
        <td class="pl2-h ${oh.fixed ? 'fx' : ''}" title="${oh.fixed ? 'Elle düzeltildi' : ''}">${rsNum(oh.req)}</td><td class="pl2-h">${rsNum(oh.work)}</td><td class="pl2-h ${oh.over < 0 ? 'neg' : ''}">${oh.over ? rsNum(oh.over) : ''}</td></tr>`; })}</tbody>
      <tfoot><tr><th class="pl2-name">Gündüz / gece</th>${days.map((d) => { const n = need(d); const bad = cov[d].day < n.day - 0.01 || cov[d].night < n.night - 0.01; return html`<td class="pl2-cov ${bad ? 'bad' : ''}" title="Gereken: ${n.day} / ${n.night}">${fmtN(cov[d].day)}<br>${fmtN(cov[d].night)}</td>`; })}<td></td><td></td><td></td></tr></tfoot></table></div>
    <div id="plIssues">${planIssuesHtml()}</div>
    <p class="tiny faint">B: boşluk isteği · İ: yıllık izin isteği (onaylı ya da sizin elle girdiğiniz). Köşesinde nokta olan hücre yayından sonra değişti (ayrıntı: Değişiklikler). Kırmızı hücre kural uyarısı, kırmızı sayı eksik gün. Ger. / Çal. / Fazla: resmi listedeki saatler (kişi adına dokunup gereken saati elle düzeltebilirsiniz). Değişiklikler 20 saniyede bir kendiliğinden kaydedilir; ekip yayınlayana kadar görmez.</p>
  </div>`);
}
function planIssuesHtml() {
  const c = PL2.chk;
  if (!c) return '';
  if (!c.issues.length && !c.short.length) return html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span>Kurallara uygun; eksik gün yok.</span></div>`;
  return html`<div class="card"><div class="card-head"><h3>${icon('alert', 'sm')} ${c.issues.length} uyarı${c.short.length ? `, ${c.short.length} eksik gün` : ''}</h3></div><div class="list">
    ${c.issues.slice(0, 80).map((x) => html`<div class="list-row small"><span class="badge ${x.type === 'kural' ? 'danger' : 'warn'}">${mkShortDate(x.date)}</span><span>${x.msg}</span></div>`)}
    ${c.short.slice(0, 40).map((x) => html`<div class="list-row small"><span class="badge warn">${mkShortDate(x.date)}</span><span>Eksik: gündüz ${x.day}/${x.need_day}, gece ${x.night}/${x.need_night}</span></div>`)}</div></div>`;
}
function mkShortDate(d) { return `${+d.slice(8)} ${TR_MONTHS[+d.slice(5, 7) - 1].slice(0, 3)}`; }
function planDirty() { PL2.dirty = true; PL2.chk = null; }
function planSetCell(name, d, code) {
  const row = PL2.d.cells[name] || (PL2.d.cells[name] = {});
  if (code) row[d] = code; else delete row[d];
  planDirty();
}

const pl2Url = () => `#/cizelge/${PL2.rid}/${PL2.ym}${PL2_TAB_URL[PL2.tab] ? '/' + PL2_TAB_URL[PL2.tab] : ''}`;
ACT['pl2-month'] = (el) => { if (PL2.dirty) planSave(true); PL2.ym = planNextYm(PL2.ym, +el.dataset.k); navStep(pl2Url()); planLoad(); };
CHANGE['pl2-roster'] = (el) => { if (PL2.dirty) planSave(true); PL2.rid = +el.value; navStep(pl2Url()); planLoad(); };
CHANGE['pl2-need'] = (el) => { const [a, b] = el.dataset.k.split('.'); PL2.d.needs[a][b] = Math.max(0, +el.value || 0); planDirty(); };
CHANGE['pl2-code'] = (el) => { PL2.d[el.dataset.k] = el.value; planDirty(); };
ACT['pl2-brush'] = (el) => { PL2.brush = el.dataset.c; planDraw(); };
ACT['pl2-brush-off'] = () => { PL2.brush = null; planDraw(); };
ACT['pl2-cell'] = (el) => {
  const { n, d } = el.dataset;
  if (PL2.brush !== null) { planSetCell(n, d, PL2.brush); planDraw(); return; }
  const cur = (PL2.d.cells[n] || {})[d] || '';
  const rq = planReqFor(n)[d];
  const man = (PL2.d.reqs[n] || {})[d] || '';
  const mk = (PL2.marks[n] || {})[d];
  const grp = [['Çalışma saatleri', PL2.codes.filter((c) => c.kind === 'shift')], ['İzin ve rapor', PL2.codes.filter((c) => c.kind === 'leave')], ['Görev ve diğer', PL2.codes.filter((c) => c.kind !== 'shift' && c.kind !== 'leave')]].filter((g) => g[1].length);
  const m = openModal({ title: `${n} · ${dateLabel(d)}`, body: html`<div class="stack">
    ${mk ? html`<div class="mk-box">${icon('history', 'sm')}<span>${mk}</span></div>` : ''}
    ${rq ? html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Onaylı ${rq === 'izin' ? 'yıllık izin' : 'boşluk'} isteği var.</span></div>` : ''}
    ${grp.map(([t, list]) => html`<div><div class="tiny faint" style="margin-bottom:4px">${t}</div><div class="pl2-pick">${list.map((c) => html`<button type="button" class="code-chip tone-${planTone(c.code)} ${cur === c.code ? 'on' : ''}" data-c="${c.code}"><b>${c.code}</b> <span class="tiny">${c.label}${c.kind === 'shift' && c.start && c.end ? ` ${c.start}–${c.end}` : ''}</span></button>`)}</div></div>`)}
    <div><button type="button" class="btn sm ghost" data-c="">${icon('x', 'sm')} Boş bırak</button></div>
    <div class="pl2-reqbox"><div class="tiny faint" style="margin-bottom:4px">İstek (elle) — otomatik dağıtım bu güne nöbet yazmaz</div>
      <div class="row wrap" style="gap:6px"><button type="button" class="btn sm ${man === 'bosluk' ? 'on' : ''}" data-rq="bosluk">B · Boşluk isteği</button><button type="button" class="btn sm ${man === 'izin' ? 'on' : ''}" data-rq="izin">İ · Yıllık izin isteği</button>${man ? html`<button type="button" class="btn sm ghost" data-rq="">İsteği kaldır</button>` : ''}</div></div></div>` });
  m.el.addEventListener('click', (ev) => {
    const q = ev.target.closest('[data-rq]');
    if (q) {
      const row = PL2.d.reqs[n] || (PL2.d.reqs[n] = {});
      if (q.dataset.rq) row[d] = q.dataset.rq; else delete row[d];
      if (q.dataset.rq === 'izin' && !cur && PL2.d.leave_code) planSetCell(n, d, PL2.d.leave_code);
      planDirty(); m.close(); planDraw(); return;
    }
    const b = ev.target.closest('[data-c]'); if (!b) return; planSetCell(n, d, b.dataset.c); m.close(); planDraw();
  });
};
ACT['pl2-pmenu'] = (el) => {
  const n = el.dataset.n;
  const p0 = PL2.d.people.find((p) => p.name === n) || {};
  const fx = (PL2.d.hfix[n] || {}).req;
  const m = openModal({ title: n, size: 'narrow', body: html`<div class="list">
    <button type="button" class="list-row" data-o="title" style="width:100%;border:0;background:none;text-align:left">${icon('edit', 'sm')}<span>Unvan: <b>${p0.title || '—'}</b></span></button>
    <button type="button" class="list-row" data-o="up" style="width:100%;border:0;background:none;text-align:left">${icon('chevL', 'sm')}<span>Sırada yukarı taşı</span></button>
    <button type="button" class="list-row" data-o="down" style="width:100%;border:0;background:none;text-align:left">${icon('chevR', 'sm')}<span>Sırada aşağı taşı</span></button>
    <button type="button" class="list-row" data-o="hfix" style="width:100%;border:0;background:none;text-align:left">${icon('clock', 'sm')}<span>Çalışılması gereken saat: <b>${fx !== undefined ? fx + ' (elle)' : 'otomatik'}</b></span></button>
    <button type="button" class="list-row" data-o="clear" style="width:100%;border:0;background:none;text-align:left">${icon('x', 'sm')}<span>Satırı temizle</span></button>
    <button type="button" class="list-row tone-danger" data-o="remove" style="width:100%;border:0;background:none;text-align:left">${icon('trash', 'sm')}<span>Çizelgeden çıkar</span></button></div>` });
  m.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-o]'); if (!b) return;
    const o = b.dataset.o;
    const i = PL2.d.people.findIndex((p) => p.name === n);
    if (o === 'title') {
      m.close();
      promptDialog({ title: `${n} · unvan`, label: 'Unvan (resmi listede yazar)', value: p0.title || '', ok: 'Kaydet' }).then((v) => { if (v === null || v === undefined) return; PL2.d.people[i].title = String(v).trim().slice(0, 80); planDirty(); planDraw(); });
      return;
    }
    if (o === 'hfix') {
      m.close();
      promptDialog({ title: `${n} · çalışılması gereken saat`, label: 'Saat (boş bırakılırsa otomatik hesaplanır)', value: fx !== undefined ? String(fx) : '', ok: 'Kaydet' }).then((v) => {
        if (v === null || v === undefined) return;
        const t = String(v).trim().replace(',', '.');
        if (t === '') delete PL2.d.hfix[n]; else if (isFinite(+t) && +t >= 0) PL2.d.hfix[n] = { req: +t }; else { toast('Geçerli bir saat girin', 'err'); return; }
        planDirty(); planDraw();
      });
      return;
    }
    if (o === 'up' || o === 'down') {
      const j = o === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < PL2.d.people.length) { const t = PL2.d.people[i]; PL2.d.people[i] = PL2.d.people[j]; PL2.d.people[j] = t; }
    } else if (o === 'clear') delete PL2.d.cells[n];
    else { PL2.d.people = PL2.d.people.filter((p) => p.name !== n); delete PL2.d.cells[n]; delete PL2.d.reqs[n]; delete PL2.d.hfix[n]; }
    planDirty(); m.close(); planDraw();
  });
};
ACT['pl2-addp'] = () => {
  const have = new Set(PL2.d.people.map((p) => avKey(p.name)));
  const sug = (S.people || []).filter((p) => !have.has(avKey(p.name)));
  const m = openModal({ title: 'Kişi ekle', size: 'narrow', body: html`<form class="stack" id="pl2AddF"><div class="field"><label>Ad soyad</label><input class="input" name="name" list="pl2Ppl" required minlength="3" maxlength="120"><datalist id="pl2Ppl">${sug.map((p) => html`<option value="${p.name}">`)}</datalist></div>
    <p class="hint">Portalda hesabı olmayan kişi de eklenebilir (adı listede aynen görünür).</p><div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="pl2AddF">Ekle</button>` });
  $('#pl2AddF', m.el).addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = $('#pl2AddF [name=name]', m.el).value.trim();
    if (name.length < 3 || have.has(avKey(name))) { showFormError($('#pl2AddF', m.el), have.has(avKey(name)) ? 'Bu kişi zaten çizelgede.' : 'Ad soyad girin.'); return; }
    PL2.d.people.push({ name, title: '' }); planDirty(); m.close(); planDraw();
  });
};
async function planSave(quiet) {
  try { await api('plan.save', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d }); PL2.dirty = false; if (!quiet) toast('Taslak kaydedildi'); return true; } catch (e) { if (!quiet) toast(e.message, 'err'); return false; }
}
ACT['pl2-save'] = (el) => busy(el, () => planSave(false));
ACT['pl2-check'] = (el) => busy(el, async () => {
  try { PL2.chk = await api('plan.check', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d }); planDraw(); const x = $('#plIssues'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { toast(e.message, 'err'); }
});
ACT['pl2-auto'] = async (el) => {
  if (!(await confirmDialog({ title: 'Otomatik doldurulsun mu?', text: `Önce istekler yerleşir${PL2.d.leave_code ? ` (yıllık izin isteği olan boş günlere ${PL2.d.leave_code})` : ''}; boşluk isteği olan güne nöbet yazılmaz. Sonra gereken sayıya ulaşmayan günlere (${PL2.d.day_code} gündüz, ${PL2.d.night_code} gece) kurallara uyan kişiler adalet sırasıyla yazılır: ay içinde az saat çalışan → hafta sonu / tatilde az nöbeti olan → son 7 günde az nöbeti olan → kura. Dolu hücrelere dokunulmaz; sonra elle düzenleyebilirsiniz.`, ok: 'Doldur' }))) return;
  busy(el, async () => {
    try {
      const r = await api('plan.auto', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d });
      PL2.d.cells = r.cells && !Array.isArray(r.cells) ? r.cells : {};
      planDirty();
      PL2.chk = await api('plan.check', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d });
      planDraw();
      toast(`${r.placed ? r.placed + ' izin günü işlendi · ' : ''}${r.filled} nöbet yazıldı${r.unfilled.length ? ` · ${r.unfilled.length} vardiya kurallara uygun kimse olmadığı için boş kaldı` : ''}`);
    } catch (e) { toast(e.message, 'err'); }
  });
};

/* ---------------- Aktarım: başka sistemden yapıştır / CSV ---------------- */
ACT['pl2-import'] = () => {
  const m = openModal({ title: 'Yapıştır veya CSV yükle', size: 'wide', body: html`<div class="stack">
    <p class="small muted">Başka bir programdan (hastane bilgi sistemi dışa aktarımı, Excel, Google Tablolar…) kopyaladığınız çizelgeyi yapıştırın ya da CSV dosyası seçin. İki biçim tanınır:</p>
    <ul class="small muted" style="margin:0 0 0 18px"><li><b>Tablo:</b> ilk sütun ad soyad, sonraki sütunlar ayın günleri (başlık satırında 1, 2, 3… olmalı).</li><li><b>Satır satır:</b> Ad soyad; tarih (gg.aa.yyyy, yyyy-aa-gg ya da gün no); kod.</li></ul>
    <label class="btn">${icon('table', 'sm')}<span>CSV / metin dosyası seç</span><input type="file" hidden accept=".csv,.txt,.tsv" id="pl2File"></label>
    <textarea class="textarea" id="pl2Paste" style="min-height:180px" placeholder="Ad Soyad;1;2;3;…&#10;Ayşe Kaya;G;N;;24"></textarea>
    <label class="small"><input type="checkbox" id="pl2Replace"> Mevcut hücreleri tamamen değiştir (kapalıysa yalnız dolu gelenler yazılır)</label>
    <div id="pl2Prev" class="small muted">Önizleme burada görünür.</div></div>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="pl2ImpGo" disabled>Aktar</button>` });
  const prev = () => {
    const res = planParseImport($('#pl2Paste', m.el).value);
    m.res = res;
    setHTML($('#pl2Prev', m.el), res.count ? html`${res.people.length} kişi, ${res.count} hücre tanındı.${res.unknown.length ? html` <span class="badge warn">Bilinmeyen kod: ${res.unknown.slice(0, 8).join(', ')}</span>` : ''}` : 'Tanınan satır yok.');
    $('#pl2ImpGo', m.el).disabled = !res.count;
  };
  $('#pl2Paste', m.el).addEventListener('input', debounce(prev, 200));
  $('#pl2File', m.el).addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; $('#pl2Paste', m.el).value = await f.text(); prev(); });
  $('#pl2ImpGo', m.el).addEventListener('click', () => {
    const res = m.res; if (!res) return;
    const rep = $('#pl2Replace', m.el).checked;
    res.people.forEach((n) => {
      if (!PL2.d.people.some((p) => avKey(p.name) === avKey(n))) PL2.d.people.push({ name: n, title: '' });
      const real = PL2.d.people.find((p) => avKey(p.name) === avKey(n)).name;
      if (rep) PL2.d.cells[real] = {};
      Object.entries(res.cells[n] || {}).forEach(([d, c]) => planSetCell(real, d, c));
    });
    planDirty(); m.close(); planDraw(); toast(`${res.count} hücre aktarıldı`);
  });
};
/** Yapıştırılan metni çizelgeye çevirir (tablo ya da satır satır biçim) */
function planParseImport(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const sep = (l) => (l.includes('\t') ? l.split('\t') : l.includes(';') ? l.split(';') : l.split(','));
  const days = planDays(PL2.ym);
  const known = new Map(PL2.codes.map((c) => [avKey(c.code), c.code]));
  const norm = (c) => { const t = String(c || '').trim(); if (!t) return ''; return known.get(avKey(t)) || t; };
  const out = { people: [], cells: {}, count: 0, unknown: [] };
  const add = (name, d, code) => {
    name = name.trim(); code = norm(code);
    if (!name || name.length < 3 || !code || !days.includes(d)) return;
    if (!out.cells[name]) { out.cells[name] = {}; out.people.push(name); }
    out.cells[name][d] = code; out.count++;
    if (!known.has(avKey(code)) && !out.unknown.includes(code)) out.unknown.push(code);
  };
  const rows = lines.map(sep);
  // Tablo biçimi: başlık satırında gün numaraları
  const hi = rows.findIndex((r) => r.slice(1).filter((x) => /^\s*\d{1,2}\s*$/.test(x)).length >= 20);
  if (hi >= 0) {
    const map = rows[hi].map((x) => (/^\s*\d{1,2}\s*$/.test(x) ? days[+x - 1] : null));
    const nameCol = 0;
    rows.slice(hi + 1).forEach((r) => { const name = r[nameCol] || ''; if (/^\d+$/.test(name.trim())) return; r.forEach((c, i) => { if (map[i]) add(name, map[i], c); }); });
    return out;
  }
  // Satır satır: ad; tarih; kod
  rows.forEach((r) => {
    if (r.length < 3) return;
    const [name, dt, code] = r;
    let d = '';
    let mm;
    if ((mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dt.trim()))) d = `${mm[1]}-${mm[2]}-${mm[3]}`;
    else if ((mm = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(dt.trim()))) d = `${mm[3]}-${pad(+mm[2])}-${pad(+mm[1])}`;
    else if (/^\d{1,2}$/.test(dt.trim())) d = days[+dt.trim() - 1] || '';
    add(name, d, code);
  });
  return out;
}

/* ---------------- Yayınla: Excel görünümü + liste sürümü + nöbet kayıtları ---------------- */
ACT['pl2-publish'] = (el) => planPublishCtx({ rid: PL2.rid, ym: PL2.ym, roster: PL2.roster, d: PL2.d, save: () => planSave(true), after: () => planLoad() }, el);
/** Bir listenin çizelgesini yayınla: Excel görünümü listeye yeni sürüm olarak yüklenir, nöbetler kaydedilir */
async function planPublishCtx(ctx, el) {
  const ro = rosterById(ctx.rid);
  const [y, m] = ctx.ym.split('-').map(Number);
  const curP = ro && ro.period;
  const warn = curP && curP !== ctx.ym ? ` Liste şu an ${periodLabel(curP)} ayını gösteriyor; yayınlayınca ${TR_MONTHS[m - 1]} ${y} olur (eski ay sürümlerde kalır).` : '';
  if (!(await confirmDialog({ title: `${ctx.roster.name} · ${TR_MONTHS[m - 1]} ${y} yayınlansın mı?`, text: `Çizelge “${ctx.roster.name}” listesinin yeni sürümü olur; ekip Takvimim’de ve listede görür, nöbeti değişenlere bildirim gider.${warn}`, ok: 'Yayınla' }))) return;
  busy(el, async () => {
    try {
      await ctx.save();
      const chk = await api('plan.check', { roster_id: ctx.rid, ym: ctx.ym, draft: ctx.d });
      if (chk.issues.some((x) => x.type === 'kural') && !(await confirmDialog({ title: 'Kural uyarıları var', text: `${chk.issues.filter((x) => x.type === 'kural').length} kural uyarısı var (dinlenme / üst üste çalışma). Yine de yayınlansın mı?`, ok: 'Yine de yayınla', danger: true }))) return;
      // Daha önce yayınlanmış ayda: güncel hâl ile yeni taslak arasındaki farklar "düzeltme" olarak kaydedilir (Değişiklikler)
      try { await api('plan.mark', { roster_id: ctx.rid, ym: ctx.ym, draft: ctx.d }); } catch (e) { /* kayıt tutulamadıysa yayın yine yapılır */ }
      const file = await planXlsx(ctx);
      const att = await uploadFile(file);
      await api('rosters.upload', { id: ctx.rid, attachment_id: att.id });
      const entries = [];
      ctx.d.people.forEach((p) => Object.entries(ctx.d.cells[p.name] || {}).forEach(([d, code]) => {
        const c = planCode(code) || { kind: 'shift' };
        entries.push({ name: p.name, title: p.title || '', date: d, code, label: c.label || code, kind: c.kind || 'shift', hours: c.hours != null ? c.hours : undefined, start: c.start || undefined, end: c.end || undefined });
      }));
      const r = await api('rosters.shifts', { roster_id: ctx.rid, file_id: att.id, period: ctx.ym, entries });
      await api('plan.save', { roster_id: ctx.rid, ym: ctx.ym, draft: ctx.d, published: true });
      await refreshRosters(); MY.at = 0;
      toast(`${ctx.roster.name} yayınlandı · ${r.saved} nöbet kaydı`);
      if (ctx.after) ctx.after();
    } catch (e) { toast(e.message, 'err'); }
  });
}
/** Çizelgenin Excel görünümü (renkli kodlar, hafta sonu gölgeli) */
async function planXlsx(ctx) {
  ctx = ctx || { ym: PL2.ym, d: PL2.d, roster: PL2.roster };
  const D = ctx.d;
  await loadVendor('exceljs');
  const [y, m] = ctx.ym.split('-').map(Number);
  const days = planDays(ctx.ym);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${TR_MONTHS[m - 1].toLocaleUpperCase('tr')} ${y}`, { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  ws.addRow([`${ctx.roster.name} · ${TR_MONTHS[m - 1]} ${y} nöbet çizelgesi`]);
  ws.mergeCells(1, 1, 1, days.length + 3);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow(['Ad Soyad', 'Ünvan', ...days.map((d) => +d.slice(8)), 'Saat']);
  ws.addRow(['', '', ...days.map((d) => TR_DAYS_S[new Date(d).getDay()]), '']);
  const fill = { amber: 'FFFFF1C2', indigo: 'FFD9DCFF', violet: 'FFFFD6A5', emerald: 'FFC9F2D9', slate: 'FFE5E7EB' };
  D.people.forEach((p) => {
    let h = 0;
    const codes = days.map((d) => { const c = (D.cells[p.name] || {})[d] || ''; const cc = planCode(c); if (cc && cc.kind === 'shift') h += +cc.hours || 0; return c; });
    const row = ws.addRow([p.name, p.title || '', ...codes, Math.round(h)]);
    codes.forEach((c, i) => { if (c) row.getCell(i + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill[planTone(c)] } }; });
  });
  ws.getColumn(1).width = 26; ws.getColumn(2).width = 14;
  days.forEach((d, i) => {
    const col = ws.getColumn(i + 3); col.width = 5; col.alignment = { horizontal: 'center' };
    const w = new Date(d).getDay();
    if (w === 0 || w === 6 || PL2.hol[d] !== undefined) [2, 3].forEach((r) => { ws.getRow(r).getCell(i + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } }; });
  });
  [2, 3].forEach((r) => { ws.getRow(r).font = { bold: true }; });
  // Kod açıklamaları
  ws.addRow([]);
  PL2.codes.filter((c) => Object.values(D.cells).some((row) => Object.values(row).includes(c.code))).forEach((c) => ws.addRow(['', c.code, c.label + (c.start && c.end ? ` ${c.start}–${c.end}` : '')]));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], `${ctx.roster.name} ${TR_MONTHS[m - 1]} ${y}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* =================================================================================================
   Basamakları birlikte planla (4.30): #/cizelge/taraflar/<ay>
   İki (ya da daha çok) basamak listesi aynı ekranda, ayrı tablolarda hazırlanır; karışmaz, ayrı Excel olarak yayınlanır.
   Gün gün gereken sayılar blok planından (Taraf › sayılar) gelir; her düzenlemede sayılar anında yeniden hesaplanır.
   ================================================================================================= */
const PJ = { ym: '', sides: [], needs: {}, unitNeeds: {}, team: { members: [] }, excl: [], opts: {}, hol: {}, codes: [], chk: null, brush: null, dirty: {}, timer: null, last: null };

function pjSaveDirty() {
  Object.keys(PJ.dirty || {}).forEach((rid) => { const sd = PJ.sides.find((s) => String(s.roster.id) === String(rid)); if (sd) pjSaveSide(sd, true); });
}
async function pjSaveSide(sd, quiet) {
  try { await api('plan.save', { roster_id: sd.roster.id, ym: PJ.ym, draft: sd.draft }); delete PJ.dirty[sd.roster.id]; if (!quiet) toast(sd.name + ' kaydedildi'); return true; } catch (e) { if (!quiet) toast(e.message, 'err'); return false; }
}
function pjDirty(sd) { PJ.dirty[sd.roster.id] = true; PJ.chk = null; }
/** Dönemin vardiya takımı (eski tek kod ayarından da okunur) */
function pjCodeSet(k) {
  const o = PJ.opts;
  if (!Array.isArray(o[k]) || !o[k].length) o[k] = [o[k === 'day_codes' ? 'day_code' : 'night_code']].filter(Boolean);
  return o[k];
}

async function pjPage(view, ym) {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) PJ.ym = ym;
  if (!PJ.ym) PJ.ym = PL2.ym || planNextYm(ymd(new Date()).slice(0, 7), new Date().getDate() > 15 ? 1 : 0);
  setHTML(view, html`${hubHead('cizelge', 'Basamak listeleri aynı ekranda, ayrı ayrı hazırlanır; gereken sayılar blok planından gelir.')}
    <div id="pjBody"><div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div></div></div>`);
  await pjLoad();
}
async function pjLoad() {
  const box = $('#pjBody'); if (!box) return;
  let r;
  try { r = await api('plan.sides.get', { ym: PJ.ym }); } catch (e) { setHTML(box, html`<div class="card empty"><p class="small">${e.message}</p><a class="btn" href="#/cizelge">Tek liste çizelgesine dön</a></div>`); return; }
  Object.assign(PJ, { sides: r.sides, needs: r.needs || {}, unitNeeds: r.unit_needs || {}, team: r.team || { members: [] }, excl: r.excluded || [], opts: r.opts || {}, hol: r.holidays || {}, codes: r.codes || [], chk: null, dirty: {}, rules: r.rules || {} });
  PJ.sides.forEach((sd) => { sd.draft.cells = sd.draft.cells && !Array.isArray(sd.draft.cells) ? sd.draft.cells : {}; sd.draft.people = sd.draft.people || []; sd.flags = sd.flags || {}; sd.prev = sd.prev || {}; sd.cross = sd.cross || {}; sd.requests = sd.requests || {}; });
  // Ortak kod yardımcıları (planCode / planTone / planXlsx) bu ekranın kodlarını kullansın
  PL2.codes = PJ.codes; PL2.hol = PJ.hol;
  const sc = PJ.codes.filter((c) => c.kind === 'shift');
  const o = PJ.opts;
  if (!o.day_code) o.day_code = (sc.find((c) => c.start === '08:00' && c.end === '16:00') || sc[0] || {}).code || '';
  if (!o.night_code) o.night_code = (sc.find((c) => c.start === '16:00' && c.end === '08:00') || sc[1] || {}).code || '';
  if (!o.fri_code) o.fri_code = o.night_code;
  if (!o.sat_code) o.sat_code = (sc.find((c) => (c.hours || 0) >= 20 || (c.start && c.start === c.end)) || {}).code || o.night_code;
  pjDraw();
  clearInterval(PJ.timer);
  PJ.timer = setInterval(() => { if (!$('#pjBody')) { clearInterval(PJ.timer); return; } pjSaveDirty(); }, 20000);
}

function pjFlag(sd, name, f) {
  const x = sd.flags[name];
  if (x && f in x) return !!x[f];
  const k = avKey(name);
  return f === 'team' ? (PJ.team.members || []).some((m) => avKey(m) === k) : PJ.excl.some((m) => avKey(m) === k);
}
/** Vardiyanın o dönemi kapsama oranı (16-24 gecenin ½'si) */
function pjCovers(code, per) { return shiftCover(planCode(code))[per] || 0; }
/** Tarafın o gün o dönem kendi alan kişisi (sorumlular ve nöbet dışı hariç; kısmi vardiya kesirli) */
function pjOwn(sd, d, per) {
  let n = 0;
  sd.draft.people.forEach((p) => { if (pjFlag(sd, p.name, 'team') || pjFlag(sd, p.name, 'excl')) return; const c = (sd.draft.cells[p.name] || {})[d]; if (c) n += pjCovers(c, per); });
  return Math.round(n * 1000) / 1000;
}
function pjNeed(sd, d, per) { return ((PJ.needs[d] || {})[sd.key] || {})[per] || 0; }
/** Gün özeti: taraf taraf fark, toplam ve karşıya geçecek sayı */
function pjDaySum(d, per) {
  let def = 0, sur = 0, own = 0, need = 0;
  PJ.sides.forEach((sd) => { const o = pjOwn(sd, d, per); const n = pjNeed(sd, d, per); own += o; need += n; if (o < n) def += n - o; else sur += o - n; });
  return { own, need, cross: Math.floor(Math.min(def, sur) + 0.01), short: need - own > 0.01 ? need - own : 0 };
}
function pjReqFor(sd, name) { const k = avKey(name); for (const [n, days] of Object.entries(sd.requests || {})) if (avKey(n) === k) return days; return {}; }
function pjPrevFor(sd, name) { const k = avKey(name); for (const [n, days] of Object.entries(sd.prev || {})) if (avKey(n) === k) return days; return {}; }

function pjDraw() {
  const box = $('#pjBody');
  if (!box) return;
  const days = planDays(PJ.ym);
  const [y, m] = PJ.ym.split('-').map(Number);
  const o = PJ.opts;
  const sc = PJ.codes.filter((c) => c.kind === 'shift');
  const codeSel = (k) => html`<select class="select" data-change="pj-opt" data-k="${k}" style="width:auto">${sc.map((c) => html`<option ${c.code === o[k] ? raw('selected') : ''}>${c.code}</option>`)}</select>`;
  // Dönemin vardiya takımı: bir "kişi" yerine geçen kodlar (ör. gece = 16 24 + 24 8). Toplamın kapsaması 1 olmalı.
  const setPick = (k, per) => { const set = pjCodeSet(k); const tot = set.reduce((a, c) => a + pjCovers(c, per), 0);
    return html`<div class="pj-set" data-k="${k}"><span class="small">${per === 'day' ? 'Gündüz' : 'Gece'} vardiyası:</span>${set.map((c, i) => html`<span class="code-chip tone-${planTone(c)}">${c}<button type="button" class="pj-set-x" data-act="pj-set-rm" data-k="${k}" data-i="${i}" aria-label="Çıkar">×</button></span>`)}
      <select class="select sm" data-change="pj-set-add" data-k="${k}" aria-label="Vardiya ekle"><option value="">+ ekle</option>${sc.map((c) => html`<option value="${c.code}">${c.code} · ${c.label}${c.start ? ' ' + c.start + '–' + c.end : ''}</option>`)}</select>
      <span class="tiny ${Math.abs(tot - 1) > 0.01 ? 'pj-warn' : 'faint'}">${Math.abs(tot - 1) > 0.01 ? `kapsama ${fmtN(tot)} (1 olmalı)` : 'tam'}</span></div>`; };
  const issues = {};
  (PJ.chk ? PJ.chk.sides : []).forEach((s) => s.issues.forEach((x) => { issues[s.roster_id + '|' + x.name + '|' + x.date] = x.msg; }));
  const prevDays = [3, 2, 1].map((k) => { const dt = new Date(+PJ.ym.slice(0, 4), +PJ.ym.slice(5, 7) - 1, 1 - k); return ymd(dt); });
  const head = (sd) => html`<thead><tr><th class="pl2-name">Kişi <button type="button" class="btn sm ghost icon" data-act="pj-addp" data-s="${sd.key}" aria-label="Kişi ekle">${icon('plus', 'sm')}</button></th>
    ${prevDays.map((d) => html`<th class="pj-prev" title="Önceki ay">${+d.slice(8)}<small>önc.</small></th>`)}
    ${days.map((d) => { const w = new Date(d).getDay(); return html`<th class="${w === 0 || w === 6 ? 'we' : ''} ${PJ.hol[d] !== undefined ? 'hol' : ''}" title="${PJ.hol[d] || ''}"><button type="button" class="pj-dh" data-act="pj-day" data-d="${d}">${+d.slice(8)}<small>${TR_DAYS_S[w].slice(0, 2)}</small></button></th>`; })}<th>Saat</th><th title="Karşı tarafa toplam geçiş (Taraf)">Geç.</th></tr></thead>`;
  const body = (sd) => html`<tbody>${sd.draft.people.map((p) => {
    const rq = pjReqFor(sd, p.name); const pv = pjPrevFor(sd, p.name);
    const team = pjFlag(sd, p.name, 'team'); const ex = pjFlag(sd, p.name, 'excl');
    let h = 0;
    Object.values(sd.draft.cells[p.name] || {}).forEach((c) => { const cc = planCode(c); if (cc && cc.kind === 'shift') h += +cc.hours || 0; });
    return html`<tr class="${team ? 'pj-team' : ''} ${ex ? 'pj-excl' : ''}"><th class="pl2-name"><button type="button" class="pl2-pn" data-act="pj-pmenu" data-s="${sd.key}" data-n="${p.name}">${p.name}${team ? html` <span class="badge tone-violet sm">Sorumlu</span>` : ''}${ex ? html` <span class="badge sm">Nöbet dışı</span>` : ''}${p.title ? html`<small>${p.title}</small>` : ''}</button></th>
      ${prevDays.map((d) => html`<td class="pj-prev"><span class="pl2-c ${pv[d] ? 'tone-' + planTone(pv[d]) : ''}">${pv[d] || ''}</span></td>`)}
      ${days.map((d) => { const code = (sd.draft.cells[p.name] || {})[d] || ''; const iss = issues[sd.roster.id + '|' + p.name + '|' + d]; return html`<td class="${rq[d] ? 'rq' : ''} ${iss ? 'bad' : ''}" title="${[iss, rq[d] ? (rq[d] === 'izin' ? 'Onaylı yıllık izin isteği' : 'Onaylı boşluk isteği') : ''].filter(Boolean).join(' · ')}"><button type="button" class="pl2-c ${code ? 'tone-' + planTone(code) : ''}" data-act="pj-cell" data-s="${sd.key}" data-n="${p.name}" data-d="${d}">${code || (rq[d] ? (rq[d] === 'izin' ? 'İ' : 'B') : '')}</button></td>`; })}
      <td class="pl2-h">${Math.round(h)}</td><td class="pl2-h">${sd.cross[p.name] || 0}</td></tr>`;
  })}</tbody>`;
  const foot = (sd) => html`<tfoot>${['night', 'day'].map((per) => html`<tr><th class="pl2-name">${per === 'night' ? 'Gece' : 'Gündüz'} <small>alan / gereken</small></th>${prevDays.map(() => html`<td class="pj-prev"></td>`)}
    ${days.map((d) => { const own = pjOwn(sd, d, per); const need = pjNeed(sd, d, per); const cls = own < need - 0.01 ? 'bad' : own > need + 0.01 ? 'over' : ''; return html`<td class="pl2-cov ${cls}" title="${sd.name} ${per === 'night' ? 'gece' : 'gündüz'}: ${fmtN(own)} / ${need}${cls === 'over' ? ' · fazla ' + fmtN(own - need) + ' (karşıya geçer)' : cls === 'bad' ? ' · eksik ' + fmtN(need - own) : ''}">${fmtN(own)}/${need}</td>`; })}<td></td><td></td></tr>`)}</tfoot>`;
  const sumRow = (per) => html`<tr><th class="pl2-name">${per === 'night' ? 'Gece' : 'Gündüz'} toplam</th>${days.map((d) => { const s = pjDaySum(d, per); return html`<td class="pl2-cov ${s.short ? 'bad' : ''}" title="Alan toplamı ${fmtN(s.own)} / ${s.need}${s.cross ? ' · ' + s.cross + ' kişi karşıya geçecek' : ''}">${fmtN(s.own)}/${s.need}${s.cross ? html`<br><b class="pj-x">↔${s.cross}</b>` : ''}</td>`; })}</tr>`;
  setHTML(box, html`<div class="stack">
    <div class="card card-pad stack pl2-head">
      <div class="row wrap" style="gap:8px">
        <a class="btn sm" href="#/cizelge">${icon('chevL', 'sm')}<span>Tek liste</span></a>
        <div class="row" style="gap:4px"><button class="btn sm icon" data-act="pj-month" data-k="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b class="pl2-ym">${TR_MONTHS[m - 1]} ${y}</b><button class="btn sm icon" data-act="pj-month" data-k="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div>
        <span class="grow"></span>
        <button class="btn sm" data-act="pj-needs">${icon('layers', 'sm')}<span>Blok sayıları</span></button>
        <button class="btn sm" data-act="pj-check">${icon('shield', 'sm')}<span>Denetle</span></button>
        <button class="btn sm primary" data-act="pj-auto">${icon('star', 'sm')}<span>Otomatik dağıt</span></button>
        <button class="btn sm" data-act="pj-save">${icon('check', 'sm')}<span>Kaydet</span></button>
      </div>
      <div class="row wrap pl2-needs" style="gap:10px">
        ${setPick('day_codes', 'day')}
        ${setPick('night_codes', 'night')}
        <label class="small" title="Saati fazla olanın nöbeti saati az olana geçer; 24 saatlik nöbet 8-16 ve 16-8 olarak bölünebilir"><input type="checkbox" data-change="pj-optb" data-k="balance" ${o.balance !== false ? raw('checked') : ''}> Saatleri eşitle (8-16 / 16-8 parçalarla)</label>
        <label class="small"><input type="checkbox" data-change="pj-optb" data-k="team_day" ${o.team_day ? raw('checked') : ''}> Sorumlular hafta içi gündüz</label>
        <label class="small"><input type="checkbox" data-change="pj-optb" data-k="fri_on" ${o.fri_on ? raw('checked') : ''}> Cuma sorumlu</label>
        ${o.fri_on ? html`<label class="small"><input class="input" type="number" min="1" max="5" data-input="pj-optn" data-k="fri_n" value="${o.fri_n || 1}"> kişi ${codeSel('fri_code')}</label>` : ''}
        <label class="small"><input type="checkbox" data-change="pj-optb" data-k="sat_on" ${o.sat_on ? raw('checked') : ''}> Cumartesi sorumlu</label>
        ${o.sat_on ? html`<label class="small"><input class="input" type="number" min="1" max="5" data-input="pj-optn" data-k="sat_n" value="${o.sat_n || 1}"> kişi ${codeSel('sat_code')}</label>` : ''}
      </div>
      <div class="pl2-brush" role="toolbar" aria-label="Fırça"><span class="tiny faint">Fırça:</span>
        ${PJ.codes.map((c) => html`<button type="button" class="code-chip tone-${planTone(c.code)} ${PJ.brush === c.code ? 'on' : ''}" data-act="pj-brush" data-c="${c.code}" title="${c.label}">${c.code}</button>`)}
        <button type="button" class="btn sm ghost ${PJ.brush === '' ? 'on' : ''}" data-act="pj-brush" data-c="">${icon('x', 'sm')}Sil</button>
        ${PJ.brush !== null ? html`<button type="button" class="btn sm ghost" data-act="pj-brush-off">Fırçayı bırak</button>` : ''}</div>
      ${PJ.last ? html`<div class="mk-box ok small">${icon('checkCircle', 'sm')}<span>${PJ.last}</span></div>` : ''}
    </div>
    ${PJ.sides.map((sd) => html`<div class="card pj-side" data-side="${sd.key}">
      <div class="card-head"><h3>${sd.name} <span class="tiny faint">· ${sd.units.join(', ')} · liste: ${sd.roster.name}</span></h3><span class="grow"></span>
        ${PJ.dirty[sd.roster.id] ? html`<span class="badge warn sm">kaydedilmedi</span>` : ''}
        <button class="btn sm" data-act="pj-xlsx" data-s="${sd.key}">${icon('download', 'sm')}<span>Excel</span></button>
        <button class="btn sm primary" data-act="pj-publish" data-s="${sd.key}">${icon('send', 'sm')}<span>Yayınla</span></button></div>
      <div class="pl2-wrap"><table class="pl2-grid pj-grid">${head(sd)}${body(sd)}${foot(sd)}</table></div></div>`)}
    <div class="card"><div class="card-head"><h3>${icon('layers', 'sm')} Gün gün toplam</h3><span class="tiny faint">alan / gereken · ↔ karşıya geçecek kişi (bloğu Taraf kurasında belli olur)</span></div>
      <div class="pl2-wrap" style="max-height:none"><table class="pl2-grid"><thead><tr><th class="pl2-name">Gün</th>${days.map((d) => html`<th>${+d.slice(8)}<small>${TR_DAYS_S[new Date(d).getDay()].slice(0, 2)}</small></th>`)}</tr></thead><tbody>${sumRow('night')}${sumRow('day')}</tbody></table></div></div>
    <div id="pjIssues">${pjIssuesHtml()}</div>
    <p class="tiny faint">Her basamak kendi tablosunda ve kendi listesinde kalır; birbirine karışmaz. Sorumlular ve nöbet dışı kişiler alan sayısına girmez. Nöbet dışı kişiye otomatik nöbet yazılmaz, yalnız elle. Kurallar önceki ayın son günleriyle birlikte denetlenir. Değişiklikler 20 saniyede bir kendiliğinden kaydedilir.</p>
  </div>`);
}
function pjIssuesHtml() {
  const c = PJ.chk;
  if (!c) return '';
  const all = [];
  c.sides.forEach((s) => { const sd = PJ.sides.find((x) => x.key === s.key); s.issues.forEach((x) => all.push({ ...x, side: sd ? sd.name : '' })); });
  const days = planDays(PJ.ym);
  const short = [];
  days.forEach((d) => ['night', 'day'].forEach((per) => { const s = pjDaySum(d, per); if (s.short) short.push({ d, per, s }); }));
  if (!all.length && !short.length) return html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span>Kurallara uygun; eksik gün yok.</span></div>`;
  return html`<div class="card"><div class="card-head"><h3>${icon('alert', 'sm')} ${all.length} uyarı${short.length ? `, ${short.length} eksik vardiya` : ''}</h3></div><div class="list">
    ${all.slice(0, 100).map((x) => html`<div class="list-row small"><span class="badge ${x.type === 'kural' ? 'danger' : 'warn'}">${mkShortDate(x.date)}</span><span class="badge sm">${x.side}</span><span>${x.msg}</span></div>`)}
    ${short.slice(0, 60).map((x) => html`<div class="list-row small"><span class="badge warn">${mkShortDate(x.d)}</span><span>${x.per === 'night' ? 'Gece' : 'Gündüz'} eksik: ${fmtN(x.s.own)}/${x.s.need}</span></div>`)}</div></div>`;
}
const pjSide = (k) => PJ.sides.find((s) => s.key === k);
function pjSet(sd, name, d, code) {
  const row = sd.draft.cells[name] || (sd.draft.cells[name] = {});
  if (code) row[d] = code; else delete row[d];
  pjDirty(sd);
}

ACT['pj-month'] = (el) => { pjSaveDirty(); PJ.ym = planNextYm(PJ.ym, +el.dataset.k); navStep(`#/cizelge/taraflar/${PJ.ym}`); PJ.last = null; pjLoad(); };
CHANGE['pj-opt'] = (el) => { PJ.opts[el.dataset.k] = el.value; };
CHANGE['pj-set-add'] = (el) => { if (!el.value) return; pjCodeSet(el.dataset.k).push(el.value); pjSyncCodes(); pjDraw(); };
ACT['pj-set-rm'] = (el) => { const s = pjCodeSet(el.dataset.k); s.splice(+el.dataset.i, 1); pjSyncCodes(); pjDraw(); };
function pjSyncCodes() { const o = PJ.opts; o.day_code = (o.day_codes || [])[0] || ''; o.night_code = (o.night_codes || [])[0] || ''; }
CHANGE['pj-optb'] = (el) => { PJ.opts[el.dataset.k] = el.checked; pjDraw(); };
CHANGE['pj-optn'] = (el) => { PJ.opts[el.dataset.k] = Math.max(1, Math.min(5, +el.value || 1)); };
ACT['pj-brush'] = (el) => { PJ.brush = el.dataset.c; pjDraw(); };
ACT['pj-brush-off'] = () => { PJ.brush = null; pjDraw(); };
ACT['pj-cell'] = (el) => {
  const sd = pjSide(el.dataset.s); if (!sd) return;
  const { n, d } = el.dataset;
  if (PJ.brush !== null) { pjSet(sd, n, d, PJ.brush); pjDraw(); return; }
  const cur = (sd.draft.cells[n] || {})[d] || '';
  const rq = pjReqFor(sd, n)[d];
  const m = openModal({ title: `${n} · ${dateLabel(d)}`, size: 'narrow', body: html`<div class="stack">
    <div class="tiny faint">${sd.name}</div>
    ${rq ? html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Onaylı ${rq === 'izin' ? 'yıllık izin' : 'boşluk'} isteği var.</span></div>` : ''}
    <div class="pl2-pick">${PJ.codes.map((c) => html`<button type="button" class="code-chip tone-${planTone(c.code)} ${cur === c.code ? 'on' : ''}" data-c="${c.code}"><b>${c.code}</b> <span class="tiny">${c.label}</span></button>`)}</div>
    <button type="button" class="btn sm ghost" data-c="">${icon('x', 'sm')} Boş bırak</button></div>` });
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (!b) return; pjSet(sd, n, d, b.dataset.c); m.close(); pjDraw(); });
};
ACT['pj-pmenu'] = (el) => {
  const sd = pjSide(el.dataset.s); if (!sd) return;
  const n = el.dataset.n;
  const others = PJ.sides.filter((s) => s.key !== sd.key);
  const m = openModal({ title: n, size: 'narrow', body: html`<div class="list">
    ${others.map((o) => html`<button type="button" class="list-row" data-o="move" data-to="${o.key}" style="width:100%;border:0;background:none;text-align:left">${icon('users', 'sm')}<span>${o.name} listesine taşı</span></button>`)}
    <button type="button" class="list-row" data-o="clear" style="width:100%;border:0;background:none;text-align:left">${icon('x', 'sm')}<span>Satırı temizle</span></button>
    <button type="button" class="list-row tone-danger" data-o="remove" style="width:100%;border:0;background:none;text-align:left">${icon('trash', 'sm')}<span>Bu listeden çıkar</span></button></div>` });
  m.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-o]'); if (!b) return;
    const p = sd.draft.people.find((x) => x.name === n);
    if (b.dataset.o === 'clear') delete sd.draft.cells[n];
    else {
      const cells = sd.draft.cells[n];
      sd.draft.people = sd.draft.people.filter((x) => x.name !== n); delete sd.draft.cells[n];
      if (b.dataset.o === 'move') {
        const to = pjSide(b.dataset.to);
        if (to && !to.draft.people.some((x) => avKey(x.name) === avKey(n))) { to.draft.people.push(p || { name: n, title: '' }); if (cells) to.draft.cells[n] = cells; to.flags[n] = sd.flags[n]; pjDirty(to); }
      }
    }
    pjDirty(sd); m.close(); pjDraw();
  });
};
ACT['pj-addp'] = (el) => {
  const sd = pjSide(el.dataset.s); if (!sd) return;
  const have = new Set(PJ.sides.flatMap((s) => s.draft.people.map((p) => avKey(p.name))));
  const sug = (S.people || []).filter((p) => !have.has(avKey(p.name)));
  const m = openModal({ title: `${sd.name} · kişi ekle`, size: 'narrow', body: html`<form class="stack" id="pjAddF"><div class="field"><label>Ad soyad</label><input class="input" name="name" list="pjPpl" required minlength="3" maxlength="120"><datalist id="pjPpl">${sug.map((p) => html`<option value="${p.name}">`)}</datalist></div>
    <p class="hint">Bir kişi yalnız bir basamak listesinde olabilir. Portalda hesabı olmayan kişi de eklenebilir.</p><div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="pjAddF">Ekle</button>` });
  $('#pjAddF', m.el).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = $('#pjAddF [name=name]', m.el).value.trim();
    if (name.length < 3 || have.has(avKey(name))) { showFormError($('#pjAddF', m.el), have.has(avKey(name)) ? 'Bu kişi zaten bir basamak listesinde.' : 'Ad soyad girin.'); return; }
    sd.draft.people.push({ name, title: '' });
    try { const r = await api('plan.sides.flags', { names: [name] }); Object.assign(sd.flags, r.flags || {}); } catch (e) { /* */ }
    pjDirty(sd); m.close(); pjDraw();
  });
};
ACT['pj-save'] = (el) => busy(el, async () => { for (const sd of PJ.sides) await pjSaveSide(sd, true); toast('Basamak çizelgeleri kaydedildi'); pjDraw(); });
const pjDrafts = () => Object.fromEntries(PJ.sides.map((sd) => [sd.roster.id, sd.draft]));
ACT['pj-check'] = (el) => busy(el, async () => {
  try { PJ.chk = await api('plan.sides.check', { ym: PJ.ym, drafts: pjDrafts() }); pjDraw(); const x = $('#pjIssues'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { toast(e.message, 'err'); }
});
ACT['pj-auto'] = async (el) => {
  const o = PJ.opts;
  if (!(await confirmDialog({ title: 'Otomatik dağıtılsın mı?', text: `Onaylı istekler ve elle yazılan hücreler korunur. ${o.team_day ? 'Sorumlulara hafta içi gündüz yazılır; ' : ''}boş vardiyalar blok planındaki sayılara göre önce kendi basamağından, adil sırayla (az saat → hafta sonu → son 7 gün → kura) doldurulur${o.balance !== false ? ', sonra saatler eşitlenir (gerekirse 24 saat 8-16 / 16-8 olarak bölünür)' : ''}; bir taraf dolmazsa eksik diğer basamaktan tamamlanır (karşıya geçecek kişi).${o.fri_on ? ' Sonra Cuma günleri sorumlular sırayla atanır' + (o.sat_on ? ', Cumartesi de' : '') + '.' : ''} Nöbet dışı kişilere yazılmaz.`, ok: 'Dağıt' }))) return;
  busy(el, async () => {
    try {
      const r = await api('plan.sides.auto', { ym: PJ.ym, drafts: pjDrafts(), opts: PJ.opts });
      PJ.sides.forEach((sd) => { const c = (r.cells || {})[sd.roster.id]; sd.draft.cells = c && !Array.isArray(c) ? c : {}; pjDirty(sd); });
      PJ.opts = r.opts || PJ.opts;
      const team = (r.team.fri || []).length + (r.team.sat || []).length;
      PJ.last = `${r.filled} nöbet yazıldı${r.balanced ? ` · saat eşitleme: ${r.balanced} değişiklik` : ''}${r.cross.length ? ` · ${r.cross.length} vardiyada eksik taraf diğer basamaktan tamamlandı (karşıya geçecek)` : ''}${team ? ` · ${team} sorumlu nöbeti` : ''}${r.unfilled.length ? ` · ${r.unfilled.length} vardiya kurallara uygun kimse olmadığı için eksik kaldı` : ''}`;
      PJ.chk = await api('plan.sides.check', { ym: PJ.ym, drafts: pjDrafts() });
      pjDraw();
      toast('Dağıtıldı');
    } catch (e) { toast(e.message, 'err'); }
  });
};
ACT['pj-xlsx'] = (el) => busy(el, async () => {
  const sd = pjSide(el.dataset.s); if (!sd) return;
  try { const f = await planXlsx({ ym: PJ.ym, d: sd.draft, roster: sd.roster }); downloadBlob(f, f.name); } catch (e) { toast(e.message, 'err'); }
});
ACT['pj-publish'] = (el) => {
  const sd = pjSide(el.dataset.s); if (!sd) return;
  planPublishCtx({ rid: sd.roster.id, ym: PJ.ym, roster: sd.roster, d: sd.draft, save: () => pjSaveSide(sd, true), after: () => pjDraw() }, el);
};
/** Gün başlığı: o günün blok sayıları (Taraf ile ortak; yalnız o güne) */
ACT['pj-day'] = (el) => {
  const d = el.dataset.d;
  const un = PJ.unitNeeds[d] || {};
  const units = PJ.sides.flatMap((sd) => sd.units.map((u) => ({ u, side: sd.name })));
  const m = openModal({ title: `${dateLabel(d)} · blok sayıları`, size: 'narrow', body: html`<div class="stack">
    <p class="small muted">Bu güne özel gereken kişi (sorumlular hariç). Taraf sayfasındaki gün gün sayılarla aynıdır.</p>
    <table class="tbl small"><thead><tr><th>Blok</th><th>Gündüz</th><th>Gece</th></tr></thead><tbody>${units.map((x) => html`<tr><td>${x.u} <span class="tiny faint">${x.side}</span></td>
      <td><input class="input" type="number" min="0" max="30" data-u="${x.u}" data-p="day" value="${(un[x.u] || {}).day || 0}" style="width:70px"></td>
      <td><input class="input" type="number" min="0" max="30" data-u="${x.u}" data-p="night" value="${(un[x.u] || {}).night || 0}" style="width:70px"></td></tr>`)}</tbody></table></div>`,
  foot: html`<button class="btn ghost" id="pjDayDef">Varsayılana dön</button><span class="grow"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="pjDayOk">Kaydet</button>` });
  const apply = (needs) => {
    PJ.unitNeeds[d] = needs;
    PJ.needs[d] = {};
    PJ.sides.forEach((sd) => { PJ.needs[d][sd.key] = { day: 0, night: 0 }; sd.units.forEach((u) => { PJ.needs[d][sd.key].day += +((needs[u] || {}).day || 0); PJ.needs[d][sd.key].night += +((needs[u] || {}).night || 0); }); });
    m.close(); pjDraw();
  };
  $('#pjDayOk', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const counts = { ...un };
    $$('input[data-u]', m.el).forEach((i) => { counts[i.dataset.u] = counts[i.dataset.u] || { day: 0, night: 0 }; counts[i.dataset.u] = { ...counts[i.dataset.u], [i.dataset.p]: Math.max(0, +i.value || 0) }; });
    try { const r = await api('placement.counts', { date: d, counts }); apply(r.needs || counts); toast('Bu günün sayıları kaydedildi'); } catch (err) { toast(err.message, 'err'); }
  }));
  $('#pjDayDef', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { const r = await api('placement.counts', { date: d, counts: null }); apply(r.needs || {}); toast('Varsayılan sayılar kullanılıyor'); } catch (err) { toast(err.message, 'err'); }
  }));
};
/** Varsayılan blok sayıları (hafta içi / hafta sonu-tatil, gündüz / gece) */
ACT['pj-needs'] = async () => {
  let g;
  try { g = await api('rules.get'); } catch (e) { toast(e.message, 'err'); return; }
  const needs = g.needs || {};
  const units = PJ.sides.flatMap((sd) => sd.units.map((u) => ({ u, side: sd.name })));
  const v = (u, dt, p) => ((needs[u] || {})[dt] || {})[p] || 0;
  const m = openModal({ title: 'Blok sayıları (varsayılan)', size: 'wide', body: html`<div class="stack">
    <p class="small muted">Her blok için normalde gereken kişi (sorumlular hariç). Tarafın sayısı bloklarının toplamıdır. Tek bir güne özel sayı için tablodaki gün başlığına dokunun.</p>
    <div class="pl2-wrap" style="max-height:none"><table class="tbl small"><thead><tr><th>Blok</th><th>Hafta içi gündüz</th><th>Hafta içi gece</th><th>H. sonu / tatil gündüz</th><th>H. sonu / tatil gece</th></tr></thead><tbody>${units.map((x) => html`<tr><td>${x.u} <span class="tiny faint">${x.side}</span></td>
      ${[['weekday', 'day'], ['weekday', 'night'], ['weekend', 'day'], ['weekend', 'night']].map(([dt, p]) => html`<td><input class="input" type="number" min="0" max="30" data-u="${x.u}" data-dt="${dt}" data-p="${p}" value="${v(x.u, dt, p)}" style="width:70px"></td>`)}</tr>`)}</tbody></table></div></div>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="pjNeedsOk">Kaydet</button>` });
  $('#pjNeedsOk', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const all = JSON.parse(JSON.stringify(needs));
    $$('input[data-u]', m.el).forEach((i) => { const u = i.dataset.u; all[u] = all[u] || {}; all[u][i.dataset.dt] = all[u][i.dataset.dt] || {}; all[u][i.dataset.dt][i.dataset.p] = Math.max(0, +i.value || 0); });
    try {
      await api('rules.needs.save', { needs: all });
      const r = await api('plan.sides.get', { ym: PJ.ym });
      PJ.needs = r.needs || {}; PJ.unitNeeds = r.unit_needs || {};
      m.close(); pjDraw(); toast('Blok sayıları kaydedildi');
    } catch (err) { toast(err.message, 'err'); }
  }));
};
