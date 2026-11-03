/* NöbetMed — çekirdek yardımcılar */
'use strict';

const BOOT = (() => {
  try { return JSON.parse(document.getElementById('nm-boot').textContent || '{}'); } catch (e) { return {}; }
})();

/** Uygulama durumu */
const S = {
  csrf: BOOT.csrf || '',
  me: null,
  settings: {},
  categories: [],
  units: [],
  titles: [],
  rosters: [],
  people: [],
  counts: { unread: 0, unread_by_cat: {}, todo: 0, saved: 0, pending_posts: 0, pending_users: 0 },
  google_client_id: '',
  upload_max_mb: 0,
  bannerHidden: false,
};

/* ---------------- API ---------------- */
class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(action, data = {}) {
  if (window.NM_DEMO_API) {
    try { return await window.NM_DEMO_API.call(action, data); } catch (e) { throw new ApiError(e.message, e.status || 400); }
  }
  let res;
  // Çevrimdışı önbellek kişiye özeldir (boot hariç: çevrimdışı açılışta hangi hesabın açık olduğunu o söyler)
  const ck = OFFLINE_READ.has(action) ? 'nm-off:' + action + ':' + (action === 'boot' ? '' : (S.me ? S.me.id : 0) + ':') + JSON.stringify(data) : null;
  try {
    res = await fetch('api.php?action=' + encodeURIComponent(action), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf },
      body: JSON.stringify(data),
    });
  } catch (e) {
    const cached = ck && offlineGet(ck);
    if (cached) { setOffline(true); return cached; }
    throw new ApiError('Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.', 0);
  }
  if (OFFLINE.on) setOffline(false);
  let json = null;
  try { json = await res.json(); } catch (e) { /* geçersiz yanıt */ }
  if (!json) throw new ApiError('Sunucudan geçersiz yanıt alındı (' + res.status + ').', res.status);
  if (!json.ok) {
    if ((res.status === 401 || res.status === 419) && S.me && action !== 'auth.login') {
      toast('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.', 'err');
      setTimeout(() => location.reload(), 1200);
    }
    throw new ApiError(json.error || 'İşlem başarısız.', res.status);
  }
  if (json.csrf) S.csrf = json.csrf;
  if (ck) offlinePut(ck, json, action);
  return json;
}

/* ---------------- Çevrimdışı görüntüleme ----------------
   Okuma isteklerinin son yanıtı bu cihazda saklanır; internet yokken bunlar gösterilir.
   Dosyalar (PDF/Excel) service worker önbelleğinden gelir. Çıkışta tümü silinir. */
const OFFLINE_READ = new Set(['boot', 'counts', 'posts.list', 'posts.get', 'rosters.list', 'shifts.my', 'shifts.day', 'people.list', 'notif.list']);
const OFFLINE = { on: false };
function offlineGet(k) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function offlinePut(k, json, action) {
  if (action === 'boot' && !json.me) return;
  try {
    const s = JSON.stringify({ ...json, csrf: undefined });
    if (s.length > 400000) return;
    localStorage.setItem(k, s);
  } catch (e) {
    // Kota doldu: eski kayıtları sil, bir kez daha dene
    offlineCacheClear(['nm-off:boot:']);
    try { localStorage.setItem(k, JSON.stringify({ ...json, csrf: undefined })); } catch (e2) { /* */ }
  }
}
function offlineCacheClear(keep = []) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('nm-off:') && !keep.some((p) => k.startsWith(p))).forEach((k) => localStorage.removeItem(k));
  } catch (e) { /* */ }
}
function setOffline(on) {
  OFFLINE.on = on;
  let bar = document.getElementById('offlineBar');
  if (on && !bar) {
    bar = document.createElement('div');
    bar.id = 'offlineBar';
    bar.className = 'offline-bar';
    bar.innerHTML = fmtVal(html`${icon('wifiOff', 'sm')}<span>Çevrimdışısınız · son kaydedilen bilgiler gösteriliyor</span>`);
    document.body.appendChild(bar);
  } else if (!on && bar) bar.remove();
}
window.addEventListener('online', () => { if (OFFLINE.on && S.me && typeof refreshCounts === 'function') { setOffline(false); refreshCounts(); } });

