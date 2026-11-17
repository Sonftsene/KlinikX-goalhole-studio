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
function gs_kinds(array $src): array
{
    $tabs = json_decode((string)($src['tabs'] ?? '[]'), true) ?: [];
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

function gs_sources(): array
{
    return all('SELECT * FROM gs_sources ORDER BY id');
}

function gs_source(int $id): ?array
{
    return one('SELECT * FROM gs_sources WHERE id = ?', [$id]);
}

function gs_src_set(int $id, array $f): void
{
    if (!$f) return;
    q('UPDATE gs_sources SET ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($f))) . ' WHERE id = ?', array_merge(array_values($f), [$id]));
}

function gs_status(int $sid, string $msg, bool $ok = true): void
{
    gs_src_set($sid, ['status' => mb_substr(($ok ? '' : '!') . $msg, 0, 300)]);
}

/**
 * Gelen çalışma kitabını işler. $file: geçici .xlsx yolu (taşınır/silinir).
 * $force: içerik aynı olsa da bağlı listeleri yeniden oku (ör. yeni bağlama).
 */
function gs_ingest(array $src, string $file, string $title = '', bool $force = false, ?int $onlyRoster = null): array
{
    $sid = (int)$src['id'];
    $hash = hash_file('sha256', $file) ?: '';
    gs_src_set($sid, ['seen' => now()]);
    if (!$force && $hash !== '' && $hash === (string)$src['hash']) {
        @unlink($file);
        return ['changed' => false, 'message' => 'Değişiklik yok'];
    }
    if (!gs_load_parser()) { @unlink($file); gs_status($sid, 'Sunucuda Excel okuyucu eksik (inc/xlsx.php).', false); return ['changed' => false, 'error' => 'Excel okuyucu eksik']; }
    // Kişisel veri: belirtilen sütunlardaki adlar dosya sunucuya kaydedilmeden önce kısaltılır (ör. Ayşe Yılmaz -> Ayşe Y.)
    $masked = 0;
    if (($src['mask_mode'] ?? 'none') !== 'none') {
        try { $masked = gs_mask_xlsx($file, gs_mask_headers($src), (string)$src['mask_mode']); }
        catch (Throwable $e) { @unlink($file); gs_status($sid, 'Ad kısaltma yapılamadı; güvenlik için tablo kaydedilmedi: ' . $e->getMessage(), false); return ['changed' => false, 'error' => 'Ad kısaltma yapılamadı']; }
    }
    try {
        $model = xlsx_read($file);
    } catch (Throwable $e) {
        @unlink($file);
        gs_status($sid, 'Gelen dosya okunamadı: ' . $e->getMessage(), false);
        return ['changed' => false, 'error' => 'Dosya okunamadı'];
    }
    // Ayar değişince yeniden işlenebilsin diye (kısaltılmış) tam kopya korumalı data/ klasöründe tutulur
    $raw = gs_raw_path($sid);
    if ($raw !== $file) @copy($file, $raw);
    // Yalnızca görüntülenen tablo: seçilmeyen sekmelerin içeriği uygulamaya kaydedilen dosyadan çıkarılır
    $keep = gs_show_tabs($src);
    if ($src['purpose'] === 'tablo' && $keep) {
        try { gs_strip_xlsx($file, $keep); }
        catch (Throwable $e) { @unlink($file); gs_status($sid, 'Sekmeler ayıklanamadı; güvenlik için tablo kaydedilmedi: ' . $e->getMessage(), false); return ['changed' => false, 'error' => 'Sekmeler ayıklanamadı']; }
    }
    $tabs = [];
    foreach ($model['sheets'] as $sh) $tabs[] = ['name' => (string)$sh['name'], 'hidden' => !empty($sh['hidden'])] + gs_tab_info((string)$sh['name']);
    $title = $title !== '' ? mb_substr($title, 0, 120) : (string)$src['title'];
    gs_src_set($sid, ['tabs' => json_encode($tabs, JSON_UNESCAPED_UNICODE), 'title' => $title ?: null, 'hash' => $hash, 'changed' => now()]);

    // Dosyayı kalıcı ek olarak sakla (bu tabloya bağlı listelerin hepsi aynı eki gösterir)
    $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
    $dir = NM_ROOT . '/uploads';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if (!@rename($file, $dir . '/' . $stored)) { if (!@copy($file, $dir . '/' . $stored)) { @unlink($file); gs_status($sid, 'Dosya kaydedilemedi (disk dolu olabilir).', false); return ['changed' => false, 'error' => 'Kaydedilemedi']; } @unlink($file); }
    $owner = gs_owner_id();
    q('INSERT INTO attachments (post_id, roster_id, user_id, orig_name, stored_name, mime, size, created_at) VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?)',
        [$owner, ($title ?: $src['name']) . '.xlsx', $stored, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', (int)filesize($dir . '/' . $stored), now()]);
    $attId = (int)db()->lastInsertId();
    $prevAtt = (int)$src['att_id'];
    gs_src_set($sid, ['att_id' => $attId]);

    $rosters = all('SELECT * FROM rosters WHERE src_on = 1 AND src_source = ?' . ($onlyRoster ? ' AND id = ' . (int)$onlyRoster : '') . ' ORDER BY sort, id', [$sid]);
    $summary = [];
    foreach ($rosters as $r) $summary[] = gs_apply_roster($r, $model, $tabs, $attId, $owner, $keep);
    if ($prevAtt && $prevAtt !== $attId) gs_delete_attachment_if_unused($prevAtt);
    if (!$rosters) q('UPDATE attachments SET roster_id = 0 WHERE id = ?', [$attId]); // girişli herkes görebilsin (bağlama önizlemesi)
    $msg = $rosters ? implode(' · ', array_map(fn($x) => $x['name'] . ': ' . $x['status'], $summary)) : count($tabs) . ' sekme alındı; henüz bağlı liste yok';
    if (($src['mask_mode'] ?? 'none') !== 'none') $msg .= ' · ' . ($masked ? $masked . ' ad kısaltıldı' : 'kısaltılacak sütun bulunamadı (“' . implode('”, “', gs_mask_headers($src)) . '”)');
    gs_status($sid, $msg);
    if (function_exists('audit')) audit(null, 'roster.sync', $title ?: $src['name'], mb_substr($msg, 0, 250));
    return ['changed' => true, 'message' => $msg, 'rosters' => $summary];
}

/** Bir listeyi gelen çalışma kitabından günceller */
function gs_apply_roster(array $r, array $model, array $tabs, int $attId, int $owner, array $keep = []): array
{
    $rid = (int)$r['id'];
    $kind = (string)$r['src_tab'];
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
    // Yalnızca görüntülenen tablo (ör. hasta listesi): nöbet okunmaz, gizli olmayan tüm sekmeler görünür
    if ($kind === '*' || ($r['kind'] ?? 'nobet') === 'tablo') {
        $names = array_values(array_map(fn($t) => $t['name'], array_filter($tabs, fn($t) => $keep ? in_array($t['name'], $keep, true) : empty($t['hidden']))));
        $act = $model['sheets'][$model['active'] ?? 0]['name'] ?? ($names[0] ?? null);
        if ($act !== null && !in_array($act, $names, true)) $act = $names[0] ?? null;
        $st = count($names) . ' sekme';
        q('UPDATE rosters SET parsed_file_id = ?, src_sync_at = ?, src_status = ?, src_tabname = ?, src_tabs = ? WHERE id = ?', [$attId, now(), $st, $act, json_encode($names, JSON_UNESCAPED_UNICODE), $rid]);
        return ['id' => $rid, 'name' => $r['name'], 'status' => $st, 'changed' => 0];
    }
    $today = date('Y-m-d');
    $lo = date('Y-m-01', strtotime('first day of -4 months'));
    $hi = date('Y-m-t', strtotime('last day of +3 months'));
    $dict = gs_dict();
    $entries = [];
    $months = [];
    $allTabs = [];
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
        if (!isset($allTabs[$ym]) && empty($t['hidden'])) $allTabs[$ym] = $t['name'];
        if ($ym . '-01' < $lo || $ym . '-01' > $hi || isset($months[$ym])) continue; // eski aylar ve aynı ayın ikinci sekmesi
        $months[$ym] = $t['name'];
        if ($ym === substr($today, 0, 7)) $tabNow = $t['name'];
        foreach ($res['entries'] as $e) $entries[] = $e;
        foreach (($res['warnings'] ?? []) as $w) if (!preg_match('/sayfa adından/u', $w)) $warn[] = $t['name'] . ': ' . $w;
    }
    ksort($months);
    ksort($allTabs);
    // Liste görüntüsünde yalnızca bu listenin sekmeleri (aylara göre sıralı); açılışta bu ay
    $tabList = json_encode(array_values($allTabs), JSON_UNESCAPED_UNICODE);
    if (!$tabNow && $months) $tabNow = end($months);
    if (!$entries) {
        $st = 'Eşleşen sekmede nöbet bulunamadı';
        q('UPDATE rosters SET src_sync_at = ?, src_status = ?, src_tabname = ?, src_tabs = ?, parsed_file_id = ? WHERE id = ?', [now(), '!' . $st, $tabNow, $tabList, $attId, $rid]);
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
        $period = isset($months[$cur]) ? $cur : (string)array_key_last($months);
        $ml = implode(', ', array_map(fn($ym) => GS_MONTH_NAMES[(int)substr($ym, 5, 2) - 1] . ' ' . substr($ym, 0, 4), array_keys($months)));
        $status = $ml . ' · ' . count($entries) . ' kayıt' . ($warn ? ' · ' . $warn[0] : '');
        q('UPDATE rosters SET period = ?, parsed_file_id = ?, src_sync_at = ?, src_status = ?, src_tabname = ?, src_tabs = ? WHERE id = ?', [$period, $attId, now(), mb_substr($status, 0, 250), $tabNow, $tabList, $rid]);
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
    if ((int)val('SELECT COUNT(*) FROM gs_sources WHERE att_id = ?', [$attId]) > 0) return;
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

function gs_token_ok(): bool
{
    $want = setting('gs_token');
    $got = (string)($_SERVER['HTTP_X_SYNC_TOKEN'] ?? ($_GET['token'] ?? ''));
    return $want !== '' && hash_equals($want, $got);
}

/** Betik her çalıştığında hangi tabloları göndereceğini buradan öğrenir (yeni tablo eklemek için kodu değiştirmek gerekmez) */
function a_gsync_tables(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (!gs_token_ok()) { usleep(300000); http_response_code(403); echo json_encode(['ok' => false, 'error' => 'Anahtar geçersiz']); return; }
    set_setting('gs_tables_at', now()); // güncel kod çalışıyor (tanı için)
    echo json_encode(['ok' => true, 'tables' => setting('gs_mode', 'push') === 'push' ? array_column(gs_sources(), 'sheet_id') : []]);
}

/** Apps Script'ten gelen istek (oturumsuz; X-Sync-Token ile doğrulanır; X-Sheet hangi tablo olduğunu söyler) */
function a_gsync_push(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $res = function (int $code, array $body) { http_response_code($code); echo json_encode($body, JSON_UNESCAPED_UNICODE); };
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { $res(405, ['ok' => false, 'error' => 'POST gerekli']); return; }
    if (setting('gs_mode', 'push') !== 'push' || !gs_token_ok()) {
        usleep(300000);
        $res(403, ['ok' => false, 'error' => 'Anahtar geçersiz. Uygulamadaki Google E-Tablolar ayarından güncel kodu kopyalayın.']);
        return;
    }
    $sheet = (string)($_SERVER['HTTP_X_SHEET'] ?? '');
    $src = $sheet !== '' ? one('SELECT * FROM gs_sources WHERE sheet_id = ?', [$sheet])
        : (one("SELECT * FROM gs_sources WHERE purpose = 'nobet' ORDER BY id LIMIT 1") ?? one('SELECT * FROM gs_sources ORDER BY id LIMIT 1')); // eski betik
    if (!$src) { $res(404, ['ok' => false, 'error' => 'Bu tablo uygulamada ekli değil.']); return; }
    // Google tarafında hata (erişim yok, dosya bulunamadı…): uygulamada görünsün
    $gerr = trim(rawurldecode((string)($_SERVER['HTTP_X_SYNC_ERROR'] ?? '')));
    if ($gerr !== '') {
        gs_src_set((int)$src['id'], ['seen' => now()]);
        gs_status((int)$src['id'], 'Google tarafında hata: ' . mb_substr($gerr, 0, 220), false);
        $res(200, ['ok' => true, 'changed' => false, 'message' => 'Hata kaydedildi']);
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
            gs_src_set((int)$src['id'], ['fallback' => 0]);
        } else {
            $j = json_decode($body, true);
            if (!is_array($j) || !is_array($j['grid'] ?? null)) { $res(400, ['ok' => false, 'error' => 'Tanınmayan içerik']); return; }
            if ($title === '' && is_string($j['title'] ?? null)) $title = mb_substr($j['title'], 0, 120);
            gs_grid_to_xlsx($j['grid'], $tmp);
            unset($j);
            gs_src_set((int)$src['id'], ['fallback' => 1]);
        }
        unset($body);
        $out = gs_ingest($src, $tmp, $title);
    } catch (Throwable $e) {
        @unlink($tmp);
        error_log('[dupcii] gsync: ' . $e->getMessage());
        gs_status((int)$src['id'], 'Gelen veri işlenemedi: ' . $e->getMessage(), false);
        $res(500, ['ok' => false, 'error' => 'İşlenemedi']);
        return;
    }
    $res(200, ['ok' => true, 'changed' => $out['changed'], 'message' => $src['name'] . ': ' . ($out['message'] ?? ($out['error'] ?? ''))]);
}

/** Herkese açık tabloyu sunucunun kendisi indirir */
function gs_pull(array $src, bool $force = false): array
{
    $id = (string)$src['sheet_id'];
    $sid = (int)$src['id'];
    if (!preg_match('/^[A-Za-z0-9_-]{20,100}$/', $id)) return ['changed' => false, 'error' => 'Tablo adresi yok'];
    if (!function_exists('curl_init')) { gs_status($sid, 'Sunucuda curl yok; “Yalnızca bana paylaşıldı” yöntemini kullanın.', false); return ['changed' => false, 'error' => 'curl yok']; }
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
    gs_src_set($sid, ['seen' => now()]);
    $head = (string)@file_get_contents($tmp, false, null, 0, 4);
    if (!$ok || $code !== 200 || $head !== "PK\x03\x04" || filesize($tmp) > GS_MAX_BYTES) {
        @unlink($tmp);
        gs_status($sid, $code === 200 || $code === 401 || $code === 403
            ? 'Tablo herkese açık değil. “Yalnızca bana paylaşıldı” yöntemini (Apps Script) kullanın.'
            : 'Tablo indirilemedi (' . ($err ?: 'HTTP ' . $code) . ')', false);
        return ['changed' => false, 'error' => 'İndirilemedi'];
    }
    return gs_ingest($src, $tmp, '', $force);
}

/** Zamanlanmış görev: çekme modunda her çalıştırmada (en az 5 dk arayla) */
function gs_job(): ?string
{
    // Güncellemeden sonra: sekme listesi henüz hesaplanmamış bağlı listeleri son gelen dosyadan yeniden işle
    foreach (all('SELECT DISTINCT src_source FROM rosters WHERE src_on = 1 AND src_tabs IS NULL AND src_source IS NOT NULL') as $x) {
        $src = gs_source((int)$x['src_source']);
        if ($src && $src['att_id']) { try { gs_reprocess($src); } catch (Throwable $e) { error_log('[dupcii] gs yeniden işleme: ' . $e->getMessage()); } }
    }
    if (setting('gs_mode', 'push') !== 'pull') return null;
    $out = [];
    foreach (gs_sources() as $src) { $r = gs_pull($src); $out[] = $src['name'] . ': ' . ($r['message'] ?? ($r['error'] ?? '')); }
    return $out ? implode(' · ', $out) : null;
}

/** Bağlama sonrası (veya elle) bu tablodan son gelen dosyayı yeniden işle */
function gs_reprocess(array $src, ?int $onlyRoster = null): ?array
{
    $file = gs_raw_path((int)$src['id']);
    if (!is_file($file)) {
        $att = $src['att_id'] ? one('SELECT stored_name FROM attachments WHERE id = ?', [(int)$src['att_id']]) : null;
        if (!$att) return null;
        $file = NM_ROOT . '/uploads/' . $att['stored_name'];
        if (!is_file($file)) return null;
    }
    $tmp = gs_tmp();
    if (!@copy($file, $tmp)) return null;
    return gs_ingest($src, $tmp, '', true, $onlyRoster);
}

/* ------------------------------------------------------------------ */
/* Kişisel veri: ad sütunlarını kısaltma                               */
/* ------------------------------------------------------------------ */

function gs_mask_headers(array $src): array
{
    return array_values(array_filter(array_map('trim', preg_split('/[,;\n]+/u', (string)($src['mask_cols'] ?? '')) ?: []), fn($x) => $x !== ''));
}

/** "Ayşe Nur Yılmaz" -> "Ayşe Nur Y." (surname) veya "A. N. Y." (initials) */
function gs_mask_name(string $s, string $mode): string
{
    $s = trim((string)preg_replace('/\s+/u', ' ', $s));
    if ($s === '' || $mode === 'none') return $s;
    $w = explode(' ', $s);
    $ini = fn($x) => mb_substr($x, 0, 1) . '.';
    if ($mode === 'initials') return implode(' ', array_map($ini, $w));
    if (count($w) < 2) return $ini($w[0]);
    $last = array_pop($w);
    return implode(' ', $w) . ' ' . $ini($last);
}

/**
 * .xlsx içinde başlığı verilen adlardan biri olan sütunların altındaki hücreleri kısaltır.
 * Paylaşılan metinler (sharedStrings) de değiştirilir: tam ad dosyanın hiçbir yerinde kalmaz.
 * Dönen değer: kısaltılan hücre sayısı.
 */
function gs_mask_xlsx(string $path, array $headers, string $mode): int
{
    $want = array_values(array_filter(array_map('gs_fold', $headers)));
    if (!$want || $mode === 'none') return 0;
    if (!class_exists('ZipArchive') || !class_exists('DOMDocument')) throw new RuntimeException('Sunucuda ZipArchive/DOM yok');
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new RuntimeException('Dosya açılamadı');
    $NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    $load = function (string $xml): DOMDocument {
        $d = new DOMDocument();
        if (!@$d->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) throw new RuntimeException('XML okunamadı');
        return $d;
    };
    $ssXml = $zip->getFromName('xl/sharedStrings.xml');
    $ssDoc = $ssXml !== false ? $load($ssXml) : null;
    $ss = [];
    if ($ssDoc) foreach ($ssDoc->getElementsByTagNameNS($NS, 'si') as $si) { $t = ''; foreach ($si->getElementsByTagNameNS($NS, 't') as $x) $t .= $x->textContent; $ss[] = $t; }
    $isHeader = function (string $t) use ($want): bool { $f = gs_fold($t); if ($f === '') return false; foreach ($want as $w) if ($f === $w || strpos($f, $w) !== false) return true; return false; };
    $ssNew = [];
    $count = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string)$zip->getNameIndex($i);
        if (!preg_match('~^xl/worksheets/[^/]+\.xml$~', $name)) continue;
        $doc = $load((string)$zip->getFromName($name));
        $xp = new DOMXPath($doc);
        $xp->registerNamespace('m', $NS);
        $cells = $xp->query('//m:sheetData/m:row/m:c');
        $text = function (DOMElement $c) use ($xp, $ss): string {
            $t = $c->getAttribute('t');
            if ($t === 's') { $v = $xp->query('m:v', $c)->item(0); return $v ? (string)($ss[(int)$v->textContent] ?? '') : ''; }
            if ($t === 'inlineStr') { $o = ''; foreach ($xp->query('m:is//m:t', $c) as $x) $o .= $x->textContent; return $o; }
            if ($t === 'str') { $v = $xp->query('m:v', $c)->item(0); return $v ? $v->textContent : ''; }
            return '';
        };
        $cols = []; // sütun harfi => başlık satırı
        foreach ($cells as $c) {
            if (!preg_match('/^([A-Z]+)(\d+)$/', $c->getAttribute('r'), $m)) continue;
            if (!isset($cols[$m[1]]) && $isHeader($text($c))) $cols[$m[1]] = (int)$m[2];
        }
        if (!$cols) continue;
        $changed = false;
        foreach ($cells as $c) {
            if (!preg_match('/^([A-Z]+)(\d+)$/', $c->getAttribute('r'), $m) || !isset($cols[$m[1]]) || (int)$m[2] <= $cols[$m[1]]) continue;
            $t = $c->getAttribute('t');
            $orig = $text($c);
            if (trim($orig) === '' || $isHeader($orig)) continue;
            $new = gs_mask_name($orig, $mode);
            if ($new === $orig) continue;
            if ($t === 's') {
                $v = $xp->query('m:v', $c)->item(0);
                $ssNew[(int)$v->textContent] = $new;
            } else {
                // satır içi metin veya formül sonucu: düz satır içi metne çevir
                while ($c->firstChild) $c->removeChild($c->firstChild);
                $c->setAttribute('t', 'inlineStr');
                $is = $doc->createElementNS($NS, 'is');
                $te = $doc->createElementNS($NS, 't');
                $te->appendChild($doc->createTextNode($new));
                $is->appendChild($te);
                $c->appendChild($is);
                $changed = true;
            }
            $count++;
        }
        if ($changed) $zip->addFromString($name, $doc->saveXML());
    }
    if ($ssNew && $ssDoc) {
        $list = $ssDoc->getElementsByTagNameNS($NS, 'si');
        foreach ($ssNew as $idx => $new) {
            $si = $list->item($idx);
            if (!$si) continue;
            while ($si->firstChild) $si->removeChild($si->firstChild);
            $te = $ssDoc->createElementNS($NS, 't');
            $te->appendChild($ssDoc->createTextNode($new));
            $si->appendChild($te);
        }
        $zip->addFromString('xl/sharedStrings.xml', $ssDoc->saveXML());
    }
    $zip->close();
    return $count;
}

/* ------------------------------------------------------------------ */
/* Yalnızca seçilen sekmeler                                           */
/* ------------------------------------------------------------------ */

function gs_raw_path(int $sid): string
{
    $dir = NM_ROOT . '/data/gs';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir . '/kaynak-' . $sid . '.xlsx';
}

function gs_show_tabs(array $src): array
{
    $j = json_decode((string)($src['show_tabs'] ?? ''), true);
    return is_array($j) ? array_values(array_filter(array_map('strval', $j), fn($x) => $x !== '')) : [];
}

/**
 * Seçilmeyen sekmelerin içeriğini siler ve onları gizler; paylaşılan metinlerden yalnızca kalan sekmelerin
 * kullandıkları bırakılır. Dosya geçerli bir .xlsx olarak kalır. Dönen değer: boşaltılan sekme sayısı.
 */
function gs_strip_xlsx(string $path, array $keep): int
{
    if (!class_exists('ZipArchive') || !class_exists('DOMDocument')) throw new RuntimeException('Sunucuda ZipArchive/DOM yok');
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) throw new RuntimeException('Dosya açılamadı');
    $NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    $RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    $load = function (string $xml): DOMDocument {
        $d = new DOMDocument();
        if (!@$d->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_PARSEHUGE)) throw new RuntimeException('XML okunamadı');
        return $d;
    };
    $wb = $load((string)$zip->getFromName('xl/workbook.xml'));
    $rels = $load((string)$zip->getFromName('xl/_rels/workbook.xml.rels'));
    $target = [];
    foreach ($rels->getElementsByTagName('Relationship') as $r) {
        $t = $r->getAttribute('Target');
        $target[$r->getAttribute('Id')] = $t[0] === '/' ? ltrim($t, '/') : 'xl/' . $t;
    }
    $sheets = [];
    foreach ($wb->getElementsByTagNameNS($NS, 'sheet') as $sh) $sheets[] = $sh;
    $keptIdx = [];
    foreach ($sheets as $i => $sh) if (in_array($sh->getAttribute('name'), $keep, true)) $keptIdx[] = $i;
    if (!$keptIdx) { $zip->close(); return 0; } // seçilen hiçbir sekme yoksa dosyaya dokunma
    $keptFiles = [];
    $n = 0;
    foreach ($sheets as $i => $sh) {
        $file = $target[$sh->getAttributeNS($RNS, 'id')] ?? null;
        if (!$file) continue;
        if (in_array($i, $keptIdx, true)) { $sh->removeAttribute('state'); $keptFiles[] = $file; continue; }
        $sh->setAttribute('state', 'hidden');
        $zip->addFromString($file, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' . $NS . '"><sheetData/></worksheet>');
        $n++;
    }
    foreach ($wb->getElementsByTagNameNS($NS, 'workbookView') as $v) {
        if (!in_array((int)$v->getAttribute('activeTab'), $keptIdx, true)) $v->setAttribute('activeTab', (string)$keptIdx[0]);
        if ($v->hasAttribute('firstSheet')) $v->setAttribute('firstSheet', (string)$keptIdx[0]);
    }
    $zip->addFromString('xl/workbook.xml', $wb->saveXML());
    // Paylaşılan metinler: yalnızca kalan sekmelerde kullanılanlar kalır
    $ssXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($ssXml !== false && $n) {
        $used = [];
        foreach ($keptFiles as $f) {
            $x = $zip->getFromName($f);
            if ($x === false) continue;
            if (preg_match_all('~<c\b[^>]*\bt="s"[^>]*>(?:(?!</c>).)*?<v>(\d+)</v>~s', $x, $m)) foreach ($m[1] as $k) $used[(int)$k] = true;
        }
        $ss = $load($ssXml);
        $i = 0;
        foreach (iterator_to_array($ss->getElementsByTagNameNS($NS, 'si')) as $si) {
            if (!isset($used[$i])) { while ($si->firstChild) $si->removeChild($si->firstChild); $si->appendChild($ss->createElementNS($NS, 't')); }
            $i++;
        }
        $zip->addFromString('xl/sharedStrings.xml', $ss->saveXML());
    }
    $zip->close();
    return $n;
}

