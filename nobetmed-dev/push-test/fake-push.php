<?php
/**
 * Sahte push servisi (PHP yerleşik sunucusu için yönlendirici):
 *   FAKE_PUSH_LOG=/tmp/log.json php -S 127.0.0.1:8072 fake-push.php
 * POST /push/<id>  → VAPID başlığını doğrular, kaydeder, 201
 * POST /push/gone  → 410
 */
declare(strict_types=1);
require_once __DIR__ . '/jwt-verify.php';

$log = getenv('FAKE_PUSH_LOG') ?: sys_get_temp_dir() . '/fake-push-log.json';
$path = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$entry = ['path' => $path, 'method' => $_SERVER['REQUEST_METHOD'], 'ttl' => $_SERVER['HTTP_TTL'] ?? null,
    'urgency' => $_SERVER['HTTP_URGENCY'] ?? null, 'length' => $_SERVER['CONTENT_LENGTH'] ?? null,
    'body_len' => strlen((string)file_get_contents('php://input'))];

$respond = function (int $code, string $msg) use ($log, &$entry): void {
    $entry['status'] = $code;
    $entry['msg'] = $msg;
    $fp = fopen($log, 'c+');
    flock($fp, LOCK_EX);
    $all = json_decode((string)stream_get_contents($fp), true) ?: [];
    $all[] = $entry;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string)json_encode($all, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    flock($fp, LOCK_UN);
    fclose($fp);
    http_response_code($code);
    header('Content-Type: text/plain');
    echo $msg;
};

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !preg_match('#^/push/([\w-]+)$#', $path, $m)) {
    $respond(404, 'not found');
    return;
}
if ($m[1] === 'gone') {
    $respond(410, 'push subscription has unsubscribed or expired');
    return;
}
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
if (!preg_match('/^vapid t=([A-Za-z0-9_\-.]+), k=([A-Za-z0-9_\-]+)$/', $auth, $a)) {
    $respond(401, 'missing/invalid vapid authorization');
    return;
}
$claims = verify_vapid_jwt($a[1], $a[2]);
if (!is_array($claims)) {
    $respond(403, 'bad jwt: ' . $claims);
    return;
}
if (($claims['aud'] ?? '') !== 'http://127.0.0.1:8072') {
    $respond(403, 'bad aud: ' . ($claims['aud'] ?? ''));
    return;
}
if (($claims['exp'] ?? 0) <= time() || $claims['exp'] > time() + 86400 || !str_starts_with((string)($claims['sub'] ?? ''), 'mailto:')) {
    $respond(403, 'bad exp/sub');
    return;
}
$entry['id'] = $m[1];
$entry['jwt'] = $a[1];
$respond(201, 'created');
