<?php
/**
 * Hastane yemek listesi (4.12).
 *  - Aylık yemek listesi (kahvaltı, öğle, akşam) PDF / Excel'den içe aktarılır ya da elle yazılır; gün gün düzenlenir.
 *    Çok birimli kurulumda liste hastanenin ortak veritabanındadır (mutfak ortak): bir birimin yüklediğini tüm birimler görür.
 *    Tek birimli kurulumda birimin kendi veritabanındadır.
 *  - Öğün saatleri (varsayılan kahvaltı 01:00, öğle 12:00, akşam 18:00): uygulama saate göre "şimdiki / sıradaki" öğünü gösterir
 *    ve nöbet saatlerinin içine düşen öğünleri o nöbetin menüsü olarak listeler.
 *  - Kim görür: birim varsayılanı (herkes | yalnız nöbetçiler); kişi kendisi için değiştirebilir ya da tamamen gizleyebilir.
 */
declare(strict_types=1);

const ML_MEALS = ['kahvalti' => 'Kahvaltı', 'ogle' => 'Öğle yemeği', 'aksam' => 'Akşam yemeği'];
const ML_TIMES = ['kahvalti' => '01:00', 'ogle' => '12:00', 'aksam' => '18:00'];
const ML_MODES = ['all', 'shift'];
const ML_MAX_ITEMS = 25;
const ML_MAX_LEN = 100;

/** Liste hastane ortak veritabanında mı */
function ml_hosp(): bool { return function_exists('hdb') && hdb() !== null; }

function ml_all(string $sql, array $p = []): array { return ml_hosp() ? h_all(str_replace('{T}', 'h_meals', $sql), $p) : all(str_replace('{T}', 'meals', $sql), $p); }
function ml_val(string $sql, array $p = []) { return ml_hosp() ? h_val(str_replace('{T}', 'h_meals', $sql), $p) : val(str_replace('{T}', 'meals', $sql), $p); }
function ml_q(string $sql, array $p = []): void { if (ml_hosp()) h_q(str_replace('{T}', 'h_meals', $sql), $p); else q(str_replace('{T}', 'meals', $sql), $p); }

/** Hastane veritabanında yemek tablosu (H_SCHEMA'ya dokunmadan, ilk kullanımda) */
function ml_ensure(): void
{
    static $done = false;
    if ($done || !ml_hosp()) { $done = true; return; }
    $done = true;
    hdb()->exec("CREATE TABLE IF NOT EXISTS h_meals (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, meal TEXT NOT NULL, items TEXT NOT NULL, tkey TEXT NOT NULL DEFAULT '', unit_name TEXT NOT NULL DEFAULT '', updated_by_name TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
    hdb()->exec('CREATE UNIQUE INDEX IF NOT EXISTS h_meals_dm ON h_meals (date, meal)');
}

/* ---------------- Ayarlar ---------------- */

function ml_cfg_raw(): array
{
    if (ml_hosp()) {
        $v = h_val("SELECT v FROM h_settings WHERE k = 'meal_cfg'");
        $d = $v ? json_decode((string)$v, true) : null;
    } else {
        $d = json_decode(setting('meal_cfg', ''), true);
    }
    return is_array($d) ? $d : [];
}
/** Öğün saatleri (hastane ortak) */
function ml_times(): array
{
    $t = ml_cfg_raw()['times'] ?? [];
    $o = [];
    foreach (ML_TIMES as $k => $def) $o[$k] = is_string($t[$k] ?? null) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t[$k]) ? $t[$k] : $def;
    return $o;
}
/** Birimin varsayılan görünürlüğü: herkes | yalnız nöbetçiler */
function ml_mode(): string
{
    $m = setting('meal_mode', 'all');
    return in_array($m, ML_MODES, true) ? $m : 'all';
}

/* ---------------- Okuma ---------------- */

