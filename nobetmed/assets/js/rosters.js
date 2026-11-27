/* dupcii — Excel nöbet listeleri */
'use strict';

const RS = { active: null, stage: null, views: new Map(), busy: false, vm: {} };
const rosterById = (id) => S.rosters.find((r) => r.id === id) || null;
/* ---- Listede aylar (4.48.0): her ayın kendi dosyası; güncel ay (r.period) öne çıkar, sıradakiler yanında, geçmiş aylar menüde ---- */
const rmMonths = (r) => (r && !r.linked && Array.isArray(r.months) ? r.months : []);
/** Görüntülenen ay: seçilen ya da güncel ay */
function rmViewYm(r) { const ms = rmMonths(r); const v = RS.vm[r.id]; if (v && ms.some((m) => m.ym === v)) return v; return r.period && ms.some((m) => m.ym === r.period) ? r.period : (ms[0] ? ms[0].ym : null); }
function rmView(r) { const ym = rmViewYm(r); return rmMonths(r).find((m) => m.ym === ym) || null; }
/** Görüntülenen dosya: seçili ayın son dosyası; ay bilgisi yoksa listenin dosyası */
function rmFile(r) { const mo = rmView(r); return mo ? mo.file : r.file; }
const ymNow = () => ymd(new Date()).slice(0, 7);
const ymAdd = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ROSTER_ACCEPT = '.xlsx,.xlsm,.xls,.ods,.csv,.pdf,image/*';

function lastRoster() { try { return +localStorage.getItem('nm-roster') || null; } catch (e) { return null; } }
function rememberRoster(id) { try { localStorage.setItem('nm-roster', String(id)); } catch (e) { /* */ } }

async function refreshRosters() {
  try { S.rosters = (await api('rosters.list')).rosters; renderNav(); } catch (e) { /* sessiz */ }
}

function renderRosters(view, id) {
  // Başka yerden yeni oluşturulan liste (ör. Google E-Tablolar bağlama) henüz bu sekmede bilinmiyor olabilir
  if (id && !rosterById(id) && !RS.retried) {
    RS.retried = true;
    refreshRosters().then(() => { if (currentRoute()[0] === 'nobet') renderRosters($('#view'), id); RS.retried = false; });
    return;
  }
  RS.views.clear();
  if (!S.rosters.length) {
    setHTML(view, html`${hubHead('list', '')}
      <div class="card empty"><div class="e-ico">${icon('table', 'lg')}</div><h3>Henüz nöbet listesi yok</h3>
      ${isPublisher() ? html`<p class="small" style="margin-bottom:14px">Bir liste oluşturup Excel dosyanızı yükleyin.</p><button class="btn primary" data-act="rs-new">${icon('plus', 'sm')}Liste oluştur</button>` : html`<p class="small">Sorumlunuz liste yüklediğinde burada görünecek.</p>`}</div>`);
    return;
  }
  const nob = S.rosters.filter((x) => x.kind !== 'tablo');
  const pick = id && rosterById(id) ? id : rosterById(lastRoster()) && rosterById(lastRoster()).kind !== 'tablo' ? lastRoster() : (nob[0] || S.rosters[0]).id;
  const want = pick;
  RS.group = rosterById(want).kind === 'tablo' ? 'tablo' : 'nobet';
  setHTML(view, html`
    ${RS.group === 'tablo' ? '' : hubTabs('list')}
    <div class="rs-top">
      <div class="seg rs-tabs" role="tablist" id="rsTabs"></div>
      ${isPublisher() && RS.group !== 'tablo' ? html`<button class="btn sm" data-act="rs-new">${icon('plus', 'sm')}Yeni liste</button>` : ''}
    </div>
    <div class="rs-info" id="rsInfo"></div>
    <div class="rs-stage" id="rsStage"></div>`);
  RS.stage = $('#rsStage');
  if (isPublisher()) bindRosterDrop(RS.stage);
  showRoster(want);
  syncRosters();
  // Excel (Google E-Tablolar) değiştikçe açık sayfa da güncellensin
  clearInterval(RS.timer);
  RS.timer = setInterval(() => {
    if (!RS.stage || !document.body.contains(RS.stage)) { clearInterval(RS.timer); return; }
    if (document.visibilityState === 'visible' && S.rosters.some((x) => x.linked)) syncRosters();
  }, 30000);
}

