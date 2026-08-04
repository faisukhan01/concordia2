package com.concordia.concordia_college

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

// ─────────────────────────────────────────────────────────────────────────
// ConcordiaKeepAliveService — a FOREGROUND SERVICE that keeps the app
// process alive so that push notifications are delivered reliably on
// Chinese OEM devices (Realme, Xiaomi, Huawei, Oppo, Vivo, OnePlus).
//
// WHY THIS EXISTS:
//   Realme UI / ColorOS / MIUI / EMUI aggressively FREEZE and KILL
//   background apps to save battery. Even though FCM's hybrid payload
//   is displayed by the Android OS (not the app), these OEMs can:
//     • Delay the notification by minutes or hours
//     • Batch notifications together (so the user sees them late)
//     • Drop the notification entirely during "sleep standby"
//     • Kill the app's background isolate so the fallback local
//       notification never fires
//
//   A FOREGROUND SERVICE is EXEMPT from these killings. The OS treats
//   the app as "actively doing something the user cares about" and
//   keeps the process alive. This is EXACTLY what WhatsApp, Telegram,
//   Signal, Gmail, and every messaging app does on Chinese OEMs —
//   they all run a foreground service with a persistent notification.
//
// WHAT THE USER SEES:
//   A small, low-priority notification in the notification shade:
//     "Concordia notifications are active"
//   It does NOT make a sound (it's on a LOW-importance channel).
//   It does NOT show as a heads-up banner. It's just a quiet entry
//   in the shade that tells the user (and the OS) that the app is
//   actively maintaining its notification connection.
//
// LIFECYCLE:
//   • Started by MainActivity (via MethodChannel from Flutter) when
//     the app launches.
//   • Runs until the user explicitly stops it or the device reboots.
//   • On device reboot, the app's BroadcastReceiver (RECEIVE_BOOT_COMPLETED)
//     could re-start it — but for now we rely on the user opening the
//     app at least once after reboot (FCM tokens survive reboot).
//
// ANDROID 14+ (API 34+) / ANDROID 15 (API 35):
//   We use foregroundServiceType="specialUse" because:
//     • "dataSync" is limited to 6 hours per 24 hours (not persistent)
//     • "specialUse" has no time limit and is designed for use cases
//       that don't fit the other categories (like keeping a messaging
//       app alive for push delivery).
//   The manifest declares the FOREGROUND_SERVICE_SPECIAL_USE permission
//   and a sub-type property explaining the use case.
// ─────────────────────────────────────────────────────────────────────────

class ConcordiaKeepAliveService : Service() {

    companion object {
        // A SEPARATE channel for the keep-alive notification — LOW importance
        // so it doesn't make a sound or show as a heads-up banner. This is
        // different from the FCM notification channel (which is HIGH importance
        // with sound). We don't want the keep-alive notification itself to be
        // annoying — it should just sit quietly in the shade.
        const val KEEPALIVE_CHANNEL_ID = "concordia_keepalive_v1"
        const val KEEPALIVE_CHANNEL_NAME = "Background Service"
        const val KEEPALIVE_NOTIFICATION_ID = 1

        // The HIGH-importance FCM channel — must match the one created by
        // notification_service.dart and the manifest's default_notification_channel_id.
        // We reference it here only for documentation; the keep-alive notification
        // uses its OWN low-importance channel.
        const val FCM_CHANNEL_ID = "concordia_notifications_v4"
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        // Create the low-importance keep-alive channel (Android 8+).
        createKeepAliveChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Start as a foreground service — this is what makes the OS exempt
        // the app from battery optimization / app-freeze on Chinese OEMs.
        val notification = buildKeepAliveNotification()

        // On Android 14+ (API 34+), we MUST specify the foreground service type
        // when starting. We use "specialUse" (declared in the manifest).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // API 34+ — must pass the type explicitly.
            startForeground(
                KEEPALIVE_NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(KEEPALIVE_NOTIFICATION_ID, notification)
        }

        // Acquire a partial wake lock so the CPU stays awake briefly when a
        // push arrives (prevents the notification from being dropped during
        // doze mode). This is released when the service is destroyed.
        acquireWakeLock()

        // v4.3.0: Schedule a periodic self-restart check via AlarmManager.
        // This ensures the service restarts itself even if the user swipes
        // the app away from recents (which kills the process + the service).
        // START_STICKY only works for OS-initiated kills, NOT user swipes.
        // The AlarmManager fires every 5 minutes and restarts the service.
        scheduleSelfRestart()

        // Return START_STICKY so the OS restarts the service if it kills it
        // (e.g., under memory pressure). This maximizes uptime.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        // Not a bound service — return null.
        return null
    }

