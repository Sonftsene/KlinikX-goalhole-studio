/* dupcii — bildirim sistemi (4.7): canlı bildirim, ekranda açılır kartlar, ses/titreşim, rozet,
   kişisel bildirim ayarları, cihazlar, bildirim merkezi sayfası, birim bildirim politikası (yönetici) */
'use strict';

const NB = { since: '', seen: new Set(), timer: 0, active: Date.now(), audio: null, install: null, busy: false, cats: null, base: document.title };
const NB_CAT_UI = { mesaj: ['violet', 'chat', 'Mesajlar'], eksik: ['rose', 'alert', 'Eksik personel çağrısı'], duyuru: ['teal', 'megaphone', 'Duyurular'], belge: ['sky', 'file', 'Hastane belgeleri'],
  nobet: ['emerald', 'calendar', 'Nöbet'], degisim: ['amber', 'history', 'Değişim ve ilanlar'], istek: ['indigo', 'inbox', 'Nöbet istekleri'], yonetim: ['rose', 'inbox', 'Onay bekleyenler'], sistem: ['slate', 'bell', 'Sistem'] };
const NB_KIND_CAT = { chat: 'mesaj', post: 'duyuru', remind: 'duyuru', digest: 'duyuru', hdoc: 'belge', roster: 'nobet', shift: 'nobet', side: 'nobet', callout: 'eksik',
  swap: 'degisim', listing: 'degisim', request: 'istek', review: 'yonetim', pending_post: 'yonetim', pending_user: 'yonetim', call: 'mesaj', extra: 'yonetim' };
const nbCatOf = (n) => n.cat || NB_KIND_CAT[n.kind] || 'sistem';
function nbIconUrl() { const b = (S.settings && S.settings.brand) || {}; return b.icon192 || 'assets/icon-192.png'; }
const nbPrefs = () => (S.me && S.me.notif) || { cats: {}, sound: 1, vibrate: 1, preview: 1, quiet: { on: false }, locked: [] };

/* ---------------- Canlı döngü ---------------- */
function nbInterval() {
  if (document.visibilityState !== 'visible') return 60000;
  return document.hasFocus() && Date.now() - NB.active < 180000 ? 4000 : 12000;
}
async function nbTick() {
  clearTimeout(NB.timer);
  const on = S.me && $('#shell') && !window.NM_DEMO_API && !(S.sa && S.sa.in);
  if (on && !NB.busy) {
    NB.busy = true;
    try {
      const r = await api('live', { since: NB.since, ...nbPresence() });
      const first = !NB.since;
      NB.since = r.now;
      nbCounts(r);
      if (r.gone && r.gone.length) nbGone(r.gone);
      if (!first) nbIncoming(r.items || []);
      if (r.call && typeof callIncoming === 'function') callIncoming(r.call);
    } catch (e) { /* çevrimdışı ya da oturum bitti (api uyarır) */ }
    NB.busy = false;
  }
  NB.timer = setTimeout(nbTick, on ? nbInterval() : 5000);
}
/** Yönetici geri aldı: telefonda/masaüstünde duran bildirimi kapat, açık listeden kaldır */
const NB_GONE = new Set();
async function nbGone(ids) {
  const fresh = ids.filter((i) => !NB_GONE.has(i));
  if (!fresh.length) return;
  fresh.forEach((i) => NB_GONE.add(i));
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.getNotifications) (await reg.getNotifications()).forEach((x) => { if (x.data && fresh.includes(+x.data.id)) x.close(); });
  } catch (e) { /* */ }
  if (typeof NBL !== 'undefined' && NBL.items.some((x) => fresh.includes(x.id)) && $('#nblBox')) nblLoad(false);
}
/** Çevrimiçi durum için açık bölüm (yalnız bölüm adı; içerik ve kayıt numaraları gönderilmez) */
function nbPresence() {
  let label = '';
  try {
    const h = location.hash || '#/';
    const p = typeof sitePages === 'function' ? sitePages() : [];
    const ex = p.find((x) => x.href === h) || p.find((x) => x.href !== '#/' && h.startsWith(x.href + '/'));
    label = ex ? (ex.group && !['Genel', 'Bölümler'].includes(ex.group) ? ex.group + ' › ' + ex.label : ex.label) : (typeof pageTitleOf === 'function' ? pageTitleOf(h) : '');
    if (h === '#/' || h === '') label = 'Ana sayfa';
  } catch (e) { /* */ }
  return { pg: location.hash || '#/', pgl: label, vis: document.visibilityState === 'hidden' ? 'hidden' : 'visible', dev: matchMedia('(max-width: 760px)').matches ? 'm' : 'd' };
}
// Bölüm bilgisi bir sonraki olağan yoklamada gider (sayfa geçişinde yoklamayı öne çekmek bildirim kartlarını açılan sayfanın üstüne düşürüyordu)
function nbSoon() { clearTimeout(NB.timer); NB.timer = setTimeout(nbTick, 300); }
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => {
  const idle = Date.now() - NB.active > 180000;
  NB.active = Date.now();
  if (NB.audio && NB.audio.state === 'suspended') NB.audio.resume().catch(() => {});
  if (idle) nbSoon();
}, { passive: true, capture: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { NB.active = Date.now(); nbSoon(); } });
window.addEventListener('focus', nbSoon);
setTimeout(nbTick, 1200);

/** Sayılar: zil, mesaj simgesi, sekme başlığı, uygulama simgesi rozeti */
function nbCounts(r) {
  if (S.counts && S.counts.notif_unread !== r.unread) { S.counts.notif_unread = r.unread; if (typeof updateNotifBadge === 'function') updateNotifBadge(); }
  if (typeof r.chat === 'number' && S.chatUnread !== r.chat) {
    S.chatUnread = r.chat;
    if (typeof chatBadge === 'function') chatBadge();
    renderNav();
  }
  nbTitle();
}
function nbTitle() {
  const n = ((S.counts && S.counts.notif_unread) || 0) + (S.chatUnread || 0);
  const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
  document.title = n ? `(${n > 99 ? '99+' : n}) ${base}` : base;
  try {
    if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n).catch(() => {}); else navigator.clearAppBadge().catch(() => {}); }
  } catch (e) { /* desteklenmiyor */ }
}

/* ---------------- Gelen bildirimler ---------------- */
const nbKey = (n) => n.id + '|' + (n.at || '');
let nbCountsT = 0;
function nbIncoming(items, opts = {}) {
  const fresh = items.filter((n) => n && !n.read && !NB.seen.has(nbKey(n)));
  fresh.forEach((n) => NB.seen.add(nbKey(n)));
  if (NB.seen.size > 400) NB.seen = new Set([...NB.seen].slice(-200));
  if (!fresh.length) return;
  clearTimeout(nbCountsT);
  nbCountsT = setTimeout(() => { if (typeof refreshCounts === 'function') refreshCounts(); }, 400);
  if (opts.shown) return; // telefon zaten gösterdi (iPhone)
  const pr = nbPrefs();
  let alerted = false;
  fresh.slice(0, 3).reverse().forEach((n) => {
    const cat = nbCatOf(n);
    if (location.hash === n.url) return; // o sohbet/sayfa zaten açık
    if (n.kind === 'call') return; // gelen arama ekranı ayrıca açılır
    if (pr.cats && pr.cats[cat] && pr.cats[cat].pop === 0) return;
    nbCard(n, cat);
    if (!alerted) { alerted = true; nbAlert(cat); }
  });
}
function nbQuietNow(pr) {
  if (pr.pause_until && pr.pause_until.replace(' ', 'T') > new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)) return true;
  if (!pr.quiet || !pr.quiet.on) return false;
  const t = hm(new Date());
  const { from: a, to: b } = pr.quiet;
  return a < b ? t >= a && t < b : t >= a || t < b;
}
function nbAlert(cat) {
  const pr = nbPrefs();
  const urgent = (pr.locked || []).includes(cat);
  if (!urgent && nbQuietNow(pr)) return;
  if (pr.sound) nbChime(cat);
  if (pr.vibrate && navigator.vibrate && matchMedia('(pointer: coarse)').matches) { try { navigator.vibrate(urgent ? [220, 90, 220, 90, 220] : [160, 70, 160]); } catch (e) { /* */ } }
}
/** Kısa bildirim sesi (dosya indirmeden, Web Audio ile) */
function nbChime(cat) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    NB.audio = NB.audio || new C();
    const a = NB.audio;
    if (a.state === 'suspended') a.resume().catch(() => {});
    const t = a.currentTime + 0.02;
    const notes = cat === 'eksik' ? [988, 740, 988, 740] : cat === 'mesaj' ? [784, 1046] : [659, 880];
    notes.forEach((f, i) => {
      const o = a.createOscillator(); const g = a.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const s = t + i * 0.12;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.16, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.24);
      o.connect(g); g.connect(a.destination);
      o.start(s); o.stop(s + 0.26);
    });
  } catch (e) { /* ses yok */ }
}

