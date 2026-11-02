/* NöbetMed — kabuk, içerik akışı, içerik detayı ve editör */
'use strict';

/* ================= Kabuk ================= */
function renderShell() {
  setHTML(APP(), html`
  <div class="shell" id="shell">
    <aside class="sidebar" id="sidebar"></aside>
    <div class="main">
      <div id="bannerSlot"></div>
      <header class="topbar">
        <button class="btn ghost icon mobile-only" data-act="nav-open" aria-label="Menü">${icon('menu')}</button>
        <form class="search" data-form="search" role="search">
          ${icon('search')}
          <input class="input" id="searchInput" name="q" type="search" placeholder="İçeriklerde ara…" autocomplete="off">
          <kbd>/</kbd>
        </form>
        <div class="grow desk-only"></div>
        <button class="btn primary desk-only" data-act="compose">${icon('plus')}Yeni içerik</button>
        ${notifButtonHtml()}
        <button class="btn ghost icon" data-act="theme" aria-label="Tema" id="themeBtn">${icon(isDark() ? 'sun' : 'moon')}</button>
      </header>
      <div class="content" id="view"></div>
    </div>
    <nav class="bottom-nav no-print" id="bottomNav"></nav>
  </div>`);
  renderNav();
  renderBanner();
  updateNotifBadge();
}

function renderBanner() {
  const slot = $('#bannerSlot');
  if (!slot) return;
  const st = S.settings;
  if (!st.banner_on || !st.banner_text || S.bannerHidden) return setHTML(slot, '');
  setHTML(slot, html`<div class="banner ${st.banner_tone || 'danger'}">${icon(st.banner_tone === 'success' ? 'checkCircle' : st.banner_tone === 'info' ? 'info' : 'alert')}<span>${st.banner_text}</span><button class="x" data-act="hide-banner" aria-label="Gizle">${icon('x', 'sm')}</button></div>`);
}
ACT['hide-banner'] = () => { S.bannerHidden = true; renderBanner(); };

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });
}

function navItem(href, ic, label, count, active, countCls = '') {
  return html`<a class="nav-item ${active ? 'active' : ''}" href="${href}">${ic}<span class="grow">${label}</span>${count ? html`<span class="count ${countCls}">${count > 99 ? '99+' : count}</span>` : ''}</a>`;
}

function renderNav() {
  const r = currentRoute();
  const c = S.counts;
  const me = S.me;
  const pendingAdmin = (c.pending_posts || 0) + (c.pending_users || 0);
  setHTML($('#sidebar'), html`
    <div class="brand">${BRAND_MARK}<div class="grow"><div class="brand-name">Nöbet<span>Med</span></div><div class="brand-org ellipsis">${S.settings.org_name}</div></div></div>
    ${navItem('#/', icon('home'), 'Ana sayfa', c.unread, !r[0])}
    ${navItem('#/okunacak', icon('checkCircle'), 'Okumam gerekenler', c.todo, r[0] === 'okunacak', 'warn')}
    ${navItem('#/kaydedilenler', icon('bookmark'), 'Kaydedilenler', 0, r[0] === 'kaydedilenler')}
    <div class="nav-sec">Nöbet</div>
    ${navItem('#/nobetim', icon('calendar'), 'Nöbetlerim', 0, r[0] === 'nobetim')}
    ${navItem('#/rehber', icon('phone'), 'Kim nöbette · Rehber', 0, r[0] === 'rehber')}
    ${S.rosters.length ? S.rosters.map((ro) => navItem('#/nobet/' + ro.id, icon('table'), ro.name, 0, r[0] === 'nobet' && (+r[1] === ro.id || (!r[1] && RS.active === ro.id))))
      : navItem('#/nobet', icon('table'), 'Nöbet listeleri', 0, r[0] === 'nobet')}
    <div class="nav-sec">Bölümler</div>
    ${S.categories.map((cat) => navItem('#/b/' + cat.id, html`<span class="cat-ico sm tone-${cat.color}">${icon(cat.icon)}</span>`, cat.name, (c.unread_by_cat || {})[cat.id] || 0, r[0] === 'b' && +r[1] === cat.id, 'muted'))}
    ${isPublisher() ? html`
      <div class="nav-sec">Yönetim</div>
      ${navItem('#/yonetim/onaylar', icon('inbox'), 'Onay bekleyenler', c.pending_posts, r[0] === 'yonetim' && (r[1] || 'onaylar') === 'onaylar', 'warn')}
      ${isAdmin() ? html`
        ${navItem('#/yonetim/kullanicilar', icon('users'), 'Kullanıcılar', c.pending_users, r[0] === 'yonetim' && r[1] === 'kullanicilar', 'warn')}
        ${navItem('#/yonetim/yapi', icon('layers'), 'Bölüm ve birimler', 0, r[0] === 'yonetim' && r[1] === 'yapi')}
        ${navItem('#/yonetim/raporlar', icon('chart'), 'Okuma raporu', 0, r[0] === 'yonetim' && r[1] === 'raporlar')}
        ${navItem('#/yonetim/gunluk', icon('history'), 'İşlem günlüğü', 0, r[0] === 'yonetim' && r[1] === 'gunluk')}
        ${navItem('#/yonetim/ayarlar', icon('sliders'), 'Ayarlar', 0, r[0] === 'yonetim' && r[1] === 'ayarlar')}` : html`
        ${navItem('#/yonetim/raporlar', icon('chart'), 'Okuma raporu', 0, r[0] === 'yonetim' && r[1] === 'raporlar')}`}` : ''}
    <div class="sidebar-foot">
      <button class="me-card" data-act="me-menu">${avatar(me.name)}<div class="grow"><div class="n ellipsis">${me.name}</div><div class="t ellipsis">${titleName(me.title_id) || ROLE_LABEL[me.role]}${unitName(me.unit_id) ? ' · ' + unitName(me.unit_id) : ''}</div></div>${icon('more', 'sm')}</button>
    </div>`);
  const tab = (href, ic, label, on, count, cls = '') => html`<button class="${on ? 'on' : ''} ${cls}" data-act="go" data-href="${href}">${ic}<span>${label}</span>${count ? html`<span class="count">${count > 99 ? '99+' : count}</span>` : ''}</button>`;
  setHTML($('#bottomNav'), html`
    ${tab('#/', icon('home'), 'Ana sayfa', !r[0], c.unread)}
    ${tab('#/nobet', icon('table'), 'Nöbet', r[0] === 'nobet', 0)}
    <button class="plus" data-act="compose" aria-label="Yeni içerik"><span class="pl">${icon('plus')}</span></button>
    ${tab('#/okunacak', icon('checkCircle'), 'Okunacak', r[0] === 'okunacak', c.todo)}
    ${isPublisher() ? tab('#/yonetim', icon('inbox'), 'Yönetim', r[0] === 'yonetim', pendingAdmin) : tab('#/profil', icon('user'), 'Hesabım', r[0] === 'profil', 0)}`);
}

