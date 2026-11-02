/* NöbetMed — açılış */
'use strict';

async function start() {
  if (BOOT.share && !start.guestShown) {
    start.guestShown = true;
    return renderGuest(BOOT.share);
  }
  const r = await api('boot');
  S.csrf = r.csrf || S.csrf;
  ['me', 'settings', 'categories', 'units', 'titles', 'shift_types', 'google_client_id', 'upload_max_mb'].forEach((k) => { if (k in r) S[k] = r[k]; });
  S.people = r.people || [];
  if (r.counts) S.counts = r.counts;
  document.title = 'NöbetMed · ' + (S.settings.org_name || 'Klinik Portalı');
  if (r.setup_needed) return renderSetup();
  if (!S.me) return renderAuth('login');
  renderShell();
  route();
}

// Sekmeye geri dönüldüğünde sayıları tazele
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me && $('#shell')) refreshCounts();
});
setInterval(() => { if (document.visibilityState === 'visible' && S.me && $('#shell')) refreshCounts(); }, 120000);

start().catch((e) => {
  setHTML(APP(), html`<div class="boot-splash"><div class="card card-pad" style="max-width:420px;text-align:center">
    <div class="empty" style="padding:10px"><div class="e-ico">${icon('alert', 'lg')}</div><h3>Uygulama başlatılamadı</h3><p class="small">${e.message}</p></div>
    <button class="btn primary" data-act="reload">Tekrar dene</button></div></div>`);
});
ACT.reload = () => location.reload();
