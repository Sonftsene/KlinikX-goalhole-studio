/* dupcii — destek (4.23)
 * Sorumlular (yönetici, yayıncı) ve üyeler için ayrı konular; talepler sistem yöneticisine ya da (birim konuları) birim sorumlusuna gider.
 * Sayfa: #/destek (taleplerim + birim talepleri), #/destek/yeni, #/destek/<id>, #/destek/birim/<id>, #/destek/izle/<anahtar> (giriş yapamayan).
 * Sistem yönetimi: "Destek" sekmesi (spSaRender). */
'use strict';

const SP = { cfg: null, tab: 'mine', topic: null, write: false, file: null, from: '', fromTitle: '', lastErr: '', sa: { status: 'open', hosp: '', tkey: '', track: '', q: '' } };
window.addEventListener('error', (e) => { try { SP.lastErr = String((e && e.message) || '').slice(0, 280); } catch (x) { /* */ } });
window.addEventListener('unhandledrejection', (e) => { try { const r = e && e.reason; if (r && !(r instanceof ApiError)) SP.lastErr = String((r && r.message) || r || '').slice(0, 280); } catch (x) { /* */ } });

NM_EXT.notif.support = ['sky', 'help'];
NM_EXT.routes.destek = (view, r) => spRoute(view, r);
NM_EXT.nav.push({ sec: 'genel', href: '#/destek', icon: 'help', label: 'Destek', match: (r) => r[0] === 'destek', count: () => spCount(), visible: () => !!S.support });

function spCount() { const s = S.support || {}; return (s.mine || 0) + (s.inbox || 0); }
const SP_TOPIC_IC = { kurulum: 'sliders', liste: 'table', kullanici: 'users', abonelik: 'wallet', hata: 'alert', oneri: 'star', diger: 'chat', giris: 'key', nobet: 'calendar', birim: 'history', bildirim: 'bell' };
const SP_TRACK = { lead: ['Sorumlu', 'tone-violet'], user: ['Kullanıcı', 'tone-sky'], public: ['Giriş yapamayan', 'tone-amber'] };
const SP_ST_CLS = { open: 'warn', answered: 'info', closed: '' };

/** Üst çubuktaki "?" düğmesi (posts.js renderShell) */
function spTopBtn() {
  if (!S.support) return '';
  const n = spCount();
  return html`<button class="btn ghost icon sp-top" data-act="sp-open" aria-label="Destek" title="Destek" id="spTop">${icon('help')}${n ? html`<span class="sp-top-n">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
}
ACT['sp-open'] = () => {
  if (!/^#\/destek/.test(location.hash)) { SP.from = location.hash || '#/'; SP.fromTitle = typeof currentPageTitle === 'function' ? currentPageTitle() : ''; }
  location.hash = '#/destek';
};
ACT['sp-new'] = () => { SP.topic = null; SP.write = false; SP.file = null; location.hash = '#/destek/yeni'; };

/** Talebe eklenecek cihaz / sayfa bilgisi */
function spCtx() {
  let app = 'tarayıcı';
  try { if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) app = 'ana ekran uygulaması'; } catch (e) { /* */ }
  return { page: SP.from || '', title: SP.fromTitle || '', ua: navigator.userAgent, screen: `${screen.width}x${screen.height}`, app, err: SP.lastErr, net: navigator.onLine ? 'çevrimiçi' : 'çevrimdışı' };
}
function spDevice(ua) {
  ua = String(ua || '');
  const os = /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Bilinmeyen sistem';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'tarayıcı';
  return `${os} · ${br}`;
}

/** Görseli küçült (en uzun kenar 1600 px, JPEG) */
function spShrink(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Yalnız görsel (ekran görüntüsü) eklenebilir.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let q = 0.85; let d = cv.toDataURL('image/jpeg', q);
      while (d.length > 2600000 && q > 0.4) { q -= 0.15; d = cv.toDataURL('image/jpeg', q); }
      resolve(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel açılamadı.')); };
    img.src = url;
  });
}
function spAttachHtml(id) {
  return html`<div class="sp-att" id="${id}"><label class="btn sm">${icon('paperclip', 'sm')}<span>Ekran görüntüsü ekle</span><input type="file" accept="image/*" hidden data-change="sp-file" data-box="${id}"></label><span class="sp-att-prev"></span></div>`;
}
CHANGE['sp-file'] = async (el) => {
  const f = el.files && el.files[0];
  const box = document.getElementById(el.dataset.box);
  el.value = '';
  if (!f || !box) return;
  try {
    const d = await spShrink(f);
    SP.file = d;
    setHTML($('.sp-att-prev', box), html`<img src="${d}" alt="Ek"><button type="button" class="btn sm ghost" data-act="sp-file-x" data-box="${box.id}">${icon('x', 'sm')}Kaldır</button>`);
  } catch (e) { toast(e.message, 'err'); }
};
ACT['sp-file-x'] = (el) => { SP.file = null; const box = document.getElementById(el.dataset.box); if (box) setHTML($('.sp-att-prev', box), ''); };

