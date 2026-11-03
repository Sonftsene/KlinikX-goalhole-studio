// Canlı önizleme sayfasını üretir: node build-preview.mjs <çıktı.html>
// Uygulamanın gerçek CSS/JS dosyalarını tek sayfada birleştirir ve sunucu yerine demo-api.js kullanır.
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(here, '..', 'nobetmed', 'assets');
const out = process.argv[2] || path.join(here, 'nobetmed-onizleme.html');
// İsteğe bağlı: node build-preview.mjs cikti.html <klasör> — o klasördeki .xlsx dosyaları nöbet listesi olarak kullanılır
// (gerçek kişi isimleri içeren listeler repoya konmaz, önizlemeye buradan verilir)
const extraDir = process.argv[3] || null;
const read = (p) => fs.readFileSync(p, 'utf8');
let css = read(path.join(app, 'app.css'));
// Koyu tema değişkenlerini sistem tercihine de bağla (tema seçimi yapılmamış görüntüleyiciler için)
const dark = css.match(/\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1];
css += `\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${dark}\n} }\n`;
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const js = ['core', 'auth', 'posts', 'viewer', 'rosters', 'admin', 'shiftparse', 'extras', 'pwa', 'main'].map((n) => `<script>\n${safe(read(path.join(app, 'js', n + '.js')))}\n</script>`).join('\n');
const html = `<!doctype html>
<html lang="tr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>dupcii</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
<script id="nm-boot" type="application/json">{"csrf":"demo","share":""}</script>
<script>
window.NM_DEMO_FILES = ${JSON.stringify(Object.fromEntries([...fs.readdirSync(path.join(here, 'fixtures')).map((f) => [f, path.join(here, 'fixtures', f)]), ...(extraDir ? fs.readdirSync(extraDir).filter((f) => f.endsWith('.xlsx')).map((f) => [f, path.join(extraDir, f)]) : [])].filter(([f, p]) => fs.statSync(p).isFile() && /\.(xlsx|pdf|docx|png)$/.test(f)).map(([f, full]) => {
  const mime = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[f.split('.').pop()] || 'application/octet-stream';
  return [f, 'data:' + mime + ';base64,' + fs.readFileSync(full).toString('base64')];
})))};
${extraDir && fs.existsSync(path.join(extraDir, 'demo-admin.json')) ? `window.NM_DEMO_ADMIN = ${fs.readFileSync(path.join(extraDir, 'demo-admin.json'), 'utf8').trim()};` : ''}
${extraDir ? `window.NM_DEMO_ROSTERS = ${JSON.stringify(fs.readdirSync(extraDir).filter((f) => f.endsWith('.xlsx')).sort().reverse().map((f) => [f.replace(/\.xlsx$/, '').replace(/-kasim-(\d)-basamak/, ' $1. Basamak').replace(/^yogun-bakim/, 'Yoğun Bakım').replace(/-/g, ' '), f]))};` : ''}
</script>
<script>
${safe(read(path.join(app, 'theme.js')))}
</script>
<div id="app"><div class="boot-splash"><div class="spinner"></div></div></div>
<script>
${safe(read(path.join(here, 'demo-api.js')))}
</script>
${js}
`;
fs.writeFileSync(out, html);
console.log('yazıldı:', out, (html.length / 1024).toFixed(0) + ' KB');
