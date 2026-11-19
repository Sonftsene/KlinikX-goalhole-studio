/* dupcii — birebir sesli/görüntülü arama (WebRTC). Ses ve görüntü cihazlar arasında doğrudan, şifreli (DTLS-SRTP) akar;
   sunucu yalnız bağlantı kurma mesajlarını (sinyal) taşır. Gelen arama: canlı bildirim döngüsü + telefon bildirimi. */
'use strict';

Object.assign(ICON_PATHS, {
  phoneOff: 'M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91 M23 1 1 23',
  micOff: 'M1 1l22 22 M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6 M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23 M12 19v4 M8 23h8',
  videoOff: 'M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10 M1 1l22 22',
  flip: 'M3 7h13a4 4 0 0 1 4 4v1 M7 3 3 7l4 4 M21 17H8a4 4 0 0 1-4-4v-1 M17 21l4-4-4-4',
  minimize: 'M4 14h6v6 M20 10h-6V4 M14 10l7-7 M3 21l7-7',
});

const CALL = { k: null, pc: null, local: null, after: 0, timer: 0, tick: 0, t0: 0, pending: [], iceQ: [], iceT: 0, remoteSet: false, connected: false, answered: false, tone: null, ringing: null, mic: true, cam: true, facing: 'user' };

ACT['ch-call'] = (el) => callStart(CH.id, el.dataset.v === '1');

function callSupported() { return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
async function callMedia(video) {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { facingMode: CALL.facing, width: { ideal: 640 }, height: { ideal: 480 } } : false });
}

/* ---------------- Sesler: çalma (gelen) ve çağrı sesi (giden) ---------------- */
function callAudio() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  if (typeof NB !== 'undefined') { NB.audio = NB.audio || new C(); return NB.audio; }
  CALL.ac = CALL.ac || new C(); return CALL.ac;
}
function callTone(kind) {
  callToneStop();
  const a = callAudio();
  const beep = (f, t, d, g = 0.12) => { if (!a) return; const o = a.createOscillator(); const gn = a.createGain(); o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.02); gn.gain.setValueAtTime(g, t + d - 0.05); gn.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(gn); gn.connect(a.destination); o.start(t); o.stop(t + d + 0.02); };
  const play = () => {
    if (a && a.state === 'suspended') a.resume().catch(() => {});
    const t = a ? a.currentTime + 0.03 : 0;
    if (kind === 'out') beep(425, t, 1.0, 0.08); // çağrı sesi (Türkiye: 425 Hz)
    else { [0, 0.18, 0.36].forEach((x, i) => beep(i % 2 ? 784 : 988, t + x, 0.16)); [1.0, 1.18, 1.36].forEach((x, i) => beep(i % 2 ? 784 : 988, t + x, 0.16)); if (navigator.vibrate) { try { navigator.vibrate([400, 200, 400]); } catch (e) { /* */ } } }
  };
  play();
  CALL.tone = setInterval(play, kind === 'out' ? 4000 : 2600);
}
function callToneStop() { clearInterval(CALL.tone); CALL.tone = null; if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) { /* */ } } }