/* ---------------- Sayfa ---------------- */

async function spRoute(view, r) {
  if (r[1] === 'izle' && r[2]) return spPublic(view, r[2]);
  if (!S.support) return setHTML(view, html`<div class="card empty"><h3>Destek</h3><p class="small">Destek bu hesapta kullanılamıyor.</p></div>`);
  if (!SP.cfg) { try { SP.cfg = await api('sp.cfg'); } catch (e) { return setHTML(view, html`<div class="card card-pad small">${e.message}</div>`); } }
  if (r[1] === 'yeni') return spNew(view);
  if (r[1] === 'birim' && r[2]) return spTicket(view, +r[2]);
  if (r[1] && /^\d+$/.test(r[1])) return spTicket(view, +r[1]);
  if (r[1] === 'birim') SP.tab = 'unit';
  return spList(view);
}

function spHead(sub, actions) {
  return html`<div class="page-head"><div><h1>Destek</h1><p>${sub}</p></div>${actions || ''}</div>`;
}

async function spList(view) {
  const C = SP.cfg;
  const tabs = C.handler ? html`<div class="seg" style="margin-bottom:14px"><button class="${SP.tab === 'mine' ? 'on' : ''}" data-act="sp-tab" data-t="mine">Taleplerim${S.support.mine ? html` <span class="count">${S.support.mine}</span>` : ''}</button>
    <button class="${SP.tab === 'unit' ? 'on' : ''}" data-act="sp-tab" data-t="unit">Birim talepleri${S.support.inbox ? html` <span class="count">${S.support.inbox}</span>` : ''}</button></div>` : '';
  setHTML(view, html`${spHead(C.track === 'lead' ? 'Sorumlu desteği: kurulum, listeler, kullanıcılar, abonelik ve hatalar için dupcii destek ekibine yazın.' : 'Sorununuzu yazın; birim konuları birim sorumlunuza, teknik konular dupcii destek ekibine gider.',
    C.cant ? '' : html`<button class="btn primary" data-act="sp-new">${icon('plus', 'sm')}<span>Yeni talep</span></button>`)}
    ${C.cant ? html`<div class="card card-pad small muted" style="margin-bottom:12px">${icon('info', 'sm')} ${C.cant}</div>` : ''}
    ${tabs}<div id="spBox"><div class="card card-pad"><div class="skel" style="height:16px"></div></div></div>`);
  const box = $('#spBox');
  try {
    if (SP.tab === 'unit' && C.handler) {
      const d = await api('sp.inbox', { filter: SP.unitFilter || '' });
      setHTML(box, html`<div class="seg sm" style="margin-bottom:10px"><button class="${!SP.unitFilter ? 'on' : ''}" data-act="sp-uf" data-f="">Açık</button><button class="${SP.unitFilter === 'closed' ? 'on' : ''}" data-act="sp-uf" data-f="closed">Kapanan</button></div>
        ${spRows(d.items, true, 'Birim sorumlusuna gelen açık talep yok. Üyeler “nöbetim görünmüyor”, “izin / istek / ilan” gibi birim konularında yazınca burada görürsünüz.')}`);
    } else {
      const d = await api('sp.mine');
      setHTML(box, spRows(d.items, false, C.cant ? 'Talep yok.' : 'Henüz destek talebiniz yok. Bir sorun yaşarsanız “Yeni talep” ile yazın; önce sık sorulan çözümler gösterilir.'));
    }
  } catch (e) { setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); }
}
ACT['sp-tab'] = (el) => { SP.tab = el.dataset.t; spList($('#view')); };
ACT['sp-uf'] = (el) => { SP.unitFilter = el.dataset.f; spList($('#view')); };

function spRows(items, unit, empty) {
  if (!items.length) return html`<div class="card empty"><div class="e-ico">${icon('help', 'lg')}</div><p class="small">${empty}</p></div>`;
  return html`<div class="card"><div class="list">${items.map((t) => {
    const un = unit ? t.un_unit : t.un_user;
    return html`<a class="list-row sp-row ${un ? 'unread' : ''}" href="#/destek/${unit ? 'birim/' : ''}${t.id}">
      <span class="sp-ic">${icon(SP_TOPIC_IC[t.topic] || 'help', 'sm')}</span>
      <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${un ? html`<span class="sp-dot"></span>` : ''}${t.subject}</div>
        <div class="lr-s">${unit ? html`<b>${t.user_name}</b> · ` : ''}${t.topic_name} · ${spRouteText(t)} · ${fmtRel(t.updated_at)}</div></div>
      <span class="badge ${SP_ST_CLS[t.status] || ''}">${t.status_name}</span></a>`;
  })}</div></div>`;
}
function spRouteText(t) { return t.route === 'unit' ? 'birim sorumlusu' : t.forwarded ? 'destek ekibine iletildi' : 'dupcii destek'; }

