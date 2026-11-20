<?php
/** dupcii — herkese açık tanıtım sayfası (sistem yöneticisi "Site ve yedek" › Yayın açınca görünür) */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/mail.php';
if (is_file(__DIR__ . '/inc/billing.php')) require_once __DIR__ . '/inc/billing.php';
require_once __DIR__ . '/inc/mod_basvuru.php';
require_once __DIR__ . '/inc/mod_yasal.php';
require_once __DIR__ . '/inc/landing.php';
lg_landing_page();
