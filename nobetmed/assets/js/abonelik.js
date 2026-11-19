/* dupcii — abonelik ve ödeme (4.15)
   Birim yöneticisi: paket seçer, fatura bilgisini girer, PayTR / iyzico / havale ile öder; geçmiş ödemeler.
   Herkes: süre uyarı şeridi. Sistem yöneticisi: ayarlar, sağlayıcılar, paketler, birim abonelikleri, ödemeler (sistem paneli › Abonelik). */
'use strict';

const BL = { d: null, period: 'month', poll: 0 };
const BL_ST = { pending: ['Bekliyor', 'warn'], paid: ['Ödendi', 'success'], failed: ['Başarısız', 'danger'], cancelled: ['İptal', ''], refunded: ['İade edildi', ''] };
const BL_PROV = { paytr: 'PayTR', iyzico: 'iyzico', havale: 'Havale / EFT' };
const BL_MODE_TONE = { none: '', open: '', trial: 'info', active: 'success', grace: 'warn', comp: 'success', free: 'warn', expired: 'danger' };
function blMoney(k) { return (Number(k || 0) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'; }
function blDate(s) { return s ? `${+s.slice(8, 10)} ${TR_MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '—'; }

NM_EXT.routes.abonelik = (view, r) => blPage(view, r[1]);
NM_EXT.nav.push({ sec: 'yonetim', admin: true, href: '#/abonelik', icon: 'wallet', label: 'Abonelik', match: (r) => r[0] === 'abonelik', visible: () => !!(S.billing && S.billing.can_pay) });
Object.assign(NM_EXT.audit, { 'billing.checkout': 'Abonelik ödemesi başlattı', 'billing.info': 'Fatura bilgilerini kaydetti', 'billing.cancel': 'Bekleyen ödemeden vazgeçti' });
NM_EXT.notif.billing = ['emerald', 'wallet'];
NM_EXT.settingsCards.push({
  sec: 'genel', admin: true,
  html: () => (S.billing && S.billing.can_pay ? html`<div class="card card-pad stack" data-sec="genel"><div><h3 style="font-size:15px">${icon('wallet', 'sm')} Abonelik ve ödeme</h3>
    <p class="small muted">Biriminizin paketi: <b>${(S.billing.plan && S.billing.plan.name) || S.billing.mode_txt}</b>${S.billing.ends ? ` · bitiş ${blDate(S.billing.ends)}` : ''}.</p></div>
    <div><a class="btn" href="#/abonelik">${icon('wallet', 'sm')}<span>Abonelik sayfası</span></a></div></div>` : ''),
});

/* ---------------- Uyarı şeridi (herkes) ---------------- */
function blBanner() {
  const box = $('#blBar');
  if (!box) return;
  const b = S.billing;
  if (!b || !b.visible || (S.sa && S.sa.in)) { setHTML(box, ''); return; }
  const adm = b.can_pay;
  const go = adm ? html` <a href="#/abonelik">Abonelik</a>` : html` <span>Birim yöneticinize iletin.</span>`;
  let tone = '', txt = '';
  if (b.mode === 'trial' && b.days_left !== null && b.days_left <= 7) { tone = 'warn'; txt = `Deneme süreniz ${b.days_left <= 0 ? 'bugün' : b.days_left + ' gün sonra'} bitiyor.`; }
  else if (b.mode === 'active' && b.days_left !== null && b.days_left <= 7) { tone = 'info'; txt = `Aboneliğiniz ${b.days_left <= 0 ? 'bugün' : b.days_left + ' gün sonra'} bitiyor.`; }
  else if (b.mode === 'grace') { tone = 'warn'; txt = `Aboneliğinizin süresi doldu; ${blDate(b.grace_until)} tarihine kadar yenilenmezse kısıtlanacak.`; }
  else if (b.mode === 'free') { tone = 'info'; txt = 'Ücretsiz paket kullanılıyor; bazı özellikler kapalı.'; }
  else if (b.mode === 'expired') { tone = 'danger'; txt = 'Aboneliğin süresi doldu; uygulama yalnız görüntülenebilir.'; }
  if (!txt) { setHTML(box, ''); return; }
  const k = 'nm-blbar-' + b.mode + '-' + ymd(new Date());
  try { if (tone !== 'danger' && localStorage.getItem(k)) { setHTML(box, ''); return; } } catch (e) { /* */ }
  setHTML(box, html`<div class="bl-bar ${tone}" role="status">${icon(tone === 'danger' ? 'alert' : 'wallet', 'sm')}<span class="grow">${txt}${go}</span>${tone !== 'danger' ? html`<button type="button" class="btn ghost icon sm" data-act="bl-bar-x" data-k="${k}" aria-label="Kapat">${icon('x', 'sm')}</button>` : ''}</div>`);
}
ACT['bl-bar-x'] = (el) => { try { localStorage.setItem(el.dataset.k, '1'); } catch (e) { /* */ } setHTML($('#blBar'), ''); };

/* ---------------- Birim yöneticisi: abonelik sayfası ---------------- */
async function blPage(view, sub) {
  setHTML(view, html`<div class="page-head"><div><h1>Abonelik</h1><p>Biriminizin paketi, ödeme ve faturalar. Ödemeyi birim yöneticisi yapar.</p></div></div><div id="blBody">${typeof mkSpin === 'function' ? mkSpin() : ''}</div>`);
  try { BL.d = await api('billing.page'); } catch (e) { setHTML($('#blBody'), html`<div class="card empty"><p class="small">${e.message}</p></div>`); return; }
  S.billing = BL.d.state; blBanner();
  if (sub === 'tamam') {
    const last = BL.d.payments[0];
    toast(last && last.status === 'paid' ? 'Ödemeniz alındı, aboneliğiniz uzatıldı' : 'Ödemeniz işleniyor; birkaç dakika içinde görünür');
    history.replaceState(null, '', '#/abonelik');
  } else if (sub === 'hata') { toast('Ödeme tamamlanmadı; kartınızdan çekim yapılmadı', 'err'); history.replaceState(null, '', '#/abonelik'); }
  blDraw();
}
function blDraw() {
  const box = $('#blBody'); const D = BL.d; if (!box || !D) return;
  const st = D.state;
  const plans = D.plans;
  const cur = st.plan && st.plan.id;
  const card = (p) => {
    const pr = p.prices[BL.period];
    const yearSave = p.price_m * 12 - p.price_y;
    const mods = p.modules ? p.modules.map((m) => D.modules[m]).filter(Boolean) : null;
    const tooMany = p.max_users && D.users > p.max_users;
    return html`<div class="card bl-plan ${cur === p.id ? 'cur' : ''}">
      <div class="bl-ph"><b>${p.name}</b>${cur === p.id ? html`<span class="badge brand">Mevcut paket</span>` : ''}</div>
      <p class="small muted bl-pd">${p.descr}</p>
      <div class="bl-price">${p.is_free ? html`<b>Ücretsiz</b>` : html`<b>${blMoney(pr.net)}</b><span class="small muted"> / ${BL.period === 'year' ? 'yıl' : 'ay'} + KDV</span>`}</div>
      ${!p.is_free ? html`<div class="tiny faint">KDV dahil ${blMoney(pr.total)}${BL.period === 'year' && yearSave > 0 ? ` · aylığa göre ${blMoney(yearSave)} tasarruf` : ''}</div>` : ''}
      <ul class="bl-feat"><li>${p.max_users ? `En çok ${p.max_users} etkin kişi` : 'Sınırsız kişi'}</li>${mods ? mods.map((m) => html`<li>${m}</li>`) : html`<li>Tüm modüller</li>`}</ul>
      ${p.is_free ? '' : html`<button type="button" class="btn ${cur === p.id ? '' : 'primary'} block" data-act="bl-buy" data-id="${p.id}" ${tooMany ? raw('disabled title="Biriminizdeki kişi sayısı bu paketin sınırını aşıyor"') : ''}>${cur === p.id && st.mode !== 'trial' ? 'Süreyi uzat' : 'Bu paketi seç'}</button>`}
      ${tooMany ? html`<div class="tiny mk-no">Biriminizde ${D.users} kişi var; bu paket en çok ${p.max_users} kişiyi kapsar.</div>` : ''}</div>`;
  };
  const pend = D.payments.filter((p) => p.status === 'pending' && p.provider === 'havale');
  setHTML(box, html`
    <div class="card card-pad bl-status">
      <div class="row wrap" style="gap:10px;align-items:center"><span class="cat-ico tone-emerald">${icon('wallet')}</span>
        <div class="grow"><div class="small muted">Biriminizin durumu</div><b style="font-size:17px">${(st.plan && st.plan.name) || 'Paket seçilmedi'}</b> <span class="badge ${BL_MODE_TONE[st.disp || st.mode] || ''}">${st.mode_txt}</span></div>
        <div class="bl-kv"><span class="tiny faint">Bitiş</span><b>${blDate(st.ends)}</b>${st.days_left !== null && st.days_left >= 0 ? html`<span class="tiny faint">${st.days_left} gün kaldı</span>` : ''}</div>
        <div class="bl-kv"><span class="tiny faint">Etkin kişi</span><b>${D.users}${st.max_users ? ' / ' + st.max_users : ''}</b></div></div>
      ${!st.enforce ? html`<p class="tiny faint" style="margin:8px 0 0">Şu an tüm özellikler kısıtlamasız açık. İsterseniz şimdiden paket seçip ödeme yapabilirsiniz; süre kalan sürenin üstüne eklenir.</p>` : ''}
      ${pend.length ? html`<div class="mk-box warn" style="margin-top:10px">${icon('clock', 'sm')}<span>Havale / EFT ödemeniz onay bekliyor (${pend.map((p) => `${blMoney(p.total)} · kod ${p.oid}`).join(', ')}). Hesaba geçince aboneliğiniz uzatılır.</span></div>` : ''}
    </div>
    <div class="row wrap" style="justify-content:space-between;align-items:center;gap:8px;margin:16px 0 8px"><h3 style="margin:0;font-size:16px">Paketler</h3>
      <div class="seg"><button type="button" class="${BL.period === 'month' ? 'on' : ''}" data-act="bl-period" data-p="month">Aylık</button><button type="button" class="${BL.period === 'year' ? 'on' : ''}" data-act="bl-period" data-p="year">Yıllık</button></div></div>
    <div class="bl-plans">${plans.map(card)}</div>
    <div class="grid2 bl-lower" style="margin-top:16px">
      <div class="card card-pad stack" id="blInfo">${blInfoForm(D.billing)}</div>
      <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Ödemeler</h3></div>
        <div class="list">${D.payments.length ? D.payments.map((p) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.plan} · ${p.period === 'year' ? 'Yıllık' : 'Aylık'} · <b>${blMoney(p.total)}</b></div>
          <div class="lr-s">${fmtDateTime(p.created_at)} · ${BL_PROV[p.provider] || p.provider} · kod ${p.oid}${p.invoice_no ? ' · fatura ' + p.invoice_no : ''}</div></div>
          <span class="badge ${(BL_ST[p.status] || [])[1] || ''}">${(BL_ST[p.status] || [p.status])[0]}</span>
          ${p.status === 'pending' && p.provider === 'havale' ? html`<button type="button" class="btn sm ghost" data-act="bl-cancel" data-oid="${p.oid}">Vazgeç</button>` : ''}</div>`)
          : html`<div class="list-row small muted">Henüz ödeme yok.</div>`}</div></div></div>`);
}
function blInfoForm(b) {
  return html`<div><h3 style="font-size:15px;margin:0">${icon('file', 'sm')} Fatura bilgileri</h3><p class="tiny faint" style="margin:4px 0 0">Fatura ve makbuz bu bilgilerle düzenlenir.</p></div>
    <form class="stack" data-form="bl-info">
      <div class="field"><label>Unvan (kurum ya da kişi adı)</label><input class="input" name="title" value="${b.title}" required maxlength="160"></div>
      <div class="grid2"><div class="field"><label>Vergi dairesi</label><input class="input" name="tax_office" value="${b.tax_office}" maxlength="80"></div>
        <div class="field"><label>Vergi no / T.C. kimlik no</label><input class="input" name="tax_no" value="${b.tax_no}" inputmode="numeric" required maxlength="11"></div></div>
      <div class="field"><label>Adres</label><input class="input" name="address" value="${b.address}" required maxlength="400"></div>
      <div class="grid2"><div class="field"><label>İl</label><input class="input" name="city" value="${b.city}" required maxlength="60"></div>
        <div class="field"><label>Telefon</label><input class="input" name="phone" value="${b.phone}" type="tel" required maxlength="20"></div></div>
      <div class="field"><label>Fatura e-postası</label><input class="input" name="email" type="email" value="${b.email || (S.me && S.me.email) || ''}" required></div>
      <div class="form-error hidden" data-err></div>
      <div><button class="btn" type="submit">Fatura bilgilerini kaydet</button></div></form>`;
}
FORMS['bl-info'] = (f) => submitForm(f, async (d) => { const r = await api('billing.info.save', d); BL.d.billing = r.billing; toast('Fatura bilgileri kaydedildi'); });
ACT['bl-period'] = (el) => { BL.period = el.dataset.p; blDraw(); };
ACT['bl-terms'] = () => openModal({ title: 'Mesafeli satış sözleşmesi ve ön bilgilendirme', size: 'wide', body: html`<div class="bl-terms">${(BL.d && BL.d.terms) || ''}</div>`, foot: html`<button class="btn primary" data-close>Kapat</button>` });
ACT['bl-cancel'] = async (el) => {
  if (!(await confirmDialog({ title: 'Bekleyen ödemeden vazgeçilsin mi?', text: 'Havale yaptıysanız vazgeçmeyin; sistem yöneticisi hesaba geçince onaylar.', ok: 'Vazgeç', danger: true }))) return;
  try { await api('billing.cancel', { oid: el.dataset.oid }); blPage($('#view')); } catch (e) { toast(e.message, 'err'); }
};
ACT['bl-buy'] = (el) => {
  const D = BL.d; const p = D.plans.find((x) => x.id === +el.dataset.id); if (!p) return;
  const pr = p.prices[BL.period];
  const b = D.billing;
  const infoOk = b.title && b.tax_no && b.address && b.city && b.email && b.phone;
  if (!D.providers.length) { toast('Ödeme yöntemi henüz açılmadı; sistem yöneticisiyle görüşün.', 'err'); return; }
  const m = openModal({ title: `${p.name} · ${BL.period === 'year' ? 'Yıllık' : 'Aylık'}`, body: html`<div class="stack">
      <div class="bl-sum"><div><span>Paket</span><b>${p.name} (${BL.period === 'year' ? '1 yıl' : '1 ay'})</b></div><div><span>Tutar</span><b>${blMoney(pr.net)}</b></div><div><span>KDV (%${D.kdv})</span><b>${blMoney(pr.kdv)}</b></div><div class="tot"><span>Toplam</span><b>${blMoney(pr.total)}</b></div></div>
      <p class="tiny faint" style="margin:0">Süre, mevcut deneme ya da aboneliğin bitişinin üstüne eklenir. Otomatik yenileme yoktur; bitişe yakın hatırlatılır.</p>
      ${infoOk ? html`<div class="small"><b>Fatura:</b> ${b.title} · ${b.tax_no} · ${b.city}</div>` : html`<div class="mk-box warn">${icon('alert', 'sm')}<span>Önce sayfadaki <b>Fatura bilgileri</b>ni kaydedin.</span></div>`}
      ${D.terms ? html`<label class="row" style="gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="blTerms" style="margin-top:3px"><span class="small"><button type="button" class="btn ghost sm" data-act="bl-terms" style="padding:0 2px;height:auto">Mesafeli satış sözleşmesini ve ön bilgilendirme formunu</button> okudum, kabul ediyorum.</span></label>` : ''}
      <div class="field"><label>Ödeme yöntemi</label><div class="stack" style="gap:6px">${D.providers.map((x, i) => html`<label class="ml-opt"><input type="radio" name="blProv" value="${x.key}" ${i === 0 ? raw('checked') : ''}><span><b>${x.name}</b>${x.key === 'havale' ? html`<span class="tiny faint" style="display:block">Hesaba geçince sistem yöneticisi onaylar (1–2 iş günü).</span>` : html`<span class="tiny faint" style="display:block">Güvenli ödeme sayfasında; kart bilgileriniz bize gelmez.</span>`}</span></label>`)}</div></div></div>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="blGo" ${infoOk ? '' : raw('disabled')}>${icon('lock', 'sm')}<span>Ödemeye geç</span></button>` });
  $('#blGo', m.el).addEventListener('click', (ev) => busy(ev.currentTarget, async () => {
    const prov = ($('input[name=blProv]:checked', m.el) || {}).value;
    const acc = !D.terms || ($('#blTerms', m.el) && $('#blTerms', m.el).checked);
    if (!acc) { toast('Ödemeye geçmek için sözleşmeyi onaylayın.', 'err'); return; }
    let r;
    try { r = await api('billing.checkout', { plan_id: p.id, period: BL.period, provider: prov, accept: acc }); } catch (e) { toast(e.message, 'err'); return; }
    if (r.kind === 'redirect') { location.href = r.url; return; }
    if (r.kind === 'havale') {
      m.setTitle('Havale / EFT');
      m.setBody(html`<div class="stack"><div class="bl-sum"><div class="tot"><span>Gönderilecek tutar</span><b>${blMoney(r.total)}</b></div><div><span>Açıklamaya yazın</span><b class="sel">${r.oid}</b></div></div>
        <div class="bl-iban">${r.text || 'Banka bilgisi için sistem yöneticisiyle görüşün.'}</div>
        <p class="tiny faint" style="margin:0">Ödeme hesaba geçince sistem yöneticisi onaylar ve aboneliğiniz uzatılır; size bildirim gelir.</p></div>`);
      m.setFoot(html`<button class="btn primary" data-close>Tamam</button>`);
      blPage($('#view'));
      return;
    }
    // PayTR: güvenli ödeme çerçevesi; sonuç bildirimle gelir, bu pencere durumu yoklar
    m.close();
    blPayFrame(r);
  }));
};
function blPayFrame(r) {
  const m = openModal({ title: 'Güvenli ödeme', size: 'wide', body: html`<div class="bl-frame"><iframe src="${r.url}" title="PayTR güvenli ödeme" allow="payment" referrerpolicy="no-referrer"></iframe></div>
      <p class="tiny faint" style="margin:8px 0 0">${icon('lock', 'sm')} Kart bilgileriniz doğrudan PayTR’ye iletilir; bizim sunucumuza gelmez.</p>`,
    onClose: () => { clearInterval(BL.poll); blPage($('#view')); } });
  clearInterval(BL.poll);
  BL.poll = setInterval(async () => {
    if (!document.body.contains(m.el)) { clearInterval(BL.poll); return; }
    try {
      const s = await api('billing.status', { oid: r.oid });
      if (s.payment.status === 'paid') { clearInterval(BL.poll); S.billing = s.state; m.close(); toast('Ödemeniz alındı, aboneliğiniz uzatıldı'); }
      else if (s.payment.status === 'failed') { clearInterval(BL.poll); toast('Ödeme tamamlanmadı: ' + (s.payment.note || ''), 'err'); }
    } catch (e) { /* bağlantı */ }
  }, 4000);
}

/* =================================================================== */
/* Sistem yöneticisi: Abonelik sekmesi                                  */
/* =================================================================== */
const BLS = { d: null };
async function blSaRender(box) {
  try { BLS.d = await api('sa.billing'); } catch (e) { if (e.status === 401) { S.sa = null; return start(); } setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); return; }
  blSaDraw(box);
}
function blSaDraw(box) {
  box = box || $('#sysBody'); const D = BLS.d; if (!box || !D) return;
  const c = D.cfg, s = D.summary;
  const sw = (k, t, sub) => html`<label class="switch"><input type="checkbox" data-blc="${k}" ${c[k] === '1' ? raw('checked') : ''}><span class="track"></span><span class="s-text"><b>${t}</b><span>${sub}</span></span></label>`;
  const inp = (k, l, attrs = '', ph = '') => html`<div class="field"><label>${l}</label><input class="input" data-blc="${k}" value="${c[k] || ''}" ${raw(attrs)} placeholder="${ph}"></div>`;
  const sec = (k, l) => html`<div class="field"><label>${l}</label><input class="input" type="password" data-blc="${k}" autocomplete="new-password" placeholder="${c[k + '_set'] ? '•••••• kayıtlı (değiştirmek için yazın)' : 'Girilmedi'}"></div>`;
  const modeTone = (m) => BL_MODE_TONE[m] || '';
  const MODE = { none: 'Abonelik yok', open: 'Kısıtlama yok', trial: 'Deneme', active: 'Etkin', grace: 'Ek süre', comp: 'Ücretsiz', free: 'Ücretsiz paket', expired: 'Süresi doldu' };
  setHTML(box, html`<div class="stack">
    <div class="bl-stats">${[['Ücretli etkin', s.active], ['Denemede', s.trial], ['Ücretsiz tanımlı', s.comp], ['Süresi dolan', s.expired], ['Aylık tekrarlayan (KDV hariç)', blMoney(s.mrr)], ['Bu ay tahsilat', blMoney(s.month_paid)], ['Onay bekleyen havale', s.pending_havale]]
      .map(([l, v]) => html`<div class="card card-pad"><div class="tiny faint">${l}</div><b style="font-size:20px">${v}</b></div>`)}</div>

    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('sliders', 'sm')} Genel</h3>
      ${sw('visible', 'Abonelik sayfası birimlere görünsün', 'Birim yöneticileri paketleri görür, isterse ödeme yapar. Kısıtlama yapmaz.')}
      ${sw('enforce', 'Ödeme zorunluluğu', 'Açıkken süresi dolan birim ücretsiz pakete düşer (yoksa salt okunur olur); paketteki modüller ve kişi sınırı uygulanır. Kapalıyken kimse kısıtlanmaz.')}
      ${sw('trial_on', 'Yeni birimlere otomatik deneme', 'Aboneliği olmayan birim ilk açılışta deneme süresini başlatır.')}
      <div class="grid3 bl-g3">${inp('trial_days', 'Deneme süresi (gün)', 'type="number" min="1" max="365"')}${inp('grace_days', 'Süre dolunca ek süre (gün)', 'type="number" min="0" max="60"')}${inp('kdv', 'KDV oranı (%)', 'type="number" min="0" max="100"')}</div>
      <div class="field"><label>Mesafeli satış sözleşmesi ve ön bilgilendirme metni</label><textarea class="textarea" data-blc="terms" rows="4" placeholder="Doldurulursa birim yöneticisi ödeme öncesi bu metni onaylar; onay (tarih, kişi, IP) ödeme kaydına yazılır. PayTR ve iyzico başvurusunda istenir.">${c.terms}</textarea></div>
      ${sw('remind', 'Hatırlatmalar', 'Deneme / abonelik bitmeden 7, 3, 1 gün önce ve bitince birim yöneticilerine bildirim.')}
      <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="bls-save">Kaydet</button><button class="btn" data-act="bls-bulk">Aboneliği olmayan tüm birimlere deneme başlat</button></div></div>

    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('wallet', 'sm')} Ödeme yöntemleri</h3>
      ${D.curl ? '' : html`<div class="mk-box danger">${icon('alert', 'sm')}<span>Sunucuda cURL kapalı; kartla ödeme çalışmaz. Hosting panelinden PHP cURL eklentisini açın.</span></div>`}
      <div class="bl-prov"><div class="row" style="justify-content:space-between;align-items:center"><b>PayTR</b>${sw('paytr_on', 'Açık', '')}</div>
        ${sw('paytr_test', 'Test modu', 'PayTR test kartlarıyla dener; gerçek çekim yapılmaz.')}
        <div class="grid3 bl-g3">${inp('paytr_id', 'Mağaza no (merchant_id)', 'inputmode="numeric"')}${sec('paytr_key', 'Mağaza parola (merchant_key)')}${sec('paytr_salt', 'Mağaza gizli anahtar (merchant_salt)')}</div>
        <div class="tiny faint">PayTR Mağaza Paneli › Destek & Kurulum › Ayarlar › <b>Bildirim URL</b>: <span class="sel">${D.urls.paytr_notify}</span></div></div>
      <div class="bl-prov"><div class="row" style="justify-content:space-between;align-items:center"><b>iyzico</b>${sw('iyzico_on', 'Açık', '')}</div>
        ${sw('iyzico_sandbox', 'Deneme ortamı (sandbox)', 'sandbox-api.iyzipay.com; gerçek çekim yapılmaz.')}
        <div class="grid2">${inp('iyzico_key', 'API anahtarı')}${sec('iyzico_secret', 'Gizli anahtar')}</div>
        <div class="tiny faint">Dönüş adresi otomatik gönderilir: <span class="sel">${D.urls.iyzico_callback}</span></div></div>
      <div class="bl-prov"><div class="row" style="justify-content:space-between;align-items:center"><b>Havale / EFT</b>${sw('havale_on', 'Açık', '')}</div>
        <div class="field"><label>Birime gösterilecek banka bilgisi</label><textarea class="textarea" data-blc="havale_text" rows="3" placeholder="Alıcı: … · Banka: … · IBAN: TR..">${c.havale_text}</textarea></div></div>
      <div><button class="btn primary" data-act="bls-save">Kaydet</button></div></div>

    <div class="card"><div class="card-head"><h3>${icon('layers', 'sm')} Paketler</h3><button class="btn sm primary" data-act="bls-plan" data-id="0">${icon('plus', 'sm')}<span>Paket ekle</span></button></div>
      <div class="list">${D.plans.map((p) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.name} <span class="tiny faint">${p.code}</span>${p.is_free ? html` <span class="badge success">ücretsiz paket</span>` : ''}${p.active ? '' : html` <span class="badge">satışta değil</span>`}</div>
          <div class="lr-s">${p.is_free ? 'Ücretsiz' : `${blMoney(p.price_m)}/ay · ${blMoney(p.price_y)}/yıl (KDV hariç)`} · ${p.max_users ? p.max_users + ' kişi' : 'sınırsız kişi'} · ${p.modules ? p.modules.length + ' modül' : 'tüm modüller'}</div></div>
        <button class="btn sm" data-act="bls-plan" data-id="${p.id}">${icon('edit', 'sm')}<span>Düzenle</span></button></div>`)}</div></div>

    <div class="card"><div class="card-head"><h3>${icon('building', 'sm')} Birimlerin abonelikleri</h3></div>
      <div class="list">${D.units.map((u) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${u.hospital ? u.hospital + ' › ' : ''}${u.name} <span class="badge ${modeTone(u.mode)}">${MODE[u.mode] || u.mode}</span>${u.frozen ? html` <span class="badge warn">dondurulmuş</span>` : ''}</div>
          <div class="lr-s">${u.plan || 'paket yok'}${u.period ? ' · ' + (u.period === 'year' ? 'yıllık' : 'aylık') : ''} · bitiş ${blDate(u.ends)}${u.days_left !== null ? ` (${u.days_left} gün)` : ''} · ${u.users} kişi${u.note ? ' · ' + u.note : ''}</div></div>
        <button class="btn sm" data-act="bls-unit" data-k="${u.key}">${icon('more', 'sm')}<span>İşlemler</span></button></div>`)}</div></div>

    <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Ödemeler</h3></div>
      <div class="list">${D.payments.length ? D.payments.map((p) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.unit} · ${p.plan} · ${p.period === 'year' ? 'yıllık' : 'aylık'} · <b>${blMoney(p.total)}</b> <span class="badge ${(BL_ST[p.status] || [])[1] || ''}">${(BL_ST[p.status] || [p.status])[0]}</span></div>
          <div class="lr-s">${fmtDateTime(p.created_at)} · ${BL_PROV[p.provider] || p.provider} · kod ${p.oid}${p.payer ? ' · ' + p.payer : ''}${p.invoice_no ? ' · fatura ' + p.invoice_no : ''}${p.note ? ' · ' + p.note : ''}</div></div>
        <button class="btn sm" data-act="bls-pay" data-id="${p.id}">${icon('more', 'sm')}</button></div>`) : html`<div class="list-row small muted">Henüz ödeme yok.</div>`}</div></div>
  </div>`);
}
function blsCollect() {
  const o = {};
  $$('[data-blc]').forEach((i) => { o[i.dataset.blc] = i.type === 'checkbox' ? i.checked : i.value; });
  return o;
}
ACT['bls-save'] = (el) => busy(el, async () => {
  const cfg = blsCollect();
  let none = '';
  if (cfg.enforce && BLS.d.cfg.enforce !== '1') {
    const n = BLS.d.units.filter((u) => u.status === 'none').length;
    if (n) {
      none = await new Promise((res) => {
        const m = openModal({ title: 'Ödeme zorunluluğu açılıyor', size: 'narrow', body: html`<p class="small">${n} birimin aboneliği yok. Zorunluluk açılınca bunlar için ne yapılsın?</p>
          <div class="stack" style="gap:6px">${[['trial', `${cfg.trial_days || 30} günlük deneme başlat (önerilir)`], ['comp', 'Ücretsiz tanımla (kısıtlanmasın)'], ['', 'Dokunma (ücretsiz pakete düşer ya da salt okunur olur)']].map(([k, l], i) => html`<label class="ml-opt"><input type="radio" name="blNone" value="${k}" ${i === 0 ? raw('checked') : ''}><span><b>${l}</b></span></label>`)}</div>`,
          foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="blNoneOk">Zorunluluğu aç</button>`, onClose: () => res(null) });
        $('#blNoneOk', m.el).addEventListener('click', () => { const v = $('input[name=blNone]:checked', m.el).value; res(v); m.close(); });
      });
      if (none === null) return;
    }
  }
  try { BLS.d = await api('sa.billing.cfg', { cfg, none_action: none }); toast('Abonelik ayarları kaydedildi'); blSaDraw(); } catch (e) { toast(e.message, 'err'); }
});
ACT['bls-bulk'] = async () => {
  const days = BLS.d.cfg.trial_days || 30;
  if (!(await confirmDialog({ title: 'Deneme başlatılsın mı?', text: `Aboneliği olmayan ${BLS.d.units.filter((u) => u.status === 'none').length} birim için ${days} günlük deneme başlar.`, ok: 'Başlat' }))) return;
  try { BLS.d = await api('sa.billing.bulk', { days }); toast('Deneme başlatıldı'); blSaDraw(); } catch (e) { toast(e.message, 'err'); }
};
ACT['bls-plan'] = (el) => {
  const D = BLS.d; const p = D.plans.find((x) => x.id === +el.dataset.id) || { id: 0, code: '', name: '', descr: '', price_m: 0, price_y: 0, max_users: 0, modules: null, is_free: false, active: true, sort: D.plans.length + 1 };
  const tl = (k) => (k / 100).toFixed(2).replace('.', ',');
  const m = openModal({ title: p.id ? 'Paketi düzenle' : 'Yeni paket', body: html`<form class="stack" id="blsPlanF">
      <div class="grid2"><div class="field"><label>Ad</label><input class="input" name="name" value="${p.name}" required maxlength="80"></div><div class="field"><label>Kod</label><input class="input" name="code" value="${p.code}" maxlength="30" placeholder="otomatik"></div></div>
      <div class="field"><label>Açıklama</label><input class="input" name="descr" value="${p.descr}" maxlength="400"></div>
      <div class="grid3 bl-g3"><div class="field"><label>Aylık fiyat (₺, KDV hariç)</label><input class="input" name="price_m" value="${tl(p.price_m)}" inputmode="decimal"></div>
        <div class="field"><label>Yıllık fiyat (₺, KDV hariç)</label><input class="input" name="price_y" value="${tl(p.price_y)}" inputmode="decimal"></div>
        <div class="field"><label>Kişi sınırı (0 = sınırsız)</label><input class="input" name="max_users" type="number" min="0" value="${p.max_users}"></div></div>
      <label class="small"><input type="checkbox" name="is_free" ${p.is_free ? raw('checked') : ''}> Ücretsiz paket (süresi dolan birimler buna düşer; tek olur)</label>
      <label class="small"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> Satışta (birimler görür)</label>
      <div class="field"><label>Modüller</label><label class="small"><input type="checkbox" name="all_modules" id="blsAll" ${p.modules ? '' : raw('checked')}> Tüm modüller</label>
        <div class="bl-mods" id="blsMods">${Object.entries(D.modules).map(([k, n]) => html`<label class="small"><input type="checkbox" name="mod_${k}" value="${k}" ${!p.modules || p.modules.includes(k) ? raw('checked') : ''}> ${n}</label>`)}</div>
        <p class="tiny faint" style="margin:4px 0 0">Duyurular, belgeler, okuma, kullanıcılar ve ayarlar her pakette vardır.</p></div>
      <div class="field"><label>Sıra</label><input class="input" name="sort" type="number" value="${p.sort}" style="max-width:120px"></div>
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`${p.id ? html`<button class="btn ghost danger" id="blsDel">Sil / satıştan kaldır</button>` : ''}<span class="grow"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" form="blsPlanF" type="submit">Kaydet</button>` });
  const f = $('#blsPlanF', m.el);
  const sync = () => { $('#blsMods', m.el).style.opacity = $('#blsAll', m.el).checked ? '.45' : '1'; };
  $('#blsAll', m.el).addEventListener('change', sync); sync();
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async () => {
      const fd = new FormData(f);
      const body = { id: p.id, name: fd.get('name'), code: fd.get('code'), descr: fd.get('descr'), price_m: fd.get('price_m'), price_y: fd.get('price_y'), max_users: +fd.get('max_users') || 0,
        is_free: !!fd.get('is_free'), active: !!fd.get('active'), all_modules: !!fd.get('all_modules'), sort: +fd.get('sort') || 0, modules: Object.keys(D.modules).filter((k) => fd.get('mod_' + k)) };
      BLS.d = await api('sa.billing.plan', body); m.close(); toast('Paket kaydedildi'); blSaDraw();
    });
  });
  const del = $('#blsDel', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: `${p.name} silinsin mi?`, text: 'Kullanan birim ya da ödeme kaydı varsa silinmez, satıştan kaldırılır.', ok: 'Sil', danger: true }))) return;
    try { BLS.d = await api('sa.billing.plan.del', { id: p.id }); m.close(); toast('Paket kaldırıldı'); blSaDraw(); } catch (e) { toast(e.message, 'err'); }
  });
};
ACT['bls-unit'] = (el) => {
  const D = BLS.d; const u = D.units.find((x) => x.key === el.dataset.k); if (!u) return;
  const paid = D.plans.filter((p) => !p.is_free);
  const m = openModal({ title: `${u.name} · abonelik`, body: html`<div class="stack">
      <div class="small">${u.plan || 'Paket yok'} · ${u.mode} · bitiş ${blDate(u.ends)} · ${u.users} kişi</div>
      <div class="seg seg-block" id="blsOps">${[['activate', 'Etkinleştir'], ['trial', 'Deneme'], ['extend', 'Uzat'], ['other', 'Diğer'], ['hist', 'Geçmiş']].map(([k, l], i) => html`<button type="button" class="${i === 0 ? 'on' : ''}" data-op="${k}">${l}</button>`)}</div>
      <div id="blsOpBody"></div></div>` });
  const body = $('#blsOpBody', m.el);
  const run = async (data, msg) => { try { BLS.d = await api('sa.billing.sub', Object.assign({ key: u.key }, data)); toast(msg); m.close(); blSaDraw(); } catch (e) { toast(e.message, 'err'); } };
  const views = {
    activate: () => html`<p class="small muted">Ödeme dışında (havale, sözleşme, kurum ödemesi) aboneliği elle başlatın ya da uzatın.</p>
      <div class="grid2"><div class="field"><label>Paket</label><select class="select" id="bpPlan">${paid.map((p) => html`<option value="${p.id}" ${p.id === u.plan_id ? raw('selected') : ''}>${p.name}</option>`)}</select></div>
        <div class="field"><label>Süre</label><select class="select" id="bpPer"><option value="month:1">1 ay</option><option value="month:3">3 ay</option><option value="month:6">6 ay</option><option value="year:1" selected>1 yıl</option><option value="until">Belirli tarihe kadar</option></select></div></div>
      <div class="field" id="bpUntilF" style="display:none"><label>Bitiş tarihi</label><input class="input" type="date" id="bpUntil"></div>
      <div class="field"><label>Not</label><input class="input" id="bpNote" maxlength="300" placeholder="ör. 2026 sözleşmesi, havale 12.11"></div>
      <div><button class="btn primary" id="bpGo">Etkinleştir</button></div>`,
    trial: () => html`<div class="field"><label>Deneme süresi (gün)</label><input class="input" type="number" id="btDays" value="${D.cfg.trial_days || 30}" min="1" max="365" style="max-width:140px"></div><div><button class="btn primary" id="btGo">Denemeyi başlat</button></div>`,
    extend: () => html`<p class="small muted">Deneme ya da etkin aboneliğe gün ekleyin.</p><div class="field"><label>Eklenecek gün</label><input class="input" type="number" id="beDays" value="30" min="1" max="730" style="max-width:140px"></div>
      <div class="field"><label>Not</label><input class="input" id="beNote" maxlength="300"></div><div><button class="btn primary" id="beGo">Uzat</button></div>`,
    other: () => html`<div class="field"><label>Not</label><input class="input" id="boNote" maxlength="300" value="${u.note || ''}"></div>
      <div class="row wrap" style="gap:8px"><button class="btn" data-o="note">Notu kaydet</button><button class="btn" data-o="comp">Ücretsiz tanımla</button><button class="btn ghost danger" data-o="suspend">Askıya al</button><button class="btn ghost danger" data-o="reset">Kaydı sıfırla</button></div>
      <p class="tiny faint">Ücretsiz: süresiz, tüm modüller (zorunluluk açıkken bile kısıtlanmaz). Askıya al: süresi dolmuş gibi davranır.</p>`,
    hist: () => html`<div id="bhList">${mkSpin ? mkSpin() : ''}</div>`,
  };
  const show = async (k) => {
    $$('#blsOps button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.op === k));
    setHTML(body, views[k]());
    if (k === 'activate') {
      $('#bpPer', m.el).addEventListener('change', (e) => { $('#bpUntilF', m.el).style.display = e.target.value === 'until' ? '' : 'none'; });
      $('#bpGo', m.el).addEventListener('click', () => { const v = $('#bpPer', m.el).value; const [period, n] = v.split(':'); run({ op: 'activate', plan_id: +$('#bpPlan', m.el).value, period: v === 'until' ? 'year' : period, n: +n || 1, until: v === 'until' ? $('#bpUntil', m.el).value : '', note: $('#bpNote', m.el).value }, 'Abonelik etkinleştirildi'); });
    }
    if (k === 'trial') $('#btGo', m.el).addEventListener('click', () => run({ op: 'trial', days: +$('#btDays', m.el).value }, 'Deneme başlatıldı'));
    if (k === 'extend') $('#beGo', m.el).addEventListener('click', () => run({ op: 'extend', days: +$('#beDays', m.el).value, note: $('#beNote', m.el).value }, 'Süre uzatıldı'));
    if (k === 'other') $$('[data-o]', body).forEach((b) => b.addEventListener('click', async () => {
      const o = b.dataset.o;
      if ((o === 'suspend' || o === 'reset') && !(await confirmDialog({ title: o === 'suspend' ? 'Askıya alınsın mı?' : 'Kayıt sıfırlansın mı?', text: 'Zorunluluk açıksa birim hemen kısıtlanır.', ok: 'Onayla', danger: true }))) return;
      run({ op: o, note: $('#boNote', m.el).value }, 'Kaydedildi');
    }));
    if (k === 'hist') {
      try {
        const r = await api('sa.billing.events', { key: u.key });
        setHTML($('#bhList', m.el), html`<div class="small"><b>Fatura:</b> ${r.billing.title || '—'} · ${r.billing.tax_no || ''} · ${r.billing.city || ''} · ${r.billing.email || ''}</div>
          <div class="list">${r.events.length ? r.events.map((x) => html`<div class="list-row"><div class="grow"><div class="lr-t small">${x.detail || x.kind}</div><div class="lr-s">${fmtDateTime(x.at)} · ${x.who}</div></div></div>`) : html`<div class="list-row small muted">Kayıt yok.</div>`}</div>`);
      } catch (e) { toast(e.message, 'err'); }
    }
  };
  $('#blsOps', m.el).addEventListener('click', (e) => { const b = e.target.closest('[data-op]'); if (b) show(b.dataset.op); });
  show('activate');
};
ACT['bls-pay'] = (el) => {
  const p = BLS.d.payments.find((x) => x.id === +el.dataset.id); if (!p) return;
  const run = async (data, msg) => { try { BLS.d = await api('sa.billing.pay', Object.assign({ id: p.id }, data)); toast(msg); m.close(); blSaDraw(); } catch (e) { toast(e.message, 'err'); } };
  const m = openModal({ title: `Ödeme ${p.oid}`, size: 'narrow', body: html`<div class="stack">
      <div class="small">${p.unit} · ${p.plan} · ${p.period === 'year' ? 'yıllık' : 'aylık'} · <b>${blMoney(p.total)}</b> (${blMoney(p.net)} + KDV ${blMoney(p.kdv)}) · ${BL_PROV[p.provider] || p.provider} · ${(BL_ST[p.status] || [p.status])[0]}</div>
      ${p.status === 'pending' ? html`<div class="field"><label>Banka referansı (isteğe bağlı)</label><input class="input" id="bpRef" maxlength="80"></div>
        <div class="row wrap" style="gap:8px"><button class="btn primary" id="bpPaid">${icon('check', 'sm')}Ödeme alındı · aboneliği uzat</button><button class="btn ghost danger" id="bpCancel">İptal et</button></div>` : ''}
      ${p.status === 'paid' ? html`<div class="field"><label>Fatura numarası</label><div class="row" style="gap:6px"><input class="input grow" id="bpInv" value="${p.invoice_no || ''}" maxlength="60"><button class="btn" id="bpInvGo">Kaydet</button></div></div>
        <button class="btn ghost danger" id="bpRefund">İade edildi olarak işaretle</button>` : ''}</div>` });
  const on = (id, fn) => { const b = $(id, m.el); if (b) b.addEventListener('click', fn); };
  on('#bpPaid', () => run({ op: 'paid', ref: $('#bpRef', m.el).value }, 'Ödeme onaylandı, abonelik uzatıldı'));
  on('#bpCancel', () => run({ op: 'cancel' }, 'Ödeme iptal edildi'));
  on('#bpInvGo', () => run({ op: 'invoice', invoice_no: $('#bpInv', m.el).value }, 'Fatura numarası kaydedildi'));
  on('#bpRefund', async () => { if (await confirmDialog({ title: 'İade edildi mi?', text: 'Kayıt iade olarak işaretlenir; para iadesini sağlayıcı panelinden yapın. Abonelik süresini gerekirse elle kısaltın.', ok: 'İşaretle', danger: true })) run({ op: 'refund' }, 'İade olarak işaretlendi'); });
};
