/* dupcii — mesajlaşma 4.8: mesaj içerikleri (video, konum, kişi, arama, tek seferlik, bağlantılar), emoji seçici,
   uzun basma / sağa kaydırıp yanıtlama, kamera, konum ve kişi paylaşımı, çoklu seçim, taslaklar, yapıştır/sürükle-bırak */
'use strict';

Object.assign(ICON_PATHS, {
  video: 'M23 7l-7 5 7 5V7z M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  mapPin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  contact: 'M16 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M9 16a3 3 0 0 1 6 0',
  phoneIn: 'M16 2v6h6 M22 2l-6 6 M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  phoneOut: 'M23 1l-6 6 M17 1h6v6 M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  phoneMiss: 'M23 1l-6 6 M17 1l6 6 M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  once: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M10 8l2-1v10',
});

/* ---------------- Mesaj içeriği ---------------- */
const CH_URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)|((?:\+90\s?|0)[2-5]\d{2}\s?\d{3}\s?\d{2}\s?\d{2})(?!\d)/g;
/** Metin: bağlantılar ve telefon numaraları tıklanır, @bahsetmeler vurgulanır (hepsi güvenli parçalar) */
function chatRich(text) {
  const parts = [];
  let last = 0; let mm;
  CH_URL_RE.lastIndex = 0;
  while ((mm = CH_URL_RE.exec(text))) {
    if (mm.index > last) parts.push(chatMentions(text.slice(last, mm.index)));
    if (mm[1]) {
      let u = mm[1].replace(/[),.;:!?]+$/, '');
      const href = /^www\./.test(u) ? 'https://' + u : u;
      parts.push(html`<a href="${href}" target="_blank" rel="noopener noreferrer nofollow" class="ch-link">${u}</a>`);
      CH_URL_RE.lastIndex = mm.index + u.length;
      last = mm.index + u.length;
    } else {
      parts.push(html`<a href="tel:${mm[2].replace(/\s/g, '')}" class="ch-link">${mm[2]}</a>`);
      last = mm.index + mm[0].length;
    }
  }
  if (last < text.length) parts.push(chatMentions(text.slice(last)));
  return html`${parts}`;
}
const fmtDur = (s) => `${Math.floor(s / 60)}:${pad(s % 60)}`;
function chatBodyHtml(m) {
  if (m.deleted) return html`<div class="ch-del">${icon('x', 'sm')} Bu mesaj silindi</div>`;
  const parts = [];
  if (m.fwd) parts.push(html`<div class="ch-fwd">${icon('forward', 'sm')} İletildi</div>`);
  if (m.kind === 'poll') parts.push(chatPollHtml(m));
  else if (m.kind === 'call') {
    const c = m.call || {};
    const ok = c.status === 'done';
    const ic = !ok ? 'phoneMiss' : m.mine ? 'phoneOut' : 'phoneIn';
    const lab = (c.video ? 'Görüntülü' : 'Sesli') + ' arama';
    parts.push(html`<div class="ch-callmsg ${ok ? '' : 'miss'}"><span class="ch-callic">${icon(c.video ? 'video' : ic, 'sm')}</span><span class="grow"><b>${ok ? lab : c.status === 'declined' ? 'Reddedilen ' + lab.toLocaleLowerCase('tr') : 'Cevapsız ' + lab.toLocaleLowerCase('tr')}</b><span class="tiny faint">${ok ? fmtDur(c.dur || 0) : m.mine ? 'Aradınız' : 'Sizi aradı'}</span></span>
      ${CH.chat && CH.chat.calls ? html`<button type="button" class="btn sm" data-act="ch-call" data-v="${c.video ? 1 : 0}">Tekrar ara</button>` : ''}</div>`);
  } else if (m.once) {
    const v = m.kind === 'video';
    parts.push(m.mine ? html`<div class="ch-once">${icon('once', 'sm')}<span>Tek seferlik ${v ? 'video' : 'fotoğraf'}</span><span class="tiny faint">${m.opened ? 'Açıldı' : 'Henüz açılmadı'}</span></div>`
      : m.file ? html`<button type="button" class="ch-once on" data-act="ch-once" data-id="${m.id}">${icon('once', 'sm')}<span>Tek seferlik ${v ? 'video' : 'fotoğraf'}</span><span class="tiny faint">Açmak için dokunun</span></button>`
        : html`<div class="ch-once">${icon('once', 'sm')}<span>Açıldı</span></div>`);
  } else if (m.kind === 'location' && m.loc) {
    const { lat, lng } = m.loc;
    parts.push(html`<div class="ch-loc"><div class="ch-locmap">${icon('mapPin')}<span>${lat.toFixed(5)}, ${lng.toFixed(5)}</span></div>
      ${m.body ? html`<div class="small">${m.body}</div>` : ''}${m.loc.acc ? html`<div class="tiny faint">± ${m.loc.acc} m</div>` : ''}
      <div class="row wrap" style="gap:6px"><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}">Google Haritalar</a><a class="btn sm ghost" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}">OpenStreetMap</a></div></div>`);
  } else if (m.kind === 'contact' && m.contact) {
    const c = m.contact;
    parts.push(html`<div class="ch-contact"><div class="row" style="gap:10px">${avatar(c.name, 'sm')}<div style="min-width:0"><b>${c.name}</b>${c.title ? html`<div class="tiny faint">${c.title}</div>` : ''}${c.phone ? html`<div class="small">${c.phone}</div>` : ''}</div></div>
      <div class="row wrap" style="gap:6px">${c.phone ? html`<a class="btn sm" href="tel:${c.phone.replace(/\s/g, '')}">${icon('phone', 'sm')}Ara</a>` : ''}${c.uid ? html`<button type="button" class="btn sm ghost" data-act="ch-profile" data-tk="${c.tk}" data-uid="${c.uid}">${icon('chat', 'sm')}Mesaj</button>` : ''}</div></div>`);
  } else {
    if (m.file) {
      if (m.kind === 'image') parts.push(chatUi().autoimg || (CH.shown && CH.shown.has(m.id)) ? html`<button type="button" class="ch-img" data-act="ch-file" data-id="${m.id}"><img src="${m.file.url}" alt="${m.file.name}" loading="lazy"></button>` : html`<button type="button" class="ch-filechip" data-act="ch-showimg" data-id="${m.id}">${icon('image', 'sm')}<span>Fotoğrafı göster</span><span class="tiny faint">${chSize(m.file.size)}</span></button>`);
      else if (m.kind === 'video') parts.push(html`<div class="ch-video"><video controls playsinline preload="metadata" src="${m.file.url}"></video>${m.dur ? html`<span class="tiny faint">${fmtDur(m.dur)}</span>` : ''}</div>`);
      else if (m.kind === 'audio') parts.push(html`<div class="ch-audio">${icon('mic', 'sm')}<audio controls preload="none" src="${m.file.url}"></audio><button type="button" class="ch-speed" data-act="ch-speed" title="Oynatma hızı">1×</button>${m.dur ? html`<span class="tiny faint">${fmtDur(m.dur)}</span>` : ''}</div>`);
      else parts.push(html`<button type="button" class="ch-filechip" data-act="ch-file" data-id="${m.id}">${icon('file', 'sm')}<span class="ellipsis">${m.file.name}</span><span class="tiny faint">${chSize(m.file.size)}</span></button>`);
    }
    if (m.body) parts.push(html`<div class="ch-text ${/^\p{Extended_Pictographic}{1,3}$/u.test(m.body.replace(/️|‍/g, '')) ? 'big' : ''}">${chatRich(m.body)}</div>`);
  }
  if ((m.reacts || []).length) parts.push(html`<div class="ch-reacts">${m.reacts.map((x) => html`<button type="button" class="ch-react ${x.mine ? 'on' : ''}" data-act="ch-react" data-id="${m.id}" data-e="${x.e}">${x.e} ${x.n}</button>`)}</div>`);
  return html`${parts}`;
}
ACT['ch-speed'] = (el) => {
  const a = el.parentElement.querySelector('audio'); if (!a) return;
  const next = { 1: 1.5, 1.5: 2, 2: 1 }[a.playbackRate] || 1;
  a.playbackRate = next; el.textContent = next + '×';
};
ACT['ch-goto'] = (el) => {
  const n = $(`.ch-msg[data-id="${el.dataset.id}"]`);
  if (n) { n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.classList.add('flash'); setTimeout(() => n.classList.remove('flash'), 1500); } else toast('Alıntılanan mesaj daha eskilerde.');
};
/** Tek seferlik: bir kez görüntülenir, kapanınca bir daha açılmaz */
ACT['ch-once'] = (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id);
  if (!m || !m.file) return;
  const v = m.kind === 'video';
  const md = openModal({ title: 'Tek seferlik ' + (v ? 'video' : 'fotoğraf'), size: 'wide', body: html`<div class="ch-oncev" oncontextmenu="return false">${v ? html`<video src="${m.file.url}" autoplay playsinline controls controlslist="nodownload"></video>` : html`<img src="${m.file.url}" alt="" draggable="false">`}</div><p class="tiny faint" style="text-align:center">Kapattıktan sonra bir daha açılamaz.</p>`,
    onClose: () => { m.opened = 1; delete m.file; chatDraw(); } });
  return md;
};

