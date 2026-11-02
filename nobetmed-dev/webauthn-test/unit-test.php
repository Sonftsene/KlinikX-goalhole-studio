<?php
/*
 * nobetmed/inc/webauthn.php birim testleri (PHP CLI).
 *   php unit-test.php [yakalanan-tarayici-verisi.json]
 * JSON verilirse (run-test.cjs üretir) gerçek tarayıcı (Chromium sanal doğrulayıcı)
 * verisiyle kurcalama / yanlış challenge / yanlış origin testleri de çalışır.
 */
declare(strict_types=1);

require __DIR__ . '/../../nobetmed/inc/webauthn.php';

$pass = 0; $fail = 0;
function ok(bool $cond, string $name): void
{
    global $pass, $fail;
    if ($cond) { $pass++; echo "  ok   $name\n"; } else { $fail++; echo "  FAIL $name\n"; }
}
/** $fn hata fırlatmalı; mesaj $needle içermeli. */
function throws(callable $fn, string $name, string $needle = ''): void
{
    try { $fn(); ok(false, "$name (hata bekleniyordu)"); }
    catch (RuntimeException $e) {
        ok($needle === '' || str_contains($e->getMessage(), $needle), "$name → " . $e->getMessage());
    }
}

// ---- küçük CBOR kodlayıcı (yalnız test verisi üretmek için)
function cb_head(int $mt, int $n): string
{
    if ($n < 24) return chr(($mt << 5) | $n);
    if ($n < 0x100) return chr(($mt << 5) | 24) . chr($n);
    if ($n < 0x10000) return chr(($mt << 5) | 25) . pack('n', $n);
    if ($n < 0x100000000) return chr(($mt << 5) | 26) . pack('N', $n);
    return chr(($mt << 5) | 27) . pack('J', $n);
}
function cb_int(int $v): string { return $v >= 0 ? cb_head(0, $v) : cb_head(1, -1 - $v); }
function cb_bytes(string $b): string { return cb_head(2, strlen($b)) . $b; }
function cb_text(string $t): string { return cb_head(3, strlen($t)) . $t; }
/** @param array<array{0:string,1:string}> $pairs kodlanmış [anahtar, değer] çiftleri */
function cb_map(array $pairs): string { return cb_head(5, count($pairs)) . implode('', array_map(fn($p) => $p[0] . $p[1], $pairs)); }
function cose_enc(array $cose): string
{
    return cb_map(array_map(fn($k, $v) => [cb_int($k), is_int($v) ? cb_int($v) : cb_bytes($v)], array_keys($cose), $cose));
}

// ---- sentetik doğrulayıcı (gerçek anahtar çiftiyle uçtan uca kayıt + giriş)
const ORIGIN = 'https://nobet.example.com';
const RPID = 'nobet.example.com';
function client_data(string $type, string $challenge, string $origin = ORIGIN): string
{
    return json_encode(['type' => $type, 'challenge' => wa_b64u_enc($challenge), 'origin' => $origin, 'crossOrigin' => false], JSON_UNESCAPED_SLASHES);
}
function synth_flow(string $label, array $cose, callable $sign): void
{
    $credId = random_bytes(20);
    $ch = random_bytes(32);
    $authData = hash('sha256', RPID, true) . chr(0x45) . pack('N', 0) . random_bytes(16)
        . pack('n', strlen($credId)) . $credId . cose_enc($cose);
    $att = cb_map([[cb_text('fmt'), cb_text('none')], [cb_text('attStmt'), cb_map([])], [cb_text('authData'), cb_bytes($authData)]]);
    $reg = wa_verify_registration(client_data('webauthn.create', $ch), $att, $ch, ORIGIN, RPID);
    ok($reg['credential_id'] === $credId && $reg['alg'] === $cose[3], "$label: sentetik kayıt doğrulandı (alg {$reg['alg']})");

    $ch2 = random_bytes(32);
    $cdj = client_data('webauthn.get', $ch2);
    $ad = hash('sha256', RPID, true) . chr(0x05) . pack('N', 7);
    $sig = $sign($ad . hash('sha256', $cdj, true));
    ok(wa_verify_assertion($cdj, $ad, $sig, $ch2, ORIGIN, RPID, $reg['public_key_pem'], 0) === 7, "$label: sentetik giriş imzası doğrulandı");
    $bad = $sig; $bad[strlen($bad) - 5] = chr(ord($bad[strlen($bad) - 5]) ^ 1);
    throws(fn() => wa_verify_assertion($cdj, $ad, $bad, $ch2, ORIGIN, RPID, $reg['public_key_pem'], 0), "$label: bozuk imza reddedildi", 'imza geçersiz');
}

