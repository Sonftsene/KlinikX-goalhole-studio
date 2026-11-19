<?php
/**
 * dupcii — nöbet değişimi / devri kuralları ve istekleri.
 *
 * Liste uygulamada değiştirilmez: istek kabul edilince sorumluya bildirilir, sorumlu Excel'i günceller,
 * güncel liste geldiğinde istek kendiliğinden "uygulandı" olur.
 *
 * Kurallar (ayarlardan değişebilir):
 *  - Üst üste çalışma en fazla 24 saat: 24 saatlik nöbet çıkışına (08:00) yeni nöbet eklenemez (48 saat olur).
 *  - Nöbetler arasında 5 gün boşluk olamaz (en fazla 4 boş gün). İzin/rapor günleri boşluk sayılmaz.
 */
declare(strict_types=1);

function swap_rules(): array
{
    return [
        'max_cont' => max(8, min(72, (int)setting('swap_max_cont', '24'))),
        'max_gap' => max(1, min(30, (int)setting('swap_max_gap', '4'))),
        'rest' => max(0, min(48, (int)setting('rule_rest', '16'))),
        // Hafta içi en az N iş günü izinli kişi iznin hemen öncesi/sonrasındaki Cmt-Paz ekstra çağrılmaz (0 = kapalı)
        'leave_wknd' => max(0, min(10, (int)setting('rule_leave_wknd', '5'))),
    ];
}

function swap_key(string $name): string
{
    return function_exists('gs_fold_spaced') ? gs_fold_spaced($name) : mb_strtolower(trim($name));
}

/** Gece içeren (ertesi güne taşan) nöbet mi: 16-08 ve 08-08 evet, 08-16 hayır */
function shift_is_night(array $row): bool
{
    if (($row['kind'] ?? 'shift') !== 'shift') return false;
    $st = $row['start_time'] ?? ($row['start'] ?? null);
    $en = $row['end_time'] ?? ($row['end'] ?? null);
    if ($st && $en) return $en <= $st;
    return (int)($row['hours'] ?? 0) >= 16;
}

/* ---------------- 24 saatlik nöbetin parçaları (4.14) ---------------- */

/** '' (tümü) | 'day' (08-16) | 'night' (16-08) */
function swap_part($p): string { return in_array($p, ['day', 'night'], true) ? (string)$p : ''; }
function swap_part_text(string $p): string { return ['day' => 'yalnız gündüz 08-16', 'night' => 'yalnız gece 16-08'][$p] ?? ''; }
/** 08-08 (24 saat) nöbet gündüz / gece olarak bölünebilir mi */
function swap_splittable(?array $row): bool
{
    if (!$row || ($row['kind'] ?? '') !== 'shift') return false;
    $st = $row['start_time'] ?? ($row['start'] ?? null);
    $en = $row['end_time'] ?? ($row['end'] ?? null);
    if ($st && $en) return $st === $en && $st === '08:00';
    return (int)($row['hours'] ?? 0) === 24;
}
/** [verilen parça, kalan parça] — kodlar listenin kendi gündüz / gece kodlarından */
function swap_split(array $row, string $part, int $rid): array
{
    $mk = function (string $p) use ($row, $rid): array {
        return co_row($p, $rid ? [$rid] : []) + ['date' => $row['date'] ?? null, 'name' => $row['name'] ?? null, 'title' => $row['title'] ?? null, 'roster_id' => $row['roster_id'] ?? $rid, 'part_of' => $row['code'] ?? null];
    };
    return [$mk($part), $mk($part === 'day' ? 'night' : 'day')];
}
/** Alan kişinin o günkü kaydına verilen parçayı ekle: boşsa parça; tamamlayan parçası varsa 24 saat; başka kayıt varsa null */
function swap_merge(?array $cur, array $given, int $rid): ?array
{
    if (!$cur) return $given;
    if (($cur['kind'] ?? '') !== 'shift') return null;
    $cs = $cur['start_time'] ?? null; $ce = $cur['end_time'] ?? null;
    $gs = $given['start_time'] ?? null; $ge = $given['end_time'] ?? null;
    if ($cs && $ce && $gs && $ge && (($ce === $gs && $cs === '08:00' && $ge === '08:00') || ($ge === $cs && $gs === '08:00' && $ce === '08:00')))
        return co_row('24', $rid ? [$rid] : []) + ['date' => $given['date'] ?? null, 'name' => $cur['name'] ?? null, 'roster_id' => $cur['roster_id'] ?? $rid];
    return null;
}

