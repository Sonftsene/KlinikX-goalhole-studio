/* dupcii — bağlantılar ve paylaşma (4.20)
   - Sayfa başlıklarının yanında "Paylaş": bağlantıyı kopyala, telefonun paylaş menüsü, sohbette paylaş
   - Metinlerde kelimeye bağlantı: [metin](#/sayfa) ya da [metin](https://…); düzenleyicilerde "Bağlantı ekle"
   - Site içi bağlantılar aynı sekmede açılır; sohbette sayfa adıyla görünür
   - Herhangi bir dosyayı / görseli sohbete gönderme (shareToChat) */
'use strict';

/** Bu sayfanın (ya da verilen #/… yolunun) herkesin açabileceği tam adresi; çok birimlide birim anahtarıyla */
function pageLink(hash) {
  const h = hash || location.hash || '#/';
  return location.origin + location.pathname + (S.tenant && S.tenant.b ? '?b=' + encodeURIComponent(S.tenant.b) : '') + h;
}
/** Tam adres bu sitenin, bu birimin bir sayfası mı? → '#/…' ya da null */
function internalHash(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin || u.pathname !== location.pathname || !/^#\//.test(u.hash)) return null;
    if ((u.searchParams.get('b') || '') !== ((S.tenant && S.tenant.b) || '')) return null;
    return u.hash;
  } catch (e) { return null; }
}
/**
 * Kişinin görebildiği site içi sayfalar: [{href, label, group}]
 * Yan menü (bölüm başlıklarıyla) + Nöbet sekmeleri (Takvimim, Kim nöbette, Taraf, İstekler, İlanlar, Ekstra nöbet, Çizelge, Excel liste) + Hesabım sekmeleri.
 */
