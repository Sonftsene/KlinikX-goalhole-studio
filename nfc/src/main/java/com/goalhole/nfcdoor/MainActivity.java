package com.goalhole.nfcdoor;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * NFC Kapı — 13.56 MHz NFC anahtarlıkları okur, isimle kaydeder ve
 * eşleşince (veya elle) ESP32 röle kontrolcüsüne "aç" komutu gönderir.
 *
 * Not: Telefon, okunan anahtarlığı mevcut kapı okuyucusuna geri gönderemez
 * (Android/iOS kısıtlaması). Bu yüzden kapıyı, kapıya bağlanan ESP32 röle açar.
 */
public class MainActivity extends Activity implements NfcAdapter.ReaderCallback {

    private static final String PREFS = "nfc_door_prefs";
    private static final String KEY_LIST = "keys";
    private static final String KEY_ESP_URL = "esp_url";
    private static final String KEY_ESP_TOKEN = "esp_token";
    private static final String KEY_AUTO_OPEN = "auto_open";

    private NfcAdapter nfcAdapter;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private TextView statusView;
    private TextView techView;
    private EditText nameInput;
    private EditText espUrlInput;
    private EditText espTokenInput;
    private CheckBox autoOpenBox;
    private LinearLayout keysContainer;
    private TextView logView;

