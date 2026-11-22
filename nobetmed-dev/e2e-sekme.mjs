// Sekmeler kimsede gizli kalmasın (4.31.2): dar telefonda ve büyük yazıda tüm sekmeler ekranın içinde; yan menüde İstekler, İlanlar, Ekstra nöbet
// e2e.mjs ... e2e-prefs.mjs SONRASI aynı sitede çalışır:
//   node e2e-sekme.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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

async function check(tag, email, pws, big) {
  const c = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript((b) => { try { localStorage.setItem('nm-tour', 'done'); if (b) localStorage.setItem('nm-fs', 'lg'); } catch (e) { /* */ } }, big);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  let ok = false;
  for (const pw of pws) {
    await p.goto(BASE);
    await p.fill('[data-form=login] [name=email]', email);
    await p.fill('[data-form=login] [name=password]', pw);
    await p.click('[data-form=login] button[type=submit]');
    ok = await p.waitForFunction(() => typeof S !== 'undefined' && S.me, null, { timeout: 6000 }).then(() => true, () => false);
    if (ok) break;
  }
  if (!ok) { fail(`[${tag}] giriş yapılamadı`); await c.close(); return; }
  const e0 = errors.length;
  // Nöbet sekmeleri: hepsi ekranın içinde
  await p.goto(BASE + '#/nobetim');
  await p.locator('.hub-tabs a').first().waitFor();
  await p.waitForTimeout(400);
  const tabs = await p.locator('.hub-tabs a').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), l: Math.round(r.left), r: Math.round(r.right) }; }));
  const out = tabs.filter((t) => t.l < 0 || t.r > 360);
  if (out.length) fail(`[${tag}] ekran dışında kalan sekmeler: ${out.map((t) => t.t).join(', ')}`);
  const names = tabs.map((t) => t.t);
  for (const want of ['Takvimim', 'Kim nöbette', 'İstekler', 'İlanlar', 'Excel liste']) if (!names.some((n) => n.includes(want))) fail(`[${tag}] “${want}” sekmesi yok: ${names.join(' | ')}`);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  if (w > 360) fail(`[${tag}] yatay taşma ${w}px`);
  await p.screenshot({ path: path.join(OUT, `sekme-${tag}.png`) });
  // Yan menü (☰): Nöbet bölümünde İstekler / İlanlar / Ekstra nöbet
  const side = await p.evaluate(() => [...document.querySelectorAll('#sidebar a')].map((a) => a.getAttribute('href')));
  for (const h of ['#/istekler', '#/ilanlar', '#/ekstra']) if (!side.includes(h)) fail(`[${tag}] yan menüde ${h} yok`);
  // Diğer sekme şeritleri: Hesabım
  await p.goto(BASE + '#/profil');
  await p.locator('.prof-tabs').first().waitFor({ timeout: 8000 }).catch(() => {});
  const pt = await p.locator('.prof-tabs > *').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > 360); }).map((e) => e.textContent.trim()));
  if (pt.length) fail(`[${tag}] Hesabım sekmelerinden ekran dışında kalan: ${pt.join(', ')}`);
  if (big) {
    // Büyük yazıda yan menünün altı ve sohbet yazma kutusu ekranda kalmalı
    await p.goto(BASE + '#/');
    await p.click('[data-act=nav-open]');
    await p.waitForTimeout(400);
    await p.click('.sidebar .me-card', { timeout: 6000 }).then(() => p.keyboard.press('Escape'), () => fail(`[${tag}] büyük yazıda yan menünün altındaki hesap kartına ulaşılamadı`));
    await p.goto(BASE + '#/mesaj');
    const row = p.locator('.ch-row').first();
    if (await row.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await row.click();
      await p.locator('#chInput').waitFor();
      await p.waitForTimeout(500);
      const ib = await p.locator('#chInput').boundingBox();
      const vh = await p.evaluate(() => innerHeight);
      if (!ib || ib.y + ib.height > vh) fail(`[${tag}] büyük yazıda sohbet yazma kutusu ekran dışında (${ib && Math.round(ib.y + ib.height)} / ${vh})`);
      await p.screenshot({ path: path.join(OUT, `sekme-${tag}-sohbet.png`) });
    }
    // Sonraki testler etkilenmesin: büyük yazıyı geri al
    await p.evaluate(() => api('me.prefs.save', { kind: 'ui', value: { fs: '' } }).catch(() => {}));
  }
  if (errors.length === e0) step(`[${tag}] 360 px${big ? ' + büyük yazı' : ''}: ${tabs.length} Nöbet sekmesinin hepsi ekranda (${names.join(', ')}); yan menüde İstekler, İlanlar, Ekstra nöbet; Hesabım sekmeleri ekranda${big ? '; büyük yazıda yan menünün altı ve sohbet yazma kutusu ekranda' : ''}`);
  await c.close();
}

