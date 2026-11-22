# NFC Kapı

13.56 MHz NFC anahtarlıkları **okuyan, isimle kaydeden** ve kapıya bağlı bir
**ESP32 röle** aracılığıyla kapıyı açan Android uygulaması.

## Neden ESP32 gerekiyor?

Bir telefon, okuduğu NFC anahtarlığı mevcut kapı okuyucusuna **"ben o anahtarlığım"**
diye geri gönderemez (Android/iOS buna izin vermez). Bu yüzden uygulama:

1. Anahtarlığı okur + UID'sini kaydeder (yetkili listesi),
2. Kapı açma komutunu, kapının yanına konan ESP32 röleye WiFi ile gönderir.

```
📱 NFC Kapı uygulaması  --WiFi/HTTP-->  🔌 ESP32  --röle-->  🚪 kapı kilidi
```

## Uygulama kullanımı

1. Telefonun **NFC'sini aç**.
2. Uygulamayı aç, anahtarlığı telefonun **arka üst** kısmına yaklaştır.
   - UID okunursa çip 13.56 MHz'dir ✅
   - **Hiç okunmuyorsa** anahtarlık büyük olasılıkla **125 kHz**'tir ve hiçbir
     telefon onu okuyamaz (donanım desteklemez).
3. İsim verip **KAYDET**.
4. **4) ESP32 röle ayarı** bölümüne ESP32'nin IP adresini (ör. `http://192.168.1.50`)
   ve token'ı gir, kaydet.
5. **KAPIYI AÇ** ile elle, ya da "otomatik aç" kutusunu işaretleyip kayıtlı
   anahtarlık okununca otomatik aç.

## ESP32 kurulumu

`../esp32/nfc_door_relay.ino` dosyasını Arduino IDE ile aç:

1. `WIFI_SSID`, `WIFI_PASSWORD`, `TOKEN` değerlerini doldur (token uygulamadaki ile aynı).
2. Röleyi `RELAY_PIN` (varsayılan GPIO 26), 5V ve GND'ye bağla.
3. Rölenin **NO/COM** uçlarını kapı açma butonuna / kilit tetiğine paralel bağla.
4. Yükle, Serial Monitor'de çıkan **IP adresini** uygulamaya gir.

> Röle LOW ile çekiyorsa `RELAY_ACTIVE_HIGH = false` yap.

## Güvenlik

- Token'ı mutlaka değiştir.
- ESP32'yi yalnızca güvendiğin yerel WiFi ağına bağla.
- Dışarıdan erişim istiyorsan güvenli bir tünel/VPN kullan; portu doğrudan internete açma.

## APK alma

GitHub Actions → **Build NFC Kapi APK** workflow'u çalışınca `NFC-Kapi-v1.0-APK`
adlı artifact'ı indir, telefona kur (bilinmeyen kaynaklara izin ver).
