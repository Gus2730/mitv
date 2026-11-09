package com.mitv.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
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
import android.widget.HorizontalScrollView;
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
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Reproductor nativo de MiTV para canales en vivo.
 * Control remoto: ▲▼ canal, ◀▶ atrasar/adelantar, OK lista de canales (mantener OK = favorito),
 * Menú lista, Info banner, números para ir a un canal, "Último" canal anterior, Atrás para volver.
 * En la lista: ◀▶ cambian de categoría, mantener OK marca favorito, Atrás la cierra.
 * Teléfono: tocar muestra los botones, deslizar en el centro cambia de canal, en el borde izquierdo
 * el brillo y en el derecho el volumen, doble toque atrasa/adelanta, deslizar a la izquierda abre la lista.
 * Al salir de la app sigue en una ventana flotante.
 */
public class PlayerActivity extends Activity {

    public static final String EXTRA_DATA = "data";
    private static final String ACCENT = "#2FD18B";
    private static final String CAT_ALL = "Todos";
    private static final String CAT_FAV = "★ Favoritos";

    private ExoPlayer player;
    private PlayerView view;
    private TextView osdNum, osdName, osdNow, msg, zap, listTitle, level, favBtn;
    private LinearLayout osd, controls, listPanel;
    private HorizontalScrollView controlsWrap;
    private ListView list;
    private ArrayAdapter<String> adapter;
    private final List<String> rows = new ArrayList<>();
    private final List<Integer> rowIndex = new ArrayList<>();   // fila de la lista → canal
    private final List<String> cats = new ArrayList<>();
    private int catSel = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioManager audio;

    private JSONArray items;
    private int index;
    private int prevIndex = -1;
    private int altIndex;          // -1 = enlace principal; 0..n = enlaces alternos
    private long startedAt;
    private String zapBuffer = "";
    private boolean tv;
    private boolean inPip;
    private boolean pipUsed;       // se usó la ventana flotante en esta sesión
    private boolean autoSkip = true;
    private int skipStreak = 0;    // canales caídos seguidos que se saltaron solos
    private int skipLeft = -1;     // segundos para pasar al siguiente canal (-1 = no)
    private boolean longPressed;
    private boolean slept;
    private int gestureMode;       // 0 nada, 1 brillo, 2 volumen, 3 canal
    private float volAcc = -1;

    // Lo que se vio, para avisar a la app web al salir
    private final Map<Integer, Long> watched = new HashMap<>();
    private final List<Integer> failed = new ArrayList<>();
    private final Map<Integer, Boolean> favChanges = new HashMap<>();

