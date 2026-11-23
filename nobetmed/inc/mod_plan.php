<?php
/**
 * Nöbet çizelgesi hazırlama (4.5): Excel kullanmayan birimler çizelgeyi portalda hazırlar.
 *  - Taslak (kişi × gün kodları) sunucuda saklanır; kural motoru denetler; eksik günler adalet sırasıyla otomatik doldurulabilir.
 *  - Yayınlanınca istemci aynı çizelgeyi Excel olarak üretip listeye yeni sürüm yükler ve nöbetleri kaydeder (rosters.upload +
 *    rosters.shifts). Böylece Takvimim, Kim nöbette, blok yerleşimi, ilan, eksik çağrısı ve hatırlatmalar aynen çalışır.
 *  - Google E-Tablolar'a bağlı listelerde kullanılmaz (o listeler tablodan gelir).
 */
declare(strict_types=1);

const PLAN_MAX_PEOPLE = 120;

/** Nöbet dışına alınan kişi (otomatik doldurmaya hiç girmez; yalnız elle yazılır) */
function pl_excluded_name(string $name): bool
{
    return function_exists('rules_is_excluded') && rules_is_excluded($name);
}

function plan_dict(): array
{
    if (function_exists('gs_load_parser')) gs_load_parser();
    $d = function_exists('shift_codes') ? shift_codes() : null;
    return $d ?: (function_exists('sp_default_codes') ? sp_default_codes() : []);
}

/** Kod → nöbet satırı (kural motorunun beklediği biçim) */
function plan_row(string $code, array $dict): array
{
    $c = function_exists('sp_classify_code') ? sp_classify_code($code, $dict) : null;
    return ['code' => $code, 'label' => $c['label'] ?? $code, 'kind' => $c['kind'] ?? 'shift', 'start_time' => $c['start'] ?? null, 'end_time' => $c['end'] ?? null,
        'hours' => isset($c['hours']) && is_numeric($c['hours']) ? (float)$c['hours'] : null];
}

function plan_roster(int $rid): array
{
    $r = one('SELECT * FROM rosters WHERE id = ?', [$rid]) ?? fail('Liste bulunamadı.', 404);
    if (($r['kind'] ?? 'nobet') === 'tablo') fail('Bu bir tablo; nöbet çizelgesi değil.');
    if ((int)($r['src_on'] ?? 0) === 1) fail('Bu liste Google E-Tablolar’a bağlı; çizelge tablodan gelir, burada hazırlanamaz.', 409);
    return $r;
}

function plan_ym(): string
{
    $ym = s('ym', 7);
    if (!preg_match('/^(20\d{2})-(0[1-9]|1[0-2])$/', $ym)) fail('Geçersiz ay.');
    return $ym;
}

function plan_days(string $ym): array
{
    $n = (int)date('t', strtotime($ym . '-01'));
    $o = [];
    for ($d = 1; $d <= $n; $d++) $o[] = $ym . '-' . str_pad((string)$d, 2, '0', STR_PAD_LEFT);
    return $o;
}

/** Gereken sayılar (varsayılan): listeye bağlı tarafın birimlerinin toplamı */
function plan_default_needs(int $rid): array
{
    $units = [];
    foreach (function_exists('sides_cfg') ? sides_cfg() : [] as $sd) if ((int)$sd['roster_id'] === $rid) $units = array_merge($units, $sd['units']);
    $o = ['weekday' => ['day' => 0, 'night' => 0], 'weekend' => ['day' => 0, 'night' => 0]];
    if (!function_exists('needs_all')) return $o;
    foreach (needs_all() as $u => $byType) {
        if ($units && !in_array($u, $units, true)) continue;
        foreach (['weekday', 'weekend'] as $dt) foreach (['day', 'night'] as $p) $o[$dt][$p] += (int)($byType[$dt][$p] ?? 0);
    }
    return $o;
}

