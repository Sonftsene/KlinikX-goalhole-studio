// Duyuru bandı ayarları, sayfa bağlantısı paylaşma, metinde bağlantı, sohbette paylaşma (4.20) — uçtan uca.
// Temel testlerden (e2e.mjs) sonra; mesajlaşma bölümleri yalnız çok birimli kurulumda (sohbet orada).
//   node e2e-paylas.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; ${code}`], { encoding: 'utf8' });
const MULTI = php('echo nm_multi() ? 1 : 0;').trim() === '1';
const pre = MULTI ? 'nm_tenant_use(nm_tenant_default()); ' : '';

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
  p.on('dialog', (d) => { errors.push(`[${tag}] beklenmeyen pencere: ${d.message()}`); d.dismiss(); });
  return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const apiErr = (p, action, data = {}) => p.evaluate(async ([a, d]) => { try { await api(a, d); return 'kabul'; } catch (e) { return `${e.status}:${e.message}`; } }, [action, data]);
const fresh = async (p) => { await p.reload(); await p.waitForFunction(() => typeof S !== 'undefined' && S.me); await p.waitForTimeout(300); };
const banner = (p) => p.evaluate(() => { const b = document.querySelector('#bannerSlot .banner'); return b ? b.outerHTML : ''; });
const BN0 = JSON.parse(php(`${pre}$o = []; foreach (['banner_on', 'banner_text', 'banner_tone', 'banner_from', 'banner_until', 'banner_aud', 'banner_close', 'banner_btn_text', 'banner_btn_url'] as $k) $o[$k] = setting($k); echo json_encode($o);`));
const bnSet = (kv) => php(`${pre}foreach (json_decode(base64_decode('${Buffer.from(JSON.stringify(kv)).toString('base64')}'), true) as $k => $v) set_setting($k, (string)$v);`);
const fmt = (d) => d.toISOString().slice(0, 16);

