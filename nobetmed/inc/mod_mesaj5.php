<?php
/**
 * dupcii — Yönetici: kişinin sohbetlerini silme (4.51.0)
 *
 * Yönetici (Kullanıcılar › kişi › Sohbetleri) kişinin sohbetlerini görür ve siler; MESAJ İÇERİĞİNİ GÖRMEZ
 * (yalnız sohbet adı, türü, üye ve mesaj sayısı, son mesaj zamanı — KVKK).
 *  - Birimin kendi sohbeti (birebirde iki taraf da bu birimde; grup bu birimde kurulmuş): herkesten tamamen silinir
 *    (mesajlar, dosyalar, tepkiler, aramalar).
 *  - Başka birimdeki biriyle birebir ya da başka birimin grubu: yalnız bu kişinin listesinden kaldırılır (kişi için “sil”).
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
        $full = $c['kind'] === 'direct' ? !$foreign : $c['tkey'] === $tk;
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
    [$me, $u] = cx_target();
    $id = (int)i('id');
    $row = null;
    foreach (cx_chats_of((int)$u['id']) as $x) if ($x['id'] === $id) $row = $x;
    if (!$row) fail('Sohbet bulunamadı ya da bu kişinin değil.', 404);
    $mode = s('mode', 4) === 'all' && $row['scope'] === 'all' ? 'all' : 'own';
    $tk = c_tk();
    $notify = [];
    if ($mode === 'all') {
        foreach (h_all('SELECT user_id FROM c_members WHERE chat_id = ? AND tkey = ?', [$id, $tk]) as $m) if ((int)$m['user_id'] !== (int)$me['id']) $notify[] = (int)$m['user_id'];
        cx_purge($id);
    } else {
        $c = h_one('SELECT last_id FROM c_chats WHERE id = ?', [$id]);
        h_q('UPDATE c_members SET cleared_id = ?, deleted = 1, pinned_at = NULL, archived = 0 WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)($c['last_id'] ?? 0), $id, $tk, (int)$u['id']]);
        if ((int)$u['id'] !== (int)$me['id']) $notify[] = (int)$u['id'];
    }
    $label = ($row['kind'] === 'direct' ? 'birebir sohbet: ' : 'grup: ') . $row['name'];
    audit($me, 'chat.admin.delete', $u['name'], $label . ' · ' . ($mode === 'all' ? 'herkesten silindi' : 'kişinin listesinden kaldırıldı') . ' · ' . $row['msgs'] . ' mesaj');
    if ($notify && function_exists('notify_users')) {
        $users = all('SELECT * FROM users WHERE status = \'active\' AND id IN (' . implode(',', array_map('intval', $notify)) . ')');
        notify_users($users, 'chat_admin', 'Bir sohbetiniz yönetici tarafından silindi',
            ($row['kind'] === 'direct' ? 'Birebir sohbet' : '“' . $row['name'] . '” grubu') . ($mode === 'all' ? ' birim yöneticisi tarafından silindi.' : ' listenizden kaldırıldı.'), '#/mesaj');
    }
    out(['mode' => $mode, 'items' => cx_chats_of((int)$u['id'])]);
}

return [
    'chat.admin.list' => 'a_chat_admin_list',
    'chat.admin.delete' => 'a_chat_admin_delete',
];
