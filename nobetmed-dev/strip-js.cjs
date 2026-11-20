// Paketteki JS dosyalarından açıklamaları ve satır başı/sonu boşluklarını atar (package.sh kullanır; kaynak dosyalar değişmez).
// Ayrıştırıcı (espree) jeton sınırlarını bildiği için dize, şablon dizesi ve düzenli ifade içine dokunulmaz.
// Açıklama yerine boşluk / satır sonu bırakılır: otomatik noktalı virgül davranışı değişmez. Sonuç yeniden ayrıştırılır;
// ayrıştırıcı yoksa ya da herhangi bir adım başarısızsa dosya olduğu gibi kalır.
// Kullanım: node strip-js.cjs <dosya.js>...
'use strict';
const fs = require('fs');
let espree = null;
for (const p of ['espree', '/opt/node-tools/node_modules/espree', '/usr/lib/node_modules/eslint/node_modules/espree']) { try { espree = require(p); break; } catch (e) { /* */ } }
if (!espree) { console.error('strip-js: espree yok, JS küçültülmedi'); process.exit(0); }
const OPT = { ecmaVersion: 'latest', sourceType: 'script', range: true, tokens: true };
let saved = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    // 1) Açıklamalar
    const a1 = espree.parse(src, { ...OPT, comment: true });
    let out = '', pos = 0;
    for (const c of a1.comments) {
      out += src.slice(pos, c.range[0]);
      out += c.type === 'Line' ? '' : (src.slice(c.range[0], c.range[1]).includes('\n') ? '\n' : ' ');
      pos = c.range[1];
    }
    out += src.slice(pos);
    // 2) Satır başı / sonu boşlukları ve boş satırlar — dize, şablon ve düzenli ifade jetonlarının içi hariç
    const prot = espree.parse(out, OPT).tokens.filter((t) => t.type === 'Template' || t.type === 'String' || t.type === 'RegularExpression').map((t) => t.range);
    const inside = (p) => { let lo = 0, hi = prot.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (prot[m][1] <= p) lo = m + 1; else if (prot[m][0] > p) hi = m - 1; else return prot[m][0] < p; } return false; };
    let res = '', off = 0;
    for (const line of out.split('\n')) {
      const s = off, e = off + line.length; off = e + 1;
      let t = line;
      if (!inside(s)) t = t.replace(/^[ \t]+/, '');
      if (!inside(e)) t = t.replace(/[ \t]+$/, '');
      if (t === '' && !inside(s)) continue;
      res += t + '\n';
    }
    // Denetim: jeton dizisi (tür + değer) birebir aynı olmalı
    const t0 = a1.tokens, t1 = espree.parse(res, OPT).tokens;
    if (t0.length !== t1.length || t0.some((t, i) => t.type !== t1[i].type || t.value !== t1[i].value)) throw new Error('jetonlar değişti');
    saved += Buffer.byteLength(src) - Buffer.byteLength(res);
    fs.writeFileSync(f, res);
  } catch (e) { console.error('strip-js: atlandı ' + f + ': ' + e.message); }
}
console.error('strip-js: ' + Math.round(saved / 1024) + ' KB açıklama/boşluk atıldı');
