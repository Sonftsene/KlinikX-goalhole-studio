<?php
/**
 * Güncelleme (4.24): yeni sürüm paketini (dupcii-hostinger.zip) uygulamanın içinden yükleme.
 * Amaç: dosyalar değişirken kişilerin işi yarıda kalmasın.
 *  - Paket önce ara klasöre açılır ve denetlenir (sürüm, zorunlu dosyalar, PHP sözdizimi, yasak yollar: data/, uploads/, config.php).
 *  - Değişim anında kısa bir "güncelleniyor" kilidi (data/.guncelleniyor) konur: o birkaç saniyede gelen istekler işlenmez,
 *    503 + updating yanıtı alır; istemci (core.js api()) bekleyip AYNI isteği yeniden gönderir. Dosyalar tek tek "yeni ad + rename"
 *    ile değişir (yarım dosya okunmaz), değişen dosyaların eski kopyası geri alma klasörüne konur.
 *  - Dosya yöneticisiyle elle güncelleme yapılacaksa "Bakım modu" (5–60 dk) açılır: kişilerin istekleri bekletilir, bitince kapatılır.
 *  - Çok birimli kurulumda sistem yöneticisi (sa.update.*), tek birimlide birim yöneticisi (update.*) kullanır.
 */
declare(strict_types=1);

const UP_SKIP = '#^(data|uploads)(/|$)|^config\.php$|^\.git#';
const UP_MAX = 60 * 1024 * 1024;

function up_flag(): string { return NM_ROOT . '/data/.guncelleniyor'; }
function up_dir(): string
{
    $d = NM_ROOT . '/data/tmp/guncelle';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    if (!is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Require all denied\n");
    return $d;
}
/** Kilit: kind auto (dosya değişimi, birkaç saniye) | manual (elle güncelleme için bakım modu) */
function up_lock(int $secs, string $kind, string $by = ''): void
{
    if (@file_put_contents(up_flag(), json_encode(['until' => time() + $secs, 'kind' => $kind, 'by' => $by, 'at' => time()]), LOCK_EX) === false) fail('Bakım kilidi yazılamadı (data klasörü yazılabilir olmalı).', 500);
}
function up_unlock(): void { if (is_file(up_flag())) @unlink(up_flag()); }
function up_lock_state(): ?array
{
    $raw = @file_get_contents(up_flag());
    if ($raw === false) return null;
    $d = json_decode($raw, true) ?: [];
    return (int)($d['until'] ?? 0) > time() ? $d : null;
}

function up_get(string $k): string { return nm_multi() ? m_setting('up_' . $k) : (string)setting('up_' . $k, ''); }
function up_put(string $k, string $v): void { if (nm_multi()) m_q('INSERT OR REPLACE INTO m_settings (k, v) VALUES (?, ?)', ['up_' . $k, $v]); else set_setting('up_' . $k, $v); }

/** Yetki: çok birimlide sistem yöneticisi, tek birimlide birim yöneticisi */
function up_who(bool $sa): array
{
    if ($sa) { $u = need_sa(); return ['sa' => $u, 'name' => (string)$u['name']]; }
    if (nm_multi()) fail('Güncellemeyi sistem yöneticisi yapar.', 403);
    $me = need_admin();
    if (!empty($me['sa_virtual'])) fail('Yetkiniz yok.', 403);
    return ['me' => $me, 'name' => (string)$me['name']];
}
function up_audit(array $w, string $act, string $target, string $detail = ''): void
{
    if (isset($w['sa'])) sa_audit($w['sa'], $act, $target, $detail); else audit($w['me'], $act, $target, $detail);
}

/** Paketteki dosyalar: [yol => zip içindeki ad] (tek üst klasörle sıkıştırılmışsa o klasör atlanır) */
function up_entries(ZipArchive $z): array
{
    $names = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        $n = str_replace('\\', '/', (string)$z->getNameIndex($i));
        if ($n === '' || str_ends_with($n, '/')) continue;
        if (str_contains($n, '../') || str_starts_with($n, '/') || preg_match('#^[A-Za-z]:#', $n) || str_contains($n, "\0")) fail('Pakette geçersiz dosya yolu var: ' . mb_substr($n, 0, 120));
        $names[] = $n;
    }
    $prefix = '';
    if (!in_array('index.php', $names, true)) {
        $tops = array_unique(array_map(fn($n) => explode('/', $n)[0], $names));
        if (count($tops) === 1 && in_array($tops[0] . '/index.php', $names, true)) $prefix = $tops[0] . '/';
    }
    $o = [];
    foreach ($names as $n) {
        if ($prefix !== '' && !str_starts_with($n, $prefix)) continue;
        $rel = substr($n, strlen($prefix));
        if (str_starts_with($rel, '__MACOSX/') || basename($rel) === '.DS_Store' || preg_match(UP_SKIP, $rel)) continue;
        $o[$rel] = $n;
    }
    return $o;
}

