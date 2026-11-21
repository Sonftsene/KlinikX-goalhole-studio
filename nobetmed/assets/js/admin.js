/* dupcii — yönetim paneli ve profil */
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
  if (!AD.pres) await usPresLoad();
  usPresStart();
  const users = AD.users;
  const q = trLower(AD.userQ);
  const n = { all: users.length, pending: users.filter((u) => u.status === 'pending').length, active: users.filter((u) => u.status === 'active').length, disabled: users.filter((u) => u.status === 'disabled').length };
  const act = US.act; const role = US.role;
  const list = usSort(users.filter((u) => (AD.userFilter === 'all' || u.status === AD.userFilter) && (!q || trLower(u.name + ' ' + u.email).includes(q))
    && usActOk(u, act) && (!role || (role[0] === 'r' ? u.role_id === +role.slice(1) && u.role !== 'admin' : u.role === role))));
  const online = users.filter((u) => usState(u) !== 'off');
  setHTML(body, html`
    <div class="us-live card card-pad" id="usLive">${usLiveHtml(online)}</div>
    <div class="toolbar">
      <div class="seg">${[['all', 'Tümü'], ['pending', 'Onay bekleyen'], ['active', 'Aktif'], ['disabled', 'Pasif']].map(([k, l]) => html`<button class="${AD.userFilter === k ? 'on' : ''}" data-act="u-filter" data-f="${k}">${l}<span class="count ${k === 'pending' && n[k] ? 'warn' : 'muted'}">${n[k]}</span></button>`)}</div>
      <div class="row wrap">
        <div class="search us-search" style="flex:1 1 200px;min-width:180px;max-width:100%">${icon('search')}<input class="input" placeholder="Kullanıcı ara" value="${AD.userQ}" data-input="u-search" style="height:36px"></div>
        <select class="select us-sel" data-change="us-sort" aria-label="Sırala" title="Sırala">${[['name', 'Ada göre (A–Z)'], ['name_desc', 'Ada göre (Z–A)'], ['online', 'Çevrimiçi olanlar önce'], ['seen', 'Son görülme (yeniden eskiye)'], ['seen_old', 'Son görülme (eskiden yeniye)'], ['new', 'Kayıt tarihi (yeni önce)'], ['role', 'Yetkiye göre']].map(([k, l]) => html`<option value="${k}" ${US.sort === k ? raw('selected') : ''}>${l}</option>`)}</select>
        <select class="select us-sel" data-change="us-act" aria-label="Etkinlik" title="Etkinlik">${[['all', 'Tüm etkinlik'], ['online', `Şu an çevrimiçi (${users.filter((u) => usState(u) !== 'off').length})`], ['today', 'Bugün girenler'], ['week', 'Son 7 günde girenler'], ['idle30', '30 günden uzun girmeyenler'], ['never', 'Hiç girmeyenler']].map(([k, l]) => html`<option value="${k}" ${US.act === k ? raw('selected') : ''}>${l}</option>`)}</select>
        <select class="select us-sel" data-change="us-role" aria-label="Yetki" title="Yetki"><option value="">Tüm yetkiler</option>${[['admin', 'Yönetici'], ['editor', 'Yayıncı'], ['member', 'Üye']].map(([k, l]) => html`<option value="${k}" ${US.role === k ? raw('selected') : ''}>${l}</option>`)}${(S.roles || []).map((ro) => html`<option value="r${ro.id}" ${US.role === 'r' + ro.id ? raw('selected') : ''}>${ro.name}</option>`)}</select>
        <button class="btn" data-act="inv-roster" title="Nöbet listesinde adı geçip hesabı olmayanlara davet">${icon('table', 'sm')}Listeden davet et</button>
        <button class="btn" data-act="inv-qr" title="Servise asılacak QR kod">${icon('qr', 'sm')}QR ile kayıt</button>
        <button class="btn primary" data-act="u-new">${icon('plus', 'sm')}Kullanıcı ekle</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table class="t users-t">
      <thead><tr><th>Kişi</th><th>Ünvan / Birim</th><th>Yetki</th><th>Durum</th><th>Çevrimiçi / son görülme</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((u) => html`<tr class="${u.status === 'disabled' ? 'dim' : ''}" data-uid="${u.id}">
        <td><div class="row"><span class="us-av">${avatar(u.name)}<i class="us-dot ${usState(u)}"></i></span><div><div><b>${u.name}</b>${u.id === S.me.id ? html` <span class="tiny faint">(siz)</span>` : ''}${u.no_duty ? html` <span class="badge" title="Blok yerleşimi, kura, eksik çağrısı ve değişimlere dahil edilmez">Nöbet hesabı dışı</span>` : ''}</div><div class="tiny faint">${u.email}</div></div></div></td>
        <td><div class="small">${titleName(u.title_id) || html`<span class="faint">—</span>`}</div><div class="tiny faint">${unitName(u.unit_id)}</div></td>
        <td><span class="badge ${u.role === 'admin' ? 'brand' : u.role === 'editor' ? 'info' : ''}">${ROLE_LABEL[u.role]}</span>${u.role_id && u.role !== 'admin' && (S.roles || []).some((ro) => ro.id === u.role_id) ? html` <span class="badge tone-violet">${S.roles.find((ro) => ro.id === u.role_id).name}</span>` : ''}</td>
        <td>${u.status === 'pending' ? html`<span class="badge warn">Onay bekliyor</span>` : u.status === 'active' ? html`<span class="badge success">Aktif</span>` : html`<span class="badge">Pasif</span>`}${u.del_req ? html` <span class="badge danger" title="KVKK: en geç 30 gün içinde silinmeli">Silme talebi · ${fmtDate(u.del_req)}</span>` : ''}</td>
        <td class="small us-pres">${usPresCell(u)}</td>
        <td style="text-align:right" class="nowrap">
          ${u.status === 'pending' ? html`<button class="btn sm primary" data-act="u-approve" data-id="${u.id}">${icon('check', 'sm')}Onayla</button>` : ''}
          <button class="btn sm icon ghost" data-act="u-menu" data-id="${u.id}" aria-label="İşlemler">${icon('more')}</button>
        </td>
      </tr>`) : html`<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Kullanıcı bulunamadı</td></tr>`}</tbody>
    </table></div></div>`);
}
ACT['u-filter'] = (el) => { AD.userFilter = el.dataset.f; drawUsers($('#adminBody')); };

