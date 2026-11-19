<?php
/**
 * QR ile bilgisayara giriş (WhatsApp Web gibi) ve bağlı cihazlar / güvenli çıkış (4.11).
 *
 * Akış: bilgisayar qr.new → karekod (link: #/qr/<anahtar>) → telefonda girişli hesap okutur → bilgisayarın tarayıcı/IP bilgisi
 * gösterilir → Onayla (qr.approve) → bilgisayar qr.poll ile girer. Anahtar 2 dakika geçerli, tek kullanımlık; yalnız karekodu
 * oluşturan tarayıcı oturumu (gizli ikinci anahtar oturumda) girebilir — karekodun fotoğrafını çeken başkası giremez.
 * Kayıt: çok birimli yapıda merkez veritabanında (birim girişten önce bilinmez), tek birimde birim veritabanında.
 *
 * Oturum kaydı (user_sessions): her giriş bir kayıt; kişi "Bağlı cihazlar"dan herhangi birini ya da diğer hepsini kapatır.
 * QR ile açılan oturum varsayılan olarak tarayıcı kapanınca biter ve 8 saat boşta kalınca kapanır (ortak bilgisayar güvenliği).
 */
declare(strict_types=1);

const QR_TTL = 120;          // karekod geçerliliği (sn)
const QR_IDLE_MIN = 480;     // QR oturumu boşta kalma sınırı (dk)

function qr_q(string $sql, array $p = []): PDOStatement
{
    static $ready = false;
    $mul = nm_multi();
    if (!$ready) {
        $ready = true;
        $ddl = 'CREATE TABLE IF NOT EXISTS qr_logins (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, secret_hash VARCHAR(64) NOT NULL, status VARCHAR(10) NOT NULL, tkey VARCHAR(40) NULL,
            user_id INT NULL, user_name VARCHAR(120) NULL, label VARCHAR(160) NOT NULL, ip VARCHAR(64) NOT NULL, created_at VARCHAR(19) NOT NULL, expires_at VARCHAR(19) NOT NULL, approved_at VARCHAR(19) NULL)';
        $mul ? merkez()->exec($ddl) : db()->exec($ddl);
    }
    return $mul ? m_q($sql, $p) : q($sql, $p);
}
function qr_one(string $sql, array $p = []): ?array { $r = qr_q($sql, $p)->fetch(); return $r === false ? null : $r; }
function qr_hash(string $s): string { return hash('sha256', $s); }

function qr_label(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $os = preg_match('/Windows/', $ua) ? 'Windows' : (preg_match('/Mac OS X|Macintosh/', $ua) ? 'Mac' : (preg_match('/Android/', $ua) ? 'Android' : (preg_match('/iPhone|iPad/', $ua) ? 'iPhone/iPad' : (preg_match('/Linux|CrOS/', $ua) ? 'Linux' : 'Bilgisayar'))));
    $br = preg_match('/Edg\//', $ua) ? 'Edge' : (preg_match('/OPR\//', $ua) ? 'Opera' : (preg_match('/Firefox\//', $ua) ? 'Firefox' : (preg_match('/Chrome\//', $ua) ? 'Chrome' : (preg_match('/Safari\//', $ua) ? 'Safari' : 'Tarayıcı'))));
    return $os . ' · ' . $br;
}