/** Paketi denetle: sürüm, zorunlu dosyalar, değişen / yeni dosya sayısı */
function up_inspect(string $zipFile): array
{
    if (!class_exists('ZipArchive')) fail('Sunucudaki PHP “zip” eklentisi yok; güncellemeyi dosya yöneticisiyle yapın (önce Bakım modunu açın).');
    $z = new ZipArchive();
    if ($z->open($zipFile) !== true) fail('ZIP dosyası açılamadı. dupcii-hostinger.zip dosyasını seçin.');
    $e = up_entries($z);
    foreach (['index.php', 'api.php', 'inc/bootstrap.php', 'sw.js', 'assets/js/core.js'] as $need) if (!isset($e[$need])) { $z->close(); fail('Bu bir dupcii paketi değil (' . $need . ' yok).'); }
    $boot = (string)$z->getFromName($e['inc/bootstrap.php']);
    if (!preg_match("/const NM_VERSION = '([0-9][0-9.]*)'/", $boot, $m)) { $z->close(); fail('Paketin sürümü okunamadı.'); }
    $changed = 0; $added = 0; $size = 0;
    foreach ($e as $rel => $n) {
        $st = $z->statName($n);
        $size += (int)($st['size'] ?? 0);
        $t = NM_ROOT . '/' . $rel;
        if (!is_file($t)) $added++;
        elseif ((int)filesize($t) !== (int)($st['size'] ?? -1) || hash_file('crc32b', $t) !== sprintf('%08x', (int)($st['crc'] ?? 0) & 0xffffffff)) $changed++;
    }
    $z->close();
    return ['version' => $m[1], 'current' => NM_VERSION, 'cmp' => version_compare($m[1], NM_VERSION), 'files' => count($e), 'changed' => $changed, 'added' => $added, 'size' => $size];
}

function up_info_out(): array
{
    $lock = up_lock_state();
    $last = json_decode(up_get('last'), true) ?: null;
    $rb = up_rollbacks();
    $pkg = is_file(up_dir() . '/paket.zip') ? json_decode(up_get('pending'), true) : null;
    return ['current' => NM_VERSION, 'lock' => $lock ? ['kind' => $lock['kind'], 'until' => (int)$lock['until'], 'by' => (string)($lock['by'] ?? '')] : null,
        'last' => $last, 'rollback' => $rb ? ['from' => $rb[0]['to'], 'to' => $rb[0]['from'], 'at' => $rb[0]['at']] : null, 'pending' => $pkg ?: null,
        'zip' => class_exists('ZipArchive'), 'writable' => is_writable(NM_ROOT . '/index.php') && is_writable(NM_ROOT . '/inc')];
}

/** Geri alma klasörleri (en yenisi önce) */
function up_rollbacks(): array
{
    $o = [];
    foreach (glob(up_dir() . '/geri-*', GLOB_ONLYDIR) ?: [] as $d) {
        $m = json_decode((string)@file_get_contents($d . '/_meta.json'), true);
        if (is_array($m)) $o[] = $m + ['dir' => $d];
    }
    usort($o, fn($a, $b) => strcmp((string)$b['at'], (string)$a['at']));
    return $o;
}
function up_rmdir(string $d): void
{
    if (!is_dir($d)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($d, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) { if ($f->isDir()) @rmdir($f->getPathname()); else @unlink($f->getPathname()); }
    @rmdir($d);
}

/** Dosyayı yerine koy: aynı klasörde geçici ad + rename (okuyan istek hiçbir zaman yarım dosya görmez) */
function up_place(string $src, string $dst): void
{
    $dir = dirname($dst);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) throw new RuntimeException('Klasör açılamadı: ' . $dir);
    $tmp = $dst . '.nmyeni';
    if (!@copy($src, $tmp) || !@rename($tmp, $dst)) { @unlink($tmp); throw new RuntimeException('Dosya yazılamadı: ' . substr($dst, strlen(NM_ROOT) + 1)); }
    if (function_exists('opcache_invalidate') && str_ends_with($dst, '.php')) @opcache_invalidate($dst, true);
}

/* ---------------- Uçlar ---------------- */

function up_info(bool $sa): void { up_who($sa); out(up_info_out()); }

