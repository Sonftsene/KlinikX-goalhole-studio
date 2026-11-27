<?php
/**
 * dupcii — ortak nöbet kuralları ve yardımcıları (istekler, ilan, eksik çağrısı ve blok yerleşimi hepsi bunu kullanır).
 *
 *  rules_cfg()                       ['rest' => 16, 'max_cont' => 24, 'max_gap' => 4]
 *  rules_check_add($days, $date, $row, $who)       kişi bu nöbeti alabilir mi (null = evet, metin = neden)
 *  holiday_on($date) / day_type($date)             'weekend' (Cmt/Paz/tam gün tatil) | 'weekday'
 *  needs_for_date($date)             [birim => ['day' => n, 'night' => n]]
 *  rules_is_exempt($name, $scope, $date)           muaf mı (scope: kura | kaydirma | cagri)
 *  rules_fair_stats($rid, $date)                   kişi bazlı adalet ölçüleri
 *  rules_fair_sort($list, $stats)                  adalet sırasına göre sıralar (eşitlikte sabit, kura ayrı)
 */
declare(strict_types=1);

function rules_cfg(): array
{
    return swap_rules();
}

/** Kişinin günlerine $date günü $row nöbetini eklemek kurallara uyar mı */
function rules_check_add(array $days, string $date, array $row, string $who = 'Bu kişi'): ?string
{
    if (isset($days[$date])) return $who . ' o gün zaten listede (' . ($days[$date]['code'] ?? '') . ')';
    $days[$date] = $row;
    return swap_check($days, [$date], [], rules_cfg(), $who);
}

/** Onaylı yıllık izin isteği var mı (istek modülü; $pending: bekleyenler de) */
function rules_req_on(string $name, string $date, array $kinds = ['izin'], bool $pending = false): ?array
{
    static $cache = [];
    $k = $date . ($pending ? '+p' : '');
    if (!array_key_exists($k, $cache)) {
        try { $cache[$k] = all('SELECT name, kind, status FROM shift_requests WHERE date = ? AND status IN (' . ($pending ? "'approved', 'pending'" : "'approved'") . ')', [$date]); } catch (Throwable $e) { $cache[$k] = []; }
    }
    foreach ($cache[$k] as $q) if (in_array($q['kind'], $kinds, true) && names_match((string)$q['name'], $name)) return $q;
    return null;
}

/**
 * İzin bitişiği hafta sonu: hafta içi en az N iş günü (varsayılan 5) izinli kişi, izninin hemen öncesindeki ve
 * sonrasındaki Cumartesi–Pazar ekstra nöbete (eksik çağrısı, kaydırma, ekstra nöbet listesi) çağrılmaz.
 * İzin: listedeki izin kodları (Yİ, Rp, İ…) ya da onaylı yıllık izin isteği. Tam gün resmî tatil izin haftasına sayılır.
 * Döner: neden metni ya da null.
 */
function rules_leave_weekend(array $days, string $date, string $name = ''): ?string
{
    $min = (int)(rules_cfg()['leave_wknd'] ?? 5);
    if ($min <= 0) return null;
    $w = (int)date('w', strtotime($date));
    if ($w !== 0 && $w !== 6) return null;
    $isLeave = function (string $d) use ($days, $name): bool {
        $r = $days[$d] ?? null;
        if ($r) return ($r['kind'] ?? '') === 'leave';
        return $name !== '' && rules_req_on($name, $d) !== null;
    };
    // $start'tan $dir yönünde hafta sonlarını atlayarak kesintisiz izinli iş günlerini say
    $count = function (string $start, int $dir) use ($isLeave): int {
        $n = 0; $leave = false; $d = $start;
        for ($i = 0; $i < 70; $i++) {
            $wd = (int)date('w', strtotime($d));
            if ($wd !== 0 && $wd !== 6) {
                $h = holiday_on($d);
                if ($isLeave($d)) { $n++; $leave = true; }
                elseif ($h && !$h['half']) $n++;
                else break;
            }
            $d = date('Y-m-d', strtotime($d . ($dir > 0 ? ' +1 day' : ' -1 day')));
        }
        return $leave ? $n : 0;
    };
    $fri = date('Y-m-d', strtotime($date . ($w === 6 ? ' -1 day' : ' -2 day')));
    $mon = date('Y-m-d', strtotime($date . ($w === 6 ? ' +2 day' : ' +1 day')));
    if (($n = $count($fri, -1)) >= $min) return 'İzin dönüşü hafta sonu (' . $n . ' iş günü izinden hemen sonra)';
    if (($n = $count($mon, 1)) >= $min) return 'İzin öncesi hafta sonu (' . $n . ' iş günü iznin hemen öncesi)';
    return null;
}

