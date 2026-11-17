<?php
declare(strict_types=1);

// Kendi ayarlarınız config.php'de; paket bu dosyayı içermez, güncellemede üzerine yazılmaz.
// config.php yoksa varsayılanlar (config.sample.php) kullanılır.
require_once is_file(__DIR__ . '/../config.php') ? __DIR__ . '/../config.php' : __DIR__ . '/../config.sample.php';
foreach (['DB_DRIVER' => 'sqlite', 'DB_HOST' => 'localhost', 'DB_NAME' => '', 'DB_USER' => '', 'DB_PASS' => '', 'APP_URL' => '', 'GOOGLE_CLIENT_ID' => '',
    'INITIAL_ADMIN_NAME' => '', 'INITIAL_ADMIN_EMAIL' => '', 'INITIAL_ADMIN_PASSWORD_HASH' => '', 'INITIAL_ORG_NAME' => '', 'APP_TIMEZONE' => 'Europe/Istanbul', 'MAX_UPLOAD_MB' => 0] as $k => $v) {
    if (!defined($k)) define($k, $v);
}

date_default_timezone_set(APP_TIMEZONE);
mb_internal_encoding('UTF-8');

const NM_VERSION = '3.8.1';
const NM_ROOT = __DIR__ . '/..';

// data/ (veritabanı) ve uploads/ (dosyalar) pakette yoktur; güncellemede üzerine yazılmasın diye ilk açılışta burada oluşur
foreach (['data', 'uploads'] as $nmDir) {
    $nmPath = NM_ROOT . '/' . $nmDir;
    if (!is_dir($nmPath)) @mkdir($nmPath, 0755, true);
    if (!is_file($nmPath . '/.htaccess')) @file_put_contents($nmPath . '/.htaccess', "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
}

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
    // Paylaşımlı sunucuda sistem temizleyicisi oturumları ~24 dakikada silebilir: oturumları kendi klasörümüzde tut
    $sd = NM_ROOT . '/data/sessions';
    if (is_dir($sd) || @mkdir($sd, 0700, true)) {
        if (is_writable($sd)) {
            session_save_path($sd);
            ini_set('session.gc_probability', '1');
            ini_set('session.gc_divisor', '200');
        }
    }
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
        $pdo = new PDO('sqlite:' . sqlite_path(), null, null, $opts);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        // Güncelleme sırasında veritabanı adı kaybolduysa boş bir veritabanı açılmış (belki kurulum ekranında tek hesap
        // oluşturulmuş) olabilir: klasörde daha çok kullanıcısı olan eski veritabanı varsa ona geri dön
        if (($cnt = sqlite_user_count($pdo)) <= 1 && ($old = sqlite_find_existing(basename(sqlite_path()), $cnt))) {
            $pdo = null;
            file_put_contents(NM_ROOT . '/data/.dbname.php', "<?php return '$old';\n");
            error_log('[dupcii] boş veritabanı yerine mevcut veriler kullanılıyor: ' . $old);
            $pdo = new PDO('sqlite:' . NM_ROOT . '/data/' . $old, null, null, $opts);
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 5000');
        }
    }
    nm_migrate($pdo);
    return $pdo;
}

/**
 * Veritabanı dosyası tahmin edilemez bir adla saklanır: sunucu .htaccess kuralını
 * uygulamasa bile dosyanın adresi bilinemez. Eski kurulumlardaki nobetmed.sqlite taşınır.
 */
