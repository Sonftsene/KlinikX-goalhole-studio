/* dupcii — ek özellikler: bildirim merkezi, nöbetlerim, bugün nöbette, rehber, parmak izi girişi,
   şablonlar, davetler/QR, okuma raporu, işlem günlüğü, yedekleme, belge metni çıkarma */
'use strict';

/* =================================================================== */
/* Ortak yardımcılar                                                    */
/* =================================================================== */
const DAY_MS = 86400000;
function dateLabel(d) {
  const dt = parseDT(d);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - t) / DAY_MS);
  const base = `${dt.getDate()} ${TR_MONTHS[dt.getMonth()]} ${TR_DAYS[dt.getDay()]}`;
  return diff === 0 ? 'Bugün · ' + base : diff === 1 ? 'Yarın · ' + base : diff === -1 ? 'Dün · ' + base : base;
}
function shiftTime(s) { return s.start && s.end ? `${s.start}–${s.end}` : ''; }
function shiftTone(s) {
  if (s.kind === 'leave') return 'slate';
  if (s.kind === 'off') return 'slate';
  if (s.kind === 'role') return 'teal';
  if (s.hours >= 24 || (s.start && s.end && s.start === s.end)) return 'emerald';
  if (s.start && s.end && s.end <= s.start) return 'indigo';
  return 'amber';
}
function telLink(p) { return p ? 'tel:' + String(p).replace(/[^0-9+]/g, '') : ''; }
function waNumber(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '9' + d;
  else if (d.length === 10) d = '90' + d;
  return d;
}

/* =================================================================== */
/* Bildirim merkezi                                                     */
/* =================================================================== */
function notifButtonHtml() {
  return html`<button class="btn ghost icon notif-btn" data-act="notifs" aria-label="Bildirimler" id="notifBtn">${icon('bell')}<span class="count notif-count hidden" id="notifCount"></span></button>`;
}
function updateNotifBadge() {
  const el = $('#notifCount');
  if (!el) return;
  const n = (S.counts && S.counts.notif_unread) || 0;
  el.textContent = n > 99 ? '99+' : n;
  el.classList.toggle('hidden', !n);
}
let NOTIF_OFF = null;
function closeNotifPop() {
  const p = $('.notif-pop'); if (p) p.remove();
  if (NOTIF_OFF) { document.removeEventListener('click', NOTIF_OFF, true); NOTIF_OFF = null; }
}
ACT.notifs = async (el) => {
  if ($('.notif-pop')) return closeNotifPop();
  const pop = document.createElement('div');
  pop.className = 'notif-pop';
  pop.innerHTML = fmtVal(html`<div class="np-head"><b>Bildirimler</b><button class="btn sm ghost" data-act="notif-readall">Tümünü okundu say</button></div><div class="np-list"><div style="padding:24px;display:grid;place-items:center"><div class="spinner"></div></div></div>`);
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect();
  if (window.innerWidth > 900) { pop.style.top = (r.bottom + 8) + 'px'; pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; }
  const off = (e) => { if (!pop.contains(e.target) && !e.target.closest('[data-act=notifs]')) closeNotifPop(); };
  NOTIF_OFF = off;
  setTimeout(() => { if (NOTIF_OFF === off) document.addEventListener('click', off, true); }, 0);
  let items = [];
  try { items = (await api('notif.list')).items; } catch (e) { /* çevrimdışı */ }
  const list = pop.querySelector('.np-list');
  if (!list) return;
  const today = ymd(new Date()), weekAgo = ymd(new Date(Date.now() - 6 * DAY_MS));
  const grp = (n) => (n.at.slice(0, 10) >= today ? 'Bugün' : n.at.slice(0, 10) >= weekAgo ? 'Bu hafta' : 'Daha eski');
  let lastG = '';
  setHTML(list, items.length ? items.map((n) => html`${grp(n) !== lastG ? html`<div class="np-sec">${(lastG = grp(n))}</div>` : ''}<button class="np-item ${n.read ? '' : 'unread'}" data-act="notif-open" data-id="${n.id}" data-url="${n.url || '#/'}">
      <span class="np-ico tone-${{ roster: 'emerald', shift: 'indigo', remind: 'amber', review: 'rose', post: 'teal', digest: 'sky' }[n.kind] || 'slate'}">${icon({ roster: 'table', shift: 'calendar', remind: 'clock', review: 'alert', post: 'megaphone', digest: 'sun', pending_post: 'inbox', pending_user: 'users' }[n.kind] || 'bell', 'sm')}</span>
      <span class="grow" style="min-width:0"><span class="np-t">${n.title}</span>${n.body ? html`<span class="np-b">${n.body}</span>` : ''}<span class="np-at">${fmtRel(n.at)}</span></span>
      ${n.read ? '' : html`<span class="dot"></span>`}
    </button>`)
    : html`<div class="empty" style="padding:30px 16px"><div class="e-ico">${icon('bell', 'lg')}</div><p class="small">Henüz bildiriminiz yok.</p></div>`);
};
ACT['notif-open'] = async (el) => {
  closeNotifPop();
  try { await api('notif.read', { id: +el.dataset.id }); } catch (e) { /* */ }
  const url = el.dataset.url || '#/';
  if (location.hash === url) route(); else location.hash = url;
  refreshCounts();
};
ACT['notif-readall'] = async () => {
  try { await api('notif.read', {}); } catch (e) { /* */ }
  closeNotifPop();
  S.counts.notif_unread = 0;
  updateNotifBadge();
};

/* =================================================================== */
/* Nöbet kodları: her yerde aynı renk ve açıklama                       */
/* =================================================================== */
/** Yöneticinin düzenlediği kod sözlüğü (yoksa varsayılan) */
function shiftDict() { const d = S.settings && S.settings.shift_codes; return Array.isArray(d) && d.length ? d : SHIFT_CODES_DEFAULT; }
const hmShort = (t) => (t && t.endsWith(':00') ? t.slice(0, 2) : t || '');
/** "24 saat · 08–08", "Gündüz · 08–16", "Yıllık izin" */
function shiftDesc(s) {
  if (!s) return '';
  const lab = s.label && s.label !== s.code ? s.label : s.kind === 'leave' ? 'İzin' : '';
  const t = s.start && s.end ? `${hmShort(s.start)}–${hmShort(s.end)}` : '';
  return [lab, t].filter(Boolean).join(' · ');
}
function codeChip(s, big) { return html`<span class="code-chip tone-${shiftTone(s)} ${big ? 'big' : ''}" title="${shiftDesc(s)}">${s.code}</span>`; }

/* =================================================================== */
/* Ana sayfa: "Bugün" kartı, kim nöbette, ipuçları                       */
/* =================================================================== */
const MY = { entries: null, at: 0 };
async function loadMyShifts(force) {
  if (!force && MY.entries && Date.now() - MY.at < 60000) return MY;
  try {
    const r = await api('shifts.my');
    Object.assign(MY, r, { at: Date.now() });
  } catch (e) { if (!MY.entries) MY.entries = []; }
  return MY;
}
function nextShift(entries) {
  const now = new Date();
  const today = ymd(now);
  const hmNow = hm(now);
  return (entries || []).filter((s) => s.kind === 'shift').find((s) => {
    if (s.date > today) return true;
    if (s.date < today) return false;
    if (!s.end || !s.start) return true;
    return s.end <= s.start || hmNow < s.end;
  }) || null;
}
/** Şu an süren nöbet (dün başlayan gece/24 saat dahil) */
function currentShift(entries) {
  const now = new Date(), today = ymd(now), yest = ymd(new Date(now.getTime() - DAY_MS)), t = hm(now);
  return (entries || []).find((e) => e.kind === 'shift' && e.start && e.end && (
    (e.date === today && t >= e.start && (e.end <= e.start || t < e.end))
    || (e.date === yest && e.end <= e.start && t < e.end))) || null;
}
function daysUntil(d) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseDT(d) - t) / DAY_MS); }

function heroHtml() {
  const c = S.counts;
  const first = S.me.name.split(' ')[0];
  const now = new Date();
  const pend = (c.pending_posts || 0) + (isAdmin() ? c.pending_users || 0 : 0);
  return html`<section class="hero">
    <div class="hero-head"><div><h1>${greeting()}, ${first}</h1><p>${now.getDate()} ${TR_MONTHS[now.getMonth()]} ${now.getFullYear()}, ${TR_DAYS[now.getDay()]}</p></div></div>
    <a class="hero-shift" id="heroShift" href="#/nobetim"><span class="hs-ico tone-slate">${icon('calendar')}</span><span class="grow"><span class="skel" style="display:block;height:18px;width:62%"></span><span class="skel" style="display:block;height:13px;width:40%;margin-top:8px"></span></span></a>
    <div class="hero-chips">
      <a class="hchip ${c.todo ? 'warn' : 'ok'}" href="#/okunacak">${icon(c.todo ? 'alert' : 'checkCircle', 'sm')}${c.todo ? html`<span>Okuman gereken <b data-count="todo">${c.todo}</b></span>` : html`<span>Okunacak yok</span>`}</a>
      <button class="hchip ${c.unread ? 'brand' : ''}" data-act="feed-filter" data-filter="unread">${icon('bell', 'sm')}<span>Yeni <b data-count="unread">${c.unread}</b></span></button>
      ${isPublisher() && pend ? html`<a class="hchip danger" href="${c.pending_posts ? '#/yonetim/onaylar' : '#/yonetim/kullanicilar'}">${icon('inbox', 'sm')}<span>Onay bekleyen <b>${pend}</b></span></a>` : ''}
      <a class="hchip" href="#/rehber">${icon('users', 'sm')}<span>Kim nöbette</span></a>
      <a class="hchip" href="#/telefon">${icon('phone', 'sm')}<span>Telefon rehberi</span></a>
    </div>
  </section>`;
}
function heroShiftHtml(my) {
  const box = (tone, ic, t, sub) => html`<span class="hs-ico tone-${tone}">${icon(ic)}</span><span class="grow" style="min-width:0"><span class="hs-t">${t}</span><span class="hs-s">${sub}</span></span>${icon('chevR', 'sm')}`;
  if (!my.has_data) return box('slate', 'table', 'Nöbet listesi bekleniyor', 'Liste yüklenince nöbetlerin burada görünür.');
  const ent = my.entries || [];
  if (!ent.length) return box('slate', 'search', 'Listede adın bulunamadı', `Portaldaki adın (“${S.me.name}”) listedekiyle aynı olmalı.`);
  const y = new Date().getFullYear(), mo = new Date().getMonth() + 1;
  const monthList = ent.filter((e) => e.date.startsWith(`${y}-${pad(mo)}`));
  const sm = monthList.length && typeof summarizeMonth === 'function' ? summarizeMonth(monthList, y, mo) : null;
  const monthTxt = sm ? ` · Bu ay ${sm.shifts} nöbet, ${sm.hours} saat` : '';
  const cur = currentShift(ent);
  if (cur) return box(shiftTone(cur), 'clock', 'Şu an nöbettesin', html`${codeChip(cur)} ${shiftDesc(cur)} · ${cur.end}’de bitiyor`);
  const n = nextShift(ent);
  if (!n) return box('slate', 'calendar', 'Yakında nöbetin görünmüyor', 'Önümüzdeki günlerde listede nöbetin yok' + monthTxt);
  const d = daysUntil(n.date);
  const t = d <= 0 ? (n.start ? `Bugün ${n.start}’de nöbetin başlıyor` : 'Bugün nöbetin var') : d === 1 ? 'Yarın nöbetin var' : `${d} gün sonra nöbetin var`;
  return box(shiftTone(n), 'calendar', t, html`${codeChip(n)} ${dateLabel(n.date).replace(/^(Bugün|Yarın) · /, '')} · ${shiftDesc(n)}${monthTxt}`);
}
async function loadHomeExtras() {
  const [my, day] = await Promise.all([loadMyShifts(true), api('shifts.day', { date: ymd(new Date()) }).catch(() => null)]);
  const k = $('#heroShift');
  if (k) setHTML(k, heroShiftHtml(my));
  const tc = $('#todayCard');
  if (tc && day) setHTML(tc, todayCardHtml(day, true));
  const tips = $('#homeTips');
  if (tips) setHTML(tips, await homeTipsHtml());
  const sb = $('#setupBox');
  if (sb) mountSetupBox(sb);
}
function relDayShort(d) {
  const diff = daysUntil(d);
  const dt = parseDT(d);
  return diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : `${dt.getDate()} ${TR_MONTHS_S[dt.getMonth()]} ${TR_DAYS_S[dt.getDay()]}`;
}
function dutyPerson(p) {
  return html`<span class="duty-chip">${avatar(p.name, 'sm')}<span class="ellipsis">${p.name}</span>${p.phone ? html`<a class="duty-call" href="${telLink(p.phone)}" aria-label="${p.name} ara">${icon('phone', 'sm')}</a>` : ''}</span>`;
}
/** Bir günün nöbetçileri (vardiyaya göre gruplu) */
function dutyListHtml(day, compact) {
  if (!day.has_data) return html`<div class="list-row small muted">Nöbet listesi yüklendiğinde burada görünür.</div>`;
  const shifts = day.groups.filter((g) => g.kind === 'shift' || g.kind === 'role');
  // Önceki günün gece / 24 saat nöbetçileri yalnızca BUGÜN ve nöbetleri henüz bitmemişse gösterilir
  // (başka günlere bakarken önceki günün kişileri o güne kaymış gibi görünmesin)
  const nowHm = hm(new Date());
  const carry = day.date === ymd(new Date()) ? (day.carry || []).filter((p) => p.end && nowHm < p.end) : [];
  if (!shifts.length && !carry.length) return html`<div class="list-row small muted">Bu gün için nöbet kaydı yok.</div>`;
  const ends = [...new Set(carry.map((p) => p.end))].sort();
  return html`<div class="duty">
    ${shifts.map((g) => html`<div class="duty-g"><div class="duty-h">${codeChip(g)}<b>${shiftDesc(g)}</b><span class="tiny faint">${g.people.length} kişi</span></div>
      <div class="duty-p">${g.people.map(dutyPerson)}</div></div>`)}
    ${carry.length ? html`<div class="duty-g duty-carry"><div class="duty-h"><span class="code-chip tone-slate">Dün</span><b>Dünkü nöbetten çıkıyor</b><span class="tiny faint">${ends.join(', ')}’e kadar</span></div><div class="duty-p">${carry.map(dutyPerson)}</div></div>` : ''}
  </div>`;
}
function todayCardHtml(day, compact) {
  return html`<div class="card-head"><h3>${icon('users', 'sm')} ${day.date === ymd(new Date()) ? 'Bugün nöbette' : dateLabel(day.date)}</h3><a class="small" href="#/rehber">Tümü</a></div>${dutyListHtml(day, compact)}`;
}
async function homeTipsHtml() {
  const tips = [];
  let dismissed = {};
  try { dismissed = JSON.parse(localStorage.getItem('nm-tips') || '{}'); } catch (e) { /* */ }
  if (!dismissed.passkey && passkeySupported() && !window.NM_DEMO_API) {
    try { if (!(await api('passkey.list')).items.length) tips.push(['passkey', 'fingerprint', 'Parmak izi / Face ID ile giriş', 'Şifre yazmadan tek dokunuşla girin.', 'Ekle', 'pk-add']); } catch (e) { /* */ }
  }
  if (!dismissed.push && typeof pushState === 'function' && S.settings.push_ready) {
    try { const st = await pushState(); if (st === 'off') tips.push(['push', 'bell', 'Telefon bildirimlerini açın', 'Duyuru ve nöbet hatırlatmaları anında gelsin.', 'Aç', 'push-on']); } catch (e) { /* */ }
  }
  if (!dismissed.phone && !S.me.phone) tips.push(['phone', 'phone', 'Rehbere telefonunuzu ekleyin', 'Ekip sizi nöbetteyken tek dokunuşla arayabilsin.', 'Ekle', 'go-profile']);
  if (!tips.length) return '';
  return html`<div class="card tips">${tips.map(([k, ic, t, d, b, act]) => html`<div class="tip"><span class="cat-ico sm tone-teal">${icon(ic)}</span><div class="grow"><b class="small">${t}</b><div class="tiny faint">${d}</div></div><button class="btn sm primary" data-act="${act}">${b}</button><button class="btn sm icon ghost" data-act="tip-hide" data-k="${k}" aria-label="Gizle">${icon('x', 'sm')}</button></div>`)}</div>`;
}
ACT['tip-hide'] = (el) => {
  try { const d = JSON.parse(localStorage.getItem('nm-tips') || '{}'); d[el.dataset.k] = 1; localStorage.setItem('nm-tips', JSON.stringify(d)); } catch (e) { /* */ }
  el.closest('.tip').remove();
};
ACT['go-profile'] = () => { location.hash = '#/profil'; };