echo "base64url\n";
ok(wa_b64u_enc("\xfb\xff\xfe") === '-__-', 'kodlama - _ kullanır, dolgu yok');
ok(wa_b64u_dec('-__-') === "\xfb\xff\xfe" && wa_b64u_dec('YQ') === 'a' && wa_b64u_dec('YQ==') === 'a', 'dolgulu/dolgusuz çözme');
foreach ([0, 1, 2, 3, 31, 32, 33] as $n) { $r = $n ? random_bytes($n) : ""; if (wa_b64u_dec(wa_b64u_enc($r)) !== $r) ok(false, "gidiş-dönüş $n"); }
ok(true, 'rastgele gidiş-dönüş 0..33 bayt');
throws(fn() => wa_b64u_dec('ab*c'), 'geçersiz karakter reddedildi');

echo "CBOR\n";
$vec = ['00' => 0, '17' => 23, '1818' => 24, '1903e8' => 1000, '1a000f4240' => 1000000, '1b000000e8d4a51000' => 1000000000000,
    '20' => -1, '3863' => -100, '3903e7' => -1000, 'f4' => false, 'f5' => true, 'f6' => null, 'f7' => null,
    'f93c00' => 1.0, 'fb3ff199999999999a' => 1.1, '4401020304' => "\x01\x02\x03\x04", '6449455446' => 'IETF',
    '83010203' => [1, 2, 3], 'a201020304' => [1 => 2, 3 => 4], 'a26161016162820203' => ['a' => 1, 'b' => [2, 3]]];
$allOk = true;
foreach ($vec as $hex => $want) { $o = 0; $got = wa_cbor_decode(hex2bin((string)$hex), $o); if ($got !== $want || $o !== strlen((string)$hex) / 2) { $allOk = false; echo "    $hex\n"; } }
ok($allOk, 'RFC 8949 test vektörleri (' . count($vec) . ')');
$o = 0; $m = wa_cbor_decode(hex2bin('a3010203262001') . 'XYZ', $o);
ok($m === [1 => 2, 3 => -7, -1 => 1] && $o === 7, 'COSE negatif tamsayı anahtarlar int kalır, offset öğenin hemen sonrası');
throws(fn() => wa_cbor_decode(hex2bin('9f0102ff')), 'belirsiz uzunluk reddedildi', 'belirsiz');
throws(fn() => wa_cbor_decode(hex2bin('5a00000010aa')), 'eksik bayt dizisi reddedildi', 'eksik');
throws(fn() => wa_cbor_decode(hex2bin('1bffffffffffffffff')), 'PHP_INT_MAX üstü reddedildi');

echo "authenticatorData\n";
$rp = hash('sha256', 'x', true);
$p = wa_parse_auth_data($rp . "\x05" . pack('N', 258));
ok($p['up'] && $p['uv'] && $p['signCount'] === 258 && $p['credentialId'] === null && $p['cose'] === null, 'UP/UV/sayaç okunuyor');
throws(fn() => wa_parse_auth_data(str_repeat("\0", 36)), 'kısa authData reddedildi');
throws(fn() => wa_parse_auth_data($rp . "\x01" . pack('N', 1) . 'x'), 'sonda fazla veri reddedildi');
$withExt = $rp . "\xc5" . pack('N', 1) . str_repeat("\0", 16) . pack('n', 2) . 'ID' . cose_enc([1 => 2, 3 => -7]) . cb_map([[cb_text('credProtect'), cb_int(2)]]);
$p = wa_parse_auth_data($withExt);
ok($p['credentialId'] === 'ID' && $p['cose'] === [1 => 2, 3 => -7], 'AT + ED (extension) birlikte ayrıştırılıyor');