/* ---------------- Emoji ---------------- */
const CH_EMOJI = {
  'Sık': '👍 ❤️ 😂 🙏 👏 🔥 🎉 😊 😍 😢 😮 😅 🤝 ✅ 💯 🙌',
  'Yüzler': '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠',
  'El': '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫶',
  'Kalp': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝',
  'Sağlık': '🏥 🩺 💉 💊 🩹 🩸 🧪 🧫 🦠 🧬 🌡️ 😷 🚑 👩‍⚕️ 👨‍⚕️ 🧑‍⚕️ 🛏️ ♿ 🧠 🫀 🫁 🦷 🦴 👁️',
  'Nesne': '☕ 🍵 🍰 🎂 🍕 🍔 🥗 🍎 🍌 🍉 💐 🌹 🌷 🌸 🌞 🌙 ⭐ 🌈 ☔ ❄️ ⚡ 📌 📎 📝 📅 📆 ⏰ ⌛ 📞 📱 💻 🔑 🔒 🚗 🏠 🎁 🎈 🏆',
  'Simge': '✅ ☑️ ✔️ ❌ ❎ ⚠️ ⛔ 🚫 ❗ ❓ ‼️ ⁉️ 💯 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🆗 🆕 🆘 ➡️ ⬅️ ⬆️ ⬇️ 🔁 ▶️ ⏸️',
};
function chatEmoRecent() { try { return JSON.parse(localStorage.getItem('nm-emo') || '[]'); } catch (e) { return []; } }
function chatEmoUse(e) { try { localStorage.setItem('nm-emo', JSON.stringify([e, ...chatEmoRecent().filter((x) => x !== e)].slice(0, 24))); } catch (err) { /* */ } }
function chatEmoGrid() {
  const rec = chatEmoRecent();
  const cats = rec.length ? [['Son kullanılan', rec.join(' ')], ...Object.entries(CH_EMOJI)] : Object.entries(CH_EMOJI);
  return html`<div class="emo-tabs">${cats.map(([k], i) => html`<button type="button" data-tab="${i}" class="${i ? '' : 'on'}">${k}</button>`)}</div>
    <div class="emo-grid">${cats.map(([k, v], i) => html`<div class="emo-sec" data-sec="${i}"><div class="tiny faint">${k}</div><div class="emo-row">${v.split(' ').map((e) => html`<button type="button" data-emo="${e}">${e}</button>`)}</div></div>`)}</div>`;
}
function chatEmoWire(root, cb) {
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-tab]');
    if (t) { const s = root.querySelector(`[data-sec="${t.dataset.tab}"]`); if (s) s.scrollIntoView({ block: 'start' }); $$('[data-tab]', root).forEach((b) => b.classList.toggle('on', b === t)); return; }
    const e = ev.target.closest('[data-emo]');
    if (e) { chatEmoUse(e.dataset.emo); cb(e.dataset.emo); }
  });
}
/** Tepki için tam emoji seçici */
function chatEmojiPick(cb) {
  const md = openModal({ title: 'Emoji seç', size: 'narrow', body: html`<div class="emo-pick">${chatEmoGrid()}</div>` });
  chatEmoWire(md.el, (e) => { md.close(); cb(e); });
}
/** Yazma çubuğundaki emoji paneli */
ACT['ch-emoji'] = () => {
  const box = $('#chEmo'); if (!box) return;
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  setHTML(box, chatEmoGrid());
  box.classList.remove('hidden');
  if (!box.dataset.wired) {
    box.dataset.wired = '1';
    chatEmoWire(box, (e) => {
      const ta = $('#chInput'); if (!ta) return;
      const a = ta.selectionStart ?? ta.value.length; const b = ta.selectionEnd ?? a;
      ta.value = ta.value.slice(0, a) + e + ta.value.slice(b);
      ta.selectionStart = ta.selectionEnd = a + e.length;
      ta.dispatchEvent(new Event('input'));
      if (!matchMedia('(pointer: coarse)').matches) ta.focus();
    });
  }
};
/** Masaüstü: mesajın yanındaki 😊 → hızlı tepki çubuğu */
ACT['ch-qreact'] = (el) => {
  const m = CH.msgs.find((x) => x.id === +el.dataset.id); if (!m) return;
  $$('.ch-rxpop').forEach((x) => x.remove());
  const pop = document.createElement('div');
  pop.className = 'ch-rxpop';
  const mine = ((m.reacts || []).find((x) => x.mine) || {}).e;
  pop.innerHTML = fmtVal(html`${(CH.emojis || []).map((e) => html`<button type="button" data-e="${e}" class="${mine === e ? 'on' : ''}">${e}</button>`)}<button type="button" data-more="1" aria-label="Başka emoji">${icon('plus', 'sm')}</button><button type="button" data-star="1" aria-label="Yıldızla" title="${m.star ? 'Yıldızı kaldır' : 'Yıldızla'}">${icon('star', 'sm')}</button><button type="button" data-rep="1" aria-label="Yanıtla" title="Yanıtla">${icon('reply', 'sm')}</button>`);
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect();
  pop.style.top = Math.max(8, r.top - 50) + 'px';
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - pop.offsetWidth / 2)) + 'px';
  const off = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('pointerdown', off, true); } };
  setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  pop.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    pop.remove(); document.removeEventListener('pointerdown', off, true);
    if (b.dataset.e) ACT['ch-react']({ dataset: { id: String(m.id), e: b.dataset.e } });
    else if (b.dataset.more) chatEmojiPick((e) => ACT['ch-react']({ dataset: { id: String(m.id), e } }));
    else if (b.dataset.star) chatStar(m);
    else if (b.dataset.rep && CH.chat.can_send) chatSetReply(m);
  });
};

