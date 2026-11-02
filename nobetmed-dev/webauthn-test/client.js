/*
 * NöbetMed — passkey (WebAuthn) istemci yardımcıları.
 * Sunucu tarafı: nobetmed/inc/webauthn.php
 *
 *   await passkeyRegister();            // kayıt (parmak izi / Face ID oluştur)
 *   const r = await passkeyLogin();     // giriş → sunucunun JSON yanıtı
 *
 * Uç noktalar sunucudan base64url alanlı JSON seçenekleri döndürür; burada
 * ArrayBuffer'a çevrilir, sonuç yine base64url olarak POST edilir.
 */
'use strict';

const PASSKEY_ENDPOINTS = {
  regBegin: '?a=reg-begin',
  regFinish: '?a=reg-finish',
  loginBegin: '?a=login-begin',
  loginFinish: '?a=login-finish',
};

// ---- base64url <-> ArrayBuffer
function b64uToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bufToB64u(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function passkeySupported() {
  return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);
}

async function passkeyPost(url, body) {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* JSON değil */ }
  if (!res.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || ('Sunucu hatası (' + res.status + ')'));
  }
  return data;
}

function passkeyError(e) {
  if (e && e.name === 'NotAllowedError') return new Error('İşlem iptal edildi veya süresi doldu.');
  if (e && e.name === 'InvalidStateError') return new Error('Bu cihaz zaten kayıtlı.');
  if (e && e.name === 'SecurityError') return new Error('Güvenli bağlantı (HTTPS) gerekli.');
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Yeni passkey kaydeder.
 * opts.endpoints: uç nokta adreslerini değiştirmek için; opts.beforeSend(payload): gönderilmeden önce (test için).
 */
async function passkeyRegister(opts = {}) {
  if (!passkeySupported()) throw new Error('Bu tarayıcı/bağlantı passkey desteklemiyor.');
  const ep = Object.assign({}, PASSKEY_ENDPOINTS, opts.endpoints || {});
  const o = (await passkeyPost(ep.regBegin)).publicKey;

  const publicKey = Object.assign({}, o, {
    challenge: b64uToBuf(o.challenge),
    user: Object.assign({}, o.user, { id: b64uToBuf(o.user.id) }),
    excludeCredentials: (o.excludeCredentials || []).map(c => Object.assign({}, c, { id: b64uToBuf(c.id) })),
  });

  let cred;
  try { cred = await navigator.credentials.create({ publicKey }); } catch (e) { throw passkeyError(e); }
  if (!cred) throw new Error('Kimlik bilgisi oluşturulamadı.');

  const payload = {
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    clientDataJSON: bufToB64u(cred.response.clientDataJSON),
    attestationObject: bufToB64u(cred.response.attestationObject),
    transports: typeof cred.response.getTransports === 'function' ? cred.response.getTransports() : [],
  };
  if (opts.beforeSend) await opts.beforeSend(payload);
  return passkeyPost(ep.regFinish, payload);
}

/** Passkey ile giriş yapar; sunucunun login-finish yanıtını döndürür. */
async function passkeyLogin(opts = {}) {
  if (!passkeySupported()) throw new Error('Bu tarayıcı/bağlantı passkey desteklemiyor.');
  const ep = Object.assign({}, PASSKEY_ENDPOINTS, opts.endpoints || {});
  const o = (await passkeyPost(ep.loginBegin)).publicKey;

  const publicKey = Object.assign({}, o, {
    challenge: b64uToBuf(o.challenge),
    allowCredentials: (o.allowCredentials || []).map(c => Object.assign({}, c, { id: b64uToBuf(c.id) })),
  });

  let cred;
  try { cred = await navigator.credentials.get({ publicKey }); } catch (e) { throw passkeyError(e); }
  if (!cred) throw new Error('Giriş yapılamadı.');

  const r = cred.response;
  const payload = {
    id: cred.id,
    rawId: bufToB64u(cred.rawId),
    type: cred.type,
    clientDataJSON: bufToB64u(r.clientDataJSON),
    authenticatorData: bufToB64u(r.authenticatorData),
    signature: bufToB64u(r.signature),
    userHandle: r.userHandle ? bufToB64u(r.userHandle) : null,
  };
  if (opts.beforeSend) await opts.beforeSend(payload);
  return passkeyPost(ep.loginFinish, payload);
}
