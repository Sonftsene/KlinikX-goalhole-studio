<?php
/**
 * NöbetMed — ek API işlemleri: bildirim merkezi, telefon bildirimi, rehber, nöbetlerim,
 * okuma raporu, yedekleme, işlem günlüğü, şablonlar, davetler, belge metni.
 * (api.php içindeki yardımcılar: s(), i(), b(), arr(), out(), fail(), need_user() …)
 */
declare(strict_types=1);

/* ---------------- Bildirim merkezi ---------------- */

function a_notif_list(): void
{
    $me = need_user();
    $rows = all('SELECT id, title, body, url, kind, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40', [$me['id']]);
    out(['items' => array_map(fn($r) => ['id' => (int)$r['id'], 'title' => $r['title'], 'body' => $r['body'], 'url' => $r['url'], 'kind' => $r['kind'], 'at' => $r['created_at'], 'read' => $r['read_at'] !== null], $rows)]);
}

function a_notif_read(): void
{
    $me = need_user();
    $id = i('id');
    if ($id) q('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', [now(), $id, $me['id']]);
    else q('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [now(), $me['id']]);
    out();
}

/* ---------------- Telefon bildirimi (Web Push) ---------------- */

function a_push_key(): void
{
    need_user();
    if (!push_ready()) fail('Telefon bildirimleri bu sunucuda kullanılamıyor.', 400);
    $k = push_keys();
    if (!$k) fail('Bildirim anahtarı oluşturulamadı (OpenSSL gerekli).', 500);
    out(['key' => $k['public']]);
}

function a_push_subscribe(): void
{
    $me = need_user();
    $endpoint = s('endpoint', 2000);
    // Yalnızca bilinen push servisleri (FCM, Mozilla, Apple, Windows): sunucu başka adreslere istek atmasın.
    // Yerel geliştirme sunucusunda sahte push servisine izin verilir.
    $localDev = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true) && preg_match('#^http://127\.0\.0\.1:\d+/#', $endpoint);
    $allowed = function_exists('push_endpoint_allowed') ? push_endpoint_allowed($endpoint) : (bool)preg_match('#^https://#', $endpoint);
    if (!$allowed && !$localDev) fail('Geçersiz bildirim adresi.');
    $hash = hash('sha256', $endpoint);
    q('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [$hash]);
    q('INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [$me['id'], $endpoint, $hash, s('p256dh', 255), s('auth', 100), now()]);
    q('UPDATE users SET push_on = 1 WHERE id = ?', [$me['id']]);
    out();
}

function a_push_unsubscribe(): void
{
    $me = need_user();
    q('DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [hash('sha256', s('endpoint', 2000)), $me['id']]);
    out();
}

function a_push_test(): void
{
    $me = need_user();
    notify_users([one('SELECT * FROM users WHERE id = ?', [$me['id']])], 'test', 'Bildirimler çalışıyor 🎉', 'Bu bir deneme bildirimidir.', '#/', null);
    out(['devices' => (int)val('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', [$me['id']])]);
}

/** Servis çalışanı (sw.js) push geldiğinde bunu çağırır: GET, oturum çerezine göre */
function a_push_pending_get(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    // Yalnızca service worker'ın isteği (CSRF'siz GET olduğu için başka sitelerden tetiklenmesin)
    if (($_SERVER['HTTP_X_NM_SW'] ?? '') !== '1') { http_response_code(400); echo json_encode(['ok' => false]); return; }
    $me = current_user();
    if (!$me) { echo json_encode(['ok' => true, 'items' => []]); return; }
    $rows = all('SELECT id, title, body, url FROM notifications WHERE user_id = ? AND read_at IS NULL AND created_at >= ? ORDER BY id DESC LIMIT 5', [$me['id'], date('Y-m-d H:i:s', time() - 900)]);
    echo json_encode(['ok' => true, 'items' => array_map(fn($r) => ['id' => (int)$r['id'], 'title' => $r['title'], 'body' => $r['body'], 'url' => $r['url'], 'tag' => 'n' . $r['id']], $rows)], JSON_UNESCAPED_UNICODE);
}

/* ---------------- Rehber ve bugün nöbette ---------------- */

function a_people_list(): void
{
    need_user();
    $today = date('Y-m-d');
    $todayShifts = all("SELECT s.name, s.code, s.label, s.kind, s.start_time, s.end_time, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ?", [$today]);
    $rows = all("SELECT id, name, email, phone, extension, title_id, unit_id, role, last_seen_at FROM users WHERE status = 'active' ORDER BY name");
    out(['people' => array_map(function ($u) use ($todayShifts) {
        $on = null;
        foreach ($todayShifts as $s) if (names_match((string)$s['name'], (string)$u['name'])) { $on = ['code' => $s['code'], 'label' => $s['label'], 'kind' => $s['kind'], 'start' => $s['start_time'], 'end' => $s['end_time']]; break; }
        return ['id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'], 'phone' => $u['phone'], 'extension' => $u['extension'],
            'title_id' => $u['title_id'] !== null ? (int)$u['title_id'] : null, 'unit_id' => $u['unit_id'] !== null ? (int)$u['unit_id'] : null,
            'role' => $u['role'], 'last_seen_at' => $u['last_seen_at'], 'today' => $on];
    }, $rows)]);
}

/** Bugün (veya verilen gün) nöbette olanlar, vardiyaya göre gruplu */
function a_shifts_day(): void
{
    need_user();
    $date = s('date', 10) ?: date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) fail('Geçersiz tarih.');
    $rows = all("SELECT s.*, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ? ORDER BY s.start_time, s.name", [$date]);
    // Dünden devam eden gece / 24 saat nöbetleri (bitiş saati başlangıçtan önce)
    $prev = date('Y-m-d', strtotime($date . ' -1 day'));
    $carry = all("SELECT s.*, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ? AND s.kind = 'shift' AND s.start_time IS NOT NULL AND s.end_time IS NOT NULL AND s.end_time <= s.start_time ORDER BY s.name", [$prev]);
    $users = all("SELECT id, name, phone, extension FROM users WHERE status = 'active'");
    $find = function ($name) use ($users) { foreach ($users as $u) if (names_match((string)$name, (string)$u['name'])) return $u; return null; };
    $person = function ($r) use ($find) { $u = $find($r['name']); return ['name' => $r['name'], 'title' => $r['title'], 'user_id' => $u ? (int)$u['id'] : null, 'phone' => $u['phone'] ?? null, 'extension' => $u['extension'] ?? null, 'roster' => $r['roster_name']]; };
    $groups = [];
    foreach ($rows as $r) {
        $key = $r['kind'] . '|' . $r['code'];
        if (!isset($groups[$key])) $groups[$key] = ['code' => $r['code'], 'label' => $r['label'], 'kind' => $r['kind'], 'start' => $r['start_time'], 'end' => $r['end_time'], 'people' => []];
        $groups[$key]['people'][] = $person($r);
    }
    $out = array_values($groups);
    usort($out, fn($a, $b) => [$a['kind'] !== 'shift', $a['start'] ?? '99'] <=> [$b['kind'] !== 'shift', $b['start'] ?? '99']);
    out(['date' => $date, 'groups' => $out, 'carry' => array_map(fn($r) => $person($r) + ['code' => $r['code'], 'end' => $r['end_time']], $carry), 'has_data' => (bool)val('SELECT COUNT(*) FROM roster_shifts')]);
}

/** Benim nöbetlerim: önümüzdeki 60 gün + bu ay ve gelecek ay özeti için tüm ay */
function a_shifts_mine2(): void
{
    $me = need_user();
    $from = date('Y-m-01', strtotime('-1 month'));
    $to = date('Y-m-d', strtotime('+70 days'));
    $rows = shifts_for_user($me, $from, $to);
    out(['entries' => array_map('shift_row_out', $rows), 'has_data' => (bool)val('SELECT COUNT(*) FROM roster_shifts'), 'name' => $me['name']]);
}

/** Tarayıcının Excel'den çıkardığı nöbetleri kaydeder (liste yükleyen yayıncı) */
function a_rosters_shifts_save(): void
{
    $me = need_publisher();
    $rid = (int)i('roster_id');
    $fid = (int)i('file_id');
    $period = s('period', 7);
    if (!valid_id('rosters', $rid)) fail('Liste bulunamadı.', 404);
    if (!one('SELECT id FROM roster_files WHERE roster_id = ? AND attachment_id = ?', [$rid, $fid])) fail('Dosya bu listeye ait değil.', 400);
    if (!preg_match('/^\d{4}-\d{2}$/', $period)) fail('Geçersiz dönem.');
    $entries = array_slice(arr('entries'), 0, 6000);
    db()->beginTransaction();
    q('DELETE FROM roster_shifts WHERE roster_id = ?', [$rid]);
    $st = db()->prepare('INSERT INTO roster_shifts (roster_id, file_id, name, title, date, code, label, kind, hours, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $n = 0;
    foreach ($entries as $e) {
        if (!is_array($e)) continue;
        $name = mb_substr(trim((string)($e['name'] ?? '')), 0, 120);
        $date = (string)($e['date'] ?? '');
        $code = mb_substr(trim((string)($e['code'] ?? '')), 0, 20);
        if ($name === '' || $code === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) continue;
        $kind = in_array($e['kind'] ?? '', ['shift', 'leave', 'off'], true) ? $e['kind'] : 'shift';
        $hm = fn($v) => is_string($v) && preg_match('/^\d{2}:\d{2}$/', $v) ? $v : null;
        $st->execute([$rid, $fid, $name, mb_substr((string)($e['title'] ?? ''), 0, 80) ?: null, $date, $code, mb_substr((string)($e['label'] ?? ''), 0, 60) ?: null, $kind,
            isset($e['hours']) && is_numeric($e['hours']) ? (int)$e['hours'] : null, $hm($e['start'] ?? null), $hm($e['end'] ?? null)]);
        $n++;
    }
    q('UPDATE rosters SET period = ?, parsed_file_id = ? WHERE id = ?', [$period, $fid, $rid]);
    db()->commit();
    audit($me, 'roster.parse', 'Liste #' . $rid, "$n nöbet kaydı, dönem $period");
    out(['saved' => $n]);
}

/** Listenin ayını düzelt: kayıtların tarihleri yeni aya taşınır */
function a_rosters_period(): void
{
    $me = need_publisher();
    $rid = (int)i('id');
    $period = s('period', 7);
    if (!preg_match('/^(\d{4})-(\d{2})$/', $period, $m) || (int)$m[2] < 1 || (int)$m[2] > 12) fail('Geçersiz dönem.');
    $r = one('SELECT * FROM rosters WHERE id = ?', [$rid]) ?? fail('Liste bulunamadı.', 404);
    $days = (int)date('t', strtotime($period . '-01'));
    foreach (all('SELECT id, date FROM roster_shifts WHERE roster_id = ?', [$rid]) as $x) {
        $d = (int)substr($x['date'], 8, 2);
        if ($d > $days) q('DELETE FROM roster_shifts WHERE id = ?', [$x['id']]);
        else q('UPDATE roster_shifts SET date = ? WHERE id = ?', [$period . '-' . str_pad((string)$d, 2, '0', STR_PAD_LEFT), $x['id']]);
    }
    q('UPDATE rosters SET period = ? WHERE id = ?', [$period, $rid]);
    audit($me, 'roster.period', $r['name'], 'Dönem: ' . $period);
    out(['period' => $period]);
}

/* ---------------- Okuma raporu ---------------- */

function a_report_reads(): void
{
    need_publisher();
    $posts = all("SELECT p.id, p.title, p.unit_id, p.published_at, p.review_at, c.name AS category FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status = 'published' AND p.required = 1 ORDER BY p.published_at DESC LIMIT 200");
    $users = all("SELECT id, name, email, title_id, unit_id FROM users WHERE status = 'active' ORDER BY name");
    $acks = [];
    if ($posts) {
        $ids = implode(',', array_map(fn($p) => (int)$p['id'], $posts));
        foreach (all("SELECT post_id, user_id, created_at FROM acks WHERE post_id IN ($ids)") as $a) $acks[$a['post_id']][$a['user_id']] = $a['created_at'];
    }
    out(['posts' => array_map(fn($p) => ['id' => (int)$p['id'], 'title' => $p['title'], 'category' => $p['category'], 'unit_id' => $p['unit_id'] !== null ? (int)$p['unit_id'] : null, 'published_at' => $p['published_at'], 'review_at' => $p['review_at']], $posts),
        'users' => array_map(fn($u) => ['id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'], 'title_id' => $u['title_id'] !== null ? (int)$u['title_id'] : null, 'unit_id' => $u['unit_id'] !== null ? (int)$u['unit_id'] : null], $users),
        'acks' => (object)$acks, 'generated_at' => now()]);
}

/** Gözden geçirme tarihi yaklaşan / geçen belgeler */
function a_report_reviews(): void
{
    need_publisher();
    $rows = all("SELECT p.id, p.title, p.review_at, u.name AS author FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.status = 'published' AND p.review_at IS NOT NULL ORDER BY p.review_at LIMIT 200");
    out(['items' => array_map(fn($r) => ['id' => (int)$r['id'], 'title' => $r['title'], 'review_at' => $r['review_at'], 'author' => $r['author']], $rows)]);
}

/* ---------------- Yedekleme ---------------- */

function a_backup_list(): void
{
    need_admin();
    out(['items' => backup_list(), 'zip' => class_exists('ZipArchive'), 'weekly' => setting('backup_weekly', '1') === '1', 'last' => (int)setting('backup_last', '0') ? date('Y-m-d H:i:s', (int)setting('backup_last')) : null]);
}

function a_backup_create(): void
{
    $me = need_admin();
    try { $path = backup_create(false, true); } catch (Throwable $e) { fail($e->getMessage()); }
    set_setting('backup_last', (string)time());
    audit($me, 'backup.create', basename($path));
    out(['items' => backup_list()]);
}

function a_backup_delete(): void
{
    $me = need_admin();
    $name = basename(s('name', 120));
    if (!preg_match('/^nobetmed-yedek-[\w-]+\.zip$/', $name)) fail('Geçersiz dosya.');
    @unlink(backup_dir() . '/' . $name);
    audit($me, 'backup.delete', $name);
    out(['items' => backup_list()]);
}

/** GET: yedeği indir. ?name=… (kayıtlı yedek) veya ?full=0|1 (anlık yedek). CSRF anahtarı sorguda. */
function a_backup_download_get(): void
{
    nm_session();
    $me = current_user();
    if (!$me || $me['role'] !== 'admin' || !hash_equals((string)$_SESSION['csrf'], (string)($_GET['csrf'] ?? ''))) {
        http_response_code(403);
        echo 'Yetkiniz yok veya oturum süresi doldu.';
        return;
    }
    @set_time_limit(0);
    $name = basename((string)($_GET['name'] ?? ''));
    $temp = false;
    if ($name !== '' && preg_match('/^nobetmed-yedek-[\w-]+\.zip$/', $name)) {
        $path = backup_dir() . '/' . $name;
    } else {
        try {
            $path = backup_create(!empty($_GET['full']), false);
            $temp = true;
        } catch (Throwable $e) {
            // ZIP yoksa yalnızca veritabanını gönder
            $tmp = backup_dir() . '/tmp-' . bin2hex(random_bytes(4));
            mkdir($tmp);
            $path = backup_database_file($tmp);
            $temp = true;
        }
    }
    if (!is_file($path)) { http_response_code(404); echo 'Yedek bulunamadı.'; return; }
    audit($me, 'backup.download', basename($path));
    session_write_close();
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($path) . '"');
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: no-store');
    while (ob_get_level()) ob_end_clean();
    readfile($path);
    if ($temp) { @unlink($path); @rmdir(dirname($path)); }
}