/* ------------------------------------------------------------------ */
/* Resmî tatiller                                                      */
/* ------------------------------------------------------------------ */

function holidays_between(string $from, string $to): array
{
    $out = [];
    foreach (all('SELECT date, name, half FROM holidays WHERE date >= ? AND date <= ? ORDER BY date', [$from, $to]) as $h) $out[$h['date']] = ['name' => $h['name'], 'half' => (bool)$h['half']];
    return $out;
}

function holiday_on(string $date): ?array
{
    static $cache = [];
    if (!array_key_exists($date, $cache)) {
        $h = one('SELECT name, half FROM holidays WHERE date = ?', [$date]);
        $cache[$date] = $h ? ['name' => $h['name'], 'half' => (bool)$h['half']] : null;
    }
    return $cache[$date];
}

/** Hafta sonu veya tam gün resmî tatil -> 'weekend', diğerleri 'weekday' */
function day_type(string $date): string
{
    $w = (int)date('w', strtotime($date));
    if ($w === 0 || $w === 6) return 'weekend';
    $h = holiday_on($date);
    return $h && !$h['half'] ? 'weekend' : 'weekday';
}

/* ------------------------------------------------------------------ */
/* Gereken nöbetçi sayıları (birim × gün türü × dönem)                 */
/* ------------------------------------------------------------------ */

function needs_all(): array
{
    $out = [];
    foreach (all('SELECT unit, day_type, period, count FROM staff_needs') as $r) $out[$r['unit']][$r['day_type']][$r['period']] = (int)$r['count'];
    return $out;
}

/** [birim => ['day' => n, 'night' => n]] o güne göre (hafta içi / hafta sonu-tatil) */
function needs_for_date(string $date): array
{
    $dt = day_type($date);
    $out = [];
    foreach (needs_all() as $unit => $byType) $out[$unit] = ['day' => (int)($byType[$dt]['day'] ?? 0), 'night' => (int)($byType[$dt]['night'] ?? 0)];
    return $out;
}

/** Taraf toplamı: [tarafAnahtarı => ['day' => n, 'night' => n]] */
function needs_by_side(string $date): array
{
    $n = needs_for_date($date);
    $out = [];
    foreach (function_exists('sides_cfg') ? sides_cfg() : [] as $sd) {
        $out[$sd['key']] = ['day' => 0, 'night' => 0];
        foreach ($sd['units'] as $u) { $out[$sd['key']]['day'] += $n[$u]['day'] ?? 0; $out[$sd['key']]['night'] += $n[$u]['night'] ?? 0; }
    }
    return $out;
}

/** "HH:MM" → saat (24:00 = gece yarısı, günün sonu) */
function shift_hm(?string $v): ?float
{
    if (!$v || !preg_match('/^(\d{1,2}):(\d{2})$/', $v, $m)) return null;
    return (int)$m[1] + (int)$m[2] / 60;
}

/**
 * Her türlü vardiya (4.30): gündüzün (08-16) ve gecenin (16-08) kaçta kaçını kapsar — 0..1.
 * 08-16 → gündüz 1 · 16-08 → gece 1 · 08-08 → ikisi 1 · 08-24 → gündüz 1, gece ½ · 16-24 → gece ½ · 24-08 → gece ½ · 08-20 → gündüz 1, gece ¼.
 * Saati bilinmeyen kodda süreye göre eski varsayım.
 */
function shift_cover(array $row): array
{
    if (($row['kind'] ?? 'shift') !== 'shift') return ['day' => 0.0, 'night' => 0.0];
    $s = shift_hm($row['start_time'] ?? ($row['start'] ?? null));
    $e = shift_hm($row['end_time'] ?? ($row['end'] ?? null));
    if ($s === null || $e === null) {
        $h = (float)($row['hours'] ?? 0);
        if ($h >= 20) return ['day' => 1.0, 'night' => 1.0];
        return $h >= 16 ? ['day' => 0.0, 'night' => 1.0] : ['day' => 1.0, 'night' => 0.0];
    }
    if ($e <= $s) $e += 24;
    $ov = fn(float $a, float $b): float => max(0.0, min($e, $b) - max($s, $a));
    $day = ($ov(8, 16) + $ov(32, 40)) / 8;
    $night = ($ov(16, 32) + $ov(-8, 8)) / 16;
    return ['day' => round(min(1.0, $day), 3), 'night' => round(min(1.0, $night), 3)];
}

