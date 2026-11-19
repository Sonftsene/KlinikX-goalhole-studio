<?php
/**
 * Mesajlaşma (4.3): birim grubu (kendiliğinden), özel gruplar (birimler arası olabilir), birebir sohbet.
 * Veriler hastanenin ortak veritabanında (hdb(); başka hastane erişemez). Kişiler (birim anahtarı, kullanıcı no) ile tutulur.
 *  - Birim grubu: birimin tüm etkin kişileri; yöneticisi birimin yetkilileri (mesaj modülünde "Yönetir").
 *  - Özel grup: yetkililer kurar; kendi biriminden herkesi, diğer birimlerden yalnız yönetici/yayıncıları ekleyebilir.
 *  - Birebir: kendi birimindeki kişiyle ya da aynı grupta olduğu kişiyle.
 * KVKK: T.C. kimlik numarası içeren mesaj reddedilir; dosyalar yalnız sohbet üyelerine açılır.
 * Bildirim: aynı birimdeki alıcıya anında; diğer birimdeki alıcıya kendi biriminin görevi (en geç ~5 dk) iletir.
 */
declare(strict_types=1);

const C_SCHEMA = 3;
const C_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const C_RETENTION = [0, 1, 7, 30, 90, 180, 365, 730];
const C_MAX_BODY = 4000;
const C_MAX_FILE = 25 * 1048576;

/** Mesajlaşma tablolarıyla birlikte hastane veritabanı */
function cdb(): ?PDO
{
    static $ok = false;
    $p = function_exists('hdb') ? hdb() : null;
    if (!$p || $ok) return $p;
    $v = (int)($p->query("SELECT v FROM h_settings WHERE k = 'chat_schema'")->fetchColumn() ?: 0);
    if ($v < C_SCHEMA) {
        $p->exec("CREATE TABLE IF NOT EXISTS c_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
            tkey TEXT NOT NULL DEFAULT '', direct_key TEXT NULL UNIQUE, only_admins INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
            last_id INTEGER NOT NULL DEFAULT 0, last_at TEXT NULL)");
        $p->exec("CREATE TABLE IF NOT EXISTS c_members (chat_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL, unit_name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'member', joined_at TEXT NOT NULL, last_read INTEGER NOT NULL DEFAULT 0, notified INTEGER NOT NULL DEFAULT 0, muted INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (chat_id, tkey, user_id))");
        $p->exec("CREATE TABLE IF NOT EXISTS c_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'text', file_id INTEGER NULL, reply_to INTEGER NULL, created_at TEXT NOT NULL, deleted_at TEXT NULL)");
        $p->exec('CREATE TABLE IF NOT EXISTS c_files (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, name TEXT NOT NULL, stored TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL)');
        $p->exec('CREATE INDEX IF NOT EXISTS c_msgs_chat ON c_msgs (chat_id, id)');
        $p->exec('CREATE INDEX IF NOT EXISTS c_members_user ON c_members (tkey, user_id)');
        // Şema 2 (4.4): tepkiler, anket oyları, mesaj ek bilgisi (anket seçenekleri, iletildi, ses süresi), değişiklik zamanı,
        // sabitlenen mesaj, saklama süresi, davet bağlantısı, bahsetme
        $p->exec('CREATE TABLE IF NOT EXISTS c_reacts (msg_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY (msg_id, tkey, user_id))');
        $p->exec('CREATE TABLE IF NOT EXISTS c_votes (msg_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY (msg_id, tkey, user_id, opt))');
        foreach (['c_msgs' => ['meta TEXT NULL', 'upd TEXT NULL'], 'c_chats' => ['pinned_id INTEGER NULL', 'retention_days INTEGER NOT NULL DEFAULT 0', 'invite_token TEXT NULL', 'invite_expires TEXT NULL'],
            'c_members' => ['mentioned INTEGER NOT NULL DEFAULT 0']] as $tb => $cols) {
            foreach ($cols as $col) { try { $p->exec("ALTER TABLE $tb ADD COLUMN $col"); } catch (Throwable $e) { /* zaten var */ } }
        }
        $p->exec('CREATE INDEX IF NOT EXISTS c_msgs_upd ON c_msgs (chat_id, upd)');
        // Şema 3 (4.6): gizlilik tercihleri, engellenenler, benden sil, yıldızlı, katılma istekleri; sohbet başına durum; grup izinleri
        $p->exec("CREATE TABLE IF NOT EXISTS c_prefs (tkey TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', unit_name TEXT NOT NULL DEFAULT '',
            about TEXT NOT NULL DEFAULT '', about_vis TEXT NOT NULL DEFAULT 'all', seen_vis TEXT NOT NULL DEFAULT 'contacts', receipts INTEGER NOT NULL DEFAULT 1,
            add_groups TEXT NOT NULL DEFAULT 'all', findable INTEGER NOT NULL DEFAULT 0, dm_from TEXT NOT NULL DEFAULT 'all', ret_default INTEGER NOT NULL DEFAULT 0,
            last_seen TEXT NULL, typing_chat INTEGER NULL, typing_at TEXT NULL, PRIMARY KEY (tkey, user_id))");
        $p->exec('CREATE TABLE IF NOT EXISTS c_blocks (tkey TEXT NOT NULL, user_id INTEGER NOT NULL, btkey TEXT NOT NULL, buid INTEGER NOT NULL, bname TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tkey, user_id, btkey, buid))');
        $p->exec('CREATE TABLE IF NOT EXISTS c_hidden (msg_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY (msg_id, tkey, user_id))');
        $p->exec('CREATE TABLE IF NOT EXISTS c_stars (msg_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, at TEXT NOT NULL, PRIMARY KEY (msg_id, tkey, user_id))');
        $p->exec('CREATE TABLE IF NOT EXISTS c_joinreq (chat_id INTEGER NOT NULL, tkey TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL, unit_name TEXT NOT NULL DEFAULT \'\', at TEXT NOT NULL, PRIMARY KEY (chat_id, tkey, user_id))');
        foreach (['c_members' => ['pinned_at TEXT NULL', 'archived INTEGER NOT NULL DEFAULT 0', 'mute_until TEXT NULL', 'cleared_id INTEGER NOT NULL DEFAULT 0', 'unread_mark INTEGER NOT NULL DEFAULT 0', 'deleted INTEGER NOT NULL DEFAULT 0'],
            'c_msgs' => ['edited_at TEXT NULL'], 'c_chats' => ["perm_edit TEXT NOT NULL DEFAULT 'admins'", "perm_add TEXT NOT NULL DEFAULT 'admins'", 'approve_join INTEGER NOT NULL DEFAULT 0', 'photo_file_id INTEGER NULL']] as $tb => $cols) {
            foreach ($cols as $col) { try { $p->exec("ALTER TABLE $tb ADD COLUMN $col"); } catch (Throwable $e) { /* zaten var */ } }
        }
        $p->prepare("INSERT OR REPLACE INTO h_settings (k, v) VALUES ('chat_schema', ?)")->execute([(string)C_SCHEMA]);
    }
    $ok = true;
    return $p;
}

function c_need(): array
{
    $me = need_user();
    if (!cdb()) fail('Mesajlaşma bu kurulumda yok (çok birimli yapı gerekir).', 400);
    return $me;
}
function c_tk(): string { return (string)nm_tenant()['tkey']; }
function c_unit(): string { if (function_exists('nm_tenant_fix_placeholder')) nm_tenant_fix_placeholder(); return (string)nm_tenant()['name']; }
function c_dir(): string { $d = NM_ROOT . '/uploads/h/' . (int)nm_tenant()['hospital_id'] . '/chat'; if (!is_dir($d)) @mkdir($d, 0700, true); return $d; }

/** Birimin grubu (yoksa kurulur) */
function c_unit_chat(): array
{
    $c = h_one("SELECT * FROM c_chats WHERE kind = 'unit' AND tkey = ?", [c_tk()]);
    if ($c) return $c;
    h_q("INSERT INTO c_chats (kind, name, tkey, created_by, created_at) VALUES ('unit', ?, ?, ?, ?)", [c_unit(), c_tk(), c_tk(), now()]);
    return h_one('SELECT * FROM c_chats WHERE id = ?', [(int)cdb()->lastInsertId()]);
}