    private String lastScannedUid = null;

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(16), dp(16), dp(16), dp(24));
        scroll.addView(root);
        setContentView(scroll);

        // Başlık
        TextView title = new TextView(this);
        title.setText("NFC Kapı Kontrol");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        // Durum kutusu
        statusView = new TextView(this);
        statusView.setText("📡 Telefonu anahtarlığa yaklaştır (arka üst kısım)");
        statusView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        statusView.setPadding(dp(14), dp(18), dp(14), dp(18));
        statusView.setBackgroundColor(Color.parseColor("#E3F2FD"));
        LinearLayout.LayoutParams stLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stLp.topMargin = dp(12);
        statusView.setLayoutParams(stLp);
        root.addView(statusView);

        techView = new TextView(this);
        techView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        techView.setTextColor(Color.DKGRAY);
        techView.setPadding(dp(2), dp(6), dp(2), dp(6));
        root.addView(techView);

        // --- Kaydet bölümü ---
        addSectionTitle(root, "1) Okunan anahtarlığı kaydet");

        nameInput = new EditText(this);
        nameInput.setHint("Anahtarlık adı (ör. Ahmet - Ön kapı)");
        nameInput.setInputType(InputType.TYPE_CLASS_TEXT);
        root.addView(nameInput);

        Button saveBtn = new Button(this);
        saveBtn.setText("💾 KAYDET");
        saveBtn.setOnClickListener(v -> saveCurrentKey());
        root.addView(saveBtn);

        // --- Kayıtlı anahtarlıklar ---
        addSectionTitle(root, "2) Kayıtlı anahtarlıklar");
        keysContainer = new LinearLayout(this);
        keysContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(keysContainer);

        // --- Kapı aç ---
        addSectionTitle(root, "3) Kapı");
        Button openBtn = new Button(this);
        openBtn.setText("🚪 KAPIYI AÇ");
        openBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        openBtn.setPadding(0, dp(10), 0, dp(10));
        openBtn.setOnClickListener(v -> openDoor("Elle açma"));
        root.addView(openBtn);

        autoOpenBox = new CheckBox(this);
        autoOpenBox.setText("Kayıtlı anahtarlık okununca otomatik aç");
        autoOpenBox.setOnCheckedChangeListener((b, checked) ->
                prefs().edit().putBoolean(KEY_AUTO_OPEN, checked).apply());
        root.addView(autoOpenBox);

        // --- ESP32 ayarları ---
        addSectionTitle(root, "4) ESP32 röle ayarı");
        TextView espHint = new TextView(this);
        espHint.setText("Kapıya bağlı ESP32'nin adresi. Örn: http://192.168.1.50");
        espHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        espHint.setTextColor(Color.GRAY);
        root.addView(espHint);

        espUrlInput = new EditText(this);
        espUrlInput.setHint("http://192.168.1.50");
        espUrlInput.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        root.addView(espUrlInput);

        espTokenInput = new EditText(this);
        espTokenInput.setHint("Token (ESP32 ile aynı olmalı)");
        espTokenInput.setInputType(InputType.TYPE_CLASS_TEXT);
        root.addView(espTokenInput);

        Button saveEspBtn = new Button(this);
        saveEspBtn.setText("Ayarı kaydet");
        saveEspBtn.setOnClickListener(v -> {
            prefs().edit()
                    .putString(KEY_ESP_URL, espUrlInput.getText().toString().trim())
                    .putString(KEY_ESP_TOKEN, espTokenInput.getText().toString().trim())
                    .apply();
            toast("ESP32 ayarı kaydedildi");
        });
        root.addView(saveEspBtn);

        // --- Log ---
        addSectionTitle(root, "Kayıt / işlem geçmişi");
        logView = new TextView(this);
        logView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        logView.setTextColor(Color.parseColor("#37474F"));
        logView.setText("");
        root.addView(logView);

        // NFC
        nfcAdapter = NfcAdapter.getDefaultAdapter(this);
        if (nfcAdapter == null) {
            statusView.setText("⚠️ Bu telefonda NFC donanımı yok.");
            statusView.setBackgroundColor(Color.parseColor("#FFCDD2"));
        }

        // Yükle
        espUrlInput.setText(prefs().getString(KEY_ESP_URL, ""));
        espTokenInput.setText(prefs().getString(KEY_ESP_TOKEN, ""));
        autoOpenBox.setChecked(prefs().getBoolean(KEY_AUTO_OPEN, false));
        renderKeys();
    }

    private void addSectionTitle(LinearLayout parent, String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setTextColor(Color.parseColor("#1565C0"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(22);
        lp.bottomMargin = dp(4);
        t.setLayoutParams(lp);
        parent.addView(t);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (nfcAdapter != null) {
            int flags = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
                    | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V
                    | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;
            nfcAdapter.enableReaderMode(this, this, flags, null);
            if (!nfcAdapter.isEnabled()) {
                statusView.setText("⚠️ NFC kapalı. Ayarlardan NFC'yi aç.");
                statusView.setBackgroundColor(Color.parseColor("#FFE0B2"));
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (nfcAdapter != null) {
            nfcAdapter.disableReaderMode(this);
        }
    }

    /** NFC etiketi okunduğunda çağrılır (arka plan thread). */
    @Override
    public void onTagDiscovered(Tag tag) {
        final String uid = bytesToHex(tag.getId());
        final String tech = shortTech(tag.getTechList());
        lastScannedUid = uid;

        runOnUiThread(() -> {
            String matchedName = findKeyName(uid);
            if (matchedName != null) {
                statusView.setText("✅ YETKİLİ: " + matchedName + "\nUID: " + uid);
                statusView.setBackgroundColor(Color.parseColor("#C8E6C9"));
                if (autoOpenBox.isChecked()) {
                    openDoor("Otomatik (" + matchedName + ")");
                }
            } else {
                statusView.setText("🆕 Yeni anahtarlık okundu\nUID: " + uid
                        + "\n↑ Yukarıdan isim verip KAYDET'e bas.");
                statusView.setBackgroundColor(Color.parseColor("#FFF9C4"));
            }
            techView.setText("Çip: " + tech);
        });
    }

    private void saveCurrentKey() {
        if (lastScannedUid == null) {
            toast("Önce bir anahtarlık okut.");
            return;
        }
        String name = nameInput.getText().toString().trim();
        if (name.isEmpty()) name = "Anahtarlık " + lastScannedUid.substring(0, Math.min(6, lastScannedUid.length()));
        try {
            JSONArray arr = loadKeys();
            // Aynı UID varsa güncelle
            boolean updated = false;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (o.getString("uid").equals(lastScannedUid)) {
                    o.put("name", name);
                    updated = true;
                    break;
                }
            }
            if (!updated) {
                JSONObject o = new JSONObject();
                o.put("name", name);
                o.put("uid", lastScannedUid);
                arr.put(o);
            }
            prefs().edit().putString(KEY_LIST, arr.toString()).apply();
            nameInput.setText("");
            renderKeys();
            appendLog((updated ? "Güncellendi" : "Kaydedildi") + ": " + name + " (" + lastScannedUid + ")");
            toast("Kaydedildi");
        } catch (Exception e) {
            toast("Kayıt hatası: " + e.getMessage());
        }
    }

    private void renderKeys() {
        keysContainer.removeAllViews();
        JSONArray arr = loadKeys();
        if (arr.length() == 0) {
            TextView empty = new TextView(this);
            empty.setText("Henüz kayıtlı anahtarlık yok.");
            empty.setTextColor(Color.GRAY);
            keysContainer.addView(empty);
            return;
        }
        for (int i = 0; i < arr.length(); i++) {
            try {
                JSONObject o = arr.getJSONObject(i);
                final String uid = o.getString("uid");
                final String name = o.getString("name");

                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setPadding(dp(8), dp(8), dp(8), dp(8));
                row.setBackgroundColor(i % 2 == 0 ? Color.parseColor("#F5F5F5") : Color.WHITE);

                TextView info = new TextView(this);
                info.setText(name + "\n" + uid);
                info.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                LinearLayout.LayoutParams infoLp = new LinearLayout.LayoutParams(
                        0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
                info.setLayoutParams(infoLp);
                row.addView(info);

                Button openB = new Button(this);
                openB.setText("Aç");
                openB.setOnClickListener(v -> openDoor(name));
                row.addView(openB);

                Button delB = new Button(this);
                delB.setText("Sil");
                delB.setOnClickListener(v -> deleteKey(uid));
                row.addView(delB);

                keysContainer.addView(row);
            } catch (Exception ignored) {
            }
        }
    }

    private void deleteKey(String uid) {
        try {
            JSONArray arr = loadKeys();
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (!o.getString("uid").equals(uid)) out.put(o);
            }
            prefs().edit().putString(KEY_LIST, out.toString()).apply();
            renderKeys();
            appendLog("Silindi: " + uid);
        } catch (Exception e) {
            toast("Silme hatası");
        }
    }

    /** ESP32'ye GET /open?token=... isteği gönderir. */
    private void openDoor(String reason) {
        final String base = prefs().getString(KEY_ESP_URL, "").trim();
        final String token = prefs().getString(KEY_ESP_TOKEN, "").trim();
        if (base.isEmpty()) {
            toast("Önce ESP32 adresini (4. bölüm) gir.");
            return;
        }
        appendLog("Açma isteği → " + reason);
        io.execute(() -> {
            String result;
            try {
                String urlStr = base;
                if (!urlStr.startsWith("http")) urlStr = "http://" + urlStr;
                urlStr += "/open?token=" + URLEncoder.encode(token, "UTF-8");
                URL url = new URL(urlStr);
                HttpURLConnection c = (HttpURLConnection) url.openConnection();
                c.setConnectTimeout(4000);
                c.setReadTimeout(4000);
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                c.disconnect();
                result = (code == 200) ? "✅ Kapı açıldı (HTTP 200)" : "⚠️ ESP32 yanıtı: HTTP " + code;
            } catch (Exception e) {
                result = "❌ Bağlanılamadı: " + e.getMessage();
            }
            final String r = result;
            runOnUiThread(() -> {
                appendLog(r);
                toast(r);
            });
        });
    }

    // --- yardımcılar ---

    private android.content.SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private JSONArray loadKeys() {
        try {
            return new JSONArray(prefs().getString(KEY_LIST, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private String findKeyName(String uid) {
        JSONArray arr = loadKeys();
        for (int i = 0; i < arr.length(); i++) {
            try {
                JSONObject o = arr.getJSONObject(i);
                if (o.getString("uid").equalsIgnoreCase(uid)) return o.getString("name");
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private void appendLog(String line) {
        String now = new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US)
                .format(new java.util.Date());
        logView.setText("• " + now + "  " + line + "\n" + logView.getText());
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private static String bytesToHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) sb.append(':');
            sb.append(String.format("%02X", bytes[i]));
        }
        return sb.toString();
    }

    private static String shortTech(String[] techList) {
        if (techList == null) return "?";
        StringBuilder sb = new StringBuilder();
        for (String t : techList) {
            String s = t.substring(t.lastIndexOf('.') + 1);
            if (sb.length() > 0) sb.append(", ");
            sb.append(s);
        }
        return sb.toString();
    }
}
