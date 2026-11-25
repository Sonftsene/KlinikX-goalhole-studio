<?php
/**
 * dupcii — e-posta bildirimleri
 * E-postalar kuyruğa yazılır, sayfa yanıtı gönderildikten sonra arka planda yollanır.
 * SMTP (ör. Hostinger: smtp.hostinger.com, 465, SSL) veya PHP mail() kullanılır.
 */
declare(strict_types=1);

const MAIL_EVENTS = [
    'notify_post' => 'Yeni duyuru / içerik yayımlandığında (ilgili birimdeki herkese)',
    'notify_roster' => 'Nöbet listesi güncellendiğinde (herkese)',
    'notify_pending_post' => 'Onay bekleyen içerik gönderildiğinde (yönetici ve sorumlulara)',
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

/** Olay bildirimi açık mı (e-posta ve telefon bildirimi için ortak) */
function event_on(string $event): bool
{
    return setting($event, '1') === '1';
}

/* ---------------- Şablon ---------------- */

/* ---------------- Tasarım (Ayarlar › Bildirimler › E-posta tasarımı) ---------------- */

const MAIL_STYLES = ['kurumsal', 'sade', 'modern', 'resmi', 'bant'];
/** Birimin e-posta tasarımı; $over verilirse (önizleme) kayıtlı tasarımın üzerine */
function mail_design(?array $over = null): array
{
    $j = $over ?? (json_decode((string)setting('mail_design', ''), true) ?: []);
    $j = is_array($j) ? $j : [];
    $acc = (string)($j['accent'] ?? '');
    return [
        'style' => in_array($j['style'] ?? '', MAIL_STYLES, true) ? $j['style'] : 'kurumsal',
        'accent' => preg_match('/^#[0-9a-fA-F]{6}$/', $acc) ? strtolower($acc) : '#0b7a75',
        'logo_w' => max(24, min(240, (int)($j['logo_w'] ?? 120))),
        'logo_align' => ($j['logo_align'] ?? '') === 'center' ? 'center' : 'left',
        'show_name' => !array_key_exists('show_name', $j) || !empty($j['show_name']),
        'footer' => mb_substr(trim((string)($j['footer'] ?? '')), 0, 300),
    ];
}
/** E-postadaki logo: önce e-posta logosu, yoksa site logosu (SVG değilse); tam adres */
function mail_logo_url(): ?string
{
    if (!function_exists('brand_url')) return null;
    $u = brand_url('mail_logo');
    if (!$u) { $f = (string)setting('brand_logo', ''); if ($f !== '' && !preg_match('/\.(svg|ico)$/i', $f)) $u = brand_url('logo'); }
    return $u ? base_url() . $u : null;
}
/** Açık renkli vurgu üzerinde yazı koyu olsun */
function mail_on_color(string $hex): string
{
    $r = hexdec(substr($hex, 1, 2)); $g = hexdec(substr($hex, 3, 2)); $b = hexdec(substr($hex, 5, 2));
    return (0.299 * $r + 0.587 * $g + 0.114 * $b) > 170 ? '#13233a' : '#ffffff';
}

function mail_template(string $title, array $lines, ?string $button = null, ?string $url = null, ?array $design = null): array
{
    $org = (string)($GLOBALS['NM_MAIL_ORG'] ?? setting('org_name', 'Klinik Portalı'));
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $d = mail_design($design);
    $st = $d['style']; $acc = $d['accent']; $on = mail_on_color($acc);
    $serif = $st === 'resmi';
    $font = $serif ? 'Georgia,Cambria,\'Times New Roman\',serif' : '-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
    $logoUrl = $design !== null && isset($design['_logo']) ? (string)$design['_logo'] : mail_logo_url();
    $align = $st === 'modern' || $st === 'resmi' ? 'center' : $d['logo_align'];
    $logo = $logoUrl
        ? '<img src="' . $e($logoUrl) . '" width="' . $d['logo_w'] . '" alt="' . $e($org) . '" style="display:' . ($align === 'center' ? 'block;margin:0 auto' : 'inline-block') . ';width:' . $d['logo_w'] . 'px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none">'
        : '<span style="display:inline-block;background:' . ($st === 'bant' ? '#ffffff' : $acc) . ';color:' . ($st === 'bant' ? $acc : $on) . ';border-radius:8px;padding:6px 12px;font-size:17px;font-weight:800;letter-spacing:-.02em">' . $e($org) . '</span>';
    $name = $d['show_name'] && $logoUrl ? '<div style="margin-top:' . ($align === 'center' ? '8' : '6') . 'px;font-size:' . ($serif ? '13px;letter-spacing:.12em;text-transform:uppercase' : '13px') . ';font-weight:600;color:' . ($st === 'bant' ? $on : '#5b6b77') . '">' . $e($org) . '</div>' : '';
    $txt = $serif ? '#2a2a2a' : '#24343b';
    $body = '';
    foreach ($lines as $l) $body .= '<p style="margin:0 0 12px;font-size:' . ($serif ? '16px' : '15px') . ';line-height:1.6;color:' . $txt . '">' . nl2br($e($l)) . '</p>';
    $rad = ['kurumsal' => '8px', 'sade' => '6px', 'modern' => '999px', 'resmi' => '2px', 'bant' => '8px'][$st];
    $btnBlock = $st === 'modern' ? 'display:block;text-align:center' : 'display:inline-block';
    $btn = $button && $url
        ? '<p style="margin:22px 0 6px"><a href="' . $e($url) . '" style="' . $btnBlock . ';background:' . $acc . ';color:' . $on . ';text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:' . $rad . '">' . $e($button) . '</a></p>'
        : '';
    $foot = ($d['footer'] !== '' ? nl2br($e($d['footer'])) . '<br>' : '') . 'Bu e-posta ' . $e($org) . ' portalından otomatik gönderildi. Bildirim tercihlerinizi portalda Hesabım › Bildirimler’den değiştirebilirsiniz.';
    $h1 = '<h1 style="margin:0 0 14px;font-family:' . $font . ';font-size:' . ($st === 'modern' ? '22px;text-align:center' : ($serif ? '21px' : '19px')) . ';line-height:1.35;font-weight:' . ($serif ? '700' : '800') . ';color:#0f1b21">' . $e($title) . '</h1>';
    $bg = ['kurumsal' => '#f2f5f6', 'sade' => '#ffffff', 'modern' => '#eef1f5', 'resmi' => '#f6f4ee', 'bant' => '#f2f5f6'][$st];
    $card = [
        'kurumsal' => 'background:#ffffff;border-radius:12px;border:1px solid #e1e8ea;border-top:4px solid ' . $acc,
        'sade' => 'background:#ffffff',
        'modern' => 'background:#ffffff;border-radius:18px;border:1px solid #e3e8ef',
        'resmi' => 'background:#ffffff;border:1px solid #d9d4c7',
        'bant' => 'background:#ffffff;border-radius:12px;border:1px solid #e1e8ea;overflow:hidden',
    ][$st];
    $headStyle = [
        'kurumsal' => 'padding:20px 28px;border-bottom:1px solid #e9eef0;text-align:' . $align,
        'sade' => 'padding:8px 4px 18px;border-bottom:1px solid #e5e7eb;text-align:' . $align,
        'modern' => 'padding:30px 28px 6px;text-align:center',
        'resmi' => 'padding:26px 28px 18px;text-align:center;border-bottom:3px double ' . $acc,
        'bant' => 'padding:22px 28px;background:' . $acc . ';text-align:' . $align,
    ][$st];
    $logoWrap = $st === 'bant' && $logoUrl ? '<span style="display:inline-block;background:#ffffff;border-radius:10px;padding:8px 12px">' . $logo . '</span>' : $logo;
    $pad = $st === 'sade' ? '22px 4px' : '26px 28px';
    $footStyle = $st === 'sade' ? 'padding:16px 4px;border-top:1px solid #e5e7eb' : ($st === 'resmi' ? 'padding:16px 28px;border-top:1px solid #e6e1d4;font-style:italic' : 'padding:16px 28px;border-top:1px solid #e9eef0');
    $html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>'
        . '<body style="margin:0;padding:0;background:' . $bg . ';font-family:' . $font . '">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . $bg . ';padding:28px 12px"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;' . $card . '">'
        . '<tr><td style="' . $headStyle . '">' . $logoWrap . $name . '</td></tr>'
        . '<tr><td style="padding:' . $pad . ';font-family:' . $font . '">' . $h1 . $body . $btn . '</td></tr>'
        . '<tr><td style="' . $footStyle . ';font-size:12px;line-height:1.5;color:#8a989f;font-family:' . $font . '">' . $foot . '</td></tr>'
        . '</table></td></tr></table></body></html>';
    $text = $title . "\n\n" . implode("\n\n", $lines) . ($button && $url ? "\n\n$button: $url" : '') . "\n\n— " . $org . ($d['footer'] !== '' ? "\n" . $d['footer'] : '');
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
        if ($respectOptOut && ((isset($u['notify_mode']) && $u['notify_mode'] !== 'instant') || (isset($u['email_notify']) && (int)$u['email_notify'] === 0))) continue;
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
        nm_after_response();
        try { mail_flush(40); } catch (Throwable $e) { error_log('[dupcii] e-posta: ' . $e->getMessage()); }
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
            if (in_array((string)($r['kind'] ?? ''), ['credentials', 'reset', 'invite'], true)) q("UPDATE mail_queue SET html = '', text_body = '' WHERE id = ?", [$r['id']]);
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

function mail_encode_header(string $s, int $indent = 9): string
{
    $s = str_replace(["\r", "\n"], ' ', $s);
    if (!preg_match('/[^\x20-\x7e]/', $s)) return $s;
    // Uzun Türkçe başlıklar RFC 2047'ye göre satırlara bölünür
    return mb_encode_mimeheader($s, 'UTF-8', 'B', "\r\n", $indent);
}
/** Gönderen/alıcı adı: ASCII ise tırnak içinde (virgül vb. adresi bozmasın), değilse kodlanmış */
function mail_phrase(string $n, int $indent): string
{
    $n = trim(str_replace(["\r", "\n", '<', '>'], ' ', $n));
    if ($n === '') return '';
    // Ad bütünüyle tek kodlanmış sözcük olur (içindeki virgül adres listesini bölmesin)
    return preg_match('/[^\x20-\x7e]/', $n) ? '=?UTF-8?B?' . base64_encode(mb_substr($n, 0, 40)) . '?=' : '"' . addcslashes($n, '"\\') . '"';
}

/** RFC 5322 ileti metni (başlıklar + gövde) */
function mail_build(array $m): array
{
    $from = setting('mail_from');
    $fromName = setting('mail_from_name', setting('org_name', 'dupcii'));
    $boundary = 'nm_' . bin2hex(random_bytes(8));
    $domain = substr(strrchr($from, '@') ?: '@nobetmed.local', 1);
    $headers = [
        'Date: ' . date('r'),
        'From: ' . mail_phrase($fromName, 6) . ' <' . $from . '>',
        'To: ' . mail_phrase((string)$m['to_name'], 4) . ' <' . $m['to_email'] . '>',
        'Subject: ' . mail_encode_header((string)$m['subject'], 9),
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
    // Ek dosya (ör. şifreli yedek): multipart/mixed içine sarılır
    if (!empty($m['attach']) && is_array($m['attach'])) {
        $mixed = 'nm_' . bin2hex(random_bytes(8));
        foreach ($headers as $i => $h) if (str_starts_with($h, 'Content-Type: multipart/alternative')) $headers[$i] = 'Content-Type: multipart/mixed; boundary="' . $mixed . '"';
        $out = "--$mixed\r\nContent-Type: multipart/alternative; boundary=\"$boundary\"\r\n\r\n" . $body;
        foreach ($m['attach'] as $a) {
            $data = isset($a['path']) ? (string)@file_get_contents((string)$a['path']) : (string)($a['data'] ?? '');
            $fn = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)($a['name'] ?? 'ek.bin'));
            $out .= "--$mixed\r\nContent-Type: " . ($a['mime'] ?? 'application/octet-stream') . "; name=\"$fn\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$fn\"\r\n\r\n"
                . chunk_split(base64_encode($data));
        }
        $body = $out . "--$mixed--\r\n";
    }
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
    // Çok birimlide denetim; site sahibi sunucu içi SMTP rölesi kullanacaksa data/.smtp-yerel dosyasını koyar (yalnız dosya erişimiyle)
    $multi = function_exists('nm_multi') && nm_multi() && !is_file(NM_ROOT . '/data/.smtp-yerel');
    $target = $host;
    if ($multi) {
        // Birim yöneticisi sunucunun iç ağını (127.0.0.1, 10.x, 169.254.x …) tarayamasın: yalnız SMTP portları ve genel adresler
        if (!in_array($port, [25, 465, 587, 2525], true)) throw new RuntimeException('SMTP portu 465, 587, 25 ya da 2525 olmalıdır.');
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) throw new RuntimeException('SMTP sunucusu bulunamadı ya da izin verilmeyen bir adres.');
        $target = $ip; // ad bir kez çözülür (ikinci çözümde iç adrese dönemesin)
    }
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
    $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $target . ':' . $port;
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new RuntimeException("SMTP sunucusuna bağlanılamadı ($host:$port)" . ($multi ? '.' : ": $errstr"));
    stream_set_timeout($fp, 20);
    [$code, $text] = smtp_read($fp);
    if ($code !== 220) throw new RuntimeException('SMTP karşılama hatası' . ($multi ? ' (sunucu bir e-posta sunucusu gibi yanıt vermedi).' : ': ' . mb_substr($text, 0, 160)));
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
/* Her olay: uygulama içi bildirim + telefon bildirimi + (tercihe göre) e-posta. Bkz. inc/notify.php */

function active_users_sql(string $extra = ''): array
{
    return all("SELECT id, name, email, email_notify, notify_mode, push_on, role, role_id, unit_id FROM users WHERE status = 'active' $extra");
}

/**
 * Modülü yönetenler (bildirim alıcıları): yöneticiler + rolüne göre o modülde "Yönetir" olanlar.
 * Modül verilmezse (veya izin sistemi yoksa) yöneticiler ve yayıncılar.
 */
function module_managers(?string $m = null): array
{
    $m = $m ?? ($GLOBALS['NM_MOD'] ?? null);
    return array_values(array_filter(active_users_sql(), fn($u) => $u['role'] === 'admin'
        || ($m !== null && function_exists('user_perm') ? user_perm($u, $m) === 'manage' : $u['role'] === 'editor')));
}

function notify_post_published(int $postId, int $exceptUserId): int
{
    if (!event_on('notify_post')) return 0;
    $p = one('SELECT * FROM posts WHERE id = ?', [$postId]);
    if (!$p || $p['status'] !== 'published') return 0;
    $users = array_filter(active_users_sql(), fn($u) => (int)$u['id'] !== $exceptUserId && ($p['unit_id'] === null || (int)$u['unit_id'] === (int)$p['unit_id'] || in_array($u['role'], ['admin', 'editor'], true)));
    $author = one('SELECT name FROM users WHERE id = ?', [$p['author_id']]);
    $excerpt = mb_substr(preg_replace('/\s+/u', ' ', (string)$p['body']), 0, 400);
    $req = (int)$p['required'] === 1;
    return notify_users($users, 'post', ($req ? 'Okunacak: ' : 'Yeni duyuru: ') . $p['title'], mb_substr($excerpt, 0, 160), '#/p/' . $postId, [
        'subject' => ($req ? 'Okunacak: ' : 'Yeni duyuru: ') . $p['title'],
        'heading' => $p['title'],
        'lines' => array_values(array_filter([$req ? 'Bu içerik zorunlu okuma olarak işaretlendi. Okuduktan sonra portalda “Okudum, anladım” ile onaylayın.' : null, $excerpt, ($author['name'] ?? '') !== '' ? 'Paylaşan: ' . $author['name'] : null])),
        'button' => 'Portalda aç',
    ]);
}

function notify_roster_updated(array $roster, array $by): int
{
    if (!event_on('notify_roster')) return 0;
    $users = array_filter(active_users_sql(), fn($u) => (int)$u['id'] !== (int)$by['id']);
    return notify_users($users, 'roster', 'Nöbet listesi güncellendi: ' . $roster['name'], $by['name'] . ' yeni listeyi yükledi.', '#/nobet/' . (int)$roster['id'], [
        'subject' => 'Nöbet listesi güncellendi: ' . $roster['name'],
        'heading' => '“' . $roster['name'] . '” güncellendi',
        'lines' => [$by['name'] . ' yeni nöbet listesini yükledi. Güncel listeyi portaldan görebilirsiniz; “Beni bul” düğmesi kendi nöbetlerinizi işaretler.'],
        'button' => 'Nöbet listesini aç',
    ]);
}

function notify_pending_post(int $postId): int
{
    if (!event_on('notify_pending_post')) return 0;
    $p = one('SELECT p.title, u.name FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = ?', [$postId]);
    if (!$p) return 0;
    return notify_users(active_users_sql("AND role IN ('admin', 'editor')"), 'pending_post', 'Onay bekleyen içerik: ' . $p['title'], ($p['name'] ?? 'Bir üye') . ' gönderdi.', '#/yonetim/onaylar', [
        'subject' => 'Onay bekleyen içerik: ' . $p['title'],
        'heading' => 'Onayınızı bekleyen bir içerik var',
        'lines' => [($p['name'] ?? 'Bir üye') . ' “' . $p['title'] . '” başlıklı bir içerik gönderdi. Onaylandığında ekibe yayımlanacak.'],
        'button' => 'İncele ve onayla',
    ]);
}

function notify_pending_user(array $u): int
{
    if (!event_on('notify_pending_user')) return 0;
    return notify_users(active_users_sql("AND role = 'admin'"), 'pending_user', 'Yeni üyelik başvurusu: ' . $u['name'], $u['email'], '#/yonetim/kullanicilar', [
        'subject' => 'Yeni üyelik başvurusu: ' . $u['name'],
        'heading' => 'Yeni üyelik başvurusu',
        'lines' => [$u['name'] . ' (' . $u['email'] . ') portala katılmak için başvurdu.'],
        'button' => 'Başvuruyu incele',
    ]);
}

function notify_user_approved(array $u): int
{
    if (!event_on('notify_user_approved')) return 0;
    return mail_queue_to([$u],
        'Üyeliğiniz onaylandı',
        'Hoş geldiniz, ' . $u['name'],
        [empty($u['password_hash']) && !empty($u['google_sub']) ? 'Portal üyeliğiniz onaylandı. “Google ile giriş” düğmesiyle giriş yapabilirsiniz.' : 'Portal üyeliğiniz onaylandı. Kayıt olurken belirlediğiniz e-posta ve şifreyle giriş yapabilirsiniz.'],
        'Giriş yap', base_url(), 'approved', false);
}
