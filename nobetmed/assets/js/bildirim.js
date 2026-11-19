/* dupcii — bildirim sistemi (4.7): canlı bildirim, ekranda açılır kartlar, ses/titreşim, rozet,
   kişisel bildirim ayarları, cihazlar, bildirim merkezi sayfası, birim bildirim politikası (yönetici) */
'use strict';

const NB = { since: '', seen: new Set(), timer: 0, active: Date.now(), audio: null, install: null, busy: false, cats: null, base: document.title };
const NB_CAT_UI = { mesaj: ['violet', 'chat', 'Mesaj'], eksik: ['rose', 'alert', 'Eksik personel'], duyuru: ['teal', 'megaphone', 'Duyuru'], belge: ['sky', 'file', 'Hastane belgesi'],
  nobet: ['emerald', 'calendar', 'Nöbet'], degisim: ['amber', 'history', 'Değişim / ilan'], istek: ['indigo', 'inbox', 'Nöbet isteği'], yonetim: ['rose', 'inbox', 'Onay bekliyor'], sistem: ['slate', 'bell', 'Bildirim'] };
const NB_KIND_CAT = { chat: 'mesaj', post: 'duyuru', remind: 'duyuru', digest: 'duyuru', hdoc: 'belge', roster: 'nobet', shift: 'nobet', side: 'nobet', callout: 'eksik',
  swap: 'degisim', listing: 'degisim', request: 'istek', review: 'yonetim', pending_post: 'yonetim', pending_user: 'yonetim', call: 'mesaj' };
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
      const r = await api('live', { since: NB.since });
      const first = !NB.since;
      NB.since = r.now;
      nbCounts(r);
      if (!first) nbIncoming(r.items || []);
      if (r.call && typeof callIncoming === 'function') callIncoming(r.call);
    } catch (e) { /* çevrimdışı ya da oturum bitti (api uyarır) */ }
    NB.busy = false;
  }
  NB.timer = setTimeout(nbTick, on ? nbInterval() : 5000);
}
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
  const iconUrl = nbIconUrl();
  setHTML(box, html`
    <div class="card card-pad stack">
      <div class="row between wrap" style="gap:8px"><h3 class="ph">${icon('bell', 'sm')} Bu cihaz</h3><span class="badge ${st === 'on' ? 'ok' : ''}">${st === 'on' ? 'Bildirimler açık' : st === 'denied' ? 'İzin engelli' : 'Kapalı'}</span></div>
      <div class="nb-preview" aria-hidden="true"><img src="${iconUrl}" alt=""><div class="grow" style="min-width:0"><div class="nbp-top">${S.settings.org_name || 'dupcii'} · şimdi</div><b>Elif Yılmaz</b><div class="nbp-b">${p.preview ? 'Yarın 08:00 devir sende, haberin olsun.' : 'Yeni mesaj'}</div></div></div>
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
      <p class="tiny faint">“Telefon”: uygulama kapalıyken de telefona/bilgisayara gelir. “Ekranda”: uygulama açıkken sağ üstte kart olarak görünür. Hepsi zil simgesindeki bildirim merkezinde her zaman durur.</p>
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
  try { if (await pushEnable()) { toast('Bildirimler bu cihazda açıldı'); nbDraw(); } } catch (e) { toast(e.message, 'err'); nbDraw(); }
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
    <div class="row wrap" style="gap:6px"><button class="btn sm" data-act="nbl-readall">${icon('check', 'sm')}Tümünü okundu say</button><button class="btn sm ghost" data-act="nbl-clean">${icon('trash', 'sm')}Okunanları sil</button><a class="btn sm icon ghost" href="#/profil/bildirim" aria-label="Bildirim ayarları" title="Bildirim ayarları">${icon('sliders', 'sm')}</a></div></div>
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