/** İstemciden gelen taslağı temizle */
function plan_clean(array $in, string $ym): array
{
    $days = array_flip(plan_days($ym));
    $people = [];
    $seen = [];
    foreach (array_slice((array)($in['people'] ?? []), 0, PLAN_MAX_PEOPLE) as $p) {
        $n = mb_substr(trim((string)(is_array($p) ? ($p['name'] ?? '') : $p)), 0, 120);
        if ($n === '' || isset($seen[tr_lower($n)])) continue;
        $seen[tr_lower($n)] = 1;
        $people[] = ['name' => $n, 'title' => mb_substr(trim((string)(is_array($p) ? ($p['title'] ?? '') : '')), 0, 80)];
    }
    $cells = [];
    foreach ($people as $p) {
        foreach ((array)(($in['cells'] ?? [])[$p['name']] ?? []) as $d => $code) {
            $code = mb_substr(trim((string)$code), 0, 20);
            if ($code !== '' && isset($days[$d])) $cells[$p['name']][$d] = $code;
        }
    }
    $needs = [];
    foreach (['weekday', 'weekend'] as $dt) foreach (['day', 'night'] as $pp) $needs[$dt][$pp] = max(0, min(50, (int)(($in['needs'] ?? [])[$dt][$pp] ?? 0)));
    // Yöneticinin elle girdiği istekler (4.34): [ad => [tarih => 'bosluk'|'izin']] — onaylı istek gibi işlenir
    $reqs = [];
    $names = array_flip(array_column($people, 'name'));
    foreach ((array)($in['reqs'] ?? []) as $n => $row) {
        if (!isset($names[$n])) continue;
        foreach ((array)$row as $d => $k) if (isset($days[$d]) && in_array($k, ['bosluk', 'izin'], true)) $reqs[$n][$d] = $k;
    }
    // Resmi listede kişi başı saat düzeltmesi (ör. arife yarım günü): [ad => ['req' => saat]]
    $hfix = [];
    foreach ((array)($in['hfix'] ?? []) as $n => $x) if (isset($names[$n]) && is_array($x) && isset($x['req']) && is_numeric($x['req'])) $hfix[$n] = ['req' => max(0, min(400, round((float)$x['req'], 1)))];
    return ['people' => $people, 'cells' => (object)$cells, 'needs' => $needs, 'reqs' => (object)$reqs, 'hfix' => (object)$hfix,
        'day_code' => mb_substr(trim((string)($in['day_code'] ?? '')), 0, 20), 'night_code' => mb_substr(trim((string)($in['night_code'] ?? '')), 0, 20),
        'leave_code' => mb_substr(trim((string)($in['leave_code'] ?? '')), 0, 20),
        // Dağıtım biçimi (4.36): 'split' gündüz / gece ayrı · '24' önce 24 saatlik nöbet, kalan gündüz / gece ayrı
        'mode' => ($in['mode'] ?? '') === '24' ? '24' : 'split', 'full_code' => mb_substr(trim((string)($in['full_code'] ?? '')), 0, 20),
        // Saat eşitleme (4.38): otomatik yazılanlar fazla çalışandan az çalışana; 24 saat 08-16 / 16-08 olarak bölünebilir
        'balance' => !array_key_exists('balance', $in) || !empty($in['balance'])];
}

/**
 * Önceki ayın son günleri (kurallar ay sınırında da işlesin: ayın 31'i 24 saat çıkışına 1'inde nöbet yazılmasın,
 * dinlenme süresi, uzun boşluk). Kaynak: listenin yayınlanmış hâli (değişim / devirler dahil); yoksa önceki ayın taslağı.
 * Dönen: [swap_key(ad) => ['name' => ad, 'days' => [tarih => satır]]]
 */
function plan_prev_rows(int $rid, string $ym, int $n = 10): array
{
    static $cache = [];
    $ck = $rid . '|' . $ym . '|' . $n;
    if (isset($cache[$ck])) return $cache[$ck];
    $to = date('Y-m-d', strtotime($ym . '-01 -1 day'));
    $from = date('Y-m-d', strtotime($to . ' -' . ($n - 1) . ' day'));
    $out = [];
    if (function_exists('swap_timeline')) {
        try {
            foreach (swap_timeline($rid, $from, $to) as $k => $p) {
                $days = [];
                foreach ($p['days'] as $d => $row) if ($d >= $from && $d <= $to) $days[$d] = $row;
                if ($days) $out[$k] = ['name' => (string)$p['name'], 'days' => $days];
            }
        } catch (Throwable $e) { $out = []; }
    }
    if (!$out) {
        // Liste yeni aya geçtiyse önceki ayın nöbetleri eski dosya sürümündedir: o aralığı içeren en son dosya
        $fid = (int)val('SELECT MAX(file_id) FROM roster_shifts WHERE roster_id = ? AND date >= ? AND date <= ?', [$rid, $from, $to]);
        if ($fid) foreach (all('SELECT * FROM roster_shifts WHERE roster_id = ? AND file_id = ? AND date >= ? AND date <= ? ORDER BY date', [$rid, $fid, $from, $to]) as $r) {
            if (function_exists('rules_is_excluded') && rules_is_excluded((string)$r['name'])) continue;
            $k = swap_key((string)$r['name']);
            if (!isset($out[$k])) $out[$k] = ['name' => (string)$r['name'], 'days' => []];
            if (!isset($out[$k]['days'][$r['date']]) || $r['kind'] === 'shift') $out[$k]['days'][$r['date']] = $r;
        }
    }
    if (!$out) {
        $dr = one('SELECT data FROM plan_drafts WHERE roster_id = ? AND ym = ?', [$rid, substr($to, 0, 7)]);
        $data = $dr ? (json_decode((string)$dr['data'], true) ?: []) : [];
        $dict = plan_dict();
        foreach ((array)($data['cells'] ?? []) as $name => $row) {
            $days = [];
            foreach ((array)$row as $d => $code) if ($d >= $from && $d <= $to && (string)$code !== '') $days[$d] = plan_row((string)$code, $dict);
            if ($days) { ksort($days); $out[swap_key((string)$name)] = ['name' => (string)$name, 'days' => $days]; }
        }
    }
    return $cache[$ck] = $out;
}
function plan_prev_for(array $prev, string $name): array
{
    $k = swap_key($name);
    if (isset($prev[$k])) return $prev[$k]['days'];
    foreach ($prev as $p) if (names_match($p['name'], $name)) return $p['days'];
    return [];
}

