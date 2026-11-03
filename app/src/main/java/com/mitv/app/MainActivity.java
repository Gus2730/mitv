package com.mitv.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.UiModeManager;
import android.content.pm.PackageManager;
import android.speech.RecognizerIntent;
import org.json.JSONObject;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity {

    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/assets/index.html";
    private static final int FILE_REQUEST = 42;
    private static final int VOICE_REQUEST = 43;
    private volatile boolean bgAudio = false;
    /** Datos de conexión que algunos canales exigen (sitio de origen y programa), por servidor */
    private final Map<String, String[]> hostHeaders = new ConcurrentHashMap<>();
    private volatile String[] streamHeaders = null;

    private WebView web;
    private FrameLayout root;
    private WebViewAssetLoader assets;
    private ValueCallback<Uri[]> fileCallback;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private volatile boolean playing = false;

    /** Puente que usa la app web: window.MiTVAndroid */
    public class Bridge {
        @JavascriptInterface
        public void setPlaying(boolean p) { playing = p; }

        @JavascriptInterface
        public void enterPip() { runOnUiThread(MainActivity.this::startPip); }

        @JavascriptInterface
        public boolean isTv() {
            UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            return (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                    || getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                    || Build.MODEL.startsWith("AFT");
        }

        @JavascriptInterface
        public boolean hasVoice() {
            return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).resolveActivity(getPackageManager()) != null;
        }

        @JavascriptInterface
        public void voiceSearch() {
            runOnUiThread(() -> {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CR");
                i.putExtra(RecognizerIntent.EXTRA_PROMPT, "¿Qué quieres ver?");
                try { startActivityForResult(i, VOICE_REQUEST); }
                catch (ActivityNotFoundException e) { js("window.mitvToast&&mitvToast('Este dispositivo no tiene búsqueda por voz')"); }
            });
        }

        @JavascriptInterface
        public void scheduleReminder(String id, double atMillis, String title, String text) {
            askNotificationPermission();
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am == null) return;
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, (long) atMillis, ReminderReceiver.pending(MainActivity.this, id, title, text));
        }

        @JavascriptInterface
        public void cancelReminder(String id) {
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am != null) am.cancel(ReminderReceiver.pending(MainActivity.this, id, "", ""));
        }

        @JavascriptInterface
        public void launchApp(String packages, String webUrl) {
            runOnUiThread(() -> {
                PackageManager pm = getPackageManager();
                String first = null;
                for (String p : packages.split(",")) {
                    p = p.trim();
                    if (p.isEmpty()) continue;
                    if (first == null) first = p;
                    Intent i = pm.getLeanbackLaunchIntentForPackage(p);
                    if (i == null) i = pm.getLaunchIntentForPackage(p);
                    if (i != null) { startActivity(i); return; }
                }
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + first))); }
                catch (Exception e) { openExternal(webUrl); }
            });
        }

        @JavascriptInterface
        public void setBackgroundAudio(boolean on) { bgAudio = on; }

        @JavascriptInterface
        public void registerHeaders(String host, String referrer, String userAgent) {
            if (host != null && !host.isEmpty()) hostHeaders.put(host, new String[]{referrer, userAgent});
        }

        @JavascriptInterface
        public void setStreamHeaders(String referrer, String userAgent) {
            boolean empty = (referrer == null || referrer.isEmpty()) && (userAgent == null || userAgent.isEmpty());
            streamHeaders = empty ? null : new String[]{referrer, userAgent};
        }
    }

    private void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7));
        }
    }

    private void startPip() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                enterPictureInPictureMode(new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9)).build());
            } catch (Exception ignored) { }
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (playing) startPip(); // al tocar Inicio mientras se ve algo, sigue en ventana flotante
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration cfg) {
        super.onPictureInPictureModeChanged(inPip, cfg);
        web.evaluateJavascript("document.getElementById('player').classList.toggle('idle'," + inPip + ")", null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0F17"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0F17"));
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        assets = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.addJavascriptInterface(new Bridge(), "MiTVAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (APP_HOST.equals(u.getHost())) return assets.shouldInterceptRequest(u);
                // Fetch channel lists and streams natively and add CORS headers,
                // so channels without CORS support still play in the app.
                String scheme = u.getScheme();
                // Las imágenes (logos, portadas) las carga el WebView directo: así no ocupan
                // el mismo canal que el video y la reproducción no se traba.
                String accept = req.getRequestHeaders().get("Accept");
                if (accept != null && accept.startsWith("image/")) return null;
                if (req.isForMainFrame()) return null;
                if ("GET".equals(req.getMethod()) && ("http".equals(scheme) || "https".equals(scheme))) {
                    return proxy(req);
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (APP_HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                boolean videoOnly = true;
                for (String t : types) if (t != null && (t.contains("m3u") || t.contains("srt") || t.contains("vtt"))) videoOnly = false;
                i.setType(videoOnly ? "video/*" : "*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Elegir archivo"), FILE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                web.setVisibility(View.GONE);
                setFullscreenUi(true);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                web.setVisibility(View.VISIBLE);
                setFullscreenUi(false);
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    private WebResourceResponse proxy(WebResourceRequest req) {
        try {
            String url = req.getUrl().toString();
            HttpURLConnection c = null;
            for (int hop = 0; hop < 6; hop++) {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(12000);
                c.setReadTimeout(20000);
                for (Map.Entry<String, String> h : req.getRequestHeaders().entrySet()) {
                    String k = h.getKey();
                    if (k.equalsIgnoreCase("Origin") || k.equalsIgnoreCase("Referer") || k.equalsIgnoreCase("Accept-Encoding")) continue;
                    c.setRequestProperty(k, h.getValue());
                }
                String[] extra = hostHeaders.get(new URL(url).getHost());
                if (extra == null) extra = hostHeaders.get(new URL(url).getAuthority());
                if (extra == null) extra = streamHeaders;
                if (extra != null) {
                    if (extra[0] != null && !extra[0].isEmpty()) {
                        c.setRequestProperty("Referer", extra[0]);
                        try { URL r = new URL(extra[0]); c.setRequestProperty("Origin", r.getProtocol() + "://" + r.getAuthority()); } catch (Exception ignored) { }
                    }
                    if (extra[1] != null && !extra[1].isEmpty()) c.setRequestProperty("User-Agent", extra[1]);
                }
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                    url = new URL(new URL(url), c.getHeaderField("Location")).toString();
                    c.disconnect();
                    continue;
                }
                break;
            }
            int code = c.getResponseCode();
            String reason = c.getResponseMessage();
            if (reason == null || reason.trim().isEmpty()) reason = "OK";
            String type = c.getContentType();
            String mime = "application/octet-stream";
            String enc = null;
            if (type != null) {
                String[] parts = type.split(";");
                mime = parts[0].trim();
                for (String p : parts) {
                    p = p.trim();
                    if (p.toLowerCase().startsWith("charset=")) enc = p.substring(8);
                }
            }
            Map<String, String> headers = new HashMap<>();
            for (Map.Entry<String, List<String>> h : c.getHeaderFields().entrySet()) {
                String k = h.getKey();
                if (k == null || h.getValue().isEmpty()) continue;
                String lk = k.toLowerCase();
                if (lk.startsWith("access-control-") || lk.equals("content-encoding") || lk.equals("transfer-encoding")
                        || lk.equals("location") || lk.equals("content-security-policy")) continue;
                headers.put(k, h.getValue().get(0));
            }
            headers.put("Access-Control-Allow-Origin", "*");
            InputStream body;
            try {
                body = code >= 400 ? c.getErrorStream() : c.getInputStream();
            } catch (IOException e) {
                body = c.getErrorStream();
            }
            if (code >= 300 && code < 400) { code = 502; reason = "Bad Gateway"; }
            return new WebResourceResponse(mime, enc, code, reason, headers, body);
        } catch (Exception e) {
            return null; // let the WebView try on its own
        }
    }

    private void openExternal(String url) {
        try {
            Intent i;
            if (url.startsWith("intent:")) {
                i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
            } else if (url.startsWith("vlc://")) {
                i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.parse(url.substring(6)), "video/*");
                i.setPackage("org.videolan.vlc");
            } else {
                i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            }
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            if (url.contains("org.videolan.vlc")) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=org.videolan.vlc")));
                } catch (ActivityNotFoundException ignored) { }
            }
        } catch (Exception ignored) { }
    }

    private void setFullscreenUi(boolean on) {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                : View.SYSTEM_UI_FLAG_VISIBLE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == VOICE_REQUEST) {
            if (resultCode == RESULT_OK && data != null) {
                java.util.ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty()) js("window.mitvVoice&&mitvVoice(" + JSONObject.quote(r.get(0)) + ")");
            }
            return;
        }
        if (requestCode != FILE_REQUEST || fileCallback == null) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (customView != null) {
            web.evaluateJavascript("document.exitFullscreen&&document.exitFullscreen()", null);
            return;
        }
        web.evaluateJavascript("(window.mitvBack&&window.mitvBack())?'1':'0'", v -> {
            if (v == null || !v.contains("1")) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (!bgAudio && !isInPictureInPictureMode()) web.onPause(); // la radio sigue sonando con la pantalla apagada
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
