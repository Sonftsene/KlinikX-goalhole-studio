/* dupcii — sohbet görünümü (4.28): renk temaları, balon biçimleri, duvar kağıtları (liste ve sohbet ayrı), görünüm penceresi;
   iletme / paylaşma için ortak alıcı seçici (var olan sohbetler + aranabilir tüm kişiler, çoklu seçim). Tercihler bu cihazda saklanır. */
'use strict';

Object.assign(ICON_PATHS, {
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.6a1.6 1.6 0 0 0-1.2 2.7A1.6 1.6 0 0 1 14 22z M7.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M10.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M15.5 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17 11.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
});

const CH_THEMES = [
  ['deniz', 'Deniz', '#0ea5a0', '#3b82f6'], ['gece', 'Gece', '#6366f1', '#8b5cf6'], ['gul', 'Gül', '#ec4899', '#f43f5e'],
  ['zumrut', 'Zümrüt', '#10b981', '#0f766e'], ['gunbatimi', 'Gün batımı', '#f97316', '#db2777'], ['lavanta', 'Lavanta', '#a78bfa', '#60a5fa'], ['sade', 'Sade', '#475569', '#334155'],
];
const CH_STYLES = [['yumusak', 'Yumuşak'], ['balon', 'Balon'], ['kart', 'Kart'], ['cizgi', 'Çizgi']];
const CH_WALLS = [['yok', 'Düz'], ['gradyan', 'Renk geçişi'], ['nokta', 'Noktalar'], ['dalga', 'Dalgalar'], ['saglik', 'Sağlık'], ['geometri', 'Geometri'], ['kagit', 'Kâğıt'], ['yildiz', 'Gece']];

/** Görünüm tercihleri: eski "bg" seçimi yeni duvar kağıtlarına çevrilir */
function chatLook() {
  const u = chatUi();
  const old = { dots: 'nokta', warm: 'kagit', dark: 'yildiz', plain: 'yok' }[u.bg] || 'gradyan';
  return { theme: u.theme || 'deniz', style: u.style || 'yumusak', cw: u.cw || old, lw: u.lw || 'gradyan' };
}
function chatThemeClass() { const l = chatLook(); return `ch-th-${l.theme} ch-st-${l.style}`; }
// mesaj2.js'deki tanımın yerine: yazı boyutu + sohbet duvar kağıdı
function chatUiClass() { const u = chatUi(); return `ch-font-${u.font} ch-wp-${chatLook().cw}`; }
function chatHomeClass() { const l = chatLook(); return `ch-home ch-th-${l.theme} ch-wp-${l.lw}`; }

