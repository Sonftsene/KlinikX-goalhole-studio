const { chromium } = require('playwright');
const fs = require('fs');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await p.goto('http://127.0.0.1:8095/'); await p.waitForSelector('.post');
  const files = fs.readdirSync(S + '/prev/real').filter((f) => /\.(xlsx|xlsm|xls|ods|csv)$/.test(f));
  let ok = 0;
  for (const f of files) {
    const r = await p.evaluate(async (f) => {
      const el = document.createElement('div'); el.style.height = '500px'; el.style.display = 'flex'; document.body.appendChild(el);
      const att = { id: 'x' + Math.random(), name: f, url: 'real/' + encodeURIComponent(f) };
      const t0 = performance.now();
      try {
        const res = await Promise.race([mountSheet(el, att), new Promise((_, rej) => setTimeout(() => rej(new Error('ZAMAN AŞIMI 20s')), 20000))]);
        const cells = el.querySelectorAll('td.xc').length;
        el.remove();
        return { ok: true, ms: Math.round(performance.now() - t0), sheets: res.model.sheets.length, cells };
      } catch (e) { el.remove(); return { ok: false, err: String(e && e.stack || e).split('\n').slice(0, 4).join(' | ') }; }
    }, f);
    if (r.ok) ok++;
    console.log((r.ok ? 'OK   ' : 'HATA ') + f + ' ' + (r.ok ? `${r.ms}ms sayfa=${r.sheets} hücre=${r.cells}` : r.err));
  }
  console.log(`\n${ok}/${files.length} açıldı`);
  await b.close();
})();
