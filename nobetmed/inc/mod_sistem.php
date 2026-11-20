<?php
/**
 * Süper yönetici (sistem yönetimi): hastaneler, birimler, birim yöneticileri, dondurma.
 * Süper yönetici hiçbir birimin içeriğini (kişiler, nöbetler, hasta listeleri, mesajlar) görmez; yalnız sayılar.
 * Giriş: e-posta + şifre + zorunlu iki adımlı doğrulama (uygulama kodu, TOTP).
 */
declare(strict_types=1);

const SA_IDLE = 1800; // 30 dakika işlem yapılmazsa oturum kapanır

/* ---------------- TOTP (RFC 6238, 6 hane, 30 sn) ---------------- */

function sa_b32_encode(string $bin): string
{
    $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $chunk) $out .= $abc[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}

function sa_b32_decode(string $s): string
{
    $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $s = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s));
    $bits = '';
    foreach (str_split($s) as $c) { $p = strpos($abc, $c); if ($p === false) return ''; $bits .= str_pad(decbin($p), 5, '0', STR_PAD_LEFT); }
    $out = '';
    foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
    return $out;
}

function sa_totp_at(string $secretB32, int $step): string
{
    $h = hash_hmac('sha1', pack('N*', 0, $step), sa_b32_decode($secretB32), true);
    $o = ord($h[19]) & 0xf;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}

/** Kod doğruysa kullanılan zaman adımını döner (aynı kod ikinci kez kabul edilmez), değilse null */
function sa_totp_check(string $secretB32, string $code, int $lastStep = 0): ?int
{
    $code = preg_replace('/\D/', '', $code);
    if (strlen($code) !== 6) return null;
    $now = intdiv(time(), 30);
    foreach ([0, -1, 1] as $d) {
        $st = $now + $d;
        if ($st > $lastStep && hash_equals(sa_totp_at($secretB32, $st), $code)) return $st;
    }
    return null;
}

/* ---------------- Oturum ---------------- */

function sa_current(): ?array
{
    if (!nm_multi() || empty($_SESSION['sa']) || empty($_SESSION['sa_ok'])) return null;
    if ((int)$_SESSION['sa_ok'] < time() - SA_IDLE) { unset($_SESSION['sa'], $_SESSION['sa_ok']); return null; }
    $u = m_one('SELECT * FROM superadmins WHERE id = ? AND totp_on = 1', [(int)$_SESSION['sa']]);
    if (!$u) { unset($_SESSION['sa'], $_SESSION['sa_ok']); return null; }
    $_SESSION['sa_ok'] = time();
    return $u;
}

function need_sa(): array
{
    $u = sa_current();
    if (!$u) fail('Sistem yönetimi oturumu kapandı. Yeniden giriş yapın.', 401);
    return $u;
}

function sa_audit(?array $sa, string $action, string $target = '', string $detail = ''): void
{
    m_q('INSERT INTO sa_audit (sa_id, action, target, detail, ip, at) VALUES (?, ?, ?, ?, ?, ?)', [$sa['id'] ?? null, $action, mb_substr($target, 0, 200), mb_substr($detail, 0, 500), client_ip(), now()]);
}

/** Açılış verisi: süper yönetici oturumu varsa */
function sa_boot(): ?array
{
    $u = sa_current();
    return $u ? ['id' => (int)$u['id'], 'name' => $u['name'], 'email' => $u['email'], 'in' => (string)($_SESSION['sa_in'] ?? '') ?: null] : null;
}

/* ---------------- Hesap oluşturma (bir kez; ilk birimin yöneticisi) ---------------- */

function a_sa_create(): void
{
    if (!nm_multi()) fail('Çok birimli yapı yalnız SQLite ile çalışır.', 400);
    $me = need_admin();
    if ((int)nm_tenant()['is_default'] !== 1) fail('Bu işlem yalnız ilk birimin yöneticisi içindir.', 403);
    if ((int)m_val('SELECT COUNT(*) FROM superadmins WHERE totp_on = 1') > 0) fail('Sistem yöneticisi hesabı zaten var.', 409);
    global $IN;
    $name = s('name', 120);
    $email = mb_strtolower(trim(s('email', 190)));
    $pw = (string)($IN['password'] ?? '');
    if (mb_strlen($name) < 3) fail('Ad soyad girin.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi girin.');
    if (mb_strlen($pw) < 12) fail('Sistem yöneticisi şifresi en az 12 karakter olmalıdır.');
    if (!password_verify((string)($IN['current'] ?? ''), (string)($me['password_hash'] ?? ''))) fail('Kendi (birim) şifreniz hatalı.', 401);
    $secret = sa_b32_encode(random_bytes(20));
    m_q('DELETE FROM superadmins WHERE totp_on = 0');
    m_q('INSERT INTO superadmins (name, email, password_hash, totp_secret, totp_on, created_at) VALUES (?, ?, ?, ?, 0, ?)', [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $secret, now()]);
    $id = (int)merkez()->lastInsertId();
    $_SESSION['sa_new'] = $id;
    audit($me, 'sa.create', $name);
    out(['secret' => $secret, 'uri' => 'otpauth://totp/' . rawurlencode('dupcii:' . $email) . '?secret=' . $secret . '&issuer=dupcii&digits=6&period=30']);
}

