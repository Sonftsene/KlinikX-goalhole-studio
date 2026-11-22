/*
 * NFC Kapı — ESP32 Röle Kontrolcüsü
 * ----------------------------------
 * Kapının elektrikli kilit / buton ucuna paralel bir röle bağlanır.
 * Android "NFC Kapı" uygulaması WiFi üzerinden  GET /open?token=XXX  ister,
 * token doğruysa röle kısa süre çekilir ve kapı açılır.
 *
 * Donanım:
 *   - ESP32 geliştirme kartı
 *   - 1 kanal röle modülü (IN -> RELAY_PIN, VCC -> 5V, GND -> GND)
 *   - Rölenin NO/COM uçları, kapı açma butonuna/kilit tetiğine paralel bağlanır.
 *
 * Arduino IDE: Kart = "ESP32 Dev Module". Gerekli kütüphaneler ESP32 çekirdeğiyle gelir.
 *
 * GÜVENLİK: TOKEN'ı değiştir ve uygulamadaki ile aynı yap. Cihazı
 * sadece güvendiğin yerel WiFi ağına bağla.
 */

#include <WiFi.h>
#include <WebServer.h>

// ---- AYARLAR ----
const char* WIFI_SSID     = "WIFI_ADINIZ";
const char* WIFI_PASSWORD = "WIFI_SIFRENIZ";
const char* TOKEN         = "gizli-token-degistir";   // uygulamadaki token ile AYNI olmalı

const int RELAY_PIN       = 26;     // röle giriş pini
const bool RELAY_ACTIVE_HIGH = true; // çoğu röle LOW ile çeker -> gerekirse false yap
const int OPEN_MS         = 800;    // kapı kaç ms açık kalsın (röle çekme süresi)
// ------------------

WebServer server(80);

void setRelay(bool on) {
  bool level = RELAY_ACTIVE_HIGH ? on : !on;
  digitalWrite(RELAY_PIN, level ? HIGH : LOW);
}

void handleOpen() {
  if (!server.hasArg("token") || String(TOKEN) != server.arg("token")) {
    server.send(401, "text/plain", "unauthorized");
    Serial.println("REDDEDILDI: hatali token");
    return;
  }
  Serial.println("KAPI ACILIYOR");
  setRelay(true);
  delay(OPEN_MS);
  setRelay(false);
  server.send(200, "text/plain", "opened");
}

void handlePing() {
  server.send(200, "text/plain", "nfc-door-esp32 ok");
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi baglaniyor");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP adresi: ");
  Serial.println(WiFi.localIP());   // <-- bu IP'yi uygulamadaki ESP32 adresine yaz

  server.on("/open", handleOpen);
  server.on("/ping", handlePing);
  server.on("/", handlePing);
  server.begin();
  Serial.println("HTTP sunucu hazir. Ornek: http://<IP>/open?token=...");
}

void loop() {
  server.handleClient();
}
