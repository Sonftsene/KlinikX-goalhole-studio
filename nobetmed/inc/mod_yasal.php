<?php
/**
 * Tanıtım sayfası, yasal sayfalar ve KVKK kişi hakları (4.17).
 *
 *  - Künye (unvan, adres, vergi, iletişim) ve yasal metinler: çok birimli kurulumda sistem yöneticisi (merkez, m_settings 'lg_*'),
 *    tek birimli kurulumda birim yöneticisi (settings 'lg_*') düzenler. Metin boşsa inc/legal_tpl.php taslağı kullanılır.
 *  - Herkese açık sayfalar: tanitim.php (tanıtım), yasal.php?s=kvkk|gizlilik|kosullar|satis|iade. "Yayımla" kapalıyken 404.
 *  - Aydınlatma metni bildirimi: açıksa her kullanıcı metin değiştiğinde bir kez "Okudum" der (users.kvkk_ack = sürüm|tarih).
 *  - Hesabım › Verilerim: kişinin kendi verisinin JSON kopyası (me.export) ve hesap silme talebi (users.del_req; yönetici siler).
 */
declare(strict_types=1);
require_once __DIR__ . '/legal_tpl.php';

const LG_INFO_KEYS = ['on', 'notice', 'brand', 'owner', 'address', 'tax_office', 'tax_no', 'mersis', 'email', 'phone', 'kep', 'host', 'court', 'hero', 'sub', 'updated'];

function lg_store_all(): array
{
    static $c = null;
    if ($c !== null && empty($GLOBALS['LG_RESET'])) return $c;
    unset($GLOBALS['LG_RESET']);
    $c = [];
    try {
        // "!" kaçış karakteri: ters eğik çizgi MySQL dizesinde ayrıca kaçış sayıldığından iki veritabanında da aynı çalışan yol
        $rows = nm_multi() ? m_all("SELECT k, v FROM m_settings WHERE k LIKE 'lg!_%' ESCAPE '!'") : all("SELECT k, v FROM settings WHERE k LIKE 'lg!_%' ESCAPE '!'");
        foreach ($rows as $r) $c[substr((string)$r['k'], 3)] = (string)$r['v'];
    } catch (Throwable $e) { $c = []; }
    return $c;
}
function lg_get(string $k, string $d = ''): string { $c = lg_store_all(); return isset($c[$k]) && $c[$k] !== '' ? $c[$k] : $d; }
function lg_put(array $kv): void
{
    foreach ($kv as $k => $v) {
        if (nm_multi()) m_q('INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)', ['lg_' . $k, (string)$v]);
        else set_setting('lg_' . $k, (string)$v);
    }
    $GLOBALS['LG_RESET'] = true;
}
function lg_on(): bool { return lg_get('on') === '1'; }

function lg_site(): string
{
    if (defined('APP_URL') && APP_URL !== '') return rtrim((string)APP_URL, '/') . '/';
    $m = nm_multi() ? m_setting('site_url') : (string)setting('site_url', '');
    return $m !== '' ? rtrim($m, '/') . '/' : (PHP_SAPI === 'cli' ? 'http://localhost/' : request_base_url());
}

