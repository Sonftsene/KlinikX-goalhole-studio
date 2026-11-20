<?php
/**
 * Çevrimiçi durum ve açık sayfa (4.27): birim yöneticisi Kullanıcılar sayfasında kimin şu an çevrimiçi olduğunu ve
 * hangi bölümde olduğunu anlık görür.
 *  - İstemci canlı yoklamada (live) açık sayfanın bölümünü gönderir. Yalnız bölüm saklanır (#/mesaj, #/profil/guvenlik…);
 *    sohbet, gönderi gibi kayıt numaraları atılır, içerik hiç gönderilmez.
 *  - Saklanan yalnız son durumdur (presence: kişi başına tek satır, üzerine yazılır); çıkışta silinir, 1 günden eskiler temizlenir.
 *  - Ayar (presence_pages, varsayılan açık): kapalıysa yönetici yalnız çevrimiçi / son görülme bilgisini görür, bölümü görmez.
 *  - Durum: çevrimiçi (son 90 sn, sayfa açık), arka planda (son 90 sn, sekme/uygulama arkada), değilse son görülme.
 */
declare(strict_types=1);

const PR_ONLINE = 90;

function pr_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (setting('pr_schema', '') === '1') return;
    $end = DB_DRIVER === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    db()->exec("CREATE TABLE IF NOT EXISTS presence (user_id INT NOT NULL PRIMARY KEY, page VARCHAR(60) NOT NULL DEFAULT '', label VARCHAR(80) NOT NULL DEFAULT '', vis INT NOT NULL DEFAULT 1, dev VARCHAR(10) NOT NULL DEFAULT '', at INT NOT NULL DEFAULT 0)$end");
    set_setting('pr_schema', '1');
}

/** Sayfa adresini bölüme indir: kayıt numaraları ve anahtarlar atılır */
function pr_page(string $h): string
{
    $parts = array_values(array_filter(explode('/', preg_replace('/^#\/?/', '', $h)), fn($x) => $x !== ''));
    $o = [];
    foreach (array_slice($parts, 0, 2) as $p) { if (!preg_match('/^[a-z][a-z-]{1,20}$/', $p)) break; $o[] = $p; }
    return '#/' . implode('/', $o);
}

/** Canlı yoklamadan çağrılır: değiştiyse ya da 30 sn geçtiyse yaz */
function pr_touch(array $me): void
{
    if (!empty($me['sa_virtual'])) return;
    global $IN;
    $page = pr_page((string)($IN['pg'] ?? ''));
    $label = mb_substr(trim(preg_replace('/\s+/', ' ', (string)($IN['pgl'] ?? ''))), 0, 80);
    $vis = ($IN['vis'] ?? 'visible') === 'hidden' ? 0 : 1;
    $dev = ($IN['dev'] ?? '') === 'm' ? 'telefon' : 'bilgisayar';
    $key = $page . '|' . $label . '|' . $vis;
    $last = $_SESSION['pr'] ?? null;
    if (is_array($last) && $last[0] === $key && $last[1] > time() - 30) return;
    $_SESSION['pr'] = [$key, time()];
    try {
        pr_ensure();
        $n = q('UPDATE presence SET page = ?, label = ?, vis = ?, dev = ?, at = ? WHERE user_id = ?', [$page, $label, $vis, $dev, time(), (int)$me['id']])->rowCount();
        if ($n === 0) { try { q('INSERT INTO presence (user_id, page, label, vis, dev, at) VALUES (?, ?, ?, ?, ?, ?)', [(int)$me['id'], $page, $label, $vis, $dev, time()]); } catch (Throwable $e) { /* aynı anda yazıldı */ } }
    } catch (Throwable $e) { error_log('[dupcii] çevrimiçi: ' . $e->getMessage()); }
}
function pr_clear(int $uid): void
{
    try { pr_ensure(); q('DELETE FROM presence WHERE user_id = ?', [$uid]); } catch (Throwable $e) { /* */ }
    unset($_SESSION['pr']);
}

/** Yönetici için: kişi → durum */
function pr_map(): array
{
    pr_ensure();
    $pages = setting('presence_pages', '1') === '1';
    $o = [];
    foreach (all('SELECT * FROM presence WHERE at > ?', [time() - 86400]) as $r) {
        $age = time() - (int)$r['at'];
        $state = $age <= PR_ONLINE ? ((int)$r['vis'] === 1 ? 'online' : 'away') : 'off';
        $o[(int)$r['user_id']] = ['state' => $state, 'at' => date('Y-m-d H:i:s', (int)$r['at']), 'dev' => $r['dev'],
            'page' => $pages && $state !== 'off' ? $r['page'] : null, 'label' => $pages && $state !== 'off' ? $r['label'] : null];
    }
    return $o;
}

function a_presence_list(): void
{
    need_admin();
    out(['map' => (object)pr_map(), 'pages' => setting('presence_pages', '1') === '1', 'now' => now()]);
}
function a_presence_cfg(): void
{
    $me = need_admin();
    set_setting('presence_pages', b('pages') ? '1' : '0');
    audit($me, 'presence.cfg', b('pages') ? 'Açık sayfa yönetimde görünür' : 'Açık sayfa yönetimde gizli');
    out(['pages' => setting('presence_pages', '1') === '1']);
}

$GLOBALS['NM_JOBS']['presence_gc'] = function (bool $force): void {
    try { pr_ensure(); q('DELETE FROM presence WHERE at < ?', [time() - 86400]); } catch (Throwable $e) { /* */ }
};

return [
    'presence.list' => 'a_presence_list',
    'presence.cfg' => 'a_presence_cfg',
];
