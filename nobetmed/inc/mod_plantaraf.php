<?php
/**
 * Basamakları birlikte planlama (4.30): taraflı birimde (ör. 3. Basamak → B blok, 2. Basamak → A + C blok) iki listenin
 * aylık çizelgesi aynı ekranda ama ayrı ayrı hazırlanır; her liste kendi taslağında durur, ayrı Excel olarak yayınlanır.
 *
 * Otomatik dağıtım sırası:
 *  1) Onaylı istekler (izin / boşluk) ve elle yazılan hücreler korunur; nöbet dışı kişiler hiç yazılmaz.
 *  2) Sorumlular ekibi (Taraf › Sorumlular) alana dağıtılmaz; isteğe bağlı hafta içi gündüz yazılır.
 *  3) Her gün ve dönem için tarafın gereken kişi sayısı blok planından gelir (Taraf › gün gün sayılar = tarafın bloklarının toplamı).
 *     Önce herkes kendi tarafından dolar (adalet: ay içinde az saat → hafta sonu sayısı → son 7 gün → kura).
 *  4) Bir taraf o gün dolmuyorsa (izin, dinlenme, kişi azlığı) eksik diğer tarafın listesinden tamamlanır: o kişi o gün
 *     karşıya geçecek kişidir; bloğu Taraf sayfasındaki günlük kura belirler.
 *  5) Herkes yerleştikten sonra Cuma (ve isteğe bağlı Cumartesi) sorumlular sırayla atanır.
 * Kurallar (dinlenme, üst üste çalışma, 24 çıkışı) önceki ayın son günleriyle birlikte denetlenir.
 */
declare(strict_types=1);

/** Planlamaya giren taraflar: listesi seçilmiş olanlar (sırasıyla) */
function pt_sides(): array
{
    if (!function_exists('pl_sides')) return [];
    return array_values(array_filter(pl_sides(), fn($s) => (int)$s['roster_id'] > 0));
}

function pt_need_ok(): void
{
    if (count(pt_sides()) < 2) fail('Basamakları birlikte planlamak için en az iki taraf ve her birine nöbet listesi tanımlayın (Taraf › Taraflar).');
}

/** Gün gün gereken kişi: ['side' => [tarih => [taraf => [day, night]]], 'unit' => [tarih => [birim => [day, night]]]] (Sorumlular hariç) */
function pt_needs(string $ym): array
{
    $sides = pt_sides();
    $side = [];
    $unit = [];
    foreach (plan_days($ym) as $d) {
        $n = pl_needs($d)['needs'];
        foreach ($sides as $sd) {
            $side[$d][$sd['key']] = ['day' => 0, 'night' => 0];
            foreach ($sd['units'] as $u) {
                $x = $n[$u] ?? ['day' => 0, 'night' => 0];
                $unit[$d][$u] = $x;
                $side[$d][$sd['key']]['day'] += (int)$x['day'];
                $side[$d][$sd['key']]['night'] += (int)$x['night'];
            }
        }
        $unit[$d][PL_TEAM] = $n[PL_TEAM] ?? ['day' => 0, 'night' => 0];
    }
    return ['side' => $side, 'unit' => $unit];
}

/** Seçenekler (birim ayarı olarak hatırlanır) */
function pt_opts(?array $in = null): array
{
    $j = $in ?? (json_decode((string)setting('plan_side_opts', '{}'), true) ?: []);
    $s = fn($k) => mb_substr(trim((string)($j[$k] ?? '')), 0, 20);
    // Dönemin vardiya takımı: bir "kişi" yerine geçen kodlar (ör. gece = 16-24 + 24-08); eski tek kod ayarı da okunur
    $set = function (string $k, string $one) use ($j, $s): array {
        $o = [];
        foreach (array_slice((array)($j[$k] ?? []), 0, 6) as $c) { $c = mb_substr(trim((string)$c), 0, 20); if ($c !== '') $o[] = $c; }
        return $o ?: array_values(array_filter([$s($one)]));
    };
    $dc = $set('day_codes', 'day_code');
    $nc = $set('night_codes', 'night_code');
    return [
        'day_code' => $dc[0] ?? '', 'night_code' => $nc[0] ?? '', 'day_codes' => $dc, 'night_codes' => $nc,
        'team_day' => array_key_exists('team_day', $j) ? !empty($j['team_day']) : true,
        'fri_on' => array_key_exists('fri_on', $j) ? !empty($j['fri_on']) : true, 'fri_code' => $s('fri_code'), 'fri_n' => max(1, min(5, (int)($j['fri_n'] ?? 1))),
        'sat_on' => !empty($j['sat_on']), 'sat_code' => $s('sat_code'), 'sat_n' => max(1, min(5, (int)($j['sat_n'] ?? 1))),
        'balance' => array_key_exists('balance', $j) ? !empty($j['balance']) : true,
    ];
}

