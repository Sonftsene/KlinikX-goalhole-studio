/* dupcii — nöbet ilanı (devret / değiş), eksik personel çağrısı ve değişim geçmişi */
'use strict';

/* =================================================================== */
/* Kayıtlar                                                             */
/* =================================================================== */
NM_EXT.hubTabs.push({ key: 'ilan', href: '#/ilanlar', icon: 'megaphone', label: 'İlanlar' });
NM_EXT.routes.ilanlar = (view, r) => mkPage(view, r[1]);
NM_EXT.routes.eksik = (view, r) => (r[1] && /^\d+$/.test(r[1]) ? coDetailPage(view, +r[1]) : coListPage(view));
NM_EXT.routes.gecmis = (view) => { if (isPublisher()) histPage(view); else location.hash = '#/'; };
NM_EXT.nav.push({ sec: 'yonetim', href: '#/eksik', icon: 'alert', label: 'Eksik personel', match: (r) => r[0] === 'eksik', count: () => (S.market && S.market.yes) || 0 });
NM_EXT.nav.push({ sec: 'yonetim', href: '#/gecmis', icon: 'history', label: 'Değişim geçmişi', match: (r) => r[0] === 'gecmis' });
NM_EXT.dayActions.push((e, date) => (e.kind === 'shift' && date >= ymd(new Date())
  ? html`<button class="btn sm" data-act="mk-post" data-d="${date}">${icon('megaphone', 'sm')}<span>İlana koy</span></button>` : ''));
NM_EXT.notif.listing = ['violet', 'megaphone'];
NM_EXT.notif.callout = ['rose', 'alert'];
Object.assign(NM_EXT.audit, {
  'listing.create': 'Nöbet ilanı açtı', 'listing.apply': 'İlana başvurdu', 'listing.withdraw': 'İlan başvurusunu geri çekti',
  'listing.choose': 'İlanda başvuru seçti', 'listing.cancel': 'İlanı geri çekti', 'listing.delete': 'İlanı sildi',
  'callout.create': 'Eksik personel çağrısı açtı', 'callout.ask': 'Çağrıyı başka kişilere de sordu', 'callout.answer': 'Çağrıya yanıt verdi',
  'callout.choose': 'Çağrıda kişi seçti', 'callout.cancel': 'Çağrıyı iptal etti', 'callout.draw': 'Çağrıda kura çekti',
});
NM_EXT.homeCards.push({ id: 'market', title: 'İlan ve eksik çağrıları', icon: 'megaphone', order: 15, place: 'top', render: (el) => mkHomeCard(el) });

/* =================================================================== */
/* Ortak yardımcılar                                                    */
/* =================================================================== */
function mkShort(d) { const x = parseDT(d); return x ? `${x.getDate()} ${TR_MONTHS_S[x.getMonth()]}` : d || ''; }
function mkDayBlock(d) {
  const x = parseDT(d);
  if (!x) return '';
  return html`<div class="mk-date"><b>${x.getDate()}</b><span>${TR_MONTHS_S[x.getMonth()]}</span><em>${TR_DAYS_S[x.getDay()]}</em></div>`;
}
function mkEntry(o) { return { code: o.code, kind: 'shift', hours: o.hours, start: o.start, end: o.end, label: o.label }; }
function mkSpin() { return html`<div class="mk-spin"><div class="spinner"></div></div>`; }
function mkErr(msg) { return html`<div class="card empty"><div class="e-ico">${icon('alert', 'lg')}</div><h3>Yüklenemedi</h3><p class="small">${msg}</p></div>`; }
function mkDT(s) { const d = parseDT(s); return d ? `${d.getDate()} ${TR_MONTHS_S[d.getMonth()]} ${hm(d)}` : ''; }

/* =================================================================== */
/* Nöbet ilanı                                                          */
/* =================================================================== */
const MKT = { tab: 'board', data: null };
const MK_ST = {
  open: ['Açık', 'brand'], taken: ['Alındı', 'success'], cancelled: ['Geri çekildi', ''], expired: ['Süresi doldu', ''], closed: ['Kapandı', ''],
};
const MK_SW = { accepted: ['Excel’e işlenmesi bekleniyor', 'info'], applied: ['Listeye işlendi', 'success'], cancelled: ['Değişim iptal edildi', 'danger'], expired: ['Değişimin süresi geçti', ''] };

async function mkPage(view, sub) {
  const openId = sub && /^\d+$/.test(sub) ? +sub : null;
  if (sub === 'mine' || sub === 'applied' || sub === 'board') MKT.tab = sub;
  setHTML(view, html`${hubHead('ilan', 'Nöbetini ilana koy ya da arkadaşının ilanına başvur', html`<button class="btn primary" data-act="mk-new">${icon('plus', 'sm')}<span>İlana koy</span></button>`)}
    <div id="mkBody">${mkSpin()}</div>`);
  await mkLoad();
  if (openId) mkOpenListing(openId);
}
async function mkLoad() {
  try { MKT.data = await api('listing.list'); } catch (e) { setHTML($('#mkBody'), mkErr(e.message)); return; }
  mkDraw();
}
function mkDraw() {
  const box = $('#mkBody');
  const D = MKT.data;
  if (!box || !D) return;
  const nOpen = D.board.filter((x) => x.status === 'open').length;
  const nWait = D.mine.reduce((a, x) => a + (x.status === 'open' ? x.apps_n || 0 : 0), 0);
  const tab = (k, label, n, warn) => html`<button class="${MKT.tab === k ? 'on' : ''}" data-act="mk-tab" data-t="${k}" role="tab">${label}${n ? html`<span class="count ${warn ? 'warn' : 'muted'}">${n}</span>` : ''}</button>`;
  let body;
  if (MKT.tab === 'mine') body = mkMineHtml(D);
  else if (MKT.tab === 'applied') body = mkAppliedHtml(D);
  else body = mkBoardHtml(D);
  setHTML(box, html`<div class="toolbar"><div class="seg" role="tablist">${tab('board', 'Pano', nOpen)}${tab('mine', 'İlanlarım', nWait, true)}${tab('applied', 'Başvurularım', D.applied.filter((x) => x.my_app && x.my_app.status === 'applied' && x.status === 'open').length)}</div></div>
    ${body}
    <p class="tiny faint mk-foot">${icon('lock', 'sm')} Başvuranları ve ilanı kimin aldığını yalnız ilan sahibi ve sorumlular görür. Kurallar: dinlenme en az ${D.rules.rest} saat · üst üste en fazla ${D.rules.max_cont} saat · nöbetler arası en fazla ${D.rules.max_gap} boş gün.</p>`);
}
ACT['mk-tab'] = (el) => { MKT.tab = el.dataset.t; mkDraw(); };

function mkHead(L) {
  const e = mkEntry(L);
  return html`<div class="mk-l1">${codeChip(e)}<b>${shiftDesc(e) || L.code}</b><span class="badge ${L.kind === 'give' ? 'tone-violet' : 'tone-sky'}">${L.kind === 'give' ? 'Devrediyor' : 'Değişmek istiyor'}</span></div>`;
}
function mkBoardItem(L) {
  const closed = L.status !== 'open';
  const app = L.my_app;
  let act;
  if (closed) act = html`<span class="badge">${(MK_ST[L.status] || MK_ST.closed)[0]}</span>`;
  else if (app && app.status === 'applied') act = html`<span class="badge info">${icon('check', 'sm')}Başvurdun</span><button class="btn sm ghost" data-act="mk-withdraw" data-id="${L.id}">Geri çek</button>`;
  else if (app && app.status === 'chosen') act = html`<span class="badge success">Seçildin</span>`;
  else if (L.elig && L.elig.ok) act = html`<button class="btn sm primary" data-act="mk-apply" data-id="${L.id}">${icon(L.kind === 'swap' ? 'history' : 'check', 'sm')}<span>${L.kind === 'swap' ? 'Değiş öner' : 'Başvur'}</span></button>`;
  else act = html`<button class="btn sm" disabled title="${(L.elig && L.elig.reason) || ''}">Başvuramazsın</button>`;
  return html`<div class="mk-item ${closed ? 'closed' : ''}" data-lid="${L.id}">
    ${mkDayBlock(L.date)}
    <div class="mk-main">
      ${mkHead(L)}
      <div class="mk-l2">${avatar(L.poster, 'sm')}<span class="ellipsis"><b>${L.poster}</b>${L.manage && L.roster ? ' · ' + L.roster : ''} · ${fmtRel(L.created_at)}</span></div>
      ${L.note ? html`<div class="mk-note">“${L.note}”</div>` : ''}
      ${!closed && !app && L.elig && !L.elig.ok ? html`<div class="mk-why">${icon('info', 'sm')}<span>${L.elig.reason}</span></div>` : ''}
      ${!closed && L.kind === 'swap' && L.elig && L.elig.ok && !app ? html`<div class="tiny faint">${L.elig.offers.length} nöbetinle değişebilirsin</div>` : ''}
    </div>
    <div class="mk-act">${act}${L.manage && !closed ? html`<button class="btn sm ghost" data-act="mk-open" data-id="${L.id}">${icon('users', 'sm')}<span>Başvuranlar${L.apps_n ? ` (${L.apps_n})` : ''}</span></button>` : ''}</div>
  </div>`;
}
function mkBoardHtml(D) {
  if (!D.board.length) {
    return html`<div class="card empty"><div class="e-ico">${icon('megaphone', 'lg')}</div><h3>Şu an açık ilan yok</h3>
      <p class="small">${D.in_roster ? 'Liste arkadaşların nöbetini ilana koyunca burada görünür ve uygunsan haber veririz.' : 'Nöbet listesinde adın bulunamadı; yalnız kendi listendeki ilanları görebilirsin.'}</p>
      ${D.in_roster ? html`<button class="btn" data-act="mk-new" style="margin-top:12px">${icon('plus', 'sm')}Kendi nöbetini ilana koy</button>` : ''}</div>`;
  }
  const open = D.board.filter((x) => x.status === 'open');
  const can = open.filter((x) => x.elig && x.elig.ok && !x.my_app);
  return html`${open.length ? html`<div class="mk-sum small muted">${open.length} açık ilan${can.length ? html` · <b class="mk-ok">${can.length} ilana başvurabilirsin</b>` : ''}</div>` : ''}
    <div class="card mk-list">${D.board.map(mkBoardItem)}</div>`;
}
function mkMineItem(L) {
  const [t, tone] = MK_ST[L.status] || [L.status, ''];
  const sw = L.swap_status && MK_SW[L.swap_status];
  return html`<div class="mk-item ${L.status === 'open' ? '' : 'closed'}" data-lid="${L.id}">
    ${mkDayBlock(L.date)}
    <div class="mk-main">${mkHead(L)}
      <div class="mk-l2"><span class="badge ${tone}">${t}</span>${L.status === 'taken' && L.taker ? html`<span class="small"><b>${L.taker}</b>${L.taker_date ? html` · karşılığında ${mkShort(L.taker_date)} (${L.taker_code})` : ''}</span>` : ''}
        ${L.status === 'open' ? html`<span class="small muted">${L.apps_n ? `${L.apps_n} başvuru` : 'Henüz başvuru yok'}</span>` : ''}</div>
      ${sw ? html`<div><span class="badge ${sw[1]}">${sw[0]}</span></div>` : ''}
      ${L.reason ? html`<div class="tiny faint">${L.reason}</div>` : ''}
      ${L.note ? html`<div class="mk-note">“${L.note}”</div>` : ''}
    </div>
    <div class="mk-act">${L.status === 'open' ? html`<button class="btn sm ${L.apps_n ? 'primary' : ''}" data-act="mk-open" data-id="${L.id}">${icon('users', 'sm')}<span>${L.apps_n ? 'Başvuranlar' : 'Ayrıntı'}</span></button><button class="btn sm ghost danger" data-act="mk-cancel" data-id="${L.id}">Geri çek</button>`
      : html`<button class="btn sm ghost" data-act="mk-open" data-id="${L.id}">Ayrıntı</button>`}<button class="btn sm ghost icon" data-act="mk-del" data-id="${L.id}" data-open="${L.status === 'open' ? 1 : 0}" aria-label="İlanı sil" title="İlanı sil">${icon('trash', 'sm')}</button></div>
  </div>`;
}
function mkMineHtml(D) {
  if (!D.mine.length) return html`<div class="card empty"><div class="e-ico">${icon('megaphone', 'lg')}</div><h3>Henüz ilanın yok</h3><p class="small">Takvimim’de bir nöbet gününe dokunup “İlana koy” diyebilir ya da yukarıdaki düğmeyi kullanabilirsin.</p></div>`;
  return html`<div class="card mk-list">${D.mine.map(mkMineItem)}</div>`;
}
function mkAppState(L) {
  const a = L.my_app || {};
  if (a.status === 'chosen') return ['Seçildin · Excel’e işlenecek', 'success'];
  if (a.status === 'rejected') return ['Seçilmedin', ''];
  if (a.status === 'withdrawn') return ['Geri çektin', ''];
  if (L.status !== 'open') return ['İlan kapandı', ''];
  return ['Yanıt bekleniyor', 'warn'];
}
function mkAppliedHtml(D) {
  if (!D.applied.length) return html`<div class="card empty"><div class="e-ico">${icon('inbox', 'lg')}</div><h3>Başvurun yok</h3><p class="small">Panodaki bir ilana başvurduğunda durumunu buradan izlersin.</p></div>`;
  return html`<div class="card mk-list">${D.applied.map((L) => {
    const [t, tone] = mkAppState(L);
    const a = L.my_app || {};
    return html`<div class="mk-item ${L.status === 'open' ? '' : 'closed'}">${mkDayBlock(L.date)}
      <div class="mk-main">${mkHead(L)}<div class="mk-l2">${avatar(L.poster, 'sm')}<span class="ellipsis"><b>${L.poster}</b> · ${fmtRel(a.created_at)} başvurdun</span></div>
        ${a.offer_date ? html`<div class="small">Karşılığında: <b>${mkShort(a.offer_date)}</b> ${codeChip({ code: a.offer_code, kind: 'shift' })}</div>` : ''}
        <div><span class="badge ${tone}">${t}</span></div></div>
      <div class="mk-act">${a.status === 'applied' && L.status === 'open' ? html`<button class="btn sm ghost" data-act="mk-withdraw" data-id="${L.id}">Geri çek</button>` : ''}</div></div>`;
  })}</div>`;
}

