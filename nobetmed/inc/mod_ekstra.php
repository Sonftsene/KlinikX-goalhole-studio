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
    foreach ($rows as $r) {
        if (!names_match((string)$r['name'], $name)) continue;
        $rid = (int)$r['roster_id'];
        $tl = mk_tl($rid, mk_shift_day($first, -40), mk_shift_day($last, 40));
        $k = swap_key((string)$r['name']);
        if (isset($tl[$k])) return [$rid, $tl, $k];
    }
    return null;
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
    $row = co_row($shift, [$rid]);
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

return [
    'extra.me' => 'a_extra_me',
    'extra.save' => 'a_extra_save',
    'extra.cancel' => 'a_extra_cancel',
    'extra.board' => 'a_extra_board',
];