/** Dosyayı parçalara bölerek yükler: sunucunun PHP yükleme sınırı dosya boyutunu kısıtlamaz. */
async function uploadFile(file, onProgress) {
  if (window.NM_DEMO_API) return window.NM_DEMO_API.upload(file, onProgress);
  const init = await api('upload.init', { name: file.name, size: file.size });
  const size = init.chunk_size || 2097152;
  let offset = 0;
  const sendChunk = (blob, at) => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('token', init.token);
    fd.append('offset', String(at));
    fd.append('chunk', blob, 'parca');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api.php?action=upload.chunk');
    xhr.setRequestHeader('X-CSRF', S.csrf);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress && file.size) onProgress(Math.min(0.999, (at + e.loaded) / file.size)); };
    xhr.onload = () => {
      let json = null;
      try { json = JSON.parse(xhr.responseText); } catch (e) { /* */ }
      if (json && json.ok) return resolve(json);
      const err = new ApiError((json && json.error) || 'Dosya parçası gönderilemedi (' + xhr.status + ').', xhr.status);
      err.retry = !json || xhr.status >= 500 || xhr.status === 0;
      reject(err);
    };
    xhr.onerror = () => { const e = new ApiError('Yükleme sırasında bağlantı kesildi.', 0); e.retry = true; reject(e); };
    xhr.send(fd);
  });
  while (offset < file.size) {
    const blob = file.slice(offset, offset + size);
    for (let attempt = 1; ; attempt++) {
      try { await sendChunk(blob, offset); break; } catch (e) {
        if (!e.retry || attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    offset += blob.size;
    if (onProgress) onProgress(Math.min(0.999, offset / file.size));
  }
  const fin = await api('upload.finish', { token: init.token });
  if (onProgress) onProgress(1);
  return fin.attachment;
}

/* ---------------- HTML ---------------- */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtVal(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmtVal).join('');
  return esc(v);
}
function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += fmtVal(vals[i]); });
  return new Raw(out);
}
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function setHTML(el, content) { if (el) el.innerHTML = fmtVal(content); }