/** Uygulamadaki ilk kodu doğrula: hesap ancak bundan sonra etkin olur */
function a_sa_create_confirm(): void
{
    $id = (int)($_SESSION['sa_new'] ?? 0);
    $u = $id ? m_one('SELECT * FROM superadmins WHERE id = ? AND totp_on = 0', [$id]) : null;
    if (!$u) fail('Kurulum oturumu bulunamadı. Baştan başlayın.', 409);
    $st = sa_totp_check((string)$u['totp_secret'], s('code', 10));
    if ($st === null) fail('Kod hatalı. Uygulamadaki güncel 6 haneli kodu girin (telefon saatinin doğru olduğundan emin olun).');
    m_q('UPDATE superadmins SET totp_on = 1 WHERE id = ?', [$id]);
    m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)", ['totp_last_' . $id, (string)$st]);
    unset($_SESSION['sa_new']);
    sa_audit($u, 'sa.created', $u['email']);
    out(['ok' => true]);
}

/* ---------------- Giriş ---------------- */

function a_sa_login(): void
{
    if (!nm_multi()) fail('Sistem yönetimi bu kurulumda yok.', 404);
    global $IN;
    $email = mb_strtolower(trim(s('email', 190)));
    $ip = client_ip();
    m_q('DELETE FROM sa_attempts WHERE at < ?', [time() - 86400]);
    $fails = (int)m_val('SELECT COUNT(*) FROM sa_attempts WHERE (ip = ? OR email = ?) AND at > ?', [$ip, $email, time() - 900]);
    if ($fails >= 6) fail('Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.', 429);
    $u = m_one('SELECT * FROM superadmins WHERE email = ? AND totp_on = 1', [$email]);
    if (!$u || !password_verify((string)($IN['password'] ?? ''), (string)$u['password_hash'])) {
        m_q('INSERT INTO sa_attempts (ip, email, at) VALUES (?, ?, ?)', [$ip, $email, time()]);
        usleep(300000);
        fail('E-posta veya şifre hatalı.', 401);
    }
    $_SESSION['sa_pending'] = ['id' => (int)$u['id'], 't' => time()];
    out(['totp' => true]);
}

function a_sa_totp(): void
{
    $p = $_SESSION['sa_pending'] ?? null;
    if (!is_array($p) || (int)$p['t'] < time() - 300) fail('Süre doldu. Yeniden giriş yapın.', 401);
    $ip = client_ip();
    // Hatalı kodlar hesap başına (tüm IP'lerden) sayılır; bir şifre girişiyle en çok 3 kod denenir
    $fails = (int)m_val('SELECT COUNT(*) FROM sa_attempts WHERE email = ? AND at > ?', ['totp:' . $p['id'], time() - 900]);
    if ($fails >= 8 || (int)($p['n'] ?? 0) >= 3) { unset($_SESSION['sa_pending']); fail('Çok fazla hatalı kod. Yeniden giriş yapın; çok sayıda denemede 15 dakika beklemeniz gerekir.', 429); }
    $u = m_one('SELECT * FROM superadmins WHERE id = ? AND totp_on = 1', [(int)$p['id']]);
    $last = (int)m_setting('totp_last_' . (int)$p['id'], '0');
    $st = $u ? sa_totp_check((string)$u['totp_secret'], s('code', 10), $last) : null;
    if ($st === null) {
        m_q('INSERT INTO sa_attempts (ip, email, at) VALUES (?, ?, ?)', [$ip, 'totp:' . $p['id'], time()]);
        $_SESSION['sa_pending']['n'] = (int)($p['n'] ?? 0) + 1;
        fail('Kod hatalı veya kullanılmış. Uygulamadaki yeni kodu girin.', 401);
    }
    m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)", ['totp_last_' . $u['id'], (string)$st]);
    // Birim oturumu ile sistem yönetimi aynı anda açık olmaz
    session_regenerate_id(true);
    $_SESSION = ['csrf' => bin2hex(random_bytes(24)), 'sa' => (int)$u['id'], 'sa_ok' => time()];
    m_q('UPDATE superadmins SET last_login_at = ? WHERE id = ?', [now(), $u['id']]);
    sa_audit($u, 'login');
    out(['sa' => sa_boot()]);
}

