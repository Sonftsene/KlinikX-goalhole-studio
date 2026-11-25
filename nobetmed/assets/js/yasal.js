/* dupcii — tanıtım / yasal sayfalar, aydınlatma metni, Hesabım › Verilerim, sunucu dışı yedek (4.17).
   Düzenleme: çok birimlide sistem yöneticisi (Site ve yedek sekmesi), tek birimlide birim yöneticisi (Ayarlar). */
'use strict';

const LG_PAGES = { kvkk: 'KVKK Aydınlatma Metni', gizlilik: 'Gizlilik ve Çerez Politikası', kosullar: 'Kullanım Koşulları', satis: 'Mesafeli Hizmet Sözleşmesi', iade: 'İptal ve İade Koşulları' };

/** Giriş / kayıt ekranının altındaki bağlantılar */
function legalLinks() {
  if (!S.legal || !S.legal.on) return '';
  return html`<p class="lg-links tiny"><a href="tanitim.php" target="_blank" rel="noopener">Tanıtım</a><a href="yasal.php?s=kvkk" target="_blank" rel="noopener">KVKK</a><a href="yasal.php?s=gizlilik" target="_blank" rel="noopener">Gizlilik</a><a href="yasal.php?s=kosullar" target="_blank" rel="noopener">Kullanım koşulları</a></p>`;
}

/* ---------------- Aydınlatma metni bildirimi ---------------- */
async function lgAckPrompt() {
  if (!S.legal || !S.legal.ack || lgAckPrompt.shown) return;
  lgAckPrompt.shown = true;
  let r;
  try { r = await api('legal.text', { slug: 'kvkk' }); } catch (e) { return; }
  const m = openModal({ title: r.title, size: 'wide',
    body: html`<p class="small muted" style="margin-top:0">Kişisel verilerinizin nasıl işlendiğini anlatan metin aşağıdadır (yeni ya da güncellendi). Lütfen okuyun.</p><div class="lg-doc">${raw(r.html)}</div>`,
    foot: html`<button class="btn" data-close>Sonra</button><button class="btn primary" id="lgAckOk">${icon('check', 'sm')}<span>Okudum, bilgilendirildim</span></button>` });
  $('#lgAckOk', m.el).addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    try { await api('me.kvkk.ack', { ver: r.ver }); S.legal.ack = null; m.close(); toast('Teşekkürler'); } catch (e) { toast(e.message, 'err'); }
  }));
}
ACT['lg-read'] = async (el) => {
  try {
    const r = await api('legal.text', { slug: el.dataset.s || 'kvkk' });
    openModal({ title: r.title, size: 'wide', body: html`<div class="lg-doc">${raw(r.html)}</div>`, foot: html`<a class="btn" href="yasal.php?s=${el.dataset.s || 'kvkk'}" target="_blank" rel="noopener">${icon('expand', 'sm')}<span>Ayrı sayfada aç</span></a><button class="btn primary" data-close>Kapat</button>` });
  } catch (e) { toast(e.message, 'err'); }
};