/** Erişim: [sohbet, üye satırı (birim grubunda yoksa oluşturulur), yönetici mi] — erişemezse durur */
function c_access(array $me, int $id): array
{
    $c = h_one('SELECT * FROM c_chats WHERE id = ?', [$id]) ?? fail('Sohbet bulunamadı.', 404);
    $m = h_one('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$id, c_tk(), (int)$me['id']]);
    if ($c['kind'] === 'unit') {
        if ($c['tkey'] !== c_tk()) fail('Bu sohbete erişiminiz yok.', 403);
        if (!$m) {
            h_q('INSERT OR IGNORE INTO c_members (chat_id, tkey, user_id, name, unit_name, joined_at, last_read, notified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [$id, c_tk(), $me['id'], $me['name'], c_unit(), now(), (int)$c['last_id'], (int)$c['last_id']]);
            $m = h_one('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$id, c_tk(), (int)$me['id']]);
        }
        $GLOBALS['C_ME_ROW'] = $m;
        return [$c, $m, is_publisher($me)];
    }
    if (!$m) fail('Bu sohbete erişiminiz yok.', 403);
    $GLOBALS['C_ME_ROW'] = $m;
    return [$c, $m, $m['role'] === 'admin'];
}

/** T.C. kimlik numarası (algoritma denetimli) içeriyor mu */
function c_has_tckn(string $s): bool
{
    $flat = preg_replace('/(?<=\d)[ .\-](?=\d)/', '', $s);
    if (!preg_match_all('/(?<!\d)([1-9]\d{10})(?!\d)/', (string)$flat, $mm)) return false;
    foreach ($mm[1] as $n) {
        $d = array_map('intval', str_split($n));
        $d10 = ((($d[0] + $d[2] + $d[4] + $d[6] + $d[8]) * 7) - ($d[1] + $d[3] + $d[5] + $d[7])) % 10;
        if ($d10 < 0) $d10 += 10;
        if ($d10 === $d[9] && (array_sum(array_slice($d, 0, 10)) % 10) === $d[10]) return true;
    }
    return false;
}

function c_msg_out(array $r, ?array $files = null): array
{
    $o = ['id' => (int)$r['id'], 'tk' => $r['tkey'], 'uid' => (int)$r['user_id'], 'name' => $r['name'], 'kind' => $r['kind'], 'at' => $r['created_at'],
        'mine' => $r['tkey'] === c_tk() && (int)$r['user_id'] === (int)(current_user()['id'] ?? 0), 'reply' => $r['reply_to'] ? (int)$r['reply_to'] : null];
    if ($r['deleted_at']) { $o['deleted'] = true; $o['body'] = ''; return $o; }
    $o['body'] = $r['body'];
    if (!empty($r['edited_at'])) $o['edited'] = true;
    if ($r['file_id']) {
        $f = $files[(int)$r['file_id']] ?? h_one('SELECT * FROM c_files WHERE id = ?', [(int)$r['file_id']]);
        if ($f) $o['file'] = ['id' => (int)$f['id'], 'name' => $f['name'], 'mime' => $f['mime'], 'size' => (int)$f['size'], 'url' => 'api.php?action=cfile&id=' . (int)$f['id'] . nm_link_param()];
    }
    $meta = json_decode((string)($r['meta'] ?? ''), true) ?: [];
    if (!empty($meta['fwd'])) $o['fwd'] = true;
    if (!empty($meta['dur'])) $o['dur'] = (int)$meta['dur'];
    if ($r['kind'] === 'poll') $o['poll'] = ['opts' => array_map(fn($t) => ['t' => (string)$t, 'n' => 0, 'mine' => false], (array)($meta['opts'] ?? [])), 'multi' => !empty($meta['multi']), 'voters' => 0];
    return $o;
}

/** Mesaj listesi + yanıtlanan mesajların kısa önizlemesi */
function c_msgs_out(array $rows): array
{
    // Benim görünümüm: "benim için temizle" öncesi ve "benden sil" denenler gösterilmez
    $mr = $GLOBALS['C_ME_ROW'] ?? null;
    $uid = (int)(current_user()['id'] ?? 0);
    if ($rows) {
        $cl = $mr ? (int)($mr['cleared_id'] ?? 0) : 0;
        $hid = array_flip(array_map('intval', array_column(h_all('SELECT msg_id FROM c_hidden WHERE tkey = ? AND user_id = ? AND msg_id IN (' . implode(',', array_map(fn($r) => (int)$r['id'], $rows)) . ')', [c_tk(), $uid]), 'msg_id')));
        $rows = array_values(array_filter($rows, fn($r) => (int)$r['id'] > $cl && !isset($hid[(int)$r['id']])));
    }
    $stars = $rows ? array_flip(array_map('intval', array_column(h_all('SELECT msg_id FROM c_stars WHERE tkey = ? AND user_id = ? AND msg_id IN (' . implode(',', array_map(fn($r) => (int)$r['id'], $rows)) . ')', [c_tk(), $uid]), 'msg_id'))) : [];
    $fids = array_filter(array_map(fn($r) => (int)$r['file_id'], $rows));
    $files = [];
    if ($fids) foreach (h_all('SELECT * FROM c_files WHERE id IN (' . implode(',', array_map('intval', $fids)) . ')') as $f) $files[(int)$f['id']] = $f;
    $out = array_map(fn($r) => c_msg_out($r, $files) + (isset($stars[(int)$r['id']]) ? ['star' => true] : []), $rows);
    $rids = array_values(array_unique(array_filter(array_map(fn($r) => (int)$r['reply_to'], $rows))));
    $refs = [];
    if ($rids) foreach (h_all('SELECT id, name, body, kind, deleted_at FROM c_msgs WHERE id IN (' . implode(',', $rids) . ')') as $x) {
        $refs[(int)$x['id']] = ['name' => $x['name'], 'body' => $x['deleted_at'] ? 'Silinen mesaj' : ($x['body'] !== '' ? mb_substr($x['body'], 0, 120) : ($x['kind'] === 'image' ? 'Fotoğraf' : 'Dosya'))];
    }
    foreach ($out as &$o) if ($o['reply'] && isset($refs[$o['reply']])) $o['reply_ref'] = $refs[$o['reply']];
    unset($o);
    // Tepkiler ve anket oyları (toplu)
    $ids = array_map(fn($r) => (int)$r['id'], $rows);
    if ($ids) {
        $in = implode(',', $ids);
        $me = (int)(current_user()['id'] ?? 0);
        $rx = [];
        foreach (h_all("SELECT msg_id, emoji, tkey, user_id FROM c_reacts WHERE msg_id IN ($in)") as $x) {
            $k = (int)$x['msg_id'];
            $rx[$k][$x['emoji']] = $rx[$k][$x['emoji']] ?? ['e' => $x['emoji'], 'n' => 0, 'mine' => false];
            $rx[$k][$x['emoji']]['n']++;
            if ($x['tkey'] === c_tk() && (int)$x['user_id'] === $me) $rx[$k][$x['emoji']]['mine'] = true;
        }
        $vt = [];
        foreach (h_all("SELECT msg_id, opt, tkey, user_id FROM c_votes WHERE msg_id IN ($in)") as $x) $vt[(int)$x['msg_id']][] = $x;
        foreach ($out as &$o) {
            if (isset($rx[$o['id']])) $o['reacts'] = array_values($rx[$o['id']]);
            if (isset($o['poll'])) {
                $voters = [];
                foreach ($vt[$o['id']] ?? [] as $v) {
                    $i = (int)$v['opt'];
                    if (!isset($o['poll']['opts'][$i])) continue;
                    $o['poll']['opts'][$i]['n']++;
                    if ($v['tkey'] === c_tk() && (int)$v['user_id'] === $me) $o['poll']['opts'][$i]['mine'] = true;
                    $voters[$v['tkey'] . ':' . $v['user_id']] = 1;
                }
                $o['poll']['voters'] = count($voters);
            }
        }
        unset($o);
    }
    return $out;
}

function c_preview(?array $r): string
{
    if (!$r) return '';
    if ($r['deleted_at']) return 'Silinen mesaj';
    if ($r['kind'] === 'system') return $r['body'];
    $b = $r['kind'] === 'poll' ? '📊 Anket: ' . $r['body'] : ($r['body'] !== '' ? $r['body'] : ($r['kind'] === 'image' ? '📷 Fotoğraf' : ($r['kind'] === 'audio' ? '🎤 Sesli mesaj' : '📎 Dosya')));
    return mb_substr($r['name'] . ': ' . preg_replace('/\s+/', ' ', $b), 0, 90);
}

/** Birebir sohbette karşı taraf */
function c_other(array $c, array $me): ?array
{
    return h_one('SELECT * FROM c_members WHERE chat_id = ? AND NOT (tkey = ? AND user_id = ?)', [(int)$c['id'], c_tk(), (int)$me['id']]);
}

function c_chat_row(array $c, array $me, array $m): array
{
    $cl = (int)($m['cleared_id'] ?? 0);
    $last = $c['last_id'] && (int)$c['last_id'] > $cl ? h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)$c['last_id']]) : null;
    $unread = (int)h_val('SELECT COUNT(*) FROM c_msgs WHERE chat_id = ? AND id > ? AND NOT (tkey = ? AND user_id = ?) AND deleted_at IS NULL', [(int)$c['id'], max((int)$m['last_read'], $cl), c_tk(), (int)$me['id']]);
    $name = $c['name'];
    $sub = '';
    $other = null;
    if ($c['kind'] === 'direct') { $o = c_other($c, $me); $name = $o['name'] ?? 'Kişi'; $sub = ($o && $o['tkey'] !== c_tk()) ? $o['unit_name'] : ''; if ($o) $other = ['tk' => $o['tkey'], 'uid' => (int)$o['user_id']]; }
    $mu = (string)($m['mute_until'] ?? '');
    return ['id' => (int)$c['id'], 'kind' => $c['kind'], 'name' => $name, 'sub' => $sub, 'last' => c_preview($last), 'last_at' => $c['last_at'] ?: $c['created_at'],
        'unread' => $unread, 'muted' => (int)$m['muted'] === 1 || ($mu !== '' && $mu > now()), 'mute_until' => $mu !== '' && $mu > now() ? $mu : null,
        'only_admins' => (int)$c['only_admins'] === 1, 'pinned' => !empty($m['pinned_at']), 'archived' => (int)($m['archived'] ?? 0) === 1, 'unread_mark' => (int)($m['unread_mark'] ?? 0) === 1,
        'photo' => function_exists('c_photo_url') ? c_photo_url(isset($c['photo_file_id']) ? (int)$c['photo_file_id'] : null) : null, 'other' => $other];
}