ACT.go = (el) => { location.hash = el.dataset.href; };
ACT['nav-open'] = () => $('#shell').classList.add('nav-open');
document.addEventListener('click', (e) => {
  const sh = $('#shell');
  if (sh && sh.classList.contains('nav-open') && !e.target.closest('.sidebar') && !e.target.closest('[data-act="nav-open"]')) sh.classList.remove('nav-open');
});
ACT.theme = () => {
  setTheme(isDark() ? 'light' : 'dark');
  const b = $('#themeBtn');
  if (b) setHTML(b, icon(isDark() ? 'sun' : 'moon'));
};
ACT['me-menu'] = (el) => openMenu(el, [
  { head: html`<div class="small"><b>${S.me.name}</b><div class="faint">${S.me.email}</div></div>` },
  { id: 'p', icon: 'user', label: 'Hesabım ve gönderilerim', run: () => { location.hash = '#/profil'; } },
  { id: 't', icon: isDark() ? 'sun' : 'moon', label: isDark() ? 'Açık tema' : 'Koyu tema', run: () => ACT.theme() },
  '-',
  { id: 'o', icon: 'logout', label: 'Çıkış yap', danger: true, run: logout },
]);
async function logout() {
  // Ortak cihazlarda başkasının bildirimleri gelmesin
  if (typeof pushDisable === 'function' && S.settings.push_ready) { try { await Promise.race([pushDisable(), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* */ } }
  try { await api('auth.logout'); } catch (e) { /* */ }
  S.me = null;
  offlineCacheClear();
  if (typeof pwaClearFileCache === 'function') pwaClearFileCache();
  location.hash = '';
  await start();
}
FORMS.search = (f) => {
  const q = f.q.value.trim();
  if (q) location.hash = '#/ara/' + encodeURIComponent(q);
  f.q.blur();
};
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, select') && $('#searchInput') && !modalStack.length) {
    e.preventDefault();
    $('#searchInput').focus();
  }
});

async function refreshCounts() {
  try {
    const r = await api('counts');
    S.counts = r.counts;
    renderNav();
    updateNotifBadge();
    $$('[data-count]').forEach((el) => { el.textContent = S.counts[el.dataset.count] || 0; });
    if (FEED && document.body.contains(FEED.host) && !FEED.loading) renderFeed();
  } catch (e) { /* sessiz */ }
}