/* ---------------- Simgeler ---------------- */
const ICON_PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z M15 9a3 3 0 0 1 0 6 M18 6a7 7 0 0 1 0 12',
  play: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M10 8.5v7l6-3.5z',
  stethoscope: 'M5 3H4v5a5 5 0 0 0 10 0V3h-1 M9 13v1.5a5.5 5.5 0 0 0 11 0V13 M20 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h4',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M22 20v-1a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z M8.5 8.5l7 7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  clipboard: 'M9 3h6v4H9z M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3 M9 14l2 2 4-4',
  heart: 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z',
  folder: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  bookmark: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  x: 'M18 6 6 18 M6 6l12 12',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  pin: 'M12 17v5 M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
  trash: 'M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  edit: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M14.12 14.12a3 3 0 1 1-4.24-4.24 M1 1l22 22',
  chevL: 'M15 18l-6-6 6-6',
  chevR: 'M9 18l6-6-6-6',
  chevD: 'M6 9l6 6 6-6',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  printer: 'M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  paperclip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4',
  chart: 'M3 3v18h18 M18 17V9 M13 17V5 M8 17v-3',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  key: 'M15.5 7.5 19 4 M21 2l-2 2 M15.5 7.5l3 3L22 7l-3-3 M11.39 11.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
  expand: 'M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7',
  table: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M22 6l-10 7L2 6',
  fingerprint: 'M12 11v3a8 8 0 0 1-1 4 M8.5 7.5A5 5 0 0 1 17 11v1.5 M7 11a5 5 0 0 1 .3-1.7 M5 19.5c1-2 1.5-4 1.5-6.5V11 M17 16c-.2 1.7-.6 3.3-1.3 4.7 M2 12a10 10 0 0 1 18-6 M21.8 10a10 10 0 0 1 .2 2c0 1.4-.1 2.7-.3 4 M9 21.5c.9-1.8 1.5-4 1.5-6.5V11a1.5 1.5 0 0 1 3 0v1',
  wifiOff: 'M1 1l22 22 M16.72 11.06A10.94 10.94 0 0 1 19 12.55 M5 12.55a10.94 10.94 0 0 1 5.17-2.39 M10.71 5.05A16 16 0 0 1 22.58 9 M1.42 9a15.91 15.91 0 0 1 4.7-2.88 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01',
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v.01 M14 20h.01 M17 17h4v4h-4',
  history: 'M3 3v5h5 M3.05 13A9 9 0 1 0 6 5.3L3 8 M12 7v5l4 2',
};
function icon(name, cls = '') {
  const d = ICON_PATHS[name] || ICON_PATHS.folder;
  return raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`);
}
const BRAND_MARK = raw('<span class="brand-mark"><svg viewBox="0 0 24 24"><path d="M3 12.5h3.5l2-4.5 3.5 9 2.5-6 1.5 2h5"/></svg></span>');

/* ---------------- Biçimlendirme ---------------- */
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TR_MONTHS_S = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const TR_DAYS_S = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function parseDT(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
const pad = (n) => String(n).padStart(2, '0');
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hm(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(s, withYear) {
  const d = parseDT(s); if (!d) return '';
  const y = withYear || d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]}${y}`;
}
function fmtDateTime(s) { const d = parseDT(s); return d ? `${fmtDate(s)} ${hm(d)}` : ''; }
function fmtRel(s) {
  const d = parseDT(s); if (!d) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'az önce';
  if (diff < 3600) return Math.floor(diff / 60) + ' dk önce';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  const days = Math.round((today - dd) / 86400000);
  if (days === 0) return Math.max(1, Math.floor(diff / 3600)) + ' sa önce';
  if (days === 1) return 'Dün ' + hm(d);
  if (days < 7) return TR_DAYS[d.getDay()] + ' ' + hm(d);
  return fmtDate(s);
}
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
}
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toLocaleUpperCase('tr-TR');
}
const TONES = ['teal', 'sky', 'indigo', 'violet', 'rose', 'amber', 'emerald'];
function toneFor(str) {
  let h = 0; const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
/* Profil fotoğrafları: ada göre bulunur (nöbet listesindeki BÜYÜK HARFLİ yazılış da eşleşir) */
const AVX = { ref: null, me: null, map: new Map() };
function avKey(n) { return trLower(n).replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }[c])).replace(/\s+/g, ' ').trim(); }
function avatarUrlFor(name) {
  if (!name) return null;
  if (AVX.ref !== S.people || AVX.me !== (S.me && S.me.avatar)) {
    AVX.ref = S.people; AVX.me = S.me && S.me.avatar;
    AVX.map = new Map((S.people || []).filter((p) => p.avatar).map((p) => [avKey(p.name), p.avatar]));
    if (S.me) { if (S.me.avatar) AVX.map.set(avKey(S.me.name), S.me.avatar); else AVX.map.delete(avKey(S.me.name)); }
  }
  return AVX.map.get(avKey(name)) || null;
}
function avatar(name, size = '', url) {
  const u = url === undefined ? avatarUrlFor(name) : url;
  if (u) return html`<span class="avatar ${size} has-img" data-i="${initials(name)}"><img class="av-img" src="${u}" alt="" loading="lazy" decoding="async"></span>`;
  return html`<span class="avatar ${size} tone-${toneFor(name)}">${initials(name)}</span>`;
}
// Fotoğraf yüklenemezse (ör. çevrimdışı) baş harfleri göster
document.addEventListener('error', (e) => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('av-img')) return;
  const sp = t.parentNode;
  sp.classList.remove('has-img'); sp.classList.add('tone-slate');
  sp.textContent = sp.dataset.i || '';
}, true);
function trLower(s) { return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr-TR'); }
function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

/* ---------------- Sözlük yardımcıları ---------------- */
const byId = (list, id) => list.find((x) => x.id === id) || null;
const catOf = (id) => byId(S.categories, id) || { id, name: 'Bölüm', icon: 'folder', color: 'slate' };
const unitName = (id) => (byId(S.units, id) || {}).name || '';
const titleName = (id) => (byId(S.titles, id) || {}).name || '';
const ROLE_LABEL = { admin: 'Yönetici', editor: 'Yayıncı', member: 'Üye' };
const ROLE_HINT = {
  admin: 'Tüm ayarlar, kullanıcılar ve içerikler',
  editor: 'Onaysız yayın, içerik onayı ve nöbet çizelgesi',
  member: 'Görüntüleme; eklediği içerikler onaya gider',
};
const isAdmin = () => S.me && S.me.role === 'admin';
const isPublisher = () => S.me && (S.me.role === 'admin' || S.me.role === 'editor');
function catIcon(cat, size = '') {
  return html`<span class="cat-ico ${size} tone-${cat.color}">${icon(cat.icon)}</span>`;
}

/* ---------------- Olay yönetimi ---------------- */
const ACT = {};
const FORMS = {};
const CHANGE = {};
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const fn = ACT[t.dataset.act];
  if (fn) { ev.preventDefault(); fn(t, ev); }
});
document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('form[data-form]');
  if (!f) return;
  ev.preventDefault();
  const fn = FORMS[f.dataset.form];
  if (fn) fn(f, ev);
});
['change', 'input'].forEach((type) => document.addEventListener(type, (ev) => {
  const t = ev.target.closest('[data-' + type + ']');
  if (!t) return;
  const fn = CHANGE[t.dataset[type]];
  if (fn) fn(t, ev);
}));

