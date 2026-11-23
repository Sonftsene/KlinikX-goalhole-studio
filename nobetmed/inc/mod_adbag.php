<?php
/**
 * Nöbet listesindeki ad ↔ portal hesabı kalıcı bağı (4.44.0).
 *
 * Bir liste adı bir hesapla bir kez eşleşince (kendiliğinden ya da yönetici eliyle) bağ hesap kimliğiyle saklanır:
 * listedeki ad ya da hesaptaki ad sonradan değişse de bağ kopmaz (names_match bağa bakar). Bağlı bir ad başka
 * bir hesap tarafından alınamaz; bağlı kişi adını kendisi değiştiremez (liste adıyla bütünleşik). Yönetici bağı
 * kurduğunda / çizelgede liste adı düzeltildiğinde hesap adı liste adına güncellenir.
 *
 * Tablo name_links: id, user_id, name (listede yazıldığı gibi), nkey (name_tokens anahtarı, tekil), src (auto|admin|rename), created_at, by_id
 */

function nl_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (setting('nl_schema', '') === '1') return;
    $my = DB_DRIVER === 'mysql';
    $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $end = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    db()->exec("CREATE TABLE IF NOT EXISTS name_links (id $pk, user_id INT NOT NULL, name VARCHAR(160) NOT NULL, nkey VARCHAR(190) NOT NULL, src VARCHAR(10) NOT NULL DEFAULT 'auto', created_at VARCHAR(19) NOT NULL, by_id INT NULL)$end");
    try { db()->exec('CREATE UNIQUE INDEX idx_nl_key ON name_links (nkey)'); } catch (Throwable $e) { /* var */ }
    try { db()->exec('CREATE INDEX idx_nl_user ON name_links (user_id)'); } catch (Throwable $e) { /* var */ }
    set_setting('nl_schema', '1');
}

function nl_key(string $name): string
{
    return implode(' ', name_tokens($name));
}

/** [anahtar => hesap] : bağlı liste adları + bağlı hesapların şimdiki adları (istek boyunca önbellekli) */
function nl_map(bool $reset = false): array
{
    static $cache = [];
    $id = function_exists('db') ? spl_object_id(db()) : 0;
    if ($reset) unset($cache[$id]);
    if (isset($cache[$id])) return $cache[$id];
    $m = [];
    if (setting('nl_schema', '') === '1') {
        try {
            foreach (all('SELECT user_id, nkey FROM name_links') as $r) $m[(string)$r['nkey']] = (int)$r['user_id'];
            if ($m) {
                $ids = implode(',', array_map('intval', array_unique(array_values($m))));
                foreach (all("SELECT id, name FROM users WHERE id IN ($ids)") as $u) { $k = nl_key((string)$u['name']); if ($k !== '' && !isset($m[$k])) $m[$k] = (int)$u['id']; }
            }
        } catch (Throwable $e) { $m = []; }
    }
    return $cache[$id] = $m;
}

/** Hesabın bağlı liste adları (en yenisi önce) */
function nl_links_of(int $uid): array
{
    if (setting('nl_schema', '') !== '1') return [];
    try { return all('SELECT id, name, src, created_at FROM name_links WHERE user_id = ? ORDER BY id DESC', [$uid]); } catch (Throwable $e) { return []; }
}

/** Bu ad (anahtarı) başka bir hesaba bağlı mı */
function nl_bound_to_other(string $name, int $uid): bool
{
    $u = nl_map()[nl_key($name)] ?? null;
    return $u !== null && $u !== $uid;
}

/** Büyük harfle yazılmış liste adını hesap adı gibi yaz (Türkçe: i → İ, ı → I) */
function nl_pretty(string $n): string
{
    $n = trim(preg_replace('/\s+/u', ' ', $n) ?? $n);
    if ($n === '' || mb_strtoupper($n, 'UTF-8') !== $n) return $n;
    $low = mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $n), 'UTF-8');
    return implode(' ', array_map(function ($w) {
        if ($w === '') return $w;
        $f = mb_substr($w, 0, 1, 'UTF-8');
        $f = $f === 'i' ? 'İ' : ($f === 'ı' ? 'I' : mb_strtoupper($f, 'UTF-8'));
        return $f . mb_substr($w, 1, null, 'UTF-8');
    }, explode(' ', $low)));
}

