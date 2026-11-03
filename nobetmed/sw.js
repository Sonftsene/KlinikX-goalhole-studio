/* dupcii — service worker (çevrimdışı kabuk + boş push bildirimleri) */
'use strict';

// Sürüm, index.php'nin kayıtta verdiği ?v= değerinden gelir: yeni sürümde eski önbellekler silinir, kabuk yeniden indirilir
const VERSION = 'v' + (new URL(self.location.href).searchParams.get('v') || '1').replace(/[^0-9A-Za-z.-]/g, '');
self.__NM_SW_VERSION = VERSION;

/** Önceden önbelleğe alınan uygulama kabuğu (sw.js'e göre göreli). */
const SHELL_ASSETS = [
  './',
  'assets/app.css',
  'assets/theme.js',
  'assets/icon.svg',
  'assets/icon-192.png',
  'manifest.webmanifest',
];
/** assets/js/ altındaki betikler (index.php'deki listeyle aynı tutun). */
const JS_FILES = ['core', 'auth', 'posts', 'viewer', 'rosters', 'admin', 'main', 'shiftparse', 'extras', 'pwa'];
const PRECACHE = SHELL_ASSETS.concat(JS_FILES.map((n) => 'assets/js/' + n + '.js'));

const SHELL_CACHE = 'nm-shell-' + VERSION;
const VENDOR_CACHE = 'nm-vendor-1'; // assets/vendor/*.js (~1 MB'lık kitaplıklar); kitaplık güncellenince artırın
const FILES_CACHE = 'nm-files';
const FONT_CACHE = 'nm-fonts';
const KEEP = [SHELL_CACHE, VENDOR_CACHE, FILES_CACHE, FONT_CACHE];

const FILES_MAX_ENTRIES = 80;
const FILES_MAX_BYTES = 25 * 1024 * 1024;

const SCOPE = new URL(self.registration.scope);
const ROOT_URL = SCOPE.href; // .../nobetmed/
const abs = (p) => new URL(p, SCOPE).href;