/* ---- İlana koy ---- */
ACT['mk-post'] = (el) => mkPostModal(el.dataset.d);
ACT['mk-new'] = async () => {
  const m = openModal({ title: 'Hangi nöbetini ilana koyacaksın?', body: mkSpin() });
  const my = await loadMyShifts(true);
  const today = ymd(new Date());
  const list = (my.entries || []).filter((e) => e.kind === 'shift' && e.date >= today).slice(0, 40);
  const listed = new Set(((MKT.data && MKT.data.mine) || []).filter((x) => x.status === 'open').map((x) => x.date));
  m.setBody(list.length ? html`<div class="card"><div class="list">${list.map((e) => html`<button type="button" class="list-row mk-pick" data-d="${e.date}" ${listed.has(e.date) ? raw('disabled') : ''}>
      ${codeChip(e, true)}<div class="grow" style="text-align:left"><div class="lr-t">${dateLabel(e.date)}</div><div class="lr-s">${shiftDesc(e)}${e.roster ? ' · ' + e.roster : ''}</div></div>${listed.has(e.date) ? html`<span class="badge brand">İlanda</span>` : icon('chevR', 'sm')}</button>`)}</div></div>`
    : html`<div class="empty" style="padding:24px"><div class="e-ico">${icon('calendar', 'lg')}</div><h3>İleri tarihli nöbetin yok</h3><p class="small">Listede adına yazılı gelecek bir nöbet olduğunda ilana koyabilirsin.</p></div>`);
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('.mk-pick'); if (b && !b.disabled) { m.close(); mkPostModal(b.dataset.d); } });
};
async function mkPostModal(date) {
  const m = openModal({ title: 'Nöbetini ilana koy', body: mkSpin() });
  let o;
  try { o = await api('listing.check', { date }); } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  const e = mkEntry(o.mine);
  const head = html`<div class="sw-mine">${codeChip(e, true)}<div><b>${dateLabel(date)}</b><div class="tiny faint">${shiftDesc(e)} · ${o.mine.roster}</div></div></div>`;
  if (o.open) {
    m.setBody(html`<div class="stack">${head}<div class="mk-box info">${icon('info', 'sm')}<span>Bu nöbet zaten ilanda (${o.open.kind === 'give' ? 'Devret' : 'Değiş'}).</span></div></div>`);
    m.setFoot(html`<button class="btn" data-act="close-modal">Kapat</button><a class="btn primary" href="#/ilanlar/${o.open.id}">İlanı aç</a>`);
    return;
  }
  const st = { kind: o.give_error ? 'swap' : 'give' };
  const draw = () => {
    const note = ($('#mkNote', m.el) || {}).value || '';
    m.setBody(html`<div class="stack">${head}
      <div class="seg seg-block" role="tablist"><button type="button" class="${st.kind === 'give' ? 'on' : ''}" data-k="give">Devret</button><button type="button" class="${st.kind === 'swap' ? 'on' : ''}" data-k="swap">Değiş</button></div>
      ${st.kind === 'give' ? html`<p class="small muted">Nöbetin başkasına geçer. Kurallara uyan liste arkadaşların başvurur, sen aralarından seçersin.</p>
        ${o.give_error ? html`<div class="mk-box danger">${icon('alert', 'sm')}<span>Devredemezsin: ${o.give_error}. “Değiş” seçeneğini deneyebilirsin.</span></div>`
          : html`<div class="mk-box ${o.can.give ? 'ok' : 'warn'}">${icon(o.can.give ? 'users' : 'info', 'sm')}<span>${o.can.give ? `Şu an ${o.can.give} kişi kurallara uyarak bu nöbeti alabilir; onlara haber veririz.` : 'Şu an kurallara uyarak alabilecek kimse yok; yine de ilana koyabilirsin, liste değişince başvurabilirler.'}</span></div>`}`
        : html`<p class="small muted">Başvuran, kendi nöbetlerinden birini karşılık önerir. Yalnız ikiniz için de kurallara uyan günler önerilebilir.</p>
          <div class="mk-box ${o.can.swap ? 'ok' : 'warn'}">${icon(o.can.swap ? 'users' : 'info', 'sm')}<span>${o.can.swap ? `${o.can.swap} kişinin kurallara uyan bir değişim seçeneği var.` : 'Şu an uygun değişim seçeneği olan kimse yok; yine de ilana koyabilirsin.'}</span></div>`}
      <div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" id="mkNote" maxlength="300" placeholder="Örn. ailevi bir durum var" value="${note}"></div>
      <p class="tiny faint">${icon('lock', 'sm')} Başvuranları yalnız sen ve sorumlular görür. Seçtiğin kişi sorumluya iletilir; Excel güncellenince takvimlere işlenir.</p></div>`);
    m.setFoot(html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-go="1" ${st.kind === 'give' && o.give_error ? raw('disabled') : ''}>${icon('megaphone', 'sm')}İlana koy</button>`);
  };
  m.el.addEventListener('click', async (ev) => {
    const k = ev.target.closest('[data-k]');
    if (k) { st.kind = k.dataset.k; draw(); return; }
    const go = ev.target.closest('[data-go]');
    if (!go) return;
    await busy(go, async () => {
      try {
        const r = await api('listing.create', { date, kind: st.kind, note: ($('#mkNote', m.el) || {}).value || '' });
        m.close();
        toast(r.notified ? `İlana kondu · ${r.notified} kişiye haber verildi` : 'İlana kondu');
        MKT.tab = 'mine';
        if (location.hash.startsWith('#/ilanlar')) mkLoad(); else location.hash = '#/ilanlar/mine';
      } catch (er) { toast(er.message, 'err'); }
    });
  });
  draw();
}

/* ---- Başvuru ---- */
function mkFind(id) { const D = MKT.data || { board: [], mine: [], applied: [] }; return [...D.board, ...D.applied, ...D.mine].find((x) => x.id === id) || null; }
ACT['mk-apply'] = async (el) => {
  let L = mkFind(+el.dataset.id);
  if (!L || !L.elig) { try { L = (await api('listing.get', { id: +el.dataset.id })).listing; } catch (e) { return toast(e.message, 'err'); } }
  mkApplyModal(L);
};
function mkApplyModal(L, after) {
  const e = mkEntry(L);
  const offers = (L.elig && L.elig.offers) || [];
  const st = { pick: offers.length === 1 ? offers[0].date : null };
  const m = openModal({ title: L.kind === 'swap' ? 'Değişim öner' : 'İlana başvur' });
  const draw = () => {
    m.setBody(html`<div class="stack">
      <div class="sw-mine">${codeChip(e, true)}<div><b>${dateLabel(L.date)}</b><div class="tiny faint">${shiftDesc(e)} · ${L.poster} ${L.kind === 'give' ? 'devrediyor' : 'değişmek istiyor'}</div></div></div>
      ${L.note ? html`<div class="mk-note">“${L.note}”</div>` : ''}
      ${L.kind === 'swap' ? html`<div class="field"><label>Karşılığında vereceğin nöbet</label>
        <div class="mk-offers">${offers.map((x) => html`<button type="button" class="sw-opt ${st.pick === x.date ? 'on' : ''}" data-o="${x.date}">${mkShort(x.date)} ${codeChip(mkEntry(x))}${x.same ? '' : html`<span class="tiny faint">${x.hours || '?'} sa</span>`}</button>`)}</div>
        <p class="tiny faint">Yalnız ikiniz için de kurallara uyan nöbetlerin gösterilir (±31 gün).</p></div>`
        : html`<p class="small muted">Başvurunu ${L.poster.split(' ')[0]} görür ve başvuranlar arasından seçer. Seçilirsen sorumluya iletilir.</p>`}
      <div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" id="mkApNote" maxlength="300" placeholder="Örn. o gün rahatım"></div></div>`);
    m.setFoot(html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-go="1" ${L.kind === 'swap' && !st.pick ? raw('disabled') : ''}>${L.kind === 'swap' ? 'Değişim öner' : 'Başvur'}</button>`);
  };
  m.el.addEventListener('click', async (ev) => {
    const o = ev.target.closest('[data-o]');
    if (o) { const note = ($('#mkApNote', m.el) || {}).value; st.pick = o.dataset.o; draw(); if (note) $('#mkApNote', m.el).value = note; return; }
    const go = ev.target.closest('[data-go]');
    if (!go) return;
    await busy(go, async () => {
      try {
        await api('listing.apply', { id: L.id, offer_date: st.pick || '', note: ($('#mkApNote', m.el) || {}).value || '' });
        m.close(); toast('Başvurun iletildi'); if (after) after(); else mkLoad();
      } catch (er) { toast(er.message, 'err'); }
    });
  });
  draw();
}
ACT['mk-withdraw'] = async (el) => {
  if (!(await confirmDialog({ title: 'Başvurun geri çekilsin mi?', text: 'İlan açık kaldıkça yeniden başvurabilirsin.', ok: 'Geri çek' }))) return;
  try { await api('listing.withdraw', { id: +el.dataset.id }); toast('Başvurun geri çekildi'); mkReloadAny(); } catch (e) { toast(e.message, 'err'); }
};
ACT['mk-cancel'] = async (el) => {
  if (!(await confirmDialog({ title: 'İlan geri çekilsin mi?', text: 'Başvuranlara ilanın kapandığı bildirilir.', ok: 'Geri çek', danger: true }))) return;
  try { await api('listing.cancel', { id: +el.dataset.id }); toast('İlan geri çekildi'); const ov = el.closest('.overlay'); if (ov) { const mm = modalStack.find((x) => x.el === ov); if (mm) mm.close(); } mkReloadAny(); } catch (e) { toast(e.message, 'err'); }
};
ACT['mk-del'] = async (el) => {
  const open = el.dataset.open === '1';
  if (!(await confirmDialog({ title: 'İlan silinsin mi?', text: open ? 'İlan kalıcı olarak silinir; başvuranlara ilanın kaldırıldığı bildirilir.' : 'İlan listeden kalıcı olarak silinir. Seçimle oluşmuş nöbet değişimi kaydı varsa o korunur.', ok: 'Sil', danger: true }))) return;
  try { await api('listing.delete', { id: +el.dataset.id }); toast('İlan silindi'); const ov = el.closest('.overlay'); if (ov) { const mm = modalStack.find((x) => x.el === ov); if (mm) mm.close(); } mkReloadAny(); } catch (e) { toast(e.message, 'err'); }
};
function mkReloadAny() { if ($('#mkBody')) mkLoad(); const h = $('#homeExtTop .home-ext-market'); if (h) mkHomeCard(h); }

/* ---- İlan ayrıntısı: başvuranlar (yalnız ilan sahibi / sorumlu) ---- */
ACT['mk-open'] = (el) => mkOpenListing(+el.dataset.id);
async function mkOpenListing(id) {
  const m = openModal({ title: 'Nöbet ilanı', size: 'wide', body: mkSpin() });
  const load = async () => {
    let L;
    try { L = (await api('listing.get', { id })).listing; } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); m.setFoot(''); return; }
    const e = mkEntry(L);
    const [t, tone] = MK_ST[L.status] || [L.status, ''];
    const sw = L.swap_status && MK_SW[L.swap_status];
    const apps = L.apps || [];
    const live = apps.filter((a) => a.status === 'applied');
    const appRow = (a) => html`<div class="list-row mk-app">${avatar(a.name, 'sm')}
      <div class="grow"><div class="lr-t">${a.name}</div>
        ${a.offer_date ? html`<div class="small">Karşılığında <b>${mkShort(a.offer_date)}</b> ${codeChip(mkEntry({ code: a.offer_code, ...(a.offer || {}) }))} ${a.offer ? html`<span class="tiny faint">${shiftDesc(mkEntry({ code: a.offer_code, ...a.offer }))}</span>` : ''}</div>` : ''}
        ${a.note ? html`<div class="tiny muted">“${a.note}”</div>` : ''}
        <div class="tiny faint">${fmtRel(a.created_at)} başvurdu</div>
        ${a.valid ? html`<div class="tiny ${a.valid.ok ? 'mk-ok' : 'mk-no'}">${icon(a.valid.ok ? 'check' : 'x', 'sm')} ${a.valid.ok ? 'Kurallara uygun' : a.valid.reason}</div>` : ''}</div>
      <div class="mk-act">${a.status === 'chosen' ? html`<span class="badge success">Seçildi</span>` : a.status === 'rejected' ? html`<span class="badge">Seçilmedi</span>` : a.status === 'withdrawn' ? html`<span class="badge">Geri çekti</span>`
        : L.mine && L.status === 'open' ? html`<button class="btn sm primary" data-ch="${a.id}" data-n="${a.name}" ${a.valid && !a.valid.ok ? raw('disabled') : ''}>Seç</button>` : html`<span class="badge warn">Bekliyor</span>`}</div></div>`;
    m.setBody(html`<div class="stack">
      <div class="sw-mine">${codeChip(e, true)}<div class="grow"><b>${dateLabel(L.date)}</b><div class="tiny faint">${shiftDesc(e)} · ${L.roster}</div></div><span class="badge ${L.kind === 'give' ? 'tone-violet' : 'tone-sky'}">${L.kind === 'give' ? 'Devret' : 'Değiş'}</span></div>
      <div class="row wrap">${avatar(L.poster, 'sm')}<span class="small"><b>${L.poster}</b> · ${fmtRel(L.created_at)}</span><span class="badge ${tone}">${t}</span>${sw ? html`<span class="badge ${sw[1]}">${sw[0]}</span>` : ''}</div>
      ${L.note ? html`<div class="mk-note">“${L.note}”</div>` : ''}
      ${L.manage ? html`
        ${L.status === 'taken' && L.taker ? html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span><b>${L.taker}</b> aldı${L.taker_date ? ` · karşılığında ${mkShort(L.taker_date)} (${L.taker_code})` : ''}. ${L.swap_status === 'applied' ? 'Listeye işlendi.' : 'Sorumlu Excel’de güncelleyince listeye işlenir.'}</span></div>` : ''}
        <div class="card"><div class="card-head"><div><h3>${icon('users', 'sm')} Başvuranlar (${live.length})</h3><div class="tiny faint">${icon('lock', 'sm')} Yalnız ilan sahibi ve sorumlular görür</div></div></div>
          <div class="list">${apps.length ? apps.map(appRow) : html`<div class="list-row small muted">Henüz başvuru yok. Uygun olanlara haber verildi.</div>`}</div></div>
        ${!L.mine && L.status === 'open' && live.length ? html`<p class="tiny faint">Seçimi ilan sahibi yapar.</p>` : ''}`
      : html`${L.status !== 'open' ? html`<div class="mk-box">${icon('info', 'sm')}<span>Bu ilan kapandı.</span></div>` : ''}
        ${L.my_app ? html`<div><span class="badge ${mkAppState(L)[1]}">${mkAppState(L)[0]}</span></div>` : ''}
        ${L.status === 'open' && !L.my_app && L.elig && !L.elig.ok ? html`<div class="mk-why">${icon('info', 'sm')}<span>${L.elig.reason}</span></div>` : ''}`}
    </div>`);
    const canApply = !L.manage && L.status === 'open' && L.elig && L.elig.ok && (!L.my_app || L.my_app.status === 'withdrawn');
    m.setFoot(html`<button class="btn" data-act="close-modal">Kapat</button>
      ${(L.mine || L.manage) && L.status === 'open' ? html`<button class="btn danger" data-act="mk-cancel" data-id="${L.id}">İlanı geri çek</button>` : ''}
      ${L.mine || L.manage ? html`<button class="btn ghost" data-act="mk-del" data-id="${L.id}" data-open="${L.status === 'open' ? 1 : 0}">${icon('trash', 'sm')}Sil</button>` : ''}
      ${canApply ? html`<button class="btn primary" data-ap="1">${L.kind === 'swap' ? 'Değiş öner' : 'Başvur'}</button>` : ''}
      ${!L.manage && L.my_app && L.my_app.status === 'applied' && L.status === 'open' ? html`<button class="btn" data-act="mk-withdraw" data-id="${L.id}">Başvurumu geri çek</button>` : ''}`);
    m.L = L;
  };
  m.el.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-ap]')) { m.close(); mkApplyModal(m.L); return; }
    const b = ev.target.closest('[data-ch]');
    if (!b) return;
    if (!(await confirmDialog({ title: `${b.dataset.n} seçilsin mi?`, text: 'Sorumluya “Excel’e işlenecek” diye iletilir; diğer başvuranlara ilanın kapandığı bildirilir (kimin seçildiği söylenmez).', ok: 'Seç ve gönder' }))) return;
    try { await api('listing.choose', { id, app_id: +b.dataset.ch }); toast('Seçildi; sorumluya iletildi'); await load(); mkReloadAny(); } catch (er) { toast(er.message, 'err'); }
  });
  await load();
}