/** Taslak yoksa başlangıç: bu ayın yayınlanmış nöbetleri, yoksa önceki ayın kişileri (basamak adları ay ay değişir, düzenlenebilir) */
function pt_bootstrap(int $rid, string $ym): array
{
    $cells = [];
    $people = [];
    $seen = [];
    foreach (all('SELECT s.name, s.title, s.date, s.code FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.date LIKE ? ORDER BY s.id', [$rid, $ym . '-%']) as $x) {
        if (!isset($seen[tr_lower($x['name'])])) { $seen[tr_lower($x['name'])] = 1; $people[] = ['name' => $x['name'], 'title' => (string)$x['title']]; }
        $cells[$x['name']][$x['date']] = $x['code'];
    }
    if ($people) return [['people' => $people, 'cells' => $cells, 'needs' => plan_default_needs($rid)], 'liste'];
    $pym = date('Y-m', strtotime($ym . '-01 -1 month'));
    $dr = one('SELECT data FROM plan_drafts WHERE roster_id = ? AND ym = ?', [$rid, $pym]);
    $pd = $dr ? (json_decode((string)$dr['data'], true) ?: []) : [];
    foreach ((array)($pd['people'] ?? []) as $p) {
        $n = (string)(is_array($p) ? ($p['name'] ?? '') : $p);
        if ($n !== '' && !isset($seen[tr_lower($n)])) { $seen[tr_lower($n)] = 1; $people[] = ['name' => $n, 'title' => (string)(is_array($p) ? ($p['title'] ?? '') : '')]; }
    }
    if (!$people) {
        $fid = (int)val('SELECT MAX(file_id) FROM roster_shifts WHERE roster_id = ? AND date LIKE ?', [$rid, $pym . '-%']);
        if ($fid) foreach (all('SELECT DISTINCT name, title FROM roster_shifts WHERE roster_id = ? AND file_id = ? ORDER BY name', [$rid, $fid]) as $x) {
            if (!isset($seen[tr_lower($x['name'])])) { $seen[tr_lower($x['name'])] = 1; $people[] = ['name' => $x['name'], 'title' => (string)$x['title']]; }
        }
    }
    return [['people' => $people, 'cells' => (object)[], 'needs' => plan_default_needs($rid)], $people ? 'onceki' : 'bos'];
}

/** Kişi işaretleri (istemci sayımı için): [ad => ['team' => bool, 'excl' => bool]] */
function pt_flags(array $people): array
{
    $o = [];
    foreach ($people as $p) {
        $n = (string)$p['name'];
        $o[$n] = ['team' => pl_is_team_member($n), 'excl' => pl_excluded($n)];
    }
    return $o;
}

function pt_codes_out(): array
{
    return array_values(array_map(fn($c) => [
        'code' => (string)($c['code'] ?? ''), 'label' => (string)($c['label'] ?? ''), 'kind' => (string)($c['kind'] ?? 'shift'), 'start' => $c['start'] ?? null, 'end' => $c['end'] ?? null, 'hours' => $c['hours'] ?? null,
    ], plan_dict()));
}

