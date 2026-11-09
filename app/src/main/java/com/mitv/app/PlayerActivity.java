package com.mitv.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.app.UiModeManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Rational;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
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
 * Reproductor nativo de MiTV para canales en vivo.
 * Control remoto: ▲▼ canal, ◀▶ atrasar/adelantar, OK o Menú lista de canales, Info banner,
 * números para ir a un canal, Atrás para cerrar la lista o volver.
 * Teléfono: tocar muestra los botones, deslizar arriba/abajo cambia de canal,
 * deslizar hacia la izquierda abre la lista. Al salir de la app sigue en una ventana flotante.
 */
public class PlayerActivity extends Activity {

    public static final String EXTRA_DATA = "data";
    private static final String ACCENT = "#2FD18B";

    private ExoPlayer player;
    private PlayerView view;
    private TextView osdNum, osdName, osdNow, msg, zap, listTitle;
    private LinearLayout osd, controls, listPanel;
    private ListView list;
    private ArrayAdapter<String> adapter;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private JSONArray items;
    private int index;
    private int altIndex;          // -1 = enlace principal; 0..n = enlaces alternos
    private long startedAt;
    private String zapBuffer = "";
    private boolean tv;
    private boolean inPip;
    private boolean pipUsed;       // se usó la ventana flotante en esta sesión

    // Lo que se vio, para avisar a la app web al salir
    private final Map<Integer, Long> watched = new HashMap<>();
    private final List<Integer> failed = new ArrayList<>();

    private final Runnable hideOsd = () -> osd.setVisibility(View.GONE);
    private final Runnable hideControls = () -> controls.setVisibility(View.GONE);
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
        tv = detectTv();

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
        osd.setBackground(rounded("#E60B0F17", 14));
        osdNum = text(30, ACCENT, true);
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
        lp.setMargins(dp(32), 0, 0, dp(tv ? 40 : 110));
        root.addView(osd, lp);

        // Mensajes (cargando, error)
        msg = text(18, "#E8EDF6", false);
        msg.setGravity(Gravity.CENTER);
        msg.setPadding(dp(24), dp(18), dp(24), dp(18));
        msg.setBackground(rounded("#E60B0F17", 14));
        root.addView(msg, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // Número que se está marcando
        zap = text(56, "#FFFFFF", true);
        zap.setPadding(dp(22), dp(6), dp(22), dp(6));
        zap.setBackground(rounded("#E60B0F17", 14));
        zap.setVisibility(View.GONE);
        FrameLayout.LayoutParams zp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        zp.setMargins(0, dp(28), dp(36), 0);
        root.addView(zap, zp);

        // Botones táctiles (abajo)
        controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(12), dp(10), dp(12), dp(10));
        controls.setBackground(rounded("#D90B0F17", 18));
        controls.addView(button("✕  Volver", v -> finish()));
        controls.addView(button("▲  Anterior", v -> { step(-1); showControls(); }));
        controls.addView(button("▼  Siguiente", v -> { step(1); showControls(); }));
        controls.addView(button("☰  Canales", v -> openList()));
        if (pipSupported()) controls.addView(button("⧉  Ventana", v -> enterPip()));
        controls.setVisibility(View.GONE);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cp.setMargins(dp(12), 0, dp(12), dp(24));
        root.addView(controls, cp);

