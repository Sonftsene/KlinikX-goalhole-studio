<?php
/**
 * dupcii — çok hastaneli / çok birimli yapı (tek kod, ayrı veri).
 *
 *  - Merkez veritabanı (data/merkez/): hastaneler, birimler, e-posta → birim dizini (yalnız HMAC özeti),
 *    süper yönetici hesapları ve günlüğü. Hasta/kişi içeriği burada YOKTUR.
 *  - Her birimin kendi veritabanı ve dosya klasörü vardır. Eski (tek birimli) kurulum yerinde kalır ve
 *    "varsayılan birim" olarak kaydedilir: data/ ve uploads/ aynen kullanılır. Yeni birimler data/b/<anahtar>/
 *    ve uploads/b/<anahtar>/ altında durur.
 *  - Bir PHP isteği yalnız TEK birimin veritabanını açar (db() ilk çağrıldığında seçilir ve değişmez).
 *    Zamanlanmış görevler her birim için ayrı süreçte çalışır (cron.php). Böylece önbellekler ve kuyruklar
 *    birimler arasında hiçbir zaman karışmaz.
 *  - Çok birimli yapı SQLite ile çalışır; MySQL kurulumları tek birimli (eski) davranışta kalır.
 */
declare(strict_types=1);

const NM_MERKEZ_SCHEMA = 2;

/** Çok birimli yapı etkin mi (SQLite) */
function nm_multi(): bool
{
    return DB_DRIVER !== 'mysql';
}

/* ---------------- Merkez veritabanı ---------------- */