/* ---------------- Ekran ---------------- */
function callUI(mode) {
  let ov = $('#callOv');
  const k = CALL.k;
  if (!ov) { ov = document.createElement('div'); ov.id = 'callOv'; document.body.appendChild(ov); }
  ov.className = 'call-ov' + (k.video ? ' vid' : '') + (mode === 'in' ? ' incoming' : '');
  setHTML(ov, html`<video id="callRV" autoplay playsinline></video><video id="callLV" autoplay playsinline muted></video><audio id="callRA" autoplay></audio>
    <div class="call-top"><div class="call-ava">${avatar(k.peer, 'xl')}</div><h2>${k.peer}</h2><div id="callSt" class="call-st">${mode === 'in' ? (k.video ? 'Görüntülü arama' : 'Sesli arama') + '…' : 'Aranıyor…'}</div>
      <div class="call-e2e">${icon('lock', 'sm')} Uçtan uca şifreli</div></div>
    <div class="call-btns" id="callBtns">${mode === 'in'
      ? html`<button type="button" class="call-b red" data-ca="decline" aria-label="Reddet">${icon('phoneOff')}<span>Reddet</span></button><button type="button" class="call-b green" data-ca="accept" aria-label="Yanıtla">${icon(k.video ? 'video' : 'phone')}<span>Yanıtla</span></button>`
      : callBtnsHtml()}</div>
    <button type="button" class="call-min" data-ca="min" aria-label="Küçült" title="Küçült (sohbete dön)">${icon('minimize', 'sm')}</button>
    <button type="button" class="call-pill" data-ca="max">${icon('phone', 'sm')}<span id="callPillT">${k.peer}</span></button>`);
  if (!ov.dataset.w) {
    ov.dataset.w = '1';
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-ca]'); if (b) callAction(b.dataset.ca); });
  }
  if (CALL.local) { const lv = $('#callLV'); if (lv && k.video) lv.srcObject = CALL.local; }
}
function callBtnsHtml() {
  const k = CALL.k;
  return html`<button type="button" class="call-b ${CALL.mic ? '' : 'off'}" data-ca="mic" aria-label="Mikrofon">${icon(CALL.mic ? 'mic' : 'micOff')}<span>${CALL.mic ? 'Sessize al' : 'Sesi aç'}</span></button>
    ${k.video ? html`<button type="button" class="call-b ${CALL.cam ? '' : 'off'}" data-ca="cam" aria-label="Kamera">${icon(CALL.cam ? 'video' : 'videoOff')}<span>Kamera</span></button><button type="button" class="call-b" data-ca="flip" aria-label="Kamerayı çevir">${icon('flip')}<span>Çevir</span></button>` : ''}
    <button type="button" class="call-b red" data-ca="end" aria-label="Görüşmeyi bitir">${icon('phoneOff')}<span>Bitir</span></button>`;
}
function callStatus(t) { const s = $('#callSt'); if (s) s.textContent = t; const p = $('#callPillT'); if (p) p.textContent = CALL.k ? CALL.k.peer + ' · ' + t : t; }
async function callAction(a) {
  const ov = $('#callOv');
  if (a === 'min') { if (ov) ov.classList.add('min'); return; }
  if (a === 'max') { if (ov) ov.classList.remove('min'); return; }
  if (a === 'accept') { callAccept(); return; }
  if (a === 'decline') { callEnd('decline'); return; }
  if (a === 'end') { callEnd('hangup'); return; }
  if (a === 'mic' && CALL.local) { CALL.mic = !CALL.mic; CALL.local.getAudioTracks().forEach((t) => { t.enabled = CALL.mic; }); }
  if (a === 'cam' && CALL.local) { CALL.cam = !CALL.cam; CALL.local.getVideoTracks().forEach((t) => { t.enabled = CALL.cam; }); }
  if (a === 'flip' && CALL.local && CALL.pc) {
    CALL.facing = CALL.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CALL.facing } });
      const nt = s.getVideoTracks()[0];
      const snd = CALL.pc.getSenders().find((x) => x.track && x.track.kind === 'video');
      if (snd && nt) { await snd.replaceTrack(nt); CALL.local.getVideoTracks().forEach((t) => { t.stop(); CALL.local.removeTrack(t); }); CALL.local.addTrack(nt); const lv = $('#callLV'); if (lv) lv.srcObject = CALL.local; }
    } catch (e) { toast('Kamera değiştirilemedi', 'err'); }
  }
  const b = $('#callBtns'); if (b && !$('#callOv.incoming')) setHTML(b, callBtnsHtml());
}

