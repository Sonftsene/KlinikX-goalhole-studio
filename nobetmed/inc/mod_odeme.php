<?php
/**
 * Abonelik ve ödeme (4.15; 4.32'den itibaren KİŞİ BAZLI) — uygulama uçları, süper yönetici uçları, kısıtlamalar ve hatırlatmalar.
 * Kütüphane: inc/billing.php. Ödeme sağlayıcısı dönüşleri: odeme.php.
 * Her kişi kendi aboneliğini öder (anahtar "birim#u<no>"); sistem yöneticisi bir birimin tamamını ücretsiz tanımlayabilir / ödeyebilir.
 */
declare(strict_types=1);
require_once __DIR__ . '/billing.php';

function bl_open_state(): array
{
    return ['enforce' => false, 'visible' => false, 'mode' => 'open', 'modules' => null, 'max_users' => 0, 'read_only' => false, 'status' => 'none', 'plan' => null, 'ends' => null, 'days_left' => null];
}

/** Giriş yapmış kişinin abonelik durumu (istek boyunca önbellekli). Birimin tamamı ücretsiz / ödenmişse kişi de kapsanır. */
/**
 * Ortak işler: paketinde olmasa da kişi bu modüllerde başkasının başlattığına YANIT verebilir (görür, cevaplar, katılır);
 * yalnız burada sayılan başlatma eylemleri ücretli pakette. Birebir sohbet: yeni sohbet açmak başlatmadır (mod_mesaj a_chat_direct).
 */
const BL_SHARED = [
    'mesaj' => ['chat.create', 'chat.forward', 'chat.share', 'chat.survey', 'call.start'],
    'ilan' => ['listing.create', 'swap.request', 'extra.take.ask'],
    'eksik' => ['callout.create', 'callout.ask'],
];
const BL_REPLY_MSG = 'Bu işlemi başlatmak ücretli pakette. Size gelen mesaj, ilan, değişim ve çağrılara yanıt verebilirsiniz; Abonelik sayfasından paket seçebilirsiniz.';

/** Yönetici ya da sorumlu mu (birim yöneticisi, yayıncı, herhangi bir modülü yöneten özel rol): her zaman kapsamda */
function bl_is_staff(array $me): bool
{
    if (in_array($me['role'] ?? '', ['admin', 'editor'], true)) return true;
    if (!function_exists('role_perms')) return false;
    $rp = role_perms(isset($me['role_id']) ? (int)$me['role_id'] : null);
    return is_array($rp) && in_array('manage', $rp, true);
}

/** Pakette olmayan ortak modüller "yalnız yanıt" olarak açılır */
function bl_apply_shared(array $s): array
{
    $s['reply_only'] = [];
    if (!is_array($s['modules'] ?? null)) return $s;
    foreach (array_keys(BL_SHARED) as $m) if (!in_array($m, $s['modules'], true)) { $s['modules'][] = $m; $s['reply_only'][] = $m; }
    return $s;
}
function bl_reply_only(string $m): bool { return bl_on() && in_array($m, bl_state_cur()['reply_only'] ?? [], true); }

function bl_state_cur(): array
{
    static $s = null;
    if ($s !== null) return $s;
    if (!bl_on()) return $s = bl_open_state();
    try {
        $c = bl_cfg();
        $me = function_exists('current_user') ? current_user() : null;
        if (!$me || !empty($me['sa_virtual']) || !empty($_SESSION['sa_in'])) {
            $o = bl_open_state();
            $o['visible'] = $c['visible'] === '1' || $c['enforce'] === '1';
            return $s = $o;
        }
        $tk = (string)nm_tenant()['tkey'];
        // Birim kaydı (sistem yöneticisi tanımı): ücretsiz ya da süresi geçmemiş ödeme → herkes kapsanır
        $unit = bl_sub($tk);
        if (in_array($unit['status'], ['comp', 'active'], true)) {
            $us = bl_state($tk);
            if (in_array($us['real_mode'] ?? $us['mode'], ['comp', 'active', 'grace'], true)) return $s = bl_apply_shared($us + ['sponsor' => true]);
        }
        $key = bl_pkey($tk, (int)$me['id']);
        $staff = bl_is_staff($me);
        $sub = bl_sub($key);
        if ($staff) {
            // Yönetici / sorumlu: birim onlarsız işlemez → her zaman ücretsiz, tam yetki (otomatik deneme başlatılmaz)
            if ($sub['status'] !== 'none') $s = bl_state($key);
            else { $s = bl_open_state(); $s['enforce'] = $c['enforce'] === '1'; $s['visible'] = $c['visible'] === '1' || $c['enforce'] === '1'; }
            if ($s['enforce']) { $s['mode'] = 'comp'; $s['modules'] = null; $s['read_only'] = false; }
            $s['staff'] = true;
        } else {
            $s = bl_state($key);
        }
        // Sistem yöneticisi listesinde ad, e-posta ve görev görünsün
        $sub = bl_sub($key);
        $nm = mb_substr((string)$me['name'], 0, 120);
        $em = mb_substr((string)$me['email'], 0, 190);
        $rl = $staff ? 'staff' : '';
        if ($sub['updated_at'] === null) bl_sub_put($key, ['name' => $nm, 'email' => $em, 'role' => $rl, 'acct' => ''], 'seen', 'İlk giriş', 'sistem'); // deneme kapalıyken de listede görünsün
        elseif ((string)($sub['name'] ?? '') !== $nm || (string)($sub['email'] ?? '') !== $em || (string)($sub['role'] ?? '') !== $rl || (string)($sub['acct'] ?? '') !== '')
            m_q("UPDATE bl_subs SET name = ?, email = ?, role = ?, acct = '' WHERE tkey = ?", [$nm, $em, $rl, $key]);
        $s['max_users'] = 0;
        $s = bl_apply_shared($s);
    } catch (Throwable $e) {
        error_log('[dupcii] abonelik durumu: ' . $e->getMessage());
        $s = bl_open_state();
    }
    return $s;
}

