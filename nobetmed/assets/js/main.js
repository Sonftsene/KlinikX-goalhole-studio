/* dupcii — açılış */
'use strict';

const BOOT_CORE_KEYS = new Set(['me', 'settings', 'categories', 'units', 'titles', 'rosters', 'google_client_id', 'upload_max_mb', 'people', 'counts', 'csrf', 'mail_ready', 'setup_needed', 'ok', 'error']);
async function start() {
  if (BOOT.share && !start.guestShown) {
    start.guestShown = true;
    return renderGuest(BOOT.share);
  }
  // theme.js açılış verisini erkenden istediyse onu kullan (yoksa / hatalıysa olağan istek)
  let r = null;
  const early = window.NM_BOOT_P; window.NM_BOOT_P = null;
  if (early) {
    try { const x = await early; if (x && x.status === 200 && x.json && x.json.ok) { r = x.json; if (r.csrf) S.csrf = r.csrf; if (typeof offlinePut === 'function') offlinePut('nm-off:boot:{}', r, 'boot'); } } catch (e) { r = null; }
  }
  if (!r) r = await api('boot');
  // Sunucu oturum yok diyorsa (çıkış, süre dolması) bu cihazdaki eski kişisel önbelleği temizle
  if (!r.me && !OFFLINE.on) {
    offlineCacheClear();
    if (typeof pwaClearFileCache === 'function') pwaClearFileCache();
    if (typeof resetAppState === 'function') resetAppState();
  }
  // Ortak bilgisayar oturumu: bu cihazda kalıcı (localStorage) kişisel önbellek bırakılmaz
  if (r.me && r.me.ephemeral && !OFFLINE.on) { try { Object.keys(localStorage).filter((k) => k.startsWith('nm-off:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* */ } }
  S.mail_ready = !!r.mail_ready;
  S.csrf = r.csrf || S.csrf;
  ['me', 'settings', 'categories', 'units', 'titles', 'rosters', 'google_client_id', 'upload_max_mb'].forEach((k) => { if (k in r) S[k] = r[k]; });
  S.people = r.people || [];
  if (r.counts) S.counts = r.counts;
  // Modüllerin açılış verisi (NM_BOOT): bilinmeyen anahtarlar S'ye kopyalanır; hesap değişince eskileri silinir
  (S._modKeys || []).forEach((k) => { if (!(k in r)) delete S[k]; });
  S._modKeys = Object.keys(r).filter((k) => !BOOT_CORE_KEYS.has(k));
  S._modKeys.forEach((k) => { S[k] = r[k]; });
  if (typeof prefsOnBoot === 'function') { try { prefsOnBoot(); } catch (e) { /* */ } }
  document.title = 'dupcii · ' + (S.settings.org_name || 'Klinik Portalı');
  applyBrand();
  if (r.sa && !r.sa.in && typeof renderSistem === 'function') return renderSistem();
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
  if (!S.me && typeof renderApply === 'function' && apIsRoute()) return renderApply();
  if (!S.me && typeof renderSpPublic === 'function' && spPublicRoute()) return renderSpPublic();
  if (!S.me) return renderAuth('login');
  if (S.me.must_change) return renderForceChange();
  renderShell();
  // Sistem yöneticisi birimde: her sayfada görünen şerit
  if (S.sa && S.sa.in) {
    const bs = $('#bannerSlot');
    if (bs) setHTML(bs, html`<div class="banner warn sys-in">${icon('shield', 'sm')}<span class="grow">Sistem yöneticisi olarak <b>${S.settings.org_name}</b> birimindesiniz. Yaptığınız her işlem birimin işlem günlüğüne yazılır.</span><button class="btn sm" data-act="sys-exit">Sistem paneline dön</button></div>`);
  }
  // Aydınlatma metni güncellendiyse bir kez göster
  if (S.legal && S.legal.ack && !(S.sa && S.sa.in) && typeof lgAckPrompt === 'function') setTimeout(() => lgAckPrompt(), 600);
  if (!window.NM_DEMO_API && typeof registerSW === 'function' && !(S.sa && S.sa.in)) {
    registerSW();
    if (S.settings.push_ready && S.me.push_on !== false) setTimeout(() => pushSync().catch(() => {}), 3000);
  }
  // Nöbet listesi görüntüleyicisini arka planda önbelleğe al (ilk açılış hızlı olsun)
  setTimeout(() => {
    if (window.NM_DEMO_API) return;
    ['exceljs', 'pdf'].forEach((k) => { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = VENDOR[k]; document.head.appendChild(l); });
  }, 2500);
  route();
  if (typeof restoreResume === 'function') restoreResume();
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
