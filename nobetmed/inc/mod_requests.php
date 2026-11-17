<?php
/**
 * dupcii — nöbet istekleri (yalnız "Boşluk" ve "Yıllık izin").
 *
 *  Dönem: yayıncı ayı isteğe açar (ay, liste, son gün, not). Açılınca herkese bildirim; son günden 2 gün önce
 *  isteği olmayanlara bir kez hatırlatma; son gün geçince dönem kapanır (üyeler değiştiremez, yayıncılar düzeltebilir).
 *  Üye: kendi isteklerini takvimden ya da yazarak girer; durumu ve (yalnız kendisine) ret gerekçesini görür.
 *  Pano: herkes kim hangi günü istedi görür (gerekçe ve not yok).
 *  Panel (yayıncı): taraf başına gün gün istek / müsait / gereken (ısı haritası), yığılma, kişi tablosu,
 *  onay/ret (tekli/toplu), taşan günlerde adalet sırasına göre ret önerisi ve eşitlikte kayıtlı kura.
 *  Uyum: ayın listesi gelince onaylı isteğe rağmen nöbet yazılmışsa kişiye ve yayıncılara bir kez bildirilir.
 *
 *  Kayıtlar: req_periods (meta: reminded, closed_note, draws), shift_requests (user_id = 0: hesabı olmayan kişi;
 *  meta: conflict_notified).
 */
declare(strict_types=1);

const RQ_KINDS = ['bosluk' => 'Boşluk', 'izin' => 'Yıllık izin'];
const RQ_SHORT = ['bosluk' => 'B', 'izin' => 'Yİ'];
const RQ_STATUS = ['pending', 'approved', 'rejected'];
const RQ_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/* ------------------------------------------------------------------ */
/* Küçük yardımcılar                                                    */
/* ------------------------------------------------------------------ */

function rq_meta($j): array
{
    $m = json_decode((string)$j, true);
    return is_array($m) ? $m : [];
}

function rq_month_name(string $ym): string
{
    return RQ_MONTHS[max(0, min(11, (int)substr($ym, 5, 2) - 1))];
}

function rq_month_label(string $ym): string
{
    return rq_month_name($ym) . ' ' . substr($ym, 0, 4);
}

/** '2026-11-20' -> '20 Kasım' */
function rq_day_long(string $d): string
{
    return (int)substr($d, 8, 2) . ' ' . RQ_MONTHS[(int)substr($d, 5, 2) - 1];
}

function rq_month_end(string $ym): string
{
    return date('Y-m-t', strtotime($ym . '-01'));
}

function rq_valid_ym(string $ym): bool
{
    return (bool)preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym);
}

/** Üyeler bu dönemde ekleyip değiştirebilir mi (yayıncılar her zaman) */
function rq_member_open(array $p): bool
{
    return $p['status'] === 'open' && (!$p['deadline'] || date('Y-m-d') <= $p['deadline']);
}

/** Gün listelerini kısaltır: [2,3,4,6] -> "2-4, 6" */
function rq_ranges(array $days): string
{
    sort($days);
    $out = [];
    $start = $prev = null;
    foreach ($days as $d) {
        if ($start === null) { $start = $prev = $d; continue; }
        if ($d === $prev + 1) { $prev = $d; continue; }
        $out[] = $start === $prev ? (string)$start : $start . '-' . $prev;
        $start = $prev = $d;
    }
    if ($start !== null) $out[] = $start === $prev ? (string)$start : $start . '-' . $prev;
    return implode(', ', $out);
}

/** Nöbet listeleri (görüntüleme tabloları hariç) */
function rq_nobet_rosters(): array
{
    static $c = null;
    if ($c === null) {
        $c = [];
        foreach (all("SELECT id, name FROM rosters WHERE kind <> 'tablo' ORDER BY sort, id") as $r) $c[(int)$r['id']] = (string)$r['name'];
    }
    return $c;
}

/** Dönemin kapsadığı liste kimlikleri */
function rq_scope_rosters(array $p): array
{
    $all = rq_nobet_rosters();
    if ($p['roster_id'] !== null && $p['roster_id'] !== '') return isset($all[(int)$p['roster_id']]) ? [(int)$p['roster_id']] : [];
    return array_keys($all);
}

function rq_period(?int $id): array
{
    $p = $id ? one('SELECT * FROM req_periods WHERE id = ?', [$id]) : null;
    if (!$p) fail('İstek dönemi bulunamadı.', 404);
    return $p;
}

function rq_set_period_meta(int $id, array $meta): void
{
    q('UPDATE req_periods SET meta = ? WHERE id = ?', [json_encode($meta, JSON_UNESCAPED_UNICODE), $id]);
}

/**
 * Listelerdeki kişiler: [roster_id => [adAnahtarı => ad]]. Önce dönemin ayı; o ay için kayıt yoksa önceki iki ay.
 */
function rq_roster_people(array $rids, string $ym): array
{
    $rids = array_values(array_filter(array_map('intval', $rids)));
    if (!$rids) return [];
    $in = implode(',', $rids);
    $sql = "SELECT DISTINCT s.roster_id, s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id
        WHERE s.roster_id IN (%s) AND s.date >= ? AND s.date <= ?";
    $out = [];
    foreach (all(sprintf($sql, $in), [$ym . '-01', rq_month_end($ym)]) as $r) $out[(int)$r['roster_id']][swap_key((string)$r['name'])] = (string)$r['name'];
    $missing = array_values(array_diff($rids, array_keys($out)));
    if ($missing) {
        $from = date('Y-m-01', strtotime($ym . '-01 -2 months'));
        $to = date('Y-m-d', strtotime($ym . '-01 -1 day'));
        foreach (all(sprintf($sql, implode(',', $missing)), [$from, $to]) as $r) $out[(int)$r['roster_id']][swap_key((string)$r['name'])] = (string)$r['name'];
    }
    return $out;
}

/** Ay için listede kayıt var mı (uyum kontrolü ve "liste geldi" bilgisi) */
function rq_month_has_roster(array $rids, string $ym): bool
{
    $rids = array_values(array_filter(array_map('intval', $rids)));
    if (!$rids) return false;
    return (bool)val('SELECT COUNT(*) FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id IN (' . implode(',', $rids) . ') AND s.date >= ? AND s.date <= ?',
        [$ym . '-01', rq_month_end($ym)]);
}