/** Yer tutucu değerleri (boş olanlar köşeli parantezle belirgin) */
function lg_vars(): array
{
    $miss = fn($t) => '[' . $t . ']';
    $g = fn($k, $t) => lg_get($k) !== '' ? lg_get($k) : $miss($t);
    $tax = lg_get('tax_office') !== '' || lg_get('tax_no') !== '' ? trim(lg_get('tax_office') . ' Vergi Dairesi' . (lg_get('tax_no') !== '' ? ', VKN/TCKN: ' . lg_get('tax_no') : '')) : $miss('Vergi dairesi ve numarası');
    $upd = lg_get('updated') ?: date('Y-m-d');
    return [
        '{MARKA}' => lg_get('brand', 'dupcii'), '{UNVAN}' => $g('owner', 'Şirket / şahıs unvanı'), '{ADRES}' => $g('address', 'Adres'),
        '{VERGI}' => $tax, '{MERSIS}' => lg_get('mersis'), '{MERSIS_SATIR}' => lg_get('mersis') !== '' ? "\nMERSİS: " . lg_get('mersis') : '',
        '{EPOSTA}' => $g('email', 'E-posta'), '{TELEFON}' => lg_get('phone'), '{TELEFON_SATIR}' => lg_get('phone') !== '' ? ' · Telefon: ' . lg_get('phone') : '',
        '{KEP}' => $g('kep', 'KEP adresi'), '{KEP_VEYA}' => lg_get('kep') !== '' ? ', ' . lg_get('kep') . ' KEP adresine' : '', '{SITE}' => lg_site(), '{BARINDIRMA}' => $g('host', 'Barındırma sağlayıcısı ve sunucu konumu'),
        '{MAHKEME}' => $g('court', 'Yetkili mahkeme (ör. İstanbul)'), '{TARIH}' => (int)substr($upd, 8, 2) . ' ' . (['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][(int)substr($upd, 5, 2) - 1] ?? '') . ' ' . substr($upd, 0, 4),
    ];
}
/** Sayfanın ham metni (özel metin ya da taslak) */
function lg_raw(string $slug): string { return lg_get('t_' . $slug) !== '' ? lg_get('t_' . $slug) : (LG_TPL[$slug] ?? ''); }
/** Yer tutucuları doldurulmuş düz metin */
function lg_text(string $slug): string { return strtr(lg_raw($slug), lg_vars()); }

/** Basit biçim → HTML ("## " başlık, "- " madde, boş satır paragraf, **kalın**) */
function lg_html(string $txt): string
{
    $e = fn($s) => preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', preg_replace('/\[([^\]\n]{2,60})\]/u', '<mark>[$1]</mark>', htmlspecialchars($s, ENT_QUOTES, 'UTF-8')));
    $out = ''; $list = false; $para = [];
    $flushP = function () use (&$para, &$out, $e) { if ($para) { $out .= '<p>' . implode('<br>', array_map($e, $para)) . '</p>'; $para = []; } };
    foreach (preg_split('/\r?\n/', $txt) as $line) {
        $t = rtrim($line);
        if (preg_match('/^- (.*)$/u', $t, $m)) { $flushP(); if (!$list) { $out .= '<ul>'; $list = true; } $out .= '<li>' . $e($m[1]) . '</li>'; continue; }
        if ($list) { $out .= '</ul>'; $list = false; }
        if ($t === '') { $flushP(); continue; }
        if (preg_match('/^## (.*)$/u', $t, $m)) { $flushP(); $out .= '<h2>' . $e($m[1]) . '</h2>'; continue; }
        $para[] = $t;
    }
    if ($list) $out .= '</ul>';
    $flushP();
    return $out;
}

/** Aydınlatma metni sürümü: yayımlanan metin değişince değişir */
function lg_kvkk_ver(): string { return substr(sha1(lg_text('kvkk')), 0, 12); }

/** Eksik künye alanları (yayımlamadan önce uyarı) */
function lg_missing(): array
{
    $need = ['owner' => 'Unvan', 'address' => 'Adres', 'email' => 'E-posta', 'tax_office' => 'Vergi dairesi', 'tax_no' => 'Vergi / T.C. kimlik no', 'host' => 'Barındırma sağlayıcısı', 'court' => 'Yetkili mahkeme'];
    $o = [];
    foreach ($need as $k => $l) if (lg_get($k) === '') $o[] = $l;
    return $o;
}

/* ---------------- Herkese açık sayfalar ---------------- */

function lg_page_head(string $title, string $desc = '', string $extraCss = ''): void
{
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    header('Cache-Control: no-cache');
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . $e($title) . '</title>' . ($desc !== '' ? '<meta name="description" content="' . $e($desc) . '">' : '')
        . nm_og_tags($title, $desc !== '' ? $desc : 'Hastane birimleri için nöbet listeleri, değişimler ve ekip iletişimi tek yerde.', lg_get('brand', 'dupcii'))
        . '<link rel="icon" href="assets/icon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com">'
        . '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">'
        . '<style>' . lg_css() . $extraCss . '</style></head><body>';
}
function lg_css(): string
{
    return ':root{--ink:#0f1b21;--ink2:#3c4b53;--ink3:#6b7c84;--line:#e3e9ec;--bg:#f6f8f9;--card:#fff;--brand:#0b7a75;--navy:#1a1f3d;--pur:#7c5cf0;--soft:#eef7f6}'
        . '@media (prefers-color-scheme:dark){:root{--ink:#eef2f4;--ink2:#c3ccd1;--ink3:#8d9aa1;--line:#26323a;--bg:#0f1519;--card:#151d22;--brand:#2bb3a9;--soft:#14262a}}'
        . '*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6;-webkit-font-smoothing:antialiased}'
        . 'a{color:var(--brand)}.wrap{max-width:1080px;margin:0 auto;padding:0 20px}'
        . '.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}'
        . '.top .wrap{display:flex;align-items:center;gap:12px;height:64px}.logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:800;font-size:20px;letter-spacing:-.03em}.logo img{width:34px;height:34px}.logo b{color:var(--pur)}'
        . '.grow{flex:1}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 18px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;border:1px solid var(--line);color:var(--ink);background:var(--card);white-space:nowrap}'
        . '.btn.pri{border:0;color:#fff;background:linear-gradient(135deg,#0b8a83,#5b6fe0 70%,#8b6cf0)}.btn.sm{height:38px;padding:0 14px;font-size:14px}'
        . '.hero{padding:72px 0 40px;text-align:center}.hero h1{font-size:clamp(30px,5.4vw,52px);line-height:1.12;letter-spacing:-.035em;margin:0 auto 18px;max-width:820px}'
        . '.hero p{font-size:clamp(16px,2.2vw,19px);color:var(--ink2);max-width:680px;margin:0 auto 28px}.cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}'
        . '.pill{display:inline-block;padding:5px 12px;border-radius:99px;background:var(--soft);color:var(--brand);font-size:13px;font-weight:600;margin-bottom:18px}'
        . 'section{padding:44px 0}h2.s{font-size:clamp(24px,3.4vw,32px);letter-spacing:-.03em;margin:0 0 8px;text-align:center}.lead{color:var(--ink3);text-align:center;margin:0 auto 30px;max-width:640px}'
        . '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}'
        . '.card h3{margin:10px 0 6px;font-size:16.5px;letter-spacing:-.01em}.card p{margin:0;color:var(--ink2);font-size:14.5px}.ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:var(--soft);color:var(--brand)}'
        . '.ic svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
        . '.steps{counter-reset:s}.steps .card{position:relative;padding-top:52px}.steps .card:before{counter-increment:s;content:counter(s);position:absolute;top:18px;left:20px;width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px}'
        . '.price .amt{font-size:28px;font-weight:800;letter-spacing:-.03em;margin:6px 0 2px}.price ul{padding-left:18px;margin:10px 0 0;color:var(--ink2);font-size:14px}.muted{color:var(--ink3);font-size:13.5px}'
        . '.band{background:var(--navy);color:#e9ecff;border-radius:20px;padding:34px 26px;text-align:center}.band h2{color:#fff;margin:0 0 8px;font-size:clamp(22px,3vw,28px)}.band p{color:#c9cdee;margin:0 0 20px}'
        . 'footer{border-top:1px solid var(--line);padding:28px 0 40px;margin-top:30px;font-size:13.5px;color:var(--ink3)}footer .links{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:12px}footer a{color:var(--ink2);text-decoration:none}footer a:hover{text-decoration:underline}'
        . '.doc{max-width:780px;margin:0 auto;padding:40px 20px}.doc h1{font-size:clamp(26px,4vw,34px);letter-spacing:-.03em;margin:0 0 6px}.doc h2{font-size:18px;margin:28px 0 8px}.doc p,.doc li{color:var(--ink2);font-size:15.5px}.doc ul{padding-left:20px}'
        . '.doc nav{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0 26px}.doc nav a{padding:6px 12px;border:1px solid var(--line);border-radius:99px;font-size:13px;text-decoration:none;color:var(--ink2);background:var(--card)}.doc nav a.on{background:var(--navy);color:#fff;border-color:var(--navy)}'
        . 'mark{background:#fff3c4;color:#6b4d00;border-radius:4px;padding:0 3px}@media (max-width:600px){.top .btn:not(.pri){display:none}.hero{padding:48px 0 28px}}';
}
function lg_page_top(bool $apply): string
{
    $brand = htmlspecialchars(lg_get('brand', 'dupcii'), ENT_QUOTES, 'UTF-8');
    $word = '<span>' . ($brand === 'dupcii' ? 'dupc<b>ii</b>' : $brand) . '</span>';
    return '<header class="top"><div class="wrap"><a class="logo" href="tanitim.php"><img src="assets/icon.svg" alt="">' . $word . '</a><span class="grow"></span>'
        . '<a class="btn sm" href="index.php">Giriş yap</a>' . ($apply ? '<a class="btn sm pri" href="index.php#/basvuru">Biriminizi açın</a>' : '') . '</div></header>';
}
function lg_page_foot(): string
{
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $links = '<a href="tanitim.php">Tanıtım</a>';
    foreach (LG_PAGES as $k => $t) $links .= '<a href="yasal.php?s=' . $k . '">' . $e($t) . '</a>';
    $kunye = array_filter([lg_get('owner'), lg_get('address'), lg_get('tax_office') !== '' ? lg_get('tax_office') . ' V.D.' . (lg_get('tax_no') !== '' ? ' ' . lg_get('tax_no') : '') : '', lg_get('mersis') !== '' ? 'MERSİS ' . lg_get('mersis') : '', lg_get('email'), lg_get('phone')]);
    return '<footer><div class="wrap"><div class="links">' . $links . '</div><div>© ' . date('Y') . ' ' . $e(lg_get('brand', 'dupcii')) . ' <i style="font-family:Georgia,serif">by <b>Fırtına</b></i>' . ($kunye ? ' · ' . $e(implode(' · ', $kunye)) : '') . '</div></div></footer></body></html>';
}

/** yasal.php */
function lg_legal_page(string $slug): void
{
    if (!lg_on()) { http_response_code(404); echo 'Sayfa bulunamadı.'; return; }
    if (!isset(LG_PAGES[$slug])) $slug = 'kvkk';
    $apply = function_exists('ap_open') && ap_open();
    lg_page_head(LG_PAGES[$slug] . ' · ' . lg_get('brand', 'dupcii'));
    $nav = '';
    foreach (LG_PAGES as $k => $t) $nav .= '<a class="' . ($k === $slug ? 'on' : '') . '" href="yasal.php?s=' . $k . '">' . htmlspecialchars($t, ENT_QUOTES, 'UTF-8') . '</a>';
    echo lg_page_top($apply) . '<main class="doc"><h1>' . htmlspecialchars(LG_PAGES[$slug], ENT_QUOTES, 'UTF-8') . '</h1><nav>' . $nav . '</nav>' . lg_html(lg_text($slug)) . '</main>' . lg_page_foot();
}

/* tanitim.php: inc/landing.php (lg_landing_page) */

/* ---------------- Uygulama içi ---------------- */

/** Açılış verisi: girişte bağlantılar, girişli kişide aydınlatma metni bildirimi */
function lg_boot(?array $me): array
{
    try {
        // Tek birimli kurulumda metinleri birim yöneticisi düzenler (Ayarlar kartı)
        $o = $me && $me['role'] === 'admin' && !nm_multi() ? ['legal_admin' => true] : [];
        if (!lg_on()) return $o;
        $o['legal'] = ['on' => true, 'pages' => LG_PAGES];
        if ($me && empty($me['sa_virtual']) && lg_get('notice') === '1') {
            $v = lg_kvkk_ver();
            if (strtok((string)($me['kvkk_ack'] ?? ''), '|') !== $v) $o['legal']['ack'] = $v;
        }
        return $o;
    } catch (Throwable $e) { return []; }
}

function a_legal_text(): void
{
    if (!lg_on()) fail('Sayfa yayımlanmadı.', 404);
    $slug = s('slug', 20);
    if (!isset(LG_PAGES[$slug])) fail('Sayfa bulunamadı.', 404);
    out(['title' => LG_PAGES[$slug], 'html' => lg_html(lg_text($slug)), 'ver' => $slug === 'kvkk' ? lg_kvkk_ver() : null]);
}

function a_me_kvkk_ack(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) out();
    $v = lg_kvkk_ver();
    if (s('ver', 20) !== $v) fail('Metin bu arada güncellendi. Sayfayı yenileyip yeniden okuyun.', 409);
    q('UPDATE users SET kvkk_ack = ? WHERE id = ?', [$v . '|' . now(), $me['id']]);
    audit($me, 'kvkk.ack', 'Aydınlatma metni', $v);
    out();
}

