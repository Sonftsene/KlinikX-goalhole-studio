<?php
/**
 * dupcii — Yönetici: sohbetleri silme, çöp kutusu (4.51.0 / 4.53.0) ve tepki verenler
 *
 * Yönetici MESAJ İÇERİĞİNİ GÖRMEZ (KVKK): yalnız sohbet adı, kim kiminle, hangi tarafta duruyor, mesaj sayısı, son mesaj zamanı.
 *  - Listede yalnız EN AZ BİR KİŞİDE duran sohbetler görünür (herkesin kendisi sildiği sohbet görünmez); her kişinin yanında
 *    “var / sildi” yazar.
 *  - “Sil”: sohbet herkesin listesinden ve geçmişinden kalkar ama KALICI SİLİNMEZ — yöneticinin çöp kutusuna gider (c_trash:
 *    kişilerin önceki durumu saklanır). Çöp kutusundan geri yüklenir (herkeste eski hâline döner) ya da kalıcı silinir.
 *    Birebir sohbet kim kime yazdıysa iki taraftan; birimde kurulan grup herkesten; başka birimin grubunda yalnız birimdeki kişilerden.
 *    Kalıcı silme başka birimden üyesi olan sohbette yalnız bu birimin kişilerini çıkarır (öteki birimin verisine dokunulmaz).
 *  - Kişilere bildirim isteğe bağlıdır (varsayılan: gitmez). Her işlem işlem günlüğüne yazılır. Birim grubu silinmez.
 *  - Tepki verenler (chat.reacts): mesajdaki tepkiye dokununca kim hangi tepkiyi verdi; kişi kendi tepkisini oradan kaldırır.
 */

function cx_ensure(): void
{
    static $ok = false;
    if ($ok || !cdb()) return;
    $ok = true;
    cdb()->exec('CREATE TABLE IF NOT EXISTS c_trash (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, tkey TEXT NOT NULL, kind TEXT NOT NULL DEFAULT \'\',
        label TEXT NOT NULL DEFAULT \'\', people TEXT NOT NULL DEFAULT \'\', msgs INTEGER NOT NULL DEFAULT 0, saved TEXT NOT NULL, by_name TEXT NOT NULL DEFAULT \'\', at TEXT NOT NULL)');
    cdb()->exec('CREATE INDEX IF NOT EXISTS c_trash_tk ON c_trash (tkey, id)');
}

/** Üye sohbeti görüyor mu (listesinde ve geçmişinde mesaj var) */
function cx_has(array $c, array $m): bool { return (int)$c['last_id'] > (int)$m['cleared_id']; }

/** Bir sohbetin yönetici satırı (içerik yok) */
function cx_row(array $c, ?int $forUid = null, ?array $pre = null): ?array
{
    $tk = c_tk();
    $mem = $pre['mem'][(int)$c['id']] ?? ($pre ? [] : h_all('SELECT tkey, user_id, name, unit_name, cleared_id, deleted FROM c_members WHERE chat_id = ? ORDER BY name', [(int)$c['id']]));
    $sides = array_map(fn($m) => ['name' => (string)$m['name'], 'unit' => $m['tkey'] !== $tk ? (string)$m['unit_name'] : null, 'has' => cx_has($c, $m)], $mem);
    $hasN = count(array_filter($sides, fn($x) => $x['has']));
    if (!$hasN) return null; // herkes kendisi silmiş: görünmez
    $label = fn($x) => $x['name'] . ($x['unit'] ? ' (' . $x['unit'] . ')' : '');
    if ($c['kind'] === 'direct') {
        $name = implode(' ↔ ', array_map($label, array_slice($sides, 0, 2)));
        if ($forUid !== null) {
            foreach ($mem as $i => $m) if (!($m['tkey'] === $tk && (int)$m['user_id'] === $forUid)) { $name = $label($sides[$i]); break; }
        }
    } else $name = (string)$c['name'] ?: 'Grup';
    return [
        'id' => (int)$c['id'], 'kind' => $c['kind'], 'name' => $name, 'members' => count($mem), 'has_n' => $hasN,
        'sides' => array_slice($sides, 0, 12),
        'msgs' => $pre ? (int)($pre['n'][(int)$c['id']] ?? 0) : (int)h_val("SELECT COUNT(*) FROM c_msgs WHERE chat_id = ? AND kind <> 'system'", [(int)$c['id']]),
        'last_at' => $c['last_at'], 'scope' => $c['kind'] === 'direct' || $c['tkey'] === $tk ? 'all' : 'own',
    ];
}

