/* dupcii — modüller ve yetkiler (4.1): Ayarlar › Güvenlik › Roller ve yetkiler; sistem panelinde modül aç/kapat */
'use strict';

const PERM_LBL = { off: ['Göremez', ''], use: ['Kullanır', 'info'], manage: ['Yönetir', 'brand'] };
const YT = { roles: [], modules: [] };
Object.assign(NM_EXT.audit, { 'role.create': 'Rol ekledi', 'role.save': 'Rolü düzenledi', 'role.delete': 'Rolü kaldırdı', 'role.assign': 'Kişiye rol verdi', 'sa.create': 'Sistem yöneticisi hesabı açtı', 'sa.enter': 'Sistem yöneticisi birime girdi', 'sa.exit': 'Sistem yöneticisi birimden çıktı' });

/* ---------------- Ayarlar › Güvenlik: roller ---------------- */
NM_EXT.settingsCards.push({
  sec: 'guvenlik', admin: true,
  html: () => html`<div class="card card-pad stack" data-sec="guvenlik" id="rolesCard">
    <div class="row wrap" style="gap:8px"><div class="grow"><h3 style="font-size:15px">${icon('shield', 'sm')} Roller ve yetkiler</h3>
      <p class="small muted">Birime özel roller (ör. “Sorumlu hemşire”, “Eğitim hemşiresi”): her modülde kişinin <b>göremeyeceğini</b>, <b>kullanacağını</b> ya da <b>yöneteceğini</b> seçin. Rolü olmayan kişide temel yetki geçerlidir: yayıncı yönetir, üye kullanır. Yönetici her zaman tam yetkilidir. Rolü kişiye Kullanıcılar › Düzenle’den verin.</p></div>
      <button type="button" class="btn sm" data-act="role-new">${icon('plus', 'sm')}<span>Rol ekle</span></button></div>
    <div id="rolesBox"><div class="tiny faint">Yükleniyor…</div></div></div>`,
  mount: () => rolesLoad(),
});
async function rolesLoad() {
  const box = $('#rolesBox');
  if (!box) return;
  try { const r = await api('roles.list'); YT.roles = r.roles; YT.modules = r.modules; } catch (e) { setHTML(box, html`<div class="small">${e.message}</div>`); return; }
  S.roles = YT.roles.map((x) => ({ id: x.id, name: x.name }));
  const off = YT.modules.filter((m) => !m.on);
  setHTML(box, html`${YT.roles.length ? html`<div class="list">${YT.roles.map((ro) => html`<div class="list-row"><div class="grow"><div class="lr-t">${ro.name} <span class="tiny faint">· ${ro.users} kişi</span></div>
      <div class="lr-s role-perms">${YT.modules.filter((m) => m.on).map((m) => { const v = ro.perms[m.key]; return v ? html`<span class="badge ${PERM_LBL[v][1]}" title="${m.name}">${m.name}: ${PERM_LBL[v][0]}</span>` : ''; })}</div></div>
      <div class="mk-act"><button type="button" class="btn sm" data-act="role-edit" data-id="${ro.id}">Düzenle</button><button type="button" class="btn sm icon ghost danger" data-act="role-remove" data-id="${ro.id}" aria-label="Rolü kaldır">${icon('trash', 'sm')}</button></div></div>`)}</div>`
    : html`<p class="small muted">Henüz rol yok. Herkes temel yetkisiyle çalışıyor.</p>`}
    ${off.length ? html`<p class="tiny faint">${icon('lock', 'sm')} Sistem yöneticisinin bu birimde kapattığı modüller: ${off.map((m) => m.name).join(', ')}</p>` : ''}`);
}
ACT['role-new'] = () => roleModal(null);
ACT['role-edit'] = (el) => roleModal(YT.roles.find((x) => x.id === +el.dataset.id));
ACT['role-remove'] = async (el) => {
  const ro = YT.roles.find((x) => x.id === +el.dataset.id);
  if (!(await confirmDialog({ title: `“${ro.name}” rolü kaldırılsın mı?`, text: ro.users ? `${ro.users} kişi temel yetkisine döner.` : 'Bu rolde kimse yok.', ok: 'Kaldır', danger: true }))) return;
  try { await api('roles.delete', { id: ro.id }); toast('Rol kaldırıldı'); rolesLoad(); } catch (e) { toast(e.message, 'err'); }
};
function roleModal(ro) {
  const mods = YT.modules.filter((m) => m.on);
  const cur = (k) => (ro && ro.perms[k]) || 'use';
  const m = openModal({ title: ro ? 'Rolü düzenle' : 'Yeni rol', size: 'wide', body: html`<form class="stack" id="roleF">
      <div class="field"><label>Rol adı</label><input class="input" name="name" required minlength="2" maxlength="80" value="${ro ? ro.name : ''}" placeholder="ör. Sorumlu hemşire"></div>
      <div class="role-grid">${mods.map((md) => html`<div class="role-row"><div class="grow"><div class="small"><b>${md.name}</b></div><div class="tiny faint">${md.desc}</div></div>
        <div class="seg role-seg" data-k="${md.key}">${['off', 'use', 'manage'].map((v) => html`<button type="button" class="${cur(md.key) === v ? 'on' : ''}" data-v="${v}">${PERM_LBL[v][0]}</button>`)}</div></div>`)}</div>
      <p class="tiny faint">Duyurular, belgeler ve okuma takibi herkes için açıktır; onlarda temel yetki (yayıncı / üye) geçerlidir.</p>
      <div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" type="submit" form="roleF">Kaydet</button>` });
  m.el.addEventListener('click', (ev) => {
    const b = ev.target.closest('.role-seg button');
    if (!b) return;
    $$('button', b.parentNode).forEach((x) => x.classList.toggle('on', x === b));
  });
  const f = $('#roleF', m.el);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async (d) => {
      const perms = {};
      $$('.role-seg', m.el).forEach((sg) => { const on = $('button.on', sg); if (on) perms[sg.dataset.k] = on.dataset.v; });
      await api('roles.save', { id: ro ? ro.id : null, name: d.name.trim(), perms });
      m.close(); toast(ro ? 'Rol güncellendi' : 'Rol eklendi'); rolesLoad();
    });
  });
}