/** Bir listedeki kişilerin gün gün kayıtları: key => ['name','title','days' => [date => row]] */
function swap_timeline(int $rid, string $from, string $to): array
{
    $rows = all('SELECT s.* FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.date >= ? AND s.date <= ? ORDER BY s.date', [$rid, $from, $to]);
    $tl = [];
    foreach ($rows as $r) {
        // "Nöbet hesaplarına dahil etme" işaretli kişi hiçbir hesaba, yerleşime, çağrıya, değişime girmez
        if (function_exists('rules_is_excluded') && rules_is_excluded((string)$r['name'])) continue;
        $k = swap_key((string)$r['name']);
        if (!isset($tl[$k])) $tl[$k] = ['name' => $r['name'], 'title' => $r['title'], 'days' => []];
        if (!isset($tl[$k]['days'][$r['date']]) || $r['kind'] === 'shift') $tl[$k]['days'][$r['date']] = $r;
    }
    return $tl;
}

/**
 * Kabul edilmiş ama henüz Excel'e işlenmemiş değişimleri/devirleri ve seçilmiş eksik çağrılarını zaman çizelgesine uygular.
 * Kural denetimleri (değişim seçenekleri, ilan uygunluğu, çağrı adayları) böylece aynı nöbetin iki kez verilmesine izin vermez.
 */
function swap_pending_overlay(array $tl, string $from, string $to, int $rid = 0): array
{
    $mv = function (string $k, string $name) use (&$tl): void { if (!isset($tl[$k])) $tl[$k] = ['name' => $name, 'title' => null, 'days' => []]; };
    foreach (all("SELECT * FROM swap_requests WHERE status = 'accepted' AND ((from_date >= ? AND from_date <= ?) OR (to_date >= ? AND to_date <= ?))" . ($rid ? ' AND roster_id = ' . $rid : ''), [$from, $to, $from, $to]) as $r) {
        $gk = swap_key((string)$r['from_name']); $tk = swap_key((string)$r['to_name']);
        $gRow = $tl[$gk]['days'][$r['from_date']] ?? null;
        if (!$gRow || ($gRow['kind'] ?? '') !== 'shift') continue; // başka listenin değişimi ya da zaten işlenmiş
        $part = swap_part($r['part'] ?? null);
        if ($part !== '' && $r['kind'] === 'give') {
            // Parçalı devir: veren kalan parçayı tutar, alan verilen parçayı alır (Excel'e işlendiyse veren artık 24 saat değildir)
            if (!swap_splittable($gRow)) continue;
            [$given, $kept] = swap_split($gRow, $part, (int)$r['roster_id']);
            $tl[$gk]['days'][$r['from_date']] = $kept;
            $mv($tk, (string)$r['to_name']);
            $tl[$tk]['days'][$r['from_date']] = swap_merge($tl[$tk]['days'][$r['from_date']] ?? null, $given, (int)$r['roster_id']) ?? $given;
            continue;
        }
        $tRow = $r['kind'] === 'swap' && $r['to_date'] ? ($tl[$tk]['days'][$r['to_date']] ?? null) : null;
        unset($tl[$gk]['days'][$r['from_date']]);
        $mv($tk, (string)$r['to_name']);
        $tl[$tk]['days'][$r['from_date']] = $gRow;
        if ($tRow && ($tRow['kind'] ?? '') === 'shift') {
            unset($tl[$tk]['days'][$r['to_date']]);
            $tl[$gk]['days'][$r['to_date']] = $tRow;
        }
    }
    if (function_exists('co_row')) {
        foreach (all("SELECT c.id, c.date, c.shift, c.code, c.meta, r.name, r.move_from FROM callouts c JOIN callout_resp r ON r.callout_id = c.id WHERE r.chosen = 1 AND c.status IN ('open', 'filled') AND c.date >= ? AND c.date <= ?", [$from, $to]) as $c) {
            $m = json_decode((string)$c['meta'], true);
            if (!empty($m['applied'])) continue;
            $k = swap_key((string)$c['name']);
            if (!isset($tl[$k])) continue; // bu listenin kişisi değil
            if (isset($tl[$k]['days'][$c['date']]) && ($tl[$k]['days'][$c['date']]['kind'] ?? '') === 'shift') continue; // Excel'e işlenmiş
            if ($c['move_from']) unset($tl[$k]['days'][$c['move_from']]);
            $tl[$k]['days'][$c['date']] = co_row((string)$c['shift'], [], (string)$c['code']) + ['date' => $c['date'], 'name' => $c['name']];
        }
    }
    foreach ($tl as &$p) ksort($p['days']);
    unset($p);
    return $tl;
}