// Google tablosu değişince her sayfada en geç 1 dakikada görünsün; uygulamaya geri dönülünce hemen denetle
let _rsAutoAt = 0;
function rosterAutoSync() {
  if (!S.me || document.visibilityState !== 'visible' || !(S.rosters || []).some((x) => x.linked)) return;
  if (Date.now() - _rsAutoAt < 20000) return;
  _rsAutoAt = Date.now();
  syncRosters();
}
setInterval(rosterAutoSync, 60000);
document.addEventListener('visibilitychange', rosterAutoSync);

/** Sunucudaki güncel listeleri alır; başka biri yeni dosya yüklediyse görünümü yeniler */
async function syncRosters() {
  const sig = () => JSON.stringify(S.rosters.map((x) => [x.id, x.name, x.file && x.file.id, x.tab, x.tabs, x.period, rmMonths(x).map((m) => [m.ym, m.file.id, m.parsed])]));
  const before = sig();
  try { S.rosters = (await api('rosters.list')).rosters; } catch (e) { return; }
  if (sig() === before) return;
  renderNav();
  if (typeof MY !== 'undefined') MY.at = 0;
  // Liste değişti: ana sayfa / takvim açıksa yeni nöbetlerle yeniden çiz (açık pencere yoksa)
  const r0 = currentRoute()[0] || '';
  if ((r0 === '' || r0 === 'nobetim') && !(typeof modalStack !== 'undefined' && modalStack.length)) { route(); return; }
  if (!RS.stage || !document.body.contains(RS.stage)) return;
  if (!rosterById(RS.active)) { renderRosters($('#view'), null); return; }
  showRoster(RS.active);
}

function drawRosterTabs() {
  const box = $('#rsTabs');
  if (!box) return;
  setHTML(box, S.rosters.filter((r) => (r.kind === 'tablo' ? 'tablo' : 'nobet') === (RS.group || 'nobet') && (RS.group !== 'tablo' || r.id === RS.active)).map((r) => html`<button role="tab" class="${r.id === RS.active ? 'on' : ''}" data-act="rs-tab" data-id="${r.id}">${icon('table', 'sm')}${r.name}${r.file && isFresh(r.file.updated_at) ? html`<span class="dot" title="Yeni güncellendi"></span>` : ''}</button>`));
}
function isFresh(at) { const d = parseDT(at); return d && Date.now() - d.getTime() < 3 * 86400000; }

