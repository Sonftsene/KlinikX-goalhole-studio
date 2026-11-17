<?php
/**
 * dupcii — nöbet listesi çözümleyici (assets/js/shiftparse.js'in satır satır PHP karşılığı).
 * Excel görüntüleme modelinden (xlsx.php: xlsx_read / xlsx_model_from_grid) kişi başı nöbetleri çıkarır.
 * Saf fonksiyonlar; çıktı üretmez, uygulamanın başka fonksiyonlarına dayanmaz.
 *
 *   sp_classify_code($text, $dict)          -> sözlük kaydı (+raw) | null
 *   sp_extract($model, $opts)               -> [ok, year, month, layout, sheetName, people, entries, warnings, monthSource]
 *   sp_extract_sheet($model, $i, $opts)     -> aynı; yalnızca $i. sayfa (başka sekmeye geçmez)
 *   sp_match_person_name($rosterName, $userName) -> bool
 *   sp_summarize_month($entries, $y, $m)    -> [shifts, hours, leaveDays, requiredHours, overtime]
 *
 * Tarayıcıdaki sürümle aynı sonucu vermesi gerekir: değişiklikler iki dosyaya birlikte yapılmalı
 * (nobetmed-dev/shiftparse-test/php-parity.cjs ile karşılaştırılır).
 */
declare(strict_types=1);

/** JavaScript'in \s kümesi (karakter sınıfı içinde) */
const SP_WS = '\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';
/** JavaScript'in ASCII \b'si (PCRE /u ile \b Türkçe harfleri de kelime sayar) */
const SP_WB_END = '(?![A-Za-z0-9_])';
const SP_TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const SP_MONTH_KEYS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const SP_FOLD = ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u', 'ê' => 'e', 'é' => 'e'];
const SP_NAME_RE = '/^[\p{L}][\p{L}.\'’\- ]*$/uD';
const SP_STOP_RE = '/^(topl' . SP_WB_END . '|toplam|genel toplam|kısaltma|kisaltma|açıklama|aciklama|notlar?[' . SP_WS . ']*[:.]|imza|onay|düzenleyen|duzenleyen|hazırlayan|hazirlayan|tasdik|olur' . SP_WB_END . ')/u';
const SP_TITLE_RE = '/(hemş|hems|ebe' . SP_WB_END . '|memur|personel|tekni|doktor|hekim|uzman|sağlık|saglik|bakım|bakim|sorumlu|şef|sef' . SP_WB_END . '|asistan|stajyer|sekreter|temizlik|güvenlik|guvenlik|fizyoterap|diyetisyen|psikolog|eczac|laborant|biyolog|ambulans|paramedik|att' . SP_WB_END . '|acil tıp|görevli|gorevli|işçi|isci|hizmet)/u';
const SP_DATE_HDR = '/^(tarih|tarihi|nöbet tarihi|nobet tarihi|gün[' . SP_WS . ']*\/[' . SP_WS . ']*tarih|date|gün no|gun no)$/uD';
const SP_SKIP_HDR = '/^(gün|gun|günler|gunler|gün adı|gun adi|sıra|sira|sıra no|sira no|no|açıklama|aciklama|not|notlar|day|hafta|izinliler|izinli)$/uD';
const SP_SHIFT_HDR = '/(gündüz|gunduz|gece|nöbet|nobet|vardiya|sabah|akşam|aksam|öğle|ogle|icap|24|[0-9]{1,2}[' . SP_WS . ']*[-–—:][' . SP_WS . ']*[0-9]{1,2}|sorumlu|nöbetçi|nobetci|mesai|hemşire|hemsire|personel|ekip)/u';
const SP_HONORIFIC = ['dr' => 1, 'uzm' => 1, 'hem' => 1, 'hems' => 1, 'op' => 1, 'doc' => 1, 'prof' => 1, 'yrd' => 1, 'ogr' => 1, 'gor' => 1, 'sb' => 1, 'sor' => 1];

/* ------------------------------------------------------------------ */
/* Vardiya kodları                                                     */
/* ------------------------------------------------------------------ */
function sp_default_codes(): array
{
    return [
        ['code' => '8 8', 'label' => '24 saat', 'start' => '08:00', 'end' => '08:00', 'hours' => 24, 'kind' => 'shift', 'nextDay' => true],
        ['code' => '8 16', 'label' => 'Gündüz', 'start' => '08:00', 'end' => '16:00', 'hours' => 8, 'kind' => 'shift'],
        ['code' => '16 8', 'label' => 'Gece', 'start' => '16:00', 'end' => '08:00', 'hours' => 16, 'kind' => 'shift', 'nextDay' => true],
        ['code' => '8 20', 'label' => 'Uzun gündüz (12 saat)', 'start' => '08:00', 'end' => '20:00', 'hours' => 12, 'kind' => 'shift'],
        ['code' => '20 8', 'label' => 'Uzun gece (12 saat)', 'start' => '20:00', 'end' => '08:00', 'hours' => 12, 'kind' => 'shift', 'nextDay' => true],
        ['code' => '24', 'label' => '24 saat', 'start' => '08:00', 'end' => '08:00', 'hours' => 24, 'kind' => 'shift', 'nextDay' => true, 'aliases' => ['24 saat', '24s']],
        ['code' => 'G', 'label' => 'Gündüz', 'start' => '08:00', 'end' => '16:00', 'hours' => 8, 'kind' => 'shift', 'aliases' => ['Gündüz']],
        ['code' => 'N', 'label' => 'Gece', 'start' => '16:00', 'end' => '08:00', 'hours' => 16, 'kind' => 'shift', 'nextDay' => true, 'aliases' => ['Gece']],
        ['code' => '8', 'label' => 'Gündüz (8 saat)', 'start' => '08:00', 'end' => '16:00', 'hours' => 8, 'kind' => 'shift'],
        ['code' => '16', 'label' => 'Gece (16 saat)', 'start' => '16:00', 'end' => '08:00', 'hours' => 16, 'kind' => 'shift', 'nextDay' => true],
        ['code' => 'Yİ', 'label' => 'Yıllık izin', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['Yıllık izin']],
        ['code' => 'Y', 'label' => 'Yıllık izin', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave'],
        ['code' => 'Rp', 'label' => 'Raporlu', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['RP', 'R', 'Rapor', 'Raporlu']],
        ['code' => 'Nİ', 'label' => 'Nöbet izni', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['Nöbet izni']],
        ['code' => 'İ', 'label' => 'İdari izin', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['İzin', 'İdari izin', 'İ.İ']],
        ['code' => 'EV.İ', 'label' => 'Evlilik izni', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['Evlilik izni']],
        ['code' => 'RF', 'label' => 'Refakat izni', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['Refakat']],
        ['code' => 'Gbl.İ', 'label' => 'Gebelik izni', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['Gebelik izni']],
        ['code' => 'Dgml', 'label' => 'Doğum izni', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'leave', 'aliases' => ['Doğum izni', 'Dğml']],
        ['code' => 'S', 'label' => 'Sevkli', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'off', 'aliases' => ['Sevk', 'Sevkli']],
        ['code' => 'GGr', 'label' => 'Geçici görev', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'off', 'aliases' => ['GG', 'Geçici görev']],
        ['code' => 'AYR', 'label' => 'Ayrılış', 'start' => null, 'end' => null, 'hours' => 0, 'kind' => 'off', 'aliases' => ['Ayrıldı', 'Ayrılış']],
    ];
}

/** Geçersiz UTF-8'i temizler (preg_* /u ile null dönmesin) */
function sp_str($s): string
{
    if ($s === null || $s === false) return '';
    if (is_bool($s)) return 'true';
    if (is_float($s)) return (floor($s) === $s && abs($s) < 1e15) ? sprintf('%.0f', $s) : (string)$s;
    $s = (string)$s;
    return preg_match('//u', $s) ? $s : mb_convert_encoding($s, 'UTF-8', 'UTF-8');
}

/** Türkçe küçük harf (core.js trLower) */
function sp_lower($s): string
{
    $s = ($s === null || $s === '' || $s === 0 || $s === false) ? '' : sp_str($s);
    return mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $s), 'UTF-8');
}

