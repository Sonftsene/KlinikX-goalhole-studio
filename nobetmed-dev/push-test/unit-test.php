<?php
/** php unit-test.php — VAPID anahtar/JWT birim testi */
declare(strict_types=1);
require_once __DIR__ . '/jwt-verify.php';

$fail = 0;
function check(bool $cond, string $msg): void
{
    global $fail;
    echo ($cond ? "OK   " : "HATA ") . $msg . "\n";
    if (!$cond) $fail++;
}

check(push_b64u_dec(push_b64u_enc("\xff\xfe\x00abc")) === "\xff\xfe\x00abc", 'base64url gidiş-dönüş');

// Birçok anahtar/imza: kısa (baştaki sıfır) R/S değerleri de sınanmış olur
$n = 40;
$okCount = 0;
for ($i = 0; $i < $n; $i++) {
    $k = push_generate_vapid();
    $pub = push_b64u_dec($k['public']);
    if (strlen($pub) !== 65 || $pub[0] !== "\x04") { check(false, 'açık anahtar 65 bayt/04'); continue; }
    $endpoint = 'https://fcm.googleapis.com:443/fcm/send/abc' . $i;
    $t0 = time();
    $jwt = push_vapid_jwt($endpoint, $k['private_pem'], 'mailto:admin@example.com');
    $claims = verify_vapid_jwt($jwt, $k['public']);
    if (!is_array($claims)) { check(false, "JWT #$i: $claims"); continue; }
    if ($claims['aud'] !== 'https://fcm.googleapis.com' || $claims['sub'] !== 'mailto:admin@example.com'
        || $claims['exp'] < $t0 + 43200 || $claims['exp'] > time() + 43200) { check(false, "JWT #$i claims: " . json_encode($claims)); continue; }
    // Başka anahtarla doğrulanmamalı
    $other = push_generate_vapid();
    if (is_array(verify_vapid_jwt($jwt, $other['public']))) { check(false, "JWT #$i yanlış anahtarla doğrulandı"); continue; }
    $okCount++;
}
check($okCount === $n, "$okCount/$n anahtar çifti: 65 bayt nokta, ES256 imza R||S → DER doğrulandı, aud/exp/sub doğru");

$k = push_generate_vapid();
$c = verify_vapid_jwt(push_vapid_jwt('http://127.0.0.1:8072/push/1', $k['private_pem'], 'mailto:a@b.c', 999999), $k['public']);
check(is_array($c) && $c['aud'] === 'http://127.0.0.1:8072', 'aud portu korur (http://127.0.0.1:8072)');
check(is_array($c) && $c['exp'] <= time() + 86400, 'exp en fazla 24 saat');
check(push_audience('https://Web.Push.Apple.com/QGx?x=1') === 'https://web.push.apple.com', 'aud yalnızca köken');

// DER <-> raw tutarlılığı (baştaki 0 ve yüksek bit)
$raw = str_repeat("\0", 31) . "\x01" . "\x80" . str_repeat("\x11", 31);
check(push_der_to_raw(push_raw_to_der($raw)) === $raw, 'DER ↔ R||S dönüşümü (kısa R, yüksek bitli S)');

check(push_endpoint_allowed('https://fcm.googleapis.com/fcm/send/x'), 'izinli uç nokta: FCM');
check(push_endpoint_allowed('https://web.push.apple.com/abc'), 'izinli uç nokta: Apple');
check(push_endpoint_allowed('https://updates.push.services.mozilla.com/wpush/v2/x'), 'izinli uç nokta: Mozilla');
check(!push_endpoint_allowed('http://fcm.googleapis.com/x'), 'reddedilir: http');
check(!push_endpoint_allowed('https://evil.com/fcm.googleapis.com'), 'reddedilir: başka alan');
check(!push_endpoint_allowed('https://fcm.googleapis.com.evil.com/x'), 'reddedilir: sahte sonek');
check(!push_endpoint_allowed('https://127.0.0.1/x'), 'reddedilir: yerel adres');

echo $fail ? "\n$fail HATA\n" : "\nTüm birim testleri geçti\n";
exit($fail ? 1 : 0);
