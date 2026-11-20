<?php
/**
 * Abonelik ve ödeme (4.15) — uygulama uçları, süper yönetici uçları, kısıtlamalar ve hatırlatmalar.
 * Kütüphane: inc/billing.php. Ödeme sağlayıcısı dönüşleri: odeme.php.
 */
declare(strict_types=1);
require_once __DIR__ . '/billing.php';

/** Bu birimin abonelik durumu (istek boyunca önbellekli) */
function bl_state_cur(): array
{
    static $s = null;
    if ($s !== null) return $s;
    if (!bl_on()) return $s = ['enforce' => false, 'visible' => false, 'mode' => 'open', 'modules' => null, 'max_users' => 0, 'read_only' => false, 'status' => 'none', 'plan' => null, 'ends' => null, 'days_left' => null];
    try { $s = bl_state((string)nm_tenant()['tkey']); }
    catch (Throwable $e) { error_log('[dupcii] abonelik durumu: ' . $e->getMessage()); $s = ['enforce' => false, 'visible' => false, 'mode' => 'open', 'modules' => null, 'max_users' => 0, 'read_only' => false, 'status' => 'none', 'plan' => null, 'ends' => null, 'days_left' => null]; }
    return $s;
}

/** Açılış verisi / durum özeti (herkese; ödeme yalnız birim yöneticisine) */
function bl_public(?array $me): array
{
    $s = bl_state_cur();
    // Zorunluluk kapalıyken de gerçek durum gösterilir (ödeme yapan birim "Etkin", denemedeki "Deneme")
    $disp = $s['mode'];
    if (!$s['enforce']) $disp = in_array($s['real_mode'] ?? '', ['active', 'trial', 'comp', 'grace'], true) ? $s['real_mode'] : ($s['status'] === 'none' ? 'none' : 'open');
    return ['visible' => (bool)$s['visible'], 'enforce' => (bool)$s['enforce'], 'mode' => $s['mode'], 'disp' => $disp, 'mode_txt' => BL_MODE_TXT[$disp] ?? $disp,
        'status' => $s['status'], 'plan' => $s['plan'] ? ['id' => $s['plan']['id'], 'name' => $s['plan']['name']] : null, 'ends' => $s['ends'], 'days_left' => $s['days_left'],
        'grace_until' => $s['grace_until'] ?? null, 'read_only' => (bool)$s['read_only'], 'max_users' => (int)$s['max_users'],
        'can_pay' => $me && $me['role'] === 'admin' && empty($me['sa_virtual']) && $s['visible']];
}

$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (!bl_on()) return [];
    return ['billing' => bl_public($me)];
};

/**
 * Dağıtıcıdan önce: süresi dolmuş ve ücretsiz paketi olmayan birim salt okunurdur.
 * Okuma uçları, giriş/hesap işlemleri ve ödeme serbest; sistem yöneticisi birime girdiyse kısıtlanmaz.
 */
function bl_gate(string $action): void
{
    if (!bl_on() || !empty($_SESSION['sa_in'])) return;
    $s = bl_state_cur();
    if (!$s['read_only']) return;
    if (nm_read_action($action)) return;
    if (strncmp($action, 'sp.', 3) === 0) return; // destek talebi abonelik bitse de açılabilir
    fail('Biriminizin aboneliği sona erdi; uygulama yalnız görüntülenebilir. Birim yöneticiniz Ayarlar › Abonelik’ten yenileyebilir.', 402);
}

/** Kişi sınırı: yeni etkin kişi eklenebilir mi (hata metni ya da null) */
function bl_user_room(int $adding = 1): ?string
{
    if (!bl_on() || !empty($_SESSION['sa_in'])) return null;
    $s = bl_state_cur();
    if (!$s['enforce'] || (int)$s['max_users'] <= 0) return null;
    $n = (int)val("SELECT COUNT(*) FROM users WHERE status = 'active'");
    if ($n + $adding <= (int)$s['max_users']) return null;
    return 'Paketinizin kişi sınırına ulaşıldı (' . (int)$s['max_users'] . ' etkin kişi). Yeni kişiyi etkinleştirmek için paketi yükseltin ya da kullanılmayan bir hesabı devre dışı bırakın.';
}

/* =================================================================== */
/* Birim: abonelik sayfası ve ödeme                                     */
/* =================================================================== */

