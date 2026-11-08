package com.mitv.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Reproductor nativo de MiTV para canales en vivo (más fluido que el de la página web en TV).
 * Control remoto: ▲▼ canal, ◀▶ atrasar/adelantar, OK información, números para ir a un canal, Atrás para volver.
 */
public class PlayerActivity extends Activity {

    public static final String EXTRA_DATA = "data";

    private ExoPlayer player;
    private PlayerView view;
    private TextView osdNum, osdName, osdNow, msg, zap;
    private LinearLayout osd;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private JSONArray items;
    private int index;
    private int altIndex;          // -1 = enlace principal; 0..n = enlaces alternos
    private long startedAt;
    private String zapBuffer = "";

    // Lo que se vio, para avisar a la app web al salir
    private final Map<Integer, Long> watched = new HashMap<>();
    private final List<Integer> failed = new ArrayList<>();

    private final Runnable hideOsd = () -> osd.setVisibility(View.GONE);
    private final Runnable doZap = this::finishZap;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        try {
            JSONObject data = new JSONObject(getIntent().getStringExtra(EXTRA_DATA));
            items = data.getJSONArray("items");
            index = data.optInt("index", 0);
        } catch (Exception e) {
            finish();
            return;
        }
        if (items.length() == 0) { finish(); return; }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setUseController(false);
        view.setKeepScreenOn(true);
        root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Banner del canal (abajo a la izquierda)
        osd = new LinearLayout(this);
        osd.setOrientation(LinearLayout.HORIZONTAL);
        osd.setGravity(Gravity.CENTER_VERTICAL);
        osd.setPadding(dp(18), dp(12), dp(22), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#E60B0F17"));
        bg.setCornerRadius(dp(14));
        osd.setBackground(bg);
        osdNum = text(30, "#2FD18B", true);
        osdNum.setPadding(0, 0, dp(16), 0);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        osdName = text(20, "#FFFFFF", true);
        osdNow = text(15, "#C9D1E0", false);
        col.addView(osdName);
        col.addView(osdNow);
        osd.addView(osdNum);
        osd.addView(col);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        lp.setMargins(dp(32), 0, 0, dp(40));
        root.addView(osd, lp);

        // Mensajes (cargando, error)
        msg = text(18, "#E8EDF6", false);
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(dp(24), dp(18), dp(24), dp(18));
        GradientDrawable mbg = new GradientDrawable();
        mbg.setColor(Color.parseColor("#E60B0F17"));
        mbg.setCornerRadius(dp(14));
        msg.setBackground(mbg);
        root.addView(msg, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // Número que se está marcando
        zap = text(56, "#FFFFFF", true);
        zap.setPadding(dp(22), dp(6), dp(22), dp(6));
        zap.setBackground(mbg.getConstantState().newDrawable());
        zap.setVisibility(View.GONE);
        FrameLayout.LayoutParams zp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        zp.setMargins(0, dp(28), dp(36), 0);
        root.addView(zap, zp);

        setContentView(root);
        root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        player = new ExoPlayer.Builder(this).build();
        player.setPlayWhenReady(true);
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) showMsg("Cargando…");
                else if (state == Player.STATE_READY) msg.setVisibility(View.GONE);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                // Probar el siguiente enlace de respaldo; si no hay, avisar
                if (tryNextAlt()) return;
                if (!failed.contains(index)) failed.add(index);
                showMsg("Este canal no está disponible ahora.\nCambia de canal con ▲ ▼ o presiona Atrás.");
            }
        });

        playCurrent();
    }

    private TextView text(int sp, String color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(Color.parseColor(color));
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setMaxLines(2);
        return t;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private void showMsg(String s) {
        msg.setText(s);
        msg.setVisibility(View.VISIBLE);
    }

    private JSONObject cur() {
        return items.optJSONObject(index);
    }

    private void recordWatch() {
        if (startedAt > 0) {
            long secs = (SystemClock.elapsedRealtime() - startedAt) / 1000;
            Long prev = watched.get(index);
            watched.put(index, (prev == null ? 0 : prev) + secs);
        }
        startedAt = 0;
    }

    private void playCurrent() {
        altIndex = -1;
        load(cur().optString("url"));
        showOsd();
    }

    private void load(String url) {
        JSONObject it = cur();
        recordWatch();
        startedAt = SystemClock.elapsedRealtime();
        showMsg("Conectando…");

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(12000)
                .setReadTimeoutMs(20000);
        String ua = it.optString("ua", "");
        if (!ua.isEmpty()) http.setUserAgent(ua);
        String ref = it.optString("ref", "");
        if (!ref.isEmpty()) {
            Map<String, String> h = new HashMap<>();
            h.put("Referer", ref);
            try {
                Uri r = Uri.parse(ref);
                h.put("Origin", r.getScheme() + "://" + r.getAuthority());
            } catch (Exception ignored) { }
            http.setDefaultRequestProperties(h);
        }

        MediaItem.Builder mi = new MediaItem.Builder().setUri(Uri.parse(url));
        String low = url.toLowerCase();
        if (low.contains("m3u8") || low.contains("/hls")) mi.setMimeType(MimeTypes.APPLICATION_M3U8);
        mi.setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().setTargetOffsetMs(C.TIME_UNSET).build());

        player.setMediaSource(new DefaultMediaSourceFactory(http).createMediaSource(mi.build()));
        player.prepare();
        player.play();
    }

    private boolean tryNextAlt() {
        JSONArray alts = cur().optJSONArray("alts");
        if (alts == null || altIndex + 1 >= alts.length()) return false;
        altIndex++;
        showMsg("Probando otro enlace de este canal…");
        load(alts.optString(altIndex));
        return true;
    }

    private void showOsd() {
        JSONObject it = cur();
        osdNum.setText(String.valueOf(it.optInt("num", index + 1)));
        osdName.setText(it.optString("name"));
        String now = it.optString("now", "");
        osdNow.setText(now.isEmpty() ? (index + 1) + " de " + items.length() : "Ahora: " + now);
        osd.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideOsd);
        handler.postDelayed(hideOsd, 5000);
    }

    private void step(int d) {
        int n = items.length();
        index = ((index + d) % n + n) % n;
        playCurrent();
    }

    private void seekBy(long ms) {
        long pos = Math.max(0, player.getCurrentPosition() + ms);
        player.seekTo(pos);
    }

    private void finishZap() {
        zap.setVisibility(View.GONE);
        try {
            int n = Integer.parseInt(zapBuffer);
            if (n >= 1 && n <= items.length()) {
                index = n - 1;
                playCurrent();
            }
        } catch (NumberFormatException ignored) { }
        zapBuffer = "";
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode >= KeyEvent.KEYCODE_0 && keyCode <= KeyEvent.KEYCODE_9) {
            zapBuffer = (zapBuffer + (keyCode - KeyEvent.KEYCODE_0));
            if (zapBuffer.length() > 4) zapBuffer = zapBuffer.substring(zapBuffer.length() - 4);
            zap.setText(zapBuffer);
            zap.setVisibility(View.VISIBLE);
            handler.removeCallbacks(doZap);
            handler.postDelayed(doZap, 1500);
            return true;
        }
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_CHANNEL_UP:
            case KeyEvent.KEYCODE_PAGE_UP:
                if (event.getRepeatCount() == 0) step(-1);
                return true;
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
            case KeyEvent.KEYCODE_PAGE_DOWN:
                if (event.getRepeatCount() == 0) step(1);
                return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                seekBy(-10000);
                return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                seekBy(10000);
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_INFO:
                showOsd();
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (player.isPlaying()) player.pause(); else player.play();
                showOsd();
                return true;
            default:
                return super.onKeyDown(keyCode, event);
        }
    }

    @Override
    public void finish() {
        if (items != null) {
            recordWatch();
            try {
                JSONObject r = new JSONObject();
                r.put("index", index);
                JSONArray w = new JSONArray();
                for (Map.Entry<Integer, Long> e : watched.entrySet()) {
                    JSONObject o = new JSONObject();
                    o.put("i", e.getKey());
                    o.put("secs", e.getValue());
                    w.put(o);
                }
                r.put("watched", w);
                r.put("failed", new JSONArray(failed));
                setResult(RESULT_OK, new Intent().putExtra(EXTRA_DATA, r.toString()));
            } catch (Exception ignored) { }
        }
        super.finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (player != null && player.getPlaybackState() != Player.STATE_IDLE) player.play();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) player.release();
        super.onDestroy();
    }
}
