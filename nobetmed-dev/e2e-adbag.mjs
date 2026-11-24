// Liste adı ↔ hesap kalıcı bağı, bağlı adın korunması, ana sayfa kısayolları, kura silme kuralı (4.44.0) — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır (elif@test.com şifresi orada değişir):
//   node e2e-adbag.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const call = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y), [a, d]);
const err = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y).then(() => 'kabul', (e) => e.message || String(e.status)), [a, d]);
const expectText = async (p, t, timeout = 8000) => { try { await p.getByText(t, { exact: false }).first().waitFor({ timeout }); } catch (e) { await p.screenshot({ path: path.join(OUT, 'FAIL-adbag.png') }); throw e; } };

try {
  const A = await ctx('ayse', false); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const E = await ctx('elif', true); await login(E.p, 'elif@test.com', 'YeniSifre99');
  const B = await ctx('burak', false); await login(B.p, 'burak@test.com', 'Sifre1234');

  // 1) Kendiliğinden bağ: listedeki ad hesaba bağlanır
  await call(A.p, 'names.auto');
  let L = await call(A.p, 'names.list');
  const eu = L.users.find((u) => u.name === 'Elif Yılmaz');
  if (!eu) throw new Error('Elif hesabı yok');
  const en = L.names.find((x) => x.uid === eu.id);
  if (!en || !eu.links.length) fail('Elif listedeki adına kendiliğinden bağlanmadı: ' + JSON.stringify({ en, links: eu.links }));
  const LIST = en ? en.name : 'Elif Yılmaz';
  const before = (await call(E.p, 'shifts.my')).entries.length;
  if (!before) fail('Elif’in nöbeti yok (test verisi)');
  step(`kendiliğinden bağ: “${LIST}” ↔ Elif Yılmaz hesabı; ${L.names.length} liste adından ${L.names.filter((x) => x.uid !== null).length} tanesi bağlı`);

  // 2) Bağlı kişi adını kendisi değiştiremez; başkası bu adı alamaz
  const e1 = await err(E.p, 'me.update', { name: 'Elif Yılmaz Başka' });
  if (!/bağlı/.test(e1)) fail('bağlı kişi adını değiştirebildi: ' + e1);
  const e2 = await err(B.p, 'me.update', { name: 'Elif Yılmaz' });
  if (e2 === 'kabul') fail('başka biri bağlı adı aldı');
  await E.p.goto(BASE + '#/profil/bilgiler');
  await E.p.locator('[data-form=me-profile] [name=name][readonly]').waitFor({ timeout: 6000 }).catch(() => fail('Kişisel bilgilerde ad alanı kilitli değil'));
  await E.p.screenshot({ path: path.join(OUT, 'adbag-profil.png') });
  step('bağlı kişi adını değiştiremiyor (ad alanı kilitli, sunucu reddediyor); Burak “Elif Yılmaz” adını alamadı');

  // 3) Liste adı değişti (ör. Excel’de düzeltildi): yönetici yeni adı bağlar → hesap adı güncellenir, nöbetler kopmaz
  const NEW = 'Elif Yılmazer Deneme';
  const r1 = await call(A.p, 'names.link', { user_id: eu.id, name: NEW, sync: true });
  if (r1.name !== NEW) fail('hesap adı yeni liste adına güncellenmedi: ' + r1.name);
  const after = (await call(E.p, 'shifts.my')).entries.length;
  if (after !== before) fail(`ad değişince nöbetler koptu: ${before} → ${after}`);
  const bootName = (await call(E.p, 'boot')).me.name;
  if (bootName !== NEW) fail('kişinin hesap adı güncellenmedi: ' + bootName);
  // geri al
  await call(A.p, 'names.link', { user_id: eu.id, name: 'Elif Yılmaz', sync: true });
  L = await call(A.p, 'names.list');
  const al = L.users.find((u) => u.id === eu.id).links.find((x) => x.name === NEW);
  if (al) await call(A.p, 'names.unlink', { id: al.id });
  if ((await call(E.p, 'boot')).me.name !== 'Elif Yılmaz') fail('ad geri alınamadı');
  step(`liste adı “${NEW}” olarak değişince hesap adı da değişti, nöbetler kopmadı (${before} kayıt); geri alındı`);

  // 4) Yönetici kartı: Ayarlar › Nöbet › Liste adları ve hesaplar
  await A.p.goto(BASE + '#/yonetim/ayarlar/nobet');
  await A.p.locator('#nlCard .nl-list').waitFor({ timeout: 10000 });
  await A.p.click('#nlCard [data-act=nl-f][data-f=bound]');
  await A.p.locator('#nlCard .list-row', { hasText: LIST }).first().waitFor();
  await A.p.locator('#nlCard').screenshot({ path: path.join(OUT, 'adbag-yonetim.png') });
  step('yönetici kartı: bağlı / bağsız liste adları, elle bağlama ve bağı kaldırma');

  // 5) Kısayollar kişiye özel: Telefon rehberi çıkarılır, Takvimim eklenir; sayfa yenilenince de durur
  await E.p.goto(BASE + '#/');
  await E.p.locator('[data-act=chips-edit]').click();
  const telI = await E.p.evaluate(() => { const cat = chipCatalog(); return chipList().filter((id) => cat.some((k) => k.id === id)).indexOf('telefon'); });
  if (telI >= 0) await E.p.click(`#chE [data-ch=del][data-i="${telI}"]`);
  await E.p.click('#chE [data-ch=add][data-id="p:#/nobetim"]');
  await E.p.click('#chSave');
  await expectText(E.p, 'Kısayollar kaydedildi');
  await E.p.waitForTimeout(900);
  await E.p.reload(); await E.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await E.p.locator('[data-home=chips] a').first().waitFor();
  const hrefs = await E.p.evaluate(() => [...document.querySelectorAll('[data-home=chips] a')].map((a) => a.getAttribute('href')));
  if (!hrefs.includes('#/nobetim') || hrefs.includes('#/telefon')) fail('kısayol değişikliği kaydedilmedi: ' + hrefs.join(' '));
  await E.p.screenshot({ path: path.join(OUT, 'adbag-kisayol.png') });
  await call(E.p, 'me.prefs.save', { kind: 'ui', value: { chips: null } });
  step('kısayollar: Telefon rehberi çıkarıldı, Takvimim eklendi; sayfa yenilenince de aynı (hesaba kaydedildi); varsayılana dönüldü');

  // 6) Kura: kartı açılmış kurayı başlatan üye silemez, yönetici siler
  const d = (await call(E.p, 'kura.start', { title: 'Silme deneme', items: ['A', 'B', 'C'], opts: {} })).draw;
  await call(E.p, 'kura.reveal', { id: d.id, idx: 0 });
  const e3 = await err(E.p, 'kura.delete', { id: d.id });
  if (e3 === 'kabul') fail('kartı açılmış kura başlatan üye tarafından silindi');
  if ((await err(A.p, 'kura.delete', { id: d.id })) !== 'kabul') fail('yönetici kurayı silemedi');
  step('kura: kartı açılmış kurayı başlatan üye silemedi (adalet), yönetici sildi');

  // 7) E-posta tasarımı: stil + renk + logo (PNG’ye çevrilir) + genişlik → kaydet; önizlemede görünür; logo girişsiz açılır
  await A.p.goto(BASE + '#/yonetim/ayarlar/bildirim');
  await A.p.locator('#mdCard .md-styles').waitFor({ timeout: 10000 });
  await A.p.click('#mdCard [data-act=md-style][data-k=bant]');
  await A.p.click('#mdCard [data-act=md-col][data-c="#1d4ed8"]');
  await A.p.setInputFiles('#mdCard input[data-change=md-logo]', path.join(path.dirname(new URL(import.meta.url).pathname), 'fixture.png'));
  await expectText(A.p, 'E-posta logosu yüklendi');
  await A.p.locator('#mdCard .md-logo img').waitFor();
  await A.p.evaluate(() => { const r = document.querySelector('#mdCard [data-input=md-w]'); r.value = '90'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await A.p.click('#mdCard [data-act=md-save]');
  await expectText(A.p, 'E-posta tasarımı kaydedildi');
  const md = await call(A.p, 'mail.design.get');
  if (md.design.style !== 'bant' || md.design.accent !== '#1d4ed8' || md.design.logo_w !== 90 || !md.logo) fail('e-posta tasarımı kaydedilmedi: ' + JSON.stringify(md.design));
  const pv = (await call(A.p, 'mail.preview', { design: md.design })).html;
  if (!/<img src="http[^"]+action=brand&amp;f=mail_logo/.test(pv) || !pv.includes('width="90"') || !pv.includes('#1d4ed8')) fail('önizlemede logo / renk / genişlik yok');
  await A.p.waitForFunction(() => { const f = document.getElementById('mdIf'); return f && /Yarın nöbetiniz var/.test(f.srcdoc || ''); }, null, { timeout: 8000 }).catch(() => fail('önizleme çerçevesi dolmadı'));
  await A.p.waitForTimeout(600);
  await A.p.locator('#mdCard').screenshot({ path: path.join(OUT, 'adbag-eposta.png') });
  const anon = await browser.newContext();
  const lr = await anon.request.get(BASE + md.logo);
  if (lr.status() !== 200 || !/image\/png/.test(lr.headers()['content-type'] || '')) fail('e-posta logosu girişsiz açılmıyor: ' + lr.status());
  await anon.close();
  await call(A.p, 'mail.design.save', { design: {} });
  await call(A.p, 'brand.save', { mail_logo: '' });
  step('e-posta tasarımı: “Renkli başlık” stili, mavi, logo (PNG) 90 px → kaydedildi; önizlemede logo, renk ve genişlik var; logo girişsiz açılıyor (e-posta programları için); varsayılana dönüldü');

  // 8) Güncellemeden sonra düşen telefon bildirimi aboneliği izin sormadan geri gelir; kişi kendisi kapattıysa gelmez (4.46.0)
  //    Test tarayıcısında gerçek push servisi yok: PushManager taklit edilir (abonelik "düşmüş" başlar).
  const fakePush = () => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); // başsız tarayıcı izni hep 'denied' gösterir
    let sub = null;
    const mk = () => { const ep = 'http://127.0.0.1:9/ep-' + Math.random().toString(36).slice(2); return { endpoint: ep, options: {}, toJSON: () => ({ endpoint: ep, keys: { p256dh: 'BPx' + 'a'.repeat(84), auth: 'b'.repeat(22) } }), unsubscribe: async () => { sub = null; return true; } }; };
    PushManager.prototype.getSubscription = async function () { return sub; };
    PushManager.prototype.subscribe = async function () { window.__subCalls = (window.__subCalls || 0) + 1; sub = mk(); return sub; };
  };
  const H = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await H.grantPermissions(['notifications'], { origin: new URL(BASE).origin });
  await H.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  await H.addInitScript(fakePush);
  const hp = await H.newPage();
  hp.on('pageerror', (e) => errors.push('[heal] pageerror: ' + e.message));
  await login(hp, 'burak@test.com', 'Sifre1234');
  const bs = await call(hp, 'boot');
  if (!bs.settings.push_ready) { step('bildirim onarımı: sunucuda push kapalı, atlandı'); } else {
    const devs0 = (await call(hp, 'notif.devices')).items.length;
    // a) Bu cihazda daha önce açılmıştı (iz var), abonelik düştü → sayfa açılınca kendiliğinden yeniden abone olur, uyarı çıkmaz
    await hp.evaluate(() => { localStorage.setItem('nm-push-ep', 'https://push.example.test/eski'); localStorage.removeItem('nm-push-off'); localStorage.removeItem('nm-push-nag'); });
    await hp.reload(); await hp.waitForFunction(() => typeof S !== 'undefined' && S.me);
    await hp.waitForFunction(() => window.__subCalls >= 1, null, { timeout: 12000 }).catch(() => fail('düşen abonelik kendiliğinden yenilenmedi'));
    await hp.waitForTimeout(1500);
    if (await hp.locator('#pushNag').count()) fail('abonelik onarıldığı hâlde "Bildirimleriniz kapalı" uyarısı çıktı');
    const devs1 = (await call(hp, 'notif.devices')).items.length;
    if (devs1 !== devs0 + 1) fail(`onarılan abonelik sunucuya kaydedilmedi: ${devs0} → ${devs1}`);
    // b) Kişi bu cihazda kendisi kapattı → onarılmaz, açma uyarısı görünür
    await hp.evaluate(() => pushDisable());
    await hp.evaluate(() => { localStorage.removeItem('nm-push-nag'); });
    await hp.reload(); await hp.waitForFunction(() => typeof S !== 'undefined' && S.me);
    await hp.locator('#pushNag').waitFor({ timeout: 10000 }).catch(() => fail('kişi kapattığında "Bildirimleriniz kapalı" uyarısı çıkmadı'));
    if (await hp.evaluate(() => window.__subCalls || 0)) fail('kişinin kapattığı bildirim kendiliğinden yeniden açıldı');
    step(`bildirim onarımı: güncellemede düşen abonelik izin sormadan geri geldi (cihaz ${devs0} → ${devs1}), uyarı çıkmadı; kişi kendisi kapatınca açılmadı ve uyarı göründü`);
  }
  await H.close();
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: ad bağı, kısayol ve kura testleri geçti');
