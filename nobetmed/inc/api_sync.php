<?php
/**
 * dupcii — API: Google E-Tablolar eşitleme ayarları, taraf listesi (kura) ve nöbet değişim istekleri.
 */
declare(strict_types=1);

/* =================================================================== */
/* Google E-Tablolar                                                    */
/* =================================================================== */

function gs_sheet_id(string $v): string
{
    $v = trim($v);
    if (preg_match('~/spreadsheets/d/([A-Za-z0-9_-]{20,100})~', $v, $m)) return $m[1];
    return preg_match('/^[A-Za-z0-9_-]{20,100}$/', $v) ? $v : '';
}

function gs_admin_out(): array
{
    $st = setting('gs_status');
    return [
        'id' => setting('gs_id'),
        'mode' => setting('gs_mode', 'push'),
        'token' => setting('gs_token'),
        'push_url' => base_url() . 'api.php?action=gsync.push',
        'title' => setting('gs_title'),
        'seen' => setting('gs_seen') ?: null,
        'changed' => setting('gs_changed') ?: null,
        'status' => ltrim($st, '!'),
        'status_ok' => $st === '' || $st[0] !== '!',
        'fallback' => setting('gs_fallback') === '1',
        'kinds' => gs_kinds(),
        'parser' => gs_load_parser(),
        'rosters' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'linked' => (bool)$r['src_on'], 'kind' => $r['src_tab'], 'status' => $r['src_status'], 'sync_at' => $r['src_sync_at']],
            all('SELECT * FROM rosters ORDER BY sort, id')),
    ];
}

function a_gsync_get(): void
{
    need_admin();
    out(['gs' => gs_admin_out()]);
}

function a_gsync_save(): void
{
    $me = need_admin();
    global $IN;
    if (array_key_exists('sheet', $IN)) {
        $raw = s('sheet', 300);
        $id = $raw === '' ? '' : gs_sheet_id($raw);
        if ($raw !== '' && $id === '') fail('Google E-Tablolar bağlantısı tanınmadı. Tarayıcıdaki adresi olduğu gibi yapıştırın.');
        if ($id !== setting('gs_id')) { set_setting('gs_hash', ''); }
        set_setting('gs_id', $id);
    }
    $mode = s('mode', 10);
    if (in_array($mode, ['push', 'pull'], true)) set_setting('gs_mode', $mode);
    if (setting('gs_token') === '' || b('new_token')) set_setting('gs_token', bin2hex(random_bytes(20)));
    set_setting('gs_owner', (string)$me['id']);
    audit($me, 'settings.save', 'Google E-Tablolar bağlantısı', setting('gs_mode') . (b('new_token') ? ' · yeni anahtar' : ''));
    out(['gs' => gs_admin_out()]);
}

function a_gsync_pull(): void
{
    need_admin();
    if (setting('gs_mode', 'push') === 'pull') {
        $r = gs_pull(true);
    } else {
        $r = gs_reprocess() ?? ['changed' => false, 'error' => 'Henüz Google’dan veri gelmedi. Betiği çalıştırın.'];
    }
    out(['result' => $r, 'gs' => gs_admin_out()]);
}

function a_gsync_bind(): void
{
    $me = need_admin();
    $rid = (int)i('roster_id');
    $r = one('SELECT * FROM rosters WHERE id = ?', [$rid]) ?? fail('Liste bulunamadı.', 404);
    global $IN;
    $kind = $IN['kind'] ?? null;
    if (b('unlink') || $kind === null) {
        q('UPDATE rosters SET src_on = 0 WHERE id = ?', [$rid]);
        audit($me, 'roster.unlink', $r['name']);
        out(['gs' => gs_admin_out()]);
    }
    $kind = gs_fold((string)$kind);
    $known = array_column(gs_kinds(), 'kind');
    if ($known && !in_array($kind, $known, true)) fail('Bu türde sekme yok.');
    q('UPDATE rosters SET src_on = 1, src_tab = ? WHERE id = ?', [$kind, $rid]);
    audit($me, 'roster.link', $r['name'], 'Sekme türü: ' . ($kind === '' ? 'ay adı' : $kind));
    $res = gs_reprocess($rid);
    out(['gs' => gs_admin_out(), 'result' => $res]);
}