/* ================= Yönlendirme ================= */
function route() {
  if (!S.me || !$('#view')) return;
  closeMenu();
  const sh = $('#shell');
  if (sh) sh.classList.remove('nav-open');
  const r = currentRoute();
  const view = $('#view');
  const si = $('#searchInput');
  if (si && r[0] !== 'ara') si.value = '';
  switch (r[0]) {
    case undefined: renderHome(view); break;
    case 'b': renderFeedPage(view, { cat: +r[1] }); break;
    case 'okunacak': renderFeedPage(view, { filter: 'todo', fixed: true }); break;
    case 'kaydedilenler': renderFeedPage(view, { filter: 'saved', fixed: true }); break;
    case 'ara': if (si) si.value = r[1] || ''; renderFeedPage(view, { q: r[1] || '' }); break;
    case 'nobet':
      if (RS.stage && document.body.contains(RS.stage) && rosterById(+r[1])) { showRoster(+r[1]); return; }
      renderRosters(view, +r[1] || null);
      break;
    case 'yonetim': if (isPublisher()) { renderAdmin(view, r[1] || 'onaylar'); } else location.hash = '#/'; break;
    case 'profil': renderProfile(view); break;
    case 'nobetim': renderMyShifts(view); break;
    case 'rehber': renderDirectory(view); break;
    case 'p':
      history.replaceState(null, '', '#/');
      renderHome(view);
      openPost(+r[1]);
      break;
    default: location.hash = '#/';
  }
  renderNav();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ================= Ana sayfa ================= */
function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

function renderHome(view) {
  const c = S.counts;
  const first = S.me.name.split(' ')[0];
  const now = new Date();
  setHTML(view, html`
    <div class="page-head">
      <div><h1>${greeting()}, ${first}</h1><p>${now.getDate()} ${TR_MONTHS[now.getMonth()]} ${now.getFullYear()}, ${TR_DAYS[now.getDay()]}</p></div>
    </div>
    <div class="kpis">
      <a class="kpi" href="#/okunacak">
        <div class="k-top"><span>Okumanız gereken</span><span class="k-ico" style="background:var(--warn-soft);color:var(--warn)">${icon('checkCircle', 'sm')}</span></div>
        <div class="k-val" data-count="todo">${c.todo}</div><div class="k-sub">${c.todo ? 'Onayınızı bekleyen zorunlu içerik' : 'Hepsi tamam, teşekkürler'}</div>
      </a>
      <button class="kpi" data-act="feed-filter" data-filter="unread">
        <div class="k-top"><span>Yeni içerik</span><span class="k-ico" style="background:var(--brand-soft);color:var(--brand-text)">${icon('bell', 'sm')}</span></div>
        <div class="k-val" data-count="unread">${c.unread}</div><div class="k-sub">Henüz açmadığınız</div>
      </button>
      ${myShiftKpiHtml()}
      ${isPublisher() ? html`
      <a class="kpi" href="#/yonetim/onaylar">
        <div class="k-top"><span>Onay bekleyen</span><span class="k-ico" style="background:var(--danger-soft);color:var(--danger)">${icon('inbox', 'sm')}</span></div>
        <div class="k-val" data-count="pending_posts">${c.pending_posts}</div><div class="k-sub">${isAdmin() && c.pending_users ? c.pending_users + ' yeni üye başvurusu' : 'İçerik onayı'}</div>
      </a>` : html`
      <a class="kpi" href="#/kaydedilenler">
        <div class="k-top"><span>Kaydedilenler</span><span class="k-ico" style="background:var(--c-amber-bg);color:var(--c-amber)">${icon('bookmark', 'sm')}</span></div>
        <div class="k-val" data-count="saved">${c.saved}</div><div class="k-sub">Hızlı erişim listeniz</div>
      </a>`}
    </div>
    <div class="home-grid">
      <section id="feedHost"></section>
      <aside class="side-col" id="homeSide">
        <div id="homeTips"></div>
        <div class="card" id="todayCard"><div class="card-head"><h3>${icon('users', 'sm')} Bugün nöbette</h3></div><div class="list-row"><div class="skel" style="height:14px;width:70%"></div></div></div>
        <div class="card" id="rosterCard">${rosterCard()}</div>
      </aside>
    </div>`);
  mountFeed($('#feedHost'), { filter: 'all' });
  loadHomeExtras();
  refreshRosters().then(() => {
    const k = $('#kpiRoster'); if (k) k.outerHTML = fmtVal(rosterKpi());
    const c = $('#rosterCard'); if (c) setHTML(c, rosterCard());
  });
}

function latestRoster() {
  return S.rosters.filter((r) => r.file).sort((a, b) => b.file.updated_at.localeCompare(a.file.updated_at))[0] || null;
}
function rosterKpi() {
  const r = latestRoster();
  return html`<a class="kpi" href="${r ? '#/nobet/' + r.id : '#/nobet'}" id="kpiRoster">
    <div class="k-top"><span>Nöbet listesi</span><span class="k-ico" style="background:var(--info-soft);color:var(--info)">${icon('table', 'sm')}</span></div>
    ${r ? html`<div class="k-val sm ellipsis">${r.name}</div><div class="k-sub">${fmtRel(r.file.updated_at)} güncellendi</div>`
      : html`<div class="k-val sm">Henüz yüklenmedi</div><div class="k-sub">Excel listeleri burada açılır</div>`}
  </a>`;
}
function rosterCard() {
  return html`<div class="card-head"><h3>Nöbet listeleri</h3>${isPublisher() ? html`<a class="small" href="#/nobet">Yönet</a>` : ''}</div>
    <div class="list">${S.rosters.length ? S.rosters.map((r) => html`<a class="list-row" href="#/nobet/${r.id}" style="color:inherit;text-decoration:none">
      <span class="cat-ico sm tone-emerald">${icon('table')}</span>
      <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${r.name}</div><div class="lr-s">${r.file ? fmtRel(r.file.updated_at) + ' güncellendi' : 'Henüz yüklenmedi'}</div></div>
      ${r.file && isFresh(r.file.updated_at) ? html`<span class="badge brand">Yeni</span>` : ''}${icon('chevR', 'sm')}
    </a>`) : html`<div class="list-row small muted">Henüz liste oluşturulmadı.</div>`}</div>`;
}

/* ================= Akış ================= */
let FEED = null;
const FILTERS = [
  ['all', 'Tümü'], ['unread', 'Okunmamış'], ['todo', 'Okumam gerekenler'], ['saved', 'Kaydedilenler'],
];

function renderFeedPage(view, opts) {
  let head;
  if (opts.cat) {
    const cat = byId(S.categories, opts.cat);
    if (!cat) { location.hash = '#/'; return; }
    head = html`<div class="row" style="gap:12px">${catIcon(cat)}<div><h1>${cat.name}</h1><p>Bu bölümdeki tüm içerikler</p></div></div>`;
  } else if (opts.filter === 'todo') {
    head = html`<div><h1>Okumam gerekenler</h1><p>Okuduğunuzu onaylamanız beklenen zorunlu içerikler</p></div>`;
  } else if (opts.filter === 'saved') {
    head = html`<div><h1>Kaydedilenler</h1><p>Hızlı erişim için işaretlediğiniz içerikler</p></div>`;
  } else {
    head = html`<div><h1>Arama sonuçları</h1><p>“${opts.q}” için bulunan içerikler</p></div>`;
  }
  setHTML(view, html`<div class="page-head">${head}</div><section id="feedHost"></section>`);
  mountFeed($('#feedHost'), { filter: opts.filter || 'all', cat: opts.cat || null, q: opts.q || '', fixed: opts.fixed });
}

function mountFeed(host, { filter = 'all', cat = null, q = '', fixed = false }) {
  FEED = { host, filter, cat, q, fixed, items: [], offset: 0, hasMore: false, loading: false, token: 0 };
  renderFeed();
  loadFeed(true);
}

function renderFeed() {
  const F = FEED;
  if (!F || !document.body.contains(F.host)) return;
  const c = S.counts;
  const countFor = { unread: F.cat ? (c.unread_by_cat || {})[F.cat] : c.unread, todo: F.cat ? 0 : c.todo };
  const toolbar = F.fixed || F.q ? '' : html`
    <div class="toolbar">
      <div class="seg" role="tablist">${FILTERS.map(([k, label]) => html`<button class="${F.filter === k ? 'on' : ''}" data-act="feed-filter" data-filter="${k}">${label}${countFor[k] ? html`<span class="count ${k === 'todo' ? 'warn' : ''}">${countFor[k]}</span>` : ''}</button>`)}</div>
    </div>`;
  let list;
  if (F.loading && !F.items.length) {
    list = html`<div class="feed">${[1, 2, 3].map(() => html`<div class="post" style="cursor:default"><div class="skel" style="width:34px;height:34px;border-radius:9px"></div><div class="p-body"><div class="skel" style="height:11px;width:30%;margin-bottom:10px"></div><div class="skel" style="height:15px;width:80%;margin-bottom:8px"></div><div class="skel" style="height:12px;width:95%"></div></div></div>`)}</div>`;
  } else if (!F.items.length) {
    const msg = {
      unread: ['Okunmamış içerik yok', 'Tüm içerikleri görüntülediniz.'],
      todo: ['Bekleyen zorunlu okuma yok', 'Onaylamanız gereken bir içerik kalmadı.'],
      saved: ['Kaydedilen içerik yok', 'İçeriklerdeki yer imi simgesiyle kaydedebilirsiniz.'],
      pending: ['Onay bekleyen içerik yok', 'Ekibin gönderdiği içerikler burada onayınıza sunulur.'],
      mine: ['Henüz içerik göndermediniz', 'Eklediğiniz duyuru ve belgelerin durumunu burada takip edebilirsiniz.'],
    }[F.filter] || (F.q ? ['Sonuç bulunamadı', 'Farklı bir kelimeyle aramayı deneyin.'] : ['Henüz içerik yok', 'İlk duyuruyu veya belgeyi eklemek için “Yeni içerik” butonunu kullanın.']);
    list = html`<div class="card empty"><div class="e-ico">${icon(F.filter === 'saved' ? 'bookmark' : F.filter === 'todo' ? 'checkCircle' : 'inbox', 'lg')}</div><h3>${msg[0]}</h3><p class="small">${msg[1]}</p></div>`;
  } else {
    list = html`<div class="feed">${F.items.map(postCard)}</div>
      ${F.hasMore ? html`<div style="text-align:center;margin-top:14px"><button class="btn" data-act="feed-more" ${F.loading ? raw('disabled') : ''}>${F.loading ? 'Yükleniyor…' : 'Daha fazla göster'}</button></div>` : ''}`;
  }
  setHTML(F.host, html`${toolbar}${list}`);
}

async function loadFeed(reset) {
  const F = FEED;
  if (!F) return;
  const token = ++F.token;
  if (reset) { F.items = []; F.offset = 0; }
  F.loading = true;
  renderFeed();
  try {
    const r = await api('posts.list', { filter: F.filter, category_id: F.cat, q: F.q, offset: F.offset });
    if (token !== F.token || FEED !== F) return;
    F.items = F.items.concat(r.items);
    F.offset = F.items.length;
    F.hasMore = r.has_more;
  } catch (e) {
    toast(e.message, 'err');
  }
  if (token !== F.token) return;
  F.loading = false;
  renderFeed();
}
ACT['feed-filter'] = (el) => {
  if (!FEED || !document.body.contains(FEED.host)) return;
  FEED.filter = el.dataset.filter;
  loadFeed(true);
  if (el.classList.contains('kpi')) FEED.host.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
ACT['feed-more'] = () => loadFeed(false);

function reloadCurrent() {
  refreshCounts();
  if (FEED && document.body.contains(FEED.host)) loadFeed(true);
  if (typeof onAdminChanged === 'function') onAdminChanged();
}

function postBadges(p, full) {
  const out = [];
  if (p.status === 'pending') out.push(html`<span class="badge warn">${icon('clock')}Onay bekliyor</span>`);
  if (p.status === 'rejected') out.push(html`<span class="badge danger">${icon('x')}Reddedildi</span>`);
  if (p.pinned) out.push(html`<span class="badge brand">${icon('pin')}Sabit</span>`);
  if (p.required && p.status === 'published') {
    out.push(p.acked ? html`<span class="badge success">${icon('check')}Okudunuz</span>` : html`<span class="badge warn">${icon('alert')}Okumanız gerekiyor</span>`);
  }
  if (p.unit_id) out.push(html`<span class="badge">${icon('building')}${unitName(p.unit_id)}</span>`);
  if (!full && p.att_count) out.push(html`<span class="badge">${icon('paperclip')}${p.att_count}</span>`);
  return out;
}

function ackMini(p) {
  if (!p.required || p.status !== 'published' || !isPublisher()) return '';
  const pct = p.audience ? Math.min(100, Math.round((p.ack_count / p.audience) * 100)) : 0;
  return html`<span class="ack-mini" title="Okundu onayı"><span class="progress"><span style="width:${pct}%"></span></span>${p.ack_count}/${p.audience}</span>`;
}

function postCard(p) {
  const cat = catOf(p.category_id);
  const unread = p.status === 'published' && !p.viewed;
  return html`
  <div class="post ${unread ? 'unread' : ''}" role="button" tabindex="0" data-act="open-post" data-id="${p.id}">
    ${catIcon(cat)}
    <div class="p-body">
      <div class="p-meta"><span style="color:var(--c-${cat.color});font-weight:600">${cat.name}</span><span class="sep"></span><span>${p.author_name}</span><span class="sep"></span><span>${fmtRel(p.published_at || p.created_at)}</span>${unread ? html`<span class="dot" title="Yeni" style="margin-left:2px"></span>` : ''}</div>
      <h3>${p.title}</h3>
      <p class="p-ex">${p.excerpt}</p>
      ${p.match ? html`<p class="p-match">${icon(p.match.where === 'file' ? 'paperclip' : 'search', 'sm')}${p.match.where === 'file' ? html`<b>${p.match.file}</b>: ` : ''}${hiText(p.match.text, FEED && FEED.q)}</p>` : ''}
      ${(() => { const b = postBadges(p); const a = ackMini(p); return b.length || fmtVal(a) ? html`<div class="p-foot">${b}${a}</div>` : ''; })()}
    </div>
    ${p.status === 'published' ? html`<div class="p-side"><button class="bm ${p.saved ? 'on' : ''}" data-act="bookmark" data-id="${p.id}" aria-label="${p.saved ? 'Kaydı kaldır' : 'Kaydet'}" title="${p.saved ? 'Kaydı kaldır' : 'Kaydet'}">${icon('bookmark')}</button></div>` : ''}
  </div>`;
}
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.post[data-act]')) { e.preventDefault(); e.target.click(); }
});

