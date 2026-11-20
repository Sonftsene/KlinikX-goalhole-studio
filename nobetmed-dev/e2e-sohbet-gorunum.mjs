// 4.28: sohbet görünümü — iletme / paylaşmada tüm kişiler (arama, çoklu), sağa kaydırınca ekran kaymaz, modern liste
// (aralıklı kartlar, alt yazı yok, arama ile yeni sohbet), temalar / balon biçimleri / duvar kağıtları; 4.29'dan beri efekt yok.
// e2e.mjs ve e2e-mesaj.mjs SONRASI (çok birimli).
//   node e2e-sohbet-gorunum.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
async function ctx(tag, mobile) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[${tag}] console: ${m.text()}`); });
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

try {
  const A = await ctx('ayse');
  await login(A.p, 'ayse@test.com', 'Sifre1234');
  await A.p.evaluate(() => { try { localStorage.removeItem('nm-chat-ui'); } catch (e) { /* */ } });
  const people = (await apiCall(A.p, 'chat.people')).people;
  const list0 = (await apiCall(A.p, 'chat.list')).items;
  const hasDm = new Set(list0.filter((c) => c.kind === 'direct' && c.other).map((c) => c.other.tk + ':' + c.other.uid));
  const fresh = people.filter((p) => !hasDm.has(p.tk + ':' + p.uid));
  if (fresh.length < 2) throw new Error('test için sohbeti olmayan iki kişi gerekli');
  const [p1, p2] = fresh;
  const unit = list0.find((c) => c.kind === 'unit');

  // ---- 1) İlet: sohbeti olmayan kişiyi arayıp seç (çoklu) ----
  await apiCall(A.p, 'chat.send', { id: unit.id, body: 'İletilecek nöbet notu' });
  await A.p.goto(BASE + '#/mesaj/' + unit.id);
  await A.p.locator('#chMsgs .ch-msg.mine').last().waitFor();
  const mid = await A.p.locator('#chMsgs .ch-msg.mine').last().getAttribute('data-id');
  await A.p.evaluate((id) => { const m = CH.msgs.find((x) => x.id === +id); chatForward(m); }, mid);
  await A.p.locator('#chpQ').waitFor();
  await A.p.fill('#chpQ', p1.name.split(' ')[0]);
  await A.p.locator(`.ch-pick-row[data-key="p${p1.tk}:${p1.uid}"]`).click();
  await A.p.fill('#chpQ', p2.name.split(' ')[0]);
  await A.p.locator(`.ch-pick-row[data-key="p${p2.tk}:${p2.uid}"]`).click();
  if ((await A.p.locator('#chpSel .ch-chip').count()) !== 2) fail('seçilen kişiler çip olarak görünmüyor');
  await A.p.screenshot({ path: path.join(OUT, 'sg-ilet.png') });
  await A.p.click('#chpGo');
  await A.p.locator('.modal').waitFor({ state: 'detached', timeout: 10000 }).catch(() => fail('iletme penceresi kapanmadı'));
  const list1 = (await apiCall(A.p, 'chat.list')).items;
  for (const p of [p1, p2]) {
    const c = list1.find((x) => x.kind === 'direct' && x.other && x.other.tk === p.tk && x.other.uid === p.uid);
    if (!c || !/İletilecek nöbet notu/.test(c.last || '')) fail(`${p.name} kişisine iletilmedi: ` + JSON.stringify(c && c.last));
  }
  step(`ilet: sohbeti olmayan kişiler (${p1.name}, ${p2.name}) aranarak seçildi, ikisine birden iletildi (sohbet kendiliğinden açıldı)`);

  // ---- 2) Paylaş: kişi arayarak ----
  const p3 = people.find((p) => ![p1, p2].includes(p) && p.name !== 'Ayşe Kaya') || p1;
  await A.p.evaluate(() => { shareToChat({ text: 'Duyuru bağlantısı: #/', title: 'Sohbette paylaş' }); });
  await A.p.locator('#chpQ').waitFor();
  await A.p.fill('#chpQ', p3.name.split(' ')[0]);
  await A.p.locator('.ch-pick-row', { hasText: p3.name }).first().click();
  await A.p.click('#chpGo');
  await A.p.locator('.modal').waitFor({ state: 'detached', timeout: 10000 }).catch(() => fail('paylaş penceresi kapanmadı'));
  const list2 = (await apiCall(A.p, 'chat.list')).items;
  const c3 = list2.find((x) => x.name === p3.name);
  if (!c3 || !/Duyuru bağlantısı/.test(c3.last || '')) fail('paylaşım kişiye gitmedi');
  step(`paylaş: ${p3.name} aranarak bulundu ve paylaşım gönderildi`);

  // ---- 3) Liste: alt yazı yok, aralıklı kartlar, arama ile yeni sohbet ----
  await A.p.goto(BASE + '#/mesaj');
  await A.p.locator('.ch-card').first().waitFor();
  if (await A.p.getByText('Birim grubu, gruplar ve birebir sohbetler').count()) fail('başlıktaki alt yazı hâlâ var');
  const gaps = await A.p.$$eval('.ch-cards .ch-card', (els) => els.slice(0, 4).map((e, i, a) => (i ? e.getBoundingClientRect().top - a[i - 1].getBoundingClientRect().bottom : null)).filter((x) => x !== null));
  if (gaps.some((g) => g < 6)) fail('sohbet kartları arası çok dar: ' + gaps.join(','));
  const ht = await A.p.$eval('.ch-cards .ch-card', (e) => e.getBoundingClientRect().height);
  if (ht < 64) fail('sohbet satırı sıkışık: ' + ht);
  await A.p.screenshot({ path: path.join(OUT, 'sg-liste-varsayilan.png') });
  step(`liste: alt yazı kaldırıldı; kartlar arası ${Math.round(Math.min(...gaps))} px, satır yüksekliği ${Math.round(ht)} px`);

  // ---- 4) Görünüm: tema, balon, duvar kağıdı (uygulanır, hatırlanır) ----
  await A.p.click('[data-act=ch-look]');
  await A.p.locator('#chLook .ch-sw').first().waitFor();
  await A.p.click('#chLook [data-k=theme][data-v=gul]');
  await A.p.click('#chLook [data-k=style][data-v=kart]');
  await A.p.click('#chLook [data-k=cw][data-v=saglik]');
  await A.p.click('#chLook [data-k=lw][data-v=yildiz]');
  await A.p.screenshot({ path: path.join(OUT, 'sg-gorunum-pencere.png') });
  await A.p.keyboard.press('Escape');
  const hc = await A.p.$eval('.ch-home', (e) => e.className);
  if (!/ch-th-gul/.test(hc) || !/ch-wp-yildiz/.test(hc)) fail('liste görünümü uygulanmadı: ' + hc);
  await A.p.screenshot({ path: path.join(OUT, 'sg-liste-gul-gece.png') });
  await A.p.reload();
  await A.p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  await A.p.goto(BASE + '#/mesaj/' + unit.id);
  await A.p.locator('#chMsgs .ch-msg').last().waitFor();
  const vc = await A.p.$eval('#chatView', (e) => e.className); const sc = await A.p.$eval('#chScroll', (e) => e.className);
  if (!/ch-th-gul/.test(vc) || !/ch-st-kart/.test(vc) || !/ch-wp-saglik/.test(sc)) fail('sohbet görünümü uygulanmadı / hatırlanmadı: ' + vc + ' | ' + sc);
  await A.p.screenshot({ path: path.join(OUT, 'sg-sohbet-gul-kart-saglik.png') });
  step('görünüm penceresi: Gül teması, Kart balonu, Sağlık duvar kağıdı (sohbet), Gece (liste) uygulandı ve yenilemeden sonra hatırlandı');

  // ---- 5) Telefonda: sağa kaydırınca ekran kaymaz; temalar; yeni mesaj efekti ----
  const E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  const themes = [['deniz', 'yumusak', 'gradyan', 'gradyan'], ['gece', 'balon', 'yildiz', 'nokta'], ['gunbatimi', 'yumusak', 'dalga', 'gradyan'], ['zumrut', 'cizgi', 'kagit', 'geometri']];
  for (const [th, st, cw, lw] of themes) {
    await E.p.evaluate(([a, b, c, d]) => chatUiSave({ theme: a, style: b, cw: c, lw: d }), [th, st, cw, lw]);
    await E.p.goto(BASE + '#/mesaj'); await E.p.locator('.ch-card').first().waitFor(); await E.p.waitForTimeout(500);
    await E.p.screenshot({ path: path.join(OUT, `sg-tel-liste-${th}.png`) });
    await E.p.goto(BASE + '#/mesaj/' + unit.id); await E.p.locator('#chMsgs .ch-msg').last().waitFor(); await E.p.waitForTimeout(400);
    await E.p.screenshot({ path: path.join(OUT, `sg-tel-sohbet-${th}.png`) });
  }
  // Sağa kaydır (yanıtla): sayfa ve sohbet alanı yatayda kaymaz
  const box = await E.p.locator('#chMsgs .ch-msg:not(.mine) .ch-bub').last().boundingBox();
  const sw = await E.p.evaluate(([x, y]) => new Promise((done) => {
    const el = document.elementFromPoint(x, y);
    const mk = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x)], changedTouches: [mk(x)], bubbles: true }));
    let cx = x; const s = document.getElementById('chScroll'); let worst = 0;
    const t = setInterval(() => {
      cx += 12;
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(cx)], changedTouches: [mk(cx)], bubbles: true }));
      worst = Math.max(worst, window.scrollX, document.scrollingElement.scrollLeft, s.scrollLeft, document.documentElement.scrollWidth - innerWidth);
      if (cx > x + 90) {
        clearInterval(t);
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(cx)], bubbles: true }));
        setTimeout(() => done({ worst, reply: !!document.querySelector('#chReply .ch-reply, #chReply:not(:empty)'), ta: getComputedStyle(s).touchAction, ox: getComputedStyle(s).overflowX }), 150);
      }
    }, 16);
  }), [box.x + 20, box.y + box.height / 2]);
  if (sw.worst > 0) fail('sağa kaydırınca ekran / sohbet yatayda kaydı: ' + sw.worst);
  if (sw.ta !== 'pan-y' || sw.ox !== 'hidden') fail('sohbet alanı yatay kaydırmaya açık: ' + sw.ta + ' ' + sw.ox);
  if (!sw.reply) fail('sağa kaydırınca yanıtlama açılmadı');
  // 4.29: hız için efekt yok — yeni mesaj beklemeden görünür, animasyon / bulanıklık uygulanmaz
  await apiCall(A.p, 'chat.send', { id: unit.id, body: 'Efekt denemesi' });
  await E.p.waitForFunction(() => [...document.querySelectorAll('#chMsgs .ch-msg')].some((e) => /Efekt denemesi/.test(e.textContent)), null, { timeout: 15000 })
    .catch(() => fail('yeni gelen mesaj görünmedi'));
  const fx = await E.p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#chMsgs .ch-bub, .ch-card, .ch-badge, .topbar, .bottom-nav').forEach((e) => {
      const cs = getComputedStyle(e);
      if (cs.animationName && cs.animationName !== 'none') bad.push(e.className + ':' + cs.animationName);
      if (cs.backdropFilter && cs.backdropFilter !== 'none') bad.push(e.className + ':blur');
    });
    return bad;
  });
  if (fx.length) fail('sohbette efekt / bulanıklık kaldı: ' + fx.slice(0, 5).join(', '));
  step(`telefonda: 4 tema / balon / duvar kağıdı ekran görüntüsü; sağa kaydırmada ekran kaymadı (en fazla ${sw.worst} px), yanıtlama açıldı; yeni mesaj efektsiz, beklemeden göründü`);
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: sohbet görünümü testleri geçti');