try {
  await check('uye', 'elif@test.com', ['YeniSifre99', 'Sifre1234', 'Elif1234'], false);
  await check('uye-buyuk', 'elif@test.com', ['YeniSifre99', 'Sifre1234', 'Elif1234'], true);
  await check('yonetici-buyuk', 'ayse@test.com', ['Sifre1234'], true);
  // Yönetici: rolü yüzünden bir bölümü göremeyen kişi kullanıcı listesinde uyarıyla görünür (neden görmüyor?)
  {
    const c = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
    const p = await c.newPage();
    await p.goto(BASE);
    await p.fill('[data-form=login] [name=email]', 'ayse@test.com');
    await p.fill('[data-form=login] [name=password]', 'Sifre1234');
    await p.click('[data-form=login] button[type=submit]');
    await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
    const r = await p.evaluate(async () => {
      const users = (await api('admin.users')).users;
      const t = users.find((u) => u.role === 'member' && u.status === 'active' && !/elif/i.test(u.email));
      const ro = (await api('roles.save', { name: 'Sekme deneme rolü', perms: { istekler: 'off' } })).role;
      const prev = t.role_id || null;
      await api('admin.user.save', { id: t.id, name: t.name, email: t.email, role: t.role, status: t.status, title_id: t.title_id, unit_id: t.unit_id, role_id: ro.id });
      const after = (await api('admin.users')).users.find((u) => u.id === t.id);
      return { id: t.id, name: t.name, prev, rid: ro.id, hidden: after.hidden };
    });
    if (!r.hidden || !r.hidden.some((h) => h.key === 'istekler' && /Sekme deneme rolü/.test(h.why))) fail('göremediği bölüm yöneticiye gösterilmedi: ' + JSON.stringify(r.hidden));
    await p.goto(BASE + '#/yonetim/kullanicilar');
    await p.locator(`tr[data-uid="${r.id}"] .badge.warn`, { hasText: 'Nöbet istekleri görünmüyor' }).waitFor({ timeout: 8000 }).catch(() => fail('kullanıcı listesinde “görünmüyor” uyarısı yok'));
    await p.screenshot({ path: path.join(OUT, 'sekme-yonetici-uyari.png') });
    // Kişinin kendi ekranı: Hesabım › Hesap bilgisi kartı görünmeyen bölümü nedeniyle yazar (Elif'e geçici olarak aynı rol)
    const el = await p.evaluate(async (rid) => {
      const e = (await api('admin.users')).users.find((u) => /elif@/i.test(u.email));
      await api('admin.user.save', { id: e.id, name: e.name, email: e.email, role: e.role, status: e.status, title_id: e.title_id, unit_id: e.unit_id, role_id: rid });
      return { id: e.id, prev: e.role_id || null };
    }, r.rid);
    {
      const mc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await mc.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
      const mp = await mc.newPage();
      let ok = false;
      for (const pw of ['YeniSifre99', 'Sifre1234']) {
        await mp.goto(BASE);
        await mp.fill('[data-form=login] [name=email]', 'elif@test.com');
        await mp.fill('[data-form=login] [name=password]', pw);
        await mp.click('[data-form=login] button[type=submit]');
        ok = await mp.waitForFunction(() => typeof S !== 'undefined' && S.me, null, { timeout: 6000 }).then(() => true, () => false);
        if (ok) break;
      }
      await mp.goto(BASE + '#/profil');
      const txt = await mp.locator('#accInfo').innerText({ timeout: 8000 }).catch(() => '');
      if (!/Nöbet istekleri/.test(txt) || !/Sekme deneme rolü/.test(txt) || !/Birim:/.test(txt)) fail('Hesap bilgisi kartı görünmeyen bölümü/nedenini yazmadı: ' + txt);
      await mp.goto(BASE + '#/nobetim');
      await mp.locator('.hub-tabs a').first().waitFor();
      if (await mp.locator('.hub-tabs a', { hasText: 'İstekler' }).count()) fail('rolü kapalıyken İstekler sekmesi görünüyor');
      await mp.goto(BASE + '#/profil');
      await mp.locator('#accInfo').waitFor();
      await mp.screenshot({ path: path.join(OUT, 'sekme-hesap-bilgisi.png') });
      await mc.close();
    }
    await p.evaluate(async (x) => {
      const e = (await api('admin.users')).users.find((u) => u.id === x.id);
      await api('admin.user.save', { id: e.id, name: e.name, email: e.email, role: e.role, status: e.status, title_id: e.title_id, unit_id: e.unit_id, role_id: x.prev });
    }, el);
    step('kişinin kendi ekranı: Hesabım › Hesap bilgisi kartında birimi ve “Nöbet istekleri: … rolünüzde kapalı” nedeni yazdı');
    await p.evaluate(async (x) => {
      const t = (await api('admin.users')).users.find((u) => u.id === x.id);
      await api('admin.user.save', { id: t.id, name: t.name, email: t.email, role: t.role, status: t.status, title_id: t.title_id, unit_id: t.unit_id, role_id: x.prev });
      await api('roles.delete', { id: x.rid });
    }, r);
    const back = await p.evaluate((id) => api('admin.users').then((d) => d.users.find((u) => u.id === id).hidden), r.id);
    if (back.length) fail('rol kaldırılınca uyarı gitmedi: ' + JSON.stringify(back));
    else step(`yönetici: “${r.name}” rolü yüzünden İstekler’i göremeyince kullanıcı listesinde “Nöbet istekleri görünmüyor” uyarısı ve nedeni çıktı; rol kaldırılınca düzeldi`);
    await c.close();
  }
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: sekme görünürlüğü testleri geçti');
