<?php
/**
 * NöbetMed — bildirim merkezi, işlem günlüğü, nöbet eşleştirme, zamanlanmış görevler ve yedekleme
 */
declare(strict_types=1);

/* =================================================================== */
/* Bildirimler                                                          */
/* =================================================================== */

/**
 * Kişilere bildirim gönderir: uygulama içi kayıt (her zaman) + telefon bildirimi + e-posta.
 * $emailPolicy: 'instant' (yalnızca anlık bildirim seçenler), 'notoff' (bildirimi kapatmayanlar), 'always'
 */
function notify_users(array $users, string $kind, string $title, string $body, string $url, ?array $mail = null, string $emailPolicy = 'instant'): int
{
    $pushIds = [];
    $mailTo = [];
    $seen = [];
    foreach ($users as $u) {
        $id = (int)$u['id'];
        if (isset($seen[$id])) continue;
        $seen[$id] = true;
        q('INSERT INTO notifications (user_id, title, body, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$id, mb_substr($title, 0, 200), mb_substr($body, 0, 400), mb_substr($url, 0, 200), $kind, now()]);
        $mode = $u['notify_mode'] ?? 'instant';
        if ((int)($u['push_on'] ?? 1) === 1 && $mode !== 'off') $pushIds[] = $id;
        $okMail = $emailPolicy === 'always' || ($emailPolicy === 'notoff' && $mode !== 'off') || ($emailPolicy === 'instant' && $mode === 'instant');
        if ($okMail) $mailTo[] = $u;
    }
    $n = 0;
    if ($mail && $mailTo && mail_ready()) {
        $n = mail_queue_to($mailTo, $mail['subject'], $mail['heading'] ?? $title, $mail['lines'] ?? [$body], $mail['button'] ?? 'Portalda aç', base_url() . $url, $kind, false);
    }
    if ($pushIds) push_after_response($pushIds);
    return $n ?: count($seen);
}

function push_ready(): bool
{
    return setting('push_enabled', '1') === '1' && function_exists('push_send') && extension_loaded('openssl');
}

/** VAPID anahtarlarını (ilk kullanımda) üretir */
function push_keys(): ?array
{
    if (!function_exists('push_generate_vapid')) return null;
    $pub = setting('vapid_public');
    $priv = setting('vapid_private');
    if ($pub === '' || $priv === '') {
        try { $k = push_generate_vapid(); } catch (Throwable $e) { error_log('[NobetMed] VAPID: ' . $e->getMessage()); return null; }
        set_setting('vapid_public', $k['public']);
        set_setting('vapid_private', $k['private_pem']);
        return $k;
    }
    return ['public' => $pub, 'private_pem' => $priv];
}

function push_after_response(array $userIds): void
{
    static $pending = [];
    static $registered = false;
    if (!push_ready()) return;
    foreach ($userIds as $id) $pending[(int)$id] = true;
    if ($registered) return;
    $registered = true;
    register_shutdown_function(function () use (&$pending) {
        nm_after_response();
        try { push_dispatch(array_keys($pending)); } catch (Throwable $e) { error_log('[NobetMed] push: ' . $e->getMessage()); }
    });
}

function push_dispatch(array $userIds): int
{
    if (!$userIds || !push_ready()) return 0;
    $keys = push_keys();
    if (!$keys) return 0;
    $in = implode(',', array_map('intval', $userIds));
    $subs = all("SELECT id, endpoint FROM push_subscriptions WHERE user_id IN ($in)");
    if (!$subs) return 0;
    $from = setting('mail_from');
    $subject = filter_var($from, FILTER_VALIDATE_EMAIL) ? 'mailto:' . $from : base_url();
    $res = push_send(array_map(fn($s) => ['id' => (int)$s['id'], 'endpoint' => $s['endpoint']], $subs), $keys['public'], $keys['private_pem'], $subject);
    $ok = 0;
    foreach ($res as $id => $r) {
        if ($r === 'ok') { $ok++; q('UPDATE push_subscriptions SET last_ok = ? WHERE id = ?', [now(), $id]); }
        elseif ($r === 'gone') q('DELETE FROM push_subscriptions WHERE id = ?', [$id]);
    }
    return $ok;
}

/* =================================================================== */
/* İşlem günlüğü                                                        */
/* =================================================================== */

function audit(?array $me, string $action, string $target = '', string $detail = ''): void
{
    try {
        q('INSERT INTO audit_log (user_id, user_name, action, target, detail, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$me['id'] ?? null, $me['name'] ?? null, $action, mb_substr($target, 0, 200), mb_substr($detail, 0, 255), client_ip(), now()]);
    } catch (Throwable $e) { /* günlük yazılamazsa işlem durmasın */ }
}

/* =================================================================== */
/* Nöbet listesindeki ad ↔ portal hesabı                               */
/* =================================================================== */

function name_tokens(string $s): array
{
    // Türkçe harf ve aksan farkları yok sayılır: 'DEMIR' = 'Demir', 'OZTURK' = 'Öztürk'
    $s = mb_strtolower(str_replace(['İ', 'I'], ['i', 'i'], $s), 'UTF-8');
    $s = strtr($s, ['ı' => 'i', 'ç' => 'c', 'ğ' => 'g', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u', 'ê' => 'e', 'é' => 'e', "i\u{307}" => 'i']);
    $s = preg_replace('/[^\p{L}\s]+/u', ' ', $s);
    return array_values(array_filter(preg_split('/\s+/u', trim((string)$s)) ?: [], fn($t) => mb_strlen($t) >= 2));
}

/** Excel'deki ad ile hesap adı aynı kişi mi? (Türkçe harf duyarsız; ikinci adlar esnek) */
function names_match(string $a, string $b): bool
{
    $ta = name_tokens($a);
    $tb = name_tokens($b);
    if (!$ta || !$tb) return false;
    if (implode(' ', $ta) === implode(' ', $tb)) return true;
    if (count($ta) < 2 || count($tb) < 2) return false;
    [$short, $long] = count($ta) <= count($tb) ? [$ta, $tb] : [$tb, $ta];
    // ilk ve son adlar eşleşmeli, kısa addaki her parça uzun adda bulunmalı
    if ($short[0] !== $long[0] || end($short) !== end($long)) return false;
    foreach ($short as $t) if (!in_array($t, $long, true)) return false;
    return true;
}

/** Hesabın nöbet kayıtları (tarih aralığında) */
function shifts_for_user(array $u, string $from, string $to): array
{
    $rows = all('SELECT s.*, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date >= ? AND s.date <= ? ORDER BY s.date, s.start_time', [$from, $to]);
    return array_values(array_filter($rows, fn($r) => names_match((string)$r['name'], (string)$u['name'])));
}

function shift_row_out(array $r): array
{
    return [
        'roster_id' => (int)$r['roster_id'], 'roster' => $r['roster_name'] ?? null, 'name' => $r['name'], 'title' => $r['title'],
        'date' => $r['date'], 'code' => $r['code'], 'label' => $r['label'], 'kind' => $r['kind'],
        'hours' => $r['hours'] !== null ? (int)$r['hours'] : null, 'start' => $r['start_time'], 'end' => $r['end_time'],
    ];
}

/* =================================================================== */
/* Zamanlanmış görevler                                                 */
/* =================================================================== */

/** Görevleri en fazla 5 dakikada bir, sayfa yanıtından sonra çalıştır */
function jobs_after_response(): void
{
    static $registered = false;
    if ($registered) return;
    if ((int)setting('jobs_last', '0') > time() - 300) return;
    $registered = true;
    register_shutdown_function(function () {
        nm_after_response();
        try { run_jobs(); } catch (Throwable $e) { error_log('[NobetMed] görev: ' . $e->getMessage()); }
    });
}

function run_jobs(bool $force = false): array
{
    // Aynı anda iki kez çalışmasın
    $lastRaw = (string)setting('jobs_last', '0');
    if (!$force && (int)$lastRaw > time() - 280) return [];
    // Aynı anda iki istek görevleri başlatmasın: zamanı yalnızca biri güncelleyebilir
    if (!one("SELECT k FROM settings WHERE k = 'jobs_last'")) set_setting('jobs_last', '0');
    $claimed = q("UPDATE settings SET v = ? WHERE k = 'jobs_last' AND v = ?", [(string)time(), $lastRaw === '' ? '0' : $lastRaw])->rowCount();
    setting('', '', true);
    if (!$force && $claimed !== 1) return [];
    if ($force && $claimed !== 1) set_setting('jobs_last', (string)time());
    $done = [];
    $today = date('Y-m-d');
    $hour = (int)date('G');
    if (setting('digest_on', '0') === '1' && $hour >= (int)setting('digest_hour', '7') && setting('digest_last') !== $today) {
        set_setting('digest_last', $today);
        $done['digest'] = job_digest();
    }
    if (setting('shift_remind_on', '1') === '1' && $hour >= (int)setting('shift_remind_hour', '18') && setting('shift_remind_last') !== $today) {
        set_setting('shift_remind_last', $today);
        $done['shift_remind'] = job_shift_remind();
    }
    if (setting('jobs_daily_last') !== $today) {
        set_setting('jobs_daily_last', $today);
        $done['auto_remind'] = job_auto_remind();
        $done['review'] = job_review();
        q('DELETE FROM notifications WHERE created_at < ?', [date('Y-m-d H:i:s', time() - 90 * 86400)]);
        q('DELETE FROM audit_log WHERE at < ?', [date('Y-m-d H:i:s', time() - 400 * 86400)]);
    }
    if (setting('backup_weekly', '1') === '1' && (int)setting('backup_last', '0') < time() - 7 * 86400) {
        set_setting('backup_last', (string)time());
        try { $done['backup'] = basename(backup_create(false, true)); } catch (Throwable $e) { error_log('[NobetMed] yedek: ' . $e->getMessage()); }
    }
    if (mail_ready()) $done['mail'] = mail_flush(60);
    return $done;
}

/** Sabah özeti: "günlük özet" seçenlere tek e-posta + telefon bildirimi */
function job_digest(): int
{
    $users = active_users_sql("AND notify_mode = 'digest'");
    if (!$users) return 0;
    $today = date('Y-m-d');
    $tomorrow = date('Y-m-d', strtotime('+1 day'));
    $since = date('Y-m-d H:i:s', time() - 86400);
    $sent = 0;
    foreach ($users as $u) {
        $lines = [];
        $shifts = shifts_for_user($u, $today, $tomorrow);
        foreach ($shifts as $s) {
            if ($s['kind'] !== 'shift') continue;
            $lines[] = ($s['date'] === $today ? 'Bugün' : 'Yarın') . ' nöbetiniz: ' . $s['code'] . ($s['label'] ? ' (' . $s['label'] . ($s['start_time'] ? ', ' . $s['start_time'] . '–' . $s['end_time'] : '') . ')' : '');
        }
        $me = one('SELECT * FROM users WHERE id = ?', [$u['id']]);
        $p = [':me' => $u['id'], ':since' => $since];
        $vis = '';
        if (!in_array($u['role'], ['admin', 'editor'], true)) { $vis = ' AND (p.unit_id IS NULL OR p.unit_id = :vu)'; $p[':vu'] = (int)($me['unit_id'] ?? 0); }
        $new = all("SELECT p.title FROM posts p LEFT JOIN views v ON v.post_id = p.id AND v.user_id = :me WHERE p.status = 'published' AND v.user_id IS NULL AND p.published_at >= :since$vis ORDER BY p.published_at DESC LIMIT 6", $p);
        if ($new) $lines[] = 'Yeni duyurular: ' . implode(' · ', array_column($new, 'title'));
        $p2 = [':me' => $u['id']];
        $vis2 = '';
        if (!in_array($u['role'], ['admin', 'editor'], true)) { $vis2 = ' AND (p.unit_id IS NULL OR p.unit_id = :vu)'; $p2[':vu'] = (int)($me['unit_id'] ?? 0); }
        $todo = (int)val("SELECT COUNT(*) FROM posts p LEFT JOIN acks k ON k.post_id = p.id AND k.user_id = :me WHERE p.status = 'published' AND p.required = 1 AND k.user_id IS NULL$vis2", $p2);
        if ($todo) $lines[] = "Okumanızı bekleyen $todo zorunlu içerik var.";
        if (in_array($u['role'], ['admin', 'editor'], true)) {
            $pp = (int)val("SELECT COUNT(*) FROM posts WHERE status = 'pending'");
            if ($pp) $lines[] = "Onay bekleyen $pp içerik var.";
        }
        if ($u['role'] === 'admin') {
            $pu = (int)val("SELECT COUNT(*) FROM users WHERE status = 'pending'");
            if ($pu) $lines[] = "$pu yeni üyelik başvurusu var.";
        }
        if (!$lines) continue;
        $first = explode(' ', trim($u['name']))[0];
        notify_users([$u], 'digest', 'Günaydın ' . $first, $lines[0], '#/', [
            'subject' => 'Günlük özet · ' . date('d.m.Y'),
            'heading' => 'Günaydın ' . $first,
            'lines' => $lines,
            'button' => 'Portalı aç',
        ], 'notoff');
        $sent++;
    }
    return $sent;
}

/** Yarın nöbeti olanlara hatırlatma */
function job_shift_remind(): int
{
    $tomorrow = date('Y-m-d', strtotime('+1 day'));
    $rows = all("SELECT s.*, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ? AND s.kind IN ('shift', 'role')", [$tomorrow]);
    if (!$rows) return 0;
    $users = active_users_sql();
    $sent = 0;
    foreach ($users as $u) {
        $mine = array_values(array_filter($rows, fn($r) => names_match((string)$r['name'], (string)$u['name'])));
        if (!$mine) continue;
        $s = $mine[0];
        $what = $s['code'] . ($s['label'] ? ' · ' . $s['label'] : '') . ($s['start_time'] ? ' · ' . $s['start_time'] . '–' . $s['end_time'] : '');
        notify_users([$u], 'shift', 'Yarın nöbetiniz var', $what . ' (' . $s['roster_name'] . ')', '#/nobetim', [
            'subject' => 'Hatırlatma: yarın nöbetiniz var (' . $s['code'] . ')',
            'heading' => 'Yarın nöbetiniz var',
            'lines' => [date('d.m.Y', strtotime($tomorrow)) . ': ' . $what, 'Liste: ' . $s['roster_name']],
            'button' => 'Nöbetlerimi gör',
        ], 'notoff');
        $sent++;
    }
    return $sent;
}

/** Zorunlu okumayı N gün içinde okumayanlara bir kez otomatik hatırlatma */
function job_auto_remind(): int
{
    $days = (int)setting('auto_remind_days', '3');
    if ($days <= 0) return 0;
    $posts = all("SELECT * FROM posts WHERE status = 'published' AND required = 1 AND auto_reminded = 0 AND published_at <= ?", [date('Y-m-d H:i:s', time() - $days * 86400)]);
    $sent = 0;
    foreach ($posts as $p) {
        q('UPDATE posts SET auto_reminded = 1 WHERE id = ?', [$p['id']]);
        $params = [':pid' => $p['id']];
        $unitCond = '';
        if ($p['unit_id'] !== null) { $unitCond = ' AND u.unit_id = :unit'; $params[':unit'] = (int)$p['unit_id']; }
        $missing = all("SELECT u.id, u.name, u.email, u.email_notify, u.notify_mode, u.push_on, u.role, u.unit_id FROM users u WHERE u.status = 'active'$unitCond AND NOT EXISTS (SELECT 1 FROM acks k WHERE k.post_id = :pid AND k.user_id = u.id)", $params);
        if (!$missing) continue;
        notify_users($missing, 'remind', 'Hatırlatma: ' . $p['title'], 'Zorunlu okuma — henüz onaylamadınız.', '#/p/' . $p['id'], [
            'subject' => 'Hatırlatma: ' . $p['title'],
            'heading' => 'Okumanızı bekleyen bir içerik var',
            'lines' => ['“' . $p['title'] . '” zorunlu okuma olarak paylaşıldı ve henüz onayınızı almadık. Lütfen okuyup “Okudum, anladım” ile onaylayın.'],
            'button' => 'Şimdi oku',
        ], 'notoff');
        $sent += count($missing);
    }
    return $sent;
}

/** Belge geçerlilik / gözden geçirme tarihi uyarıları */
function job_review(): int
{
    $warn = max(1, (int)setting('review_warn_days', '14'));
    $today = date('Y-m-d');
    $limit = date('Y-m-d', strtotime("+$warn days"));
    $posts = all("SELECT * FROM posts WHERE status = 'published' AND review_at IS NOT NULL AND review_at <= ?", [$limit]);
    $sent = 0;
    foreach ($posts as $p) {
        $expired = $p['review_at'] <= $today;
        $tag = ($expired ? 'expired:' : 'warn:') . $p['review_at'];
        if ($p['review_notified'] === $tag) continue;
        q('UPDATE posts SET review_notified = ? WHERE id = ?', [$tag, $p['id']]);
        $to = active_users_sql("AND (role = 'admin' OR id = " . (int)$p['author_id'] . ')');
        $when = date('d.m.Y', strtotime($p['review_at']));
        $t = $expired ? 'Gözden geçirme tarihi geçti: ' . $p['title'] : 'Gözden geçirme yaklaşıyor: ' . $p['title'];
        notify_users($to, 'review', $t, 'Geçerlilik tarihi: ' . $when, '#/p/' . $p['id'], [
            'subject' => $t,
            'heading' => $expired ? 'Belgenin gözden geçirme tarihi geçti' : 'Belgenin gözden geçirme tarihi yaklaşıyor',
            'lines' => ['“' . $p['title'] . '” için belirlenen tarih: ' . $when . '.', 'Belgeyi güncelleyip yeni tarih girebilir veya geçerliliğini uzatabilirsiniz.'],
            'button' => 'Belgeyi aç',
        ], 'notoff');
        $sent++;
    }
    return $sent;
}

/* =================================================================== */
/* Yedekleme                                                            */
/* =================================================================== */

function backup_dir(): string
{
    $d = NM_ROOT . '/data/backups';
    if (!is_dir($d)) mkdir($d, 0755, true);
    if (!is_file($d . '/.htaccess')) file_put_contents($d . '/.htaccess', "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
    return $d;
}

/** Veritabanının tutarlı bir kopyasını (SQLite dosyası veya MySQL SQL dökümü) üretir */
function backup_database_file(string $tmpDir): string
{
    if (DB_DRIVER === 'mysql') {
        $path = $tmpDir . '/nobetmed-veritabani.sql';
        $fh = fopen($path, 'w');
        fwrite($fh, "-- NöbetMed MySQL yedeği " . now() . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
        foreach (db()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
            $create = db()->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM)[1];
            fwrite($fh, "DROP TABLE IF EXISTS `$t`;\n$create;\n");
            // Büyük tablolar belleği doldurmasın: satırları tamponlamadan oku
            db()->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
            $st = db()->query("SELECT * FROM `$t`");
            while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
                $vals = array_map(fn($v) => $v === null ? 'NULL' : db()->quote((string)$v), $row);
                fwrite($fh, "INSERT INTO `$t` (`" . implode('`,`', array_keys($row)) . '`) VALUES (' . implode(',', $vals) . ");\n");
            }
            $st->closeCursor();
            db()->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
            fwrite($fh, "\n");
        }
        fclose($fh);
        return $path;
    }
    $path = $tmpDir . '/nobetmed-veritabani.sqlite';
    @unlink($path);
    try {
        db()->exec('VACUUM INTO ' . db()->quote($path));
    } catch (Throwable $e) {
        db()->exec('PRAGMA wal_checkpoint(FULL)');
        copy(sqlite_path(), $path);
    }
    return $path;
}

/** Yedek ZIP'i oluşturur. $withFiles: yüklenen dosyalar da eklensin mi. Döner: zip yolu */
function backup_create(bool $withFiles, bool $keep): string
{
    if (!class_exists('ZipArchive')) throw new RuntimeException('Sunucuda ZIP desteği yok; yalnızca veritabanı indirilebilir.');
    if (function_exists('set_time_limit')) @set_time_limit(0);
    $dir = backup_dir();
    $tmp = $dir . '/tmp-' . bin2hex(random_bytes(4));
    mkdir($tmp);
    $dbFile = backup_database_file($tmp);
    // Ad tahmin edilemesin (sunucu .htaccess'i yok sayarsa bile yedek indirilemesin)
    $name = 'nobetmed-yedek-' . date('Y-m-d-His') . '-' . bin2hex(random_bytes(6)) . ($withFiles ? '-tam' : '') . '.zip';
    $zipPath = ($keep ? $dir : $tmp) . '/' . $name;
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Yedek dosyası oluşturulamadı.');
    $zip->addFile($dbFile, basename($dbFile));
    $zip->addFromString('BENIOKU.txt', "NöbetMed yedeği — " . now() . "\n\nGeri yüklemek için:\n- SQLite: dosyayı data/ klasörüne koyun ve data/.dbname.php içindeki adı bu dosyanın adıyla değiştirin.\n- MySQL: phpMyAdmin > İçe aktar ile .sql dosyasını yükleyin.\n" . ($withFiles ? "- uploads/ klasörünü sitenizdeki uploads/ klasörünün yerine koyun.\n" : "- Bu yedek yalnızca veritabanını içerir; dosyalar için 'Dosyalar dahil' yedeği alın.\n"));
    if ($withFiles) {
        foreach (glob(NM_ROOT . '/uploads/*.bin') ?: [] as $f) $zip->addFile($f, 'uploads/' . basename($f));
        foreach (glob(NM_ROOT . '/uploads/2*') ?: [] as $f) if (is_file($f) && !str_ends_with($f, '.bin')) $zip->addFile($f, 'uploads/' . basename($f));
        foreach (glob(NM_ROOT . '/uploads/avatars/*') ?: [] as $f) if (is_file($f)) $zip->addFile($f, 'uploads/avatars/' . basename($f));
    }
    $zip->close();
    @unlink($dbFile);
    if ($keep) {
        @rmdir($tmp);
        // En fazla 4 otomatik yedek sakla
        $all = glob($dir . '/nobetmed-yedek-*.zip') ?: [];
        rsort($all);
        foreach (array_slice($all, 4) as $old) @unlink($old);
    }
    return $zipPath;
}

function backup_list(): array
{
    $out = [];
    foreach (glob(backup_dir() . '/nobetmed-yedek-*.zip') ?: [] as $f) {
        $out[] = ['name' => basename($f), 'size' => filesize($f), 'at' => date('Y-m-d H:i:s', filemtime($f))];
    }
    usort($out, fn($a, $b) => strcmp($b['name'], $a['name']));
    return $out;
}