function sqlite_path(): string
{
    $dir = NM_ROOT . '/data';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $nameFile = $dir . '/.dbname.php';
    $name = is_file($nameFile) ? (string)(include $nameFile) : '';
    if (preg_match('/^nm-[a-f0-9]{24}\.sqlite$/', $name) && !is_file($dir . '/' . $name) && ($old = sqlite_find_existing($name))) {
        file_put_contents($nameFile, "<?php return '$old';\n");
        return $dir . '/' . $old;
    }
    if (!preg_match('/^nm-[a-f0-9]{24}\.sqlite$/', $name)) {
        if ($old = sqlite_find_existing('')) {
            file_put_contents($nameFile, "<?php return '$old';\n");
            return $dir . '/' . $old;
        }
        $name = 'nm-' . bin2hex(random_bytes(12)) . '.sqlite';
        if (is_file($dir . '/nobetmed.sqlite')) {
            foreach (['', '-wal', '-shm'] as $sfx) {
                if (is_file($dir . '/nobetmed.sqlite' . $sfx)) @rename($dir . '/nobetmed.sqlite' . $sfx, $dir . '/' . $name . $sfx);
            }
        }
        file_put_contents($nameFile, "<?php return '$name';\n");
    }
    return $dir . '/' . $name;
}

function sqlite_user_count(PDO $pdo): int
{
    try { return (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn(); } catch (Throwable $e) { return 0; }
}

/** data/ klasöründe $minUsers'tan çok kullanıcısı olan başka bir dupcii veritabanı (en çok kullanıcılı, eşitse en yeni) */
function sqlite_find_existing(string $except, int $minUsers = 0): ?string
{
    $best = null;
    $bestKey = [0, 0];
    foreach (glob(NM_ROOT . '/data/{nm-*.sqlite,nobetmed.sqlite}', GLOB_BRACE) ?: [] as $f) {
        $n = basename($f);
        if ($n === $except || !preg_match('/^(nm-[a-f0-9]{24}|nobetmed)\.sqlite$/', $n)) continue;
        try {
            $p = new PDO('sqlite:' . $f, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $u = sqlite_user_count($p);
            $p = null;
        } catch (Throwable $e) { continue; }
        $key = [$u, (int)@filemtime($f)];
        if ($u > $minUsers && $key > $bestKey) { $best = $n; $bestKey = $key; }
    }
    if ($best === 'nobetmed.sqlite') {
        $name = 'nm-' . bin2hex(random_bytes(12)) . '.sqlite';
        foreach (['', '-wal', '-shm'] as $sfx) if (is_file(NM_ROOT . '/data/nobetmed.sqlite' . $sfx)) @rename(NM_ROOT . '/data/nobetmed.sqlite' . $sfx, NM_ROOT . '/data/' . $name . $sfx);
        $best = $name;
    }
    return $best;
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
    if ($version >= 9) return;

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
            last_seen_at VARCHAR(19) NULL,
            email_notify INT NOT NULL DEFAULT 1,
            must_change INT NOT NULL DEFAULT 0
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
        "CREATE TABLE IF NOT EXISTS mail_queue (
            id $pk,
            to_email VARCHAR(190) NOT NULL,
            to_name VARCHAR(120) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            html TEXT NOT NULL,
            text_body TEXT NOT NULL,
            kind VARCHAR(30) NOT NULL DEFAULT '',
            created_at VARCHAR(19) NOT NULL,
            attempts INT NOT NULL DEFAULT 0,
            locked_at INT NULL,
            sent_at VARCHAR(19) NULL,
            error VARCHAR(255) NULL
        )$end",
        "CREATE TABLE IF NOT EXISTS roster_shifts (id $pk, roster_id INT NOT NULL, file_id INT NOT NULL, name VARCHAR(120) NOT NULL, title VARCHAR(80) NULL, date VARCHAR(10) NOT NULL, code VARCHAR(20) NOT NULL, label VARCHAR(60) NULL, kind VARCHAR(10) NOT NULL DEFAULT 'shift', hours INT NULL, start_time VARCHAR(5) NULL, end_time VARCHAR(5) NULL)$end",
        "CREATE TABLE IF NOT EXISTS audit_log (id $pk, user_id INT NULL, user_name VARCHAR(120) NULL, action VARCHAR(40) NOT NULL, target VARCHAR(200) NULL, detail VARCHAR(255) NULL, ip VARCHAR(45) NULL, at VARCHAR(19) NOT NULL)$end",
        "CREATE TABLE IF NOT EXISTS notifications (id $pk, user_id INT NOT NULL, title VARCHAR(200) NOT NULL, body VARCHAR(400) NULL, url VARCHAR(200) NULL, kind VARCHAR(30) NOT NULL DEFAULT '', created_at VARCHAR(19) NOT NULL, read_at VARCHAR(19) NULL)$end",
        "CREATE TABLE IF NOT EXISTS push_subscriptions (id $pk, user_id INT NOT NULL, endpoint TEXT NOT NULL, endpoint_hash VARCHAR(64) NOT NULL, p256dh VARCHAR(255) NULL, auth VARCHAR(100) NULL, created_at VARCHAR(19) NOT NULL, last_ok VARCHAR(19) NULL)$end",
        "CREATE TABLE IF NOT EXISTS passkeys (id $pk, user_id INT NOT NULL, credential_id VARCHAR(255) NOT NULL, public_key TEXT NOT NULL, sign_count INT NOT NULL DEFAULT 0, name VARCHAR(80) NULL, created_at VARCHAR(19) NOT NULL, last_used_at VARCHAR(19) NULL)$end",
        "CREATE TABLE IF NOT EXISTS invites (id $pk, token VARCHAR(40) NOT NULL, kind VARCHAR(10) NOT NULL, name VARCHAR(120) NULL, email VARCHAR(190) NULL, title_id INT NULL, unit_id INT NULL, role VARCHAR(10) NOT NULL DEFAULT 'member', auto_approve INT NOT NULL DEFAULT 0, max_uses INT NOT NULL DEFAULT 1, uses INT NOT NULL DEFAULT 0, expires VARCHAR(19) NULL, created_by INT NULL, created_at VARCHAR(19) NOT NULL, revoked INT NOT NULL DEFAULT 0, used_by INT NULL)$end",
        "CREATE TABLE IF NOT EXISTS templates (id $pk, title VARCHAR(200) NOT NULL, body TEXT NOT NULL, category_id INT NULL, required INT NOT NULL DEFAULT 0, created_by INT NULL, created_at VARCHAR(19) NOT NULL, sort INT NOT NULL DEFAULT 0)$end",
        "CREATE TABLE IF NOT EXISTS password_resets (id $pk, user_id INT NOT NULL, token_hash VARCHAR(64) NOT NULL, expires INT NOT NULL, used INT NOT NULL DEFAULT 0)$end",
        "CREATE TABLE IF NOT EXISTS phonebook (id $pk, name VARCHAR(120) NOT NULL, number VARCHAR(40) NOT NULL, category VARCHAR(60) NOT NULL DEFAULT '', note VARCHAR(200) NOT NULL DEFAULT '', pinned INT NOT NULL DEFAULT 0, sort INT NOT NULL DEFAULT 0, updated_by INT NULL, updated_at VARCHAR(19) NULL)$end",
        "CREATE TABLE IF NOT EXISTS side_moves (id $pk, date VARCHAR(10) NOT NULL, name VARCHAR(120) NOT NULL, user_id INT NULL, from_side VARCHAR(20) NOT NULL, to_side VARCHAR(20) NOT NULL, unit VARCHAR(40) NOT NULL DEFAULT '', code VARCHAR(20) NOT NULL DEFAULT '', counted INT NOT NULL DEFAULT 0, method VARCHAR(10) NOT NULL DEFAULT 'elle', pool TEXT NULL, note VARCHAR(200) NULL, created_by INT NULL, created_at VARCHAR(19) NOT NULL)$end",
        "CREATE TABLE IF NOT EXISTS swap_requests (id $pk, roster_id INT NOT NULL, kind VARCHAR(10) NOT NULL, from_user INT NOT NULL, from_name VARCHAR(120) NOT NULL, from_date VARCHAR(10) NOT NULL, from_code VARCHAR(20) NOT NULL, to_user INT NULL, to_name VARCHAR(120) NOT NULL, to_date VARCHAR(10) NULL, to_code VARCHAR(20) NULL, status VARCHAR(12) NOT NULL DEFAULT 'pending', note VARCHAR(300) NULL, created_at VARCHAR(19) NOT NULL, decided_at VARCHAR(19) NULL, applied_at VARCHAR(19) NULL)$end",
        "CREATE TABLE IF NOT EXISTS gs_sources (id $pk, sheet_id VARCHAR(100) NOT NULL, name VARCHAR(120) NOT NULL, purpose VARCHAR(10) NOT NULL DEFAULT 'nobet', title VARCHAR(120) NULL, seen VARCHAR(19) NULL, changed VARCHAR(19) NULL, hash VARCHAR(64) NULL, status VARCHAR(300) NULL, att_id INT NULL, tabs TEXT NULL, fallback INT NOT NULL DEFAULT 0, created_at VARCHAR(19) NOT NULL)$end",
        "CREATE TABLE IF NOT EXISTS login_attempts (id $pk, ip VARCHAR(45) NOT NULL, email VARCHAR(190) NOT NULL, at INT NOT NULL)$end",
    ];
    foreach ($tables as $sql) $pdo->exec($sql);

    // Sürüm 3: e-posta bildirimi tercihi ve ilk girişte şifre değiştirme
    if ($version >= 1 && $version < 3) {
        try { $pdo->exec('ALTER TABLE users ADD COLUMN email_notify INT NOT NULL DEFAULT 1'); } catch (Throwable $e) { /* zaten var */ }
        try { $pdo->exec('ALTER TABLE users ADD COLUMN must_change INT NOT NULL DEFAULT 0'); } catch (Throwable $e) { /* zaten var */ }
    }
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
        'CREATE INDEX idx_mail_pending ON mail_queue (sent_at, attempts)',
        'CREATE INDEX idx_reset_token ON password_resets (token_hash)',
        'CREATE INDEX idx_rshift_date ON roster_shifts (date)',
        'CREATE INDEX idx_rshift_roster ON roster_shifts (roster_id)',
        'CREATE INDEX idx_audit_at ON audit_log (at)',
        'CREATE INDEX idx_notif_user ON notifications (user_id, read_at)',
        'CREATE UNIQUE INDEX idx_push_hash ON push_subscriptions (endpoint_hash)',
        'CREATE UNIQUE INDEX idx_passkey_cred ON passkeys (credential_id)',
        'CREATE UNIQUE INDEX idx_invite_token ON invites (token)',
        'CREATE INDEX idx_side_date ON side_moves (date)',
        'CREATE INDEX idx_swap_status ON swap_requests (status, roster_id)',
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
    // Sürüm 4: rehber, bildirim türü, belge geçerlilik tarihi, belge metni, liste dönemi
    $cols = [
        'users' => ['phone VARCHAR(30) NULL', 'extension VARCHAR(12) NULL', "notify_mode VARCHAR(10) NOT NULL DEFAULT 'instant'", 'push_on INT NOT NULL DEFAULT 1', 'avatar VARCHAR(80) NULL'],
        'posts' => ['review_at VARCHAR(10) NULL', 'review_notified VARCHAR(20) NULL', 'auto_reminded INT NOT NULL DEFAULT 0'],
        'attachments' => [($my ? 'text_content MEDIUMTEXT NULL' : 'text_content TEXT NULL'), 'text_done INT NOT NULL DEFAULT 0'],
        'rosters' => ['period VARCHAR(7) NULL', 'parsed_file_id INT NULL', 'src_on INT NOT NULL DEFAULT 0', "src_tab VARCHAR(60) NOT NULL DEFAULT ''", 'src_sync_at VARCHAR(19) NULL', 'src_status VARCHAR(255) NULL', 'src_tabname VARCHAR(100) NULL', 'src_source INT NULL', 'src_tabs TEXT NULL', "kind VARCHAR(10) NOT NULL DEFAULT 'nobet'"],
        'gs_sources' => ['mask_cols TEXT NULL', "mask_mode VARCHAR(10) NOT NULL DEFAULT 'none'"],
    ];
    foreach ($cols as $t => $list) {
        foreach ($list as $def) {
            try { $pdo->exec("ALTER TABLE $t ADD COLUMN $def"); } catch (Throwable $e) { /* zaten var */ }
        }
    }
    if ($version < 4) {
        try { $pdo->exec("UPDATE users SET notify_mode = 'off' WHERE email_notify = 0"); } catch (Throwable $e) { /* */ }
    }
    // Örnek şablonlar yalnızca ilk kez eklenir (yönetici hepsini sildiyse güncellemede geri gelmez)
    if ($version < 4 && (int)$pdo->query('SELECT COUNT(*) FROM templates')->fetchColumn() === 0) {
        $st = $pdo->prepare('INSERT INTO templates (title, body, required, created_at, sort) VALUES (?, ?, ?, ?, ?)');
        $tpl = [
            ['Denetim duyurusu', "Tarih/saat: \nDenetlenecek alanlar: \n• Acil arabası mühür ve sayım formu\n• İlaç buzdolabı ısı takip çizelgesi\n• Atık ayrıştırma\n\nLütfen vardiya teslimlerinde kontrol ediniz.", 1],
            ['Eğitim duyurusu', "Konu: \nTarih/saat: \nYer: \nEğitimci: \n\nKatılım zorunludur. Katılamayacak olanların sorumlu hemşireye bildirmesi rica olunur.", 1],
            ['Toplantı duyurusu', "Tarih/saat: \nYer: \nGündem:\n1. \n2. \n\nKatılımınızı rica ederiz.", 0],
            ['Nöbet değişikliği', "Değişiklik: \nTarih: \nGüncel liste Nöbet listeleri bölümündedir.", 0],
            ['Malzeme / cihaz bilgilendirmesi', "Malzeme / cihaz: \nDurum: \nAlternatif: \nTahmini çözüm tarihi: ", 0],
            ['Protokol güncellemesi', "Güncellenen protokol: \nDeğişen maddeler:\n• \n\nEkteki güncel sürümü okuyup onaylayınız.", 1],
        ];
        foreach ($tpl as $i => $t) $st->execute([$t[0], $t[1], $t[2], date('Y-m-d H:i:s'), $i]);
    }
    // Sürüm 8: tek Google tablosu ayarları -> tablolar listesi
    if ($version < 8) {
        try {
            $gs = [];
            foreach ($pdo->query('SELECT k, v FROM settings')->fetchAll(PDO::FETCH_KEY_PAIR) as $k => $v) if (strncmp((string)$k, 'gs_', 3) === 0) $gs[$k] = (string)$v;
            if (($gs['gs_id'] ?? '') !== '' && (int)$pdo->query('SELECT COUNT(*) FROM gs_sources')->fetchColumn() === 0) {
                $st = $pdo->prepare('INSERT INTO gs_sources (sheet_id, name, purpose, title, seen, changed, hash, status, att_id, tabs, fallback, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $st->execute([$gs['gs_id'], 'Nöbet listesi', 'nobet', ($gs['gs_title'] ?? '') ?: null, ($gs['gs_seen'] ?? '') ?: null, ($gs['gs_changed'] ?? '') ?: null, ($gs['gs_hash'] ?? '') ?: null,
                    ($gs['gs_status'] ?? '') ?: null, (int)($gs['gs_att'] ?? 0) ?: null, ($gs['gs_tabs'] ?? '') ?: null, (int)($gs['gs_fallback'] ?? 0), date('Y-m-d H:i:s')]);
                $sid = (int)$pdo->lastInsertId();
                $pdo->exec("UPDATE rosters SET src_source = $sid WHERE src_on = 1");
            }
        } catch (Throwable $e) { error_log('[dupcii] gs göç: ' . $e->getMessage()); }
    }
    if ($version < 9) {
        try { $pdo->exec("UPDATE gs_sources SET mask_mode = 'surname', mask_cols = 'Hastanın Adı Soyadı' WHERE purpose = 'tablo' AND (mask_cols IS NULL OR mask_cols = '')"); } catch (Throwable $e) { /* */ }
    }
    $pdo->exec("DELETE FROM settings WHERE k = 'schema_version'");
    $pdo->exec("INSERT INTO settings (k, v) VALUES ('schema_version', '9')");
}

