/* dupcii — birim açma başvurusu ve doğrulama (4.16).
   Başvuran: #/basvuru (e-posta kodu → bilgiler → incelemede), #/basvuru/<anahtar> (durum, ek bilgi yanıtı, geri çekme).
   Birim yöneticisi: aynı hastanedeki başvuruya "Tanıyorum / Tanımıyorum" (ana sayfa kartı).
   Sistem yöneticisi: Başvurular sekmesi (doğrulama işaretleri, onay / bilgi iste / ret / geçersiz, ayarlar). */
'use strict';

const AP = { step: 'email', info: null, email: '', hosp: null, units: [], other: false, doc: null, tries: 0 };
const AP_DUTY = ['Sorumlu hemşire', 'Birim yöneticisi', 'Sorumlu hekim / klinik şefi', 'Başhemşirelik / sağlık bakım hizmetleri', 'Birimde görevliyim (yönetici değilim)'];
const AP_TONE = { pending: 'info', info: 'warn', approved: 'success', rejected: 'danger', spam: '' };

function apIsRoute() { return /^#\/basvuru(\/|$)/.test(location.hash); }
window.addEventListener('hashchange', () => { if (!S.me && apIsRoute()) renderApply(); });
ACT['ap-open'] = () => { if (apIsRoute()) renderApply(); else location.hash = '#/basvuru'; };
ACT['ap-login'] = () => { history.replaceState(null, '', location.pathname + location.search); renderAuth('login'); };

async function renderApply() {
  const tok = (location.hash.match(/^#\/basvuru\/([A-Za-z0-9_-]{20,64})/) || [])[1];
  setHTML(APP(), authLayout(html`<div class="empty"><div class="spinner"></div></div>`));
  if (tok) return apStatus(tok);
  try { AP.info = await api('apply.info'); } catch (e) { return apShell(html`<div class="form-error">${e.message}</div>`); }
  if (!AP.info.on) {
    return apShell(html`<h1>Birim başvurusu</h1><p class="sub">Yeni birim başvuruları şu anda alınmıyor. Biriminiz portalı kullanıyorsa birim yöneticinizden davet isteyin.</p>
      <button class="btn block" data-act="ap-login">Giriş ekranına dön</button>`);
  }
  if (AP.info.verified) { AP.email = AP.info.verified; AP.step = 'form'; } else if (AP.step === 'form') AP.step = 'email';
  apDraw();
}
function apShell(inner) { setHTML(APP(), authLayout(html`<div class="auth-brand">${brandLogo()}</div>${inner}`)); }

function apSteps() {
  const st = ['E-posta', 'Bilgiler', 'İnceleme'];
  const cur = AP.step === 'form' ? 1 : AP.step === 'done' ? 2 : 0;
  return html`<ol class="ap-steps">${st.map((t, i) => html`<li class="${i < cur ? 'done' : i === cur ? 'on' : ''}"><span>${i < cur ? icon('check', 'sm') : i + 1}</span>${t}</li>`)}</ol>`;
}

function apDraw() {
  const I = AP.info || {};
  if (AP.step === 'email' || AP.step === 'code') {
    return apShell(html`<h1>Birim açma başvurusu</h1>
      <p class="sub">Biriminiz portalda yoksa başvurun. Her başvuru sistem yöneticisi tarafından incelenir; onaylanınca biriminiz açılır ve giriş bilgileriniz e-postanıza gelir.</p>
      ${apSteps()}
      ${I.notice ? html`<div class="mk-box info" style="margin-bottom:12px">${icon('info', 'sm')}<span>${I.notice}</span></div>` : ''}
      ${AP.step === 'email' ? html`<form class="stack" data-form="ap-email">
          <div class="field"><label>İş e-postanız</label><input class="input" type="email" name="email" autocomplete="email" required value="${AP.email}" placeholder="ad.soyad@saglik.gov.tr">
            <div class="tiny faint" style="margin-top:4px">Kurum e-postası (ör. saglik.gov.tr) başvurunuzu hızlandırır. Bu adres birimin yönetici hesabı olur.</div></div>
          <input class="ap-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="form-error hidden" data-err></div>
          <button class="btn primary block" type="submit">Doğrulama kodu gönder</button></form>`
      : html`<form class="stack" data-form="ap-code">
          <p class="small"><b>${AP.email}</b> adresine 6 haneli kod gönderdik. Gelmediyse istenmeyen (spam) klasörüne bakın.</p>
          <div class="field"><label>Doğrulama kodu</label><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus></div>
          <div class="form-error hidden" data-err></div>
          <button class="btn primary block" type="submit">Doğrula</button>
          <p class="tiny faint" style="text-align:center"><a href="#" data-act="ap-back">E-postayı değiştir</a> · <a href="#" data-act="ap-resend">Kodu yeniden gönder</a></p></form>`}
      <p class="small muted" style="margin-top:18px;text-align:center">Hesabınız var mı? <a href="#" data-act="ap-login">Giriş yapın</a></p>`);
  }
  if (AP.step === 'done') return apDone();
  apForm();
}
ACT['ap-back'] = () => { AP.step = 'email'; apDraw(); };
ACT['ap-resend'] = async () => { try { await api('apply.code', { email: AP.email }); toast('Yeni kod gönderildi'); } catch (e) { toast(e.message, 'err'); } };

FORMS['ap-email'] = (f) => submitForm(f, async (d) => {
  AP.email = d.email.trim().toLowerCase();
  const r = await api('apply.code', d);
  if (r.pending) {
    return apShell(html`<h1>Başvurunuz zaten incelemede</h1><p class="sub">Bu e-postayla açılmış bir başvuru var. Durum bağlantısını <b>${AP.email}</b> adresine yeniden gönderdik.</p>
      <button class="btn block" data-act="ap-login">Giriş ekranına dön</button>`);
  }
  if (r.nomail) { AP.nomail = true; AP.step = 'form'; } else AP.step = 'code';
  apDraw();
});
FORMS['ap-code'] = (f) => submitForm(f, async (d) => { await api('apply.verify', d); AP.step = 'form'; AP.nomail = false; apDraw(); });

function apForm() {
  const I = AP.info || {};
  apShell(html`<h1>Birim bilgileri</h1>
    <p class="sub">Bilgilerin doğruluğu kontrol edilir; gerektiğinde size telefonla ulaşılır.</p>
    ${apSteps()}
    ${AP.nomail ? html`<div class="mk-box warn" style="margin-bottom:12px">${icon('alert', 'sm')}<span>E-posta doğrulaması şu an yapılamıyor; başvurunuz telefonla doğrulanabilir.</span></div>` : ''}
    <form class="stack" data-form="ap-submit" id="apForm">
      <div class="ap-sec">Hastane</div>
      <div class="field ${AP.other ? 'hidden' : ''}" id="apHospF"><label>Hastanenizi arayın</label>
        <div class="search">${icon('search')}<input class="input" id="apHq" autocomplete="off" placeholder="Hastane adının bir kısmını yazın" value="${AP.hosp ? AP.hosp.name : ''}" data-input="ap-hq"></div>
        <div class="ap-hlist" id="apHl"></div></div>
      <label class="switch"><input type="checkbox" id="apOther" data-change="ap-other" ${AP.other ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Hastanem listede yok</b><span>Hastanenizden ilk kez başvuruluyor</span></span></label>
      <div class="grid2 ${AP.other ? '' : 'hidden'}" id="apNewH">
        <div class="field"><label>Hastanenin tam adı</label><input class="input" name="hospital_name" maxlength="160" placeholder="Örn: … Eğitim ve Araştırma Hastanesi"></div>
        <div class="field"><label>İl</label><input class="input" name="city" maxlength="60"></div></div>
      <div id="apUnits"></div>
      <div class="ap-sec">Birim</div>
      <div class="grid2"><div class="field"><label>Birim adı</label><input class="input" name="unit_name" required maxlength="120" placeholder="Örn: Yoğun Bakım, Acil Servis"></div>
        <div class="field"><label>Yaklaşık kişi sayısı</label><input class="input" name="staff" type="number" min="1" max="2000" inputmode="numeric"></div></div>
      <div class="ap-sec">Siz</div>
      <div class="grid2"><div class="field"><label>Ad soyad</label><input class="input" name="name" autocomplete="name" required minlength="5" maxlength="120"></div>
        <div class="field"><label>Unvan</label><input class="input" name="title" list="apTitles" required maxlength="60" placeholder="Örn: Hemşire, Uzman Dr."><datalist id="apTitles">${['Hemşire', 'Sorumlu Hemşire', 'Ebe', 'Sağlık Memuru', 'Dr.', 'Uzman Dr.', 'Doç. Dr.', 'Prof. Dr.'].map((t) => html`<option value="${t}">`)}</datalist></div></div>
      <div class="grid2"><div class="field"><label>Birimdeki göreviniz</label><select class="select" name="duty" required><option value="">Seçin</option>${AP_DUTY.map((t) => html`<option>${t}</option>`)}</select></div>
        <div class="field"><label>Cep telefonu</label><input class="input" name="phone" type="tel" autocomplete="tel" required placeholder="05xx xxx xx xx"></div></div>
      ${I.doc !== 'off' ? html`<div class="field"><label>Görevlendirme belgesi ya da kurum kimlik kartı ${I.doc === 'required' ? '' : html`<span class="faint">(isteğe bağlı, başvurunuzu hızlandırır)</span>`}</label>
        <input class="input" type="file" id="apDoc" accept="application/pdf,image/jpeg,image/png" data-change="ap-doc">
        <div class="tiny faint" style="margin-top:4px">PDF, JPG ya da PNG, en fazla 3 MB. Belge şifreli saklanır, yalnız sistem yöneticisi görür ve karar verilince silinir. T.C. kimlik numarasını kapatabilirsiniz.</div></div>` : ''}
      <div class="field"><label>Eklemek istedikleriniz <span class="faint">(isteğe bağlı)</span></label><textarea class="textarea" name="note" rows="2" maxlength="1000" placeholder="Örn: Birimimizde nöbet listesi Excel'de hazırlanıyor"></textarea></div>
      <input class="ap-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="ml-opt"><input type="checkbox" name="declare"><span class="small">Bu birimde yetkili olduğumu (ya da birim yöneticisinin bilgisiyle başvurduğumu) ve bilgilerin doğru olduğunu beyan ederim.</span></label>
      <label class="ml-opt"><input type="checkbox" name="kvkk"><span class="small">Aydınlatma metnini okudum, onaylıyorum.${S.legal && S.legal.on ? html` <a href="yasal.php?s=kvkk" target="_blank" rel="noopener">Tam metin</a> · <a href="yasal.php?s=kosullar" target="_blank" rel="noopener">Kullanım koşulları</a>` : ''}
        <details class="tiny" style="margin-top:6px"><summary>Aydınlatma metni</summary><div class="faint" style="margin-top:6px;line-height:1.5">Ad, unvan, görev, iletişim bilgileriniz ve eklediğiniz belge yalnız birim açma başvurunuzu değerlendirmek ve sizinle iletişim kurmak için işlenir. Başvurunun gerçekliğini doğrulamak için adınız, unvanınız ve birim adı hastanenizdeki diğer birimlerin yöneticilerine gösterilebilir; telefon ve e-postanız gösterilmez. Belge şifreli saklanır ve karar verilince silinir. Reddedilen ya da geri çekilen başvurular 90 gün sonra, onaylanan başvuruların iletişim ayrıntıları 1 yıl sonra silinir. Başvurunuzu durum sayfasından istediğiniz an geri çekip silebilirsiniz.</div></details></span></label>
      <div class="form-error hidden" data-err></div>
      <button class="btn primary block" type="submit">Başvuruyu gönder</button>
      <p class="tiny faint" style="text-align:center">${AP.email} adına · <a href="#" data-act="ap-back">E-postayı değiştir</a></p>
    </form>`);
  if (AP.hosp) apLoadUnits();
}

let apHqT = 0;
CHANGE['ap-hq'] = (el) => {
  AP.hosp = null; setHTML($('#apUnits'), '');
  clearTimeout(apHqT);
  apHqT = setTimeout(async () => {
    const box = $('#apHl'); if (!box) return;
    const q = el.value.trim();
    if (q.length < 2) { setHTML(box, ''); return; }
    try {
      const r = await api('apply.hospitals', { q });
      setHTML(box, r.items.length ? html`${r.items.map((h) => html`<button type="button" class="list-row" data-act="ap-hpick" data-id="${h.id}" data-n="${h.name}">${icon('building', 'sm')}<span>${h.name}</span></button>`)}`
        : html`<div class="tiny faint" style="padding:8px 2px">Bulunamadı. Hastaneniz portalda ilk kez açılacaksa “Hastanem listede yok” seçeneğini açın.</div>`);
    } catch (e) { setHTML(box, html`<div class="tiny" style="color:var(--danger)">${e.message}</div>`); }
  }, 280);
};
ACT['ap-hpick'] = (el) => { AP.hosp = { id: +el.dataset.id, name: el.dataset.n }; $('#apHq').value = AP.hosp.name; setHTML($('#apHl'), ''); apLoadUnits(); };
async function apLoadUnits() {
  const box = $('#apUnits'); if (!box || !AP.hosp) return;
  try {
    const r = await api('apply.units', { hospital_id: AP.hosp.id });
    setHTML(box, r.items.length ? html`<div class="mk-box info">${icon('info', 'sm')}<span><b>${AP.hosp.name}</b> içinde portalı kullanan birimler: ${r.items.join(', ')}.<br>Biriminiz bunlardan biriyse yeni başvuru yapmayın; o birimin yöneticisinden davet isteyin.</span></div>`
      : html`<div class="mk-box ok">${icon('checkCircle', 'sm')}<span>${AP.hosp.name} seçildi. Bu hastanede henüz portalı kullanan birim yok.</span></div>`);
  } catch (e) { setHTML(box, ''); }
}
CHANGE['ap-other'] = (el) => {
  AP.other = el.checked;
  $('#apHospF').classList.toggle('hidden', AP.other); $('#apNewH').classList.toggle('hidden', !AP.other);
  if (AP.other) { AP.hosp = null; setHTML($('#apUnits'), ''); }
};
CHANGE['ap-doc'] = async (el) => {
  AP.doc = null;
  const f = el.files && el.files[0]; if (!f) return;
  try { AP.doc = await apReadDoc(f); } catch (e) { el.value = ''; toast(e.message, 'err'); }
};
/** Fotoğraf küçültülür (en fazla 1800 piksel, JPEG); PDF olduğu gibi gider */
async function apReadDoc(f) {
  const toData = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Dosya okunamadı.')); r.readAsDataURL(b); });
  if (f.type === 'application/pdf') {
    if (f.size > 3 * 1024 * 1024) throw new Error('PDF en fazla 3 MB olabilir.');
    return { data: await toData(f), name: f.name };
  }
  if (!/^image\/(jpeg|png)$/.test(f.type)) throw new Error('PDF, JPG ya da PNG seçin.');
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Fotoğraf açılamadı.')); i.src = URL.createObjectURL(f); });
  const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('Fotoğraf çok büyük.');
  return { data: await toData(blob), name: f.name.replace(/\.\w+$/, '') + '.jpg' };
}

FORMS['ap-submit'] = (f) => submitForm(f, async (d) => {
  if (!AP.other && !AP.hosp) throw new Error('Hastanenizi listeden seçin ya da “Hastanem listede yok” seçeneğini açın.');
  if (!d.declare) throw new Error('Beyan kutusunu işaretleyin.');
  if (!d.kvkk) throw new Error('Aydınlatma metnini onaylayın.');
  if (AP.info.doc === 'required' && !AP.doc) throw new Error('Belge ekleyin.');
  const body = { ...d, hospital_id: AP.other ? 0 : AP.hosp.id };
  if (AP.other) { body.hospital_id = 0; } else { delete body.hospital_name; delete body.city; }
  if (AP.doc) { body.doc = AP.doc.data; body.doc_name = AP.doc.name; }
  let r = await api('apply.submit', body);
  if (r.dup) {
    const go = await confirmDialog({ title: 'Bu birim zaten var gibi', text: `${AP.hosp ? AP.hosp.name : 'Bu hastane'} içinde “${r.dup}” birimi portalı kullanıyor. Aynı birimse yöneticisinden davet isteyin. Farklı bir birimse başvurunuzu yine de gönderebilirsiniz.`, ok: 'Farklı birim, gönder' });
    if (!go) return;
    r = await api('apply.submit', { ...body, dup_ok: true });
  }
  AP.token = r.token; AP.step = 'done'; AP.doc = null;
  apDone();
});

function apDone() {
  const link = location.origin + location.pathname + '#/basvuru/' + AP.token;
  apShell(html`<div class="e-ico" style="margin:0 0 14px;background:var(--success-soft);color:var(--success);width:52px;height:52px;border-radius:14px;display:grid;place-items:center">${icon('checkCircle', 'lg')}</div>
    <h1>Başvurunuz alındı</h1>${apSteps()}
    <p class="sub">Sistem yöneticisi başvurunuzu inceleyecek${AP.info && AP.info.peer ? '; gerekirse hastanenizdeki diğer birim yöneticilerine de teyit sorulur' : ''}. Sonuç <b>${AP.email}</b> adresine gelir.</p>
    <div class="field"><label>Başvuru takip bağlantınız (kimseyle paylaşmayın)</label><div class="row" style="gap:6px"><input class="input grow" readonly value="${link}"><button class="btn" data-act="ap-copy" data-v="${link}">${icon('copy', 'sm')}</button></div></div>
    <a class="btn block" href="#/basvuru/${AP.token}">Başvurumu gör</a>`);
}
ACT['ap-copy'] = async (el) => toast((await copyText(el.dataset.v)) ? 'Kopyalandı' : el.dataset.v);

/* ---------------- Durum sayfası ---------------- */
async function apStatus(tok) {
  let a;
  try { a = (await api('apply.status', { token: tok })).app; } catch (e) {
    return apShell(html`<h1>Başvuru bulunamadı</h1><p class="sub">${e.message}</p><button class="btn block" data-act="ap-login">Giriş ekranına dön</button>`);
  }
  AP.token = tok;
  apShell(html`<h1>Birim başvurunuz</h1>
    <div class="card card-pad stack" style="gap:8px;margin:10px 0 14px">
      <div class="row" style="justify-content:space-between;gap:8px"><b>${a.unit}</b><span class="badge ${AP_TONE[a.status] || ''}">${a.status_txt}</span></div>
      <div class="small muted">${a.hospital}</div>
      <div class="tiny faint">${a.name} · ${a.email} · başvuru ${fmtDate(a.created_at, true)}</div></div>
    ${a.status === 'pending' ? html`<p class="small">Başvurunuz incelemede. Sonuç e-postanıza gelecek; bu sayfadan da takip edebilirsiniz.</p>` : ''}
    ${a.msg ? html`<div class="mk-box ${a.status === 'rejected' ? 'warn' : 'info'}" style="margin-bottom:12px">${icon('chat', 'sm')}<span><b>Sistem yöneticisi:</b> ${a.msg}</span></div>` : ''}
    ${a.status === 'info' ? html`<form class="stack" data-form="ap-reply">
        <div class="field"><label>Yanıtınız</label><textarea class="textarea" name="text" rows="3" maxlength="1500"></textarea></div>
        ${a.doc_mode !== 'off' ? html`<div class="field"><label>Belge ${a.has_doc ? html`<span class="faint">(yeni belge eskisinin yerine geçer)</span>` : ''}</label><input class="input" type="file" accept="application/pdf,image/jpeg,image/png" data-change="ap-doc"></div>` : ''}
        <div class="form-error hidden" data-err></div><button class="btn primary block" type="submit">Gönder</button></form>` : ''}
    ${a.status === 'approved' ? html`<p class="small">Biriminiz açıldı. Geçici şifreniz e-postanıza gönderildi${a.link ? '' : ''}; ilk girişte kendi şifrenizi belirleyeceksiniz.</p>
        ${a.link ? html`<a class="btn primary block" href="${a.link}">Birimime giriş yap</a>` : ''}` : ''}
    ${a.status === 'rejected' ? html`<button class="btn block" data-act="ap-new">Yeni başvuru yap</button>` : ''}
    ${['pending', 'info'].includes(a.status) ? html`<p class="tiny faint" style="text-align:center;margin-top:16px"><a href="#" data-act="ap-withdraw" style="color:var(--danger)">Başvurumu geri çek ve sil</a></p>` : ''}
    <p class="small muted" style="margin-top:14px;text-align:center"><a href="#" data-act="ap-login">Giriş ekranı</a></p>`);
}
ACT['ap-new'] = () => { AP.step = 'email'; location.hash = '#/basvuru'; };
FORMS['ap-reply'] = (f) => submitForm(f, async (d) => {
  const body = { token: AP.token, text: d.text };
  if (AP.doc) { body.doc = AP.doc.data; body.doc_name = AP.doc.name; }
  await api('apply.reply', body);
  AP.doc = null; toast('Yanıtınız gönderildi'); apStatus(AP.token);
});
ACT['ap-withdraw'] = async () => {
  if (!(await confirmDialog({ title: 'Başvuru geri çekilsin mi?', text: 'Başvurunuz ve eklediğiniz belge hemen silinir. İsterseniz sonra yeniden başvurabilirsiniz.', ok: 'Geri çek ve sil', danger: true }))) return;
  try { await api('apply.withdraw', { token: AP.token }); toast('Başvurunuz silindi'); ACT['ap-login'](); } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Aynı hastanedeki birim yöneticisi: teyit kartı ---------------- */
NM_EXT.notif.apply = ['sky', 'building'];
NM_EXT.audit['apply.vote'] = 'Birim başvurusuna teyit verdi';
NM_EXT.homeCards.push({
  id: 'apply-peer', title: 'Hastanenizde birim başvurusu', icon: 'building', order: 4, place: 'top',
  visible: () => !!(S.apply_peer && S.apply_peer.length),
  render: (el) => apPeerDraw(el),
});
function apPeerDraw(el) {
  const L = S.apply_peer || [];
  if (!L.length) { el.remove(); return; }
  const VT = { yes: 'Tanıyorum dediniz', no: 'Tanımıyorum dediniz' };
  setHTML(el, html`<div class="card"><div class="card-head"><div><h3>${icon('building', 'sm')} Hastanenizde birim başvurusu</h3>
      <div class="tiny faint">Bu kişiyi tanıyor musunuz? Yanıtınız yalnız sistem yöneticisine gider ve sahte başvuruları ayıklamaya yardım eder.</div></div></div>
    <div class="list">${L.map((a) => html`<div class="list-row ap-peer"><div class="grow" style="min-width:0"><div class="lr-t">${a.name} <span class="faint">· ${a.title}</span></div>
        <div class="lr-s">“${a.unit}” birimini açmak istiyor · ${a.duty} · ${fmtRel(a.created_at)}</div></div>
      ${a.vote ? html`<span class="badge ${a.vote === 'yes' ? 'success' : 'warn'}">${VT[a.vote]}</span><button class="btn sm ghost" data-act="ap-vote" data-id="${a.id}" data-v="skip">Değiştir</button>`
        : html`<div class="row" style="gap:6px"><button class="btn sm primary" data-act="ap-vote" data-id="${a.id}" data-v="yes">${icon('check', 'sm')}<span>Tanıyorum</span></button>
          <button class="btn sm" data-act="ap-vote" data-id="${a.id}" data-v="no">Tanımıyorum</button></div>`}</div>`)}</div></div>`);
}
ACT['ap-vote'] = (el) => busy(el, async () => {
  let note = '';
  if (el.dataset.v === 'no') {
    note = await promptDialog({ title: 'Tanımıyorum', label: 'Not (isteğe bağlı, yalnız sistem yöneticisi görür)', placeholder: 'Örn: Hastanemizde böyle bir birim yok' });
    if (note === null) return;
  }
  const r = await api('peer.apply.vote', { id: +el.dataset.id, vote: el.dataset.v, note });
  S.apply_peer = r.items;
  const card = el.closest('[data-card]');
  apPeerDraw(card);
  if (el.dataset.v !== 'skip') toast('Teşekkürler, yanıtınız iletildi');
});

/* ---------------- Sistem yöneticisi: Başvurular ---------------- */
const APS = { filter: 'open', d: null, cfgOpen: false };
async function apSaRender(box) {
  box = box || $('#sysBody'); if (!box) return;
  try { APS.d = await api('sa.apply.list', { filter: APS.filter }); } catch (e) {
    if (e.status === 401) { S.sa = null; return start(); }
    setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return;
  }
  SYS.applyOpen = APS.d.open; sysTabBadge();
  apSaDraw(box);
}
function apSaDraw(box) {
  const D = APS.d; const c = D.cfg;
  const sw = (k, t, sub) => html`<label class="switch"><input type="checkbox" data-apc="${k}" ${c[k] === '1' ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>${t}</b><span>${sub}</span></span></label>`;
  setHTML(box, html`<div class="stack">
    <div class="card card-pad stack">
      <div class="row wrap" style="justify-content:space-between;gap:8px"><div><h3 style="font-size:15px;margin:0">${icon('sliders', 'sm')} Başvuru ayarları</h3>
        <div class="tiny faint">${c.on === '1' ? html`Başvuru formu <b>açık</b>: ${c.link}` : 'Başvuru formu kapalı; giriş ekranında görünmez.'}</div></div>
        <div class="row" style="gap:6px">${c.on === '1' ? html`<button class="btn sm" data-act="ap-copy" data-v="${c.link}">${icon('link', 'sm')}<span>Bağlantıyı kopyala</span></button>` : ''}
          <button class="btn sm ghost" data-act="aps-cfg">${APS.cfgOpen ? 'Gizle' : 'Ayarlar'}</button></div></div>
      ${APS.cfgOpen ? html`
        ${sw('on', 'Birim başvurularını kabul et', 'Giriş ekranında “Biriminiz yok mu? Başvurun” bağlantısı görünür. Hiçbir birim siz onaylamadan açılmaz.')}
        ${sw('peer', 'Aynı hastanedeki birim yöneticilerine sor', 'Başvurulan hastanede portalı kullanan birimlerin yöneticilerine “Bu kişiyi tanıyor musunuz?” diye sorulur (telefon ve e-posta gösterilmez).')}
        <div class="grid2"><div class="field"><label>Görevlendirme belgesi / kurum kimlik kartı</label><select class="select" data-apc="doc">${[['off', 'İsteme'], ['optional', 'İsteğe bağlı'], ['required', 'Zorunlu']].map(([v, l]) => html`<option value="${v}" ${c.doc === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
          <div class="field"><label>Başvuru e-postaları hangi birimin e-posta ayarıyla gitsin</label><select class="select" data-apc="mail_tkey"><option value="">Otomatik (e-postası ayarlı ilk birim)</option>${D.tenants.map((t) => html`<option value="${t.key}" ${c.mail_tkey === t.key ? raw('selected') : ''}>${t.name}</option>`)}</select>
            <div class="tiny ${c.mail_src ? 'faint' : ''}" style="margin-top:4px;${c.mail_src ? '' : 'color:var(--warn)'}">${c.mail_src ? 'Şu an: ' + c.mail_src : 'Hiçbir birimde e-posta ayarı yok: doğrulama kodu gönderilemez, başvurular “e-posta doğrulanmadı” işaretiyle gelir.'}</div></div></div>
        <div class="field"><label>Kurumsal e-posta alan adları (güven işareti)</label><textarea class="textarea" data-apc="domains" rows="3">${c.domains}</textarea><div class="tiny faint">Her satıra bir alan adı; alt alan adları da sayılır (ör. gov.tr → saglik.gov.tr).</div></div>
        <div class="field"><label>Formda görünecek not</label><input class="input" data-apc="notice" value="${c.notice}" maxlength="500" placeholder="Örn: Başvurular 1-2 iş günü içinde incelenir."></div>
        <div><button class="btn primary" data-act="aps-save">Kaydet</button></div>` : ''}
    </div>
    <div class="seg" role="tablist">${[['open', `Bekleyen${D.open ? ' (' + D.open + ')' : ''}`], ['done', 'Sonuçlanan'], ['all', 'Tümü']].map(([k, l]) => html`<button class="${APS.filter === k ? 'on' : ''}" data-act="aps-f" data-f="${k}">${l}</button>`)}</div>
    ${D.items.length ? D.items.map(apSaCard) : html`<div class="card empty"><h3>${APS.filter === 'open' ? 'Bekleyen başvuru yok' : 'Kayıt yok'}</h3>${c.on === '1' ? '' : html`<p class="small">Başvuru formu kapalı. “Ayarlar”dan açabilirsiniz.</p>`}</div>`}
  </div>`);
}
const AP_LVL = { strong: ['success', 'Güçlü doğrulama'], normal: ['info', 'Olağan'], weak: ['warn', 'Dikkat'] };
function apSaCard(a) {
  const sig = (ok, t) => html`<li class="${ok === true ? 'ok' : ok === false ? 'bad' : ''}">${icon(ok === true ? 'checkCircle' : ok === false ? 'alert' : 'info', 'sm')}<span>${t}</span></li>`;
  const open = ['pending', 'info'].includes(a.status);
  const [lt, ll] = AP_LVL[a.level];
  return html`<div class="card ap-card">
    <div class="card-head"><div style="min-width:0"><h3 class="ellipsis">${a.unit}</h3>
        <div class="tiny faint">${a.hospital}${a.new_hospital ? html` <span class="badge info">yeni hastane${a.city ? ' · ' + a.city : ''}</span>` : ''} · ${fmtDateTime(a.created_at)}</div></div>
      <div class="row" style="gap:6px;flex:none"><span class="badge ${AP_TONE[a.status] || ''}">${a.status_txt}</span>${open ? html`<span class="badge ${lt}">${ll}</span>` : ''}</div></div>
    <div class="card-pad ap-body">
      <div class="ap-who"><b>${a.name}</b> · ${a.title} · ${a.duty}<br>
        <a href="mailto:${a.email}">${a.email}</a>${a.phone ? html` · <a href="tel:${a.phone}">${a.phone}</a>` : ''}${a.staff ? ` · ~${a.staff} kişi` : ''}</div>
      <ul class="ap-sig">
        ${sig(a.email_ok, a.email_ok ? 'E-posta kodla doğrulandı' : 'E-posta doğrulanmadı (telefonla teyit edin)')}
        ${sig(a.corp ? true : a.free ? null : null, a.corp ? `Kurumsal e-posta (${a.domain})` : a.free ? `Kişisel e-posta (${a.domain})` : `Alan adı: ${a.domain}`)}
        ${a.new_hospital ? sig(null, a.hospital_match ? `Yeni hastane yazılmış; mevcut “${a.hospital_match.name}” ile aynı olabilir` : 'Hastane portalda yok (teyit soracak birim yok)')
          : sig(a.yes > 0 && !a.no ? true : a.no ? false : null, a.votes.length ? `Hastaneden teyit: ${a.yes} tanıyor · ${a.no} tanımıyor` : 'Hastanedeki birim yöneticilerinden henüz yanıt yok')}
        ${a.votes.map((v) => html`<li class="sub">${v.vote === 'yes' ? '✓' : '✗'} ${v.who} (${v.unit})${v.note ? ' — ' + v.note : ''}</li>`)}
        ${a.dup ? sig(false, `Bu hastanede “${a.dup}” birimi zaten var`) : ''}
        ${a.same_ip ? sig(a.same_ip >= 2 ? false : null, `Aynı internet bağlantısından son 30 günde ${a.same_ip} başvuru daha`) : ''}
        ${a.doc ? html`<li class="ok">${icon('paperclip', 'sm')}<span>Belge: <a href="api.php?action=sa.apply.doc&id=${a.id}" target="_blank" rel="noopener">${a.doc.name} (${Math.max(1, Math.round(a.doc.size / 1024))} KB) — görüntüle</a></span></li>` : ''}
      </ul>
      ${a.note ? html`<div class="small"><span class="faint">Not:</span> ${a.note}</div>` : ''}
      ${a.sa_msg ? html`<div class="small"><span class="faint">Başvurana mesajınız:</span> ${a.sa_msg}</div>` : ''}
      ${a.reply ? html`<div class="small" style="white-space:pre-line"><span class="faint">Başvuranın yanıtı:</span> ${a.reply}</div>` : ''}
      ${a.sa_note ? html`<div class="small"><span class="faint">İç not:</span> ${a.sa_note}</div>` : ''}
      ${a.status === 'approved' ? html`<div class="small faint">${a.decided_by || ''} onayladı · ${fmtDateTime(a.decided_at)}${a.tenant ? ' · birim: ' + a.tenant : ''}</div>` : ''}
      ${['rejected', 'spam'].includes(a.status) ? html`<div class="small faint">${a.decided_by || ''} · ${fmtDateTime(a.decided_at)}</div>` : ''}
    </div>
    <div class="ap-acts">${open ? html`<button class="btn sm primary" data-act="aps-ok" data-id="${a.id}">${icon('check', 'sm')}<span>Onayla ve birimi aç</span></button>
        <button class="btn sm" data-act="aps-do" data-x="info" data-id="${a.id}">${icon('chat', 'sm')}<span>Bilgi iste</span></button>
        <button class="btn sm" data-act="aps-do" data-x="reject" data-id="${a.id}">Reddet</button>` : ''}
      ${['rejected', 'spam'].includes(a.status) ? html`<button class="btn sm" data-act="aps-do" data-x="reopen" data-id="${a.id}">Yeniden aç</button>` : ''}
      <button class="btn sm icon ghost" data-act="aps-more" data-id="${a.id}" aria-label="Diğer işlemler">${icon('more', 'sm')}</button></div>
  </div>`;
}
function apsFind(id) { return APS.d.items.find((x) => x.id === +id); }
ACT['aps-f'] = (el) => { APS.filter = el.dataset.f; apSaRender(); };
ACT['aps-cfg'] = () => { APS.cfgOpen = !APS.cfgOpen; apSaDraw($('#sysBody')); };
ACT['aps-save'] = (el) => busy(el, async () => {
  const o = {};
  $$('[data-apc]').forEach((x) => { o[x.dataset.apc] = x.type === 'checkbox' ? x.checked : x.value; });
  try { await api('sa.apply.cfg', o); toast('Kaydedildi'); apSaRender(); } catch (e) { toast(e.message, 'err'); }
});
ACT['aps-more'] = (el) => {
  const a = apsFind(el.dataset.id);
  sysMenu(el, [
    { label: 'İç not', icon: 'edit', run: async () => { const v = await promptDialog({ title: 'İç not', label: 'Yalnız sistem yöneticileri görür', value: a.sa_note, multiline: true }); if (v !== null) apsDo(a, 'note', { msg: v }); } },
    ...(['pending', 'info'].includes(a.status) ? [{ label: 'Geçersiz (sahte / anlamsız)', icon: 'alert', danger: true, run: () => apsSpam(a) }] : []),
    { label: 'Kalıcı olarak sil', icon: 'trash', danger: true, run: async () => { if (await confirmDialog({ title: 'Başvuru silinsin mi?', text: 'Başvuru, belge ve teyitler kalıcı olarak silinir.', ok: 'Sil', danger: true })) apsDo(a, 'delete'); } },
  ]);
};
async function apsSpam(a) {
  const m = openModal({ title: 'Geçersiz başvuru', size: 'narrow', body: html`<p class="small">Başvuru kapatılır ve belge silinir; başvurana e-posta gitmez.</p>
      <label class="ml-opt"><input type="checkbox" id="apBlock" checked><span class="small">Bu e-posta adresi bir daha başvuru yapamasın</span></label>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn solid-danger" id="apSpamOk">Geçersiz say</button>` });
  $('#apSpamOk', m.el).addEventListener('click', () => { const block = $('#apBlock', m.el).checked; m.close(); apsDo(a, 'spam', { block }); });
}
ACT['aps-do'] = async (el) => {
  const a = apsFind(el.dataset.id); const x = el.dataset.x;
  if (x === 'reopen') return apsDo(a, 'reopen');
  const v = await promptDialog(x === 'info'
    ? { title: 'Başvurandan bilgi iste', label: 'Mesajınız (e-postayla gider, başvuran durum sayfasından yanıtlar)', placeholder: 'Örn: Görevlendirme yazınızı ya da kurum kimlik kartınızı ekler misiniz?', multiline: true, ok: 'Gönder' }
    : { title: 'Başvuruyu reddet', label: 'Gerekçe (başvurana e-postayla gider)', placeholder: 'Örn: Başvuran birimin yetkilisi olarak doğrulanamadı.', multiline: true, ok: 'Reddet', danger: true });
  if (v === null) return;
  apsDo(a, x, { msg: v });
};
async function apsDo(a, act, extra = {}) {
  try {
    const r = await api('sa.apply.decide', { id: a.id, act, ...extra });
    toast(act === 'info' || act === 'reject' ? (r.mailed ? 'Kaydedildi, başvurana e-posta gönderildi' : 'Kaydedildi (e-posta gönderilemedi)') : 'Kaydedildi');
    apSaRender();
  } catch (e) { toast(e.message, 'err'); }
}
ACT['aps-ok'] = (el) => {
  const a = apsFind(el.dataset.id); const D = APS.d;
  const hSel = a.hospital_id || (a.hospital_match ? a.hospital_match.id : 0);
  const m = openModal({ title: 'Başvuruyu onayla', body: html`<form class="stack" id="apOkF">
      <p class="small muted">Onaylanınca birim açılır ve başvuran birim yöneticisi olur. Geçici şifre e-postayla gider (ya da size bir kez gösterilir); ilk girişte kendi şifresini belirler.${a.level === 'weak' ? html`<br><b style="color:var(--warn)">Doğrulama zayıf: onaylamadan önce başvuranı ya da hastaneyi telefonla aramanız önerilir.</b>` : ''}</p>
      <div class="field"><label>Hastane</label><select class="select" name="hospital_id"><option value="0" ${hSel ? '' : raw('selected')}>Yeni hastane aç: ${a.hospital}</option>${D.hospitals.map((h) => html`<option value="${h.id}" ${hSel === h.id ? raw('selected') : ''}>${h.name}</option>`)}</select></div>
      <div class="field"><label>Yeni hastane adı (yeni açılacaksa)</label><input class="input" name="hospital_name" value="${a.new_hospital ? a.hospital : ''}" maxlength="160"></div>
      <div class="field"><label>Birim adı</label><input class="input" name="unit_name" value="${a.unit}" required maxlength="120"></div>
      <div class="grid2"><div class="field"><label>Yönetici ad soyad</label><input class="input" name="admin_name" value="${a.name}" required></div>
        <div class="field"><label>Yönetici e-postası</label><input class="input" value="${a.email}" disabled></div></div>
      <div class="field"><label>Başvurana not <span class="faint">(isteğe bağlı, durum sayfasında görünür)</span></label><input class="input" name="msg" maxlength="1000"></div>
      <label class="ml-opt"><input type="checkbox" name="send_email" ${D.cfg.mail_src ? raw('checked') : raw('disabled')}><span class="small">Giriş bilgilerini e-postayla gönder${D.cfg.mail_src ? '' : ' (e-posta ayarı yok)'}</span></label>
      ${a.dup ? html`<label class="ml-opt"><input type="checkbox" name="dup_ok"><span class="small">“${a.dup}” birimi zaten var; yine de ayrı birim olarak aç</span></label>` : ''}
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" form="apOkF" type="submit">Onayla ve birimi aç</button>` });
  const f = $('#apOkF', m.el);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); submitForm(f, async (d) => {
    const r = await api('sa.apply.approve', { id: a.id, ...d, hospital_id: +d.hospital_id });
    m.close();
    openModal({ title: 'Birim açıldı', size: 'narrow', body: html`<div class="stack">
        <p class="small">${r.mailed ? 'Giriş bilgileri başvurana e-postayla gönderildi.' : 'E-posta gönderilmedi. Aşağıdaki geçici şifreyi başvurana güvenli bir yoldan (telefonla) iletin; bir daha gösterilmez.'}</p>
        ${r.mailed ? '' : html`<div class="field"><label>Geçici şifre</label><input class="input sel" readonly value="${r.password}"></div>`}
        <div class="field"><label>Birimin giriş bağlantısı</label><div class="row" style="gap:6px"><input class="input grow" readonly value="${r.link}"><button class="btn" data-act="ap-copy" data-v="${r.link}">${icon('copy', 'sm')}</button></div></div></div>`,
      foot: html`<button class="btn primary" data-close>Tamam</button>` });
    apSaRender();
  }); });
};
