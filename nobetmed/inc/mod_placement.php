<?php
/**
 * dupcii — Günlük blok yerleşimi (Taraf sayfası #/taraf).
 *
 * O gün listede nöbetçi olan herkes bir bloğa (birime) yerleşir. Varsayılan: herkes kendi tarafında
 * (3. basamak → B blok; 2. basamak → A/C blok). Bir tarafta fazla, diğerinde eksik varsa fazla kişiler
 * karşı tarafa geçer: önce en az geçmiş olanlar, eşitlikte rastgele kura (muaflar girmez).
 * Çok birimli tarafta (A/C) dağıtım: en az çalıştığı / son nöbetinde olmadığı blok (rotasyon), eşitse kura.
 *
 * Sayım: karşı taraftaki birimde gece içeren nöbet (16-08, 24 saat) = 1 geçiş; 08-16 kaydedilir, sayılmaz.
 * Kaynaklar: placements (side_since tarihinden beri) + eski side_moves (o güne yerleşim kaydı yoksa) + placement_adjust.
 *
 * Dışa açık: placement_cross_counts() — rules_fair_stats() bunu kullanır.
 */
declare(strict_types=1);

const PL_PERIODS = ['night', 'day'];

/* =================================================================== */
/* Yapı: taraflar, birimler, o günün nöbetçileri                        */
/* =================================================================== */

function pl_sides(): array
{
    if (!function_exists('sides_cfg')) return [];
    return array_values(array_filter(sides_cfg(), fn($s) => $s['units']));
}

/** [birim => taraf anahtarı] */
function pl_unit_side(): array
{
    $m = [];
    foreach (pl_sides() as $sd) foreach ($sd['units'] as $u) $m[$u] = $sd['key'];
    return $m;
}

/** İstek içinde önbellekli liste zaman çizelgesi */
function pl_tl(int $rid, string $from, string $to): array
{
    static $c = [];
    $k = $rid . '|' . $from . '|' . $to;
    if (!isset($c[$k])) $c[$k] = $rid ? swap_timeline($rid, $from, $to) : [];
    return $c[$k];
}

function pl_shift_type(array $periods): string
{
    return count($periods) > 1 ? '24' : ($periods[0] ?? 'day');
}

/** Satırdan istemciye giden nöbet bilgisi */
function pl_row_out(array $row): array
{
    return ['code' => (string)$row['code'], 'kind' => (string)$row['kind'], 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null,
        'start' => $row['start_time'] ?: null, 'end' => $row['end_time'] ?: null];
}

/**
 * O gün nöbette olanlar: [anahtar => [key, name, title, side, roster_id, row, periods, shift]]
 * Bir kişi iki listede birden görünürse ilk taraf geçerlidir.
 */
function pl_day_people(string $date): array
{
    $out = [];
    foreach (pl_sides() as $sd) {
        if (!$sd['roster_id']) continue;
        foreach (pl_tl($sd['roster_id'], $date, $date) as $k => $p) {
            $row = $p['days'][$date] ?? null;
            if (!$row || $row['kind'] !== 'shift' || isset($out[$k])) continue;
            $per = shift_periods($row);
            if (!$per) continue;
            $out[$k] = ['key' => $k, 'name' => (string)$p['name'], 'title' => $p['title'], 'side' => $sd['key'], 'roster_id' => (int)$sd['roster_id'],
                'row' => $row, 'periods' => $per, 'shift' => pl_shift_type($per)];
        }
    }
    uasort($out, fn($a, $b) => strcmp($a['side'], $b['side']) ?: strcmp($a['name'], $b['name']));
    return $out;
}

/* =================================================================== */
/* Gereken kişi sayıları (varsayılan + güne özel)                       */
/* =================================================================== */

function pl_count_overrides(): array
{
    $j = json_decode(setting('pl_counts', '{}'), true);
    return is_array($j) ? $j : [];
}

/** [birim => ['day' => n, 'night' => n]], kaynak: 'day' (güne özel) | 'default' | 'none' */
function pl_needs(string $date): array
{
    $units = array_keys(pl_unit_side());
    $def = function_exists('needs_for_date') ? needs_for_date($date) : [];
    $ov = pl_count_overrides()[$date] ?? null;
    $out = [];
    $sum = 0;
    foreach ($units as $u) {
        $src = is_array($ov) && isset($ov[$u]) ? $ov[$u] : ($def[$u] ?? []);
        $out[$u] = ['day' => max(0, (int)($src['day'] ?? 0)), 'night' => max(0, (int)($src['night'] ?? 0))];
        $sum += $out[$u]['day'] + $out[$u]['night'];
    }
    $defOut = [];
    foreach ($units as $u) $defOut[$u] = ['day' => (int)($def[$u]['day'] ?? 0), 'night' => (int)($def[$u]['night'] ?? 0)];
    return ['needs' => $out, 'default' => $defOut, 'source' => is_array($ov) ? 'day' : ($sum ? 'default' : 'none'), 'any' => $sum > 0];
}

/* =================================================================== */
/* Kayıtlar ve sayımlar                                                 */
/* =================================================================== */

/**
 * Kişi bazlı kayıtlar: [anahtar => ['name', 'total' => geçiş, 'months' => [ym => n], 'units' => [birim => n],
 *   'hist' => [[tarih, birim], ...] (tarihe göre), 'adj_cross' => n, 'adj_units' => [birim => n]]]
 * $exclude: bu günün yerleşimi sayılmaz (o gün yeniden dağıtılırken).
 */