function drawRosterInfo() {
  const r = rosterById(RS.active);
  const box = $('#rsInfo');
  if (!r || !box) return;
  const f = rmFile(r);
  const mo = rmView(r);
  const ms = rmMonths(r);
  const prim = r.period;
  const isPrim = mo && mo.ym === prim;
  const past = ms.filter((m) => prim && m.ym < prim);
  const ahead = ms.filter((m) => !prim || m.ym >= prim).sort((a, b) => (a.ym === prim ? -1 : b.ym === prim ? 1 : a.ym.localeCompare(b.ym)));
  const nowYm = ymNow();
  const suggest = isPublisher() && prim && prim < nowYm && ms.some((m) => m.ym === nowYm);
  const monthBar = !r.linked && (ms.length || isPublisher()) ? html`<div class="rs-months" role="tablist" aria-label="Aylar">
      ${ahead.map((m) => html`<button type="button" role="tab" class="chip-btn rs-mo ${mo && mo.ym === m.ym ? 'on' : ''}" data-act="rs-mo" data-ym="${m.ym}" aria-selected="${mo && mo.ym === m.ym ? 'true' : 'false'}">${m.ym === prim ? icon('star', 'sm') : ''}${periodLabel(m.ym)}${m.ym === prim ? html`<span class="tiny rs-mo-cur">güncel</span>` : m.ym > prim ? html`<span class="tiny faint">sıradaki</span>` : ''}</button>`)}
      ${past.length ? html`<button type="button" class="chip-btn rs-mo ${mo && prim && mo.ym < prim ? 'on' : ''}" data-act="rs-past">${icon('history', 'sm')}${mo && prim && mo.ym < prim ? periodLabel(mo.ym) : `Geçmiş aylar (${past.length})`}${icon('chevD', 'sm')}</button>` : ''}
      ${isPublisher() ? html`<button type="button" class="chip-btn ghost" data-act="rs-addmo">${icon('plus', 'sm')}Ay ekle</button>` : ''}
    </div>
    ${suggest ? html`<div class="tiny rs-suggest">${icon('calendar', 'sm')}<span><b>${periodLabel(nowYm)}</b> başladı; liste hâlâ ${periodLabel(prim)} ayını güncel gösteriyor.</span><button type="button" class="btn sm" data-act="rs-primary" data-ym="${nowYm}">Güncel ay yap: ${periodLabel(nowYm)}</button></div>` : ''}
    ${mo && !isPrim ? html`<div class="tiny rs-notcur">${icon(prim && mo.ym < prim ? 'history' : 'clock', 'sm')}<span>${prim && mo.ym < prim ? html`<b>Geçmiş ay</b> · arşivden görüntüleniyor` : html`<b>Sıradaki ay</b> · nöbetler takvimde yine görünür`}</span>
      ${isPublisher() ? html`<button type="button" class="btn sm" data-act="rs-primary" data-ym="${mo.ym}">${icon('star', 'sm')}Güncel ay yap</button>` : ''}<a href="#" data-act="rs-mo" data-ym="${prim}">Güncel aya dön</a></div>` : ''}` : '';
  setHTML(box, html`
    <div class="grow" style="min-width:0">
      <h1 class="rs-title ellipsis">${r.name}${mo ? html` <span class="rs-title-mo">· ${periodLabel(mo.ym)}</span>` : ''}</h1>
      ${monthBar}
      <div class="small muted rs-meta">${f ? html`${icon('clock', 'sm')}<span>${fmtRel(f.updated_at)} güncellendi${r.linked ? ' · Google E-Tablolar' : f.user_name ? ' · ' + f.user_name : ''}</span>${isPublisher() ? html`<span class="faint ellipsis rs-file">· ${f.name}</span>` : ''}` : 'Henüz dosya yüklenmedi'}</div>
      ${r.linked ? html`${isPublisher() ? html`<div class="tiny rs-linked">${icon('link', 'sm')}<span><b>Google E-Tablolar’a bağlı</b> · tablo değişince kendiliğinden güncellenir${r.sync_at ? ' · son kontrol ' + fmtRel(r.sync_at) : ''}${r.tab ? ' · sekme: ' + r.tab : ''}</span></div>` : ''}
        ${isPublisher() && r.sync_status ? html`<div class="tiny ${String(r.sync_status).startsWith('!') ? 'err-text' : 'faint'} rs-parsed">${icon('calendar', 'sm')}<span>${String(r.sync_status).replace(/^!/, '')}</span></div>` : ''}`
      : f && isPublisher() && mo && mo.parsed ? html`<div class="tiny faint rs-parsed">${icon('calendar', 'sm')}<span><b>${periodLabel(mo.ym)}</b> · ${mo.count || 0} nöbet kaydı okundu</span>${isPrim ? html`<a href="#" data-act="rs-period">Ayı değiştir</a>` : ''}</div>`
      : f && isPublisher() && !mo && r.period && r.parsed_file_id === f.id ? html`<div class="tiny faint rs-parsed">${icon('calendar', 'sm')}<span><b>${periodLabel(r.period)}</b> · ${r.parsed_count || 0} nöbet kaydı okundu</span><a href="#" data-act="rs-period">Ayı değiştir</a></div>` : ''}
      ${r.signed ? html`<div class="tiny rs-signed">${icon('checkCircle', 'sm')}<span><b>İmzalı resmî liste</b> (${periodLabel(r.signed.ym)})</span><a href="${r.signed.url}" target="_blank" rel="noopener">Aç</a></div>` : ''}
      <div class="rs-progress hidden" id="rsProgress"><div class="progress"><span style="width:0%"></span></div><span class="tiny muted">Yükleniyor…</span></div>
    </div>
    <div class="row wrap rs-actions">
      ${f ? html`<button class="btn sm" data-act="rs-full" title="Tam ekran">${icon('expand', 'sm')}<span class="desk-only">Tam ekran</span></button>
        <button class="btn sm icon" data-act="fv-dl" data-url="${f.url}" data-name="${f.name}" title="İndir" aria-label="İndir">${icon('download', 'sm')}</button>` : ''}
      ${isPublisher() ? html`
        ${r.linked ? '' : html`<label class="btn sm primary">${icon('upload', 'sm')}<span>${!f ? 'Excel yükle' : mo ? `${periodLabel(mo.ym)} için yeni sürüm` : 'Yeni sürüm yükle'}</span><input type="file" hidden accept="${ROSTER_ACCEPT}" data-change="rs-file"></label>`}
        <button class="btn sm icon" data-act="rs-menu" aria-label="Liste işlemleri">${icon('more', 'sm')}</button>`
        : r.versions > 1 ? html`<button class="btn sm" data-act="rs-versions">${icon('history', 'sm')}Önceki sürümler</button>` : ''}
    </div>`);
}

