<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

date_default_timezone_set(APP_TIMEZONE);
mb_internal_encoding('UTF-8');

const NM_VERSION = '2.1.0';
const NM_ROOT = __DIR__ . '/..';

header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function nm_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

function nm_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('nm_sid');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path' => '/',
        'secure' => nm_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 30));
    ini_set('session.use_strict_mode', '1');
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (DB_DRIVER === 'mysql') {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, $opts);
    } else {
        $dir = NM_ROOT . '/data';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $pdo = new PDO('sqlite:' . $dir . '/nobetmed.sqlite', null, null, $opts);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
    }
    nm_migrate($pdo);
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function one(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function all(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function val(string $sql, array $params = [])
{
    $r = q($sql, $params)->fetchColumn();
    return $r === false ? null : $r;
}

function insert_id(): int
{
    return (int)db()->lastInsertId();
}

function nm_migrate(PDO $pdo): void
{
    $my = DB_DRIVER === 'mysql';
    $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $end = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';

    $version = 0;
    try {
        $version = (int)$pdo->query("SELECT v FROM settings WHERE k = 'schema_version'")->fetchColumn();
    } catch (Throwable $e) {
        // tablo yok, kurulum yapılacak
    }
    if ($version >= 2) return;

    $tables = [
        "CREATE TABLE IF NOT EXISTS settings (k VARCHAR(50) NOT NULL PRIMARY KEY, v TEXT)$end",
        "CREATE TABLE IF NOT EXISTS units (id $pk, name VARCHAR(100) NOT NULL, sort INT NOT NULL DEFAULT 0)$end",
        "CREATE TABLE IF NOT EXISTS titles (id $pk, name VARCHAR(100) NOT NULL, sort INT NOT NULL DEFAULT 0)$end",
        "CREATE TABLE IF NOT EXISTS categories (id $pk, name VARCHAR(100) NOT NULL, icon VARCHAR(30) NOT NULL DEFAULT 'folder', color VARCHAR(20) NOT NULL DEFAULT 'teal', sort INT NOT NULL DEFAULT 0)$end",
        "CREATE TABLE IF NOT EXISTS users (
            id $pk,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            google_sub VARCHAR(64) NULL,
            title_id INT NULL,
            unit_id INT NULL,
            role VARCHAR(10) NOT NULL DEFAULT 'member',
            status VARCHAR(10) NOT NULL DEFAULT 'active',
            created_at VARCHAR(19) NOT NULL,
            last_seen_at VARCHAR(19) NULL
        )$end",
        "CREATE TABLE IF NOT EXISTS posts (
            id $pk,
            title VARCHAR(200) NOT NULL,
            body TEXT NOT NULL,
            category_id INT NOT NULL,
            unit_id INT NULL,
            author_id INT NOT NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'pending',
            pinned INT NOT NULL DEFAULT 0,
            required INT NOT NULL DEFAULT 0,
            reject_reason VARCHAR(255) NULL,
            share_token VARCHAR(40) NULL,
            share_expires VARCHAR(19) NULL,
            created_at VARCHAR(19) NOT NULL,
            updated_at VARCHAR(19) NOT NULL,
            published_at VARCHAR(19) NULL
        )$end",
        "CREATE TABLE IF NOT EXISTS attachments (
            id $pk,
            post_id INT NULL,
            roster_id INT NULL,
            user_id INT NOT NULL,
            orig_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(80) NOT NULL,
            mime VARCHAR(100) NOT NULL,
            size BIGINT NOT NULL,
            created_at VARCHAR(19) NOT NULL
        )$end",
        "CREATE TABLE IF NOT EXISTS acks (post_id INT NOT NULL, user_id INT NOT NULL, created_at VARCHAR(19) NOT NULL, PRIMARY KEY (post_id, user_id))$end",
        "CREATE TABLE IF NOT EXISTS views (post_id INT NOT NULL, user_id INT NOT NULL, PRIMARY KEY (post_id, user_id))$end",
        "CREATE TABLE IF NOT EXISTS saves (post_id INT NOT NULL, user_id INT NOT NULL, PRIMARY KEY (post_id, user_id))$end",
        "CREATE TABLE IF NOT EXISTS rosters (id $pk, name VARCHAR(120) NOT NULL, sort INT NOT NULL DEFAULT 0, created_at VARCHAR(19) NOT NULL)$end",
        "CREATE TABLE IF NOT EXISTS roster_files (id $pk, roster_id INT NOT NULL, attachment_id INT NOT NULL, user_id INT NOT NULL, created_at VARCHAR(19) NOT NULL)$end",
        "CREATE TABLE IF NOT EXISTS login_attempts (id $pk, ip VARCHAR(45) NOT NULL, email VARCHAR(190) NOT NULL, at INT NOT NULL)$end",
    ];
    foreach ($tables as $sql) $pdo->exec($sql);

    // Sürüm 1'den yükseltme: eklere nöbet listesi bağlantısı
    if ($version === 1) {
        try { $pdo->exec('ALTER TABLE attachments ADD COLUMN roster_id INT NULL'); } catch (Throwable $e) { /* zaten var */ }
        if ($my) {
            try { $pdo->exec('ALTER TABLE attachments MODIFY size BIGINT NOT NULL'); } catch (Throwable $e) { /* */ }
        }
    }

    $indexes = [
        'CREATE INDEX idx_posts_status ON posts (status, published_at)',
        'CREATE UNIQUE INDEX idx_posts_share ON posts (share_token)',
        'CREATE INDEX idx_att_post ON attachments (post_id)',
        'CREATE INDEX idx_roster_files ON roster_files (roster_id, id)',
        'CREATE INDEX idx_login_ip ON login_attempts (ip, at)',
    ];
    foreach ($indexes as $sql) {
        try { $pdo->exec($sql); } catch (Throwable $e) { /* zaten var */ }
    }

    $ins = function (string $sql, array $rows) use ($pdo) {
        $st = $pdo->prepare($sql);
        foreach ($rows as $i => $r) $st->execute(array_merge($r, [$i]));
    };
    if ((int)$pdo->query('SELECT COUNT(*) FROM categories')->fetchColumn() === 0) {
        $ins('INSERT INTO categories (name, icon, color, sort) VALUES (?, ?, ?, ?)', [
            ['Duyurular', 'megaphone', 'rose'],
            ['Eğitim & Video', 'play', 'violet'],
            ['Klinik Protokoller', 'stethoscope', 'teal'],
            ['Belgeler & Formlar', 'file', 'sky'],
            ['Toplantı Kararları', 'users', 'amber'],
        ]);
        $ins('INSERT INTO titles (name, sort) VALUES (?, ?)', [
            ['Sorumlu Hemşire'], ['Sorumlu Hemşire Yardımcısı'], ['Eğitim Hemşiresi'], ['Hemşire'], ['Personel'],
        ]);
        $ins('INSERT INTO units (name, sort) VALUES (?, ?)', [['Genel']]);
        $set = $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?)');
        foreach ([
            'org_name' => 'Klinik Portalı',
            'registration' => 'approval',
            'banner_on' => '0',
            'banner_text' => '',
            'banner_tone' => 'danger',
        ] as $k => $v) $set->execute([$k, $v]);
    }
    if ((int)$pdo->query('SELECT COUNT(*) FROM rosters')->fetchColumn() === 0) {
        $st = $pdo->prepare('INSERT INTO rosters (name, sort, created_at) VALUES (?, ?, ?)');
        $st->execute(['Hemşire Nöbet Listesi', 0, date('Y-m-d H:i:s')]);
        $st->execute(['Personel Nöbet Listesi', 1, date('Y-m-d H:i:s')]);
    }
    $pdo->exec("DELETE FROM settings WHERE k = 'schema_version'");
    $pdo->exec("INSERT INTO settings (k, v) VALUES ('schema_version', '2')");
}

function setting(string $k, string $default = ''): string
{
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        foreach (all('SELECT k, v FROM settings') as $r) $cache[$r['k']] = (string)$r['v'];
    }
    return $cache[$k] ?? $default;
}

function set_setting(string $k, string $v): void
{
    if (one('SELECT k FROM settings WHERE k = ?', [$k])) {
        q('UPDATE settings SET v = ? WHERE k = ?', [$v, $k]);
    } else {
        q('INSERT INTO settings (k, v) VALUES (?, ?)', [$k, $v]);
    }
}

function current_user(): ?array
{
    static $user = false;
    if ($user !== false) return $user;
    nm_session();
    $user = null;
    if (!empty($_SESSION['uid'])) {
        $u = one('SELECT * FROM users WHERE id = ?', [(int)$_SESSION['uid']]);
        if ($u && $u['status'] === 'active') {
            $user = $u;
            if (empty($_SESSION['seen']) || $_SESSION['seen'] < time() - 300) {
                q('UPDATE users SET last_seen_at = ? WHERE id = ?', [now(), $u['id']]);
                $_SESSION['seen'] = time();
            }
        } else {
            unset($_SESSION['uid']);
        }
    }
    return $user;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function random_token(int $bytes = 12): string
{
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}