/* =================================================================== */
/* Nöbet sayfası: Takvimim · Kim nöbette · Excel liste                  */
/* =================================================================== */
const HUB_HREF = { cal: '#/nobetim', who: '#/rehber', list: '#/nobet' };
function hubHref() { try { return HUB_HREF[localStorage.getItem('nm-hub')] || '#/nobetim'; } catch (e) { return '#/nobetim'; } }
function hubTabs(active) {
  try { localStorage.setItem('nm-hub', active); } catch (e) { /* */ }
  const t = (k, ic, l) => html`<a class="${active === k ? 'on' : ''}" href="${HUB_HREF[k]}" role="tab" aria-selected="${active === k ? 'true' : 'false'}">${icon(ic, 'sm')}<span>${l}</span></a>`;
  return html`<nav class="hub-tabs" role="tablist" aria-label="Nöbet">${t('cal', 'calendar', 'Takvimim')}${t('who', 'users', 'Kim nöbette')}${t('list', 'table', 'Excel liste')}</nav>`;
}
function hubHead(active, sub, actions) {
  return html`<div class="page-head hub-head"><div><h1>Nöbet</h1><p>${sub}</p></div>${actions || ''}</div>${hubTabs(active)}`;
}

const CAL = { y: 0, m: 0, sel: null };
async function renderMyShifts(view) {
  setHTML(view, html`${hubHead('cal', html`<b>${S.me.name}</b> adıyla listelerdeki nöbetlerin`, html`<button class="btn" data-act="ics" id="icsBtn" disabled>${icon('calendar', 'sm')}<span>Telefon takvimine ekle</span></button>`)}
    <div id="myBody"><div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>`);
  const my = await loadMyShifts(true);
  const body = $('#myBody');
  if (!body) return;
  if (!CAL.y) { const d = new Date(); CAL.y = d.getFullYear(); CAL.m = d.getMonth() + 1; CAL.sel = ymd(d); }
  const entries = my.entries || [];
  const n = nextShift(entries);
  const cur = currentShift(entries);
  const top = cur || n;
  setHTML(body, html`
    ${!my.has_data ? html`<div class="card empty"><div class="e-ico">${icon('table', 'lg')}</div><h3>Henüz nöbet listesi yok</h3><p class="small">Yöneticiniz Excel nöbet listesini yüklediğinde nöbetleriniz burada takvim olarak görünür.</p></div>`
    : !entries.length ? html`<div class="card empty"><div class="e-ico">${icon('search', 'lg')}</div><h3>Listelerde adınız bulunamadı</h3><p class="small">Nöbet listesindeki adınız portaldaki adınızla (“${S.me.name}”) aynı olmalı. Farklıysa Hesabım sayfasından adınızı düzeltin.</p><a class="btn" href="#/nobet" style="margin-top:12px">${icon('table', 'sm')}Excel listeye bak</a></div>`
    : html`
      ${top ? html`<div class="next-shift tone-${shiftTone(top)}"><div class="ns-l">${cur ? 'Şu an nöbettesin' : 'Sıradaki nöbetin'}</div><div class="ns-d">${cur ? `${cur.end}’de bitiyor` : dateLabel(top.date)}</div>
        <div class="ns-c">${codeChip(top, true)}<span>${shiftDesc(top)}${top.hours && !/saat/i.test(top.label || '') ? html` · <b>${top.hours} saat</b>` : ''}</span></div><div class="ns-r">${top.roster || ''}</div></div>` : ''}
      <div class="cal-wrap"><div class="card cal-card" id="calCard"></div><div class="card" id="dayPanel"></div></div>`}`);
  $('#icsBtn').disabled = !entries.some((e) => e.kind === 'shift' && e.date >= ymd(new Date()));
  drawCalendar();
  loadDayPanel();
}
function drawCalendar() {
  const box = $('#calCard');
  if (!box) return;
  const { y, m } = CAL;
  const byDate = {};
  (MY.entries || []).forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const today = ymd(new Date());
  const pre = `${y}-${pad(m)}`;
  const monthList = (MY.entries || []).filter((e) => e.date.startsWith(pre));
  const sm = monthList.length && typeof summarizeMonth === 'function' ? summarizeMonth(monthList, y, m) : null;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="cal-d empty" aria-hidden="true"></span>`);
  for (let d = 1; d <= days; d++) {
    const ds = `${pre}-${pad(d)}`;
    const list = byDate[ds] || [];
    const main = list.find((e) => e.kind === 'shift') || list[0];
    cells.push(html`<button type="button" class="cal-d ${main ? 'has tone-' + shiftTone(main) : ''} ${ds === today ? 'today' : ''} ${ds === CAL.sel ? 'sel' : ''}" data-act="cal-day" data-d="${ds}" aria-label="${dateLabel(ds)}${main ? ' · ' + main.code + ' ' + shiftDesc(main) : ''}"><span class="cd-n">${d}</span>${main ? html`<span class="cd-c">${main.code}</span>` : ''}</button>`);
  }
  const used = new Map();
  monthList.forEach((e) => used.set(e.kind + '|' + e.code, e));
  setHTML(box, html`<div class="cal-head"><button type="button" class="btn sm icon" data-act="cal-mv" data-d="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b>${TR_MONTHS[m - 1]} ${y}</b><button type="button" class="btn sm icon" data-act="cal-mv" data-d="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button></div>
    ${sm ? html`<div class="stat-row cal-stats"><div><b>${sm.shifts}</b><span>nöbet</span></div><div><b>${sm.hours}</b><span>saat</span></div>
      <div><b class="${sm.overtime > 0 ? 'pos' : ''}">${sm.overtime > 0 ? '+' : ''}${Math.abs(sm.overtime)}</b><span>${sm.overtime < 0 ? 'eksik saat' : 'fazla mesai'}</span></div><div><b>${sm.leaveDays}</b><span>izin günü</span></div></div>`
      : html`<p class="tiny faint cal-none">Bu ay için listede nöbetiniz yok.</p>`}
    <div class="cal-grid" role="grid">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => html`<span class="cal-w">${w}</span>`)}${cells}</div>
    ${used.size ? html`<div class="cal-legend">${[...used.values()].map((e) => html`<span>${codeChip(e)}<span>${shiftDesc(e) || (e.kind === 'role' ? 'Görev' : e.kind === 'leave' ? 'İzin' : 'Nöbet')}</span></span>`)}</div>` : ''}`);
}
ACT['cal-day'] = (el) => { CAL.sel = el.dataset.d; drawCalendar(); loadDayPanel(); if (window.innerWidth < 900) { const p = $('#dayPanel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } };
ACT['cal-mv'] = (el) => {
  const d = new Date(CAL.y, CAL.m - 1 + +el.dataset.d, 1);
  CAL.y = d.getFullYear(); CAL.m = d.getMonth() + 1;
  // Seçili gün de yeni aya geçsin (bu aysa bugün, değilse ilk nöbet günü ya da ayın 1'i)
  const pre = `${CAL.y}-${pad(CAL.m)}`;
  const today = ymd(new Date());
  const first = (MY.entries || []).filter((e) => e.date.startsWith(pre)).map((e) => e.date).sort()[0];
  CAL.sel = today.startsWith(pre) ? today : first || `${pre}-01`;
  drawCalendar();
  loadDayPanel();
};
async function loadDayPanel() {
  const box = $('#dayPanel');
  if (!box || !CAL.sel) return;
  const mine = (MY.entries || []).filter((e) => e.date === CAL.sel);
  const head = html`<div class="card-head"><h3>${dateLabel(CAL.sel)}</h3></div>`;
  const mineHtml = mine.length ? html`<div class="day-mine">${mine.map((e) => html`<div class="dm-row">${codeChip(e, true)}<div class="grow"><b>${shiftDesc(e) || e.code}</b><div class="tiny faint">${[e.hours && !/saat/i.test(e.label || '') ? e.hours + ' saat' : '', e.roster].filter(Boolean).join(' · ')}</div></div></div>`)}</div>`
    : html`<div class="list-row small muted">Bu gün nöbetiniz yok.</div>`;
  setHTML(box, html`${head}${mineHtml}<div class="sec-label">O gün nöbette olanlar</div><div id="dayDuty"><div class="list-row"><div class="skel" style="height:14px;width:60%"></div></div></div>`);
  const want = CAL.sel;
  let day = null;
  try { day = await api('shifts.day', { date: want }); } catch (e) { /* */ }
  const dd = $('#dayDuty');
  if (dd && CAL.sel === want) setHTML(dd, day ? dutyListHtml(day, false) : html`<div class="list-row small muted">Yüklenemedi.</div>`);
}
ACT.ics = () => {
  const today = ymd(new Date());
  const list = (MY.entries || []).filter((s) => s.date >= today && s.kind === 'shift');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const addDay = (d) => { const x = parseDT(d); x.setDate(x.getDate() + 1); return ymd(x); };
  // RFC 5545: virgül, noktalı virgül, ters bölü ve satır sonu kaçışlı
  const icsText = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
  const ev = list.map((s) => {
    const st = s.start || '08:00', en = s.end || '16:00';
    const endDate = en <= st ? addDay(s.date) : s.date;
    const uid = `nobetmed-${S.me.id}-${s.roster_id || 0}-${s.date}-${String(s.code).replace(/[^\w]/g, '')}@nobetmed`;
    return ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`,
      `DTSTART:${s.date.replace(/-/g, '')}T${st.replace(':', '')}00`, `DTEND:${endDate.replace(/-/g, '')}T${en.replace(':', '')}00`,
      `SUMMARY:${icsText(`${s.code} nöbet${s.label && s.label !== s.code ? ' – ' + s.label : ''}`)}`, `DESCRIPTION:${icsText(s.roster || '')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', 'DESCRIPTION:Yarın nöbetiniz var', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//dupcii//TR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Nöbetlerim', ...ev, 'END:VCALENDAR'].join('\r\n');
  if (downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'nobetlerim.ics') !== false) toast('Takvim dosyası indirildi. Açınca telefonunuzun takvimine eklenir.');
};

/* =================================================================== */
/* Nöbet listesinden nöbetleri çıkar (yayıncı yüklediğinde/gördüğünde)  */
/* =================================================================== */
async function syncRosterShifts(roster, model) {
  if (!isPublisher() || !roster || !roster.file || !model || typeof extractShifts !== 'function') return;
  if (roster.parsed_file_id === roster.file.id && !roster._reparse) return;
  roster._reparse = false;
  let res;
  try { res = extractShifts(model, { dict: shiftDict(), fileName: roster.file.name, uploadedAt: roster.file.updated_at, year: roster._year, month: roster._month }); } catch (e) { return; }
  if (!res || !res.ok || !res.entries.length) return;
  const period = `${res.year}-${pad(res.month)}`;
  try {
    const r = await api('rosters.shifts', { roster_id: roster.id, file_id: roster.file.id, period, entries: res.entries });
    Object.assign(roster, { parsed_file_id: roster.file.id, period, parsed_count: r.saved });
    if (RS.active === roster.id) drawRosterInfo();
    MY.at = 0;
  } catch (e) { /* sessiz */ }
}
function periodLabel(p) { if (!p) return ''; const [y, m] = p.split('-').map(Number); return `${TR_MONTHS[m - 1]} ${y}`; }
ACT['rs-period'] = async () => {
  const r = rosterById(RS.active);
  if (!r) return;
  const cur = r.period || ymd(new Date()).slice(0, 7);
  const m = openModal({ title: 'Listenin ayı', size: 'narrow', body: html`<form class="stack" id="perForm"><p class="small muted">Nöbetlerim ve hatırlatmalar bu aya göre hesaplanır. Excel’de ay bilgisi bulunamadıysa buradan düzeltin.</p>
      <div class="grid2"><div class="field"><label>Ay</label><select class="select" name="m">${TR_MONTHS.map((n, i) => html`<option value="${i + 1}" ${+cur.slice(5) === i + 1 ? raw('selected') : ''}>${n}</option>`)}</select></div>
      <div class="field"><label>Yıl</label><input class="input" type="number" name="y" value="${cur.slice(0, 4)}" min="2020" max="2099"></div></div></form>`,
  foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-ok>Kaydet</button>` });
  m.el.querySelector('[data-ok]').addEventListener('click', async (e) => busy(e.currentTarget, async () => {
    const f = m.el.querySelector('#perForm');
    const period = `${f.y.value}-${pad(+f.m.value)}`;
    try {
      await api('rosters.period', { id: r.id, period });
      r.period = period; m.close(); drawRosterInfo(); MY.at = 0; toast('Listenin ayı güncellendi');
      // Ay değişince gün sayısı da değişebilir: listeyi yeni aya göre yeniden oku
      if (r.file) { Object.assign(r, { _year: +f.y.value, _month: +f.m.value, _reparse: true }); loadSheetModel(r.file).then((model) => syncRosterShifts(r, model)).catch(() => {}); }
    } catch (err) { toast(err.message, 'err'); }
  }));
};

/* =================================================================== */
/* Kim nöbette + ekip rehberi                                           */
/* =================================================================== */
const DIR = { people: null, q: '', filter: 'all' };
const DUTY = { day: null };
async function renderDirectory(view) {
  if (!DUTY.day) DUTY.day = ymd(new Date());
  setHTML(view, html`${hubHead('who', 'Hangi gün kim nöbette, ekibe tek dokunuşla ulaşın')}
    <div class="card" id="dutyCard"><div class="list-row"><div class="skel" style="height:14px;width:60%"></div></div></div>
    <div class="sec-title">${icon('phone', 'sm')} Ekip rehberi</div>
    <div class="toolbar"><div class="search" style="max-width:340px;flex:1">${icon('search')}<input class="input" placeholder="İsim, ünvan veya birim ara" data-input="dir-q" value="${DIR.q}"></div>
      <div class="seg"><button class="${DIR.filter === 'all' ? 'on' : ''}" data-act="dir-f" data-f="all">Herkes</button><button class="${DIR.filter === 'today' ? 'on' : ''}" data-act="dir-f" data-f="today">Bugün nöbette</button></div></div>
    <div id="dirList"><div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div></div></div>`);
  try { DIR.people = (await api('people.list')).people; } catch (e) { DIR.people = DIR.people || []; }
  syncPeopleAvatars(DIR.people);
  drawDirectory();
  loadDuty();
}
async function loadDuty() {
  const box = $('#dutyCard');
  if (!box) return;
  const want = DUTY.day;
  let day = null;
  try { day = await api('shifts.day', { date: want }); } catch (e) { setHTML(box, html`<div class="list-row small muted">${e.message}</div>`); return; }
  if (want !== DUTY.day || !$('#dutyCard')) return;
  setHTML(box, html`<div class="card-head duty-nav"><button class="btn sm icon" data-act="duty-day" data-d="-1" aria-label="Önceki gün">${icon('chevL', 'sm')}</button>
      <button class="btn sm ghost grow" data-act="duty-today"><b>${dateLabel(DUTY.day)}</b></button>
      <button class="btn sm icon" data-act="duty-day" data-d="1" aria-label="Sonraki gün">${icon('chevR', 'sm')}</button></div>
    ${dutyListHtml(day, false)}`);
}
ACT['duty-day'] = (el) => { const d = parseDT(DUTY.day); d.setDate(d.getDate() + +el.dataset.d); DUTY.day = ymd(d); loadDuty(); };
ACT['duty-today'] = () => { DUTY.day = ymd(new Date()); loadDuty(); };
/** Rehberden gelen güncel profil fotoğraflarını uygulamanın kişi listesine işle */
function syncPeopleAvatars(list) {
  if (!list || !list.length) return;
  const byId = new Map(list.map((p) => [p.id, p]));
  let changed = false;
  const next = (S.people || []).map((p) => { const n = byId.get(p.id); if (n && (n.avatar || null) !== (p.avatar || null)) { changed = true; return { ...p, avatar: n.avatar || null }; } return p; });
  if (changed) S.people = next;
}
function drawDirectory() {
  const box = $('#dirList');
  if (!box || !DIR.people) return;
  const q = avKey(DIR.q);
  const list = DIR.people.filter((p) => (DIR.filter !== 'today' || p.today) && (!q || avKey([p.name, titleName(p.title_id), unitName(p.unit_id), p.extension].join(' ')).includes(q)));
  setHTML(box, list.length ? html`<div class="card"><div class="list">${list.map((p) => html`<div class="list-row dir-row">
      ${avatar(p.name, '', p.avatar || null)}
      <div class="grow" style="min-width:0"><div class="lr-t">${p.name}${p.today ? html` ${codeChip(p.today)}` : ''}</div>
        <div class="lr-s">${[titleName(p.title_id), unitName(p.unit_id)].filter(Boolean).join(' · ')}${p.extension ? html` · Dahili <b>${p.extension}</b>` : ''}${p.phone ? html` · <span class="sel">${p.phone}</span>` : ''}</div></div>
      <div class="row" style="gap:4px">
        ${p.phone ? html`<a class="btn sm icon" href="${telLink(p.phone)}" aria-label="Ara" title="Ara">${icon('phone', 'sm')}</a><a class="btn sm icon" href="https://wa.me/${waNumber(p.phone)}" target="_blank" rel="noopener" aria-label="WhatsApp" title="WhatsApp">${icon('chat', 'sm')}</a>` : ''}
        <a class="btn sm icon" href="mailto:${p.email}" aria-label="E-posta" title="E-posta">${icon('mail', 'sm')}</a>
      </div></div>`)}</div></div>` : html`<div class="card empty"><p class="small">Eşleşen kişi yok.</p></div>`);
}
CHANGE['dir-q'] = debounce((el) => { DIR.q = el.value; drawDirectory(); }, 150);
ACT['dir-f'] = (el) => { DIR.filter = el.dataset.f; $$('[data-act=dir-f]').forEach((b) => b.classList.toggle('on', b === el)); drawDirectory(); };

