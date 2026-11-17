<?php
/**
 * dupcii — Google E-Tablolar ile otomatik eşitleme.
 *
 * İki yol var:
 *  - "push": Tabloyu görüntüleme yetkisi olan kişinin kendi Google hesabında çalışan küçük bir Apps Script,
 *    tablo her değiştiğinde .xlsx dosyasını (indirme kapalıysa görünen değerleri) bu sunucuya gönderir.
 *  - "pull": Tablo "bağlantıya sahip herkes görüntüleyebilir" ise sunucu her 5 dakikada kendisi indirir.
 *
 * Gelen dosya uygulamada değiştirilemez; bağlı listelerin yeni sürümü olur, kişi başı nöbetler sunucuda
 * yeniden okunur ve nöbeti değişen kişilere bildirim gider.
 */
declare(strict_types=1);

const GS_KEEP_VERSIONS = 15;
const GS_MAX_BYTES = 25 * 1048576;
const GS_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const GS_MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function gs_load_parser(): bool
{
    if (function_exists('sp_extract_sheet') && function_exists('xlsx_read')) return true;
    foreach (['xlsx.php', 'shiftparse.php'] as $f) {
        if (!is_file(NM_ROOT . '/inc/' . $f)) return false;
        require_once NM_ROOT . '/inc/' . $f;
    }
    return function_exists('sp_extract_sheet');
}

/** Türkçe küçük harf + aksansız + yalnızca harf/rakam: "KASIM 3, BASAMAK" -> "kasim3basamak" */
function gs_fold(string $s): string
{
    $s = mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $s), 'UTF-8');
    $s = strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u', 'ê' => 'e', 'é' => 'e']);
    return (string)preg_replace('/[^a-z0-9]+/', '', $s);
}

/** Sekme adını ay ve liste türüne ayırır: "KASIM 3, BASAMAK" -> ['mo' => 11, 'y' => 0, 'kind' => '3basamak'] */
function gs_tab_info(string $name): array
{
    $f = gs_fold($name);
    $mo = 0;
    $y = 0;
    foreach (GS_MONTHS as $i => $m) {
        if (strncmp($f, $m, strlen($m)) === 0) { $mo = $i + 1; $f = substr($f, strlen($m)); break; }
    }
    if (!$mo) {
        foreach (GS_MONTHS as $i => $m) {
            $p = strpos($f, $m);
            if ($p !== false) { $mo = $i + 1; $f = substr($f, 0, $p) . substr($f, $p + strlen($m)); break; }
        }
    }
    if (preg_match('/20[2-9]\d/', $f, $mm)) { $y = (int)$mm[0]; $f = str_replace($mm[0], '', $f); }
    return ['mo' => $mo, 'y' => $y, 'kind' => $f];
}

/** Liste türlerinin özeti (bağlama ekranı için): her tür için örnek sekme adları */
function gs_kinds(): array
{
    $tabs = json_decode(setting('gs_tabs', '[]'), true) ?: [];
    $kinds = [];
    foreach ($tabs as $t) {
        if (empty($t['mo'])) continue;
        $k = (string)$t['kind'];
        if (!isset($kinds[$k])) $kinds[$k] = ['kind' => $k, 'label' => gs_kind_label($t['name']), 'tabs' => []];
        $kinds[$k]['tabs'][] = $t['name'];
    }
    return array_values($kinds);
}

/** "KASIM 3, BASAMAK" -> "3. BASAMAK"; yalnızca ay adı olan sekmeler -> "Ay adı (genel liste)" */
function gs_kind_label(string $tab): string
{
    $words = preg_split('/\s+/u', trim($tab)) ?: [];
    $out = [];
    foreach ($words as $w) {
        $f = gs_fold($w);
        $isMonth = false;
        foreach (GS_MONTHS as $m) if ($f === $m || (strncmp($f, $m, strlen($m)) === 0 && ctype_digit(substr($f, strlen($m))))) $isMonth = true;
        if (!$isMonth && !preg_match('/^20[2-9]\d$/', $w)) $out[] = $w;
    }
    $l = trim(preg_replace('/^[\s,.;:-]+|[\s,.;:-]+$/u', '', implode(' ', $out)));
    $l = preg_replace('/^(\d+)\s*[,.]?\s*/u', '$1. ', $l);
    return $l === '' ? 'Ay adı (genel liste)' : $l;
}

