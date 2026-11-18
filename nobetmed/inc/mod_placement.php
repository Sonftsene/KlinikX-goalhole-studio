<?php
/**
 * dupcii — Günlük blok yerleşimi (Taraf sayfası #/taraf).
 *
 * O gün listede nöbetçi olan herkes bir bloğa (birime) yerleşir. Varsayılan: herkes kendi tarafında
 * (3. basamak → B blok; 2. basamak → A/C blok). Bir tarafta fazla, diğerinde eksik varsa fazla kişiler
 * karşı tarafa geçer: önce en az geçmiş olanlar, eşitlikte rastgele kura (muaflar, Sorumlular ekibi girmez).
 * Çok birimli tarafta (A/C) dağıtım: en az çalıştığı / son nöbetinde olmadığı blok (rotasyon), eşitse kura.
 *
 * Sorumlular ekibi: hiçbir tarafa ait olmayan ayrı birim (@sorumlu). Sabit üyeleri nöbetteyse otomatik oraya yerleşir.
 * Bir kişi bir günde en fazla 2 yerde olabilir (dönemler çakışmadan: gündüz + gece).
 *
 * Kayıt satırı (placements): kişi × yer × dönem (day | night | 24) × durum:
 *   work (çalışıyor) | off (oflandı, eve gönderildi) | called (listede yokken çağrıldı) | standby (nöbete gelecek kişi)
 * Sayım: karşı taraftaki blokta gece içeren (night/24) work/called satırı = 1 geçiş. Sorumlular, ofl. ve 08-16 sayılmaz.
 * Kaynaklar: placements (side_since tarihinden beri) + eski side_moves (o güne yerleşim kaydı yoksa) + placement_adjust.
 *
 * Dışa açık: placement_cross_counts() — rules_fair_stats() bunu kullanır.
 */
declare(strict_types=1);

const PL_PERIODS = ['night', 'day'];
const PL_TEAM = '@sorumlu';

/* =================================================================== */
/* Yapı: taraflar, birimler, ekip, o günün nöbetçileri                  */
/* =================================================================== */

function pl_sides(): array
{
    if (!function_exists('sides_cfg')) return [];
    return array_values(array_filter(sides_cfg(), fn($s) => $s['units']));
}

/** Bloklar: [birim => taraf anahtarı] (Sorumlular hariç) */
function pl_unit_side(): array
{
    $m = [];
    foreach (pl_sides() as $sd) foreach ($sd['units'] as $u) $m[$u] = $sd['key'];
    return $m;
}

/** Sorumlular ekibi ayarı */
function pl_team(): array
{
    $j = json_decode(setting('pl_team', '{}'), true);
    $j = is_array($j) ? $j : [];
    $members = [];
    foreach ((array)($j['members'] ?? []) as $n) if (is_string($n) && trim($n) !== '' && !in_array(trim($n), $members, true)) $members[] = trim($n);
    $need = is_array($j['need'] ?? null) ? $j['need'] : [];
    return ['key' => PL_TEAM, 'name' => trim((string)($j['name'] ?? '')) ?: 'Sorumlular', 'members' => $members,
        'need' => ['day' => max(0, (int)($need['day'] ?? 0)), 'night' => max(0, (int)($need['night'] ?? 0))]];
}

function pl_is_team_member(string $name): bool
{
    foreach (pl_team()['members'] as $m) if (names_match($m, $name)) return true;
    return false;
}

/** Tüm yerleşim birimleri: [birim => taraf] (Sorumlular: '') */
function pl_units_all(): array
{
    return pl_unit_side() + [PL_TEAM => ''];
}

function pl_unit_label(string $u): string
{
    return $u === PL_TEAM ? pl_team()['name'] : $u;
}

function pl_per_list(string $p): array
{
    return $p === '24' ? ['day', 'night'] : [$p];
}

function pl_excluded(string $name): bool
{
    return function_exists('rules_is_excluded') && rules_is_excluded($name);
}

/** İstek içinde önbellekli liste zaman çizelgesi (swap_timeline hesaplara dahil edilmeyenleri zaten atlar) */
function pl_tl(int $rid, string $from, string $to): array
{
    static $c = [];
    $k = $rid . '|' . $from . '|' . $to;
    if (!isset($c[$k])) {
        $tl = $rid ? swap_timeline($rid, $from, $to) : [];
        foreach ($tl as $key => $p) if (pl_excluded((string)$p['name'])) unset($tl[$key]);
        $c[$k] = $tl;
    }
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
 * O gün nöbette olanlar: [anahtar => [key, name, title, side, roster_id, row, periods, shift, team]]
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
                'row' => $row, 'periods' => $per, 'shift' => pl_shift_type($per), 'team' => pl_is_team_member((string)$p['name'])];
        }
    }
    uasort($out, fn($a, $b) => strcmp($a['side'], $b['side']) ?: strcmp($a['name'], $b['name']));
    return $out;
}

/** Ayın liste kişileri (çağrılacak/nöbete gelecek seçimi için): [anahtar => [name, side, roster_id]] */
function pl_month_people(string $date): array
{
    $from = substr($date, 0, 7) . '-01';
    $to = date('Y-m-t', strtotime($from));
    $out = [];
    foreach (pl_sides() as $sd) {
        if (!$sd['roster_id']) continue;
        foreach (pl_tl($sd['roster_id'], $from, $to) as $k => $p) if (!isset($out[$k])) $out[$k] = ['key' => $k, 'name' => (string)$p['name'], 'side' => $sd['key'], 'roster_id' => (int)$sd['roster_id']];
    }
    return $out;
}

/** Listede o gün nöbetçi olmayan bir adın evi (ayın listelerinden): [name, side, roster_id] */
function pl_home_of(string $name, string $date): array
{
    $mp = pl_month_people($date);
    $k = swap_key($name);
    if (isset($mp[$k])) return $mp[$k];
    foreach ($mp as $p) if (names_match($p['name'], $name)) return $p;
    return ['key' => $k, 'name' => $name, 'side' => '', 'roster_id' => null];
}