/* =================================================================== */
/* Profil ekleri: iletişim, bildirim tercihi, parmak izi                */
/* =================================================================== */
/* =================================================================== */
/* Hesabım: profil, bildirimler, güvenlik, görünüm, gönderilerim         */
/* =================================================================== */
const PROF_TABS = [['profil', 'Profil', 'user'], ['bildirim', 'Bildirimler', 'bell'], ['guvenlik', 'Güvenlik', 'lock'], ['gorunum', 'Görünüm', 'sun'], ['gonderiler', 'Gönderilerim', 'file']];
const NMODE_HINT = { instant: 'Her duyuru ve güncellemede ayrı e-posta gelir.', digest: 'Her sabah tek e-postada: bugünkü nöbetiniz, yeni duyurular, okumanız gerekenler.', off: 'Duyuru e-postaları gelmez. Nöbet hatırlatmaları ve hesap e-postaları yine gelir.' };
function renderProfile(view) {
  const me = S.me;
  const r = currentRoute()[1];
  const tab = PROF_TABS.some(([k]) => k === r) ? r : 'profil';
  setHTML(view, html`
    <div class="prof-hero">
      <label class="prof-av" title="Profil fotoğrafını değiştir">${avatar(me.name, 'xl')}<span class="prof-av-edit">${icon('edit', 'sm')}</span><input type="file" accept="image/*" hidden data-change="av-file"></label>
      <div class="grow" style="min-width:0"><h1 class="ellipsis">${me.name}</h1>
        <div class="small muted">${[titleName(me.title_id), unitName(me.unit_id)].filter(Boolean).join(' · ') || me.email}</div>
        <div class="row wrap" style="gap:6px;margin-top:8px"><span class="badge ${me.role === 'admin' ? 'brand' : me.role === 'editor' ? 'info' : ''}">${ROLE_LABEL[me.role]}</span>${me.phone ? html`<span class="badge">${icon('phone')}${me.phone}</span>` : ''}</div></div>
    </div>
    <nav class="seg prof-tabs" role="tablist">${PROF_TABS.map(([k, l, ic]) => html`<a class="${tab === k ? 'on' : ''}" href="#/profil/${k}" role="tab">${icon(ic, 'sm')}<span>${l}</span></a>`)}</nav>
    <div class="prof-body" id="profBody">${profileTabHtml(tab)}</div>`);
  if (tab === 'gonderiler') mountFeed($('#feedHost'), { filter: 'mine', fixed: true });
  if (tab === 'bildirim' || tab === 'guvenlik') mountProfileExtras();
}
function profileTabHtml(tab) {
  const me = S.me;
  if (tab === 'profil') return html`
    <div class="card card-pad stack">
      <h3 class="ph">Profil fotoğrafı</h3>
      <div class="row wrap" style="gap:16px">${avatar(me.name, 'xl')}
        <div class="stack" style="gap:8px;flex:1;min-width:200px">
          <div class="row wrap" style="gap:8px"><label class="btn primary">${icon('upload', 'sm')}${me.avatar ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}<input type="file" accept="image/*" hidden data-change="av-file"></label>
            ${me.avatar ? html`<button class="btn" data-act="av-remove">${icon('trash', 'sm')}Kaldır</button>` : ''}</div>
          <p class="tiny faint">Telefonun kamerasından veya galeriden seçebilirsiniz. Kare olarak kırpılır; yalnızca giriş yapmış ekip üyeleri görür.</p>
        </div></div>
    </div>
    <form class="card card-pad stack" data-form="me-profile">
      <h3 class="ph">Kişisel bilgiler</h3>
      <div class="field"><label>Ad soyad</label><input class="input" name="name" value="${me.name}" required minlength="3" maxlength="120" autocomplete="name">
        <p class="hint">Nöbet listesindeki yazılışla aynı olsun; nöbetleriniz adınıza göre eşleşir.</p></div>
      <div class="grid2">
        <div class="field"><label>Ünvan</label><select class="select" name="title_id">${options(S.titles, me.title_id, '—')}</select></div>
        <div class="field"><label>Birim</label><input class="input" value="${unitName(me.unit_id) || '—'}" disabled><p class="hint">Birimi yönetici değiştirir.</p></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Cep telefonu</label><input class="input" name="phone" type="tel" value="${me.phone || ''}" placeholder="05xx xxx xx xx" autocomplete="tel"></div>
        <div class="field"><label>Dahili</label><input class="input" name="extension" value="${me.extension || ''}" placeholder="1234" maxlength="12"></div>
      </div>
      <p class="tiny faint">Telefon ve dahili, ekip rehberinde yalnızca giriş yapmış ekip üyelerine görünür.</p>
      <div class="form-error hidden" data-err></div>
      <div><button class="btn primary" type="submit">Kaydet</button></div>
    </form>
    <form class="card card-pad stack" data-form="me-email">
      <h3 class="ph">E-posta adresi</h3>
      <p class="small muted">Giriş ve bildirimler için kullanılır. Şu anki adres: <b>${me.email}</b></p>
      ${me.has_password ? html`<div class="grid2"><div class="field"><label>Yeni e-posta</label><input class="input" type="email" name="email" required autocomplete="email"></div>
        <div class="field"><label>Şifreniz</label>${pwField('current', 'Onay için', 'current-password')}</div></div>
        <div class="form-error hidden" data-err></div><div><button class="btn" type="submit">E-postayı değiştir</button></div>`
        : html`<p class="tiny faint">E-postanızı değiştirmek için önce <a href="#/profil/guvenlik">Güvenlik</a> bölümünden bir şifre belirleyin.</p>`}
    </form>`;
  if (tab === 'bildirim') return html`
    <div class="card card-pad stack">
      <h3 class="ph">E-posta bildirimleri</h3>
      <div class="seg seg-block">${[['instant', 'Anlık'], ['digest', 'Sabah özeti'], ['off', 'Kapalı']].map(([k, l]) => html`<button class="${(me.notify_mode || 'instant') === k ? 'on' : ''}" data-act="nmode" data-m="${k}">${l}</button>`)}</div>
      <p class="tiny faint" id="nmodeHint">${NMODE_HINT[me.notify_mode || 'instant']}</p>
    </div>
    <div class="card card-pad stack"><h3 class="ph">Telefon bildirimleri</h3><div id="pushBox"><p class="tiny faint">${S.settings.push_ready ? 'Yükleniyor…' : 'Telefon bildirimleri bu sitede kapalı.'}</p></div></div>`;
  if (tab === 'guvenlik') return html`
    <form class="card card-pad stack" data-form="me-pw">
      <h3 class="ph">${me.has_password ? 'Şifre değiştir' : 'Şifre belirle'}</h3>
      ${me.has_password ? html`<div class="field"><label>Mevcut şifre</label>${pwField('current', '', 'current-password')}</div>` : html`<p class="tiny faint">Google ile giriş yapıyorsunuz. İsterseniz e-posta ile giriş için şifre belirleyebilirsiniz.</p>`}
      <div class="field"><label>Yeni şifre</label>${pwField('password', 'En az 8 karakter', 'new-password')}</div>
      <div class="form-error hidden" data-err></div>
      <div><button class="btn primary" type="submit">Şifreyi kaydet</button></div>
    </form>
    <div class="card card-pad stack" id="pkBox"><h3 class="ph">Parmak izi / Face ID ile giriş</h3><div class="tiny faint">Yükleniyor…</div></div>
    <div class="card card-pad"><button class="btn danger" data-act="logout">${icon('logout', 'sm')}Çıkış yap</button></div>`;
  if (tab === 'gorunum') return appearanceCardHtml();
  return html`<div class="card"><div style="padding:14px" id="feedHost"></div></div>`;
}
/** Profil/ad değişince menü, üst çubuk ve listelerde güncel görünsün */
function refreshMeEverywhere() {
  const p = (S.people || []).find((x) => x.id === S.me.id);
  if (p) Object.assign(p, { name: S.me.name, avatar: S.me.avatar || null, title_id: S.me.title_id });
  S.people = (S.people || []).slice();
  renderNav();
  const t = $('#topMe'); if (t) setHTML(t, avatar(S.me.name, 'sm'));
  if (currentRoute()[0] === 'profil') renderProfile($('#view'));
}
FORMS['me-profile'] = (f) => submitForm(f, async (d) => {
  const before = S.me.name;
  await api('me.update', { name: d.name.trim(), title_id: d.title_id ? +d.title_id : null, phone: d.phone, extension: d.extension });
  Object.assign(S.me, { name: d.name.trim(), title_id: d.title_id ? +d.title_id : null, phone: d.phone || null, extension: d.extension || null });
  if (before !== S.me.name) MY.at = 0;
  refreshMeEverywhere();
  toast('Profiliniz kaydedildi');
});
FORMS['me-email'] = (f) => submitForm(f, async (d) => {
  const r = await api('me.email', { email: d.email, current: d.current });
  S.me.email = r.email;
  refreshMeEverywhere();
  toast('E-posta adresiniz değiştirildi. Bundan sonra bu adresle giriş yapın.');
});

/** Seçilen fotoğrafı kare kırpıp küçültür (en fazla 512 px, ~150 KB JPEG) */
async function makeAvatarData(file) {
  if (!file) throw new Error('Fotoğraf seçilmedi.');
  if (file.size > 40 * 1048576) throw new Error('Fotoğraf çok büyük.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
    try { bmp = await createImageBitmap(file); } catch (e2) { throw new Error('Bu fotoğraf açılamadı. JPG veya PNG bir fotoğraf deneyin.'); }
  }
  const side = Math.min(bmp.width, bmp.height);
  const size = Math.min(512, side);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  let q = 0.86;
  let data = cv.toDataURL('image/jpeg', q);
  while (data.length > 450000 && q > 0.4) { q -= 0.15; data = cv.toDataURL('image/jpeg', q); }
  return data;
}
CHANGE['av-file'] = async (el) => {
  const file = el.files && el.files[0];
  el.value = '';
  if (!file) return;
  let data;
  try { data = await makeAvatarData(file); } catch (e) { toast(e.message, 'err'); return; }
  const m = openModal({ title: 'Profil fotoğrafı', size: 'narrow', body: html`<div class="av-preview"><img src="${data}" alt="Önizleme"></div><p class="small muted" style="text-align:center;margin-top:10px">Fotoğrafınız böyle görünecek.</p>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-ok>Kaydet</button>` });
  m.el.querySelector('[data-ok]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const r = await api('me.avatar', { data });
      S.me.avatar = r.avatar;
      m.close();
      refreshMeEverywhere();
      toast('Profil fotoğrafınız kaydedildi');
    } catch (err) { toast(err.message, 'err'); }
  }));
};
ACT['av-remove'] = async () => {
  if (!(await confirmDialog({ title: 'Fotoğraf kaldırılsın mı?', text: 'Yerine adınızın baş harfleri görünür.', ok: 'Kaldır', danger: true }))) return;
  try { await api('me.avatar', { remove: true }); S.me.avatar = null; refreshMeEverywhere(); toast('Profil fotoğrafı kaldırıldı'); } catch (e) { toast(e.message, 'err'); }
};

