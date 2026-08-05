package com.concordia.concordia_college

import android.app.job.JobParameters
import android.app.job.JobService
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

// ─────────────────────────────────────────────────────────────────────────
// ConcordiaRestartJobService — a JobScheduler-based service that restarts
// the keep-alive foreground service.
//
// WHY THIS EXISTS (v4.5.0):
//   The user reported that notifications STILL don't arrive when the app is
//   closed (swiped away), even after v4.3.0 added onTaskRemoved + AlarmManager
//   restart. The root cause: on aggressive OEMs (Realme, Xiaomi, Huawei),
//   AlarmManager-scheduled tasks are KILLED when the app is "frozen" (swiped
//   away). The alarm simply never fires.
//
//   JobScheduler uses a DIFFERENT execution path (it's managed by the system
//   server, not the app process) and is MORE resilient to OEM freezing. By
//   scheduling BOTH AlarmManager + JobScheduler, we maximize the chance that
//   at least one restart mechanism fires.
//
//   This is the SAME belt-and-suspenders approach used by WhatsApp, Telegram,
//   and Signal on Chinese OEMs — they all use multiple restart mechanisms.
//
// LIFECYCLE:
//   • Scheduled by ConcordiaKeepAliveService.onStartCommand (every 15 min).
//   • When the job fires, it checks if the keep-alive service is running.
//     If NOT, it starts it.
//   • The job is persisted (survives reboot) and rescheduled automatically
//     by JobScheduler after each fire.
// ─────────────────────────────────────────────────────────────────────────

class ConcordiaRestartJobService : JobService() {

    companion object {
        private const val TAG = "ConcordiaRestartJob"
        const val JOB_ID = 2001
    }

    override fun onStartJob(params: JobParameters?): Boolean {
        Log.i(TAG, "Job fired — checking if keep-alive service is running")

        try {
            if (!isKeepAliveRunning()) {
                Log.w(TAG, "⚠ Keep-alive service is NOT running — restarting it now")
                startKeepAliveService()
            } else {
                Log.i(TAG, "✓ Keep-alive service is already running — no action needed")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check/restart keep-alive service: ${e.message}", e)
        }

        // We've done our work — tell JobScheduler we're done.
        // The job will be rescheduled automatically (setPeriodic).
        jobFinished(params, false)
        return true // work was done on the main thread (quick)
    }

    override fun onStopJob(params: JobParameters?): Boolean {
        // Job was interrupted by the system. Return true so it's rescheduled.
        Log.w(TAG, "Job was interrupted by the system — will reschedule")
        return true
    }

    /// Check if the keep-alive foreground service is currently running.
    /// Uses ActivityManager.getRunningServices() (deprecated on API 26+ but
    /// still works for your OWN app's services).
    @Suppress("DEPRECATION")
    private fun isKeepAliveRunning(): Boolean {
        return try {
            val manager = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            manager.getRunningServices(Integer.MAX_VALUE)
                .any { it.service.className == ConcordiaKeepAliveService::class.java.name }
        } catch (_: Exception) {
            // If we can't check, assume it's NOT running (safe default).
            false
        }
    }

    /// Start the keep-alive foreground service.
    private fun startKeepAliveService() {
        try {
            val serviceIntent = Intent(this, ConcordiaKeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            Log.i(TAG, "✓ Keep-alive service restart triggered")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start keep-alive service: ${e.message}", e)
        }
    }
}
