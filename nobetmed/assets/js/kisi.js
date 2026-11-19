/* dupcii — kişi kartı (4.13): uygulamanın her yerinde kişinin adına / fotoğrafına dokununca açılır.
   Mesaj, sesli ve görüntülü arama (uygulama içi), telefon, SMS, WhatsApp, e-posta, dahili numara ve yaklaşan nöbetleri. */
'use strict';

/** Ada dokununca kişi kartı açan düğme (görünüşte düz metin) */
function pName(name, uid, cls = '') {
  if (!name) return '';
  return html`<button type="button" class="pname ${cls}" data-act="person" data-name="${name}" ${uid ? raw(`data-uid="${+uid}"`) : ''} title="${name} — kişi kartı">${name}</button>`;
}
/** Fotoğrafa dokununca kişi kartı */
function pAvatar(name, size = 'sm', url, uid) {
  return html`<button type="button" class="pav" data-act="person" data-name="${name}" ${uid ? raw(`data-uid="${+uid}"`) : ''} aria-label="${name} kişi kartı">${avatar(name, size, url)}</button>`;
}

const PC = { cache: new Map() };
ACT.person = (el, ev) => {
  if (ev && ev.target.closest('a[href]') && el.contains(ev.target.closest('a[href]')) && ev.target.closest('a[href]') !== el) return;
  personCard({ uid: +el.dataset.uid || null, name: el.dataset.name || '' });
};

async function personCard({ uid, name }) {
  const key = uid ? 'u' + uid : 'n' + (name || '').toLocaleLowerCase('tr');
  let p = PC.cache.get(key);
  if (!p || Date.now() - p._at > 60000) {
    try { p = (await api('person.card', uid ? { uid } : { name })).person; p._at = Date.now(); PC.cache.set(key, p); } catch (e) { toast(e.message, 'err'); return; }
  }
  const tel = p.phone ? String(p.phone).replace(/[^0-9+]/g, '') : '';
  const acts = [];
  if (p.chat) acts.push(['dm', 'chat', 'Mesaj']);
  if (p.chat && p.calls) acts.push(['call', 'phone', 'Sesli ara'], ['vcall', 'video', 'Görüntülü']);
  if (tel && !p.self) acts.push(['tel', 'phoneOut', 'Telefon', 'tel:' + tel], ['sms', 'mail', 'SMS', 'sms:' + tel], ['wa', 'send', 'WhatsApp', 'https://wa.me/' + waNumber(p.phone)]);
  if (p.email && !p.self) acts.push(['mail', 'mail', 'E-posta', 'mailto:' + p.email]);
  const cur = typeof currentShift === 'function' ? currentShift(p.shifts || []) : null;
  const sub = [p.title, p.unit].filter(Boolean).join(' · ');
  const seen = p.last_seen_at && !p.self ? 'Son görülme ' + fmtRel(p.last_seen_at) : '';
  const shiftRow = (s) => html`<div class="pc-sh ${s === cur ? 'cur' : ''}">${codeChip(s)}<span class="grow" style="min-width:0"><b class="small">${dateLabel(s.date)}</b><span class="tiny faint" style="display:block">${shiftDesc(s) || s.code}${s.roster ? ' · ' + s.roster : ''}</span></span>${s === cur ? html`<span class="badge brand">Şu an nöbette</span>` : ''}</div>`;
  const m = openModal({
    title: p.name, size: 'narrow',
    body: html`<div class="stack pc" style="align-items:center;text-align:center">
      ${avatar(p.name, 'xl', p.avatar || null)}
      <div><b style="font-size:17px">${p.name}</b>${p.self ? html` <span class="tiny faint">(siz)</span>` : ''}
        ${sub ? html`<div class="small muted">${sub}</div>` : ''}${seen ? html`<div class="tiny faint">${seen}</div>` : ''}
        ${p.account ? '' : html`<div class="tiny faint" style="margin-top:4px">Uygulamada hesabı yok; yalnız nöbet listesinde adı geçiyor.</div>`}</div>
      ${acts.length ? html`<div class="ch-pacts">${acts.map(([k, ic, l, href]) => (href ? html`<a href="${href}" data-pc="${k}" ${k === 'wa' ? raw('target="_blank" rel="noopener"') : ''}>${icon(ic)}<span>${l}</span></a>` : html`<button type="button" data-pc="${k}">${icon(ic)}<span>${l}</span></button>`))}</div>` : ''}
      ${p.phone || p.extension ? html`<div class="row wrap small muted" style="gap:10px;justify-content:center">${p.phone ? html`<span>${icon('phone', 'sm')} <span class="sel">${p.phone}</span> <button type="button" class="btn ghost icon sm" data-pc="copy" aria-label="Numarayı kopyala" title="Kopyala">${icon('copy', 'sm')}</button></span>` : ''}${p.extension ? html`<span>Dahili <b>${p.extension}</b></span>` : ''}</div>` : ''}
      ${(p.shifts || []).length ? html`<div class="pc-shifts"><div class="sec-label" style="text-align:left">Yaklaşan nöbetleri</div>${p.shifts.filter((s) => s.kind === 'shift' || s.kind === 'role').slice(0, 5).map(shiftRow)}
        ${p.shifts.some((s) => s.kind === 'leave' || s.kind === 'off') ? html`<div class="tiny faint" style="text-align:left;margin-top:4px">İzin / boş: ${p.shifts.filter((s) => s.kind === 'leave' || s.kind === 'off').slice(0, 4).map((s) => `${+s.date.slice(8)} ${TR_MONTHS[+s.date.slice(5, 7) - 1].slice(0, 3)} (${s.code})`).join(', ')}</div>` : ''}</div>` : ''}
      ${p.chat ? html`<button type="button" class="btn ghost sm" data-pc="prof">${icon('user', 'sm')}<span>Sohbet profili, ortak gruplar ve engelleme</span></button>` : ''}
    </div>`,
  });
  m.el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-pc]'); if (!b) return;
    const k = b.dataset.pc;
    if (['tel', 'sms', 'wa', 'mail'].includes(k)) return; // bağlantı kendisi açar
    ev.preventDefault();
    if (k === 'copy') { try { await navigator.clipboard.writeText(p.phone); toast('Numara kopyalandı'); } catch (e) { toast('Kopyalanamadı', 'err'); } return; }
    if (k === 'prof') { m.close(); if (typeof chatProfile === 'function') chatProfile(p.tk, p.uid); return; }
    if (k === 'dm' || k === 'call' || k === 'vcall') {
      try {
        const d = await api('chat.direct', { tk: p.tk, uid: p.uid });
        while (modalStack.length) modalStack[modalStack.length - 1].close();
        if (location.hash !== '#/mesaj/' + d.id) location.hash = '#/mesaj/' + d.id;
        if (k !== 'dm' && typeof callStart === 'function') callStart(d.id, k === 'vcall');
      } catch (e) { toast(e.message, 'err'); }
    }
  });
  return m;
}