/* ---------------- Uçlar ---------------- */

function a_chat_list(): void
{
    $me = c_need();
    $u = c_unit_chat();
    c_access($me, (int)$u['id']); // üye satırı
    $rows = h_all('SELECT c.* FROM c_chats c JOIN c_members m ON m.chat_id = c.id WHERE m.tkey = ? AND m.user_id = ? ORDER BY COALESCE(c.last_at, c.created_at) DESC', [c_tk(), (int)$me['id']]);
    $items = [];
    foreach ($rows as $c) {
        if ($c['kind'] === 'unit' && $c['tkey'] !== c_tk()) continue;
        $m = h_one('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$c['id'], c_tk(), (int)$me['id']]);
        // Silinen sohbet: yeni mesaj gelene kadar listede yok
        if ((int)($m['deleted'] ?? 0) === 1) {
            if ((int)$c['last_id'] <= (int)$m['cleared_id']) continue;
            h_q('UPDATE c_members SET deleted = 0 WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$c['id'], c_tk(), (int)$me['id']]);
        }
        $items[] = c_chat_row($c, $me, $m);
    }
    // Sabitlenenler üstte (sabitleme sırasına göre), sonra son mesaja göre
    usort($items, function ($a, $b) use ($rows) { return [$b['pinned'] ? 1 : 0, $b['last_at']] <=> [$a['pinned'] ? 1 : 0, $a['last_at']]; });
    if (function_exists('c_pref_touch')) c_pref_touch($me);
    out(['items' => $items, 'can_group' => is_publisher($me)]);
}

function a_chat_unread(): void
{
    $me = need_user();
    if (!cdb() || !nm_mod_on('mesaj')) out(['unread' => 0]);
    out(['unread' => c_unread_total($me)]);
}

/** Okunmamış sohbet mesajı sayısı (sessize alınanlar hariç) + okunmadı işaretli sohbetler */
function c_unread_total(array $me): int
{
    $u = c_unit_chat();
    c_access($me, (int)$u['id']);
    $n = (int)h_val('SELECT COUNT(*) FROM c_msgs x JOIN c_members m ON m.chat_id = x.chat_id AND m.tkey = ? AND m.user_id = ? JOIN c_chats c ON c.id = x.chat_id
        WHERE x.id > m.last_read AND x.id > m.cleared_id AND m.muted = 0 AND (m.mute_until IS NULL OR m.mute_until < ?) AND NOT (x.tkey = ? AND x.user_id = ?) AND x.deleted_at IS NULL AND (c.kind <> \'unit\' OR c.tkey = ?)', [c_tk(), (int)$me['id'], now(), c_tk(), (int)$me['id'], c_tk()]);
    $n += (int)h_val('SELECT COUNT(*) FROM c_members WHERE tkey = ? AND user_id = ? AND unread_mark = 1', [c_tk(), (int)$me['id']]);
    if (function_exists('c_pref_touch')) c_pref_touch($me);
    return $n;
}

/** Sohbeti aç: bilgi, üyeler, son mesajlar; okundu işaretlenir, bu sohbetin bildirimleri kapanır */
function a_chat_open(): void
{
    $me = c_need();
    [$c, $m, $adm] = c_access($me, (int)i('id'));
    $rows = array_reverse(h_all('SELECT * FROM c_msgs WHERE chat_id = ? ORDER BY id DESC LIMIT 60', [(int)$c['id']]));
    c_mark_read($me, $c);
    $members = [];
    if ($c['kind'] === 'unit') {
        foreach (all("SELECT id, name FROM users WHERE status = 'active' ORDER BY name") as $u) $members[] = ['tk' => c_tk(), 'uid' => (int)$u['id'], 'name' => $u['name'], 'unit' => '', 'role' => 'member'];
    } else {
        foreach (h_all('SELECT * FROM c_members WHERE chat_id = ? ORDER BY role, name', [(int)$c['id']]) as $x) $members[] = ['tk' => $x['tkey'], 'uid' => (int)$x['user_id'], 'name' => $x['name'], 'unit' => $x['tkey'] === c_tk() ? '' : $x['unit_name'], 'role' => $x['role']];
    }
    $row = c_chat_row($c, $me, h_one('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$c['id'], c_tk(), (int)$me['id']]));
    $inv = null;
    if ($adm && $c['kind'] === 'group' && $c['invite_token'] && (!$c['invite_expires'] || $c['invite_expires'] > now())) $inv = ['token' => $c['invite_token'], 'expires' => $c['invite_expires']];
    h_q('UPDATE c_members SET unread_mark = 0 WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$c['id'], c_tk(), (int)$me['id']]);
    $grp = $c['kind'] === 'group';
    $peer = null;
    if ($c['kind'] === 'direct' && ($o = c_other($c, $me))) {
        $peer = c_profile_out($me, (string)$o['tkey'], (int)$o['user_id']);
        $peer['blocked_me'] = c_blocked_by((string)$o['tkey'], (int)$o['user_id'], c_tk(), (int)$me['id']);
    }
    out(['chat' => $row + ['descr' => $c['descr'], 'admin' => $adm, 'can_send' => !((int)$c['only_admins'] === 1 && !$adm),
            'can_pin' => $adm || $c['kind'] === 'direct', 'retention' => (int)$c['retention_days'], 'invite' => $inv,
            'perm_edit' => $c['perm_edit'] ?? 'admins', 'perm_add' => $c['perm_add'] ?? 'admins', 'approve_join' => (int)($c['approve_join'] ?? 0) === 1,
            'can_edit_info' => $grp && ($adm || ($c['perm_edit'] ?? 'admins') === 'all'), 'can_add' => $grp && ($adm || ($c['perm_add'] ?? 'admins') === 'all'),
            'joinreqs' => $grp && $adm ? c_joinreqs($c) : [], 'peer' => $peer],
        'members' => $members, 'msgs' => c_msgs_out($rows), 'more' => count($rows) === 60, 'pinned' => c_pinned_out($c), 'emojis' => C_EMOJIS, 'now' => now()]);
}

/** Sabitlenen mesajın kısa hâli */
function c_pinned_out(array $c): ?array
{
    if (empty($c['pinned_id'])) return null;
    $x = h_one('SELECT * FROM c_msgs WHERE id = ? AND chat_id = ? AND deleted_at IS NULL', [(int)$c['pinned_id'], (int)$c['id']]);
    return $x ? ['id' => (int)$x['id'], 'name' => $x['name'], 'text' => mb_substr(c_preview($x), mb_strlen($x['name']) + 2, 140)] : null;
}

/** Değişiklik zamanı: tepki / oy / sabitleme yoklamada diğer üyelere yansısın */
function c_touch(int $msgId): void
{
    h_q('UPDATE c_msgs SET upd = ? WHERE id = ?', [now(), $msgId]);
}

function c_mark_read(array $me, array $c): void
{
    h_q('UPDATE c_members SET last_read = ?, notified = MAX(notified, ?) WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$c['last_id'], (int)$c['last_id'], (int)$c['id'], c_tk(), (int)$me['id']]);
    q("UPDATE notifications SET read_at = ? WHERE user_id = ? AND kind = 'chat' AND url = ? AND read_at IS NULL", [now(), $me['id'], '#/mesaj/' . (int)$c['id']]);
}

/** Eski mesajlar (yukarı kaydırınca) */
function a_chat_older(): void
{
    $me = c_need();
    [$c] = c_access($me, (int)i('id'));
    $rows = array_reverse(h_all('SELECT * FROM c_msgs WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT 60', [(int)$c['id'], (int)i('before')]));
    out(['msgs' => c_msgs_out($rows), 'more' => count($rows) === 60]);
}

/** Yoklama: yeni mesajlar, son 10 dakikada silinenler, okunma; ekran açıksa okundu sayılır */
function a_chat_poll(): void
{
    $me = c_need();
    [$c] = c_access($me, (int)i('id'));
    $after = (int)i('after');
    $rows = h_all('SELECT * FROM c_msgs WHERE chat_id = ? AND id > ? ORDER BY id LIMIT 200', [(int)$c['id'], $after]);
    $del = array_map('intval', array_column(h_all('SELECT id FROM c_msgs WHERE chat_id = ? AND deleted_at > ? AND id <= ?', [(int)$c['id'], date('Y-m-d H:i:s', time() - 600), $after]), 'id'));
    if (b('seen') && $rows) c_mark_read($me, h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$c['id']]));
    // Kendi son mesajımı kaç kişi okudu (gruplarda)
    $mineLast = (int)h_val('SELECT MAX(id) FROM c_msgs WHERE chat_id = ? AND tkey = ? AND user_id = ? AND deleted_at IS NULL', [(int)$c['id'], c_tk(), (int)$me['id']]);
    $readBy = $mineLast ? (int)h_val('SELECT COUNT(*) FROM c_members WHERE chat_id = ? AND last_read >= ? AND NOT (tkey = ? AND user_id = ?)', [(int)$c['id'], $mineLast, c_tk(), (int)$me['id']]) : 0;
    // Okundu bilgisi birebirde karşılıklı: biri kapattıysa gösterilmez
    $peer = null;
    if ($c['kind'] === 'direct' && ($o = c_other($c, $me))) {
        if (!(int)c_pref(c_tk(), (int)$me['id'])['receipts'] || !(int)c_pref((string)$o['tkey'], (int)$o['user_id'])['receipts']) $readBy = 0;
        $peer = c_profile_out($me, (string)$o['tkey'], (int)$o['user_id']);
    }
    c_pref_touch($me);
    // Tepki / oy değişen eski mesajlar (son yoklamadan beri)
    $since = s('since', 19);
    $upd = $since !== '' ? h_all('SELECT * FROM c_msgs WHERE chat_id = ? AND upd >= ? AND id <= ? AND deleted_at IS NULL ORDER BY id LIMIT 100', [(int)$c['id'], $since, $after]) : [];
    $c2 = h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$c['id']]);
    out(['msgs' => c_msgs_out($rows), 'deleted' => $del, 'read' => ['id' => $mineLast, 'n' => $readBy], 'upd' => $upd ? c_msgs_out($upd) : [],
        'pinned' => c_pinned_out($c2), 'now' => now(), 'typing' => c_typing_names($c, $me), 'peer' => $peer]);
}

function a_chat_send(): void
{
    $me = c_need();
    [$c, $m, $adm] = c_access($me, (int)i('id'));
    if ((int)$c['only_admins'] === 1 && !$adm) fail('Bu grupta yalnız yöneticiler mesaj gönderebilir.', 403);
    c_send_guard($c, $me);
    $body = trim(str_replace("\r", '', (string)($GLOBALS['IN']['body'] ?? '')));
    if (mb_strlen($body) > C_MAX_BODY) fail('Mesaj en fazla ' . C_MAX_BODY . ' karakter olabilir.');
    if (c_has_tckn($body)) fail('Mesajda T.C. kimlik numarası var. Hasta bilgisi mesajla paylaşılamaz; numarayı silip tekrar gönderin.', 422);
    $recent = (int)h_val('SELECT COUNT(*) FROM c_msgs WHERE tkey = ? AND user_id = ? AND created_at > ?', [c_tk(), (int)$me['id'], date('Y-m-d H:i:s', time() - 60)]);
    if ($recent >= 40) fail('Çok hızlı mesaj gönderiyorsunuz. Biraz bekleyin.', 429);
    $fileId = null; $kind = 'text';
    if (($aid = i('att_id'))) {
        $a = one('SELECT * FROM attachments WHERE id = ? AND user_id = ? AND post_id IS NULL AND roster_id IS NULL', [$aid, $me['id']]) ?? fail('Dosya bulunamadı; tekrar yükleyin.', 404);
        if ((int)$a['size'] > C_MAX_FILE) fail('Dosya en fazla 25 MB olabilir.');
        if (c_has_tckn((string)$a['orig_name'])) fail('Dosya adında T.C. kimlik numarası var; adını değiştirip tekrar gönderin.', 422);
        $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
        if (!@rename(nm_upload_dir() . '/' . $a['stored_name'], c_dir() . '/' . $stored)) fail('Dosya taşınamadı.', 500);
        h_q('INSERT INTO c_files (chat_id, name, stored, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)', [(int)$c['id'], $a['orig_name'], $stored, $a['mime'], (int)$a['size'], now()]);
        $fileId = (int)cdb()->lastInsertId();
        q('DELETE FROM attachments WHERE id = ?', [$aid]);
        $kind = str_starts_with((string)$a['mime'], 'image/') ? 'image' : (str_starts_with((string)$a['mime'], 'audio/') ? 'audio' : 'file');
    }
    if ($body === '' && !$fileId) fail('Boş mesaj gönderilemez.');
    $reply = i('reply_to');
    if ($reply && !h_one('SELECT id FROM c_msgs WHERE id = ? AND chat_id = ?', [$reply, (int)$c['id']])) $reply = null;
    $meta = [];
    if ($kind === 'audio' && ($dur = (int)i('dur')) > 0) $meta['dur'] = min(600, $dur);
    $mid = c_insert_msg($c, $me, $body, $kind, $fileId, $reply ?: null, $meta);
    c_notify_local(h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$c['id']]), $me);
    c_mentions($c, $me, $body, $mid);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$mid])])[0]]);
}