/** Türkçe küçük harf + aksan katlama (ç→c, ı→i …) */
function sp_fold($s): string
{
    return strtr(sp_lower($s), SP_FOLD);
}

function sp_clean($s): string
{
    $s = sp_str($s);
    if ($s === '') return '';
    return trim(preg_replace('/[' . SP_WS . ']+/u', ' ', $s), ' ');
}

/** JavaScript String.length (UTF-16 birimi) */
function sp_jslen(string $s): int
{
    return mb_strlen($s, 'UTF-8') + (strpbrk($s, "\xF0\xF1\xF2\xF3\xF4") !== false ? preg_match_all('/[\x{10000}-\x{10FFFF}]/u', $s) : 0);
}

/** İki saat sayısına bölünebilen rakam dizisini çözer: '816' -> [8,16], '1608' -> [16,8] */
function sp_split_hours(string $d): ?array
{
    $n = strlen($d);
    for ($i = 1; $i < $n; $i++) {
        $a = substr($d, 0, $i); $b = substr($d, $i);
        if (strlen($a) > 2 || strlen($b) > 2) continue;
        if ((int)$a <= 24 && (int)$b <= 24) return [(int)$a, (int)$b];
    }
    return null;
}

/** Kodu karşılaştırma anahtarına çevirir: büyük/küçük harf, boşluk, nokta, tire, eğik çizgi önemsiz. */
function sp_code_key($text): string
{
    $t = sp_clean($text);
    if ($t === '') return '';
    // Saat aralığı: '08:00-16:00', '8.00 - 16.00', '08–16', '8/8', '08 08'
    if (preg_match('/^([0-9]{1,2})(?:[:.]00)?[' . SP_WS . ']*[-–—\/ .][' . SP_WS . ']*([0-9]{1,2})(?:[:.]00)?$/uD', $t, $m)) return (int)$m[1] . ' ' . (int)$m[2];
    $digits = preg_replace('/[' . SP_WS . '.\-–—\/_:]+/u', '', $t);
    if (preg_match('/^[0-9]+$/D', $digits)) {
        if (preg_match('/^0*(8|12|16|24)$/D', $digits)) return (string)(int)$digits;
        $hs = sp_split_hours($digits);
        if ($hs) return $hs[0] . ' ' . $hs[1];
        return $digits;
    }
    return preg_replace('/[' . SP_WS . '.\-–—\/_:\'’]+/u', '', sp_fold($t));
}

/** Sözlük dizini: kod anahtarı -> kayıt (ilk eşleşen kazanır) */
function sp_dict_index(?array $dict = null): array
{
    static $cache = [];
    $dict = $dict ?: sp_default_codes();
    $ck = md5(serialize($dict));
    if (isset($cache[$ck])) return $cache[$ck];
    $idx = [];
    foreach ($dict as $e) {
        if (!is_array($e)) continue;
        foreach (array_merge([$e['code'] ?? ''], (array)($e['aliases'] ?? [])) as $a) {
            $k = sp_code_key($a);
            if ($k !== '' && !array_key_exists($k, $idx)) $idx[$k] = $e;
        }
    }
    if (count($cache) > 20) $cache = [];
    return $cache[$ck] = $idx;
}

/** Hücre metnini vardiya koduna çevirir. Boşsa null; bilinmeyen kod -> kind 'shift', hours null */
function sp_classify_code($text, ?array $dict = null): ?array
{
    return sp_classify_idx($text, sp_dict_index($dict));
}

function sp_classify_idx($text, array $idx): ?array
{
    $raw = sp_clean($text);
    if ($raw === '') return null;
    $e = $idx[sp_code_key($raw)] ?? null;
    if ($e) {
        $out = ['code' => $e['code'] ?? null, 'label' => $e['label'] ?? null, 'start' => !empty($e['start']) ? $e['start'] : null, 'end' => !empty($e['end']) ? $e['end'] : null,
            'hours' => array_key_exists('hours', $e) ? $e['hours'] : null, 'kind' => !empty($e['kind']) ? $e['kind'] : 'shift', 'raw' => $raw];
        if (!empty($e['nextDay'])) $out['nextDay'] = true;
        return $out;
    }
    return ['code' => $raw, 'label' => $raw, 'start' => null, 'end' => null, 'hours' => null, 'kind' => 'shift', 'raw' => $raw];
}

/* ------------------------------------------------------------------ */
/* Tarih yardımcıları                                                  */
/* ------------------------------------------------------------------ */
function sp_weekday_map(): array
{
    static $map = null;
    if ($map === null) {
        $map = [];
        $w = [
            0 => ['pazar', 'paz', 'pz', 'pzr', 'pa'],
            1 => ['pazartesi', 'pzt', 'pt', 'pts', 'ptesi', 'pzts'],
            2 => ['sali', 'sal', 'sa', 'sl'],
            3 => ['carsamba', 'car', 'ca', 'crs', 'crsm', 'cr'],
            4 => ['persembe', 'per', 'pe', 'prs', 'prsm', 'pr'],
            5 => ['cuma', 'cum', 'cu', 'cm'],
            6 => ['cumartesi', 'cmt', 'ct', 'cts', 'cmts', 'cumt'],
        ];
        foreach ($w as $d => $l) foreach ($l as $k) $map[$k] = $d;
    }
    return $map;
}

function sp_weekday($text): int
{
    $k = preg_replace('/[' . SP_WS . '.]+/u', '', sp_fold($text));
    $map = sp_weekday_map();
    return $k !== '' && isset($map[$k]) ? $map[$k] : -1;
}

