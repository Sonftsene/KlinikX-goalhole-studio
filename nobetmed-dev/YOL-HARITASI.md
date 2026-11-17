# dupcii — sıradaki geliştirmeler (ön rapor)

Durum: kullanıcı onayı bekleniyor ("tamam" denince hepsi tek seferde yapılacak).
Kişi adları / gerçek veriler bu dosyaya yazılmaz.

## 0. Ortak kural motoru (her özellik bunu kullanır)
- **Dinlenme:** nöbetten çıkan, yeni nöbete başlamadan önce en az **16 saat** dinlenir (ayarlanabilir).
  - Örnek: 24 saat (08→08) çıkışı aynı gün 16-08'e yazılamaz (8 saat); 08-16 → ertesi gün 08 olur (16 saat).
- **Üst üste çalışma:** en fazla 24 saat (48 saat yasak) — mevcut kural, korunur.
- **Uzun boşluk:** iki nöbet arasında en fazla 4 boş gün (5 gün boşluk olamaz); izinli günler boşluk sayılmaz — mevcut.
- **İzin/istek:** yıllık izinli veya onaylanmış "boşluk" isteği olan güne atama yapılmaz (çağrıda yönetici isterse esnetir).
- **Muafiyet:** yönetici/yayıncı kişileri kuradan/kaydırmadan muaf tutabilir (isteğe bağlı bitiş tarihi, gerekçe yalnız yöneticilere).
- **Adalet sırası (eşitlik bozucu):** ① daha az geçiş/çağrı ② ay içinde daha az nöbet saati (az fazla mesai) ③ son 7 günde daha az nöbet ④ daha uzun boşluk ⑤ hâlâ eşitse kayıtlı **rastgele kura** (adaylar ve sonuç kaydedilir).
- Kurallar Ayarlar › Nöbet'ten değiştirilebilir; tüm yeni atamalarda (değişim, ilan, çağrı, yerleşim) aynı motor kullanılır.

## 1. Nöbet istekleri paneli
- İstek türleri yalnızca **Boşluk** (o gün nöbet istemiyorum) ve **Yıllık izin**. Kişi başı sınır yok.
- **Dönem:** yönetici/yayıncı ayı isteğe açar ve son tarih koyar (ör. "Aralık istekleri 20 Kasım'da kapanır"). 2 gün önce hatırlatma; son tarihten sonra üyeler ekleyemez/değiştiremez (yöneticiler düzeltebilir).
- **Giriş:** yazarak ("2,3,4 boşluk; 6,7 boşluk; 15-19 yıllık izin") veya takvimde dokunarak; kısa not eklenebilir.
- **Kişisel görünüm:** kendi istekleri ve durumu (beklemede / onaylandı / reddedildi + gerekçe yalnız kendisine).
- **Toplu pano (herkes):** kişi listesi (kim hangi günleri istedi) + takvim (hangi gün kim boşluk/izin istedi). Durum işareti görünür, ret gerekçesi görünmez.
- **Yönetici/yayıncı paneli:**
  - Taraf (3./2. basamak) başına gün başına **gerekli nöbetçi sayısı** (gündüz 08-16, gece 16-08, 24 saat; hafta içi / hafta sonu-bayram ayrı).
  - **Isı haritası takvim:** gün gün istek sayısı, müsait kişi sayısı, gereken sayı → yeşil/sarı/kırmızı; yığılan günler en üstte.
  - Kişi bazlı tablo: istenen gün sayısı, geçmiş aylarda onay/ret sayısı.
  - Onay/ret (tekli/toplu, gerekçeli). Taşan günlerde **ret önerisi** adalet sırasına göre (o ay en çok gün isteyen / geçmişte en çok onay alan önce); eşitlikte kura.
  - **Excel'e aktar:** kişi × gün matrisi (B = boşluk, Yİ = yıllık izin) — sorumlu listeyi hazırlarken kullanır.
- **Listeye uyum kontrolü:** yeni ayın listesi gelince onaylı isteğe rağmen nöbet yazılmışsa sorumluya rapor, kişiye bildirim.

## 2. Nöbet ilanı
- Kişi kendi gelecekteki nöbetini ilana koyar: **devret** veya **değiş** (değişte karşılığında alabileceği günler kurallara göre önerilir). Not eklenebilir.
- Pano: tarih, vardiya, ilan sahibinin adı, not. Yalnız aynı listedeki kişiler görür.
- "Başvur" yalnız kurallara uyanlara; uymayanlarda gri ve nedeni.
- **İlan sahibi başvuranlar arasından seçer.** Başvuranları ve alanı yalnız ilan sahibi + yayıncı + yönetici görür; diğerleri "ilan kapandı" görür.
- Seçimden sonra mevcut akış: sorumluya "Excel'e işlenecek", Excel güncellenince kendiliğinden "uygulandı". Nöbet tarihi geçince açık ilan kapanır; sahibi iptal edebilir.

