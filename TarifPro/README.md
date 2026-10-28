# 🍽️ Tarif Pro – Android Gurme Tarif Uygulaması

Kotlin + Jetpack Compose (Material 3) ile yazılmış, çevrimdışı öncelikli, Firebase ile senkronize olan profesyonel tarif defteri.

**APK indir:** Depo › *Releases* › en son `Tarif Pro v1.0.x` › `TarifPro-v1.0.x.apk`
(Her push'ta GitHub Actions APK'yı derler, emülatörde test eder ve ekran görüntülerini `ekran-goruntuleri.zip` olarak sürüme ekler.)

## Özellikler

| Alan | İçerik |
|---|---|
| **Giriş & senkronizasyon** | Jetpack Credential Manager ile Google girişi, Firebase Auth, Firestore gerçek zamanlı senkronizasyon, Room ile tam çevrimdışı çalışma, WorkManager ile 15 dk'da bir arka plan senkronu. Misafir modunda yazılan tarifler Google hesabına otomatik taşınır. |
| **Tarif oluşturma** | Kameradan fotoğraf çekme, galeriden seçme, 12 hazır gurme illüstrasyonu; adım başına fotoğraf; malzeme grupları (Kek / Sos / Krema…); toplu malzeme yapıştırma; adım metninden süre algılama; püf noktaları; etiketler. |
| **Şablonlar** | Klasik Osmanlı, Modern Şef Masası, Ege & Akdeniz, Fit & Gurme, Pastane & Tatlı Rüyası – uygulama içi kart, PNG ve A4 çıktısı aynı şablonla tasarlanır. |
| **Görünürlük** | Herkese Açık / Sadece Takipçiler / Gizli (Firestore kurallarıyla sunucu tarafında da korunur). |
| **4 detay sayfası** | 1) Kart & Besin (kcal, protein, karbonhidrat, yağ, lif, şeker, makro halkası, sağlık etiketleri, malzeme bazlı analiz) 2) Malzemeler (1–24 kişi dinamik porsiyon, kesirli ölçüler ½ ⅓ ¾, gram tahmini, işaretleme, eksikleri alışveriş listesine ekleme) 3) Adım adım yapılış (tamamlandı işaretleme, ilerleme çubuğu, hazırlık/pişirme kronometresi, her adım için akıllı geri sayım; arka planda ön plan servisiyle çalışır, süre dolunca alarm + titreşim) 4) Yorum & puanlama (1–5 yıldız, gerçek zamanlı yorumlar, şikayet). |
| **Arama motoru** | Bellek içi ters indeks, Türkçe karakter katlama, önek ve yazım hatası toleranslı arama, alan ağırlıklandırma; "Dolapta ne var?" malzeme filtresi (hepsi / en az biri), zorluk, maksimum kalori, süre, kategori, beslenme etiketleri, sıralama. |
| **Dışa aktarma** | Görseldeki referans tarzında uzun PNG tarif kartı (galeriye kaydet / WhatsApp vb. ile gönder), A4 yazdırma ve PDF olarak kaydetme, metin olarak paylaşma, sohbete tarif kartı gönderme. |
| **İçe aktarma** | Tarif sitelerinden bağlantıyla (schema.org Recipe JSON-LD), tarayıcıdan "Paylaş → Tarif Pro" ile veya serbest metinden. |
| **Sosyal** | Şef profilleri, takip etme, akış, özel mesajlaşma, topluluk kanalları, favoriler, yemek defterleri (koleksiyonlar), alışveriş listesi. |
| **Bildirimler** | Yorum, puan, takipçi, mesaj, kanal, yeni tarif ve duyurular için ayrı açma/kapama, sessiz saatler, alarm sesi/titreşim ayarı. |
| **Yönetici paneli** | İstatistikler, şikayet kuyruğu, tarif gizleme/öne çıkarma/silme, yorum moderasyonu, kullanıcı engelleme ve yönetici atama, topluluk duyurusu. |
| **Tasarım** | Material 3, karanlık mod (Sistem/Açık/Koyu), Android 12+ dinamik renkler. |

## Google ile giriş ve bulut senkronizasyonu (bir kez, ~5 dk)

Uygulama Firebase olmadan da **misafir modunda tüm özellikleriyle** çalışır. Hesap ve cihazlar arası senkronizasyon için:

1. [Firebase Console](https://console.firebase.google.com)'da ücretsiz bir proje oluşturun.
2. **Android uygulaması ekle** › paket adı `com.tarifpro.app`, SHA-1:
   `16:E4:47:6E:D7:3B:AC:4E:E7:EC:24:9C:AF:08:21:D0:73:DD:7B:68`
3. **Authentication › Sign-in method › Google**'ı etkinleştirin.
4. **Firestore Database** oluşturun, *Rules* sekmesine [`firestore.rules`](firestore.rules) içeriğini yapıştırıp yayınlayın.
5. `google-services.json` dosyasını indirin.
6. Uygulamada **Ayarlar › Bulut & Google girişi** ekranında JSON içeriğini yapıştırıp *JSON'dan doldur › Kaydet* deyin; uygulama yeniden başlar.
   - Alternatif: bilgileri depo *Settings › Secrets › Actions* altına `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, `GOOGLE_WEB_CLIENT_ID`, (isteğe bağlı) `ADMIN_EMAILS` olarak ekleyin; CI bunları APK'ya gömer.
7. İlk Google ile giriş yapan hesap otomatik olarak **yönetici** olur.

> Fotoğraflar ücretsiz (Spark) planla uyumlu olması için sıkıştırılarak Firestore'da saklanır; Firebase Storage gerekmez.

## İmzalama anahtarı

`keystore/tarifpro-dev.jks` geliştirme anahtarıdır (şifre: `tarifpro`). Sabit olması sayesinde güncellemeler üst üste kurulabilir ve Google girişi için SHA-1 değişmez. Play Store'a yüklemeden önce kendi gizli anahtarınızla değiştirin.

## Derleme

```bash
cd TarifPro
gradle testDebugUnitTest assembleRelease
```

JDK 17, Android SDK 35 ve Gradle 8.10+ gerekir. Çıktı: `app/build/outputs/apk/release/app-release.apk`.

## Mimari

```
app/src/main/java/com/tarifpro/app/
├── domain/        Saf Kotlin: modeller, porsiyon ölçekleme, besin veritabanı (~150 malzeme),
│                  malzeme ayrıştırıcı, süre algılama, arama motoru (birim testli)
├── data/local     Room veritabanı (tek doğruluk kaynağı)
├── data/cloud     Firebase Auth + Firestore köprüsü
├── data/repo      Auth, Tarif, Sosyal depoları ve SyncManager (+ WorkManager)
├── export/        PNG kart çizici, A4/PDF yazdırma, paylaşım, içe aktarma, illüstrasyonlar, şablonlar
├── timer/         Akıllı zamanlayıcılar + ön plan servisi
├── notify/        Kanal bazlı, tercihlere uyan bildirimler
└── ui/            Compose ekranları
```
