<?php
/*
 * WebAuthn deneme sayfası (yalnız geliştirme; sunucuya yüklenmez).
 *   php -S 127.0.0.1:8071 -t nobetmed-dev/webauthn-test   → http://localhost:8071/
 * Kimlik bilgileri yalnızca PHP oturumunda tutulur.
 */
declare(strict_types=1);

require __DIR__ . '/../../nobetmed/inc/webauthn.php';

session_start();
$_SESSION['creds'] ??= [];

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array
{
    $b = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($b)) throw new RuntimeException('Geçersiz istek.');
    return $b;
}

/** Oturumdaki sınamayı tek kullanımlık olarak alır (2 dk geçerli). */
function take_challenge(string $kind): string
{
    $c = $_SESSION['wa_' . $kind] ?? null;
    unset($_SESSION['wa_' . $kind]);
    if (!is_array($c) || time() - $c['t'] > 120) return '';
    return $c['v'];
}

$a = $_GET['a'] ?? '';
if ($a !== '') {
    try {
        $origin = wa_origin_from_server();
        $rpId = wa_rp_id_from_server();

        switch ($a) {
            case 'reg-begin':
                $challenge = random_bytes(32);
                $_SESSION['wa_reg'] = ['v' => $challenge, 't' => time()];
                $_SESSION['user_id'] ??= wa_b64u_enc(random_bytes(16));
                out(['ok' => true, 'publicKey' => [
                    'challenge' => wa_b64u_enc($challenge),
                    'rp' => ['name' => 'NöbetMed Test', 'id' => $rpId],
                    'user' => ['id' => $_SESSION['user_id'], 'name' => 'test@nobetmed.local', 'displayName' => 'Test Kullanıcı'],
                    'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7], ['type' => 'public-key', 'alg' => -257]],
                    'authenticatorSelection' => ['residentKey' => 'preferred', 'userVerification' => 'preferred'],
                    'excludeCredentials' => array_map(fn($id) => ['type' => 'public-key', 'id' => $id], array_keys($_SESSION['creds'])),
                    'attestation' => 'none',
                    'timeout' => 60000,
                ]]);

            case 'reg-finish':
                $b = body();
                $r = wa_verify_registration(
                    wa_b64u_dec((string)($b['clientDataJSON'] ?? '')),
                    wa_b64u_dec((string)($b['attestationObject'] ?? '')),
                    take_challenge('reg'), $origin, $rpId
                );
                if (!hash_equals($r['credential_id'], wa_b64u_dec((string)($b['rawId'] ?? '')))) {
                    throw new RuntimeException('Kimlik bilgisi kimliği uyuşmuyor.');
                }
                $id = wa_b64u_enc($r['credential_id']);
                $_SESSION['creds'][$id] = [
                    'pem' => $r['public_key_pem'], 'count' => $r['sign_count'], 'alg' => $r['alg'],
                    'user_id' => $_SESSION['user_id'],
                ];
                out(['ok' => true, 'id' => $id, 'alg' => $r['alg'], 'signCount' => $r['sign_count'], 'uv' => $r['uv'], 'pem' => $r['public_key_pem']]);

            case 'login-begin':
                $challenge = random_bytes(32);
                $_SESSION['wa_login'] = ['v' => $challenge, 't' => time()];
                out(['ok' => true, 'publicKey' => [
                    'challenge' => wa_b64u_enc($challenge),
                    'rpId' => $rpId,
                    'allowCredentials' => [],
                    'userVerification' => 'preferred',
                    'timeout' => 60000,
                ]]);

            case 'login-finish':
                $b = body();
                $challenge = take_challenge('login');
                $id = wa_b64u_enc(wa_b64u_dec((string)($b['rawId'] ?? $b['id'] ?? '')));
                $cred = $_SESSION['creds'][$id] ?? null;
                if ($cred === null) throw new RuntimeException('Bu passkey kayıtlı değil.');
                if (!empty($b['userHandle']) && !hash_equals($cred['user_id'], wa_b64u_enc(wa_b64u_dec((string)$b['userHandle'])))) {
                    throw new RuntimeException('Kullanıcı uyuşmuyor.');
                }
                $count = wa_verify_assertion(
                    wa_b64u_dec((string)($b['clientDataJSON'] ?? '')),
                    wa_b64u_dec((string)($b['authenticatorData'] ?? '')),
                    wa_b64u_dec((string)($b['signature'] ?? '')),
                    $challenge, $origin, $rpId, $cred['pem'], (int)$cred['count']
                );
                $_SESSION['creds'][$id]['count'] = $count;
                out(['ok' => true, 'signCount' => $count]);

            default:
                out(['ok' => false, 'error' => 'Bilinmeyen işlem.'], 404);
        }
    } catch (RuntimeException $e) {
        out(['ok' => false, 'error' => $e->getMessage()], 400);
    }
}
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passkey Testi</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 560px; margin: 40px auto; padding: 0 16px; background: #fff; color: #111; }
  button { font: inherit; padding: 10px 16px; margin: 4px 8px 4px 0; border-radius: 8px; border: 1px solid #888; cursor: pointer; }
  #log { white-space: pre-wrap; background: #f4f4f4; padding: 12px; border-radius: 8px; min-height: 3em; }
</style>
</head>
<body>
<h1>Passkey (WebAuthn) testi</h1>
<p>Kayıtlı passkey sayısı: <b id="n"><?= count($_SESSION['creds']) ?></b></p>
<button id="reg">Passkey oluştur</button>
<button id="login">Passkey ile giriş</button>
<div id="log"></div>
<script src="client.js"></script>
<script>
  const log = m => { document.getElementById('log').textContent = m; };
  document.getElementById('reg').onclick = async () => {
    try { const r = await passkeyRegister(); log('Kayıt tamam. alg=' + r.alg); document.getElementById('n').textContent++; }
    catch (e) { log('Hata: ' + e.message); }
  };
  document.getElementById('login').onclick = async () => {
    try { const r = await passkeyLogin(); log('Giriş başarılı. sayaç=' + r.signCount); }
    catch (e) { log('Hata: ' + e.message); }
  };
</script>
</body>
</html>
