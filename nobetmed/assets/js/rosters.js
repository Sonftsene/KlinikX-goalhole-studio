/* dupcii — Excel nöbet listeleri */
'use strict';

const RS = { active: null, stage: null, views: new Map(), busy: false };
const rosterById = (id) => S.rosters.find((r) => r.id === id) || null;
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
    setHTML(view, html`${hubHead('list', 'Excel nöbet listeleri, yüklendiği gibi açık görünür')}
      <div class="card empty"><div class="e-ico">${icon('table', 'lg')}</div><h3>Henüz nöbet listesi yok</h3>
      ${isPublisher() ? html`<p class="small" style="margin-bottom:14px">Bir liste oluşturup Excel dosyanızı yükleyin.</p><button class="btn primary" data-act="rs-new">${icon('plus', 'sm')}Liste oluştur</button>` : html`<p class="small">Yöneticiniz liste yüklediğinde burada görünecek.</p>`}</div>`);
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
  const sig = () => JSON.stringify(S.rosters.map((x) => [x.id, x.name, x.file && x.file.id, x.tab, x.tabs]));
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
  const f = r.file;
  setHTML(box, html`
    <div class="grow" style="min-width:0">
      <h1 class="rs-title ellipsis">${r.name}</h1>
      <div class="small muted rs-meta">${f ? html`${icon('clock', 'sm')}<span>${fmtRel(f.updated_at)} güncellendi${r.linked ? ' · Google E-Tablolar' : f.user_name ? ' · ' + f.user_name : ''}</span><span class="faint ellipsis rs-file">· ${f.name}</span>` : 'Henüz dosya yüklenmedi'}</div>
      ${r.linked ? html`<div class="tiny rs-linked">${icon('link', 'sm')}<span><b>Google E-Tablolar’a bağlı</b> · Excel’de değişince kendiliğinden güncellenir${r.sync_at ? ' · son kontrol ' + fmtRel(r.sync_at) : ''}${r.tab ? ' · sekme: ' + r.tab : ''}</span></div>
        ${isPublisher() && r.sync_status ? html`<div class="tiny ${String(r.sync_status).startsWith('!') ? 'err-text' : 'faint'} rs-parsed">${icon('calendar', 'sm')}<span>${String(r.sync_status).replace(/^!/, '')}</span></div>` : ''}`
      : f && isPublisher() && r.period && r.parsed_file_id === f.id ? html`<div class="tiny faint rs-parsed">${icon('calendar', 'sm')}<span><b>${periodLabel(r.period)}</b> · ${r.parsed_count || 0} nöbet kaydı okundu</span><a href="#" data-act="rs-period">Ayı değiştir</a></div>` : ''}
      ${r.signed ? html`<div class="tiny rs-signed">${icon('checkCircle', 'sm')}<span><b>İmzalı resmi liste</b> (${periodLabel(r.signed.ym)})</span><a href="${r.signed.url}" target="_blank" rel="noopener">Aç</a></div>` : ''}
      <div class="rs-progress hidden" id="rsProgress"><div class="progress"><span style="width:0%"></span></div><span class="tiny muted">Yükleniyor…</span></div>
    </div>
    <div class="row wrap rs-actions">
      ${f ? html`<button class="btn sm" data-act="rs-full" title="Tam ekran">${icon('expand', 'sm')}<span class="desk-only">Tam ekran</span></button>
        <button class="btn sm icon" data-act="fv-dl" data-url="${f.url}" data-name="${f.name}" title="İndir" aria-label="İndir">${icon('download', 'sm')}</button>` : ''}
      ${isPublisher() ? html`
        ${r.linked ? '' : html`<label class="btn sm primary">${icon('upload', 'sm')}<span>${f ? 'Yeni sürüm yükle' : 'Excel yükle'}</span><input type="file" hidden accept="${ROSTER_ACCEPT}" data-change="rs-file"></label>`}
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
  const fileId = r.file ? r.file.id : 0;
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
    if (r.file) {
      mountPreview(el, r.file, r.linked ? { sheetName: r.tab || undefined, sheets: r.tabs || undefined } : {}).then(() => {
        prefetchRosters();
        // Yayıncı listeyi ilk kez görünce kişi başı nöbetler okunur (Nöbetlerim, hatırlatmalar, kim nöbette)
        if (isPublisher() && !r.linked && r.file && r.parsed_file_id !== r.file.id && ['xlsx', 'xlsm', 'xls', 'ods', 'csv'].includes(extOf(r.file.name))) {
          loadSheetModel(r.file).then((model) => syncRosterShifts(r, model)).catch(() => {});
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
      if (r.file && previewKind(r.file) === 'sheet') loadSheetModel(r.file).catch(() => {});
    });
  }, 300);
}

ACT['rs-tab'] = (el) => { navStep('#/nobet/' + el.dataset.id); showRoster(+el.dataset.id); };
ACT['rs-full'] = () => {
  const r = rosterById(RS.active); if (!r || !r.file) return;
  // Sayfada açık olan sekme ile aç (tam ekranda da aynı ay, aynı sabit sütunlar)
  const v = RS.views.get(r.id);
  const opts = r.linked ? { sheetName: r.tab || undefined, sheets: r.tabs || undefined } : {};
  if (v && v.el.dataset.sheet) opts.sheetName = v.el.dataset.sheet;
  openFullViewer(r.file, r.name, opts);
};

async function uploadRosterFile(file) {
  if (!file || RS.busy) return;
  const r = rosterById(RS.active);
  if (!r) return;
  RS.busy = true;
  const prog = $('#rsProgress');
  if (prog) prog.classList.remove('hidden');
  const bar = prog && prog.querySelector('.progress span');
  const label = prog && prog.querySelector('span.tiny');
  try {
    const att = await uploadFile(file, (p) => { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (label) label.textContent = `Yükleniyor… %${Math.round(p * 100)}`; });
    const res = await api('rosters.upload', { id: r.id, attachment_id: att.id });
    // Yükleme sırasında liste yenilenmiş olabilir: güncel nesneyi güncelle
    const cur = rosterById(r.id) || r;
    Object.assign(cur, res.roster);
    toast(`“${cur.name}” güncellendi` + (res.post_id ? ' · duyuru yayınlandı' : '') + (res.mailed ? ` · ${res.mailed} kişiye e-posta` : ''));
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
    { id: 'v', icon: 'history', label: `Önceki sürümler (${r.versions})`, run: () => rosterVersions(r) },
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
  const m = openModal({ title: `${r.name} — sürümler`, body: html`<div style="display:grid;place-items:center;padding:30px"><div class="spinner"></div></div>` });
  let list;
  try { list = (await api('rosters.versions', { id: r.id })).versions; } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  m.setBody(html`<p class="small muted" style="margin-bottom:12px">Son 15 yükleme saklanır. Yanlış dosya yüklendiyse önceki sürümü geri yükleyebilirsiniz.</p>
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
