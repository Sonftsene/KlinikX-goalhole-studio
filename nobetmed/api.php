<?php
declare(strict_types=1);

require __DIR__ . '/inc/bootstrap.php';

nm_session();

set_exception_handler(function (Throwable $e) {
    error_log('[NobetMed] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['ok' => false, 'error' => 'Sunucu hatası oluştu. Lütfen tekrar deneyin.']);
});

const ALLOWED_EXT = [
    'pdf' => 'application/pdf',
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
    'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime', 'm4v' => 'video/mp4',
    'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'csv' => 'text/csv', 'txt' => 'text/plain',
];
const INLINE_MIME_PREFIX = ['image/', 'video/', 'audio/', 'application/pdf'];
const ROLES = ['admin', 'editor', 'member'];
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
    'upload' => 'a_upload',
    'guest.get' => 'a_guest_get',
    'shifts.month' => 'a_shifts_month',
    'shifts.set' => 'a_shifts_set',
    'shifts.mine' => 'a_shifts_mine',
    'admin.users' => 'a_admin_users',
    'admin.user.save' => 'a_admin_user_save',
    'admin.user.resetpw' => 'a_admin_user_resetpw',
    'admin.user.delete' => 'a_admin_user_delete',
    'tax.save' => 'a_tax_save',
    'tax.delete' => 'a_tax_delete',
    'settings.save' => 'a_settings_save',
];

if (!isset($routes[$action])) fail('Bilinmeyen işlem.', 404);
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
        'shift_types' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'start' => $r['start_time'], 'end' => $r['end_time'], 'color' => $r['color']], all('SELECT * FROM shift_types ORDER BY sort, id')),
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
    $rows = all('SELECT id, orig_name, mime, size FROM attachments WHERE post_id = ? ORDER BY id', [$postId]);
    return array_map(fn($a) => [
        'id' => (int)$a['id'],
        'name' => $a['orig_name'],
        'mime' => $a['mime'],
        'size' => (int)$a['size'],
        'url' => 'api.php?action=file&id=' . (int)$a['id'] . ($guestToken !== '' ? '&t=' . rawurlencode($guestToken) : ''),
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
    ];
}

/* ------------------------------------------------------------------ */
/* Açılış & Kimlik Doğrulama                                           */
/* ------------------------------------------------------------------ */

function a_boot(): void
{
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
        'upload_max_mb' => upload_limit_mb(),
    ] + lists();
    if ($me) {
        $data['settings'] += [
            'banner_on' => setting('banner_on') === '1',
            'banner_text' => setting('banner_text'),
            'banner_tone' => setting('banner_tone', 'danger'),
        ];
        $data['counts'] = counts_for($me);
        $data['people'] = array_map(fn($r) => [
            'id' => (int)$r['id'], 'name' => $r['name'],
            'title_id' => $r['title_id'] !== null ? (int)$r['title_id'] : null,
            'unit_id' => $r['unit_id'] !== null ? (int)$r['unit_id'] : null,
        ], all("SELECT id, name, title_id, unit_id FROM users WHERE status = 'active' ORDER BY name"));
    }
    out($data);
}

function upload_limit_mb(): int
{
    $toBytes = function (string $v): int {
        $v = trim($v);
        if ($v === '') return PHP_INT_MAX;
        $n = (int)$v;
        switch (strtolower(substr($v, -1))) {
            case 'g': $n *= 1024;
            // no break
            case 'm': $n *= 1024;
            // no break
            case 'k': $n *= 1024;
        }
        return $n > 0 ? $n : PHP_INT_MAX;
    };
    $limit = min($toBytes((string)ini_get('upload_max_filesize')), $toBytes((string)ini_get('post_max_size')), MAX_UPLOAD_MB * 1048576);
    return max(1, (int)floor($limit / 1048576));
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
    out();
}

