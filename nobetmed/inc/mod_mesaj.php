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

const C_SCHEMA = 1;
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
        return [$c, $m, is_publisher($me)];
    }
    if (!$m) fail('Bu sohbete erişiminiz yok.', 403);
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
    if ($r['file_id']) {
        $f = $files[(int)$r['file_id']] ?? h_one('SELECT * FROM c_files WHERE id = ?', [(int)$r['file_id']]);
        if ($f) $o['file'] = ['id' => (int)$f['id'], 'name' => $f['name'], 'mime' => $f['mime'], 'size' => (int)$f['size'], 'url' => 'api.php?action=cfile&id=' . (int)$f['id'] . nm_link_param()];
    }
    return $o;
}

/** Mesaj listesi + yanıtlanan mesajların kısa önizlemesi */
function c_msgs_out(array $rows): array
{
    $fids = array_filter(array_map(fn($r) => (int)$r['file_id'], $rows));
    $files = [];
    if ($fids) foreach (h_all('SELECT * FROM c_files WHERE id IN (' . implode(',', array_map('intval', $fids)) . ')') as $f) $files[(int)$f['id']] = $f;
    $out = array_map(fn($r) => c_msg_out($r, $files), $rows);
    $rids = array_values(array_unique(array_filter(array_map(fn($r) => (int)$r['reply_to'], $rows))));
    $refs = [];
    if ($rids) foreach (h_all('SELECT id, name, body, kind, deleted_at FROM c_msgs WHERE id IN (' . implode(',', $rids) . ')') as $x) {
        $refs[(int)$x['id']] = ['name' => $x['name'], 'body' => $x['deleted_at'] ? 'Silinen mesaj' : ($x['body'] !== '' ? mb_substr($x['body'], 0, 120) : ($x['kind'] === 'image' ? 'Fotoğraf' : 'Dosya'))];
    }
    foreach ($out as &$o) if ($o['reply'] && isset($refs[$o['reply']])) $o['reply_ref'] = $refs[$o['reply']];
    return $out;
}

function c_preview(?array $r): string
{
    if (!$r) return '';
    if ($r['deleted_at']) return 'Silinen mesaj';
    if ($r['kind'] === 'system') return $r['body'];
    $b = $r['body'] !== '' ? $r['body'] : ($r['kind'] === 'image' ? '📷 Fotoğraf' : '📎 Dosya');
    return mb_substr($r['name'] . ': ' . preg_replace('/\s+/', ' ', $b), 0, 90);
}

/** Birebir sohbette karşı taraf */
function c_other(array $c, array $me): ?array
{
    return h_one('SELECT * FROM c_members WHERE chat_id = ? AND NOT (tkey = ? AND user_id = ?)', [(int)$c['id'], c_tk(), (int)$me['id']]);
}

function c_chat_row(array $c, array $me, array $m): array
{
    $last = $c['last_id'] ? h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)$c['last_id']]) : null;
    $unread = (int)h_val('SELECT COUNT(*) FROM c_msgs WHERE chat_id = ? AND id > ? AND NOT (tkey = ? AND user_id = ?) AND deleted_at IS NULL', [(int)$c['id'], (int)$m['last_read'], c_tk(), (int)$me['id']]);
    $name = $c['name'];
    $sub = '';
    if ($c['kind'] === 'direct') { $o = c_other($c, $me); $name = $o['name'] ?? 'Kişi'; $sub = ($o && $o['tkey'] !== c_tk()) ? $o['unit_name'] : ''; }
    return ['id' => (int)$c['id'], 'kind' => $c['kind'], 'name' => $name, 'sub' => $sub, 'last' => c_preview($last), 'last_at' => $c['last_at'] ?: $c['created_at'],
        'unread' => $unread, 'muted' => (int)$m['muted'] === 1, 'only_admins' => (int)$c['only_admins'] === 1];
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
        $items[] = c_chat_row($c, $me, $m);
    }
    out(['items' => $items, 'can_group' => is_publisher($me)]);
}

