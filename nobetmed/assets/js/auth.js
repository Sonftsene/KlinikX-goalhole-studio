/* NöbetMed — kurulum, giriş, kayıt ve misafir görünümü */
'use strict';

const APP = () => document.getElementById('app');

function authLayout(inner) {
  const org = S.settings.org_name || 'Klinik Portalı';
  return html`
  <div class="auth">
    <aside class="auth-art">
      <div class="row" style="gap:12px">${BRAND_MARK}<div><div class="brand-name" style="color:#fff">Nöbet<span style="color:#8ff0e6">Med</span></div><div class="tiny" style="opacity:.75">${org}</div></div></div>
      <div>
        <h2>Ekibinizin duyuruları, protokolleri ve nöbetleri tek yerde.</h2>
        <p>WhatsApp gruplarında kaybolan bilgiler yerine düzenli, aranabilir ve kimin okuduğu belli olan bir klinik portalı.</p>
        <div class="auth-feats">
          <div class="auth-feat"><span class="fi">${icon('checkCircle')}</span><div><b>Okundu takibi</b><span>Zorunlu protokolleri kimin okuduğunu anında görün.</span></div></div>
          <div class="auth-feat"><span class="fi">${icon('calendar')}</span><div><b>Excel nöbet listeleri</b><span>Excel'de hazırladığınız liste sitede açık görünür; herkes adını tek tıkla bulur.</span></div></div>
          <div class="auth-feat"><span class="fi">${icon('lock')}</span><div><b>Kapalı ve güvenli</b><span>Arama motorlarına kapalı, yalnızca onaylı üyeler erişir.</span></div></div>
        </div>
      </div>
      <div class="tiny" style="opacity:.6">© ${new Date().getFullYear()} NöbetMed</div>
    </aside>
    <main class="auth-form"><div class="auth-box">${inner}</div></main>
  </div>`;
}

function renderSetup() {
  setHTML(APP(), authLayout(html`
    <div class="row" style="margin-bottom:22px">${BRAND_MARK}<b class="brand-name">Nöbet<span>Med</span></b></div>
    <h1>Kuruluma hoş geldiniz</h1>
    <p class="sub">İlk yönetici hesabını oluşturun. Bu işlem yalnızca bir kez yapılır.</p>
    <form class="stack" data-form="setup">
      <div class="field"><label>Kurum / klinik adı</label><input class="input" name="org_name" placeholder="Örn: Şehir Hastanesi Yoğun Bakım" required></div>
      <div class="field"><label>Ad soyad</label><input class="input" name="name" autocomplete="name" required minlength="3"></div>
      <div class="field"><label>E-posta</label><input class="input" type="email" name="email" autocomplete="email" required></div>
      <div class="field"><label>Şifre</label>${pwField('password', 'En az 8 karakter', 'new-password')}</div>
      <div class="form-error hidden" data-err></div>
      <button class="btn primary block" type="submit">Kurulumu tamamla</button>
    </form>`));
}
FORMS.setup = (f) => submitForm(f, async (d) => {
  await api('auth.setup', d);
  await start();
  toast('Kurulum tamamlandı. Hoş geldiniz!');
});

function googleBlock() {
  if (!S.google_client_id) return '';
  return html`<div id="gbtn" style="min-height:44px;display:flex;justify-content:center"></div><div class="divider">veya e-posta ile</div>`;
}
function mountGoogle() {
  if (!S.google_client_id || window.NM_DEMO_API) return;
  const init = () => {
    if (!window.google || !google.accounts) return;
    google.accounts.id.initialize({
      client_id: S.google_client_id,
      callback: async (resp) => {
        try {
          const r = await api('auth.google', { credential: resp.credential });
          if (r.pending) return renderAuth('pending');
          await start();
        } catch (e) { toast(e.message, 'err'); }
      },
    });
    const box = $('#gbtn');
    if (box) google.accounts.id.renderButton(box, { theme: isDark() ? 'filled_black' : 'outline', size: 'large', width: Math.min(380, box.offsetWidth || 380), text: 'continue_with', locale: 'tr' });
  };
  if (window.google && window.google.accounts) return init();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
  s.onload = init;
  document.head.appendChild(s);
}