/** Bağ kur. $sync: hesap adını liste adına güncelle. Anahtar başka hesaba bağlıysa hata (yönetici $move ile taşıyabilir). */
function nl_link(int $uid, string $name, string $src, bool $sync, ?int $byId = null, bool $move = false): void
{
    nl_ensure();
    $name = trim(mb_substr($name, 0, 160));
    $k = nl_key($name);
    if ($k === '' || count(explode(' ', $k)) < 2) fail('Liste adı en az ad ve soyaddan oluşmalı.');
    $cur = one('SELECT id, user_id FROM name_links WHERE nkey = ?', [$k]);
    if ($cur && (int)$cur['user_id'] !== $uid) {
        if (!$move) fail('Bu ad başka bir hesaba bağlı.', 409);
        q('DELETE FROM name_links WHERE id = ?', [(int)$cur['id']]);
        $cur = null;
    }
    if (!$cur) q('INSERT INTO name_links (user_id, name, nkey, src, created_at, by_id) VALUES (?, ?, ?, ?, ?, ?)', [$uid, $name, $k, $src, now(), $byId]);
    if ($sync) {
        $pretty = nl_pretty($name);
        // Başka bir hesabın bağlı adıyla çakışmasın
        if (!nl_bound_to_other($pretty, $uid)) q('UPDATE users SET name = ? WHERE id = ?', [mb_substr($pretty, 0, 120), $uid]);
    }
    nl_map(true);
}

/** Güncel listelerdeki adlar (yalnız şimdiki dosya sürümleri) */
function nl_roster_names(): array
{
    $o = [];
    try {
        foreach (all("SELECT DISTINCT s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE r.kind <> 'tablo'") as $r) {
            $n = trim((string)$r['name']); $k = nl_key($n);
            if ($k !== '' && count(explode(' ', $k)) >= 2 && !isset($o[$k])) $o[$k] = $n;
        }
    } catch (Throwable $e) { /* liste yok */ }
    return $o;
}

/**
 * Kendiliğinden bağ: bağı olmayan liste adı tam olarak tek bir bağsız hesapla eşleşiyorsa bağlanır (hesap adına dokunulmaz).
 * $onlyUid verilirse yalnız o hesap için.
 */
function nl_autobind(?int $onlyUid = null): int
{
    nl_ensure();
    $map = nl_map(true);
    $boundUsers = array_flip(array_map('intval', array_column(all('SELECT DISTINCT user_id FROM name_links'), 'user_id')));
    $users = [];
    foreach (all("SELECT id, name FROM users WHERE status IN ('active', 'pending')" . ($onlyUid ? ' AND id = ' . (int)$onlyUid : '')) as $u) if (!isset($boundUsers[(int)$u['id']])) $users[] = $u;
    if (!$users) return 0;
    $n = 0;
    $taken = [];
    $rn = nl_roster_names();
    foreach ($rn as $k => $name) {
        if (isset($map[$k])) continue;
        $c = array_values(array_filter($users, fn($u) => !isset($taken[(int)$u['id']]) && names_match($name, (string)$u['name'])));
        if (count($c) !== 1) continue;
        // Aynı hesaba birden çok liste adı uyuyorsa (ör. iki farklı kişi) tam eşleşeni tercih et; belirsizse dokunma
        $uid = (int)$c[0]['id'];
        $others = array_filter($rn, fn($nn, $kk) => $kk !== $k && !isset($map[$kk]) && names_match($nn, (string)$c[0]['name']), ARRAY_FILTER_USE_BOTH);
        if ($others && nl_key((string)$c[0]['name']) !== $k) continue;
        try { q('INSERT INTO name_links (user_id, name, nkey, src, created_at, by_id) VALUES (?, ?, ?, ?, ?, NULL)', [$uid, $name, $k, 'auto', now()]); $n++; $taken[$uid] = 1; } catch (Throwable $e) { /* yarış */ }
    }
    if ($n) nl_map(true);
    return $n;
}

/* ---------------- Uçlar ---------------- */

