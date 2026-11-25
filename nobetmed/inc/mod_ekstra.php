<?php
/**
 * Ekstra nöbet isteyenler (4.9).
 *
 * Kişi bir ay için "ekstra nöbet almak istiyorum" der (istek tarihi kaydedilir; isterse yalnız belirli günler ve vardiya türleri).
 * İstek tarihinden ay sonuna kadar her gün ve her vardiya için kurallar tek tek denetlenir:
 *   o gün nöbeti / izni yok · onaylı ya da bekleyen boşluk / yıllık izin isteği yok · izin bitişiği hafta sonu değil ·
 *   dinlenme ve üst üste çalışma kuralları (eksik çağrısıyla aynı motor; kabul edilmiş değişimler ve seçilmiş çağrılar dahil).
 * Sorumlu gün gün uygun gönüllüleri ve eksik sayısını görür; eksik personel çağrısında gönüllüler en üstte çıkar.
 */
declare(strict_types=1);

const EX_SHIFTS = ['24' => '24 saat (08-08)', 'day' => 'Gündüz (08-16)', 'night' => 'Gece (16-08)'];
/** Vardiya anahtarları metin olarak (PHP '24' anahtarını sayıya çevirir) */
function ex_keys(): array { return array_map('strval', array_keys(EX_SHIFTS)); }

function ex_ym(?string $ym = null): string
{
    $ym = $ym ?? s('ym', 7);
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string)$ym)) $ym = date('Y-m');
    if ($ym < date('Y-m')) fail('Geçmiş ay için ekstra nöbet isteği olmaz.');
    return $ym;
}
function ex_month_end(string $ym): string { return date('Y-m-t', strtotime($ym . '-01')); }

/** Kişinin o ayın listesindeki yeri: [roster_id, timeline, kişi anahtarı] ya da null */
function ex_locate(string $name, string $ym): ?array
{
    $first = $ym . '-01'; $last = ex_month_end($ym);
    $rows = all('SELECT DISTINCT s.roster_id, s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date >= ? AND s.date <= ? AND r.kind <> ?', [$first, $last, 'tablo']);
    // Kişi birden çok listede olabilir (ör. ay içinde basamak değişti): ana liste en çok nöbetinin olduğu liste;
    // diğer listelerdeki nöbetleri de günlerine eklenir — yoksa başka listedeki nöbet günü "boş" sanılır
    $found = [];
    foreach ($rows as $r) {
        if (!names_match((string)$r['name'], $name)) continue;
        $rid = (int)$r['roster_id'];
        if (isset($found[$rid])) continue;
        $tl = mk_tl($rid, mk_shift_day($first, -40), mk_shift_day($last, 40));
        $k = swap_key((string)$r['name']);
        if (!isset($tl[$k])) continue;
        $n = 0;
        foreach ($tl[$k]['days'] as $dd => $x) if ($dd >= $first && $dd <= $last && in_array($x['kind'] ?? '', ['shift', 'role'], true)) $n++;
        $found[$rid] = [$rid, $tl, $k, $n];
    }
    if (!$found) return null;
    uasort($found, fn($a, $b) => $b[3] <=> $a[3]);
    [$rid, $tl, $k] = array_values($found)[0];
    foreach ($found as $orid => [, $otl, $ok]) {
        if ($orid === $rid) continue;
        foreach ($otl[$ok]['days'] as $dd => $x) {
            $cur = $tl[$k]['days'][$dd] ?? null;
            if (!$cur || (in_array($x['kind'] ?? '', ['shift', 'role'], true) && !in_array($cur['kind'] ?? '', ['shift', 'role'], true))) $tl[$k]['days'][$dd] = $x;
        }
    }
    ksort($tl[$k]['days']);
    // Önceki / sonraki ayın başka listelerdeki nöbetleri de (ör. 31 Aralık 24 saat başka listede → 1 Ocak ekstra alınamaz)
    $tl[$k]['days'] = swap_days_full($k, $tl[$k]['days'], mk_shift_day($first, -40), mk_shift_day($last, 40));
    return [$rid, $tl, $k];
}

