<?php
/**
 * Sistem sağlığı (4.18): canlıya geçiş ve işletim denetimleri tek ekranda.
 * Çok birimli kurulumda sistem yöneticisi (sa.health), tek birimli kurulumda birim yöneticisi (health.get) görür.
 * Denetimler yalnız okur; hiçbir ayarı değiştirmez. Her madde: durum (ok | warn | err | info), açıklama, nasıl düzeltilir.
 */
declare(strict_types=1);

const HL_DKIM_SELECTORS = ['hostingermail1', 'hostingermail2', 'hostingermail3', 'default', 'google', 'selector1', 'selector2', 'k1', 'mail', 'dkim', 's1', 's2'];

function hl_item(string $t, string $s, string $d, string $f = ''): array { return ['t' => $t, 's' => $s, 'd' => $d, 'f' => $f]; }
function hl_ago(?int $ts): string
{
    if (!$ts) return 'hiç';
    $d = time() - $ts;
    if ($d < 90) return 'az önce';
    if ($d < 3600) return round($d / 60) . ' dakika önce';
    if ($d < 172800) return round($d / 3600) . ' saat önce';
    return round($d / 86400) . ' gün önce';
}
function hl_bytes(string $v): int
{
    $v = trim($v); if ($v === '' || $v === '-1') return PHP_INT_MAX;
    $n = (float)$v;
    switch (strtolower(substr($v, -1))) { case 'g': $n *= 1024; case 'm': $n *= 1024; case 'k': $n *= 1024; }
    return (int)$n;
}
function hl_mb(float $b): string { return $b >= 1073741824 ? round($b / 1073741824, 1) . ' GB' : round($b / 1048576, 1) . ' MB'; }

/** DNS TXT kayıtları (sunucu izin vermezse null) */
function hl_txt(string $host): ?array
{
    static $spent = 0.0;
    if (!function_exists('dns_get_record') || $spent > 6.0) return null; // yavaş DNS paneli bekletmesin
    $t0 = microtime(true);
    $r = @dns_get_record($host, DNS_TXT);
    $spent += microtime(true) - $t0;
    if ($r === false) return null;
    return array_map(fn($x) => (string)($x['txt'] ?? implode('', (array)($x['entries'] ?? []))), $r);
}

/** E-posta ayarı: [gönderen adres, kuyruk PDO'su ya da null, birim adı] */
function hl_mail_ctx(): array
{
    if (nm_multi()) {
        $src = function_exists('ap_mail_src') ? ap_mail_src() : null;
        if (!$src) return ['', null, ''];
        return [nm_tenant_peek_setting($src, 'mail_from'), nm_tenant_peek($src), (string)$src['name']];
    }
    return [setting('mail_on') === '1' ? (string)setting('mail_from') : '', db(), ''];
}

