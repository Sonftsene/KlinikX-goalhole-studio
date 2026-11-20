<?php
/** dupcii — herkese açık yasal sayfalar: yasal.php?s=kvkk|gizlilik|kosullar|satis|iade */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/mail.php';
require_once __DIR__ . '/inc/mod_basvuru.php';
require_once __DIR__ . '/inc/mod_yasal.php';
lg_legal_page((string)($_GET['s'] ?? 'kvkk'));