/** Onaylı istekler: [ad => [tarih => 'bosluk'|'izin']] */
function plan_requests(string $ym, int $rid): array
{
    $o = [];
    try {
        foreach (all("SELECT r.name, r.date, r.kind FROM shift_requests r WHERE r.date >= ? AND r.date <= ? AND r.status = 'approved' AND (r.roster_id IS NULL OR r.roster_id = ?)", [$ym . '-01', date('Y-m-t', strtotime($ym . '-01')), $rid]) as $r) $o[$r['name']][$r['date']] = $r['kind'];
    } catch (Throwable $e) { /* istekler modülü yok */ }
    return $o;
}
function plan_req_for(array $reqs, string $name, array $manual = []): array
{
    $o = [];
    foreach ($reqs as $n => $days) if (names_match((string)$n, $name)) { $o = $days; break; }
    return ((array)($manual[$name] ?? [])) + $o;
}

function a_plan_get(): void
{
    need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    $dr = one('SELECT * FROM plan_drafts WHERE roster_id = ? AND ym = ?', [$r['id'], $ym]);
    $from = 'draft';
    if ($dr) {
        $data = json_decode((string)$dr['data'], true) ?: [];
    } else {
        // Taslak yok: listede bu ayın nöbetleri varsa onlardan, yoksa nöbete dahil kişilerle boş çizelge
        $cells = [];
        $people = [];
        $seen = [];
        foreach (all('SELECT s.name, s.title, s.date, s.code FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.date LIKE ? ORDER BY s.id', [$r['id'], $ym . '-%']) as $x) {
            if (!isset($seen[tr_lower($x['name'])])) { $seen[tr_lower($x['name'])] = 1; $people[] = ['name' => $x['name'], 'title' => (string)$x['title']]; }
            $cells[$x['name']][$x['date']] = $x['code'];
        }
        // Yayınlanmış listenin güncel hâli (kabul edilen değişim / devir / çağrılar dahil)
        if ($people && function_exists('pc_sync_draft')) {
            $data0 = ['people' => $people, 'cells' => $cells];
            [$data0] = pc_sync_draft((int)$r['id'], $ym, $data0);
            $people = $data0['people']; $cells = $data0['cells'];
        }
        $from = $people ? 'liste' : 'bos';
        if (!$people) foreach (all("SELECT u.name, t.name AS title FROM users u LEFT JOIN titles t ON t.id = u.title_id WHERE u.status = 'active' AND COALESCE(u.no_duty, 0) = 0 ORDER BY u.name") as $u) $people[] = ['name' => $u['name'], 'title' => (string)$u['title']];
        $data = ['people' => $people, 'cells' => $cells, 'needs' => plan_default_needs((int)$r['id'])];
    }
    // Yayından sonra kabul edilen değişim / devir / çağrılar taslağa işlenir (yönetici o hücreyi değiştirmediyse)
    $synced = 0;
    if ($dr && ($dr['status'] ?? '') === 'published' && function_exists('pc_sync_draft')) {
        try { [$data, $synced] = pc_sync_draft((int)$r['id'], $ym, $data); } catch (Throwable $e) { error_log('[dupcii] çizelge güncel hâl: ' . $e->getMessage()); }
    }
    if (isset($data['people']) && is_array($data['people'])) $data['people'] = plan_titles_fill($data['people']);
    $pt = plan_titles();
    $marks = [];
    if (function_exists('pc_marks')) { try { pc_sync((int)$r['id'], $ym); $marks = pc_marks((int)$r['id'], $ym); } catch (Throwable $e) { error_log('[dupcii] çizelge değişiklikleri: ' . $e->getMessage()); } }
    $hol = [];
    $half = [];
    $pd = plan_days($ym);
    if (function_exists('holidays_between')) foreach (holidays_between($pd[0], $pd[count($pd) - 1]) as $d => $h) { $hol[$d] = is_array($h) ? ($h['name'] ?? '') : (string)$h; if (is_array($h) && !empty($h['half'])) $half[] = $d; }
    $joint = function_exists('pt_sides') && count($ps = pt_sides()) >= 2 && in_array((int)$r['id'], array_map(fn($x) => (int)$x['roster_id'], $ps), true);
    out(['roster' => ['id' => (int)$r['id'], 'name' => $r['name']], 'ym' => $ym, 'from' => $from, 'draft' => $data, 'joint' => $joint,
        'published' => $dr ? ($dr['status'] ?? '') === 'published' : $from === 'liste', 'published_at' => $dr['published_at'] ?? null, 'synced' => $synced, 'marks' => (object)$marks, 'half' => $half,
        'signed' => function_exists('plan_signed_get') ? plan_signed_get((int)$r['id'], $ym) : null,
        'rules' => function_exists('swap_rules') ? swap_rules() : null,
        'titles' => ['known' => plan_titles_known($data['people'] ?? []), 'def' => $pt['def'], 'map' => (object)$pt['m']],
        'updated_at' => $dr['updated_at'] ?? null, 'updated_by' => $dr ? (string)val('SELECT name FROM users WHERE id = ?', [(int)$dr['updated_by']]) : null,
        'requests' => plan_requests($ym, (int)$r['id']), 'holidays' => (object)$hol, 'codes' => array_values(array_map(fn($c) => [
            'code' => (string)($c['code'] ?? ''), 'label' => (string)($c['label'] ?? ''), 'kind' => (string)($c['kind'] ?? 'shift'), 'start' => $c['start'] ?? null, 'end' => $c['end'] ?? null, 'hours' => $c['hours'] ?? null,
        ], plan_dict()))]);
}