/* ---------------- Ekranda açılır kart ---------------- */
function nbHost() {
  let h = $('#nbHost');
  if (!h) { h = document.createElement('div'); h.id = 'nbHost'; h.className = 'nbx'; h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
  // Masaüstünde üst çubuğun (ve duyuru şeridinin) hemen altında
  const tb = $('.topbar');
  h.style.top = window.innerWidth > 700 && tb ? Math.max(8, Math.round(tb.getBoundingClientRect().bottom) + 8) + 'px' : '';
  return h;
}
function nbCard(n, cat) {
  const host = nbHost();
  const [tone, ic, lab] = NB_CAT_UI[cat] || NB_CAT_UI.sistem;
  const chatId = (/^#\/mesaj\/(\d+)$/.exec(n.url || '') || [])[1];
  const urgent = (nbPrefs().locked || []).includes(cat);
  [...host.children].forEach((c) => { if (c.dataset.tag === (chatId ? 'c' + chatId : 'n' + n.id)) c.remove(); });
  const el = document.createElement('div');
  el.className = 'nbc' + (urgent ? ' urgent' : '');
  el.dataset.tag = chatId ? 'c' + chatId : 'n' + n.id;
  el.setAttribute('role', urgent ? 'alert' : 'status');
  el.innerHTML = fmtVal(html`<button type="button" class="nbc-main" data-k="open">
      ${chatId ? html`<span class="nbc-ava">${avatar(String(n.title).replace(/ sizden bahsetti$/, ''), 'sm')}</span>` : html`<span class="nbc-ico tone-${tone}">${icon(ic, 'sm')}</span>`}
      <span class="nbc-txt"><span class="nbc-top"><img src="${nbIconUrl()}" alt="">${S.settings.org_name || 'dupcii'} · ${lab} · şimdi</span>
        <b class="nbc-t">${n.title}</b>${n.body ? html`<span class="nbc-b">${n.body}</span>` : ''}</span></button>
    <button type="button" class="nbc-x" data-k="close" aria-label="Kapat">${icon('x', 'sm')}</button>
    ${chatId ? html`<div class="nbc-acts"><button type="button" class="btn sm" data-k="reply">${icon('send', 'sm')}Yanıtla</button><button type="button" class="btn sm ghost" data-k="read">${icon('check', 'sm')}Okundu say</button></div>
      <form class="nbc-reply hidden" data-k="form"><input class="input" maxlength="2000" placeholder="Yanıtınız…" aria-label="Yanıt"><button class="btn sm primary icon" aria-label="Gönder">${icon('send', 'sm')}</button></form>` : ''}
    ${urgent ? '' : html`<span class="nbc-bar"></span>`}`);
  host.prepend(el);
  while (host.children.length > 3) host.lastChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
  // Kendiliğinden kapanma (acil olanlar kapatılana kadar kalır); üzerindeyken / yazarken bekler
  let left = urgent ? Infinity : 7000; let t0 = Date.now(); let tm = 0;
  const bar = el.querySelector('.nbc-bar');
  const run = () => { if (left === Infinity) return; t0 = Date.now(); tm = setTimeout(close, left); if (bar) { bar.style.transition = `transform ${left}ms linear`; bar.style.transform = 'scaleX(0)'; } };
  const hold = () => { if (left === Infinity) return; clearTimeout(tm); left = Math.max(1500, left - (Date.now() - t0)); if (bar) { const k = getComputedStyle(bar).transform; bar.style.transition = 'none'; bar.style.transform = k; } };
  function close() { clearTimeout(tm); el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 220); }
  el.addEventListener('mouseenter', hold); el.addEventListener('mouseleave', () => { if (!el.querySelector('.nbc-reply:not(.hidden)')) run(); });
  requestAnimationFrame(() => requestAnimationFrame(run));
  // Kaydırarak kapat (telefon)
  let sx = 0, sy = 0, dx = 0, dy = 0;
  el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0; hold(); }, { passive: true });
  el.addEventListener('touchmove', (e) => { dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy; if (Math.abs(dx) > Math.abs(dy)) el.style.transform = `translateX(${dx}px)`; else if (dy < 0) el.style.transform = `translateY(${dy}px)`; }, { passive: true });
  el.addEventListener('touchend', () => { if (Math.abs(dx) > 90 || dy < -40) close(); else { el.style.transform = ''; if (!el.querySelector('.nbc-reply:not(.hidden)')) run(); } });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === 'close') { close(); return; }
    if (k === 'open') { close(); nbOpen(n); return; }
    if (k === 'read') { close(); try { await api('notif.read', { id: n.id }); if (chatId) await api('chat.state', { id: +chatId, op: 'read' }); } catch (err) { /* */ } nbCloseSys(n.url); nbSoon(); return; }
    if (k === 'reply') { hold(); left = Infinity; const f = el.querySelector('.nbc-reply'); f.classList.remove('hidden'); el.querySelector('.nbc-acts').classList.add('hidden'); f.querySelector('input').focus(); }
  });
  const form = el.querySelector('.nbc-reply');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = form.querySelector('input'); const body = inp.value.trim();
    if (!body) return;
    inp.disabled = true;
    try {
      await api('chat.send', { id: +chatId, body });
      try { await api('notif.read', { id: n.id }); } catch (err) { /* */ }
      nbCloseSys(n.url);
      toast('Yanıt gönderildi');
      close(); nbSoon();
    } catch (err) { inp.disabled = false; toast(err.message, 'err'); }
  });
}
async function nbOpen(n) {
  try { await api('notif.read', { id: n.id }); } catch (e) { /* */ }
  nbCloseSys(n.url);
  const url = n.url || '#/';
  if (location.hash === url) route(); else location.hash = url;
  nbSoon();
}
/** Telefondaki/masaüstündeki bildirimleri kaldır (o sayfa açılınca) */
async function nbCloseSys(url) {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !reg.getNotifications) return;
    (await reg.getNotifications()).forEach((x) => { const u = (x.data && x.data.url) || ''; if (!url || u.endsWith(url)) x.close(); });
  } catch (e) { /* */ }
}
window.addEventListener('hashchange', () => { if (/^#\/mesaj\/\d+$/.test(location.hash)) nbCloseSys(location.hash); });
// Telefon bildirimi geldiğinde uygulama öndeyse SW buraya iletir
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'PUSH' && Array.isArray(d.items)) { nbIncoming(d.items, { shown: !!d.shown }); nbSoon(); }
    if (d.type === 'PING') nbSoon();
  });
}
// Uygulama yükleme isteği (Android/Chrome/Edge)
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); NB.install = e; const b = $('#nbInstall'); if (b) b.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { NB.install = null; toast('Uygulama ana ekrana eklendi'); });