function a_sa_logout(): void
{
    $u = sa_current();
    if ($u) sa_audit($u, 'logout');
    $_SESSION = ['csrf' => bin2hex(random_bytes(24))];
    session_regenerate_id(true);
    out(['csrf' => $_SESSION['csrf']]);
}

function a_sa_password(): void
{
    $u = need_sa();
    global $IN;
    if (!password_verify((string)($IN['current'] ?? ''), (string)$u['password_hash'])) fail('Mevcut şifre hatalı.', 401);
    $pw = (string)($IN['password'] ?? '');
    if (mb_strlen($pw) < 12) fail('Şifre en az 12 karakter olmalıdır.');
    m_q('UPDATE superadmins SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    sa_audit($u, 'password');
    out();
}

/* ---------------- Hastaneler ve birimler ---------------- */

function sa_tenant_out(array $t): array
{
    $st = nm_tenant_stats($t);
    return ['id' => (int)$t['id'], 'key' => $t['tkey'], 'hospital_id' => (int)$t['hospital_id'], 'name' => $t['name'], 'status' => $t['status'],
        'is_default' => (int)$t['is_default'] === 1, 'created_at' => $t['created_at'], 'note' => $t['note'] ?? '',
        'users' => $st['users'], 'active_users' => $st['active_users'], 'last_seen' => $st['last_seen'], 'disk_mb' => $st['disk_mb'],
        'link' => (m_setting('site_url') ?: request_base_url()) . ((int)$t['is_default'] === 1 ? '' : '?b=' . $t['tkey'])];
}

function a_sa_overview(): void
{
    need_sa();
    $ts = nm_tenants();
    // İlk kurulum kaydı kurum adı girilmeden oluştuysa: kurum adını kullan
    foreach ($ts as $t) {
        if ((int)$t['is_default'] === 1 && $t['name'] === 'Hastane' && ($org = nm_tenant_peek_setting($t, 'org_name')) !== '') {
            m_q('UPDATE tenants SET name = ? WHERE id = ?', [$org, $t['id']]);
            m_q("UPDATE hospitals SET name = ? WHERE id = ? AND name = 'Hastane'", [$org, $t['hospital_id']]);
            $ts = m_all('SELECT t.*, h.name AS hospital_name, h.status AS hospital_status FROM tenants t JOIN hospitals h ON h.id = t.hospital_id ORDER BY h.name, t.name, t.id');
        }
    }
    $hs = m_all('SELECT * FROM hospitals ORDER BY name, id');
    out(['apply_open' => function_exists('ap_sa_count') ? ap_sa_count() : 0, 'support_open' => function_exists('sp_sa_count') ? sp_sa_count() : 0, 'hospitals' => array_map(fn($h) => ['id' => (int)$h['id'], 'name' => $h['name'], 'status' => $h['status'],
        'tenants' => array_values(array_map('sa_tenant_out', array_filter($ts, fn($t) => (int)$t['hospital_id'] === (int)$h['id'])))], $hs)]);
}

function a_sa_hospital_save(): void
{
    $sa = need_sa();
    $name = s('name', 120);
    if (mb_strlen($name) < 2) fail('Hastane adını girin.');
    $id = (int)(i('id') ?? 0);
    if ($id) {
        $h = m_one('SELECT * FROM hospitals WHERE id = ?', [$id]) ?? fail('Hastane bulunamadı.', 404);
        m_q('UPDATE hospitals SET name = ? WHERE id = ?', [$name, $id]);
        sa_audit($sa, 'hospital.rename', $h['name'], $name);
    } else {
        nm_tenants(); // eski kurulum önce kaydolsun
        m_q('INSERT INTO hospitals (name, created_at) VALUES (?, ?)', [$name, now()]);
        $id = (int)merkez()->lastInsertId();
        sa_audit($sa, 'hospital.create', $name);
    }
    out(['id' => $id]);
}

function a_sa_tenant_save(): void
{
    $sa = need_sa();
    $name = s('name', 120);
    if (mb_strlen($name) < 2) fail('Birim adını girin.');
    $id = (int)(i('id') ?? 0);
    if ($id) {
        $t = m_one('SELECT * FROM tenants WHERE id = ?', [$id]) ?? fail('Birim bulunamadı.', 404);
        m_q('UPDATE tenants SET name = ?, note = ? WHERE id = ?', [$name, s('note', 300), $id]);
        sa_audit($sa, 'tenant.rename', $t['name'], $name);
        out(['id' => $id]);
    }
    $hid = (int)(i('hospital_id') ?? 0);
    $h = m_one('SELECT * FROM hospitals WHERE id = ?', [$hid]) ?? fail('Önce hastaneyi seçin.', 400);
    $key = nm_new_key();
    m_q('INSERT INTO tenants (tkey, hospital_id, name, dir, status, is_default, created_at, note) VALUES (?, ?, ?, ?, ?, 0, ?, ?)', [$key, $hid, $name, 'b', 'active', now(), s('note', 300)]);
    $id = (int)merkez()->lastInsertId();
    sa_audit($sa, 'tenant.create', $h['name'] . ' › ' . $name, $key);
    out(['id' => $id, 'key' => $key]);
}

function a_sa_status(): void
{
    $sa = need_sa();
    $kind = s('kind', 10);
    $id = (int)(i('id') ?? 0);
    $st = s('status', 10) === 'frozen' ? 'frozen' : 'active';
    if ($kind === 'hospital') {
        $h = m_one('SELECT * FROM hospitals WHERE id = ?', [$id]) ?? fail('Hastane bulunamadı.', 404);
        m_q('UPDATE hospitals SET status = ? WHERE id = ?', [$st, $id]);
        sa_audit($sa, $st === 'frozen' ? 'hospital.freeze' : 'hospital.unfreeze', $h['name']);
    } else {
        $t = m_one('SELECT * FROM tenants WHERE id = ?', [$id]) ?? fail('Birim bulunamadı.', 404);
        m_q('UPDATE tenants SET status = ? WHERE id = ?', [$st, $id]);
        sa_audit($sa, $st === 'frozen' ? 'tenant.freeze' : 'tenant.unfreeze', $t['name']);
    }
    out();
}

/**
 * Birime yönetici hesabı aç (yalnız henüz yöneticisi olmayan birimde ya da ek yönetici olarak).
 * Bu istek yalnız o birimin veritabanını açar. Geçici şifre bir kez gösterilir; ilk girişte değiştirilir.
 */
function a_sa_tenant_admin(): void
{
    $sa = need_sa();
    $t = nm_tenant_by_key(s('key', 16)) ?? fail('Birim bulunamadı.', 404);
    $name = s('name', 120);
    $email = mb_strtolower(trim(s('email', 190)));
    if (mb_strlen($name) < 3) fail('Ad soyad girin.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi girin.');
    if (nm_dir_find($email)) fail('Bu e-posta zaten bir birimde kayıtlı. Bir kişi yalnız bir birimde olabilir.', 409);
    out(sa_make_admin($sa, $t, $name, $email, s('copy_mail', 16), b('send_email')));
}

/**
 * Birime yönetici hesabı açar (birim yöneticisi ekleme ve onaylanan birim başvurusu ortak yolu).
 * Bu istekte veritabanı henüz açılmamış olmalı: yalnız hedef birimin veritabanı açılır.
 */
function sa_make_admin(array $sa, array $t, string $name, string $email, string $copyMail, bool $sendEmail): array
{
    $mailCfg = [];
    if ($copyMail !== '' && ($src = nm_tenant_by_key($copyMail)) && ($p = nm_tenant_peek($src))) {
        try { foreach ($p->query("SELECT k, v FROM settings WHERE k LIKE 'mail\\_%' ESCAPE '\\'")->fetchAll() as $r) $mailCfg[$r['k']] = (string)$r['v']; } catch (Throwable $e) { $mailCfg = []; }
    }
    nm_tenant_use($t);
    db();
    $pw = random_token(9);
    $titleId = val('SELECT id FROM titles ORDER BY sort, id LIMIT 1');
    q('INSERT INTO users (name, email, password_hash, title_id, role, status, created_at, must_change) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [$name, $email, password_hash($pw, PASSWORD_DEFAULT), $titleId ?: null, 'admin', 'active', now()]);
    nm_dir_put($email);
    if ((string)setting('org_name', '') === '' || setting('org_name', 'Klinik Portalı') === 'Klinik Portalı') {
        $h = m_one('SELECT name FROM hospitals WHERE id = ?', [(int)$t['hospital_id']]);
        set_setting('org_name', trim(($h['name'] ?? '') . ' ' . $t['name']));
    }
    foreach ($mailCfg as $k => $v) set_setting($k, $v);
    if (m_setting('site_url') !== '') set_setting('site_url', m_setting('site_url'));
    audit(['id' => null, 'name' => 'Sistem yöneticisi'], 'user.create', $name, 'Birim yöneticisi (sistem yönetiminden)');
    sa_audit($sa, 'tenant.admin', $t['name'], $email);
    $mailed = 0;
    if ($sendEmail && function_exists('send_credentials')) $mailed = send_credentials(['name' => $name, 'email' => $email], $pw, true);
    return ['password' => $pw, 'mailed' => $mailed, 'link' => sa_tenant_out(m_one('SELECT t.*, h.name AS hospital_name, h.status AS hospital_status FROM tenants t JOIN hospitals h ON h.id = t.hospital_id WHERE t.id = ?', [(int)$t['id']]))['link']];
}

/**
 * Birime gir: sistem yöneticisi birimde birim yöneticisi yetkisiyle çalışır (sanal kullanıcı, kişi listelerine girmez).
 * Giriş ve çıkış hem sistem günlüğüne hem birimin kendi işlem günlüğüne yazılır.
 */
function a_sa_enter(): void
{
    $sa = need_sa();
    $t = nm_tenant_by_key(s('key', 16)) ?? fail('Birim bulunamadı.', 404);
    nm_tenant_use($t);
    db();
    audit(['id' => null, 'name' => 'Sistem yöneticisi (' . $sa['name'] . ')'], 'sa.enter', (string)$t['name'], 'Sistem yöneticisi birime girdi');
    sa_audit($sa, 'tenant.enter', $t['name']);
    unset($_SESSION['uid']);
    $_SESSION['sa_in'] = (string)$t['tkey'];
    $_SESSION['t'] = (string)$t['tkey'];
    out(['ok' => true]);
}

function a_sa_exit(): void
{
    $sa = need_sa();
    $k = (string)($_SESSION['sa_in'] ?? '');
    if ($k !== '' && ($t = nm_tenant_by_key($k))) {
        nm_tenant_use($t);
        audit(['id' => null, 'name' => 'Sistem yöneticisi (' . $sa['name'] . ')'], 'sa.exit', (string)$t['name'], 'Sistem yöneticisi birimden çıktı');
        sa_audit($sa, 'tenant.exit', $t['name']);
    }
    unset($_SESSION['sa_in'], $_SESSION['t'], $_SESSION['uid']);
    out(['ok' => true]);
}

/** Birimde sistem yöneticisi: sanal yönetici (veritabanında kişi değil) */
function sa_virtual_user(): ?array
{
    if (!nm_multi() || empty($_SESSION['sa_in'])) return null;
    $t = nm_tenant();
    if ((string)$_SESSION['sa_in'] !== (string)$t['tkey']) return null;
    $sa = sa_current();
    if (!$sa) return null;
    return ['id' => 0, 'name' => 'Sistem yöneticisi', 'email' => (string)$sa['email'], 'role' => 'admin', 'role_id' => null, 'status' => 'active', 'title_id' => null, 'unit_id' => null,
        'created_at' => (string)$sa['created_at'], 'last_seen_at' => null, 'password_hash' => null, 'google_sub' => null, 'no_duty' => 1, 'email_notify' => 0, 'notify_mode' => 'off',
        'push_on' => 0, 'phone' => null, 'extension' => null, 'avatar' => null, 'must_change' => 0, 'sa_virtual' => true];
}

function a_sa_audit(): void
{
    need_sa();
    $rows = m_all('SELECT a.*, s.name AS sa_name FROM sa_audit a LEFT JOIN superadmins s ON s.id = a.sa_id ORDER BY a.id DESC LIMIT 200');
    out(['items' => array_map(fn($r) => ['at' => $r['at'], 'who' => $r['sa_name'], 'action' => $r['action'], 'target' => $r['target'], 'detail' => $r['detail'], 'ip' => $r['ip']], $rows)]);
}

return [
    'sa.create' => 'a_sa_create',
    'sa.create.confirm' => 'a_sa_create_confirm',
    'sa.login' => 'a_sa_login',
    'sa.totp' => 'a_sa_totp',
    'sa.logout' => 'a_sa_logout',
    'sa.password' => 'a_sa_password',
    'sa.overview' => 'a_sa_overview',
    'sa.hospital.save' => 'a_sa_hospital_save',
    'sa.tenant.save' => 'a_sa_tenant_save',
    'sa.status' => 'a_sa_status',
    'sa.tenant.admin' => 'a_sa_tenant_admin',
    'sa.audit' => 'a_sa_audit',
    'sa.enter' => 'a_sa_enter',
    'sa.exit' => 'a_sa_exit',
];
