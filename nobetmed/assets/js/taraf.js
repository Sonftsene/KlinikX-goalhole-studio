/* dupcii — Google E-Tablolar bağlantısı, taraf listesi (kura) ve nöbet değişimi */
'use strict';

function unitShort(u) {
  const t = String(u || '').trim();
  const m = /^([A-Za-zÇĞİÖŞÜçğıöşü0-9])\b/.exec(t) || /^(\S)/.exec(t);
  return m ? m[1].toLocaleUpperCase('tr') : '?';
}
function trTone(x) {
  if (!x) return 'slate';
  if (x.kind && x.kind !== 'shift') return x.kind === 'role' ? 'teal' : 'slate';
  if ((x.hours || 0) >= 24) return 'emerald';
  return x.night ? 'indigo' : 'amber';
}
const shortDate = (d) => { const x = parseDT(d); return x ? `${x.getDate()} ${TR_MONTHS[x.getMonth()].slice(0, 3)}` : d; };

/* =================================================================== */
/* Ayarlar › Nöbet: Google E-Tablolar bağlantısı                        */
/* =================================================================== */
const GS = { data: null };
function gsyncCardHtml() {
  if (!isAdmin()) return '';
  return html`<div class="card card-pad stack" data-sec="nobet" id="gsCard"><div class="skel" style="height:16px;width:50%"></div></div>`;
}
async function mountGsync() {
  if (!$('#gsCard')) return;
  try { GS.data = (await api('gsync.get')).gs; } catch (e) { setHTML($('#gsCard'), html`<p class="small muted">${e.message}</p>`); return; }
  drawGsync();
}
function gsScript(g) {
  return `// dupcii · Google E-Tablolar otomatik eşitleme
// Bu betik SİZİN Google hesabınızda çalışır; tablo değişince güncel listeyi yalnızca kendi sitenize gönderir.
// 1) Kaydedin  2) Üstteki listeden "kur" işlevini seçip Çalıştır'a basın  3) İzin verin. Bu kadar.
var AYAR = {
  tablo: '${g.id}',
  adres: '${g.push_url}',
  anahtar: '${g.token}'
};

function kur() {
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('esitle').timeBased().everyMinutes(5).create();
    Logger.log('Zamanlayıcı kuruldu: her 5 dakikada bir kontrol edilecek.');
  } catch (e) {
    Logger.log('Zamanlayıcı kurulamadı (' + e.message + '). Biraz sonra "kur"u tekrar çalıştırın ya da soldaki saat simgesi > Tetikleyici ekle: işlev esitle, Zamana dayalı, Dakika zamanlayıcısı, 5 dakikada bir.');
  }
  esitle(true);
}

function esitle(zorla) {
  var dosya = DriveApp.getFileById(AYAR.tablo);
  var son = String(dosya.getLastUpdated().getTime());
  var ayar = PropertiesService.getScriptProperties();
  if (zorla !== true && son === ayar.getProperty('son')) return; // değişiklik yok
  var govde, tur;
  var r = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + AYAR.tablo + '/export?format=xlsx', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
  });
  var b = r.getContent();
  if (r.getResponseCode() === 200 && b.length > 4 && b[0] === 80 && b[1] === 75) {
    govde = b; tur = 'application/octet-stream';
  } else {
    // Tabloda indirme kapalıysa görünen değerler gönderilir
    var ss = SpreadsheetApp.openById(AYAR.tablo);
    var grid = ss.getSheets().map(function (sh) {
      var rg = sh.getDataRange();
      return {
        name: sh.getName(), hidden: sh.isSheetHidden(), values: rg.getDisplayValues(), backgrounds: rg.getBackgrounds(),
        merges: rg.getMergedRanges().map(function (m) { return [m.getRow() - 1, m.getColumn() - 1, m.getLastRow() - 1, m.getLastColumn() - 1]; })
      };
    });
    govde = JSON.stringify({ title: ss.getName(), grid: grid }); tur = 'application/json';
  }
  var y = UrlFetchApp.fetch(AYAR.adres, {
    method: 'post', contentType: tur, payload: govde, muteHttpExceptions: true,
    headers: { 'X-Sync-Token': AYAR.anahtar, 'X-Title': encodeURIComponent(dosya.getName()) }
  });
  if (y.getResponseCode() !== 200) throw new Error('dupcii yanıtı ' + y.getResponseCode() + ': ' + y.getContentText().slice(0, 300));
  ayar.setProperty('son', son);
  Logger.log('Uygulamaya gönderildi: ' + (JSON.parse(y.getContentText()).message || 'tamam'));
}
`;
}
function drawGsync() {
  const box = $('#gsCard');
  const g = GS.data;
  if (!box || !g) return;
  const linked = g.rosters.filter((r) => r.linked);
  const st = g.seen ? (g.status_ok ? 'success' : 'danger') : '';
  const kinds = g.kinds || [];
  setHTML(box, html`
    <div class="row between wrap"><div><h3 style="font-size:15px">${icon('link', 'sm')} Google E-Tablolar bağlantısı</h3>
      <p class="small muted">Excel listeniz Google E-Tablolar’daysa uygulama onu kendiliğinden izler. Sorumlu tabloyu düzenledikçe listeler, herkesin takvimi, Kim nöbette ve hatırlatmalar en geç 5 dakikada güncellenir. Uygulamada kimse listeyi değiştiremez.</p></div>
      <span class="badge ${st}">${g.seen ? (g.status_ok ? 'Bağlı' : 'Sorun var') : 'Bağlı değil'}</span></div>
    <div class="field"><label>Tablonun adresi</label><input class="input" id="gsSheet" value="${g.id ? 'https://docs.google.com/spreadsheets/d/' + g.id + '/edit' : ''}" placeholder="https://docs.google.com/spreadsheets/d/…/edit" autocomplete="off" spellcheck="false">
      <p class="hint">Tabloyu tarayıcıda açıp adres çubuğundaki bağlantıyı olduğu gibi yapıştırın.</p></div>
    <div class="seg seg-block gs-mode">
      <button type="button" class="${g.mode === 'push' ? 'on' : ''}" data-act="gs-mode" data-m="push">Yalnızca bana paylaşıldı</button>
      <button type="button" class="${g.mode === 'pull' ? 'on' : ''}" data-act="gs-mode" data-m="pull">Bağlantıya sahip herkes görebiliyor</button></div>
    <p class="tiny faint">${g.mode === 'push' ? 'Önerilen. Tablo yalnızca size (görüntüleyen olarak) paylaşıldıysa: kendi Google hesabınızda çalışan küçük bir betik değişiklikleri gönderir.' : 'Tablo herkese açık bağlantıyla paylaşıldıysa sunucu her 5 dakikada kendisi indirir; betik gerekmez.'}</p>
    <div><button type="button" class="btn primary" data-act="gs-save">${icon('check', 'sm')}Kaydet</button></div>
    ${g.id && g.mode === 'push' ? html`<div class="gs-steps stack">
      <h4>Betiği kurun (bir kez, 2 dakika)</h4>
      <ol class="small">
        <li><a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener"><b>script.google.com</b></a> adresini, tabloyu görebildiğiniz Google hesabıyla açın (yeni proje açılır).</li>
        <li>İçindeki kodu silin, aşağıdaki kodu yapıştırın ve <b>Kaydet</b>’e basın.</li>
        <li>Üstteki işlev listesinden <b>kur</b>’u seçip <b>Çalıştır</b>’a basın. İzin isterse hesabınızı seçin → <b>Gelişmiş</b> → <b>… projesine git</b> → <b>İzin ver</b>. (Kendi betiğinizdir; Google bu yüzden “doğrulanmadı” der.)</li>
        <li>Bitti. Aşağıda “Son veri” saati görünür; tablo her değiştiğinde en geç 5 dakikada uygulamaya gelir.</li>
      </ol>
      <div class="gs-code"><pre id="gsCode">${gsScript(g)}</pre><button type="button" class="btn sm" data-act="gs-copy">${icon('copy', 'sm')}Kodu kopyala</button></div>
      <p class="tiny faint">Kod, yalnızca sizin sitenize gönderim yapan gizli bir anahtar içerir; başkasıyla paylaşmayın. <a href="#" data-act="gs-token">Anahtarı yenile</a> (sonra kodu yeniden yapıştırın).</p>
    </div>` : ''}
    ${g.id ? html`<div class="gs-status ${g.status_ok ? '' : 'bad'}">
      <div class="row wrap" style="gap:14px"><span class="small">${icon('clock', 'sm')} Son veri: <b>${g.seen ? fmtRel(g.seen) : 'henüz gelmedi'}</b></span>${g.changed ? html`<span class="small muted">Son değişiklik: ${fmtRel(g.changed)}</span>` : ''}${g.title ? html`<span class="small muted">“${g.title}”</span>` : ''}</div>
      ${g.status ? html`<div class="small ${g.status_ok ? 'muted' : 'err-text'}">${g.status}</div>` : ''}
      ${g.fallback ? html`<div class="tiny faint">Tabloda indirme kapalı olduğu için görünen değerler alınıyor (renkler sade görünebilir).</div>` : ''}
      ${!g.parser ? html`<div class="small err-text">Sunucuda Excel okuyucu dosyası eksik. Paketi yeniden yükleyin.</div>` : ''}
      <div><button type="button" class="btn sm" data-act="gs-pull">${icon('history', 'sm')}${g.mode === 'pull' ? 'Şimdi eşitle' : 'Son veriyi yeniden işle'}</button></div>
    </div>` : ''}
    ${kinds.length ? html`<div class="stack" style="gap:8px"><h4>Hangi sekme hangi liste?</h4>
      <p class="tiny faint">Her ay için ayrı sekmeler (ör. “KASIM 3, BASAMAK”, “ARALIK 3.BASAMAK”) aynı listeye bağlanır; yeni ayın sekmesi açılınca kendiliğinden eklenir.</p>
      <div class="card"><div class="list">${kinds.map((k) => {
        const cur = g.rosters.find((r) => r.linked && r.kind === k.kind);
        return html`<div class="list-row gs-kind"><div class="grow" style="min-width:0"><div class="lr-t">${k.label}</div><div class="lr-s">${k.tabs.slice(0, 4).join(' · ')}${k.tabs.length > 4 ? ` · +${k.tabs.length - 4}` : ''}</div>
            ${cur && cur.status ? html`<div class="tiny ${String(cur.status).startsWith('!') ? 'err-text' : 'faint'}">${String(cur.status).replace(/^!/, '')}</div>` : ''}</div>
          <select class="select" data-change="gs-bind" data-kind="${k.kind}" style="width:auto;max-width:220px">
            <option value="">— Bağlı değil</option>
            ${g.rosters.map((r) => html`<option value="${r.id}" ${cur && cur.id === r.id ? raw('selected') : ''}>${r.name}${r.linked && (!cur || cur.id !== r.id) ? ' (başka sekmeye bağlı)' : ''}</option>`)}
            <option value="new">+ Yeni liste oluştur</option></select></div>`;
      })}</div></div></div>` : g.id && g.seen ? '' : g.id ? html`<p class="tiny faint">Betik ilk veriyi gönderdiğinde tablodaki sekmeler burada listelenir; sonra hangi sekmenin hangi listeye ait olduğunu seçersiniz.</p>` : ''}
    ${linked.length ? html`<p class="tiny faint">${icon('lock', 'sm')} Bağlı listeler: ${linked.map((r) => r.name).join(', ')} — bu listelere elle dosya yüklenemez; yalnızca Excel’deki değişikliklerle güncellenir.</p>` : ''}`);
}
ACT['gs-mode'] = (el) => { GS.data.mode = el.dataset.m; drawGsync(); };
ACT['gs-save'] = (el) => busy(el, async () => {
  try {
    GS.data = (await api('gsync.save', { sheet: $('#gsSheet').value, mode: GS.data.mode })).gs;
    toast(GS.data.mode === 'push' ? 'Kaydedildi. Şimdi betiği kurun.' : 'Kaydedildi. Eşitleme deneniyor…');
    drawGsync();
    if (GS.data.mode === 'pull' && GS.data.id) ACT['gs-pull']($('[data-act=gs-pull]'));
  } catch (e) { toast(e.message, 'err'); }
});
ACT['gs-copy'] = async () => {
  const t = gsScript(GS.data);
  try { await navigator.clipboard.writeText(t); toast('Kod kopyalandı'); } catch (e) {
    const r = document.createRange(); r.selectNodeContents($('#gsCode')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Kod seçildi; kopyalayın');
  }
};
ACT['gs-token'] = async () => {
  if (!(await confirmDialog({ title: 'Anahtar yenilensin mi?', text: 'Eski betik çalışmayı bırakır; yeni kodu script.google.com’da yeniden yapıştırmanız gerekir.', ok: 'Yenile', danger: true }))) return;
  try { GS.data = (await api('gsync.save', { new_token: true })).gs; drawGsync(); toast('Yeni anahtar oluşturuldu'); } catch (e) { toast(e.message, 'err'); }
};
ACT['gs-pull'] = (el) => busy(el, async () => {
  try {
    const r = await api('gsync.pull');
    GS.data = r.gs;
    drawGsync();
    const res = r.result || {};
    toast(res.error || res.message || (res.changed ? 'Güncellendi' : 'Değişiklik yok'), res.error ? 'err' : 'ok');
    refreshRosters();
  } catch (e) { toast(e.message, 'err'); }
});
CHANGE['gs-bind'] = async (el) => {
  const kind = el.dataset.kind;
  const v = el.value;
  try {
    let r;
    if (v === 'new') {
      const k = (GS.data.kinds || []).find((x) => x.kind === kind);
      const name = await promptDialog({ title: 'Yeni liste', label: 'Liste adı', value: k && !/genel liste/.test(k.label) ? k.label.replace(/\b\w/g, (c) => c) : 'Nöbet listesi', ok: 'Oluştur ve bağla' });
      if (!name) { drawGsync(); return; }
      r = await api('gsync.create', { name, kind });
    } else if (v === '') {
      const cur = GS.data.rosters.find((x) => x.linked && x.kind === kind);
      if (!cur) return;
      r = await api('gsync.bind', { roster_id: cur.id, unlink: true });
    } else {
      r = await api('gsync.bind', { roster_id: +v, kind });
    }
    GS.data = r.gs;
    drawGsync();
    toast(v === '' ? 'Bağlantı kaldırıldı' : 'Liste bağlandı ve okundu');
    refreshRosters();
  } catch (e) { toast(e.message, 'err'); drawGsync(); }
};

/* Ayarlar › Nöbet: değişim kuralları */
function swapRulesCardHtml(A) {
  if (!isAdmin()) return '';
  return html`<div class="card card-pad stack" data-sec="nobet">
    <div><h3 style="font-size:15px">${icon('history', 'sm')} Nöbet değişim kuralları</h3><p class="small muted">Takvimde “Değiş / Devret” seçeneklerinde yalnızca bu kurallara uyan kişiler ve günler çıkar.</p></div>
    <div class="row wrap"><span class="small muted">Üst üste en fazla</span><input class="input" type="number" id="swCont" min="8" max="72" value="${A.swap_max_cont || 24}" style="width:80px"><span class="small muted">saat çalışılabilir (24 = 24 saatlik nöbet çıkışına yeni nöbet eklenemez)</span></div>
    <div class="row wrap"><span class="small muted">İki nöbet arasında en fazla</span><input class="input" type="number" id="swGap" min="1" max="30" value="${A.swap_max_gap || 4}" style="width:80px"><span class="small muted">boş gün olabilir (4 = 5 günlük boşluk olamaz; izinli günler boşluk sayılmaz)</span></div>
    <div><button type="button" class="btn" data-act="swap-rules">Kuralları kaydet</button></div></div>`;
}
ACT['swap-rules'] = (el) => busy(el, async () => {
  try { await api('swap.rules', { max_cont: +$('#swCont').value, max_gap: +$('#swGap').value }); toast('Değişim kuralları kaydedildi'); } catch (e) { toast(e.message, 'err'); }
});

/* =================================================================== */
/* Taraf listesi                                                        */
/* =================================================================== */
const TR = { ym: '', data: null, day: null };
async function renderTaraf(view) {
  if (!TR.ym) TR.ym = ymd(new Date()).slice(0, 7);
  setHTML(view, html`${hubHead('taraf', 'Kim hangi blokta çalıştı · karşı tarafa geçişler ve kura', html`<div class="row wrap" style="gap:6px" id="trActs"></div>`)}
    <div id="trBody"><div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>`);
  await loadTaraf();
}
async function loadTaraf() {
  const want = TR.ym;
  let d;
  try { d = await api('side.get', { month: want }); } catch (e) { const b = $('#trBody'); if (b) setHTML(b, html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (TR.ym !== want) return;
  TR.data = d;
  const today = ymd(new Date());
  if (!TR.day || !TR.day.startsWith(want)) TR.day = today.startsWith(want) ? today : want + '-01';
  drawTaraf();
}
function trMoveFor(name, day) {
  const ds = `${TR.ym}-${pad(day)}`;
  const k = avKey(name);
  return (TR.data.moves || []).find((m) => m.date === ds && avKey(m.name) === k) || null;
}
function drawTaraf() {
  const d = TR.data;
  const body = $('#trBody');
  const acts = $('#trActs');
  if (!body || !d) return;
  if (acts) setHTML(acts, html`${d.sides.length >= 2 && d.can_record ? html`<button class="btn primary" data-act="tr-draw">${icon('layers', 'sm')}<span>Kura çek</span></button><button class="btn" data-act="tr-manual">${icon('edit', 'sm')}<span>Elle kaydet</span></button>` : ''}
    ${d.can_admin ? html`<button class="btn" data-act="tr-setup">${icon('sliders', 'sm')}<span>Taraflar</span></button>` : ''}`);
  if (d.sides.length < 2) {
    setHTML(body, html`<div class="card empty"><div class="e-ico">${icon('layers', 'lg')}</div><h3>Taraflar tanımlanmadı</h3>
      <p class="small">${d.can_admin ? html`Örneğin <b>3. Basamak → B blok</b> ve <b>2. Basamak → A blok, C blok</b>. Her tarafı kendi nöbet listesine bağlayın; kimin karşı tarafa kaç kez geçtiği buradan izlenir.` : 'Yönetici tarafları (ör. 3. Basamak · B blok, 2. Basamak · A ve C blok) tanımladığında burada görünür.'}</p>
      ${d.can_admin ? html`<button class="btn primary" data-act="tr-setup" style="margin-top:12px">${icon('sliders', 'sm')}Tarafları tanımla</button>` : ''}</div>`);
    return;
  }
  const [y, m] = TR.ym.split('-').map(Number);
  const days = d.days;
  const today = ymd(new Date());
  const sideName = (k) => (d.sides.find((s) => s.key === k) || {}).name || k;
  // Gün panosu: o gün hangi blokta kim var
  const di = +TR.day.slice(8, 10);
  const board = d.sides.map((sd) => {
    const here = sd.people.filter((p) => { const x = p.days[di]; return x && x.kind === 'shift'; });
    const stay = here.filter((p) => { const mv = trMoveFor(p.name, di); return !mv || sd.units.includes(mv.unit); });
    const out = here.filter((p) => { const mv = trMoveFor(p.name, di); return mv && !sd.units.includes(mv.unit); });
    const inc = (d.moves || []).filter((mv) => mv.date === TR.day && sd.units.includes(mv.unit) && mv.from !== sd.key);
    const chip = (p) => { const x = p.days[di]; const mv = trMoveFor(p.name, di); return html`<span class="tr-p">${codeChip({ code: x.code, kind: x.kind, hours: x.hours, start: x.night ? '16:00' : '08:00', end: x.night ? '08:00' : '16:00' })}<span>${p.name}</span>${mv ? html`<span class="tr-unit">${mv.unit}</span>` : ''}</span>`; };
    return html`<div class="card tr-board-c"><div class="card-head"><h3>${sd.name}</h3><span class="tiny faint">${sd.units.join(' · ')}</span></div>
      <div class="tr-board-l">${stay.length ? stay.map(chip) : html`<span class="tiny faint">Listede nöbetçi yok</span>`}
        ${inc.map((mv) => html`<span class="tr-p in">${icon('chevR', 'sm')}<span>${mv.name}</span><span class="tr-unit">${mv.unit}</span><span class="tiny faint">${sideName(mv.from)}’tan</span></span>`)}
        ${out.map((p) => { const mv = trMoveFor(p.name, di); return html`<span class="tr-p out"><span>${p.name}</span><span class="tiny faint">→ ${mv.unit}</span></span>`; })}</div></div>`;
  });
  // Sıra: en az geçen
  const order = d.sides.map((sd) => {
    const ppl = [...sd.people].sort((a, b) => a.total - b.total || a.name.localeCompare(b.name, 'tr'));
    const min = ppl.length ? ppl[0].total : 0;
    return html`<div class="tr-order"><b>${sd.name}</b><span class="tiny faint">Sıradakiler (${min} geçiş):</span>${ppl.filter((p) => p.total === min).map((p) => html`<span class="badge brand">${p.name}</span>`)}</div>`;
  });
  const wd = (dd) => new Date(y, m - 1, dd).getDay();
  const matrix = (sd) => html`<div class="sec-title">${icon('table', 'sm')} ${sd.name} <span class="tiny faint">· ${sd.units.join(', ')}</span></div>
    <div class="card tr-mx-wrap"><div class="tr-mx-scroll"><table class="tr-mx">
      <thead><tr><th class="tr-n">Personel</th>${Array.from({ length: days }, (_, i) => i + 1).map((dd) => html`<th class="${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''} ${`${TR.ym}-${pad(dd)}` === today ? 'td' : ''} ${dd === di ? 'sel' : ''}"><button type="button" data-act="tr-day" data-d="${dd}">${dd}<small>${['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][wd(dd)]}</small></button></th>`)}<th class="tr-c" title="Bu ay karşı tarafa geçiş">Ay</th><th class="tr-c" title="Toplam geçiş${d.since ? ' (' + fmtDate(d.since, true) + '’ten beri)' : ''}">Top.</th></tr></thead>
      <tbody>${sd.people.map((p) => html`<tr><th class="tr-n" title="${p.title || ''}">${p.name}</th>${Array.from({ length: days }, (_, i) => i + 1).map((dd) => {
        const x = p.days[dd];
        const mv = trMoveFor(p.name, dd);
        if (!x) return html`<td class="${dd === di ? 'sel' : ''} ${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''}"></td>`;
        const c = x.kind === 'shift' ? (x.hours >= 24 ? '24' : x.night ? 'N' : 'G') : String(x.code).slice(0, 3);
        return html`<td class="${dd === di ? 'sel' : ''} ${wd(dd) === 0 || wd(dd) === 6 ? 'we' : ''} ${mv && !sd.units.includes(mv.unit) ? 'tr-moved' : ''}" title="${x.code}${mv ? ' · ' + mv.unit + (mv.counted ? ' (sayıldı)' : '') : ''}"><span class="tr-c-${trTone(x)}">${c}</span>${mv ? html`<i>${unitShort(mv.unit)}</i>` : ''}</td>`;
      })}<td class="tr-c"><b>${p.month || ''}</b></td><td class="tr-c"><b>${p.total}</b></td></tr>`)}</tbody></table></div></div>`;
  const moves = (d.moves || []).slice().reverse();
  setHTML(body, html`
    <div class="tr-nav"><button class="btn sm icon" data-act="tr-mv" data-d="-1" aria-label="Önceki ay">${icon('chevL', 'sm')}</button><b>${TR_MONTHS[m - 1]} ${y}</b><button class="btn sm icon" data-act="tr-mv" data-d="1" aria-label="Sonraki ay">${icon('chevR', 'sm')}</button>
      <span class="grow"></span><span class="tiny faint">Sayılan: gece içeren nöbetler (16-08, 08-08). 08-16 sayılmaz.</span></div>
    <div class="card card-pad tr-orders">${order}</div>
    <div class="sec-title">${icon('calendar', 'sm')} ${dateLabel(TR.day)} · kim nerede</div>
    <div class="tr-board">${board}</div>
    ${d.sides.map(matrix)}
    <div class="sec-title">${icon('history', 'sm')} ${TR_MONTHS[m - 1]} geçişleri</div>
    ${moves.length ? html`<div class="card"><div class="list">${moves.map((mv) => html`<div class="list-row tr-log">
      <span class="tr-unit big">${unitShort(mv.unit)}</span>
      <div class="grow" style="min-width:0"><div class="lr-t">${mv.name} <span class="muted small">→ ${mv.unit}</span></div>
        <div class="lr-s">${shortDate(mv.date)} · ${mv.code} · ${sideName(mv.from)} → ${sideName(mv.to)} · ${mv.method === 'kura' ? 'kura' : 'elle'}${mv.counted ? ' · sayıldı' : ' · sayılmadı'}${mv.by ? ' · ' + mv.by : ''}</div>
        ${mv.pool && mv.pool.pool ? html`<div class="tiny faint">Adaylar: ${mv.pool.pool.map((x) => `${x.name} (${x.total})`).join(', ')}${mv.pool.group ? ' · kura: ' + mv.pool.group.join(', ') : ''}</div>` : ''}</div>
      ${mv.can_delete ? html`<button class="btn ghost icon sm" data-act="tr-del" data-id="${mv.id}" aria-label="Sil">${icon('trash', 'sm')}</button>` : ''}</div>`)}</div></div>`
    : html`<div class="card empty"><p class="small">Bu ay karşı tarafa geçiş kaydı yok.</p></div>`}`);
}
ACT['tr-mv'] = (el) => { const [y, m] = TR.ym.split('-').map(Number); const d = new Date(y, m - 1 + +el.dataset.d, 1); TR.ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; TR.day = null; loadTaraf(); };
ACT['tr-day'] = (el) => { TR.day = `${TR.ym}-${pad(+el.dataset.d)}`; drawTaraf(); };
ACT['tr-del'] = async (el) => {
  if (!(await confirmDialog({ title: 'Kayıt silinsin mi?', text: 'Bu geçiş kaydı ve sayımı silinir.', ok: 'Sil', danger: true }))) return;
  try { await api('side.delete', { id: +el.dataset.id }); toast('Silindi'); loadTaraf(); } catch (e) { toast(e.message, 'err'); }
};

/* Kura çekme penceresi */
ACT['tr-draw'] = () => openSideModal('draw');
ACT['tr-manual'] = () => openSideModal('manual');
async function openSideModal(mode) {
  const sides = TR.data.sides;
  const m = openModal({ title: mode === 'draw' ? 'Karşı tarafa kura' : 'Geçişi elle kaydet', body: html`<div class="stack" id="sdBody"></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="sdGo">${mode === 'draw' ? 'Kura çek' : 'Kaydet'}</button>` });
  const st = { date: TR.day && TR.day >= ymd(new Date()).slice(0, 7) ? TR.day : ymd(new Date()), from: sides[0].key, unit: '', count: 1, day: null, picked: null, name: '' };
  const otherUnits = () => sides.filter((s) => s.key !== st.from).flatMap((s) => s.units);
  st.unit = otherUnits()[0] || '';
  const load = async () => {
    try { st.day = await api('side.day', { date: st.date }); } catch (e) { st.day = null; toast(e.message, 'err'); }
    st.picked = null;
    draw();
  };
  const pool = () => { const s = st.day && st.day.sides.find((x) => x.key === st.from); return s ? s.people.filter((p) => !p.moved) : []; };
  const draw = () => {
    const ppl = pool();
    if (!st.picked) st.picked = new Set(ppl.filter((p) => p.night).map((p) => p.name));
    const chosen = ppl.filter((p) => st.picked.has(p.name));
    const min = chosen.length ? Math.min(...chosen.map((p) => p.total)) : 0;
    const grp = chosen.filter((p) => p.total === min);
    const allPeople = st.day ? st.day.sides.flatMap((s) => s.people.map((p) => ({ ...p, side: s.key }))) : [];
    setHTML($('#sdBody', m.el), html`
      <div class="grid2"><div class="field"><label>Tarih</label><input class="input" type="date" id="sdDate" value="${st.date}"></div>
        ${mode === 'draw' ? html`<div class="field"><label>Kaç kişi</label><select class="select" id="sdCount">${[1, 2, 3].map((n) => html`<option ${n === st.count ? raw('selected') : ''}>${n}</option>`)}</select></div>` : html`<span></span>`}</div>
      ${mode === 'draw' ? html`<div class="grid2"><div class="field"><label>Hangi taraftan</label><select class="select" id="sdFrom">${sides.map((s) => html`<option value="${s.key}" ${s.key === st.from ? raw('selected') : ''}>${s.name}</option>`)}</select></div>
        <div class="field"><label>Hangi birime</label><select class="select" id="sdUnit">${otherUnits().map((u) => html`<option ${u === st.unit ? raw('selected') : ''}>${u}</option>`)}</select></div></div>
        <div class="sec-label">Adaylar (o gün ${(sides.find((s) => s.key === st.from) || {}).name} listesinde nöbetçi olanlar)</div>
        ${ppl.length ? html`<div class="card"><div class="list">${ppl.map((p) => html`<label class="list-row sd-cand ${p.total === min && st.picked.has(p.name) ? 'prio' : ''}">
            <input type="checkbox" data-n="${p.name}" ${st.picked.has(p.name) ? raw('checked') : ''}>
            ${codeChip({ code: p.code, kind: 'shift', hours: p.hours, start: p.night ? '16:00' : '08:00', end: p.night ? '08:00' : '16:00' })}
            <span class="grow">${p.name}${p.night ? '' : html` <span class="tiny faint">(gündüz · geçerse sayılmaz)</span>`}</span>
            <span class="badge ${p.total === min && st.picked.has(p.name) ? 'brand' : ''}">${p.total} geçiş</span></label>`)}</div></div>
          <p class="small ${grp.length ? '' : 'muted'}">${grp.length ? html`Öncelik en az geçmiş olanlarda (<b>${min}</b>): <b>${grp.map((p) => p.name).join(', ')}</b>${grp.length > st.count ? ' — kura bu kişiler arasında çekilir.' : grp.length === st.count ? ' — kura gerekmeden bu kişi gider.' : ''}` : 'Kuraya girecek kişileri işaretleyin.'}</p>`
        : html`<p class="small muted">Bu tarihte bu tarafın listesinde nöbetçi görünmüyor.</p>`}`
      : html`<div class="field"><label>Kim</label><select class="select" id="sdName"><option value="">Seçin</option>${allPeople.filter((p) => !p.moved).map((p) => html`<option value="${p.name}" ${p.name === st.name ? raw('selected') : ''}>${p.name} · ${p.code} · ${(sides.find((s) => s.key === p.side) || {}).name}</option>`)}</select></div>
        <div class="field"><label>Nerede çalıştı</label><select class="select" id="sdUnit">${sides.flatMap((s) => s.units).map((u) => html`<option ${u === st.unit ? raw('selected') : ''}>${u}</option>`)}</select></div>
        <p class="tiny faint">Kura başka yerde çekildiyse veya görevlendirme yapıldıysa buradan kaydedin. Karşı tarafa gece içeren nöbetle geçiş 1 sayılır.</p>`}
      <div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" id="sdNote" maxlength="200"></div>`);
  };
  m.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'sdDate') { st.date = t.value; load(); }
    else if (t.id === 'sdFrom') { st.from = t.value; st.unit = otherUnits()[0] || ''; st.picked = null; draw(); }
    else if (t.id === 'sdUnit') st.unit = t.value;
    else if (t.id === 'sdCount') { st.count = +t.value; draw(); }
    else if (t.id === 'sdName') st.name = t.value;
    else if (t.dataset.n) { if (t.checked) st.picked.add(t.dataset.n); else st.picked.delete(t.dataset.n); draw(); }
  });
  $('#sdGo', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const note = ($('#sdNote', m.el) || {}).value || '';
    try {
      if (mode === 'draw') {
        const names = [...st.picked];
        if (!names.length) { toast('Kuraya girecek kişileri işaretleyin', 'err'); return; }
        const r = await api('side.draw', { date: st.date, from: st.from, unit: st.unit, count: st.count, names, note });
        await revealDraw(m, r, st);
      } else {
        if (!st.name) { toast('Kişiyi seçin', 'err'); return; }
        await api('side.save', { date: st.date, name: st.name, unit: st.unit || $('#sdUnit', m.el).value, note });
        m.close();
        toast('Kaydedildi');
      }
      TR.ym = st.date.slice(0, 7); TR.day = st.date;
      loadTaraf();
    } catch (err) { toast(err.message, 'err'); }
  }));
  load();
}
/** Kura sonucu: kısa bir döndürme ve sonuç */
function revealDraw(m, r, st) {
  return new Promise((resolve) => {
    const names = r.chosen.flatMap((c) => c.group);
    m.setTitle('Kura');
    m.setFoot(html`<button class="btn primary" data-act="close-modal">Tamam</button>`);
    m.setBody(html`<div class="draw-box"><div class="draw-roll" id="drRoll">${names[0] || ''}</div><div class="tiny faint" id="drSub">Kura çekiliyor…</div></div>`);
    let i = 0;
    const roll = $('#drRoll', m.el);
    const t = setInterval(() => { i++; if (roll) roll.textContent = names[i % names.length]; }, 90);
    setTimeout(() => {
      clearInterval(t);
      m.setBody(html`<div class="draw-box done"><div class="tiny faint">${dateLabel(st.date)} · ${st.unit}</div>
        ${r.chosen.map((c) => html`<div class="draw-roll win">${c.name}</div><div class="small muted">${c.group.length > 1 ? `${c.group.length} kişi (${c.total} geçiş) arasından kura ile seçildi: ${c.group.join(', ')}` : `En az geçen kişi olduğu için kurasız seçildi (${c.total} geçiş)`}</div>`)}
        <p class="tiny faint" style="margin-top:12px">Sonuç kaydedildi ve kişiye bildirim gitti. Adaylar ve sayılar kayıtta görünür.</p></div>`);
      resolve();
    }, names.length > 1 ? 1400 : 300);
  });
}