/** Bu kişi bu gün bu vardiyayı ekstra alabilir mi: [bool, neden] */
function ex_eval(array $tl, string $k, int $rid, string $date, string $shift): array
{
    $p = $tl[$k];
    $days = $p['days'];
    $name = (string)$p['name'];
    $d = $days[$date] ?? null;
    if ($d && in_array($d['kind'], ['shift', 'role'], true)) return [false, 'O gün listede nöbeti var (' . $d['code'] . ')'];
    if ($d && in_array($d['kind'], ['leave', 'off'], true)) return [false, ($d['label'] ?: 'İzinli') . ' (' . $d['code'] . ')'];
    if ($q = rules_req_on($name, $date, ['izin', 'bosluk'], true)) return [false, ($q['kind'] === 'izin' ? 'Yıllık izin' : 'Boşluk') . ' isteği var' . ($q['status'] === 'pending' ? ' (onay bekliyor)' : '')];
    if ($lw = rules_leave_weekend($days, $date, $name)) return [false, $lw];
    $row = co_row($shift, [$rid], null, $date);
    $ev = co_eval($days, $date, $row, rules_cfg());
    if (!$ev['rest']) return [false, $ev['rest_why']];
    if (!$ev['cont']) return [false, $ev['cont_why']];
    if ($err = rules_check_add($days, $date, $row, mk_first($name))) return [false, $err];
    return [true, null];
}

/** O gün o listede gündüz/gece kaç kişi eksik (gereken sayılara göre; tanımlı değilse null) */
function ex_short(array $tl, int $rid, string $date): ?array
{
    static $sides = null;
    $sides = $sides ?? (function_exists('sides_cfg') ? sides_cfg() : []);
    $side = null;
    foreach ($sides as $s) if ((int)$s['roster_id'] === $rid) { $side = $s['key']; break; }
    if ($side === null) return null;
    try { $need = needs_by_side($date)[$side] ?? null; } catch (Throwable $e) { return null; }
    if (!$need || (!(int)$need['day'] && !(int)$need['night'])) return null;
    return ['day' => max(0, (int)$need['day'] - co_count_on($tl, $date, ['day'])), 'night' => max(0, (int)$need['night'] - co_count_on($tl, $date, ['night']))];
}

function ex_reg(int $uid, string $ym): ?array
{
    $r = one('SELECT * FROM extra_pool WHERE user_id = ? AND ym = ?', [$uid, $ym]);
    if (!$r) return null;
    return ['ym' => $r['ym'], 'from' => $r['from_date'], 'shifts' => array_values(array_intersect(ex_keys(), explode(',', (string)$r['shifts']))),
        'days' => $r['days'] !== null && $r['days'] !== '' ? array_values((array)json_decode((string)$r['days'], true)) : null, 'note' => (string)($r['note'] ?? ''), 'at' => $r['created_at']];
}

/** Gün gün değerlendirme: istek tarihinden (ya da bugünden) ay sonuna kadar */
function ex_days(string $name, string $ym, string $from, ?array $only = null): array
{
    $loc = ex_locate($name, $ym);
    if (!$loc) return ['found' => false, 'days' => []];
    [$rid, $tl, $k] = $loc;
    $start = max($from, date('Y-m-d'), $ym . '-01');
    $end = ex_month_end($ym);
    $out = [];
    for ($d = $start; $d <= $end; $d = mk_shift_day($d, 1)) {
        $types = [];
        foreach (ex_keys() as $sh) { [$ok, $why] = ex_eval($tl, $k, $rid, $d, $sh); $types[$sh] = ['ok' => $ok, 'why' => $why]; }
        $out[] = ['date' => $d, 'types' => $types, 'short' => ex_short($tl, $rid, $d), 'weekend' => day_type($d) === 'weekend', 'holiday' => holiday_on($d)['name'] ?? null,
            'picked' => $only === null ? null : in_array($d, $only, true)];
    }
    return ['found' => true, 'roster_id' => $rid, 'roster' => mk_roster_names()[$rid] ?? '', 'days' => $out];
}