/* ---------------- İşlem günlüğü ---------------- */

function a_audit_list(): void
{
    need_admin();
    $q = s('q', 80);
    $offset = max(0, (int)i('offset'));
    $p = [];
    $where = '1=1';
    if ($q !== '') {
        $p[':q1'] = '%' . tr_lower($q) . '%'; $p[':q2'] = $p[':q1']; $p[':q3'] = $p[':q1']; $p[':q4'] = $p[':q1'];
        $where = '(' . like_expr('user_name') . ' LIKE :q1 OR ' . like_expr('action') . ' LIKE :q2 OR ' . like_expr('target') . ' LIKE :q3 OR ' . like_expr('detail') . ' LIKE :q4)';
    }
    $rows = all("SELECT * FROM audit_log WHERE $where ORDER BY id DESC LIMIT 51 OFFSET $offset", $p);
    out(['items' => array_map(fn($r) => ['id' => (int)$r['id'], 'user' => $r['user_name'], 'action' => $r['action'], 'target' => $r['target'], 'detail' => $r['detail'], 'ip' => $r['ip'], 'at' => $r['at']], array_slice($rows, 0, 50)), 'has_more' => count($rows) > 50]);
}

/* ---------------- Duyuru şablonları ---------------- */

function a_templates_list(): void
{
    need_user();
    out(['items' => array_map(fn($t) => ['id' => (int)$t['id'], 'title' => $t['title'], 'body' => $t['body'], 'category_id' => $t['category_id'] !== null ? (int)$t['category_id'] : null, 'required' => (bool)$t['required']], all('SELECT * FROM templates ORDER BY sort, id'))]);
}