async function mountProfileExtras() {
  // telefon bildirimi
  const pb = $('#pushBox');
  if (pb) {
    if (!S.settings.push_ready || typeof pushSupportInfo !== 'function') setHTML(pb, html`<p class="tiny faint">Telefon bildirimleri bu sitede kapalı.</p>`);
    else {
      const info = pushSupportInfo();
      const st = info.ok ? await pushState() : 'unsupported';
      setHTML(pb, html`<div class="row between wrap" style="gap:8px">
        <div><div class="small muted">${st === 'on' ? 'Bu cihazda açık.' : st === 'denied' ? 'Tarayıcı ayarlarından bildirim izni verin.' : info.ok ? 'Duyuru ve nöbet hatırlatmaları bu cihaza anında gelir.' : info.reason}</div></div>
        ${st === 'on' ? html`<div class="row" style="gap:6px"><button class="btn sm" data-act="push-test">Dene</button><button class="btn sm" data-act="push-off">Kapat</button></div>` : info.ok && st !== 'denied' ? html`<button class="btn sm primary" data-act="push-on">Aç</button>` : ''}
      </div>`);
    }
  }
  // parmak izi
  const pk = $('#pkBox');
  if (pk) {
    if (!passkeySupported()) { setHTML(pk, html`<h3 style="font-size:14.5px">Parmak izi / Face ID ile giriş</h3><p class="tiny faint">Bu tarayıcı veya bağlantı desteklemiyor (HTTPS gerekir).</p>`); return; }
    let items = [];
    try { items = (await api('passkey.list')).items; } catch (e) { /* */ }
    setHTML(pk, html`<h3 style="font-size:14.5px">Parmak izi / Face ID ile giriş</h3>
      ${items.length ? html`<div class="list" style="border:1px solid var(--border);border-radius:10px">${items.map((x) => html`<div class="list-row"><span class="cat-ico sm tone-emerald">${icon('fingerprint')}</span><div class="grow"><div class="lr-t">${x.name || 'Cihaz'}</div><div class="lr-s">${x.last_used_at ? 'Son kullanım ' + fmtRel(x.last_used_at) : 'Eklendi ' + fmtRel(x.created_at)}</div></div><button class="btn sm icon ghost danger" data-act="pk-del" data-id="${x.id}" aria-label="Kaldır">${icon('trash', 'sm')}</button></div>`)}</div>` : html`<p class="tiny faint">Şifre yazmadan, telefonunuzun parmak izi veya yüz tanımasıyla tek dokunuşla girin.</p>`}
      <button class="btn" data-act="pk-add">${icon('fingerprint', 'sm')}${items.length ? 'Bu cihazı da ekle' : 'Bu cihaza ekle'}</button>`);
  }
}
ACT.nmode = async (el) => {
  const m = el.dataset.m;
  try {
    await api('me.update', { notify_mode: m });
    S.me.notify_mode = m;
    $$('[data-act=nmode]').forEach((b) => b.classList.toggle('on', b === el));
    const h = $('#nmodeHint');
    if (h) h.textContent = NMODE_HINT[m];
    toast('Bildirim tercihiniz kaydedildi');
  } catch (e) { toast(e.message, 'err'); }
};
ACT['push-on'] = (el) => busy(el, async () => {
  try {
    if (window.NM_DEMO_API) { toast('Önizlemede telefon bildirimi açılamaz; sitenizde çalışır.'); return; }
    await pushEnable();
    toast('Telefon bildirimleri açıldı');
    const tip = el.closest('.tip'); if (tip) tip.remove();
    mountProfileExtras();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['push-off'] = (el) => busy(el, async () => { try { await pushDisable(); toast('Telefon bildirimleri kapatıldı'); mountProfileExtras(); } catch (e) { toast(e.message, 'err'); } });
ACT['push-test'] = (el) => busy(el, async () => { try { await api('push.test'); toast('Deneme bildirimi gönderildi'); } catch (e) { toast(e.message, 'err'); } });

/* ---------------- Parmak izi (WebAuthn) istemcisi ---------------- */
function b64uToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
function bufToB64u(buf) {
  const b = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function passkeySupported() { return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials); }
function passkeyErr(e) {
  if (e && e.name === 'NotAllowedError') return new Error('İşlem iptal edildi veya süresi doldu.');
  if (e && e.name === 'InvalidStateError') return new Error('Bu cihaz zaten kayıtlı.');
  if (e && e.name === 'SecurityError') return new Error('Güvenli bağlantı (HTTPS) gerekli.');
  return e instanceof Error ? e : new Error(String(e));
}
async function passkeyAdd() {
  const o = (await api('passkey.reg.begin')).publicKey;
  const publicKey = { ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: b64uToBuf(c.id) })) };
  let cred;
  try { cred = await navigator.credentials.create({ publicKey }); } catch (e) { throw passkeyErr(e); }
  return api('passkey.reg.finish', { id: cred.id, rawId: bufToB64u(cred.rawId), clientDataJSON: bufToB64u(cred.response.clientDataJSON), attestationObject: bufToB64u(cred.response.attestationObject) });
}
async function passkeySignIn() {
  const o = (await api('passkey.login.begin')).publicKey;
  const publicKey = { ...o, challenge: b64uToBuf(o.challenge), allowCredentials: [] };
  let cred;
  try { cred = await navigator.credentials.get({ publicKey }); } catch (e) { throw passkeyErr(e); }
  const r = cred.response;
  return api('passkey.login.finish', { id: cred.id, rawId: bufToB64u(cred.rawId), clientDataJSON: bufToB64u(r.clientDataJSON), authenticatorData: bufToB64u(r.authenticatorData), signature: bufToB64u(r.signature), userHandle: r.userHandle ? bufToB64u(r.userHandle) : '' });
}
ACT['pk-add'] = (el) => busy(el, async () => {
  if (window.NM_DEMO_API) { toast('Önizlemede parmak izi eklenemez; sitenizde çalışır.'); return; }
  try { await passkeyAdd(); toast('Parmak izi / Face ID eklendi. Bir dahaki girişte şifre gerekmez.'); const tip = el.closest('.tip'); if (tip) tip.remove(); mountProfileExtras(); } catch (e) { toast(e.message, 'err'); }
});
ACT['pk-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Kaldırılsın mı?', text: 'Bu cihazla parmak izi / Face ID girişi kapatılacak.', ok: 'Kaldır', danger: true }))) return;
  try { await api('passkey.delete', { id: +el.dataset.id }); mountProfileExtras(); toast('Kaldırıldı'); } catch (e) { toast(e.message, 'err'); }
};
ACT['pk-login'] = (el) => busy(el, async () => {
  try {
    const r = await passkeySignIn();
    await start();
    if (r.must_change) return;
  } catch (e) { toast(e.message, 'err'); }
});
function passkeyLoginButton() {
  return passkeySupported() && !window.NM_DEMO_API ? html`<button class="btn block" type="button" data-act="pk-login" style="height:44px">${icon('fingerprint')}Parmak izi / Face ID ile giriş</button><div class="divider">veya</div>` : '';
}

/* =================================================================== */
/* Duyuru şablonları ve geçerlilik tarihi (editör)                      */
/* =================================================================== */
let TPL = null;
async function composerExtras(form, post) {
  const box = form.querySelector('#tplBox');
  if (box && !post) {
    try { TPL = (await api('templates.list')).items; } catch (e) { TPL = TPL || []; }
    if (TPL.length) setHTML(box, html`<div class="tpl-row"><span class="tiny faint">Şablondan başla:</span>${TPL.map((t) => html`<button type="button" class="chip-btn" data-tpl="${t.id}">${t.title}</button>`)}
      ${isPublisher() ? html`<button type="button" class="chip-btn ghost" data-tpl-manage>${icon('sliders', 'sm')}</button>` : ''}</div>`);
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tpl]');
      if (b) {
        const t = TPL.find((x) => x.id === +b.dataset.tpl);
        if (!t) return;
        if (form.body.value.trim() && form.body.value !== t.body && !(await confirmDialog({ title: 'Şablon uygulansın mı?', text: 'Yazdığınız metin şablonla değiştirilecek.', ok: 'Şablonu uygula' }))) return;
        if (!form.title.value) form.title.value = t.title;
        form.body.value = t.body;
        form.dispatchEvent(new Event('input'));
        if (t.category_id) form.category_id.value = t.category_id;
        const rq = form.querySelector('[name=required]'); if (rq) rq.checked = t.required;
        form.body.focus();
        return;
      }
      if (e.target.closest('[data-tpl-manage]')) manageTemplates();
    });
  }
}
function composerExtraFields(post) {
  return html`<div class="field"><label>Geçerlilik / gözden geçirme tarihi <span class="faint">(isteğe bağlı)</span></label>
    <input class="input" type="date" name="review_at" value="${post && post.review_at ? post.review_at : ''}" style="max-width:220px">
    <p class="hint">Protokol ve formlar için: tarih yaklaşınca yöneticiye ve size hatırlatma gelir.</p></div>`;
}
ACT['tpl-save'] = async () => {
  const f = $('#composer');
  if (!f || !f.title.value.trim() || !f.body.value.trim()) { toast('Önce başlık ve metni yazın', 'err'); return; }
  try {
    TPL = (await api('templates.save', { title: f.title.value.trim(), body: f.body.value, category_id: +f.category_id.value || null, required: !!(f.required && f.required.checked) })).items;
    toast('Şablon kaydedildi');
  } catch (e) { toast(e.message, 'err'); }
};
function manageTemplates() {
  const m = openModal({ title: 'Duyuru şablonları', size: 'narrow' });
  const draw = () => m.setBody(html`<div class="card"><div class="list">${(TPL || []).map((t) => html`<div class="list-row"><div class="grow"><div class="lr-t">${t.title}</div><div class="lr-s ellipsis">${t.body.slice(0, 60)}</div></div><button class="btn sm icon ghost danger" data-tdel="${t.id}" aria-label="Sil">${icon('trash', 'sm')}</button></div>`)}</div></div><p class="tiny faint" style="margin-top:10px">Yeni şablon: editörde metni yazıp “Şablon olarak kaydet” deyin.</p>`);
  draw();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tdel]');
    if (!b) return;
    try { TPL = (await api('templates.delete', { id: +b.dataset.tdel })).items; draw(); } catch (err) { toast(err.message, 'err'); }
  });
}

/* =================================================================== */
/* Belge metnini çıkar (belge içinde arama için)                        */
/* =================================================================== */
async function extractDocText(buf, name) {
  const ext = extOf(name);
  try {
    if (ext === 'pdf') {
      await loadVendor('pdf');
      const lib = window.pdfjsLib;
      if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = new URL(VENDOR.pdfWorker, location.href).href;
      const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
      let out = '';
      for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        out += tc.items.map((x) => x.str).join(' ') + '\n';
        if (out.length > 400000) break;
      }
      return out;
    }
    if (ext === 'docx') { await loadVendor('mammoth'); return (await window.mammoth.extractRawText({ arrayBuffer: buf.slice(0) })).value; }
    if (['xlsx', 'xlsm', 'xls', 'ods', 'csv'].includes(ext)) {
      await loadVendor('xlsx');
      const wb = ext === 'csv' ? XLSX.read(decodeText(buf), { type: 'string' }) : XLSX.read(new Uint8Array(buf), { type: 'array' });
      return wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' ', blankrows: false })).join('\n');
    }
    if (['txt', 'md', 'log', 'json', 'xml'].includes(ext)) return decodeText(buf);
  } catch (e) { /* metin çıkarılamadı */ }
  return '';
}
async function indexAttachmentText(att, file) {
  if (!att || !att.id || window.NM_DEMO_API) return;
  if (!['pdf', 'docx', 'xlsx', 'xlsm', 'xls', 'ods', 'csv', 'txt', 'md', 'log', 'json', 'xml'].includes(extOf(att.name))) return;
  try {
    const buf = file ? await file.arrayBuffer() : await fetchBuffer(att.url);
    const text = await extractDocText(buf, att.name);
    await api('attachments.text', { id: att.id, text: text || '' });
  } catch (e) { /* sessiz */ }
}

/* =================================================================== */
/* WhatsApp ile paylaş                                                  */
/* =================================================================== */
ACT['wa-share'] = () => {
  const p = DETAIL && DETAIL.post;
  if (!p) return;
  const text = `📢 ${p.title}\n${appBaseUrl()}#/p/${p.id}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
};

/* =================================================================== */
/* Davetler: QR ile kayıt ve nöbet listesinden toplu hesap               */
/* =================================================================== */
function qrSvg(text, size = 220) {
  if (!window.qrcode) return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / (n + 8);
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${(c + 4) * cell},${(r + 4) * cell}h${cell}v${cell}h-${cell}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#0f1b21"/></svg>`;
}
ACT['inv-qr'] = async () => {
  const m = openModal({ title: 'QR kodla kayıt', body: html`<form class="stack" id="qrForm">
      <p class="small muted">Servise asacağınız QR kodu okutan kişi kayıt formuna gider. Bağlantı 30 gün geçerlidir.</p>
      <div class="field"><label>Birim</label><select class="select" name="unit_id">${options(S.units, (S.units[0] || {}).id, 'Seçmesine izin ver')}</select></div>
      <label class="switch"><input type="checkbox" name="auto_approve"><span class="track"></span><span class="s-text"><b>Onay beklemeden giriş yapabilsin</b><span>Kapalıysa her başvuruyu siz onaylarsınız (önerilir).</span></span></label>
    </form><div id="qrOut"></div>`,
  foot: html`<button class="btn" data-act="close-modal">Kapat</button><button class="btn primary" data-qr-make>QR kod oluştur</button>` });
  m.el.querySelector('[data-qr-make]').addEventListener('click', async (e) => { const btn = e.currentTarget; let made = false; await busy(btn, async () => {
    const f = m.el.querySelector('#qrForm');
    try {
      try { await loadVendor('qrcode'); } catch (err) { throw new Error('QR kod hazırlanamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'); }
      const r = await api('invites.general', { unit_id: +f.unit_id.value || null, auto_approve: f.auto_approve.checked, days: 30 });
      const url = r.invite.url;
      setHTML(m.el.querySelector('#qrOut'), html`<div class="qr-card" id="qrPrint">
        <div class="qr-org">${S.settings.org_name}</div><div class="qr-svg">${raw(qrSvg(url, 240))}</div>
        <div class="qr-t">Portala katılmak için okutun</div><div class="qr-s">Telefon kamerasıyla QR kodu okutun, kayıt formunu doldurun.</div></div>
        <div class="row wrap" style="margin-top:10px"><input class="input" readonly value="${url}"><button class="btn icon" data-copy="${url}" aria-label="Kopyala">${icon('copy')}</button>
        <button class="btn" data-act="qr-print">${icon('printer', 'sm')}Yazdır</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent('Portala katılmak için: ' + url)}" target="_blank" rel="noopener">${icon('chat', 'sm')}WhatsApp</a></div>`);
      made = true;
      m.el.querySelector('#qrOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { toast(err.message, 'err'); }
  }); if (made) btn.textContent = 'Yeni kod oluştur'; });
  m.el.addEventListener('click', async (e) => { const c = e.target.closest('[data-copy]'); if (c) toast((await copyText(c.dataset.copy)) ? 'Bağlantı kopyalandı' : 'Kopyalanamadı'); });
};
ACT['qr-print'] = () => {
  if (window.NM_DEMO_API) { toast('Önizlemede yazdırma kapalıdır; sitenizde çalışır.'); return; }
  const card = $('#qrPrint');
  if (!card) return;
  const w = window.open('', '_blank', 'width=600,height=800');
  if (!w) return toast('Açılır pencere engellendi', 'err');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>QR</title><style>body{font-family:Inter,Arial,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0}.qr-card{text-align:center;border:2px solid #0b7a75;border-radius:24px;padding:40px 48px}.qr-org{font-weight:700;font-size:22px;margin-bottom:16px}.qr-svg svg{width:340px;height:340px}.qr-t{font-weight:700;font-size:24px;margin-top:16px}.qr-s{color:#555;margin-top:6px}</style>${card.outerHTML}`);
  w.document.close();
  // Açılan pencere sayfanın güvenlik kuralını devralır; yazdırmayı buradan başlat
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { /* */ } }, 350);
};
ACT['inv-roster'] = async () => {
  const m = openModal({ title: 'Nöbet listesinden hesap aç', size: 'wide', body: html`<div style="display:grid;place-items:center;padding:30px"><div class="spinner"></div></div>` });
  let items = [];
  try { items = (await api('invites.candidates')).items; } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  if (!items.length) { m.setBody(html`<div class="empty"><div class="e-ico">${icon('users', 'lg')}</div><h3>Eklenecek kimse yok</h3><p class="small">Nöbet listelerindeki herkesin zaten hesabı var ya da henüz liste okunmadı. Listeyi bir kez açmanız yeterli.</p></div>`); return; }
  m.setBody(html`<p class="small muted" style="margin-bottom:12px">Nöbet listelerinde adı geçen ama hesabı olmayan <b>${items.length}</b> kişi. E-posta yazdıklarınıza davet e-postası gider; boş bıraktıklarınız için kişiye özel bağlantı oluşur (WhatsApp’tan gönderebilirsiniz). Davetle gelenler onay beklemeden girer.</p>
    <div class="row wrap" style="margin-bottom:10px"><label class="small"><input type="checkbox" id="invAll" checked> Tümünü seç</label><span class="grow"></span>
      <span class="tiny faint">Birim:</span><select class="select" id="invUnit" style="width:auto;height:34px">${options(S.units, (S.units[0] || {}).id)}</select></div>
    <div class="table-wrap"><table class="t inv-t"><thead><tr><th></th><th>Ad soyad</th><th>Ünvan</th><th>E-posta (isteğe bağlı)</th></tr></thead>
    <tbody>${items.map((p, i) => html`<tr class="${p.invited ? 'dim' : ''}"><td><input type="checkbox" data-i="${i}" ${p.invited ? '' : raw('checked')}></td><td><b>${p.name}</b>${p.invited ? html` <span class="badge">davet edildi</span>` : ''}</td>
      <td><select class="select" data-ti="${i}" style="height:34px">${options(S.titles, p.title_id, '—')}</select></td><td><input class="input" type="email" data-em="${i}" placeholder="ornek@gmail.com" style="height:34px"></td></tr>`)}</tbody></table></div>`);
  m.setFoot(html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-inv-go>${icon('send', 'sm')}Davetleri oluştur</button>`);
  m.el.querySelector('#invAll').addEventListener('change', (e) => $$('[data-i]', m.el).forEach((c) => { c.checked = e.target.checked; }));
  m.el.querySelector('[data-inv-go]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const unit = +m.el.querySelector('#invUnit').value || null;
    const people = items.map((p, i) => ({ p, i })).filter(({ i }) => m.el.querySelector(`[data-i="${i}"]`).checked)
      .map(({ p, i }) => ({ name: p.name, title_id: +m.el.querySelector(`[data-ti="${i}"]`).value || null, unit_id: unit, email: m.el.querySelector(`[data-em="${i}"]`).value.trim() }));
    if (!people.length) { toast('Kimse seçilmedi', 'err'); return; }
    try {
      const r = await api('invites.personal', { people });
      showInviteLinks(m, r.items, r.mailed);
    } catch (err) { toast(err.message, 'err'); }
  }));
};
function showInviteLinks(m, list, mailed) {
  m.setTitle('Davetler hazır');
  m.setBody(html`${mailed ? html`<div class="form-note success" style="margin-bottom:12px">${mailed} kişiye davet e-postası gönderiliyor.</div>` : ''}
    <p class="small muted" style="margin-bottom:10px">Her bağlantı kişiye özeldir, 60 gün geçerlidir ve bir kez kullanılır.</p>
    <div class="card"><div class="list">${list.map((x) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${x.name}</div><div class="lr-s ellipsis sel">${x.email || x.url}</div></div>
      <a class="btn sm icon" href="https://wa.me/?text=${encodeURIComponent(`Merhaba ${x.name.split(' ')[0]}, ${S.settings.org_name} portalına davetlisin. Hesabını buradan oluştur: ${x.url}`)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('chat', 'sm')}</a>
      <button class="btn sm icon" data-copy="${x.url}" aria-label="Kopyala">${icon('copy', 'sm')}</button></div>`)}</div></div>`);
  m.setFoot(html`<button class="btn" data-copy-all>Tümünü kopyala</button><button class="btn primary" data-act="close-modal">Tamam</button>`);
  m.el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) return toast((await copyText(c.dataset.copy)) ? 'Bağlantı kopyalandı' : 'Kopyalanamadı');
    if (e.target.closest('[data-copy-all]')) toast((await copyText(list.map((x) => `${x.name}: ${x.url}`).join('\n'))) ? 'Tüm bağlantılar kopyalandı' : 'Kopyalanamadı');
  });
}

