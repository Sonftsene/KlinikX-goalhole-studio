/* dupcii — QR ile bilgisayara giriş (WhatsApp Web gibi) ve bağlı cihazlar / güvenli çıkış (4.11) */
'use strict';

/* ---------------- Bilgisayar: giriş ekranında karekod ---------------- */
const QRL = { timer: 0, tick: 0, tries: 0, keep: false };
ACT['qr-login'] = () => qrLoginScreen();
function qrLoginStop() { clearTimeout(QRL.timer); clearInterval(QRL.tick); }
async function qrLoginScreen() {
  qrLoginStop();
  QRL.tries = 0;
  setHTML(APP(), authLayout(html`
    <div class="auth-brand">${brandLogo()}<div class="brand-org">${S.settings.org_name}</div></div>
    <h1>QR kodla giriş</h1>
    <p class="sub">Telefonunuzdaki hesapla bu bilgisayarda şifresiz oturum açın.</p>
    <div class="qrl">
      <div class="qrl-code" id="qrlCode"><div class="spinner"></div></div>
      <ol class="qrl-steps">
        <li>Telefonunuzda <b>dupcii</b>’yi açın (giriş yapmış olun).</li>
        <li><b>Hesabım › Güvenlik › Bilgisayarda oturum aç</b>’a dokunun ya da telefonun kamerasıyla bu kodu okutun.</li>
        <li>Telefonda bilgisayar bilgisini kontrol edip <b>Onayla</b>’ya dokunun.</li>
      </ol>
    </div>
    <div class="qrl-st" id="qrlSt" role="status">Karekod hazırlanıyor…</div>
    <label class="switch" style="margin-top:12px"><input type="checkbox" id="qrlKeep"><span class="track"></span><span class="s-text"><b>Bu bilgisayarda oturumum açık kalsın</b><span>Yalnız kendi bilgisayarınızda açın. Kapalıysa tarayıcı kapanınca ya da 8 saat işlem yapılmayınca oturum kendiliğinden kapanır.</span></span></label>
    <p class="small muted" style="margin-top:18px;text-align:center"><a href="#" data-act="qr-back">${icon('chevL', 'sm')} E-posta ve şifreyle giriş</a></p>`));
  $('#qrlKeep').addEventListener('change', (e) => { QRL.keep = e.target.checked; });
  try { await loadVendor('qrcode'); } catch (e) { setHTML($('#qrlSt'), html`<span class="mk-no">QR kod hazırlanamadı. Bağlantınızı kontrol edin.</span>`); return; }
  qrLoginNew();
}
ACT['qr-back'] = (el, ev) => { if (ev) ev.preventDefault(); qrLoginStop(); renderAuth('login'); };
async function qrLoginNew() {
  qrLoginStop();
  if (++QRL.tries > 5) { qrLoginExpired('Karekod süresi doldu.'); return; }
  let r;
  try { r = await api('qr.new'); } catch (e) { setHTML($('#qrlSt'), html`<span class="mk-no">${e.message}</span>`); return; }
  const box = $('#qrlCode'); if (!box) return;
  box.classList.remove('dim');
  setHTML(box, raw(qrSvg(r.url, 232)));
  box.dataset.url = r.url;
  let left = r.ttl;
  const st = $('#qrlSt');
  setHTML(st, html`${icon('phone', 'sm')} Telefonla okutun · <span id="qrlLeft">${left}</span> sn`);
  QRL.tick = setInterval(() => { left--; const l = $('#qrlLeft'); if (l) l.textContent = Math.max(0, left); }, 1000);
  const poll = async () => {
    if (!$('#qrlCode')) { qrLoginStop(); return; }
    let p;
    try { p = await api('qr.poll', { keep: QRL.keep }); } catch (e) { QRL.timer = setTimeout(poll, 3000); return; }
    if (p.state === 'in') {
      qrLoginStop();
      setHTML($('#qrlSt'), html`<span class="mk-ok">${icon('checkCircle', 'sm')} Onaylandı, giriş yapılıyor…</span>`);
      location.replace(location.pathname);
      return;
    }
    if (p.state === 'seen') setHTML($('#qrlSt'), html`${icon('phone', 'sm')} Telefonda onay bekleniyor…`);
    if (p.state === 'denied') { qrLoginStop(); setHTML($('#qrlSt'), html`<span class="mk-no">Telefondan reddedildi.</span> <a href="#" data-act="qr-renew">Yeni karekod</a>`); $('#qrlCode').classList.add('dim'); return; }
    if (p.state === 'expired' || p.state === 'none' || left <= 0) { qrLoginNew(); return; }
    QRL.timer = setTimeout(poll, 2000);
  };
  QRL.timer = setTimeout(poll, 2000);
}
function qrLoginExpired(msg) {
  qrLoginStop();
  const b = $('#qrlCode'); if (b) b.classList.add('dim');
  setHTML($('#qrlSt'), html`${msg} <a href="#" data-act="qr-renew">Yeni karekod</a>`);
}
ACT['qr-renew'] = (el, ev) => { if (ev) ev.preventDefault(); QRL.tries = 0; qrLoginNew(); };

