// Ay sınırında 24 saati gece yarısında bölme — birim ayarı (4.57.0) — uydurma verilerle.
// Elif ayın son günü (L) 08-08 (24 saat) çalışıyor. Ayar KAPALI: 24 saatin tamamı L’nin ayına. AÇIK: 16 saat L’nin ayına,
// 8 saat (00-08) sonraki aya; çalışılması gereken saat değişmez. “0 8” kodu 8 saat tanınır. Çizelge (resmî liste) için
// önceki ayın son günü sunucudan gelir.
//   node e2e-ay-bol.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
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
const pad = (n) => String(n).padStart(2, '0');
const TR_M = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

let A = null;
let rid = 0;
try {
  A = await login('ayse@test.com', 'Sifre1234');
  const E = await login('elif@test.com', 'YeniSifre99');
  // İki ay: M1 = gelecek ay, M2 = ondan sonraki ay (“Takvimim” verisi bugünden ~70 gün ileriyi kapsar); L = M1’in son günü.
  // Diğer testlerin verisiyle karışmasın diye yalnız bu listenin kayıtları toplanır.
  const now = new Date();
  const m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const y1 = m1.getFullYear(), mo1 = m1.getMonth() + 1, ym1 = `${y1}-${pad(mo1)}`;
  const m2 = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const y2 = m2.getFullYear(), mo2 = m2.getMonth() + 1, ym2 = `${y2}-${pad(mo2)}`;
  const L = `${ym1}-${pad(new Date(y1, mo1, 0).getDate())}`;
  const H24 = { code: '8 8', label: '24 saat', kind: 'shift', start: '08:00', end: '08:00', hours: 24 };
  const G = { code: '8 16', label: 'Gündüz', kind: 'shift', start: '08:00', end: '16:00', hours: 8 };

  // Tek liste, iki ay (aynı listeye ikinci ay yüklenince birinci ay silinmez)
  rid = (await call(A, 'rosters.save', { name: 'Ay bölme deneme' })).id;
  const up = async (ym, entries) => {
    const fid = await A.evaluate(async (t) => (await uploadFile(new File([`%PDF-1.4\n% ${t} ${Math.random()}\n`], `${t}.pdf`, { type: 'application/pdf' }))).id, 'ay-bol-' + ym);
    await call(A, 'rosters.upload', { id: rid, attachment_id: fid, ym, primary: true });
    await call(A, 'rosters.shifts', { roster_id: rid, file_id: fid, period: ym, entries, primary: true });
  };
  // “7 19” sözlükte yok ve kayıtta saat yok: 12 saat sayılmalı (önceden 0 sayılıp fazla mesaiden düşüyordu — 4.57.1)
  await up(ym1, [{ name: 'Elif Yılmaz', date: `${ym1}-10`, ...G }, { name: 'Elif Yılmaz', date: `${ym1}-12`, code: '7 19', kind: 'shift' }, { name: 'Elif Yılmaz', date: L, ...H24 }]);
  // Ocak dosyası dinlenme için 31 Aralık sütununu da içeriyor (Elif boş/başka kod gibi): Aralık’ın kendi kaydı ezilmemeli
  await up(ym2, [{ name: 'Elif Yılmaz', date: L, ...G }, { name: 'Burak Demir', date: L, ...G }, { name: 'Elif Yılmaz', date: `${ym2}-10`, ...G }]);
  {
    const all = (await call(E, 'shifts.my')).entries.filter((e) => e.roster === 'Ay bölme deneme' && e.date === L);
    if (all.length !== 1 || all[0].code !== '8 8') fail(`sonraki ayın dosyası ${L} kaydını ezdi: ` + JSON.stringify(all.map((x) => x.code)));
    const bk = (await call(A, 'plan.get', { roster_id: rid, ym: ym2 })).prev_last || {};
    if (!Object.values(bk).some((x) => /Burak/.test(x.name) && x.code === '8 16')) fail(`sonraki ayın dosyasındaki boş güne (Burak ${L}) kayıt eklenmedi`);
    step(`${ym2} dosyasındaki ${L} sütunu: Elif’in Aralık kaydı (8 8) korundu; boş olan Burak’ın günü dolduruldu`);
  }

  const sums = async () => E.evaluate(async ([a, b, c, d]) => {
    const r = await api('shifts.my');
    const ent = r.entries.filter((e) => e.roster === 'Ay bölme deneme');
    const s1 = summarizeMonth(ent, a, b, null), s2 = summarizeMonth(ent, c, d, null);
    return { h1: s1.hours, r1: s1.requiredHours, h2: s2.hours, r2: s2.requiredHours, split: monthSplitOn() };
  }, [y1, mo1, y2, mo2]);

  // 1) Ayar kapalı (varsayılan): 24 saatin tamamı başladığı ayda
  await call(A, 'settings.save', { month_split: false });
  await E.reload(); await E.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const off = await sums();
  if (off.split) fail('ayar kapalıyken bölme açık görünüyor');
  if (off.h1 !== 44 || off.h2 !== 8) throw new Error(`ayar kapalı: ${ym1} 44 (8+12+24) / ${ym2} 8 saat beklenirdi: ` + JSON.stringify(off));
  step(`ayar kapalı: ${L} 08-08 nöbeti tamamen ${ym1}’e (${off.h1} saat), ${ym2}: ${off.h2} saat`);

  // 2) Yönetici ayarı arayüzden açar
  await A.goto(BASE + '#/yonetim/ayarlar/nobet');
  const sw = A.locator('form[data-form=settings] input[name=month_split]');
  await sw.waitFor({ state: 'attached', timeout: 10000 });
  if (await sw.isChecked()) fail('ayar varsayılan açık');
  await sw.locator('..').click();
  await A.locator('form[data-form=settings] [data-sec=nobet]', { hasText: 'Ay sonu ve başındaki 24 saatlik nöbet' }).first().screenshot({ path: path.join(OUT, 'ay-bol-ayar.png') }).catch(() => {});
  await A.click('form[data-form=settings] .settings-save button[type=submit]');
  await A.getByText('Ayarlar kaydedildi').first().waitFor({ timeout: 8000 });
  const adm = await call(A, 'settings.get').catch(() => null);
  if (adm && adm.admin && adm.admin.month_split !== true) fail('ayar kaydedilmedi: ' + JSON.stringify(adm.admin.month_split));

  // 3) Ayar açık: 16 saat L’nin ayına, 8 saat sonraki aya; gereken saat aynı
  await E.reload(); await E.waitForFunction(() => typeof S !== 'undefined' && S.me);
  const on = await sums();
  if (!on.split) fail('ayar açıldı ama kişide bölme kapalı');
  if (on.h1 !== 36 || on.h2 !== 16) throw new Error(`ayar açık: ${ym1} 36 (8+12+16) / ${ym2} 16 (8+8) saat beklenirdi: ` + JSON.stringify(on));
  if (on.r1 !== off.r1 || on.r2 !== off.r2) fail('çalışılması gereken saat değişti: ' + JSON.stringify({ off, on }));
  step(`ayar açık: ${L} 08-08 → ${ym1}’e 16 saat (toplam ${on.h1}), ${ym2}’e 8 saat (toplam ${on.h2}); gereken saat değişmedi (${on.r1} / ${on.r2})`);

  // 3b) Takvimim › Saat dökümü: gün gün sayılan saat ve gereken saatin hesabı
  await E.goto(BASE + '#/nobetim');
  await E.locator('.cal-head').waitFor({ timeout: 10000 });
  for (let k = 0; k < 3 && !(await E.locator('.cal-head b', { hasText: TR_M[mo1 - 1] + ' ' + y1 }).count()); k++) { await E.click('[data-act=cal-mv][data-d="1"]'); await E.waitForTimeout(300); }
  await E.click('[data-act=cal-sum]');
  const md = E.locator('.modal').last();
  await md.locator('.cal-sum-t').waitFor({ timeout: 5000 });
  const mt = await md.innerText();
  if (!/7 19/.test(mt) || !/\b12\b/.test(mt)) fail('saat dökümünde “7 19” 12 saat görünmüyor');
  if (!/sonraki aya/.test(mt)) fail('saat dökümünde ay sınırı notu yok');
  if (!/Çalışılması gereken/.test(mt)) fail('saat dökümünde gereken saat hesabı yok');
  await md.screenshot({ path: path.join(OUT, 'ay-bol-dokum.png') }).catch(() => {});
  step('Takvimim › Saat dökümü: “7 19” 12 saat, son gün “gece yarısından sonraki 8 saat sonraki aya”, gereken saat hesabı');

  // 4) “0 8” ve “8 24” kodları doğru saatle tanınır; tek tek toplandığında bölme olmaz (8 24 gece yarısında biter)
  const cls = await E.evaluate(() => [classifyCode('0 8'), classifyCode('8 24'), shiftSpillHours({ kind: 'shift', hours: 16, start: '08:00', end: '24:00' }), shiftSpillHours({ kind: 'shift', hours: 24, start: '08:00', end: '08:00' }), shiftSpillHours({ kind: 'shift', hours: 16, start: '16:00', end: '08:00' })]);
  if (!cls[0] || cls[0].hours !== 8 || cls[0].start !== '00:00') fail('“0 8” kodu tanınmadı: ' + JSON.stringify(cls[0]));
  if (!cls[1] || cls[1].hours !== 16) fail('“8 24” kodu 16 saat değil: ' + JSON.stringify(cls[1]));
  if (cls[2] !== 0 || cls[3] !== 8 || cls[4] !== 8) fail('taşan saat hesabı: ' + JSON.stringify(cls.slice(2)));
  step('kodlar: “0 8” = 8 saat (00-08), “8 24” = 16 saat; taşan saat: 08-24 → 0, 08-08 → 8, 16-08 → 8');

  // 5) Çizelge / resmî liste: önceki ayın son günü ve ayar sunucudan gelir
  const pg = await call(A, 'plan.get', { roster_id: rid, ym: ym2 });
  const prev = Object.values(pg.prev_last || {});
  const pe = prev.find((x) => /Elif/.test(x.name));
  if (!pg.month_split) fail('çizelgeye ayar gelmedi');
  if (!pe || pe.code !== '8 8' || +pe.hours !== 24) fail('çizelgeye önceki ayın son günü gelmedi: ' + JSON.stringify(prev));
  // Resmî liste saat hesabı (çizelge ekranı): Elif ${ym2}: 8 (gündüz) + 8 (önceki ayın son gününden taşan) = 16; ${ym1}: 8 + 16 = 24
  await A.reload(); await A.waitForFunction(() => typeof S !== 'undefined' && S.me); // yeni liste S.rosters’a gelsin
  await A.goto(BASE + `#/cizelge/${rid}/${ym2}`);
  await A.locator('#plGrid').waitFor({ timeout: 15000 });
  await A.waitForFunction(([r, y]) => PL2.rid === r && PL2.ym === y, [rid, ym2]);
  const w2 = await A.evaluate(() => { const o = rsHours(PL2.d, PL2.ym, { day_hours: 8, half_hours: 4 }, PL2.hol, PL2.half); const k = Object.keys(o).find((n) => /Elif/.test(n)); return k ? o[k] : null; });
  await A.goto(BASE + `#/cizelge/${rid}/${ym1}`);
  await A.locator('#plGrid').waitFor({ timeout: 15000 });
  await A.waitForFunction(([r, y]) => PL2.rid === r && PL2.ym === y, [rid, ym1]);
  const w1 = await A.evaluate(() => { const o = rsHours(PL2.d, PL2.ym, { day_hours: 8, half_hours: 4 }, PL2.hol, PL2.half); const k = Object.keys(o).find((n) => /Elif/.test(n)); return k ? o[k] : null; });
  if (!w2 || w2.work !== 16) fail('resmî liste ' + ym2 + ' çalışılan 16 olmalı: ' + JSON.stringify(w2));
  // Bu listenin önceki ay kaydı yoksa kişinin diğer listelerindeki önceki ay son günü sayılır (her ay ayrı liste açan birim)
  const carry1 = await A.evaluate(() => { const x = (PL2.prevLast || []).find((r) => avKey(r.name) === avKey('Elif Yılmaz')); return x ? shiftSpillHours(x) : 0; });
  if (!w1 || w1.work !== 36 + carry1) fail('resmî liste ' + ym1 + ' çalışılan ' + (36 + carry1) + ' olmalı: ' + JSON.stringify(w1));
  if (w2 && w2.night < 8) fail('taşan gece saati bu aya yazılmadı: ' + JSON.stringify(w2));
  step(`resmî liste: ${ym1} çalışılan ${w1 && w1.work} (gece ${w1 && w1.night}), ${ym2} çalışılan ${w2 && w2.work} (gece ${w2 && w2.night})`);
  step(`çizelge (${ym2}): önceki ayın son günü (${L} ${pe && pe.code}) ve ayar geldi; resmî listede taşan 8 saat bu aya yazılır`);
} catch (e) {
  fail('beklenmeyen hata: ' + e.message);
}
try { if (A) { await call(A, 'settings.save', { month_split: false }); if (rid) await call(A, 'rosters.delete', { id: rid }); } } catch (e) { /* */ }
await browser.close();
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: ay sınırı bölme testleri geçti');
