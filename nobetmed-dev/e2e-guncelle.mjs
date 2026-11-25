// 4.24: güncelleme sırasında işler yarıda kalmasın — e2e.mjs (+ çok birimlide e2e-tenant.mjs) SONRASI.
//  - kilit varken istekler bekletilir ve kendiliğinden tamamlanır (tek sefer yazılır); dosyalar karışıkken (işlem başlamadan hata) de öyle
//  - uygulama içinden güncelleme: paket denetimi, uygulama, geri alma; açık sayfa yazı varken yenilenmez, sayfa geçişinde yeni sürüme geçer
//  - "Şimdi yükle" ile yenilenince açık pencere ve formlara yazılanlar geri konur; bakım modu (elle güncelleme)
//   node e2e-guncelle.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FLAG = path.join(SITE, 'data/.guncelleniyor');
const lock = (secs, kind = 'auto') => fs.writeFileSync(FLAG, JSON.stringify({ until: Math.floor(Date.now() / 1000) + secs, kind, by: 'test' }));
const unlock = () => { try { fs.unlinkSync(FLAG); } catch (e) { /* */ } };

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|503/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
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
function totpAt(secret, st) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = ''; for (const ch of secret) bits += abc.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeUInt32BE(st, 4);
  const h = crypto.createHmac('sha1', key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const multi = php('echo nm_multi() ? 1 : 0;').trim() === '1';
const CUR = php('echo NM_VERSION;').trim();
const NEXT = CUR.replace(/(\d+)$/, (n) => String(+n + 1));

/** Yeni sürüm paketi: sitenin kopyası, sürüm bir artırılmış, bir yeni dosya */
function makePackage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nmpkg-'));
  const dir = path.join(tmp, 'site');
  fs.mkdirSync(dir);
  execFileSync('bash', ['-c', `cd "${SITE}" && tar cf - --exclude=./data --exclude=./uploads --exclude=./config.php . | (cd "${dir}" && tar xf -)`]);
  const bf = path.join(dir, 'inc/bootstrap.php');
  fs.writeFileSync(bf, fs.readFileSync(bf, 'utf8').replace(`const NM_VERSION = '${CUR}';`, `const NM_VERSION = '${NEXT}';`));
  fs.writeFileSync(path.join(dir, 'assets/guncelleme-deneme.txt'), 'yeni dosya\n');
  const zip = path.join(tmp, 'dupcii-hostinger.zip');
  execFileSync('bash', ['-c', `cd "${dir}" && zip -q -r "${zip}" .`]);
  return { zip, tmp };
}