        // Lista de canales (panel a la derecha)
        listPanel = new LinearLayout(this);
        listPanel.setOrientation(LinearLayout.VERTICAL);
        listPanel.setBackgroundColor(Color.parseColor("#F00B0F17"));
        listPanel.setPadding(dp(8), dp(16), dp(8), dp(8));
        listTitle = text(20, "#FFFFFF", true);
        listTitle.setText("Canales");
        listTitle.setPadding(dp(14), 0, dp(14), dp(10));
        listPanel.addView(listTitle);
        list = new ListView(this);
        list.setDivider(null);
        list.setSelector(rounded("#332FD18B", 12));
        list.setDrawSelectorOnTop(false);
        list.setFocusable(true);
        list.setVerticalScrollBarEnabled(true);
        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, labels()) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                TextView t = (TextView) super.getView(position, convertView, parent);
                t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                t.setPadding(dp(14), dp(10), dp(14), dp(10));
                t.setMaxLines(2);
                boolean on = position == index;
                t.setTextColor(Color.parseColor(on ? ACCENT : "#E8EDF6"));
                t.setTypeface(null, on ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
                return t;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, v, pos, id) -> {
            hideList();
            if (pos != index) {
                index = pos;
                playCurrent();
            }
        });
        listPanel.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        listPanel.setVisibility(View.GONE);
        root.addView(listPanel, new FrameLayout.LayoutParams(dp(tv ? 420 : 320), ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END));

        setContentView(root);
        root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        // Gestos: tocar = botones, deslizar arriba/abajo = canal, deslizar a la izquierda = lista
        final GestureDetector gestures = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) { return true; }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                if (listPanel.getVisibility() == View.VISIBLE) { hideList(); return true; }
                if (controls.getVisibility() == View.VISIBLE) controls.setVisibility(View.GONE);
                else { showControls(); showOsd(); }
                return true;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                if (e1 == null || e2 == null) return false;
                float dx = e2.getX() - e1.getX(), dy = e2.getY() - e1.getY();
                if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > dp(60)) {
                    step(dy < 0 ? 1 : -1);
                    return true;
                }
                if (dx < -dp(80) && Math.abs(dx) > Math.abs(dy)) { openList(); return true; }
                if (dx > dp(80) && listPanel.getVisibility() == View.VISIBLE) { hideList(); return true; }
                return false;
            }
        });
        view.setOnTouchListener((v, e) -> gestures.onTouchEvent(e));

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
                showMsg(tv ? "Este canal no está disponible ahora.\nCambia con ▲ ▼, abre la lista con OK o presiona Atrás."
                           : "Este canal no está disponible ahora.\nDesliza arriba o abajo para cambiar, o toca para ver los botones.");
            }
        });

        playCurrent();
        if (!tv) showControls();
    }

    private boolean detectTv() {
        try {
            if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true;
            UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            return ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean pipSupported() {
        return !tv && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    private GradientDrawable rounded(String color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.parseColor(color));
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private TextView text(int sp, String color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(Color.parseColor(color));
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setMaxLines(2);
        return t;
    }

    private TextView button(String label, View.OnClickListener click) {
        TextView b = text(15, "#FFFFFF", true);
        b.setText(label);
        b.setMaxLines(1);
        b.setGravity(Gravity.CENTER);
        b.setMinHeight(dp(48));
        b.setPadding(dp(14), dp(8), dp(14), dp(8));
        b.setBackground(rounded("#26FFFFFF", 12));
        b.setClickable(true);
        b.setFocusable(false);
        b.setOnClickListener(click);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(dp(4), 0, dp(4), 0);
        b.setLayoutParams(p);
        return b;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private List<String> labels() {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) { out.add(String.valueOf(i + 1)); continue; }
            String s = it.optInt("num", i + 1) + "   " + it.optString("name");
            String now = it.optString("now", "");
            if (!now.isEmpty()) s += "\n      " + now;
            out.add(s);
        }
        return out;
    }

    private void showMsg(String s) {
        msg.setText(s);
        msg.setVisibility(inPip ? View.GONE : View.VISIBLE);
    }

    private void showControls() {
        if (inPip) return;
        controls.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideControls);
        handler.postDelayed(hideControls, 5000);
    }

    private void openList() {
        if (inPip) return;
        controls.setVisibility(View.GONE);
        listTitle.setText("Canales  ·  " + items.length());
        adapter.notifyDataSetChanged();
        listPanel.setVisibility(View.VISIBLE);
        list.requestFocus();
        list.setSelection(Math.max(0, index - 3));
        list.post(() -> list.setSelection(index));
    }

    private void hideList() {
        listPanel.setVisibility(View.GONE);
        view.requestFocus();
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
        if (adapter != null) adapter.notifyDataSetChanged();
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
        if (inPip) return;
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

    // ---------- Ventana flotante (PiP) al salir de la app en el teléfono ----------

    private void enterPip() {
        if (!pipSupported()) return;
        try {
            enterPictureInPictureMode(new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9))
                    .build());
        } catch (Exception ignored) { }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (player != null && player.getPlayWhenReady()) enterPip();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPip, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPip, newConfig);
        inPip = isInPip;
        if (isInPip) {
            pipUsed = true;
            handler.removeCallbacks(hideOsd);
            osd.setVisibility(View.GONE);
            controls.setVisibility(View.GONE);
            listPanel.setVisibility(View.GONE);
            msg.setVisibility(View.GONE);
            zap.setVisibility(View.GONE);
        } else {
            showOsd();
        }
    }

    // ---------- Control remoto ----------

    @Override
    public void onBackPressed() {
        if (listPanel.getVisibility() == View.VISIBLE) { hideList(); return; }
        if (pipUsed) {
            // Tras la ventana flotante el reproductor quedó aparte: volver a la app principal
            try {
                startActivity(new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
            } catch (Exception ignored) { }
        }
        super.onBackPressed();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        boolean listOpen = listPanel.getVisibility() == View.VISIBLE;
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_GUIDE) {
            if (listOpen) hideList(); else openList();
            return true;
        }
        // Con la lista abierta, las flechas y OK las maneja la lista
        if (listOpen) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) { hideList(); return true; }
            return super.onKeyDown(keyCode, event);
        }
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
                if (event.getRepeatCount() == 0) openList();
                return true;
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
        // En ventana flotante sigue sonando; si la cierran, se detiene y se vuelve a la app
        if (player != null) player.pause();
        // Si cerraron la ventana flotante, terminar el reproductor
        if (inPip) finish();
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