/** Benim ekstra nöbet isteğim ve uygun günlerim */
function a_extra_me(): void
{
    $me = need_user();
    $ym = ex_ym();
    $reg = ex_reg((int)$me['id'], $ym);
    $r = ex_days((string)$me['name'], $ym, $reg['from'] ?? date('Y-m-d'), $reg['days'] ?? null);
    out(['ym' => $ym, 'reg' => $reg, 'shifts' => EX_SHIFTS, 'rules' => rules_cfg()] + $r);
}

function a_extra_save(): void
{
    $me = need_user();
    $ym = ex_ym();
    $shifts = array_values(array_intersect(ex_keys(), array_map('strval', arr('shifts'))));
    if (!$shifts) fail('En az bir vardiya türü seçin.');
    global $IN;
    $days = null;
    if (is_array($IN['days'] ?? null)) {
        $days = array_values(array_unique(array_filter(array_map('strval', $IN['days']), fn($d) => valid_ymd($d) && substr($d, 0, 7) === $ym && $d >= date('Y-m-d'))));
        sort($days);
        if (!$days) fail('Gün seçin ya da “tüm uygun günler”i işaretleyin.');
    }
    $note = s('note', 200);
    if (!ex_locate((string)$me['name'], $ym)) fail(rq_month_label_safe($ym) . ' listesinde adınız yok. Liste yayımlanınca ekstra nöbet isteği verebilirsiniz.');
    $old = one('SELECT id FROM extra_pool WHERE user_id = ? AND ym = ?', [$me['id'], $ym]);
    if ($old) q('UPDATE extra_pool SET shifts = ?, days = ?, note = ?, updated_at = ? WHERE id = ?', [implode(',', $shifts), $days === null ? null : json_encode($days), $note, now(), $old['id']]);
    else {
        q('INSERT INTO extra_pool (user_id, name, ym, from_date, shifts, days, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$me['id'], $me['name'], $ym, max(date('Y-m-d'), $ym . '-01'), implode(',', $shifts), $days === null ? null : json_encode($days), $note, now(), now()]);
        // Sorumlulara haber
        $pubs = array_values(array_filter(module_managers('eksik'), fn($u) => (int)$u['id'] !== (int)$me['id']));
        if ($pubs) notify_users($pubs, 'extra', $me['name'] . ' ekstra nöbet istiyor', rq_month_label_safe($ym) . ' · ' . implode(', ', array_map(fn($s) => EX_SHIFTS[$s], $shifts)) . ($days ? ' · ' . count($days) . ' gün' : ' · uygun tüm günler'), '#/ekstra/liste/' . $ym);
    }
    audit($me, 'extra.save', rq_month_label_safe($ym), implode(', ', $shifts) . ($days ? ' · ' . count($days) . ' gün' : ''));
    a_extra_me();
}

function a_extra_cancel(): void
{
    $me = need_user();
    $ym = ex_ym();
    q('DELETE FROM extra_pool WHERE user_id = ? AND ym = ?', [$me['id'], $ym]);
    audit($me, 'extra.cancel', rq_month_label_safe($ym));
    out();
}

/** Sorumlu: gün gün uygun gönüllüler ve eksik sayıları */
function a_extra_board(): void
{
    $me = need_user();
    if (!is_publisher($me)) fail('Bu liste sorumlular içindir.', 403);
    $ym = ex_ym();
    $regs = all('SELECT * FROM extra_pool WHERE ym = ? ORDER BY created_at', [$ym]);
    $people = [];
    $byDay = [];
    foreach ($regs as $r) {
        $reg = ex_reg((int)$r['user_id'], $ym);
        $u = mk_user_by_id((int)$r['user_id']);
        $name = $u ? (string)$u['name'] : (string)$r['name'];
        $ev = ex_days($name, $ym, $reg['from'], $reg['days']);
        $okDays = 0;
        foreach ($ev['days'] as $d) {
            if ($reg['days'] !== null && !$d['picked']) continue;
            $ok = array_values(array_filter($reg['shifts'], fn($s) => $d['types'][$s]['ok']));
            if (!$ok) continue;
            $okDays++;
            $byDay[$d['date']]['people'][] = ['user_id' => (int)$r['user_id'], 'name' => $name, 'shifts' => $ok];
            $byDay[$d['date']]['short'] = $d['short'];
        }
        $people[] = ['user_id' => (int)$r['user_id'], 'name' => $name, 'from' => $reg['from'], 'shifts' => $reg['shifts'], 'days' => $reg['days'], 'note' => $reg['note'],
            'found' => $ev['found'], 'roster' => $ev['roster'] ?? '', 'ok_days' => $okDays, 'at' => $reg['at']];
    }
    ksort($byDay);
    $days = [];
    foreach ($byDay as $d => $x) $days[] = ['date' => $d, 'short' => $x['short'] ?? null, 'people' => $x['people']];
    out(['ym' => $ym, 'people' => $people, 'days' => $days, 'shifts' => EX_SHIFTS]);
}

/** Eksik çağrısı adaylarında: bu kişi bu gün bu vardiyada ekstra istiyor mu */
function ex_wants(string $name, string $date, string $shift): bool
{
    static $cache = [];
    $ym = substr($date, 0, 7);
    if (!isset($cache[$ym])) {
        $cache[$ym] = [];
        try { foreach (all('SELECT * FROM extra_pool WHERE ym = ?', [$ym]) as $r) $cache[$ym][] = $r; } catch (Throwable $e) { /* tablo yok */ }
    }
    foreach ($cache[$ym] as $r) {
        if ($date < (string)$r['from_date']) continue;
        $u = mk_user_by_id((int)$r['user_id']);
        if (!names_match($name, $u ? (string)$u['name'] : (string)$r['name'])) continue;
        $sh = explode(',', (string)$r['shifts']);
        if (!in_array($shift, $sh, true)) continue;
        if ($r['days'] !== null && $r['days'] !== '' && !in_array($date, (array)json_decode((string)$r['days'], true), true)) continue;
        return true;
    }
    return false;
}

function rq_month_label_safe(string $ym): string
{
    return function_exists('rq_month_label') ? rq_month_label($ym) : $ym;
}

/* =================================================================== */
/* Nöbet devral: benim alabileceğim VE sahibinin bırakabileceği nöbetler  */
/* =================================================================== */

/** Kişinin nöbet listelerindeki yeri (o ay): [[rid, tl, anahtar, listedeki ad], ...] */
function tk_my_lists(array $me, string $ym): array
{
    $first = $ym . '-01'; $last = ex_month_end($ym);
    $out = [];
    foreach (mk_my_rosters($me) as $rid => $nm) {
        $tl = mk_tl((int)$rid, mk_shift_day($first, -40), mk_shift_day($last, 40));
        $k = swap_key((string)$nm);
        if (!isset($tl[$k])) continue;
        if (!array_filter(array_keys($tl[$k]['days']), fn($d) => strncmp((string)$d, $ym, 7) === 0)) continue;
        $out[] = [(int)$rid, $tl, $k, (string)$nm];
    }
    return $out;
}

/** Bir nöbeti (ya da 24 saatin gündüz / gece parçasını) devralma denetimi: [ok, benim nedenim, onun nedeni] */
function tk_eval(array $tl, string $myK, string $myName, string $pk, string $date, string $part = ''): array
{
    $rules = rules_cfg();
    $p = $tl[$pk];
    $row = $p['days'][$date];
    // Her iki kişinin de tüm listelerindeki ve önceki aydaki nöbetleri (ör. 30 Kasım 24 saat → 1 Aralık alınamaz)
    $wf = mk_shift_day($date, -45); $wt = mk_shift_day($date, 45);
    $p['days'] = swap_days_full($pk, $p['days'], $wf, $wt);
    $mine = swap_days_full($myK, $tl[$myK]['days'], $wf, $wt);
    $part = swap_part($part);
    $kept = null;
    if ($part !== '') {
        if (!swap_splittable($row)) return [false, 'Bu nöbet 24 saat değil; parça olarak alınamaz', null];
        [$row, $kept] = swap_split($row, $part, (int)($row['roster_id'] ?? 0));
    }
    $why = null;
    $merged = $part !== '' && isset($mine[$date]) ? swap_merge($mine[$date], $row, (int)($row['roster_id'] ?? 0)) : null;
    if (isset($mine[$date]) && !$merged) { $x = $mine[$date]; $why = 'O gün senin de ' . ($x['kind'] === 'shift' ? 'nöbetin' : ($x['kind'] === 'leave' ? 'iznin' : 'kaydın')) . ' var (' . $x['code'] . ')'; }
    elseif ($q = rules_req_on($myName, $date, ['izin', 'bosluk'], true)) $why = 'O gün için ' . ($q['kind'] === 'izin' ? 'yıllık izin' : 'boşluk') . ' isteğin var';
    elseif ($merged) { $m2 = $mine; unset($m2[$date]); $why = rules_check_add($m2, $date, $merged, 'Senin'); }
    else $why = rules_check_add($mine, $date, $row, 'Senin');
    // Veren: tamamını verirse o gün boşalır (uzun boşluk denetimi); parçasını verirse o gün nöbeti kalır
    $theirs = null;
    if (!$kept) {
        $without = $p['days'];
        unset($without[$date]);
        $theirs = swap_check($without, [], [$date], $rules, mk_first((string)(mk_user_for((string)$p['name'])['name'] ?? $p['name'])));
    }
    return [$why === null && $theirs === null, $why, $theirs];
}

function tk_item(array $p, array $row, string $date, int $rid): array
{
    $u = mk_user_for((string)$p['name']);
    return ['name' => $p['name'], 'display' => $u ? $u['name'] : $p['name'], 'user_id' => $u ? (int)$u['id'] : null, 'title' => $p['title'], 'roster_id' => $rid,
        'code' => $row['code'], 'label' => $row['label'], 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null, 'start' => $row['start_time'], 'end' => $row['end_time'],
        'shift' => count(shift_periods($row)) > 1 ? '24' : (shift_periods($row)[0] ?? 'day')];
}

/** Devralabileceğim nöbetler: genel (bugünden ay sonuna) ya da seçilen gün (uygun olmayanlar nedenleriyle) */
function a_extra_take(): void
{
    $me = need_user();
    $ym = ex_ym();
    $day = s('date', 10);
    if ($day !== '' && (!valid_ymd($day) || substr($day, 0, 7) !== $ym || $day < date('Y-m-d'))) fail('Geçersiz gün.');
    $lists = tk_my_lists($me, $ym);
    $base = ['ym' => $ym, 'date' => $day ?: null, 'rules' => rules_cfg(), 'requests' => tk_requests_out($me)];
    if (!$lists) out($base + ['found' => false, 'days' => []]);
    $start = max(date('Y-m-d'), $ym . '-01');
    $end = ex_month_end($ym);
    $now = time();
    // Açık ilanlar ve bekleyen istekler (işaret için)
    $listed = [];
    foreach (all("SELECT name, date FROM listings WHERE status = 'open' AND kind = 'give' AND date >= ? AND date <= ?", [$start, $end]) as $l) $listed[$l['date'] . '|' . swap_key((string)$l['name'])] = true;
    $asked = [];
    foreach (all("SELECT giver_name, date, status FROM take_requests WHERE taker_user = ? AND status = 'pending'", [$me['id']]) as $t) $asked[$t['date'] . '|' . swap_key((string)$t['giver_name'])] = true;
    $days = [];
    foreach ($lists as [$rid, $tl, $myK, $myName]) {
        for ($d = $day ?: $start; $d <= ($day ?: $end); $d = mk_shift_day($d, 1)) {
            foreach ($tl as $pk => $p) {
                if ($pk === $myK) continue;
                $row = $p['days'][$d] ?? null;
                if (!$row || ($row['kind'] ?? '') !== 'shift') continue;
                $iv = swap_interval($d, $row);
                if (!$iv || $iv[0] <= $now) continue; // başlamış nöbet devredilemez
                [$ok, $myWhy, $theirWhy] = tk_eval($tl, $myK, $myName, $pk, $d);
                // 24 saatlik nöbet: gündüzü (08-16) ya da gecesi (16-08) ayrı istenebilir
                $parts = null;
                if (swap_splittable($row)) {
                    $parts = [];
                    foreach (['day', 'night'] as $pt) {
                        [$st] = swap_split($row, $pt, $rid);
                        if (strtotime($d . ' ' . $st['start_time']) <= $now) { $parts[$pt] = ['ok' => false, 'why' => 'Başladı']; continue; }
                        [$pok, $pw, $tw] = tk_eval($tl, $myK, $myName, $pk, $d, $pt);
                        $parts[$pt] = ['ok' => $pok, 'why' => $pw ?? $tw, 'code' => $st['code']];
                    }
                }
                $any = $ok || ($parts && ($parts['day']['ok'] || $parts['night']['ok']));
                if (!$any && !$day) continue;
                $it = tk_item($p, $row, $d, $rid) + ['ok' => $ok, 'any' => $any, 'parts' => $parts, 'my_why' => $myWhy, 'their_why' => $theirWhy,
                    'listed' => isset($listed[$d . '|' . $pk]), 'asked' => isset($asked[$d . '|' . $pk]), 'roster' => mk_roster_names()[$rid] ?? ''];
                $days[$d]['date'] = $d;
                $days[$d]['items'][] = $it;
                $days[$d]['mine'] = isset($tl[$myK]['days'][$d]) ? $tl[$myK]['days'][$d]['code'] : null;
            }
        }
    }
    ksort($days);
    foreach ($days as &$x) usort($x['items'], fn($a, $b) => [!$a['any'], !$a['ok'], !$a['listed'], $a['display']] <=> [!$b['any'], !$b['ok'], !$b['listed'], $b['display']]);
    unset($x);
    out($base + ['found' => true, 'days' => array_values($days)]);
}

function tk_requests_out(array $me): array
{
    $rows = all("SELECT * FROM take_requests WHERE (taker_user = ? OR giver_user = ?) AND date >= ? ORDER BY id DESC LIMIT 60", [$me['id'], $me['id'], date('Y-m-d', strtotime('-7 days'))]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'date' => $r['date'], 'code' => $r['code'], 'part' => swap_part($r['part'] ?? null), 'giver' => $r['giver_name'], 'taker' => $r['taker_name'], 'status' => $r['status'],
        'note' => (string)($r['note'] ?? ''), 'dir' => (int)$r['taker_user'] === (int)$me['id'] ? 'out' : 'in', 'at' => $r['created_at'], 'reason' => (string)($r['reason'] ?? '')], $rows);
}