/** Kişinin sohbetleri */
function cx_chats_of(int $uid): array
{
    $o = [];
    foreach (h_all('SELECT c.* FROM c_chats c JOIN c_members m ON m.chat_id = c.id WHERE m.tkey = ? AND m.user_id = ? AND c.kind <> ? ORDER BY COALESCE(c.last_at, c.created_at) DESC', [c_tk(), $uid, 'unit']) as $c) {
        if ($r = cx_row($c, $uid)) $o[] = $r;
    }
    return $o;
}

/** Birimden en az bir kişinin bulunduğu tüm sohbetler (birim grubu hariç) */
function cx_all_chats(): array
{
    $o = [];
    $chats = h_all('SELECT DISTINCT c.* FROM c_chats c JOIN c_members m ON m.chat_id = c.id WHERE m.tkey = ? AND c.kind <> ? ORDER BY COALESCE(c.last_at, c.created_at) DESC LIMIT 1000', [c_tk(), 'unit']);
    // Üyeler ve mesaj sayıları toplu okunur (sohbet başına iki sorgu yerine — 4.55.0)
    $pre = ['mem' => [], 'n' => []];
    foreach (array_chunk(array_map(fn($c) => (int)$c['id'], $chats), 400) as $ids) {
        $in = implode(',', $ids);
        foreach (h_all("SELECT chat_id, tkey, user_id, name, unit_name, cleared_id, deleted FROM c_members WHERE chat_id IN ($in) ORDER BY name") as $m) $pre['mem'][(int)$m['chat_id']][] = $m;
        foreach (h_all("SELECT chat_id, COUNT(*) AS n FROM c_msgs WHERE chat_id IN ($in) AND kind <> 'system' GROUP BY chat_id") as $x) $pre['n'][(int)$x['chat_id']] = (int)$x['n'];
    }
    foreach ($chats as $c) {
        if ($r = cx_row($c, null, $pre)) $o[] = $r;
    }
    return $o;
}

/** Sohbeti tamamen sil (çöp kutusundan kalıcı silme) */
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
    cx_ensure();
    $u = one("SELECT id, name FROM users WHERE id = ?", [(int)i('user_id')]) ?? fail('Kişi bulunamadı.', 404);
    return [$me, $u];
}

function a_chat_admin_all(): void
{
    need_admin(); c_need(); cx_ensure();
    out(['items' => cx_all_chats(), 'trash' => (int)h_val('SELECT COUNT(*) FROM c_trash WHERE tkey = ?', [c_tk()])]);
}

function a_chat_admin_list(): void
{
    [, $u] = cx_target();
    out(['user' => ['id' => (int)$u['id'], 'name' => $u['name']], 'items' => cx_chats_of((int)$u['id']), 'trash' => (int)h_val('SELECT COUNT(*) FROM c_trash WHERE tkey = ?', [c_tk()])]);
}

