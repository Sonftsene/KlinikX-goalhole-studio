<?php
/**
 * Nöbet listesi çözümleyicinin PHP sürümünü komut satırından çalıştırır (JSON çıktı).
 *   php php-parse.php <dosya.xlsx> [--sheet=N] [--uploaded=Y-m-d] [--file-name=ad] [--grid] [--all] [--time]
 *     --sheet=N   yalnızca N. sayfa (0 tabanlı, gizli sayfalar dahil model dizini) -> sp_extract_sheet
 *     --grid      girdi xlsx değil, xlsx_model_from_grid için JSON ızgara
 *     --all       {full, sheets: [{index, name, hidden, res}], model: [{name, hidden, cells: {anahtar: metin}, merges}]}
 *     --time      okuma/çözümleme süresini stderr'e yazar
 */
declare(strict_types=1);

$root = dirname(__DIR__, 2);
require $root . '/nobetmed/inc/xlsx.php';
require $root . '/nobetmed/inc/shiftparse.php';

$file = null; $sheet = null; $uploaded = '2026-10-28 10:00:00'; $fileName = null; $grid = false; $all = false; $time = false;
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--sheet=(\d+)$/', $a, $m)) $sheet = (int)$m[1];
    elseif (preg_match('/^--uploaded=(.+)$/', $a, $m)) $uploaded = strlen($m[1]) === 10 ? $m[1] . ' 10:00:00' : $m[1];
    elseif (preg_match('/^--file-name=(.*)$/', $a, $m)) $fileName = $m[1];
    elseif ($a === '--grid') $grid = true;
    elseif ($a === '--all') $all = true;
    elseif ($a === '--time') $time = true;
    elseif ($file === null) $file = $a;
}
if ($file === null) { fwrite(STDERR, "Kullanım: php php-parse.php <dosya.xlsx> [--sheet=N] [--uploaded=Y-m-d] [--all]\n"); exit(2); }
$opts = ['fileName' => $fileName ?? basename($file), 'uploadedAt' => $uploaded];

$t0 = microtime(true);
try {
    $model = $grid ? xlsx_model_from_grid(json_decode((string)file_get_contents($file), true, 512, JSON_THROW_ON_ERROR)) : xlsx_read($file);
} catch (Throwable $e) {
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE), "\n";
    exit(1);
}
$t1 = microtime(true);
if ($all) {
    $out = ['full' => sp_extract($model, $opts), 'active' => $model['active'], 'sheets' => [], 'model' => []];
    foreach ($model['sheets'] as $i => $sh) {
        $out['sheets'][] = ['index' => $i, 'name' => $sh['name'], 'hidden' => $sh['hidden'], 'res' => sp_extract_sheet($model, $i, $opts)];
        $cells = [];
        foreach ($sh['cells'] as $k => $c) $cells[(string)$k] = $c['text'];
        $out['model'][] = ['name' => $sh['name'], 'hidden' => $sh['hidden'], 'cells' => (object)$cells, 'merges' => $sh['merges']];
    }
} else {
    $out = $sheet === null ? sp_extract($model, $opts) : sp_extract_sheet($model, $sheet, $opts);
}
$t2 = microtime(true);
if ($time) fwrite(STDERR, sprintf("okuma %.1f ms, çözümleme %.1f ms, bellek %.1f MB, %d sayfa\n", ($t1 - $t0) * 1000, ($t2 - $t1) * 1000, memory_get_peak_usage() / 1048576, count($model['sheets'])));
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION), "\n";