/* ---------------- Bağlantı ---------------- */
function callPc() {
  const pc = new RTCPeerConnection({ iceServers: CALL.k.ice && CALL.k.ice.length ? CALL.k.ice : [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    CALL.iceQ.push(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate);
    clearTimeout(CALL.iceT);
    CALL.iceT = setTimeout(() => { const q = CALL.iceQ.splice(0); if (q.length) callSig('ice', JSON.stringify(q)); }, 250);
  };
  pc.ontrack = (e) => {
    const st = e.streams[0];
    const ra = $('#callRA'); if (ra && ra.srcObject !== st) { ra.srcObject = st; ra.play().catch(() => {}); }
    if (CALL.k.video) { const rv = $('#callRV'); if (rv && rv.srcObject !== st) { rv.srcObject = st; rv.muted = true; rv.play().catch(() => {}); } }
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected' && !CALL.connected) {
      CALL.connected = true; callToneStop();
      CALL.t0 = Date.now();
      clearInterval(CALL.tick);
      CALL.tick = setInterval(() => { const x = Math.floor((Date.now() - CALL.t0) / 1000); callStatus(`${Math.floor(x / 60)}:${pad(x % 60)}`); }, 1000);
      callStatus('0:00');
      $('#callOv') && $('#callOv').classList.add('live');
    } else if (s === 'disconnected') callStatus('Bağlantı zayıf, yeniden bağlanıyor…');
    else if (s === 'failed') callEnd('fail', 'Bağlantı kurulamadı. Ağınız doğrudan bağlantıya izin vermiyor olabilir; yönetici Ayarlar’dan arama sunucusu (TURN) tanımlayabilir.');
  };
  CALL.local.getTracks().forEach((t) => pc.addTrack(t, CALL.local));
  return pc;
}
async function callSig(type, data) {
  if (!CALL.k) return;
  try { await api('call.signal', { call: CALL.k.id, type, data }); } catch (e) { /* bitti */ }
}
async function callOnSig(s) {
  const pc = CALL.pc; if (!pc) return;
  try {
    if (s.type === 'offer') {
      await pc.setRemoteDescription(JSON.parse(s.data)); CALL.remoteSet = true;
      for (const c of CALL.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
      callSig('answer', JSON.stringify(pc.localDescription));
    } else if (s.type === 'answer') {
      if (pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(JSON.parse(s.data)); CALL.remoteSet = true; for (const c of CALL.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {}); }
    } else if (s.type === 'ice') {
      for (const c of JSON.parse(s.data)) { if (CALL.remoteSet) await pc.addIceCandidate(c).catch(() => {}); else CALL.pending.push(c); }
    }
  } catch (e) { /* bozuk sinyal yok sayılır */ }
}
async function callLoop() {
  clearTimeout(CALL.timer);
  if (!CALL.k) return;
  const id = CALL.k.id;
  try {
    const r = await api('call.poll', { call: id, after: CALL.pc ? CALL.after : 999999999 });
    if (!CALL.k || CALL.k.id !== id) return;
    if (CALL.pc) for (const s of r.sig) { CALL.after = Math.max(CALL.after, s.id); await callOnSig(s); }
    if (r.call.state === 'end') {
      const why = { declined: 'Arama reddedildi', missed: CALL.k.side === 'a' ? 'Cevap verilmedi' : 'Cevapsız arama', cancel: CALL.k.side === 'b' ? 'Cevapsız arama' : 'Arama iptal edildi', lost: 'Bağlantı koptu', fail: 'Bağlantı kurulamadı' }[r.call.reason] || 'Görüşme bitti';
      callCleanup(why); return;
    }
    if (r.call.state === 'active' && CALL.k.side === 'a' && !CALL.answered) { CALL.answered = true; callToneStop(); callStatus('Bağlanıyor…'); }
  } catch (e) { if ([403, 404, 410].includes(e.status)) { callCleanup('Görüşme bitti'); return; } }
  CALL.timer = setTimeout(callLoop, CALL.connected ? 2000 : 700);
}

/** Ara (birebir sohbet kimliğiyle) */
async function callStart(chatId, video) {
  if (CALL.k) { toast('Zaten bir görüşmedesiniz'); const ov = $('#callOv'); if (ov) ov.classList.remove('min'); return; }
  if (!callSupported()) { toast('Bu tarayıcı aramayı desteklemiyor. Güncel Chrome, Safari ya da Edge kullanın.', 'err'); return; }
  let stream;
  try { stream = await callMedia(video); } catch (e) { toast(video ? 'Kamera/mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye izin verin.' : 'Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye mikrofon izni verin.', 'err'); return; }
  let r;
  try { r = await api('call.start', { id: chatId, video: !!video }); } catch (e) { stream.getTracks().forEach((t) => t.stop()); toast(e.message, 'err'); return; }
  Object.assign(CALL, { k: r.call, local: stream, after: 0, pending: [], iceQ: [], remoteSet: false, connected: false, answered: false, mic: true, cam: true });
  callUI('out');
  callTone('out');
  CALL.pc = callPc();
  try { const off = await CALL.pc.createOffer(); await CALL.pc.setLocalDescription(off); await callSig('offer', JSON.stringify(CALL.pc.localDescription)); } catch (e) { callEnd('fail', 'Arama başlatılamadı'); return; }
  callStatus('Çalıyor…');
  callLoop();
}
/** Gelen arama (canlı döngüden) */
function callIncoming(k) {
  if (!k || (CALL.k && CALL.k.id === k.id)) return;
  if (CALL.k) return; // meşgul (sunucu da engeller)
  if (CALL.declined && CALL.declined === k.id) return;
  Object.assign(CALL, { k, local: null, pc: null, after: 0, pending: [], iceQ: [], remoteSet: false, connected: false, answered: false, mic: true, cam: true });
  callUI('in');
  callTone('in');
  callLoop();
}
async function callAccept() {
  const k = CALL.k; if (!k) return;
  callToneStop();
  try { CALL.local = await callMedia(k.video); } catch (e) { toast('Mikrofon izni verilmedi. Tarayıcı ayarlarından bu siteye izin verin.', 'err'); callEnd('decline'); return; }
  try { await api('call.answer', { call: k.id }); } catch (e) { toast(e.message, 'err'); callCleanup(''); return; }
  CALL.answered = true;
  callUI('active');
  callStatus('Bağlanıyor…');
  CALL.pc = callPc();
  CALL.after = 0;
  callLoop();
}
async function callEnd(reason, msg) {
  const k = CALL.k; if (!k) return;
  if (reason === 'decline') CALL.declined = k.id;
  try { await api('call.end', { call: k.id, reason: reason === 'fail' ? 'fail' : reason }); } catch (e) { /* zaten bitti */ }
  callCleanup(msg || (reason === 'decline' ? '' : 'Görüşme bitti'));
}
function callCleanup(msg) {
  clearTimeout(CALL.timer); clearInterval(CALL.tick); clearTimeout(CALL.iceT);
  callToneStop();
  try { if (CALL.pc) CALL.pc.close(); } catch (e) { /* */ }
  if (CALL.local) CALL.local.getTracks().forEach((t) => t.stop());
  const dur = CALL.connected ? Math.floor((Date.now() - CALL.t0) / 1000) : 0;
  Object.assign(CALL, { k: null, pc: null, local: null, connected: false, answered: false });
  const ov = $('#callOv'); if (ov) { ov.classList.add('ending'); setTimeout(() => ov.remove(), 250); }
  if (msg) toast(dur ? `${msg} · ${Math.floor(dur / 60)}:${pad(dur % 60)}` : msg);
  if (location.hash.startsWith('#/mesaj/') && typeof chatPoll === 'function') setTimeout(chatPoll, 400);
}
window.addEventListener('beforeunload', () => { if (CALL.k) { try { navigator.sendBeacon && fetch('api.php?action=call.end', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf }, body: JSON.stringify({ call: CALL.k.id, reason: 'hangup' }) }); } catch (e) { /* */ } } });

