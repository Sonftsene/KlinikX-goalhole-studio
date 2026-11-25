<?php
/**
 * dupcii — Herkes için ana ekran (4.50.0)
 *
 * Yönetici ana ekranı bir kez herkes için kurar (Ayarlar › Genel › Herkes için ana ekran):
 *  - hazır düzen (sade / standart / tam / ozel), ana sayfa bölümleri (gizli / açık / sıra), kilit (kişi değiştiremez)
 *  - üst çubuk simgeleri, kısayollar (herkes için; büyük düğme; kişi kendine ekleyebilir mi), alt menü sekmeleri
 *  - Sorumlular (yayıncı + yönetici) için isteğe bağlı ayrı düzen
 * setting ui_layout = {base: L, publisher: L|null, ver: zaman}; kişi boot'ta kendi rolünün düzenini alır (ui_layout).
 * Eski “Herkesin ana sayfası” (setting home_default, inc/mod_anasayfa.php) temel düzenin home alanıyla eşitlenir.
 */

const UL_TOP = ['phone', 'search', 'chat', 'compose', 'theme'];      // gizlenebilir üst simgeler (zil ve profil her zaman görünür)
const UL_BOTTOM = ['nobet', 'compose', 'todo'];                       // gizlenebilir alt sekmeler (Ana sayfa ve Menü her zaman)
const UL_PRESETS = ['sade', 'standart', 'tam', 'ozel'];

function ul_clean(?array $L): ?array
{
    if (!is_array($L)) return null;
    $ids = fn($a, int $max) => array_slice(array_values(array_unique(array_filter(array_map('strval', is_array($a) ? $a : []), fn($x) => preg_match('/^[a-z0-9_-]{1,30}$/', $x)))), 0, $max);
    $home = null;
    if (isset($L['home']) && is_array($L['home']) && function_exists('prefs_clean_ui')) $home = prefs_clean_ui(['home' => $L['home']])['home'] ?? null;
    $chips = null;
    if (isset($L['chips']) && is_array($L['chips'])) {
        $chips = [];
        foreach ($L['chips'] as $x) {
            $x = (string)$x;
            if ((preg_match('/^[a-z]{2,12}$/', $x) || preg_match('~^p:#/[A-Za-z0-9/_-]{1,60}$~', $x)) && !in_array($x, $chips, true)) $chips[] = $x;
        }
        $chips = array_slice($chips, 0, 12);
    }
    return [
        'preset' => in_array($L['preset'] ?? '', UL_PRESETS, true) ? $L['preset'] : 'ozel',
        'home' => $home,
        'lock' => !empty($L['lock']),
        'top_hide' => array_values(array_intersect($ids($L['top_hide'] ?? [], 10), UL_TOP)),
        'bottom_hide' => array_values(array_intersect($ids($L['bottom_hide'] ?? [], 10), UL_BOTTOM)),
        'chips' => $chips,
        'chips_big' => !empty($L['chips_big']),
        'chips_own' => !array_key_exists('chips_own', $L) || !empty($L['chips_own']),
    ];
}

function ul_get(): array
{
    $j = json_decode((string)setting('ui_layout', ''), true);
    return is_array($j) ? $j : [];
}

/** Kişinin göreceği düzen: sorumlu / yönetici için ayrı düzen varsa o, yoksa herkesinki */
function ul_for(array $me): ?array
{
    $j = ul_get();
    if (!$j || empty($j['base'])) return null;
    $pub = function_exists('is_publisher') && is_publisher($me);
    $L = $pub && !empty($j['publisher']) ? $j['publisher'] : $j['base'];
    return $L + ['ver' => (string)($j['ver'] ?? ''), 'scope' => $pub && !empty($j['publisher']) ? 'publisher' : 'base'];
}

function a_ui_layout_get(): void
{
    need_admin();
    $j = ul_get();
    out(['base' => $j['base'] ?? null, 'publisher' => $j['publisher'] ?? null, 'ver' => $j['ver'] ?? null]);
}

/** {base: L|null, publisher: L|null, reset_users: bool} — base null: herkes için düzen kaldırılır (eski davranış) */
function a_ui_layout_save(): void
{
    $me = need_admin();
    global $IN;
    $base = ul_clean(is_array($IN['base'] ?? null) ? $IN['base'] : null);
    $pub = $base ? ul_clean(is_array($IN['publisher'] ?? null) ? $IN['publisher'] : null) : null;
    set_setting('ui_layout', $base ? json_encode(['base' => $base, 'publisher' => $pub, 'ver' => now()], JSON_UNESCAPED_UNICODE) : '');
    // Eski varsayılan düzen (kişi kendi düzenini yapmadıysa) temel düzenle aynı olsun
    set_setting('home_default', $base && $base['home'] ? json_encode($base['home'], JSON_UNESCAPED_UNICODE) : '');
    $n = 0;
    if (!empty($IN['reset_users'])) {
        foreach (all("SELECT id, ui_prefs FROM users WHERE ui_prefs LIKE '%home%' OR ui_prefs LIKE '%chips%'") as $u) {
            $j = json_decode((string)$u['ui_prefs'], true);
            if (!is_array($j) || (!array_key_exists('home', $j) && !array_key_exists('chips', $j))) continue;
            unset($j['home'], $j['chips']);
            q('UPDATE users SET ui_prefs = ? WHERE id = ?', [json_encode((object)$j, JSON_UNESCAPED_UNICODE), $u['id']]);
            $n++;
        }
    }
    audit($me, 'settings.save', 'Herkes için ana sayfa', $base ? ('düzen: ' . $base['preset'] . ($pub ? ' · sorumlulara ayrı düzen' : '') . ($base['lock'] ? ' · kilitli' : '')) : 'kaldırıldı');
    $j = ul_get();
    out(['base' => $j['base'] ?? null, 'publisher' => $j['publisher'] ?? null, 'ver' => $j['ver'] ?? null, 'reset' => $n, 'mine' => ul_for($me)]);
}

/* ---------------- Sayfa ve menü adları (yönetici; veritabanında durur, güncellemede değişmez) ---------------- */
function ul_labels(): array
{
    $j = json_decode((string)setting('ui_labels', ''), true);
    return is_array($j) ? $j : [];
}
/** {labels: {anahtar: ad}} — anahtar: sayfa adresi (#/…) ya da menü başlığı (@nobet, bn:menu…); boş ad varsayılana döner */
function a_ui_labels_save(): void
{
    $me = need_admin();
    global $IN;
    $in = is_array($IN['labels'] ?? null) ? $IN['labels'] : [];
    $o = [];
    foreach (array_slice($in, 0, 200, true) as $k => $v) {
        $k = (string)$k;
        if (!preg_match('~^(#/[A-Za-z0-9/_-]{0,60}|@[a-z]{2,20}|bn:[a-z]{2,10})$~', $k)) continue;
        $v = trim(preg_replace('/\s+/u', ' ', strip_tags((string)$v)));
        if ($v === '') continue;
        $o[$k] = mb_substr($v, 0, 40);
    }
    set_setting('ui_labels', $o ? json_encode($o, JSON_UNESCAPED_UNICODE) : '');
    audit($me, 'settings.save', 'Sayfa ve menü adları', count($o) . ' özel ad');
    out(['labels' => (object)$o]);
}

$GLOBALS['NM_BOOT'][] = fn(array $me): array => ['ui_layout' => ul_for($me), 'ui_labels' => (object)ul_labels()];

return [
    'ui.labels.save' => 'a_ui_labels_save',
    'ui.layout.get' => 'a_ui_layout_get',
    'ui.layout.save' => 'a_ui_layout_save',
];