function swap_interval(string $date, array $row): ?array
{
    if (($row['kind'] ?? '') !== 'shift') return null;
    $st = $row['start_time'] ?? null;
    $en = $row['end_time'] ?? null;
    if (!$st || !$en) {
        $h = (int)($row['hours'] ?? 0);
        // Saati bilinmeyen nöbet kodu (sözlükte yok): kurallar atlanmasın diye en temkinli varsayım 08:00'den 24 saat
        if ($h <= 0) $h = 24;
        $s = strtotime($date . ' 08:00');
        return [$s, $s + $h * 3600];
    }
    $s = strtotime($date . ' ' . $st);
    $e = strtotime($date . ' ' . $en);
    if ($e <= $s) $e += 86400;
    return [$s, $e];
}

function swap_fmt_date(string $d): string
{
    $m = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return (int)substr($d, 8, 2) . ' ' . $m[(int)substr($d, 5, 2) - 1];
}

/**
 * Kişinin değişiklik sonrası günlerini kurallara göre denetler.
 * $added: nöbet eklenen tarihler, $removed: nöbeti çıkarılan tarihler. Hata yoksa null.
 */
function swap_check(array $days, array $added, array $removed, array $rules, string $who): ?string
{
    // 1) Üst üste çalışma
    if ($added) {
        $iv = [];
        foreach ($days as $d => $row) { $x = swap_interval($d, $row); if ($x) $iv[] = $x + [2 => in_array($d, $added, true)]; }
        usort($iv, fn($a, $b) => $a[0] <=> $b[0]);
        $blk = null;
        $check = function ($b) use ($rules, $who) {
            if ($b && $b[2] && ($b[1] - $b[0]) / 3600 > $rules['max_cont']) {
                $h = (int)round(($b[1] - $b[0]) / 3600);
                return "$who için üst üste $h saat çalışma olur (en fazla {$rules['max_cont']} saat; 24 saat çıkışına nöbet eklenemez)";
            }
            return null;
        };
        foreach ($iv as $x) {
            if ($blk && $x[0] <= $blk[1]) { $blk[1] = max($blk[1], $x[1]); $blk[2] = $blk[2] || $x[2]; continue; }
            if ($e = $check($blk)) return $e;
            $blk = $x;
        }
        if ($e = $check($blk)) return $e;
        // Dinlenme: eklenen nöbetin öncesinde ve sonrasında, nöbetten çıkış ile yeni başlangıç arası en az N saat
        $rest = (int)($rules['rest'] ?? 0) * 3600;
        $n = count($iv);
        for ($k = 0; $k < $n; $k++) {
            if (!$iv[$k][2]) continue;
            foreach ([$k - 1, $k + 1] as $j) {
                if ($j < 0 || $j >= $n) continue;
                [$a, $b] = $j < $k ? [$iv[$j], $iv[$k]] : [$iv[$k], $iv[$j]];
                $gap = $b[0] - $a[1];
                if ($gap < 0) return "$who için iki nöbet çakışıyor";
                if ($gap > 0 && $gap < $rest) return "$who için dinlenme " . round($gap / 3600) . " saat kalır (nöbetten çıkınca en az {$rules['rest']} saat dinlenme)";
            }
        }
    }
    // 2) Uzun boşluk (izin/rapor günleri dolu sayılır)
    if ($removed) {
        $occ = array_keys($days);
        sort($occ);
        foreach ($removed as $d) {
            $prev = null;
            $next = null;
            foreach ($occ as $o) { if ($o < $d) $prev = $o; elseif ($o > $d && $next === null) $next = $o; }
            if ($prev === null || $next === null) continue; // listenin dışında kalan uç: bilinmiyor
            $gap = (int)round((strtotime($next) - strtotime($prev)) / 86400) - 1;
            if ($gap > $rules['max_gap']) {
                $a = date('Y-m-d', strtotime($prev . ' +1 day'));
                $b = date('Y-m-d', strtotime($next . ' -1 day'));
                return "$who için $gap günlük boşluk oluşur (" . swap_fmt_date($a) . ' – ' . swap_fmt_date($b) . "; en fazla {$rules['max_gap']} gün)";
            }
        }
    }
    return null;
}

