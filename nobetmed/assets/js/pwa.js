/* dupcii — PWA: service worker kaydı ve push bildirimleri */
'use strict';

let _nmSwReg = null;

function registerSW() {
  if (!('serviceWorker' in navigator) || window.NM_DEMO_API || !window.isSecureContext) return Promise.resolve(null);
  if (_nmSwReg) return _nmSwReg;
  const sw = navigator.serviceWorker;
  let hadController = !!sw.controller;
  let reloading = false;

  // Yeni sürüm devraldığında bir kez yenile (ilk kurulumdaki clients.claim() yenileme yapmaz)
  sw.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  // Bildirime tıklanınca SW buraya adres gönderir
  sw.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type !== 'NAVIGATE' || !d.url) return;
    try {
      const u = new URL(d.url, location.href);
      if (u.origin !== location.origin) return;
      const here = new URL(location.href);
      if (u.pathname === here.pathname && u.search === here.search) {
        if (location.hash !== u.hash) location.hash = u.hash;
      } else {
        location.href = u.href;
      }
    } catch (err) { /* */ }
  });

  const activate = (worker) => {
    if (!worker || !sw.controller) return;
    // Açık bir pencere/editör varsa (yazılan metin kaybolmasın) kapanana kadar bekle
    if (typeof modalStack !== 'undefined' && modalStack.length) { setTimeout(() => activate(worker), 5000); return; }
    try { toast('Yeni sürüm hazır, sayfa yenileniyor…'); } catch (e) { /* */ }
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  _nmSwReg = sw.register('sw.js' + (typeof BOOT !== 'undefined' && BOOT.v ? '?v=' + encodeURIComponent(BOOT.v) : ''), { scope: './', updateViaCache: 'none' }).then((reg) => {
    if (reg.waiting) activate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed') activate(nw); });
    });
    // Uzun açık kalan sekmelerde güncellemeyi ara sıra denetle
    let last = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 3600e3) { last = Date.now(); reg.update().catch(() => {}); }
    });
    return reg;
  }).catch((e) => {
    console.warn('Service worker kaydedilemedi:', e);
    _nmSwReg = null;
    return null;
  });
  return _nmSwReg;
}

function _nmIsIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function _nmStandalone() {
  return navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
}

/** @returns {{ok: boolean, reason: string}} */
function pushSupportInfo() {
  if (window.NM_DEMO_API) return { ok: false, reason: 'Önizleme modunda bildirimler kullanılamaz.' };
  const ios = _nmIsIOS();
  if (ios) {
    const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent || '');
    if (m && (Number(m[1]) < 16 || (Number(m[1]) === 16 && Number(m[2]) < 4))) {
      return { ok: false, reason: 'Bildirimler için iOS 16.4 veya üzeri gerekir. Lütfen iPhone’unuzu güncelleyin.' };
    }
    if (!_nmStandalone()) return { ok: false, reason: 'iPhone’da önce “Ana Ekrana Ekle” ile uygulamayı yükleyin, sonra uygulamayı ana ekrandan açıp bildirimleri açın.' };
  }
  if (!window.isSecureContext) return { ok: false, reason: 'Bildirimler için site HTTPS üzerinden açılmalıdır.' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'Bu tarayıcı anlık bildirimleri desteklemiyor. Güncel Chrome, Edge, Firefox veya Safari kullanın.' };
  }
  return { ok: true, reason: '' };
}

function pushSupported() { return pushSupportInfo().ok; }

function urlBase64ToUint8Array(b64u) {
  const s = String(b64u).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function _nmPushReg() {
  let reg = await registerSW();
  if (!reg && 'serviceWorker' in navigator) reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Bildirim servisi başlatılamadı. Sayfayı yenileyip tekrar deneyin.');
  if (!reg.active) {
    // Kurulum sürüyorsa etkinleşmesini bekle (en fazla 10 sn)
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 10000))]);
  }
  return reg;
}

function _nmSameKey(sub, keyBytes) {
  const cur = sub && sub.options && sub.options.applicationServerKey;
  if (!cur) return true; // bilinmiyorsa dokunma
  const a = new Uint8Array(cur);
  if (a.length !== keyBytes.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== keyBytes[i]) return false;
  return true;
}

/** Bildirimleri açar. true: açıldı, false: izin penceresi kapatıldı. Reddedilirse/hata olursa Error fırlatır. */
async function pushEnable() {
  const info = pushSupportInfo();
  if (!info.ok) throw new Error(info.reason);
  // İzin isteği kullanıcı etkileşiminden hemen sonra yapılmalı (Safari), bu yüzden ilk await bu.
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await new Promise((resolve) => {
      const p = Notification.requestPermission(resolve); // eski Safari geri çağırma kullanır
      if (p && p.then) p.then(resolve, () => resolve('default'));
    });
  }
  if (perm === 'denied') throw new Error('Bildirim izni reddedildi. Tarayıcı ya da telefon ayarlarından dupcii için bildirimlere izin verin.');
  if (perm !== 'granted') return false;

  const reg = await _nmPushReg();
  const { key } = await api('push.key');
  if (!key) throw new Error('Sunucuda bildirim anahtarı tanımlı değil.');
  const keyBytes = urlBase64ToUint8Array(key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !_nmSameKey(sub, keyBytes)) { try { await sub.unsubscribe(); } catch (e) { /* */ } sub = null; }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes });
    } catch (e) {
      if (Notification.permission === 'denied') throw new Error('Bildirim izni reddedildi. Tarayıcı ya da telefon ayarlarından dupcii için bildirimlere izin verin.');
      throw new Error('Bildirim aboneliği oluşturulamadı: ' + (e && e.message ? e.message : 'bilinmeyen hata'));
    }
  }
  const j = sub.toJSON();
  await api('push.subscribe', { endpoint: j.endpoint, p256dh: (j.keys || {}).p256dh || '', auth: (j.keys || {}).auth || '' });
  return true;
}

/** Bildirimleri kapatır (bu cihaz). */
async function pushDisable() {
  if (!('serviceWorker' in navigator)) return true;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
  if (!sub) return true;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (e) { /* */ }
  try { await api('push.unsubscribe', { endpoint }); } catch (e) { /* sunucu sonraki gönderimde 410 alıp siler */ }
  return true;
}

/** @returns {Promise<'unsupported'|'denied'|'on'|'off'>} */
async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch (e) { return 'off'; }
}

/** Oturum açıldıktan sonra çağrılabilir: tarayıcının yenilediği aboneliği sunucuya yeniden bildirir. */
async function pushSync() {
  if ((await pushState()) !== 'on') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg.pushManager.getSubscription();
    const j = sub.toJSON();
    await api('push.subscribe', { endpoint: j.endpoint, p256dh: (j.keys || {}).p256dh || '', auth: (j.keys || {}).auth || '' });
    return true;
  } catch (e) { return false; }
}

/** Çıkışta çağrılmalı: bu cihazda önbelleğe alınmış ek dosyalarını siler. */
async function pwaClearFileCache() {
  try { if (window.caches) await caches.delete('nm-files'); } catch (e) { /* */ }
}