function a_register(): void
{
    global $IN;
    $mode = setting('registration', 'approval');
    if ($mode === 'closed') fail('Yeni üye kaydı şu anda kapalı. Hesap için yöneticinize başvurun.', 403);
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
    q('INSERT INTO users (name, email, password_hash, title_id, unit_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $titleId, $unitId, 'member', $status, now()]);
    if ($status === 'active') {
        login_user(one('SELECT * FROM users WHERE id = ?', [insert_id()]));
        out(['pending' => false]);
    }
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
    if (!empty($me['password_hash']) && !password_verify($cur, $me['password_hash'])) fail('Mevcut şifre hatalı.');
    validate_password($new);
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $me['id']]);
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
        $where[] = '(' . like_expr('p.title') . ' LIKE :q1 OR ' . like_expr('p.body') . ' LIKE :q2)';
    }
    $order = ($filter === 'all' && $term === '') ? 'p.pinned DESC, ' : '';
    $sql = POST_SELECT . ' WHERE ' . implode(' AND ', $where)
        . " ORDER BY {$order}COALESCE(p.published_at, p.created_at) DESC, p.id DESC LIMIT " . ($limit + 1) . " OFFSET $offset";
    $rows = all($sql, $p);
    $more = count($rows) > $limit;
    $aud = audience_counts();
    out([
        'items' => array_map(fn($r) => post_out($r, $aud), array_slice($rows, 0, $limit)),
        'has_more' => $more,
    ]);
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
    $post['share'] = $canManage && $r['share_token'] && (!$r['share_expires'] || $r['share_expires'] > now())
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
    } else {
        $status = $pub ? 'published' : 'pending';
        q('INSERT INTO posts (title, body, category_id, unit_id, author_id, status, pinned, required, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$title, $body, $catId, $unitId, $me['id'], $status, (int)$pinned, (int)$required, now(), now(), $pub ? now() : null]);
        $id = insert_id();
        // Yazar kendi içeriğini okumuş sayılır
        q('INSERT INTO views (post_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
    }

    foreach (arr('remove_attachment_ids') as $aid) {
        $a = one('SELECT * FROM attachments WHERE id = ? AND post_id = ?', [(int)$aid, $id]);
        if ($a) {
            @unlink(NM_ROOT . '/uploads/' . $a['stored_name']);
            q('DELETE FROM attachments WHERE id = ?', [$a['id']]);
        }
    }
    foreach (arr('attachment_ids') as $aid) {
        q('UPDATE attachments SET post_id = ? WHERE id = ? AND user_id = ? AND post_id IS NULL', [$id, (int)$aid, $me['id']]);
    }
    out(['id' => $id, 'status' => $status]);
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
    out();
}

function a_posts_approve(): void
{
    need_publisher();
    $id = (int)i('id');
    $post = one("SELECT * FROM posts WHERE id = ? AND status = 'pending'", [$id]);
    if (!$post) fail('Onay bekleyen içerik bulunamadı.', 404);
    q("UPDATE posts SET status = 'published', reject_reason = NULL, published_at = ?, updated_at = ? WHERE id = ?", [now(), now(), $id]);
    out();
}

function a_posts_reject(): void
{
    need_publisher();
    $id = (int)i('id');
    $reason = s('reason', 255);
    $post = one("SELECT * FROM posts WHERE id = ? AND status = 'pending'", [$id]);
    if (!$post) fail('Onay bekleyen içerik bulunamadı.', 404);
    q("UPDATE posts SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?", [$reason !== '' ? $reason : null, now(), $id]);
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

function a_posts_share(): void
{
    $me = need_user();
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

function a_upload(): void
{
    $me = need_user();
    $f = $_FILES['file'] ?? null;
    if (!$f || !is_array($f) || is_array($f['error'])) fail('Dosya alınamadı.');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) fail('Dosya çok büyük. En fazla ' . upload_limit_mb() . ' MB yükleyebilirsiniz.');
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Dosya yüklenemedi (kod ' . (int)$f['error'] . ').');
    if ($f['size'] > upload_limit_mb() * 1048576) fail('Dosya çok büyük. En fazla ' . upload_limit_mb() . ' MB yükleyebilirsiniz.');
    $orig = mb_substr(basename(str_replace('\\', '/', (string)$f['name'])), 0, 200);
    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if (!isset(ALLOWED_EXT[$ext])) fail('Bu dosya türü desteklenmiyor: .' . $ext);
    $mime = ALLOWED_EXT[$ext];

    $dir = NM_ROOT . '/uploads';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $stored)) fail('Dosya sunucuya kaydedilemedi. Klasör izinlerini kontrol edin.', 500);

    q('INSERT INTO attachments (post_id, user_id, orig_name, stored_name, mime, size, created_at) VALUES (NULL, ?, ?, ?, ?, ?, ?)',
        [$me['id'], $orig, $stored, $mime, (int)$f['size'], now()]);
    $id = insert_id();

    // Bir günden eski, içeriğe bağlanmamış dosyaları temizle
    foreach (all('SELECT id, stored_name FROM attachments WHERE post_id IS NULL AND created_at < ?', [date('Y-m-d H:i:s', time() - 86400)]) as $o) {
        @unlink($dir . '/' . $o['stored_name']);
        q('DELETE FROM attachments WHERE id = ?', [$o['id']]);
    }
    out(['attachment' => ['id' => $id, 'name' => $orig, 'mime' => $mime, 'size' => (int)$f['size'], 'url' => 'api.php?action=file&id=' . $id]]);
}

