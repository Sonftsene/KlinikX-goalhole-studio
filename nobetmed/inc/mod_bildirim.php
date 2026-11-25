<?php
/**
 * Bildirim sistemi (4.7): kişisel tercihler, birim politikası, şifreli telefon bildirimi içeriği,
 * canlı (sayfa yenilemeden) bildirim ucu, cihazlar, bildirim merkezi, birimler arası anında tetik.
 *
 * Kategori: her bildirim türü (kind) bir kategoriye düşer. Kişi kategori başına "telefon/masaüstü" ve
 * "ekranda açılır" seçer; yönetici varsayılanları ve zorunlu kategorileri belirler (zorunlu: kapatılamaz,
 * sessiz saatleri ve duraklatmayı deler — ör. eksik personel çağrısı).
 */
declare(strict_types=1);

const NB_CATS = [
    'mesaj' => ['Mesajlar', 'Birebir ve grup mesajları, @bahsetmeler'],
    'eksik' => ['Eksik personel çağrısı', 'Acil nöbet çağrıları'],
    'duyuru' => ['Duyurular', 'Yeni duyuru ve okuma hatırlatmaları'],
    'belge' => ['Hastane belgeleri', 'Yeni protokol ve belgeler'],
    'nobet' => ['Nöbet', 'Liste güncellemesi, nöbet hatırlatması, blok yerleşimi'],
    'degisim' => ['Değişim ve ilanlar', 'Nöbet değişimi, devir ve ilanlar'],
    'istek' => ['Nöbet istekleri', 'İstek dönemi, onay ve ret'],
    'yonetim' => ['Onay bekleyenler', 'Onay bekleyen içerik ve üyeler, ekstra nöbet gönüllüleri, gözden geçirme tarihleri'],
    'sistem' => ['Sistem', 'Deneme bildirimleri ve diğerleri'],
];
const NB_KIND_CAT = ['chat' => 'mesaj', 'post' => 'duyuru', 'remind' => 'duyuru', 'digest' => 'duyuru', 'hdoc' => 'belge', 'roster' => 'nobet', 'shift' => 'nobet',
    'side' => 'nobet', 'callout' => 'eksik', 'swap' => 'degisim', 'listing' => 'degisim', 'request' => 'istek', 'review' => 'yonetim', 'pending_post' => 'yonetim', 'pending_user' => 'yonetim', 'call' => 'mesaj', 'extra' => 'yonetim', 'billing' => 'yonetim', 'apply' => 'yonetim', 'privacy' => 'yonetim'];
/** İçerik gizlendiğinde telefonda görünen genel metin */
const NB_GENERIC = ['mesaj' => 'Yeni mesaj', 'eksik' => 'Eksik personel çağrısı', 'duyuru' => 'Yeni duyuru', 'belge' => 'Yeni hastane belgesi', 'nobet' => 'Nöbet bildirimi',
    'degisim' => 'Değişim / ilan bildirimi', 'istek' => 'Nöbet isteği bildirimi', 'yonetim' => 'Onay bekleyen iş', 'sistem' => 'Yeni bildirim'];

function nb_cat(string $kind): string { return NB_KIND_CAT[$kind] ?? 'sistem'; }
function nb_kinds_of(string $cat): array
{
    if ($cat === 'sistem') return ['__sistem__'];
    return array_keys(array_filter(NB_KIND_CAT, fn($c) => $c === $cat));
}
function nb_hm(string $v, string $d): string { return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : $d; }

/* ---------------- Birim politikası (yönetici) ---------------- */

function nb_policy(): array
{
    static $cache = null;
    if ($cache !== null) return $cache;
    $p = json_decode((string)setting('notif_policy', ''), true);
    if (!is_array($p)) $p = [];
    $def = [];
    foreach (NB_CATS as $k => $_) {
        $v = $p['defaults'][$k] ?? [];
        $def[$k] = ['push' => array_key_exists('push', $v) ? ($v['push'] ? 1 : 0) : 1, 'pop' => array_key_exists('pop', $v) ? ($v['pop'] ? 1 : 0) : 1];
    }
    $locked = array_values(array_intersect(array_keys(NB_CATS), array_key_exists('locked', $p) ? (array)$p['locked'] : ['eksik']));
    return $cache = [
        'defaults' => $def,
        'locked' => $locked,
        'hide_preview' => !empty($p['hide_preview']),
        'quiet_allowed' => !array_key_exists('quiet_allowed', $p) || !empty($p['quiet_allowed']),
    ];
}

/* ---------------- Kişisel tercihler ---------------- */

function nb_prefs(array $u, ?array $pol = null): array
{
    $pol = $pol ?? nb_policy();
    $raw = json_decode((string)($u['notif_prefs'] ?? ''), true);
    if (!is_array($raw)) $raw = [];
    $cats = [];
    foreach ($pol['defaults'] as $k => $d) {
        $c = is_array($raw['cats'][$k] ?? null) ? $raw['cats'][$k] : [];
        $push = array_key_exists('push', $c) ? ($c['push'] ? 1 : 0) : $d['push'];
        $pop = array_key_exists('pop', $c) ? ($c['pop'] ? 1 : 0) : $d['pop'];
        if (in_array($k, $pol['locked'], true)) $push = 1;
        $cats[$k] = ['push' => $push, 'pop' => $pop];
    }
    $q = is_array($raw['quiet'] ?? null) ? $raw['quiet'] : [];
    $pause = (string)($raw['pause_until'] ?? '');
    return [
        'cats' => $cats,
        'sound' => (int)($raw['sound'] ?? 1) ? 1 : 0,
        'vibrate' => (int)($raw['vibrate'] ?? 1) ? 1 : 0,
        'preview' => $pol['hide_preview'] ? 0 : ((int)($raw['preview'] ?? 1) ? 1 : 0),
        'quiet' => ['on' => $pol['quiet_allowed'] && !empty($q['on']), 'from' => nb_hm((string)($q['from'] ?? ''), '23:00'), 'to' => nb_hm((string)($q['to'] ?? ''), '07:00')],
        'pause_until' => $pause !== '' && $pause > now() ? $pause : null,
    ];
}

