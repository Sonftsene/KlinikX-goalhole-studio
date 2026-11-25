<?php
/**
 * Mesajlaşma ayarları (4.6) — WhatsApp düzeyinde gizlilik, sohbet ve grup ayarları.
 *  "Kişilerim" = aynı birim + ortak bir grup/sohbet (WhatsApp'taki rehberin karşılığı).
 *  Gizlilik: son görülme/çevrimiçi (karşılıklı), hakkımda, okundu bilgisi (birebirde karşılıklı; gruplarda her zaman),
 *  beni gruplara kim ekleyebilir, diğer birimlerden bulunabilirlik ve kimler yazabilir, engellenenler, varsayılan kaybolma süresi.
 *  Sohbet: listede sabitle, arşivle, okunmadı işaretle, süreli sessize al, benim için temizle/sil, düzenle (15 dk), benden sil,
 *  yıldızla, sohbette ara, medya/belge/bağlantılar, yazıyor göstergesi.
 *  Grup: bilgiyi kim düzenler, kim üye ekler, katılma onayı, fotoğraf.
 */
declare(strict_types=1);

const C_EDIT_SEC = 900; // mesaj 15 dk içinde düzenlenebilir
const C_VIS = ['all', 'contacts', 'none'];

/* ---------------- Tercihler ---------------- */

function c_pref(string $tk, int $uid): array
{
    $r = h_one('SELECT * FROM c_prefs WHERE tkey = ? AND user_id = ?', [$tk, $uid]);
    return $r ?: ['tkey' => $tk, 'user_id' => $uid, 'name' => '', 'unit_name' => '', 'about' => '', 'about_vis' => 'all', 'seen_vis' => 'contacts', 'receipts' => 1,
        'add_groups' => 'all', 'findable' => 0, 'dm_from' => 'all', 'ret_default' => 0, 'last_seen' => null, 'typing_chat' => null, 'typing_at' => null];
}

/** Kendi kaydım (ad/birim güncel, son görülme) */
function c_pref_touch(array $me): void
{
    if (!empty($me['sa_virtual'])) return;
    h_q('INSERT INTO c_prefs (tkey, user_id, name, unit_name, last_seen) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tkey, user_id) DO UPDATE SET name = excluded.name, unit_name = excluded.unit_name, last_seen = excluded.last_seen',
        [c_tk(), (int)$me['id'], (string)$me['name'], c_unit(), now()]);
}

