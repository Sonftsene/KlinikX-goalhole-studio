<?php
/**
 * Abonelik ve ödeme altyapısı (4.15) — kütüphane (api.php'ye bağlı değil; odeme.php ve cron da kullanır).
 *
 * İlkeler
 *  - Her şey süper yöneticinin elinde: "abonelik sayfası görünsün" ve "ödeme zorunluluğu" ayrı anahtarlar, ikisi de varsayılan KAPALI.
 *    Zorunluluk kapalıyken hiçbir birim kısıtlanmaz (geliştirme ve yayılma dönemi).
 *  - Abonelik KİŞİ başınadır (4.32): her kullanıcı kendi aboneliğini öder. Abone anahtarı "birimAnahtarı#u<kullanıcı no>".
 *    Sistem yöneticisi isterse bir birimin tamamını ücretsiz tanımlar / öder (anahtar yalnız birim anahtarı): o birimdeki herkes kapsanır.
 *  - Paketler süper yönetici tarafından düzenlenir: süre başına fiyat (KDV hariç; 1, 3, 12 ay ya da istenen ay sayısı), açık modüller, ücretsiz paket.
 *  - Durumlar: none (kaydı yok) · trial (deneme) · active (ücretli) · comp (ücretsiz tanımlandı) · suspended (askıya alındı).
 *    Süresi dolan ücretli abonelik ek süre (grace) boyunca çalışır; sonra ücretsiz pakete düşer, ücretsiz paket yoksa salt okunur olur.
 *  - Ödeme: PayTR (iFrame), iyzico (Checkout Form), havale/EFT (süper yönetici onaylar). Tutar her zaman sunucuda paketten hesaplanır.
 *    Bildirimler imza / sağlayıcıdan sorgulama ile doğrulanır; aynı ödeme iki kez işlenmez.
 *  - Veriler merkez veritabanında (çok birimli kurulum). Tek birimli (MySQL) kurulumda abonelik kapalıdır.
 */
declare(strict_types=1);

const BL_PERIODS = ['month' => 'Aylık', 'year' => 'Yıllık']; // eski kayıtlar; yeni süreler "m<ay>" (m1, m3, m12…)

/** Süre anahtarı → ay sayısı ('month' = 1, 'year' = 12, 'm3' = 3) */
function bl_months(?string $period): int
{
    if ($period === 'year') return 12;
    if ($period === null || $period === '' || $period === 'month') return 1;
    return preg_match('/^m(\d{1,2})$/', $period, $m) ? max(1, min(36, (int)$m[1])) : 1;
}
function bl_period_label(?string $period): string
{
    $n = bl_months($period);
    return $n === 1 ? 'Aylık' : ($n === 12 ? 'Yıllık' : ($n === 24 ? '2 yıllık' : $n . ' aylık'));
}

/* ---------------- Abone anahtarı: kişi ya da birim ---------------- */
function bl_pkey(string $tkey, int $uid): string { return $tkey . '#u' . $uid; }
function bl_key_tkey(string $key): string { $i = strpos($key, '#'); return $i === false ? $key : substr($key, 0, $i); }
function bl_key_uid(string $key): ?int { return preg_match('/#u(\d+)$/', $key, $m) ? (int)$m[1] : null; }
const BL_STATUS_TXT = ['none' => 'Abonelik yok', 'trial' => 'Deneme', 'active' => 'Etkin', 'comp' => 'Ücretsiz (tanımlı)', 'suspended' => 'Askıya alındı'];
const BL_MODE_TXT = ['none' => 'Abonelik yok', 'open' => 'Kısıtlama yok', 'trial' => 'Deneme', 'active' => 'Etkin', 'grace' => 'Ek süre', 'comp' => 'Ücretsiz (tanımlı)', 'free' => 'Ücretsiz paket', 'expired' => 'Süresi doldu'];

function bl_on(): bool { return function_exists('nm_multi') && nm_multi(); }

