<?php
/**
 * Birim açma başvurusu ve doğrulama (4.16) — yalnız çok birimli (SQLite) kurulumda.
 *
 * Akış: başvuran e-postasını kodla doğrular → hastaneyi seçer (ya da yeni hastane yazar), birimi ve kendini tanıtır,
 * isterse görevlendirme belgesi ekler → başvuru "incelemede" olur. Hiçbir birim kendiliğinden açılmaz: sistem yöneticisi
 * doğrulama işaretlerine (e-posta doğrulandı mı, kurumsal alan adı, aynı hastanedeki birim yöneticilerinin teyidi, belge,
 * olası kopya birim, aynı IP'den başvurular) bakıp onaylar, reddeder ya da bilgi ister. Onayda hastane (gerekirse),
 * birim ve başvuranın yönetici hesabı tek işlemde açılır.
 *
 * Veri: merkez veritabanı (ap_*). Belge şifreli saklanır ve karar verilince silinir; reddedilen / geri çekilen
 * başvurular 90 gün sonra silinir, onaylananların iletişim ayrıntıları 1 yıl sonra temizlenir (KVKK).
 */
declare(strict_types=1);

const AP_DEFAULTS = [
    'on' => '0',              // başvuru formu açık mı (sistem yöneticisi açar)
    'domains' => "saglik.gov.tr\ngov.tr\nedu.tr",
    'doc' => 'optional',      // off | optional | required — görevlendirme belgesi / kurum kimlik kartı
    'peer' => '1',            // aynı hastanedeki birim yöneticilerinden teyit iste
    'mail_tkey' => '',        // başvuru e-postaları hangi birimin e-posta ayarıyla gider (boş: ilk uygun birim)
    'notice' => '',           // formda görünen not (ör. "Başvurular 1-2 iş gününde incelenir")
];
const AP_FREE_MAIL = ['gmail.com', 'hotmail.com', 'outlook.com', 'outlook.com.tr', 'yahoo.com', 'yandex.com', 'yandex.com.tr', 'icloud.com', 'live.com', 'msn.com', 'mail.ru', 'protonmail.com', 'proton.me', 'hotmail.com.tr', 'windowslive.com', 'mynet.com'];
const AP_STATUS_TXT = ['pending' => 'İncelemede', 'info' => 'Bilgi bekleniyor', 'approved' => 'Onaylandı', 'rejected' => 'Reddedildi', 'spam' => 'Geçersiz'];
const AP_DOC_MAX = 3 * 1024 * 1024;

function ap_on(): bool { return function_exists('nm_multi') && nm_multi(); }

function ap_ensure(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    $p = merkez();
    $p->exec("CREATE TABLE IF NOT EXISTS ap_apps (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, token_enc TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
        email TEXT NOT NULL, email_ok INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', duty TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
        hospital_id INTEGER, hospital_name TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', unit_name TEXT NOT NULL, staff INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '',
        doc TEXT, doc_name TEXT, doc_mime TEXT, doc_size INTEGER NOT NULL DEFAULT 0, sa_msg TEXT, reply TEXT, sa_note TEXT, tkey TEXT,
        ip TEXT NOT NULL DEFAULT '', ua TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT)");
    $p->exec('CREATE INDEX IF NOT EXISTS ap_apps_st ON ap_apps (status, created_at)');
    $p->exec('CREATE TABLE IF NOT EXISTS ap_votes (app_id INTEGER NOT NULL, tkey TEXT NOT NULL, uid INTEGER NOT NULL, who TEXT NOT NULL, unit TEXT NOT NULL, vote TEXT NOT NULL, note TEXT, at TEXT NOT NULL, PRIMARY KEY (app_id, tkey, uid))');
    $p->exec('CREATE TABLE IF NOT EXISTS ap_peer_sent (app_id INTEGER NOT NULL, tkey TEXT NOT NULL, PRIMARY KEY (app_id, tkey))');
    $p->exec('CREATE TABLE IF NOT EXISTS ap_hits (k TEXT NOT NULL, at INTEGER NOT NULL)');
    $p->exec('CREATE INDEX IF NOT EXISTS ap_hits_k ON ap_hits (k, at)');
    $p->exec('CREATE TABLE IF NOT EXISTS ap_blocks (k TEXT PRIMARY KEY, at TEXT NOT NULL)');
}

function ap_cfg(): array
{
    if (isset($GLOBALS['AP_CFG'])) return $GLOBALS['AP_CFG'];
    $c = AP_DEFAULTS;
    if (ap_on()) foreach (m_all("SELECT k, v FROM m_settings WHERE k LIKE 'ap\\_%' ESCAPE '\\'") as $r) { $k = substr((string)$r['k'], 3); if (array_key_exists($k, $c)) $c[$k] = (string)$r['v']; }
    return $GLOBALS['AP_CFG'] = $c;
}
function ap_cfg_put(array $kv): void
{
    foreach ($kv as $k => $v) if (array_key_exists($k, AP_DEFAULTS)) m_q('INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)', ['ap_' . $k, (string)$v]);
    unset($GLOBALS['AP_CFG']);
}
function ap_open(): bool { return ap_on() && ap_cfg()['on'] === '1'; }

/* ---------------- Yardımcılar ---------------- */

