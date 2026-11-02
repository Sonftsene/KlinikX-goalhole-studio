<?php
/**
 * Zamanlanmış görevler: e-posta kuyruğu, sabah özeti, nöbet hatırlatmaları, okuma hatırlatmaları,
 * belge gözden geçirme uyarıları ve haftalık yedek.
 * Bu görevler site ziyaret edildikçe de arka planda çalışır; cron saatinde çalışmalarını garanti eder.
 * Hostinger hPanel › Gelişmiş › Cron Jobs: her 10 dakikada bir
 *   /usr/bin/php /home/KULLANICI/public_html/cron.php
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/mail.php';
require __DIR__ . '/inc/notify.php';
foreach (["push.php", "webauthn.php"] as $f) if (is_file(__DIR__ . '/inc/' . $f)) require __DIR__ . '/inc/' . $f;
set_setting('cron_last', (string)time());
$done = run_jobs(in_array('--force', $argv ?? [], true));
$n = mail_flush(200);
echo date('c') . ' görevler: ' . (json_encode($done, JSON_UNESCAPED_UNICODE) ?: '{}') . " · gönderilen e-posta: $n\n";