/** Telefonda tablo kaydırılmaya başlanınca sayfayı tablonun başına getirir: tablo ekranı tam doldurur, iç içe kaydırma olmaz */
function rsAlignView(ev) {
  if (window.innerWidth > 900 || !ev.target.closest || !ev.target.closest('.xv-scroll')) return;
  const el = ev.currentTarget;
  const tb = document.querySelector('.topbar');
  const gap = el.getBoundingClientRect().top - ((tb ? tb.getBoundingClientRect().bottom : 0) + 8);
  if (gap > 4) window.scrollBy({ top: gap, behavior: 'smooth' });
}

function showRoster(id) {
  const r = rosterById(id);
  if (!r || !RS.stage) return;
  RS.active = id;
  rememberRoster(id);
  if (location.hash !== '#/nobet/' + id) history.replaceState(null, '', '#/nobet/' + id);
  drawRosterTabs();
  drawRosterInfo();
  renderNav();
  const file = rmFile(r);
  const mo = rmView(r);
  const fileId = file ? file.id : 0;
  let v = RS.views.get(id);
  if (v && v.fileId !== fileId) { v.el.remove(); RS.views.delete(id); v = null; }
  RS.views.forEach((x) => x.el.classList.add('hidden'));
  if (!v) {
    const el = document.createElement('div');
    el.className = 'rs-view';
    el.addEventListener('touchmove', rsAlignView, { passive: true });
    el.addEventListener('wheel', rsAlignView, { passive: true });
    RS.stage.appendChild(el);
    v = { el, fileId };
    RS.views.set(id, v);
    if (file) {
      mountPreview(el, file, Object.assign(r.linked ? { sheetName: r.tab || undefined, sheets: r.tabs || undefined } : {}, { ym: mo ? mo.ym : (r.period || '') })).then(() => {
        prefetchRosters();
        // Yayıncı listeyi (ayı) ilk kez görünce kişi başı nöbetler okunur (Nöbetlerim, hatırlatmalar, kim nöbette)
        const need = mo ? !mo.parsed : r.parsed_file_id !== file.id;
        if (isPublisher() && !r.linked && need && ['xlsx', 'xlsm', 'xls', 'ods', 'csv'].includes(extOf(file.name))) {
          loadSheetModel(file).then((model) => syncRosterShifts(r, model, mo)).catch(() => {});
        }
      });
    } else {
      setHTML(el, isPublisher()
        ? html`<label class="dropzone rs-drop">${icon('upload', 'lg')}<div style="margin-top:8px"><b>Excel dosyasını buraya sürükleyin</b> veya tıklayıp seçin</div><div class="hint">.xlsx, .xls, .ods, .csv — renkler, birleşik hücreler ve sütun genişlikleriyle görünür</div><input type="file" hidden accept="${ROSTER_ACCEPT}" data-change="rs-file"></label>`
        : r.linked ? html`<div class="card empty"><div class="e-ico">${icon('link', 'lg')}</div><h3>Google E-Tablolar’dan bekleniyor</h3><p class="small">Tablodaki ilk değişiklikte burada görünecek.</p></div>`
        : html`<div class="card empty"><div class="e-ico">${icon('table', 'lg')}</div><h3>Bu liste henüz yüklenmedi</h3><p class="small">Yöneticiniz yüklediğinde burada açık olarak görünecek.</p></div>`);
    }
  }
  v.el.classList.remove('hidden');
}

