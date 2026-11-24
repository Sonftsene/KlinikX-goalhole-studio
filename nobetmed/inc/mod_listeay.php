<?php
/**
 * dupcii — Nöbet listesinde aylar (4.48.0)
 *
 * Bir liste (ör. “Hemşire Nöbet Listesi”) birden çok ayı tutar: her ayın kendi Excel dosyası (ve sürümleri) ve kendi nöbet kayıtları vardır.
 *  - roster_files.ym: dosyanın ait olduğu ay; roster_files.parsed: dosyadaki nöbetler okundu mu
 *  - rosters.period: listenin GÜNCEL (öne çıkan) ayı; liste açılınca bu ay görünür. Diğer aylar “sıradaki” ve “geçmiş aylar”.
 *  - Nöbet kayıtları (roster_shifts) tarihe göre aylara ayrılır; bir ayı yüklemek / düzeltmek yalnızca o ayın günlerini değiştirir
 *    (inc/api_extra.php a_rosters_shifts_save). Takvimim, Kim nöbette, hatırlatmalar, kurallar her günü kendi ayının listesinden okur.
 *  - Google E-Tablolar’a bağlı listeler kendi sekmeleriyle çalışır (inc/gsync.php); bu dosya onlara dokunmaz.
 */

const RM_KEEP_PER_MONTH = 5; // her ayın en çok bu kadar sürümü saklanır

function rm_on(): bool { return setting('rm_schema', '') === '1'; }

/** Şema: roster_files.ym + parsed; eski kurulumda listenin okunmuş dosyası listenin ayına yazılır */
function rm_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (rm_on()) return;
    foreach (['ym VARCHAR(7) NULL', 'parsed INT NOT NULL DEFAULT 0'] as $c) { try { db()->exec("ALTER TABLE roster_files ADD COLUMN $c"); } catch (Throwable $e) { /* zaten var */ } }
    try { db()->exec('CREATE INDEX idx_rfiles_ym ON roster_files (roster_id, ym)'); } catch (Throwable $e) { /* var */ }
    foreach (all("SELECT id, period, parsed_file_id FROM rosters WHERE period IS NOT NULL AND parsed_file_id IS NOT NULL AND src_on = 0") as $r) {
        if (!preg_match('/^\d{4}-\d{2}$/', (string)$r['period'])) continue;
        q('UPDATE roster_files SET ym = ?, parsed = 1 WHERE roster_id = ? AND attachment_id = ?', [$r['period'], (int)$r['id'], (int)$r['parsed_file_id']]);
    }
    set_setting('rm_schema', '1');
}

function rm_valid_ym(string $ym): bool { return (bool)preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $ym); }

const RM_MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function rm_label(string $ym): string { return rm_valid_ym($ym) ? RM_MONTHS_TR[(int)substr($ym, 5, 2) - 1] . ' ' . substr($ym, 0, 4) : $ym; }