/** Bir nöbet kodunun hangi dönem(ler)i kapsadığı (en az yarısı): 08-16 -> [day], 16-08 -> [night], 08-08 -> [day, night] */
function shift_periods(array $row): array
{
    if (($row['kind'] ?? 'shift') !== 'shift') return [];
    $c = shift_cover($row);
    $o = [];
    if ($c['day'] >= 0.5) $o[] = 'day';
    if ($c['night'] >= 0.5) $o[] = 'night';
    if (!$o) $o[] = $c['night'] > $c['day'] ? 'night' : 'day';
    return $o;
}

/* ------------------------------------------------------------------ */
/* Muafiyet                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Hesaplara hiç dahil edilmeyenler (ör. yaşlı bakım personeli)        */
/* ------------------------------------------------------------------ */

/** [['name', 'user_id'|null, 'source' => 'user'|'name']] — kullanıcı işareti + hesabı olmayanlar için ad listesi */
function rules_excluded_list(): array
{
    $out = [];
    foreach (all("SELECT id, name FROM users WHERE no_duty = 1 ORDER BY name") as $u) $out[] = ['name' => $u['name'], 'user_id' => (int)$u['id'], 'source' => 'user'];
    $names = json_decode(setting('duty_excluded', '[]'), true);
    foreach (is_array($names) ? $names : [] as $n) if (is_string($n) && trim($n) !== '') $out[] = ['name' => $n, 'user_id' => null, 'source' => 'name'];
    return $out;
}

function rules_is_excluded(string $name): bool
{
    static $list = null;
    if ($list === null) $list = array_column(rules_excluded_list(), 'name');
    if (!$list || trim($name) === '') return false;
    foreach ($list as $n) if (names_match((string)$n, $name)) return true;
    return false;
}

/** {user_id, on} → kullanıcı işareti; {name, on} → hesabı olmayan kişi ad listesi */
function a_rules_excluded_save(): void
{
    $me = need_publisher();
    $on = b('on');
    if (i('user_id')) {
        $u = one('SELECT id, name FROM users WHERE id = ?', [(int)i('user_id')]) ?? fail('Kullanıcı bulunamadı.', 404);
        q('UPDATE users SET no_duty = ? WHERE id = ?', [$on ? 1 : 0, $u['id']]);
        $name = $u['name'];
    } else {
        $name = s('name', 120);
        if (mb_strlen($name) < 3) fail('Kişinin adını yazın.');
        $names = json_decode(setting('duty_excluded', '[]'), true);
        $names = array_values(array_filter(is_array($names) ? $names : [], fn($n) => is_string($n) && !names_match($n, $name)));
        if ($on) $names[] = $name;
        set_setting('duty_excluded', json_encode($names, JSON_UNESCAPED_UNICODE));
    }
    audit($me, 'settings.save', ($on ? 'Nöbet hesaplarına dahil değil: ' : 'Nöbet hesaplarına yeniden dahil: ') . $name);
    out(['excluded' => rules_excluded_list()]);
}

function rules_exempt_list(): array
{
    $today = date('Y-m-d');
    return array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'user_id' => $r['user_id'] !== null ? (int)$r['user_id'] : null, 'scope' => $r['scope'],
        'until' => $r['until'], 'note' => $r['note'], 'active' => !$r['until'] || $r['until'] >= $today],
        all('SELECT * FROM rule_exempt ORDER BY name'));
}

/** $scope: kura | kaydirma | cagri. Kayıttaki 'all' her şeyi kapsar. */
function rules_is_exempt(string $name, string $scope, ?string $date = null): bool
{
    static $rows = null;
    if ($rows === null) $rows = all('SELECT name, scope, until FROM rule_exempt');
    $date = $date ?? date('Y-m-d');
    foreach ($rows as $r) {
        if ($r['until'] && $r['until'] < $date) continue;
        if ($r['scope'] !== 'all' && $r['scope'] !== $scope) continue;
        if (names_match((string)$r['name'], $name)) return true;
    }
    return false;
}

/* ------------------------------------------------------------------ */
/* Adalet ölçüleri                                                     */
/* ------------------------------------------------------------------ */

/**
 * Nöbetin $ym ayına düşen saati (4.57.0). Birim “ay sınırında böl” ayarını açtıysa ay sonu / başındaki gece yarısını aşan
 * nöbet (ör. 30 Kasım 08-08) gece yarısında bölünür: 16 saati Kasım’a, 8 saati Aralık’a yazılır. Kapalıysa nöbetin tamamı
 * başladığı günün ayına sayılır (önceki davranış).
 */
