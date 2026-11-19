<?php
/**
 * Ödeme sağlayıcısı dönüşleri (4.15). Oturum ve birim gerektirmez: kayıtlar merkez veritabanındadır.
 *   ?p=paytr   PayTR sunucusunun "Bildirim URL" isteği (imza doğrulanır, "OK" döner)
 *   ?p=iyzico  iyzico ödeme sayfasından tarayıcının dönüşü (jetonla sonuç iyzico'dan sorgulanır)
 *   ?p=ok|fail PayTR ödeme çerçevesinin dönüşü (uygulamaya yönlendirir; asıl onay bildirimle gelir)
 * Aynı ödeme iki kez işlenmez; tutar paketten hesaplanan tutarla karşılaştırılır.
 */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/billing.php';

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

$p = (string)($_GET['p'] ?? '');
if (!bl_on()) { http_response_code(404); exit('Not found'); }
bl_ensure();

/** Uygulamaya dön (çerçeve içindeysek üst pencereyi taşı) */
function od_back(string $url, string $msg): void
{
    header('Content-Type: text/html; charset=utf-8');
    $u = htmlspecialchars($url, ENT_QUOTES);
    $m = htmlspecialchars($msg, ENT_QUOTES);
    echo '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ödeme</title>'
        . '<style>body{font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#1f2937;background:#f8fafc}a{color:#0f766e}</style></head>'
        . '<body><p>' . $m . ' <a href="' . $u . '" target="_top">Uygulamaya dön</a></p>'
        . '<script>try{window.top.location.href=' . json_encode($url) . ';}catch(e){location.href=' . json_encode($url) . ';}</script></body></html>';
    exit;
}

function od_paid_note(string $oid): void
{
    $pay = m_one('SELECT * FROM bl_payments WHERE oid = ?', [$oid]);
    if (!$pay) return;
    $plan = bl_plan((int)$pay['plan_id']);
    $sub = bl_sub((string)$pay['tkey']);
    bl_unit_notify((string)$pay['tkey'], 'Ödemeniz alındı', ($plan['name'] ?? 'Paket') . ' · ' . (BL_PERIODS[$pay['period']] ?? '') . ' · ' . bl_money((int)$pay['total'])
        . ' ödemeniz alındı. Abonelik bitişi: ' . ($sub['current_end'] ? date('d.m.Y', strtotime((string)$sub['current_end'])) : '-') . '.');
}

try {
    switch ($p) {
        case 'paytr':
            header('Content-Type: text/plain; charset=utf-8');
            $post = array_map('strval', array_filter($_POST, 'is_scalar'));
            if (!bl_paytr_verify($post)) { http_response_code(400); exit('PAYTR notification failed: bad hash'); }
            $oid = (string)$post['merchant_oid'];
            if ($post['status'] === 'success') {
                if (bl_pay_mark_paid($oid, 'paytr:' . $oid, (int)$post['total_amount'], json_encode($post, JSON_UNESCAPED_UNICODE))) od_paid_note($oid);
            } else {
                bl_pay_mark_failed($oid, 'PayTR: ' . ($post['failed_reason_msg'] ?? ('kod ' . ($post['failed_reason_code'] ?? '?'))), json_encode($post, JSON_UNESCAPED_UNICODE));
            }
            exit('OK'); // PayTR "OK" almazsa bildirimi yineler

        case 'iyzico':
            $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_POST['token'] ?? ($_GET['token'] ?? '')));
            $pay = $token !== '' ? m_one("SELECT * FROM bl_payments WHERE provider = 'iyzico' AND ref = ?", [$token]) : null;
            if (!$pay) od_back(bl_site(), 'Ödeme kaydı bulunamadı.');
            if ($pay['status'] === 'paid') od_back(bl_unit_url((string)$pay['tkey'], '#/abonelik/tamam'), 'Ödemeniz alındı.');
            [$oid, $ok, $amount, $pid, $raw, $err] = bl_iyzico_result($token);
            if ($ok && bl_pay_mark_paid((string)$pay['oid'], 'iyzico:' . $pid, $amount, $raw)) {
                od_paid_note((string)$pay['oid']);
                od_back(bl_unit_url((string)$pay['tkey'], '#/abonelik/tamam'), 'Ödemeniz alındı.');
            }
            if (!$ok) bl_pay_mark_failed((string)$pay['oid'], 'iyzico: ' . ($err ?: 'ödeme tamamlanmadı'), $raw);
            $again = m_one('SELECT status FROM bl_payments WHERE id = ?', [$pay['id']]);
            od_back(bl_unit_url((string)$pay['tkey'], ($again['status'] ?? '') === 'paid' ? '#/abonelik/tamam' : '#/abonelik/hata'), ($again['status'] ?? '') === 'paid' ? 'Ödemeniz alındı.' : 'Ödeme tamamlanmadı.');

        case 'ok':
        case 'fail':
            $pay = m_one('SELECT tkey FROM bl_payments WHERE oid = ?', [preg_replace('/[^A-Za-z0-9]/', '', (string)($_GET['oid'] ?? ''))]);
            od_back($pay ? bl_unit_url((string)$pay['tkey'], $p === 'ok' ? '#/abonelik/tamam' : '#/abonelik/hata') : bl_site(), $p === 'ok' ? 'Ödemeniz işleniyor.' : 'Ödeme tamamlanmadı.');
    }
} catch (Throwable $e) {
    error_log('[dupcii] ödeme dönüşü (' . $p . '): ' . $e->getMessage());
    if ($p === 'paytr') { http_response_code(500); exit('ERR'); }
    od_back(bl_site(), 'Ödeme sonucu okunamadı; birkaç dakika sonra Abonelik sayfasından kontrol edin.');
}
http_response_code(404);
echo 'Not found';