/** Kişinin kendi verisi (JSON); gizli alanlar (şifre özeti, anahtarlar, bildirim uç noktaları) yok */
function kv_export(array $me): array
{
    $uid = (int)$me['id'];
    $o = ['_aciklama' => 'Bu dosya, ' . setting('org_name', 'Klinik Portalı') . ' portalında adınıza kayıtlı kişisel verilerin bir kopyasıdır (KVKK md. 11). Şifre özeti ve güvenlik anahtarları güvenlik nedeniyle dahil edilmemiştir.',
        '_olusturma' => now()];
    $add = function (string $title, callable $f) use (&$o) {
        try { $r = $f(); if ($r) $o[$title] = $r; } catch (Throwable $e) { /* tablo bu kurulumda yok */ }
    };
    $u = one('SELECT * FROM users WHERE id = ?', [$uid]);
    foreach (['password_hash', 'google_sub'] as $k) unset($u[$k]);
    foreach (['pay_rates', 'remind_prefs', 'ui_prefs', 'notif_prefs'] as $k) if (!empty($u[$k])) $u[$k] = json_decode((string)$u[$k], true) ?? $u[$k];
    $u['unvan'] = $u['title_id'] ? val('SELECT name FROM titles WHERE id = ?', [$u['title_id']]) : null;
    $u['birim'] = $u['unit_id'] ? val('SELECT name FROM units WHERE id = ?', [$u['unit_id']]) : null;
    $o['Hesap'] = $u;
    $add('Oturumlar ve cihazlar', fn() => all('SELECT label, via, ip, created_at, last_seen, revoked_at, reason FROM user_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 500', [$uid]));
    $add('Parmak izi / yüz tanıma girişleri', fn() => all('SELECT name, created_at, last_used_at FROM passkeys WHERE user_id = ?', [$uid]));
    $add('Telefon bildirimi kayıtlı cihazlar', fn() => all('SELECT label, created_at, last_ok FROM push_subscriptions WHERE user_id = ?', [$uid]));
    $add('Bildirimler', fn() => all('SELECT title, body, kind, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 2000', [$uid]));
    $add('Nöbet listelerinde adınızın geçtiği satırlar', fn() => all('SELECT r.name AS liste, s.date, s.code, s.label, s.hours, s.start_time, s.end_time FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id WHERE s.name = ? ORDER BY s.date', [$me['name']]));
    $add('Nöbet istekleri', fn() => all('SELECT date, kind, note, status, reason, created_at, decided_at FROM shift_requests WHERE user_id = ? ORDER BY date', [$uid]));
    $add('Değişim ve devir istekleri', fn() => all('SELECT kind, from_name, from_date, from_code, to_name, to_date, to_code, part, status, note, created_at, decided_at FROM swap_requests WHERE from_user = ? OR to_user = ? ORDER BY id', [$uid, $uid]));
    $add('Nöbet devralma istekleri', fn() => all('SELECT date, code, giver_name, taker_name, part, status, note, created_at, decided_at FROM take_requests WHERE giver_user = ? OR taker_user = ? ORDER BY id', [$uid, $uid]));
    $add('Nöbet ilanları', fn() => all('SELECT date, code, kind, note, status, name, taker_name, created_at, closed_at FROM listings WHERE user_id = ? OR taker_user = ? ORDER BY id', [$uid, $uid]));
    $add('İlanlara başvurular', fn() => all('SELECT listing_id, offer_date, offer_code, note, status, created_at FROM listing_apps WHERE user_id = ? ORDER BY id', [$uid]));
    $add('Eksik personel çağrısı yanıtları', fn() => all('SELECT c.date, c.shift, c.code, r.answer, r.chosen, r.created_at, r.answered_at FROM callout_resp r JOIN callouts c ON c.id = r.callout_id WHERE r.user_id = ? ORDER BY r.id', [$uid]));
    $add('Ekstra nöbet isteği', fn() => all('SELECT ym, from_date, shifts, days, note, created_at, updated_at FROM extra_pool WHERE user_id = ?', [$uid]));
    $add('Blok yerleşimi', fn() => all('SELECT date, side, unit, code, period, created_at FROM placements WHERE user_id = ? ORDER BY date DESC LIMIT 2000', [$uid]));
    $add('Taraf değişiklikleri', fn() => all('SELECT date, from_side, to_side, unit, code, note, created_at FROM side_moves WHERE user_id = ? ORDER BY date DESC LIMIT 2000', [$uid]));
    $add('Gönderileriniz', fn() => all('SELECT title, body, status, created_at, published_at FROM posts WHERE author_id = ? ORDER BY id', [$uid]));
    $add('Okuduğunuz / onayladığınız duyurular', fn() => all('SELECT p.title, v.post_id, (SELECT a.created_at FROM acks a WHERE a.post_id = v.post_id AND a.user_id = v.user_id) AS onay FROM views v JOIN posts p ON p.id = v.post_id WHERE v.user_id = ?', [$uid]));
    $add('Yüklediğiniz dosyalar', fn() => all('SELECT orig_name, mime, size, created_at FROM attachments WHERE user_id = ? ORDER BY id', [$uid]));
    if (function_exists('sp_all')) $add('Destek talepleri', function () use ($uid) {
        $ts = sp_all('SELECT id, subject, topic, route, status, created_at, closed_at FROM sp_tickets WHERE user_id = ? AND tkey = ? ORDER BY id', [$uid, sp_here()[0]]);
        foreach ($ts as &$t) { $t['mesajlar'] = sp_all('SELECT who, name, body, created_at FROM sp_msgs WHERE ticket_id = ? AND internal = 0 ORDER BY id', [(int)$t['id']]); unset($t['id']); }
        return $ts;
    });
    $add('İşlem kayıtlarınız', fn() => all('SELECT action, target, detail, ip, at FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 3000', [$uid]));
    // Ortak alanlar (mesajlaşma, hastane belgeleri): kişi birim anahtarı + kimliğiyle tanınır
    if (function_exists('hdb') && hdb()) {
        $tk = (string)nm_tenant()['tkey'];
        $add('Gönderdiğiniz mesajlar', fn() => h_all('SELECT m.created_at, c.name AS sohbet, c.kind AS sohbet_turu, m.kind, m.body, m.edited_at, m.deleted_at FROM c_msgs m LEFT JOIN c_chats c ON c.id = m.chat_id WHERE m.tkey = ? AND m.user_id = ? ORDER BY m.id', [$tk, $uid]));
        $add('Sohbet üyelikleri', fn() => h_all('SELECT c.name, c.kind, mb.role, mb.joined_at, mb.muted, mb.archived FROM c_members mb JOIN c_chats c ON c.id = mb.chat_id WHERE mb.tkey = ? AND mb.user_id = ?', [$tk, $uid]));
        $add('Sohbet gizlilik ayarları', fn() => h_all('SELECT about, about_vis, seen_vis, receipts, add_groups, findable, dm_from, ret_default, last_seen FROM c_prefs WHERE tkey = ? AND user_id = ?', [$tk, $uid]));
        $add('Aramalar', fn() => h_all('SELECT a_name, b_name, video, state, created_at, answered_at, ended_at FROM c_calls WHERE (a_tk = ? AND a_uid = ?) OR (b_tk = ? AND b_uid = ?) ORDER BY id', [$tk, $uid, $tk, $uid]));
        $add('Hastane belgesi okuma kayıtları', fn() => h_all('SELECT d.title, r.read_at, r.ack_at FROM h_reads r JOIN h_docs d ON d.id = r.doc_id WHERE r.tkey = ? AND r.user_id = ?', [$tk, $uid]));
    }
    return $o;
}

