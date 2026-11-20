<?php
/**
 * Tanıtım sayfası (tanitim.php) — 4.19: ayrıntılı, görselli.
 * Görseller ekran görüntüsü değil, uygulamanın arayüzünü taklit eden HTML/CSS çizimleridir (paket küçük kalır, her ekranda net).
 * Örneklerdeki adlar uydurmadır. Başlık ve alt metin "Site ve yedek" (ya da tek birimde Ayarlar) bölümünden değiştirilir.
 */
declare(strict_types=1);

function lp_css(): string
{
    return '.lp-sec{padding:56px 0}.lp-alt{background:var(--card);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}'
        . '.lp-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;padding:56px 20px 40px}.lp-hero h1{font-size:clamp(30px,4.6vw,50px);line-height:1.1;letter-spacing:-.035em;margin:0 0 16px}'
        . '.lp-hero p.lead2{font-size:clamp(16px,2vw,18.5px);color:var(--ink2);margin:0 0 24px}.lp-hero .cta{justify-content:flex-start}.lp-trust{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:22px;color:var(--ink3);font-size:13.5px}'
        . '.lp-trust span:before{content:"✓";color:var(--brand);font-weight:800;margin-right:6px}'
        . '.lp-feat{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}.lp-feat.rev .lp-txt{order:2}.lp-txt h2{font-size:clamp(23px,3vw,30px);letter-spacing:-.03em;margin:8px 0 10px;line-height:1.2}'
        . '.lp-txt>p{color:var(--ink2);margin:0 0 14px}.lp-k{font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--brand)}'
        . '.lp-list{list-style:none;padding:0;margin:0;display:grid;gap:9px}.lp-list li{position:relative;padding-left:28px;color:var(--ink2);font-size:15px}.lp-list li:before{content:"";position:absolute;left:0;top:3px;width:18px;height:18px;border-radius:6px;background:var(--soft) url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%230b7a75%27 stroke-width=%273.5%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M5 12l5 5L20 7%27/%3E%3C/svg%3E") center/11px no-repeat}'
        . '.lp-vis{position:relative;border-radius:26px;padding:30px 26px;background:linear-gradient(140deg,#e7f5f3,#eceaff 60%,#f6eefe);display:grid;gap:12px;justify-items:center;overflow:hidden}'
        . '@media (prefers-color-scheme:dark){.lp-vis{background:linear-gradient(140deg,#13302d,#1d1b3a 60%,#2a1d36)}}'
        . '.ui{width:100%;max-width:380px;background:#fff;color:#0f1b21;border-radius:16px;box-shadow:0 14px 34px rgba(26,31,61,.13),0 2px 6px rgba(26,31,61,.06);padding:14px;font-size:12.5px;line-height:1.4;text-align:left}'
        . '.ui.sm{max-width:300px}.ui-h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13.5px;margin-bottom:10px}.ui-h .sp{flex:1}.ui-s{color:#6b7c84;font-size:11.5px;font-weight:500}'
        . '.av{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:10.5px;font-weight:700;color:#fff;background:#0b7a75}.av.b{background:#5b6fe0}.av.c{background:#d9822b}.av.d{background:#b14a8a}.av.e{background:#3a8f4f}'
        . '.pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;font-size:10.5px;font-weight:700;background:#eef2f4;color:#4b5a63}.pill.g{background:#e5f6ec;color:#1e7a46}.pill.a{background:#fff3dc;color:#9a6300}.pill.r{background:#fde8ea;color:#b0364b}.pill.t{background:#e3f4f2;color:#0b7a75}.pill.p{background:#efeaff;color:#5b3fd1}'
        . '.ui-btns{display:flex;gap:6px;margin-top:10px}.ui-b{flex:1;text-align:center;padding:8px;border-radius:10px;font-weight:700;font-size:12px;background:#eef2f4;color:#24343b}.ui-b.pri{color:#fff;background:linear-gradient(135deg,#0b8a83,#5b6fe0)}'
        . '.row2{display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid #eef2f4}.row2:first-of-type{border-top:0}.row2 .gr{flex:1;min-width:0}.row2 b{display:block;font-size:12.5px}'
        . '.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}.cal i{font-style:normal;font-size:9.5px;color:#8a989f;font-weight:700}.cal span{min-height:34px;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10.5px;color:#4b5a63;background:#f6f8f9;padding:3px 0}'
        . '.cal span em{font-style:normal;font-size:8px;line-height:1.3;font-weight:800;padding:0 4px;border-radius:5px;color:#fff}.cal .d em{background:#0b7a75}.cal .n em{background:#5b3fd1}.cal .f em{background:#d9822b}'
        . '.cal .to{outline:2px solid #0b7a75;outline-offset:-2px;font-weight:800;color:#0b7a75}.cal .x{opacity:.35}'
        . '.next{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;border-radius:12px;color:#fff;background:linear-gradient(135deg,#0b8a83,#5b6fe0 75%)}.next b{font-size:15px;display:block}.next small{opacity:.85}'
        . '.chk{display:grid;gap:5px;margin-top:9px}.chk div{display:flex;gap:7px;align-items:center;font-size:11.5px;color:#24343b}.chk div:before{content:"✓";width:16px;height:16px;border-radius:5px;display:grid;place-items:center;background:#e5f6ec;color:#1e7a46;font-weight:800;font-size:10px}.chk div.w:before{content:"…";background:#fff3dc;color:#9a6300}'
        . '.swap{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.swap>div{padding:8px;border-radius:10px;background:#f6f8f9}.swap .ui-s{display:block}.swap .ar{font-size:16px;color:#5b6fe0;font-weight:800}'
        . '.seg3{display:flex;padding:3px;border-radius:10px;background:#eef2f4;gap:3px}.seg3 span{flex:1;text-align:center;padding:6px 4px;border-radius:8px;font-size:11px;font-weight:700;color:#4b5a63}.seg3 .on{background:#fff;color:#0b7a75;box-shadow:0 1px 3px rgba(0,0,0,.08)}'
        . '.tbl{display:grid;grid-template-columns:62px repeat(7,1fr);gap:3px;font-size:10px;text-align:center}.tbl b{font-size:9.5px;color:#8a989f}.tbl .nm{text-align:left;font-weight:700;color:#24343b;font-size:10.5px;white-space:nowrap;overflow:hidden}.tbl span{padding:5px 0;border-radius:6px;font-weight:800;background:#f6f8f9;color:#8a989f}'
        . '.tbl .G{background:#e3f4f2;color:#0b7a75}.tbl .N{background:#efeaff;color:#5b3fd1}.tbl .T{background:#fff1e0;color:#b36200}.tbl .bad{outline:2px solid #d13d3d;outline-offset:-2px}'
        . '.warn{margin-top:8px;padding:7px 9px;border-radius:9px;background:#fde8ea;color:#b0364b;font-size:11px;font-weight:600}'
        . '.bub{max-width:82%;padding:8px 10px;border-radius:14px;font-size:12px;margin-top:6px}.bub.in{background:#f1f3f5;border-bottom-left-radius:4px}.bub.out{margin-left:auto;background:#d8f3ee;border-bottom-right-radius:4px}.bub small{display:block;font-size:9.5px;color:#6b7c84;text-align:right;margin-top:2px}.bub .who{font-weight:700;font-size:10.5px;color:#5b3fd1;display:block}'
        . '.voice{display:flex;align-items:center;gap:6px}.voice i{flex:1;height:18px;background:repeating-linear-gradient(90deg,#0b7a75 0 2px,transparent 2px 5px);opacity:.5;border-radius:3px}'
        . '.bar{height:8px;border-radius:99px;background:#eef2f4;overflow:hidden;margin:8px 0 4px}.bar i{display:block;height:100%;width:82%;background:linear-gradient(90deg,#0b8a83,#5b6fe0)}'
        . '.avs{display:flex}.avs .av{width:24px;height:24px;font-size:8.5px;border:2px solid #fff;margin-left:-4px}.avs .av:first-child{margin-left:0}'
        . '.ntf{width:100%;max-width:340px;display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border-radius:16px;background:rgba(255,255,255,.88);backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(26,31,61,.12);color:#0f1b21;font-size:12px;text-align:left}'
        . '.ntf img{width:30px;height:30px;border-radius:8px}.ntf b{display:block;font-size:12.5px}.ntf small{color:#6b7c84;margin-left:auto;font-size:10.5px;white-space:nowrap}'
        . '.phone{width:min(300px,100%);margin:0 auto;border-radius:38px;padding:11px;background:#141a33;box-shadow:0 30px 60px rgba(26,31,61,.28)}.phone .scr{border-radius:29px;background:#f3f6f7;padding:14px 12px 16px;min-height:520px;color:#0f1b21}'
        . '.phone .top2{display:flex;justify-content:space-between;font-size:10.5px;font-weight:700;color:#4b5a63;padding:0 6px 10px}.phone .hi{font-size:17px;font-weight:800;letter-spacing:-.02em;margin:2px 4px 10px}'
        . '.phone .ui{padding:12px;margin-bottom:9px}.float{position:absolute;right:-24px;top:-18px;max-width:240px}'
        . '.roles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.roles .card h3{font-size:18px;margin:12px 0 10px}.roles .card .lp-list li{font-size:14px}'
        . '.sec4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.sec4 .card h3{font-size:15px;margin:10px 0 4px}.sec4 .card p{font-size:13.5px}'
        . '.faq{max-width:820px;margin:0 auto;display:grid;gap:10px}.faq details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 18px}.faq summary{cursor:pointer;font-weight:650;padding:12px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}'
        . '.faq summary:after{content:"+";color:var(--brand);font-weight:800;font-size:18px;line-height:1}.faq details[open] summary:after{content:"−"}.faq details p{margin:0 0 14px;color:var(--ink2)}.faq summary::-webkit-details-marker{display:none}'
        . '.toc{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:6px auto 0;max-width:900px}.toc a{padding:7px 13px;border-radius:99px;background:var(--card);border:1px solid var(--line);color:var(--ink2);font-size:13.5px;text-decoration:none;font-weight:500}.toc a:hover{border-color:var(--brand);color:var(--brand)}'
        . '.why{max-width:980px;margin:0 auto;display:grid;gap:10px}.why-h,.why-r{display:grid;grid-template-columns:190px 1fr 1fr;gap:10px}.why-h span{font-size:12.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);padding:0 16px}.why-h span:last-child{color:var(--brand);text-transform:none;letter-spacing:0;font-size:14px}'
        . '.why-k{display:flex;align-items:center;font-weight:700;font-size:15px;padding:14px 4px}.why-a,.why-b{position:relative;padding:14px 16px 14px 44px;border-radius:14px;font-size:14.5px;line-height:1.5}'
        . '.why-a{background:var(--card);border:1px solid var(--line);color:var(--ink3)}.why-b{background:var(--soft);border:1px solid color-mix(in srgb,var(--brand) 25%,transparent);color:var(--ink);font-weight:500}'
        . '.why-a:before,.why-b:before{position:absolute;left:14px;top:13px;width:20px;height:20px;border-radius:7px;display:grid;place-items:center;font-size:11px;font-weight:800}.why-a:before{content:"✕";background:var(--line);color:var(--ink3)}.why-b:before{content:"✓";background:var(--brand);color:#fff}'
        . '.why-sum{max-width:980px;margin:22px auto 0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.why-sum .card{text-align:center}.why-sum b{display:block;font-size:30px;letter-spacing:-.03em;background:linear-gradient(135deg,#0b8a83,#5b6fe0);-webkit-background-clip:text;background-clip:text;color:transparent}.why-sum span{color:var(--ink2);font-size:14px}'
        . '@media (max-width:760px){.why-h{display:none}.why-r{grid-template-columns:1fr;gap:6px;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card)}.why-k{padding:0 0 4px}.why-a,.why-b{font-size:14px}.why-a:after{content:"Alışılmış yol";display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-top:4px}.why-b:after{content:"dupcii ile";display:block;font-size:12px;font-weight:700;margin-top:4px;color:var(--brand)}.why-sum{grid-template-columns:1fr}}'
        . '@media (max-width:900px){.lp-hero,.lp-feat{grid-template-columns:1fr;gap:28px}.lp-feat.rev .lp-txt{order:0}.roles,.sec4{grid-template-columns:1fr 1fr}.float{position:static;margin:12px auto 0}.lp-hero{text-align:left}}'
        . '@media (max-width:600px){.roles,.sec4{grid-template-columns:1fr}.lp-sec{padding:40px 0}.lp-vis{padding:20px 14px}.phone .scr{min-height:0}}';
}

