<?php
/** Test yardımcısı: VAPID JWT'yi verilen açık anahtarla (base64url, 65 bayt) doğrular. */
declare(strict_types=1);
require_once __DIR__ . '/../../nobetmed/inc/push.php';

/** @return array|string  claims dizisi ya da hata metni */
function verify_vapid_jwt(string $jwt, string $publicB64u)
{
    $parts = explode('.', $jwt);
    if (count($parts) !== 3) return 'JWT 3 parça değil';
    [$h, $c, $s] = $parts;
    $header = json_decode(push_b64u_dec($h), true);
    if (($header['alg'] ?? '') !== 'ES256' || ($header['typ'] ?? '') !== 'JWT') return 'başlık hatalı';
    $raw = push_b64u_dec($s);
    if (strlen($raw) !== 64) return 'imza 64 bayt değil (' . strlen($raw) . ')';
    $pem = push_public_pem(push_b64u_dec($publicB64u));
    $ok = openssl_verify($h . '.' . $c, push_raw_to_der($raw), $pem, OPENSSL_ALGO_SHA256);
    if ($ok !== 1) return 'imza doğrulanamadı';
    $claims = json_decode(push_b64u_dec($c), true);
    return is_array($claims) ? $claims : 'claims okunamadı';
}
