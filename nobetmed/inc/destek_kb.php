<?php
/**
 * Destek bilgi bankası (4.25): "Sık sorulanlar · Ne nereden yapılır".
 * Her madde kimin yapabileceğini bilir; kişi yalnız kendi yetkisiyle (ve altındaki yetkilerle) yapabileceklerini görür.
 *   c (koşul): role   'admin' | 'lead' (yönetici + yayıncı) | 'member' (yalnız üye)
 *              mod    modül açık ve kişi en az "kullanır"
 *              manage modülde "yönetir" yetkisi
 *              env    'single' (tek birimli kurulum: sunucu işleri birim yöneticisinde) | 'multi'
 *              billing abonelik sayfası görünür
 *   t (konular): destek talebinde bu konuyu seçince "önce bunlara bakın" olarak çıkar.
 * Sunucu işleri (cron, güncelleme, sistem sağlığı) çok birimli kurulumda sistem yöneticisinindir; birimlere gösterilmez.
 */
declare(strict_types=1);

function sp_kb(): array
{
    $S = 'Hesap ve giriş'; $U = 'Uygulama ve bildirimler'; $N = 'Nöbet ve takvim'; $D = 'Değişim, devir ve ilanlar'; $I = 'Nöbet istekleri';
    $M = 'Mesajlar, duyurular ve belgeler'; $R = 'Sorumlu işleri'; $Y = 'Birim yönetimi'; $V = 'Sunucu ve güncelleme';
    return [
        // ---- Herkes: hesap ----
        ['k' => $S, 'q' => 'Şifremi unuttum', 'a' => 'Çıkış yapıp giriş ekranında “Şifremi unuttum”a dokunun; e-postanıza yeni şifre bağlantısı gelir. E-posta gelmezse birim yöneticinizden geçici şifre isteyin.', 'l' => null, 't' => ['giris']],
        ['k' => $S, 'q' => 'Şifremi değiştirmek istiyorum', 'a' => 'Hesabım › Güvenlik › Şifre.', 'l' => '#/profil/guvenlik', 't' => ['giris']],
        ['k' => $S, 'q' => 'Parmak izi / Face ID ile girmek', 'a' => 'Hesabım › Güvenlik › “Parmak izi / Face ID ile giriş”. Telefonunuzda bir kez açınca şifre yazmadan girersiniz.', 'l' => '#/profil/guvenlik', 't' => ['giris']],
        ['k' => $S, 'q' => 'Bilgisayarda telefonla giriş (QR kod)', 'a' => 'Bilgisayardaki giriş ekranında “Telefonla QR kod okutarak giriş”e tıklayın, kodu telefonunuzla okutup onaylayın. Ortak bilgisayarda tarayıcı kapanınca oturum biter.', 'l' => null, 't' => ['giris']],
        ['k' => $S, 'q' => 'Başka cihazda açık kalan oturumu kapatmak', 'a' => 'Hesabım › Güvenlik › Bağlı cihazlar: istemediğiniz cihazı kapatın.', 'l' => '#/profil/guvenlik', 't' => ['giris']],
        ['k' => $S, 'q' => 'Adım, e-postam ya da telefonum yanlış', 'a' => 'Hesabım › Profil’den düzeltin. Nöbet listesindeki adınızla aynı olması gerekir; yoksa takviminiz boş görünür.', 'l' => '#/profil/profil', 't' => ['giris', 'nobet']],
        ['k' => $S, 'q' => 'Hesabım onay bekliyor', 'a' => 'Yeni kayıtları birim yöneticisi onaylar. Yöneticinize haber verin; onaylanınca e-posta gelir.', 'l' => null, 't' => ['giris'], 'c' => ['role' => 'member']],
        ['k' => $S, 'q' => 'Verilerimin kopyasını almak / hesabımı sildirmek', 'a' => 'Hesabım › Verilerim: verilerinizi indirebilir, hesabınızın silinmesini isteyebilirsiniz.', 'l' => '#/profil/veri', 't' => ['giris', 'diger']],

        // ---- Herkes: uygulama ve bildirimler ----
        ['k' => $U, 'q' => 'Telefona uygulama gibi eklemek', 'a' => 'Android (Chrome): sağ üst menü › “Ana ekrana ekle”. iPhone (Safari): Paylaş › “Ana Ekrana Ekle”. Sonra uygulamayı ana ekrandaki simgeden açın.', 'l' => null, 't' => ['bildirim', 'hata']],
        ['k' => $U, 'q' => 'Telefona bildirim gelmiyor', 'a' => 'Hesabım › Bildirimler › “Bildirimleri aç”. iPhone’da önce uygulamayı ana ekrana ekleyip oradan açın. Telefonun ayarlarında tarayıcının / uygulamanın bildirim izni açık olmalı.', 'l' => '#/profil/bildirim', 't' => ['bildirim']],
        ['k' => $U, 'q' => 'Hangi bildirimlerin geleceğini ve sessiz saatleri seçmek', 'a' => 'Hesabım › Bildirimler: konulara göre aç / kapat, sessiz saatler, nöbet hatırlatması.', 'l' => '#/profil/bildirim', 't' => ['bildirim']],
        ['k' => $U, 'q' => 'E-posta gelmiyor', 'a' => 'Önce gereksiz (spam) klasörüne bakın. Hesabım › Bildirimler’de e-posta tercihinizi kontrol edin.', 'l' => '#/profil/bildirim', 't' => ['bildirim']],
        ['k' => $U, 'q' => 'Sayfa açılmıyor ya da eski görünüyor', 'a' => 'Sayfayı yenileyin; telefonda uygulamayı tamamen kapatıp açın. “Yeni sürüm hazır” notu varsa “Şimdi yükle”ye basın; yazdıklarınız silinmez.', 'l' => null, 't' => ['hata']],
        ['k' => $U, 'q' => 'Koyu tema, yazı boyutu, ana sayfa düzeni', 'a' => 'Hesabım › Görünüm.', 'l' => '#/profil/gorunum', 't' => ['diger']],
        ['k' => $U, 'q' => 'Bir sayfanın bağlantısını paylaşmak', 'a' => 'Sayfa başlığının yanındaki “Paylaş”: bağlantıyı kopyalayın, WhatsApp’ta ya da sohbette paylaşın.', 'l' => null, 't' => ['diger']],

        // ---- Nöbet ve takvim ----
        ['k' => $N, 'q' => 'Takvimim boş / nöbetlerim görünmüyor', 'a' => 'Nöbet listesindeki adınız portaldaki adınızla aynı olmalı (büyük-küçük harf önemsiz). Hesabım › Profil’den adınızı kontrol edin; Excel liste sayfasında “Sadece ben” ile de bakabilirsiniz. Liste henüz yüklenmediyse sorumlunuza yazın.', 'l' => '#/nobetim', 't' => ['nobet'], 'c' => ['mod' => 'nobet']],
        ['k' => $N, 'q' => 'Nöbetleri telefonun takvimine eklemek', 'a' => 'Nöbet › Takvimim › “Telefon takvimine ekle” › iPhone, Google Takvim ya da Outlook: takvime abone olursunuz; liste güncellendikçe telefonunuzdaki takvim de kendiliğinden güncellenir.', 'l' => '#/nobetim', 't' => ['nobet'], 'c' => ['mod' => 'nobet']],
        ['k' => $N, 'q' => 'Bugün kim nöbette?', 'a' => 'Nöbet › Kim nöbette: günü seçin; kişiye dokunup arayabilir ya da yazabilirsiniz.', 'l' => '#/rehber', 't' => ['nobet'], 'c' => ['mod' => 'nobet']],
        ['k' => $N, 'q' => 'Excel listenin aslını görmek', 'a' => 'Nöbet › Excel liste. “Sadece ben” kendi satırınızı işaretler.', 'l' => '#/nobet', 't' => ['nobet'], 'c' => ['mod' => 'nobet']],
        ['k' => $N, 'q' => 'Blok / taraf yerleşimimi görmek', 'a' => 'Nöbet › Taraf listesi: o gün hangi blokta olduğunuz.', 'l' => '#/taraf', 't' => ['nobet'], 'c' => ['mod' => 'taraf']],
        ['k' => $N, 'q' => 'Fazla mesai ücretimi hesaplamak', 'a' => 'Hesabım › Ücretim: saatlik ücretinizi girin; tahmini tutarı yalnız siz görürsünüz.', 'l' => '#/profil/ucret', 't' => ['nobet', 'diger'], 'c' => ['mod' => 'ucret']],

        // ---- Değişim, devir, ilan ----
        ['k' => $D, 'q' => 'Nöbetimi devretmek ya da değiştirmek', 'a' => 'Nöbet › Takvimim’de günü seçin › “Devret” ya da “Değiştir”. Karşı taraf kabul edince sorumluya iletilir. 24 saatlik nöbetin yalnız gündüzünü ya da gecesini de verebilirsiniz.', 'l' => '#/nobetim', 't' => ['birim'], 'c' => ['mod' => 'ilan']],
        ['k' => $D, 'q' => 'Nöbetimi ilana koymak', 'a' => 'Nöbet › İlanlar › “İlan aç”: başvuranlar arasından seçersiniz.', 'l' => '#/ilanlar', 't' => ['birim'], 'c' => ['mod' => 'ilan']],
        ['k' => $D, 'q' => 'Başkasının nöbetini almak / ekstra nöbet', 'a' => 'Nöbet › Ekstra nöbet: kurallara uyan, alabileceğiniz nöbetler gün gün listelenir; “Gönüllü ol” ile eksik çağrılarına adınız düşer.', 'l' => '#/ekstra', 't' => ['birim'], 'c' => ['mod' => 'ilan']],
        ['k' => $D, 'q' => 'Değişim kabul edildi ama listede eski hâli duruyor', 'a' => 'Sorumlu Excel’e işleyene kadar Takvimim’de “değişim” olarak görünür; listeniz yeniden yüklenince kendiliğinden düzelir.', 'l' => '#/nobetim', 't' => ['birim', 'nobet'], 'c' => ['mod' => 'ilan']],
        ['k' => $D, 'q' => 'Eksik personel çağrısına yanıt vermek', 'a' => 'Bildirimdeki çağrıyı açıp “Gelebilirim / Gelemem” deyin; sorumlu gönüllüler arasından seçer.', 'l' => null, 't' => ['birim'], 'c' => ['mod' => 'eksik']],

        // ---- İstekler ----
        ['k' => $I, 'q' => 'Nöbet isteği (boşluk / izin) yazmak', 'a' => 'Nöbet › İstekler: açık dönem varsa günleri seçip kaydedin. Son gün dönemin üstünde yazar; sonrasında değişiklik için sorumlunuza yazın.', 'l' => '#/istekler', 't' => ['birim'], 'c' => ['mod' => 'istekler']],

        // ---- Mesajlar, duyurular, belgeler ----
        ['k' => $M, 'q' => 'Birim grubuna ya da birine mesaj yazmak', 'a' => 'Mesajlar: birim grubu kendiliğinden vardır; kişiye dokunup birebir yazabilirsiniz. Hasta bilgisi yazmayın.', 'l' => '#/mesaj', 't' => ['diger'], 'c' => ['mod' => 'mesaj']],
        ['k' => $M, 'q' => 'Bir sohbeti sessize almak ya da birini engellemek', 'a' => 'Mesajlar › sohbeti açın › üstteki ad › sessize al / engelle.', 'l' => '#/mesaj', 't' => ['diger', 'bildirim'], 'c' => ['mod' => 'mesaj']],
        ['k' => $M, 'q' => 'Duyuru ya da paylaşım yapmak', 'a' => '“Yeni içerik”: yazdığınız içerik sorumlu onaylayınca ekibe yayınlanır.', 'l' => null, 't' => ['diger'], 'c' => ['role' => 'member']],
        ['k' => $M, 'q' => '“Okumanız gerekiyor” yazan duyuru', 'a' => 'Duyuruyu açıp sonundaki “Okudum, anladım”a basın; okumanız gerekenler listesinden düşer.', 'l' => '#/okunacak', 't' => ['diger']],
        ['k' => $M, 'q' => 'Dahili numaraları bulmak', 'a' => 'Telefon rehberi. Kendi numaranızı Hesabım › Profil’den ekleyebilirsiniz.', 'l' => '#/telefon', 't' => ['diger'], 'c' => ['mod' => 'rehber']],
        ['k' => $M, 'q' => 'Yemek listesi', 'a' => 'Yemek listesi: gün gün menü ve sıradaki öğün.', 'l' => '#/yemek', 't' => ['diger'], 'c' => ['mod' => 'yemek']],
        ['k' => $M, 'q' => 'Hastane geneli protokol ve formlar', 'a' => 'Hastane belgeleri.', 'l' => '#/hastane', 't' => ['diger'], 'c' => ['mod' => 'hbelge']],

        // ---- Sorumlu işleri (modülü yöneten) ----
        ['k' => $R, 'q' => 'Yeni ayın nöbet listesini yüklemek', 'a' => 'Sol menüde listenin adı › “Yeni sürüm yükle” (Excel). Eski sürümler saklanır, istediğinizde geri dönebilirsiniz.', 'l' => '#/nobet', 't' => ['liste'], 'c' => ['manage' => 'nobet']],
        ['k' => $R, 'q' => 'Liste yüklendi ama bazı kişiler nöbetini göremiyor', 'a' => 'Listedeki ad, kişinin portaldaki adıyla aynı olmalı. Kişiye Hesabım › Profil’den adını düzelttirin' . ' ya da yönetici Kullanıcılar’dan düzeltsin.', 'l' => '#/nobet', 't' => ['liste'], 'c' => ['manage' => 'nobet']],
        ['k' => $R, 'q' => 'Nöbet isteği dönemi açmak', 'a' => 'Nöbet › İstekler › “Dönem aç”. Kişiler ay ay farklı listede çalışıyorsa “Basamak / liste ayrımı yapma”yı açın.', 'l' => '#/istekler', 't' => ['yonetim'], 'c' => ['manage' => 'istekler']],
        ['k' => $R, 'q' => 'Gelen istekleri görmek ve karara bağlamak', 'a' => 'Nöbet › İstekler › Yönetim: gün gün kaç kişinin istediği ve kişi tablosu.', 'l' => '#/istekler/yonetim', 't' => ['yonetim'], 'c' => ['manage' => 'istekler']],
        ['k' => $R, 'q' => 'Eksik personel çağrısı yapmak', 'a' => 'Yönetim › Eksik personel: vardiyayı seçin, kurallara uyan kişilere sorulur; gönüllüler arasından seçersiniz.', 'l' => '#/eksik', 't' => ['yonetim'], 'c' => ['manage' => 'eksik']],
        ['k' => $R, 'q' => 'Değişim ve devirleri izlemek', 'a' => 'Yönetim › Değişim geçmişi: kabul edilenler, Excel’e işlenmeyi bekleyenler.', 'l' => '#/gecmis', 't' => ['yonetim', 'liste'], 'c' => ['manage' => 'gecmis']],
        ['k' => $R, 'q' => 'Günlük blok / taraf yerleşimi yapmak', 'a' => 'Nöbet › Taraf listesi: otomatik yerleştir, elle düzelt, WhatsApp görseli ya da sohbette paylaş.', 'l' => '#/taraf', 't' => ['yonetim'], 'c' => ['manage' => 'taraf']],
        ['k' => $R, 'q' => 'Çizelgeyi portalda hazırlamak', 'a' => 'Nöbet › Çizelge: kural denetimi ve otomatik doldurma; yayınlayınca listenin yeni sürümü olur.', 'l' => '#/cizelge', 't' => ['yonetim', 'liste'], 'c' => ['manage' => 'cizelge']],
        ['k' => $R, 'q' => 'Üyenin gönderdiği duyuruyu onaylamak', 'a' => 'Yönetim › Onay bekleyenler.', 'l' => '#/yonetim/onaylar', 't' => ['yonetim'], 'c' => ['role' => 'lead']],
        ['k' => $R, 'q' => 'Telefon rehberine numara eklemek', 'a' => 'Telefon rehberi › ekle; Excel’den toplu da alabilirsiniz.', 'l' => '#/telefon', 't' => ['yonetim'], 'c' => ['manage' => 'rehber']],
        ['k' => $R, 'q' => 'Yemek listesini yüklemek', 'a' => 'Yemek listesi › yükle: aylık PDF ya da Excel; önizlemede düzeltip kaydedin.', 'l' => '#/yemek', 't' => ['yonetim'], 'c' => ['manage' => 'yemek']],
        ['k' => $R, 'q' => 'Üyelerin destek taleplerini yanıtlamak', 'a' => 'Destek › Birim talepleri: yanıtlayın; çözemezseniz “Destek ekibine ilet”.', 'l' => '#/destek/birim', 't' => ['yonetim'], 'c' => ['role' => 'lead']],

        // ---- Birim yönetimi (yönetici) ----
        ['k' => $Y, 'q' => 'Ekibi davet etmek', 'a' => 'Yönetim › Kullanıcılar › “Ekibi davet et”: QR kod ya da kişiye özel bağlantı.', 'l' => '#/yonetim/kullanicilar', 't' => ['kullanici'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Kayıt bekleyenleri onaylamak', 'a' => 'Yönetim › Kullanıcılar: onay bekleyenler listenin başındadır.', 'l' => '#/yonetim/kullanicilar', 't' => ['kullanici'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Birine geçici şifre vermek', 'a' => 'Yönetim › Kullanıcılar › kişi › “Geçici şifre oluştur”. Kişi ilk girişte kendi şifresini belirler.', 'l' => '#/yonetim/kullanicilar', 't' => ['kullanici', 'giris'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Birini yayıncı (sorumlu) yapmak ya da modül yetkisi vermek', 'a' => 'Yönetim › Kullanıcılar › kişiyi düzenle › yetki. Yalnız bazı modülleri yönetsin istiyorsanız Ayarlar › Güvenlik › Roller’den birime özel rol tanımlayın.', 'l' => '#/yonetim/kullanicilar', 't' => ['kullanici'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Bir kişinin siteyi nasıl gördüğüne bakmak', 'a' => 'Sol alttaki adınız › “Başka rolün gözünden gör”: kendi hesabınızla, salt okunur.', 'l' => null, 't' => ['kullanici'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Üstteki duyuru bandı', 'a' => 'Ayarlar › Genel › Duyuru bandı: renk, tarih aralığı, kimler görsün, düğme.', 'l' => '#/yonetim/ayarlar/genel', 't' => ['kurulum'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Kurum adı, logo, uygulama simgesi', 'a' => 'Ayarlar › Genel.', 'l' => '#/yonetim/ayarlar/genel', 't' => ['kurulum'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'E-posta bildirimlerini açmak', 'a' => 'Ayarlar › Bildirimler › E-posta bildirimleri: e-posta hesabının bilgilerini girip “Deneme e-postası” gönderin.', 'l' => '#/yonetim/ayarlar/bildirim', 't' => ['kurulum', 'bildirim'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Hangi durumlarda e-posta / bildirim gideceği', 'a' => 'Ayarlar › Bildirimler.', 'l' => '#/yonetim/ayarlar/bildirim', 't' => ['kurulum', 'bildirim'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Nöbet kuralları ve otomatik duyuru', 'a' => 'Ayarlar › Nöbet: değişim kuralları, liste güncellenince otomatik duyuru.', 'l' => '#/yonetim/ayarlar/nobet', 't' => ['kurulum', 'liste'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Üye kaydını açmak / kapatmak', 'a' => 'Ayarlar › Güvenlik › Üye kaydı: açık, onaylı ya da yalnız davetle.', 'l' => '#/yonetim/ayarlar/guvenlik', 't' => ['kurulum', 'kullanici'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Birimin yedeğini almak', 'a' => 'Ayarlar › Yedek.', 'l' => '#/yonetim/ayarlar/yedek', 't' => ['kurulum'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Kim okudu, kim ne yaptı?', 'a' => 'Yönetim › Okuma raporu ve İşlem günlüğü.', 'l' => '#/yonetim/raporlar', 't' => ['kurulum'], 'c' => ['role' => 'admin']],
        ['k' => $Y, 'q' => 'Paket, ödeme ve fatura', 'a' => 'Yönetim › Abonelik: paket, bitiş tarihi, ödeme ve fatura bilgileri.', 'l' => '#/abonelik', 't' => ['abonelik'], 'c' => ['role' => 'admin', 'billing' => true]],
        ['k' => $Y, 'q' => 'Bir modül (ör. Mesajlar, Yemek) görünmüyor', 'a' => 'Modülleri hastane ve birim düzeyinde sistem yöneticisi açar. Destek talebiyle hangi modülü istediğinizi yazın.', 'l' => null, 't' => ['kurulum'], 'c' => ['role' => 'admin', 'env' => 'multi']],

        // ---- Sunucu (yalnız tek birimli kurulumda birim yöneticisi) ----
        ['k' => $V, 'q' => 'Hatırlatmalar ve e-postalar zamanında gitmiyor', 'a' => 'Zamanlanmış görev (cron) kurulmalı: Hostinger › Gelişmiş › Cron Jobs, 5 dakikada bir (kurulum rehberi §13). Durumunu Ayarlar › Genel › Sistem sağlığı’nda görürsünüz.', 'l' => '#/yonetim/ayarlar/genel', 't' => ['kurulum', 'bildirim'], 'c' => ['role' => 'admin', 'env' => 'single']],
        ['k' => $V, 'q' => 'Yeni sürüme güncellemek', 'a' => 'Ayarlar › Genel › Güncelleme: yeni zip’i seçip uygulayın; kimsenin işi yarıda kalmaz.', 'l' => '#/yonetim/ayarlar/genel', 't' => ['kurulum'], 'c' => ['role' => 'admin', 'env' => 'single']],
        ['k' => $V, 'q' => 'Sunucu, e-posta (SPF / DKIM) ve yedek denetimi', 'a' => 'Ayarlar › Genel › Sistem sağlığı: her madde için ne yapılacağı yazar.', 'l' => '#/yonetim/ayarlar/genel', 't' => ['kurulum'], 'c' => ['role' => 'admin', 'env' => 'single']],
    ];
}

/** Kişi bu maddeyi görebilir mi (kendi yetkisi ve altındakiler) */
function sp_kb_ok(array $me, array $c): bool
{
    $role = (string)$me['role'];
    if (isset($c['role'])) {
        if ($c['role'] === 'admin' && $role !== 'admin') return false;
        if ($c['role'] === 'lead' && !in_array($role, ['admin', 'editor'], true)) return false;
        if ($c['role'] === 'member' && $role !== 'member') return false;
    }
    if (isset($c['env']) && ($c['env'] === 'single') === nm_multi()) return false;
    if (isset($c['mod']) && (!nm_mod_on($c['mod']) || user_perm($me, $c['mod']) === 'off')) return false;
    if (isset($c['manage']) && user_perm($me, $c['manage']) !== 'manage') return false;
    if (!empty($c['billing']) && !(function_exists('bl_state_cur') && !empty(bl_state_cur()['visible']))) return false;
    return true;
}

/** Kişinin görebildiği maddeler */
function sp_kb_for(array $me): array
{
    $o = [];
    foreach (sp_kb() as $i => $x) if (sp_kb_ok($me, $x['c'] ?? [])) $o[] = ['id' => $i, 'cat' => $x['k'], 'q' => $x['q'], 'a' => $x['a'], 'link' => $x['l'], 'topics' => $x['t']];
    return $o;
}
