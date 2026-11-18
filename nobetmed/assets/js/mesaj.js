/* dupcii — mesajlaşma (4.3): birim grubu, özel gruplar, birebir sohbet.
   Sohbet açıkken 3 sn'de bir hafif yoklama (paylaşımlı barındırmada anlık bağlantı yok); arka planda telefon bildirimi. */
'use strict';

Object.assign(ICON_PATHS, {
  reply: 'M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  bellOff: 'M13.73 21a2 2 0 0 1-3.46 0 M18.63 13A17.89 17.89 0 0 1 18 8 M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14 M18 8a6 6 0 0 0-9.33-5 M1 1l22 22',
  checks: 'M2 12.5 6 16.5 14 8.5 M10 15.5l1 1 8-8',
});
NM_EXT.routes.mesaj = (view, r) => (r[1] && /^\d+$/.test(r[1]) ? chatOpen(view, +r[1]) : chatList(view));
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
setInterval(chatUnreadSync, 20000);
document.addEventListener('visibilitychange', chatUnreadSync);
window.addEventListener('hashchange', () => setTimeout(() => { chatBadge(); if (!location.hash.startsWith('#/mesaj')) chatStop(); }, 0));
setTimeout(() => { chatBadge(); chatUnreadSync(); }, 1500);

/* ---------------- Sohbet listesi ---------------- */
async function chatList(view) {
  chatStop();
  setHTML(view, html`<div class="page-head"><div><h1>Mesajlar</h1><p>Birim grubu, gruplar ve birebir sohbetler</p></div>
    <button class="btn primary" data-act="ch-new">${icon('plus', 'sm')}<span>Yeni sohbet</span></button></div>
    <div id="chList"><div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>`);
  let r;
  try { r = await api('chat.list'); } catch (e) { setHTML($('#chList'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  CH.canGroup = r.can_group;
  const box = $('#chList');
  if (!box) return;
  S.chatUnread = r.items.filter((x) => !x.muted).reduce((a, x) => a + x.unread, 0); chatBadge();
  setHTML(box, html`<div class="card"><div class="list">${r.items.map((c) => html`<a class="list-row ch-row ${c.unread ? 'unread' : ''}" href="#/mesaj/${c.id}">
      <span class="ch-ava tone-${c.kind === 'unit' ? 'teal' : c.kind === 'group' ? 'violet' : 'sky'}">${c.kind === 'direct' ? avatar(c.name, 'sm') : icon(c.kind === 'unit' ? 'users' : 'chat', 'sm')}</span>
      <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${c.name}${c.kind === 'unit' ? html` <span class="badge">birim grubu</span>` : ''}${c.sub ? html` <span class="tiny faint">· ${c.sub}</span>` : ''}</div>
        <div class="lr-s ellipsis">${c.last || 'Henüz mesaj yok'}</div></div>
      <div class="ch-meta"><span class="tiny faint">${c.last_at ? chTime(c.last_at) : ''}</span>${c.muted ? icon('bellOff', 'sm') : ''}${c.unread ? html`<span class="count">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</div></a>`)}</div></div>
    <p class="tiny faint" style="margin-top:10px">${icon('lock', 'sm')} Mesajlar yalnız hastanenizin sunucusunda tutulur. Hasta adı, T.C. kimlik numarası gibi hasta bilgisi paylaşmayın.</p>`);
}
function chTime(at) {
  const d = parseDT(at);
  const t = ymd(new Date());
  return at.slice(0, 10) === t ? at.slice(11, 16) : `${d.getDate()} ${TR_MONTHS[d.getMonth()].slice(0, 3)}`;
}

/* ---------------- Sohbet ekranı ---------------- */
function chatStop() { if (CH.timer) { clearInterval(CH.timer); CH.timer = null; } }
async function chatOpen(view, id) {
  chatStop();
  CH.id = id; CH.msgs = []; CH.last = 0; CH.reply = null; CH.read = null;
  setHTML(view, html`<div class="ch-view" id="chatView">
    <div class="ch-head"><a class="btn ghost icon" href="#/mesaj" aria-label="Sohbetler">${icon('chevL')}</a>
      <div class="grow" style="min-width:0"><div class="ch-title ellipsis" id="chTitle">…</div><div class="tiny faint ellipsis" id="chSub"></div></div>
      <button class="btn ghost icon" data-act="ch-info" aria-label="Sohbet bilgisi">${icon('info')}</button></div>
    <div class="ch-scroll" id="chScroll"><div id="chMore"></div><div id="chMsgs"></div></div>
    <div class="ch-compose" id="chCompose"></div></div>`);
  let r;
  try { r = await api('chat.open', { id }); } catch (e) { setHTML($('#chMsgs'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (CH.id !== id) return;
  CH.chat = r.chat; CH.members = r.members;
  $('#chTitle').textContent = r.chat.name;
  $('#chSub').textContent = r.chat.kind === 'direct' ? (r.chat.sub || 'Birebir sohbet') : `${r.members.length} kişi${r.chat.only_admins ? ' · yalnız yöneticiler yazar' : ''}`;
  chatAdd(r.msgs, true);
  setHTML($('#chMore'), r.more ? html`<button class="btn sm ghost" data-act="ch-older" style="margin:6px auto;display:flex">Önceki mesajlar</button>` : '');
  chatComposer();
  chatScrollEnd(true);
  chatUnreadSync();
  CH.timer = setInterval(chatPoll, 3000);
}
function chatComposer() {
  const box = $('#chCompose');
  if (!box) return;
  if (!CH.chat.can_send) { setHTML(box, html`<div class="tiny faint" style="text-align:center;padding:10px">${icon('lock', 'sm')} Bu grupta yalnız yöneticiler mesaj gönderebilir.</div>`); return; }
  setHTML(box, html`<div id="chReply"></div>
    <div class="ch-bar"><label class="btn ghost icon" aria-label="Dosya veya fotoğraf ekle" title="Dosya / fotoğraf">${icon('paperclip')}<input type="file" hidden id="chFile"></label>
      <textarea class="textarea ch-input" id="chInput" rows="1" maxlength="4000" placeholder="Mesaj yazın… (hasta bilgisi paylaşmayın)" aria-label="Mesaj"></textarea>
      <button class="btn primary icon" data-act="ch-send" aria-label="Gönder">${icon('send')}</button></div>`);
  const ta = $('#chInput');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 900) { e.preventDefault(); ACT['ch-send'](); } });
  $('#chFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) chatSendFile(f); });
}
function chatScrollEnd(force) {
  const s = $('#chScroll');
  if (!s) return;
  if (force || s.scrollHeight - s.scrollTop - s.clientHeight < 160) s.scrollTop = s.scrollHeight;
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
  CH.msgs.forEach((m, i) => {
    const d = m.at.slice(0, 10);
    if (d !== day) { day = d; parts.push(html`<div class="ch-day"><span>${dateLabel(d)}</span></div>`); }
    if (m.kind === 'system') { parts.push(html`<div class="ch-sys">${m.body}</div>`); return; }
    const prev = CH.msgs[i - 1];
    const cont = prev && prev.kind !== 'system' && prev.tk === m.tk && prev.uid === m.uid && prev.at.slice(0, 10) === d;
    parts.push(html`<div class="ch-msg ${m.mine ? 'mine' : ''} ${cont ? 'cont' : ''}" data-id="${m.id}">
      <div class="ch-bub">${group && !m.mine && !cont ? html`<div class="ch-from">${m.name}</div>` : ''}
        ${m.reply_ref ? html`<div class="ch-quote"><b>${m.reply_ref.name}</b><span>${m.reply_ref.body}</span></div>` : ''}
        ${m.deleted ? html`<div class="ch-del">${icon('x', 'sm')} Bu mesaj silindi</div>` : html`
          ${m.file ? (m.kind === 'image' ? html`<button type="button" class="ch-img" data-act="ch-file" data-id="${m.id}"><img src="${m.file.url}" alt="${m.file.name}" loading="lazy"></button>`
            : html`<button type="button" class="ch-filechip" data-act="ch-file" data-id="${m.id}">${icon('file', 'sm')}<span class="ellipsis">${m.file.name}</span><span class="tiny faint">${chSize(m.file.size)}</span></button>`) : ''}
          ${m.body ? html`<div class="ch-text">${m.body}</div>` : ''}`}
        <div class="ch-time">${m.at.slice(11, 16)}${m === lastMine && CH.read && CH.read.id === m.id && CH.read.n ? html` <span class="ch-read" title="Okundu">${icon('checks', 'sm')}${group ? ' ' + CH.read.n : ''}</span>` : ''}</div>
      </div>${m.deleted ? '' : html`<button type="button" class="ch-act" data-act="ch-menu" data-id="${m.id}" aria-label="Mesaj işlemleri">${icon('more', 'sm')}</button>`}</div>`);
  });
  setHTML(box, parts.length ? html`${parts}` : html`<div class="ch-empty small muted">Henüz mesaj yok. İlk mesajı siz yazın.</div>`);
}
function chSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
async function chatPoll() {
  if (!$('#chatView') || !location.hash.startsWith('#/mesaj/' + CH.id)) { chatStop(); return; }
  if (document.visibilityState !== 'visible' || CH.busy) return;
  CH.busy = true;
  try {
    const r = await api('chat.poll', { id: CH.id, after: CH.last, seen: true });
    let changed = false;
    if (r.deleted.length) { CH.msgs.forEach((m) => { if (r.deleted.includes(m.id) && !m.deleted) { m.deleted = true; m.body = ''; delete m.file; changed = true; } }); }
    const readChanged = !CH.read || CH.read.id !== r.read.id || CH.read.n !== r.read.n;
    CH.read = r.read;
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
async function chatSendFile(f0) {
  if (f0.size > 25 * 1048576) { toast('Dosya en fazla 25 MB olabilir', 'err'); return; }
  const tip = $('#chReply');
  const f = await chatShrink(f0);
  const body = ($('#chInput') || {}).value ? $('#chInput').value.trim() : '';
  try {
    if (tip) setHTML(tip, html`<div class="ch-up tiny">${icon('upload', 'sm')} ${f.name} gönderiliyor… <span id="chUpP">%0</span></div>`);
    const a = await uploadFile(f, (p) => { const el = $('#chUpP'); if (el) el.textContent = '%' + Math.round(p * 100); });
    const r = await api('chat.send', { id: CH.id, body, att_id: a.id, reply_to: CH.reply ? CH.reply.id : null });
    if ($('#chInput')) { $('#chInput').value = ''; }
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
ACT['ch-file'] = (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id);
  if (!m || !m.file) return;
  const md = openModal({ title: m.file.name, size: 'wide', body: html`<div class="ch-prev" style="height:min(75vh,760px);display:flex;flex-direction:column"></div>`,
    foot: html`<a class="btn" href="${m.file.url}&dl=1">${icon('download', 'sm')}<span>İndir</span></a><button class="btn primary" data-close>Kapat</button>` });
  mountPreview($('.ch-prev', md.el), m.file);
};
ACT['ch-menu'] = (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id);
  if (!m) return;
  const items = [];
  if (CH.chat.can_send) items.push(['reply', 'Yanıtla', () => chatSetReply(m)]);
  if (m.body) items.push(['copy', 'Metni kopyala', async () => toast((await copyText(m.body)) ? 'Kopyalandı' : 'Kopyalanamadı')]);
  if (m.mine || CH.chat.admin) items.push(['eye', 'Kimler okudu', async () => {
    try {
      const r = await api('chat.readers', { id: m.id });
      openModal({ title: 'Okuyanlar', size: 'narrow', body: html`${r.read.length ? html`<div class="list">${r.read.map((p) => html`<div class="list-row">${avatar(p.name, 'sm')}<div class="grow">${p.name}${p.unit ? html` <span class="tiny faint">· ${p.unit}</span>` : ''}</div></div>`)}</div>` : html`<p class="small muted">Henüz kimse okumadı.</p>`}` });
    } catch (e) { toast(e.message, 'err'); }
  }]);
  if (m.mine || CH.chat.admin) items.push(['trash', 'Herkesten sil', async () => {
    if (!(await confirmDialog({ title: 'Mesaj silinsin mi?', text: 'Mesaj ve eki herkesten silinir; yerinde “Bu mesaj silindi” yazar.', ok: 'Sil', danger: true }))) return;
    try { await api('chat.delete', { id: m.id }); m.deleted = true; m.body = ''; delete m.file; chatDraw(); } catch (e) { toast(e.message, 'err'); }
  }, true]);
  const md = openModal({ title: 'Mesaj', size: 'narrow', body: html`<div class="list">${items.map(([ic, l, , danger], i) => html`<button type="button" class="list-row ${danger ? 'tone-danger' : ''}" data-i="${i}" style="width:100%;border:0;background:none;text-align:left">${icon(ic, 'sm')}<span>${l}</span></button>`)}</div>` });
  md.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (!b) return; md.close(); items[+b.dataset.i][2](); });
};

/* ---------------- Sohbet bilgisi ve grup yönetimi ---------------- */
ACT['ch-info'] = () => {
  const c = CH.chat;
  if (!c) return;
  const grp = c.kind === 'group';
  const m = openModal({ title: c.kind === 'direct' ? c.name : c.name, body: html`<div class="stack">
      ${c.descr ? html`<p class="small">${c.descr}</p>` : ''}
      ${grp && c.admin ? html`<div class="stack" style="gap:8px"><div class="field"><label>Grup adı</label><input class="input" id="chName" value="${c.name}" maxlength="80"></div>
        <div class="field"><label>Açıklama</label><textarea class="textarea" id="chDescr" maxlength="500">${c.descr || ''}</textarea></div>
        <label class="switch"><input type="checkbox" id="chOnly" ${c.only_admins ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Yalnız yöneticiler yazsın</b><span>Duyuru grubu gibi: üyeler okur, yanıt yazamaz.</span></span></label>
        <div><button class="btn sm primary" data-act="ch-save">Kaydet</button></div></div>` : ''}
      ${c.kind === 'unit' && c.admin ? html`<label class="switch"><input type="checkbox" id="chOnly" ${c.only_admins ? raw('checked') : ''} data-act="ch-only-unit"><span class="track"></span><span class="s-text"><b>Yalnız yetkililer yazsın</b><span>Birim grubunu duyuru kanalı gibi kullanmak için.</span></span></label>` : ''}
      <label class="switch"><input type="checkbox" id="chMute" ${c.muted ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Sessize al</b><span>Bu sohbet için bildirim gelmez.</span></span></label>
      ${c.kind !== 'direct' ? html`<div class="row" style="justify-content:space-between"><div class="sec-title" style="margin:0">${CH.members.length} kişi</div>${grp && c.admin ? html`<button class="btn sm" data-act="ch-add">${icon('plus', 'sm')}<span>Üye ekle</span></button>` : ''}</div>
        <div class="card"><div class="list ch-members">${CH.members.map((p) => html`<div class="list-row">${avatar(p.name, 'sm')}<div class="grow" style="min-width:0"><div class="lr-t ellipsis">${p.name}${p.unit ? html` <span class="tiny faint">· ${p.unit}</span>` : ''}</div></div>
          ${p.role === 'admin' ? html`<span class="badge brand">yönetici</span>` : ''}
          ${grp && c.admin ? html`<button class="btn sm icon ghost" data-act="ch-mmenu" data-tk="${p.tk}" data-uid="${p.uid}" aria-label="Üye işlemleri">${icon('more', 'sm')}</button>` : ''}</div>`)}</div></div>` : ''}
      ${grp ? html`<div><button class="btn sm ghost danger" data-act="ch-leave">${icon('logout', 'sm')}<span>Gruptan çık</span></button></div>` : ''}</div>` });
  $('#chMute', m.el).addEventListener('change', async (e) => { try { await api('chat.mute', { id: c.id, muted: e.target.checked }); c.muted = e.target.checked; toast(c.muted ? 'Sessize alındı' : 'Bildirimler açık'); } catch (err) { toast(err.message, 'err'); } });
  const unitOnly = $('[data-act=ch-only-unit]', m.el);
  if (unitOnly) unitOnly.addEventListener('change', async (e) => { try { await api('chat.update', { id: c.id, only_admins: e.target.checked }); c.only_admins = e.target.checked; toast('Kaydedildi'); } catch (err) { toast(err.message, 'err'); } });
};
ACT['ch-save'] = (el) => busy(el, async () => {
  try {
    await api('chat.update', { id: CH.id, name: $('#chName').value.trim(), descr: $('#chDescr').value.trim(), only_admins: $('#chOnly').checked });
    while (modalStack.length) modalStack[modalStack.length - 1].close();
    toast('Kaydedildi'); route();
  } catch (e) { toast(e.message, 'err'); }
});
ACT['ch-mmenu'] = (el) => {
  const p = CH.members.find((x) => x.tk === el.dataset.tk && x.uid === +el.dataset.uid);
  if (!p) return;
  const op = async (o) => { try { await api('chat.members', { id: CH.id, op: o, tk: p.tk, uid: p.uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Kaydedildi'); route(); } catch (e) { toast(e.message, 'err'); } };
  const md = openModal({ title: p.name, size: 'narrow', body: html`<div class="list">
    <button type="button" class="list-row" data-o="${p.role === 'admin' ? 'member' : 'admin'}" style="width:100%;border:0;background:none;text-align:left">${icon('shield', 'sm')}<span>${p.role === 'admin' ? 'Yöneticilikten al' : 'Grup yöneticisi yap'}</span></button>
    <button type="button" class="list-row tone-danger" data-o="remove" style="width:100%;border:0;background:none;text-align:left">${icon('x', 'sm')}<span>Gruptan çıkar</span></button></div>` });
  md.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-o]'); if (b) { md.close(); op(b.dataset.o); } });
};
ACT['ch-leave'] = async () => {
  if (!(await confirmDialog({ title: 'Gruptan çıkılsın mı?', text: 'Grubun mesajlarını artık göremezsiniz.', ok: 'Çık', danger: true }))) return;
  try { await api('chat.leave', { id: CH.id }); while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Gruptan çıktınız'); location.hash = '#/mesaj'; } catch (e) { toast(e.message, 'err'); }
};
ACT['ch-add'] = async () => {
  const exist = new Set(CH.members.map((p) => p.tk + ':' + p.uid));
  chatPickPeople('Üye ekle', (p) => !exist.has(p.tk + ':' + p.uid), async (sel) => {
    await api('chat.members', { id: CH.id, op: 'add', members: sel });
    while (modalStack.length) modalStack[modalStack.length - 1].close(); toast('Eklendi'); route();
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
    m.close(); toast('Grup kuruldu'); location.hash = '#/mesaj/' + r.id;
  }, fmtVal(html`<div class="field"><label>Grup adı</label><input class="input" id="chGname" maxlength="80" placeholder="ör. Sorumlu hemşireler"></div>
    <div class="field"><label>Açıklama <span class="faint">(isteğe bağlı)</span></label><input class="input" id="chGdescr" maxlength="500"></div>`));
};
