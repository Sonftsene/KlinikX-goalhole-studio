/* dupcii — Kura (4.37): isim / sayı kurası, tek ekranda üstü kapalı kartlar.
   Karıştırma sunucuda yapılır; bir kartın içeriği yalnız o kart açılınca gelir (inc/mod_kura.php).
   Kartlar ekrana olabildiğince birbirinden uzak dağılır; kim hangi karta dokunursa altındaki yazı görünür.
   Hazır şablonlar ve geçmiş kuralar birimde herkese görünür. */
'use strict';

NM_EXT.routes.kura = (view, r) => kuraPage(view, r);
NM_EXT.nav.push({ sec: 'genel', mod: 'taraf', href: '#/kura', icon: 'dice', label: 'Kura', match: (r) => r[0] === 'kura' });
Object.assign(NM_EXT.audit, { 'kura.start': 'Kura başlattı', 'kura.finish': 'Kurayı bitirdi', 'kura.delete': 'Kura kaydını sildi', 'kura.tpl': 'Kura şablonu kaydetti', 'kura.tpl.delete': 'Kura şablonunu sildi' });

const KR = { d: null, items: '', title: '', tplId: null, opts: null, draw: null, ov: null, busy: false, setOpen: false };
const KR_THEMES = [['brand', 'Mor'], ['emerald', 'Yeşil'], ['amber', 'Turuncu'], ['rose', 'Pembe'], ['slate', 'Gri']];
function krDefOpts() { return { mode: 'cards', back: 'num', theme: 'brand', ask: false, people: [], limit: 0, shuffle: true, sound: true, vibrate: true, hide: false }; }
/** Metinden maddeler: her satır ya da virgül / noktalı virgülle ayrılmış */
function krParse(t) {
  const lines = String(t || '').split(/\r?\n/);
  const parts = lines.length > 1 ? lines : String(t || '').split(/[;,]/);
  return parts.map((x) => x.trim()).filter(Boolean).slice(0, 200);
}
function krLetter(i) { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

async function kuraPage(view, r) {
  if (!KR.opts) { try { KR.opts = Object.assign(krDefOpts(), JSON.parse(localStorage.getItem('nm-kura-opts') || '{}')); } catch (e) { KR.opts = krDefOpts(); } }
  setHTML(view, html`<div class="page-head"><div><h1>${icon('dice')} Kura</h1><p>İsim ya da sayı yazın, kartlar üstü kapalı karışsın; herkes bir karta dokunsun. Sonuçlar birimde herkese görünür.</p></div></div>
    <div id="krBody"><div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div></div></div>`);
  await kuraLoad();
  if (r && r[1] && /^\d+$/.test(r[1])) krShowResult(+r[1]);
}
async function kuraLoad() {
  try { KR.d = await api('kura.list'); } catch (e) { setHTML($('#krBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  kuraDraw();
}
function krSaveOpts() { try { localStorage.setItem('nm-kura-opts', JSON.stringify(Object.assign({}, KR.opts, { people: [] }))); } catch (e) { /* */ } }
function kuraDraw() {
  const box = $('#krBody'); const D = KR.d; if (!box || !D) return;
  const o = KR.opts;
  const n = krParse(KR.items).length;
  const sw = (k, t, sub) => html`<label class="switch"><input type="checkbox" data-change="kr-opt" data-k="${k}" ${o[k] ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>${t}</b>${sub ? html`<span>${sub}</span>` : ''}</span></label>`;
  setHTML(box, html`<div class="stack">
    <div class="card card-pad stack kr-new">
      <div class="row wrap" style="gap:8px;align-items:center"><h3 style="margin:0;font-size:16px" class="grow">${icon('dice', 'sm')} Yeni kura</h3>
        ${D.templates.length ? html`<select class="select" data-change="kr-tpl-pick" style="width:auto;max-width:100%"><option value="">Hazır şablondan…</option>${D.templates.map((t) => html`<option value="${t.id}" ${KR.tplId === t.id ? raw('selected') : ''}>${t.name} (${t.items.length})</option>`)}</select>` : ''}</div>
      <div class="field"><label>Kura adı (isteğe bağlı)</label><input class="input" id="krTitle" data-input="kr-title" value="${KR.title}" maxlength="120" placeholder="ör. Bayram nöbeti kurası, Oda dağıtımı"></div>
      <div class="field"><label>İsimler ya da sayılar <span class="faint">· her satıra bir tane</span></label>
        <textarea class="textarea" id="krItems" data-input="kr-items" rows="6" placeholder="Ayşe&#10;Burak&#10;Ceren&#10;… ya da 1, 2, 3 …">${KR.items}</textarea>
        <div class="row wrap" style="gap:6px;margin-top:6px"><span class="small muted grow" id="krCount">${n} madde${n > 200 ? ' (en çok 200)' : ''}</span>
          <button type="button" class="btn sm ghost" data-act="kr-nums">${icon('plus', 'sm')}<span>Sayılar 1–N</span></button>
          <button type="button" class="btn sm ghost" data-act="kr-people">${icon('users', 'sm')}<span>Birimdeki kişiler</span></button>
          <button type="button" class="btn sm ghost" data-act="kr-clear">${icon('x', 'sm')}<span>Temizle</span></button></div></div>
      <details class="kr-set" ${KR.setOpen ? raw('open') : ''}><summary class="small"><b>Kura ayarları</b> <span class="faint">· görünüm, sıra, ses</span></summary>
        <div class="stack" style="gap:10px;margin-top:8px">
          <div class="field"><label>Nasıl çekilsin?</label><div class="seg" role="radiogroup">${[['cards', 'Kartla tek tek (dokunarak)'], ['list', 'Hepsini birden karıştır']].map(([k, l]) => html`<button type="button" class="${o.mode === k ? 'on' : ''}" data-act="kr-set" data-k="mode" data-v="${k}">${l}</button>`)}</div></div>
          <div class="field"><label>Kart arkası</label><div class="seg">${[['num', 'Numara'], ['letter', 'Harf'], ['plain', 'Düz']].map(([k, l]) => html`<button type="button" class="${o.back === k ? 'on' : ''}" data-act="kr-set" data-k="back" data-v="${k}">${l}</button>`)}</div></div>
          <div class="field"><label>Renk</label><div class="row wrap" style="gap:8px">${KR_THEMES.map(([k, l]) => html`<button type="button" class="kr-sw kr-t-${k} ${o.theme === k ? 'on' : ''}" data-act="kr-set" data-k="theme" data-v="${k}" aria-label="${l}" title="${l}"></button>`)}</div></div>
          <div class="field"><label>Sırayla çekenler <span class="faint">· isteğe bağlı; ekranda “Sıradaki: …” yazar, açılan karta kendiliğinden yazılır</span></label>
            <textarea class="textarea" data-input="kr-people" rows="3" placeholder="Boş bırakılabilir">${(o.people || []).join('\n')}</textarea></div>
          <div class="row wrap" style="gap:10px;align-items:center"><label class="small">En çok <input class="input" type="number" min="0" max="200" data-input="kr-limit" value="${o.limit || ''}" placeholder="hepsi" style="width:80px;display:inline-block"> kart açılsın</label><span class="tiny faint">(ör. 20 kişiden 3 kazanan)</span></div>
          ${sw('ask', 'Açan kişinin adını sor', 'Karta dokununca “Kim çekiyor?” sorulur; ad kartın altına ve geçmişe yazılır.')}
          ${sw('hide', 'Açılan kart birkaç saniye sonra kapansın', 'Sıradaki kişi öncekileri görmesin; sonuçlar sonda listelenir.')}
          ${sw('shuffle', 'Karıştırma gösterisi', 'Başlarken kartlar ekranda karışır.')}
          ${sw('sound', 'Ses', '')}${sw('vibrate', 'Titreşim', '')}
        </div></details>
      <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="kr-start" ${n >= 2 ? '' : raw('disabled')}>${icon('dice', 'sm')}<span>Kurayı başlat</span></button>
        ${D.can_manage ? html`<button class="btn" data-act="kr-tpl-save" ${n >= 2 ? '' : raw('disabled')}>${icon('bookmark', 'sm')}<span>${KR.tplId ? 'Şablonu güncelle' : 'Şablon olarak kaydet'}</span></button>` : ''}</div>
      <p class="tiny faint" style="margin:0">Kartın içeriği yalnız açılınca görünür; her açılış kaydedilir.</p>
    </div>
    <div class="card"><div class="card-head"><h3>${icon('bookmark', 'sm')} Hazır şablonlar</h3></div>
      <div class="list">${D.templates.length ? D.templates.map((t) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${t.name} <span class="tiny faint">${t.items.length} madde</span></div><div class="lr-s ellipsis">${t.items.slice(0, 8).join(', ')}${t.items.length > 8 ? '…' : ''}</div></div>
        <button class="btn sm primary" data-act="kr-tpl-use" data-id="${t.id}">Kullan</button>
        ${D.can_manage ? html`<button class="btn sm ghost icon" data-act="kr-tpl-del" data-id="${t.id}" aria-label="Şablonu sil">${icon('trash', 'sm')}</button>` : ''}</div>`)
        : html`<div class="list-row small muted">${D.can_manage ? 'Henüz şablon yok. Yukarıya isimleri yazıp “Şablon olarak kaydet” deyin; birimdeki herkes kullanabilir.' : 'Henüz hazır şablon yok.'}</div>`}</div></div>
    <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Geçmiş kuralar</h3></div>
      <div class="list">${D.draws.length ? D.draws.map((x) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${x.title || 'Kura'} <span class="badge ${x.status === 'done' ? 'success' : 'warn'}">${x.status === 'done' ? 'bitti' : `${x.opened}/${x.n} açık`}</span></div>
          <div class="lr-s ellipsis">${fmtDateTime(x.created_at)} · ${x.by} · ${x.n} kart${x.summary.length ? ' · ' + x.summary.slice().sort((a, b) => (a.n || 0) - (b.n || 0)).slice(0, 4).map((s) => `${s.who ? s.who + ': ' : ''}${s.value}`).join(', ') + (x.summary.length > 4 ? '…' : '') : ''}</div></div>
        ${x.status === 'open' && x.created_by === (S.me && S.me.id) ? html`<button class="btn sm primary" data-act="kr-resume" data-id="${x.id}">Devam et</button>` : ''}
        <button class="btn sm" data-act="kr-result" data-id="${x.id}">Sonuç</button></div>`)
        : html`<div class="list-row small muted">Henüz kura yapılmadı.</div>`}</div></div>
  </div>`);
}
CHANGE['kr-items'] = (el) => { KR.items = el.value; const n = krParse(KR.items).length; const c = $('#krCount'); if (c) c.textContent = `${n} madde${n > 200 ? ' (en çok 200)' : ''}`; $$('[data-act=kr-start],[data-act=kr-tpl-save]').forEach((b) => { b.disabled = n < 2; }); };
CHANGE['kr-title'] = (el) => { KR.title = el.value; };
CHANGE['kr-people'] = (el) => { KR.opts.people = krParse(el.value); };
CHANGE['kr-limit'] = (el) => { KR.opts.limit = Math.max(0, Math.min(200, +el.value || 0)); krSaveOpts(); };
CHANGE['kr-opt'] = (el) => { KR.opts[el.dataset.k] = el.checked; krSaveOpts(); };
ACT['kr-set'] = (el) => { KR.opts[el.dataset.k] = el.dataset.v; KR.setOpen = true; krSaveOpts(); kuraDraw(); };
ACT['kr-clear'] = () => { KR.items = ''; KR.title = ''; KR.tplId = null; kuraDraw(); };
ACT['kr-nums'] = async () => {
  const v = await promptDialog({ title: 'Sayılar', label: 'Kaça kadar? (1’den başlar)', value: '10', ok: 'Ekle' });
  const n = Math.max(2, Math.min(200, parseInt(v, 10) || 0));
  if (!v) return;
  KR.items = Array.from({ length: n }, (_, i) => String(i + 1)).join('\n'); kuraDraw();
};
ACT['kr-people'] = () => {
  const names = (S.people || []).map((p) => p.name).filter(Boolean);
  if (!names.length) { toast('Birimde kişi bulunamadı', 'err'); return; }
  KR.items = names.slice(0, 200).join('\n'); kuraDraw();
};
CHANGE['kr-tpl-pick'] = (el) => { const t = KR.d.templates.find((x) => x.id === +el.value); if (t) krUseTpl(t); else { KR.tplId = null; kuraDraw(); } };
ACT['kr-tpl-use'] = (el) => { const t = KR.d.templates.find((x) => x.id === +el.dataset.id); if (t) { krUseTpl(t); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
function krUseTpl(t) { KR.tplId = t.id; KR.items = t.items.join('\n'); KR.title = t.name; KR.opts = Object.assign(krDefOpts(), t.opts || {}); kuraDraw(); }
ACT['kr-tpl-save'] = async (el) => {
  const items = krParse(KR.items);
  const cur = KR.tplId ? KR.d.templates.find((x) => x.id === KR.tplId) : null;
  const name = await promptDialog({ title: cur ? 'Şablonu güncelle' : 'Şablon olarak kaydet', label: 'Şablon adı (birimde herkes görür)', value: (cur && cur.name) || KR.title || '', ok: 'Kaydet' });
  if (!name) return;
  busy(el, async () => {
    try {
      const r = await api('kura.tpl.save', { id: cur ? cur.id : 0, name, items, opts: KR.opts });
      KR.tplId = r.template.id; toast('Şablon kaydedildi'); await kuraLoad();
    } catch (e) { toast(e.message, 'err'); }
  });
};
ACT['kr-tpl-del'] = async (el) => {
  try { await api('kura.tpl.delete', { id: +el.dataset.id }); if (KR.tplId === +el.dataset.id) KR.tplId = null; toast('Şablon silindi'); await kuraLoad(); } catch (e) { if (e.message) toast(e.message, 'err'); }
};
ACT['kr-start'] = (el) => busy(el, async () => {
  const items = krParse(KR.items);
  if (items.length < 2) { toast('En az 2 isim ya da sayı yazın', 'err'); return; }
  try {
    const r = await api('kura.start', { title: KR.title.trim(), items, opts: KR.opts, tpl_id: KR.tplId || 0 });
    krStage(r.draw, true);
  } catch (e) { toast(e.message, 'err'); }
});
ACT['kr-resume'] = (el) => busy(el, async () => { try { krStage((await api('kura.get', { id: +el.dataset.id })).draw, false); } catch (e) { toast(e.message, 'err'); } });
ACT['kr-result'] = (el) => krShowResult(+el.dataset.id);

/* ---------------- Kura ekranı (tam ekran) ---------------- */
/** Kartlar için en büyük ve en aralıklı ızgara: sütun sayısı, kart boyutu */
function krLayout(n, W, H) {
  let best = { c: 1, r: n, cw: 0, ch: 0 };
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const cw = W / c, ch = H / r;
    const card = Math.min(cw * 0.62, (ch * 0.62) * 0.74); // kart eni (en / boy ≈ 0,74); hücrenin ~%60'ı: kartlar arası geniş boşluk
    if (card > best.card || best.card === undefined) best = { c, r, cw, ch, card };
  }
  best.card = Math.max(34, Math.min(170, best.card));
  return best;
}
function krBeep(f = 660, ms = 120) {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    KR.ac = KR.ac || new C();
    const o = KR.ac.createOscillator(), g = KR.ac.createGain();
    o.frequency.value = f; o.type = 'triangle'; g.gain.value = 0.08;
    o.connect(g); g.connect(KR.ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, KR.ac.currentTime + ms / 1000); o.stop(KR.ac.currentTime + ms / 1000 + 0.02);
  } catch (e) { /* ses yok */ }
}
function krStage(draw, fresh) {
  KR.draw = draw;
  let st = $('#krStage');
  if (st) st.remove();
  // Önceki sahnenin dinleyicisi ve geri tuşu kaydı da kaldırılır (4.55.0)
  if (KR.onResize) { window.removeEventListener('resize', KR.onResize); KR.onResize = null; }
  if (KR.ov && typeof ovShut === 'function') { ovShut(KR.ov); KR.ov = null; }
  st = document.createElement('div');
  st.id = 'krStage';
  st.className = `kr-stage kr-t-${draw.opts.theme}`;
  st.setAttribute('role', 'dialog'); st.setAttribute('aria-label', 'Kura');
  document.body.appendChild(st);
  document.documentElement.classList.add('kr-open');
  const close = () => { const s = $('#krStage'); if (s) s.remove(); document.documentElement.classList.remove('kr-open'); window.removeEventListener('resize', KR.onResize); if (KR.ov) { ovShut(KR.ov); KR.ov = null; } kuraLoad(); };
  KR.closeStage = close;
  KR.ov = typeof ovOpen === 'function' ? ovOpen(close, () => !!$('#krStage')) : null;
  if (draw.opts.mode === 'list' && draw.status === 'open') { krFinish(true, true); return; }
  krStageDraw(fresh && draw.opts.shuffle);
  KR.onResize = debounce(() => { if ($('#krStage')) krStageDraw(false); }, 150);
  window.addEventListener('resize', KR.onResize);
}
function krNextWho() { const d = KR.draw; const p = d.opts.people || []; return p[d.opened] || ''; }
function krStageDraw(shuffle) {
  const st = $('#krStage'); const d = KR.draw; if (!st || !d) return;
  const done = d.status === 'done';
  const limitHit = d.opts.limit && d.opened >= d.opts.limit;
  setHTML(st, html`<div class="kr-top"><div class="grow" style="min-width:0"><b class="ellipsis">${d.title || 'Kura'}</b><span class="kr-prog">${d.opened}/${d.opts.limit || d.n} açıldı</span></div>
      ${!done && !limitHit && krNextWho() ? html`<span class="kr-next">Sıradaki: <b>${krNextWho()}</b></span>` : ''}
      ${!done ? html`<button type="button" class="btn sm" data-act="kr-finish" data-all="1">Hepsini aç</button>` : ''}
      <button type="button" class="btn sm" data-act="kr-stage-results">${icon('list', 'sm')}<span>Sonuçlar</span></button>
      <button type="button" class="btn sm icon" data-act="kr-stage-close" aria-label="Kapat">${icon('x', 'sm')}</button></div>
    <div class="kr-grid" id="krGrid"></div>
    ${done ? html`<div class="kr-done">${icon('checkCircle', 'sm')} Kura bitti · <button type="button" class="btn sm primary" data-act="kr-stage-results">Sonuçları gör</button></div>` : ''}`);
  const grid = $('#krGrid', st);
  const W = grid.clientWidth, H = grid.clientHeight;
  const L = krLayout(d.n, W, H);
  grid.style.gridTemplateColumns = `repeat(${L.c}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${L.r}, 1fr)`;
  grid.style.setProperty('--kc', L.card + 'px');
  setHTML(grid, html`${d.cards.map((c) => { const lbl = d.opts.back === 'num' ? String(c.idx + 1) : d.opts.back === 'letter' ? krLetter(c.idx) : ''; const shown = c.open && !(d.opts.hide && c.hidden !== false && !done); return html`<div class="kr-cell"><button type="button" class="kr-card ${c.open ? 'open' : ''} ${shown ? 'shown' : ''}" data-act="kr-tap" data-i="${c.idx}" aria-label="${c.open ? (shown ? c.value : 'Açıldı') : 'Kart ' + (lbl || c.idx + 1)}" ${c.open || done || limitHit ? raw('aria-disabled="true"') : ''}>
    <span class="kr-in"><span class="kr-back">${lbl}${c.open && !shown ? html`<small>${icon('check', 'sm')} ${c.n ? c.n + '.' : ''}</small>` : ''}</span><span class="kr-front"><b style="font-size:${Math.max(11, Math.min(L.card / Math.max(3, String(c.value || '').length) * 1.25, L.card * 0.34))}px">${c.value || ''}</b>${c.who ? html`<small>${c.who}</small>` : ''}${c.n ? html`<i>${c.n}.</i>` : ''}</span></span></button></div>`; })}`);
  if (shuffle) {
    st.classList.add('shuffling');
    const cards = $$('.kr-card', grid);
    const mv = () => cards.forEach((el) => { el.style.transform = `translate(${(Math.random() - 0.5) * W * 0.5}px, ${(Math.random() - 0.5) * H * 0.5}px) rotate(${(Math.random() - 0.5) * 40}deg)`; });
    mv(); if (d.opts.sound) krBeep(420, 80);
    setTimeout(mv, 280); setTimeout(mv, 560);
    setTimeout(() => { cards.forEach((el) => { el.style.transform = ''; }); st.classList.remove('shuffling'); if (d.opts.sound) krBeep(520, 90); }, 860);
  }
}
ACT['kr-stage-close'] = () => { if (KR.closeStage) KR.closeStage(); };
ACT['kr-tap'] = async (el) => {
  const d = KR.draw; if (!d || KR.busy) return;
  const i = +el.dataset.i;
  const c = d.cards.find((x) => x.idx === i);
  if (!c || c.open || d.status !== 'open' || (d.opts.limit && d.opened >= d.opts.limit)) return;
  let who = '';
  if (d.opts.ask && !krNextWho()) {
    const v = await promptDialog({ title: 'Kim çekiyor?', label: 'Adınız (kartın altına yazılır)', ok: 'Kartı aç' });
    if (v === null || v === undefined) return;
    who = String(v).trim().slice(0, 80);
  }
  KR.busy = true;
  el.classList.add('flipping');
  try {
    const r = await api('kura.reveal', { id: d.id, idx: i, who });
    KR.draw = r.draw;
    const nc = KR.draw.cards.find((x) => x.idx === i);
    if (nc) nc.hidden = false;
    if (d.opts.vibrate && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* */ } }
    if (d.opts.sound) krBeep(780, 140);
    krStageDraw(false);
    if (KR.draw.opts.hide && nc) setTimeout(() => { if (KR.draw && KR.draw.id === r.draw.id) { const x = KR.draw.cards.find((y) => y.idx === i); if (x && KR.draw.status !== 'done') { x.hidden = true; krStageDraw(false); } } }, 3500);
    if (KR.draw.status === 'done') setTimeout(() => { if ($('#krStage')) krResultsModal(KR.draw); }, 900);
  } catch (e) {
    toast(e.message, 'err');
    if (e.status === 409) { try { KR.draw = (await api('kura.get', { id: d.id })).draw; krStageDraw(false); } catch (er) { /* */ } }
  } finally { KR.busy = false; }
};
ACT['kr-finish'] = (el) => krFinish(el.dataset.all === '1', false);
async function krFinish(all, auto) {
  const d = KR.draw; if (!d) return;
  try {
    const r = await api('kura.finish', { id: d.id, open_all: !!all });
    KR.draw = r.draw;
    if (auto) {
      // Hepsini birden: kartlar sırayla açılır gibi gösterilir
      KR.draw.cards.forEach((c) => { c.hidden = false; });
      krStageDraw(!!d.opts.shuffle);
      if (d.opts.sound) setTimeout(() => krBeep(780, 160), 900);
      setTimeout(() => { if ($('#krStage')) krResultsModal(KR.draw); }, d.opts.shuffle ? 1300 : 400);
    } else { krStageDraw(false); krResultsModal(KR.draw); }
  } catch (e) { if (e.message) toast(e.message, 'err'); }
}
ACT['kr-stage-results'] = () => { if (KR.draw) krResultsModal(KR.draw); };

/* ---------------- Sonuçlar ---------------- */
function krResultsText(d) {
  const rows = d.cards.filter((c) => c.open).sort((a, b) => (a.n || 999) - (b.n || 999));
  return `${d.title || 'Kura'} · ${fmtDateTime(d.created_at)}\n` + rows.map((c) => `${c.n ? c.n + '. ' : ''}${c.who ? c.who + ': ' : ''}${c.value}`).join('\n');
}
function krResultsModal(d) {
  const rows = d.cards.filter((c) => c.open).sort((a, b) => (a.n || 999) - (b.n || 999));
  const closed = d.cards.length - rows.length;
  const mine = S.me && d.created_by === S.me.id;
  const m = openModal({ title: `${d.title || 'Kura'} · sonuçlar`, body: html`<div class="stack">
      <div class="small muted">${fmtDateTime(d.created_at)} · başlatan ${d.by} · ${d.n} kart · ${d.status === 'done' ? 'bitti' : `${rows.length} kart açık`}</div>
      <div class="list kr-res">${rows.length ? rows.map((c) => html`<div class="list-row"><span class="kr-no">${c.n || '–'}</span><div class="grow" style="min-width:0"><b>${c.value}</b>${c.who ? html` <span class="small muted">· ${c.who}</span>` : ''}</div><span class="tiny faint">${c.at ? fmtDateTime(c.at).split(' ').pop() : ''}</span></div>`) : html`<div class="list-row small muted">Henüz kart açılmadı.</div>`}</div>
      ${closed ? html`<div class="tiny faint">${closed} kart açılmadı${d.status === 'done' ? ' (kura bitti)' : ''}.</div>` : ''}</div>`,
    foot: html`${mine || (KR.d && KR.d.can_manage) ? html`<button class="btn ghost danger" id="krDel">${icon('trash', 'sm')}<span>Sil</span></button>` : ''}<span class="grow"></span>
      <button class="btn" id="krCopy">${icon('clipboard', 'sm')}<span>Kopyala</span></button>${typeof shareToChat === 'function' ? html`<button class="btn" id="krShare">${icon('chat', 'sm')}<span>Sohbette paylaş</span></button>` : ''}<button class="btn primary" data-close>Tamam</button>` });
  $('#krCopy', m.el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(krResultsText(d)); toast('Sonuçlar kopyalandı'); } catch (e) { toast('Kopyalanamadı', 'err'); } });
  const sh = $('#krShare', m.el); if (sh) sh.addEventListener('click', () => { m.close(); shareToChat({ text: krResultsText(d), title: 'Kura sonucunu paylaş' }); });
  const del = $('#krDel', m.el);
  if (del) del.addEventListener('click', async () => {
    try { await api('kura.delete', { id: d.id }); m.close(); toast('Kura kaydı silindi'); if (KR.closeStage && $('#krStage')) KR.closeStage(); else kuraLoad(); } catch (e) { if (e.message) toast(e.message, 'err'); }
  });
}
async function krShowResult(id) { try { krResultsModal((await api('kura.get', { id })).draw); } catch (e) { toast(e.message, 'err'); } }
