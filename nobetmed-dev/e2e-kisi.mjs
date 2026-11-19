// Kişi kartı (4.13): uygulamanın her yerinde ada dokununca mesaj / arama / telefon / nöbetler — uydurma verilerle.
// e2e-tenant.mjs ve e2e-hastane.mjs SONRASI (mesajlaşma açık) ya da tek birimli sitede (mesajlaşmasız) çalışır:
//   node e2e-kisi.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } });
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
const apiErr = (p, action, data = {}) => apiCall(p, action, data).then(() => 'kabul', (e) => e.message);

const A = await ctx('ayse');
await login(A.p, 'ayse@test.com', 'Sifre1234');
const chatOn = await A.p.evaluate(() => !!S.hosp && modOn('mesaj'));

// ---- 1) Ekip rehberinde ada dokun → kişi kartı ----
await A.p.goto(BASE + '#/rehber');
const btn = A.p.locator('#dirList .pname', { hasText: 'Elif' }).first();
await btn.waitFor({ timeout: 10000 });
await btn.click();
await A.p.locator('.modal .pc').waitFor();
const card = await A.p.locator('.modal .pc').innerText();
if (!card.includes('Elif')) fail('kişi kartında ad yok');
if (chatOn && !/Mesaj/.test(card)) fail('kişi kartında Mesaj yok');
if (chatOn && !/Sesli ara/.test(card)) fail('kişi kartında Sesli ara yok');
await A.p.screenshot({ path: path.join(OUT, 'k-kart.png') });
step(`rehberde ada dokununca kişi kartı açılıyor${chatOn ? ' (Mesaj, Sesli ara, Görüntülü)' : ''}`);
if (chatOn) {
  await A.p.locator('.modal [data-pc=dm]').click();
  await A.p.waitForFunction(() => /^#\/mesaj\/\d+/.test(location.hash), null, { timeout: 8000 }).catch(() => fail('Mesaj düğmesi sohbeti açmadı'));
  if (!(await A.p.locator('.modal').count())) step('Mesaj düğmesi birebir sohbeti açtı');
}

// ---- 2) API: hesaplı kişi, yalnız listede adı geçen kişi, yaklaşan nöbetler ----
const elif = (await apiCall(A.p, 'person.card', { name: 'Elif Yılmaz' })).person;
if (!elif.uid || !elif.account) fail('hesaplı kişi bulunamadı');
if (chatOn && !elif.chat) fail('mesajlaşma açıkken kartta sohbet kapalı');
const noacc = (await apiCall(A.p, 'person.card', { name: 'Uydurma Kişi Adı' })).person;
if (noacc.account || noacc.uid || noacc.chat || noacc.phone) fail('hesabı olmayan kişide iletişim bilgisi döndü');
const self = (await apiCall(A.p, 'person.card', { uid: await A.p.evaluate(() => S.me.id) })).person;
if (!self.self || self.chat) fail('kendi kartında mesaj düğmesi olmamalı');
const withShifts = await A.p.evaluate(async () => {
  const r = await api('shifts.day', { date: ymd(new Date()) });
  const g = (r.groups || []).find((x) => x.people.length);
  if (!g) return null;
  const p = (await api('person.card', { name: g.people[0].name })).person;
  return { n: g.people[0].name, k: p.shifts.length };
});
if (withShifts && !withShifts.k) fail(`bugün nöbetteki ${withShifts.n} kartında nöbet yok`);
step(`kart: hesaplı / hesapsız kişi ayrımı, kendi kartı, yaklaşan nöbetler${withShifts ? ` (${withShifts.n}: ${withShifts.k} kayıt)` : ''}`);
if (!/bulunamadı/.test(await apiErr(A.p, 'person.card', {}))) fail('boş istek kabul edildi');

// ---- 3) Ana sayfa “Bugün nöbette” çipleri ve üye görünümü ----
const B = await ctx('burak', true);
await login(B.p, 'burak@test.com', 'Sifre1234');
await B.p.goto(BASE + '#/');
const chip = B.p.locator('.duty-chip .pname').first();
await chip.waitFor({ timeout: 10000 }).catch(() => fail('ana sayfada “Bugün nöbette” çipinde dokunulabilir ad yok'));
if (await chip.count()) {
  await chip.click();
  await B.p.locator('.modal .pc').waitFor();
  if (!(await B.p.locator('.modal .pc-shifts').count())) fail('nöbetteki kişinin kartında yaklaşan nöbetler yok');
  await B.p.screenshot({ path: path.join(OUT, 'k-kart-telefon.png') });
  step('“Kim nöbette” listesinde ada dokununca kart ve yaklaşan nöbetler (telefonda)');
  await B.p.keyboard.press('Escape');
}
const w = await B.p.evaluate(() => document.documentElement.scrollWidth);
if (w > 390) fail(`telefonda yatay taşma ${w}px`);

await browser.close();
if (errors.length) { console.log('HATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('TAMAM: kişi kartı testleri geçti');
