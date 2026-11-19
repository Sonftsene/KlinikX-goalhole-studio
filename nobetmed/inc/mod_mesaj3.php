<?php
/**
 * Mesajlaşma 4.8 — WhatsApp düzeyi eksikler: konum ve kişi paylaşımı, tek seferlik görüntüleme, serbest emoji tepkisi,
 * grup yöneticisinin üyeyi engellemesi (gruptan çıkar + tekrar katılamaz) ve yazmasını kısıtlaması (birim grubunda da),
 * birebir sesli/görüntülü arama (WebRTC; sinyalleşme hastane veritabanı üzerinden, zil telefon bildirimiyle).
 */
declare(strict_types=1);

/** Tek bir emoji (ya da birleşik emoji) mi: harf/rakam/boşluk/işaretleme içermez, kısa */
function c_is_emoji(string $e): bool
{
    if ($e === '' || strlen($e) > 32 || mb_strlen($e) > 10) return false;
    if (preg_match('/[\p{L}\p{N}\s<>&"\'`\\\\\/=;:(){}\[\]]/u', $e)) return false;
    foreach (mb_str_split($e) as $ch) if (mb_ord($ch) >= 0x2190) return true;
    return false;
}

/* ---------------- Engel ve kısıtlama ---------------- */

function c_banned(int $chat, string $tk, int $uid): bool
{
    return (bool)h_val("SELECT 1 FROM c_bans WHERE chat_id = ? AND tkey = ? AND user_id = ? AND kind = 'ban'", [$chat, $tk, $uid]);
}
function c_restricted(int $chat, string $tk, int $uid): bool
{
    return (bool)h_val("SELECT 1 FROM c_bans WHERE chat_id = ? AND tkey = ? AND user_id = ? AND kind = 'mute'", [$chat, $tk, $uid]);
}
function c_bans_out(int $chat): array
{
    return array_map(fn($b) => ['tk' => $b['tkey'], 'uid' => (int)$b['user_id'], 'name' => $b['name'], 'kind' => $b['kind'], 'by' => $b['by_name'], 'at' => $b['at']],
        h_all('SELECT * FROM c_bans WHERE chat_id = ? ORDER BY kind, name', [$chat]));
}
/** Yazma kısıtlaması koy/kaldır, engeli kaldır (grup yöneticisi; birim grubunda birim yöneticisi) */
function c_member_mod(array $c, array $me, bool $adm, string $op): void
{
    if (!$adm) fail('Bunu yalnız grup yöneticisi yapabilir.', 403);
    $tk = s('tk', 16); $uid = (int)i('uid');
    if ($tk === c_tk() && $uid === (int)$me['id']) fail('Kendinize uygulayamazsınız.');
    if ($op === 'unban') {
        $b = h_one("SELECT * FROM c_bans WHERE chat_id = ? AND tkey = ? AND user_id = ? AND kind = 'ban'", [$c['id'], $tk, $uid]) ?? fail('Engel bulunamadı.', 404);
        h_q("DELETE FROM c_bans WHERE chat_id = ? AND tkey = ? AND user_id = ? AND kind = 'ban'", [$c['id'], $tk, $uid]);
        c_system((int)$c['id'], $me, $me['name'] . ' engeli kaldırdı: ' . $b['name']);
        return;
    }
    if ($c['kind'] === 'unit') {
        if ($tk !== c_tk()) fail('Kişi bulunamadı.', 404);
        $t = one("SELECT id, name, role FROM users WHERE id = ? AND status = 'active'", [$uid]) ?? fail('Kişi bulunamadı.', 404);
        $name = (string)$t['name'];
        if ($t['role'] === 'admin') fail('Yöneticinin yazması kısıtlanamaz.');
    } else {
        $t = h_one('SELECT * FROM c_members WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$c['id'], $tk, $uid]) ?? fail('Üye bulunamadı.', 404);
        $name = (string)$t['name'];
        if ($t['role'] === 'admin') fail('Grup yöneticisinin yazması kısıtlanamaz; önce yöneticilikten alın.');
    }
    if ($op === 'restrict') {
        h_q('INSERT OR REPLACE INTO c_bans (chat_id, tkey, user_id, kind, name, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?)', [$c['id'], $tk, $uid, 'mute', $name, $me['name'], now()]);
        c_system((int)$c['id'], $me, $me['name'] . ', ' . $name . ' için yazmayı kısıtladı');
    } else {
        h_q("DELETE FROM c_bans WHERE chat_id = ? AND tkey = ? AND user_id = ? AND kind = 'mute'", [$c['id'], $tk, $uid]);
        c_system((int)$c['id'], $me, $me['name'] . ', ' . $name . ' için yazma kısıtlamasını kaldırdı');
    }
}

/* ---------------- Mesaj ek bilgileri ---------------- */

function c_msg_meta_out(array $o, array $r, array $meta): array
{
    if (!empty($meta['once'])) {
        $o['once'] = true;
        $meId = (int)(current_user()['id'] ?? 0);
        if ($o['mine']) {
            $o['opened'] = (int)h_val('SELECT COUNT(*) FROM c_once WHERE msg_id = ?', [(int)$r['id']]);
            unset($o['file']);
        } else {
            $v = h_val('SELECT at FROM c_once WHERE msg_id = ? AND tkey = ? AND user_id = ?', [(int)$r['id'], c_tk(), $meId]);
            if ($v && (string)$v < date('Y-m-d H:i:s', time() - 600)) { $o['opened'] = 1; unset($o['file']); }
            elseif ($v) $o['opening'] = true;
        }
    }
    if ($r['kind'] === 'location' && isset($meta['loc'])) $o['loc'] = $meta['loc'];
    if ($r['kind'] === 'contact' && isset($meta['contact'])) $o['contact'] = $meta['contact'];
    if ($r['kind'] === 'call' && isset($meta['call'])) $o['call'] = $meta['call'];
    return $o;
}

/** Konum ya da kişi kartı paylaş */
function a_chat_share(): void
{
    $me = c_need();
    [$c, , $adm] = c_access($me, (int)i('id'));
    if ((int)$c['only_admins'] === 1 && !$adm) fail('Bu grupta yalnız yöneticiler mesaj gönderebilir.', 403);
    c_send_guard($c, $me);
    if (c_restricted((int)$c['id'], c_tk(), (int)$me['id'])) fail('Grup yöneticisi bu grupta yazmanızı kısıtladı.', 403);
    global $IN;
    $type = s('type', 10);
    if ($type === 'location') {
        $lat = (float)($IN['lat'] ?? 999); $lng = (float)($IN['lng'] ?? 999);
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) fail('Konum alınamadı.');
        $label = s('label', 120);
        if (c_has_tckn($label)) fail('Açıklamada T.C. kimlik numarası olamaz.', 422);
        $meta = ['loc' => ['lat' => round($lat, 6), 'lng' => round($lng, 6), 'acc' => max(0, min(100000, (int)($IN['acc'] ?? 0)))]];
        $mid = c_insert_msg($c, $me, $label, 'location', null, null, $meta);
    } elseif ($type === 'contact') {
        $name = s('name', 80);
        $phone = preg_replace('/[^0-9+ ]/', '', s('phone', 30));
        if ($name === '' || ($phone === '' && !i('ref_uid'))) fail('Kişi bilgisi eksik.');
        $ct = ['name' => $name, 'phone' => trim((string)$phone), 'title' => s('title', 80)];
        // Portaldaki bir kişi ise mesaj gönderilebilsin diye kimliği (yalnız aynı birim ya da ortak grup)
        if (($ruid = (int)i('ref_uid')) > 0 && c_valid_people($me, [['tk' => s('ref_tk', 16), 'uid' => $ruid]])) { $ct['tk'] = s('ref_tk', 16); $ct['uid'] = $ruid; }
        $mid = c_insert_msg($c, $me, $name, 'contact', null, null, ['contact' => $ct]);
    } else fail('Geçersiz paylaşım.');
    c_notify_local(h_one('SELECT * FROM c_chats WHERE id = ?', [(int)$c['id']]), $me);
    out(['msg' => c_msgs_out([h_one('SELECT * FROM c_msgs WHERE id = ?', [$mid])])[0]]);
}

