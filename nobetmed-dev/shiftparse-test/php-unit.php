<?php
/**
 * shiftparse.php birim testleri (tests.js'teki classifyCode / codeKey / matchPersonName / summarizeMonth durumları)
 *   php nobetmed-dev/shiftparse-test/php-unit.php
 */
declare(strict_types=1);

$root = dirname(__DIR__, 2);
require $root . '/nobetmed/inc/xlsx.php';
require $root . '/nobetmed/inc/shiftparse.php';

$pass = 0; $fail = 0;
function eq($got, $want, string $msg): void
{
    global $pass, $fail;
    if (json_encode($got, JSON_UNESCAPED_UNICODE) === json_encode($want, JSON_UNESCAPED_UNICODE)) { $pass++; return; }
    $fail++;
    echo 'BAŞARISIZ: ', $msg, ' → ', json_encode(['got' => $got, 'want' => $want], JSON_UNESCAPED_UNICODE), "\n";
}
$cc = static fn($t) => ($k = sp_classify_code($t)) ? $k['code'] : null;

/* ---------------- classifyCode ---------------- */
foreach (['8 8', '88', '8-8', '8/8', '08 08', '08-08', '0808', '8.8', ' 8  8 '] as $t) eq($cc($t), '8 8', "classifyCode('$t')");
foreach (['8 16', '816', '8-16', '08-16', '08:00-16:00', '8/16', '0816'] as $t) eq($cc($t), '8 16', "classifyCode('$t')");
foreach (['16 8', '168', '16-08', '1608', '16:00 - 08:00'] as $t) eq($cc($t), '16 8', "classifyCode('$t')");
eq($cc('24'), '24', "classifyCode('24')");
foreach ([['g', 'G'], ['G', 'G'], ['n', 'N'], ['Yİ', 'Yİ'], ['yi', 'Yİ'], ['YI', 'Yİ'], ['Rp', 'Rp'], ['RP', 'Rp'], ['rp', 'Rp'], ['Nİ', 'Nİ'], ['ni', 'Nİ'], ['İ', 'İ'],
    ['Y', 'Y'], ['EV.İ', 'EV.İ'], ['ev i', 'EV.İ'], ['RF', 'RF'], ['Gbl.İ', 'Gbl.İ'], ['GBLİ', 'Gbl.İ'], ['Dgml', 'Dgml'], ['S', 'S'], ['GGr', 'GGr'], ['ggr', 'GGr'], ['AYR', 'AYR'], ['ayr.', 'AYR']] as [$t, $c]) {
    eq($cc($t), $c, "classifyCode('$t')");
}
$k88 = sp_classify_code('88');
eq([$k88['label'], $k88['start'], $k88['end'], $k88['hours'], $k88['kind'], $k88['raw']], ['24 saat', '08:00', '08:00', 24, 'shift', '88'], 'classifyCode 8 8 kaydı');
$k816 = sp_classify_code('8 16');
eq([$k816['label'], $k816['start'], $k816['end'], $k816['hours']], ['Gündüz', '08:00', '16:00', 8], 'classifyCode 8 16 kaydı');
$k168 = sp_classify_code('16 8');
eq([$k168['label'], $k168['hours']], ['Gece', 16], 'classifyCode 16 8 kaydı');
foreach (['8 20', '820', '08:00-20:00'] as $t) eq([$cc($t), sp_classify_code($t)['hours']], ['8 20', 12], "classifyCode('$t') 12 saat");
eq([sp_classify_code('20 8')['hours'], !empty(sp_classify_code('20 8')['nextDay'])], [12, true], 'classifyCode 20 8 gece');
eq([sp_classify_code('Yİ')['kind'], sp_classify_code('Yİ')['hours'], sp_classify_code('Yİ')['label']], ['leave', 0, 'Yıllık izin'], 'Yİ izin');
eq(sp_classify_code('S')['kind'], 'off', 'S off');
eq(sp_classify_code('Rp')['label'], 'Raporlu', 'Rp etiketi');
eq(sp_classify_code(''), null, 'boş -> null');
eq(sp_classify_code('   '), null, 'boşluk -> null');
eq(sp_classify_code(null), null, 'null -> null');
$unk = sp_classify_code('Kurs');
eq([$unk['code'], $unk['label'], $unk['kind'], $unk['hours'], $unk['raw']], ['Kurs', 'Kurs', 'shift', null, 'Kurs'], 'bilinmeyen kod');
$custom = [['code' => 'K', 'label' => 'Kurs', 'start' => '09:00', 'end' => '17:00', 'hours' => 8, 'kind' => 'shift']];
eq(sp_classify_code('k', $custom)['label'], 'Kurs', 'özel sözlük');
eq(sp_classify_code('8 8', $custom)['hours'], null, 'özel sözlükte olmayan kod');

/* ---------------- codeKey ---------------- */
foreach ([['08:00-16:00', '8 16'], ['8.00 - 16.00', '8 16'], ['08–16', '8 16'], ['8/8', '8 8'], ['0808', '8 8'], ['008', '8'], ['24', '24'], ['12', '12'],
    ['123456', '123456'], ['2 4', '2 4'], ['Gbl.İ', 'gbli'], ['EV.İ', 'evi'], ["Y\u{00A0}İ", 'yi'], ['IŞIK', 'isik'], ['Dğml', 'dgml'], ['', ''], ['  ', '']] as [$t, $k]) {
    eq(sp_code_key($t), $k, "codeKey('$t')");
}