function bl_need_admin(): array
{
    $me = need_user();
    if (!bl_on()) fail('Abonelik bu kurulumda kullanılmıyor.', 404);
    if ($me['role'] !== 'admin' || !empty($me['sa_virtual'])) fail('Abonelik ve ödeme işlemlerini birim yöneticisi yapar.', 403);
    if (!bl_state_cur()['visible']) fail('Abonelik henüz açılmadı.', 403);
    return $me;
}

function a_billing_page(): void
{
    $me = bl_need_admin();
    $tk = (string)nm_tenant()['tkey'];
    $c = bl_cfg();
    $plans = array_values(array_filter(bl_plans(true), fn($p) => true));
    $prov = [];
    if ($c['paytr_on'] === '1') $prov[] = ['key' => 'paytr', 'name' => 'Kredi / banka kartı (PayTR)'];
    if ($c['iyzico_on'] === '1') $prov[] = ['key' => 'iyzico', 'name' => 'Kredi / banka kartı (iyzico)'];
    if ($c['havale_on'] === '1') $prov[] = ['key' => 'havale', 'name' => 'Havale / EFT'];
    $pays = array_map('bl_pay_out', m_all('SELECT * FROM bl_payments WHERE tkey = ? ORDER BY id DESC LIMIT 60', [$tk]));
    $mods = [];
    foreach (NM_MODULES as $k => [$name]) $mods[$k] = $name;
    out(['state' => bl_public($me), 'plans' => array_map(fn($p) => $p + ['prices' => ['month' => bl_price($p, 'month'), 'year' => bl_price($p, 'year')]], $plans),
        'providers' => $prov, 'kdv' => (float)$c['kdv'], 'billing' => bl_billing($tk), 'payments' => $pays, 'modules' => $mods,
        'users' => (int)val("SELECT COUNT(*) FROM users WHERE status = 'active'"), 'havale_text' => $c['havale_on'] === '1' ? $c['havale_text'] : '', 'terms' => $c['terms']]);
}

