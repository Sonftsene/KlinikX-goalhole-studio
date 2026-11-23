<?php
/**
 * Kura (4.37): isim / sayı kurası. Kartlar üstü kapalı; karıştırma ve içerik sunucuda, kart açılana kadar istemciye gelmez.
 *  - Herkes kura başlatabilir; her kart açılışı (kim, ne zaman) kaydedilir; geçmiş birimde herkese görünür (şeffaflık).
 *  - Hazır şablonlar (isim listesi + ayarlar) birimde herkese görünür; yönetici ve yayıncı ekler / düzenler / siler.
 *  - Kura kaydını yalnız başlatan kişi, yönetici ya da yayıncı siler.
 */
declare(strict_types=1);

const KURA_MAX = 200;

function kr_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (setting('kr_schema', '') === '1') return;
    $my = DB_DRIVER === 'mysql';
    $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $end = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    $txt = $my ? 'MEDIUMTEXT' : 'TEXT';
    db()->exec("CREATE TABLE IF NOT EXISTS kura_tpl (id $pk, name VARCHAR(80) NOT NULL, items $txt NOT NULL, opts TEXT NULL, created_by INT NULL, by_name VARCHAR(120) NOT NULL DEFAULT '', updated_at VARCHAR(19) NOT NULL)$end");
    db()->exec("CREATE TABLE IF NOT EXISTS kura_draw (id $pk, title VARCHAR(120) NOT NULL DEFAULT '', items $txt NOT NULL, ord $txt NOT NULL, opts TEXT NULL, reveals $txt NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'open', tpl_id INT NULL, created_by INT NULL, by_name VARCHAR(120) NOT NULL DEFAULT '', created_at VARCHAR(19) NOT NULL, done_at VARCHAR(19) NULL)$end");
    set_setting('kr_schema', '1');
}

/** Kura maddeleri: boş satırlar atılır, en çok 200, her biri en çok 80 karakter */
function kr_items($in): array
{
    $o = [];
    foreach (array_slice(is_array($in) ? $in : [], 0, KURA_MAX + 50) as $x) {
        $t = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$x)), 0, 80);
        if ($t !== '') $o[] = $t;
    }
    if (count($o) > KURA_MAX) fail('En çok ' . KURA_MAX . ' madde yazılabilir.');
    return $o;
}
/** Ayarlar (istemci görünümü; karıştırmayı etkilemez) */
function kr_opts($in): array
{
    $in = is_array($in) ? $in : [];
    $people = [];
    foreach (array_slice((array)($in['people'] ?? []), 0, KURA_MAX) as $p) { $t = mb_substr(trim((string)$p), 0, 80); if ($t !== '') $people[] = $t; }
    return [
        'mode' => in_array($in['mode'] ?? '', ['cards', 'list'], true) ? $in['mode'] : 'cards', // kartla tek tek / hepsini birden
        'back' => in_array($in['back'] ?? '', ['num', 'plain', 'letter'], true) ? $in['back'] : 'num', // kart arkası
        'theme' => in_array($in['theme'] ?? '', ['brand', 'emerald', 'amber', 'rose', 'slate'], true) ? $in['theme'] : 'brand',
        'ask' => !empty($in['ask']), // açan kişinin adını sor
        'people' => $people, // sırayla çekenler (isteğe bağlı)
        'limit' => max(0, min(KURA_MAX, (int)($in['limit'] ?? 0))), // en çok kaç kart açılır (0 = hepsi)
        'shuffle' => !array_key_exists('shuffle', $in) || !empty($in['shuffle']), // karıştırma gösterisi
        'sound' => !array_key_exists('sound', $in) || !empty($in['sound']),
        'vibrate' => !array_key_exists('vibrate', $in) || !empty($in['vibrate']),
        'hide' => !empty($in['hide']), // açılan kart birkaç saniye sonra yeniden kapansın (gizlilik)
    ];
}
function kr_tpl_out(array $r): array
{
    return ['id' => (int)$r['id'], 'name' => $r['name'], 'items' => json_decode((string)$r['items'], true) ?: [], 'opts' => kr_opts(json_decode((string)$r['opts'], true)),
        'by' => $r['by_name'], 'updated_at' => $r['updated_at']];
}
/** Kura özeti: açılmamış kartların içeriği gönderilmez */
function kr_draw_out(array $r, bool $full = false): array
{
    $items = json_decode((string)$r['items'], true) ?: [];
    $ord = json_decode((string)$r['ord'], true) ?: [];
    $rev = json_decode((string)$r['reveals'], true) ?: [];
    $cards = [];
    foreach ($ord as $i => $k) {
        $x = $rev[(string)$i] ?? null;
        // Bitmiş kurada da yalnız açılan kartlar görünür (ör. 20 kişiden 3 kazanan: kalan 17 kapalı kalır)
        $cards[] = ['idx' => $i, 'open' => $x !== null, 'value' => $x !== null ? (string)($items[$k] ?? '') : null, 'who' => $x['who'] ?? '', 'by' => $x['by'] ?? '', 'at' => $x['at'] ?? null, 'n' => $x['n'] ?? null];
    }
    $o = ['id' => (int)$r['id'], 'title' => $r['title'], 'n' => count($ord), 'opened' => count($rev), 'status' => $r['status'], 'opts' => kr_opts(json_decode((string)$r['opts'], true)),
        'by' => $r['by_name'], 'created_by' => $r['created_by'] !== null ? (int)$r['created_by'] : null, 'created_at' => $r['created_at'], 'done_at' => $r['done_at']];
    if ($full) $o['cards'] = $cards;
    else $o['summary'] = array_values(array_map(fn($c) => ['value' => $c['value'], 'who' => $c['who'], 'n' => $c['n']], array_filter($cards, fn($c) => $c['open'])));
    return $o;
}