function renderAuth(mode = 'login') {
  const reg = S.settings.registration;
  let inner;
  if (mode === 'pending') {
    inner = html`
      <div class="empty" style="padding:10px 0 0;text-align:left">
        <div class="e-ico" style="margin:0 0 16px;background:var(--warn-soft);color:var(--warn)">${icon('clock', 'lg')}</div>
        <h1>Kaydınız alındı</h1>
        <p class="sub">Hesabınız yönetici onayından sonra aktif olacak. Onaylandığında aynı bilgilerle giriş yapabilirsiniz.</p>
        <button class="btn block" data-act="auth-mode" data-mode="login">Giriş ekranına dön</button>
      </div>`;
  } else if (mode === 'forgot') {
    inner = html`
      <h1>Şifremi unuttum</h1>
      <p class="sub">Hesabınızın e-posta adresini yazın; şifre sıfırlama bağlantısı gönderelim.</p>
      <form class="stack" data-form="forgot">
        <div class="field"><label>E-posta</label><input class="input" type="email" name="email" autocomplete="email" required></div>
        <div class="form-error hidden" data-err></div>
        <div class="form-note success hidden" data-ok></div>
        <button class="btn primary block" type="submit">Bağlantı gönder</button>
      </form>
      <p class="small muted" style="margin-top:18px;text-align:center"><a href="#" data-act="auth-mode" data-mode="login">Girişe dön</a></p>`;
  } else if (mode === 'register') {
    inner = html`
      <h1>Hesap oluştur</h1>
      <p class="sub">${reg === 'approval' ? 'Kaydınız yönetici onayından sonra aktifleşir.' : 'Kayıt olduktan sonra hemen giriş yapabilirsiniz.'}</p>
      ${googleBlock()}
      <form class="stack" data-form="register">
        <div class="field"><label>Ad soyad</label><input class="input" name="name" autocomplete="name" required minlength="3"></div>
        <div class="grid2">
          <div class="field"><label>Ünvan</label><select class="select" name="title_id">${options(S.titles, null, 'Seçin')}</select></div>
          <div class="field"><label>Birim</label><select class="select" name="unit_id">${options(S.units, null, 'Seçin')}</select></div>
        </div>
        <div class="field"><label>E-posta</label><input class="input" type="email" name="email" autocomplete="email" required></div>
        <div class="field"><label>Şifre</label>${pwField('password', 'En az 8 karakter', 'new-password')}</div>
        <div class="form-error hidden" data-err></div>
        <button class="btn primary block" type="submit">Kayıt ol</button>
      </form>
      <p class="small muted" style="margin-top:18px;text-align:center">Zaten hesabınız var mı? <a href="#" data-act="auth-mode" data-mode="login">Giriş yapın</a></p>`;
  } else {
    inner = html`
      <div class="row" style="margin-bottom:22px">${BRAND_MARK}<div><b class="brand-name">Nöbet<span>Med</span></b><div class="brand-org">${S.settings.org_name}</div></div></div>
      <h1>Tekrar hoş geldiniz</h1>
      <p class="sub">Devam etmek için hesabınıza giriş yapın.</p>
      ${googleBlock()}
      <form class="stack" data-form="login">
        <div class="field"><label>E-posta</label><input class="input" type="email" name="email" autocomplete="username" required></div>
        <div class="field"><label>Şifre</label>${pwField('password', '••••••••', 'current-password')}</div>
        <div class="form-error hidden" data-err></div>
        <button class="btn primary block" type="submit">Giriş yap</button>
      </form>
      <p class="small muted" style="margin-top:18px;text-align:center">
        ${reg === 'closed' ? 'Hesabınız yoksa yöneticinizden davet isteyin.' : html`Hesabınız yok mu? <a href="#" data-act="auth-mode" data-mode="register">Kayıt olun</a>`}
      </p>
      <p class="tiny faint" style="text-align:center;margin-top:8px">${S.mail_ready ? html`<a href="#" data-act="auth-mode" data-mode="forgot">Şifremi unuttum</a>` : 'Şifrenizi unuttuysanız yöneticiniz geçici şifre oluşturabilir.'}</p>`;
  }
  setHTML(APP(), authLayout(inner));
  mountGoogle();
}
ACT['auth-mode'] = (el) => renderAuth(el.dataset.mode);
FORMS.forgot = (f) => submitForm(f, async (d) => {
  const r = await api('auth.forgot', d);
  const ok = f.querySelector('[data-ok]');
  ok.textContent = r.message;
  ok.classList.remove('hidden');
  f.querySelector('button[type=submit]').classList.add('hidden');
});

