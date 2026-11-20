/* dupcii — sistem yönetimi (süper yönetici): hastaneler, birimler, birim yöneticileri, dondurma.
   Süper yönetici birimlerin içeriğini görmez; yalnız sayılar. */
'use strict';

/* ---------------- Giriş (şifre + uygulama kodu) ---------------- */
ACT['sys-login'] = () => renderSysLogin();
function renderSysLogin(step = 'pw') {
  setHTML(APP(), authLayout(step === 'pw' ? html`
    <div class="auth-brand">${brandLogo()}</div>
    <h1>${icon('shield')} Sistem yönetimi</h1>
    <p class="sub">Hastane ve birimleri yöneten hesap. Giriş için şifre ve doğrulama uygulamasındaki kod gerekir.</p>
    <form class="stack" data-form="sys-login">
      <div class="field"><label>E-posta</label><input class="input" type="email" name="email" autocomplete="username" required></div>
      <div class="field"><label>Şifre</label>${pwField('password', '••••••••••••', 'current-password')}</div>
      <div class="form-error hidden" data-err></div>
      <button class="btn primary block" type="submit">Devam</button>
    </form>
    <p class="small muted" style="margin-top:18px;text-align:center"><a href="#" data-act="auth-mode" data-mode="login">Birim girişine dön</a></p>`
    : html`
    <div class="auth-brand">${brandLogo()}</div>
    <h1>Doğrulama kodu</h1>
    <p class="sub">Doğrulama uygulamasındaki (Google Authenticator, Microsoft Authenticator vb.) 6 haneli kodu girin.</p>
    <form class="stack" data-form="sys-totp">
      <div class="field"><label>Kod</label><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus></div>
      <div class="form-error hidden" data-err></div>
      <button class="btn primary block" type="submit">Giriş yap</button>
    </form>
    <p class="small muted" style="margin-top:18px;text-align:center"><a href="#" data-act="sys-login">Baştan başla</a></p>`));
  const f = $('form', APP()); if (f) { const i = $('input', f); if (i) i.focus(); }
}
FORMS['sys-login'] = (f) => submitForm(f, async (d) => { await api('sa.login', d); renderSysLogin('code'); });
FORMS['sys-totp'] = (f) => submitForm(f, async (d) => { await api('sa.totp', d); location.hash = ''; start(); });

/* ---------------- Panel ---------------- */
const SYS = { data: null, tab: 'birimler' };
const SYS_TABS = ['birimler', 'basvuru', 'destek', 'abonelik', 'site', 'saglik', 'gunluk'];
function sysTabFromHash() { const m = /^#\/sistem\/([a-z]+)/.exec(location.hash); return m && SYS_TABS.includes(m[1]) ? m[1] : null; }
// Sekmeler adreste (#/sistem/<sekme>): telefonun geri tuşu bir önceki sekmeye döner
window.addEventListener('hashchange', () => {
  if (!S.sa || !$('.sys')) return;
  const t = sysTabFromHash() || 'birimler';
  if (t === SYS.tab) return;
  SYS.tab = t; $$('[data-act=sys-tab]').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); sysLoad();
});
async function renderSistem() {
  document.title = 'dupcii · Sistem yönetimi';
  SYS.tab = sysTabFromHash() || SYS.tab;
  setHTML(APP(), html`<div class="sys">
    <header class="sys-top"><div class="row" style="gap:10px">${brandLogo()}<b>Sistem yönetimi</b></div><span class="grow"></span>
      <span class="small muted sys-who">${S.sa.name}</span>
      <button class="btn sm ghost" data-act="sys-pw">${icon('key', 'sm')}<span>Şifre</span></button>
      <button class="btn sm" data-act="sys-out">${icon('logout', 'sm')}<span>Çıkış</span></button></header>
    <main class="sys-main">
      <div class="page-head"><div><h1>Hastaneler ve birimler</h1><p>Her birimin verisi ayrı tutulur. Birimin içini yönetmek için <b>Birime gir</b>: yönetici yetkisiyle girersiniz; giriş, çıkış ve her işlem birimin günlüğüne de yazılır.</p></div>
        <button class="btn primary" data-act="sys-h-new">${icon('plus', 'sm')}<span>Hastane ekle</span></button></div>
      <div class="seg sys-tabs" role="tablist" style="margin-bottom:14px"><button class="${SYS.tab === 'birimler' ? 'on' : ''}" data-act="sys-tab" data-t="birimler">Birimler</button><button class="${SYS.tab === 'basvuru' ? 'on' : ''}" data-act="sys-tab" data-t="basvuru">Başvurular<span class="sys-badge" id="sysApN"></span></button><button class="${SYS.tab === 'destek' ? 'on' : ''}" data-act="sys-tab" data-t="destek">Destek<span class="sys-badge" id="sysSpN"></span></button><button class="${SYS.tab === 'abonelik' ? 'on' : ''}" data-act="sys-tab" data-t="abonelik">Abonelik ve ödeme</button><button class="${SYS.tab === 'site' ? 'on' : ''}" data-act="sys-tab" data-t="site">Site ve yedek</button><button class="${SYS.tab === 'saglik' ? 'on' : ''}" data-act="sys-tab" data-t="saglik">Sistem sağlığı</button><button class="${SYS.tab === 'gunluk' ? 'on' : ''}" data-act="sys-tab" data-t="gunluk">İşlem günlüğü</button></div>
      <div id="sysBody"><div class="empty"><div class="spinner"></div></div></div>
    </main></div>`);
  sysLoad();
}
/** Başvurular sekmesindeki bekleyen sayısı */
function sysTabBadge() {
  const b = $('#sysApN'); if (b) b.textContent = SYS.applyOpen ? String(SYS.applyOpen) : '';
  const c = $('#sysSpN'); if (c) c.textContent = SYS.supportOpen ? String(SYS.supportOpen) : '';
}
ACT['sys-tab'] = (el) => { SYS.tab = el.dataset.t; navStep('#/sistem/' + SYS.tab); $$('[data-act=sys-tab]').forEach((b) => b.classList.toggle('on', b === el)); sysLoad(); };