/* ---------------- Sistem paneli: modül aç/kapat ---------------- */
async function sysModules(kind, id, title) {
  let r;
  try { r = await api('sa.modules.get', { kind, id }); } catch (e) { toast(e.message, 'err'); return; }
  const opts = kind === 'hospital' ? [['on', 'Açık'], ['off', 'Kapalı']] : [['inherit', 'Hastaneye uy'], ['on', 'Açık'], ['off', 'Kapalı']];
  const m = openModal({ title: `${title} · modüller`, size: 'wide', body: html`<div class="stack">
      <p class="small muted">${kind === 'hospital' ? 'Hastanenin tüm birimleri için. Birim bazında ayrıca değiştirilebilir.' : 'Bu birim için. “Hastaneye uy” hastanenin ayarını kullanır.'} Kapalı modül menüde görünmez ve sunucuda da kapanır; veriler silinmez.</p>
      <div class="role-grid">${r.modules.map((md) => html`<div class="role-row"><div class="grow"><div class="small"><b>${md.name}</b>${md.dep ? html` <span class="tiny faint">(Nöbet listelerine bağlı)</span>` : ''}</div><div class="tiny faint">${md.desc}${kind !== 'hospital' ? ' · Hastane: ' + (md.hospital ? 'açık' : 'kapalı') : ''}</div></div>
        <div class="seg role-seg" data-k="${md.key}">${opts.map(([v, l]) => html`<button type="button" class="${md.value === v ? 'on' : ''}" data-v="${v}">${l}</button>`)}</div></div>`)}</div>
      <p class="tiny faint">Her zaman açık: ${r.core.join(', ')}.</p></div>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="sysModSave">Kaydet</button>` });
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('.role-seg button'); if (b) $$('button', b.parentNode).forEach((x) => x.classList.toggle('on', x === b)); });
  $('#sysModSave', m.el).addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const modules = {};
    $$('.role-seg', m.el).forEach((sg) => { const on = $('button.on', sg); if (on) modules[sg.dataset.k] = on.dataset.v; });
    try { await api('sa.modules.save', { kind, id, modules }); m.close(); toast('Modüller kaydedildi'); } catch (e) { toast(e.message, 'err'); }
  }));
}