/* ---------------- Görünüm penceresi ---------------- */
ACT['ch-look'] = () => {
  const m = openModal({ title: 'Sohbet görünümü', body: html`<div id="chLook"></div>`, foot: html`<button class="btn primary" data-close>Tamam</button>` });
  const draw = () => {
    const l = chatLook();
    setHTML($('#chLook', m.el), html`<div class="stack ch-look">
      <div class="ch-look-prev ch-view ${chatThemeClass()}"><div class="ch-scroll ch-wp-${l.cw}">
        <div class="ch-msg"><div class="ch-bub"><div class="ch-text">Yarınki nöbeti değişebilir miyiz?</div><div class="ch-time">09:41</div></div></div>
        <div class="ch-msg mine"><div class="ch-bub"><div class="ch-text">Olur, gündüzü alırım 👍</div><div class="ch-time">09:42 <span class="ch-tk read">${icon('checks', 'sm')}</span></div></div></div></div></div>
      <div><div class="ch-look-h">Renk teması</div><div class="ch-look-row">${CH_THEMES.map(([k, n, a, b]) => html`<button type="button" class="ch-sw ${l.theme === k ? 'on' : ''}" data-k="theme" data-v="${k}" title="${n}" aria-label="${n}" style="--a:${a};--b:${b}"><span></span><em>${n}</em></button>`)}</div></div>
      <div><div class="ch-look-h">Balon biçimi</div><div class="ch-look-row">${CH_STYLES.map(([k, n]) => html`<button type="button" class="ch-stb ch-st-${k} ${chatThemeClass().split(' ')[0]} ${l.style === k ? 'on' : ''}" data-k="style" data-v="${k}"><span class="b1"></span><span class="b2"></span><em>${n}</em></button>`)}</div></div>
      <div><div class="ch-look-h">Sohbet duvar kâğıdı</div><div class="ch-look-row">${CH_WALLS.map(([k, n]) => html`<button type="button" class="ch-wpb ${chatThemeClass().split(' ')[0]} ch-wp-${k} ${l.cw === k ? 'on' : ''}" data-k="cw" data-v="${k}"><em>${n}</em></button>`)}</div></div>
      <div><div class="ch-look-h">Sohbet listesi arka planı</div><div class="ch-look-row">${CH_WALLS.map(([k, n]) => html`<button type="button" class="ch-wpb ${chatThemeClass().split(' ')[0]} ch-wp-${k} ${l.lw === k ? 'on' : ''}" data-k="lw" data-v="${k}"><em>${n}</em></button>`)}</div></div>
      <p class="tiny faint" style="margin:0">Görünüm bu cihazda saklanır; başkalarının ekranını değiştirmez.</p></div>`);
  };
  draw();
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k][data-v]'); if (!b) return;
    chatUiSave({ [b.dataset.k]: b.dataset.v });
    draw();
    chatLookApply();
  });
};
/** Açık ekrana uygula (liste ya da sohbet) */
function chatLookApply() {
  const v = $('#chatView');
  if (v) { v.className = v.className.replace(/\bch-(th|st)-\S+/g, '').trim() + ' ' + chatThemeClass(); const s = $('#chScroll'); if (s) s.className = 'ch-scroll ' + chatUiClass(); }
  const h = $('.ch-home'); if (h) h.className = chatHomeClass();
}

/* ---------------- Alıcı seçici: iletme ve paylaşma ----------------
   Var olan sohbetler + birimdeki ve izin verilen diğer kişiler (arama ile); birden çok seçilebilir. Kişiyle sohbet yoksa açılır. */
