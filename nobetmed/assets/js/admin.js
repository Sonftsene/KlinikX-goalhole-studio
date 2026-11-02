/* NöbetMed — yönetim paneli ve profil */
'use strict';

const AD = { tab: 'onaylar', users: null, userFilter: 'all', userQ: '' };

function renderAdmin(view, tab) {
  if (!isAdmin() && tab !== 'onaylar' && tab !== 'raporlar') { location.hash = '#/yonetim/onaylar'; return; }
  AD.tab = tab;
  if (tab === 'kullanicilar') AD.users = null;
  const c = S.counts;
  const tabs = [['onaylar', 'Onay bekleyenler', c.pending_posts]];
  if (isAdmin()) tabs.push(['kullanicilar', 'Kullanıcılar', c.pending_users], ['yapi', 'Bölüm ve birimler', 0]);
  tabs.push(['raporlar', 'Okuma raporu', 0]);
  if (isAdmin()) tabs.push(['gunluk', 'İşlem günlüğü', 0], ['ayarlar', 'Ayarlar', 0]);
  setHTML(view, html`
    <div class="page-head"><div><h1>Yönetim</h1><p>${isAdmin() ? 'İçerik onayları, kullanıcılar ve portal ayarları' : 'Ekibinizin gönderdiği içerikleri onaylayın'}</p></div></div>
    <div class="tabs">${tabs.map(([k, l, n]) => html`<button class="${tab === k ? 'on' : ''}" data-act="go" data-href="#/yonetim/${k}">${l}${n ? html`<span class="count warn">${n}</span>` : ''}</button>`)}</div>
    <div id="adminBody"></div>`);
  drawAdminTab();
}
function onAdminChanged() {
  if (currentRoute()[0] !== 'yonetim' || !$('#adminBody')) return;
  if (AD.tab === 'kullanicilar') AD.users = null;
  renderAdmin($('#view'), AD.tab);
}

function drawAdminTab() {
  const body = $('#adminBody');
  if (!body) return;
  if (AD.tab === 'onaylar') {
    setHTML(body, html`<section id="feedHost"></section>`);
    mountFeed($('#feedHost'), { filter: 'pending', fixed: true });
    return;
  }
  if (AD.tab === 'kullanicilar') return drawUsers(body);
  if (AD.tab === 'yapi') return drawStructure(body);
  if (AD.tab === 'ayarlar') return drawSettings(body);
  if (AD.tab === 'raporlar') return drawReports(body);
  if (AD.tab === 'gunluk') return drawAudit(body);
}

