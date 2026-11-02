<?php
declare(strict_types=1);

require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/mail.php';
require __DIR__ . '/inc/notify.php';
require __DIR__ . '/inc/api_extra.php';
if (is_file(__DIR__ . '/inc/push.php')) require __DIR__ . '/inc/push.php';
if (is_file(__DIR__ . '/inc/webauthn.php')) require __DIR__ . '/inc/webauthn.php';

nm_session();

set_exception_handler(function (Throwable $e) {
    error_log('[NobetMed] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['ok' => false, 'error' => 'Sunucu hatası oluştu. Lütfen tekrar deneyin.']);
});

/** Bilinen uzantılar için MIME türü. Listede olmayan her dosya da yüklenebilir (application/octet-stream). */
const MIME_MAP = [
    'pdf' => 'application/pdf',
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
    'bmp' => 'image/bmp', 'avif' => 'image/avif', 'heic' => 'image/heic', 'heif' => 'image/heif', 'svg' => 'image/svg+xml',
    'tif' => 'image/tiff', 'tiff' => 'image/tiff',
    'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime', 'ogv' => 'video/ogg',
    'avi' => 'video/x-msvideo', 'mkv' => 'video/x-matroska', '3gp' => 'video/3gpp',
    'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'aac' => 'audio/aac', 'opus' => 'audio/ogg',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xlsm' => 'application/vnd.ms-excel.sheet.macroEnabled.12',
    'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
    'odt' => 'application/vnd.oasis.opendocument.text',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'csv' => 'text/csv', 'txt' => 'text/plain', 'md' => 'text/plain', 'log' => 'text/plain', 'json' => 'application/json',
    'xml' => 'text/plain', 'rtf' => 'application/rtf', 'zip' => 'application/zip', 'rar' => 'application/vnd.rar', '7z' => 'application/x-7z-compressed',
];
/** Tarayıcıda doğrudan (inline) açılmasında sakınca olmayan türler. Diğerleri her zaman indirme olarak gönderilir. */
const INLINE_SAFE = [
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/aac',
];
const ROLES = ['admin', 'editor', 'member'];
const ROSTER_KEEP_VERSIONS = 15;
const COLORS = ['teal', 'sky', 'indigo', 'violet', 'rose', 'amber', 'emerald', 'slate'];
const ICONS = ['megaphone', 'play', 'stethoscope', 'file', 'users', 'book', 'pill', 'shield', 'clipboard', 'heart', 'folder', 'bell'];
const POST_SELECT = "SELECT p.*, u.name AS author_name, u.title_id AS author_title_id,
    (SELECT COUNT(*) FROM attachments a WHERE a.post_id = p.id) AS att_count,
    (SELECT COUNT(*) FROM acks k WHERE k.post_id = p.id) AS ack_count,
    CASE WHEN v.user_id IS NULL THEN 0 ELSE 1 END AS viewed,
    CASE WHEN sv.user_id IS NULL THEN 0 ELSE 1 END AS saved,
    CASE WHEN mk.user_id IS NULL THEN 0 ELSE 1 END AS acked
  FROM posts p
  LEFT JOIN users u ON u.id = p.author_id
  LEFT JOIN views v ON v.post_id = p.id AND v.user_id = :me1
  LEFT JOIN saves sv ON sv.post_id = p.id AND sv.user_id = :me2
  LEFT JOIN acks mk ON mk.post_id = p.id AND mk.user_id = :me3";

$action = (string)($_GET['action'] ?? '');

if ($action === 'file') {
    serve_file();
    exit;
}
if ($action === 'push.pending') { a_push_pending_get(); exit; }
if ($action === 'backup.download') { a_backup_download_get(); exit; }

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Geçersiz istek.', 405);
if (!hash_equals((string)$_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) {
    fail('Oturum süresi doldu. Sayfayı yenileyin.', 419);
}

$IN = [];
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== false) {
    $IN = json_decode((string)file_get_contents('php://input'), true) ?: [];
} else {
    $IN = $_POST;
}

$routes = [
    'boot' => 'a_boot',
    'auth.setup' => 'a_setup',
    'auth.login' => 'a_login',
    'auth.register' => 'a_register',
    'auth.google' => 'a_google',
    'auth.logout' => 'a_logout',
    'auth.forgot' => 'a_forgot',
    'auth.reset' => 'a_reset',
    'me.update' => 'a_me_update',
    'me.password' => 'a_me_password',
    'counts' => 'a_counts',
    'posts.list' => 'a_posts_list',
    'posts.get' => 'a_posts_get',
    'posts.save' => 'a_posts_save',
    'posts.delete' => 'a_posts_delete',
    'posts.approve' => 'a_posts_approve',
    'posts.reject' => 'a_posts_reject',
    'posts.pin' => 'a_posts_pin',
    'posts.ack' => 'a_posts_ack',
    'posts.bookmark' => 'a_posts_bookmark',
    'posts.share' => 'a_posts_share',
    'posts.remind' => 'a_posts_remind',
    'upload.init' => 'a_upload_init',
    'upload.chunk' => 'a_upload_chunk',
    'upload.finish' => 'a_upload_finish',
    'guest.get' => 'a_guest_get',
    'rosters.list' => 'a_rosters_list',
    'rosters.save' => 'a_rosters_save',
    'rosters.delete' => 'a_rosters_delete',
    'rosters.upload' => 'a_rosters_upload',
    'rosters.versions' => 'a_rosters_versions',
    'rosters.restore' => 'a_rosters_restore',
    'admin.users' => 'a_admin_users',
    'admin.user.save' => 'a_admin_user_save',
    'admin.user.resetpw' => 'a_admin_user_resetpw',
    'admin.user.delete' => 'a_admin_user_delete',
    'tax.save' => 'a_tax_save',
    'tax.delete' => 'a_tax_delete',
    'settings.save' => 'a_settings_save',
    'notif.list' => 'a_notif_list',
    'notif.read' => 'a_notif_read',
    'push.key' => 'a_push_key',
    'push.subscribe' => 'a_push_subscribe',
    'push.unsubscribe' => 'a_push_unsubscribe',
    'push.test' => 'a_push_test',
    'people.list' => 'a_people_list',
    'shifts.day' => 'a_shifts_day',
    'shifts.my' => 'a_shifts_mine2',
    'rosters.shifts' => 'a_rosters_shifts_save',
    'rosters.period' => 'a_rosters_period',
    'report.reads' => 'a_report_reads',
    'report.reviews' => 'a_report_reviews',
    'backup.list' => 'a_backup_list',
    'backup.create' => 'a_backup_create',
    'backup.delete' => 'a_backup_delete',
    'audit.list' => 'a_audit_list',
    'shiftcodes.save' => 'a_shiftcodes_save',
    'setup.status' => 'a_setup_status',
    'templates.list' => 'a_templates_list',
    'templates.save' => 'a_templates_save',
    'templates.delete' => 'a_templates_delete',
    'invites.list' => 'a_invites_list',
    'invites.general' => 'a_invites_general',
    'invites.candidates' => 'a_invites_candidates',
    'invites.personal' => 'a_invites_personal',
    'invites.revoke' => 'a_invites_revoke',
    'invite.get' => 'a_invite_get',
    'attachments.text' => 'a_attachments_text',
    'passkey.reg.begin' => 'a_passkey_reg_begin',
    'passkey.reg.finish' => 'a_passkey_reg_finish',
    'passkey.list' => 'a_passkey_list',
    'passkey.delete' => 'a_passkey_delete',
    'passkey.login.begin' => 'a_passkey_login_begin',
    'passkey.login.finish' => 'a_passkey_login_finish',
    'settings.get' => 'a_settings_get',
    'mail.test' => 'a_mail_test',
    'mail.log' => 'a_mail_log',
];

if (!isset($routes[$action])) fail('Bilinmeyen işlem.', 404);
if (mail_ready() && (int)val('SELECT COUNT(*) FROM mail_queue WHERE sent_at IS NULL AND attempts < 3') > 0) mail_flush_after_response();
jobs_after_response();
$routes[$action]();

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

function out(array $data = [], int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['ok' => true] + $data + ['csrf' => $_SESSION['csrf'] ?? ''], JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function s(string $k, int $max = 255): string
{
    global $IN;
    $v = $IN[$k] ?? '';
    if (!is_scalar($v)) return '';
    $v = trim(str_replace("\0", '', (string)$v));
    return mb_substr($v, 0, $max);
}

function i(string $k): ?int
{
    global $IN;
    $v = $IN[$k] ?? null;
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    return (int)$v;
}

function b(string $k): bool
{
    global $IN;
    $v = $IN[$k] ?? false;
    return $v === true || $v === 1 || $v === '1' || $v === 'true';
}

function arr(string $k): array
{
    global $IN;
    $v = $IN[$k] ?? [];
    return is_array($v) ? $v : [];
}

function need_user(): array
{
    $u = current_user();
    if (!$u) fail('Bu işlem için giriş yapmalısınız.', 401);
    return $u;
}

function is_admin(?array $u): bool
{
    return $u && $u['role'] === 'admin';
}

function is_publisher(?array $u): bool
{
    return $u && ($u['role'] === 'admin' || $u['role'] === 'editor');
}

function need_admin(): array
{
    $u = need_user();
    if (!is_admin($u)) fail('Bu işlem yalnızca yöneticiler içindir.', 403);
    return $u;
}

function need_publisher(): array
{
    $u = need_user();
    if (!is_publisher($u)) fail('Bu işlem için yayın yetkisi gerekir.', 403);
    return $u;
}

function tr_lower(string $s): string
{
    return mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $s), 'UTF-8');
}

function like_expr(string $col): string
{
    static $registered = false;
    if (DB_DRIVER !== 'mysql') {
        if (!$registered) {
            db()->sqliteCreateFunction('nm_lower', fn($v) => tr_lower((string)$v), 1);
            $registered = true;
        }
        return "nm_lower($col)";
    }
    return $col;
}