/** Şu an sessiz saatlerde mi (gece yarısını aşan aralık dahil) */
function nb_in_quiet(array $pr, ?int $ts = null): bool
{
    if (empty($pr['quiet']['on'])) return false;
    $t = date('H:i', $ts ?? time());
    [$a, $b] = [$pr['quiet']['from'], $pr['quiet']['to']];
    if ($a === $b) return false;
    return $a < $b ? ($t >= $a && $t < $b) : ($t >= $a || $t < $b);
}

/** Bu kategori kişinin telefonuna şimdi gidecek mi (duraklatma ve zorunluluk dahil) */
function nb_push_allowed(array $pr, string $cat, array $pol): bool
{
    if (in_array($cat, $pol['locked'], true)) return true;
    if (empty($pr['cats'][$cat]['push'])) return false;
    return $pr['pause_until'] === null;
}

/** notify_users / c_push buradan geçer: telefon bildirimi alacak kişiler */
function nb_push_filter(array $userIds, string $kind): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (!$ids) return [];
    $pol = nb_policy();
    $cat = nb_cat($kind);
    $o = [];
    foreach (all('SELECT id, push_on, notif_prefs FROM users WHERE id IN (' . implode(',', $ids) . ')') as $u) {
        if ((int)($u['push_on'] ?? 1) !== 1 && !in_array($cat, $pol['locked'], true)) continue;
        if (nb_push_allowed(nb_prefs($u, $pol), $cat, $pol)) $o[] = (int)$u['id'];
    }
    return $o;
}

/** Bildirim simgesi (tam adres): yöneticinin yüklediği uygulama simgesi, yoksa sitenin logosu */
function nb_icon_url(): string
{
    $b = function_exists('brand_url') ? brand_url('icon192') : null;
    return base_url() . ($b ?: 'assets/icon-192.png');
}

function nb_item(array $r): array
{
    $cat = nb_cat((string)$r['kind']);
    $tag = preg_match('~^#/mesaj/(\d+)$~', (string)$r['url'], $m) ? ($r['kind'] === 'call' ? 'k' : 'c') . $m[1] : 'n' . (int)$r['id'];
    $body = (string)$r['body'];
    // Birebir mesajda başlık zaten gönderen: "Elif Yılmaz: …" önekini tekrar etme
    if ($r['kind'] === 'chat' && str_starts_with($body, $r['title'] . ': ')) $body = mb_substr($body, mb_strlen((string)$r['title']) + 2);
    return ['id' => (int)$r['id'], 'at' => $r['created_at'], 'kind' => $r['kind'], 'cat' => $cat, 'title' => $r['title'], 'body' => $body, 'url' => $r['url'] ?: '#/', 'tag' => $tag, 'read' => isset($r['read_at']) && $r['read_at'] !== null];
}

/**
 * Kişinin telefonuna gidecek içerik (since'ten beri okunmamış ve telefona izin verilen bildirimler).
 * null: gönderilecek bir şey yok.
 */
function nb_payload(array $u, string $since, ?array $pol = null): ?array
{
    $pol = $pol ?? nb_policy();
    $pr = nb_prefs($u, $pol);
    $rows = all('SELECT id, title, body, url, kind, created_at FROM notifications WHERE user_id = ? AND read_at IS NULL AND created_at >= ? ORDER BY created_at DESC, id DESC LIMIT 8', [(int)$u['id'], $since]);
    $items = [];
    $urgent = false;
    foreach ($rows as $r) {
        $it = nb_item($r);
        if (!nb_push_allowed($pr, $it['cat'], $pol)) continue;
        if (in_array($it['cat'], $pol['locked'], true)) $urgent = true;
        if (!$pr['preview']) { $it['title'] = (string)setting('org_name', 'dupcii'); $it['body'] = NB_GENERIC[$it['cat']] ?? 'Yeni bildirim'; }
        $it['title'] = mb_substr((string)$it['title'], 0, 90);
        $it['body'] = mb_substr((string)$it['body'], 0, 220);
        $items[] = $it;
        if (count($items) >= 3) break;
    }
    if (!$items) return null;
    return [
        'v' => 1, 'items' => $items, 'gone' => nb_gone_ids((int)$u['id'], null, 30),
        'unread' => (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [(int)$u['id']]),
        'silent' => !$urgent && nb_in_quiet($pr) ? 1 : 0,
        'vibrate' => $pr['vibrate'], 'icon' => nb_icon_url(), 'org' => (string)setting('org_name', ''),
    ];
}

