<?php
/**
 * Hasta adı kısaltma güvenlik denetimi (gs_mask_guard) birim testleri — uydurma verilerle
 *   php nobetmed-dev/gsync-guard-test.php
 */
declare(strict_types=1);

define('NM_ROOT', dirname(__DIR__) . '/nobetmed');
require NM_ROOT . '/inc/gsync.php';

$pass = 0; $fail = 0;
function ok(bool $c, string $msg): void { global $pass, $fail; if ($c) { $pass++; return; } $fail++; echo 'BAŞARISIZ: ', $msg, "\n"; }
/** [[satır, sütun, metin], ...] -> model sekmesi */
function sheet(string $name, array $cells): array
{
    $o = [];
    foreach ($cells as [$r, $c, $t]) $o[$r * 100000 + $c] = ['text' => $t];
    return ['name' => $name, 'cells' => $o];
}
$H = ['Hastanın Adı Soyadı'];
$b = sheet('B BLOK', [[0, 0, 'Yatak'], [0, 1, 'Hastanın Adı Soyadı'], [0, 2, 'Tanı'], [1, 0, '1'], [1, 1, 'Deneme Kişi'], [1, 2, 'Pnömoni']]);
$aEmpty = sheet('A BLOK', [[0, 0, 'Yatak'], [0, 1, 'Hasta']]);
$aData = sheet('A BLOK', [[0, 0, 'Yatak'], [0, 1, 'Hasta'], [1, 1, 'Örnek Ad']]);
$renamed = sheet('B BLOK', [[0, 0, 'Yatak'], [0, 1, 'Adı Soyadı'], [1, 1, 'Deneme Kişi']]);
$diag = sheet('C BLOK', [[0, 0, 'Hasta Tanısı'], [1, 0, 'KKY']]);

ok(gs_mask_guard(['sheets' => [$b, $aEmpty]], $H) === null, 'ayarlı sütun var, diğer "Hasta" sütunu boş → uygun');
ok(gs_mask_guard(['sheets' => [$b, $diag]], $H) === null, '"Hasta Tanısı" ad sütunu sayılmaz');
ok(is_string(gs_mask_guard(['sheets' => [$b, $aData]], $H)), 'altında ad olan "Hasta" sütunu → durdur');
ok(gs_mask_guard(['sheets' => [$b, $aData]], $H, ['B BLOK']) === null, 'riskli sütun gösterilmeyen sekmede → uygun');
ok(is_string(gs_mask_guard(['sheets' => [$renamed]], $H)), 'sütun adı değişmiş ("Adı Soyadı") → durdur');
ok(is_string(gs_mask_guard(['sheets' => [$b, $renamed]], $H, ['B BLOK2'])), 'gösterilen sekmelerde ayarlı başlık yok → durdur');
ok(is_string(gs_mask_guard(['sheets' => [$renamed, $b]], $H, [])) === false, 'başka sekmede ayarlı başlık var → uygun (sekme seçimi yok)');
ok(is_string(gs_mask_guard(['sheets' => [$renamed, $b]], $H, ['B BLOK'])) === false, 'gösterilen sekmede başlık var');

echo "$pass geçti, $fail başarısız\n";
exit($fail ? 1 : 0);