/** Kullanıcının o günkü nöbet kaydı ve listesi */
function swap_my_shift(array $me, string $date): ?array
{
    $rows = all("SELECT s.*, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ? AND s.kind = 'shift'", [$date]);
    foreach ($rows as $r) if (names_match((string)$r['name'], (string)$me['name'])) return $r;
    return null;
}

function swap_user_for(string $name, ?array $users = null): ?array
{
    $users = $users ?? all("SELECT id, name, phone, role, notify_mode, push_on, email, status FROM users WHERE status = 'active'");
    foreach ($users as $u) if (names_match($name, (string)$u['name'])) return $u;
    return null;
}

/** Değişim/devir seçenekleri */
function swap_options(array $me, string $date, string $part = ''): array
{
    $part = swap_part($part);
    $mine = swap_my_shift($me, $date);
    if (!$mine) throw new RuntimeException('Bu gün listede nöbetin görünmüyor.');
    $rid = (int)$mine['roster_id'];
    $from = date('Y-m-d', strtotime($date . ' -45 days'));
    $to = date('Y-m-d', strtotime($date . ' +45 days'));
    $tl = swap_pending_overlay(swap_timeline($rid, $from, $to), $from, $to, $rid);
    $mk = swap_key((string)$mine['name']);
    if (!isset($tl[$mk])) throw new RuntimeException('Listede adın bulunamadı.');
    if (!isset($tl[$mk]['days'][$date])) throw new RuntimeException('Bu nöbetin için kabul edilmiş bir değişim/devir zaten var.');
    $rules = swap_rules();
    $today = date('Y-m-d');
    $myDays = $tl[$mk]['days'];
    $myRow = $myDays[$date];
    $fullRow = $myRow;
    if ($part !== '' && !swap_splittable($myRow)) throw new RuntimeException('Yalnız 24 saatlik (08-08) nöbetin gündüzü ya da gecesi ayrı devredilebilir.');
    $kept = null;
    if ($part !== '') [$myRow, $kept] = swap_split($myRow, $part, $rid);
    $users = all("SELECT id, name, phone FROM users WHERE status = 'active'");
    // Devredersem bende boşluk oluşur mu? (parçalı devirde o gün nöbetim kalır: boşluk oluşmaz)
    $meWithout = $myDays;
    if ($kept) $meWithout[$date] = $kept; else unset($meWithout[$date]);
    $myGive = $kept ? null : swap_check($meWithout, [], [$date], $rules, 'Senin');
    $give = [];
    $swap = [];
    $blocked = [];
    foreach ($tl as $k => $p) {
        if ($k === $mk) continue;
        // Yalnız o ayın listesinde adı geçenler (önceki ayın listesinden kalanlar seçenek olmaz)
        if (!array_filter(array_keys($p['days']), fn($d) => strncmp((string)$d, substr($date, 0, 7), 7) === 0)) continue;
        $u = swap_user_for((string)$p['name'], $users);
        $person = ['name' => $p['name'], 'title' => $p['title'], 'user_id' => $u ? (int)$u['id'] : null, 'phone' => $u['phone'] ?? null];
        $pd = $p['days'];
        $first = explode(' ', trim((string)$p['name']))[0];
        // Devir (parçalıda: tamamlayan parçası olan kişi 24 saate tamamlayabilir)
        $merged = $part !== '' ? swap_merge($pd[$date] ?? null, $myRow, $rid) : (isset($pd[$date]) ? null : $myRow);
        if (!$merged) {
            $blocked[] = $person + ['reason' => swap_fmt_date($date) . ' günü zaten listede (' . $pd[$date]['code'] . ')'];
        } else {
            $np = $pd;
            unset($np[$date]);
            $np[$date] = $merged;
            $err = swap_check($np, [$date], [], $rules, $first);
            if ($err) $blocked[] = $person + ['reason' => $err];
            elseif (!$myGive) $give[] = $person;
        }
        // Değişim: onun nöbetlerinden biriyle (yalnız nöbetin tamamı)
        $opts = [];
        if ($part === '') foreach ($pd as $e => $row) {
            if ($e === $date || $row['kind'] !== 'shift' || $e < $today || isset($myDays[$e]) || isset($pd[$date])) continue;
            if (abs(strtotime($e) - strtotime($date)) > 31 * 86400) continue;
            $nm = $meWithout;
            $nm[$e] = $row;
            $np = $pd;
            unset($np[$e]);
            $np[$date] = $myRow;
            $err = swap_check($nm, [$e], [$date], $rules, 'Senin') ?? swap_check($np, [$date], [$e], $rules, $first);
            if (!$err) $opts[] = ['date' => $e, 'code' => $row['code'], 'label' => $row['label'], 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null];
        }
        if ($opts) $swap[] = $person + ['options' => $opts];
    }
    usort($give, fn($a, $b) => strcmp((string)$a['name'], (string)$b['name']));
    usort($swap, fn($a, $b) => strcmp((string)$a['name'], (string)$b['name']));
    return [
        'mine' => ['date' => $date, 'code' => $fullRow['code'], 'label' => $fullRow['label'], 'hours' => $fullRow['hours'] !== null ? (int)$fullRow['hours'] : null,
            'start' => $fullRow['start_time'], 'end' => $fullRow['end_time'], 'roster_id' => $rid, 'roster' => $mine['roster_name'], 'name' => $mine['name'],
            'parts' => swap_splittable($fullRow), 'part' => $part, 'part_code' => $part !== '' ? $myRow['code'] : null],
        'give' => $give, 'give_error' => $myGive, 'swap' => $swap, 'blocked' => $blocked, 'rules' => $rules,
    ];
}