function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  }
  return o;
}

async function busy(btn, fn) {
  if (!btn) return fn();
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner sm"></span>' + (btn.classList.contains('icon') ? '' : '<span>' + esc(btn.textContent.trim()) + '</span>');
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = prev; }
}

function showFormError(form, msg) {
  let box = form.querySelector('[data-err]');
  if (!box) return toast(msg, 'err');
  box.textContent = msg;
  box.classList.toggle('hidden', !msg);
}

/** Formu gönderirken butonu kilitler, hatayı forma yazar */
async function submitForm(form, fn) {
  const btn = form.querySelector('button[type=submit]') || document.querySelector(`button[form="${form.id}"]`);
  showFormError(form, '');
  try {
    await busy(btn, () => fn(formData(form)));
  } catch (e) {
    showFormError(form, e.message || 'İşlem başarısız.');
  }
}

/* ---------------- Bildirim ---------------- */
function toast(msg, type = 'ok') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = fmtVal(html`${icon(type === 'err' ? 'alert' : 'checkCircle')}<span>${msg}</span>`);
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, type === 'err' ? 4800 : 3000);
}

/* ---------------- Modal ---------------- */
const modalStack = [];
function openModal({ title, body = '', foot = '', size = '', drawer = false, onClose } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (drawer ? ' drawer' : '');
  ov.innerHTML = fmtVal(html`
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${title || ''}">
      <div class="modal-head"><h2 class="grow ellipsis">${title || ''}</h2><button class="btn ghost icon sm" data-act="close-modal" aria-label="Kapat">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot ${foot ? '' : 'hidden'}">${foot}</div>
    </div>`);
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const m = {
    el: ov,
    body: ov.querySelector('.modal-body'),
    head: ov.querySelector('.modal-head h2'),
    footEl: ov.querySelector('.modal-foot'),
    setTitle(t) { this.head.textContent = t; },
    setBody(b) { setHTML(this.body, b); },
    setFoot(f) { setHTML(this.footEl, f); this.footEl.classList.toggle('hidden', !f || !fmtVal(f)); },
    close() {
      const i = modalStack.indexOf(m);
      if (i >= 0) modalStack.splice(i, 1);
      ov.remove();
      if (!modalStack.length) document.body.style.overflow = '';
      if (onClose) onClose();
    },
  };
  let downOnOverlay = false;
  ov.addEventListener('mousedown', (e) => { downOnOverlay = e.target === ov; });
  ov.addEventListener('click', (e) => { if (e.target === ov && downOnOverlay) m.close(); });
  modalStack.push(m);
  // Klavye odağı pencerede kalsın; kapanınca açan öğeye dönsün
  const opener = document.activeElement;
  const _close = m.close;
  m.close = () => { _close(); if (opener && opener.focus && document.body.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) { /* */ } } };
  ov.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...ov.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });
  const first = ov.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select');
  if (first && window.innerWidth > 900) first.focus({ preventScroll: true });
  else { const c = ov.querySelector('[data-act=close-modal]'); if (c) c.focus({ preventScroll: true }); }
  return m;
}
ACT['close-modal'] = (el) => {
  const ov = el.closest('.overlay');
  const m = modalStack.find((x) => x.el === ov);
  if (m) m.close();
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('.menu')) return closeMenu();
    const m = modalStack[modalStack.length - 1];
    if (m) m.close();
  }
});