ACT['open-post'] = (el) => openPost(+el.dataset.id);
ACT.bookmark = async (el) => {
  const id = +el.dataset.id;
  const on = !el.classList.contains('on');
  el.classList.toggle('on', on);
  try {
    await api('posts.bookmark', { id, saved: on });
    const it = FEED && FEED.items.find((x) => x.id === id);
    if (it) it.saved = on;
    S.counts.saved += on ? 1 : -1;
    toast(on ? 'Kaydedilenlere eklendi' : 'Kaydedilenlerden çıkarıldı');
    if (FEED && FEED.filter === 'saved' && !on) loadFeed(true);
  } catch (e) { el.classList.toggle('on', !on); toast(e.message, 'err'); }
};

/* ================= Ekler ================= */
function fileKind(mime, name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (mime.startsWith('image/')) return { k: 'image', label: (ext || 'IMG').toUpperCase().slice(0, 4), tone: 'violet' };
  if (mime.startsWith('video/')) return { k: 'video', label: (ext || 'VID').toUpperCase().slice(0, 4), tone: 'rose' };
  if (mime.startsWith('audio/')) return { k: 'audio', label: (ext || 'SES').toUpperCase().slice(0, 4), tone: 'amber' };
  if (mime === 'application/pdf') return { k: 'pdf', label: 'PDF', tone: 'rose' };
  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv'].includes(ext)) return { k: 'sheet', label: ext.toUpperCase(), tone: 'emerald' };
  if (['doc', 'docx'].includes(ext)) return { k: 'doc', label: ext.toUpperCase(), tone: 'sky' };
  if (['ppt', 'pptx'].includes(ext)) return { k: 'slide', label: ext.toUpperCase(), tone: 'amber' };
  return { k: 'file', label: (ext || 'DOSYA').toUpperCase().slice(0, 4), tone: 'slate' };
}
function attachmentsBlock(atts) {
  if (!atts || !atts.length) return '';
  const auto = atts.filter((a) => previewKind(a) !== 'none').slice(0, 4).map((a) => a.id);
  return html`<div class="stack" style="gap:10px">
    <div class="label">${icon('paperclip', 'sm')} Ekler (${atts.length})</div>
    ${atts.map((a) => fileCard(a, auto.includes(a.id)))}
  </div>`;
}