/** Bir özellik bölümü: metin + görsel */
function lp_feature(string $id, string $kicker, string $title, string $text, array $points, string $vis, bool $rev = false, bool $alt = false): string
{
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    return '<section class="lp-sec' . ($alt ? ' lp-alt' : '') . '" id="' . $id . '"><div class="wrap lp-feat' . ($rev ? ' rev' : '') . '"><div class="lp-txt"><span class="lp-k">' . $e($kicker) . '</span><h2>' . $e($title) . '</h2><p>' . $e($text) . '</p>'
        . '<ul class="lp-list">' . implode('', array_map(fn($p) => '<li>' . $e($p) . '</li>', $points)) . '</ul></div><div class="lp-vis" aria-hidden="true">' . $vis . '</div></div></section>';
}

function lg_landing_page(): void
{
    if (!lg_on()) { header('Location: index.php'); return; }
    $apply = function_exists('ap_open') && ap_open();
    $brand = lg_get('brand', 'dupcii');
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $hero = lg_get('hero', 'Nöbet listeleri, değişimler ve ekip iletişimi tek yerde');
    $sub = lg_get('sub', 'Hastane birimleri için kapalı ekip portalı. Excel listeniz olduğu gibi kalır; ekibiniz telefondan nöbetini görür, değişim ister, eksikte gönüllü olur, duyuruları okur.');

    /* ---------- Görseller (uydurma örnek veriler) ---------- */
    $cal = '<div class="cal">' . implode('', array_map(fn($d) => '<i>' . $d . '</i>', ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']));
    $plan = [3 => 'd', 6 => 'n', 9 => 'f', 12 => 'd', 13 => 'd', 16 => 'n', 19 => 'f', 22 => 'd', 25 => 'n', 27 => 'd'];
    $code = ['d' => 'G', 'n' => 'N', 'f' => '24'];
    for ($i = 0; $i < 28; $i++) { $day = $i + 1; $c = $plan[$day] ?? ''; $cal .= '<span class="' . $c . ($day === 18 ? ' to' : '') . ($day < 8 ? ' x' : '') . '">' . $day . ($c ? '<em>' . $code[$c] . '</em>' : '') . '</span>'; }
    $cal .= '</div>';
    $visCal = '<div class="ui"><div class="ui-h">Takvimim<span class="sp"></span><span class="pill t">Kasım</span><span class="pill">Sadece ben</span></div>' . $cal
        . '<div class="next"><div><small>Sıradaki nöbetiniz</small><b>Perşembe 08:00 · 24 saat</b><small>2 gün 14 saat sonra</small></div></div></div>'
        . '<div class="ui sm"><div class="row2"><span class="av b">EY</span><div class="gr"><b>Bugün nöbette</b><span class="ui-s">Elif Y., Burak T., Selin A. ve 3 kişi</span></div><span class="pill g">Kim nöbette</span></div></div>';
    $visSwap = '<div class="ui"><div class="ui-h"><span class="av c">MD</span><div>Değişim isteği<div class="ui-s">Mehmet D. · 2 dakika önce</div></div><span class="sp"></span><span class="pill a">Bekliyor</span></div>'
        . '<div class="swap"><div><span class="ui-s">Verdiği</span><b>12 Kasım</b><div class="ui-s">Gece 16-08</div></div><span class="ar">⇄</span><div><span class="ui-s">Aldığı</span><b>15 Kasım</b><div class="ui-s">Gündüz 08-16</div></div></div>'
        . '<div class="chk"><div>Dinlenme süresi uygun (16 saat)</div><div>Üst üste en fazla 24 saat</div><div class="w">Sorumlu onayı bekleniyor</div></div><div class="ui-btns"><span class="ui-b pri">Kabul et</span><span class="ui-b">Reddet</span></div></div>'
        . '<div class="ui sm"><div class="ui-s" style="margin-bottom:6px">24 saatlik nöbetin hangi kısmını veriyorsunuz?</div><div class="seg3"><span>Tümü</span><span class="on">Gündüz 08-16</span><span>Gece 16-08</span></div></div>';
    $visCall = '<div class="ui"><div class="ui-h"><span class="pill r">Eksik</span>Yarın gece · 1 kişi aranıyor<span class="sp"></span></div><div class="ui-s" style="margin-bottom:6px">Kurallara uyan 9 kişiye soruldu · 4 yanıt</div>'
        . '<div class="row2"><span class="av">AK</span><div class="gr"><b>Ayşe K.</b><span class="ui-s">Bu ay 112 saat</span></div><span class="pill g">Gelebilir</span></div>'
        . '<div class="row2"><span class="av e">SA</span><div class="gr"><b>Selin A.</b><span class="ui-s">Bu ay 96 saat · ekstra isteyen</span></div><span class="pill g">Gelebilir</span></div>'
        . '<div class="row2"><span class="av d">BT</span><div class="gr"><b>Burak T.</b><span class="ui-s">Bu ay 128 saat</span></div><span class="pill">Gelemez</span></div>'
        . '<div class="ui-btns"><span class="ui-b pri">Selin A.’yı seç</span></div></div>';
    $rows = ['Ayşe K.' => 'G N - - G 24 -', 'Elif Y.' => '- G G N - - G', 'Burak T.' => '24 - - G N - -', 'Selin A.' => 'N - 24 - - G G'];
    $tbl = '<div class="tbl"><b></b>' . implode('', array_map(fn($d) => '<b>' . $d . '</b>', ['1', '2', '3', '4', '5', '6', '7']));
    foreach ($rows as $n => $r) { $tbl .= '<div class="nm">' . $n . '</div>'; foreach (explode(' ', $r) as $j => $c) $tbl .= '<span class="' . ($c === '24' ? 'T' : $c) . ($n === 'Burak T.' && $j === 0 ? ' bad' : '') . '">' . ($c === '-' ? '·' : $c) . '</span>'; }
    $tbl .= '</div>';
    $visPlan = '<div class="ui"><div class="ui-h">Aralık çizelgesi<span class="sp"></span><span class="pill p">Taslak</span></div>' . $tbl
        . '<div class="warn">Burak T. · 1 Aralık: önceki nöbetten sonra 16 saat dinlenme yok</div><div class="ui-btns"><span class="ui-b">Otomatik doldur</span><span class="ui-b pri">Yayınla</span></div></div>';
    $visChat = '<div class="ui"><div class="ui-h"><span class="av">YB</span><div>Yoğun Bakım<div class="ui-s">24 üye · Elif yazıyor…</div></div></div>'
        . '<div class="bub in"><span class="who">Selin A.</span>Sabah devirde 3 numaralı ventilatörün filtresi değişecek 🙏<small>08:12</small></div>'
        . '<div class="bub out">Tamam, devir notuna ekledim<small>08:14 ✓✓</small></div>'
        . '<div class="bub in"><span class="who">Burak T.</span><div class="voice">▶<i></i>0:14</div><small>08:20</small></div>'
        . '<div class="bub in" style="max-width:90%"><span class="who">Sorumlu</span>Anket: Bayram nöbetleri için toplantı?<div class="bar"><i></i></div><span class="ui-s">Cuma 14:00 · 14 oy</span></div></div>';
    $visDoc = '<div class="ui"><div class="ui-h"><span class="pill r">Zorunlu</span>Santral kateter bakımı v3<span class="sp"></span></div><div class="ui-s">Klinik protokoller · hastane geneli</div>'
        . '<div class="bar"><i></i></div><div style="display:flex;align-items:center;gap:8px"><div class="avs"><span class="av">AK</span><span class="av b">EY</span><span class="av c">MD</span><span class="av e">SA</span></div><span class="ui-s"><b style="display:inline;color:#0f1b21">18 / 22</b> kişi okudu · 4 kişiye hatırlatıldı</span></div>'
        . '<div class="ui-btns"><span class="ui-b pri">Okudum, onaylıyorum</span></div></div>'
        . '<div class="ui sm"><div class="row2"><span class="av d"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span><div class="gr"><b>“heparin”</b><span class="ui-s">3 protokol, 1 duyuru, 2 mesajda bulundu</span></div></div></div>';
    $visMeal = '<div class="ui sm"><div class="ui-h">Sıradaki öğün<span class="sp"></span><span class="pill t">Akşam 18:00</span></div><div class="ui-s" style="margin-bottom:6px">Nöbetinizde 2 öğün var</div>'
        . '<div class="row2"><div class="gr"><b>Mercimek çorbası</b></div></div><div class="row2"><div class="gr"><b>Fırında tavuk · Pirinç pilavı</b></div></div><div class="row2"><div class="gr"><b>Ayran · Mevsim salata</b></div></div></div>'
        . '<div class="ui sm"><div class="ui-h">Telefon rehberi</div><div class="row2"><div class="gr"><b>Acil Servis</b><span class="ui-s">Hastane ortak rehberi</span></div><span class="pill t">2201</span></div><div class="row2"><div class="gr"><b>Kan merkezi</b><span class="ui-s">7/24</span></div><span class="pill t">2450</span></div></div>';
    $ico = '<img src="assets/icon.svg" alt="">';
    $visNtf = '<div class="ntf">' . $ico . '<div><b>Değişiminiz onaylandı</b>15 Kasım gündüz artık sizde.</div><small>şimdi</small></div>'
        . '<div class="ntf">' . $ico . '<div><b>Yarın 08:00 nöbetiniz var</b>Yoğun Bakım · 24 saat</div><small>18:00</small></div>'
        . '<div class="ntf">' . $ico . '<div><b>Eksik personel</b>Bu gece için gönüllü aranıyor. Gelebilir misiniz?</div><small>2 dk</small></div>'
        . '<div class="ntf">' . $ico . '<div><b>Yoğun Bakım grubu</b>3 yeni mesaj</div><small>5 dk</small></div>';
    $heroPhone = '<div class="phone"><div class="scr"><div class="top2"><span>09:41</span><span>●●● 5G</span></div><div class="hi">Günaydın, Elif</div>'
        . '<div class="next" style="margin:0 0 9px"><div><small>Sıradaki nöbetiniz</small><b>Perşembe 08:00 · 24 saat</b><small>Yoğun Bakım · A blok</small></div></div>'
        . '<div class="ui"><div class="ui-h">Bu hafta<span class="sp"></span><span class="pill">3 nöbet</span></div><div class="cal">' . implode('', array_map(fn($d) => '<i>' . $d . '</i>', ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']))
        . '<span>16</span><span class="d">17<em>G</em></span><span class="to">18</span><span class="f">19<em>24</em></span><span>20</span><span class="n">21<em>N</em></span><span>22</span></div></div>'
        . '<div class="ui"><div class="row2"><span class="pill r">Eksik</span><div class="gr"><b>Bu gece 1 kişi aranıyor</b><span class="ui-s">Gelebilir misiniz?</span></div></div></div>'
        . '<div class="ui"><div class="row2"><span class="av c">MD</span><div class="gr"><b>Mehmet D. değişim istedi</b><span class="ui-s">12 Kas gece ⇄ 15 Kas gündüz</span></div></div></div></div></div>'
        . '<div class="ntf float">' . $ico . '<div><b>Değişiminiz onaylandı</b>15 Kasım gündüz artık sizde.</div></div>';

    /* ---------- Sayfa ---------- */
    lg_page_head($brand . ' · ' . $hero, $sub, lp_css());
    $o = lg_page_top($apply);
    $o .= '<main><div class="wrap lp-hero"><div><span class="pill">Hemşire ve hekim ekipleri için</span><h1>' . $e($hero) . '</h1><p class="lead2">' . $e($sub) . '</p><div class="cta">'
        . ($apply ? '<a class="btn pri" href="index.php#/basvuru">Biriminizi açın</a>' : '') . '<a class="btn" href="#ozellikler">Neler yapabilirim?</a><a class="btn" href="index.php">Giriş yap</a></div>'
        . '<div class="lp-trust"><span>Kurulum yok, telefona uygulama gibi eklenir</span><span>Excel listeniz olduğu gibi kalır</span><span>Her birimin verisi ayrı</span></div></div>'
        . '<div style="position:relative">' . $heroPhone . '</div></div>';
    $o .= '<section class="lp-sec lp-alt" id="ozellikler"><div class="wrap"><h2 class="s">Birimin günlük işi, tek uygulamada</h2><p class="lead">Telefon trafiğini, WhatsApp gruplarını ve kâğıt listeleri tek bir düzenli yere taşıyın.</p><div class="toc">'
        . '<a href="#neden">Neden dupcii?</a><a href="#nobet">Nöbet listeleri</a><a href="#degisim">Değişim ve devir</a><a href="#eksik">Eksik personel</a><a href="#cizelge">Çizelge hazırlama</a><a href="#mesaj">Mesajlaşma</a><a href="#duyuru">Duyuru ve protokoller</a><a href="#yemek">Yemek ve rehber</a><a href="#bildirim">Bildirimler</a></div></div></section>';
    $o .= lp_feature('nobet', 'Nöbet listeleri', 'Nöbet listeleri her an cepte', 'Sorumlunun hazırladığı Excel ya da Google E-Tablolar listesi portalda açılır. Kimse dosya aramaz, ekran görüntüsü paylaşmaz.',
        ['Herkes kendi nöbetlerini “Takvimim”de görür; “Sadece ben” ile listede yalnız kendi satırı', 'Liste güncellenince değişiklik anında herkese yansır', '“Kim nöbette” ile bugün ve yarın kimin çalıştığı tek bakışta', 'Telefon takvimine ekleme, nöbet hatırlatması, geri sayım'], $visCal);
    $o .= lp_feature('degisim', 'Değişim, devir ve ilan', 'Değişim için telefon telefon aramaya son', 'Nöbetinizi değiştirmek ya da devretmek istediğinizde, kurallara uyan uygun kişiler otomatik çıkar. Sorumlu tek dokunuşla onaylar.',
        ['Dinlenme süresi, üst üste en fazla 24 saat gibi kurallar kendiliğinden denetlenir', '24 saatlik nöbetin yalnız gündüzü (08-16) ya da gecesi (16-08) verilebilir', 'Nöbet ilanı: “bu nöbetimi verebilirim” deyin, isteyen başvursun', 'Tüm değişimler kayıtlı; Excel’e işlenmeyenler bile hesaba katılır'], $visSwap, true, true);
    $o .= lp_feature('eksik', 'Eksik personel çağrısı', 'Eksik vardiya dakikalar içinde dolsun', 'Bir kişi eksik kaldığında sorumlu tek seferde, o güne gelebilecek kişilere sorar. Yanıtlar canlı görünür, gönüllüler arasından seçilir.',
        ['Yalnız kurallara uyan ve o gün boş olan kişilere sorulur', 'Ekstra nöbet isteyenler öncelikli görünür', 'Bu ay kim kaç saat çalıştı yanında yazar; adil seçim kolaylaşır', 'Seçilen kişiye ve diğerlerine anında bildirim gider'], $visCall);
    $o .= lp_feature('cizelge', 'Çizelge hazırlama ve istekler', 'Excel kullanmayan birimler için çizelge', 'Aylık çizelgeyi portalda hazırlayın. Kurala aykırı her hücre kırmızıyla işaretlenir; otomatik doldurma boşlukları adil şekilde tamamlar.',
        ['Boşluk ve yıllık izin istekleri dönem dönem toplanır, sorumlu onaylar', 'Otomatik doldurma: az çalışan ve dinlenmiş kişiler önce', 'Yayınlayınca liste tüm ekipte görünür', 'Günlük blok / taraf yerleşimi ve WhatsApp’a gönderilecek görsel'], $visPlan, true, true);
    $o .= lp_feature('mesaj', 'Mesajlaşma', 'Ekibin kendi mesajlaşması', 'Birim grubu, özel gruplar ve birebir sohbet; WhatsApp’a gerek kalmadan, kişisel numara paylaşmadan.',
        ['Fotoğraf, dosya, sesli mesaj, anket, yanıtla, ilet, sabitle', 'Sesli ve görüntülü arama, hastane içi birimler arası', 'Kim okudu, @bahsetme, sessize alma, kaybolan mesajlar', 'T.C. kimlik numarası gibi hasta bilgisi gönderilmeden uyarılır'], $visChat);
    $o .= lp_feature('duyuru', 'Duyuru ve protokoller', 'Önemli bilgi kaybolmaz', 'Protokol, talimat ve duyurular düzenli bir yerde durur. Zorunlu olanları kimin okuduğu görünür, okumayanlara hatırlatılır.',
        ['“Okudum, onaylıyorum” ile okundu takibi ve rapor', 'Hastane geneli belgeler tüm birimlerde ortak', 'Gözden geçirme tarihi yaklaşınca uyarı', 'Tüm içerikte, dosyaların içinde bile arama'], $visDoc, true, true);
    $o .= lp_feature('yemek', 'Yemek listesi ve rehber', 'Küçük ama her gün lazım', 'Hastanenin aylık yemek listesi PDF ya da Excel’den bir kez yüklenir; herkes günün menüsünü ve nöbetinde yiyeceği öğünleri görür.',
        ['Saate göre sıradaki öğün: gece 01:00, öğle 12:00, akşam 18:00', 'Nöbetteki öğünler takvimde', 'Hastane ortak telefon rehberi: dahili numaralar, santral, acil', 'Kişiye dokununca mesaj, arama ve yaklaşan nöbetleri'], $visMeal);
    $o .= lp_feature('bildirim', 'Bildirimler', 'Gereken bilgi, gerektiği anda', 'Uygulamayı telefona ekleyince bildirimler anında gelir. Hangi bildirimi alacağınıza ve sessiz saatlere siz karar verirsiniz.',
        ['Nöbet hatırlatması, değişim yanıtları, eksik çağrıları, mesajlar', 'Sessiz saatler, kategori seçimi, kilit ekranında içerik gizleme', 'Bildirim içeriği uçtan uca şifreli', 'İsteyene e-posta ya da sabah özeti'], $visNtf, true, true);
    $whyRows = [
        ['Nöbet listesi', 'Listeyi yeni bir programda baştan hazırlamak, ekibe yeni bir düzen öğretmek', 'Bugünkü Excel ya da Google listeniz olduğu gibi okunur; sorumlunun alışkanlığı değişmez'],
        ['Nöbet değişimi', 'WhatsApp’ta yazışma, telefonla onay, kuralların akılda tutulması', 'Kurallara uyan adaylar otomatik çıkar; dinlenme süresi denetlenir, sorumlu tek dokunuşla onaylar'],
        ['Eksik personel', 'Sorumlunun tek tek araması, “kim boş?” sorusu', 'O gün gelebilecek herkese aynı anda sorulur; yanıtlar canlı görünür, adil seçim yapılır'],
        ['Ekip iletişimi', 'Kişisel numaralarla açılmış WhatsApp grupları, kaybolan mesajlar', 'Ekibe özel mesajlaşma ve arama; numara paylaşmadan, hasta bilgisi uyarısıyla'],
        ['Duyuru ve protokol', 'Panoya asılan kâğıt, kimin okuduğu belirsiz', 'Okundu takibi, okumayanlara hatırlatma, hastane geneli ortak belgeler'],
        ['Türkiye’deki nöbet düzeni', 'Genel vardiya programları 24 saatlik nöbeti, gündüz/gece parçasını bilmez', '24 saatin gündüz (08-16) / gece (16-08) parçası, 16 saat dinlenme, izin bitişiği hafta sonu kuralı'],
        ['Hastane ölçeği', 'Her servis ayrı uygulama, ayrı grup, ayrı liste', 'Bütün birimler tek portalda; her birimin verisi ayrı, rehber ve belgeler ortak'],
        ['Kurulum', 'Uygulama mağazası, bilgi işlem talebi, eğitim', 'Tarayıcıdan açılır, telefona eklenir; ekip karekodla dakikalar içinde katılır'],
    ];
    $o .= '<section class="lp-sec" id="neden"><div class="wrap"><h2 class="s">Neden dupcii?</h2><p class="lead">Bir nöbet programı değil; birimin bütün günlük işini tek yerde toplayan ekip portalı.</p>'
        . '<div class="why"><div class="why-h"><span></span><span>Alışılmış yol</span><span>dupcii ile</span></div>'
        . implode('', array_map(fn($r) => '<div class="why-r"><div class="why-k">' . $e($r[0]) . '</div><div class="why-a">' . $e($r[1]) . '</div><div class="why-b">' . $e($r[2]) . '</div></div>', $whyRows)) . '</div>'
        . '<div class="why-sum"><div class="card"><b>1 portal</b><span>nöbet, değişim, eksik çağrısı, mesaj, duyuru, yemek, rehber</span></div>'
        . '<div class="card"><b>0 değişiklik</b><span>Excel listenizde; olduğu gibi yüklenir</span></div>'
        . '<div class="card"><b>Dakikalar</b><span>başvuru formu da, ekibin karekodla katılması da bu kadar sürer</span></div></div></div></section>';
    $o .= '<section class="lp-sec"><div class="wrap"><h2 class="s">Herkes için ayrı kolaylık</h2><p class="lead">Aynı uygulama, her role kendi işini kolaylaştıran araçlarla gelir.</p><div class="roles">'
        . '<div class="card"><span class="pill t">Hemşire · hekim · personel</span><h3>Kendi düzenini yönet</h3><ul class="lp-list"><li>Nöbetini telefonda gör, hatırlatma al</li><li>Değişim, devir, ilan ve izin iste</li><li>Eksiğe gönüllü ol, ekstra nöbet iste</li><li>Ekibinle mesajlaş, duyuruları oku</li></ul></div>'
        . '<div class="card"><span class="pill p">Sorumlu · birim yöneticisi</span><h3>Yükü azalt, kontrolü tut</h3><ul class="lp-list"><li>Listeyi yükle ya da portalda hazırla</li><li>İstekleri ve değişimleri tek ekranda onayla</li><li>Eksiği tek dokunuşla duyur, gönüllü seç</li><li>Kim okudu, kim nerede, tek bakışta</li></ul></div>'
        . '<div class="card"><span class="pill a">Hastane idaresi</span><h3>Tüm birimler bir arada</h3><ul class="lp-list"><li>Birimler aynı portalda, verileri ayrı</li><li>Hastane geneli rehber ve belgeler</li><li>Birimler arası mesajlaşma ve arama</li><li>KVKK uyumlu, kayıtlı ve denetlenebilir</li></ul></div></div></div></section>';
    $o .= '<section class="lp-sec lp-alt"><div class="wrap"><h2 class="s">Güvenlik ve KVKK</h2><p class="lead">Sağlık çalışanlarının verisi hassastır; portal buna göre tasarlandı.</p><div class="sec4">'
        . '<div class="card"><div class="ic"><svg viewBox="0 0 24 24"><path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4"/></svg></div><h3>Kapalı portal</h3><p>Yalnız yöneticinin onayladığı ekip girer; arama motorlarına kapalıdır.</p></div>'
        . '<div class="card"><div class="ic"><svg viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg></div><h3>Her birim ayrı</h3><p>Her birimin verisi ayrı veritabanında; bir birim diğerinin verisine ulaşamaz.</p></div>'
        . '<div class="card"><div class="ic"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg></div><h3>KVKK hakları</h3><p>Aydınlatma metni, verilerimi indir, hesap silme talebi; reklam ve izleme yok.</p></div>'
        . '<div class="card"><div class="ic"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></div><h3>Şifreli yedek</h3><p>Veriler düzenli ve şifreli olarak sunucu dışına yedeklenir.</p></div></div></div></section>';
    if ($apply) $o .= '<section class="lp-sec"><div class="wrap"><h2 class="s">Nasıl başlanır</h2><p class="lead">Birim sorumlusu birkaç dakikada başvurur.</p><div class="grid steps">'
        . '<div class="card"><h3>Başvurun</h3><p>İş e-postanızı doğrulayın, hastanenizi ve biriminizi seçin.</p></div>'
        . '<div class="card"><h3>Onaylanınca giriş yapın</h3><p>Başvurunuz incelenir; biriminiz açılınca giriş bilgileriniz e-postanıza gelir.</p></div>'
        . '<div class="card"><h3>Ekibinizi davet edin</h3><p>Karekod ya da bağlantıyla ekip katılır; nöbet listenizi yükleyin. Hepsi bu.</p></div></div></div></section>';
    $o .= lp_plans();
    $faq = [
        ['Excel listemizi değiştirmemiz gerekiyor mu?', 'Hayır. Bugün kullandığınız Excel ya da Google E-Tablolar listesini olduğu gibi yüklersiniz; portal adları ve nöbet kodlarını kendisi tanır. İsterseniz çizelgeyi portalda da hazırlayabilirsiniz.'],
        ['Telefona uygulama indirmek gerekiyor mu?', 'Hayır. Tarayıcıdan açılır; “Ana ekrana ekle” ile uygulama gibi çalışır, bildirim alır. Android ve iPhone’da çalışır.'],
        ['Verilerimiz nerede, kim görür?', 'Her birimin verisi ayrı tutulur ve yalnız o birimin onaylı kullanıcılarına görünür. Ayrıntılar KVKK aydınlatma metnindedir.'],
        ['Hasta bilgisi yazılır mı?', 'Portal hasta verisi için tasarlanmamıştır. Mesajlarda T.C. kimlik numarası gibi bilgiler gönderilmeden önce uyarılır.'],
        ['Kaç kişi kullanabilir?', 'Birim büyüklüğüne göre değişir; küçük ekiplerden büyük kliniklere kadar uygundur. Aynı hastanenin birden çok birimi aynı portalı ayrı ayrı kullanabilir.'],
        ['Bir sorun olursa ne yapacağız?', lg_get('email') !== '' ? 'Bize ' . lg_get('email') . ' adresinden yazın' . (lg_get('phone') !== '' ? ' ya da ' . lg_get('phone') . ' numarasından arayın' : '') . '.' : 'Birim yöneticiniz ya da sistem yöneticisi size yardımcı olur.'],
    ];
    $o .= '<section class="lp-sec' . ($apply ? ' lp-alt' : '') . '" id="sss"><div class="wrap"><h2 class="s">Sık sorulanlar</h2><p class="lead">Aklınıza takılan bir şey varsa bize yazın.</p><div class="faq">'
        . implode('', array_map(fn($q) => '<details><summary>' . $e($q[0]) . '</summary><p>' . $e($q[1]) . '</p></details>', $faq)) . '</div></div></section>';
    $o .= '<section class="lp-sec"><div class="wrap"><div class="band"><h2>Ekibiniz için bugün başlayın</h2><p>' . ($apply ? 'Başvuru birkaç dakika sürer; kurulum gerekmez.' : 'Hesabınız varsa hemen giriş yapın.') . '</p>'
        . ($apply ? '<a class="btn pri" href="index.php#/basvuru">Birim açma başvurusu</a>' : '<a class="btn pri" href="index.php">Giriş yap</a>') . '</div></div></section></main>';
    echo $o . lg_page_foot();
}

/** Fiyatlar (abonelik sayfası birimlere görünürse) */
function lp_plans(): string
{
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    try {
        if (!function_exists('bl_on') || !bl_on() || bl_cfg()['visible'] !== '1') return '';
        $c = bl_cfg();
        $o = '';
        foreach (bl_plans(true) as $p) {
            $mods = $p['modules'] ? count($p['modules']) . ' modül' : 'Tüm modüller';
            $o .= '<div class="card price"><h3>' . $e($p['name']) . '</h3><div class="amt">' . ($p['is_free'] ? 'Ücretsiz' : $e(number_format($p['price_m'] / 100, 0, ',', '.')) . ' ₺<span class="muted"> / ay</span>') . '</div>'
                . '<div class="muted">' . ($p['is_free'] ? 'Temel kullanım için' : 'KDV hariç · yıllık ' . $e(number_format($p['price_y'] / 100, 0, ',', '.')) . ' ₺') . '</div>'
                . ($p['descr'] ? '<p class="muted" style="margin-top:8px">' . $e((string)$p['descr']) . '</p>' : '')
                . '<ul><li>' . ($p['max_users'] ? (int)$p['max_users'] . ' kişiye kadar' : 'Sınırsız kişi') . '</li><li>' . $e($mods) . '</li></ul></div>';
        }
        if ($o === '') return '';
        return '<section class="lp-sec lp-alt" id="fiyat"><div class="wrap"><h2 class="s">Fiyatlar</h2><p class="lead">' . ($c['trial_on'] === '1' ? (int)$c['trial_days'] . ' gün ücretsiz deneyin; kart bilgisi istenmez, süre bitince kendiliğinden ücretlendirme yapılmaz.' : 'Kendiliğinden yenileme ve gizli ücret yok.') . '</p><div class="grid">' . $o . '</div></div></section>';
    } catch (Throwable $ex) { return ''; }
}