/* ---------------- Dokunma: uzun bas (menü), sağa kaydır (yanıtla), seçim modu ---------------- */
function chatGestures(scroll) {
  if (!scroll || scroll.dataset.g) return;
  scroll.dataset.g = '1';
  let t = null; let sx = 0; let sy = 0; let row = null; let dx = 0; let moved = false; let long = false;
  scroll.addEventListener('touchstart', (e) => {
    const bub = e.target.closest('.ch-bub'); if (!bub || e.target.closest('a,button:not(.ch-bub),audio,video,input')) return;
    row = bub.closest('.ch-msg'); sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; moved = false; long = false;
    clearTimeout(t);
    t = setTimeout(() => { if (!moved && row) { long = true; if (CH.sel) chatSelToggle(+row.dataset.id); else ACT['ch-menu']({ dataset: { id: row.dataset.id } }); } }, 430);
  }, { passive: true });
  scroll.addEventListener('touchmove', (e) => {
    if (!row) return;
    const x = e.touches[0].clientX - sx; const y = e.touches[0].clientY - sy;
    if (Math.abs(x) > 8 || Math.abs(y) > 8) { moved = true; clearTimeout(t); }
    if (CH.sel || Math.abs(y) > Math.abs(x) || x <= 0) return;
    dx = Math.min(80, x);
    row.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('swipe-ok', dx > 56);
  }, { passive: true });
  const end = () => {
    clearTimeout(t);
    if (row) {
      row.style.transform = ''; row.classList.remove('swipe-ok');
      if (dx > 56 && CH.chat && CH.chat.can_send && !CH.chat.restricted) {
        const m = CH.msgs.find((x) => x.id === +row.dataset.id);
        if (m && !m.deleted && m.kind !== 'system') { chatSetReply(m); if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* */ } } }
      }
    }
    row = null; dx = 0;
  };
  scroll.addEventListener('touchend', end); scroll.addEventListener('touchcancel', end);
  // Masaüstü: sağ tık → menü; seçim modunda tıklama seçer
  scroll.addEventListener('contextmenu', (e) => {
    const r = e.target.closest('.ch-msg'); if (!r || e.target.closest('a,video,audio')) return;
    e.preventDefault();
    ACT['ch-menu']({ dataset: { id: r.dataset.id } });
  });
  scroll.addEventListener('click', (e) => {
    if (!CH.sel) return;
    const r = e.target.closest('.ch-msg'); if (!r) return;
    e.preventDefault(); e.stopPropagation();
    if (!long) chatSelToggle(+r.dataset.id);
    long = false;
  }, true);
  scroll.addEventListener('scroll', () => chatDownSync(), { passive: true });
  // Yapıştır (ekran görüntüsü) ve sürükle-bırak
  const view = $('#chatView');
  if (view) {
    view.addEventListener('paste', (e) => {
      const fs = [...((e.clipboardData && e.clipboardData.files) || [])];
      if (fs.length && CH.chat && CH.chat.can_send) { e.preventDefault(); fs.slice(0, 10).forEach((f) => chatSendFile(f)); }
    });
    view.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); view.classList.add('drop'); } });
    view.addEventListener('dragleave', (e) => { if (e.target === view) view.classList.remove('drop'); });
    view.addEventListener('drop', (e) => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; view.classList.remove('drop'); if (fs.length) { e.preventDefault(); (async () => { for (const f of fs.slice(0, 10)) await chatSendFile(f); })(); } });
  }
}
/** "En alta in" düğmesi (yeni mesaj sayısıyla) */
function chatDownSync() {
  const s = $('#chScroll'); const b = $('#chDown'); if (!s || !b) return;
  const far = s.scrollHeight - s.scrollTop - s.clientHeight > 300;
  b.classList.toggle('hidden', !far);
  if (!far) CH.downN = 0;
  const n = $('#chDownN'); if (n) { n.textContent = CH.downN || ''; n.classList.toggle('hidden', !CH.downN); }
}
ACT['ch-down'] = () => { const s = $('#chScroll'); if (s) s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }); CH.downN = 0; };

