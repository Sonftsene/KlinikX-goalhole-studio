<?php
/**
 * Modüller ve yetkiler (4.1).
 *  - Modül aç/kapat: sistem yöneticisi hastane ve birim düzeyinde (merkez module_cfg). Birim kaydı yoksa hastaneye uyar.
 *    Kapalı modülün uçları sunucuda kapanır, istemcide gizlenir. Çekirdek (duyurular, belgeler, okuma, kullanıcılar) hep açık.
 *  - Roller: birim yöneticisi birime özel rol tanımlar; her modül için 'off' (göremez) | 'use' (kullanır) | 'manage' (yönetir).
 *    Rolü olmayan kişide temel yetki geçerlidir: yönetici her şeyi, yayıncı 'manage', üye 'use'. Yönetici her zaman tam yetkilidir.
 *  - Bir eylem bir modüle bağlıysa is_publisher() o modüldeki yetkiye göre karar verir (ör. üyeye "Eksik personel: Yönetir").
 */
declare(strict_types=1);

/** Modül kataloğu: anahtar => [ad, açıklama, bağlı olduğu modül] */
const NM_MODULES = [
    'nobet' => ['Nöbet listeleri ve takvim', 'Excel / Google E-Tablolar listeleri, Takvimim, Kim nöbette, hatırlatmalar, kurallar', null],
    'taraf' => ['Taraf / blok yerleşimi', 'Günlük blok yerleşimi, Sorumlular ekibi, kura, WhatsApp görseli', 'nobet'],
    'istekler' => ['Nöbet istekleri', 'Boşluk ve yıllık izin istekleri, dönemler, onay paneli', 'nobet'],
    'ilan' => ['Nöbet ilanı ve değişim', 'Nöbet devretme / değiştirme ilanları ve kişiler arası değişim istekleri', 'nobet'],
    'eksik' => ['Eksik personel çağrısı', 'Eksik vardiya için uygun kişilere sorma, gönüllü seçme', 'nobet'],
    'gecmis' => ['Değişim geçmişi', 'Değişim, devir, ilan ve çağrı kayıtları (yönetenler)', 'nobet'],
    'rehber' => ['Telefon rehberi', 'Dahili numaralar, santral, acil numaralar (birim + hastane ortak rehberi)', null],
    'mesaj' => ['Mesajlaşma', 'Birim grubu, özel gruplar (birimler arası olabilir), birebir sohbet, dosya ve fotoğraf', null],
    'hbelge' => ['Hastane belgeleri', 'Hastane geneli protokol, talimat, form ve duyurular; birimler arası ortak, okudum onayı', null],
    'cizelge' => ['Nöbet çizelgesi hazırlama', 'Excel kullanmayan birimler için çizelgeyi portalda hazırlama: kural denetimi, otomatik doldurma, yayınlama', 'nobet'],
    'yemek' => ['Yemek listesi', 'Hastane yemek menüsü: aylık listeyi PDF / Excel’den yükleme, gün gün menü, saate göre sıradaki öğün, nöbetteki öğünler', null],
    'ucret' => ['Fazla mesai ücreti', 'Kişinin kendi ücretini girip tahmini tutarı görmesi (yalnız kendisi görür)', 'nobet'],
];

/** Eylem → modül (önek eşleşmesi; en uzun önek kazanır) */
const NM_ACTION_MODULE = [
    'rosters.' => 'nobet', 'shifts.' => 'nobet', 'gsync.' => 'nobet', 'shiftcodes.' => 'nobet', 'rules.' => 'nobet', 'holidays.' => 'nobet',
    'side.' => 'taraf', 'placement.' => 'taraf',
    'req.' => 'istekler',
    'listing.' => 'ilan', 'swap.' => 'ilan',
    'callout.' => 'eksik',
    'extra.' => 'eksik',
    'extra.take' => 'ilan',
    'history.' => 'gecmis',
    'phonebook.' => 'rehber',
    'hdoc.' => 'hbelge',
    'chat.' => 'mesaj',
    'call.' => 'mesaj',
    'plan.' => 'cizelge',
    'names.' => 'nobet',
    'meal.' => 'yemek',
    'kura.' => 'taraf', // kura taraf / blok modülünün parçası (4.55.0)
];

function nm_action_module(string $action): ?string
{
    $best = null; $len = 0;
    foreach (NM_ACTION_MODULE as $p => $m) if (strncmp($action, $p, strlen($p)) === 0 && strlen($p) > $len) { $best = $m; $len = strlen($p); }
    return $best;
}

/* ---------------- Modül aç/kapat (merkez) ---------------- */