function ap_key(): string { return hash('sha256', 'ap|' . m_setting('secret'), true); }
function ap_enc(string $v): string
{
    $iv = random_bytes(12);
    $c = openssl_encrypt($v, 'aes-256-gcm', ap_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return $iv . $tag . $c;
}
function ap_dec(string $b): string
{
    if (strlen($b) < 29) return '';
    $p = openssl_decrypt(substr($b, 28), 'aes-256-gcm', ap_key(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
    return $p === false ? '' : $p;
}
function ap_dir(): string
{
    $d = NM_ROOT . '/data/merkez/basvuru';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    if (!is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Require all denied\n");
    return $d;
}
function ap_doc_del(?string $f): void
{
    if ($f && preg_match('/^[a-f0-9]{32}\.bin$/', $f) && is_file(ap_dir() . '/' . $f)) @unlink(ap_dir() . '/' . $f);
}

/** Sitenin kök adresi (başvuru bağlantıları) */
function ap_site(): string
{
    if (defined('APP_URL') && APP_URL !== '') return rtrim((string)APP_URL, '/') . '/';
    $m = m_setting('site_url');
    return $m !== '' ? rtrim($m, '/') . '/' : (PHP_SAPI === 'cli' ? 'http://localhost/' : request_base_url());
}
function ap_status_url(string $token): string { return ap_site() . '#/basvuru/' . $token; }

/** Ad karşılaştırması: Türkçe harfler sadeleşir, "servisi / birimi / kliniği" gibi ekler düşer */
function ap_fold(string $s): string
{
    $s = mb_strtolower(str_replace(['I', 'İ'], ['ı', 'i'], $s));
    $s = strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u']);
    return trim((string)preg_replace('/\s+/', ' ', (string)preg_replace('/[^a-z0-9 ]+/', ' ', $s)));
}
function ap_norm(string $s): string
{
    $s = (string)preg_replace('/\b(servisi|servis|birimi|birim|klinigi|klinik|unitesi|unite|bolumu|bolum|ve|hastanesi|hastane)\b/', ' ', ap_fold($s));
    return trim((string)preg_replace('/\s+/', ' ', $s));
}
function ap_same(string $a, string $b): bool
{
    $x = ap_norm($a); $y = ap_norm($b);
    if ($x === '' || $y === '') return false;
    if ($x === $y) return true;
    return (mb_strlen($x) >= 4 && str_contains($y, $x)) || (mb_strlen($y) >= 4 && str_contains($x, $y));
}

/** Basit hız sınırı: $window saniyede en fazla $max */
function ap_hit(string $k, int $max, int $window, string $msg): void
{
    m_q('DELETE FROM ap_hits WHERE at < ?', [time() - 86400]);
    if ((int)m_val('SELECT COUNT(*) FROM ap_hits WHERE k = ? AND at > ?', [$k, time() - $window]) >= $max) fail($msg, 429);
    m_q('INSERT INTO ap_hits (k, at) VALUES (?, ?)', [$k, time()]);
}

function ap_domain(string $email): string { return mb_strtolower((string)substr((string)strrchr($email, '@'), 1)); }
function ap_corp(string $email): bool
{
    $d = ap_domain($email);
    foreach (preg_split('/[\s,;]+/', mb_strtolower(ap_cfg()['domains'])) as $x) {
        $x = ltrim(trim($x), '@.');
        if ($x !== '' && ($d === $x || str_ends_with($d, '.' . $x))) return true;
    }
    return false;
}
function ap_blocked(string $email): bool
{
    return (bool)m_val('SELECT 1 FROM ap_blocks WHERE k IN (?, ?)', ['e:' . hash('sha256', mb_strtolower($email)), 'd:' . ap_domain($email)]);
}

/** E-posta gönderen birim: seçilen ya da e-posta ayarı açık ilk birim (ana birim önce) */
function ap_mail_src(): ?array
{
    $want = ap_cfg()['mail_tkey'];
    $list = nm_tenants();
    usort($list, fn($a, $b) => ($b['tkey'] === $want) <=> ($a['tkey'] === $want) ?: (int)$b['is_default'] <=> (int)$a['is_default']);
    foreach ($list as $t) {
        if ($t['status'] !== 'active') continue;
        if (nm_tenant_peek_setting($t, 'mail_on') === '1' && filter_var(nm_tenant_peek_setting($t, 'mail_from'), FILTER_VALIDATE_EMAIL)) return $t;
    }
    return null;
}

/**
 * Başvuru e-postası. Bu istekte birim veritabanı açılmadıysa e-posta ayarı olan birime geçilir
 * (yalnız onun e-posta kuyruğu kullanılır); şablonda birim adı yerine genel ad görünür.
 */
function ap_mail(array $to, string $subject, string $title, array $lines, ?string $button = null, ?string $url = null): bool
{
    static $src = false;
    if ($src === false) {
        $src = ap_mail_src();
        if ($src && empty($GLOBALS['NM_DB_OPEN'])) nm_tenant_use($src);
        elseif ($src && (string)nm_tenant()['tkey'] !== (string)$src['tkey']) $src = null;
    }
    if (!$src || !mail_ready()) return false;
    $GLOBALS['NM_MAIL_ORG'] = 'dupcii';
    try { $n = mail_queue_to($to, $subject, $title, $lines, $button, $url, 'apply', false); }
    finally { unset($GLOBALS['NM_MAIL_ORG']); }
    return $n > 0;
}
function ap_mail_can(): bool { return ap_mail_src() !== null; }

/** Sistem yöneticilerine haber */
function ap_mail_sa(string $subject, array $lines): void
{
    $to = array_map(fn($r) => ['name' => (string)$r['name'], 'email' => (string)$r['email']], m_all('SELECT name, email FROM superadmins WHERE totp_on = 1'));
    if ($to) ap_mail($to, $subject, $subject, $lines, 'Sistem yönetimini aç', ap_site());
}

/** Belge: veri adresi (data:...;base64,) → [ikili, mime] ya da hata */
function ap_doc_take(string $data): array
{
    if (!preg_match('#^data:([a-z]+/[a-z0-9.+-]+);base64,(.+)$#s', $data, $m)) fail('Belge okunamadı.');
    $bin = base64_decode($m[2], true);
    if ($bin === false || $bin === '') fail('Belge okunamadı.');
    if (strlen($bin) > AP_DOC_MAX) fail('Belge en fazla 3 MB olabilir. Fotoğrafı küçültüp yeniden deneyin.');
    $mime = strncmp($bin, '%PDF', 4) === 0 ? 'application/pdf' : (strncmp($bin, "\xFF\xD8\xFF", 3) === 0 ? 'image/jpeg' : (strncmp($bin, "\x89PNG", 4) === 0 ? 'image/png' : ''));
    if ($mime === '') fail('Belge PDF, JPG ya da PNG olmalı.');
    return [$bin, $mime];
}
function ap_doc_store(string $bin): string
{
    $f = bin2hex(random_bytes(16)) . '.bin';
    if (file_put_contents(ap_dir() . '/' . $f, ap_enc($bin), LOCK_EX) === false) fail('Belge kaydedilemedi.', 500);
    return $f;
}

/** Kopya birim: aynı hastanede benzer adlı birim */
function ap_dup(?int $hid, string $unit): ?array
{
    if (!$hid) return null;
    foreach (m_all('SELECT tkey, name, status FROM tenants WHERE hospital_id = ?', [$hid]) as $t) if (ap_same($t['name'], $unit)) return $t;
    return null;
}

/** Bakım: eski kayıtlar ve belgeler (günde bir kez) */
function ap_gc(bool $force = false): void
{
    if (!ap_on()) return;
    $today = date('Y-m-d');
    if (!$force && m_setting('ap_gc_day') === $today) return;
    m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('ap_gc_day', ?)", [$today]);
    ap_ensure();
    $old = date('Y-m-d H:i:s', time() - 90 * 86400);
    foreach (m_all("SELECT id, doc FROM ap_apps WHERE status IN ('rejected', 'spam') AND COALESCE(decided_at, updated_at) < ?", [$old]) as $r) {
        ap_doc_del($r['doc']);
        m_q('DELETE FROM ap_votes WHERE app_id = ?', [$r['id']]);
        m_q('DELETE FROM ap_peer_sent WHERE app_id = ?', [$r['id']]);
        m_q('DELETE FROM ap_apps WHERE id = ?', [$r['id']]);
    }
    // Onaylanan başvurunun iletişim ayrıntıları 1 yıl sonra temizlenir (birim ve yönetici hesabı kalır)
    m_q("UPDATE ap_apps SET phone = '', note = '', reply = NULL, ip = '', ua = '' WHERE status = 'approved' AND decided_at < ?", [date('Y-m-d H:i:s', time() - 365 * 86400)]);
    // 60 gündür yanıtlanmayan bilgi isteği: başvuru kapanır
    foreach (m_all("SELECT id, doc FROM ap_apps WHERE status = 'info' AND updated_at < ?", [date('Y-m-d H:i:s', time() - 60 * 86400)]) as $r) {
        ap_doc_del($r['doc']);
        m_q("UPDATE ap_apps SET status = 'rejected', doc = NULL, sa_msg = 'İstenen bilgi 60 gün içinde gönderilmediği için başvuru kapandı.', decided_at = ?, decided_by = 'Otomatik' WHERE id = ?", [now(), $r['id']]);
    }
}

/** Başvurunun herkese açık özeti (durum sayfası) */
function ap_public(array $a): array
{
    $h = $a['hospital_id'] ? m_one('SELECT name FROM hospitals WHERE id = ?', [(int)$a['hospital_id']]) : null;
    $o = ['status' => $a['status'], 'status_txt' => AP_STATUS_TXT[$a['status']] ?? $a['status'], 'unit' => $a['unit_name'], 'hospital' => $h['name'] ?? $a['hospital_name'],
        'name' => $a['name'], 'email' => $a['email'], 'created_at' => $a['created_at'], 'updated_at' => $a['updated_at'], 'msg' => (string)($a['sa_msg'] ?? ''),
        'has_doc' => !empty($a['doc']), 'doc_mode' => ap_cfg()['doc']];
    if ($a['status'] === 'approved' && $a['tkey'] && ($t = nm_tenant_by_key((string)$a['tkey']))) $o['link'] = ap_site() . ((int)$t['is_default'] === 1 ? '' : '?b=' . $t['tkey']);
    return $o;
}
function ap_by_token(string $tok): array
{
    if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $tok)) fail('Başvuru bulunamadı.', 404);
    ap_ensure();
    return m_one('SELECT * FROM ap_apps WHERE token_hash = ?', [hash('sha256', $tok)]) ?? fail('Başvuru bulunamadı ya da silindi.', 404);
}
function ap_new_token(): array { $t = random_token(24); return [$t, hash('sha256', $t), base64_encode(ap_enc($t))]; }
function ap_token_of(array $a): string { return $a['token_enc'] !== '' ? ap_dec((string)base64_decode((string)$a['token_enc'])) : ''; }

function ap_need_open(): void
{
    if (!ap_on()) fail('Birim başvurusu bu kurulumda kullanılamaz.', 404);
    if (!ap_open()) fail('Birim başvuruları şu anda kapalı.', 403);
    ap_ensure();
}
/** Bu oturumda e-postası doğrulanan (ya da e-posta gönderilemeyen kurulumda yazılan) başvuran */
function ap_sess(): array
{
    $s = $_SESSION['ap'] ?? null;
    if (!is_array($s) || empty($s['email']) || (empty($s['ok']) && empty($s['nomail'])) || (int)($s['at'] ?? 0) < time() - 7200) fail('Önce e-posta adresinizi doğrulayın.', 401);
    return $s;
}

/* ---------------- Herkese açık uçlar (giriş gerekmez) ---------------- */

function a_apply_info(): void
{
    if (!ap_on()) out(['on' => false]);
    $c = ap_cfg();
    $s = $_SESSION['ap'] ?? [];
    out(['on' => $c['on'] === '1', 'doc' => $c['doc'], 'notice' => $c['notice'], 'peer' => $c['peer'] === '1',
        'verified' => is_array($s) && !empty($s['email']) && (!empty($s['ok']) || !empty($s['nomail'])) && (int)($s['at'] ?? 0) > time() - 7200 ? (string)$s['email'] : null]);
}

/** 1. adım: e-postaya 6 haneli kod */
function a_apply_code(): void
{
    ap_need_open();
    if (s('website', 100) !== '') out(['sent' => true]); // bot tuzağı: sessizce geç
    $email = mb_strtolower(trim(s('email', 190)));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi girin.');
    $ip = client_ip();
    ap_hit('ip:' . $ip, 12, 3600, 'Bu bağlantıdan çok fazla deneme yapıldı. Bir saat sonra tekrar deneyin.');
    ap_hit('em:' . hash('sha256', $email), 4, 3600, 'Bu e-postaya çok fazla kod gönderildi. Bir saat sonra tekrar deneyin.');
    if (ap_blocked($email)) fail('Bu e-posta adresiyle başvuru yapılamıyor.', 403);
    if (nm_dir_find($email)) fail('Bu e-posta zaten bir birimde kayıtlı. Bir kişi yalnız bir birimde hesap açabilir; başvuru için başka bir e-posta kullanın ya da hesabınızla giriş yapın.', 409);
    $open = m_one("SELECT * FROM ap_apps WHERE email = ? AND status IN ('pending', 'info') ORDER BY id DESC LIMIT 1", [$email]);
    if ($open) {
        // Bekleyen başvuru: durum bağlantısı yeniden gönderilir (başka bilgi verilmez)
        $tok = ap_token_of($open);
        if ($tok !== '') ap_mail([['name' => $open['name'], 'email' => $email]], 'Birim başvurunuz', 'Birim başvurunuz incelemede',
            ['"' . $open['unit_name'] . '" birimi için başvurunuz devam ediyor. Durumunu ve sistem yöneticisinin mesajlarını aşağıdaki bağlantıdan görebilirsiniz.'], 'Başvurumu gör', ap_status_url($tok));
        out(['pending' => true]);
    }
    if (!ap_mail_can()) {
        // E-posta ayarı olmayan kurulum: doğrulama yapılamaz, başvuru "e-posta doğrulanmadı" olarak işaretlenir
        $_SESSION['ap'] = ['email' => $email, 'nomail' => 1, 'at' => time()];
        out(['nomail' => true]);
    }
    $code = (string)random_int(100000, 999999);
    $_SESSION['ap'] = ['email' => $email, 'h' => hash('sha256', $email . '|' . $code), 'exp' => time() + 600, 'tries' => 0, 'at' => time()];
    $ok = ap_mail([['name' => $email, 'email' => $email]], 'Doğrulama kodu: ' . $code, 'E-posta doğrulama kodu',
        ['Birim açma başvurusu için doğrulama kodunuz:', $code, 'Kod 10 dakika geçerlidir. Bu başvuruyu siz başlatmadıysanız bu e-postayı yok sayın.']);
    if (!$ok) { $_SESSION['ap'] = ['email' => $email, 'nomail' => 1, 'at' => time()]; out(['nomail' => true]); }
    out(['sent' => true]);
}

function a_apply_verify(): void
{
    ap_need_open();
    $s = $_SESSION['ap'] ?? null;
    if (!is_array($s) || empty($s['h'])) fail('Önce kod isteyin.');
    if ((int)$s['exp'] < time()) fail('Kodun süresi doldu. Yeni kod isteyin.');
    if ((int)$s['tries'] >= 5) fail('Çok fazla hatalı deneme. Yeni kod isteyin.', 429);
    $code = preg_replace('/\D/', '', s('code', 12));
    if (!hash_equals((string)$s['h'], hash('sha256', $s['email'] . '|' . $code))) {
        $_SESSION['ap']['tries'] = (int)$s['tries'] + 1;
        fail('Kod hatalı.');
    }
    $_SESSION['ap'] = ['email' => $s['email'], 'ok' => 1, 'at' => time()];
    out(['email' => $s['email']]);
}

/** Hastane arama (yalnız e-postası doğrulanan başvurana) */
function a_apply_hospitals(): void
{
    ap_need_open();
    ap_sess();
    $q = ap_fold(s('q', 80));
    if (mb_strlen($q) < 2) out(['items' => []]);
    $o = [];
    foreach (m_all("SELECT id, name FROM hospitals WHERE status = 'active' ORDER BY name") as $h) {
        if (str_contains(ap_fold($h['name']), $q)) $o[] = ['id' => (int)$h['id'], 'name' => $h['name']];
        if (count($o) >= 8) break;
    }
    out(['items' => $o]);
}

/** Seçilen hastanede açık birimler (biriminiz zaten varsa yöneticisinden davet isteyin) */
function a_apply_units(): void
{
    ap_need_open();
    ap_sess();
    $hid = (int)(i('hospital_id') ?? 0);
    $h = m_one("SELECT id FROM hospitals WHERE id = ? AND status = 'active'", [$hid]) ?? fail('Hastane bulunamadı.', 404);
    out(['items' => array_map(fn($t) => (string)$t['name'], m_all("SELECT name FROM tenants WHERE hospital_id = ? AND status = 'active' ORDER BY name", [(int)$h['id']]))]);
}

/** 2. adım: başvuru */
function a_apply_submit(): void
{
    ap_need_open();
    $s = ap_sess();
    if (s('website', 100) !== '') out(['token' => random_token(24)]);
    $email = (string)$s['email'];
    $c = ap_cfg();
    $name = s('name', 120);
    $title = s('title', 60);
    $duty = s('duty', 60);
    $phone = preg_replace('/[^\d+]/', '', s('phone', 30));
    $unit = s('unit_name', 120);
    $hid = (int)(i('hospital_id') ?? 0) ?: null;
    $hname = s('hospital_name', 160);
    $city = s('city', 60);
    $staff = max(0, min(2000, (int)(i('staff') ?? 0)));
    $note = s('note', 1000);
    if (mb_strlen($name) < 5 || !str_contains($name, ' ')) fail('Adınızı ve soyadınızı yazın.');
    if (mb_strlen($title) < 2) fail('Unvanınızı yazın.');
    if (mb_strlen($duty) < 2) fail('Birimdeki görevinizi seçin.');
    $digits = preg_replace('/\D/', '', (string)$phone);
    if (strlen($digits) < 10 || strlen($digits) > 13) fail('Geçerli bir cep telefonu numarası yazın.');
    if (mb_strlen($unit) < 2) fail('Birim adını yazın.');
    if ($hid) {
        $h = m_one("SELECT * FROM hospitals WHERE id = ? AND status = 'active'", [$hid]) ?? fail('Hastane bulunamadı. Listede yoksa "Hastanem listede yok" seçeneğini kullanın.', 404);
        $hname = '';
    } else {
        if (mb_strlen($hname) < 5) fail('Hastanenin tam adını yazın.');
        if (mb_strlen($city) < 2) fail('Hastanenin bulunduğu ili yazın.');
    }
    if (!b('declare')) fail('Bilgilerin doğruluğunu ve birimde yetkili olduğunuzu onaylayın.');
    if (!b('kvkk')) fail('Aydınlatma metnini onaylayın.');
    if (nm_dir_find($email)) fail('Bu e-posta zaten bir birimde kayıtlı.', 409);
    if (m_val("SELECT 1 FROM ap_apps WHERE email = ? AND status IN ('pending', 'info')", [$email])) fail('Bu e-postayla incelemede olan bir başvuru var. Durum bağlantısı e-postanızda.', 409);
    // Aynı birim için incelemede başka başvuru varsa yine alınır (sistem yöneticisi görür), ama kopya engeli: aynı hastanede aynı adlı etkin birim
    $dup = ap_dup($hid, $unit);
    if ($dup && !b('dup_ok')) out(['dup' => $dup['name']]);
    ap_hit('sub:' . client_ip(), 10, 86400, 'Bu bağlantıdan bugün çok fazla başvuru yapıldı. Yarın tekrar deneyin.');
    $doc = null; $docName = null; $docMime = null; $docSize = 0;
    $data = is_string($GLOBALS['IN']['doc'] ?? null) ? (string)$GLOBALS['IN']['doc'] : '';
    if ($c['doc'] !== 'off' && $data !== '') {
        [$bin, $docMime] = ap_doc_take($data);
        $doc = ap_doc_store($bin); $docSize = strlen($bin);
        $docName = mb_substr(preg_replace('/[^\p{L}\p{N} ._()-]+/u', '', s('doc_name', 120)) ?: 'belge', 0, 120);
    }
    if ($c['doc'] === 'required' && !$doc) fail('Görevlendirme belgesi ya da kurum kimlik kartı ekleyin.');
    [$tok, $th, $te] = ap_new_token();
    m_q('INSERT INTO ap_apps (token_hash, token_enc, status, email, email_ok, name, title, duty, phone, hospital_id, hospital_name, city, unit_name, staff, note, doc, doc_name, doc_mime, doc_size, ip, ua, created_at, updated_at)
        VALUES (?, ?, \'pending\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$th, $te, $email, empty($s['ok']) ? 0 : 1, $name, $title, $duty, (string)$phone, $hid, $hname, $city, $unit, $staff, $note, $doc, $docName, $docMime, $docSize,
         client_ip(), mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200), now(), now()]);
    unset($_SESSION['ap']);
    $hn = $hid ? (string)$h['name'] : $hname . ' (yeni hastane)';
    ap_mail([['name' => $name, 'email' => $email]], 'Birim başvurunuz alındı', 'Başvurunuz alındı',
        ['"' . $unit . '" (' . $hn . ') birimi için başvurunuz incelemeye alındı.', 'Sonuç bu adrese e-postayla bildirilir. Durumu ve ek bilgi isteklerini aşağıdaki bağlantıdan takip edebilirsiniz; bağlantıyı kimseyle paylaşmayın.'],
        'Başvurumu gör', ap_status_url($tok));
    ap_mail_sa('Yeni birim başvurusu', [$hn . ' › ' . $unit, $name . ' · ' . $title . ' · ' . $duty, 'Sistem yönetimi › Başvurular sekmesinden inceleyin.']);
    out(['token' => $tok]);
}

function a_apply_status(): void
{
    if (!ap_on()) fail('Başvuru bulunamadı.', 404);
    $a = ap_by_token(s('token', 64));
    out(['app' => ap_public($a)]);
}

/** Bilgi istendiğinde başvuranın yanıtı (ve isteğe bağlı belge) */
function a_apply_reply(): void
{
    if (!ap_on()) fail('Başvuru bulunamadı.', 404);
    $a = ap_by_token(s('token', 64));
    if ($a['status'] !== 'info') fail('Bu başvuru için yanıt beklenmiyor.', 409);
    ap_hit('rep:' . $a['id'], 10, 86400, 'Bugün çok fazla yanıt gönderildi.');
    $text = s('text', 1500);
    $data = is_string($GLOBALS['IN']['doc'] ?? null) ? (string)$GLOBALS['IN']['doc'] : '';
    if ($text === '' && $data === '') fail('Yanıtınızı yazın ya da belge ekleyin.');
    $set = ['status' => 'pending', 'reply' => trim((string)$a['reply'] . "\n[" . substr(now(), 0, 16) . '] ' . $text), 'updated_at' => now()];
    if ($data !== '' && ap_cfg()['doc'] !== 'off') {
        [$bin, $mime] = ap_doc_take($data);
        ap_doc_del($a['doc']);
        $set += ['doc' => ap_doc_store($bin), 'doc_mime' => $mime, 'doc_size' => strlen($bin), 'doc_name' => mb_substr(preg_replace('/[^\p{L}\p{N} ._()-]+/u', '', s('doc_name', 120)) ?: 'belge', 0, 120)];
    }
    m_q('UPDATE ap_apps SET ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($set))) . ' WHERE id = ?', [...array_values($set), $a['id']]);
    ap_mail_sa('Birim başvurusuna yanıt geldi', [$a['unit_name'] . ' · ' . $a['name'], 'Sistem yönetimi › Başvurular sekmesinden inceleyin.']);
    out(['app' => ap_public(m_one('SELECT * FROM ap_apps WHERE id = ?', [$a['id']]))]);
}

/** Başvuran başvurusunu geri çeker: kayıt ve belge hemen silinir */
function a_apply_withdraw(): void
{
    if (!ap_on()) fail('Başvuru bulunamadı.', 404);
    $a = ap_by_token(s('token', 64));
    if (!in_array($a['status'], ['pending', 'info'], true)) fail('Sonuçlanmış başvuru geri çekilemez.', 409);
    ap_doc_del($a['doc']);
    m_q('DELETE FROM ap_votes WHERE app_id = ?', [$a['id']]);
    m_q('DELETE FROM ap_peer_sent WHERE app_id = ?', [$a['id']]);
    m_q('DELETE FROM ap_apps WHERE id = ?', [$a['id']]);
    out();
}

/* ---------------- Aynı hastanedeki birim yöneticilerinin teyidi ---------------- */

/** Bu birimin hastanesinde teyit bekleyen başvurular (birim yöneticisine) */
function ap_peer_list(array $me): array
{
    if (!ap_on() || ap_cfg()['peer'] !== '1' || $me['role'] !== 'admin' || !empty($me['sa_virtual'])) return [];
    ap_ensure();
    $t = nm_tenant();
    $rows = m_all("SELECT a.id, a.unit_name, a.name, a.title, a.duty, a.created_at, v.vote FROM ap_apps a
        LEFT JOIN ap_votes v ON v.app_id = a.id AND v.tkey = ? AND v.uid = ?
        WHERE a.hospital_id = ? AND a.status IN ('pending', 'info') AND a.created_at > ? ORDER BY a.id DESC LIMIT 10",
        [(string)$t['tkey'], (int)$me['id'], (int)$t['hospital_id'], date('Y-m-d H:i:s', time() - 30 * 86400)]);
    return array_map(fn($r) => ['id' => (int)$r['id'], 'unit' => $r['unit_name'], 'name' => $r['name'], 'title' => $r['title'], 'duty' => $r['duty'],
        'created_at' => $r['created_at'], 'vote' => $r['vote']], $rows);
}

function a_apply_peer_vote(): void
{
    $me = need_user();
    if (!ap_on() || ap_cfg()['peer'] !== '1' || $me['role'] !== 'admin' || !empty($me['sa_virtual'])) fail('Bu işlem için yetkiniz yok.', 403);
    ap_ensure();
    $t = nm_tenant();
    $a = m_one("SELECT * FROM ap_apps WHERE id = ? AND hospital_id = ? AND status IN ('pending', 'info')", [(int)i('id'), (int)$t['hospital_id']]) ?? fail('Başvuru bulunamadı ya da sonuçlandı.', 404);
    $vote = s('vote', 5);
    if (!in_array($vote, ['yes', 'no', 'skip'], true)) fail('Geçersiz yanıt.');
    if ($vote === 'skip') m_q('DELETE FROM ap_votes WHERE app_id = ? AND tkey = ? AND uid = ?', [$a['id'], $t['tkey'], $me['id']]);
    else m_q('INSERT OR REPLACE INTO ap_votes (app_id, tkey, uid, who, unit, vote, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$a['id'], $t['tkey'], $me['id'], $me['name'], $t['name'], $vote, s('note', 300), now()]);
    audit($me, 'apply.vote', $a['unit_name'], ['yes' => 'Tanıyorum', 'no' => 'Tanımıyorum', 'skip' => 'Yanıtı geri aldı'][$vote]);
    out(['items' => ap_peer_list($me)]);
}

$GLOBALS['NM_BOOT'][] = function (array $me): array {
    if (!ap_on() || $me['role'] !== 'admin') return [];
    try { $l = ap_peer_list($me); } catch (Throwable $e) { $l = []; }
    return $l ? ['apply_peer' => $l] : [];
};

/** Görev: yeni başvuruyu aynı hastanedeki birim yöneticilerine bir kez bildir; günlük bakım */
$GLOBALS['NM_JOBS']['apply_peer'] = function (bool $force) {
    if (!ap_on()) return;
    try { ap_gc(); } catch (Throwable $e) { error_log('[dupcii] başvuru bakımı: ' . $e->getMessage()); }
    if (ap_cfg()['peer'] !== '1') return;
    ap_ensure();
    $t = nm_tenant();
    if ($t['status'] !== 'active') return;
    $rows = m_all("SELECT a.* FROM ap_apps a LEFT JOIN ap_peer_sent s ON s.app_id = a.id AND s.tkey = ?
        WHERE a.hospital_id = ? AND a.status IN ('pending', 'info') AND s.app_id IS NULL AND a.created_at > ?", [(string)$t['tkey'], (int)$t['hospital_id'], date('Y-m-d H:i:s', time() - 14 * 86400)]);
    if (!$rows) return;
    $admins = all("SELECT * FROM users WHERE role = 'admin' AND status = 'active'");
    foreach ($rows as $a) {
        m_q('INSERT OR IGNORE INTO ap_peer_sent (app_id, tkey) VALUES (?, ?)', [$a['id'], $t['tkey']]);
        if ($admins && function_exists('notify_users')) notify_users($admins, 'apply', 'Hastanenizde yeni birim başvurusu',
            $a['name'] . ' (' . $a['title'] . '), "' . $a['unit_name'] . '" birimini açmak istiyor. Tanıyor musunuz?', '#/',
            ['subject' => 'Hastanenizde yeni birim başvurusu', 'heading' => 'Bu kişiyi tanıyor musunuz?',
             'lines' => [$a['name'] . ' (' . $a['title'] . ', ' . $a['duty'] . ') hastanenizde "' . $a['unit_name'] . '" birimini açmak için başvurdu.',
                 'Portalda ana sayfadaki kartta "Tanıyorum" ya da "Tanımıyorum" deyin. Yanıtınız yalnız sistem yöneticisine görünür ve başvurunun gerçek olup olmadığını anlamaya yardım eder.'],
             'button' => 'Portalı aç'], 'notoff');
    }
};

/* ---------------- Sistem yöneticisi ---------------- */

function ap_sa_row(array $a, array $votes, array $ipCount): array
{
    $hosp = $a['hospital_id'] ? m_one('SELECT id, name FROM hospitals WHERE id = ?', [(int)$a['hospital_id']]) : null;
    $match = null;
    if (!$hosp && $a['hospital_name'] !== '') foreach (m_all('SELECT id, name FROM hospitals ORDER BY id') as $h) if (ap_same($h['name'], $a['hospital_name'])) { $match = ['id' => (int)$h['id'], 'name' => $h['name']]; break; }
    $dup = $a['status'] === 'approved' ? null : ap_dup($a['hospital_id'] ? (int)$a['hospital_id'] : null, (string)$a['unit_name']);
    $yes = count(array_filter($votes, fn($v) => $v['vote'] === 'yes'));
    $no = count(array_filter($votes, fn($v) => $v['vote'] === 'no'));
    $dom = ap_domain((string)$a['email']);
    $corp = ap_corp((string)$a['email']);
    $free = in_array($dom, AP_FREE_MAIL, true);
    $same = max(0, ($ipCount[$a['ip']] ?? 1) - 1);
    $level = (!$a['email_ok'] || $no > 0 || $dup || $same >= 2) ? 'weak' : (($corp || $yes > 0) ? 'strong' : 'normal');
    $tk = $a['tkey'] ? nm_tenant_by_key((string)$a['tkey']) : null;
    return ['id' => (int)$a['id'], 'status' => $a['status'], 'status_txt' => AP_STATUS_TXT[$a['status']] ?? $a['status'],
        'email' => $a['email'], 'email_ok' => (bool)$a['email_ok'], 'domain' => $dom, 'corp' => $corp, 'free' => $free,
        'name' => $a['name'], 'title' => $a['title'], 'duty' => $a['duty'], 'phone' => $a['phone'],
        'hospital_id' => $hosp ? (int)$hosp['id'] : null, 'hospital' => $hosp['name'] ?? $a['hospital_name'], 'new_hospital' => !$hosp, 'hospital_match' => $match, 'city' => $a['city'],
        'unit' => $a['unit_name'], 'staff' => (int)$a['staff'], 'note' => $a['note'], 'reply' => (string)($a['reply'] ?? ''), 'sa_msg' => (string)($a['sa_msg'] ?? ''), 'sa_note' => (string)($a['sa_note'] ?? ''),
        'doc' => $a['doc'] ? ['name' => $a['doc_name'], 'mime' => $a['doc_mime'], 'size' => (int)$a['doc_size']] : null,
        'dup' => $dup ? $dup['name'] : null, 'yes' => $yes, 'no' => $no,
        'votes' => array_map(fn($v) => ['who' => $v['who'], 'unit' => $v['unit'], 'vote' => $v['vote'], 'note' => (string)$v['note'], 'at' => $v['at']], $votes),
        'same_ip' => $same, 'level' => $level, 'created_at' => $a['created_at'], 'updated_at' => $a['updated_at'],
        'decided_at' => $a['decided_at'], 'decided_by' => $a['decided_by'], 'tenant' => $tk ? $tk['name'] : null];
}

function a_sa_apply_list(): void
{
    need_sa();
    ap_ensure();
    try { ap_gc(); } catch (Throwable $e) { error_log('[dupcii] başvuru bakımı: ' . $e->getMessage()); }
    $f = s('filter', 10);
    $where = $f === 'done' ? "status IN ('approved', 'rejected', 'spam')" : ($f === 'all' ? '1 = 1' : "status IN ('pending', 'info')");
    $rows = m_all("SELECT * FROM ap_apps WHERE $where ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'info' THEN 1 ELSE 2 END, id DESC LIMIT 200");
    $ids = array_map(fn($r) => (int)$r['id'], $rows);
    $votes = [];
    if ($ids) foreach (m_all('SELECT * FROM ap_votes WHERE app_id IN (' . implode(',', $ids) . ') ORDER BY at') as $v) $votes[(int)$v['app_id']][] = $v;
    $ipc = [];
    foreach (m_all('SELECT ip, COUNT(*) AS n FROM ap_apps WHERE created_at > ? GROUP BY ip', [date('Y-m-d H:i:s', time() - 30 * 86400)]) as $r) $ipc[$r['ip']] = (int)$r['n'];
    $c = ap_cfg();
    $src = ap_mail_src();
    out(['items' => array_map(fn($r) => ap_sa_row($r, $votes[(int)$r['id']] ?? [], $ipc), $rows),
        'open' => (int)m_val("SELECT COUNT(*) FROM ap_apps WHERE status = 'pending'"),
        'cfg' => $c + ['mail_src' => $src ? $src['name'] : null, 'link' => ap_site() . '#/basvuru'],
        'hospitals' => array_map(fn($h) => ['id' => (int)$h['id'], 'name' => $h['name']], m_all('SELECT id, name FROM hospitals ORDER BY name')),
        'tenants' => array_map(fn($t) => ['key' => $t['tkey'], 'name' => $t['hospital_name'] . ' › ' . $t['name']], nm_tenants())]);
}

function a_sa_apply_cfg(): void
{
    $sa = need_sa();
    $c = ap_cfg();
    $n = [];
    foreach (['on', 'peer'] as $k) if (array_key_exists($k, $GLOBALS['IN'])) $n[$k] = b($k) ? '1' : '0';
    if (array_key_exists('doc', $GLOBALS['IN'])) $n['doc'] = in_array(s('doc', 10), ['off', 'optional', 'required'], true) ? s('doc', 10) : 'optional';
    if (array_key_exists('domains', $GLOBALS['IN'])) {
        $ds = array_map(fn($x) => ltrim(mb_strtolower(trim($x)), '@.'), preg_split('/[\s,;]+/', s('domains', 2000)));
        $ds = array_values(array_unique(array_filter($ds, fn($x) => (bool)preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $x))));
        $n['domains'] = implode("\n", array_slice($ds, 0, 50));
    }
    if (array_key_exists('notice', $GLOBALS['IN'])) $n['notice'] = s('notice', 500);
    if (array_key_exists('mail_tkey', $GLOBALS['IN'])) { $k = s('mail_tkey', 16); $n['mail_tkey'] = ($k === '' || nm_tenant_by_key($k)) ? $k : ''; }
    ap_cfg_put($n);
    $ch = [];
    foreach ($n as $k => $v) if (($c[$k] ?? null) !== $v) $ch[] = $k . '=' . (in_array($k, ['domains', 'notice'], true) ? '…' : $v);
    if ($ch) sa_audit($sa, 'apply.cfg', 'Birim başvuruları', implode(', ', $ch));
    out(['cfg' => ap_cfg()]);
}

/** Onay: hastane (gerekirse) + birim + başvuranın yönetici hesabı */
function a_sa_apply_approve(): void
{
    $sa = need_sa();
    ap_ensure();
    $a = m_one('SELECT * FROM ap_apps WHERE id = ?', [(int)i('id')]) ?? fail('Başvuru bulunamadı.', 404);
    if (!in_array($a['status'], ['pending', 'info'], true)) fail('Bu başvuru zaten sonuçlandı.', 409);
    $unit = s('unit_name', 120) ?: (string)$a['unit_name'];
    $name = s('admin_name', 120) ?: (string)$a['name'];
    $email = (string)$a['email'];
    if (mb_strlen($unit) < 2) fail('Birim adını girin.');
    if (nm_dir_find($email)) fail('Başvuranın e-postası bu arada başka bir birimde kayıt olmuş. Başvuruyu reddedin ya da başvurandan başka e-posta isteyin.', 409);
    $hid = (int)(i('hospital_id') ?? 0);
    if ($hid) {
        $h = m_one('SELECT * FROM hospitals WHERE id = ?', [$hid]) ?? fail('Hastane bulunamadı.', 404);
        if (!b('dup_ok') && ($d = ap_dup($hid, $unit))) fail('Bu hastanede "' . $d['name'] . '" birimi zaten var. Yine de açmak için onaylayın.', 409);
    } else {
        $hname = s('hospital_name', 160) ?: (string)$a['hospital_name'];
        if (mb_strlen($hname) < 3) fail('Hastane adını girin.');
        nm_tenants();
        m_q('INSERT INTO hospitals (name, created_at) VALUES (?, ?)', [$hname, now()]);
        $hid = (int)merkez()->lastInsertId();
        $h = ['id' => $hid, 'name' => $hname];
        sa_audit($sa, 'hospital.create', $hname, 'Birim başvurusundan');
    }
    $key = nm_new_key();
    m_q('INSERT INTO tenants (tkey, hospital_id, name, dir, status, is_default, created_at, note) VALUES (?, ?, ?, ?, ?, 0, ?, ?)', [$key, $hid, $unit, 'b', 'active', now(), 'Başvuruyla açıldı (#' . $a['id'] . ')']);
    sa_audit($sa, 'tenant.create', $h['name'] . ' › ' . $unit, $key . ' · başvuru #' . $a['id']);
    ap_doc_del($a['doc']);
    m_q("UPDATE ap_apps SET status = 'approved', tkey = ?, hospital_id = ?, doc = NULL, sa_msg = ?, decided_at = ?, decided_by = ?, updated_at = ? WHERE id = ?",
        [$key, $hid, s('msg', 1000), now(), (string)$sa['name'], now(), $a['id']]);
    sa_audit($sa, 'apply.approve', $h['name'] . ' › ' . $unit, $email);
    $src = ap_mail_src();
    $t = nm_tenant_by_key($key);
    $r = sa_make_admin($sa, $t, $name, $email, $src ? (string)$src['tkey'] : '', b('send_email'));
    out($r + ['key' => $key]);
}

/** Ret / bilgi iste / geçersiz / yeniden aç / not / sil / engelle */
function a_sa_apply_decide(): void
{
    $sa = need_sa();
    ap_ensure();
    $a = m_one('SELECT * FROM ap_apps WHERE id = ?', [(int)i('id')]) ?? fail('Başvuru bulunamadı.', 404);
    $act = s('act', 10);
    $msg = s('msg', 1000);
    $tok = ap_token_of($a);
    $to = [['name' => $a['name'], 'email' => $a['email']]];
    $mailed = false;
    switch ($act) {
        case 'note':
            m_q('UPDATE ap_apps SET sa_note = ? WHERE id = ?', [$msg, $a['id']]);
            out();
        case 'info':
            if (!in_array($a['status'], ['pending', 'info'], true)) fail('Sonuçlanmış başvuruda bilgi istenemez.', 409);
            if (mb_strlen($msg) < 5) fail('Başvurandan ne istediğinizi yazın.');
            m_q("UPDATE ap_apps SET status = 'info', sa_msg = ?, updated_at = ? WHERE id = ?", [$msg, now(), $a['id']]);
            if ($tok !== '') $mailed = ap_mail($to, 'Birim başvurunuz için ek bilgi gerekiyor', 'Ek bilgi gerekiyor', ['"' . $a['unit_name'] . '" başvurunuz için sistem yöneticisinin mesajı:', $msg, 'Yanıtınızı ve istenen belgeyi aşağıdaki bağlantıdan gönderebilirsiniz.'], 'Yanıtla', ap_status_url($tok));
            break;
        case 'reject':
            if (!in_array($a['status'], ['pending', 'info'], true)) fail('Bu başvuru zaten sonuçlandı.', 409);
            if (mb_strlen($msg) < 5) fail('Ret gerekçesini yazın (başvurana gönderilir).');
            ap_doc_del($a['doc']);
            m_q("UPDATE ap_apps SET status = 'rejected', doc = NULL, sa_msg = ?, decided_at = ?, decided_by = ?, updated_at = ? WHERE id = ?", [$msg, now(), (string)$sa['name'], now(), $a['id']]);
            $mailed = ap_mail($to, 'Birim başvurunuz sonuçlandı', 'Başvurunuz onaylanmadı', ['"' . $a['unit_name'] . '" birimi için başvurunuz onaylanmadı.', 'Gerekçe: ' . $msg, 'Bilgileri düzelterek yeniden başvurabilirsiniz.']);
            break;
        case 'spam':
            ap_doc_del($a['doc']);
            m_q("UPDATE ap_apps SET status = 'spam', doc = NULL, decided_at = ?, decided_by = ?, updated_at = ? WHERE id = ?", [now(), (string)$sa['name'], now(), $a['id']]);
            if (b('block')) m_q('INSERT OR REPLACE INTO ap_blocks (k, at) VALUES (?, ?)', ['e:' . hash('sha256', mb_strtolower((string)$a['email'])), now()]);
            break;
        case 'reopen':
            if (!in_array($a['status'], ['rejected', 'spam'], true)) fail('Yalnız reddedilen başvuru yeniden açılır.', 409);
            m_q("UPDATE ap_apps SET status = 'pending', decided_at = NULL, decided_by = NULL, updated_at = ? WHERE id = ?", [now(), $a['id']]);
            m_q('DELETE FROM ap_blocks WHERE k = ?', ['e:' . hash('sha256', mb_strtolower((string)$a['email']))]);
            break;
        case 'delete':
            ap_doc_del($a['doc']);
            m_q('DELETE FROM ap_votes WHERE app_id = ?', [$a['id']]);
            m_q('DELETE FROM ap_peer_sent WHERE app_id = ?', [$a['id']]);
            m_q('DELETE FROM ap_apps WHERE id = ?', [$a['id']]);
            break;
        default:
            fail('Bu işlem yapılamadı. Sayfayı yenileyip tekrar deneyin.');
    }
    sa_audit($sa, 'apply.' . $act, (string)$a['unit_name'], (string)$a['email']);
    out(['mailed' => $mailed]);
}

/** Belgeyi görüntüle (yalnız sistem yöneticisi; şifresi çözülerek akıtılır) */
function a_sa_apply_doc(): void
{
    if (!ap_on() || !sa_current()) { http_response_code(401); exit; }
    ap_ensure();
    $a = m_one('SELECT doc, doc_name, doc_mime FROM ap_apps WHERE id = ?', [(int)($_GET['id'] ?? 0)]);
    if (!$a || !$a['doc'] || !preg_match('/^[a-f0-9]{32}\.bin$/', (string)$a['doc']) || !is_file(ap_dir() . '/' . $a['doc'])) { http_response_code(404); exit; }
    $bin = ap_dec((string)file_get_contents(ap_dir() . '/' . $a['doc']));
    if ($bin === '') { http_response_code(410); exit; }
    $mime = in_array($a['doc_mime'], ['application/pdf', 'image/jpeg', 'image/png'], true) ? $a['doc_mime'] : 'application/octet-stream';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($bin));
    header('Content-Disposition: inline; filename="belge' . ($mime === 'application/pdf' ? '.pdf' : ($mime === 'image/png' ? '.png' : '.jpg')) . '"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    // Görsel tamamen yalıtılır; PDF'te "sandbox" tarayıcının PDF görüntüleyicisini engellediği için yalnız kaynak kısıtı
    header($mime === 'application/pdf' ? "Content-Security-Policy: default-src 'none'; frame-ancestors 'none'" : "Content-Security-Policy: sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
    echo $bin;
    exit;
}
$GLOBALS['NM_GET']['sa.apply.doc'] = 'a_sa_apply_doc';

/** Bekleyen başvuru sayısı (sistem paneli sekme rozeti) */
function ap_sa_count(): int
{
    if (!ap_on()) return 0;
    try { ap_ensure(); return (int)m_val("SELECT COUNT(*) FROM ap_apps WHERE status = 'pending'"); } catch (Throwable $e) { return 0; }
}

return [
    'apply.info' => 'a_apply_info',
    'apply.code' => 'a_apply_code',
    'apply.verify' => 'a_apply_verify',
    'apply.hospitals' => 'a_apply_hospitals',
    'apply.units' => 'a_apply_units',
    'apply.submit' => 'a_apply_submit',
    'apply.status' => 'a_apply_status',
    'apply.reply' => 'a_apply_reply',
    'apply.withdraw' => 'a_apply_withdraw',
    'peer.apply.vote' => 'a_apply_peer_vote',
    'sa.apply.list' => 'a_sa_apply_list',
    'sa.apply.cfg' => 'a_sa_apply_cfg',
    'sa.apply.approve' => 'a_sa_apply_approve',
    'sa.apply.decide' => 'a_sa_apply_decide',
];