function a_plan_sides_get(): void
{
    need_publisher();
    pt_need_ok();
    $ym = plan_ym();
    $out = [];
    $cross = function_exists('placement_cross_counts') ? placement_cross_counts() : [];
    foreach (pt_sides() as $sd) {
        $rid = (int)$sd['roster_id'];
        $r = plan_roster($rid);
        $dr = one('SELECT * FROM plan_drafts WHERE roster_id = ? AND ym = ?', [$rid, $ym]);
        if ($dr) { $data = json_decode((string)$dr['data'], true) ?: []; $from = 'draft'; }
        else [$data, $from] = pt_bootstrap($rid, $ym);
        $data['people'] = array_values((array)($data['people'] ?? []));
        // Önceki ayın son 7 günü (görünüm) — kurallar sunucuda 10 günle denetlenir
        $prev = [];
        foreach (plan_prev_rows($rid, $ym) as $p) {
            $days = [];
            foreach ($p['days'] as $d => $row) if ($d >= date('Y-m-d', strtotime($ym . '-01 -7 day'))) $days[$d] = (string)$row['code'];
            if ($days) $prev[$p['name']] = $days;
        }
        $crossOf = [];
        foreach ($data['people'] as $p) $crossOf[(string)$p['name']] = (int)($cross[swap_key((string)$p['name'])] ?? 0);
        $out[] = ['key' => $sd['key'], 'name' => $sd['name'], 'units' => $sd['units'], 'cross_in' => $sd['cross_in'] ?? [], 'roster' => ['id' => $rid, 'name' => $r['name']],
            'draft' => $data, 'from' => $from, 'updated_at' => $dr['updated_at'] ?? null, 'requests' => plan_requests($ym, $rid), 'prev' => (object)$prev,
            'flags' => (object)pt_flags($data['people']), 'cross' => (object)$crossOf];
    }
    $pd = plan_days($ym);
    $hol = [];
    if (function_exists('holidays_between')) foreach (holidays_between($pd[0], $pd[count($pd) - 1]) as $d => $h) $hol[$d] = is_array($h) ? ($h['name'] ?? '') : (string)$h;
    $n = pt_needs($ym);
    $team = pl_team();
    out(['ym' => $ym, 'sides' => $out, 'needs' => (object)$n['side'], 'unit_needs' => (object)$n['unit'], 'team' => ['name' => $team['name'], 'members' => $team['members']],
        'excluded' => array_values(array_unique(array_map(fn($x) => (string)$x['name'], function_exists('rules_excluded_list') ? rules_excluded_list() : []))),
        'opts' => pt_opts(), 'holidays' => (object)$hol, 'codes' => pt_codes_out(), 'rules' => rules_cfg()]);
}

/** Yeni eklenen kişilerin işaretleri (sorumlu / nöbet dışı) */
function a_plan_sides_flags(): void
{
    need_publisher();
    $people = [];
    foreach (array_slice(arr('names'), 0, 200) as $n) { $n = mb_substr(trim((string)$n), 0, 120); if ($n !== '') $people[] = ['name' => $n]; }
    out(['flags' => (object)pt_flags($people)]);
}

/** Taslakları al ve doğrula: [rid => temiz taslak] */
function pt_drafts_in(string $ym): array
{
    $in = arr('drafts');
    $o = [];
    foreach (pt_sides() as $sd) {
        $rid = (int)$sd['roster_id'];
        $o[$rid] = plan_clean((array)($in[$rid] ?? $in[(string)$rid] ?? []), $ym);
    }
    return $o;
}

