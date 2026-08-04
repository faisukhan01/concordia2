package com.concordia.concordia_college

import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// ─────────────────────────────────────────────────────────────────────────
// MainActivity — native host for the Flutter app.
//
// Responsibilities:
//   1. `concordia/battery` channel — battery-optimization whitelist.
//   2. `concordia/keepalive` channel — start/stop the foreground service
//      that keeps the app alive on Chinese OEMs (Realme, Xiaomi, etc.).
//   3. `concordia/device` channel — detect the device manufacturer (so the
//      Flutter side can show Realme/Xiaomi-specific setup guidance) and
//      open the proprietary Auto-start settings screen (which standard
//      Android APIs cannot access).
// ─────────────────────────────────────────────────────────────────────────
class MainActivity : FlutterActivity() {

    private val BATTERY_CHANNEL = "concordia/battery"
    private val KEEPALIVE_CHANNEL = "concordia/keepalive"
    private val DEVICE_CHANNEL = "concordia/device"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // ── Battery optimization whitelist ──────────────────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, BATTERY_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isIgnoring" -> result.success(isIgnoringBatteryOptimizations())
                    "requestIgnore" -> {
                        requestIgnoreBatteryOptimizations()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }

        // ── Foreground service (keep-alive) ────────────────────────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, KEEPALIVE_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        startKeepAliveService()
                        result.success(true)
                    }
                    "stop" -> {
                        stopKeepAliveService()
                        result.success(true)
                    }
                    "isRunning" -> result.success(isKeepAliveRunning())
                    else -> result.notImplemented()
                }
            }

        // ── Device manufacturer detection + Auto-start settings ────────
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, DEVICE_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getDeviceInfo" -> {
                        result.success(getDeviceInfoMap())
                    }
                    "openAutoStartSettings" -> {
                        val opened = openAutoStartSettings()
                        result.success(opened)
                    }
                    "openNotificationSettings" -> {
                        openNotificationSettings()
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    // ═══════════════════════════════════════════════════════════════════
    // BATTERY OPTIMIZATION
    // ═══════════════════════════════════════════════════════════════════

    @Suppress("DEPRECATION")
    private fun isIgnoringBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            try {
                val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(fallback)
            } catch (_: Exception) {}
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FOREGROUND SERVICE (KEEP-ALIVE)
    // ═══════════════════════════════════════════════════════════════════

    private fun startKeepAliveService() {
        val intent = Intent(this, ConcordiaKeepAliveService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Android 8+ requires startForegroundService for background-started FG services.
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (_: Exception) {
            // Non-fatal — the app still works without the keep-alive, just with
            // degraded background delivery on aggressive OEMs.
        }
    }

    private fun stopKeepAliveService() {
        try {
            stopService(Intent(this, ConcordiaKeepAliveService::class.java))
        } catch (_: Exception) {}
    }

    private fun isKeepAliveRunning(): Boolean {
        return try {
            val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            @Suppress("DEPRECATION")
            manager.getRunningServices(Integer.MAX_VALUE)
                .any { it.service.className == ConcordiaKeepAliveService::class.java.name }
        } catch (_: Exception) {
            false
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // DEVICE MANUFACTURER DETECTION + AUTO-START SETTINGS
    // ═══════════════════════════════════════════════════════════════════

    private fun getDeviceInfoMap(): Map<String, Any> {
        val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
        val brand = Build.BRAND?.lowercase() ?: ""
        val model = Build.MODEL ?: ""
        val androidVersion = Build.VERSION.RELEASE ?: ""
        val sdkInt = Build.VERSION.SDK_INT

        // Determine the OEM family for targeted guidance.
        val oemFamily = when {
            manufacturer.contains("realme") || brand.contains("realme") -> "realme"
            manufacturer.contains("oppo") || brand.contains("oppo") -> "oppo"
            manufacturer.contains("xiaomi") || brand.contains("xiaomi") ||
                manufacturer.contains("redmi") || brand.contains("redmi") -> "xiaomi"
            manufacturer.contains("huawei") || brand.contains("huawei") ||
                manufacturer.contains("honor") || brand.contains("honor") -> "huawei"
            manufacturer.contains("vivo") || brand.contains("vivo") -> "vivo"
            manufacturer.contains("oneplus") || brand.contains("oneplus") -> "oneplus"
            manufacturer.contains("samsung") || brand.contains("samsung") -> "samsung"
            else -> "other"
        }

        // Chinese OEMs need special setup beyond standard battery optimization.
        val needsAutoStart = oemFamily in listOf("realme", "oppo", "xiaomi", "huawei", "vivo", "oneplus")

        return mapOf(
            "manufacturer" to manufacturer,
            "brand" to brand,
            "model" to model,
            "androidVersion" to androidVersion,
            "sdkInt" to sdkInt,
            "oemFamily" to oemFamily,
            "needsAutoStart" to needsAutoStart,
            "isIgnoringBatteryOptimizations" to isIgnoringBatteryOptimizations(),
            "keepAliveRunning" to isKeepAliveRunning()
        )
    }

    /// Open the proprietary "Auto-start" / "Startup management" settings
    /// screen. Every Chinese OEM has a DIFFERENT intent for this — there is
    /// no standard Android API. We try each known intent until one works.
    /// Returns true if a settings screen was successfully opened.
    private fun openAutoStartSettings(): Boolean {
        val intents = listOf(
            // Realme / ColorOS
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")),
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startupapp.StartupAppNormalListActivity")),
            // Xiaomi / MIUI / HyperOS
            Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            // Oppo
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.FakeActivity")),
            // Vivo / Funtouch OS
            Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")),
            Intent().setComponent(ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")),
            Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
            Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity")),
            // Huawei / EMUI
            Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
            Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")),
            // Samsung
            Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity")),
            // OnePlus (OxygenOS uses ColorOS components on newer versions)
            Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            // Generic fallbacks
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
        )

        for (intent in intents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                return true
            } catch (_: Exception) {
                // This intent didn't work — try the next one.
            }
        }
        return false
    }

    /// Open the app's notification settings (so the user can verify the
    /// notification channel is set to make sound + show as heads-up).
    private fun openNotificationSettings() {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            startActivity(intent)
        } catch (_: Exception) {}
    }
}
