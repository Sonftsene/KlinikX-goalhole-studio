<?php
/**
 * Destek (4.23): kişiler uygulamanın içinden destek talebi açar; talepler sistem yöneticisine (süper yönetici) ya da birim sorumlusuna gider.
 *  - İki yol: "sorumlu" (birim yöneticisi ve yayıncılar: kurulum, liste, kullanıcılar, abonelik…) her zaman sistem yöneticisine gider;
 *    "kullanıcı" (üyeler) konuya göre ayrılır: birim konuları (nöbetim, izin/istek/ilan, diğer) birim sorumlusuna, teknik konular
 *    (giriş, bildirim, hata, öneri) sistem yöneticisine. Sorumlu çözemediği talebi tek tuşla sistem yöneticisine iletir; sistem yöneticisi
 *    birim konusunu birime aktarabilir.
 *  - Giriş yapamayan kişi giriş ekranından yazar (track 'public'); yanıtı e-postadaki bağlantıdan okur ve yanıtlar.
 *  - Talebe otomatik bağlam eklenir: hastane, birim, rol (özel rol adı ve yönettiği modüller), sayfa, sürüm, cihaz, son hata.
 *  - Çok birimli kurulumda talepler merkez veritabanında (sistem yöneticisi birim veritabanı açmadan görür); tek birimli (MySQL)
 *    kurulumda sistem yöneticisi yoktur: talepler birimin veritabanında, hepsi birim yöneticisine gider.
 *  - KVKK: T.C. kimlik numarası engellenir, hasta bilgisi uyarısı, ekran görüntüsü şifreli saklanır, kapanan talepler 1 yıl sonra silinir.
 */
declare(strict_types=1);

const SP_TRACKS = ['lead' => 'Sorumlu', 'user' => 'Kullanıcı', 'public' => 'Giriş yapamayan'];
const SP_STATUS = ['open' => 'Yanıt bekliyor', 'answered' => 'Yanıtlandı', 'closed' => 'Kapandı'];
const SP_FILE_MAX = 4 * 1024 * 1024;

require_once __DIR__ . '/destek_kb.php';

/**
 * Konular: [ad, yönlendirme sa|unit, görünme koşulu (destek_kb.php sp_kb_ok ile aynı)].
 * Hazır çözümler konuya göre bilgi bankasından (sp_kb) gelir ve kişinin yetkisine göre süzülür.
 */
function sp_topics(): array
{
    return [
        'lead' => [
            'kurulum' => ['Birim ayarları', 'sa', ['role' => 'admin']],
            'kullanici' => ['Kullanıcılar, roller ve yetkiler', 'sa', ['role' => 'admin']],
            'liste' => ['Excel / nöbet listesi yükleme', 'sa', ['manage' => 'nobet']],
            'yonetim' => ['Yönettiğim modüller (istek dönemi, çağrı, taraf, rehber…)', 'sa', []],
            'abonelik' => ['Abonelik ve ödeme', 'sa', ['billing' => true]],
            'giris' => ['Kendi hesabım ve girişim', 'sa', []],
            'bildirim' => ['Bildirim ya da e-posta gelmiyor', 'sa', []],
            'hata' => ['Hata bildirimi', 'sa', []],
            'oneri' => ['Öneri / yeni özellik isteği', 'sa', []],
            'diger' => ['Diğer', 'sa', []],
        ],
        'user' => [
            'giris' => ['Giriş, şifre ve hesap', 'sa', []],
            'nobet' => ['Nöbetim görünmüyor ya da yanlış', 'unit', ['mod' => 'nobet']],
            'birim' => ['İzin, istek, ilan ve değişimler', 'unit', ['mod' => 'nobet']],
            'abonelik' => ['Abonelik ve ödeme', 'sa', ['billing' => true]], // abonelik kişi başına: herkes kendi ödemesi için
            'bildirim' => ['Bildirim ya da e-posta gelmiyor', 'sa', []],
            'hata' => ['Uygulama hatası', 'sa', []],
            'oneri' => ['Öneri / yeni özellik isteği', 'sa', []],
            'diger' => ['Diğer (birim sorumlusuna)', 'unit', []],
        ],
    ];
}

function sp_m(): bool { return nm_multi(); }
function sp_q(string $sql, array $p = []): PDOStatement { sp_ensure(); return sp_m() ? m_q($sql, $p) : q($sql, $p); }
function sp_one(string $sql, array $p = []): ?array { sp_ensure(); return sp_m() ? m_one($sql, $p) : one($sql, $p); }
function sp_all(string $sql, array $p = []): array { sp_ensure(); return sp_m() ? m_all($sql, $p) : all($sql, $p); }
function sp_val(string $sql, array $p = []) { sp_ensure(); return sp_m() ? m_val($sql, $p) : val($sql, $p); }
function sp_id(): int { return sp_m() ? (int)merkez()->lastInsertId() : insert_id(); }

/** Tablolar: çok birimlide merkezde, tek birimlide birim veritabanında (bir kez) */
function sp_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (sp_m()) {
        if (m_setting('sp_schema') === '1') return;
        $pk = 'INTEGER PRIMARY KEY AUTOINCREMENT'; $end = ''; $ex = fn($s) => merkez()->exec($s);
    } else {
        if (setting('sp_schema', '') === '1') return;
        $my = DB_DRIVER === 'mysql';
        $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $end = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
        $ex = fn($s) => db()->exec($s);
    }
    $ex("CREATE TABLE IF NOT EXISTS sp_tickets (id $pk, tkey VARCHAR(40) NOT NULL DEFAULT '', hosp_id INT NULL, hosp_name VARCHAR(160) NOT NULL DEFAULT '', unit_name VARCHAR(160) NOT NULL DEFAULT '',
        user_id INT NULL, user_name VARCHAR(120) NOT NULL, user_email VARCHAR(190) NOT NULL DEFAULT '', role VARCHAR(10) NOT NULL DEFAULT '', role_name VARCHAR(80) NOT NULL DEFAULT '',
        track VARCHAR(8) NOT NULL, topic VARCHAR(20) NOT NULL, route VARCHAR(4) NOT NULL, forwarded INT NOT NULL DEFAULT 0, subject VARCHAR(160) NOT NULL, status VARCHAR(10) NOT NULL DEFAULT 'open',
        ctx TEXT NULL, token_hash VARCHAR(64) NULL, un_user INT NOT NULL DEFAULT 0, un_sa INT NOT NULL DEFAULT 0, un_unit INT NOT NULL DEFAULT 0, replied INT NOT NULL DEFAULT 0, rating INT NULL,
        created_at VARCHAR(19) NOT NULL, updated_at VARCHAR(19) NOT NULL, closed_at VARCHAR(19) NULL)$end");
    $ex("CREATE TABLE IF NOT EXISTS sp_msgs (id $pk, ticket_id INT NOT NULL, who VARCHAR(6) NOT NULL, name VARCHAR(120) NOT NULL DEFAULT '', body TEXT NOT NULL, internal INT NOT NULL DEFAULT 0,
        file VARCHAR(40) NULL, file_mime VARCHAR(20) NULL, created_at VARCHAR(19) NOT NULL)$end");
    $ex("CREATE TABLE IF NOT EXISTS sp_hits (k VARCHAR(80) NOT NULL, at INT NOT NULL)$end");
    foreach (['CREATE INDEX sp_t_unit ON sp_tickets (tkey, route, status)', 'CREATE INDEX sp_t_user ON sp_tickets (user_id)', 'CREATE INDEX sp_t_tok ON sp_tickets (token_hash)',
        'CREATE INDEX sp_m_t ON sp_msgs (ticket_id)', 'CREATE INDEX sp_h_k ON sp_hits (k, at)'] as $s) { try { $ex($s); } catch (Throwable $e) { /* zaten var */ } }
    if (sp_m()) m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('sp_schema', '1')");
    else set_setting('sp_schema', '1');
}