function pl_records(?string $exclude = null): array
{
    static $cache = [];
    $ck = ($GLOBALS['PL_GEN'] ?? 0) . '|' . (string)$exclude;
    if (isset($cache[$ck])) return $cache[$ck];
    $since = setting('side_since');
    $since = $since !== '' && valid_ymd($since) ? $since : '';
    $rec = [];
    $touch = function (string $name) use (&$rec): string {
        $k = swap_key($name);
        if (!isset($rec[$k])) $rec[$k] = ['name' => $name, 'total' => 0, 'months' => [], 'units' => [], 'hist' => [], 'adj_cross' => 0, 'adj_units' => []];
        return $k;
    };
    $placedDates = [];
    foreach (all('SELECT DISTINCT date FROM placements') as $r) $placedDates[$r['date']] = true;
    $rows = all('SELECT date, name, unit, counted FROM placements' . ($since ? ' WHERE date >= ?' : '') . ' ORDER BY date, id', $since ? [$since] : []);
    foreach ($rows as $r) {
        if ($exclude !== null && $r['date'] === $exclude) continue;
        $k = $touch((string)$r['name']);
        $rec[$k]['units'][$r['unit']] = ($rec[$k]['units'][$r['unit']] ?? 0) + 1;
        $rec[$k]['hist'][] = [$r['date'], $r['unit']];
        if ((int)$r['counted'] === 1) {
            $rec[$k]['total']++;
            $ym = substr((string)$r['date'], 0, 7);
            $rec[$k]['months'][$ym] = ($rec[$k]['months'][$ym] ?? 0) + 1;
        }
    }
    // Eski taraf kayıtları (yalnız o güne yerleşim kaydı yoksa)
    $legacy = all('SELECT date, name, unit, counted FROM side_moves' . ($since ? ' WHERE date >= ?' : '') . ' ORDER BY date, id', $since ? [$since] : []);
    foreach ($legacy as $r) {
        if (isset($placedDates[$r['date']]) || ($exclude !== null && $r['date'] === $exclude)) continue;
        $k = $touch((string)$r['name']);
        if ($r['unit'] !== '') { $rec[$k]['units'][$r['unit']] = ($rec[$k]['units'][$r['unit']] ?? 0) + 1; $rec[$k]['hist'][] = [$r['date'], $r['unit']]; }
        if ((int)$r['counted'] === 1) {
            $rec[$k]['total']++;
            $ym = substr((string)$r['date'], 0, 7);
            $rec[$k]['months'][$ym] = ($rec[$k]['months'][$ym] ?? 0) + 1;
        }
    }
    foreach (all('SELECT name, unit, cross_count, unit_count FROM placement_adjust') as $r) {
        $k = $touch((string)$r['name']);
        $rec[$k]['total'] += (int)$r['cross_count'];
        $rec[$k]['adj_cross'] += (int)$r['cross_count'];
        if ($r['unit'] && (int)$r['unit_count']) {
            $rec[$k]['units'][$r['unit']] = ($rec[$k]['units'][$r['unit']] ?? 0) + (int)$r['unit_count'];
            $rec[$k]['adj_units'][$r['unit']] = ($rec[$k]['adj_units'][$r['unit']] ?? 0) + (int)$r['unit_count'];
        }
    }
    foreach ($rec as &$x) usort($x['hist'], fn($a, $b) => strcmp($a[0], $b[0]));
    unset($x);
    return $cache[$ck] = $rec;
}

/** Önbelleği boşaltır (kayıttan sonra güncel sayımlar için) */
function pl_records_reset(): void
{
    $GLOBALS['PL_GEN'] = ($GLOBALS['PL_GEN'] ?? 0) + 1;
}

/** Kişinin $date'ten önceki son bloğu: [tarih, birim] | null */
function pl_last_before(?array $r, string $date): ?array
{
    if (!$r) return null;
    $last = null;
    foreach ($r['hist'] as $h) { if ($h[0] < $date) $last = $h; else break; }
    return $last;
}

/** Kişinin en son bloğu (tarih sınırı yok) */
function pl_last(?array $r): ?array
{
    return $r && $r['hist'] ? $r['hist'][count($r['hist']) - 1] : null;
}

/**
 * Karşı tarafa geçiş sayıları: [swap_key(ad) => toplam]. rules_fair_stats() kullanır — adı/imzası sabit.
 */
function placement_cross_counts(): array
{
    $out = [];
    foreach (pl_records() as $k => $r) $out[$k] = (int)$r['total'];
    return $out;
}

/* =================================================================== */
/* Otomatik dağıtım                                                     */
/* =================================================================== */

/**
 * $fixed: [anahtar => birim] elle sabitlenenler.
 * Dönen: ['items' => [anahtar => [unit, method, why, draw]], 'draws' => [...], 'deficits' => [...], 'extra' => [...]]
 */