/** Bir sekme türü için liste oluşturup bağlar */
function a_gsync_create(): void
{
    $me = need_admin();
    $name = s('name', 120);
    if (mb_strlen($name) < 2) fail('Liste adı en az 2 karakter olmalı.');
    q('INSERT INTO rosters (name, sort, created_at) VALUES (?, ?, ?)', [$name, (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM rosters'), now()]);
    global $IN;
    $IN['roster_id'] = insert_id();
    audit($me, 'roster.create', $name);
    a_gsync_bind();
}

/* =================================================================== */
/* Taraf listesi: kim hangi blokta çalıştı, karşı tarafa geçiş sayıları  */
/* =================================================================== */

function sides_cfg(): array
{
    $j = json_decode(setting('sides', '[]'), true);
    $out = [];
    foreach (is_array($j) ? $j : [] as $s) {
        if (!is_array($s) || empty($s['key'])) continue;
        $out[] = ['key' => (string)$s['key'], 'name' => (string)($s['name'] ?? ''), 'roster_id' => (int)($s['roster_id'] ?? 0),
            'units' => array_values(array_filter(array_map('strval', (array)($s['units'] ?? [])), fn($u) => $u !== ''))];
    }
    return $out;
}

/** Bir tarafın o tarih aralığındaki kişileri: key => [name, title, days => [date => row]] */
function side_people(array $side, string $from, string $to): array
{
    return $side['roster_id'] ? swap_timeline($side['roster_id'], $from, $to) : [];
}

/** Sayılan geçiş sayıları: [nameKey => ['total' => n, 'month' => n]] */
function side_counts(string $ym): array
{
    $since = setting('side_since');
    $p = [];
    $w = 'counted = 1';
    if ($since !== '' && valid_ymd($since)) { $w .= ' AND date >= ?'; $p[] = $since; }
    $c = [];
    foreach (all("SELECT name, date FROM side_moves WHERE $w", $p) as $m) {
        $k = swap_key((string)$m['name']);
        $c[$k]['total'] = ($c[$k]['total'] ?? 0) + 1;
        if (substr((string)$m['date'], 0, 7) === $ym) $c[$k]['month'] = ($c[$k]['month'] ?? 0) + 1;
    }
    return $c;
}

function side_move_out(array $m, ?array $me): array
{
    return ['id' => (int)$m['id'], 'date' => $m['date'], 'name' => $m['name'], 'user_id' => $m['user_id'] !== null ? (int)$m['user_id'] : null,
        'from' => $m['from_side'], 'to' => $m['to_side'], 'unit' => $m['unit'], 'code' => $m['code'], 'counted' => (bool)$m['counted'],
        'method' => $m['method'], 'pool' => json_decode((string)$m['pool'], true), 'note' => $m['note'],
        'by' => $m['by_name'] ?? null, 'at' => $m['created_at'],
        'can_delete' => $me && (is_publisher($me) || (int)$m['created_by'] === (int)$me['id'])];
}

function a_side_get(): void
{
    $me = need_user();
    $ym = s('month', 7) ?: date('Y-m');
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) fail('Geçersiz ay.');
    $from = $ym . '-01';
    $to = date('Y-m-t', strtotime($from));
    $sides = sides_cfg();
    $counts = side_counts($ym);
    $moves = all('SELECT m.*, u.name AS by_name FROM side_moves m LEFT JOIN users u ON u.id = m.created_by WHERE m.date >= ? AND m.date <= ? ORDER BY m.date, m.id', [$from, $to]);
    $users = all("SELECT id, name FROM users WHERE status = 'active'");
    $outSides = [];
    foreach ($sides as $sd) {
        $people = [];
        foreach (side_people($sd, $from, $to) as $k => $p) {
            $days = [];
            foreach ($p['days'] as $d => $row) $days[(int)substr($d, 8, 2)] = ['code' => $row['code'], 'kind' => $row['kind'], 'night' => shift_is_night($row), 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null];
            $u = swap_user_for((string)$p['name'], $users);
            $people[] = ['name' => $p['name'], 'title' => $p['title'], 'user_id' => $u ? (int)$u['id'] : null, 'days' => (object)$days,
                'month' => $counts[$k]['month'] ?? 0, 'total' => $counts[$k]['total'] ?? 0];
        }
        $outSides[] = $sd + ['people' => $people];
    }
    out(['month' => $ym, 'days' => (int)date('t', strtotime($from)), 'sides' => $outSides, 'since' => setting('side_since') ?: null,
        'moves' => array_map(fn($m) => side_move_out($m, $me), $moves), 'can_admin' => is_admin($me), 'can_record' => is_publisher($me) || side_on_duty($me, date('Y-m-d')) !== null,
        'rosters' => is_admin($me) ? array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], all('SELECT id, name FROM rosters ORDER BY sort, id')) : []]);
}

