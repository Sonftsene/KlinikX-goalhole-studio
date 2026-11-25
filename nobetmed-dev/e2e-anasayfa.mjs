// Ana sayfa varsayılan düzeni (yönetici) ve "Bildirimleriniz kapalı" uyarısı (4.31.1) — uydurma verilerle.
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır (elif@test.com şifresi orada değişir):
//   node e2e-anasayfa.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const homeReady = async (p) => { await p.goto(BASE + '#/'); await p.locator('#heroShift').waitFor(); await p.waitForTimeout(500); };

try {
  const A = await ctx('admin', false); await login(A.p, 'ayse@test.com', 'Sifre1234');
  const M = await ctx('elif', true); await login(M.p, 'elif@test.com', 'YeniSifre99');

  // 1) Yönetici: Ayarlar › Genel › Herkes için ana ekran (Standart: kişiler değiştirebilir) — akışı gizle, nöbet listelerini yukarı al, herkese uygula
  await A.p.goto(BASE + '#/yonetim/ayarlar/genel');
  await A.p.locator('#ulCard .hl-item').first().waitFor();
  await A.p.click('#ulCard [data-act=hl-toggle][data-id=feed]');
  await A.p.click('#ulCard [data-act=hl-move][data-id=rosters][data-d="-1"]');
  await A.p.locator('#ulCard .hl-item.off', { hasText: 'Duyuru ve belge akışı' }).waitFor();
  if (!(await A.p.locator('#ulCard [data-change=ul-lock]').isChecked())) fail('standart düzende kişiler değiştiremez görünüyor');
  await A.p.evaluate(() => { const r = document.querySelector('#ulReset'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await A.p.click('[data-act=ul-save]');
  await A.p.locator('.modal [data-ok]').click(); // "Herkesin düzeni sıfırlansın mı?"
  await A.p.getByText('Ana ekran herkes için kaydedildi').first().waitFor();
  await A.p.screenshot({ path: path.join(OUT, 'anasayfa-varsayilan.png'), fullPage: true });
  const def = await A.p.evaluate(() => S.home_default);
  if (!def || !def.hidden.includes('feed') || def.order.indexOf('rosters') > def.order.indexOf('today')) fail('varsayılan kaydı: ' + JSON.stringify(def));

  // 2) Kişi (kendi düzeni sıfırlandı): varsayılanı görür; kendi değiştirince kendisininki geçerli olur
  await M.p.reload(); await M.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await homeReady(M.p);
  if (!(await M.p.locator('#feedHost.home-hidden').count())) fail('varsayılan düzen kişiye uygulanmadı (akış görünüyor)');
  const ord = await M.p.evaluate(() => [+document.querySelector('#rosterCard').style.order, +document.querySelector('#todayCard').style.order]);
  if (!(ord[0] < ord[1])) fail('varsayılan sıra uygulanmadı: ' + ord.join(','));
  await M.p.goto(BASE + '#/profil/gorunum');
  await M.p.locator('#homeLayoutCard').getByText('biriminizin varsayılan düzeni').waitFor();
  await M.p.click('#homeLayoutCard [data-act=hl-toggle][data-id=feed]');
  await M.p.waitForTimeout(400);
  await homeReady(M.p);
  if (await M.p.locator('#feedHost.home-hidden').count()) fail('kişinin kendi düzeni uygulanmadı');
  await M.p.goto(BASE + '#/profil/gorunum');
  await M.p.click('#homeLayoutCard [data-act=hl-reset]');
  await M.p.waitForTimeout(400);
  await homeReady(M.p);
  if (!(await M.p.locator('#feedHost.home-hidden').count())) fail('“birimin varsayılan düzenine dön” çalışmadı');
  step('yönetici herkesin ana sayfasını ayarladı (gizle + sırala, herkese uygula); kişi varsayılanı gördü, kendi düzenini yaptı, varsayılana döndü');

  // 3) Bildirimler kapalı uyarısı: ana sayfada çıkar, "Daha sonra" → bugün yok, ertesi gün yine çıkar, ayarlardan kapatılır
  const fake = () => M.p.evaluate(() => { S.settings.push_ready = true; window.pushState = async () => 'off'; });
  await fake();
  await M.p.evaluate(() => { try { localStorage.removeItem('nm-push-nag'); } catch (e) { /* */ } pushNagMount(); });
  await M.p.locator('#pushNag', { hasText: 'Bildirimleriniz kapalı' }).waitFor({ timeout: 5000 });
  if (!(await M.p.locator('#pushNag [data-act=push-on]').count())) fail('uyarıda “Bildirimleri aç” düğmesi yok');
  await M.p.screenshot({ path: path.join(OUT, 'anasayfa-bildirim-uyari.png') });
  await M.p.click('#pushNag [data-act=push-nag-later]');
  await M.p.locator('#pushNag').waitFor({ state: 'detached' });
  await M.p.evaluate(() => pushNagMount()); await M.p.waitForTimeout(300);
  if (await M.p.locator('#pushNag').count()) fail('“Daha sonra” denince aynı gün yeniden çıktı');
  await M.p.evaluate(() => { localStorage.setItem('nm-push-nag', '2000-01-01'); pushNagMount(); }); // ertesi gün
  await M.p.locator('#pushNag').waitFor({ timeout: 5000 }).catch(() => fail('ertesi gün yeniden hatırlatılmadı'));
  // Ayarlar: günlük hatırlatmayı kapat
  await M.p.goto(BASE + '#/profil/bildirim');
  await M.p.locator('[data-change=push-nag]').waitFor();
  if (!(await M.p.locator('[data-change=push-nag]').isChecked())) fail('günlük hatırlatma varsayılan açık olmalıydı');
  await M.p.locator('[data-change=push-nag]').uncheck({ force: true });
  await M.p.getByText('Bildirim hatırlatması kapatıldı').first().waitFor();
  await homeReady(M.p); await fake();
  await M.p.evaluate(() => { localStorage.setItem('nm-push-nag', '2000-01-01'); pushNagMount(); }); await M.p.waitForTimeout(400);
  if (await M.p.locator('#pushNag').count()) fail('ayarlardan kapatıldığı hâlde uyarı çıktı');
  const saved = await M.p.evaluate(() => api('boot').then((r) => r.my_prefs.ui.push_nag));
  if (saved !== false) fail('hatırlatma tercihi sunucuya kaydedilmedi: ' + saved);
  // Bildirimleri açık kişide hiç çıkmaz
  await M.p.evaluate(() => { S.my_prefs.ui.push_nag = true; window.pushState = async () => 'on'; localStorage.removeItem('nm-push-nag'); pushNagMount(); }); await M.p.waitForTimeout(400);
  if (await M.p.locator('#pushNag').count()) fail('bildirimleri açık kişide uyarı çıktı');
  await M.p.evaluate(() => api('me.prefs.save', { kind: 'ui', value: { push_nag: true } }));
  step('bildirimler kapalıysa ana sayfada uyarı (Bildirimleri aç / Daha sonra); “Daha sonra” → ertesi gün yeniden; Hesabım › Bildirimler’den günlük hatırlatma kapatıldı; açık kişide çıkmıyor');

  // Bildirim durumu: üyenin cihazı durumunu bildirir; yönetici listede görür, hatırlatır (uygulama içi bildirim), 12 saat kuralı; üye listeyi göremez
  await M.p.evaluate(() => { NB.psSent = ''; return nbReportState(); });
  const st1 = (await A.p.evaluate(() => api('notif.status'))).people.find((p) => p.name === 'Elif Yılmaz');
  if (!st1 || st1.state === 'on' || st1.state === 'unknown' || st1.state === 'never') fail('üyenin bildirim durumu kaydedilmedi: ' + JSON.stringify(st1));
  await A.p.goto(BASE + '#/yonetim/ayarlar/bildirim');
  await A.p.locator('#nbStatus .nbs-list').waitFor();
  const row = A.p.locator('#nbStatus .list-row', { hasText: 'Elif Yılmaz' });
  await row.waitFor();
  await A.p.locator('#nbStatus').screenshot({ path: path.join(OUT, 'anasayfa-bildirim-durumu.png') });
  await row.locator('[data-act=nbs-remind]').click();
  await A.p.getByText('1 kişiye hatırlatma gönderildi').first().waitFor();
  const got = await M.p.evaluate(() => api('live', { since: '2000-01-01 00:00:00' }).then((r) => (r.items || []).map((x) => x.title)));
  if (!got.includes('Telefon bildirimlerini açın')) fail('hatırlatma üyeye ulaşmadı: ' + JSON.stringify(got));
  const again = await A.p.evaluate((id) => api('notif.remind', { ids: [id] }), st1.id);
  if (again.sent !== 0 || again.skipped !== 1) fail('12 saat içinde ikinci hatırlatma engellenmedi: ' + JSON.stringify(again));
  const st2 = (await A.p.evaluate(() => api('notif.status'))).people.find((p) => p.name === 'Elif Yılmaz');
  if (!st2.reminded_at || st2.reminds !== 1) fail('hatırlatma kaydı tutulmadı: ' + JSON.stringify(st2));
  const mSt = await M.p.evaluate(() => api('notif.status').then(() => 'kabul', (e) => e.status));
  if (mSt === 'kabul') fail('üye bildirim durumu listesini görebildi');
  step(`bildirim durumu: Elif’in cihazı “${st1.state}” bildirdi; yönetici listede gördü, “Hatırlat” → Elif’e uygulama içi bildirim; 12 saat içinde ikinci hatırlatma engellendi; üye listeyi göremiyor`);

  // Temizlik: varsayılanı kaldır
  await A.p.evaluate(() => api('ui.layout.save', { base: null }));
  if ((await A.p.evaluate(() => api('boot'))).home_default !== null) fail('varsayılan kaldırılamadı');
  // Üye varsayılan düzeni değiştiremez
  const mErr = await M.p.evaluate(() => api('home.default.save', { home: { hidden: ['feed'] } }).then(() => 'kabul', (e) => e.status));
  if (mErr === 'kabul') fail('üye herkesin ana sayfasını değiştirebildi');
  step('üye varsayılan düzeni değiştiremiyor (yalnız yönetici)');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: ana sayfa varsayılanı ve bildirim uyarısı testleri geçti');