function up_check(bool $sa): void
{
    up_who($sa);
    global $IN;
    $data = (string)($IN['zip'] ?? '');
    if (!preg_match('#^data:[a-z/.+-]*;base64,#', $data)) fail('Paket okunamadı.');
    $bin = base64_decode(substr($data, strpos($data, ',') + 1), true);
    if ($bin === false || strlen($bin) < 1000) fail('Paket okunamadı.');
    if (strlen($bin) > UP_MAX) fail('Paket çok büyük.');
    $f = up_dir() . '/paket.zip';
    if (file_put_contents($f, $bin, LOCK_EX) === false) fail('Paket kaydedilemedi (data klasörü yazılabilir olmalı).', 500);
    unset($bin);
    try { $info = up_inspect($f); } catch (Throwable $e) { @unlink($f); throw $e; }
    $info['sha'] = hash_file('sha256', $f);
    $info['name'] = mb_substr(s('name', 120), 0, 120);
    up_put('pending', json_encode($info));
    out(['pkg' => $info] + up_info_out());
}

function up_apply(bool $sa): void
{
    $w = up_who($sa);
    @set_time_limit(300);
    $f = up_dir() . '/paket.zip';
    $pend = json_decode(up_get('pending'), true);
    if (!is_file($f) || !$pend || !hash_equals((string)$pend['sha'], s('sha', 64)) || hash_file('sha256', $f) !== $pend['sha']) fail('Yüklenen paket bulunamadı ya da değişti. Paketi yeniden seçin.');
    $info = up_inspect($f);
    if ($info['cmp'] < 0 && !b('downgrade')) fail('Paket (' . $info['version'] . ') kurulu sürümden (' . NM_VERSION . ') eski. Eski sürüme dönmek istiyorsanız “Geri al”ı kullanın.');
    if (!is_writable(NM_ROOT . '/index.php') || !is_writable(NM_ROOT . '/inc')) fail('Site dosyaları PHP tarafından yazılamıyor; güncellemeyi dosya yöneticisiyle yapın (önce Bakım modunu açın).');
    $t0 = microtime(true);
    // 1) Ara klasöre aç ve PHP sözdizimini denetle (bozuk paket siteye hiç dokunmaz)
    $stage = up_dir() . '/hazir-' . bin2hex(random_bytes(4));
    up_rmdir($stage);
    @mkdir($stage, 0700, true);
    $z = new ZipArchive();
    if ($z->open($f) !== true) fail('ZIP açılamadı.');
    $e = up_entries($z);
    foreach ($e as $rel => $n) {
        $dst = $stage . '/' . $rel;
        if (!is_dir(dirname($dst))) @mkdir(dirname($dst), 0700, true);
        $c = $z->getFromName($n);
        if ($c === false || file_put_contents($dst, $c) === false) { $z->close(); up_rmdir($stage); fail('Paket açılamadı: ' . $rel); }
        if (str_ends_with($rel, '.php')) {
            try { token_get_all($c, TOKEN_PARSE); } catch (ParseError $pe) { $z->close(); up_rmdir($stage); fail('Pakette bozuk dosya var (' . $rel . ', satır ' . $pe->getLine() . '). Paket değiştirilmedi; site aynen çalışıyor.'); }
        }
    }
    $z->close();
    // 2) Geri alma klasörü
    $rbDir = up_dir() . '/geri-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2));
    @mkdir($rbDir, 0700, true);
    $added = []; $removed = []; $changed = 0;
    // 3) Kısa kilit: bu sırada gelen istekler beklenir ve yeniden gönderilir
    up_lock(90, 'auto', $w['name']);
    usleep(700000); // o an işlenmekte olan istekler bitsin
    try {
        foreach (array_keys($e) as $rel) {
            $src = $stage . '/' . $rel; $dst = NM_ROOT . '/' . $rel;
            if (is_file($dst)) {
                if (filesize($dst) === filesize($src) && hash_file('crc32b', $dst) === hash_file('crc32b', $src)) continue;
                if (!is_dir(dirname($rbDir . '/' . $rel))) @mkdir(dirname($rbDir . '/' . $rel), 0700, true);
                @copy($dst, $rbDir . '/' . $rel);
                $changed++;
            } else $added[] = $rel;
            up_place($src, $dst);
        }
        // Yeni sürümde olmayan modüller kaldırılır (api.php inc/mod_*.php dosyalarının hepsini yükler)
        foreach (glob(NM_ROOT . '/inc/mod_*.php') ?: [] as $mf) {
            $rel = 'inc/' . basename($mf);
            if (isset($e[$rel])) continue;
            if (!is_dir($rbDir . '/inc')) @mkdir($rbDir . '/inc', 0700, true);
            if (@rename($mf, $rbDir . '/' . $rel)) $removed[] = $rel;
        }
        if (function_exists('opcache_reset')) @opcache_reset();
    } catch (Throwable $ex) {
        // Yarım kalan değişimi geri al
        up_restore($rbDir, $added, $removed);
        up_unlock();
        up_rmdir($stage);
        error_log('[dupcii] güncelleme: ' . $ex->getMessage());
        fail('Güncelleme tamamlanamadı, eski dosyalar geri kondu: ' . $ex->getMessage(), 500);
    }
    up_unlock();
    up_rmdir($stage);
    @unlink($f);
    $meta = ['from' => NM_VERSION, 'to' => $info['version'], 'at' => date('Y-m-d H:i:s'), 'by' => $w['name'], 'changed' => $changed, 'added' => $added, 'removed' => $removed];
    file_put_contents($rbDir . '/_meta.json', json_encode($meta, JSON_UNESCAPED_UNICODE));
    foreach (array_slice(up_rollbacks(), 2) as $old) up_rmdir($old['dir']); // son iki güncellemenin geri alması saklanır
    $secs = round(microtime(true) - $t0, 1);
    up_put('last', json_encode(['from' => NM_VERSION, 'to' => $info['version'], 'at' => $meta['at'], 'by' => $w['name'], 'files' => $changed + count($added), 'secs' => $secs], JSON_UNESCAPED_UNICODE));
    up_put('pending', '');
    up_audit($w, 'update.apply', NM_VERSION . ' → ' . $info['version'], ($changed + count($added)) . ' dosya, ' . $secs . ' sn');
    out(['ok' => true, 'from' => NM_VERSION, 'to' => $info['version'], 'files' => $changed + count($added), 'secs' => $secs]);
}