/** Dağıtım: abonelik başına şifreli içerikle gönder (push_after_response kapanışta çağırır) */
function nb_dispatch(array $pending): int
{
    if (!$pending || !push_ready()) return 0;
    $keys = push_keys();
    if (!$keys) return 0;
    $in = implode(',', array_map('intval', array_keys($pending)));
    $subs = all("SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN ($in)");
    if (!$subs) return 0;
    $pol = nb_policy();
    $users = [];
    foreach (all("SELECT id, notif_prefs FROM users WHERE id IN ($in)") as $u) $users[(int)$u['id']] = $u;
    $payloads = [];
    $jobs = [];
    foreach ($subs as $s) {
        $uid = (int)$s['user_id'];
        if (!isset($users[$uid])) continue;
        if (!array_key_exists($uid, $payloads)) $payloads[$uid] = nb_payload($users[$uid], (string)$pending[$uid], $pol);
        $p = $payloads[$uid];
        if ($p === null) continue;
        $json = (string)json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        while (strlen($json) > 3000 && count($p['items']) > 1) { array_pop($p['items']); $json = (string)json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
        $first = $p['items'][0];
        $jobs[] = ['id' => (int)$s['id'], 'endpoint' => $s['endpoint'], 'p256dh' => (string)$s['p256dh'], 'auth' => (string)$s['auth'], 'payload' => $json,
            'topic' => count($p['items']) === 1 ? $first['tag'] : null, 'ttl' => $first['cat'] === 'mesaj' ? 86400 : 172800];
    }
    if (!$jobs) return 0;
    $from = setting('mail_from');
    $subject = filter_var($from, FILTER_VALIDATE_EMAIL) ? 'mailto:' . $from : base_url();
    $res = push_send($jobs, $keys['public'], $keys['private_pem'], $subject);
    $ok = 0;
    foreach ($res as $id => $r) {
        if ($r === 'ok') { $ok++; q('UPDATE push_subscriptions SET last_ok = ? WHERE id = ?', [now(), $id]); }
        elseif ($r === 'gone') q('DELETE FROM push_subscriptions WHERE id = ?', [$id]);
    }
    return $ok;
}

/* ---------------- Uçlar ---------------- */

function nb_me(): array
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisi birimde bildirim almaz.', 403);
    return $me;
}

function nb_prefs_out(array $u): array
{
    $pol = nb_policy();
    return nb_prefs($u, $pol) + ['locked' => $pol['locked'], 'hide_preview' => $pol['hide_preview'], 'quiet_allowed' => $pol['quiet_allowed']];
}

/** Canlı bildirim: sayfa açıkken birkaç saniyede bir (yeni bildirimler, okunmamış sayıları) */
function a_live(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) out(['now' => now(), 'unread' => 0, 'items' => []]);
    if (function_exists('pr_touch')) pr_touch($me); // çevrimiçi durum ve açık bölüm (inc/mod_cevrimici.php)
    $since = s('since', 19);
    $o = ['now' => now(), 'unread' => (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$me['id']]), 'items' => []];
    nb_batch_ensure();
    $okSince = preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $since);
    if ($g = nb_gone_ids((int)$me['id'], $okSince ? date('Y-m-d H:i:s', strtotime($since) - 120) : null)) $o['gone'] = $g;
    if (preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', $since)) {
        $rows = all('SELECT id, title, body, url, kind, created_at, read_at FROM notifications WHERE user_id = ? AND read_at IS NULL AND created_at >= ? ORDER BY created_at DESC, id DESC LIMIT 6', [$me['id'], $since]);
        $o['items'] = array_map('nb_item', $rows);
    }
    if (function_exists('c_unread_total') && function_exists('cdb') && cdb() && nm_mod_on('mesaj') && user_perm($me, 'mesaj') !== 'off') {
        $o['chat'] = c_unread_total($me);
        if (function_exists('c_incoming_call') && ($k = c_incoming_call($me))) $o['call'] = $k; // çalan arama
    }
    out($o);
}

function a_notif_list2(): void
{
    $me = need_user();
    $cat = s('cat', 12);
    $where = 'user_id = ?';
    $p = [$me['id']];
    if (isset(NB_CATS[$cat])) {
        $kinds = nb_kinds_of($cat);
        if ($cat === 'sistem') { $where .= ' AND kind NOT IN (' . implode(',', array_fill(0, count(NB_KIND_CAT), '?')) . ')'; $p = array_merge($p, array_keys(NB_KIND_CAT)); }
        else { $where .= ' AND kind IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')'; $p = array_merge($p, $kinds); }
    }
    if (b('unread')) $where .= ' AND read_at IS NULL';
    if ($before = (int)i('before')) { $where .= ' AND id < ?'; $p[] = $before; }
    $lim = max(10, min(60, (int)(i('limit') ?: 40)));
    $rows = all("SELECT id, title, body, url, kind, created_at, read_at FROM notifications WHERE $where ORDER BY id DESC LIMIT " . ($lim + 1), $p);
    $more = count($rows) > $lim;
    $rows = array_slice($rows, 0, $lim);
    out(['items' => array_map(fn($r) => nb_item($r) + ['at' => $r['created_at']], $rows), 'more' => $more]);
}

function a_notif_delete(): void
{
    $me = need_user();
    if ($id = (int)i('id')) q('DELETE FROM notifications WHERE id = ? AND user_id = ?', [$id, $me['id']]);
    elseif (b('read_all')) q('DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL', [$me['id']]);
    else fail('Silinecek bildirim seçilmedi.');
    out();
}

function a_notif_prefs_get(): void
{
    $me = nb_me();
    out(['prefs' => nb_prefs_out($me), 'cats' => nb_cats_for($me)]);
}

/** Kişinin göreceği kategoriler (onay bekleyenler yalnız yayıncı/yöneticiye) */
function nb_cats_for(array $me): array
{
    $o = [];
    foreach (NB_CATS as $k => [$l, $d]) {
        if ($k === 'yonetim' && !is_publisher_base($me)) continue;
        if ($k === 'mesaj' && function_exists('nm_mod_on') && !nm_mod_on('mesaj')) continue;
        if ($k === 'belge' && function_exists('nm_mod_on') && !nm_mod_on('hbelge')) continue;
        if ($k === 'eksik' && function_exists('nm_mod_on') && !nm_mod_on('eksik')) continue;
        $o[] = ['key' => $k, 'label' => $l, 'descr' => $d];
    }
    return $o;
}
function is_publisher_base(array $me): bool { return in_array($me['role'], ['admin', 'editor'], true) || (function_exists('user_perms') && in_array('manage', user_perms($me), true)); }