/* Taraf ayarları */
ACT['tr-setup'] = () => {
  const d = TR.data;
  const list = d.sides.length ? d.sides.map((s) => ({ ...s, units: s.units.join(', ') })) : [
    { key: 's3', name: '3. Basamak', roster_id: 0, units: 'B blok' }, { key: 's2', name: '2. Basamak', roster_id: 0, units: 'A blok, C blok' }];
  const rosters = d.rosters || [];
  // Liste adından tahmin
  list.forEach((s) => { if (!s.roster_id) { const n = (s.name.match(/\d/) || [])[0]; const r = n && rosters.find((x) => x.name.includes(n)); if (r) s.roster_id = r.id; } });
  const row = (s, i) => html`<div class="card card-pad stack tr-side-f" data-i="${i}">
    <div class="grid2"><div class="field"><label>Taraf adı</label><input class="input" name="name" value="${s.name}" placeholder="3. Basamak"></div>
      <div class="field"><label>Nöbet listesi</label><select class="select" name="roster_id"><option value="0">— Seçin</option>${rosters.map((r) => html`<option value="${r.id}" ${r.id === +s.roster_id ? raw('selected') : ''}>${r.name}</option>`)}</select></div></div>
    <div class="field"><label>Birimler <span class="faint">(virgülle)</span></label><input class="input" name="units" value="${s.units}" placeholder="A blok, C blok"><input type="hidden" name="key" value="${s.key}"></div></div>`;
  const m = openModal({ title: 'Taraflar', size: 'wide', body: html`<div class="stack"><p class="small muted">Her taraf bir nöbet listesine bağlanır. Listesindeki kişiler normalde o tarafın birimlerinde çalışır; kura ile başka tarafın birimine geçenler sayılır.</p>
      <div class="stack" id="tsList">${list.map(row)}</div>
      <div class="field"><label>Sayımın başlangıcı <span class="faint">(isteğe bağlı)</span></label><input class="input" type="date" id="tsSince" value="${d.since || ''}" style="max-width:200px"><p class="hint">Herkes eşitlendiğinde yeni bir dönem başlatmak için tarih seçin; bu tarihten önceki geçişler sayılmaz.</p></div></div>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" id="tsSave">Kaydet</button>` });
  $('#tsSave', m.el).addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const sides = $$('.tr-side-f', m.el).map((c) => ({ key: c.querySelector('[name=key]').value, name: c.querySelector('[name=name]').value, roster_id: +c.querySelector('[name=roster_id]').value, units: c.querySelector('[name=units]').value.split(',').map((x) => x.trim()).filter(Boolean) }));
    try { await api('side.settings', { sides, since: $('#tsSince', m.el).value }); m.close(); toast('Taraflar kaydedildi'); loadTaraf(); } catch (err) { toast(err.message, 'err'); }
  }));
};