/** Diğer listeleri arka planda hazırla: geçiş anında olsun */
function prefetchRosters() {
  setTimeout(() => {
    S.rosters.forEach((r) => {
      const f = rmFile(r);
      if (f && previewKind(f) === 'sheet') loadSheetModel(f).catch(() => {});
    });
  }, 300);
}

ACT['rs-tab'] = (el) => { navStep('#/nobet/' + el.dataset.id); showRoster(+el.dataset.id); };
ACT['rs-full'] = () => {
  const r = rosterById(RS.active); const f0 = r && rmFile(r); if (!r || !f0) return;
  // Sayfada açık olan sekme ile aç (tam ekranda da aynı ay, aynı sabit sütunlar)
  const v = RS.views.get(r.id);
  const opts = r.linked ? { sheetName: r.tab || undefined, sheets: r.tabs || undefined } : {};
  if (v && v.el.dataset.sheet) opts.sheetName = v.el.dataset.sheet;
  const mo = rmView(r);
  opts.ym = mo ? mo.ym : (r.period || '');
  openFullViewer(f0, r.name + (mo ? ' · ' + periodLabel(mo.ym) : ''), opts);
};

async function uploadRosterFile(file, opt = {}) {
  if (!file || RS.busy) return;
  const r = rosterById(RS.active);
  if (!r) return;
  // Hangi ay: verilmediyse dosyanın içinden okunur; açık olan aydan farklıysa sorulur; bulunamazsa ay seçilir
  let ym = opt.ym || null;
  if (!ym) {
    const det = await rmDetectYm(file);
    const view = rmViewYm(r);
    if (!view) ym = det || r.period || null;
    else if (det && det !== view) {
      ym = await rmAskYm(r, det, view);
      if (!ym) return;
    } else ym = view;
    if (!ym) { rmAddMonth(r, file); return; }
  }
  if (opt.primary === undefined) { const nowYm = ymNow(); opt.primary = !r.period || ym === r.period || (ym > r.period && ym <= nowYm); }
  RS.busy = true;
  const prog = $('#rsProgress');
  if (prog) prog.classList.remove('hidden');
  const bar = prog && prog.querySelector('.progress span');
  const label = prog && prog.querySelector('span.tiny');
  try {
    const att = await uploadFile(file, (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (label) label.textContent = `Yükleniyor… %${Math.round(p * 100)}`; });
    const res = await api('rosters.upload', { id: r.id, attachment_id: att.id, ym, primary: !!opt.primary });
    RS.vm[r.id] = ym;
    // Yükleme sırasında liste yenilenmiş olabilir: güncel nesneyi güncelle
    const cur = rosterById(r.id) || r;
    Object.assign(cur, res.roster);
    toast(`“${cur.name}” · ${periodLabel(ym)} güncellendi` + (res.post_id ? ' · duyuru yayımlandı' : '') + (res.mailed ? ` · ${res.mailed} kişiye e-posta` : ''));
    if (res.post_id) refreshCounts();
    if (RS.active === cur.id) showRoster(cur.id);
  } catch (e) {
    toast(e.message, 'err');
    drawRosterInfo();
  } finally {
    RS.busy = false;
  }
}
CHANGE['rs-file'] = (el) => { const f = el.files && el.files[0]; el.value = ''; uploadRosterFile(f); };
function bindRosterDrop(stage) {
  stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); stage.classList.add('over'); } });
  stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('over'); });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) uploadRosterFile(f);
  });
}