/** Bu birimde açık modüller: [modül => bool] */
function nm_mods(): array
{
    static $c = null;
    if ($c !== null) return $c;
    $c = array_fill_keys(array_keys(NM_MODULES), true);
    if (nm_multi()) {
        $t = nm_tenant();
        try {
            foreach (m_all("SELECT module, on_ FROM module_cfg WHERE scope = 'h' AND sid = ?", [(int)$t['hospital_id']]) as $r) if (isset($c[$r['module']])) $c[$r['module']] = (int)$r['on_'] === 1;
            foreach (m_all("SELECT module, on_ FROM module_cfg WHERE scope = 't' AND sid = ?", [(int)$t['id']]) as $r) if (isset($c[$r['module']])) $c[$r['module']] = (int)$r['on_'] === 1;
        } catch (Throwable $e) { /* merkez okunamadıysa hepsi açık */ }
    }
    // Abonelik paketi (zorunluluk açıksa): pakette olmayan modüller kapalı
    if (function_exists('bl_state_cur')) {
        $bs = bl_state_cur();
        if (is_array($bs['modules'] ?? null)) foreach ($c as $k => $v) if (!in_array($k, $bs['modules'], true)) $c[$k] = false;
    }
    foreach (NM_MODULES as $k => [, , $dep]) if ($dep && empty($c[$dep])) $c[$k] = false; // bağlı olduğu modül kapalıysa
    return $c;
}

function nm_mod_on(string $m): bool
{
    return nm_mods()[$m] ?? true;
}

/* ---------------- Roller ve izinler ---------------- */

const NM_PERM_LEVELS = ['off', 'use', 'manage'];

function role_perms(?int $roleId): ?array
{
    static $c = [];
    if (!$roleId) return null;
    if (!array_key_exists($roleId, $c)) {
        $r = one('SELECT perms FROM roles WHERE id = ?', [$roleId]);
        $c[$roleId] = $r ? (json_decode((string)$r['perms'], true) ?: []) : null;
    }
    return $c[$roleId];
}

/** Kişinin modüldeki yetkisi: 'off' | 'use' | 'manage' */
function user_perm(?array $u, string $m): string
{
    if (!$u || !nm_mod_on($m)) return 'off';
    if ($u['role'] === 'admin') return 'manage';
    $base = $u['role'] === 'editor' ? 'manage' : 'use';
    $rp = role_perms(isset($u['role_id']) ? (int)$u['role_id'] : null);
    if ($rp === null) return $base;
    $v = $rp[$m] ?? $base;
    return in_array($v, NM_PERM_LEVELS, true) ? $v : $base;
}

/** Kişinin tüm modüllerdeki yetkisi (açılış verisi için) */
function user_perms(array $u): array
{
    $o = [];
    foreach (array_keys(NM_MODULES) as $m) $o[$m] = user_perm($u, $m);
    return $o;
}

/**
 * Dağıtıcıdan (api.php) önce: eylem bir modüle bağlıysa modül açık mı, kişi görebiliyor mu?
 * Ayrıca is_publisher() bu modülün yetkisine göre karar versin diye bağlamı ayarlar.
 */
function nm_perm_gate(string $action): void
{
    $m = nm_action_module($action);
    if ($m === null) return;
    $GLOBALS['NM_MOD'] = $m;
    if (!nm_mod_on($m)) fail('“' . NM_MODULES[$m][0] . '” bu birimde kapalı.', 403);
    $u = current_user();
    if ($u && user_perm($u, $m) === 'off') fail('“' . NM_MODULES[$m][0] . '” için yetkiniz yok. Birim yöneticinize başvurun.', 403);
}

/* ---------------- Roller: birim yöneticisi ---------------- */

function role_out(array $r): array
{
    $p = json_decode((string)$r['perms'], true) ?: [];
    $o = [];
    foreach (array_keys(NM_MODULES) as $m) $o[$m] = in_array($p[$m] ?? '', NM_PERM_LEVELS, true) ? $p[$m] : null;
    return ['id' => (int)$r['id'], 'name' => $r['name'], 'perms' => $o,
        'users' => (int)val('SELECT COUNT(*) FROM users WHERE role_id = ?', [(int)$r['id']])];
}

function a_roles_list(): void
{
    need_admin();
    out(['roles' => array_map('role_out', all('SELECT * FROM roles ORDER BY sort, name, id')), 'modules' => nm_modules_out()]);
}

function nm_modules_out(): array
{
    $on = nm_mods();
    $o = [];
    foreach (NM_MODULES as $k => [$name, $desc, $dep]) $o[] = ['key' => $k, 'name' => $name, 'desc' => $desc, 'dep' => $dep, 'on' => $on[$k]];
    return $o;
}