/* =================================================================== */
/* Nöbet değişimi / devri                                               */
/* =================================================================== */
const SWAP = { items: [], todo: [] };
const SWAP_ST = { pending: ['Yanıt bekleniyor', 'warn'], accepted: ['Kabul edildi · Excel’e işlenmesi bekleniyor', 'info'], applied: ['Listeye işlendi', 'success'], declined: ['Reddedildi', 'danger'], cancelled: ['İptal edildi', ''], expired: ['Süresi geçti', ''] };
function swapText(r) {
  return r.kind === 'swap' ? html`<b>${r.from_name}</b> ${shortDate(r.from_date)} (${r.from_code}) ⇄ <b>${r.to_name}</b> ${shortDate(r.to_date)} (${r.to_code})`
    : html`<b>${r.from_name}</b> ${shortDate(r.from_date)} (${r.from_code}) → <b>${r.to_name}</b>`;
}
async function mountSwapBox() {
  try { const r = await api('swap.list'); SWAP.items = r.items; SWAP.todo = r.todo || []; } catch (e) { return; }
  drawSwapBox();
}
function drawSwapBox() {
  const box = $('#swapBox');
  if (!box) return;
  const live = SWAP.items.filter((r) => ['pending', 'accepted'].includes(r.status) || (r.decided_at && Date.now() - parseDT(r.decided_at).getTime() < 5 * 86400000) || (r.applied_at && Date.now() - parseDT(r.applied_at).getTime() < 5 * 86400000));
  const todo = SWAP.todo.filter((r) => !live.some((x) => x.id === r.id));
  if (!live.length && !todo.length) { setHTML(box, ''); return; }
  const row = (r, pub) => {
    const [t, tone] = SWAP_ST[r.status] || [r.status, ''];
    return html`<div class="list-row swap-row"><span class="np-ico tone-violet">${icon('history', 'sm')}</span>
      <div class="grow" style="min-width:0"><div class="small">${swapText(r)}</div><div class="tiny"><span class="badge ${tone}">${t}</span>${r.note ? html` <span class="faint">“${r.note}”</span>` : ''}</div></div>
      <div class="row" style="gap:6px">${r.incoming && r.status === 'pending' ? html`<button class="btn sm primary" data-act="swap-ans" data-id="${r.id}" data-a="1">Kabul et</button><button class="btn sm" data-act="swap-ans" data-id="${r.id}" data-a="0">Reddet</button>` : ''}
        ${(r.mine || pub) && ['pending', 'accepted'].includes(r.status) ? html`<button class="btn sm ghost" data-act="swap-cancel" data-id="${r.id}">İptal</button>` : ''}</div></div>`;
  };
  setHTML(box, html`${live.length ? html`<div class="card swap-card"><div class="card-head"><h3>${icon('history', 'sm')} Nöbet değişim istekleri</h3></div><div class="list">${live.map((r) => row(r, false))}</div></div>` : ''}
    ${todo.length ? html`<div class="card swap-card"><div class="card-head"><h3>${icon('table', 'sm')} Excel’e işlenecek değişimler (${todo.length})</h3><span class="tiny faint">Excel güncellenince kendiliğinden kapanır</span></div><div class="list">${todo.map((r) => row(r, true))}</div></div>` : ''}`);
}
ACT['swap-ans'] = (el) => busy(el, async () => {
  try { await api('swap.respond', { id: +el.dataset.id, accept: el.dataset.a === '1' }); toast(el.dataset.a === '1' ? 'Kabul edildi; sorumluya iletildi' : 'Reddedildi'); mountSwapBox(); } catch (e) { toast(e.message, 'err'); }
});
ACT['swap-cancel'] = async (el) => {
  if (!(await confirmDialog({ title: 'İstek iptal edilsin mi?', text: 'Karşı tarafa bildirim gider.', ok: 'İptal et', danger: true }))) return;
  try { await api('swap.cancel', { id: +el.dataset.id }); toast('İptal edildi'); mountSwapBox(); } catch (e) { toast(e.message, 'err'); }
};

