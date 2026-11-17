<?php
/**
 * dupcii — bağımlılıksız xlsx okuyucu (ZipArchive + XMLReader)
 *
 *   xlsx_read($path, $maxCells)  -> ['active' => int, 'sheets' => [['name', 'hidden', 'cells', 'merges', 'nRows', 'nCols'], ...]]
 *   xlsx_model_from_grid($tabs)  -> aynı model; Google Apps Script getDisplayValues() ızgarasından
 *
 * Hücre metinleri tarayıcıdaki görüntüleyicinin (ExcelJS + viewer.js modelFromExcelJS/formatValue) ürettiğiyle
 * aynıdır; shiftparse.php (sp_extract) bu modeli okur. Hücre anahtarı: satır * 100000 + sütun (0 tabanlı).
 * Birleşik hücrelerin bağlı parçaları ve boş hücreler modele girmez (tarayıcıdaki gibi).
 */
declare(strict_types=1);

const XLSX_TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const XLSX_TR_MONTHS_S = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const XLSX_TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const XLSX_TR_DAYS_S = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
/** ExcelJS'in yerleşik sayı biçimleri (numFmtId -> biçim kodu; tabloda olmayan kimlik = biçimsiz) */
const XLSX_BUILTIN_FMT = [
    1 => '0', 2 => '0.00', 3 => '#,##0', 4 => '#,##0.00', 9 => '0%', 10 => '0.00%', 11 => '0.00E+00', 12 => '# ?/?', 13 => '# ??/??',
    14 => 'mm-dd-yy', 15 => 'd-mmm-yy', 16 => 'd-mmm', 17 => 'mmm-yy', 18 => 'h:mm AM/PM', 19 => 'h:mm:ss AM/PM', 20 => 'h:mm', 21 => 'h:mm:ss',
    22 => 'm/d/yy "h":mm', 37 => '#,##0 ;(#,##0)', 38 => '#,##0 ;[Red](#,##0)', 39 => '#,##0.00 ;(#,##0.00)', 40 => '#,##0.00 ;[Red](#,##0.00)',
    45 => 'mm:ss', 46 => '[h]:mm:ss', 47 => 'mmss.0', 48 => '##0.0E+0', 49 => '@',
];
/** JavaScript'in \s kümesi (PCRE karakter sınıfı içinde kullanılır) */
const XLSX_WS = '\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';
const XLSX_EPOCH_MS = -2209161600000; // Date.UTC(1899, 11, 30)

/* =================================================================== */
/* Dosya okuma                                                          */
/* =================================================================== */

function xlsx_read(string $path, int $maxCells = 500000): array
{
    if (!is_file($path) || !is_readable($path)) throw new RuntimeException('Excel dosyası bulunamadı.');
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::RDONLY) !== true) throw new RuntimeException('Excel dosyası açılamadı: dosya bozuk ya da xlsx biçiminde değil.');
    $prevErr = libxml_use_internal_errors(true);
    try {
        // Ana belge: _rels/.rels -> officeDocument (genelde xl/workbook.xml)
        $wbPath = 'xl/workbook.xml';
        $root = xlsx_zip_get($zip, '_rels/.rels');
        if ($root !== null) {
            foreach (xlsx_rels($root, '') as $rel) {
                if (preg_match('~/officeDocument$~', $rel['type'])) { $wbPath = $rel['target']; break; }
            }
        }
        $wbXml = xlsx_zip_get($zip, $wbPath);
        if ($wbXml === null) throw new RuntimeException('Excel dosyası okunamadı: çalışma kitabı bölümü yok (dosya bozuk olabilir).');
        $wbDir = str_contains($wbPath, '/') ? substr($wbPath, 0, strrpos($wbPath, '/') + 1) : '';
        $relsXml = xlsx_zip_get($zip, $wbDir . '_rels/' . basename($wbPath) . '.rels');
        $rels = [];
        foreach ($relsXml !== null ? xlsx_rels($relsXml, $wbDir) : [] as $rel) $rels[$rel['id']] = $rel;

        // workbook.xml: sayfa sırası, gizli sayfalar, etkin sekme, 1904 tarih sistemi
        $defs = [];
        $activeTab = null;
        $date1904 = false;
        $xr = xlsx_xr($wbXml);
        while (xlsx_next($xr)) {
            if ($xr->nodeType !== XMLReader::ELEMENT) continue;
            $ln = $xr->localName;
            if ($ln === 'sheet') {
                $a = xlsx_attrs($xr);
                $defs[] = ['name' => xlsx_xml_decode($a['name'] ?? ''), 'state' => $a['state'] ?? 'visible', 'rid' => $a['r:id'] ?? ($a['id'] ?? '')];
            } elseif ($ln === 'workbookView' && $activeTab === null) {
                $v = $xr->getAttribute('activeTab');
                $activeTab = $v !== null && preg_match('/^\s*[+-]?\d/', $v) ? (int)$v : -1;
            } elseif ($ln === 'workbookPr') {
                $date1904 = $xr->getAttribute('date1904') === '1';
            }
        }
        $xr->close();

        $ss = [];
        $styles = ['xf' => [], 'fmt' => []];
        foreach ($rels as $rel) {
            if (preg_match('~/sharedStrings$~', $rel['type'])) { $x = xlsx_zip_get($zip, $rel['target']); if ($x !== null) $ss = xlsx_shared_strings($x); }
            elseif (preg_match('~/styles$~', $rel['type'])) { $x = xlsx_zip_get($zip, $rel['target']); if ($x !== null) $styles = xlsx_styles($x); }
        }

        $ctx = ['ss' => $ss, 'xf' => $styles['xf'], 'fmt' => $styles['fmt'], 'date1904' => $date1904, 'budget' => $maxCells, 'fmtCache' => []];
        $sheets = [];
        foreach ($defs as $d) {
            $rel = $rels[$d['rid']] ?? null;
            // Grafik sayfaları ve dosyada bulunmayan sayfalar atlanır (ExcelJS de atlıyor)
            if (!$rel || !preg_match('~/worksheet$~', $rel['type'])) continue;
            $xr = xlsx_zip_reader($zip, $path, $rel['target']);
            if ($xr === null) continue;
            $sh = xlsx_sheet($xr, $ctx);
            $sheets[] = ['name' => $d['name'], 'hidden' => $d['state'] === 'hidden' || $d['state'] === 'veryHidden'] + $sh;
        }
        // Etkin sekme dizini, grafik sayfaları hariç listeye göre (ExcelJS: wb.worksheets[activeTab])
        $active = $activeTab !== null && $activeTab >= 0 && $activeTab < count($sheets) ? $activeTab : 0;
        return ['active' => $active, 'sheets' => $sheets];
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($prevErr);
        $zip->close();
    }
}

