package com.goalhole.studio;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 7001;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private SaveServer saveServer;
    private volatile Uri lastSavedUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(5, 7, 12));
        getWindow().setNavigationBarColor(Color.rgb(5, 7, 12));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        enterImmersive();

        saveServer = new SaveServer();
        saveServer.start();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 7, 12));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= 26) webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 16) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }
        if (Build.VERSION.SDK_INT >= 21) settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new StudioChromeClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void enterImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    private class StudioChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception e) {
                filePathCallback = null;
                Toast.makeText(MainActivity.this, "Dosya seçici açılamadı", Toast.LENGTH_SHORT).show();
                return false;
            }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (saveServer != null) saveServer.stop();
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }

    public class AndroidBridge {
        @JavascriptInterface public String getSaveEndpoint() {
            return saveServer == null ? "" : saveServer.endpoint();
        }
        @JavascriptInterface public String getAppVersion() { return "6.1-android"; }
        @JavascriptInterface public void setKeepScreenOn(final boolean keep) {
            runOnUiThread(() -> {
                if (keep) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
        @JavascriptInterface public void toast(final String text) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show());
        }
        @JavascriptInterface public void openLastSaved() {
            Uri uri = lastSavedUri;
            if (uri == null) return;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, getContentResolver().getType(uri));
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(i);
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "Dosya kaydedildi", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private class SaveServer {
        private ServerSocket server;
        private Thread acceptThread;
        private final ExecutorService workers = Executors.newCachedThreadPool();
        private volatile boolean running;
        private int port;

        void start() {
            try {
                server = new ServerSocket(0, 20, InetAddress.getByName("127.0.0.1"));
                port = server.getLocalPort();
                running = true;
                acceptThread = new Thread(() -> {
                    while (running) {
                        try {
                            Socket socket = server.accept();
                            workers.submit(() -> handle(socket));
                        } catch (IOException e) {
                            if (running) e.printStackTrace();
                        }
                    }
                }, "goalhole-save-server");
                acceptThread.start();
            } catch (Exception e) { e.printStackTrace(); }
        }

        String endpoint() { return port > 0 ? "http://127.0.0.1:" + port + "/save" : ""; }

        void stop() {
            running = false;
            try { if (server != null) server.close(); } catch (Exception ignored) {}
            workers.shutdownNow();
        }

        private void handle(Socket socket) {
            try (Socket s = socket;
                 BufferedInputStream in = new BufferedInputStream(s.getInputStream());
                 BufferedOutputStream out = new BufferedOutputStream(s.getOutputStream())) {

                String request = readLine(in);
                if (request == null || request.isEmpty()) return;
                String[] first = request.split(" ");
                if (first.length < 2) return;
                String method = first[0].toUpperCase(Locale.US);
                String target = first[1];
                Map<String, String> headers = new HashMap<>();
                String line;
                while ((line = readLine(in)) != null && !line.isEmpty()) {
                    int p = line.indexOf(':');
                    if (p > 0) headers.put(line.substring(0, p).trim().toLowerCase(Locale.US), line.substring(p + 1).trim());
                }

                if ("OPTIONS".equals(method)) { send(out, 204, "text/plain", ""); return; }
                if (!"POST".equals(method) || !target.startsWith("/save")) {
                    send(out, 404, "application/json", "{\"ok\":false}"); return;
                }

                Map<String, String> query = parseQuery(target);
                String name = sanitize(query.getOrDefault("name", "goalhole_" + System.currentTimeMillis() + ".bin"));
                String mime = query.getOrDefault("mime", "application/octet-stream");
                long contentLength = -1;
                try { contentLength = Long.parseLong(headers.getOrDefault("content-length", "-1")); } catch (Exception ignored) {}
                boolean chunked = headers.getOrDefault("transfer-encoding", "").toLowerCase(Locale.US).contains("chunked");

                Uri saved = createDestination(name, mime);
                if (saved == null) throw new IOException("Hedef dosya açılamadı");
                try (OutputStream fileOut = getContentResolver().openOutputStream(saved, "w")) {
                    if (fileOut == null) throw new IOException("Çıkış akışı açılamadı");
                    if (chunked) copyChunked(in, fileOut);
                    else if (contentLength >= 0) copyFixed(in, fileOut, contentLength);
                    else copyUntilClose(in, fileOut);
                    fileOut.flush();
                }
                finishPending(saved);
                lastSavedUri = saved;
                send(out, 200, "application/json", "{\"ok\":true,\"name\":\"" + jsonEscape(name) + "\"}");
                runOnUiThread(() -> {
                    if (webView != null) webView.evaluateJavascript(
                            "window.__goalholeNativeSaved&&window.__goalholeNativeSaved(" + quoteJs(name) + ");", null);
                });
            } catch (Exception e) {
                e.printStackTrace();
                try {
                    send(new BufferedOutputStream(socket.getOutputStream()), 500, "application/json",
                            "{\"ok\":false,\"error\":\"save_failed\"}");
                } catch (Exception ignored) {}
            }
        }

        private Uri createDestination(String name, String mime) throws IOException {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection;
                if (mime.startsWith("video/")) {
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/GoalHole Studio");
                    collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                } else if (mime.startsWith("image/")) {
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GoalHole Studio");
                    collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                } else {
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/GoalHole Studio");
                    collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                }
                return getContentResolver().insert(collection, v);
            }
            File base = getExternalFilesDir(Environment.DIRECTORY_MOVIES);
            if (base == null) base = getFilesDir();
            File dir = new File(base, "GoalHole Studio");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("Klasör oluşturulamadı");
            return Uri.fromFile(new File(dir, name));
        }

        private void finishPending(Uri uri) {
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(uri, v, null, null);
                } catch (Exception ignored) {}
            }
        }

        private void copyFixed(InputStream in, OutputStream out, long remaining) throws IOException {
            byte[] buf = new byte[128 * 1024];
            while (remaining > 0) {
                int r = in.read(buf, 0, (int)Math.min(buf.length, remaining));
                if (r < 0) break;
                out.write(buf, 0, r);
                remaining -= r;
            }
        }
        private void copyUntilClose(InputStream in, OutputStream out) throws IOException {
            byte[] buf = new byte[128 * 1024];
            int r;
            while ((r = in.read(buf)) >= 0) out.write(buf, 0, r);
        }
        private void copyChunked(InputStream in, OutputStream out) throws IOException {
            while (true) {
                String sizeLine = readLine(in);
                if (sizeLine == null) break;
                int semi = sizeLine.indexOf(';');
                if (semi >= 0) sizeLine = sizeLine.substring(0, semi);
                long size = Long.parseLong(sizeLine.trim(), 16);
                if (size == 0) {
                    while (true) {
                        String trailer = readLine(in);
                        if (trailer == null || trailer.isEmpty()) break;
                    }
                    break;
                }
                copyFixed(in, out, size);
                readLine(in);
            }
        }
        private String readLine(InputStream in) throws IOException {
            StringBuilder sb = new StringBuilder();
            int c; boolean got = false;
            while ((c = in.read()) != -1) {
                got = true;
                if (c == '\n') break;
                if (c != '\r') sb.append((char)c);
                if (sb.length() > 16384) throw new IOException("HTTP satırı çok uzun");
            }
            return !got && sb.length() == 0 ? null : sb.toString();
        }
        private Map<String, String> parseQuery(String target) {
            Map<String, String> m = new HashMap<>();
            int q = target.indexOf('?');
            if (q < 0 || q + 1 >= target.length()) return m;
            String[] parts = target.substring(q + 1).split("&");
            for (String p : parts) {
                int eq = p.indexOf('=');
                String k = eq >= 0 ? p.substring(0, eq) : p;
                String v = eq >= 0 ? p.substring(eq + 1) : "";
                try {
                    m.put(URLDecoder.decode(k, "UTF-8"), URLDecoder.decode(v, "UTF-8"));
                } catch (Exception ignored) {}
            }
            return m;
        }
        private String sanitize(String n) {
            String s = n.replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "_").trim();
            if (s.isEmpty()) s = "goalhole_" + System.currentTimeMillis() + ".bin";
            return s.length() > 180 ? s.substring(s.length() - 180) : s;
        }
        private void send(BufferedOutputStream out, int code, String type, String body) throws IOException {
            byte[] data = body.getBytes(StandardCharsets.UTF_8);
            String status = code == 200 ? "OK" : code == 204 ? "No Content" : code == 404 ? "Not Found" : "Internal Server Error";
            String h = "HTTP/1.1 " + code + " " + status + "\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Access-Control-Allow-Methods: POST, OPTIONS\r\n" +
                    "Access-Control-Allow-Headers: Content-Type\r\n" +
                    "Content-Type: " + type + "; charset=utf-8\r\n" +
                    "Content-Length: " + data.length + "\r\n" +
                    "Connection: close\r\n\r\n";
            out.write(h.getBytes(StandardCharsets.UTF_8));
            out.write(data);
            out.flush();
        }
        private String jsonEscape(String s) { return s.replace("\\", "\\\\").replace("\"", "\\\""); }
        private String quoteJs(String s) { return "\"" + jsonEscape(s).replace("\n", "\\n").replace("\r", "\\r") + "\""; }
    }
}
