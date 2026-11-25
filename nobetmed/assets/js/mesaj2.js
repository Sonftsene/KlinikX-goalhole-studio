/* dupcii — mesajlaşma ayarları (4.6): gizlilik, sohbet ve grup ayarları, profil, arama, medya, yıldızlı, dışa aktar */
'use strict';

Object.assign(ICON_PATHS, {
  archive: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  search2: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M4.93 4.93l14.14 14.14',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
});

/* ---------------- Kişisel görünüm tercihleri (bu cihazda) ---------------- */
function chatUi() {
  try { return Object.assign({ font: 'm', bg: 'def', enter: true, autoimg: true }, JSON.parse(localStorage.getItem('nm-chat-ui') || '{}')); } catch (e) { return { font: 'm', bg: 'def', enter: true, autoimg: true }; }
}
function chatUiSave(o) { try { localStorage.setItem('nm-chat-ui', JSON.stringify(Object.assign(chatUi(), o))); } catch (e) { /* */ } }

/* ---------------- Sohbet ayarları sayfası ---------------- */
const VIS_LBL = { all: 'Herkes', contacts: 'Kişilerim', none: 'Hiç kimse' };
async function chatSettingsPage(view) {
  chatStop();
  setHTML(view, html`<div class="page-head"><div><a class="small" href="#/mesaj">${icon('chevL', 'sm')} Mesajlar</a><h1>Mesaj ayarları</h1><p>Gizlilik, engellenenler ve sohbet görünümü. “Kişilerim”: biriminiz ve ortak grup/sohbetiniz olan kişiler.</p></div></div><div id="chSet"><div class="card card-pad"><div class="skel" style="height:16px"></div></div></div>`);
  let r;
  try { r = await api('chat.prefs.get'); } catch (e) { setHTML($('#chSet'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  const p = r.prefs;
  const u = chatUi();
  const sel = (k, opts, v) => html`<select class="select" data-change="chs" data-k="${k}">${opts.map(([val, l]) => html`<option value="${val}" ${String(v) === String(val) ? raw('selected') : ''}>${l}</option>`)}</select>`;
  const vis = [['all', 'Herkes'], ['contacts', 'Kişilerim'], ['none', 'Hiç kimse']];
  setHTML($('#chSet'), html`<div class="stack">
    <div class="card card-pad stack"><h3 style="font-size:15px">${icon('lock', 'sm')} Gizlilik</h3>
      <div class="field"><label>Son görülme ve çevrimiçi</label>${sel('seen_vis', vis, p.seen_vis)}<p class="hint">“Hiç kimse” seçerseniz başkalarının son görülmesini de göremezsiniz.</p></div>
      <div class="field"><label>Hakkımda</label><input class="input" data-input="chs-about" maxlength="140" value="${p.about}" placeholder="ör. Yoğun bakım sorumlu hemşiresi · Gece nöbetindeyim"></div>
      <div class="field"><label>Hakkımda’yı kimler görsün</label>${sel('about_vis', vis, p.about_vis)}</div>
      <label class="switch"><input type="checkbox" data-change="chs-b" data-k="receipts" ${p.receipts ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Okundu bilgisi</b><span>Kapatırsanız birebir sohbetlerde ne siz başkalarının okuduğunu görürsünüz ne de onlar sizinkini. Gruplarda her zaman gösterilir.</span></span></label>
      <div class="field"><label>Beni gruplara kim ekleyebilir</label>${sel('add_groups', [['all', 'Herkes (grup kurma yetkisi olanlar)'], ['unit', 'Yalnız birimimdekiler'], ['none', 'Hiç kimse (davet bağlantısıyla katılırım)']], p.add_groups)}</div>
      <label class="switch"><input type="checkbox" data-change="chs-b" data-k="findable" ${p.findable ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Hastanedeki diğer birimler beni bulabilsin</b><span>Açıksa diğer birimlerdeki kişiler adınızı görüp size özel mesaj yazabilir. Kapalıyken yalnız biriminiz ve ortak grubunuzdakiler.</span></span></label>
      <div class="field"><label>Bana kimler yazabilir</label>${sel('dm_from', [['all', 'Beni bulabilen herkes'], ['contacts', 'Yalnız kişilerim']], p.dm_from)}</div>
      <div class="field"><label>Yeni sohbetlerde kaybolan mesajlar (varsayılan)</label>${sel('ret_default', [[0, 'Kapalı'], [1, '24 saat'], [7, '7 gün'], [90, '90 gün'], [365, '1 yıl']], p.ret_default)}<p class="hint">Kurduğunuz grup ve başlattığınız birebir sohbetlerde süresi geçen mesajlar kendiliğinden silinir.</p></div>
    </div>
    <div class="card card-pad stack"><h3 style="font-size:15px">${icon('ban', 'sm')} Engellenenler</h3>
      ${r.blocked.length ? html`<div class="list">${r.blocked.map((b) => html`<div class="list-row">${avatar(b.name, 'sm')}<div class="grow">${b.name}</div><button class="btn sm" data-act="chs-unblock" data-tk="${b.tk}" data-uid="${b.uid}">Engeli kaldır</button></div>`)}</div>`
        : html`<p class="small muted">Engellediğiniz kimse yok. Birini engellemek için birebir sohbette ⋯ → Engelle.</p>`}
      <p class="tiny faint">Engellediğiniz kişi size birebir yazamaz ve sizi gruplara ekleyemez; ortak gruplarda mesajları görünmeye devam eder.</p></div>
    <div class="card card-pad stack"><h3 style="font-size:15px">${icon('chat', 'sm')} Sohbet görünümü <span class="tiny faint">(bu cihaz)</span></h3>
      <div class="field"><label>Yazı boyutu</label><select class="select" data-change="chs-ui" data-k="font">${[['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük']].map(([v, l]) => html`<option value="${v}" ${u.font === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
      <button type="button" class="btn" data-act="ch-look">${icon('palette', 'sm')}Tema, balon biçimi ve duvar kağıdı</button>
      <label class="switch"><input type="checkbox" data-change="chs-ui" data-k="enter" ${u.enter ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Enter ile gönder</b><span>Bilgisayarda Enter mesajı gönderir; Shift+Enter yeni satır.</span></span></label>
      <label class="switch"><input type="checkbox" data-change="chs-ui" data-k="autoimg" ${u.autoimg ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Fotoğrafları otomatik göster</b><span>Kapalıysa fotoğraf dokunulunca yüklenir (mobil veri tasarrufu).</span></span></label>
    </div>
    <div class="card card-pad"><a class="list-row" href="#/mesaj/yildizli">${icon('star', 'sm')}<span class="grow">Yıldızlı mesajlar</span>${icon('chevR', 'sm')}</a></div>
  </div>`);
}
CHANGE['chs'] = async (el) => { try { await api('chat.prefs.save', { [el.dataset.k]: el.dataset.k === 'ret_default' ? +el.value : el.value }); toast('Kaydedildi'); } catch (e) { toast(e.message, 'err'); } };
CHANGE['chs-b'] = async (el) => { try { await api('chat.prefs.save', { [el.dataset.k]: el.checked }); toast('Kaydedildi'); } catch (e) { toast(e.message, 'err'); el.checked = !el.checked; } };
CHANGE['chs-about'] = debounce(async (el) => { try { await api('chat.prefs.save', { about: el.value.trim() }); toast('Hakkımda kaydedildi'); } catch (e) { toast(e.message, 'err'); } }, 900);
CHANGE['chs-ui'] = (el) => { chatUiSave({ [el.dataset.k]: el.type === 'checkbox' ? el.checked : el.value }); toast('Kaydedildi'); };
ACT['chs-unblock'] = async (el) => { try { await api('chat.block', { tk: el.dataset.tk, uid: +el.dataset.uid, on: false }); toast('Engel kaldırıldı'); route(); } catch (e) { toast(e.message, 'err'); } };

/* ---------------- Yıldızlı mesajlar ---------------- */
async function chatStarredPage(view) {
  chatStop();
  setHTML(view, html`<div class="page-head"><div><a class="small" href="#/mesaj">${icon('chevL', 'sm')} Mesajlar</a><h1>Yıldızlı mesajlar</h1></div></div><div id="chStar"></div>`);
  let r;
  try { r = await api('chat.starred'); } catch (e) { setHTML($('#chStar'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  setHTML($('#chStar'), r.items.length ? html`<div class="card"><div class="list">${r.items.map((m) => html`<a class="list-row" href="#/mesaj/${m.chat_id}">${icon('star', 'sm')}<div class="grow" style="min-width:0"><div class="lr-t ellipsis">${m.name} · <span class="faint">${m.chat}</span></div><div class="lr-s ellipsis">${m.body || (m.file ? m.file.name : '')}</div></div><span class="tiny faint">${chTime(m.at)}</span></a>`)}</div></div>`
    : html`<div class="card empty"><h3>Yıldızlı mesaj yok</h3><p class="small">Bir mesajın ⋯ menüsünden “Yıldızla” deyin; burada toplanır.</p></div>`);
}

/* ---------------- Sohbet listesi: satır işlemleri ---------------- */
function chatRowMenu(c) {
  const items = [];
  items.push([c.pinned ? 'pin' : 'pin', c.pinned ? 'Sabitlemeyi kaldır' : 'Listede üste sabitle', { op: c.pinned ? 'unpin' : 'pin' }]);
  items.push(['archive', c.archived ? 'Arşivden çıkar' : 'Arşivle', { op: c.archived ? 'unarchive' : 'archive' }]);
  items.push(['eye', c.unread || c.unread_mark ? 'Okundu olarak işaretle' : 'Okunmadı olarak işaretle', { op: c.unread || c.unread_mark ? 'read' : 'unread' }]);
  if (c.muted) items.push(['bell', 'Sessizden çıkar', { op: 'mute', dur: '' }]);
  else { items.push(['bellOff', '8 saat sessize al', { op: 'mute', dur: '8h' }]); items.push(['bellOff', '1 hafta sessize al', { op: 'mute', dur: '1w' }]); items.push(['bellOff', 'Her zaman sessiz', { op: 'mute', dur: 'always' }]); }
  items.push(['x', 'Sohbeti temizle (benim için)', { op: 'clear' }, true]);
  if (c.kind === 'direct') items.push(['trash', 'Sohbeti sil (benim için)', { op: 'delete' }, true]);
  return items;
}
async function chatStateOp(id, o, ask) {
  if (ask && !(await confirmDialog({ title: o.op === 'clear' ? 'Sohbet temizlensin mi?' : 'Sohbet silinsin mi?', text: o.op === 'clear' ? 'Mesajlar yalnız sizin görünümünüzden kalkar; diğer kişiler görmeye devam eder.' : 'Sohbet listenizden kalkar ve mesajlar sizin için temizlenir. Yeni mesaj gelirse yeniden görünür.', ok: o.op === 'clear' ? 'Temizle' : 'Sil', danger: true }))) return false;
  try { await api('chat.state', { id, ...o }); return true; } catch (e) { toast(e.message, 'err'); return false; }
}
ACT['ch-rowmenu'] = (el, ev) => {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  const c = (CH.list || []).find((x) => x.id === +el.dataset.id);
  if (!c) return;
  const items = chatRowMenu(c);
  const md = openModal({ title: c.name, size: 'narrow', body: html`<div class="list">${items.map(([ic, l, , danger], i) => html`<button type="button" class="list-row ${danger ? 'tone-danger' : ''}" data-i="${i}" style="width:100%;border:0;background:none;text-align:left">${icon(ic, 'sm')}<span>${l}</span></button>`)}</div>` });
  md.el.addEventListener('click', async (e2) => {
    const b = e2.target.closest('[data-i]'); if (!b) return;
    md.close();
    const it = items[+b.dataset.i];
    if (await chatStateOp(c.id, it[2], it[3])) { chatUnreadSync(); route(); }
  });
};

/* ---------------- Profil kartı ---------------- */
function chatPresence(p) {
  if (!p) return '';
  if (p.online) return 'çevrimiçi';
  if (p.last_seen) return 'son görülme ' + (p.last_seen.slice(0, 10) === ymd(new Date()) ? 'bugün ' + p.last_seen.slice(11, 16) : fmtRel(p.last_seen));
  return '';
}
async function chatProfile(tk, uid) {
  let r;
  try { r = await api('chat.profile', { tk, uid }); } catch (e) { toast(e.message, 'err'); return; }
  const p = r.profile;
  const m = openModal({ title: p.name, size: 'narrow', body: html`<div class="stack" style="align-items:center;text-align:center">
    ${avatar(p.name, 'xl')}<div><b style="font-size:17px">${p.name}</b>${p.title ? html`<div class="small muted">${p.title}</div>` : ''}${p.unit ? html`<div class="small muted">${p.unit}</div>` : ''}<div class="tiny faint">${chatPresence(p)}</div></div>
    ${p.about ? html`<div class="small">“${p.about}”</div>` : ''}
    ${r.profile.groups.length ? html`<div class="tiny faint">Ortak gruplar: ${r.profile.groups.map((g) => g.name).join(', ')}</div>` : ''}
    ${p.self ? '' : html`<div class="ch-pacts"><button type="button" data-pa="dm">${icon('chat')}<span>Mesaj</span></button>
      ${p.calls && !p.blocked && typeof callStart === 'function' ? html`<button type="button" data-pa="call">${icon('phone')}<span>Sesli ara</span></button><button type="button" data-pa="vcall">${icon('video')}<span>Görüntülü</span></button>` : ''}
      ${p.phone ? html`<a href="tel:${String(p.phone).replace(/[^0-9+]/g, '')}" data-pa="tel">${icon('phoneOut')}<span>Telefonu ara</span></a>` : ''}</div>`}
    ${p.phone ? html`<div class="small muted">${icon('phone', 'sm')} ${p.phone}</div>` : ''}
    <div class="row wrap" style="gap:6px;justify-content:center">
      <button class="btn sm ${p.blocked ? '' : 'ghost danger'}" data-pa="block">${icon('ban', 'sm')}<span>${p.blocked ? 'Engeli kaldır' : 'Engelle'}</span></button></div></div>` });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-pa]'); if (!b) return;
    if (b.dataset.pa === 'tel') return;
    if (b.dataset.pa === 'call' || b.dataset.pa === 'vcall') { try { const d = await api('chat.direct', { tk, uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); if (location.hash !== '#/mesaj/' + d.id) location.hash = '#/mesaj/' + d.id; callStart(d.id, b.dataset.pa === 'vcall'); } catch (e) { toast(e.message, 'err'); } return; }
    if (b.dataset.pa === 'dm') { try { const d = await api('chat.direct', { tk, uid }); while (modalStack.length) modalStack[modalStack.length - 1].close(); location.hash = '#/mesaj/' + d.id; } catch (e) { toast(e.message, 'err'); } return; }
    if (!p.blocked && !(await confirmDialog({ title: `${p.name} engellensin mi?`, text: 'Size birebir yazamaz ve sizi gruplara ekleyemez. İstediğiniz zaman Mesaj ayarları’ndan kaldırabilirsiniz.', ok: 'Engelle', danger: true }))) return;
    try { await api('chat.block', { tk, uid, on: !p.blocked }); m.close(); toast(p.blocked ? 'Engel kaldırıldı' : 'Engellendi'); if (location.hash.startsWith('#/mesaj/')) route(); } catch (e) { toast(e.message, 'err'); }
  });
}
ACT['ch-profile'] = (el) => chatProfile(el.dataset.tk, +el.dataset.uid);

/* ---------------- Sohbet menüsü (başlıktaki ⋯) ---------------- */
ACT['ch-more'] = () => {
  const c = CH.chat; if (!c) return;
  const items = [['search2', 'Sohbette ara', () => chatSearch()], ['image', 'Medya, belgeler ve bağlantılar', () => chatMedia('media')],
    ['bellOff', c.muted ? 'Sessizden çıkar' : 'Sessize al…', () => (c.muted ? chatStateOp(c.id, { op: 'mute', dur: '' }).then((ok) => ok && route()) : chatMuteAsk(c))],
    ['download', 'Sohbeti dışa aktar (.txt)', () => chatExport()], ['x', 'Sohbeti temizle (benim için)', () => chatStateOp(c.id, { op: 'clear' }, true).then((ok) => ok && route())]];
  if (c.kind === 'direct' && c.peer) items.push(['ban', c.peer.blocked ? 'Engeli kaldır' : 'Engelle', () => chatProfile(c.other.tk, c.other.uid)]);
  if (c.kind === 'direct') items.push(['trash', 'Sohbeti sil (benim için)', () => chatStateOp(c.id, { op: 'delete' }, true).then((ok) => { if (ok) location.hash = '#/mesaj'; })]);
  const md = openModal({ title: c.name, size: 'narrow', body: html`<div class="list">${items.map(([ic, l], i) => html`<button type="button" class="list-row" data-i="${i}" style="width:100%;border:0;background:none;text-align:left">${icon(ic, 'sm')}<span>${l}</span></button>`)}</div>` });
  md.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (!b) return; md.close(); items[+b.dataset.i][2](); });
};
function chatMuteAsk(c) {
  const md = openModal({ title: 'Sessize al', size: 'narrow', body: html`<div class="list">${[['8h', '8 saat'], ['1w', '1 hafta'], ['always', 'Her zaman']].map(([v, l]) => html`<button type="button" class="list-row" data-v="${v}" style="width:100%;border:0;background:none;text-align:left">${icon('bellOff', 'sm')}<span>${l}</span></button>`)}</div><p class="tiny faint">Adınız @ ile geçerse yine bildirim alırsınız.</p>` });
  md.el.addEventListener('click', async (ev) => { const b = ev.target.closest('[data-v]'); if (!b) return; md.close(); if (await chatStateOp(c.id, { op: 'mute', dur: b.dataset.v })) { toast('Sessize alındı'); route(); } });
}
async function chatSearch() {
  const m = openModal({ title: 'Sohbette ara', body: html`<div class="stack"><div class="search">${icon('search')}<input class="input" type="search" id="chSq" placeholder="Kelime yazın" autofocus></div><div id="chSr" class="list"></div></div>` });
  const run = debounce(async () => {
    const q = $('#chSq', m.el).value.trim();
    if (q.length < 2) { setHTML($('#chSr', m.el), ''); return; }
    try {
      const r = await api('chat.search', { id: CH.id, q });
      setHTML($('#chSr', m.el), r.msgs.length ? html`${r.msgs.map((x) => html`<button type="button" class="list-row" data-mid="${x.id}" style="width:100%;border:0;background:none;text-align:left"><div class="grow" style="min-width:0"><div class="lr-t">${x.name} <span class="tiny faint">${chTime(x.at)}</span></div><div class="lr-s ellipsis">${x.body || (x.file ? x.file.name : '')}</div></div></button>`)}` : html`<div class="small muted" style="padding:8px">Sonuç yok.</div>`);
    } catch (e) { toast(e.message, 'err'); }
  }, 250);
  $('#chSq', m.el).addEventListener('input', run);
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-mid]'); if (!b) return; m.close(); chatJumpTo(+b.dataset.mid); });
}
async function chatJumpTo(id) {
  // Gerekirse eski mesajları yükle
  for (let i = 0; i < 20 && !CH.msgs.some((x) => x.id === id) && CH.msgs.length && id < CH.msgs[0].id; i++) {
    const r = await api('chat.older', { id: CH.id, before: CH.msgs[0].id });
    if (!r.msgs.length) break;
    chatAdd(r.msgs);
  }
  const n = $(`.ch-msg[data-id="${id}"]`);
  if (n) { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1500); }
}
async function chatMedia(kind) {
  const m = openModal({ title: 'Medya, belgeler ve bağlantılar', size: 'wide', body: html`<div class="stack"><div class="seg" role="tablist">${[['media', 'Medya'], ['docs', 'Belgeler'], ['links', 'Bağlantılar']].map(([k, l]) => html`<button type="button" class="${kind === k ? 'on' : ''}" data-k="${k}">${l}</button>`)}</div><div id="chMd"></div></div>` });
  const load = async (k) => {
    $$('[data-k]', m.el).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    let r;
    try { r = await api('chat.media', { id: CH.id, kind: k }); } catch (e) { toast(e.message, 'err'); return; }
    const box = $('#chMd', m.el);
    if (!r.msgs.length) { setHTML(box, html`<p class="small muted">Henüz yok.</p>`); return; }
    if (k === 'media') setHTML(box, html`<div class="ch-gal">${r.msgs.map((x) => html`<a href="${x.file.url}" target="_blank" rel="noopener"><img src="${x.file.url}" alt="${x.file.name}" loading="lazy"></a>`)}</div>`);
    else if (k === 'docs') setHTML(box, html`<div class="list">${r.msgs.map((x) => html`<a class="list-row" href="${x.file.url}&dl=1">${icon(x.kind === 'audio' ? 'mic' : 'file', 'sm')}<div class="grow" style="min-width:0"><div class="lr-t ellipsis">${x.file.name}</div><div class="lr-s">${x.name} · ${chTime(x.at)}</div></div>${icon('download', 'sm')}</a>`)}</div>`);
    else setHTML(box, html`<div class="list">${r.msgs.flatMap((x) => (x.body.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/g) || []).map((u) => html`<a class="list-row" href="${/^https?:/.test(u) ? u : 'https://' + u}" target="_blank" rel="noopener noreferrer">${icon('link', 'sm')}<div class="grow" style="min-width:0"><div class="lr-t ellipsis">${u}</div><div class="lr-s">${x.name} · ${chTime(x.at)}</div></div></a>`))}</div>`);
  };
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-k]'); if (b) load(b.dataset.k); });
  load(kind);
}
/** Sohbeti metin olarak dışa aktar (kendi görünümüm; dosyalar dahil edilmez) */
async function chatExport() {
  if (!(await confirmDialog({ title: 'Sohbet dışa aktarılsın mı?', text: 'Mesajlar metin dosyası olarak cihazınıza iner (fotoğraf ve dosyalar dahil edilmez). Hasta bilgisi içerebilecek sohbetleri paylaşmayın; dosyayı işiniz bitince silin (KVKK).', ok: 'Dışa aktar' }))) return;
  let all = CH.msgs.slice();
  for (let i = 0; i < 100 && all.length; i++) {
    const r = await api('chat.older', { id: CH.id, before: all[0].id });
    if (!r.msgs.length) break;
    all = r.msgs.concat(all);
    if (!r.more) break;
  }
  const lines = all.filter((x) => !x.deleted).map((x) => `[${x.at.slice(8, 10)}.${x.at.slice(5, 7)}.${x.at.slice(0, 4)} ${x.at.slice(11, 16)}] ${x.kind === 'system' ? '' : x.name + ': '}${x.kind === 'poll' ? 'Anket: ' : ''}${x.body || ''}${x.file ? ` <${x.file.name}>` : ''}`);
  downloadBlob(new Blob([`${CH.chat.name} — dupcii sohbet dökümü\n\n` + lines.join('\n')], { type: 'text/plain;charset=utf-8' }), `sohbet-${CH.chat.name.replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '').slice(0, 40)}.txt`);
}

/* ---------------- Yazıyor… ---------------- */
let _chTypingAt = 0;
function chatTypingPing() {
  if (!CH.id || Date.now() - _chTypingAt < 4000) return;
  _chTypingAt = Date.now();
  api('chat.typing', { id: CH.id }).catch(() => {});
}
function chatHeadStatus() {
  const el = $('#chSub');
  if (!el || !CH.chat) return;
  if (CH.typing && CH.typing.length) { el.textContent = CH.chat.kind === 'direct' ? 'yazıyor…' : `${CH.typing.slice(0, 2).join(', ')} yazıyor…`; el.classList.add('ch-typing'); return; }
  el.classList.remove('ch-typing');
  if (CH.chat.kind === 'direct') el.textContent = [CH.chat.sub, chatPresence(CH.chat.peer)].filter(Boolean).join(' · ') || 'Birebir sohbet';
  else el.textContent = `${CH.members.length} kişi${CH.chat.only_admins ? ' · yalnız yöneticiler yazar' : ''}`;
}

/* ---------------- Grup ayarları (izinler, foto, katılma istekleri) ---------------- */
function chatGroupAdminHtml(c) {
  if (c.kind !== 'group') return '';
  return html`${c.admin ? html`<div class="stack" style="gap:8px"><div class="sec-title" style="margin:0">Grup ayarları</div>
      <div class="field"><label>Grup bilgisini kimler düzenleyebilir</label><select class="select" data-gp="perm_edit"><option value="admins" ${c.perm_edit !== 'all' ? raw('selected') : ''}>Yalnız yöneticiler</option><option value="all" ${c.perm_edit === 'all' ? raw('selected') : ''}>Tüm üyeler</option></select></div>
      <div class="field"><label>Kimler üye ekleyebilir</label><select class="select" data-gp="perm_add"><option value="admins" ${c.perm_add !== 'all' ? raw('selected') : ''}>Yalnız yöneticiler</option><option value="all" ${c.perm_add === 'all' ? raw('selected') : ''}>Tüm üyeler</option></select></div>
      <label class="switch"><input type="checkbox" data-gp="approve_join" ${c.approve_join ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Yeni katılımcıları onayla</b><span>Davet bağlantısıyla gelenler, bir yönetici onaylayınca katılır.</span></span></label></div>` : ''}
    ${c.admin && c.joinreqs.length ? html`<div class="field"><label>Katılma istekleri (${c.joinreqs.length})</label><div class="list">${c.joinreqs.map((r) => html`<div class="list-row">${avatar(r.name, 'sm')}<div class="grow">${r.name}${r.unit ? html` <span class="tiny faint">· ${r.unit}</span>` : ''}</div>
      <button class="btn sm primary" data-jr="approve" data-tk="${r.tk}" data-uid="${r.uid}">Onayla</button><button class="btn sm ghost" data-jr="reject" data-tk="${r.tk}" data-uid="${r.uid}">Reddet</button></div>`)}</div></div>` : ''}`;
}
function chatGroupAdminMount(m, c) {
  $$('[data-gp]', m.el).forEach((el) => el.addEventListener('change', async () => {
    try { await api('chat.update', { id: c.id, [el.dataset.gp]: el.type === 'checkbox' ? el.checked : el.value }); c[el.dataset.gp] = el.type === 'checkbox' ? el.checked : el.value; toast('Kaydedildi'); } catch (e) { toast(e.message, 'err'); }
  }));
  m.el.addEventListener('click', async (ev) => {
    const j = ev.target.closest('[data-jr]');
    if (j) { try { await api('chat.joinreq', { id: c.id, op: j.dataset.jr, tk: j.dataset.tk, uid: +j.dataset.uid }); toast(j.dataset.jr === 'approve' ? 'Onaylandı' : 'Reddedildi'); while (modalStack.length) modalStack[modalStack.length - 1].close(); route(); } catch (e) { toast(e.message, 'err'); } return; }
    const ph = ev.target.closest('[data-act=ch-photo]');
    if (ph) $('#chPhotoF', m.el).click();
  });
  const pf = $('#chPhotoF', m.el);
  if (pf) pf.addEventListener('change', async () => {
    const f = pf.files[0]; if (!f) return;
    try { const sm = await chatShrink(f); const a = await uploadFile(sm); await api('chat.photo', { id: c.id, att_id: a.id }); toast('Grup fotoğrafı değişti'); while (modalStack.length) modalStack[modalStack.length - 1].close(); route(); } catch (e) { toast(e.message, 'err'); }
  });
}
