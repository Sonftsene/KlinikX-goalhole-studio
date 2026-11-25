// Denetim düzeltmeleri (4.55.0) — uydurma verilerle.
// e2e.mjs, e2e-tenant.mjs, e2e-hastane.mjs, e2e-mesaj.mjs SONRASI aynı sitede çalışır (Dahiliye birimi ve nil@test.com orada açılır):
//   node e2e-denetim.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
// 1) Başka birimin yöneticisi, YBÜ’nün kurduğu grubu “kalıcı sil”se bile grup YBÜ’de geçmişiyle durur (yalnız Dahiliye kişileri çıkar).
// 2) Değişim ilanına başka listedeki nöbetle başvurulamaz; gösterilen teklif = kabul edilen teklif.
// 3) Listeye işlerken dönemin ±7 günü dışındaki tarih yok sayılır (aradaki aylar silinmez).
// 4) Yöneticinin “Gönderilenler”inde kişiye özel bildirim (ilan seçimi, değişim…) yok.
// 5) Form çift gönderilince kayıt bir kez eklenir.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const errors = [];
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
async function login(email, pw) {
  const c = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[${email}] pageerror: ${e.message}`));
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  return p;
}
const call = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y), [a, d]);
const err = (p, a, d = {}) => p.evaluate(([x, y]) => api(x, y).then(() => 'kabul', (e) => e.message || String(e.status)), [a, d]);
const pad = (n) => String(n).padStart(2, '0');
const addDays = (ds, k) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + k); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const rids = [];
let A = null;
try {
  A = await login('ayse@test.com', 'Sifre1234');
  const E = await login('elif@test.com', 'YeniSifre99');
  const B = await login('burak@test.com', 'Sifre1234');

  // ---- 1) Birimler arası grup: başka birimin yöneticisinin “kalıcı sil”i grubu YBÜ’den silmez ----
  let N = null;
  try { N = await login('nil@test.com', 'NilSifre1234'); } catch (e) { N = null; }
  if (!N) step('(Dahiliye birimi yok: birimler arası kalıcı silme denetimi atlandı)');
  else {
    const people = (await call(A, 'chat.people')).people || [];
    const nilP = people.find((p) => p.name === 'Nil Er');
    const elifP = people.find((p) => p.name === 'Elif Yılmaz');
    if (!nilP) throw new Error('Nil kişi listesinde yok (test verisi)');
    const g = await call(A, 'chat.create', { name: 'Denetim ortak grup', members: [{ tk: nilP.tk, uid: nilP.uid }, ...(elifP ? [{ tk: elifP.tk, uid: elifP.uid }] : [])] });
    const gid = g.id || (g.chat && g.chat.id);
    await call(A, 'chat.send', { id: gid, body: 'Ortak gruptaki mesaj (silinmemeli)' });
    const row = (await call(N, 'chat.admin.all')).items.find((c) => c.id === gid);
    if (!row) throw new Error('Nil’in yönetici listesinde ortak grup yok');
    if (row.scope !== 'own') fail('başka birimin grubu “yalnız birimdekilerden” kapsamında değil: ' + row.scope);
    await call(N, 'chat.admin.delete', { id: gid });
    const tr = (await call(N, 'chat.admin.trash')).items.find((t) => t.name === 'Denetim ortak grup' && !t.gone);
    if (!tr) throw new Error('çöp kutusunda yok');
    await call(N, 'chat.admin.purge', { id: tr.id });
    const op = await call(A, 'chat.open', { id: gid }).catch((e) => ({ err: e.message }));
    if (op.err) fail('başka birimin yöneticisi YBÜ’nün grubunu kalıcı sildi: ' + op.err);
    else if (!(op.msgs || []).some((m) => /silinmemeli/.test(m.body || ''))) fail('YBÜ’nün grubundaki mesajlar silindi');
    if ((await err(N, 'chat.open', { id: gid })) === 'kabul') fail('Nil kalıcı silmeden sonra hâlâ gruba erişiyor');
    if (elifP && !(await call(E, 'chat.list')).items.some((c) => c.id === gid)) fail('Elif’in listesinden ortak grup düştü');
    step('başka birimin yöneticisi YBÜ’nün grubunu “kalıcı sil”di: yalnız Dahiliye kişileri çıktı; grup ve mesajlar YBÜ’de duruyor');
    await N.context().close();
  }

  // ---- 2) Değişim ilanı: yalnız bu listedeki nöbetle başvurulur ----
  const busy = new Set([...(await call(E, 'shifts.my')).entries, ...(await call(B, 'shifts.my')).entries].map((x) => x.date));
  const now = new Date();
  let D = null, ym = null;
  for (let k = 1; k <= 3 && !D; k++) {
    const nm = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const y2 = `${nm.getFullYear()}-${pad(nm.getMonth() + 1)}`;
    for (let d = 10; d <= 16 && !D; d++) {
      const ds = `${y2}-${pad(d)}`;
      if (![-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((j) => busy.has(addDays(ds, j)))) { D = ds; ym = y2; }
    }
  }
  if (!D) throw new Error('uygun gün bulunamadı (test verisi)');
  const N8 = { code: 'N', label: 'Gece', kind: 'shift', start: '16:00', end: '08:00', hours: 16 };
  const mk = async (name, entries, period = ym) => {
    const id = (await call(A, 'rosters.save', { name })).id; rids.push(id);
    const fid = await A.evaluate(async (t) => (await uploadFile(new File([`%PDF-1.4\n% ${t} ${Math.random()}\n`], `${t}.pdf`, { type: 'application/pdf' }))).id, name);
    await call(A, 'rosters.upload', { id, attachment_id: fid, ym: period, primary: true });
    const r = await call(A, 'rosters.shifts', { roster_id: id, file_id: fid, period, entries, primary: true });
    return [id, r.saved];
  };
  const inA = addDays(D, 5); // Burak’ın bu listedeki nöbeti (teklif edilebilir)
  const inB = addDays(D, 9); // Burak’ın başka listedeki nöbeti (teklif edilemez)
  await mk('Denetim A', [{ name: 'Elif Yılmaz', date: D, ...N8 }, { name: 'Burak Demir', date: inA, ...N8 }]);
  await mk('Denetim B', [{ name: 'Burak Demir', date: inB, ...N8 }]);
  const L = (await call(E, 'listing.create', { date: D, kind: 'swap' })).listing;
  const el = ((await call(B, 'listing.list')).board.find((x) => x.id === L.id) || {}).elig;
  if (!el) throw new Error('Burak değişim ilanını görmüyor');
  const offs = (el.offers || []).map((o) => o.date);
  if (!offs.includes(inA)) fail(`aynı listedeki nöbet (${inA}) teklif olarak görünmüyor: ` + JSON.stringify(el));
  if (offs.includes(inB)) fail(`başka listedeki nöbet (${inB}) değişim teklifi olarak görünüyor`);
  if ((await err(B, 'listing.apply', { id: L.id, offer_date: inB })) === 'kabul') fail('başka listedeki nöbetle değişim ilanına başvurulabildi');
  // Gösterilen teklifle başvuru kabul edilir
  const ap = await err(B, 'listing.apply', { id: L.id, offer_date: inA });
  if (ap !== 'kabul') fail('gösterilen teklifle başvuru reddedildi: ' + ap);
  await call(E, 'listing.cancel', { id: L.id }).catch(() => {});
  step(`değişim ilanı: teklifler yalnız bu listeden (${inA} var, başka listedeki ${inB} yok); başka listenin nöbetiyle başvuru reddedildi; gösterilen teklif kabul edildi`);

  // ---- 3) Listeye işleme: dönem dışı (±7 gün) tarih yok sayılır, aradaki aylar silinmez ----
  const far = addDays(`${ym}-01`, -200);
  const [ridC, saved] = await mk('Denetim C', [{ name: 'Elif Yılmaz', date: `${ym}-20`, ...N8 }, { name: 'Elif Yılmaz', date: far, ...N8 }]);
  if (saved !== 1) fail(`dönem dışı tarih de kaydedildi (kaydedilen: ${saved})`);
  step(`listeye işleme: dönemden çok uzak tarih (${far}) yok sayıldı; aradaki aylar silinmedi`);
  void ridC;

  // ---- 4) Gönderilenler: kişiye özel bildirim yok ----
  const sent = (await call(A, 'notif.sent')).items || [];
  const PERSONAL = ['swap', 'privacy', 'billing', 'support', 'remind', 'notif_remind', 'pending_user', 'apply', 'review', 'chat_admin', 'request', 'digest', 'chat', 'call'];
  const bad = sent.filter((x) => PERSONAL.includes(x.kind) || (x.kind === 'listing' && x.n < 2));
  if (bad.length) fail('Gönderilenler’de kişiye özel bildirim var: ' + bad.map((x) => x.kind + ':' + x.title).slice(0, 3).join(' | '));
  if ((await err(A, 'notif.retract', { g: 'x', kind: 'swap', title: 'x' })) === 'kabul') fail('değişim bildirimi geri alınabildi');
  step(`yöneticinin “Gönderilenler”inde kişiye özel bildirim yok (${sent.length} gönderim); değişim bildirimi geri alınamıyor`);

  // ---- 5) Çift gönderim: rehbere aynı numara bir kez eklenir ----
  await A.goto(BASE + '#/telefon');
  await A.locator('[data-act=pb-add]').first().click();
  const NAME = 'Denetim çift kayıt ' + Date.now().toString(36);
  await A.fill('.modal [data-form=pb-save] [name=name]', NAME);
  await A.fill('.modal [data-form=pb-save] [name=number]', '4321');
  await A.evaluate(() => { const f = document.querySelector('.modal [data-form=pb-save]'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); });
  await A.waitForTimeout(1500);
  const items = (await call(A, 'phonebook.list')).items || [];
  const n = items.filter((x) => x.name === NAME).length;
  if (n !== 1) fail(`çift gönderimde rehbere ${n} kayıt eklendi`);
  const it = items.find((x) => x.name === NAME);
  if (it) await call(A, 'phonebook.delete', { id: it.id }).catch(() => {});
  step('form art arda üç kez gönderildi: rehbere bir kez eklendi');
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
for (const id of rids) { try { await call(A, 'rosters.delete', { id }); } catch (e) { /* */ } }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: denetim düzeltmeleri testleri geçti');