/** Paylaşılabilecek kişiler: birim + hastane telefon rehberi */
function a_chat_contacts(): void
{
    $me = c_need();
    $o = [];
    foreach (all("SELECT id, name, phone, ui_prefs FROM users WHERE status = 'active' ORDER BY name") as $u) $o[] = ['name' => $u['name'], 'phone' => contact_vis($u, $me)['phone'] ? (string)($u['phone'] ?? '') : '', 'title' => '', 'tk' => c_tk(), 'uid' => (int)$u['id']];
    try { foreach (all('SELECT name, number, category FROM phonebook ORDER BY name LIMIT 400') as $p) $o[] = ['name' => $p['name'], 'phone' => $p['number'], 'title' => (string)$p['category']]; } catch (Throwable $e) { /* rehber yok */ }
    try { foreach (h_all('SELECT name, number, category FROM h_phonebook ORDER BY name LIMIT 400') as $p) $o[] = ['name' => $p['name'], 'phone' => $p['number'], 'title' => (string)$p['category']]; } catch (Throwable $e) { /* */ }
    out(['items' => $o]);
}

/* ---------------- Sesli / görüntülü arama ---------------- */

function c_calls_on(): bool { return setting('calls_on', '1') === '1'; }

/** ICE sunucuları: herkese açık STUN + (varsa) yöneticinin tanımladığı TURN */
function c_ice(): array
{
    $s = [['urls' => ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']]];
    $u = trim(setting('turn_url', ''));
    if ($u !== '') $s[] = ['urls' => array_values(array_filter(array_map('trim', explode(',', $u)))), 'username' => setting('turn_user', ''), 'credential' => setting('turn_pass', '')];
    return $s;
}

function c_call_get(array $me, int $id): array
{
    $k = h_one('SELECT * FROM c_calls WHERE id = ?', [$id]) ?? fail('Arama bulunamadı.', 404);
    $side = $k['a_tk'] === c_tk() && (int)$k['a_uid'] === (int)$me['id'] ? 'a' : ($k['b_tk'] === c_tk() && (int)$k['b_uid'] === (int)$me['id'] ? 'b' : null);
    if (!$side) fail('Bu aramaya erişiminiz yok.', 403);
    return [c_call_expire($k), $side];
}

/** Çalan arama 50 sn'de cevapsız; süren aramada taraflardan biri 45 sn ses vermezse bağlantı koptu */
function c_call_expire(array $k): array
{
    $old = date('Y-m-d H:i:s', time() - 45);
    if ($k['state'] === 'ring' && (string)$k['created_at'] < date('Y-m-d H:i:s', time() - 50)) c_call_finish($k, 'missed');
    elseif ($k['state'] === 'active' && ((string)($k['hb_a'] ?? '') < $old || (string)($k['hb_b'] ?? '') < $old)) c_call_finish($k, 'lost');
    else return $k;
    return h_one('SELECT * FROM c_calls WHERE id = ?', [(int)$k['id']]);
}

function c_call_out(array $k, string $side): array
{
    return ['id' => (int)$k['id'], 'chat' => (int)$k['chat_id'], 'video' => (int)$k['video'] === 1, 'state' => $k['state'], 'side' => $side,
        'peer' => $side === 'a' ? $k['b_name'] : $k['a_name'], 'peer_tk' => $side === 'a' ? $k['b_tk'] : $k['a_tk'], 'peer_uid' => (int)($side === 'a' ? $k['b_uid'] : $k['a_uid']),
        'ice' => json_decode((string)$k['ice'], true) ?: [], 'reason' => $k['reason'], 'answered_at' => $k['answered_at']];
}

/** Aramayı bitir: sohbete arama kaydı (arayan adına), cevapsızsa aranana bildirim */
function c_call_finish(array $k, string $reason): void
{
    $n = h_q("UPDATE c_calls SET state = 'end', ended_at = ?, reason = ? WHERE id = ? AND state <> 'end'", [now(), $reason, (int)$k['id']])->rowCount();
    if (!$n) return;
    h_q('DELETE FROM c_sig WHERE call_id = ?', [(int)$k['id']]);
    $done = $k['answered_at'] !== null && $k['answered_at'] !== '';
    $dur = $done ? max(0, time() - (int)strtotime((string)$k['answered_at'])) : 0;
    $status = $done ? 'done' : ($reason === 'declined' ? 'declined' : 'missed');
    $meta = ['call' => ['video' => (int)$k['video'] === 1 ? 1 : 0, 'dur' => $dur, 'status' => $status]];
    h_q('INSERT INTO c_msgs (chat_id, tkey, user_id, name, body, kind, file_id, reply_to, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)',
        [(int)$k['chat_id'], $k['a_tk'], (int)$k['a_uid'], $k['a_name'], '', 'call', json_encode($meta), now()]);
    $mid = (int)cdb()->lastInsertId();
    h_q('UPDATE c_chats SET last_id = ?, last_at = ? WHERE id = ?', [$mid, now(), (int)$k['chat_id']]);
    h_q('UPDATE c_members SET last_read = ?, notified = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$mid, $mid, (int)$k['chat_id'], $k['a_tk'], (int)$k['a_uid']]);
    // Gelen arama bildirimi kalkar; cevapsızsa yerine "Cevapsız arama"
    if ($k['b_tk'] === c_tk()) {
        q("DELETE FROM notifications WHERE user_id = ? AND kind = 'call' AND url = ?", [(int)$k['b_uid'], '#/mesaj/' . (int)$k['chat_id']]);
        if (!$done && $reason !== 'declined') {
            c_push([(int)$k['b_uid']], (int)$k['chat_id'], 'Cevapsız ' . ((int)$k['video'] === 1 ? 'görüntülü' : 'sesli') . ' arama', $k['a_name']);
            h_q('UPDATE c_members SET notified = ? WHERE chat_id = ? AND tkey = ? AND user_id = ?', [$mid, (int)$k['chat_id'], $k['b_tk'], (int)$k['b_uid']]);
        }
    } elseif (function_exists('nb_kick')) nb_kick([$k['b_tk']], 'chat_notify');
}

/** Gelen arama bildirimi (aranan bu birimdeyse) */
function c_call_ring(array $k): void
{
    $title = '📞 Gelen ' . ((int)$k['video'] === 1 ? 'görüntülü' : 'sesli') . ' arama';
    q('INSERT INTO notifications (user_id, title, body, url, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)', [(int)$k['b_uid'], $title, $k['a_name'], '#/mesaj/' . (int)$k['chat_id'], 'call', now()]);
    h_q('UPDATE c_calls SET notified = 1 WHERE id = ?', [(int)$k['id']]);
    $ids = function_exists('nb_push_filter') ? nb_push_filter([(int)$k['b_uid']], 'call') : [(int)$k['b_uid']];
    if ($ids) push_after_response($ids);
}

$GLOBALS['NM_JOBS']['call_notify'] = function (bool $force) {
    if (!cdb()) return null;
    $rows = h_all("SELECT * FROM c_calls WHERE state = 'ring' AND b_tk = ? AND notified = 0 AND created_at > ?", [c_tk(), date('Y-m-d H:i:s', time() - 50)]);
    foreach ($rows as $k) c_call_ring($k);
    return $rows ? count($rows) : null;
};
$GLOBALS['NM_JOB_MODULE']['call_notify'] = 'mesaj';

function c_call_busy(string $tk, int $uid): bool
{
    foreach (h_all("SELECT * FROM c_calls WHERE state IN ('ring', 'active') AND ((a_tk = ? AND a_uid = ?) OR (b_tk = ? AND b_uid = ?))", [$tk, $uid, $tk, $uid]) as $k) {
        if (c_call_expire($k)['state'] !== 'end') return true;
    }
    return false;
}

function a_call_start(): void
{
    $me = c_need();
    if (!c_calls_on()) fail('Sesli/görüntülü arama biriminizde kapalı.', 403);
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisi arama yapamaz.', 403);
    [$c] = c_access($me, (int)i('id'));
    if ($c['kind'] !== 'direct') fail('Arama yalnız birebir sohbetlerde yapılabilir.');
    c_send_guard($c, $me);
    $o = c_other($c, $me) ?? fail('Kişi bulunamadı.', 404);
    if (c_call_busy(c_tk(), (int)$me['id'])) fail('Zaten bir görüşmedesiniz.', 409);
    if (c_call_busy((string)$o['tkey'], (int)$o['user_id'])) fail($o['name'] . ' şu an başka bir görüşmede.', 409);
    h_q('INSERT INTO c_calls (chat_id, a_tk, a_uid, a_name, b_tk, b_uid, b_name, video, state, ice, created_at, hb_a) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [(int)$c['id'], c_tk(), (int)$me['id'], $me['name'], $o['tkey'], (int)$o['user_id'], $o['name'], b('video') ? 1 : 0, 'ring', json_encode(c_ice()), now(), now()]);
    $k = h_one('SELECT * FROM c_calls WHERE id = ?', [(int)cdb()->lastInsertId()]);
    if ($k['b_tk'] === c_tk()) c_call_ring($k);
    elseif (function_exists('nb_kick')) nb_kick([$k['b_tk']], 'call_notify');
    out(['call' => c_call_out($k, 'a')]);
}

function a_call_poll(): void
{
    $me = c_need();
    [$k, $side] = c_call_get($me, (int)i('call'));
    if ($k['state'] !== 'end') h_q('UPDATE c_calls SET hb_' . $side . ' = ? WHERE id = ?', [now(), (int)$k['id']]);
    $sig = $k['state'] === 'end' ? [] : h_all('SELECT id, type, data FROM c_sig WHERE call_id = ? AND side <> ? AND id > ? ORDER BY id LIMIT 200', [(int)$k['id'], $side, (int)i('after')]);
    out(['call' => c_call_out($k, $side), 'sig' => array_map(fn($x) => ['id' => (int)$x['id'], 'type' => $x['type'], 'data' => $x['data']], $sig)]);
}

function a_call_signal(): void
{
    $me = c_need();
    [$k, $side] = c_call_get($me, (int)i('call'));
    if ($k['state'] === 'end') fail('Görüşme sona erdi.', 410);
    $type = s('type', 10);
    if (!in_array($type, ['offer', 'answer', 'ice'], true)) fail('Geçersiz sinyal.');
    $data = (string)($GLOBALS['IN']['data'] ?? '');
    if ($data === '' || strlen($data) > 16000) fail('Geçersiz sinyal.');
    if ((int)h_val('SELECT COUNT(*) FROM c_sig WHERE call_id = ?', [(int)$k['id']]) > 400) fail('Çok fazla sinyal.', 429);
    h_q('INSERT INTO c_sig (call_id, side, type, data, at) VALUES (?, ?, ?, ?, ?)', [(int)$k['id'], $side, $type, $data, now()]);
    out();
}

function a_call_answer(): void
{
    $me = c_need();
    [$k, $side] = c_call_get($me, (int)i('call'));
    if ($side !== 'b' || $k['state'] !== 'ring') fail('Arama artık çalmıyor.', 410);
    h_q("UPDATE c_calls SET state = 'active', answered_at = ?, hb_a = ?, hb_b = ? WHERE id = ? AND state = 'ring'", [now(), now(), now(), (int)$k['id']]);
    q("DELETE FROM notifications WHERE user_id = ? AND kind = 'call' AND url = ?", [(int)$me['id'], '#/mesaj/' . (int)$k['chat_id']]);
    out(['call' => c_call_out(h_one('SELECT * FROM c_calls WHERE id = ?', [(int)$k['id']]), $side)]);
}

function a_call_end(): void
{
    $me = c_need();
    [$k, $side] = c_call_get($me, (int)i('call'));
    if ($k['state'] !== 'end') {
        $r = s('reason', 10);
        $reason = $k['state'] === 'ring' ? ($side === 'b' ? 'declined' : ($r === 'fail' ? 'fail' : 'cancel')) : ($r === 'fail' ? 'fail' : 'hangup');
        c_call_finish($k, $reason);
    }
    out();
}

/** Gelen (çalan) arama — canlı bildirim döngüsü sorar */
function c_incoming_call(array $me): ?array
{
    $k = h_one("SELECT * FROM c_calls WHERE b_tk = ? AND b_uid = ? AND state = 'ring' ORDER BY id DESC LIMIT 1", [c_tk(), (int)$me['id']]);
    if (!$k) return null;
    $k = c_call_expire($k);
    return $k['state'] === 'ring' ? c_call_out($k, 'b') : null;
}

/** Arama geçmişi */
function a_call_log(): void
{
    $me = c_need();
    $rows = h_all('SELECT * FROM c_calls WHERE (a_tk = ? AND a_uid = ?) OR (b_tk = ? AND b_uid = ?) ORDER BY id DESC LIMIT 60', [c_tk(), (int)$me['id'], c_tk(), (int)$me['id']]);
    out(['items' => array_map(function ($k) use ($me) {
        $out = $k['a_tk'] === c_tk() && (int)$k['a_uid'] === (int)$me['id'];
        $done = !empty($k['answered_at']);
        return ['id' => (int)$k['id'], 'chat' => (int)$k['chat_id'], 'dir' => $out ? 'out' : 'in', 'peer' => $out ? $k['b_name'] : $k['a_name'], 'video' => (int)$k['video'] === 1,
            'status' => $done ? 'done' : ($k['state'] === 'end' ? ($k['reason'] === 'declined' ? 'declined' : 'missed') : $k['state']), 'at' => $k['created_at'],
            'dur' => $done && $k['ended_at'] ? max(0, (int)strtotime((string)$k['ended_at']) - (int)strtotime((string)$k['answered_at'])) : 0];
    }, $rows)]);
}

/** Yönetici: arama ayarları (aç/kapat, isteğe bağlı TURN sunucusu) */
function a_call_cfg(): void
{
    need_admin();
    global $IN;
    if (array_key_exists('calls_on', $IN)) set_setting('calls_on', b('calls_on') ? '1' : '0');
    if (array_key_exists('turn_url', $IN)) {
        $u = s('turn_url', 300);
        foreach (array_filter(array_map('trim', explode(',', $u))) as $x) if (!preg_match('~^turns?:[A-Za-z0-9.\-]+(:\d+)?(\?transport=(udp|tcp))?$~', $x)) fail('TURN adresi “turn:sunucu:3478” biçiminde olmalı.');
        set_setting('turn_url', $u);
        set_setting('turn_user', s('turn_user', 120));
        if (($p = (string)($IN['turn_pass'] ?? '')) !== '') set_setting('turn_pass', mb_substr($p, 0, 200));
    }
    out(['calls_on' => c_calls_on(), 'turn_url' => setting('turn_url', ''), 'turn_user' => setting('turn_user', ''), 'turn_pass_set' => setting('turn_pass', '') !== '']);
}

return [
    'chat.share' => 'a_chat_share',
    'chat.contacts' => 'a_chat_contacts',
    'call.start' => 'a_call_start',
    'call.poll' => 'a_call_poll',
    'call.signal' => 'a_call_signal',
    'call.answer' => 'a_call_answer',
    'call.end' => 'a_call_end',
    'call.log' => 'a_call_log',
    'call.cfg' => 'a_call_cfg',
];