/* ---------------- Kişisel bildirim ayarları (Hesabım › Bildirimler) ---------------- */
function nbSettingsHtml() {
  const me = S.me;
  return html`<div id="nbSet" class="stack"><div class="card card-pad"><div class="skel" style="height:16px;width:60%"></div></div></div>
    <div class="card card-pad stack">
      <h3 class="ph">${icon('mail', 'sm')} E-posta bildirimleri</h3>
      <div class="seg seg-block">${[['instant', 'Anlık'], ['digest', 'Sabah özeti'], ['off', 'Kapalı']].map(([k, l]) => html`<button class="${(me.notify_mode || 'instant') === k ? 'on' : ''}" data-act="nmode" data-m="${k}">${l}</button>`)}</div>
      <p class="tiny faint" id="nmodeHint">${NMODE_HINT[me.notify_mode || 'instant']}</p>
    </div>
    ${typeof remindCardHtml === 'function' ? remindCardHtml() : ''}`;
}
async function nbSettingsMount() {
  const box = $('#nbSet'); if (!box) return;
  let r;
  try { r = await api('notif.prefs.get'); } catch (e) { setHTML(box, html`<div class="card card-pad"><p class="small muted">${e.message}</p></div>`); return; }
  S.me.notif = r.prefs; NB.cats = r.cats;
  nbDraw();
}
function nbPushHelp(st, info) {
  const ios = typeof _nmIsIOS === 'function' && _nmIsIOS();
  const app = typeof _nmStandalone === 'function' && _nmStandalone();
  if (!S.settings.push_ready) return html`<p class="small muted">Telefon bildirimleri bu sitede yönetici tarafından kapatılmış.</p>`;
  if (st === 'on') return html`<p class="small">${icon('checkCircle', 'sm')} <b>Bu cihazda açık.</b> Uygulama kapalıyken de bildirim gelir; telefon kilitliyken ekranda görünür.</p>`;
  if (st === 'denied') return html`<div class="nb-help"><b>Bildirim izni engellenmiş.</b><ol>${ios ? html`<li>iPhone Ayarlar → Bildirimler → dupcii</li><li>“Bildirimlere İzin Ver”i açın, “Afişler”i “Kalıcı” seçin</li>`
    : html`<li>Adres çubuğundaki kilit/ayar simgesine dokunun</li><li>Bildirimler → İzin ver</li><li>Bu sayfayı yenileyin</li>`}</ol></div>`;
  if (ios && !app) return html`<div class="nb-help"><b>iPhone’da bildirim için önce uygulamayı ana ekrana ekleyin:</b><ol><li>Safari’de alttaki <b>Paylaş</b> simgesine dokunun</li><li><b>Ana Ekrana Ekle</b>’yi seçin</li><li>Ana ekrandaki <b>dupcii</b> simgesinden açıp buradan bildirimleri açın</li></ol></div>`;
  if (!info.ok) return html`<p class="small muted">${info.reason}</p>`;
  return html`<p class="small muted">Açınca mesajlar, çağrılar ve duyurular bu cihaza anında, sitenin simgesiyle gelir — uygulama kapalıyken de.</p>`;
}
async function nbDraw() {
  const box = $('#nbSet'); if (!box) return;
  const p = S.me.notif;
  const info = typeof pushSupportInfo === 'function' ? pushSupportInfo() : { ok: false, reason: '' };
  const st = info.ok && S.settings.push_ready ? await pushState() : 'unsupported';
  const app = typeof _nmStandalone === 'function' && _nmStandalone();
  const locked = p.locked || [];
  const cats = NB.cats || [];
  const paused = p.pause_until;
  setHTML(box, html`
    <div class="card card-pad stack">
      <div class="row between wrap" style="gap:8px"><h3 class="ph">${icon('bell', 'sm')} Bu cihaz</h3><span class="badge ${st === 'on' ? 'ok' : ''}">${st === 'on' ? 'Bildirimler açık' : st === 'denied' ? 'İzin engelli' : 'Kapalı'}</span></div>
      ${nbPushHelp(st, info)}
      <div class="row wrap" style="gap:6px">
        ${st === 'on' ? html`<button class="btn sm" data-act="push-test">${icon('send', 'sm')}Deneme gönder</button><button class="btn sm ghost" data-act="nb-push-off">Bu cihazda kapat</button>`
          : info.ok && st !== 'denied' && S.settings.push_ready ? html`<button class="btn primary" data-act="nb-push-on">${icon('bell', 'sm')}Bildirimleri aç</button>` : ''}
        <button class="btn sm ${NB.install && !app ? '' : 'hidden'}" id="nbInstall" data-act="nb-install">${icon('download', 'sm')}Uygulama olarak yükle</button>
        <button class="btn sm ghost" data-act="nb-sound-test">${icon('bell', 'sm')}Sesi dene</button>
      </div>
    </div>
    <div class="card card-pad stack">
      <h3 class="ph">${icon('clock', 'sm')} Duraklat</h3>
      ${paused ? html`<p class="small"><b>${fmtDateTime(paused)}</b> saatine kadar bildirimler duraklatıldı${locked.length ? ' (zorunlu bildirimler yine gelir)' : ''}.</p><div><button class="btn sm primary" data-act="nb-pause" data-v="">Şimdi devam ettir</button></div>`
        : html`<p class="small muted">Toplantıda ya da izindeyken telefon bildirimlerini kısa süre durdurun; uygulama içinde birikmeye devam eder.</p>
        <div class="row wrap" style="gap:6px">${[['1h', '1 saat'], ['8h', '8 saat'], ['morning', 'Yarın sabaha kadar']].map(([v, l]) => html`<button class="btn sm" data-act="nb-pause" data-v="${v}">${l}</button>`)}</div>`}
    </div>
    <div class="card card-pad stack">
      <h3 class="ph">${icon('sliders', 'sm')} Neler bildirilsin</h3>
      <div class="nb-cats"><div class="nb-cat head"><span></span><span>Telefon</span><span>Ekranda</span></div>
      ${cats.map((c) => { const v = p.cats[c.key] || { push: 1, pop: 1 }; const lk = locked.includes(c.key); const [tone, ic] = NB_CAT_UI[c.key] || NB_CAT_UI.sistem; return html`<div class="nb-cat">
        <span class="row" style="gap:10px;min-width:0"><span class="nbc-ico tone-${tone}">${icon(ic, 'sm')}</span><span style="min-width:0"><b class="small">${c.label}</b>${lk ? html` <span class="badge warn" title="Yöneticiniz bu bildirimleri zorunlu tuttu">${icon('lock', 'sm')}zorunlu</span>` : ''}<span class="tiny faint" style="display:block">${c.descr}</span></span></span>
        <label class="switch only" title="Telefon / masaüstü bildirimi"><input type="checkbox" data-change="nb-cat" data-k="${c.key}" data-f="push" ${v.push ? raw('checked') : ''} ${lk ? raw('disabled') : ''}><span class="track"></span></label>
        <label class="switch only" title="Uygulama açıkken ekranda kart"><input type="checkbox" data-change="nb-cat" data-k="${c.key}" data-f="pop" ${v.pop ? raw('checked') : ''}><span class="track"></span></label></div>`; })}</div>
      <p class="tiny faint">Telefon (uygulama kapalıyken) · Ekranda (uygulama açıkken). Hepsi zil simgesinde de durur.</p>
    </div>
    <div class="card card-pad stack">
      <h3 class="ph">${icon('moon', 'sm')} Sessiz saatler</h3>
      ${p.quiet_allowed ? html`<label class="switch"><input type="checkbox" data-change="nb-quiet" ${p.quiet.on ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Sessiz saatleri kullan</b><span>Bu saatlerde bildirimler sessiz gelir (ses ve titreşim yok); sabah hepsi bildirim merkezinde.${locked.length ? ' Zorunlu bildirimler sesli gelir.' : ''}</span></span></label>
        <div class="row wrap" style="gap:8px"><span class="small muted">Başlangıç</span><input class="input" type="time" data-change="nb-quiet-t" data-k="from" value="${p.quiet.from}" style="width:auto"><span class="small muted">Bitiş</span><input class="input" type="time" data-change="nb-quiet-t" data-k="to" value="${p.quiet.to}" style="width:auto"></div>`
        : html`<p class="small muted">Biriminizde sessiz saatler yönetici tarafından kapatılmış.</p>`}
    </div>
    <div class="card card-pad stack">
      <h3 class="ph">${icon('eye', 'sm')} Görünüm ve gizlilik</h3>
      <label class="switch"><input type="checkbox" data-change="nb-flag" data-k="preview" ${p.preview ? raw('checked') : ''} ${p.hide_preview ? raw('disabled') : ''}><span class="track"></span><span class="s-text"><b>Telefon bildiriminde içeriği göster</b><span>${p.hide_preview ? 'Yöneticiniz kişisel verilerin korunması için içerikleri gizledi: kilit ekranında yalnız “Yeni mesaj” gibi genel bir yazı görünür.' : 'Kapatırsanız kilit ekranında mesaj ve duyuru metni yerine yalnız “Yeni mesaj” yazar.'}</span></span></label>
      <label class="switch"><input type="checkbox" data-change="nb-flag" data-k="sound" ${p.sound ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Uygulama içi ses</b><span>Uygulama açıkken yeni bildirimde kısa bir ses.</span></span></label>
      <label class="switch"><input type="checkbox" data-change="push-nag" ${typeof pushNagOn === 'function' && pushNagOn() ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Bildirimler kapalıyken her gün hatırlat</b><span>Bu cihazda bildirimler kapalıysa ana sayfada günde bir kez “Bildirimleriniz kapalı” uyarısı çıkar.</span></span></label>
      <label class="switch"><input type="checkbox" data-change="nb-flag" data-k="vibrate" ${p.vibrate ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Titreşim</b><span>Telefonda bildirim gelince titreşsin.</span></span></label>
    </div>
    <div class="card card-pad stack" id="nbDevices"><h3 class="ph">${icon('phone', 'sm')} Bildirim alan cihazlarım</h3><div class="skel" style="height:14px;width:50%"></div></div>`);
  nbDevicesDraw();
}
async function nbDevicesDraw() {
  const box = $('#nbDevices'); if (!box) return;
  let ep = '';
  try { const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null; const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null; ep = sub ? sub.endpoint : ''; } catch (e) { /* */ }
  let items = [];
  try { items = (await api('notif.devices', { endpoint: ep })).items; } catch (e) { /* */ }
  setHTML(box, html`<h3 class="ph">${icon('phone', 'sm')} Bildirim alan cihazlarım</h3>
    ${items.length ? html`<div class="list nb-devs">${items.map((d) => html`<div class="list-row"><span class="cat-ico sm tone-${d.current ? 'emerald' : 'slate'}">${icon('phone', 'sm')}</span>
      <div class="grow" style="min-width:0"><div class="lr-t">${d.label}${d.current ? html` <span class="badge brand">bu cihaz</span>` : ''}</div><div class="lr-s">${d.last_ok ? 'Son bildirim ' + fmtRel(d.last_ok) : 'Eklendi ' + fmtRel(d.created_at)}</div></div>
      <button class="btn sm" data-act="nb-dev-test" data-id="${d.id}">Dene</button><button class="btn sm icon ghost danger" data-act="nb-dev-del" data-id="${d.id}" aria-label="Kaldır">${icon('trash', 'sm')}</button></div>`)}</div>`
      : html`<p class="small muted">Henüz hiçbir cihazda telefon bildirimi açık değil. Telefonunuzda bu sayfayı açıp “Bildirimleri aç”a dokunun.</p>`}
    <p class="tiny faint">Kullanmadığınız ya da kaybolan bir cihazı buradan kaldırın; o cihaza bildirim gitmez.</p>`);
}
async function nbSave(o, quiet) {
  try { const r = await api('notif.prefs.save', o); S.me.notif = r.prefs; if (!quiet) toast('Bildirim ayarınız kaydedildi'); return true; } catch (e) { toast(e.message, 'err'); return false; }
}
CHANGE['nb-cat'] = async (el) => { if (!(await nbSave({ cats: { [el.dataset.k]: { [el.dataset.f]: el.checked } } }))) el.checked = !el.checked; };
CHANGE['nb-flag'] = async (el) => { if (!(await nbSave({ [el.dataset.k]: el.checked }))) el.checked = !el.checked; else if (el.dataset.k === 'preview') nbDraw(); };
CHANGE['nb-quiet'] = async (el) => { if (!(await nbSave({ quiet: Object.assign({}, S.me.notif.quiet, { on: el.checked }) }))) el.checked = !el.checked; };
CHANGE['nb-quiet-t'] = (el) => nbSave({ quiet: Object.assign({}, S.me.notif.quiet, { [el.dataset.k]: el.value }) });
ACT['nb-pause'] = async (el) => { if (await nbSave({ pause: el.dataset.v }, true)) { toast(el.dataset.v ? 'Bildirimler duraklatıldı' : 'Bildirimler yeniden açık'); nbDraw(); } };
ACT['nb-push-on'] = (el) => busy(el, async () => {
  try { if (await pushEnable()) { toast('Bildirimler bu cihazda açıldı'); nbDraw(); const nag = $('#pushNag'); if (nag) nag.remove(); } } catch (e) { toast(e.message, 'err'); nbDraw(); }
});
ACT['nb-push-off'] = (el) => busy(el, async () => { try { await pushDisable(); toast('Bu cihazda bildirimler kapatıldı'); nbDraw(); } catch (e) { toast(e.message, 'err'); } });
ACT['nb-install'] = async () => {
  if (!NB.install) { toast('Tarayıcınızın menüsünden “Ana ekrana ekle”yi seçin'); return; }
  NB.install.prompt();
  try { await NB.install.userChoice; } catch (e) { /* */ }
  NB.install = null; const b = $('#nbInstall'); if (b) b.classList.add('hidden');
};
ACT['nb-sound-test'] = () => { nbChime('mesaj'); if (navigator.vibrate) { try { navigator.vibrate([160, 70, 160]); } catch (e) { /* */ } } nbCard({ id: 0, at: '', title: 'Böyle görünür', body: 'Uygulama açıkken yeni bildirimler sağ üstte bu kartla gelir.', url: '#/profil/bildirim', kind: 'test' }, 'sistem'); };
ACT['nb-dev-test'] = (el) => busy(el, async () => { try { await api('notif.device.test', { id: +el.dataset.id }); toast('Deneme bildirimi gönderildi'); nbDevicesDraw(); } catch (e) { toast(e.message, 'err'); nbDevicesDraw(); } });
ACT['nb-dev-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Cihaz kaldırılsın mı?', text: 'Bu cihaza artık telefon bildirimi gitmez.', ok: 'Kaldır', danger: true }))) return;
  try { await api('notif.device.del', { id: +el.dataset.id }); toast('Cihaz kaldırıldı'); nbDraw(); } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Bildirim merkezi sayfası (#/bildirimler) ---------------- */
const NBL = { cat: '', unread: false, items: [], more: false };
NM_EXT.routes.bildirimler = (view) => {
  NBL.items = [];
  setHTML(view, html`<div class="page-head"><div><h1>Bildirimler</h1><p>Son 90 günün bildirimleri. Telefona gelmeyenler de burada durur.</p></div>
    <div class="row wrap" style="gap:6px">${isPublisher() ? html`<button class="btn sm" data-act="nb-sent">${icon('send', 'sm')}Gönderilenler</button>` : ''}<button class="btn sm" data-act="nbl-readall">${icon('check', 'sm')}Tümünü okundu say</button><button class="btn sm ghost" data-act="nbl-clean">${icon('trash', 'sm')}Okunanları sil</button><a class="btn sm icon ghost" href="#/profil/bildirim" aria-label="Bildirim ayarları" title="Bildirim ayarları">${icon('sliders', 'sm')}</a></div></div>
    <div class="seg nbl-f" role="tablist">${[['', 'Tümü'], ['_u', 'Okunmamış'], ...Object.entries(NB_CAT_UI).filter(([k]) => k !== 'yonetim' || isPublisherBase()).map(([k, v]) => [k, v[2]])].map(([k, l]) => html`<button type="button" class="${(k === '_u' ? NBL.unread : !NBL.unread && NBL.cat === k) ? 'on' : ''}" data-act="nbl-f" data-f="${k}">${l}</button>`)}</div>
    <div id="nblBox" style="margin-top:12px"><div class="card card-pad"><div class="skel" style="height:14px"></div></div></div>`);
  nblLoad(false);
};
async function nblLoad(more) {
  const box = $('#nblBox'); if (!box) return;
  try {
    const before = more && NBL.items.length ? NBL.items[NBL.items.length - 1].id : 0;
    const r = await api('notif.list', { cat: NBL.cat, unread: NBL.unread, before, limit: 40 });
    NBL.items = more ? NBL.items.concat(r.items) : r.items; NBL.more = r.more;
  } catch (e) { setHTML(box, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  const today = ymd(new Date()), yest = ymd(new Date(Date.now() - DAY_MS));
  let last = '';
  setHTML(box, NBL.items.length ? html`<div class="card"><div class="list nbl">${NBL.items.map((n) => { const d = n.at.slice(0, 10); const g = d === today ? 'Bugün' : d === yest ? 'Dün' : dateLabel(d); const cat = nbCatOf(n); const [tone, ic, lab] = NB_CAT_UI[cat] || NB_CAT_UI.sistem;
    return html`${g !== last ? html`<div class="np-sec">${(last = g)}</div>` : ''}<div class="list-row nbl-row ${n.read ? '' : 'unread'}"><button type="button" class="grow nbl-open" data-act="nbl-open" data-id="${n.id}"><span class="nbc-ico tone-${tone}">${icon(ic, 'sm')}</span><span style="min-width:0"><span class="tiny faint">${lab} · ${fmtRel(n.at)}</span><b class="np-t">${n.title}</b>${n.body ? html`<span class="np-b">${n.body}</span>` : ''}</span></button>${n.read ? '' : html`<span class="dot"></span>`}<button class="btn sm icon ghost" data-act="nbl-del" data-id="${n.id}" aria-label="Sil">${icon('trash', 'sm')}</button></div>`; })}</div></div>
    ${NBL.more ? html`<div style="text-align:center;margin-top:12px"><button class="btn" data-act="nbl-more">Daha eski</button></div>` : ''}`
    : html`<div class="card empty"><div class="e-ico">${icon('bell', 'lg')}</div><h3>Bildirim yok</h3><p class="small">${NBL.unread ? 'Okunmamış bildiriminiz kalmadı.' : 'Bu bölümde bildirim yok.'}</p></div>`);
}
ACT['nbl-f'] = (el) => { const f = el.dataset.f; NBL.unread = f === '_u'; NBL.cat = f === '_u' ? '' : f; $$('[data-act=nbl-f]').forEach((b) => b.classList.toggle('on', b === el)); nblLoad(false); };
ACT['nbl-more'] = (el) => busy(el, () => nblLoad(true));
ACT['nbl-open'] = (el) => { const n = NBL.items.find((x) => x.id === +el.dataset.id); if (n) nbOpen(n); };
ACT['nbl-del'] = async (el) => { try { await api('notif.delete', { id: +el.dataset.id }); NBL.items = NBL.items.filter((x) => x.id !== +el.dataset.id); el.closest('.nbl-row').remove(); nbSoon(); } catch (e) { toast(e.message, 'err'); } };
ACT['nbl-readall'] = async () => { try { await api('notif.read', {}); nbCloseSys(''); toast('Hepsi okundu sayıldı'); nblLoad(false); nbSoon(); } catch (e) { toast(e.message, 'err'); } };
ACT['nbl-clean'] = async () => {
  if (!(await confirmDialog({ title: 'Okunan bildirimler silinsin mi?', text: 'Okunmamış olanlar kalır.', ok: 'Sil', danger: true }))) return;
  try { await api('notif.delete', { read_all: true }); toast('Okunan bildirimler silindi'); nblLoad(false); } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Yönetici: birim bildirim politikası (Ayarlar › Bildirimler) ---------------- */
NM_EXT.settingsCards.push({
  sec: 'bildirim', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="bildirim" id="nbPolicy"><h3 style="font-size:15px">${icon('shield', 'sm')} Bildirim politikası</h3><div class="skel" style="height:14px;width:60%"></div></div>`,
  mount: () => nbPolicyLoad(),
});
const NBP = { d: null };
async function nbPolicyLoad() {
  const c = $('#nbPolicy'); if (!c) return;
  try { NBP.d = await api('notif.policy.get'); } catch (e) { setHTML(c, html`<p class="small muted">${e.message}</p>`); return; }
  nbPolicyDraw();
}
function nbPolicyDraw() {
  const c = $('#nbPolicy'); if (!c || !NBP.d) return;
  const { policy: p, cats, stats } = NBP.d;
  const pct = stats.users ? Math.round((stats.with_device / stats.users) * 100) : 0;
  setHTML(c, html`<div><h3 style="font-size:15px">${icon('shield', 'sm')} Bildirim politikası</h3><p class="small muted">Birimdeki herkes için varsayılanlar. Kişiler kendi ayarlarını değiştirebilir; <b>zorunlu</b> işaretlenenleri kapatamaz, bunlar sessiz saatlerde ve duraklatmada da gelir.</p></div>
    <div class="nb-stat"><div><b>${stats.with_device}</b> / ${stats.users} kişide telefon bildirimi açık <span class="tiny faint">(${stats.devices} cihaz)</span></div><div class="nb-meter"><span style="width:${pct}%"></span></div>
      ${stats.without.length ? html`<details><summary class="small">Henüz açmayanlar (${stats.without.length})</summary><p class="small muted" style="margin-top:6px">${stats.without.join(', ')}</p></details>` : html`<p class="small">${icon('checkCircle', 'sm')} Herkes açmış.</p>`}
      <p class="tiny faint">${NBP.d.encrypt ? 'Telefon bildirimlerinin içeriği uçtan uca şifreli gönderilir (Google/Apple içeriği göremez).' : 'Sunucunuz şifreli içerik gönderemiyor; telefon bildirimi içeriği cihaz tarafından siteden alınır.'}</p></div>
    <div class="nb-cats pol"><div class="nb-cat head"><span></span><span>Telefon</span><span>Ekranda</span><span>Zorunlu</span></div>
      ${cats.map((k) => { const v = p.defaults[k.key]; const lk = p.locked.includes(k.key); return html`<div class="nb-cat"><span style="min-width:0"><b class="small">${k.label}</b><span class="tiny faint" style="display:block">${k.descr}</span></span>
        <label class="switch only"><input type="checkbox" data-pol="push" data-k="${k.key}" ${v.push || lk ? raw('checked') : ''} ${lk ? raw('disabled') : ''}><span class="track"></span></label>
        <label class="switch only"><input type="checkbox" data-pol="pop" data-k="${k.key}" ${v.pop ? raw('checked') : ''}><span class="track"></span></label>
        <label class="switch only"><input type="checkbox" data-pol="locked" data-k="${k.key}" ${lk ? raw('checked') : ''}><span class="track"></span></label></div>`; })}</div>
    <label class="switch"><input type="checkbox" data-pol="hide_preview" ${p.hide_preview ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Telefon bildirimlerinde içeriği gizle (KVKK)</b><span>Kilit ekranında mesaj/duyuru metni yerine yalnız “Yeni mesaj”, “Yeni duyuru” yazar. Hasta bilgisinin görünme riskini azaltır.</span></span></label>
    <label class="switch"><input type="checkbox" data-pol="quiet_allowed" ${p.quiet_allowed ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Kişiler sessiz saat seçebilsin</b><span>Kapalıysa herkesin bildirimi her saatte sesli gelir.</span></span></label>
    <div><button type="button" class="btn primary" data-act="nbp-save">Politikayı kaydet</button></div>`);
}
ACT['nbp-save'] = (el) => busy(el, async () => {
  const c = $('#nbPolicy'); if (!c) return;
  const defaults = {}; const locked = [];
  $$('input[data-pol=push], input[data-pol=pop]', c).forEach((i) => { (defaults[i.dataset.k] = defaults[i.dataset.k] || {})[i.dataset.pol] = i.checked; });
  $$('input[data-pol=locked]', c).forEach((i) => { if (i.checked) locked.push(i.dataset.k); });
  try {
    await api('notif.policy.save', { defaults, locked, hide_preview: $('input[data-pol=hide_preview]', c).checked, quiet_allowed: $('input[data-pol=quiet_allowed]', c).checked });
    toast('Bildirim politikası kaydedildi');
    nbPolicyLoad();
  } catch (e) { toast(e.message, 'err'); }
});
NM_EXT.audit['notif.policy'] = 'Bildirim politikasını değiştirdi';
NM_EXT.audit['notif.remind'] = 'Bildirim açma hatırlatması gönderdi';

/* ---------------- Bu cihazın bildirim durumu sunucuya (yöneticinin “Bildirim durumu” listesi için) ---------------- */
function nbPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (typeof _nmIsIOS === 'function' && _nmIsIOS())) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'masaustu';
  return 'diger';
}
async function nbReportState() {
  if (!S.me || S.me.sa_virtual || !S.settings || !S.settings.push_ready || typeof pushState !== 'function') return;
  let st = 'off';
  try { st = await pushState(); } catch (e) { st = 'off'; }
  if (st === 'unsupported' && typeof pushSupportInfo === 'function') {
    const why = pushSupportInfo().reason || '';
    st = /16\.4/.test(why) ? 'ios_old' : /Ana Ekrana/i.test(why) ? 'ios_install' : 'unsupported';
  }
  const pl = nbPlatform();
  const key = st + '|' + pl;
  if (NB.psSent === key) return;
  NB.psSent = key;
  try { await api('notif.pstate', { state: st, platform: pl }); } catch (e) { NB.psSent = ''; }
}
// Bildirim açılıp kapatılınca durum yeniden bildirilir
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-act*="push"]'); if (b) setTimeout(() => nbReportState(), 4000); }, true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => nbReportState(), 2500); });
setTimeout(() => nbReportState(), 6000);

/* ---------------- Yönetici / yayıncı: Bildirim durumu (kimde açık, kim açmamış ve neden) ---------------- */
const NBS = { d: null, f: 'noton', q: '', sel: new Set() };
const NBS_L = {
  on: ['Açık', 'success'], off: ['Açmamış', 'warn'], denied: ['İzni reddetmiş', 'danger'], ios_install: ['iPhone: ana ekrana eklememiş', 'warn'],
  ios_old: ['iPhone: iOS güncel değil', 'danger'], unsupported: ['Tarayıcı desteklemiyor', 'info'], unknown: ['Bilinmiyor', 'info'], never: ['Hiç giriş yapmamış', 'info'],
};
const NBS_PL = { android: 'Android', iphone: 'iPhone', masaustu: 'Bilgisayar', diger: '' };
NM_EXT.settingsCards.push({
  sec: 'bildirim', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="bildirim" id="nbStatus"><h3 style="font-size:15px">${icon('users', 'sm')} Bildirim durumu</h3><div class="skel" style="height:14px;width:50%"></div></div>`,
  mount: () => nbStatusLoad(),
});
async function nbStatusLoad() {
  const c = $('#nbStatus'); if (!c) return;
  try { NBS.d = await api('notif.status'); } catch (e) { setHTML(c, html`<p class="small muted">${e.message}</p>`); return; }
  NBS.sel = new Set();
  nbStatusDraw();
}
function nbStatusDraw() {
  const c = $('#nbStatus'); if (!c || !NBS.d) return;
  const all = NBS.d.people;
  const cnt = {};
  all.forEach((p) => { cnt[p.state] = (cnt[p.state] || 0) + 1; });
  const notOn = all.filter((p) => p.state !== 'on');
  const q = trLower(NBS.q.trim());
  const list = all.filter((p) => (NBS.f === 'all' || (NBS.f === 'noton' ? p.state !== 'on' : p.state === NBS.f)) && (!q || trLower(p.name).includes(q)));
  const chip = (k, l, n) => html`<button type="button" class="chip-btn ${NBS.f === k ? 'on' : ''}" data-act="nbs-f" data-f="${k}">${l} <b>${n}</b></button>`;
  const pct = all.length ? Math.round(((cnt.on || 0) / all.length) * 100) : 0;
  setHTML(c, html`<div class="row wrap" style="gap:8px;align-items:center"><h3 style="font-size:15px;margin:0" class="grow">${icon('users', 'sm')} Bildirim durumu</h3>
      <button type="button" class="btn sm ghost" data-act="nbs-reload">${icon('history', 'sm')}<span>Yenile</span></button></div>
    <div class="nb-stat"><div><b>${cnt.on || 0}</b> / ${all.length} kişide telefon bildirimi açık · <b>${notOn.length}</b> kişi açmamış</div><div class="nb-meter"><span style="width:${pct}%"></span></div></div>
    <p class="tiny faint" style="margin:0">Uygulamayı açan her cihaz kendi durumunu bildirir. “Hatırlat” kişiye uygulama içi bildirim${NBS.d.mail_ready ? ' ve e-posta' : ''} gönderir; durumuna göre (iPhone’da ana ekrana ekleme, reddedilmiş izni yeniden açma, pil tasarrufu) adım adım ne yapacağı yazar. Aynı kişiye 12 saatte bir gönderilir.</p>
    <div class="row wrap" style="gap:6px">${chip('noton', 'Açık değil', notOn.length)}${chip('all', 'Herkes', all.length)}${Object.keys(NBS_L).filter((k) => cnt[k]).map((k) => chip(k, NBS_L[k][0], cnt[k]))}</div>
    <div class="row wrap" style="gap:8px;align-items:center"><input class="input" type="search" placeholder="Kişi ara" value="${NBS.q}" data-input="nbs-q" style="flex:1;min-width:150px">
      <button type="button" class="btn sm" data-act="nbs-remind-sel" ${NBS.sel.size ? '' : raw('disabled')}>${icon('bell', 'sm')}<span>Seçilenlere hatırlat${NBS.sel.size ? ` (${NBS.sel.size})` : ''}</span></button>
      ${notOn.length ? html`<button type="button" class="btn sm primary" data-act="nbs-remind-all">${icon('bell', 'sm')}<span>Açmayan herkese hatırlat (${notOn.length})</span></button>` : ''}</div>
    <div class="list nbs-list">${list.length ? list.map((p) => { const L = NBS_L[p.state] || [p.state, 'info']; return html`<div class="list-row" style="gap:10px;align-items:center">
      ${p.state !== 'on' ? html`<input type="checkbox" data-change="nbs-sel" data-id="${p.id}" ${NBS.sel.has(p.id) ? raw('checked') : ''} aria-label="${p.name}: seç">` : html`<span style="width:16px"></span>`}
      ${avatar(p.name, 'sm')}
      <div class="grow" style="min-width:0"><b class="small">${p.name}</b>
        <div class="tiny faint">${[p.state === 'on' ? `${p.devices} cihaz` : '', NBS_PL[p.platform] || '', p.seen ? 'son giriş ' + fmtRel(p.seen) : 'hiç giriş yok', p.reminded_at ? `hatırlatıldı ${fmtRel(p.reminded_at)}${p.reminds > 1 ? ` (${p.reminds}. kez)` : ''}` : '', !p.email ? 'e-posta yok' : ''].filter(Boolean).join(' · ')}</div></div>
      <span class="badge ${L[1]}">${L[0]}</span>
      ${p.state !== 'on' ? html`<button type="button" class="btn sm ghost" data-act="nbs-remind" data-id="${p.id}">Hatırlat</button>` : ''}</div>`; }) : html`<div class="list-row small muted">${NBS.f === 'noton' ? 'Herkeste telefon bildirimi açık.' : 'Kimse yok.'}</div>`}</div>`);
}
ACT['nbs-reload'] = () => nbStatusLoad();
ACT['nbs-f'] = (el) => { NBS.f = el.dataset.f; nbStatusDraw(); };
CHANGE['nbs-q'] = (el) => { NBS.q = el.value; clearTimeout(NBS.t); NBS.t = setTimeout(() => { nbStatusDraw(); const i = $('#nbStatus [data-input=nbs-q]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
CHANGE['nbs-sel'] = (el) => { const id = +el.dataset.id; if (el.checked) NBS.sel.add(id); else NBS.sel.delete(id); nbStatusDraw(); };
async function nbsRemind(ids, el) {
  if (!ids.length) return;
  await busy(el, async () => {
    try {
      const r = await api('notif.remind', { ids });
      toast(r.sent ? `${r.sent} kişiye hatırlatma gönderildi${r.mailed ? ` (${r.mailed} e-posta)` : ''}${r.skipped ? ` · ${r.skipped} kişiye son 12 saatte zaten gönderilmişti` : ''}` : (r.skipped ? 'Bu kişilere son 12 saatte zaten hatırlatma gönderildi' : 'Seçilenlerde bildirim zaten açık'));
      await nbStatusLoad();
    } catch (e) { toast(e.message, 'err'); }
  });
}
ACT['nbs-remind'] = (el) => nbsRemind([+el.dataset.id], el);
ACT['nbs-remind-sel'] = (el) => nbsRemind([...NBS.sel], el);
ACT['nbs-remind-all'] = async (el) => {
  const ids = NBS.d.people.filter((p) => p.state !== 'on').map((p) => p.id);
  if (!(await confirmDialog({ title: `${ids.length} kişiye hatırlatma gönderilsin mi?`, text: `Telefon bildirimi açık olmayan herkese uygulama içi bildirim${NBS.d.mail_ready ? ' ve e-posta' : ''} gider; durumuna göre ne yapacağı adım adım yazar.`, ok: 'Gönder' }))) return;
  nbsRemind(ids, el);
};

/* ---------------- Yönetici: E-posta tasarımı (Ayarlar › Bildirimler) ---------------- */
const MD = { d: null, logo: null, siteLogo: null, domain: '', t: 0, wide: false };
const MD_STYLES = [['kurumsal', 'Kurumsal', 'Üstte renkli çizgi, beyaz kart'], ['sade', 'Sade', 'Kartsız, ince çizgiler'], ['modern', 'Modern', 'Ortalanmış logo, geniş düğme'], ['resmi', 'Resmî yazı', 'Tırnaklı yazı, çift çizgi'], ['bant', 'Renkli başlık', 'Başlık bandı kurum renginde']];
const MD_COLORS = ['#0b7a75', '#1d4ed8', '#0f172a', '#b91c1c', '#7c3aed', '#047857', '#c2410c', '#be185d'];
NM_EXT.settingsCards.push({
  sec: 'bildirim', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="bildirim" id="mdCard"><h3 style="font-size:15px">${icon('palette', 'sm')} E-posta tasarımı</h3><div class="skel" style="height:14px;width:55%"></div></div>`,
  mount: () => mdLoad(),
});
async function mdLoad(keepDesign) {
  const c = $('#mdCard'); if (!c) return;
  try { const r = await api('mail.design.get'); if (!keepDesign || !MD.d) MD.d = r.design; MD.logo = r.logo; MD.siteLogo = r.site_logo; MD.domain = r.domain || ''; } catch (e) { setHTML(c, html`<p class="small muted">${e.message}</p>`); return; }
  mdDraw();
}
function mdDraw() {
  const c = $('#mdCard'); if (!c || !MD.d) return;
  const d = MD.d;
  const thumb = (k) => { const a = d.accent; const top = { kurumsal: html`<span style="height:3px;background:${a}"></span><span class="md-tl"></span>`, sade: html`<span class="md-tl" style="margin-top:4px"></span><span style="height:1px;background:#e5e7eb"></span>`, modern: html`<span class="md-tl" style="margin:6px auto 0"></span>`, resmi: html`<span class="md-tl" style="margin:5px auto 2px"></span><span style="height:3px;border-top:1px solid ${a};border-bottom:1px solid ${a}"></span>`, bant: html`<span style="height:14px;background:${a}"></span>` }[k];
    return html`<span class="md-th md-${k}">${top}<span class="md-l"></span><span class="md-l s"></span><span class="md-b" style="background:${a};border-radius:${k === 'modern' ? '9px' : k === 'resmi' ? '1px' : '3px'};${k === 'modern' ? 'width:80%;margin:6px auto 0' : ''}"></span></span>`; };
  setHTML(c, html`<div class="row between wrap"><h3 style="font-size:15px;margin:0">${icon('palette', 'sm')} E-posta tasarımı</h3><span class="tiny faint">Bildirim, hatırlatma ve davet e-postalarının görünümü</span></div>
    <div class="md-wrap">
      <div class="stack" style="gap:12px;min-width:0">
        <div><div class="ph-sec">Stil</div><div class="md-styles">${MD_STYLES.map(([k, l, s]) => html`<button type="button" class="md-st ${d.style === k ? 'on' : ''}" data-act="md-style" data-k="${k}" aria-pressed="${d.style === k ? 'true' : 'false'}">${thumb(k)}<b>${l}</b><span class="tiny faint">${s}</span></button>`)}</div></div>
        <div><div class="ph-sec">Kurum rengi</div><div class="row wrap" style="gap:6px;align-items:center">${MD_COLORS.map((x) => html`<button type="button" class="md-col ${d.accent === x ? 'on' : ''}" data-act="md-col" data-c="${x}" style="background:${x}" aria-label="Renk ${x}"></button>`)}<label class="md-col md-pick" title="Başka renk"><input type="color" value="${d.accent}" data-change="md-colin" aria-label="Başka renk">${icon('plus', 'sm')}</label></div></div>
        <div><div class="ph-sec">Logo</div>
          <div class="row wrap" style="gap:10px;align-items:center">
            <span class="md-logo">${MD.logo ? html`<img src="${MD.logo}" alt="E-posta logosu">` : MD.siteLogo ? html`<span class="tiny faint">Site logosu kullanılıyor</span>` : html`<span class="tiny faint">Logo yok · kurum adı yazılır</span>`}</span>
            <label class="btn sm">${icon('upload', 'sm')}<span>${MD.logo ? 'Değiştir' : 'Logo yükle'}</span><input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" data-change="md-logo"></label>
            ${MD.logo ? html`<button type="button" class="btn sm ghost danger" data-act="md-logo-x">Kaldır</button>` : ''}</div>
          <label class="small" style="display:flex;align-items:center;gap:10px;margin-top:10px">Genişlik <input type="range" min="24" max="240" step="2" value="${d.logo_w}" data-input="md-w" style="flex:1"><b id="mdW" style="width:52px;text-align:right">${d.logo_w} px</b></label>
          <div class="row wrap" style="gap:8px;margin-top:8px;align-items:center"><span class="small muted">Hizası</span>
            <div class="seg">${[['left', 'Sola'], ['center', 'Ortaya']].map(([k, l]) => html`<button type="button" class="${d.logo_align === k ? 'on' : ''}" data-act="md-align" data-k="${k}" ${d.style === 'modern' || d.style === 'resmi' ? raw('disabled title="Bu stilde logo ortadadır"') : ''}>${l}</button>`)}</div>
            <label class="small row" style="gap:6px;align-items:center"><input type="checkbox" data-change="md-name" ${d.show_name ? raw('checked') : ''}> Logonun altında kurum adı</label></div></div>
        <div class="field"><label for="mdFoot">Alt bilgi (isteğe bağlı)</label><textarea class="textarea" id="mdFoot" rows="2" maxlength="300" data-input="md-foot" placeholder="ör. Şehir Hastanesi · Yoğun Bakım Ünitesi · Dahili 4412">${d.footer}</textarea></div>
        <div class="row wrap" style="gap:8px"><button type="button" class="btn primary" data-act="md-save">Tasarımı kaydet</button><button type="button" class="btn" data-act="mail-test">${icon('send', 'sm')}<span>Deneme e-postası</span></button></div>
      </div>
      <div class="md-prev"><div class="row between" style="align-items:center;margin-bottom:6px"><span class="small muted">Önizleme</span>
        <div class="seg"><button type="button" class="${MD.wide ? '' : 'on'}" data-act="md-wide" data-w="0">Telefon</button><button type="button" class="${MD.wide ? 'on' : ''}" data-act="md-wide" data-w="1">Bilgisayar</button></div></div>
        <div class="md-frame ${MD.wide ? 'wide' : ''}"><iframe id="mdIf" title="E-posta önizlemesi" sandbox="" loading="lazy"></iframe></div></div>
    </div>
    <details class="md-bimi"><summary class="small"><b>Gmail’de gönderen resmi (profil fotoğrafı) neden yok?</b></summary>
      <div class="small stack" style="gap:6px;margin-top:8px">
        <p style="margin:0">Gelen kutusundaki yuvarlak resmi e-postanın içi değil, gönderen adres belirler. Uygulama bunu tek başına değiştiremez; iki yol var:</p>
        <p style="margin:0"><b>1. Gmail / Google Workspace adresiyle gönderiyorsanız:</b> o Google hesabına profil fotoğrafı (logonuz) koyun; alıcılar kısa süre içinde onu görür.</p>
        <p style="margin:0"><b>2. Kendi alan adınızla gönderiyorsanız${MD.domain ? html` (${MD.domain})` : ''}: BIMI.</b> Alan adınızın DNS’ine şu kayıtlar eklenir (Hostinger: hPanel › Alan adları › DNS):</p>
        <ul style="margin:0 0 0 18px"><li>SPF ve DKIM (e-posta sağlayıcınızın verdiği kayıtlar; Hostinger e-postada genelde hazırdır)</li>
          <li>DMARC: <code>_dmarc${MD.domain ? '.' + MD.domain : ''}</code> TXT <code>v=DMARC1; p=quarantine; rua=mailto:dmarc@${MD.domain || 'alanadiniz.com'}</code></li>
          <li>BIMI: <code>default._bimi${MD.domain ? '.' + MD.domain : ''}</code> TXT <code>v=BIMI1; l=https://…/logo.svg; a=https://…/sertifika.pem</code></li></ul>
        <p style="margin:0">Logo kare, <b>SVG Tiny P/S</b> biçiminde olmalı (tasarımcınız hazırlar). <b>Gmail</b> ayrıca ücretli bir marka sertifikası (VMC ya da CMC) ister; Yahoo, AOL ve bazı diğerleri sertifikasız da gösterir.</p>
      </div></details>`);
  mdPreview();
}
function mdPreview() {
  clearTimeout(MD.t);
  MD.t = setTimeout(async () => {
    const f = $('#mdIf'); if (!f) return;
    try { const r = await api('mail.preview', { design: MD.d }); f.srcdoc = r.html; } catch (e) { /* */ }
  }, 250);
}
function mdSet(patch, redraw) { Object.assign(MD.d, patch); if (redraw) mdDraw(); else mdPreview(); }
ACT['md-style'] = (el) => mdSet({ style: el.dataset.k }, true);
ACT['md-col'] = (el) => mdSet({ accent: el.dataset.c }, true);
CHANGE['md-colin'] = (el) => mdSet({ accent: el.value.toLowerCase() }, true);
ACT['md-align'] = (el) => mdSet({ logo_align: el.dataset.k }, true);
ACT['md-wide'] = (el) => { MD.wide = el.dataset.w === '1'; $$('#mdCard [data-act=md-wide]').forEach((b) => b.classList.toggle('on', b === el)); const fr = $('#mdCard .md-frame'); if (fr) fr.classList.toggle('wide', MD.wide); };
CHANGE['md-w'] = (el) => { const v = +el.value; const w = $('#mdW'); if (w) w.textContent = v + ' px'; mdSet({ logo_w: v }); };
CHANGE['md-name'] = (el) => mdSet({ show_name: el.checked });
CHANGE['md-foot'] = (el) => mdSet({ footer: el.value });
ACT['md-save'] = (el) => busy(el, async () => { try { const r = await api('mail.design.save', { design: MD.d }); MD.d = r.design; toast('E-posta tasarımı kaydedildi'); } catch (e) { toast(e.message, 'err'); } });
/** Logo: e-posta programları SVG göstermediği için PNG’ye çevrilir (en çok 600 px genişlik; kenar boşluğu korunur) */
CHANGE['md-logo'] = async (el) => {
  const file = el.files && el.files[0]; el.value = '';
  if (!file) return;
  if (file.size > 8 * 1048576) { toast('Görsel çok büyük (en çok 8 MB)', 'err'); return; }
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('Görsel açılamadı. PNG, JPG ya da SVG deneyin.')); img.src = url; });
    const iw = img.naturalWidth || 600, ih = img.naturalHeight || 200;
    const k = Math.min(1, 600 / iw);
    const cv = document.createElement('canvas'); cv.width = Math.max(8, Math.round(iw * k)); cv.height = Math.max(8, Math.round(ih * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    let data = cv.toDataURL('image/png');
    if (data.length > 2700000) data = cv.toDataURL('image/jpeg', 0.9);
    await api('brand.save', { mail_logo: data });
    await mdLoad(true); toast('E-posta logosu yüklendi');
  } catch (e) { toast(e.message, 'err'); }
};
ACT['md-logo-x'] = async () => { try { await api('brand.save', { mail_logo: '' }); await mdLoad(true); toast('E-posta logosu kaldırıldı'); } catch (e) { toast(e.message, 'err'); } };


/* ---------------- Gönderilen bildirimler: yanlış gideni herkesten geri al (yönetici hepsini, sorumlu kendi gönderdiklerini) ---------------- */
async function nbSentOpen() {
  const m = openModal({ title: 'Gönderilen bildirimler', body: html`<div style="display:grid;place-items:center;padding:30px"><div class="spinner"></div></div>` });
  let d;
  try { d = await api('notif.sent'); } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  const draw = () => m.setBody(html`<p class="small muted" style="margin:0 0 10px">Son 30 gün${d.admin ? '' : ' · yalnız sizin gönderdikleriniz'}. Yanlış giden bildirimi <b>Herkesten sil</b> ile kaldırın: herkesin bildirim listesinden silinir, telefon ekranında duruyorsa uygulama açılınca ya da sıradaki bildirimde kapanır. Gönderilmiş e-postalar geri alınamaz; kişisel mesaj ve arama bildirimleri burada görünmez.</p>
    ${d.items.length ? html`<div class="card"><div class="list nbs-list">${d.items.map((x, i) => { const [tone, ic, lab] = NB_CAT_UI[x.cat] || NB_CAT_UI.sistem;
      return html`<div class="list-row" style="gap:10px;align-items:flex-start"><span class="nbc-ico tone-${tone}">${icon(ic, 'sm')}</span>
        <div class="grow" style="min-width:0"><b class="small">${x.title}</b>${x.body ? html`<div class="tiny muted ellipsis">${x.body}</div>` : ''}
          <div class="tiny faint">${lab} · ${fmtRel(x.at)}${x.by ? ' · ' + x.by : ' · otomatik'} · <b>${x.n}</b> kişi · ${x.read} okudu</div></div>
        <button type="button" class="btn sm ghost danger" data-sent-del="${i}">${icon('trash', 'sm')}Herkesten sil</button></div>`; })}</div></div>`
      : html`<div class="card empty"><div class="e-ico">${icon('bell', 'lg')}</div><p class="small">Son 30 günde ${d.admin ? '' : 'sizin '}gönderdiğiniz bildirim yok.</p></div>`}`);
  draw();
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sent-del]'); if (!b) return;
    const x = d.items[+b.dataset.sentDel]; if (!x) return;
    if (!(await confirmDialog({ title: `“${x.title}” herkesten silinsin mi?`, text: `${x.n} kişinin bildirimlerinden kaldırılır. Telefon ekranında duruyorsa uygulama açılınca ya da sıradaki bildirim geldiğinde kapanır. Gönderilmiş e-postalar geri alınamaz.`, ok: 'Herkesten sil', danger: true }))) return;
    await busy(b, async () => {
      try {
        const r = await api('notif.retract', { g: x.g, kind: x.kind, title: x.title });
        d.items = d.items.filter((y) => y !== x); draw();
        toast(`Bildirim ${r.deleted} kişiden silindi`);
        nbSoon();
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}
ACT['nb-sent'] = () => nbSentOpen();
NM_EXT.settingsCards.push({
  sec: 'bildirim', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="bildirim" id="nbSentCard"><div class="row between wrap" style="gap:8px;align-items:center"><div><h3 style="font-size:15px;margin:0">${icon('send', 'sm')} Gönderilen bildirimler</h3><p class="tiny muted" style="margin:4px 0 0">Yanlış giden bir bildirimi herkesten geri alın.</p></div><button type="button" class="btn sm" data-act="nb-sent">Aç</button></div></div>`,
});
