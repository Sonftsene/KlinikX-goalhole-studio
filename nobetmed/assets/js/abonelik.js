/* dupcii — abonelik ve ödeme (4.15; 4.32 kişi bazlı)
   Her kişi: kendi aboneliği — paket ve süre (1, 3, 12 ay… süper yöneticinin tanımladığı) seçer, fatura bilgisini girer, PayTR / iyzico / havale ile öder.
   Biriminin tamamı süper yöneticice ücretsiz / ödenmiş tanımlıysa ödeme gerekmez. Herkes: süre uyarı şeridi.
   Sistem yöneticisi: ayarlar, sağlayıcılar, paketler (süre başına fiyat), kişilerin abonelikleri, birim tanımları, ödemeler (sistem paneli › Abonelik). */
'use strict';

const BL = { d: null, period: '', poll: 0 };
/** Paketlerdeki tüm süreler (ay sayısına göre sıralı) */
function blPeriods(plans) {
  const m = new Map();
  plans.forEach((p) => (p.durations || []).forEach((d) => { if (!m.has(d.months)) m.set(d.months, d); }));
  return [...m.values()].sort((a, b) => a.months - b.months);
}
function blPer(months) { return months === 1 ? 'ay' : months === 12 ? 'yıl' : months % 12 === 0 ? (months / 12) + ' yıl' : months + ' ay'; }
const BL_ST = { pending: ['Bekliyor', 'warn'], paid: ['Ödendi', 'success'], failed: ['Başarısız', 'danger'], cancelled: ['İptal', ''], refunded: ['İade edildi', ''] };
const BL_PROV = { paytr: 'PayTR', iyzico: 'iyzico', havale: 'Havale / EFT' };
const BL_SHARED_TXT = { mesaj: 'mesajlaşma', ilan: 'nöbet ilanı ve değişim', eksik: 'eksik personel çağrısı' };
const BL_MODE_TONE = { none: '', open: '', trial: 'info', active: 'success', grace: 'warn', comp: 'success', free: 'warn', expired: 'danger' };
function blMoney(k) { return (Number(k || 0) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'; }
function blDate(s) { return s ? `${+s.slice(8, 10)} ${TR_MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '—'; }

NM_EXT.routes.abonelik = (view, r) => blPage(view, r[1]);
NM_EXT.nav.push({ sec: 'genel', href: '#/abonelik', icon: 'wallet', label: 'Abonelik', match: (r) => r[0] === 'abonelik', visible: () => !!(S.billing && S.billing.can_pay) });
Object.assign(NM_EXT.audit, { 'billing.checkout': 'Abonelik ödemesi başlattı', 'billing.info': 'Fatura bilgilerini kaydetti', 'billing.cancel': 'Bekleyen ödemeden vazgeçti' });
NM_EXT.notif.billing = ['emerald', 'wallet'];
NM_EXT.settingsCards.push({
  sec: 'genel',
  html: () => (S.billing && S.billing.can_pay ? html`<div class="card card-pad stack" data-sec="genel"><div><h3 style="font-size:15px">${icon('wallet', 'sm')} Abonelik ve ödeme</h3>
    <p class="small muted">${S.billing.staff ? 'Yönetici / sorumlu olarak ücretsiz kullanıyorsunuz; ödeme yapmanız gerekmez.' : S.billing.sponsor ? 'Biriminizin tamamı kapsamda; ödeme yapmanız gerekmez.' : html`Paketiniz: <b>${(S.billing.plan && S.billing.plan.name) || S.billing.mode_txt}</b>${S.billing.ends ? ` · bitiş ${blDate(S.billing.ends)}` : ''}.`}</p></div>
    <div><a class="btn" href="#/abonelik">${icon('wallet', 'sm')}<span>Abonelik sayfası</span></a></div></div>` : ''),
});

/* ---------------- Uyarı şeridi (herkes) ---------------- */
function blBanner() {
  const box = $('#blBar');
  if (!box) return;
  const b = S.billing;
  if (!b || !b.visible || b.sponsor || b.staff || (S.sa && S.sa.in)) { setHTML(box, ''); return; }
  const go = b.can_pay ? html` <a href="#/abonelik">Aboneliğim</a>` : '';
  let tone = '', txt = '';
  if (b.mode === 'trial' && b.days_left !== null && b.days_left <= 7) { tone = 'warn'; txt = `Deneme süreniz ${b.days_left <= 0 ? 'bugün' : b.days_left + ' gün sonra'} bitiyor.`; }
  else if (b.mode === 'active' && b.days_left !== null && b.days_left <= 7) { tone = 'info'; txt = `Aboneliğiniz ${b.days_left <= 0 ? 'bugün' : b.days_left + ' gün sonra'} bitiyor.`; }
  else if (b.mode === 'grace') { tone = 'warn'; txt = `Aboneliğinizin süresi doldu; ${blDate(b.grace_until)} tarihine kadar yenilenmezse kısıtlanacak.`; }
  else if (b.mode === 'free') { tone = 'info'; txt = 'Ücretsiz paket kullanılıyor; bazı özellikler kapalı.'; }
  else if (b.mode === 'expired') { tone = 'danger'; txt = 'Aboneliğinizin süresi doldu; uygulama yalnız görüntülenebilir.'; }
  if (!txt) { setHTML(box, ''); return; }
  const k = 'nm-blbar-' + b.mode + '-' + ymd(new Date());
  try { if (tone !== 'danger' && localStorage.getItem(k)) { setHTML(box, ''); return; } } catch (e) { /* */ }
  setHTML(box, html`<div class="bl-bar ${tone}" role="status">${icon(tone === 'danger' ? 'alert' : 'wallet', 'sm')}<span class="grow">${txt}${go}</span>${tone !== 'danger' ? html`<button type="button" class="btn ghost icon sm" data-act="bl-bar-x" data-k="${k}" aria-label="Kapat">${icon('x', 'sm')}</button>` : ''}</div>`);
}
ACT['bl-bar-x'] = (el) => { try { localStorage.setItem(el.dataset.k, '1'); } catch (e) { /* */ } setHTML($('#blBar'), ''); };

/* ---------------- Birim yöneticisi: abonelik sayfası ---------------- */
async function blPage(view, sub) {
  setHTML(view, html`<div class="page-head"><div><h1>Abonelik</h1><p>Kendi paketiniz, ödeme ve faturalar. Abonelik kişi başınadır; ödemeyi siz yaparsınız.</p></div></div><div id="blBody">${typeof mkSpin === 'function' ? mkSpin() : ''}</div>`);
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
  const pers = blPeriods(plans);
  if (!pers.some((d) => d.period === BL.period)) BL.period = (pers.find((d) => d.months === 12) || pers[0] || {}).period || '';
  const per = pers.find((d) => d.period === BL.period);
  const card = (p) => {
    const pr = p.prices[BL.period];
    const d1 = (p.durations || []).find((d) => d.months === 1);
    const save = pr && d1 && per && per.months > 1 ? d1.net * per.months - pr.net : 0;
    const mods = p.modules ? p.modules.map((m) => D.modules[m]).filter(Boolean) : null;
    return html`<div class="card bl-plan ${cur === p.id ? 'cur' : ''}">
      <div class="bl-ph"><b>${p.name}</b>${cur === p.id ? html`<span class="badge brand">Mevcut paket</span>` : ''}</div>
      <p class="small muted bl-pd">${p.descr}</p>
      <div class="bl-price">${p.is_free ? html`<b>Ücretsiz</b>` : pr ? html`<b>${blMoney(pr.net)}</b><span class="small muted"> / ${blPer(per.months)} + KDV</span>` : html`<span class="small muted">Bu süre bu pakette yok</span>`}</div>
      ${!p.is_free && pr ? html`<div class="tiny faint">KDV dahil ${blMoney(pr.total)}${per.months > 1 ? ` · aylık ${blMoney(Math.round(pr.net / per.months))}` : ''}${save > 0 ? html` · <b class="bl-save">${blMoney(save)} tasarruf</b>` : ''}</div>` : ''}
      <ul class="bl-feat">${mods ? mods.map((m) => html`<li>${m}</li>`) : html`<li>Tüm modüller</li>`}</ul>
      ${p.is_free || !pr ? '' : html`<button type="button" class="btn ${cur === p.id ? '' : 'primary'} block" data-act="bl-buy" data-id="${p.id}">${cur === p.id && st.mode !== 'trial' ? 'Süreyi uzat' : 'Bu paketi seç'}</button>`}</div>`;
  };
  const pend = D.payments.filter((p) => p.status === 'pending' && p.provider === 'havale');
  setHTML(box, html`
    <div class="card card-pad bl-status">
      <div class="row wrap" style="gap:10px;align-items:center"><span class="cat-ico tone-emerald">${icon('wallet')}</span>
        <div class="grow"><div class="small muted">Aboneliğiniz</div><b style="font-size:17px">${(st.plan && st.plan.name) || 'Paket seçilmedi'}</b> <span class="badge ${BL_MODE_TONE[st.disp || st.mode] || ''}">${st.mode_txt}</span></div>
        <div class="bl-kv"><span class="tiny faint">Bitiş</span><b>${blDate(st.ends)}</b>${st.days_left !== null && st.days_left >= 0 ? html`<span class="tiny faint">${st.days_left} gün kaldı</span>` : ''}</div></div>
      ${st.staff ? html`<div class="mk-box success" style="margin-top:10px" id="blStaff">${icon('check', 'sm')}<span>Birim yöneticisi / sorumlu olduğunuz için tüm özellikler size <b>ücretsiz</b> açık; ödeme yapmanız gerekmez.</span></div>` : ''}
      ${st.enforce && !st.staff && (st.reply_only || []).length ? html`<div class="mk-box" style="margin-top:10px" id="blReply">${icon('chat', 'sm')}<span>Paketinizde ${st.reply_only.map((m) => BL_SHARED_TXT[m] || m).join(', ')} yok: size gelen mesaj, ilan, değişim ve çağrılara <b>yanıt verebilirsiniz</b>; yenisini başlatmak için ücretli paket seçin.</span></div>` : ''}
      ${st.sponsor ? html`<div class="mk-box success" style="margin-top:10px" id="blSponsor">${icon('check', 'sm')}<span>Biriminizin tamamı sistem yöneticisince kapsama alındı${st.ends ? ` (${blDate(st.ends)} tarihine kadar)` : ''}; ödeme yapmanız gerekmez.</span></div>` : ''}
      ${!st.enforce && !st.sponsor && !st.staff ? html`<p class="tiny faint" style="margin:8px 0 0">Şu an tüm özellikler kısıtlamasız açık. İsterseniz şimdiden paket seçip ödeme yapabilirsiniz; süre kalan sürenin üstüne eklenir.</p>` : ''}
      ${st.enforce && !st.sponsor && st.mode === 'free' ? html`<p class="tiny faint" style="margin:8px 0 0">Deneme ya da abonelik süreniz bittiği için ücretsiz paketi kullanıyorsunuz; ücretli paketle tüm özellikler açılır.</p>` : ''}
      ${pend.length ? html`<div class="mk-box warn" style="margin-top:10px">${icon('clock', 'sm')}<span>Havale / EFT ödemeniz onay bekliyor (${pend.map((p) => `${blMoney(p.total)} · kod ${p.oid}`).join(', ')}). Hesaba geçince aboneliğiniz uzatılır.</span></div>` : ''}
    </div>
    <div class="row wrap" style="justify-content:space-between;align-items:center;gap:8px;margin:16px 0 8px"><h3 style="margin:0;font-size:16px">Paketler</h3>
      ${pers.length > 1 ? html`<div class="seg" id="blPers">${pers.map((d) => html`<button type="button" class="${BL.period === d.period ? 'on' : ''}" data-act="bl-period" data-p="${d.period}">${d.label}</button>`)}</div>` : ''}</div>
    <div class="bl-plans">${plans.map(card)}</div>
    <div class="grid2 bl-lower" style="margin-top:16px">
      <div class="card card-pad stack" id="blInfo">${blInfoForm(D.billing)}</div>
      <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Ödemeler</h3></div>
        <div class="list">${D.payments.length ? D.payments.map((p) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.plan} · ${p.period_txt} · <b>${blMoney(p.total)}</b></div>
          <div class="lr-s">${fmtDateTime(p.created_at)} · ${BL_PROV[p.provider] || p.provider} · kod ${p.oid}${p.invoice_no ? ' · fatura ' + p.invoice_no : ''}</div></div>
          <span class="badge ${(BL_ST[p.status] || [])[1] || ''}">${(BL_ST[p.status] || [p.status])[0]}</span>
          ${p.status === 'pending' && p.provider === 'havale' ? html`<button type="button" class="btn sm ghost" data-act="bl-cancel" data-oid="${p.oid}">Vazgeç</button>` : ''}</div>`)
          : html`<div class="list-row small muted">Henüz ödeme yok.</div>`}</div></div></div>`);
}
function blInfoForm(b) {
  return html`<div><h3 style="font-size:15px;margin:0">${icon('file', 'sm')} Fatura bilgileri</h3><p class="tiny faint" style="margin:4px 0 0">Fatura ve makbuz bu bilgilerle düzenlenir.</p></div>
    <form class="stack" data-form="bl-info">
      <div class="field"><label>Ad soyad (ya da şirket unvanı)</label><input class="input" name="title" value="${b.title}" required maxlength="160"></div>
      <div class="grid2"><div class="field"><label>T.C. kimlik no (ya da vergi no)</label><input class="input" name="tax_no" value="${b.tax_no}" inputmode="numeric" required maxlength="11"></div>
        <div class="field"><label>Vergi dairesi (şirketse)</label><input class="input" name="tax_office" value="${b.tax_office}" maxlength="80"></div></div>
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
  const pr = p.prices[BL.period]; if (!pr) return;
  const per = blPeriods(D.plans).find((d) => d.period === BL.period) || { label: '', months: 1 };
  const b = D.billing;
  const infoOk = b.title && b.tax_no && b.address && b.city && b.email && b.phone;
  if (!D.providers.length) { toast('Ödeme yöntemi henüz açılmadı; sistem yöneticisiyle görüşün.', 'err'); return; }
  const m = openModal({ title: `${p.name} · ${per.label}`, body: html`<div class="stack">
      <div class="bl-sum"><div><span>Paket</span><b>${p.name} (${per.months === 12 ? '1 yıl' : per.months + ' ay'})</b></div><div><span>Tutar</span><b>${blMoney(pr.net)}</b></div><div><span>KDV (%${D.kdv})</span><b>${blMoney(pr.kdv)}</b></div><div class="tot"><span>Toplam</span><b>${blMoney(pr.total)}</b></div></div>
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
const BLS = { d: null, q: '', f: '' };
const MODE_U = { none: 'Kişi başı', open: 'Kısıtlama yok', trial: 'Deneme', active: 'Etkin', grace: 'Ek süre', comp: 'Ücretsiz', free: 'Ücretsiz paket', expired: 'Süresi doldu' };
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
  const MODE = MODE_U;
  setHTML(box, html`<div class="stack">
    <div class="bl-stats">${[['Ücretli etkin kişi', s.active], ['Denemede', s.trial], ['Ücretsiz tanımlı kişi', s.comp], ['Süresi dolan', s.expired], ['Kapsama alınan birim', s.units_comp], ['Yönetici / sorumlu (ücretsiz)', s.staff], ['Silinmiş ama süresi olan', s.gone], ['Aylık tekrarlayan (KDV hariç)', blMoney(s.mrr)], ['Bu ay tahsilat', blMoney(s.month_paid)], ['Onay bekleyen havale', s.pending_havale]]
      .map(([l, v]) => html`<div class="card card-pad"><div class="tiny faint">${l}</div><b style="font-size:20px">${v}</b></div>`)}</div>

    <div class="card card-pad stack"><h3 style="font-size:15px;margin:0">${icon('sliders', 'sm')} Genel</h3>
      <p class="small muted" style="margin:0">Abonelik <b>kişi başınadır</b>: her kullanıcı kendi paketini ve süresini seçip öder. İsterseniz aşağıdaki <b>Birimler</b> listesinden bir birimin tamamını ücretsiz ya da ödenmiş tanımlayabilirsiniz.</p>
      ${sw('visible', 'Abonelik sayfası herkese görünsün', 'Kullanıcılar paketleri görür, isterse ödeme yapar. Kısıtlama yapmaz.')}
      ${sw('enforce', 'Ödeme zorunluluğu', 'Açıkken süresi dolan kişi ücretsiz pakete düşer (yoksa salt okunur olur); paketteki modüller uygulanır. Kapalıyken kimse kısıtlanmaz.')}
      ${sw('trial_on', 'Yeni kişilere otomatik deneme', 'Aboneliği olmayan kişi ilk girişte deneme süresini başlatır (gün sayısı aşağıda).')}
      <div class="grid3 bl-g3">${inp('trial_days', 'Deneme süresi (gün)', 'type="number" min="1" max="365"')}${inp('grace_days', 'Süre dolunca ek süre (gün)', 'type="number" min="0" max="60"')}${inp('kdv', 'KDV oranı (%)', 'type="number" min="0" max="100"')}</div>
      <div class="field"><label>Mesafeli satış sözleşmesi ve ön bilgilendirme metni</label><textarea class="textarea" data-blc="terms" rows="4" placeholder="Doldurulursa kullanıcı ödeme öncesi bu metni onaylar; onay (tarih, kişi, IP) ödeme kaydına yazılır. PayTR ve iyzico başvurusunda istenir.">${c.terms}</textarea></div>
      ${sw('remind', 'Hatırlatmalar', 'Deneme / abonelik bitmeden 7, 3, 1 gün önce ve bitince kişinin kendisine bildirim.')}
      <div class="row wrap" style="gap:8px"><button class="btn primary" data-act="bls-save">Kaydet</button><button class="btn" data-act="bls-bulk">Süresi dolan kişilere yeniden deneme</button></div></div>

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
        <div class="field"><label>Ödeme yapana gösterilecek banka bilgisi</label><textarea class="textarea" data-blc="havale_text" rows="3" placeholder="Alıcı: … · Banka: … · IBAN: TR..">${c.havale_text}</textarea></div></div>
      <div><button class="btn primary" data-act="bls-save">Kaydet</button></div></div>

    <div class="card"><div class="card-head"><h3>${icon('layers', 'sm')} Paketler</h3><button class="btn sm primary" data-act="bls-plan" data-id="0">${icon('plus', 'sm')}<span>Paket ekle</span></button></div>
      <div class="list">${D.plans.map((p) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.name} <span class="tiny faint">${p.code}</span>${p.is_free ? html` <span class="badge success">ücretsiz paket</span>` : ''}${p.active ? '' : html` <span class="badge">satışta değil</span>`}</div>
          <div class="lr-s">${p.is_free ? 'Ücretsiz' : (p.durations || []).map((d) => `${d.label} ${blMoney(d.net)}`).join(' · ') + ' (kişi başı, KDV hariç)'} · ${p.modules ? p.modules.length + ' modül' : 'tüm modüller'}</div></div>
        <button class="btn sm" data-act="bls-plan" data-id="${p.id}">${icon('edit', 'sm')}<span>Düzenle</span></button></div>`)}</div></div>

    <div class="card" id="blsPeople"><div class="card-head"><h3>${icon('users', 'sm')} Kişilerin abonelikleri <span class="tiny faint">${D.people.length}</span></h3></div>
      <div class="card-pad row wrap" style="gap:8px;padding-top:0"><input class="input grow" id="blsQ" type="search" placeholder="Ad, e-posta ya da birim ara" value="${BLS.q}" style="min-width:180px">
        <select class="select" id="blsF" style="max-width:180px">${[['', 'Tümü'], ['trial', 'Deneme'], ['active', 'Etkin'], ['comp', 'Ücretsiz'], ['expired', 'Süresi dolan'], ['none', 'Kaydı yok'], ['staff', 'Yönetici / sorumlu'], ['gone', 'Silinmiş / devre dışı']].map(([k, l]) => html`<option value="${k}" ${BLS.f === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
      <div class="list" id="blsPList">${blsPeopleRows()}</div></div>

    <div class="card" id="blsUnits"><div class="card-head"><h3>${icon('building', 'sm')} Birimler (birimin tamamı)</h3></div>
      <p class="tiny faint" style="margin:0;padding:0 16px 8px">Bir birimi ücretsiz ya da ödenmiş tanımlarsanız o birimdeki herkes kapsanır; kimse ayrıca ödeme yapmaz. Tanım bitince herkes kendi aboneliğine döner.</p>
      <div class="list">${D.units.map((u) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${u.hospital ? u.hospital + ' › ' : ''}${u.name} ${u.status === 'none' ? html`<span class="badge">kişi başı</span>` : html`<span class="badge ${modeTone(u.mode)}">${MODE[u.mode] || u.mode}</span>`}${u.frozen ? html` <span class="badge warn">dondurulmuş</span>` : ''}</div>
          <div class="lr-s">${u.status === 'none' ? 'Herkes kendi aboneliğini öder' : `${u.plan || 'paket yok'}${u.period_txt ? ' · ' + u.period_txt : ''} · bitiş ${blDate(u.ends)}`} · ${u.users} kişi${u.note ? ' · ' + u.note : ''}</div></div>
        <button class="btn sm" data-act="bls-unit" data-k="${u.key}">${icon('more', 'sm')}<span>İşlemler</span></button></div>`)}</div></div>

    <div class="card"><div class="card-head"><h3>${icon('history', 'sm')} Ödemeler</h3></div>
      <div class="list">${D.payments.length ? D.payments.map((p) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${p.person && p.payer ? p.payer + ' · ' : ''}${p.unit} · ${p.plan} · ${p.period_txt} · <b>${blMoney(p.total)}</b> <span class="badge ${(BL_ST[p.status] || [])[1] || ''}">${(BL_ST[p.status] || [p.status])[0]}</span></div>
          <div class="lr-s">${fmtDateTime(p.created_at)} · ${BL_PROV[p.provider] || p.provider} · kod ${p.oid}${p.payer ? ' · ' + p.payer : ''}${p.invoice_no ? ' · fatura ' + p.invoice_no : ''}${p.note ? ' · ' + p.note : ''}</div></div>
        <button class="btn sm" data-act="bls-pay" data-id="${p.id}">${icon('more', 'sm')}</button></div>`) : html`<div class="list-row small muted">Henüz ödeme yok.</div>`}</div></div>
  </div>`);
  const q = $('#blsQ', box), f = $('#blsF', box);
  const re = () => { BLS.q = q.value; BLS.f = f.value; setHTML($('#blsPList', box), blsPeopleRows()); };
  q.addEventListener('input', re); f.addEventListener('change', re);
}
const BLS_MODE = { none: 'Kaydı yok', open: 'Kısıtlama yok', trial: 'Deneme', active: 'Etkin', grace: 'Ek süre', comp: 'Ücretsiz', free: 'Ücretsiz paket', expired: 'Süresi doldu' };
function blsPeopleRows() {
  const D = BLS.d; const q = trLower(BLS.q.trim()); const f = BLS.f;
  const rows = D.people.filter((u) => (!q || trLower(`${u.name} ${u.email} ${u.unit} ${u.hospital}`).includes(q))
    && (!f || (f === 'staff' ? u.staff : f === 'gone' ? !!u.acct : f === 'expired' ? ['expired', 'free'].includes(u.mode) : f === 'active' ? ['active', 'grace'].includes(u.mode) : u.mode === f)));
  if (!rows.length) return html`<div class="list-row small muted">${D.people.length ? 'Eşleşen kişi yok.' : 'Henüz kimse giriş yapmadı (kayıt ilk girişte açılır).'}</div>`;
  const more = rows.length > 200 ? rows.length - 200 : 0;
  return html`${rows.slice(0, 200).map((u) => html`<div class="list-row"><div class="grow" style="min-width:0"><div class="lr-t">${u.name} <span class="badge ${BL_MODE_TONE[u.mode] || ''}">${BLS_MODE[u.mode] || u.mode}</span>${u.staff ? html` <span class="badge success">yönetici / sorumlu · ücretsiz</span>` : ''}${u.acct ? html` <span class="badge danger">${u.acct === 'deleted' ? 'hesap silindi' : 'devre dışı'}</span>` : ''}</div>
      <div class="lr-s">${u.hospital ? u.hospital + ' › ' : ''}${u.unit}${u.email ? ' · ' + u.email : ''} · ${u.plan || 'paket yok'}${u.period_txt ? ' · ' + u.period_txt : ''} · bitiş ${blDate(u.ends)}${u.days_left !== null ? ` (${u.days_left} gün)` : ''}${u.note ? ' · ' + u.note : ''}</div></div>
    <button class="btn sm" data-act="bls-unit" data-k="${u.key}">${icon('more', 'sm')}<span>İşlemler</span></button></div>`)}${more ? html`<div class="list-row small muted">+${more} kişi daha; aramayı daraltın.</div>` : ''}`;
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
    const n = BLS.d.people.filter((u) => u.status === 'none').length;
    if (n) {
      none = await new Promise((res) => {
        const m = openModal({ title: 'Ödeme zorunluluğu açılıyor', size: 'narrow', body: html`<p class="small">${n} kişinin aboneliği yok. Zorunluluk açılınca bunlar için ne yapılsın?</p>
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
  const n = BLS.d.people.filter((u) => u.status === 'none' || ['expired', 'free'].includes(u.mode)).length;
  if (!n) { toast('Süresi dolan ya da kaydı olmayan kişi yok'); return; }
  if (!(await confirmDialog({ title: 'Deneme başlatılsın mı?', text: `Süresi dolan ya da kaydı olmayan ${n} kişi için ${days} günlük deneme başlar.`, ok: 'Başlat' }))) return;
  try { BLS.d = await api('sa.billing.bulk', { days }); toast('Deneme başlatıldı'); blSaDraw(); } catch (e) { toast(e.message, 'err'); }
};
ACT['bls-plan'] = (el) => {
  const D = BLS.d; const p = D.plans.find((x) => x.id === +el.dataset.id) || { id: 0, code: '', name: '', descr: '', durations: [{ months: 1, net: 0 }, { months: 3, net: 0 }, { months: 12, net: 0 }], modules: null, is_free: false, active: true, sort: D.plans.length + 1 };
  const tl = (k) => (k / 100).toFixed(2).replace('.', ',');
  const m = openModal({ title: p.id ? 'Paketi düzenle' : 'Yeni paket', body: html`<form class="stack" id="blsPlanF">
      <div class="grid2"><div class="field"><label>Ad</label><input class="input" name="name" value="${p.name}" required maxlength="80"></div><div class="field"><label>Kod</label><input class="input" name="code" value="${p.code}" maxlength="30" placeholder="otomatik"></div></div>
      <div class="field"><label>Açıklama</label><input class="input" name="descr" value="${p.descr}" maxlength="400"></div>
      <div class="field" id="blsDurF"><label>Süreler ve fiyatlar (kişi başı, ₺, KDV hariç)</label>
        <div class="stack" id="blsDur" style="gap:6px">${(p.durations && p.durations.length ? p.durations : [{ months: 1, net: 0 }]).map((d) => blsDurRow(d.months, tl(d.net)))}</div>
        <div class="row wrap" style="gap:6px;margin-top:6px"><button type="button" class="btn sm" id="blsDurAdd">${icon('plus', 'sm')}<span>Süre ekle</span></button>
          ${[1, 3, 6, 12].map((n) => html`<button type="button" class="btn sm ghost" data-dur="${n}">${n === 12 ? '1 yıl' : n + ' ay'}</button>`)}</div>
        <p class="tiny faint" style="margin:4px 0 0">İstediğiniz kadar süre ekleyin (1–36 ay). Kullanıcı bu sürelerden birini seçer; birden uzun sürelerde aylığa göre tasarruf kendiliğinden gösterilir.</p></div>
      <label class="small"><input type="checkbox" name="is_free" ${p.is_free ? raw('checked') : ''}> Ücretsiz paket (süresi dolan kişiler buna düşer; tek olur)</label>
      <label class="small"><input type="checkbox" name="active" ${p.active ? raw('checked') : ''}> Satışta (kullanıcılar görür)</label>
      <div class="field"><label>Modüller</label><label class="small"><input type="checkbox" name="all_modules" id="blsAll" ${p.modules ? '' : raw('checked')}> Tüm modüller</label>
        <div class="bl-mods" id="blsMods">${Object.entries(D.modules).map(([k, n]) => html`<label class="small"><input type="checkbox" name="mod_${k}" value="${k}" ${!p.modules || p.modules.includes(k) ? raw('checked') : ''}> ${n}</label>`)}</div>
        <p class="tiny faint" style="margin:4px 0 0">Duyurular, belgeler, okuma, kullanıcılar ve ayarlar her pakette vardır.</p></div>
      <div class="field"><label>Sıra</label><input class="input" name="sort" type="number" value="${p.sort}" style="max-width:120px"></div>
      <div class="form-error hidden" data-err></div></form>`,
    foot: html`${p.id ? html`<button class="btn ghost danger" id="blsDel">Sil / satıştan kaldır</button>` : ''}<span class="grow"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" form="blsPlanF" type="submit">Kaydet</button>` });
  const f = $('#blsPlanF', m.el);
  const sync = () => { $('#blsMods', m.el).style.opacity = $('#blsAll', m.el).checked ? '.45' : '1'; };
  $('#blsAll', m.el).addEventListener('change', sync); sync();
  const dur = $('#blsDur', m.el);
  const addDur = (n) => { if (n && $$('[data-dm]', dur).some((i) => +i.value === n)) return; dur.insertAdjacentHTML('beforeend', String(blsDurRow(n || '', ''))); const last = $$('[data-dp]', dur).pop(); if (last) last.focus(); };
  $('#blsDurAdd', m.el).addEventListener('click', () => addDur(0));
  $$('[data-dur]', m.el).forEach((b) => b.addEventListener('click', () => addDur(+b.dataset.dur)));
  dur.addEventListener('click', (e) => { const x = e.target.closest('[data-durx]'); if (x) x.closest('.bls-dur').remove(); });
  const freeSync = () => { $('#blsDurF', m.el).style.display = $('[name=is_free]', m.el).checked ? 'none' : ''; };
  $('[name=is_free]', m.el).addEventListener('change', freeSync); freeSync();
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitForm(f, async () => {
      const fd = new FormData(f);
      const prices = $$('.bls-dur', dur).map((r) => ({ months: +$('[data-dm]', r).value || 0, price: $('[data-dp]', r).value })).filter((x) => x.months > 0 && String(x.price).trim() !== '');
      const body = { id: p.id, name: fd.get('name'), code: fd.get('code'), descr: fd.get('descr'), prices,
        is_free: !!fd.get('is_free'), active: !!fd.get('active'), all_modules: !!fd.get('all_modules'), sort: +fd.get('sort') || 0, modules: Object.keys(D.modules).filter((k) => fd.get('mod_' + k)) };
      BLS.d = await api('sa.billing.plan', body); m.close(); toast('Paket kaydedildi'); blSaDraw();
    });
  });
  const del = $('#blsDel', m.el);
  if (del) del.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: `${p.name} silinsin mi?`, text: 'Kullanan kişi ya da ödeme kaydı varsa silinmez, satıştan kaldırılır.', ok: 'Sil', danger: true }))) return;
    try { BLS.d = await api('sa.billing.plan.del', { id: p.id }); m.close(); toast('Paket kaldırıldı'); blSaDraw(); } catch (e) { toast(e.message, 'err'); }
  });
};
function blsDurRow(months, price) {
  return html`<div class="row bls-dur" style="gap:6px;align-items:center"><input class="input" data-dm type="number" min="1" max="36" value="${months}" style="max-width:90px" aria-label="Ay"><span class="small muted">ay</span>
    <input class="input grow" data-dp value="${price}" inputmode="decimal" placeholder="Fiyat (₺)" aria-label="Fiyat"><button type="button" class="btn ghost icon sm" data-durx aria-label="Süreyi kaldır">${icon('x', 'sm')}</button></div>`;
}
ACT['bls-unit'] = (el) => {
  const D = BLS.d; const unit = D.units.find((x) => x.key === el.dataset.k); const u = unit || D.people.find((x) => x.key === el.dataset.k); if (!u) return;
  const paid = D.plans.filter((p) => !p.is_free);
  const pers = blPeriods(paid);
  const perOpts = [...new Set([1, 3, 6, 12, ...pers.map((d) => d.months)])].sort((a, b) => a - b);
  const m = openModal({ title: `${u.name} · ${unit ? 'birimin tamamı' : 'abonelik'}`, body: html`<div class="stack">
      <div class="small">${unit ? '' : `${u.hospital ? u.hospital + ' › ' : ''}${u.unit}${u.email ? ' · ' + u.email : ''} · `}${u.plan || 'Paket yok'} · ${(unit ? MODE_U : BLS_MODE)[u.mode] || u.mode} · bitiş ${blDate(u.ends)}${unit ? ` · ${u.users} kişi` : ''}</div>
      ${unit ? html`<p class="tiny faint" style="margin:0">Buradaki tanım birimdeki herkesi kapsar (sponsor). Etkin ya da ücretsiz olduğu sürece kimse ayrıca ödeme yapmaz; “Kaydı sıfırla” ile herkes kendi aboneliğine döner.</p>` : ''}
      <div class="seg seg-block" id="blsOps">${[['activate', 'Etkinleştir'], ['trial', 'Deneme'], ['extend', 'Uzat'], ['other', 'Diğer'], ['hist', 'Geçmiş']].map(([k, l], i) => html`<button type="button" class="${i === 0 ? 'on' : ''}" data-op="${k}">${l}</button>`)}</div>
      <div id="blsOpBody"></div></div>` });
  const body = $('#blsOpBody', m.el);
  const run = async (data, msg) => { try { BLS.d = await api('sa.billing.sub', Object.assign({ key: u.key }, data)); toast(msg); m.close(); blSaDraw(); } catch (e) { toast(e.message, 'err'); } };
  const views = {
    activate: () => html`<p class="small muted">Ödeme dışında (havale, sözleşme, kurum ödemesi) aboneliği elle başlatın ya da uzatın.</p>
      <div class="grid2"><div class="field"><label>Paket</label><select class="select" id="bpPlan">${paid.map((p) => html`<option value="${p.id}" ${p.id === u.plan_id ? raw('selected') : ''}>${p.name}</option>`)}</select></div>
        <div class="field"><label>Süre</label><select class="select" id="bpPer">${perOpts.map((n) => html`<option value="m${n}" ${n === 12 ? raw('selected') : ''}>${n === 12 ? '1 yıl' : n === 24 ? '2 yıl' : n + ' ay'}</option>`)}<option value="until">Belirli tarihe kadar</option></select></div></div>
      <div class="field" id="bpUntilF" style="display:none"><label>Bitiş tarihi</label><input class="input" type="date" id="bpUntil"></div>
      <div class="field"><label>Not</label><input class="input" id="bpNote" maxlength="300" placeholder="ör. 2026 sözleşmesi, havale 12.11"></div>
      <div><button class="btn primary" id="bpGo">Etkinleştir</button></div>`,
    trial: () => html`<div class="field"><label>Deneme süresi (gün)</label><input class="input" type="number" id="btDays" value="${D.cfg.trial_days || 30}" min="1" max="365" style="max-width:140px"></div><div><button class="btn primary" id="btGo">Denemeyi başlat</button></div>`,
    extend: () => html`<p class="small muted">Deneme ya da etkin aboneliğe gün ekleyin.</p><div class="field"><label>Eklenecek gün</label><input class="input" type="number" id="beDays" value="30" min="1" max="730" style="max-width:140px"></div>
      <div class="field"><label>Not</label><input class="input" id="beNote" maxlength="300"></div><div><button class="btn primary" id="beGo">Uzat</button></div>`,
    other: () => html`<div class="field"><label>Not</label><input class="input" id="boNote" maxlength="300" value="${u.note || ''}"></div>
      <div class="row wrap" style="gap:8px"><button class="btn" data-o="note">Notu kaydet</button><button class="btn" data-o="comp">Ücretsiz tanımla</button><button class="btn ghost danger" data-o="suspend">Askıya al</button><button class="btn ghost danger" data-o="reset">Kaydı sıfırla</button></div>
      <p class="tiny faint">Ücretsiz: süresiz, tüm modüller (zorunluluk açıkken bile kısıtlanmaz). Askıya al: süresi dolmuş gibi davranır.</p>
      ${unit ? '' : html`<div class="field" style="margin-top:6px"><label>Aboneliği başka hesaba taşı (birim değiştiren kişi)</label>
        <div class="row wrap" style="gap:6px"><select class="select grow" id="boTo"><option value="">Hesap seçin</option>${D.people.filter((x) => x.key !== u.key && !x.acct && /^[^#]+#u\d+$/.test(x.key)).map((x) => html`<option value="${x.key}">${x.name} · ${x.hospital ? x.hospital + ' › ' : ''}${x.unit}${x.email ? ' · ' + x.email : ''}</option>`)}</select><button class="btn" data-o="move">Taşı</button></div>
        <p class="tiny faint" style="margin:4px 0 0">Kalan süre, ödemeler ve fatura bilgisi yeni hesaba geçer; bu kayıt sıfırlanır. Yeni hesap en az bir kez giriş yapmış olmalı.</p></div>`}`,
    hist: () => html`<div id="bhList">${mkSpin ? mkSpin() : ''}</div>`,
  };
  const show = async (k) => {
    $$('#blsOps button', m.el).forEach((b) => b.classList.toggle('on', b.dataset.op === k));
    setHTML(body, views[k]());
    if (k === 'activate') {
      $('#bpPer', m.el).addEventListener('change', (e) => { $('#bpUntilF', m.el).style.display = e.target.value === 'until' ? '' : 'none'; });
      $('#bpGo', m.el).addEventListener('click', () => { const v = $('#bpPer', m.el).value; run({ op: 'activate', plan_id: +$('#bpPlan', m.el).value, period: v === 'until' ? 'm12' : v, n: 1, until: v === 'until' ? $('#bpUntil', m.el).value : '', note: $('#bpNote', m.el).value }, 'Abonelik etkinleştirildi'); });
    }
    if (k === 'trial') $('#btGo', m.el).addEventListener('click', () => run({ op: 'trial', days: +$('#btDays', m.el).value }, 'Deneme başlatıldı'));
    if (k === 'extend') $('#beGo', m.el).addEventListener('click', () => run({ op: 'extend', days: +$('#beDays', m.el).value, note: $('#beNote', m.el).value }, 'Süre uzatıldı'));
    if (k === 'other') $$('[data-o]', body).forEach((b) => b.addEventListener('click', async () => {
      const o = b.dataset.o;
      if (o === 'move') {
        const to = $('#boTo', m.el).value;
        if (!to) { toast('Taşınacak hesabı seçin', 'err'); return; }
        const dst = D.people.find((x) => x.key === to);
        if (!(await confirmDialog({ title: 'Abonelik taşınsın mı?', text: `${u.name} kişisinin aboneliği ${dst ? dst.name + ' (' + dst.unit + ')' : 'seçilen'} hesabına taşınır; bu kayıt sıfırlanır.`, ok: 'Taşı' }))) return;
        run({ op: 'move', to, note: $('#boNote', m.el).value }, 'Abonelik taşındı');
        return;
      }
      if ((o === 'suspend' || o === 'reset') && !(await confirmDialog({ title: o === 'suspend' ? 'Askıya alınsın mı?' : 'Kayıt sıfırlansın mı?', text: unit ? 'Birimdeki herkes kendi aboneliğine döner; zorunluluk açıksa süresi dolanlar hemen kısıtlanır.' : 'Zorunluluk açıksa kişi hemen kısıtlanır.', ok: 'Onayla', danger: true }))) return;
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
      <div class="small">${p.person && p.payer ? p.payer + ' · ' : ''}${p.unit} · ${p.plan} · ${p.period_txt} · <b>${blMoney(p.total)}</b> (${blMoney(p.net)} + KDV ${blMoney(p.kdv)}) · ${BL_PROV[p.provider] || p.provider} · ${(BL_ST[p.status] || [p.status])[0]}</div>
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