function gs_owner_id(): int
{
    $id = (int)setting('gs_owner', '0');
    if ($id && one('SELECT id FROM users WHERE id = ?', [$id])) return $id;
    return (int)val("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
}

function gs_dict(): ?array
{
    $j = json_decode((string)setting('shift_codes', ''), true);
    return is_array($j) && $j ? $j : null;
}

function gs_status(string $msg, bool $ok = true): void
{
    set_setting('gs_status', mb_substr(($ok ? '' : '!') . $msg, 0, 300));
}

/**
 * Gelen çalışma kitabını işler. $file: geçici .xlsx yolu (taşınır/silinir).
 * $force: içerik aynı olsa da bağlı listeleri yeniden oku (ör. yeni bağlama).
 */
function gs_ingest(string $file, string $title = '', bool $force = false, ?int $onlyRoster = null): array
{
    $hash = hash_file('sha256', $file) ?: '';
    set_setting('gs_seen', now());
    if (!$force && $hash !== '' && $hash === setting('gs_hash')) {
        @unlink($file);
        return ['changed' => false, 'message' => 'Değişiklik yok'];
    }
    if (!gs_load_parser()) { @unlink($file); gs_status('Sunucuda Excel okuyucu eksik (inc/xlsx.php).', false); return ['changed' => false, 'error' => 'Excel okuyucu eksik']; }
    try {
        $model = xlsx_read($file);
    } catch (Throwable $e) {
        @unlink($file);
        gs_status('Gelen dosya okunamadı: ' . $e->getMessage(), false);
        return ['changed' => false, 'error' => 'Dosya okunamadı'];
    }
    $tabs = [];
    foreach ($model['sheets'] as $i => $sh) $tabs[] = ['name' => (string)$sh['name'], 'hidden' => !empty($sh['hidden'])] + gs_tab_info((string)$sh['name']);
    set_setting('gs_tabs', json_encode($tabs, JSON_UNESCAPED_UNICODE));
    if ($title !== '') set_setting('gs_title', mb_substr($title, 0, 120));
    set_setting('gs_hash', $hash);
    set_setting('gs_changed', now());

    // Dosyayı kalıcı ek olarak sakla (bağlı listelerin hepsi aynı eki gösterir)
    $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
    $dir = NM_ROOT . '/uploads';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if (!@rename($file, $dir . '/' . $stored)) { if (!@copy($file, $dir . '/' . $stored)) { @unlink($file); gs_status('Dosya kaydedilemedi (disk dolu olabilir).', false); return ['changed' => false, 'error' => 'Kaydedilemedi']; } @unlink($file); }
    $owner = gs_owner_id();
    $name = (setting('gs_title') !== '' ? setting('gs_title') : 'Google E-Tablo') . '.xlsx';
    q('INSERT INTO attachments (post_id, roster_id, user_id, orig_name, stored_name, mime, size, created_at) VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?)',
        [$owner, $name, $stored, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', (int)filesize($dir . '/' . $stored), now()]);
    $attId = (int)db()->lastInsertId();
    $prevAtt = (int)setting('gs_att', '0');
    set_setting('gs_att', (string)$attId);

    $rosters = all('SELECT * FROM rosters WHERE src_on = 1' . ($onlyRoster ? ' AND id = ' . (int)$onlyRoster : '') . ' ORDER BY sort, id');
    $summary = [];
    foreach ($rosters as $r) $summary[] = gs_apply_roster($r, $model, $tabs, $attId, $owner);
    // Hiçbir listeye bağlanmayan önceki geçici ek gereksiz
    if ($prevAtt && $prevAtt !== $attId && (int)val('SELECT COUNT(*) FROM roster_files WHERE attachment_id = ?', [$prevAtt]) === 0) {
        $a = one('SELECT stored_name, post_id FROM attachments WHERE id = ?', [$prevAtt]);
        if ($a && $a['post_id'] === null) { @unlink($dir . '/' . $a['stored_name']); q('DELETE FROM attachments WHERE id = ?', [$prevAtt]); }
    }
    if (!$rosters) q('UPDATE attachments SET roster_id = 0 WHERE id = ?', [$attId]); // girişli herkes görebilsin (bağlama önizlemesi)
    $msg = $rosters ? implode(' · ', array_map(fn($x) => $x['name'] . ': ' . $x['status'], $summary)) : count($tabs) . ' sekme alındı; henüz bağlı liste yok';
    gs_status($msg);
    if (function_exists('audit')) audit(null, 'roster.sync', setting('gs_title') ?: 'Google E-Tablo', mb_substr($msg, 0, 250));
    return ['changed' => true, 'message' => $msg, 'rosters' => $summary];
}

/** Bir listeyi gelen çalışma kitabından günceller */
function gs_apply_roster(array $r, array $model, array $tabs, int $attId, int $owner): array
{
    $rid = (int)$r['id'];
    $kind = (string)$r['src_tab'];
    $today = date('Y-m-d');
    $lo = date('Y-m-01', strtotime('first day of -4 months'));
    $hi = date('Y-m-t', strtotime('last day of +3 months'));
    $dict = gs_dict();
    $entries = [];
    $months = [];
    $tabNow = null;
    $warn = [];
    foreach ($tabs as $i => $t) {
        if ($t['kind'] !== $kind || !$t['mo']) continue;
        $opts = ['uploadedAt' => now(), 'month' => $t['mo'], 'fileName' => $t['name']];
        if ($t['y']) $opts['year'] = $t['y'];
        if ($dict) $opts['dict'] = $dict;
        try { $res = sp_extract_sheet($model, $i, $opts); } catch (Throwable $e) { $res = ['ok' => false]; error_log('[dupcii] sekme ' . $t['name'] . ': ' . $e->getMessage()); }
        if (empty($res['ok']) || empty($res['entries'])) continue;
        $ym = sprintf('%04d-%02d', (int)$res['year'], (int)$res['month']);
        if ($ym . '-01' < $lo || $ym . '-01' > $hi || isset($months[$ym])) continue; // eski aylar ve aynı ayın ikinci sekmesi
        $months[$ym] = $t['name'];
        if ($ym === substr($today, 0, 7)) $tabNow = $t['name'];
        foreach ($res['entries'] as $e) $entries[] = $e;
        foreach (($res['warnings'] ?? []) as $w) if (!preg_match('/sayfa adından/u', $w)) $warn[] = $t['name'] . ': ' . $w;
    }
    // Viewer'da açılacak sekme: bu ayın sekmesi, yoksa en yeni ay
    if (!$tabNow && $months) { ksort($months); $tabNow = end($months); }
    // Yeni sürüm (dosya her değiştiğinde; liste görüntüsü güncel kalsın)
    q('UPDATE attachments SET roster_id = ? WHERE id = ? AND (roster_id IS NULL OR roster_id = 0)', [$rid, $attId]);
    $last = one('SELECT attachment_id FROM roster_files WHERE roster_id = ? ORDER BY id DESC LIMIT 1', [$rid]);
    if (!$last || (int)$last['attachment_id'] !== $attId) {
        q('INSERT INTO roster_files (roster_id, attachment_id, user_id, created_at) VALUES (?, ?, ?, ?)', [$rid, $attId, $owner, now()]);
        foreach (all('SELECT id, attachment_id FROM roster_files WHERE roster_id = ? ORDER BY id DESC LIMIT 1000 OFFSET ' . GS_KEEP_VERSIONS, [$rid]) as $o) {
            q('DELETE FROM roster_files WHERE id = ?', [$o['id']]);
            gs_delete_attachment_if_unused((int)$o['attachment_id']);
        }
    }
    if (!$entries) {
        $st = 'Eşleşen sekmede nöbet bulunamadı';
        q('UPDATE rosters SET src_sync_at = ?, src_status = ?, src_tabname = ?, parsed_file_id = ? WHERE id = ?', [now(), '!' . $st, $tabNow, $attId, $rid]);
        // eski kayıtlar korunur ama yeni dosyaya taşınır (Kim nöbette/Takvimim boş kalmasın)
        q('UPDATE roster_shifts SET file_id = ? WHERE roster_id = ?', [$attId, $rid]);
        return ['id' => $rid, 'name' => $r['name'], 'status' => $st, 'changed' => 0];
    }
    $old = all('SELECT name, title, date, code, kind, hours, start_time, end_time FROM roster_shifts WHERE roster_id = ?', [$rid]);
    $hadData = (bool)$old;
    db()->beginTransaction();
    try {
        q('DELETE FROM roster_shifts WHERE roster_id = ?', [$rid]);
        $st = db()->prepare('INSERT INTO roster_shifts (roster_id, file_id, name, title, date, code, label, kind, hours, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $hm = fn($v) => is_string($v) && preg_match('/^\d{2}:\d{2}$/', $v) ? $v : null;
        foreach ($entries as $e) {
            $st->execute([$rid, $attId, mb_substr((string)$e['name'], 0, 120), mb_substr((string)($e['title'] ?? ''), 0, 80) ?: null, $e['date'],
                mb_substr((string)$e['code'], 0, 20), mb_substr((string)($e['label'] ?? ''), 0, 60) ?: null,
                in_array($e['kind'] ?? '', ['shift', 'leave', 'off', 'role'], true) ? $e['kind'] : 'shift',
                isset($e['hours']) && is_numeric($e['hours']) ? (int)$e['hours'] : null, $hm($e['start'] ?? null), $hm($e['end'] ?? null)]);
        }
        $cur = substr($today, 0, 7);
        ksort($months);
        $period = isset($months[$cur]) ? $cur : (string)array_key_last($months);
        $ml = implode(', ', array_map(fn($ym) => GS_MONTH_NAMES[(int)substr($ym, 5, 2) - 1] . ' ' . substr($ym, 0, 4), array_keys($months)));
        $status = $ml . ' · ' . count($entries) . ' kayıt' . ($warn ? ' · ' . $warn[0] : '');
        q('UPDATE rosters SET period = ?, parsed_file_id = ?, src_sync_at = ?, src_status = ?, src_tabname = ? WHERE id = ?', [$period, $attId, now(), mb_substr($status, 0, 250), $tabNow, $rid]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    $changed = gs_notify_changes($r, $old, $entries, $hadData);
    if (function_exists('swap_check_applied')) swap_check_applied($rid);
    return ['id' => $rid, 'name' => $r['name'], 'status' => $status, 'changed' => $changed];
}

function gs_delete_attachment_if_unused(int $attId): void
{
    if ($attId === (int)setting('gs_att', '0')) return;
    if ((int)val('SELECT COUNT(*) FROM roster_files WHERE attachment_id = ?', [$attId]) > 0) return;
    $a = one('SELECT * FROM attachments WHERE id = ?', [$attId]);
    if (!$a || $a['post_id'] !== null) return;
    @unlink(NM_ROOT . '/uploads/' . $a['stored_name']);
    q('DELETE FROM attachments WHERE id = ?', [$attId]);
}

function gs_short_date(string $ymd): string
{
    return (int)substr($ymd, 8, 2) . ' ' . mb_substr(GS_MONTH_NAMES[(int)substr($ymd, 5, 2) - 1], 0, 3);
}

/**
 * Önceki ve yeni kayıtları karşılaştırır; nöbeti değişen hesaplara bildirim gönderir.
 * Yeni bir ayın sekmesi ilk kez geldiyse o ayda nöbeti olanlara "liste yayınlandı" bildirimi gider.
 */
function gs_notify_changes(array $roster, array $old, array $new, bool $hadData): int
{
    $key = fn($name) => implode(' ', array_filter(explode(' ', gs_fold_spaced($name))));
    $index = function (array $rows, bool $isNew) use ($key) {
        $by = [];
        foreach ($rows as $x) {
            $code = (string)$x['code'];
            $by[$key((string)$x['name'])]['name'] = (string)$x['name'];
            $by[$key((string)$x['name'])]['days'][(string)$x['date']] = $code;
        }
        return $by;
    };
    $o = $index($old, false);
    $n = $index($new, true);
    $oldMonths = [];
    foreach ($old as $x) $oldMonths[substr((string)$x['date'], 0, 7)] = true;
    $today = date('Y-m-d');
    $users = function_exists('active_users_sql') ? active_users_sql() : all("SELECT * FROM users WHERE status = 'active'");
    $notified = 0;
    foreach ($users as $u) {
        $mine = null;
        foreach ($n as $k => $p) if (names_match($p['name'], (string)$u['name'])) { $mine = $k; break; }
        $was = null;
        foreach ($o as $k => $p) if (names_match($p['name'], (string)$u['name'])) { $was = $k; break; }
        if ($mine === null && $was === null) continue;
        $nd = $mine !== null ? $n[$mine]['days'] : [];
        $od = $was !== null ? $o[$was]['days'] : [];
        $changes = [];
        $newMonths = [];
        foreach (array_unique(array_merge(array_keys($nd), array_keys($od))) as $d) {
            if ($d < $today) continue; // geçmiş günlerdeki düzeltmeler için bildirim yok
            $a = $od[$d] ?? null;
            $b = $nd[$d] ?? null;
            if ($a === $b) continue;
            $ym = substr($d, 0, 7);
            if (!isset($oldMonths[$ym])) { if ($b !== null) $newMonths[$ym] = ($newMonths[$ym] ?? 0) + 1; continue; }
            $changes[$d] = [$a, $b];
        }
        if (!$hadData) $changes = []; // ilk eşitleme: herkese ayrı ayrı bildirim yok
        $lines = [];
        ksort($changes);
        foreach ($changes as $d => [$a, $b]) $lines[] = gs_short_date($d) . ': ' . ($a ?? '—') . ' → ' . ($b ?? '—');
        if ($lines) {
            notify_users([$u], 'shift', 'Nöbetinde değişiklik var', mb_substr(implode(' · ', $lines), 0, 380), '#/nobetim', [
                'subject' => 'Nöbetinde değişiklik: ' . $roster['name'],
                'heading' => 'Nöbet listesinde senin günlerin değişti',
                'lines' => array_merge(['“' . $roster['name'] . '” listesi Excel’de güncellendi. Değişen günlerin:'], $lines),
                'button' => 'Takvimimi aç',
            ], 'notoff');
            $notified++;
        }
        if ($hadData) foreach ($newMonths as $ym => $cnt) {
            $mn = GS_MONTH_NAMES[(int)substr($ym, 5, 2) - 1];
            notify_users([$u], 'roster', $mn . ' nöbet listesi yayınlandı', $mn . ' ayında ' . $cnt . ' nöbet/izin kaydın var. Takviminde görebilirsin.', '#/nobetim', null);
            $notified++;
        }
    }
    return $notified;
}

function gs_fold_spaced(string $s): string
{
    $s = mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $s), 'UTF-8');
    $s = strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u']);
    return trim((string)preg_replace('/[^a-z0-9]+/', ' ', $s));
}

/* ------------------------------------------------------------------ */
/* Apps Script'in görünen değerlerle gönderdiği yedek biçim -> .xlsx   */
/* ------------------------------------------------------------------ */
function gs_xml(string $s): string
{
    $s = (string)preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s);
    return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}
function gs_col(int $c): string
{
    $s = '';
    $c++;
    while ($c > 0) { $m = ($c - 1) % 26; $s = chr(65 + $m) . $s; $c = intdiv($c - 1, 26); }
    return $s;
}
/** $grid: [['name'=>..., 'values'=>[[..]], 'merges'=>[[r1,c1,r2,c2]], 'hidden'=>bool, 'backgrounds'=>[[#rrggbb]]], ...] */
function gs_grid_to_xlsx(array $grid, string $path): void
{
    if (!class_exists('ZipArchive')) throw new RuntimeException('Sunucuda ZipArchive yok');
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Geçici dosya açılamadı');
    $fills = ['none' => 0, 'gray125' => 1];
    $fillXml = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    $styleOf = function (string $bg) use (&$fills, &$fillXml): int {
        $bg = strtoupper(ltrim($bg, '#'));
        if (!preg_match('/^[0-9A-F]{6}$/', $bg) || $bg === 'FFFFFF') return 0;
        if (!isset($fills[$bg])) { $fills[$bg] = count($fillXml); $fillXml[] = '<fill><patternFill patternType="solid"><fgColor rgb="FF' . $bg . '"/><bgColor indexed="64"/></patternFill></fill>'; }
        return $fills[$bg] - 1; // 0 = varsayılan stil; dolgu stilleri 1'den başlar
    };
    $sheets = [];
    $used = [];
    $n = 0;
    foreach (array_slice($grid, 0, 200) as $sh) {
        if (!is_array($sh)) continue;
        $n++;
        $name = trim(preg_replace('/[\[\]:*?\/\\\\]/', ' ', (string)($sh['name'] ?? ('Sayfa ' . $n))));
        $name = mb_substr($name !== '' ? $name : 'Sayfa ' . $n, 0, 31);
        while (isset($used[mb_strtolower($name)])) $name = mb_substr($name, 0, 28) . ' ' . $n;
        $used[mb_strtolower($name)] = true;
        $rows = '';
        $vals = is_array($sh['values'] ?? null) ? array_slice($sh['values'], 0, 3000) : [];
        $bgs = is_array($sh['backgrounds'] ?? null) ? $sh['backgrounds'] : [];
        foreach ($vals as $r => $row) {
            if (!is_array($row)) continue;
            $cells = '';
            foreach (array_slice($row, 0, 400) as $c => $v) {
                $v = is_scalar($v) ? (string)$v : '';
                $bg = isset($bgs[$r][$c]) && is_string($bgs[$r][$c]) ? $bgs[$r][$c] : '';
                $s = $bg !== '' ? $styleOf($bg) : 0;
                $sa = $s ? ' s="' . $s . '"' : '';
                if ($v === '') { if ($s) $cells .= '<c r="' . gs_col($c) . ($r + 1) . '"' . $sa . '/>'; continue; }
                if (preg_match('/^-?\d{1,15}(\.\d+)?$/', $v)) $cells .= '<c r="' . gs_col($c) . ($r + 1) . '"' . $sa . '><v>' . $v . '</v></c>';
                else $cells .= '<c r="' . gs_col($c) . ($r + 1) . '"' . $sa . ' t="inlineStr"><is><t xml:space="preserve">' . gs_xml($v) . '</t></is></c>';
            }
            if ($cells !== '') $rows .= '<row r="' . ($r + 1) . '">' . $cells . '</row>';
        }
        $merges = '';
        foreach ((array)($sh['merges'] ?? []) as $m) {
            if (!is_array($m) || count($m) < 4) continue;
            [$r1, $c1, $r2, $c2] = array_map('intval', $m);
            if ($r2 > $r1 || $c2 > $c1) $merges .= '<mergeCell ref="' . gs_col($c1) . ($r1 + 1) . ':' . gs_col($c2) . ($r2 + 1) . '"/>';
        }
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' . $rows . '</sheetData>'
            . ($merges !== '' ? '<mergeCells>' . $merges . '</mergeCells>' : '') . '</worksheet>';
        $zip->addFromString('xl/worksheets/sheet' . $n . '.xml', $xml);
        $sheets[] = ['name' => $name, 'hidden' => !empty($sh['hidden']), 'active' => !empty($sh['active'])];
    }
    if (!$sheets) { $zip->close(); throw new RuntimeException('Boş tablo'); }
    $act = 0;
    foreach ($sheets as $i => $s) if ($s['active']) $act = $i;
    $wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="' . $act . '"/></bookViews><sheets>';
    $rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    $ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    foreach ($sheets as $i => $s) {
        $k = $i + 1;
        $wb .= '<sheet name="' . gs_xml($s['name']) . '" sheetId="' . $k . '"' . ($s['hidden'] ? ' state="hidden"' : '') . ' r:id="rId' . $k . '"/>';
        $rels .= '<Relationship Id="rId' . $k . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $k . '.xml"/>';
        $ct .= '<Override PartName="/xl/worksheets/sheet' . $k . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    $k = count($sheets) + 1;
    $rels .= '<Relationship Id="rId' . $k . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    $wb .= '</sheets></workbook>';
    $ct .= '</Types>';
    $xfs = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
    for ($i = 2; $i < count($fillXml); $i++) $xfs .= '<xf numFmtId="0" fontId="0" fillId="' . $i . '" borderId="0" xfId="0" applyFill="1"/>';
    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="10"/><name val="Arial"/></font></fonts><fills count="' . count($fillXml) . '">' . implode('', $fillXml) . '</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' . (count($fillXml) - 1) . '">' . $xfs . '</cellXfs></styleSheet>';
    $zip->addFromString('[Content_Types].xml', $ct);
    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $zip->addFromString('xl/workbook.xml', $wb);
    $zip->addFromString('xl/_rels/workbook.xml.rels', $rels);
    $zip->addFromString('xl/styles.xml', $styles);
    $zip->close();
}

/* ------------------------------------------------------------------ */
/* Giriş noktaları                                                     */
/* ------------------------------------------------------------------ */

function gs_tmp(): string
{
    $dir = NM_ROOT . '/data/tmp';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    return $dir . '/gs_' . bin2hex(random_bytes(8)) . '.xlsx';
}

/** Apps Script'ten gelen istek (oturumsuz; X-Sync-Token ile doğrulanır) */
function a_gsync_push(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $res = function (int $code, array $body) { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); };
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { $res(405, ['ok' => false, 'error' => 'POST gerekli']); return; }
    $want = setting('gs_token');
    $got = (string)($_SERVER['HTTP_X_SYNC_TOKEN'] ?? ($_GET['token'] ?? ''));
    if ($want === '' || setting('gs_mode', 'push') !== 'push' || !hash_equals($want, $got)) {
        usleep(300000);
        $res(403, ['ok' => false, 'error' => 'Anahtar geçersiz. Uygulamadaki Google E-Tablolar ayarından güncel betiği kopyalayın.']);
        return;
    }
    $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > GS_MAX_BYTES) { $res(413, ['ok' => false, 'error' => 'Dosya çok büyük']); return; }
    $body = (string)file_get_contents('php://input', false, null, 0, GS_MAX_BYTES + 1);
    if ($body === '' || strlen($body) > GS_MAX_BYTES) { $res(400, ['ok' => false, 'error' => 'Boş veya çok büyük gövde']); return; }
    if (function_exists('session_write_close')) @session_write_close();
    $title = mb_substr(trim(rawurldecode((string)($_SERVER['HTTP_X_TITLE'] ?? ''))), 0, 120);
    $tmp = gs_tmp();
    try {
        if (strncmp($body, "PK\x03\x04", 4) === 0) {
            file_put_contents($tmp, $body);
        } else {
            $j = json_decode($body, true);
            if (!is_array($j) || !is_array($j['grid'] ?? null)) { $res(400, ['ok' => false, 'error' => 'Tanınmayan içerik']); return; }
            if ($title === '' && is_string($j['title'] ?? null)) $title = mb_substr($j['title'], 0, 120);
            gs_grid_to_xlsx($j['grid'], $tmp);
            set_setting('gs_fallback', '1');
        }
        unset($body);
        if (isset($j)) unset($j); else set_setting('gs_fallback', '0');
        $out = gs_ingest($tmp, $title);
    } catch (Throwable $e) {
        @unlink($tmp);
        error_log('[dupcii] gsync: ' . $e->getMessage());
        gs_status('Gelen veri işlenemedi: ' . $e->getMessage(), false);
        $res(500, ['ok' => false, 'error' => 'İşlenemedi']);
        return;
    }
    $res(200, ['ok' => true, 'changed' => $out['changed'], 'message' => $out['message'] ?? ($out['error'] ?? '')]);
}

/** Herkese açık tabloyu sunucunun kendisi indirir */
function gs_pull(bool $force = false): array
{
    $id = setting('gs_id');
    if ($id === '' || !preg_match('/^[A-Za-z0-9_-]{20,100}$/', $id)) return ['changed' => false, 'error' => 'Tablo adresi yok'];
    if (!function_exists('curl_init')) { gs_status('Sunucuda curl yok; Apps Script yöntemini kullanın.', false); return ['changed' => false, 'error' => 'curl yok']; }
    $ch = curl_init('https://docs.google.com/spreadsheets/d/' . $id . '/export?format=xlsx');
    $tmp = gs_tmp();
    $fp = fopen($tmp, 'wb');
    curl_setopt_array($ch, [CURLOPT_FILE => $fp, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 40,
        CURLOPT_USERAGENT => 'dupcii-sync/1', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS]);
    $ok = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    fclose($fp);
    set_setting('gs_seen', now());
    $head = (string)@file_get_contents($tmp, false, null, 0, 4);
    if (!$ok || $code !== 200 || $head !== "PK\x03\x04" || filesize($tmp) > GS_MAX_BYTES) {
        @unlink($tmp);
        gs_status($code === 200 || $code === 401 || $code === 403
            ? 'Tablo herkese açık değil. "Yalnızca bana paylaşıldı" yöntemini (Apps Script) kullanın.'
            : 'Tablo indirilemedi (' . ($err ?: 'HTTP ' . $code) . ')', false);
        return ['changed' => false, 'error' => 'İndirilemedi'];
    }
    return gs_ingest($tmp, '', $force);
}

/** Zamanlanmış görev: çekme modunda her çalıştırmada (en az 5 dk arayla) */
function gs_job(): ?string
{
    if (setting('gs_mode', 'push') !== 'pull' || setting('gs_id') === '') return null;
    $r = gs_pull();
    return $r['message'] ?? ($r['error'] ?? '');
}

/** Bağlama sonrası (veya elle) son gelen dosyayı yeniden işle */
function gs_reprocess(?int $onlyRoster = null): ?array
{
    $att = one('SELECT stored_name FROM attachments WHERE id = ?', [(int)setting('gs_att', '0')]);
    if (!$att) return null;
    $src = NM_ROOT . '/uploads/' . $att['stored_name'];
    if (!is_file($src)) return null;
    $tmp = gs_tmp();
    if (!@copy($src, $tmp)) return null;
    return gs_ingest($tmp, '', true, $onlyRoster);
}
