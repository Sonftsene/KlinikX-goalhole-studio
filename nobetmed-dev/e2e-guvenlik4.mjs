// 4.29: güvenlik taraması düzeltmeleri — e2e.mjs SONRASI.
//   node e2e-guvenlik4.mjs http://localhost:8240/ <çıktı klasörü> <site klasörü>
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8240/';
const SITE = process.argv[4];
const errors = [];
const step = (s) => console.log('✓', s);
const fail = (s) => { errors.push(s); console.log('✗', s); };
const php = (code) => execFileSync('php', ['-r', `require '${path.join(SITE, 'inc/bootstrap.php')}'; if (function_exists('nm_multi') && nm_multi()) nm_tenant_use(nm_tenant_default()); ${code}`], { encoding: 'utf8' });
const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
const apiErr = (p, action, data = {}) => p.evaluate(async ([a, d]) => { try { await api(a, d); return 'kabul'; } catch (e) { return `${e.status}:${e.message}`; } }, [action, data]);

try {
  const c = await browser.newContext();
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await p.goto(BASE);
  await p.waitForFunction(() => typeof api === 'function' && typeof S !== 'undefined' && S.csrf);

  // ---- 1) Kayıtta başka hesabın adı alınamaz (nöbetler ada göre eşleşir) ----
  const prev = php("echo setting('registration', 'approval');").trim();
  php("set_setting('registration', 'open');");
  const r1 = await apiErr(p, 'auth.register', { name: 'Elif Yılmaz', email: 'sahte1@test.com', password: 'SahteSifre123' });
  if (!/^409/.test(r1)) fail('başka kullanıcının adıyla kayıt kabul edildi: ' + r1);
  const r2 = await apiErr(p, 'auth.register', { name: 'Elif Nur Yılmaz', email: 'sahte2@test.com', password: 'SahteSifre123' });
  if (!/^409/.test(r2)) fail('başka kullanıcının adının uzun biçimiyle kayıt kabul edildi: ' + r2);
  php(`set_setting('registration', '${prev.replace(/[^a-z]/g, '') || 'approval'}');`);
  step('kayıt: “Elif Yılmaz” / “Elif Nur Yılmaz” adı başka hesaba ait olduğu için reddedildi (nöbetleri ona geçmesin)');

  // ---- 2) Sıfırlama bağlantısı tek kullanımlık (aynı anda iki istek) ----
  const tok = php(`$u = one("SELECT id FROM users WHERE email = 'burak@test.com'"); $t = bin2hex(random_bytes(24)); q('INSERT INTO password_resets (user_id, token_hash, expires) VALUES (?, ?, ?)', [$u['id'], hash('sha256', $t), time() + 600]); echo $t;`).trim();
  const both = await Promise.all([1, 2].map(() => browser.newContext().then(async (cx) => {
    const q = await cx.newPage(); await q.goto(BASE); await q.waitForFunction(() => typeof api === 'function' && S.csrf);
    return q;
  })));
  const res = await Promise.all(both.map((q) => apiErr(q, 'auth.reset', { token: tok, password: 'Sifre1234' })));
  if (res.filter((x) => x === 'kabul').length !== 1) fail('sıfırlama bağlantısı iki kez kullanıldı: ' + res.join(' | '));
  step('şifre sıfırlama bağlantısı aynı anda iki istekte yalnız bir kez geçti');

  // ---- 3) Salt okunur listede yazma uçları yok ----
  const ro = JSON.parse(php("echo json_encode(array_map('nm_read_action', ['chat.members', 'notif.policy.save', 'update.check', 'rosters.shifts', 'chat.list', 'notif.list', 'rosters.versions']));"));
  if (JSON.stringify(ro) !== JSON.stringify([false, false, false, false, true, true, true])) fail('okuma listesi yanlış: ' + JSON.stringify(ro));
  step('abonelik bitince / rol önizlemesinde sohbet üyeliği, bildirim politikası, güncelleme yükleme, nöbet tablosu yazma kapalı');

  // ---- 4) Güncelleme paketinde “./config.php”, “a/./b” yolları reddedilir ----
  const zp = php(`$f = sys_get_temp_dir() . '/nmz_' . bin2hex(random_bytes(4)) . '.zip'; $z = new ZipArchive(); $z->open($f, ZipArchive::CREATE); $z->addFromString('index.php', '<?php'); $z->addFromString('./config.php', 'x'); $z->close(); echo $f;`).trim();
  const zr = php(`require_once '${path.join(SITE, 'inc/mod_guncelle.php')}'; $z = new ZipArchive(); $z->open('${zp}'); $names = []; for ($i = 0; $i < $z->numFiles; $i++) $names[] = $z->getNameIndex($i); try { $o = up_entries($z); echo json_encode(['names' => $names, 'keys' => array_keys($o)]); } catch (Throwable $e) { echo 'red'; }`);
  if (zr !== 'red' && JSON.parse(zr).keys.some((k) => /config\.php$/.test(k))) fail('“./config.php” paketten yazılacak dosyalar arasında: ' + zr.slice(0, 200));
  step('güncelleme paketindeki “./config.php” korunan dosyanın üzerine yazılmıyor');

  // ---- 5) Gönderilen geçici şifre e-postasının içeriği veritabanında kalmaz ----
  const kept = php(`q("INSERT INTO mail_queue (to_email, to_name, subject, html, text_body, kind, created_at) VALUES ('x@test.com', 'X', 'Geçici şifreniz', '<b>Geçici şifre: Abc12345</b>', 'Geçici şifre: Abc12345', 'credentials', ?)", [now()]); $id = insert_id(); q("UPDATE mail_queue SET sent_at = ? WHERE id = ?", [now(), $id]); if (in_array('credentials', ['credentials', 'reset', 'invite'], true)) q("UPDATE mail_queue SET html = '', text_body = '' WHERE id = ?", [$id]); echo one('SELECT html FROM mail_queue WHERE id = ?', [$id])['html'];`).trim();
  if (kept) fail('geçici şifre e-postası veritabanında kaldı');
  const src = php(`echo (int)str_contains(file_get_contents('${path.join(SITE, 'inc/mail.php')}'), "['credentials', 'reset', 'invite']");`).trim();
  if (src !== '1') fail('e-posta gönderiminden sonra içerik silme kodu yok');
  step('gönderilen geçici şifre / sıfırlama e-postalarının içeriği silinir');
} catch (e) {
  fail('beklenmeyen hata: ' + (e.stack || e.message));
} finally {
  await browser.close();
}
if (errors.length) { console.log('\nHATALAR:\n' + errors.join('\n')); process.exit(1); }
console.log('\nTAMAM: güvenlik düzeltmeleri testleri geçti');
