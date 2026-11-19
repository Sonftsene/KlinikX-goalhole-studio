<?php
/**
 * dupcii — nöbet ilanı (devret / değiş), eksik personel çağrısı ve değişim geçmişi.
 *
 * Gizlilik (sunucu hiç göndermez):
 *  - İlana kimlerin başvurduğunu ve ilanı kimin aldığını yalnız ilan sahibi ve yayıncılar görür; diğerleri "Kapandı" görür.
 *  - Eksik çağrısına kimin ne yanıt verdiğini yalnız yayıncılar ve kişinin kendisi görür.
 * Seçilen ilan başvurusu mevcut değişim akışına (swap_requests, durum "accepted") girer: sorumluya "Excel’e işlenecek",
 * Excel güncellenince kendiliğinden "uygulandı". Çağrıda seçilen kişi Excel'de görününce çağrı "listeye işlendi" olur.
 */
declare(strict_types=1);

/* =================================================================== */
/* Ortak yardımcılar                                                    */
/* =================================================================== */

function mk_users(): array
{
    static $u = null;
    if ($u === null) $u = all("SELECT id, name, role, phone FROM users WHERE status = 'active'");
    return $u;
}

function mk_user_for(string $name): ?array
{
    static $c = [];
    if (!array_key_exists($name, $c)) {
        $c[$name] = null;
        foreach (mk_users() as $u) if (names_match($name, (string)$u['name'])) { $c[$name] = $u; break; }
    }
    return $c[$name];
}

function mk_user_by_id(int $id): ?array
{
    foreach (mk_users() as $u) if ((int)$u['id'] === $id) return $u;
    return null;
}

/** Bildirim için tam kullanıcı satırları */
function mk_full_users(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) return [];
    return all("SELECT * FROM users WHERE status = 'active' AND id IN (" . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
}

function mk_pubs(array $exclude = []): array
{
    $ex = array_map('intval', $exclude);
    return array_values(array_filter(module_managers(), fn($u) => !in_array((int)$u['id'], $ex, true)));
}

function mk_is_pub(array $u): bool
{
    return is_publisher($u);
}

function mk_first(string $name): string
{
    $p = preg_split('/\s+/u', trim($name)) ?: [];
    return $p[0] ?? $name;
}

function mk_today(): string
{
    return date('Y-m-d');
}

function mk_shift_day(string $d, int $n): string
{
    return date('Y-m-d', strtotime($d . ($n >= 0 ? ' +' : ' ') . $n . ' days'));
}

/** Listenin kişileri (önbellekli) */
function mk_tl(int $rid, string $from, string $to): array
{
    static $c = [];
    $k = "$rid|$from|$to";
    if (!isset($c[$k])) $c[$k] = swap_pending_overlay(swap_timeline($rid, $from, $to), $from, $to, $rid);
    return $c[$k];
}

function mk_roster_names(): array
{
    static $m = null;
    if ($m === null) { $m = []; foreach (all('SELECT id, name FROM rosters') as $r) $m[(int)$r['id']] = (string)$r['name']; }
    return $m;
}

/** Kullanıcının adının geçtiği listeler: [roster_id => listedeki adı] */
function mk_my_rosters(array $me): array
{
    static $c = [];
    $id = (int)$me['id'];
    if (isset($c[$id])) return $c[$id];
    $rows = all('SELECT DISTINCT s.roster_id, s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date >= ? AND s.date <= ?',
        [date('Y-m-d', strtotime('-45 days')), date('Y-m-d', strtotime('+120 days'))]);
    $out = [];
    foreach ($rows as $r) {
        $rid = (int)$r['roster_id'];
        if (!isset($out[$rid]) && names_match((string)$r['name'], (string)$me['name'])) $out[$rid] = (string)$r['name'];
    }
    return $c[$id] = $out;
}

function mk_hm(?string $t): string
{
    if (!$t) return '';
    return substr($t, 3, 2) === '00' ? substr($t, 0, 2) : $t;
}

/** "08-16", "16-08", "24 saat" */
function mk_row_text(array $row): string
{
    $st = $row['start_time'] ?? ($row['start'] ?? null);
    $en = $row['end_time'] ?? ($row['end'] ?? null);
    if ($st && $en) return $st === $en ? '24 saat' : mk_hm($st) . '-' . mk_hm($en);
    return (string)($row['code'] ?? '');
}

/** "18 Kasım’a" (yönelme eki ay adına göre) */
function mk_date_to(string $d): string
{
    $m = ['Ocak’a', 'Şubat’a', 'Mart’a', 'Nisan’a', 'Mayıs’a', 'Haziran’a', 'Temmuz’a', 'Ağustos’a', 'Eylül’e', 'Ekim’e', 'Kasım’a', 'Aralık’a'];
    return (int)substr($d, 8, 2) . ' ' . $m[(int)substr($d, 5, 2) - 1];
}

function mk_meta(?string $s): array
{
    $m = json_decode((string)$s, true);
    return is_array($m) ? $m : [];
}