    private final Runnable hideOsd = () -> osd.setVisibility(View.GONE);
    private final Runnable hideControls = () -> controlsWrap.setVisibility(View.GONE);
    private final Runnable hideLevel = () -> level.setVisibility(View.GONE);
    private final Runnable doZap = this::finishZap;
    private final Runnable sleepRun = () -> { slept = true; finish(); };
    private final Runnable skipTick = new Runnable() {
        @Override
        public void run() {
            if (skipLeft < 0) return;
            if (skipLeft == 0) {
                skipLeft = -1;
                skipStreak++;
                recordWatch();
                int n = items.length();
                index = ((index + 1) % n + n) % n;   // no cuenta como "último canal"
                playCurrent();
                return;
            }
            showMsg("Este canal no está disponible ahora.\nPasando al siguiente en " + skipLeft + "…\n"
                    + (tv ? "Presiona cualquier tecla para quedarte." : "Toca la pantalla para quedarte."));
            skipLeft--;
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        long sleepAt = 0;
        try {
            JSONObject data = new JSONObject(getIntent().getStringExtra(EXTRA_DATA));
            items = data.getJSONArray("items");
            index = data.optInt("index", 0);
            autoSkip = data.optBoolean("autoSkip", true);
            sleepAt = data.optLong("sleepAt", 0);
        } catch (Exception e) {
            finish();
            return;
        }
        if (items.length() == 0) { finish(); return; }
        tv = detectTv();
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

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
        osdNow.setMaxLines(3);
        col.addView(osdName);
        col.addView(osdNow);
        osd.addView(osdNum);
        osd.addView(col);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        lp.setMargins(dp(32), 0, dp(32), dp(tv ? 40 : 110));
        root.addView(osd, lp);

        // Mensajes (cargando, error)
        msg = text(18, "#E8EDF6", false);
        msg.setMaxLines(6);
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

        // Indicador de volumen, brillo y avisos cortos (arriba al centro)
        level = text(18, "#FFFFFF", true);
        level.setPadding(dp(20), dp(10), dp(20), dp(10));
        level.setBackground(rounded("#E60B0F17", 14));
        level.setVisibility(View.GONE);
        FrameLayout.LayoutParams lvp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lvp.setMargins(0, dp(28), 0, 0);
        root.addView(level, lvp);

        // Botones táctiles (abajo); se desplazan si no caben en pantallas angostas
        controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(12), dp(10), dp(12), dp(10));
        controls.addView(button("✕  Volver", v -> finish()));
        controls.addView(button("▲  Anterior", v -> { step(-1); showControls(); }));
        controls.addView(button("▼  Siguiente", v -> { step(1); showControls(); }));
        controls.addView(button("⇄  Último", v -> { lastChannel(); showControls(); }));
        controls.addView(button("☰  Canales", v -> openList()));
        favBtn = button("☆  Favorito", v -> { toggleFav(index); showControls(); });
        controls.addView(favBtn);
        if (pipSupported()) controls.addView(button("⧉  Ventana", v -> enterPip()));
        controlsWrap = new HorizontalScrollView(this);
        controlsWrap.setHorizontalScrollBarEnabled(false);
        controlsWrap.setBackground(rounded("#D90B0F17", 18));
        controlsWrap.addView(controls);
        controlsWrap.setVisibility(View.GONE);
        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cp.setMargins(dp(12), 0, dp(12), dp(24));
        root.addView(controlsWrap, cp);

        // Lista de canales (panel a la derecha) con categorías
        buildCats();
        listPanel = new LinearLayout(this);
        listPanel.setOrientation(LinearLayout.VERTICAL);
        listPanel.setBackgroundColor(Color.parseColor("#F00B0F17"));
        listPanel.setPadding(dp(8), dp(16), dp(8), dp(8));
        LinearLayout catRow = new LinearLayout(this);
        catRow.setOrientation(LinearLayout.HORIZONTAL);
        catRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView catPrev = button("◀", v -> changeCat(-1));
        TextView catNext = button("▶", v -> changeCat(1));
        listTitle = text(18, "#FFFFFF", true);
        listTitle.setGravity(Gravity.CENTER);
        listTitle.setMaxLines(1);
        catRow.addView(catPrev);
        catRow.addView(listTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        catRow.addView(catNext);
        listPanel.addView(catRow);
        TextView hint = text(12, "#9AA7BD", false);
        hint.setText(tv ? "◀ ▶ categoría · mantén OK para favorito" : "Mantén presionado un canal para favorito");
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(4), 0, dp(8));
        listPanel.addView(hint);
        list = new ListView(this);
        list.setDivider(null);
        list.setSelector(rounded("#332FD18B", 12));
        list.setDrawSelectorOnTop(false);
        list.setFocusable(true);
        list.setVerticalScrollBarEnabled(true);
        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, rows) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                TextView t = (TextView) super.getView(position, convertView, parent);
                t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
                t.setPadding(dp(14), dp(10), dp(14), dp(10));
                t.setMaxLines(3);
                boolean on = position < rowIndex.size() && rowIndex.get(position) == index;
                t.setTextColor(Color.parseColor(on ? ACCENT : "#E8EDF6"));
                t.setTypeface(null, on ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
                return t;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((parent, v, pos, id) -> {
            if (pos >= rowIndex.size()) return;
            hideList();
            goTo(rowIndex.get(pos));
        });
        list.setOnItemLongClickListener((parent, v, pos, id) -> {
            if (pos >= rowIndex.size()) return true;
            toggleFav(rowIndex.get(pos));
            refreshList(false);
            return true;
        });
        listPanel.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        listPanel.setVisibility(View.GONE);
        root.addView(listPanel, new FrameLayout.LayoutParams(dp(tv ? 440 : 340), ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END));

        setContentView(root);
        root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);