async function sysLoad() {
  const box = $('#sysBody');
  if (!box) return;
  if (SYS.tab === 'abonelik' && typeof blSaRender === 'function') return blSaRender(box);
  if (SYS.tab === 'basvuru' && typeof apSaRender === 'function') return apSaRender(box);
  if (SYS.tab === 'destek' && typeof spSaRender === 'function') return spSaRender(box);
  if (SYS.tab === 'site' && typeof lgSaRender === 'function') return lgSaRender(box);
  if (SYS.tab === 'saglik' && typeof hlRender === 'function') return hlRender(box, 'sa.health');
  try {
    if (SYS.tab === 'gunluk') {
      const r = await api('sa.audit');
      setHTML(box, html`<div class="card"><div class="list">${r.items.length ? r.items.map((x) => html`<div class="list-row"><div class="grow"><div class="lr-t">${SYS_ACT[x.action] || x.action}${x.target ? ' · ' + x.target : ''}</div>
        <div class="lr-s">${fmtDate(x.at)} ${x.at.slice(11, 16)} · ${x.who || '—'}${x.detail ? ' · ' + x.detail : ''} · ${x.ip}</div></div></div>`) : html`<div class="list-row small muted">Kayıt yok.</div>`}</div></div>`);
      return;
    }
    SYS.data = await api('sa.overview');
    SYS.applyOpen = SYS.data.apply_open || 0; SYS.supportOpen = SYS.data.support_open || 0; sysTabBadge();
  } catch (e) {
    if (e.status === 401) { S.sa = null; return start(); }
    setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return;
  }
  const hs = SYS.data.hospitals;
  setHTML(box, hs.length ? html`<div class="stack">${hs.map((h) => html`<div class="card sys-h ${h.status === 'frozen' ? 'frozen' : ''}">
      <div class="card-head"><div><h3>${icon('building', 'sm')} ${h.name}</h3><div class="tiny faint">${h.tenants.length} birim${h.status === 'frozen' ? ' · dondurulmuş' : ''}</div></div>
        <div class="row" style="gap:6px"><button class="btn sm" data-act="sys-t-new" data-h="${h.id}">${icon('plus', 'sm')}<span>Birim ekle</span></button>
          <button class="btn sm icon ghost" data-act="sys-h-menu" data-h="${h.id}" aria-label="Hastane işlemleri">${icon('more', 'sm')}</button></div></div>
      <div class="list">${h.tenants.length ? h.tenants.map((t) => sysTenantRow(t)) : html`<div class="list-row small muted">Henüz birim yok. “Birim ekle” ile başlayın.</div>`}</div></div>`)}</div>`
    : html`<div class="card empty"><h3>Henüz hastane yok</h3></div>`);
}
const SYS_ACT = {
  login: 'Giriş', logout: 'Çıkış', password: 'Şifre değişti', 'sa.created': 'Hesap etkinleşti', 'hospital.create': 'Hastane eklendi', 'hospital.rename': 'Hastane adı değişti',
  'hospital.freeze': 'Hastane donduruldu', 'hospital.unfreeze': 'Hastane açıldı', 'tenant.create': 'Birim eklendi', 'tenant.rename': 'Birim düzenlendi',
  'tenant.enter': 'Birime girdi', 'tenant.exit': 'Birimden çıktı', 'tenant.freeze': 'Birim donduruldu', 'tenant.unfreeze': 'Birim açıldı', 'tenant.admin': 'Birim yöneticisi açıldı', modules: 'Modüller değişti',
  'billing.cfg': 'Abonelik ayarları', 'billing.plan': 'Paket kaydedildi', 'billing.plan.off': 'Paket satıştan kaldırıldı', 'billing.plan.del': 'Paket silindi', 'billing.sub': 'Birim aboneliği değişti',
  'billing.bulk': 'Toplu deneme', 'billing.pay': 'Ödeme işlemi', 'billing.note': 'Abonelik bildirimi',
  'apply.cfg': 'Başvuru ayarları', 'apply.approve': 'Başvuru onaylandı', 'apply.reject': 'Başvuru reddedildi', 'apply.info': 'Başvurudan bilgi istendi', 'apply.spam': 'Başvuru geçersiz sayıldı',
  'apply.reopen': 'Başvuru yeniden açıldı', 'apply.delete': 'Başvuru silindi', 'apply.note': 'Başvuruya not',
  'support.reply': 'Destek yanıtı', 'support.close': 'Destek talebi kapandı', 'support.reopen': 'Destek talebi yeniden açıldı', 'support.unit': 'Destek talebi birime aktarıldı',
  'update.apply': 'Güncelleme kuruldu', 'update.rollback': 'Güncelleme geri alındı', 'update.maint': 'Bakım modu',
  'support.delete': 'Destek talebi silindi', 'support.canned': 'Hazır yanıtlar',
  'legal.save': 'Yasal metinler / künye', 'health.mail': 'Deneme e-postası', 'backup.cfg': 'Yedek ayarları', 'backup.send': 'Yedek gönderildi', 'backup.download': 'Yedek indirildi',
};
function sysTenantRow(t) {
  return html`<div class="list-row sys-t ${t.status === 'frozen' ? 'frozen' : ''}"><div class="grow">
      <div class="lr-t">${t.name}${t.is_default ? html` <span class="badge">ilk kurulum</span>` : ''}${t.status === 'frozen' ? html` <span class="badge warn">dondurulmuş</span>` : ''}${!t.users ? html` <span class="badge info">yönetici bekliyor</span>` : ''}</div>
      <div class="lr-s">${t.active_users} etkin kişi · ${t.disk_mb} MB dosya${t.last_seen ? ' · son etkinlik ' + fmtRel(t.last_seen) : ''}${t.note ? ' · ' + t.note : ''}</div></div>
    <div class="mk-act"><button class="btn sm primary" data-act="sys-enter" data-k="${t.key}" data-n="${t.name}">${icon('logout', 'sm')}<span>Birime gir</span></button>
      <button class="btn sm" data-act="sys-t-admin" data-k="${t.key}" data-n="${t.name}">${icon('user', 'sm')}<span>Yönetici ekle</span></button>
      <button class="btn sm icon ghost" data-act="sys-t-menu" data-id="${t.id}" aria-label="Birim işlemleri">${icon('more', 'sm')}</button></div></div>`;
}
function sysFind(id) { for (const h of SYS.data.hospitals) for (const t of h.tenants) if (t.id === id) return [h, t]; return [null, null]; }

