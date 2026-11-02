<?php
/**
 * NöbetMed — bağımsız WebAuthn (passkey) sunucu kitaplığı.
 *
 * Yalnızca PHP 8.0+ yerleşik eklentileri: openssl, hash, json, mbstring.
 * Desteklenen anahtarlar: ES256 (EC2 P-256, alg -7) ve RS256 (RSA, alg -257).
 * Ed25519 (alg -8): PHP'nin openssl katmanı EdDSA doğrulayamadığı için yalnızca
 * sodium eklentisi varsa desteklenir; yoksa "desteklenmeyen anahtar" hatası verilir.
 * Attestation ifadeleri doğrulanmaz (istemciden attestation: 'none' istenir).
 *
 * Tüm hatalar kullanıcıya gösterilebilir Türkçe mesajlı RuntimeException'dır.
 */
declare(strict_types=1);

const WA_FLAG_UP = 0x01; // kullanıcı mevcut
const WA_FLAG_UV = 0x04; // kullanıcı doğrulandı (parmak izi / yüz / PIN)
const WA_FLAG_AT = 0x40; // attested credential data var
const WA_FLAG_ED = 0x80; // extension verisi var

const WA_ED25519_SPKI_PREFIX = "\x30\x2a\x30\x05\x06\x03\x2b\x65\x70\x03\x21\x00";

/** Kullanıcıya gösterilebilir hata nesnesi üretir: `throw wa_err('...')`. */
function wa_err(string $why): RuntimeException
{
    return new RuntimeException('Doğrulama başarısız: ' . $why);
}

// ---------------------------------------------------------------- base64url

