package com.gimeast.pullup.notify

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.gimeast.pullup.MainActivity
import com.gimeast.pullup.R

/**
 * 휴식 종료 시각에 호출되어 알림만 띄운다.
 *
 * 소리 · 진동은 울리지 않는다. 휴식이 끝나면 앱이 곧바로 다음 세트 카운트다운(3 · 2 · 1 비프음)을
 * 시작하므로 그것이 신호 역할을 한다.
 */
class RestAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (!Notifications.canPostNotifications(context)) return

        val nextSet = intent.getIntExtra(RestAlarm.EXTRA_NEXT_SET, 0)

        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val text = if (nextSet > 0) "${nextSet}세트를 시작하세요 💪" else "다음 세트를 시작하세요 💪"

        val notification = NotificationCompat.Builder(context, Notifications.CHANNEL_REST_DONE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("휴식 끝!")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setSilent(true)
            .setContentIntent(contentIntent)
            .build()

        context.getSystemService(NotificationManager::class.java)
            ?.notify(Notifications.NOTIFICATION_ID_REST_DONE, notification)
    }
}