/* ---- Ana sayfa kartı: sana sorulan çağrılar, başvurabileceğin ilanlar ---- */
async function mkHomeCard(el) {
  let r;
  try { r = await api('market.home'); } catch (e) { el.innerHTML = ''; return; }
  const L = r.listings || {};
  const P = r.pub || {};
  const rows = [];
  (r.asks || []).forEach((c) => rows.push(html`<div class="list-row mk-ask"><span class="np-ico tone-rose">${icon('alert', 'sm')}</span>
    <a class="grow" href="#/eksik/${c.id}" style="color:inherit;text-decoration:none;min-width:0"><div class="lr-t">${mkShort(c.date)} ${c.text} için ${c.need} kişi eksik</div>
      <div class="lr-s">${c.move_from ? `${mkShort(c.move_from)} nöbetini bu güne kaydırabilir misin?` : 'Gelebilir misin?'}${c.unit ? ' · ' + c.unit : ''}</div></a>
    <div class="row" style="gap:6px"><button class="btn sm primary" data-act="co-ans" data-id="${c.id}" data-y="1">Gelebilirim</button><button class="btn sm" data-act="co-ans" data-id="${c.id}" data-y="0">Gelemem</button></div></div>`));
  if (L.waiting) rows.push(html`<a class="list-row" href="#/ilanlar/mine" style="color:inherit;text-decoration:none"><span class="np-ico tone-violet">${icon('users', 'sm')}</span><div class="grow"><div class="lr-t">İlanına ${L.waiting} başvuru var</div><div class="lr-s">Başvuranlar arasından seç</div></div>${icon('chevR', 'sm')}</a>`);
  if (L.can) rows.push(html`<a class="list-row" href="#/ilanlar" style="color:inherit;text-decoration:none"><span class="np-ico tone-violet">${icon('megaphone', 'sm')}</span><div class="grow"><div class="lr-t">${L.can} nöbet ilanına başvurabilirsin</div><div class="lr-s">Kurallara uyan ilanlar</div></div>${icon('chevR', 'sm')}</a>`);
  if (P.open) rows.push(html`<a class="list-row" href="#/eksik" style="color:inherit;text-decoration:none"><span class="np-ico tone-rose">${icon('alert', 'sm')}</span><div class="grow"><div class="lr-t">${P.open} açık eksik çağrısı</div><div class="lr-s">${P.yes ? `${P.yes} kişi gelebilir dedi · seçim bekliyor` : 'Yanıt bekleniyor'}</div></div>${icon('chevR', 'sm')}</a>`);
  if (!rows.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  setHTML(el, html`<div class="card mk-home"><div class="card-head"><h3>${icon('megaphone', 'sm')} İlan ve eksik çağrıları</h3></div><div class="list">${rows}</div></div>`);
}

/* =================================================================== */
/* Eksik personel çağrısı                                               */
/* =================================================================== */
const CO = { meta: null };
const CO_SHIFTS = [['day', '08-16', 'Gündüz'], ['night', '16-08', 'Gece'], ['24', '24 saat', '08-08']];
const CO_ANS = { asked: ['Yanıt bekleniyor', 'warn'], yes: ['Gelebilir', 'success'], no: ['Gelemez', 'danger'] };
async function coMeta() { if (!CO.meta) CO.meta = await api('callout.meta'); return CO.meta; }
function coShiftKey(s) {
  const v = String(s || '').trim().toLowerCase();
  if (['day', 'night', '24'].includes(v)) return v;
  if (/^0?8[ .:-]*0?8$|^24/.test(v)) return '24';
  if (/^16|gece|night/.test(v)) return 'night';
  if (/^0?8|gündüz|gunduz/.test(v)) return 'day';
  return null;
}
function coSideOfUnit(meta, unit) { const s = (meta.sides || []).find((x) => (x.units || []).includes(unit)); return s ? s.key : ''; }

/**
 * Eksik personel çağrısı penceresi. Blok yerleşimi gibi modüller de çağırır:
 *   openCalloutModal({ date: 'Y-m-d', shift: 'day'|'night'|'24' (ya da '8 16' / '16 8' / '8 8'), side: 's3', unit: 'B blok', need: 1 })
 */
async function openCalloutModal(opts = {}) {
  if (!isPublisher()) { toast('Eksik personel çağrısını sorumlular açabilir.', 'err'); return null; }
  const m = openModal({ title: 'Eksik personel çağrısı', size: 'wide', body: mkSpin() });
  let meta;
  try { meta = await coMeta(); } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return m; }
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  const side = opts.side || (opts.unit ? coSideOfUnit(meta, opts.unit) : '') || ((meta.sides || [])[0] || {}).key || '';
  const st = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(opts.date || '') ? opts.date : ymd(tom), shift: coShiftKey(opts.shift) || 'night', need: Math.max(1, Math.min(20, +opts.need || 1)),
    side, rid: +opts.roster_id || ((meta.rosters || [])[0] || {}).id || 0, unit: opts.unit || '', other: !!opts.other, note: '',
  };
  const sideObj = () => (meta.sides || []).find((s) => s.key === st.side) || null;
  const form = () => {
    const sd = sideObj();
    const units = sd ? sd.units || [] : [];
    return html`<div class="co-form">
      <div class="grid2 co-keep"><div class="field"><label>Tarih</label><input class="input" type="date" data-co="date" value="${st.date}" min="${ymd(new Date())}"></div>
        <div class="field"><label>Kaç kişi eksik?</label><input class="input" type="number" data-co="need" min="1" max="20" value="${st.need}"></div></div>
      <div class="field"><label>Vardiya</label><div class="seg seg-block" role="tablist">${CO_SHIFTS.map(([k, t, l]) => html`<button type="button" class="${st.shift === k ? 'on' : ''}" data-shift="${k}">${t} <span class="faint">${l}</span></button>`)}</div></div>
      <div class="grid2">${(meta.sides || []).length ? html`<div class="field"><label>Taraf</label><select class="select" data-co="side">${meta.sides.map((s) => html`<option value="${s.key}" ${s.key === st.side ? raw('selected') : ''}>${s.name}</option>`)}</select></div>
          <div class="field"><label>Blok <span class="faint">(isteğe bağlı)</span></label><select class="select" data-co="unit"><option value="">Belirtilmedi</option>${units.map((u) => html`<option ${u === st.unit ? raw('selected') : ''}>${u}</option>`)}</select></div>`
        : html`<div class="field"><label>Nöbet listesi</label><select class="select" data-co="rid">${(meta.rosters || []).map((r) => html`<option value="${r.id}" ${r.id === st.rid ? raw('selected') : ''}>${r.name}</option>`)}</select></div><div></div>`}</div>
      ${(meta.sides || []).length > 1 || (meta.rosters || []).length > 1 ? html`<label class="switch"><input type="checkbox" data-co="other" ${st.other ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Karşı taraftan da aday göster</b><span>Diğer listedeki uygun kişiler de listelenir</span></span></label>` : ''}
      <div class="field"><label>Not <span class="faint">(isteğe bağlı, sorulan kişiler görür)</span></label><input class="input" data-co="note" maxlength="300" placeholder="Örn. yoğun bakıma 2 yatış geldi" value="${st.note}"></div>
    </div>`;
  };
  m.setBody(html`${form()}<div class="co-panel" id="coModalPanel"></div>`);
  const host = $('#coModalPanel', m.el);
  const params = () => ({ date: st.date, shift: st.shift, side: st.side, roster_id: st.rid, other: st.other });
  const foot = () => {
    const P = host.__co || {};
    const n = P.sel ? P.sel.size : 0;
    m.setFoot(html`<button class="btn" data-act="co-xlsx" data-host="coModalPanel">${icon('download', 'sm')}<span>Excel indir</span></button><span class="grow"></span>
      <button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-co-send="1" ${n ? '' : raw('disabled')}>${icon('send', 'sm')}Seçilenlere sor${n ? ` (${n})` : ''}</button>`);
  };
  coPanelInit(host, { params: params(), onSel: foot, need: () => st.need });
  foot();
  const reload = debounce(() => { host.__co.params = params(); host.__co.sel.clear(); coPanelLoad(host); foot(); }, 250);
  const onField = (ev) => {
    const t = ev.target.closest('[data-co]');
    if (!t) return;
    const k = t.dataset.co;
    if (k === 'other') st.other = t.checked;
    else if (k === 'need') { st.need = Math.max(1, Math.min(20, +t.value || 1)); coPanelDraw(host); return; }
    else if (k === 'note') { st.note = t.value; return; }
    else if (k === 'rid') st.rid = +t.value;
    else if (k === 'unit') { st.unit = t.value; return; }
    else st[k] = t.value;
    if (k === 'side') { st.unit = ''; const f = $('.co-form', m.el); if (f) { const tmp = document.createElement('div'); tmp.innerHTML = fmtVal(form()); f.replaceWith(tmp.firstElementChild); } }
    if (k === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(st.date)) return;
    reload();
  };
  m.el.addEventListener('change', onField);
  m.el.addEventListener('input', (ev) => { if (ev.target.matches('[data-co=note],[data-co=need]')) onField(ev); });
  m.el.addEventListener('click', async (ev) => {
    const sb = ev.target.closest('[data-shift]');
    if (sb) { st.shift = sb.dataset.shift; $$('[data-shift]', m.el).forEach((b) => b.classList.toggle('on', b === sb)); reload(); return; }
    const go = ev.target.closest('[data-co-send]');
    if (!go) return;
    const P = host.__co;
    if (!P.sel.size) return;
    await busy(go, async () => {
      try {
        const r = await api('callout.create', { ...params(), need: st.need, unit: st.unit, note: st.note, filters: [...P.on], asks: [...P.sel.values()] });
        m.close();
        toast(`Çağrı açıldı · ${r.asked} kişiye soruldu` + (r.no_account.length ? ` (${r.no_account.length} kişinin hesabı yok, telefonla arayın)` : ''));
        location.hash = '#/eksik/' + r.id;
      } catch (er) { toast(er.message, 'err'); }
    });
  });
  coPanelLoad(host);
  return m;
}
window.openCalloutModal = openCalloutModal;