ACT['rs-new'] = async () => {
  const name = await promptDialog({ title: 'Yeni nöbet listesi', label: 'Liste adı', placeholder: 'Örn: Hemşire Nöbet Listesi', ok: 'Oluştur' });
  if (!name) return;
  try {
    const res = await api('rosters.save', { name });
    S.rosters = res.rosters;
    toast('Liste oluşturuldu. Şimdi Excel dosyasını yükleyin.');
    if (currentRoute()[0] === 'nobet' && RS.stage) { drawRosterTabs(); showRoster(res.id); renderNav(); } else location.hash = '#/nobet/' + res.id;
  } catch (e) { toast(e.message, 'err'); }
};
ACT['rs-menu'] = (el) => {
  const r = rosterById(RS.active);
  openMenu(el, [
    { id: 'n', icon: 'edit', label: 'Yeniden adlandır', run: () => renameRoster(r) },
    { id: 'v', icon: 'history', label: `Önceki sürümler (${rmView(r) ? rmView(r).versions : r.versions})`, run: () => rosterVersions(r) },
    ...(rmView(r) && !r.linked ? [{ id: 'mx', icon: 'trash', label: `${periodLabel(rmView(r).ym)} ayını listeden kaldır`, danger: true, run: () => rmDeleteMonth(r, rmView(r).ym) }] : []),
    '-',
    { id: 'd', icon: 'trash', label: 'Listeyi sil', danger: true, run: () => deleteRoster(r) },
  ]);
};
ACT['rs-versions'] = () => rosterVersions(rosterById(RS.active));

async function renameRoster(r) {
  const name = await promptDialog({ title: 'Listeyi yeniden adlandır', label: 'Liste adı', value: r.name, ok: 'Kaydet' });
  if (!name || name === r.name) return;
  try {
    S.rosters = (await api('rosters.save', { id: r.id, name })).rosters;
    drawRosterTabs(); drawRosterInfo(); renderNav();
    toast('Liste adı güncellendi');
  } catch (e) { toast(e.message, 'err'); }
}
async function deleteRoster(r) {
  const ok = await confirmDialog({ title: `“${r.name}” silinsin mi?`, text: 'Liste ve tüm Excel sürümleri kalıcı olarak silinecek.', ok: 'Sil', danger: true });
  if (!ok) return;
  try {
    S.rosters = (await api('rosters.delete', { id: r.id })).rosters;
    toast('Liste silindi');
    renderRosters($('#view'), S.rosters[0] && S.rosters[0].id);
    renderNav();
  } catch (e) { toast(e.message, 'err'); }
}
async function rosterVersions(r) {
  const vmo = rmView(r);
  const m = openModal({ title: `${r.name}${vmo ? ' · ' + periodLabel(vmo.ym) : ''} — sürümler`, body: html`<div style="display:grid;place-items:center;padding:30px"><div class="spinner"></div></div>` });
  let list;
  try { list = (await api('rosters.versions', { id: r.id, ym: vmo ? vmo.ym : '' })).versions; } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  m.setBody(html`<p class="small muted" style="margin-bottom:12px">${vmo ? 'Bu ayın son 5 yüklemesi saklanır.' : 'Son 15 yükleme saklanır.'} Yanlış dosya yüklendiyse önceki sürümü geri yükleyebilirsiniz.</p>
    <div class="card"><div class="list">${list.map((v, i) => html`<div class="list-row">
      <span class="a-ico tone-${fileKind(v.mime, v.name).tone}" style="width:34px;height:34px;border-radius:8px;display:grid;place-items:center;font-size:10px;font-weight:700">${fileKind(v.mime, v.name).label}</span>
      <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${v.name}</div><div class="lr-s">${fmtDateTime(v.updated_at)}${v.user_name ? ' · ' + v.user_name : ''} · ${fmtSize(v.size)}</div></div>
      ${i === 0 ? html`<span class="badge success">Güncel</span>` : ''}
      <button class="btn sm" data-ver-open="${i}">Aç</button>
      ${i > 0 && isPublisher() && !r.linked ? html`<button class="btn sm" data-ver-restore="${v.version_id}">Geri yükle</button>` : ''}
    </div>`)}</div></div>`);
  m.el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-ver-open]');
    if (o) { const v = list[+o.dataset.verOpen]; openFullViewer(v, `${r.name} · ${fmtDateTime(v.updated_at)}`); return; }
    const b = e.target.closest('[data-ver-restore]');
    if (!b) return;
    await busy(b, async () => {
      try {
        const res = await api('rosters.restore', { id: r.id, version_id: +b.dataset.verRestore });
        Object.assign(r, res.roster);
        m.close();
        toast('Önceki sürüm geri yüklendi');
        showRoster(r.id);
      } catch (err) { toast(err.message, 'err'); }
    });
  });
}


