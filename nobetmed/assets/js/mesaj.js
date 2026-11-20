/* dupcii — mesajlaşma (4.3): birim grubu, özel gruplar, birebir sohbet.
   Sohbet açıkken 3 sn'de bir hafif yoklama (paylaşımlı barındırmada anlık bağlantı yok); arka planda telefon bildirimi. */
'use strict';

Object.assign(ICON_PATHS, {
  reply: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  bellOff: 'M13.73 21a2 2 0 0 1-3.46 0 M18.63 13A17.89 17.89 0 0 1 18 8 M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14 M18 8a6 6 0 0 0-9.33-5 M1 1l22 22',
  checks: 'M2 12.5 6 16.5 14 8.5 M10 15.5l1 1 8-8',
});
NM_EXT.routes.mesaj = (view, r) => (r[1] === 'katil' && r[2] ? chatJoin(view, r[2]) : r[1] === 'ayarlar' ? chatSettingsPage(view) : r[1] === 'yildizli' ? chatStarredPage(view)
  : r[1] && /^\d+$/.test(r[1]) ? chatOpen(view, +r[1]) : chatList(view));
Object.assign(ICON_PATHS, {
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8',
  pin: 'M12 17v5 M9 10.76V6h6v4.76l2.5 2.74V16h-11v-2.5z M8 3h8',
  forward: 'M15 14l5-5-5-5 M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20',
  chart: ICON_PATHS.chart || 'M3 3v18h18 M8 16v-5 M13 16V8 M18 16v-9',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
});
async function chatJoin(view, token) {
  setHTML(view, html`<div class="card card-pad"><div class="small muted">Gruba katılınıyor…</div></div>`);
  try { const r = await api('chat.join', { token }); if (r.pending) { setHTML(view, html`<div class="card empty"><h3>İstek gönderildi</h3><p class="small">“${r.name}” grubunun yöneticisi onaylayınca katılacaksınız.</p><a class="btn" href="#/mesaj">Mesajlar</a></div>`); return; } location.replace('#/mesaj/' + r.id); } catch (e) { setHTML(view, html`<div class="card empty"><h3>Katılamadınız</h3><p class="small">${e.message}</p><a class="btn" href="#/mesaj">Mesajlar</a></div>`); }
}
NM_EXT.nav.push({ sec: 'genel', mod: 'mesaj', href: '#/mesaj', icon: 'chat', label: 'Mesajlar', match: (r) => r[0] === 'mesaj', count: () => S.chatUnread || 0, visible: () => !!S.hosp });
NM_EXT.notif.chat = ['violet', 'chat'];
Object.assign(NM_EXT.audit, { 'chat.create': 'Grup kurdu', 'chat.delete': 'Gruptan mesaj sildi' });

const CH = { id: 0, msgs: [], last: 0, timer: null, reply: null, chat: null, members: [], people: null, busy: false };

/* ---------------- Okunmamış sayısı (üst çubuk ve menü) ---------------- */
function chatEnabled() { return !!(S.me && S.hosp && modOn('mesaj')); }
async function chatUnreadSync() {
  if (!chatEnabled() || document.visibilityState !== 'visible' || !$('#shell')) return;
  try {
    const r = await api('chat.unread');
    if (S.chatUnread !== r.unread) { S.chatUnread = r.unread; chatBadge(); renderNav(); }
  } catch (e) { /* sessiz */ }
}
function chatBadge() {
  const b = $('#chatTopBtn');
  if (!b) {
    const notif = $('#notifBtn');
    if (!notif || !chatEnabled()) return;
    notif.insertAdjacentHTML('beforebegin', fmtVal(html`<a class="btn ghost icon notif-btn" href="#/mesaj" id="chatTopBtn" aria-label="Mesajlar" title="Mesajlar">${icon('chat')}<span class="count notif-count hidden" id="chatCount"></span></a>`));
    return chatBadge();
  }
  const c = $('#chatCount');
  const n = S.chatUnread || 0;
  if (c) { c.textContent = n > 99 ? '99+' : String(n); c.classList.toggle('hidden', !n); }
}
// Okunmamış sayısı bildirim.js canlı döngüsünden gelir (live → chat)
window.addEventListener('hashchange', () => setTimeout(() => { chatBadge(); if (!location.hash.startsWith('#/mesaj')) chatStop(); }, 0));
setTimeout(() => { chatBadge(); chatUnreadSync(); }, 1500);

