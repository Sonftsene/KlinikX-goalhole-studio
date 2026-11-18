/* dupcii — hastane ortak belgeleri (4.2): aynı hastanenin tüm birimlerinde görünen protokol, talimat, form ve duyurular.
   Belgeyi yalnız yayımlayan birim düzenler/siler. Okuma raporunda her birim yalnız kendi personelinin adını görür. */
'use strict';

const HD = { items: null, kinds: {}, hospital: '', kind: '', q: '' };
NM_EXT.routes.hastane = (view, r) => (r[1] && /^\d+$/.test(r[1]) ? hdDetail(view, +r[1]) : hdList(view));
NM_EXT.nav.push({ sec: 'genel', mod: 'hbelge', href: '#/hastane', icon: 'building', label: 'Hastane belgeleri', match: (r) => r[0] === 'hastane', count: () => (S.hosp && S.hosp.unread) || 0, visible: () => !!S.hosp });
NM_EXT.notif.hdoc = ['sky', 'building'];
Object.assign(NM_EXT.audit, { 'hdoc.create': 'Hastane belgesi yayımladı', 'hdoc.save': 'Hastane belgesini düzenledi', 'hdoc.delete': 'Hastane belgesini sildi', 'phonebook.share': 'Numaraları hastane rehberine taşıdı' });
NM_EXT.homeCards.push({
  id: 'hbelge', title: 'Yeni hastane belgeleri', icon: 'building', order: 25, place: 'side', mod: 'hbelge',
  visible: () => !!(S.hosp && S.hosp.unread),
  render: async (el) => {
    const r = await api('hdoc.list');
    const list = r.items.filter((d) => !d.read).slice(0, 4);
    if (!list.length) { el.remove(); return; }
    setHTML(el, html`<div class="card"><div class="card-head"><h3>${icon('building', 'sm')} Hastane belgeleri</h3><a class="small" href="#/hastane">Tümü</a></div>
      <div class="list">${list.map((d) => html`<a class="list-row" href="#/hastane/${d.id}"><span class="badge tone-sky">${d.kind_label}</span><div class="grow" style="min-width:0"><div class="lr-t ellipsis">${d.title}</div><div class="lr-s">${d.unit} · ${fmtRel(d.updated_at)}</div></div>${d.ack && !d.acked ? html`<span class="badge warn">Onay</span>` : ''}</a>`)}</div></div>`);
  },
});

