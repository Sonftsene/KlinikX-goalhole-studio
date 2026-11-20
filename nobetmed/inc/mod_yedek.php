<?php
/**
 * Sunucu dışı şifreli yedek (4.17) — yalnız çok birimli (SQLite) kurulumda, sistem yöneticisi yönetir.
 *
 * Merkez, tüm birimler ve hastane ortak veritabanlarının tutarlı kopyası (SQLite "VACUUM INTO") tek bir
 * AES-256 şifreli ZIP'e konur (7-Zip / WinRAR / Mac Arşiv İzlencesi ile şifreyle açılır). Haftada bir, seçilen
 * günde yedek e-posta adresine ek olarak gönderilir; panelden "Şimdi gönder" ve "İndir" de vardır.
 * Yüklenen dosyalar (belgeler, fotoğraflar) e-posta boyutuna sığmadığından eklenmez.
 * Ayarlar m_settings 'obk_*' (şifre AES-GCM ile şifreli).
 */
declare(strict_types=1);

const OBK_DEFAULTS = ['on' => '0', 'email' => '', 'pass' => '', 'day' => '1', 'max_mb' => '20', 'last' => '', 'last_status' => '', 'last_size' => '0'];

function obk_on(): bool { return function_exists('nm_multi') && nm_multi(); }
function obk_cfg(): array
{
    $c = OBK_DEFAULTS;
    if (!obk_on()) return $c;
    foreach (m_all("SELECT k, v FROM m_settings WHERE k LIKE 'obk\\_%' ESCAPE '\\'") as $r) { $k = substr((string)$r['k'], 4); if (array_key_exists($k, $c)) $c[$k] = (string)$r['v']; }
    return $c;
}
function obk_put(array $kv): void { foreach ($kv as $k => $v) m_q('INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)', ['obk_' . $k, (string)$v]); }
function obk_key(): string { return hash('sha256', 'obk|' . m_setting('secret'), true); }
function obk_enc(string $v): string { $iv = random_bytes(12); $c = openssl_encrypt($v, 'aes-256-gcm', obk_key(), OPENSSL_RAW_DATA, $iv, $tag); return base64_encode($iv . $tag . $c); }
function obk_dec(string $v): string
{
    $b = base64_decode($v, true);
    if ($b === false || strlen($b) < 29) return '';
    $p = openssl_decrypt(substr($b, 28), 'aes-256-gcm', obk_key(), OPENSSL_RAW_DATA, substr($b, 0, 12), substr($b, 12, 16));
    return $p === false ? '' : $p;
}
function obk_zip_ok(): bool { return class_exists('ZipArchive') && defined('ZipArchive::EM_AES_256') && method_exists('ZipArchive', 'setEncryptionName'); }
function obk_tmp(): string
{
    $d = NM_ROOT . '/data/merkez/tmp';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    if (!is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Require all denied\n");
    foreach (glob($d . '/*') ?: [] as $f) if (is_file($f) && filemtime($f) < time() - 3600 && basename($f) !== '.htaccess') @unlink($f);
    return $d;
}
/** Çalışan SQLite veritabanının tutarlı kopyası */
function obk_snap(string $src, string $dst): bool
{
    try {
        $p = new PDO('sqlite:' . $src, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $p->exec('PRAGMA busy_timeout = 8000');
        $p->exec('VACUUM INTO ' . $p->quote($dst));
        $p = null;
        return is_file($dst);
    } catch (Throwable $e) {
        // Eski SQLite: düz kopya (WAL dosyasıyla birlikte)
        if (!@copy($src, $dst)) return false;
        if (is_file($src . '-wal')) @copy($src . '-wal', $dst . '-wal');
        return true;
    }
}
function obk_slug(string $s): string
{
    $s = strtr($s, ['ç' => 'c', 'Ç' => 'C', 'ğ' => 'g', 'Ğ' => 'G', 'ı' => 'i', 'İ' => 'I', 'ö' => 'o', 'Ö' => 'O', 'ş' => 's', 'Ş' => 'S', 'ü' => 'u', 'Ü' => 'U']);
    return trim((string)preg_replace('/[^A-Za-z0-9]+/', '-', $s), '-') ?: 'x';
}

/** Şifreli yedek ZIP'i oluşturur: [yol, bayt, birim sayısı] */
function obk_build(string $pass): array
{
    if (!obk_zip_ok()) throw new RuntimeException('Sunucudaki PHP şifreli ZIP desteklemiyor (zip eklentisi / libzip eski). Hosting desteğinden PHP zip eklentisini güncellemesini isteyin.');
    if (mb_strlen($pass) < 10) throw new RuntimeException('Yedek şifresi ayarlanmamış.');
    @set_time_limit(300);
    $tmp = obk_tmp();
    $id = date('Ymd-His') . '-' . bin2hex(random_bytes(4));
    $zipPath = $tmp . '/yedek-' . $id . '.zip';
    $files = []; $snaps = [];
    $snap = function (string $src, string $name) use (&$files, &$snaps, $tmp, $id) {
        if (!is_file($src)) return;
        $dst = $tmp . '/s-' . $id . '-' . count($snaps) . '.sqlite';
        if (obk_snap($src, $dst)) { $snaps[] = $dst; $files[$name] = $dst; if (is_file($dst . '-wal')) { $snaps[] = $dst . '-wal'; $files[$name . '-wal'] = $dst . '-wal'; } }
    };
    $mdir = NM_ROOT . '/data/merkez';
    foreach (glob($mdir . '/m-*.sqlite') ?: [] as $f) $snap($f, 'merkez/' . basename($f));
    $n = 0;
    foreach (nm_tenants() as $t) {
        $f = nm_tenant_db_file($t);
        if (!$f) continue;
        $n++;
        $snap($f, 'birimler/' . obk_slug((string)($t['hospital_name'] ?? 'hastane')) . '--' . obk_slug((string)$t['name']) . '--' . $t['tkey'] . '/' . basename($f));
    }
    foreach (glob(NM_ROOT . '/data/h/*/h-*.sqlite') ?: [] as $f) $snap($f, 'hastaneler/' . basename(dirname($f)) . '/' . basename($f));
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Yedek dosyası oluşturulamadı.');
    foreach ($files as $name => $path) {
        $zip->addFile($path, $name);
        $zip->setEncryptionName($name, ZipArchive::EM_AES_256, $pass);
    }
    $readme = "dupcii sunucu dışı yedek\nOluşturma: " . now() . "\nİçerik: merkez veritabanı, $n birim veritabanı, hastane ortak veritabanları (SQLite).\n"
        . "Açmak için: 7-Zip (Windows), Keka / The Unarchiver (Mac) ya da WinRAR; sistem yönetiminde belirlediğiniz yedek şifresi.\n"
        . "Geri yükleme: KURULUM.md › 31. bölüm. Yüklenen dosyalar (belgeler, fotoğraflar) bu yedekte yoktur; hosting yedeğinden alınır.\n";
    $zip->addFromString('BENIOKU.txt', $readme);
    $zip->close();
    foreach ($snaps as $s) @unlink($s);
    clearstatcache();
    return [$zipPath, (int)filesize($zipPath), $n];
}

/** Yedeği oluşturup e-postayla gönderir; durum metni döner (e-posta ayarı olan birimin bağlamında çalışmalı) */
function obk_send(string $why): string
{
    $c = obk_cfg();
    $pass = obk_dec($c['pass']);
    if (!filter_var($c['email'], FILTER_VALIDATE_EMAIL)) return obk_status(false, 'Yedek e-posta adresi girilmemiş.', 0);
    if (!function_exists('mail_ready') || !mail_ready()) return obk_status(false, 'E-posta ayarı olan birim bulunamadı (Birime gir › Ayarlar › E-posta).', 0);
    try { [$path, $size, $n] = obk_build($pass); }
    catch (Throwable $e) { return obk_status(false, $e->getMessage(), 0); }
    $max = max(1, (int)$c['max_mb']) * 1024 * 1024;
    if ($size > $max) { @unlink($path); return obk_status(false, 'Yedek ' . round($size / 1048576, 1) . ' MB; e-posta sınırını (' . (int)$c['max_mb'] . ' MB) aşıyor. Panelden “İndir” ile alın ya da sınırı yükseltin.', $size); }
    $GLOBALS['NM_MAIL_ORG'] = 'dupcii';
    [$htmlB, $text] = mail_template('Sunucu dışı yedek', ['Ekteki dosya, ' . $n . ' birimin ve sistemin veritabanlarının ' . date('d.m.Y H:i') . ' tarihli şifreli yedeğidir (' . round($size / 1048576, 2) . ' MB).',
        'Dosya, sistem yönetiminde belirlediğiniz yedek şifresiyle 7-Zip, WinRAR ya da Mac’te Keka ile açılır. Şifre bu e-postada yoktur.', 'Bu e-postayı silmeyin; en az son 4 yedeği saklayın.']);
    unset($GLOBALS['NM_MAIL_ORG']);
    $res = mail_send_batch([['id' => 1, 'to_email' => $c['email'], 'to_name' => 'Yedek', 'subject' => 'dupcii yedek · ' . date('Y-m-d'), 'html' => $htmlB, 'text_body' => $text,
        'attach' => [['name' => 'dupcii-yedek-' . date('Y-m-d') . '.zip', 'mime' => 'application/zip', 'path' => $path]]]]);
    @unlink($path);
    $ok = ($res[1] ?? null) === true;
    return obk_status($ok, $ok ? 'Gönderildi (' . $why . ')' : 'Gönderilemedi: ' . (string)($res[1] ?? 'bilinmeyen hata'), $size);
}
function obk_status(bool $ok, string $msg, int $size): string
{
    obk_put(['last' => now(), 'last_status' => ($ok ? 'ok|' : 'err|') . mb_substr($msg, 0, 300), 'last_size' => (string)$size]);
    return ($ok ? 'ok|' : 'err|') . $msg;
}

/** Görev: seçilen günde, e-posta ayarı olan birimin görev sırasında haftada bir */
$GLOBALS['NM_JOBS']['offsite_backup'] = function (bool $force) {
    if (!obk_on()) return;
    $c = obk_cfg();
    if ($c['on'] !== '1' || $c['email'] === '' || $c['pass'] === '') return;
    if ((int)date('N') !== (int)$c['day'] || (int)date('G') < 3) return;
    if (substr($c['last'], 0, 10) === date('Y-m-d')) return;
    $src = function_exists('ap_mail_src') ? ap_mail_src() : null;
    if (!$src || (string)$src['tkey'] !== (string)nm_tenant()['tkey']) return;
    // Aynı anda iki süreç göndermesin
    m_q("INSERT OR IGNORE INTO m_settings (k, v) VALUES ('obk_last', '')");
    if (m_q("UPDATE m_settings SET v = ? WHERE k = 'obk_last' AND v = ?", [date('Y-m-d') . ' 00:00:00', $c['last']])->rowCount() !== 1) return;
    obk_send('haftalık');
};

/* ---------------- Sistem yöneticisi ---------------- */

function obk_out(): array
{
    $c = obk_cfg();
    $src = function_exists('ap_mail_src') ? ap_mail_src() : null;
    [$st, $msg] = array_pad(explode('|', $c['last_status'], 2), 2, '');
    return ['on' => $c['on'] === '1', 'email' => $c['email'], 'pass_set' => $c['pass'] !== '', 'day' => (int)$c['day'], 'max_mb' => (int)$c['max_mb'],
        'last' => $c['last'] ?: null, 'last_ok' => $st === 'ok', 'last_msg' => $msg, 'last_size' => (int)$c['last_size'],
        'zip_ok' => obk_zip_ok(), 'mail_src' => $src ? $src['name'] : null];
}
function a_sa_obk_get(): void { need_sa(); if (!obk_on()) fail('Yalnız çok birimli kurulumda.', 400); out(obk_out()); }
function a_sa_obk_save(): void
{
    $sa = need_sa();
    $n = [];
    if (array_key_exists('on', $GLOBALS['IN'])) $n['on'] = b('on') ? '1' : '0';
    if (array_key_exists('email', $GLOBALS['IN'])) { $e = s('email', 190); if ($e !== '' && !filter_var($e, FILTER_VALIDATE_EMAIL)) fail('Geçerli bir e-posta adresi girin.'); $n['email'] = $e; }
    if (array_key_exists('day', $GLOBALS['IN'])) $n['day'] = (string)max(1, min(7, (int)i('day')));
    if (array_key_exists('max_mb', $GLOBALS['IN'])) $n['max_mb'] = (string)max(1, min(50, (int)i('max_mb')));
    $pw = (string)($GLOBALS['IN']['pass'] ?? '');
    if ($pw !== '') {
        if (mb_strlen($pw) < 10) fail('Yedek şifresi en az 10 karakter olmalı.');
        $n['pass'] = obk_enc($pw);
    }
    $c = obk_cfg();
    if (($n['on'] ?? $c['on']) === '1') {
        if (($n['email'] ?? $c['email']) === '') fail('Önce yedeklerin gideceği e-posta adresini girin.');
        if (($n['pass'] ?? $c['pass']) === '') fail('Önce yedek şifresini belirleyin.');
        if (!obk_zip_ok()) fail('Sunucudaki PHP şifreli ZIP desteklemiyor; hosting desteğinden PHP zip eklentisini isteyin.');
    }
    obk_put($n);
    sa_audit($sa, 'backup.cfg', 'Sunucu dışı yedek', 'açık=' . ($n['on'] ?? $c['on']) . (isset($n['pass']) ? ', şifre değişti' : ''));
    out(obk_out());
}
/** Şimdi gönder: e-posta ayarı olan birimin bağlamında (bu istekte başka birim veritabanı açılmaz) */
function a_sa_obk_run(): void
{
    $sa = need_sa();
    $src = function_exists('ap_mail_src') ? ap_mail_src() : null;
    if (!$src) fail('Hiçbir birimde e-posta ayarı yok. Bir birime girip Ayarlar › E-posta bölümünü doldurun.', 409);
    nm_tenant_use($src);
    $r = obk_send('elle');
    sa_audit($sa, 'backup.send', 'Sunucu dışı yedek', $r);
    if (strncmp($r, 'ok|', 3) !== 0) fail(substr($r, 4), 409);
    out(obk_out());
}
/** İndir (GET): aynı şifreli ZIP */
function a_sa_obk_download(): void
{
    if (!obk_on() || !($sa = sa_current())) { http_response_code(401); exit; }
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), (string)($_GET['csrf'] ?? ''))) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); echo 'Oturum süresi doldu; sayfayı yenileyip tekrar deneyin.'; exit; }
    try { [$path, $size] = obk_build(obk_dec(obk_cfg()['pass'])); }
    catch (Throwable $e) { http_response_code(409); header('Content-Type: text/plain; charset=utf-8'); echo $e->getMessage(); exit; }
    sa_audit($sa, 'backup.download', 'Sunucu dışı yedek', round($size / 1048576, 2) . ' MB');
    header('Content-Type: application/zip');
    header('Content-Length: ' . $size);
    header('Content-Disposition: attachment; filename="dupcii-yedek-' . date('Y-m-d') . '.zip"');
    header('Cache-Control: no-store');
    readfile($path);
    @unlink($path);
    exit;
}
$GLOBALS['NM_GET']['sa.obk.download'] = 'a_sa_obk_download';

return [
    'sa.obk.get' => 'a_sa_obk_get',
    'sa.obk.save' => 'a_sa_obk_save',
    'sa.obk.run' => 'a_sa_obk_run',
];