/* =================================================================== */
/* Gereken kişi sayıları (varsayılan + güne özel)                       */
/* =================================================================== */

function pl_count_overrides(): array
{
    $j = json_decode(setting('pl_counts', '{}'), true);
    return is_array($j) ? $j : [];
}

/** [birim => ['day' => n, 'night' => n]] (Sorumlular dahil), kaynak: 'day' (güne özel) | 'default' | 'none' */
function pl_needs(string $date): array
{
    $def = function_exists('needs_for_date') ? needs_for_date($date) : [];
    $def[PL_TEAM] = pl_team()['need'];
    $ov = pl_count_overrides()[$date] ?? null;
    $out = [];
    $defOut = [];
    $sum = 0;
    foreach (array_keys(pl_units_all()) as $u) {
        $src = is_array($ov) && isset($ov[$u]) ? $ov[$u] : ($def[$u] ?? []);
        $out[$u] = ['day' => max(0, (int)($src['day'] ?? 0)), 'night' => max(0, (int)($src['night'] ?? 0))];
        $defOut[$u] = ['day' => (int)($def[$u]['day'] ?? 0), 'night' => (int)($def[$u]['night'] ?? 0)];
        $sum += $out[$u]['day'] + $out[$u]['night'];
    }
    return ['needs' => $out, 'default' => $defOut, 'source' => is_array($ov) ? 'day' : ($sum ? 'default' : 'none'), 'any' => $sum > 0];
}

/* =================================================================== */
/* Kayıtlar ve sayımlar                                                 */
/* =================================================================== */

/**
 * Kişi bazlı kayıtlar: [anahtar => ['name', 'total' => geçiş, 'months' => [ym => n], 'units' => [birim => n],
 *   'hist' => [[tarih, birim], ...] (tarihe göre), 'adj_cross' => n, 'adj_units' => [birim => n]]]
 * Yalnız çalışılan satırlar (work/called) sayılır. $exclude: bu günün yerleşimi sayılmaz (o gün yeniden dağıtılırken).
 */