function a_notif_prefs_save(): void
{
    $me = nb_me();
    global $IN;
    $pol = nb_policy();
    $raw = json_decode((string)($me['notif_prefs'] ?? ''), true);
    if (!is_array($raw)) $raw = [];
    if (is_array($IN['cats'] ?? null)) {
        foreach ($IN['cats'] as $k => $v) {
            if (!isset(NB_CATS[$k]) || !is_array($v)) continue;
            foreach (['push', 'pop'] as $f) if (array_key_exists($f, $v)) {
                if ($f === 'push' && !$v[$f] && in_array($k, $pol['locked'], true)) fail('“' . NB_CATS[$k][0] . '” bildirimleri yöneticiniz tarafından zorunlu tutuluyor.', 403);
                $raw['cats'][$k][$f] = $v[$f] ? 1 : 0;
            }
        }
    }
    foreach (['sound', 'vibrate', 'preview'] as $k) if (array_key_exists($k, $IN)) $raw[$k] = b($k) ? 1 : 0;
    if (is_array($IN['quiet'] ?? null)) {
        $q = $IN['quiet'];
        if (!empty($q['on']) && !$pol['quiet_allowed']) fail('Biriminizde sessiz saatler kapalı.', 403);
        $raw['quiet'] = ['on' => !empty($q['on']) ? 1 : 0, 'from' => nb_hm((string)($q['from'] ?? ''), '23:00'), 'to' => nb_hm((string)($q['to'] ?? ''), '07:00')];
    }
    if (array_key_exists('pause', $IN)) {
        $pv = (string)$IN['pause'];
        $until = null;
        if ($pv === '1h') $until = time() + 3600;
        elseif ($pv === '8h') $until = time() + 8 * 3600;
        elseif ($pv === 'morning') { $t = strtotime('tomorrow 07:00'); $until = $t ?: null; }
        elseif ($pv !== '') fail('Geçersiz süre.');
        $raw['pause_until'] = $until ? date('Y-m-d H:i:s', $until) : null;
    }
    q('UPDATE users SET notif_prefs = ? WHERE id = ?', [json_encode($raw, JSON_UNESCAPED_UNICODE), $me['id']]);
    $me['notif_prefs'] = json_encode($raw);
    out(['prefs' => nb_prefs_out($me)]);
}

/** Cihaz adı (tarayıcı bilgisinden; yalnız kişinin kendisi görür) */
function nb_device_label(string $ua, bool $app): string
{
    $os = preg_match('/iPhone/', $ua) ? 'iPhone' : (preg_match('/iPad/', $ua) ? 'iPad' : (preg_match('/Android/', $ua) ? 'Android' : (preg_match('/Windows/', $ua) ? 'Windows' : (preg_match('/Mac OS X|Macintosh/', $ua) ? 'Mac' : (preg_match('/Linux/', $ua) ? 'Linux' : 'Cihaz')))));
    $br = preg_match('/SamsungBrowser/', $ua) ? 'Samsung Internet' : (preg_match('/Edg\//', $ua) ? 'Edge' : (preg_match('/OPR\//', $ua) ? 'Opera' : (preg_match('/Firefox\//', $ua) ? 'Firefox' : (preg_match('/Chrome\//', $ua) ? 'Chrome' : (preg_match('/Safari\//', $ua) ? 'Safari' : 'Tarayıcı')))));
    return $os . ' · ' . ($app ? 'Uygulama (ana ekran)' : $br);
}

function a_notif_devices(): void
{
    $me = nb_me();
    $cur = hash('sha256', s('endpoint', 2000));
    $rows = all('SELECT id, endpoint_hash, label, created_at, last_ok FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC', [$me['id']]);
    out(['items' => array_map(fn($r) => ['id' => (int)$r['id'], 'label' => $r['label'] ?: 'Cihaz', 'created_at' => $r['created_at'], 'last_ok' => $r['last_ok'], 'current' => $r['endpoint_hash'] === $cur], $rows)]);
}

function a_notif_device_del(): void
{
    $me = nb_me();
    q('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?', [(int)i('id'), $me['id']]);
    out();
}

