/* dupcii — sistem sağlığı (4.18): canlıya geçiş ve işletim denetimleri.
   Çok birimlide Sistem yönetimi › Sistem sağlığı sekmesi, tek birimlide Ayarlar kartı. */
'use strict';

const HL_ICON = { ok: 'checkCircle', warn: 'alert', err: 'alert', info: 'info' };
const HL = { pre: 'sa.health', box: null };
async function hlRender(box, pre) {
  HL.pre = pre; HL.box = box;
  setHTML(box, html`<div class="card card-pad"><div class="row" style="gap:10px"><div class="spinner"></div><span class="small muted">Denetleniyor (DNS kayıtları birkaç saniye sürebilir)…</span></div></div>`);
  let d;
  try { d = await api(pre); } catch (e) {
    if (e.status === 401 && pre === 'sa.health') { S.sa = null; return start(); }
    setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return;
  }
  const c = d.count;
  const tone = c.err ? 'err' : c.warn ? 'warn' : 'ok';
  const head = c.err ? `${c.err} sorun düzeltilmeli` : c.warn ? `Çalışıyor · ${c.warn} öneri var` : 'Her şey hazır';
  const sub = c.err ? 'Kırmızı maddeler düzeltilmeden canlıya geçmeyin.' : c.warn ? 'Sarı maddeler önerilir; kullanım engellenmez.' : 'Canlıya geçiş için tüm denetimler tamam.';
  setHTML(box, html`<div class="stack sh">
    <div class="card card-pad sh-sum sh-${tone}"><div class="sh-big">${icon(tone === 'ok' ? 'checkCircle' : 'alert')}</div>
      <div class="grow" style="min-width:0"><h3>${head}</h3><p class="small">${sub}</p>
        <div class="row wrap sh-counts" style="gap:6px"><span class="badge success">${c.ok} tamam</span>${c.warn ? html`<span class="badge warn">${c.warn} öneri</span>` : ''}${c.err ? html`<span class="badge danger">${c.err} sorun</span>` : ''}<span class="tiny faint">Sürüm ${d.version} · ${fmtDateTime(d.at)}</span></div></div>
      <div class="sh-acts"><button class="btn sm" data-act="sh-again">${icon('history', 'sm')}<span>Yeniden denetle</span></button>
        ${pre === 'sa.health' ? html`<button class="btn sm" data-act="sh-mail">${icon('mail', 'sm')}<span>Deneme e-postası</span></button>` : ''}</div></div>
    ${d.groups.map((g) => html`<div class="card sh-group"><div class="card-head"><h3>${g.t}</h3>${hlGroupBadge(g)}</div>
      <div class="list">${g.items.map((i) => html`<div class="list-row sh-row sh-${i.s}"><span class="sh-dot">${icon(HL_ICON[i.s], 'sm')}</span>
        <div class="grow" style="min-width:0"><div class="lr-t">${i.t}</div><div class="lr-s">${i.d}</div>
          ${i.f && i.s !== 'ok' ? html`<div class="sh-fix">${icon('info', 'sm')}<span>${i.f}</span></div>` : ''}
          ${i.lines && i.lines.length ? html`<details class="sh-log"><summary>Son ${i.lines.length} satır</summary><pre>${i.lines.join('\n')}</pre></details>` : ''}</div></div>`)}</div></div>`)}
  </div>`);
}
function hlGroupBadge(g) {
  const e = g.items.filter((i) => i.s === 'err').length, w = g.items.filter((i) => i.s === 'warn').length;
  return e ? html`<span class="badge danger">${e} sorun</span>` : w ? html`<span class="badge warn">${w} öneri</span>` : html`<span class="badge success">Tamam</span>`;
}
ACT['sh-again'] = () => hlRender(HL.box, HL.pre);
ACT['sh-mail'] = (el) => busy(el, async () => {
  try { const r = await api('sa.health.mail'); toast(`Deneme e-postası ${r.to} adresine gönderildi. Gelen kutusuna mı, spam’e mi düştüğüne bakın.`); } catch (e) { toast(e.message, 'err'); }
});

/* Tek birimli kurulum: yönetici Ayarlar kartı */
NM_EXT.settingsCards.push({
  sec: 'genel', admin: true,
  html: () => (S.legal_admin ? html`<div data-sec="genel"><div class="card card-pad stack"><div><h3 style="font-size:15px">${icon('checkCircle', 'sm')} Sistem sağlığı</h3>
    <p class="small muted">Sunucu, cron, e-posta (SPF / DKIM / DMARC), yedek ve güvenlik denetimleri; her madde için nasıl düzeltileceği.</p></div>
    <div><button class="btn" data-act="sh-open">${icon('checkCircle', 'sm')}<span>Denetle</span></button></div></div></div>` : ''),
});
ACT['sh-open'] = () => {
  const m = openModal({ title: 'Sistem sağlığı', size: 'wide', body: html`<div id="shModal"></div>` });
  hlRender($('#shModal', m.el), 'health.get');
};