/* ---------------- Aylar: ay seç, ay ekle, güncel ay yap, ayı kaldır ---------------- */
ACT['rs-mo'] = (el, ev) => { if (ev) ev.preventDefault(); const r = rosterById(RS.active); if (!r || !el.dataset.ym) return; RS.vm[r.id] = el.dataset.ym; showRoster(r.id); };
ACT['rs-past'] = (el) => {
  const r = rosterById(RS.active); if (!r) return;
  const past = rmMonths(r).filter((m) => r.period && m.ym < r.period);
  openMenu(el, past.map((m) => ({ id: m.ym, icon: 'calendar', label: `${periodLabel(m.ym)}${m.count ? ` · ${m.count} kayıt` : ''}`, run: () => { RS.vm[r.id] = m.ym; showRoster(r.id); } })));
};
ACT['rs-addmo'] = (el, ev) => { if (ev) ev.preventDefault(); const r = rosterById(RS.active); if (r) rmAddMonth(r, null); };
ACT['rs-primary'] = (el) => busy(el, async () => {
  const r = rosterById(RS.active); const ym = el.dataset.ym; if (!r || !ym) return;
  try {
    const res = await api('rosters.primary', { id: r.id, ym });
    Object.assign(r, res.roster); RS.vm[r.id] = ym;
    toast(`${periodLabel(ym)} artık güncel ay · liste açılınca bu ay görünür`);
    showRoster(r.id); if (typeof MY !== 'undefined') MY.at = 0;
  } catch (e) { toast(e.message, 'err'); }
});
async function rmDeleteMonth(r, ym) {
  if (!(await confirmDialog({ title: `${periodLabel(ym)} listeden kaldırılsın mı?`, text: `“${r.name}” listesindeki ${periodLabel(ym)} dosyaları ve o ayın nöbet kayıtları silinir (Takvimim, Kim nöbette ve hesaplardan da kalkar). Diğer aylar kalır.`, ok: 'Ayı kaldır', danger: true }))) return;
  try {
    const res = await api('rosters.month.delete', { id: r.id, ym });
    Object.assign(r, res.roster); delete RS.vm[r.id];
    toast(`${periodLabel(ym)} kaldırıldı`); showRoster(r.id); if (typeof MY !== 'undefined') MY.at = 0;
  } catch (e) { toast(e.message, 'err'); }
}
/** Ay ekle: hangi ayın listesi + dosya + güncel ay yapılsın mı */
function rmAddMonth(r, file) {
  const ms = rmMonths(r);
  const nowYm = ymNow();
  const def = ms.length ? ymAdd(ms.map((m) => m.ym).sort().pop(), 1) : (r.period || nowYm);
  const opts = []; for (let k = -6; k <= 12; k++) opts.push(ymAdd(nowYm, k));
  if (!opts.includes(def)) opts.push(def);
  opts.sort();
  let picked = file || null;
  const m = openModal({ title: `${r.name} · ay ekle`, size: 'narrow', body: html`<form class="stack" id="rmAddF">
      <div class="field"><label for="rmYm">Hangi ayın listesi?</label><select class="select" id="rmYm" name="ym">${opts.map((y) => html`<option value="${y}" ${y === def ? raw('selected') : ''}>${periodLabel(y)}${ms.some((x) => x.ym === y) ? ' · listede var (yeni sürüm olur)' : ''}${y === nowYm ? ' · bu ay' : ''}</option>`)}</select></div>
      <label class="dropzone rs-drop" style="padding:16px">${icon('upload', 'sm')} <span id="rmFn">${picked ? picked.name : 'Excel dosyasını seçin'}</span><input type="file" hidden accept="${ROSTER_ACCEPT}" id="rmFile"></label>
      <label class="small row" style="gap:8px;align-items:flex-start"><input type="checkbox" id="rmPrim"><span><b>Güncel ay yap</b><br><span class="tiny muted">Liste açılınca bu ay görünür. İşaretlemezseniz sıradaki / geçmiş ay olarak eklenir.</span></span></label>
      <p class="tiny err-text hidden" id="rmErr"></p></form>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" data-ok>Yükle</button>` });
  const sel = $('#rmYm', m.el), chk = $('#rmPrim', m.el);
  const syncChk = () => { const y = sel.value; chk.checked = !r.period || (y > r.period && y <= nowYm) || y === r.period; };
  syncChk(); sel.addEventListener('change', syncChk);
  $('#rmFile', m.el).addEventListener('change', (e) => { picked = e.target.files && e.target.files[0]; $('#rmFn', m.el).textContent = picked ? picked.name : 'Excel dosyasını seçin'; });
  m.el.querySelector('[data-ok]').addEventListener('click', () => {
    if (!picked) { const er = $('#rmErr', m.el); er.textContent = 'Önce dosyayı seçin.'; er.classList.remove('hidden'); return; }
    const ym = sel.value, primary = chk.checked;
    m.close();
    RS.vm[r.id] = ym;
    uploadRosterFile(picked, { ym, primary });
  });
}

