package com.gimeast.pullup.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/** 휴식 종료 시점에 알림을 울리기 위한 정확 알람 스케줄러. */
object RestAlarm {

    private const val REQUEST_CODE = 7001
    const val EXTRA_NEXT_SET = "next_set"

    private fun pendingIntent(context: Context, nextSetNumber: Int): PendingIntent {
        val intent = Intent(context, RestAlarmReceiver::class.java).apply {
            putExtra(EXTRA_NEXT_SET, nextSetNumber)
        }
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** [triggerAtMillis] (epoch millis) 에 휴식 종료 알림이 울리도록 예약한다. */
    fun schedule(context: Context, triggerAtMillis: Long, nextSetNumber: Int) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = pendingIntent(context, nextSetNumber)

        val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }

        if (canExact) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
        } else {
            // 정확 알람 권한이 없으면 약간의 오차를 감수하고 예약한다.
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
        }
    }

    fun cancel(context: Context) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        alarmManager.cancel(pendingIntent(context, 0))
    }
}
