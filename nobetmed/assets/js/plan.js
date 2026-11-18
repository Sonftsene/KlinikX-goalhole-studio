/* dupcii — nöbet çizelgesi hazırlama (4.5): Excel kullanmayan birimler çizelgeyi portalda hazırlar.
   Taslak sunucuda; kural denetimi ve otomatik doldurma sunucuda (aynı kural motoru); yayınlanınca Excel görünümüyle
   listeye yeni sürüm yüklenir ve nöbetler kaydedilir (Takvimim, Kim nöbette, blok yerleşimi, ilan, çağrı aynen çalışır). */
'use strict';

NM_EXT.routes.cizelge = (view, r) => planPage(view, r);
NM_EXT.hubTabs.push({ key: 'cizelge', mod: 'cizelge', pub: true, href: '#/cizelge', icon: 'edit', label: 'Çizelge' });
Object.assign(NM_EXT.audit, { 'plan.publish': 'Nöbet çizelgesini yayınladı' });

const PL2 = { rid: 0, ym: '', d: null, codes: [], req: {}, hol: {}, brush: null, dirty: false, chk: null, timer: null, roster: null };

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
function planNextYm(ym, k) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

async function planPage(view, r) {
  if (!canManage('cizelge')) { location.hash = '#/'; return; }
  const list = planRosters();
  if (r[1] && /^\d+$/.test(r[1])) PL2.rid = +r[1];
  if (!list.some((x) => x.id === PL2.rid)) PL2.rid = list.length ? list[0].id : 0;
  if (r[2] && /^\d{4}-\d{2}$/.test(r[2])) PL2.ym = r[2];
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
  PL2.d = r.draft; PL2.codes = r.codes; PL2.req = r.requests || {}; PL2.hol = r.holidays || {}; PL2.roster = r.roster; PL2.dirty = false; PL2.chk = null;
  PL2.d.cells = PL2.d.cells && !Array.isArray(PL2.d.cells) ? PL2.d.cells : {};
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
function planDraw() {
  const box = $('#plBody');
  if (!box || !PL2.d) return;
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
      const full = (c.hours || 0) >= 20 || (c.start && c.start === c.end);
      const night = c.start && c.end && c.end <= c.start;
      if (full || !night) cov[d].day++;
      if (full || night) cov[d].night++;
    });
    hours[p.name] = Math.round(h);
  });
  const need = (d) => { const dt = new Date(d).getDay(); const we = dt === 0 || dt === 6 || (PL2.hol[d] !== undefined); return PL2.d.needs[we ? 'weekend' : 'weekday']; };
  const shiftCodes = PL2.codes.filter((c) => c.kind === 'shift');
  setHTML(box, html`<div class="stack">
    <div class="card card-pad stack pl2-head">
      <div class="row wrap" style="gap:8px">
        <select class="select" data-change="pl2-roster" style="width:auto">${planRosters().map((r) => html`<option value="${r.id}" ${r.id === PL2.rid ? raw('selected') : ''}>${r.name}</option>`)}</select>
        <div class="row" style="gap:4px"><button class="btn sm icon" data-act="pl2-month" data-k="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b class="pl2-ym">${TR_MONTHS[m - 1]} ${y}</b><button class="btn sm icon" data-act="pl2-month" data-k="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div>
        <span class="grow"></span>
        <button class="btn sm" data-act="pl2-import">${icon('upload', 'sm')}<span>Yapıştır / CSV</span></button>
        <button class="btn sm" data-act="pl2-check">${icon('shield', 'sm')}<span>Denetle</span></button>
        <button class="btn sm" data-act="pl2-auto">${icon('star', 'sm')}<span>Otomatik doldur</span></button>
        <button class="btn sm" data-act="pl2-save">${icon('check', 'sm')}<span>Kaydet</span></button>
        <button class="btn sm primary" data-act="pl2-publish">${icon('send', 'sm')}<span>Yayınla</span></button>
      </div>
      ${PL2.info ? html`<div class="tiny faint">${PL2.info}</div>` : ''}
      <div class="row wrap pl2-needs" style="gap:10px">
        <span class="small muted">Gereken kişi</span>
        <label class="small">Hafta içi gündüz <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekday.day" value="${PL2.d.needs.weekday.day}"></label>
        <label class="small">gece <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekday.night" value="${PL2.d.needs.weekday.night}"></label>
        <label class="small">Hafta sonu/tatil gündüz <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekend.day" value="${PL2.d.needs.weekend.day}"></label>
        <label class="small">gece <input class="input" type="number" min="0" max="50" data-input="pl2-need" data-k="weekend.night" value="${PL2.d.needs.weekend.night}"></label>
        <label class="small">Gündüz kodu <select class="select" data-change="pl2-code" data-k="day_code" style="width:auto">${shiftCodes.map((c) => html`<option ${c.code === PL2.d.day_code ? raw('selected') : ''}>${c.code}</option>`)}</select></label>
        <label class="small">Gece kodu <select class="select" data-change="pl2-code" data-k="night_code" style="width:auto">${shiftCodes.map((c) => html`<option ${c.code === PL2.d.night_code ? raw('selected') : ''}>${c.code}</option>`)}</select></label>
      </div>
      <div class="pl2-brush" role="toolbar" aria-label="Fırça"><span class="tiny faint">Fırça:</span>
        ${PL2.codes.map((c) => html`<button type="button" class="code-chip tone-${planTone(c.code)} ${PL2.brush === c.code ? 'on' : ''}" data-act="pl2-brush" data-c="${c.code}" title="${c.label}">${c.code}</button>`)}
        <button type="button" class="btn sm ghost ${PL2.brush === '' ? 'on' : ''}" data-act="pl2-brush" data-c="">${icon('x', 'sm')}Sil</button>
        ${PL2.brush !== null ? html`<button type="button" class="btn sm ghost" data-act="pl2-brush-off">Fırçayı bırak</button>` : ''}</div>
    </div>
    <div class="pl2-wrap"><table class="pl2-grid" id="plGrid"><thead><tr><th class="pl2-name">Kişi <button type="button" class="btn sm ghost icon" data-act="pl2-addp" aria-label="Kişi ekle">${icon('plus', 'sm')}</button></th>
      ${days.map((d) => { const w = new Date(d).getDay(); return html`<th class="${w === 0 || w === 6 ? 'we' : ''} ${PL2.hol[d] !== undefined ? 'hol' : ''}" title="${PL2.hol[d] || ''}">${+d.slice(8)}<small>${TR_DAYS_S[w].slice(0, 2)}</small></th>`; })}<th>Saat</th></tr></thead>
      <tbody>${PL2.d.people.map((p) => { const rq = planReqFor(p.name); return html`<tr><th class="pl2-name"><button type="button" class="pl2-pn" data-act="pl2-pmenu" data-n="${p.name}">${p.name}${p.title ? html`<small>${p.title}</small>` : ''}</button></th>
        ${days.map((d) => { const code = (cells[p.name] || {})[d] || ''; const iss = issues[p.name + '|' + d]; return html`<td class="${rq[d] ? 'rq' : ''} ${iss ? 'bad' : ''}" title="${[iss, rq[d] ? (rq[d] === 'izin' ? 'Onaylı yıllık izin isteği' : 'Onaylı boşluk isteği') : ''].filter(Boolean).join(' · ')}"><button type="button" class="pl2-c ${code ? 'tone-' + planTone(code) : ''}" data-act="pl2-cell" data-n="${p.name}" data-d="${d}">${code || (rq[d] ? (rq[d] === 'izin' ? 'İ' : 'B') : '')}</button></td>`; })}
        <td class="pl2-h">${hours[p.name]}</td></tr>`; })}</tbody>
      <tfoot><tr><th class="pl2-name">Gündüz / gece</th>${days.map((d) => { const n = need(d); const bad = cov[d].day < n.day || cov[d].night < n.night; return html`<td class="pl2-cov ${bad ? 'bad' : ''}" title="Gereken: ${n.day} / ${n.night}">${cov[d].day}<br>${cov[d].night}</td>`; })}<td></td></tr></tfoot></table></div>
    <div id="plIssues">${planIssuesHtml()}</div>
    <p class="tiny faint">B: onaylı boşluk isteği · İ: onaylı yıllık izin isteği. Kırmızı hücre kural uyarısı, kırmızı sayı eksik gün. Değişiklikler 20 saniyede bir kendiliğinden kaydedilir; ekip yayınlayana kadar görmez.</p>
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

ACT['pl2-month'] = (el) => { if (PL2.dirty) planSave(true); PL2.ym = planNextYm(PL2.ym, +el.dataset.k); history.replaceState(null, '', `#/cizelge/${PL2.rid}/${PL2.ym}`); planLoad(); };
CHANGE['pl2-roster'] = (el) => { if (PL2.dirty) planSave(true); PL2.rid = +el.value; history.replaceState(null, '', `#/cizelge/${PL2.rid}/${PL2.ym}`); planLoad(); };
CHANGE['pl2-need'] = (el) => { const [a, b] = el.dataset.k.split('.'); PL2.d.needs[a][b] = Math.max(0, +el.value || 0); planDirty(); };
CHANGE['pl2-code'] = (el) => { PL2.d[el.dataset.k] = el.value; planDirty(); };
ACT['pl2-brush'] = (el) => { PL2.brush = el.dataset.c; planDraw(); };
ACT['pl2-brush-off'] = () => { PL2.brush = null; planDraw(); };
ACT['pl2-cell'] = (el) => {
  const { n, d } = el.dataset;
  if (PL2.brush !== null) { planSetCell(n, d, PL2.brush); planDraw(); return; }
  const cur = (PL2.d.cells[n] || {})[d] || '';
  const rq = planReqFor(n)[d];
  const m = openModal({ title: `${n} · ${dateLabel(d)}`, size: 'narrow', body: html`<div class="stack">
    ${rq ? html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Onaylı ${rq === 'izin' ? 'yıllık izin' : 'boşluk'} isteği var.</span></div>` : ''}
    <div class="pl2-pick">${PL2.codes.map((c) => html`<button type="button" class="code-chip tone-${planTone(c.code)} ${cur === c.code ? 'on' : ''}" data-c="${c.code}"><b>${c.code}</b> <span class="tiny">${c.label}</span></button>`)}</div>
    <button type="button" class="btn sm ghost" data-c="">${icon('x', 'sm')} Boş bırak</button></div>` });
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-c]'); if (!b) return; planSetCell(n, d, b.dataset.c); m.close(); planDraw(); });
};
ACT['pl2-pmenu'] = (el) => {
  const n = el.dataset.n;
  const m = openModal({ title: n, size: 'narrow', body: html`<div class="list">
    <button type="button" class="list-row" data-o="clear" style="width:100%;border:0;background:none;text-align:left">${icon('x', 'sm')}<span>Satırı temizle</span></button>
    <button type="button" class="list-row tone-danger" data-o="remove" style="width:100%;border:0;background:none;text-align:left">${icon('trash', 'sm')}<span>Çizelgeden çıkar</span></button></div>` });
  m.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-o]'); if (!b) return;
    if (b.dataset.o === 'clear') delete PL2.d.cells[n];
    else { PL2.d.people = PL2.d.people.filter((p) => p.name !== n); delete PL2.d.cells[n]; }
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
  if (!(await confirmDialog({ title: 'Otomatik doldurulsun mu?', text: `Gereken sayıya ulaşmayan günlere (${PL2.d.day_code} gündüz, ${PL2.d.night_code} gece) kurallara ve onaylı isteklere uyan kişiler adalet sırasıyla yazılır: ay içinde az saat çalışan → son 7 günde az nöbeti olan → kura. Dolu hücrelere dokunulmaz.`, ok: 'Doldur' }))) return;
  busy(el, async () => {
    try {
      const r = await api('plan.auto', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d });
      PL2.d.cells = r.cells && !Array.isArray(r.cells) ? r.cells : {};
      planDirty();
      PL2.chk = await api('plan.check', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d });
      planDraw();
      toast(`${r.filled} nöbet yazıldı${r.unfilled.length ? ` · ${r.unfilled.length} vardiya kurallara uygun kimse olmadığı için boş kaldı` : ''}`);
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
ACT['pl2-publish'] = async (el) => {
  const ro = rosterById(PL2.rid);
  const [y, m] = PL2.ym.split('-').map(Number);
  const curP = ro && ro.period;
  const warn = curP && curP !== PL2.ym ? ` Liste şu an ${periodLabel(curP)} ayını gösteriyor; yayınlayınca ${TR_MONTHS[m - 1]} ${y} olur (eski ay sürümlerde kalır).` : '';
  if (!(await confirmDialog({ title: `${TR_MONTHS[m - 1]} ${y} çizelgesi yayınlansın mı?`, text: `Çizelge “${PL2.roster.name}” listesinin yeni sürümü olur; ekip Takvimim’de ve listede görür, nöbeti değişenlere bildirim gider.${warn}`, ok: 'Yayınla' }))) return;
  busy(el, async () => {
    try {
      await planSave(true);
      PL2.chk = await api('plan.check', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d });
      if (PL2.chk.issues.some((x) => x.type === 'kural') && !(await confirmDialog({ title: 'Kural uyarıları var', text: `${PL2.chk.issues.filter((x) => x.type === 'kural').length} kural uyarısı var (dinlenme / üst üste çalışma). Yine de yayınlansın mı?`, ok: 'Yine de yayınla', danger: true }))) { planDraw(); return; }
      const file = await planXlsx();
      const att = await uploadFile(file);
      await api('rosters.upload', { id: PL2.rid, attachment_id: att.id });
      const entries = [];
      PL2.d.people.forEach((p) => Object.entries(PL2.d.cells[p.name] || {}).forEach(([d, code]) => {
        const c = planCode(code) || { kind: 'shift' };
        entries.push({ name: p.name, title: p.title || '', date: d, code, label: c.label || code, kind: c.kind || 'shift', hours: c.hours != null ? c.hours : undefined, start: c.start || undefined, end: c.end || undefined });
      }));
      const r = await api('rosters.shifts', { roster_id: PL2.rid, file_id: att.id, period: PL2.ym, entries });
      await api('plan.save', { roster_id: PL2.rid, ym: PL2.ym, draft: PL2.d, published: true });
      await refreshRosters(); MY.at = 0;
      toast(`Yayınlandı · ${r.saved} nöbet kaydı`);
      planDraw();
    } catch (e) { toast(e.message, 'err'); }
  });
};
/** Çizelgenin Excel görünümü (renkli kodlar, hafta sonu gölgeli) */
async function planXlsx() {
  await loadVendor('exceljs');
  const [y, m] = PL2.ym.split('-').map(Number);
  const days = planDays(PL2.ym);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${TR_MONTHS[m - 1].toLocaleUpperCase('tr')} ${y}`, { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  ws.addRow([`${PL2.roster.name} · ${TR_MONTHS[m - 1]} ${y} nöbet çizelgesi`]);
  ws.mergeCells(1, 1, 1, days.length + 3);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow(['Ad Soyad', 'Ünvan', ...days.map((d) => +d.slice(8)), 'Saat']);
  ws.addRow(['', '', ...days.map((d) => TR_DAYS_S[new Date(d).getDay()]), '']);
  const fill = { amber: 'FFFFF1C2', indigo: 'FFD9DCFF', violet: 'FFFFD6A5', emerald: 'FFC9F2D9', slate: 'FFE5E7EB' };
  PL2.d.people.forEach((p) => {
    let h = 0;
    const codes = days.map((d) => { const c = (PL2.d.cells[p.name] || {})[d] || ''; const cc = planCode(c); if (cc && cc.kind === 'shift') h += +cc.hours || 0; return c; });
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
  PL2.codes.filter((c) => Object.values(PL2.d.cells).some((row) => Object.values(row).includes(c.code))).forEach((c) => ws.addRow(['', c.code, c.label + (c.start && c.end ? ` ${c.start}–${c.end}` : '')]));
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], `${PL2.roster.name} ${TR_MONTHS[m - 1]} ${y}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
