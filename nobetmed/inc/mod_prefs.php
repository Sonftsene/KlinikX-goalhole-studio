<?php
/**
 * dupcii — kişisel tercihler modülü
 *  - Görünüm tercihleri (tema, renk paleti, ana sayfa düzeni) cihazlar arası eşitlenir
 *  - Kişisel fazla mesai ücretleri (yalnız kişinin kendisine görünür)
 *  - Kişisel nöbet hatırlatma saatleri
 *  - Resmî tatil / bayram listesi açılış verisinde (takvim işaretleri ve ücret hesabı için)
 */
declare(strict_types=1);

const PREFS_ACCENTS = ['varsayilan', 'okyanus', 'lavanta', 'gul', 'gunes', 'orman', 'grafit', 'gece'];

function prefs_json(?string $raw): array
{
    if (!$raw) return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

/** Görünüm tercihlerini doğrula (bilinmeyen alanlar atılır) */
function prefs_clean_ui(array $in): array
{
    $o = [];
    if (in_array($in['theme'] ?? '', ['light', 'dark', 'auto'], true)) $o['theme'] = $in['theme'];
    if (in_array($in['accent'] ?? '', PREFS_ACCENTS, true)) $o['accent'] = $in['accent'];
    if (array_key_exists('fs', $in) && in_array($in['fs'], ['', 'lg'], true)) $o['fs'] = $in['fs'];
    if (in_array($in['shape'] ?? '', ['round', 'sharp'], true)) $o['shape'] = $in['shape'];
    if (in_array($in['density'] ?? '', ['cozy', 'compact'], true)) $o['density'] = $in['density'];
    if (isset($in['oled'])) $o['oled'] = (bool)$in['oled'];
    if (array_key_exists('meal', $in) && in_array($in['meal'], ['', 'all', 'shift', 'off'], true)) $o['meal'] = $in['meal'];
    if (isset($in['home']) && is_array($in['home'])) {
        $ids = fn($a) => array_values(array_unique(array_filter(array_map(fn($x) => preg_replace('/[^a-z0-9_-]/', '', strtolower((string)$x)), is_array($a) ? $a : []), fn($x) => $x !== '')));
        $o['home'] = ['hidden' => array_slice($ids($in['home']['hidden'] ?? []), 0, 40), 'shown' => array_slice($ids($in['home']['shown'] ?? []), 0, 40), 'order' => array_slice($ids($in['home']['order'] ?? []), 0, 40), 'side_first' => !empty($in['home']['side_first'])];
    }
    return $o;
}

/** Ücret tercihleri: saatlik tutarlar (TL), 0 = girilmedi */
function prefs_clean_pay(array $in): array
{
    $num = fn($v) => round(max(0, min(100000, (float)str_replace(',', '.', (string)$v))), 2);
    $o = ['normal' => $num($in['normal'] ?? 0), 'resmi' => $num($in['resmi'] ?? 0), 'bayram' => $num($in['bayram'] ?? 0), 'extras' => []];
    foreach (array_slice(is_array($in['extras'] ?? null) ? $in['extras'] : [], 0, 8) as $x) {
        if (!is_array($x)) continue;
        $name = mb_substr(trim((string)($x['name'] ?? '')), 0, 40);
        $rate = $num($x['rate'] ?? 0);
        $hours = round(max(0, min(744, (float)str_replace(',', '.', (string)($x['hours'] ?? 0)))), 1);
        if ($name !== '' && $rate > 0) $o['extras'][] = ['name' => $name, 'rate' => $rate, 'hours' => $hours];
    }
    if (isset($in['tax'])) $o['tax'] = round(max(0, min(60, (float)$in['tax'])), 1);
    return $o;
}

/** Hatırlatma tercihleri */
function prefs_clean_remind(array $in, array $old = []): array
{
    $o = [
        'day' => ['on' => (bool)($in['day']['on'] ?? true), 'hour' => max(0, min(23, (int)($in['day']['hour'] ?? 20)))],
        'pre' => ['on' => (bool)($in['pre']['on'] ?? false), 'hours' => max(1, min(12, (int)($in['pre']['hours'] ?? 2)))],
    ];
    // gönderim kayıtları korunur (aynı gün iki kez gönderilmesin)
    foreach (['_d', '_p'] as $k) if (isset($old[$k])) $o[$k] = $old[$k];
    return $o;
}

function prefs_out(array $u): array
{
    $r = prefs_json($u['remind_prefs'] ?? null);
    unset($r['_d'], $r['_p']);
    return [
        'ui' => (object)prefs_json($u['ui_prefs'] ?? null),
        'pay' => (object)prefs_json($u['pay_rates'] ?? null),
        'remind' => $r ? $r : null,
    ];
}

function prefs_holidays(): array
{
    $from = (date('Y') - 1) . '-01-01';
    $to = (date('Y') + 1) . '-12-31';
    $out = [];
    foreach (all('SELECT date, name, half FROM holidays WHERE date >= ? AND date <= ? ORDER BY date', [$from, $to]) as $h) {
        $out[] = ['date' => $h['date'], 'name' => $h['name'], 'half' => (int)$h['half'] === 1,
            'kind' => preg_match('/ramazan|kurban/iu', (string)$h['name']) ? 'bayram' : 'resmi'];
    }
    return $out;
}

$GLOBALS['NM_BOOT'][] = function (array $me): array {
    $u = one('SELECT ui_prefs, pay_rates, remind_prefs FROM users WHERE id = ?', [(int)$me['id']]) ?: [];
    return ['my_prefs' => prefs_out($u), 'holidays' => prefs_holidays(),
        'remind_default_hour' => (int)setting('shift_remind_hour', '18'), 'remind_default_on' => setting('shift_remind_on', '1') === '1'];
};

function a_me_prefs_save(): void
{
    $me = need_user();
    $kind = s('kind', 10);
    $val = arr('value');
    $u = one('SELECT ui_prefs, pay_rates, remind_prefs FROM users WHERE id = ?', [(int)$me['id']]) ?: [];
    if ($kind === 'ui') {
        $merged = prefs_clean_ui(array_merge(prefs_json($u['ui_prefs'] ?? null), $val));
        q('UPDATE users SET ui_prefs = ? WHERE id = ?', [json_encode($merged, JSON_UNESCAPED_UNICODE), $me['id']]);
    } elseif ($kind === 'pay') {
        q('UPDATE users SET pay_rates = ? WHERE id = ?', [json_encode(prefs_clean_pay($val), JSON_UNESCAPED_UNICODE), $me['id']]);
    } elseif ($kind === 'remind') {
        if (!empty($val['reset'])) q('UPDATE users SET remind_prefs = NULL WHERE id = ?', [$me['id']]);
        else {
            $old = prefs_json($u['remind_prefs'] ?? null);
            // Genel hatırlatma bugün zaten gönderildiyse kişisel "bir gün önce" bugün tekrar gönderilmesin
            if (!isset($old['_d']) && setting('shift_remind_last') === date('Y-m-d')) $old['_d'] = date('Y-m-d');
            q('UPDATE users SET remind_prefs = ? WHERE id = ?', [json_encode(prefs_clean_remind($val, $old)), $me['id']]);
        }
    } else {
        fail('Geçersiz tercih.');
    }
    $u = one('SELECT ui_prefs, pay_rates, remind_prefs FROM users WHERE id = ?', [(int)$me['id']]) ?: [];
    out(['prefs' => prefs_out($u)]);
}

/* ------------------------------------------------------------------ */
/* Kişisel hatırlatmalar                                               */
/* ------------------------------------------------------------------ */

/** Kişi kendi hatırlatma ayarını yaptıysa genel "yarın nöbetin var" hatırlatması ona gitmez */
function remind_skip_default(int $uid): bool
{
    static $map = null;
    if ($map === null) {
        $map = [];
        foreach (all("SELECT id FROM users WHERE remind_prefs IS NOT NULL AND remind_prefs <> ''") as $r) $map[(int)$r['id']] = true;
    }
    return isset($map[$uid]);
}

function remind_shift_text(array $s): string
{
    return $s['code'] . ($s['label'] ? ' · ' . $s['label'] : '') . ($s['start_time'] ? ' · ' . $s['start_time'] . '–' . $s['end_time'] : '');
}

/** Her 5 dakikada: kişisel saatinde "yarın nöbetin var" ve nöbetten X saat önce hatırlatma */
function job_remind_personal(bool $force = false): ?int
{
    $users = all("SELECT id, name, email, email_notify, notify_mode, push_on, role, unit_id, remind_prefs FROM users WHERE status = 'active' AND remind_prefs IS NOT NULL AND remind_prefs <> ''");
    if (!$users) return null;
    $now = time();
    $today = date('Y-m-d', $now);
    $tomorrow = date('Y-m-d', $now + 86400);
    $hour = (int)date('G', $now);
    $rows = all("SELECT s.*, r.name AS roster_name FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.date IN (?, ?) AND s.kind IN ('shift', 'role')", [$today, $tomorrow]);
    if (!$rows) return null;
    $sent = 0;
    foreach ($users as $u) {
        $p = prefs_json($u['remind_prefs']);
        $mine = array_values(array_filter($rows, fn($r) => names_match((string)$r['name'], (string)$u['name'])));
        if (!$mine) continue;
        $dirty = false;
        // 1) Bir gün önce, seçilen saatte
        if (!empty($p['day']['on']) && $hour >= (int)($p['day']['hour'] ?? 20) && ($p['_d'] ?? '') !== $today) {
            $tm = array_values(array_filter($mine, fn($r) => $r['date'] === $tomorrow));
            $p['_d'] = $today; $dirty = true;
            if ($tm) {
                $s = $tm[0];
                notify_users([$u], 'shift', 'Yarın nöbetiniz var', remind_shift_text($s) . ' (' . $s['roster_name'] . ')', '#/nobetim', [
                    'subject' => 'Hatırlatma: yarın nöbetiniz var (' . $s['code'] . ')',
                    'heading' => 'Yarın nöbetiniz var',
                    'lines' => [date('d.m.Y', strtotime($tomorrow)) . ': ' . remind_shift_text($s), 'Liste: ' . $s['roster_name']],
                    'button' => 'Nöbetlerimi gör',
                ], 'notoff');
                $sent++;
            }
        }
        // 2) Nöbet başlamadan X saat önce
        if (!empty($p['pre']['on'])) {
            $lead = max(1, min(12, (int)($p['pre']['hours'] ?? 2))) * 3600;
            usort($mine, fn($a, $b) => strcmp($a['date'] . ' ' . $a['start_time'], $b['date'] . ' ' . $b['start_time']));
            foreach ($mine as $s) {
                if (!$s['start_time']) continue;
                $start = strtotime($s['date'] . ' ' . $s['start_time']);
                if ($start === false || $start <= $now || $start - $now > $lead) continue;
                $key = $s['date'] . ' ' . $s['start_time'];
                if (strcmp($key, (string)($p['_p'] ?? '')) <= 0) continue; // bu ya da daha önceki nöbet için gönderildi (sırayla, bir kez)
                $p['_p'] = $key; $dirty = true;
                $mins = (int)round(($start - $now) / 60);
                $left = $mins >= 60 ? intdiv($mins, 60) . ' saat' . ($mins % 60 ? ' ' . ($mins % 60) . ' dk' : '') : $mins . ' dk';
                notify_users([$u], 'shift', 'Nöbetiniz ' . $left . ' sonra başlıyor', remind_shift_text($s) . ' (' . $s['roster_name'] . ')', '#/nobetim', null, 'notoff');
                $sent++;
                break;
            }
        }
        if ($dirty) {
            // Görev çalışırken kişi ayarını değiştirmiş olabilir: yalnız gönderim kayıtlarını güncelle
            $cur = prefs_json((string)val('SELECT remind_prefs FROM users WHERE id = ?', [$u['id']]));
            if ($cur) { $cur['_d'] = $p['_d'] ?? ($cur['_d'] ?? null); $cur['_p'] = $p['_p'] ?? ($cur['_p'] ?? null); q('UPDATE users SET remind_prefs = ? WHERE id = ?', [json_encode($cur), $u['id']]); }
        }
    }
    return $sent ?: null;
}
$GLOBALS['NM_JOBS']['remind_personal'] = 'job_remind_personal';

return [
    'me.prefs.save' => 'a_me_prefs_save',
];
