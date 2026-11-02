<?php
/**
 * NöbetMed — e-posta bildirimleri
 * E-postalar kuyruğa yazılır, sayfa yanıtı gönderildikten sonra arka planda yollanır.
 * SMTP (ör. Hostinger: smtp.hostinger.com, 465, SSL) veya PHP mail() kullanılır.
 */
declare(strict_types=1);

const MAIL_EVENTS = [
    'notify_post' => 'Yeni duyuru / içerik yayınlandığında (ilgili birimdeki herkese)',
    'notify_roster' => 'Nöbet listesi güncellendiğinde (herkese)',
    'notify_pending_post' => 'Onay bekleyen içerik gönderildiğinde (yönetici ve yayıncılara)',
    'notify_pending_user' => 'Yeni üyelik başvurusu geldiğinde (yöneticilere)',
    'notify_user_approved' => 'Üyelik onaylandığında (başvuran kişiye)',
];

function mail_ready(): bool
{
    return setting('mail_on') === '1' && filter_var(setting('mail_from'), FILTER_VALIDATE_EMAIL) !== false;
}

function mail_event_on(string $event): bool
{
    return mail_ready() && setting($event, '1') === '1';
}

/* ---------------- Şablon ---------------- */

function mail_template(string $title, array $lines, ?string $button = null, ?string $url = null): array
{
    $org = setting('org_name', 'Klinik Portalı');
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $body = '';
    foreach ($lines as $l) $body .= '<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#24343b">' . nl2br($e($l)) . '</p>';
    $btn = $button && $url
        ? '<p style="margin:22px 0 6px"><a href="' . $e($url) . '" style="display:inline-block;background:#0b7a75;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">' . $e($button) . '</a></p>'
        : '';
    $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
        . '<body style="margin:0;background:#f2f5f6;font-family:Segoe UI,Arial,sans-serif">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f6;padding:24px 12px"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e1e8ea">'
        . '<tr><td style="padding:18px 24px;border-bottom:1px solid #e9eef0"><b style="font-size:15px;color:#0b7a75">NöbetMed</b> <span style="font-size:13px;color:#6b7c84">· ' . $e($org) . '</span></td></tr>'
        . '<tr><td style="padding:24px"><h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;color:#0f1b21">' . $e($title) . '</h1>' . $body . $btn . '</td></tr>'
        . '<tr><td style="padding:14px 24px;border-top:1px solid #e9eef0;font-size:12px;color:#8a989f">Bu e-posta ' . $e($org) . ' portalından otomatik gönderildi. Bildirim tercihlerinizi portaldaki Hesabım sayfasından değiştirebilirsiniz.</td></tr>'
        . '</table></td></tr></table></body></html>';
    $text = $title . "\n\n" . implode("\n\n", $lines) . ($button && $url ? "\n\n$button: $url" : '') . "\n\n— " . $org;
    return [$html, $text];
}

/* ---------------- Kuyruk ---------------- */