/* Davet bağlantısıyla gelen kişi: kayıt formu */
async function renderInvite(token) {
  setHTML(APP(), authLayout(html`<div style="display:grid;place-items:center;padding:40px"><div class="spinner"></div></div>`));
  let r;
  try { r = await api('invite.get', { token }); } catch (e) {
    setHTML(APP(), authLayout(html`<div class="empty" style="text-align:left;padding:0"><div class="e-ico" style="margin:0 0 14px">${icon('lock', 'lg')}</div><h1>Davet geçersiz</h1><p class="sub">${e.message}</p><a class="btn block" href="./">Giriş ekranına git</a></div>`));
    return;
  }
  const inv = r.invite;
  const personal = inv.kind === 'personal';
  setHTML(APP(), authLayout(html`
    <div class="auth-brand">${brandLogo()}<div class="brand-org">${r.org_name}</div></div>
    <h1>${personal ? `Hoş geldin, ${inv.name.split(' ')[0]}` : 'Portala katıl'}</h1>
    <p class="sub">${personal ? 'Hesabın hazırlandı. E-postanı ve şifreni belirleyip hemen giriş yap.' : inv.auto_approve ? 'Formu doldurunca hemen giriş yapabilirsin.' : 'Kaydın yönetici onayından sonra aktifleşir.'}</p>
    <form class="stack" data-form="invite-reg">
      <div class="field"><label>Ad soyad</label><input class="input" name="name" value="${inv.name || ''}" ${personal ? raw('readonly') : ''} required minlength="3" autocomplete="name"></div>
      ${!personal ? html`<div class="grid2"><div class="field"><label>Ünvan</label><select class="select" name="title_id">${options(S.titles, inv.title_id, 'Seçin')}</select></div>
        <div class="field"><label>Birim</label><select class="select" name="unit_id" ${inv.unit_id ? raw('disabled') : ''}>${options(S.units, inv.unit_id, 'Seçin')}</select></div></div>` : ''}
      <div class="field"><label>E-posta</label><input class="input" type="email" name="email" value="${inv.email || ''}" required autocomplete="email"></div>
      <div class="field"><label>Şifre</label>${pwField('password', 'En az 8 karakter', 'new-password')}</div>
      <div class="form-error hidden" data-err></div>
      <button class="btn primary block" type="submit">Hesabımı oluştur</button>
    </form>`));
  $('form[data-form=invite-reg]')._token = token;
}
FORMS['invite-reg'] = (f) => submitForm(f, async (d) => {
  const r = await api('auth.register', { ...d, title_id: d.title_id ? +d.title_id : null, unit_id: d.unit_id ? +d.unit_id : null, invite: f._token });
  history.replaceState(null, '', location.pathname);
  if (r.pending) return renderAuth('pending');
  await start();
  toast('Hesabın oluşturuldu. Hoş geldin!');
});