/* ---------------- Kullanıcılar: sıralama, süzgeç, çevrimiçi durum (4.27) ----------------
   Durum canlı yoklamadan gelir (inc/mod_cevrimici.php): çevrimiçi (son 90 sn, sayfa açık), arka planda, ya da son görülme.
   Açık sayfa yalnız bölüm adıdır (ör. “Mesajlar”); hangi sohbet / kayıt olduğu gönderilmez. Ayarlar › Güvenlik’ten kapatılabilir. */
const US = (() => { let o = {}; try { o = JSON.parse(localStorage.getItem('nm-us') || '{}'); } catch (e) { /* */ } return { sort: o.sort || 'name', act: o.act || 'all', role: o.role || '', timer: 0 }; })();
function usSave() { try { localStorage.setItem('nm-us', JSON.stringify({ sort: US.sort, act: US.act, role: US.role })); } catch (e) { /* */ } }
async function usPresLoad() { try { const r = await api('presence.list'); AD.pres = r.map || {}; AD.presPages = r.pages; } catch (e) { AD.pres = AD.pres || {}; } }
function usP(u) { return (AD.pres || {})[u.id] || null; }
function usState(u) { const p = usP(u); return p ? p.state : 'off'; }
/** Son görülme: canlı durum ya da son giriş, hangisi yeniyse */
function usSeen(u) { const p = usP(u); const a = p && p.at; const b = u.last_seen_at; return a && (!b || a > b) ? a : b || ''; }
function usPresCell(u) {
  const p = usP(u); const st = usState(u);
  if (st === 'online' || st === 'away') {
    return html`<div class="us-st ${st}"><b>${st === 'online' ? 'Çevrimiçi' : 'Arka planda'}</b>${p.dev ? html` <span class="tiny faint">· ${p.dev}</span>` : ''}</div>${p.label ? html`<div class="tiny us-page">${icon('eye', 'sm')} ${p.label}</div>` : ''}`;
  }
  const s = usSeen(u);
  return html`<span class="muted nowrap">${s ? fmtRel(s) : 'Hiç girmedi'}</span>`;
}
function usActOk(u, act) {
  const s = usSeen(u); const t = s ? parseDT(s).getTime() : 0; const now = Date.now();
  if (act === 'online') return usState(u) !== 'off';
  if (act === 'today') return t && new Date(t).toDateString() === new Date().toDateString();
  if (act === 'week') return t && now - t < 7 * 864e5;
  if (act === 'idle30') return u.status === 'active' && (!t || now - t > 30 * 864e5);
  if (act === 'never') return !s;
  return true;
}
const US_RANK = { online: 0, away: 1, off: 2 };
function usSort(list) {
  const by = US.sort; const cmpName = (a, b) => a.name.localeCompare(b.name, 'tr');
  const seen = (u) => usSeen(u) || '';
  const roleRank = { admin: 0, editor: 1, member: 2 };
  const pend = (a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1);
  return [...list].sort((a, b) => {
    if (by === 'name') return pend(a, b) || cmpName(a, b);
    if (by === 'name_desc') return pend(a, b) || cmpName(b, a);
    if (by === 'online') return US_RANK[usState(a)] - US_RANK[usState(b)] || seen(b).localeCompare(seen(a)) || cmpName(a, b);
    if (by === 'seen') return seen(b).localeCompare(seen(a)) || cmpName(a, b);
    if (by === 'seen_old') return (seen(a) || '0').localeCompare(seen(b) || '0') || cmpName(a, b);
    if (by === 'new') return String(b.created_at || '').localeCompare(String(a.created_at || '')) || cmpName(a, b);
    if (by === 'role') return roleRank[a.role] - roleRank[b.role] || cmpName(a, b);
    return 0;
  });
}
function usLiveHtml(online) {
  const on = online.filter((u) => usState(u) === 'online');
  return html`<div class="row wrap" style="gap:10px;align-items:center"><span class="us-pulse"></span><b>Şu an çevrimiçi: ${online.length}</b>
    <span class="tiny faint">${on.length} açık${online.length - on.length ? ` · ${online.length - on.length} arka planda` : ''} · 10 sn’de bir yenilenir</span></div>
    ${online.length ? html`<div class="us-live-list">${online.sort((a, b) => US_RANK[usState(a)] - US_RANK[usState(b)] || a.name.localeCompare(b.name, 'tr')).map((u) => { const p = usP(u); return html`<span class="us-chip ${usState(u)}"><i class="us-dot ${usState(u)}"></i><b>${u.name}</b>${p && p.label ? html`<span class="tiny us-chip-l">· ${p.label}</span>` : ''}</span>`; })}</div>`
    : html`<div class="tiny faint" style="margin-top:6px">Şu an kimse açık değil.</div>`}
    ${AD.presPages === false ? html`<div class="tiny faint" style="margin-top:6px">Açık sayfa gösterimi kapalı (Ayarlar › Güvenlik).</div>` : ''}`;
}
/** Tabloyu yeniden çizmeden durum hücrelerini tazele (arama kutusundaki yazı / odak bozulmasın) */
function usPresPaint() {
  if (!AD.users || !$('#usLive')) return;
  setHTML($('#usLive'), usLiveHtml(AD.users.filter((u) => usState(u) !== 'off')));
  $$('tr[data-uid]').forEach((tr) => {
    const u = AD.users.find((x) => x.id === +tr.dataset.uid); if (!u) return;
    const c = $('.us-pres', tr); if (c) setHTML(c, usPresCell(u));
    const d = $('.us-dot', tr); if (d) d.className = 'us-dot ' + usState(u);
  });
}
function usPresStart() {
  if (US.timer) return;
  US.timer = setInterval(async () => {
    const onPage = $('#usLive') && currentRoute()[0] === 'yonetim' && currentRoute()[1] === 'kullanicilar';
    if (!onPage) { clearInterval(US.timer); US.timer = 0; return; }
    if (document.visibilityState !== 'visible') return;
    await usPresLoad();
    // Çevrimiçi süzgeci ya da sıralaması açıksa liste değişebilir: tümüyle yeniden çiz (yazı kutusunda değilken)
    if ((US.act === 'online' || US.sort === 'online') && !(document.activeElement && document.activeElement.matches('[data-input="u-search"]'))) drawUsers($('#adminBody'));
    else usPresPaint();
  }, 10000);
}
CHANGE['us-sort'] = (el) => { US.sort = el.value; usSave(); drawUsers($('#adminBody')); };
CHANGE['us-act'] = (el) => { US.act = el.value; usSave(); drawUsers($('#adminBody')); };
CHANGE['us-role'] = (el) => { US.role = el.value; usSave(); drawUsers($('#adminBody')); };
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
  // Bu arada başka sayfaya geçildiyse o sayfanın üzerine Kullanıcılar çizilmesin
  if ($('#adminBody') && currentRoute()[0] === 'yonetim' && (currentRoute()[1] || 'onaylar') === 'kullanicilar') renderAdmin($('#view'), 'kullanicilar');
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
    { id: 'p', icon: 'key', label: 'Geçici şifre oluştur', run: () => resetPw(u) },
    { id: 'n', icon: u.no_duty ? 'checkCircle' : 'eyeOff', label: u.no_duty ? 'Nöbet hesaplarına yeniden dahil et' : 'Nöbet hesaplarına dahil etme', run: () => setNoDuty(u, !u.no_duty) }];
  if (u.avatar) items.push({ id: 'a', icon: 'user', label: 'Profil fotoğrafını kaldır', run: async () => {
    if (!(await confirmDialog({ title: 'Fotoğraf kaldırılsın mı?', text: `${u.name} kullanıcısının profil fotoğrafı kaldırılacak.`, ok: 'Kaldır', danger: true }))) return;
    try { await api('me.avatar', { user_id: u.id, remove: true }); toast('Profil fotoğrafı kaldırıldı'); await refreshPeople(); afterUserChange(); } catch (e) { toast(e.message, 'err'); }
  } });
  if (u.id !== S.me.id) {
    items.push(u.status === 'disabled'
      ? { id: 's', icon: 'checkCircle', label: 'Etkinleştir', run: () => setStatus(u, 'active') }
      : { id: 's', icon: 'lock', label: 'Pasifleştir', run: () => setStatus(u, 'disabled') });
    items.push('-', { id: 'd', icon: 'trash', label: 'Sil', danger: true, run: () => deleteUser(u) });
  }
  openMenu(el, items);
};
/** Ör. yaşlı bakım personeli: blok yerleşimi, kura, eksik çağrısı, değişim ve sayımların hiçbirine girmez */
async function setNoDuty(u, on) {
  if (on && !(await confirmDialog({ title: `${u.name} nöbet hesaplarına dahil edilmesin mi?`, text: 'Blok yerleşimine, kuraya, eksik personel çağrısına, nöbet değişimine ve sayımlara hiç girmez. Kendi takvimini ve listeleri görmeye devam eder.', ok: 'Dahil etme' }))) return;
  try { await api('rules.excluded.save', { user_id: u.id, on }); toast(on ? 'Artık nöbet hesaplarına dahil edilmiyor' : 'Nöbet hesaplarına yeniden dahil edildi'); afterUserChange(); } catch (e) { toast(e.message, 'err'); }
}
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
      ${(S.roles || []).length ? html`<div class="field"><label>Birime özel rol <span class="faint">(isteğe bağlı)</span></label><select class="select" name="role_id"><option value="">Yok — yukarıdaki yetki geçerli</option>${S.roles.map((ro) => html`<option value="${ro.id}" ${u && u.role_id === ro.id ? raw('selected') : ''}>${ro.name}</option>`)}</select>
        <p class="hint">Rol, modül modül neyi göreceğini / yöneteceğini belirler (Ayarlar › Güvenlik › Roller). Yönetici her zaman tam yetkilidir.</p></div>` : ''}
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
  if ('role_id' in d) payload.role_id = d.role_id ? +d.role_id : null;
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
      <p class="tiny faint">Uygulama sürümü: <b>${BOOT.v || '?'}</b></p>
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
      <div><h3 style="font-size:15px">Duyuru bandı</h3><p class="small muted">Ekranın en üstünde görünen kısa uyarı. Metindeki bir kelimeye sayfa ya da web bağlantısı verebilirsiniz.</p></div>
      ${(() => { const bc = st.banner_cfg || {}; return html`
      ${SW('banner_on', bc.on, 'Bandı göster', 'Kapalıyken kimse görmez; aşağıdaki zaman aralığı da uygulanır.')}
      <div class="field"><label>Metin</label><textarea class="textarea" name="banner_text" maxlength="600" rows="2" data-input="bn-prev" placeholder="Örn: 6 Kasım Cuma 09:30'da kalite denetimi var. [Ayrıntılar](#/b/1)">${bc.text || ''}</textarea><div class="lnk-row">${typeof linkTool === 'function' ? linkTool('banner_text') : ''}</div></div>
      <div class="field"><label>Renk</label><div class="bn-tones">${[['danger', 'Kırmızı — acil'], ['amber', 'Turuncu — uyarı'], ['info', 'Mavi — bilgi'], ['success', 'Yeşil — olumlu'], ['violet', 'Mor — duyuru']].map(([k, l]) => html`<label class="bn-tone ${k}"><input type="radio" name="banner_tone" value="${k}" data-change="bn-prev" ${(bc.tone || 'danger') === k ? raw('checked') : ''}><span>${l}</span></label>`)}</div></div>
      <div class="grid2"><div class="field"><label>Düğme yazısı <span class="faint">(isteğe bağlı)</span></label><input class="input" name="banner_btn_text" maxlength="40" value="${bc.btn_text || ''}" data-input="bn-prev" placeholder="Örn: Ayrıntılar"></div>
        <div class="field"><label>Düğme bağlantısı</label><select class="select" id="bnBtnPick" data-change="bn-btn-pick"><option value="">Seçin ya da aşağıya yazın</option>${typeof pageOptions === 'function' ? pageOptions('') : ''}</select>
          <input class="input" name="banner_btn_url" value="${bc.btn_url || ''}" data-input="bn-prev" placeholder="#/sayfa ya da https://…" style="margin-top:6px"></div></div>
      <div class="grid2"><div class="field"><label>Başlangıç <span class="faint">(boşsa hemen)</span></label><input class="input" type="datetime-local" name="banner_from" value="${(bc.from || '').replace(' ', 'T')}"></div>
        <div class="field"><label>Bitiş <span class="faint">(boşsa kapatana kadar)</span></label><input class="input" type="datetime-local" name="banner_until" value="${(bc.until || '').replace(' ', 'T')}"></div></div>
      <div class="grid2"><div class="field"><label>Kimler görsün</label><select class="select" name="banner_aud"><option value="all" ${bc.aud !== 'staff' ? raw('selected') : ''}>Herkes</option><option value="staff" ${bc.aud === 'staff' ? raw('selected') : ''}>Yalnız yöneticiler ve yayıncılar</option></select></div>
        <div class="field"><label>Kapatma</label><select class="select" name="banner_close" data-change="bn-prev">${[['session', 'Kapatılabilir, sayfa yenilenince yine görünür'], ['until', 'Kapatılabilir, duyuru değişene kadar görünmez'], ['none', 'Kapatılamaz (sabit)']].map(([k, l]) => html`<option value="${k}" ${(bc.close || 'session') === k ? raw('selected') : ''}>${l}</option>`)}</select></div></div>
      <div class="field"><label>Önizleme</label><div id="bnPrev" class="bn-prev"></div></div>`; })()}
    </div>
    <div class="form-error hidden" data-err></div>
    <div class="settings-save"><button class="btn primary" type="submit">Ayarları kaydet</button></div>
  </form>`);
  applySettingsSec(sec);
  bnPreview();
  mountBackupBox();
  mountCodesBox();
  if (typeof mountGsync === 'function') mountGsync();
  NM_EXT.settingsCards.forEach((c) => { if (c.mount && (!c.admin || isAdmin())) { try { c.mount(); } catch (e) { /* */ } } });
}
FORMS.settings = (f) => submitForm(f, async (d) => {
  const r = await api('settings.save', d);
  if (typeof saveCodesIfDirty === 'function') await saveCodesIfDirty();
  const A = r.admin;
  Object.assign(S.settings, { org_name: d.org_name, registration: d.registration, banner: r.banner, banner_cfg: r.banner_cfg, allow_guest: A.allow_guest, mail_ready: A.mail_ready, notify_post: A.mail_ready && A.events.some((e) => e.key === 'notify_post' && e.on) });
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

/* ---------------- Profil: extras.js içinde (renderProfile) ---------------- */
ACT.logout = () => logout();
FORMS['me-pw'] = (f) => submitForm(f, async (d) => {
  await api('me.password', d);
  S.me.has_password = true;
  f.reset();
  toast('Şifreniz değiştirildi');
});

/* Duyuru bandı önizlemesi */
function bnPreview() {
  const box = $('#bnPrev'); const f = box && box.closest('form'); if (!box || !f) return;
  const v = (n) => { const el = f.querySelector(`[name="${n}"]`); return el ? el.value : ''; };
  const tone = (f.querySelector('[name=banner_tone]:checked') || {}).value || 'danger';
  const text = v('banner_text').trim();
  setHTML(box, text ? bannerHtml({ text, tone, close: v('banner_close'), btn_text: v('banner_btn_text').trim(), btn_url: v('banner_btn_url').trim() }) : html`<div class="tiny faint">Metin yazınca burada görünür.</div>`);
}
CHANGE['bn-prev'] = () => bnPreview();
CHANGE['bn-btn-pick'] = (el) => { const f = el.closest('form'); const i = f && f.querySelector('[name=banner_btn_url]'); if (i && el.value) { i.value = el.value; bnPreview(); } el.value = ''; };

/* Ayarlar › Güvenlik: çevrimiçi durumda açık sayfanın gösterilmesi (4.27) */
NM_EXT.settingsCards.push({
  sec: 'guvenlik', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="guvenlik"><h3 style="font-size:15px">${icon('eye', 'sm')} Çevrimiçi durum</h3>
    <p class="small muted" style="margin:0">Kullanıcılar sayfasında kimin şu an çevrimiçi olduğunu görürsünüz. Açık sayfa yalnız bölüm adıdır (ör. “Mesajlar”); hangi sohbet ya da kayıt olduğu görünmez, geçmişi tutulmaz.</p>
    <label class="switch"><input type="checkbox" id="prPages" data-change="pr-pages" checked><span class="track"></span><span class="s-text"><b>Kişilerin şu an hangi bölümde olduğunu göster</b><span>Kapalıyken yalnız çevrimiçi / son görülme görünür.</span></span></label></div>`,
  mount: async () => { try { const r = await api('presence.list'); const c = $('#prPages'); if (c) c.checked = !!r.pages; } catch (e) { /* */ } },
});
CHANGE['pr-pages'] = async (el) => {
  try { const r = await api('presence.cfg', { pages: el.checked }); AD.presPages = r.pages; AD.pres = null; toast(r.pages ? 'Açık bölüm gösteriliyor' : 'Açık bölüm gizlendi'); } catch (e) { el.checked = !el.checked; toast(e.message, 'err'); }
};
