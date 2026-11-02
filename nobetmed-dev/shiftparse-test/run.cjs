// shiftparse.js testlerini Chromium'da çalıştırır.
// Kullanım: node nobetmed-dev/shiftparse-test/run.cjs   (playwright gerekir; php -S ile repo kökü sunulur)
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +(process.env.PORT || 8074);
const BASE = `http://127.0.0.1:${PORT}`;

function waitPort(port, ms) {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(); });
      s.on('error', () => { if (Date.now() > until) reject(new Error('sunucu açılmadı')); else setTimeout(tryOnce, 100); });
    };
    tryOnce();
  });
}

(async () => {
  const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', ROOT], { stdio: ['ignore', 'ignore', 'ignore'] });
  let code = 1;
  let browser;
  try {
    await waitPort(PORT, 10000);
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`${BASE}/nobetmed-dev/shiftparse-test/harness.html`);
    await page.waitForFunction(() => window.__results, null, { timeout: 120000 });
    const res = await page.evaluate(() => window.__results);
    for (const line of res.log) console.log(line);
    if (errors.length) console.log('\nTarayıcı hataları:\n' + errors.join('\n'));
    console.log(`\n${res.pass} geçti, ${res.fail} başarısız`);
    code = res.fail === 0 && !errors.some((e) => e.startsWith('pageerror')) ? 0 : 1;
  } catch (e) {
    console.error(e);
  } finally {
    if (browser) await browser.close();
    php.kill('SIGTERM');
  }
  process.exit(code);
})();