let A = null, PKG = null;
try {
  unlock();
  const E = await ctx('elif');
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');

  // ---- 1) Kilit varken istek bekler, kilit kalkınca BİR KEZ işlenir ----
  const before = await apiCall(E.p, 'sp.mine');
  lock(30);
  const pending = E.p.evaluate(() => api('sp.create', { topic: 'hata', subject: 'Güncelleme sırasında yazıldı', body: 'Bu talep güncelleme sırasında gönderildi.' }).then((r) => r.ticket.id, (e) => 'HATA ' + e.message));
  await sleep(2500);
  const bar = await E.p.locator('#nmUpd').innerText().catch(() => '');
  if (!/güncelleniyor/i.test(bar)) fail('beklerken “güncelleniyor” şeridi yok: ' + bar);
  await E.p.screenshot({ path: path.join(OUT, 'up-bekliyor.png') });
  unlock();
  const tid = await pending;
  if (typeof tid !== 'number') fail('kilit kalkınca istek tamamlanmadı: ' + tid);
  const after = await apiCall(E.p, 'sp.mine');
  if (after.items.length !== before.items.length + 1) fail(`istek bir kez yazılmadı (${before.items.length} → ${after.items.length})`);
  if (await E.p.locator('#nmUpd').count()) fail('şerit kalktıktan sonra durdu');
  step('kilit varken gönderilen talep bekletildi (“Site güncelleniyor…” şeridi), kilit kalkınca kendiliğinden ve bir kez kaydedildi');

  // ---- 2) Dosyalar karışıkken (işlem başlamadan hata) istek yeniden denenir ----
  const bad = path.join(SITE, 'inc/mod_zz_yarim.php');
  fs.writeFileSync(bad, "<?php\nfunction yarim_dosya( {\n");
  const p2 = E.p.evaluate(() => api('sp.mine').then((r) => r.items.length, (e) => 'HATA ' + e.status + ' ' + e.message));
  await sleep(2500);
  fs.unlinkSync(bad);
  const n2 = await p2;
  if (typeof n2 !== 'number') fail('yarım dosya varken istek yeniden denenmedi: ' + n2);
  step('yarım (bozuk) dosya varken istek 503 “güncelleniyor” aldı, dosya düzelince kendiliğinden tamamlandı');

  // ---- 3) Yazı varken yenileme yok; “Şimdi yükle” ile yazılanlar ve açık pencere geri gelir ----
  await E.p.goto(BASE + '#/profil/profil');
  await E.p.locator('[data-form=me-profile] [name=phone]').waitFor();
  await E.p.fill('[data-form=me-profile] [name=phone]', '05551112233');
  const B = await ctx('burak');
  await login(B.p, 'burak@test.com', 'Sifre1234');
  await B.p.click('[data-act=compose]');
  await B.p.locator('#composer [name=title]').waitFor();
  await B.p.fill('#composer [name=title]', 'Yarım kalan duyuru');
  await B.p.fill('#composer [name=body]', 'Güncelleme gelse de bu metin kaybolmamalı.');

  // ---- 4) Uygulama içinden güncelleme ----
  PKG = makePackage();
  let UP;
  if (multi) {
    const sa = JSON.parse(php(`$u = m_one('SELECT id, email, totp_secret FROM superadmins WHERE totp_on = 1'); $u['last'] = (int)m_setting('totp_last_' . $u['id'], '0'); echo json_encode($u);`));
    UP = await ctx('sistem');
    await UP.p.goto(BASE);
    await UP.p.waitForFunction(() => typeof S !== 'undefined' && S.csrf && document.querySelector('[data-form=login]'));
    await apiCall(UP.p, 'sa.login', { email: sa.email, password: 'SistemSifre123' });
    while (Math.floor(Date.now() / 30000) + 1 <= sa.last) await sleep(1000);
    await apiCall(UP.p, 'sa.totp', { code: totpAt(sa.totp_secret, Math.floor(Date.now() / 30000) + 1) });
    await UP.p.goto(BASE); await UP.p.reload();
    await UP.p.locator('[data-act=sys-tab][data-t=site]').click();
  } else {
    UP = A;
    await UP.p.goto(BASE + '#/yonetim/ayarlar/genel');
  }
  await UP.p.locator('#upBox [data-change=up-file]').waitFor({ state: 'attached' });
  await UP.p.setInputFiles('#upBox [data-change=up-file]', PKG.zip);
  await UP.p.locator('#upBox [data-act=up-apply]').waitFor({ timeout: 30000 });
  const pk = await UP.p.locator('#upBox .mk-box').first().innerText();
  if (!pk.includes(NEXT) || !/\d+ değişen, 1 yeni/.test(pk)) fail('paket bilgisi yanlış: ' + pk);
  await UP.p.screenshot({ path: path.join(OUT, 'up-paket.png') });
  // Bozuk paket siteye dokunmaz
  const pre = multi ? 'sa.update' : 'update';
  const badZip = 'data:application/zip;base64,' + Buffer.from('bozuk'.repeat(400)).toString('base64');
  if (!/^4\d\d/.test(await apiErr(UP.p, pre + '.check', { zip: badZip }))) fail('bozuk paket kabul edildi');
  // (bozuk denemeden sonra asıl paketi yeniden seç)
  await UP.p.setInputFiles('#upBox [data-change=up-file]', PKG.zip);
  await UP.p.locator('#upBox [data-act=up-apply]').waitFor({ timeout: 30000 });
  // Uygularken bir kişi işlem yapıyor
  const during = E.p.evaluate(async () => { const out = []; for (let k = 0; k < 8; k++) { try { await api('sp.mine'); out.push('ok'); } catch (e) { out.push(e.status); } await new Promise((r) => setTimeout(r, 300)); } return out; });
  await UP.p.click('#upBox [data-act=up-apply]');
  await UP.p.waitForFunction(() => !document.querySelector('#upBox [data-act=up-apply]') && /Kurulu sürüm/.test((document.querySelector('#upBox') || {}).textContent || ''), null, { timeout: 60000 });
  const dur = await during;
  if (dur.some((x) => x !== 'ok')) fail('güncelleme sırasında kişinin isteği hata aldı: ' + dur.join(','));
  if (!fs.existsSync(path.join(SITE, 'assets/guncelleme-deneme.txt'))) fail('yeni dosya kurulmadı');
  const v2 = await E.p.evaluate(() => api('sp.mine').then(() => fetch('api.php?action=boot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': S.csrf }, body: '{}' }).then((r) => r.json()).then((j) => j.v)));
  if (v2 !== NEXT) fail('sunucu yeni sürüme geçmedi: ' + v2);
  if (fs.existsSync(FLAG)) fail('güncelleme sonrası kilit kaldı');
  await UP.p.screenshot({ path: path.join(OUT, 'up-kuruldu.png') });
  step(`uygulama içinden güncelleme: paket denetlendi (${NEXT}), bozuk paket reddedildi; uygularken kişinin istekleri hatasız tamamlandı (${dur.join(',')})`);

  // ---- 5) Açık sayfalar: yazı varken yenilenmez; yazı yoksa sayfa geçişinde yeni sürüm ----
  await E.p.waitForTimeout(800);
  if (await E.p.evaluate(() => BOOT.v) !== CUR) fail('yazı varken sayfa kendiliğinden yenilendi');
  await E.p.locator('.toast.newver').waitFor({ timeout: 8000 }).catch(() => fail('yeni sürüm bildirimi çıkmadı'));
  if ((await E.p.inputValue('[data-form=me-profile] [name=phone]')) !== '05551112233') fail('yazılan telefon kayboldu');
  await E.p.screenshot({ path: path.join(OUT, 'up-yeni-surum.png') });
  // Şimdi yükle → yazılanlar geri gelir
  await Promise.all([E.p.waitForEvent('load'), E.p.click('.toast.newver [data-act=reload-app]')]);
  await E.p.waitForFunction((v) => typeof BOOT !== 'undefined' && BOOT.v === v && typeof S !== 'undefined' && S.me, NEXT);
  await E.p.waitForFunction(() => { const i = document.querySelector('[data-form=me-profile] [name=phone]'); return i && i.value === '05551112233'; }, null, { timeout: 8000 }).catch(() => fail('yenilemeden sonra yazılan telefon geri gelmedi'));
  await E.p.screenshot({ path: path.join(OUT, 'up-geri-kondu.png') });
  // Açık pencere (duyuru yazma) yenilemeden sonra yeniden açılır, metin yerinde
  await B.p.evaluate(() => api('counts').catch(() => {}));
  await Promise.all([B.p.waitForEvent('load'), B.p.evaluate(() => { setTimeout(() => ACT['reload-app'](), 50); })]);
  await B.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await B.p.locator('#composer [name=title]').waitFor({ timeout: 10000 }).catch(() => fail('açık pencere yenilemeden sonra yeniden açılmadı'));
  if ((await B.p.inputValue('#composer [name=title]').catch(() => '')) !== 'Yarım kalan duyuru') fail('pencerede yazılan başlık geri gelmedi');
  await B.p.evaluate(() => { try { localStorage.removeItem('nm-draft-' + S.me.id); } catch (e) { /* */ } });
  // Yazı olmayan sekme: sayfa geçişinde yeni sürüme geçer
  await A.p.goto(BASE + '#/'); await A.p.waitForTimeout(300);
  if (!multi) await A.p.reload();
  const D = await ctx('deniz');
  await login(D.p, 'elif@test.com', 'YeniSifre99');
  await D.p.evaluate((v) => { BOOT.v = '0.0.1'; }, null);
  await D.p.evaluate(() => api('counts').catch(() => {}));
  await Promise.all([D.p.waitForEvent('load', { timeout: 10000 }).catch(() => fail('sayfa geçişinde yeni sürüm yüklenmedi')), D.p.evaluate(() => { setTimeout(() => { location.hash = '#/nobetim'; }, 50); })]);
  await D.p.waitForFunction((v) => typeof BOOT !== 'undefined' && BOOT.v === v, NEXT, { timeout: 10000 }).catch(() => {});
  if (!/nobetim/.test(D.p.url())) fail('yeni sürüm yüklenince gidilen sayfa kayboldu');
  await D.c.close();
  step('açık sayfalar: telefon yazılıyken yenilenmedi; “Şimdi yükle” ile yazılan geri kondu; açık duyuru penceresi metniyle yeniden açıldı; yazısız sekme sayfa geçişinde yeni sürüme geçti');

  // ---- 6) Geri al ----
  const rb = await apiCall(UP.p, pre + '.rollback');
  if (rb.to !== CUR || fs.existsSync(path.join(SITE, 'assets/guncelleme-deneme.txt'))) fail('geri alma eksik');
  if (php('echo file_get_contents(NM_ROOT . "/inc/bootstrap.php");').indexOf(`const NM_VERSION = '${CUR}';`) < 0) fail('geri almada sürüm dönmedi');
  step(`geri alma: ${NEXT} → ${CUR}, yeni dosya kaldırıldı`);

  // ---- 7) Bakım modu (elle güncelleme) ----
  const mi = await apiCall(UP.p, pre + '.maint', { minutes: 5 });
  if (!mi.lock || mi.lock.kind !== 'manual') fail('bakım modu açılmadı');
  const pm = E.p.evaluate(() => api('sp.mine').then((r) => 'ok', (e) => 'HATA ' + e.message));
  await sleep(2500);
  const info = await apiCall(UP.p, pre + '.info');
  if (!info.lock) fail('bakım modunda yönetim ucu çalışmadı');
  const mbar = await E.p.locator('#nmUpd').innerText().catch(() => '');
  if (!/bakım/i.test(mbar)) fail('bakım modunda şerit yok: ' + mbar);
  if (UP !== A) {
    await UP.p.locator('[data-act=sys-tab][data-t=site]').click();
    await UP.p.locator('#upBox .mk-box.warn').waitFor();
    await UP.p.screenshot({ path: path.join(OUT, 'up-bakim.png') });
  }
  await apiCall(UP.p, pre + '.maint', { minutes: 0 });
  if ((await pm) !== 'ok') fail('bakım bitince bekleyen istek tamamlanmadı');
  step('bakım modu: kişinin isteği bekletildi (şerit), yönetici paneli çalıştı, kapatınca istek tamamlandı');

  // ---- 8) Yetki ----
  if (!/^40[13]/.test(await apiErr(E.p, multi ? 'sa.update.info' : 'update.info'))) fail('üye güncelleme ucunu açabildi');
  // Sayfa yeni sürüme geçerken yeniden yüklenmiş olabilir: uygulama hazır olana kadar bekle (zamanlama yarışı)
  await A.p.waitForFunction(() => typeof api === 'function' && typeof S !== 'undefined' && S.me, null, { timeout: 20000 }).catch(() => {});
  if (multi) { const ua = await apiErr(A.p, 'update.info'); if (!/^40[13]/.test(ua)) fail('çok birimlide birim yöneticisi güncelleme yapabiliyor: ' + ua); }
  step('yetki: üye güncelleme yapamaz' + (multi ? '; çok birimlide yalnız sistem yöneticisi' : ''));
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  unlock();
  try { if (fs.existsSync(path.join(SITE, 'inc/mod_zz_yarim.php'))) fs.unlinkSync(path.join(SITE, 'inc/mod_zz_yarim.php')); } catch (e) { /* */ }
  try { if (PKG) fs.rmSync(PKG.tmp, { recursive: true, force: true }); } catch (e) { /* */ }
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: güncelleme testleri geçti');