function xlsx_zip_get(ZipArchive $zip, string $name): ?string
{
    $name = ltrim($name, '/');
    $i = $zip->locateName($name);
    if ($i === false) $i = $zip->locateName($name, ZipArchive::FL_NOCASE);
    if ($i === false) return null;
    $s = $zip->getFromIndex($i);
    if ($s === false) throw new RuntimeException('Excel dosyası okunamadı: sıkıştırılmış bölüm açılamadı (dosya bozuk olabilir).');
    return $s;
}

/** Sayfa XML'i için okuyucu: büyük bölümler belleğe alınmadan zip içinden akış hâlinde okunur */
function xlsx_zip_reader(ZipArchive $zip, string $path, string $name): ?XMLReader
{
    $name = ltrim($name, '/');
    $i = $zip->locateName($name);
    if ($i === false) $i = $zip->locateName($name, ZipArchive::FL_NOCASE);
    if ($i === false) return null;
    $st = $zip->statIndex($i);
    $real = realpath($path);
    if ($st && $st['size'] > 4 * 1048576 && $real !== false && !str_contains($real, '#')) {
        $xr = new XMLReader();
        if (@$xr->open('zip://' . $real . '#' . $st['name'], null, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) return $xr;
    }
    $s = $zip->getFromIndex($i);
    if ($s === false) throw new RuntimeException('Excel dosyası okunamadı: sıkıştırılmış bölüm açılamadı (dosya bozuk olabilir).');
    return xlsx_xr($s);
}

function xlsx_xr(string $xml): XMLReader
{
    $xr = new XMLReader();
    if (!$xr->XML($xml, null, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) throw new RuntimeException('Excel dosyası okunamadı: XML bölümü bozuk.');
    return $xr;
}

/** XMLReader::read + hata denetimi (bozuk XML'de istisna) */
function xlsx_next(XMLReader $xr): bool
{
    if ($xr->read()) return true;
    foreach (libxml_get_errors() as $e) {
        if ($e->level >= LIBXML_ERR_ERROR) { libxml_clear_errors(); throw new RuntimeException('Excel dosyası okunamadı: XML bölümü bozuk (satır ' . $e->line . ').'); }
    }
    return false;
}

function xlsx_attrs(XMLReader $xr): array
{
    $a = [];
    if ($xr->hasAttributes) {
        while ($xr->moveToNextAttribute()) { $a[$xr->name] = $xr->value; if ($xr->name !== $xr->localName) $a[$xr->localName] ??= $xr->value; }
        $xr->moveToElement();
    }
    return $a;
}

/** İlişki dosyası -> [['id', 'type', 'target'(zip yolu)], ...] */
function xlsx_rels(string $xml, string $baseDir): array
{
    $out = [];
    $xr = xlsx_xr($xml);
    while (xlsx_next($xr)) {
        if ($xr->nodeType !== XMLReader::ELEMENT || $xr->localName !== 'Relationship') continue;
        $a = xlsx_attrs($xr);
        if (($a['TargetMode'] ?? '') === 'External') continue;
        $t = str_replace('\\', '/', trim($a['Target'] ?? ''));
        $t = $t !== '' && $t[0] === '/' ? substr($t, 1) : $baseDir . $t;
        $parts = [];
        foreach (explode('/', $t) as $p) { if ($p === '..') array_pop($parts); elseif ($p !== '.' && $p !== '') $parts[] = $p; }
        $out[] = ['id' => $a['Id'] ?? '', 'type' => $a['Type'] ?? '', 'target' => implode('/', $parts)];
    }
    $xr->close();
    return $out;
}

/** ExcelJS xmlDecode (bazı alanlara ikinci kez uygulanıyor) */
function xlsx_xml_decode(string $s): string
{
    if (!str_contains($s, '&')) return $s;
    return preg_replace_callback('/&([a-z]*);/', static fn($m) => ['&lt;' => '<', '&gt;' => '>', '&amp;' => '&', '&apos;' => "'", '&quot;' => '"'][$m[0]] ?? $m[0], $s);
}

/** ExcelJS metin çözümü: _x000D_ gibi kaçışlar */
function xlsx_unescape(string $s): string
{
    if (!str_contains($s, '_x')) return $s;
    return preg_replace_callback('/_x([0-9A-F]{4})_/', static function ($m) {
        $cp = hexdec($m[1]);
        return $cp >= 0xD800 && $cp <= 0xDFFF ? "\u{FFFD}" : mb_chr($cp, 'UTF-8');
    }, $s);
}

function xlsx_is_text(int $nt): bool
{
    return $nt === XMLReader::TEXT || $nt === XMLReader::CDATA || $nt === XMLReader::WHITESPACE || $nt === XMLReader::SIGNIFICANT_WHITESPACE;
}

/** sharedStrings.xml -> düz metin listesi (zengin metin parçaları birleştirilir, okunuş (rPh) yok sayılır) */
function xlsx_shared_strings(string $xml): array
{
    $ss = [];
    $xr = xlsx_xr($xml);
    $inSi = false; $inR = false; $inPh = false; $inT = false;
    $plain = null; $runs = null; $runText = ''; $buf = '';
    while (xlsx_next($xr)) {
        $nt = $xr->nodeType;
        if ($nt === XMLReader::ELEMENT) {
            $ln = $xr->localName;
            if ($ln === 'si') {
                if ($xr->isEmptyElement) { $ss[] = ''; continue; }
                $inSi = true; $plain = null; $runs = null;
            } elseif (!$inSi) {
                continue;
            } elseif ($ln === 'r') {
                $runs ??= [];
                if ($xr->isEmptyElement) $runs[] = ''; else { $inR = true; $runText = ''; }
            } elseif ($ln === 'rPh') {
                if (!$xr->isEmptyElement) $inPh = true;
            } elseif ($ln === 't') {
                if ($xr->isEmptyElement) { if (!$inPh) { if ($inR) $runText = ''; else $plain = ''; } }
                else { $inT = true; $buf = ''; }
            }
        } elseif ($nt === XMLReader::END_ELEMENT) {
            $ln = $xr->localName;
            if ($ln === 't' && $inT) {
                $inT = false;
                if (!$inPh) { if ($inR) $runText = xlsx_unescape($buf); else $plain = xlsx_unescape($buf); }
            } elseif ($ln === 'r' && $inR) { $runs[] = $runText; $inR = false; }
            elseif ($ln === 'rPh') $inPh = false;
            elseif ($ln === 'si' && $inSi) { $ss[] = $runs !== null ? implode('', $runs) : ($plain ?? ''); $inSi = false; }
        } elseif ($inT && xlsx_is_text($nt)) {
            $buf .= $xr->value;
        }
    }
    $xr->close();
    return $ss;
}

/** styles.xml -> hücre biçimi dizini başına sayı biçimi kimliği ve özel biçimler */
function xlsx_styles(string $xml): array
{
    $xf = []; $fmt = [];
    $xr = xlsx_xr($xml);
    $inXfs = false;
    while (xlsx_next($xr)) {
        $nt = $xr->nodeType;
        if ($nt === XMLReader::ELEMENT) {
            $ln = $xr->localName;
            if ($ln === 'numFmt') {
                $id = $xr->getAttribute('numFmtId');
                if ($id !== null) $fmt[(int)$id] = (string)$xr->getAttribute('formatCode');
            } elseif ($ln === 'cellXfs') {
                if (!$xr->isEmptyElement) $inXfs = true;
            } elseif ($ln === 'xf' && $inXfs) {
                $xf[] = (int)$xr->getAttribute('numFmtId');
            }
        } elseif ($nt === XMLReader::END_ELEMENT && $xr->localName === 'cellXfs') {
            $inXfs = false;
        }
    }
    $xr->close();
    return ['xf' => $xf, 'fmt' => $fmt];
}

/** 'B3' -> [2, 1]; 'B3:D4' -> birleşim */
function xlsx_ref(string $a): ?array
{
    if (!preg_match('/^\$?([A-Za-z]{1,3})\$?(\d+)$/', trim($a), $m)) return null;
    $c = 0;
    foreach (str_split(strtoupper($m[1])) as $ch) $c = $c * 26 + (ord($ch) - 64);
    return [(int)$m[2] - 1, $c - 1];
}

/** Bir sayfa XML'ini akış hâlinde okur */
function xlsx_sheet(XMLReader $xr, array &$ctx): array
{
    $cells = [];
    $merges = [];
    $truncated = false;
    $row = -1; $col = -1;
    while (xlsx_next($xr)) {
        if ($xr->nodeType !== XMLReader::ELEMENT) continue;
        $ln = $xr->localName;
        if ($ln === 'c') {
            $ref = $xr->getAttribute('r');
            $pos = $ref !== null ? xlsx_ref($ref) : null;
            if ($pos) { [$row, $col] = $pos; } else { $col++; if ($row < 0) $row = 0; }
            $t = $xr->getAttribute('t') ?? '';
            $s = (int)$xr->getAttribute('s');
            if ($xr->isEmptyElement) continue;
            $cell = xlsx_cell($xr, $t, $s, $ctx);
            if ($cell === null) continue;
            if ($ctx['budget'] <= 0) { $truncated = true; break; } // hücre sınırı aşıldı: sayfanın kalanı okunmaz
            $ctx['budget']--;
            $cells[$row * 100000 + $col] = $cell;
        } elseif ($ln === 'row') {
            $r = $xr->getAttribute('r');
            $row = $r !== null && ctype_digit($r) ? (int)$r - 1 : $row + 1;
            $col = -1;
        } elseif ($ln === 'mergeCell') {
            $ref = (string)$xr->getAttribute('ref');
            $p = explode(':', $ref);
            $a = xlsx_ref($p[0]);
            $b = isset($p[1]) ? xlsx_ref($p[1]) : $a;
            if ($a && $b) $merges[] = ['r1' => min($a[0], $b[0]), 'c1' => min($a[1], $b[1]), 'r2' => max($a[0], $b[0]), 'c2' => max($a[1], $b[1])];
        }
    }
    $xr->close();
    return xlsx_finish_sheet($cells, $merges) + ['truncated' => $truncated];
}

/** Birleşik hücrelerin bağlı parçalarını atar, boyutları hesaplar */
function xlsx_finish_sheet(array $cells, array $merges): array
{
    $maxR = -1; $maxC = -1;
    foreach ($merges as $m) {
        $area = ($m['r2'] - $m['r1'] + 1) * ($m['c2'] - $m['c1'] + 1);
        if ($area > 1) {
            if ($area <= 4 * count($cells) + 64) {
                for ($r = $m['r1']; $r <= $m['r2']; $r++) for ($c = $m['c1']; $c <= $m['c2']; $c++) if ($r !== $m['r1'] || $c !== $m['c1']) unset($cells[$r * 100000 + $c]);
            } else {
                foreach ($cells as $k => $_) {
                    $r = intdiv($k, 100000); $c = $k % 100000;
                    if ($r >= $m['r1'] && $r <= $m['r2'] && $c >= $m['c1'] && $c <= $m['c2'] && ($r !== $m['r1'] || $c !== $m['c1'])) unset($cells[$k]);
                }
            }
        }
        $maxR = max($maxR, $m['r2']); $maxC = max($maxC, $m['c2']);
    }
    ksort($cells);
    foreach ($cells as $k => $_) { $maxR = max($maxR, intdiv($k, 100000)); $maxC = max($maxC, $k % 100000); }
    return ['cells' => $cells, 'merges' => $merges, 'nRows' => $maxR + 1, 'nCols' => $maxC + 1];
}

/** <c> öğesini okur (XMLReader öğenin üzerinde), ExcelJS + viewer.js kurallarıyla metne çevirir. Boşsa null. */
function xlsx_cell(XMLReader $xr, string $t, int $s, array &$ctx): ?array
{
    $depth = $xr->depth;
    $f = null; $fShare = ''; $val = null; $rich = null;
    $node = ''; $inRun = false; $runInT = false; $runText = ''; $runBuf = '';
    while (xlsx_next($xr)) {
        $nt = $xr->nodeType;
        if ($nt === XMLReader::END_ELEMENT) {
            if ($xr->depth <= $depth) break;
            $ln = $xr->localName;
            if ($inRun) {
                if ($ln === 't' && $runInT) { $runText = xlsx_unescape($runBuf); $runInT = false; }
                elseif ($ln === 'r') { $rich[] = $runText; $inRun = false; }
                continue;
            }
            if ($ln === 'f' || $ln === 'v' || $ln === 't' || $ln === 'is') $node = '';
        } elseif ($nt === XMLReader::ELEMENT) {
            $ln = $xr->localName;
            $empty = $xr->isEmptyElement;
            if ($inRun) {
                if ($ln === 't') { if ($empty) $runText = ''; else { $runInT = true; $runBuf = ''; } }
                continue;
            }
            if ($ln === 'f') { $f ??= ''; $fShare = (string)$xr->getAttribute('t'); $node = $empty ? '' : 'f'; }
            elseif ($ln === 'v' || $ln === 't') $node = $empty ? '' : $ln;
            elseif ($ln === 'r') { $rich ??= []; if ($empty) $rich[] = ''; else { $inRun = true; $runText = ''; } }
        } elseif (xlsx_is_text($nt)) {
            if ($inRun) { if ($runInT) $runBuf .= $xr->value; }
            elseif ($node === 'f') $f .= $xr->value;
            elseif (($node === 'v' || $node === 't') && $rich === null) $val = ($val ?? '') . $xr->value;
        }
    }

    // ExcelJS: stil 0 ise biçim yok; biçim kimliği 0 ise biçim yok
    $fmt = null;
    if ($s > 0 && isset($ctx['xf'][$s])) {
        $id = $ctx['xf'][$s];
        if ($id) $fmt = $ctx['fmt'][$id] ?? (XLSX_BUILTIN_FMT[$id] ?? null);
    }
    $isFormula = ($f !== null && $f !== '') || $fShare !== '';
    if ($isFormula) {
        if ($rich !== null || $val === null || $val === '') return null; // sonuç yok
        if ($t === 'str') $res = xlsx_xml_decode($val);
        elseif ($t === 'b') $res = xlsx_js_parse_int($val) !== 0;
        elseif ($t === 'e') $res = ['error' => $val];
        else $res = xlsx_js_parse_float($val);
        if ($fmt !== null && xlsx_ej_is_date_fmt($fmt)) {
            // ExcelJS biçim tarih ise sonucu (metin olsa bile) tarihe çeviriyor
            $num = is_array($res) ? NAN : (is_bool($res) ? ($res ? 1.0 : 0.0) : (is_string($res) ? xlsx_js_number($res) : $res));
            return xlsx_cell_out(xlsx_date_text(xlsx_ej_date($num, $ctx['date1904']), $fmt, $ctx), null);
        }
        // ExcelJS formül değerini kopyalarken boş sayılan sonuçları (0, false, NaN) atıyor: hücre boş görünür
        if ($res === false || (is_float($res) && ($res == 0 || is_nan($res)))) return null;
        return xlsx_value_cell($res, $fmt, $ctx);
    }
    if ($rich !== null) return xlsx_cell_out(implode('', $rich), null);
    if ($val === null) return null;
    switch ($t) {
        case 's':
            $i = xlsx_js_parse_int($val);
            $str = $i !== null && isset($ctx['ss'][$i]) ? $ctx['ss'][$i] : '';
            return xlsx_cell_out($str, $str);
        case 'str':
            $str = xlsx_xml_decode($val);
            return xlsx_cell_out($str, $str);
        case 'inlineStr':
            return xlsx_cell_out($val, $val);
        case 'b':
            $b = xlsx_js_parse_int($val) !== 0;
            return xlsx_cell_out($b ? 'DOĞRU' : 'YANLIŞ', $b);
        case 'e':
            return xlsx_cell_out($val, null);
        default:
            $n = xlsx_js_parse_float($val);
            if ($fmt !== null && xlsx_ej_is_date_fmt($fmt)) return xlsx_cell_out(xlsx_date_text(xlsx_ej_date($n, $ctx['date1904']), $fmt, $ctx), null);
            return xlsx_value_cell($n, $fmt, $ctx);
    }
}

function xlsx_cell_out(string $text, $v): ?array
{
    return $text === '' ? null : ['text' => $text, 'v' => $v];
}

/** Formül sonucu / sayı -> hücre (viewer.js formatValue) */
function xlsx_value_cell($v, ?string $fmt, array &$ctx): ?array
{
    if (is_bool($v)) return xlsx_cell_out($v ? 'DOĞRU' : 'YANLIŞ', $v);
    if (is_array($v)) return xlsx_cell_out((string)$v['error'], null);
    if (is_string($v)) return xlsx_cell_out($v, $v);
    $n = (float)$v;
    if ($fmt !== null && $fmt !== '' && xlsx_is_date_fmt($fmt)) {
        $ms = is_nan($n) ? NAN : XLSX_EPOCH_MS + xlsx_js_round($n * 86400000);
        return xlsx_cell_out(xlsx_format_date(xlsx_date_parts($ms), $fmt), xlsx_num_v($n));
    }
    return xlsx_cell_out(xlsx_format_number($n, $fmt), xlsx_num_v($n));
}

function xlsx_num_v(float $n)
{
    return is_finite($n) && floor($n) === $n && abs($n) < 9007199254740992 ? (int)$n : $n;
}

/** ExcelJS tarih nesnesinin görüntüleyicideki metni */
function xlsx_date_text(float $ms, string $fmt, array &$ctx): string
{
    $d = xlsx_date_parts($ms);
    if ($d === null) return '';
    return xlsx_format_date($d, xlsx_is_date_fmt($fmt) ? $fmt : 'dd.mm.yyyy');
}

/* =================================================================== */
/* JavaScript sayı davranışları                                         */
/* =================================================================== */

function xlsx_js_round(float $x): float
{
    return floor($x + 0.5);
}

/** parseFloat */
function xlsx_js_parse_float(string $s): float
{
    $s = preg_replace('/^[' . XLSX_WS . ']+/u', '', $s) ?? $s;
    if (!preg_match('/^[+-]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/', $s, $m)) return NAN;
    if (str_ends_with($m[0], 'Infinity')) return $m[0][0] === '-' ? -INF : INF;
    return (float)$m[0];
}

/** parseInt(x, 10); NaN -> null */
function xlsx_js_parse_int(string $s): ?int
{
    $s = preg_replace('/^[' . XLSX_WS . ']+/u', '', $s) ?? $s;
    return preg_match('/^[+-]?\d+/', $s, $m) ? (int)$m[0] : null;
}

/** Number(x) (metin -> sayı zorlaması) */
function xlsx_js_number(string $s): float
{
    $s = preg_replace('/^[' . XLSX_WS . ']+|[' . XLSX_WS . ']+$/u', '', $s) ?? $s;
    if ($s === '') return 0.0;
    if (preg_match('/^[+-]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/D', $s)) return xlsx_js_parse_float($s);
    if (preg_match('/^0[xX]([0-9a-fA-F]+)$/D', $s, $m)) return (float)hexdec($m[1]);
    if (preg_match('/^0[bB]([01]+)$/D', $s, $m)) return (float)bindec($m[1]);
    if (preg_match('/^0[oO]([0-7]+)$/D', $s, $m)) return (float)octdec($m[1]);
    return NAN;
}

/** ExcelJS excelToDate: seri numara -> epoch ms */
function xlsx_ej_date(float $v, bool $date1904): float
{
    if (is_nan($v)) return NAN;
    return xlsx_js_round(24 * ($v - 25569 + ($date1904 ? 1462 : 0)) * 3600 * 1000);
}

/** En kısa ondalık gösterim: [rakamlar, üs] (değer = 0.rakamlar × 10^üs) */
function xlsx_shortest(float $x): array
{
    $x = abs($x);
    if ($x == 0) return ['0', 1];
    for ($p = 1; $p <= 17; $p++) {
        $s = sprintf('%.' . ($p - 1) . 'e', $x);
        if ((float)$s == $x) break;
    }
    preg_match('/^(\d)(?:\.(\d+))?e([+-]\d+)$/', $s, $m);
    $digits = rtrim($m[1] . ($m[2] ?? ''), '0');
    return [$digits === '' ? '0' : $digits, (int)$m[3] + 1];
}

/** String(n) */
function xlsx_js_str(float $n): string
{
    if (is_nan($n)) return 'NaN';
    if (is_infinite($n)) return $n > 0 ? 'Infinity' : '-Infinity';
    if ($n == 0) return '0';
    [$dg, $e] = xlsx_shortest($n);
    $sign = $n < 0 ? '-' : '';
    $k = strlen($dg);
    if ($k <= $e && $e <= 21) return $sign . $dg . str_repeat('0', $e - $k);
    if (0 < $e && $e <= 21) return $sign . substr($dg, 0, $e) . '.' . substr($dg, $e);
    if (-6 < $e && $e <= 0) return $sign . '0.' . str_repeat('0', -$e) . $dg;
    $ex = $e - 1;
    return $sign . $dg[0] . ($k > 1 ? '.' . substr($dg, 1) : '') . 'e' . ($ex < 0 ? '-' : '+') . abs($ex);
}

/** n.toExponential(d) */
function xlsx_js_exp(float $n, int $d): string
{
    if (is_nan($n)) return 'NaN';
    if (is_infinite($n)) return $n > 0 ? 'Infinity' : '-Infinity';
    // Tam ortadaki değerlerde JS yukarı yuvarlar (0.125 -> 1.3e-1), sprintf ise çifte yuvarlar
    $long = sprintf('%.' . ($d + 25) . 'e', abs($n));
    if (preg_match('/^(\d)\.(\d+)e([+-]\d+)$/', $long, $m) && substr($m[2], $d) !== '' && preg_match('/^50*$/D', substr($m[2], $d))) {
        $dg = $m[1] . substr($m[2], 0, $d);
        $e = (int)$m[3];
        $i = strlen($dg) - 1;
        while ($i >= 0 && $dg[$i] === '9') { $dg[$i] = '0'; $i--; }
        if ($i < 0) { $dg = '1' . substr($dg, 0, -1); $e++; } else $dg[$i] = chr(ord($dg[$i]) + 1);
        return ($n < 0 ? '-' : '') . $dg[0] . ($d > 0 ? '.' . substr($dg, 1) : '') . 'e' . ($e < 0 ? '-' : '+') . abs($e);
    }
    return sprintf('%.' . $d . 'e', $n);
}

/** n.toLocaleString('tr-TR', { minimumFractionDigits, maximumFractionDigits, useGrouping }) */
function xlsx_locale_num(float $n, int $minFD, int $maxFD, bool $grp): string
{
    if (is_nan($n)) return 'NaN';
    $neg = $n < 0 || ($n == 0 && fdiv(1, $n) < 0);
    if (is_infinite($n)) return ($neg ? '-' : '') . '∞';
    [$dg, $e] = xlsx_shortest($n);
    // Tam ve kesir kısmı
    if ($e > 0) { $int = substr(str_pad($dg, $e, '0'), 0, $e); $frac = (string)substr($dg, $e); }
    else { $int = '0'; $frac = str_repeat('0', -$e) . $dg; }
    if ($dg === '0') { $int = '0'; $frac = ''; }
    if (strlen($frac) > $maxFD) {
        $up = $frac[$maxFD] >= '5';
        $frac = substr($frac, 0, $maxFD);
        if ($up) {
            $all = $int . $frac;
            $i = strlen($all) - 1;
            while ($i >= 0 && $all[$i] === '9') { $all[$i] = '0'; $i--; }
            if ($i < 0) $all = '1' . $all; else $all[$i] = chr(ord($all[$i]) + 1);
            $int = substr($all, 0, strlen($all) - $maxFD);
            $frac = (string)substr($all, strlen($all) - $maxFD);
        }
    }
    $frac = rtrim($frac, '0');
    if (strlen($frac) < $minFD) $frac = str_pad($frac, $minFD, '0');
    $int = ltrim($int, '0');
    if ($int === '') $int = '0';
    if ($grp && strlen($int) > 3) $int = strrev(implode('.', str_split(strrev($int), 3)));
    return ($neg ? '-' : '') . $int . ($frac !== '' ? ',' . $frac : '');
}

/* =================================================================== */
/* Sayı ve tarih biçimleri (viewer.js ile aynı)                         */
/* =================================================================== */

function xlsx_clean_fmt(string $fmt): string
{
    $f = explode(';', $fmt)[0];
    $f = preg_replace('/\[\$[^\]]*\]/u', '', $f) ?? $f;
    return preg_replace('/\[(?:Red|Black|Blue|Green|White|Yellow|Cyan|Magenta|Color ?\d+|Kırmızı|Siyah|Mavi|Yeşil)\]/iu', '', $f) ?? $f;
}

/** viewer.js isDateFmt */
function xlsx_is_date_fmt(string $fmt): bool
{
    $f = preg_replace('/\\\\[^\n\r\x{2028}\x{2029}]/u', '', preg_replace('/"[^"]*"/u', '', xlsx_clean_fmt($fmt)) ?? '') ?? '';
    return (bool)preg_match('/[dmyhs]/i', $f) && !preg_match('/^[#0.,%' . XLSX_WS . ']*$/uD', $f) && !preg_match('/General/i', $f);
}

/** ExcelJS utils.isDateFmt */
function xlsx_ej_is_date_fmt(string $fmt): bool
{
    if ($fmt === '') return false;
    $f = preg_replace('/"[^"]*"/u', '', preg_replace('/\[[^\]]*]/u', '', $fmt) ?? '') ?? '';
    return (bool)preg_match('/[ymdhMsb]/', $f);
}

/** epoch ms -> UTC tarih parçaları; geçersizse null */
function xlsx_date_parts(float $ms): ?array
{
    if (is_nan($ms) || abs($ms) > 8.64e15) return null;
    $days = (int)floor($ms / 86400000);
    $rem = (int)($ms - $days * 86400000.0);
    // Howard Hinnant, civil_from_days
    $z = $days + 719468;
    $era = intdiv($z >= 0 ? $z : $z - 146096, 146097);
    $doe = $z - $era * 146097;
    $yoe = intdiv($doe - intdiv($doe, 1460) + intdiv($doe, 36524) - intdiv($doe, 146096), 365);
    $doy = $doe - (365 * $yoe + intdiv($yoe, 4) - intdiv($yoe, 100));
    $mp = intdiv(5 * $doy + 2, 153);
    $d = $doy - intdiv(153 * $mp + 2, 5) + 1;
    $m = $mp < 10 ? $mp + 3 : $mp - 9;
    $y = $yoe + $era * 400 + ($m <= 2 ? 1 : 0);
    return ['y' => $y, 'mo' => $m - 1, 'd' => $d, 'H' => intdiv($rem, 3600000), 'i' => intdiv($rem, 60000) % 60, 's' => intdiv($rem, 1000) % 60,
        'ms' => $rem % 1000, 'dow' => (($days + 4) % 7 + 7) % 7, 't' => $ms];
}

function xlsx_pad($n): string
{
    return str_pad((string)$n, 2, '0', STR_PAD_LEFT);
}

/** viewer.js formatDate */
function xlsx_format_date(?array $d, string $fmt): string
{
    $f = xlsx_clean_fmt($fmt);
    if ($f === '' || preg_match('/^General$/iD', $f) || $f === 'mm-dd-yy' || $f === 'm/d/yy' || $f === 'd/m/yyyy') $f = 'dd.mm.yyyy';
    $any = '[^\n\r\x{2028}\x{2029}]';
    preg_match_all('/"[^"]*"|\\\\' . $any . '|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|\[h+\]|hh|h|ss|s|AM\/PM|am\/pm|A\/P|\.0+|' . $any . '/iu', $f, $mm);
    $tokens = $mm[0];
    if ($d === null) $d = ['y' => NAN, 'mo' => NAN, 'd' => NAN, 'H' => NAN, 'i' => NAN, 's' => NAN, 'ms' => NAN, 'dow' => NAN, 't' => NAN];
    $ampm = false;
    foreach ($tokens as $tk) if (preg_match('/AM\/PM|A\/P/i', $tk)) { $ampm = true; break; }
    $H = $d['H'];
    $isLetter = static fn($x) => (bool)preg_match('/^[a-z[]/i', $x) && !preg_match('/^".*"$/D', $x);
    $num = static fn($x) => is_float($x) && is_nan($x) ? 'NaN' : (string)$x;
    $h12 = static fn($h) => is_float($h) ? 12 : ($h % 12 ?: 12); // JS: NaN % 12 || 12 -> 12
    $out = '';
    $n = count($tokens);
    foreach ($tokens as $i => $t) {
        $lt = strtolower($t);
        $prev = null; $next = null;
        for ($j = $i - 1; $j >= 0; $j--) if ($isLetter($tokens[$j])) { $prev = $tokens[$j]; break; }
        for ($j = $i + 1; $j < $n; $j++) if ($isLetter($tokens[$j])) { $next = $tokens[$j]; break; }
        $minute = ($lt === 'm' || $lt === 'mm') && (($prev !== null && preg_match('/^\[?h/i', $prev)) || ($next !== null && preg_match('/^s/i', $next)));
        if ($t[0] === '"') $out .= substr($t, 1, -1);
        elseif ($t[0] === '\\') $out .= mb_strlen($t) > 1 ? mb_substr($t, 1, 1) : 'undefined';
        elseif ($lt === 'yyyy') $out .= $num($d['y']);
        elseif ($lt === 'yy') $out .= substr($num($d['y']), -2);
        elseif ($lt === 'mmmmm') $out .= is_int($d['mo']) ? mb_substr(XLSX_TR_MONTHS[$d['mo']], 0, 1) : 'undefined';
        elseif ($lt === 'mmmm') $out .= is_int($d['mo']) ? XLSX_TR_MONTHS[$d['mo']] : 'undefined';
        elseif ($lt === 'mmm') $out .= is_int($d['mo']) ? XLSX_TR_MONTHS_S[$d['mo']] : 'undefined';
        elseif ($minute) $out .= $lt === 'mm' ? xlsx_pad($num($d['i'])) : $num($d['i']);
        elseif ($lt === 'mm') $out .= xlsx_pad(is_int($d['mo']) ? $d['mo'] + 1 : 'NaN');
        elseif ($lt === 'm') $out .= is_int($d['mo']) ? $d['mo'] + 1 : 'NaN';
        elseif ($lt === 'dddd') $out .= is_int($d['dow']) ? XLSX_TR_DAYS[$d['dow']] : 'undefined';
        elseif ($lt === 'ddd') $out .= is_int($d['dow']) ? XLSX_TR_DAYS_S[$d['dow']] : 'undefined';
        elseif ($lt === 'dd') $out .= xlsx_pad($num($d['d']));
        elseif ($lt === 'd') $out .= $num($d['d']);
        elseif (preg_match('/^\[h+\]$/D', $lt)) $out .= is_nan((float)$d['t']) ? 'NaN' : xlsx_js_str(floor(($d['t'] - XLSX_EPOCH_MS) / 3600000));
        elseif ($lt === 'hh') $out .= xlsx_pad($num($ampm ? $h12($H) : $H));
        elseif ($lt === 'h') $out .= $num($ampm ? $h12($H) : $H);
        elseif ($lt === 'ss') $out .= xlsx_pad($num($d['s']));
        elseif ($lt === 's') $out .= $num($d['s']);
        elseif (preg_match('/am\/pm/i', $t)) $out .= is_int($H) && $H < 12 ? 'ÖÖ' : 'ÖS';
        elseif (preg_match('/a\/p/i', $t)) $out .= is_int($H) && $H < 12 ? 'Ö' : 'S';
        elseif (preg_match('/^\.0+$/D', $t)) $out .= ',' . substr(str_pad($num($d['ms']), 3, '0', STR_PAD_LEFT), 0, strlen($t) - 1);
        elseif ($t === '_' || $t === '*') { /* boşluk dolgusu */ }
        else $out .= $t;
    }
    return $out;
}

/** viewer.js formatNumber */
function xlsx_format_number(float $v, ?string $fmt): string
{
    $sections = explode(';', $fmt !== null && $fmt !== '' ? $fmt : 'General');
    $f = $sections[0];
    $n = $v;
    $s1 = $sections[1] ?? '';
    $s2 = $sections[2] ?? '';
    if ($v < 0 && $s1 !== '') { $f = $s1; $n = abs($v); }
    elseif ($v == 0 && $s2 !== '') $f = $s2;
    $f = xlsx_clean_fmt($f);
    if ($f === '' || preg_match('/General|Genel/i', $f)) {
        if (is_finite($n) && floor($n) === $n) return xlsx_js_str($n);
        if (abs($n) >= 1e11 || (abs($n) < 1e-9 && $n != 0)) return preg_replace('/\./', ',', xlsx_js_exp($n, 5), 1);
        $p = is_finite($n) ? (float)sprintf('%.9e', $n) : $n;
        return xlsx_locale_num($p, 0, 10, false);
    }
    if ($f === '@') return xlsx_js_str($n);
    $pct = (bool)preg_match('/%/', preg_replace('/"[^"]*"/u', '', $f) ?? '');
    if ($pct) $n *= 100;
    $any = '[^\n\r\x{2028}\x{2029}]';
    $body = preg_replace('/"[^"]*"|\\\\' . $any . '|_' . $any . '|\*' . $any . '/u', '', $f) ?? '';
    $dec = 0; $decMax = 0;
    if (preg_match('/\.([0#?]+)/', $body, $dm)) { $dec = strlen(str_replace(['#', '?'], '', $dm[1])); $decMax = strlen($dm[1]); }
    $grp = (bool)preg_match('/[#0],[#0]/', $body);
    $sci = (bool)preg_match('/E[+-]/i', $body);
    $num = $sci ? preg_replace('/\./', ',', xlsx_js_exp($n, $dec), 1) : xlsx_locale_num($n, $dec, max($dec, $decMax), $grp);
    $first = preg_match('/[0#?]/', $f, $fm, PREG_OFFSET_CAPTURE) ? $fm[0][1] : -1;
    $last = max(($p = strrpos($f, '0')) === false ? -1 : $p, ($p = strrpos($f, '#')) === false ? -1 : $p, ($p = strrpos($f, '?')) === false ? -1 : $p);
    $lit = static function (string $s) use ($any): string {
        $s = preg_replace('/"([^"]*)"/u', '$1', $s) ?? $s;
        $s = preg_replace('/\\\\(' . $any . ')/u', '$1', $s) ?? $s;
        $s = preg_replace('/_' . $any . '/u', ' ', $s) ?? $s;
        $s = preg_replace('/\*' . $any . '/u', '', $s) ?? $s;
        return str_replace('%', '', $s);
    };
    $pre = $first > 0 ? $lit(substr($f, 0, $first)) : '';
    $post = $last >= 0 ? $lit((string)substr($f, $last + 1)) : '';
    if ($v < 0 && $s1 === '') $num = '-' . preg_replace('/-/', '', $num, 1);
    return $pre . $num . ($pct ? '%' : '') . $post;
}

/* =================================================================== */
/* Google Apps Script ızgarasından model                                */
/* =================================================================== */

/**
 * $tabs: [['name' => ..., 'values' => [[satır0sütun0, ...], ...] (görünen metinler), 'merges' => [[r1, c1, r2, c2], ...],
 *          'hidden' => bool, 'active' => bool], ...]
 */
function xlsx_model_from_grid(array $tabs): array
{
    $sheets = [];
    $active = 0;
    foreach (array_values($tabs) as $i => $tab) {
        $cells = [];
        foreach (array_values((array)($tab['values'] ?? [])) as $r => $row) {
            foreach (array_values((array)$row) as $c => $v) {
                if ($v === null || is_array($v)) continue;
                if (is_bool($v)) $v = $v ? 'DOĞRU' : 'YANLIŞ';
                elseif (is_float($v)) $v = xlsx_js_str($v);
                $v = (string)$v;
                if ($v === '') continue;
                if (!mb_check_encoding($v, 'UTF-8')) $v = mb_convert_encoding($v, 'UTF-8', 'UTF-8');
                $cells[$r * 100000 + $c] = ['text' => $v, 'v' => null];
            }
        }
        $merges = [];
        foreach ((array)($tab['merges'] ?? []) as $m) {
            if (is_array($m) && isset($m['r1'])) $m = [$m['r1'], $m['c1'], $m['r2'], $m['c2']];
            if (!is_array($m) || count($m) < 4) continue;
            [$r1, $c1, $r2, $c2] = array_map('intval', array_values($m));
            if ($r1 < 0 || $c1 < 0) continue;
            $merges[] = ['r1' => min($r1, $r2), 'c1' => min($c1, $c2), 'r2' => max($r1, $r2), 'c2' => max($c1, $c2)];
        }
        $name = (string)($tab['name'] ?? ('Sayfa' . ($i + 1)));
        $sheets[] = ['name' => $name, 'hidden' => !empty($tab['hidden'])] + xlsx_finish_sheet($cells, $merges);
        if (!empty($tab['active'])) $active = $i;
    }
    return ['active' => $active, 'sheets' => $sheets];
}