/** Yönetici / yayıncı: liste adları ve hesaplar, bağlar */
function a_names_list(): void
{
    need_publisher();
    nl_ensure();
    $map = nl_map(true);
    $users = [];
    foreach (all("SELECT id, name, status FROM users WHERE status IN ('active', 'pending') ORDER BY name") as $u) $users[(int)$u['id']] = ['id' => (int)$u['id'], 'name' => (string)$u['name'], 'links' => []];
    foreach (all('SELECT id, user_id, name, src, created_at FROM name_links ORDER BY id') as $l) if (isset($users[(int)$l['user_id']])) $users[(int)$l['user_id']]['links'][] = ['id' => (int)$l['id'], 'name' => (string)$l['name'], 'src' => (string)$l['src'], 'at' => (string)$l['created_at']];
    $lid = [];
    foreach (all('SELECT id, nkey FROM name_links') as $l) $lid[(string)$l['nkey']] = (int)$l['id'];
    $names = [];
    foreach (nl_roster_names() as $k => $n) {
        $uid = $map[$k] ?? null;
        $sug = [];
        if ($uid === null) foreach ($users as $u) if (!$u['links'] && names_match($n, $u['name'])) $sug[] = $u['id'];
        $names[] = ['name' => $n, 'uid' => $uid, 'link_id' => $lid[$k] ?? null, 'suggest' => $sug];
    }
    usort($names, fn($a, $b) => strcmp(nl_key($a['name']), nl_key($b['name'])));
    out(['names' => $names, 'users' => array_values($users)]);
}

/** Yönetici: liste adını hesaba bağla (hesap adı liste adına güncellenir) */
function a_names_link(): void
{
    $me = need_admin();
    $uid = (int)i('user_id');
    $u = one("SELECT id, name FROM users WHERE id = ? AND status IN ('active', 'pending')", [$uid]) ?? fail('Kullanıcı bulunamadı.', 404);
    $name = s('name', 160);
    nl_link($uid, $name, 'admin', !array_key_exists('sync', $GLOBALS['IN']) || b('sync'), (int)$me['id'], b('move'));
    audit($me, 'user.edit', $u['name'], 'Liste adına bağlandı: ' . $name);
    out(['ok' => true, 'name' => (string)val('SELECT name FROM users WHERE id = ?', [$uid])]);
}

function a_names_unlink(): void
{
    $me = need_admin();
    nl_ensure();
    $l = one('SELECT * FROM name_links WHERE id = ?', [(int)i('id')]) ?? fail('Bağ bulunamadı.', 404);
    q('DELETE FROM name_links WHERE id = ?', [(int)$l['id']]);
    nl_map(true);
    audit($me, 'user.edit', (string)val('SELECT name FROM users WHERE id = ?', [(int)$l['user_id']]), 'Liste adı bağı kaldırıldı: ' . $l['name']);
    out(['ok' => true]);
}

function a_names_auto(): void
{
    need_publisher();
    out(['linked' => nl_autobind()]);
}

/** Çizelgede liste adı düzeltildi: eski ad bir hesaba bağlıysa yeni ad da bağlanır ve hesap adı güncellenir */
function a_names_rename(): void
{
    $me = need_publisher();
    nl_ensure();
    $old = s('old', 160); $new = s('new', 160);
    $map = nl_map(true);
    $uid = $map[nl_key($old)] ?? null;
    $nu = $map[nl_key($new)] ?? null;
    if ($nu !== null && $nu !== $uid) fail('Bu ad listede başka bir kişinin hesabına bağlı.', 409);
    if ($uid === null) out(['uid' => null]);
    nl_link($uid, $new, 'rename', true, (int)$me['id']);
    audit($me, 'user.edit', $new, 'Liste adı düzeltildi: ' . $old . ' → ' . $new);
    out(['uid' => $uid, 'name' => (string)val('SELECT name FROM users WHERE id = ?', [$uid])]);
}

return [
    'names.list' => 'a_names_list',
    'names.link' => 'a_names_link',
    'names.unlink' => 'a_names_unlink',
    'names.auto' => 'a_names_auto',
    'names.rename' => 'a_names_rename',
];