function bl_ensure(): void
{
    static $done = false;
    if ($done || !bl_on()) return;
    $done = true;
    $p = merkez();
    $p->exec("CREATE TABLE IF NOT EXISTS bl_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, descr TEXT NOT NULL DEFAULT '',
        price_m INTEGER NOT NULL DEFAULT 0, price_y INTEGER NOT NULL DEFAULT 0, max_users INTEGER NOT NULL DEFAULT 0, modules TEXT NULL, is_free INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    $p->exec("CREATE TABLE IF NOT EXISTS bl_subs (tkey TEXT PRIMARY KEY, plan_id INTEGER NULL, status TEXT NOT NULL DEFAULT 'none', period TEXT NULL,
        trial_ends TEXT NULL, current_end TEXT NULL, started_at TEXT NULL, note TEXT NOT NULL DEFAULT '', reminded TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
    $p->exec("CREATE TABLE IF NOT EXISTS bl_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, tkey TEXT NOT NULL, plan_id INTEGER NOT NULL, period TEXT NOT NULL,
        net INTEGER NOT NULL, kdv INTEGER NOT NULL, total INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'TRY', provider TEXT NOT NULL, oid TEXT NOT NULL UNIQUE,
        ref TEXT NULL, status TEXT NOT NULL DEFAULT 'pending', payer_id INTEGER NULL, payer_name TEXT NOT NULL DEFAULT '', payer_email TEXT NOT NULL DEFAULT '',
        billing TEXT NULL, note TEXT NOT NULL DEFAULT '', invoice_no TEXT NOT NULL DEFAULT '', raw TEXT NULL, created_at TEXT NOT NULL, paid_at TEXT NULL, updated_at TEXT NOT NULL)");
    $p->exec('CREATE INDEX IF NOT EXISTS bl_pay_t ON bl_payments (tkey, created_at)');
    $p->exec("CREATE TABLE IF NOT EXISTS bl_billing (tkey TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', tax_office TEXT NOT NULL DEFAULT '', tax_no TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)");
    $p->exec('CREATE TABLE IF NOT EXISTS bl_events (id INTEGER PRIMARY KEY AUTOINCREMENT, tkey TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT \'\', who TEXT NOT NULL DEFAULT \'\', at TEXT NOT NULL)');
    $p->exec('CREATE INDEX IF NOT EXISTS bl_ev_t ON bl_events (tkey, id)');
    // Birim yöneticilerine gidecek bildirimler (başka birimin isteğinden / ödeme dönüşünden): birimin görevi teslim eder
    $p->exec("CREATE TABLE IF NOT EXISTS bl_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, tkey TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, sent_at TEXT NULL)");
    $cols = fn(string $t) => array_column($p->query('PRAGMA table_info(' . $t . ')')->fetchAll(PDO::FETCH_ASSOC), 'name');
    if (!in_array('prices', $cols('bl_plans'), true)) {
        $p->exec('ALTER TABLE bl_plans ADD COLUMN prices TEXT NULL');
        // 4.32 kişi bazlı: hiç değiştirilmemiş eski (birim fiyatlı) örnek paketler kişi başı örnek fiyatlara geçer; diğerleri aylık / yıllık fiyatıyla kalır
        $old = ['pro' => [150000, 1500000, [1 => 9900, 3 => 26900, 12 => 99000]], 'kurumsal' => [300000, 3000000, [1 => 14900, 3 => 39900, 12 => 149000]]];
        foreach ($old as $code => [$pm, $py, $pr]) {
            $u = $p->prepare('UPDATE bl_plans SET price_m = ?, price_y = ?, prices = ?, updated_at = ? WHERE code = ? AND price_m = ? AND price_y = ?');
            $u->execute([$pr[1], $pr[12], json_encode($pr), date('Y-m-d H:i:s'), $code, $pm, $py]);
        }
        $p->exec('UPDATE bl_plans SET max_users = 0');
    }
    $sc = $cols('bl_subs');
    if (!in_array('name', $sc, true)) $p->exec("ALTER TABLE bl_subs ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    if (!in_array('email', $sc, true)) $p->exec("ALTER TABLE bl_subs ADD COLUMN email TEXT NOT NULL DEFAULT ''");
    if (!(int)$p->query('SELECT COUNT(*) FROM bl_plans')->fetchColumn()) bl_seed_plans();
}

/** Örnek paketler (süper yönetici fiyatları ve içerikleri düzenler) */
function bl_seed_plans(): void
{
    $now = now();
    // Kişi başı örnek fiyatlar (kuruş, KDV hariç): süre => fiyat
    $rows = [
        ['temel', 'Temel', 'Ücretsiz: nöbet listesi, takvim, kim nöbette, duyurular, rehber, yemek listesi.', [], 0, ['nobet', 'rehber', 'yemek'], 1, 1],
        ['pro', 'Profesyonel', 'Nöbet değişimi, ilan, devral, eksik personel çağrısı, istekler, mesajlaşma ve arama, bildirimler.', [1 => 9900, 3 => 26900, 12 => 99000], 0, ['nobet', 'taraf', 'istekler', 'ilan', 'eksik', 'gecmis', 'rehber', 'mesaj', 'yemek', 'ucret'], 0, 2],
        ['kurumsal', 'Kurumsal', 'Tüm modüller: çizelge hazırlama ve otomatik doldurma, hastane ortak belgeleri, raporlar; öncelikli destek.', [1 => 14900, 3 => 39900, 12 => 149000], 0, null, 0, 3],
    ];
    foreach ($rows as [$code, $name, $d, $prices, $mu, $mods, $free, $sort]) {
        m_q('INSERT OR IGNORE INTO bl_plans (code, name, descr, price_m, price_y, prices, max_users, modules, is_free, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
            [$code, $name, $d, (int)($prices[1] ?? 0), (int)($prices[12] ?? 0), $prices ? json_encode($prices) : null, $mu, $mods === null ? null : json_encode($mods), $free, $sort, $now, $now]);
    }
}

/* ---------------- Ayarlar (merkez m_settings, anahtar "bl.<ad>") ---------------- */

const BL_DEFAULTS = [
    'visible' => '0',     // birimlerde "Abonelik" sayfası
    'enforce' => '0',     // süresi dolanlar kısıtlanır
    'trial_on' => '0',    // yeni birimlere / kaydı olmayanlara otomatik deneme
    'trial_days' => '30',
    'grace_days' => '7',
    'kdv' => '20',
    'remind' => '1',
    'havale_on' => '0', 'havale_text' => '',
    'terms' => '',        // mesafeli satış sözleşmesi / ön bilgilendirme (doluysa ödeme öncesi onay zorunlu)
    'paytr_on' => '0', 'paytr_test' => '1', 'paytr_id' => '', 'paytr_key' => '', 'paytr_salt' => '',
    'iyzico_on' => '0', 'iyzico_sandbox' => '1', 'iyzico_key' => '', 'iyzico_secret' => '',
];
const BL_SECRETS = ['paytr_key', 'paytr_salt', 'iyzico_secret'];

function bl_secret_key(): string { return hash('sha256', 'bl|' . m_setting('secret'), true); }
function bl_enc(string $v): string
{
    if ($v === '') return '';
    $iv = random_bytes(12);
    $c = openssl_encrypt($v, 'aes-256-gcm', bl_secret_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return 'e1:' . base64_encode($iv . $tag . $c);
}
function bl_dec(string $v): string
{
    if (strncmp($v, 'e1:', 3) !== 0) return $v;
    $b = base64_decode(substr($v, 3), true);
    if ($b === false || strlen($b) < 29) return '';
    $p = openssl_decrypt(substr($b, 28), 'aes-256-gcm', bl_secret_key(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
    return $p === false ? '' : $p;
}

function bl_cfg(): array
{
    if (isset($GLOBALS['BL_CFG'])) return $GLOBALS['BL_CFG'];
    $c = BL_DEFAULTS;
    if (bl_on()) {
        foreach (m_all("SELECT k, v FROM m_settings WHERE k LIKE 'bl.%'") as $r) {
            $k = substr((string)$r['k'], 3);
            if (array_key_exists($k, $c)) $c[$k] = in_array($k, BL_SECRETS, true) ? bl_dec((string)$r['v']) : (string)$r['v'];
        }
    }
    return $GLOBALS['BL_CFG'] = $c;
}
function bl_cfg_set(array $patch): void
{
    foreach ($patch as $k => $v) {
        if (!array_key_exists($k, BL_DEFAULTS)) continue;
        $v = (string)$v;
        m_q('INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)', ['bl.' . $k, in_array($k, BL_SECRETS, true) ? bl_enc($v) : $v]);
    }
    unset($GLOBALS['BL_CFG']);
}

/* ---------------- Paketler ---------------- */

function bl_plan_out(array $p): array
{
    $mods = $p['modules'] === null || $p['modules'] === '' ? null : array_values((array)json_decode((string)$p['modules'], true));
    // Süre fiyatları: [ay => kuruş]; eski paketlerde aylık / yıllık fiyattan
    $pr = [];
    foreach ((array)json_decode((string)($p['prices'] ?? ''), true) as $mo => $v) if ((int)$mo >= 1 && (int)$mo <= 36 && (int)$v > 0) $pr[(int)$mo] = (int)$v;
    if (!$pr && (int)$p['is_free'] !== 1) { if ((int)$p['price_m'] > 0) $pr[1] = (int)$p['price_m']; if ((int)$p['price_y'] > 0) $pr[12] = (int)$p['price_y']; }
    ksort($pr);
    return ['id' => (int)$p['id'], 'code' => $p['code'], 'name' => $p['name'], 'descr' => $p['descr'], 'price_m' => (int)$p['price_m'], 'price_y' => (int)$p['price_y'],
        'durations' => array_map(fn($mo, $v) => ['months' => $mo, 'period' => 'm' . $mo, 'label' => bl_period_label('m' . $mo), 'net' => $v], array_keys($pr), array_values($pr)),
        'max_users' => (int)$p['max_users'], 'modules' => $mods, 'is_free' => (int)$p['is_free'] === 1, 'active' => (int)$p['active'] === 1, 'sort' => (int)$p['sort']];
}
function bl_plans(bool $activeOnly = false): array
{
    bl_ensure();
    return array_map('bl_plan_out', m_all('SELECT * FROM bl_plans' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort, id'));
}
function bl_plan(?int $id): ?array
{
    if (!$id) return null;
    bl_ensure();
    $r = m_one('SELECT * FROM bl_plans WHERE id = ?', [$id]);
    return $r ? bl_plan_out($r) : null;
}
function bl_free_plan(): ?array
{
    foreach (bl_plans(true) as $p) if ($p['is_free']) return $p;
    return null;
}

/** Fiyat (kuruş): [net, kdv, toplam] */
function bl_price(array $plan, string $period): array
{
    $mo = bl_months($period);
    $net = 0;
    foreach ($plan['durations'] ?? [] as $d) if ((int)$d['months'] === $mo) $net = (int)$d['net'];
    $kdv = (int)round($net * max(0, min(100, (float)bl_cfg()['kdv'])) / 100);
    return ['net' => $net, 'kdv' => $kdv, 'total' => $net + $kdv];
}
function bl_money(int $kurus): string { return number_format($kurus / 100, 2, ',', '.') . ' ₺'; }

/* ---------------- Abonelik durumu ---------------- */

function bl_sub(string $tkey): array
{
    bl_ensure();
    $r = m_one('SELECT * FROM bl_subs WHERE tkey = ?', [$tkey]);
    return $r ?: ['tkey' => $tkey, 'plan_id' => null, 'status' => 'none', 'period' => null, 'trial_ends' => null, 'current_end' => null, 'started_at' => null, 'note' => '', 'reminded' => '', 'updated_at' => null, 'name' => '', 'email' => ''];
}
function bl_sub_put(string $tkey, array $f, string $kind, string $detail, string $who = ''): void
{
    bl_ensure();
    $cur = bl_sub($tkey);
    $row = array_merge($cur, $f, ['tkey' => $tkey, 'updated_at' => now()]);
    m_q('INSERT OR REPLACE INTO bl_subs (tkey, plan_id, status, period, trial_ends, current_end, started_at, note, reminded, updated_at, name, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$tkey, $row['plan_id'] !== null ? (int)$row['plan_id'] : null, $row['status'], $row['period'], $row['trial_ends'], $row['current_end'], $row['started_at'], (string)$row['note'], (string)$row['reminded'], $row['updated_at'],
            mb_substr((string)($row['name'] ?? ''), 0, 120), mb_substr((string)($row['email'] ?? ''), 0, 190)]);
    m_q('INSERT INTO bl_events (tkey, kind, detail, who, at) VALUES (?, ?, ?, ?, ?)', [$tkey, $kind, mb_substr($detail, 0, 500), mb_substr($who, 0, 120), now()]);
}
function bl_add_period(string $from, string $period, int $n = 1): string
{
    $d = new DateTime($from);
    $d->modify('+' . (bl_months($period) * $n) . ' month');
    return $d->format('Y-m-d H:i:s');
}
function bl_days_left(?string $end): ?int
{
    if (!$end) return null;
    return (int)ceil((strtotime($end) - time()) / 86400);
}

/** Deneme başlat (gün) */
function bl_start_trial(string $tkey, int $days, string $who = 'sistem'): void
{
    $days = max(1, min(365, $days));
    bl_sub_put($tkey, ['status' => 'trial', 'trial_ends' => date('Y-m-d H:i:s', time() + $days * 86400), 'started_at' => bl_sub($tkey)['started_at'] ?? now(), 'reminded' => ''], 'trial', $days . ' gün deneme', $who);
}

/**
 * Birimin geçerli durumu.
 * mode: open (zorunluluk kapalı) · trial · active · grace · comp · free (ücretsiz pakete düştü) · expired (salt okunur)
 * modules: null = hepsi açık, dizi = yalnız bunlar; max_users: 0 = sınırsız
 */
function bl_state(string $tkey): array
{
    $cfg = bl_cfg();
    $sub = bl_sub($tkey);
    $now = date('Y-m-d H:i:s');
    $plan = bl_plan($sub['plan_id'] !== null ? (int)$sub['plan_id'] : null);
    // Kaydı olmayan birim: deneme açıksa ilk bakışta deneme başlar
    if ($sub['status'] === 'none' && $cfg['trial_on'] === '1' && bl_on() && bl_key_uid($tkey) !== null) {
        bl_start_trial($tkey, (int)$cfg['trial_days'], 'otomatik');
        $sub = bl_sub($tkey);
    }
    $o = ['enforce' => $cfg['enforce'] === '1', 'visible' => $cfg['visible'] === '1' || $cfg['enforce'] === '1', 'status' => $sub['status'], 'plan' => $plan,
        'period' => $sub['period'], 'ends' => null, 'days_left' => null, 'mode' => 'open', 'modules' => null, 'max_users' => 0, 'read_only' => false];
    $mode = 'expired';
    if ($sub['status'] === 'comp') $mode = 'comp';
    elseif ($sub['status'] === 'trial' && $sub['trial_ends'] && $sub['trial_ends'] >= $now) { $mode = 'trial'; $o['ends'] = $sub['trial_ends']; }
    elseif ($sub['status'] === 'active' && $sub['current_end']) {
        $o['ends'] = $sub['current_end'];
        if ($sub['current_end'] >= $now) $mode = 'active';
        elseif (date('Y-m-d H:i:s', strtotime($sub['current_end']) + max(0, (int)$cfg['grace_days']) * 86400) >= $now) $mode = 'grace';
    } elseif ($sub['status'] === 'trial') $o['ends'] = $sub['trial_ends'];
    $o['days_left'] = bl_days_left($o['ends']);
    if ($mode === 'grace') $o['grace_until'] = date('Y-m-d H:i:s', strtotime((string)$o['ends']) + max(0, (int)$cfg['grace_days']) * 86400);
    if (!$o['enforce']) { $o['mode'] = 'open'; $o['real_mode'] = $mode; return $o; }
    $o['mode'] = $mode;
    if (in_array($mode, ['active', 'grace'], true) && $plan) { $o['modules'] = $plan['modules']; $o['max_users'] = $plan['max_users']; }
    if ($mode === 'expired') {
        $free = bl_free_plan();
        if ($free) { $o['mode'] = 'free'; $o['plan'] = $free; $o['modules'] = $free['modules']; $o['max_users'] = $free['max_users']; }
        else { $o['read_only'] = true; }
    }
    return $o;
}

/** Ödeme alınınca: paket ve süre (ücretsiz dönem / kalan süre üstüne eklenir) */
function bl_extend(string $tkey, int $planId, string $period, string $why, string $who = '', int $n = 1): string
{
    $sub = bl_sub($tkey);
    $now = date('Y-m-d H:i:s');
    $base = $now;
    if ($sub['status'] === 'active' && $sub['current_end'] && $sub['current_end'] > $base) $base = $sub['current_end'];
    if ($sub['status'] === 'trial' && $sub['trial_ends'] && $sub['trial_ends'] > $base) $base = $sub['trial_ends'];
    $end = bl_add_period($base, $period, $n);
    bl_sub_put($tkey, ['plan_id' => $planId, 'status' => 'active', 'period' => $period, 'current_end' => $end, 'started_at' => $sub['started_at'] ?? $now, 'reminded' => ''],
        'extend', $why . ' → ' . date('d.m.Y', strtotime($end)), $who);
    return $end;
}

/* ---------------- Ödemeler ---------------- */

function bl_new_oid(): string { return 'NM' . date('ymd') . strtoupper(bin2hex(random_bytes(6))); }

function bl_billing(string $tkey): array
{
    bl_ensure();
    return m_one('SELECT * FROM bl_billing WHERE tkey = ?', [$tkey]) ?: ['tkey' => $tkey, 'title' => '', 'tax_office' => '', 'tax_no' => '', 'address' => '', 'city' => '', 'email' => '', 'phone' => ''];
}

/** Bekleyen ödeme kaydı */
function bl_pay_create(string $tkey, array $plan, string $period, string $provider, array $payer, array $billing): array
{
    $pr = bl_price($plan, $period);
    if ($pr['total'] <= 0) throw new RuntimeException('Bu paket ücretsiz; ödeme gerekmez.');
    $oid = bl_new_oid();
    m_q('INSERT INTO bl_payments (tkey, plan_id, period, net, kdv, total, currency, provider, oid, status, payer_id, payer_name, payer_email, billing, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$tkey, $plan['id'], $period, $pr['net'], $pr['kdv'], $pr['total'], 'TRY', $provider, $oid, 'pending', (int)($payer['id'] ?? 0), (string)($payer['name'] ?? ''), (string)($payer['email'] ?? ''),
            json_encode($billing, JSON_UNESCAPED_UNICODE), now(), now()]);
    return m_one('SELECT * FROM bl_payments WHERE oid = ?', [$oid]);
}

/**
 * Ödemeyi onayla (tek sefer): bekleyen → ödendi, abonelik uzatılır. Zaten işlendiyse false.
 * Tutar sağlayıcıdan gelen tutarla karşılaştırılır.
 */
function bl_pay_mark_paid(string $oid, string $ref, int $amountKurus, string $raw, string $who = 'ödeme'): bool
{
    bl_ensure();
    $p = m_one('SELECT * FROM bl_payments WHERE oid = ?', [$oid]);
    if (!$p) return false;
    if ($amountKurus > 0 && $amountKurus < (int)$p['total']) {
        m_q("UPDATE bl_payments SET status = 'failed', note = ?, raw = ?, updated_at = ? WHERE id = ? AND status = 'pending'", ['Tutar uyuşmuyor: ' . $amountKurus, mb_substr($raw, 0, 4000), now(), $p['id']]);
        return false;
    }
    $n = m_q("UPDATE bl_payments SET status = 'paid', ref = ?, raw = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", [$ref, mb_substr($raw, 0, 4000), now(), now(), $p['id']])->rowCount();
    if ($n !== 1) return false;
    $plan = bl_plan((int)$p['plan_id']);
    bl_extend((string)$p['tkey'], (int)$p['plan_id'], (string)$p['period'], ($plan['name'] ?? 'Paket') . ' · ' . bl_period_label((string)$p['period']) . ' · ' . bl_money((int)$p['total']) . ' (' . $p['provider'] . ')', $who);
    return true;
}
function bl_pay_mark_failed(string $oid, string $reason, string $raw): void
{
    bl_ensure();
    m_q("UPDATE bl_payments SET status = 'failed', note = ?, raw = ?, updated_at = ? WHERE oid = ? AND status = 'pending'", [mb_substr($reason, 0, 300), mb_substr($raw, 0, 4000), now(), $oid]);
}

function bl_pay_out(array $p): array
{
    $plan = bl_plan((int)$p['plan_id']);
    return ['id' => (int)$p['id'], 'tkey' => $p['tkey'], 'plan' => $plan['name'] ?? '?', 'plan_id' => (int)$p['plan_id'], 'period' => $p['period'], 'period_txt' => bl_period_label((string)$p['period']), 'net' => (int)$p['net'], 'kdv' => (int)$p['kdv'],
        'total' => (int)$p['total'], 'provider' => $p['provider'], 'oid' => $p['oid'], 'ref' => $p['ref'], 'status' => $p['status'], 'payer' => $p['payer_name'],
        'created_at' => $p['created_at'], 'paid_at' => $p['paid_at'], 'note' => $p['note'], 'invoice_no' => $p['invoice_no']];
}

/* ---------------- Ağ ---------------- */

function bl_http(string $url, string $body, array $headers): array
{
    if (!function_exists('curl_init')) throw new RuntimeException('Sunucuda cURL yok; ödeme sağlayıcısına bağlanılamıyor.');
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => true]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($res === false) throw new RuntimeException('Ödeme sağlayıcısına bağlanılamadı: ' . $err);
    return [$code, (string)$res];
}

/* ---------------- PayTR (iFrame API) ---------------- */

function bl_paytr_base(): string { return defined('NM_PAY_PAYTR_BASE') && NM_PAY_PAYTR_BASE ? rtrim((string)NM_PAY_PAYTR_BASE, '/') : 'https://www.paytr.com'; }

/** Ödeme sayfası jetonu → iFrame adresi */
function bl_paytr_token(array $pay, array $billing, string $ip, string $okUrl, string $failUrl, string $itemName): string
{
    $c = bl_cfg();
    if ($c['paytr_id'] === '' || $c['paytr_key'] === '' || $c['paytr_salt'] === '') throw new RuntimeException('PayTR mağaza bilgileri girilmemiş.');
    $amount = (string)(int)$pay['total'];
    $basket = base64_encode(json_encode([[$itemName, number_format((int)$pay['total'] / 100, 2, '.', ''), 1]], JSON_UNESCAPED_UNICODE));
    $noInst = '1'; $maxInst = '0'; $currency = 'TL'; $test = $c['paytr_test'] === '1' ? '1' : '0';
    $email = (string)($billing['email'] ?: $pay['payer_email']);
    $hashStr = $c['paytr_id'] . $ip . $pay['oid'] . $email . $amount . $basket . $noInst . $maxInst . $currency . $test;
    $token = base64_encode(hash_hmac('sha256', $hashStr . $c['paytr_salt'], $c['paytr_key'], true));
    $post = ['merchant_id' => $c['paytr_id'], 'user_ip' => $ip, 'merchant_oid' => $pay['oid'], 'email' => $email, 'payment_amount' => $amount, 'paytr_token' => $token,
        'user_basket' => $basket, 'debug_on' => $test, 'no_installment' => $noInst, 'max_installment' => $maxInst,
        'user_name' => mb_substr((string)($billing['title'] ?: $pay['payer_name']), 0, 60), 'user_address' => mb_substr((string)($billing['address'] ?: '-') . ' ' . $billing['city'], 0, 400),
        'user_phone' => (string)($billing['phone'] ?: '05000000000'), 'merchant_ok_url' => $okUrl, 'merchant_fail_url' => $failUrl, 'timeout_limit' => '30',
        'currency' => $currency, 'test_mode' => $test, 'lang' => 'tr'];
    [$code, $res] = bl_http(bl_paytr_base() . '/odeme/api/get-token', http_build_query($post), ['Content-Type: application/x-www-form-urlencoded']);
    $j = json_decode($res, true);
    if (!is_array($j) || ($j['status'] ?? '') !== 'success' || empty($j['token'])) throw new RuntimeException('PayTR ödeme başlatılamadı: ' . (is_array($j) ? (string)($j['reason'] ?? $res) : 'HTTP ' . $code));
    return bl_paytr_base() . '/odeme/guvenli/' . $j['token'];
}

/** PayTR bildirimi imzası doğru mu */
function bl_paytr_verify(array $post): bool
{
    $c = bl_cfg();
    if ($c['paytr_key'] === '' || !isset($post['merchant_oid'], $post['status'], $post['total_amount'], $post['hash'])) return false;
    $h = base64_encode(hash_hmac('sha256', $post['merchant_oid'] . $c['paytr_salt'] . $post['status'] . $post['total_amount'], $c['paytr_key'], true));
    return hash_equals($h, (string)$post['hash']);
}

/* ---------------- iyzico (Checkout Form, IYZWSv2 imzası) ---------------- */

function bl_iyz_base(): string
{
    if (defined('NM_PAY_IYZICO_BASE') && NM_PAY_IYZICO_BASE) return rtrim((string)NM_PAY_IYZICO_BASE, '/');
    return bl_cfg()['iyzico_sandbox'] === '1' ? 'https://sandbox-api.iyzipay.com' : 'https://api.iyzipay.com';
}
function bl_iyz_call(string $path, array $body): array
{
    $c = bl_cfg();
    if ($c['iyzico_key'] === '' || $c['iyzico_secret'] === '') throw new RuntimeException('iyzico API anahtarları girilmemiş.');
    $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $rnd = (string)(int)(microtime(true) * 1000) . bin2hex(random_bytes(4));
    $sig = hash_hmac('sha256', $rnd . $path . $json, $c['iyzico_secret']);
    $auth = 'IYZWSv2 ' . base64_encode('apiKey:' . $c['iyzico_key'] . '&randomKey:' . $rnd . '&signature:' . $sig);
    [$code, $res] = bl_http(bl_iyz_base() . $path, $json, ['Content-Type: application/json', 'Accept: application/json', 'Authorization: ' . $auth, 'x-iyzi-rnd: ' . $rnd]);
    $j = json_decode($res, true);
    if (!is_array($j)) throw new RuntimeException('iyzico yanıtı okunamadı (HTTP ' . $code . ').');
    return $j;
}
function bl_iyz_price(int $kurus): string { return number_format($kurus / 100, 2, '.', ''); }

/** Ödeme formunu başlat → iyzico ödeme sayfası adresi */
function bl_iyzico_init(array $pay, array $billing, array $payer, string $ip, string $callback, string $itemName): string
{
    $name = trim((string)($payer['name'] ?? '')) ?: 'Birim Yöneticisi';
    $parts = preg_split('/\s+/', $name);
    $surname = count($parts) > 1 ? array_pop($parts) : '-';
    $first = implode(' ', $parts) ?: $name;
    $tc = preg_match('/^\d{11}$/', (string)$billing['tax_no']) ? (string)$billing['tax_no'] : '11111111111';
    $city = (string)($billing['city'] ?: 'Istanbul');
    $addr = (string)($billing['address'] ?: '-');
    $price = bl_iyz_price((int)$pay['total']);
    $body = ['locale' => 'tr', 'conversationId' => $pay['oid'], 'price' => $price, 'paidPrice' => $price, 'currency' => 'TRY', 'basketId' => $pay['oid'], 'paymentGroup' => 'PRODUCT',
        'callbackUrl' => $callback, 'enabledInstallments' => [1],
        'buyer' => ['id' => 'U' . (int)($payer['id'] ?? 0), 'name' => $first, 'surname' => $surname, 'gsmNumber' => (string)($billing['phone'] ?: ''), 'email' => (string)($billing['email'] ?: ($payer['email'] ?? '')),
            'identityNumber' => $tc, 'registrationAddress' => $addr, 'ip' => $ip, 'city' => $city, 'country' => 'Turkey'],
        'billingAddress' => ['contactName' => (string)($billing['title'] ?: $name), 'city' => $city, 'country' => 'Turkey', 'address' => $addr],
        'basketItems' => [['id' => 'P' . (int)$pay['plan_id'] . '-' . $pay['period'], 'name' => $itemName, 'category1' => 'Yazılım aboneliği', 'itemType' => 'VIRTUAL', 'price' => $price]]];
    $j = bl_iyz_call('/payment/iyzipos/checkoutform/initialize/auth/ecom', $body);
    if (($j['status'] ?? '') !== 'success' || empty($j['paymentPageUrl'])) throw new RuntimeException('iyzico ödeme başlatılamadı: ' . (string)($j['errorMessage'] ?? 'bilinmeyen hata'));
    m_q('UPDATE bl_payments SET ref = ?, updated_at = ? WHERE id = ?', [(string)($j['token'] ?? ''), now(), $pay['id']]);
    return (string)$j['paymentPageUrl'];
}

/** iyzico dönüşü: jetonla sonucu sorgula. [oid, başarılı mı, tutar(kuruş), paymentId, ham] */
function bl_iyzico_result(string $token): array
{
    $p = m_one("SELECT * FROM bl_payments WHERE provider = 'iyzico' AND ref = ?", [$token]);
    $j = bl_iyz_call('/payment/iyzipos/checkoutform/auth/ecom/detail', ['locale' => 'tr', 'conversationId' => $p['oid'] ?? '', 'token' => $token]);
    $oid = (string)($j['basketId'] ?? ($p['oid'] ?? ''));
    $ok = ($j['status'] ?? '') === 'success' && ($j['paymentStatus'] ?? '') === 'SUCCESS' && $p && hash_equals((string)$p['oid'], $oid);
    $amount = isset($j['paidPrice']) ? (int)round((float)$j['paidPrice'] * 100) : 0;
    return [$oid, $ok, $amount, (string)($j['paymentId'] ?? ''), json_encode($j, JSON_UNESCAPED_UNICODE), (string)($j['errorMessage'] ?? '')];
}

/** Birimin yöneticilerine bildirim: kuyruğa yazılır, birimin görevi teslim eder (bu istek o birimdeyse hemen) */
function bl_unit_notify(string $tkey, string $title, string $body): void
{
    try {
        bl_ensure();
        m_q('INSERT INTO bl_outbox (tkey, title, body, created_at) VALUES (?, ?, ?, ?)', [$tkey, mb_substr($title, 0, 200), mb_substr($body, 0, 1000), now()]);
        if (function_exists('bl_outbox_flush') && !empty($GLOBALS['NM_T']) && (string)($GLOBALS['NM_T']['tkey'] ?? '') === bl_key_tkey($tkey)) bl_outbox_flush();
    } catch (Throwable $e) { error_log('[dupcii] abonelik bildirimi: ' . $e->getMessage()); }
}

/* ---------------- Adresler ---------------- */

/** Sitenin kök adresi (ödeme dönüşleri için) */
function bl_site(): string
{
    $m = bl_on() ? m_setting('site_url') : '';
    if (defined('APP_URL') && APP_URL !== '') return rtrim((string)APP_URL, '/') . '/';
    return $m !== '' ? rtrim($m, '/') . '/' : request_base_url();
}
/** Birimin uygulama adresi (ödeme sonrası dönüş) */
function bl_unit_url(string $tkey, string $hash = '#/abonelik'): string
{
    $tkey = bl_key_tkey($tkey);
    $t = function_exists('nm_tenant_by_key') ? nm_tenant_by_key($tkey) : null;
    return bl_site() . ($t && (int)$t['is_default'] !== 1 ? '?b=' . rawurlencode($tkey) : '') . $hash;
}