function month_hours_of(string $d, array $row, string $ym): float
{
    $h = (float)($row['hours'] ?? 0);
    if (($row['kind'] ?? 'shift') !== 'shift' || $h <= 0) return 0.0;
    $inMonth = substr($d, 0, 7) === $ym;
    if (!function_exists('setting') || setting('month_split', '0') !== '1') return $inMonth ? $h : 0.0;
    $iv = function_exists('swap_interval') ? swap_interval($d, $row) : null;
    if (!$iv || $iv[1] <= $iv[0]) return $inMonth ? $h : 0.0;
    $m0 = strtotime($ym . '-01 00:00');
    $m1 = strtotime(date('Y-m-01', strtotime($ym . '-01 +1 month')) . ' 00:00');
    $part = max(0, min($iv[1], $m1) - max($iv[0], $m0));
    return round($h * $part / ($iv[1] - $iv[0]), 2);
}

/**
 * Listedeki herkes için: ay içi nöbet saati/sayısı, son 7 gün nöbet sayısı, önceki/sonraki nöbet,
 * boşluk (gün) ve karşı tarafa geçiş sayısı (blok yerleşimi modülü 'placement_cross_counts' sağlarsa).
 * Dönen: [ad anahtarı (swap_key) => [...]]
 */
function rules_fair_stats(int $rid, string $date): array
{
    $ym = substr($date, 0, 7);
    $tl = swap_timeline($rid, date('Y-m-d', strtotime($date . ' -40 days')), date('Y-m-d', strtotime($date . ' +40 days')));
    $cross = function_exists('placement_cross_counts') ? placement_cross_counts() : [];
    $t0 = strtotime($date . ' 00:00');
    $out = [];
    foreach ($tl as $k => $p) {
        $hours = 0; $shifts = 0; $last7 = 0; $prevEnd = null; $nextStart = null;
        foreach ($p['days'] as $d => $row) {
            if (($row['kind'] ?? '') !== 'shift') continue;
            $iv = swap_interval($d, $row);
            if (substr($d, 0, 7) === $ym) $shifts++;
            $hours += month_hours_of((string)$d, $row, $ym);
            if ($d < $date && $d >= date('Y-m-d', strtotime($date . ' -7 days'))) $last7++;
            if ($iv && $iv[1] <= $t0 && ($prevEnd === null || $iv[1] > $prevEnd)) $prevEnd = $iv[1];
            if ($iv && $iv[0] >= $t0 + 86400 && ($nextStart === null || $iv[0] < $nextStart)) $nextStart = $iv[0];
        }
        $out[$k] = [
            'name' => $p['name'], 'title' => $p['title'], 'month_hours' => (int)round($hours), 'month_shifts' => $shifts, 'last7' => $last7,
            'prev_end' => $prevEnd ? date('Y-m-d H:i', $prevEnd) : null, 'next_start' => $nextStart ? date('Y-m-d H:i', $nextStart) : null,
            'rest_before' => $prevEnd !== null ? (int)floor(($t0 - $prevEnd) / 3600) : null,
            'free_days' => ($prevEnd !== null ? (int)floor(($t0 - $prevEnd) / 86400) : 7) + ($nextStart !== null ? (int)floor(($nextStart - $t0 - 86400) / 86400) : 7),
            'cross' => (int)($cross[$k] ?? 0),
        ];
    }
    return $out;
}

/**
 * Adalet sırası: ① az karşı tarafa geçiş ② ay içinde az nöbet saati ③ son 7 günde az nöbet ④ çok boşluk.
 * $list: kişi dizileri (her biri 'name' içerir). Eşitler yan yana kalır; kura çağıran tarafta yapılır.
 */
function rules_fair_sort(array $list, array $stats, array $order = ['cross', 'month_hours', 'last7', '-free_days']): array
{
    $key = function ($p) use ($stats, $order) {
        $s = $stats[swap_key((string)$p['name'])] ?? [];
        return array_map(fn($k) => $k[0] === '-' ? -(int)($s[substr($k, 1)] ?? 0) : (int)($s[$k] ?? 0), $order);
    };
    usort($list, fn($a, $b) => $key($a) <=> $key($b));
    return $list;
}

/** Eşitler arasından rastgele seçim (kayıt için adaylar ve sonuç döner) */
function rules_draw(array $group): array
{
    $group = array_values($group);
    return $group ? $group[random_int(0, count($group) - 1)] : [];
}

/* ------------------------------------------------------------------ */
/* API: kurallar, gereken sayılar, muafiyet, tatiller (Ayarlar › Nöbet) */
/* ------------------------------------------------------------------ */

