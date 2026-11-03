/* dupcii — açılış */
'use strict';

async function start() {
  if (BOOT.share && !start.guestShown) {
    start.guestShown = true;
    return renderGuest(BOOT.share);
  }
  const r = await api('boot');
  // Sunucu oturum yok diyorsa (çıkış, süre dolması) bu cihazdaki eski kişisel önbelleği temizle
  if (!r.me && !OFFLINE.on) {
    offlineCacheClear();
    if (typeof pwaClearFileCache === 'function') pwaClearFileCache();
    if (typeof resetAppState === 'function') resetAppState();
  }
  S.mail_ready = !!r.mail_ready;
  S.csrf = r.csrf || S.csrf;
  ['me', 'settings', 'categories', 'units', 'titles', 'rosters', 'google_client_id', 'upload_max_mb'].forEach((k) => { if (k in r) S[k] = r[k]; });
  S.people = r.people || [];
  if (r.counts) S.counts = r.counts;
  document.title = 'dupcii · ' + (S.settings.org_name || 'Klinik Portalı');
  applyBrand();
  if (r.setup_needed) return renderSetup();
  if (BOOT.reset && !start.resetShown) {
    start.resetShown = true;
    history.replaceState(null, '', location.pathname);
    return renderReset(BOOT.reset);
  }
  if (BOOT.invite && !start.inviteShown) {
    start.inviteShown = true;
    if (!S.me) return renderInvite(BOOT.invite);
    history.replaceState(null, '', location.pathname + location.hash);
  }
  if (!S.me) return renderAuth('login');
  if (S.me.must_change) return renderForceChange();
  renderShell();
  if (!window.NM_DEMO_API && typeof registerSW === 'function') {
    registerSW();
    if (S.settings.push_ready && S.me.push_on !== false) setTimeout(() => pushSync().catch(() => {}), 3000);
  }
  // Nöbet listesi görüntüleyicisini arka planda önbelleğe al (ilk açılış hızlı olsun)
  setTimeout(() => {
    if (window.NM_DEMO_API) return;
    ['exceljs', 'pdf'].forEach((k) => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = VENDOR[k]; document.head.appendChild(l); });
  }, 2500);
  route();
}

// Sekmeye geri dönüldüğünde sayıları tazele
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me && $('#shell')) {
    refreshCounts();
    if (RS.stage && document.body.contains(RS.stage)) syncRosters();
  }
});
setInterval(() => { if (document.visibilityState === 'visible' && S.me && $('#shell')) refreshCounts(); }, 120000);

start().catch((e) => {
  setHTML(APP(), html`<div class="boot-splash"><div class="card card-pad" style="max-width:420px;text-align:center">
    <div class="empty" style="padding:10px"><div class="e-ico">${icon('alert', 'lg')}</div><h3>Uygulama başlatılamadı</h3><p class="small">${e.message}</p></div>
    <button class="btn primary" data-act="reload">Tekrar dene</button></div></div>`);
});
ACT.reload = () => location.reload();
