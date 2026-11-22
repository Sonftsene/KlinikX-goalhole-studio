// 4.26: telefon takvimine abonelik — e2e.mjs SONRASI (listeler yüklü).
// Kişiye özel gizli bağlantı oturumsuz okunur (iCalendar); liste değişince içerik değişir; yenileyince eski bağlantı çalışmaz; kapatılabilir.
//   node e2e-takvim.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const local = (u) => u.replace(/^https?:\/\/[^/]+\//, BASE);
const feed = async (u) => { const r = await fetch(local(u)); return { status: r.status, type: r.headers.get('content-type') || '', body: await r.text() }; };
const events = (ics) => (ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []);

let E = null;
try {
  E = await ctx('elif', true);
  await login(E.p, 'elif@test.com', 'YeniSifre99');
  await E.p.goto(BASE + '#/nobetim');
  await E.p.locator('#icsBtn:not([disabled])').waitFor({ timeout: 15000 });
  await E.p.click('#icsBtn');
  await E.p.locator('.cal-sub [data-cal=ios]').waitFor();
  const ios = await E.p.locator('.cal-sub [data-cal=ios]').getAttribute('href');
  const google = await E.p.locator('.cal-sub [data-cal=google]').getAttribute('href');
  const url = await E.p.inputValue('#calUrl');
  if (!/^webcal:\/\//.test(ios) || !google.includes('calendar.google.com') || !google.includes(encodeURIComponent('webcal://'))) fail('abonelik bağlantıları yanlış: ' + ios + ' ' + google);
  await E.p.waitForTimeout(500);
  await E.p.screenshot({ path: path.join(OUT, 'cal-pencere.png') });
  // Aynı bağlantı yeniden açınca da aynı (telefondaki abonelik bozulmaz)
  const again = await apiCall(E.p, 'cal.link', { act: 'make' });
  if (again.url !== url) fail('bağlantı yeniden açınca değişti');

  // ---- Oturumsuz okuma (takvim uygulaması gibi) ----
  let f = await feed(url);
  if (f.status !== 200 || !/text\/calendar/.test(f.type) || !f.body.startsWith('BEGIN:VCALENDAR')) fail('takvim okunamadı: ' + f.status + ' ' + f.type);
  if (!/REFRESH-INTERVAL|X-PUBLISHED-TTL/.test(f.body)) fail('yenileme aralığı bildirilmiyor');
  if (f.body.split('\r\n').some((l) => Buffer.byteLength(l) > 75)) fail('75 bayttan uzun satır var (katlanmamış)');
  const my = (await apiCall(E.p, 'shifts.my')).entries.filter((s) => s.kind === 'shift');
  const from = php("echo date('Y-m-d', strtotime('first day of last month'));").trim();
  const to = php("echo date('Y-m-d', strtotime('+120 days'));").trim();
  const want = my.filter((s) => s.date >= from && s.date <= to).length;
  const n0 = events(f.body).length;
  if (!n0 || n0 !== want) fail(`takvimdeki nöbet sayısı Takvimim ile aynı değil (${n0} / ${want})`);
  step(`abonelik: iPhone (webcal), Google, Outlook bağlantıları; oturumsuz okunuyor (${n0} nöbet = Takvimim), yenileme aralığı bildirildi, satırlar katlı; bağlantı sabit`);

  // ---- Liste güncellenince takvim de güncellenir ----
  const day = my.find((s) => s.date >= php("echo date('Y-m-d');").trim());
  const ids = JSON.parse(php(`require_once NM_ROOT . '/inc/notify.php'; $o = []; foreach (all("SELECT s.id, s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ? AND s.kind = 'shift'", ['${day.date}']) as $r) if (names_match((string)$r['name'], (string)one("SELECT name FROM users WHERE email = 'elif@test.com'")['name'])) $o[] = ['id' => (int)$r['id'], 'name' => $r['name']]; echo json_encode($o);`));
  // O gün takvimde kaç etkinlik var (kişi aynı gün iki listede görünse de takvimde tek etkinliktir)
  const startsOn = (e) => new RegExp('DTSTART[^:\\r\\n]*:' + day.date.replace(/-/g, '') + 'T').test(e); // bitişi o güne düşen önceki gece nöbeti sayılmaz
  const onDay = events(f.body).filter(startsOn).length;
  php(`foreach (json_decode('${JSON.stringify(ids)}', true) as $r) q('UPDATE roster_shifts SET name = ? WHERE id = ?', ['Takvim Deneme Kişisi', $r['id']]);`);
  f = await feed(url);
  const n1 = events(f.body).length;
  if (!onDay || n1 !== n0 - onDay || events(f.body).some(startsOn)) fail(`listeden çıkan nöbet takvimden düşmedi (${n0} → ${n1})`);
  php(`foreach (json_decode('${JSON.stringify(ids)}', true) as $r) q('UPDATE roster_shifts SET name = ? WHERE id = ?', [$r['name'], $r['id']]);`);
  f = await feed(url);
  if (events(f.body).length !== n0) fail('liste geri gelince nöbet takvime dönmedi');
  step(`liste değişince takvim değişti: ${day.date} nöbeti listeden çıkınca takvimden düştü (${n0} → ${n1}), geri gelince döndü`);

  // ---- Yenile, kapat, başkası ----
  const r2 = await apiCall(E.p, 'cal.link', { act: 'reset' });
  if (r2.url === url) fail('yenilenen bağlantı aynı');
  if ((await feed(url)).status !== 404) fail('eski bağlantı hâlâ çalışıyor');
  if ((await feed(r2.url)).status !== 200) fail('yeni bağlantı çalışmıyor');
  const forged = r2.url.replace(/t=(\d+)-/, (m0, id) => `t=${+id === 1 ? 2 : 1}-`);
  if ((await feed(forged)).status !== 404) fail('başka kişinin numarasıyla takvim okunabildi');
  await apiCall(E.p, 'cal.link', { act: 'off' });
  if ((await feed(r2.url)).status !== 404) fail('kapatılan abonelik hâlâ okunuyor');
  const r3 = await apiCall(E.p, 'cal.link', {});
  if (r3.on) fail('kapatınca bağlantı gösterilmeye devam ediyor');
  step('bağlantıyı yenileyince eskisi çalışmadı, başka kişinin numarasıyla okunamadı; abonelik kapatılabildi');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: takvim aboneliği testleri geçti');