/** Açılış verisi / durum özeti (her kişiye kendi aboneliği) */
function bl_public(?array $me): array
{
    $s = bl_state_cur();
    // Zorunluluk kapalıyken de gerçek durum gösterilir (ödeme yapan "Etkin", denemedeki "Deneme")
    $disp = $s['mode'];
    if (!$s['enforce']) $disp = in_array($s['real_mode'] ?? '', ['active', 'trial', 'comp', 'grace'], true) ? $s['real_mode'] : ($s['status'] === 'none' ? 'none' : 'open');
    $txt = BL_MODE_TXT[$disp] ?? $disp;
    if (!empty($s['staff']) && !in_array($disp, ['active', 'grace'], true)) { $disp = 'comp'; $txt = 'Yönetici / sorumlu: ücretsiz'; }
    return ['visible' => (bool)$s['visible'], 'enforce' => (bool)$s['enforce'], 'mode' => $s['mode'], 'disp' => $disp, 'mode_txt' => $txt,
        'staff' => !empty($s['staff']), 'reply_only' => array_values($s['reply_only'] ?? []),
        'status' => $s['status'], 'plan' => $s['plan'] ? ['id' => $s['plan']['id'], 'name' => $s['plan']['name']] : null, 'ends' => $s['ends'], 'days_left' => $s['days_left'],
        'grace_until' => $s['grace_until'] ?? null, 'read_only' => (bool)$s['read_only'], 'max_users' => 0, 'sponsor' => !empty($s['sponsor']), 'personal' => true,
        'can_pay' => $me && empty($me['sa_virtual']) && $s['visible']];
}

$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (!bl_on()) return [];
    return ['billing' => bl_public($me)];
};

/**
 * Dağıtıcıdan önce: aboneliği bitmiş ve ücretsiz paket tanımlı olmayan kişi salt okunurdur.
 * Okuma uçları, giriş/hesap işlemleri ve ödeme serbest; sistem yöneticisi birime girdiyse kısıtlanmaz.
 */
function bl_gate(string $action): void
{
    if (!bl_on() || !empty($_SESSION['sa_in'])) return;
    $s = bl_state_cur();
    // Paketinde olmayan ortak modülde yalnız yanıt: başlatma eylemleri ücretli pakette
    foreach ($s['reply_only'] ?? [] as $m) if (in_array($action, BL_SHARED[$m] ?? [], true)) fail(BL_REPLY_MSG, 402);
    if (!$s['read_only']) return;
    if (nm_read_action($action)) return;
    if (strncmp($action, 'sp.', 3) === 0) return; // destek talebi abonelik bitse de açılabilir
    fail('Aboneliğiniz sona erdi; uygulama yalnız görüntülenebilir. Hesabım › Abonelik’ten yenileyebilirsiniz.', 402);
}

/** Kişi bazlı abonelikte birimde kişi sınırı yok (eski birim paketlerinin sınırı uygulanmaz) */
function bl_user_room(int $adding = 1): ?string
{
    return null;
}

/* =================================================================== */
/* Kişi: abonelik sayfası ve ödeme                                      */
/* =================================================================== */

function bl_need_payer(): array
{
    $me = need_user();
    if (!bl_on()) fail('Abonelik bu kurulumda kullanılmıyor.', 404);
    if (!empty($me['sa_virtual'])) fail('Sistem yöneticisi birime girmişken abonelik işlemi yapılmaz.', 403);
    if (!bl_state_cur()['visible']) fail('Abonelik henüz açılmadı.', 403);
    return $me;
}
/** Giriş yapan kişinin abone anahtarı */
function bl_my_key(array $me): string { return bl_pkey((string)nm_tenant()['tkey'], (int)$me['id']); }

function a_billing_page(): void
{
    $me = bl_need_payer();
    $key = bl_my_key($me);
    $c = bl_cfg();
    $plans = bl_plans(true);
    $prov = [];
    if ($c['paytr_on'] === '1') $prov[] = ['key' => 'paytr', 'name' => 'Kredi / banka kartı (PayTR)'];
    if ($c['iyzico_on'] === '1') $prov[] = ['key' => 'iyzico', 'name' => 'Kredi / banka kartı (iyzico)'];
    if ($c['havale_on'] === '1') $prov[] = ['key' => 'havale', 'name' => 'Havale / EFT'];
    $pays = array_map('bl_pay_out', m_all('SELECT * FROM bl_payments WHERE tkey = ? ORDER BY id DESC LIMIT 60', [$key]));
    $mods = [];
    foreach (NM_MODULES as $k => [$name]) $mods[$k] = $name;
    $bill = bl_billing($key);
    if ($bill['title'] === '') { $bill['title'] = (string)$me['name']; }
    if ($bill['email'] === '') { $bill['email'] = (string)$me['email']; }
    out(['state' => bl_public($me), 'plans' => array_map(fn($p) => $p + ['prices' => array_combine(array_column($p['durations'], 'period'), array_map(fn($d) => bl_price($p, $d['period']), $p['durations'])) ?: (object)[]], $plans),
        'providers' => $prov, 'kdv' => (float)$c['kdv'], 'billing' => $bill, 'payments' => $pays, 'modules' => $mods,
        'havale_text' => $c['havale_on'] === '1' ? $c['havale_text'] : '', 'terms' => $c['terms']]);
}

