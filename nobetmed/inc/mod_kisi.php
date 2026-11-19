<?php
/**
 * Kişi kartı (4.13): uygulamanın herhangi bir yerinde (nöbet listeleri, kim nöbette, bloklar, ilanlar, istekler, duyurular…)
 * bir kişinin adına dokununca açılan kart: mesaj, sesli / görüntülü arama, telefon, SMS, WhatsApp, e-posta ve yaklaşan nöbetleri.
 * Yalnız kendi birimindeki kişiler ve listede adı geçenler için; iletişim bilgileri ekip rehberinde görünenlerle aynıdır.
 */
declare(strict_types=1);

function a_person_card(): void
{
    $me = need_user();
    $uid = i('uid');
    $name = trim(s('name', 120));
    $u = null;
    if ($uid) $u = one("SELECT id, name, email, phone, extension, title_id, unit_id, last_seen_at, avatar FROM users WHERE id = ? AND status = 'active'", [$uid]);
    if (!$u && $name !== '') {
        foreach (all("SELECT id, name, email, phone, extension, title_id, unit_id, last_seen_at, avatar FROM users WHERE status = 'active'") as $r) {
            if (names_match($name, (string)$r['name'])) { $u = $r; break; }
        }
    }
    if (!$u && $name === '') fail('Kişi bulunamadı.', 404);
    $shown = $u ? (string)$u['name'] : $name;
    $o = ['uid' => $u ? (int)$u['id'] : null, 'name' => $shown, 'self' => $u && (int)$u['id'] === (int)$me['id'], 'account' => (bool)$u];
    if ($u) {
        $o += ['phone' => $u['phone'] ?: null, 'extension' => $u['extension'] ?: null, 'email' => $u['email'] ?: null,
            'title' => $u['title_id'] ? (string)(val('SELECT name FROM titles WHERE id = ?', [(int)$u['title_id']]) ?? '') : '',
            'unit' => $u['unit_id'] ? (string)(val('SELECT name FROM units WHERE id = ?', [(int)$u['unit_id']]) ?? '') : '',
            'avatar' => avatar_url($u), 'last_seen_at' => $u['last_seen_at']];
    }
    // Mesajlaşma ve arama (hastane ortak veritabanı, modül açık, iki taraf da kullanabiliyor)
    $o['chat'] = false; $o['calls'] = false; $o['tk'] = null;
    if ($u && !$o['self'] && function_exists('c_tk') && function_exists('hdb') && hdb() && nm_mod_on('mesaj') && user_perm($me, 'mesaj') !== 'off') {
        $o['chat'] = true; $o['tk'] = c_tk();
        $o['calls'] = function_exists('c_calls_on') && c_calls_on();
    }
    // Yaklaşan nöbetleri (nöbet listeleri herkese açık olduğu için)
    $o['shifts'] = [];
    if (nm_mod_on('nobet') && user_perm($me, 'nobet') !== 'off') {
        $rows = shifts_for_user(['name' => $shown], date('Y-m-d', strtotime('-1 day')), date('Y-m-d', strtotime('+45 days')));
        $now = date('Y-m-d H:i');
        $rows = array_values(array_filter($rows, function ($r) use ($now) {
            if (!in_array($r['kind'], ['shift', 'role', 'leave', 'off'], true)) return false;
            if ($r['date'] >= date('Y-m-d')) return true;
            // dün başlayıp hâlâ süren gece / 24 saat nöbeti
            return $r['kind'] === 'shift' && $r['start_time'] && $r['end_time'] && $r['end_time'] <= $r['start_time'] && date('Y-m-d') . ' ' . $r['end_time'] > $now;
        }));
        $o['shifts'] = array_map('shift_row_out', array_slice($rows, 0, 8));
    }
    out(['person' => $o]);
}

return [
    'person.card' => 'a_person_card',
];