async function hdList(view) {
  const can = canManage('hbelge');
  setHTML(view, html`<div class="page-head"><div><h1>Hastane belgeleri</h1><p id="hdSub">Hastanedeki tüm birimlerin ortak protokol, talimat ve formları</p></div>
      ${can ? html`<button class="btn primary" data-act="hd-new">${icon('plus', 'sm')}<span>Belge ekle</span></button>` : ''}</div>
    <div class="row wrap hd-filters" style="gap:8px;margin-bottom:12px"><div class="seg" id="hdKinds"></div>
      <div class="search grow" style="min-width:180px">${icon('search')}<input class="input" type="search" placeholder="Belgelerde ara" data-input="hd-q" value="${HD.q}" aria-label="Belgelerde ara"></div></div>
    <div id="hdBody"><div class="card card-pad"><div class="skel" style="height:16px;margin:8px 0"></div><div class="skel" style="height:16px;width:60%"></div></div></div>`);
  try { const r = await api('hdoc.list'); HD.items = r.items; HD.kinds = r.kinds; HD.hospital = r.hospital; } catch (e) { setHTML($('#hdBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (S.hosp) { S.hosp.unread = HD.items.filter((d) => !d.read).length; renderNav(); }
  const sub = $('#hdSub'); if (sub && HD.hospital) sub.textContent = `${HD.hospital} · tüm birimlerin ortak protokol, talimat ve formları`;
  setHTML($('#hdKinds'), html`<button class="${!HD.kind ? 'on' : ''}" data-act="hd-kind" data-k="">Tümü</button>${Object.entries(HD.kinds).map(([k, l]) => html`<button class="${HD.kind === k ? 'on' : ''}" data-act="hd-kind" data-k="${k}">${l}</button>`)}`);
  hdDraw();
}
function hdDraw() {
  const box = $('#hdBody');
  if (!box || !HD.items) return;
  const q = avKey(HD.q);
  const list = HD.items.filter((d) => (!HD.kind || d.kind === HD.kind) && (!q || avKey([d.title, d.unit, d.kind_label].join(' ')).includes(q)));
  if (!list.length) {
    setHTML(box, html`<div class="card empty"><div class="e-ico">${icon('building', 'lg')}</div><h3>${HD.items.length ? 'Sonuç yok' : 'Henüz hastane belgesi yok'}</h3>
      <p class="small">${HD.items.length ? 'Arama veya filtreyi değiştirin.' : 'Hastane geneli bir protokol veya form yayımlandığında burada ve tüm birimlerde görünür.'}</p></div>`);
    return;
  }
  setHTML(box, html`<div class="card"><div class="list">${list.map((d) => html`<a class="list-row hd-item ${d.read ? '' : 'unread'}" href="#/hastane/${d.id}">
      <span class="badge tone-sky">${d.kind_label}</span>
      <div class="grow" style="min-width:0"><div class="lr-t">${d.read ? '' : html`<span class="dot" aria-label="okunmadı"></span>`}${d.title}</div>
        <div class="lr-s">${d.unit}${d.own ? ' (biriminiz)' : ''} · ${fmtRel(d.updated_at)}${d.files ? ` · ${d.files} ek` : ''}</div></div>
      ${d.ack ? (d.acked ? html`<span class="badge success">${icon('check', 'sm')}Onaylandı</span>` : html`<span class="badge warn">Onay bekliyor</span>`) : ''}${icon('chevR', 'sm')}</a>`)}</div></div>`);
}
ACT['hd-kind'] = (el) => { HD.kind = el.dataset.k; $$('[data-act=hd-kind]').forEach((b) => b.classList.toggle('on', b === el)); hdDraw(); };
CHANGE['hd-q'] = debounce((el) => { HD.q = el.value; hdDraw(); }, 120);

async function hdDetail(view, id) {
  setHTML(view, html`<div class="page-head"><div><a class="small" href="#/hastane">${icon('chevL', 'sm')} Hastane belgeleri</a><h1 id="hdTitle">Belge</h1></div><div id="hdActs" class="row" style="gap:6px"></div></div><div id="hdBody">${''}</div>`);
  let d;
  try { d = (await api('hdoc.get', { id })).doc; } catch (e) { setHTML($('#hdBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  if (HD.items) { const x = HD.items.find((y) => y.id === id); if (x) x.read = true; }
  if (S.hosp && S.hosp.unread) { S.hosp.unread = Math.max(0, S.hosp.unread - 1); renderNav(); }
  HD.cur = d;
  $('#hdTitle').textContent = d.title;
  const can = d.own && canManage('hbelge');
  setHTML($('#hdActs'), can ? html`<button class="btn sm" data-act="hd-report">${icon('chart', 'sm')}<span>Okuma raporu</span></button><button class="btn sm" data-act="hd-edit">${icon('edit', 'sm')}<span>Düzenle</span></button><button class="btn sm icon ghost danger" data-act="hd-remove" aria-label="Belgeyi kaldır">${icon('trash', 'sm')}</button>` : '');
  setHTML($('#hdBody'), html`<div class="stack">
    <div class="card card-pad stack">
      <div class="row wrap" style="gap:6px"><span class="badge tone-sky">${d.kind_label}</span><span class="small muted">${d.unit}${d.own ? ' (biriminiz)' : ''} · ${d.author} · ${fmtDate(d.updated_at)}</span>${d.review_at ? html`<span class="badge">Gözden geçirme: ${fmtDate(d.review_at)}</span>` : ''}</div>
      ${d.body ? html`<div class="hd-body">${d.body}</div>` : ''}
      ${d.attachments.length ? html`<div class="list hd-files">${d.attachments.map((a, i) => html`<div class="list-row">${icon('file', 'sm')}<div class="grow" style="min-width:0"><div class="lr-t ellipsis">${a.name}</div><div class="lr-s">${fmtSize(a.size)}</div></div>
        <button class="btn sm" data-act="hd-view" data-i="${i}">Aç</button><a class="btn sm icon ghost" href="${a.url}&dl=1" aria-label="İndir">${icon('download', 'sm')}</a></div>`)}</div>` : ''}
    </div>
    ${d.ack ? (d.acked ? html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span>Okuduğunuzu onayladınız.</span></div>`
      : html`<div class="mk-box warn">${icon('alert', 'sm')}<span class="grow">Bu belge için okuduğunuzu onaylamanız isteniyor.</span><button class="btn sm primary" data-act="hd-ack">${icon('check', 'sm')}Okudum, anladım</button></div>`) : ''}
  </div>`);
}
function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
ACT['hd-view'] = (el) => {
  const a = HD.cur.attachments[+el.dataset.i];
  const m = openModal({ title: a.name, size: 'wide', body: html`<div class="hd-prev" style="height:min(75vh,760px);display:flex;flex-direction:column"></div>` });
  mountPreview($('.hd-prev', m.el), a);
};
ACT['hd-ack'] = (el) => busy(el, async () => { try { await api('hdoc.ack', { id: HD.cur.id }); toast('Onaylandı'); route(); } catch (e) { toast(e.message, 'err'); } });
ACT['hd-remove'] = async () => {
  if (!(await confirmDialog({ title: 'Belge kaldırılsın mı?', text: 'Belge ve ekleri tüm birimlerden kaldırılır; işlem günlüğünde kalır.', ok: 'Kaldır', danger: true }))) return;
  try { await api('hdoc.delete', { id: HD.cur.id }); HD.items = null; toast('Belge kaldırıldı'); location.hash = '#/hastane'; } catch (e) { toast(e.message, 'err'); }
};
ACT['hd-report'] = async () => {
  let r;
  try { r = await api('hdoc.report', { id: HD.cur.id }); } catch (e) { toast(e.message, 'err'); return; }
  const read = r.people.filter((p) => p.read_at).length;
  const acked = r.people.filter((p) => p.ack_at).length;
  openModal({ title: 'Okuma raporu', size: 'wide', body: html`<div class="stack">
    <div class="small"><b>Biriminiz:</b> ${r.people.length} kişiden ${read} okudu${r.ack ? `, ${acked} onayladı` : ''}.</div>
    <div class="card"><div class="list">${r.people.map((p) => html`<div class="list-row"><div class="grow"><div class="lr-t">${p.name}</div></div>
      ${p.ack_at ? html`<span class="badge success">Onayladı</span>` : p.read_at ? html`<span class="badge info">Okudu</span>` : html`<span class="badge">Okumadı</span>`}</div>`)}</div></div>
    ${r.units.length ? html`<div class="sec-title">Diğer birimler</div><div class="card"><div class="list">${r.units.map((u) => html`<div class="list-row"><div class="grow">${u.unit}</div><span class="small">${u.read} okudu${r.ack ? ` · ${u.acked} onayladı` : ''}</span></div>`)}</div></div>` : ''}
    <p class="tiny faint">${icon('lock', 'sm')} Diğer birimlerin personel adları gösterilmez; yalnız sayılar.</p></div>` });
};
ACT['hd-new'] = () => hdEditor(null);
ACT['hd-edit'] = () => hdEditor(HD.cur);
function hdEditor(d) {
  const kinds = Object.keys(HD.kinds).length ? HD.kinds : { protokol: 'Protokol', talimat: 'Talimat', form: 'Form', duyuru: 'Duyuru', diger: 'Diğer' };
  const m = openModal({ title: d ? 'Belgeyi düzenle' : 'Hastane belgesi ekle', size: 'wide', body: html`<form class="stack" id="hdF">
      <p class="small muted">${icon('building', 'sm')} Hastanedeki <b>tüm birimler</b> görür; yalnız sizin biriminiz düzenler. Hasta bilgisi eklemeyin.</p>
      <div class="grid2"><div class="field"><label>Başlık</label><input class="input" name="title" required minlength="3" maxlength="200" value="${d ? d.title : ''}"></div>
        <div class="field"><label>Tür</label><select class="select" name="kind">${Object.entries(kinds).map(([k, l]) => html`<option value="${k}" ${d && d.kind === k ? raw('selected') : ''}>${l}</option>`)}</select></div></div>
      <div class="field"><label>Açıklama / metin <span class="faint">(isteğe bağlı)</span></label><textarea class="textarea" name="body" maxlength="60000" style="min-height:140px">${d ? d.body : ''}</textarea></div>
      <div class="grid2"><label class="switch"><input type="checkbox" name="ack" ${d && d.ack ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Okudum onayı iste</b><span>Herkesten “Okudum, anladım” istenir.</span></span></label>
        <div class="field"><label>Gözden geçirme tarihi <span class="faint">(isteğe bağlı)</span></label><input class="input" type="date" name="review_at" value="${d && d.review_at ? d.review_at : ''}"></div></div>
      ${d && d.ack ? html`<label class="small"><input type="checkbox" name="reset_reads"> Belge önemli ölçüde değişti: herkesten yeniden onay iste</label>` : ''}
      ${d && d.attachments.length ? html`<div class="field"><label>Mevcut ekler</label><div class="stack" style="gap:4px">${d.attachments.map((a) => html`<label class="small"><input type="checkbox" class="hd-rm" value="${a.id}"> Kaldır: ${a.name}</label>`)}</div></div>` : ''}
      <div class="field"><label>Ekler (PDF, Word, Excel, resim…)</label><input type="file" multiple id="hdFiles"><div id="hdProg" class="tiny faint"></div></div>
      <div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="hdF">${d ? 'Kaydet' : 'Yayımla'}</button>` });
  const f = $('#hdF', m.el);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async (v) => {
      const files = [...($('#hdFiles', m.el).files || [])];
      const ids = [];
      for (let i = 0; i < files.length; i++) {
        const prog = $('#hdProg', m.el);
        const a = await uploadFile(files[i], (p) => { if (prog) prog.textContent = `${files[i].name}: %${Math.round(p * 100)} (${i + 1}/${files.length})`; });
        ids.push(a.id);
      }
      const r = await api('hdoc.save', { id: d ? d.id : null, title: v.title.trim(), kind: v.kind, body: v.body, ack: !!v.ack, review_at: v.review_at || '', reset_reads: !!v.reset_reads,
        att_ids: ids, remove_files: $$('.hd-rm', m.el).filter((x) => x.checked).map((x) => +x.value) });
      m.close();
      HD.items = null;
      toast(d ? 'Belge güncellendi' : 'Belge yayımlandı; tüm birimler görecek');
      if (location.hash === '#/hastane/' + r.doc.id) route(); else location.hash = '#/hastane/' + r.doc.id;
    });
  });
}