function pl_records(?string $exclude = null): array
{
    static $cache = [];
    $ck = ($GLOBALS['PL_GEN'] ?? 0) . '|' . (string)$exclude;
    if (isset($cache[$ck])) return $cache[$ck];
    $since = setting('side_since');
    $since = $since !== '' && valid_ymd($since) ? $since : '';
    $rec = [];
    $touch = function (string $name) use (&$rec): ?string {
        if (pl_excluded($name)) return null;
        $k = swap_key($name);
        if (!isset($rec[$k])) $rec[$k] = ['name' => $name, 'total' => 0, 'months' => [], 'units' => [], 'hist' => [], 'adj_cross' => 0, 'adj_units' => []];
        return $k;
    };
    $placedDates = [];
    foreach (all('SELECT DISTINCT date FROM placements') as $r) $placedDates[$r['date']] = true;
    $rows = all("SELECT date, name, unit, counted FROM placements WHERE status IN ('work', 'called')" . ($since ? ' AND date >= ?' : '') . ' ORDER BY date, id', $since ? [$since] : []);
    $seenUnit = [];
    foreach ($rows as $r) {
        if ($exclude !== null && $r['date'] === $exclude) continue;
        $k = $touch((string)$r['name']);
        if ($k === null) continue;
        $su = $k . '|' . $r['date'] . '|' . $r['unit'];
        if (!isset($seenUnit[$su])) {
            $seenUnit[$su] = true;
            $rec[$k]['units'][$r['unit']] = ($rec[$k]['units'][$r['unit']] ?? 0) + 1;
            $rec[$k]['hist'][] = [$r['date'], $r['unit']];
        }
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
        if ($k === null) continue;
        if ($r['unit'] !== '') { $rec[$k]['units'][$r['unit']] = ($rec[$k]['units'][$r['unit']] ?? 0) + 1; $rec[$k]['hist'][] = [$r['date'], $r['unit']]; }
        if ((int)$r['counted'] === 1) {
            $rec[$k]['total']++;
            $ym = substr((string)$r['date'], 0, 7);
            $rec[$k]['months'][$ym] = ($rec[$k]['months'][$ym] ?? 0) + 1;
        }
    }
    foreach (all('SELECT name, unit, cross_count, unit_count FROM placement_adjust') as $r) {
        $k = $touch((string)$r['name']);
        if ($k === null) continue;
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

/** Bir satır karşıya geçiş olarak sayılır mı */
function pl_counts_cross(string $homeSide, string $unit, string $period, string $status): bool
{
    if ($status !== 'work' && $status !== 'called') return false;
    if ($unit === PL_TEAM || $homeSide === '') return false;
    $us = pl_unit_side()[$unit] ?? '';
    return $us !== '' && $us !== $homeSide && in_array('night', pl_per_list($period), true);
}

/* =================================================================== */
/* Parça (yer × dönem × durum) doğrulama                                */
/* =================================================================== */

/**
 * İstemciden gelen parçaları doğrular ve sadeleştirir. $onDuty: o gün listede nöbetçi mi (değilse "çağrıldı").
 * En fazla 2 yer; dönemler çakışamaz (gündüz + gece olur, 24 + başka olmaz). Aynı yer ve durumda gündüz + gece → 24.
 */
function pl_norm_segs($segs, bool $onDuty, string $who): array
{
    $units = pl_units_all();
    $out = [];
    foreach (is_array($segs) ? array_slice($segs, 0, 6) : [] as $s) {
        if (!is_array($s)) continue;
        $unit = (string)($s['unit'] ?? '');
        $per = (string)($s['period'] ?? '');
        $st = (string)($s['status'] ?? 'work');
        if (!isset($units[$unit])) fail($who . ': birim bulunamadı (' . $unit . ').');
        if (!in_array($per, ['day', 'night', '24'], true)) fail($who . ': geçersiz dönem.');
        if ($onDuty) {
            if (!in_array($st, ['work', 'off', 'called'], true)) fail($who . ': geçersiz durum.');
            if ($st === 'called') $st = 'work';
        } else {
            if ($st === 'off') fail($who . ' o gün listede nöbetçi değil; oflamak yerine kaldırın.');
            $st = 'called';
        }
        $out[] = ['unit' => $unit, 'period' => $per, 'status' => $st];
    }
    if (!$out) fail($who . ': en az bir yer seçin.');
    if (count($out) > 2) fail($who . ': bir kişi bir günde en fazla 2 yerde olabilir.');
    $seen = [];
    foreach ($out as $s) foreach (pl_per_list($s['period']) as $p) {
        if (isset($seen[$p])) fail($who . ': dönemler çakışıyor (aynı saatte iki yer olamaz).');
        $seen[$p] = true;
    }
    if (count($out) === 2 && $out[0]['unit'] === $out[1]['unit'] && $out[0]['status'] === $out[1]['status']) $out = [['unit' => $out[0]['unit'], 'period' => '24', 'status' => $out[0]['status']]];
    usort($out, fn($a, $b) => ($a['period'] === 'night') <=> ($b['period'] === 'night'));
    return $out;
}

/** Parçaların karşılaştırma anahtarı */
function pl_segs_sig(array $segs): string
{
    return implode('|', array_map(fn($s) => $s['unit'] . ':' . $s['period'] . ':' . $s['status'], $segs));
}

/* =================================================================== */
/* Otomatik dağıtım                                                     */
/* =================================================================== */

/**
 * $keep: [anahtar => parçalar] elle bırakılan nöbetçiler (oflananlar dahil; kura havuzuna girmez).
 * $called: [['name', 'segs']] listede yokken çağrılanlar (kapsama sayılır).
 * Dönen: ['items' => [anahtar => [segs, method, why, draw]], 'draws' => [...], 'deficits' => [...], 'extra' => [...]]
 */
function pl_auto(string $date, array $people, array $needs, bool $hasNeeds, array $keep = [], array $called = []): array
{
    $sides = pl_sides();
    $u2s = pl_unit_side();
    $team = pl_team();
    $rec = pl_records($date);
    $sideName = [];
    foreach ($sides as $sd) $sideName[$sd['key']] = $sd['name'];
    $info = [];
    foreach ($people as $k => $p) {
        $r = $rec[$k] ?? null;
        $info[$k] = ['cross' => (int)($r['total'] ?? 0), 'units' => $r['units'] ?? [], 'last' => pl_last_before($r, $date), 'exempt' => function_exists('rules_is_exempt') && rules_is_exempt($p['name'], 'kura', $date)];
    }
    $uload = [];
    foreach (pl_units_all() as $u => $_) foreach (PL_PERIODS as $per) $uload[$u][$per] = 0;
    $ucount = array_fill_keys(array_keys(pl_units_all()), 0);
    $addSegs = function (array $segs) use (&$uload, &$ucount) {
        foreach ($segs as $s) {
            if ($s['status'] === 'off') continue;
            foreach (pl_per_list($s['period']) as $per) $uload[$s['unit']][$per]++;
            $ucount[$s['unit']]++;
        }
    };
    $items = [];
    foreach ($keep as $k => $segs) { $addSegs($segs); $items[$k] = ['segs' => $segs, 'method' => 'elle', 'why' => 'Elle', 'draw' => null]; }
    foreach ($called as $c) $addSegs($c['segs']);
    // Sorumlular ekibinin sabit üyeleri: her zaman ekibe
    $at = [];
    foreach ($people as $k => $p) {
        if (isset($keep[$k])) continue;
        if ($p['team']) {
            $segs = [['unit' => PL_TEAM, 'period' => $p['shift'], 'status' => 'work']];
            $addSegs($segs);
            $items[$k] = ['segs' => $segs, 'method' => 'auto', 'why' => $team['name'] . ' ekibi (sabit üye)', 'draw' => null];
            continue;
        }
        $at[$k] = $p['side'];
    }
    $sideNeed = [];
    foreach ($sides as $sd) foreach (PL_PERIODS as $per) { $sideNeed[$sd['key']][$per] = 0; foreach ($sd['units'] as $u) $sideNeed[$sd['key']][$per] += $needs[$u][$per] ?? 0; }
    $sideUnitsOf = array_column($sides, 'units', 'key');
    $load = function (string $s, string $per) use (&$at, &$uload, $people, $sideUnitsOf): int {
        $n = 0;
        foreach ($sideUnitsOf[$s] ?? [] as $u) $n += $uload[$u][$per];
        foreach ($at as $k => $sk) if ($sk === $s && in_array($per, $people[$k]['periods'], true)) $n++;
        return $n;
    };
    $draws = [];
    $drawOf = [];
    $method = [];
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
                        foreach ($at as $k => $cur) {
                            $p = $people[$k];
                            if ($cur !== $sk || $p['side'] !== $sk || !in_array($per, $p['periods'], true)) continue;
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
    $unitOf = [];
    $why = [];
    foreach ($sides as $sd) {
        $members = array_values(array_filter(array_keys($at), fn($k) => $at[$k] === $sd['key']));
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
            if (isset($drawOf[$k])) {
                $draws[$drawOf[$k]]['unit'] = $u;
                $why[$k] = ($method[$k] === 'kura' ? 'Kura ile ' : 'En az geçen olarak ') . $sideName[$people[$k]['side']] . ' → ' . $u;
            } elseif (count($units) > 1) {
                $parts = [];
                foreach ($units as $x) $parts[] = pl_short($x) . ': ' . (int)($info[$k]['units'][$x] ?? 0);
                $last = $info[$k]['last'];
                $why[$k] = 'Daha önce ' . implode(', ', $parts) . ($last ? ' · son: ' . pl_unit_label($last[1]) : '');
            } else $why[$k] = '';
        }
    }
    foreach ($at as $k => $_) $items[$k] = ['segs' => [['unit' => $unitOf[$k], 'period' => $people[$k]['shift'], 'status' => 'work']], 'method' => $method[$k] ?? 'auto', 'why' => $why[$k] ?? '', 'draw' => $drawOf[$k] ?? null];
    // Eksik / fazla
    $deficits = [];
    $extra = [];
    if ($hasNeeds) {
        foreach (pl_units_all() as $u => $sk) foreach (PL_PERIODS as $per) {
            $need = $needs[$u][$per] ?? 0;
            if ($uload[$u][$per] < $need) $deficits[] = ['unit' => $u, 'label' => pl_unit_label($u), 'side' => $sk, 'period' => $per, 'missing' => $need - $uload[$u][$per], 'need' => $need, 'placed' => $uload[$u][$per]];
            elseif ($uload[$u][$per] > $need && $u !== PL_TEAM) $extra[] = ['unit' => $u, 'label' => pl_unit_label($u), 'side' => $sk, 'period' => $per, 'over' => $uload[$u][$per] - $need];
        }
    }
    return ['items' => $items, 'draws' => $draws, 'deficits' => $deficits, 'extra' => $extra];
}

/** Birim kısaltması: "A blok" -> "A" */
function pl_short(string $u): string
{
    $u = pl_unit_label($u);
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

function pl_team_out(): array
{
    $t = pl_team();
    return ['key' => PL_TEAM, 'name' => $t['name'], 'members' => $t['members'], 'need' => $t['need']];
}

/** Kişinin istemciye giden hâli (o gün) */
function pl_person_out(array $p, ?array $r, string $date, bool $pub, array $users): array
{
    $ym = substr($date, 0, 7);
    $last = pl_last_before($r, $date);
    $u = swap_user_for($p['name'], $users);
    return ['key' => $p['key'], 'name' => $p['name'], 'title' => $p['title'], 'side' => $p['side'], 'shift' => $p['shift'], 'periods' => $p['periods'], 'team' => $p['team'],
        'user_id' => $u ? (int)$u['id'] : null, 'cross' => (int)($r['total'] ?? 0), 'month' => (int)($r['months'][$ym] ?? 0),
        'units' => (object)($r['units'] ?? []), 'last_unit' => $last[1] ?? null, 'last_date' => $last[0] ?? null,
        'exempt' => $pub && function_exists('rules_is_exempt') ? rules_is_exempt($p['name'], 'kura', $date) : false] + pl_row_out($p['row']);
}

function pl_saved(string $date): array
{
    return array_values(array_filter(all('SELECT p.*, u.name AS by_name FROM placements p LEFT JOIN users u ON u.id = p.created_by WHERE p.date = ? ORDER BY p.id', [$date]),
        fn($r) => !pl_excluded((string)$r['name'])));
}

/** Kayıtlı yerleşim satırı. Yalnız son hâl: kura adayları ve gerekçe yalnız sorumlulara gider. */
function pl_saved_out(array $r, bool $pub = false): array
{
    $meta = json_decode((string)$r['meta'], true) ?: [];
    return ['key' => swap_key((string)$r['name']), 'name' => $r['name'], 'unit' => $r['unit'], 'side' => $r['side'], 'code' => $r['code'], 'period' => $r['period'],
        'status' => $r['status'] ?? 'work', 'method' => $r['method'], 'counted' => (bool)$r['counted'],
        'pool' => $pub ? json_decode((string)$r['pool'], true) : null, 'why' => $pub ? ($meta['why'] ?? '') : ''];
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
    $savedOut = array_map(function ($r) use ($pub, $recAll, $rec) {
        $k = swap_key((string)$r['name']);
        return pl_saved_out($r, $pub) + ['cross_total' => (int)($recAll[$k]['total'] ?? 0), 'cross_before' => (int)($rec[$k]['total'] ?? 0)];
    }, $saved);
    $savedKeys = array_column($savedOut, 'key');
    $stale = $saved ? array_values(array_merge(
        array_map(fn($s) => ['name' => $s['name'], 'why' => 'artık listede nöbetçi değil'], array_filter($savedOut, fn($s) => ($s['status'] === 'work' || $s['status'] === 'off') && !isset($people[$s['key']]))),
        array_map(fn($p) => ['name' => $p['name'], 'why' => 'yerleştirilmedi'], array_filter($people, fn($p) => !in_array($p['key'], $savedKeys, true)))
    )) : [];
    // Sorumlular için: o gün nöbetçi olmayan liste kişileri (çağrılacak / nöbete gelecek seçimi)
    $others = [];
    if ($pub) foreach (pl_month_people($date) as $k => $p) if (!isset($people[$k])) $others[] = ['key' => $k, 'name' => $p['name'], 'side' => $p['side'], 'cross' => (int)($rec[$k]['total'] ?? 0)];
    usort($others, fn($a, $b) => strcmp($a['side'], $b['side']) ?: strcmp($a['name'], $b['name']));
    $hol = function_exists('holiday_on') ? holiday_on($date) : null;
    return [
        'date' => $date, 'sides' => pl_layout(), 'team' => pl_team_out(), 'people' => $ppl, 'others' => $others,
        'needs' => (object)$n['needs'], 'needs_default' => (object)$n['default'], 'needs_source' => $n['source'], 'has_needs' => $n['any'],
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

/** Ad → o günün nöbetçi anahtarı */
function pl_match_person(array $people, string $name): ?string
{
    $k = swap_key($name);
    if (isset($people[$k])) return $k;
    foreach ($people as $pk => $p) if (names_match($p['name'], $name)) return $pk;
    return null;
}

/**
 * İstemcinin kişi listesini ayrıştırır: [{name, segs}] → ['duty' => [anahtar => segs], 'called' => [anahtar => [name, side, roster_id, segs]]]
 */
function pl_parse_people(array $people, array $list, string $date): array
{
    $duty = [];
    $called = [];
    foreach (array_slice($list, 0, 200) as $it) {
        if (!is_array($it)) continue;
        $name = mb_substr(trim((string)($it['name'] ?? '')), 0, 120);
        if (mb_strlen($name) < 3) fail('Kişi adı eksik.');
        if (pl_excluded($name)) fail('“' . $name . '” nöbet hesaplarına dahil değil; yerleştirilemez.');
        $k = pl_match_person($people, $name);
        if ($k !== null) {
            if (isset($duty[$k])) fail('“' . $people[$k]['name'] . '” iki kez yazılmış.');
            $duty[$k] = pl_norm_segs($it['segs'] ?? null, true, $people[$k]['name']);
        } else {
            $h = pl_home_of($name, $date);
            if (isset($called[$h['key']])) fail('“' . $h['name'] . '” iki kez yazılmış.');
            $called[$h['key']] = $h + ['segs' => pl_norm_segs($it['segs'] ?? null, false, $h['name'])];
        }
    }
    return ['duty' => $duty, 'called' => $called];
}

function a_placement_auto(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $people = pl_day_people($date);
    if (count(pl_sides()) < 2) fail('Önce tarafları tanımlayın (Taraflar).');
    if (!$people) fail('Bu gün listede nöbetçi görünmüyor.');
    $parsed = pl_parse_people($people, arr('keep'), $date);
    $n = pl_needs($date);
    $res = pl_auto($date, $people, $n['needs'], $n['any'], $parsed['duty'], array_values($parsed['called']));
    // Öneri oturumda saklanır: kayıtta yöntem (otomatik/kura) ve kura adayları buradan doğrulanır
    $prop = [];
    foreach ($res['items'] as $k => $it) $prop[$k] = ['sig' => pl_segs_sig($it['segs']), 'method' => $it['method'], 'why' => $it['why'], 'pool' => $it['draw'] !== null ? $res['draws'][$it['draw']] : null];
    $all = $_SESSION['pl_prop'] ?? [];
    unset($all[$date]);
    $all[$date] = $prop;
    $_SESSION['pl_prop'] = array_slice($all, -6, null, true);
    $real = array_values(array_filter($res['draws'], fn($d) => count($d['group']) > 1));
    if ($real) audit($me, 'placement.draw', $date, implode(' · ', array_map(fn($d) => $d['winner'] . ' → ' . $d['unit'] . ' (eşit: ' . implode(', ', $d['group']) . ')', $real)));
    $items = [];
    foreach ($res['items'] as $k => $it) $items[] = ['key' => $k, 'name' => $people[$k]['name'], 'segs' => $it['segs'], 'method' => $it['method'], 'why' => $it['why'], 'draw' => $it['draw']];
    out(['date' => $date, 'items' => $items, 'draws' => $res['draws'], 'deficits' => $res['deficits'], 'extra' => $res['extra'], 'has_needs' => $n['any']]);
}

/**
 * Kaydet: {date, people: [{name, segs: [{unit, period, status}]}], standby: [{name}]}
 * Listede nöbetçi olan herkes en az bir parçayla yer almalı; listede olmayanlar "çağrıldı" olur.
 */
function a_placement_save(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $people = pl_day_people($date);
    if (!$people) fail('Bu gün listede nöbetçi görünmüyor.');
    $parsed = pl_parse_people($people, arr('people'), $date);
    $missing = array_diff_key($people, $parsed['duty']);
    if ($missing) fail('Herkesi bir yere yerleştirin (ya da oflayın): ' . implode(', ', array_map(fn($p) => $p['name'], $missing)) . '.');
    $standby = [];
    foreach (array_slice(arr('standby'), 0, 20) as $sb) {
        $name = mb_substr(trim((string)(is_array($sb) ? ($sb['name'] ?? '') : $sb)), 0, 120);
        if (mb_strlen($name) < 3) continue;
        if (pl_excluded($name)) fail('“' . $name . '” nöbet hesaplarına dahil değil.');
        $h = pl_home_of($name, $date);
        if (pl_match_person($people, $name) !== null || isset($parsed['called'][$h['key']])) fail('“' . $name . '” zaten yerleşik; nöbete gelecek kişi olamaz.');
        $standby[$h['key']] = $h;
    }
    $u2s = pl_unit_side();
    $team = pl_team();
    $sideName = array_column(pl_sides(), 'name', 'key');
    $prop = $_SESSION['pl_prop'][$date] ?? [];
    $prev = [];
    foreach (pl_saved($date) as $r) {
        $k = swap_key((string)$r['name']);
        $prev[$k]['segs'][] = ['unit' => $r['unit'], 'period' => $r['period'], 'status' => $r['status'] ?? 'work'];
        $prev[$k]['row'] = $r;
    }
    foreach ($prev as $k => $p) { usort($p['segs'], fn($a, $b) => ($a['period'] === 'night') <=> ($b['period'] === 'night')); $prev[$k]['sig'] = pl_segs_sig($p['segs']); }
    $users = pl_users();
    $rows = [];
    $ins = function (array $v) {
        q('INSERT INTO placements (date, name, user_id, roster_id, side, unit, code, period, method, counted, pool, created_by, created_at, meta, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', $v);
    };
    db()->beginTransaction();
    try {
        q('DELETE FROM placements WHERE date = ?', [$date]);
        foreach ($parsed['duty'] as $k => $segs) {
            $p = $people[$k];
            $sig = pl_segs_sig($segs);
            $method = 'elle';
            $pool = null;
            $why = '';
            if (isset($prop[$k]) && $prop[$k]['sig'] === $sig) { $method = $prop[$k]['method']; $pool = $prop[$k]['pool']; $why = $prop[$k]['why']; }
            elseif (isset($prev[$k]) && $prev[$k]['sig'] === $sig) { $method = $prev[$k]['row']['method']; $pool = json_decode((string)$prev[$k]['row']['pool'], true); $why = (json_decode((string)$prev[$k]['row']['meta'], true) ?: [])['why'] ?? ''; }
            $u = swap_user_for($p['name'], $users);
            foreach ($segs as $s) {
                $counted = pl_counts_cross($p['side'], $s['unit'], $s['period'], $s['status']) ? 1 : 0;
                $ins([$date, $p['name'], $u ? (int)$u['id'] : null, $p['roster_id'], $p['side'], $s['unit'], (string)$p['row']['code'], $s['period'], $method, $counted,
                    $pool ? json_encode($pool, JSON_UNESCAPED_UNICODE) : null, $me['id'], now(), json_encode(['why' => $why], JSON_UNESCAPED_UNICODE), $s['status']]);
                $rows[] = ['name' => $p['name'], 'side' => $p['side'], 'code' => (string)$p['row']['code'], 'seg' => $s, 'counted' => $counted, 'method' => $method, 'user' => $u, 'changed' => !isset($prev[$k]) || $prev[$k]['sig'] !== $sig];
            }
        }
        foreach ($parsed['called'] as $k => $c) {
            $u = swap_user_for($c['name'], $users);
            $sig = pl_segs_sig($c['segs']);
            foreach ($c['segs'] as $s) {
                $counted = pl_counts_cross($c['side'], $s['unit'], $s['period'], 'called') ? 1 : 0;
                $ins([$date, $c['name'], $u ? (int)$u['id'] : null, $c['roster_id'], $c['side'], $s['unit'], '', $s['period'], 'elle', $counted, null, $me['id'], now(), json_encode(['why' => 'Çağrıldı'], JSON_UNESCAPED_UNICODE), 'called']);
                $rows[] = ['name' => $c['name'], 'side' => $c['side'], 'code' => '', 'seg' => $s, 'counted' => $counted, 'method' => 'elle', 'user' => $u, 'changed' => !isset($prev[$k]) || $prev[$k]['sig'] !== $sig];
            }
        }
        foreach ($standby as $k => $h) {
            $u = swap_user_for($h['name'], $users);
            $ins([$date, $h['name'], $u ? (int)$u['id'] : null, $h['roster_id'], $h['side'], '', '', '24', 'elle', 0, null, $me['id'], now(), null, 'standby']);
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    unset($_SESSION['pl_prop'][$date]);
    // Bildirim: karşı tarafa yerleşenler ve çağrılanlar (bugün / yarın, yalnız değişiklik varsa)
    $today = date('Y-m-d');
    $tomorrow = date('Y-m-d', strtotime('+1 day'));
    $sent = 0;
    if ($date === $today || $date === $tomorrow) {
        $done = [];
        foreach ($rows as $r) {
            $s = $r['seg'];
            if ($s['status'] === 'off' || !$r['changed'] || !$r['user'] || (int)$r['user']['id'] === (int)$me['id'] || isset($done[$r['user']['id']])) continue;
            $cross = $s['unit'] !== PL_TEAM && ($u2s[$s['unit']] ?? '') !== $r['side'];
            if (!$cross && $s['status'] !== 'called') continue;
            $done[$r['user']['id']] = true;
            $lbl = pl_unit_label($s['unit']);
            notify_users([$r['user']], 'side', ($date === $today ? 'Bugün ' : 'Yarın ') . $lbl . '’ta çalışacaksın',
                ($s['status'] === 'called' ? 'Çağrıldın' : ($r['method'] === 'kura' ? 'Kura sonucu' : 'Blok yerleşimi')) . ' · ' . ['day' => '08-16', 'night' => '16-08', '24' => '24 saat'][$s['period']]
                . ($r['side'] && $cross ? ' · ' . ($sideName[$r['side']] ?? '') . ' → ' . $lbl : '') . ($r['counted'] ? ' · karşı tarafa geçiş olarak sayıldı' : ''), '#/taraf/' . $date, null);
            $sent++;
        }
    }
    $byUnit = [];
    foreach ($rows as $r) {
        $s = $r['seg'];
        $byUnit[$s['unit']][] = $r['name'] . ($s['period'] !== '24' ? ' ' . ['day' => 'gündüz', 'night' => 'gece'][$s['period']] : '')
            . ($s['status'] === 'off' ? ' (ofl.)' : ($s['status'] === 'called' ? ' (çağrıldı)' : ($r['counted'] ? ' (geçiş, ' . $r['method'] . ')' : '')));
    }
    $detail = implode(' · ', array_map(fn($u, $l) => pl_short($u) . ': ' . implode(', ', $l), array_keys($byUnit), $byUnit));
    if ($standby) $detail .= ' · bekleyen: ' . implode(', ', array_column($standby, 'name'));
    audit($me, 'placement.save', $date, $detail);
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
    audit($me, 'placement.clear', $date, $n . ' satır');
    pl_records_reset();
    out(pl_day_payload($date, $me));
}

/** Güne özel gereken sayılar: counts = {birim: {day, night}} | null (varsayılana dön) */
function a_placement_counts(): void
{
    $me = need_publisher();
    $date = pl_date_in();
    $all = pl_count_overrides();
    $keep = date('Y-m-d', strtotime('-120 days'));
    foreach (array_keys($all) as $d) if (!valid_ymd((string)$d) || $d < $keep) unset($all[$d]);
    $in = arr('counts');
    if (!$in) {
        unset($all[$date]);
        audit($me, 'placement.counts', $date, 'varsayılana döndü');
    } else {
        $c = [];
        foreach (pl_units_all() as $u => $_) {
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

/** Sorumlular ekibi: {name, members: [ad], need: {day, night}} */
function a_placement_team_save(): void
{
    $me = need_publisher();
    $name = s('name', 40) ?: 'Sorumlular';
    $members = [];
    foreach (array_slice(arr('members'), 0, 40) as $n) {
        $n = mb_substr(trim((string)$n), 0, 120);
        if (mb_strlen($n) < 3) continue;
        if (pl_excluded($n)) fail('“' . $n . '” nöbet hesaplarına dahil değil.');
        foreach ($members as $x) if (names_match($x, $n)) continue 2;
        $members[] = $n;
    }
    $need = arr('need');
    $t = ['name' => $name, 'members' => $members, 'need' => ['day' => max(0, min(30, (int)($need['day'] ?? 0))), 'night' => max(0, min(30, (int)($need['night'] ?? 0)))]];
    set_setting('pl_team', json_encode($t, JSON_UNESCAPED_UNICODE));
    audit($me, 'placement.team', $name, (implode(', ', $members) ?: 'üye yok') . ' · gereken ' . $t['need']['day'] . '/' . $t['need']['night']);
    out(['team' => pl_team_out()]);
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
        if (pl_excluded((string)$r['name'])) continue;
        $k = swap_key((string)$r['name']);
        $st = $r['status'] ?? 'work';
        $d = $r['date'];
        if (!isset($log[$d])) $log[$d] = ['date' => $d, 'by' => $r['by_name'], 'at' => $r['created_at'], 'n' => 0, 'items' => [], 'legacy' => false];
        $c = &$placed[$d][$k];
        $c = $c ?? ['u' => [], 'off' => [], 'x' => 0, 'c' => 0, 'm' => $r['method'], 'st' => $st];
        if ($st === 'standby') { $c['st'] = 'standby'; unset($c); continue; }
        $cross = $r['unit'] !== PL_TEAM && ($u2s[$r['unit']] ?? '') !== '' && $r['side'] !== '' && ($u2s[$r['unit']] ?? '') !== $r['side'];
        if ($st === 'off') $c['off'][] = $r['unit'];
        else { $c['u'][] = $r['unit']; if ($cross) $c['x'] = 1; }
        if ((int)$r['counted']) $c['c'] = 1;
        if ($st === 'called') $c['st'] = 'called';
        unset($c);
        if (!isset($log[$d]['names'][$k])) { $log[$d]['names'][$k] = true; $log[$d]['n']++; }
        if (($cross && $st !== 'off') || $r['method'] === 'kura' || $st === 'called' || $st === 'off') $log[$d]['items'][] = ['name' => $r['name'], 'unit' => $r['unit'], 'from' => $r['side'], 'to' => $u2s[$r['unit']] ?? '',
            'code' => $r['code'], 'period' => $r['period'], 'status' => $st, 'method' => $r['method'], 'counted' => (bool)$r['counted'], 'pool' => $pub ? json_decode((string)$r['pool'], true) : null];
    }
    foreach ($log as &$g) unset($g['names']);
    unset($g);
    foreach (all('SELECT m.*, u.name AS by_name FROM side_moves m LEFT JOIN users u ON u.id = m.created_by WHERE m.date >= ? AND m.date <= ? ORDER BY m.date, m.id', [$from, $to]) as $m) {
        if ((isset($placed[$m['date']]) && empty($log[$m['date']]['legacy'])) || pl_excluded((string)$m['name'])) continue;
        $k = swap_key((string)$m['name']);
        $placed[$m['date']][$k] = ['u' => [$m['unit']], 'off' => [], 'm' => $m['method'], 'c' => (int)$m['counted'], 'x' => $m['from_side'] !== $m['to_side'] ? 1 : 0, 'st' => 'work', 'old' => 1];
        if (!isset($log[$m['date']])) $log[$m['date']] = ['date' => $m['date'], 'by' => $m['by_name'], 'at' => $m['created_at'], 'n' => 0, 'items' => [], 'legacy' => true];
        $pool = json_decode((string)$m['pool'], true);
        $log[$m['date']]['items'][] = ['name' => $m['name'], 'unit' => $m['unit'], 'from' => $m['from_side'], 'to' => $m['to_side'], 'code' => $m['code'], 'period' => '24', 'status' => 'work', 'method' => $m['method'],
            'counted' => (bool)$m['counted'], 'pool' => $pub && $pool && isset($pool['pool']) ? ['pool' => array_map(fn($x) => ['name' => $x['name'], 'cross' => $x['total'] ?? 0, 'code' => $x['code'] ?? ''], $pool['pool']), 'group' => $pool['group'] ?? []] : null];
    }
    ksort($log);
    // Kişiler (ay listeleri; hesaplara dahil edilmeyenler zaman çizelgesinde yok)
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
            'units' => (object)($r['units'] ?? []), 'last_unit' => $last[1] ?? null, 'last_date' => $last[0] ?? null, 'adj' => (int)($r['adj_cross'] ?? 0) !== 0 || !empty($r['adj_units']),
            'team' => pl_is_team_member($name)];
    };
    foreach ($outSides as $sd) foreach ($sd['people'] as $p) $add($p['key'], $p['name'], $sd['key']);
    foreach ($rec as $k => $r) if (!isset($seen[$k]) && ($r['adj_cross'] || $r['adj_units'])) $add($k, $r['name'], null);
    $adjust = array_map(fn($a) => ['id' => (int)$a['id'], 'name' => $a['name'], 'unit' => $a['unit'], 'cross_count' => (int)$a['cross_count'], 'unit_count' => (int)$a['unit_count'],
        'note' => $pub ? $a['note'] : null, 'by' => $a['by_name'], 'at' => $a['created_at']],
        array_values(array_filter(all('SELECT a.*, u.name AS by_name FROM placement_adjust a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.name, a.id'), fn($a) => !pl_excluded((string)$a['name']))));
    out(['month' => $ym, 'days' => (int)date('t', strtotime($from)), 'sides' => $outSides, 'team' => pl_team_out(), 'placed' => (object)$placed, 'stats' => $stats, 'log' => array_values($log),
        'adjust' => $adjust, 'exempt' => $pub && function_exists('rules_exempt_list') ? rules_exempt_list() : [], 'since' => setting('side_since') ?: null,
        'holidays' => function_exists('holidays_between') ? (object)holidays_between($from, $to) : (object)[], 'can_edit' => $pub, 'can_admin' => is_admin($me)]);
}

/** Geçmişe dönük elle sayı: {id?, name, cross_count, unit?, unit_count, note} */
function a_placement_adjust_save(): void
{
    $me = need_publisher();
    $name = s('name', 120);
    if (mb_strlen($name) < 3) fail('Kişiyi seçin.');
    if (pl_excluded($name)) fail('Bu kişi nöbet hesaplarına dahil değil.');
    $unit = s('unit', 40);
    if ($unit !== '' && !isset(pl_units_all()[$unit])) fail('Birim bulunamadı.');
    $cross = max(-50, min(200, (int)(i('cross_count') ?? 0)));
    $uc = $unit !== '' ? max(-50, min(500, (int)(i('unit_count') ?? 0))) : 0;
    if (!$cross && !$uc) fail('Bir sayı girin (geçiş veya blok sayısı).');
    $note = s('note', 200) ?: null;
    $u = swap_user_for($name, pl_users());
    $id = (int)(i('id') ?? 0);
    $side = null;
    foreach (pl_sides() as $sd) {
        if (!$sd['roster_id']) continue;
        foreach (pl_tl($sd['roster_id'], date('Y-m-01', strtotime('-2 months')), date('Y-m-t', strtotime('+1 month'))) as $p) if (names_match((string)$p['name'], $name)) { $side = $sd['key']; break 2; }
    }
    if ($id) {
        one('SELECT id FROM placement_adjust WHERE id = ?', [$id]) ?? fail('Kayıt bulunamadı.', 404);
        q('UPDATE placement_adjust SET name = ?, user_id = ?, side = ?, unit = ?, cross_count = ?, unit_count = ?, note = ? WHERE id = ?',
            [$name, $u ? (int)$u['id'] : null, $side, $unit ?: null, $cross, $uc, $note, $id]);
    } else {
        q('INSERT INTO placement_adjust (name, user_id, side, unit, cross_count, unit_count, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$name, $u ? (int)$u['id'] : null, $side, $unit ?: null, $cross, $uc, $note, $me['id'], now()]);
        $id = insert_id();
    }
    audit($me, 'placement.adjust', $name, ($cross ? 'geçiş ' . ($cross > 0 ? '+' : '') . $cross : '') . ($uc ? ($cross ? ' · ' : '') . pl_unit_label($unit) . ' ' . ($uc > 0 ? '+' : '') . $uc : '') . ($note ? ' · ' . $note : ''));
    pl_records_reset();
    $r = pl_records()[swap_key($name)] ?? null;
    out(['id' => $id, 'total' => (int)($r['total'] ?? 0)]);
}

function a_placement_adjust_delete(): void
{
    $me = need_publisher();
    $a = one('SELECT * FROM placement_adjust WHERE id = ?', [(int)(i('id') ?? 0)]) ?? fail('Kayıt bulunamadı.', 404);
    q('DELETE FROM placement_adjust WHERE id = ?', [$a['id']]);
    audit($me, 'placement.adjust', $a['name'], 'silindi (geçiş ' . $a['cross_count'] . ($a['unit'] ? ' · ' . pl_unit_label((string)$a['unit']) . ' ' . $a['unit_count'] : '') . ')');
    out([]);
}

/** Ana sayfa kartı: bugünün kayıtlı yerleşimi (son hâl) */
function a_placement_today(): void
{
    $me = need_user();
    $sides = pl_layout();
    if (count($sides) < 2) out(['sides' => []]);
    $date = date('Y-m-d');
    $rec = pl_records();
    $saved = array_map(fn($s) => pl_saved_out($s, false) + ['cross_total' => (int)($rec[swap_key((string)$s['name'])]['total'] ?? 0)], pl_saved($date));
    $mine = [];
    foreach ($saved as $s) if ($s['status'] !== 'off' && $s['status'] !== 'standby' && names_match((string)$s['name'], (string)$me['name'])) $mine[] = pl_unit_label($s['unit']) . ($s['period'] !== '24' ? ' ' . ['day' => 'gündüz', 'night' => 'gece'][$s['period']] : '');
    $onDuty = $saved ? count(array_unique(array_column($saved, 'key'))) : count(pl_day_people($date));
    out(['date' => $date, 'sides' => $sides, 'team' => pl_team_out(), 'saved' => $saved, 'on_duty' => $onDuty, 'mine' => $mine ? implode(' · ', $mine) : null, 'can_edit' => is_publisher($me)]);
}

/* =================================================================== */
/* Açılış verisi: kişinin son/sonraki 40 gün blokları                   */
/* =================================================================== */

/** [tarih => "B blok"] (iki yer: "Sorumlular / A blok", nöbete gelecek: "Nöbete gelecek") — oflananlar yok */
function pl_my_blocks(array $me): array
{
    $from = date('Y-m-d', strtotime('-40 days'));
    $to = date('Y-m-d', strtotime('+40 days'));
    $out = [];
    foreach (all("SELECT date, name, user_id, unit, period, status FROM placements WHERE date >= ? AND date <= ? AND status <> 'off' ORDER BY date, period = 'night', id", [$from, $to]) as $r) {
        if ((int)$r['user_id'] !== (int)$me['id'] && !names_match((string)$r['name'], (string)$me['name'])) continue;
        $lbl = $r['status'] === 'standby' ? 'Nöbete gelecek' : pl_unit_label((string)$r['unit']);
        $out[$r['date']] = isset($out[$r['date']]) && $out[$r['date']] !== $lbl ? $out[$r['date']] . ' / ' . $lbl : $lbl;
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
    'placement.team.save' => 'a_placement_team_save',
    'placement.month' => 'a_placement_month',
    'placement.today' => 'a_placement_today',
    'placement.adjust.save' => 'a_placement_adjust_save',
    'placement.adjust.delete' => 'a_placement_adjust_delete',
];
