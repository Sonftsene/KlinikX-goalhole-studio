<?php
/** Uygulama bildirimi (manifest): yöneticinin yüklediği simgeleri kullanır */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
$u = fn(string $k) => (string)setting('brand_' . $k, '') !== '' ? 'api.php?action=brand&f=' . $k . '&v=' . substr(md5((string)setting('brand_' . $k)), 0, 10) : null;
$icons = [];
if ($u('icon192') && $u('icon512')) {
    $icons[] = ['src' => $u('icon192'), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any maskable'];
    $icons[] = ['src' => $u('icon512'), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'];
} else {
    $icons[] = ['src' => 'assets/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any maskable'];
    $icons[] = ['src' => 'assets/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'];
    $icons[] = ['src' => 'assets/icon.svg', 'sizes' => 'any', 'type' => 'image/svg+xml'];
}
echo json_encode([
    'name' => 'dupcii', 'short_name' => 'dupcii', 'start_url' => './', 'scope' => './', 'display' => 'standalone',
    'background_color' => '#1a1f3d', 'theme_color' => '#1a1f3d', 'icons' => $icons,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
