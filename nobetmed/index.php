<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
nm_session();
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; frame-src 'self' https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
$v = NM_VERSION;
$boot = json_encode(['v' => $v, 'csrf' => $_SESSION['csrf'], 'share' => (string)($_GET['s'] ?? ''), 'reset' => preg_replace('/[^a-f0-9]/', '', (string)($_GET['reset'] ?? '')), 'invite' => preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_GET['davet'] ?? ''))], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?><!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
  <meta name="theme-color" content="#0b7a75">
  <title>NöbetMed</title>
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="assets/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="assets/icon-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/app.css?v=<?= $v ?>">
  <script id="nm-boot" type="application/json"><?= $boot ?></script>
  <script src="assets/theme.js?v=<?= $v ?>"></script>
</head>
<body>
  <div id="app"><div class="boot-splash"><div class="spinner"></div></div></div>
  <noscript>Bu uygulama için JavaScript gereklidir.</noscript>
<?php foreach (['core', 'auth', 'posts', 'viewer', 'rosters', 'admin', 'shiftparse', 'extras', 'pwa', 'main'] as $js): ?>
  <script src="assets/js/<?= $js ?>.js?v=<?= $v ?>"></script>
<?php endforeach; ?>
</body>
</html>
