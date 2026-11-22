<?php
/**
 * Resmi liste (4.34): çizelgenin kurumun kalite formunda çıktısı + yayından sonraki değişikliklerin kaydı.
 *  - Güncel hâl = yayınlanmış liste + kabul edilmiş değişim / devir / eksik çağrısı (swap_pending_overlay) + yöneticinin düzeltmeleri.
 *    Çizelge açılınca bu hâl taslağa işlenir (plan.get → pc_sync_draft); saatler her zaman güncel hâlden hesaplanır (istemci).
 *  - Değişiklikler (plan_changes): değişim / devir / çağrı kendiliğinden, elle düzeltmeler yayınlanırken (plan.mark) kaydedilir.
 *    Kayıt silinebilir (deleted = 1; kaynak yeniden okunduğunda geri gelmez). Çıktıda iz yoktur.
 *  - Şablon (birim ayarı plan_tpl + plan_tpl_logo): logo, başlık satırları, doküman kutusu, sütunlar, imzalar, kodların yazımı ve saat etkisi.
 *    Çok birimlide hastanenin diğer birimleriyle paylaşılabilir (h_settings 'ptpl.<birim>').
 *  - İmzalı belge: taranmış hâl listeye eklenir (attachments.roster_id → ekip görür; ayar plan_signed_<liste>_<ay>).
 */
declare(strict_types=1);

const PC_KINDS = ['swap' => 'Değişim', 'give' => 'Devir', 'part' => 'Parçalı devir', 'callout' => 'Eksik çağrısı', 'edit' => 'Düzeltme', 'leave' => 'İzin', 'report' => 'Rapor', 'remove' => 'Silindi'];

function pc_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (setting('pc_schema', '') === '1') return;
    $my = DB_DRIVER === 'mysql';
    $pk = $my ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $end = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    db()->exec("CREATE TABLE IF NOT EXISTS plan_changes (id $pk, roster_id INT NOT NULL, ym VARCHAR(7) NOT NULL, date VARCHAR(10) NOT NULL, kind VARCHAR(10) NOT NULL,
        names VARCHAR(250) NOT NULL DEFAULT '', old_code VARCHAR(20) NOT NULL DEFAULT '', new_code VARCHAR(20) NOT NULL DEFAULT '', text VARCHAR(400) NOT NULL DEFAULT '',
        by_name VARCHAR(120) NOT NULL DEFAULT '', at VARCHAR(19) NOT NULL, ref VARCHAR(120) NOT NULL, marks TEXT NULL, deleted INT NOT NULL DEFAULT 0)$end");
    set_setting('pc_schema', '1');
}

function pc_month(string $ym): array { return [$ym . '-01', date('Y-m-t', strtotime($ym . '-01'))]; }
function pc_dt(string $d): string { return function_exists('swap_fmt_date') ? swap_fmt_date($d) : $d; }

/** Yayınlanmış hâl ve güncel hâl: [dosya, güncel] (anahtar swap_key(ad)) */
function pc_states(int $rid, string $ym): array
{
    [$a, $b] = pc_month($ym);
    $file = swap_timeline($rid, $a, $b);
    $eff = swap_pending_overlay($file, $a, $b, $rid);
    return [$file, $eff];
}
function pc_code(array $tl, string $k, string $d): string { return isset($tl[$k]['days'][$d]) ? (string)($tl[$k]['days'][$d]['code'] ?? '') : ''; }