function c_insert_msg(array $c, array $me, string $body, string $kind, ?int $fileId, ?int $reply, array $meta = []): int
{
    h_q('INSERT INTO c_msgs (chat_id, tkey, user_id, name, body, kind, file_id, reply_to, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [(int)$c['id'], c_tk(), (int)$me['id'], $me['name'], $body, $kind, $fileId, $reply, $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null, now()]);
    $mid = (int)cdb()->lastInsertId();
    h_q('UPDATE c_chats SET last_id = ?, last_at = ? WHERE id = ?', [$mid, now(), (int)$c['id']]);
    h_q('UPDATE c_members SET last_read = ?, notified = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$mid, $mid, (int)$c['id'], c_tk(), (int)$me['id']]);
    return $mid;
}

/**
 * @bahsetme: "@Ad Soyad" yazılan sohbet üyesine (sessize almış olsa bile) bildirim.
 * Aynı birimdeki üyeye anında; diğer birimdekine kendi biriminin görevi iletir.
 */
function c_mentions(array $c, array $me, string $body, int $mid): void
{
    if (mb_strpos($body, '@') === false) return;
    $low = tr_lower($body);
    $cands = $c['kind'] === 'unit'
        ? array_map(fn($u) => ['tkey' => c_tk(), 'user_id' => (int)$u['id'], 'name' => $u['name']], all("SELECT id, name FROM users WHERE status = 'active'"))
        : h_all('SELECT tkey, user_id, name FROM c_members WHERE chat_id = ?', [(int)$c['id']]);
    $local = [];
    foreach ($cands as $p) {
        if ($p['tkey'] === c_tk() && (int)$p['user_id'] === (int)$me['id']) continue;
        if (mb_strpos($low, '@' . tr_lower((string)$p['name'])) === false) continue;
        if ($p['tkey'] === c_tk()) $local[] = (int)$p['user_id'];
        else h_q('UPDATE c_members SET mentioned = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$mid, (int)$c['id'], $p['tkey'], (int)$p['user_id']]);
    }
    if ($local) c_push($local, (int)$c['id'], $me['name'] . ' sizden bahsetti', ($c['kind'] === 'direct' ? '' : $c['name'] . ' · ') . mb_substr($body, 0, 160));
}

/** Birebirde engel: engellediğim kişiye yazamam, beni engelleyene mesaj gitmez */
function c_send_guard(array $c, array $me): void
{
    if ($c['kind'] !== 'direct' || !function_exists('c_blocked_by') || !($o = c_other($c, $me))) return;
    if (c_blocked_by(c_tk(), (int)$me['id'], (string)$o['tkey'], (int)$o['user_id'])) fail('Bu kişiyi engellediniz. Yazmak için önce engeli kaldırın.', 403);
    if (c_blocked_by((string)$o['tkey'], (int)$o['user_id'], c_tk(), (int)$me['id'])) fail('Bu kişiye mesaj gönderilemiyor.', 403);
}

/** Aynı birimdeki alıcılara anında bildirim (sohbet başına tek bildirim, yenilenir) */
function c_notify_local(array $c, array $me): void
{
    $title = $c['kind'] === 'direct' ? $me['name'] : $c['name'];
    $last = h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)$c['last_id']]);
    $body = c_preview($last);
    if ($c['kind'] === 'unit') {
        $ids = array_map(fn($u) => (int)$u['id'], all("SELECT id FROM users WHERE status = 'active' AND id <> ?", [$me['id']]));
        $muted = array_map('intval', array_column(h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ? AND (muted = 1 OR (mute_until IS NOT NULL AND mute_until > ?))', [(int)$c['id'], c_tk(), now()]), 'user_id'));
        $ids = array_values(array_diff($ids, $muted));
        h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ?', [(int)$c['last_id'], (int)$c['id'], c_tk()]);
    } else {
        $rows = h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id <> ? AND muted = 0 AND (mute_until IS NULL OR mute_until < ?)', [(int)$c['id'], c_tk(), (int)$me['id'], now()]);
        $ids = array_map(fn($r) => (int)$r['user_id'], $rows);
        h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ?', [(int)$c['last_id'], (int)$c['id'], c_tk()]);
    }
    if ($ids) c_push($ids, (int)$c['id'], $title, $body);
    // Diğer birimlerdeki üyeler: o birimin bildirim görevini hemen tetikle (zamanlanmış görevi beklemeden)
    if ($c['kind'] !== 'unit' && function_exists('nb_kick')) {
        nb_kick(array_column(h_all('SELECT DISTINCT tkey FROM c_members WHERE chat_id = ? AND tkey <> ?', [(int)$c['id'], c_tk()]), 'tkey'), 'chat_notify');
    }
}

/** Uygulama içi bildirim (sohbet başına bir tane, okunmadıysa güncellenir) + telefon bildirimi */
function c_push(array $userIds, int $chatId, string $title, string $body): void
{
    $url = '#/mesaj/' . $chatId;
    $users = $userIds ? all('SELECT id, push_on, notify_mode FROM users WHERE status = \'active\' AND id IN (' . implode(',', array_map('intval', $userIds)) . ')') : [];
    $push = [];
    foreach ($users as $u) {
        $n = one("SELECT id FROM notifications WHERE user_id = ? AND kind = 'chat' AND url = ? AND read_at IS NULL", [$u['id'], $url]);
        if ($n) q('UPDATE notifications SET title = ?, body = ?, created_at = ? WHERE id = ?', [mb_substr($title, 0, 200), mb_substr($body, 0, 400), now(), $n['id']]);
        else q('INSERT INTO notifications (user_id, title, body, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$u['id'], mb_substr($title, 0, 200), mb_substr($body, 0, 400), $url, 'chat', now()]);
        $push[] = (int)$u['id'];
    }
    if ($push && function_exists('nb_push_filter')) $push = nb_push_filter($push, 'chat');
    if ($push && function_exists('push_after_response')) push_after_response($push);
}

/** Birim görevi: başka birimden gelen, henüz bildirilmemiş mesajlar (bu birimin kişileri için) */
$GLOBALS['NM_JOBS']['chat_notify'] = function (bool $force) {
    if (!cdb()) return null;
    $rows = h_all("SELECT m.*, c.kind, c.name AS cname, c.last_id FROM c_members m JOIN c_chats c ON c.id = m.chat_id
        WHERE m.tkey = ? AND c.kind <> 'unit' AND ((c.last_id > m.notified AND c.last_id > m.last_read AND m.muted = 0 AND (m.mute_until IS NULL OR m.mute_until < ?)) OR (m.mentioned > m.notified AND m.mentioned > m.last_read))", [c_tk(), now()]);
    $n = 0;
    foreach ($rows as $r) {
        $mention = (int)$r['mentioned'] > (int)$r['notified'] && (int)$r['mentioned'] > (int)$r['last_read'];
        $last = h_one('SELECT * FROM c_msgs WHERE id = ?', [$mention ? (int)$r['mentioned'] : (int)$r['last_id']]);
        h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$r['last_id'], (int)$r['chat_id'], c_tk(), (int)$r['user_id']]);
        if (!$last || ($last['tkey'] === c_tk() && (int)$last['user_id'] === (int)$r['user_id'])) continue;
        $title = $mention ? $last['name'] . ' sizden bahsetti' : ($r['kind'] === 'direct' ? $last['name'] : $r['cname']);
        c_push([(int)$r['user_id']], (int)$r['chat_id'], $title, c_preview($last));
        $n++;
    }
    return $n ?: null;
};
$GLOBALS['NM_JOB_MODULE']['chat_notify'] = 'mesaj';

/**
 * Saklama süresi (KVKK): süresi geçen mesajlar ve dosyaları silinir. Her birim yalnız KENDİ sohbetlerini temizler
 * (birim grubu ve biriminden kurulan gruplar); birebir sohbetlerde süreyi taraflardan biri seçer.
 */
$GLOBALS['NM_JOBS']['chat_retention'] = function (bool $force) {
    if (!cdb()) return null;
    if (!$force && setting('chat_ret_last') === date('Y-m-d')) return null;
    set_setting('chat_ret_last', date('Y-m-d'));
    $n = 0;
    foreach (h_all("SELECT * FROM c_chats WHERE retention_days > 0 AND tkey = ?", [c_tk()]) as $c) {
        $cut = date('Y-m-d H:i:s', time() - (int)$c['retention_days'] * 86400);
        foreach (h_all('SELECT m.id, f.id AS fid, f.stored FROM c_msgs m LEFT JOIN c_files f ON f.id = m.file_id WHERE m.chat_id = ? AND m.created_at < ?', [(int)$c['id'], $cut]) as $x) {
            if ($x['fid']) { @unlink(c_dir() . '/' . $x['stored']); h_q('DELETE FROM c_files WHERE id = ?', [(int)$x['fid']]); }
            h_q('DELETE FROM c_reacts WHERE msg_id = ?', [(int)$x['id']]);
            h_q('DELETE FROM c_votes WHERE msg_id = ?', [(int)$x['id']]);
            h_q('DELETE FROM c_msgs WHERE id = ?', [(int)$x['id']]);
            $n++;
        }
    }
    return $n ?: null;
};
$GLOBALS['NM_JOB_MODULE']['chat_retention'] = 'mesaj';

/* ---------------- 4.4: tepki, anket, ilet, sabitle, davet ---------------- */

function a_chat_react(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ? AND deleted_at IS NULL', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    c_access($me, (int)$x['chat_id']);
    $e = s('emoji', 16);
    $cur = h_one('SELECT emoji FROM c_reacts WHERE msg_id = ? AND tkey = ? AND user_id = ?', [$x['id'], c_tk(), (int)$me['id']]);
    if ($e === '' || ($cur && $cur['emoji'] === $e)) h_q('DELETE FROM c_reacts WHERE msg_id = ? AND tkey = ? AND user_id = ?', [$x['id'], c_tk(), (int)$me['id']]);
    elseif (in_array($e, C_EMOJIS, true)) h_q('INSERT OR REPLACE INTO c_reacts (msg_id, tkey, user_id, emoji) VALUES (?, ?, ?, ?)', [$x['id'], c_tk(), (int)$me['id'], $e]);
    else fail('Geçersiz tepki.');
    c_touch((int)$x['id']);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$x['id']])])[0]]);
}

