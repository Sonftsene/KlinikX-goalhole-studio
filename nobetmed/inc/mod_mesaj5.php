<?php
/**
 * dupcii — Yönetici: kişinin sohbetlerini silme (4.51.0)
 *
 * Yönetici (Kullanıcılar › kişi › Sohbetleri) kişinin sohbetlerini görür ve siler; MESAJ İÇERİĞİNİ GÖRMEZ
 * (yalnız sohbet adı, türü, üye ve mesaj sayısı, son mesaj zamanı — KVKK).
 *  - Birebir sohbet (karşı taraf başka birimde olsa da) ve bu birimde kurulmuş grup: herkesten tamamen silinir
 *    (mesajlar, dosyalar, tepkiler, aramalar).
 *  - Başka birimin kurduğu grup: yalnız bu birimdeki kişinin listesinden kaldırılır.
 *  - Ayrıca birimin TÜM sohbetleri tek listede (kim kiminle), kişi seçmeden silinebilir (chat.admin.all).
 *  - Birim grubu silinmez.
 * Her silme işlem günlüğüne yazılır; sohbetteki (bu birimdeki) kişilere içeriksiz bildirim gider.
 */

/** Kişinin sohbetleri ve silme kapsamı */
function cx_chats_of(int $uid): array
{
    $tk = c_tk();
    $o = [];
    foreach (h_all('SELECT c.* FROM c_chats c JOIN c_members m ON m.chat_id = c.id WHERE m.tkey = ? AND m.user_id = ? AND c.kind <> ? ORDER BY COALESCE(c.last_at, c.created_at) DESC', [$tk, $uid, 'unit']) as $c) {
        $mem = h_all('SELECT tkey, user_id, name FROM c_members WHERE chat_id = ?', [(int)$c['id']]);
        $foreign = array_filter($mem, fn($m) => $m['tkey'] !== $tk);
        $name = $c['kind'] === 'direct'
            ? ((array_values(array_filter($mem, fn($m) => !($m['tkey'] === $tk && (int)$m['user_id'] === $uid)))[0]['name'] ?? 'Birebir sohbet'))
            : ((string)$c['name'] ?: 'Grup');
        $full = $c['kind'] === 'direct' || $c['tkey'] === $tk; // birebir: kim kime yazdıysa iki taraftan da silinir
        $o[] = [
            'id' => (int)$c['id'], 'kind' => $c['kind'], 'name' => $name, 'members' => count($mem),
            'msgs' => (int)h_val("SELECT COUNT(*) FROM c_msgs WHERE chat_id = ? AND kind <> 'system'", [(int)$c['id']]),
            'last_at' => $c['last_at'], 'scope' => $full ? 'all' : 'own',
            'other_unit' => $foreign ? (string)(array_values($foreign)[0]['name'] ?? '') : null,
        ];
    }
    return $o;
}

/** Sohbeti tamamen sil (mesajlar, dosyalar, tepkiler, oylar, yıldızlar, aramalar, üyeler) */
function cx_purge(int $chatId): void
{
    $ids = array_map('intval', array_column(h_all('SELECT id FROM c_msgs WHERE chat_id = ?', [$chatId]), 'id'));
    foreach (array_chunk($ids, 400) as $ch) {
        $in = implode(',', $ch);
        foreach (['c_reacts', 'c_votes', 'c_stars', 'c_hidden', 'c_once'] as $t) { try { h_q("DELETE FROM $t WHERE msg_id IN ($in)"); } catch (Throwable $e) { /* tablo yok */ } }
    }
    foreach (h_all('SELECT id, stored FROM c_files WHERE chat_id = ?', [$chatId]) as $f) { @unlink(c_dir() . '/' . $f['stored']); }
    h_q('DELETE FROM c_files WHERE chat_id = ?', [$chatId]);
    h_q('DELETE FROM c_msgs WHERE chat_id = ?', [$chatId]);
    try { foreach (h_all('SELECT id FROM c_calls WHERE chat_id = ?', [$chatId]) as $k) h_q('DELETE FROM c_sig WHERE call_id = ?', [(int)$k['id']]); h_q('DELETE FROM c_calls WHERE chat_id = ?', [$chatId]); } catch (Throwable $e) { /* */ }
    foreach (['c_joinreq', 'c_bans', 'c_members'] as $t) { try { h_q("DELETE FROM $t WHERE chat_id = ?", [$chatId]); } catch (Throwable $e) { /* */ } }
    h_q('DELETE FROM c_chats WHERE id = ?', [$chatId]);
}