/* ---------------- Telefon: okutulan karekodu onayla (#/qr/<anahtar>) ---------------- */
NM_EXT.routes.qr = async (view, r) => {
  const token = r[1] || '';
  setHTML(view, html`<div class="page-head"><div><h1>Bilgisayarda oturum aç</h1></div></div><div id="qrBody"><div class="card card-pad"><div class="skel" style="height:16px"></div></div></div>`);
  let d;
  try { d = await api('qr.info', { token }); } catch (e) { setHTML($('#qrBody'), html`<div class="card empty"><div class="e-ico">${icon('qr', 'lg')}</div><h3>Karekod kullanılamıyor</h3><p class="small">${e.message}</p><button class="btn" data-act="qr-scan">${icon('camera', 'sm')}Yeniden okut</button></div>`); return; }
  setHTML($('#qrBody'), html`<div class="card card-pad stack qra">
    <div class="qra-dev">${icon('grid', 'lg')}<div><b>${d.label}</b><div class="small muted">IP ${d.ip}${d.same_net ? ' · telefonunuzla aynı ağ' : ''}</div><div class="tiny faint">${fmtDateTime(d.at)}</div></div></div>
    <p><b>${S.me.name}</b> hesabıyla bu bilgisayarda oturum açılacak.</p>
    <div class="mk-box warn">${icon('alert', 'sm')}<span>Karekodu <b>siz</b> okutmadıysanız ya da bilgisayar şu an önünüzde değilse <b>onaylamayın</b>. Başkası size karekod okutarak hesabınıza girmeye çalışıyor olabilir.</span></div>
    <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="qr-ok" data-t="${token}">${icon('check', 'sm')}Onayla</button><button class="btn ghost danger" data-act="qr-no" data-t="${token}">Reddet</button></div>
    <p class="tiny faint">Bilgisayardaki oturumu istediğiniz an Hesabım › Güvenlik › Bağlı cihazlar’dan kapatabilirsiniz.</p></div>`);
};
ACT['qr-ok'] = (el) => busy(el, async () => {
  try {
    const r = await api('qr.approve', { token: el.dataset.t, ok: true });
    setHTML($('#qrBody'), html`<div class="card empty"><div class="e-ico" style="background:var(--success-soft);color:var(--success)">${icon('checkCircle', 'lg')}</div><h3>Bilgisayarda oturum açıldı</h3><p class="small">${r.label}</p><a class="btn" href="#/profil/guvenlik">Bağlı cihazlar</a></div>`);
  } catch (e) { toast(e.message, 'err'); }
});
ACT['qr-no'] = async (el) => {
  try { await api('qr.approve', { token: el.dataset.t, ok: false }); } catch (e) { /* süresi dolmuş olabilir */ }
  toast('Giriş reddedildi'); location.hash = '#/';
};