/** Geri alma klasöründeki dosyaları yerine koy, eklenenleri sil */
function up_restore(string $rbDir, array $added, array $removed): void
{
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($rbDir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        $rel = substr($file->getPathname(), strlen($rbDir) + 1);
        if ($rel === '_meta.json') continue;
        try { up_place($file->getPathname(), NM_ROOT . '/' . $rel); } catch (Throwable $e) { error_log('[dupcii] geri alma: ' . $e->getMessage()); }
    }
    foreach ($added as $rel) if (is_string($rel) && !preg_match(UP_SKIP, $rel) && !str_contains($rel, '..')) @unlink(NM_ROOT . '/' . $rel);
    if (function_exists('opcache_reset')) @opcache_reset();
}

function up_rollback(bool $sa): void
{
    $w = up_who($sa);
    $rb = up_rollbacks()[0] ?? fail('Geri alınacak güncelleme yok.');
    up_lock(90, 'auto', $w['name']);
    usleep(700000);
    try { up_restore($rb['dir'], (array)$rb['added'], (array)$rb['removed']); }
    finally { up_unlock(); }
    up_rmdir($rb['dir']);
    up_put('last', json_encode(['from' => $rb['to'], 'to' => $rb['from'], 'at' => date('Y-m-d H:i:s'), 'by' => $w['name'], 'rollback' => true], JSON_UNESCAPED_UNICODE));
    up_audit($w, 'update.rollback', $rb['to'] . ' → ' . $rb['from']);
    out(['ok' => true, 'to' => $rb['from']]);
}

/** Elle güncelleme için bakım modu (dakika; 0 = kapat) */
function up_maint(bool $sa): void
{
    $w = up_who($sa);
    $min = max(0, min(60, (int)i('minutes')));
    if ($min === 0) { up_unlock(); up_audit($w, 'update.maint', 'Bakım modu kapatıldı'); }
    else { up_lock($min * 60, 'manual', $w['name']); up_audit($w, 'update.maint', 'Bakım modu açıldı', $min . ' dk'); }
    out(up_info_out());
}

$GLOBALS['NM_BOOT'][] = fn(array $me): array => !nm_multi() && $me['role'] === 'admin' && empty($me['sa_virtual']) && empty($me['view_as']) ? ['up_admin' => true] : [];

return [
    'sa.update.info' => fn() => up_info(true),
    'sa.update.check' => fn() => up_check(true),
    'sa.update.apply' => fn() => up_apply(true),
    'sa.update.rollback' => fn() => up_rollback(true),
    'sa.update.maint' => fn() => up_maint(true),
    'update.info' => fn() => up_info(false),
    'update.check' => fn() => up_check(false),
    'update.apply' => fn() => up_apply(false),
    'update.rollback' => fn() => up_rollback(false),
    'update.maint' => fn() => up_maint(false),
];
