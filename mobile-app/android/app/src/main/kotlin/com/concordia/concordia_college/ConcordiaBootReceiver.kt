package com.concordia.concordia_college

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

// ─────────────────────────────────────────────────────────────────────────
// ConcordiaBootReceiver — restarts the keep-alive service after system
// events that kill the app process.
//
// WHY THIS EXISTS (v4.3.0):
//   The user reported that notifications arrive when the app is OPEN but
//   NOT when the app is CLOSED (swiped away from recents). The root cause:
//   when the user swipes the app away or the phone reboots, Android kills
//   the entire app process INCLUDING the foreground keep-alive service.
//   `START_STICKY` only restarts the service if the OS killed it for memory
//   pressure — NOT if the user swiped it away or the phone rebooted.
//
//   This BroadcastReceiver listens for common system events and restarts
//   the keep-alive service so that:
//     1. The FCM token stays registered (the service re-registers it).
//     2. The app process is alive to receive FCM pushes.
//     3. The local notification fallback (web polling) can run.
//
//   This is EXACTLY what WhatsApp, Telegram, and Signal do — they all
//   register for BOOT_COMPLETED and restart their background services.
//
// EVENTS WE LISTEN FOR:
//   • BOOT_COMPLETED — phone just booted. Restart the service so
//     notifications work immediately without the user opening the app.
//   • MY_PACKAGE_REPLACED — the app was just updated (new APK installed).
//     Restart the service so the updated version is running.
//   • QUICKBOOT_POWERON — some OEMs (Xiaomi, Huawei) use this instead of
//     BOOT_COMPLETED.
//
// ANDROID 14+ (API 34+):
//   We specify foregroundServiceType="specialUse" when starting the service
//   to comply with Android 14's foreground service type requirements.
// ─────────────────────────────────────────────────────────────────────────

class ConcordiaBootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "ConcordiaBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "Received broadcast: $action — restarting keep-alive service")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON" -> {
                startKeepAliveService(context)
            }
        }
    }

    /// Start the keep-alive foreground service. On Android 8+ this requires
    /// startForegroundService() (the service then has 5 seconds to call
    /// startForeground()).
    private fun startKeepAliveService(context: Context) {
        try {
            val serviceIntent = Intent(context, ConcordiaKeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            Log.i(TAG, "✓ Keep-alive service started after system event")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start keep-alive service: ${e.message}", e)
            // On some OEMs, starting a foreground service from BOOT_COMPLETED
            // can fail with a "Background activity starts" restriction.
            // We fall back to scheduling it via AlarmManager for 10 seconds later.
            scheduleServiceStart(context)
        }
    }

    /// Fallback: schedule the service start 10 seconds later via AlarmManager.
    /// This handles cases where startForegroundService() fails immediately
    /// after boot (the system may not be fully ready).
    private fun scheduleServiceStart(context: Context) {
        try {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            val serviceIntent = Intent(context, ConcordiaKeepAliveService::class.java)
            val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.app.PendingIntent.getForegroundService(
                    context,
                    1001,
                    serviceIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            } else {
                android.app.PendingIntent.getService(
                    context,
                    1001,
                    serviceIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            }
            // Schedule for 10 seconds from now.
            alarmManager.set(
                android.app.AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 10_000L,
                pendingIntent
            )
            Log.i(TAG, "Scheduled keep-alive service start via AlarmManager (10s delay)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule service start: ${e.message}", e)
        }
    }
}