function pl_auto(string $date, array $people, array $needs, bool $hasNeeds, array $fixed = []): array
{
    $sides = pl_sides();
    $u2s = pl_unit_side();
    $rec = pl_records($date);
    $sideUnits = [];
    $sideName = [];
    foreach ($sides as $sd) { $sideUnits[$sd['key']] = $sd['units']; $sideName[$sd['key']] = $sd['name']; }
    $info = [];
    foreach ($people as $k => $p) {
        $r = $rec[$k] ?? null;
        $info[$k] = ['cross' => (int)($r['total'] ?? 0), 'units' => $r['units'] ?? [], 'last' => pl_last_before($r, $date), 'exempt' => function_exists('rules_is_exempt') && rules_is_exempt($p['name'], 'kura', $date)];
    }
    $at = [];
    $unitOf = [];
    $why = [];
    $method = [];
    foreach ($people as $k => $p) {
        if (isset($fixed[$k], $u2s[$fixed[$k]])) { $unitOf[$k] = $fixed[$k]; $at[$k] = $u2s[$fixed[$k]]; $method[$k] = 'elle'; $why[$k] = 'Elle seçildi'; }
        else $at[$k] = $p['side'];
    }
    $sideNeed = [];
    foreach ($sides as $sd) foreach (PL_PERIODS as $per) { $sideNeed[$sd['key']][$per] = 0; foreach ($sd['units'] as $u) $sideNeed[$sd['key']][$per] += $needs[$u][$per] ?? 0; }
    $load = function (string $s, string $per) use (&$at, $people): int {
        $n = 0;
        foreach ($at as $k => $sk) if ($sk === $s && in_array($per, $people[$k]['periods'], true)) $n++;
        return $n;
    };
    $draws = [];
    $drawOf = [];
    if ($hasNeeds && count($sides) >= 2) {
        for ($guard = 0; $guard < 60; $guard++) {
            $moved = false;
            foreach (PL_PERIODS as $per) {
                foreach ($sides as $D) {
                    $dk = $D['key'];
                    if ($load($dk, $per) >= $sideNeed[$dk][$per]) continue;
                    foreach ($sides as $S) {
                        $sk = $S['key'];
                        if ($sk === $dk || $load($sk, $per) <= $sideNeed[$sk][$per]) continue;
                        $cands = [];
                        $exempt = [];
                        foreach ($people as $k => $p) {
                            if ($at[$k] !== $sk || $p['side'] !== $sk || isset($unitOf[$k]) || !in_array($per, $p['periods'], true)) continue;
                            $ok = true;
                            foreach ($p['periods'] as $q) if ($load($sk, $q) - 1 < $sideNeed[$sk][$q]) $ok = false;
                            if (!$ok) continue;
                            if ($info[$k]['exempt']) { $exempt[] = $p['name']; continue; }
                            $cands[] = $k;
                        }
                        if (!$cands) continue;
                        $min = min(array_map(fn($k) => $info[$k]['cross'], $cands));
                        $group = array_values(array_filter($cands, fn($k) => $info[$k]['cross'] === $min));
                        $win = $group[random_int(0, count($group) - 1)];
                        $at[$win] = $dk;
                        $d = ['period' => $per, 'from' => $sk, 'to' => $dk, 'from_name' => $sideName[$sk], 'to_name' => $sideName[$dk], 'min' => $min,
                            'pool' => array_map(fn($k) => ['name' => $people[$k]['name'], 'cross' => $info[$k]['cross'], 'code' => (string)$people[$k]['row']['code']], $cands),
                            'group' => array_map(fn($k) => $people[$k]['name'], $group), 'winner' => $people[$win]['name'], 'exempt' => $exempt, 'unit' => null];
                        $d['text'] = count($group) > 1
                            ? 'Kura: ' . count($group) . ' kişi ' . $min . ' geçişle eşitti → ' . $people[$win]['name'] . ' seçildi'
                            : $people[$win]['name'] . ' en az geçen kişi (' . $min . ' geçiş) → kurasız';
                        $drawOf[$win] = count($draws);
                        $draws[] = $d;
                        $method[$win] = count($group) > 1 ? 'kura' : 'auto';
                        $moved = true;
                        break 3;
                    }
                }
            }
            if (!$moved) break;
        }
    }
    // Taraf içinde birimlere dağıtım
    $uload = [];
    foreach ($u2s as $u => $_) foreach (PL_PERIODS as $per) $uload[$u][$per] = 0;
    $ucount = [];
    foreach ($u2s as $u => $_) $ucount[$u] = 0;
    foreach ($unitOf as $k => $u) { foreach ($people[$k]['periods'] as $per) $uload[$u][$per]++; $ucount[$u]++; }
    foreach ($sides as $sd) {
        $members = array_values(array_filter(array_keys($people), fn($k) => $at[$k] === $sd['key'] && !isset($unitOf[$k])));
        $units = $sd['units'];
        while ($members) {
            $best = null;
            $bestList = [];
            foreach ($members as $k) {
                foreach ($units as $u) {
                    $benefit = 0;
                    foreach ($people[$k]['periods'] as $per) if ($uload[$u][$per] < ($needs[$u][$per] ?? 0)) $benefit++;
                    $needTot = ($needs[$u]['day'] ?? 0) + ($needs[$u]['night'] ?? 0);
                    $over = $benefit > 0 ? 0 : ($hasNeeds ? $ucount[$u] - (int)ceil($needTot / 2) : $ucount[$u]);
                    $last = $info[$k]['last'];
                    $pref = count($units) > 1 ? ((int)($info[$k]['units'][$u] ?? 0)) * 2 + ($last && $last[1] === $u ? 1 : 0) : 0;
                    $score = [-$benefit, $over, $pref, count($people[$k]['periods']) > 1 ? 0 : 1];
                    if ($best === null || $score < $best) { $best = $score; $bestList = [[$k, $u]]; }
                    elseif ($score === $best) $bestList[] = [$k, $u];
                }
            }
            [$k, $u] = $bestList[random_int(0, count($bestList) - 1)];
            $unitOf[$k] = $u;
            foreach ($people[$k]['periods'] as $per) $uload[$u][$per]++;
            $ucount[$u]++;
            $members = array_values(array_filter($members, fn($x) => $x !== $k));
            if (!isset($method[$k])) $method[$k] = 'auto';
            if (isset($drawOf[$k])) {
                $draws[$drawOf[$k]]['unit'] = $u;
                $why[$k] = ($method[$k] === 'kura' ? 'Kura ile ' : 'En az geçen olarak ') . $sideName[$people[$k]['side']] . ' → ' . $u;
            } elseif (count($units) > 1) {
                $parts = [];
                foreach ($units as $x) $parts[] = pl_short($x) . ': ' . (int)($info[$k]['units'][$x] ?? 0);
                $last = $info[$k]['last'];
                $why[$k] = 'Daha önce ' . implode(', ', $parts) . ($last ? ' · son: ' . $last[1] : '');
            } else $why[$k] = '';
        }
    }
    // Eksik / fazla
    $deficits = [];
    $extra = [];
    foreach ($u2s as $u => $sk) foreach (PL_PERIODS as $per) {
        $need = $needs[$u][$per] ?? 0;
        if (!$hasNeeds) continue;
        if ($uload[$u][$per] < $need) $deficits[] = ['unit' => $u, 'side' => $sk, 'period' => $per, 'missing' => $need - $uload[$u][$per], 'need' => $need, 'placed' => $uload[$u][$per]];
        elseif ($uload[$u][$per] > $need) $extra[] = ['unit' => $u, 'side' => $sk, 'period' => $per, 'over' => $uload[$u][$per] - $need];
    }
    $items = [];
    foreach ($people as $k => $p) $items[$k] = ['unit' => $unitOf[$k], 'method' => $method[$k] ?? 'auto', 'why' => $why[$k] ?? '', 'draw' => $drawOf[$k] ?? null];
    return ['items' => $items, 'draws' => $draws, 'deficits' => $deficits, 'extra' => $extra];
}