/* ================= İçerik detayı ================= */
let DETAIL = null;

async function openPost(id) {
  const m = openModal({ title: 'İçerik', drawer: true, body: html`<div style="display:grid;place-items:center;padding:60px"><div class="spinner"></div></div>` });
  DETAIL = { m, id, post: null, tab: 'readers' };
  try {
    const r = await api('posts.get', { id });
    DETAIL.post = r.post;
    renderDetail();
    // okunmamış göstergesini güncelle
    const it = FEED && FEED.items.find((x) => x.id === id);
    if (it && !it.viewed) { it.viewed = true; renderFeed(); refreshCounts(); }
  } catch (e) {
    m.setBody(html`<div class="empty"><div class="e-ico">${icon('lock', 'lg')}</div><h3>Açılamadı</h3><p>${e.message}</p></div>`);
  }
}

function canEdit(p) {
  return isPublisher() || (p.author_id === S.me.id && p.status !== 'published');
}

function renderDetail() {
  const { m, post: p } = DETAIL;
  const cat = catOf(p.category_id);
  m.setTitle(cat.name);
  const ackBox = p.required && p.status === 'published' ? (p.acked
    ? html`<div class="ack-box done">${icon('checkCircle', 'lg')}<div class="grow"><b>Okudunuz ve onayladınız</b><div class="small muted">Teşekkürler, onayınız kaydedildi.</div></div></div>`
    : html`<div class="ack-box todo"><span style="color:var(--warn)">${icon('alert', 'lg')}</span><div class="grow"><b>Bu içeriği okuduğunuzu onaylayın</b><div class="small muted">Zorunlu okuma olarak işaretlendi.</div></div><button class="btn primary" data-act="ack" data-id="${p.id}">${icon('check')}Okudum, anladım</button></div>`) : '';
  const statusNote = p.status === 'pending'
    ? html`<div class="form-note warn">${isPublisher() ? 'Bu içerik onayınızı bekliyor. Onayladığınızda tüm ilgili üyelere yayınlanır.' : 'İçeriğiniz yönetici onayı bekliyor. Onaylanınca yayınlanacak.'}</div>`
    : p.status === 'rejected' ? html`<div class="form-note" style="background:var(--danger-soft);color:var(--danger)"><b>Reddedildi.</b> ${p.reject_reason || 'Gerekçe belirtilmedi.'} ${p.author_id === S.me.id ? 'Düzenleyip tekrar gönderebilirsiniz.' : ''}</div>` : '';

  let readers = '';
  if (p.readers) {
    const total = p.readers.length + p.missing.length;
    const pct = total ? Math.round((p.readers.length / total) * 100) : 0;
    const list = DETAIL.tab === 'readers' ? p.readers : p.missing;
    readers = html`
      <div class="card">
        <div class="card-head"><h3>Okuma durumu</h3><span class="small muted"><b style="color:var(--text)">${p.readers.length}</b> / ${total} kişi · %${pct}</span></div>
        <div style="padding:12px 18px 0"><div class="progress"><span style="width:${pct}%"></span></div></div>
        <div class="seg" style="margin:12px 18px 4px">
          <button class="${DETAIL.tab === 'readers' ? 'on' : ''}" data-act="readers-tab" data-tab="readers">Okuyanlar <span class="count muted">${p.readers.length}</span></button>
          <button class="${DETAIL.tab === 'missing' ? 'on' : ''}" data-act="readers-tab" data-tab="missing">Okumayanlar <span class="count ${p.missing.length ? 'warn' : 'muted'}">${p.missing.length}</span></button>
        </div>
        <div class="list" style="max-height:280px;overflow:auto">
          ${list.length ? list.map((u) => html`<div class="list-row">${avatar(u.name, 'sm')}<div class="grow"><div class="lr-t">${u.name}</div><div class="lr-s">${titleName(u.title_id)}</div></div>${u.at ? html`<span class="tiny faint">${fmtRel(u.at)}</span>` : ''}</div>`)
            : html`<div class="list-row muted small">${DETAIL.tab === 'readers' ? 'Henüz kimse onaylamadı.' : 'Herkes okudu.'}</div>`}
        </div>
        ${DETAIL.tab === 'missing' && p.missing.length ? html`<div class="row wrap" style="padding:10px 18px 14px">
          ${S.settings.mail_ready ? html`<button class="btn sm primary" data-act="remind">${icon('send', 'sm')}Okumayanlara e-posta ile hatırlat</button>` : ''}
          <button class="btn sm" data-act="copy-missing">${icon('copy', 'sm')}Listeyi kopyala</button></div>` : ''}
      </div>`;
  }

  m.setBody(html`
    <div class="stack" style="gap:18px">
      ${statusNote}
      <div class="stack" style="gap:10px">
        ${(() => { const b = postBadges(p, true); if (p.review_at && isPublisher()) b.push(reviewBadge(p.review_at)); return b.length ? html`<div class="row wrap" style="gap:6px">${b}</div>` : ''; })()}
        <h1 class="detail-title">${p.title}</h1>
        <div class="row small muted" style="gap:10px">${avatar(p.author_name, 'sm')}<span><b style="color:var(--text)">${p.author_name}</b>${p.author_title_id ? ' · ' + titleName(p.author_title_id) : ''}</span><span class="faint">·</span><span title="${fmtDateTime(p.published_at || p.created_at)}">${fmtDate(p.published_at || p.created_at, true)}</span></div>
      </div>
      ${ackBox}
      <div class="detail-body">${raw(linkify(p.body))}</div>
      ${(() => { const m = /#\/nobet\/(\d+)/.exec(p.body); return m ? html`<div><a class="btn primary" href="#/nobet/${m[1]}" data-act="close-and-go">${icon('table', 'sm')}Nöbet listesini aç</a></div>` : ''; })()}
      ${attachmentsBlock(p.attachments)}
      ${readers}
      ${p.updated_at && p.published_at && p.updated_at > p.published_at ? html`<p class="tiny faint">Son düzenleme: ${fmtDateTime(p.updated_at)}</p>` : ''}
    </div>`);
  hydrateViewers(m.body);

  const foot = [];
  if (p.status === 'pending' && isPublisher()) {
    foot.push(html`<button class="btn danger" data-act="reject" data-id="${p.id}">${icon('x')}Reddet</button>`);
    foot.push(html`<div class="grow"></div>`);
    foot.push(html`<button class="btn icon" data-act="post-menu" aria-label="Diğer">${icon('more')}</button>`);
    foot.push(html`<button class="btn primary" data-act="approve" data-id="${p.id}">${icon('check')}Onayla ve yayınla</button>`);
  } else {
    if (p.status === 'published') {
      foot.push(html`<button class="btn ${p.saved ? 'active' : ''}" data-act="detail-save">${icon('bookmark')}${p.saved ? 'Kaydedildi' : 'Kaydet'}</button>`);
      foot.push(html`<button class="btn" data-act="share">${icon('link')}Paylaş</button>`);
      foot.push(html`<button class="btn icon" data-act="wa-share" aria-label="WhatsApp ile paylaş" title="WhatsApp ile paylaş">${icon('chat')}</button>`);
    }
    foot.push(html`<div class="grow"></div>`);
    if (canEdit(p)) foot.push(html`<button class="btn icon" data-act="post-menu" aria-label="Diğer">${icon('more')}</button>`);
  }
  m.setFoot(foot);
}
ACT['readers-tab'] = (el) => { DETAIL.tab = el.dataset.tab; renderDetail(); };
ACT['close-and-go'] = (el) => {
  const href = el.getAttribute('href');
  while (modalStack.length) modalStack[modalStack.length - 1].close();
  location.hash = href;
};
ACT.remind = (el) => busy(el, async () => {
  try {
    const r = await api('posts.remind', { id: DETAIL.post.id });
    toast(`${r.sent} kişiye hatırlatma e-postası gönderiliyor`);
  } catch (e) { toast(e.message, 'err'); }
});
ACT['copy-missing'] = async () => {
  const p = DETAIL.post;
  const txt = `"${p.title}" içeriğini henüz okumayanlar:\n` + p.missing.map((u) => '• ' + u.name).join('\n');
  toast((await copyText(txt)) ? 'Liste panoya kopyalandı' : 'Kopyalanamadı', 'ok');
};
ACT.ack = (el) => busy(el, async () => {
  try {
    await api('posts.ack', { id: DETAIL.post.id });
    const r = await api('posts.get', { id: DETAIL.post.id });
    DETAIL.post = r.post;
    renderDetail();
    toast('Okuma onayınız kaydedildi');
    const it = FEED && FEED.items.find((x) => x.id === r.post.id);
    if (it) { it.acked = true; it.ack_count = r.post.ack_count; if (FEED.filter === 'todo') FEED.items = FEED.items.filter((x) => x.id !== it.id); renderFeed(); }
    refreshCounts();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['detail-save'] = async () => {
  const p = DETAIL.post;
  try {
    await api('posts.bookmark', { id: p.id, saved: !p.saved });
    p.saved = !p.saved;
    S.counts.saved += p.saved ? 1 : -1;
    renderDetail();
    const it = FEED && FEED.items.find((x) => x.id === p.id);
    if (it) { it.saved = p.saved; renderFeed(); }
    toast(p.saved ? 'Kaydedilenlere eklendi' : 'Kaydedilenlerden çıkarıldı');
  } catch (e) { toast(e.message, 'err'); }
};
ACT.approve = (el) => busy(el, async () => {
  try {
    const r = await api('posts.approve', { id: +el.dataset.id });
    toast(r.mailed ? `İçerik yayınlandı · ${r.mailed} kişiye e-posta gönderiliyor` : 'İçerik yayınlandı');
    const top = modalStack[modalStack.length - 1];
    if (DETAIL && top === DETAIL.m) DETAIL.m.close();
    reloadCurrent();
  } catch (e) { toast(e.message, 'err'); }
});
ACT.reject = async (el) => {
  const reason = await promptDialog({ title: 'İçeriği reddet', label: 'Gerekçe (yazara gösterilir)', placeholder: 'Örn: Lütfen güncel form sürümünü ekleyin', ok: 'Reddet', multiline: true, danger: true });
  if (reason === null) return;
  try {
    await api('posts.reject', { id: +el.dataset.id, reason });
    toast('İçerik reddedildi');
    if (DETAIL && DETAIL.post && DETAIL.post.id === +el.dataset.id) DETAIL.m.close();
    reloadCurrent();
  } catch (e) { toast(e.message, 'err'); }
};
ACT['post-menu'] = (el) => {
  const p = DETAIL.post;
  const items = [{ id: 'e', icon: 'edit', label: 'Düzenle', run: () => openComposer(p) }];
  if (isPublisher() && p.status === 'published') {
    items.push({ id: 'p', icon: 'pin', label: p.pinned ? 'Sabitlemeyi kaldır' : 'En üste sabitle', run: () => togglePin(p) });
  }
  items.push({ id: 'l', icon: 'copy', label: 'Portal içi bağlantıyı kopyala', run: async () => toast((await copyText(appBaseUrl() + '#/p/' + p.id)) ? 'Bağlantı kopyalandı' : 'Kopyalanamadı') });
  items.push('-', { id: 'd', icon: 'trash', label: 'Sil', danger: true, run: () => deletePost(p) });
  openMenu(el, items);
};
async function togglePin(p) {
  try {
    await api('posts.pin', { id: p.id, pinned: !p.pinned });
    p.pinned = !p.pinned;
    renderDetail();
    toast(p.pinned ? 'İçerik en üste sabitlendi' : 'Sabitleme kaldırıldı');
    reloadCurrent();
  } catch (e) { toast(e.message, 'err'); }
}
async function deletePost(p) {
  const ok = await confirmDialog({ title: 'İçerik silinsin mi?', text: `“${p.title}” ve ekli dosyaları kalıcı olarak silinecek. Bu işlem geri alınamaz.`, ok: 'Sil', danger: true });
  if (!ok) return;
  try {
    await api('posts.delete', { id: p.id });
    DETAIL.m.close();
    toast('İçerik silindi');
    reloadCurrent();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- Paylaşım ---------------- */
ACT.share = () => {
  const p = DETAIL.post;
  const canGuest = S.settings.allow_guest && (isPublisher() || p.author_id === S.me.id);
  const m = openModal({ title: 'Paylaş', size: 'narrow' });
  const render = () => {
    const link = p.share ? appBaseUrl() + '?s=' + encodeURIComponent(p.share.token) : '';
    m.setBody(html`
      <div class="stack" style="gap:18px">
        <div class="stack" style="gap:8px">
          <div class="label">Ekip içi bağlantı</div>
          <p class="small muted">Yalnızca portala giriş yapmış üyeler açabilir.</p>
          <button class="btn" data-copy="${appBaseUrl() + '#/p/' + p.id}">${icon('copy', 'sm')}Bağlantıyı kopyala</button>
        </div>
        ${canGuest ? html`
        <div class="stack" style="gap:8px;border-top:1px solid var(--border);padding-top:16px">
          <div class="label">Misafir bağlantısı</div>
          <p class="small muted">Üye olmayan biri yalnızca bu içeriği ve eklerini görebilir. İstediğiniz zaman iptal edebilirsiniz.</p>
          ${p.share ? html`
            <div class="row"><input class="input" readonly value="${link}"><button class="btn icon" data-copy="${link}" aria-label="Kopyala">${icon('copy')}</button></div>
            <div class="row between"><span class="tiny faint">${p.share.expires ? 'Geçerlilik: ' + fmtDateTime(p.share.expires) : 'Süresiz'}</span><button class="btn sm danger" data-share-days="0">Bağlantıyı iptal et</button></div>`
          : html`<div class="row wrap">${[[1, '1 gün'], [7, '7 gün'], [30, '30 gün'], [365, '1 yıl']].map(([d, l]) => html`<button class="btn sm" data-share-days="${d}">${l}</button>`)}</div>`}
        </div>` : ''}
      </div>`);
  };
  render();
  m.el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { toast((await copyText(c.dataset.copy)) ? 'Bağlantı kopyalandı' : 'Kopyalanamadı'); return; }
    const b = e.target.closest('[data-share-days]');
    if (!b) return;
    await busy(b, async () => {
      try {
        const r = await api('posts.share', { id: p.id, days: +b.dataset.shareDays });
        p.share = r.share;
        render();
        if (r.share) toast((await copyText(appBaseUrl() + '?s=' + encodeURIComponent(r.share.token))) ? 'Misafir bağlantısı oluşturuldu ve kopyalandı' : 'Misafir bağlantısı oluşturuldu');
        else toast('Misafir bağlantısı iptal edildi');
      } catch (err) { toast(err.message, 'err'); }
    });
  });
};

/* ================= Editör ================= */
ACT.compose = () => openComposer(null);

function openComposer(post) {
  const editing = !!post;
  const st = {
    atts: (post && post.attachments ? post.attachments : []).map((a) => ({ ...a, state: 'done', existing: true })),
    removed: [],
  };
  const defaultCat = post ? post.category_id : (FEED && FEED.cat) || (S.categories[0] || {}).id;
  const m = openModal({
    title: editing ? 'İçeriği düzenle' : 'Yeni içerik',
    size: 'wide',
    body: html`
      <form class="stack" id="composer" data-form="composer" style="gap:16px">
        ${!isPublisher() ? html`<div class="form-note">${icon('info', 'sm')} İçeriğiniz yönetici onayından sonra yayınlanacaktır.</div>` : ''}
        <div id="tplBox"></div>
        <div class="field"><label>Başlık</label><input class="input" name="title" required minlength="3" maxlength="200" value="${post ? post.title : ''}" placeholder="Örn: Yüksek riskli ilaçlarda çift kontrol protokolü"></div>
        <div class="grid2">
          <div class="field"><label>Bölüm</label><select class="select" name="category_id" required>${options(S.categories, defaultCat)}</select></div>
          <div class="field"><label>Kimler görsün?</label><select class="select" name="unit_id">${options(S.units, post ? post.unit_id : null, 'Tüm birimler')}</select></div>
        </div>
        <div class="field"><label>İçerik</label><textarea class="textarea" name="body" required maxlength="20000" placeholder="Açıklama, talimat veya duyuru metni…">${post ? post.body : ''}</textarea></div>
        <div class="field">
          <label>Ekler</label>
          <label class="dropzone" id="dropzone">
            <input type="file" multiple hidden id="fileInput">
            ${icon('upload', 'lg')}<div style="margin-top:6px"><b>Dosya seçin</b> veya buraya sürükleyin</div>
            <div class="hint">Her tür dosya: PDF, Excel, Word, görsel, video… ${S.upload_max_mb ? `· dosya başına en fazla ${S.upload_max_mb} MB` : '· boyut sınırı yok'}</div>
          </label>
          <div class="att-list" id="attList"></div>
        </div>
        <div class="stack" style="gap:12px;padding:14px;border:1px solid var(--border);border-radius:12px">
          <label class="switch"><input type="checkbox" name="required" ${post && post.required ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Okundu onayı iste</b><span>Ekip “Okudum, anladım” ile onaylar; kimin okuduğunu takip edersiniz.</span></span></label>
          ${isPublisher() && !editing && S.settings.notify_post ? html`<label class="switch"><input type="checkbox" name="notify" checked><span class="track"></span><span class="s-text"><b>E-posta ile bildir</b><span>Yayınlanınca ilgili ekibe e-posta gider.</span></span></label>` : ''}
          ${isPublisher() ? html`<label class="switch"><input type="checkbox" name="pinned" ${post && post.pinned ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>En üste sabitle</b><span>Ana sayfada her zaman ilk sırada görünür.</span></span></label>` : ''}
        </div>
        ${composerExtraFields(post)}
        <div class="form-error hidden" data-err></div>
      </form>`,
    foot: html`${isPublisher() ? html`<button class="btn ghost desk-only" type="button" data-act="tpl-save" title="Bu metni sonra tekrar kullanmak için saklar">${icon('bookmark', 'sm')}Şablon olarak kaydet</button><div class="grow"></div>` : ''}<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" type="submit" form="composer">${icon('send', 'sm')}${editing ? 'Kaydet' : isPublisher() ? 'Yayınla' : 'Onaya gönder'}</button>`,
  });
  const form = m.el.querySelector('#composer');
  form._st = st;
  form._post = post;
  form._modal = m;
  composerExtras(form, post);
  const list = m.el.querySelector('#attList');
  const renderAtts = () => setHTML(list, st.atts.map((a, i) => {
    const fk = fileKind(a.mime || '', a.name);
    return html`<div class="att">
      <span class="a-ico tone-${fk.tone}">${fk.label}</span>
      <div class="grow"><div class="a-name">${a.name}</div>
        <div class="a-sub">${a.state === 'err' ? html`<span style="color:var(--danger)">${a.error}</span>` : a.state === 'up' ? (a.progress ? `Yükleniyor… %${Math.round(a.progress * 100)} · ${fmtSize(a.size)}` : `Sırada · ${fmtSize(a.size)}`) : fmtSize(a.size)}</div>
        ${a.state === 'up' ? html`<div class="bar"><span style="width:${Math.round(a.progress * 100)}%"></span></div>` : ''}
      </div>
      <button type="button" class="btn ghost icon sm" data-rm="${i}" aria-label="Kaldır" ${a.state === 'up' ? raw('disabled') : ''}>${icon('x', 'sm')}</button>
    </div>`;
  }));
  renderAtts();
  const addFiles = (files) => {
    for (const file of files) {
      const a = { name: file.name, size: file.size, mime: file.type || '', state: 'up', progress: 0 };
      if (S.upload_max_mb && file.size > S.upload_max_mb * 1048576) { a.state = 'err'; a.error = `Dosya ${S.upload_max_mb} MB sınırını aşıyor`; st.atts.push(a); continue; }
      st.atts.push(a);
      // Sırayla yükle: ekler seçildikleri sırada kalır
      st.queue = (st.queue || Promise.resolve()).then(() => uploadFile(file, (p) => { a.progress = p; renderAtts(); })
        .then((res) => { Object.assign(a, res, { state: 'done' }); renderAtts(); indexAttachmentText(res, file); })
        .catch((e) => { a.state = 'err'; a.error = e.message; renderAtts(); }));
    }
    renderAtts();
  };
  m.el.querySelector('#fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  const dz = m.el.querySelector('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles(e.dataTransfer.files); });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const [a] = st.atts.splice(+b.dataset.rm, 1);
    if (a && a.existing) st.removed.push(a.id);
    renderAtts();
  });
}

FORMS.composer = (f) => submitForm(f, async (d) => {
  const st = f._st;
  if (st.atts.some((a) => a.state === 'up')) throw new Error('Dosyaların yüklenmesi bitmeden kaydedilemez.');
  const payload = {
    id: f._post ? f._post.id : null,
    title: d.title, body: d.body,
    category_id: +d.category_id,
    unit_id: d.unit_id ? +d.unit_id : null,
    required: !!d.required, pinned: !!d.pinned,
    attachment_ids: st.atts.filter((a) => a.state === 'done' && !a.existing).map((a) => a.id),
    remove_attachment_ids: st.removed,
    review_at: d.review_at || null,
  };
  if ('notify' in d) payload.notify = !!d.notify;
  const r = await api('posts.save', payload);
  f._modal.close();
  toast(r.status === 'published' ? (f._post ? 'Değişiklikler kaydedildi' : r.mailed ? `İçerik yayınlandı · ${r.mailed} kişiye e-posta gönderiliyor` : 'İçerik yayınlandı') : 'İçerik onaya gönderildi');
  if (DETAIL && f._post && DETAIL.post && DETAIL.post.id === f._post.id && modalStack.includes(DETAIL.m)) {
    const g = await api('posts.get', { id: f._post.id });
    DETAIL.post = g.post;
    renderDetail();
  }
  reloadCurrent();
});