/* ---------------- Kullanıcılar ---------------- */
async function drawUsers(body) {
  if (!AD.users) {
    setHTML(body, html`<div class="card card-pad">${[1, 2, 3, 4].map(() => html`<div class="skel" style="height:16px;margin:12px 0"></div>`)}</div>`);
    try { AD.users = (await api('admin.users')).users; } catch (e) { toast(e.message, 'err'); return; }
  }
  const users = AD.users;
  const q = trLower(AD.userQ);
  const n = { all: users.length, pending: users.filter((u) => u.status === 'pending').length, active: users.filter((u) => u.status === 'active').length, disabled: users.filter((u) => u.status === 'disabled').length };
  const list = users.filter((u) => (AD.userFilter === 'all' || u.status === AD.userFilter) && (!q || trLower(u.name + ' ' + u.email).includes(q)));
  setHTML(body, html`
    <div class="toolbar">
      <div class="seg">${[['all', 'Tümü'], ['pending', 'Onay bekleyen'], ['active', 'Aktif'], ['disabled', 'Pasif']].map(([k, l]) => html`<button class="${AD.userFilter === k ? 'on' : ''}" data-act="u-filter" data-f="${k}">${l}<span class="count ${k === 'pending' && n[k] ? 'warn' : 'muted'}">${n[k]}</span></button>`)}</div>
      <div class="row wrap">
        <div class="search" style="width:220px;max-width:100%">${icon('search')}<input class="input" placeholder="Kullanıcı ara" value="${AD.userQ}" data-input="u-search" style="height:36px"></div>
        <button class="btn" data-act="inv-roster" title="Nöbet listesinde adı geçip hesabı olmayanlara davet">${icon('table', 'sm')}Listeden davet et</button>
        <button class="btn" data-act="inv-qr" title="Servise asılacak QR kod">${icon('qr', 'sm')}QR ile kayıt</button>
        <button class="btn primary" data-act="u-new">${icon('plus', 'sm')}Kullanıcı ekle</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table class="t">
      <thead><tr><th>Kişi</th><th>Ünvan / Birim</th><th>Yetki</th><th>Durum</th><th>Son giriş</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((u) => html`<tr class="${u.status === 'disabled' ? 'dim' : ''}">
        <td><div class="row">${avatar(u.name)}<div><div><b>${u.name}</b>${u.id === S.me.id ? html` <span class="tiny faint">(siz)</span>` : ''}</div><div class="tiny faint">${u.email}</div></div></div></td>
        <td><div class="small">${titleName(u.title_id) || html`<span class="faint">—</span>`}</div><div class="tiny faint">${unitName(u.unit_id)}</div></td>
        <td><span class="badge ${u.role === 'admin' ? 'brand' : u.role === 'editor' ? 'info' : ''}">${ROLE_LABEL[u.role]}</span></td>
        <td>${u.status === 'pending' ? html`<span class="badge warn">Onay bekliyor</span>` : u.status === 'active' ? html`<span class="badge success">Aktif</span>` : html`<span class="badge">Pasif</span>`}</td>
        <td class="small muted nowrap">${u.last_seen_at ? fmtRel(u.last_seen_at) : 'Hiç'}</td>
        <td style="text-align:right" class="nowrap">
          ${u.status === 'pending' ? html`<button class="btn sm primary" data-act="u-approve" data-id="${u.id}">${icon('check', 'sm')}Onayla</button>` : ''}
          <button class="btn sm icon ghost" data-act="u-menu" data-id="${u.id}" aria-label="İşlemler">${icon('more')}</button>
        </td>
      </tr>`) : html`<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Kullanıcı bulunamadı</td></tr>`}</tbody>
    </table></div></div>`);
}
ACT['u-filter'] = (el) => { AD.userFilter = el.dataset.f; drawUsers($('#adminBody')); };
CHANGE['u-search'] = debounce((el) => {
  AD.userQ = el.value;
  drawUsers($('#adminBody')).then(() => { const i = $('[data-input="u-search"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
}, 200);

async function saveUser(u, patch) {
  const payload = { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, title_id: u.title_id, unit_id: u.unit_id, ...patch };
  await api('admin.user.save', payload);
}
async function afterUserChange() {
  AD.users = null;
  await refreshPeople();
  await refreshCounts();
  if ($('#adminBody')) renderAdmin($('#view'), 'kullanicilar');
}
async function refreshPeople() {
  try { const r = await api('boot'); S.people = r.people || S.people; } catch (e) { /* */ }
}
ACT['u-approve'] = (el) => busy(el, async () => {
  const u = AD.users.find((x) => x.id === +el.dataset.id);
  try { await saveUser(u, { status: 'active' }); toast(`${u.name} onaylandı`); afterUserChange(); } catch (e) { toast(e.message, 'err'); }
});
ACT['u-menu'] = (el) => {
  const u = AD.users.find((x) => x.id === +el.dataset.id);
  const items = [{ id: 'e', icon: 'edit', label: 'Düzenle', run: () => userModal(u) },
    { id: 'p', icon: 'key', label: 'Geçici şifre oluştur', run: () => resetPw(u) }];
  if (u.id !== S.me.id) {
    items.push(u.status === 'disabled'
      ? { id: 's', icon: 'checkCircle', label: 'Etkinleştir', run: () => setStatus(u, 'active') }
      : { id: 's', icon: 'lock', label: 'Pasifleştir', run: () => setStatus(u, 'disabled') });
    items.push('-', { id: 'd', icon: 'trash', label: 'Sil', danger: true, run: () => deleteUser(u) });
  }
  openMenu(el, items);
};
async function setStatus(u, status) {
  try { await saveUser(u, { status }); toast(status === 'active' ? 'Kullanıcı etkinleştirildi' : 'Kullanıcı pasifleştirildi; artık giriş yapamaz'); afterUserChange(); } catch (e) { toast(e.message, 'err'); }
}
async function deleteUser(u) {
  const ok = await confirmDialog({ title: 'Kullanıcı silinsin mi?', text: `${u.name} kalıcı olarak silinecek. Eklediği içerikler kalır, nöbet çizelgesindeki adı korunur. Geçici olarak engellemek için “Pasifleştir” kullanabilirsiniz.`, ok: 'Sil', danger: true });
  if (!ok) return;
  try { await api('admin.user.delete', { id: u.id }); toast('Kullanıcı silindi'); afterUserChange(); } catch (e) { toast(e.message, 'err'); }
}
function showPassword(name, pw) {
  openModal({
    title: 'Geçici şifre', size: 'narrow',
    body: html`<div class="stack"><p class="muted small"><b>${name}</b> için oluşturulan geçici şifre aşağıda. Kişiye iletin; giriş yaptıktan sonra Hesabım sayfasından değiştirebilir.</p>
      <div class="row"><input class="input" readonly value="${pw}" style="font-family:ui-monospace,monospace;font-size:16px;letter-spacing:.04em"><button class="btn icon" data-act="copy-pw" data-v="${pw}" aria-label="Kopyala">${icon('copy')}</button></div>
      <p class="tiny faint">Bu şifre bir daha gösterilmeyecek.</p></div>`,
    foot: html`<button class="btn primary" data-act="close-modal">Tamam</button>`,
  });
}
ACT['copy-pw'] = async (el) => toast((await copyText(el.dataset.v)) ? 'Şifre kopyalandı' : 'Kopyalanamadı');
async function resetPw(u) {
  const ok = await confirmDialog({ title: 'Geçici şifre oluşturulsun mu?', text: `${u.name} kullanıcısının mevcut şifresi geçersiz olacak ve yeni bir geçici şifre oluşturulacak. Kişi ilk girişte kendi şifresini belirleyecek.${S.settings.mail_ready ? ` Geçici şifre ${u.email} adresine de e-postayla gönderilecek.` : ''}`, ok: 'Oluştur' });
  if (!ok) return;
  try {
    const r = await api('admin.user.resetpw', { id: u.id, send_email: !!S.settings.mail_ready });
    showPassword(u.name, r.password);
    if (r.mailed) toast('Geçici şifre e-postayla da gönderiliyor');
  } catch (e) { toast(e.message, 'err'); }
}
ACT['u-new'] = () => userModal(null);
function userModal(u) {
  const m = openModal({
    title: u ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı',
    body: html`<form class="stack" id="userForm" data-form="user">
      <div class="field"><label>Ad soyad</label><input class="input" name="name" required minlength="3" value="${u ? u.name : ''}"></div>
      <div class="field"><label>E-posta</label><input class="input" type="email" name="email" required value="${u ? u.email : ''}"></div>
      <div class="grid2">
        <div class="field"><label>Ünvan</label><select class="select" name="title_id">${options(S.titles, u ? u.title_id : null, '—')}</select></div>
        <div class="field"><label>Birim</label><select class="select" name="unit_id">${options(S.units, u ? u.unit_id : (S.units[0] || {}).id, '—')}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Cep telefonu <span class="faint">(rehber)</span></label><input class="input" name="phone" type="tel" value="${u ? u.phone || '' : ''}" placeholder="05xx xxx xx xx"></div>
        <div class="field"><label>Dahili</label><input class="input" name="extension" value="${u ? u.extension || '' : ''}"></div>
      </div>
      <div class="field"><label>Yetki</label>
        <div class="stack" style="gap:8px">${['member', 'editor', 'admin'].map((r) => html`<label class="pick" style="border:1px solid var(--border);border-radius:10px"><input type="radio" name="role" value="${r}" ${(u ? u.role : 'member') === r ? raw('checked') : ''}><div><div class="small"><b>${ROLE_LABEL[r]}</b></div><div class="tiny faint">${ROLE_HINT[r]}</div></div></label>`)}</div>
      </div>
      ${u ? html`<div class="field"><label>Durum</label><select class="select" name="status">${[['active', 'Aktif'], ['pending', 'Onay bekliyor'], ['disabled', 'Pasif']].map(([k, l]) => html`<option value="${k}" ${u.status === k ? raw('selected') : ''}>${l}</option>`)}</select></div>`
        : html`<div class="field"><label>Geçici şifre (isteğe bağlı)</label><input class="input" name="password" type="text" minlength="8" placeholder="Boş bırakırsanız otomatik oluşturulur" autocomplete="off"><p class="hint">Kişi ilk girişte kendi şifresini belirler.</p></div>
          ${S.settings.mail_ready ? html`<label class="switch"><input type="checkbox" name="send_email" checked><span class="track"></span><span class="s-text"><b>Giriş bilgilerini e-postayla gönder</b><span>E-posta adresi ve geçici şifre kişiye iletilir.</span></span></label>` : ''}`}
      <div class="form-error hidden" data-err></div>
    </form>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" type="submit" form="userForm">Kaydet</button>`,
  });
  m.el.querySelector('form')._u = u;
  m.el.querySelector('form')._m = m;
}
FORMS.user = (f) => submitForm(f, async (d) => {
  const u = f._u;
  const payload = { ...d, id: u ? u.id : null, title_id: d.title_id ? +d.title_id : null, unit_id: d.unit_id ? +d.unit_id : null, status: u ? d.status : 'active' };
  const r = await api('admin.user.save', payload);
  f._m.close();
  toast(u ? 'Kullanıcı güncellendi' : 'Kullanıcı eklendi');
  if (!u && r.mailed) toast('Giriş bilgileri e-postayla gönderiliyor');
  if (!u && r.password) showPassword(d.name, r.password);
  if (u && u.id === S.me.id) { const b = await api('boot'); S.me = b.me; renderNav(); }
  afterUserChange();
});

/* ---------------- Yapı: bölümler, birimler, ünvanlar, vardiyalar ---------------- */
const TAX = {
  categories: { title: 'Bölümler', desc: 'Ana menüdeki içerik bölümleri', add: 'Bölüm ekle' },
  units: { title: 'Birimler', desc: 'Servisler; içerikleri belirli bir birime hedeflemek için', add: 'Birim ekle' },
  titles: { title: 'Ünvanlar', desc: 'Kayıt ve profillerde görünen ünvanlar', add: 'Ünvan ekle' },
};
const CAT_ICONS = ['megaphone', 'play', 'stethoscope', 'file', 'users', 'book', 'pill', 'shield', 'clipboard', 'heart', 'folder', 'bell'];
const COLORS = ['teal', 'sky', 'indigo', 'violet', 'rose', 'amber', 'emerald', 'slate'];

function drawStructure(body) {
  const card = (kind) => {
    const meta = TAX[kind];
    const list = S[kind];
    return html`<div class="card">
      <div class="card-head"><div><h3>${meta.title}</h3><div class="tiny faint">${meta.desc}</div></div><button class="btn sm" data-act="tax-edit" data-kind="${kind}">${icon('plus', 'sm')}${meta.add}</button></div>
      <div class="list">${list.map((x) => html`<div class="list-row">
        ${kind === 'categories' ? catIcon(x, 'sm') : ''}
        <div class="grow"><div class="lr-t">${x.name}</div></div>
        <button class="btn ghost icon sm" data-act="tax-edit" data-kind="${kind}" data-id="${x.id}" aria-label="Düzenle">${icon('edit', 'sm')}</button>
        <button class="btn ghost icon sm danger" data-act="tax-del" data-kind="${kind}" data-id="${x.id}" aria-label="Sil">${icon('trash', 'sm')}</button>
      </div>`)}</div></div>`;
  };
  setHTML(body, html`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;align-items:start">${card('categories')}${card('units')}${card('titles')}</div>`);
}

function applyLists(r) {
  ['categories', 'units', 'titles'].forEach((k) => { if (r[k]) S[k] = r[k]; });
  renderNav();
  if ($('#adminBody') && AD.tab === 'yapi') drawStructure($('#adminBody'));
}

ACT['tax-edit'] = (el) => {
  const kind = el.dataset.kind;
  const x = el.dataset.id ? byId(S[kind], +el.dataset.id) : null;
  const st = { icon: x ? x.icon : 'folder', color: x ? x.color : 'teal' };
  const swatches = () => html`<div class="row wrap" style="gap:6px">${COLORS.map((c) => html`<button type="button" class="cat-ico sm tone-${c}" data-color="${c}" style="border:2px solid ${st.color === c ? 'currentColor' : 'transparent'}" aria-label="${c}"><span class="legend-dot" style="background:currentColor"></span></button>`)}</div>`;
  const icons = () => html`<div class="row wrap" style="gap:6px">${CAT_ICONS.map((i) => html`<button type="button" class="cat-ico tone-${st.icon === i ? st.color : 'slate'}" data-icon="${i}" style="border:0" aria-label="${i}">${icon(i)}</button>`)}</div>`;
  const m = openModal({
    title: (x ? 'Düzenle: ' : '') + TAX[kind].title.replace(/ler$|lar$/, '').trim(),
    size: 'narrow',
    body: html`<form class="stack" id="taxForm" data-form="tax">
      <div class="field"><label>Ad</label><input class="input" name="name" required minlength="2" value="${x ? x.name : ''}"></div>
      ${kind === 'categories' ? html`<div class="field"><label>Simge</label><div id="iconBox">${icons()}</div></div>` : ''}
      ${kind === 'categories' ? html`<div class="field"><label>Renk</label><div id="colorBox">${swatches()}</div></div>` : ''}
      <div class="form-error hidden" data-err></div>
    </form>`,
    foot: html`<button class="btn" data-act="close-modal">Vazgeç</button><button class="btn primary" type="submit" form="taxForm">Kaydet</button>`,
  });
  const f = m.el.querySelector('form');
  Object.assign(f, { _kind: kind, _x: x, _st: st, _m: m });
  m.el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    const ic = e.target.closest('[data-icon]');
    if (c) st.color = c.dataset.color;
    if (ic) st.icon = ic.dataset.icon;
    if (c || ic) {
      const cb = m.el.querySelector('#colorBox'); if (cb) setHTML(cb, swatches());
      const ib = m.el.querySelector('#iconBox'); if (ib) setHTML(ib, icons());
    }
  });
};
FORMS.tax = (f) => submitForm(f, async (d) => {
  const r = await api('tax.save', { kind: f._kind, id: f._x ? f._x.id : null, ...d, icon: f._st.icon, color: f._st.color });
  f._m.close();
  applyLists(r);
  toast('Kaydedildi');
});
ACT['tax-del'] = async (el) => {
  const kind = el.dataset.kind;
  const x = byId(S[kind], +el.dataset.id);
  const ok = await confirmDialog({ title: `“${x.name}” silinsin mi?`, text: 'Bu işlem geri alınamaz.', ok: 'Sil', danger: true });
  if (!ok) return;
  try { applyLists(await api('tax.delete', { kind, id: x.id })); toast('Silindi'); } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Ayarlar ---------------- */
const SW = (name, on, title, hint) => html`<label class="switch"><input type="checkbox" name="${name}" ${on ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>${title}</b>${hint ? html`<span>${hint}</span>` : ''}</span></label>`;

async function drawSettings(body) {
  setHTML(body, html`<div class="card card-pad"><div class="skel" style="height:16px;margin:10px 0"></div><div class="skel" style="height:16px;width:60%"></div></div>`);
  let A;
  try { A = (await api('settings.get')).admin; } catch (e) { toast(e.message, 'err'); return; }
  const st = S.settings;
  const sec = settingsSecNow();
  setHTML(body, html`<form class="stack" data-form="settings" style="max-width:760px;gap:16px">
    ${settingsTabsHtml(sec)}
    <div class="card card-pad stack" data-sec="genel">
      <h3 style="font-size:15px">Genel</h3>
      <div class="field"><label>Kurum / klinik adı</label><input class="input" name="org_name" value="${st.org_name}" required></div>
    </div>

    <div class="card card-pad stack" data-sec="nobet">
      <div><h3 style="font-size:15px">${icon('megaphone', 'sm')} Otomatik duyuru</h3><p class="small muted">Nöbet listesi yüklenince ekip ana sayfada görsün.</p></div>
      ${SW('auto_post_roster', A.auto_post_roster, 'Nöbet listesi güncellenince duyuru yayınla', 'Duyurular bölümüne “… nöbet listesi güncellendi” başlıklı, listeye bağlantı veren bir duyuru eklenir.')}
      ${SW('auto_post_required', A.auto_post_required, 'Bu duyuruyu zorunlu okuma yap', 'Ekip “Okudum, anladım” ile onaylar; kimin listeye baktığını takip edersiniz.')}
    </div>

    <div class="card card-pad stack" data-sec="bildirim">
      <div class="row between wrap"><div><h3 style="font-size:15px">${icon('send', 'sm')} E-posta bildirimleri</h3><p class="small muted">Bildirimlerin gönderileceği e-posta hesabı.</p></div>
        <span class="badge ${A.mail_ready ? 'success' : ''}">${A.mail_ready ? 'Etkin' : 'Kapalı'}</span></div>
      ${SW('mail_on', A.mail_on, 'E-posta bildirimlerini aç', '')}
      <div class="form-note" style="font-size:12.5px">Hostinger’da: hPanel › E-postalar bölümünden <b>bildirim@alanadiniz.com</b> gibi bir adres oluşturun ve bilgilerini aşağıya girin (sunucu <b>smtp.hostinger.com</b>, port <b>465</b>, güvenlik <b>SSL</b>). Sunucu alanını boş bırakırsanız PHP’nin kendi gönderimi kullanılır.</div>
      <div class="grid2">
        <div class="field"><label>Gönderen adı</label><input class="input" name="mail_from_name" value="${A.mail_from_name}" placeholder="${st.org_name}"></div>
        <div class="field"><label>Gönderen e-posta</label><input class="input" type="email" name="mail_from" value="${A.mail_from}" placeholder="bildirim@alanadiniz.com"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>SMTP sunucusu</label><input class="input" name="mail_host" value="${A.mail_host}" placeholder="smtp.hostinger.com"></div>
        <div class="grid2" style="gap:8px">
          <div class="field"><label>Port</label><input class="input" type="number" name="mail_port" value="${A.mail_port}"></div>
          <div class="field"><label>Güvenlik</label><select class="select" name="mail_secure">${[['ssl', 'SSL'], ['tls', 'TLS'], ['none', 'Yok']].map(([k, l]) => html`<option value="${k}" ${A.mail_secure === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
        </div>
      </div>
      <div class="grid2">
        <div class="field"><label>Kullanıcı adı</label><input class="input" name="mail_user" value="${A.mail_user}" placeholder="bildirim@alanadiniz.com" autocomplete="off"></div>
        <div class="field"><label>Şifre</label><input class="input" type="password" name="mail_pass" placeholder="${A.mail_has_pass ? 'Kayıtlı (değiştirmek için yazın)' : ''}" autocomplete="new-password"></div>
      </div>
      <div class="row wrap">
        <button class="btn" type="button" data-act="mail-test" ${A.mail_ready ? '' : raw('disabled')}>${icon('send', 'sm')}Bana test e-postası gönder</button>
        <span class="tiny faint">${A.mail_ready ? `Bugün ${A.queue.sent_today} e-posta gönderildi${A.queue.pending ? ` · ${A.queue.pending} sırada` : ''}${A.queue.failed ? ` · ${A.queue.failed} başarısız` : ''}` : 'Önce ayarları kaydedin.'}</span>
        <button class="btn sm ghost" type="button" data-act="mail-log">${icon('list', 'sm')}Gönderim geçmişi</button>
      </div>
    </div>

    <div class="card card-pad stack" data-sec="bildirim">
      <div><h3 style="font-size:15px">${icon('bell', 'sm')} Hangi durumlarda e-posta gitsin?</h3><p class="small muted">Seçtiğiniz olaylarda ilgili kişilere otomatik e-posta gönderilir. Kişiler Hesabım sayfasından bildirimleri kapatabilir; hatırlatma ve hesap e-postaları her zaman gider.</p></div>
      ${A.events.map((ev) => SW(ev.key, ev.on, ev.label, ''))}
      <p class="tiny faint">Ayrıca zorunlu okumalarda “Okumayanlara e-posta ile hatırlat” düğmesi ve “Şifremi unuttum” e-postası kullanılabilir.</p>
    </div>

    ${settingsExtrasHtml(A)}

    <div class="card card-pad stack" data-sec="guvenlik">
      <div><h3 style="font-size:15px">${icon('lock', 'sm')} Gizlilik</h3><p class="small muted">Giriş yapmayan hiç kimse içerik, nöbet listesi veya dosya göremez.</p></div>
      ${SW('allow_guest', A.allow_guest, 'Misafir bağlantılarına izin ver', 'Açıksa, yetkililer tek bir içeriği üye olmayan birine süreli bağlantıyla gösterebilir. Kapalıysa tüm bağlantılar çalışmaz.')}
    </div>

    <div class="card card-pad stack" data-sec="guvenlik">
      <div><h3 style="font-size:15px">Üye kaydı</h3><p class="small muted">Kimlerin portala katılabileceğini belirleyin.</p></div>
      ${[['approval', 'Onaylı kayıt (önerilen)', 'Herkes kayıt olabilir, yönetici onaylayınca giriş yapar.'], ['open', 'Açık kayıt', 'Kayıt olan herkes hemen giriş yapabilir.'], ['closed', 'Kapalı', 'Yalnızca yöneticinin eklediği kullanıcılar.']].map(([k, l, h]) => html`
        <label class="pick" style="border:1px solid var(--border);border-radius:10px"><input type="radio" name="registration" value="${k}" ${st.registration === k ? raw('checked') : ''}><div><div class="small"><b>${l}</b></div><div class="tiny faint">${h}</div></div></label>`)}
    </div>

    <div class="card card-pad stack" data-sec="genel">
      <div><h3 style="font-size:15px">Duyuru bandı</h3><p class="small muted">Tüm üyelerin ekranının en üstünde görünen kısa uyarı.</p></div>
      ${SW('banner_on', st.banner_on, 'Bandı göster', '')}
      <div class="field"><label>Metin</label><input class="input" name="banner_text" maxlength="300" value="${st.banner_text || ''}" placeholder="Örn: 6 Kasım Cuma 09:30'da kalite denetimi yapılacaktır."></div>
      <div class="field"><label>Renk</label><select class="select" name="banner_tone">${[['danger', 'Kırmızı — acil'], ['info', 'Mavi — bilgi'], ['success', 'Yeşil — olumlu']].map(([k, l]) => html`<option value="${k}" ${st.banner_tone === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
    </div>
    <div class="form-error hidden" data-err></div>
    <div class="settings-save"><button class="btn primary" type="submit">Ayarları kaydet</button></div>
  </form>`);
  applySettingsSec(sec);
  mountBackupBox();
  mountCodesBox();
}
FORMS.settings = (f) => submitForm(f, async (d) => {
  const r = await api('settings.save', d);
  const A = r.admin;
  Object.assign(S.settings, { org_name: d.org_name, registration: d.registration, banner_on: !!d.banner_on, banner_text: d.banner_text, banner_tone: d.banner_tone, allow_guest: A.allow_guest, mail_ready: A.mail_ready, notify_post: A.mail_ready && A.events.some((e) => e.key === 'notify_post' && e.on) });
  S.mail_ready = A.mail_ready;
  S.settings.push_ready = !!(A.push_enabled && A.push_ready);
  S.bannerHidden = false;
  renderBanner();
  renderNav();
  toast('Ayarlar kaydedildi');
  drawSettings($('#adminBody'));
});
ACT['mail-test'] = (el) => busy(el, async () => {
  try { toast((await api('mail.test')).message); } catch (e) { toast(e.message, 'err'); }
});
ACT['mail-log'] = async () => {
  const m = openModal({ title: 'E-posta gönderim geçmişi', size: 'wide', body: html`<div style="display:grid;place-items:center;padding:30px"><div class="spinner"></div></div>` });
  let log;
  try { log = (await api('mail.log')).log; } catch (e) { m.setBody(html`<p class="muted">${e.message}</p>`); return; }
  const lbl = { sent: ['success', 'Gönderildi'], pending: ['warn', 'Sırada'], failed: ['danger', 'Başarısız'] };
  m.setBody(log.length ? html`<div class="card"><div class="list">${log.map((x) => html`<div class="list-row">
      <div class="grow" style="min-width:0"><div class="lr-t ellipsis">${x.subject}</div><div class="lr-s ellipsis">${x.to} · ${fmtDateTime(x.sent_at || x.created_at)}</div>${x.error ? html`<div class="tiny" style="color:var(--danger)">${x.error}</div>` : ''}</div>
      <span class="badge ${lbl[x.status][0]}">${lbl[x.status][1]}</span></div>`)}</div></div>`
    : html`<div class="empty"><p>Henüz e-posta gönderilmedi.</p></div>`);
};

/* ---------------- Profil ---------------- */
function renderProfile(view) {
  const me = S.me;
  setHTML(view, html`
    <div class="page-head"><div><h1>Hesabım</h1><p>Profil bilgileriniz, şifreniz ve gönderdiğiniz içerikler</p></div></div>
    <div class="home-grid">
      <div class="stack" style="gap:16px">
        <div class="card card-pad">
          <div class="row" style="gap:14px">${avatar(me.name, 'lg')}<div class="grow"><h2 style="font-size:18px">${me.name}</h2><div class="small muted">${me.email}</div>
            <div class="row wrap" style="margin-top:8px;gap:6px"><span class="badge ${me.role === 'admin' ? 'brand' : me.role === 'editor' ? 'info' : ''}">${ROLE_LABEL[me.role]}</span>${titleName(me.title_id) ? html`<span class="badge">${titleName(me.title_id)}</span>` : ''}${unitName(me.unit_id) ? html`<span class="badge">${icon('building')}${unitName(me.unit_id)}</span>` : ''}</div></div></div>
        </div>
        <div class="card"><div class="card-head"><h3>Gönderilerim</h3></div><div style="padding:14px" id="feedHost"></div></div>
      </div>
      <div class="side-col" style="position:static">
        <form class="card card-pad stack" data-form="me-name">
          <h3 style="font-size:14.5px">Ad soyad</h3>
          <input class="input" name="name" value="${me.name}" required minlength="3">
          <div class="form-error hidden" data-err></div>
          <button class="btn" type="submit">Güncelle</button>
        </form>
        <form class="card card-pad stack" data-form="me-pw">
          <h3 style="font-size:14.5px">Şifre değiştir</h3>
          ${me.has_password ? html`<div class="field"><label>Mevcut şifre</label>${pwField('current', '', 'current-password')}</div>` : html`<p class="tiny faint">Google ile giriş yapıyorsunuz. İsterseniz e-posta ile giriş için şifre belirleyebilirsiniz.</p>`}
          <div class="field"><label>Yeni şifre</label>${pwField('password', 'En az 8 karakter', 'new-password')}</div>
          <div class="form-error hidden" data-err></div>
          <button class="btn" type="submit">Şifreyi kaydet</button>
        </form>
        ${profileExtrasHtml()}
        <div class="card card-pad stack" style="gap:10px">
          <button class="btn block danger" data-act="logout">${icon('logout', 'sm')}Çıkış yap</button>
          <p class="tiny faint" style="text-align:center">İpucu: Telefonda tarayıcı menüsünden “Ana ekrana ekle” ile uygulama gibi kullanabilirsiniz.</p>
        </div>
      </div>
    </div>`);
  mountFeed($('#feedHost'), { filter: 'mine', fixed: true });
  mountProfileExtras();
}
ACT.logout = () => logout();
CHANGE['me-notify'] = async (el) => {
  try {
    await api('me.update', { email_notify: el.checked });
    S.me.email_notify = el.checked;
    toast(el.checked ? 'E-posta bildirimleri açıldı' : 'E-posta bildirimleri kapatıldı');
  } catch (e) { el.checked = !el.checked; toast(e.message, 'err'); }
};
FORMS['me-name'] = (f) => submitForm(f, async (d) => {
  await api('me.update', d);
  S.me.name = d.name;
  renderNav();
  toast('Adınız güncellendi');
});
FORMS['me-pw'] = (f) => submitForm(f, async (d) => {
  await api('me.password', d);
  S.me.has_password = true;
  f.reset();
  toast('Şifreniz değiştirildi');
});