function user_out(array $u): array
{
    return [
        'id' => (int)$u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'role' => $u['role'],
        'status' => $u['status'],
        'title_id' => $u['title_id'] !== null ? (int)$u['title_id'] : null,
        'unit_id' => $u['unit_id'] !== null ? (int)$u['unit_id'] : null,
        'created_at' => $u['created_at'],
        'last_seen_at' => $u['last_seen_at'],
        'has_password' => !empty($u['password_hash']),
        'email_notify' => (int)($u['email_notify'] ?? 1) === 1,
        'notify_mode' => $u['notify_mode'] ?? 'instant',
        'push_on' => (int)($u['push_on'] ?? 1) === 1,
        'phone' => $u['phone'] ?? null,
        'extension' => $u['extension'] ?? null,
        'must_change' => (int)($u['must_change'] ?? 0) === 1,
    ];
}

function login_user(array $u): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    q('UPDATE users SET last_seen_at = ? WHERE id = ?', [now(), $u['id']]);
}

function valid_id(string $table, ?int $id): bool
{
    if ($id === null) return false;
    return (bool)one("SELECT id FROM $table WHERE id = ?", [$id]);
}

function lists(): array
{
    return [
        'categories' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'icon' => $r['icon'], 'color' => $r['color']], all('SELECT * FROM categories ORDER BY sort, id')),
        'units' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], all('SELECT * FROM units ORDER BY sort, id')),
        'titles' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], all('SELECT * FROM titles ORDER BY sort, id')),
    ];
}

/** Üyenin görebileceği yayınlanmış içerik koşulu */
function vis_sql(array $me, array &$p): string
{
    if (is_publisher($me)) return '1=1';
    $p[':vis_unit'] = (int)($me['unit_id'] ?? 0);
    return '(p.unit_id IS NULL OR p.unit_id = :vis_unit)';
}

function audience_counts(): array
{
    $total = 0;
    $byUnit = [];
    foreach (all("SELECT unit_id, COUNT(*) c FROM users WHERE status = 'active' GROUP BY unit_id") as $r) {
        $total += (int)$r['c'];
        if ($r['unit_id'] !== null) $byUnit[(int)$r['unit_id']] = (int)$r['c'];
    }
    return [$total, $byUnit];
}

function can_view_post(array $me, array $p): bool
{
    if (is_publisher($me)) return true;
    if ((int)$p['author_id'] === (int)$me['id']) return true;
    if ($p['status'] !== 'published') return false;
    return $p['unit_id'] === null || (int)$p['unit_id'] === (int)($me['unit_id'] ?? 0);
}

function attachments_for(int $postId, string $guestToken = ''): array
{
    $rows = all('SELECT id, orig_name, mime, size, text_done FROM attachments WHERE post_id = ? ORDER BY id', [$postId]);
    return array_map(fn($a) => [
        'id' => (int)$a['id'],
        'name' => $a['orig_name'],
        'mime' => $a['mime'],
        'size' => (int)$a['size'],
        'url' => 'api.php?action=file&id=' . (int)$a['id'] . ($guestToken !== '' ? '&t=' . rawurlencode($guestToken) : ''),
        'has_text' => (int)($a['text_done'] ?? 0) === 1,
    ], $rows);
}

function post_out(array $r, array $aud): array
{
    [$total, $byUnit] = $aud;
    $audience = $r['unit_id'] === null ? $total : ($byUnit[(int)$r['unit_id']] ?? 0);
    $body = (string)$r['body'];
    return [
        'id' => (int)$r['id'],
        'title' => $r['title'],
        'excerpt' => mb_substr(preg_replace('/\s+/u', ' ', $body), 0, 220),
        'category_id' => (int)$r['category_id'],
        'unit_id' => $r['unit_id'] !== null ? (int)$r['unit_id'] : null,
        'author_id' => (int)$r['author_id'],
        'author_name' => $r['author_name'] ?? 'Silinmiş kullanıcı',
        'author_title_id' => isset($r['author_title_id']) ? (int)$r['author_title_id'] : null,
        'status' => $r['status'],
        'pinned' => (bool)$r['pinned'],
        'required' => (bool)$r['required'],
        'reject_reason' => $r['reject_reason'],
        'created_at' => $r['created_at'],
        'updated_at' => $r['updated_at'],
        'published_at' => $r['published_at'],
        'att_count' => (int)($r['att_count'] ?? 0),
        'ack_count' => (int)($r['ack_count'] ?? 0),
        'audience' => $audience,
        'viewed' => (bool)($r['viewed'] ?? false),
        'saved' => (bool)($r['saved'] ?? false),
        'acked' => (bool)($r['acked'] ?? false),
        'review_at' => $r['review_at'] ?? null,
    ];
}