function mail_queue_to(array $users, string $subject, string $title, array $lines, ?string $button, ?string $url, string $kind, bool $respectOptOut = true): int
{
    if (!mail_ready()) return 0;
    [$html, $text] = mail_template($title, $lines, $button, $url);
    $n = 0;
    $seen = [];
    foreach ($users as $u) {
        $email = mb_strtolower((string)$u['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || isset($seen[$email])) continue;
        if ($respectOptOut && isset($u['email_notify']) && (int)$u['email_notify'] === 0) continue;
        $seen[$email] = true;
        q('INSERT INTO mail_queue (to_email, to_name, subject, html, text_body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$email, (string)$u['name'], $subject, $html, $text, $kind, now()]);
        $n++;
    }
    if ($n) mail_flush_after_response();
    return $n;
}

function mail_flush_after_response(): void
{
    static $registered = false;
    if ($registered) return;
    $registered = true;
    register_shutdown_function(function () {
        // Kullanıcı beklemesin: yanıtı tamamla, e-postaları sonra gönder
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        @ignore_user_abort(true);
        @set_time_limit(120);
        try { mail_flush(40); } catch (Throwable $e) { error_log('[NobetMed] e-posta: ' . $e->getMessage()); }
    });
}

/** Bekleyen e-postaları gönderir (tek SMTP bağlantısıyla, en fazla $limit adet) */
function mail_flush(int $limit = 40): int
{
    if (!mail_ready()) return 0;
    $rows = all('SELECT * FROM mail_queue WHERE sent_at IS NULL AND attempts < 3 AND (locked_at IS NULL OR locked_at < ?) ORDER BY id LIMIT ' . (int)$limit, [time() - 300]);
    $mine = [];
    foreach ($rows as $r) {
        // Aynı anda çalışan başka bir istek aynı e-postayı göndermesin
        $st = q('UPDATE mail_queue SET locked_at = ? WHERE id = ? AND sent_at IS NULL AND (locked_at IS NULL OR locked_at < ?)', [time(), $r['id'], time() - 300]);
        if ($st->rowCount() === 1) $mine[] = $r;
    }
    if (!$mine) return 0;
    $results = mail_send_batch($mine);
    $ok = 0;
    foreach ($mine as $r) {
        $err = $results[$r['id']] ?? 'Bilinmeyen hata';
        if ($err === true) {
            q('UPDATE mail_queue SET sent_at = ?, error = NULL, locked_at = NULL WHERE id = ?', [now(), $r['id']]);
            $ok++;
        } else {
            q('UPDATE mail_queue SET attempts = attempts + 1, error = ?, locked_at = NULL WHERE id = ?', [mb_substr((string)$err, 0, 250), $r['id']]);
        }
    }
    // 30 günden eski kayıtları temizle
    q('DELETE FROM mail_queue WHERE created_at < ?', [date('Y-m-d H:i:s', time() - 30 * 86400)]);
    return $ok;
}

/* ---------------- Gönderim ---------------- */

function mail_encode_header(string $s): string
{
    return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

/** RFC 5322 ileti metni (başlıklar + gövde) */
function mail_build(array $m): array
{
    $from = setting('mail_from');
    $fromName = setting('mail_from_name', setting('org_name', 'NöbetMed'));
    $boundary = 'nm_' . bin2hex(random_bytes(8));
    $domain = substr(strrchr($from, '@') ?: '@nobetmed.local', 1);
    $headers = [
        'Date: ' . date('r'),
        'From: ' . mail_encode_header($fromName) . ' <' . $from . '>',
        'To: ' . mail_encode_header((string)$m['to_name']) . ' <' . $m['to_email'] . '>',
        'Subject: ' . mail_encode_header((string)$m['subject']),
        'Message-ID: <' . bin2hex(random_bytes(10)) . '@' . $domain . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        'X-Auto-Response-Suppress: All',
        'Auto-Submitted: auto-generated',
    ];
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode((string)$m['text_body']))
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode((string)$m['html']))
        . "--$boundary--\r\n";
    return [$headers, $body];
}

/** @return array<int, true|string> ileti kimliği => true veya hata metni */
function mail_send_batch(array $messages): array
{
    $host = trim(setting('mail_host'));
    if ($host === '') {
        $out = [];
        foreach ($messages as $m) {
            [$headers, $body] = mail_build($m);
            $h = array_values(array_filter($headers, fn($x) => !preg_match('/^(To|Subject):/i', $x)));
            $ok = @mail($m['to_email'], mail_encode_header((string)$m['subject']), $body, implode("\r\n", $h), '-f' . setting('mail_from'));
            $out[$m['id']] = $ok ? true : 'Sunucu mail() ile gönderemedi. SMTP ayarlarını girin.';
        }
        return $out;
    }
    $out = [];
    try {
        $smtp = smtp_open();
    } catch (Throwable $e) {
        foreach ($messages as $m) $out[$m['id']] = $e->getMessage();
        return $out;
    }
    foreach ($messages as $m) {
        try {
            smtp_send_one($smtp, $m);
            $out[$m['id']] = true;
        } catch (Throwable $e) {
            $out[$m['id']] = $e->getMessage();
            try { smtp_cmd($smtp, 'RSET', [250]); } catch (Throwable $e2) { break; }
        }
    }
    try { smtp_cmd($smtp, 'QUIT', [221]); } catch (Throwable $e) { /* */ }
    @fclose($smtp);
    foreach ($messages as $m) if (!isset($out[$m['id']])) $out[$m['id']] = 'Bağlantı koptu';
    return $out;
}

function smtp_read($fp): array
{
    $data = '';
    while (($line = fgets($fp, 1024)) !== false) {
        $data .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') break;
    }
    if ($data === '') throw new RuntimeException('SMTP sunucusu yanıt vermedi.');
    return [(int)substr($data, 0, 3), trim($data)];
}

function smtp_cmd($fp, string $cmd, array $expect): string
{
    fwrite($fp, $cmd . "\r\n");
    [$code, $text] = smtp_read($fp);
    if (!in_array($code, $expect, true)) {
        $shown = preg_match('/^(AUTH|[A-Za-z0-9+\/=]{8,}$)/', $cmd) ? 'AUTH' : explode(' ', $cmd)[0];
        throw new RuntimeException("SMTP hatası ($shown): " . mb_substr($text, 0, 180));
    }
    return $text;
}

function smtp_open()
{
    $host = trim(setting('mail_host'));
    $port = (int)setting('mail_port', '465');
    $secure = setting('mail_secure', 'ssl');
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
    $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new RuntimeException("SMTP sunucusuna bağlanılamadı ($host:$port): $errstr");
    stream_set_timeout($fp, 20);
    [$code, $text] = smtp_read($fp);
    if ($code !== 220) throw new RuntimeException('SMTP karşılama hatası: ' . mb_substr($text, 0, 160));
    $me = preg_replace('/[^A-Za-z0-9.-]/', '', $_SERVER['SERVER_NAME'] ?? 'localhost') ?: 'localhost';
    $ehlo = smtp_cmd($fp, "EHLO $me", [250]);
    if ($secure === 'tls') {
        smtp_cmd($fp, 'STARTTLS', [220]);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('TLS bağlantısı kurulamadı.');
        $ehlo = smtp_cmd($fp, "EHLO $me", [250]);
    }
    $user = setting('mail_user');
    if ($user !== '') {
        smtp_cmd($fp, 'AUTH LOGIN', [334]);
        smtp_cmd($fp, base64_encode($user), [334]);
        try {
            smtp_cmd($fp, base64_encode(setting('mail_pass')), [235]);
        } catch (Throwable $e) {
            throw new RuntimeException('SMTP kullanıcı adı veya şifresi hatalı.');
        }
    }
    return $fp;
}

function smtp_send_one($fp, array $m): void
{
    [$headers, $body] = mail_build($m);
    smtp_cmd($fp, 'MAIL FROM:<' . setting('mail_from') . '>', [250]);
    smtp_cmd($fp, 'RCPT TO:<' . $m['to_email'] . '>', [250, 251]);
    smtp_cmd($fp, 'DATA', [354]);
    $data = implode("\r\n", $headers) . "\r\n\r\n" . $body;
    $data = preg_replace('/(?<!\r)\n/', "\r\n", $data);
    $data = preg_replace('/^\./m', '..', $data); // nokta doldurma
    fwrite($fp, $data . "\r\n.\r\n");
    [$code, $text] = smtp_read($fp);
    if ($code !== 250) throw new RuntimeException('E-posta kabul edilmedi: ' . mb_substr($text, 0, 160));
}

/* ---------------- Olaylar ---------------- */

function active_users_sql(string $extra = ''): array
{
    return all("SELECT id, name, email, email_notify, role, unit_id FROM users WHERE status = 'active' $extra");
}

function notify_post_published(int $postId, int $exceptUserId): int
{
    if (!mail_event_on('notify_post')) return 0;
    $p = one('SELECT * FROM posts WHERE id = ?', [$postId]);
    if (!$p || $p['status'] !== 'published') return 0;
    $users = array_filter(active_users_sql(), fn($u) => (int)$u['id'] !== $exceptUserId && ($p['unit_id'] === null || (int)$u['unit_id'] === (int)$p['unit_id'] || in_array($u['role'], ['admin', 'editor'], true)));
    $author = one('SELECT name FROM users WHERE id = ?', [$p['author_id']]);
    $excerpt = mb_substr(preg_replace('/\s+/u', ' ', (string)$p['body']), 0, 400);
    $req = (int)$p['required'] === 1;
    return mail_queue_to($users,
        ($req ? 'Okumanız gereken: ' : 'Yeni duyuru: ') . $p['title'],
        $p['title'],
        array_filter([$req ? 'Bu içerik zorunlu okuma olarak işaretlendi. Okuduktan sonra portalda “Okudum, anladım” ile onaylayın.' : null, $excerpt, ($author['name'] ?? '') !== '' ? 'Paylaşan: ' . $author['name'] : null]),
        'Portalda aç', base_url() . '#/p/' . $postId, 'post');
}

function notify_roster_updated(array $roster, array $by): int
{
    if (!mail_event_on('notify_roster')) return 0;
    $users = array_filter(active_users_sql(), fn($u) => (int)$u['id'] !== (int)$by['id']);
    return mail_queue_to($users,
        'Nöbet listesi güncellendi: ' . $roster['name'],
        '“' . $roster['name'] . '” güncellendi',
        [$by['name'] . ' yeni nöbet listesini yükledi. Güncel listeyi portaldan görebilirsiniz; “Beni bul” düğmesi kendi nöbetlerinizi işaretler.'],
        'Nöbet listesini aç', base_url() . '#/nobet/' . (int)$roster['id'], 'roster');
}

function notify_pending_post(int $postId): int
{
    if (!mail_event_on('notify_pending_post')) return 0;
    $p = one('SELECT p.title, u.name FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = ?', [$postId]);
    if (!$p) return 0;
    return mail_queue_to(active_users_sql("AND role IN ('admin', 'editor')"),
        'Onay bekleyen içerik: ' . $p['title'],
        'Onayınızı bekleyen bir içerik var',
        [($p['name'] ?? 'Bir üye') . ' “' . $p['title'] . '” başlıklı bir içerik gönderdi. Onaylandığında ekibe yayınlanacak.'],
        'İncele ve onayla', base_url() . '#/yonetim/onaylar', 'pending_post');
}

function notify_pending_user(array $u): int
{
    if (!mail_event_on('notify_pending_user')) return 0;
    return mail_queue_to(active_users_sql("AND role = 'admin'"),
        'Yeni üyelik başvurusu: ' . $u['name'],
        'Yeni üyelik başvurusu',
        [$u['name'] . ' (' . $u['email'] . ') portala katılmak için başvurdu.'],
        'Başvuruyu incele', base_url() . '#/yonetim/kullanicilar', 'pending_user');
}

function notify_user_approved(array $u): int
{
    if (!mail_event_on('notify_user_approved')) return 0;
    return mail_queue_to([$u],
        'Üyeliğiniz onaylandı',
        'Hoş geldiniz, ' . $u['name'],
        ['Portal üyeliğiniz onaylandı. Kayıt olurken belirlediğiniz e-posta ve şifreyle giriş yapabilirsiniz.'],
        'Giriş yap', base_url(), 'approved', false);
}