/** Dosyanın hangi ayın listesi olduğu (Excel’in içinden / adından); bulunamazsa null */
async function rmDetectYm(file) {
  if (!file || !['xlsx', 'xlsm', 'xls', 'ods', 'csv'].includes(extOf(file.name)) || typeof extractShifts !== 'function') return null;
  // Yerel dosya: görüntüleyicinin dosya kaydı üzerinden okunur (sunucuya gitmeden)
  const url = 'rmfile:' + Date.now() + Math.random().toString(36).slice(2);
  window.NM_FILE_REG = window.NM_FILE_REG || {};
  window.NM_FILE_REG[url] = file;
  try {
    const model = await loadSheetModel({ name: file.name, url });
    const res = extractShifts(model, { dict: shiftDict(), fileName: file.name, uploadedAt: ymd(new Date()) + ' 00:00:00' });
    return res && res.ok && res.year && res.month ? `${res.year}-${pad(res.month)}` : null;
  } catch (e) { return null; } finally { delete window.NM_FILE_REG[url]; }
}
/** Dosyadaki ay açık olan aydan farklı: hangisine yüklensin */
function rmAskYm(r, det, view) {
  return new Promise((resolve) => {
    let done = false;
    const has = rmMonths(r).some((m) => m.ym === det);
    const m = openModal({ title: 'Bu dosya hangi ayın?', size: 'narrow',
      body: html`<p class="muted">Dosya <b>${periodLabel(det)}</b> listesi gibi görünüyor; açık olan ay <b>${periodLabel(view)}</b>.</p>
        <p class="tiny muted">${has ? `${periodLabel(det)} listede var; yeni sürümü olur.` : `${periodLabel(det)} listeye yeni ay olarak eklenir; ${periodLabel(view)} olduğu gibi kalır.`}</p>`,
      foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn" data-ym="${view}">${periodLabel(view)} olarak yükle</button><button class="btn primary" data-ym="${det}">${periodLabel(det)} olarak yükle</button>`,
      onClose: () => { if (!done) resolve(null); } });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-ym]'); if (!b) return; done = true; m.close(); resolve(b.dataset.ym); });
  });
}