/** GET: verilerimi indir */
function a_me_export_get(): void
{
    $me = current_user();
    if (!$me || !empty($me['sa_virtual'])) { http_response_code(401); exit; }
    $j = json_encode(kv_export($me), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
    audit($me, 'kvkk.export', $me['name'], 'Kişisel veri kopyası indirildi');
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="verilerim-' . date('Y-m-d') . '.json"');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $j;
    exit;
}
$GLOBALS['NM_GET']['me.export'] = 'a_me_export_get';

function a_me_privacy(): void
{
    $me = need_user();
    out(['del_req' => $me['del_req'] ?? null, 'kvkk_ack' => $me['kvkk_ack'] ?? null, 'legal' => lg_on(), 'admins' => (int)val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'")]);
}

/** Hesap silme talebi: birim yöneticileri bilgilendirilir; silme işlemini yönetici yapar (KVKK: en geç 30 gün) */
function a_me_delete_request(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisi bu işlemi yapamaz.', 403);
    if (b('cancel')) {
        q('UPDATE users SET del_req = NULL WHERE id = ?', [$me['id']]);
        audit($me, 'kvkk.delete.cancel', $me['name']);
        out(['del_req' => null]);
    }
    if (!empty($me['del_req'])) out(['del_req' => $me['del_req']]);
    q('UPDATE users SET del_req = ? WHERE id = ?', [now(), $me['id']]);
    audit($me, 'kvkk.delete.request', $me['name'], s('note', 300));
    $admins = all("SELECT * FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [$me['id']]);
    if ($admins && function_exists('notify_users')) notify_users($admins, 'privacy', 'Hesap silme talebi', $me['name'] . ' hesabının silinmesini istiyor (KVKK). En geç 30 gün içinde Kullanıcılar sayfasından silin.', '#/yonetim/kullanicilar',
        ['subject' => 'Hesap silme talebi', 'heading' => 'Hesap silme talebi', 'lines' => [$me['name'] . ' (' . $me['email'] . ') portaldaki hesabının ve kişisel verilerinin silinmesini istedi.' . (s('note', 300) !== '' ? "\nNot: " . s('note', 300) : ''), 'KVKK uyarınca talep en geç 30 gün içinde sonuçlandırılmalıdır. Kullanıcılar sayfasında kişiyi açıp "Sil" deyin.'], 'button' => 'Kullanıcılar'], 'notoff');
    out(['del_req' => now()]);
}

/** Görev: 20 günü geçen silme talebini yöneticilere bir kez daha hatırlat */
$GLOBALS['NM_JOBS']['kvkk_remind'] = function (bool $force) {
    try { $rows = all("SELECT id, name, del_req FROM users WHERE del_req IS NOT NULL AND del_req < ? AND status <> 'deleted'", [date('Y-m-d H:i:s', time() - 20 * 86400)]); } catch (Throwable $e) { return; }
    foreach ($rows as $r) {
        $tag = 'kvkk_rem_' . $r['id'] . '_' . substr((string)$r['del_req'], 0, 10);
        if (setting($tag) === '1') continue;
        set_setting($tag, '1');
        $admins = all("SELECT * FROM users WHERE role = 'admin' AND status = 'active' AND id <> ?", [$r['id']]);
        if ($admins && function_exists('notify_users')) notify_users($admins, 'privacy', 'Hesap silme talebi bekliyor', $r['name'] . ' kişisinin silme talebi 20 gündür bekliyor. Yasal süre 30 gün.', '#/yonetim/kullanicilar', null, 'notoff');
    }
};

/* ---------------- Düzenleme (sistem yöneticisi; tek birimli kurulumda birim yöneticisi) ---------------- */

function lg_need_editor(): array
{
    if (nm_multi()) return need_sa();
    $me = need_user();
    if ($me['role'] !== 'admin') fail('Bu işlem için yönetici olmalısınız.', 403);
    return $me;
}
function lg_editor_out(): array
{
    $info = [];
    foreach (LG_INFO_KEYS as $k) $info[$k] = lg_get($k);
    $texts = [];
    foreach (LG_PAGES as $k => $t) $texts[$k] = ['title' => $t, 'custom' => lg_get('t_' . $k) !== '', 'text' => lg_raw($k), 'tpl' => LG_TPL[$k]];
    return ['info' => $info, 'texts' => $texts, 'missing' => lg_missing(), 'site' => lg_site(), 'kvkk_ver' => lg_kvkk_ver(),
        'acks' => nm_multi() ? null : (int)val('SELECT COUNT(*) FROM users WHERE kvkk_ack LIKE ?', [lg_kvkk_ver() . '|%'])];
}
function a_legal_get(): void { lg_need_editor(); out(lg_editor_out()); }
function a_legal_save(): void
{
    $ed = lg_need_editor();
    $in = $GLOBALS['IN'];
    $n = [];
    foreach (['on', 'notice'] as $k) if (array_key_exists($k, $in)) $n[$k] = b($k) ? '1' : '0';
    $lim = ['brand' => 40, 'owner' => 200, 'address' => 300, 'tax_office' => 80, 'tax_no' => 11, 'mersis' => 16, 'email' => 120, 'phone' => 30, 'kep' => 120, 'host' => 200, 'court' => 80, 'hero' => 140, 'sub' => 300];
    foreach ($lim as $k => $l) if (array_key_exists($k, $in)) $n[$k] = s($k, $l);
    if (isset($n['tax_no']) && $n['tax_no'] !== '' && !preg_match('/^\d{10,11}$/', $n['tax_no'])) fail('Vergi kimlik numarası 10, T.C. kimlik numarası 11 hane olmalı.');
    if (isset($n['email']) && $n['email'] !== '' && !filter_var($n['email'], FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi girin.');
    $texts = is_array($in['texts'] ?? null) ? $in['texts'] : [];
    foreach (LG_PAGES as $k => $t) {
        if (!array_key_exists($k, $texts) || !is_string($texts[$k])) continue;
        $v = trim(str_replace("\r", '', mb_substr($texts[$k], 0, 40000)));
        $n['t_' . $k] = ($v === trim(LG_TPL[$k])) ? '' : $v; // taslakla aynıysa özel metin tutulmaz (taslak güncellenince o gelir)
    }
    $before = lg_kvkk_ver();
    $n['updated'] = date('Y-m-d');
    lg_put($n);
    if (($n['on'] ?? '') === '1' && lg_missing()) { /* yayımlamaya izin verilir; panelde eksikler uyarılır */ }
    $detail = 'yayın=' . lg_get('on', '0') . ', bildirim=' . lg_get('notice', '0') . (lg_kvkk_ver() !== $before ? ', aydınlatma metni değişti' : '');
    if (nm_multi()) sa_audit($ed, 'legal.save', 'Site ve yasal metinler', $detail); else audit($ed, 'legal.save', 'Yasal metinler', $detail);
    out(lg_editor_out());
}

$GLOBALS['NM_BOOT'][] = function (array $me): array { return lg_boot($me); };

return [
    'legal.text' => 'a_legal_text',
    'me.kvkk.ack' => 'a_me_kvkk_ack',
    'me.privacy' => 'a_me_privacy',
    'me.delete.request' => 'a_me_delete_request',
    'legal.get' => 'a_legal_get',
    'legal.save' => 'a_legal_save',
    'sa.legal.get' => 'a_legal_get',
    'sa.legal.save' => 'a_legal_save',
];