/** Listenin ayları (yeniden eskiye): her ayın son dosyası, okunma durumu, sürüm ve kayıt sayısı */
function rm_months(int $rid): array
{
    if (!rm_on()) return [];
    $o = [];
    foreach (all('SELECT f.id AS fid, f.ym, f.parsed, f.created_at, u.name AS user_name, a.id, a.orig_name, a.mime, a.size
        FROM roster_files f JOIN attachments a ON a.id = f.attachment_id LEFT JOIN users u ON u.id = f.user_id
        WHERE f.roster_id = ? AND f.ym IS NOT NULL ORDER BY f.id DESC', [$rid]) as $x) {
        $ym = (string)$x['ym'];
        if (isset($o[$ym])) { $o[$ym]['versions']++; continue; }
        $o[$ym] = ['ym' => $ym, 'versions' => 1, 'parsed' => (int)$x['parsed'] === 1, 'count' => 0, 'file' => [
            'id' => (int)$x['id'], 'name' => $x['orig_name'], 'mime' => $x['mime'], 'size' => (int)$x['size'],
            'url' => 'api.php?action=file&id=' . (int)$x['id'], 'updated_at' => $x['created_at'], 'user_name' => $x['user_name'],
        ]];
    }
    if ($o) {
        foreach (all('SELECT SUBSTR(s.date, 1, 7) AS ym, COUNT(*) AS n FROM roster_shifts s JOIN rosters r ON r.id = s.roster_id AND r.parsed_file_id = s.file_id WHERE s.roster_id = ? GROUP BY SUBSTR(s.date, 1, 7)', [$rid]) as $c) {
            if (isset($o[$c['ym']])) $o[$c['ym']]['count'] = (int)$c['n'];
        }
    }
    krsort($o);
    return array_values($o);
}

/** Yeni yüklenen dosyayı aya bağla ve her ayın yalnızca son RM_KEEP_PER_MONTH sürümünü sakla */
function rm_tag_file(int $rid, int $attId, string $ym): void
{
    $fid = (int)val('SELECT MAX(id) FROM roster_files WHERE roster_id = ? AND attachment_id = ?', [$rid, $attId]);
    if (!$fid) return;
    q('UPDATE roster_files SET ym = ?, parsed = 0 WHERE id = ?', [$ym, $fid]);
    $old = all('SELECT id, attachment_id FROM roster_files WHERE roster_id = ? AND ym = ? ORDER BY id DESC LIMIT 1000 OFFSET ' . RM_KEEP_PER_MONTH, [$rid, $ym]);
    foreach ($old as $x) {
        q('DELETE FROM roster_files WHERE id = ?', [(int)$x['id']]);
        delete_attachment_if_unused((int)$x['attachment_id']);
    }
}

/** Güncel (öne çıkan) ay: liste açılınca bu ay görünür, sayılar bu aya göre gösterilir */
function a_rosters_primary(): void
{
    $me = need_publisher();
    rm_ensure();
    $rid = (int)i('id');
    $ym = s('ym', 7);
    $r = one('SELECT * FROM rosters WHERE id = ?', [$rid]) ?? fail('Liste bulunamadı.', 404);
    roster_not_linked($rid);
    if (!rm_valid_ym($ym) || !val('SELECT COUNT(*) FROM roster_files WHERE roster_id = ? AND ym = ?', [$rid, $ym])) fail('Bu ay listede yok.', 404);
    q('UPDATE rosters SET period = ? WHERE id = ?', [$ym, $rid]);
    audit($me, 'roster.primary', $r['name'], rm_label($ym) . ' güncel ay yapıldı');
    out(['roster' => roster_out(one('SELECT * FROM rosters WHERE id = ?', [$rid]))]);
}

/** Bir ayı listeden kaldır: o ayın dosyaları ve nöbet kayıtları silinir (diğer aylar kalır) */
function a_rosters_month_delete(): void
{
    $me = need_publisher();
    rm_ensure();
    $rid = (int)i('id');
    $ym = s('ym', 7);
    $r = one('SELECT * FROM rosters WHERE id = ?', [$rid]) ?? fail('Liste bulunamadı.', 404);
    roster_not_linked($rid);
    if (!rm_valid_ym($ym)) fail('Geçersiz ay.');
    $files = all('SELECT id, attachment_id FROM roster_files WHERE roster_id = ? AND ym = ?', [$rid, $ym]);
    if (!$files && !val('SELECT COUNT(*) FROM roster_shifts WHERE roster_id = ? AND date LIKE ?', [$rid, $ym . '-%'])) fail('Bu ay listede yok.', 404);
    q('DELETE FROM roster_shifts WHERE roster_id = ? AND date LIKE ?', [$rid, $ym . '-%']);
    foreach ($files as $f) { q('DELETE FROM roster_files WHERE id = ?', [(int)$f['id']]); delete_attachment_if_unused((int)$f['attachment_id']); }
    if ((string)($r['period'] ?? '') === $ym) {
        // Güncel ay kaldırıldı: kalan aylardan bugüne en yakın olanı güncel olur
        $now = date('Y-m');
        $left = array_column(all('SELECT DISTINCT ym FROM roster_files WHERE roster_id = ? AND ym IS NOT NULL', [$rid]), 'ym');
        usort($left, fn($a, $b) => [abs(strtotime($a . '-01') - strtotime($now . '-01')), $b] <=> [abs(strtotime($b . '-01') - strtotime($now . '-01')), $a]);
        q('UPDATE rosters SET period = ? WHERE id = ?', [$left[0] ?? null, $rid]);
    }
    audit($me, 'roster.month.delete', $r['name'], rm_label($ym));
    out(['roster' => roster_out(one('SELECT * FROM rosters WHERE id = ?', [$rid]))]);
}

return [
    'rosters.primary' => 'a_rosters_primary',
    'rosters.month.delete' => 'a_rosters_month_delete',
];