/* ---------------- Hesabım › Verilerim ---------------- */
NM_EXT.notif.privacy = ['rose', 'shield'];
Object.assign(NM_EXT.audit, { 'kvkk.ack': 'Aydınlatma metnini okudu', 'kvkk.export': 'Kişisel veri kopyasını indirdi', 'kvkk.delete.request': 'Hesap silme talebinde bulundu', 'kvkk.delete.cancel': 'Hesap silme talebini geri aldı', 'legal.save': 'Yasal metinleri düzenledi' });
NM_EXT.profileTabs.push({
  key: 'veri', label: 'Verilerim', icon: 'shield', visible: () => !(S.me && S.me.sa_virtual),
  html: () => html`<div id="lgPriv" class="stack"><div class="card card-pad"><div class="skel" style="height:14px;width:50%"></div></div></div>`,
  mount: () => lgPrivDraw(),
});
async function lgPrivDraw() {
  const box = $('#lgPriv'); if (!box) return;
  let d;
  try { d = await api('me.privacy'); } catch (e) { setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return; }
  const ack = d.kvkk_ack ? d.kvkk_ack.split('|')[1] : null;
  setHTML(box, html`
    <div class="card card-pad stack"><div><h3 class="ph">${icon('file', 'sm')} Aydınlatma metni</h3>
      <p class="small muted">Kişisel verilerinizin hangi amaçla işlendiği, kimlere aktarıldığı ve haklarınız (KVKK md. 11).${ack ? html` Okundu: <b>${fmtDateTime(ack)}</b>.` : ''}</p></div>
      <div class="row wrap" style="gap:8px">${d.legal ? html`<button class="btn" data-act="lg-read" data-s="kvkk">${icon('file', 'sm')}<span>Aydınlatma metni</span></button><button class="btn ghost" data-act="lg-read" data-s="gizlilik">Gizlilik politikası</button>` : html`<span class="small faint">Metin henüz yayımlanmadı; sorularınız için yöneticinize başvurun.</span>`}</div></div>
    <div class="card card-pad stack"><div><h3 class="ph">${icon('download', 'sm')} Verilerimin kopyası</h3>
      <p class="small muted">Hesap bilgileriniz, nöbet istekleriniz, değişimleriniz, gönderdiğiniz mesajlar, bildirimler ve oturum kayıtlarınız tek bir dosyada (JSON) iner. Şifre özeti ve güvenlik anahtarları dahil edilmez.</p></div>
      <div><a class="btn primary" href="api.php?action=me.export" download>${icon('download', 'sm')}<span>Verilerimi indir</span></a></div></div>
    <div class="card card-pad stack"><div><h3 class="ph">${icon('trash', 'sm')} Hesabımın silinmesi</h3>
      ${d.del_req ? html`<div class="mk-box warn">${icon('clock', 'sm')}<span><b>${fmtDateTime(d.del_req)}</b> tarihinde silme talebinde bulundunuz. Birim yöneticiniz en geç 30 gün içinde hesabınızı siler.</span></div>`
        : html`<p class="small muted">Hesabınız ve kişisel verileriniz birim yöneticiniz tarafından silinir; talebiniz yöneticiye bildirilir ve en geç 30 gün içinde sonuçlandırılır. Nöbet listelerindeki adınız biriminizin resmî kaydı olduğu için listelerden çıkarılmaz.</p>`}</div>
      <div>${d.del_req ? html`<button class="btn" data-act="lg-del-cancel">Talebimi geri al</button>` : html`<button class="btn danger" data-act="lg-del">${icon('trash', 'sm')}<span>Hesabımın silinmesini istiyorum</span></button>`}</div></div>`);
}
ACT['lg-del'] = async () => {
  const note = await promptDialog({ title: 'Hesap silme talebi', label: 'Not (isteğe bağlı, yöneticinize gider)', placeholder: 'Örn: Birimden ayrıldım', ok: 'Talebi gönder', danger: true });
  if (note === null) return;
  try { await api('me.delete.request', { note }); toast('Talebiniz yöneticinize iletildi'); lgPrivDraw(); } catch (e) { toast(e.message, 'err'); }
};
ACT['lg-del-cancel'] = async () => { try { await api('me.delete.request', { cancel: true }); toast('Talebiniz geri alındı'); lgPrivDraw(); } catch (e) { toast(e.message, 'err'); } };