function a_roles_save(): void
{
    $me = need_admin();
    global $IN;
    $name = s('name', 80);
    if (mb_strlen($name) < 2) fail('Rol adını girin.');
    $in = is_array($IN['perms'] ?? null) ? $IN['perms'] : [];
    $perms = [];
    foreach (array_keys(NM_MODULES) as $m) if (in_array($in[$m] ?? null, NM_PERM_LEVELS, true)) $perms[$m] = $in[$m];
    $id = (int)(i('id') ?? 0);
    if ($id) {
        $r = one('SELECT * FROM roles WHERE id = ?', [$id]) ?? fail('Rol bulunamadı.', 404);
        q('UPDATE roles SET name = ?, perms = ? WHERE id = ?', [$name, json_encode($perms), $id]);
        audit($me, 'role.save', $name, $r['name'] !== $name ? 'Eski ad: ' . $r['name'] : '');
    } else {
        if ((int)val('SELECT COUNT(*) FROM roles') >= 30) fail('En fazla 30 rol tanımlanabilir.');
        q('INSERT INTO roles (name, perms, sort, created_at) VALUES (?, ?, ?, ?)', [$name, json_encode($perms), (int)val('SELECT COALESCE(MAX(sort), 0) + 1 FROM roles'), now()]);
        $id = insert_id();
        audit($me, 'role.create', $name);
    }
    out(['role' => role_out(one('SELECT * FROM roles WHERE id = ?', [$id]))]);
}

function a_roles_delete(): void
{
    $me = need_admin();
    $r = one('SELECT * FROM roles WHERE id = ?', [(int)i('id')]) ?? fail('Rol bulunamadı.', 404);
    q('UPDATE users SET role_id = NULL WHERE role_id = ?', [$r['id']]);
    q('DELETE FROM roles WHERE id = ?', [$r['id']]);
    audit($me, 'role.delete', $r['name']);
    out();
}

/** Yönetici: kişiye rol ata (boş = temel yetki) */
function a_roles_assign(): void
{
    $me = need_admin();
    $u = one('SELECT * FROM users WHERE id = ?', [(int)i('user_id')]) ?? fail('Kullanıcı bulunamadı.', 404);
    $rid = i('role_id');
    if ($rid && !one('SELECT id FROM roles WHERE id = ?', [$rid])) fail('Rol bulunamadı.', 404);
    q('UPDATE users SET role_id = ? WHERE id = ?', [$rid ?: null, $u['id']]);
    $rn = $rid ? (string)val('SELECT name FROM roles WHERE id = ?', [$rid]) : 'Temel yetki';
    audit($me, 'role.assign', $u['name'], $rn);
    out();
}

/* ---------------- Sistem yöneticisi: modül aç/kapat ---------------- */

function a_sa_modules_get(): void
{
    need_sa();
    $kind = s('kind', 10) === 'hospital' ? 'h' : 't';
    $id = (int)(i('id') ?? 0);
    $row = $kind === 'h' ? m_one('SELECT * FROM hospitals WHERE id = ?', [$id]) : m_one('SELECT * FROM tenants WHERE id = ?', [$id]);
    if (!$row) fail('Bulunamadı.', 404);
    $own = [];
    foreach (m_all('SELECT module, on_ FROM module_cfg WHERE scope = ? AND sid = ?', [$kind, $id]) as $r) $own[$r['module']] = (int)$r['on_'] === 1;
    $hosp = [];
    if ($kind === 't') foreach (m_all("SELECT module, on_ FROM module_cfg WHERE scope = 'h' AND sid = ?", [(int)$row['hospital_id']]) as $r) $hosp[$r['module']] = (int)$r['on_'] === 1;
    $o = [];
    foreach (NM_MODULES as $k => [$name, $desc, $dep]) {
        $o[] = ['key' => $k, 'name' => $name, 'desc' => $desc, 'dep' => $dep,
            'value' => array_key_exists($k, $own) ? ($own[$k] ? 'on' : 'off') : ($kind === 'h' ? 'on' : 'inherit'),
            'hospital' => $kind === 't' ? ($hosp[$k] ?? true) : null];
    }
    out(['modules' => $o, 'core' => ['Duyurular ve belgeler', 'Okuma takibi', 'Bildirimler', 'Kullanıcılar ve davetler']]);
}