/** Birim kısaltması: "A blok" -> "A" */
function pl_short(string $u): string
{
    return preg_match('/^(\S)/u', trim($u), $m) ? mb_strtoupper($m[1]) : '?';
}

/* =================================================================== */
/* Ortak çıktı                                                          */
/* =================================================================== */

function pl_date_in(): string
{
    $date = s('date', 10) ?: date('Y-m-d');
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    return $date;
}

function pl_layout(): array
{
    return array_map(fn($s) => ['key' => $s['key'], 'name' => $s['name'], 'units' => $s['units'], 'roster_id' => $s['roster_id']], pl_sides());
}

/** Kişinin istemciye giden hâli (o gün) */
function pl_person_out(array $p, ?array $r, string $date, bool $pub, array $users): array
{
    $ym = substr($date, 0, 7);
    $last = pl_last_before($r, $date);
    $u = swap_user_for($p['name'], $users);
    return ['key' => $p['key'], 'name' => $p['name'], 'title' => $p['title'], 'side' => $p['side'], 'shift' => $p['shift'], 'periods' => $p['periods'],
        'user_id' => $u ? (int)$u['id'] : null, 'cross' => (int)($r['total'] ?? 0), 'month' => (int)($r['months'][$ym] ?? 0),
        'units' => (object)($r['units'] ?? []), 'last_unit' => $last[1] ?? null, 'last_date' => $last[0] ?? null,
        'exempt' => $pub && function_exists('rules_is_exempt') ? rules_is_exempt($p['name'], 'kura', $date) : false] + pl_row_out($p['row']);
}

function pl_saved(string $date): array
{
    return all('SELECT p.*, u.name AS by_name FROM placements p LEFT JOIN users u ON u.id = p.created_by WHERE p.date = ? ORDER BY p.id', [$date]);
}

/** Kayıtlı yerleşim satırı. Yalnız son hâl: kura adayları ve gerekçe yalnız sorumlulara gider. */
function pl_saved_out(array $r, bool $pub = false): array
{
    $meta = json_decode((string)$r['meta'], true) ?: [];
    return ['key' => swap_key((string)$r['name']), 'name' => $r['name'], 'unit' => $r['unit'], 'side' => $r['side'], 'code' => $r['code'], 'period' => $r['period'],
        'method' => $r['method'], 'counted' => (bool)$r['counted'], 'pool' => $pub ? json_decode((string)$r['pool'], true) : null, 'why' => $pub ? ($meta['why'] ?? '') : ''];
}

function pl_users(): array
{
    static $u = null;
    return $u ??= all("SELECT id, name, phone, role, notify_mode, push_on, email, status FROM users WHERE status = 'active'");
}

