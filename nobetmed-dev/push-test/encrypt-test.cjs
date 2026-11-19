/**
 * RFC 8291 şifreleme testi: Node tarayıcı gibi abonelik anahtarı üretir, PHP (inc/push.php push_encrypt) şifreler,
 * Node çözer ve içeriği karşılaştırır.  node encrypt-test.cjs
 */
'use strict';
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const expand = (prk, info, len) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

let fail = 0;
const check = (c, m) => { console.log((c ? 'OK   ' : 'HATA ') + m); if (!c) fail++; };

const ua = crypto.createECDH('prime256v1');
ua.generateKeys();
const uaPub = ua.getPublicKey();
const auth = crypto.randomBytes(16);
const msg = JSON.stringify({ v: 1, items: [{ id: 7, title: 'Elif Yılmaz', body: 'Yarın 08:00 devir — ğüşiöç 🎉' }] });

const php = `require '${path.resolve(__dirname, '../../nobetmed/inc/push.php')}';
$o = push_encrypt(stream_get_contents(STDIN), $argv[1], $argv[2]);
echo $o === null ? 'NULL' : base64_encode($o);`;
const out = execFileSync('php', ['-r', php, '--', b64u(uaPub), b64u(auth)], { input: msg, encoding: 'utf8' });
check(out !== 'NULL', 'PHP şifreledi');
const body = Buffer.from(out, 'base64');

// RFC 8188 başlığı
const salt = body.subarray(0, 16);
const rs = body.readUInt32BE(16);
const idlen = body[20];
const asPub = body.subarray(21, 21 + idlen);
const ct = body.subarray(21 + idlen);
check(rs === 4096 && idlen === 65 && asPub[0] === 4, 'aes128gcm başlığı (rs 4096, 65 baytlık sunucu anahtarı)');

const ecdh = ua.computeSecret(asPub);
const prkKey = hmac(auth, ecdh);
const ikm = expand(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
const prk = hmac(salt, ikm);
const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
let plain = null;
try {
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
} catch (e) { /* aşağıda */ }
check(plain && plain[plain.length - 1] === 2, 'çözüldü, son kayıt ayracı (0x02) var');
check(plain && plain.subarray(0, plain.length - 1).toString('utf8') === msg, 'içerik birebir aynı (Türkçe harfler ve emoji dahil)');

// Bozuk anahtar → null (boş mesaja düşer)
const bad = execFileSync('php', ['-r', php, '--', 'kotu', b64u(auth)], { input: msg, encoding: 'utf8' });
check(bad === 'NULL', 'geçersiz abonelik anahtarında şifreleme yapılmıyor (boş mesaja düşer)');
// Aynı içerik iki kez farklı şifrelenir (her mesaja yeni anahtar + tuz)
const out2 = execFileSync('php', ['-r', php, '--', b64u(uaPub), b64u(auth)], { input: msg, encoding: 'utf8' });
check(out2 !== out, 'her gönderimde yeni geçici anahtar ve tuz');

if (fail) { console.log(fail + ' hata'); process.exit(1); }
console.log('Şifreleme testleri geçti');