/** Anket oluştur (sohbette yazabilen herkes) */
function a_chat_survey(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    if ((int)$c['only_admins'] === 1 && !$adm) fail('Bu grupta yalnız yöneticiler gönderebilir.', 403);
    $q = s('question', 300);
    $opts = array_values(array_unique(array_filter(array_map(fn($o) => mb_substr(trim((string)$o), 0, 100), array_slice(arr('options'), 0, 12)), fn($o) => $o !== '')));
    if (mb_strlen($q) < 3) fail('Anket sorusunu yazın.');
    if (count($opts) < 2) fail('En az iki seçenek girin.');
    if (c_has_tckn($q . ' ' . implode(' ', $opts))) fail('Ankette T.C. kimlik numarası olamaz.', 422);
    $mid = c_insert_msg($c, $me, $q, 'poll', null, null, ['opts' => $opts, 'multi' => b('multi')]);
    c_notify_local(h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$c['id']]), $me);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$mid])])[0]]);
}

function a_chat_vote(): void
{
    $me = c_need();
    $x = h_one("SELECT * FROM c_msgs WHERE id = ? AND kind = 'poll' AND deleted_at IS NULL", [(int)i('id')]) ?? fail('Anket bulunamadı.', 404);
    c_access($me, (int)$x['chat_id']);
    $meta = json_decode((string)$x['meta'], true) ?: [];
    $n = count((array)($meta['opts'] ?? []));
    $sel = array_values(array_unique(array_filter(array_map('intval', arr('opts')), fn($i) => $i >= 0 && $i < $n)));
    if (empty($meta['multi'])) $sel = array_slice($sel, 0, 1);
    h_q('DELETE FROM c_votes WHERE msg_id = ? AND tkey = ? AND user_id = ?', [$x['id'], c_tk(), (int)$me['id']]);
    foreach ($sel as $i) h_q('INSERT INTO c_votes (msg_id, tkey, user_id, opt) VALUES (?, ?, ?, ?)', [$x['id'], c_tk(), (int)$me['id'], $i]);
    c_touch((int)$x['id']);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$x['id']])])[0]]);
}