/* ---- Aday paneli (yeni çağrı penceresi ve çağrı sayfası ortak) ---- */
function coPanelInit(host, o) {
  host.classList.add('co-panel');
  host.__co = { params: o.params, id: o.id || null, data: null, on: null, showAll: false, sel: new Map(), drawn: {}, onSel: o.onSel || (() => {}), need: o.need || (() => 1), locked: o.locked || null, loading: 0 };
}
async function coPanelLoad(host) {
  const P = host.__co;
  const tk = ++P.loading;
  setHTML(host, mkSpin());
  let d;
  try { d = await api('callout.candidates', P.id ? { id: P.id } : P.params); } catch (e) { if (tk === P.loading) setHTML(host, html`<div class="mk-box danger">${icon('alert', 'sm')}<span>${e.message}</span></div>`); return; }
  if (tk !== P.loading || !document.body.contains(host)) return;
  P.data = d;
  if (!P.on) P.on = new Set(P.locked || d.conds.map((c) => c.key));
  coPanelDraw(host);
}
function coPass(P, x) { for (const k of P.on) if (!x.c[k]) return false; return true; }
function coSorted(P, list) { return list.slice().sort((a, b) => (coPass(P, b) - coPass(P, a)) || (a.rank - b.rank)); }
function coFirstWhy(P, x) { const k = P.data.conds.find((c) => !x.c[c.key]); return k ? (x.why[k.key] || k.label) : ''; }
function coRestTxt(x, rest) {
  if (x.rest_before == null) return html`<span class="faint">—</span>`;
  const h = x.rest_before;
  const t = h >= 72 ? `${Math.floor(h / 24)} gün önce çıkmış` : `${h} sa önce çıkmış`;
  return html`<span class="${h > 0 && h < rest ? 'mk-no' : ''}">${t}</span><div class="tiny faint">${mkDT(x.prev_end)}</div>`;
}
function coNextTxt(x) {
  if (x.rest_after == null) return html`<span class="faint">—</span>`;
  const h = x.rest_after;
  return html`<span>${h >= 72 ? `${Math.floor(h / 24)} gün sonra` : `${h} sa sonra`}</span><div class="tiny faint">${mkDT(x.next_start)}</div>`;
}
function coRow(P, x, ties) {
  const D = P.data;
  const top = P.topRank;
  const pass = coPass(P, x);
  const key = x.key + '|' + (x.move ? x.move.from : '');
  const asked = !!x.resp;
  const sel = P.sel.has(key);
  const tie = !x.move && pass && !asked && ties.has(x.fair);
  const drawn = P.drawn[x.fair] === x.name;
  const why = pass ? '' : coFirstWhy(P, x);
  return html`<tr class="${pass ? '' : 'dim'} ${sel ? 'co-sel' : ''}">
    <td class="co-ck"><input type="checkbox" aria-label="${x.display} seç" data-change="co-sel" data-k="${key}" data-n="${x.name}" data-f="${x.move ? x.move.from : ''}" ${sel ? raw('checked') : ''} ${!pass || asked ? raw('disabled') : ''}></td>
    <td class="co-name"><div class="co-who">${avatar(x.display, 'sm')}<div style="min-width:0"><b>${x.display}</b>${x.user_id ? '' : html` <span class="badge" title="Uygulamada hesabı yok; telefonla sorun">hesabı yok</span>`}
      <div class="tiny faint">${[x.title, x.other ? x.side_name : ''].filter(Boolean).join(' · ')}</div>
      ${x.move ? html`<div class="tiny co-mv">${icon('history', 'sm')} ${mkShort(x.move.from)} ${x.move.code} → ${mkShort(D.date)}</div>${x.move.warn ? html`<div class="tiny mk-no">${icon('alert', 'sm')} ${x.move.warn}</div>` : ''}` : ''}
      <div class="co-tags">${pass && !x.move && !asked && x.rank === top ? html`<span class="badge brand">Öncelikli</span>` : ''}
        ${tie ? html`<span class="badge warn" title="Adalet ölçüleri eşit">eşit</span><button type="button" class="btn sm ghost co-kura" data-act="co-draw" data-fair="${x.fair}">${icon('star', 'sm')}Kura</button>` : ''}
        ${drawn ? html`<span class="badge tone-violet">Kura ile seçildi</span>` : ''}
        ${asked ? html`<span class="badge ${(CO_ANS[x.resp.answer] || [])[1] || ''}">${x.resp.chosen ? 'Seçildi' : 'Soruldu · ' + (CO_ANS[x.resp.answer] || ['?'])[0]}</span>` : ''}</div></div></div></td>
    <td class="co-conds"><div class="co-cs">${D.conds.map((c) => html`<span class="co-c ${x.c[c.key] ? 'ok' : 'no'} ${P.on.has(c.key) ? '' : 'off'}" title="${c.label}${x.why[c.key] ? ': ' + x.why[c.key] : ''}">${icon(x.c[c.key] ? 'check' : 'x', 'sm')}${c.short}</span>`)}</div>
      ${why ? html`<div class="tiny mk-no co-why">${why}</div>` : ''}</td>
    <td class="nowrap">${coRestTxt(x, D.rules.rest)}</td>
    <td class="nowrap">${coNextTxt(x)}</td>
    <td class="nowrap"><b>${x.month_hours}</b> sa<div class="tiny ${x.overtime > 0 ? 'mk-no' : 'faint'}">${x.overtime > 0 ? `+${x.overtime} fazla mesai` : `${Math.abs(x.overtime)} sa eksik`}</div></td>
    <td class="nowrap">${x.last7} nöbet</td>
    <td class="nowrap"><b>${x.free_days}</b> gün</td>
  </tr>`;
}
function coTable(P, list, ties, empty) {
  if (!list.length) return html`<div class="list-row small muted">${empty}</div>`;
  return html`<div class="table-wrap co-scroll"><table class="t co-t"><thead><tr><th></th><th>Kişi</th><th>Şartlar</th><th>Son nöbet</th><th>Sonraki nöbet</th><th>Bu ay</th><th>Son 7 gün</th><th>Boşluk</th></tr></thead>
    <tbody>${list.map((x) => coRow(P, x, ties))}</tbody></table></div>`;
}
function coPanelDraw(host) {
  const P = host.__co;
  const D = P && P.data;
  if (!D) return;
  const people = coSorted(P, D.people);
  const moves = coSorted(P, D.moves);
  const okP = people.filter((x) => coPass(P, x));
  const okM = moves.filter((x) => coPass(P, x));
  const shownP = P.showAll ? people : okP;
  const shownM = P.showAll ? moves : okM;
  const cnt = {};
  okP.filter((x) => !x.resp).forEach((x) => { cnt[x.fair] = (cnt[x.fair] || 0) + 1; });
  const ties = new Set(Object.keys(cnt).filter((k) => cnt[k] > 1 && !P.drawn[k]));
  const firstFree = okP.find((x) => !x.resp);
  P.topRank = firstFree && !ties.has(firstFree.fair) ? firstFree.rank : null;
  const per = D.row.start === D.row.end ? ['day', 'night'] : D.shift === 'night' ? ['night'] : ['day'];
  const cov = D.coverage.filter((c) => c.main).map((c) => {
    const have = Math.min(...per.map((p) => c.have[p]));
    const need = c.need ? Math.max(...per.map((p) => c.need[p] || 0)) : 0;
    return html`<span class="co-cov-i"><b>${c.name}</b> · ${D.text}: ${have} kişi var${need ? html`, gereken <b>${need}</b>${have < need ? html` <span class="badge danger">${need - have} eksik</span>` : ''}` : ''}</span>`;
  });
  const failN = (k) => D.people.filter((x) => !x.c[k]).length;
  setHTML(host, html`
    <div class="co-cov">${icon('calendar', 'sm')}<span><b>${dateLabel(D.date)}</b> · ${codeChip(mkEntry(D.row))} ${D.text}</span>${cov}</div>
    <div class="co-filters" role="group" aria-label="Şartlar">${P.locked ? html`<span class="tiny faint">Çağrıdaki şartlar:</span>` : html`<span class="tiny faint">Şartlar (dokunarak aç/kapat):</span>`}
      ${D.conds.map((c) => html`<button type="button" class="co-chip ${P.on.has(c.key) ? 'on' : ''}" data-act="co-filter" data-k="${c.key}" aria-pressed="${P.on.has(c.key) ? 'true' : 'false'}" ${P.locked ? raw('disabled') : ''}>${icon(P.on.has(c.key) ? 'check' : 'x', 'sm')}${c.label}${failN(c.key) ? html`<span class="co-n">${failN(c.key)}</span>` : ''}</button>`)}
      <label class="co-all"><input type="checkbox" data-change="co-all" ${P.showAll ? raw('checked') : ''}> Uymayanları da göster</label></div>
    <div class="card co-card"><div class="card-head"><div><h3>${icon('users', 'sm')} Boşta olanlar · ${okP.length} uygun</h3><div class="tiny faint">Sıra: en çok boşluk → bu ay az saat (az fazla mesai) → son 7 günde az nöbet → eşitse kura</div></div>
      ${okP.length ? html`<button type="button" class="btn sm ghost" data-act="co-top">İlk ${Math.min(P.need(), okP.filter((x) => !x.resp).length) || 1} kişiyi seç</button>` : ''}</div>
      ${coTable(P, shownP, ties, 'Şartlara uyan boşta kimse yok. Kaydırma adaylarına bakın ya da bazı şartları kapatın.')}</div>
    <div class="card co-card"><div class="card-head"><div><h3>${icon('history', 'sm')} Kaydırma adayları · ${okM.length} uygun</h3><div class="tiny faint">Bir sonraki (ya da önceki) gün aynı vardiyası olan, nöbeti bu güne kaydırılınca kurallara uyanlar</div></div></div>
      ${coTable(P, shownM, new Set(), D.moves.length ? 'Şartlara uyan kaydırma adayı yok.' : 'Komşu günlerde aynı vardiyada nöbeti olan kimse yok.')}</div>`);
  P.onSel();
}
ACT['co-filter'] = (el) => {
  const host = el.closest('.co-panel'); const P = host && host.__co;
  if (!P || P.locked) return;
  const k = el.dataset.k;
  if (P.on.has(k)) P.on.delete(k); else P.on.add(k);
  // Artık şartlara uymayan seçimleri bırak
  for (const [key, v] of P.sel) { const x = [...P.data.people, ...P.data.moves].find((y) => y.key + '|' + (y.move ? y.move.from : '') === key); if (!x || !coPass(P, x)) P.sel.delete(key); }
  coPanelDraw(host);
};
CHANGE['co-all'] = (el) => { const host = el.closest('.co-panel'); if (!host) return; host.__co.showAll = el.checked; coPanelDraw(host); };
CHANGE['co-sel'] = (el) => {
  const host = el.closest('.co-panel'); const P = host && host.__co;
  if (!P) return;
  const k = el.dataset.k;
  if (el.checked) {
    // Aynı kişi bir kez sorulur (boşta ya da kaydırma)
    const pk = k.split('|')[0];
    for (const key of P.sel.keys()) if (key.split('|')[0] === pk) P.sel.delete(key);
    P.sel.set(k, { name: el.dataset.n, from: el.dataset.f || '' });
  } else P.sel.delete(k);
  coPanelDraw(host);
};
ACT['co-top'] = (el) => {
  const host = el.closest('.co-panel'); const P = host && host.__co;
  if (!P) return;
  const list = coSorted(P, P.data.people).filter((x) => coPass(P, x) && !x.resp).slice(0, P.need());
  P.sel.clear();
  list.forEach((x) => P.sel.set(x.key + '|', { name: x.name, from: '' }));
  coPanelDraw(host);
};
ACT['co-draw'] = (el) => busy(el, async () => {
  const host = el.closest('.co-panel'); const P = host && host.__co;
  if (!P) return;
  const fair = el.dataset.fair;
  const group = coSorted(P, P.data.people).filter((x) => x.fair === fair && coPass(P, x) && !x.resp);
  try {
    const r = await api('callout.draw', { names: group.map((x) => x.name), id: P.id || undefined, context: `${P.data.date} ${P.data.text}` });
    P.drawn[fair] = r.picked;
    // Kurayı kazanan grubun başına geçer ve seçilir
    const win = group.find((x) => x.name === r.picked);
    const minRank = Math.min(...group.map((x) => x.rank));
    group.forEach((x) => { if (x !== win) x.rank += 0.5; });
    if (win) { win.rank = minRank - 0.1; const k = win.key + '|'; for (const key of P.sel.keys()) if (key.split('|')[0] === win.key) P.sel.delete(key); P.sel.set(k, { name: win.name, from: '' }); }
    toast(`Kura: ${win ? win.display : r.picked}`);
    coPanelDraw(host);
  } catch (e) { toast(e.message, 'err'); }
});