function a_chat_unread(): void
{
    $me = need_user();
    if (!cdb() || !nm_mod_on('mesaj')) out(['unread' => 0]);
    $u = c_unit_chat();
    c_access($me, (int)$u['id']);
    $n = (int)h_val('SELECT COUNT(*) FROM c_msgs x JOIN c_members m ON m.chat_id = x.chat_id AND m.tkey = ? AND m.user_id = ? JOIN c_chats c ON c.id = x.chat_id
        WHERE x.id > m.last_read AND m.muted = 0 AND NOT (x.tkey = ? AND x.user_id = ?) AND x.deleted_at IS NULL AND (c.kind <> \'unit\' OR c.tkey = ?)', [c_tk(), (int)$me['id'], c_tk(), (int)$me['id'], c_tk()]);
    out(['unread' => $n]);
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
    out(['chat' => $row + ['descr' => $c['descr'], 'admin' => $adm, 'can_send' => !((int)$c['only_admins'] === 1 && !$adm)], 'members' => $members,
        'msgs' => c_msgs_out($rows), 'more' => count($rows) === 60]);
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
    out(['msgs' => c_msgs_out($rows), 'deleted' => $del, 'read' => ['id' => $mineLast, 'n' => $readBy]]);
}

function a_chat_send(): void
{
    $me = c_need();
    [$c, $m, $adm] = c_access($me, (int)i('id'));
    if ((int)$c['only_admins'] === 1 && !$adm) fail('Bu grupta yalnız yöneticiler mesaj gönderebilir.', 403);
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
        $kind = str_starts_with((string)$a['mime'], 'image/') ? 'image' : 'file';
    }
    if ($body === '' && !$fileId) fail('Boş mesaj gönderilemez.');
    $reply = i('reply_to');
    if ($reply && !h_one('SELECT id FROM c_msgs WHERE id = ? AND chat_id = ?', [$reply, (int)$c['id']])) $reply = null;
    h_q('INSERT INTO c_msgs (chat_id, tkey, user_id, name, body, kind, file_id, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [(int)$c['id'], c_tk(), (int)$me['id'], $me['name'], $body, $kind, $fileId, $reply ?: null, now()]);
    $mid = (int)cdb()->lastInsertId();
    h_q('UPDATE c_chats SET last_id = ?, last_at = ? WHERE id = ?', [$mid, now(), (int)$c['id']]);
    h_q('UPDATE c_members SET last_read = ?, notified = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$mid, $mid, (int)$c['id'], c_tk(), (int)$me['id']]);
    c_notify_local(h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$c['id']]), $me);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$mid])])[0]]);
}

/** Aynı birimdeki alıcılara anında bildirim (sohbet başına tek bildirim, yenilenir) */
function c_notify_local(array $c, array $me): void
{
    $title = $c['kind'] === 'direct' ? $me['name'] : $c['name'];
    $last = h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)$c['last_id']]);
    $body = c_preview($last);
    if ($c['kind'] === 'unit') {
        $ids = array_map(fn($u) => (int)$u['id'], all("SELECT id FROM users WHERE status = 'active' AND id <> ?", [$me['id']]));
        $muted = array_map('intval', array_column(h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ? AND muted = 1', [(int)$c['id'], c_tk()]), 'user_id'));
        $ids = array_values(array_diff($ids, $muted));
        h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ?', [(int)$c['last_id'], (int)$c['id'], c_tk()]);
    } else {
        $rows = h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id <> ? AND muted = 0', [(int)$c['id'], c_tk(), (int)$me['id']]);
        $ids = array_map(fn($r) => (int)$r['user_id'], $rows);
        h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ?', [(int)$c['last_id'], (int)$c['id'], c_tk()]);
    }
    if ($ids) c_push($ids, (int)$c['id'], $title, $body);
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
        if ((int)($u['push_on'] ?? 1) === 1 && ($u['notify_mode'] ?? 'instant') !== 'off') $push[] = (int)$u['id'];
    }
    if ($push && function_exists('push_after_response')) push_after_response($push);
}