/** Tek cihaza deneme bildirimi */
function a_notif_device_test(): void
{
    $me = nb_me();
    $s = one('SELECT * FROM push_subscriptions WHERE id = ? AND user_id = ?', [(int)i('id'), $me['id']]) ?? fail('Cihaz bulunamadı.', 404);
    if (!push_ready() || !($keys = push_keys())) fail('Telefon bildirimleri bu sunucuda kullanılamıyor.', 400);
    $since = date('Y-m-d H:i:s', time() - 1);
    q('INSERT INTO notifications (user_id, title, body, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$me['id'], 'Bildirimler çalışıyor 🎉', 'Bu cihaza deneme bildirimi: ' . ($s['label'] ?: 'Cihaz'), '#/profil/bildirim', 'test', now()]);
    $p = nb_payload($me, $since) ?? ['v' => 1, 'items' => [], 'unread' => 0, 'silent' => 0, 'vibrate' => 1, 'icon' => nb_icon_url()];
    $from = setting('mail_from');
    $r = push_send([['id' => (int)$s['id'], 'endpoint' => $s['endpoint'], 'p256dh' => (string)$s['p256dh'], 'auth' => (string)$s['auth'], 'payload' => (string)json_encode($p, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]],
        $keys['public'], $keys['private_pem'], filter_var($from, FILTER_VALIDATE_EMAIL) ? 'mailto:' . $from : base_url());
    $res = $r[(int)$s['id']] ?? 'error';
    if ($res === 'ok') { q('UPDATE push_subscriptions SET last_ok = ? WHERE id = ?', [now(), $s['id']]); out(['ok' => true, 'result' => 'ok']); }
    if ($res === 'gone') { q('DELETE FROM push_subscriptions WHERE id = ?', [$s['id']]); fail('Bu cihazın aboneliği sona ermiş; cihazda bildirimleri yeniden açın.', 410); }
    fail('Gönderilemedi: ' . mb_substr((string)$res, 0, 160), 502);
}

/* ---------------- Yönetici: birim bildirim politikası ---------------- */

function a_notif_policy_get(): void
{
    need_admin();
    $pol = nb_policy();
    $users = all("SELECT u.id, u.name, (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = u.id) AS dev FROM users u WHERE u.status = 'active' ORDER BY u.name");
    $without = array_values(array_map(fn($u) => $u['name'], array_filter($users, fn($u) => (int)$u['dev'] === 0)));
    out(['policy' => $pol, 'cats' => array_map(fn($k) => ['key' => $k, 'label' => NB_CATS[$k][0], 'descr' => NB_CATS[$k][1]], array_keys(NB_CATS)),
        'stats' => ['users' => count($users), 'with_device' => count($users) - count($without), 'devices' => (int)val('SELECT COUNT(*) FROM push_subscriptions'), 'without' => $without],
        'push_ready' => push_ready(), 'encrypt' => function_exists('push_can_encrypt') && push_can_encrypt()]);
}

function a_notif_policy_save(): void
{
    $me = need_admin();
    global $IN;
    $cur = nb_policy();
    $new = ['defaults' => $cur['defaults'], 'locked' => $cur['locked'], 'hide_preview' => $cur['hide_preview'], 'quiet_allowed' => $cur['quiet_allowed']];
    if (is_array($IN['defaults'] ?? null)) foreach ($IN['defaults'] as $k => $v) {
        if (!isset(NB_CATS[$k]) || !is_array($v)) continue;
        foreach (['push', 'pop'] as $f) if (array_key_exists($f, $v)) $new['defaults'][$k][$f] = $v[$f] ? 1 : 0;
    }
    if (array_key_exists('locked', $IN)) $new['locked'] = array_values(array_intersect(array_keys(NB_CATS), array_map('strval', arr('locked'))));
    foreach (['hide_preview', 'quiet_allowed'] as $k) if (array_key_exists($k, $IN)) $new[$k] = b($k);
    set_setting('notif_policy', (string)json_encode($new, JSON_UNESCAPED_UNICODE));
    audit($me, 'notif.policy', '', 'zorunlu: ' . (implode(', ', $new['locked']) ?: '—') . ($new['hide_preview'] ? ' · içerik gizli' : ''));
    out();
}

/* ---------------- Bildirim durumu: kimde telefon bildirimi açık, kim açmamış (ve neden) ---------------- */

const NB_PSTATES = ['on', 'off', 'denied', 'unsupported', 'ios_install', 'ios_old'];
const NB_PLATFORMS = ['android', 'iphone', 'masaustu', 'diger'];
function nb_ps_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (setting('ps_schema', '') === '1') return;
    $end = DB_DRIVER === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    db()->exec("CREATE TABLE IF NOT EXISTS push_state (user_id INT NOT NULL PRIMARY KEY, state VARCHAR(12) NOT NULL, platform VARCHAR(12) NOT NULL DEFAULT '', updated_at VARCHAR(19) NOT NULL, reminded_at VARCHAR(19) NULL, reminds INT NOT NULL DEFAULT 0)$end");
    set_setting('ps_schema', '1');
}
/** Cihaz kendi durumunu bildirir (uygulama her açıldığında ve bildirim açılıp kapatılınca) */
function a_notif_pstate(): void
{
    $me = need_user();
    if (!empty($me['sa_virtual'])) out();
    $st = s('state', 12); $pl = s('platform', 12);
    if (!in_array($st, NB_PSTATES, true)) fail('Geçersiz durum.');
    if (!in_array($pl, NB_PLATFORMS, true)) $pl = 'diger';
    nb_ps_ensure();
    $r = one('SELECT state, platform, updated_at FROM push_state WHERE user_id = ?', [$me['id']]);
    // Başka cihazda açıksa “kapalı” bilgisi açık durumu ezmesin (kişi telefonunda açtı, bilgisayardan girdi)
    if ($r && $r['state'] === 'on' && $st !== 'on' && (int)val('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', [$me['id']]) > 0) out();
    if ($r && $r['state'] === $st && $r['platform'] === $pl && strtotime((string)$r['updated_at']) > time() - 3600) out();
    if ($r) q('UPDATE push_state SET state = ?, platform = ?, updated_at = ? WHERE user_id = ?', [$st, $pl, now(), $me['id']]);
    else q('INSERT INTO push_state (user_id, state, platform, updated_at, reminds) VALUES (?, ?, ?, ?, 0)', [$me['id'], $st, $pl, now()]);
    out();
}
/** Yönetici / yayıncı: herkesin bildirim durumu */
function a_notif_status(): void
{
    need_publisher();
    nb_ps_ensure();
    $ps = [];
    foreach (all('SELECT * FROM push_state') as $r) $ps[(int)$r['user_id']] = $r;
    $dev = [];
    foreach (all('SELECT user_id, COUNT(*) AS n, MAX(last_ok) AS last_ok FROM push_subscriptions GROUP BY user_id') as $r) $dev[(int)$r['user_id']] = $r;
    $out = [];
    foreach (all("SELECT id, name, email, last_seen_at FROM users WHERE status = 'active' ORDER BY name") as $u) {
        $id = (int)$u['id']; $p = $ps[$id] ?? null; $d = $dev[$id] ?? null;
        $st = $d && (int)$d['n'] > 0 ? 'on' : ($p ? ($p['state'] === 'on' ? 'off' : $p['state']) : ($u['last_seen_at'] ? 'unknown' : 'never'));
        $out[] = ['id' => $id, 'name' => $u['name'], 'email' => (string)$u['email'] !== '', 'state' => $st, 'platform' => $p['platform'] ?? '', 'devices' => $d ? (int)$d['n'] : 0,
            'last_ok' => $d['last_ok'] ?? null, 'seen' => $u['last_seen_at'], 'state_at' => $p['updated_at'] ?? null, 'reminded_at' => $p['reminded_at'] ?? null, 'reminds' => (int)($p['reminds'] ?? 0)];
    }
    out(['people' => $out, 'mail_ready' => function_exists('mail_ready') && mail_ready(), 'push_ready' => push_ready()]);
}
/** Kişinin durumuna göre ne yapması gerektiği (hatırlatma metni) */
function nb_ps_steps(string $st, string $pl): array
{
    if ($st === 'ios_install') return ['iPhone’da bildirim için uygulamayı ana ekrana eklemelisiniz:', '1) Safari’de siteyi açın, alttaki Paylaş düğmesine dokunun.', '2) “Ana Ekrana Ekle”yi seçin.', '3) Ana ekrandaki simgeden uygulamayı açın; Hesabım › Bildirimler › “Bildirimleri aç”a dokunun.'];
    if ($st === 'ios_old') return ['Bildirimler için iPhone’unuzun iOS 16.4 ya da daha yeni olması gerekiyor.', 'Ayarlar › Genel › Yazılım Güncelleme’den güncelleyin, sonra uygulamayı ana ekrandan açıp bildirimleri açın.'];
    if ($st === 'denied') return $pl === 'iphone'
        ? ['Bu cihazda bildirim izni kapatılmış. Açmak için:', 'Ayarlar › Bildirimler › listede uygulamayı bulun › “Bildirimlere İzin Ver”i açın.']
        : ['Bu cihazda bildirim izni reddedilmiş. Yeniden açmak için:', 'Uygulamayı açın, adres çubuğundaki kilit / ayar simgesine dokunun › İzinler › Bildirimler › İzin ver.', 'Ana ekrana eklediyseniz: telefon Ayarlar › Uygulamalar › Chrome (ya da uygulama) › Bildirimler › açın.', 'Sonra Hesabım › Bildirimler › “Bildirimleri aç”a dokunun.'];
    if ($st === 'unsupported') return ['Kullandığınız tarayıcı anlık bildirimi desteklemiyor.', 'Telefonunuzda güncel Chrome (Android) ya da Safari (iPhone, ana ekrana ekleyerek) ile açın, sonra Hesabım › Bildirimler › “Bildirimleri aç”a dokunun.'];
    return ['Telefonunuzda uygulamayı açın, Hesabım › Bildirimler › “Bildirimleri aç”a dokunun ve izin isteğine “İzin ver” deyin.', 'Android’de pil tasarrufu bildirimi geciktirebilir: Ayarlar › Pil › Chrome için “Kısıtlama yok” seçin (Samsung’da Chrome’u “Uyutulan uygulamalar”dan çıkarın).'];
}
/** Seçilen kişilere bildirimi açmaları için hatırlatma: uygulama içi bildirim + e-posta (12 saatte bir) */
function a_notif_remind(): void
{
    $me = need_publisher();
    nb_ps_ensure();
    $ids = array_values(array_unique(array_filter(array_map('intval', array_slice(arr('ids'), 0, 2000)))));
    if (!$ids) fail('Kişi seçin.');
    $in = implode(',', $ids);
    $ps = [];
    foreach (all("SELECT * FROM push_state WHERE user_id IN ($in)") as $r) $ps[(int)$r['user_id']] = $r;
    $hasDev = [];
    foreach (all("SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IN ($in)") as $r) $hasDev[(int)$r['user_id']] = 1;
    $sent = 0; $skipped = 0; $mailed = 0; $on = 0;
    foreach (all("SELECT * FROM users WHERE status = 'active' AND id IN ($in)") as $u) {
        $id = (int)$u['id']; $p = $ps[$id] ?? null;
        if (isset($hasDev[$id])) { $on++; continue; }
        if ($p && $p['reminded_at'] && strtotime((string)$p['reminded_at']) > time() - 12 * 3600) { $skipped++; continue; }
        $st = $p ? ($p['state'] === 'on' ? 'off' : (string)$p['state']) : 'off';
        $steps = nb_ps_steps($st, (string)($p['platform'] ?? ''));
        $title = 'Telefon bildirimlerini açın';
        $body = $me['name'] . ' nöbet değişikliği, çağrı ve mesajlardan anında haberdar olmanız için telefon bildirimlerini açmanızı istiyor.';
        $mailed += notify_users([$u], 'notif_remind', $title, $body, '#/profil/bildirim',
            ['subject' => $title, 'heading' => $title, 'lines' => array_merge([$body], $steps), 'button' => 'Bildirim ayarlarını aç'], 'always');
        if ($p) q('UPDATE push_state SET reminded_at = ?, reminds = reminds + 1 WHERE user_id = ?', [now(), $id]);
        else q('INSERT INTO push_state (user_id, state, platform, updated_at, reminded_at, reminds) VALUES (?, ?, ?, ?, ?, 1)', [$id, 'off', '', now(), now()]);
        $sent++;
    }
    if ($sent) audit($me, 'notif.remind', $sent . ' kişi', $mailed ? $mailed . ' e-posta' : 'yalnız uygulama içi');
    out(['sent' => $sent, 'mailed' => $mailed, 'skipped' => $skipped, 'already_on' => $on]);
}

/* ---------------- Service worker uçları (GET/POST, X-NM-SW başlığıyla) ---------------- */

function nb_sw_guard(): ?array
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (($_SERVER['HTTP_X_NM_SW'] ?? '') !== '1') { http_response_code(400); echo '{"ok":false}'; return null; }
    $me = current_user();
    if (!$me || !empty($me['sa_virtual'])) { echo '{"ok":false,"auth":false}'; return null; }
    return $me;
}