function confirmDialog({ title, text, ok = 'Onayla', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title, size: 'narrow',
      body: html`<p class="muted">${text}</p>`,
      foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn ${danger ? 'solid-danger' : 'primary'}" data-ok>${ok}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}

function promptDialog({ title, label, placeholder = '', ok = 'Kaydet', value = '', multiline = false, danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const input = multiline
      ? html`<textarea class="textarea" style="min-height:90px" name="v" placeholder="${placeholder}">${value}</textarea>`
      : html`<input class="input" name="v" placeholder="${placeholder}" value="${value}">`;
    const m = openModal({
      title, size: 'narrow',
      body: html`<form class="field" data-prompt><label>${label}</label>${input}</form>`,
      foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn ${danger ? 'solid-danger' : 'primary'}" data-ok>${ok}</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const finish = () => { done = true; const v = m.el.querySelector('[name=v]').value.trim(); m.close(); resolve(v); };
    m.el.querySelector('[data-ok]').addEventListener('click', finish);
    m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); finish(); });
  });
}

/* ---------------- Açılır menü ---------------- */
function closeMenu() { const m = $('.menu'); if (m) m.remove(); }
function openMenu(anchor, items) {
  closeMenu();
  const el = document.createElement('div');
  el.className = 'menu';
  el.innerHTML = fmtVal(items.map((it) => {
    if (it === '-') return raw('<hr>');
    if (it.head) return html`<div class="m-head">${it.head}</div>`;
    return html`<button type="button" class="${it.danger ? 'danger' : ''}" data-mi="${it.id}">${icon(it.icon)}<span>${it.label}</span></button>`;
  }));
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = Math.min(r.right - w, window.innerWidth - w - 8);
  left = Math.max(8, left);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mi]');
    if (!b) return;
    const it = items.find((x) => x.id === b.dataset.mi);
    closeMenu();
    if (it && it.run) it.run();
  });
  setTimeout(() => document.addEventListener('click', function off(e) {
    if (!el.contains(e.target)) { closeMenu(); document.removeEventListener('click', off, true); }
  }, true), 0);
}

/* ---------------- Diğer ---------------- */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { /* */ }
    ta.remove();
    return ok;
  }
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function downloadBlob(blob, name) {
  if (window.NM_DEMO_API) { toast('Önizlemede dosya indirme kapalıdır; sitenize kurduğunuzda çalışır.'); return false; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('nm-theme', t); } catch (e) { /* */ }
}
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
function appBaseUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
function pwField(name, placeholder, autocomplete) {
  return html`<div class="pw-wrap"><input class="input" type="password" name="${name}" placeholder="${placeholder}" autocomplete="${autocomplete}" required minlength="${name === 'current' ? 1 : 8}"><button type="button" data-act="toggle-pw" aria-label="Şifreyi göster">${icon('eye')}</button></div>`;
}
ACT['toggle-pw'] = (el) => {
  const inp = el.parentElement.querySelector('input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  el.innerHTML = fmtVal(icon(inp.type === 'password' ? 'eye' : 'eyeOff'));
};
function options(list, selected, emptyLabel) {
  return html`${emptyLabel !== undefined ? html`<option value="">${emptyLabel}</option>` : ''}${list.map((x) => html`<option value="${x.id}" ${x.id === selected ? raw('selected') : ''}>${x.name}</option>`)}`;
}
