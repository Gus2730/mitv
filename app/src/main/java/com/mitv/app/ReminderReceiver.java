package com.mitv.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Muestra la notificación de un recordatorio (partido o programa). */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String CHANNEL = "recordatorios";

    static PendingIntent pending(Context ctx, String id, String title, String text) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction("com.mitv.app.REMINDER." + id);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("text", text);
        return PendingIntent.getBroadcast(ctx, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Recordatorios", NotificationManager.IMPORTANCE_HIGH));
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx).setPriority(Notification.PRIORITY_HIGH);
        }
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(intent.getStringExtra("title"))
                .setContentText(intent.getStringExtra("text"))
                .setAutoCancel(true)
                .setContentIntent(pi);
        String id = intent.getStringExtra("id");
        nm.notify(id == null ? 1 : id.hashCode(), b.build());
    }
}