/* ---------------- Arama geçmişi (Mesajlar › Aramalar) ---------------- */
async function callLogDraw() {
  const box = $('#callLog'); if (!box) return;
  let r;
  try { r = await api('call.log'); } catch (e) { setHTML(box, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  setHTML(box, r.items.length ? html`<div class="card"><div class="list">${r.items.map((c) => { const miss = c.status !== 'done'; return html`<div class="list-row">
      ${avatar(c.peer, 'sm')}<a class="grow" href="#/mesaj/${c.chat}" style="min-width:0;color:inherit"><div class="lr-t ${miss && c.dir === 'in' ? 'tone-danger' : ''}">${c.peer}</div>
      <div class="lr-s">${icon(miss ? 'phoneMiss' : c.dir === 'out' ? 'phoneOut' : 'phoneIn', 'sm')} ${c.dir === 'out' ? 'Giden' : 'Gelen'} ${c.video ? 'görüntülü' : 'sesli'} · ${c.status === 'done' ? `${Math.floor(c.dur / 60)}:${pad(c.dur % 60)}` : c.status === 'declined' ? 'reddedildi' : 'cevapsız'} · ${fmtRel(c.at)}</div></a>
      <button class="btn sm icon ghost" data-act="call-again" data-c="${c.chat}" data-v="0" aria-label="Sesli ara">${icon('phone', 'sm')}</button><button class="btn sm icon ghost" data-act="call-again" data-c="${c.chat}" data-v="1" aria-label="Görüntülü ara">${icon('video', 'sm')}</button></div>`; })}</div></div>`
    : html`<div class="card empty"><div class="e-ico">${icon('phone', 'lg')}</div><h3>Arama yok</h3><p class="small">Birebir sohbetin üstündeki telefon simgesiyle sesli ya da görüntülü arayın.</p></div>`);
}
ACT['call-again'] = (el) => callStart(+el.dataset.c, el.dataset.v === '1');

/* ---------------- Yönetici: arama ayarları ---------------- */
NM_EXT.settingsCards.push({
  sec: 'genel', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="genel" id="callCfg"><h3 style="font-size:15px">${icon('phone', 'sm')} Sesli ve görüntülü arama</h3><div class="skel" style="height:14px;width:50%"></div></div>`,
  mount: () => callCfgDraw(),
});
async function callCfgDraw(data) {
  const c = $('#callCfg'); if (!c) return;
  let d = data;
  if (!d) { try { d = await api('call.cfg', {}); } catch (e) { setHTML(c, html`<p class="small muted">${e.message}</p>`); return; } }
  setHTML(c, html`<div><h3 style="font-size:15px">${icon('phone', 'sm')} Sesli ve görüntülü arama</h3><p class="small muted">Birebir sohbetlerde arama. Ses/görüntü cihazlar arasında doğrudan ve şifreli akar; sunucudan geçmez ve kaydedilmez.</p></div>
    <label class="switch"><input type="checkbox" data-cc="on" ${d.calls_on ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Aramayı kullan</b><span>Kapalıysa sohbetlerde arama düğmesi görünmez.</span></span></label>
    <details><summary class="small">Arama sunucusu (TURN) — bağlantı kurulamazsa</summary>
      <p class="tiny faint" style="margin:6px 0">Hastane ağı ya da bazı mobil operatörler doğrudan bağlantıyı engelleyebilir. Bir TURN sunucusu (ör. kendi coturn sunucunuz ya da bir TURN hizmeti) tanımlarsanız arama her ağda çalışır.</p>
      <div class="grid2"><div class="field"><label>Adres</label><input class="input" data-cc="url" value="${d.turn_url}" placeholder="turn:turn.ornek.com:3478"></div>
        <div class="field"><label>Kullanıcı adı</label><input class="input" data-cc="user" value="${d.turn_user}" autocomplete="off"></div>
        <div class="field"><label>Parola</label><input class="input" type="password" data-cc="pass" placeholder="${d.turn_pass_set ? '•••••• (değiştirmek için yazın)' : ''}" autocomplete="new-password"></div></div></details>
    <div><button type="button" class="btn" data-act="call-cfg-save">Arama ayarlarını kaydet</button></div>`);
}
ACT['call-cfg-save'] = (el) => busy(el, async () => {
  const c = $('#callCfg');
  try {
    const d = await api('call.cfg', { calls_on: $('[data-cc=on]', c).checked, turn_url: $('[data-cc=url]', c).value.trim(), turn_user: $('[data-cc=user]', c).value.trim(), turn_pass: $('[data-cc=pass]', c).value });
    toast('Arama ayarları kaydedildi'); callCfgDraw(d);
  } catch (e) { toast(e.message, 'err'); }
});
