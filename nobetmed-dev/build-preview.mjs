// Canlı önizleme sayfasını üretir: node build-preview.mjs <çıktı.html>
// Uygulamanın gerçek CSS/JS dosyalarını tek sayfada birleştirir ve sunucu yerine demo-api.js kullanır.
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const app = path.join(here, '..', 'nobetmed', 'assets');
const out = process.argv[2] || path.join(here, 'nobetmed-onizleme.html');
const read = (p) => fs.readFileSync(p, 'utf8');
let css = read(path.join(app, 'app.css'));
// Koyu tema değişkenlerini sistem tercihine de bağla (tema seçimi yapılmamış görüntüleyiciler için)
const dark = css.match(/\[data-theme="dark"\] \{([\s\S]*?)\n\}/)[1];
css += `\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${dark}\n} }\n`;
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const js = ['core', 'auth', 'posts', 'viewer', 'rosters', 'admin', 'main'].map((n) => `<script>\n${safe(read(path.join(app, 'js', n + '.js')))}\n</script>`).join('\n');
const html = `<title>NöbetMed Klinik Portalı</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
<script id="nm-boot" type="application/json">{"csrf":"demo","share":""}</script>
<script>
window.NM_DEMO_FILES = ${JSON.stringify(Object.fromEntries(fs.readdirSync(path.join(here, 'fixtures')).map((f) => {
  const mime = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[f.split('.').pop()] || 'application/octet-stream';
  return [f, 'data:' + mime + ';base64,' + fs.readFileSync(path.join(here, 'fixtures', f)).toString('base64')];
})))};
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