/* ---------------- Unvanlar: kişiye verilen unvan hatırlanır; yeni eklenenlere varsayılan unvan ---------------- */
function plan_titles(): array
{
    $j = json_decode((string)setting('plan_titles', ''), true);
    return ['m' => is_array($j['m'] ?? null) ? $j['m'] : [], 'def' => (string)($j['def'] ?? '')];
}
function plan_titles_put(array $t): void
{
    if (count($t['m']) > 2000) $t['m'] = array_slice($t['m'], -2000, null, true);
    set_setting('plan_titles', json_encode(['m' => (object)$t['m'], 'def' => $t['def']], JSON_UNESCAPED_UNICODE));
}
/** Taslaktaki unvanları kişi adına göre hatırla (bir sonraki ayda ve başka listede kendiliğinden gelir) */
function plan_titles_learn(array $people): void
{
    $t = plan_titles(); $ch = false;
    foreach ($people as $p) {
        $tt = trim((string)($p['title'] ?? '')); $k = tr_lower(trim((string)($p['name'] ?? '')));
        if ($tt === '' || $k === '' || ($t['m'][$k] ?? null) === $tt) continue;
        $t['m'][$k] = mb_substr($tt, 0, 80); $ch = true;
    }
    if ($ch) plan_titles_put($t);
}
/** Unvanı boş kişilere: hatırlanan unvan, yoksa varsayılan unvan */
function plan_titles_fill(array $people): array
{
    $t = plan_titles();
    foreach ($people as $i => $p) {
        if (!is_array($p) || trim((string)($p['title'] ?? '')) !== '') continue;
        $v = $t['m'][tr_lower(trim((string)($p['name'] ?? '')))] ?? $t['def'];
        if ($v !== '') $people[$i]['title'] = $v;
    }
    return $people;
}
/** Seçilebilecek unvanlar: tanımlı unvanlar (Yönetim › Ünvanlar) + daha önce yazılanlar */
function plan_titles_known(array $people): array
{
    $t = plan_titles(); $o = [];
    $add = function ($v) use (&$o) { $v = trim((string)$v); if ($v !== '' && !isset($o[tr_lower($v)])) $o[tr_lower($v)] = $v; };
    try { foreach (all('SELECT name FROM titles ORDER BY sort, name') as $r) $add($r['name']); } catch (Throwable $e) { /* tablo yoksa */ }
    foreach ($t['m'] as $v) $add($v);
    foreach ($people as $p) if (is_array($p)) $add($p['title'] ?? '');
    if ($t['def'] !== '') $add($t['def']);
    $l = array_values($o);
    usort($l, fn($a, $b) => strcmp(tr_lower($a), tr_lower($b)));
    return $l;
}
function a_plan_titles(): void
{
    $me = need_publisher();
    $t = plan_titles();
    if (array_key_exists('def', $GLOBALS['IN'])) $t['def'] = mb_substr(trim(s('def')), 0, 80);
    plan_titles_put($t);
    audit($me, 'settings.save', 'Çizelge unvanları', $t['def'] !== '' ? 'varsayılan: ' . $t['def'] : 'varsayılan yok');
    out(['titles' => ['known' => plan_titles_known([]), 'def' => $t['def'], 'map' => (object)$t['m']]]);
}