/** Gün verisi (sayfa ve kayıt sonrası) */
function pl_day_payload(string $date, array $me): array
{
    $pub = is_publisher($me);
    $sides = pl_layout();
    $people = pl_day_people($date);
    $rec = pl_records($date);
    $recAll = pl_records();
    $users = pl_users();
    $saved = pl_saved($date);
    $n = pl_needs($date);
    $ppl = [];
    foreach ($people as $k => $p) {
        $o = pl_person_out($p, $rec[$k] ?? null, $date, $pub, $users);
        $o['cross_now'] = (int)($recAll[$k]['total'] ?? 0); // bu günün kaydı dahil
        $ppl[] = $o;
    }
    $savedOut = array_map(fn($r) => pl_saved_out($r, $pub), $saved);
    $savedKeys = array_column($savedOut, 'key');
    $stale = $saved ? array_values(array_merge(
        array_map(fn($s) => ['name' => $s['name'], 'why' => 'artık listede nöbetçi değil'], array_filter($savedOut, fn($s) => !isset($people[$s['key']]))),
        array_map(fn($p) => ['name' => $p['name'], 'why' => 'yerleştirilmedi'], array_filter($people, fn($p) => !in_array($p['key'], $savedKeys, true)))
    )) : [];
    $hol = function_exists('holiday_on') ? holiday_on($date) : null;
    return [
        'date' => $date, 'sides' => $sides, 'people' => $ppl, 'needs' => (object)$n['needs'], 'needs_default' => (object)$n['default'], 'needs_source' => $n['source'], 'has_needs' => $n['any'],
        'day_type' => function_exists('day_type') ? day_type($date) : 'weekday', 'holiday' => $hol,
        'saved' => $savedOut, 'saved_by' => $saved ? $saved[0]['by_name'] : null, 'saved_at' => $saved ? $saved[0]['created_at'] : null, 'stale' => $stale,
        'can_edit' => $pub, 'can_admin' => is_admin($me), 'since' => setting('side_since') ?: null,
    ];
}

/* =================================================================== */
/* API                                                                  */
/* =================================================================== */

function a_placement_day(): void
{
    $me = need_user();
    out(pl_day_payload(pl_date_in(), $me));
}

/** Gelen 'fixed' / 'items' adlarını o günün kişilerine eşler */
function pl_match_person(array $people, string $name): ?string
{
    $k = swap_key($name);
    if (isset($people[$k])) return $k;
    foreach ($people as $pk => $p) if (names_match($p['name'], $name)) return $pk;
    return null;
}

function a_placement_auto(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $people = pl_day_people($date);
    if (count(pl_sides()) < 2) fail('Önce tarafları tanımlayın (Taraflar).');
    if (!$people) fail('Bu gün listede nöbetçi görünmüyor.');
    $u2s = pl_unit_side();
    $fixed = [];
    foreach (arr('fixed') as $name => $unit) {
        $k = pl_match_person($people, (string)$name);
        if ($k === null) fail('“' . $name . '” o gün listede nöbetçi görünmüyor.');
        if (!isset($u2s[(string)$unit])) fail('Birim bulunamadı: ' . $unit);
        $fixed[$k] = (string)$unit;
    }
    $n = pl_needs($date);
    $res = pl_auto($date, $people, $n['needs'], $n['any'], $fixed);
    // Öneri oturumda saklanır: kayıtta yöntem (otomatik/kura) ve kura adayları buradan doğrulanır
    $prop = [];
    foreach ($res['items'] as $k => $it) $prop[$k] = ['unit' => $it['unit'], 'method' => $it['method'], 'why' => $it['why'], 'pool' => $it['draw'] !== null ? $res['draws'][$it['draw']] : null];
    $all = $_SESSION['pl_prop'] ?? [];
    unset($all[$date]);
    $all[$date] = $prop;
    $_SESSION['pl_prop'] = array_slice($all, -6, null, true);
    $real = array_values(array_filter($res['draws'], fn($d) => count($d['group']) > 1));
    if ($real) audit($me, 'placement.draw', $date, implode(' · ', array_map(fn($d) => $d['winner'] . ' → ' . $d['unit'] . ' (eşit: ' . implode(', ', $d['group']) . ')', $real)));
    $items = [];
    foreach ($res['items'] as $k => $it) $items[] = ['key' => $k, 'name' => $people[$k]['name'], 'unit' => $it['unit'], 'method' => $it['method'], 'why' => $it['why'], 'draw' => $it['draw']];
    out(['date' => $date, 'items' => $items, 'draws' => $res['draws'], 'deficits' => $res['deficits'], 'extra' => $res['extra'], 'has_needs' => $n['any']]);
}

