/* dupcii — güncelleme (4.24): yeni sürüm paketini uygulamanın içinden yükleme, bakım modu, geri alma.
   Çok birimlide sistem yöneticisi (Sistem yönetimi › Site ve yedek), tek birimlide birim yöneticisi (Ayarlar › Genel). */
'use strict';

const UPC = { pre: 'update', info: null, pkg: null, busy: false };

NM_EXT.settingsCards.push({
  sec: 'genel', admin: true,
  html: () => (S.up_admin ? html`<div data-sec="genel"><div id="upBox"></div></div>` : ''),
  mount: () => { if (S.up_admin && $('#upBox')) upDraw($('#upBox'), 'update'); },
});

async function upDraw(box, pre) {
  box = box || $('#upBox'); if (!box) return;
  UPC.pre = pre || UPC.pre; UPC.box = box;
  if (!UPC.info) { try { UPC.info = await api(UPC.pre + '.info'); } catch (e) { return setHTML(box, html`<div class="card card-pad small">${e.message}</div>`); } }
  const I = UPC.info; const P = UPC.pkg;
  const lock = I.lock;
  setHTML(box, html`<div class="card card-pad stack up-card">
    <h3 style="font-size:15px;margin:0">${icon('download', 'sm')} Güncelleme</h3>
    <p class="small muted" style="margin:0">Kurulu sürüm <b>${I.current}</b>${I.last ? html` · son güncelleme ${fmtDate(I.last.at)} ${I.last.at.slice(11, 16)}: ${I.last.from} → ${I.last.to}${I.last.rollback ? ' (geri alındı)' : I.last.files != null ? ` · ${I.last.files} dosya, ${I.last.secs} sn` : ''}${I.last.by ? ' · ' + I.last.by : ''}` : ''}</p>
    ${lock && lock.kind === 'manual' ? html`<div class="mk-box warn">${icon('alert', 'sm')}<span class="grow">Bakım modu açık (${new Date(lock.until * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} kadar). Kişilerin işlemleri bekletiliyor; dosyaları değiştirmeyi bitirince kapatın.</span><button class="btn sm primary" data-act="up-maint" data-m="0">Bakım modunu kapat</button></div>` : ''}
    ${!I.zip || !I.writable ? html`<div class="mk-box warn">${icon('alert', 'sm')}<span>${!I.zip ? 'Sunucudaki PHP “zip” eklentisi yok.' : 'Site dosyaları PHP tarafından yazılamıyor.'} Güncellemeyi dosya yöneticisiyle yapın; önce aşağıdan Bakım modunu açın.</span></div>` : html`
    <ol class="up-steps"><li>Yeni <b>dupcii-hostinger.zip</b> dosyasını seçin; paket denetlenir (sürüm, eksik ya da bozuk dosya).</li>
      <li>“Güncellemeyi uygula”: dosyalar birkaç saniyede değişir. O sırada yapılan işlemler bekletilir ve kendiliğinden tamamlanır; kimsenin işi yarıda kalmaz.</li>
      <li>Açık sayfalar yeni sürüme kişi sayfa değiştirirken geçer; formlara yazılanlar silinmez. Veriler (data, uploads, config.php) hiç değişmez.</li></ol>
    <div class="up-row"><label class="btn ${P ? '' : 'primary'}">${icon('upload', 'sm')}<span>${P ? 'Başka paket seç' : 'Güncelleme paketini seç (.zip)'}</span><input type="file" accept=".zip,application/zip" hidden data-change="up-file"></label>
      ${UPC.busy ? html`<span class="small muted"><span class="spinner sm"></span> ${UPC.busy}</span>` : ''}</div>
    ${P ? html`<div class="mk-box ${P.cmp > 0 ? '' : 'warn'}">${icon(P.cmp > 0 ? 'checkCircle' : 'alert', 'sm')}<span class="grow">Paket <b>${P.version}</b> (kurulu ${P.current}) · ${P.files} dosya, ${P.changed} değişen, ${P.added} yeni${P.cmp === 0 ? ' · aynı sürüm (yeniden kurulur)' : P.cmp < 0 ? ' · ESKİ sürüm' : ''}</span></div>
      <div class="up-row"><button class="btn primary" data-act="up-apply" ${UPC.busy ? raw('disabled') : ''}>${icon('check', 'sm')}Güncellemeyi uygula</button><button class="btn ghost" data-act="up-cancel">Vazgeç</button></div>` : ''}`}
    ${I.rollback ? html`<div class="up-row tiny faint">Sorun çıkarsa: <button class="btn sm" data-act="up-rollback">${icon('history', 'sm')}Geri al (${I.rollback.to} sürümüne dön)</button></div>` : ''}
    <details><summary class="small">Dosya yöneticisiyle (elle) güncelleyecekseniz</summary>
      <p class="small muted">Hostinger dosya yöneticisinde zip açılırken dosyalar tek tek değişir. Önce bakım modunu açın: kişilerin işlemleri bekletilir, yarıda kalmaz. Bitince kapatın (süre dolunca kendiliğinden kapanır).</p>
      <div class="up-row"><select class="select" id="upMin" style="width:auto"><option value="5">5 dakika</option><option value="15" selected>15 dakika</option><option value="30">30 dakika</option><option value="60">60 dakika</option></select>
        <button class="btn" data-act="up-maint">${icon('clock', 'sm')}Bakım modunu aç</button></div></details>
  </div>`);
}
CHANGE['up-file'] = async (el) => {
  const f = el.files && el.files[0]; el.value = '';
  if (!f) return;
  if (!/\.zip$/i.test(f.name)) return toast('ZIP dosyası seçin (dupcii-hostinger.zip).', 'err');
  UPC.busy = 'Paket yükleniyor ve denetleniyor…'; UPC.pkg = null; upDraw();
  try {
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Dosya okunamadı.')); r.readAsDataURL(f); });
    const d = await api(UPC.pre + '.check', { zip: data, name: f.name });
    UPC.pkg = d.pkg; UPC.info = d;
  } catch (e) { toast(e.message, 'err'); }
  UPC.busy = false; upDraw();
};
ACT['up-cancel'] = () => { UPC.pkg = null; upDraw(); };
ACT['up-apply'] = async () => {
  const P = UPC.pkg; if (!P) return;
  if (P.cmp < 0 && !(await confirmDialog({ title: 'Eski sürüm kurulsun mu?', text: `Paket (${P.version}) kurulu sürümden (${P.current}) eski.`, ok: 'Yine de kur', danger: true }))) return;
  UPC.busy = 'Güncelleniyor… (birkaç saniye)'; upDraw();
  try {
    const r = await api(UPC.pre + '.apply', { sha: P.sha, downgrade: P.cmp < 0 });
    toast(`${r.to} kuruldu (${r.files} dosya, ${r.secs} sn). Kişiler sayfa değiştirirken yeni sürüme geçer.`);
    UPC.pkg = null; UPC.info = null; UPC.busy = false;
    upDraw();
    setTimeout(() => { if (typeof newVersionNotice === 'function') newVersionNotice(r.to); }, 800);
  } catch (e) { UPC.busy = false; toast(e.message, 'err'); upDraw(); }
};
ACT['up-rollback'] = async () => {
  const R = UPC.info && UPC.info.rollback; if (!R) return;
  if (!(await confirmDialog({ title: `${R.to} sürümüne dönülsün mü?`, text: `Son güncellemede değişen dosyalar eski hâline döner (${R.from} → ${R.to}). Veriler etkilenmez.`, ok: 'Geri al', danger: true }))) return;
  try { const r = await api(UPC.pre + '.rollback'); toast(`${r.to} sürümüne dönüldü`); UPC.info = null; upDraw(); setTimeout(() => newVersionNotice(r.to), 800); } catch (e) { toast(e.message, 'err'); }
};
ACT['up-maint'] = async (el) => {
  const m = el.dataset.m === '0' ? 0 : +(($('#upMin') || {}).value || 15);
  try { UPC.info = await api(UPC.pre + '.maint', { minutes: m }); toast(m ? `Bakım modu ${m} dakika açık` : 'Bakım modu kapatıldı'); upDraw(); } catch (e) { toast(e.message, 'err'); }
};
NM_EXT.audit['update.apply'] = 'Güncelleme kuruldu'; NM_EXT.audit['update.rollback'] = 'Güncelleme geri alındı'; NM_EXT.audit['update.maint'] = 'Bakım modu';