/** Anket sonucunda kim neye oy verdi (anketi açan ya da grup yöneticisi) */
function a_chat_voters(): void
{
    $me = c_need();
    $x = h_one("SELECT * FROM c_msgs WHERE id = ? AND kind = 'poll'", [(int)i('id')]) ?? fail('Anket bulunamadı.', 404);
    [, , $adm] = c_access($me, (int)$x['chat_id']);
    if (!$adm && !($x['tkey'] === c_tk() && (int)$x['user_id'] === (int)$me['id'])) fail('Oy verenleri anketi açan ve grup yöneticisi görür.', 403);
    $names = [];
    foreach (h_all('SELECT tkey, user_id, name FROM c_members WHERE chat_id = ?', [(int)$x['chat_id']]) as $m) $names[$m['tkey'] . ':' . $m['user_id']] = $m['name'];
    $meta = json_decode((string)$x['meta'], true) ?: [];
    $o = array_map(fn($t) => ['t' => $t, 'names' => []], (array)($meta['opts'] ?? []));
    foreach (h_all('SELECT * FROM c_votes WHERE msg_id = ?', [$x['id']]) as $v) if (isset($o[(int)$v['opt']])) $o[(int)$v['opt']]['names'][] = $names[$v['tkey'] . ':' . $v['user_id']] ?? 'Üye';
    out(['opts' => $o]);
}

/** İlet: mesajı (ve dosyasını) yazabildiğim başka bir sohbete kopyala */
function a_chat_forward(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ? AND deleted_at IS NULL', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    if ($x['kind'] === 'system' || $x['kind'] === 'poll') fail('Bu mesaj iletilemez.');
    c_access($me, (int)$x['chat_id']);
    [$to, , $adm] = c_access($me, (int)i('to'));
    if ((int)$to['only_admins'] === 1 && !$adm) fail('Hedef grupta yalnız yöneticiler yazabilir.', 403);
    $fileId = null;
    if ($x['file_id'] && ($f = h_one('SELECT * FROM c_files WHERE id = ?', [(int)$x['file_id']]))) {
        $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
        if (!@copy(c_dir() . '/' . $f['stored'], c_dir() . '/' . $stored)) fail('Dosya kopyalanamadı.', 500);
        h_q('INSERT INTO c_files (chat_id, name, stored, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)', [(int)$to['id'], $f['name'], $stored, $f['mime'], (int)$f['size'], now()]);
        $fileId = (int)cdb()->lastInsertId();
    }
    $meta = json_decode((string)($x['meta'] ?? ''), true) ?: [];
    $meta['fwd'] = 1;
    $mid = c_insert_msg($to, $me, (string)$x['body'], (string)$x['kind'], $fileId, null, $meta);
    c_notify_local(h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$to['id']]), $me);
    out(['id' => $mid, 'chat' => (int)$to['id']]);
}

/** Sabitle / kaldır (grup ve birim grubunda yönetici, birebirde iki taraf) */
function a_chat_pin(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    if ($c['kind'] !== 'direct' && !$adm) fail('Mesajı yalnız grup yöneticisi sabitleyebilir.', 403);
    $mid = (int)i('msg');
    if ($mid && !h_one('SELECT id FROM c_msgs WHERE id = ? AND chat_id = ? AND deleted_at IS NULL', [$mid, $c['id']])) fail('Mesaj bulunamadı.', 404);
    h_q('UPDATE c_chats SET pinned_id = ? WHERE id = ?', [$mid ?: null, $c['id']]);
    if ($mid) c_touch($mid);
    out(['pinned' => c_pinned_out(h_one('SELECT * FROM c_chats WHERE id = ?', [$c['id']]))]);
}

/** Davet bağlantısı (grup yöneticisi): aynı hastanedeki biri bağlantıyla gruba katılır */
function a_chat_invite(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    if ($c['kind'] !== 'group' || !$adm) fail('Davet bağlantısını yalnız grup yöneticisi yönetir.', 403);
    if (s('op', 10) === 'revoke') {
        h_q('UPDATE c_chats SET invite_token = NULL, invite_expires = NULL WHERE id = ?', [$c['id']]);
        c_system((int)$c['id'], $me, $me['name'] . ' davet bağlantısını kapattı');
        out(['invite' => null]);
    }
    $days = max(1, min(30, (int)(i('days') ?? 7)));
    $tok = random_token(18);
    $exp = date('Y-m-d H:i:s', time() + $days * 86400);
    h_q('UPDATE c_chats SET invite_token = ?, invite_expires = ? WHERE id = ?', [$tok, $exp, $c['id']]);
    c_system((int)$c['id'], $me, $me['name'] . ' davet bağlantısı oluşturdu (' . $days . ' gün)');
    out(['invite' => ['token' => $tok, 'expires' => $exp]]);
}