/** Birim görevi: başka birimden gelen, henüz bildirilmemiş mesajlar (bu birimin kişileri için) */
$GLOBALS['NM_JOBS']['chat_notify'] = function (bool $force) {
    if (!cdb()) return null;
    $rows = h_all("SELECT m.*, c.kind, c.name AS cname, c.last_id FROM c_members m JOIN c_chats c ON c.id = m.chat_id
        WHERE m.tkey = ? AND c.kind <> 'unit' AND c.last_id > m.notified AND c.last_id > m.last_read AND m.muted = 0", [c_tk()]);
    $n = 0;
    foreach ($rows as $r) {
        $last = h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)$r['last_id']]);
        h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$r['last_id'], (int)$r['chat_id'], c_tk(), (int)$r['user_id']]);
        if (!$last || ($last['tkey'] === c_tk() && (int)$last['user_id'] === (int)$r['user_id'])) continue;
        c_push([(int)$r['user_id']], (int)$r['chat_id'], $r['kind'] === 'direct' ? $last['name'] : $r['cname'], c_preview($last));
        $n++;
    }
    return $n ?: null;
};
$GLOBALS['NM_JOB_MODULE']['chat_notify'] = 'mesaj';

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
    $read = array_map(fn($r) => ['name' => $r['name'], 'unit' => $r['tkey'] === c_tk() ? '' : $r['unit_name']],
        h_all('SELECT name, tkey, unit_name FROM c_members WHERE chat_id = ? AND last_read >= ? AND NOT (tkey = ? AND user_id = ?) ORDER BY name', [(int)$c['id'], (int)$x['id'], $x['tkey'], (int)$x['user_id']]));
    out(['read' => $read]);
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
    $people = c_valid_people($me, arr('members'));
    h_q("INSERT INTO c_chats (kind, name, descr, tkey, created_by, created_at) VALUES ('group', ?, ?, ?, ?, ?)", [$name, s('descr', 500), c_tk(), c_tk() . ':' . $me['id'], now()]);
    $id = (int)cdb()->lastInsertId();
    c_add_members($id, [['tk' => c_tk(), 'uid' => (int)$me['id'], 'name' => $me['name'], 'unit' => c_unit()]], 'admin');
    c_add_members($id, $people);
    c_system($id, $me, $me['name'] . ' grubu kurdu');
    audit($me, 'chat.create', $name, count($people) . ' üye');
    out(['id' => $id]);
}

/** Birebir sohbet (varsa açılır) */
function a_chat_direct(): void
{
    $me = c_need();
    $p = c_valid_people($me, [['tk' => s('tk', 16), 'uid' => (int)i('uid')]]);
    if (!$p) fail('Bu kişiyle sohbet başlatamazsınız (kendi biriminiz ya da ortak grubunuzdaki kişiler).', 403);
    $p = $p[0];
    $a = c_tk() . ':' . (int)$me['id']; $b = $p['tk'] . ':' . $p['uid'];
    $key = strcmp($a, $b) < 0 ? $a . '|' . $b : $b . '|' . $a;
    $c = h_one('SELECT * FROM c_chats WHERE direct_key = ?', [$key]);
    if (!$c) {
        h_q("INSERT INTO c_chats (kind, tkey, direct_key, created_by, created_at) VALUES ('direct', ?, ?, ?, ?)", [c_tk(), $key, $a, now()]);
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
    if ($c['kind'] === 'direct' || !$adm) fail('Bu ayarı yalnız grup yöneticisi değiştirebilir.', 403);
    global $IN;
    $changes = [];
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
    if ($c['kind'] !== 'group' || !$adm) fail('Üyeleri yalnız grup yöneticisi değiştirebilir.', 403);
    $op = s('op', 10);
    if ($op === 'add') {
        $people = c_valid_people($me, arr('members'));
        $new = array_values(array_filter($people, fn($p) => !h_one('SELECT 1 FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $p['tk'], $p['uid']])));
        c_add_members((int)$c['id'], $new);
        if ($new) c_system((int)$c['id'], $me, $me['name'] . ' ekledi: ' . implode(', ', array_column($new, 'name')));
        out(['added' => count($new)]);
    }
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
];