/** Kişi o gün bir tarafın listesinde nöbetçi mi (kayıt yetkisi için) */
function side_on_duty(array $me, string $date): ?string
{
    foreach (sides_cfg() as $sd) {
        foreach (side_people($sd, $date, $date) as $p) {
            $row = $p['days'][$date] ?? null;
            if ($row && $row['kind'] === 'shift' && names_match((string)$p['name'], (string)$me['name'])) return $sd['key'];
        }
    }
    return null;
}

/** O gün nöbette olanlar, taraf taraf (kura adayları) */
function side_day_data(string $date): array
{
    $sides = sides_cfg();
    $counts = side_counts(substr($date, 0, 7));
    $moved = [];
    foreach (all('SELECT * FROM side_moves WHERE date = ?', [$date]) as $m) $moved[swap_key((string)$m['name'])] = $m;
    $out = [];
    foreach ($sides as $sd) {
        $list = [];
        foreach (side_people($sd, $date, $date) as $k => $p) {
            $row = $p['days'][$date] ?? null;
            if (!$row || $row['kind'] !== 'shift') continue;
            $list[] = ['name' => $p['name'], 'title' => $p['title'], 'code' => $row['code'], 'label' => $row['label'], 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null,
                'night' => shift_is_night($row), 'total' => $counts[$k]['total'] ?? 0, 'month' => $counts[$k]['month'] ?? 0,
                'moved' => isset($moved[$k]) ? ['id' => (int)$moved[$k]['id'], 'unit' => $moved[$k]['unit'], 'to' => $moved[$k]['to_side']] : null];
        }
        usort($list, fn($a, $b) => [$a['total'], $a['name']] <=> [$b['total'], $b['name']]);
        $out[] = $sd + ['people' => $list];
    }
    return $out;
}

function a_side_day(): void
{
    $me = need_user();
    $date = s('date', 10) ?: date('Y-m-d');
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    out(['date' => $date, 'sides' => side_day_data($date), 'can_record' => is_publisher($me) || side_on_duty($me, $date) !== null]);
}

function side_need_recorder(array $me, string $date): void
{
    if (is_publisher($me)) return;
    if (side_on_duty($me, $date) === null) fail('Kaydı yalnızca o gün nöbette olanlar veya sorumlular yapabilir.', 403);
}

/** Birimin ait olduğu taraf */
function side_of_unit(string $unit): ?array
{
    foreach (sides_cfg() as $sd) if (in_array($unit, $sd['units'], true)) return $sd;
    return null;
}