/** Bildirimdeki "Okundu" düğmesi */
$GLOBALS['NM_GET']['push.read'] = function () {
    if (!($me = nb_sw_guard())) return;
    $id = (int)($_GET['id'] ?? 0);
    if ($id) q('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', [now(), $id, $me['id']]);
    echo json_encode(['ok' => true, 'unread' => (int)val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [$me['id']])]);
};

/** Tarayıcı aboneliği yenilediğinde (pushsubscriptionchange) */
$GLOBALS['NM_GET']['push.renew'] = function () {
    if (!($me = nb_sw_guard())) return;
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"ok":false}'; return; }
    $in = json_decode((string)file_get_contents('php://input'), true);
    $ep = is_array($in) ? (string)($in['endpoint'] ?? '') : '';
    if ($ep === '' || strlen($ep) > 2000 || !push_endpoint_allowed($ep)) { http_response_code(400); echo '{"ok":false}'; return; }
    $old = (string)($in['old'] ?? '');
    $label = null;
    if ($old !== '') {
        $label = val('SELECT label FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [hash('sha256', $old), $me['id']]);
        q('DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [hash('sha256', $old), $me['id']]);
    }
    $h = hash('sha256', $ep);
    q('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [$h]);
    q('INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, created_at, label) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$me['id'], $ep, $h, mb_substr((string)($in['p256dh'] ?? ''), 0, 255), mb_substr((string)($in['auth'] ?? ''), 0, 100), now(), $label ?: nb_device_label((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), false)]);
    echo '{"ok":true}';
};

/* ---------------- Birimler arası anında tetik ---------------- */

/** Başka birimin görevini hemen çalıştır (yanıt gönderildikten sonra, kendi sitemize imzalı istek) */
function nb_kick(array $tkeys, string $job): void
{
    static $queue = [];
    static $reg = false;
    if (!nm_multi() || !in_array($job, ['chat_notify', 'hdoc_notify', 'call_notify'], true)) return;
    $self = (string)nm_tenant()['tkey'];
    foreach ($tkeys as $tk) if ((string)$tk !== '' && (string)$tk !== $self) $queue[$tk . '|' . $job] = [(string)$tk, $job];
    if ($reg || !$queue) return;
    $reg = true;
    register_shutdown_function(function () use (&$queue) {
        nm_after_response();
        $secret = m_setting('secret');
        if ($secret === '' || !function_exists('curl_multi_init')) return;
        $mh = curl_multi_init();
        $hs = [];
        foreach ($queue as [$tk, $job]) {
            $t = nm_tenant_by_key($tk);
            if (!$t || nm_tenant_frozen($t)) continue;
            $ts = (string)time();
            $sig = hash_hmac('sha256', $tk . '|' . $job . '|' . $ts, $secret);
            $ch = curl_init(base_url() . 'api.php?action=nm.kick&b=' . rawurlencode($tk));
            curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => '', CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 2, CURLOPT_TIMEOUT => 4,
                CURLOPT_HTTPHEADER => ['X-NM-Kick: ' . $job . '.' . $ts . '.' . $sig, 'Expect:'], CURLOPT_FOLLOWLOCATION => false]);
            curl_multi_add_handle($mh, $ch);
            $hs[] = $ch;
        }
        do { $st = curl_multi_exec($mh, $run); if ($run) curl_multi_select($mh, 0.5); } while ($run && $st === CURLM_OK);
        foreach ($hs as $ch) curl_multi_remove_handle($mh, $ch);
        curl_multi_close($mh);
    });
}

$GLOBALS['NM_GET']['nm.kick'] = function () {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    $h = (string)($_SERVER['HTTP_X_NM_KICK'] ?? '');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !nm_multi() || !preg_match('/^([a-z_]+)\.(\d{9,11})\.([a-f0-9]{64})$/', $h, $m)) { http_response_code(400); echo 'no'; return; }
    [$job, $ts, $sig] = [$m[1], (int)$m[2], $m[3]];
    $tk = (string)nm_tenant()['tkey'];
    $secret = m_setting('secret');
    if ($secret === '' || abs(time() - $ts) > 120 || !hash_equals(hash_hmac('sha256', $tk . '|' . $job . '|' . $ts, $secret), $sig) || nm_tenant_frozen()) { http_response_code(403); echo 'no'; return; }
    $mod = ['chat_notify' => 'mesaj', 'hdoc_notify' => 'hbelge', 'call_notify' => 'mesaj'][$job] ?? null;
    $fn = $GLOBALS['NM_JOBS'][$job] ?? null;
    if (!$mod || !$fn || !nm_mod_on($mod)) { echo 'skip'; return; }
    echo 'ok';
    nm_after_response();
    try { $fn(true); } catch (Throwable $e) { error_log('[dupcii] kick ' . $job . ': ' . $e->getMessage()); }
};