function sitePages() {
  const seen = new Set();
  const out = [];
  const add = (href, label, group) => { label = String(label || '').trim(); if (href && label && !seen.has(href)) { seen.add(href); out.push({ href, label, group }); } };
  let group = 'Genel';
  const sb = $('#sidebar');
  if (sb) [...sb.children].forEach((el) => {
    if (el.classList.contains('nav-sec')) { group = el.textContent.trim() || group; return; }
    if (el.matches('a.nav-item[href^="#/"]')) add(el.getAttribute('href'), (el.querySelector('.grow') || el).textContent.replace(/\s*\d+\+?$/, ''), group);
  });
  if (typeof modOn === 'function' && modOn('nobet')) {
    const g = 'Nöbet';
    add('#/nobetim', uiL('#/nobetim', 'Takvimim'), g);
    add('#/rehber', uiL('#/rehber', 'Kim nöbette'), g);
    if (modOn('taraf')) add('#/taraf', uiL('#/taraf', 'Taraf listesi'), g);
    (NM_EXT.hubTabs || []).filter((x) => modOn(x.mod) && (!x.pub || canManage(x.mod))).forEach((x) => add(x.href, uiL(x.href, x.label), g));
    add('#/nobet', uiL('#/nobet', 'Excel liste'), g);
  }
  if (typeof profTabs === 'function') profTabs().forEach(([k, l]) => add('#/profil/' + k, l, 'Hesabım'));
  // Grupları menüdeki ilk görünüş sırasıyla bir arada tut
  const order = [];
  out.forEach((p) => { if (!order.includes(p.group)) order.push(p.group); });
  return order.flatMap((g) => out.filter((p) => p.group === g));
}
/** <select> için gruplu seçenekler */
function pageOptions(selected) {
  const pages = sitePages();
  const groups = [];
  pages.forEach((p) => { if (!groups.includes(p.group)) groups.push(p.group); });
  return html`${groups.map((g) => html`<optgroup label="${g}">${pages.filter((p) => p.group === g).map((p) => html`<option value="${p.href}" ${p.href === selected ? raw('selected') : ''}>${p.label}</option>`)}</optgroup>`)}`;
}
/** #/… yolunun okunur adı */
function pageTitleOf(hash) {
  const h = String(hash || '#/');
  const exact = sitePages().find((p) => p.href === h);
  if (exact) return exact.label;
  if (/^#\/p\/\d+/.test(h)) return 'Gönderi';
  const seg = h.replace(/^#\//, '').split('/')[0];
  const pref = sitePages().find((p) => p.href.replace(/^#\//, '').split('/')[0] === seg && seg);
  return pref ? pref.label : 'Portal sayfası';
}
/** Açık sayfanın başlığı */
function currentPageTitle() {
  const h1 = $('#view .page-head h1');
  const t = h1 ? [...h1.childNodes].filter((n) => !(n.classList && n.classList.contains('pg-share'))).map((n) => n.textContent).join('').trim() : '';
  return t || pageTitleOf(location.hash);
}

/* ---------------- Metinde bağlantı: [metin](adres) + düz adresler ---------------- */
const LINK_OK = /^(#\/[^\s<>"]*|https?:\/\/[^\s<>"]+|tel:[0-9+ ]{3,20}|mailto:[^\s<>"]+@[^\s<>"]+)$/i;
/** Güvenli bağlantılı HTML (linkify yerine geçer): metin kaçırılır, yalnız izinli adresler bağlantı olur */
function richText(text) {
  const src = String(text || '');
  const parts = [];
  const re = /\[([^\]\n]{1,200})\]\(([^)\s]{1,600})\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
  let last = 0, mm;
  while ((mm = re.exec(src))) {
    parts.push(esc(src.slice(last, mm.index)));
    if (mm[1] !== undefined) {
      const url = mm[2];
      if (!LINK_OK.test(url)) parts.push(esc(mm[0]));
      else {
        const int = /^#\//.test(url) ? url : internalHash(url);
        parts.push(int ? `<a href="${esc(int)}" class="in-link">${esc(mm[1])}</a>` : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(mm[1])}</a>`);
      }
    } else {
      const url = mm[3]; const int = internalHash(url);
      parts.push(int ? `<a href="${esc(int)}" class="in-link">${esc(pageTitleOf(int))}</a>` : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`);
    }
    last = re.lastIndex;
  }
  parts.push(esc(src.slice(last)));
  return parts.join('');
}
// Eski linkify (gönderi metni, misafir görünümü) artık bağlantılı kelimeleri de tanır
linkify = richText; // eslint-disable-line no-global-assign

/** Site içi tam adresle açılan bağlantı aynı sekmede, uygulamanın içinde açılır */
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href]');
  if (!a || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
  const href = a.getAttribute('href');
  if (/^#\//.test(href)) return;
  const h = internalHash(href);
  if (!h) return;
  ev.preventDefault();
  location.hash = h;
}, true);

/* ---------------- Düzenleyicide "Bağlantı ekle" ---------------- */
/** Bir metin alanının altına bağlantı ekleme düğmesi koyar: linkTool('name') */
function linkTool(field) {
  return html`<button type="button" class="btn sm ghost lnk-btn" data-act="lnk-add" data-f="${field}">${icon('link', 'sm')}<span>Bağlantı ekle</span></button>`;
}
ACT['lnk-add'] = (el) => {
  const form = el.closest('form') || el.closest('.modal') || document;
  const ta = form.querySelector(`[name="${el.dataset.f}"]`);
  if (!ta) return;
  const s0 = ta.selectionStart || 0, s1 = ta.selectionEnd || 0;
  const sel = ta.value.slice(s0, s1).trim();
  const m = openModal({ title: 'Bağlantı ekle', size: 'narrow', body: html`<form class="stack" id="lnkF">
      <div class="field"><label>Bağlantı yazısı</label><input class="input" name="t" value="${sel}" maxlength="200" required placeholder="Örn: yemek listesine bakın"></div>
      <div class="seg" id="lnkK"><button type="button" class="on" data-k="in">Site içi sayfa</button><button type="button" data-k="out">Web adresi</button></div>
      <div class="field" id="lnkIn"><label>Sayfa</label><select class="select" name="p"><option value="${location.hash || '#/'}">Şu an açık sayfa (${currentPageTitle()})</option>${pageOptions(location.hash)}</select></div>
      <div class="field hidden" id="lnkOut"><label>Adres</label><input class="input" name="u" placeholder="https://…" inputmode="url"></div>
      <p class="tiny faint">Metinde <b>[yazı](adres)</b> olarak görünür; okuyanlara yalnız yazı bağlantı olarak çıkar.</p>
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="lnkF" type="submit">Ekle</button>` });
  let kind = 'in';
  $('#lnkK', m.el).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    kind = b.dataset.k;
    $$('#lnkK button', m.el).forEach((x) => x.classList.toggle('on', x === b));
    $('#lnkIn', m.el).classList.toggle('hidden', kind !== 'in'); $('#lnkOut', m.el).classList.toggle('hidden', kind !== 'out');
  });
  const f = $('#lnkF', m.el);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async (d) => {
      let url = kind === 'in' ? d.p : d.u.trim();
      if (kind === 'out' && /^www\./i.test(url)) url = 'https://' + url;
      if (!LINK_OK.test(url)) throw new Error('Adres https:// ile başlamalı');
      const txt = d.t.trim().replace(/[[\]]/g, '');
      if (!txt) throw new Error('Bağlantı yazısını girin');
      const md = `[${txt}](${url})`;
      ta.value = ta.value.slice(0, s0) + md + ta.value.slice(s1);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      m.close(); ta.focus(); ta.setSelectionRange(s0 + md.length, s0 + md.length);
    });
  });
};