function a_kura_list(): void
{
    $me = need_user();
    kr_ensure();
    out(['templates' => array_map('kr_tpl_out', all('SELECT * FROM kura_tpl ORDER BY name')),
        'draws' => array_map(fn($r) => kr_draw_out($r), all('SELECT * FROM kura_draw ORDER BY id DESC LIMIT 60')),
        'can_manage' => function_exists('is_publisher') ? is_publisher($me) : $me['role'] === 'admin']);
}

function a_kura_tpl_save(): void
{
    $me = need_publisher();
    kr_ensure();
    $name = s('name', 80);
    if (mb_strlen($name) < 2) fail('Şablona bir ad verin.');
    $items = kr_items($GLOBALS['IN']['items'] ?? []);
    if (count($items) < 2) fail('En az 2 madde yazın.');
    $opts = json_encode(kr_opts($GLOBALS['IN']['opts'] ?? []), JSON_UNESCAPED_UNICODE);
    $id = (int)(i('id') ?? 0);
    if ($id) {
        one('SELECT id FROM kura_tpl WHERE id = ?', [$id]) ?? fail('Şablon bulunamadı.', 404);
        q('UPDATE kura_tpl SET name = ?, items = ?, opts = ?, by_name = ?, updated_at = ? WHERE id = ?', [$name, json_encode($items, JSON_UNESCAPED_UNICODE), $opts, $me['name'], now(), $id]);
    } else {
        q('INSERT INTO kura_tpl (name, items, opts, created_by, by_name, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [$name, json_encode($items, JSON_UNESCAPED_UNICODE), $opts, $me['id'], $me['name'], now()]);
        $id = (int)insert_id();
    }
    audit($me, 'kura.tpl', $name, count($items) . ' madde');
    out(['template' => kr_tpl_out(one('SELECT * FROM kura_tpl WHERE id = ?', [$id]))]);
}
function a_kura_tpl_delete(): void
{
    $me = need_publisher();
    kr_ensure();
    $r = one('SELECT * FROM kura_tpl WHERE id = ?', [(int)i('id')]) ?? fail('Şablon bulunamadı.', 404);
    q('DELETE FROM kura_tpl WHERE id = ?', [$r['id']]);
    audit($me, 'kura.tpl.delete', $r['name']);
    out(['ok' => true]);
}

/** Kura başlat: maddeler sunucuda karıştırılır (random_int, Fisher–Yates); istemci yalnız kart sayısını alır */
function a_kura_start(): void
{
    $me = need_user();
    kr_ensure();
    $items = kr_items($GLOBALS['IN']['items'] ?? []);
    if (count($items) < 2) fail('Kura için en az 2 isim ya da sayı yazın.');
    $opts = kr_opts($GLOBALS['IN']['opts'] ?? []);
    $ord = range(0, count($items) - 1);
    for ($i = count($ord) - 1; $i > 0; $i--) { $j = random_int(0, $i); [$ord[$i], $ord[$j]] = [$ord[$j], $ord[$i]]; }
    $title = s('title', 120);
    $tpl = (int)(i('tpl_id') ?? 0) ?: null;
    q('INSERT INTO kura_draw (title, items, ord, opts, reveals, status, tpl_id, created_by, by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$title, json_encode($items, JSON_UNESCAPED_UNICODE), json_encode($ord), json_encode($opts, JSON_UNESCAPED_UNICODE), '{}', 'open', $tpl, $me['id'], $me['name'], now()]);
    $id = (int)insert_id();
    audit($me, 'kura.start', $title !== '' ? $title : 'Kura', count($items) . ' madde');
    out(['draw' => kr_draw_out(one('SELECT * FROM kura_draw WHERE id = ?', [$id]), true)]);
}

function kr_draw_mine(int $id, array $me): array
{
    return one('SELECT * FROM kura_draw WHERE id = ?', [$id]) ?? fail('Kura bulunamadı.', 404);
}

/** Kart aç: o kartın içeriği yalnız şimdi döner; kim / ne zaman kaydedilir */
function a_kura_reveal(): void
{
    $me = need_user();
    kr_ensure();
    $r = kr_draw_mine((int)i('id'), $me);
    if ((int)$r['created_by'] !== (int)$me['id']) fail('Kartları kurayı başlatan kişinin ekranından açın.', 403);
    if ($r['status'] !== 'open') fail('Bu kura bitti.');
    $ord = json_decode((string)$r['ord'], true) ?: [];
    $rev = json_decode((string)$r['reveals'], true) ?: [];
    $idx = (int)i('idx');
    if (!isset($ord[$idx])) fail('Kart bulunamadı.');
    $opts = kr_opts(json_decode((string)$r['opts'], true));
    if (!isset($rev[(string)$idx])) {
        if ($opts['limit'] && count($rev) >= $opts['limit']) fail('Bu kurada en çok ' . $opts['limit'] . ' kart açılır.');
        $n = count($rev) + 1;
        $who = s('who', 80);
        if ($who === '' && $opts['people']) $who = (string)($opts['people'][$n - 1] ?? '');
        $rev[(string)$idx] = ['n' => $n, 'who' => $who, 'by' => $me['name'], 'at' => now()];
        // Eşzamanlı iki dokunuşta aynı kart iki kez sayılmasın: yalnız değişmediyse yaz
        $ok = q('UPDATE kura_draw SET reveals = ? WHERE id = ? AND reveals = ?', [json_encode($rev, JSON_UNESCAPED_UNICODE), $r['id'], (string)$r['reveals']])->rowCount() === 1;
        if (!$ok) fail('Kart az önce açıldı; ekran yenileniyor.', 409);
        $done = count($rev) >= count($ord) || ($opts['limit'] && count($rev) >= $opts['limit']);
        if ($done) q("UPDATE kura_draw SET status = 'done', done_at = ? WHERE id = ?", [now(), $r['id']]);
    }
    $r = one('SELECT * FROM kura_draw WHERE id = ?', [$r['id']]);
    $items = json_decode((string)$r['items'], true) ?: [];
    out(['value' => (string)($items[$ord[$idx]] ?? ''), 'draw' => kr_draw_out($r, true)]);
}

/** Hepsini aç / kurayı bitir */
function a_kura_finish(): void
{
    $me = need_user();
    kr_ensure();
    $r = kr_draw_mine((int)i('id'), $me);
    $pub = function_exists('is_publisher') && is_publisher($me);
    if ((int)$r['created_by'] !== (int)$me['id'] && !$pub) fail('Kurayı yalnız başlatan kişi bitirebilir.', 403);
    if ($r['status'] === 'open') {
        $ord = json_decode((string)$r['ord'], true) ?: [];
        $rev = json_decode((string)$r['reveals'], true) ?: [];
        $opts = kr_opts(json_decode((string)$r['opts'], true));
        if (b('open_all')) {
            $n = count($rev);
            foreach ($ord as $i => $k) if (!isset($rev[(string)$i])) { $n++; $rev[(string)$i] = ['n' => $n, 'who' => (string)($opts['people'][$n - 1] ?? ''), 'by' => $me['name'], 'at' => now()]; }
        }
        q("UPDATE kura_draw SET reveals = ?, status = 'done', done_at = ? WHERE id = ?", [json_encode($rev, JSON_UNESCAPED_UNICODE), now(), $r['id']]);
        audit($me, 'kura.finish', $r['title'] !== '' ? $r['title'] : 'Kura', count($rev) . '/' . count($ord) . ' kart');
    }
    out(['draw' => kr_draw_out(one('SELECT * FROM kura_draw WHERE id = ?', [$r['id']]), true)]);
}

function a_kura_get(): void
{
    need_user();
    kr_ensure();
    $r = one('SELECT * FROM kura_draw WHERE id = ?', [(int)i('id')]) ?? fail('Kura bulunamadı.', 404);
    out(['draw' => kr_draw_out($r, true)]);
}

function a_kura_delete(): void
{
    $me = need_user();
    kr_ensure();
    $r = one('SELECT * FROM kura_draw WHERE id = ?', [(int)i('id')]) ?? fail('Kura bulunamadı.', 404);
    $pub = function_exists('is_publisher') && is_publisher($me);
    if ((int)$r['created_by'] !== (int)$me['id'] && !$pub) fail('Kura kaydını yalnız başlatan kişi, yönetici ya da yayıncı silebilir.', 403);
    q('DELETE FROM kura_draw WHERE id = ?', [$r['id']]);
    audit($me, 'kura.delete', $r['title'] !== '' ? $r['title'] : 'Kura');
    out(['ok' => true]);
}

return [
    'kura.list' => 'a_kura_list',
    'kura.get' => 'a_kura_get',
    'kura.tpl.save' => 'a_kura_tpl_save',
    'kura.tpl.delete' => 'a_kura_tpl_delete',
    'kura.start' => 'a_kura_start',
    'kura.reveal' => 'a_kura_reveal',
    'kura.finish' => 'a_kura_finish',
    'kura.delete' => 'a_kura_delete',
];