function hl_checks(): array
{
    $multi = nm_multi();
    $G = [];

    /* ---------- Sunucu ---------- */
    $S = [];
    $pv = PHP_VERSION;
    $S[] = version_compare($pv, '8.1', '>=') ? hl_item('PHP sürümü', 'ok', $pv)
        : hl_item('PHP sürümü', 'warn', $pv . ' (desteği bitti)', 'hPanel › Gelişmiş › PHP Yapılandırması › PHP sürümünü 8.2 ya da üstüne çıkarın.');
    $need = ['pdo' => 'PDO', $multi || DB_DRIVER !== 'mysql' ? 'pdo_sqlite' : 'pdo_mysql' => 'Veritabanı sürücüsü', 'openssl' => 'Şifreleme (OpenSSL)', 'mbstring' => 'Türkçe metin (mbstring)', 'json' => 'JSON'];
    $opt = ['curl' => 'cURL (ödeme, Google eşitleme)', 'zip' => 'ZIP (yedek, Excel)', 'fileinfo' => 'Dosya türü (fileinfo)'];
    $miss = array_values(array_filter(array_keys($need), fn($e) => !extension_loaded($e)));
    $missO = array_values(array_filter(array_keys($opt), fn($e) => !extension_loaded($e)));
    $S[] = $miss ? hl_item('PHP eklentileri', 'err', 'Eksik: ' . implode(', ', array_map(fn($e) => $need[$e], $miss)), 'hPanel › PHP Yapılandırması › PHP Eklentileri bölümünden açın.')
        : ($missO ? hl_item('PHP eklentileri', 'warn', 'Eksik: ' . implode(', ', array_map(fn($e) => $opt[$e], $missO)), 'hPanel › PHP Yapılandırması › PHP Eklentileri bölümünden açın.')
            : hl_item('PHP eklentileri', 'ok', 'Gerekli eklentilerin hepsi açık'));
    $https = PHP_SAPI !== 'cli' && nm_is_https();
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    $local = (bool)preg_match('/^(localhost|127\.|\[::1\])/', $host);
    $S[] = $https ? hl_item('HTTPS', 'ok', 'Bağlantı şifreli') : hl_item('HTTPS', $local ? 'info' : 'err', $local ? 'Yerel test sunucusu' : 'Site şifresiz (http) açılıyor', 'hPanel › Güvenlik › SSL bölümünden ücretsiz sertifikayı kurun ve “HTTPS’e zorla”yı açın.');
    $up = min(hl_bytes((string)ini_get('upload_max_filesize')), hl_bytes((string)ini_get('post_max_size')));
    $S[] = $up >= 8 * 1048576 ? hl_item('Dosya yükleme sınırı', 'ok', hl_mb($up) . ' (büyük dosyalar parça parça yüklenir)')
        : hl_item('Dosya yükleme sınırı', 'warn', hl_mb($up), 'Büyük dosyalar parça parça yüklenir; yine de hPanel › PHP Yapılandırması’ndan upload_max_filesize ve post_max_size değerini 64M yapın.');
    $mem = hl_bytes((string)ini_get('memory_limit'));
    $S[] = $mem >= 128 * 1048576 ? hl_item('Bellek sınırı', 'ok', $mem === PHP_INT_MAX ? 'sınırsız' : hl_mb($mem)) : hl_item('Bellek sınırı', 'warn', hl_mb($mem), 'hPanel › PHP Yapılandırması’ndan memory_limit değerini en az 256M yapın.');
    $dataMb = nm_dir_size(NM_ROOT . '/data', false) / 1048576;
    $upMb = nm_dir_size(NM_ROOT . '/uploads', false) / 1048576;
    $free = function_exists('disk_free_space') ? @disk_free_space(NM_ROOT) : false;
    $S[] = hl_item('Disk kullanımı', $free !== false && $free < 500 * 1048576 ? 'warn' : 'info', 'Veritabanları ' . round($dataMb, 1) . ' MB · dosyalar ' . round($upMb, 1) . ' MB' . ($free !== false ? ' · boş alan ' . hl_mb((float)$free) : ''),
        $free !== false && $free < 500 * 1048576 ? 'Boş alan azaldı; hosting paketinizin disk kotasını kontrol edin, eski yedekleri silin.' : '');
    $wr = [];
    foreach (['data', 'uploads', 'data/sessions'] as $d) if (is_dir(NM_ROOT . '/' . $d) && !is_writable(NM_ROOT . '/' . $d)) $wr[] = $d;
    $S[] = $wr ? hl_item('Yazma izinleri', 'err', 'Yazılamıyor: ' . implode(', ', $wr), 'Dosya yöneticisinde bu klasörlerin iznini 755 yapın.') : hl_item('Yazma izinleri', 'ok', 'data ve uploads yazılabilir');
    $prot = [];
    foreach (['.htaccess', 'data/.htaccess', 'uploads/.htaccess', 'inc/.htaccess'] as $f) if (!is_file(NM_ROOT . '/' . $f)) $prot[] = $f;
    $sw = (string)($_SERVER['SERVER_SOFTWARE'] ?? '');
    $apache = $sw === '' || stripos($sw, 'apache') !== false || stripos($sw, 'litespeed') !== false;
    $S[] = $prot ? hl_item('Korumalı klasörler', 'err', 'Eksik koruma dosyası: ' . implode(', ', $prot), 'Paketi yeniden yükleyin; .htaccess dosyaları gizli dosya olduğu için dosya yöneticisinde “gizli dosyaları göster” açık olmalı.')
        : ($apache || PHP_SAPI === 'cli' || stripos($sw, 'development') !== false ? hl_item('Korumalı klasörler', 'ok', 'Veritabanı ve dosya klasörleri dışarıya kapalı (.htaccess)')
            : hl_item('Korumalı klasörler', 'warn', 'Sunucu ' . $sw . '; .htaccess kuralları uygulanmayabilir', 'data/, uploads/ ve inc/ klasörlerinin dışarıdan açılmadığını tarayıcıdan deneyin.'));
    if ($multi || DB_DRIVER !== 'mysql') {
        $sv = '';
        try { $sv = (string)(new PDO('sqlite::memory:'))->query('select sqlite_version()')->fetchColumn(); } catch (Throwable $e) { $sv = ''; }
        $S[] = version_compare($sv, '3.27', '>=') ? hl_item('SQLite', 'ok', $sv) : hl_item('SQLite', 'warn', $sv ?: 'bilinmiyor', 'Eski SQLite: sunucu dışı yedek düz kopya ile alınır. PHP sürümünü yükseltin.');
    } else {
        $mv = '';
        try { $mv = (string)val('SELECT VERSION()'); } catch (Throwable $e) { $mv = ''; }
        $S[] = hl_item('MySQL', 'ok', $mv);
    }
    $S[] = hl_item('Saat dilimi', date_default_timezone_get() === 'Europe/Istanbul' ? 'ok' : 'warn', date_default_timezone_get() . ' · sunucu saati ' . date('d.m.Y H:i'),
        date_default_timezone_get() === 'Europe/Istanbul' ? '' : 'config.php içinde APP_TIMEZONE değerini Europe/Istanbul yapın.');
    $G[] = ['k' => 'sunucu', 't' => 'Sunucu', 'items' => $S];

    /* ---------- Zamanlanmış görevler ---------- */
    $C = [];
    $cron = 0; $jobs = 0;
    if ($multi) { foreach (nm_tenants() as $t) { $cron = max($cron, (int)nm_tenant_peek_setting($t, 'cron_last')); $jobs = max($jobs, (int)nm_tenant_peek_setting($t, 'jobs_last')); } }
    else { $cron = (int)setting('cron_last', '0'); $jobs = (int)setting('jobs_last', '0'); }
    $C[] = $cron > time() - 1200 ? hl_item('Cron', 'ok', 'Son çalışma ' . hl_ago($cron))
        : hl_item('Cron', $cron ? 'err' : 'warn', $cron ? 'Son çalışma ' . hl_ago($cron) . ' — durmuş görünüyor' : 'Hiç çalışmadı (kurulmamış)',
            'hPanel › Gelişmiş › Cron İşleri: “Her 5 dakikada bir” ve komut /usr/bin/php ' . realpath(NM_ROOT) . '/cron.php');
    $C[] = $jobs > time() - 7200 ? hl_item('Arka plan görevleri', 'ok', 'Son çalışma ' . hl_ago($jobs) . ' (hatırlatmalar, bildirimler, yedek)')
        : hl_item('Arka plan görevleri', 'warn', 'Son çalışma ' . hl_ago($jobs ?: null), 'Cron kurulunca görevler 5 dakikada bir çalışır; kurulmazsa yalnız site ziyaret edildikçe çalışır.');
    $G[] = ['k' => 'cron', 't' => 'Zamanlanmış görevler', 'items' => $C];

    /* ---------- E-posta ---------- */
    $M = [];
    [$from, $mp, $srcName] = hl_mail_ctx();
    if ($from === '') {
        $M[] = hl_item('E-posta ayarı', 'err', 'Hiçbir yerde e-posta ayarı yok: doğrulama kodları, şifre sıfırlama, giriş bilgileri ve yedek gönderilemez',
            $multi ? 'Bir birime girip Ayarlar › E-posta bölümünü doldurun (Hostinger e-posta hesabının SMTP bilgileriyle).' : 'Ayarlar › E-posta bölümünü doldurun (Hostinger e-posta hesabının SMTP bilgileriyle).');
    } else {
        $M[] = hl_item('E-posta ayarı', 'ok', 'Gönderen: ' . $from . ($srcName !== '' ? ' (' . $srcName . ' biriminin ayarı)' : ''));
        if ($mp) {
            try {
                $last = $mp->query('SELECT MAX(sent_at) FROM mail_queue')->fetchColumn();
                $st = $mp->prepare('SELECT COUNT(*) FROM mail_queue WHERE sent_at IS NULL AND attempts >= 3 AND created_at > ?'); $st->execute([date('Y-m-d H:i:s', time() - 7 * 86400)]); $failed = (int)$st->fetchColumn();
                $err = (string)($mp->query('SELECT error FROM mail_queue WHERE error IS NOT NULL ORDER BY id DESC LIMIT 1')->fetchColumn() ?: '');
                $M[] = $failed ? hl_item('Gönderim', 'err', $failed . ' e-posta son 7 günde gönderilemedi' . ($err !== '' ? ': ' . mb_substr($err, 0, 160) : ''), 'SMTP sunucusu, port, kullanıcı ve şifreyi kontrol edin; “Deneme e-postası gönder” ile deneyin.')
                    : hl_item('Gönderim', $last ? 'ok' : 'info', $last ? 'Son gönderim ' . hl_ago((int)strtotime((string)$last)) : 'Henüz e-posta gönderilmedi');
            } catch (Throwable $e) { /* kuyruk tablosu yok */ }
        }
        $dom = mb_strtolower((string)substr((string)strrchr($from, '@'), 1));
        $spf = hl_txt($dom);
        if ($spf === null) $M[] = hl_item('SPF / DKIM / DMARC', 'info', 'Sunucu DNS sorgusuna izin vermiyor; elle kontrol edin', 'hPanel › E-postalar › ' . $dom . ' › DNS kayıtları bölümünde SPF, DKIM ve DMARC “etkin” olmalı.');
        else {
            $hasSpf = (bool)array_filter($spf, fn($x) => stripos($x, 'v=spf1') === 0);
            $M[] = $hasSpf ? hl_item('SPF kaydı', 'ok', $dom . ': ' . mb_substr((string)current(array_filter($spf, fn($x) => stripos($x, 'v=spf1') === 0)), 0, 120))
                : hl_item('SPF kaydı', 'err', $dom . ' alan adında SPF kaydı yok: e-postalar spam klasörüne düşer', 'hPanel › E-postalar › alan adınız › “DNS kayıtları”nda SPF’yi etkinleştirin (Hostinger e-postası için: v=spf1 include:_spf.mail.hostinger.com ~all).');
            $dm = hl_txt('_dmarc.' . $dom) ?? [];
            $M[] = array_filter($dm, fn($x) => stripos($x, 'v=DMARC1') === 0) ? hl_item('DMARC kaydı', 'ok', '_dmarc.' . $dom . ' var')
                : hl_item('DMARC kaydı', 'warn', 'DMARC kaydı yok', 'DNS bölgesine TXT kaydı ekleyin: ad “_dmarc”, değer “v=DMARC1; p=none;”.');
            $dk = null;
            foreach (HL_DKIM_SELECTORS as $sel) { $r = hl_txt($sel . '._domainkey.' . $dom); if ($r && array_filter($r, fn($x) => stripos($x, 'p=') !== false)) { $dk = $sel; break; } }
            $M[] = $dk ? hl_item('DKIM kaydı', 'ok', 'Seçici: ' . $dk) : hl_item('DKIM kaydı', 'warn', 'Bilinen seçicilerde DKIM kaydı bulunamadı (seçici adı farklı olabilir)', 'hPanel › E-postalar › alan adınız › DNS kayıtlarında DKIM’in “etkin” olduğunu kontrol edin.');
            $siteDom = preg_replace('/^www\./', '', mb_strtolower(preg_replace('/:\d+$/', '', $host)));
            if ($siteDom !== '' && !$local && !str_ends_with($dom, $siteDom) && !str_ends_with($siteDom, $dom)) $M[] = hl_item('Gönderen alan adı', 'info', 'Gönderen (' . $dom . ') site alan adından (' . $siteDom . ') farklı', 'Sorun değil; yalnız SPF/DKIM kayıtlarının gönderen alan adında olduğundan emin olun.');
        }
    }
    $G[] = ['k' => 'eposta', 't' => 'E-posta', 'items' => $M];

    /* ---------- Yedek ---------- */
    $B = [];
    if ($multi && function_exists('obk_cfg')) {
        $o = obk_cfg();
        [$stt, $msg] = array_pad(explode('|', $o['last_status'], 2), 2, '');
        $lt = $o['last'] ? (int)strtotime($o['last']) : 0;
        if ($o['on'] !== '1') $B[] = hl_item('Sunucu dışı yedek', 'warn', 'Kapalı: sunucuya bir şey olursa veriler de gider', 'Site ve yedek sekmesinde yedek e-postasını ve şifresini girip açın; “Şimdi gönder” ile deneyin.');
        elseif ($stt === 'err') $B[] = hl_item('Sunucu dışı yedek', 'err', 'Son deneme başarısız: ' . $msg, 'Site ve yedek sekmesinden “Şimdi gönder” ile yeniden deneyin.');
        elseif ($lt < time() - 9 * 86400) $B[] = hl_item('Sunucu dışı yedek', 'warn', 'Son yedek ' . hl_ago($lt ?: null), 'Cron’un çalıştığından emin olun ya da “Şimdi gönder” deyin.');
        else $B[] = hl_item('Sunucu dışı yedek', 'ok', 'Son yedek ' . hl_ago($lt) . ' (' . round((int)$o['last_size'] / 1048576, 2) . ' MB)');
        if (!obk_zip_ok()) $B[] = hl_item('Şifreli ZIP', 'err', 'PHP zip eklentisi AES şifrelemeyi desteklemiyor', 'Hosting desteğinden PHP zip eklentisinin güncellenmesini isteyin.');
    }
    $bl = $multi ? (int)nm_tenant_peek_setting(nm_tenant_default(), 'backup_last') : (int)setting('backup_last', '0');
    $B[] = $bl > time() - 8 * 86400 ? hl_item('Haftalık iç yedek', 'ok', 'Son ' . hl_ago($bl) . ' (aynı sunucuda, son 4 yedek)') : hl_item('Haftalık iç yedek', 'info', 'Son ' . hl_ago($bl ?: null), 'Ayarlar › Yedekleme’de “Haftalık otomatik yedek” açık olmalı.');
    $G[] = ['k' => 'yedek', 't' => 'Yedek', 'items' => $B];

    /* ---------- Güvenlik ---------- */
    $Z = [];
    $init = defined('INITIAL_ADMIN_PASSWORD_HASH') && (string)INITIAL_ADMIN_PASSWORD_HASH !== '';
    $Z[] = $init ? hl_item('İlk yönetici bilgileri', 'warn', 'config.php içinde INITIAL_ADMIN_* bilgileri duruyor', 'Kurulum bittiyse config.php’deki INITIAL_ADMIN_PASSWORD_HASH satırını boşaltın.') : hl_item('İlk yönetici bilgileri', 'ok', 'config.php’de kalmamış');
    $disp = filter_var(ini_get('display_errors'), FILTER_VALIDATE_BOOLEAN) && PHP_SAPI !== 'cli';
    $Z[] = $disp ? hl_item('Hata gösterimi', 'warn', 'PHP hataları ziyaretçiye gösteriliyor', 'hPanel › PHP Yapılandırması’nda display_errors kapalı olmalı.') : hl_item('Hata gösterimi', 'ok', 'Hatalar ziyaretçiye gösterilmiyor');
    if ($multi) {
        $sa = (int)m_val('SELECT COUNT(*) FROM superadmins WHERE totp_on = 1');
        $Z[] = $sa ? hl_item('Sistem yönetimi hesabı', 'ok', $sa . ' hesap, iki adımlı doğrulama açık') : hl_item('Sistem yönetimi hesabı', 'warn', 'Yok', 'Ana birimin yöneticisi Ayarlar’dan sistem yönetimi hesabı açabilir.');
    }
    $G[] = ['k' => 'guvenlik', 't' => 'Güvenlik', 'items' => $Z];

    /* ---------- Yayın ve satış ---------- */
    $Y = [];
    if (function_exists('lg_on')) {
        $miss = lg_missing();
        $Y[] = !lg_on() ? hl_item('Tanıtım ve yasal sayfalar', 'warn', 'Yayında değil', ($multi ? 'Site ve yedek' : 'Ayarlar › Tanıtım ve yasal metinler') . ' bölümünde künyeyi doldurup yayımlayın (PayTR / iyzico başvurusu için gerekli).')
            : ($miss ? hl_item('Tanıtım ve yasal sayfalar', 'warn', 'Yayında; eksik künye: ' . implode(', ', $miss), 'Künye bilgilerini tamamlayın.') : hl_item('Tanıtım ve yasal sayfalar', 'ok', 'Yayında, künye tam'));
        $Y[] = lg_get('notice') === '1' ? hl_item('Aydınlatma metni bildirimi', 'ok', 'Kullanıcılardan okumaları isteniyor') : hl_item('Aydınlatma metni bildirimi', 'info', 'Kapalı', 'Metin yayımlandıktan sonra “Kullanıcılardan aydınlatma metnini okumalarını iste”yi açın.');
    }
    if ($multi && function_exists('ap_cfg')) {
        $a = ap_cfg();
        $Y[] = $a['on'] === '1' ? hl_item('Birim başvurusu', $from === '' ? 'warn' : 'ok', 'Açık' . ($from === '' ? '; e-posta ayarı olmadığı için kod gönderilemiyor' : ''), $from === '' ? 'E-posta ayarını yapın.' : '')
            : hl_item('Birim başvurusu', 'info', 'Kapalı (yeni birimleri siz açıyorsunuz)');
    }
    if ($multi && function_exists('bl_cfg') && function_exists('bl_on') && bl_on()) {
        $c = bl_cfg();
        if ($c['visible'] !== '1' && $c['enforce'] !== '1') $Y[] = hl_item('Abonelik ve ödeme', 'info', 'Kapalı (birimler ücretsiz kullanıyor)');
        else {
            $prov = array_filter(['PayTR' => $c['paytr_on'] === '1', 'iyzico' => $c['iyzico_on'] === '1', 'Havale' => $c['havale_on'] === '1']);
            $test = array_filter(['PayTR' => $c['paytr_on'] === '1' && $c['paytr_test'] === '1', 'iyzico' => $c['iyzico_on'] === '1' && $c['iyzico_sandbox'] === '1']);
            $Y[] = !$prov ? hl_item('Abonelik ve ödeme', 'err', 'Abonelik görünür ama hiçbir ödeme yöntemi açık değil', 'Abonelik ve ödeme sekmesinden PayTR, iyzico ya da havaleyi açın.')
                : ($test ? hl_item('Abonelik ve ödeme', 'warn', 'Test modunda: ' . implode(', ', array_keys($test)) . ' (gerçek çekim yapılmaz)', 'Sağlayıcı onayından sonra test modunu kapatın.')
                    : hl_item('Abonelik ve ödeme', 'ok', 'Açık: ' . implode(', ', array_keys($prov)) . ($c['enforce'] === '1' ? ' · ödeme zorunlu' : ' · ödeme gönüllü')));
            if (array_intersect_key($prov, ['PayTR' => 1, 'iyzico' => 1]) && !extension_loaded('curl')) $Y[] = hl_item('Kartla ödeme', 'err', 'cURL kapalı; kartla ödeme çalışmaz', 'hPanel › PHP Eklentileri’nden curl’ü açın.');
        }
    }
    if ($Y) $G[] = ['k' => 'yayin', 't' => 'Yayın ve satış', 'items' => $Y];

    /* ---------- Birimler ---------- */
    if ($multi) {
        $U = [];
        $noAdm = []; $idle = []; $frozen = 0; $n = 0;
        foreach (nm_tenants() as $t) {
            $n++;
            if ($t['status'] !== 'active' || ($t['hospital_status'] ?? 'active') !== 'active') { $frozen++; continue; }
            $p = nm_tenant_peek($t);
            $adm = 0; $seen = null;
            if ($p) { try { $adm = (int)$p->query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'")->fetchColumn(); $seen = $p->query('SELECT MAX(last_seen_at) FROM users')->fetchColumn() ?: null; } catch (Throwable $e) { /* */ } }
            if (!$adm) $noAdm[] = $t['name'];
            elseif (!$seen || strtotime((string)$seen) < time() - 30 * 86400) $idle[] = $t['name'];
        }
        $U[] = hl_item('Birim sayısı', 'info', $n . ' birim' . ($frozen ? ' (' . $frozen . ' dondurulmuş)' : ''));
        $U[] = $noAdm ? hl_item('Yöneticisi olmayan birim', 'warn', implode(', ', array_slice($noAdm, 0, 8)) . (count($noAdm) > 8 ? ' …' : ''), 'Birimler sekmesinde “Yönetici ekle” ile yönetici açın.') : hl_item('Yöneticisi olmayan birim', 'ok', 'Yok');
        if ($idle) $U[] = hl_item('30 gündür girilmeyen birim', 'info', implode(', ', array_slice($idle, 0, 8)) . (count($idle) > 8 ? ' …' : ''), 'Birim kullanılmıyorsa sorumlusuyla görüşün ya da dondurun.');
        $G[] = ['k' => 'birimler', 't' => 'Birimler', 'items' => $U];
    }

    /* ---------- Hatalar ---------- */
    $G[] = ['k' => 'hatalar', 't' => 'Sunucu hataları', 'items' => [hl_errors()]];
    return $G;
}

/** PHP hata günlüğünün son satırları (yollar kısaltılır) */
function hl_errors(): array
{
    $cands = array_values(array_unique(array_filter([(string)ini_get('error_log'), NM_ROOT . '/error_log', NM_ROOT . '/data/error_log', dirname(NM_ROOT) . '/error_log'])));
    $file = null;
    foreach ($cands as $f) if ($f !== '' && @is_file($f) && @is_readable($f)) { $file = $f; break; }
    if (!$file) return hl_item('Hata günlüğü', 'info', 'Günlük dosyası bulunamadı ya da okunamıyor', 'Hostinger’da hatalar genelde public_html/error_log dosyasına yazılır.') + ['lines' => []];
    $size = (int)@filesize($file);
    $fp = @fopen($file, 'rb');
    if (!$fp) return hl_item('Hata günlüğü', 'info', 'Okunamadı') + ['lines' => []];
    if ($size > 65536) fseek($fp, -65536, SEEK_END);
    $txt = (string)stream_get_contents($fp);
    fclose($fp);
    $root = realpath(NM_ROOT) ?: NM_ROOT;
    $lines = array_values(array_filter(preg_split('/\r?\n/', $txt), fn($l) => preg_match('/PHP (Fatal|Parse|Warning|Notice|Deprecated)|\[dupcii\]|Uncaught/', $l)));
    $week = time() - 7 * 86400; $fatal = 0; $warn = 0; $recent = [];
    foreach ($lines as $l) {
        $ts = preg_match('/^\[([^\]]+)\]/', $l, $m) ? (int)strtotime($m[1]) : 0;
        if ($ts && $ts < $week) continue;
        if (preg_match('/Fatal|Parse|Uncaught/', $l)) $fatal++; else $warn++;
        $recent[] = mb_substr(str_replace([$root, NM_ROOT], '…', $l), 0, 400);
    }
    $recent = array_slice($recent, -15);
    $o = $fatal ? hl_item('Hata günlüğü', 'err', 'Son 7 günde ' . $fatal . ' ciddi hata, ' . $warn . ' uyarı', 'Aşağıdaki satırları geliştiriciye iletin.')
        : ($warn ? hl_item('Hata günlüğü', 'warn', 'Son 7 günde ' . $warn . ' uyarı (ciddi hata yok)', 'Genelde zararsızdır; tekrar ediyorsa geliştiriciye iletin.') : hl_item('Hata günlüğü', 'ok', 'Son 7 günde hata yok'));
    return $o + ['lines' => $recent];
}

function hl_out(): array
{
    $g = hl_checks();
    $n = ['ok' => 0, 'warn' => 0, 'err' => 0, 'info' => 0];
    foreach ($g as $x) foreach ($x['items'] as $i) $n[$i['s']]++;
    return ['groups' => $g, 'count' => $n, 'at' => now(), 'version' => NM_VERSION, 'schema' => NM_SCHEMA];
}
function a_sa_health(): void { need_sa(); out(hl_out()); }
function a_health_get(): void
{
    $me = need_user();
    if (nm_multi()) fail('Sistem sağlığını sistem yöneticisi görür.', 403);
    if ($me['role'] !== 'admin') fail('Bu işlem için yönetici olmalısınız.', 403);
    out(hl_out());
}
/** Sistem yöneticisine deneme e-postası (başvuru / yedek e-postalarının gittiği ayarla) */
function a_sa_health_mail(): void
{
    $sa = need_sa();
    if (!function_exists('ap_mail_src') || !($src = ap_mail_src())) fail('Hiçbir birimde e-posta ayarı yok.', 409);
    nm_tenant_use($src);
    $GLOBALS['NM_MAIL_ORG'] = 'dupcii';
    [$html, $text] = mail_template('Deneme e-postası', ['Bu e-posta sistem sağlığı panelinden gönderildi. Geldiyse başvuru kodları, giriş bilgileri ve yedekler de gidebilir.', 'Gelen kutusu yerine spam klasörüne düştüyse SPF / DKIM / DMARC kayıtlarını kontrol edin.']);
    unset($GLOBALS['NM_MAIL_ORG']);
    $res = mail_send_batch([['id' => 1, 'to_email' => (string)$sa['email'], 'to_name' => (string)$sa['name'], 'subject' => 'dupcii deneme e-postası', 'html' => $html, 'text_body' => $text]]);
    if (($res[1] ?? null) !== true) fail('Gönderilemedi: ' . (string)($res[1] ?? 'bilinmeyen hata'), 409);
    sa_audit($sa, 'health.mail', (string)$sa['email']);
    out(['to' => $sa['email']]);
}

return [
    'sa.health' => 'a_sa_health',
    'sa.health.mail' => 'a_sa_health_mail',
    'health.get' => 'a_health_get',
];