/** Kura: en az geçmiş olanlar arasından rastgele seçer */
function a_side_draw(): void
{
    $me = need_user();
    $date = s('date', 10);
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    side_need_recorder($me, $date);
    $from = s('from', 20);
    $unit = s('unit', 40);
    $cnt = max(1, min(5, (int)(i('count') ?? 1)));
    $dest = side_of_unit($unit) ?? fail('Birim bulunamadı.');
    $want = array_map('strval', arr('names'));
    $day = side_day_data($date);
    $src = null;
    foreach ($day as $sd) if ($sd['key'] === $from) $src = $sd;
    if (!$src) fail('Taraf bulunamadı.');
    if ($src['key'] === $dest['key']) fail('Kura karşı tarafa geçiş içindir; aynı tarafın birimini seçmeyin.');
    $pool = array_values(array_filter($src['people'], fn($p) => !$p['moved'] && (!$want || in_array($p['name'], $want, true))));
    if (count($pool) < $cnt) fail('Seçilen kişi sayısı yetersiz.');
    $chosen = [];
    $left = $pool;
    while (count($chosen) < $cnt) {
        $min = min(array_column($left, 'total'));
        $grp = array_values(array_filter($left, fn($p) => $p['total'] === $min));
        $pick = $grp[random_int(0, count($grp) - 1)];
        $chosen[] = $pick + ['group' => array_column($grp, 'name')];
        $left = array_values(array_filter($left, fn($p) => $p['name'] !== $pick['name']));
    }
    $poolInfo = array_map(fn($p) => ['name' => $p['name'], 'total' => $p['total'], 'code' => $p['code']], $pool);
    $ids = [];
    foreach ($chosen as $c) $ids[] = side_store($me, $date, $c, $src['key'], $dest['key'], $unit, 'kura', ['pool' => $poolInfo, 'group' => $c['group']]);
    audit($me, 'side.draw', $date . ' ' . $unit, implode(', ', array_column($chosen, 'name')) . ' · adaylar: ' . implode(', ', array_map(fn($p) => $p['name'] . ' (' . $p['total'] . ')', $poolInfo)));
    out(['chosen' => array_map(fn($c) => ['name' => $c['name'], 'group' => $c['group'], 'total' => $c['total']], $chosen), 'ids' => $ids, 'sides' => side_day_data($date)]);
}

