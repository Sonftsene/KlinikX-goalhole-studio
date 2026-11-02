<?php
/**
 * push_send uçtan uca testi (sahte push servisi 8072'de çalışıyor olmalı):
 *   php send-test.php <log.json>
 */
declare(strict_types=1);
require_once __DIR__ . '/../../nobetmed/inc/push.php';

$log = $argv[1] ?? '';
$fail = 0;
function check(bool $c, string $m): void { global $fail; echo ($c ? 'OK   ' : 'HATA ') . $m . "\n"; if (!$c) $fail++; }

$k = push_generate_vapid();
$base = 'http://127.0.0.1:8072';
$subs = [
    ['id' => 11, 'endpoint' => "$base/push/aaa"],
    ['id' => 12, 'endpoint' => "$base/push/gone"],
    ['id' => 13, 'endpoint' => "$base/push/bbb"],
];
$t = microtime(true);
$r = push_send($subs, $k['public'], $k['private_pem'], 'mailto:admin@example.com');
$ms = (int)((microtime(true) - $t) * 1000);
echo json_encode($r) . " ({$ms} ms)\n";
check(($r[11] ?? '') === 'ok', 'abonelik 11 → ok');
check(($r[12] ?? '') === 'gone', 'abonelik 12 → gone (410)');
check(($r[13] ?? '') === 'ok', 'abonelik 13 → ok');
check(count($r) === 3, '3 sonuç');

// Yanlış anahtar → sunucu 403 → 'error: HTTP 403 ...'
$other = push_generate_vapid();
$r2 = push_send([['id' => 21, 'endpoint' => "$base/push/ccc"]], $other['public'], $k['private_pem'], 'mailto:admin@example.com');
check(str_starts_with($r2[21] ?? '', 'error: HTTP 403'), 'yanlış k → ' . ($r2[21] ?? ''));
// Ulaşılamayan sunucu → error
$r3 = push_send([['id' => 31, 'endpoint' => 'http://127.0.0.1:1/push/x'], ['id' => 32, 'endpoint' => 'not a url']], $k['public'], $k['private_pem'], 'mailto:a@b.c');
check(str_starts_with($r3[31] ?? '', 'error: '), 'kapalı port → ' . ($r3[31] ?? ''));
check(str_starts_with($r3[32] ?? '', 'error: '), 'geçersiz adres → ' . ($r3[32] ?? ''));

$entries = json_decode((string)@file_get_contents($log), true) ?: [];
$ok = array_values(array_filter($entries, fn($e) => ($e['status'] ?? 0) === 201));
check(count($ok) === 2, 'sahte serviste 2 geçerli push kaydı (VAPID imzası ve aud doğrulandı)');
foreach ($ok as $e) {
    check($e['ttl'] === '86400' && $e['urgency'] === 'high' && $e['length'] === '0' && $e['body_len'] === 0, "push/{$e['id']}: TTL=86400, Urgency=high, gövde boş");
}
check(count($ok) === 2 && $ok[0]['jwt'] === $ok[1]['jwt'], 'aynı kitle için JWT bir kez üretildi (önbellek)');
check(count(array_filter($entries, fn($e) => ($e['status'] ?? 0) === 410)) === 1, '1 adet 410 kaydı');

echo $fail ? "\n$fail HATA\n" : "\nTüm gönderim testleri geçti\n";
exit($fail ? 1 : 0);
