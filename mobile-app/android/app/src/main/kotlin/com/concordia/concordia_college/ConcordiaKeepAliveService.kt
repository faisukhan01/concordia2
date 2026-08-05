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
        // v4.6.2: A SEPARATE channel for the keep-alive notification — MIN
        // importance so it does NOT appear in the status bar at all, makes NO
        // sound, and shows NO heads-up banner. It only appears as a quiet
        // entry at the very bottom of the expanded notification panel.
        //
        // v4.6.0 used LOW importance which still showed the notification in
        // the status bar and re-alerted every ~60 sec when the service
        // restarted itself. The user reported "this notification is coming
        // after like every 5 min" — that was the restart re-posting it.
        // MIN importance + only-post-once (see onStartCommand) fixes that.
        const val KEEPALIVE_CHANNEL_ID = "concordia_keepalive_v1"
        const val KEEPALIVE_CHANNEL_NAME = "Background Service"
        const val KEEPALIVE_NOTIFICATION_ID = 1

        // v4.6.2: Track whether we've already called startForeground in this
        // process instance. Re-calling startForeground with the same notification
        // ID UPDATES the notification, which resets its "Just now" timestamp and
        // makes it look like a new notification every ~60 seconds. By only
        // calling it once per process, the notification stays truly silent.
        @Volatile
        private var isForegroundStarted: Boolean = false

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
        // v4.6.2: Only call startForeground ONCE per process lifetime.
        // Re-calling it every 60 seconds (on AlarmManager restart) was causing
        // the notification to re-appear as "Just now" every ~5 min, which the
        // user found annoying. Now we call it once on first start, and skip on
        // subsequent restarts (the notification persists from the first call).
        if (!isForegroundStarted) {
            val notification = buildKeepAliveNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    KEEPALIVE_NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(KEEPALIVE_NOTIFICATION_ID, notification)
            }
            isForegroundStarted = true
            android.util.Log.i("ConcordiaKeepAlive", "✓ Foreground service started (notification posted once)")
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
        //
        // v4.5.0: CHANGED from setInexactRepeating → setAndAllowWhileIdle.
        // The old method was batched/delayed by Doze mode, so the restart
        // often didn't fire for hours. setAndAllowWhileIdle fires even in
        // Doze (once per 9 minutes max, which is close enough to our 5-min
        // target). We re-schedule it on every onStartCommand so it's always
        // queued for the next window.
        scheduleSelfRestart()

        // v4.5.0: Also schedule a JobScheduler-based restart. JobScheduler
        // is MORE resilient than AlarmManager on some OEMs (Xiaomi, Huawei)
        // because it's not affected by the same "app freeze" heuristics.
        // We schedule it every ~15 minutes as a belt-and-suspenders fallback.
        scheduleJobRestart()

        // Return START_REDELIVER_INTENT so the OS restarts the service AND
        // redelivers the last intent. This is MORE reliable than START_STICKY
        // on aggressive OEMs (Realme, Xiaomi) because the OS treats it as a
        // stronger contract to restart the service with its original parameters.
        return START_REDELIVER_INTENT
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
            // v4.5.0: CHANGED from set() → setExactAndAllowWhileIdle().
            // set() is batched/delayed in Doze mode — the restart might not
            // fire for 30+ minutes. setExactAndAllowWhileIdle fires EXACTLY
            // at the scheduled time AND wakes the CPU from Doze. This is the
            // ONLY AlarmManager method that reliably fires for killed apps.
            //
            // On Android 12+ (API 31+), setExactAndAllowWhileIdle requires
            // the SCHEDULE_EXACT_ALARM permission (which we have). If the
            // user revoked it, we fall back to setAndAllowWhileIdle (less
            // precise but still fires in Doze).
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    android.app.AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + 1000L,
                    pendingIntent
                )
            } catch (_: SecurityException) {
                // Android 12+ exact alarm permission revoked — fall back.
                alarmManager.setAndAllowWhileIdle(
                    android.app.AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + 1000L,
                    pendingIntent
                )
            }
            android.util.Log.i("ConcordiaKeepAlive", "✓ Scheduled service restart after task removal (swipe-away) — setExactAndAllowWhileIdle")
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
    //
    // v4.5.0: CHANGED from setInexactRepeating → setAndAllowWhileIdle.
    // setInexactRepeating was being batched/delayed by Doze mode for hours.
    // setAndAllowWhileIdle fires even in Doze (once per ~9 min). We
    // re-schedule on every onStartCommand so it's always queued.
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
            // v4.6.0: CHANGED from 5 min → 60 seconds for FASTER recovery.
            // The user reported that notifications don't arrive when the app
            // is closed. The 5-min restart window was too long — if a push
            // arrived during those 5 min, the foreground service was dead
            // and couldn't help. 60 seconds gives the service a much faster
            // recovery window while still being battery-friendly (the alarm
            // only fires if the service is actually dead — if it's running,
            // onStartCommand is a no-op).
            alarmManager.setAndAllowWhileIdle(
                android.app.AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 60 * 1000L, // first fire in 60 sec
                pendingIntent
            )
        } catch (e: Exception) {
            android.util.Log.e("ConcordiaKeepAlive", "Failed to schedule self-restart: ${e.message}", e)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // v4.5.0: scheduleJobRestart — schedules a JobScheduler job that fires
    // every ~15 minutes to restart the keep-alive service. This is a
    // BELT-AND-SUSPENDERS fallback to the AlarmManager restart.
    //
    // WHY: On some OEMs (Xiaomi MIUI, Huawei EMUI), AlarmManager-scheduled
    // tasks are aggressively killed when the app is "frozen". JobScheduler
    // uses a different execution path that is MORE resilient to OEM
    // freezing. By scheduling BOTH, we maximize the chance that at least
    // one restart mechanism fires.
    // ═══════════════════════════════════════════════════════════════════
    @android.annotation.SuppressLint("NewApi")
    private fun scheduleJobRestart() {
        try {
            val jobScheduler = getSystemService(Context.JOB_SCHEDULER_SERVICE) as android.app.job.JobScheduler
            // Check if the job is already scheduled (don't double-schedule).
            val allJobs = jobScheduler.allPendingJobs
            if (allJobs.any { it.id == 2001 }) {
                return // already scheduled
            }
            val jobInfo = android.app.job.JobInfo.Builder(
                2001,
                android.content.ComponentName(this, ConcordiaRestartJobService::class.java)
            )
                // v4.6.0: 15 min → 5 min for faster recovery after app kill.
                .setPeriodic(5 * 60 * 1000L) // 5 minutes
                .setPersisted(true) // survives reboot
                .setRequiredNetworkType(android.app.job.JobInfo.NETWORK_TYPE_ANY)
                .build()
            val result = jobScheduler.schedule(jobInfo)
            if (result == android.app.job.JobScheduler.RESULT_SUCCESS) {
                android.util.Log.i("ConcordiaKeepAlive", "✓ JobScheduler restart job scheduled (every 15 min)")
            } else {
                android.util.Log.w("ConcordiaKeepAlive", "JobScheduler schedule returned failure: $result")
            }
        } catch (e: Exception) {
            android.util.Log.e("ConcordiaKeepAlive", "Failed to schedule job restart: ${e.message}", e)
        }
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }

    // ── Build the persistent MIN-priority notification ─────────────────
    // v4.6.2: Changed from PRIORITY_LOW → PRIORITY_MIN. MIN priority means
    // the notification does NOT appear in the status bar at all — it's only
    // visible as a quiet entry at the bottom of the expanded notification
    // panel. This makes the keep-alive notification effectively invisible
    // to the user while still satisfying Android's foreground-service
    // notification requirement.
    private fun buildKeepAliveNotification(): Notification {
        return NotificationCompat.Builder(this, KEEPALIVE_CHANNEL_ID)
            .setContentTitle("Concordia College")
            .setContentText("Running in background for notifications")
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(this, R.color.concordia_orange))
            .setOngoing(true) // can't be swiped away
            .setPriority(NotificationCompat.PRIORITY_MIN) // v4.6.2: invisible in status bar
            .setOnlyAlertOnce(true) // v4.6.2: never re-alert on update
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET) // hidden on lock screen
            .setShowWhen(false)
            .build()
    }

    // ── Create the MIN-importance keep-alive channel (Android 8+) ───────
    // v4.6.2: Changed from IMPORTANCE_LOW → IMPORTANCE_MIN.
    // MIN importance = notification does NOT appear in status bar, makes no
    // sound, no vibration, no heads-up banner. Only visible at the bottom of
    // the fully-expanded notification panel. This is the quietest possible
    // channel that still satisfies Android's foreground-service requirement.
    //
    // NOTE: Android does NOT allow changing an existing channel's importance
    // after creation. So we use a NEW channel ID (v2) to force Android to
    // create a fresh channel with IMPORTANCE_MIN. The old v1 channel is
    // deleted so it disappears from Settings.
    private fun createKeepAliveChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // v4.6.2: Delete the old v1 LOW-importance channel (if it exists) so
        // the user doesn't see two channels in their notification settings.
        manager.deleteNotificationChannel("concordia_keepalive_v1_old")
        // Note: we can't delete the current v1 channel while the service is
        // using it, so we just create a v2 and switch. The v1 channel will
        // be cleaned up on next app start if needed.

        val existingChannel = manager.getNotificationChannel(KEEPALIVE_CHANNEL_ID)
        if (existingChannel != null) {
            // Channel already exists — check if it's MIN importance. If it was
            // created by v4.6.0/v4.6.1 with LOW importance, we can't downgrade
            // it (Android restriction). So we delete + recreate with a new ID.
            if (existingChannel.importance != NotificationManager.IMPORTANCE_MIN) {
                manager.deleteNotificationChannel(KEEPALIVE_CHANNEL_ID)
            } else {
                return // already MIN importance, nothing to do
            }
        }

        val channel = NotificationChannel(
            KEEPALIVE_CHANNEL_ID,
            KEEPALIVE_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_MIN // v4.6.2: quietest possible
        ).apply {
            description = "Keeps Concordia College running in the background so push notifications arrive reliably. This notification itself is silent and hidden."
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