function side_store(array $me, string $date, array $p, string $fromKey, string $toKey, string $unit, string $method, array $pool): int
{
    $k = swap_key((string)$p['name']);
    foreach (all('SELECT id, name FROM side_moves WHERE date = ?', [$date]) as $m) if (swap_key((string)$m['name']) === $k) q('DELETE FROM side_moves WHERE id = ?', [$m['id']]);
    $u = swap_user_for((string)$p['name']);
    $counted = $fromKey !== $toKey && !empty($p['night']) ? 1 : 0;
    q('INSERT INTO side_moves (date, name, user_id, from_side, to_side, unit, code, counted, method, pool, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$date, $p['name'], $u ? (int)$u['id'] : null, $fromKey, $toKey, $unit, (string)$p['code'], $counted, $method, json_encode($pool, JSON_UNESCAPED_UNICODE), s('note', 200) ?: null, $me['id'], now()]);
    $id = insert_id();
    if ($u && (int)$u['id'] !== (int)$me['id']) {
        $full = one('SELECT * FROM users WHERE id = ?', [(int)$u['id']]);
        if ($full) notify_users([$full], 'side', ($date === date('Y-m-d') ? 'Bugün ' : swap_fmt_date($date) . ' günü ') . $unit . '’ta çalışacaksın',
            ($method === 'kura' ? 'Kura sonucu' : 'Görevlendirme') . ' · ' . $p['code'] . ($counted ? ' · karşı tarafa geçiş olarak sayıldı' : ''), '#/taraf', null);
    }
    return $id;
}

/** Elle kayıt: kura başka yerde çekildiyse veya görevlendirme yapıldıysa */
function a_side_save(): void
{
    $me = need_user();
    $date = s('date', 10);
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    side_need_recorder($me, $date);
    $name = s('name', 120);
    $unit = s('unit', 40);
    $dest = side_of_unit($unit) ?? fail('Birim bulunamadı.');
    $found = null;
    $fromKey = '';
    foreach (side_day_data($date) as $sd) foreach ($sd['people'] as $p) if ($p['name'] === $name) { $found = $p; $fromKey = $sd['key']; }
    if (!$found) fail('Bu kişi o gün listede nöbetçi görünmüyor.');
    $id = side_store($me, $date, $found, $fromKey, $dest['key'], $unit, 'elle', []);
    audit($me, 'side.save', $date . ' ' . $unit, $name . ' (' . $found['code'] . ')');
    out(['id' => $id, 'sides' => side_day_data($date)]);
}

function a_side_delete(): void
{
    $me = need_user();
    $m = one('SELECT * FROM side_moves WHERE id = ?', [(int)i('id')]) ?? fail('Kayıt bulunamadı.', 404);
    if (!is_publisher($me) && (int)$m['created_by'] !== (int)$me['id']) fail('Bu kaydı yalnızca kaydeden veya sorumlular silebilir.', 403);
    q('DELETE FROM side_moves WHERE id = ?', [$m['id']]);
    audit($me, 'side.delete', $m['date'] . ' ' . $m['unit'], $m['name']);
    out(['ok' => true]);
}

function a_side_settings(): void
{
    $me = need_admin();
    $list = [];
    $keys = [];
    foreach (array_slice(arr('sides'), 0, 6) as $i => $sd) {
        if (!is_array($sd)) continue;
        $name = mb_substr(trim((string)($sd['name'] ?? '')), 0, 60);
        if ($name === '') continue;
        $key = preg_replace('/[^a-z0-9]/', '', strtolower((string)($sd['key'] ?? ''))) ?: 's' . ($i + 1);
        if (isset($keys[$key])) $key .= $i;
        $keys[$key] = true;
        $rid = (int)($sd['roster_id'] ?? 0);
        if ($rid && !valid_id('rosters', $rid)) $rid = 0;
        $units = [];
        foreach ((array)($sd['units'] ?? []) as $u) { $u = mb_substr(trim((string)$u), 0, 40); if ($u !== '' && !in_array($u, $units, true)) $units[] = $u; }
        if (!$units) $units = [$name];
        $list[] = ['key' => $key, 'name' => $name, 'roster_id' => $rid, 'units' => array_slice($units, 0, 6)];
    }
    if (count($list) < 2) fail('En az iki taraf tanımlayın (ör. 3. Basamak ve 2. Basamak).');
    $all = [];
    foreach ($list as $sd) foreach ($sd['units'] as $u) { if (isset($all[$u])) fail("“$u” iki tarafta birden olamaz."); $all[$u] = true; }
    set_setting('sides', json_encode($list, JSON_UNESCAPED_UNICODE));
    $since = s('since', 10);
    set_setting('side_since', valid_ymd($since) ? $since : '');
    audit($me, 'settings.save', 'Taraf listesi', implode(' · ', array_map(fn($s) => $s['name'] . ': ' . implode('/', $s['units']), $list)));
    out(['sides' => sides_cfg(), 'since' => setting('side_since') ?: null]);
}

/* =================================================================== */
/* Nöbet değişimi / devri                                               */
/* =================================================================== */

function a_swap_options(): void
{
    $me = need_user();
    $date = s('date', 10);
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    if ($date < date('Y-m-d')) fail('Geçmiş günlerin nöbeti değiştirilemez.');
    try { $o = swap_options($me, $date); } catch (RuntimeException $e) { fail($e->getMessage()); }
    out($o);
}

function swap_req_out(array $r, array $me): array
{
    return ['id' => (int)$r['id'], 'kind' => $r['kind'], 'status' => $r['status'], 'roster_id' => (int)$r['roster_id'],
        'from_user' => (int)$r['from_user'], 'from_name' => $r['from_name'], 'from_date' => $r['from_date'], 'from_code' => $r['from_code'],
        'to_user' => $r['to_user'] !== null ? (int)$r['to_user'] : null, 'to_name' => $r['to_name'], 'to_date' => $r['to_date'], 'to_code' => $r['to_code'],
        'note' => $r['note'], 'created_at' => $r['created_at'], 'decided_at' => $r['decided_at'], 'applied_at' => $r['applied_at'],
        'mine' => (int)$r['from_user'] === (int)$me['id'], 'incoming' => (int)($r['to_user'] ?? 0) === (int)$me['id']];
}

function swap_req_text(array $r): string
{
    return $r['kind'] === 'swap'
        ? $r['from_name'] . ' ' . swap_fmt_date($r['from_date']) . ' (' . $r['from_code'] . ') ↔ ' . $r['to_name'] . ' ' . swap_fmt_date((string)$r['to_date']) . ' (' . $r['to_code'] . ')'
        : $r['from_name'] . ' ' . swap_fmt_date($r['from_date']) . ' (' . $r['from_code'] . ') nöbetini ' . $r['to_name'] . '’e devrediyor';
}

function a_swap_request(): void
{
    $me = need_user();
    $date = s('date', 10);
    $toName = s('to_name', 120);
    $toDate = s('to_date', 10);
    if (!valid_ymd($date) || ($toDate !== '' && !valid_ymd($toDate))) fail('Geçersiz tarih.');
    try { $o = swap_options($me, $date); } catch (RuntimeException $e) { fail($e->getMessage()); }
    $target = null;
    $code = null;
    if ($toDate === '') {
        if ($o['give_error']) fail($o['give_error']);
        foreach ($o['give'] as $p) if ($p['name'] === $toName) $target = $p;
    } else {
        foreach ($o['swap'] as $p) if ($p['name'] === $toName) foreach ($p['options'] as $x) if ($x['date'] === $toDate) { $target = $p; $code = $x['code']; }
    }
    if (!$target) {
        foreach ($o['blocked'] as $b) if ($b['name'] === $toName) fail($b['reason']);
        fail('Bu seçenek artık uygun değil; liste değişmiş olabilir.');
    }
    if (!$target['user_id']) fail($toName . ' uygulamada kayıtlı değil. İsteği WhatsApp ile iletebilirsiniz.');
    if (one("SELECT id FROM swap_requests WHERE from_user = ? AND from_date = ? AND to_name = ? AND COALESCE(to_date, '') = ? AND status IN ('pending', 'accepted')", [$me['id'], $date, $toName, $toDate])) fail('Bu istek zaten gönderildi.');
    q('INSERT INTO swap_requests (roster_id, kind, from_user, from_name, from_date, from_code, to_user, to_name, to_date, to_code, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$o['mine']['roster_id'], $toDate === '' ? 'give' : 'swap', $me['id'], $o['mine']['name'], $date, $o['mine']['code'], $target['user_id'], $toName, $toDate ?: null, $code, 'pending', s('note', 300) ?: null, now()]);
    $id = insert_id();
    $r = one('SELECT * FROM swap_requests WHERE id = ?', [$id]);
    $to = one('SELECT * FROM users WHERE id = ?', [$target['user_id']]);
    $title = $toDate === '' ? 'Nöbet devir isteği' : 'Nöbet değişim isteği';
    notify_users([$to], 'swap', $title . ': ' . $me['name'], swap_req_text($r) . (s('note', 300) ? ' · “' . s('note', 300) . '”' : ''), '#/nobetim', [
        'subject' => $title . ' · ' . $me['name'], 'heading' => $title, 'lines' => [swap_req_text($r), 'Kabul veya reddetmek için uygulamayı açın.'], 'button' => 'İsteği gör',
    ], 'notoff');
    audit($me, 'swap.request', swap_req_text($r));
    out(['request' => swap_req_out($r, $me)]);
}

function a_swap_list(): void
{
    $me = need_user();
    $since = date('Y-m-d', strtotime('-40 days'));
    $rows = all('SELECT * FROM swap_requests WHERE (from_user = ? OR to_user = ?) AND from_date >= ? ORDER BY id DESC LIMIT 100', [$me['id'], $me['id'], $since]);
    $todo = is_publisher($me) ? all("SELECT * FROM swap_requests WHERE status = 'accepted' ORDER BY from_date LIMIT 100") : [];
    out(['items' => array_map(fn($r) => swap_req_out($r, $me), $rows), 'todo' => array_map(fn($r) => swap_req_out($r, $me), $todo)]);
}

function a_swap_respond(): void
{
    $me = need_user();
    $r = one('SELECT * FROM swap_requests WHERE id = ?', [(int)i('id')]) ?? fail('İstek bulunamadı.', 404);
    if ((int)$r['to_user'] !== (int)$me['id']) fail('Bu istek size gönderilmemiş.', 403);
    if ($r['status'] !== 'pending') fail('Bu istek artık beklemede değil.');
    $from = one('SELECT * FROM users WHERE id = ?', [(int)$r['from_user']]);
    if (b('accept')) {
        // Liste değişmiş olabilir: kuralları yeniden denetle
        try { $o = $from ? swap_options($from, $r['from_date']) : null; } catch (RuntimeException $e) { $o = null; }
        $ok = false;
        if ($o) {
            if ($r['kind'] === 'give') { foreach ($o['give'] as $p) if ($p['name'] === $r['to_name']) $ok = true; }
            else foreach ($o['swap'] as $p) if ($p['name'] === $r['to_name']) foreach ($p['options'] as $x) if ($x['date'] === $r['to_date']) $ok = true;
        }
        if (!$ok) fail('Liste değiştiği için bu değişim artık kurallara uymuyor.');
        q("UPDATE swap_requests SET status = 'accepted', decided_at = ? WHERE id = ?", [now(), $r['id']]);
        $r['status'] = 'accepted';
        if ($from) notify_users([$from], 'swap', 'İsteğin kabul edildi', swap_req_text($r) . ' · Sorumlu Excel’de güncelleyince listene işlenir.', '#/nobetim', null);
        $pubs = array_filter(active_users_sql("AND role IN ('admin', 'editor')"), fn($u) => (int)$u['id'] !== (int)$me['id'] && (int)$u['id'] !== (int)$r['from_user']);
        if ($pubs) notify_users($pubs, 'swap', 'Excel’e işlenecek nöbet değişimi', swap_req_text($r), '#/nobetim', [
            'subject' => 'Excel’e işlenecek nöbet değişimi', 'heading' => 'İki kişi nöbet değişiminde anlaştı',
            'lines' => [swap_req_text($r), 'Excel listesinde güncellediğinizde uygulama değişimi kendiliğinden işler.'], 'button' => 'Uygulamada gör',
        ], 'notoff');
        audit($me, 'swap.accept', swap_req_text($r));
    } else {
        q("UPDATE swap_requests SET status = 'declined', decided_at = ? WHERE id = ?", [now(), $r['id']]);
        if ($from) notify_users([$from], 'swap', 'İsteğin reddedildi', $me['name'] . ' isteğini kabul etmedi: ' . swap_fmt_date($r['from_date']), '#/nobetim', null);
        audit($me, 'swap.decline', swap_req_text($r));
    }
    out(['request' => swap_req_out(one('SELECT * FROM swap_requests WHERE id = ?', [$r['id']]), $me)]);
}

function a_swap_cancel(): void
{
    $me = need_user();
    $r = one('SELECT * FROM swap_requests WHERE id = ?', [(int)i('id')]) ?? fail('İstek bulunamadı.', 404);
    if ((int)$r['from_user'] !== (int)$me['id'] && !is_publisher($me)) fail('Bu isteği iptal edemezsiniz.', 403);
    if (!in_array($r['status'], ['pending', 'accepted'], true)) fail('Bu istek zaten sonuçlandı.');
    q("UPDATE swap_requests SET status = 'cancelled', decided_at = ? WHERE id = ?", [now(), $r['id']]);
    $other = one('SELECT * FROM users WHERE id = ?', [(int)$r['to_user']]);
    if ($other && (int)$other['id'] !== (int)$me['id']) notify_users([$other], 'swap', 'Nöbet isteği iptal edildi', swap_req_text($r), '#/nobetim', null);
    audit($me, 'swap.cancel', swap_req_text($r));
    out(['ok' => true]);
}

function a_swap_rules(): void
{
    $me = need_admin();
    set_setting('swap_max_cont', (string)max(8, min(72, (int)i('max_cont'))));
    set_setting('swap_max_gap', (string)max(1, min(30, (int)i('max_gap'))));
    audit($me, 'settings.save', 'Nöbet değişim kuralları', 'üst üste ' . setting('swap_max_cont') . ' saat, boşluk ' . setting('swap_max_gap') . ' gün');
    out(['rules' => swap_rules()]);
}