/* =================================================================== */
/* Yönetim: raporlar, işlem günlüğü, yedekleme                          */
/* =================================================================== */
async function drawReports(body) {
  setHTML(body, html`<div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div></div>`);
  let rep, rev;
  try { [rep, rev] = await Promise.all([api('report.reads'), api('report.reviews')]); } catch (e) { toast(e.message, 'err'); return; }
  REP.data = rep;
  const today = ymd(new Date());
  const soon = ymd(new Date(Date.now() + 30 * DAY_MS));
  const aud = (p) => rep.users.filter((u) => p.unit_id === null || u.unit_id === p.unit_id);
  setHTML(body, html`<div class="stack" style="gap:16px">
    <div class="card"><div class="card-head"><div><h3>Okuma raporu</h3><div class="tiny faint">Zorunlu okumalar: kim, ne zaman okudu (denetimlerde kanıt olarak kullanılabilir)</div></div>
      <button class="btn sm primary" data-act="rep-xlsx" ${rep.posts.length ? '' : raw('disabled')}>${icon('download', 'sm')}Excel olarak indir</button></div>
      ${rep.posts.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>İçerik</th><th>Yayın</th><th>Okuma</th><th></th></tr></thead><tbody>${rep.posts.map((p) => {
        const a = aud(p); const read = a.filter((u) => (rep.acks[p.id] || {})[u.id]).length; const pct = a.length ? Math.round(read / a.length * 100) : 0;
        return html`<tr><td><a href="#/p/${p.id}"><b>${p.title}</b></a><div class="tiny faint">${p.category || ''}${p.unit_id ? ' · ' + unitName(p.unit_id) : ''}</div></td><td class="small muted nowrap">${fmtDate(p.published_at, true)}</td>
          <td style="min-width:160px"><div class="row"><div class="progress grow"><span style="width:${pct}%"></span></div><b class="small">${read}/${a.length}</b></div></td><td class="small nowrap">%${pct}</td></tr>`;
      })}</tbody></table></div>` : html`<div class="list-row small muted">Henüz zorunlu okuma yok.</div>`}</div>
    <div class="card"><div class="card-head"><div><h3>Gözden geçirilecek belgeler</h3><div class="tiny faint">Geçerlilik tarihi girilmiş protokol ve formlar</div></div></div>
      <div class="list">${rev.items.length ? rev.items.map((x) => html`<a class="list-row" href="#/p/${x.id}" style="color:inherit;text-decoration:none"><div class="grow"><div class="lr-t">${x.title}</div><div class="lr-s">${x.author || ''}</div></div>
        <span class="badge ${x.review_at < today ? 'danger' : x.review_at <= soon ? 'warn' : ''}">${x.review_at < today ? 'Süresi geçti' : x.review_at <= soon ? 'Yaklaşıyor' : 'Geçerli'} · ${fmtDate(x.review_at, true)}</span></a>`)
        : html`<div class="list-row small muted">Geçerlilik tarihi girilmiş belge yok. İçerik eklerken “Geçerlilik / gözden geçirme tarihi” alanını doldurun.</div>`}</div></div>
  </div>`);
}
const REP = { data: null };
ACT['rep-xlsx'] = (el) => busy(el, async () => {
  const rep = REP.data;
  if (!rep) return;
  try {
    await loadVendor('exceljs');
    const wb = new ExcelJS.Workbook();
    const head = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B7A75' } }, alignment: { vertical: 'middle', wrapText: true } };
    const ws = wb.addWorksheet('Özet', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
    ws.mergeCells(1, 1, 1, 3 + rep.posts.length);
    ws.getCell(1, 1).value = `${S.settings.org_name} — Okuma raporu (${fmtDateTime(rep.generated_at)})`;
    ws.getCell(1, 1).font = { bold: true, size: 13 };
    const hdr = ['Ad soyad', 'Ünvan', 'Birim', ...rep.posts.map((p) => p.title)];
    hdr.forEach((h, i) => { const c = ws.getCell(2, i + 1); c.value = h; Object.assign(c, head); if (i >= 3) c.alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center', wrapText: true }; });
    ws.getRow(2).height = 160;
    rep.users.forEach((u, r) => {
      const row = 3 + r;
      ws.getCell(row, 1).value = u.name; ws.getCell(row, 2).value = titleName(u.title_id); ws.getCell(row, 3).value = unitName(u.unit_id);
      rep.posts.forEach((p, i) => {
        const c = ws.getCell(row, 4 + i);
        if (p.unit_id !== null && u.unit_id !== p.unit_id) { c.value = '—'; c.font = { color: { argb: 'FF9CA3AF' } }; }
        else {
          const at = (rep.acks[p.id] || {})[u.id];
          c.value = at ? fmtDate(at, true) : 'Okumadı';
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: at ? 'FFD9F2E3' : 'FFFDE2E2' } };
        }
        c.alignment = { horizontal: 'center' };
      });
    });
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 18; ws.getColumn(3).width = 16;
    rep.posts.forEach((_, i) => { ws.getColumn(4 + i).width = 13; });
    const d = wb.addWorksheet('Ayrıntı');
    d.addRow(['İçerik', 'Bölüm', 'Yayın tarihi', 'Ad soyad', 'Ünvan', 'Birim', 'Durum', 'Okuma tarihi']).eachCell((c) => Object.assign(c, head));
    rep.posts.forEach((p) => rep.users.filter((u) => p.unit_id === null || u.unit_id === p.unit_id).forEach((u) => {
      const at = (rep.acks[p.id] || {})[u.id];
      d.addRow([p.title, p.category || '', fmtDate(p.published_at, true), u.name, titleName(u.title_id), unitName(u.unit_id), at ? 'Okudu' : 'Okumadı', at ? fmtDateTime(at) : '']);
    }));
    [40, 18, 14, 24, 18, 16, 10, 18].forEach((w, i) => { d.getColumn(i + 1).width = w; });
    d.autoFilter = { from: 'A1', to: 'H1' };
    const buf = await wb.xlsx.writeBuffer();
    if (downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `okuma-raporu-${ymd(new Date())}.xlsx`) !== false) toast('Okuma raporu indirildi');
  } catch (e) { toast('Rapor oluşturulamadı: ' + e.message, 'err'); }
});

const AUD = { q: '', items: [], more: false };
const AUDIT_LABEL = {
  login: 'Giriş', 'login.passkey': 'Parmak izi ile giriş', 'post.publish': 'İçerik yayınladı', 'post.submit': 'İçerik gönderdi', 'post.edit': 'İçerik düzenledi', 'post.delete': 'İçerik sildi',
  'post.approve': 'İçerik onayladı', 'post.reject': 'İçerik reddetti', 'roster.upload': 'Nöbet listesi yükledi', 'roster.restore': 'Liste sürümü geri yükledi', 'roster.rename': 'Liste adını değiştirdi',
  'roster.create': 'Liste oluşturdu', 'roster.delete': 'Liste sildi', 'roster.parse': 'Listeden nöbetler okundu', 'roster.period': 'Liste ayını değiştirdi', 'user.create': 'Kullanıcı ekledi', 'user.edit': 'Kullanıcı düzenledi',
  'user.approve': 'Üyelik onayladı', 'user.delete': 'Kullanıcı sildi', 'user.resetpw': 'Geçici şifre oluşturdu', 'settings.save': 'Ayarları değiştirdi', 'structure.save': 'Bölüm/birim kaydetti', 'structure.delete': 'Bölüm/birim sildi',
  'backup.create': 'Yedek aldı', 'backup.download': 'Yedek indirdi', 'backup.delete': 'Yedek sildi', 'invite.general': 'QR davet oluşturdu', 'invite.personal': 'Davet oluşturdu', 'invite.use': 'Davetle katıldı', 'invite.revoke': 'Davet iptal etti',
  'template.create': 'Şablon ekledi', 'template.delete': 'Şablon sildi', 'phonebook.create': 'Rehbere numara ekledi', 'phonebook.save': 'Rehberde numara düzenledi', 'phonebook.delete': 'Rehberden numara sildi', 'phonebook.import': 'Rehbere liste ekledi', 'passkey.add': 'Parmak izi ekledi', 'passkey.delete': 'Parmak izi kaldırdı',
};
async function drawAudit(body, more, keepInput) {
  if (!more) {
    if (!keepInput || !$('#audList')) setHTML(body, html`<div class="toolbar"><div class="search" style="max-width:340px;flex:1">${icon('search')}<input class="input" placeholder="Kişi, işlem veya içerik ara" data-input="aud-q" value="${AUD.q}"></div><span class="tiny faint">Son 1 yılın kayıtları</span></div><div id="audList"></div>`);
    AUD.items = [];
  }
  const tok = AUD.tok = (AUD.tok || 0) + 1;
  try {
    const r = await api('audit.list', { q: AUD.q, offset: AUD.items.length });
    if (tok !== AUD.tok) return;
    AUD.items = AUD.items.concat(r.items);
    AUD.more = r.has_more;
  } catch (e) { if (tok !== AUD.tok) return; toast(e.message, 'err'); }
  const box = $('#audList');
  if (!box) return;
  setHTML(box, AUD.items.length ? html`<div class="card"><div class="list">${AUD.items.map((x) => html`<div class="list-row audit-row">
      <span class="tiny faint nowrap" title="${x.at}">${fmtDateTime(x.at)}</span>
      <div class="grow" style="min-width:0"><div class="small"><b>${x.user || 'Sistem'}</b> · ${AUDIT_LABEL[x.action] || x.action}${x.target ? html`: <span class="muted">${x.target}</span>` : ''}</div>${x.detail ? html`<div class="tiny faint ellipsis">${x.detail}</div>` : ''}</div>
      <span class="tiny faint desk-only">${x.ip || ''}</span></div>`)}</div></div>
    ${AUD.more ? html`<div style="text-align:center;margin-top:12px"><button class="btn" data-act="aud-more">Daha fazla</button></div>` : ''}` : html`<div class="card empty"><p class="small">Kayıt bulunamadı.</p></div>`);
}
CHANGE['aud-q'] = debounce((el) => { AUD.q = el.value; drawAudit($('#adminBody'), false, true); }, 300);
ACT['aud-more'] = (el) => busy(el, () => drawAudit($('#adminBody'), true));

/* Ayarlar sayfası ek kartları */
function settingsExtrasHtml(A) {
  const SWX = (name, on, title, hint) => html`<label class="switch"><input type="checkbox" name="${name}" ${on ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>${title}</b>${hint ? html`<span>${hint}</span>` : ''}</span></label>`;
  const hours = (name, v) => html`<select class="select" name="${name}" style="width:auto">${Array.from({ length: 24 }, (_, h) => html`<option value="${h}" ${h === v ? raw('selected') : ''}>${pad(h)}:00</option>`)}</select>`;
  return html`
    ${brandCardHtml()}
    <div class="card card-pad stack" data-sec="bildirim">
      <div><h3 style="font-size:15px">${icon('clock', 'sm')} Hatırlatmalar ve sabah özeti</h3><p class="small muted">Kendiliğinden çalışır. Tam saatinde gitmesi için hPanel’de zamanlanmış görev (Cron Jobs) kurun — Kurulum rehberi, 13. bölüm.</p></div>
      ${SWX('shift_remind_on', A.shift_remind_on, 'Nöbetten bir gün önce hatırlat', 'Excel listesinde adı geçen kişiye e-posta ve telefon bildirimi.')}
      <div class="row wrap"><span class="small muted">Hatırlatma saati</span>${hours('shift_remind_hour', A.shift_remind_hour)}</div>
      ${SWX('digest_on', A.digest_on, 'Sabah özeti e-postası', '“Sabah özeti” seçenlere her sabah tek e-posta: bugünkü nöbet, yeni duyurular, okunacaklar, onay bekleyenler.')}
      <div class="row wrap"><span class="small muted">Özet saati</span>${hours('digest_hour', A.digest_hour)}
        <span class="small muted">Yeni üyeler için</span><select class="select" name="default_notify_mode" style="width:auto"><option value="instant" ${A.default_notify_mode === 'instant' ? raw('selected') : ''}>Anlık bildirim</option><option value="digest" ${A.default_notify_mode === 'digest' ? raw('selected') : ''}>Sabah özeti</option></select></div>
      <label class="small"><input type="checkbox" name="apply_mode_all"> Bu tercihi mevcut herkese de uygula (bildirimi kapatanlar hariç)</label>
      <div class="row wrap"><span class="small muted">Zorunlu okumayı</span><input class="input" type="number" name="auto_remind_days" min="0" max="60" value="${A.auto_remind_days}" style="width:80px"><span class="small muted">gün içinde okumayanlara otomatik hatırlat (0 = kapalı)</span></div>
      <div class="row wrap"><span class="small muted">Belge gözden geçirme tarihinden</span><input class="input" type="number" name="review_warn_days" min="1" max="120" value="${A.review_warn_days}" style="width:80px"><span class="small muted">gün önce uyar</span></div>
    </div>
    <div class="card card-pad stack" data-sec="bildirim">
      <div><h3 style="font-size:15px">${icon('bell', 'sm')} Telefon bildirimleri</h3><p class="small muted">Portalı telefona ekleyenlere duyuru ve hatırlatmalar anında gelir (Android ve iPhone — iPhone’da önce “Ana Ekrana Ekle”).</p></div>
      ${SWX('push_enabled', A.push_enabled, 'Telefon bildirimlerini kullan', A.push_ready ? '' : 'Sunucunuz şu an bu özelliği desteklemiyor; hosting desteğine “PHP OpenSSL” eklentisini sorun.')}
    </div>
    ${shiftCodesCardHtml()}
    <div class="card card-pad stack" data-sec="yedek">
      <div><h3 style="font-size:15px">${icon('download', 'sm')} Yedekleme</h3><p class="small muted">Veritabanı her hafta otomatik yedeklenir (son 4 yedek saklanır). İstediğiniz an indirebilirsiniz.</p></div>
      ${SWX('backup_weekly', A.backup_weekly, 'Haftalık otomatik yedek', '')}
      <div id="backupBox" class="stack" style="gap:8px"><div class="tiny faint">Yükleniyor…</div></div>
    </div>`;
}
async function mountBackupBox() {
  const box = $('#backupBox');
  if (!box) return;
  let r;
  try { r = await api('backup.list'); } catch (e) { setHTML(box, html`<p class="tiny faint">${e.message}</p>`); return; }
  const dl = (q) => `api.php?action=backup.download&csrf=${encodeURIComponent(S.csrf)}&${q}`;
  setHTML(box, html`<div class="row wrap">
      <a class="btn" href="${dl('full=0')}" data-dl>${icon('download', 'sm')}Veritabanı yedeğini indir</a>
      ${r.zip ? html`<a class="btn" href="${dl('full=1')}" data-dl>${icon('download', 'sm')}Tam yedek (dosyalar dahil)</a>` : ''}
      <button class="btn ghost" type="button" data-act="bk-create">${icon('plus', 'sm')}Şimdi yedekle</button></div>
    ${r.items.length ? html`<div class="list" style="border:1px solid var(--border);border-radius:10px">${r.items.map((x) => html`<div class="list-row"><div class="grow"><div class="lr-t small">${fmtDateTime(x.at)}</div><div class="lr-s">${fmtSize(x.size)}</div></div>
      <a class="btn sm icon" href="${dl('name=' + encodeURIComponent(x.name))}" data-dl aria-label="İndir">${icon('download', 'sm')}</a><button class="btn sm icon ghost danger" type="button" data-act="bk-del" data-n="${x.name}" aria-label="Sil">${icon('trash', 'sm')}</button></div>`)}</div>` : html`<p class="tiny faint">Henüz kayıtlı yedek yok.</p>`}`);
  box.querySelectorAll('[data-dl]').forEach((a) => a.addEventListener('click', (e) => { if (window.NM_DEMO_API) { e.preventDefault(); toast('Önizlemede yedek indirilemez; sitenizde çalışır.'); } }));
}
ACT['bk-create'] = (el) => busy(el, async () => { try { await api('backup.create'); toast('Yedek alındı'); mountBackupBox(); } catch (e) { toast(e.message, 'err'); } });
ACT['bk-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Yedek silinsin mi?', text: el.dataset.n, ok: 'Sil', danger: true }))) return;
  try { await api('backup.delete', { name: el.dataset.n }); mountBackupBox(); toast('Yedek silindi'); } catch (e) { toast(e.message, 'err'); }
};

/* Arama sonucunda eşleşen kelimeyi vurgula (Türkçe büyük/küçük harf duyarsız) */
function hiText(text, q) {
  text = String(text || '');
  q = avKey(String(q || ''));
  if (!q) return text;
  const low = text.split('').map((c) => { const l = avKey(c) || c; return l.length === 1 ? l : c.toLowerCase().charAt(0); }).join('');
  const out = [];
  let i = 0;
  for (;;) {
    const at = low.indexOf(q, i);
    if (at < 0) break;
    out.push(text.slice(i, at), html`<mark>${text.slice(at, at + q.length)}</mark>`);
    i = at + q.length;
  }
  out.push(text.slice(i));
  return out;
}
function reviewBadge(d) {
  const today = ymd(new Date());
  const soon = ymd(new Date(Date.now() + 30 * DAY_MS));
  const cls = d < today ? 'danger' : d <= soon ? 'warn' : '';
  return html`<span class="badge ${cls}" title="Gözden geçirme tarihi">${icon('clock')}${d < today ? 'Gözden geçirme tarihi geçti' : 'Gözden geçir: ' + fmtDate(d, true)}</span>`;
}

/* =================================================================== */
/* İlk açılış tanıtımı (3 adım)                                          */
/* =================================================================== */
function maybeShowTour() {
  if (!S.me) return;
  const k = 'nm-tour-' + S.me.id;
  try { if (localStorage.getItem('nm-tour') || localStorage.getItem(k)) return; } catch (e) { return; }
  setTimeout(() => {
    // Kullanıcı bu arada başka sayfaya geçtiyse tanıtımı bir sonraki ana sayfa açılışına bırak
    if (currentRoute()[0] !== undefined || modalStack.length) return;
    try { localStorage.setItem(k, '1'); } catch (e) { /* */ }
    showTour();
  }, 500);
}
function showTour() {
  const steps = [
    ['calendar', 'tone-indigo', 'Nöbetin burada', (window.innerWidth > 900 ? 'Soldaki menüde <b>Nöbet</b> bölümünde' : 'Alttaki <b>Nöbet</b> sekmesinde') + ' takvimini, hangi gün kimin nöbette olduğunu ve Excel listenin kendisini bulursun. Takvimde renkler: <span class="code-chip tone-amber">G</span> gündüz, <span class="code-chip tone-indigo">N</span> gece, <span class="code-chip tone-emerald">24</span> 24 saat, <span class="code-chip tone-slate">İ</span> izin.'],
    ['checkCircle', 'tone-amber', 'Okuman gerekenler', 'Zorunlu duyuru ve protokolleri açıp <b>“Okudum, anladım”</b> demen yeterli. Kaç tane kaldığı ana sayfanın en üstünde yazar.'],
    ['bell', 'tone-teal', 'Hiçbir şeyi kaçırma', 'Yeni duyurular ve nöbet hatırlatmaları sağ üstteki zilde toplanır. Telefon bildirimlerini açarsan nöbetinden bir gün önce de haber verilir.'],
  ];
  let i = 0;
  const m = openModal({ title: 'Hoş geldin', size: 'narrow' });
  m.el.classList.add('tour');
  const draw = async () => {
    const [ic, tone, t, d] = steps[i];
    const last = i === steps.length - 1;
    let pushBtn = '';
    if (last && S.settings.push_ready && typeof pushState === 'function' && !window.NM_DEMO_API) {
      try { if ((await pushState()) === 'off') pushBtn = html`<button class="btn" data-tour="push">${icon('bell', 'sm')}Bildirimleri aç</button>`; } catch (e) { /* */ }
    }
    m.setTitle(`${i + 1} / ${steps.length}`);
    m.setBody(html`<div class="tour-step"><span class="tour-ico ${tone}">${icon(ic, 'lg')}</span><h2>${t}</h2><p>${raw(d)}</p>
      <div class="tour-dots">${steps.map((_, k) => html`<span class="${k === i ? 'on' : ''}"></span>`)}</div></div>`);
    m.setFoot(html`${i ? html`<button class="btn ghost" data-tour="back">Geri</button>` : html`<button class="btn ghost" data-tour="skip">Geç</button>`}<div class="grow"></div>${pushBtn}<button class="btn primary" data-tour="${last ? 'done' : 'next'}">${last ? 'Başla' : 'İleri'}</button>`);
  };
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    const a = b.dataset.tour;
    if (a === 'next') { i++; draw(); }
    else if (a === 'back') { i--; draw(); }
    else if (a === 'skip' || a === 'done') m.close();
    else if (a === 'push') { try { await pushEnable(); toast('Telefon bildirimleri açıldı'); m.close(); } catch (err) { toast(err.message, 'err'); } }
  });
  draw();
}
ACT['tour'] = () => showTour();

/* =================================================================== */
/* Yönetici: kurulum kontrol listesi                                    */
/* =================================================================== */
async function mountSetupBox(box) {
  try { if (localStorage.getItem('nm-setup-hide')) return; } catch (e) { /* */ }
  let st;
  try { st = (await api('setup.status')).status; } catch (e) { return; }
  const team = st.roster_people ? st.matched >= Math.ceil(st.roster_people * 0.6) : st.users > 3;
  const items = [
    [st.roster, 'Nöbet listesini yükle', 'Excel listeyi yükleyin; herkes açık görür.', '#/nobet'],
    [st.parsed, 'Nöbetleri okut', 'Listeyi bir kez açmanız yeterli. Takvimim ve hatırlatmalar buradan beslenir.', '#/nobet'],
    [team, 'Ekibi davet et' + (st.roster_people ? ` (${st.matched}/${st.roster_people})` : ''), 'QR kod veya nöbet listesinden kişiye özel davet bağlantısı.', '#/yonetim/kullanicilar'],
    [st.mail, 'E-posta gönderimini ayarla', 'Duyuru, hatırlatma ve şifre e-postaları için.', '#/yonetim/ayarlar/bildirim'],
    [st.cron, 'Zamanlanmış görevi kur', 'Hatırlatmalar saatinde gitsin: hPanel › Cron Jobs (Kurulum rehberi, 13. bölüm).', '#/yonetim/ayarlar/bildirim'],
    [location.protocol === 'https:' || !!window.NM_DEMO_API, 'Güvenli bağlantıyı (SSL) aç', 'Parmak izi girişi ve telefon bildirimleri için gerekli: hPanel › SSL.', ''],
  ];
  const done = items.filter((x) => x[0]).length;
  if (done === items.length) { setHTML(box, ''); return; }
  setHTML(box, html`<div class="card setup"><div class="card-head"><div><h3>Kurulumu tamamlayın</h3><div class="tiny faint">${done} / ${items.length} adım tamam</div></div><button class="btn sm icon ghost" data-act="setup-hide" aria-label="Gizle">${icon('x', 'sm')}</button></div>
    <div class="setup-bar"><div class="progress"><span style="width:${Math.round(done / items.length * 100)}%"></span></div></div>
    <div class="setup-list">${items.filter(([ok]) => !ok).map(([ok, t, d, href]) => html`<a class="setup-row ${ok ? 'ok' : ''}" href="${href || '#'}" ${href ? '' : raw('data-act="noop"')}>
      <span class="su-ck">${icon(ok ? 'check' : 'chevR', 'sm')}</span><span class="grow" style="min-width:0"><b>${t}</b>${ok ? '' : html`<span>${d}</span>`}</span></a>`)}</div></div>`);
}
ACT['setup-hide'] = (el) => { try { localStorage.setItem('nm-setup-hide', '1'); } catch (e) { /* */ } const c = el.closest('#setupBox'); if (c) setHTML(c, ''); };
ACT.noop = () => {};

/* =================================================================== */
/* Ayarlar: bölümler ve nöbet kodu sözlüğü                              */
/* =================================================================== */
const SET_SECS = [['genel', 'Genel', 'sliders'], ['bildirim', 'Bildirimler', 'bell'], ['nobet', 'Nöbet', 'calendar'], ['guvenlik', 'Güvenlik', 'lock'], ['yedek', 'Yedek', 'download']];
function settingsTabsHtml(cur) {
  return html`<div class="seg set-tabs" role="tablist">${SET_SECS.map(([k, l, ic]) => html`<button type="button" class="${cur === k ? 'on' : ''}" data-act="set-sec" data-s="${k}">${icon(ic, 'sm')}${l}</button>`)}</div>`;
}
function settingsSecNow() {
  const r = currentRoute()[2];
  if (SET_SECS.some(([k]) => k === r)) return r;
  try { const v = localStorage.getItem('nm-setsec'); if (SET_SECS.some(([k]) => k === v)) return v; } catch (e) { /* */ }
  return 'genel';
}
function applySettingsSec(sec) {
  $$('form[data-form=settings] [data-sec]').forEach((c) => c.classList.toggle('hidden', c.dataset.sec !== sec));
  $$('[data-act=set-sec]').forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
  try { localStorage.setItem('nm-setsec', sec); } catch (e) { /* */ }
}
ACT['set-sec'] = (el) => { applySettingsSec(el.dataset.s); history.replaceState(null, '', '#/yonetim/ayarlar/' + el.dataset.s); };

const CODES = { list: [], dirty: false };
function shiftCodesCardHtml() {
  return html`<div class="card card-pad stack" data-sec="nobet">
    <div><h3 style="font-size:15px">${icon('table', 'sm')} Nöbet kodları</h3><p class="small muted">Excel listedeki kısaltmaların anlamı. Takvimde, hatırlatmalarda, renklerde ve saat/fazla mesai hesabında kullanılır. Değiştirince listeler yeniden okunur.</p></div>
    <div id="codesBox"></div></div>`;
}
function mountCodesBox() {
  CODES.list = JSON.parse(JSON.stringify(shiftDict()));
  CODES.dirty = false;
  drawCodes();
  const box = $('#codesBox');
  if (!box) return;
  box.addEventListener('input', (e) => {
    const i = e.target.closest('[data-i]');
    if (!i) return;
    const row = CODES.list[+i.dataset.i];
    if (row) { row[i.dataset.k] = e.target.value; CODES.dirty = true; }
  });
  box.addEventListener('change', (e) => {
    const i = e.target.closest('select[data-i]');
    if (!i) return;
    CODES.list[+i.dataset.i].kind = i.value;
    CODES.dirty = true;
    drawCodes();
  });
}
function drawCodes() {
  const box = $('#codesBox');
  if (!box) return;
  const kinds = [['shift', 'Nöbet'], ['leave', 'İzin'], ['off', 'Diğer']];
  setHTML(box, html`<div class="table-wrap codes-wrap"><table class="t codes-t"><thead><tr><th>Kod</th><th>Açıklama</th><th>Başlangıç</th><th>Bitiş</th><th>Tür</th><th></th></tr></thead><tbody>
    ${CODES.list.map((c, i) => html`<tr>
      <td><div class="row" style="gap:6px">${codeChip({ ...c, code: c.code || '?' })}<input class="input" data-i="${i}" data-k="code" value="${c.code || ''}" maxlength="12" style="width:72px" aria-label="Kod"></div></td>
      <td><input class="input" data-i="${i}" data-k="label" value="${c.label || ''}" maxlength="40" aria-label="Açıklama"></td>
      <td>${c.kind === 'shift' ? html`<input class="input" type="time" data-i="${i}" data-k="start" value="${c.start || ''}" aria-label="Başlangıç">` : html`<span class="faint">—</span>`}</td>
      <td>${c.kind === 'shift' ? html`<input class="input" type="time" data-i="${i}" data-k="end" value="${c.end || ''}" aria-label="Bitiş">` : html`<span class="faint">—</span>`}</td>
      <td><select class="select" data-i="${i}" data-k="kind" aria-label="Tür">${kinds.map(([k, l]) => html`<option value="${k}" ${c.kind === k ? raw('selected') : ''}>${l}</option>`)}</select></td>
      <td><button type="button" class="btn sm icon ghost danger" data-act="code-del" data-i="${i}" aria-label="Sil">${icon('trash', 'sm')}</button></td></tr>`)}
  </tbody></table></div>
  <div class="row wrap"><button type="button" class="btn" data-act="code-add">${icon('plus', 'sm')}Kod ekle</button><span class="grow"></span>
    <button type="button" class="btn ghost" data-act="code-reset">Varsayılana dön</button><button type="button" class="btn primary" data-act="code-save">Kodları kaydet</button></div>
  <p class="tiny faint">Örnek: “8 16” = Gündüz 08:00–16:00. Bitiş başlangıçtan önceyse ertesi güne geçen nöbet sayılır (gece, 24 saat).</p>`);
}
ACT['code-add'] = () => { CODES.dirty = true; CODES.list.push({ code: '', label: '', start: '08:00', end: '16:00', kind: 'shift' }); drawCodes(); const ins = $$('#codesBox input[data-k=code]'); if (ins.length) ins[ins.length - 1].focus(); };
ACT['code-del'] = (el) => { CODES.dirty = true; CODES.list.splice(+el.dataset.i, 1); drawCodes(); };
ACT['code-reset'] = async (el) => {
  if (!(await confirmDialog({ title: 'Varsayılan kodlara dönülsün mü?', text: 'Yaptığınız değişiklikler silinir ve listeler varsayılan kodlarla yeniden okunur.', ok: 'Varsayılana dön' }))) return;
  try { await api('shiftcodes.save', { reset: true }); S.settings.shift_codes = null; CODES.list = JSON.parse(JSON.stringify(SHIFT_CODES_DEFAULT)); drawCodes(); reparseAllRosters(); toast('Varsayılan kodlar geri yüklendi'); } catch (e) { toast(e.message, 'err'); }
};
async function saveCodes() {
  const r = await api('shiftcodes.save', { codes: CODES.list.filter((c) => String(c.code || '').trim()) });
  S.settings.shift_codes = r.codes;
  CODES.list = JSON.parse(JSON.stringify(r.codes));
  CODES.dirty = false;
  drawCodes();
  return reparseAllRosters();
}
/** "Ayarları kaydet" ile birlikte, değişmişse nöbet kodlarını da kaydet */
async function saveCodesIfDirty() { return CODES.dirty && $('#codesBox') ? saveCodes() : null; }
ACT['code-save'] = (el) => busy(el, async () => {
  try {
    const n = await saveCodes();
    toast(n ? `Kodlar kaydedildi · ${n} liste yeniden okunuyor` : 'Kodlar kaydedildi');
  } catch (e) { toast(e.message, 'err'); }
});
/** Kod sözlüğü değişince tüm Excel listeleri yeniden oku */
function reparseAllRosters() {
  let n = 0;
  (S.rosters || []).forEach((r) => {
    if (!r.file || !['xlsx', 'xlsm', 'xls', 'ods', 'csv'].includes(extOf(r.file.name))) return;
    n++;
    r._reparse = true;
    loadSheetModel(r.file).then((model) => syncRosterShifts(r, model)).catch(() => {});
  });
  MY.at = 0;
  return n;
}

/* =================================================================== */
/* Görünüm: yazı boyutu ve tema                                         */
/* =================================================================== */
function appearanceCardHtml() {
  const lg = document.documentElement.classList.contains('fs-lg');
  return html`<div class="card card-pad stack">
    <h3 style="font-size:14.5px">Görünüm</h3>
    <div><div class="tiny faint" style="margin-bottom:6px">Yazı boyutu</div><div class="seg seg-block"><button class="${lg ? '' : 'on'}" data-act="fs" data-v="">Normal</button><button class="${lg ? 'on' : ''}" data-act="fs" data-v="lg" style="font-size:14.5px">Büyük</button></div></div>
    <div><div class="tiny faint" style="margin-bottom:6px">Tema</div><div class="seg seg-block"><button class="${isDark() ? '' : 'on'}" data-act="theme-set" data-v="light">${icon('sun', 'sm')}Açık</button><button class="${isDark() ? 'on' : ''}" data-act="theme-set" data-v="dark">${icon('moon', 'sm')}Koyu</button></div></div>
    <button class="btn ghost sm" data-act="tour" style="align-self:flex-start">${icon('info', 'sm')}Kısa tanıtımı tekrar göster</button>
  </div>`;
}
ACT.fs = (el) => {
  const lg = el.dataset.v === 'lg';
  document.documentElement.classList.toggle('fs-lg', lg);
  try { localStorage.setItem('nm-fs', lg ? 'lg' : ''); } catch (e) { /* */ }
  $$('[data-act=fs]').forEach((b) => b.classList.toggle('on', b === el));
};
ACT['theme-set'] = (el) => {
  setTheme(el.dataset.v);
  $$('[data-act=theme-set]').forEach((b) => b.classList.toggle('on', b === el));
  const b = $('#themeBtn'); if (b) setHTML(b, icon(isDark() ? 'sun' : 'moon'));
};

/* Çıkışta / hesap değişince önceki kişinin bilgileri ekranda kalmasın */
function resetAppState() {
  Object.assign(MY, { entries: null, at: 0, has_data: false });
  Object.assign(DIR, { people: null, q: '', filter: 'all' });
  Object.assign(CAL, { y: 0, m: 0, sel: null });
  DUTY.day = null;
  Object.assign(AUD, { q: '', items: [], more: false });
  TPL = null;
  FEED = null;
  DETAIL = null;
  if (typeof AD !== 'undefined') Object.assign(AD, { users: null, userQ: '', userFilter: 'all' });
  S.people = [];
  if (typeof _models !== 'undefined') _models.clear();
  if (typeof _buf !== 'undefined') _buf.clear();
}

/* =================================================================== */
/* Ayarlar › Genel: logo, favicon ve logo boyutu                        */
/* =================================================================== */
function brandCardHtml() {
  const b = S.settings.brand || {};
  const h = b.logo_h || 36;
  const slot = (k, title, hint, darkBg) => html`<div class="logo-slot">
      <div class="ls-head"><b class="small">${title}</b><span class="tiny faint">${hint}</span></div>
      <div class="bp-box ${darkBg ? 'bp-dark on-dark' : ''}">${b[k] ? html`<img class="brand-img" src="${b[k]}" alt="">` : html`<span class="tiny ${darkBg ? '' : 'faint'}" style="${darkBg ? 'color:#aab3c8' : ''}">${k === 'logo_dark' && b.logo ? 'Yüklenmedi — açık mod logosu kullanılıyor' : k === 'logo' && b.logo_dark ? 'Yüklenmedi — koyu mod logosu kullanılıyor' : 'Yüklenmedi — dupcii logosu kullanılıyor'}</span>`}</div>
      <div class="row wrap" style="gap:6px">
        <label class="btn sm ${b[k] ? '' : 'primary'}">${icon('upload', 'sm')}${b[k] ? 'Değiştir' : 'Yükle'}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" data-change="brand-logo" data-k="${k}"></label>
        ${b[k] ? html`<button type="button" class="btn sm" data-act="brand-del" data-k="${k}">${icon('x', 'sm')}Kaldır</button>` : ''}
      </div>
    </div>`;
  return html`<div class="card card-pad stack" data-sec="genel" id="brandCard">
    <div><h3 style="font-size:15px">${icon('sun', 'sm')} Logo ve simge</h3>
      <p class="small muted">Tek logo kullanılır: menünün tepesinde ve telefonda üst çubukta görünür. Açık ve koyu mod için ayrı logo yükleyebilirsiniz; yalnızca birini yüklerseniz her iki modda o kullanılır. Şeffaf arka planlı PNG veya SVG önerilir.</p></div>
    <div class="logo-slots">
      ${slot('logo', 'Açık mod logosu', 'Açık zemin için (genelde koyu renkli logo)', false)}
      ${slot('logo_dark', 'Koyu mod logosu', 'Koyu zemin için (genelde beyaz/açık renkli logo)', true)}
    </div>
    <div class="brand-prev">
      <div class="bp"><span class="tiny faint">Menüde (şu anki tema)</span><div class="bp-box">${brandLogo()}</div></div>
      <div class="bp"><span class="tiny faint">Üst çubukta (telefon)</span><div class="bp-box bp-top top-logo">${brandLogo()}</div></div>
      <div class="bp"><span class="tiny faint">Giriş ekranı (koyu panel)</span><div class="bp-box bp-dark">${brandLogo('on-dark')}</div></div>
    </div>
    <div class="field"><label>Logo boyutu: <b id="logoHval">${h} px</b></label>
      <input class="range" type="range" min="20" max="96" step="2" value="${h}" data-input="brand-h" aria-label="Logo boyutu"></div>
    <div class="fav-row">
      <span class="fav-prev">${b.icon ? html`<img src="${b.icon}" alt="">` : BRAND_MARK}</span>
      <div class="grow" style="min-width:0"><b class="small">Favicon ve uygulama simgesi</b><div class="tiny faint">Tarayıcı sekmesinde ve telefona eklenince ana ekranda görünür. Kare (en az 512×512) PNG veya SVG.</div></div>
      <div class="row" style="gap:6px"><label class="btn sm">${icon('upload', 'sm')}Yükle<input type="file" hidden accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/webp" data-change="brand-icon"></label>
      ${b.icon ? html`<button type="button" class="btn sm icon" data-act="brand-del" data-k="icon" aria-label="Varsayılana dön" title="Varsayılana dön">${icon('x', 'sm')}</button>` : ''}</div>
    </div>
  </div>`;
}
function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Dosya okunamadı.')); r.readAsDataURL(file); });
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Görsel açılamadı. PNG veya SVG deneyin.')); i.src = src; });
}
const svgB64 = (d) => d.replace(/^data:image\/svg\+xml;[^,]*,/, 'data:image/svg+xml;base64,');
/** Logo: SVG olduğu gibi; büyük resim en fazla 320 px yüksekliğe küçültülür (şeffaflık korunur) */
async function prepareLogo(file) {
  const data = await readAsDataURL(file);
  if (/^data:image\/svg\+xml/.test(data)) return svgB64(data);
  const img = await loadImg(data);
  if (img.naturalHeight <= 320 && data.length < 1500000) return data;
  const sc = Math.min(1, 320 / img.naturalHeight);
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.naturalWidth * sc)); cv.height = Math.max(1, Math.round(img.naturalHeight * sc));
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/png');
}
/** Simge: favicon + telefon için 192/512 PNG (kare değilse beyaz zeminde ortalanır) */
async function prepareIcon(file) {
  const data = await readAsDataURL(file);
  const isSvg = /^data:image\/svg\+xml/.test(data);
  const isIco = /^data:image\/(x-icon|vnd\.microsoft\.icon)/.test(data);
  const img = await loadImg(data);
  const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
  const square = Math.abs(w - h) / Math.max(w, h) < 0.06;
  const make = (size) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (square) ctx.drawImage(img, 0, 0, size, size);
    else {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      const sc = (size * 0.82) / Math.max(w, h);
      ctx.drawImage(img, (size - w * sc) / 2, (size - h * sc) / 2, w * sc, h * sc);
    }
    return cv.toDataURL('image/png');
  };
  const icon = isSvg ? svgB64(data) : isIco ? data : make(256);
  return { icon, icon192: make(192), icon512: make(512) };
}
function refreshBrandEverywhere() {
  applyBrand();
  renderNav();
  const t = $('.topbar .top-logo'); if (t) setHTML(t, brandLogo());
  const c = $('#brandCard'); if (c) { c.outerHTML = fmtVal(brandCardHtml()); applySettingsSec(settingsSecNow()); }
}
CHANGE['brand-logo'] = async (el) => {
  const file = el.files && el.files[0]; el.value = '';
  if (!file) return;
  try {
    const k = el.dataset.k === 'logo_dark' ? 'logo_dark' : 'logo';
    const logo = await prepareLogo(file);
    const r = await api('brand.save', { [k]: logo });
    S.settings.brand = r.brand;
    refreshBrandEverywhere();
    toast(k === 'logo_dark' ? 'Koyu mod logosu güncellendi' : 'Açık mod logosu güncellendi');
  } catch (e) { toast(e.message, 'err'); }
};
CHANGE['brand-icon'] = async (el) => {
  const file = el.files && el.files[0]; el.value = '';
  if (!file) return;
  try {
    const r = await api('brand.save', await prepareIcon(file));
    S.settings.brand = r.brand;
    refreshBrandEverywhere();
    toast('Favicon ve uygulama simgesi güncellendi');
  } catch (e) { toast(e.message, 'err'); }
};
ACT['brand-del'] = async (el) => {
  const k = el.dataset.k;
  try {
    const r = await api('brand.save', k === 'icon' ? { icon: null, icon192: null, icon512: null } : { [k === 'logo_dark' ? 'logo_dark' : 'logo']: null });
    S.settings.brand = r.brand;
    refreshBrandEverywhere();
    toast(k === 'icon' ? 'Varsayılan simgeye dönüldü' : k === 'logo_dark' ? 'Koyu mod logosu kaldırıldı' : 'Açık mod logosu kaldırıldı');
  } catch (e) { toast(e.message, 'err'); }
};
const saveLogoH = debounce(async (h) => {
  try { const r = await api('brand.save', { logo_h: h }); S.settings.brand = r.brand; toast('Logo boyutu kaydedildi'); } catch (e) { toast(e.message, 'err'); }
}, 700);
CHANGE['brand-h'] = (el) => {
  const h = +el.value;
  S.settings.brand = { ...(S.settings.brand || {}), logo_h: h };
  applyBrand();
  const v = $('#logoHval'); if (v) v.textContent = h + ' px';
  saveLogoH(h);
};

/* =================================================================== */
/* Telefon rehberi: hastane dahilileri + ekip, tek aramada               */
/* =================================================================== */
const PB = { items: null, santral: '', q: '', people: null };
const pbFavKey = () => 'nm-pbfav-' + (S.me ? S.me.id : 0);
function pbFavs() { try { const a = JSON.parse(localStorage.getItem(pbFavKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function pbSaveFavs(a) { try { localStorage.setItem(pbFavKey(), JSON.stringify(a)); } catch (e) { /* */ } }
/** "2345 / 2346" -> ['2345', '2346'] */
function pbSplit(num) { return String(num || '').split(/\s*[/,]\s*/).map((x) => x.trim()).filter((x) => /\d/.test(x)); }
const pbDigits = (n) => String(n || '').replace(/[^\d+]/g, '');
function pbIsExt(n) { const d = String(n).replace(/\D/g, ''); return d.length >= 2 && d.length <= 5; }
/** Dahili, santral numarası varsa cep telefonundan "santral, bekle, dahili" olarak aranır */
function pbHref(n) {
  if (!pbIsExt(n)) return 'tel:' + pbDigits(n);
  return PB.santral ? 'tel:' + pbDigits(PB.santral) + ',' + pbDigits(n) : '';
}
function pbNumHtml(n) {
  const h = pbHref(n);
  return h ? html`<a class="pb-num" href="${h}" title="Ara">${icon('phone', 'sm')}<span>${n}</span></a>`
    : html`<button class="pb-num" data-act="pb-copy" data-n="${n}" title="Kopyala">${n}</button>`;
}
function pbRowHtml(it, favs, showCat = true) {
  const fav = favs.includes(it.id);
  const sub = [showCat ? it.category : '', it.note].filter(Boolean).join(' · ');
  return html`<div class="list-row pb-row ${it.pinned ? 'pinned' : ''}" data-id="${it.id}">
    <div class="grow" style="min-width:0"><div class="lr-t">${it.name}</div>${sub ? html`<div class="lr-s">${sub}</div>` : ''}</div>
    <div class="pb-nums">${pbSplit(it.number).map(pbNumHtml)}</div>
    <button class="btn ghost icon sm pb-fav ${fav ? 'on' : ''}" data-act="pb-fav" data-id="${it.id}" aria-label="${fav ? 'Sık arananlardan çıkar' : 'Sık arananlara ekle'}" aria-pressed="${fav ? 'true' : 'false'}">${icon('star', 'sm')}</button>
    ${isPublisher() ? html`<button class="btn ghost icon sm" data-act="pb-edit" data-id="${it.id}" aria-label="Düzenle">${icon('edit', 'sm')}</button>` : ''}
  </div>`;
}
function pbPersonHtml(p) {
  const nums = [p.extension, p.phone].filter(Boolean);
  return html`<div class="list-row pb-row">${avatar(p.name, 'sm', p.avatar || null)}
    <div class="grow" style="min-width:0"><div class="lr-t">${p.name}${p.today ? html` ${codeChip(p.today)}` : ''}</div><div class="lr-s">${[titleName(p.title_id), unitName(p.unit_id)].filter(Boolean).join(' · ') || 'Ekip'}</div></div>
    <div class="pb-nums">${nums.map(pbNumHtml)}</div></div>`;
}
async function renderPhonebook(view) {
  setHTML(view, html`<div class="page-head"><div><h1>Telefon rehberi</h1><p>Dahili numaralar ve ekip. Arayanın numarasını yazarak kim olduğunu da bulursunuz.</p></div>
      ${isPublisher() ? html`<div class="row wrap" style="gap:6px"><button class="btn primary" data-act="pb-add">${icon('plus', 'sm')}<span>Numara ekle</span></button><button class="btn" data-act="pb-import">${icon('upload', 'sm')}<span>Listeyi yapıştır</span></button><button class="btn" data-act="pb-santral">${icon('building', 'sm')}<span>Santral</span></button></div>` : ''}</div>
    <div class="search pb-search">${icon('search')}<input class="input" id="pbQ" type="search" enterkeyhint="search" placeholder="Birim, kişi veya numara ara" data-input="pb-q" value="${PB.q}" autocomplete="off" aria-label="Rehberde ara"></div>
    <div id="pbList"><div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>`);
  if (window.innerWidth > 900) { const q = $('#pbQ'); if (q) q.focus({ preventScroll: true }); }
  const [pb, pp] = await Promise.allSettled([api('phonebook.list'), api('people.list')]);
  if (pb.status === 'fulfilled') { PB.items = pb.value.items; PB.santral = pb.value.santral || ''; } else if (!PB.items) {
    setHTML($('#pbList') || document.createElement('div'), html`<div class="card empty"><p class="small">${pb.reason.message}</p></div>`); return;
  }
  if (pp.status === 'fulfilled') { PB.people = pp.value.people; syncPeopleAvatars(PB.people); }
  drawPhonebook();
}
function drawPhonebook() {
  const box = $('#pbList');
  if (!box || !PB.items) return;
  const favs = pbFavs();
  const q = avKey(PB.q);
  const qd = PB.q.replace(/\D/g, '');
  const hit = (txt, nums) => (!q || avKey(txt).includes(q)) || (qd.length >= 2 && /^[\d\s+()/-]+$/.test(PB.q.trim()) && nums.some((n) => n.replace(/\D/g, '').includes(qd)));
  const items = PB.items.filter((it) => hit([it.name, it.category, it.note, it.number].join(' '), pbSplit(it.number)));
  const people = (PB.people || []).filter((p) => (p.extension || p.phone) && hit([p.name, titleName(p.title_id), unitName(p.unit_id)].join(' '), [p.extension || '', p.phone || '']));
  const card = (title, ic, rows, cls = '') => html`<div class="sec-title">${icon(ic, 'sm')} ${title}</div><div class="card ${cls}"><div class="list">${rows}</div></div>`;
  if (!PB.items.length && !q) {
    setHTML(box, html`<div class="card empty"><div class="e-ico">${icon('phone')}</div><h3>Rehber henüz boş</h3>
      <p class="small">${isPublisher() ? html`Hastanenin dahili listesini Excel'den kopyalayıp <b>Listeyi yapıştır</b> ile tek seferde ekleyebilirsiniz.` : 'Yöneticiniz dahili numaraları eklediğinde burada görünür.'}</p>
      ${isPublisher() ? html`<div class="row" style="justify-content:center;gap:8px;margin-top:12px"><button class="btn primary" data-act="pb-import">${icon('upload', 'sm')}Listeyi yapıştır</button><button class="btn" data-act="pb-add">${icon('plus', 'sm')}Tek tek ekle</button></div>` : ''}</div>
      ${people.length ? card('Ekip', 'users', people.map(pbPersonHtml)) : ''}`);
    return;
  }
  if (q) {
    setHTML(box, items.length || people.length ? html`${items.length ? card(`${items.length} numara`, 'phone', items.map((it) => pbRowHtml(it, favs))) : ''}${people.length ? card('Ekip', 'users', people.map(pbPersonHtml)) : ''}`
      : html`<div class="card empty"><p class="small">“${PB.q}” için sonuç yok.</p></div>`);
    return;
  }
  const favItems = favs.map((id) => PB.items.find((x) => x.id === id)).filter(Boolean);
  const groups = new Map();
  PB.items.filter((it) => !it.pinned).forEach((it) => { const k = it.category || 'Diğer'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
  const pinned = PB.items.filter((it) => it.pinned);
  setHTML(box, html`
    ${!PB.santral && isPublisher() && PB.items.some((it) => pbSplit(it.number).some(pbIsExt)) ? html`<div class="banner info pb-tip">${icon('info')}<span>Santral numarasını girerseniz ekip cep telefonundan dahilileri tek dokunuşla arayabilir.</span><button class="btn sm" data-act="pb-santral">Santral gir</button></div>` : ''}
    ${favItems.length ? card('Sık aradıklarım', 'star', favItems.map((it) => pbRowHtml(it, favs))) : ''}
    ${pinned.length ? card('Acil ve önemli', 'alert', pinned.map((it) => pbRowHtml(it, favs)), 'pb-pinned') : ''}
    ${[...groups].map(([k, list]) => card(k, 'phone', list.map((it) => pbRowHtml(it, favs, false))))}
    ${people.length ? card('Ekip', 'users', people.map(pbPersonHtml)) : ''}`);
}
CHANGE['pb-q'] = debounce((el) => { PB.q = el.value; drawPhonebook(); }, 120);
ACT['pb-fav'] = (el) => {
  const id = +el.dataset.id;
  const f = pbFavs();
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.unshift(id);
  pbSaveFavs(f.slice(0, 30));
  toast(i >= 0 ? 'Sık arananlardan çıkarıldı' : 'Sık arananlara eklendi');
  drawPhonebook();
};
ACT['pb-copy'] = async (el) => {
  const n = el.dataset.n;
  try { await navigator.clipboard.writeText(n); toast(`${n} kopyalandı`); } catch (e) { toast(`Dahili: ${n}`); }
};
function pbForm(it) {
  const cats = [...new Set((PB.items || []).map((x) => x.category).filter(Boolean))];
  return html`<form class="stack" data-form="pb-save">
    <input type="hidden" name="id" value="${it ? it.id : ''}">
    <div class="field"><label>Ad</label><input class="input" name="name" required minlength="2" maxlength="120" value="${it ? it.name : ''}" placeholder="Örn. Radyoloji, Kan merkezi, Dr. Ayşe Yılmaz"></div>
    <div class="grid2">
      <div class="field"><label>Numara</label><input class="input" name="number" required maxlength="40" inputmode="tel" value="${it ? it.number : ''}" placeholder="2345 veya 2345 / 2346"></div>
      <div class="field"><label>Grup</label><input class="input" name="category" maxlength="60" list="pbCats" value="${it ? it.category : ''}" placeholder="Örn. Laboratuvar"><datalist id="pbCats">${cats.map((c) => html`<option value="${c}">`)}</datalist></div>
    </div>
    <div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" name="note" maxlength="200" value="${it ? it.note : ''}" placeholder="Örn. 2. kat, gece 16:00 sonrası"></div>
    <label class="switch"><input type="checkbox" name="pinned" ${it && it.pinned ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Acil ve önemli</b><span>Rehberin en üstünde ayrı gösterilir (ör. Beyaz kod, Güvenlik).</span></span></label>
    <div class="form-error hidden" data-err></div>
    <div class="row" style="gap:8px;justify-content:space-between">${it ? html`<button class="btn danger" type="button" data-act="pb-del" data-id="${it.id}">${icon('trash', 'sm')}Sil</button>` : html`<span></span>`}
      <button class="btn primary" type="submit">Kaydet</button></div>
  </form>`;
}
ACT['pb-add'] = () => { openModal({ title: 'Numara ekle', body: pbForm(null) }); };
ACT['pb-edit'] = (el) => { const it = (PB.items || []).find((x) => x.id === +el.dataset.id); if (it) openModal({ title: 'Numarayı düzenle', body: pbForm(it) }); };
FORMS['pb-save'] = async (f) => {
  const d = formData(f);
  try {
    const r = await api('phonebook.save', { ...d, id: d.id ? +d.id : null });
    PB.items = r.items; PB.santral = r.santral || '';
    const m = modalStack[modalStack.length - 1]; if (m) m.close();
    toast('Kaydedildi'); drawPhonebook();
  } catch (e) { showFormError(f, e.message); }
};
ACT['pb-del'] = async (el) => {
  const it = (PB.items || []).find((x) => x.id === +el.dataset.id);
  if (!it || !(await confirmDialog({ title: 'Numara silinsin mi?', text: `${it.name} (${it.number}) rehberden silinir.`, ok: 'Sil', danger: true }))) return;
  try {
    const r = await api('phonebook.delete', { id: it.id });
    PB.items = r.items;
    while (modalStack.length) modalStack[modalStack.length - 1].close();
    toast('Silindi'); drawPhonebook();
  } catch (e) { toast(e.message, 'err'); }
};
ACT['pb-santral'] = async () => {
  const v = await promptDialog({ title: 'Santral numarası', label: 'Hastanenin santral numarası', placeholder: '0312 123 45 67', value: PB.santral });
  if (v === null || v === undefined) return;
  try { const r = await api('phonebook.santral', { santral: v }); PB.santral = r.santral || ''; toast(PB.santral ? 'Santral kaydedildi. Dahililer artık cepten aranabilir.' : 'Santral numarası kaldırıldı'); drawPhonebook(); } catch (e) { toast(e.message, 'err'); }
};

/** Yapıştırılan metni satırlara ayırır. Excel'den kopyalanan sütunlar (sekme/;) veya "Radyoloji 2345" biçimi.
 *  Numarasız kısa satırlar (ör. "LABORATUVAR") bir sonraki satırların grubu olur. */
function pbParsePaste(text, defCat) {
  const out = [];
  let cat = defCat || '';
  const numLike = (c) => /\d/.test(c) && /^[\d\s+()/.,-]+$/.test(c) && c.replace(/\D/g, '').length >= 2;
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.replace(/ /g, ' ').trim();
    if (!line) continue;
    const cells = line.split(/\t|;|\s{3,}/).map((c) => c.trim()).filter(Boolean);
    let name = '', num = '', note = '';
    if (cells.length > 1) {
      const nums = cells.filter(numLike);
      const words = cells.filter((c) => !numLike(c));
      if (!nums.length) { if (!defCat && words.length === 1 && words[0].length <= 60) cat = words[0]; continue; }
      num = nums.join(' / ');
      name = words[0] || '';
      note = words.slice(1).join(' · ');
    } else {
      const m = /^(.*?\D)[\s:.=–-]*((?:\+?[\d(][\d\s()-]*\d)(?:\s*[/,]\s*[\d\s()-]*\d)*)$/.exec(line) || null;
      const m2 = !m && /^((?:\+?[\d(][\d\s()-]*\d)(?:\s*[/,]\s*[\d\s()-]*\d)*)[\s:.=–-]+(\D.*)$/.exec(line);
      if (m && m[2].replace(/\D/g, '').length >= 2) { name = m[1]; num = m[2]; }
      else if (m2 && m2[1].replace(/\D/g, '').length >= 2) { num = m2[1]; name = m2[2]; }
      else { if (!defCat && !/\d/.test(line) && line.length <= 60) cat = line.replace(/:$/, ''); continue; }
    }
    name = name.replace(/[\s:.=–-]+$/, '').trim();
    if (name.length < 2) continue;
    out.push({ name: name.slice(0, 120), number: num.trim().replace(/\s+/g, ' ').slice(0, 40), category: cat.slice(0, 60), note: note.slice(0, 200) });
  }
  return out;
}
ACT['pb-import'] = () => {
  const m = openModal({
    title: 'Listeyi yapıştır', size: 'wide',
    body: html`<div class="stack">
      <p class="small muted">Excel'deki dahili listesini seçip kopyalayın ve aşağıya yapıştırın. Her satırda bir ad ve numara olsun; numarası olmayan başlık satırları (ör. <b>LABORATUVAR</b>) altındaki satırların grubu olur.</p>
      <textarea class="textarea" id="pbPaste" style="min-height:180px" placeholder="ACİL SERVİS&#10;Acil triaj	2201&#10;Acil sorumlu hemşire	2205 / 2206&#10;LABORATUVAR&#10;Biyokimya 2310&#10;Kan merkezi: 2315"></textarea>
      <div class="grid2"><div class="field"><label>Grup <span class="faint">(boşsa başlık satırlarından alınır)</span></label><input class="input" id="pbCat" maxlength="60" placeholder="Örn. Birimler"></div>
        <label class="switch" style="align-self:end"><input type="checkbox" id="pbReplace"><span class="track"></span><span class="s-text"><b>Mevcut rehberi değiştir</b><span>Açıksa eski numaralar silinir.</span></span></label></div>
      <div id="pbPrev" class="small muted">Önizleme burada görünür.</div></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="pbImpBtn" data-act="pb-import-go" disabled>Ekle</button>`,
  });
  m.guard = () => !!$('#pbPaste', m.el).value.trim();
  const prev = () => {
    const rows = pbParsePaste($('#pbPaste', m.el).value, $('#pbCat', m.el).value.trim());
    m.rows = rows;
    $('#pbImpBtn', m.el).disabled = !rows.length;
    $('#pbImpBtn', m.el).textContent = rows.length ? `${rows.length} numarayı ekle` : 'Ekle';
    setHTML($('#pbPrev', m.el), rows.length ? html`<div class="pb-prev"><table class="t"><thead><tr><th>Ad</th><th>Numara</th><th>Grup</th></tr></thead><tbody>${rows.slice(0, 8).map((r) => html`<tr><td>${r.name}</td><td>${r.number}</td><td class="faint">${r.category || '—'}</td></tr>`)}</tbody></table>${rows.length > 8 ? html`<div class="tiny faint" style="margin-top:6px">… ve ${rows.length - 8} satır daha</div>` : ''}</div>`
      : 'Önizleme burada görünür.');
  };
  $('#pbPaste', m.el).addEventListener('input', debounce(prev, 150));
  $('#pbCat', m.el).addEventListener('input', debounce(prev, 150));
  PB.importModal = m;
};
ACT['pb-import-go'] = async (el) => {
  const m = PB.importModal;
  if (!m || !m.rows || !m.rows.length) return;
  const replace = $('#pbReplace', m.el).checked;
  if (replace && (PB.items || []).length && !(await confirmDialog({ title: 'Rehber yenilensin mi?', text: `Mevcut ${PB.items.length} numara silinip yapıştırdığınız ${m.rows.length} numara eklenecek.`, ok: 'Yenile', danger: true }))) return;
  el.disabled = true;
  try {
    const r = await api('phonebook.import', { items: m.rows, replace });
    PB.items = r.items; PB.santral = r.santral || '';
    m.guard = null; m.close();
    toast(`${r.added} numara eklendi${r.skipped ? `, ${r.skipped} tekrar atlandı` : ''}`);
    drawPhonebook();
  } catch (e) { el.disabled = false; toast(e.message, 'err'); }
};
