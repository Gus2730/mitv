package com.mitv.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget de la pantalla de inicio: hasta 5 canales favoritos que abren MiTV directo en ese canal. */
public class FavsWidget extends AppWidgetProvider {

    public static final String PREFS = "mitv_widget";
    public static final String EXTRA_URL = "play_url";
    private static final int[] SLOTS = {R.id.fav1, R.id.fav2, R.id.fav3, R.id.fav4, R.id.fav5};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    public static void refresh(Context ctx) {
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, FavsWidget.class));
            if (ids == null || ids.length == 0) return;
            RemoteViews rv = build(ctx);
            for (int id : ids) mgr.updateAppWidget(id, rv);
        } catch (Exception ignored) { }
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_favs);
        JSONArray favs;
        try {
            favs = new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("favs", "[]"));
        } catch (Exception e) {
            favs = new JSONArray();
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        // Tocar el título abre MiTV
        Intent home = new Intent(ctx, MainActivity.class);
        rv.setOnClickPendingIntent(R.id.wTitle, PendingIntent.getActivity(ctx, 90, home, flags));
        for (int i = 0; i < SLOTS.length; i++) {
            JSONObject f = favs.optJSONObject(i);
            if (f == null) {
                rv.setTextViewText(SLOTS[i], i == 0 ? "Marca canales con ★ en MiTV" : "");
                rv.setViewVisibility(SLOTS[i], i == 0 ? android.view.View.VISIBLE : android.view.View.GONE);
                continue;
            }
            rv.setViewVisibility(SLOTS[i], android.view.View.VISIBLE);
            rv.setTextViewText(SLOTS[i], "▶  " + f.optString("n"));
            Intent play = new Intent(ctx, MainActivity.class);
            play.setAction("mitv.PLAY");
            play.setData(Uri.parse("mitv://play/" + i));
            play.putExtra(EXTRA_URL, f.optString("u"));
            play.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            rv.setOnClickPendingIntent(SLOTS[i], PendingIntent.getActivity(ctx, 100 + i, play, flags));
        }
        return rv;
    }
}
