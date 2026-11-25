<?php
/**
 * Rol gözünden görme (4.22): birim yöneticisi kendi hesabıyla sitenin yayıncı (sorumlu), üye ya da birime özel bir rolün
 * gözünden nasıl göründüğüne bakar. Başkasının hesabına girilmez; yalnız bu oturumdaki rol geçici olarak düşürülür.
 *  - Oturumda $_SESSION['view_as'] = ['role' => editor|member, 'role_id' => ?int]; current_user() rolü buna göre verir.
 *  - Önizleme salt okunurdur: değişiklik yapan istekler durdurulur (yanlışlıkla üye adına ilan, istek vb. açılmasın).
 *  - Gerçek rolü yönetici olmayan ya da sistem yöneticisi (sanal yönetici) kullanamaz; oturum kapanınca biter.
 */
declare(strict_types=1);

/** Oturumda rol gözünden görme açık mı */
function vw_active(?array $u = null): bool
{
    $u = $u ?? current_user();
    return $u !== null && !empty($u['view_as']);
}

/** Açıkken değişiklik yapan istekleri durdur (dağıtıcıdan çağrılır) */
function vw_gate(string $action): void
{
    if (empty($_SESSION['view_as']) || !vw_active()) return;
    if (in_array($action, ['me.viewas', 'auth.logout'], true) || nm_read_action($action)) return;
    fail('Şu an başka bir rolün gözünden bakıyorsunuz; bu önizlemede değişiklik yapılamaz. Üstteki banttan “Çık” ile kendi görünümünüze dönün.', 423);
}

/** Rolün okunur adı */
function vw_label(array $va): string
{
    if (!empty($va['role_id'])) {
        $n = val('SELECT name FROM roles WHERE id = ?', [(int)$va['role_id']]);
        if ($n) return (string)$n;
    }
    return ($va['role'] ?? '') === 'editor' ? 'Sorumlu' : 'Üye';
}

function a_viewas(): void
{
    $me = need_user();
    if (($me['real_role'] ?? $me['role']) !== 'admin' || !empty($me['sa_virtual'])) fail('Bu özellik birim yöneticisi içindir.', 403);
    $role = s('role', 10);
    if ($role === '') {
        unset($_SESSION['view_as']);
        out(['ok' => true, 'view_as' => null]);
    }
    if (!in_array($role, ['editor', 'member'], true)) fail('Geçersiz rol.');
    $rid = i('role_id') ?: null;
    if ($rid !== null && !one('SELECT id FROM roles WHERE id = ?', [$rid])) fail('Rol bulunamadı.', 404);
    $va = ['role' => $role, 'role_id' => $rid];
    $_SESSION['view_as'] = $va;
    audit($me, 'viewas', vw_label($va), 'Rol gözünden önizleme');
    out(['ok' => true, 'view_as' => $va]);
}

// Açılış: önizleme açıkken rolü değiştirme seçenekleri (yönetici rolü düşük göründüğü için roller ayrıca gönderilir)
$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (empty($me['view_as'])) return [];
    return ['view_as' => ['role' => $me['view_as']['role'], 'role_id' => $me['view_as']['role_id'], 'label' => vw_label($me['view_as']),
        'roles' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name']], all('SELECT id, name FROM roles ORDER BY sort, name, id'))]];
};

return [
    'me.viewas' => 'a_viewas',
];