function ml_valid_date(string $d): bool
{
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/** [tarih => [öğün => [kalemler]]] */
function ml_days(string $from, string $to): array
{
    ml_ensure();
    $o = [];
    foreach (ml_all('SELECT date, meal, items FROM {T} WHERE date >= ? AND date <= ? ORDER BY date', [$from, $to]) as $r) {
        if (!isset(ML_MEALS[$r['meal']])) continue;
        $items = json_decode((string)$r['items'], true);
        if (!is_array($items) || !$items) continue;
        $o[$r['date']][$r['meal']] = array_values(array_filter(array_map('strval', $items), fn($x) => $x !== ''));
    }
    return $o;
}

/** Listesi olan aylar: [{ym, days}] (son 3 ay ve sonrası) */
function ml_months(): array
{
    ml_ensure();
    $from = date('Y-m-01', strtotime('-3 months'));
    $o = [];
    foreach (ml_all('SELECT DISTINCT date FROM {T} WHERE date >= ? ORDER BY date', [$from]) as $r) {
        $ym = substr((string)$r['date'], 0, 7);
        $o[$ym] = ($o[$ym] ?? 0) + 1;
    }
    $out = [];
    foreach ($o as $ym => $n) $out[] = ['ym' => $ym, 'days' => $n];
    return $out;
}

function ml_last_update(): ?array
{
    ml_ensure();
    if (ml_hosp()) {
        $r = h_one('SELECT unit_name, updated_by_name, updated_at FROM h_meals ORDER BY updated_at DESC LIMIT 1');
        return $r ? ['at' => $r['updated_at'], 'unit' => $r['unit_name'], 'by' => $r['updated_by_name']] : null;
    }
    $r = one('SELECT m.updated_at, u.name FROM meals m LEFT JOIN users u ON u.id = m.updated_by ORDER BY m.updated_at DESC LIMIT 1');
    return $r ? ['at' => $r['updated_at'], 'unit' => '', 'by' => (string)($r['name'] ?? '')] : null;
}

/** Hastane ortak listesini yöneten birim (ilk yükleyen; devredilene kadar yalnız o birim değiştirir): ['tkey', 'unit'] ya da null */
function ml_owner(): ?array
{
    if (!ml_hosp()) return null;
    $v = h_val("SELECT v FROM h_settings WHERE k = 'meal_owner'");
    $d = $v ? json_decode((string)$v, true) : null;
    return is_array($d) && !empty($d['tkey']) ? $d : null;
}
function ml_manage(array $me): bool { return user_perm($me, 'yemek') === 'manage'; }
/** Listeyi değiştirebilir mi: yemek yetkisi “Yönetir” + (çok birimlide) listeyi yöneten birimden ya da henüz sahibi yok */
function ml_can_edit(array $me): bool
{
    if (!ml_manage($me)) return false;
    $o = ml_owner();
    return !$o || $o['tkey'] === h_tkey();
}
function ml_claim(): void
{
    if (ml_hosp() && !ml_owner()) h_q('INSERT OR REPLACE INTO h_settings (k, v) VALUES (?, ?)', ['meal_owner', json_encode(['tkey' => h_tkey(), 'unit' => h_unit_name()], JSON_UNESCAPED_UNICODE)]);
}

/** meal.get: {from, to} ya da {ym} */
function a_meal_get(): void
{
    $me = need_user();
    $ym = s('ym', 7);
    if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) { $from = $ym . '-01'; $to = date('Y-m-t', strtotime($from)); }
    else {
        $from = s('from', 10); $to = s('to', 10);
        if (!ml_valid_date($from)) $from = date('Y-m-d', strtotime('-1 day'));
        if (!ml_valid_date($to) || $to < $from) $to = date('Y-m-d', strtotime($from . ' +2 days'));
        if ((strtotime($to) - strtotime($from)) / 86400 > 62) $to = date('Y-m-d', strtotime($from . ' +62 days'));
    }
    out(['days' => (object)ml_days($from, $to), 'from' => $from, 'to' => $to, 'times' => ml_times(), 'meals' => ML_MEALS, 'mode' => ml_mode(),
        'months' => ml_months(), 'last' => ml_last_update(), 'can_edit' => ml_can_edit($me), 'manage' => ml_manage($me), 'shared' => ml_hosp(),
        'owner' => ($o = ml_owner()) ? ['unit' => (string)($o['unit'] ?? ''), 'me' => $o['tkey'] === h_tkey()] : null,
        'hospital' => ml_hosp() ? (string)(nm_tenant()['hospital_name'] ?? '') : '']);
}