/* ---------------- Telefon: uygulama içinden karekod okut ---------------- */
ACT['qr-scan'] = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Bu cihazda kamera kullanılamıyor; telefonun kamerasıyla okutun.', 'err'); return; }
  let stream = null; let raf = 0; let det = null; let done = false;
  const md = openModal({ title: 'Bilgisayardaki karekodu okutun', body: html`<div class="qrs"><video id="qrsV" playsinline muted autoplay></video><div class="qrs-frame"></div></div><p class="small muted" style="text-align:center;margin-top:8px">Bilgisayarda giriş ekranındaki “Telefonla QR kod okutarak giriş”e basın, çıkan kodu çerçeveye getirin.</p>`,
    onClose: () => { done = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); } });
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { md.close(); toast('Kameraya izin verilmedi. Tarayıcı ayarlarından izin verin ya da telefonun kamerasıyla okutun.', 'err'); return; }
  const v = $('#qrsV', md.el); v.srcObject = stream;
  if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; } }
  if (!det) { try { await loadVendor('jsqr'); } catch (e) { /* */ } }
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
  const found = (txt) => {
    const m = /#\/qr\/([A-Za-z0-9_-]{20,64})/.exec(String(txt || ''));
    if (!m || done) return false;
    done = true; md.close();
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* */ } }
    location.hash = '#/qr/' + m[1];
    return true;
  };
  const step = async () => {
    if (done) return;
    if (v.readyState >= 2) {
      try {
        if (det) { const r = await det.detect(v); if (r[0] && found(r[0].rawValue)) return; }
        else if (window.jsQR) {
          const w = Math.min(640, v.videoWidth); const h = Math.round(v.videoHeight * (w / v.videoWidth));
          cv.width = w; cv.height = h; cx.drawImage(v, 0, 0, w, h);
          const r = window.jsQR(cx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          if (r && found(r.data)) return;
        }
      } catch (e) { /* bir sonraki karede */ }
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
};

/* ---------------- Hesabım › Güvenlik: bilgisayarda oturum aç + bağlı cihazlar ---------------- */
function qrSecHtml() {
  return html`<div class="card card-pad stack"><h3 class="ph">${icon('qr', 'sm')} Bilgisayarda oturum aç</h3>
      <p class="small muted">Bilgisayarda giriş ekranındaki “Telefonla QR kod okutarak giriş”e basın, çıkan karekodu buradan okutun. Şifre yazmanıza gerek kalmaz.</p>
      <div><button class="btn primary" data-act="qr-scan">${icon('camera', 'sm')}QR kodu okut</button></div></div>
    <div class="card card-pad stack" id="usBox"><h3 class="ph">${icon('lock', 'sm')} Bağlı cihazlar</h3><div class="skel" style="height:14px;width:60%"></div></div>`;
}
async function qrSecMount() {
  const box = $('#usBox'); if (!box) return;
  let r;
  try { r = await api('me.sessions'); } catch (e) { setHTML(box, html`<p class="small muted">${e.message}</p>`); return; }
  const others = r.items.filter((x) => !x.current);
  setHTML(box, html`<h3 class="ph">${icon('lock', 'sm')} Bağlı cihazlar</h3>
    <p class="small muted">Hesabınızın açık olduğu cihazlar. Tanımadığınız ya da başkasının kullanabileceği bir cihaz varsa çıkış yapın.</p>
    <div class="list us-list">${r.items.map((x) => html`<div class="list-row"><span class="cat-ico sm tone-${x.current ? 'emerald' : x.via === 'qr' ? 'indigo' : 'slate'}">${icon(x.via === 'qr' ? 'qr' : 'phone', 'sm')}</span>
      <div class="grow" style="min-width:0"><div class="lr-t">${x.label}${x.current ? html` <span class="badge brand">bu cihaz</span>` : ''}</div>
      <div class="lr-s">${x.via} ile · son etkinlik ${fmtRel(x.last_seen)} · IP ${x.ip}${x.idle_min ? ` · ${Math.round(x.idle_min / 60)} saat boşta kalınca kapanır` : ''}</div></div>
      ${x.current ? '' : html`<button class="btn sm ghost danger" data-act="us-revoke" data-id="${x.id}">Çıkış yap</button>`}</div>`)}</div>
    ${others.length ? html`<div><button class="btn danger" data-act="us-revoke-all">${icon('logout', 'sm')}Diğer tüm cihazlardan çıkış yap (${others.length})</button></div>` : ''}`);
}
ACT['us-revoke'] = async (el) => {
  if (!(await confirmDialog({ title: 'Bu cihazda çıkış yapılsın mı?', text: 'O cihazdaki oturum hemen kapanır.', ok: 'Çıkış yap', danger: true }))) return;
  try { await api('me.sessions.revoke', { id: +el.dataset.id }); toast('Cihazda oturum kapatıldı'); qrSecMount(); } catch (e) { toast(e.message, 'err'); }
};
ACT['us-revoke-all'] = async () => {
  if (!(await confirmDialog({ title: 'Diğer tüm cihazlardan çıkış yapılsın mı?', text: 'Bu cihaz dışındaki bütün oturumlarınız hemen kapanır.', ok: 'Hepsinden çıkış yap', danger: true }))) return;
  try { const r = await api('me.sessions.revoke', { others: true }); toast(r.closed + ' cihazda oturum kapatıldı'); qrSecMount(); } catch (e) { toast(e.message, 'err'); }
};
Object.assign(NM_EXT.audit, { 'qr.approve': 'Bilgisayara QR ile girişi onayladı', 'qr.login': 'QR ile bilgisayarda oturum açtı', 'sessions.revoke': 'Başka cihazdaki oturumu kapattı' });

/** Oturum başka cihazdan kapatıldığında bu cihazda kalan kişisel izleri sil (ağ isteği yapmadan) */
function secureWipe() {
  try { if (typeof offlineCacheClear === 'function') offlineCacheClear(); } catch (e) { /* */ }
  try { if (typeof pwaClearFileCache === 'function') pwaClearFileCache(); } catch (e) { /* */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('nm-draft-')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* */ }
}