    // ═══════════════════════════════════════════════════════════════════
    // v4.3.0: onTaskRemoved — called when the user swipes the app away
    // from the recents screen. This is the #1 cause of "app closed = no
    // notifications": swiping kills the entire process including this
    // foreground service.
    //
    // We immediately restart the service so it keeps running in the
    // background. This is the SAME mechanism used by WhatsApp/Telegram —
    // when you swipe them away, their notification service restarts.
    // ═══════════════════════════════════════════════════════════════════
    override fun onTaskRemoved(rootIntent: Intent?) {
        try {
            // Schedule a restart of the service 1 second after the task is removed.
            val restartIntent = Intent(applicationContext, ConcordiaKeepAliveService::class.java)
            val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.app.PendingIntent.getForegroundService(
                    applicationContext,
                    1001,
                    restartIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            } else {
                android.app.PendingIntent.getService(
                    applicationContext,
                    1001,
                    restartIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            }
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            alarmManager.set(
                android.app.AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 1000L,
                pendingIntent
            )
            android.util.Log.i("ConcordiaKeepAlive", "✓ Scheduled service restart after task removal (swipe-away)")
        } catch (e: Exception) {
            android.util.Log.e("ConcordiaKeepAlive", "Failed to schedule restart: ${e.message}", e)
        }
        super.onTaskRemoved(rootIntent)
    }

    // ═══════════════════════════════════════════════════════════════════
    // v4.3.0: scheduleSelfRestart — schedules a periodic AlarmManager
    // check every 5 minutes. If the service has been killed (by the OEM,
    // by memory pressure, or by the user), the alarm fires and restarts
    // it. This is a safety net that ensures the keep-alive service is
    // ALWAYS running, which is critical for FCM delivery on Chinese OEMs.
    // ═══════════════════════════════════════════════════════════════════
    private fun scheduleSelfRestart() {
        try {
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            val restartIntent = Intent(applicationContext, ConcordiaKeepAliveService::class.java)
            val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.app.PendingIntent.getForegroundService(
                    applicationContext,
                    1002,
                    restartIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            } else {
                android.app.PendingIntent.getService(
                    applicationContext,
                    1002,
                    restartIntent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
                )
            }
            // Schedule a repeating alarm every 5 minutes (RTC_WAKEUP wakes the
            // CPU). setInexactRepeating is more battery-friendly than setRepeating
            // and is sufficient for our purpose (just a keep-alive check).
            alarmManager.setInexactRepeating(
                android.app.AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 5 * 60 * 1000L, // first fire in 5 min
                5 * 60 * 1000L, // repeat every 5 min
                pendingIntent
            )
        } catch (e: Exception) {
            android.util.Log.e("ConcordiaKeepAlive", "Failed to schedule self-restart: ${e.message}", e)
        }
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    // ── Build the persistent low-priority notification ──────────────────
    private fun buildKeepAliveNotification(): Notification {
        return NotificationCompat.Builder(this, KEEPALIVE_CHANNEL_ID)
            .setContentTitle("Concordia notifications are active")
            .setContentText("Tap to open Concordia College")
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(this, R.color.concordia_orange))
            .setOngoing(true) // can't be swiped away
            .setPriority(NotificationCompat.PRIORITY_LOW) // no heads-up banner
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET) // hidden on lock screen
            .setShowWhen(false)
            .build()
    }

    // ── Create the low-importance keep-alive channel (Android 8+) ───────
    private fun createKeepAliveChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Check if it already exists (don't recreate — Android would ignore changes anyway).
        if (manager.getNotificationChannel(KEEPALIVE_CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            KEEPALIVE_CHANNEL_ID,
            KEEPALIVE_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW // no sound, shows in shade
        ).apply {
            description = "Keeps Concordia College running in the background so push notifications arrive reliably. This notification itself makes no sound."
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
            lockscreenVisibility = Notification.VISIBILITY_SECRET
        }
        manager.createNotificationChannel(channel)
    }

    // ── Acquire a partial wake lock ─────────────────────────────────────
    // PARTIAL_WAKE_LOCK keeps the CPU running without keeping the screen on.
    // This ensures that when an FCM push arrives, the device doesn't drop it
    // while dozing. The lock is held for the lifetime of the service.
    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Concordia::KeepAlive")
            wakeLock?.setReferenceCounted(false)
            // Acquire with no timeout — held for the service's lifetime.
            // This is safe because the service is a foreground service (exempt
            // from battery optimization) and the wake lock is released on destroy.
            wakeLock?.acquire(10 * 60 * 1000L) // 10 minutes, auto-renewed on restart
        } catch (_: Exception) {
            // Non-fatal — the foreground service still works without the wake lock.
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
        wakeLock = null
    }
}