ACT['sys-h-new'] = () => sysNameModal('Hastane ekle', 'Hastane adı', '', async (name) => { await api('sa.hospital.save', { name }); toast('Hastane eklendi'); sysLoad(); });
ACT['sys-t-new'] = (el) => {
  const h = SYS.data.hospitals.find((x) => x.id === +el.dataset.h);
  sysNameModal(`${h.name} · birim ekle`, 'Birim adı (ör. Yoğun Bakım, Acil Servis)', '', async (name) => {
    await api('sa.tenant.save', { hospital_id: h.id, name }); toast('Birim eklendi. Şimdi birime yönetici ekleyin.'); sysLoad();
  });
};
ACT['sys-h-menu'] = (el) => {
  const h = SYS.data.hospitals.find((x) => x.id === +el.dataset.h);
  sysMenu(el, [
    { label: 'Modüller (hastane geneli)', icon: 'layers', run: () => sysModules('hospital', h.id, h.name) },
    { label: 'Adını değiştir', icon: 'edit', run: () => sysNameModal('Hastane adı', 'Hastane adı', h.name, async (name) => { await api('sa.hospital.save', { id: h.id, name }); sysLoad(); }) },
    h.status === 'frozen'
      ? { label: 'Hastaneyi aç', icon: 'checkCircle', run: () => sysStatus('hospital', h.id, 'active') }
      : { label: 'Hastaneyi dondur (tüm birimleri)', icon: 'lock', danger: true, run: () => sysStatus('hospital', h.id, 'frozen', `${h.name} dondurulsun mu?`, 'Bu hastanenin tüm birimlerinde kimse giriş yapamaz; veriler silinmez, istediğinizde açabilirsiniz.') },
  ]);
};
ACT['sys-t-menu'] = (el) => {
  const [, t] = sysFind(+el.dataset.id);
  sysMenu(el, [
    { label: 'Modüller (bu birim)', icon: 'layers', run: () => sysModules('tenant', t.id, t.name) },
    { label: 'Giriş bağlantısını kopyala', icon: 'link', run: async () => toast((await copyText(t.link)) ? 'Bağlantı kopyalandı' : t.link) },
    { label: 'Adını / notunu değiştir', icon: 'edit', run: () => sysNameModal('Birim adı', 'Birim adı', t.name, async (name) => { await api('sa.tenant.save', { id: t.id, name, note: t.note }); sysLoad(); }) },
    t.status === 'frozen'
      ? { label: 'Birimi aç', icon: 'checkCircle', run: () => sysStatus('tenant', t.id, 'active') }
      : { label: 'Birimi dondur', icon: 'lock', danger: true, run: () => sysStatus('tenant', t.id, 'frozen', `${t.name} dondurulsun mu?`, 'Bu birimde kimse giriş yapamaz, Google eşitlemesi ve bildirimler durur; veriler silinmez. İstediğinizde açabilirsiniz.') },
  ]);
};
function sysMenu(el, items) {
  const m = openModal({ title: 'İşlemler', size: 'narrow', body: html`<div class="list">${items.map((x, i) => html`<button type="button" class="list-row ${x.danger ? 'tone-danger' : ''}" data-i="${i}" style="width:100%;border:0;background:none;text-align:left">${icon(x.icon, 'sm')}<span>${x.label}</span></button>`)}</div>` });
  m.el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-i]'); if (!b) return; m.close(); items[+b.dataset.i].run(); });
}
async function sysStatus(kind, id, status, title, text) {
  if (status === 'frozen' && !(await confirmDialog({ title, text, ok: 'Dondur', danger: true }))) return;
  try { await api('sa.status', { kind, id, status }); toast(status === 'frozen' ? 'Donduruldu' : 'Açıldı'); sysLoad(); } catch (e) { toast(e.message, 'err'); }
}
function sysNameModal(title, label, val, save) {
  const m = openModal({ title, size: 'narrow', body: html`<form class="stack" id="sysNameF"><div class="field"><label>${label}</label><input class="input" name="name" value="${val}" required minlength="2" maxlength="120"></div><div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="sysNameF" type="submit">Kaydet</button>` });
  const f = $('#sysNameF', m.el);
  $('input', f).focus();
  f.addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(f, async (d) => { await save(d.name.trim()); m.close(); }); });
}
ACT['sys-t-admin'] = (el) => {
  const others = SYS.data.hospitals.flatMap((h) => h.tenants.map((t) => ({ ...t, h: h.name }))).filter((t) => t.key !== el.dataset.k && t.users);
  const m = openModal({ title: `${el.dataset.n} · yönetici ekle`, body: html`<form class="stack" id="sysAdmF">
      <p class="small muted">Birimin yöneticisi kendi biriminde ekibini davet eder, nöbet listelerini ve ayarları yönetir. Geçici şifre bir kez gösterilir; ilk girişte değiştirmesi istenir.</p>
      <div class="field"><label>Ad soyad</label><input class="input" name="name" required minlength="3"></div>
      <div class="field"><label>E-posta</label><input class="input" type="email" name="email" required></div>
      ${others.length ? html`<div class="field"><label>E-posta (SMTP) ayarlarını kopyala</label><select class="select" name="copy_mail"><option value="">Kopyalama (birim kendisi ayarlar)</option>${others.map((t) => html`<option value="${t.key}">${t.h} › ${t.name}</option>`)}</select>
        <div class="tiny faint">Aynı e-posta hesabıyla gönderim yapılacaksa seçin; birim yöneticisi sonradan değiştirebilir.</div></div>` : ''}
      <label class="small"><input type="checkbox" name="send_email" checked> Giriş bilgilerini e-postayla gönder (e-posta ayarlıysa)</label>
      <div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="sysAdmF" type="submit">Yönetici ekle</button>` });
  const f = $('#sysAdmF', m.el);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async (d) => {
      const r = await api('sa.tenant.admin', { key: el.dataset.k, name: d.name, email: d.email, copy_mail: d.copy_mail || '', send_email: !!d.send_email });
      m.setBody(html`<div class="stack"><div class="mk-box ok">${icon('checkCircle', 'sm')}<span><b>${d.name}</b> birim yöneticisi olarak eklendi${r.mailed ? '; giriş bilgileri e-postayla gönderildi' : ''}.</span></div>
        <div class="field"><label>Geçici şifre (bir kez gösterilir)</label><input class="input" readonly value="${r.password}"></div>
        <div class="field"><label>Giriş adresi</label><input class="input" readonly value="${r.link}"></div>
        <p class="tiny faint">Bu bilgileri kişiye güvenli bir yoldan iletin. İlk girişte kendi şifresini belirleyecek.</p></div>`);
      m.setFoot(html`<button class="btn primary" data-close>Tamam</button>`);
      sysLoad();
    });
  });
};
ACT['sys-enter'] = async (el) => {
  if (!(await confirmDialog({ title: `${el.dataset.n} birimine girilsin mi?`, text: 'Birimde yönetici yetkisiyle her şeyi görür ve yönetirsiniz (kişiler, nöbet listeleri, hasta listeleri dahil). Giriş, çıkış ve yaptığınız her işlem birimin kendi işlem günlüğüne de yazılır. Hasta bilgisine yalnız gerektiğinde bakın.', ok: 'Birime gir' }))) return;
  try { await api('sa.enter', { key: el.dataset.k }); if (typeof pwaClearFileCache === 'function') await pwaClearFileCache(); location.hash = '#/'; start(); } catch (e) { toast(e.message, 'err'); }
};
ACT['sys-exit'] = async () => {
  try { await api('sa.exit'); } catch (e) { /* oturum düştüyse de panele dön */ }
  if (typeof pwaClearFileCache === 'function') await pwaClearFileCache(); // başka birimin ek dosyası önbellekten gösterilmesin
  location.hash = ''; start();
};
ACT['sys-out'] = async () => { try { const r = await api('sa.logout'); S.csrf = r.csrf || S.csrf; } catch (e) { /* */ } S.sa = null; start(); };
ACT['sys-pw'] = () => {
  const m = openModal({ title: 'Sistem yöneticisi şifresi', size: 'narrow', body: html`<form class="stack" id="sysPwF">
      <div class="field"><label>Mevcut şifre</label>${pwField('current', '', 'current-password')}</div>
      <div class="field"><label>Yeni şifre</label><input class="input" type="password" name="password" minlength="12" required autocomplete="new-password" placeholder="En az 12 karakter"></div>
      <div class="form-error hidden" data-err></div></form>`,
  foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="sysPwF" type="submit">Kaydet</button>` });
  const f = $('#sysPwF', m.el);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(f, async (d) => { await api('sa.password', d); m.close(); toast('Şifre değişti'); }); });
};

/* ---------------- Ayarlar › Güvenlik: sistem yöneticisi hesabı (bir kez, ilk birimin yöneticisi) ---------------- */
NM_EXT.settingsCards.push({
  sec: 'guvenlik', admin: true,
  html: () => (S.tenant && S.tenant.sa_setup ? html`<div class="card card-pad stack" data-sec="guvenlik" id="saSetupCard">
    <div><h3 style="font-size:15px">${icon('shield', 'sm')} Sistem yönetimi (birden çok hastane / birim)</h3>
      <p class="small muted">Başka birimleri veya hastaneleri eklemek için bir kez <b>sistem yöneticisi</b> hesabı oluşturun. Bu hesap ayrı girişle açılır, doğrulama uygulaması kodu ister ve birimlerin içeriğini göremez; yalnız hastane/birim ekler, birim yöneticisi açar, birimi dondurur.</p></div>
    <fieldset class="stack" id="saSetupF" style="border:0;padding:0;margin:0">
      <div class="grid2"><div class="field"><label>Ad soyad</label><input class="input" form="sa-none" name="name" required minlength="3" value="${S.me.name}"></div>
        <div class="field"><label>E-posta</label><input class="input" form="sa-none" type="email" name="email" required value="${S.me.email}"></div></div>
      <div class="grid2"><div class="field"><label>Sistem yöneticisi şifresi</label><input class="input" form="sa-none" type="password" name="password" minlength="12" required autocomplete="new-password" placeholder="En az 12 karakter, birim şifrenizden farklı"></div>
        <div class="field"><label>Kendi (birim) şifreniz</label><input class="input" form="sa-none" type="password" name="current" required autocomplete="current-password" placeholder="Onay için"></div></div>
      <div class="form-error hidden" data-err></div>
      <div><button class="btn primary" type="button" id="saSetupGo">Hesabı oluştur</button></div>
    </fieldset></div>` : ''),
  mount: () => {
    // Ayarlar sayfası zaten bir form: bu alanlar ona bağlı değil (form="sa-none"), iç içe form yok
    const f = $('#saSetupF');
    if (!f) return;
    $('#saSetupGo').addEventListener('click', () => {
      submitForm(f, async (d) => {
        const r = await api('sa.create', d);
        try { await loadVendor('qrcode'); } catch (e) { /* QR yoksa anahtar elle girilir */ }
        const m = openModal({ title: 'Doğrulama uygulamasını bağla', body: html`<div class="stack">
            <p class="small">1) Telefonunuza <b>Google Authenticator</b> veya <b>Microsoft Authenticator</b> kurun. 2) Uygulamada “QR kod tara” ile aşağıdaki kodu okutun. 3) Uygulamanın gösterdiği 6 haneli kodu yazın.</p>
            <div style="text-align:center">${raw(typeof qrSvg === 'function' ? qrSvg(r.uri, 200) : '')}</div>
            <div class="field"><label>QR okutamıyorsanız anahtar</label><input class="input" readonly value="${r.secret}"></div>
            <form class="stack" id="saCodeF"><div class="field"><label>Uygulamadaki kod</label><input class="input" name="code" inputmode="numeric" maxlength="7" required></div><div class="form-error hidden" data-err></div></form>
            <p class="tiny faint">Telefonu kaybederseniz bu hesaba giremezsiniz; anahtarı güvenli bir yere not edin.</p></div>`,
        foot: html`<button class="btn primary" form="saCodeF" type="submit">Doğrula ve etkinleştir</button>` });
        const cf = $('#saCodeF', m.el);
        cf.addEventListener('submit', (e2) => {
          e2.preventDefault();
          submitForm(cf, async (d2) => {
            await api('sa.create.confirm', d2);
            m.close();
            S.tenant.sa_setup = false;
            const card = $('#saSetupCard');
            if (card) setHTML(card, html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span><b>Sistem yöneticisi hesabı etkin.</b> Çıkış yapıp giriş ekranındaki “Sistem yönetimi” bağlantısından girebilirsiniz.</span></div>`);
          });
        });
      });
    });
  },
});