/* Çoklu seçim */
function chatSelStart(m) { CH.sel = new Set([m.id]); chatSelBar(); chatDraw(); }
function chatSelToggle(id) {
  if (!CH.sel) return;
  if (CH.sel.has(id)) CH.sel.delete(id); else CH.sel.add(id);
  if (!CH.sel.size) { chatSelEnd(); return; }
  chatSelBar(); chatDraw();
}
function chatSelEnd() { CH.sel = null; const b = $('#chSelBar'); if (b) b.classList.add('hidden'); chatDraw(); }
function chatSelBar() {
  const b = $('#chSelBar'); if (!b) return;
  const ms = CH.msgs.filter((m) => CH.sel.has(m.id));
  const canDelAll = ms.every((m) => (m.mine || CH.chat.admin) && m.kind !== 'call');
  b.classList.remove('hidden');
  setHTML(b, html`<button class="btn ghost icon sm" data-act="ch-sel-end" aria-label="Seçimi bitir">${icon('x', 'sm')}</button><b class="grow">${ms.length} seçildi</b>
    <button class="btn ghost icon sm" data-act="ch-sel" data-o="star" aria-label="Yıldızla" title="Yıldızla">${icon('star', 'sm')}</button>
    <button class="btn ghost icon sm" data-act="ch-sel" data-o="copy" aria-label="Kopyala" title="Kopyala">${icon('copy', 'sm')}</button>
    <button class="btn ghost icon sm" data-act="ch-sel" data-o="fwd" aria-label="İlet" title="İlet">${icon('forward', 'sm')}</button>
    <button class="btn ghost icon sm" data-act="ch-sel" data-o="hide" aria-label="Benden sil" title="Benden sil">${icon('eyeOff', 'sm')}</button>
    ${canDelAll ? html`<button class="btn ghost icon sm danger" data-act="ch-sel" data-o="del" aria-label="Herkesten sil" title="Herkesten sil">${icon('trash', 'sm')}</button>` : ''}`);
}
ACT['ch-sel-end'] = () => chatSelEnd();
ACT['ch-sel'] = async (el) => {
  const ms = CH.msgs.filter((m) => CH.sel && CH.sel.has(m.id) && !m.deleted);
  const o = el.dataset.o;
  try {
    if (o === 'star') { const on = ms.some((m) => !m.star); for (const m of ms) { await api('chat.star', { id: m.id, on }); m.star = on; } toast(on ? 'Yıldızlandı ⭐' : 'Yıldızlar kaldırıldı'); }
    else if (o === 'copy') { const t = ms.map((m) => `[${m.at.slice(0, 16)}] ${m.name}: ${m.body || (m.file ? m.file.name : '')}`).join('\n'); toast((await copyText(t)) ? 'Kopyalandı' : 'Kopyalanamadı'); }
    else if (o === 'fwd') { const fwd = ms.filter((m) => !['poll', 'call', 'system'].includes(m.kind) && !m.once); if (fwd.length) { chatForwardMany(fwd); } return; }
    else if (o === 'hide') { for (const m of ms) await api('chat.hide', { id: m.id }); CH.msgs = CH.msgs.filter((m) => !CH.sel.has(m.id)); toast('Sizden silindi'); }
    else if (o === 'del') {
      if (!(await confirmDialog({ title: ms.length + ' mesaj herkesten silinsin mi?', ok: 'Sil', danger: true }))) return;
      for (const m of ms) { await api('chat.delete', { id: m.id }); m.deleted = true; m.body = ''; delete m.file; }
    }
  } catch (e) { toast(e.message, 'err'); }
  chatSelEnd();
};
async function chatForwardMany(ms) {
  let r;
  try { r = await api('chat.list'); } catch (e) { toast(e.message, 'err'); return; }
  const md = openModal({ title: ms.length + ' mesajı ilet', body: html`<div class="card"><div class="list">${r.items.filter((c) => c.id !== CH.id).map((c) => html`<label class="list-row"><input type="checkbox" value="${c.id}"><span class="grow">${c.name}</span></label>`)}</div></div>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-go>İlet</button>` });
  md.el.querySelector('[data-go]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const to = $$('input:checked', md.el).map((i) => +i.value);
    if (!to.length) { toast('Sohbet seçin', 'err'); return; }
    try { for (const c of to) for (const m of ms) await api('chat.forward', { id: m.id, to: c }); md.close(); chatSelEnd(); toast('İletildi'); } catch (e) { toast(e.message, 'err'); }
  }));
}
/** Grup mesajına özelden yanıt: birebir sohbeti aç, alıntıyı taslağa koy */
async function chatReplyPrivate(m) {
  try {
    const d = await api('chat.direct', { tk: m.tk, uid: m.uid });
    const q = (m.body || (m.file ? m.file.name : '')).slice(0, 120);
    chatDraftSave(d.id, `“${q}” (${CH.chat.name}) — `);
    location.hash = '#/mesaj/' + d.id;
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- Taslaklar (bu cihazda) ---------------- */
function chatDraftLoad(id) { try { return localStorage.getItem('nm-draft-' + id) || ''; } catch (e) { return ''; } }
function chatDraftSave(id, v) { try { if (v && v.trim()) localStorage.setItem('nm-draft-' + id, v.slice(0, 4000)); else localStorage.removeItem('nm-draft-' + id); } catch (e) { /* */ } }

/* ---------------- Ekle: galeri, kamera, belge, tek seferlik, konum, kişi, anket ---------------- */
ACT['ch-attach'] = () => {
  const opts = [['gallery', 'image', 'Fotoğraf ve video', 'teal'], ['cam', 'camera', 'Kamera', 'rose'], ['doc', 'file', 'Belge', 'indigo'], ['once', 'once', 'Tek seferlik fotoğraf/video', 'amber'],
    ['loc', 'mapPin', 'Konum', 'emerald'], ['contact', 'contact', 'Kişi', 'sky'], ['poll', 'chart', 'Anket', 'violet']];
  const md = openModal({ title: 'Ekle', size: 'narrow', body: html`<div class="ch-attgrid">${opts.map(([o, ic, l, tone]) => html`<button type="button" data-o="${o === 'doc' ? 'file' : o}"><span class="tone-${tone}">${icon(ic)}</span><span>${l}</span></button>`)}</div>
    <p class="tiny faint" style="margin-top:10px">${icon('lock', 'sm')} Hasta adı ve T.C. kimlik numarası paylaşmayın.</p>` });
  md.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-o]'); if (!b) return;
    md.close();
    const o = b.dataset.o; const f = $('#chFile');
    if (o === 'gallery' || o === 'once') { CH.onceNext = o === 'once'; f.accept = 'image/*,video/*'; f.click(); }
    else if (o === 'file') { CH.onceNext = false; f.accept = ''; f.click(); }
    else if (o === 'cam') ACT['ch-cam']();
    else if (o === 'loc') chatShareLocation();
    else if (o === 'contact') chatShareContact();
    else if (o === 'poll') chatPollModal();
  });
};
/** Kamera: telefonda yerleşik kamera uygulaması, bilgisayarda tarayıcı içinden çekim */
ACT['ch-cam'] = () => {
  if (matchMedia('(pointer: coarse)').matches) {
    const md = openModal({ title: 'Kamera', size: 'narrow', body: html`<div class="ch-attgrid"><button type="button" data-c="image"><span class="tone-rose">${icon('camera')}</span><span>Fotoğraf çek</span></button><button type="button" data-c="video"><span class="tone-violet">${icon('video')}</span><span>Video çek</span></button></div>` });
    md.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-c]'); if (!b) return;
      md.close();
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = b.dataset.c + '/*'; inp.setAttribute('capture', 'environment');
      inp.addEventListener('change', () => { const f = inp.files[0]; if (f) chatSendFile(f); });
      inp.click();
    });
    return;
  }
  chatCamModal();
};
async function chatCamModal() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Bu tarayıcı kamerayı desteklemiyor', 'err'); return; }
  let facing = 'user'; let stream = null; let rec = null; let chunks = []; let t0 = 0; let tick = 0;
  const md = openModal({ title: 'Kamera', size: 'wide', body: html`<div class="ch-cam"><video id="camV" autoplay playsinline muted></video><div class="ch-camrec hidden" id="camRec"></div></div>`,
    foot: html`<button class="btn" data-k="flip">${icon('history', 'sm')}Kamerayı çevir</button><button class="btn primary" data-k="shot">${icon('camera', 'sm')}Fotoğraf çek</button><button class="btn" data-k="rec">${icon('video', 'sm')}<span>Video kaydet</span></button>`,
    onClose: () => { clearInterval(tick); if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } if (stream) stream.getTracks().forEach((x) => x.stop()); } });
  const v = $('#camV', md.el);
  const start = async () => {
    if (stream) stream.getTracks().forEach((x) => x.stop());
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: true }); }
    catch (e) { try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch (e2) { toast('Kameraya izin verilmedi. Tarayıcı ayarlarından bu siteye kamera izni verin.', 'err'); md.close(); return; } }
    v.srcObject = stream;
  };
  await start();
  md.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b || !stream) return;
    if (b.dataset.k === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; start(); }
    if (b.dataset.k === 'shot') {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
      md.close();
      if (blob) chatSendFile(new File([blob], 'foto-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
    }
    if (b.dataset.k === 'rec') {
      if (rec && rec.state === 'recording') { rec.stop(); return; }
      const type = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find((x) => window.MediaRecorder && MediaRecorder.isTypeSupported(x)) || '';
      try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) { toast('Bu tarayıcı video kaydedemiyor', 'err'); return; }
      chunks = []; t0 = Date.now();
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(tick);
        const mt = (rec.mimeType || type || 'video/webm').split(';')[0];
        const dur = Math.round((Date.now() - t0) / 1000);
        md.close();
        if (chunks.length) chatSendFile(new File(chunks, 'video-' + Date.now() + (/mp4/.test(mt) ? '.mp4' : '.webm'), { type: mt }), { dur });
      };
      rec.start(1000);
      b.querySelector('span').textContent = 'Durdur ve gönder';
      const box = $('#camRec', md.el); box.classList.remove('hidden');
      tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); box.textContent = '● ' + fmtDur(s); if (s >= 180) rec.stop(); }, 300);
    }
  });
}
function chatShareLocation() {
  if (!navigator.geolocation) { toast('Bu cihaz konum vermiyor', 'err'); return; }
  toast('Konum alınıyor…');
  navigator.geolocation.getCurrentPosition(async (p) => {
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    const md = openModal({ title: 'Konumu gönder', size: 'narrow', body: html`<div class="stack"><div class="ch-locmap">${icon('mapPin')}<span>${lat.toFixed(5)}, ${lng.toFixed(5)} · ± ${Math.round(accuracy)} m</span></div>
      <div class="field"><label>Açıklama (isteğe bağlı)</label><input class="input" id="locL" maxlength="120" placeholder="ör. Acil girişi, B blok otopark"></div></div>`,
      foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-go>Gönder</button>` });
    md.el.querySelector('[data-go]').addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
      try { const r = await api('chat.share', { id: CH.id, type: 'location', lat, lng, acc: Math.round(accuracy), label: $('#locL', md.el).value.trim() }); md.close(); chatAdd([r.msg]); chatScrollEnd(true); } catch (e) { toast(e.message, 'err'); }
    }));
  }, (e) => toast(e.code === 1 ? 'Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni verin.' : 'Konum alınamadı', 'err'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}
async function chatShareContact() {
  let r;
  try { r = await api('chat.contacts'); } catch (e) { toast(e.message, 'err'); return; }
  const md = openModal({ title: 'Kişi paylaş', body: html`<input class="input" id="ctQ" placeholder="Ara…" style="margin-bottom:8px"><div class="card"><div class="list" id="ctL"></div></div>` });
  const draw = (q) => setHTML($('#ctL', md.el), html`${r.items.filter((c) => !q || avKey(c.name).includes(avKey(q)) || (c.title && avKey(c.title).includes(avKey(q)))).slice(0, 80).map((c) => html`<button type="button" class="list-row" data-i="${r.items.indexOf(c)}" style="width:100%;border:0;background:none;text-align:left">${avatar(c.name, 'sm')}<span class="grow" style="min-width:0"><span class="lr-t">${c.name}</span><span class="lr-s">${[c.title, c.phone].filter(Boolean).join(' · ') || 'portal kullanıcısı'}</span></span></button>`)}`);
  draw('');
  $('#ctQ', md.el).addEventListener('input', (e) => draw(e.target.value));
  md.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-i]'); if (!b) return;
    const c = r.items[+b.dataset.i];
    try { const x = await api('chat.share', { id: CH.id, type: 'contact', name: c.name, phone: c.phone, title: c.title, ref_tk: c.tk || '', ref_uid: c.uid || 0 }); md.close(); chatAdd([x.msg]); chatScrollEnd(true); } catch (e) { toast(e.message, 'err'); }
  });
}
