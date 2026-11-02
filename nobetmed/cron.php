<?php
/**
 * İsteğe bağlı zamanlanmış görev: bekleyen e-postaları gönderir.
 * E-postalar zaten her istekte arka planda gönderilir; bu dosya yalnızca yedek içindir.
 * Hostinger hPanel › Gelişmiş › Cron Jobs: her 5 dakikada bir
 *   /usr/bin/php /home/KULLANICI/public_html/cron.php
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/mail.php';
$n = mail_flush(200);
echo date('c') . " gönderilen: $n\n";