/** Birimden en az bir kişinin bulunduğu tüm sohbetler (birim grubu hariç): kim kiminle, mesaj sayısı, son zaman */
function cx_all_chats(): array
{
    $tk = c_tk();
    $o = [];
    foreach (h_all('SELECT DISTINCT c.* FROM c_chats c JOIN c_members m ON m.chat_id = c.id WHERE m.tkey = ? AND c.kind <> ? ORDER BY COALESCE(c.last_at, c.created_at) DESC LIMIT 1000', [$tk, 'unit']) as $c) {
        $mem = h_all('SELECT tkey, user_id, name, unit_name FROM c_members WHERE chat_id = ? ORDER BY name', [(int)$c['id']]);
        $who = array_map(fn($m) => (string)$m['name'] . ($m['tkey'] !== $tk && $m['unit_name'] !== '' ? ' (' . $m['unit_name'] . ')' : ''), $mem);
        $o[] = [
            'id' => (int)$c['id'], 'kind' => $c['kind'],
            'name' => $c['kind'] === 'direct' ? implode(' ↔ ', array_slice($who, 0, 2)) : ((string)$c['name'] ?: 'Grup'),
            'people' => $c['kind'] === 'direct' ? null : implode(', ', array_slice($who, 0, 8)) . (count($who) > 8 ? ' …' : ''),
            'members' => count($mem),
            'msgs' => (int)h_val("SELECT COUNT(*) FROM c_msgs WHERE chat_id = ? AND kind <> 'system'", [(int)$c['id']]),
            'last_at' => $c['last_at'], 'scope' => $c['kind'] === 'direct' || $c['tkey'] === $tk ? 'all' : 'own',
        ];
    }
    return $o;
}

function a_chat_admin_all(): void
{
    need_admin();
    c_need();
    out(['items' => cx_all_chats()]);
}

function cx_target(): array
{
    $me = need_admin();
    c_need();
    $u = one("SELECT id, name FROM users WHERE id = ? AND status <> 'deleted'", [(int)i('user_id')]) ?? fail('Kişi bulunamadı.', 404);
    return [$me, $u];
}

function a_chat_admin_list(): void
{
    [, $u] = cx_target();
    out(['user' => ['id' => (int)$u['id'], 'name' => $u['name']], 'items' => cx_chats_of((int)$u['id'])]);
}

/** {user_id, id, mode: all|own} */
function a_chat_admin_delete(): void
{
    $id = (int)i('id');
    $row = null;
    if ((int)i('user_id')) {
        [$me, $u] = cx_target();
        foreach (cx_chats_of((int)$u['id']) as $x) if ($x['id'] === $id) $row = $x;
    } else {
        // Birim geneli liste: kişi seçmeden (başka birimin grubunda birimdeki herkes listeden çıkar)
        $me = need_admin(); c_need();
        foreach (cx_all_chats() as $x) if ($x['id'] === $id) $row = $x;
        $u = null;
    }
    if (!$row) fail('Sohbet bulunamadı ya da biriminize ait değil.', 404);
    $mode = s('mode', 4) === 'all' && $row['scope'] === 'all' ? 'all' : 'own';
    $tk = c_tk();
    $notify = [];
    if ($mode === 'all') {
        foreach (h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ?', [$id, $tk]) as $m) if ((int)$m['user_id'] !== (int)$me['id']) $notify[] = (int)$m['user_id'];
        cx_purge($id);
    } else {
        $c = h_one('SELECT last_id FROM c_chats WHERE id = ?', [$id]);
        $targets = $u ? [(int)$u['id']] : array_map('intval', array_column(h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ?', [$id, $tk]), 'user_id'));
        foreach ($targets as $t) {
            h_q('UPDATE c_members SET cleared_id = ?, deleted = 1, pinned_at = NULL, archived = 0 WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)($c['last_id'] ?? 0), $id, $tk, $t]);
            if ($t !== (int)$me['id']) $notify[] = $t;
        }
    }
    $label = ($row['kind'] === 'direct' ? 'birebir sohbet: ' : 'grup: ') . $row['name'];
    audit($me, 'chat.admin.delete', $u ? $u['name'] : 'birim sohbetleri', $label . ' · ' . ($mode === 'all' ? 'herkesten silindi' : 'kişinin listesinden kaldırıldı') . ' · ' . $row['msgs'] . ' mesaj');
    if ($notify && function_exists('notify_users')) {
        $users = all('SELECT * FROM users WHERE status = \'active\' AND id IN (' . implode(',', array_map('intval', $notify)) . ')');
        notify_users($users, 'chat_admin', 'Bir sohbetiniz yönetici tarafından silindi',
            ($row['kind'] === 'direct' ? 'Birebir sohbet' : '“' . $row['name'] . '” grubu') . ($mode === 'all' ? ' birim yöneticisi tarafından silindi.' : ' listenizden kaldırıldı.'), '#/mesaj');
    }
    out(['mode' => $mode, 'items' => $u ? cx_chats_of((int)$u['id']) : cx_all_chats()]);
}

return [
    'chat.admin.all' => 'a_chat_admin_all',
    'chat.admin.list' => 'a_chat_admin_list',
    'chat.admin.delete' => 'a_chat_admin_delete',
];