## 3. Eksik personel çağrısı
- Yönetici/yayıncı açar: tarih + vardiya (08-16 / 16-08 / 24 saat) + kaç kişi + taraf.
- **Aday filtreleri (şart çipleri, açılıp kapatılabilir):** o gün nöbeti yok; izinli değil; onaylı boşluk isteği yok; dinlenme ≥16 saat (önce ve sonra); 48 saat yok; 5 gün boşluk kuralı; muaf değil.
- **Kaydırma adayları** (boşta uygun kimse yoksa): ertesi (veya bir önceki) gün aynı tür nöbeti olan ve nöbeti bu güne kaydırılınca tüm kurallara uyan kişiler; kaydırma o günü eksik bırakacaksa uyarı ("19 Kas'ta 1 eksik kalır").
- **Sıralama:** en çok müsaitlik/boşluk → az fazla mesai → son 7 günde az nöbet → kura.
- **Görsel:** aday tablosu (son nöbetten bu yana saat, sonraki nöbet, bu ay saat/fazla mesai, son 7 gün, şartlar ✓/✗) + **Excel indir** (adaylar sayfası + ay çizelgesi kopyası, o gün ve adaylar renkli).
- Seçilenlere bildirim: "18 Kas 16-08 için 1 kişi eksik, gelebilir misin?" → Gelebilirim / Gelemem. Yönetici gönüllüler arasından seçer → sorumluya "Excel'e işlenecek". Kimin kabul ettiğini yalnız yönetici/yayıncı ve kişi görür.

## 4. Günlük blok yerleşimi (mevcut Taraf/kura'nın genişletilmiş hâli)
- Yönetici/yayıncı bir gün için blok başına gereken kişi sayısını seçer: **B blok** (3. basamak), **A blok**, **C blok** (2. basamak); gündüz (08-16) ve gece (16-08) ayrı. 24 saatçi iki dönemde aynı blokta kalır. Varsayılanlar kaydedilir (hafta içi / hafta sonu).
- O gün Excel'de nöbetçi olanlar ekrana gelir; **otomatik dağıtım:**
  1. Herkes kendi tarafına (3. basamak → B; 2. basamak → A/C).
  2. Bir tarafta fazla, diğerinde eksik varsa fazla kişiler karşı tarafa **kurayla** geçer: önce hiç/en az geçmiş olanlar; eşitse onlar arasında kura; herkes eşitse herkes kuraya girer. Muaflar girmez.
  3. A/C arasında: en az çalıştığı bloğa / son nöbetinde olmadığı bloğa (rotasyon); eşitse kura.
  4. Toplam yetmiyorsa "eksik" uyarısı → tek dokunuşla Eksik personel çağrısı.
- **Elle düzenleme:** kişiye dokunup bloğunu değiştirme; her kişinin yanında A/B/C kaç kez çalıştığı ve son bloğu.
- Kura düğmesi yalnız eşitlikte; adaylar ve sonuç kaydedilir.
- **Kayıtlar:** her yerleşim (tarih, dönem, kişi, blok, yöntem otomatik/kura/elle) saklanır; kişi bazlı blok sayıları, son blok, geçiş sayısı (gece içeren karşı taraf = 1; 08-16 sayılmaz). Sayım başlangıç tarihi ayarlanabilir.
- Herkes "bugün kim hangi blokta"yı ve geçmişi görür; düzenleme yalnız yönetici/yayıncı.

## 5. Bayram ve resmî tatil
- Türkiye resmî tatilleri ve dini bayramlar (arife yarım gün) hazır gelir; yönetici ekleyip çıkarabilir.
- Takvimde, Excel görünümünde ve sayımlarda işaretli; kişi ve adalet sayımlarında "bayram/tatil nöbeti" ayrı sayılır; ücret hesabında kullanılır.

## 6. Fazla mesai ücreti (kişiye özel, yalnız kişi görür)
- Herkes kendi saat ücretlerini girer; birden fazla satır: Normal, Hafta sonu, Bayram/resmî tatil (isteğe bağlı Gece).
- Ücretler yalnız kişinin kendisine görünür (yönetici dahil kimse göremez).
- Hesap (tahmini): ay fazla mesai saati = toplam − gereken. Fazla saatler önce bayram/tatil saatlerinden, sonra hafta sonu, kalanı normal ücretle sayılır (kişinin lehine); dağılım ekranda açıkça gösterilir. Bordro farklıysa yöntem değiştirilebilir.
- Takvimim'de ay özeti: saat, fazla mesai, tahmini tutar.

## 7. Değişim ve ilan geçmişi (yalnız yönetici/yayıncı)
- Ay/kişi filtresiyle tüm değişim, devir, ilan ve çağrı kayıtları; Excel'e aktarım.

## 8. Hatırlatma saati (kişi seçer)
- Kapalı / bir gün önce (saat seçilir) / nöbet günü sabah / nöbetten X saat önce; birden fazla seçilebilir. Ek bildirim tercihleri: ilan, çağrı, istek dönemi.

## 9. Ana ekranda geri sayım
- "Sıradaki nöbetine 2 gün 5 saat" (canlı); nöbetteyken "bitmesine 6 saat"; o günkü blok varsa "B blok".

## Yapım sırası
0 kural motoru → 4 blok yerleşimi → 3 eksik çağrısı → 1 istek paneli → 2 ilan + 7 geçmiş → 5 bayram + 6 ücret → 8 hatırlatma + 9 geri sayım → testler ve paket.

## Açık sorular (yanıt yoksa öneriyle)
- 16 saat dinlenme değişim ve ilanlarda da geçerli mi? (Öneri: evet — art arda iki gece nöbetini de engeller.)
- Blok yerleşimi gündüz/gece ayrı mı? (Öneri: evet.)
- Ücret hesap yöntemi uygun mu? (Öneri: yukarıdaki.)