function bl_billing_from_input(): array
{
    $b = ['title' => s('title', 160), 'tax_office' => s('tax_office', 80), 'tax_no' => preg_replace('/\D/', '', s('tax_no', 20)), 'address' => s('address', 400),
        'city' => s('city', 60), 'email' => s('email', 190), 'phone' => preg_replace('/[^0-9+]/', '', s('phone', 30))];
    if (mb_strlen($b['title']) < 2) fail('Faturadaki adı (ad soyad ya da kurum) girin.');
    if (!in_array(strlen($b['tax_no']), [10, 11], true)) fail('T.C. kimlik numarası (11 hane) ya da vergi numarası (10 hane) girin.');
    if (mb_strlen($b['address']) < 5 || mb_strlen($b['city']) < 2) fail('Fatura adresini ve ili girin.');
    if (!filter_var($b['email'], FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta girin (fatura ve makbuz buraya gönderilir).');
    if (strlen(preg_replace('/\D/', '', $b['phone'])) < 10) fail('Telefon numarasını girin.');
    return $b;
}

function a_billing_info_save(): void
{
    $me = bl_need_payer();
    $key = bl_my_key($me);
    $b = bl_billing_from_input();
    m_q('INSERT OR REPLACE INTO bl_billing (tkey, title, tax_office, tax_no, address, city, email, phone, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$key, $b['title'], $b['tax_office'], $b['tax_no'], $b['address'], $b['city'], $b['email'], $b['phone'], now()]);
    audit($me, 'billing.info', $b['title']);
    out(['billing' => bl_billing($key)]);
}

/** Ödemeyi başlat: paket + süre (m1, m3, m12…) + yöntem → PayTR iFrame / iyzico sayfası / havale bilgisi */
function a_billing_checkout(): void
{
    $me = bl_need_payer();
    $key = bl_my_key($me);
    $c = bl_cfg();
    $plan = bl_plan(i('plan_id'));
    if (!$plan || !$plan['active']) fail('Paket bulunamadı.');
    $period = s('period', 5);
    if ($period === 'month') $period = 'm1'; elseif ($period === 'year') $period = 'm12';
    if (!in_array($period, array_column($plan['durations'], 'period'), true)) fail('Bu paket için bu süre satışta değil.');
    $prov = s('provider', 10);
    if (!in_array($prov, ['paytr', 'iyzico', 'havale'], true) || $c[$prov . '_on'] !== '1') fail('Bu ödeme yöntemi şu an kullanılamıyor.');
    if ($plan['is_free'] || bl_price($plan, $period)['total'] <= 0) fail('Bu paket ücretsiz; ödeme gerekmez.');
    $billing = bl_billing($key);
    if ($billing['title'] === '' || $billing['tax_no'] === '') fail('Önce fatura bilgilerini kaydedin.');
    if (trim($c['terms']) !== '' && !b('accept')) fail('Ödemeye geçmek için mesafeli satış sözleşmesini ve ön bilgilendirme formunu onaylayın.');
    // Aynı yöntemle yarım kalmış eski denemeler kapanır (birikmesin)
    m_q("UPDATE bl_payments SET status = 'cancelled', note = 'Yeni ödeme başlatıldı', updated_at = ? WHERE tkey = ? AND status = 'pending' AND provider = ? AND provider <> 'havale'", [now(), $key, $prov]);
    try { $pay = bl_pay_create($key, $plan, $period, $prov, ['id' => $me['id'], 'name' => $me['name'], 'email' => $me['email']], $billing); }
    catch (RuntimeException $e) { fail($e->getMessage()); }
    if (trim($c['terms']) !== '') m_q('UPDATE bl_payments SET note = ? WHERE id = ?', ['Sözleşme onaylandı: ' . now() . ' · ' . $me['name'] . ' · IP ' . client_ip() . ' · metin ' . substr(hash('sha256', $c['terms']), 0, 12), $pay['id']]);
    // Abone kaydında ad / e-posta (sistem yöneticisi listesi)
    if (bl_sub($key)['status'] === 'none') bl_sub_put($key, ['name' => $me['name'], 'email' => $me['email']], 'note', 'Ödeme başlatıldı', $me['name']);
    $item = 'dupcii ' . $plan['name'] . ' · ' . bl_period_label($period) . ' abonelik';
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
    bl_notify_sa('Havale bildirimi bekleniyor', $me['name'] . ' (' . nm_tenant()['name'] . '): ' . $item . ' · ' . bl_money((int)$pay['total']) . ' · kod ' . $pay['oid']);
    out(['oid' => $pay['oid'], 'kind' => 'havale', 'text' => $c['havale_text'], 'total' => (int)$pay['total']]);
}

/** Ödemenin son durumu (iFrame açıkken yoklama) */
function a_billing_status(): void
{
    $me = bl_need_payer();
    $p = m_one('SELECT * FROM bl_payments WHERE oid = ? AND tkey = ?', [s('oid', 40), bl_my_key($me)]) ?? fail('Ödeme bulunamadı.', 404);
    out(['payment' => bl_pay_out($p), 'state' => bl_public($me)]);
}

function a_billing_cancel(): void
{
    $me = bl_need_payer();
    $n = m_q("UPDATE bl_payments SET status = 'cancelled', note = 'Kişi vazgeçti', updated_at = ? WHERE oid = ? AND tkey = ? AND status = 'pending'", [now(), s('oid', 40), bl_my_key($me)])->rowCount();
    if ($n) audit($me, 'billing.cancel', s('oid', 40));
    out(['ok' => $n === 1]);
}

/** Birimde kişi silindi / devre dışı / yeniden etkin: abonelik kaydına işaret; ödenmiş süresi varsa süper yöneticiye bilgi (iade kararı) */
function bl_acct_mark(int $uid, string $acct): void
{
    if (!bl_on()) return;
    try {
        $t = nm_tenant();
        $key = bl_pkey((string)$t['tkey'], $uid);
        $sub = bl_sub($key);
        if ($sub['updated_at'] === null || (string)($sub['acct'] ?? '') === $acct) return;
        m_q('UPDATE bl_subs SET acct = ? WHERE tkey = ?', [$acct, $key]);
        if ($acct === 'deleted') {
            // Silinen hesabın kaydı ayrı anahtara alınır: aynı numarayla açılacak yeni hesap eskisinin aboneliğini devralmasın
            $old = $key;
            $key = (string)$t['tkey'] . '#x' . time() . '#u' . $uid;
            foreach (['bl_subs', 'bl_payments', 'bl_billing', 'bl_events', 'bl_outbox'] as $tb) m_q("UPDATE $tb SET tkey = ? WHERE tkey = ?", [$key, $old]);
        }
        m_q('INSERT INTO bl_events (tkey, kind, detail, who, at) VALUES (?, ?, ?, ?, ?)', [$key, 'acct', $acct === '' ? 'Hesap yeniden etkin' : ($acct === 'deleted' ? 'Hesap birimden silindi' : 'Hesap devre dışı bırakıldı'), 'birim', now()]);
        $paid = $sub['status'] === 'active' && $sub['current_end'] && $sub['current_end'] > now();
        if ($acct !== '' && $paid && function_exists('bl_notify_sa'))
            bl_notify_sa('Ödenmiş aboneliği olan hesap ' . ($acct === 'deleted' ? 'silindi' : 'devre dışı'), ((string)$sub['name'] ?: 'Kişi') . ' (' . $t['name'] . ') · bitiş ' . date('d.m.Y', strtotime((string)$sub['current_end'])) . '. Kişi başka birimde hesap açtıysa Abonelik › Kişiler › İşlemler › Diğer › Taşı; değilse iade kararını verin.');
    } catch (Throwable $e) { error_log('[dupcii] abonelik hesap işareti: ' . $e->getMessage()); }
}

/** Süper yöneticilere bilgi (sistem günlüğü; e-posta yoksa yalnız günlük) */
function bl_notify_sa(string $title, string $text): void
{
    try { m_q('INSERT INTO sa_audit (sa_id, action, target, detail, ip, at) VALUES (NULL, ?, ?, ?, ?, ?)', ['billing.note', mb_substr($title, 0, 200), mb_substr($text, 0, 500), client_ip(), now()]); } catch (Throwable $e) { /* */ }
}

/* =================================================================== */
/* Süper yönetici                                                       */
/* =================================================================== */

/** Birimler: birimin tamamı için tanım (ücretsiz / ödenmiş) — kişi bazlı aboneliğin üstünde */
function bl_sa_units(): array
{
    $o = [];
    foreach (nm_tenants() as $t) {
        $sub = bl_sub((string)$t['tkey']);
        $st = $sub['status'] !== 'none' ? bl_state((string)$t['tkey']) : null;
        $stats = nm_tenant_stats($t);
        $o[] = ['key' => $t['tkey'], 'name' => $t['name'], 'hospital' => $t['hospital_name'] ?? '', 'frozen' => nm_tenant_frozen($t), 'status' => $sub['status'],
            'mode' => $st ? ($st['real_mode'] ?? $st['mode']) : 'none', 'plan' => $st['plan']['name'] ?? null, 'plan_id' => $sub['plan_id'] !== null ? (int)$sub['plan_id'] : null,
            'period' => $sub['period'], 'period_txt' => $sub['period'] ? bl_period_label((string)$sub['period']) : null, 'ends' => $st['ends'] ?? null, 'days_left' => $st['days_left'] ?? null,
            'users' => $stats['active_users'], 'note' => $sub['note']];
    }
    return $o;
}

/** Kişiler: abonelik kaydı olan herkes (deneme ilk girişte başlar) */
function bl_sa_people(): array
{
    $units = [];
    foreach (nm_tenants() as $t) $units[(string)$t['tkey']] = $t;
    $o = [];
    foreach (m_all("SELECT * FROM bl_subs WHERE tkey LIKE '%#u%' ORDER BY updated_at DESC LIMIT 2000") as $sub) {
        $tk = bl_key_tkey((string)$sub['tkey']);
        if (!isset($units[$tk])) continue;
        // Kaydı sıfırlanmış kişide listelemek denemeyi yeniden başlatmasın
        $st = $sub['status'] !== 'none' ? bl_state((string)$sub['tkey']) : ['enforce' => false, 'mode' => 'none', 'real_mode' => 'none', 'plan' => null, 'ends' => null, 'days_left' => null];
        $o[] = ['key' => $sub['tkey'], 'name' => (string)($sub['name'] ?? '') ?: 'Kişi #' . bl_key_uid((string)$sub['tkey']), 'email' => (string)($sub['email'] ?? ''),
            'unit' => $units[$tk]['name'], 'hospital' => $units[$tk]['hospital_name'] ?? '', 'status' => $sub['status'],
            'mode' => $sub['status'] === 'none' ? 'none' : ($st['enforce'] ? $st['mode'] : ($st['real_mode'] ?? 'open')), 'plan' => $st['plan']['name'] ?? null, 'plan_id' => $sub['plan_id'] !== null ? (int)$sub['plan_id'] : null,
            'period' => $sub['period'], 'period_txt' => $sub['period'] ? bl_period_label((string)$sub['period']) : null, 'ends' => $st['ends'], 'days_left' => $st['days_left'], 'note' => $sub['note'],
            'staff' => ($sub['role'] ?? '') === 'staff', 'acct' => (string)($sub['acct'] ?? '')];
    }
    return $o;
}

/** Aylığa çevrilmiş fiyat (kuruş) */
function bl_monthly(?array $plan, ?string $period): int
{
    if (!$plan) return 0;
    $mo = bl_months($period);
    return (int)round(bl_price($plan, 'm' . $mo)['net'] / max(1, $mo));
}

function a_sa_billing(): void
{
    need_sa();
    bl_ensure();
    $c = bl_cfg();
    $cfg = $c;
    foreach (BL_SECRETS as $k) { $cfg[$k] = ''; $cfg[$k . '_set'] = $c[$k] !== ''; }
    $units = bl_sa_units();
    $people = bl_sa_people();
    $pays = array_map(function ($p) {
        $o = bl_pay_out($p);
        $t = nm_tenant_by_key(bl_key_tkey((string)$p['tkey']));
        $o['unit'] = $t ? $t['name'] : $p['tkey'];
        $o['person'] = bl_key_uid((string)$p['tkey']) !== null;
        return $o;
    }, m_all('SELECT * FROM bl_payments ORDER BY id DESC LIMIT 150'));
    // Özet: ücretli etkin kişiler, denemeler, aylığa çevrilmiş tekrarlayan gelir (KDV hariç), bu ay tahsilat
    $sum = ['active' => 0, 'trial' => 0, 'expired' => 0, 'comp' => 0, 'mrr' => 0, 'month_paid' => 0, 'pending_havale' => 0, 'units_comp' => 0, 'staff' => 0, 'gone' => 0];
    foreach ($people as $u) {
        $m = $u['mode'];
        if ($u['acct'] !== '' && in_array($m, ['active', 'grace'], true)) $sum['gone']++;
        if ($u['staff'] && !in_array($m, ['active', 'grace'], true)) { $sum['staff']++; continue; }
        if (in_array($m, ['active', 'grace'], true)) { $sum['active']++; $sum['mrr'] += bl_monthly(bl_plan($u['plan_id']), $u['period']); }
        elseif ($m === 'trial') $sum['trial']++;
        elseif ($m === 'comp') $sum['comp']++;
        elseif (in_array($m, ['expired', 'free'], true)) $sum['expired']++;
    }
    foreach ($units as $u) if (in_array($u['mode'], ['comp', 'active', 'grace'], true)) { $sum['units_comp']++; if ($u['mode'] !== 'comp') $sum['mrr'] += bl_monthly(bl_plan($u['plan_id']), $u['period']); }
    $sum['month_paid'] = (int)m_val("SELECT COALESCE(SUM(total), 0) FROM bl_payments WHERE status = 'paid' AND paid_at >= ?", [date('Y-m-01 00:00:00')]);
    $sum['pending_havale'] = (int)m_val("SELECT COUNT(*) FROM bl_payments WHERE status = 'pending' AND provider = 'havale'");
    $mods = [];
    foreach (NM_MODULES as $k => [$name]) $mods[$k] = $name;
    $site = bl_site();
    out(['cfg' => $cfg, 'plans' => bl_plans(), 'units' => $units, 'people' => $people, 'payments' => $pays, 'summary' => $sum, 'modules' => $mods,
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
        foreach (m_all("SELECT tkey FROM bl_subs WHERE tkey LIKE '%#u%' AND status = 'none'") as $r) {
            if ($what === 'trial') { bl_start_trial((string)$r['tkey'], (int)bl_cfg()['trial_days'], 'SA:' . $sa['name']); $n++; }
            elseif ($what === 'comp') { bl_sub_put((string)$r['tkey'], ['status' => 'comp'], 'comp', 'Zorunluluk açılırken ücretsiz tanımlandı', 'SA:' . $sa['name']); $n++; }
        }
        $done = $n ? $n . ' kişi için ' . ($what === 'trial' ? 'deneme başlatıldı' : 'ücretsiz tanımlandı') : '';
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
    // Süreler: [{months, price}] (ör. 1 ay, 3 ay, 12 ay ya da istenen ay sayısı); eski biçim aylık / yıllık da kabul
    $prices = [];
    foreach (is_array($GLOBALS['IN']['prices'] ?? null) ? $GLOBALS['IN']['prices'] : [] as $row) {
        if (!is_array($row)) continue;
        $mo = (int)($row['months'] ?? 0);
        $v = $lira($row['price'] ?? 0);
        if ($mo >= 1 && $mo <= 36 && $v > 0) $prices[$mo] = $v;
    }
    if (!$prices) { $a = $lira($GLOBALS['IN']['price_m'] ?? 0); $b = $lira($GLOBALS['IN']['price_y'] ?? 0); if ($a > 0) $prices[1] = $a; if ($b > 0) $prices[12] = $b; }
    ksort($prices);
    $pm = (int)($prices[1] ?? 0);
    $py = (int)($prices[12] ?? 0);
    $mods = arr('modules');
    $all = !empty($GLOBALS['IN']['all_modules']);
    $mods = $all ? null : array_values(array_intersect(array_keys(NM_MODULES), array_map('strval', $mods)));
    $free = b('is_free') ? 1 : 0;
    if (!$free && !$prices) fail('Ücretli paket için en az bir süre ve fiyat girin (ör. 1 ay, 3 ay, 12 ay) ya da “ücretsiz paket” işaretleyin.');
    if ($free) { $prices = []; $pm = 0; $py = 0; m_q('UPDATE bl_plans SET is_free = 0 WHERE id <> ?', [$id]); } // tek ücretsiz paket (süresi dolanların düştüğü)
    $row = [$code, $name, s('descr', 400), $pm, $py, $prices ? json_encode($prices) : null, 0, $mods === null ? null : json_encode($mods), $free, b('active') ? 1 : 0, (int)(i('sort') ?? 0), now()];
    if ($id) {
        if (!m_one('SELECT id FROM bl_plans WHERE id = ?', [$id])) fail('Paket bulunamadı.', 404);
        if (m_one('SELECT id FROM bl_plans WHERE code = ? AND id <> ?', [$code, $id])) fail('Bu kod başka pakette kullanılıyor.');
        m_q('UPDATE bl_plans SET code = ?, name = ?, descr = ?, price_m = ?, price_y = ?, prices = ?, max_users = ?, modules = ?, is_free = ?, active = ?, sort = ?, updated_at = ? WHERE id = ?', [...$row, $id]);
    } else {
        if (m_one('SELECT id FROM bl_plans WHERE code = ?', [$code])) fail('Bu kod başka pakette kullanılıyor.');
        m_q('INSERT INTO bl_plans (code, name, descr, price_m, price_y, prices, max_users, modules, is_free, active, sort, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...$row, now()]);
    }
    sa_audit($sa, 'billing.plan', $name, $free ? 'ücretsiz' : implode(' · ', array_map(fn($mo, $v) => bl_period_label('m' . $mo) . ' ' . bl_money($v), array_keys($prices), $prices)));
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

/** Kişi ya da birimin tamamı: deneme / etkinleştir / uzat / ücretsiz / askıya al / sıfırla */
function a_sa_billing_sub(): void
{
    $sa = need_sa();
    $key = s('key', 80);
    $t = nm_tenant_by_key(bl_key_tkey($key)) ?? fail('Birim bulunamadı.', 404);
    if (bl_key_uid($key) !== null && !preg_match('/^[A-Za-z0-9_-]+(#x\d+)?#u\d+$/', $key)) fail('Geçersiz kayıt.');
    $tk = bl_key_uid($key) !== null ? $key : (string)$t['tkey'];
    $label = bl_key_uid($key) !== null ? ((string)(bl_sub($tk)['name'] ?? '') ?: 'kişi') . ' (' . $t['name'] . ')' : $t['name'] . ' (birimin tamamı)';
    $who = 'SA:' . $sa['name'];
    $note = s('note', 300);
    $op = s('op', 12);
    $sub = bl_sub($tk);
    switch ($op) {
        case 'trial':
            bl_start_trial($tk, (int)(i('days') ?? (int)bl_cfg()['trial_days']), $who);
            break;
        case 'activate': // paket + (1 / 3 / 6 / 12 ay … | belirli tarihe kadar)
            $plan = bl_plan(i('plan_id')) ?? fail('Paketi seçin.');
            $until = s('until', 10);
            $period = s('period', 5);
            $period = $period === 'year' ? 'm12' : ($period === 'month' || $period === '' ? 'm1' : 'm' . bl_months($period));
            if ($until !== '') {
                if (!valid_ymd($until) || $until < date('Y-m-d')) fail('Geçerli bir bitiş tarihi seçin.');
                bl_sub_put($tk, ['plan_id' => $plan['id'], 'status' => 'active', 'period' => $period, 'current_end' => $until . ' 23:59:59', 'started_at' => $sub['started_at'] ?? now(), 'reminded' => ''],
                    'activate', $plan['name'] . ' · ' . date('d.m.Y', strtotime($until)) . ' tarihine kadar' . ($note ? ' · ' . $note : ''), $who);
            } else {
                bl_extend($tk, $plan['id'], $period, $plan['name'] . ' · ' . bl_period_label($period) . ' (elle)' . ($note ? ' · ' . $note : ''), $who, max(1, min(36, (int)(i('n') ?? 1))));
            }
            break;
        case 'extend': // gün ekle (deneme ya da etkin)
            $days = max(1, min(730, (int)(i('days') ?? 0)));
            if ($sub['status'] === 'trial') bl_sub_put($tk, ['trial_ends' => date('Y-m-d H:i:s', max(time(), strtotime((string)$sub['trial_ends'] ?: 'now')) + $days * 86400), 'reminded' => ''], 'extend', 'Deneme +' . $days . ' gün' . ($note ? ' · ' . $note : ''), $who);
            elseif ($sub['status'] === 'active') bl_sub_put($tk, ['current_end' => date('Y-m-d H:i:s', max(time(), strtotime((string)$sub['current_end'] ?: 'now')) + $days * 86400), 'reminded' => ''], 'extend', '+' . $days . ' gün' . ($note ? ' · ' . $note : ''), $who);
            else fail('Uzatmak için abonelik denemede ya da etkin olmalı.');
            break;
        case 'comp':
            bl_sub_put($tk, ['status' => 'comp', 'plan_id' => i('plan_id') ?: $sub['plan_id']], 'comp', 'Ücretsiz tanımlandı' . ($note ? ' · ' . $note : ''), $who);
            break;
        case 'suspend':
            bl_sub_put($tk, ['status' => 'suspended'], 'suspend', 'Askıya alındı' . ($note ? ' · ' . $note : ''), $who);
            break;
        case 'move': // birim değiştiren kişi: abonelik, fatura bilgisi ve ödemeler yeni hesaba
            if (bl_key_uid($tk) === null) fail('Yalnız kişi aboneliği taşınır.');
            $to = s('to', 80);
            if ($to === $tk || !preg_match('/^[A-Za-z0-9_-]+#u\d+$/', $to) || !nm_tenant_by_key(bl_key_tkey($to))) fail('Taşınacak hesabı seçin (etkin bir hesap).');
            $dst = bl_sub($to);
            if ($dst['updated_at'] === null) fail('Hedef hesap henüz giriş yapmamış; kişi yeni hesabıyla bir kez girsin.');
            if (in_array($dst['status'], ['active', 'comp'], true)) fail('Hedef hesabın kendi etkin aboneliği var; önce onu sıfırlayın.');
            if (!in_array($sub['status'], ['active', 'trial', 'comp'], true)) fail('Taşınacak etkin abonelik yok.');
            $f = ['plan_id' => $sub['plan_id'], 'status' => $sub['status'], 'period' => $sub['period'], 'trial_ends' => $sub['trial_ends'], 'current_end' => $sub['current_end'], 'started_at' => $sub['started_at'], 'reminded' => ''];
            $dstLabel = ((string)($dst['name'] ?? '') ?: 'kişi') . ' (' . (nm_tenant_by_key(bl_key_tkey($to))['name'] ?? '') . ')';
            bl_sub_put($to, $f, 'move_in', 'Abonelik taşındı: ' . $label . ' hesabından' . ($note ? ' · ' . $note : ''), $who);
            m_q('UPDATE bl_payments SET tkey = ? WHERE tkey = ?', [$to, $tk]);
            if (!m_one('SELECT 1 FROM bl_billing WHERE tkey = ?', [$to])) m_q('UPDATE bl_billing SET tkey = ? WHERE tkey = ?', [$to, $tk]);
            bl_sub_put($tk, ['status' => 'none', 'plan_id' => null, 'period' => null, 'trial_ends' => null, 'current_end' => null, 'reminded' => ''], 'move_out', 'Abonelik taşındı: ' . $dstLabel . ' hesabına', $who);
            bl_unit_notify($to, 'Aboneliğiniz taşındı', 'Önceki hesabınızdaki abonelik bu hesaba taşındı; ödemeleriniz ve bitiş tarihiniz korunur.');
            break;
        case 'reset':
            bl_sub_put($tk, ['status' => 'none', 'plan_id' => null, 'period' => null, 'trial_ends' => null, 'current_end' => null, 'reminded' => ''], 'reset', 'Abonelik kaydı sıfırlandı' . ($note ? ' · ' . $note : ''), $who);
            break;
        case 'note':
            bl_sub_put($tk, ['note' => $note], 'note', $note, $who);
            break;
        default: fail('Bu işlem yapılamadı. Sayfayı yenileyip tekrar deneyin.');
    }
    sa_audit($sa, 'billing.sub', $label, $op . ($note ? ' · ' . $note : ''));
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

/** Süresi dolmuş (ya da kaydı sıfırlanmış) tüm kişilere yeniden deneme */
function a_sa_billing_bulk(): void
{
    $sa = need_sa();
    $days = max(1, min(365, (int)(i('days') ?? (int)bl_cfg()['trial_days'])));
    $n = 0;
    foreach (m_all("SELECT tkey FROM bl_subs WHERE tkey LIKE '%#u%'") as $r) {
        $none = bl_sub((string)$r['tkey'])['status'] === 'none';
        $st = $none ? null : bl_state((string)$r['tkey']);
        if ($none || in_array($st['real_mode'] ?? $st['mode'], ['expired', 'free'], true)) { bl_start_trial((string)$r['tkey'], $days, 'SA:' . $sa['name']); $n++; }
    }
    sa_audit($sa, 'billing.bulk', $n . ' kişi', $days . ' gün deneme');
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
    } else fail('Bu işlem yapılamadı. Sayfayı yenileyip tekrar deneyin.');
    sa_audit($sa, 'billing.pay', $p['oid'], $op);
    $GLOBALS['IN'] = [];
    a_sa_billing();
}

function a_sa_billing_events(): void
{
    need_sa();
    bl_ensure();
    $tk = s('key', 80);
    out(['events' => m_all('SELECT kind, detail, who, at FROM bl_events WHERE tkey = ? ORDER BY id DESC LIMIT 100', [$tk]),
        'payments' => array_map('bl_pay_out', m_all('SELECT * FROM bl_payments WHERE tkey = ? ORDER BY id DESC LIMIT 100', [$tk])), 'billing' => bl_billing($tk)]);
}

/* =================================================================== */
/* Bildirim: birim yöneticilerine                                       */
/* =================================================================== */

function bl_outbox_flush(): void
{
    $tk = (string)nm_tenant()['tkey'];
    $rows = m_all("SELECT * FROM bl_outbox WHERE (tkey = ? OR tkey LIKE ?) AND sent_at IS NULL ORDER BY id LIMIT 30", [$tk, $tk . '#u%']);
    if (!$rows) return;
    $admins = null;
    foreach ($rows as $r) {
        if (m_q('UPDATE bl_outbox SET sent_at = ? WHERE id = ? AND sent_at IS NULL', [now(), $r['id']])->rowCount() !== 1) continue;
        $uid = bl_key_uid((string)$r['tkey']);
        $to = $uid !== null ? all("SELECT * FROM users WHERE id = ? AND status = 'active'", [$uid]) : ($admins ??= all("SELECT * FROM users WHERE role = 'admin' AND status = 'active'"));
        if ($to && function_exists('notify_users')) notify_users($to, 'billing', (string)$r['title'], (string)$r['body'], '#/abonelik',
            ['subject' => (string)$r['title'], 'heading' => (string)$r['title'], 'lines' => [(string)$r['body']], 'button' => 'Aboneliği gör'], 'notoff');
    }
}

/** Hatırlatma: deneme / abonelik bitmeden 7, 3, 1 gün önce ve bittiğinde — her kişiye kendi aboneliği için (her eşik bir kez) */
function bl_remind_one(string $key, bool $person): void
{
    $st = bl_state($key);
    $sub = bl_sub($key);
    $end = $st['ends'];
    if (!$end || !in_array($sub['status'], ['trial', 'active'], true)) return;
    $d = bl_days_left($end);
    $step = $d <= 0 ? 0 : ($d <= 1 ? 1 : ($d <= 3 ? 3 : ($d <= 7 ? 7 : null)));
    if ($step === null) return;
    $tag = substr((string)$end, 0, 10) . ':' . $step;
    if (in_array($tag, explode(',', (string)$sub['reminded']), true)) return;
    m_q('UPDATE bl_subs SET reminded = ? WHERE tkey = ?', [trim($sub['reminded'] . ',' . $tag, ','), $key]);
    $what = $sub['status'] === 'trial' ? 'Deneme süreniz' : 'Aboneliğiniz';
    $txt = $step === 0 ? $what . ' sona erdi.' . ($st['enforce'] ? ' Kesintisiz kullanım için aboneliği yenileyin.' : '') : $what . ' ' . $d . ' gün sonra (' . date('d.m.Y', strtotime((string)$end)) . ') bitiyor.';
    bl_unit_notify($key, $step === 0 ? $what . ' sona erdi' : $what . ' bitiyor', $txt . ($person ? ' Hesabım › Abonelik’ten paket seçip ödeme yapabilirsiniz.' : ' Sistem yöneticisiyle görüşün.'));
}
$GLOBALS['NM_JOBS']['billing_remind'] = function (bool $force) {
    if (!bl_on()) return;
    try { bl_ensure(); bl_outbox_flush(); } catch (Throwable $e) { error_log('[dupcii] abonelik kuyruğu: ' . $e->getMessage()); }
    $c = bl_cfg();
    if ($c['remind'] !== '1' || ($c['visible'] !== '1' && $c['enforce'] !== '1')) return;
    $tk = (string)nm_tenant()['tkey'];
    try {
        bl_remind_one($tk, false);
        // Yönetici / sorumlular zaten kapsamda: kişisel aboneliği için hatırlatılmaz
        foreach (m_all("SELECT tkey FROM bl_subs WHERE tkey LIKE ? AND status IN ('trial', 'active') AND role <> 'staff'", [$tk . '#u%']) as $r) bl_remind_one((string)$r['tkey'], true);
        bl_outbox_flush();
    } catch (Throwable $e) { error_log('[dupcii] abonelik hatırlatma: ' . $e->getMessage()); }
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
