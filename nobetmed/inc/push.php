<?php
/**
 * dupcii — Web Push (yalnızca VAPID, yüksüz/boş mesaj)
 *
 * Boş push mesajı gönderilir (RFC 8291 şifrelemesi gerekmez). Service worker 'push'
 * olayında bekleyen bildirimleri çerezle sunucudan çeker (api.php?action=push.pending).
 * Gereken eklentiler: openssl, json; curl varsa paralel gönderim, yoksa stream bağlamı.
 */
declare(strict_types=1);

function push_b64u_enc(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function push_b64u_dec(string $s): string
{
    $s = strtr(trim($s), '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
}

/**
 * Yeni VAPID anahtar çifti.
 * @return array{public: string, private_pem: string} public = 65 baytlık (04||x||y) noktanın base64url'i
 */
function push_generate_vapid(): array
{
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if ($key === false) throw new RuntimeException('VAPID anahtarı üretilemedi: ' . (string)openssl_error_string());
    $pem = '';
    if (!openssl_pkey_export($key, $pem)) throw new RuntimeException('VAPID anahtarı dışa aktarılamadı: ' . (string)openssl_error_string());
    $d = openssl_pkey_get_details($key);
    if (!$d || empty($d['ec']['x']) || empty($d['ec']['y'])) throw new RuntimeException('VAPID anahtar ayrıntıları okunamadı.');
    $x = str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT);
    $y = str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
    return ['public' => push_b64u_enc("\x04" . $x . $y), 'private_pem' => $pem];
}

/** 65 baytlık sıkıştırılmamış P-256 noktasından PEM (SubjectPublicKeyInfo) üretir. */
function push_public_pem(string $rawPoint): string
{
    if (strlen($rawPoint) !== 65 || $rawPoint[0] !== "\x04") throw new InvalidArgumentException('Geçersiz P-256 açık anahtarı.');
    // SEQUENCE { SEQUENCE { id-ecPublicKey, prime256v1 }, BIT STRING (0 kullanılmayan bit) }
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $rawPoint;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** DER ECDSA imzasını (SEQUENCE{INTEGER r, INTEGER s}) 64 baytlık R||S biçimine çevirir. */
function push_der_to_raw(string $der): string
{
    $pos = 0;
    $readLen = static function () use ($der, &$pos): int {
        $len = ord($der[$pos++] ?? "\0");
        if ($len & 0x80) {
            $n = $len & 0x7f;
            $len = 0;
            for ($i = 0; $i < $n; $i++) $len = ($len << 8) | ord($der[$pos++] ?? "\0");
        }
        return $len;
    };
    if (($der[$pos++] ?? '') !== "\x30") throw new RuntimeException('Geçersiz DER imzası.');
    $readLen();
    $out = '';
    for ($k = 0; $k < 2; $k++) {
        if (($der[$pos++] ?? '') !== "\x02") throw new RuntimeException('Geçersiz DER imzası.');
        $len = $readLen();
        $int = ltrim(substr($der, $pos, $len), "\0");
        $pos += $len;
        if (strlen($int) > 32) throw new RuntimeException('Geçersiz DER imzası.');
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
    }
    return $out;
}

/** 64 baytlık R||S imzasını DER biçimine çevirir (doğrulama/test için). */
function push_raw_to_der(string $raw): string
{
    if (strlen($raw) !== 64) throw new InvalidArgumentException('İmza 64 bayt olmalı.');
    $enc = static function (string $i): string {
        $i = ltrim($i, "\0");
        if ($i === '' || (ord($i[0]) & 0x80)) $i = "\0" . $i;
        return "\x02" . chr(strlen($i)) . $i;
    };
    $body = $enc(substr($raw, 0, 32)) . $enc(substr($raw, 32, 32));
    return "\x30" . chr(strlen($body)) . $body;
}

/** Uç noktanın kaynağı (scheme://host[:port]) — JWT 'aud' değeri. */
function push_audience(string $endpoint): string
{
    $p = parse_url($endpoint);
    if (!is_array($p) || empty($p['scheme']) || empty($p['host'])) throw new InvalidArgumentException('Geçersiz push adresi.');
    $scheme = strtolower($p['scheme']);
    $aud = $scheme . '://' . strtolower($p['host']);
    if (isset($p['port']) && !(($scheme === 'https' && $p['port'] === 443) || ($scheme === 'http' && $p['port'] === 80))) $aud .= ':' . $p['port'];
    return $aud;
}

/** ES256 imzalı VAPID JWT. $ttl en fazla 24 saat. */
function push_vapid_jwt(string $endpoint, string $privatePem, string $subject, int $ttl = 43200): string
{
    $ttl = max(60, min($ttl, 86400));
    $header = push_b64u_enc((string)json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = push_b64u_enc((string)json_encode(['aud' => push_audience($endpoint), 'exp' => time() + $ttl, 'sub' => $subject], JSON_UNESCAPED_SLASHES));
    $input = $header . '.' . $claims;
    $key = openssl_pkey_get_private($privatePem);
    if ($key === false) throw new RuntimeException('VAPID özel anahtarı okunamadı.');
    $sig = '';
    if (!openssl_sign($input, $sig, $key, OPENSSL_ALGO_SHA256)) throw new RuntimeException('VAPID imzası oluşturulamadı.');
    return $input . '.' . push_b64u_enc(push_der_to_raw($sig));
}

/**
 * Abonelik kaydında güvenli uç nokta kontrolü (SSRF'ye karşı): HTTPS ve bilinen push servisleri.
 */
function push_endpoint_allowed(string $endpoint): bool
{
    $p = parse_url($endpoint);
    if (!is_array($p) || strtolower($p['scheme'] ?? '') !== 'https' || empty($p['host']) || isset($p['user']) || (isset($p['port']) && $p['port'] !== 443)) return false;
    $host = strtolower($p['host']);
    foreach (['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'] as $ok) {
        if ($host === $ok || str_ends_with($host, '.' . $ok)) return true;
    }
    return false;
}

/**
 * Boş push mesajlarını gönderir.
 * @param array<int, array{id: int, endpoint: string}> $subscriptions
 * @return array<int, string> [id => 'ok' | 'gone' | 'error: ...']
 */
function push_send(array $subscriptions, string $publicB64u, string $privatePem, string $subject): array
{
    $results = [];
    $jwts = [];
    $jobs = [];
    foreach ($subscriptions as $sub) {
        $id = (int)($sub['id'] ?? 0);
        $endpoint = (string)($sub['endpoint'] ?? '');
        try {
            $aud = push_audience($endpoint);
            $jwts[$aud] ??= push_vapid_jwt($endpoint, $privatePem, $subject);
        } catch (Throwable $e) {
            $results[$id] = 'error: ' . $e->getMessage();
            continue;
        }
        $jobs[$id] = [
            'endpoint' => $endpoint,
            'headers' => ['TTL: 86400', 'Urgency: high', 'Content-Length: 0', 'Authorization: vapid t=' . $jwts[$aud] . ', k=' . $publicB64u],
        ];
    }
    if (!$jobs) return $results;

    $classify = static function (int $code, string $body, string $err): string {
        if ($code >= 200 && $code < 300) return 'ok';
        if ($code === 404 || $code === 410) return 'gone';
        if ($code === 0) return 'error: ' . ($err !== '' ? mb_substr($err, 0, 120) : 'bağlantı kurulamadı');
        $msg = trim(preg_replace('/\s+/', ' ', strip_tags($body)) ?? '');
        return 'error: HTTP ' . $code . ($msg !== '' ? ' ' . mb_substr($msg, 0, 120) : '');
    };

    if (function_exists('curl_multi_init')) {
        $mh = curl_multi_init();
        $handles = [];
        foreach ($jobs as $id => $job) {
            $ch = curl_init($job['endpoint']);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => '',
                CURLOPT_HTTPHEADER => array_merge($job['headers'], ['Expect:']),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[$id] = $ch;
        }
        $errors = [];
        do {
            $status = curl_multi_exec($mh, $running);
            while ($info = curl_multi_info_read($mh)) {
                if ($info['result'] !== CURLE_OK) $errors[(int)array_search($info['handle'], $handles, true)] = curl_strerror($info['result']);
            }
            if ($running && curl_multi_select($mh, 1.0) === -1) usleep(10000);
        } while ($running && $status === CURLM_OK);
        foreach ($handles as $id => $ch) {
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $err = $errors[$id] ?? curl_error($ch);
            $results[$id] = $classify($code, (string)curl_multi_getcontent($ch), $err);
            curl_multi_remove_handle($mh, $ch);
        }
        curl_multi_close($mh);
        return $results;
    }

    // curl yoksa: sırayla stream bağlamıyla gönder
    foreach ($jobs as $id => $job) {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $job['headers']),
            'content' => '',
            'timeout' => 10,
            'ignore_errors' => true,
            'follow_location' => 0,
            'max_redirects' => 0,
        ]]);
        $body = @file_get_contents($job['endpoint'], false, $ctx);
        $hdrs = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?? []) : (${'http_response_header'} ?? []);
        $code = 0;
        foreach ($hdrs as $h) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $code = (int)$m[1];
        $err = $body === false ? ((error_get_last()['message'] ?? '') ?: 'bağlantı kurulamadı') : '';
        $results[$id] = $classify($code, (string)$body, $err);
    }
    return $results;
}