/** {user_id?, id, notify?} — sohbeti çöp kutusuna taşır (herkesin / birimdeki kişilerin listesinden ve geçmişinden kalkar) */
function a_chat_admin_delete(): void
{
    $id = (int)i('id');
    $row = null; $u = null;
    if ((int)i('user_id')) {
        [$me, $u] = cx_target();
        foreach (cx_chats_of((int)$u['id']) as $x) if ($x['id'] === $id) $row = $x;
    } else {
        $me = need_admin(); c_need(); cx_ensure();
        foreach (cx_all_chats() as $x) if ($x['id'] === $id) $row = $x;
    }
    if (!$row) fail('Sohbet bulunamadı ya da biriminize ait değil.', 404);
    $tk = c_tk();
    $c = h_one('SELECT * FROM c_chats WHERE id = ?', [$id]);
    // Birebir ve birimin grubu: herkesten; başka birimin grubu: birimdeki kişilerden
    $mem = $row['scope'] === 'all' ? h_all('SELECT * FROM c_members WHERE chat_id = ?', [$id]) : h_all('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ?', [$id, $tk]);
    $saved = array_map(fn($m) => ['tk' => $m['tkey'], 'uid' => (int)$m['user_id'], 'cleared_id' => (int)$m['cleared_id'], 'deleted' => (int)$m['deleted'], 'archived' => (int)($m['archived'] ?? 0), 'pinned_at' => $m['pinned_at'] ?? null], $mem);
    $people = implode(', ', array_map(fn($x) => $x['name'] . ($x['unit'] ? ' (' . $x['unit'] . ')' : ''), $row['sides']));
    h_q('INSERT INTO c_trash (chat_id, tkey, kind, label, people, msgs, saved, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$id, $tk, (string)$c['kind'], $row['name'], mb_substr($people, 0, 500), $row['msgs'], json_encode($saved), (string)$me['name'], now()]);
    foreach ($mem as $m) h_q('UPDATE c_members SET cleared_id = ?, deleted = 1, pinned_at = NULL, archived = 0 WHERE chat_id = ? AND tkey = ? AND user_id = ?', [(int)$c['last_id'], $id, $m['tkey'], (int)$m['user_id']]);
    audit($me, 'chat.admin.delete', $u ? $u['name'] : 'birim sohbetleri', ($row['kind'] === 'direct' ? 'birebir sohbet: ' : 'grup: ') . $row['name'] . ' · çöp kutusuna taşındı · ' . $row['msgs'] . ' mesaj');
    $n = 0;
    if (b('notify') && function_exists('notify_users')) {
        $ids = array_values(array_filter(array_map(fn($m) => $m['tkey'] === $tk ? (int)$m['user_id'] : 0, $mem), fn($x) => $x && $x !== (int)$me['id']));
        if ($ids) {
            notify_users(all('SELECT * FROM users WHERE status = \'active\' AND id IN (' . implode(',', $ids) . ')'), 'chat_admin',
                'Bir sohbetiniz yönetici tarafından kaldırıldı', ($row['kind'] === 'direct' ? 'Birebir sohbet' : '“' . $row['name'] . '” grubu') . ' birim yöneticisi tarafından listenizden kaldırıldı.', '#/mesaj');
            $n = count($ids);
        }
    }
    out(['items' => $u ? cx_chats_of((int)$u['id']) : cx_all_chats(), 'notified' => $n, 'trash' => (int)h_val('SELECT COUNT(*) FROM c_trash WHERE tkey = ?', [$tk])]);
}

/** Çöp kutusu (bu birimin yöneticisinin taşıdıkları) */
function a_chat_admin_trash(): void
{
    need_admin(); c_need(); cx_ensure();
    $o = [];
    foreach (h_all('SELECT * FROM c_trash WHERE tkey = ? ORDER BY id DESC LIMIT 300', [c_tk()]) as $t) {
        $c = h_one('SELECT id, last_id FROM c_chats WHERE id = ?', [(int)$t['chat_id']]);
        $o[] = ['id' => (int)$t['id'], 'kind' => $t['kind'], 'name' => $t['label'], 'people' => $t['people'], 'msgs' => (int)$t['msgs'], 'by' => $t['by_name'], 'at' => $t['at'], 'gone' => !$c];
    }
    out(['items' => $o]);
}

function cx_trash_row(): array
{
    $me = need_admin(); c_need(); cx_ensure();
    $t = h_one('SELECT * FROM c_trash WHERE id = ? AND tkey = ?', [(int)i('id'), c_tk()]) ?? fail('Çöp kutusunda bulunamadı.', 404);
    return [$me, $t];
}

/** Geri yükle: kişilerin önceki durumu (geçmiş, arşiv, sabitleme) geri gelir */
function a_chat_admin_restore(): void
{
    [$me, $t] = cx_trash_row();
    if (!h_one('SELECT id FROM c_chats WHERE id = ?', [(int)$t['chat_id']])) { h_q('DELETE FROM c_trash WHERE id = ?', [(int)$t['id']]); fail('Sohbet artık yok.', 404); }
    foreach ((array)json_decode((string)$t['saved'], true) as $s) {
        h_q('UPDATE c_members SET cleared_id = ?, deleted = ?, archived = ?, pinned_at = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?',
            [(int)$s['cleared_id'], (int)$s['deleted'], (int)$s['archived'], $s['pinned_at'] ?? null, (int)$t['chat_id'], (string)$s['tk'], (int)$s['uid']]);
    }
    h_q('DELETE FROM c_trash WHERE id = ?', [(int)$t['id']]);
    audit($me, 'chat.admin.restore', (string)$t['label'], 'çöp kutusundan geri yüklendi');
    out(['ok' => true]);
}

/** Kalıcı sil: mesajlar, dosyalar, tepkiler geri gelmez */
function a_chat_admin_purge(): void
{
    [$me, $t] = cx_trash_row();
    $cid = (int)$t['chat_id'];
    $tk = c_tk();
    $how = 'kalıcı silindi';
    if (h_one('SELECT id FROM c_chats WHERE id = ?', [$cid])) {
        // Başka birimden üyesi olan sohbet (başka birimin grubu ya da birimler arası birebir) bütünüyle silinmez: yalnız bu birimin
        // kişileri sohbetten çıkarılır; diğer birimin kişileri ve mesajları o birimin yöneticisine aittir (4.55.0)
        if ((int)h_val('SELECT COUNT(*) FROM c_members WHERE chat_id = ? AND tkey <> ?', [$cid, $tk])) {
            h_q('DELETE FROM c_members WHERE chat_id = ? AND tkey = ?', [$cid, $tk]);
            h_q("UPDATE c_chats SET direct_key = NULL WHERE id = ? AND kind = 'direct'", [$cid]); // aynı kişilerle yeni sohbet açılabilsin
            $how = 'birimdeki kişiler sohbetten kalıcı çıkarıldı (diğer birimin kişileri etkilenmedi)';
        } else cx_purge($cid);
    }
    h_q('DELETE FROM c_trash WHERE chat_id = ? AND tkey = ?', [$cid, $tk]);
    audit($me, 'chat.admin.purge', (string)$t['label'], $how . ' · ' . (int)$t['msgs'] . ' mesaj');
    out(['ok' => true]);
}

/** Mesaja kim hangi tepkiyi verdi (sohbetteki herkes görür) */
function a_chat_reacts(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ? AND deleted_at IS NULL', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    c_access($me, (int)$x['chat_id']);
    $o = [];
    foreach (h_all('SELECT r.tkey, r.user_id, r.emoji, m.name FROM c_reacts r LEFT JOIN c_members m ON m.chat_id = ? AND m.tkey = r.tkey AND m.user_id = r.user_id WHERE r.msg_id = ?', [(int)$x['chat_id'], (int)$x['id']]) as $r) {
        $mine = $r['tkey'] === c_tk() && (int)$r['user_id'] === (int)$me['id'];
        $o[] = ['name' => $mine ? 'Siz' : ((string)$r['name'] ?: 'Bir kişi'), 'emoji' => $r['emoji'], 'mine' => $mine];
    }
    usort($o, fn($a, $b) => [!$a['mine'], $a['emoji'], $a['name']] <=> [!$b['mine'], $b['emoji'], $b['name']]);
    out(['items' => $o]);
}

return [
    'chat.admin.all' => 'a_chat_admin_all',
    'chat.admin.list' => 'a_chat_admin_list',
    'chat.admin.delete' => 'a_chat_admin_delete',
    'chat.admin.trash' => 'a_chat_admin_trash',
    'chat.admin.restore' => 'a_chat_admin_restore',
    'chat.admin.purge' => 'a_chat_admin_purge',
    'chat.reacts' => 'a_chat_reacts',
];