function a_templates_save(): void
{
    $me = need_publisher();
    $title = s('title', 200);
    $body = s('body', 20000);
    if (mb_strlen($title) < 2 || $body === '') fail('Şablon adı ve metni gerekli.');
    $cat = i('category_id');
    if ($cat !== null && !valid_id('categories', $cat)) $cat = null;
    q('INSERT INTO templates (title, body, category_id, required, created_by, created_at, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$title, $body, $cat, b('required') ? 1 : 0, $me['id'], now(), (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM templates')]);
    audit($me, 'template.create', $title);
    a_templates_list();
}

function a_templates_delete(): void
{
    $me = need_publisher();
    $t = one('SELECT title FROM templates WHERE id = ?', [(int)i('id')]);
    q('DELETE FROM templates WHERE id = ?', [(int)i('id')]);
    if ($t) audit($me, 'template.delete', $t['title']);
    a_templates_list();
}

/* ---------------- Davetler (QR ile kayıt, listeden toplu hesap) ---------------- */

function invite_out(array $r): array
{
    return ['id' => (int)$r['id'], 'token' => $r['token'], 'kind' => $r['kind'], 'name' => $r['name'], 'email' => $r['email'],
        'title_id' => $r['title_id'] !== null ? (int)$r['title_id'] : null, 'unit_id' => $r['unit_id'] !== null ? (int)$r['unit_id'] : null,
        'role' => $r['role'], 'auto_approve' => (bool)$r['auto_approve'], 'uses' => (int)$r['uses'], 'max_uses' => (int)$r['max_uses'],
        'expires' => $r['expires'], 'created_at' => $r['created_at'], 'used' => $r['used_by'] !== null || ((int)$r['uses'] >= (int)$r['max_uses']),
        'url' => base_url() . '?davet=' . $r['token']];
}