/* ---------------- Gönderilen bildirimi herkesten geri alma (4.48.0) ---------------- */

/** notifications.batch (aynı işlemde giden bildirimler) + by_id (gönderen) ve notif_gone (geri alınan bildirimlerin kimlikleri: telefonda kapatmak için) */
function nb_batch_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (setting('nbatch_schema', '') === '1') return;
    $my = DB_DRIVER === 'mysql';
    foreach (['batch VARCHAR(16) NULL', 'by_id INT NULL'] as $c) { try { db()->exec("ALTER TABLE notifications ADD COLUMN $c"); } catch (Throwable $e) { /* zaten var */ } }
    $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $end = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    db()->exec("CREATE TABLE IF NOT EXISTS notif_gone (id $pk, user_id INT NOT NULL, nid INT NOT NULL, at VARCHAR(19) NOT NULL)$end");
    foreach (['CREATE INDEX idx_notif_batch ON notifications (batch)', 'CREATE INDEX idx_ngone_user ON notif_gone (user_id)'] as $x) { try { db()->exec($x); } catch (Throwable $e) { /* var */ } }
    set_setting('nbatch_schema', '1');
}
function nb_batch_on(): bool { return setting('nbatch_schema', '') === '1'; }

/** Kişinin geri alınmış bildirimleri (son 7 gün; $since verilirse o andan beri) */
function nb_gone_ids(int $uid, ?string $since = null, int $lim = 60): array
{
    if (!nb_batch_on()) return [];
    $from = $since ?? date('Y-m-d H:i:s', time() - 7 * 86400);
    return array_map('intval', array_column(all('SELECT nid FROM notif_gone WHERE user_id = ? AND at >= ? ORDER BY id DESC LIMIT ' . max(1, min(200, $lim)), [$uid, $from]), 'nid'));
}