/* ---- Excel: "Adaylar" + "Ay çizelgesi" ---- */
ACT['co-xlsx'] = (el) => busy(el, async () => {
  const host = el.dataset.host ? document.getElementById(el.dataset.host) : $('.co-panel');
  const P = host && host.__co;
  if (!P || !P.data) return toast('Önce adaylar yüklensin', 'err');
  try { await coXlsx(P); } catch (e) { toast('Excel oluşturulamadı: ' + e.message, 'err'); }
});
async function coXlsx(P) {
  const D = P.data;
  const [sheet] = await Promise.all([api('callout.sheet', P.id ? { id: P.id } : P.params), loadVendor('exceljs')]);
  const wb = new ExcelJS.Workbook();
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const head = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill('FF0B7A75'), alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } };
  const thin = { style: 'thin', color: { argb: 'FFD5DCE1' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const title = `Eksik personel — ${dateLabel(D.date).replace(/^(Bugün|Yarın|Dün) · /, '')} ${D.text} (${D.row.code})`;
  // 1) Adaylar
  const ws = wb.addWorksheet('Adaylar', { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  const cols = ['Sıra', 'Ad soyad', 'Ünvan', 'Taraf', 'Tür', 'Uygun', ...D.conds.map((c) => c.label), 'Neden', 'Son nöbet çıkışı', 'Dinlenme (sa)', 'Sonraki nöbet', 'Sonrasına (sa)', 'Bu ay saat', 'Fazla mesai', 'Son 7 gün', 'Boşluk (gün)', 'Kaydırılacak gün'];
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell(2, 1).value = `Etkin şartlar: ${D.conds.filter((c) => P.on.has(c.key)).map((c) => c.label).join(', ') || 'yok'} · Sıra: en çok boşluk → az saat → son 7 günde az nöbet`;
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF4B5A63' } };
  cols.forEach((h, i) => { const c = ws.getCell(3, i + 1); c.value = h; Object.assign(c, head); c.border = border; });
  ws.getRow(3).height = 42;
  const rows = [...coSorted(P, D.people).filter((x) => P.showAll || coPass(P, x)).map((x) => [x, 'Boşta']), ...coSorted(P, D.moves).filter((x) => P.showAll || coPass(P, x)).map((x) => [x, 'Kaydırma'])];
  rows.forEach(([x, kind], i) => {
    const ok = coPass(P, x);
    const r = ws.addRow([i + 1, x.display, x.title || '', x.side_name, kind, ok ? 'Evet' : 'Hayır', ...D.conds.map((c) => (x.c[c.key] ? '✓' : '✗')),
      ok ? '' : coFirstWhy(P, x), x.prev_end || '', x.rest_before ?? '', x.next_start || '', x.rest_after ?? '', x.month_hours, x.overtime, x.last7, x.free_days,
      x.move ? `${mkShort(x.move.from)} ${x.move.code} → ${mkShort(D.date)}${x.move.warn ? ' (' + x.move.warn + ')' : ''}` : '']);
    r.eachCell((c, ci) => {
      c.border = border;
      if (ci >= 7 && ci < 7 + D.conds.length) { c.alignment = { horizontal: 'center' }; c.font = { bold: true, color: { argb: c.value === '✓' ? 'FF17844A' : 'FFC73A5C' } }; }
    });
    if (ok) [2, 6].forEach((ci) => { r.getCell(ci).fill = fill('FFD9F2E3'); });
    else r.font = { color: { argb: 'FF7C8A93' } };
  });
  [6, 24, 14, 14, 10, 8, ...D.conds.map(() => 11), 36, 17, 10, 17, 10, 9, 10, 9, 10, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  // 2) Ay çizelgesi: kişiler × günler; çağrı günü ve uygun adaylar renkli
  const ms = wb.addWorksheet('Ay çizelgesi', { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  const [yy, mm] = sheet.month.split('-').map(Number);
  const nd = sheet.days;
  const okNames = new Set([...D.people, ...D.moves].filter((x) => coPass(P, x)).map((x) => x.name));
  const sel = new Set([...P.sel.values()].map((v) => v.name));
  ms.mergeCells(1, 1, 1, 3 + nd);
  ms.getCell(1, 1).value = `${TR_MONTHS[mm - 1]} ${yy} çizelgesi · ${title}`; ms.getCell(1, 1).font = { bold: true, size: 13 };
  ['Ad soyad', 'Ünvan'].forEach((h, i) => { const c = ms.getCell(2, i + 1); c.value = h; Object.assign(c, head); ms.mergeCells(2, i + 1, 3, i + 1); });
  for (let d = 1; d <= nd; d++) {
    const dt = new Date(yy, mm - 1, d);
    const c1 = ms.getCell(2, 2 + d); c1.value = d; Object.assign(c1, head);
    const c2 = ms.getCell(3, 2 + d); c2.value = TR_DAYS_S[dt.getDay()]; Object.assign(c2, head); c2.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    const we = dt.getDay() === 0 || dt.getDay() === 6 || sheet.holidays[d];
    if (we) { c1.fill = fill('FF4B5A63'); c2.fill = fill('FF4B5A63'); }
    if (d === sheet.day) { c1.fill = fill('FFE0A100'); c2.fill = fill('FFE0A100'); }
    ms.getColumn(2 + d).width = 5.2;
  }
  const tc = ms.getCell(2, 3 + nd); tc.value = 'Saat'; Object.assign(tc, head); ms.mergeCells(2, 3 + nd, 3, 3 + nd);
  const tone = (v) => {
    if (!v) return null;
    if (v.k === 'leave' || v.k === 'off') return 'FFE8EDF0';
    if (v.k === 'role') return 'FFD8F1EE';
    if ((v.h || 0) >= 24 || (v.s && v.s === v.e)) return 'FFD5F2E1';
    if (v.s && v.e && v.e <= v.s) return 'FFE1E3FB';
    return 'FFFDECC8';
  };
  sheet.sides.forEach((sd) => {
    if (sheet.sides.length > 1) { const r = ms.addRow([sd.name]); r.font = { bold: true }; r.getCell(1).fill = fill('FFEEF2F4'); }
    sd.people.forEach((p) => {
      const r = ms.addRow([p.display, p.title || '', ...Array.from({ length: nd }, (_, i) => (p.days[i + 1] ? p.days[i + 1].c : '')), p.hours]);
      const cand = okNames.has(p.name);
      for (let d = 1; d <= nd; d++) {
        const c = r.getCell(2 + d);
        c.alignment = { horizontal: 'center' }; c.border = border; c.font = { size: 9 };
        const t = tone(p.days[d]);
        if (t) c.fill = fill(t);
        if (d === sheet.day) { c.fill = fill(t ? 'FFFFD966' : 'FFFFF2CC'); c.font = { size: 9, bold: true }; }
      }
      if (cand) { [1, 2].forEach((ci) => { r.getCell(ci).fill = fill(sel.has(p.name) ? 'FFB7E4C7' : 'FFD9F2E3'); }); r.getCell(1).font = { bold: true }; }
      r.getCell(1).border = border; r.getCell(2).border = border;
    });
  });
  const lg = ms.addRow([]); void lg;
  ms.addRow(['Renkler: sarı sütun = çağrı günü · yeşil ad = şartlara uyan aday (koyu yeşil: seçilen) · turuncu 08-16 · mor gece · yeşil 24 saat · gri izin']).font = { italic: true, size: 9, color: { argb: 'FF4B5A63' } };
  ms.getColumn(1).width = 24; ms.getColumn(2).width = 12; ms.getColumn(3 + nd).width = 7;
  const buf = await wb.xlsx.writeBuffer();
  if (downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `eksik-personel-${D.date}-${D.text.replace(/\s+/g, '')}.xlsx`) !== false) toast('Excel indirildi');
}

/* ---- Çağrı listesi sayfası ---- */
const CO_STATUS = { open: ['Açık', 'warn'], filled: ['Tamamlandı', 'success'], cancelled: ['İptal', ''] };
function coStatusBadge(c) {
  if (c.status === 'filled') return c.applied ? html`<span class="badge success">Listeye işlendi</span>` : html`<span class="badge info">Excel’e işlenecek</span>`;
  if (c.status === 'cancelled') return html`<span class="badge">${c.expired ? 'Süresi geçti' : 'İptal edildi'}</span>`;
  return html`<span class="badge warn">Açık</span>`;
}
function coItem(c, pub) {
  const k = c.counts || {};
  return html`<a class="mk-item co-item ${c.status === 'open' ? '' : 'closed'}" href="#/eksik/${c.id}">${mkDayBlock(c.date)}
    <div class="mk-main"><div class="mk-l1"><span class="code-chip tone-${c.shift === '24' ? 'emerald' : c.shift === 'night' ? 'indigo' : 'amber'}">${c.code}</span><b>${c.text}</b><span class="small">· ${c.need} kişi eksik</span></div>
      <div class="mk-l2 small muted">${[c.side_name, c.unit].filter(Boolean).join(' · ')}${pub && c.created_by ? ' · açan: ' + c.created_by : ''}</div>
      ${pub ? html`<div class="small">${k.asked || 0} kişiye soruldu · <b class="mk-ok">${k.yes || 0} gelebilir</b> · ${k.no || 0} gelemez${c.chosen && c.chosen.length ? html` · seçilen: <b>${c.chosen.map((x) => x.name).join(', ')}</b>` : ''}</div>`
        : html`<div class="small">${c.me ? coMeTxt(c, c.me) : ''}</div>`}
    </div><div class="mk-act">${coStatusBadge(c)}${icon('chevR', 'sm')}</div></a>`;
}
function coMeTxt(c, me) {
  if (me.chosen) return html`<span class="badge success">Seçildin</span>`;
  if (c.status !== 'open') return html`<span class="badge">Kapandı</span>`;
  return html`<span class="badge ${(CO_ANS[me.answer] || [])[1]}">${me.answer === 'asked' ? 'Yanıtın bekleniyor' : me.answer === 'yes' ? 'Gelebilirim dedin' : 'Gelemem dedin'}</span>`;
}
async function coListPage(view) {
  const pub = isPublisher();
  setHTML(view, html`<div class="page-head"><div><h1>Eksik personel</h1><p>${pub ? 'Eksik kalan vardiya için kurallara uyan kişilere sor, gönüllüler arasından seç' : 'Sana sorulan eksik personel çağrıları'}</p></div>
    ${pub ? html`<button class="btn primary" data-act="co-new">${icon('plus', 'sm')}<span>Yeni çağrı</span></button>` : ''}</div><div id="coBody">${mkSpin()}</div>`);
  let r;
  try { r = await api('callout.list'); } catch (e) { setHTML($('#coBody'), mkErr(e.message)); return; }
  const box = $('#coBody');
  if (!box) return;
  const today = ymd(new Date());
  const open = r.items.filter((c) => c.status === 'open' && c.date >= today);
  const todo = r.items.filter((c) => c.status === 'filled' && !c.applied);
  const rest = r.items.filter((c) => !open.includes(c) && !todo.includes(c));
  if (!r.items.length) {
    setHTML(box, html`<div class="card empty"><div class="e-ico">${icon('alert', 'lg')}</div><h3>${pub ? 'Henüz çağrı yok' : 'Sana sorulan bir çağrı yok'}</h3>
      <p class="small">${pub ? 'Bir vardiyada eksik olduğunda “Yeni çağrı” ile uygun kişileri listeleyip sorabilirsin.' : 'Bir vardiyada eksik olur ve sana sorulursa burada ve bildirimlerde görürsün.'}</p></div>`);
    return;
  }
  const sec = (t, list) => (list.length ? html`<div class="sec-title mk-sec">${t} <span class="faint">(${list.length})</span></div><div class="card mk-list">${list.map((c) => coItem(c, pub))}</div>` : '');
  setHTML(box, html`${sec('Açık çağrılar', open)}${pub ? sec('Excel’e işlenecek', todo) : ''}${sec(pub ? 'Geçmiş' : 'Önceki çağrılar', pub ? rest : [...todo, ...rest])}`);
}
ACT['co-new'] = () => openCalloutModal({});

/* ---- Çağrı sayfası ---- */
async function coDetailPage(view, id) {
  setHTML(view, html`<div class="page-head"><div><a class="small" href="#/eksik">${icon('chevL', 'sm')} Eksik personel</a><h1>Eksik personel çağrısı</h1></div></div><div id="coBody">${mkSpin()}</div>`);
  let r;
  try { r = await api('callout.get', { id }); } catch (e) { setHTML($('#coBody'), mkErr(e.message)); return; }
  const box = $('#coBody');
  if (!box) return;
  const c = r.callout;
  const shiftChip = html`<span class="code-chip big tone-${c.shift === '24' ? 'emerald' : c.shift === 'night' ? 'indigo' : 'amber'}">${c.code}</span>`;
  const headCard = html`<div class="card card-pad co-head">${shiftChip}<div class="grow"><div class="co-h-d">${dateLabel(c.date)}</div>
      <div class="co-h-s"><b>${c.text}</b> · ${c.need} kişi eksik${c.side_name ? ' · ' + c.side_name : ''}${c.unit ? ' · ' + c.unit : ''}</div>
      ${c.note ? html`<div class="mk-note">“${c.note}”</div>` : ''}</div><div class="co-h-st">${coStatusBadge(c)}</div></div>`;
  if (!r.pub) {
    const me = r.me;
    let body;
    if (me.chosen) body = html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span><b>Seçildin.</b> ${me.move_from ? `${mkShort(me.move_from)} nöbetin ${mkShort(c.date)} gününe kayıyor.` : `${mkShort(c.date)} ${c.text} nöbetine geliyorsun.`} Sorumlu Excel’e işleyince takvimine eklenir.</span></div>`;
    else if (c.status !== 'open') body = html`<div class="mk-box">${icon('info', 'sm')}<span>Bu çağrı kapandı. ${me.answer === 'yes' ? 'Gönüllü olduğun için teşekkürler!' : ''}</span></div>`;
    else {
      body = html`${me.move_from ? html`<div class="mk-box info">${icon('history', 'sm')}<span>${mkShort(me.move_from)} nöbetini ${mkShort(c.date)} gününe kaydırman soruluyor.</span></div>` : ''}
        ${me.answer === 'yes' ? html`<div class="mk-box ok">${icon('check', 'sm')}<span>“Gelebilirim” dedin. Sorumlu seçerse sana haber vereceğiz.</span></div>`
          : me.answer === 'no' ? html`<div class="mk-box">${icon('x', 'sm')}<span>“Gelemem” dedin.</span></div>` : html`<p class="co-q">Gelebilir misin?</p>`}
        <div class="co-ans">${me.answer !== 'yes' ? html`<button class="btn primary" data-act="co-ans" data-id="${c.id}" data-y="1">${icon('check', 'sm')}Gelebilirim</button>` : ''}
          ${me.answer !== 'no' ? html`<button class="btn" data-act="co-ans" data-id="${c.id}" data-y="0">${icon('x', 'sm')}Gelemem</button>` : ''}</div>`;
    }
    setHTML(box, html`<div class="stack co-member">${headCard}${body}<p class="tiny faint">${icon('lock', 'sm')} Yanıtını yalnız sen ve sorumlular görür.</p></div>`);
    return;
  }
  const resp = r.resp || [];
  const open = c.status === 'open';
  const respRow = (x) => {
    const [t, tone] = CO_ANS[x.answer] || [x.answer, ''];
    return html`<div class="list-row co-resp">${avatar(x.name, 'sm')}<div class="grow"><div class="lr-t">${x.name}${x.user_id ? '' : html` <span class="badge">hesabı yok</span>`}</div>
      <div class="lr-s">${x.move_from ? `${mkShort(x.move_from)} nöbetini kaydırarak · ` : ''}${x.answered_at ? fmtRel(x.answered_at) + ' yanıtladı' : fmtRel(x.created_at) + ' soruldu'}</div></div>
      <div class="mk-act">${x.chosen ? html`<span class="badge brand">${icon('check', 'sm')}Seçildi</span>` : html`<span class="badge ${tone}">${t}</span>`}
        ${open && !x.chosen && x.answer === 'yes' ? html`<button class="btn sm primary" data-act="co-choose" data-id="${c.id}" data-r="${x.id}" data-n="${x.name}">Seç</button>` : ''}
        ${open && !x.chosen && !x.user_id && x.answer === 'asked' ? html`<button class="btn sm" data-act="co-ans" data-id="${c.id}" data-r="${x.id}" data-y="1" title="Telefonla sordunuz: gelebilir">Gelebilir</button><button class="btn sm ghost" data-act="co-ans" data-id="${c.id}" data-r="${x.id}" data-y="0">Gelemez</button>` : ''}
        ${x.phone && x.answer === 'asked' ? html`<a class="btn sm icon ghost" href="${telLink(x.phone)}" aria-label="Ara">${icon('phone', 'sm')}</a>` : ''}</div></div>`;
  };
  const chosenTxt = (c.chosen || []).map((x) => x.name + (x.move_from ? ` (${mkShort(x.move_from)} nöbeti ${mkShort(c.date)} gününe kayacak)` : '')).join(', ');
  setHTML(box, html`<div class="stack">${headCard}
    ${c.status === 'filled' ? html`<div class="mk-box ${c.applied ? 'ok' : 'info'}">${icon(c.applied ? 'checkCircle' : 'table', 'sm')}<span>${c.applied ? html`<b>Listeye işlendi:</b> ${chosenTxt}` : html`<b>Excel’e işlenecek:</b> ${chosenTxt} · ${mkShort(c.date)} ${c.text}. Excel güncellenince kendiliğinden “listeye işlendi” olur.`}</span></div>` : ''}
    <div class="card"><div class="card-head"><div><h3>${icon('users', 'sm')} Yanıtlar (${resp.length})</h3><div class="tiny faint">${icon('lock', 'sm')} Yanıtları yalnız sorumlular ve kişinin kendisi görür</div></div>
      ${open ? html`<button class="btn sm ghost danger" data-act="co-cancel" data-id="${c.id}">Çağrıyı iptal et</button>` : ''}</div>
      <div class="list">${resp.length ? resp.map(respRow) : html`<div class="list-row small muted">Henüz kimseye sorulmadı. Aşağıdan aday seçip sorabilirsin.</div>`}</div></div>
    ${(c.draws || []).length ? html`<div class="tiny faint">${icon('star', 'sm')} Kura kayıtları: ${c.draws.map((d) => `${mkDT(d.at)} · ${d.by}: ${d.picked} (eşitler: ${d.group.join(', ')})`).join(' — ')}</div>` : ''}
    ${open ? html`<div class="co-bar"><h3>Adaylar</h3><span class="grow"></span><button class="btn sm" data-act="co-xlsx" data-host="coPagePanel">${icon('download', 'sm')}<span>Excel indir</span></button><button class="btn sm primary" id="coAskBtn" data-act="co-ask" data-id="${c.id}" disabled>${icon('send', 'sm')}<span>Seçilenlere de sor</span></button></div>
      <div id="coPagePanel"></div>`
      : html`<div class="co-bar"><span class="grow"></span><button class="btn sm" data-act="co-xlsx" data-host="coPagePanel">${icon('download', 'sm')}<span>Adaylar ve ay çizelgesi (Excel)</span></button></div><div id="coPagePanel" class="hidden"></div>`}
  </div>`);
  const host = $('#coPagePanel');
  coPanelInit(host, {
    id: c.id, locked: c.filters, need: () => Math.max(1, c.need - (c.counts.chosen || 0)),
    onSel: () => { const b = $('#coAskBtn'); if (b) { const n = host.__co.sel.size; b.disabled = !n; b.lastElementChild.textContent = n ? `Seçilenlere de sor (${n})` : 'Seçilenlere de sor'; } },
  });
  coPanelLoad(host);
}
ACT['co-ans'] = (el) => busy(el, async () => {
  const yes = el.dataset.y === '1';
  try {
    await api('callout.answer', { id: +el.dataset.id, yes, resp_id: el.dataset.r ? +el.dataset.r : undefined });
    toast(el.dataset.r ? 'Yanıt kaydedildi' : yes ? 'Teşekkürler! Sorumluya iletildi' : 'Yanıtın kaydedildi');
    if (location.hash.startsWith('#/eksik')) route(); else mkReloadAny();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['co-choose'] = async (el) => {
  if (!(await confirmDialog({ title: `${el.dataset.n} seçilsin mi?`, text: 'Kişiye ve sorumlulara “Excel’e işlenecek” bildirimi gider. Gereken sayı dolunca diğerlerine teşekkür mesajı gider.', ok: 'Seç' }))) return;
  try { const r = await api('callout.choose', { id: +el.dataset.id, resp_id: +el.dataset.r }); toast(r.filled ? 'Seçildi · çağrı tamamlandı' : 'Seçildi'); route(); } catch (e) { toast(e.message, 'err'); }
};
ACT['co-ask'] = (el) => busy(el, async () => {
  const P = ($('#coPagePanel') || {}).__co;
  if (!P || !P.sel.size) return;
  try { const r = await api('callout.ask', { id: +el.dataset.id, asks: [...P.sel.values()] }); toast(`${r.asked} kişiye soruldu`); route(); } catch (e) { toast(e.message, 'err'); }
});
ACT['co-cancel'] = async (el) => {
  if (!(await confirmDialog({ title: 'Çağrı iptal edilsin mi?', text: 'Sorulan ve seçilmemiş kişilere “gelmene gerek yok” bildirimi gider.', ok: 'İptal et', danger: true }))) return;
  try { await api('callout.cancel', { id: +el.dataset.id }); toast('Çağrı iptal edildi'); route(); } catch (e) { toast(e.message, 'err'); }
};

/* =================================================================== */
/* Değişim ve ilan geçmişi (yalnız sorumlular)                          */
/* =================================================================== */
const HIST = { month: '', type: 'all', state: '', q: '', items: [] };
const HIST_TYPE = { swap: ['Değişim', 'violet'], give: ['Devir', 'indigo'], listing: ['İlan', 'sky'], callout: ['Eksik çağrısı', 'rose'] };
const HIST_STATE = { open: ['Açık', 'warn'], waiting: ['Excel’e işlenecek', 'info'], applied: ['Listeye işlendi', 'success'], closed: ['Kapandı', ''] };
const HIST_RAW = {
  pending: 'yanıt bekliyor', accepted: 'kabul edildi', declined: 'reddedildi', cancelled: 'iptal', applied: 'uygulandı', expired: 'süresi geçti',
  open: 'açık', taken: 'alındı', filled: 'tamamlandı',
};
function histText(x) {
  const c = (d, code) => html`<b>${mkShort(d)}</b>${code ? html` <span class="faint">(${code})</span>` : ''}`;
  if (x.type === 'swap') return html`<b>${x.who}</b> ${c(x.date, x.code)} ⇄ <b>${x.with}</b> ${c(x.date2, x.code2)}`;
  if (x.type === 'give') return html`<b>${x.who}</b> ${c(x.date, x.code)} → <b>${x.with}</b>`;
  if (x.type === 'listing') {
    return html`<b>${x.who}</b> ${c(x.date, x.code)} ${x.kind === 'swap' ? 'değişmek için' : 'devretmek için'} ilana koydu${x.with ? html` → <b>${x.with}</b> aldı${x.date2 ? html` (karşılığında ${c(x.date2, x.code2)})` : ''}` : ''}`;
  }
  return html`${c(x.date)} ${x.text} · ${x.need} kişi eksik${x.unit ? ' (' + x.unit + ')' : ''}${x.with ? html` → <b>${x.with}</b>` : ''}`;
}
function histSub(x) {
  const bits = [];
  if (x.roster) bits.push(x.roster);
  if (x.type === 'listing') bits.push(`${x.count || 0} başvuru`);
  if (x.type === 'callout') bits.push(`açan: ${x.who || '—'} · ${x.count || 0} kişiye soruldu, ${x.yes || 0} gelebilir`);
  bits.push('durum: ' + (HIST_RAW[x.status] || x.status) + (x.sub ? ' / değişim: ' + (HIST_RAW[x.sub] || x.sub) : ''));
  bits.push('oluşturma ' + mkDT(x.created_at));
  if (x.applied_at) bits.push('listeye işlendi ' + mkDT(x.applied_at));
  return bits.join(' · ');
}
async function histPage(view) {
  if (!HIST.month) HIST.month = ymd(new Date()).slice(0, 7);
  setHTML(view, html`<div class="page-head"><div><h1>Değişim geçmişi</h1><p>Değişim, devir, ilan ve eksik çağrısı kayıtları · ${icon('lock', 'sm')} yalnız sorumlular görür</p></div>
    <div class="row"><button class="btn" data-act="hist-xlsx">${icon('download', 'sm')}<span>Excel</span></button><button class="btn" data-act="hist-csv">${icon('file', 'sm')}<span>CSV</span></button></div></div>
    <div class="hist-tools">
      <input class="input hist-month" type="month" data-change="hist-f" data-k="month" value="${HIST.month}" aria-label="Ay">
      <div class="seg" role="tablist">${[['all', 'Tümü'], ['swap', 'Değişim'], ['give', 'Devir'], ['listing', 'İlan'], ['callout', 'Çağrı']].map(([k, l]) => html`<button class="${HIST.type === k ? 'on' : ''}" data-act="hist-type" data-t="${k}">${l}</button>`)}</div>
      <select class="select hist-state" data-change="hist-f" data-k="state" aria-label="Durum"><option value="">Tüm durumlar</option>${Object.entries(HIST_STATE).map(([k, [l]]) => html`<option value="${k}" ${HIST.state === k ? raw('selected') : ''}>${l}</option>`)}</select>
      <input class="input hist-q" type="search" placeholder="Kişi ara" data-input="hist-q" value="${HIST.q}" aria-label="Kişi ara">
    </div>
    <div id="histBody">${mkSpin()}</div>`);
  histLoad();
}
async function histLoad() {
  try { const r = await api('history.list', { month: HIST.month, type: HIST.type, q: HIST.q }); HIST.items = r.items; } catch (e) { setHTML($('#histBody'), mkErr(e.message)); return; }
  histDraw();
}
function histFiltered() { return HIST.items.filter((x) => !HIST.state || x.state === HIST.state); }
function histDraw() {
  const box = $('#histBody');
  if (!box) return;
  const list = histFiltered();
  const [y, m] = HIST.month.split('-').map(Number);
  const by = {}; list.forEach((x) => { by[x.type] = (by[x.type] || 0) + 1; });
  setHTML(box, list.length ? html`<div class="mk-sum small muted">${TR_MONTHS[m - 1]} ${y}: ${list.length} kayıt${Object.keys(by).length > 1 ? ' · ' + Object.entries(by).map(([k, n]) => `${n} ${HIST_TYPE[k][0].toLocaleLowerCase('tr')}`).join(', ') : ''}</div>
    <div class="card mk-list">${list.map((x) => {
      const [tl, tt] = HIST_TYPE[x.type];
      const [sl, stn] = HIST_STATE[x.state] || [x.state, ''];
      return html`<div class="mk-item hist-item">${mkDayBlock(x.date)}<div class="mk-main"><div class="mk-l1"><span class="badge tone-${tt}">${tl}</span><span class="badge ${stn}">${sl}</span></div>
        <div class="small hist-t">${histText(x)}</div>${x.note && x.note !== 'Nöbet ilanından' ? html`<div class="mk-note">“${x.note}”</div>` : ''}<div class="tiny faint">${histSub(x)}</div></div>
        ${x.type === 'callout' ? html`<div class="mk-act"><a class="btn sm ghost" href="#/eksik/${x.id}">Aç</a></div>` : ''}</div>`;
    })}</div>`
    : html`<div class="card empty"><div class="e-ico">${icon('history', 'lg')}</div><h3>Kayıt yok</h3><p class="small">${TR_MONTHS[m - 1]} ${y} için seçilen ölçütlerde değişim, ilan ya da çağrı bulunamadı.</p></div>`);
}
ACT['hist-type'] = (el) => { HIST.type = el.dataset.t; $$('[data-act=hist-type]').forEach((b) => b.classList.toggle('on', b === el)); histLoad(); };
CHANGE['hist-f'] = (el) => { HIST[el.dataset.k] = el.value; if (el.dataset.k === 'month') { if (!/^\d{4}-\d{2}$/.test(el.value)) return; histLoad(); } else histDraw(); };
const histQ = debounce(() => histLoad(), 300);
CHANGE['hist-q'] = (el) => { HIST.q = el.value.trim(); histQ(); };
function histRows() {
  return histFiltered().map((x) => [HIST_TYPE[x.type][0], x.date, x.type === 'callout' ? `${x.text} (${x.code})` : x.code, x.who || '', x.with || '', x.date2 || '', x.code2 || '',
    (HIST_STATE[x.state] || [x.state])[0], HIST_RAW[x.status] || x.status, x.roster || '', x.type === 'callout' ? `${x.need} kişi eksik · ${x.count} soruldu · ${x.yes} gelebilir` : x.type === 'listing' ? `${x.count} başvuru` : '',
    x.note || '', x.created_at || '', x.closed_at || '', x.applied_at || '']);
}
const HIST_COLS = ['Tür', 'Tarih', 'Vardiya / kod', 'Kişi (açan)', 'Karşı taraf / alan / seçilen', 'Karşı gün', 'Karşı kod', 'Durum', 'Ayrıntılı durum', 'Liste', 'Bilgi', 'Not', 'Oluşturma', 'Karar / kapanış', 'Listeye işlenme'];
ACT['hist-csv'] = () => {
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const txt = '﻿' + [HIST_COLS, ...histRows()].map((r) => r.map(q).join(';')).join('\r\n');
  if (downloadBlob(new Blob([txt], { type: 'text/csv;charset=utf-8' }), `degisim-gecmisi-${HIST.month}.csv`) !== false) toast('CSV indirildi');
};
ACT['hist-xlsx'] = (el) => busy(el, async () => {
  try {
    await loadVendor('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Geçmiş', { views: [{ state: 'frozen', ySplit: 2 }] });
    const [y, m] = HIST.month.split('-').map(Number);
    ws.mergeCells(1, 1, 1, HIST_COLS.length);
    ws.getCell(1, 1).value = `${S.settings.org_name || ''} — Değişim, ilan ve çağrı geçmişi · ${TR_MONTHS[m - 1]} ${y}`;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    const hr = ws.addRow(HIST_COLS);
    hr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B7A75' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    histRows().forEach((r) => ws.addRow(r));
    [12, 11, 14, 22, 30, 11, 9, 16, 14, 20, 26, 26, 17, 17, 17].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: HIST_COLS.length } };
    const buf = await wb.xlsx.writeBuffer();
    if (downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `degisim-gecmisi-${HIST.month}.xlsx`) !== false) toast('Excel indirildi');
  } catch (e) { toast('Excel oluşturulamadı: ' + e.message, 'err'); }
});
