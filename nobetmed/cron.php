<?php
/**
 * Zamanlanmış görevler: e-posta kuyruğu, sabah özeti, nöbet hatırlatmaları, okuma hatırlatmaları,
 * belge gözden geçirme uyarıları ve haftalık yedek.
 * Bu görevler site ziyaret edildikçe de arka planda çalışır; cron saatinde çalışmalarını garanti eder.
 * Hostinger hPanel › Gelişmiş › Cron Jobs: her 5 dakikada bir
 *   /usr/bin/php /home/u123456789/domains/alanadiniz.com/public_html/cron.php
 *
 * Birden çok birim varsa her birim AYRI bir süreçte çalışır (verileri, önbellekleri ve e-posta kuyrukları
 * hiçbir zaman karışmaz). Tek bir birim için: php cron.php --tenant=<anahtar>
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// Güncelleme / bakım sırasında görevler bekler (bir sonraki çalıştırmada yapılır)
$nmUp = @file_get_contents(__DIR__ . '/data/.guncelleniyor');
if ($nmUp !== false && ($nmUpD = json_decode($nmUp, true)) && (int)($nmUpD['until'] ?? 0) > time()) exit(0);
require __DIR__ . '/inc/bootstrap.php';

$force = in_array('--force', $argv ?? [], true);
$one = '';
foreach ($argv ?? [] as $a) if (strncmp((string)$a, '--tenant=', 9) === 0) $one = substr((string)$a, 9);

if (nm_multi() && $one === '' && count(nm_tenants()) > 1) {
    // Ana süreç: her etkin birim için çocuk süreç
    $php = PHP_BINARY ?: 'php';
    $canSpawn = function_exists('proc_open') && !in_array('proc_open', array_map('trim', explode(',', (string)ini_get('disable_functions'))), true);
    $started = time();
    foreach (nm_tenants() as $t) {
        if (nm_tenant_frozen($t)) continue;
        if (time() - $started > 240) { echo date('c') . " süre doldu; kalan birimler sonraki çalıştırmada\n"; break; }
        if (!$canSpawn) {
            // Sunucu süreç açmaya izin vermiyor: her çalıştırmada sıradaki bir birim (site ziyaretleri de görevleri çalıştırır)
            $all = array_values(array_filter(nm_tenants(), fn($x) => !nm_tenant_frozen($x)));
            $i = ((int)m_setting('cron_rr', '0')) % max(1, count($all));
            m_q("INSERT OR REPLACE INTO m_settings (k, v) VALUES ('cron_rr', ?)", [(string)($i + 1)]);
            $t = $all[$i];
            echo date('c') . " proc_open kapalı; yalnız {$t['tkey']} çalıştırılıyor\n";
            passthru_tenant_inline($t, $force);
            exit;
        }
        $cmd = [$php, __FILE__, '--tenant=' . $t['tkey']];
        if ($force) $cmd[] = '--force';
        $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, __DIR__);
        if (!is_resource($p)) { echo date('c') . " {$t['tkey']}: süreç açılamadı\n"; continue; }
        $outS = stream_get_contents($pipes[1]); $errS = stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        $code = proc_close($p);
        echo '[' . $t['tkey'] . '] ' . trim((string)$outS) . ($code !== 0 ? " (çıkış $code: " . trim(substr((string)$errS, 0, 300)) . ')' : '') . "\n";
    }
    exit;
}

/** Süreç açılamayan sunucuda tek birimi bu süreçte çalıştır (yalnız bir birim — karışma olmaz) */
function passthru_tenant_inline(array $t, bool $force): void
{
    nm_tenant_use($t);
    cron_run_tenant($force);
}

function cron_run_tenant(bool $force): void
{
    require_once __DIR__ . '/inc/mail.php';
    require_once __DIR__ . '/inc/notify.php';
    foreach (['push.php', 'webauthn.php', 'gsync.php', 'swaps.php', 'rules.php'] as $f) if (is_file(__DIR__ . '/inc/' . $f)) require_once __DIR__ . '/inc/' . $f;
    foreach (glob(__DIR__ . '/inc/mod_*.php') ?: [] as $f) require_once $f;
    if (nm_multi() && nm_tenant_frozen()) { echo "dondurulmuş birim\n"; return; }
    set_setting('cron_last', (string)time());
    $done = run_jobs($force);
    $n = mail_flush(200);
    echo date('c') . ' görevler: ' . (json_encode($done, JSON_UNESCAPED_UNICODE) ?: '{}') . " · gönderilen e-posta: $n\n";
}

cron_run_tenant($force);