        final GestureDetector gestures = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) { return true; }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                if (listPanel.getVisibility() == View.VISIBLE) { hideList(); return true; }
                if (controlsWrap.getVisibility() == View.VISIBLE) controlsWrap.setVisibility(View.GONE);
                else { showControls(); showOsd(); }
                return true;
            }

            @Override
            public boolean onDoubleTap(MotionEvent e) {
                boolean fwd = e.getX() > view.getWidth() / 2f;
                seekBy(fwd ? 10000 : -10000);
                showLevel(fwd ? "⏩  +10 s" : "⏪  −10 s");
                return true;
            }

            @Override
            public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (e1 == null) return false;
                if (gestureMode == 0) {
                    if (Math.abs(dy) < Math.abs(dx)) return false;
                    float x = e1.getX() / Math.max(1, view.getWidth());
                    gestureMode = x < 0.3f ? 1 : x > 0.7f ? 2 : 3;
                }
                float h = Math.max(1, view.getHeight() * 0.6f);
                if (gestureMode == 1) { changeBrightness(dy / h); return true; }
                if (gestureMode == 2) { changeVolume(dy / h); return true; }
                return false;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float vx, float vy) {
                if (e1 == null || e2 == null || gestureMode == 1 || gestureMode == 2) return false;
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
        view.setOnTouchListener((v, e) -> {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { gestureMode = 0; volAcc = -1; cancelSkip(); }
            return gestures.onTouchEvent(e);
        });

        player = new ExoPlayer.Builder(this).build();
        player.setPlayWhenReady(true);
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING) showMsg("Cargando…");
                else if (state == Player.STATE_READY) { msg.setVisibility(View.GONE); skipStreak = 0; }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                // Probar el siguiente enlace de respaldo; si no hay, avisar o pasar al siguiente canal
                if (tryNextAlt()) return;
                if (!failed.contains(index)) failed.add(index);
                if (autoSkip && items.length() > 1 && skipStreak < Math.min(5, items.length() - 1)) {
                    skipLeft = 5;
                    handler.removeCallbacks(skipTick);
                    handler.post(skipTick);
                    return;
                }
                showFailMsg();
            }
        });

        if (sleepAt > 0) {
            long wait = sleepAt - System.currentTimeMillis();
            if (wait > 0) handler.postDelayed(sleepRun, wait);
        }

        playCurrent();
        if (!tv) showControls();
    }

    private void showFailMsg() {
        showMsg(skipStreak > 0 ? "Varios canales seguidos no responden.\nRevisa tu conexión o elige otro desde la lista."
                : tv ? "Este canal no está disponible ahora.\nCambia con ▲ ▼, abre la lista con OK o presiona Atrás."
                     : "Este canal no está disponible ahora.\nDesliza arriba o abajo para cambiar, o toca para ver los botones.");
    }

    private void cancelSkip() {
        if (skipLeft < 0) return;
        skipLeft = -1;
        handler.removeCallbacks(skipTick);
        showFailMsg();
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
        b.setMinWidth(dp(48));
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

    // ---------- Favoritos y categorías ----------

    private boolean isFav(int i) {
        Boolean c = favChanges.get(i);
        if (c != null) return c;
        JSONObject it = items.optJSONObject(i);
        return it != null && it.optBoolean("fav", false);
    }

    private void toggleFav(int i) {
        boolean on = !isFav(i);
        favChanges.put(i, on);
        JSONObject it = items.optJSONObject(i);
        showLevel((on ? "★  Agregado a favoritos" : "☆  Quitado de favoritos") + (it != null ? ": " + it.optString("name") : ""));
        updateFavBtn();
    }

    private void updateFavBtn() {
        if (favBtn != null) favBtn.setText(isFav(index) ? "★  Favorito" : "☆  Favorito");
    }

    private void buildCats() {
        cats.clear();
        cats.add(CAT_ALL);
        cats.add(CAT_FAV);
        TreeSet<String> set = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            for (String g : it.optString("grp", "").split(";")) {
                String s = g.trim();
                if (!s.isEmpty()) set.add(s);
            }
        }
        cats.addAll(set);
    }

    private boolean inCat(int i, String cat) {
        if (CAT_ALL.equals(cat)) return true;
        if (CAT_FAV.equals(cat)) return isFav(i);
        JSONObject it = items.optJSONObject(i);
        if (it == null) return false;
        for (String g : it.optString("grp", "").split(";")) if (g.trim().equalsIgnoreCase(cat)) return true;
        return false;
    }

    private void changeCat(int d) {
        int n = cats.size();
        catSel = ((catSel + d) % n + n) % n;
        refreshList(true);
    }

    private void refreshList(boolean moveToCurrent) {
        String cat = cats.get(catSel);
        rows.clear();
        rowIndex.clear();
        for (int i = 0; i < items.length(); i++) {
            if (!inCat(i, cat)) continue;
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String s = it.optInt("num", i + 1) + "   " + (isFav(i) ? "★ " : "") + it.optString("name");
            String now = it.optString("now", "");
            String next = it.optString("next", "");
            if (!now.isEmpty()) s += "\n      Ahora: " + now;
            if (!next.isEmpty()) s += "\n      Sigue: " + next;
            rows.add(s);
            rowIndex.add(i);
        }
        if (rows.isEmpty()) {
            rows.add(CAT_FAV.equals(cat) ? "Todavía no tienes favoritos aquí.\nMantén presionado un canal para agregarlo." : "No hay canales en esta categoría.");
        }
        listTitle.setText(cat + "  ·  " + rowIndex.size());
        adapter.notifyDataSetChanged();
        if (moveToCurrent) {
            int pos = Math.max(0, rowIndex.indexOf(index));
            list.setSelection(pos);
        }
    }

    // ---------- Gestos ----------

    private void changeBrightness(float delta) {
        WindowManager.LayoutParams a = getWindow().getAttributes();
        float b = a.screenBrightness < 0 ? 0.5f : a.screenBrightness;
        b = Math.max(0.02f, Math.min(1f, b + delta));
        a.screenBrightness = b;
        getWindow().setAttributes(a);
        showLevel("☀  Brillo " + Math.round(b * 100) + " %");
    }

    private void changeVolume(float delta) {
        if (audio == null) return;
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        if (volAcc < 0) volAcc = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
        volAcc = Math.max(0, Math.min(max, volAcc + delta * max));
        int v = Math.round(volAcc);
        if (v != audio.getStreamVolume(AudioManager.STREAM_MUSIC)) audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
        showLevel("🔊  Volumen " + Math.round(100f * v / Math.max(1, max)) + " %");
    }

    private void showLevel(String s) {
        if (inPip) return;
        level.setText(s);
        level.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideLevel);
        handler.postDelayed(hideLevel, 1500);
    }

    // ---------- Reproducción ----------

    private void showMsg(String s) {
        msg.setText(s);
        msg.setVisibility(inPip ? View.GONE : View.VISIBLE);
    }

    private void showControls() {
        if (inPip) return;
        updateFavBtn();
        controlsWrap.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideControls);
        handler.postDelayed(hideControls, 5000);
    }

    private void openList() {
        if (inPip) return;
        controlsWrap.setVisibility(View.GONE);
        if (!inCat(index, cats.get(catSel))) catSel = 0;
        refreshList(true);
        listPanel.setVisibility(View.VISIBLE);
        list.requestFocus();
        list.post(() -> list.setSelection(Math.max(0, rowIndex.indexOf(index))));
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

    /** Cambia de canal recordando el anterior (para el botón "Último") */
    private void goTo(int i) {
        if (i == index) { showOsd(); return; }
        recordWatch();
        prevIndex = index;
        index = i;
        skipStreak = 0;
        playCurrent();
    }

    private void lastChannel() {
        if (prevIndex < 0 || prevIndex >= items.length()) { showLevel("Todavía no hay un canal anterior"); return; }
        goTo(prevIndex);
    }

    private void playCurrent() {
        handler.removeCallbacks(skipTick);
        skipLeft = -1;
        altIndex = -1;
        load(cur().optString("url"));
        showOsd();
        updateFavBtn();
        if (adapter != null && listPanel.getVisibility() == View.VISIBLE) refreshList(false);
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
        osdName.setText((isFav(index) ? "★ " : "") + it.optString("name"));
        String now = it.optString("now", "");
        String next = it.optString("next", "");
        String line = now.isEmpty() ? (index + 1) + " de " + items.length() : "Ahora: " + now;
        if (!next.isEmpty()) line += "\nSigue: " + next;
        osdNow.setText(line);
        osd.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideOsd);
        handler.postDelayed(hideOsd, 5000);
    }

    private void step(int d) {
        int n = items.length();
        goTo(((index + d) % n + n) % n);
    }

    private void seekBy(long ms) {
        long pos = Math.max(0, player.getCurrentPosition() + ms);
        player.seekTo(pos);
    }

    private void finishZap() {
        zap.setVisibility(View.GONE);
        try {
            int n = Integer.parseInt(zapBuffer);
            if (n >= 1 && n <= items.length()) goTo(n - 1);
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
            controlsWrap.setVisibility(View.GONE);
            listPanel.setVisibility(View.GONE);
            msg.setVisibility(View.GONE);
            zap.setVisibility(View.GONE);
            level.setVisibility(View.GONE);
        } else {
            showOsd();
        }
    }

    // ---------- Control remoto ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Cualquier tecla cancela el salto automático al siguiente canal
        if (event.getAction() == KeyEvent.ACTION_DOWN && skipLeft >= 0 && event.getKeyCode() != KeyEvent.KEYCODE_BACK) {
            cancelSkip();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

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
        if (keyCode == KeyEvent.KEYCODE_LAST_CHANNEL) { lastChannel(); return true; }
        if (keyCode == KeyEvent.KEYCODE_BOOKMARK) { toggleFav(index); return true; }
        // Con la lista abierta, ▲▼ y OK los maneja la lista; ◀▶ cambian de categoría
        if (listOpen) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) { changeCat(-1); return true; }
            if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) { changeCat(1); return true; }
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
                // Toque corto: lista de canales; mantener presionado: favorito (ver onKeyLongPress / onKeyUp)
                if (event.getRepeatCount() == 0) { longPressed = false; event.startTracking(); }
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
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if ((keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)
                && listPanel.getVisibility() != View.VISIBLE) {
            longPressed = true;
            toggleFav(index);
            showOsd();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if ((keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)
                && listPanel.getVisibility() != View.VISIBLE) {
            if (!longPressed && event.isTracking() && !event.isCanceled()) openList();
            longPressed = false;
            return true;
        }
        return super.onKeyUp(keyCode, event);
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
                JSONArray favs = new JSONArray();
                List<Integer> keys = new ArrayList<>(favChanges.keySet());
                Collections.sort(keys);
                for (Integer k : keys) {
                    JSONObject o = new JSONObject();
                    o.put("i", k);
                    o.put("on", favChanges.get(k));
                    favs.put(o);
                }
                r.put("favs", favs);
                r.put("slept", slept);
                setResult(RESULT_OK, new Intent().putExtra(EXTRA_DATA, r.toString()));
            } catch (Exception ignored) { }
        }
        super.finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
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