function a_invites_list(): void
{
    need_admin();
    out(['items' => array_map('invite_out', all('SELECT * FROM invites WHERE revoked = 0 AND (expires IS NULL OR expires > ?) ORDER BY id DESC LIMIT 300', [now()]))]);
}

function a_invites_general(): void
{
    $me = need_admin();
    $unit = i('unit_id');
    if ($unit !== null && !valid_id('units', $unit)) $unit = null;
    $days = max(1, min(365, (int)(i('days') ?? 30)));
    $token = random_token(12);
    q('INSERT INTO invites (token, kind, unit_id, role, auto_approve, max_uses, uses, expires, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        [$token, 'general', $unit, 'member', b('auto_approve') ? 1 : 0, 500, date('Y-m-d H:i:s', time() + $days * 86400), $me['id'], now()]);
    audit($me, 'invite.general', 'QR davet', ($unit ? unit_name_of($unit) : 'Tüm birimler') . ", $days gün");
    out(['invite' => invite_out(one('SELECT * FROM invites WHERE token = ?', [$token]))]);
}

function unit_name_of(?int $id): string
{
    return $id ? (string)(val('SELECT name FROM units WHERE id = ?', [$id]) ?: '') : '';
}

/** Nöbet listelerindeki adlardan, henüz hesabı olmayanlar */
function a_invites_candidates(): void
{
    need_admin();
    $names = all('SELECT s.name, MAX(s.title) AS title FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id GROUP BY s.name ORDER BY s.name');
    $users = all('SELECT name FROM users');
    $invited = all("SELECT name FROM invites WHERE kind = 'personal' AND revoked = 0 AND used_by IS NULL AND name IS NOT NULL");
    $titles = all('SELECT id, name FROM titles');
    $out = [];
    foreach ($names as $n) {
        $nm = (string)$n['name'];
        foreach ($users as $u) if (names_match($nm, (string)$u['name'])) continue 2;
        $inv = false;
        foreach ($invited as $iv) if (names_match($nm, (string)$iv['name'])) { $inv = true; break; }
        $tid = null;
        foreach ($titles as $t) if (tr_lower((string)$t['name']) === tr_lower(trim((string)$n['title']))) $tid = (int)$t['id'];
        $out[] = ['name' => mb_convert_case(mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $nm), 'UTF-8'), MB_CASE_TITLE, 'UTF-8'), 'roster_name' => $nm, 'title' => $n['title'], 'title_id' => $tid, 'invited' => $inv];
    }
    out(['items' => $out]);
}