function rules_units(): array
{
    $u = [];
    foreach (function_exists('sides_cfg') ? sides_cfg() : [] as $sd) foreach ($sd['units'] as $x) $u[] = ['unit' => $x, 'side' => $sd['key'], 'side_name' => $sd['name']];
    return $u;
}

/** Güncel listelerde adı geçen herkes (hesabı olmasa da) — ad önerileri için */
function rules_roster_names(): array
{
    $from = date('Y-m-d', strtotime('-60 days')); $to = date('Y-m-d', strtotime('+60 days'));
    $seen = [];
    foreach (all("SELECT DISTINCT s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date >= ? AND s.date <= ? AND s.kind IN ('shift', 'leave', 'off', 'role')", [$from, $to]) as $r) {
        $n = trim((string)$r['name']);
        if ($n !== '') $seen[swap_key($n)] = $n;
    }
    $out = array_values($seen);
    usort($out, fn($a, $b) => strcmp(mb_strtolower($a), mb_strtolower($b)));
    return array_slice($out, 0, 600);
}

function a_rules_get(): void
{
    need_user();
    $pub = is_publisher(current_user());
    out(['rules' => rules_cfg(), 'needs' => (object)needs_all(), 'units' => rules_units(), 'exempt' => $pub ? rules_exempt_list() : [], 'excluded' => $pub ? rules_excluded_list() : [], 'names' => $pub ? rules_roster_names() : [],
        'holidays' => array_map(fn($d, $h) => ['date' => $d] + $h, array_keys($hh = holidays_between(date('Y-01-01'), date('Y-12-31', strtotime('+1 year')))), $hh)]);
}

function a_rules_needs_save(): void
{
    $me = need_publisher();
    $units = array_column(rules_units(), 'unit');
    db()->beginTransaction();
    q('DELETE FROM staff_needs');
    $n = 0;
    foreach (arr('needs') as $unit => $byType) {
        if (!in_array((string)$unit, $units, true) || !is_array($byType)) continue;
        foreach (['weekday', 'weekend'] as $dt) foreach (['day', 'night'] as $pr) {
            $c = max(0, min(30, (int)($byType[$dt][$pr] ?? 0)));
            q('INSERT INTO staff_needs (unit, day_type, period, count) VALUES (?, ?, ?, ?)', [(string)$unit, $dt, $pr, $c]);
            $n += $c;
        }
    }
    db()->commit();
    audit($me, 'settings.save', 'Gereken nöbetçi sayıları', $n . ' kişi-dönem');
    out(['needs' => (object)needs_all()]);
}

function a_rules_exempt_save(): void
{
    $me = need_publisher();
    $name = s('name', 120);
    if (mb_strlen($name) < 3) fail('Kişiyi seçin.');
    $scope = in_array(s('scope', 20), ['all', 'kura', 'kaydirma', 'cagri'], true) ? s('scope', 20) : 'all';
    $until = s('until', 10);
    if ($until !== '' && !valid_ymd($until)) fail('Geçersiz tarih.');
    $u = swap_user_for($name);
    q('INSERT INTO rule_exempt (name, user_id, scope, until, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$name, $u ? (int)$u['id'] : null, $scope, $until ?: null, s('note', 200) ?: null, $me['id'], now()]);
    audit($me, 'settings.save', 'Muafiyet: ' . $name, $scope . ($until ? ' · ' . $until . ' tarihine kadar' : ''));
    out(['exempt' => rules_exempt_list()]);
}

function a_rules_exempt_delete(): void
{
    $me = need_publisher();
    $r = one('SELECT name FROM rule_exempt WHERE id = ?', [(int)i('id')]) ?? fail('Bu kayıt silinmiş ya da değişmiş olabilir. Sayfayı yenileyin.', 404);
    q('DELETE FROM rule_exempt WHERE id = ?', [(int)i('id')]);
    audit($me, 'settings.save', 'Muafiyet kaldırıldı: ' . $r['name']);
    out(['exempt' => rules_exempt_list()]);
}

function a_holidays_save(): void
{
    $me = need_admin();
    $date = s('date', 10);
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    $name = s('name', 80);
    if ($name === '') {
        q('DELETE FROM holidays WHERE date = ?', [$date]);
        audit($me, 'settings.save', 'Tatil kaldırıldı', $date);
    } else {
        q('DELETE FROM holidays WHERE date = ?', [$date]);
        q('INSERT INTO holidays (date, name, half, custom) VALUES (?, ?, ?, 1)', [$date, $name, b('half') ? 1 : 0]);
        audit($me, 'settings.save', 'Tatil: ' . $name, $date . (b('half') ? ' (yarım gün)' : ''));
    }
    a_rules_get();
}