/* ---------------- Sayfa paylaşma ---------------- */
/** Her sayfa başlığına "Paylaş" düğmesi (sayfa çizildikçe) */
const pgShareObs = new MutationObserver(() => {
  const head = $('#view .page-head');
  if (!head || head.querySelector('.pg-share') || !S.me || window.NM_DEMO_API) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn sm ghost pg-share'; b.dataset.act = 'pg-share'; b.title = 'Bu sayfanın bağlantısını paylaş';
  b.innerHTML = fmtVal(html`${icon('link', 'sm')}<span>Paylaş</span>`);
  const h1 = head.querySelector('h1');
  if (h1) { h1.classList.add('pg-h1'); h1.appendChild(b); } else head.appendChild(b);
});
document.addEventListener('DOMContentLoaded', () => { const v = document.getElementById('app'); if (v) pgShareObs.observe(v, { childList: true, subtree: true }); });
if (document.readyState !== 'loading') { const v = document.getElementById('app'); if (v) pgShareObs.observe(v, { childList: true, subtree: true }); }

ACT['pg-share'] = () => shareLink(pageLink(), currentPageTitle());
/** Bağlantı paylaşma penceresi */
function shareLink(url, title) {
  const m = openModal({ title: 'Bağlantıyı paylaş', size: 'narrow', body: html`<div class="stack">
      <div><b>${title}</b><div class="tiny faint">Bağlantıyı açan kişi giriş yapmışsa doğrudan bu sayfaya gelir; giriş yapmamışsa önce giriş ekranı açılır.</div></div>
      <div class="row" style="gap:6px"><input class="input grow sel" readonly value="${url}" id="shUrl"><button class="btn" data-sh="copy" title="Kopyala">${icon('copy', 'sm')}</button></div>
      <div class="sh-acts">
        <button class="btn" data-sh="copy">${icon('copy', 'sm')}<span>Bağlantıyı kopyala</span></button>
        ${navigator.share ? html`<button class="btn" data-sh="share">${icon('send', 'sm')}<span>Paylaş…</span></button>` : ''}
        ${modOn('mesaj') && S.hosp && !(S.sa && S.sa.in) ? html`<button class="btn primary" data-sh="chat">${icon('chat', 'sm')}<span>Sohbette paylaş</span></button>` : ''}
        <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + '\n' + url)}">${icon('chat', 'sm')}<span>WhatsApp</span></a>
      </div></div>` });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-sh]'); if (!b) return;
    if (b.dataset.sh === 'copy') { toast((await copyText(url)) ? 'Bağlantı kopyalandı' : url); return; }
    if (b.dataset.sh === 'share') { try { await navigator.share({ title, text: title, url }); } catch (e) { /* vazgeçti */ } return; }
    if (b.dataset.sh === 'chat') { m.close(); shareToChat({ text: `${title}\n${url}` }); }
  });
}