/* ---------------- Yazma ---------------- */

/** Kalemleri temizle: boşlukları sadeleştir, boşları at, sınırla */
function ml_clean_items($v): array
{
    if (is_string($v)) $v = preg_split('/\r\n|\r|\n/', $v);
    if (!is_array($v)) return [];
    $o = [];
    foreach ($v as $x) {
        if (!is_scalar($x)) continue;
        $x = trim(preg_replace('/\s+/u', ' ', str_replace("\0", '', (string)$x)));
        if ($x === '') continue;
        $o[] = mb_substr($x, 0, ML_MAX_LEN);
        if (count($o) >= ML_MAX_ITEMS) break;
    }
    return $o;
}

/** Bir günün öğünlerini yaz (boş öğün silinir) */
function ml_put(array $me, string $date, array $meals): int
{
    $n = 0;
    foreach (ML_MEALS as $k => $_) {
        if (!array_key_exists($k, $meals)) continue;
        $items = ml_clean_items($meals[$k]);
        ml_q('DELETE FROM {T} WHERE date = ? AND meal = ?', [$date, $k]);
        if (!$items) continue;
        $json = json_encode($items, JSON_UNESCAPED_UNICODE);
        if (ml_hosp()) h_q('INSERT INTO h_meals (date, meal, items, tkey, unit_name, updated_by_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [$date, $k, $json, h_tkey(), h_unit_name(), (string)$me['name'], now()]);
        else q('INSERT INTO meals (date, meal, items, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)', [$date, $k, $json, $me['id'], now()]);
        $n++;
    }
    return $n;
}

function ml_need_edit(): array
{
    $me = need_user();
    if (!ml_manage($me)) fail('Yemek listesini düzenleme yetkiniz yok.', 403);
    if (!ml_can_edit($me)) fail('Hastanenin yemek listesini “' . (ml_owner()['unit'] ?? '') . '” birimi yönetiyor; o birim listeyi devredene kadar yalnız görüntüleyebilirsiniz.', 403);
    ml_ensure();
    return $me;
}

function ml_tx(callable $fn)
{
    $pdo = ml_hosp() ? hdb() : db();
    $pdo->beginTransaction();
    try { $r = $fn(); $pdo->commit(); return $r; } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
}

/** meal.save: {days: {tarih: {kahvalti: [..], ogle: [..], aksam: [..]}}, replace_ym?: 'YYYY-MM' (o aydaki diğer günleri sil)} */
function a_meal_save(): void
{
    $me = ml_need_edit();
    $days = arr('days');
    if (!$days) fail('Kaydedilecek gün yok.');
    if (count($days) > 62) fail('Bir seferde en çok 62 gün kaydedilebilir.');
    $clean = [];
    foreach ($days as $d => $meals) {
        $d = (string)$d;
        if (!ml_valid_date($d)) fail('Geçersiz tarih: ' . mb_substr($d, 0, 20));
        if (!is_array($meals)) continue;
        $clean[$d] = $meals;
    }
    $ym = s('replace_ym', 7);
    if ($ym !== '' && !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) fail('Geçersiz ay.');
    [$n, $del] = ml_tx(function () use ($me, $clean, $ym) {
        ml_claim();
        $del = 0;
        if ($ym !== '') {
            $keep = array_keys($clean);
            foreach (ml_all('SELECT DISTINCT date FROM {T} WHERE date >= ? AND date <= ?', [$ym . '-01', $ym . '-31']) as $r) {
                if (in_array($r['date'], $keep, true)) continue;
                ml_q('DELETE FROM {T} WHERE date = ?', [$r['date']]); $del++;
            }
        }
        $n = 0;
        foreach ($clean as $d => $meals) $n += ml_put($me, $d, $meals);
        return [$n, $del];
    });
    $dates = array_keys($clean); sort($dates);
    audit($me, 'meal.save', count($dates) === 1 ? $dates[0] : $dates[0] . ' – ' . end($dates), $n . ' öğün' . ($del ? ', ' . $del . ' gün silindi' : ''));
    out(['saved' => $n, 'removed' => $del, 'months' => ml_months()]);
}

/** meal.delete: {ym} ayın tamamı ya da {date} tek gün */
function a_meal_delete(): void
{
    $me = ml_need_edit();
    $ym = s('ym', 7); $date = s('date', 10);
    if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym)) {
        $n = (int)ml_val('SELECT COUNT(DISTINCT date) FROM {T} WHERE date >= ? AND date <= ?', [$ym . '-01', $ym . '-31']);
        ml_q('DELETE FROM {T} WHERE date >= ? AND date <= ?', [$ym . '-01', $ym . '-31']);
        audit($me, 'meal.delete', $ym, $n . ' gün');
    } elseif (ml_valid_date($date)) {
        ml_q('DELETE FROM {T} WHERE date = ?', [$date]);
        audit($me, 'meal.delete', $date);
    } else fail('Silinecek ay ya da gün seçin.');
    out(['months' => ml_months()]);
}

