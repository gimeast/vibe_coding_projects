package com.gimeast.pullup.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

object Notifications {

    /**
     * 알림 채널은 한 번 만들면 소리 설정을 코드로 바꿀 수 없어서,
     * 무음 채널로 전환하면서 ID 를 새로 잡았다. (구 채널은 [LEGACY_CHANNEL_REST_DONE])
     *
     * 휴식 종료 알림은 소리 · 진동 없이 배너만 띄운다.
     */
    const val CHANNEL_REST_DONE = "rest_done_silent"
    private const val LEGACY_CHANNEL_REST_DONE = "rest_done"

    const val NOTIFICATION_ID_REST_DONE = 1001

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        // 시스템이 알람음을 끝까지 울리던 예전 채널은 제거한다.
        runCatching { manager.deleteNotificationChannel(LEGACY_CHANNEL_REST_DONE) }

        val channel = NotificationChannel(
            CHANNEL_REST_DONE,
            "휴식 종료 알림",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "휴식 시간이 끝나면 알려줍니다. (소리 · 진동 없음)"
            setSound(null, null)
            enableVibration(false)
            enableLights(true)
            runCatching { setBypassDnd(true) }
        }
        manager.createNotificationChannel(channel)
    }

    fun canPostNotifications(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
}