/* ---------------- Yaşam döngüsü ---------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(PRECACHE.map(async (p) => {
      try {
        const res = await fetch(new Request(abs(p), { cache: 'reload', credentials: 'same-origin' }));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await cache.put(abs(p), res);
      } catch (e) {
        if (p === './') throw e; // kabuk olmadan kurulum anlamsız
        console.warn('[sw] önbelleğe alınamadı:', p, e && e.message);
      }
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('nm-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  // Yalnızca yerel testler için: gerçek push servisi olmadan 'push' akışını çalıştırır
  if (d.type === 'TEST_PUSH' && self.location.hostname === '127.0.0.1') event.waitUntil(handlePush());
});

/* ---------------- İstek yönlendirme ---------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST api çağrıları ağdan
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(ROOT_URL)) return;
    const path = url.pathname.slice(SCOPE.pathname.length);
    if (path === 'api.php') {
      if (url.searchParams.get('action') === 'file') event.respondWith(fileStrategy(event));
      return; // diğer api istekleri doğrudan ağa
    }
    if (path === 'sw.js') return;
    if (req.mode === 'navigate') { event.respondWith(navigationStrategy(event)); return; }
    if (path.startsWith('assets/vendor/')) { event.respondWith(vendorStrategy(event)); return; }
    if (path.startsWith('assets/') || path === 'manifest.webmanifest') { event.respondWith(assetStrategy(event)); return; }
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fontStrategy(event));
  }
});

/** Sayfa: önce ağ, olmazsa önbellekteki kabuk. */
async function navigationStrategy(event) {
  const req = event.request;
  const url = new URL(req.url);
  const isRoot = !url.search && (url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.php');
  try {
    const res = await fetch(req);
    // Yalnızca sorgusuz kök sayfayı sakla (paylaşım/sıfırlama bağlantılarındaki belirteçler önbelleğe girmesin)
    if (isRoot && res.status === 200 && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(ROOT_URL, copy)).catch(() => {}));
    }
    return res;
  } catch (e) {
    const cached = await caches.match(ROOT_URL, { cacheName: SHELL_CACHE }) || await caches.match(ROOT_URL);
    if (cached) return cached;
    return new Response('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>dupcii</title><p style="font:16px system-ui;padding:24px">Çevrimdışısınız. İnternet bağlantısı gelince sayfayı yenileyin.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/** Sürümlü (?v=) ya da sürümsüz statik dosyalar: bayat-iken-yenile. Sorgu dizesi göz ardı edilerek eşleşir. */
async function assetStrategy(event) {
  const req = event.request;
  const url = new URL(req.url);
  const cache = await caches.open(SHELL_CACHE);
  const exact = await cache.match(req);
  const loose = exact || await cache.match(req, { ignoreSearch: true });

  const network = fetch(req).then(async (res) => {
    if (res.ok && res.type === 'basic') {
      await cache.put(req, res.clone());
      // Aynı dosyanın eski sürümlü (?v=eski) kopyalarını sil
      const siblings = await cache.keys(req, { ignoreSearch: true });
      await Promise.all(siblings.filter((k) => k.url !== req.url && new URL(k.url).search !== '').map((k) => cache.delete(k)));
    }
    return res;
  });

  // İstenen sürüm önbellekte yoksa (yeni sürüm) önce ağı dene; çevrimdışıysa eldeki sürümü ver.
  if (!exact && url.search && loose) {
    try { return await network; } catch (e) { return loose; }
  }
  if (loose) {
    event.waitUntil(network.catch(() => {}));
    return loose;
  }
  return network;
}

/** assets/vendor: ilk kullanımda indirilir, sonra önbellekten. */
async function vendorStrategy(event) {
  const req = event.request;
  const cache = await caches.open(VENDOR_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
  return res;
}

/** api.php?action=file&id=N — kimlik başına değişmez: önce önbellek. Range isteklerine önbellekteki tam dosyadan 206 döner. */
async function fileStrategy(event) {
  const req = event.request;
  const range = req.headers.get('Range');
  const key = new URL(req.url);
  key.hash = '';
  const cache = await caches.open(FILES_CACHE);
  const hit = await cache.match(key.href);

  if (range) {
    if (hit) {
      try { return await rangeResponse(hit, range); } catch (e) { /* ağa düş */ }
    }
    return fetch(req);
  }
  if (hit) return hit;

  const res = await fetch(req);
  const len = Number(res.headers.get('Content-Length') || -1);
  if (res.status === 200 && res.type === 'basic' && len >= 0 && len <= FILES_MAX_BYTES) {
    const copy = res.clone();
    event.waitUntil((async () => {
      await cache.put(key.href, copy);
      const keys = await cache.keys();
      for (let i = 0; i < keys.length - FILES_MAX_ENTRIES; i++) await cache.delete(keys[i]); // en eskiler
    })().catch(() => {}));
  }
  return res;
}

async function rangeResponse(full, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) throw new Error('range');
  const blob = await full.blob();
  const size = blob.size;
  let start; let end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  const headers = new Headers(full.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

/** Google Fonts: bayat-iken-yenile (isteğe bağlı, küçük). */
async function fontStrategy(event) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(event.request, res.clone()).catch(() => {});
    return res;
  });
  if (hit) { event.waitUntil(network.catch(() => {})); return hit; }
  return network;
}

/* ---------------- Push ---------------- */
self.addEventListener('push', (event) => {
  event.waitUntil(handlePush());
});

async function handlePush() {
  let items = [];
  try {
    const res = await fetch(abs('api.php?action=push.pending'), {
      credentials: 'include',
      cache: 'no-store',
      headers: { 'X-NM-SW': '1' },
    });
    const json = await res.json();
    if (json && json.ok && Array.isArray(json.items)) items = json.items;
  } catch (e) { /* aşağıda genel bildirim */ }

  const opts = (o) => Object.assign({ icon: abs('assets/icon-192.png'), badge: abs('assets/icon-192.png'), renotify: true }, o);

  if (!items.length) {
    // Tarayıcılar her push için bir bildirim ister. Zaten görünen bir bildirimimiz varsa onu sessizce yenile.
    const shown = await self.registration.getNotifications();
    if (shown.length) {
      const n = shown[shown.length - 1];
      return self.registration.showNotification(n.title, { body: n.body, tag: n.tag || 'nm-generic', icon: n.icon, badge: n.badge, data: n.data, renotify: false });
    }
    return self.registration.showNotification('dupcii', opts({ body: 'Yeni bildirim', tag: 'nm-generic', data: { url: ROOT_URL } }));
  }

  if (items.length > 3) {
    const titles = items.slice(0, 4).map((it) => '• ' + String(it.title || '')).join('\n');
    return self.registration.showNotification(items.length + ' yeni bildirim', opts({
      body: titles + (items.length > 4 ? '\n…' : ''),
      tag: 'nm-summary',
      data: { url: ROOT_URL },
    }));
  }

  await Promise.all(items.map((it) => self.registration.showNotification(String(it.title || 'dupcii'), opts({
    body: String(it.body || ''),
    tag: String(it.tag || ('nm-' + (it.id != null ? it.id : Date.now()))),
    data: { url: safeUrl(it.url) },
  }))));
}

/** '#/p/12' gibi göreli adresleri kapsam köküne göre çözer; başka kökenlere izin vermez. */
function safeUrl(u) {
  try {
    const url = new URL(String(u || ''), SCOPE);
    return url.origin === self.location.origin ? url.href : ROOT_URL;
  } catch (e) { return ROOT_URL; }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((c) => c.url.startsWith(ROOT_URL));
    if (win) {
      try { await win.focus(); } catch (e) { /* */ }
      try {
        win.postMessage({ type: 'NAVIGATE', url: target });
        return;
      } catch (e) {
        if ('navigate' in win) { try { await win.navigate(target); return; } catch (e2) { /* */ } }
      }
    }
    await self.clients.openWindow(target);
  })());
});