/* ---------------- matchPersonName ---------------- */
foreach ([['İSMAİL KARTAL', 'İsmail Kartal', true], ['Ceren Sibel Özel Yılmaz', 'Ceren Yılmaz', true], ['Ceren Yılmaz', 'Ceren Sibel Özel Yılmaz', true],
    ['IŞIL KOÇ', 'Işıl Koç', true], ['ışıl koç', 'IŞIL KOÇ', true], ['ALİ YILDIZ', 'Ali Yildiz', true], ['ALİ  YILDIZ ', 'ali yıldız', true],
    ['Uzm. Hem. Ayşe Kaya', 'Ayşe Kaya', true], ['DİLEK ÖZTÜRK', 'Dilek Öztürk', true], ['Ayşe', 'Ayşe', true],
    ['Ali', 'Ali Yıldız', false], ['Ali Yıldız', 'Ali', false], ['Ali Yıldız', 'Ali Kaya', false], ['Ali Yıldız', 'Veli Yıldız', false],
    ['Ayşe Kaya', 'Ayşe Kayan', false], ['', 'Ali Yıldız', false], ['Ali Yıldız', '', false], ['Işık Ak', 'Isık Ak', true], ['Nur Şahin', 'Nur Şahin Kaya', true]] as [$a, $b, $want]) {
    eq(sp_match_person_name($a, $b), $want, "matchPersonName('$a', '$b')");
}

/* ---------------- summarizeMonth ---------------- */
$E = static function (int $day, string $code): array { $k = sp_classify_code($code); return ['day' => $day, 'date' => sprintf('2026-11-%02d', $day), 'code' => $k['code'], 'kind' => $k['kind'], 'hours' => $k['hours']]; };
eq(sp_summarize_month([$E(1, '8 8'), $E(2, '8 16'), $E(3, '16 8'), $E(4, 'Yİ'), $E(7, 'Yİ'), $E(5, 'Rp'), $E(6, 'S'), $E(9, 'Kurs')], 2026, 11),
    ['shifts' => 4, 'hours' => 48, 'leaveDays' => 2, 'requiredHours' => 168 - 16, 'overtime' => 48 - 152], 'summarizeMonth sentetik');
eq(sp_summarize_month([], 2026, 2)['requiredHours'], 20 * 8, 'Şubat 2026 iş günü');

/* ---------------- tarih yardımcıları ---------------- */
eq([sp_days_in(2026, 2), sp_days_in(2028, 2), sp_days_in(2026, 11), sp_days_in(2026, 12)], [28, 29, 30, 31], 'ay gün sayıları');
eq([sp_dow(2026, 11, 1), sp_dow(2027, 1, 1), sp_dow(2026, 13, 1)], [0, 5, 5], 'haftanın günü (taşma dahil)');
eq([sp_find_month('KASIM 3, BASAMAK'), sp_find_month('EKİM 3.BASAMAK'), sp_find_month('ŞUBAT'), sp_find_month('Kasımpaşa')], [11, 10, 2, 0], 'ay adı');
eq([sp_name_info('nobet_2026-11'), sp_name_info('11.2026 liste')], [['mo' => 11, 'y' => 2026], ['mo' => 11, 'y' => 2026]], 'dosya adından ay/yıl');

/* ---------------- ızgara modelinden (Apps Script) ---------------- */
$vals = [['', 'ADI SOYADI', 'ÜNVANI'], ['', '', '']];
for ($d = 1; $d <= 30; $d++) { $vals[0][] = (string)$d; $vals[1][] = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][sp_dow(2026, 11, $d)]; }
$vals[] = array_merge(['1', 'Ayşe Kaya', 'Hemşire'], array_fill(0, 30, ''));
$vals[2][3] = '8 8'; $vals[2][4] = '20 8'; $vals[2][32] = 'Yİ';
$model = xlsx_model_from_grid([['name' => 'Kapak', 'values' => [['x']]], ['name' => 'KASIM 2.BASAMAK', 'values' => $vals, 'active' => true]]);
$r = sp_extract($model, ['uploadedAt' => '2026-10-28 10:00:00']);
eq([$r['ok'], $r['sheetName'], $r['year'], $r['month'], $r['monthSource'], count($r['entries'])], [true, 'KASIM 2.BASAMAK', 2026, 11, 'sheet-name', 3], 'ızgara modeli');
eq(array_map(static fn($e) => [$e['date'], $e['code'], $e['hours']], $r['entries']), [['2026-11-01', '8 8', 24], ['2026-11-02', '20 8', 12], ['2026-11-30', 'Yİ', 0]], 'ızgara kayıtları');
eq(sp_extract_sheet($model, 0, [])['ok'], false, 'tek sayfa: kapak tanınmaz, başka sekmeye geçmez');

echo "$pass geçti, $fail başarısız\n";
exit($fail ? 1 : 0);