echo "EC P-256 (ES256)\n";
$ec = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
$d = openssl_pkey_get_details($ec);
$x = str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT); $y = str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
$ecCose = [1 => 2, 3 => -7, -1 => 1, -2 => $x, -3 => $y];
$pem = wa_cose_to_pem($ecCose);
ok(openssl_pkey_get_public($pem) !== false, 'PEM openssl ile yükleniyor');
ok(trim($pem) === trim($d['key']), 'PEM, openssl\'in ürettiği açık anahtarla birebir aynı');
openssl_sign('merhaba', $sig, $ec, OPENSSL_ALGO_SHA256);
ok(openssl_verify('merhaba', $sig, $pem, OPENSSL_ALGO_SHA256) === 1, 'özel anahtarla imza, üretilen PEM ile doğrulanıyor');
throws(fn() => wa_cose_to_pem([1 => 2, 3 => -7, -1 => 2, -2 => $x, -3 => $y]), 'P-384 eğrisi reddedildi', 'desteklenmeyen');
throws(fn() => wa_cose_to_pem([1 => 2, 3 => -7, -1 => 1, -2 => $x, -3 => strrev($y)]), 'eğri dışı nokta reddedildi');
synth_flow('ES256', $ecCose, function (string $data) use ($ec) { openssl_sign($data, $s, $ec, OPENSSL_ALGO_SHA256); return $s; });

echo "RSA (RS256)\n";
foreach ([2048, 4096] as $bits) {
    $rsa = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => $bits]);
    $d = openssl_pkey_get_details($rsa);
    $rsaCose = [1 => 3, 3 => -257, -1 => $d['rsa']['n'], -2 => $d['rsa']['e']];
    $pem = wa_cose_to_pem($rsaCose);
    $pub = openssl_pkey_get_public($pem);
    $pd = $pub ? openssl_pkey_get_details($pub) : null;
    ok($pd !== null && $pd['bits'] === $bits && ltrim($pd['rsa']['n'], "\0") === ltrim($d['rsa']['n'], "\0") && $pd['rsa']['e'] === $d['rsa']['e'],
        "RSA-$bits: PEM yükleniyor, modulus ve üs eşleşiyor");
    ok(trim($pem) === trim($d['key']), "RSA-$bits: DER, openssl'in SPKI çıktısıyla birebir aynı");
}
synth_flow('RS256', $rsaCose, function (string $data) use ($rsa) { openssl_sign($data, $s, $rsa, OPENSSL_ALGO_SHA256); return $s; });
throws(fn() => wa_cose_to_pem([1 => 3, 3 => -37, -1 => $d['rsa']['n'], -2 => $d['rsa']['e']]), 'RSA-PSS (alg -37) reddedildi', 'desteklenmeyen');
throws(fn() => wa_cose_to_pem([1 => 9]), 'bilinmeyen kty reddedildi', 'desteklenmeyen anahtar');

echo "Ed25519 (EdDSA)\n";
if (wa_ed25519_available()) {
    $kp = sodium_crypto_sign_keypair();
    synth_flow('EdDSA', [1 => 1, 3 => -8, -1 => 6, -2 => sodium_crypto_sign_publickey($kp)],
        fn(string $data) => sodium_crypto_sign_detached($data, sodium_crypto_sign_secretkey($kp)));
} else {
    throws(fn() => wa_cose_to_pem([1 => 1, 3 => -8, -1 => 6, -2 => str_repeat('a', 32)]), 'sodium yok → reddedildi', 'desteklenmeyen anahtar');
}

echo "origin / rpId\n";
$_SERVER = ['HTTP_HOST' => 'Nobet.Example.com', 'HTTPS' => 'on'];
ok(wa_origin_from_server() === 'https://nobet.example.com' && wa_rp_id_from_server() === 'nobet.example.com', 'HTTPS + Host');
$_SERVER = ['HTTP_HOST' => 'localhost:8071'];
ok(wa_origin_from_server() === 'http://localhost:8071' && wa_rp_id_from_server() === 'localhost', 'http + port');
$_SERVER = ['HTTP_HOST' => 'site.com:443', 'HTTP_X_FORWARDED_PROTO' => 'https, http'];
ok(wa_origin_from_server() === 'https://site.com' && wa_rp_id_from_server() === 'site.com', 'X-Forwarded-Proto, varsayılan port atılır');
$_SERVER = [];