function bl_billing_from_input(): array
{
    $b = ['title' => s('title', 160), 'tax_office' => s('tax_office', 80), 'tax_no' => preg_replace('/\D/', '', s('tax_no', 20)), 'address' => s('address', 400),
        'city' => s('city', 60), 'email' => s('email', 190), 'phone' => preg_replace('/[^0-9+]/', '', s('phone', 30))];
    if (mb_strlen($b['title']) < 2) fail('Fatura unvanını (kurum ya da kişi adı) girin.');
    if (!in_array(strlen($b['tax_no']), [10, 11], true)) fail('Vergi numarası (10 hane) ya da T.C. kimlik numarası (11 hane) girin.');
    if (mb_strlen($b['address']) < 5 || mb_strlen($b['city']) < 2) fail('Fatura adresini ve ili girin.');
    if (!filter_var($b['email'], FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta girin (fatura ve makbuz buraya gönderilir).');
    if (strlen(preg_replace('/\D/', '', $b['phone'])) < 10) fail('Telefon numarasını girin.');
    return $b;
}

function a_billing_info_save(): void
{
    $me = bl_need_admin();
    $tk = (string)nm_tenant()['tkey'];
    $b = bl_billing_from_input();
    m_q('INSERT OR REPLACE INTO bl_billing (tkey, title, tax_office, tax_no, address, city, email, phone, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$tk, $b['title'], $b['tax_office'], $b['tax_no'], $b['address'], $b['city'], $b['email'], $b['phone'], now()]);
    audit($me, 'billing.info', $b['title']);
    out(['billing' => bl_billing($tk)]);
}

/** Ödemeyi başlat: paket + dönem + yöntem → PayTR iFrame / iyzico sayfası / havale bilgisi */
function a_billing_checkout(): void
{
    $me = bl_need_admin();
    $tk = (string)nm_tenant()['tkey'];
    $c = bl_cfg();
    $plan = bl_plan(i('plan_id'));
    if (!$plan || !$plan['active']) fail('Paket bulunamadı.');
    $period = s('period', 5) === 'year' ? 'year' : 'month';
    $prov = s('provider', 10);
    if (!in_array($prov, ['paytr', 'iyzico', 'havale'], true) || $c[$prov . '_on'] !== '1') fail('Bu ödeme yöntemi şu an kullanılamıyor.');
    if ($plan['is_free'] || bl_price($plan, $period)['total'] <= 0) fail('Bu paket ücretsiz; ödeme gerekmez.');
    if ($plan['max_users'] > 0 && ($n = (int)val("SELECT COUNT(*) FROM users WHERE status = 'active'")) > $plan['max_users'])
        fail('Biriminizde ' . $n . ' etkin kişi var; bu paket en çok ' . $plan['max_users'] . ' kişiyi kapsar. Daha büyük bir paket seçin.');
    $billing = bl_billing($tk);
    if ($billing['title'] === '' || $billing['tax_no'] === '') fail('Önce fatura bilgilerini kaydedin.');
    if (trim($c['terms']) !== '' && !b('accept')) fail('Ödemeye geçmek için mesafeli satış sözleşmesini ve ön bilgilendirme formunu onaylayın.');
    // Aynı yöntemle yarım kalmış eski denemeler kapanır (birikmesin)
    m_q("UPDATE bl_payments SET status = 'cancelled', note = 'Yeni ödeme başlatıldı', updated_at = ? WHERE tkey = ? AND status = 'pending' AND provider = ? AND provider <> 'havale'", [now(), $tk, $prov]);
    try { $pay = bl_pay_create($tk, $plan, $period, $prov, ['id' => $me['id'], 'name' => $me['name'], 'email' => $me['email']], $billing); }
    catch (RuntimeException $e) { fail($e->getMessage()); }
    if (trim($c['terms']) !== '') m_q('UPDATE bl_payments SET note = ? WHERE id = ?', ['Sözleşme onaylandı: ' . now() . ' · ' . $me['name'] . ' · IP ' . client_ip() . ' · metin ' . substr(hash('sha256', $c['terms']), 0, 12), $pay['id']]);
    $item = 'dupcii ' . $plan['name'] . ' · ' . BL_PERIODS[$period] . ' abonelik';
    $site = bl_site();
    try {
        if ($prov === 'paytr') {
            $url = bl_paytr_token($pay, $billing, client_ip(), $site . 'odeme.php?p=ok&oid=' . $pay['oid'], $site . 'odeme.php?p=fail&oid=' . $pay['oid'], $item);
            audit($me, 'billing.checkout', $item, 'PayTR · ' . bl_money((int)$pay['total']));
            out(['oid' => $pay['oid'], 'kind' => 'iframe', 'url' => $url, 'total' => (int)$pay['total']]);
        }
        if ($prov === 'iyzico') {
            $url = bl_iyzico_init($pay, $billing, $me, client_ip(), $site . 'odeme.php?p=iyzico', $item);
            audit($me, 'billing.checkout', $item, 'iyzico · ' . bl_money((int)$pay['total']));
            out(['oid' => $pay['oid'], 'kind' => 'redirect', 'url' => $url, 'total' => (int)$pay['total']]);
        }
    } catch (RuntimeException $e) {
        bl_pay_mark_failed($pay['oid'], $e->getMessage(), '');
        fail($e->getMessage());
    }
    // Havale / EFT: açıklamaya ödeme kodu yazılır; süper yönetici hesaba geçince onaylar
    audit($me, 'billing.checkout', $item, 'Havale · ' . bl_money((int)$pay['total']) . ' · ' . $pay['oid']);
    bl_notify_sa('Havale bildirimi bekleniyor', nm_tenant()['name'] . ': ' . $item . ' · ' . bl_money((int)$pay['total']) . ' · kod ' . $pay['oid']);
    out(['oid' => $pay['oid'], 'kind' => 'havale', 'text' => $c['havale_text'], 'total' => (int)$pay['total']]);
}

/** Ödemenin son durumu (iFrame açıkken yoklama) */
function a_billing_status(): void
{
    bl_need_admin();
    $p = m_one('SELECT * FROM bl_payments WHERE oid = ? AND tkey = ?', [s('oid', 40), (string)nm_tenant()['tkey']]) ?? fail('Ödeme bulunamadı.', 404);
    out(['payment' => bl_pay_out($p), 'state' => bl_public(current_user())]);
}

function a_billing_cancel(): void
{
    $me = bl_need_admin();
    $n = m_q("UPDATE bl_payments SET status = 'cancelled', note = 'Birim yöneticisi vazgeçti', updated_at = ? WHERE oid = ? AND tkey = ? AND status = 'pending'", [now(), s('oid', 40), (string)nm_tenant()['tkey']])->rowCount();
    if ($n) audit($me, 'billing.cancel', s('oid', 40));
    out(['ok' => $n === 1]);
}

/** Süper yöneticilere bilgi (sistem günlüğü; e-posta yoksa yalnız günlük) */
function bl_notify_sa(string $title, string $text): void
{
    try { m_q('INSERT INTO sa_audit (sa_id, action, target, detail, ip, at) VALUES (NULL, ?, ?, ?, ?, ?)', ['billing.note', mb_substr($title, 0, 200), mb_substr($text, 0, 500), client_ip(), now()]); } catch (Throwable $e) { /* */ }
}

/* =================================================================== */
/* Süper yönetici                                                       */
/* =================================================================== */

function bl_sa_units(): array
{
    $o = [];
    foreach (nm_tenants() as $t) {
        $st = bl_state((string)$t['tkey']);
        $sub = bl_sub((string)$t['tkey']);
        $stats = nm_tenant_stats($t);
        $o[] = ['key' => $t['tkey'], 'name' => $t['name'], 'hospital' => $t['hospital_name'] ?? '', 'frozen' => nm_tenant_frozen($t), 'status' => $sub['status'],
            'mode' => $sub['status'] === 'none' ? 'none' : ($st['enforce'] ? $st['mode'] : ($st['real_mode'] ?? 'open')), 'plan' => $st['plan']['name'] ?? null, 'plan_id' => $sub['plan_id'] !== null ? (int)$sub['plan_id'] : null,
            'period' => $sub['period'], 'ends' => $st['ends'], 'days_left' => $st['days_left'], 'users' => $stats['active_users'], 'note' => $sub['note']];
    }
    return $o;
}

function a_sa_billing(): void
{
    need_sa();
    bl_ensure();
    $c = bl_cfg();
    $cfg = $c;
    foreach (BL_SECRETS as $k) { $cfg[$k] = ''; $cfg[$k . '_set'] = $c[$k] !== ''; }
    $units = bl_sa_units();
    $pays = array_map(function ($p) { $o = bl_pay_out($p); $t = nm_tenant_by_key((string)$p['tkey']); $o['unit'] = $t ? $t['name'] : $p['tkey']; return $o; },
        m_all('SELECT * FROM bl_payments ORDER BY id DESC LIMIT 150'));
    // Özet: etkin ücretli birimler, denemeler, aylığa çevrilmiş tekrarlayan gelir (KDV hariç), bu ay tahsilat
    $sum = ['active' => 0, 'trial' => 0, 'expired' => 0, 'comp' => 0, 'mrr' => 0, 'month_paid' => 0, 'pending_havale' => 0];
    foreach ($units as $u) {
        $m = $u['mode'];
        if (in_array($m, ['active', 'grace'], true)) {
            $sum['active']++;
            $pl = bl_plan($u['plan_id']);
            if ($pl) $sum['mrr'] += $u['period'] === 'year' ? (int)round($pl['price_y'] / 12) : $pl['price_m'];
        } elseif ($m === 'trial') $sum['trial']++;
        elseif ($m === 'comp') $sum['comp']++;
        elseif (in_array($m, ['expired', 'free'], true)) $sum['expired']++;
    }
    $sum['month_paid'] = (int)m_val("SELECT COALESCE(SUM(total), 0) FROM bl_payments WHERE status = 'paid' AND paid_at >= ?", [date('Y-m-01 00:00:00')]);
    $sum['pending_havale'] = (int)m_val("SELECT COUNT(*) FROM bl_payments WHERE status = 'pending' AND provider = 'havale'");
    $mods = [];
    foreach (NM_MODULES as $k => [$name]) $mods[$k] = $name;
    $site = bl_site();
    out(['cfg' => $cfg, 'plans' => bl_plans(), 'units' => $units, 'payments' => $pays, 'summary' => $sum, 'modules' => $mods,
        'urls' => ['paytr_notify' => $site . 'odeme.php?p=paytr', 'iyzico_callback' => $site . 'odeme.php?p=iyzico'], 'curl' => function_exists('curl_init')]);
}

function a_sa_billing_cfg(): void
{
    $sa = need_sa();
    global $IN;
    $in = arr('cfg');
    $patch = [];
    foreach (['visible', 'enforce', 'trial_on', 'remind', 'havale_on', 'paytr_on', 'paytr_test', 'iyzico_on', 'iyzico_sandbox'] as $k) if (array_key_exists($k, $in)) $patch[$k] = !empty($in[$k]) ? '1' : '0';
    foreach (['trial_days' => [1, 365], 'grace_days' => [0, 60], 'kdv' => [0, 100]] as $k => [$lo, $hi]) if (array_key_exists($k, $in)) $patch[$k] = (string)max($lo, min($hi, (int)$in[$k]));
    if (array_key_exists('havale_text', $in)) $patch['havale_text'] = mb_substr(trim((string)$in['havale_text']), 0, 1000);
    if (array_key_exists('terms', $in)) $patch['terms'] = mb_substr(trim((string)$in['terms']), 0, 30000);
    if (array_key_exists('paytr_id', $in)) $patch['paytr_id'] = preg_replace('/\D/', '', (string)$in['paytr_id']);
    if (array_key_exists('iyzico_key', $in)) $patch['iyzico_key'] = mb_substr(trim((string)$in['iyzico_key']), 0, 200);
    foreach (BL_SECRETS as $k) if (isset($in[$k]) && trim((string)$in[$k]) !== '') $patch[$k] = mb_substr(trim((string)$in[$k]), 0, 200); // boş bırakılırsa eskisi kalır
    // Zorunluluk açılırken kaydı olmayan birimler için seçim: deneme başlat / ücretsiz tanımla / dokunma
    $was = bl_cfg()['enforce'];
    if (($patch['paytr_on'] ?? bl_cfg()['paytr_on']) === '1' && ((string)($patch['paytr_id'] ?? bl_cfg()['paytr_id']) === '' || (bl_cfg()['paytr_key'] === '' && empty($in['paytr_key'])))) fail('PayTR’yi açmak için mağaza numarası, anahtar ve gizli anahtarı girin.');
    if (($patch['iyzico_on'] ?? bl_cfg()['iyzico_on']) === '1' && ((string)($patch['iyzico_key'] ?? bl_cfg()['iyzico_key']) === '' || (bl_cfg()['iyzico_secret'] === '' && empty($in['iyzico_secret'])))) fail('iyzico’yu açmak için API anahtarı ve gizli anahtarı girin.');
    bl_cfg_set($patch);
    $done = '';
    if ($was !== '1' && ($patch['enforce'] ?? '0') === '1') {
        $what = s('none_action', 10);
        $n = 0;
        foreach (nm_tenants() as $t) {
            if (bl_sub((string)$t['tkey'])['status'] !== 'none') continue;
            if ($what === 'trial') { bl_start_trial((string)$t['tkey'], (int)bl_cfg()['trial_days'], 'SA:' . $sa['name']); $n++; }
            elseif ($what === 'comp') { bl_sub_put((string)$t['tkey'], ['status' => 'comp'], 'comp', 'Zorunluluk açılırken ücretsiz tanımlandı', 'SA:' . $sa['name']); $n++; }
        }
        $done = $n ? $n . ' birim için ' . ($what === 'trial' ? 'deneme başlatıldı' : 'ücretsiz tanımlandı') : '';
    }
    $keys = array_keys(array_diff_key($patch, array_flip(BL_SECRETS)));
    sa_audit($sa, 'billing.cfg', implode(', ', $keys), $done);
    $GLOBALS['IN'] = []; // a_sa_billing girdiye bakmaz
    a_sa_billing();
}

function a_sa_billing_plan(): void
{
    $sa = need_sa();
    bl_ensure();
    $id = (int)(i('id') ?? 0);
    $name = s('name', 80);
    $code = preg_replace('/[^a-z0-9_-]/', '', strtolower(s('code', 30)));
    if (mb_strlen($name) < 2) fail('Paket adını girin.');
    if ($code === '') $code = substr(preg_replace('/[^a-z0-9]/', '', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) ?: 'paket')), 0, 20) . substr(bin2hex(random_bytes(2)), 0, 4);
    $lira = fn($v) => (int)round(max(0, min(10000000, (float)str_replace(',', '.', (string)$v))) * 100);
    $pm = $lira($GLOBALS['IN']['price_m'] ?? 0);
    $py = $lira($GLOBALS['IN']['price_y'] ?? 0);
    $mods = arr('modules');
    $all = !empty($GLOBALS['IN']['all_modules']);
    $mods = $all ? null : array_values(array_intersect(array_keys(NM_MODULES), array_map('strval', $mods)));
    $free = b('is_free') ? 1 : 0;
    if (!$free && $pm <= 0 && $py <= 0) fail('Ücretli paket için aylık ya da yıllık fiyat girin (ya da “ücretsiz paket” işaretleyin).');
    if ($free) { $pm = 0; $py = 0; m_q('UPDATE bl_plans SET is_free = 0 WHERE id <> ?', [$id]); } // tek ücretsiz paket (süresi dolanların düştüğü)
    $row = [$code, $name, s('descr', 400), $pm, $py, max(0, (int)(i('max_users') ?? 0)), $mods === null ? null : json_encode($mods), $free, b('active') ? 1 : 0, (int)(i('sort') ?? 0), now()];
    if ($id) {
        if (!m_one('SELECT id FROM bl_plans WHERE id = ?', [$id])) fail('Paket bulunamadı.', 404);
        if (m_one('SELECT id FROM bl_plans WHERE code = ? AND id <> ?', [$code, $id])) fail('Bu kod başka pakette kullanılıyor.');
        m_q('UPDATE bl_plans SET code = ?, name = ?, descr = ?, price_m = ?, price_y = ?, max_users = ?, modules = ?, is_free = ?, active = ?, sort = ?, updated_at = ? WHERE id = ?', [...$row, $id]);
    } else {
        if (m_one('SELECT id FROM bl_plans WHERE code = ?', [$code])) fail('Bu kod başka pakette kullanılıyor.');
        m_q('INSERT INTO bl_plans (code, name, descr, price_m, price_y, max_users, modules, is_free, active, sort, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...$row, now()]);
    }
    sa_audit($sa, 'billing.plan', $name, 'aylık ' . bl_money($pm) . ' · yıllık ' . bl_money($py));
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

function a_sa_billing_plan_del(): void
{
    $sa = need_sa();
    $p = bl_plan(i('id')) ?? fail('Paket bulunamadı.', 404);
    $used = (int)m_val('SELECT COUNT(*) FROM bl_subs WHERE plan_id = ?', [$p['id']]) + (int)m_val('SELECT COUNT(*) FROM bl_payments WHERE plan_id = ?', [$p['id']]);
    if ($used) { m_q('UPDATE bl_plans SET active = 0, updated_at = ? WHERE id = ?', [now(), $p['id']]); sa_audit($sa, 'billing.plan.off', $p['name'], 'kullanımda; satıştan kaldırıldı'); }
    else { m_q('DELETE FROM bl_plans WHERE id = ?', [$p['id']]); sa_audit($sa, 'billing.plan.del', $p['name']); }
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

/** Birim aboneliği: deneme / etkinleştir / uzat / ücretsiz / askıya al / sıfırla */
function a_sa_billing_sub(): void
{
    $sa = need_sa();
    $t = nm_tenant_by_key(s('key', 40)) ?? fail('Birim bulunamadı.', 404);
    $tk = (string)$t['tkey'];
    $who = 'SA:' . $sa['name'];
    $note = s('note', 300);
    $op = s('op', 12);
    $sub = bl_sub($tk);
    switch ($op) {
        case 'trial':
            bl_start_trial($tk, (int)(i('days') ?? (int)bl_cfg()['trial_days']), $who);
            break;
        case 'activate': // paket + (1 ay | 1 yıl | belirli tarihe kadar)
            $plan = bl_plan(i('plan_id')) ?? fail('Paketi seçin.');
            $until = s('until', 10);
            if ($until !== '') {
                if (!valid_ymd($until) || $until < date('Y-m-d')) fail('Geçerli bir bitiş tarihi seçin.');
                bl_sub_put($tk, ['plan_id' => $plan['id'], 'status' => 'active', 'period' => s('period', 5) === 'year' ? 'year' : 'month', 'current_end' => $until . ' 23:59:59', 'started_at' => $sub['started_at'] ?? now(), 'reminded' => ''],
                    'activate', $plan['name'] . ' · ' . date('d.m.Y', strtotime($until)) . ' tarihine kadar' . ($note ? ' · ' . $note : ''), $who);
            } else {
                $period = s('period', 5) === 'year' ? 'year' : 'month';
                bl_extend($tk, $plan['id'], $period, $plan['name'] . ' · ' . BL_PERIODS[$period] . ' (elle)' . ($note ? ' · ' . $note : ''), $who, max(1, min(36, (int)(i('n') ?? 1))));
            }
            break;
        case 'extend': // gün ekle (deneme ya da etkin)
            $days = max(1, min(730, (int)(i('days') ?? 0)));
            if ($sub['status'] === 'trial') bl_sub_put($tk, ['trial_ends' => date('Y-m-d H:i:s', max(time(), strtotime((string)$sub['trial_ends'] ?: 'now')) + $days * 86400), 'reminded' => ''], 'extend', 'Deneme +' . $days . ' gün' . ($note ? ' · ' . $note : ''), $who);
            elseif ($sub['status'] === 'active') bl_sub_put($tk, ['current_end' => date('Y-m-d H:i:s', max(time(), strtotime((string)$sub['current_end'] ?: 'now')) + $days * 86400), 'reminded' => ''], 'extend', '+' . $days . ' gün' . ($note ? ' · ' . $note : ''), $who);
            else fail('Uzatmak için birim denemede ya da etkin olmalı.');
            break;
        case 'comp':
            bl_sub_put($tk, ['status' => 'comp', 'plan_id' => i('plan_id') ?: $sub['plan_id']], 'comp', 'Ücretsiz tanımlandı' . ($note ? ' · ' . $note : ''), $who);
            break;
        case 'suspend':
            bl_sub_put($tk, ['status' => 'suspended'], 'suspend', 'Askıya alındı' . ($note ? ' · ' . $note : ''), $who);
            break;
        case 'reset':
            bl_sub_put($tk, ['status' => 'none', 'plan_id' => null, 'period' => null, 'trial_ends' => null, 'current_end' => null, 'reminded' => ''], 'reset', 'Abonelik kaydı sıfırlandı' . ($note ? ' · ' . $note : ''), $who);
            break;
        case 'note':
            bl_sub_put($tk, ['note' => $note], 'note', $note, $who);
            break;
        default: fail('Geçersiz işlem.');
    }
    sa_audit($sa, 'billing.sub', $t['name'], $op . ($note ? ' · ' . $note : ''));
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

/** Kaydı olmayan tüm birimlere deneme */
function a_sa_billing_bulk(): void
{
    $sa = need_sa();
    $days = max(1, min(365, (int)(i('days') ?? (int)bl_cfg()['trial_days'])));
    $n = 0;
    foreach (nm_tenants() as $t) if (bl_sub((string)$t['tkey'])['status'] === 'none') { bl_start_trial((string)$t['tkey'], $days, 'SA:' . $sa['name']); $n++; }
    sa_audit($sa, 'billing.bulk', $n . ' birim', $days . ' gün deneme');
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

/** Ödeme işlemleri: havale onayı / iptal / iade işareti / fatura no */
function a_sa_billing_pay(): void
{
    $sa = need_sa();
    bl_ensure();
    $p = m_one('SELECT * FROM bl_payments WHERE id = ?', [(int)i('id')]) ?? fail('Ödeme bulunamadı.', 404);
    $op = s('op', 10);
    if ($op === 'paid') {
        if ($p['status'] !== 'pending') fail('Yalnız bekleyen ödeme onaylanır.');
        bl_pay_mark_paid((string)$p['oid'], 'elle:' . s('ref', 80), 0, '', 'SA:' . $sa['name']) || fail('Ödeme işlenemedi.');
        bl_unit_notify((string)$p['tkey'], 'Ödemeniz alındı', bl_money((int)$p['total']) . ' ödemeniz onaylandı; aboneliğiniz uzatıldı.');
    } elseif ($op === 'cancel') {
        m_q("UPDATE bl_payments SET status = 'cancelled', note = ?, updated_at = ? WHERE id = ? AND status = 'pending'", ['SA iptal: ' . s('note', 200), now(), $p['id']]);
    } elseif ($op === 'refund') {
        if ($p['status'] !== 'paid') fail('Yalnız ödenmiş kayıt iade edildi olarak işaretlenir.');
        m_q("UPDATE bl_payments SET status = 'refunded', note = ?, updated_at = ? WHERE id = ?", ['İade: ' . s('note', 200), now(), $p['id']]);
        m_q('INSERT INTO bl_events (tkey, kind, detail, who, at) VALUES (?, ?, ?, ?, ?)', [$p['tkey'], 'refund', bl_money((int)$p['total']) . ' iade edildi (süreyi gerekirse elle kısaltın)', 'SA:' . $sa['name'], now()]);
    } elseif ($op === 'invoice') {
        m_q('UPDATE bl_payments SET invoice_no = ?, updated_at = ? WHERE id = ?', [s('invoice_no', 60), now(), $p['id']]);
    } else fail('Geçersiz işlem.');
    sa_audit($sa, 'billing.pay', $p['oid'], $op);
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

function a_sa_billing_events(): void
{
    need_sa();
    bl_ensure();
    $tk = s('key', 40);
    out(['events' => m_all('SELECT kind, detail, who, at FROM bl_events WHERE tkey = ? ORDER BY id DESC LIMIT 100', [$tk]),
        'payments' => array_map('bl_pay_out', m_all('SELECT * FROM bl_payments WHERE tkey = ? ORDER BY id DESC LIMIT 100', [$tk])), 'billing' => bl_billing($tk)]);
}

/* =================================================================== */
/* Bildirim: birim yöneticilerine                                       */
/* =================================================================== */

function bl_outbox_flush(): void
{
    $tk = (string)nm_tenant()['tkey'];
    $rows = m_all('SELECT * FROM bl_outbox WHERE tkey = ? AND sent_at IS NULL ORDER BY id LIMIT 20', [$tk]);
    if (!$rows) return;
    $admins = all("SELECT * FROM users WHERE role = 'admin' AND status = 'active'");
    foreach ($rows as $r) {
        if (m_q('UPDATE bl_outbox SET sent_at = ? WHERE id = ? AND sent_at IS NULL', [now(), $r['id']])->rowCount() !== 1) continue;
        if ($admins && function_exists('notify_users')) notify_users($admins, 'billing', (string)$r['title'], (string)$r['body'], '#/abonelik',
            ['subject' => (string)$r['title'], 'heading' => (string)$r['title'], 'lines' => [(string)$r['body']], 'button' => 'Aboneliği gör'], 'notoff');
    }
}

/** Hatırlatma: deneme / abonelik bitmeden 7, 3, 1 gün önce ve bittiğinde (birim yöneticilerine, her eşik bir kez) */
$GLOBALS['NM_JOBS']['billing_remind'] = function (bool $force) {
    if (!bl_on()) return;
    try { bl_ensure(); bl_outbox_flush(); } catch (Throwable $e) { error_log('[dupcii] abonelik kuyruğu: ' . $e->getMessage()); }
    $c = bl_cfg();
    if ($c['remind'] !== '1' || ($c['visible'] !== '1' && $c['enforce'] !== '1')) return;
    $tk = (string)nm_tenant()['tkey'];
    $st = bl_state($tk);
    $sub = bl_sub($tk);
    $end = $st['ends'];
    if (!$end || !in_array($sub['status'], ['trial', 'active'], true)) return;
    $d = bl_days_left($end);
    $step = $d <= 0 ? 0 : ($d <= 1 ? 1 : ($d <= 3 ? 3 : ($d <= 7 ? 7 : null)));
    if ($step === null) return;
    $tag = substr((string)$end, 0, 10) . ':' . $step;
    if (in_array($tag, explode(',', (string)$sub['reminded']), true)) return;
    m_q('UPDATE bl_subs SET reminded = ? WHERE tkey = ?', [trim($sub['reminded'] . ',' . $tag, ','), $tk]);
    $what = $sub['status'] === 'trial' ? 'Deneme süreniz' : 'Aboneliğiniz';
    $txt = $step === 0 ? $what . ' sona erdi.' . ($st['enforce'] ? ' Kesintisiz kullanım için aboneliği yenileyin.' : '') : $what . ' ' . $d . ' gün sonra (' . date('d.m.Y', strtotime((string)$end)) . ') bitiyor.';
    bl_unit_notify($tk, $step === 0 ? $what . ' sona erdi' : $what . ' bitiyor', $txt . ' Ayarlar › Abonelik’ten paket seçip ödeme yapabilirsiniz.');
};

return [
    'billing.page' => 'a_billing_page',
    'billing.info.save' => 'a_billing_info_save',
    'billing.checkout' => 'a_billing_checkout',
    'billing.status' => 'a_billing_status',
    'billing.cancel' => 'a_billing_cancel',
    'sa.billing' => 'a_sa_billing',
    'sa.billing.cfg' => 'a_sa_billing_cfg',
    'sa.billing.plan' => 'a_sa_billing_plan',
    'sa.billing.plan.del' => 'a_sa_billing_plan_del',
    'sa.billing.sub' => 'a_sa_billing_sub',
    'sa.billing.bulk' => 'a_sa_billing_bulk',
    'sa.billing.pay' => 'a_sa_billing_pay',
    'sa.billing.events' => 'a_sa_billing_events',
];
