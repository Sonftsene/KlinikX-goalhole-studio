// Yanlışlıkla silme / onay koruması (4.31) — uydurma verilerle.
// e2e.mjs ve mesajlaşma testlerinden SONRA aynı sitede çalışır:
//   node e2e-onay.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
// Otomatik testlerde koruma kapalıdır (navigator.webdriver); bu test localStorage "nm-guard-test" ile açar.
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

try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); localStorage.setItem('nm-guard-test', '1'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', 'ayse@test.com');
  await p.fill('[data-form=login] [name=password]', 'Sifre1234');
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const guardModal = (t) => p.locator('.modal', { hasText: t });
  const cancel = async (t) => { await guardModal(t).locator('[data-act=close-modal]').last().click(); await guardModal(t).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {}); };
  const okBtn = async (t) => { await guardModal(t).locator('[data-ok]').click(); };

  // 1) Doğrudan istek: sayfa sormadan giden silme isteği önce onay ister; vazgeçince sessizce durur
  const pr = p.evaluate(() => api('notif.delete', { read_all: true }).then(() => 'gitti', (e) => 'durdu:' + e.status + ':' + e.message));
  await guardModal('Okunan bildirimler silinsin mi?').waitFor({ timeout: 5000 });
  await cancel('Okunan bildirimler silinsin mi?');
  const r1 = await pr;
  if (r1 !== 'durdu:-1:') fail('vazgeçilen istek: ' + r1);
  await p.waitForTimeout(300);
  if (await p.locator('.toast').filter({ hasText: /\S/ }).count() && await p.locator('.toast.err').count()) fail('vazgeçince hata bildirimi çıktı');
  step('onaysız silme isteği önce “… silinsin mi?” diye sordu; Vazgeç deyince sunucuya gitmedi, hata gösterilmedi');

  // 2) Mesajlar: "Benden sil" sorar; Vazgeç → mesaj kalır, Sil → kalkar
  await p.goto(BASE + '#/mesaj');
  await p.locator('.ch-row').first().click();
  await p.locator('#chInput').waitFor();
  await p.fill('#chInput', 'Onay testi: silinecek mesaj');
  await p.click('[data-act=ch-send]');
  await p.locator('.ch-msg.mine', { hasText: 'Onay testi: silinecek mesaj' }).waitFor();
  const mid = await p.evaluate(() => CH.msgs.filter((m) => m.mine && /Onay testi: silinecek/.test(m.body || '')).pop().id);
  const openMenu = async () => { await p.locator(`.ch-msg[data-id="${mid}"] [data-act=ch-menu]`).click(); };
  await openMenu();
  await p.locator('.modal [data-i]', { hasText: 'Benden sil' }).click();
  await guardModal('Mesaj sizden silinsin mi?').waitFor({ timeout: 5000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'onay-mesaj.png') });
  await cancel('Mesaj sizden silinsin mi?');
  await p.waitForTimeout(300);
  if (!(await p.locator(`.ch-msg[data-id="${mid}"]`).count())) fail('Vazgeç dendiği hâlde mesaj silindi');
  await openMenu();
  await p.locator('.modal [data-i]', { hasText: 'Benden sil' }).click();
  await okBtn('Mesaj sizden silinsin mi?');
  await p.locator(`.ch-msg[data-id="${mid}"]`).waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('onaylanınca mesaj sizden silinmedi'));
  step('mesaj “Benden sil”: onay soruldu; Vazgeç → mesaj kaldı, Sil → kalktı');

  // 3) Sayfa zaten soruyorsa (Herkesten sil) ikinci kez sorulmaz
  await p.fill('#chInput', 'Onay testi: herkesten silinecek');
  await p.click('[data-act=ch-send]');
  await p.locator('.ch-msg.mine', { hasText: 'Onay testi: herkesten' }).waitFor();
  const mid2 = await p.evaluate(() => CH.msgs.filter((m) => m.mine && /herkesten silinecek/.test(m.body || '')).pop().id);
  await p.locator(`.ch-msg[data-id="${mid2}"] [data-act=ch-menu]`).click();
  await p.locator('.modal [data-i]', { hasText: 'Herkesten sil' }).click();
  await p.locator('.modal [data-ok]').last().click();
  await p.locator(`.ch-msg[data-id="${mid2}"] .ch-del`).waitFor({ timeout: 5000 }).catch(() => fail('herkesten silinmedi'));
  await p.waitForTimeout(400);
  if (await p.locator('.modal', { hasText: 'silinsin mi?' }).count()) fail('aynı işlem için ikinci kez soruldu');
  step('sayfanın kendi onayı varsa (Herkesten sil) tek kez soruldu');

  // 4) Onaylamalar da sorar (ör. QR ile giriş onayı, istek onayı) — kapsamdaki işlemler
  const covered = await p.evaluate(() => ['admin.user.delete', 'chat.delete', 'chat.hide', 'chat.leave', 'posts.delete', 'posts.approve', 'req.decide', 'swap.respond', 'rosters.delete', 'placement.clear', 'notif.delete', 'phonebook.delete', 'hdoc.delete', 'listing.delete', 'callout.delete', 'backup.delete']
    .filter((a) => !guardOf(a, { status: 'approved', ids: [1], accept: true, on: true })));
  if (covered.length) fail('onay sormayan işlemler: ' + covered.join(', '));
  const noAsk = await p.evaluate(() => ['chat.send', 'posts.save', 'placement.save', 'req.save', 'chat.block'].filter((a) => guardOf(a, { on: false })));
  if (noAsk.length) fail('silme/onay olmayan işlem onay istiyor: ' + noAsk.join(', '));
  const reqTxt = await p.evaluate(() => guardOf('req.decide', { ids: [1, 2, 3], status: 'approved' }).title);
  if (reqTxt !== '3 istek onaylansın mı?') fail('toplu onay metni: ' + reqTxt);
  step('silme, kaldırma, iptal ve onay işlemlerinin hepsi kapsamda; kaydetme/gönderme sormuyor; toplu onayda sayı yazıyor (“3 istek onaylansın mı?”)');
  await c.close();
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: silme / onay koruması testleri geçti');