/** Kabul edilmiş isteklerin Excel'e işlenip işlenmediğini güncel listeye bakarak kontrol eder */
function swap_check_applied(int $rid): int
{
    $reqs = all("SELECT * FROM swap_requests WHERE roster_id = ? AND status = 'accepted'", [$rid]);
    if (!$reqs) return 0;
    $has = function (string $name, string $date) use ($rid): bool {
        foreach (all("SELECT s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.date = ? AND s.kind = 'shift'", [$rid, $date]) as $r) {
            if (names_match((string)$r['name'], $name)) return true;
        }
        return false;
    };
    $n = 0;
    $rowOf = function (string $name, string $date) use ($rid): ?array {
        foreach (all("SELECT s.* FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.date = ? AND s.kind = 'shift'", [$rid, $date]) as $r) {
            if (names_match((string)$r['name'], $name)) return $r;
        }
        return null;
    };
    foreach ($reqs as $q) {
        if (swap_part($q['part'] ?? null) !== '' && $q['kind'] === 'give') {
            // Parçalı devir: alanın o gün nöbeti var, verenin nöbeti artık 24 saat değil
            $g = $rowOf($q['from_name'], $q['from_date']);
            $ok = $has($q['to_name'], $q['from_date']) && $g && !swap_splittable($g);
        } else
        $ok = $has($q['to_name'], $q['from_date']) && !$has($q['from_name'], $q['from_date']);
        if ($ok && $q['kind'] === 'swap' && $q['to_date']) $ok = $has($q['from_name'], $q['to_date']) && !$has($q['to_name'], $q['to_date']);
        if (!$ok) continue;
        q("UPDATE swap_requests SET status = 'applied', applied_at = ? WHERE id = ?", [now(), $q['id']]);
        $users = all('SELECT * FROM users WHERE id IN (?, ?)', [(int)$q['from_user'], (int)($q['to_user'] ?? 0)]);
        $txt = $q['kind'] === 'swap'
            ? swap_fmt_date($q['from_date']) . ' ↔ ' . swap_fmt_date((string)$q['to_date']) . ' değişimi listeye işlendi.'
            : swap_fmt_date($q['from_date']) . ' nöbetinin ' . (swap_part($q['part'] ?? null) !== '' ? '(' . swap_part_text(swap_part($q['part'])) . ') ' : '') . 'devri listeye işlendi.';
        notify_users($users, 'swap', 'Nöbet değişimi listede', $q['from_name'] . ' – ' . $q['to_name'] . ': ' . $txt, '#/nobetim', null);
        $n++;
    }
    return $n;
}

/** Süresi geçen istekler */
function swap_expire(): void
{
    $today = date('Y-m-d');
    q("UPDATE swap_requests SET status = 'expired' WHERE status = 'pending' AND from_date < ?", [$today]);
    q("UPDATE swap_requests SET status = 'expired' WHERE status = 'accepted' AND from_date < ?", [date('Y-m-d', strtotime('-7 days'))]);
}