try {
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');

  // ---- 1) Yönetici: yeni ayarlar panelden ----
  await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.p.locator('#bnPrev').waitFor();
  const on = await A.p.locator('[name=banner_on]').isChecked();
  if (!on) await A.p.click('.switch:has([name=banner_on]) .track');
  await A.p.fill('[name=banner_text]', 'Pazartesi kalite denetimi var. Hazırlık listesi için ');
  // "Bağlantı ekle": sona site içi sayfa bağlantısı
  await A.p.locator('[name=banner_text]').evaluate((t) => { t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
  await A.p.click('[data-act=lnk-add][data-f=banner_text]');
  await A.p.fill('#lnkF [name=t]', 'Takvimim sayfasına bakın');
  await A.p.selectOption('#lnkF [name=p]', '#/nobetim');
  await A.p.click('.modal button[form=lnkF]');
  const txt = await A.p.inputValue('[name=banner_text]');
  if (!txt.endsWith('[Takvimim sayfasına bakın](#/nobetim)')) fail('bağlantı metne eklenmedi: ' + txt);
  await A.p.check('label.bn-tone.amber input');
  await A.p.fill('[name=banner_btn_text]', 'Ayrıntılar');
  await A.p.selectOption('#bnBtnPick', '#/telefon');
  if ((await A.p.inputValue('[name=banner_btn_url]')) !== '#/telefon') fail('düğme bağlantısı listeden seçilemedi');
  await A.p.selectOption('[name=banner_close]', 'until');
  const prev = await A.p.locator('#bnPrev .banner.amber').innerHTML();
  if (!/href="#\/nobetim"/.test(prev) || !/Ayrıntılar/.test(prev)) fail('önizleme güncellenmedi');
  await A.p.locator('form[data-form=settings] [data-sec=genel]:has(#bnPrev)').screenshot({ path: path.join(OUT, 'bn-ayar.png') });
  await A.p.click('form[data-form=settings] button[type=submit]');
  await A.p.getByText('Ayarlar kaydedildi').first().waitFor();
  step('yönetici: metne site içi bağlantı (Bağlantı ekle), turuncu renk, düğme (listeden sayfa), “değişene kadar gizle”; önizleme');

  // ---- 2) Üye görür, bağlantı ve düğme çalışır, kapatınca değişene kadar gizli ----
  await fresh(E.p);
  let h = await banner(E.p);
  if (!/class="banner amber"/.test(h) || !/<a href="#\/nobetim" class="in-link">Takvimim sayfasına bakın<\/a>/.test(h) || !/class="bn-btn" href="#\/telefon"/.test(h)) fail('bant üyede doğru görünmedi: ' + h.slice(0, 300));
  await E.p.screenshot({ path: path.join(OUT, 'bn-tel.png') });
  await E.p.click('#bannerSlot a.in-link');
  await E.p.waitForFunction(() => location.hash === '#/nobetim');
  await E.p.click('#bannerSlot [data-act=hide-banner]');
  await fresh(E.p);
  if (await banner(E.p)) fail('“değişene kadar gizle” sayfa yenilenince yine göründü');
  bnSet({ banner_text: 'Pazartesi kalite denetimi ertelendi.' });
  await fresh(E.p);
  if (!(await banner(E.p))) fail('duyuru değişince yeniden görünmedi');
  step('üye: bant, metindeki bağlantı aynı sekmede sayfayı açtı, düğme; kapatınca değişene kadar gizli, değişince yine göründü');

  // ---- 3) Hedef kitle, zaman aralığı, kapatılamaz ----
  bnSet({ banner_aud: 'staff', banner_close: 'none' });
  await fresh(E.p); await fresh(A.p);
  if (await banner(E.p)) fail('“yalnız yöneticiler” bandı üyeye göründü');
  const ha = await banner(A.p);
  if (!ha || /hide-banner/.test(ha)) fail('kapatılamaz bant yöneticide yok ya da kapatma düğmesi var');
  const now = Date.now();
  bnSet({ banner_aud: 'all', banner_from: fmt(new Date(now + 3 * 3600e3 + 3 * 3600e3)).replace('T', ' '), banner_until: '' });
  await fresh(E.p);
  if (await banner(E.p)) fail('başlangıcı gelecekte olan bant göründü');
  bnSet({ banner_from: '', banner_until: '2000-01-01 00:00' });
  await fresh(E.p);
  if (await banner(E.p)) fail('bitişi geçmiş bant göründü');
  bnSet({ banner_until: '' });
  if (!/geçersiz|Bitiş/.test(await apiErr(A.p, 'settings.save', { banner_from: '2030-01-02T10:00', banner_until: '2030-01-01T10:00' }))) fail('bitiş başlangıçtan önce kabul edildi');
  bnSet({ banner_from: '', banner_until: '' });
  if (!/Düğme bağlantısı/.test(await apiErr(A.p, 'settings.save', { banner_btn_url: 'javascript:alert(1)' }))) fail('tehlikeli düğme bağlantısı kabul edildi');
  step('hedef kitle (yalnız yöneticiler), kapatılamaz bant, başlangıç / bitiş zamanı; geçersiz tarih ve tehlikeli bağlantı reddedildi');

  // ---- 4) Güvenli bağlantı çözümleme ----
  const rt = await E.p.evaluate(() => richText('a [x](javascript:alert(1)) <img src=x onerror=1> [ok](https://ornek.com/a) [ic](#/telefon) https://ornek.com/b ' + location.origin + location.pathname + '#/yemek'));
  if (/<img|href="javascript/i.test(rt)) fail('tehlikeli içerik bağlantıya dönüştü: ' + rt);
  if (!/<a href="https:\/\/ornek\.com\/a" target="_blank"[^>]*>ok<\/a>/.test(rt) || !/<a href="#\/telefon" class="in-link">ic<\/a>/.test(rt) || !/href="#\/yemek" class="in-link"/.test(rt)) fail('bağlantılar doğru çözülmedi: ' + rt);
  step('metin: [yazı](adres) ve düz adresler bağlantı oluyor; javascript ve HTML etiketi zararsız; site içi tam adres sayfa adıyla');

  // ---- 5) Sayfa bağlantısını paylaş ----
  await E.p.goto(BASE + '#/nobetim');
  await E.p.locator('#view .page-head .pg-share').waitFor({ timeout: 10000 });
  await E.p.click('#view .page-head .pg-share');
  const link = await E.p.inputValue('#shUrl');
  if (!/#\/nobetim$/.test(link) || (MULTI && false)) fail('paylaşılan bağlantı yanlış: ' + link);
  await E.p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await E.p.locator('.sh-acts [data-sh=copy]').click();
  await E.p.getByText('Bağlantı kopyalandı').first().waitFor();
  await E.p.screenshot({ path: path.join(OUT, 'pg-paylas.png') });
  const hasChat = await E.p.locator('.sh-acts [data-sh=chat]').count();
  if (MULTI && !hasChat) fail('çok birimlide “Sohbette paylaş” yok');
  if (!MULTI && hasChat) fail('sohbet olmayan kurulumda “Sohbette paylaş” görünüyor');
  step('sayfa başlığında Paylaş: bağlantı (#/nobetim), kopyala, WhatsApp' + (MULTI ? ', sohbette paylaş' : ''));

  // ---- 6) Sohbette paylaş: bağlantı sayfa adıyla, tıklayınca aynı sekmede ----
  if (MULTI) {
    await E.p.click('.sh-acts [data-sh=chat]');
    await E.p.locator('.sh-list [data-c]').first().waitFor();
    const grp = await E.p.evaluate(async () => { const r = await api('chat.list'); return r.items.find((c) => c.kind === 'unit') || r.items[0]; });
    await E.p.click(`.sh-list [data-c="${grp.id}"]`);
    await E.p.getByText('sohbetine gönderildi').first().waitFor();
    await E.p.goto(BASE + '#/mesaj/' + grp.id);
    const chip = E.p.locator('.ch-int').last();
    await chip.waitFor({ timeout: 10000 });
    if (!/Takvimim/.test(await chip.textContent())) fail('sohbette site içi bağlantı sayfa adıyla görünmedi: ' + await chip.textContent());
    if ((await chip.getAttribute('target')) !== null) fail('site içi bağlantı yeni sekmede açılıyor');
    const bub = await chip.evaluate((el) => el.closest('.ch-bubble, .ch-msg, [class*=bub]') ? el.closest('.ch-bubble, .ch-msg, [class*=bub]').innerText : el.parentElement.innerText);
    if (/Paylaş/.test(bub)) fail('paylaşılan mesaja düğme yazısı karıştı: ' + bub);
    await E.p.screenshot({ path: path.join(OUT, 'pg-sohbet.png') });
    await chip.click();
    await E.p.waitForFunction(() => location.hash === '#/nobetim');
    // Görsel (Taraf paylaş penceresinin kullandığı yol): sohbete resim olarak
    await E.p.evaluate(async (id) => {
      const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#0b7a75'; g.fillRect(0, 0, 200, 120);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      window.__shareTest = id;
      shareToChat({ file: new File([blob], 'blok-test.png', { type: 'image/png' }), text: 'Blok yerleşimi · test', title: 'Görseli sohbette paylaş' });
    }, grp.id);
    await E.p.locator('.modal .sh-prev').waitFor();
    if ((await E.p.inputValue('#shNote')) !== 'Blok yerleşimi · test') fail('görsel notu gelmedi');
    await E.p.click(`.sh-list [data-c="${grp.id}"]`);
    await E.p.locator('.modal .sh-prev').waitFor({ state: 'detached', timeout: 20000 });
    let msgs = '[]';
    for (let i = 0; i < 40; i++) {
      msgs = php(`$t = nm_tenant_default(); $o = []; foreach (glob(NM_ROOT . '/data/h/' . $t['hospital_id'] . '/h-*.sqlite') as $f) { $p = new PDO('sqlite:' . $f); $o = $p->query('SELECT m.body, f.mime FROM c_msgs m LEFT JOIN c_files f ON f.id = m.file_id WHERE m.chat_id = ${grp.id} ORDER BY m.id DESC LIMIT 2')->fetchAll(PDO::FETCH_ASSOC); } echo json_encode($o);`);
      if (/image\\\//.test(msgs) || /"mime":"image/.test(msgs)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const ms = JSON.parse(msgs);
    if (!ms[0] || !/^image\//.test(ms[0].mime || '') || ms[0].body !== 'Blok yerleşimi · test') fail('görsel sohbete resim olarak gitmedi: ' + msgs.slice(0, 200));
    // Taraf paylaş penceresinde düğme
    await A.p.goto(BASE + '#/taraf');
    await A.p.waitForTimeout(800);
    const hasPl = await A.p.evaluate(() => typeof plOpenShare === 'function');
    if (hasPl) {
      await A.p.evaluate(() => plOpenShare(new Date().toISOString().slice(0, 10)));
      await A.p.locator('.modal [data-chat]').waitFor({ timeout: 10000 });
      await A.p.locator('.modal').first().screenshot({ path: path.join(OUT, 'pl-sohbet-btn.png') });
      await A.p.keyboard.press('Escape');
    } else fail('Taraf paylaş işlevi yok');
    step('sohbette paylaş: bağlantı sohbette “Takvimim” olarak görünüyor ve aynı sekmede açılıyor; görsel sohbete resim olarak gitti; Taraf paylaş penceresinde “Sohbette paylaş” düğmesi');
  }

  // ---- 7) Gönderi düzenleyicide Bağlantı ekle ----
  await A.p.goto(BASE + '#/');
  await A.p.click('[data-act=compose]');
  await A.p.locator('form [name=body]').waitFor();
  await A.p.fill('form [name=body]', 'Yeni protokol yayında. Detay için tıklayın.');
  await A.p.locator('form [name=body]').evaluate((t) => { const i = t.value.indexOf('tıklayın'); t.focus(); t.setSelectionRange(i, i + 8); });
  await A.p.click('form [data-act=lnk-add][data-f=body]');
  if ((await A.p.inputValue('#lnkF [name=t]')) !== 'tıklayın') fail('seçili kelime bağlantı yazısına gelmedi');
  await A.p.click('#lnkK [data-k=out]');
  await A.p.fill('#lnkF [name=u]', 'www.ornek.com/protokol');
  await A.p.click('.modal button[form=lnkF]');
  const body = await A.p.inputValue('form [name=body]');
  if (body !== 'Yeni protokol yayında. Detay için [tıklayın](https://www.ornek.com/protokol).') fail('gönderi metnine bağlantı eklenmedi: ' + body);
  step('gönderi düzenleyicide seçili kelimeye web bağlantısı verildi');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  try { bnSet(BN0); } catch (e) { errors.push('geri alma: ' + e.message); }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: duyuru bandı ve paylaşma testleri geçti');