// ---- gerçek tarayıcı verisi
if (isset($argv[1])) {
    echo "Gerçek tarayıcı verisi (Chromium sanal doğrulayıcı)\n";
    $cap = json_decode((string)file_get_contents($argv[1]), true);
    $o = $cap['origin']; $rp = $cap['rpId'];
    $R = $cap['reg']; $L1 = $cap['login1']; $L2 = $cap['login2'];
    $dec = fn(array $p, string $k) => wa_b64u_dec($p[$k]);
    $chOf = fn(array $p) => wa_b64u_dec(json_decode($dec($p, 'clientDataJSON'), true)['challenge']);

    $reg = wa_verify_registration($dec($R, 'clientDataJSON'), $dec($R, 'attestationObject'), $chOf($R), $o, $rp);
    ok($reg['credential_id'] === $dec($R, 'rawId') && $reg['alg'] === -7 && trim($reg['public_key_pem']) === trim($cap['pem']), 'kayıt: yeniden doğrulandı, aynı kimlik ve PEM');
    throws(fn() => wa_verify_registration($dec($R, 'clientDataJSON'), $dec($R, 'attestationObject'), random_bytes(32), $o, $rp), 'kayıt: yanlış challenge', 'challenge');
    throws(fn() => wa_verify_registration($dec($R, 'clientDataJSON'), $dec($R, 'attestationObject'), $chOf($R), 'https://evil.example', $rp), 'kayıt: yanlış origin', 'origin');
    throws(fn() => wa_verify_registration($dec($R, 'clientDataJSON'), $dec($R, 'attestationObject'), $chOf($R), $o, 'evil.example'), 'kayıt: yanlış rpId', 'rpId');
    throws(fn() => wa_verify_registration($dec($L1, 'clientDataJSON'), $dec($R, 'attestationObject'), $chOf($L1), $o, $rp), 'kayıt: giriş clientData\'sı kabul edilmez', 'tür');

    $pem = $reg['public_key_pem'];
    $args = fn(array $p) => [$dec($p, 'clientDataJSON'), $dec($p, 'authenticatorData'), $dec($p, 'signature'), $chOf($p), $o, $rp, $pem];
    $c1 = wa_verify_assertion(...[...$args($L1), $reg['sign_count']]);
    $c2 = wa_verify_assertion(...[...$args($L2), $c1]);
    ok($c2 > $c1, "giriş: iki gerçek imza doğrulandı, sayaç arttı ($c1 → $c2)");

    [$cdj, $ad, $sig, $ch] = $args($L1);
    $badSig = $sig; $badSig[10] = chr(ord($badSig[10]) ^ 0x01);
    throws(fn() => wa_verify_assertion($cdj, $ad, $badSig, $ch, $o, $rp, $pem, 0), 'giriş: kurcalanmış imza', 'imza geçersiz');
    $badAd = $ad; $badAd[36] = chr(ord($badAd[36]) ^ 0x7f);
    throws(fn() => wa_verify_assertion($cdj, $badAd, $sig, $ch, $o, $rp, $pem, 0), 'giriş: kurcalanmış authenticatorData (sayaç)', 'imza geçersiz');
    $badCd = str_replace('"webauthn.get"', '"webauthn.get" ', $cdj);
    throws(fn() => wa_verify_assertion($badCd, $ad, $sig, $ch, $o, $rp, $pem, 0), 'giriş: kurcalanmış clientDataJSON', 'imza geçersiz');
    throws(fn() => wa_verify_assertion($cdj, $ad, $sig, random_bytes(32), $o, $rp, $pem, 0), 'giriş: yanlış challenge', 'challenge');
    throws(fn() => wa_verify_assertion($cdj, $ad, $sig, '', $o, $rp, $pem, 0), 'giriş: boş/süresi dolmuş challenge', 'challenge');
    throws(fn() => wa_verify_assertion($cdj, $ad, $sig, $ch, 'http://localhost:9999', $rp, $pem, 0), 'giriş: yanlış origin', 'origin');
    throws(fn() => wa_verify_assertion($cdj, $ad, $sig, $ch, $o, 'example.com', $pem, 0), 'giriş: yanlış rpId', 'rpId');
    throws(fn() => wa_verify_assertion($cdj, $ad, $sig, $ch, $o, $rp, wa_cose_to_pem($ecCose), 0), 'giriş: başka anahtar', 'imza geçersiz');
    throws(fn() => wa_verify_assertion(...[...$args($L1), $c2]), 'giriş: eski sayaçla tekrar (klon şüphesi)', 'sayacı geriledi');
    throws(fn() => wa_verify_assertion($dec($R, 'clientDataJSON'), $ad, $sig, $chOf($R), $o, $rp, $pem, 0), 'giriş: kayıt clientData\'sı kabul edilmez', 'tür');
}

echo "\n$pass geçti, $fail başarısız\n";
exit($fail ? 1 : 0);