function setting(string $k, string $default = '', bool $reset = false): string
{
    static $cache = null;
    if ($reset) { $cache = null; return ''; }
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
        // Aynı anda iki istek eklemeye çalışırsa ikincisi güncellesin
        try { q('INSERT INTO settings (k, v) VALUES (?, ?)', [$k, $v]); } catch (Throwable $e) { q('UPDATE settings SET v = ? WHERE k = ?', [$v, $k]); }
    }
    setting('', '', true);
}

/**
 * Sitenin kök adresi (e-postalardaki bağlantılar için).
 * Sıra: config.php APP_URL → yöneticinin son ziyaretinden kaydedilen adres → isteğin adresi.
 * (İstek başlığındaki Host'a güvenilmez: şifre sıfırlama bağlantıları sahte alan adına gitmesin.)
 */
function base_url(): string
{
    if (defined('APP_URL') && APP_URL !== '') return rtrim((string)APP_URL, '/') . '/';
    $s = (string)setting('site_url', '');
    if ($s !== '') return $s;
    if (PHP_SAPI === 'cli') return 'http://localhost/';
    return request_base_url();
}
function request_base_url(): string
{
    $host = preg_replace('/[^A-Za-z0-9.\-:\[\]]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return (nm_is_https() ? 'https' : 'http') . '://' . ($host ?: 'localhost') . $dir . '/';
}

/** "YYYY-MM-DD" biçiminde ve takvimde var olan bir gün mü? */
function valid_ymd(string $v): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/** Sayfa yanıtı gönderildikten sonra arka plan işi: oturum kilidini bırak, bağlantıyı kapat */
function nm_after_response(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) @session_write_close();
    if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
    elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
    if (function_exists('ignore_user_abort')) @ignore_user_abort(true);
    if (function_exists('set_time_limit')) @set_time_limit(120);
}