/* ---------------- Yardımcılar ---------------- */

function sp_key(): string
{
    if (sp_m()) return hash('sha256', 'sp|' . m_setting('secret'), true);
    $s = (string)setting('sp_secret', '');
    if ($s === '') { $s = bin2hex(random_bytes(32)); set_setting('sp_secret', $s); }
    return hash('sha256', 'sp|' . $s, true);
}
function sp_dir(): string
{
    $d = NM_ROOT . (sp_m() ? '/data/merkez/destek' : '/data/destek');
    if (!is_dir($d)) @mkdir($d, 0700, true);
    if (!is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Require all denied\n");
    return $d;
}
function sp_file_del(?string $f): void
{
    if ($f && preg_match('/^[a-f0-9]{32}\.bin$/', $f) && is_file(sp_dir() . '/' . $f)) @unlink(sp_dir() . '/' . $f);
}
/** Ekran görüntüsü: veri adresi → şifreli dosya [ad, mime] */
function sp_file_take(string $data): array
{
    if ($data === '') return [null, null];
    if (!preg_match('#^data:image/[a-z+.-]+;base64,(.+)$#s', $data, $m)) fail('Görsel okunamadı.');
    $bin = base64_decode($m[1], true);
    if ($bin === false || $bin === '') fail('Görsel okunamadı.');
    if (strlen($bin) > SP_FILE_MAX) fail('Görsel en fazla 4 MB olabilir.');
    $mime = strncmp($bin, "\xFF\xD8\xFF", 3) === 0 ? 'image/jpeg' : (strncmp($bin, "\x89PNG", 4) === 0 ? 'image/png' : (substr($bin, 0, 4) === 'RIFF' && substr($bin, 8, 4) === 'WEBP' ? 'image/webp' : ''));
    if ($mime === '') fail('Görsel JPG, PNG ya da WEBP olmalı.');
    $f = bin2hex(random_bytes(16)) . '.bin';
    $iv = random_bytes(12);
    $c = openssl_encrypt($bin, 'aes-256-gcm', sp_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($c === false || file_put_contents(sp_dir() . '/' . $f, $iv . $tag . $c, LOCK_EX) === false) fail('Görsel kaydedilemedi.', 500);
    return [$f, $mime];
}
function sp_file_read(string $f): string
{
    if (!preg_match('/^[a-f0-9]{32}\.bin$/', $f) || !is_file(sp_dir() . '/' . $f)) return '';
    $b = (string)file_get_contents(sp_dir() . '/' . $f);
    if (strlen($b) < 29) return '';
    $p = openssl_decrypt(substr($b, 28), 'aes-256-gcm', sp_key(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
    return $p === false ? '' : $p;
}

/** Basit hız sınırı */
function sp_hit(string $k, int $max, int $window, string $msg): void
{
    sp_q('DELETE FROM sp_hits WHERE at < ?', [time() - 86400]);
    if ((int)sp_val('SELECT COUNT(*) FROM sp_hits WHERE k = ? AND at > ?', [$k, time() - $window]) >= $max) fail($msg, 429);
    sp_q('INSERT INTO sp_hits (k, at) VALUES (?, ?)', [$k, time()]);
}

/** Metin denetimi: uzunluk + T.C. kimlik numarası */
function sp_text(string $body, int $min = 5): string
{
    $body = trim(str_replace("\r", '', $body));
    if (mb_strlen($body) < $min) fail('Lütfen sorununuzu biraz daha ayrıntılı yazın.');
    if (function_exists('c_has_tckn') && c_has_tckn($body)) fail('Mesajda T.C. kimlik numarası var. Kişisel ve hasta bilgisi yazmayın; numarayı silip yeniden gönderin.');
    return $body;
}

/** Bu birim: [tkey, hastane id, hastane adı, birim adı] */
function sp_here(): array
{
    if (!sp_m()) return ['', null, '', (string)setting('org_name', 'Klinik Portalı')];
    $t = nm_tenant();
    return [(string)$t['tkey'], (int)$t['hospital_id'], (string)($t['hospital_name'] ?? m_val('SELECT name FROM hospitals WHERE id = ?', [(int)$t['hospital_id']]) ?? ''), (string)$t['name']];
}
function sp_role_label(string $r): string { return ['admin' => 'Yönetici', 'editor' => 'Yayıncı (sorumlu)', 'member' => 'Üye'][$r] ?? $r; }

/** Kişinin gerçek rolü (rol gözünden önizleme açıksa bile) ve yolu */
function sp_real(array $me): array
{
    $role = (string)($me['real_role'] ?? $me['role']);
    return [$role, in_array($role, ['admin', 'editor'], true) ? 'lead' : 'user'];
}

/** Talep açabilir mi (null = evet, değilse neden) */
function sp_cant(array $me): ?string
{
    if (!empty($me['sa_virtual'])) return 'Sistem yöneticisi birimin içinden destek talebi açmaz.';
    if (!sp_m() && sp_real($me)[0] === 'admin') return 'Bu kurulumda sistem yöneticisi yok: destek talepleri size (birim yöneticisine) gelir.';
    return null;
}

/** Talebe eklenen bağlam (istemciden gelenler süzülür; rol ve yetkiler sunucuda) */
function sp_ctx(array $me, $c): array
{
    $o = [];
    if (is_array($c)) foreach (['page' => 200, 'title' => 120, 'ua' => 300, 'screen' => 20, 'app' => 20, 'err' => 300, 'net' => 20] as $k => $n) {
        if (isset($c[$k]) && is_scalar($c[$k]) && (string)$c[$k] !== '') $o[$k] = mb_substr((string)$c[$k], 0, $n);
    }
    $o['v'] = NM_VERSION;
    [$role] = sp_real($me);
    $o['role'] = sp_role_label($role);
    // Rol gözünden önizlemede oturumdaki rol değil, kişinin kayıtlı özel rolü
    $rid = $role === 'admin' ? 0 : (!empty($me['view_as']) ? (int)(one('SELECT role_id FROM users WHERE id = ?', [(int)$me['id']])['role_id'] ?? 0) : (int)($me['role_id'] ?? 0));
    if ($rid) $o['role_name'] = (string)(val('SELECT name FROM roles WHERE id = ?', [$rid]) ?: '');
    if (function_exists('user_perm') && defined('NM_MODULES')) {
        $real = $me; $real['role'] = $role; $real['role_id'] = $rid ?: null;
        $man = []; $off = [];
        foreach (NM_MODULES as $m => [$name]) { if (!nm_mod_on($m)) continue; $p = user_perm($real, $m); if ($p === 'manage') $man[] = $name; elseif ($p === 'off') $off[] = $name; }
        if ($role !== 'admin') { $o['manage'] = implode(', ', $man); if ($off) $o['off'] = implode(', ', $off); }
    }
    return $o;
}

function sp_out(array $t, bool $full = false): array
{
    $tp = sp_topics();
    $topic = $tp[$t['track'] === 'lead' ? 'lead' : 'user'][$t['topic']][0] ?? ($t['topic'] === 'giris' ? 'Giriş yapamıyorum' : $t['topic']);
    $o = ['id' => (int)$t['id'], 'subject' => $t['subject'], 'topic' => $t['topic'], 'topic_name' => $topic, 'track' => $t['track'], 'route' => $t['route'], 'forwarded' => (int)$t['forwarded'] === 1,
        'status' => $t['status'], 'status_name' => SP_STATUS[$t['status']] ?? $t['status'], 'created_at' => $t['created_at'], 'updated_at' => $t['updated_at'], 'closed_at' => $t['closed_at'],
        'user_name' => $t['user_name'], 'unit_name' => $t['unit_name'], 'hosp_name' => $t['hosp_name'], 'role' => $t['role'], 'role_name' => $t['role_name'],
        'un_user' => (int)$t['un_user'] === 1, 'un_sa' => (int)$t['un_sa'] === 1, 'un_unit' => (int)$t['un_unit'] === 1, 'replied' => (int)$t['replied'] === 1, 'rating' => $t['rating'] !== null ? (int)$t['rating'] : null];
    if ($full) { $o['user_email'] = $t['user_email']; $o['tkey'] = $t['tkey']; $o['ctx'] = json_decode((string)$t['ctx'], true) ?: []; }
    return $o;
}
function sp_msgs_out(int $tid, bool $internal): array
{
    $rows = sp_all('SELECT * FROM sp_msgs WHERE ticket_id = ?' . ($internal ? '' : ' AND internal = 0') . ' ORDER BY id', [$tid]);
    return array_map(fn($m) => ['id' => (int)$m['id'], 'who' => $m['who'], 'name' => $m['name'], 'body' => $m['body'], 'internal' => (int)$m['internal'] === 1,
        'file' => $m['file'] ? (int)$m['id'] : null, 'at' => $m['created_at']], $rows);
}
function sp_add_msg(int $tid, string $who, string $name, string $body, bool $internal = false, ?string $file = null, ?string $mime = null): void
{
    sp_q('INSERT INTO sp_msgs (ticket_id, who, name, body, internal, file, file_mime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [$tid, $who, mb_substr($name, 0, 120), $body, $internal ? 1 : 0, $file, $mime, now()]);
}

/** Birim tarafı: bu kişi bu talebi birim sorumlusu olarak görebilir mi */
function sp_unit_handler(array $me): bool { return in_array($me['role'], ['admin', 'editor'], true) && empty($me['sa_virtual']); }
function sp_can_handle(array $me, array $t): bool
{
    if (!sp_unit_handler($me) || (string)$t['tkey'] !== sp_here()[0] || (int)($t['user_id'] ?? 0) === (int)$me['id']) return false;
    if ($t['route'] !== 'unit' && (int)$t['forwarded'] !== 1) return false;
    return $t['track'] !== 'lead' || $me['role'] === 'admin';
}
function sp_is_owner(array $me, array $t): bool { return (int)($t['user_id'] ?? 0) === (int)$me['id'] && (string)$t['tkey'] === sp_here()[0]; }

/** Birim sorumluları (bildirim için) */
function sp_unit_handlers(string $track): array
{
    return all("SELECT * FROM users WHERE status = 'active' AND role IN (" . ($track === 'lead' ? "'admin'" : "'admin', 'editor'") . ')');
}

/** Sistem yöneticilerine e-posta (birim veritabanı açıksa ve e-postası hazırsa onun kuyruğundan, değilse başvurudaki yoldan) */
function sp_mail_sa(string $subject, array $lines): void
{
    if (!sp_m()) return;
    try {
        $to = array_map(fn($r) => ['name' => (string)$r['name'], 'email' => (string)$r['email']], m_all('SELECT name, email FROM superadmins WHERE totp_on = 1'));
        if (!$to) return;
        if (!empty($GLOBALS['NM_DB_OPEN']) && mail_ready()) {
            $GLOBALS['NM_MAIL_ORG'] = 'dupcii';
            try { mail_queue_to($to, $subject, $subject, $lines, 'Destek taleplerini aç', base_url(), 'support', false); }
            finally { unset($GLOBALS['NM_MAIL_ORG']); }
        } elseif (function_exists('ap_mail')) ap_mail($to, $subject, $subject, $lines, 'Destek taleplerini aç', ap_site());
    } catch (Throwable $e) { error_log('[dupcii] destek e-postası: ' . $e->getMessage()); }
}

/** Kişiye haber (birim veritabanı bu isteğin birimi olmalı) */
function sp_notify_user(array $t, string $title, string $body): void
{
    try {
        if (!$t['user_id']) return;
        $u = one("SELECT * FROM users WHERE id = ? AND status = 'active'", [(int)$t['user_id']]);
        if ($u) notify_users([$u], 'support', $title, $body, '#/destek/' . (int)$t['id'], [
            'subject' => $title, 'heading' => $title, 'lines' => [$body, 'Talep: ' . $t['subject']], 'button' => 'Talebi aç',
        ]);
    } catch (Throwable $e) { error_log('[dupcii] destek bildirimi: ' . $e->getMessage()); }
}
function sp_notify_handlers(array $t, string $title, string $body): void
{
    try {
        $hs = array_filter(sp_unit_handlers((string)$t['track']), fn($u) => (int)$u['id'] !== (int)($t['user_id'] ?? 0));
        if ($hs) notify_users(array_values($hs), 'support', $title, $body, '#/destek/birim/' . (int)$t['id'], [
            'subject' => $title, 'heading' => $title, 'lines' => [$body, 'Talep: ' . $t['subject']], 'button' => 'Talebi aç',
        ]);
    } catch (Throwable $e) { error_log('[dupcii] destek bildirimi: ' . $e->getMessage()); }
}

/** Bakım: kapanan talepler 1 yıl, giriş yapamayanların talepleri 6 ay sonra silinir */
function sp_gc(): void
{
    $rows = sp_all("SELECT id FROM sp_tickets WHERE (status = 'closed' AND closed_at < ?) OR (track = 'public' AND updated_at < ?)", [date('Y-m-d H:i:s', strtotime('-365 days')), date('Y-m-d H:i:s', strtotime('-180 days'))]);
    foreach ($rows as $r) sp_delete((int)$r['id']);
}
function sp_delete(int $id): void
{
    foreach (sp_all('SELECT file FROM sp_msgs WHERE ticket_id = ? AND file IS NOT NULL', [$id]) as $m) sp_file_del($m['file']);
    sp_q('DELETE FROM sp_msgs WHERE ticket_id = ?', [$id]);
    sp_q('DELETE FROM sp_tickets WHERE id = ?', [$id]);
}

/* ---------------- Birim tarafı uçları ---------------- */

function a_sp_cfg(): void
{
    $me = need_user();
    [$role, $track] = sp_real($me);
    [, , $hosp, $unit] = sp_here();
    // Hazır çözümler ve "Sık sorulanlar": kişinin şu anki (rol önizlemesinde önizlenen) yetkisine göre
    $faq = sp_kb_for($me);
    $topics = [];
    foreach (sp_topics()[$track] as $k => [$name, $route, $cond]) {
        if (!sp_kb_ok($me, $cond)) continue;
        $topics[] = ['key' => $k, 'name' => $name, 'route' => sp_m() ? $route : 'unit',
            'tips' => array_values(array_map(fn($x) => $x['id'], array_filter($faq, fn($x) => in_array($k, $x['topics'], true))))];
    }
    out(['track' => $track, 'topics' => $topics, 'faq' => $faq, 'cant' => sp_cant($me), 'handler' => sp_unit_handler($me), 'multi' => sp_m(),
        'who' => ['hospital' => $hosp, 'unit' => $unit, 'role' => sp_role_label($role), 'name' => $me['name']]]);
}

function a_sp_mine(): void
{
    $me = need_user();
    $rows = sp_all('SELECT * FROM sp_tickets WHERE user_id = ? AND tkey = ? ORDER BY CASE WHEN status = \'closed\' THEN 1 ELSE 0 END, updated_at DESC LIMIT 100', [(int)$me['id'], sp_here()[0]]);
    out(['items' => array_map('sp_out', $rows)]);
}

function a_sp_inbox(): void
{
    $me = need_user();
    if (!sp_unit_handler($me)) fail('Birim talepleri sorumlulara açıktır.', 403);
    $f = s('filter', 10);
    $where = $f === 'closed' ? "status = 'closed'" : ($f === 'all' ? '1 = 1' : "status <> 'closed'");
    $rows = array_filter(sp_all("SELECT * FROM sp_tickets WHERE tkey = ? AND (route = 'unit' OR forwarded = 1) AND $where ORDER BY un_unit DESC, updated_at DESC LIMIT 200", [sp_here()[0]]),
        fn($t) => sp_can_handle($me, $t));
    out(['items' => array_values(array_map('sp_out', $rows))]);
}

function sp_ticket_for(array $me, int $id): array
{
    $t = sp_one('SELECT * FROM sp_tickets WHERE id = ?', [$id]);
    if (!$t || (!sp_is_owner($me, $t) && !sp_can_handle($me, $t))) fail('Talep bulunamadı.', 404);
    return $t;
}

function a_sp_get(): void
{
    $me = need_user();
    $t = sp_ticket_for($me, (int)i('id'));
    $owner = sp_is_owner($me, $t);
    $handle = !$owner && sp_can_handle($me, $t);
    if ($owner && (int)$t['un_user'] === 1) sp_q('UPDATE sp_tickets SET un_user = 0 WHERE id = ?', [$t['id']]);
    if ($handle && (int)$t['un_unit'] === 1 && $t['route'] === 'unit') sp_q('UPDATE sp_tickets SET un_unit = 0 WHERE id = ?', [$t['id']]);
    $active = $handle && $t['route'] === 'unit';
    out(['ticket' => sp_out($t, $handle) + ['mine' => $owner], 'msgs' => sp_msgs_out((int)$t['id'], false),
        'can' => ['reply' => $owner || $active, 'close' => ($owner || $active) && $t['status'] !== 'closed', 'forward' => $active && sp_m(), 'rate' => $owner && $t['status'] === 'closed' && $t['rating'] === null]]);
}

function a_sp_create(): void
{
    $me = need_user();
    if ($c = sp_cant($me)) fail($c, 403);
    [$role, $track] = sp_real($me);
    $topic = s('topic', 20);
    $tp = sp_topics()[$track][$topic] ?? fail('Konu seçin.');
    if (!sp_kb_ok(array_merge($me, ['role' => $role]), $tp[2])) fail('Konu seçin.');
    $subject = trim(s('subject', 160));
    if (mb_strlen($subject) < 3) fail('Kısa bir başlık yazın.');
    $body = sp_text(s('body', 4000));
    if (function_exists('c_has_tckn') && c_has_tckn($subject)) fail('Başlıkta T.C. kimlik numarası var. Kişisel ve hasta bilgisi yazmayın.');
    sp_hit('u:' . sp_here()[0] . ':' . $me['id'], 10, 3600, 'Bir saatte çok fazla talep açtınız. Var olan talebinize yazabilirsiniz.');
    global $IN;
    [$file, $mime] = sp_file_take((string)($IN['file'] ?? ''));
    [$tkey, $hid, $hosp, $unit] = sp_here();
    $route = sp_m() ? $tp[1] : 'unit';
    $ctx = sp_ctx($me, $IN['ctx'] ?? null);
    $now = now();
    sp_q('INSERT INTO sp_tickets (tkey, hosp_id, hosp_name, unit_name, user_id, user_name, user_email, role, role_name, track, topic, route, subject, status, ctx, un_sa, un_unit, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$tkey, $hid, $hosp, $unit, (int)$me['id'], $me['name'], (string)$me['email'], $role, (string)($ctx['role_name'] ?? ''), $track, $topic, $route, $subject, 'open',
            json_encode($ctx, JSON_UNESCAPED_UNICODE), $route === 'sa' ? 1 : 0, $route === 'unit' ? 1 : 0, $now, $now]);
    $id = sp_id();
    sp_add_msg($id, 'user', $me['name'], $body, false, $file, $mime);
    $t = sp_one('SELECT * FROM sp_tickets WHERE id = ?', [$id]);
    if ($route === 'sa') sp_mail_sa('Yeni destek talebi: ' . $subject, [($hosp !== '' ? $hosp . ' › ' : '') . $unit . ' · ' . $me['name'] . ' (' . sp_role_label($role) . ')', 'Konu: ' . $tp[0], mb_substr($body, 0, 400)]);
    else sp_notify_handlers($t, 'Yeni destek talebi: ' . $subject, $me['name'] . ' · ' . $tp[0]);
    out(['ticket' => sp_out($t), 'route' => $route]);
}

function a_sp_reply(): void
{
    $me = need_user();
    $t = sp_ticket_for($me, (int)i('id'));
    $owner = sp_is_owner($me, $t);
    if (!$owner && $t['route'] !== 'unit') fail('Bu talep sistem yöneticisine iletildi; yanıtı o verir.', 403);
    $body = sp_text(s('body', 4000), 1);
    global $IN;
    [$file, $mime] = sp_file_take((string)($IN['file'] ?? ''));
    $now = now();
    if ($owner) {
        sp_add_msg((int)$t['id'], 'user', $me['name'], $body, false, $file, $mime);
        sp_q("UPDATE sp_tickets SET status = 'open', closed_at = NULL, un_sa = ?, un_unit = ?, updated_at = ? WHERE id = ?", [$t['route'] === 'sa' ? 1 : (int)$t['un_sa'], $t['route'] === 'unit' ? 1 : (int)$t['un_unit'], $now, $t['id']]);
        if ($t['route'] === 'sa') sp_mail_sa('Destek talebine yanıt: ' . $t['subject'], [$t['unit_name'] . ' · ' . $me['name'], mb_substr($body, 0, 400)]);
        else sp_notify_handlers($t, 'Destek talebine yanıt: ' . $t['subject'], $me['name'] . ': ' . mb_substr($body, 0, 120));
    } else {
        sp_add_msg((int)$t['id'], 'unit', $me['name'] . ' (birim sorumlusu)', $body, false, $file, $mime);
        $close = b('close');
        sp_q('UPDATE sp_tickets SET status = ?, closed_at = ?, un_user = 1, un_unit = 0, replied = 1, updated_at = ? WHERE id = ?', [$close ? 'closed' : 'answered', $close ? $now : null, $now, $t['id']]);
        sp_notify_user($t, 'Destek talebinize yanıt geldi', $me['name'] . ': ' . mb_substr($body, 0, 140));
    }
    out(['ok' => true]);
}

function a_sp_close(): void
{
    $me = need_user();
    $t = sp_ticket_for($me, (int)i('id'));
    $owner = sp_is_owner($me, $t);
    if (!$owner && $t['route'] !== 'unit') fail('Bu talebi sistem yöneticisi kapatır.', 403);
    sp_add_msg((int)$t['id'], 'sys', '', $me['name'] . ' talebi kapattı.');
    sp_q("UPDATE sp_tickets SET status = 'closed', closed_at = ?, updated_at = ?, un_sa = 0, un_unit = 0, un_user = ? WHERE id = ?", [now(), now(), $owner ? 0 : 1, $t['id']]);
    if (!$owner) sp_notify_user($t, 'Destek talebiniz kapatıldı', $t['subject']);
    out(['ok' => true]);
}

function a_sp_rate(): void
{
    $me = need_user();
    $t = sp_ticket_for($me, (int)i('id'));
    if (!sp_is_owner($me, $t) || $t['status'] !== 'closed') fail('Kapanan talebinizi puanlayabilirsiniz.');
    $r = max(1, min(5, (int)i('rating')));
    sp_q('UPDATE sp_tickets SET rating = ? WHERE id = ?', [$r, $t['id']]);
    $note = trim(s('note', 500));
    if ($note !== '') sp_add_msg((int)$t['id'], 'user', $me['name'], sp_text($note, 1));
    out(['ok' => true]);
}

/** Birim sorumlusu çözemediği talebi sistem yöneticisine iletir */
function a_sp_forward(): void
{
    $me = need_user();
    if (!sp_m()) fail('Bu kurulumda sistem yöneticisi yok.');
    $t = sp_ticket_for($me, (int)i('id'));
    if (!sp_can_handle($me, $t) || $t['route'] !== 'unit') fail('Talep iletilemez.', 403);
    $note = trim(s('note', 1000));
    sp_add_msg((int)$t['id'], 'sys', '', $me['name'] . ' (birim sorumlusu) talebi sistem yöneticisine iletti.');
    if ($note !== '') sp_add_msg((int)$t['id'], 'unit', $me['name'] . ' (birim sorumlusu)', sp_text($note, 1));
    sp_q("UPDATE sp_tickets SET route = 'sa', forwarded = 1, status = 'open', closed_at = NULL, un_sa = 1, un_unit = 0, un_user = 1, updated_at = ? WHERE id = ?", [now(), $t['id']]);
    sp_mail_sa('Birimden iletilen destek talebi: ' . $t['subject'], [$t['hosp_name'] . ' › ' . $t['unit_name'] . ' · ' . $t['user_name'], 'İleten: ' . $me['name'] . ($note !== '' ? ' — ' . $note : '')]);
    sp_notify_user($t, 'Talebiniz sistem yöneticisine iletildi', $t['subject']);
    out(['ok' => true]);
}

/** Ekran görüntüsü (GET): talebin sahibi, birim sorumlusu ya da sistem yöneticisi */
function a_sp_file(): void
{
    $id = (int)($_GET['id'] ?? 0);
    $m = sp_one('SELECT * FROM sp_msgs WHERE id = ?', [$id]);
    $ok = false;
    if ($m && $m['file']) {
        $t = sp_one('SELECT * FROM sp_tickets WHERE id = ?', [(int)$m['ticket_id']]);
        if ($t && function_exists('sa_current') && sp_m() && sa_current()) $ok = true;
        elseif ($t && (int)$m['internal'] === 0) {
            $tok = (string)($_GET['t'] ?? '');
            if ($tok !== '' && $t['token_hash'] && hash_equals((string)$t['token_hash'], hash('sha256', $tok))) $ok = true;
            elseif ($tok === '' && ($me = current_user()) && (sp_is_owner($me, $t) || sp_can_handle($me, $t))) $ok = true;
        }
    }
    if (!$ok) { http_response_code(404); exit; }
    $bin = sp_file_read((string)$m['file']);
    if ($bin === '') { http_response_code(410); exit; }
    $mime = in_array($m['file_mime'], ['image/jpeg', 'image/png', 'image/webp'], true) ? $m['file_mime'] : 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($bin));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    header("Content-Security-Policy: sandbox; default-src 'none'");
    echo $bin;
}
$GLOBALS['NM_GET']['sp.file'] = 'a_sp_file';

/* ---------------- Giriş yapamayanlar (oturumsuz) ---------------- */

function a_help_ask(): void
{
    if (s('website', 100) !== '') out(['ok' => true]); // bal küpü: botlar doldurur
    $ip = client_ip();
    sp_hit('ip:' . $ip, 5, 3600, 'Kısa sürede çok fazla talep gönderildi. Bir süre sonra yeniden deneyin.');
    $name = trim(s('name', 120));
    $email = mb_strtolower(trim(s('email', 190)));
    if (mb_strlen($name) < 3) fail('Adınızı ve soyadınızı yazın.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi yazın; yanıt oraya gelir.');
    sp_hit('em:' . hash('sha256', $email), 3, 3600, 'Bu e-postayla kısa sürede çok fazla talep gönderildi.');
    $body = sp_text(s('body', 3000));
    $hinted = !sp_m() || nm_tenant_hinted();
    [$tkey, $hid, $hosp, $unit] = $hinted ? sp_here() : ['', null, '', ''];
    $where = trim(s('unit', 160));
    if ($unit === '') $unit = $where !== '' ? $where : 'Belirtilmedi';
    elseif ($where !== '') $unit .= ' (yazdığı: ' . $where . ')';
    $tok = bin2hex(random_bytes(20));
    $route = sp_m() ? 'sa' : 'unit';
    global $IN;
    $ctx = [];
    if (is_array($IN['ctx'] ?? null)) foreach (['ua' => 300, 'screen' => 20, 'app' => 20, 'err' => 300] as $k => $n) if (isset($IN['ctx'][$k]) && is_scalar($IN['ctx'][$k])) $ctx[$k] = mb_substr((string)$IN['ctx'][$k], 0, $n);
    $ctx['v'] = NM_VERSION;
    $ctx['role'] = 'Giriş yapamayan kişi';
    $now = now();
    sp_q('INSERT INTO sp_tickets (tkey, hosp_id, hosp_name, unit_name, user_id, user_name, user_email, role, track, topic, route, subject, status, ctx, token_hash, un_sa, un_unit, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$tkey, $hid, $hosp, $unit, $name, $email, '', 'public', 'giris', $route, 'Giriş yapamıyorum', 'open', json_encode($ctx, JSON_UNESCAPED_UNICODE), hash('sha256', $tok),
            $route === 'sa' ? 1 : 0, $route === 'unit' ? 1 : 0, $now, $now]);
    $id = sp_id();
    sp_add_msg($id, 'user', $name, $body);
    $url = (sp_m() && function_exists('ap_site') ? ap_site() : base_url()) . '#/destek/izle/' . $tok;
    if ($route === 'sa') {
        sp_mail_sa('Giriş yapamayan kişiden destek talebi', [$name . ' · ' . $email, 'Birim: ' . ($hosp !== '' ? $hosp . ' › ' : '') . $unit, mb_substr($body, 0, 400)]);
        if (function_exists('ap_mail')) ap_mail([['name' => $name, 'email' => $email]], 'Destek talebiniz alındı', 'Destek talebiniz alındı', ['Talebiniz destek ekibine ulaştı. Yanıt geldiğinde bu adrese e-posta gönderilir.', 'Talebinizi ve yanıtları aşağıdaki bağlantıdan izleyebilirsiniz; bağlantıyı kimseyle paylaşmayın.'], 'Talebimi izle', $url);
    } else {
        sp_notify_handlers(sp_one('SELECT * FROM sp_tickets WHERE id = ?', [$id]), 'Giriş yapamayan kişiden destek talebi', $name . ' · ' . $email);
        if (mail_ready()) mail_queue_to([['name' => $name, 'email' => $email]], 'Destek talebiniz alındı', 'Destek talebiniz alındı', ['Talebiniz birim yöneticisine ulaştı. Yanıt geldiğinde bu adrese e-posta gönderilir.'], 'Talebimi izle', $url, 'support', false);
    }
    out(['ok' => true, 'token' => $tok]);
}

function sp_by_token(): array
{
    $tok = s('token', 80);
    if (!preg_match('/^[a-f0-9]{40}$/', $tok)) fail('Bağlantı geçersiz.', 404);
    sp_hit('tk:' . client_ip(), 60, 600, 'Çok fazla deneme. Bir süre sonra yeniden deneyin.');
    return sp_one('SELECT * FROM sp_tickets WHERE token_hash = ?', [hash('sha256', $tok)]) ?? fail('Talep bulunamadı ya da süresi doldu.', 404);
}
function a_help_get(): void
{
    $t = sp_by_token();
    if ((int)$t['un_user'] === 1) sp_q('UPDATE sp_tickets SET un_user = 0 WHERE id = ?', [$t['id']]);
    out(['ticket' => sp_out($t), 'msgs' => sp_msgs_out((int)$t['id'], false)]);
}
function a_help_reply(): void
{
    $t = sp_by_token();
    sp_hit('tr:' . $t['id'], 10, 3600, 'Kısa sürede çok fazla yanıt gönderildi.');
    $body = sp_text(s('body', 3000), 1);
    sp_add_msg((int)$t['id'], 'user', $t['user_name'], $body);
    sp_q("UPDATE sp_tickets SET status = 'open', closed_at = NULL, un_sa = ?, un_unit = ?, updated_at = ? WHERE id = ?", [$t['route'] === 'sa' ? 1 : 0, $t['route'] === 'unit' ? 1 : 0, now(), $t['id']]);
    if ($t['route'] === 'sa') sp_mail_sa('Destek talebine yanıt: ' . $t['subject'], [$t['user_name'] . ' · ' . $t['user_email'], mb_substr($body, 0, 400)]);
    out(['ok' => true]);
}

/* ---------------- Sistem yöneticisi ---------------- */

function sp_sa_count(): int
{
    if (!sp_m()) return 0;
    try { return (int)sp_val("SELECT COUNT(*) FROM sp_tickets WHERE route = 'sa' AND status = 'open'"); } catch (Throwable $e) { return 0; }
}

function a_sa_sp_list(): void
{
    need_sa();
    if (!sp_m()) fail('Yok.', 404);
    try { if (m_setting('sp_gc') !== date('Y-m-d')) { sp_gc(); m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('sp_gc', ?)", [date('Y-m-d')]); } } catch (Throwable $e) { error_log('[dupcii] destek bakımı: ' . $e->getMessage()); }
    $w = []; $p = [];
    $st = s('status', 10);
    if ($st === 'open') $w[] = "route = 'sa' AND status = 'open'";
    elseif ($st === 'answered') $w[] = "route = 'sa' AND status = 'answered'";
    elseif ($st === 'closed') $w[] = "status = 'closed'";
    elseif ($st === 'unit') $w[] = "route = 'unit' AND status <> 'closed'";
    if (($h = (int)i('hosp')) > 0) { $w[] = 'hosp_id = ?'; $p[] = $h; }
    if (($k = s('tkey', 40)) !== '') { $w[] = 'tkey = ?'; $p[] = $k; }
    if (isset(SP_TRACKS[$tr = s('track', 8)])) { $w[] = 'track = ?'; $p[] = $tr; }
    if (($qq = trim(s('q', 80))) !== '') { $w[] = '(subject LIKE ? OR user_name LIKE ? OR user_email LIKE ? OR unit_name LIKE ?)'; $l = '%' . $qq . '%'; array_push($p, $l, $l, $l, $l); }
    $rows = sp_all('SELECT * FROM sp_tickets' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . ' ORDER BY un_sa DESC, CASE status WHEN \'open\' THEN 0 WHEN \'answered\' THEN 1 ELSE 2 END, updated_at DESC LIMIT 300', $p);
    $last = [];
    if ($rows) foreach (sp_all('SELECT ticket_id, body, who FROM sp_msgs WHERE id IN (SELECT MAX(id) FROM sp_msgs WHERE internal = 0 AND ticket_id IN (' . implode(',', array_map(fn($r) => (int)$r['id'], $rows)) . ') GROUP BY ticket_id)') as $m) $last[(int)$m['ticket_id']] = $m;
    $counts = [];
    foreach (sp_all("SELECT route, status, COUNT(*) AS n FROM sp_tickets GROUP BY route, status") as $r) $counts[$r['route'] . ':' . $r['status']] = (int)$r['n'];
    $hosp = [];
    foreach (nm_tenants() as $t) { $hid = (int)$t['hospital_id']; $hosp[$hid] ??= ['id' => $hid, 'name' => (string)$t['hospital_name'], 'tenants' => []]; $hosp[$hid]['tenants'][] = ['key' => $t['tkey'], 'name' => $t['name']]; }
    out(['items' => array_map(fn($t) => sp_out($t) + ['tkey' => $t['tkey'], 'last' => isset($last[(int)$t['id']]) ? ['who' => $last[(int)$t['id']]['who'], 'body' => mb_substr((string)$last[(int)$t['id']]['body'], 0, 140)] : null], $rows),
        'counts' => ['open' => $counts['sa:open'] ?? 0, 'answered' => $counts['sa:answered'] ?? 0, 'unit' => ($counts['unit:open'] ?? 0) + ($counts['unit:answered'] ?? 0)],
        'hospitals' => array_values($hosp), 'canned' => json_decode(m_setting('sp_canned', '[]'), true) ?: []]);
}

function a_sa_sp_get(): void
{
    need_sa();
    $t = sp_one('SELECT * FROM sp_tickets WHERE id = ?', [(int)i('id')]) ?? fail('Talep bulunamadı.', 404);
    if ((int)$t['un_sa'] === 1 && $t['route'] === 'sa') sp_q('UPDATE sp_tickets SET un_sa = 0 WHERE id = ?', [$t['id']]);
    $other = (int)sp_val('SELECT COUNT(*) FROM sp_tickets WHERE id <> ? AND ((user_id = ? AND tkey = ? AND user_id IS NOT NULL) OR (user_email = ? AND user_email <> \'\'))', [$t['id'], (int)$t['user_id'], $t['tkey'], $t['user_email']]);
    out(['ticket' => sp_out($t, true) + ['others' => $other], 'msgs' => sp_msgs_out((int)$t['id'], true)]);
}

/** Talebin birimine geç (yalnız bu istekte; birim veritabanı açılmadan) — kişiye bildirim için */
function sp_sa_enter_unit(array $t): bool
{
    if ($t['tkey'] === '' || !empty($GLOBALS['NM_DB_OPEN'])) return false;
    $tn = nm_tenant_by_key((string)$t['tkey']);
    if (!$tn || $tn['status'] !== 'active') return false;
    nm_tenant_use($tn);
    return true;
}

function a_sa_sp_reply(): void
{
    $sa = need_sa();
    $t = sp_one('SELECT * FROM sp_tickets WHERE id = ?', [(int)i('id')]) ?? fail('Talep bulunamadı.', 404);
    $internal = b('internal');
    $body = trim(str_replace("\r", '', s('body', 4000)));
    if ($body === '') fail('Yanıt yazın.');
    global $IN;
    [$file, $mime] = sp_file_take((string)($IN['file'] ?? ''));
    $now = now();
    sp_add_msg((int)$t['id'], 'sa', $internal ? (string)$sa['name'] : 'dupcii destek', $body, $internal, $file, $mime);
    if ($internal) out(['ok' => true]);
    $close = b('close');
    sp_q("UPDATE sp_tickets SET route = 'sa', status = ?, closed_at = ?, un_user = 1, un_sa = 0, replied = 1, updated_at = ? WHERE id = ?", [$close ? 'closed' : 'answered', $close ? $now : null, $now, $t['id']]);
    sa_audit($sa, 'support.reply', '#' . $t['id'] . ' ' . $t['subject'], $t['unit_name']);
    if ($t['track'] === 'public') {
        $url = ap_site();
        if (function_exists('ap_mail')) ap_mail([['name' => $t['user_name'], 'email' => $t['user_email']]], 'Destek talebinize yanıt geldi', 'Destek talebinize yanıt geldi',
            [mb_substr($body, 0, 1500), 'Yanıtlamak için e-postanızdaki ilk bağlantıyı kullanın (talebinizi izleme bağlantısı).'], 'Siteyi aç', $url);
    } elseif (sp_sa_enter_unit($t)) sp_notify_user($t, 'Destek talebinize yanıt geldi', 'dupcii destek: ' . mb_substr($body, 0, 140));
    out(['ok' => true]);
}

function a_sa_sp_set(): void
{
    $sa = need_sa();
    $t = sp_one('SELECT * FROM sp_tickets WHERE id = ?', [(int)i('id')]) ?? fail('Talep bulunamadı.', 404);
    $act = s('act', 10);
    $now = now();
    if ($act === 'close') {
        sp_add_msg((int)$t['id'], 'sys', '', 'Destek ekibi talebi kapattı.');
        sp_q("UPDATE sp_tickets SET status = 'closed', closed_at = ?, un_sa = 0, updated_at = ? WHERE id = ?", [$now, $now, $t['id']]);
    } elseif ($act === 'reopen') {
        sp_q("UPDATE sp_tickets SET status = 'open', closed_at = NULL, updated_at = ? WHERE id = ?", [$now, $t['id']]);
    } elseif ($act === 'unit') {
        // Birim konusu: birim sorumlusuna aktar (yalnız kullanıcı talepleri)
        if ($t['track'] !== 'user' || $t['tkey'] === '') fail('Yalnız birimdeki kullanıcıların talepleri birime aktarılabilir.');
        $note = trim(s('note', 1000));
        sp_add_msg((int)$t['id'], 'sys', '', 'Destek ekibi talebi birim sorumlusuna aktardı.');
        if ($note !== '') sp_add_msg((int)$t['id'], 'sa', 'dupcii destek', $note);
        sp_q("UPDATE sp_tickets SET route = 'unit', forwarded = 0, status = 'open', closed_at = NULL, un_sa = 0, un_unit = 1, updated_at = ? WHERE id = ?", [$now, $t['id']]);
        if (sp_sa_enter_unit($t)) {
            sp_notify_handlers($t, 'Destek talebi size aktarıldı: ' . $t['subject'], $t['user_name'] . ' · destek ekibi birim konusu olarak aktardı');
            sp_notify_user($t, 'Talebiniz birim sorumlunuza aktarıldı', $t['subject']);
        }
    } elseif ($act === 'delete') {
        sp_delete((int)$t['id']);
    } else fail('Geçersiz işlem.');
    sa_audit($sa, 'support.' . $act, '#' . $t['id'] . ' ' . $t['subject'], $t['unit_name']);
    out(['ok' => true]);
}

function a_sa_sp_canned(): void
{
    $sa = need_sa();
    global $IN;
    $list = [];
    foreach ((array)($IN['items'] ?? []) as $x) {
        if (!is_array($x)) continue;
        $tt = mb_substr(trim((string)($x['t'] ?? '')), 0, 80); $bb = mb_substr(trim((string)($x['b'] ?? '')), 0, 2000);
        if ($tt !== '' && $bb !== '') $list[] = ['t' => $tt, 'b' => $bb];
        if (count($list) >= 40) break;
    }
    m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('sp_canned', ?)", [json_encode($list, JSON_UNESCAPED_UNICODE)]);
    sa_audit($sa, 'support.canned', count($list) . ' hazır yanıt');
    out(['canned' => $list]);
}

/* ---------------- Açılış verisi ve bakım ---------------- */

$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (!empty($me['sa_virtual'])) return [];
    try {
        $tk = sp_here()[0];
        $mine = (int)sp_val('SELECT COUNT(*) FROM sp_tickets WHERE user_id = ? AND tkey = ? AND un_user = 1', [(int)$me['id'], $tk]);
        $inbox = 0;
        if (sp_unit_handler($me)) {
            foreach (sp_all("SELECT * FROM sp_tickets WHERE tkey = ? AND route = 'unit' AND un_unit = 1", [$tk]) as $t) if (sp_can_handle($me, $t)) $inbox++;
        }
        return ['support' => ['mine' => $mine, 'inbox' => $inbox, 'handler' => sp_unit_handler($me)]];
    } catch (Throwable $e) { error_log('[dupcii] destek açılış: ' . $e->getMessage()); return ['support' => ['mine' => 0, 'inbox' => 0, 'handler' => false]]; }
};
$GLOBALS['NM_JOBS']['support_gc'] = function (bool $force): void {
    if (sp_m()) { if (m_setting('sp_gc') === date('Y-m-d') && !$force) return; sp_gc(); m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('sp_gc', ?)", [date('Y-m-d')]); }
    else { if (setting('sp_gc', '') === date('Y-m-d') && !$force) return; sp_gc(); set_setting('sp_gc', date('Y-m-d')); }
};

return [
    'sp.cfg' => 'a_sp_cfg',
    'sp.mine' => 'a_sp_mine',
    'sp.inbox' => 'a_sp_inbox',
    'sp.get' => 'a_sp_get',
    'sp.create' => 'a_sp_create',
    'sp.reply' => 'a_sp_reply',
    'sp.close' => 'a_sp_close',
    'sp.rate' => 'a_sp_rate',
    'sp.forward' => 'a_sp_forward',
    'help.ask' => 'a_help_ask',
    'help.get' => 'a_help_get',
    'help.reply' => 'a_help_reply',
    'sa.sp.list' => 'a_sa_sp_list',
    'sa.sp.get' => 'a_sa_sp_get',
    'sa.sp.reply' => 'a_sa_sp_reply',
    'sa.sp.set' => 'a_sa_sp_set',
    'sa.sp.canned' => 'a_sa_sp_canned',
];