function a_invites_personal(): void
{
    $me = need_admin();
    $created = [];
    $mailed = 0;
    foreach (array_slice(arr('people'), 0, 200) as $p) {
        if (!is_array($p)) continue;
        $name = mb_substr(trim((string)($p['name'] ?? '')), 0, 120);
        if (mb_strlen($name) < 3) continue;
        $email = mb_strtolower(trim((string)($p['email'] ?? '')));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = '';
        if ($email !== '' && one('SELECT id FROM users WHERE email = ?', [$email])) continue;
        $tid = isset($p['title_id']) && valid_id('titles', (int)$p['title_id']) ? (int)$p['title_id'] : null;
        $uid = isset($p['unit_id']) && valid_id('units', (int)$p['unit_id']) ? (int)$p['unit_id'] : null;
        $token = random_token(12);
        q('INSERT INTO invites (token, kind, name, email, title_id, unit_id, role, auto_approve, max_uses, uses, expires, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?, ?)',
            [$token, 'personal', $name, $email ?: null, $tid, $uid, 'member', date('Y-m-d H:i:s', time() + 60 * 86400), $me['id'], now()]);
        $inv = invite_out(one('SELECT * FROM invites WHERE token = ?', [$token]));
        $created[] = $inv;
        if ($email !== '' && mail_ready()) {
            $mailed += mail_queue_to([['name' => $name, 'email' => $email]], 'Portala davetlisiniz', 'Merhaba ' . explode(' ', $name)[0] . ', portala davetlisiniz',
                [setting('org_name', 'Klinik Portalı') . ' ekibine katılmanız için hesabınız hazırlandı. Aşağıdaki bağlantıdan e-postanızı ve şifrenizi belirleyerek hemen giriş yapabilirsiniz.', 'Bağlantı size özeldir ve 60 gün geçerlidir.'],
                'Hesabımı oluştur', $inv['url'], 'invite', false);
        }
    }
    audit($me, 'invite.personal', count($created) . ' kişisel davet', $mailed ? "$mailed e-posta" : '');
    out(['items' => $created, 'mailed' => $mailed]);
}