function c_is_contact(string $atk, int $auid, string $btk, int $buid): bool
{
    if ($atk === $btk) return true;
    return (bool)h_val("SELECT 1 FROM c_members a JOIN c_members b ON b.chat_id = a.chat_id JOIN c_chats c ON c.id = a.chat_id
        WHERE a.tkey = ? AND a.user_id = ? AND b.tkey = ? AND b.user_id = ? AND c.kind IN ('group', 'direct') LIMIT 1", [$atk, $auid, $btk, $buid]);
}

function c_can_see(string $vis, string $vtk, int $vuid, string $otk, int $ouid): bool
{
    if ($vtk === $otk && $vuid === $ouid) return true;
    return $vis === 'all' || ($vis === 'contacts' && c_is_contact($vtk, $vuid, $otk, $ouid));
}

/** a, b'yi engelledi mi */
function c_blocked_by(string $atk, int $auid, string $btk, int $buid): bool
{
    return (bool)h_val('SELECT 1 FROM c_blocks WHERE tkey = ? AND user_id = ? AND btkey = ? AND buid = ?', [$atk, $auid, $btk, $buid]);
}

/** Kişi özeti (gizlilik ayarlarına göre): hakkımda, çevrimiçi/son görülme */
function c_profile_out(array $me, string $tk, int $uid): array
{
    $p = c_pref($tk, $uid);
    $mine = c_pref(c_tk(), (int)$me['id']);
    $o = ['tk' => $tk, 'uid' => $uid, 'name' => $p['name'], 'unit' => $tk === c_tk() ? '' : $p['unit_name']];
    if ($p['about'] !== '' && c_can_see((string)$p['about_vis'], c_tk(), (int)$me['id'], $tk, $uid)) $o['about'] = $p['about'];
    // Son görülme karşılıklı: kendini gizleyen başkalarınınkini de göremez
    if ($mine['seen_vis'] !== 'none' && $p['last_seen'] && c_can_see((string)$p['seen_vis'], c_tk(), (int)$me['id'], $tk, $uid)) {
        $o['online'] = strtotime((string)$p['last_seen']) > time() - 75;
        $o['last_seen'] = $p['last_seen'];
    }
    $o['blocked'] = c_blocked_by(c_tk(), (int)$me['id'], $tk, $uid);
    return $o;
}

function a_chat_prefs_get(): void
{
    $me = c_need();
    c_pref_touch($me);
    $p = c_pref(c_tk(), (int)$me['id']);
    out(['prefs' => ['about' => $p['about'], 'about_vis' => $p['about_vis'], 'seen_vis' => $p['seen_vis'], 'receipts' => (int)$p['receipts'] === 1, 'add_groups' => $p['add_groups'],
        'findable' => (int)$p['findable'] === 1, 'dm_from' => $p['dm_from'], 'ret_default' => (int)$p['ret_default']],
        'blocked' => array_map(fn($b) => ['tk' => $b['btkey'], 'uid' => (int)$b['buid'], 'name' => $b['bname'], 'at' => $b['at']], h_all('SELECT * FROM c_blocks WHERE tkey = ? AND user_id = ? ORDER BY at DESC', [c_tk(), (int)$me['id']]))]);
}

function a_chat_prefs_save(): void
{
    $me = c_need();
    global $IN;
    c_pref_touch($me);
    $set = [];
    if (array_key_exists('about', $IN)) { $a = s('about', 140); if (c_has_tckn($a)) fail('Hakkımda alanında T.C. kimlik numarası olamaz.', 422); $set['about'] = $a; }
    foreach (['about_vis', 'seen_vis'] as $k) if (array_key_exists($k, $IN)) { $v = s($k, 10); if (!in_array($v, C_VIS, true)) fail('Geçersiz seçim.'); $set[$k] = $v; }
    if (array_key_exists('receipts', $IN)) $set['receipts'] = b('receipts') ? 1 : 0;
    if (array_key_exists('add_groups', $IN)) { $v = s('add_groups', 10); if (!in_array($v, ['all', 'unit', 'none'], true)) fail('Geçersiz seçim.'); $set['add_groups'] = $v; }
    if (array_key_exists('findable', $IN)) $set['findable'] = b('findable') ? 1 : 0;
    if (array_key_exists('dm_from', $IN)) { $v = s('dm_from', 10); if (!in_array($v, ['all', 'contacts'], true)) fail('Geçersiz seçim.'); $set['dm_from'] = $v; }
    if (array_key_exists('ret_default', $IN)) { $v = (int)i('ret_default'); if (!in_array($v, C_RETENTION, true)) fail('Geçersiz süre.'); $set['ret_default'] = $v; }
    foreach ($set as $k => $v) h_q("UPDATE c_prefs SET $k = ? WHERE tkey = ? AND user_id = ?", [$v, c_tk(), (int)$me['id']]);
    a_chat_prefs_get();
}

function a_chat_block(): void
{
    $me = c_need();
    $tk = s('tk', 16); $uid = (int)i('uid');
    if ($tk === c_tk() && $uid === (int)$me['id']) fail('Kendinizi engelleyemezsiniz.');
    if (b('on')) {
        $p = c_pref($tk, $uid);
        // Başka birimden yalnız ortak sohbeti olan ya da bulunabilir kişi engellenir (başka birimlerin kadrosu ad ad taranamasın)
        if (!c_is_contact(c_tk(), (int)$me['id'], $tk, $uid) && !(int)$p['findable']) fail('Kişi bulunamadı.', 404);
        $name = $p['name'] ?: (string)(h_val('SELECT name FROM c_members WHERE tkey = ? AND user_id = ? LIMIT 1', [$tk, $uid]) ?: ($tk === c_tk() ? (string)val('SELECT name FROM users WHERE id = ?', [$uid]) : ''));
        if ($name === '') fail('Kişi bulunamadı.', 404);
        h_q('INSERT OR IGNORE INTO c_blocks (tkey, user_id, btkey, buid, bname, at) VALUES (?, ?, ?, ?, ?, ?)', [c_tk(), (int)$me['id'], $tk, $uid, $name, now()]);
    } else {
        h_q('DELETE FROM c_blocks WHERE tkey = ? AND user_id = ? AND btkey = ? AND buid = ?', [c_tk(), (int)$me['id'], $tk, $uid]);
    }
    out();
}

function a_chat_profile(): void
{
    $me = c_need();
    $tk = s('tk', 16); $uid = (int)i('uid');
    if (!c_is_contact(c_tk(), (int)$me['id'], $tk, $uid) && !(int)c_pref($tk, $uid)['findable']) fail('Bu kişinin profilini göremezsiniz.', 403);
    $o = c_profile_out($me, $tk, $uid);
    if ($o['name'] === '' && $tk === c_tk()) $o['name'] = (string)val('SELECT name FROM users WHERE id = ?', [$uid]);
    // Aynı birimden: telefon (ekip rehberinde zaten görünür) ve unvan
    if ($tk === c_tk() && ($u = one("SELECT id, phone, title_id, ui_prefs FROM users WHERE id = ? AND status = 'active'", [$uid]))) {
        if (!empty($u['phone']) && contact_vis($u, $me)['phone']) $o['phone'] = $u['phone'];
        if ($u['title_id']) $o['title'] = (string)(val('SELECT name FROM titles WHERE id = ?', [(int)$u['title_id']]) ?? '');
    }
    $o['self'] = $tk === c_tk() && $uid === (int)$me['id'];
    $o['calls'] = function_exists('c_calls_on') && c_calls_on() && !$o['self'];
    $o['groups'] = array_map(fn($g) => ['id' => (int)$g['id'], 'name' => $g['name']], h_all("SELECT c.id, c.name FROM c_chats c JOIN c_members a ON a.chat_id = c.id JOIN c_members b ON b.chat_id = c.id
        WHERE c.kind = 'group' AND a.tkey = ? AND a.user_id = ? AND b.tkey = ? AND b.user_id = ? ORDER BY c.name", [c_tk(), (int)$me['id'], $tk, $uid]));
    out(['profile' => $o]);
}

/* ---------------- Sohbet başına durum ---------------- */

function a_chat_state(): void
{
    $me = c_need();
    [$c, $m] = c_access($me, (int)i('id'));
    $op = s('op', 12);
    $k = [(int)$c['id'], c_tk(), (int)$me['id']];
    $w = ' WHERE chat_id = ? AND tkey = ? AND user_id = ?';
    switch ($op) {
        case 'pin':
            if ((int)h_val('SELECT COUNT(*) FROM c_members WHERE tkey = ? AND user_id = ? AND pinned_at IS NOT NULL', [c_tk(), (int)$me['id']]) >= 3) fail('En fazla 3 sohbet sabitlenebilir.');
            h_q('UPDATE c_members SET pinned_at = ?' . $w, [now(), ...$k]); break;
        case 'unpin': h_q('UPDATE c_members SET pinned_at = NULL' . $w, $k); break;
        case 'archive': h_q('UPDATE c_members SET archived = 1, pinned_at = NULL' . $w, $k); break;
        case 'unarchive': h_q('UPDATE c_members SET archived = 0' . $w, $k); break;
        case 'unread': h_q('UPDATE c_members SET unread_mark = 1' . $w, $k); break;
        case 'read': c_mark_read($me, $c); h_q('UPDATE c_members SET unread_mark = 0' . $w, $k); break;
        case 'mute':
            $d = s('dur', 8);
            if ($d === 'always') h_q('UPDATE c_members SET muted = 1, mute_until = NULL' . $w, $k);
            elseif ($d === '8h' || $d === '1w') h_q('UPDATE c_members SET muted = 0, mute_until = ?' . $w, [date('Y-m-d H:i:s', time() + ($d === '8h' ? 8 * 3600 : 7 * 86400)), ...$k]);
            else h_q('UPDATE c_members SET muted = 0, mute_until = NULL' . $w, $k);
            break;
        case 'clear': h_q('UPDATE c_members SET cleared_id = ?' . $w, [(int)$c['last_id'], ...$k]); break;
        case 'delete':
            if ($c['kind'] === 'group') fail('Grubu silmeden önce gruptan çıkın.');
            if ($c['kind'] === 'unit') fail('Birim grubu silinemez; temizleyebilir ya da arşivleyebilirsiniz.');
            h_q('UPDATE c_members SET cleared_id = ?, deleted = 1, pinned_at = NULL, archived = 0' . $w, [(int)$c['last_id'], ...$k]);
            break;
        default: fail('Bu işlem yapılamadı. Sayfayı yenileyip tekrar deneyin.');
    }
    out();
}

/** Mesajı düzenle (kendi metin mesajı, 15 dk içinde) */
function a_chat_edit(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ? AND deleted_at IS NULL', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    c_access($me, (int)$x['chat_id']);
    if (!($x['tkey'] === c_tk() && (int)$x['user_id'] === (int)$me['id'])) fail('Yalnız kendi mesajınızı düzenleyebilirsiniz.', 403);
    if ($x['kind'] !== 'text') fail('Yalnız yazı mesajları düzenlenebilir.');
    if (strtotime((string)$x['created_at']) < time() - C_EDIT_SEC) fail('Mesaj gönderildikten sonra 15 dakika içinde düzenlenebilir.');
    $body = trim(str_replace("\r", '', (string)($GLOBALS['IN']['body'] ?? '')));
    if ($body === '') fail('Boş bırakılamaz; silmek için “Herkesten sil”i kullanın.');
    if (mb_strlen($body) > C_MAX_BODY) fail('Mesaj çok uzun.');
    if (c_has_tckn($body)) fail('Mesajda T.C. kimlik numarası var. Hasta bilgisi mesajla paylaşılamaz.', 422);
    h_q('UPDATE c_msgs SET body = ?, edited_at = ?, upd = ? WHERE id = ?', [$body, now(), now(), $x['id']]);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$x['id']])])[0]]);
}