/** Ayın nöbetleri: [adAnahtarı => [tarih => kod]] (yalnız 'shift') */
function rq_month_shifts(array $rids, string $ym): array
{
    $rids = array_values(array_filter(array_map('intval', $rids)));
    if (!$rids) return [];
    $out = [];
    foreach (all("SELECT s.name, s.date, s.code FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id
        WHERE s.roster_id IN (" . implode(',', $rids) . ") AND s.kind = 'shift' AND s.date >= ? AND s.date <= ?", [$ym . '-01', rq_month_end($ym)]) as $r) {
        $out[swap_key((string)$r['name'])][$r['date']] = (string)$r['code'];
    }
    return $out;
}

/** Bir adın nöbet tablosundaki karşılığı (anahtar) */
function rq_find_key(string $name, array $keyToName): ?string
{
    $k = swap_key($name);
    if (isset($keyToName[$k])) return $k;
    foreach ($keyToName as $kk => $n) if (names_match((string)$n, $name)) return (string)$kk;
    return null;
}

/** Kişinin listesi: rosters içinde adı geçenler (taraf listeleri ve çok kaydı olan önce) */
function rq_detect_roster(string $name, array $people): array
{
    $sideR = function_exists('sides_cfg') ? array_column(sides_cfg(), 'roster_id') : [];
    $c = [];
    foreach ($people as $rid => $map) {
        foreach ($map as $n) if (names_match((string)$n, $name)) { $c[] = (int)$rid; break; }
    }
    usort($c, fn($a, $b) => [in_array($b, $sideR, true), $a] <=> [in_array($a, $sideR, true), $b]);
    return $c;
}

function rq_users(): array
{
    static $u = null;
    if ($u === null) $u = all("SELECT id, name, email, email_notify, notify_mode, push_on, role, unit_id FROM users WHERE status = 'active'");
    return $u;
}

/* ------------------------------------------------------------------ */
/* Dönemler                                                            */
/* ------------------------------------------------------------------ */

function rq_period_out(array $p, array $me, array $stats = []): array
{
    $rosters = rq_nobet_rosters();
    $rid = $p['roster_id'] !== null && $p['roster_id'] !== '' ? (int)$p['roster_id'] : null;
    $open = rq_member_open($p);
    $id = (int)$p['id'];
    return [
        'id' => $id, 'ym' => $p['ym'], 'label' => rq_month_label($p['ym']), 'month' => rq_month_name($p['ym']),
        'roster_id' => $rid, 'roster' => $rid ? ($rosters[$rid] ?? 'Silinmiş liste') : null,
        'deadline' => $p['deadline'], 'status' => $p['status'], 'open' => $open, 'note' => $p['note'],
        'days' => (int)date('t', strtotime($p['ym'] . '-01')), 'created_at' => $p['created_at'],
        'can_edit' => $open || is_publisher($me),
        'total' => (int)($stats[$id]['total'] ?? 0), 'people' => (int)($stats[$id]['people'] ?? 0), 'mine' => (int)($stats[$id]['mine'] ?? 0),
        'pending' => (int)($stats[$id]['pending'] ?? 0),
    ];
}

function rq_periods_list(array $me): array
{
    // Son 18 dönem + hâlâ açık olanlar
    $rows = all("SELECT * FROM req_periods ORDER BY ym DESC, id DESC");
    $rows = array_values(array_filter($rows, fn($p, $i) => $i < 18 || $p['status'] === 'open', ARRAY_FILTER_USE_BOTH));
    $stats = [];
    if ($rows) {
        $in = implode(',', array_map(fn($p) => (int)$p['id'], $rows));
        $people = [];
        foreach (all("SELECT period_id, user_id, name, status, COUNT(*) c FROM shift_requests WHERE period_id IN ($in) GROUP BY period_id, user_id, name, status") as $r) {
            $pid = (int)$r['period_id'];
            $c = (int)$r['c'];
            $stats[$pid]['total'] = ($stats[$pid]['total'] ?? 0) + $c;
            if ($r['status'] === 'pending') $stats[$pid]['pending'] = ($stats[$pid]['pending'] ?? 0) + $c;
            $people[$pid][(int)$r['user_id'] > 0 ? 'u' . $r['user_id'] : 'n' . swap_key((string)$r['name'])] = true;
            if ((int)$r['user_id'] === (int)$me['id']) $stats[$pid]['mine'] = ($stats[$pid]['mine'] ?? 0) + $c;
        }
        foreach ($people as $pid => $set) $stats[$pid]['people'] = count($set);
    }
    return array_map(fn($p) => rq_period_out($p, $me, $stats), $rows);
}

function a_req_periods(): void
{
    $me = need_user();
    $sides = function_exists('sides_cfg') ? sides_cfg() : [];
    out([
        'periods' => rq_periods_list($me),
        'can_manage' => is_publisher($me),
        'rosters' => array_map(fn($id, $n) => ['id' => $id, 'name' => $n], array_keys(rq_nobet_rosters()), rq_nobet_rosters()),
        'sides' => array_map(fn($s) => ['key' => $s['key'], 'name' => $s['name'], 'roster_id' => $s['roster_id']], $sides),
        'today' => date('Y-m-d'),
    ]);
}

/** Dönem aç / düzenle / kapat / yeniden aç */
function a_req_period_save(): void
{
    $me = need_publisher();
    $id = (int)(i('id') ?? 0);
    $old = $id ? rq_period($id) : null;
    $ym = s('ym', 7) ?: ($old['ym'] ?? '');
    if (!rq_valid_ym($ym)) fail('Ayı seçin.');
    $rid = i('roster_id');
    $rid = $rid ? (int)$rid : null;
    if ($rid !== null && !isset(rq_nobet_rosters()[$rid])) fail('Liste bulunamadı.');
    $deadline = s('deadline', 10);
    if (!valid_ymd($deadline)) fail('Son günü seçin.');
    if ($deadline > rq_month_end($ym)) fail('Son gün, istenen ayın sonundan sonra olamaz.');
    $note = s('note', 300);
    $status = in_array(s('status', 10), ['open', 'closed'], true) ? s('status', 10) : ($old['status'] ?? 'open');
    if ($ym < date('Y-m', strtotime('-1 month'))) fail('Geçmiş aylar için dönem açılamaz.');

    if ($old && ($old['ym'] !== $ym || (string)$old['roster_id'] !== (string)$rid)
        && (int)val('SELECT COUNT(*) FROM shift_requests WHERE period_id = ?', [$id]) > 0) {
        fail('İstek girilmiş bir dönemin ayı veya listesi değiştirilemez.');
    }
    // Aynı ay için çakışan dönem olmasın
    foreach (all('SELECT id, roster_id FROM req_periods WHERE ym = ?', [$ym]) as $x) {
        if ((int)$x['id'] === $id) continue;
        $xr = $x['roster_id'] !== null && $x['roster_id'] !== '' ? (int)$x['roster_id'] : null;
        if ($xr === null || $rid === null || $xr === $rid) fail(rq_month_label($ym) . ' için bu listeyi kapsayan bir istek dönemi zaten var.');
    }

    $label = rq_month_name($ym);
    $dl = rq_day_long($deadline);
    $scope = $rid ? rq_nobet_rosters()[$rid] : 'Tüm listeler';
    if (!$old) {
        q('INSERT INTO req_periods (ym, roster_id, deadline, status, note, created_by, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$ym, $rid, $deadline, 'open', $note ?: null, $me['id'], now(), '{}']);
        $id = insert_id();
        audit($me, 'req.period', rq_month_label($ym) . ' istekleri açıldı', $scope . ' · son gün ' . $dl);
        if (!b('silent')) {
            $title = "$label nöbet istekleri açıldı · son gün $dl";
            $body = "Boşluk ve yıllık izin isteklerini $dl akşamına kadar yazabilirsin." . ($rid ? " ($scope)" : '') . ($note ? ' ' . $note : '');
            notify_users(rq_users(), 'request', $title, $body, '#/istekler', ['subject' => $title, 'lines' => [$body], 'button' => 'İsteklerimi yaz'], 'notoff');
        }
    } else {
        $meta = rq_meta($old['meta']);
        $reopened = $status === 'open' && ($old['status'] !== 'open' || $deadline > (string)$old['deadline']) && $deadline >= date('Y-m-d');
        if ($deadline !== $old['deadline']) unset($meta['reminded']);
        if ($status === 'open') unset($meta['closed_note']);
        q('UPDATE req_periods SET ym = ?, roster_id = ?, deadline = ?, status = ?, note = ?, meta = ? WHERE id = ?',
            [$ym, $rid, $deadline, $status, $note ?: null, json_encode((object)$meta, JSON_UNESCAPED_UNICODE), $id]);
        $what = $status === 'closed' ? 'kapatıldı' : ($reopened ? ($old['status'] !== 'open' ? 'yeniden açıldı' : 'süre uzatıldı') : 'düzenlendi');
        audit($me, 'req.period', rq_month_label($ym) . ' istekleri ' . $what, $scope . ' · son gün ' . $dl);
        if ($reopened && !b('silent')) {
            $title = $old['status'] !== 'open' ? "$label nöbet istekleri yeniden açıldı · son gün $dl" : "$label istekleri için süre uzatıldı · son gün $dl";
            notify_users(rq_users(), 'request', $title, "İsteklerini $dl akşamına kadar yazabilir veya değiştirebilirsin.", '#/istekler', null, 'notoff');
        }
    }
    out(['id' => $id, 'periods' => rq_periods_list($me)]);
}

function a_req_period_delete(): void
{
    $me = need_publisher();
    $p = rq_period(i('id'));
    $n = (int)val('SELECT COUNT(*) FROM shift_requests WHERE period_id = ?', [(int)$p['id']]);
    q('DELETE FROM shift_requests WHERE period_id = ?', [(int)$p['id']]);
    q('DELETE FROM req_periods WHERE id = ?', [(int)$p['id']]);
    audit($me, 'req.period', rq_month_label($p['ym']) . ' istek dönemi silindi', $n . ' istek');
    out(['periods' => rq_periods_list($me)]);
}

/* ------------------------------------------------------------------ */
/* Kişinin kendi istekleri                                             */
/* ------------------------------------------------------------------ */

/** İstek kimin için: kendisi ya da (yayıncı) listedeki başka biri */
function rq_target(array $me, array $p): array
{
    $name = s('name', 120);
    if ($name === '' || names_match($name, (string)$me['name'])) return ['user_id' => (int)$me['id'], 'name' => (string)$me['name'], 'self' => true];
    if (!is_publisher($me)) fail('Başkasının adına istek yalnızca sorumlular girebilir.', 403);
    $u = swap_user_for($name, rq_users());
    if ($u) return ['user_id' => (int)$u['id'], 'name' => (string)$u['name'], 'self' => false];
    // Hesabı olmayan kişi: dönemin listelerinde adı geçmeli
    $people = rq_roster_people(rq_scope_rosters($p), $p['ym']);
    foreach ($people as $map) foreach ($map as $n) if (names_match((string)$n, $name)) return ['user_id' => 0, 'name' => (string)$n, 'self' => false];
    fail('Bu kişi dönemin nöbet listesinde bulunamadı.');
}

/** Kişinin bu dönemdeki satırları (hesabı varsa adla girilmiş eski satırlar da hesaba bağlanır) */
function rq_rows_for(array $p, array $t): array
{
    $pid = (int)$p['id'];
    $loose = array_values(array_filter(all('SELECT * FROM shift_requests WHERE period_id = ? AND user_id = 0', [$pid]), fn($r) => names_match((string)$r['name'], $t['name'])));
    if ($t['user_id'] > 0) {
        if ($loose) q('UPDATE shift_requests SET user_id = ?, name = ? WHERE id IN (' . implode(',', array_map(fn($r) => (int)$r['id'], $loose)) . ')', [$t['user_id'], $t['name']]);
        return all('SELECT * FROM shift_requests WHERE period_id = ? AND user_id = ? ORDER BY date', [$pid, $t['user_id']]);
    }
    usort($loose, fn($a, $b) => strcmp($a['date'], $b['date']));
    return $loose;
}

function rq_mine_out(array $p, array $t, array $me): array
{
    $rows = rq_rows_for($p, $t);
    $scope = rq_scope_rosters($p);
    $people = rq_roster_people($scope, $p['ym']);
    $cands = rq_detect_roster($t['name'], $people);
    $saved = null;
    foreach ($rows as $r) if ($r['roster_id'] !== null && $r['roster_id'] !== '') { $saved = (int)$r['roster_id']; break; }
    $rid = $p['roster_id'] ? (int)$p['roster_id'] : ($saved ?? ($cands[0] ?? null));
    // Uyum: ayın listesi geldiyse onaylı isteğe rağmen yazılmış nöbet
    $shifts = [];
    if (array_filter($rows, fn($r) => $r['status'] === 'approved')) {
        foreach (rq_month_shifts($scope, $p['ym']) as $k => $days) if ($k === swap_key($t['name']) || names_match($k, $t['name'])) $shifts += $days;
    }
    $isPub = is_publisher($me);
    $rosters = rq_nobet_rosters();
    $out = [
        'period' => rq_period_out($p, $me),
        'target' => ['name' => $t['name'], 'self' => $t['self'], 'user_id' => $t['user_id']],
        'items' => array_map(fn($r) => [
            'id' => (int)$r['id'], 'date' => $r['date'], 'kind' => $r['kind'], 'note' => $r['note'], 'status' => $r['status'],
            'reason' => $r['status'] === 'rejected' ? $r['reason'] : null, 'decided_at' => $r['decided_at'],
            'conflict' => $r['status'] === 'approved' && isset($shifts[$r['date']]) ? $shifts[$r['date']] : null,
        ], $rows),
        'roster' => ['id' => $rid, 'name' => $rid ? ($rosters[$rid] ?? null) : null, 'auto' => !$p['roster_id'] && $rid !== null && in_array($rid, $cands, true), 'fixed' => (bool)$p['roster_id'], 'found' => $cands !== []],
        'choices' => array_map(fn($id) => ['id' => $id, 'name' => $rosters[$id] ?? ''], $scope),
        'can_edit' => $isPub || ($t['self'] && rq_member_open($p)),
    ];
    if ($isPub) {
        // "Başkası adına" seçimi: dönemin listelerindeki kişiler (hesabı olup olmadığı)
        $list = [];
        $users = rq_users();
        foreach ($people as $rid2 => $map) foreach ($map as $k => $n) {
            if (isset($list[$k])) continue;
            $u = swap_user_for((string)$n, $users);
            $list[$k] = ['name' => $u ? $u['name'] : $n, 'roster' => $rosters[$rid2] ?? '', 'account' => (bool)$u, 'me' => $u && (int)$u['id'] === (int)$me['id']];
        }
        uasort($list, fn($a, $b) => strcmp(tr_fold($a['name']), tr_fold($b['name'])));
        $out['people'] = array_values($list);
    }
    return $out;
}

function a_req_mine(): void
{
    $me = need_user();
    $p = rq_period(i('period_id'));
    out(rq_mine_out($p, rq_target($me, $p), $me));
}

/** Kişinin dönemdeki isteklerini verilen tam liste ile değiştirir (eklenen, değişen, çıkarılan) */
function a_req_save(): void
{
    $me = need_user();
    $p = rq_period(i('period_id'));
    $t = rq_target($me, $p);
    $isPub = is_publisher($me);
    if (!$isPub && !rq_member_open($p)) fail('Bu ayın istek süresi doldu (son gün ' . rq_day_long((string)$p['deadline']) . '). Değişiklik için sorumluya yazın.', 403);
    $want = [];
    foreach (arr('items') as $it) {
        if (!is_array($it)) continue;
        $d = is_string($it['date'] ?? null) ? $it['date'] : '';
        $k = is_string($it['kind'] ?? null) ? $it['kind'] : '';
        if (!valid_ymd($d) || substr($d, 0, 7) !== $p['ym']) fail('Tarih ' . rq_month_label($p['ym']) . ' içinde olmalı.');
        if (!isset(RQ_KINDS[$k])) fail('İstek türü yalnızca Boşluk veya Yıllık izin olabilir.');
        $note = is_scalar($it['note'] ?? null) ? trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$it['note'])) : '';
        $want[$d] = ['kind' => $k, 'note' => mb_substr($note, 0, 200)];
    }
    if (count($want) > 31) fail('Çok fazla gün.');
    // Liste: dönemin listesi, seçilen ya da adından bulunan
    $scope = rq_scope_rosters($p);
    $rid = i('roster_id');
    if ($p['roster_id']) $rid = (int)$p['roster_id'];
    elseif ($rid) { if (!in_array((int)$rid, $scope, true)) fail('Liste bu dönemde yok.'); }
    else $rid = rq_detect_roster($t['name'], rq_roster_people($scope, $p['ym']))[0] ?? null;

    $rows = rq_rows_for($p, $t);
    $have = [];
    foreach ($rows as $r) $have[$r['date']] = $r;
    $add = $chg = $del = 0;
    $now = now();
    db()->beginTransaction();
    try {
        foreach ($have as $d => $r) {
            if (!isset($want[$d])) { q('DELETE FROM shift_requests WHERE id = ?', [(int)$r['id']]); $del++; continue; }
            $w = $want[$d];
            if ($w['kind'] !== $r['kind']) {
                q("UPDATE shift_requests SET kind = ?, note = ?, status = 'pending', reason = NULL, decided_by = NULL, decided_at = NULL, roster_id = ?, meta = NULL WHERE id = ?",
                    [$w['kind'], $w['note'] ?: null, $rid, (int)$r['id']]);
                $chg++;
            } elseif ((string)$r['note'] !== $w['note'] || (string)$r['roster_id'] !== (string)$rid) {
                q('UPDATE shift_requests SET note = ?, roster_id = ? WHERE id = ?', [$w['note'] ?: null, $rid, (int)$r['id']]);
                if ((string)$r['note'] !== $w['note']) $chg++;
            }
        }
        foreach ($want as $d => $w) {
            if (isset($have[$d])) continue;
            q("INSERT INTO shift_requests (period_id, user_id, name, roster_id, date, kind, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                [(int)$p['id'], $t['user_id'], $t['name'], $rid, $d, $w['kind'], $w['note'] ?: null, $now]);
            $add++;
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    if ($add || $chg || $del) {
        $b = count(array_filter($want, fn($w) => $w['kind'] === 'bosluk'));
        audit($me, 'req.save', $t['name'] . ' · ' . rq_month_label($p['ym']), count($want) . ' gün (' . $b . ' boşluk, ' . (count($want) - $b) . ' yıllık izin)' . ($t['self'] ? '' : ' · sorumlu girdi'));
        if (!$t['self'] && $t['user_id'] > 0) {
            $u = array_values(array_filter(rq_users(), fn($x) => (int)$x['id'] === $t['user_id']));
            if ($u) notify_users($u, 'request', rq_month_name($p['ym']) . ' isteklerin güncellendi', $me['name'] . ' senin adına isteklerini düzenledi (' . count($want) . ' gün).', '#/istekler');
        }
    }
    out(rq_mine_out($p, $t, $me) + ['changes' => ['added' => $add, 'changed' => $chg, 'removed' => $del]]);
}

function a_req_delete(): void
{
    $me = need_user();
    $r = one('SELECT * FROM shift_requests WHERE id = ?', [(int)i('id')]) ?? fail('İstek bulunamadı.', 404);
    $p = rq_period((int)$r['period_id']);
    $own = (int)$r['user_id'] === (int)$me['id'];
    if (!is_publisher($me)) {
        if (!$own) fail('Bu isteği silemezsiniz.', 403);
        if (!rq_member_open($p)) fail('Bu ayın istek süresi doldu; silmek için sorumluya yazın.', 403);
    }
    q('DELETE FROM shift_requests WHERE id = ?', [(int)$r['id']]);
    audit($me, 'req.delete', $r['name'] . ' · ' . swap_fmt_date($r['date']), RQ_KINDS[$r['kind']] ?? $r['kind']);
    out(['deleted' => (int)$r['id']]);
}

/* ------------------------------------------------------------------ */
/* Pano (herkes): kim hangi günü istedi — gerekçe ve not gönderilmez     */
/* ------------------------------------------------------------------ */

function a_req_board(): void
{
    $me = need_user();
    $p = rq_period(i('period_id'));
    $rows = all('SELECT id, user_id, name, roster_id, date, kind, status FROM shift_requests WHERE period_id = ? ORDER BY date', [(int)$p['id']]);
    $rosters = rq_nobet_rosters();
    $people = [];
    foreach ($rows as $r) {
        $k = (int)$r['user_id'] > 0 ? 'u' . $r['user_id'] : 'n' . swap_key((string)$r['name']);
        if (!isset($people[$k])) $people[$k] = ['key' => $k, 'name' => $r['name'], 'roster' => $r['roster_id'] ? ($rosters[(int)$r['roster_id']] ?? null) : null,
            'me' => (int)$r['user_id'] === (int)$me['id'], 'items' => []];
        $people[$k]['items'][] = ['date' => $r['date'], 'kind' => $r['kind'], 'status' => $r['status']];
    }
    $list = array_values($people);
    usort($list, fn($a, $b) => [!$a['me'], tr_fold($a['name'])] <=> [!$b['me'], tr_fold($b['name'])]);
    out(['period' => rq_period_out($p, $me), 'people' => $list, 'holidays' => (object)holidays_between($p['ym'] . '-01', rq_month_end($p['ym']))]);
}

/* ------------------------------------------------------------------ */
/* Yönetim paneli                                                      */
/* ------------------------------------------------------------------ */

/**
 * Panelin tüm verisi tek seferde: taraflar × günler (istek, müsait, gereken, baskı, ret önerisi), kişi tablosu, uyum uyarıları.
 * Gereken sayı = gündüz + gece kişi sayısı (Ayarlar › Nöbet). Renk: müsait < gereken → kırmızı; < 2 × gereken → sarı; değilse yeşil.
 */
function rq_panel_data(array $p, array $me): array
{
    $pid = (int)$p['id'];
    $ym = $p['ym'];
    $from = $ym . '-01';
    $to = rq_month_end($ym);
    $nDays = (int)date('t', strtotime($from));
    $rosters = rq_nobet_rosters();
    $scope = rq_scope_rosters($p);
    $meta = rq_meta($p['meta']);

    // Taraflar: tanımlıysa kapsamdaki taraflar, değilse kapsamdaki listeler
    $cfg = function_exists('sides_cfg') ? sides_cfg() : [];
    $sides = [];
    foreach ($cfg as $sd) if (in_array((int)$sd['roster_id'], $scope, true)) $sides[] = ['key' => $sd['key'], 'name' => $sd['name'], 'roster_id' => (int)$sd['roster_id'], 'units' => $sd['units']];
    $people = rq_roster_people($scope, $ym);
    if (!$sides) foreach ($scope as $rid) if (!empty($people[$rid]) || (int)$p['roster_id'] === $rid) $sides[] = ['key' => 'r' . $rid, 'name' => $rosters[$rid] ?? 'Liste', 'roster_id' => $rid, 'units' => []];
    $sideOfRoster = [];
    foreach ($sides as $sd) $sideOfRoster[$sd['roster_id']] = $sd['key'];

    // Kişi kimliği: listedeki ad anahtarı (tüm listeler), yoksa hesap / ad
    $allNames = [];
    $sideOfKey = [];
    foreach ($people as $rid => $map) foreach ($map as $k => $n) {
        $allNames[$k] = $n;
        if (isset($sideOfRoster[$rid]) && !isset($sideOfKey[$k])) $sideOfKey[$k] = $sideOfRoster[$rid];
    }
    $cache = [];
    $resolve = function (string $name, int $uid) use (&$cache, $allNames): string {
        $ck = $uid . '|' . $name;
        if (!isset($cache[$ck])) $cache[$ck] = rq_find_key($name, $allNames) ?? ($uid > 0 ? 'u' . $uid : 'n' . swap_key($name));
        return $cache[$ck];
    };

    $rows = all('SELECT * FROM shift_requests WHERE period_id = ? ORDER BY date, id', [$pid]);
    // Geçmiş dönemlerde onay / ret sayıları
    $past = [];
    foreach (all('SELECT sr.user_id, sr.name, sr.status, COUNT(*) c FROM shift_requests sr JOIN req_periods p ON p.id = sr.period_id WHERE p.ym < ? GROUP BY sr.user_id, sr.name, sr.status', [$ym]) as $r) {
        $k = $resolve((string)$r['name'], (int)$r['user_id']);
        $past[$k][$r['status']] = ($past[$k][$r['status']] ?? 0) + (int)$r['c'];
    }
    // Uyum: ay listesi geldiyse onaylı isteğe rağmen nöbet
    $hasRoster = rq_month_has_roster($scope, $ym);
    $shifts = $hasRoster ? rq_month_shifts($scope, $ym) : [];

    $persons = [];
    $byDay = [];
    $conflicts = [];
    foreach ($rows as $r) {
        $k = $resolve((string)$r['name'], (int)$r['user_id']);
        if (!isset($persons[$k])) {
            $side = $sideOfKey[$k] ?? ($r['roster_id'] && isset($sideOfRoster[(int)$r['roster_id']]) ? $sideOfRoster[(int)$r['roster_id']] : '_');
            $persons[$k] = ['key' => $k, 'name' => (int)$r['user_id'] > 0 ? $r['name'] : ($allNames[$k] ?? $r['name']), 'user_id' => (int)$r['user_id'] ?: null, 'side' => $side,
                'roster' => $r['roster_id'] ? ($rosters[(int)$r['roster_id']] ?? null) : null, 'items' => [], 'n' => 0, 'b' => 0, 'i' => 0,
                'pending' => 0, 'approved' => 0, 'rejected' => 0, 'conflicts' => 0,
                'past' => ['approved' => (int)($past[$k]['approved'] ?? 0), 'rejected' => (int)($past[$k]['rejected'] ?? 0)]];
        }
        $code = $r['status'] === 'approved' ? ($shifts[$k][$r['date']] ?? null) : null;
        if ($code === null && $r['status'] === 'approved' && $hasRoster && !isset($shifts[$k])) {
            foreach ($shifts as $sk => $days) if (isset($days[$r['date']]) && names_match($sk, (string)$r['name'])) { $code = $days[$r['date']]; break; }
        }
        $item = ['id' => (int)$r['id'], 'date' => $r['date'], 'kind' => $r['kind'], 'status' => $r['status'], 'note' => $r['note'], 'reason' => $r['reason'], 'conflict' => $code];
        $persons[$k]['items'][] = $item;
        $persons[$k][$r['status']]++;
        if ($r['status'] !== 'rejected') { $persons[$k]['n']++; $persons[$k][$r['kind'] === 'bosluk' ? 'b' : 'i']++; }
        if ($code !== null) {
            $persons[$k]['conflicts']++;
            $conflicts[] = ['id' => (int)$r['id'], 'name' => $persons[$k]['name'], 'date' => $r['date'], 'kind' => $r['kind'], 'code' => $code];
        }
        $byDay[$persons[$k]['side']][$r['date']][] = ['id' => (int)$r['id'], 'key' => $k, 'kind' => $r['kind'], 'status' => $r['status']];
    }

    // Gereken sayılar: tek sorguyla (gün gün needs_by_side yerine)
    $needs = function_exists('needs_all') ? needs_all() : [];
    $needsSet = false;
    foreach ($needs as $byType) foreach ($byType as $byP) foreach ($byP as $c) if ($c > 0) $needsSet = true;
    $hol = function_exists('holidays_between') ? holidays_between($from, $to) : [];
    $draws = (array)($meta['draws'] ?? []);

    $outSides = [];
    $hasOther = isset($byDay['_']);
    $sideList = $sides;
    if ($hasOther) $sideList[] = ['key' => '_', 'name' => 'Listesi bulunamayanlar', 'roster_id' => 0, 'units' => []];
    foreach ($sideList as $sd) {
        $members = [];
        if ($sd['roster_id']) foreach ($people[$sd['roster_id']] ?? [] as $k => $n) $members[$k] = true;
        foreach ($persons as $k => $x) if ($x['side'] === $sd['key']) $members[$k] = true;
        $nPeople = count($members);
        $days = [];
        $sideNeedSet = false;
        for ($d = 1; $d <= $nDays; $d++) {
            $date = sprintf('%s-%02d', $ym, $d);
            $w = (int)date('w', strtotime($date));
            $h = $hol[$date] ?? null;
            $dt = ($w === 0 || $w === 6 || ($h && !$h['half'])) ? 'weekend' : 'weekday';
            $need = ['day' => 0, 'night' => 0];
            foreach ($sd['units'] as $u) { $need['day'] += (int)($needs[$u][$dt]['day'] ?? 0); $need['night'] += (int)($needs[$u][$dt]['night'] ?? 0); }
            $needN = $need['day'] + $need['night'];
            if ($needN > 0) $sideNeedSet = true;
            $list = $byDay[$sd['key']][$date] ?? [];
            $active = array_values(array_filter($list, fn($x) => $x['status'] !== 'rejected'));
            $avail = max(0, $nPeople - count($active));
            $level = $needN <= 0 ? 'na' : ($avail < $needN ? 'over' : ($avail < 2 * $needN ? 'tight' : 'ok'));
            $excess = $needN > 0 ? max(0, min(count($active), $needN - $avail)) : 0;
            $day = ['date' => $date, 'd' => $d, 'we' => $dt === 'weekend', 'hol' => $h ? $h['name'] : null, 'need' => $need, 'need_n' => $needN,
                'b' => count(array_filter($active, fn($x) => $x['kind'] === 'bosluk')), 'i' => count(array_filter($active, fn($x) => $x['kind'] === 'izin')),
                'req' => count($active), 'rej' => count($list) - count($active), 'avail' => $avail, 'level' => $level, 'excess' => $excess];
            if ($list) $day += rq_day_order($list, $persons, $excess, $draws[$date . '|' . $sd['key']] ?? null);
            $days[] = $day;
        }
        $outSides[] = ['key' => $sd['key'], 'name' => $sd['name'], 'roster_id' => $sd['roster_id'], 'units' => $sd['units'], 'people' => $nPeople, 'need_set' => $sideNeedSet, 'days' => $days];
    }

    $plist = array_values($persons);
    usort($plist, fn($a, $b) => [$b['n'], tr_fold($a['name'])] <=> [$a['n'], tr_fold($b['name'])]);
    $drawLog = [];
    foreach ($draws as $k => $x) $drawLog[] = ['key' => $k, 'date' => explode('|', $k)[0], 'side' => explode('|', $k)[1] ?? ''] + (array)$x;
    usort($drawLog, fn($a, $b) => strcmp((string)($b['at'] ?? ''), (string)($a['at'] ?? '')));
    return [
        'period' => rq_period_out($p, $me),
        'needs_set' => $needsSet, 'has_roster' => $hasRoster, 'sides' => $outSides, 'people' => $plist,
        'conflicts' => $conflicts, 'draws' => $drawLog, 'days' => $nDays,
        'totals' => [
            'requests' => count($rows), 'people' => count($persons),
            'pending' => count(array_filter($rows, fn($r) => $r['status'] === 'pending')),
            'approved' => count(array_filter($rows, fn($r) => $r['status'] === 'approved')),
            'rejected' => count(array_filter($rows, fn($r) => $r['status'] === 'rejected')),
        ],
    ];
}

/**
 * Bir günün istekleri adalet sırasıyla: ① önce boşluk, sonra yıllık izin ② o dönemde daha çok gün isteyen
 * ③ geçmiş dönemlerde daha çok onay alan. Taşma sayısı kadar ret önerilir; sınır eşit kişilerin arasına düşerse kura gerekir.
 */
function rq_day_order(array $list, array $persons, int $excess, $draw): array
{
    $cands = [];
    foreach ($list as $x) {
        if ($x['status'] === 'rejected') continue;
        $pp = $persons[$x['key']];
        $cands[] = $x + ['name' => $pp['name'], 'rank' => [$x['kind'] === 'bosluk' ? 0 : 1, -$pp['n'], -$pp['past']['approved']], 'suggest' => false, 'tie' => false];
    }
    usort($cands, fn($a, $b) => $a['rank'] <=> $b['rank'] ?: strcmp(tr_fold($a['name']), tr_fold($b['name'])));
    $needDraw = false;
    $group = [];
    $pick = 0;
    if ($excess > 0) {
        $k = min($excess, count($cands));
        $cut = $cands[$k - 1]['rank'];
        $straddle = $k < count($cands) && $cands[$k]['rank'] === $cut;
        foreach ($cands as $i => $c) {
            if ($c['rank'] < $cut || (!$straddle && $i < $k)) $cands[$i]['suggest'] = true;
        }
        if ($straddle) {
            foreach ($cands as $i => $c) if ($c['rank'] === $cut) $group[] = $i;
            $before = count(array_filter($cands, fn($c) => $c['rank'] < $cut));
            $pick = $k - $before;
            $names = array_map(fn($i) => $cands[$i]['name'], $group);
            sort($names);
            $dn = is_array($draw) ? (array)($draw['cands'] ?? []) : [];
            sort($dn);
            if ($draw && $dn === $names && count((array)$draw['picked']) === $pick) {
                foreach ($group as $i) if (in_array($cands[$i]['name'], (array)$draw['picked'], true)) { $cands[$i]['suggest'] = true; $cands[$i]['drawn'] = true; }
            } else {
                $needDraw = true;
                foreach ($group as $i) $cands[$i]['tie'] = true;
            }
        }
    }
    foreach ($cands as &$c) unset($c['rank']);
    unset($c);
    return ['order' => $cands, 'need_draw' => $needDraw, 'draw_pick' => $needDraw ? $pick : 0, 'draw' => !$needDraw && $group && $draw ? $draw : null,
        'rejected' => array_values(array_map(fn($x) => ['id' => $x['id'], 'key' => $x['key'], 'name' => $persons[$x['key']]['name'], 'kind' => $x['kind']], array_filter($list, fn($x) => $x['status'] === 'rejected')))];
}

function a_req_panel(): void
{
    $me = need_publisher();
    out(rq_panel_data(rq_period(i('period_id')), $me));
}

/** Onay / ret / beklemeye al (tekli veya toplu). Kişiye tek bildirim. */
function a_req_decide(): void
{
    $me = need_publisher();
    $ids = array_values(array_unique(array_filter(array_map('intval', array_slice(arr('ids'), 0, 1000)))));
    if (!$ids) fail('İstek seçin.');
    $status = s('status', 10);
    if (!in_array($status, RQ_STATUS, true)) fail('Geçersiz karar.');
    $reason = $status === 'rejected' ? s('reason', 300) : '';
    $rows = all('SELECT * FROM shift_requests WHERE id IN (' . implode(',', $ids) . ')');
    if (!$rows) fail('İstek bulunamadı.', 404);
    $pid = (int)$rows[0]['period_id'];
    foreach ($rows as $r) if ((int)$r['period_id'] !== $pid) fail('İstekler aynı döneme ait olmalı.');
    $p = rq_period($pid);
    $now = now();
    $changed = [];
    db()->beginTransaction();
    foreach ($rows as $r) {
        if ($r['status'] === $status && (string)$r['reason'] === $reason) continue;
        q('UPDATE shift_requests SET status = ?, reason = ?, decided_by = ?, decided_at = ? WHERE id = ?',
            [$status, $reason !== '' ? $reason : null, $status === 'pending' ? null : $me['id'], $status === 'pending' ? null : $now, (int)$r['id']]);
        $changed[] = $r;
    }
    db()->commit();
    if ($changed && $status !== 'pending') {
        $byUser = [];
        foreach ($changed as $r) if ((int)$r['user_id'] > 0) $byUser[(int)$r['user_id']][] = $r;
        $users = [];
        foreach (rq_users() as $u) $users[(int)$u['id']] = $u;
        $mn = rq_month_name($p['ym']);
        foreach ($byUser as $uid => $list) {
            if (!isset($users[$uid])) continue;
            $days = array_map(fn($r) => (int)substr($r['date'], 8, 2), $list);
            $kinds = array_unique(array_map(fn($r) => RQ_SHORT[$r['kind']] ?? '', $list));
            $txt = rq_ranges($days) . ' ' . $mn . ' (' . implode(', ', array_map(fn($k) => $k === 'B' ? 'boşluk' : 'yıllık izin', $kinds)) . ')';
            if ($status === 'approved') notify_users([$users[$uid]], 'request', "$mn isteğin onaylandı", $txt . ' onaylandı.', '#/istekler');
            else notify_users([$users[$uid]], 'request', "$mn isteğin reddedildi", $txt . ' reddedildi.' . ($reason !== '' ? ' Gerekçe: ' . $reason : ''), '#/istekler');
        }
    }
    if ($changed) {
        $names = array_unique(array_map(fn($r) => $r['name'], $changed));
        audit($me, 'req.decide', rq_month_label($p['ym']) . ' · ' . ['pending' => 'beklemeye alındı', 'approved' => 'onaylandı', 'rejected' => 'reddedildi'][$status],
            count($changed) . ' istek · ' . implode(', ', array_slice($names, 0, 4)) . (count($names) > 4 ? ' …' : '') . ($reason !== '' ? ' · ' . $reason : ''));
    }
    out(rq_panel_data(rq_period($pid), $me) + ['decided' => count($changed)]);
}

/** Eşitlikte kura: sunucu sırayı yeniden hesaplar, eşit adaylardan gereken sayıda kişiyi random_int ile seçer ve kaydeder. */
function a_req_draw(): void
{
    $me = need_publisher();
    $p = rq_period(i('period_id'));
    $date = s('date', 10);
    $side = s('side', 20);
    $data = rq_panel_data($p, $me);
    $day = null;
    foreach ($data['sides'] as $sd) if ($sd['key'] === $side) foreach ($sd['days'] as $d) if ($d['date'] === $date) $day = $d;
    if (!$day || empty($day['need_draw'])) fail('Bu gün için kura gerekmiyor.');
    $group = array_values(array_filter($day['order'], fn($c) => !empty($c['tie'])));
    $names = array_map(fn($c) => $c['name'], $group);
    $pool = $names;
    for ($i = count($pool) - 1; $i > 0; $i--) { $j = random_int(0, $i); [$pool[$i], $pool[$j]] = [$pool[$j], $pool[$i]]; }
    $picked = array_slice($pool, 0, (int)$day['draw_pick']);
    $meta = rq_meta($p['meta']);
    $meta['draws'][$date . '|' . $side] = ['cands' => $names, 'picked' => $picked, 'by' => $me['name'], 'at' => now()];
    rq_set_period_meta((int)$p['id'], $meta);
    audit($me, 'req.draw', rq_month_label($p['ym']) . ' · ' . swap_fmt_date($date), 'Adaylar: ' . implode(', ', $names) . ' → ret önerisi: ' . implode(', ', $picked));
    out(rq_panel_data(rq_period((int)$p['id']), $me) + ['picked' => $picked]);
}

/* ------------------------------------------------------------------ */
/* Zamanlanmış görev: hatırlatma, kapanış, uyum kontrolü                */
/* ------------------------------------------------------------------ */

function rq_job(bool $force): ?array
{
    $today = date('Y-m-d');
    $done = [];
    $publishers = null;
    $pubs = function () use (&$publishers) {
        if ($publishers === null) $publishers = active_users_sql("AND role IN ('admin', 'editor')");
        return $publishers;
    };
    foreach (all("SELECT * FROM req_periods WHERE status = 'open' AND deadline IS NOT NULL") as $p) {
        $meta = rq_meta($p['meta']);
        $mn = rq_month_name($p['ym']);
        // 1) Son günden 2 gün önce: isteği olmayanlara bir kez hatırlatma
        if ($today <= $p['deadline'] && $today >= date('Y-m-d', strtotime($p['deadline'] . ' -2 days')) && empty($meta['reminded'])) {
            $has = [];
            foreach (all('SELECT DISTINCT user_id, name FROM shift_requests WHERE period_id = ?', [(int)$p['id']]) as $r) { if ((int)$r['user_id'] > 0) $has[(int)$r['user_id']] = true; }
            $people = rq_roster_people(rq_scope_rosters($p), $p['ym']);
            $names = [];
            foreach ($people as $map) foreach ($map as $n) $names[] = $n;
            $to = [];
            foreach (rq_users() as $u) {
                if (isset($has[(int)$u['id']])) continue;
                if ($names) { $in = false; foreach ($names as $n) if (names_match((string)$n, (string)$u['name'])) { $in = true; break; } if (!$in) continue; }
                $to[] = $u;
            }
            $left = (int)round((strtotime($p['deadline']) - strtotime($today)) / 86400);
            if ($to) notify_users($to, 'request', "$mn nöbet istekleri · " . ($left === 0 ? 'bugün son gün' : "son $left gün"),
                'Henüz isteğin yok. Boşluk veya yıllık izin istiyorsan ' . rq_day_long($p['deadline']) . ' akşamına kadar yaz.', '#/istekler',
                ['subject' => "$mn nöbet istekleri için son gün " . rq_day_long($p['deadline']), 'lines' => ['Henüz isteğin yok. Boşluk veya yıllık izin istiyorsan ' . rq_day_long($p['deadline']) . ' akşamına kadar yaz.'], 'button' => 'İsteklerimi yaz'], 'notoff');
            $meta['reminded'] = $today;
            rq_set_period_meta((int)$p['id'], $meta);
            $done['reminded'] = ($done['reminded'] ?? 0) + count($to);
        }
        // 2) Son gün geçti: dönemi kapat, sorumlulara özet
        if ($today > $p['deadline']) {
            q("UPDATE req_periods SET status = 'closed' WHERE id = ?", [(int)$p['id']]);
            if (empty($meta['closed_note'])) {
                $c = one('SELECT COUNT(*) n, COUNT(DISTINCT name) k FROM shift_requests WHERE period_id = ?', [(int)$p['id']]);
                notify_users($pubs(), 'request', "$mn istekleri kapandı", (int)$c['k'] . ' kişi, ' . (int)$c['n'] . ' gün istedi. Onay ve ret için İstekler › Yönetim.', '#/istekler/yonetim');
                $meta['closed_note'] = $today;
                rq_set_period_meta((int)$p['id'], $meta);
            }
            $done['closed'] = ($done['closed'] ?? 0) + 1;
        }
    }
    // 3) Uyum: ayın listesi geldiyse onaylı isteğe rağmen nöbet yazılmış mı (kişiye ve sorumlulara bir kez)
    $minYm = date('Y-m', strtotime(date('Y-m-01') . ' -1 month'));
    $found = [];
    foreach (all('SELECT * FROM req_periods WHERE ym >= ?', [$minYm]) as $p) {
        $rows = array_values(array_filter(all("SELECT * FROM shift_requests WHERE period_id = ? AND status = 'approved'", [(int)$p['id']]), fn($r) => empty(rq_meta($r['meta'])['conflict_notified'])));
        if (!$rows) continue;
        $scope = rq_scope_rosters($p);
        if (!rq_month_has_roster($scope, $p['ym'])) continue;
        $shifts = rq_month_shifts($scope, $p['ym']);
        $names = [];
        foreach ($shifts as $k => $d) $names[$k] = $k;
        foreach ($rows as $r) {
            $k = rq_find_key((string)$r['name'], $names);
            $code = $k !== null ? ($shifts[$k][$r['date']] ?? null) : null;
            if ($code === null) continue;
            $m = rq_meta($r['meta']);
            $m['conflict_notified'] = now();
            $m['conflict_code'] = $code;
            q('UPDATE shift_requests SET meta = ? WHERE id = ?', [json_encode($m, JSON_UNESCAPED_UNICODE), (int)$r['id']]);
            $found[] = $r + ['code' => $code, 'ym' => $p['ym']];
        }
    }
    if ($found) {
        $users = [];
        foreach (rq_users() as $u) $users[(int)$u['id']] = $u;
        foreach ($found as $r) {
            if ((int)$r['user_id'] > 0 && isset($users[(int)$r['user_id']])) {
                notify_users([$users[(int)$r['user_id']]], 'request', 'Onaylı isteğine nöbet yazılmış', swap_fmt_date($r['date']) . ' için onaylı ' . mb_strtolower(RQ_KINDS[$r['kind']] ?? '') . ' isteğin var ama listede ' . $r['code'] . ' nöbeti görünüyor. Sorumluyla görüş.', '#/istekler');
            }
        }
        $lines = array_map(fn($r) => $r['name'] . ' · ' . swap_fmt_date($r['date']) . ' (' . (RQ_SHORT[$r['kind']] ?? '') . ' → ' . $r['code'] . ')', $found);
        notify_users($pubs(), 'request', 'Listede onaylı isteklerle çakışma: ' . count($found), implode(' · ', array_slice($lines, 0, 8)) . (count($lines) > 8 ? ' …' : ''), '#/istekler/yonetim');
        $done['conflicts'] = count($found);
    }
    return $done ?: null;
}
$GLOBALS['NM_JOBS']['requests'] = fn(bool $force) => rq_job($force);

return [
    'req.periods' => 'a_req_periods',
    'req.period.save' => 'a_req_period_save',
    'req.period.delete' => 'a_req_period_delete',
    'req.mine' => 'a_req_mine',
    'req.save' => 'a_req_save',
    'req.delete' => 'a_req_delete',
    'req.board' => 'a_req_board',
    'req.panel' => 'a_req_panel',
    'req.decide' => 'a_req_decide',
    'req.draw' => 'a_req_draw',
];