/* ---------------- Düzenleyici (sistem yöneticisi / tek birimde yönetici) ---------------- */
const LGE = { d: null, page: 'kvkk', pre: 'sa.legal', texts: {} };
async function lgEditor(box, pre) {
  LGE.pre = pre;
  try { LGE.d = await api(pre + '.get'); } catch (e) {
    if (e.status === 401 && pre === 'sa.legal') { S.sa = null; return start(); }
    setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return;
  }
  LGE.texts = Object.fromEntries(Object.entries(LGE.d.texts).map(([k, v]) => [k, v.text]));
  lgEditorDraw(box);
}
function lgEditorDraw(box) {
  const D = LGE.d, I = D.info;
  const sw = (k, t, sub) => html`<label class="switch"><input type="checkbox" data-lg="${k}" ${I[k] === '1' ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>${t}</b><span>${sub}</span></span></label>`;
  const inp = (k, l, ph = '', attrs = '') => html`<div class="field"><label>${l}</label><input class="input" data-lg="${k}" value="${I[k] || ''}" placeholder="${ph}" ${raw(attrs)}></div>`;
  const t = D.texts[LGE.page];
  setHTML(box, html`<div class="stack lg-ed">
    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('megaphone', 'sm')} Yayın</h3>
      ${sw('on', 'Tanıtım ve yasal sayfaları yayımla', 'Tanıtım sayfası ve KVKK, gizlilik, kullanım koşulları, mesafeli satış, iade sayfaları herkese açılır; giriş ekranının altında bağlantıları görünür.')}
      ${sw('notice', 'Kullanıcılardan aydınlatma metnini okumalarını iste', 'Metin her değiştiğinde kullanıcılar girişte metni görür ve “Okudum” der; tarih kaydedilir.')}
      ${I.on === '1' ? html`<div class="row wrap" style="gap:8px"><a class="btn sm" href="tanitim.php" target="_blank" rel="noopener">${icon('expand', 'sm')}<span>Tanıtım sayfası</span></a><a class="btn sm" href="yasal.php?s=kvkk" target="_blank" rel="noopener">${icon('expand', 'sm')}<span>Yasal sayfalar</span></a><span class="tiny faint sel">${D.site}tanitim.php</span></div>` : ''}
      ${D.missing.length ? html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Eksik künye bilgisi: <b>${D.missing.join(', ')}</b>. Metinlerde bu yerler sarı <mark>[…]</mark> olarak görünür. PayTR / iyzico başvurusu için hepsi gerekir.</span></div>` : ''}
      ${D.acks !== null && D.acks !== undefined ? html`<div class="tiny faint">Güncel aydınlatma metnini okuyan kişi: ${D.acks}</div>` : ''}</div>
    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('building', 'sm')} Künye (hizmeti sunan)</h3>
      <div class="grid2">${inp('owner', 'Şirket / şahıs unvanı', 'Örn: Ad Soyad ya da Örnek Yazılım Ltd. Şti.')}${inp('brand', 'Marka adı', 'dupcii')}</div>
      ${inp('address', 'Adres (tebligat)', 'Mahalle, cadde, no, ilçe / il')}
      <div class="grid3 bl-g3">${inp('tax_office', 'Vergi dairesi')}${inp('tax_no', 'VKN / T.C. kimlik no', '', 'inputmode="numeric" maxlength="11"')}${inp('mersis', 'MERSİS no (şirketse)')}</div>
      <div class="grid3 bl-g3">${inp('email', 'İletişim e-postası', '', 'type="email"')}${inp('phone', 'Telefon')}${inp('kep', 'KEP adresi (varsa)')}</div>
      <div class="grid2">${inp('host', 'Barındırma sağlayıcısı ve sunucu konumu', 'Örn: Hostinger, sunucu konumu: Litvanya (AB)')}${inp('court', 'Yetkili mahkeme', 'Örn: İstanbul (Çağlayan)')}</div></div>
    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('home', 'sm')} Tanıtım sayfası</h3>
      ${inp('hero', 'Başlık', 'Nöbet listeleri, değişimler ve ekip iletişimi tek yerde')}
      <div class="field"><label>Alt metin</label><textarea class="textarea" data-lg="sub" rows="2" placeholder="Hastane birimleri için hazırlanmış kapalı ekip portalı…">${I.sub || ''}</textarea></div>
      <div class="tiny faint">Özellikler, “Nasıl başlanır” (başvuru açıksa) ve fiyatlar (abonelik sayfası görünürse) kendiliğinden gelir.</div></div>
    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('file', 'sm')} Yasal metinler</h3>
      <div class="mk-box info">${icon('info', 'sm')}<span>Metinler genel bir <b>taslaktır</b>; yayımlamadan önce bir avukata ya da KVKK danışmanına kontrol ettirin. <b>{UNVAN}</b>, <b>{EPOSTA}</b> gibi yer tutucular künyeden doldurulur. Biçim: “## ” başlık, “- ” madde, **kalın**.</span></div>
      <div class="seg lg-seg">${Object.entries(D.texts).map(([k, v]) => html`<button class="${LGE.page === k ? 'on' : ''}" data-act="lg-page" data-k="${k}">${v.title}${LGE.texts[k] !== v.tpl ? ' •' : ''}</button>`)}</div>
      <textarea class="textarea lg-text" id="lgText" rows="18" data-input="lg-text">${LGE.texts[LGE.page]}</textarea>
      <div class="row wrap" style="gap:8px"><button class="btn sm ghost" data-act="lg-tpl">Taslağa döndür</button>${I.on === '1' ? html`<a class="btn sm ghost" href="yasal.php?s=${LGE.page}" target="_blank" rel="noopener">${icon('expand', 'sm')}<span>Yayımlanan hâli</span></a>` : ''}<span class="tiny faint">${t.custom ? 'Özelleştirilmiş metin' : 'Taslak metin'}</span></div></div>
    <div class="lg-save"><button class="btn primary" data-act="lg-save">${icon('check', 'sm')}<span>Kaydet</span></button></div>
  </div>`);
}
CHANGE['lg-text'] = (el) => { LGE.texts[LGE.page] = el.value; };
ACT['lg-page'] = (el) => { const ta = $('#lgText'); if (ta) LGE.texts[LGE.page] = ta.value; lgEditorKeep(); LGE.page = el.dataset.k; lgEditorDraw(el.closest('.lg-ed').parentElement); };
ACT['lg-tpl'] = async () => {
  if (!(await confirmDialog({ title: 'Taslağa döndürülsün mü?', text: 'Bu sayfadaki özel değişiklikleriniz silinir, taslak metin gelir (kaydedince geçerli olur).', ok: 'Taslağa döndür' }))) return;
  LGE.texts[LGE.page] = LGE.d.texts[LGE.page].tpl; const ta = $('#lgText'); if (ta) ta.value = LGE.texts[LGE.page];
};
/** Sekme değişirken formdaki künye alanlarını kaybetme */
function lgEditorKeep() { $$('[data-lg]').forEach((x) => { LGE.d.info[x.dataset.lg] = x.type === 'checkbox' ? (x.checked ? '1' : '0') : x.value; }); }
ACT['lg-save'] = (el) => busy(el, async () => {
  const ta = $('#lgText'); if (ta) LGE.texts[LGE.page] = ta.value;
  const o = {};
  $$('[data-lg]').forEach((x) => { o[x.dataset.lg] = x.type === 'checkbox' ? x.checked : x.value; });
  o.texts = LGE.texts;
  try {
    LGE.d = await api(LGE.pre + '.save', o);
    LGE.texts = Object.fromEntries(Object.entries(LGE.d.texts).map(([k, v]) => [k, v.text]));
    toast('Kaydedildi'); lgEditorDraw(el.closest('.lg-ed').parentElement);
  } catch (e) { toast(e.message, 'err'); }
});

/* ---------------- Sistem yöneticisi: Site ve yedek ---------------- */
async function lgSaRender(box) {
  box = box || $('#sysBody'); if (!box) return;
  setHTML(box, html`<div class="stack"><div id="upBox"></div><div id="obkBox"><div class="card card-pad"><div class="skel" style="height:14px;width:40%"></div></div></div><div id="lgBox"></div></div>`);
  if (typeof upDraw === 'function') { UPC.info = null; upDraw($('#upBox'), 'sa.update'); }
  obkDraw();
  lgEditor($('#lgBox'), 'sa.legal');
}
const OBK_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
async function obkDraw(d) {
  const box = $('#obkBox'); if (!box) return;
  if (!d) { try { d = await api('sa.obk.get'); } catch (e) { setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return; } }
  setHTML(box, html`<div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('download', 'sm')} Sunucu dışı yedek</h3>
    <p class="small muted" style="margin:0">Merkez, tüm birimler ve hastane ortak veritabanlarının <b>şifreli</b> kopyası haftada bir yedek e-posta adresinize gelir. Sunucuya bir şey olsa da verileriniz sizde kalır. Dosya 7-Zip / WinRAR / Keka ile yedek şifresiyle açılır. Yüklenen belge ve fotoğraflar eklenmez (hosting yedeğinden alınır).</p>
    ${d.zip_ok ? '' : html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Sunucudaki PHP şifreli ZIP desteklemiyor. Hosting desteğinden PHP “zip” eklentisinin güncellenmesini isteyin.</span></div>`}
    ${d.mail_src ? '' : html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Hiçbir birimde e-posta ayarı yok; yedek gönderilemez. Bir birime girip Ayarlar › E-posta bölümünü doldurun. “İndir” yine çalışır.</span></div>`}
    <label class="switch"><input type="checkbox" id="obkOn" ${d.on ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>Haftalık yedek gönder</b><span>Seçilen gün gece 03:00'ten sonraki ilk görevde.</span></span></label>
    <div class="grid2"><div class="field"><label>Yedeklerin gideceği e-posta</label><input class="input" id="obkEmail" type="email" value="${d.email}" placeholder="Kurum dışı, sizin erişeceğiniz bir adres"></div>
      <div class="field"><label>Yedek şifresi ${d.pass_set ? html`<span class="faint">(kayıtlı)</span>` : ''}</label><input class="input" id="obkPass" type="password" autocomplete="new-password" placeholder="${d.pass_set ? '•••••••• değiştirmek için yazın' : 'En az 10 karakter'}"></div></div>
    <div class="grid2"><div class="field"><label>Gün</label><select class="select" id="obkDay">${OBK_DAYS.map((n, i) => html`<option value="${i + 1}" ${d.day === i + 1 ? raw('selected') : ''}>${n}</option>`)}</select></div>
      <div class="field"><label>E-posta ek sınırı (MB)</label><input class="input" id="obkMax" type="number" min="1" max="50" value="${d.max_mb}"></div></div>
    <div class="mk-box info">${icon('lock', 'sm')}<span>Yedek şifresini bir yere not edin. Şifre olmadan yedek açılamaz ve şifre e-postada gönderilmez.</span></div>
    ${d.last ? html`<div class="small ${d.last_ok ? '' : 'tone-danger'}" style="${d.last_ok ? 'color:var(--success)' : 'color:var(--danger)'}">${icon(d.last_ok ? 'checkCircle' : 'alert', 'sm')} Son: ${fmtDateTime(d.last)} · ${d.last_msg}${d.last_size ? ` · ${(d.last_size / 1048576).toFixed(2)} MB` : ''}</div>` : html`<div class="tiny faint">Henüz yedek gönderilmedi.</div>`}
    <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="obk-save">Kaydet</button>
      <button class="btn" data-act="obk-run" ${d.pass_set && d.email ? '' : raw('disabled')}>${icon('send', 'sm')}<span>Şimdi gönder</span></button>
      ${d.pass_set ? html`<a class="btn" href="api.php?action=sa.obk.download&csrf=${encodeURIComponent(S.csrf || '')}">${icon('download', 'sm')}<span>İndir</span></a>` : ''}</div></div>`);
}
ACT['obk-save'] = (el) => busy(el, async () => {
  try {
    const d = await api('sa.obk.save', { on: $('#obkOn').checked, email: $('#obkEmail').value.trim(), pass: $('#obkPass').value, day: +$('#obkDay').value, max_mb: +$('#obkMax').value });
    toast('Kaydedildi'); obkDraw(d);
  } catch (e) { toast(e.message, 'err'); }
});
ACT['obk-run'] = (el) => busy(el, async () => {
  try { const d = await api('sa.obk.run'); toast('Yedek gönderildi'); obkDraw(d); } catch (e) { toast(e.message, 'err'); obkDraw(); }
});

/* ---------------- Tek birimli kurulum: yönetici Ayarlar kartı ---------------- */
NM_EXT.settingsCards.push({
  sec: 'genel', admin: true,
  html: () => (S.legal_admin ? html`<div data-sec="genel" id="lgAdmBox"><div class="card card-pad"><h3 style="font-size:15px">${icon('file', 'sm')} Tanıtım ve yasal metinler</h3><div class="skel" style="height:14px;width:50%"></div></div></div>` : ''),
  mount: () => { const b = $('#lgAdmBox'); if (b) lgEditor(b, 'legal'); },
});