/** Nöbeti sahibinden iste */
function a_extra_take_ask(): void
{
    $me = need_user();
    $date = s('date', 10);
    $name = s('name', 120);
    $part = swap_part(s('part', 5));
    if (!valid_ymd($date) || $date < date('Y-m-d')) fail('Geçersiz gün.');
    $ym = substr($date, 0, 7);
    $want = (int)i('roster_id'); // nöbetin listesi (kişiler birden çok listede olabilir: seçilen nöbetin listesine bakılır)
    foreach (tk_my_lists($me, $ym) as [$rid, $tl, $myK, $myName]) {
        if ($want && $rid !== $want) continue;
        $pk = swap_key($name);
        $row = $tl[$pk]['days'][$date] ?? null;
        if (!$row || ($row['kind'] ?? '') !== 'shift') continue;
        [$ok, $myWhy, $theirWhy] = tk_eval($tl, $myK, $myName, $pk, $date, $part);
        if (!$ok) fail(($myWhy ?? $theirWhy) . '.');
        $u = mk_user_for((string)$tl[$pk]['name']);
        if (!$u) fail($tl[$pk]['name'] . ' uygulamada kayıtlı değil; telefonla sorabilirsiniz.');
        if (one("SELECT id FROM take_requests WHERE taker_user = ? AND giver_user = ? AND date = ? AND COALESCE(part, '') = ? AND status = 'pending'", [$me['id'], $u['id'], $date, $part])) fail('Bu nöbeti zaten istedin; yanıt bekleniyor.');
        $note = s('note', 200);
        q('INSERT INTO take_requests (roster_id, date, code, giver_user, giver_name, taker_user, taker_name, status, note, created_at, part) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$rid, $date, $row['code'], $u['id'], $tl[$pk]['name'], $me['id'], $myName, 'pending', $note ?: null, now(), $part ?: null]);
        $pt = $part !== '' ? ', ' . swap_part_text($part) : '';
        notify_users(mk_full_users([(int)$u['id']]), 'swap', 'Nöbet devralma isteği: ' . $me['name'], $me['name'] . ', ' . swap_fmt_date($date) . ' (' . $row['code'] . $pt . ') nöbetini senden almak istiyor' . ($note ? ' · “' . $note . '”' : '') . '. Kabul ya da ret için dokun.', '#/ekstra');
        audit($me, 'take.ask', swap_fmt_date($date) . ' ' . $row['code'] . $pt, $tl[$pk]['name']);
        out(['requests' => tk_requests_out($me)]);
    }
    fail('Bu nöbet listede artık görünmüyor.');
}

/** Nöbet sahibi yanıtlar: kabul → devir (sorumluya “Excel’e işlenecek”) */
function a_extra_take_respond(): void
{
    $me = need_user();
    $t = one('SELECT * FROM take_requests WHERE id = ?', [(int)i('id')]) ?? fail('İstek bulunamadı.', 404);
    if ((int)$t['giver_user'] !== (int)$me['id']) fail('Bu istek size gönderilmemiş.', 403);
    if ($t['status'] !== 'pending') fail('Bu istek artık beklemede değil.');
    $taker = one('SELECT * FROM users WHERE id = ?', [(int)$t['taker_user']]);
    if (!b('accept')) {
        q("UPDATE take_requests SET status = 'declined', decided_at = ?, reason = ? WHERE id = ?", [now(), s('reason', 200) ?: null, $t['id']]);
        if ($taker) notify_users([$taker], 'swap', 'Devralma isteğin reddedildi', $me['name'] . ', ' . swap_fmt_date($t['date']) . ' nöbetini vermedi.', '#/ekstra');
        audit($me, 'take.decline', swap_fmt_date($t['date']) . ' ' . $t['code'], (string)$t['taker_name']);
        out(['requests' => tk_requests_out($me)]);
    }
    // Liste değişmiş olabilir: iki tarafı yeniden denetle
    $ok = false; $err = 'Bu nöbet listede artık görünmüyor.';
    if ($taker) foreach (tk_my_lists($taker, substr((string)$t['date'], 0, 7)) as [$rid, $tl, $myK, $myName]) {
        if ((int)$t['roster_id'] && $rid !== (int)$t['roster_id']) continue; // isteğin listesi (kişiler birden çok listede olabilir)
        $pk = swap_key((string)$t['giver_name']);
        if (($tl[$pk]['days'][$t['date']]['kind'] ?? '') !== 'shift') continue;
        [$ok, $a, $b2] = tk_eval($tl, $myK, $myName, $pk, (string)$t['date'], swap_part($t['part'] ?? null));
        if (!$ok) $err = 'Liste değiştiği için artık kurallara uymuyor: ' . ($a ?? $b2);
        break;
    }
    if (!$ok) fail($err);
    q('INSERT INTO swap_requests (roster_id, kind, from_user, from_name, from_date, from_code, to_user, to_name, to_date, to_code, status, note, created_at, decided_at, part) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [(int)$t['roster_id'], 'give', $me['id'], $t['giver_name'], $t['date'], $t['code'], $t['taker_user'], $t['taker_name'], null, null, 'accepted', $t['note'], now(), now(), swap_part($t['part'] ?? null) ?: null]);
    $sid = insert_id();
    q("UPDATE take_requests SET status = 'accepted', decided_at = ?, swap_id = ? WHERE id = ?", [now(), $sid, $t['id']]);
    // Aynı nöbet için diğer bekleyen istekler kapanır
    foreach (all("SELECT * FROM take_requests WHERE giver_user = ? AND date = ? AND status = 'pending' AND id <> ?", [$me['id'], $t['date'], $t['id']]) as $o) {
        q("UPDATE take_requests SET status = 'closed', decided_at = ? WHERE id = ?", [now(), $o['id']]);
        notify_users(mk_full_users([(int)$o['taker_user']]), 'swap', 'Nöbet başkasına verildi', swap_fmt_date($t['date']) . ' nöbeti ' . $t['taker_name'] . ' adına devredildi.', '#/ekstra');
    }
    $r = one('SELECT * FROM swap_requests WHERE id = ?', [$sid]);
    if ($taker) notify_users([$taker], 'swap', 'Nöbet devri kabul edildi', swap_req_text($r) . ' · Sorumlu Excel’de güncelleyince listene işlenir.', '#/nobetim');
    $pubs = array_filter(module_managers('ilan'), fn($u) => (int)$u['id'] !== (int)$me['id'] && (int)$u['id'] !== (int)$t['taker_user']);
    if ($pubs) notify_users($pubs, 'swap', 'Excel’e işlenecek nöbet devri', swap_req_text($r), '#/nobetim', [
        'subject' => 'Excel’e işlenecek nöbet devri', 'heading' => 'İki kişi nöbet devrinde anlaştı',
        'lines' => [swap_req_text($r), 'Excel listesinde güncellediğinizde uygulama devri kendiliğinden işler.'], 'button' => 'Uygulamada gör'], 'notoff');
    audit($me, 'take.accept', swap_req_text($r));
    out(['requests' => tk_requests_out($me)]);
}

function a_extra_take_cancel(): void
{
    $me = need_user();
    $t = one('SELECT * FROM take_requests WHERE id = ?', [(int)i('id')]) ?? fail('İstek bulunamadı.', 404);
    if ((int)$t['taker_user'] !== (int)$me['id']) fail('Bu isteği geri çekemezsiniz.', 403);
    if ($t['status'] !== 'pending') fail('Bu istek artık beklemede değil.');
    q("UPDATE take_requests SET status = 'cancelled', decided_at = ? WHERE id = ?", [now(), $t['id']]);
    out(['requests' => tk_requests_out($me)]);
}

return [
    'extra.me' => 'a_extra_me',
    'extra.save' => 'a_extra_save',
    'extra.cancel' => 'a_extra_cancel',
    'extra.board' => 'a_extra_board',
    'extra.take' => 'a_extra_take',
    'extra.take.ask' => 'a_extra_take_ask',
    'extra.take.respond' => 'a_extra_take_respond',
    'extra.take.cancel' => 'a_extra_take_cancel',
];