const NB_NO_RETRACT = ['chat', 'call', 'test'];
/** Kişiye özel bildirimler (değişim, ilan seçimi, istek yanıtı, gizlilik, ödeme…): yönetici “Gönderilenler”de içeriğini görmez, geri alamaz (4.55.0) */
const NB_PERSONAL = ['swap', 'privacy', 'billing', 'support', 'remind', 'notif_remind', 'pending_user', 'apply', 'review', 'chat_admin', 'request', 'digest'];

/** Son 30 günde giden bildirimler, gönderim gönderim (yönetici hepsini, sorumlu kendi gönderdiklerini görür) */
function a_notif_sent(): void
{
    $me = need_publisher();
    nb_batch_ensure();
    $adm = is_admin($me);
    $p = [date('Y-m-d H:i:s', time() - 30 * 86400)];
    $skip = array_merge(NB_NO_RETRACT, NB_PERSONAL);
    // Yalnız gönderim kimliği olanlar (aynı dakikada giden ilgisiz bildirimler tek gönderim sayılmasın)
    $w = 'n.created_at >= ? AND n.batch IS NOT NULL AND n.kind NOT IN (' . implode(',', array_fill(0, count($skip), '?')) . ')';
    $p = array_merge($p, $skip);
    if (!$adm) { $w .= ' AND n.by_id = ?'; $p[] = (int)$me['id']; }
    $g = 'n.batch';
    // Tek kişiye giden ilan bildirimi (ör. “seçildin”) kişiseldir: listelenmez
    $rows = all("SELECT $g AS g, n.kind, n.title, MIN(n.body) AS body, MIN(n.url) AS url, MIN(n.created_at) AS at, MAX(n.by_id) AS by_id,
            COUNT(*) AS n, SUM(CASE WHEN n.read_at IS NULL THEN 0 ELSE 1 END) AS rd
        FROM notifications n WHERE $w GROUP BY $g, n.kind, n.title HAVING n.kind <> 'listing' OR COUNT(*) > 1 ORDER BY MIN(n.created_at) DESC LIMIT 150", $p);
    $names = [];
    foreach (all('SELECT id, name FROM users') as $u) $names[(int)$u['id']] = (string)$u['name'];
    out(['items' => array_map(fn($r) => [
        'g' => (string)$r['g'], 'kind' => (string)$r['kind'], 'cat' => nb_cat((string)$r['kind']), 'title' => (string)$r['title'], 'body' => (string)$r['body'],
        'url' => (string)$r['url'], 'at' => (string)$r['at'], 'n' => (int)$r['n'], 'read' => (int)$r['rd'],
        'by' => $r['by_id'] !== null ? ($names[(int)$r['by_id']] ?? null) : null, 'mine' => $r['by_id'] !== null && (int)$r['by_id'] === (int)$me['id'],
    ], $rows), 'admin' => $adm]);
}

/** Bir gönderimi herkesin bildirim listesinden siler; telefonda duranlar uygulama açılınca / sonraki bildirimde kapanır */
function a_notif_retract(): void
{
    $me = need_publisher();
    nb_batch_ensure();
    $g = s('g', 19); $kind = s('kind', 30); $title = s('title', 200);
    if ($g === '' || $title === '') fail('Gönderim seçilmedi.');
    if (in_array($kind, NB_NO_RETRACT, true) || in_array($kind, NB_PERSONAL, true)) fail('Kişiye özel bildirimler (mesaj, arama, değişim, istek yanıtı…) geri alınamaz.', 403);
    $w = 'batch = ? AND kind = ? AND title = ? AND created_at >= ?';
    $p = [$g, $kind, $title, date('Y-m-d H:i:s', time() - 31 * 86400)];
    if (!is_admin($me)) { $w .= ' AND by_id = ?'; $p[] = (int)$me['id']; }
    $rows = all("SELECT id, user_id FROM notifications WHERE $w", $p);
    if (!$rows) fail('Bildirim bulunamadı ya da zaten silinmiş.', 404);
    $at = now();
    db()->beginTransaction();
    try {
        $ins = db()->prepare('INSERT INTO notif_gone (user_id, nid, at) VALUES (?, ?, ?)');
        foreach ($rows as $r) $ins->execute([(int)$r['user_id'], (int)$r['id'], $at]);
        foreach (array_chunk(array_map(fn($r) => (int)$r['id'], $rows), 500) as $ids) q('DELETE FROM notifications WHERE id IN (' . implode(',', $ids) . ')');
        q('DELETE FROM notif_gone WHERE at < ?', [date('Y-m-d H:i:s', time() - 8 * 86400)]);
        db()->commit();
    } catch (Throwable $e) { db()->rollBack(); throw $e; }
    audit($me, 'notif.retract', $title, count($rows) . ' kişi');
    out(['deleted' => count($rows)]);
}

return [
    'notif.sent' => 'a_notif_sent',
    'notif.retract' => 'a_notif_retract',
    'live' => 'a_live',
    'notif.delete' => 'a_notif_delete',
    'notif.prefs.get' => 'a_notif_prefs_get',
    'notif.prefs.save' => 'a_notif_prefs_save',
    'notif.devices' => 'a_notif_devices',
    'notif.device.del' => 'a_notif_device_del',
    'notif.device.test' => 'a_notif_device_test',
    'notif.policy.get' => 'a_notif_policy_get',
    'notif.policy.save' => 'a_notif_policy_save',
    'notif.pstate' => 'a_notif_pstate',
    'notif.status' => 'a_notif_status',
    'notif.remind' => 'a_notif_remind',
];
