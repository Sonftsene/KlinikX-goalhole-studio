// WebAuthn uçtan uca testi: PHP yerleşik sunucu + Chromium sanal doğrulayıcı (CDP).
//   node nobetmed-dev/webauthn-test/run-test.cjs
'use strict';
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8071;
const DIR = __dirname;
const URL = `http://localhost:${PORT}/`;

let pass = 0, fail = 0;
function check(cond, name, extra = '') {
  if (cond) { pass++; console.log('  ok   ' + name + (extra ? ' → ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' → ' + extra : '')); }
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/?a=none`); if (r.status) return; } catch (e) { /* henüz değil */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('PHP sunucusu başlamadı');
}

(async () => {
  const server = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', DIR], { stdio: ['ignore', 'ignore', 'pipe'] });
  let serverLog = '';
  server.stderr.on('data', d => { serverLog += d; });
  let browser;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-test-'));
  try {
    await waitForServer();
    browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', e => console.log('  [sayfa hatası]', e.message));
    await page.goto(URL);

    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
                 isUserVerified: true, automaticPresenceSimulation: true },
    });

    console.log('Tarayıcı (Chromium sanal doğrulayıcı)');
    check(await page.evaluate(() => window.isSecureContext && passkeySupported()), 'localhost güvenli bağlam, passkey destekli');

    // 1) Kayıt
    const reg = await page.evaluate(async () => {
      let cap; const r = await passkeyRegister({ beforeSend: p => { cap = JSON.parse(JSON.stringify(p)); } });
      return { r, cap };
    });
    check(reg.r.ok && reg.r.alg === -7 && reg.r.uv === true, 'kayıt başarılı (ES256, UV)', `id=${reg.r.id.slice(0, 16)}…`);
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    check(credentials.length === 1 && credentials[0].isResidentCredential && credentials[0].rpId === 'localhost',
      'doğrulayıcıda 1 keşfedilebilir kimlik, rpId=localhost');

    // 2) Giriş (allowCredentials boş → keşfedilebilir kimlik)
    const login = () => page.evaluate(async () => {
      let cap; const r = await passkeyLogin({ beforeSend: p => { cap = JSON.parse(JSON.stringify(p)); } });
      return { r, cap };
    });
    const l1 = await login();
    check(l1.r.ok === true, 'giriş 1 başarılı', `signCount=${l1.r.signCount}`);
    check(!!l1.cap.userHandle && l1.cap.userHandle.length > 0, 'userHandle döndü (keşfedilebilir kimlik)');
    const l2 = await login();
    check(l2.r.ok === true && l2.r.signCount > l1.r.signCount, 'giriş 2 başarılı, sayaç arttı', `${l1.r.signCount} → ${l2.r.signCount}`);

    // 3) Uç nokta üzerinden reddedilmesi gerekenler
    const loginErr = (mode) => page.evaluate(async (mode) => {
      try {
        await passkeyLogin({ beforeSend: p => {
          if (mode === 'sig') { const b = new Uint8Array(b64uToBuf(p.signature)); b[10] ^= 1; p.signature = bufToB64u(b); }
          if (mode === 'authdata') { const b = new Uint8Array(b64uToBuf(p.authenticatorData)); b[36] ^= 0x7f; p.authenticatorData = bufToB64u(b); }
          if (mode === 'unknown') { p.rawId = p.id = bufToB64u(new Uint8Array(16)); }
          if (mode === 'user') { p.userHandle = bufToB64u(new Uint8Array(16)); }
        } });
        return 'kabul edildi!';
      } catch (e) { return e.message; }
    }, mode);
    let m = await loginErr('sig');      check(/imza geçersiz/.test(m), 'kurcalanmış imza reddedildi', m);
    m = await loginErr('authdata');     check(/imza geçersiz/.test(m), 'kurcalanmış authenticatorData reddedildi', m);
    m = await loginErr('unknown');      check(/kayıtlı değil/.test(m), 'bilinmeyen kimlik reddedildi', m);
    m = await loginErr('user');         check(/Kullanıcı uyuşmuyor/.test(m), 'yanlış userHandle reddedildi', m);

    // Aynı giriş verisini tekrar gönder (challenge tek kullanımlık)
    m = await page.evaluate(async (p) => {
      await fetch('?a=login-begin');
      const r = await fetch('?a=login-finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      return (await r.json()).error || 'kabul edildi!';
    }, l2.cap);
    check(/challenge/.test(m), 'eski giriş verisinin tekrarı (replay) reddedildi', m);

    // 4) Arayüz düğmesiyle giriş
    await page.click('#login');
    await page.waitForFunction(() => /Giriş başarılı|Hata/.test(document.getElementById('log').textContent));
    const logText = await page.textContent('#log');
    check(/Giriş başarılı/.test(logText), 'sayfadaki düğme ile giriş', logText);

    // 5) Yakalanan gerçek veriyle PHP birim testleri (yanlış challenge / origin / kurcalama)
    const capFile = path.join(tmp, 'captured.json');
    fs.writeFileSync(capFile, JSON.stringify({ origin: `http://localhost:${PORT}`, rpId: 'localhost', pem: reg.r.pem,
                                               reg: reg.cap, login1: l1.cap, login2: l2.cap }, null, 2));
    console.log('\nPHP birim testleri (unit-test.php + yakalanan veri)');
    const u = spawnSync('php', [path.join(DIR, 'unit-test.php'), capFile], { encoding: 'utf8' });
    process.stdout.write(u.stdout.trimEnd().replace(/^/gm, '  ') + '\n' + (u.stderr || ''));
    check(u.status === 0, 'unit-test.php çıkış kodu 0');
  } catch (e) {
    fail++;
    console.error('HATA:', e);
    if (serverLog) console.error(serverLog);
  } finally {
    if (browser) await browser.close();
    process.kill(server.pid, 'SIGTERM'); // yalnızca başlattığımız PHP sunucusu
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nE2E: ${pass} geçti, ${fail} başarısız`);
  process.exit(fail ? 1 : 0);
})();