/** Benden sil: yalnız benim görünümümden kalkar */
function a_chat_hide(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ?', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    c_access($me, (int)$x['chat_id']);
    h_q('INSERT OR IGNORE INTO c_hidden (msg_id, tkey, user_id) VALUES (?, ?, ?)', [$x['id'], c_tk(), (int)$me['id']]);
    h_q('DELETE FROM c_stars WHERE msg_id = ? AND tkey = ? AND user_id = ?', [$x['id'], c_tk(), (int)$me['id']]);
    out();
}

function a_chat_star(): void
{
    $me = c_need();
    $x = h_one('SELECT * FROM c_msgs WHERE id = ? AND deleted_at IS NULL', [(int)i('id')]) ?? fail('Mesaj bulunamadı.', 404);
    c_access($me, (int)$x['chat_id']);
    if (b('on')) h_q('INSERT OR IGNORE INTO c_stars (msg_id, tkey, user_id, at) VALUES (?, ?, ?, ?)', [$x['id'], c_tk(), (int)$me['id'], now()]);
    else h_q('DELETE FROM c_stars WHERE msg_id = ? AND tkey = ? AND user_id = ?', [$x['id'], c_tk(), (int)$me['id']]);
    out();
}

/** Yıldızlı mesajlarım (erişimim süren sohbetlerden) */
function a_chat_starred(): void
{
    $me = c_need();
    $rows = h_all('SELECT m.*, c.kind AS ckind, c.name AS cname, c.tkey AS ctkey FROM c_stars s JOIN c_msgs m ON m.id = s.msg_id JOIN c_chats c ON c.id = m.chat_id
        WHERE s.tkey = ? AND s.user_id = ? AND m.deleted_at IS NULL ORDER BY s.at DESC LIMIT 200', [c_tk(), (int)$me['id']]);
    $o = [];
    foreach ($rows as $r) {
        $ok = $r['ckind'] === 'unit' ? $r['ctkey'] === c_tk() : (bool)h_one('SELECT 1 FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$r['chat_id'], c_tk(), (int)$me['id']]);
        if (!$ok) continue;
        $x = c_msgs_out([$r])[0] ?? null;
        if ($x) $o[] = $x + ['chat_id' => (int)$r['chat_id'], 'chat' => $r['ckind'] === 'direct' ? 'Birebir sohbet' : $r['cname']];
    }
    out(['items' => $o]);
}

/** Sohbette ara */
function a_chat_search(): void
{
    $me = c_need();
    [$c, $m] = c_access($me, (int)i('id'));
    $q = s('q', 80);
    if (mb_strlen($q) < 2) out(['msgs' => []]);
    $rows = h_all("SELECT * FROM c_msgs WHERE chat_id = ? AND id > ? AND deleted_at IS NULL AND kind IN ('text', 'image', 'file', 'audio', 'poll') ORDER BY id DESC LIMIT 400", [(int)$c['id'], (int)$m['cleared_id']]);
    $f = tr_fold($q);
    $rows = array_values(array_filter($rows, fn($r) => strpos(tr_fold((string)$r['body']), $f) !== false || ($r['file_id'] && strpos(tr_fold((string)h_val('SELECT name FROM c_files WHERE id = ?', [(int)$r['file_id']])), $f) !== false)));
    out(['msgs' => c_msgs_out(array_slice($rows, 0, 60))]);
}

/** Medya, belgeler ve bağlantılar */
function a_chat_media(): void
{
    $me = c_need();
    [$c, $m] = c_access($me, (int)i('id'));
    $kind = s('kind', 8);
    if ($kind === 'links') {
        $rows = h_all("SELECT * FROM c_msgs WHERE chat_id = ? AND id > ? AND deleted_at IS NULL AND (body LIKE '%http://%' OR body LIKE '%https://%' OR body LIKE '%www.%') ORDER BY id DESC LIMIT 200", [(int)$c['id'], (int)$m['cleared_id']]);
    } else {
        $kinds = $kind === 'docs' ? "('file', 'audio')" : "('image')";
        $rows = h_all("SELECT * FROM c_msgs WHERE chat_id = ? AND id > ? AND deleted_at IS NULL AND file_id IS NOT NULL AND kind IN $kinds ORDER BY id DESC LIMIT 300", [(int)$c['id'], (int)$m['cleared_id']]);
    }
    out(['msgs' => c_msgs_out($rows)]);
}

/** Yazıyor… (birkaç saniyelik işaret) */
function a_chat_typing(): void
{
    $me = c_need();
    [$c] = c_access($me, (int)i('id'));
    c_pref_touch($me);
    h_q('UPDATE c_prefs SET typing_chat = ?, typing_at = ? WHERE tkey = ? AND user_id = ?', [(int)$c['id'], now(), c_tk(), (int)$me['id']]);
    out();
}

/** Bu sohbette şu an yazanlar */
function c_typing_names(array $c, array $me): array
{
    $rows = h_all('SELECT name, tkey, user_id FROM c_prefs WHERE typing_chat = ? AND typing_at > ? AND NOT (tkey = ? AND user_id = ?)', [(int)$c['id'], date('Y-m-d H:i:s', time() - 6), c_tk(), (int)$me['id']]);
    return array_column($rows, 'name');
}

/** Grup fotoğrafı (bilgiyi düzenleyebilen) */
function a_chat_photo(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    if ($c['kind'] !== 'group' || !($adm || $c['perm_edit'] === 'all')) fail('Grup fotoğrafını değiştirme yetkiniz yok.', 403);
    if (!($aid = i('att_id'))) { h_q('UPDATE c_chats SET photo_file_id = NULL WHERE id = ?', [$c['id']]); c_system((int)$c['id'], $me, $me['name'] . ' grup fotoğrafını kaldırdı'); out(['photo' => null]); }
    $a = one('SELECT * FROM attachments WHERE id = ? AND user_id = ? AND post_id IS NULL AND roster_id IS NULL', [$aid, $me['id']]) ?? fail('Dosya bulunamadı.', 404);
    if (!str_starts_with((string)$a['mime'], 'image/') || (int)$a['size'] > 5 * 1048576) fail('Fotoğraf (en fazla 5 MB) seçin.');
    $stored = date('Ym') . '_' . bin2hex(random_bytes(10)) . '.bin';
    if (!@rename(nm_upload_dir() . '/' . $a['stored_name'], c_dir() . '/' . $stored)) fail('Dosya taşınamadı.', 500);
    h_q('INSERT INTO c_files (chat_id, name, stored, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)', [(int)$c['id'], $a['orig_name'], $stored, $a['mime'], (int)$a['size'], now()]);
    $fid = (int)cdb()->lastInsertId();
    q('DELETE FROM attachments WHERE id = ?', [$aid]);
    h_q('UPDATE c_chats SET photo_file_id = ? WHERE id = ?', [$fid, $c['id']]);
    c_system((int)$c['id'], $me, $me['name'] . ' grup fotoğrafını değiştirdi');
    out(['photo' => c_photo_url($fid)]);
}

function c_photo_url(?int $fid): ?string
{
    return $fid ? 'api.php?action=cfile&id=' . $fid . nm_link_param() : null;
}

/** Katılma isteği: onayla / reddet (grup yöneticisi) */
function a_chat_joinreq(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    if ($c['kind'] !== 'group' || !$adm) fail('Katılma isteklerini grup yöneticisi yönetir.', 403);
    $tk = s('tk', 16); $uid = (int)i('uid');
    $r = h_one('SELECT * FROM c_joinreq WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $tk, $uid]) ?? fail('İstek bulunamadı.', 404);
    h_q('DELETE FROM c_joinreq WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $tk, $uid]);
    if (s('op', 10) === 'approve') {
        c_add_members((int)$c['id'], [['tk' => $tk, 'uid' => $uid, 'name' => $r['name'], 'unit' => $r['unit_name']]]);
        c_system((int)$c['id'], $me, $me['name'] . ' katılma isteğini onayladı: ' . $r['name']);
    }
    out();
}

function c_joinreqs(array $c): array
{
    return array_map(fn($r) => ['tk' => $r['tkey'], 'uid' => (int)$r['user_id'], 'name' => $r['name'], 'unit' => $r['tkey'] === c_tk() ? '' : $r['unit_name'], 'at' => $r['at']],
        h_all('SELECT * FROM c_joinreq WHERE chat_id = ? ORDER BY at', [(int)$c['id']]));
}

/** Diğer birimlerde "bulunabilir" olan kişiler (gizlilik: kendileri açtıysa) */
function c_findable_people(array $me): array
{
    $o = [];
    $hidByMe = [];
    foreach (h_all('SELECT btkey, buid FROM c_blocks WHERE tkey = ? AND user_id = ?', [c_tk(), (int)$me['id']]) as $b) $hidByMe[$b['btkey'] . ':' . $b['buid']] = 1;
    foreach (h_all('SELECT p.* FROM c_prefs p WHERE p.findable = 1 AND p.tkey <> ? AND NOT EXISTS (SELECT 1 FROM c_blocks b WHERE b.tkey = p.tkey AND b.user_id = p.user_id AND b.btkey = ? AND b.buid = ?)', [c_tk(), c_tk(), (int)$me['id']]) as $p) {
        $t = nm_tenant_by_key((string)$p['tkey']);
        if (!$t || (int)$t['hospital_id'] !== (int)nm_tenant()['hospital_id'] || nm_tenant_frozen($t) || isset($hidByMe[$p['tkey'] . ':' . $p['user_id']])) continue;
        $o[$p['tkey'] . ':' . $p['user_id']] = ['tk' => $p['tkey'], 'uid' => (int)$p['user_id'], 'name' => $p['name'], 'unit' => $p['unit_name']];
    }
    return $o;
}

return [
    'chat.prefs.get' => 'a_chat_prefs_get',
    'chat.prefs.save' => 'a_chat_prefs_save',
    'chat.block' => 'a_chat_block',
    'chat.profile' => 'a_chat_profile',
    'chat.state' => 'a_chat_state',
    'chat.edit' => 'a_chat_edit',
    'chat.hide' => 'a_chat_hide',
    'chat.star' => 'a_chat_star',
    'chat.starred' => 'a_chat_starred',
    'chat.search' => 'a_chat_search',
    'chat.media' => 'a_chat_media',
    'chat.typing' => 'a_chat_typing',
    'chat.photo' => 'a_chat_photo',
    'chat.joinreq' => 'a_chat_joinreq',
];