function a_chat_join(): void
{
    $me = c_need();
    $tok = s('token', 40);
    $c = $tok !== '' ? h_one("SELECT * FROM c_chats WHERE kind = 'group' AND invite_token = ? AND (invite_expires IS NULL OR invite_expires > ?)", [$tok, now()]) : null;
    if (!$c) fail('Davet bağlantısı geçersiz ya da süresi dolmuş.', 404);
    if (!h_one('SELECT 1 FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], c_tk(), (int)$me['id']])) {
        // Katılım onayı açıksa istek yöneticilere düşer
        if ((int)($c['approve_join'] ?? 0) === 1) {
            h_q('INSERT OR IGNORE INTO c_joinreq (chat_id, tkey, user_id, name, unit_name, at) VALUES (?, ?, ?, ?, ?, ?)', [$c['id'], c_tk(), (int)$me['id'], $me['name'], c_unit(), now()]);
            $adm = array_map(fn($r) => (int)$r['user_id'], h_all("SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ? AND role = 'admin'", [$c['id'], c_tk()]));
            if ($adm) c_push($adm, (int)$c['id'], $c['name'], $me['name'] . ' gruba katılmak istiyor');
            out(['pending' => true, 'name' => $c['name']]);
        }
        c_add_members((int)$c['id'], [['tk' => c_tk(), 'uid' => (int)$me['id'], 'name' => $me['name'], 'unit' => c_unit()]]);
        c_system((int)$c['id'], $me, $me['name'] . ' davet bağlantısıyla katıldı');
    }
    out(['id' => (int)$c['id']]);
}

function a_chat_delete_msg(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    [$c, , $adm] = c_access($me, (int)$x['chat_id']);
    $mine = $x['tkey'] === c_tk() && (int)$x['user_id'] === (int)$me['id'];
    if (!$mine && !$adm) fail('Yalnız kendi mesajınızı (ya da grup yöneticisi olarak herhangi bir mesajı) silebilirsiniz.', 403);
    if ($x['file_id'] && ($f = h_one('SELECT * FROM c_files WHERE id = ?', [(int)$x['file_id']]))) { @unlink(c_dir() . '/' . $f['stored']); h_q('DELETE FROM c_files WHERE id = ?', [$f['id']]); }
    h_q("UPDATE c_msgs SET body = '', file_id = NULL, deleted_at = ? WHERE id = ?", [now(), (int)$x['id']]);
    if (!$mine) audit($me, 'chat.delete', $c['kind'] === 'unit' ? 'Birim grubu' : $c['name'], 'Başkasının mesajı');
    out();
}

/** Mesajı kimler okudu (gönderen ya da yönetici) */
function a_chat_readers(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    [$c, , $adm] = c_access($me, (int)$x['chat_id']);
    $mine = $x['tkey'] === c_tk() && (int)$x['user_id'] === (int)$me['id'];
    if (!$mine && !$adm) fail('Okuma bilgisi yalnız gönderene görünür.', 403);
    $rows = h_all('SELECT name, tkey, user_id, unit_name FROM c_members WHERE chat_id = ? AND last_read >= ? AND NOT (tkey = ? AND user_id = ?) ORDER BY name', [(int)$c['id'], (int)$x['id'], $x['tkey'], (int)$x['user_id']]);
    // Birebirde okundu bilgisi karşılıklı (biri kapattıysa gösterilmez); gruplarda her zaman
    if ($c['kind'] === 'direct') {
        if (!(int)c_pref(c_tk(), (int)$me['id'])['receipts']) out(['read' => [], 'off' => true]);
        $rows = array_values(array_filter($rows, fn($r) => (int)c_pref((string)$r['tkey'], (int)$r['user_id'])['receipts'] === 1));
    }
    out(['read' => array_map(fn($r) => ['name' => $r['name'], 'unit' => $r['tkey'] === c_tk() ? '' : $r['unit_name']], $rows)]);
}

/** Kişi seçimi: kendi birimi + (yetkiliyse) hastanedeki diğer birimlerin yönetici/yayıncıları + aynı grupta olduklarım */
function a_chat_people(): void
{
    $me = c_need();
    $out = [];
    foreach (all("SELECT id, name, role FROM users WHERE status = 'active' AND id <> ? ORDER BY name", [$me['id']]) as $u) $out[] = ['tk' => c_tk(), 'uid' => (int)$u['id'], 'name' => $u['name'], 'unit' => ''];
    // Diğer birimlerden: aynı gruplarda olduklarım + (yetkiliysem) diğer birimlerin yönetici/yayıncıları
    foreach (c_other_people($me) as $p) $out[] = $p;
    out(['people' => $out]);
}

/** Seçilen kişilerin geçerliliği (kendi birimi: veritabanından; diğer birim: kişi seçiminde sunulabilecek olanlar) */
function c_valid_people(array $me, array $list): array
{
    $ok = [];
    $local = [];
    foreach (all("SELECT id, name FROM users WHERE status = 'active'") as $u) $local[(int)$u['id']] = $u['name'];
    $other = null;
    foreach (array_slice($list, 0, 300) as $p) {
        if (!is_array($p)) continue;
        $tk = (string)($p['tk'] ?? ''); $uid = (int)($p['uid'] ?? 0);
        if ($tk === c_tk()) { if (isset($local[$uid]) && $uid !== (int)$me['id']) $ok[$tk . ':' . $uid] = ['tk' => $tk, 'uid' => $uid, 'name' => $local[$uid], 'unit' => c_unit()]; continue; }
        if ($other === null) $other = c_other_people($me);
        if (isset($other[$tk . ':' . $uid])) $ok[$tk . ':' . $uid] = $other[$tk . ':' . $uid];
    }
    return array_values($ok);
}

/** Diğer birimlerden eklenebilecek kişiler: aynı grupta olduklarım + (yetkiliysem) diğer birimlerin yetkilileri */
function c_other_people(array $me): array
{
    $o = [];
    foreach (h_all("SELECT DISTINCT o.tkey, o.user_id, o.name, o.unit_name FROM c_members mine JOIN c_members o ON o.chat_id = mine.chat_id JOIN c_chats c ON c.id = mine.chat_id
        WHERE mine.tkey = ? AND mine.user_id = ? AND c.kind = 'group' AND o.tkey <> ?", [c_tk(), (int)$me['id'], c_tk()]) as $x) $o[$x['tkey'] . ':' . $x['user_id']] = ['tk' => $x['tkey'], 'uid' => (int)$x['user_id'], 'name' => $x['name'], 'unit' => $x['unit_name']];
    // Gizlilik ayarında "diğer birimler beni bulabilsin" diyenler
    if (function_exists('c_findable_people')) $o += c_findable_people($me);
    if (is_publisher($me)) {
        $hid = (int)nm_tenant()['hospital_id'];
        foreach (nm_tenants() as $t) {
            if ((int)$t['hospital_id'] !== $hid || $t['tkey'] === c_tk() || nm_tenant_frozen($t) || !($p = nm_tenant_peek($t))) continue;
            try { foreach ($p->query("SELECT id, name FROM users WHERE status = 'active' AND role IN ('admin', 'editor')")->fetchAll() as $u) $o[$t['tkey'] . ':' . $u['id']] = ['tk' => $t['tkey'], 'uid' => (int)$u['id'], 'name' => $u['name'], 'unit' => $t['name']]; } catch (Throwable $e) { /* */ }
        }
    }
    return $o;
}

function c_add_members(int $chatId, array $people, string $role = 'member'): void
{
    foreach ($people as $p) h_q('INSERT OR IGNORE INTO c_members (chat_id, tkey, user_id, name, unit_name, role, joined_at, last_read, notified) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)',
        [$chatId, $p['tk'], $p['uid'], $p['name'], $p['unit'] ?? '', $role, now()]);
}

function c_system(int $chatId, array $me, string $text): void
{
    h_q("INSERT INTO c_msgs (chat_id, tkey, user_id, name, body, kind, created_at) VALUES (?, ?, ?, ?, ?, 'system', ?)", [$chatId, c_tk(), (int)$me['id'], $me['name'], $text, now()]);
    $id = (int)cdb()->lastInsertId();
    h_q('UPDATE c_chats SET last_id = ?, last_at = ? WHERE id = ?', [$id, now(), $chatId]);
    h_q('UPDATE c_members SET last_read = MAX(last_read, ?), notified = MAX(notified, ?) WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$id, $id, $chatId, c_tk(), (int)$me['id']]);
}

/** Yeni grup (yetkililer) */
function a_chat_create(): void
{
    $me = c_need();
    if (!is_publisher($me)) fail('Grup kurmak için yetki gerekir (yönetici / yayıncı ya da “Mesajlaşma: Yönetir”).', 403);
    $name = s('name', 80);
    if (mb_strlen($name) < 2) fail('Grup adını girin.');
    [$people, $skipped] = c_add_policy($me, c_valid_people($me, arr('members')));
    $ret = function_exists('c_pref') ? (int)c_pref(c_tk(), (int)$me['id'])['ret_default'] : 0;
    h_q("INSERT INTO c_chats (kind, name, descr, tkey, created_by, created_at, retention_days) VALUES ('group', ?, ?, ?, ?, ?, ?)", [$name, s('descr', 500), c_tk(), c_tk() . ':' . $me['id'], now(), $ret]);
    $id = (int)cdb()->lastInsertId();
    c_add_members($id, [['tk' => c_tk(), 'uid' => (int)$me['id'], 'name' => $me['name'], 'unit' => c_unit()]], 'admin');
    c_add_members($id, $people);
    c_system($id, $me, $me['name'] . ' grubu kurdu');
    audit($me, 'chat.create', $name, count($people) . ' üye');
    out(['id' => $id, 'skipped' => $skipped]);
}

/** "Beni gruplara kim ekleyebilir" gizlilik ayarı: eklenemeyenler davet bağlantısıyla katılabilir */
function c_add_policy(array $me, array $people): array
{
    if (!function_exists('c_pref')) return [$people, []];
    $ok = []; $skip = [];
    foreach ($people as $p) {
        $pr = c_pref((string)$p['tk'], (int)$p['uid']);
        $allowed = $pr['add_groups'] === 'all' || ($pr['add_groups'] === 'unit' && $p['tk'] === c_tk());
        if ($allowed && c_blocked_by((string)$p['tk'], (int)$p['uid'], c_tk(), (int)$me['id'])) $allowed = false;
        if ($allowed) $ok[] = $p; else $skip[] = $p['name'];
    }
    return [$ok, $skip];
}

/** Birebir sohbet (varsa açılır) */
function a_chat_direct(): void
{
    $me = c_need();
    $p = c_valid_people($me, [['tk' => s('tk', 16), 'uid' => (int)i('uid')]]);
    if (!$p) fail('Bu kişiyle sohbet başlatamazsınız (kendi biriminiz ya da ortak grubunuzdaki kişiler).', 403);
    $p = $p[0];
    if (function_exists('c_pref')) {
        $pr = c_pref((string)$p['tk'], (int)$p['uid']);
        if ($pr['dm_from'] === 'contacts' && !c_is_contact(c_tk(), (int)$me['id'], (string)$p['tk'], (int)$p['uid'])) fail('Bu kişi yalnız kişilerinden (birimi ve ortak grupları) mesaj alıyor.', 403);
    }
    $a = c_tk() . ':' . (int)$me['id']; $b = $p['tk'] . ':' . $p['uid'];
    $key = strcmp($a, $b) < 0 ? $a . '|' . $b : $b . '|' . $a;
    $c = h_one('SELECT * FROM c_chats WHERE direct_key = ?', [$key]);
    if (!$c) {
        h_q("INSERT INTO c_chats (kind, tkey, direct_key, created_by, created_at, retention_days) VALUES ('direct', ?, ?, ?, ?, ?)", [c_tk(), $key, $a, now(), function_exists('c_pref') ? (int)c_pref(c_tk(), (int)$me['id'])['ret_default'] : 0]);
        $id = (int)cdb()->lastInsertId();
        c_add_members($id, [['tk' => c_tk(), 'uid' => (int)$me['id'], 'name' => $me['name'], 'unit' => c_unit()], $p]);
        $c = ['id' => $id];
    }
    out(['id' => (int)$c['id']]);
}

/** Grup ayarları (grup yöneticisi): ad, açıklama, yalnız yöneticiler yazsın */
function a_chat_update(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    global $IN;
    $changes = [];
    // Saklama süresi: grup/birim grubunda yönetici, birebirde iki taraf da seçebilir
    if (array_key_exists('retention', $IN)) {
        if ($c['kind'] !== 'direct' && !$adm) fail('Saklama süresini yalnız grup yöneticisi seçebilir.', 403);
        $d = (int)i('retention');
        if (!in_array($d, C_RETENTION, true)) fail('Geçersiz saklama süresi.');
        if ($d !== (int)$c['retention_days']) {
            // Birebirde temizliği, ayarı yapan tarafın birimi üstlenir
            h_q('UPDATE c_chats SET retention_days = ?' . ($c['kind'] === 'direct' ? ', tkey = ?' : '') . ' WHERE id = ?', $c['kind'] === 'direct' ? [$d, c_tk(), $c['id']] : [$d, $c['id']]);
            $changes[] = $d ? 'mesaj saklama süresini ' . $d . ' gün yaptı' : 'mesaj saklama süresini kaldırdı';
        }
        if (count($IN) <= 3) { if ($changes) c_system((int)$c['id'], $me, $me['name'] . ' ' . implode(', ', $changes)); out(); }
    }
    if ($c['kind'] === 'direct') fail('Birebir sohbette bu ayar yok.', 400);
    // Grup bilgisi (ad, açıklama): yönetici ya da "herkes düzenleyebilir" ise üyeler; diğer ayarlar yalnız yönetici
    $canInfo = $adm || ($c['kind'] === 'group' && ($c['perm_edit'] ?? 'admins') === 'all');
    $adminKeys = array_intersect(array_keys($IN), ['only_admins', 'perm_edit', 'perm_add', 'approve_join']);
    if (($adminKeys && !$adm) || (!$adminKeys && !$canInfo)) fail('Bu ayarı yalnız grup yöneticisi değiştirebilir.', 403);
    foreach (['perm_edit' => ['grup bilgisini', 'düzenleyebilir'], 'perm_add' => ['üye', 'ekleyebilir']] as $k => [$what, $verb]) {
        if (!array_key_exists($k, $IN) || $c['kind'] !== 'group') continue;
        $v = s($k, 8) === 'all' ? 'all' : 'admins';
        if ($v !== ($c[$k] ?? 'admins')) { h_q("UPDATE c_chats SET $k = ? WHERE id = ?", [$v, $c['id']]); $changes[] = ($v === 'all' ? 'herkesin ' : 'yalnız yöneticilerin ') . $what . ' ' . $verb . ' olmasını seçti'; }
    }
    if (array_key_exists('approve_join', $IN) && $c['kind'] === 'group') { $v = b('approve_join') ? 1 : 0; if ($v !== (int)($c['approve_join'] ?? 0)) { h_q('UPDATE c_chats SET approve_join = ? WHERE id = ?', [$v, $c['id']]); $changes[] = $v ? 'yeni katılımcıların onaylanmasını açtı' : 'katılım onayını kapattı'; } }
    if (array_key_exists('name', $IN) && $c['kind'] === 'group') { $n = s('name', 80); if (mb_strlen($n) < 2) fail('Grup adını girin.'); if ($n !== $c['name']) { h_q('UPDATE c_chats SET name = ? WHERE id = ?', [$n, $c['id']]); $changes[] = 'adı “' . $n . '” yaptı'; } }
    if (array_key_exists('descr', $IN)) h_q('UPDATE c_chats SET descr = ? WHERE id = ?', [s('descr', 500), $c['id']]);
    if (array_key_exists('only_admins', $IN)) { $v = b('only_admins') ? 1 : 0; if ($v !== (int)$c['only_admins']) { h_q('UPDATE c_chats SET only_admins = ? WHERE id = ?', [$v, $c['id']]); $changes[] = $v ? 'yalnız yöneticilerin yazmasını açtı' : 'herkesin yazmasına izin verdi'; } }
    if ($changes) c_system((int)$c['id'], $me, $me['name'] . ' ' . implode(', ', $changes));
    out();
}

function a_chat_members(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    $op = s('op', 10);
    if ($c['kind'] !== 'group') fail('Yalnız gruplarda.', 400);
    if ($op === 'add') {
        if (!$adm && ($c['perm_add'] ?? 'admins') !== 'all') fail('Bu grupta yalnız yöneticiler üye ekleyebilir.', 403);
        [$people, $skipped] = c_add_policy($me, c_valid_people($me, arr('members')));
        $new = array_values(array_filter($people, fn($p) => !h_one('SELECT 1 FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $p['tk'], $p['uid']])));
        c_add_members((int)$c['id'], $new);
        if ($new) c_system((int)$c['id'], $me, $me['name'] . ' ekledi: ' . implode(', ', array_column($new, 'name')));
        out(['added' => count($new), 'skipped' => $skipped]);
    }
    if (!$adm) fail('Üyeleri yalnız grup yöneticisi değiştirebilir.', 403);
    $tk = s('tk', 16); $uid = (int)i('uid');
    $t = h_one('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $tk, $uid]) ?? fail('Üye bulunamadı.', 404);
    if ($op === 'remove') {
        if ($t['role'] === 'admin' && (int)h_val("SELECT COUNT(*) FROM c_members WHERE chat_id = ? AND role = 'admin'", [$c['id']]) <= 1) fail('Grupta en az bir yönetici kalmalı.');
        h_q('DELETE FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $tk, $uid]);
        c_system((int)$c['id'], $me, $me['name'] . ' çıkardı: ' . $t['name']);
    } elseif ($op === 'admin' || $op === 'member') {
        if ($op === 'member' && $t['role'] === 'admin' && (int)h_val("SELECT COUNT(*) FROM c_members WHERE chat_id = ? AND role = 'admin'", [$c['id']]) <= 1) fail('Grupta en az bir yönetici kalmalı.');
        h_q('UPDATE c_members SET role = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$op, $c['id'], $tk, $uid]);
        c_system((int)$c['id'], $me, $t['name'] . ($op === 'admin' ? ' grup yöneticisi oldu' : ' artık grup yöneticisi değil'));
    } else fail('Geçersiz işlem.');
    out();
}

function a_chat_leave(): void
{
    $me = c_need();
    [$c, $m] = c_access($me, (int)i('id'));
    if ($c['kind'] !== 'group') fail('Yalnız gruplardan çıkılabilir.');
    if ($m['role'] === 'admin' && (int)h_val("SELECT COUNT(*) FROM c_members WHERE chat_id = ? AND role = 'admin'", [$c['id']]) <= 1
        && (int)h_val('SELECT COUNT(*) FROM c_members WHERE chat_id = ?', [$c['id']]) > 1) fail('Çıkmadan önce başka birini grup yöneticisi yapın.');
    c_system((int)$c['id'], $me, $me['name'] . ' gruptan çıktı');
    h_q('DELETE FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], c_tk(), (int)$me['id']]);
    out();
}

function a_chat_mute(): void
{
    $me = c_need();
    [$c] = c_access($me, (int)i('id'));
    h_q('UPDATE c_members SET muted = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [b('muted') ? 1 : 0, $c['id'], c_tk(), (int)$me['id']]);
    out();
}

/** Sohbet dosyası: yalnız sohbet üyeleri */
function a_cfile_get(): void
{
    $me = current_user();
    $f = $me && cdb() && nm_mod_on('mesaj') ? h_one('SELECT * FROM c_files WHERE id = ?', [(int)($_GET['id'] ?? 0)]) : null;
    $ok = false;
    if ($f) {
        $c = h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$f['chat_id']]);
        $ok = $c && ($c['kind'] === 'unit' ? $c['tkey'] === c_tk() : (bool)h_one('SELECT 1 FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], c_tk(), (int)$me['id']]));
    }
    $path = $ok ? c_dir() . '/' . $f['stored'] : '';
    if (!$ok || !is_file($path)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Dosya bulunamadı veya erişim yetkiniz yok.'; return; }
    session_write_close();
    $inline = empty($_GET['dl']) && in_array($f['mime'], INLINE_SAFE, true);
    $ascii = preg_replace('/[^A-Za-z0-9._-]+/', '_', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $f['name']) ?: 'dosya');
    header('Content-Type: ' . $f['mime']);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($f['name']));
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=31536000, immutable');
    if ($f['mime'] !== 'application/pdf') header("Content-Security-Policy: default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    readfile($path);
}
$GLOBALS['NM_GET']['cfile'] = 'a_cfile_get';

return [
    'chat.list' => 'a_chat_list',
    'chat.unread' => 'a_chat_unread',
    'chat.open' => 'a_chat_open',
    'chat.older' => 'a_chat_older',
    'chat.poll' => 'a_chat_poll',
    'chat.send' => 'a_chat_send',
    'chat.delete' => 'a_chat_delete_msg',
    'chat.readers' => 'a_chat_readers',
    'chat.people' => 'a_chat_people',
    'chat.create' => 'a_chat_create',
    'chat.direct' => 'a_chat_direct',
    'chat.update' => 'a_chat_update',
    'chat.members' => 'a_chat_members',
    'chat.leave' => 'a_chat_leave',
    'chat.mute' => 'a_chat_mute',
    'chat.react' => 'a_chat_react',
    'chat.survey' => 'a_chat_survey',
    'chat.vote' => 'a_chat_vote',
    'chat.voters' => 'a_chat_voters',
    'chat.forward' => 'a_chat_forward',
    'chat.pin' => 'a_chat_pin',
    'chat.invite' => 'a_chat_invite',
    'chat.join' => 'a_chat_join',
];