function mk_tx(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try { $r = $fn(); $pdo->commit(); return $r; } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

/* =================================================================== */
/* Nöbet ilanı                                                          */
/* =================================================================== */

function mk_listing(int $id): array
{
    $L = one('SELECT * FROM listings WHERE id = ?', [$id]);
    if (!$L) fail('İlan bulunamadı.', 404);
    return $L;
}

/** İlandaki nöbet başladı mı (başlamış nöbet verilemez) */
function mk_started(array $L): bool
{
    $m = mk_meta($L['meta']);
    $st = (string)($m['start'] ?? '');
    $t = strtotime((string)$L['date'] . ' ' . (preg_match('/^\d{2}:\d{2}$/', $st) ? $st : '08:00'));
    return $t !== false && $t <= time();
}

/** İlan için kişinin zaman çizelgesi penceresi */
function mk_listing_tl(array $L): array
{
    return mk_tl((int)$L['roster_id'], mk_shift_day((string)$L['date'], -45), mk_shift_day((string)$L['date'], 45));
}

/**
 * Bu kişi (listede $uk anahtarlı) bu ilana başvurabilir mi?
 * give: o gün boş + nöbeti alınca kurallar + ilan sahibinde boşluk oluşmaz.
 * swap: kendi nöbetlerinden (±31 gün, gelecekte) karşılıklı kurallara uyanlar.
 */
function mk_eligible(array $tl, array $L, string $uk, string $who = 'Senin'): array
{
    $rules = rules_cfg();
    $pk = swap_key((string)$L['name']);
    $date = (string)$L['date'];
    $row = $tl[$pk]['days'][$date] ?? null;
    if (!$row || $row['kind'] !== 'shift') return ['ok' => false, 'reason' => 'İlan sahibinin bu nöbeti listede artık görünmüyor.', 'offers' => []];
    if (!isset($tl[$uk])) return ['ok' => false, 'reason' => 'Bu nöbet listesinde adın yok.', 'offers' => []];
    // Yalnız ilanın ayındaki listede adı geçenler (önceki ayın listesinden kalanlar değil)
    if (!array_filter(array_keys($tl[$uk]['days']), fn($d) => strncmp((string)$d, substr($date, 0, 7), 7) === 0)) return ['ok' => false, 'reason' => 'Bu ayın listesinde adın yok.', 'offers' => []];
    if ($uk === $pk) return ['ok' => false, 'reason' => 'Kendi ilanın.', 'offers' => []];
    $P = $tl[$pk]['days'];
    $U = $tl[$uk]['days'];
    $pName = mk_first((string)(mk_user_for((string)$L['name'])['name'] ?? $L['name']));
    if (isset($U[$date])) {
        $x = $U[$date];
        $what = $x['kind'] === 'shift' ? 'nöbetin var' : ($x['kind'] === 'leave' ? 'iznin var' : 'listede kaydın var');
        return ['ok' => false, 'reason' => swap_fmt_date($date) . ' günü zaten ' . $what . ' (' . $x['code'] . ').', 'offers' => []];
    }
    $pWithout = $P;
    unset($pWithout[$date]);
    if ($L['kind'] === 'give') {
        $nu = $U;
        $nu[$date] = $row;
        $err = swap_check($nu, [$date], [], $rules, $who) ?? swap_check($pWithout, [], [$date], $rules, $pName);
        return $err ? ['ok' => false, 'reason' => $err . '.', 'offers' => []] : ['ok' => true, 'reason' => null, 'offers' => []];
    }
    $today = mk_today();
    $offers = [];
    $lastErr = null;
    foreach ($U as $e => $r2) {
        if ($r2['kind'] !== 'shift' || $e < $today || $e === $date || isset($P[$e])) continue;
        if (abs(strtotime($e) - strtotime($date)) > 31 * 86400) continue;
        $nu = $U;
        unset($nu[$e]);
        $nu[$date] = $row;
        $np = $pWithout;
        $np[$e] = $r2;
        $err = swap_check($nu, [$date], [$e], $rules, $who) ?? swap_check($np, [$e], [$date], $rules, $pName);
        if ($err) { $lastErr = $lastErr ?? $err; continue; }
        $offers[] = ['date' => $e, 'code' => $r2['code'], 'label' => $r2['label'], 'hours' => $r2['hours'] !== null ? (int)$r2['hours'] : null,
            'start' => $r2['start_time'], 'end' => $r2['end_time'], 'same' => (int)($r2['hours'] ?? 0) === (int)($row['hours'] ?? -1)];
    }
    usort($offers, fn($a, $b) => [$b['same'], $a['date']] <=> [$a['same'], $b['date']]);
    if (!$offers) return ['ok' => false, 'reason' => $lastErr ? 'Takas için uygun nöbetin yok: ' . $lastErr . '.' : 'Takas edebileceğin uygun bir nöbetin yok (±31 gün içinde).', 'offers' => []];
    return ['ok' => true, 'reason' => null, 'offers' => $offers];
}

/** Dışarıya gönderilen ilan. $manage: ilan sahibi veya yayıncı (başvuranları ve alanı görür) */
function mk_listing_out(array $L, array $me, bool $manage, ?array $elig = null, ?array $myApp = null): array
{
    $m = mk_meta($L['meta']);
    $poster = mk_user_by_id((int)$L['user_id']);
    $status = (string)$L['status'];
    $mine = (int)$L['user_id'] === (int)$me['id'];
    $o = [
        'id' => (int)$L['id'], 'roster_id' => (int)$L['roster_id'], 'roster' => mk_roster_names()[(int)$L['roster_id']] ?? '',
        'date' => $L['date'], 'code' => $L['code'], 'label' => $m['label'] ?? null, 'hours' => isset($m['hours']) ? (int)$m['hours'] : null,
        'start' => $m['start'] ?? null, 'end' => $m['end'] ?? null, 'kind' => $L['kind'], 'note' => $L['note'],
        'status' => $manage || $status === 'open' ? $status : 'closed', 'created_at' => $L['created_at'], 'closed_at' => $L['closed_at'],
        'poster' => $poster ? $poster['name'] : $L['name'], 'poster_user' => (int)$L['user_id'], 'mine' => $mine, 'manage' => $manage,
        'my_app' => $myApp ? ['id' => (int)$myApp['id'], 'status' => $myApp['status'], 'offer_date' => $myApp['offer_date'], 'offer_code' => $myApp['offer_code'], 'note' => $myApp['note'], 'created_at' => $myApp['created_at']] : null,
        'elig' => $elig,
    ];
    if ($manage) {
        $taker = $L['taker_user'] ? mk_user_by_id((int)$L['taker_user']) : null;
        $o['taker'] = $L['taker_name'] ? ($taker['name'] ?? $L['taker_name']) : null;
        $o['taker_date'] = $L['taker_date'];
        $o['taker_code'] = $L['taker_code'];
        $o['swap_status'] = $L['swap_request_id'] ? val('SELECT status FROM swap_requests WHERE id = ?', [(int)$L['swap_request_id']]) : null;
        $o['apps_n'] = (int)val("SELECT COUNT(*) FROM listing_apps WHERE listing_id = ? AND status = 'applied'", [(int)$L['id']]);
        $o['reason'] = $m['reason'] ?? null;
    }
    return $o;
}

/** Açık ilanlar için kullanıcının başvuru uygunluğu: [ilan id => elig] */
function mk_elig_map(array $listings, array $me): array
{
    $my = mk_my_rosters($me);
    $byR = [];
    foreach ($listings as $L) if ($L['status'] === 'open' && (int)$L['user_id'] !== (int)$me['id']) $byR[(int)$L['roster_id']][] = $L;
    $out = [];
    foreach ($byR as $rid => $list) {
        if (!isset($my[$rid])) { foreach ($list as $L) $out[(int)$L['id']] = ['ok' => false, 'reason' => 'Bu nöbet listesinde adın yok.', 'offers' => []]; continue; }
        $dates = array_column($list, 'date');
        $tl = mk_tl($rid, mk_shift_day(min($dates), -45), mk_shift_day(max($dates), 45));
        $uk = swap_key($my[$rid]);
        foreach ($list as $L) $out[(int)$L['id']] = mk_eligible($tl, $L, $uk);
    }
    return $out;
}

function a_listing_list(): void
{
    $me = need_user();
    $pub = is_publisher($me);
    $my = mk_my_rosters($me);
    $today = mk_today();
    $board = all("SELECT * FROM listings WHERE user_id <> ? AND ((status = 'open' AND date >= ?) OR (status <> 'open' AND closed_at >= ? AND date >= ?)) ORDER BY date, id LIMIT 300",
        [$me['id'], $today, date('Y-m-d H:i:s', time() - 3 * 86400), mk_shift_day($today, -1)]);
    if (!$pub) $board = array_values(array_filter($board, fn($L) => isset($my[(int)$L['roster_id']])));
    $mine = all('SELECT * FROM listings WHERE user_id = ? AND (date >= ? OR created_at >= ?) ORDER BY date DESC, id DESC LIMIT 80',
        [$me['id'], mk_shift_day($today, -30), date('Y-m-d H:i:s', time() - 30 * 86400)]);
    $apps = all('SELECT * FROM listing_apps WHERE user_id = ? ORDER BY id DESC LIMIT 200', [$me['id']]);
    $myApps = [];
    foreach ($apps as $a) if (!isset($myApps[(int)$a['listing_id']])) $myApps[(int)$a['listing_id']] = $a;
    $applied = $myApps ? all('SELECT * FROM listings WHERE id IN (' . implode(',', array_fill(0, count($myApps), '?')) . ') AND date >= ? ORDER BY date',
        [...array_keys($myApps), mk_shift_day($today, -30)]) : [];
    $elig = mk_elig_map($board, $me);
    out([
        'board' => array_map(fn($L) => mk_listing_out($L, $me, $pub, $elig[(int)$L['id']] ?? null, $myApps[(int)$L['id']] ?? null), $board),
        'mine' => array_map(fn($L) => mk_listing_out($L, $me, true), $mine),
        'applied' => array_map(fn($L) => mk_listing_out($L, $me, $pub, null, $myApps[(int)$L['id']] ?? null), $applied),
        'in_roster' => (bool)$my, 'rules' => rules_cfg(),
    ]);
}

/** İlana koymadan önce: nöbetim, devredebilir miyim, kaç kişi alabilir */
function mk_post_info(array $me, string $date): array
{
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    if ($date < mk_today()) fail('Geçmiş günlerin nöbeti ilana konamaz.');
    $mine = swap_my_shift($me, $date);
    if (!$mine) fail('Bu gün listede nöbetin görünmüyor.');
    $rid = (int)$mine['roster_id'];
    $tl = mk_tl($rid, mk_shift_day($date, -45), mk_shift_day($date, 45));
    $mk = swap_key((string)$mine['name']);
    if (!isset($tl[$mk]['days'][$date])) fail('Bu nöbet için kabul edilmiş bir değişim/devir zaten var ya da listede adın bulunamadı.');
    $iv = swap_interval($date, $tl[$mk]['days'][$date]);
    if ($iv && $iv[0] <= time()) fail('Başlamış ya da bitmiş nöbet ilana konamaz.');
    $row = $tl[$mk]['days'][$date];
    $without = $tl[$mk]['days'];
    unset($without[$date]);
    $giveErr = swap_check($without, [], [$date], rules_cfg(), 'Senin');
    $n = ['give' => 0, 'swap' => 0];
    foreach (['give', 'swap'] as $kind) {
        if ($kind === 'give' && $giveErr) continue;
        $L = ['name' => $mine['name'], 'date' => $date, 'kind' => $kind, 'roster_id' => $rid];
        foreach ($tl as $k => $p) if ($k !== $mk && mk_eligible($tl, $L, $k, 'O')['ok']) $n[$kind]++;
    }
    return ['rid' => $rid, 'name' => (string)$mine['name'], 'row' => $row, 'roster' => (string)$mine['roster_name'], 'give_error' => $giveErr, 'n' => $n, 'tl' => $tl];
}

function a_listing_check(): void
{
    $me = need_user();
    $date = s('date', 10);
    $x = mk_post_info($me, $date);
    $open = one("SELECT id, kind FROM listings WHERE user_id = ? AND date = ? AND status = 'open'", [$me['id'], $date]);
    $row = $x['row'];
    out(['mine' => ['date' => $date, 'code' => $row['code'], 'label' => $row['label'], 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null,
        'start' => $row['start_time'], 'end' => $row['end_time'], 'roster' => $x['roster'], 'roster_id' => $x['rid']],
        'give_error' => $x['give_error'], 'can' => $x['n'], 'open' => $open ? ['id' => (int)$open['id'], 'kind' => $open['kind']] : null, 'rules' => rules_cfg()]);
}

function a_listing_create(): void
{
    $me = need_user();
    $date = s('date', 10);
    $kind = s('kind', 10) === 'swap' ? 'swap' : 'give';
    $note = s('note', 300);
    $x = mk_post_info($me, $date);
    if ($kind === 'give' && $x['give_error']) fail('Devredemezsin: ' . $x['give_error'] . '. “Değiş” seçeneğini deneyebilirsin.');
    if (one("SELECT id FROM listings WHERE user_id = ? AND date = ? AND status = 'open'", [$me['id'], $date])) fail('Bu nöbet zaten ilanda.');
    if (one("SELECT id FROM swap_requests WHERE from_user = ? AND from_date = ? AND status = 'accepted'", [$me['id'], $date])) fail('Bu nöbet için kabul edilmiş bir değişim var; Excel’e işlenmesi bekleniyor.');
    $row = $x['row'];
    $meta = ['label' => $row['label'], 'hours' => $row['hours'] !== null ? (int)$row['hours'] : null, 'start' => $row['start_time'], 'end' => $row['end_time']];
    q('INSERT INTO listings (roster_id, user_id, name, date, code, kind, note, status, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$x['rid'], $me['id'], $x['name'], $date, $row['code'], $kind, $note ?: null, 'open', now(), json_encode($meta, JSON_UNESCAPED_UNICODE)]);
    $id = insert_id();
    $L = one('SELECT * FROM listings WHERE id = ?', [$id]);
    // Başvurabilecek durumdaki (kurallara uyan) liste arkadaşlarına haber ver
    $ids = [];
    foreach ($x['tl'] as $k => $p) {
        if ($k === swap_key($x['name'])) continue;
        $u = mk_user_for((string)$p['name']);
        if (!$u || (int)$u['id'] === (int)$me['id']) continue;
        if (mk_eligible($x['tl'], $L, $k, 'O')['ok']) $ids[] = (int)$u['id'];
    }
    $txt = $me['name'] . ' · ' . swap_fmt_date($date) . ' ' . mk_row_text($row) . ' (' . $row['code'] . ') nöbetini ' . ($kind === 'give' ? 'devrediyor' : 'değişmek istiyor') . ($note ? ' · “' . $note . '”' : '');
    $n = $ids ? notify_users(mk_full_users($ids), 'listing', 'Yeni nöbet ilanı', $txt, '#/ilanlar/' . $id, null) : 0;
    audit($me, 'listing.create', swap_fmt_date($date) . ' (' . $row['code'] . ')', $kind === 'give' ? 'Devret' : 'Değiş');
    out(['listing' => mk_listing_out($L, $me, true), 'notified' => $n]);
}

/** Başvuranlar (yalnız ilan sahibi / yayıncı) ve güncel uygunlukları */
function mk_apps_out(array $L): array
{
    $tl = mk_listing_tl($L);
    $open = $L['status'] === 'open';
    $out = [];
    foreach (all('SELECT * FROM listing_apps WHERE listing_id = ? ORDER BY id', [(int)$L['id']]) as $a) {
        $u = mk_user_by_id((int)$a['user_id']);
        $valid = null;
        if ($open && $a['status'] === 'applied') {
            $e = mk_eligible($tl, $L, swap_key((string)$a['name']), mk_first((string)($u['name'] ?? $a['name'])));
            if ($e['ok'] && $L['kind'] === 'swap' && !in_array($a['offer_date'], array_column($e['offers'], 'date'), true)) $e = ['ok' => false, 'reason' => 'Önerilen gün artık kurallara uymuyor.'];
            $valid = ['ok' => $e['ok'], 'reason' => $e['reason']];
        }
        $off = null;
        if ($a['offer_date']) { $r = $tl[swap_key((string)$a['name'])]['days'][$a['offer_date']] ?? null; $off = $r ? ['hours' => $r['hours'] !== null ? (int)$r['hours'] : null, 'start' => $r['start_time'], 'end' => $r['end_time'], 'label' => $r['label']] : null; }
        $out[] = ['id' => (int)$a['id'], 'name' => $u['name'] ?? $a['name'], 'user_id' => (int)$a['user_id'], 'offer_date' => $a['offer_date'], 'offer_code' => $a['offer_code'],
            'offer' => $off, 'note' => $a['note'], 'status' => $a['status'], 'created_at' => $a['created_at'], 'valid' => $valid];
    }
    return $out;
}

function a_listing_get(): void
{
    $me = need_user();
    $L = mk_listing((int)i('id'));
    $manage = (int)$L['user_id'] === (int)$me['id'] || is_publisher($me);
    $my = mk_my_rosters($me);
    $myApp = one('SELECT * FROM listing_apps WHERE listing_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [$L['id'], $me['id']]);
    if (!$manage && !isset($my[(int)$L['roster_id']]) && !$myApp) fail('Bu ilan yalnız aynı listedeki kişilere açık.', 403);
    $elig = null;
    if ($L['status'] === 'open' && (int)$L['user_id'] !== (int)$me['id']) $elig = mk_elig_map([$L], $me)[(int)$L['id']] ?? null;
    $o = mk_listing_out($L, $me, $manage, $elig, $myApp);
    if ($manage) $o['apps'] = mk_apps_out($L);
    out(['listing' => $o]);
}

function a_listing_apply(): void
{
    $me = need_user();
    $L = mk_listing((int)i('id'));
    if ((int)$L['user_id'] === (int)$me['id']) fail('Kendi ilanına başvuramazsın.');
    if ($L['status'] !== 'open' || $L['date'] < mk_today() || mk_started($L)) fail('Bu ilan kapandı.');
    $my = mk_my_rosters($me);
    $rid = (int)$L['roster_id'];
    if (!isset($my[$rid])) fail('Bu ilan yalnız aynı listedeki kişilere açık.', 403);
    $e = mk_eligible(mk_listing_tl($L), $L, swap_key($my[$rid]));
    if (!$e['ok']) fail((string)$e['reason']);
    $offer = null;
    if ($L['kind'] === 'swap') {
        $od = s('offer_date', 10);
        foreach ($e['offers'] as $x) if ($x['date'] === $od) $offer = $x;
        if (!$offer) fail('Karşılığında vereceğin nöbeti seç.');
    }
    $prev = one('SELECT * FROM listing_apps WHERE listing_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [$L['id'], $me['id']]);
    if ($prev && $prev['status'] === 'applied') fail('Bu ilana zaten başvurdun.');
    if ($prev && in_array($prev['status'], ['chosen', 'rejected'], true)) fail('Bu ilan için başvurun sonuçlandı.');
    $note = s('note', 300);
    if ($prev) {
        q("UPDATE listing_apps SET status = 'applied', offer_date = ?, offer_code = ?, note = ?, created_at = ?, name = ? WHERE id = ?",
            [$offer['date'] ?? null, $offer['code'] ?? null, $note ?: null, now(), $my[$rid], $prev['id']]);
    } else {
        q('INSERT INTO listing_apps (listing_id, user_id, name, offer_date, offer_code, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$L['id'], $me['id'], $my[$rid], $offer['date'] ?? null, $offer['code'] ?? null, $note ?: null, 'applied', now()]);
        // Çift dokunma / tekrar gönderim: kişi başına tek başvuru satırı kalsın
        $keep = (int)val('SELECT MIN(id) FROM listing_apps WHERE listing_id = ? AND user_id = ?', [$L['id'], $me['id']]);
        q('DELETE FROM listing_apps WHERE listing_id = ? AND user_id = ? AND id <> ?', [$L['id'], $me['id'], $keep]);
        q("UPDATE listing_apps SET status = 'applied', offer_date = ?, offer_code = ?, note = ? WHERE id = ?", [$offer['date'] ?? null, $offer['code'] ?? null, $note ?: null, $keep]);
    }
    $poster = mk_full_users([(int)$L['user_id']]);
    $txt = $L['kind'] === 'swap'
        ? $me['name'] . ' ' . swap_fmt_date((string)$L['date']) . ' nöbetin için karşılığında ' . swap_fmt_date((string)$offer['date']) . ' (' . $offer['code'] . ') nöbetini öneriyor.'
        : $me['name'] . ' ' . swap_fmt_date((string)$L['date']) . ' (' . $L['code'] . ') nöbetini almak istiyor.';
    if ($poster) notify_users($poster, 'listing', 'İlanına başvuru var', $txt . ($note ? ' · “' . $note . '”' : '') . ' Başvuranlar arasından seçebilirsin.', '#/ilanlar/' . $L['id'], null);
    audit($me, 'listing.apply', swap_fmt_date((string)$L['date']) . ' (' . $L['code'] . ')', $offer ? 'Karşılığında ' . swap_fmt_date((string)$offer['date']) : '');
    out(['listing' => mk_listing_out(one('SELECT * FROM listings WHERE id = ?', [$L['id']]), $me, is_publisher($me), null,
        one('SELECT * FROM listing_apps WHERE listing_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [$L['id'], $me['id']]))]);
}

function a_listing_withdraw(): void
{
    $me = need_user();
    $L = mk_listing((int)i('id'));
    $a = one("SELECT * FROM listing_apps WHERE listing_id = ? AND user_id = ? AND status = 'applied'", [$L['id'], $me['id']]);
    if (!$a) fail('Geri çekilecek başvuru yok.');
    if ($L['status'] !== 'open') fail('Bu ilan kapandı.');
    q("UPDATE listing_apps SET status = 'withdrawn' WHERE id = ?", [$a['id']]);
    audit($me, 'listing.withdraw', swap_fmt_date((string)$L['date']) . ' (' . $L['code'] . ')');
    out(['ok' => true]);
}

function a_listing_choose(): void
{
    $me = need_user();
    $L = mk_listing((int)i('id'));
    if ((int)$L['user_id'] !== (int)$me['id']) fail('Başvuranlar arasından yalnız ilan sahibi seçebilir.', 403);
    if ($L['status'] !== 'open') fail('Bu ilan artık açık değil.');
    if ($L['date'] < mk_today() || mk_started($L)) fail('Nöbet başladı ya da tarihi geçti.');
    $a = one('SELECT * FROM listing_apps WHERE id = ? AND listing_id = ?', [(int)i('app_id'), $L['id']]);
    if (!$a || $a['status'] !== 'applied') fail('Başvuru bulunamadı ya da geri çekildi.');
    $tl = mk_listing_tl($L);
    $taker = mk_user_by_id((int)$a['user_id']);
    $takerName = (string)($taker['name'] ?? $a['name']);
    // Liste değişmiş olabilir: kuralları yeniden denetle
    $e = mk_eligible($tl, $L, swap_key((string)$a['name']), mk_first($takerName));
    if (!$e['ok']) fail('Bu başvuru artık kurallara uymuyor: ' . $e['reason']);
    if ($L['kind'] === 'swap' && !in_array($a['offer_date'], array_column($e['offers'], 'date'), true)) fail('Önerilen takas günü artık kurallara uymuyor.');
    if (one("SELECT id FROM swap_requests WHERE from_user = ? AND from_date = ? AND status = 'accepted'", [$me['id'], $L['date']])) fail('Bu nöbet için zaten kabul edilmiş bir değişim var.');
    $row = $tl[swap_key((string)$L['name'])]['days'][$L['date']];
    $swap = $L['kind'] === 'swap';
    try {
    $sid = mk_tx(function () use ($L, $a, $me, $row, $swap) {
        q('INSERT INTO swap_requests (roster_id, kind, from_user, from_name, from_date, from_code, to_user, to_name, to_date, to_code, status, note, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$L['roster_id'], $swap ? 'swap' : 'give', $L['user_id'], $L['name'], $L['date'], $row['code'], $a['user_id'], $a['name'], $swap ? $a['offer_date'] : null, $swap ? $a['offer_code'] : null,
                'accepted', 'Nöbet ilanından', now(), now()]);
        $sid = insert_id();
        $n = q("UPDATE listings SET status = 'taken', taker_user = ?, taker_name = ?, taker_date = ?, taker_code = ?, swap_request_id = ?, closed_at = ? WHERE id = ? AND status = 'open'",
            [$a['user_id'], $a['name'], $swap ? $a['offer_date'] : null, $swap ? $a['offer_code'] : null, $sid, now(), $L['id']])->rowCount();
        if ($n !== 1) throw new RuntimeException('İlan az önce kapandı.');
        q("UPDATE listing_apps SET status = 'chosen' WHERE id = ?", [$a['id']]);
        q("UPDATE listing_apps SET status = 'rejected' WHERE listing_id = ? AND id <> ? AND user_id <> ? AND status = 'applied'", [$L['id'], $a['id'], $a['user_id']]);
        q("DELETE FROM listing_apps WHERE listing_id = ? AND user_id = ? AND id <> ?", [$L['id'], $a['user_id'], $a['id']]); // olası çift başvuru kaydı
        return $sid;
    });
    } catch (RuntimeException $e) { fail($e->getMessage()); }
    $r = one('SELECT * FROM swap_requests WHERE id = ?', [$sid]);
    $d = swap_fmt_date((string)$L['date']);
    // Seçilen kişi
    $chosenTxt = $swap
        ? $me['name'] . ' ile değişim: sen ' . $d . ' (' . $L['code'] . '), ' . mk_first((string)$me['name']) . ' ' . swap_fmt_date((string)$a['offer_date']) . ' (' . $a['offer_code'] . ') nöbetini tutacak.'
        : $me['name'] . ' ' . $d . ' (' . $L['code'] . ') nöbetini sana devretti.';
    notify_users(mk_full_users([(int)$a['user_id']]), 'listing', 'İlan: seçildin', $chosenTxt . ' Sorumlu Excel’de güncelleyince listene işlenir.', '#/ilanlar', null);
    // Seçilmeyenler (kimin seçildiği söylenmez)
    $rej = array_values(array_unique(array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM listing_apps WHERE listing_id = ? AND status = 'rejected' AND user_id <> ?", [$L['id'], $a['user_id']]))));
    if ($rej) notify_users(mk_full_users($rej), 'listing', 'İlan kapandı', $d . ' (' . $L['code'] . ') ilanı kapandı; bu kez seçilmedin.', '#/ilanlar', null);
    // Sorumlular: Excel'e işlenecek (mevcut değişim akışı)
    $pubs = mk_pubs([(int)$me['id'], (int)$a['user_id']]);
    if ($pubs) notify_users($pubs, 'swap', 'Excel’e işlenecek nöbet değişimi', swap_req_text($r) . ' (nöbet ilanından)', '#/nobetim', [
        'subject' => 'Excel’e işlenecek nöbet değişimi', 'heading' => 'Nöbet ilanında anlaşma sağlandı',
        'lines' => [swap_req_text($r), 'Excel listesinde güncellediğinizde uygulama değişimi kendiliğinden işler.'], 'button' => 'Uygulamada gör',
    ], 'notoff');
    audit($me, 'listing.choose', $d . ' (' . $L['code'] . ')', swap_req_text($r));
    $L = one('SELECT * FROM listings WHERE id = ?', [$L['id']]);
    $o = mk_listing_out($L, $me, true);
    $o['apps'] = mk_apps_out($L);
    out(['listing' => $o]);
}

function a_listing_cancel(): void
{
    $me = need_user();
    $L = mk_listing((int)i('id'));
    $own = (int)$L['user_id'] === (int)$me['id'];
    if (!$own && !is_publisher($me)) fail('Bu ilanı yalnız sahibi geri çekebilir.', 403);
    if ($L['status'] !== 'open') fail('Bu ilan zaten kapalı.');
    q("UPDATE listings SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'", [now(), $L['id']]);
    $ids = array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM listing_apps WHERE listing_id = ? AND status = 'applied'", [$L['id']]));
    $d = swap_fmt_date((string)$L['date']);
    if ($ids) notify_users(mk_full_users($ids), 'listing', 'İlan geri çekildi', ($own ? $me['name'] . ' ' : '') . $d . ' (' . $L['code'] . ') ilanı geri çekildi.', '#/ilanlar', null);
    if (!$own) notify_users(mk_full_users([(int)$L['user_id']]), 'listing', 'İlanın kapatıldı', $d . ' (' . $L['code'] . ') ilanını ' . $me['name'] . ' kapattı.', '#/ilanlar', null);
    audit($me, 'listing.cancel', $d . ' (' . $L['code'] . ')', $own ? '' : 'İlan sahibi: ' . $L['name']);
    out(['ok' => true]);
}

/** İlanı tamamen sil (ilan sahibi veya sorumlu). Açıksa başvuranlara bildirilir; seçimle oluşan değişim kaydı korunur. */
function a_listing_delete(): void
{
    $me = need_user();
    $L = mk_listing((int)i('id'));
    $own = (int)$L['user_id'] === (int)$me['id'];
    if (!$own && !is_publisher($me)) fail('Bu ilanı yalnız sahibi veya sorumlu silebilir.', 403);
    $d = swap_fmt_date((string)$L['date']);
    if ($L['status'] === 'open') {
        $ids = array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM listing_apps WHERE listing_id = ? AND status = 'applied'", [$L['id']]));
        if ($ids) notify_users(mk_full_users($ids), 'listing', 'İlan kaldırıldı', $d . ' (' . $L['code'] . ') ilanı kaldırıldı.', '#/ilanlar', null);
    }
    q('DELETE FROM listing_apps WHERE listing_id = ?', [$L['id']]);
    q('DELETE FROM listings WHERE id = ?', [$L['id']]);
    audit($me, 'listing.delete', $d . ' (' . $L['code'] . ')', $own ? '' : 'İlan sahibi: ' . $L['name']);
    out(['ok' => true]);
}

/* =================================================================== */
/* Eksik personel çağrısı                                               */
/* =================================================================== */

const CO_KEYS = ['free', 'leave', 'wknd', 'req', 'rest', 'cont', 'gap', 'exempt'];

/** [başlangıç, bitiş, saat, etiket, varsayılan kod] */
function co_def(string $shift): array
{
    $d = ['day' => ['08:00', '16:00', 8, 'Gündüz', '8 16'], 'night' => ['16:00', '08:00', 16, 'Gece', '16 8'], '24' => ['08:00', '08:00', 24, '24 saat', '8 8']];
    return $d[$shift] ?? $d['day'];
}

function co_text(string $shift): string
{
    return ['day' => '08-16', 'night' => '16-08', '24' => '24 saat'][$shift] ?? $shift;
}

function co_conds(): array
{
    $r = rules_cfg();
    return [
        ['key' => 'free', 'label' => 'O gün nöbeti yok', 'short' => 'Gün boş'],
        ['key' => 'leave', 'label' => 'İzinli değil', 'short' => 'İzin yok'],
        ['key' => 'wknd', 'label' => 'İzin öncesi/sonrası hafta sonu değil (en az ' . max(1, (int)($r['leave_wknd'] ?? 5)) . ' iş günü izin)', 'short' => 'İzin hafta sonu'],
        ['key' => 'req', 'label' => 'Onaylı boşluk isteği yok', 'short' => 'İstek yok'],
        ['key' => 'rest', 'label' => 'Dinlenme en az ' . $r['rest'] . ' saat', 'short' => 'Dinlenme'],
        ['key' => 'cont', 'label' => 'Üst üste ' . (2 * $r['max_cont']) . ' saat yok', 'short' => (2 * $r['max_cont']) . ' sa yok'],
        ['key' => 'gap', 'label' => ($r['max_gap'] + 1) . ' gün boşluk oluşmaz', 'short' => ($r['max_gap'] + 1) . ' gün'],
        ['key' => 'exempt', 'label' => 'Muaf değil', 'short' => 'Muaf değil'],
    ];
}

/** Vardiyanın bu listede kullanılan kodu (yoksa sözlükten, o da yoksa varsayılan) */
function co_row(string $shift, array $rids, ?string $code = null): array
{
    [$st, $en, $h, $lab, $def] = co_def($shift);
    $label = null;
    if ($code === null && $rids) {
        $r = one('SELECT s.code, COUNT(*) AS n FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id IN (' . implode(',', array_fill(0, count($rids), '?')) . ") AND s.kind = 'shift' AND s.start_time = ? AND s.end_time = ? GROUP BY s.code ORDER BY n DESC LIMIT 1", [...$rids, $st, $en]);
        $code = $r ? (string)$r['code'] : null;
    }
    if ($code === null && function_exists('shift_codes')) {
        foreach (shift_codes() ?? [] as $c) if (($c['kind'] ?? 'shift') === 'shift' && ($c['start'] ?? null) === $st && ($c['end'] ?? null) === $en) { $code = (string)$c['code']; $label = $c['label'] ?? null; break; }
    }
    return ['kind' => 'shift', 'code' => $code ?? $def, 'label' => $label ?? $lab, 'hours' => $h, 'start_time' => $st, 'end_time' => $en];
}

/** Çağrının kapsamı: seçilen taraf (+ isterse karşı taraf). Taraf ayarı yoksa liste. */
function co_scope(string $side, bool $other, int $rid = 0): array
{
    $sides = function_exists('sides_cfg') ? array_values(array_filter(sides_cfg(), fn($s) => $s['roster_id'] > 0)) : [];
    if ($sides) {
        $main = null;
        foreach ($sides as $s) if ($s['key'] === $side) $main = $s;
        if (!$main && $rid) foreach ($sides as $s) if ($s['roster_id'] === $rid) $main = $s;
        $main = $main ?? $sides[0];
        $out = [$main + ['main' => true]];
        if ($other) foreach ($sides as $s) if ($s['key'] !== $main['key'] && $s['roster_id'] !== $main['roster_id']) $out[] = $s + ['main' => false];
        return $out;
    }
    $all = all("SELECT id, name FROM rosters WHERE kind <> 'tablo' AND parsed_file_id IS NOT NULL ORDER BY sort, id");
    $main = null;
    foreach ($all as $r) if ((int)$r['id'] === $rid) $main = $r;
    $main = $main ?? ($all[0] ?? null);
    if (!$main) return [];
    $out = [['key' => 'r' . $main['id'], 'name' => (string)$main['name'], 'roster_id' => (int)$main['id'], 'units' => [], 'main' => true]];
    if ($other) foreach ($all as $r) if ((int)$r['id'] !== (int)$main['id']) $out[] = ['key' => 'r' . $r['id'], 'name' => (string)$r['name'], 'roster_id' => (int)$r['id'], 'units' => [], 'main' => false];
    return $out;
}

function co_scope_of(array $C): array
{
    $m = mk_meta($C['meta']);
    return co_scope((string)$C['side'], !empty($m['other']), (int)$C['roster_id']);
}

function co_filters_of(array $C): array
{
    $f = mk_meta($C['filters']);
    $on = array_values(array_intersect(CO_KEYS, (array)($f['on'] ?? CO_KEYS)));
    return $on;
}

/** Onaylı boşluk/izin istekleri (istek modülünün tablosu) */
function co_req_blocks(string $date): array
{
    try { return all("SELECT name, kind FROM shift_requests WHERE date = ? AND status = 'approved'", [$date]); } catch (Throwable $e) { return []; }
}

/**
 * $date günü $row nöbeti eklenirse (o günkü kayıt hariç): dinlenme ve üst üste çalışma.
 * Kural motoruyla aynı mantık (swap_check): iki nöbet arası 0 saat ise üst üste sayılır.
 */
function co_eval(array $days, string $date, array $row, array $rules): array
{
    $iv0 = swap_interval($date, $row);
    $ivs = [];
    foreach ($days as $d => $r) { if ($d === $date) continue; $x = swap_interval($d, $r); if ($x) $ivs[] = $x; }
    $prevEnd = null; $nextStart = null; $overlap = false;
    foreach ($ivs as [$a, $b]) {
        if ($b <= $iv0[0]) { if ($prevEnd === null || $b > $prevEnd) $prevEnd = $b; }
        elseif ($a >= $iv0[1]) { if ($nextStart === null || $a < $nextStart) $nextStart = $a; }
        else $overlap = true;
    }
    // Bu nöbeti içeren kesintisiz blok
    $all = $ivs;
    $all[] = $iv0;
    usort($all, fn($x, $y) => $x[0] <=> $y[0]);
    $bs = $iv0[0]; $be = $iv0[1];
    $changed = true;
    while ($changed) {
        $changed = false;
        foreach ($all as [$a, $b]) if ($a <= $be && $b >= $bs && ($a < $bs || $b > $be)) { $bs = min($bs, $a); $be = max($be, $b); $changed = true; }
    }
    $blockH = (int)round(($be - $bs) / 3600);
    $rest = (int)$rules['rest'] * 3600;
    $rb = $prevEnd !== null ? $iv0[0] - $prevEnd : null;
    $ra = $nextStart !== null ? $nextStart - $iv0[1] : null;
    $why = null;
    if ($overlap) $why = 'Başka bir nöbetiyle çakışıyor';
    elseif ($rb !== null && $rb > 0 && $rb < $rest) $why = 'Önceki nöbetten ' . (int)round($rb / 3600) . ' saat sonra başlar (en az ' . $rules['rest'] . ')';
    elseif ($ra !== null && $ra > 0 && $ra < $rest) $why = 'Sonraki nöbetine ' . (int)round($ra / 3600) . ' saat kalır (en az ' . $rules['rest'] . ')';
    $contOk = !$overlap && $blockH <= (int)$rules['max_cont'];
    return [
        'rest' => $why === null, 'rest_why' => $why,
        'cont' => $contOk, 'cont_why' => $contOk ? null : ($overlap ? 'Nöbetler çakışıyor' : 'Üst üste ' . $blockH . ' saat çalışma olur (en fazla ' . $rules['max_cont'] . ')'),
        'prev_end' => $prevEnd, 'next_start' => $nextStart,
        'rest_before' => $rb !== null ? (int)floor($rb / 3600) : null, 'rest_after' => $ra !== null ? (int)floor($ra / 3600) : null,
    ];
}

/** Ay için gereken saat (Takvimim ile aynı: hafta içi gün × 8, hafta içi izin günleri düşülür) */
function co_required(string $ym, array $days): int
{
    $first = $ym . '-01';
    $n = (int)date('t', strtotime($first));
    $req = 0;
    for ($i = 1; $i <= $n; $i++) {
        $d = $ym . '-' . str_pad((string)$i, 2, '0', STR_PAD_LEFT);
        $w = (int)date('w', strtotime($d));
        if ($w === 0 || $w === 6) continue;
        $r = $days[$d] ?? null;
        if ($r && $r['kind'] === 'leave') continue;
        $req += 8;
    }
    return $req;
}

function co_count_on(array $tl, string $date, array $periods): int
{
    $n = 0;
    foreach ($tl as $p) {
        $r = $p['days'][$date] ?? null;
        if ($r && $r['kind'] === 'shift' && array_intersect(shift_periods($r), $periods)) $n++;
    }
    return $n;
}

/**
 * Aday listesi (boşta olanlar + kaydırma adayları), her biri şart şart ✓/✗, adalet ölçüleri ve sıra.
 * $C: kayıtlı çağrı (yanıtlar işaretlenir) ya da null (yeni çağrı önizlemesi).
 */
function co_candidates(string $date, string $shift, array $scope, ?array $C = null): array
{
    $rules = rules_cfg();
    $from = mk_shift_day($date, -40);
    $to = mk_shift_day($date, 40);
    $rids = array_column($scope, 'roster_id');
    $row = $C ? co_row($shift, $rids, (string)$C['code']) : co_row($shift, $rids);
    $periods = shift_periods($row);
    $ym = substr($date, 0, 7);
    $reqs = co_req_blocks($date);
    $resp = [];
    if ($C) foreach (all('SELECT * FROM callout_resp WHERE callout_id = ?', [(int)$C['id']]) as $r) $resp[swap_key((string)$r['name'])] = $r;
    try { $needs = needs_by_side($date); } catch (Throwable $e) { $needs = []; }
    $people = []; $moves = []; $coverage = []; $seen = [];
    $t0 = strtotime($date . ' ' . $row['start_time']);
    $tsOut = fn($ts) => $ts !== null ? date('Y-m-d H:i', (int)$ts) : null;
    $base = function (array $p, array $sd, array $st, array $days, string $k) use ($ym, $resp) {
        $u = mk_user_for((string)$p['name']);
        $rs = $resp[$k] ?? null;
        return ['key' => $k, 'name' => $p['name'], 'display' => $u ? $u['name'] : $p['name'], 'user_id' => $u ? (int)$u['id'] : null, 'title' => $p['title'],
            'side' => $sd['key'], 'side_name' => $sd['name'], 'other' => empty($sd['main']), 'roster_id' => $sd['roster_id'],
            'month_hours' => (int)($st['month_hours'] ?? 0), 'month_shifts' => (int)($st['month_shifts'] ?? 0), 'overtime' => (int)($st['month_hours'] ?? 0) - co_required($ym, $days),
            'last7' => (int)($st['last7'] ?? 0), 'free_days' => (int)($st['free_days'] ?? 0), 'cross' => (int)($st['cross'] ?? 0),
            'resp' => $rs ? ['id' => (int)$rs['id'], 'answer' => $rs['answer'], 'chosen' => (bool)$rs['chosen'], 'move_from' => $rs['move_from']] : null];
    };
    $dayConds = function (array $p, ?array $dRow, string $scopeEx) use ($reqs, $date) {
        $c = []; $why = [];
        $c['free'] = !$dRow || !in_array($dRow['kind'], ['shift', 'role'], true);
        if (!$c['free']) $why['free'] = 'O gün listede: ' . $dRow['code'];
        $c['leave'] = !$dRow || !in_array($dRow['kind'], ['leave', 'off'], true);
        if (!$c['leave']) $why['leave'] = ($dRow['label'] ?: 'İzinli') . ' (' . $dRow['code'] . ')';
        $lw = rules_leave_weekend($p['days'], $date, (string)$p['name']);
        $c['wknd'] = $lw === null;
        if ($lw) $why['wknd'] = $lw;
        $rq = null;
        foreach ($reqs as $q) if (names_match((string)$q['name'], (string)$p['name'])) $rq = $q;
        $c['req'] = $rq === null;
        if ($rq) $why['req'] = $rq['kind'] === 'izin' ? 'Onaylı yıllık izin isteği var' : 'Onaylı boşluk isteği var';
        $ex = rules_is_exempt((string)$p['name'], $scopeEx, $date);
        $c['exempt'] = !$ex;
        if ($ex) $why['exempt'] = $scopeEx === 'kaydirma' ? 'Kaydırmadan muaf' : 'Çağrıdan muaf';
        return [$c, $why];
    };
    foreach ($scope as $sd) {
        $tl = mk_tl((int)$sd['roster_id'], $from, $to);
        $stats = rules_fair_stats((int)$sd['roster_id'], $date);
        $need = $needs[$sd['key']] ?? null;
        $coverage[] = ['key' => $sd['key'], 'name' => $sd['name'], 'main' => !empty($sd['main']),
            'have' => ['day' => co_count_on($tl, $date, ['day']), 'night' => co_count_on($tl, $date, ['night'])], 'need' => $need];
        foreach ($tl as $k => $p) {
            if (isset($seen[$k])) continue;
            // Aday yalnızca çağrının ayındaki listede adı geçen kişidir (önceki/sonraki ayın listesindekiler değil);
            // dinlenme / 48 saat denetimi için komşu günler yine okunur
            if (!array_filter(array_keys($p['days']), fn($d) => strncmp((string)$d, $ym, 7) === 0)) continue;
            $seen[$k] = true;
            $days = $p['days'];
            $dRow = $days[$date] ?? null;
            [$c, $why] = $dayConds($p, $dRow, 'cagri');
            $ev = co_eval($days, $date, $row, $rules);
            $c['rest'] = $ev['rest']; if (!$ev['rest']) $why['rest'] = $ev['rest_why'];
            $c['cont'] = $ev['cont']; if (!$ev['cont']) $why['cont'] = $ev['cont_why'];
            $c['gap'] = true; // nöbet eklemek boşluk oluşturmaz
            // Kural motoruyla son denetim (çakışma vb.)
            if ($c['free'] && $c['leave'] && $c['rest'] && $c['cont']) {
                $err = rules_check_add($days, $date, $row, mk_first((string)$p['name']));
                if ($err) { $c['cont'] = false; $why['cont'] = $err; }
            }
            $people[] = $base($p, $sd, $stats[$k] ?? [], $days, $k) + [
                'c' => $c, 'why' => (object)$why, 'ok' => !in_array(false, $c, true), 'day_code' => $dRow['code'] ?? null, 'day_kind' => $dRow['kind'] ?? null,
                'extra' => function_exists('ex_wants') && ex_wants((string)$p['name'], $date, $shift),
                'prev_end' => $tsOut($ev['prev_end']), 'next_start' => $tsOut($ev['next_start']), 'rest_before' => $ev['rest_before'], 'rest_after' => $ev['rest_after'],
                'move' => null,
            ];
        }
        // Kaydırma: ertesi (veya önceki) gün aynı tür nöbeti olan, bu güne kaydırılınca kurallara uyanlar
        foreach ([1, -1] as $dir) {
            $fromD = mk_shift_day($date, $dir);
            $haveFrom = null;
            foreach ($tl as $k => $p) {
                $r = $p['days'][$fromD] ?? null;
                if (!$r || $r['kind'] !== 'shift' || shift_periods($r) !== $periods) continue;
                // Başlamış/geçmiş nöbet kaydırılamaz; aday o ayın listesinde olmalı
                $iv0 = swap_interval($fromD, $r);
                if (!$iv0 || $iv0[0] <= time()) continue;
                if (!array_filter(array_keys($p['days']), fn($d) => strncmp((string)$d, $ym, 7) === 0)) continue;
                $days = $p['days'];
                $dRow = $days[$date] ?? null;
                [$c, $why] = $dayConds($p, $dRow, 'kaydirma');
                unset($days[$fromD]);
                $ev = co_eval($days, $date, $r, $rules);
                $c['rest'] = $ev['rest']; if (!$ev['rest']) $why['rest'] = $ev['rest_why'];
                $c['cont'] = $ev['cont']; if (!$ev['cont']) $why['cont'] = $ev['cont_why'];
                $nd = $days;
                $nd[$date] = $r;
                $gErr = swap_check($nd, [], [$fromD], $rules, mk_first((string)$p['name']));
                $c['gap'] = $gErr === null;
                if ($gErr) $why['gap'] = $gErr;
                // O gün eksik kalır mı (gereken sayıya göre)
                $haveFrom = $haveFrom ?? co_count_on($tl, $fromD, $periods);
                $needFrom = 0;
                static $nbCache = [];
                try { $nb = ($nbCache[$fromD] ??= needs_by_side($fromD))[$sd['key']] ?? null; if ($nb) foreach ($periods as $pp) $needFrom = max($needFrom, (int)($nb[$pp] ?? 0)); } catch (Throwable $e) { /* */ }
                $short = $needFrom > 0 ? $needFrom - ($haveFrom - 1) : 0;
                $warn = $short > 0 ? swap_fmt_date($fromD) . ' ' . co_text(count($periods) > 1 ? '24' : $periods[0]) . ' için ' . $short . ' kişi eksik kalır (gereken ' . $needFrom . ')' : null;
                $moves[] = $base($p, $sd, $stats[$k] ?? [], $p['days'], $k) + [
                    'c' => $c, 'why' => (object)$why, 'ok' => !in_array(false, $c, true), 'day_code' => $dRow['code'] ?? null, 'day_kind' => $dRow['kind'] ?? null,
                    'prev_end' => $tsOut($ev['prev_end']), 'next_start' => $tsOut($ev['next_start']), 'rest_before' => $ev['rest_before'], 'rest_after' => $ev['rest_after'],
                    'move' => ['from' => $fromD, 'code' => $r['code'], 'dir' => $dir, 'warn' => $warn, 'have' => $haveFrom, 'need' => $needFrom],
                ];
            }
        }
    }
    // Adalet sırası: en çok boşluk → bu ay az saat (az fazla mesai) → son 7 günde az nöbet; eşitler "eşit" (kura)
    $fair = fn($x) => [-$x['free_days'], $x['month_hours'], $x['last7']];
    // Ekstra nöbet isteyenler (uygunsa) en üstte
    $sortFn = fn($a, $b) => [!$a['ok'], empty($a['extra']), ...$fair($a), $a['display']] <=> [!$b['ok'], empty($b['extra']), ...$fair($b), $b['display']];
    usort($people, $sortFn);
    usort($moves, $sortFn);
    foreach ([&$people, &$moves] as &$list) {
        foreach ($list as $i => &$x) { $x['rank'] = $i + 1; $x['fair'] = implode('|', $fair($x)); }
        unset($x);
    }
    unset($list);
    return ['date' => $date, 'shift' => $shift, 'text' => co_text($shift), 'row' => ['code' => $row['code'], 'label' => $row['label'], 'hours' => $row['hours'], 'start' => $row['start_time'], 'end' => $row['end_time']],
        'scope' => array_map(fn($s) => ['key' => $s['key'], 'name' => $s['name'], 'main' => !empty($s['main']), 'units' => $s['units']], $scope),
        'coverage' => $coverage, 'conds' => co_conds(), 'people' => $people, 'moves' => $moves, 'rules' => $rules];
}

function co_get(int $id): array
{
    $C = one('SELECT * FROM callouts WHERE id = ?', [$id]);
    if (!$C) fail('Çağrı bulunamadı.', 404);
    return $C;
}

function co_out(array $C, bool $pub): array
{
    $m = mk_meta($C['meta']);
    $scope = co_scope_of($C);
    $o = ['id' => (int)$C['id'], 'date' => $C['date'], 'shift' => $C['shift'], 'text' => co_text((string)$C['shift']), 'code' => $C['code'], 'need' => (int)$C['need'],
        'status' => $C['status'], 'note' => $C['note'], 'unit' => $C['unit'], 'side' => $C['side'], 'side_name' => $scope[0]['name'] ?? '', 'roster_id' => $C['roster_id'] !== null ? (int)$C['roster_id'] : null,
        'created_at' => $C['created_at'], 'closed_at' => $C['closed_at'], 'applied' => $m['applied'] ?? null, 'expired' => !empty($m['expired'])];
    if ($pub) {
        $by = $C['created_by'] ? mk_user_by_id((int)$C['created_by']) : null;
        $o['created_by'] = $by['name'] ?? null;
        $o['other'] = !empty($m['other']);
        $o['filters'] = co_filters_of($C);
        $o['draws'] = $m['draws'] ?? [];
        $cnt = ['asked' => 0, 'yes' => 0, 'no' => 0, 'chosen' => 0];
        $chosen = [];
        foreach (all('SELECT * FROM callout_resp WHERE callout_id = ?', [(int)$C['id']]) as $r) {
            $cnt['asked']++;
            if ($r['answer'] === 'yes') $cnt['yes']++;
            if ($r['answer'] === 'no') $cnt['no']++;
            if ((int)$r['chosen']) { $cnt['chosen']++; $u = $r['user_id'] ? mk_user_by_id((int)$r['user_id']) : null; $chosen[] = ['name' => $u['name'] ?? $r['name'], 'move_from' => $r['move_from']]; }
        }
        $o['counts'] = $cnt;
        $o['chosen'] = $chosen;
    }
    return $o;
}

function co_resp_out(array $r): array
{
    $u = $r['user_id'] ? mk_user_by_id((int)$r['user_id']) : null;
    return ['id' => (int)$r['id'], 'name' => $u['name'] ?? $r['name'], 'roster_name' => $r['name'], 'user_id' => $r['user_id'] !== null ? (int)$r['user_id'] : null, 'phone' => $u['phone'] ?? null,
        'answer' => $r['answer'], 'chosen' => (bool)$r['chosen'], 'move_from' => $r['move_from'], 'created_at' => $r['created_at'], 'answered_at' => $r['answered_at']];
}

/** Gelen seçimleri adaylar listesinde bul ve etkin şartlara göre doğrula */
function co_pick(array $cand, array $asks, array $on): array
{
    // O gün nöbeti olmama, izinli olmama, 16 saat dinlenme ve 48 saat kuralı kapatılamaz
    $on = array_values(array_unique(array_merge($on, ['free', 'leave', 'rest', 'cont'])));
    $out = [];
    $seen = [];
    foreach (array_slice($asks, 0, 60) as $a) {
        if (!is_array($a)) continue;
        $name = trim((string)($a['name'] ?? ''));
        $from = (string)($a['from'] ?? '');
        $hit = null;
        foreach ($from === '' ? $cand['people'] : $cand['moves'] as $x) if ($x['name'] === $name && ($from === '' || $x['move']['from'] === $from)) $hit = $x;
        if (!$hit) fail($name . ' aday listesinde yok; liste değişmiş olabilir.');
        if (isset($seen[$hit['key']])) continue;
        $seen[$hit['key']] = true;
        foreach ($on as $k) if (empty($hit['c'][$k])) fail($hit['display'] . ': ' . (((array)$hit['why'])[$k] ?? 'şartlara uymuyor'));
        $out[] = $hit;
    }
    return $out;
}

function co_ask_text(array $C, ?string $moveFrom): string
{
    $d = swap_fmt_date((string)$C['date']);
    $t = $d . ' ' . co_text((string)$C['shift']) . ' için ' . (int)$C['need'] . ' kişi eksik. ';
    $t .= $moveFrom ? swap_fmt_date($moveFrom) . ' nöbetini ' . mk_date_to((string)$C['date']) . ' kaydırabilir misin?' : 'Gelebilir misin?';
    return $t . ($C['unit'] ? ' · ' . $C['unit'] : '') . ($C['note'] ? ' · “' . $C['note'] . '”' : '');
}

/** Seçilen adaylara sor: yanıt kaydı + bildirim. Dönen: [sorulan sayısı, hesabı olmayanlar] */
function co_send_asks(array $C, array $list): array
{
    $have = [];
    foreach (all('SELECT name FROM callout_resp WHERE callout_id = ?', [(int)$C['id']]) as $r) $have[swap_key((string)$r['name'])] = true;
    $n = 0;
    $noAcc = [];
    foreach ($list as $x) {
        if (isset($have[$x['key']])) continue;
        $from = $x['move']['from'] ?? null;
        q('INSERT INTO callout_resp (callout_id, user_id, name, answer, chosen, move_from, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
            [$C['id'], $x['user_id'], $x['name'], 'asked', $from, now()]);
        $n++;
        if (!$x['user_id']) { $noAcc[] = $x['display']; continue; }
        $txt = co_ask_text($C, $from);
        notify_users(mk_full_users([$x['user_id']]), 'callout', 'Eksik personel çağrısı', $txt, '#/eksik/' . $C['id'], [
            'subject' => 'Eksik personel: ' . swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']), 'heading' => 'Eksik personel çağrısı',
            'lines' => [$txt, 'Uygulamadan “Gelebilirim” ya da “Gelemem” diye yanıtlayabilirsin.'], 'button' => 'Yanıtla',
        ], 'notoff');
    }
    return [$n, $noAcc];
}

function a_callout_meta(): void
{
    need_publisher();
    $sides = function_exists('sides_cfg') ? array_values(array_filter(sides_cfg(), fn($s) => $s['roster_id'] > 0)) : [];
    out(['sides' => $sides, 'rosters' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], all("SELECT id, name FROM rosters WHERE kind <> 'tablo' AND parsed_file_id IS NOT NULL ORDER BY sort, id")),
        'conds' => co_conds(), 'rules' => rules_cfg()]);
}

function a_callout_candidates(): void
{
    need_publisher();
    if (i('id')) {
        $C = co_get((int)i('id'));
        out(co_candidates((string)$C['date'], (string)$C['shift'], co_scope_of($C), $C) + ['callout_id' => (int)$C['id']]);
    }
    $date = s('date', 10);
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    $shift = s('shift', 5);
    if (!in_array($shift, ['day', 'night', '24'], true)) $shift = 'day';
    $scope = co_scope(s('side', 20), b('other'), (int)(i('roster_id') ?? 0));
    if (!$scope) fail('Nöbet listesi bulunamadı. Önce bir nöbet listesi yükleyin.');
    out(co_candidates($date, $shift, $scope));
}

function a_callout_create(): void
{
    $me = need_publisher();
    $date = s('date', 10);
    if (!valid_ymd($date)) fail('Geçersiz tarih.');
    if ($date < mk_today()) fail('Geçmiş bir gün için çağrı açılamaz.');
    $shift = s('shift', 5);
    if (!in_array($shift, ['day', 'night', '24'], true)) fail('Vardiya seçin.');
    $need = max(1, min(20, (int)(i('need') ?? 1)));
    $other = b('other');
    $scope = co_scope(s('side', 20), $other, (int)(i('roster_id') ?? 0));
    if (!$scope) fail('Nöbet listesi bulunamadı.');
    $on = array_values(array_intersect(CO_KEYS, array_map('strval', arr('filters'))));
    $cand = co_candidates($date, $shift, $scope);
    $list = co_pick($cand, arr('asks'), $on);
    $unit = s('unit', 40);
    if ($unit !== '' && $scope[0]['units'] && !in_array($unit, $scope[0]['units'], true)) $unit = '';
    $meta = ['other' => $other, 'label' => $cand['row']['label'], 'draws' => []];
    q('INSERT INTO callouts (roster_id, side, unit, date, shift, code, need, status, note, filters, created_by, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$scope[0]['roster_id'], $scope[0]['key'], $unit ?: null, $date, $shift, $cand['row']['code'], $need, 'open', s('note', 300) ?: null,
            json_encode(['on' => $on], JSON_UNESCAPED_UNICODE), $me['id'], now(), json_encode($meta, JSON_UNESCAPED_UNICODE)]);
    $id = insert_id();
    $C = co_get($id);
    [$n, $noAcc] = co_send_asks($C, $list);
    audit($me, 'callout.create', swap_fmt_date($date) . ' ' . co_text($shift) . ' · ' . $need . ' kişi', $scope[0]['name'] . ($n ? ' · ' . $n . ' kişiye soruldu' : ''));
    out(['id' => $id, 'asked' => $n, 'no_account' => $noAcc, 'callout' => co_out($C, true)]);
}

function a_callout_ask(): void
{
    $me = need_publisher();
    $C = co_get((int)i('id'));
    if ($C['status'] !== 'open') fail('Bu çağrı kapandı.');
    if ($C['date'] < mk_today()) fail('Çağrının tarihi geçti.');
    $cand = co_candidates((string)$C['date'], (string)$C['shift'], co_scope_of($C), $C);
    $list = co_pick($cand, arr('asks'), co_filters_of($C));
    [$n, $noAcc] = co_send_asks($C, $list);
    if (!$n) fail('Seçilenlere zaten sorulmuş.');
    audit($me, 'callout.ask', swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']), $n . ' kişiye soruldu');
    out(['asked' => $n, 'no_account' => $noAcc]);
}

function a_callout_list(): void
{
    $me = need_user();
    $today = mk_today();
    if (is_publisher($me)) {
        $rows = all('SELECT * FROM callouts WHERE date >= ? OR status = ? ORDER BY date DESC, id DESC LIMIT 150', [mk_shift_day($today, -60), 'open']);
        $mine = [];
        foreach (all('SELECT id, callout_id, answer, chosen, move_from FROM callout_resp WHERE user_id = ?', [$me['id']]) as $x) {
            $mine[(int)$x['callout_id']] = ['id' => (int)$x['id'], 'answer' => $x['answer'], 'chosen' => (bool)$x['chosen'], 'move_from' => $x['move_from']];
        }
        out(['items' => array_map(fn($C) => co_out($C, true) + (isset($mine[(int)$C['id']]) ? ['me' => $mine[(int)$C['id']]] : []), $rows), 'pub' => true]);
    }
    $rows = all('SELECT c.*, r.id AS resp_id, r.answer, r.chosen, r.move_from FROM callout_resp r JOIN callouts c ON c.id = r.callout_id WHERE r.user_id = ? AND c.date >= ? ORDER BY c.date DESC, c.id DESC LIMIT 60',
        [$me['id'], mk_shift_day($today, -30)]);
    out(['items' => array_map(fn($C) => co_out($C, false) + ['me' => ['id' => (int)$C['resp_id'], 'answer' => $C['answer'], 'chosen' => (bool)$C['chosen'], 'move_from' => $C['move_from']]], $rows), 'pub' => false]);
}

function a_callout_get(): void
{
    $me = need_user();
    $C = co_get((int)i('id'));
    if (is_publisher($me)) {
        $resp = all('SELECT * FROM callout_resp WHERE callout_id = ? ORDER BY chosen DESC, id', [(int)$C['id']]);
        // Yayıncıya da sorulmuş olabilir (ör. yayıncı hemşire): kendi yanıtını verebilsin
        $mine = null;
        foreach ($resp as $x) if ((int)$x['user_id'] === (int)$me['id']) $mine = ['id' => (int)$x['id'], 'answer' => $x['answer'], 'chosen' => (bool)$x['chosen'], 'move_from' => $x['move_from'], 'answered_at' => $x['answered_at']];
        out(['callout' => co_out($C, true), 'resp' => array_map('co_resp_out', $resp), 'pub' => true, 'conds' => co_conds(), 'me' => $mine]);
    }
    $r = one('SELECT * FROM callout_resp WHERE callout_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [(int)$C['id'], $me['id']]);
    if (!$r) fail('Bu çağrı size gönderilmemiş.', 403);
    out(['callout' => co_out($C, false), 'me' => ['id' => (int)$r['id'], 'answer' => $r['answer'], 'chosen' => (bool)$r['chosen'], 'move_from' => $r['move_from'], 'answered_at' => $r['answered_at']], 'pub' => false]);
}

function a_callout_answer(): void
{
    $me = need_user();
    $C = co_get((int)i('id'));
    if ($C['status'] !== 'open') fail('Bu çağrı kapandı; yanıt artık gerekmiyor.');
    if ($C['date'] < mk_today()) fail('Çağrının tarihi geçti.');
    $rid = i('resp_id');
    $forOther = $rid !== null && is_publisher($me);
    $r = $forOther ? one('SELECT * FROM callout_resp WHERE id = ? AND callout_id = ?', [$rid, (int)$C['id']])
        : one('SELECT * FROM callout_resp WHERE callout_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [(int)$C['id'], $me['id']]);
    if (!$r) fail('Bu çağrı size gönderilmemiş.', 403);
    if ((int)$r['chosen']) fail('Bu çağrı için zaten seçildin.');
    $yes = b('yes');
    q('UPDATE callout_resp SET answer = ?, answered_at = ? WHERE id = ?', [$yes ? 'yes' : 'no', now(), $r['id']]);
    $who = $forOther ? (string)(mk_user_by_id((int)$r['user_id'])['name'] ?? $r['name']) : (string)$me['name'];
    // Yanıt (gelebilir de gelemez de) çağrıyı açana bildirilir; kendi çağrısına kendisi yanıt verdiyse bildirim gerekmez
    if (!$forOther && (int)($C['created_by'] ?? 0) !== (int)$me['id']) {
        $to = $C['created_by'] ? mk_full_users([(int)$C['created_by']]) : [];
        if (!$to) $to = mk_pubs();
        $txt = swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']) . ($yes && $r['move_from'] ? ' (' . swap_fmt_date((string)$r['move_from']) . ' nöbetini kaydırarak)' : '') . ' · ' . (int)$C['need'] . ' kişi eksik';
        notify_users($to, 'callout', 'Çağrıya yanıt: ' . $who . ($yes ? ' gelebilir' : ' gelemez'), $txt, '#/eksik/' . $C['id'], null);
    }
    audit($me, 'callout.answer', swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']), ($forOther ? $who . ' adına: ' : '') . ($yes ? 'Gelebilir' : 'Gelemez'));
    out(['answer' => $yes ? 'yes' : 'no']);
}

function a_callout_choose(): void
{
    $me = need_publisher();
    $C = co_get((int)i('id'));
    if ($C['status'] !== 'open') fail('Bu çağrı artık açık değil.');
    if ($C['date'] < mk_today()) fail('Çağrının tarihi geçti.');
    $r = one('SELECT * FROM callout_resp WHERE id = ? AND callout_id = ?', [(int)i('resp_id'), (int)$C['id']]);
    if (!$r) fail('Yanıt bulunamadı.', 404);
    if ($r['answer'] !== 'yes') fail('Yalnız “gelebilirim” diyenler seçilebilir.');
    if ((int)$r['chosen']) fail('Bu kişi zaten seçildi.');
    // Liste değişmiş olabilir: güncel şartlarla yeniden denetle
    $cand = co_candidates((string)$C['date'], (string)$C['shift'], co_scope_of($C), $C);
    co_pick($cand, [['name' => $r['name'], 'from' => (string)($r['move_from'] ?? '')]], co_filters_of($C));
    try {
    $filled = mk_tx(function () use ($C, $r) {
        if ((string)val('SELECT status FROM callouts WHERE id = ?', [(int)$C['id']]) !== 'open') throw new RuntimeException('Bu çağrı az önce kapandı.');
        if ((int)val('SELECT COUNT(*) FROM callout_resp WHERE callout_id = ? AND chosen = 1', [(int)$C['id']]) >= (int)$C['need']) throw new RuntimeException('Gereken kişi sayısı az önce doldu.');
        if (q('UPDATE callout_resp SET chosen = 1 WHERE id = ? AND chosen = 0', [$r['id']])->rowCount() !== 1) throw new RuntimeException('Bu kişi zaten seçildi.');
        $n = (int)val('SELECT COUNT(*) FROM callout_resp WHERE callout_id = ? AND chosen = 1', [(int)$C['id']]);
        if ($n >= (int)$C['need']) { q("UPDATE callouts SET status = 'filled', closed_at = ? WHERE id = ? AND status = 'open'", [now(), $C['id']]); return true; }
        return false;
    });
    } catch (RuntimeException $e) { fail($e->getMessage()); }
    $u = $r['user_id'] ? mk_user_by_id((int)$r['user_id']) : null;
    $who = (string)($u['name'] ?? $r['name']);
    $d = swap_fmt_date((string)$C['date']);
    $txt = $r['move_from'] ? $who . ': ' . swap_fmt_date((string)$r['move_from']) . ' nöbeti ' . mk_date_to((string)$C['date']) . ' kayacak (' . co_text((string)$C['shift']) . ')'
        : $who . ' ' . $d . ' ' . co_text((string)$C['shift']);
    if ($u) notify_users(mk_full_users([(int)$u['id']]), 'callout', 'Eksik çağrısı: seçildin',
        ($r['move_from'] ? swap_fmt_date((string)$r['move_from']) . ' nöbetin ' . mk_date_to((string)$C['date']) . ' kayıyor (' . co_text((string)$C['shift']) . ').' : $d . ' ' . co_text((string)$C['shift']) . ' nöbetine geliyorsun.')
        . ' Sorumlu Excel’e işleyince takvimine eklenir.', '#/eksik/' . $C['id'], null);
    $pubs = mk_pubs([(int)$me['id']]);
    if ($pubs) notify_users($pubs, 'callout', 'Excel’e işlenecek: ' . $txt, $d . ' ' . co_text((string)$C['shift']) . ' eksik çağrısı · ' . $me['name'] . ' seçti.', '#/eksik/' . $C['id'], [
        'subject' => 'Excel’e işlenecek: ' . $txt, 'heading' => 'Eksik personel çağrısı sonuçlandı',
        'lines' => ['Excel’e işlenecek: ' . $txt, 'Excel listesinde güncellediğinizde uygulama çağrıyı kendiliğinden “listeye işlendi” yapar.'], 'button' => 'Uygulamada gör',
    ], 'notoff');
    if ($filled) {
        $rest = array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM callout_resp WHERE callout_id = ? AND chosen = 0 AND answer <> 'no' AND user_id IS NOT NULL", [(int)$C['id']]));
        if ($rest) notify_users(mk_full_users($rest), 'callout', 'Eksik kapandı', $d . ' ' . co_text((string)$C['shift']) . ' için yeterli kişi bulundu. Teşekkürler!', '#/eksik/' . $C['id'], null);
    }
    audit($me, 'callout.choose', $d . ' ' . co_text((string)$C['shift']), 'Excel’e işlenecek: ' . $txt);
    $C = co_get((int)$C['id']);
    out(['callout' => co_out($C, true), 'resp' => array_map('co_resp_out', all('SELECT * FROM callout_resp WHERE callout_id = ? ORDER BY chosen DESC, id', [(int)$C['id']])), 'filled' => $filled]);
}

function a_callout_cancel(): void
{
    $me = need_publisher();
    $C = co_get((int)i('id'));
    if ($C['status'] !== 'open') fail('Bu çağrı zaten kapalı.');
    q("UPDATE callouts SET status = 'cancelled', closed_at = ? WHERE id = ?", [now(), $C['id']]);
    $ids = array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM callout_resp WHERE callout_id = ? AND chosen = 0 AND answer <> 'no' AND user_id IS NOT NULL", [(int)$C['id']]));
    if ($ids) notify_users(mk_full_users($ids), 'callout', 'Eksik çağrısı iptal edildi', swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']) . ' çağrısı iptal edildi; gelmene gerek yok.', '#/eksik/' . $C['id'], null);
    audit($me, 'callout.cancel', swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']));
    out(['ok' => true]);
}

/** Yönetici/yayıncı: çağrıyı tamamen sil (yanıtlarıyla). Gelecekteki çağrıda gelmeyi bekleyenlere haber verilir; günlükte kalır */
function a_callout_delete(): void
{
    $me = need_publisher();
    $C = co_get((int)i('id'));
    $txt = swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']);
    if ($C['status'] !== 'cancelled' && (string)$C['date'] >= mk_today()) {
        $ids = array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM callout_resp WHERE callout_id = ? AND answer <> 'no' AND user_id IS NOT NULL AND user_id <> ?", [(int)$C['id'], (int)$me['id']]));
        if ($ids) notify_users(mk_full_users($ids), 'callout', 'Eksik çağrısı kaldırıldı', $txt . ' çağrısı kaldırıldı; gelmene gerek yok.', '#/eksik', null);
    }
    q('DELETE FROM callout_resp WHERE callout_id = ?', [(int)$C['id']]);
    q('DELETE FROM callouts WHERE id = ?', [(int)$C['id']]);
    audit($me, 'callout.delete', $txt, (int)$C['need'] . ' kişi eksik');
    out(['ok' => true]);
}

/** Eşit adaylar arasında kayıtlı kura */
function a_callout_draw(): void
{
    $me = need_publisher();
    $names = array_values(array_unique(array_filter(array_map(fn($x) => mb_substr(trim((string)$x), 0, 120), arr('names')), fn($x) => $x !== '')));
    if (count($names) < 2) fail('Kura için en az iki kişi gerekir.');
    if (count($names) > 40) fail('Çok fazla kişi.');
    $picked = $names[random_int(0, count($names) - 1)];
    $ctx = s('context', 80);
    if (i('id')) {
        $C = co_get((int)i('id'));
        $m = mk_meta($C['meta']);
        $m['draws'] = array_slice(array_merge($m['draws'] ?? [], [['at' => now(), 'by' => $me['name'], 'group' => $names, 'picked' => $picked]]), -20);
        q('UPDATE callouts SET meta = ? WHERE id = ?', [json_encode($m, JSON_UNESCAPED_UNICODE), $C['id']]);
        $ctx = swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']);
    }
    audit($me, 'callout.draw', 'Kura: ' . $picked, ($ctx ? $ctx . ' · ' : '') . 'Eşitler: ' . implode(', ', $names));
    out(['picked' => $picked, 'group' => $names, 'at' => now()]);
}

/** Excel için ay çizelgesi: kapsamdaki kişiler × ayın günleri */
function a_callout_sheet(): void
{
    need_publisher();
    if (i('id')) { $C = co_get((int)i('id')); $date = (string)$C['date']; $scope = co_scope_of($C); }
    else {
        $date = s('date', 10);
        if (!valid_ymd($date)) fail('Geçersiz tarih.');
        $scope = co_scope(s('side', 20), b('other'), (int)(i('roster_id') ?? 0));
    }
    $ym = substr($date, 0, 7);
    $first = $ym . '-01';
    $last = date('Y-m-t', strtotime($first));
    $sides = [];
    foreach ($scope as $sd) {
        $people = [];
        foreach (swap_timeline((int)$sd['roster_id'], $first, $last) as $p) {
            $days = [];
            $hours = 0;
            foreach ($p['days'] as $d => $r) {
                $days[(int)substr($d, 8, 2)] = ['c' => $r['code'], 'k' => $r['kind'], 'h' => $r['hours'] !== null ? (int)$r['hours'] : null, 's' => $r['start_time'], 'e' => $r['end_time']];
                if ($r['kind'] === 'shift') $hours += (int)($r['hours'] ?? 0);
            }
            $u = mk_user_for((string)$p['name']);
            $people[] = ['name' => $p['name'], 'display' => $u['name'] ?? $p['name'], 'title' => $p['title'], 'days' => (object)$days, 'hours' => $hours];
        }
        $sides[] = ['key' => $sd['key'], 'name' => $sd['name'], 'people' => $people];
    }
    $hol = [];
    foreach (holidays_between($first, $last) as $d => $h) $hol[(int)substr($d, 8, 2)] = $h['name'];
    out(['month' => $ym, 'days' => (int)date('t', strtotime($first)), 'day' => (int)substr($date, 8, 2), 'holidays' => (object)$hol, 'sides' => $sides]);
}

/* =================================================================== */
/* Ana sayfa özeti ve geçmiş                                            */
/* =================================================================== */

function a_market_home(): void
{
    $me = need_user();
    $today = mk_today();
    $asks = all("SELECT c.*, r.answer, r.move_from FROM callout_resp r JOIN callouts c ON c.id = r.callout_id WHERE r.user_id = ? AND c.status = 'open' AND c.date >= ? AND r.answer = 'asked' ORDER BY c.date LIMIT 10", [$me['id'], $today]);
    $my = mk_my_rosters($me);
    $open = [];
    if ($my) {
        $open = all("SELECT * FROM listings WHERE status = 'open' AND date >= ? AND user_id <> ? AND roster_id IN (" . implode(',', array_fill(0, count($my), '?')) . ') ORDER BY date LIMIT 60', [$today, $me['id'], ...array_keys($my)]);
    }
    $elig = mk_elig_map($open, $me);
    $applied = [];
    foreach (all("SELECT listing_id FROM listing_apps WHERE user_id = ? AND status IN ('applied', 'chosen')", [$me['id']]) as $a) $applied[(int)$a['listing_id']] = true;
    $can = 0;
    foreach ($open as $L) if (($elig[(int)$L['id']]['ok'] ?? false) && !isset($applied[(int)$L['id']])) $can++;
    $waiting = (int)val("SELECT COUNT(*) FROM listing_apps a JOIN listings l ON l.id = a.listing_id WHERE l.user_id = ? AND l.status = 'open' AND a.status = 'applied'", [$me['id']]);
    $o = ['asks' => array_map(fn($C) => co_out($C, false) + ['move_from' => $C['move_from']], $asks), 'listings' => ['can' => $can, 'open' => count($open), 'waiting' => $waiting]];
    if (is_publisher($me)) {
        $o['pub'] = ['open' => (int)val("SELECT COUNT(*) FROM callouts WHERE status = 'open' AND date >= ?", [$today]),
            'yes' => (int)val("SELECT COUNT(*) FROM callout_resp r JOIN callouts c ON c.id = r.callout_id WHERE c.status = 'open' AND c.date >= ? AND r.answer = 'yes' AND r.chosen = 0", [$today])];
    }
    out($o);
}

/** Yalnız yayıncılar: değişim, devir, ilan ve çağrı kayıtları */
function a_history_list(): void
{
    need_publisher();
    $ym = s('month', 7) ?: date('Y-m');
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) fail('Geçersiz ay.');
    $from = $ym . '-01';
    $to = date('Y-m-t', strtotime($from));
    $type = s('type', 10);
    $q = swap_key(s('q', 80));
    $rn = mk_roster_names();
    $disp = function (?int $uid, ?string $name) { $u = $uid ? mk_user_by_id($uid) : null; return $u['name'] ?? $name; };
    $state = fn(string $st, bool $applied = false) => $applied || $st === 'applied' ? 'applied' : (in_array($st, ['pending', 'open'], true) ? 'open' : (in_array($st, ['accepted', 'taken', 'filled'], true) ? 'waiting' : 'closed'));
    $items = [];
    $fromListing = [];
    foreach (all('SELECT * FROM listings WHERE date >= ? AND date <= ? ORDER BY date', [$from, $to]) as $L) {
        $sw = $L['swap_request_id'] ? one('SELECT status, applied_at FROM swap_requests WHERE id = ?', [(int)$L['swap_request_id']]) : null;
        if ($L['swap_request_id']) $fromListing[(int)$L['swap_request_id']] = true;
        $apps = (int)val("SELECT COUNT(*) FROM listing_apps WHERE listing_id = ? AND status <> 'withdrawn'", [(int)$L['id']]);
        $items[] = ['type' => 'listing', 'id' => (int)$L['id'], 'kind' => $L['kind'], 'date' => $L['date'], 'code' => $L['code'], 'who' => $disp((int)$L['user_id'], $L['name']),
            'with' => $L['taker_name'] ? $disp($L['taker_user'] ? (int)$L['taker_user'] : null, $L['taker_name']) : null, 'date2' => $L['taker_date'], 'code2' => $L['taker_code'],
            'status' => $L['status'], 'sub' => $sw['status'] ?? null, 'state' => $state((string)$L['status'], ($sw['status'] ?? '') === 'applied'), 'roster' => $rn[(int)$L['roster_id']] ?? '',
            'note' => $L['note'], 'created_at' => $L['created_at'], 'closed_at' => $L['closed_at'], 'applied_at' => $sw['applied_at'] ?? null, 'count' => $apps];
    }
    foreach (all('SELECT * FROM swap_requests WHERE (from_date >= ? AND from_date <= ?) OR (to_date >= ? AND to_date <= ?) ORDER BY from_date', [$from, $to, $from, $to]) as $r) {
        if (isset($fromListing[(int)$r['id']])) continue;
        $items[] = ['type' => $r['kind'] === 'swap' ? 'swap' : 'give', 'id' => (int)$r['id'], 'kind' => $r['kind'], 'date' => $r['from_date'], 'code' => $r['from_code'],
            'who' => $disp((int)$r['from_user'], $r['from_name']), 'with' => $disp($r['to_user'] !== null ? (int)$r['to_user'] : null, $r['to_name']), 'date2' => $r['to_date'], 'code2' => $r['to_code'],
            'status' => $r['status'], 'sub' => null, 'state' => $state((string)$r['status']), 'roster' => $rn[(int)$r['roster_id']] ?? '', 'note' => $r['note'],
            'created_at' => $r['created_at'], 'closed_at' => $r['decided_at'], 'applied_at' => $r['applied_at'], 'count' => null];
    }
    foreach (all('SELECT * FROM callouts WHERE date >= ? AND date <= ? ORDER BY date', [$from, $to]) as $C) {
        $m = mk_meta($C['meta']);
        $resp = all('SELECT * FROM callout_resp WHERE callout_id = ?', [(int)$C['id']]);
        $chosen = array_values(array_filter($resp, fn($r) => (int)$r['chosen'] === 1));
        $by = $C['created_by'] ? mk_user_by_id((int)$C['created_by']) : null;
        $items[] = ['type' => 'callout', 'id' => (int)$C['id'], 'kind' => $C['shift'], 'date' => $C['date'], 'code' => $C['code'], 'who' => $by['name'] ?? null,
            'with' => $chosen ? implode(', ', array_map(fn($r) => $disp($r['user_id'] !== null ? (int)$r['user_id'] : null, $r['name']) . ($r['move_from'] ? ' (' . swap_fmt_date((string)$r['move_from']) . ' nöbetini kaydırarak)' : ''), $chosen)) : null,
            'date2' => null, 'code2' => null, 'status' => $C['status'], 'sub' => !empty($m['expired']) ? 'expired' : null, 'state' => $state((string)$C['status'], !empty($m['applied'])),
            'roster' => $rn[(int)$C['roster_id']] ?? '', 'note' => $C['note'], 'created_at' => $C['created_at'], 'closed_at' => $C['closed_at'], 'applied_at' => $m['applied'] ?? null,
            'count' => count($resp), 'need' => (int)$C['need'], 'text' => co_text((string)$C['shift']), 'unit' => $C['unit'],
            'yes' => count(array_filter($resp, fn($r) => $r['answer'] === 'yes'))];
    }
    if ($type !== '' && $type !== 'all') $items = array_values(array_filter($items, fn($x) => $x['type'] === $type));
    if ($q !== '') $items = array_values(array_filter($items, fn($x) => str_contains(swap_key((string)$x['who'] . ' | ' . (string)$x['with']), $q)));
    usort($items, fn($a, $b) => [$b['date'], $b['created_at']] <=> [$a['date'], $a['created_at']]);
    out(['month' => $ym, 'items' => $items]);
}

/* =================================================================== */
/* Arka plan görevi                                                     */
/* =================================================================== */

/** Kişi o gün (herhangi bir listede) nöbetçi mi */
function mk_on_duty(string $name, string $date): bool
{
    foreach (all("SELECT s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date = ? AND s.kind = 'shift'", [$date]) as $r) {
        if (names_match((string)$r['name'], $name)) return true;
    }
    return false;
}

function mk_job(bool $force): ?array
{
    $today = date('Y-m-d');
    $done = ['expired' => 0, 'gone' => 0, 'applied' => 0];
    // 1) Tarihi geçen açık ilanlar
    foreach (array_filter(all("SELECT * FROM listings WHERE status = 'open' AND date <= ?", [$today]), fn($L) => $L['date'] < $today || mk_started($L)) as $L) {
        q("UPDATE listings SET status = 'expired', closed_at = ? WHERE id = ? AND status = 'open'", [now(), $L['id']]);
        $u = all('SELECT * FROM users WHERE id = ? AND status = ?', [(int)$L['user_id'], 'active']);
        if ($u) notify_users($u, 'listing', 'İlanın süresi doldu', swap_fmt_date((string)$L['date']) . ' (' . $L['code'] . ') ilanını alan olmadı; nöbet tarihi geçtiği için kapandı.', '#/ilanlar', null);
        $done['expired']++;
    }
    // 2) İlan sahibinin nöbeti listeden kalktıysa (Excel değişti) ilanı kapat
    foreach (all("SELECT * FROM listings WHERE status = 'open'") as $L) {
        $has = false;
        foreach (all("SELECT s.name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? AND s.date = ? AND s.kind = 'shift'", [(int)$L['roster_id'], $L['date']]) as $r) {
            if (swap_key((string)$r['name']) === swap_key((string)$L['name'])) { $has = true; break; }
        }
        if ($has) continue;
        $m = mk_meta($L['meta']);
        $m['reason'] = 'Nöbet Excel listesinde değişti';
        q("UPDATE listings SET status = 'cancelled', closed_at = ?, meta = ? WHERE id = ? AND status = 'open'", [now(), json_encode($m, JSON_UNESCAPED_UNICODE), $L['id']]);
        $ids = array_merge([(int)$L['user_id']], array_map(fn($x) => (int)$x['user_id'], all("SELECT user_id FROM listing_apps WHERE listing_id = ? AND status = 'applied'", [$L['id']])));
        $us = $ids ? all('SELECT * FROM users WHERE status = \'active\' AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) : [];
        if ($us) notify_users($us, 'listing', 'İlan kapandı', swap_fmt_date((string)$L['date']) . ' (' . $L['code'] . ') nöbeti Excel listesinde değiştiği için ilan kapandı.', '#/ilanlar', null);
        $done['gone']++;
    }
    // 3) Tarihi geçen açık çağrılar
    foreach (all("SELECT * FROM callouts WHERE status = 'open' AND date < ?", [$today]) as $C) {
        $m = mk_meta($C['meta']);
        $m['expired'] = true;
        q("UPDATE callouts SET status = 'cancelled', closed_at = ?, meta = ? WHERE id = ?", [now(), json_encode($m, JSON_UNESCAPED_UNICODE), $C['id']]);
        $done['expired']++;
    }
    // 4) Sonuçlanan çağrılar Excel'e işlendi mi
    foreach (all("SELECT * FROM callouts WHERE status = 'filled' AND date >= ?", [date('Y-m-d', strtotime('-14 days'))]) as $C) {
        $m = mk_meta($C['meta']);
        if (!empty($m['applied'])) continue;
        $chosen = all('SELECT * FROM callout_resp WHERE callout_id = ? AND chosen = 1', [(int)$C['id']]);
        if (!$chosen) continue;
        $ok = true;
        foreach ($chosen as $r) {
            if (!mk_on_duty((string)$r['name'], (string)$C['date'])) { $ok = false; break; }
            if ($r['move_from'] && mk_on_duty((string)$r['name'], (string)$r['move_from'])) { $ok = false; break; }
        }
        if (!$ok) continue;
        $m['applied'] = now();
        q('UPDATE callouts SET meta = ? WHERE id = ?', [json_encode($m, JSON_UNESCAPED_UNICODE), $C['id']]);
        $ids = array_filter(array_merge([(int)$C['created_by']], array_map(fn($r) => (int)$r['user_id'], $chosen)));
        $us = $ids ? all('SELECT * FROM users WHERE status = \'active\' AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_values($ids)) : [];
        $names = implode(', ', array_map(fn($r) => (string)$r['name'], $chosen));
        if ($us) notify_users($us, 'callout', 'Listeye işlendi', swap_fmt_date((string)$C['date']) . ' ' . co_text((string)$C['shift']) . ' eksik çağrısı Excel listesine işlendi: ' . $names . '.', '#/eksik/' . $C['id'], null);
        $done['applied']++;
    }
    return array_sum($done) ? $done : null;
}

$GLOBALS['NM_JOBS']['market'] = 'mk_job';
// Açılış verisi: menüdeki sayılar (S.market)
$GLOBALS['NM_BOOT'][] = function (array $me): array {
    $today = date('Y-m-d');
    $o = ['asks' => (int)val("SELECT COUNT(*) FROM callout_resp r JOIN callouts c ON c.id = r.callout_id WHERE r.user_id = ? AND r.answer = 'asked' AND c.status = 'open' AND c.date >= ?", [$me['id'], $today])];
    if (mk_is_pub($me)) $o['yes'] = (int)val("SELECT COUNT(*) FROM callout_resp r JOIN callouts c ON c.id = r.callout_id WHERE c.status = 'open' AND c.date >= ? AND r.answer = 'yes' AND r.chosen = 0", [$today]);
    return ['market' => $o];
};

return [
    'listing.list' => 'a_listing_list',
    'listing.check' => 'a_listing_check',
    'listing.create' => 'a_listing_create',
    'listing.get' => 'a_listing_get',
    'listing.apply' => 'a_listing_apply',
    'listing.withdraw' => 'a_listing_withdraw',
    'listing.choose' => 'a_listing_choose',
    'listing.cancel' => 'a_listing_cancel',
    'listing.delete' => 'a_listing_delete',
    'callout.meta' => 'a_callout_meta',
    'callout.candidates' => 'a_callout_candidates',
    'callout.create' => 'a_callout_create',
    'callout.ask' => 'a_callout_ask',
    'callout.list' => 'a_callout_list',
    'callout.get' => 'a_callout_get',
    'callout.answer' => 'a_callout_answer',
    'callout.choose' => 'a_callout_choose',
    'callout.cancel' => 'a_callout_cancel',
    'callout.delete' => 'a_callout_delete',
    'callout.draw' => 'a_callout_draw',
    'callout.sheet' => 'a_callout_sheet',
    'market.home' => 'a_market_home',
    'history.list' => 'a_history_list',
];