/* ---------------- Yeni talep ---------------- */

function spNew(view) {
  const C = SP.cfg;
  if (C.cant) { location.hash = '#/destek'; return; }
  const tp = C.topics.find((x) => x.key === SP.topic);
  const head = spHead(C.track === 'lead' ? html`<span class="badge tone-violet">Sorumlu desteği</span> Yönetici ve yayıncılar için` : html`<span class="badge tone-sky">Kullanıcı desteği</span>`,
    html`<a class="btn" href="#/destek">${icon('x', 'sm')}<span>Vazgeç</span></a>`);
  if (!tp) {
    setHTML(view, html`${head}<div class="card card-pad stack">
      <h3 class="ph">Hangi konuda yardım istiyorsunuz?</h3>
      <div class="sp-topics">${C.topics.map((x) => html`<button class="sp-topic" data-act="sp-topic" data-k="${x.key}"><span class="sp-ic">${icon(SP_TOPIC_IC[x.key] || 'help')}</span>
        <span class="grow"><b>${x.name}</b><span class="tiny faint">${x.route === 'unit' ? 'Birim sorumlunuza gider' : 'dupcii destek ekibine gider'}</span></span>${icon('chevR', 'sm')}</button>`)}</div></div>`);
    return;
  }
  const showForm = SP.write || !tp.tips.length;
  setHTML(view, html`${head}<div class="card card-pad stack sp-new">
    <div class="row" style="gap:10px"><span class="sp-ic">${icon(SP_TOPIC_IC[tp.key] || 'help')}</span><div class="grow"><b>${tp.name}</b><div class="tiny faint">${tp.route === 'unit' ? 'Bu talep birim sorumlunuza gider; çözemezse dupcii destek ekibine iletir.' : 'Bu talep dupcii destek ekibine (sistem yöneticisi) gider.'}</div></div>
      <button class="btn sm ghost" data-act="sp-topic" data-k="">Konuyu değiştir</button></div>
    ${tp.tips.length ? html`<div class="sp-tips"><div class="tiny faint" style="margin-bottom:6px">Önce bunlara bakın, belki hemen çözülür:</div>${tp.tips.map((x) => html`<details class="sp-tip"><summary>${x.q}</summary><p class="small">${x.a}</p>${x.link ? html`<a class="btn sm" href="${x.link}">${icon('chevR', 'sm')}Sayfaya git</a>` : ''}</details>`)}
      ${showForm ? '' : html`<div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn" data-act="sp-solved">${icon('check', 'sm')}Sorunum çözüldü</button><button class="btn primary" data-act="sp-write">${icon('chat', 'sm')}Yine de yazmak istiyorum</button></div>`}</div>` : ''}
    ${showForm ? html`<form class="stack" data-form="sp-create" id="spF">
      <div class="field"><label>Başlık</label><input class="input" name="subject" maxlength="160" required placeholder="${C.track === 'lead' ? 'Örn: Aralık listesi yüklenince 3 kişi görünmüyor' : 'Örn: Takvimimde aralık nöbetlerim yok'}"></div>
      <div class="field"><label>Ne oldu? Ne yapmak istiyordunuz?</label><textarea class="input" name="body" rows="6" maxlength="4000" required placeholder="Adım adım yazın: hangi sayfada, neye tıkladınız, ne bekliyordunuz, ne oldu?"></textarea></div>
      ${spAttachHtml('spAtt')}
      <p class="tiny sp-kvkk">${icon('shield', 'sm')} Hasta adı, T.C. kimlik numarası gibi kişisel bilgi yazmayın; ekran görüntüsünde hasta bilgisi varsa göndermeyin.</p>
      <details class="sp-ctx-prev"><summary class="tiny">Talebe kendiliğinden eklenecek bilgiler</summary>${spCtxGrid({ hosp: C.who.hospital, unit: C.who.unit, name: C.who.name, role: C.who.role, page: SP.fromTitle ? `${SP.fromTitle} (${SP.from})` : SP.from, v: BOOT.v, dev: spDevice(navigator.userAgent) })}</details>
      <div class="form-error hidden" data-err></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">${icon('send', 'sm')}Gönder</button></div></form>` : ''}</div>`);
  const f = $('#spF [name=subject]'); if (f) f.focus();
}
ACT['sp-topic'] = (el) => { SP.topic = el.dataset.k || null; SP.write = false; SP.file = null; spNew($('#view')); window.scrollTo(0, 0); };
ACT['sp-write'] = () => { SP.write = true; spNew($('#view')); };
ACT['sp-solved'] = () => { toast('Sevindik! Başka bir sorun olursa yine yazın.'); location.hash = SP.from && !/^#\/destek/.test(SP.from) ? SP.from : '#/'; };
FORMS['sp-create'] = (f) => submitForm(f, async (d) => {
  const r = await api('sp.create', { topic: SP.topic, subject: d.subject, body: d.body, file: SP.file || '', ctx: spCtx() });
  SP.file = null; SP.topic = null; SP.write = false;
  toast(r.route === 'unit' ? 'Talebiniz birim sorumlunuza gönderildi' : 'Talebiniz destek ekibine gönderildi');
  location.hash = '#/destek/' + r.ticket.id;
});

function spCtxGrid(c) {
  const rows = [['Hastane', c.hosp], ['Birim', c.unit], ['Kişi', c.name], ['E-posta', c.email], ['Rol', c.role], ['Özel rol', c.role_name], ['Yönettiği modüller', c.manage], ['Göremediği modüller', c.off],
    ['Sayfa', c.page], ['Sürüm', c.v], ['Cihaz', c.dev], ['Uygulama', c.app], ['Ekran', c.screen], ['Bağlantı', c.net], ['Son hata', c.err]].filter((x) => x[1]);
  return html`<dl class="sp-ctx">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
}

/* ---------------- Talep ---------------- */

function spThread(msgs, opts = {}) {
  return html`<div class="sp-thread">${msgs.map((m) => m.who === 'sys' ? html`<div class="sp-sys">${m.body} · ${fmtRel(m.at)}</div>`
    : html`<div class="sp-msg ${m.who === opts.me ? 'me' : ''} ${m.internal ? 'internal' : ''} who-${m.who}">
      <div class="sp-msg-h"><b>${m.name || (m.who === 'sa' ? 'dupcii destek' : '')}</b>${m.internal ? html` <span class="badge warn">İç not · kişi görmez</span>` : ''} <span class="tiny faint">${fmtDateTime(m.at)}</span></div>
      <div class="sp-msg-b">${m.body}</div>
      ${m.file ? html`<a href="api.php?action=sp.file&id=${m.file}${opts.token ? '&t=' + opts.token : ''}" target="_blank" rel="noopener" class="sp-img"><img src="api.php?action=sp.file&id=${m.file}${opts.token ? '&t=' + opts.token : ''}" alt="Ekran görüntüsü" loading="lazy"></a>` : ''}</div>`)}</div>`;
}

async function spTicket(view, id) {
  setHTML(view, html`${spHead('Talep')}<div class="card card-pad"><div class="skel" style="height:16px"></div></div>`);
  let d;
  try { d = await api('sp.get', { id }); } catch (e) { return setHTML(view, html`${spHead('Talep')}<div class="card card-pad small">${e.message}</div><a class="btn" href="#/destek" style="margin-top:10px">Taleplere dön</a>`); }
  const t = d.ticket; const can = d.can;
  const handler = !t.mine;
  // rozetler güncellensin
  if (S.support) { if (t.mine && t.un_user) S.support.mine = Math.max(0, (S.support.mine || 0) - 1); if (handler && t.un_unit) S.support.inbox = Math.max(0, (S.support.inbox || 0) - 1); spRefreshBadges(); }
  setHTML(view, html`<div class="page-head"><div><h1 class="sp-h1">${t.subject}</h1><p><span class="badge ${SP_ST_CLS[t.status] || ''}">${t.status_name}</span> ${t.topic_name} · ${spRouteText(t)} · ${fmtDate(t.created_at)}</p></div>
      <a class="btn" href="#/destek${handler ? '/birim' : ''}">${icon('chevL', 'sm')}<span>Talepler</span></a></div>
    ${handler ? html`<details class="card card-pad sp-ctx-card" open><summary><b>${t.user_name}</b> · ${t.role === 'admin' ? 'Yönetici' : t.role === 'editor' ? 'Yayıncı' : 'Üye'}${t.role_name ? ' · ' + t.role_name : ''}</summary>${spCtxGrid({ ...t.ctx, name: t.user_name, email: t.user_email, dev: t.ctx.ua ? spDevice(t.ctx.ua) : '', page: t.ctx.title ? `${t.ctx.title} (${t.ctx.page || ''})` : t.ctx.page })}</details>` : ''}
    <div class="card card-pad">${spThread(d.msgs, { me: handler ? 'unit' : 'user' })}</div>
    ${can.reply ? html`<form class="card card-pad stack" data-form="sp-reply" style="margin-top:12px">
      <textarea class="input" name="body" rows="3" maxlength="4000" required placeholder="${handler ? 'Yanıtınız…' : 'Ek bilgi ya da yanıt yazın…'}"></textarea>
      ${spAttachHtml('spAttR')}
      <div class="form-error hidden" data-err></div>
      <div class="row wrap" style="gap:8px;justify-content:flex-end">
        ${can.forward ? html`<button type="button" class="btn" data-act="sp-forward">${icon('send', 'sm')}Destek ekibine ilet</button>` : ''}
        ${can.close ? html`<button type="button" class="btn" data-act="sp-close">${icon('check', 'sm')}Talebi kapat</button>` : ''}
        ${handler ? html`<button type="submit" class="btn" name="close" value="1">Yanıtla ve kapat</button>` : ''}
        <button type="submit" class="btn primary">${icon('send', 'sm')}Gönder</button></div></form>` : html`<p class="small muted" style="margin-top:12px">${t.route === 'sa' && handler ? 'Talep dupcii destek ekibine iletildi; yanıtları burada görürsünüz.' : ''}</p>`}
    ${can.rate ? html`<div class="card card-pad stack" style="margin-top:12px"><b>Destekten memnun kaldınız mı?</b><div class="sp-stars">${[1, 2, 3, 4, 5].map((n) => html`<button class="sp-star" data-act="sp-rate" data-n="${n}" aria-label="${n} yıldız">${icon('star')}</button>`)}</div></div>`
      : t.rating ? html`<p class="tiny faint" style="margin-top:10px">Puanınız: ${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</p>` : ''}`);
  SP.cur = t; SP.file = null;
}
FORMS['sp-reply'] = (f, ev) => submitForm(f, async (d) => {
  const close = !!(ev && ev.submitter && ev.submitter.name === 'close');
  await api('sp.reply', { id: SP.cur.id, body: d.body, file: SP.file || '', close });
  SP.file = null;
  toast(close ? 'Yanıtlandı ve kapatıldı' : 'Gönderildi');
  spTicket($('#view'), SP.cur.id);
});
ACT['sp-close'] = async () => {
  if (!(await confirmDialog({ title: 'Talebi kapat', text: 'Talep kapanır; sonradan yazarsanız yeniden açılır.', ok: 'Kapat' }))) return;
  try { await api('sp.close', { id: SP.cur.id }); toast('Talep kapatıldı'); spTicket($('#view'), SP.cur.id); } catch (e) { toast(e.message, 'err'); }
};
ACT['sp-forward'] = async () => {
  const note = await promptDialog({ title: 'Destek ekibine ilet', label: 'Destek ekibine not (isteğe bağlı): ne denediniz, neden çözülemedi?', multiline: true, ok: 'İlet' });
  if (note === null) return;
  try { await api('sp.forward', { id: SP.cur.id, note }); toast('Talep destek ekibine iletildi'); spTicket($('#view'), SP.cur.id); } catch (e) { toast(e.message, 'err'); }
};
ACT['sp-rate'] = async (el) => {
  try { await api('sp.rate', { id: SP.cur.id, rating: +el.dataset.n }); toast('Teşekkürler!'); spTicket($('#view'), SP.cur.id); } catch (e) { toast(e.message, 'err'); }
};
function spRefreshBadges() {
  const b = $('#spTop'); if (b) b.outerHTML = String(spTopBtn());
  if (typeof renderNav === 'function') renderNav();
}

/* ---------------- Giriş yapamayanlar ---------------- */

ACT['sp-help'] = () => {
  SP.file = null;
  const m = openModal({ title: 'Giriş yapamıyorum', size: 'narrow', body: html`<form class="stack" id="spHelpF" data-form="sp-help">
      <p class="small muted">Şifrenizi unuttuysanız önce “Şifremi unuttum”u deneyin. Olmadıysa yazın; yanıt e-postanıza gelir.</p>
      <div class="field"><label>Adınız soyadınız</label><input class="input" name="name" required maxlength="120" autocomplete="name"></div>
      <div class="field"><label>E-posta adresiniz</label><input class="input" type="email" name="email" required maxlength="190" autocomplete="email"></div>
      <div class="field"><label>Hastane / birim <span class="faint">(isteğe bağlı)</span></label><input class="input" name="unit" maxlength="160" placeholder="Örn: Şehir Hastanesi · Yoğun Bakım"></div>
      <div class="field"><label>Ne oluyor?</label><textarea class="input" name="body" rows="4" required maxlength="3000" placeholder="Örn: Şifremi doğru yazıyorum ama “hatalı” diyor; şifre sıfırlama e-postası gelmiyor."></textarea></div>
      <input class="sp-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <p class="tiny sp-kvkk">${icon('shield', 'sm')} Hasta ve T.C. kimlik bilgisi yazmayın.</p>
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="spHelpF" type="submit">Gönder</button>` });
  SP.helpModal = m;
};
FORMS['sp-help'] = (f) => submitForm(f, async (d) => {
  const c = spCtx(); delete c.page; delete c.title;
  const r = await api('help.ask', { ...d, ctx: c });
  if (SP.helpModal) SP.helpModal.close();
  const link = location.pathname + location.search + '#/destek/izle/' + r.token;
  openModal({ title: 'Talebiniz alındı', size: 'narrow', body: html`<div class="stack"><p class="small">Yanıt e-postanıza gelecek. Talebinizi bu cihazda aşağıdaki bağlantıdan da izleyebilirsiniz; bağlantıyı kimseyle paylaşmayın.</p>
    <a class="btn block" href="${link}">${icon('help', 'sm')}Talebimi izle</a></div>`, foot: html`<button class="btn primary" data-close>Tamam</button>` });
});

function spPublicRoute() { return /^#\/destek\/izle\/[a-f0-9]{40}$/.test(location.hash); }
window.addEventListener('hashchange', () => { if (!S.me && spPublicRoute()) renderSpPublic(); });
function renderSpPublic() {
  const tok = location.hash.split('/')[3];
  setHTML(APP(), authLayout(html`<div class="auth-brand">${brandLogo()}</div><div id="spPub"><div class="empty"><div class="spinner"></div></div></div>`));
  spPublic($('#spPub'), tok, true);
}
async function spPublic(box, tok, standalone) {
  let d;
  try { d = await api('help.get', { token: tok }); } catch (e) { return setHTML(box, html`<h1>Destek talebi</h1><p class="sub">${e.message}</p>${standalone ? html`<a class="btn block" href="#/">Giriş ekranına dön</a>` : ''}`); }
  SP.pubTok = tok;
  setHTML(box, html`<h1>${d.ticket.subject}</h1><p class="sub"><span class="badge ${SP_ST_CLS[d.ticket.status] || ''}">${d.ticket.status_name}</span> ${fmtDate(d.ticket.created_at)}</p>
    ${spThread(d.msgs, { me: 'user', token: tok })}
    <form class="stack" data-form="sp-pub-reply" style="margin-top:14px"><textarea class="input" name="body" rows="3" required maxlength="3000" placeholder="Yanıt ya da ek bilgi…"></textarea>
      <div class="form-error hidden" data-err></div><button class="btn primary block" type="submit">Gönder</button></form>
    ${standalone ? html`<p class="small muted" style="text-align:center;margin-top:14px"><a href="#/">Giriş ekranına dön</a></p>` : ''}`);
}
FORMS['sp-pub-reply'] = (f) => submitForm(f, async (d) => {
  await api('help.reply', { token: SP.pubTok, body: d.body });
  toast('Gönderildi');
  const box = f.closest('#spPub') || $('#view');
  spPublic(box, SP.pubTok, !!f.closest('#spPub'));
});

/* ---------------- Sistem yönetimi: Destek sekmesi ---------------- */

async function spSaRender(box) {
  box = box || $('#sysBody');
  if (!box) return;
  const F = SP.sa;
  let d;
  try { d = await api('sa.sp.list', F); } catch (e) { if (e.status === 401) { S.sa = null; return start(); } return setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); }
  SP.saData = d;
  if (typeof SYS !== 'undefined') { SYS.supportOpen = d.counts.open; if (typeof sysTabBadge === 'function') sysTabBadge(); }
  const hosp = d.hospitals.find((h) => String(h.id) === String(F.hosp));
  const seg = (k, l, n) => html`<button class="${F.status === k ? 'on' : ''}" data-act="sps-st" data-s="${k}">${l}${n ? html` <span class="count">${n}</span>` : ''}</button>`;
  setHTML(box, html`<div class="stack">
    <div class="row wrap" style="gap:8px;align-items:center">
      <div class="seg sys-tabs">${seg('open', 'Yanıt bekleyen', d.counts.open)}${seg('answered', 'Yanıtlanan', d.counts.answered)}${seg('unit', 'Birimde', d.counts.unit)}${seg('closed', 'Kapanan')}${seg('', 'Tümü')}</div>
      <span class="grow"></span><button class="btn sm" data-act="sps-canned">${icon('file', 'sm')}<span>Hazır yanıtlar (${d.canned.length})</span></button></div>
    <div class="row wrap sp-sa-f" style="gap:8px">
      <select class="select" data-change="sps-f" data-k="hosp"><option value="">Tüm hastaneler</option>${d.hospitals.map((h) => html`<option value="${h.id}" ${String(F.hosp) === String(h.id) ? raw('selected') : ''}>${h.name}</option>`)}</select>
      <select class="select" data-change="sps-f" data-k="tkey"><option value="">Tüm birimler</option>${(hosp ? hosp.tenants : d.hospitals.flatMap((h) => h.tenants.map((t) => ({ ...t, name: h.name + ' › ' + t.name })))).map((t) => html`<option value="${t.key}" ${F.tkey === t.key ? raw('selected') : ''}>${t.name}</option>`)}</select>
      <select class="select" data-change="sps-f" data-k="track"><option value="">Sorumlu + kullanıcı</option>${Object.entries(SP_TRACK).map(([k, [l]]) => html`<option value="${k}" ${F.track === k ? raw('selected') : ''}>${l}</option>`)}</select>
      <input class="input" type="search" placeholder="Ara: konu, kişi, e-posta, birim" value="${F.q}" data-change="sps-f" data-k="q" style="flex:1;min-width:180px"></div>
    ${d.items.length ? html`<div class="card"><div class="list">${d.items.map((t) => html`<button class="list-row sp-row ${t.un_sa ? 'unread' : ''}" data-act="sps-open" data-id="${t.id}">
        <span class="sp-ic">${icon(SP_TOPIC_IC[t.topic] || 'help', 'sm')}</span>
        <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${t.un_sa ? html`<span class="sp-dot"></span>` : ''}${t.subject}</div>
          <div class="lr-s"><span class="badge ${SP_TRACK[t.track][1]}">${SP_TRACK[t.track][0]}</span> ${t.hosp_name ? t.hosp_name + ' › ' : ''}${t.unit_name} · <b>${t.user_name}</b>${t.track !== 'public' ? ` (${t.role === 'admin' ? 'Yönetici' : t.role === 'editor' ? 'Yayıncı' : 'Üye'}${t.role_name ? ' · ' + t.role_name : ''})` : ''} · ${t.topic_name} · ${fmtRel(t.updated_at)}</div>
          ${t.last ? html`<div class="tiny faint ellipsis">${t.last.who === 'sa' ? 'Siz: ' : ''}${t.last.body}</div>` : ''}</div>
        <span class="badge ${SP_ST_CLS[t.status] || ''}">${t.route === 'unit' && t.status !== 'closed' ? 'Birimde' : t.status_name}</span></button>`)}</div></div>`
      : html`<div class="card empty"><div class="e-ico">${icon('help', 'lg')}</div><p class="small">Bu süzgeçte talep yok.</p></div>`}</div>`);
}
ACT['sps-st'] = (el) => { SP.sa.status = el.dataset.s; spSaRender(); };
CHANGE['sps-f'] = (el) => { SP.sa[el.dataset.k] = el.value; if (el.dataset.k === 'hosp') SP.sa.tkey = ''; spSaRender(); };

ACT['sps-open'] = async (el) => {
  const id = +el.dataset.id;
  let d;
  try { d = await api('sa.sp.get', { id }); } catch (e) { return toast(e.message, 'err'); }
  const t = d.ticket; SP.saCur = t; SP.file = null;
  const canned = (SP.saData && SP.saData.canned) || [];
  const m = openModal({ title: t.subject, drawer: true, body: html`<div class="stack">
      <div class="row wrap" style="gap:6px"><span class="badge ${SP_TRACK[t.track][1]}">${SP_TRACK[t.track][0]}</span><span class="badge ${SP_ST_CLS[t.status] || ''}">${t.status_name}</span><span class="badge">${t.topic_name}</span>${t.route === 'unit' ? html`<span class="badge info">Birim sorumlusunda</span>` : ''}${t.forwarded ? html`<span class="badge">Birimden iletildi</span>` : ''}</div>
      <div class="card card-pad sp-ctx-card">${spCtxGrid({ ...t.ctx, hosp: t.hosp_name, unit: t.unit_name, name: t.user_name, email: t.user_email, role: t.ctx.role, role_name: t.role_name || t.ctx.role_name, dev: t.ctx.ua ? spDevice(t.ctx.ua) : '', page: t.ctx.title ? `${t.ctx.title} (${t.ctx.page || ''})` : t.ctx.page })}
        ${t.others ? html`<div class="tiny faint" style="margin-top:6px">Bu kişinin ${t.others} başka talebi var.</div>` : ''}</div>
      ${spThread(d.msgs, { me: 'sa' })}
      <form class="stack" data-form="sps-reply" id="spsF">
        ${canned.length ? html`<select class="select" data-change="sps-canned-use"><option value="">Hazır yanıt seç…</option>${canned.map((c, i) => html`<option value="${i}">${c.t}</option>`)}</select>` : ''}
        <textarea class="input" name="body" rows="5" maxlength="4000" required placeholder="Yanıtınız (kişiye “dupcii destek” adıyla gider)"></textarea>
        ${spAttachHtml('spAttS')}
        <label class="switch"><input type="checkbox" name="internal"><span class="track"></span><span class="s-text"><b>İç not</b><span>Yalnız sistem yöneticileri görür; kişiye gitmez.</span></span></label>
        <div class="form-error hidden" data-err></div></form></div>`,
    foot: html`<button class="btn" data-act="sps-more">${icon('more', 'sm')}</button><span class="grow"></span><button class="btn" form="spsF" type="submit" name="close" value="1">Gönder ve kapat</button><button class="btn primary" form="spsF" type="submit">${icon('send', 'sm')}Gönder</button>` });
  SP.saModal = m;
  if (t.un_sa) spSaRender();
};
CHANGE['sps-canned-use'] = (el) => {
  const c = ((SP.saData && SP.saData.canned) || [])[+el.value];
  const ta = $('#spsF [name=body]');
  if (c && ta) ta.value = c.b.replace(/\{ad\}/g, String(SP.saCur.user_name || '').split(' ')[0]);
  el.value = '';
};
FORMS['sps-reply'] = (f, ev) => submitForm(f, async (d) => {
  const close = !!(ev && ev.submitter && ev.submitter.name === 'close');
  await api('sa.sp.reply', { id: SP.saCur.id, body: d.body, internal: !!d.internal, close, file: SP.file || '' });
  SP.file = null;
  toast(d.internal ? 'İç not eklendi' : close ? 'Yanıtlandı ve kapatıldı' : 'Yanıt gönderildi');
  if (SP.saModal) SP.saModal.close();
  spSaRender();
  if (!close) ACT['sps-open']({ dataset: { id: SP.saCur.id } });
});
ACT['sps-more'] = (el) => {
  const t = SP.saCur;
  const run = async (act, extra = {}) => {
    try { await api('sa.sp.set', { id: t.id, act, ...extra }); toast('Kaydedildi'); if (SP.saModal) SP.saModal.close(); spSaRender(); } catch (e) { toast(e.message, 'err'); }
  };
  openMenu(el, [
    ...(t.track === 'user' && t.route !== 'unit' && t.tkey ? [{ id: 'u', icon: 'users', label: 'Birim sorumlusuna aktar', run: async () => {
      const note = await promptDialog({ title: 'Birim sorumlusuna aktar', label: 'Kişiye ve sorumluya not (isteğe bağlı)', multiline: true, ok: 'Aktar' });
      if (note !== null) run('unit', { note });
    } }] : []),
    t.status === 'closed' ? { id: 'r', icon: 'history', label: 'Yeniden aç', run: () => run('reopen') } : { id: 'c', icon: 'check', label: 'Kapat (yanıtsız)', run: () => run('close') },
    '-',
    { id: 'd', icon: 'trash', label: 'Sil (gereksiz / spam)', danger: true, run: async () => { if (await confirmDialog({ title: 'Talebi sil', text: 'Talep ve ekleri kalıcı olarak silinir.', ok: 'Sil', danger: true })) run('delete'); } },
  ]);
};
ACT['sps-canned'] = () => {
  const list = ((SP.saData && SP.saData.canned) || []).map((c) => ({ ...c }));
  const draw = () => html`${list.map((c, i) => html`<div class="card card-pad stack sp-can" data-i="${i}"><div class="row" style="gap:6px"><input class="input" data-k="t" value="${c.t}" placeholder="Başlık (ör. Şifre sıfırlama)" maxlength="80"><button type="button" class="btn sm icon ghost" data-act="sps-can-x" data-i="${i}" aria-label="Sil">${icon('trash', 'sm')}</button></div>
      <textarea class="input" data-k="b" rows="3" maxlength="2000" placeholder="Yanıt metni; {ad} kişinin adıyla değişir">${c.b}</textarea></div>`)}
    <button type="button" class="btn" data-act="sps-can-add">${icon('plus', 'sm')}Hazır yanıt ekle</button>`;
  const read = () => $$('.sp-can', m.el).forEach((el) => { const i = +el.dataset.i; list[i] = { t: $('[data-k=t]', el).value, b: $('[data-k=b]', el).value }; });
  const m = openModal({ title: 'Hazır yanıtlar', body: html`<div class="stack" id="spCan">${draw()}</div>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-act="sps-can-save">Kaydet</button>` });
  SP.canM = { m, list, draw, read };
  if (!list.length) { list.push({ t: 'Şifre sıfırlama', b: 'Merhaba {ad}, giriş ekranındaki “Şifremi unuttum” bağlantısıyla e-postanıza yeni şifre bağlantısı gönderebilirsiniz. Gelmezse birim yöneticiniz geçici şifre verebilir.' }); setHTML($('#spCan', m.el), draw()); }
};
ACT['sps-can-add'] = () => { const C = SP.canM; C.read(); C.list.push({ t: '', b: '' }); setHTML($('#spCan', C.m.el), C.draw()); };
ACT['sps-can-x'] = (el) => { const C = SP.canM; C.read(); C.list.splice(+el.dataset.i, 1); setHTML($('#spCan', C.m.el), C.draw()); };
ACT['sps-can-save'] = async () => {
  const C = SP.canM; C.read();
  try { const r = await api('sa.sp.canned', { items: C.list }); if (SP.saData) SP.saData.canned = r.canned; C.m.close(); toast('Hazır yanıtlar kaydedildi'); spSaRender(); } catch (e) { toast(e.message, 'err'); }
};