function a_plan_sides_auto(): void
{
    $me = need_publisher();
    pt_need_ok();
    $ym = plan_ym();
    $sides = pt_sides();
    $dict = plan_dict();
    $cfg = rules_cfg();
    $opt = pt_opts(arr('opts'));
    $rowOf = function (string $code, string $what) use ($dict): array {
        if ($code === '') fail($what . ' için kod seçin.');
        $r = plan_row($code, $dict);
        if ($r['kind'] !== 'shift') fail($what . ' kodu bir nöbet kodu olmalı (' . $code . ').');
        return $r;
    };
    $dRow = $rowOf($opt['day_code'], 'Gündüz');
    $nRow = $rowOf($opt['night_code'], 'Gece');
    $dSet = array_map(fn($c) => $rowOf($c, 'Gündüz'), $opt['day_codes']);
    $nSet = array_map(fn($c) => $rowOf($c, 'Gece'), $opt['night_codes']);
    $fRow = $opt['fri_on'] ? $rowOf($opt['fri_code'] ?: $opt['night_code'], 'Cuma sorumlu nöbeti') : null;
    $sRow = $opt['sat_on'] ? $rowOf($opt['sat_code'], 'Cumartesi sorumlu nöbeti') : null;
    set_setting('plan_side_opts', json_encode($opt, JSON_UNESCAPED_UNICODE));
    $drafts = pt_drafts_in($ym);
    $first = $ym . '-01';
    $days = plan_days($ym);
    $sideName = array_column($sides, 'name', 'key');
    // Kişiler (bir ad iki listede yazıldıysa ilk liste geçerli)
    $P = [];
    $cells = [];
    foreach ($sides as $sd) {
        $rid = (int)$sd['roster_id'];
        $cells[$rid] = array_map(fn($x) => (array)$x, (array)$drafts[$rid]['cells']);
        $prev = plan_prev_rows($rid, $ym);
        $reqs = plan_requests($ym, $rid);
        foreach ($drafts[$rid]['people'] as $p) {
            $n = $p['name'];
            $k = swap_key($n);
            if (isset($P[$k])) continue;
            $dd = plan_prev_for($prev, $n) + plan_person_days($cells[$rid][$n] ?? [], $dict);
            ksort($dd);
            $P[$k] = ['rid' => $rid, 'side' => $sd['key'], 'name' => $n, 'team' => pl_is_team_member($n), 'excl' => pl_excluded($n), 'req' => plan_req_for($reqs, $n), 'days' => $dd];
        }
    }
    $hours = function (string $k) use (&$P, $first): float { $h = 0.0; foreach ($P[$k]['days'] as $d => $x) if ($d >= $first && ($x['kind'] ?? '') === 'shift') $h += (float)($x['hours'] ?? 0); return $h; };
    $weCount = function (string $k) use (&$P, $first): int { $c = 0; foreach ($P[$k]['days'] as $d => $x) if ($d >= $first && ($x['kind'] ?? '') === 'shift' && day_type($d) !== 'weekday') $c++; return $c; };
    $last7 = function (string $k, string $d) use (&$P): int { $c = 0; $lo = date('Y-m-d', strtotime($d . ' -7 day')); foreach ($P[$k]['days'] as $x => $row) if ($x < $d && $x >= $lo && ($row['kind'] ?? '') === 'shift') $c++; return $c; };
    // Dikkat: kısa fn dış değişkenin kopyasını alır; $P değiştikçe güncel görmesi için başvuruyla
    $free = function (string $k, string $d) use (&$P): bool { return !isset($P[$k]['days'][$d]) && !isset($P[$k]['req'][$d]); };
    $canAdd = function (string $k, string $d, array $row) use (&$P, $cfg): bool {
        $try = $P[$k]['days'];
        $try[$d] = $row;
        ksort($try);
        return swap_check($try, [$d], [], $cfg, $P[$k]['name']) === null;
    };
    $auto = [];
    $filled = 0;
    $put = function (string $k, string $d, array $row) use (&$P, &$cells, &$auto, &$filled) {
        $P[$k]['days'][$d] = $row;
        ksort($P[$k]['days']);
        $cells[$P[$k]['rid']][$P[$k]['name']][$d] = $row['code'];
        $auto[$k][$d] = true;
        $filled++;
    };
    $unput = function (string $k, string $d) use (&$P, &$cells, &$auto, &$filled) {
        unset($P[$k]['days'][$d], $cells[$P[$k]['rid']][$P[$k]['name']][$d], $auto[$k][$d]);
        $filled--;
    };
    $pick = function (array $cands) { usort($cands, fn($a, $b) => $a[0] <=> $b[0]); return $cands[0][1]; };
    // 2) Sorumlular: hafta içi gündüz
    if ($opt['team_day']) {
        foreach ($P as $k => $p) {
            if (!$p['team'] || $p['excl']) continue;
            foreach ($days as $d) if (day_type($d) === 'weekday' && $free($k, $d) && $canAdd($k, $d, $dRow)) $put($k, $d, $dRow);
        }
    }
    // 3–4) Alan: tarafların gün gün sayıları
    $needs = pt_needs($ym)['side'];
    $field = function (string $k) use (&$P): bool { return !$P[$k]['team'] && !$P[$k]['excl']; };
    // Kısmi vardiyalar kesirli sayılır (16-24 gecenin ½'si)
    $own = function (string $side, string $d, string $per) use (&$P, $field): float {
        $n = 0.0;
        foreach ($P as $k => $p) if ($p['side'] === $side && $field($k) && isset($p['days'][$d]) && ($p['days'][$d]['kind'] ?? '') === 'shift') $n += shift_cover($p['days'][$d])[$per];
        return round($n, 3);
    };
    $xplan = [];
    $cross = [];
    $unfilled = [];
    $cand = function (string $d, string $per, array $row, callable $okSide, bool $isCross) use (&$P, $field, $free, $canAdd, $hours, $weCount, $last7, &$xplan) {
        $we = day_type($d) !== 'weekday';
        $c = [];
        foreach ($P as $k => $p) {
            if (!$okSide($p['side']) || !$field($k) || !$free($k, $d) || !$canAdd($k, $d, $row)) continue;
            $c[] = [[$isCross ? (int)($xplan[$k] ?? 0) : 0, $hours($k), $we ? $weCount($k) : 0, $last7($k, $d), random_int(0, 1000000)], $k];
        }
        return $c;
    };
    foreach ($days as $d) {
        foreach (['night' => $nSet, 'day' => $dSet] as $per => $set) {
            // Önce herkes kendi tarafından: her "kişi" için takımdaki her vardiyaya bir kişi (ör. 16-24 + 24-08)
            foreach ($sides as $sd) {
                $sk = $sd['key'];
                $need = (float)($needs[$d][$sk][$per] ?? 0);
                while ($own($sk, $d, $per) < $need - 0.01) {
                    $done = 0;
                    foreach ($set as $row) {
                        if ($own($sk, $d, $per) >= $need - 0.01) break;
                        $c = $cand($d, $per, $row, fn($s) => $s === $sk, false);
                        if (!$c) continue;
                        $put($pick($c), $d, $row);
                        $done++;
                    }
                    if ($done < count($set)) break;
                }
            }
            // Eksik kalan taraf: önce diğer tarafın fazlası, sonra diğer tarafın listesinden ek kişi (karşıya geçecek)
            $def = [];
            $sur = [];
            foreach ($sides as $sd) {
                $sk = $sd['key'];
                $diff = $own($sk, $d, $per) - (float)($needs[$d][$sk][$per] ?? 0);
                if ($diff < -0.01) $def[$sk] = -$diff; elseif ($diff > 0.01) $sur[$sk] = $diff;
            }
            foreach ($def as $dk => $miss) {
                foreach ($sur as $sk => $n) { $use = min($n, $miss); $sur[$sk] -= $use; $miss -= $use; if ($miss < 0.01) break; }
                while ($miss > 0.01) {
                    $got = false;
                    foreach ($set as $row) {
                        if ($miss <= 0.01) break;
                        $c = $cand($d, $per, $row, fn($s) => $s !== $dk, true);
                        if (!$c) continue;
                        $k = $pick($c);
                        $put($k, $d, $row);
                        $xplan[$k] = ($xplan[$k] ?? 0) + 1;
                        $cross[] = ['date' => $d, 'period' => $per, 'name' => $P[$k]['name'], 'from' => $sideName[$P[$k]['side']], 'to' => $sideName[$dk]];
                        $miss -= max(0.01, shift_cover($row)[$per]);
                        $got = true;
                    }
                    if (!$got) { $unfilled[] = ['date' => $d, 'period' => $per, 'side' => $sideName[$dk], 'missing' => round($miss, 2)]; break; }
                }
            }
        }
    }
    // 4b) Saat eşitleme: aynı basamakta saati fazla olanın otomatik yazılmış nöbeti saati az olana geçer; 24 saatlik nöbet
    //     8-16 ve 16-8 olarak bölünüp bir parçası verilebilir. Günün sayıları değişmez (aynı gün, aynı dönem, aynı taraf),
    //     her hamle kurallarla denetlenir; elle yazılan hücrelere ve isteklere dokunulmaz. İzinli gün sayısına göre hedef küçülür.
    $balanced = 0;
    if ($opt['balance']) {
        $onlyPer = function (array $row, string $per): bool { return shift_periods($row) === [$per]; };
        $findPart = function (string $per) use ($dict, $dRow, $nRow, $onlyPer): ?array {
            if ($per === 'day' && $onlyPer($dRow, 'day')) return $dRow;
            if ($per === 'night' && $onlyPer($nRow, 'night')) return $nRow;
            foreach ($dict as $c) {
                $r = plan_row((string)($c['code'] ?? ''), $dict);
                if ($r['kind'] === 'shift' && $onlyPer($r, $per) && ($per === 'day' ? ($r['start_time'] ?? '') === '08:00' : ($r['start_time'] ?? '') === '16:00')) return $r;
            }
            return null;
        };
        $partD = $findPart('day');
        $partN = $findPart('night');
        $hOf = fn(array $row) => (float)($row['hours'] ?? 0);
        $nDays = count($days);
        $w = [];
        foreach ($P as $k => $p) {
            if (!$field($k)) continue;
            $off = 0;
            foreach ($days as $d) if (isset($p['req'][$d]) || (isset($p['days'][$d]) && ($p['days'][$d]['kind'] ?? '') !== 'shift')) $off++;
            $w[$k] = max(0, $nDays - $off) / $nDays;
        }
        $t0 = microtime(true);
        for ($it = 0; $it < 300 && microtime(true) - $t0 < 12; $it++) {
            $bestMove = null;
            foreach ($sides as $sd) {
                $mem = array_values(array_filter(array_keys($w), fn($k) => $P[$k]['side'] === $sd['key'] && $w[$k] > 0));
                if (count($mem) < 2) continue;
                $tot = 0.0; $sw = 0.0;
                foreach ($mem as $k) { $tot += $hours($k); $sw += $w[$k]; }
                $dev = [];
                foreach ($mem as $k) $dev[$k] = $hours($k) - $tot * $w[$k] / $sw;
                arsort($dev);
                // Saati ortalamanın üstündeki herkes → altındaki herkes (yalnız en uçtakiler değil: kurallar en uçtakini engelleyebilir)
                $his = array_keys(array_filter($dev, fn($v) => $v > 2));
                $los = array_reverse(array_keys(array_filter($dev, fn($v) => $v < -2)));
                foreach ($his as $hk) foreach ($los as $lk) {
                    $gap = $dev[$hk] - $dev[$lk];
                    if ($gap <= 4) continue;
                    foreach ($auto[$hk] ?? [] as $d => $_) {
                        if (!$free($lk, $d)) continue;
                        $row = $P[$hk]['days'][$d];
                        $per = shift_periods($row);
                        // Bütün nöbet
                        $opts = [[$row, null]];
                        // 24'ün parçası: gece (16-8) ya da gündüz (8-16) verilir, diğeri kalır
                        if ($per === ['day', 'night'] && $partD && $partN) { $opts[] = [$partN, $partD]; $opts[] = [$partD, $partN]; }
                        foreach ($opts as [$give, $keep]) {
                            $h = $hOf($give);
                            if ($h <= 0 || $h >= $gap) continue;
                            $gain = 2 * $h * ($gap - $h);
                            if ($bestMove && $gain <= $bestMove['gain']) continue;
                            if (!$canAdd($lk, $d, $give)) continue;
                            $bestMove = ['gain' => $gain, 'hk' => $hk, 'lk' => $lk, 'd' => $d, 'give' => $give, 'keep' => $keep];
                        }
                    }
                }
            }
            // Doğrudan aktarım kurala takıldıysa üçüncü kişi üzerinden: fazla → ara kişi (d1), ara kişi → eksik (d2), aynı saat
            $chain = null;
            if (!$bestMove) {
                $partsOf = function (array $row) use ($partD, $partN): array {
                    $o = [[$row, null]];
                    if (shift_periods($row) === ['day', 'night'] && $partD && $partN) { $o[] = [$partN, $partD]; $o[] = [$partD, $partN]; }
                    return $o;
                };
                foreach ($sides as $sd) {
                    $mem = array_values(array_filter(array_keys($w), fn($k) => $P[$k]['side'] === $sd['key'] && $w[$k] > 0));
                    if (count($mem) < 3) continue;
                    $tot = 0.0; $sw = 0.0;
                    foreach ($mem as $k) { $tot += $hours($k); $sw += $w[$k]; }
                    $dev = [];
                    foreach ($mem as $k) $dev[$k] = $hours($k) - $tot * $w[$k] / $sw;
                    arsort($dev);
                    $his = array_keys(array_filter($dev, fn($v) => $v > 2));
                    $los = array_reverse(array_keys(array_filter($dev, fn($v) => $v < -2)));
                    foreach ($his as $hk) foreach ($los as $lk) {
                        $gap = $dev[$hk] - $dev[$lk];
                        if ($gap <= 4) continue;
                        foreach ($mem as $mk) {
                            if ($mk === $hk || $mk === $lk) continue;
                            foreach ($auto[$hk] ?? [] as $d1 => $_) {
                                if (!$free($mk, $d1)) continue;
                                foreach ($partsOf($P[$hk]['days'][$d1]) as [$g1, $k1]) {
                                    $h = $hOf($g1);
                                    if ($h <= 0 || $h >= $gap || !$canAdd($mk, $d1, $g1)) continue;
                                    foreach ($auto[$mk] ?? [] as $d2 => $__) {
                                        if ($d2 === $d1 || !$free($lk, $d2)) continue;
                                        foreach ($partsOf($P[$mk]['days'][$d2]) as [$g2, $k2]) {
                                            if (abs($hOf($g2) - $h) > 0.01 || !$canAdd($lk, $d2, $g2)) continue;
                                            $chain = [[$hk, $mk, $d1, $g1, $k1], [$mk, $lk, $d2, $g2, $k2]];
                                            break 8;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (!$bestMove && !$chain) break;
            $moves = $chain ?: [[$bestMove['hk'], $bestMove['lk'], $bestMove['d'], $bestMove['give'], $bestMove['keep']]];
            foreach ($moves as [$hk, $lk, $d, $give, $keep]) {
                if ($keep) {
                    $P[$hk]['days'][$d] = $keep;
                    $cells[$P[$hk]['rid']][$P[$hk]['name']][$d] = $keep['code'];
                } else $unput($hk, $d);
                $put($lk, $d, $give);
                foreach ($cross as &$x) if ($x['date'] === $d && $x['name'] === $P[$hk]['name'] && !$keep) $x['name'] = $P[$lk]['name'];
                unset($x);
            }
            $balanced++;
        }
    }
    // 5) Cuma / Cumartesi sorumlular (sırayla; o günün otomatik gündüzü varsa yerine)
    $teamDone = ['fri' => [], 'sat' => []];
    $teamCount = [];
    foreach ([['fri', 5, $fRow, $opt['fri_n']], ['sat', 6, $sRow, $opt['sat_n']]] as [$tag, $dow, $tRow, $tn]) {
        if (!$tRow) continue;
        foreach ($days as $d) {
            if ((int)date('N', strtotime($d)) !== $dow) continue;
            $got = 0;
            foreach ($P as $k => $p) if ($p['team'] && isset($p['days'][$d]) && ($p['days'][$d]['code'] ?? '') === $tRow['code']) $got++;
            while ($got < $tn) {
                $c = [];
                foreach ($P as $k => $p) {
                    if (!$p['team'] || $p['excl'] || isset($p['req'][$d])) continue;
                    $mine = isset($p['days'][$d]);
                    if ($mine && empty($auto[$k][$d])) continue; // elle yazılmış güne dokunma
                    if ($mine && ($p['days'][$d]['code'] ?? '') === $tRow['code']) continue;
                    $saved = $mine ? $p['days'][$d] : null;
                    if ($mine) unset($P[$k]['days'][$d]);
                    $ok = $canAdd($k, $d, $tRow);
                    if ($mine) $P[$k]['days'][$d] = $saved;
                    if ($ok) $c[] = [[(int)($teamCount[$tag][$k] ?? 0), $hours($k), random_int(0, 1000000)], $k];
                }
                if (!$c) break;
                $k = $pick($c);
                if (isset($P[$k]['days'][$d])) $unput($k, $d);
                $put($k, $d, $tRow);
                $teamCount[$tag][$k] = ($teamCount[$tag][$k] ?? 0) + 1;
                $teamDone[$tag][] = ['date' => $d, 'name' => $P[$k]['name']];
                $got++;
            }
        }
    }
    $outCells = [];
    foreach ($cells as $rid => $c) $outCells[$rid] = (object)array_filter($c, fn($x) => (bool)$x);
    out(['cells' => (object)$outCells, 'filled' => max(0, $filled), 'unfilled' => $unfilled, 'cross' => $cross, 'team' => $teamDone, 'balanced' => $balanced, 'opts' => $opt]);
}

/** Denetim: her liste ayrı (kurallar önceki ayla), gün gün taraf kapsaması ve karşıya geçecek sayısı */
function a_plan_sides_check(): void
{
    need_publisher();
    pt_need_ok();
    $ym = plan_ym();
    $drafts = pt_drafts_in($ym);
    $out = [];
    foreach (pt_sides() as $sd) {
        $rid = (int)$sd['roster_id'];
        $c = plan_check($drafts[$rid], $ym, $rid);
        $out[] = ['key' => $sd['key'], 'roster_id' => $rid, 'issues' => $c['issues'], 'hours' => $c['hours']];
    }
    out(['sides' => $out]);
}

return [
    'plan.sides.get' => 'a_plan_sides_get',
    'plan.sides.flags' => 'a_plan_sides_flags',
    'plan.sides.auto' => 'a_plan_sides_auto',
    'plan.sides.check' => 'a_plan_sides_check',
];