ACT['swap-open'] = async (el) => {
  const date = el.dataset.d;
  const m = openModal({ title: 'Nöbetini değiş veya devret', size: 'wide', body: html`<div style="display:grid;place-items:center;padding:30px"><div class="spinner"></div></div>` });
  let o;
  try { o = await api('swap.options', { date }); } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  const st = { tab: o.swap.length || !o.give.length ? 'swap' : 'give', same: true, pick: null, why: false };
  const mineEntry = { code: o.mine.code, kind: 'shift', hours: o.mine.hours, start: o.mine.start, end: o.mine.end, label: o.mine.label };
  const draw = () => {
    if (st.pick) return drawPick();
    const swaps = o.swap.map((p) => ({ ...p, options: p.options.filter((x) => !st.same || x.hours === o.mine.hours) })).filter((p) => p.options.length);
    const n = { swap: swaps.reduce((a, p) => a + p.options.length, 0), give: o.give.length };
    m.setBody(html`<div class="stack">
      <div class="sw-mine">${codeChip(mineEntry, true)}<div><b>${dateLabel(o.mine.date)}</b><div class="tiny faint">${shiftDesc(mineEntry)} · ${o.mine.roster}</div></div></div>
      <div class="seg seg-block"><button type="button" class="${st.tab === 'swap' ? 'on' : ''}" data-t="swap">Değiş (${n.swap})</button><button type="button" class="${st.tab === 'give' ? 'on' : ''}" data-t="give">Devret (${n.give})</button></div>
      ${st.tab === 'swap' ? html`
        <label class="small"><input type="checkbox" id="swSame" ${st.same ? raw('checked') : ''}> Yalnızca aynı süredeki nöbetler (${o.mine.hours || '?'} saat)</label>
        ${swaps.length ? html`<div class="card"><div class="list">${swaps.map((p, pi) => html`<div class="list-row sw-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.name}${p.user_id ? '' : html` <span class="badge">hesabı yok</span>`}</div><div class="lr-s">${p.title || ''}</div></div>
            <div class="sw-opts">${p.options.map((x, xi) => html`<button type="button" class="sw-opt" data-p="${o.swap.indexOf(o.swap.find((q) => q.name === p.name))}" data-x="${p.options[xi].date}">${shortDate(x.date)} ${codeChip({ code: x.code, kind: 'shift', hours: x.hours })}</button>`)}</div></div>`)}</div></div>`
          : html`<div class="card empty"><p class="small">Kurallara uyan değişim seçeneği yok${st.same ? '; “aynı süre” işaretini kaldırmayı deneyin' : ''}.</p></div>`}
        <p class="tiny faint">Seçtiğin gün onun nöbeti olur, bu gün senin nöbetin ona geçer.</p>`
      : html`
        ${o.give_error ? html`<div class="banner danger">${icon('alert')}<span>Devredemezsin: ${o.give_error}</span></div>` : ''}
        ${o.give.length ? html`<div class="card"><div class="list">${o.give.map((p, i) => html`<button type="button" class="list-row sw-give" data-g="${i}"><div class="grow" style="min-width:0;text-align:left"><div class="lr-t">${p.name}${p.user_id ? '' : html` <span class="badge">hesabı yok</span>`}</div><div class="lr-s">${p.title || ''} · o gün boş</div></div>${icon('chevR', 'sm')}</button>`)}</div></div>`
          : !o.give_error ? html`<div class="card empty"><p class="small">Bu nöbeti kurallara uyarak alabilecek kimse yok.</p></div>` : ''}`}
      ${o.blocked.length ? html`<button type="button" class="btn sm ghost" data-why="1">${icon('info', 'sm')}${st.why ? 'Gizle' : `Neden bazı kişiler listede yok? (${o.blocked.length})`}</button>
        ${st.why ? html`<div class="card"><div class="list">${o.blocked.map((b) => html`<div class="list-row"><div class="grow"><div class="lr-t small">${b.name}</div><div class="lr-s" style="white-space:normal">${b.reason}</div></div></div>`)}</div></div>` : ''}` : ''}
      <p class="tiny faint">Kurallar: üst üste en fazla ${o.rules.max_cont} saat (24 saat çıkışına nöbet eklenemez) · nöbetler arası en fazla ${o.rules.max_gap} boş gün · izinli günler boşluk sayılmaz.</p></div>`);
    m.setFoot('');
  };
  const drawPick = () => {
    const p = st.pick;
    const x = p.x;
    const txt = x ? `${p.name} ile değiş: sen ${shortDate(x.date)} (${x.code}) nöbetini tutarsın, ${p.name.split(' ')[0]} ${shortDate(o.mine.date)} (${o.mine.code}) nöbetini tutar.`
      : `${shortDate(o.mine.date)} (${o.mine.code}) nöbetini ${p.name}’e devret.`;
    const wa = `Merhaba ${p.name.split(' ')[0]}, ${x ? `${shortDate(o.mine.date)} (${o.mine.code}) nöbetimi senin ${shortDate(x.date)} (${x.code}) nöbetinle değişebilir miyiz?` : `${shortDate(o.mine.date)} (${o.mine.code}) nöbetimi alabilir misin?`}`;
    m.setBody(html`<div class="stack"><div class="sw-sum">${txt}</div>
      ${p.user_id ? html`<div class="field"><label>Not <span class="faint">(isteğe bağlı)</span></label><input class="input" id="swNote" maxlength="300" placeholder="Örn. ailevi bir durum var"></div>
        <p class="tiny faint">${p.name.split(' ')[0]} kabul ederse sorumluya iletilir. Sorumlu Excel’de güncelleyince takvimlerinize kendiliğinden işlenir.</p>`
        : html`<p class="small muted">${p.name} uygulamada kayıtlı değil. İsteği WhatsApp ile iletebilir, anlaşınca sorumluya bildirebilirsiniz.</p>
          ${p.phone ? html`<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${waNumber(p.phone)}?text=${encodeURIComponent(wa)}">${icon('chat', 'sm')}WhatsApp ile sor</a>` : html`<button type="button" class="btn" data-copy="1">${icon('copy', 'sm')}Mesajı kopyala</button>`}`}</div>`);
    m.setFoot(html`<button class="btn" data-back="1">Geri</button>${p.user_id ? html`<button class="btn primary" data-send="1">İstek gönder</button>` : ''}`);
    st.wa = wa;
  };
  m.el.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-t],[data-why],.sw-opt,.sw-give,[data-back],[data-send],[data-copy]');
    if (!t) return;
    if (t.dataset.t) { st.tab = t.dataset.t; draw(); }
    else if (t.dataset.why) { st.why = !st.why; draw(); }
    else if (t.classList.contains('sw-opt')) { const p = o.swap[+t.dataset.p]; st.pick = { ...p, x: p.options.find((x) => x.date === t.dataset.x) }; draw(); }
    else if (t.classList.contains('sw-give')) { st.pick = { ...o.give[+t.dataset.g], x: null }; draw(); }
    else if (t.dataset.back) { st.pick = null; draw(); }
    else if (t.dataset.copy) { try { await navigator.clipboard.writeText(st.wa); toast('Mesaj kopyalandı'); } catch (er) { toast(st.wa); } }
    else if (t.dataset.send) {
      await busy(t, async () => {
        try {
          await api('swap.request', { date: o.mine.date, to_name: st.pick.name, to_date: st.pick.x ? st.pick.x.date : '', note: ($('#swNote', m.el) || {}).value || '' });
          m.close(); toast('İstek gönderildi'); mountSwapBox();
        } catch (er) { toast(er.message, 'err'); }
      });
    }
  });
  m.el.addEventListener('change', (e) => { if (e.target.id === 'swSame') { st.same = e.target.checked; draw(); } });
  draw();
};