/** Gün sayısı (Date.UTC ile aynı: ay taşmaları normalleşir, 0–99 yılları 1900+) */
function sp_days_from_civil(int $y, int $m, int $d): int
{
    if ($y >= 0 && $y <= 99) $y += 1900;
    $y += intdiv($m - 1 - (($m - 1) % 12 + 12) % 12, 12);
    $m = (($m - 1) % 12 + 12) % 12 + 1;
    $y -= $m <= 2 ? 1 : 0;
    $era = intdiv($y >= 0 ? $y : $y - 399, 400);
    $yoe = $y - $era * 400;
    $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5);
    $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
    return $era * 146097 + $doe - 719468 + $d - 1;
}

function sp_days_in(int $y, int $m): int
{
    return sp_days_from_civil($y, $m + 1, 1) - sp_days_from_civil($y, $m, 1);
}

function sp_dow(int $y, int $m, int $d): int
{
    return ((sp_days_from_civil($y, $m, $d) + 4) % 7 + 7) % 7;
}

/** new Date(Date.UTC(y, m0, 1)) -> [yıl, ay(1–12)] */
function sp_norm_ym(int $y, int $m0): array
{
    if ($y >= 0 && $y <= 99) $y += 1900;
    $y += intdiv($m0 - (($m0 % 12) + 12) % 12, 12);
    return [$y, (($m0 % 12) + 12) % 12 + 1];
}

function sp2(int $n): string
{
    return str_pad((string)$n, 2, '0', STR_PAD_LEFT);
}

function sp_iso(int $y, int $m, int $d): string
{
    return $y . '-' . sp2($m) . '-' . sp2($d);
}

/** Metinde ay adı arar (Türkçe, büyük/küçük harf ve aksan duyarsız). 1–12 veya 0 döner. */
function sp_find_month($text): int
{
    $t = ' ' . preg_replace('/[^a-z0-9]+/u', ' ', sp_fold($text)) . ' ';
    for ($i = 0; $i < 12; $i++) if (str_contains($t, ' ' . SP_MONTH_KEYS[$i] . ' ')) return $i + 1;
    return 0;
}

/** Tarih parçası olmayan 4 haneli yıl (2020–2099) */
function sp_find_year($text): int
{
    return preg_match('/(?:^|[^0-9.\/-])(20[2-9][0-9])(?![0-9]|[.\/-][0-9])/u', sp_str($text), $m) ? (int)$m[1] : 0;
}