/* ---------------- Sohbet listesi ---------------- */
async function chatList(view) {
  chatStop();
  CH.filter = CH.filter || 'all';
  setHTML(view, html`<div class="page-head ch-head-page"><div><h1>Mesajlar</h1></div>
    <div class="row" style="gap:6px"><button class="btn icon" data-act="ch-look" aria-label="Görünüm" title="Tema ve duvar kağıdı">${icon('palette', 'sm')}</button><a class="btn icon" href="#/mesaj/yildizli" aria-label="Yıldızlı mesajlar" title="Yıldızlı mesajlar">${icon('star', 'sm')}</a><a class="btn icon" href="#/mesaj/ayarlar" aria-label="Mesaj ayarları" title="Gizlilik ve ayarlar">${icon('sliders', 'sm')}</a>
    <button class="btn primary" data-act="ch-new">${icon('plus', 'sm')}<span>Yeni sohbet</span></button></div></div>
    <div class="${typeof chatHomeClass === 'function' ? chatHomeClass() : 'ch-home'}"><div id="chList"><div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div></div>`);
  let r;
  try { r = await api('chat.list'); } catch (e) { setHTML($('#chList'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  CH.canGroup = r.can_group; CH.callsOn = !!r.calls; CH.listAnim = false;
  CH.list = r.items;
  S.chatUnread = r.items.filter((x) => !x.muted).reduce((a, x) => a + x.unread + (x.unread_mark && !x.unread ? 1 : 0), 0); chatBadge();
  chatListDraw();
}
function chatListDraw() {
  const box = $('#chList');
  if (!box || !CH.list) return;
  const arch = CH.list.filter((c) => c.archived);
  const f = CH.filter;
  const list = CH.list.filter((c) => (f === 'arch' ? c.archived : !c.archived) && (f !== 'unread' || c.unread || c.unread_mark) && (f !== 'groups' || c.kind !== 'direct'));
  const tabs = html`<div class="seg ch-filters" role="tablist">${[['all', 'Tümü'], ['unread', 'Okunmamış'], ['groups', 'Gruplar'], ...(CH.callsOn ? [['calls', 'Aramalar']] : []), ['arch', `Arşiv${arch.length ? ' (' + arch.length + ')' : ''}`]].map(([k, l]) => html`<button type="button" class="${f === k ? 'on' : ''}" data-act="ch-filter" data-f="${k}">${l}</button>`)}</div>`;
  if (f === 'calls' && typeof callLogDraw === 'function') { setHTML(box, html`${tabs}<div id="callLog"><div class="card card-pad"><div class="skel" style="height:14px"></div></div></div>`); callLogDraw(); return; }
  const q = typeof avKey === 'function' ? avKey(CH.q || '') : '';
  const shown = q ? list.filter((c) => avKey(c.name).includes(q)) : list;
  // Arama: sohbeti olmayan kişiler de çıkar (dokununca birebir sohbet açılır)
  const direct = new Set(CH.list.filter((c) => c.kind === 'direct' && c.other).map((c) => c.other.tk + ':' + c.other.uid));
  const ppl = q && CH.people ? CH.people.filter((p) => !direct.has(p.tk + ':' + p.uid) && avKey(p.name).includes(q)).slice(0, 20) : [];
  if (q && !CH.people && typeof chatPeopleCache === 'function') chatPeopleCache().then(() => { if (CH.q) chatListDraw(); });
  const home = $('.ch-home'); if (home && typeof chatHomeClass === 'function') home.className = chatHomeClass();
  setHTML(box, html`<div class="search ch-search">${icon('search')}<input class="input" type="search" id="chQ" placeholder="Sohbet ya da kişi ara" value="${CH.q || ''}" data-input="ch-q" autocomplete="off"></div>
    ${tabs}
    ${shown.length ? html`<div class="ch-cards">${shown.map((c) => html`<a class="ch-card ch-row ${c.unread || c.unread_mark ? 'unread' : ''} k-${c.kind}" href="#/mesaj/${c.id}">
      <span class="ch-ava2">${c.photo ? html`<img src="${c.photo}" alt="">` : c.kind === 'direct' ? avatar(c.name) : html`<span class="ch-ava2-i">${icon(c.kind === 'unit' ? 'users' : 'chat')}</span>`}</span>
      <div class="ch-card-b"><div class="ch-card-t"><b class="ellipsis">${c.name}</b>${c.kind === 'unit' ? html`<span class="ch-tag">birim grubu</span>` : ''}${c.sub ? html`<span class="tiny faint ellipsis">${c.sub}</span>` : ''}<span class="grow"></span><span class="ch-card-time">${c.last_at ? chTime(c.last_at) : ''}</span></div>
        <div class="ch-card-s"><span class="ellipsis grow">${typeof chatDraftLoad === 'function' && chatDraftLoad(c.id) ? html`<span class="ch-draft">Taslak:</span> ${chatDraftLoad(c.id)}` : c.last || 'Henüz mesaj yok'}</span>
          ${c.pinned ? icon('pin', 'sm') : ''}${c.muted ? icon('bellOff', 'sm') : ''}${c.unread ? html`<span class="ch-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : c.unread_mark ? html`<span class="ch-badge dot"></span>` : ''}</div></div>
      <button type="button" class="ch-act" data-act="ch-rowmenu" data-id="${c.id}" aria-label="Sohbet işlemleri">${icon('more', 'sm')}</button></a>`)}</div>`
      : !ppl.length ? html`<div class="card empty"><p class="small">${q ? 'Bulunamadı.' : f === 'arch' ? 'Arşivde sohbet yok.' : f === 'unread' ? 'Okunmamış sohbet yok.' : 'Sohbet yok.'}</p></div>` : ''}
    ${ppl.length ? html`<div class="ch-pick-h" style="margin-top:12px">Kişiler · yeni sohbet</div><div class="ch-cards">${ppl.map((p) => html`<button type="button" class="ch-card k-person" data-act="ch-start" data-tk="${p.tk}" data-uid="${p.uid}">
      <span class="ch-ava2">${avatar(p.name)}</span><div class="ch-card-b"><div class="ch-card-t"><b class="ellipsis">${p.name}</b>${p.unit ? html`<span class="tiny faint ellipsis">${p.unit}</span>` : ''}</div><div class="ch-card-s"><span class="ellipsis grow">Yeni sohbet başlat</span>${icon('chat', 'sm')}</div></div></button>`)}</div>` : ''}
    <p class="tiny faint" style="margin-top:12px">${icon('lock', 'sm')} Mesajlar yalnız hastanenizin sunucusunda tutulur. Hasta adı, T.C. kimlik numarası gibi hasta bilgisi paylaşmayın.</p>`);
  CH.listAnim = true;
}
ACT['ch-filter'] = (el) => { CH.filter = el.dataset.f; chatListDraw(); };
function chTime(at) {
  const d = parseDT(at);
  const t = ymd(new Date());
  return at.slice(0, 10) === t ? at.slice(11, 16) : `${d.getDate()} ${TR_MONTHS[d.getMonth()].slice(0, 3)}`;
}

/* ---------------- Sohbet ekranı ---------------- */
function chatStop() { if (CH.timer) { clearInterval(CH.timer); CH.timer = null; } }
async function chatOpen(view, id) {
  chatStop();
  CH.id = id; CH.msgs = []; CH.last = 0; CH.reply = null; CH.read = null; CH.rc = { d: 0, r: 0 }; CH.stick = true; CH.seen = null;
  window.scrollTo(0, 0);
  setHTML(view, html`<div class="ch-view ${typeof chatThemeClass === 'function' ? chatThemeClass() : ''}" id="chatView">
    <div class="ch-head"><a class="btn ghost icon" href="#/mesaj" aria-label="Sohbetler">${icon('chevL')}</a>
      <button type="button" class="grow ch-headbtn" data-act="ch-info" style="min-width:0"><div class="ch-title ellipsis" id="chTitle">…</div><div class="tiny faint ellipsis" id="chSub"></div></button>
      <span id="chCallBtns" class="row" style="gap:0"></span>
      <button class="btn ghost icon" data-act="ch-more" aria-label="Sohbet menüsü">${icon('more')}</button></div>
    <div id="chSelBar" class="ch-selbar hidden"></div>
    <div id="chPin"></div>
    <div class="ch-scroll ${chatUiClass()}" id="chScroll"><div id="chMore"></div><div id="chMsgs"></div></div>
    <button type="button" class="ch-down hidden" id="chDown" data-act="ch-down" aria-label="En alta in">${icon('chevD')}<span class="count hidden" id="chDownN"></span></button>
    <div class="ch-compose" id="chCompose"></div></div>`);
  CH.sel = null; CH.divider = 0;
  let r;
  try { r = await api('chat.open', { id }); } catch (e) { setHTML($('#chMsgs'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (CH.id !== id) return;
  CH.chat = r.chat; CH.members = r.members; CH.emojis = r.emojis || []; CH.since = r.now; CH.pinned = r.pinned; CH.rc = r.rc || { d: 0, r: 0 };
  chatPinBar();
  $('#chTitle').textContent = r.chat.name;
  // Okunmamış ayıracı: açılıştan önceki son okunan
  const unreadN = r.msgs.filter((m) => m.id > (r.chat.last_read || 0) && !m.mine && m.kind !== 'system').length;
  CH.divider = unreadN ? r.chat.last_read : 0;
  if (r.chat.calls && r.chat.peer && !r.chat.peer.blocked && typeof callStart === 'function') setHTML($('#chCallBtns'), html`<button class="btn ghost icon" data-act="ch-call" data-v="1" aria-label="Görüntülü ara" title="Görüntülü ara">${icon('video')}</button><button class="btn ghost icon" data-act="ch-call" data-v="0" aria-label="Sesli ara" title="Sesli ara">${icon('phone')}</button>`);
  CH.typing = [];
  chatHeadStatus();
  chatAdd(r.msgs, true);
  CH.seen = new Set(CH.msgs.map((m) => m.id)); // açılıştaki mesajlar canlandırılmaz; sonradan gelenler gelir
  setHTML($('#chMore'), r.more ? html`<button class="btn sm ghost" data-act="ch-older" style="margin:6px auto;display:flex">Önceki mesajlar</button>` : '');
  chatComposer();
  if (typeof chatGestures === 'function') chatGestures($('#chScroll'));
  // Açılışta en yeni mesaj görünür (okunmamış ayıracı yerinde durur); görseller sonradan yüklense de en altta kalır
  chatFit();
  chatStickInit();
  chatScrollEnd(true);
  chatUnreadSync();
  CH.timer = setInterval(chatPoll, 3000);
}
function chatComposer() {
  const box = $('#chCompose');
  if (!box) return;
  if (!CH.chat.can_send) { setHTML(box, html`<div class="tiny faint" style="text-align:center;padding:10px">${icon('lock', 'sm')} Bu grupta yalnız yöneticiler mesaj gönderebilir.</div>`); return; }
  if (CH.chat.restricted) { setHTML(box, html`<div class="tiny faint" style="text-align:center;padding:10px">${icon('lock', 'sm')} Grup yöneticisi bu grupta yazmanızı kısıtladı. Mesajları okuyabilirsiniz.</div>`); return; }
  const rec = !!(window.MediaRecorder && navigator.mediaDevices);
  setHTML(box, html`<div id="chReply"></div><div id="chAt" class="ch-atlist hidden"></div><div id="chEmo" class="ch-emopick hidden"></div>
    <div class="ch-bar ${rec ? 'can-rec' : ''}" id="chBar"><div class="ch-field">
      <button type="button" class="ch-ib" data-act="ch-emoji" aria-label="Emoji" title="Emoji">${icon('smile')}</button>
      <textarea class="ch-input" id="chInput" rows="1" maxlength="4000" placeholder="Mesaj" aria-label="Mesaj (hasta bilgisi paylaşmayın)"></textarea>
      <button type="button" class="ch-ib" data-act="ch-attach" aria-label="Ekle" title="Fotoğraf, video, belge, konum, kişi, anket">${icon('paperclip')}</button>
      <button type="button" class="ch-ib ch-camb" data-act="ch-cam" aria-label="Kamera" title="Fotoğraf / video çek">${icon('camera')}</button></div>
      <input type="file" hidden id="chFile" multiple>
      ${rec ? html`<button type="button" class="btn primary icon ch-recb" data-act="ch-rec" id="chRecBtn" aria-label="Sesli mesaj kaydet" title="Sesli mesaj">${icon('mic')}</button>` : ''}
      <button class="btn primary icon ch-sendb" data-act="ch-send" aria-label="Gönder">${icon('send')}</button></div>`);
  const ta = $('#chInput');
  const bar = $('#chBar');
  const sync = () => { bar.classList.toggle('has-text', !!ta.value.trim()); };
  if (typeof chatDraftLoad === 'function') { ta.value = chatDraftLoad(CH.id); if (ta.value) { setTimeout(() => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; }, 0); } }
  sync();
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; chatAtSuggest(ta); sync(); if (typeof chatDraftSave === 'function') chatDraftSave(CH.id, ta.value); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 900 && chatUi().enter) { e.preventDefault(); ACT['ch-send'](); } else chatTypingPing(); });
  $('#chFile').addEventListener('change', (e) => { const fs = [...e.target.files].slice(0, 10); const once = !!CH.onceNext; CH.onceNext = false; e.target.value = ''; if (fs.length) chatPreview(fs, { once }); });
}
/** "@" yazınca sohbet üyelerinden öneri */
function chatAtSuggest(ta) {
  const box = $('#chAt');
  if (!box) return;
  const pos = ta.selectionStart;
  const m = /(^|\s)@([^\s@]{0,20})$/.exec(ta.value.slice(0, pos));
  let list = m ? (CH.members || []).filter((p) => !(p.uid === S.me.id && !p.unit) && avKey(p.name).startsWith(avKey(m[2]))).slice(0, 6) : [];
  if (m && CH.chat && CH.chat.kind !== 'direct' && (CH.chat.admin || (CH.chat.kind === 'unit' && isPublisherBase())) && 'herkes'.startsWith(avKey(m[2]))) list = [{ name: 'herkes', unit: 'Gruptaki herkese seslen' }].concat(list).slice(0, 6);
  box.classList.toggle('hidden', !list.length);
  if (!list.length) return;
  setHTML(box, html`${list.map((p) => html`<button type="button" class="ch-atbtn" data-act="ch-at" data-n="${p.name}">${avatar(p.name, 'sm')}<span>${p.name}</span>${p.unit ? html`<span class="tiny faint">${p.unit}</span>` : ''}</button>`)}`);
}
ACT['ch-at'] = (el) => {
  const ta = $('#chInput');
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos).replace(/@([^\s@]{0,20})$/, () => '@' + el.dataset.n + ' ');
  ta.value = before + ta.value.slice(pos);
  ta.focus(); ta.selectionStart = ta.selectionEnd = before.length;
  $('#chAt').classList.add('hidden');
};
ACT['ch-attach'] = () => {
  const md = openModal({ title: 'Ekle', size: 'narrow', body: html`<div class="list">
    <button type="button" class="list-row" data-o="file" style="width:100%;border:0;background:none;text-align:left">${icon('image', 'sm')}<span>Fotoğraf veya dosya</span></button>
    <button type="button" class="list-row" data-o="poll" style="width:100%;border:0;background:none;text-align:left">${icon('chart', 'sm')}<span>Anket</span></button></div>` });
  md.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-o]');
    if (!b) return;
    md.close();
    if (b.dataset.o === 'file') $('#chFile').click(); else chatPollModal();
  });
};
function chatPollModal() {
  const m = openModal({ title: 'Anket', body: html`<form class="stack" id="chPollF">
      <div class="field"><label>Soru</label><input class="input" name="question" maxlength="300" required placeholder="ör. Eğitim hangi gün olsun?"></div>
      <div class="stack" id="chPollOpts" style="gap:6px">${[1, 2, 3].map((n) => html`<input class="input" name="o${n}" maxlength="100" placeholder="Seçenek ${n}">`)}</div>
      <button type="button" class="btn sm ghost" id="chPollMore">${icon('plus', 'sm')}<span>Seçenek ekle</span></button>
      <label class="small"><input type="checkbox" name="multi"> Birden çok seçilebilsin</label>
      <div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="chPollF">Gönder</button>` });
  $('#chPollMore', m.el).addEventListener('click', () => { const box = $('#chPollOpts', m.el); const n = box.children.length + 1; if (n <= 12) box.insertAdjacentHTML('beforeend', `<input class="input" name="o${n}" maxlength="100" placeholder="Seçenek ${n}">`); });
  const f = $('#chPollF', m.el);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async (d) => {
      const options = Object.keys(d).filter((k) => /^o\d+$/.test(k)).map((k) => d[k].trim()).filter(Boolean);
      const r = await api('chat.survey', { id: CH.id, question: d.question.trim(), options, multi: !!d.multi });
      m.close(); chatAdd([r.msg]); chatScrollEnd(true);
    });
  });
}
/* Sesli mesaj: dokun → kayıt, tekrar dokun → gönder (en fazla 5 dk) */
ACT['ch-rec'] = async (el) => {
  if (CH.rec) { CH.rec.stop(); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { toast('Mikrofona izin verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni verin.', 'err'); return; }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  const t0 = Date.now();
  CH.rec = rec;
  el.classList.add('rec');
  const tip = $('#chReply');
  const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); if (tip) setHTML(tip, html`<div class="ch-up tiny"><span class="rec-dot"></span> Kaydediliyor ${Math.floor(s / 60)}:${pad(s % 60)} — göndermek için mikrofona tekrar dokunun <button type="button" class="btn sm ghost" data-act="ch-rec-cancel">Vazgeç</button></div>`); if (s >= 300) rec.stop(); }, 250);
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    el.classList.remove('rec');
    const cancelled = CH.recCancel;
    CH.rec = null; CH.recCancel = false;
    if (tip) setHTML(tip, '');
    const dur = Math.round((Date.now() - t0) / 1000);
    if (cancelled || !chunks.length || dur < 1) return;
    const mt = (rec.mimeType || type || 'audio/webm').split(';')[0];
    const ext = /mp4/.test(mt) ? 'm4a' : /ogg/.test(mt) ? 'ogg' : 'weba';
    const file = new File(chunks, `sesli-mesaj.${ext}`, { type: mt });
    try {
      const a = await uploadFile(file);
      const r = await api('chat.send', { id: CH.id, att_id: a.id, dur, reply_to: CH.reply ? CH.reply.id : null });
      chatSetReply(null); chatAdd([r.msg]); chatScrollEnd(true);
    } catch (e) { toast(e.message, 'err'); }
  };
  rec.start(1000);
};
ACT['ch-rec-cancel'] = () => { if (CH.rec) { CH.recCancel = true; CH.rec.stop(); } };
function chatScrollEnd(force) {
  const s = $('#chScroll');
  if (!s) return;
  if (force || CH.stick || s.scrollHeight - s.scrollTop - s.clientHeight < 160) { s.scrollTop = s.scrollHeight; CH.stick = true; }
}
/**
 * Sohbet ekranı görünen alana sığar: üstteki duyuru bandı / şeritler, alttaki menü ve telefon klavyesi hesaba katılır;
 * yazma kutusu her zaman ekranda kalır.
 */
function chatFit() {
  const v = $('#chatView');
  if (!v) return;
  const vv = window.visualViewport;
  const vh = vv ? vv.height : window.innerHeight;
  const top = v.getBoundingClientRect().top;
  const bn = $('#bottomNav');
  const bnh = bn && getComputedStyle(bn).display !== 'none' && !(vv && vv.height < window.innerHeight - 120) ? bn.getBoundingClientRect().height : 0; // klavye açıkken alt menü klavyenin altında
  chatObserveBars();
  const h = Math.max(300, Math.floor(vh - Math.max(0, top) - bnh - 12));
  v.style.height = h + 'px';
  if (CH.stick) chatScrollEnd(true);
}
/** Kişi yukarı kaydırmadıkça en altta kal (görsel / ses yüklenince, yeni mesaj gelince) */
function chatStickInit() {
  const s = $('#chScroll'); const box = $('#chMsgs');
  if (!s || !box) return;
  s.addEventListener('scroll', () => { CH.stick = s.scrollHeight - s.scrollTop - s.clientHeight < 80; }, { passive: true });
  if (window.ResizeObserver) {
    if (CH.ro) CH.ro.disconnect();
    CH.ro = new ResizeObserver(() => { if (CH.stick && $('#chScroll') === s) s.scrollTop = s.scrollHeight; });
    CH.ro.observe(box);
  }
  box.addEventListener('load', () => { if (CH.stick) s.scrollTop = s.scrollHeight; }, true);
}
['resize', 'orientationchange'].forEach((ev) => window.addEventListener(ev, () => { if ($('#chatView')) chatFit(); }));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if ($('#chatView')) chatFit(); });
// Üstteki bant / şerit çıkınca ya da kapanınca sohbet ekranı yeniden sığdırılır
const chFitRO = window.ResizeObserver ? new ResizeObserver(() => { if ($('#chatView')) chatFit(); }) : null;
function chatObserveBars() {
  if (!chFitRO) return;
  ['bannerSlot', 'vwBar', 'blBar'].forEach((id) => { const el = document.getElementById(id); if (el && !el._chObs) { el._chObs = true; chFitRO.observe(el); } });
}
function chatAdd(list, reset) {
  const known = new Set(CH.msgs.map((m) => m.id));
  list.forEach((m) => { if (!known.has(m.id)) CH.msgs.push(m); });
  CH.msgs.sort((a, b) => a.id - b.id);
  if (CH.msgs.length) CH.last = Math.max(CH.last, CH.msgs[CH.msgs.length - 1].id);
  chatDraw();
}
function chatDraw() {
  const box = $('#chMsgs');
  if (!box) return;
  const group = CH.chat && CH.chat.kind !== 'direct';
  let day = '';
  const parts = [];
  const lastMine = [...CH.msgs].reverse().find((m) => m.mine && !m.deleted && m.kind !== 'system');
  const div = CH.divider || 0;
  let divDone = false;
  CH.msgs.forEach((m, i) => {
    const d = m.at.slice(0, 10);
    if (d !== day) { day = d; parts.push(html`<div class="ch-day"><span>${dateLabel(d)}</span></div>`); }
    if (div && !divDone && m.id > div && !m.mine && m.kind !== 'system') {
      divDone = true;
      const n = CH.msgs.filter((x) => x.id > div && !x.mine && x.kind !== 'system').length;
      parts.push(html`<div class="ch-unread" id="chUnreadDiv"><span>${n} okunmamış mesaj</span></div>`);
    }
    if (m.kind === 'system') { parts.push(html`<div class="ch-sys">${m.body}</div>`); return; }
    const prev = CH.msgs[i - 1];
    const cont = prev && prev.kind !== 'system' && prev.tk === m.tk && prev.uid === m.uid && prev.at.slice(0, 10) === d && !(div && prev.id <= div && m.id > div);
    const sel = CH.sel && CH.sel.has(m.id);
    const other = group && !m.mine;
    const fresh = CH.seen && !CH.seen.has(m.id);
    parts.push(html`<div class="ch-msg ${m.mine ? 'mine' : ''} ${cont ? 'cont' : ''} ${sel ? 'sel' : ''} ${CH.sel ? 'selmode' : ''} ${fresh ? 'ch-new' : ''}" data-id="${m.id}">
      ${CH.sel ? html`<span class="ch-chk" aria-hidden="true">${sel ? icon('check', 'sm') : ''}</span>` : ''}
      ${other ? (cont ? html`<span class="ch-avs"></span>` : html`<button type="button" class="ch-avb" data-act="ch-profile" data-tk="${m.tk}" data-uid="${m.uid}" aria-label="${m.name} profili">${avatar(m.name, 'sm')}</button>`) : ''}
      <div class="ch-bub">${other && !cont ? html`<button type="button" class="ch-from" data-act="ch-profile" data-tk="${m.tk}" data-uid="${m.uid}">${m.name}</button>` : ''}
        ${m.reply_ref ? html`<button type="button" class="ch-quote" data-act="ch-goto" data-id="${m.reply}"><b>${m.reply_ref.name}</b><span>${m.reply_ref.body}</span></button>` : ''}
        ${typeof chatBodyHtml === 'function' ? chatBodyHtml(m) : html`<div class="ch-text">${m.body}</div>`}
        <div class="ch-time">${m.star ? icon('star', 'sm') : ''}${m.edited ? html`<span>düzenlendi</span>` : ''}${m.at.slice(11, 16)}${m.mine && !m.deleted ? chatTick(m, group && m === lastMine) : ''}</div>
      </div>${m.deleted || CH.sel ? '' : html`<span class="ch-acts"><button type="button" class="ch-act ch-qr" data-act="ch-qreact" data-id="${m.id}" aria-label="Tepki ver">${icon('smile', 'sm')}</button><button type="button" class="ch-act" data-act="ch-menu" data-id="${m.id}" aria-label="Mesaj işlemleri">${icon('more', 'sm')}</button></span>`}</div>`);
  });
  setHTML(box, parts.length ? html`${parts}` : html`<div class="ch-empty small muted">Henüz mesaj yok. İlk mesajı siz yazın.</div>`);
  if (CH.seen) CH.msgs.forEach((m) => CH.seen.add(m.id));
  if (typeof chatDownSync === 'function') chatDownSync();
}
/** Kendi mesajında tik: tek gri gönderildi, çift gri ulaştı, mavi okundu (gruplarda herkes); gruplarda son mesajda okuyan sayısı */
function chatTick(m, showN) {
  const rc = CH.rc || { d: 0, r: 0 };
  const st = m.id <= rc.r ? 'read' : m.id <= rc.d ? 'dlv' : 'sent';
  const t = st === 'read' ? 'Okundu' : st === 'dlv' ? 'Ulaştı' : 'Gönderildi';
  const n = showN && CH.read && CH.read.id === m.id && CH.read.n ? ' ' + CH.read.n : '';
  return html` <span class="ch-tk ${st}" title="${t}" aria-label="${t}">${icon(st === 'sent' ? 'check' : 'checks', 'sm')}${n ? html`<span class="ch-tk-n">${n}</span>` : ''}</span>`;
}
/** @bahsetme vurgusu: sohbet üyelerinin adları (metin güvenli parçalara bölünür) */
function chatMentions(text) {
  const names = (CH.members || []).map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!text.includes('@') || !names.length) return text;
  const low = text.toLocaleLowerCase('tr');
  const parts = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@', i);
    if (at < 0) { parts.push(text.slice(i)); break; }
    const nm = names.find((n) => low.startsWith('@' + n.toLocaleLowerCase('tr'), at));
    if (!nm) { parts.push(text.slice(i, at + 1)); i = at + 1; continue; }
    parts.push(text.slice(i, at));
    parts.push(html`<b class="ch-at">${text.slice(at, at + nm.length + 1)}</b>`);
    i = at + nm.length + 1;
  }
  return html`${parts}`;
}
function chatPollHtml(m) {
  const p = m.poll;
  const total = Math.max(1, p.opts.reduce((a, o) => a + o.n, 0));
  return html`<div class="ch-poll"><div class="ch-poll-q">${icon('chart', 'sm')} ${m.body}</div>
    <div class="tiny faint">${p.multi ? 'Birden çok seçilebilir' : 'Tek seçim'} · ${p.voters} kişi oy verdi</div>
    ${p.opts.map((o, i) => html`<button type="button" class="ch-opt ${o.mine ? 'on' : ''}" data-act="ch-vote" data-id="${m.id}" data-i="${i}">
      <span class="ch-opt-bar" style="width:${Math.round((o.n / total) * 100)}%"></span><span class="ch-opt-t">${o.mine ? icon('check', 'sm') : ''}${o.t}</span><b>${o.n}</b></button>`)}</div>`;
}
function chatPinBar() {
  const box = $('#chPin');
  if (!box) return;
  const p = CH.pinned;
  setHTML(box, p ? html`<button type="button" class="ch-pinbar" data-act="ch-gopin">${icon('pin', 'sm')}<span class="grow ellipsis"><b>${p.name}:</b> ${p.text}</span>${CH.chat && CH.chat.can_pin ? html`<span class="tiny" data-act="ch-unpin" role="button">Kaldır</span>` : ''}</button>` : '');
}
ACT['ch-gopin'] = (el, ev) => {
  if (ev && ev.target.closest('[data-act=ch-unpin]')) return;
  const n = $(`.ch-msg[data-id="${CH.pinned.id}"]`);
  if (n) { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1500); } else toast('Mesaj daha eskilerde; “Önceki mesajlar” ile yükleyin.');
};
ACT['ch-unpin'] = async (el, ev) => { if (ev) ev.stopPropagation(); try { const r = await api('chat.pin', { id: CH.id, msg: 0 }); CH.pinned = r.pinned; chatPinBar(); } catch (e) { toast(e.message, 'err'); } };
ACT['ch-react'] = async (el) => {
  try { const r = await api('chat.react', { id: +el.dataset.id, emoji: el.dataset.e }); const i = CH.msgs.findIndex((m) => m.id === r.msg.id); if (i >= 0) { CH.msgs[i] = r.msg; chatDraw(); } } catch (e) { toast(e.message, 'err'); }
};
ACT['ch-vote'] = async (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id);
  if (!m) return;
  const i = +el.dataset.i;
  let sel = m.poll.opts.map((o, k) => (o.mine ? k : -1)).filter((k) => k >= 0);
  if (m.poll.multi) sel = sel.includes(i) ? sel.filter((k) => k !== i) : [...sel, i];
  else sel = sel.includes(i) ? [] : [i];
  try { const r = await api('chat.vote', { id: m.id, opts: sel }); const k = CH.msgs.findIndex((x) => x.id === r.msg.id); if (k >= 0) { CH.msgs[k] = r.msg; chatDraw(); } } catch (e) { toast(e.message, 'err'); }
};
function chSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
async function chatPoll() {
  if (!$('#chatView') || !location.hash.startsWith('#/mesaj/' + CH.id)) { chatStop(); return; }
  if (document.visibilityState !== 'visible' || CH.busy) return;
  CH.busy = true;
  try {
    const r = await api('chat.poll', { id: CH.id, after: CH.last, seen: true, since: CH.since || '' });
    let changed = false;
    CH.since = r.now || CH.since;
    const tp = JSON.stringify(r.typing || []);
    if (tp !== JSON.stringify(CH.typing || []) || (r.peer && JSON.stringify(r.peer) !== JSON.stringify(CH.chat.peer))) { CH.typing = r.typing || []; if (r.peer) CH.chat.peer = r.peer; chatHeadStatus(); }
    (r.upd || []).forEach((u) => { const i = CH.msgs.findIndex((m) => m.id === u.id); if (i >= 0) { CH.msgs[i] = u; changed = true; } });
    if (JSON.stringify(r.pinned || null) !== JSON.stringify(CH.pinned || null)) { CH.pinned = r.pinned; chatPinBar(); }
    if (r.deleted.length) { CH.msgs.forEach((m) => { if (r.deleted.includes(m.id) && !m.deleted) { m.deleted = true; m.body = ''; delete m.file; changed = true; } }); }
    const rc = r.rc || { d: 0, r: 0 };
    const readChanged = !CH.read || CH.read.id !== r.read.id || CH.read.n !== r.read.n || !CH.rc || CH.rc.d !== rc.d || CH.rc.r !== rc.r;
    CH.read = r.read; CH.rc = rc;
    const sc = $('#chScroll');
    if (r.msgs.length && sc && sc.scrollHeight - sc.scrollTop - sc.clientHeight > 300) CH.downN = (CH.downN || 0) + r.msgs.filter((x) => !x.mine).length;
    if (r.msgs.length) chatAdd(r.msgs); else if (changed || readChanged) chatDraw();
    if (r.msgs.length) chatScrollEnd();
  } catch (e) { if (e.status === 403 || e.status === 404) { chatStop(); toast(e.message, 'err'); location.hash = '#/mesaj'; } } finally { CH.busy = false; }
}
ACT['ch-older'] = (el) => busy(el, async () => {
  const s = $('#chScroll'); const h = s.scrollHeight;
  const r = await api('chat.older', { id: CH.id, before: CH.msgs.length ? CH.msgs[0].id : 0 });
  chatAdd(r.msgs);
  setHTML($('#chMore'), r.more ? html`<button class="btn sm ghost" data-act="ch-older" style="margin:6px auto;display:flex">Önceki mesajlar</button>` : '');
  s.scrollTop = s.scrollHeight - h;
});
ACT['ch-send'] = async () => {
  const ta = $('#chInput');
  if (!ta) return;
  const body = ta.value.trim();
  if (!body) return;
  const btn = $('[data-act=ch-send]');
  btn.disabled = true;
  try {
    const r = await api('chat.send', { id: CH.id, body, reply_to: CH.reply ? CH.reply.id : null });
    ta.value = ''; ta.style.height = 'auto'; chatSetReply(null);
    if (typeof chatDraftSave === 'function') chatDraftSave(CH.id, '');
    const bar = $('#chBar'); if (bar) bar.classList.remove('has-text');
    CH.divider = 0;
    chatAdd([r.msg]); chatScrollEnd(true);
  } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; ta.focus(); }
};
/** Fotoğrafı telefonda küçült (en uzun kenar 1600 px, JPEG) — hızlı gönderim, az yer */
async function chatShrink(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size < 350000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}
async function chatSendFile(f0, opt = {}) {
  const isVideo = /^video\//.test(f0.type);
  if (f0.size > (isVideo ? 64 : 25) * 1048576) { toast(isVideo ? 'Video en fazla 64 MB olabilir; daha kısa çekin' : 'Dosya en fazla 25 MB olabilir', 'err'); return; }
  const tip = $('#chReply');
  const f = await chatShrink(f0);
  const body = typeof opt.caption === 'string' ? opt.caption : ($('#chInput') || {}).value ? $('#chInput').value.trim() : '';
  try {
    if (tip) setHTML(tip, html`<div class="ch-up tiny">${icon('upload', 'sm')} ${f.name} gönderiliyor… <span id="chUpP">%0</span></div>`);
    const a = await uploadFile(f, (p) => { const el = $('#chUpP'); if (el) el.textContent = '%' + Math.round(p * 100); });
    const r = await api('chat.send', { id: CH.id, body, att_id: a.id, reply_to: CH.reply ? CH.reply.id : null, once: !!opt.once, dur: opt.dur || null });
    if ($('#chInput')) { $('#chInput').value = ''; const bar = $('#chBar'); if (bar) bar.classList.remove('has-text'); if (typeof chatDraftSave === 'function') chatDraftSave(CH.id, ''); }
    if (tip) setHTML(tip, '');
    chatSetReply(null);
    chatAdd([r.msg]); chatScrollEnd(true);
  } catch (e) { toast(e.message, 'err'); if (tip) setHTML(tip, ''); }
}
function chatSetReply(m) {
  CH.reply = m;
  const box = $('#chReply');
  if (!box) return;
  setHTML(box, m ? html`<div class="ch-replybar"><div class="grow" style="min-width:0"><b class="small">${m.name}</b><div class="tiny ellipsis">${m.body || (m.file ? m.file.name : '')}</div></div><button type="button" class="btn ghost icon sm" data-act="ch-noreply" aria-label="Yanıtı kaldır">${icon('x', 'sm')}</button></div>` : '');
  if (m) { const ta = $('#chInput'); if (ta) ta.focus(); }
}
ACT['ch-noreply'] = () => chatSetReply(null);
ACT['ch-showimg'] = (el) => { CH.shown = CH.shown || new Set(); CH.shown.add(+el.dataset.id); chatDraw(); };
function chatEdit(m) {
  const md = openModal({ title: 'Mesajı düzenle', body: html`<form class="stack" id="chEditF"><textarea class="textarea" name="body" maxlength="4000" style="min-height:100px">${m.body}</textarea><div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="chEditF">Kaydet</button>` });
  const f = $('#chEditF', md.el);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(f, async (d) => { const r = await api('chat.edit', { id: m.id, body: d.body }); const i = CH.msgs.findIndex((x) => x.id === m.id); if (i >= 0) CH.msgs[i] = r.msg; md.close(); chatDraw(); }); });
}
ACT['ch-file'] = (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id);
  if (!m || !m.file) return;
  const md = openModal({ title: m.file.name, size: 'wide', body: html`<div class="ch-prev" style="height:min(75vh,760px);display:flex;flex-direction:column"></div>`,
    foot: html`<a class="btn" href="${m.file.url}&dl=1">${icon('download', 'sm')}<span>İndir</span></a><button class="btn primary" data-close>Kapat</button>` });
  mountPreview($('.ch-prev', md.el), m.file);
};
ACT['ch-menu'] = (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id);
  if (!m || m.deleted) return;
  if (navigator.vibrate && matchMedia('(pointer: coarse)').matches) { try { navigator.vibrate(12); } catch (e) { /* */ } }
  const canSend = CH.chat.can_send && !CH.chat.restricted;
  const items = [];
  if (canSend) items.push(['reply', 'Yanıtla', () => chatSetReply(m)]);
  if (CH.chat.kind !== 'direct' && !m.mine && m.kind !== 'call') items.push(['chat', 'Özelden yanıtla', () => chatReplyPrivate(m)]);
  if (m.body && m.kind !== 'contact' && m.kind !== 'location') items.push(['copy', 'Kopyala', async () => toast((await copyText(m.body)) ? 'Kopyalandı' : 'Kopyalanamadı')]);
  if (!['poll', 'call'].includes(m.kind) && !m.once) items.push(['forward', 'İlet', () => chatForward(m)]);
  items.push(['star', m.star ? 'Yıldızı kaldır' : 'Yıldızla', () => chatStar(m)]);
  items.push(['check', 'Seç', () => chatSelStart(m)]);
  if (m.mine && m.kind === 'text' && (Date.now() - parseDT(m.at).getTime()) < 15 * 60000) items.push(['edit', 'Düzenle', () => chatEdit(m)]);
  if (CH.chat.can_pin && m.kind !== 'call') items.push(['pin', CH.pinned && CH.pinned.id === m.id ? 'Sabitlemeyi kaldır' : 'Sabitle', async () => {
    try { const r = await api('chat.pin', { id: CH.id, msg: CH.pinned && CH.pinned.id === m.id ? 0 : m.id }); CH.pinned = r.pinned; chatPinBar(); } catch (e) { toast(e.message, 'err'); }
  }]);
  if (m.kind === 'poll' && (m.mine || CH.chat.admin)) items.push(['users', 'Oy verenler', async () => {
    try {
      const r = await api('chat.voters', { id: m.id });
      openModal({ title: 'Oy verenler', body: html`<div class="stack">${r.opts.map((o) => html`<div><b class="small">${o.t}</b> <span class="tiny faint">(${o.names.length})</span><div class="small muted">${o.names.join(', ') || '—'}</div></div>`)}</div>` });
    } catch (e) { toast(e.message, 'err'); }
  }]);
  if (m.mine || CH.chat.admin) items.push(['eye', 'Bilgi (kimler okudu)', async () => {
    try {
      const r = await api('chat.readers', { id: m.id });
      openModal({ title: 'Okuyanlar', size: 'narrow', body: html`${r.off ? html`<p class="small muted">Okundu bilginiz kapalı; başkalarının okuduğunu göremezsiniz.</p>` : r.read.length ? html`<div class="list">${r.read.map((p) => html`<div class="list-row">${avatar(p.name, 'sm')}<div class="grow">${p.name}${p.unit ? html` <span class="tiny faint">· ${p.unit}</span>` : ''}</div>${p.at ? html`<span class="tiny faint">${fmtRel(p.at)}</span>` : ''}</div>`)}</div>` : html`<p class="small muted">Henüz kimse okumadı.</p>`}` });
    } catch (e) { toast(e.message, 'err'); }
  }]);
  items.push(['eyeOff', 'Benden sil', async () => { try { await api('chat.hide', { id: m.id }); CH.msgs = CH.msgs.filter((x) => x.id !== m.id); chatDraw(); } catch (e) { toast(e.message, 'err'); } }]);
  if ((m.mine || CH.chat.admin) && m.kind !== 'call') items.push(['trash', 'Herkesten sil', async () => {
    if (!(await confirmDialog({ title: 'Mesaj silinsin mi?', text: 'Mesaj ve eki herkesten silinir; yerinde “Bu mesaj silindi” yazar.', ok: 'Sil', danger: true }))) return;
    try { await api('chat.delete', { id: m.id }); m.deleted = true; m.body = ''; delete m.file; chatDraw(); } catch (e) { toast(e.message, 'err'); }
  }, true]);
  const mine = ((m.reacts || []).find((x) => x.mine) || {}).e;
  const quick = items.filter(([ic]) => ['reply', 'star', 'copy', 'forward'].includes(ic));
  const md = openModal({ title: 'Mesaj', size: 'narrow', body: html`<div class="ch-emojis">${(CH.emojis || []).map((e) => html`<button type="button" class="ch-emo ${mine === e ? 'on' : ''}" data-e="${e}" aria-label="Tepki ${e}">${e}</button>`)}<button type="button" class="ch-emo ch-emo-more" data-more="1" aria-label="Başka emoji">${icon('plus', 'sm')}</button></div>
    <div class="ch-quick">${quick.map(([ic, l]) => html`<button type="button" data-i="${items.findIndex((x) => x[1] === l)}">${icon(ic)}<span>${l}</span></button>`)}</div>
    <div class="list">${items.map(([ic, l, , danger], i) => quick.some((q) => q[1] === l) ? '' : html`<button type="button" class="list-row ${danger ? 'tone-danger' : ''}" data-i="${i}" style="width:100%;border:0;background:none;text-align:left">${icon(ic, 'sm')}<span>${l}</span></button>`)}</div>` });
  md.el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-more]')) { md.close(); chatEmojiPick((e) => ACT['ch-react']({ dataset: { id: String(m.id), e } })); return; }
    const e = ev.target.closest('[data-e]');
    if (e) { md.close(); ACT['ch-react']({ dataset: { id: String(m.id), e: e.dataset.e } }); return; }
    const b = ev.target.closest('[data-i]'); if (!b) return; md.close(); items[+b.dataset.i][2]();
  });
};
async function chatStar(m) {
  try { await api('chat.star', { id: m.id, on: !m.star }); m.star = !m.star; chatDraw(); toast(m.star ? 'Yıldızlandı ⭐' : 'Yıldız kaldırıldı'); } catch (e) { toast(e.message, 'err'); }
}
async function chatForward(m) {
  let r;
  try { r = await api('chat.list'); } catch (e) { toast(e.message, 'err'); return; }
  const md = openModal({ title: 'Şuraya ilet', body: html`<div class="card"><div class="list">${r.items.filter((c) => c.id !== CH.id).map((c) => html`<button type="button" class="list-row" data-c="${c.id}" style="width:100%;border:0;background:none;text-align:left">${icon(c.kind === 'unit' ? 'users' : 'chat', 'sm')}<span class="grow">${c.name}</span></button>`)}</div></div>` });
  md.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-c]');
    if (!b) return;
    try { await api('chat.forward', { id: m.id, to: +b.dataset.c }); md.close(); toast('İletildi'); } catch (err) { toast(err.message, 'err'); }
  });
}

/* ---------------- Sohbet bilgisi ve grup yönetimi ---------------- */
ACT['ch-info'] = () => {
  const c = CH.chat;
  if (!c) return;
  const grp = c.kind === 'group';
  if (c.kind === 'direct' && c.other) { chatProfile(c.other.tk, c.other.uid); return; }
  const m = openModal({ title: c.name, body: html`<div class="stack">
      ${grp ? html`<div class="ch-gphoto">${c.photo ? html`<img src="${c.photo}" alt="Grup fotoğrafı">` : html`<span class="ch-ava tone-violet">${icon('chat')}</span>`}
        ${c.can_edit_info ? html`<button type="button" class="btn sm" data-act="ch-photo">${icon('camera', 'sm')}<span>Fotoğraf</span></button><input type="file" hidden accept="image/*" id="chPhotoF">` : ''}</div>` : ''}
      ${c.descr && !c.can_edit_info ? html`<p class="small">${c.descr}</p>` : ''}
      ${grp && c.can_edit_info ? html`<div class="stack" style="gap:8px"><div class="field"><label>Grup adı</label><input class="input" id="chName" value="${c.name}" maxlength="80"></div>
        <div class="field"><label>Açıklama</label><textarea class="textarea" id="chDescr" maxlength="500">${c.descr || ''}</textarea></div>
        ${c.admin ? html`<label class="switch"><input type="checkbox" id="chOnly" ${c.only_admins ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Yalnız yöneticiler mesaj göndersin</b><span>Duyuru grubu gibi: üyeler okur, yanıt yazamaz.</span></span></label>` : ''}
        <div><button class="btn sm primary" data-act="ch-save">Kaydet</button></div></div>` : ''}
      ${chatGroupAdminHtml(c)}
      ${c.kind === 'unit' && c.admin ? html`<label class="switch"><input type="checkbox" id="chOnly" ${c.only_admins ? raw('checked') : ''} data-act="ch-only-unit"><span class="track"></span><span class="s-text"><b>Yalnız yetkililer yazsın</b><span>Birim grubunu duyuru kanalı gibi kullanmak için.</span></span></label>` : ''}
      <label class="switch"><input type="checkbox" id="chMute" ${c.muted ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Sessize al</b><span>Bu sohbet için bildirim gelmez (adınız @ ile geçerse yine bildirilir).</span></span></label>
      ${c.admin || c.kind === 'direct' ? html`<div class="field"><label>Mesajları sakla</label><select class="select" id="chRet">${[[0, 'Süresiz'], [1, '24 saat'], [7, '7 gün'], [30, '30 gün'], [90, '90 gün'], [180, '6 ay'], [365, '1 yıl'], [730, '2 yıl']].map(([d, l]) => html`<option value="${d}" ${c.retention === d ? raw('selected') : ''}>${l}</option>`)}</select>
        <p class="hint">Süresi geçen mesajlar ve dosyaları her gün kendiliğinden silinir (KVKK: gereğinden uzun saklamayın).</p></div>` : ''}
      ${grp && c.admin ? html`<div class="field"><label>Davet bağlantısı</label><div id="chInv"></div>
        <p class="hint">Hastanenizdeki biri bu bağlantıyla gruba katılabilir. Yalnız güvendiğiniz kişilerle paylaşın; işiniz bitince kapatın.</p></div>` : ''}
      ${c.kind !== 'direct' ? html`<div class="row" style="justify-content:space-between"><div class="sec-title" style="margin:0">${CH.members.length} kişi</div>${grp && c.can_add ? html`<button class="btn sm" data-act="ch-add">${icon('plus', 'sm')}<span>Üye ekle</span></button>` : ''}</div>
        <div class="card"><div class="list ch-members">${CH.members.map((p) => { const self = p.uid === S.me.id && !p.unit; return html`<div class="list-row">${avatar(p.name, 'sm')}<button type="button" class="grow ch-headbtn" style="min-width:0" ${self ? raw('disabled') : html`data-act="ch-profile" data-tk="${p.tk}" data-uid="${+p.uid}"`}><div class="lr-t ellipsis">${p.name}${self ? ' (siz)' : ''}${p.unit ? html` <span class="tiny faint">· ${p.unit}</span>` : ''}</div></button>
          ${p.role === 'admin' ? html`<span class="badge brand">yönetici</span>` : ''}
          ${(c.bans || []).some((b) => b.kind === 'mute' && b.tk === p.tk && b.uid === p.uid) ? html`<span class="badge warn" title="Yazması kısıtlı">${icon('lock', 'sm')}</span>` : ''}
          ${c.admin && !self ? html`<button class="btn sm icon ghost" data-act="ch-mmenu" data-tk="${p.tk}" data-uid="${p.uid}" aria-label="Üye işlemleri">${icon('more', 'sm')}</button>` : ''}
          ${grp && self && p.role === 'admin' ? html`<button class="btn sm ghost" data-act="ch-mmenu-self" data-tk="${p.tk}" data-uid="${p.uid}">Yöneticilikten ayrıl</button>` : ''}</div>`; })}</div></div>` : ''}
      ${c.admin && (c.bans || []).some((b) => b.kind === 'ban') ? html`<div class="sec-title" style="margin:0">Gruptan engellenenler</div><div class="card"><div class="list">${c.bans.filter((b) => b.kind === 'ban').map((b) => html`<div class="list-row">${avatar(b.name, 'sm')}<div class="grow"><div class="lr-t">${b.name}</div><div class="lr-s">${b.by} · ${fmtRel(b.at)}</div></div><button class="btn sm" data-act="ch-unban" data-tk="${b.tk}" data-uid="${b.uid}">Engeli kaldır</button></div>`)}</div></div>` : ''}
      ${grp ? html`<div><button class="btn sm ghost danger" data-act="ch-leave">${icon('logout', 'sm')}<span>Gruptan çık</span></button></div>` : ''}</div>` });
  chatGroupAdminMount(m, c);
  $('#chMute', m.el).addEventListener('change', async (e) => { try { await api('chat.mute', { id: c.id, muted: e.target.checked }); c.muted = e.target.checked; toast(c.muted ? 'Sessize alındı' : 'Bildirimler açık'); } catch (err) { toast(err.message, 'err'); } });
  const ret = $('#chRet', m.el);
  if (ret) ret.addEventListener('change', async () => { try { await api('chat.update', { id: c.id, retention: +ret.value }); c.retention = +ret.value; toast('Saklama süresi kaydedildi'); } catch (err) { toast(err.message, 'err'); } });
  const inv = $('#chInv', m.el);
  const drawInv = () => {
    if (!inv) return;
    const link = c.invite ? appBaseUrl() + '#/mesaj/katil/' + c.invite.token : '';
    setHTML(inv, c.invite ? html`<div class="row" style="gap:6px"><input class="input grow" readonly value="${link}" id="chInvLink"><button type="button" class="btn sm" data-iv="copy">${icon('copy', 'sm')}<span>Kopyala</span></button><button type="button" class="btn sm ghost danger" data-iv="revoke">Kapat</button></div><div class="tiny faint">Geçerlilik: ${fmtDate(c.invite.expires)} ${c.invite.expires.slice(11, 16)}</div>`
      : html`<div class="row" style="gap:6px"><select class="select" id="chInvDays" style="width:auto"><option value="1">1 gün</option><option value="7" selected>7 gün</option><option value="30">30 gün</option></select><button type="button" class="btn sm" data-iv="create">${icon('link', 'sm')}<span>Bağlantı oluştur</span></button></div>`);
  };
  drawInv();
  if (inv) inv.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-iv]');
    if (!b) return;
    try {
      if (b.dataset.iv === 'copy') { toast((await copyText($('#chInvLink', m.el).value)) ? 'Bağlantı kopyalandı' : 'Kopyalanamadı'); return; }
      const r = await api('chat.invite', { id: c.id, op: b.dataset.iv, days: b.dataset.iv === 'create' ? +$('#chInvDays', m.el).value : undefined });
      c.invite = r.invite; drawInv();
    } catch (err) { toast(err.message, 'err'); }
  });
  const unitOnly = $('[data-act=ch-only-unit]', m.el);
  if (unitOnly) unitOnly.addEventListener('change', async (e) => { try { await api('chat.update', { id: c.id, only_admins: e.target.checked }); c.only_admins = e.target.checked; toast('Kaydedildi'); } catch (err) { toast(err.message, 'err'); } });
};
ACT['ch-save'] = (el) => busy(el, async () => {
  try {
    const body = { id: CH.id, name: $('#chName').value.trim(), descr: $('#chDescr').value.trim() };
    if ($('#chOnly')) body.only_admins = $('#chOnly').checked;
    await api('chat.update', body);
    while (modalStack.length) modalStack[modalStack.length - 1].close();
    toast('Kaydedildi'); route();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['ch-mmenu'] = (el) => {
  const p = CH.members.find((x) => x.tk === el.dataset.tk && x.uid === +el.dataset.uid);
  if (!p) return;
  const op = async (o) => { try { await api('chat.members', { id: CH.id, op: o, tk: p.tk, uid: p.uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Kaydedildi'); route(); } catch (e) { toast(e.message, 'err'); } };
  const grp = CH.chat.kind === 'group';
  const restricted = (CH.chat.bans || []).some((b) => b.kind === 'mute' && b.tk === p.tk && b.uid === p.uid);
  const row = (o2, ic, l, danger) => html`<button type="button" class="list-row ${danger ? 'tone-danger' : ''}" data-o="${o2}" style="width:100%;border:0;background:none;text-align:left">${icon(ic, 'sm')}<span>${l}</span></button>`;
  const md = openModal({ title: p.name, size: 'narrow', body: html`<div class="list">
    ${row('profile', 'user', 'Profili gör / mesaj gönder / ara')}
    ${grp ? row(p.role === 'admin' ? 'member' : 'admin', 'shield', p.role === 'admin' ? 'Yöneticilikten al' : 'Grup yöneticisi yap') : ''}
    ${p.role !== 'admin' ? row(restricted ? 'unrestrict' : 'restrict', 'lock', restricted ? 'Yazma kısıtlamasını kaldır' : 'Yazmasını kısıtla (yalnız okusun)') : ''}
    ${grp ? row('remove', 'x', 'Gruptan çıkar', true) : ''}
    ${grp ? row('ban', 'ban', 'Gruptan çıkar ve engelle', true) : ''}</div>` });
  md.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-o]'); if (!b) return;
    md.close();
    if (b.dataset.o === 'profile') { chatProfile(p.tk, p.uid); return; }
    if (b.dataset.o === 'ban' && !(await confirmDialog({ title: p.name + ' engellensin mi?', text: 'Gruptan çıkarılır; davet bağlantısıyla da tekrar katılamaz. Grup bilgisinden engeli kaldırabilirsiniz.', ok: 'Çıkar ve engelle', danger: true }))) return;
    op(b.dataset.o);
  });
};
ACT['ch-unban'] = async (el) => {
  try { await api('chat.members', { id: CH.id, op: 'unban', tk: el.dataset.tk, uid: +el.dataset.uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Engel kaldırıldı'); route(); } catch (e) { toast(e.message, 'err'); }
};
ACT['ch-mmenu-self'] = async (el) => {
  if (!(await confirmDialog({ title: 'Yöneticilikten ayrılınsın mı?', text: 'Grupta üye olarak kalırsınız.', ok: 'Ayrıl' }))) return;
  try { await api('chat.members', { id: CH.id, op: 'member', tk: el.dataset.tk, uid: +el.dataset.uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Artık yönetici değilsiniz'); route(); } catch (e) { toast(e.message, 'err'); }
};
ACT['ch-leave'] = async () => {
  if (!(await confirmDialog({ title: 'Gruptan çıkılsın mı?', text: 'Grubun mesajlarını artık göremezsiniz.', ok: 'Çık', danger: true }))) return;
  try { await api('chat.leave', { id: CH.id }); while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Gruptan çıktınız'); location.hash = '#/mesaj'; } catch (e) { toast(e.message, 'err'); }
};
ACT['ch-add'] = async () => {
  const exist = new Set(CH.members.map((p) => p.tk + ':' + p.uid));
  chatPickPeople('Üye ekle', (p) => !exist.has(p.tk + ':' + p.uid), async (sel) => {
    const r = await api('chat.members', { id: CH.id, op: 'add', members: sel });
    while (modalStack.length) modalStack[modalStack.length - 1].close();
    toast(r.skipped && r.skipped.length ? `${r.added} kişi eklendi · ${r.skipped.join(', ')} gizlilik ayarı nedeniyle eklenemedi (davet bağlantısı gönderin)` : 'Eklendi'); route();
  });
};

/* ---------------- Yeni sohbet / grup ---------------- */
async function chatPeople() {
  if (!CH.people) CH.people = (await api('chat.people')).people;
  return CH.people;
}
async function chatPickPeople(title, filter, done, extra = '') {
  let people;
  try { people = (await chatPeople()).filter(filter); } catch (e) { toast(e.message, 'err'); return; }
  const m = openModal({ title, size: 'wide', body: html`<div class="stack">${raw(extra)}
      <div class="search">${icon('search')}<input class="input" type="search" id="chPq" placeholder="Kişi ara"></div>
      <div class="card"><div class="list ch-pick">${people.map((p) => html`<label class="list-row" data-k="${avKey(p.name + ' ' + p.unit)}"><input type="checkbox" value="${p.tk}:${p.uid}">${avatar(p.name, 'sm')}<div class="grow">${p.name}${p.unit ? html` <span class="tiny faint">· ${p.unit}</span>` : ''}</div></label>`)}</div></div>
      ${people.some((p) => p.unit) ? html`<p class="tiny faint">Diğer birimlerden yalnız yönetici/sorumlular ve aynı grupta olduğunuz kişiler listelenir.</p>` : ''}
      <div class="form-error hidden" data-err></div></div>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="chPickGo">Tamam</button>` });
  $('#chPq', m.el).addEventListener('input', (e) => { const q = avKey(e.target.value); $$('.ch-pick [data-k]', m.el).forEach((r) => r.classList.toggle('hidden', !!q && !r.dataset.k.includes(q))); });
  $('#chPickGo', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const sel = $$('.ch-pick input:checked', m.el).map((x) => { const [tk, uid] = x.value.split(':'); return { tk, uid: +uid }; });
    try { await done(sel, m); } catch (err) { showFormError($('.stack', m.el), err.message); }
  }));
  return m;
}
ACT['ch-new'] = async () => {
  let people;
  try { people = await chatPeople(); } catch (e) { toast(e.message, 'err'); return; }
  const m = openModal({ title: 'Yeni sohbet', body: html`<div class="stack">
      ${CH.canGroup ? html`<button class="btn" data-act="ch-newgroup">${icon('users', 'sm')}<span>Yeni grup kur</span></button>` : ''}
      <div class="search">${icon('search')}<input class="input" type="search" id="chNq" placeholder="Kişi ara"></div>
      <div class="card"><div class="list">${people.map((p) => html`<button type="button" class="list-row" data-act="ch-dm" data-tk="${p.tk}" data-uid="${p.uid}" data-k="${avKey(p.name + ' ' + p.unit)}" style="width:100%;border:0;background:none;text-align:left">${avatar(p.name, 'sm')}<div class="grow">${p.name}${p.unit ? html` <span class="tiny faint">· ${p.unit}</span>` : ''}</div></button>`)}</div></div></div>` });
  $('#chNq', m.el).addEventListener('input', (e) => { const q = avKey(e.target.value); $$('[data-act=ch-dm]', m.el).forEach((r) => r.classList.toggle('hidden', !!q && !r.dataset.k.includes(q))); });
};
ACT['ch-dm'] = async (el) => {
  try { const r = await api('chat.direct', { tk: el.dataset.tk, uid: +el.dataset.uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); location.hash = '#/mesaj/' + r.id; } catch (e) { toast(e.message, 'err'); }
};
ACT['ch-newgroup'] = () => {
  while (modalStack.length) modalStack[modalStack.length - 1].close();
  chatPickPeople('Yeni grup', () => true, async (sel, m) => {
    const name = $('#chGname', m.el).value.trim();
    const r = await api('chat.create', { name, descr: $('#chGdescr', m.el).value.trim(), members: sel });
    m.close(); toast(r.skipped && r.skipped.length ? `Grup kuruldu · ${r.skipped.join(', ')} gizlilik ayarı nedeniyle eklenemedi (davet bağlantısı gönderin)` : 'Grup kuruldu'); location.hash = '#/mesaj/' + r.id;
  }, fmtVal(html`<div class="field"><label>Grup adı</label><input class="input" id="chGname" maxlength="80" placeholder="ör. Sorumlu hemşireler"></div>
    <div class="field"><label>Açıklama <span class="faint">(isteğe bağlı)</span></label><input class="input" id="chGdescr" maxlength="500"></div>`));
};
