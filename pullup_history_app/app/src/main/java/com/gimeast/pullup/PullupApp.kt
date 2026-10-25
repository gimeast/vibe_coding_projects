package com.gimeast.pullup

import android.app.Application
import com.gimeast.pullup.notify.Notifications

class PullupApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifications.createChannels(this)
    }
}