function a_invites_revoke(): void
{
    $me = need_admin();
    q('UPDATE invites SET revoked = 1 WHERE id = ?', [(int)i('id')]);
    audit($me, 'invite.revoke', 'Davet #' . (int)i('id'));
    out();
}

/** Herkese açık: davet bilgisini göster (kayıt formu için) */
function invite_valid(string $token): ?array
{
    if ($token === '') return null;
    $r = one('SELECT * FROM invites WHERE token = ? AND revoked = 0', [$token]);
    if (!$r || ($r['expires'] && $r['expires'] < now()) || (int)$r['uses'] >= (int)$r['max_uses']) return null;
    return $r;
}

function a_invite_get(): void
{
    $r = invite_valid(s('token', 40));
    if (!$r) fail('Bu davet bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Yöneticinizden yeni bağlantı isteyin.', 404);
    out(['invite' => ['kind' => $r['kind'], 'name' => $r['name'], 'email' => $r['email'], 'title_id' => $r['title_id'] !== null ? (int)$r['title_id'] : null, 'unit_id' => $r['unit_id'] !== null ? (int)$r['unit_id'] : null, 'auto_approve' => (bool)$r['auto_approve']], 'org_name' => setting('org_name', 'Klinik Portalı')]);
}

/* ---------------- Belge metni (belge içinde arama) ---------------- */