/** Sohbet seç ve gönder: metin ve/veya dosya (görsel) */
async function shareToChat({ text = '', file = null, title = 'Sohbette paylaş' } = {}) {
  // 4.28: ortak alıcı seçici (sohbetler + aranabilir tüm kişiler, çoklu seçim)
  if (typeof chatPickTargets === 'function') {
    const top = html`${file && /^image\//.test(file.type) ? html`<img class="sh-prev" src="${URL.createObjectURL(file)}" alt="">` : ''}
      <div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" id="shNote" maxlength="500" value="${file ? text : ''}" placeholder="Mesaja eklenecek yazı"></div>`;
    const r = await chatPickTargets({ title, top, ok: 'Gönder' });
    if (!r) return;
    const note = ($('#shNote', r.el) || {}).value ? $('#shNote', r.el).value.trim() : '';
    try {
      let att = null;
      if (file) att = await uploadFile(file, () => {});
      for (const id of r.ids) {
        if (att) await api('chat.send', { id, att_id: att.id, body: note });
        else await api('chat.send', { id, body: (note ? note + '\n' : '') + text });
      }
      r.close();
      toast(r.names.length > 1 ? `${r.names.length} sohbete gönderildi` : `${r.names[0]} sohbetine gönderildi`);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  let r;
  try { r = await api('chat.list'); } catch (e) { toast(e.message, 'err'); return; }
  const items = (r.items || []).filter((c) => !c.archived || true);
  if (!items.length) { toast('Henüz sohbetiniz yok', 'err'); return; }
  const m = openModal({ title, size: 'narrow', body: html`<div class="stack">
      ${file && /^image\//.test(file.type) ? html`<img class="sh-prev" src="${URL.createObjectURL(file)}" alt="">` : ''}
      <div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" id="shNote" maxlength="500" value="${file ? text : ''}" placeholder="Mesaja eklenecek yazı"></div>
      <div class="search">${icon('search')}<input class="input" id="shQ" placeholder="Sohbet ara" autocomplete="off"></div>
      <div class="card"><div class="list sh-list">${items.map((c) => html`<button type="button" class="list-row" data-c="${c.id}" data-n="${c.name}" style="width:100%;border:0;background:none;text-align:left">${icon(c.kind === 'unit' ? 'users' : c.kind === 'direct' ? 'user' : 'chat', 'sm')}<span class="grow ellipsis">${c.name}</span>${icon('send', 'sm')}</button>`)}</div></div></div>` });
  $('#shQ', m.el).addEventListener('input', (ev) => {
    const q = avKey(ev.target.value);
    $$('.sh-list [data-c]', m.el).forEach((b) => { b.style.display = !q || avKey(b.dataset.n).includes(q) ? '' : 'none'; });
  });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-c]'); if (!b || b.disabled) return;
    $$('.sh-list [data-c]', m.el).forEach((x) => { x.disabled = true; });
    const note = file ? $('#shNote', m.el).value.trim() : '';
    try {
      if (file) {
        const a = await uploadFile(file, () => {});
        await api('chat.send', { id: +b.dataset.c, att_id: a.id, body: note });
      } else {
        const extra = $('#shNote', m.el).value.trim();
        await api('chat.send', { id: +b.dataset.c, body: (extra ? extra + '\n' : '') + text });
      }
      m.close(); toast(`${b.dataset.n} sohbetine gönderildi`);
    } catch (e) { toast(e.message, 'err'); $$('.sh-list [data-c]', m.el).forEach((x) => { x.disabled = false; }); }
  });
}