/**
 * config.php içinde tanımlı ilk yönetici hesabını (bir kez) oluşturur.
 * Hesap ilk girişte şifresini değiştirmeye zorlanır.
 */
function ensure_initial_admin(): void
{
    if (!defined('INITIAL_ADMIN_EMAIL') || INITIAL_ADMIN_EMAIL === '' || !defined('INITIAL_ADMIN_PASSWORD_HASH') || INITIAL_ADMIN_PASSWORD_HASH === '') return;
    if (setting('initial_admin_done') === '1') return;
    $email = mb_strtolower(trim(INITIAL_ADMIN_EMAIL));
    if (!one('SELECT id FROM users WHERE email = ?', [$email])) {
        $name = defined('INITIAL_ADMIN_NAME') && INITIAL_ADMIN_NAME !== '' ? INITIAL_ADMIN_NAME : 'Yönetici';
        $titleId = val("SELECT id FROM titles WHERE name = 'Hemşire'") ?: val('SELECT id FROM titles ORDER BY sort, id LIMIT 1');
        $unitId = val('SELECT id FROM units ORDER BY sort, id LIMIT 1');
        q('INSERT INTO users (name, email, password_hash, title_id, unit_id, role, status, created_at, must_change) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [$name, $email, INITIAL_ADMIN_PASSWORD_HASH, $titleId ?: null, $unitId ?: null, 'admin', 'active', now()]);
    }
    if (defined('INITIAL_ORG_NAME') && INITIAL_ORG_NAME !== '' && setting('org_name', 'Klinik Portalı') === 'Klinik Portalı') {
        set_setting('org_name', INITIAL_ORG_NAME);
    }
    set_setting('initial_admin_done', '1');
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