/** Bilgisayar: yeni karekod */
function a_qr_new(): void
{
    if (current_user()) fail('Zaten giriş yaptınız.');
    $ip = client_ip();
    qr_q('DELETE FROM qr_logins WHERE expires_at < ?', [date('Y-m-d H:i:s', time() - 3600)]);
    $n = (int)qr_one('SELECT COUNT(*) AS n FROM qr_logins WHERE ip = ? AND created_at > ?', [$ip, date('Y-m-d H:i:s', time() - 600)])['n'];
    if ($n >= 30) fail('Çok fazla karekod istendi. Birkaç dakika sonra deneyin.', 429);
    $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
    $secret = bin2hex(random_bytes(24));
    qr_q('INSERT INTO qr_logins (token_hash, secret_hash, status, label, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [qr_hash($token), qr_hash($secret), 'wait', qr_label(), $ip, now(), date('Y-m-d H:i:s', time() + QR_TTL)]);
    $_SESSION['qr'] = ['t' => $token, 's' => $secret];
    $base = nm_multi() && ($m = m_setting('site_url')) !== '' ? $m : base_url();
    out(['url' => rtrim($base, '/') . '/#/qr/' . $token, 'ttl' => QR_TTL]);
}

/** Bilgisayar: onay bekle; onaylanınca bu tarayıcıda oturum açılır */
function a_qr_poll(): void
{
    $q = $_SESSION['qr'] ?? null;
    if (!is_array($q)) out(['state' => 'none']);
    $r = qr_one('SELECT * FROM qr_logins WHERE token_hash = ?', [qr_hash((string)$q['t'])]);
    if (!$r || !hash_equals((string)$r['secret_hash'], qr_hash((string)$q['s']))) { unset($_SESSION['qr']); out(['state' => 'none']); }
    if ($r['status'] === 'deny') { unset($_SESSION['qr']); out(['state' => 'denied']); }
    if ($r['status'] !== 'ok') out(['state' => $r['expires_at'] < now() ? 'expired' : ($r['status'] === 'seen' ? 'seen' : 'wait')]);
    // Onaylandı: tek kullanımlık
    if (qr_q("UPDATE qr_logins SET status = 'used' WHERE token_hash = ? AND status = 'ok'", [$r['token_hash']])->rowCount() !== 1) out(['state' => 'expired']);
    unset($_SESSION['qr']);
    if ((string)$r['approved_at'] < date('Y-m-d H:i:s', time() - 90)) out(['state' => 'expired']);
    if (nm_multi() && (string)nm_tenant()['tkey'] !== (string)$r['tkey']) out(['state' => 'expired']); // nm_route_tenant birimi seçemediyse
    $u = one("SELECT * FROM users WHERE id = ? AND status = 'active'", [(int)$r['user_id']]);
    if (!$u) out(['state' => 'expired']);
    $keep = b('keep');
    login_user($u, ['via' => 'qr', 'label' => $r['label'] . ' (QR)', 'idle' => $keep ? 0 : QR_IDLE_MIN, 'session_cookie' => !$keep]);
    audit($u, 'qr.login', (string)$r['label'], $keep ? 'oturum açık kalsın' : 'tarayıcı kapanınca biter');
    out(['state' => 'in', 'csrf' => $_SESSION['csrf']]);
}

/** Telefon: karekodu okuttu — hangi bilgisayar? */
function a_qr_info(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisi bu yolla giriş onaylayamaz.', 403);
    $r = qr_one('SELECT * FROM qr_logins WHERE token_hash = ?', [qr_hash(s('token', 64))]);
    if (!$r || !in_array($r['status'], ['wait', 'seen'], true) || $r['expires_at'] < now()) fail('Karekodun süresi dolmuş ya da kullanılmış. Bilgisayarda yeni karekod çıkar.', 410);
    qr_q("UPDATE qr_logins SET status = 'seen' WHERE token_hash = ? AND status = 'wait'", [$r['token_hash']]);
    out(['label' => $r['label'], 'ip' => $r['ip'], 'at' => $r['created_at'], 'same_net' => $r['ip'] === client_ip(), 'left' => max(0, strtotime((string)$r['expires_at']) - time())]);
}

/** Telefon: onayla / reddet */
function a_qr_approve(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisi bu yolla giriş onaylayamaz.', 403);
    $r = qr_one('SELECT * FROM qr_logins WHERE token_hash = ?', [qr_hash(s('token', 64))]);
    if (!$r || !in_array($r['status'], ['wait', 'seen'], true) || $r['expires_at'] < now()) fail('Karekodun süresi dolmuş ya da kullanılmış. Bilgisayarda yeni karekod çıkar.', 410);
    if (!b('ok')) {
        qr_q("UPDATE qr_logins SET status = 'deny' WHERE token_hash = ?", [$r['token_hash']]);
        out(['state' => 'denied']);
    }
    qr_q("UPDATE qr_logins SET status = 'ok', tkey = ?, user_id = ?, user_name = ?, approved_at = ? WHERE token_hash = ? AND status IN ('wait', 'seen')",
        [(string)nm_tenant()['tkey'], (int)$me['id'], $me['name'], now(), $r['token_hash']]);
    audit($me, 'qr.approve', (string)$r['label'], 'IP ' . $r['ip']);
    out(['state' => 'ok', 'label' => $r['label']]);
}

/* ---------------- Oturum kaydı: bağlı cihazlar, uzaktan çıkış, boşta kapanma ---------------- */

function us_via(): string
{
    $a = (string)($_GET['action'] ?? '');
    return ['auth.login' => 'şifre', 'auth.google' => 'google', 'passkey.login.finish' => 'parmak izi', 'auth.register' => 'kayıt', 'auth.setup' => 'kurulum', 'auth.reset' => 'şifre sıfırlama'][$a] ?? 'giriş';
}

/** login_user çağırır: bu tarayıcı oturumunu kaydet */
function us_start(array $u, array $opt = []): void
{
    $sk = bin2hex(random_bytes(24));
    q('INSERT INTO user_sessions (user_id, sk_hash, label, via, ip, created_at, last_seen, idle_min) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [(int)$u['id'], qr_hash($sk), mb_substr((string)($opt['label'] ?? qr_label()), 0, 160), (string)($opt['via'] ?? us_via()), client_ip(), now(), now(), (int)($opt['idle'] ?? 0)]);
    $_SESSION['sk'] = $sk;
    if (!empty($opt['session_cookie']) && PHP_SAPI !== 'cli' && !headers_sent()) {
        // Tarayıcı kapanınca biten çerez (ortak bilgisayar)
        setcookie(session_name(), session_id(), ['expires' => 0, 'path' => '/', 'secure' => nm_is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    }
}

/** current_user çağırır: oturum kapatılmış ya da boşta süresi dolmuşsa false */
function us_check(array $u): bool
{
    $sk = (string)($_SESSION['sk'] ?? '');
    if ($sk === '') { try { us_start($u, ['via' => 'önceki giriş']); } catch (Throwable $e) { /* tablo yoksa (güncelleme sırası) */ } return true; }
    try { $r = one('SELECT * FROM user_sessions WHERE sk_hash = ?', [qr_hash($sk)]); } catch (Throwable $e) { return true; }
    if (!$r || (int)$r['user_id'] !== (int)$u['id'] || $r['revoked_at']) return false;
    if ((int)$r['idle_min'] > 0 && (string)$r['last_seen'] < date('Y-m-d H:i:s', time() - (int)$r['idle_min'] * 60)) {
        q('UPDATE user_sessions SET revoked_at = ?, reason = ? WHERE id = ?', [now(), 'idle', $r['id']]);
        return false;
    }
    if ((string)$r['last_seen'] < date('Y-m-d H:i:s', time() - 60)) q('UPDATE user_sessions SET last_seen = ?, ip = ? WHERE id = ?', [now(), client_ip(), $r['id']]);
    return true;
}

/** a_logout çağırır */
function us_end(): void
{
    $sk = (string)($_SESSION['sk'] ?? '');
    if ($sk !== '') { try { q('UPDATE user_sessions SET revoked_at = ?, reason = ? WHERE sk_hash = ? AND revoked_at IS NULL', [now(), 'logout', qr_hash($sk)]); } catch (Throwable $e) { /* */ } }
}

function a_me_sessions(): void
{
    $me = need_user();
    $cur = qr_hash((string)($_SESSION['sk'] ?? ''));
    $rows = all('SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen DESC LIMIT 50', [$me['id']]);
    $o = [];
    foreach ($rows as $r) {
        if ((int)$r['idle_min'] > 0 && (string)$r['last_seen'] < date('Y-m-d H:i:s', time() - (int)$r['idle_min'] * 60)) continue;
        $o[] = ['id' => (int)$r['id'], 'label' => $r['label'], 'via' => $r['via'], 'ip' => $r['ip'], 'created_at' => $r['created_at'], 'last_seen' => $r['last_seen'],
            'idle_min' => (int)$r['idle_min'], 'current' => $r['sk_hash'] === $cur];
    }
    out(['items' => $o]);
}

function a_me_sessions_revoke(): void
{
    $me = need_user();
    $cur = qr_hash((string)($_SESSION['sk'] ?? ''));
    if (b('others')) $n = q('UPDATE user_sessions SET revoked_at = ?, reason = ? WHERE user_id = ? AND revoked_at IS NULL AND sk_hash <> ?', [now(), 'remote', $me['id'], $cur])->rowCount();
    else $n = q('UPDATE user_sessions SET revoked_at = ?, reason = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND sk_hash <> ?', [now(), 'remote', (int)i('id'), $me['id'], $cur])->rowCount();
    audit($me, 'sessions.revoke', b('others') ? 'diğer tüm cihazlar' : 'bir cihaz', $n . ' oturum kapatıldı');
    out(['closed' => $n]);
}

$GLOBALS['NM_JOBS']['sessions_clean'] = function (bool $force) {
    $n = q('DELETE FROM user_sessions WHERE revoked_at IS NOT NULL AND revoked_at < ?', [date('Y-m-d H:i:s', time() - 30 * 86400)])->rowCount();
    q('DELETE FROM user_sessions WHERE revoked_at IS NULL AND last_seen < ?', [date('Y-m-d H:i:s', time() - 60 * 86400)]);
    return $n ?: null;
};

return [
    'qr.new' => 'a_qr_new',
    'qr.poll' => 'a_qr_poll',
    'qr.info' => 'a_qr_info',
    'qr.approve' => 'a_qr_approve',
    'me.sessions' => 'a_me_sessions',
    'me.sessions.revoke' => 'a_me_sessions_revoke',
];