function serve_file(): void
{
    $id = (int)($_GET['id'] ?? 0);
    $token = (string)($_GET['t'] ?? '');
    $a = one('SELECT * FROM attachments WHERE id = ?', [$id]);
    $allowed = false;
    if ($a) {
        $me = current_user();
        if ($a['post_id'] === null) {
            $allowed = $me && (int)$a['user_id'] === (int)$me['id'];
        } else {
            $post = one('SELECT * FROM posts WHERE id = ?', [$a['post_id']]);
            if ($post) {
                if ($me && can_view_post($me, $post)) $allowed = true;
                elseif ($token !== '' && $post['share_token'] && hash_equals($post['share_token'], $token)
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
    $canInline = false;
    foreach (INLINE_MIME_PREFIX as $pre) if (str_starts_with($mime, $pre)) $canInline = true;
    $disp = ($inline && $canInline) ? 'inline' : 'attachment';
    $name = $a['orig_name'];
    $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: 'dosya');

    $size = filesize($path);
    $start = 0;
    $end = $size - 1;
    header('Content-Type: ' . $mime);
    header('Content-Disposition: ' . $disp . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($name));
    header('Accept-Ranges: bytes');
    header('Cache-Control: private, max-age=3600');
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
/* Nöbet Çizelgesi                                                     */
/* ------------------------------------------------------------------ */

function a_shifts_month(): void
{
    need_user();
    $unit = (int)i('unit_id');
    $ym = s('month', 7);
    if (!preg_match('/^\d{4}-\d{2}$/', $ym)) fail('Geçersiz ay.');
    $first = $ym . '-01';
    $from = date('Y-m-d', strtotime($first . ' -1 day'));
    $to = date('Y-m-d', strtotime($first . ' +1 month'));
    $rows = all('SELECT id, date, type_id, user_id, name FROM shifts WHERE unit_id = ? AND date >= ? AND date <= ? ORDER BY date, type_id, id', [$unit, $from, $to]);
    out(['shifts' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'date' => $r['date'], 'type_id' => (int)$r['type_id'],
        'user_id' => $r['user_id'] !== null ? (int)$r['user_id'] : null, 'name' => $r['name'],
    ], $rows)]);
}

function a_shifts_set(): void
{
    need_publisher();
    $unit = i('unit_id');
    $date = s('date', 10);
    $type = i('type_id');
    if (!valid_id('units', $unit)) fail('Geçersiz birim.');
    if (!valid_id('shift_types', $type)) fail('Geçersiz vardiya.');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !strtotime($date)) fail('Geçersiz tarih.');
    $people = [];
    $seen = [];
    foreach (array_slice(arr('people'), 0, 30) as $p) {
        if (!is_array($p)) continue;
        $uid = isset($p['user_id']) && is_numeric($p['user_id']) ? (int)$p['user_id'] : null;
        $name = mb_substr(trim((string)($p['name'] ?? '')), 0, 120);
        if ($uid !== null) {
            $u = one('SELECT id, name FROM users WHERE id = ?', [$uid]);
            if (!$u) continue;
            $name = $u['name'];
        }
        if ($name === '') continue;
        $key = $uid !== null ? 'u' . $uid : 'n' . tr_lower($name);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $people[] = [$uid, $name];
    }
    db()->beginTransaction();
    q('DELETE FROM shifts WHERE unit_id = ? AND date = ? AND type_id = ?', [$unit, $date, $type]);
    foreach ($people as [$uid, $name]) {
        q('INSERT INTO shifts (unit_id, date, type_id, user_id, name) VALUES (?, ?, ?, ?, ?)', [$unit, $date, $type, $uid, $name]);
    }
    db()->commit();
    out();
}

function a_shifts_mine(): void
{
    $me = need_user();
    $rows = all('SELECT s.date, s.type_id, s.unit_id FROM shifts s WHERE s.user_id = ? AND s.date >= ? AND s.date <= ? ORDER BY s.date, s.type_id',
        [$me['id'], date('Y-m-d', strtotime('-1 day')), date('Y-m-d', strtotime('+60 days'))]);
    out(['shifts' => array_map(fn($r) => ['date' => $r['date'], 'type_id' => (int)$r['type_id'], 'unit_id' => (int)$r['unit_id']], $rows)]);
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
        $losingAdmin = $u['role'] === 'admin' && $u['status'] === 'active' && ($role !== 'admin' || $status !== 'active');
        if ($losingAdmin && admin_count() <= 1) fail('Sistemde en az bir aktif yönetici kalmalıdır.');
        q('UPDATE users SET name = ?, email = ?, role = ?, status = ?, title_id = ?, unit_id = ? WHERE id = ?',
            [$name, $email, $role, $status, $titleId, $unitId, $id]);
        out(['id' => $id]);
    }
    $pw = (string)($IN['password'] ?? '');
    $generated = null;
    if ($pw === '') {
        $generated = random_token(6);
        $pw = $generated;
    }
    validate_password($pw);
    q('INSERT INTO users (name, email, password_hash, title_id, unit_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $titleId, $unitId, $role, $status, now()]);
    out(['id' => insert_id(), 'password' => $generated]);
}

function a_admin_user_resetpw(): void
{
    need_admin();
    $id = (int)i('id');
    if (!one('SELECT id FROM users WHERE id = ?', [$id])) fail('Kullanıcı bulunamadı.', 404);
    $pw = random_token(6);
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
    out(['password' => $pw]);
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
    q('UPDATE shifts SET user_id = NULL WHERE user_id = ?', [$id]);
    q('DELETE FROM users WHERE id = ?', [$id]);
    out();
}

function a_tax_save(): void
{
    need_admin();
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
        case 'shift_types':
            $start = s('start', 5);
            $end = s('end', 5);
            if (!preg_match('/^\d{2}:\d{2}$/', $start) || !preg_match('/^\d{2}:\d{2}$/', $end)) fail('Saatleri SS:DD biçiminde girin.');
            $color = in_array(s('color', 20), COLORS, true) ? s('color', 20) : 'sky';
            $cols = ['name' => $name, 'start_time' => $start, 'end_time' => $end, 'color' => $color];
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
    out(['id' => $id] + lists());
}

function a_tax_delete(): void
{
    need_admin();
    $kind = s('kind', 20);
    $id = (int)i('id');
    if (!in_array($kind, ['categories', 'units', 'titles', 'shift_types'], true) || !valid_id($kind, $id)) fail('Kayıt bulunamadı.', 404);
    if ((int)val("SELECT COUNT(*) FROM $kind") <= 1) fail('En az bir kayıt kalmalıdır.');
    switch ($kind) {
        case 'categories':
            $n = (int)val('SELECT COUNT(*) FROM posts WHERE category_id = ?', [$id]);
            if ($n > 0) fail("Bu bölümde $n içerik var. Önce içerikleri başka bölüme taşıyın veya silin.");
            break;
        case 'units':
            $n = (int)val('SELECT COUNT(*) FROM shifts WHERE unit_id = ?', [$id]);
            if ($n > 0) fail("Bu birimin nöbet çizelgesinde $n kayıt var. Önce çizelgeyi temizleyin.");
            q('UPDATE users SET unit_id = NULL WHERE unit_id = ?', [$id]);
            q('UPDATE posts SET unit_id = NULL WHERE unit_id = ?', [$id]);
            break;
        case 'titles':
            q('UPDATE users SET title_id = NULL WHERE title_id = ?', [$id]);
            break;
        case 'shift_types':
            $n = (int)val('SELECT COUNT(*) FROM shifts WHERE type_id = ?', [$id]);
            if ($n > 0) fail("Bu vardiya türü çizelgede $n kez kullanılıyor. Önce o atamaları kaldırın.");
            break;
    }
    q("DELETE FROM $kind WHERE id = ?", [$id]);
    out(lists());
}

function a_settings_save(): void
{
    need_admin();
    $org = s('org_name', 120);
    if ($org !== '') set_setting('org_name', $org);
    $reg = s('registration', 10);
    if (in_array($reg, ['open', 'approval', 'closed'], true)) set_setting('registration', $reg);
    set_setting('banner_on', b('banner_on') ? '1' : '0');
    set_setting('banner_text', s('banner_text', 300));
    $tone = s('banner_tone', 10);
    set_setting('banner_tone', in_array($tone, ['danger', 'info', 'success'], true) ? $tone : 'danger');
    out();
}