async function chatPickTargets({ title = 'Şuraya gönder', top = '', ok = 'Gönder', exclude = 0 } = {}) {
  let list, people;
  try { [list, people] = await Promise.all([api('chat.list'), api('chat.people')]); } catch (e) { toast(e.message, 'err'); return null; }
  const direct = new Set();
  const chats = (list.items || []).filter((c) => c.id !== exclude && !c.archived).map((c) => {
    if (c.kind === 'direct' && c.other) direct.add(c.other.tk + ':' + c.other.uid);
    return { key: 'c' + c.id, name: c.name, sub: c.kind === 'unit' ? 'Birim grubu' : c.kind === 'group' ? 'Grup' : c.sub || 'Sohbet', kind: c.kind, photo: c.photo };
  });
  const ppl = (people.people || []).filter((p) => !direct.has(p.tk + ':' + p.uid)).map((p) => ({ key: 'p' + p.tk + ':' + p.uid, name: p.name, sub: p.unit || 'Kişi', kind: 'person' }));
  const sel = new Map();
  return new Promise((resolve) => {
    let done = false;
    const md = openModal({ title, body: html`<div class="stack ch-pick">${top}
        <div class="search">${icon('search')}<input class="input" id="chpQ" placeholder="Sohbet ya da kişi ara" autocomplete="off"></div>
        <div class="ch-pick-sel" id="chpSel"></div>
        <div class="ch-pick-list" id="chpList"></div></div>`,
      foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="chpGo" disabled>${icon('send', 'sm')}<span>${ok}</span></button>`,
      onClose: () => { if (!done) resolve(null); } });
    const ava = (x) => (x.photo ? html`<span class="ch-ava"><img src="${x.photo}" alt=""></span>` : x.kind === 'direct' || x.kind === 'person' ? avatar(x.name, 'sm') : html`<span class="ch-ava tone-${x.kind === 'unit' ? 'teal' : 'violet'}">${icon(x.kind === 'unit' ? 'users' : 'chat', 'sm')}</span>`);
    const row = (x) => html`<button type="button" class="ch-pick-row ${sel.has(x.key) ? 'on' : ''}" data-key="${x.key}">${ava(x)}<span class="grow" style="min-width:0"><b class="ellipsis">${x.name}</b><span class="tiny faint ellipsis">${x.sub}</span></span><span class="ch-pick-ck">${icon('check', 'sm')}</span></button>`;
    const draw = () => {
      const q = avKey($('#chpQ', md.el).value || '');
      const f = (x) => !q || avKey(x.name).includes(q);
      const cs = chats.filter(f); const ps = ppl.filter(f).slice(0, q ? 80 : 30);
      setHTML($('#chpList', md.el), html`${cs.length ? html`<div class="ch-pick-h">Sohbetler</div>${cs.map(row)}` : ''}
        ${ps.length ? html`<div class="ch-pick-h">Kişiler${!q && ppl.length > ps.length ? html` <span class="tiny faint">· adını yazarak arayın</span>` : ''}</div>${ps.map(row)}` : ''}
        ${!cs.length && !ps.length ? html`<p class="small muted" style="padding:10px">Bulunamadı.</p>` : ''}`);
      setHTML($('#chpSel', md.el), html`${[...sel.values()].map((x) => html`<button type="button" class="ch-chip" data-key="${x.key}">${x.name} ${icon('x', 'sm')}</button>`)}`);
      const go = $('#chpGo', md.el); go.disabled = !sel.size;
      setHTML(go, html`${icon('send', 'sm')}<span>${ok}${sel.size > 1 ? ` (${sel.size})` : ''}</span>`);
    };
    draw();
    $('#chpQ', md.el).addEventListener('input', draw);
    md.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]'); if (!b) return;
      const k = b.dataset.key; const x = chats.find((y) => y.key === k) || ppl.find((y) => y.key === k);
      if (sel.has(k)) sel.delete(k); else if (x) sel.set(k, x);
      draw();
    });
    $('#chpGo', md.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const ids = []; const names = [];
      for (const x of sel.values()) {
        try {
          if (x.key[0] === 'c') ids.push(+x.key.slice(1));
          else { const [tk, uid] = x.key.slice(1).split(':'); const r = await api('chat.direct', { tk, uid: +uid }); ids.push(r.id); }
          names.push(x.name);
        } catch (err) { toast(`${x.name}: ${err.message}`, 'err'); }
      }
      if (!ids.length) return;
      done = true;
      resolve({ ids, names, el: md.el, close: () => md.close() });
    }));
  });
}

/* İlet (tek mesaj ve çoklu seçim): mesaj3.js / mesaj.js tanımlarının yerine */
async function chatForward(m) { return chatForwardMany([m]); }
async function chatForwardMany(ms) {
  const r = await chatPickTargets({ title: ms.length > 1 ? ms.length + ' mesajı ilet' : 'İlet', ok: 'İlet', exclude: 0 });
  if (!r) return;
  try {
    for (const id of r.ids) for (const m of ms) await api('chat.forward', { id: m.id, to: id });
    r.close();
    if (typeof chatSelEnd === 'function' && CH.sel) chatSelEnd();
    toast(r.names.length > 1 ? `${r.names.length} sohbete iletildi` : `${r.names[0]} sohbetine iletildi`);
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- Sohbet listesinde arama: kişi adıyla yeni sohbet ---------------- */
CHANGE['ch-q'] = (el) => { CH.q = el.value; chatListDraw(); const i = $('#chQ'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
async function chatPeopleCache() {
  if (CH.people && Date.now() - CH.peopleAt < 120000) return CH.people;
  try { CH.people = (await api('chat.people')).people || []; CH.peopleAt = Date.now(); } catch (e) { CH.people = CH.people || []; }
  return CH.people;
}
ACT['ch-start'] = async (el) => {
  try { const r = await api('chat.direct', { tk: el.dataset.tk, uid: +el.dataset.uid }); location.hash = '#/mesaj/' + r.id; } catch (e) { toast(e.message, 'err'); }
};
