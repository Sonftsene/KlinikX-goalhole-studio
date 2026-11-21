<?php
/**
 * Telefon takvimine abonelik (4.25): kişiye özel gizli bağlantı (iCalendar). iPhone / Mac Takvim, Google Takvim ve Outlook bu adresi
 * kendiliğinden yeniden okur: nöbet listesi güncellendikçe telefondaki takvim de güncellenir (silinen / değişen nöbetler düşer).
 *  - Bağlantı: api.php?action=cal.feed&t=<kişi>-<rastgele>[&b=<birim>]; oturum gerekmez, anahtar gizlidir.
 *    Anahtar settings 'cal_<kişi>' içinde; "Bağlantıyı yenile" eskisini geçersiz kılar, "Kapat" siler.
 *  - İçerik Takvimim ile aynıdır (shifts_for_user): geçen ayın başından 4 ay ileriye, yalnız nöbetler; her nöbetin UID'si sabittir.
 */
declare(strict_types=1);

function cal_url(int $uid, string $rand): string
{
    return base_url() . 'api.php?action=cal.feed&t=' . $uid . '-' . $rand . nm_link_param();
}
function cal_out(array $me, ?string $rand): array
{
    if ($rand === null) return ['on' => false];
    $u = cal_url((int)$me['id'], $rand);
    $web = preg_replace('#^https?://#', 'webcal://', $u);
    return ['on' => true, 'url' => $u, 'webcal' => $web,
        'google' => 'https://calendar.google.com/calendar/render?cid=' . rawurlencode($web),
        'outlook' => 'https://outlook.live.com/calendar/0/addfromweb?url=' . rawurlencode($u) . '&name=' . rawurlencode('Nöbetlerim'),
        'https' => str_starts_with($u, 'https://')];
}

/** Bağlantı: act '' göster, 'make' yoksa oluştur, 'reset' yenisini üret (eskisi çalışmaz), 'off' kapat */
function a_cal_link(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisinin takvimi yok.', 403);
    if (!nm_mod_on('nobet')) fail('Nöbet listeleri bu birimde kapalı.', 403);
    $act = s('act', 10);
    $k = 'cal_' . (int)$me['id'];
    $tok = (string)setting($k, '');
    if ($act === 'off') {
        q('DELETE FROM settings WHERE k = ?', [$k]); setting('', '', true);
        audit($me, 'cal.off', 'Takvim aboneliği kapatıldı');
        out(cal_out($me, null));
    }
    if ($act === 'reset' || ($act === 'make' && !preg_match('/^[a-f0-9]{40}$/', $tok))) {
        $had = $tok !== '';
        $tok = bin2hex(random_bytes(20));
        set_setting($k, $tok);
        audit($me, $had ? 'cal.reset' : 'cal.on', $had ? 'Takvim bağlantısı yenilendi' : 'Takvim aboneliği açıldı');
    }
    out(cal_out($me, preg_match('/^[a-f0-9]{40}$/', $tok) ? $tok : null) + ['seen' => (int)setting('cal_seen_' . (int)$me['id'], '0')]);
}

/** iCalendar metni */
function cal_ics(array $u): string
{
    $esc = fn($t) => str_replace(["\\", ',', ';', "\r\n", "\n"], ['\\\\', '\\,', '\\;', '\\n', '\\n'], (string)$t);
    $fold = function (string $line): string {
        // RFC 5545: 75 bayttan uzun satırlar katlanır (UTF-8 karakter bölünmeden)
        $out = ''; $cur = '';
        foreach (preg_split('//u', $line, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
            if (strlen($cur . $ch) > 73) { $out .= $cur . "\r\n "; $cur = ''; }
            $cur .= $ch;
        }
        return $out . $cur;
    };
    $from = date('Y-m-d', strtotime('first day of last month'));
    $to = date('Y-m-d', strtotime('+120 days'));
    $host = parse_url(base_url(), PHP_URL_HOST) ?: 'dupcii';
    $stamp = gmdate('Ymd\THis\Z');
    $org = (string)setting('org_name', 'dupcii');
    $L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//dupcii//Nöbet takvimi//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:' . $esc('Nöbetlerim · ' . $org), 'X-WR-TIMEZONE:Europe/Istanbul', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
        'BEGIN:VTIMEZONE', 'TZID:Europe/Istanbul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'TZNAME:+03', 'END:STANDARD', 'END:VTIMEZONE'];
    foreach (shifts_for_user($u, $from, $to) as $r) {
        if (($r['kind'] ?? 'shift') !== 'shift') continue;
        $st = $r['start_time'] ?: '08:00'; $en = $r['end_time'] ?: '16:00';
        // 24:00 gibi saatler de olur (08-24, 24-08): zaman damgasıyla hesapla
        $t0 = strtotime($r['date'] . ' ' . $st); $t1 = strtotime($r['date'] . ' ' . $en);
        if ($t1 <= $t0) $t1 += 86400;
        $label = $r['label'] && $r['label'] !== $r['code'] ? ' – ' . $r['label'] : '';
        $uid = 'dupcii-' . (int)$u['id'] . '-' . (int)$r['roster_id'] . '-' . $r['date'] . '-' . preg_replace('/[^A-Za-z0-9]/', '', (string)$r['code']) . '@' . $host;
        $L[] = 'BEGIN:VEVENT';
        $L[] = 'UID:' . $uid;
        $L[] = 'DTSTAMP:' . $stamp;
        $L[] = 'DTSTART;TZID=Europe/Istanbul:' . date('Ymd\THis', $t0);
        $L[] = 'DTEND;TZID=Europe/Istanbul:' . date('Ymd\THis', $t1);
        $L[] = 'SUMMARY:' . $esc($r['code'] . ' nöbet' . $label);
        $L[] = 'DESCRIPTION:' . $esc(($r['roster_name'] ?? '') . ' · ' . $org);
        $L[] = 'TRANSP:OPAQUE';
        $L[] = 'END:VEVENT';
    }
    $L[] = 'END:VCALENDAR';
    return implode("\r\n", array_map($fold, $L)) . "\r\n";
}

/** Takvim uygulamasının okuduğu adres (GET, oturumsuz) */
function a_cal_feed(): void
{
    $t = (string)($_GET['t'] ?? '');
    $u = null;
    if (preg_match('/^(\d{1,9})-([a-f0-9]{40})$/', $t, $m) && nm_mod_on('nobet') && !(nm_multi() && nm_tenant_frozen())) {
        $h = (string)setting('cal_' . (int)$m[1], '');
        if ($h !== '' && hash_equals($h, $m[2])) $u = one("SELECT * FROM users WHERE id = ? AND status = 'active'", [(int)$m[1]]);
    }
    if (!$u) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Takvim bulunamadı ya da bağlantı yenilendi.'; exit; }
    $ics = cal_ics($u);
    // Takvim uygulaması en son ne zaman okudu (kişiye "bağlı" bilgisi için; günde bir yazılır)
    if ((int)setting('cal_seen_' . (int)$u['id'], '0') < time() - 3600) set_setting('cal_seen_' . (int)$u['id'], (string)time());
    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: inline; filename="nobetlerim.ics"');
    header('Cache-Control: private, max-age=900');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    echo $ics;
}
$GLOBALS['NM_GET']['cal.feed'] = 'a_cal_feed';

return [
    'cal.link' => 'a_cal_link',
];
