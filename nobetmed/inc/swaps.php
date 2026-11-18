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

function swap_interval(string $date, array $row): ?array
{
    if (($row['kind'] ?? '') !== 'shift') return null;
    $st = $row['start_time'] ?? null;
    $en = $row['end_time'] ?? null;
    if (!$st || !$en) {
        $h = (int)($row['hours'] ?? 0);
        if ($h <= 0) return null;
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
function swap_options(array $me, string $date): array
{
    $mine = swap_my_shift($me, $date);
    if (!$mine) throw new RuntimeException('Bu gün listede nöbetin görünmüyor.');
    $rid = (int)$mine['roster_id'];
    $from = date('Y-m-d', strtotime($date . ' -45 days'));
    $to = date('Y-m-d', strtotime($date . ' +45 days'));
    $tl = swap_timeline($rid, $from, $to);
    $mk = swap_key((string)$mine['name']);
    if (!isset($tl[$mk])) throw new RuntimeException('Listede adın bulunamadı.');
    $rules = swap_rules();
    $today = date('Y-m-d');
    $myDays = $tl[$mk]['days'];
    $myRow = $myDays[$date];
    $users = all("SELECT id, name, phone FROM users WHERE status = 'active'");
    // Devredersem bende boşluk oluşur mu?
    $meWithout = $myDays;
    unset($meWithout[$date]);
    $myGive = swap_check($meWithout, [], [$date], $rules, 'Senin');
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
        // Devir
        if (isset($pd[$date])) {
            $blocked[] = $person + ['reason' => swap_fmt_date($date) . ' günü zaten listede (' . $pd[$date]['code'] . ')'];
        } else {
            $np = $pd;
            $np[$date] = $myRow;
            $err = swap_check($np, [$date], [], $rules, $first);
            if ($err) $blocked[] = $person + ['reason' => $err];
            elseif (!$myGive) $give[] = $person;
        }
        // Değişim: onun nöbetlerinden biriyle
        $opts = [];
        foreach ($pd as $e => $row) {
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
        'mine' => ['date' => $date, 'code' => $myRow['code'], 'label' => $myRow['label'], 'hours' => $myRow['hours'] !== null ? (int)$myRow['hours'] : null,
            'start' => $myRow['start_time'], 'end' => $myRow['end_time'], 'roster_id' => $rid, 'roster' => $mine['roster_name'], 'name' => $mine['name']],
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
    foreach ($reqs as $q) {
        $ok = $has($q['to_name'], $q['from_date']) && !$has($q['from_name'], $q['from_date']);
        if ($ok && $q['kind'] === 'swap' && $q['to_date']) $ok = $has($q['from_name'], $q['to_date']) && !$has($q['to_name'], $q['to_date']);
        if (!$ok) continue;
        q("UPDATE swap_requests SET status = 'applied', applied_at = ? WHERE id = ?", [now(), $q['id']]);
        $users = all('SELECT * FROM users WHERE id IN (?, ?)', [(int)$q['from_user'], (int)($q['to_user'] ?? 0)]);
        $txt = $q['kind'] === 'swap'
            ? swap_fmt_date($q['from_date']) . ' ↔ ' . swap_fmt_date((string)$q['to_date']) . ' değişimi listeye işlendi.'
            : swap_fmt_date($q['from_date']) . ' nöbetinin devri listeye işlendi.';
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