function wa_b64u_enc(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function wa_b64u_dec(string $s): string
{
    $s = rtrim(trim($s), '=');
    if ($s !== '' && !preg_match('/^[A-Za-z0-9_-]+$/', $s)) throw wa_err('geçersiz base64url verisi.');
    if (strlen($s) % 4 === 1) throw wa_err('geçersiz base64url uzunluğu.');
    $out = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    if ($out === false) throw wa_err('geçersiz base64url verisi.');
    return $out;
}

// ---------------------------------------------------------------- CBOR (RFC 8949, WebAuthn için yeterli alt küme)

function wa_cbor_take(string $data, int &$offset, int $len): string
{
    if ($len < 0 || $offset + $len > strlen($data)) throw wa_err('CBOR verisi eksik.');
    $chunk = substr($data, $offset, $len);
    $offset += $len;
    return $chunk;
}

/** Ek bilgi (additional info) alanından uzunluk/değer okur. */
function wa_cbor_arg(string $data, int &$offset, int $ai): int
{
    if ($ai < 24) return $ai;
    switch ($ai) {
        case 24: return ord(wa_cbor_take($data, $offset, 1));
        case 25: return unpack('n', wa_cbor_take($data, $offset, 2))[1];
        case 26: return unpack('N', wa_cbor_take($data, $offset, 4))[1];
        case 27:
            $v = unpack('J', wa_cbor_take($data, $offset, 8))[1];
            if ($v < 0) throw wa_err('CBOR tamsayısı çok büyük.'); // > PHP_INT_MAX
            return $v;
    }
    throw wa_err('CBOR belirsiz uzunluk desteklenmiyor.');
}

function wa_cbor_decode(string $data, int &$offset = 0, int $depth = 0): mixed
{
    if ($depth > 16) throw wa_err('CBOR çok derin.');
    $ib = ord(wa_cbor_take($data, $offset, 1));
    $mt = $ib >> 5;
    $ai = $ib & 0x1f;

    if ($mt === 7) {
        switch ($ai) {
            case 20: return false;
            case 21: return true;
            case 22: case 23: return null; // null / undefined
            case 25: // half float
                $h = unpack('n', wa_cbor_take($data, $offset, 2))[1];
                $exp = ($h >> 10) & 0x1f; $mant = $h & 0x3ff;
                $val = $exp === 0 ? $mant * 2 ** -24 : ($exp === 31 ? ($mant ? NAN : INF) : ($mant + 1024) * 2 ** ($exp - 25));
                return ($h & 0x8000) ? -$val : $val;
            case 26: return unpack('G', wa_cbor_take($data, $offset, 4))[1];
            case 27: return unpack('E', wa_cbor_take($data, $offset, 8))[1];
        }
        if ($ai < 20) return $ai; // atanmamış simple değer
        throw wa_err('desteklenmeyen CBOR değeri.');
    }

    $arg = wa_cbor_arg($data, $offset, $ai);
    switch ($mt) {
        case 0: return $arg;
        case 1: return -1 - $arg;
        case 2: // byte string
        case 3: // text string
            return wa_cbor_take($data, $offset, $arg);
        case 4:
            if ($arg > strlen($data) - $offset) throw wa_err('CBOR verisi eksik.');
            $arr = [];
            for ($i = 0; $i < $arg; $i++) $arr[] = wa_cbor_decode($data, $offset, $depth + 1);
            return $arr;
        case 5:
            if ($arg > strlen($data) - $offset) throw wa_err('CBOR verisi eksik.');
            $map = [];
            for ($i = 0; $i < $arg; $i++) {
                $k = wa_cbor_decode($data, $offset, $depth + 1);
                if (!is_int($k) && !is_string($k)) throw wa_err('desteklenmeyen CBOR anahtarı.');
                $map[$k] = wa_cbor_decode($data, $offset, $depth + 1);
            }
            return $map;
        case 6: // etiket: içeriği döndür
            return wa_cbor_decode($data, $offset, $depth + 1);
    }
    throw wa_err('desteklenmeyen CBOR türü.');
}

// ---------------------------------------------------------------- ASN.1 DER yardımcıları

function wa_der_len(int $n): string
{
    if ($n < 0x80) return chr($n);
    $b = ltrim(pack('N', $n), "\x00");
    return chr(0x80 | strlen($b)) . $b;
}

function wa_der(int $tag, string $body): string
{
    return chr($tag) . wa_der_len(strlen($body)) . $body;
}

/** Pozitif büyük tamsayı (big-endian bayt dizisi) → DER INTEGER. */
function wa_der_uint(string $bytes): string
{
    $bytes = ltrim($bytes, "\x00");
    if ($bytes === '') $bytes = "\x00";
    if (ord($bytes[0]) & 0x80) $bytes = "\x00" . $bytes;
    return wa_der(0x02, $bytes);
}

function wa_pem(string $der): string
{
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function wa_pem_to_der(string $pem): string
{
    $b64 = preg_replace('/-----[^-]+-----|\s+/', '', $pem);
    $der = base64_decode((string)$b64, true);
    if ($der === false || $der === '') throw wa_err('kayıtlı anahtar okunamadı.');
    return $der;
}

function wa_ed25519_available(): bool
{
    return function_exists('sodium_crypto_sign_verify_detached');
}

// ---------------------------------------------------------------- COSE → PEM

function wa_cose_to_pem(array $cose): string
{
    $kty = $cose[1] ?? null;
    $alg = $cose[3] ?? null;

    if ($kty === 2) { // EC2
        if (($cose[-1] ?? null) !== 1 || ($alg !== null && $alg !== -7)) throw wa_err('desteklenmeyen anahtar (yalnız P-256/ES256).');
        $x = $cose[-2] ?? null; $y = $cose[-3] ?? null;
        if (!is_string($x) || !is_string($y) || strlen($x) !== 32 || strlen($y) !== 32) throw wa_err('EC anahtarı bozuk.');
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
    } elseif ($kty === 3) { // RSA
        if ($alg !== null && $alg !== -257) throw wa_err('desteklenmeyen anahtar (yalnız RS256).');
        $n = $cose[-1] ?? null; $e = $cose[-2] ?? null;
        if (!is_string($n) || !is_string($e) || strlen(ltrim($n, "\x00")) < 128 || $e === '') throw wa_err('RSA anahtarı bozuk.');
        $rsaPub = wa_der(0x30, wa_der_uint($n) . wa_der_uint($e));
        $algId = wa_der(0x30, hex2bin('06092a864886f70d010101') . "\x05\x00"); // rsaEncryption, NULL
        $der = wa_der(0x30, $algId . wa_der(0x03, "\x00" . $rsaPub));
    } elseif ($kty === 1) { // OKP
        if (($cose[-1] ?? null) !== 6 || ($alg !== null && $alg !== -8)) throw wa_err('desteklenmeyen anahtar.');
        if (!wa_ed25519_available()) throw wa_err('desteklenmeyen anahtar (Ed25519).');
        $x = $cose[-2] ?? null;
        if (!is_string($x) || strlen($x) !== 32) throw wa_err('Ed25519 anahtarı bozuk.');
        return wa_pem(WA_ED25519_SPKI_PREFIX . $x); // openssl ile yüklenmez; sodium ile doğrulanır
    } else {
        throw wa_err('desteklenmeyen anahtar.');
    }

    $pem = wa_pem($der);
    if (openssl_pkey_get_public($pem) === false) throw wa_err('açık anahtar geçersiz.');
    return $pem;
}

// ---------------------------------------------------------------- authenticatorData

function wa_parse_auth_data(string $authData): array
{
    $len = strlen($authData);
    if ($len < 37) throw wa_err('authenticatorData çok kısa.');
    $flags = ord($authData[32]);
    $r = [
        'rpIdHash' => substr($authData, 0, 32),
        'flags' => $flags,
        'up' => (bool)($flags & WA_FLAG_UP),
        'uv' => (bool)($flags & WA_FLAG_UV),
        'signCount' => unpack('N', substr($authData, 33, 4))[1],
        'credentialId' => null,
        'cose' => null,
    ];
    $off = 37;
    if ($flags & WA_FLAG_AT) {
        if ($len < $off + 18) throw wa_err('kimlik bilgisi verisi eksik.');
        $off += 16; // AAGUID
        $idLen = unpack('n', substr($authData, $off, 2))[1];
        $off += 2;
        if ($idLen < 1 || $idLen > 1023 || $len < $off + $idLen) throw wa_err('kimlik bilgisi kimliği geçersiz.');
        $r['credentialId'] = substr($authData, $off, $idLen);
        $off += $idLen;
        $cose = wa_cbor_decode($authData, $off);
        if (!is_array($cose)) throw wa_err('açık anahtar verisi geçersiz.');
        $r['cose'] = $cose;
    }
    if ($flags & WA_FLAG_ED) wa_cbor_decode($authData, $off); // extension'lar: atla
    if ($off !== $len) throw wa_err('authenticatorData sonunda fazladan veri var.');
    return $r;
}

// ---------------------------------------------------------------- ortak clientData / rpId kontrolleri

function wa_check_client_data(string $clientDataJSON, string $type, string $expectedChallenge, string $expectedOrigin): void
{
    $cd = json_decode($clientDataJSON, true);
    if (!is_array($cd)) throw wa_err('clientDataJSON okunamadı.');
    if (($cd['type'] ?? null) !== $type) throw wa_err('işlem türü uyuşmuyor.');
    if ($expectedChallenge === '' || !is_string($cd['challenge'] ?? null)
        || !hash_equals($expectedChallenge, wa_b64u_dec($cd['challenge']))) {
        throw wa_err('sınama (challenge) uyuşmuyor veya süresi doldu.');
    }
    if (($cd['origin'] ?? null) !== $expectedOrigin) throw wa_err('kaynak (origin) uyuşmuyor.');
    if (($cd['crossOrigin'] ?? false) === true) throw wa_err('çapraz kaynaklı istek reddedildi.');
}

function wa_check_rp(array $ad, string $rpId): void
{
    if (!hash_equals(hash('sha256', $rpId, true), $ad['rpIdHash'])) throw wa_err('alan adı (rpId) uyuşmuyor.');
    if (!$ad['up']) throw wa_err('kullanıcı onayı (UP) yok.');
}

// ---------------------------------------------------------------- kayıt (navigator.credentials.create)

/**
 * Girdiler ham ikili veridir (base64url çözülmüş). $expectedChallenge ham baytlardır.
 * Döner: credential_id (ham), public_key_pem, sign_count, alg, uv.
 */
function wa_verify_registration(string $clientDataJSON, string $attestationObject, string $expectedChallenge,
                                string $expectedOrigin, string $rpId): array
{
    wa_check_client_data($clientDataJSON, 'webauthn.create', $expectedChallenge, $expectedOrigin);

    $off = 0;
    $att = wa_cbor_decode($attestationObject, $off);
    if (!is_array($att) || !is_string($att['fmt'] ?? null) || !is_string($att['authData'] ?? null)) {
        throw wa_err('attestationObject geçersiz.');
    }
    // attStmt bilinçli olarak doğrulanmaz (attestation: 'none').

    $ad = wa_parse_auth_data($att['authData']);
    wa_check_rp($ad, $rpId);
    if ($ad['credentialId'] === null || $ad['cose'] === null) throw wa_err('kimlik bilgisi verisi yok.');

    $pem = wa_cose_to_pem($ad['cose']);
    $alg = $ad['cose'][3] ?? null;
    if (!is_int($alg)) $alg = [2 => -7, 3 => -257, 1 => -8][$ad['cose'][1]] ?? 0;

    return [
        'credential_id' => $ad['credentialId'],
        'public_key_pem' => $pem,
        'sign_count' => $ad['signCount'],
        'alg' => $alg,
        'uv' => $ad['uv'],
    ];
}

// ---------------------------------------------------------------- giriş (navigator.credentials.get)

/** İmzayı doğrular, yeni imza sayacını döndürür. */
function wa_verify_assertion(string $clientDataJSON, string $authenticatorData, string $signature,
                             string $expectedChallenge, string $expectedOrigin, string $rpId,
                             string $publicKeyPem, int $storedSignCount): int
{
    wa_check_client_data($clientDataJSON, 'webauthn.get', $expectedChallenge, $expectedOrigin);
    $ad = wa_parse_auth_data($authenticatorData);
    wa_check_rp($ad, $rpId);

    $signed = $authenticatorData . hash('sha256', $clientDataJSON, true);
    $der = wa_pem_to_der($publicKeyPem);
    if (strncmp($der, WA_ED25519_SPKI_PREFIX, 12) === 0 && strlen($der) === 44) {
        if (!wa_ed25519_available()) throw wa_err('desteklenmeyen anahtar (Ed25519).');
        $ok = strlen($signature) === 64 && sodium_crypto_sign_verify_detached($signature, $signed, substr($der, 12));
    } else {
        $key = openssl_pkey_get_public($publicKeyPem);
        if ($key === false) throw wa_err('kayıtlı anahtar okunamadı.');
        $ok = openssl_verify($signed, $signature, $key, OPENSSL_ALGO_SHA256) === 1;
        while (openssl_error_string() !== false); // openssl hata kuyruğunu temizle
    }
    if (!$ok) throw wa_err('imza geçersiz.');

    $new = $ad['signCount'];
    if ($storedSignCount > 0 && $new > 0 && $new <= $storedSignCount) {
        throw wa_err('imza sayacı geriledi (kopyalanmış cihaz şüphesi).');
    }
    return $new;
}

// ---------------------------------------------------------------- sunucudan origin / rpId

function wa_origin_from_server(): string
{
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0])) === 'https'
        || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
    $scheme = $https ? 'https' : 'http';
    $host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
    if ($host === '') {
        $host = strtolower((string)($_SERVER['SERVER_NAME'] ?? 'localhost'));
        $port = (string)($_SERVER['SERVER_PORT'] ?? '');
        if ($port !== '') $host .= ':' . $port;
    }
    // Varsayılan port yazılmaz (tarayıcının origin'i de yazmaz).
    $default = $https ? ':443' : ':80';
    if (str_ends_with($host, $default)) $host = substr($host, 0, -strlen($default));
    return $scheme . '://' . $host;
}

function wa_rp_id_from_server(): string
{
    $host = (string)parse_url(wa_origin_from_server(), PHP_URL_HOST);
    return trim($host, '[]');
}
