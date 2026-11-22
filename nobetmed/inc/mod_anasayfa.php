<?php
/**
 * dupcii — ana sayfa varsayılan düzeni (yönetici herkes için belirler)
 * Kişi kendi düzenini yapmadıysa (users.ui_prefs.home yoksa) bu düzen kullanılır: gizli / açık kartlar, sıra, telefonda önce kartlar.
 */
declare(strict_types=1);

function home_default_get(): ?array
{
    $j = json_decode((string)setting('home_default', ''), true);
    return is_array($j) ? $j : null;
}

/** {home: {hidden, shown, order, side_first} | null, reset_users: bool} */
function a_home_default_save(): void
{
    $me = need_admin();
    global $IN;
    $h = $IN['home'] ?? null;
    $clean = is_array($h) && function_exists('prefs_clean_ui') ? (prefs_clean_ui(['home' => $h])['home'] ?? null) : null;
    set_setting('home_default', $clean ? json_encode($clean, JSON_UNESCAPED_UNICODE) : '');
    $n = 0;
    if (!empty($IN['reset_users'])) {
        foreach (all("SELECT id, ui_prefs FROM users WHERE ui_prefs LIKE '%home%'") as $u) {
            $j = json_decode((string)$u['ui_prefs'], true);
            if (!is_array($j) || !array_key_exists('home', $j)) continue;
            unset($j['home']);
            q('UPDATE users SET ui_prefs = ? WHERE id = ?', [json_encode((object)$j, JSON_UNESCAPED_UNICODE), $u['id']]);
            $n++;
        }
    }
    audit($me, 'settings.save', 'Ana sayfa varsayılan düzeni', ($clean ? '' : 'kaldırıldı') . ($n ? ' ' . $n . ' kişinin kendi düzeni sıfırlandı' : ''));
    out(['home' => $clean, 'reset' => $n]);
}

$GLOBALS['NM_BOOT'][] = fn(array $me): array => ['home_default' => home_default_get()];

return [
    'home.default.save' => 'a_home_default_save',
];