function counts_for(array $me): array
{
    $p = [':me' => (int)$me['id']];
    $vis = vis_sql($me, $p);
    $unreadRows = all("SELECT p.category_id, COUNT(*) c FROM posts p
        LEFT JOIN views v ON v.post_id = p.id AND v.user_id = :me
        WHERE p.status = 'published' AND v.user_id IS NULL AND $vis GROUP BY p.category_id", $p);
    $byCat = [];
    $unread = 0;
    foreach ($unreadRows as $r) {
        $byCat[(int)$r['category_id']] = (int)$r['c'];
        $unread += (int)$r['c'];
    }
    $p2 = [':me' => (int)$me['id']];
    $vis2 = vis_sql($me, $p2);
    $todo = (int)val("SELECT COUNT(*) FROM posts p
        LEFT JOIN acks k ON k.post_id = p.id AND k.user_id = :me
        WHERE p.status = 'published' AND p.required = 1 AND k.user_id IS NULL AND $vis2", $p2);
    return [
        'unread' => $unread,
        'unread_by_cat' => (object)$byCat,
        'todo' => $todo,
        'saved' => (int)val('SELECT COUNT(*) FROM saves WHERE user_id = ?', [$me['id']]),
        'pending_posts' => is_publisher($me) ? (int)val("SELECT COUNT(*) FROM posts WHERE status = 'pending'") : 0,
        'pending_users' => is_admin($me) ? (int)val("SELECT COUNT(*) FROM users WHERE status = 'pending'") : 0,
        'notif_unread' => (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$me['id']]),
    ];
}

/* ------------------------------------------------------------------ */
/* Açılış & Kimlik Doğrulama                                           */
/* ------------------------------------------------------------------ */

function a_boot(): void
{
    ensure_initial_admin();
    $me = current_user();
    $setup = (int)val('SELECT COUNT(*) FROM users') === 0;
    $data = [
        'csrf' => $_SESSION['csrf'],
        'setup_needed' => $setup,
        'me' => $me ? user_out($me) : null,
        'settings' => [
            'org_name' => setting('org_name', 'Klinik Portalı'),
            'registration' => setting('registration', 'approval'),
        ],
        'google_client_id' => GOOGLE_CLIENT_ID,
        'upload_max_mb' => MAX_UPLOAD_MB,
        'chunk_size' => chunk_size(),
        'mail_ready' => mail_ready(),
    ] + lists();
    if ($me) {
        $data['settings'] += [
            'banner_on' => setting('banner_on') === '1',
            'banner_text' => setting('banner_text'),
            'banner_tone' => setting('banner_tone', 'danger'),
            'allow_guest' => setting('allow_guest', '0') === '1',
            'mail_ready' => mail_ready(),
            'notify_post' => mail_event_on('notify_post') || (push_ready() && event_on('notify_post')),
            'push_ready' => push_ready(),
            'shift_codes' => shift_codes(),
        ];
        $data['counts'] = counts_for($me);
        $data['rosters'] = array_map('roster_out', all('SELECT * FROM rosters ORDER BY sort, id'));
        $data['people'] = array_map(fn($r) => [
            'id' => (int)$r['id'], 'name' => $r['name'],
            'title_id' => $r['title_id'] !== null ? (int)$r['title_id'] : null,
            'unit_id' => $r['unit_id'] !== null ? (int)$r['unit_id'] : null,
        ], all("SELECT id, name, title_id, unit_id FROM users WHERE status = 'active' ORDER BY name"));
    }
    out($data);
}

/** Parça boyutu: sunucunun PHP yükleme sınırının altında kalır, böylece dosya boyutu sınırsız olur. */
function chunk_size(): int
{
    $toBytes = function (string $v): int {
        $v = trim($v);
        if ($v === '' || $v === '0' || $v === '-1') return PHP_INT_MAX;
        $n = (float)$v;
        switch (strtolower(substr($v, -1))) {
            case 'g': $n *= 1024;
            // no break
            case 'm': $n *= 1024;
            // no break
            case 'k': $n *= 1024;
        }
        return $n > 0 ? (int)$n : PHP_INT_MAX;
    };
    $limit = min($toBytes((string)ini_get('upload_max_filesize')), $toBytes((string)ini_get('post_max_size')) - 65536);
    return (int)max(262144, min(8 * 1048576, $limit - 65536));
}

function a_counts(): void
{
    out(['counts' => counts_for(need_user())]);
}

function validate_password(string $pw): void
{
    if (mb_strlen($pw) < 8) fail('Şifre en az 8 karakter olmalıdır.');
}

function validate_email(string $email): string
{
    $email = mb_strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi girin.');
    return $email;
}

function a_setup(): void
{
    if ((int)val('SELECT COUNT(*) FROM users') > 0) fail('Kurulum zaten tamamlanmış.', 409);
    $name = s('name', 120);
    $email = validate_email(s('email', 190));
    global $IN;
    $pw = (string)($IN['password'] ?? '');
    $org = s('org_name', 120);
    if (mb_strlen($name) < 3) fail('Ad soyad girin.');
    validate_password($pw);
    if ($org !== '') set_setting('org_name', $org);
    $titleId = val('SELECT id FROM titles ORDER BY sort, id LIMIT 1');
    $unitId = val('SELECT id FROM units ORDER BY sort, id LIMIT 1');
    q('INSERT INTO users (name, email, password_hash, title_id, unit_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $titleId, $unitId, 'admin', 'active', now()]);
    login_user(one('SELECT * FROM users WHERE id = ?', [insert_id()]));
    out();
}

function a_login(): void
{
    global $IN;
    ensure_initial_admin();
    $email = mb_strtolower(s('email', 190));
    $pw = (string)($IN['password'] ?? '');
    $ip = client_ip();
    $since = time() - 900;
    q('DELETE FROM login_attempts WHERE at < ?', [time() - 86400]);
    $fails = (int)val('SELECT COUNT(*) FROM login_attempts WHERE (ip = ? OR email = ?) AND at > ?', [$ip, $email, $since]);
    if ($fails >= 8) fail('Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.', 429);

    $u = one('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$u || empty($u['password_hash']) || !password_verify($pw, $u['password_hash'])) {
        q('INSERT INTO login_attempts (ip, email, at) VALUES (?, ?, ?)', [$ip, $email, time()]);
        fail('E-posta veya şifre hatalı.', 401);
    }
    if ($u['status'] === 'pending') fail('Hesabınız yönetici onayı bekliyor. Onaylandığında giriş yapabilirsiniz.', 403);
    if ($u['status'] !== 'active') fail('Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin.', 403);
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    }
    q('DELETE FROM login_attempts WHERE email = ?', [$email]);
    login_user($u);
    audit($u, 'login', 'Şifre ile giriş');
    out(['must_change' => (int)($u['must_change'] ?? 0) === 1]);
}

function a_forgot(): void
{
    $email = mb_strtolower(s('email', 190));
    if (!mail_ready()) fail('E-posta gönderimi henüz ayarlanmamış. Yöneticinizden geçici şifre isteyin.', 400);
    $ip = client_ip();
    $recent = (int)val('SELECT COUNT(*) FROM login_attempts WHERE (ip = ? OR email = ?) AND at > ?', ['reset:' . $ip, 'reset:' . $email, time() - 3600]);
    if ($recent >= 5) fail('Çok fazla deneme. Lütfen bir saat sonra tekrar deneyin.', 429);
    q('INSERT INTO login_attempts (ip, email, at) VALUES (?, ?, ?)', ['reset:' . $ip, 'reset:' . $email, time()]);
    $u = one("SELECT * FROM users WHERE email = ? AND status = 'active'", [$email]);
    if ($u) {
        $token = bin2hex(random_bytes(24));
        q('DELETE FROM password_resets WHERE user_id = ? OR expires < ?', [$u['id'], time()]);
        q('INSERT INTO password_resets (user_id, token_hash, expires) VALUES (?, ?, ?)', [$u['id'], hash('sha256', $token), time() + 3600]);
        mail_queue_to([$u], 'Şifre sıfırlama', 'Şifrenizi sıfırlayın',
            ['Portal şifrenizi sıfırlamak için aşağıdaki düğmeye dokunun. Bağlantı 1 saat geçerlidir.', 'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.'],
            'Yeni şifre belirle', base_url() . '?reset=' . $token, 'reset', false);
    }
    // Hesabın var olup olmadığını belli etmemek için her durumda aynı yanıt
    out(['message' => 'Bu e-posta ile kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve gereksiz klasörünü) kontrol edin.']);
}

function a_reset(): void
{
    global $IN;
    $token = s('token', 100);
    $pw = (string)($IN['password'] ?? '');
    $r = $token !== '' ? one('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires > ?', [hash('sha256', $token), time()]) : null;
    if (!$r) fail('Bağlantı geçersiz veya süresi dolmuş. Yeniden “Şifremi unuttum” deyin.', 400);
    validate_password($pw);
    $u = one("SELECT * FROM users WHERE id = ? AND status = 'active'", [$r['user_id']]);
    if (!$u) fail('Hesap bulunamadı veya devre dışı.', 404);
    q('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    q('UPDATE password_resets SET used = 1 WHERE user_id = ?', [$u['id']]);
    login_user($u);
    out();
}

function a_register(): void
{
    global $IN;
    $mode = setting('registration', 'approval');
    $inv = invite_valid(s('invite', 40));
    if ($mode === 'closed' && !$inv) fail('Yeni üye kaydı şu anda kapalı. Hesap için yöneticinize başvurun.', 403);
    $name = s('name', 120);
    $email = validate_email(s('email', 190));
    $pw = (string)($IN['password'] ?? '');
    $titleId = i('title_id');
    $unitId = i('unit_id');
    if (mb_strlen($name) < 3) fail('Ad soyad girin.');
    validate_password($pw);
    if (!valid_id('titles', $titleId)) $titleId = null;
    if (!valid_id('units', $unitId)) $unitId = null;
    if (one('SELECT id FROM users WHERE email = ?', [$email])) fail('Bu e-posta ile zaten bir hesap var.', 409);
    $status = $mode === 'open' ? 'active' : 'pending';
    $role = 'member';
    if ($inv) {
        if ($inv['kind'] === 'personal') { $name = $inv['name'] ?: $name; $titleId = $inv['title_id'] !== null ? (int)$inv['title_id'] : $titleId; }
        if ($inv['unit_id'] !== null) $unitId = (int)$inv['unit_id'];
        if ((int)$inv['auto_approve'] === 1) $status = 'active';
        $role = in_array($inv['role'], ROLES, true) ? $inv['role'] : 'member';
    }
    q('INSERT INTO users (name, email, password_hash, title_id, unit_id, role, status, created_at, notify_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $titleId, $unitId, $role, $status, now(), setting('default_notify_mode', 'instant')]);
    $newId = insert_id();
    if ($inv) {
        q('UPDATE invites SET uses = uses + 1, used_by = CASE WHEN kind = \'personal\' THEN ? ELSE used_by END WHERE id = ?', [$newId, $inv['id']]);
        audit(['id' => $newId, 'name' => $name], 'invite.use', $name, $inv['kind'] === 'personal' ? 'Kişisel davet' : 'QR davet');
    }
    if ($status === 'active') {
        login_user(one('SELECT * FROM users WHERE id = ?', [$newId]));
        out(['pending' => false]);
    }
    notify_pending_user(['name' => $name, 'email' => $email]);
    out(['pending' => true]);
}

function a_google(): void
{
    if (GOOGLE_CLIENT_ID === '') fail('Google ile giriş etkin değil.', 400);
    $cred = s('credential', 4096);
    if ($cred === '') fail('Google doğrulaması alınamadı.');
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($cred);
    $raw = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
        $raw = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200) $raw = false;
    } else {
        $raw = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 10]]));
    }
    $info = $raw ? json_decode((string)$raw, true) : null;
    if (!is_array($info) || ($info['aud'] ?? '') !== GOOGLE_CLIENT_ID
        || !in_array($info['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
        || (int)($info['exp'] ?? 0) < time()
        || !in_array($info['email_verified'] ?? '', ['true', true], true)) {
        fail('Google hesabı doğrulanamadı.', 401);
    }
    $sub = (string)$info['sub'];
    $email = mb_strtolower((string)$info['email']);
    $u = one('SELECT * FROM users WHERE google_sub = ?', [$sub]) ?? one('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$u) {
        $mode = setting('registration', 'approval');
        if ($mode === 'closed') fail('Bu Google hesabıyla kayıtlı bir üye yok ve yeni kayıt kapalı.', 403);
        $status = $mode === 'open' ? 'active' : 'pending';
        $name = mb_substr((string)($info['name'] ?? explode('@', $email)[0]), 0, 120);
        q('INSERT INTO users (name, email, google_sub, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$name, $email, $sub, 'member', $status, now()]);
        $u = one('SELECT * FROM users WHERE id = ?', [insert_id()]);
    } elseif (empty($u['google_sub'])) {
        q('UPDATE users SET google_sub = ? WHERE id = ?', [$sub, $u['id']]);
    }
    if ($u['status'] === 'pending') out(['pending' => true]);
    if ($u['status'] !== 'active') fail('Hesabınız devre dışı bırakılmış.', 403);
    login_user($u);
    out(['pending' => false]);
}

function a_logout(): void
{
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    out(['csrf' => $_SESSION['csrf']]);
}

function a_me_update(): void
{
    $me = need_user();
    global $IN;
    $only = !array_key_exists('name', $IN);
    if (array_key_exists('email_notify', $IN)) {
        q('UPDATE users SET email_notify = ?, notify_mode = ? WHERE id = ?', [b('email_notify') ? 1 : 0, b('email_notify') ? 'instant' : 'off', $me['id']]);
    }
    if (array_key_exists('notify_mode', $IN)) {
        $mode = in_array(s('notify_mode', 10), ['instant', 'digest', 'off'], true) ? s('notify_mode', 10) : 'instant';
        q('UPDATE users SET notify_mode = ?, email_notify = ? WHERE id = ?', [$mode, $mode === 'off' ? 0 : 1, $me['id']]);
    }
    if (array_key_exists('push_on', $IN)) q('UPDATE users SET push_on = ? WHERE id = ?', [b('push_on') ? 1 : 0, $me['id']]);
    if (array_key_exists('phone', $IN) || array_key_exists('extension', $IN)) {
        $phone = preg_replace('/[^0-9+ ()-]/', '', s('phone', 30));
        $ext = preg_replace('/[^0-9A-Za-z -]/', '', s('extension', 12));
        q('UPDATE users SET phone = ?, extension = ? WHERE id = ?', [$phone ?: null, $ext ?: null, $me['id']]);
    }
    if ($only) out();
    $name = s('name', 120);
    if (mb_strlen($name) < 3) fail('Ad soyad en az 3 karakter olmalıdır.');
    q('UPDATE users SET name = ? WHERE id = ?', [$name, $me['id']]);
    out();
}

function a_me_password(): void
{
    global $IN;
    $me = need_user();
    $cur = (string)($IN['current'] ?? '');
    $new = (string)($IN['password'] ?? '');
    $forced = (int)($me['must_change'] ?? 0) === 1;
    if (!$forced && !empty($me['password_hash']) && !password_verify($cur, $me['password_hash'])) fail('Mevcut şifre hatalı.');
    validate_password($new);
    if (!empty($me['password_hash']) && password_verify($new, $me['password_hash'])) fail('Yeni şifre geçici şifreden farklı olmalıdır.');
    q('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $me['id']]);
    out();
}

/* ------------------------------------------------------------------ */
/* İçerikler                                                           */
/* ------------------------------------------------------------------ */

function a_posts_list(): void
{
    $me = need_user();
    $filter = s('filter', 20) ?: 'all';
    $cat = i('category_id');
    $term = s('q', 100);
    $offset = max(0, (int)i('offset'));
    $limit = 20;

    $p = [':me1' => $me['id'], ':me2' => $me['id'], ':me3' => $me['id']];
    $where = [];
    if ($filter === 'mine') {
        $p[':author'] = $me['id'];
        $where[] = 'p.author_id = :author';
    } elseif ($filter === 'pending') {
        if (!is_publisher($me)) fail('Yetkiniz yok.', 403);
        $where[] = "p.status = 'pending'";
    } else {
        $where[] = "p.status = 'published'";
        $where[] = vis_sql($me, $p);
        if ($filter === 'unread') $where[] = 'v.user_id IS NULL';
        if ($filter === 'todo') $where[] = 'p.required = 1 AND mk.user_id IS NULL';
        if ($filter === 'saved') $where[] = 'sv.user_id IS NOT NULL';
    }
    if ($cat) {
        $p[':cat'] = $cat;
        $where[] = 'p.category_id = :cat';
    }
    if ($term !== '') {
        $p[':q1'] = '%' . tr_lower($term) . '%';
        $p[':q2'] = $p[':q1'];
        $p[':q3'] = $p[':q1'];
        $where[] = '(' . like_expr('p.title') . ' LIKE :q1 OR ' . like_expr('p.body') . ' LIKE :q2 OR EXISTS (SELECT 1 FROM attachments ax WHERE ax.post_id = p.id AND ' . like_expr('ax.text_content') . ' LIKE :q3))';
    }
    $order = ($filter === 'all' && $term === '') ? 'p.pinned DESC, ' : '';
    $sql = POST_SELECT . ' WHERE ' . implode(' AND ', $where)
        . " ORDER BY {$order}COALESCE(p.published_at, p.created_at) DESC, p.id DESC LIMIT " . ($limit + 1) . " OFFSET $offset";
    $rows = all($sql, $p);
    $more = count($rows) > $limit;
    $aud = audience_counts();
    $items = array_map(fn($r) => post_out($r, $aud), array_slice($rows, 0, $limit));
    if ($term !== '') foreach ($items as &$it) $it['match'] = search_snippet($it['id'], $term);
    unset($it);
    out(['items' => $items, 'has_more' => $more]);
}

/** Arama sonucunda kelimenin geçtiği yer: içerik metni veya ekli belge */
function search_snippet(int $postId, string $term): ?array
{
    $t = tr_lower($term);
    $cut = function (string $text) use ($t): ?string {
        $low = tr_lower($text);
        $pos = mb_strpos($low, $t);
        if ($pos === false) return null;
        $start = max(0, $pos - 70);
        return ($start > 0 ? '…' : '') . trim(mb_substr(preg_replace('/\s+/u', ' ', $text), $start, 170)) . '…';
    };
    $body = (string)val('SELECT body FROM posts WHERE id = ?', [$postId]);
    if (($x = $cut($body)) !== null && mb_stripos(tr_lower((string)val('SELECT title FROM posts WHERE id = ?', [$postId])), $t) === false) return ['where' => 'body', 'text' => $x];
    foreach (all('SELECT orig_name, text_content FROM attachments WHERE post_id = ? AND text_content IS NOT NULL', [$postId]) as $a) {
        if (($x = $cut((string)$a['text_content'])) !== null) return ['where' => 'file', 'file' => $a['orig_name'], 'text' => $x];
    }
    return null;
}

function load_post(int $id, array $me): array
{
    $r = one(POST_SELECT . ' WHERE p.id = :id', [':me1' => $me['id'], ':me2' => $me['id'], ':me3' => $me['id'], ':id' => $id]);
    if (!$r || !can_view_post($me, $r)) fail('İçerik bulunamadı veya erişim yetkiniz yok.', 404);
    return $r;
}

function a_posts_get(): void
{
    $me = need_user();
    $id = (int)i('id');
    $r = load_post($id, $me);
    if ($r['status'] === 'published' && !$r['viewed']) {
        if (!one('SELECT post_id FROM views WHERE post_id = ? AND user_id = ?', [$id, $me['id']])) {
            q('INSERT INTO views (post_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
        }
        $r['viewed'] = 1;
    }
    $post = post_out($r, audience_counts());
    $post['body'] = $r['body'];
    $post['attachments'] = attachments_for($id);
    $canManage = is_publisher($me) || (int)$r['author_id'] === (int)$me['id'];
    $post['share'] = $canManage && setting('allow_guest', '0') === '1' && $r['share_token'] && (!$r['share_expires'] || $r['share_expires'] > now())
        ? ['token' => $r['share_token'], 'expires' => $r['share_expires']] : null;
    if ($canManage && $r['required'] && $r['status'] === 'published') {
        $readers = all('SELECT u.id, u.name, u.title_id, k.created_at AS at FROM acks k JOIN users u ON u.id = k.user_id WHERE k.post_id = ? ORDER BY k.created_at DESC', [$id]);
        $ap = [':pid' => $id];
        $unitCond = '';
        if ($r['unit_id'] !== null) {
            $unitCond = ' AND u.unit_id = :unit';
            $ap[':unit'] = (int)$r['unit_id'];
        }
        $missing = all("SELECT u.id, u.name, u.title_id FROM users u WHERE u.status = 'active'$unitCond
            AND NOT EXISTS (SELECT 1 FROM acks k WHERE k.post_id = :pid AND k.user_id = u.id) ORDER BY u.name", $ap);
        $post['readers'] = array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'title_id' => $x['title_id'] !== null ? (int)$x['title_id'] : null, 'at' => $x['at'] ?? null], $readers);
        $post['missing'] = array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'title_id' => $x['title_id'] !== null ? (int)$x['title_id'] : null], $missing);
    }
    out(['post' => $post]);
}

function a_posts_save(): void
{
    $me = need_user();
    $id = i('id');
    $title = s('title', 200);
    $body = s('body', 20000);
    $catId = i('category_id');
    $unitId = i('unit_id');
    $required = b('required');
    $pinned = b('pinned');
    $review = s('review_at', 10);
    if ($review !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $review)) fail('Geçerlilik tarihi hatalı.');
    $review = $review !== '' ? $review : null;
    if (mb_strlen($title) < 3) fail('Başlık en az 3 karakter olmalıdır.');
    if ($body === '') fail('İçerik metni boş olamaz.');
    if (!valid_id('categories', $catId)) fail('Geçerli bir bölüm seçin.');
    if ($unitId !== null && !valid_id('units', $unitId)) $unitId = null;
    $pub = is_publisher($me);
    if (!$pub) $pinned = false;

    if ($id) {
        $post = one('SELECT * FROM posts WHERE id = ?', [$id]);
        if (!$post) fail('İçerik bulunamadı.', 404);
        $own = (int)$post['author_id'] === (int)$me['id'];
        if (!$pub && !($own && $post['status'] !== 'published')) fail('Bu içeriği düzenleme yetkiniz yok.', 403);
        $status = $post['status'];
        $publishedAt = $post['published_at'];
        if (!$pub) $status = 'pending';
        if (!$pub && $post['status'] === 'rejected') $publishedAt = null;
        if (!$pub) $pinned = (bool)$post['pinned'];
        q('UPDATE posts SET title = ?, body = ?, category_id = ?, unit_id = ?, required = ?, pinned = ?, status = ?, reject_reason = NULL, published_at = ?, updated_at = ? WHERE id = ?',
            [$title, $body, $catId, $unitId, (int)$required, (int)$pinned, $status, $publishedAt, now(), $id]);
        if (!$pub && $post['status'] !== 'pending') notify_pending_post((int)$id);
        q('UPDATE posts SET review_at = ?, review_notified = CASE WHEN review_at = ? THEN review_notified ELSE NULL END WHERE id = ?', [$review, $review, $id]);
        audit($me, 'post.edit', $title);
    } else {
        $status = $pub ? 'published' : 'pending';
        q('INSERT INTO posts (title, body, category_id, unit_id, author_id, status, pinned, required, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$title, $body, $catId, $unitId, $me['id'], $status, (int)$pinned, (int)$required, now(), now(), $pub ? now() : null]);
        $id = insert_id();
        if ($review) q('UPDATE posts SET review_at = ? WHERE id = ?', [$review, $id]);
        audit($me, $pub ? 'post.publish' : 'post.submit', $title);
        // Yazar kendi içeriğini okumuş sayılır
        q('INSERT INTO views (post_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
        $created = true;
    }

    foreach (arr('remove_attachment_ids') as $aid) {
        $a = one('SELECT * FROM attachments WHERE id = ? AND post_id = ?', [(int)$aid, $id]);
        if ($a) {
            @unlink(NM_ROOT . '/uploads/' . $a['stored_name']);
            q('DELETE FROM attachments WHERE id = ?', [$a['id']]);
        }
    }
    foreach (arr('attachment_ids') as $aid) {
        q('UPDATE attachments SET post_id = ? WHERE id = ? AND user_id = ? AND post_id IS NULL AND roster_id IS NULL', [$id, (int)$aid, $me['id']]);
    }
    $mailed = 0;
    if (!empty($created)) {
        global $IN;
        if ($status === 'published' && (!array_key_exists('notify', $IN) || b('notify'))) $mailed = notify_post_published((int)$id, (int)$me['id']);
        if ($status === 'pending') notify_pending_post((int)$id);
    }
    out(['id' => $id, 'status' => $status, 'mailed' => $mailed]);
}

function delete_post_files(int $id): void
{
    foreach (all('SELECT stored_name FROM attachments WHERE post_id = ?', [$id]) as $a) {
        @unlink(NM_ROOT . '/uploads/' . $a['stored_name']);
    }
    q('DELETE FROM attachments WHERE post_id = ?', [$id]);
}

function a_posts_delete(): void
{
    $me = need_user();
    $id = (int)i('id');
    $post = one('SELECT * FROM posts WHERE id = ?', [$id]);
    if (!$post) fail('İçerik bulunamadı.', 404);
    $own = (int)$post['author_id'] === (int)$me['id'];
    if (!is_publisher($me) && !($own && $post['status'] !== 'published')) fail('Bu içeriği silme yetkiniz yok.', 403);
    delete_post_files($id);
    foreach (['acks', 'views', 'saves'] as $t) q("DELETE FROM $t WHERE post_id = ?", [$id]);
    q('DELETE FROM posts WHERE id = ?', [$id]);
    audit($me, 'post.delete', $post['title']);
    out();
}

function a_posts_approve(): void
{
    need_publisher();
    $id = (int)i('id');
    $post = one("SELECT * FROM posts WHERE id = ? AND status = 'pending'", [$id]);
    if (!$post) fail('Onay bekleyen içerik bulunamadı.', 404);
    q("UPDATE posts SET status = 'published', reject_reason = NULL, published_at = ?, updated_at = ? WHERE id = ?", [now(), now(), $id]);
    audit(current_user(), 'post.approve', $post['title']);
    $mailed = notify_post_published($id, 0);
    out(['mailed' => $mailed]);
}

function a_posts_reject(): void
{
    need_publisher();
    $id = (int)i('id');
    $reason = s('reason', 255);
    $post = one("SELECT * FROM posts WHERE id = ? AND status = 'pending'", [$id]);
    if (!$post) fail('Onay bekleyen içerik bulunamadı.', 404);
    q("UPDATE posts SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?", [$reason !== '' ? $reason : null, now(), $id]);
    audit(current_user(), 'post.reject', $post['title'], $reason);
    out();
}

function a_posts_pin(): void
{
    need_publisher();
    q('UPDATE posts SET pinned = ? WHERE id = ?', [(int)b('pinned'), (int)i('id')]);
    out();
}

function a_posts_ack(): void
{
    $me = need_user();
    $id = (int)i('id');
    $r = load_post($id, $me);
    if ($r['status'] !== 'published') fail('Yayınlanmamış içerik onaylanamaz.');
    if (!one('SELECT post_id FROM acks WHERE post_id = ? AND user_id = ?', [$id, $me['id']])) {
        q('INSERT INTO acks (post_id, user_id, created_at) VALUES (?, ?, ?)', [$id, $me['id'], now()]);
    }
    out(['ack_count' => (int)val('SELECT COUNT(*) FROM acks WHERE post_id = ?', [$id])]);
}

function a_posts_bookmark(): void
{
    $me = need_user();
    $id = (int)i('id');
    load_post($id, $me);
    if (b('saved')) {
        if (!one('SELECT post_id FROM saves WHERE post_id = ? AND user_id = ?', [$id, $me['id']])) {
            q('INSERT INTO saves (post_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
        }
    } else {
        q('DELETE FROM saves WHERE post_id = ? AND user_id = ?', [$id, $me['id']]);
    }
    out();
}

function a_posts_remind(): void
{
    $me = need_user();
    $id = (int)i('id');
    $p = one('SELECT * FROM posts WHERE id = ?', [$id]);
    if (!$p || $p['status'] !== 'published' || !(int)$p['required']) fail('Yalnızca yayınlanmış zorunlu okumalar için hatırlatma gönderilebilir.');
    if (!is_publisher($me) && (int)$p['author_id'] !== (int)$me['id']) fail('Hatırlatma gönderme yetkiniz yok.', 403);
    if (!mail_ready()) fail('E-posta gönderimi ayarlanmamış. Yönetim › Ayarlar › E-posta bölümünden ayarlayın.');
    $last = (int)setting('remind_' . $id, '0');
    if ($last > time() - 600) fail('Bu içerik için az önce hatırlatma gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.', 429);
    $params = [':pid' => $id];
    $unitCond = '';
    if ($p['unit_id'] !== null) { $unitCond = ' AND u.unit_id = :unit'; $params[':unit'] = (int)$p['unit_id']; }
    $missing = all("SELECT u.id, u.name, u.email, u.email_notify FROM users u WHERE u.status = 'active'$unitCond AND NOT EXISTS (SELECT 1 FROM acks k WHERE k.post_id = :pid AND k.user_id = u.id)", $params);
    if (!$missing) fail('Herkes okumuş, hatırlatılacak kimse yok.');
    $n = mail_queue_to($missing, 'Hatırlatma: ' . $p['title'],
        'Okumanızı bekleyen bir içerik var',
        ['“' . $p['title'] . '” zorunlu okuma olarak paylaşıldı ve henüz onayınızı almadık. Lütfen okuyup “Okudum, anladım” ile onaylayın.'],
        'Şimdi oku', base_url() . '#/p/' . $id, 'remind', false);
    set_setting('remind_' . $id, (string)time());
    out(['sent' => $n]);
}

function a_posts_share(): void
{
    $me = need_user();
    if (setting('allow_guest', '0') !== '1') fail('Misafir bağlantıları yönetici tarafından kapatıldı.', 403);
    $id = (int)i('id');
    $post = one('SELECT * FROM posts WHERE id = ?', [$id]);
    if (!$post || $post['status'] !== 'published') fail('Yalnızca yayınlanmış içerikler paylaşılabilir.');
    if (!is_publisher($me) && (int)$post['author_id'] !== (int)$me['id']) fail('Paylaşım bağlantısı oluşturma yetkiniz yok.', 403);
    $days = (int)i('days');
    if ($days <= 0) {
        q('UPDATE posts SET share_token = NULL, share_expires = NULL WHERE id = ?', [$id]);
        out(['share' => null]);
    }
    $days = min($days, 365);
    $token = random_token(12);
    $expires = date('Y-m-d H:i:s', time() + $days * 86400);
    q('UPDATE posts SET share_token = ?, share_expires = ? WHERE id = ?', [$token, $expires, $id]);
    out(['share' => ['token' => $token, 'expires' => $expires]]);
}

function a_guest_get(): void
{
    $token = s('token', 40);
    if (setting('allow_guest', '0') !== '1') fail('Bu içerik yalnızca üyelere açıktır. Görmek için giriş yapın.', 403);
    $r = $token === '' ? null : one("SELECT p.*, u.name AS author_name, u.title_id AS author_title_id FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.share_token = ? AND p.status = 'published'", [$token]);
    if (!$r || ($r['share_expires'] && $r['share_expires'] < now())) {
        fail('Bu paylaşım bağlantısı geçersiz veya süresi dolmuş.', 404);
    }
    $post = post_out($r, [0, []]);
    $post['body'] = $r['body'];
    $post['attachments'] = attachments_for((int)$r['id'], $token);
    $post['share_expires'] = $r['share_expires'];
    $cat = one('SELECT name, icon, color FROM categories WHERE id = ?', [$r['category_id']]);
    $title = one('SELECT name FROM titles WHERE id = ?', [$r['author_title_id']]);
    out([
        'post' => $post,
        'category' => $cat,
        'author_title' => $title['name'] ?? null,
        'org_name' => setting('org_name', 'Klinik Portalı'),
    ]);
}

/* ------------------------------------------------------------------ */
/* Dosyalar                                                            */
/* ------------------------------------------------------------------ */

function mime_for(string $name): string
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    return MIME_MAP[$ext] ?? 'application/octet-stream';
}

function upload_dir(): string
{
    $dir = NM_ROOT . '/uploads';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    return $dir;
}

function a_upload_init(): void
{
    need_user();
    global $IN;
    $name = mb_substr(basename(str_replace('\\', '/', s('name', 255))), 0, 200);
    $size = isset($IN['size']) && is_numeric($IN['size']) ? (int)$IN['size'] : -1;
    if ($name === '' || $size < 0) fail('Dosya bilgisi eksik.');
    if (MAX_UPLOAD_MB > 0 && $size > MAX_UPLOAD_MB * 1048576) fail('Dosya çok büyük. En fazla ' . MAX_UPLOAD_MB . ' MB yükleyebilirsiniz.');
    $dir = upload_dir();
    $free = @disk_free_space($dir);
    if ($free !== false && $size > $free) fail('Sunucuda yeterli disk alanı yok.', 507);
    // Yarım kalmış eski yüklemeleri temizle
    foreach (glob($dir . '/*.part') ?: [] as $old) {
        if (filemtime($old) < time() - 86400) @unlink($old);
    }
    $token = bin2hex(random_bytes(12));
    if (file_put_contents($dir . '/' . $token . '.part', '') === false) fail('Yükleme klasörüne yazılamıyor. Klasör izinlerini kontrol edin.', 500);
    $_SESSION['uploads'][$token] = ['name' => $name, 'size' => $size];
    out(['token' => $token, 'chunk_size' => chunk_size()]);
}

function upload_meta(): array
{
    $token = s('token', 40);
    if (!preg_match('/^[a-f0-9]{24}$/', $token) || empty($_SESSION['uploads'][$token])) fail('Yükleme oturumu bulunamadı. Lütfen tekrar deneyin.', 409);
    $path = upload_dir() . '/' . $token . '.part';
    if (!is_file($path)) fail('Yükleme oturumu sona erdi. Lütfen tekrar deneyin.', 409);
    return [$token, $path, $_SESSION['uploads'][$token]];
}

function a_upload_chunk(): void
{
    need_user();
    [, $path, $meta] = upload_meta();
    $offset = (int)i('offset');
    $f = $_FILES['chunk'] ?? null;
    if (!$f || !is_array($f) || is_array($f['error']) || $f['error'] !== UPLOAD_ERR_OK) fail('Dosya parçası alınamadı (kod ' . (int)($f['error'] ?? -1) . ').');
    clearstatcache(true, $path);
    $have = filesize($path);
    if ($offset > $have) fail('Yükleme sırası bozuldu. Lütfen tekrar deneyin.', 409);
    if ($offset + (int)$f['size'] > $meta['size']) fail('Dosya beklenenden büyük.');
    $in = fopen($f['tmp_name'], 'rb');
    $outF = fopen($path, 'c');
    if (!$in || !$outF) fail('Dosya parçası kaydedilemedi.', 500);
    ftruncate($outF, $offset);
    fseek($outF, $offset);
    $written = stream_copy_to_stream($in, $outF);
    fclose($in);
    fclose($outF);
    if ($written !== (int)$f['size']) fail('Sunucuda yer kalmamış olabilir; parça yazılamadı.', 507);
    out(['received' => $offset + $written]);
}

function a_upload_finish(): void
{
    $me = need_user();
    [$token, $path, $meta] = upload_meta();
    clearstatcache(true, $path);
    if (filesize($path) !== $meta['size']) fail('Dosya eksik yüklendi. Lütfen tekrar deneyin.', 409);
    $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
    if (!rename($path, upload_dir() . '/' . $stored)) fail('Dosya kaydedilemedi.', 500);
    unset($_SESSION['uploads'][$token]);
    $mime = mime_for($meta['name']);
    q('INSERT INTO attachments (post_id, roster_id, user_id, orig_name, stored_name, mime, size, created_at) VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?)',
        [$me['id'], $meta['name'], $stored, $mime, $meta['size'], now()]);
    $id = insert_id();
    // Bir günden eski, hiçbir yere bağlanmamış dosyaları temizle
    foreach (all('SELECT id, stored_name FROM attachments WHERE post_id IS NULL AND roster_id IS NULL AND created_at < ?', [date('Y-m-d H:i:s', time() - 86400)]) as $o) {
        @unlink(upload_dir() . '/' . $o['stored_name']);
        q('DELETE FROM attachments WHERE id = ?', [$o['id']]);
    }
    out(['attachment' => ['id' => $id, 'name' => $meta['name'], 'mime' => $mime, 'size' => $meta['size'], 'url' => 'api.php?action=file&id=' . $id]]);
}

function serve_file(): void
{
    $id = (int)($_GET['id'] ?? 0);
    $token = (string)($_GET['t'] ?? '');
    $a = one('SELECT * FROM attachments WHERE id = ?', [$id]);
    $allowed = false;
    if ($a) {
        $me = current_user();
        if ($a['roster_id'] !== null) {
            $allowed = (bool)$me;
        } elseif ($a['post_id'] === null) {
            $allowed = $me && (int)$a['user_id'] === (int)$me['id'];
        } else {
            $post = one('SELECT * FROM posts WHERE id = ?', [$a['post_id']]);
            if ($post) {
                if ($me && can_view_post($me, $post)) $allowed = true;
                elseif ($token !== '' && setting('allow_guest', '0') === '1' && $post['share_token'] && hash_equals($post['share_token'], $token)
                    && $post['status'] === 'published' && (!$post['share_expires'] || $post['share_expires'] > now())) $allowed = true;
            }
        }
    }
    $path = $a ? NM_ROOT . '/uploads/' . $a['stored_name'] : '';
    if (!$allowed || !is_file($path)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Dosya bulunamadı veya erişim yetkiniz yok.';
        return;
    }
    session_write_close();

    $mime = $a['mime'];
    $inline = empty($_GET['dl']);
    $canInline = in_array($mime, INLINE_SAFE, true);
    $disp = ($inline && $canInline) ? 'inline' : 'attachment';
    $name = $a['orig_name'];
    $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: 'dosya');

    $size = filesize($path);
    $start = 0;
    $end = $size - 1;
    header('Content-Type: ' . $mime);
    header('Content-Disposition: ' . $disp . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($name));
    header('Accept-Ranges: bytes');
    // Ek kimliği değişmez (yeni yükleme = yeni kimlik), bu yüzden tarayıcı önbelleği uzun tutulabilir
    header('Cache-Control: private, max-age=31536000, immutable');
    if ($mime !== 'application/pdf') header("Content-Security-Policy: default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; sandbox");

    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', (string)$_SERVER['HTTP_RANGE'], $m)) {
        if ($m[1] === '' && $m[2] !== '') {
            $start = max(0, $size - (int)$m[2]);
        } else {
            $start = (int)$m[1];
            if ($m[2] !== '') $end = min((int)$m[2], $size - 1);
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            return;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    $length = $end - $start + 1;
    header('Content-Length: ' . $length);
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') return;

    while (ob_get_level()) ob_end_clean();
    $fp = fopen($path, 'rb');
    fseek($fp, $start);
    $left = $length;
    while ($left > 0 && !feof($fp)) {
        $chunk = fread($fp, (int)min(1048576, $left));
        if ($chunk === false) break;
        echo $chunk;
        flush();
        $left -= strlen($chunk);
    }
    fclose($fp);
}

/* ------------------------------------------------------------------ */
/* Nöbet Listeleri (Excel)                                             */
/* ------------------------------------------------------------------ */

function roster_out(array $r): array
{
    $cur = one('SELECT f.id AS fid, f.created_at, u.name AS user_name, a.id, a.orig_name, a.mime, a.size
        FROM roster_files f JOIN attachments a ON a.id = f.attachment_id LEFT JOIN users u ON u.id = f.user_id
        WHERE f.roster_id = ? ORDER BY f.id DESC LIMIT 1', [$r['id']]);
    return [
        'id' => (int)$r['id'],
        'name' => $r['name'],
        'file' => $cur ? [
            'id' => (int)$cur['id'], 'name' => $cur['orig_name'], 'mime' => $cur['mime'], 'size' => (int)$cur['size'],
            'url' => 'api.php?action=file&id=' . (int)$cur['id'], 'updated_at' => $cur['created_at'], 'user_name' => $cur['user_name'],
        ] : null,
        'versions' => (int)val('SELECT COUNT(*) FROM roster_files WHERE roster_id = ?', [$r['id']]),
        'period' => $r['period'] ?? null,
        'parsed_file_id' => isset($r['parsed_file_id']) ? (int)$r['parsed_file_id'] : null,
        'parsed_count' => $cur && isset($r['parsed_file_id']) && (int)$r['parsed_file_id'] === (int)$cur['id'] ? (int)val('SELECT COUNT(*) FROM roster_shifts WHERE roster_id = ?', [$r['id']]) : 0,
    ];
}

function a_rosters_list(): void
{
    need_user();
    out(['rosters' => array_map('roster_out', all('SELECT * FROM rosters ORDER BY sort, id'))]);
}

function a_rosters_save(): void
{
    $me = need_publisher();
    $id = i('id');
    $name = s('name', 120);
    if (mb_strlen($name) < 2) fail('Liste adı en az 2 karakter olmalıdır.');
    if ($id) {
        if (!valid_id('rosters', $id)) fail('Liste bulunamadı.', 404);
        q('UPDATE rosters SET name = ? WHERE id = ?', [$name, $id]);
        audit($me, 'roster.rename', $name);
    } else {
        q('INSERT INTO rosters (name, sort, created_at) VALUES (?, ?, ?)', [$name, (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM rosters'), now()]);
        $id = insert_id();
        audit($me, 'roster.create', $name);
    }
    out(['id' => $id, 'rosters' => array_map('roster_out', all('SELECT * FROM rosters ORDER BY sort, id'))]);
}

function delete_attachment_if_unused(int $attId): void
{
    if ((int)val('SELECT COUNT(*) FROM roster_files WHERE attachment_id = ?', [$attId]) > 0) return;
    $a = one('SELECT * FROM attachments WHERE id = ?', [$attId]);
    if (!$a || $a['post_id'] !== null) return;
    @unlink(NM_ROOT . '/uploads/' . $a['stored_name']);
    q('DELETE FROM attachments WHERE id = ?', [$attId]);
}

function a_rosters_delete(): void
{
    $me = need_publisher();
    $id = (int)i('id');
    if (!valid_id('rosters', $id)) fail('Liste bulunamadı.', 404);
    audit($me, 'roster.delete', (string)val('SELECT name FROM rosters WHERE id = ?', [$id]));
    q('DELETE FROM roster_shifts WHERE roster_id = ?', [$id]);
    $atts = array_column(all('SELECT attachment_id FROM roster_files WHERE roster_id = ?', [$id]), 'attachment_id');
    q('DELETE FROM roster_files WHERE roster_id = ?', [$id]);
    q('DELETE FROM rosters WHERE id = ?', [$id]);
    foreach (array_unique($atts) as $aid) delete_attachment_if_unused((int)$aid);
    out(['rosters' => array_map('roster_out', all('SELECT * FROM rosters ORDER BY sort, id'))]);
}

function add_roster_version(int $rosterId, int $attId, array $me): void
{
    q('UPDATE attachments SET roster_id = ? WHERE id = ?', [$rosterId, $attId]);
    q('INSERT INTO roster_files (roster_id, attachment_id, user_id, created_at) VALUES (?, ?, ?, ?)', [$rosterId, $attId, $me['id'], now()]);
    $old = all('SELECT id, attachment_id FROM roster_files WHERE roster_id = ? ORDER BY id DESC LIMIT 1000 OFFSET ' . ROSTER_KEEP_VERSIONS, [$rosterId]);
    foreach ($old as $o) {
        q('DELETE FROM roster_files WHERE id = ?', [$o['id']]);
        delete_attachment_if_unused((int)$o['attachment_id']);
    }
}

function a_rosters_upload(): void
{
    $me = need_publisher();
    $id = (int)i('id');
    $attId = (int)i('attachment_id');
    if (!valid_id('rosters', $id)) fail('Liste bulunamadı.', 404);
    if (!one('SELECT id FROM attachments WHERE id = ? AND user_id = ? AND post_id IS NULL AND roster_id IS NULL', [$attId, $me['id']])) fail('Yüklenen dosya bulunamadı.', 404);
    add_roster_version($id, $attId, $me);
    $roster = one('SELECT * FROM rosters WHERE id = ?', [$id]);
    audit($me, 'roster.upload', $roster['name'], (string)val('SELECT orig_name FROM attachments WHERE id = ?', [$attId]));
    $postId = null;
    if (setting('auto_post_roster', '1') === '1') {
        $file = one('SELECT orig_name FROM attachments WHERE id = ?', [$attId]);
        $cat = val("SELECT id FROM categories WHERE icon = 'megaphone' ORDER BY sort, id LIMIT 1") ?: val('SELECT id FROM categories ORDER BY sort, id LIMIT 1');
        $required = setting('auto_post_required', '0') === '1' ? 1 : 0;
        q('INSERT INTO posts (title, body, category_id, unit_id, author_id, status, pinned, required, created_at, updated_at, published_at) VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?, ?, ?)',
            ['“' . $roster['name'] . '” nöbet listesi güncellendi',
             $me['name'] . ' güncel nöbet listesini yükledi.' . ($file ? "\nDosya: " . $file['orig_name'] : '') . "\n\nListeyi açmak için: " . base_url() . '#/nobet/' . $id,
             $cat, $me['id'], 'published', $required, now(), now(), now()]);
        $postId = insert_id();
        q('INSERT INTO views (post_id, user_id) VALUES (?, ?)', [$postId, $me['id']]);
    }
    $mailed = notify_roster_updated($roster, $me);
    out(['roster' => roster_out($roster), 'post_id' => $postId, 'mailed' => $mailed]);
}

function a_rosters_versions(): void
{
    need_user();
    $id = (int)i('id');
    $rows = all('SELECT f.id AS fid, f.created_at, u.name AS user_name, a.id, a.orig_name, a.mime, a.size
        FROM roster_files f JOIN attachments a ON a.id = f.attachment_id LEFT JOIN users u ON u.id = f.user_id
        WHERE f.roster_id = ? ORDER BY f.id DESC', [$id]);
    out(['versions' => array_map(fn($r) => [
        'version_id' => (int)$r['fid'], 'id' => (int)$r['id'], 'name' => $r['orig_name'], 'mime' => $r['mime'], 'size' => (int)$r['size'],
        'url' => 'api.php?action=file&id=' . (int)$r['id'], 'updated_at' => $r['created_at'], 'user_name' => $r['user_name'],
    ], $rows)]);
}

function a_rosters_restore(): void
{
    $me = need_publisher();
    $id = (int)i('id');
    $f = one('SELECT * FROM roster_files WHERE id = ? AND roster_id = ?', [(int)i('version_id'), $id]);
    if (!$f) fail('Sürüm bulunamadı.', 404);
    add_roster_version($id, (int)$f['attachment_id'], $me);
    $r = one('SELECT * FROM rosters WHERE id = ?', [$id]);
    audit($me, 'roster.restore', $r['name'], 'Sürüm #' . (int)i('version_id'));
    out(['roster' => roster_out($r)]);
}

/* ------------------------------------------------------------------ */
/* Yönetim                                                             */
/* ------------------------------------------------------------------ */

function a_admin_users(): void
{
    need_admin();
    $rows = all('SELECT u.*, (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count FROM users u ORDER BY CASE WHEN u.status = \'pending\' THEN 0 ELSE 1 END, u.name');
    out(['users' => array_map(fn($r) => user_out($r) + ['post_count' => (int)$r['post_count']], $rows)]);
}

function admin_count(): int
{
    return (int)val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'");
}

function a_admin_user_save(): void
{
    global $IN;
    $me = need_admin();
    $id = i('id');
    $name = s('name', 120);
    $email = validate_email(s('email', 190));
    $role = s('role', 10);
    $status = s('status', 10);
    $titleId = i('title_id');
    $unitId = i('unit_id');
    if (mb_strlen($name) < 3) fail('Ad soyad girin.');
    if (!in_array($role, ROLES, true)) $role = 'member';
    if (!in_array($status, ['active', 'pending', 'disabled'], true)) $status = 'active';
    if (!valid_id('titles', $titleId)) $titleId = null;
    if (!valid_id('units', $unitId)) $unitId = null;
    $dupe = one('SELECT id FROM users WHERE email = ?', [$email]);
    if ($dupe && (int)$dupe['id'] !== (int)$id) fail('Bu e-posta başka bir hesapta kullanılıyor.', 409);

    if ($id) {
        $u = one('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$u) fail('Kullanıcı bulunamadı.', 404);
        $approved = $u['status'] === 'pending' && $status === 'active';
        $losingAdmin = $u['role'] === 'admin' && $u['status'] === 'active' && ($role !== 'admin' || $status !== 'active');
        if ($losingAdmin && admin_count() <= 1) fail('Sistemde en az bir aktif yönetici kalmalıdır.');
        q('UPDATE users SET name = ?, email = ?, role = ?, status = ?, title_id = ?, unit_id = ? WHERE id = ?',
            [$name, $email, $role, $status, $titleId, $unitId, $id]);
        if (array_key_exists('phone', $IN)) q('UPDATE users SET phone = ?, extension = ? WHERE id = ?', [preg_replace('/[^0-9+ ()-]/', '', s('phone', 30)) ?: null, preg_replace('/[^0-9A-Za-z -]/', '', s('extension', 12)) ?: null, $id]);
        audit($me, $approved ? 'user.approve' : 'user.edit', $name, 'Yetki: ' . $role . ', durum: ' . $status);
        if ($approved) notify_user_approved(['name' => $name, 'email' => $email]);
        out(['id' => $id]);
    }
    $pw = (string)($IN['password'] ?? '');
    $generated = null;
    if ($pw === '') {
        $generated = random_token(6);
        $pw = $generated;
    }
    validate_password($pw);
    q('INSERT INTO users (name, email, password_hash, title_id, unit_id, role, status, created_at, must_change) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
        [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $titleId, $unitId, $role, $status, now()]);
    $newId = insert_id();
    if (array_key_exists('phone', $IN)) q('UPDATE users SET phone = ?, extension = ? WHERE id = ?', [preg_replace('/[^0-9+ ()-]/', '', s('phone', 30)) ?: null, preg_replace('/[^0-9A-Za-z -]/', '', s('extension', 12)) ?: null, $newId]);
    audit($me, 'user.create', $name, $email);
    $mailed = b('send_email') ? send_credentials(['name' => $name, 'email' => $email], $pw, true) : 0;
    out(['id' => $newId, 'password' => $generated, 'mailed' => $mailed]);
}

function send_credentials(array $u, string $pw, bool $new): int
{
    if (!mail_ready()) return 0;
    return mail_queue_to([$u], $new ? 'Portal hesabınız oluşturuldu' : 'Geçici şifreniz',
        $new ? 'Hoş geldiniz, ' . $u['name'] : 'Şifreniz sıfırlandı',
        [($new ? 'Sizin için bir portal hesabı oluşturuldu.' : 'Yöneticiniz sizin için geçici bir şifre oluşturdu.') . "\n\nE-posta: " . $u['email'] . "\nGeçici şifre: " . $pw,
         'İlk girişte kendi şifrenizi belirlemeniz istenecek.'],
        'Giriş yap', base_url(), 'credentials', false);
}

function a_admin_user_resetpw(): void
{
    need_admin();
    $id = (int)i('id');
    if (!one('SELECT id FROM users WHERE id = ?', [$id])) fail('Kullanıcı bulunamadı.', 404);
    $pw = random_token(6);
    q('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
    $u = one('SELECT name, email FROM users WHERE id = ?', [$id]);
    audit(current_user(), 'user.resetpw', $u['name']);
    $mailed = b('send_email') ? send_credentials($u, $pw, false) : 0;
    out(['password' => $pw, 'mailed' => $mailed]);
}

function a_admin_user_delete(): void
{
    $me = need_admin();
    $id = (int)i('id');
    if ($id === (int)$me['id']) fail('Kendi hesabınızı silemezsiniz.');
    $u = one('SELECT * FROM users WHERE id = ?', [$id]);
    if (!$u) fail('Kullanıcı bulunamadı.', 404);
    if ($u['role'] === 'admin' && $u['status'] === 'active' && admin_count() <= 1) fail('Son yönetici silinemez.');
    foreach (['acks', 'views', 'saves'] as $t) q("DELETE FROM $t WHERE user_id = ?", [$id]);
    foreach (['passkeys', 'push_subscriptions', 'notifications'] as $t) q("DELETE FROM $t WHERE user_id = ?", [$id]);
    q('DELETE FROM users WHERE id = ?', [$id]);
    audit($me, 'user.delete', $u['name'], $u['email']);
    out();
}

function a_tax_save(): void
{
    $me = need_admin();
    $kind = s('kind', 20);
    $id = i('id');
    $name = s('name', 100);
    if (mb_strlen($name) < 2) fail('Ad en az 2 karakter olmalıdır.');
    switch ($kind) {
        case 'categories':
            $icon = in_array(s('icon', 30), ICONS, true) ? s('icon', 30) : 'folder';
            $color = in_array(s('color', 20), COLORS, true) ? s('color', 20) : 'teal';
            $cols = ['name' => $name, 'icon' => $icon, 'color' => $color];
            break;
        case 'units':
        case 'titles':
            $cols = ['name' => $name];
            break;
        default:
            fail('Geçersiz tür.');
    }
    if ($id) {
        if (!valid_id($kind, $id)) fail('Kayıt bulunamadı.', 404);
        $set = implode(', ', array_map(fn($c) => "$c = ?", array_keys($cols)));
        q("UPDATE $kind SET $set WHERE id = ?", array_merge(array_values($cols), [$id]));
    } else {
        $cols['sort'] = (int)val("SELECT COALESCE(MAX(sort), 0) + 1 FROM $kind");
        $names = implode(', ', array_keys($cols));
        $marks = implode(', ', array_fill(0, count($cols), '?'));
        q("INSERT INTO $kind ($names) VALUES ($marks)", array_values($cols));
        $id = insert_id();
    }
    audit($me, 'structure.save', $name, $kind);
    out(['id' => $id] + lists());
}

function a_tax_delete(): void
{
    $me = need_admin();
    $kind = s('kind', 20);
    $id = (int)i('id');
    if (!in_array($kind, ['categories', 'units', 'titles'], true) || !valid_id($kind, $id)) fail('Kayıt bulunamadı.', 404);
    if ((int)val("SELECT COUNT(*) FROM $kind") <= 1) fail('En az bir kayıt kalmalıdır.');
    switch ($kind) {
        case 'categories':
            $n = (int)val('SELECT COUNT(*) FROM posts WHERE category_id = ?', [$id]);
            if ($n > 0) fail("Bu bölümde $n içerik var. Önce içerikleri başka bölüme taşıyın veya silin.");
            break;
        case 'units':
            q('UPDATE users SET unit_id = NULL WHERE unit_id = ?', [$id]);
            q('UPDATE posts SET unit_id = NULL WHERE unit_id = ?', [$id]);
            break;
        case 'titles':
            q('UPDATE users SET title_id = NULL WHERE title_id = ?', [$id]);
            break;
    }
    audit($me, 'structure.delete', (string)val("SELECT name FROM $kind WHERE id = ?", [$id]), $kind);
    q("DELETE FROM $kind WHERE id = ?", [$id]);
    out(lists());
}

function a_settings_save(): void
{
    global $IN;
    $me = need_admin();
    $has = fn($k) => array_key_exists($k, $IN);
    $org = s('org_name', 120);
    if ($org !== '') set_setting('org_name', $org);
    $reg = s('registration', 10);
    if (in_array($reg, ['open', 'approval', 'closed'], true)) set_setting('registration', $reg);
    if ($has('banner_on')) set_setting('banner_on', b('banner_on') ? '1' : '0');
    if ($has('banner_text')) set_setting('banner_text', s('banner_text', 300));
    $tone = s('banner_tone', 10);
    if (in_array($tone, ['danger', 'info', 'success'], true)) set_setting('banner_tone', $tone);
    foreach (['allow_guest', 'auto_post_roster', 'auto_post_required', 'mail_on', 'push_enabled', 'digest_on', 'shift_remind_on', 'backup_weekly'] as $k) {
        if ($has($k)) set_setting($k, b($k) ? '1' : '0');
    }
    foreach (['digest_hour' => [0, 23], 'shift_remind_hour' => [0, 23], 'auto_remind_days' => [0, 60], 'review_warn_days' => [1, 120]] as $k => [$lo, $hi]) {
        if ($has($k)) set_setting($k, (string)max($lo, min($hi, (int)i($k))));
    }
    if ($has('default_notify_mode') && in_array(s('default_notify_mode', 10), ['instant', 'digest'], true)) set_setting('default_notify_mode', s('default_notify_mode', 10));
    if (b('apply_mode_all') && in_array(s('default_notify_mode', 10), ['instant', 'digest'], true)) {
        q("UPDATE users SET notify_mode = ? WHERE notify_mode <> 'off'", [s('default_notify_mode', 10)]);
    }
    foreach (array_keys(MAIL_EVENTS) as $k) {
        if ($has($k)) set_setting($k, b($k) ? '1' : '0');
    }
    if ($has('mail_host')) set_setting('mail_host', preg_replace('/[^A-Za-z0-9.\-]/', '', s('mail_host', 120)));
    if ($has('mail_port')) set_setting('mail_port', (string)max(1, min(65535, (int)i('mail_port') ?: 465)));
    if ($has('mail_secure')) set_setting('mail_secure', in_array(s('mail_secure', 5), ['ssl', 'tls', 'none'], true) ? s('mail_secure', 5) : 'ssl');
    if ($has('mail_user')) set_setting('mail_user', s('mail_user', 190));
    if ($has('mail_pass') && (string)$IN['mail_pass'] !== '') set_setting('mail_pass', (string)$IN['mail_pass']);
    if ($has('mail_from')) {
        $from = mb_strtolower(s('mail_from', 190));
        if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) fail('Gönderen e-posta adresi geçersiz.');
        set_setting('mail_from', $from);
    }
    if ($has('mail_from_name')) set_setting('mail_from_name', s('mail_from_name', 120));
    if (setting('mail_on') === '1' && !filter_var(setting('mail_from'), FILTER_VALIDATE_EMAIL)) fail('E-posta bildirimleri için gönderen e-posta adresini girin.');
    audit($me, 'settings.save', 'Ayarlar');
    out(['admin' => admin_settings()]);
}

function admin_settings(): array
{
    $events = [];
    foreach (MAIL_EVENTS as $k => $label) $events[] = ['key' => $k, 'label' => $label, 'on' => setting($k, '1') === '1'];
    return [
        'allow_guest' => setting('allow_guest', '0') === '1',
        'auto_post_roster' => setting('auto_post_roster', '1') === '1',
        'auto_post_required' => setting('auto_post_required', '0') === '1',
        'push_enabled' => setting('push_enabled', '1') === '1',
        'push_ready' => push_ready(),
        'digest_on' => setting('digest_on', '0') === '1',
        'digest_hour' => (int)setting('digest_hour', '7'),
        'shift_remind_on' => setting('shift_remind_on', '1') === '1',
        'shift_remind_hour' => (int)setting('shift_remind_hour', '18'),
        'auto_remind_days' => (int)setting('auto_remind_days', '3'),
        'review_warn_days' => (int)setting('review_warn_days', '14'),
        'backup_weekly' => setting('backup_weekly', '1') === '1',
        'default_notify_mode' => setting('default_notify_mode', 'instant'),
        'mail_on' => setting('mail_on') === '1',
        'mail_host' => setting('mail_host'),
        'mail_port' => (int)setting('mail_port', '465'),
        'mail_secure' => setting('mail_secure', 'ssl'),
        'mail_user' => setting('mail_user'),
        'mail_has_pass' => setting('mail_pass') !== '',
        'mail_from' => setting('mail_from'),
        'mail_from_name' => setting('mail_from_name'),
        'mail_ready' => mail_ready(),
        'events' => $events,
        'queue' => [
            'pending' => (int)val('SELECT COUNT(*) FROM mail_queue WHERE sent_at IS NULL AND attempts < 3'),
            'failed' => (int)val('SELECT COUNT(*) FROM mail_queue WHERE sent_at IS NULL AND attempts >= 3'),
            'sent_today' => (int)val('SELECT COUNT(*) FROM mail_queue WHERE sent_at >= ?', [date('Y-m-d 00:00:00')]),
        ],
    ];
}

function a_settings_get(): void
{
    need_admin();
    out(['admin' => admin_settings()]);
}

function a_mail_test(): void
{
    $me = need_admin();
    if (!mail_ready()) fail('Önce e-posta bildirimlerini açıp gönderen adresini kaydedin.');
    [$html, $text] = mail_template('Test e-postası', ['Bu bir deneme e-postasıdır. Bunu görüyorsanız portalın e-posta ayarları doğru çalışıyor.'], 'Portala git', base_url());
    q('INSERT INTO mail_queue (to_email, to_name, subject, html, text_body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$me['email'], $me['name'], 'NöbetMed test e-postası', $html, $text, 'test', now()]);
    $id = insert_id();
    $row = one('SELECT * FROM mail_queue WHERE id = ?', [$id]);
    q('UPDATE mail_queue SET locked_at = ? WHERE id = ?', [time(), $id]);
    $res = mail_send_batch([$row]);
    if (($res[$id] ?? null) === true) {
        q('UPDATE mail_queue SET sent_at = ?, locked_at = NULL WHERE id = ?', [now(), $id]);
        out(['message' => 'Test e-postası ' . $me['email'] . ' adresine gönderildi.']);
    }
    q('UPDATE mail_queue SET attempts = 3, error = ?, locked_at = NULL WHERE id = ?', [mb_substr((string)($res[$id] ?? 'Hata'), 0, 250), $id]);
    fail('Gönderilemedi: ' . ($res[$id] ?? 'bilinmeyen hata'));
}

function a_mail_log(): void
{
    need_admin();
    $rows = all('SELECT id, to_email, to_name, subject, kind, created_at, sent_at, attempts, error FROM mail_queue ORDER BY id DESC LIMIT 40');
    out(['log' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'to' => $r['to_name'] . ' <' . $r['to_email'] . '>', 'subject' => $r['subject'], 'kind' => $r['kind'],
        'created_at' => $r['created_at'], 'sent_at' => $r['sent_at'],
        'status' => $r['sent_at'] ? 'sent' : ((int)$r['attempts'] >= 3 ? 'failed' : 'pending'), 'error' => $r['error'],
    ], $rows)]);
}