function a_attachments_text(): void
{
    $me = need_user();
    $id = (int)i('id');
    $a = one('SELECT * FROM attachments WHERE id = ?', [$id]) ?? fail('Dosya bulunamadı.', 404);
    if ((int)$a['user_id'] !== (int)$me['id'] && !is_publisher($me)) fail('Yetkiniz yok.', 403);
    global $IN;
    $text = is_string($IN['text'] ?? null) ? $IN['text'] : '';
    $text = mb_substr(preg_replace('/[ \t]+/u', ' ', str_replace("\0", '', $text)), 0, 400000);
    q('UPDATE attachments SET text_content = ?, text_done = 1 WHERE id = ?', [$text, $id]);
    out(['length' => mb_strlen($text)]);
}

/* ---------------- Parmak izi / Face ID ile giriş (passkey) ---------------- */

function passkey_ready(): void
{
    if (!function_exists('wa_verify_registration')) fail('Bu sunucuda parmak izi ile giriş kullanılamıyor.', 400);
}

function a_passkey_reg_begin(): void
{
    $me = need_user();
    passkey_ready();
    $challenge = random_bytes(32);
    $_SESSION['wa_reg'] = ['v' => $challenge, 't' => time()];
    $exclude = array_map(fn($r) => ['type' => 'public-key', 'id' => $r['credential_id']], all('SELECT credential_id FROM passkeys WHERE user_id = ?', [$me['id']]));
    out(['publicKey' => [
        'challenge' => wa_b64u_enc($challenge),
        'rp' => ['name' => setting('org_name', 'NöbetMed'), 'id' => wa_rp_id_from_server()],
        'user' => ['id' => wa_b64u_enc('u' . $me['id']), 'name' => $me['email'], 'displayName' => $me['name']],
        'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7], ['type' => 'public-key', 'alg' => -257]],
        'authenticatorSelection' => ['residentKey' => 'required', 'requireResidentKey' => true, 'userVerification' => 'required'],
        'attestation' => 'none',
        'timeout' => 60000,
        'excludeCredentials' => $exclude,
    ]]);
}

function passkey_take_challenge(string $kind): string
{
    $c = $_SESSION['wa_' . $kind] ?? null;
    unset($_SESSION['wa_' . $kind]);
    if (!$c || $c['t'] < time() - 300) return '';
    return $c['v'];
}

