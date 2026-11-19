// Görünüm denetimi: telefon (390 px) ve masaüstünde tüm sayfaları gezer; sıkışmış yazı sütunlarını (kelimelerin alt alta dizildiği
// dar kutular), yatay taşmayı ve masaüstünde fareyle ulaşılamayan yatay kaydırmalı şeritleri raporlar. Uydurma verili sitede çalışır:
//   node audit-mobil.mjs http://localhost:8240/ <çıktı klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const OUT = process.argv[3] || '.';
const SHOTS = process.env.SHOTS === '1';
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const ROUTES = ['#/', '#/nobetim', '#/rehber', '#/taraf', '#/tablo', '#/ilanlar', '#/ilanlar/mine', `#/ekstra/${ym}`, `#/ekstra/gonullu/${ym}`, `#/ekstra/liste/${ym}`,
  '#/eksik', '#/gecmis', '#/istekler', '#/telefon', '#/hastane', '#/mesaj', '#/yemek', '#/yemek/ay', '#/bildirimler', '#/okunacak', '#/kaydedilenler',
  '#/profil', '#/profil/guvenlik', '#/profil/bildirim', '#/profil/gorunum', '#/ayarlar', '#/yonetim/kullanicilar', '#/yonetim/onaylar', '#/yonetim/raporlar', '#/yonetim/gunluk', '#/nobet', '#/cizelge'];
let issues = 0;
async function audit(mobile, email, pw) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  await c.addInitScript(() => { try { localStorage.setItem('nm-tour', 'done'); } catch (e) { /* */ } });
  const p = await c.newPage();
  await p.goto(BASE);
  await p.fill('[data-form=login] [name=email]', email);
  await p.fill('[data-form=login] [name=password]', pw);
  await p.click('[data-form=login] button[type=submit]');
  await p.waitForFunction(() => typeof S !== 'undefined' && S.me);
  // Ekstra: bugünden ileri bir gün seçili devral görünümü
  const routes = [...ROUTES];
  for (const r of routes) {
    await p.goto(BASE + r);
    await p.waitForTimeout(1300);
    const res = await p.evaluate((mob) => {
      const out = [];
      const W = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > W + 1) out.push(`yatay taşma ${document.documentElement.scrollWidth}px`);
      const view = document.querySelector('#view') || document.body;
      const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
      // 1) Sıkışmış yazı: en az 3 kelimelik metin, kutusu dar (< 34% satır ya da < 120 px) ve 3+ satıra bölünmüş
      view.querySelectorAll('.list-row, .card, .tk-it, .mk-item, .row').forEach((row) => {
        const rw = row.getBoundingClientRect().width;
        if (rw < 260) return;
        row.querySelectorAll(':scope > .grow, :scope > div, :scope > span').forEach((col) => {
          const r = col.getBoundingClientRect();
          const t = txt(col);
          if (!t || t.split(' ').length < 4 || r.width === 0) return;
          const lh = parseFloat(getComputedStyle(col).lineHeight) || 18;
          const lines = r.height / lh;
          if ((r.width < rw * 0.34 || r.width < 120) && lines > 3.5) out.push(`sıkışık sütun ${Math.round(r.width)}/${Math.round(rw)}px, ~${Math.round(lines)} satır: ${(row.className || row.tagName).toString().slice(0, 40)} › “${t.slice(0, 50)}”`);
        });
      });
      // 2) Kelime kelime kırılan yazı: tek kelimelik satırlar
      view.querySelectorAll('b, .lr-t, .lr-s, .tiny, .small, p, span').forEach((el) => {
        const t = txt(el); if (t.split(' ').length < 5 || el.children.length > 3) return;
        const r = el.getBoundingClientRect(); if (!r.width) return;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
        if (r.width < 110 && r.height / lh >= 5) out.push(`kelime kelime kırılıyor (${Math.round(r.width)}px): “${t.slice(0, 50)}”`);
      });
      // 3) Masaüstü: yatay kaydırmalı ama kaydırma çubuğu gizli şerit (fareyle ulaşılamaz)
      if (!mob) view.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (!/(auto|scroll)/.test(cs.overflowX) || el.scrollWidth <= el.clientWidth + 2) return;
        // Kaydırma çubuğu görünüyorsa fareyle ulaşılır; görünmüyorsa ve tekerlek desteği yoksa sorun
        const bar = el.offsetHeight - el.clientHeight - (parseFloat(cs.borderTopWidth) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
        if (bar >= 3) return;
        if (window.NM_HSCROLL && !el.closest('.xv-scroll, table')) return;
        out.push(`masaüstünde fareyle kaydırılamayan şerit: .${(el.className || el.tagName).toString().split(' ')[0]} (${el.scrollWidth}/${el.clientWidth}px)`);
      });
      return [...new Set(out)];
    }, mobile);
    // Devral sayfasında gündüz / gece süzgeçleri (24 saatlik nöbetin parça düğmeleri)
    if (r.startsWith('#/ekstra/2')) for (const f of ['night', 'day']) {
      const b = p.locator(`[data-act=tk-f][data-f=${f}]`);
      if (!(await b.count())) continue;
      await b.first().click(); await p.waitForTimeout(400);
      const more = await p.evaluate(() => [...document.querySelectorAll('.list-row')].flatMap((row) => {
        const g = row.querySelector(':scope > .grow'); if (!g) return [];
        const rw = row.getBoundingClientRect().width, w = g.getBoundingClientRect().width;
        return w < rw * 0.45 ? [`sıkışık devral satırı ${Math.round(w)}/${Math.round(rw)}px: “${g.innerText.replace(/\s+/g, ' ').slice(0, 40)}”`] : [];
      }));
      res.push(...more.map((x) => `[${f}] ` + x));
      if (SHOTS) await p.screenshot({ path: path.join(OUT, `a-${mobile ? 'm' : 'd'}-ekstra-${f}.png`), fullPage: true });
    }
    if (res.length) { issues += res.length; console.log(`${mobile ? 'TELEFON' : 'MASAÜSTÜ'} ${email.split('@')[0]} ${r}:\n  - ${res.join('\n  - ')}`); }
    if (SHOTS) await p.screenshot({ path: path.join(OUT, `a-${mobile ? 'm' : 'd'}-${r.replace(/[^a-z0-9]+/gi, '_')}.png`), fullPage: true });
  }
  await c.close();
}
await audit(true, 'ayse@test.com', 'Sifre1234');
await audit(true, 'elif@test.com', 'YeniSifre99');
await audit(false, 'ayse@test.com', 'Sifre1234');
await browser.close();
console.log(issues ? `SORUN: ${issues}` : 'TEMİZ: görünüm denetimi sorun bulmadı');
process.exit(issues ? 1 : 0);