function a_placement_save(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $people = pl_day_people($date);
    if (!$people) fail('Bu gün listede nöbetçi görünmüyor.');
    $u2s = pl_unit_side();
    $sideName = array_column(pl_sides(), 'name', 'key');
    $prop = $_SESSION['pl_prop'][$date] ?? [];
    $prev = [];
    foreach (pl_saved($date) as $r) $prev[swap_key((string)$r['name'])] = $r;
    $chosen = [];
    foreach (arr('items') as $it) {
        if (!is_array($it)) continue;
        $name = mb_substr(trim((string)($it['name'] ?? '')), 0, 120);
        $unit = (string)($it['unit'] ?? '');
        $k = pl_match_person($people, $name);
        if ($k === null) fail('“' . $name . '” o gün listede nöbetçi görünmüyor.');
        if (isset($chosen[$k])) fail('“' . $people[$k]['name'] . '” iki kez yerleştirilmiş.');
        if (!isset($u2s[$unit])) fail('Birim bulunamadı: ' . $unit);
        $chosen[$k] = $unit;
    }
    $missing = array_diff_key($people, $chosen);
    if ($missing) fail('Herkesi bir bloğa yerleştirin: ' . implode(', ', array_map(fn($p) => $p['name'], $missing)) . '.');
    $rows = [];
    db()->beginTransaction();
    try {
        q('DELETE FROM placements WHERE date = ?', [$date]);
        foreach ($chosen as $k => $unit) {
            $p = $people[$k];
            $method = 'elle';
            $pool = null;
            $why = '';
            if (isset($prop[$k]) && $prop[$k]['unit'] === $unit) { $method = $prop[$k]['method']; $pool = $prop[$k]['pool']; $why = $prop[$k]['why']; }
            elseif (isset($prev[$k]) && $prev[$k]['unit'] === $unit) { $method = $prev[$k]['method']; $pool = json_decode((string)$prev[$k]['pool'], true); $why = (json_decode((string)$prev[$k]['meta'], true) ?: [])['why'] ?? ''; }
            $cross = $u2s[$unit] !== $p['side'];
            $counted = $cross && in_array('night', $p['periods'], true) ? 1 : 0;
            $u = swap_user_for($p['name'], pl_users());
            q('INSERT INTO placements (date, name, user_id, roster_id, side, unit, code, period, method, counted, pool, created_by, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$date, $p['name'], $u ? (int)$u['id'] : null, $p['roster_id'], $p['side'], $unit, (string)$p['row']['code'], $p['shift'], $method, $counted,
                    $pool ? json_encode($pool, JSON_UNESCAPED_UNICODE) : null, $me['id'], now(), json_encode(['why' => $why, 'to_side' => $u2s[$unit]], JSON_UNESCAPED_UNICODE)]);
            $rows[] = ['p' => $p, 'unit' => $unit, 'cross' => $cross, 'counted' => $counted, 'method' => $method, 'user' => $u, 'changed' => !isset($prev[$k]) || $prev[$k]['unit'] !== $unit];
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    unset($_SESSION['pl_prop'][$date]);
    // Karşı tarafa yerleşenlere bildirim (bugün / yarın, yalnız değişiklik varsa)
    $today = date('Y-m-d');
    $tomorrow = date('Y-m-d', strtotime('+1 day'));
    $sent = 0;
    if ($date === $today || $date === $tomorrow) {
        foreach ($rows as $r) {
            if (!$r['cross'] || !$r['changed'] || !$r['user'] || (int)$r['user']['id'] === (int)$me['id']) continue;
            notify_users([$r['user']], 'side', ($date === $today ? 'Bugün ' : 'Yarın ') . $r['unit'] . '’ta çalışacaksın',
                ($r['method'] === 'kura' ? 'Kura sonucu' : 'Blok yerleşimi') . ' · ' . $r['p']['row']['code'] . ' · ' . ($sideName[$r['p']['side']] ?? '') . ' → ' . $r['unit']
                . ($r['counted'] ? ' · karşı tarafa geçiş olarak sayıldı' : ''), '#/taraf/' . $date, null);
            $sent++;
        }
    }
    $byUnit = [];
    foreach ($rows as $r) $byUnit[$r['unit']][] = $r['p']['name'] . ($r['cross'] ? ' (' . ($r['method'] === 'kura' ? 'kura' : ($r['method'] === 'elle' ? 'elle' : 'oto')) . ')' : '');
    audit($me, 'placement.save', $date, implode(' · ', array_map(fn($u, $l) => pl_short($u) . ': ' . implode(', ', $l), array_keys($byUnit), $byUnit)));
    pl_records_reset();
    out(['saved_count' => count($rows), 'notified' => $sent] + pl_day_payload($date, $me));
}

function a_placement_clear(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $n = (int)val('SELECT COUNT(*) FROM placements WHERE date = ?', [$date]);
    if (!$n) fail('Bu güne kayıtlı yerleşim yok.');
    q('DELETE FROM placements WHERE date = ?', [$date]);
    audit($me, 'placement.clear', $date, $n . ' kişi');
    pl_records_reset();
    out(pl_day_payload($date, $me));
}

/** Güne özel gereken sayılar: counts = {birim: {day, night}} | null (varsayılana dön) */
function a_placement_counts(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $u2s = pl_unit_side();
    $all = pl_count_overrides();
    $keep = date('Y-m-d', strtotime('-120 days'));
    foreach (array_keys($all) as $d) if (!valid_ymd((string)$d) || $d < $keep) unset($all[$d]);
    $in = arr('counts');
    if (!$in) {
        unset($all[$date]);
        audit($me, 'placement.counts', $date, 'varsayılana döndü');
    } else {
        $c = [];
        foreach ($u2s as $u => $_) {
            $x = is_array($in[$u] ?? null) ? $in[$u] : [];
            $c[$u] = ['day' => max(0, min(30, (int)($x['day'] ?? 0))), 'night' => max(0, min(30, (int)($x['night'] ?? 0)))];
        }
        $all[$date] = $c;
        audit($me, 'placement.counts', $date, implode(' · ', array_map(fn($u, $x) => pl_short($u) . ' ' . $x['day'] . '/' . $x['night'], array_keys($c), $c)));
    }
    ksort($all);
    set_setting('pl_counts', json_encode((object)$all, JSON_UNESCAPED_UNICODE));
    $n = pl_needs($date);
    out(['needs' => (object)$n['needs'], 'needs_default' => (object)$n['default'], 'needs_source' => $n['source'], 'has_needs' => $n['any']]);
}

/** Ay görünümü: tablo, matris, geçmiş, düzeltmeler, muaflar */
function a_placement_month(): void
{
    $me = need_user();
    $pub = is_publisher($me);
    $ym = s('month', 7) ?: date('Y-m');
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) fail('Geçersiz ay.');
    $from = $ym . '-01';
    $to = date('Y-m-t', strtotime($from));
    $sides = pl_layout();
    $u2s = pl_unit_side();
    $rec = pl_records();
    // Kayıtlar (ay)
    $placed = [];
    $log = [];
    foreach (all('SELECT p.*, u.name AS by_name FROM placements p LEFT JOIN users u ON u.id = p.created_by WHERE p.date >= ? AND p.date <= ? ORDER BY p.date, p.id', [$from, $to]) as $r) {
        $k = swap_key((string)$r['name']);
        $cross = ($u2s[$r['unit']] ?? $r['side']) !== $r['side'];
        $placed[$r['date']][$k] = ['unit' => $r['unit'], 'm' => $r['method'], 'c' => (int)$r['counted'], 'x' => $cross ? 1 : 0];
        if (!isset($log[$r['date']])) $log[$r['date']] = ['date' => $r['date'], 'by' => $r['by_name'], 'at' => $r['created_at'], 'n' => 0, 'items' => [], 'legacy' => false];
        $log[$r['date']]['n']++;
        if ($cross || $r['method'] === 'kura') $log[$r['date']]['items'][] = ['name' => $r['name'], 'unit' => $r['unit'], 'from' => $r['side'], 'to' => $u2s[$r['unit']] ?? '', 'code' => $r['code'],
            'method' => $r['method'], 'counted' => (bool)$r['counted'], 'pool' => $pub ? json_decode((string)$r['pool'], true) : null];
    }
    foreach (all('SELECT m.*, u.name AS by_name FROM side_moves m LEFT JOIN users u ON u.id = m.created_by WHERE m.date >= ? AND m.date <= ? ORDER BY m.date, m.id', [$from, $to]) as $m) {
        if (isset($placed[$m['date']]) && empty($log[$m['date']]['legacy'])) continue;
        $k = swap_key((string)$m['name']);
        $placed[$m['date']][$k] = ['unit' => $m['unit'], 'm' => $m['method'], 'c' => (int)$m['counted'], 'x' => $m['from_side'] !== $m['to_side'] ? 1 : 0, 'old' => 1];
        if (!isset($log[$m['date']])) $log[$m['date']] = ['date' => $m['date'], 'by' => $m['by_name'], 'at' => $m['created_at'], 'n' => 0, 'items' => [], 'legacy' => true];
        $pool = json_decode((string)$m['pool'], true);
        $log[$m['date']]['items'][] = ['name' => $m['name'], 'unit' => $m['unit'], 'from' => $m['from_side'], 'to' => $m['to_side'], 'code' => $m['code'], 'method' => $m['method'],
            'counted' => (bool)$m['counted'], 'pool' => $pub && $pool && isset($pool['pool']) ? ['pool' => array_map(fn($x) => ['name' => $x['name'], 'cross' => $x['total'] ?? 0, 'code' => $x['code'] ?? ''], $pool['pool']), 'group' => $pool['group'] ?? []] : null];
    }
    ksort($log);
    // Kişiler (ay listeleri)
    $outSides = [];
    $seen = [];
    foreach ($sides as $sd) {
        $ppl = [];
        foreach ($sd['roster_id'] ? pl_tl($sd['roster_id'], $from, $to) : [] as $k => $p) {
            if (isset($seen[$k])) continue;
            $seen[$k] = $sd['key'];
            $days = [];
            foreach ($p['days'] as $d => $row) $days[(int)substr($d, 8, 2)] = pl_row_out($row);
            $ppl[] = ['key' => $k, 'name' => $p['name'], 'title' => $p['title'], 'days' => (object)$days];
        }
        usort($ppl, fn($a, $b) => strcmp($a['name'], $b['name']));
        $outSides[] = $sd + ['people' => $ppl];
    }
    // Kim kaç kez
    $stats = [];
    $add = function (string $k, string $name, ?string $side) use (&$stats, $rec, $ym) {
        $r = $rec[$k] ?? null;
        $last = pl_last($r);
        $stats[] = ['key' => $k, 'name' => $name, 'side' => $side, 'month' => (int)($r['months'][$ym] ?? 0), 'total' => (int)($r['total'] ?? 0),
            'units' => (object)($r['units'] ?? []), 'last_unit' => $last[1] ?? null, 'last_date' => $last[0] ?? null, 'adj' => (int)($r['adj_cross'] ?? 0) !== 0 || !empty($r['adj_units'])];
    };
    foreach ($outSides as $sd) foreach ($sd['people'] as $p) $add($p['key'], $p['name'], $sd['key']);
    foreach ($rec as $k => $r) if (!isset($seen[$k]) && ($r['adj_cross'] || $r['adj_units'])) $add($k, $r['name'], null);
    $adjust = array_map(fn($a) => ['id' => (int)$a['id'], 'name' => $a['name'], 'unit' => $a['unit'], 'cross_count' => (int)$a['cross_count'], 'unit_count' => (int)$a['unit_count'],
        'note' => $pub ? $a['note'] : null, 'by' => $a['by_name'], 'at' => $a['created_at']],
        all('SELECT a.*, u.name AS by_name FROM placement_adjust a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.name, a.id'));
    out(['month' => $ym, 'days' => (int)date('t', strtotime($from)), 'sides' => $outSides, 'placed' => (object)$placed, 'stats' => $stats, 'log' => array_values($log),
        'adjust' => $adjust, 'exempt' => $pub && function_exists('rules_exempt_list') ? rules_exempt_list() : [], 'since' => setting('side_since') ?: null,
        'holidays' => function_exists('holidays_between') ? (object)holidays_between($from, $to) : (object)[], 'can_edit' => $pub, 'can_admin' => is_admin($me)]);
}