function device_label(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $os = preg_match('/iPhone/i', $ua) ? 'iPhone' : (preg_match('/iPad/i', $ua) ? 'iPad' : (preg_match('/Android/i', $ua) ? 'Android' : (preg_match('/Mac OS X/i', $ua) ? 'Mac' : (preg_match('/Windows/i', $ua) ? 'Windows' : 'Cihaz'))));
    $br = preg_match('/Edg\//', $ua) ? 'Edge' : (preg_match('/Chrome\//', $ua) ? 'Chrome' : (preg_match('/Safari\//', $ua) ? 'Safari' : (preg_match('/Firefox\//', $ua) ? 'Firefox' : '')));
    return trim("$os $br");
}

function a_passkey_reg_finish(): void
{
    $me = need_user();
    passkey_ready();
    try {
        $r = wa_verify_registration(wa_b64u_dec(s('clientDataJSON', 20000)), wa_b64u_dec(s('attestationObject', 20000)), passkey_take_challenge('reg'), wa_origin_from_server(), wa_rp_id_from_server());
    } catch (Throwable $e) { fail($e->getMessage()); }
    $cid = wa_b64u_enc($r['credential_id']);
    if (one('SELECT id FROM passkeys WHERE credential_id = ?', [$cid])) fail('Bu cihaz zaten kayıtlı.', 409);
    q('INSERT INTO passkeys (user_id, credential_id, public_key, sign_count, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [$me['id'], $cid, $r['public_key_pem'], (int)$r['sign_count'], device_label(), now()]);
    audit($me, 'passkey.add', device_label());
    a_passkey_list();
}

function a_passkey_list(): void
{
    $me = need_user();
    out(['items' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'created_at' => $r['created_at'], 'last_used_at' => $r['last_used_at']], all('SELECT * FROM passkeys WHERE user_id = ? ORDER BY id', [$me['id']]))]);
}

function a_passkey_delete(): void
{
    $me = need_user();
    q('DELETE FROM passkeys WHERE id = ? AND user_id = ?', [(int)i('id'), $me['id']]);
    audit($me, 'passkey.delete', 'Kayıt #' . (int)i('id'));
    a_passkey_list();
}

function a_passkey_login_begin(): void
{
    passkey_ready();
    $challenge = random_bytes(32);
    $_SESSION['wa_login'] = ['v' => $challenge, 't' => time()];
    out(['publicKey' => ['challenge' => wa_b64u_enc($challenge), 'rpId' => wa_rp_id_from_server(), 'allowCredentials' => [], 'userVerification' => 'required', 'timeout' => 60000]]);
}

function a_passkey_login_finish(): void
{
    passkey_ready();
    $cid = s('rawId', 1000);
    $pk = $cid !== '' ? one('SELECT * FROM passkeys WHERE credential_id = ?', [wa_b64u_enc(wa_b64u_dec($cid))]) : null;
    if (!$pk) fail('Bu cihaz için kayıtlı bir giriş bulunamadı. Önce şifreyle girip Hesabım sayfasından parmak izini ekleyin.', 404);
    $uh = s('userHandle', 200);
    if ($uh !== '' && wa_b64u_dec($uh) !== 'u' . $pk['user_id']) fail('Doğrulama başarısız.', 401);
    try {
        $count = wa_verify_assertion(wa_b64u_dec(s('clientDataJSON', 20000)), wa_b64u_dec(s('authenticatorData', 5000)), wa_b64u_dec(s('signature', 2000)), passkey_take_challenge('login'), wa_origin_from_server(), wa_rp_id_from_server(), $pk['public_key'], (int)$pk['sign_count']);
    } catch (Throwable $e) { fail($e->getMessage(), 401); }
    $u = one('SELECT * FROM users WHERE id = ?', [$pk['user_id']]);
    if (!$u || $u['status'] !== 'active') fail('Hesabınız etkin değil.', 403);
    q('UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?', [$count, now(), $pk['id']]);
    login_user($u);
    audit($u, 'login.passkey', $pk['name'] ?? '');
    out(['must_change' => (int)($u['must_change'] ?? 0) === 1]);
}