function a_sa_modules_save(): void
{
    $sa = need_sa();
    global $IN;
    $kind = s('kind', 10) === 'hospital' ? 'h' : 't';
    $id = (int)(i('id') ?? 0);
    $row = $kind === 'h' ? m_one('SELECT * FROM hospitals WHERE id = ?', [$id]) : m_one('SELECT * FROM tenants WHERE id = ?', [$id]);
    if (!$row) fail('Bulunamadı.', 404);
    $vals = is_array($IN['modules'] ?? null) ? $IN['modules'] : [];
    $changed = [];
    foreach (array_keys(NM_MODULES) as $m) {
        $v = (string)($vals[$m] ?? '');
        if ($v === 'inherit' || ($kind === 'h' && $v === 'on')) m_q('DELETE FROM module_cfg WHERE scope = ? AND sid = ? AND module = ?', [$kind, $id, $m]);
        elseif ($v === 'on' || $v === 'off') m_q('INSERT OR REPLACE INTO module_cfg (scope, sid, module, on_) VALUES (?, ?, ?, ?)', [$kind, $id, $m, $v === 'on' ? 1 : 0]);
        else continue;
        $changed[] = NM_MODULES[$m][0] . ': ' . ['on' => 'açık', 'off' => 'kapalı', 'inherit' => 'hastaneye uy'][$v];
    }
    sa_audit($sa, 'modules', ($kind === 'h' ? 'Hastane: ' : 'Birim: ') . $row['name'], implode(', ', $changed));
    out();
}

// Yöneticiye rol listesi (kullanıcı formunda seçim için)
/** Bir bölüm bu kişiye neden görünmüyor (görünüyorsa null): birim / hastane ayarı, abonelik paketi, bağlı modül ya da rol */
function nm_mod_why(string $m, array $u): ?string
{
    if (!isset(NM_MODULES[$m])) return null;
    if (!nm_mod_on($m)) {
        if (nm_multi()) {
            try {
                $t = nm_tenant();
                $tv = m_val("SELECT on_ FROM module_cfg WHERE scope = 't' AND sid = ? AND module = ?", [(int)$t['id'], $m]);
                if ($tv !== null && $tv !== false && (int)$tv === 0) return 'biriminizde kapalı (sistem yöneticisi ayarı)';
                $hv = m_val("SELECT on_ FROM module_cfg WHERE scope = 'h' AND sid = ? AND module = ?", [(int)$t['hospital_id'], $m]);
                if (($tv === null || $tv === false) && $hv !== null && $hv !== false && (int)$hv === 0) return 'hastanenizde kapalı (sistem yöneticisi ayarı)';
            } catch (Throwable $e) { /* */ }
        }
        if (function_exists('bl_state_cur')) {
            $bs = bl_state_cur();
            if (is_array($bs['modules'] ?? null) && !in_array($m, $bs['modules'], true)) return 'abonelik paketinizde yok';
        }
        $dep = NM_MODULES[$m][2];
        if ($dep && !nm_mod_on($dep)) return '“' . NM_MODULES[$dep][0] . '” kapalı olduğu için';
        return 'biriminizde kapalı';
    }
    if (user_perm($u, $m) === 'off') {
        $rn = !empty($u['role_id']) ? (string)(val('SELECT name FROM roles WHERE id = ?', [(int)$u['role_id']]) ?: '') : '';
        return $rn !== '' ? '“' . $rn . '” rolünüzde kapalı (birim yöneticisi ayarı)' : 'yetkiniz kapalı';
    }
    return null;
}
$GLOBALS['NM_BOOT'][] = function (array $me): array {
    $o = [];
    foreach (NM_MODULES as $m => $def) { $w = nm_mod_why($m, $me); if ($w !== null) $o[$m] = ['name' => $def[0], 'why' => $w]; }
    return ['mods_why' => (object)$o];
};
$GLOBALS['NM_BOOT'][] = fn(array $me): array => $me['role'] === 'admin' ? ['roles' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], all('SELECT id, name FROM roles ORDER BY sort, name, id'))] : [];

/* ---------------- Görevler: kapalı modülün zamanlanmış işleri çalışmaz ---------------- */
$GLOBALS['NM_JOB_MODULE'] = ($GLOBALS['NM_JOB_MODULE'] ?? []) + ['requests' => 'istekler', 'remind_personal' => 'nobet']; // market: süresi geçen ilan/çağrıları kapatır, her zaman çalışır

return [
    'roles.list' => 'a_roles_list',
    'roles.save' => 'a_roles_save',
    'roles.delete' => 'a_roles_delete',
    'roles.assign' => 'a_roles_assign',
    'sa.modules.get' => 'a_sa_modules_get',
    'sa.modules.save' => 'a_sa_modules_save',
];