function a_plan_save(): void
{
    $me = need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    $data = plan_clean(arr('draft'), $ym);
    try { plan_titles_learn($data['people'] ?? []); } catch (Throwable $e) { error_log('[dupcii] unvan hatırlama: ' . $e->getMessage()); }
    $j = json_encode($data, JSON_UNESCAPED_UNICODE);
    if (one('SELECT id FROM plan_drafts WHERE roster_id = ? AND ym = ?', [$r['id'], $ym])) q('UPDATE plan_drafts SET data = ?, updated_by = ?, updated_at = ? WHERE roster_id = ? AND ym = ?', [$j, $me['id'], now(), $r['id'], $ym]);
    else q('INSERT INTO plan_drafts (roster_id, ym, data, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [$r['id'], $ym, $j, 'draft', $me['id'], now()]);
    if (b('published')) {
        q("UPDATE plan_drafts SET status = 'published', published_at = ? WHERE roster_id = ? AND ym = ?", [now(), $r['id'], $ym]);
        audit($me, 'plan.publish', $r['name'], $ym);
    }
    out(['updated_at' => now()]);
}

/** Kişinin günleri (kural motoru biçimi) */
function plan_person_days(array $cells, array $dict): array
{
    $o = [];
    foreach ($cells as $d => $code) $o[$d] = plan_row((string)$code, $dict);
    ksort($o);
    return $o;
}

/** Denetim: kişi başı kural ihlalleri, isteğe aykırı nöbetler, gün gün kapsama */
function plan_check(array $data, string $ym, ?int $rid = null): array
{
    $dict = plan_dict();
    $cfg = rules_cfg();
    $rid = $rid ?? (int)i('roster_id');
    $reqs = plan_requests($ym, $rid);
    $prev = plan_prev_rows($rid, $ym);
    $first = $ym . '-01';
    $issues = [];
    $cells = (array)$data['cells'];
    $cov = [];
    foreach (plan_days($ym) as $d) $cov[$d] = ['day' => 0, 'night' => 0];
    $hours = [];
    foreach ($data['people'] as $p) {
        $name = $p['name'];
        $days = plan_prev_for($prev, $name) + plan_person_days((array)($cells[$name] ?? []), $dict);
        ksort($days);
        $req = plan_req_for($reqs, $name, (array)($data['reqs'] ?? []));
        $h = 0;
        foreach ($days as $d => $row) {
            if ($row['kind'] !== 'shift' || $d < $first) continue;
            $h += (float)($row['hours'] ?? 0);
            $cv = shift_cover($row);
            $cov[$d]['day'] += $cv['day']; $cov[$d]['night'] += $cv['night'];
            if (isset($req[$d])) $issues[] = ['name' => $name, 'date' => $d, 'type' => 'istek', 'msg' => $name . ' bu gün için ' . ($req[$d] === 'izin' ? 'yıllık izin' : 'boşluk') . ' isteği onaylanmış'];
            $e = swap_check($days, [$d], [], $cfg, $name);
            if ($e) $issues[] = ['name' => $name, 'date' => $d, 'type' => 'kural', 'msg' => $e];
        }
        $hours[$name] = round($h, 1);
        // Uzun boşluk: dolu günler (nöbet, izin, rapor) arası
        $occ = array_keys($days);
        for ($k = 1; $k < count($occ); $k++) {
            $gap = (int)round((strtotime($occ[$k]) - strtotime($occ[$k - 1])) / 86400) - 1;
            if ($gap > $cfg['max_gap'] && $occ[$k] >= $first) $issues[] = ['name' => $name, 'date' => max($first, date('Y-m-d', strtotime($occ[$k - 1] . ' +1 day'))), 'type' => 'bosluk', 'msg' => "$name için $gap günlük boşluk (en fazla {$cfg['max_gap']} gün)"];
        }
    }
    $short = [];
    foreach ($cov as $d => $c) {
        $n = $data['needs'][day_type($d)] ?? ['day' => 0, 'night' => 0];
        if ($c['day'] < $n['day'] - 0.01 || $c['night'] < $n['night'] - 0.01) $short[] = ['date' => $d, 'day' => round($c['day'], 2), 'night' => round($c['night'], 2), 'need_day' => $n['day'], 'need_night' => $n['night']];
    }
    // Aynı kişi + gün için tek uyarı
    $u = [];
    foreach ($issues as $x) $u[$x['name'] . '|' . $x['date'] . '|' . $x['type']] = $x;
    return ['issues' => array_values($u), 'short' => $short, 'coverage' => $cov, 'hours' => $hours];
}

function a_plan_check(): void
{
    need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    out(plan_check(plan_clean(arr('draft'), $ym), $ym));
}

/**
 * Otomatik doldur: gereken sayıya ulaşmayan günlere, kurallara ve onaylı isteklere uyan kişileri adalet sırasıyla yazar
 * (ay içinde az saat → son 7 günde az nöbet → kura). Mevcut hücrelere dokunmaz.
 */
function a_plan_auto(): void
{
    need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    $data = plan_clean(arr('draft'), $ym);
    $dict = plan_dict();
    $cfg = rules_cfg();
    $reqs = plan_requests($ym, (int)$r['id']);
    $prev = plan_prev_rows((int)$r['id'], $ym);
    $first = $ym . '-01';
    $dayCode = $data['day_code']; $nightCode = $data['night_code'];
    if ($dayCode === '' || $nightCode === '') fail('Gündüz ve gece için kullanılacak kodu seçin.');
    $dRow = plan_row($dayCode, $dict); $nRow = plan_row($nightCode, $dict);
    if ($dRow['kind'] !== 'shift' || $nRow['kind'] !== 'shift') fail('Seçilen kodlar nöbet kodu olmalı.');
    $cells = array_map(fn($x) => (array)$x, (array)$data['cells']);
    $people = array_column($data['people'], 'name');
    $daysOf = [];
    foreach ($people as $n) { $daysOf[$n] = plan_prev_for($prev, $n) + plan_person_days($cells[$n] ?? [], $dict); ksort($daysOf[$n]); }
    $reqOf = [];
    foreach ($people as $n) $reqOf[$n] = plan_req_for($reqs, $n, (array)$data['reqs']);
    // 1) İstekler: yıllık izin isteği olan boş günlere izin kodu (seçildiyse); boşluk isteği olan güne nöbet yazılmaz
    $leaveCode = $data['leave_code'];
    $placed = 0;
    if ($leaveCode !== '' && plan_row($leaveCode, $dict)['kind'] !== 'shift') {
        foreach ($people as $n) foreach ($reqOf[$n] as $d => $k) {
            if ($k !== 'izin' || isset($cells[$n][$d]) || substr((string)$d, 0, 7) !== $ym) continue;
            $cells[$n][$d] = $leaveCode;
            $daysOf[$n][$d] = plan_row($leaveCode, $dict);
            ksort($daysOf[$n]);
            $placed++;
        }
    }
    $isWe = fn($d) => day_type($d) === 'weekend';
    // Boşluk sınırı (birim kuralı: iki nöbet arasında en fazla N boş gün): son dolu günden bu yana N gün geçmişse öncelik
    $gapUrgent = function ($n, $d) use (&$daysOf, $cfg) {
        $last = null;
        foreach ($daysOf[$n] as $k => $x) { if ($k < $d) $last = $k; else break; }
        if ($last === null) return 1;
        return (int)round((strtotime($d) - strtotime($last)) / 86400) - 1 >= (int)$cfg['max_gap'] ? 0 : 1;
    };
    $weCount = function ($n) use (&$daysOf, $first, $isWe) { $c = 0; foreach ($daysOf[$n] as $k => $x) if ($k >= $first && $x['kind'] === 'shift' && $isWe($k)) $c++; return $c; };
    $hoursOf = function ($n) use (&$daysOf, $first) { $h = 0; foreach ($daysOf[$n] as $d => $x) if ($d >= $first && $x['kind'] === 'shift') $h += (float)($x['hours'] ?? 0); return $h; };
    $last7 = function ($n, $d) use (&$daysOf) { $c = 0; foreach ($daysOf[$n] as $k => $x) if ($x['kind'] === 'shift' && $k < $d && $k >= date('Y-m-d', strtotime($d . ' -7 day'))) $c++; return $c; };
    $filled = 0;
    $full = 0;
    $unfilled = [];
    // Önce 24 saat: bir 24 saatlik nöbet hem gündüzden hem geceden birer kişilik ihtiyacı karşılar
    $fRow = null;
    if ($data['mode'] === '24') {
        $fc = $data['full_code'];
        if ($fc === '') fail('24 saatlik nöbet kodunu seçin (ör. 08-08).');
        $fRow = plan_row($fc, $dict);
        $fcov = shift_cover($fRow);
        if ($fRow['kind'] !== 'shift' || $fcov['day'] < 0.99 || $fcov['night'] < 0.99) fail('Seçilen 24 saat kodu gündüzü ve geceyi tam kapsamalı (ör. 08-08).');
    }
    $haveOf = function ($d, $per) use (&$daysOf, $people) { $h = 0.0; foreach ($people as $n) if (isset($daysOf[$n][$d])) $h += shift_cover($daysOf[$n][$d])[$per]; return $h; };
    $pick = function ($d, $row) use (&$daysOf, $people, $reqOf, $cfg, $gapUrgent, $hoursOf, $isWe, $weCount, $last7) {
        $cands = [];
        foreach ($people as $n) {
            if (isset($daysOf[$n][$d]) || isset($reqOf[$n][$d]) || pl_excluded_name($n)) continue;
            $try = $daysOf[$n];
            $try[$d] = $row;
            ksort($try);
            if (swap_check($try, [$d], [], $cfg, $n)) continue;
            // Adalet: boşluk sınırına gelen → ay içinde az saat → (hafta sonu / tatilse) az hafta sonu nöbeti → son 7 günde az nöbet → kura
            $cands[] = [$gapUrgent($n, $d), $hoursOf($n), $isWe($d) ? $weCount($n) : 0, $last7($n, $d), random_int(0, 1000000), $n];
        }
        if (!$cands) return null;
        sort($cands);
        return $cands[0][5];
    };
    $auto = []; // bu dağıtımda yazılan hücreler (eşitleme yalnız bunlara dokunur)
    $assign = function ($n, $d, $row) use (&$daysOf, &$cells, &$filled, &$auto) {
        $daysOf[$n][$d] = $row;
        ksort($daysOf[$n]);
        $cells[$n][$d] = $row['code'];
        $auto[$n][$d] = 1;
        $filled++;
    };
    foreach (plan_days($ym) as $d) {
        $need = $data['needs'][day_type($d)] ?? ['day' => 0, 'night' => 0];
        if ($fRow) {
            while ($haveOf($d, 'day') < $need['day'] - 0.01 && $haveOf($d, 'night') < $need['night'] - 0.01) {
                $n = $pick($d, $fRow);
                if ($n === null) break; // kurala uyan kimse yoksa kalan ihtiyaç gündüz / gece ile denenir
                $assign($n, $d, $fRow);
                $full++;
            }
        }
        foreach (['day' => $dRow, 'night' => $nRow] as $per => $row) {
            if (shift_cover($row)[$per] < 0.01) { if ($haveOf($d, $per) < $need[$per] - 0.01) $unfilled[] = ['date' => $d, 'period' => $per, 'missing' => $need[$per] - $haveOf($d, $per)]; continue; }
            while (($have = $haveOf($d, $per)) < $need[$per] - 0.01) {
                $n = $pick($d, $row);
                if ($n === null) { $unfilled[] = ['date' => $d, 'period' => $per, 'missing' => $need[$per] - $have]; break; }
                $assign($n, $d, $row);
            }
        }
    }
    // Saat eşitleme: kişilerin saat sapması (izinli günlere göre hedef küçülür) kapanana kadar otomatik yazılmış nöbet ya da
    // 24 saatin bir parçası (08-16 / 16-08) fazla çalışandan az çalışana geçer. Günün kapsaması değişmez; her hamle kurallarla denetlenir.
    $balanced = 0;
    if ($data['balance']) {
        $only = fn(array $r, string $per) => ($r['kind'] ?? '') === 'shift' && shift_periods($r) === [$per];
        $partD = $only($dRow, 'day') ? $dRow : null;
        $partN = $only($nRow, 'night') ? $nRow : null;
        $nd = count(plan_days($ym));
        $w = [];
        foreach ($people as $n) {
            if (pl_excluded_name($n)) continue;
            $off = 0;
            foreach (plan_days($ym) as $d) if (isset($reqOf[$n][$d]) || (isset($daysOf[$n][$d]) && ($daysOf[$n][$d]['kind'] ?? '') !== 'shift')) $off++;
            $w[$n] = max(0, $nd - $off) / $nd;
        }
        $mem = array_keys(array_filter($w, fn($x) => $x > 0));
        $t0 = microtime(true);
        for ($it = 0; $it < 400 && count($mem) >= 2 && microtime(true) - $t0 < 10; $it++) {
            $tot = 0.0; $sw = 0.0;
            foreach ($mem as $n) { $tot += $hoursOf($n); $sw += $w[$n]; }
            $dev = [];
            foreach ($mem as $n) $dev[$n] = $hoursOf($n) - $tot * $w[$n] / $sw;
            arsort($dev);
            $his = array_keys(array_filter($dev, fn($v) => $v > 2));
            $los = array_reverse(array_keys(array_filter($dev, fn($v) => $v < -2)));
            $best = null;
            foreach ($his as $hk) foreach ($los as $lk) {
                $gap = $dev[$hk] - $dev[$lk];
                if ($gap <= 4) continue;
                foreach ($auto[$hk] ?? [] as $d => $_) {
                    if (isset($daysOf[$lk][$d]) || isset($reqOf[$lk][$d])) continue;
                    $row = $daysOf[$hk][$d];
                    $opts = [[$row, null]];
                    if (shift_periods($row) === ['day', 'night'] && $partD && $partN) { $opts[] = [$partN, $partD]; $opts[] = [$partD, $partN]; }
                    foreach ($opts as [$give, $keep]) {
                        $h = (float)($give['hours'] ?? 0);
                        if ($h <= 0 || $h >= $gap) continue;
                        $gain = 2 * $h * ($gap - $h);
                        if ($best && $gain <= $best['gain']) continue;
                        // Alan: kurallara uymalı; veren: kalan parça / boşalan gün kurala uymalı
                        $tl = $daysOf[$lk]; $tl[$d] = $give; ksort($tl);
                        if (swap_check($tl, [$d], [], $cfg, $lk)) continue;
                        $th = $daysOf[$hk];
                        if ($keep) { $th[$d] = $keep; ksort($th); if (swap_check($th, [$d], [], $cfg, $hk)) continue; }
                        else { unset($th[$d]); if (swap_check($th, [], [$d], $cfg, $hk)) continue; }
                        $best = ['gain' => $gain, 'hk' => $hk, 'lk' => $lk, 'd' => $d, 'give' => $give, 'keep' => $keep];
                    }
                }
            }
            if (!$best) break;
            ['hk' => $hk, 'lk' => $lk, 'd' => $d, 'give' => $give, 'keep' => $keep] = $best;
            if ($keep) { $daysOf[$hk][$d] = $keep; $cells[$hk][$d] = $keep['code']; }
            else { unset($daysOf[$hk][$d], $cells[$hk][$d], $auto[$hk][$d]); }
            $daysOf[$lk][$d] = $give; ksort($daysOf[$lk]); $cells[$lk][$d] = $give['code']; $auto[$lk][$d] = 1;
            $balanced++;
        }
    }
    out(['cells' => (object)$cells, 'filled' => $filled, 'full' => $full, 'unfilled' => $unfilled, 'placed' => $placed, 'balanced' => $balanced]);
}

/** Birim kuralları (çizelge ekranından; yönetici ve yayıncı): değişim / ilan / çağrı / çizelge hepsi bunlara uyar */
function a_plan_rules(): void
{
    $me = need_publisher();
    set_setting('swap_max_cont', (string)max(8, min(72, (int)(i('max_cont') ?? swap_rules()['max_cont']))));
    set_setting('swap_max_gap', (string)max(1, min(30, (int)(i('max_gap') ?? swap_rules()['max_gap']))));
    if (i('rest') !== null) set_setting('rule_rest', (string)max(0, min(48, (int)i('rest'))));
    if (i('leave_wknd') !== null) set_setting('rule_leave_wknd', (string)max(0, min(10, (int)i('leave_wknd'))));
    $r = swap_rules();
    audit($me, 'settings.save', 'Birim kuralları', 'boşluk en fazla ' . $r['max_gap'] . ' gün, üst üste ' . $r['max_cont'] . ' saat, dinlenme ' . $r['rest'] . ' saat');
    out(['rules' => $r]);
}

return [
    'plan.rules' => 'a_plan_rules',
    'plan.titles' => 'a_plan_titles',
    'plan.get' => 'a_plan_get',
    'plan.save' => 'a_plan_save',
    'plan.check' => 'a_plan_check',
    'plan.auto' => 'a_plan_auto',
];