/** 'gg.aa.yyyy', 'g.a.yy', 'yyyy-aa-gg' -> parçalar (a/b sırası belirsiz olabilir) */
function sp_date_parts($text): ?array
{
    $t = sp_clean($text);
    if (preg_match('/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:[ T][^\n\r\x{2028}\x{2029}]*)?$/uD', $t, $m)) return ['iso' => true, 'y' => (int)$m[1], 'mo' => (int)$m[2], 'd' => (int)$m[3]];
    if (preg_match('/^([0-9]{1,2})[.\/-]([0-9]{1,2})[.\/-]([0-9]{2}|[0-9]{4})(?:[' . SP_WS . ']+[^' . SP_WS . '][^\n\r\x{2028}\x{2029}]*)?$/uD', $t, $m)) {
        $y = (int)$m[3];
        if ($y < 100) $y += 2000;
        return ['iso' => false, 'a' => (int)$m[1], 'b' => (int)$m[2], 'y' => $y, 'sep' => str_contains($t, '/') ? '/' : '.'];
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Sayfa erişimi                                                       */
/* ------------------------------------------------------------------ */
function sp_sheet_view(array $sh): array
{
    $cells = (array)($sh['cells'] ?? []);
    $ct = []; $raw = []; $nv = [];
    $nRows = (int)($sh['nRows'] ?? 0); $nCols = (int)($sh['nCols'] ?? 0);
    $rowsWith = [];
    foreach ($cells as $k => $x) {
        $k = (int)$k;
        $r = intdiv($k, 100000); $c = $k % 100000;
        if ($r + 1 > $nRows) $nRows = $r + 1;
        if ($c + 1 > $nCols) $nCols = $c + 1;
        if (!is_array($x)) continue;
        $text = $x['text'] ?? null;
        $t = sp_clean($text);
        $ct[$k] = $t;
        $raw[$k] = $text !== null ? sp_str($text) : '';
        $v = $x['v'] ?? null;
        if (is_int($v) || is_float($v)) $nv[$k] = (float)$v;
        if ($t !== '') $rowsWith[$r] = true;
    }
    ksort($rowsWith);
    $mergeAt = [];
    foreach ((array)($sh['merges'] ?? []) as $m) {
        if (is_array($m) && isset($m['r1'])) $mergeAt[$m['r1'] * 100000 + $m['c1']] = $m;
    }
    return ['sh' => $sh, 'ct' => $ct, 'raw' => $raw, 'nv' => $nv, 'nRows' => $nRows, 'nCols' => $nCols, 'rowsWith' => $rowsWith, 'mergeAt' => $mergeAt];
}

function sp_txt(array $V, int $r, int $c): string
{
    return $V['ct'][$r * 100000 + $c] ?? '';
}

function sp_raw_txt(array $V, int $r, int $c): string
{
    return $V['raw'][$r * 100000 + $c] ?? '';
}

function sp_num(array $V, int $r, int $c): float
{
    $k = $r * 100000 + $c;
    if (!isset($V['ct'][$k])) return NAN;
    if (isset($V['nv'][$k])) return $V['nv'][$k];
    $t = $V['ct'][$k];
    return preg_match('/^[0-9]+(?:[.,]0+)?$/D', $t) ? (float)str_replace(',', '.', $t) : NAN;
}

/** Kişi adına benziyor mu: ≥ 2 kelime, harf, rakamsız, 5–40 karakter */
function sp_is_name($t): bool
{
    $t = sp_clean($t);
    $len = sp_jslen($t);
    if ($len < 5 || $len > 40 || !preg_match(SP_NAME_RE, $t)) return false;
    $n = 0;
    foreach (explode(' ', $t) as $w) if (preg_match('/\p{L}{2,}/u', $w)) $n++;
    return $n >= 2 && $n <= 6;
}

/* ------------------------------------------------------------------ */
/* Izgara düzeni: kişi satırları × gün sütunları                       */
/* ------------------------------------------------------------------ */
/** Bir hücre metninden gün numarası (ve varsa ay/yıl) çıkarır */
function sp_day_cell(array $V, int $r, int $c): ?array
{
    $t = sp_txt($V, $r, $c);
    if ($t === '') return null;
    $n = sp_num($V, $r, $c);
    if (is_finite($n) && floor($n) === $n && $n >= 1 && $n <= 31 && preg_match('/^[0-9]{1,2}(?:[.,]0+)?$/D', $t)) return ['d' => (int)$n];
    if (preg_match('/^([0-9]{1,2})\.?(?:[' . SP_WS . ']+\p{L}+\.?)?$/uD', $t, $m) && (int)$m[1] >= 1 && (int)$m[1] <= 31) return ['d' => (int)$m[1]]; // '1.' veya '1 Pzt'
    $p = sp_date_parts($t);
    if ($p) return $p['iso'] ? ['d' => $p['d'], 'mo' => $p['mo'], 'y' => $p['y']] : ['d' => $p['a'], 'mo' => $p['b'], 'y' => $p['y'], 'alt' => ['d' => $p['b'], 'mo' => $p['a']]];
    if (preg_match('/^([0-9]{1,2})[.\/]([0-9]{1,2})\.?$/D', $t, $m)) return ['d' => (int)$m[1], 'mo' => (int)$m[2]]; // '01.11'
    return null;
}

function sp_try_run(array $seq, bool $useAlt): ?array
{
    $pick = static fn($x) => $useAlt ? (isset($x['alt']) ? $x['alt']['d'] : -1) : $x['d'];
    $run = null;
    $n = count($seq);
    for ($i = 0; $i < $n; $i++) {
        if ($pick($seq[$i]) === 1) {
            $x = $seq[$i]; $x['day'] = 1;
            $cur = [$x];
            for ($j = $i + 1; $j < $n; $j++) {
                $dj = $pick($seq[$j]);
                $lastDay = $cur[count($cur) - 1]['day'];
                if ($dj === $lastDay + 1) { $x = $seq[$j]; $x['day'] = $dj; $cur[] = $x; }
                elseif ($dj === $lastDay) continue; // aynı gün iki sütun
                else break;
            }
            if (count($cur) >= 28 && count($cur) <= 31 && (!$run || count($cur) > count($run))) $run = $cur;
        }
    }
    return $run;
}

/** Gün başlığı satırını bulur: soldan sağa 1,2,3… diye artan ≥ 28 hücre */
function sp_find_day_header(array $V): ?array
{
    $best = null;
    foreach ($V['rowsWith'] as $r => $_) {
        $seq = [];
        for ($c = 0; $c < $V['nCols']; $c++) { $x = sp_day_cell($V, $r, $c); if ($x) $seq[] = ['c' => $c] + $x; }
        if (count($seq) < 28) continue;
        // Gün sırası: d/m karışıklığında hangi yorumun 1,2,3… verdiğine bak
        $run = sp_try_run($seq, false);
        if (!$run) $run = sp_try_run($seq, true);
        if ($run && (!$best || count($run) > count($best['run']))) $best = ['r' => $r, 'run' => $run];
        if ($best) break; // en üstteki geçerli başlık
    }
    if (!$best) return null;
    $colDay = [];
    foreach ($best['run'] as $x) {
        $m = $V['mergeAt'][$best['r'] * 100000 + $x['c']] ?? null;
        $to = $m ? $m['c2'] : $x['c'];
        for ($c = $x['c']; $c <= $to; $c++) $colDay[$c] = $x['day'];
    }
    // Başlık hücreleri tam tarihse ay/yıl
    $y = 0; $mo = 0;
    $first = $best['run'][0];
    if (!empty($first['y'])) {
        $r1 = $best['run'][1] ?? null;
        $alt = $r1 && isset($r1['alt']) && $r1['d'] !== 2;
        if ($alt && !isset($first['alt'])) throw new RuntimeException('alt'); // JS'te TypeError -> bu sayfa atlanır
        $y = $first['y']; $mo = $alt ? $first['alt']['mo'] : ($first['mo'] ?? 0);
    } elseif (!empty($first['mo'])) $mo = $first['mo'];
    return ['r' => $best['r'], 'colDay' => $colDay, 'firstCol' => $first['c'], 'lastCol' => max(array_keys($colDay)), 'days' => count($best['run']), 'y' => $y, 'mo' => $mo];
}

/** Gün başlığının altında/üstünde haftanın günü satırı varsa 1. günün haftanın kaçıncı günü olduğunu döner */
function sp_weekday_row(array $V, array $hdr): ?array
{
    foreach ([$hdr['r'] + 1, $hdr['r'] - 1, $hdr['r'] + 2, $hdr['r'] - 2] as $r) {
        if ($r < 0) continue;
        $hits = 0; $consistent = 0; $w0 = -1;
        $votes = [];
        foreach ($hdr['colDay'] as $c => $day) {
            $w = sp_weekday(sp_txt($V, $r, $c));
            if ($w < 0) continue;
            $hits++;
            $s = ((($w - ($day - 1)) % 7) + 7) % 7;
            $votes[$s] = ($votes[$s] ?? 0) + 1;
        }
        foreach ($votes as $s => $n) if ($n > $consistent) { $consistent = $n; $w0 = $s; }
        if ($hits >= 20 && $consistent >= $hits * 0.9) return ['r' => $r, 'w0' => $w0];
    }
    return null;
}

function sp_row_is_stop(array $V, int $r, int $maxCol): bool
{
    for ($c = 0; $c <= $maxCol; $c++) {
        $t = sp_txt($V, $r, $c);
        if ($t !== '' && preg_match(SP_STOP_RE, sp_lower($t))) return true;
    }
    return false;
}

function sp_grid(array $V, array $idx): ?array
{
    $hdr = sp_find_day_header($V);
    if (!$hdr) return null;
    $wdRow = sp_weekday_row($V, $hdr);
    $leftCols = [];
    for ($c = 0; $c < $hdr['firstCol']; $c++) if (!isset($hdr['colDay'][$c])) $leftCols[] = $c;
    // Veri satırları: başlığın altından durdurucu satıra kadar
    $dataRows = [];
    for ($r = $hdr['r'] + 1; $r < $V['nRows']; $r++) {
        if ($wdRow && $r === $wdRow['r']) continue;
        if (!isset($V['rowsWith'][$r])) continue;
        if (sp_row_is_stop($V, $r, $hdr['firstCol'] - 1)) break;
        $dataRows[] = $r;
    }
    // İsim sütunu: en çok kişi adı içeren sol sütun
    $nameCol = -1; $bestN = 0;
    foreach ($leftCols as $c) {
        $n = 0;
        foreach ($dataRows as $r) if (sp_is_name(sp_txt($V, $r, $c))) $n++;
        if ($n > $bestN) { $bestN = $n; $nameCol = $c; }
    }
    if ($nameCol < 0) return null;
    $personRows = array_values(array_filter($dataRows, static fn($r) => sp_is_name(sp_txt($V, $r, $nameCol))));
    // Ünvan sütunu: kişi satırlarında kısa metin içeren, tercihen ünvan sözcükleri geçen diğer sol sütun
    $titleCol = -1; $bestT = 0;
    foreach ($leftCols as $c) {
        if ($c === $nameCol) continue;
        $n = 0; $kw = 0;
        foreach ($personRows as $r) {
            $t = sp_txt($V, $r, $c);
            if ($t === '' || sp_jslen($t) > 40 || preg_match('/^[0-9]+[.,]?[0-9]*$/D', $t)) continue;
            $n++;
            if (preg_match(SP_TITLE_RE, sp_lower($t))) $kw++;
        }
        $score = $n + $kw * 2;
        if ($n >= max(1, count($personRows) * 0.4) && $score > $bestT) { $bestT = $score; $titleCol = $c; }
    }
    $people = []; $entries = [];
    $seen = [];
    foreach ($personRows as $r) {
        $name = sp_txt($V, $r, $nameCol);
        $title = $titleCol >= 0 ? sp_txt($V, $r, $titleCol) : '';
        $key = sp_lower($name);
        if (!isset($seen[$key])) { $seen[$key] = true; $people[] = ['name' => $name, 'title' => $title]; }
        foreach ($hdr['colDay'] as $c => $day) {
            $t = sp_txt($V, $r, $c);
            if ($t === '') continue;
            $k = sp_classify_idx($t, $idx);
            if ($k) $entries[] = ['name' => $name, 'title' => $title, 'day' => $day, 'code' => $k['code'], 'raw' => $k['raw'], 'label' => $k['label'], 'kind' => $k['kind'], 'hours' => $k['hours'], 'start' => $k['start'], 'end' => $k['end']];
        }
    }
    if (!$people) return null;
    $dr = [$hdr['r'] => true];
    foreach ($personRows as $r) $dr[$r] = true;
    return ['layout' => 'grid', 'people' => $people, 'entries' => $entries, 'hdr' => $hdr, 'wdRow' => $wdRow, 'days' => $hdr['days'], 'nameCol' => $nameCol, 'titleCol' => $titleCol, 'dataRows' => $dr];
}

/* ------------------------------------------------------------------ */
/* Tarih satırları düzeni: her satır bir gün, sütunlar vardiya          */
/* ------------------------------------------------------------------ */
function sp_header_code(string $h, array $idx): array
{
    $t = sp_lower($h);
    if (preg_match('/([0-9]{1,2})(?:[:.][0-9][0-9])?[' . SP_WS . ']*[-–—][' . SP_WS . ']*([0-9]{1,2})(?:[:.][0-9][0-9])?/u', $h, $m)) {
        $k = sp_classify_idx((int)$m[1] . ' ' . (int)$m[2], $idx);
        if ($k && $k['hours'] !== null) return $k;
    }
    $code = null;
    if (preg_match('/gündüz|gunduz|sabah/u', $t)) $code = '8 16';
    elseif (preg_match('/gece|akşam|aksam/u', $t)) $code = '16 8';
    elseif (preg_match('/(?<![A-Za-z0-9_])24' . SP_WB_END . '|nöbet|nobet/u', $t)) $code = '8 8';
    if ($code) { $k = sp_classify_idx($code, $idx); if ($k) return $k; }
    // Saat bilgisi olmayan sütun (ör. "Sorumlu"): nöbet saati sayılmayan görev
    return ['code' => $h, 'label' => $h, 'start' => null, 'end' => null, 'hours' => null, 'kind' => 'role', 'raw' => $h];
}

function sp_split_names($t): array
{
    $parts = preg_split('/[' . SP_WS . ']*(?:[,;\/\r\n&+]|[' . SP_WS . ']-[' . SP_WS . ']|[' . SP_WS . ']ve[' . SP_WS . '])[' . SP_WS . ']*/iu', sp_str($t));
    $out = [];
    foreach ($parts as $x) {
        $x = sp_clean($x);
        if ($x === '' || !preg_match('/\p{L}{2,}/u', $x) || preg_match('/^[0-9]/', $x) || sp_jslen($x) > 60) continue;
        $o = preg_match('/^([^\n\r\x{2028}\x{2029}]*?)[' . SP_WS . ']*\(([^)]*)\)[' . SP_WS . ']*$/uD', $x, $m) ? ['name' => sp_clean($m[1]), 'title' => sp_clean($m[2])] : ['name' => $x, 'title' => ''];
        if ($o['name'] !== '' && preg_match('/\p{L}{2,}/u', $o['name']) && !preg_match('/^[-–—x]$/iuD', $o['name'])) $out[] = $o;
    }
    return $out;
}

function sp_date_rows(array $V, array $idx): ?array
{
    // Başlık satırı: 'Tarih' benzeri bir hücre + en az bir vardiya başlığı
    $hdrRow = -1; $dateCol = -1;
    foreach (array_slice(array_keys($V['rowsWith']), 0, 40) as $r) {
        $dc = -1; $shiftish = 0;
        for ($c = 0; $c < $V['nCols']; $c++) {
            $t = sp_lower(sp_txt($V, $r, $c));
            if ($t === '') continue;
            if ($dc < 0 && preg_match(SP_DATE_HDR, $t)) $dc = $c;
            elseif (preg_match(SP_SHIFT_HDR, $t)) $shiftish++;
        }
        if ($dc >= 0 && $shiftish >= 1) { $hdrRow = $r; $dateCol = $dc; break; }
    }
    if ($hdrRow < 0) return null;
    $cols = [];
    for ($c = 0; $c < $V['nCols']; $c++) {
        if ($c === $dateCol) continue;
        $h = sp_txt($V, $hdrRow, $c);
        if ($h === '' || preg_match(SP_SKIP_HDR, sp_lower($h)) || preg_match(SP_DATE_HDR, sp_lower($h))) continue;
        $cols[] = ['c' => $c, 'h' => $h, 'k' => sp_header_code($h, $idx)];
    }
    // Tarih hücreleri
    $raw = [];
    for ($r = $hdrRow + 1; $r < $V['nRows']; $r++) {
        if (!isset($V['rowsWith'][$r])) continue;
        $t = sp_txt($V, $r, $dateCol);
        if ($t === '') continue;
        if (preg_match(SP_STOP_RE, sp_lower($t))) break;
        $p = sp_date_parts($t);
        if ($p) { $raw[] = ['r' => $r, 'p' => $p]; continue; }
        if (preg_match('/^([0-9]{1,2})\.?(?:[' . SP_WS . ']+\p{L}+)?$/uD', $t, $m) && (int)$m[1] >= 1 && (int)$m[1] <= 31) $raw[] = ['r' => $r, 'p' => ['dayOnly' => (int)$m[1]]];
    }
    if (!$raw) return null;
    // gg.aa mı aa/gg mi: değişen ve 12'yi aşan alan gündür
    $full = array_values(array_filter($raw, static fn($x) => !empty($x['p']['y']) && empty($x['p']['iso'])));
    $dayFirst = true;
    if ($full) {
        $aBig = false; $bBig = false; $as = []; $bs = [];
        foreach ($full as $x) { if ($x['p']['a'] > 12) $aBig = true; if ($x['p']['b'] > 12) $bBig = true; $as[$x['p']['a']] = 1; $bs[$x['p']['b']] = 1; }
        if ($bBig && !$aBig) $dayFirst = false;
        elseif (!$aBig && !$bBig && count($bs) > count($as)) $dayFirst = false;
    }
    $rowsOut = [];
    foreach ($raw as $x) {
        $r = $x['r']; $p = $x['p'];
        if (!empty($p['dayOnly'])) $o = ['r' => $r, 'd' => $p['dayOnly'], 'mo' => 0, 'y' => 0];
        elseif (!empty($p['iso'])) $o = ['r' => $r, 'd' => $p['d'], 'mo' => $p['mo'], 'y' => $p['y']];
        else $o = $dayFirst ? ['r' => $r, 'd' => $p['a'], 'mo' => $p['b'], 'y' => $p['y']] : ['r' => $r, 'd' => $p['b'], 'mo' => $p['a'], 'y' => $p['y']];
        if ($o['d'] >= 1 && $o['d'] <= 31 && (!$o['mo'] || ($o['mo'] >= 1 && $o['mo'] <= 12))) $rowsOut[] = $o;
    }
    $people = []; $entries = []; $seen = [];
    foreach ($rowsOut as $row) {
        foreach ($cols as $col) {
            $k = $col['k'];
            foreach (sp_split_names(sp_raw_txt($V, $row['r'], $col['c'])) as $nt) {
                $key = sp_lower($nt['name']);
                if (!isset($seen[$key])) { $seen[$key] = true; $people[] = ['name' => $nt['name'], 'title' => $nt['title']]; }
                $entries[] = ['name' => $nt['name'], 'title' => $nt['title'], 'day' => $row['d'], '_mo' => $row['mo'], '_y' => $row['y'], 'code' => $k['code'], 'raw' => sp_txt($V, $row['r'], $col['c']),
                    'label' => $k['label'], 'kind' => $k['kind'], 'hours' => $k['hours'], 'start' => $k['start'], 'end' => $k['end']];
            }
        }
    }
    if (!$entries) return null;
    // En sık görülen ay/yıl
    $votes = [];
    foreach ($rowsOut as $x) if ($x['y'] && $x['mo']) { $k = $x['y'] * 100 + $x['mo']; $votes[$k] = ($votes[$k] ?? 0) + 1; }
    $ym = 0; $best = 0;
    foreach ($votes as $k => $n) if ($n > $best) { $best = $n; $ym = $k; }
    $dr = [];
    foreach ($rowsOut as $x) $dr[$x['r']] = true;
    return ['layout' => 'daterows', 'people' => $people, 'entries' => $entries, 'y' => $ym ? intdiv($ym, 100) : 0, 'mo' => $ym ? $ym % 100 : 0, 'days' => count($rowsOut), 'dataRows' => $dr];
}

/* ------------------------------------------------------------------ */
/* Ay/yıl tespiti                                                      */
/* ------------------------------------------------------------------ */
function sp_detect_from_sheet(array $V, array $skipRows): array
{
    $found = ['monthYear' => null, 'yearCell' => null, 'monthName' => 0, 'yearText' => 0, 'mmYYYY' => null];
    $keys = [];
    foreach ($V['ct'] as $k => $t) if ($t !== '') $keys[] = $k;
    sort($keys);
    foreach ($keys as $k) {
        $r = intdiv($k, 100000); $c = $k % 100000;
        if (isset($skipRows[$r])) continue; // başlık ve kişi satırları ('Nisan', 'Eylül' kişi adı olabilir)
        $t = sp_txt($V, $r, $c);
        $mo = sp_find_month($t);
        $y = sp_find_year($t);
        if ($mo && $y && !$found['monthYear']) $found['monthYear'] = ['y' => $y, 'mo' => $mo];
        if ($mo && !$found['monthName']) $found['monthName'] = $mo;
        if (preg_match('/^20[2-9][0-9]$/D', $t) && !$found['yearCell']) {
            // Yanındaki (sağ, sonra alt) ilk dolu hücrede 1–12 arası ay numarası
            $m = $V['mergeAt'][$k] ?? null;
            $monthNum = 0;
            $base = $m ? $m['c2'] : $c;
            for ($cc = $base + 1; $cc <= $base + 4 && !$monthNum; $cc++) {
                $tt = sp_txt($V, $r, $cc);
                if ($tt === '') continue;
                if (preg_match('/^(0?[1-9]|1[0-2])$/D', $tt)) $monthNum = (int)$tt;
                elseif (sp_find_month($tt)) $monthNum = sp_find_month($tt);
                break;
            }
            if (!$monthNum) {
                $tt = sp_txt($V, ($m ? $m['r2'] : $r) + 1, $c);
                if (preg_match('/^(0?[1-9]|1[0-2])$/D', $tt)) $monthNum = (int)$tt;
            }
            if (!$monthNum && $c > 0) {
                $tt = sp_txt($V, $r, $c - 1);
                if (preg_match('/^(0?[1-9]|1[0-2])$/D', $tt)) $monthNum = (int)$tt;
            }
            $found['yearCell'] = ['y' => (int)$t, 'mo' => $monthNum];
        }
        if ($y && !$found['yearText']) $found['yearText'] = $y;
        if (!$found['mmYYYY']) {
            // "11.2026" (önünde gün olmayan ay.yıl)
            $off = 0;
            while (preg_match('/(^|[^0-9])(0?[1-9]|1[0-2])[.\/-](20[2-9][0-9])(?![0-9])/u', $t, $mm, PREG_OFFSET_CAPTURE, $off)) {
                $at = $mm[2][1];
                if ($mm[1][0] !== '' && strpbrk($mm[1][0], './-') !== false && $at >= 2 && ctype_digit($t[$at - 2])) { $off = $mm[0][1] + 1; continue; }
                $found['mmYYYY'] = ['mo' => (int)$mm[2][0], 'y' => (int)$mm[3][0]];
                break;
            }
        }
    }
    return $found;
}

function sp_name_info($name): array
{
    $s = sp_str($name);
    $mo = sp_find_month($s);
    $y = sp_find_year(str_replace('_', ' ', $s));
    if (!$y && preg_match('/(?:^|[^0-9])(20[2-9][0-9])(?![0-9])/u', $s, $m)) $y = (int)$m[1];
    if (!$mo) {
        if (preg_match('/(?:^|[^0-9])(20[2-9][0-9])[-_.](0?[1-9]|1[0-2])(?![0-9])/u', $s, $m)) { $mo = (int)$m[2]; $y = (int)$m[1]; }
        elseif (preg_match('/(?:^|[^0-9])(0?[1-9]|1[0-2])[-_.](20[2-9][0-9])(?![0-9])/u', $s, $m)) { $mo = (int)$m[1]; $y = (int)$m[2]; }
    }
    return ['mo' => $mo, 'y' => $y];
}

function sp_parse_uploaded($s): array
{
    if (preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})/', sp_str($s), $m)) return ['y' => (int)$m[1], 'mo' => (int)$m[2]];
    return ['y' => (int)date('Y'), 'mo' => (int)date('n')];
}

/** Yıl bilinmiyorsa yükleme tarihine en yakın mantıklı yıl (Aralık'ta yüklenen Ocak listesi -> ertesi yıl) */
function sp_year_near(int $mo, array $up): int
{
    if ($up['mo'] === 12 && $mo <= 2) return $up['y'] + 1;
    if ($up['mo'] <= 2 && $mo >= 11) return $up['y'] - 1;
    return $up['y'];
}

function sp_month_name(int $m): string
{
    return SP_TR_MONTHS[$m - 1] ?? 'undefined';
}

function sp_resolve_period(array $V, array $res, array $opts, string $sheetName): array
{
    $warnings = [];
    $up = sp_parse_uploaded($opts['uploadedAt'] ?? '');
    $year = 0; $month = 0; $src = ''; $ysrc = '';
    $set = static function (int $y, int $mo, string $s) use (&$year, &$month, &$src, &$ysrc) {
        if (!$month && $mo) { $month = $mo; $src = $s; }
        if (!$year && $y && (!$mo || $mo === $month)) { $year = $y; $ysrc = $s; }
    };
    if (!empty($opts['month'])) { $month = (int)$opts['month']; $src = 'opts'; }
    if (!empty($opts['year'])) { $year = (int)$opts['year']; $ysrc = 'opts'; }
    if ($res['layout'] === 'grid' && $res['hdr']['mo']) $set((int)$res['hdr']['y'], (int)$res['hdr']['mo'], 'header-dates');
    if ($res['layout'] === 'daterows' && $res['mo']) $set((int)$res['y'], (int)$res['mo'], 'dates');
    $f = sp_detect_from_sheet($V, $res['dataRows'] ?? []);
    if ($f['monthYear']) $set($f['monthYear']['y'], $f['monthYear']['mo'], 'title');
    if ($f['yearCell'] && $f['yearCell']['mo']) $set($f['yearCell']['y'], $f['yearCell']['mo'], 'period-cells');
    if ($f['monthName']) $set(0, $f['monthName'], 'month-name');
    if ($f['mmYYYY']) $set($f['mmYYYY']['y'], $f['mmYYYY']['mo'], 'mm.yyyy');
    $sn = sp_name_info($sheetName);
    if ($sn['mo']) $set($sn['y'], $sn['mo'], 'sheet-name');
    $fileName = sp_str($opts['fileName'] ?? '');
    $fn = sp_name_info($fileName !== '' ? preg_replace('/\.[a-z0-9]+$/iD', '', $fileName) : '');
    if ($fn['mo']) $set($fn['y'], $fn['mo'], 'file-name');
    // Yalnız yıl bilgisi
    if ($month && !$year) {
        if ($f['yearCell']) { $year = $f['yearCell']['y']; $ysrc = 'year-cell'; }
        elseif ($f['yearText']) { $year = $f['yearText']; $ysrc = 'year-text'; }
        elseif ($sn['y']) { $year = $sn['y']; $ysrc = 'sheet-name'; }
        elseif ($fn['y']) { $year = $fn['y']; $ysrc = 'file-name'; }
    }
    // Haftanın günü satırı: ay/yılı doğrula veya tamamla
    $wd = $res['layout'] === 'grid' ? $res['wdRow'] : null;
    $fits = static fn(int $y, int $mo) => !$wd || sp_dow($y, $mo, 1) === $wd['w0'];
    $dayCountOk = static fn(int $y, int $mo) => $res['layout'] !== 'grid' || sp_days_in($y, $mo) >= $res['days'];
    if (!$month && $wd) {
        // Ay bulunamadı: yükleme ayı, sonraki ay, önceki ay sırasıyla haftanın günü ve gün sayısıyla uyanı seç
        foreach ([0, 1, -1, 2] as $off) {
            [$y, $mo] = sp_norm_ym($up['y'], $up['mo'] - 1 + $off);
            if ($fits($y, $mo) && sp_days_in($y, $mo) === $res['days']) { $month = $mo; $year = $y; $src = $ysrc = 'weekdays'; break; }
        }
        if ($month) $warnings[] = 'Ay bilgisi dosyada yazmıyor; gün adlarına göre ' . sp_month_name($month) . ' ' . $year . ' kabul edildi';
    }
    if (!$month) {
        $month = $up['mo']; $year = $year ?: $up['y']; $src = 'uploadedAt'; $ysrc = $ysrc ?: 'uploadedAt';
        $warnings[] = !empty($opts['uploadedAt']) ? 'Ay bilgisi dosyadan bulunamadı, yükleme tarihi kullanıldı' : 'Ay bilgisi dosyadan bulunamadı, bugünün tarihi kullanıldı';
    }
    if (!$year) {
        if ($wd) {
            $base = sp_year_near($month, $up);
            foreach ([$base, $base + 1, $base - 1, $base + 2, $base - 2] as $y) if ($fits($y, $month)) { $year = $y; $ysrc = 'weekdays'; break; }
        }
        if (!$year) { $year = sp_year_near($month, $up); $ysrc = 'uploadedAt'; $warnings[] = 'Yıl bilgisi dosyadan bulunamadı, yükleme tarihine göre ' . $year . ' kabul edildi'; }
    } elseif ($wd && !$fits($year, $month) && $ysrc !== 'opts') {
        $warnings[] = 'Gün adları ' . sp_month_name($month) . ' ' . $year . ' takvimiyle uyuşmuyor; listeyi kontrol edin';
    }
    if ($res['layout'] === 'grid' && !$dayCountOk($year, $month)) $warnings[] = 'Listede ' . $res['days'] . ' gün var, ' . sp_month_name($month) . ' ' . $year . ' ise ' . sp_days_in($year, $month) . ' gün';
    if ($src === 'file-name') $warnings[] = 'Ay bilgisi dosya adından alındı';
    elseif ($src === 'sheet-name') $warnings[] = 'Ay bilgisi sayfa adından alındı';
    return ['year' => $year, 'month' => $month, 'warnings' => $warnings, 'monthSource' => $src, 'yearSource' => $ysrc];
}

/* ------------------------------------------------------------------ */
/* Ana fonksiyon                                                       */
/* ------------------------------------------------------------------ */
function sp_empty_result(): array
{
    return ['ok' => false, 'year' => null, 'month' => null, 'layout' => null, 'sheetName' => null, 'people' => [], 'entries' => [], 'warnings' => [], 'monthSource' => null];
}

/** Tek sayfayı çözer; nöbet listesi değilse null */
function sp_parse_sheet(array $sh, array $idx, array $opts, bool $other = false): ?array
{
    if (empty($sh['cells'])) return null;
    $V = sp_sheet_view($sh);
    try { $res = sp_grid($V, $idx) ?? sp_date_rows($V, $idx); } catch (Throwable $e) { $res = null; }
    if (!$res) return null;
    $name = sp_str($sh['name'] ?? '');
    $per = sp_resolve_period($V, $res, $opts, $name);
    $year = $per['year']; $month = $per['month'];
    $dim = sp_days_in($year, $month);
    $entries = [];
    foreach ($res['entries'] as $e) {
        $y = $year; $mo = $month;
        if (!empty($e['_y']) && !empty($e['_mo'])) { $y = $e['_y']; $mo = $e['_mo']; }
        if ($e['day'] > sp_days_in($y, $mo)) continue;
        $entries[] = ['name' => $e['name'], 'title' => $e['title'], 'day' => $e['day'], 'date' => sp_iso($y, $mo, $e['day']), 'code' => $e['code'], 'raw' => $e['raw'], 'label' => $e['label'], 'kind' => $e['kind'], 'hours' => $e['hours'], 'start' => $e['start'], 'end' => $e['end']];
    }
    usort($entries, static fn($a, $b) => strcmp($a['date'], $b['date'])); // kararlı sıralama (PHP 8)
    $warnings = $per['warnings'];
    if ($other) $warnings[] = 'Nöbetler "' . $name . '" sayfasından okundu';
    if ($res['layout'] === 'grid' && $res['days'] > $dim) $warnings[] = $dim . '. günden sonraki sütunlar yok sayıldı';
    return ['ok' => true, 'year' => $year, 'month' => $month, 'layout' => $res['layout'], 'sheetName' => $name, 'people' => $res['people'], 'entries' => $entries, 'warnings' => $warnings, 'monthSource' => $per['monthSource']];
}

/** Model sayfalarından görünenler (tarayıcı modeli gizli sayfaları içermez) ve etkin sayfanın bu listedeki yeri */
function sp_visible(array $model): array
{
    $vis = [];
    $act = 0;
    $active = (int)($model['active'] ?? 0);
    foreach (array_values((array)($model['sheets'] ?? [])) as $i => $sh) {
        if (!is_array($sh) || !empty($sh['hidden'])) continue;
        if ($i === $active) $act = count($vis);
        $vis[] = $sh;
    }
    if ($active >= count((array)($model['sheets'] ?? []))) $act = count($vis) - 1; // JS: Math.min(active, length - 1)
    return [$vis, $act];
}

/** extractShifts: önce etkin sayfa, sonra diğer görünür sayfalar */
function sp_extract(array $model, array $opts = []): array
{
    $empty = sp_empty_result();
    [$sheets, $act] = sp_visible($model);
    if (!$sheets) { $empty['warnings'][] = 'Dosyada sayfa yok'; return $empty; }
    $idx = sp_dict_index(!empty($opts['dict']) && is_array($opts['dict']) ? $opts['dict'] : null);
    $act = min(max(0, $act), count($sheets) - 1);
    $order = [$act];
    foreach ($sheets as $i => $_) if ($i !== $act) $order[] = $i;
    foreach ($order as $i) {
        $out = sp_parse_sheet($sheets[$i], $idx, $opts, $i !== $act);
        if ($out) return $out;
    }
    $empty['warnings'][] = 'Bu dosyada nöbet listesi biçimi tanınamadı';
    return $empty;
}

/** Yalnızca $index. sayfayı çözer (model['sheets'] dizini; gizli sayfa da olabilir). Başka sekmeye geçmez. */
function sp_extract_sheet(array $model, int $index, array $opts = []): array
{
    $empty = sp_empty_result();
    $sheets = array_values((array)($model['sheets'] ?? []));
    if (!isset($sheets[$index]) || !is_array($sheets[$index])) { $empty['warnings'][] = 'Dosyada sayfa yok'; return $empty; }
    $idx = sp_dict_index(!empty($opts['dict']) && is_array($opts['dict']) ? $opts['dict'] : null);
    $out = sp_parse_sheet($sheets[$index], $idx, $opts);
    if ($out) return $out;
    $empty['warnings'][] = 'Bu dosyada nöbet listesi biçimi tanınamadı';
    return $empty;
}

/* ------------------------------------------------------------------ */
/* İsim eşleştirme ve aylık özet                                       */
/* ------------------------------------------------------------------ */
function sp_name_tokens($s): array
{
    $t = preg_replace('/[.,;:()\'’"-]+/u', ' ', sp_fold($s));
    return array_values(array_filter(preg_split('/[' . SP_WS . ']+/u', $t), static fn($x) => $x !== '' && !isset(SP_HONORIFIC[$x])));
}

/** Listedeki isim ile kullanıcı adı aynı kişi mi (Türkçe harf/büyüklük duyarsız; ikinci ad/soyad eksik olabilir) */
function sp_match_person_name($rosterName, $userName): bool
{
    $a = sp_name_tokens($rosterName); $b = sp_name_tokens($userName);
    if (!$a || !$b) return false;
    if (implode(' ', $a) === implode(' ', $b)) return true;
    [$s, $l] = count($a) <= count($b) ? [$a, $b] : [$b, $a];
    if (count($s) < 2) return false;
    $pool = [];
    foreach ($l as $t) $pool[$t] = ($pool[$t] ?? 0) + 1;
    foreach ($s as $t) { $n = $pool[$t] ?? 0; if (!$n) return false; $pool[$t] = $n - 1; }
    // Ad ilk, soyad son kelime olarak tutmalı (ör. 'Ceren Yılmaz' ~ 'Ceren Sibel Özel Yılmaz')
    return $s[0] === $l[0] || $s[count($s) - 1] === $l[count($l) - 1];
}

/** Bir kişinin aylık özeti. $entries: o kişiye ait kayıtlar. */
function sp_summarize_month(array $entries, int $year, int $month): array
{
    $list = array_filter($entries, static function ($e) use ($year, $month) {
        if (!$e || empty($e['date'])) return true;
        $p = explode('-', (string)$e['date']);
        return (int)($p[0] ?? 0) === $year && (int)($p[1] ?? 0) === $month;
    });
    $days = sp_days_in($year, $month);
    $weekdays = 0;
    for ($d = 1; $d <= $days; $d++) { $w = sp_dow($year, $month, $d); if ($w !== 0 && $w !== 6) $weekdays++; }
    $shifts = 0; $hours = 0;
    $leave = [];
    foreach ($list as $e) {
        if (!$e) continue;
        $kind = $e['kind'] ?? null;
        if ($kind === 'shift') { $shifts++; $h = $e['hours'] ?? null; $hours += is_numeric($h) ? $h + 0 : 0; }
        elseif ($kind === 'leave') {
            $day = !empty($e['day']) ? (int)$e['day'] : (int)substr((string)($e['date'] ?? ''), 8, 2);
            $w = sp_dow($year, $month, $day);
            if ($day && $w !== 0 && $w !== 6) $leave[$day] = true;
        }
    }
    $requiredHours = $weekdays * 8 - count($leave) * 8;
    return ['shifts' => $shifts, 'hours' => $hours, 'leaveDays' => count($leave), 'requiredHours' => $requiredHours, 'overtime' => $hours - $requiredHours];
}