/* ---------------- Şifre sıfırlama ve zorunlu şifre değişikliği ---------------- */
function newPasswordForm(formName, button) {
  return html`<form class="stack" data-form="${formName}">
    <div class="field"><label>Yeni şifre</label>${pwField('password', 'En az 8 karakter', 'new-password')}</div>
    <div class="field"><label>Yeni şifre (tekrar)</label>${pwField('password2', 'Aynı şifreyi tekrar yazın', 'new-password')}</div>
    <p class="hint">İpucu: Harf, rakam ve işaret karışık, en az 8 karakterlik bir şifre seçin.</p>
    <div class="form-error hidden" data-err></div>
    <button class="btn primary block" type="submit">${button}</button>
  </form>`;
}
function checkNewPassword(d) {
  if ((d.password || '').length < 8) throw new Error('Şifre en az 8 karakter olmalıdır.');
  if (d.password !== d.password2) throw new Error('İki şifre aynı değil.');
}
function renderReset(token) {
  setHTML(APP(), authLayout(html`
    <div class="row" style="margin-bottom:22px">${BRAND_MARK}<b class="brand-name">Nöbet<span>Med</span></b></div>
    <h1>Yeni şifre belirleyin</h1>
    <p class="sub">Hesabınız için yeni bir şifre seçin.</p>
    ${newPasswordForm('reset', 'Şifreyi kaydet ve giriş yap')}`));
  $('form[data-form=reset]')._token = token;
}
FORMS.reset = (f) => submitForm(f, async (d) => {
  checkNewPassword(d);
  await api('auth.reset', { token: f._token, password: d.password });
  await start();
  toast('Şifreniz değiştirildi. Hoş geldiniz!');
});
function renderForceChange() {
  setHTML(APP(), authLayout(html`
    <div class="row" style="margin-bottom:22px">${BRAND_MARK}<b class="brand-name">Nöbet<span>Med</span></b></div>
    <h1>Merhaba ${S.me.name.split(' ')[0]}, kendi şifrenizi belirleyin</h1>
    <p class="sub">Geçici bir şifreyle giriş yaptınız. Güvenliğiniz için devam etmeden önce yalnızca sizin bildiğiniz yeni bir şifre seçin.</p>
    ${newPasswordForm('force-change', 'Şifremi kaydet ve devam et')}
    <p class="small muted" style="margin-top:16px;text-align:center"><a href="#" data-act="logout">Çıkış yap</a></p>`));
}
FORMS['force-change'] = (f) => submitForm(f, async (d) => {
  checkNewPassword(d);
  await api('me.password', { password: d.password });
  S.me.must_change = false;
  renderShell();
  route();
  toast('Şifreniz kaydedildi');
});

FORMS.login = (f) => submitForm(f, async (d) => {
  await api('auth.login', d);
  await start();
});
FORMS.register = (f) => submitForm(f, async (d) => {
  d.title_id = d.title_id ? +d.title_id : null;
  d.unit_id = d.unit_id ? +d.unit_id : null;
  const r = await api('auth.register', d);
  if (r.pending) return renderAuth('pending');
  await start();
  toast('Hesabınız oluşturuldu. Hoş geldiniz!');
});

/* ---------------- Misafir paylaşım görünümü ---------------- */
async function renderGuest(token) {
  setHTML(APP(), html`<div class="boot-splash"><div class="spinner"></div></div>`);
  let r;
  try {
    r = await api('guest.get', { token });
  } catch (e) {
    setHTML(APP(), html`
      <div class="guest-top">${BRAND_MARK}<a class="btn sm" href="./">Giriş yap</a></div>
      <div class="guest-wrap"><div class="card empty"><div class="e-ico">${icon('lock', 'lg')}</div><h3>Bağlantı geçersiz</h3><p>${e.message}</p></div></div>`);
    return;
  }
  const p = r.post;
  const cat = r.category || { name: '', icon: 'folder', color: 'slate' };
  document.title = p.title + ' · NöbetMed';
  setHTML(APP(), html`
    <div class="guest-top">
      <div class="row">${BRAND_MARK}<div><b class="brand-name">Nöbet<span>Med</span></b><div class="brand-org">${r.org_name}</div></div></div>
      <a class="btn sm" href="./">${icon('user', 'sm')}Üye girişi</a>
    </div>
    <div class="guest-wrap">
      <div class="form-note" style="margin-bottom:16px;display:flex;gap:8px;align-items:center">${icon('link', 'sm')}<span>Bu içerik size özel bir bağlantı ile paylaşıldı${p.share_expires ? html` · <b>${fmtDateTime(p.share_expires)}</b> tarihine kadar geçerli` : ''}.</span></div>
      <article class="card card-pad stack" style="gap:16px">
        <div class="row wrap"><span class="badge tone-${cat.color}">${icon(cat.icon)}${cat.name}</span>${p.unit_id ? '' : ''}</div>
        <h1 class="detail-title">${p.title}</h1>
        <div class="row small muted">${avatar(p.author_name, 'sm')}<span><b>${p.author_name}</b>${r.author_title ? ' · ' + r.author_title : ''} · ${fmtDate(p.published_at, true)}</span></div>
        <div class="detail-body">${raw(linkify(p.body))}</div>
        ${attachmentsBlock(p.attachments)}
      </article>
    </div>`);
  hydrateViewers(APP());
}