function pc_add(int $rid, string $ym, string $date, string $kind, string $names, string $old, string $new, string $text, string $by, string $at, string $ref, array $marks): void
{
    if (val('SELECT id FROM plan_changes WHERE ref = ?', [$ref])) return;
    q('INSERT INTO plan_changes (roster_id, ym, date, kind, names, old_code, new_code, text, by_name, at, ref, marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$rid, $ym, $date, $kind, mb_substr($names, 0, 250), mb_substr($old, 0, 20), mb_substr($new, 0, 20), mb_substr($text, 0, 400), mb_substr($by, 0, 120), $at, mb_substr($ref, 0, 120), json_encode($marks, JSON_UNESCAPED_UNICODE)]);
}

/** Değişim / devir / eksik çağrısı kayıtlarını değişiklik raporuna al (bir kez; silinen geri gelmez) */
function pc_sync(int $rid, string $ym): void
{
    pc_ensure();
    [$a, $b] = pc_month($ym);
    foreach (all("SELECT * FROM swap_requests WHERE roster_id = ? AND status IN ('accepted', 'applied') AND ((from_date >= ? AND from_date <= ?) OR (to_date >= ? AND to_date <= ?))", [$rid, $a, $b, $a, $b]) as $r) {
        $part = function_exists('swap_part') ? swap_part($r['part'] ?? null) : '';
        $at = (string)($r['decided_at'] ?: $r['created_at']);
        if ($r['kind'] === 'swap' && $r['to_date']) {
            pc_add($rid, $ym, (string)$r['from_date'], 'swap', $r['from_name'] . ' ↔ ' . $r['to_name'], (string)$r['from_code'], (string)$r['to_code'],
                $r['from_name'] . ' ' . pc_dt((string)$r['from_date']) . ' (' . $r['from_code'] . ') nöbetini ' . $r['to_name'] . ' ile ' . pc_dt((string)$r['to_date']) . ' (' . $r['to_code'] . ') nöbetiyle değişti',
                (string)$r['to_name'], $at, 'sw:' . $r['id'], [[$r['from_name'], $r['from_date']], [$r['to_name'], $r['from_date']], [$r['from_name'], $r['to_date']], [$r['to_name'], $r['to_date']]]);
        } else {
            pc_add($rid, $ym, (string)$r['from_date'], $part !== '' ? 'part' : 'give', $r['from_name'] . ' → ' . $r['to_name'], (string)$r['from_code'], '',
                $r['from_name'] . ' ' . pc_dt((string)$r['from_date']) . ' (' . $r['from_code'] . ') nöbetini ' . ($part !== '' ? '(' . swap_part_text($part) . ') ' : '') . $r['to_name'] . '’e devretti',
                (string)$r['to_name'], $at, 'sw:' . $r['id'], [[$r['from_name'], $r['from_date']], [$r['to_name'], $r['from_date']]]);
        }
    }
    // Eksik personel çağrısıyla yazılanlar (yalnız bu listenin kişileri)
    $keys = null;
    foreach (all("SELECT c.id, c.date, c.code, c.roster_id, r.name, r.move_from, r.answered_at, c.created_at FROM callouts c JOIN callout_resp r ON r.callout_id = c.id WHERE r.chosen = 1 AND c.status IN ('open', 'filled') AND c.date >= ? AND c.date <= ?", [$a, $b]) as $c) {
        if ($c['roster_id'] !== null && (int)$c['roster_id'] !== $rid) continue;
        if ($c['roster_id'] === null) {
            $keys ??= array_flip(array_keys(pc_states($rid, $ym)[1]));
            if (!isset($keys[swap_key((string)$c['name'])])) continue;
        }
        $marks = [[$c['name'], $c['date']]];
        if ($c['move_from']) $marks[] = [$c['name'], $c['move_from']];
        pc_add($rid, $ym, (string)$c['date'], 'callout', (string)$c['name'], '', (string)$c['code'],
            $c['name'] . ' eksik personel çağrısıyla ' . pc_dt((string)$c['date']) . ' (' . $c['code'] . ') nöbetine yazıldı' . ($c['move_from'] ? ' (' . pc_dt((string)$c['move_from']) . ' nöbeti kaydırıldı)' : ''),
            '', (string)($c['answered_at'] ?: $c['created_at']), 'co:' . $c['id'] . ':' . swap_key((string)$c['name']), $marks);
    }
}

/** Taslağa güncel hâli işle: yayından sonra kabul edilen değişim / devir / çağrılar (taslak hücre yayınlanmış hâlle aynıysa) */
function pc_sync_draft(int $rid, string $ym, array $data): array
{
    [$file, $eff] = pc_states($rid, $ym);
    $byKey = [];
    foreach ($data['people'] as $i => $p) $byKey[swap_key((string)$p['name'])] = $i;
    $cells = array_map(fn($x) => (array)$x, (array)($data['cells'] ?? []));
    $n = 0;
    foreach ($eff + $file as $k => $p) {
        $days = array_unique(array_merge(array_keys($eff[$k]['days'] ?? []), array_keys($file[$k]['days'] ?? [])));
        foreach ($days as $d) {
            $e = pc_code($eff, $k, $d); $f = pc_code($file, $k, $d);
            if ($e === $f) continue;
            if (!isset($byKey[$k])) {
                $nm = null;
                foreach ($data['people'] as $i => $q) if (names_match((string)$q['name'], (string)$p['name'])) { $nm = $i; break; }
                if ($nm === null) { $data['people'][] = ['name' => (string)$p['name'], 'title' => (string)($p['title'] ?? '')]; $nm = count($data['people']) - 1; }
                $byKey[$k] = $nm;
            }
            $name = (string)$data['people'][$byKey[$k]]['name'];
            $cur = (string)($cells[$name][$d] ?? '');
            if ($cur !== $f) continue; // yönetici zaten değiştirmiş
            if ($e === '') unset($cells[$name][$d]); else $cells[$name][$d] = $e;
            $n++;
        }
    }
    $data['cells'] = $cells;
    return [$data, $n];
}

/** Çizelge işaretleri: [ad => [tarih => metin]] */
function pc_marks(int $rid, string $ym): array
{
    pc_ensure();
    $o = [];
    foreach (all('SELECT kind, text, marks FROM plan_changes WHERE roster_id = ? AND ym = ? AND deleted = 0 ORDER BY id', [$rid, $ym]) as $r) {
        foreach ((array)json_decode((string)$r['marks'], true) as $m) {
            if (!is_array($m) || count($m) < 2 || !$m[1] || substr((string)$m[1], 0, 7) !== $ym) continue;
            $o[(string)$m[0]][(string)$m[1]] = (PC_KINDS[$r['kind']] ?? $r['kind']) . ': ' . $r['text'];
        }
    }
    return $o;
}

function a_plan_changes(): void
{
    need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    pc_sync((int)$r['id'], $ym);
    out(['changes' => array_map(fn($x) => ['id' => (int)$x['id'], 'date' => $x['date'], 'kind' => $x['kind'], 'kind_txt' => PC_KINDS[$x['kind']] ?? $x['kind'], 'names' => $x['names'],
        'old' => $x['old_code'], 'new' => $x['new_code'], 'text' => $x['text'], 'by' => $x['by_name'], 'at' => $x['at']],
        all('SELECT * FROM plan_changes WHERE roster_id = ? AND ym = ? AND deleted = 0 ORDER BY date, id', [$r['id'], $ym]))]);
}

function a_plan_changes_delete(): void
{
    $me = need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    pc_ensure();
    $ids = array_values(array_filter(array_map('intval', (array)($GLOBALS['IN']['ids'] ?? [])), fn($x) => $x > 0));
    if (!$ids && !b('all')) fail('Silinecek kaydı seçin.');
    if (b('all')) q('UPDATE plan_changes SET deleted = 1 WHERE roster_id = ? AND ym = ?', [$r['id'], $ym]);
    else q('UPDATE plan_changes SET deleted = 1 WHERE roster_id = ? AND ym = ? AND id IN (' . implode(',', array_slice($ids, 0, 500)) . ')', [$r['id'], $ym]);
    audit($me, 'plan.changes.delete', $r['name'], plan_month_txt($ym) . ' · ' . (b('all') ? 'tümü' : count($ids) . ' kayıt'));
    $GLOBALS['IN']['ids'] = [];
    a_plan_changes();
}
function plan_month_txt(string $ym): string
{
    $m = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return $m[(int)substr($ym, 5, 2) - 1] . ' ' . substr($ym, 0, 4);
}

/**
 * Yayınlamadan önce: daha önce yayınlanmış ayda güncel hâl ile yeni taslak arasındaki farkları "düzeltme" olarak kaydet
 * (izin / rapor / silinen / değişen nöbet). İlk yayında kayıt yapılmaz.
 */
function a_plan_mark(): void
{
    $me = need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    pc_ensure();
    $data = plan_clean(arr('draft'), $ym);
    [, $eff] = pc_states((int)$r['id'], $ym);
    $n = 0;
    if ($eff) {
        pc_sync((int)$r['id'], $ym);
        $dict = plan_dict();
        $seen = [];
        $now = now();
        $stamp = date('YmdHis');
        foreach ($data['people'] as $p) {
            $name = (string)$p['name'];
            $k = swap_key($name);
            $seen[$k] = 1;
            $row = (array)(((array)$data['cells'])[$name] ?? []);
            foreach (plan_days($ym) as $d) {
                $new = (string)($row[$d] ?? ''); $old = pc_code($eff, $k, $d);
                if ($new === $old) continue;
                $nr = $new !== '' ? plan_row($new, $dict) : null;
                $kind = $new === '' ? 'remove' : ($nr['kind'] !== 'shift' ? (preg_match('/rapor/iu', (string)$nr['label']) ? 'report' : 'leave') : 'edit');
                $txt = $name . ' ' . pc_dt($d) . ': ' . ($old !== '' ? $old : 'boş') . ' → ' . ($new !== '' ? $new . ($nr && $nr['label'] !== $new ? ' (' . $nr['label'] . ')' : '') : 'boş');
                pc_add((int)$r['id'], $ym, $d, $kind, $name, $old, $new, $txt, (string)$me['name'], $now, 'ed:' . $stamp . ':' . $k . ':' . $d, [[$name, $d]]);
                $n++;
            }
        }
        // Çizelgeden çıkarılan kişinin nöbetleri
        foreach ($eff as $k => $p) {
            if (isset($seen[$k])) continue;
            foreach ($p['days'] as $d => $row) {
                if (substr((string)$d, 0, 7) !== $ym) continue;
                pc_add((int)$r['id'], $ym, (string)$d, 'remove', (string)$p['name'], (string)($row['code'] ?? ''), '', $p['name'] . ' ' . pc_dt((string)$d) . ': ' . ($row['code'] ?? '') . ' → boş (çizelgeden çıkarıldı)',
                    (string)$me['name'], $now, 'ed:' . $stamp . ':' . $k . ':' . $d, [[(string)$p['name'], (string)$d]]);
                $n++;
            }
        }
    }
    out(['marked' => $n]);
}

/* ---------------- Şablon ---------------- */
function plan_tpl_default(): array
{
    return [
        'lines' => ['T.C. Sağlık Bakanlığı', '{HASTANE}', '{BİRİM} {YIL} {AY} ÇALIŞMA LİSTESİ'],
        'doc' => [['l' => 'Doküman No', 'v' => ''], ['l' => 'Yayın Tarihi', 'v' => ''], ['l' => 'Revizyon No', 'v' => ''], ['l' => 'Revizyon Tarihi', 'v' => '']],
        'doc_labels' => true,
        'cols' => ['sira' => true, 'unvan' => true, 'req' => true, 'work' => true, 'over' => true],
        'sig' => [['t' => 'Birim Sorumlusu', 'n' => ''], ['t' => 'Sağlık Bakım Hizmetleri Müdürü', 'n' => '']],
        'shade' => true, 'day_hours' => 8, 'half_hours' => 4,
        'codes' => (object)[], // kod => {p: çıktıda yazım, c: 'deduct'|'none'|'work'}
    ];
}
function plan_tpl_clean(array $t): array
{
    $d = plan_tpl_default();
    $str = fn($v, $n) => mb_substr(trim((string)$v), 0, $n);
    $o = $d;
    $o['lines'] = array_slice(array_map(fn($v) => $str($v, 140), array_values((array)($t['lines'] ?? $d['lines']))), 0, 5);
    $o['doc'] = [];
    foreach (array_slice((array)($t['doc'] ?? []), 0, 8) as $x) if (is_array($x)) $o['doc'][] = ['l' => $str($x['l'] ?? '', 40), 'v' => $str($x['v'] ?? '', 60)];
    $o['doc_labels'] = !empty($t['doc_labels']);
    foreach (array_keys($d['cols']) as $c) $o['cols'][$c] = !empty(($t['cols'] ?? [])[$c]);
    $o['sig'] = [];
    foreach (array_slice((array)($t['sig'] ?? []), 0, 4) as $x) if (is_array($x)) $o['sig'][] = ['t' => $str($x['t'] ?? '', 80), 'n' => $str($x['n'] ?? '', 80)];
    $o['shade'] = !empty($t['shade']);
    $o['day_hours'] = max(1, min(12, (float)($t['day_hours'] ?? 8)));
    $o['half_hours'] = max(0, min(12, (float)($t['half_hours'] ?? 4)));
    $codes = [];
    foreach (array_slice((array)($t['codes'] ?? []), 0, 120, true) as $k => $x) {
        if (!is_array($x)) continue;
        $c = in_array($x['c'] ?? '', ['deduct', 'none', 'work'], true) ? $x['c'] : '';
        $codes[$str($k, 20)] = ['p' => $str($x['p'] ?? '', 14), 'c' => $c];
    }
    $o['codes'] = (object)$codes;
    return $o;
}
function plan_tpl(): array
{
    $j = json_decode((string)setting('plan_tpl', ''), true);
    return is_array($j) ? plan_tpl_clean($j) : plan_tpl_default();
}
function plan_tpl_names(): array
{
    $t = function_exists('nm_multi') && nm_multi() ? nm_tenant() : null;
    return ['org' => $t ? (string)($t['hospital_name'] ?? '') : (string)setting('org_name', ''), 'unit' => $t ? (string)$t['name'] : (string)setting('org_name', '')];
}

function a_plan_tpl_get(): void
{
    need_publisher();
    $shared = [];
    if (function_exists('nm_multi') && nm_multi() && function_exists('hdb') && hdb()) {
        $me = (string)nm_tenant()['tkey'];
        foreach (h_all("SELECT k, v FROM h_settings WHERE k LIKE 'ptpl.%'") as $r) {
            if ($r['k'] === 'ptpl.' . $me) continue;
            $j = json_decode((string)$r['v'], true);
            if (is_array($j)) $shared[] = ['key' => substr((string)$r['k'], 5), 'unit' => (string)($j['unit'] ?? ''), 'at' => (string)($j['at'] ?? '')];
        }
    }
    out(['tpl' => plan_tpl(), 'logo' => (string)setting('plan_tpl_logo', ''), 'names' => plan_tpl_names(), 'shared' => $shared,
        'can_share' => function_exists('nm_multi') && nm_multi() && function_exists('hdb') && (bool)hdb()]);
}

function a_plan_tpl_save(): void
{
    $me = need_publisher();
    $t = plan_tpl_clean(arr('tpl'));
    set_setting('plan_tpl', json_encode($t, JSON_UNESCAPED_UNICODE));
    if (array_key_exists('logo', $GLOBALS['IN'])) {
        $logo = (string)$GLOBALS['IN']['logo'];
        if ($logo !== '' && (!preg_match('#^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$#', $logo) || strlen($logo) > 60000)) fail('Logo PNG ya da JPG olmalı ve küçük olmalı (en çok ~45 KB).');
        set_setting('plan_tpl_logo', $logo);
    }
    if (b('share') && function_exists('nm_multi') && nm_multi() && function_exists('hdb') && hdb()) {
        h_q('INSERT OR REPLACE INTO h_settings (k, v) VALUES (?, ?)', ['ptpl.' . nm_tenant()['tkey'], json_encode(['unit' => nm_tenant()['name'], 'at' => now(), 'tpl' => $t, 'logo' => (string)setting('plan_tpl_logo', '')], JSON_UNESCAPED_UNICODE)]);
    }
    audit($me, 'settings.save', 'Resmi liste şablonu', b('share') ? 'hastanedeki birimlerle paylaşıldı' : '');
    a_plan_tpl_get();
}

/** Hastanedeki başka birimin paylaştığı şablonu kopyala */
function a_plan_tpl_copy(): void
{
    $me = need_publisher();
    if (!(function_exists('nm_multi') && nm_multi() && function_exists('hdb') && hdb())) fail('Bu kurulumda paylaşılan şablon yok.', 404);
    $k = preg_replace('/[^a-z0-9]/', '', s('key', 16));
    $r = h_one('SELECT v FROM h_settings WHERE k = ?', ['ptpl.' . $k]) ?? fail('Şablon bulunamadı.', 404);
    $j = json_decode((string)$r['v'], true) ?: [];
    set_setting('plan_tpl', json_encode(plan_tpl_clean((array)($j['tpl'] ?? [])), JSON_UNESCAPED_UNICODE));
    $logo = (string)($j['logo'] ?? '');
    if ($logo === '' || (preg_match('#^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$#', $logo) && strlen($logo) <= 60000)) set_setting('plan_tpl_logo', $logo);
    audit($me, 'settings.save', 'Resmi liste şablonu', ($j['unit'] ?? '') . ' biriminden kopyalandı');
    a_plan_tpl_get();
}

/* ---------------- İmzalı belge ---------------- */
function plan_signed_get(int $rid, string $ym): ?array
{
    $j = json_decode((string)setting('plan_signed_' . $rid . '_' . $ym, ''), true);
    if (!is_array($j) || empty($j['id'])) return null;
    $a = one('SELECT id, orig_name, mime FROM attachments WHERE id = ?', [(int)$j['id']]);
    return $a ? ['id' => (int)$a['id'], 'name' => (string)$a['orig_name'], 'mime' => (string)$a['mime'], 'url' => 'api.php?action=file&id=' . (int)$a['id'], 'at' => (string)($j['at'] ?? ''), 'by' => (string)($j['by'] ?? ''), 'ym' => $ym] : null;
}
function a_plan_signed(): void
{
    $me = need_publisher();
    $r = plan_roster((int)i('roster_id'));
    $ym = plan_ym();
    $k = 'plan_signed_' . $r['id'] . '_' . $ym;
    if (b('remove')) {
        set_setting($k, '');
        audit($me, 'plan.signed', $r['name'], plan_month_txt($ym) . ' · kaldırıldı');
        out(['signed' => null]);
    }
    $a = one('SELECT * FROM attachments WHERE id = ? AND user_id = ? AND post_id IS NULL', [(int)i('attachment_id'), $me['id']]) ?? fail('Dosya bulunamadı.', 404);
    if (!in_array((string)$a['mime'], ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], true)) fail('İmzalı belge PDF ya da fotoğraf (JPG / PNG) olmalı.');
    q('UPDATE attachments SET roster_id = ? WHERE id = ?', [$r['id'], $a['id']]); // ekip görebilsin (nöbet listesi dosyası yetkisi)
    set_setting($k, json_encode(['id' => (int)$a['id'], 'at' => now(), 'by' => $me['name']], JSON_UNESCAPED_UNICODE));
    audit($me, 'plan.signed', $r['name'], plan_month_txt($ym));
    out(['signed' => plan_signed_get((int)$r['id'], $ym)]);
}

return [
    'plan.changes' => 'a_plan_changes',
    'plan.changes.delete' => 'a_plan_changes_delete',
    'plan.mark' => 'a_plan_mark',
    'plan.tpl.get' => 'a_plan_tpl_get',
    'plan.tpl.save' => 'a_plan_tpl_save',
    'plan.tpl.copy' => 'a_plan_tpl_copy',
    'plan.signed' => 'a_plan_signed',
];