/** Geçmişe dönük elle sayı: {id?, name, cross_count, unit?, unit_count, note} */
function a_placement_adjust_save(): void
{
    $me = need_publisher();
    $name = s('name', 120);
    if (mb_strlen($name) < 3) fail('Kişiyi seçin.');
    $unit = s('unit', 40);
    if ($unit !== '' && !isset(pl_unit_side()[$unit])) fail('Birim bulunamadı.');
    $cross = max(-50, min(200, (int)(i('cross_count') ?? 0)));
    $uc = $unit !== '' ? max(-50, min(500, (int)(i('unit_count') ?? 0))) : 0;
    if (!$cross && !$uc) fail('Bir sayı girin (geçiş veya blok sayısı).');
    $note = s('note', 200) ?: null;
    $u = swap_user_for($name, pl_users());
    $id = (int)(i('id') ?? 0);
    $side = null;
    foreach (pl_sides() as $sd) if ($sd['roster_id'] && val('SELECT 1 FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.name = ? LIMIT 1', [$sd['roster_id'], $name])) { $side = $sd['key']; break; }
    if ($id) {
        one('SELECT id FROM placement_adjust WHERE id = ?', [$id]) ?? fail('Kayıt bulunamadı.', 404);
        q('UPDATE placement_adjust SET name = ?, user_id = ?, side = ?, unit = ?, cross_count = ?, unit_count = ?, note = ? WHERE id = ?',
            [$name, $u ? (int)$u['id'] : null, $side, $unit ?: null, $cross, $uc, $note, $id]);
    } else {
        q('INSERT INTO placement_adjust (name, user_id, side, unit, cross_count, unit_count, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$name, $u ? (int)$u['id'] : null, $side, $unit ?: null, $cross, $uc, $note, $me['id'], now()]);
        $id = insert_id();
    }
    audit($me, 'placement.adjust', $name, ($cross ? 'geçiş ' . ($cross > 0 ? '+' : '') . $cross : '') . ($uc ? ($cross ? ' · ' : '') . $unit . ' ' . ($uc > 0 ? '+' : '') . $uc : '') . ($note ? ' · ' . $note : ''));
    pl_records_reset();
    $r = pl_records()[swap_key($name)] ?? null;
    out(['id' => $id, 'total' => (int)($r['total'] ?? 0)]);
}

function a_placement_adjust_delete(): void
{
    $me = need_publisher();
    $a = one('SELECT * FROM placement_adjust WHERE id = ?', [(int)(i('id') ?? 0)]) ?? fail('Kayıt bulunamadı.', 404);
    q('DELETE FROM placement_adjust WHERE id = ?', [$a['id']]);
    audit($me, 'placement.adjust', $a['name'], 'silindi (geçiş ' . $a['cross_count'] . ($a['unit'] ? ' · ' . $a['unit'] . ' ' . $a['unit_count'] : '') . ')');
    out([]);
}

/** Ana sayfa kartı: bugünün kayıtlı yerleşimi */
function a_placement_today(): void
{
    $me = need_user();
    $sides = pl_layout();
    if (count($sides) < 2) out(['sides' => []]);
    $date = date('Y-m-d');
    $rec = pl_records();
    $saved = array_map(function ($s) use ($rec) {
        return pl_saved_out($s, false) + ['cross_total' => (int)($rec[swap_key((string)$s['name'])]['total'] ?? 0)];
    }, pl_saved($date));
    $mine = null;
    foreach ($saved as $s) if (names_match((string)$s['name'], (string)$me['name'])) $mine = $s['unit'];
    $onDuty = $saved ? count($saved) : count(pl_day_people($date));
    out(['date' => $date, 'sides' => $sides, 'saved' => $saved, 'on_duty' => $onDuty, 'mine' => $mine, 'can_edit' => is_publisher($me)]);
}

/* =================================================================== */
/* Açılış verisi: kişinin son/sonraki 40 gün blokları                   */
/* =================================================================== */

function pl_my_blocks(array $me): array
{
    $from = date('Y-m-d', strtotime('-40 days'));
    $to = date('Y-m-d', strtotime('+40 days'));
    $out = [];
    foreach (all('SELECT date, name, user_id, unit FROM placements WHERE date >= ? AND date <= ? ORDER BY date', [$from, $to]) as $r) {
        if ((int)$r['user_id'] === (int)$me['id'] || names_match((string)$r['name'], (string)$me['name'])) $out[$r['date']] = $r['unit'];
    }
    return $out;
}

$GLOBALS['NM_BOOT'][] = fn(array $me): array => ['my_blocks' => (object)pl_my_blocks($me)];

return [
    'placement.day' => 'a_placement_day',
    'placement.auto' => 'a_placement_auto',
    'placement.save' => 'a_placement_save',
    'placement.clear' => 'a_placement_clear',
    'placement.counts' => 'a_placement_counts',
    'placement.month' => 'a_placement_month',
    'placement.today' => 'a_placement_today',
    'placement.adjust.save' => 'a_placement_adjust_save',
    'placement.adjust.delete' => 'a_placement_adjust_delete',
];