/** meal.cfg: öğün saatleri (hastane ortak) ve birim varsayılanı (herkes / yalnız nöbetçiler) */
function a_meal_cfg(): void
{
    $me = need_user();
    if (!ml_manage($me)) fail('Yemek ayarlarını değiştirme yetkiniz yok.', 403);
    ml_ensure();
    $did = [];
    // Birim varsayılanı (her birimin kendi ayarı)
    $mode = s('mode', 10);
    if (in_array($mode, ML_MODES, true)) { set_setting('meal_mode', $mode); $did[] = $mode === 'shift' ? 'Yalnız nöbetçiler' : 'Herkes'; }
    // Listeyi devret (yalnız yöneten birim)
    if (b('release')) {
        if (!ml_hosp() || !ml_owner() || !ml_can_edit($me)) fail('Listeyi yalnız yöneten birim devredebilir.', 403);
        h_q("DELETE FROM h_settings WHERE k = 'meal_owner'");
        $did[] = 'Liste yönetimi bırakıldı';
    }
    // Öğün saatleri (hastane ortak: yalnız listeyi yöneten birim)
    $in = arr('times');
    if ($in) {
        if (!ml_can_edit($me)) fail('Öğün saatlerini listeyi yöneten “' . (ml_owner()['unit'] ?? '') . '” birimi değiştirir.', 403);
        $t = [];
        foreach (ML_TIMES as $k => $def) {
            $v = (string)($in[$k] ?? $def);
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) fail(ML_MEALS[$k] . ' saati SS:DD biçiminde olmalı.');
            $t[$k] = $v;
        }
        if (!($t['kahvalti'] < $t['ogle'] && $t['ogle'] < $t['aksam'])) fail('Saatler sırayla olmalı: kahvaltı < öğle < akşam.');
        $cfg = ml_cfg_raw(); $cfg['times'] = $t;
        $json = json_encode($cfg, JSON_UNESCAPED_UNICODE);
        if (ml_hosp()) { ml_claim(); h_q('INSERT OR REPLACE INTO h_settings (k, v) VALUES (?, ?)', ['meal_cfg', $json]); }
        else set_setting('meal_cfg', $json);
        $did[] = implode(' · ', $t);
    }
    setting('', '', true);
    if ($did) audit($me, 'meal.cfg', implode(' · ', $did));
    out(['times' => ml_times(), 'mode' => ml_mode(), 'owner' => ($o = ml_owner()) ? ['unit' => (string)($o['unit'] ?? ''), 'me' => $o['tkey'] === h_tkey()] : null]);
}

/* ---------------- Açılış verisi ---------------- */

$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (!function_exists('nm_mod_on') || !nm_mod_on('yemek') || user_perm($me, 'yemek') === 'off') return [];
    ml_ensure();
    $any = (int)ml_val('SELECT COUNT(*) FROM {T} WHERE date >= ? AND date <= ?', [date('Y-m-d', strtotime('-1 day')), date('Y-m-d', strtotime('+1 day'))]) > 0;
    return ['meal' => ['times' => ml_times(), 'mode' => ml_mode(), 'any' => $any]];
};

return [
    'meal.get' => 'a_meal_get',
    'meal.save' => 'a_meal_save',
    'meal.delete' => 'a_meal_delete',
    'meal.cfg' => 'a_meal_cfg',
];