function merkez(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $dir = NM_ROOT . '/data/merkez';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    $nameFile = $dir . '/.name.php';
    $name = is_file($nameFile) ? (string)(include $nameFile) : '';
    if (!preg_match('/^m-[a-f0-9]{24}\.sqlite$/', $name)) {
        $name = 'm-' . bin2hex(random_bytes(12)) . '.sqlite';
        file_put_contents($nameFile, "<?php return '$name';\n", LOCK_EX);
        // Aynı anda iki istek oluşturduysa dosyadaki ad geçerlidir
        $name = (string)(include $nameFile);
    }
    $pdo = new PDO('sqlite:' . $dir . '/' . $name, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    merkez_migrate($pdo);
    return $pdo;
}

function merkez_migrate(PDO $pdo): void
{
    $v = 0;
    try { $v = (int)$pdo->query("SELECT v FROM m_settings WHERE k = 'schema'")->fetchColumn(); } catch (Throwable $e) { $v = 0; }
    if ($v >= NM_MERKEZ_SCHEMA) return;
    $pdo->exec('CREATE TABLE IF NOT EXISTS m_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS hospitals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'active\', created_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, tkey TEXT NOT NULL UNIQUE, hospital_id INTEGER NOT NULL, name TEXT NOT NULL,
        dir TEXT NOT NULL DEFAULT \'\', status TEXT NOT NULL DEFAULT \'active\', is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, note TEXT)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS dir_email (h TEXT PRIMARY KEY, tkey TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS superadmins (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        totp_secret TEXT, totp_on INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login_at TEXT)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS sa_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, sa_id INTEGER, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT, at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS sa_attempts (ip TEXT NOT NULL, email TEXT NOT NULL, at INTEGER NOT NULL)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS sa_attempts_at ON sa_attempts (at)');
    // Şema 2: modül aç/kapat — scope 'h' (hastane) | 't' (birim); birim kaydı yoksa hastaneye uyar
    $pdo->exec('CREATE TABLE IF NOT EXISTS module_cfg (scope TEXT NOT NULL, sid INTEGER NOT NULL, module TEXT NOT NULL, on_ INTEGER NOT NULL, PRIMARY KEY (scope, sid, module))');
    $st = $pdo->prepare("INSERT OR IGNORE INTO m_settings (k, v) VALUES ('secret', ?)");
    $st->execute([bin2hex(random_bytes(32))]);
    $pdo->prepare("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('schema', ?)")->execute([(string)NM_MERKEZ_SCHEMA]);
}

function m_q(string $sql, array $p = []): PDOStatement { $st = merkez()->prepare($sql); $st->execute($p); return $st; }
function m_one(string $sql, array $p = []): ?array { $r = m_q($sql, $p)->fetch(); return $r === false ? null : $r; }
function m_all(string $sql, array $p = []): array { return m_q($sql, $p)->fetchAll(); }
function m_val(string $sql, array $p = []) { $r = m_q($sql, $p)->fetchColumn(); return $r === false ? null : $r; }
function m_setting(string $k, string $d = ''): string { $v = m_val('SELECT v FROM m_settings WHERE k = ?', [$k]); return $v === null ? $d : (string)$v; }

/* ---------------- Birimler ---------------- */

/**
 * Kayıtlı birimler. İlk çağrıda eski (tek birimli) kurulum varsayılan birim olarak kaydedilir.
 * @return array<int, array>
 */
function nm_tenants(): array
{
    if (!nm_multi()) return [nm_tenant_legacy_row()];
    $rows = m_all('SELECT t.*, h.name AS hospital_name, h.status AS hospital_status FROM tenants t JOIN hospitals h ON h.id = t.hospital_id ORDER BY h.name, t.name, t.id');
    if (!$rows) {
        nm_tenant_register_legacy();
        $rows = m_all('SELECT t.*, h.name AS hospital_name, h.status AS hospital_status FROM tenants t JOIN hospitals h ON h.id = t.hospital_id ORDER BY h.name, t.name, t.id');
    }
    return $rows;
}

/** MySQL kurulumunda (çok birim kapalı) tek birim */
function nm_tenant_legacy_row(): array
{
    return ['id' => 0, 'tkey' => 'tek', 'hospital_id' => 0, 'name' => '', 'dir' => '', 'status' => 'active', 'is_default' => 1, 'hospital_name' => '', 'hospital_status' => 'active'];
}

function nm_tenant_by_key(string $k): ?array
{
    if ($k === '' || !preg_match('/^[a-z0-9]{4,16}$/', $k)) return null;
    foreach (nm_tenants() as $t) if (hash_equals((string)$t['tkey'], $k)) return $t;
    return null;
}

function nm_tenant_default(): array
{
    $all = nm_tenants();
    foreach ($all as $t) if ((int)$t['is_default'] === 1) return $t;
    return $all[0];
}

/** Eski kurulum: data/ ve uploads/ yerinde kalır; e-posta dizini mevcut kullanıcılarla doldurulur */
function nm_tenant_register_legacy(): void
{
    $pdo = merkez();
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        if ((int)$pdo->query('SELECT COUNT(*) FROM tenants')->fetchColumn() > 0) { $pdo->exec('COMMIT'); return; }
        $org = nm_tenant_peek_setting('', 'org_name') ?: 'Hastane';
        $pdo->prepare('INSERT INTO hospitals (name, created_at) VALUES (?, ?)')->execute([$org, date('Y-m-d H:i:s')]);
        $hid = (int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO tenants (tkey, hospital_id, name, dir, is_default, created_at) VALUES (?, ?, ?, ?, 1, ?)')->execute([nm_new_key(), $hid, $org, '', date('Y-m-d H:i:s')]);
        $pdo->exec('COMMIT');
    } catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
    $t = m_one('SELECT * FROM tenants WHERE is_default = 1');
    if ($t) foreach (nm_tenant_peek_emails($t) as $e) nm_dir_put($e, (string)$t['tkey']);
}

function nm_new_key(): string
{
    do {
        $k = '';
        $abc = 'abcdefghjkmnpqrstuvwxyz23456789';
        for ($i = 0; $i < 8; $i++) $k .= $abc[random_int(0, strlen($abc) - 1)];
    } while (m_val('SELECT 1 FROM tenants WHERE tkey = ?', [$k]));
    return $k;
}

/* ---------------- İstek başına birim seçimi ---------------- */

/** Bu isteğin birimi. Oturum → bağlantı ipucu (b) → varsayılan. db() ilk açılırken kesinleşir. */
function nm_tenant(): array
{
    if (isset($GLOBALS['NM_T'])) return $GLOBALS['NM_T'];
    $t = null;
    $src = 'default';
    if (!nm_multi()) $t = nm_tenant_legacy_row();
    elseif (PHP_SAPI === 'cli') {
        $k = (string)(getenv('NM_TENANT') ?: '');
        foreach ($GLOBALS['argv'] ?? [] as $a) if (strncmp((string)$a, '--tenant=', 9) === 0) $k = substr((string)$a, 9);
        $t = $k !== '' ? nm_tenant_by_key($k) : null;
        if ($k !== '' && !$t) { fwrite(STDERR, "Birim bulunamadı: $k\n"); exit(2); }
    } else {
        if (session_status() !== PHP_SESSION_ACTIVE) nm_session();
        if (!empty($_SESSION['t'])) { $t = nm_tenant_by_key((string)$_SESSION['t']); $src = 'session'; }
        // Eski oturum (birim bilgisi yok): varsayılan birim
        elseif (!empty($_SESSION['uid'])) { $t = nm_tenant_default(); $src = 'session'; }
        if (!$t) {
            $hint = (string)($_SERVER['HTTP_X_TENANT'] ?? ($_GET['b'] ?? ''));
            if ($hint !== '' && ($t = nm_tenant_by_key($hint))) { $src = 'hint'; $_SESSION['tb'] = $t['tkey']; }
        }
        if (!$t && !empty($_SESSION['tb']) && ($t = nm_tenant_by_key((string)$_SESSION['tb']))) $src = 'hint';
    }
    $GLOBALS['NM_T_SRC'] = $t ? $src : 'default';
    $GLOBALS['NM_T'] = $t ?: nm_tenant_default();
    return $GLOBALS['NM_T'];
}

/**
 * Bu isteğin birimini seçer (giriş, parmak izi, Google ile giriş vb. — e-postanın birimi bulununca).
 * Birim veritabanı açıldıktan sonra başka birime geçilemez: geçilmeye çalışılırsa istek durur.
 */
function nm_tenant_use(array $t): void
{
    $cur = $GLOBALS['NM_T'] ?? null;
    if ($cur && (string)$cur['tkey'] === (string)$t['tkey']) return;
    if (!empty($GLOBALS['NM_DB_OPEN'])) throw new RuntimeException('Birim veritabanı açıldıktan sonra birim değiştirilemez.');
    $GLOBALS['NM_T'] = $t;
    $GLOBALS['NM_T_SRC'] = 'select';
}

function nm_tenant_frozen(?array $t = null): bool
{
    $t = $t ?: nm_tenant();
    return ($t['status'] ?? 'active') !== 'active' || ($t['hospital_status'] ?? 'active') !== 'active';
}

/** Birimin veri klasörü (veritabanı, yedekler, Google tabloları…) */
function nm_data_dir(?array $t = null): string
{
    $t = $t ?: nm_tenant();
    $d = (string)$t['dir'] === '' ? NM_ROOT . '/data' : NM_ROOT . '/data/b/' . $t['tkey'];
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}

/** Birimin dosya klasörü (ekler, profil fotoğrafları, marka) */
function nm_upload_dir(?array $t = null): string
{
    $t = $t ?: nm_tenant();
    $d = (string)$t['dir'] === '' ? NM_ROOT . '/uploads' : NM_ROOT . '/uploads/b/' . $t['tkey'];
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}

/** Bağlantılara eklenecek birim ipucu: varsayılan birimde boş (eski bağlantılar aynen çalışır) */
function nm_link_param(string $sep = '&'): string
{
    $t = nm_tenant();
    return nm_multi() && (int)$t['is_default'] !== 1 ? $sep . 'b=' . $t['tkey'] : '';
}

/* ---------------- Başka birimin verisine salt-okur bakış (yalnız merkez işleri için) ---------------- */

/** Birimin SQLite dosyası (yoksa null). Veritabanını OLUŞTURMAZ. */
function nm_tenant_db_file(array $t): ?string
{
    $dir = (string)$t['dir'] === '' ? NM_ROOT . '/data' : NM_ROOT . '/data/b/' . $t['tkey'];
    $nameFile = $dir . '/.dbname.php';
    $name = is_file($nameFile) ? (string)(include $nameFile) : '';
    if (preg_match('/^nm-[a-f0-9]{24}\.sqlite$/', $name) && is_file($dir . '/' . $name)) return $dir . '/' . $name;
    if (is_file($dir . '/nobetmed.sqlite')) return $dir . '/nobetmed.sqlite';
    return null;
}

function nm_tenant_peek(array $t): ?PDO
{
    $f = nm_tenant_db_file($t);
    if (!$f) return null;
    try {
        $p = new PDO('sqlite:' . $f, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $p->exec('PRAGMA busy_timeout = 3000');
        return $p;
    } catch (Throwable $e) { return null; }
}

function nm_tenant_peek_setting($t, string $k): string
{
    if ($t === '') $t = ['dir' => '', 'tkey' => ''];
    $p = nm_tenant_peek($t);
    if (!$p) return '';
    try { $st = $p->prepare('SELECT v FROM settings WHERE k = ?'); $st->execute([$k]); return (string)($st->fetchColumn() ?: ''); } catch (Throwable $e) { return ''; }
}

/** @return string[] */
function nm_tenant_peek_emails(array $t): array
{
    $p = nm_tenant_peek($t);
    if (!$p) return [];
    try { return array_values(array_filter(array_map('strval', $p->query("SELECT email FROM users WHERE email IS NOT NULL AND email <> ''")->fetchAll(PDO::FETCH_COLUMN)))); } catch (Throwable $e) { return []; }
}

/** Süper yönetici paneli için sayılar (kişi, son etkinlik) — içerik okunmaz */
function nm_tenant_stats(array $t): array
{
    $o = ['users' => 0, 'active_users' => 0, 'last_seen' => null, 'org_name' => '', 'disk_mb' => 0.0];
    $p = nm_tenant_peek($t);
    if ($p) {
        try {
            $o['users'] = (int)$p->query('SELECT COUNT(*) FROM users')->fetchColumn();
            $o['active_users'] = (int)$p->query("SELECT COUNT(*) FROM users WHERE status = 'active'")->fetchColumn();
            $o['last_seen'] = $p->query('SELECT MAX(last_seen_at) FROM users')->fetchColumn() ?: null;
            $st = $p->query("SELECT v FROM settings WHERE k = 'org_name'"); $o['org_name'] = (string)($st->fetchColumn() ?: '');
        } catch (Throwable $e) { /* yeni birim, tablo henüz yok */ }
    }
    $o['disk_mb'] = round(nm_dir_size((string)$t['dir'] === '' ? NM_ROOT . '/uploads' : NM_ROOT . '/uploads/b/' . $t['tkey'], (string)$t['dir'] === '') / 1048576, 1);
    return $o;
}

function nm_dir_size(string $dir, bool $skipTenants): int
{
    if (!is_dir($dir)) return 0;
    $n = 0;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($skipTenants && strpos(str_replace('\\', '/', $f->getPathname()), $dir . '/b/') === 0) continue;
        if ($f->isFile()) $n += $f->getSize();
    }
    return $n;
}

/* ---------------- E-posta → birim dizini (yalnız HMAC özeti saklanır) ---------------- */

function nm_dir_hash(string $email): string
{
    return hash_hmac('sha256', mb_strtolower(trim($email)), m_setting('secret'));
}

function nm_dir_put(string $email, ?string $tkey = null): void
{
    if (!nm_multi() || trim($email) === '') return;
    m_q('INSERT OR REPLACE INTO dir_email (h, tkey) VALUES (?, ?)', [nm_dir_hash($email), $tkey ?? (string)nm_tenant()['tkey']]);
}

function nm_dir_del(string $email): void
{
    if (!nm_multi() || trim($email) === '') return;
    // Yalnız bu birime aitse sil (başka birimin kaydına dokunma)
    m_q('DELETE FROM dir_email WHERE h = ? AND tkey = ?', [nm_dir_hash($email), (string)nm_tenant()['tkey']]);
}

/**
 * E-postanın birimi. Dizin, hesap ekleyen/değiştiren/silen her noktada güncellenir (ve eski kurulumda ilk açılışta
 * doldurulur); bilinmeyen e-postada birimler TARANMAZ (rastgele e-postalarla deneme sunucuyu yormasın).
 */
function nm_dir_find(string $email): ?array
{
    if (!nm_multi()) return nm_tenant_legacy_row();
    $email = mb_strtolower(trim($email));
    if ($email === '' || strlen($email) > 190) return null;
    $k = m_val('SELECT tkey FROM dir_email WHERE h = ?', [nm_dir_hash($email)]);
    if (!$k) return null;
    $t = nm_tenant_by_key((string)$k);
    if ($t && nm_tenant_peek_emails_one($t, $email)) return $t;
    m_q('DELETE FROM dir_email WHERE h = ?', [nm_dir_hash($email)]); // eskimiş kayıt
    return null;
}

/** @return string[] bu e-postanın birimdeki kaydı (0 ya da 1 öğe) */
function nm_tenant_peek_emails_one(array $t, string $email): array
{
    $p = nm_tenant_peek($t);
    if (!$p) return [];
    try { $st = $p->prepare('SELECT email FROM users WHERE email = ?'); $st->execute([$email]); $v = $st->fetchColumn(); return $v ? [(string)$v] : []; } catch (Throwable $e) { return []; }
}

/** Bu e-posta BAŞKA bir birimde kayıtlı mı? (bir kişi yalnız bir birimde olabilir) */
function nm_email_in_other_tenant(string $email): bool
{
    if (!nm_multi()) return false;
    $t = nm_dir_find($email);
    return $t !== null && (string)$t['tkey'] !== (string)nm_tenant()['tkey'];
}

/** Yeni hesap / e-posta değişikliği öncesi: başka birimdeyse dur */
function nm_email_guard(string $email): void
{
    if (nm_email_in_other_tenant($email)) fail('Bu e-posta başka bir birimde kayıtlı. Bir kişi yalnız bir birimde hesap açabilir.', 409);
}

/* ---------------- api.php yardımcıları ---------------- */

/** Birim bağlantıyla / oturumla belli mi? (tek birim varsa her zaman evet) */
function nm_tenant_hinted(): bool
{
    if (!nm_multi() || count(nm_tenants()) <= 1) return true;
    nm_tenant();
    return ($GLOBALS['NM_T_SRC'] ?? 'default') !== 'default';
}

/** İlk kurulum ekranı yalnız hiç kullanıcısı olmayan TEK birimli kurulumda açılır (yeni birimlerin yöneticisini süper yönetici açar) */
function nm_setup_allowed(): bool
{
    if (nm_multi()) {
        $t = nm_tenant();
        if ((int)$t['is_default'] !== 1 || count(nm_tenants()) > 1) return false;
    }
    return (int)val('SELECT COUNT(*) FROM users') === 0;
}

/** Giriş eylemlerinde: e-postanın / parmak izinin birimine geç (veritabanı açılmadan) */
function nm_route_tenant(string $action): void
{
    if (!nm_multi() || !empty($GLOBALS['NM_DB_OPEN'])) return;
    if ($action === 'auth.login' || $action === 'auth.forgot') {
        $t = nm_dir_find(s('email', 190));
        if ($t) nm_tenant_use($t);
    } elseif ($action === 'passkey.login.finish' && function_exists('wa_b64u_dec')) {
        $uh = (string)wa_b64u_dec(s('userHandle', 200));
        if (preg_match('/^u\d+@([a-z0-9]{4,16})$/', $uh, $m)) { $t = nm_tenant_by_key($m[1]); if ($t) nm_tenant_use($t); }
        elseif (preg_match('/^u\d+$/', $uh)) nm_tenant_use(nm_tenant_default());
    }
}

/** Parmak izi kullanıcı tanıtıcısı: varsayılan birimde eski biçim ("u12"), diğerlerinde birim anahtarlı ("u12@anahtar") */
function nm_passkey_handle(int $uid): string
{
    $t = nm_tenant();
    return nm_multi() && (int)$t['is_default'] !== 1 ? 'u' . $uid . '@' . $t['tkey'] : 'u' . $uid;
}

/** Açılış verisinde birim bilgisi (istemci bağlantılara ekler) */
function nm_boot_tenant(?array $me): array
{
    $t = nm_tenant();
    $o = ['multi' => nm_multi() && count(nm_tenants()) > 1, 'b' => nm_multi() && (int)$t['is_default'] !== 1 ? (string)$t['tkey'] : '',
        'sys' => nm_multi() && (int)m_val('SELECT COUNT(*) FROM superadmins WHERE totp_on = 1') > 0];
    if ($me) { $o['name'] = (string)$t['name']; $o['hospital'] = (string)($t['hospital_name'] ?? ''); }
    if ($me && $me['role'] === 'admin' && nm_multi() && (int)$t['is_default'] === 1) $o['sa_setup'] = (int)m_val('SELECT COUNT(*) FROM superadmins') === 0;
    return $o;
}

function brand_out_neutral(): array
{
    return ['logo' => null, 'logo_dark' => null, 'icon' => null, 'icon192' => null, 'logo_h' => 36];
}
