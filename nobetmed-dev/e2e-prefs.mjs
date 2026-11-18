// Kişisel tercihler modülü testi (tema/palet, ana sayfa düzeni, geri sayım, ücret, hatırlatma, kurallar kartı).
// e2e.mjs'den SONRA aynı sunucuda çalıştırılır:  node e2e-prefs.mjs http://localhost:8088/ <çıktı> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8088/';
const OUT = process.argv[3] || '.';
const SITE = process.argv[4];
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
}
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 860 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage(); watch(p, tag); return { c, p };
}
async function login(p, email, pw) {
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.locator('#view').waitFor();
}
const apiCall = (p, action, data = {}) => p.evaluate(([a, d]) => api(a, d), [action, data]);
const cron = () => execFileSync('php', [path.join(SITE, 'cron.php'), '--force'], { encoding: 'utf8' }).trim();
const attr = (p, n) => p.evaluate((k) => document.documentElement.getAttribute(k), n);

try {
  const M = await ctx('elif', true);
  const m = M.p;
  await login(m, 'elif@test.com', 'YeniSifre99');
  await apiCall(m, 'me.prefs.save', { kind: 'ui', value: { theme: 'light', accent: 'varsayilan', density: 'cozy', oled: false, home: { hidden: [], order: [], side_first: false } } });
  await m.reload(); await m.locator('#view').waitFor();

  // 1) Görünüm: palet, koyu mod, gece siyahı, yoğunluk
  await m.goto(BASE + '#/profil/gorunum');
  await m.locator('.pf-swatches').waitFor();
  const n = await m.locator('.pf-sw').count();
  if (n < 8) fail('palet sayısı ' + n);
  const before = await m.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
  await m.click('.pf-sw[data-v=okyanus]');
  if ((await attr(m, 'data-accent')) !== 'okyanus') fail('data-accent uygulanmadı');
  const after = await m.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
  if (before === after) fail('palet rengi değişmedi: ' + after);
  await m.click('[data-act=pf-set][data-k=theme][data-v=dark]');
  await m.click('[data-act=pf-set][data-k=density][data-v=compact]');
  await m.locator('[data-change=pf-oled]').check({ force: true });
  if ((await attr(m, 'data-theme')) !== 'dark' || (await attr(m, 'data-oled')) !== '1' || (await attr(m, 'data-density')) !== 'compact') fail('koyu/oled/yoğunluk uygulanmadı');
  const bg = await m.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (!/rgb\(0, 0, 0\)/.test(bg)) fail('gece siyahı zemin: ' + bg);
  await m.waitForTimeout(900); // sunucuya kayıt (600 ms gecikmeli)
  await m.screenshot({ path: path.join(OUT, 'p-gorunum-dark.png'), fullPage: true });
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  if (sw > 390) fail('görünüm sayfası mobil taşma: ' + sw);
  step('görünüm: palet (' + before + ' → ' + after + '), koyu + gece siyahı + sıkı düzen');

  // 2) Cihazlar arası: temiz bir cihazda girişte aynı görünüm gelir
  const M2 = await ctx('elif-2', false);
  await login(M2.p, 'elif@test.com', 'YeniSifre99');
  await M2.p.waitForTimeout(400);
  if ((await attr(M2.p, 'data-accent')) !== 'okyanus' || (await attr(M2.p, 'data-theme')) !== 'dark') fail('ikinci cihazda görünüm eşitlenmedi: ' + (await attr(M2.p, 'data-accent')) + '/' + (await attr(M2.p, 'data-theme')));
  else step('ikinci cihazda tema ve palet otomatik geldi');
  await M2.c.close();

  // 3) Ana sayfa düzeni: akışı gizle, kartı yukarı taşı, telefonda kartlar önce
  await m.goto(BASE + '#/profil/gorunum');
  await m.locator('#homeLayoutCard .hl-item').first().waitFor();
  await m.click('[data-act=hl-toggle][data-id=feed]');
  await m.click('[data-act=hl-move][data-id=rosters][data-d="-1"]');
  await m.locator('[data-change=hl-sidefirst]').check({ force: true });
  await m.waitForTimeout(500);
  await m.goto(BASE + '#/');
  await m.locator('#heroShift .hs-t').waitFor();
  if (!(await m.locator('#feedHost.home-hidden').count())) fail('akış gizlenmedi');
  const ordR = await m.locator('#rosterCard').evaluate((e) => +e.style.order);
  const ordT = await m.locator('#todayCard').evaluate((e) => +e.style.order);
  if (!(ordR && ordT && ordR < ordT)) fail(`kart sırası: listeler ${ordR}, bugün ${ordT}`);
  // Telefonda yan sütun düzleşir; duyuru akışı kartların arkasına geçmeli
  const feedOrder = await m.evaluate(() => getComputedStyle(document.querySelector('#feedHost')).order);
  if (+feedOrder < 100) fail('telefonda kartlar önce değil (akış sırası ' + feedOrder + ')');
  step('ana sayfa düzeni: akış gizli, nöbet listeleri üste, telefonda kartlar önce');

  // 4) Canlı geri sayım
  const my = await apiCall(m, 'shifts.my');
  const hasSoon = (my.entries || []).some((e) => e.kind === 'shift' && e.start && e.date >= new Date().toISOString().slice(0, 10));
  if (hasSoon) {
    await m.locator('#cdBox .cd-u').first().waitFor({ timeout: 6000 }).catch(() => fail('geri sayım görünmedi'));
    const t1 = await m.locator('#cdBox').innerText();
    await m.waitForTimeout(1300);
    const t2 = await m.locator('#cdBox').innerText();
    if (t1 === t2 && !/gün/.test(t1)) fail('geri sayım ilerlemiyor');
    step('geri sayım: ' + t1.replace(/\s+/g, ' ').slice(0, 60));
  } else step('geri sayım: yakın nöbet yok (atlandı)');
  await m.screenshot({ path: path.join(OUT, 'p-home.png') });
  // düzeni geri al
  await apiCall(m, 'me.prefs.save', { kind: 'ui', value: { home: { hidden: [], order: [], side_first: false } } });

  // 5) Ücret: yalnız kişinin kendisi görür
  await m.goto(BASE + '#/profil/ucret');
  await m.locator('[data-form=pay-save]').waitFor();
  await m.fill('[data-form=pay-save] [name=normal]', '100');
  await m.fill('[data-form=pay-save] [name=bayram]', '250');
  await m.click('[data-act=pay-extra-add]');
  await m.fill('.pay-x [name=x_name]', 'İcap');
  await m.fill('.pay-x [name=x_rate]', '50');
  await m.fill('.pay-x [name=x_hours]', '10');
  await m.click('[data-form=pay-save] button[type=submit]');
  await m.getByText('Ücretleriniz kaydedildi').waitFor();
  const saved = await m.evaluate(() => S.my_prefs.pay);
  if (+saved.normal !== 100 || +saved.bayram !== 250 || !saved.extras || saved.extras[0].name !== 'İcap') fail('ücret kaydı: ' + JSON.stringify(saved));
  await m.goto(BASE + '#/nobetim');
  await m.locator('#calCard .cal-head').waitFor();
  await m.locator('#payBox').waitFor({ timeout: 6000 }).catch(() => fail('ücret kutusu yok'));
  const payTxt = (await m.locator('#payBox').innerText().catch(() => '')).replace(/\s+/g, ' ');
  if (!/fazla mesai tahmini/i.test(payTxt) || !/İcap/.test(payTxt)) fail('ücret tahmini: ' + payTxt.slice(0, 120));
  step('ücret: ' + payTxt.slice(0, 110));

  const A = await ctx('admin', false);
  const a = A.p;
  await login(a, 'ayse@test.com', 'Sifre1234');
  const leak = await a.evaluate(async () => {
    const out = [];
    for (const act of ['boot', 'users.list', 'people.list']) { try { out.push(JSON.stringify(await api(act))); } catch (e) { /* */ } }
    return out.join('\n');
  });
  if (/İcap|"bayram":250|pay_rates/.test(leak)) fail('ücret bilgisi yöneticiye sızıyor');
  else step('ücret bilgisi yöneticiye gitmiyor');

  // 6) Kişisel hatırlatma saati
  await m.goto(BASE + '#/profil/bildirim');
  await m.locator('#remindCard').waitFor();
  await m.click('[data-act=remind-mode][data-v=own]');
  await m.selectOption('#remindCard [name=day_hour]', '0'); // sunucu saatinden bağımsız: her saat 00:00'dan sonradır
  await m.click('#remindCard label:has([name=pre_on]) .small');
  if (!(await m.locator('#remindCard [name=pre_on]').isChecked())) fail('“nöbetten önce” anahtarı açılmadı');
  await m.click('#remindCard button[type=submit]');
  await m.getByText('Hatırlatma saatiniz kaydedildi').waitFor();
  const rp = await m.evaluate(() => S.my_prefs.remind);
  if (!rp || !rp.day || !rp.pre || !rp.pre.on) fail('hatırlatma kaydı: ' + JSON.stringify(rp));
  const cr = cron();
  // "yarın" sunucu saatine göre (cron çıktısının ilk alanı sunucu tarihidir)
  const sd = new Date(cr.slice(0, 10) + 'T12:00:00Z'); sd.setUTCDate(sd.getUTCDate() + 1);
  const tYmd = sd.toISOString().slice(0, 10);
  const hasTomorrow = (my.entries || []).some((e) => e.kind === 'shift' && e.date === tYmd);
  if (hasTomorrow) {
    const nl = await apiCall(m, 'notif.list');
    if (!JSON.stringify(nl).includes('Yarın nöbetiniz var')) fail('kişisel hatırlatma gelmedi: ' + cr.slice(0, 200));
    else step('kişisel hatırlatma kendi saatinde geldi');
  } else step('hatırlatma kaydedildi (yarın nöbet yok, gönderim atlandı)');
  await apiCall(m, 'me.prefs.save', { kind: 'remind', value: { reset: true } });

  // 7) Ayarlar › Nöbet: gereken sayılar, muafiyet, resmî tatil
  await a.goto(BASE + '#/yonetim/ayarlar/nobet');
  await a.locator('#holCard .hd-row').first().waitFor({ timeout: 8000 });
  await a.locator('#exemptCard #exName').waitFor();
  await a.fill('#exName', 'Deneme Muaf Kişi');
  await a.selectOption('#exScope', 'kura');
  await a.click('[data-act=ex-add]');
  await a.locator('#exemptCard .ex-row').first().waitFor();
  // Elif'in bu ayki bir nöbet gününü tatil yap → takvimde işaret + ücret tahmininde bayram
  const shiftDay = (my.entries || []).find((e) => e.kind === 'shift' && e.date.slice(0, 7) === new Date().toISOString().slice(0, 7));
  if (shiftDay) {
    await a.fill('#holDate', shiftDay.date);
    await a.fill('#holName', 'Deneme Kurban Bayramı');
    await a.click('[data-act=hol-add]');
    await a.getByText('Deneme Kurban Bayramı').first().waitFor();
    await m.goto(BASE + '#/');
    await m.reload();
    await m.locator('#view').waitFor();
    await m.goto(BASE + '#/nobetim');
    await m.locator(`#calCard .cal-d[data-d="${shiftDay.date}"]`).waitFor();
    const cls = await m.locator(`#calCard .cal-d[data-d="${shiftDay.date}"]`).getAttribute('class');
    if (!/holiday/.test(cls)) fail('takvimde tatil işareti yok');
    const pt = (await m.locator('#payBox').innerText().catch(() => '')).replace(/\s+/g, ' ');
    step('tatil: takvimde işaretli; ücret kutusu "' + pt.slice(0, 90) + '"');
    await apiCall(a, 'holidays.save', { date: shiftDay.date, name: '' });
  }
  await a.screenshot({ path: path.join(OUT, 'p-ayarlar-nobet.png'), fullPage: true });
  step('ayarlar › nöbet: muafiyet eklendi, tatil eklendi/silindi');

  // 8) Nöbet hesaplarına dahil edilmeyen kişi: değişim seçeneklerinde, adaylarda hiç çıkmaz
  const future = (my.entries || []).filter((e) => e.kind === 'shift' && e.date > new Date().toISOString().slice(0, 10)).map((e) => e.date);
  let optDate = null, victim = null;
  for (const d of future) {
    const o = await apiCall(m, 'swap.options', { date: d }).catch(() => null);
    const cand = o && [...(o.swap || []), ...(o.give || [])][0];
    if (cand) { optDate = d; victim = cand.name; break; }
  }
  if (victim) {
    await a.goto(BASE + '#/yonetim/ayarlar/nobet');
    await a.locator('#exclCard #exclName').waitFor();
    if (!(await a.locator('#exclNames option').count())) fail('ad önerileri boş');
    await a.fill('#exclName', victim);
    await a.click('[data-act=excl-add]');
    await a.locator('#exclCard .ex-row').first().waitFor();
    const o2 = await apiCall(m, 'swap.options', { date: optDate });
    if ([...(o2.swap || []), ...(o2.give || [])].some((p) => p.name === victim)) fail('hesap dışı kişi değişim seçeneklerinde: ' + victim);
    await a.click('#exclCard [data-act=excl-del]');
    await a.getByText('Yeniden dahil edildi').waitFor();
    const o3 = await apiCall(m, 'swap.options', { date: optDate });
    if (![...(o3.swap || []), ...(o3.give || [])].some((p) => p.name === victim)) fail('yeniden dahil edilen kişi seçeneklere dönmedi');
    // Kullanıcı hesabından işaret: Kullanıcılar menüsü
    const uid = (await apiCall(a, 'admin.users')).users.find((u) => u.email === 'elif@test.com').id;
    const r1 = await apiCall(a, 'rules.excluded.save', { user_id: uid, on: true });
    if (!r1.excluded.some((x) => x.user_id === uid)) fail('kullanıcı işareti kaydedilmedi');
    await a.goto(BASE + '#/yonetim/kullanicilar');
    await a.getByText('Nöbet hesabı dışı').first().waitFor();
    await apiCall(a, 'rules.excluded.save', { user_id: uid, on: false });
    step('hesap dışı kişi: "' + victim + '" değişim seçeneklerinden çıktı, geri alınınca döndü; kullanıcı rozeti görünüyor');
  } else step('hesap dışı kişi: uygun değişim seçeneği bulunamadı (atlandı)');
  const ex = await apiCall(a, 'rules.get');
  for (const x of ex.exempt) await apiCall(a, 'rules.exempt.delete', { id: x.id });
  await apiCall(m, 'me.prefs.save', { kind: 'pay', value: {} });
  await apiCall(m, 'me.prefs.save', { kind: 'ui', value: { theme: 'light', accent: 'varsayilan', density: 'cozy', oled: false } });
} catch (e) {
  errors.push('İSTİSNA: ' + (e && e.stack || e));
}
await browser.close();
if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('TERCİHLER GEÇTİ');
