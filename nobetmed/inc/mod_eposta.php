<?php
/** E-posta tasarımı (4.45.0): stil, renk, logo boyutu / hizası, alt bilgi; canlı önizleme. Yönetici. */

function a_mail_design_get(): void
{
    need_admin();
    $from = (string)setting('mail_from', '');
    out(['design' => mail_design(), 'logo' => function_exists('brand_url') ? brand_url('mail_logo') : null, 'site_logo' => mail_logo_url(),
        'from' => $from, 'domain' => strpos($from, '@') !== false ? substr($from, strpos($from, '@') + 1) : '', 'site' => base_url()]);
}

function a_mail_design_save(): void
{
    $me = need_admin();
    $d = mail_design(arr('design'));
    set_setting('mail_design', json_encode($d, JSON_UNESCAPED_UNICODE));
    audit($me, 'settings.save', 'E-posta tasarımı', $d['style'] . ' · ' . $d['accent']);
    out(['design' => $d]);
}

/** Önizleme: kaydedilmemiş tasarımla örnek e-posta (HTML) */
function a_mail_preview(): void
{
    need_admin();
    $d = arr('design');
    [$html] = mail_template('Yarın nöbetiniz var', ['Merhaba, 24 Kasım Salı günü 16–08 nöbetiniz bulunuyor.', 'Nöbet değişimi ya da devir için portaldaki Nöbet bölümünü kullanabilirsiniz.'], 'Portalda aç', base_url(), mail_design($d));
    out(['html' => $html]);
}

return [
    'mail.design.get' => 'a_mail_design_get',
    'mail.design.save' => 'a_mail_design_save',
    'mail.preview' => 'a_mail_preview',
];
