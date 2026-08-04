package com.concordia.concordia_college

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
//   1. Register the `concordia/battery` MethodChannel so the Dart
//      NotificationService can ask the OS to whitelist the app from battery
//      optimization. This is CRITICAL for WhatsApp-style always-on push
//      delivery on Chinese OEMs (Xiaomi, Huawei, Oppo, Vivo, Realme, OnePlus)
//      which otherwise freeze/kill the app in the background and delay or
//      drop FCM notifications.
//   2. Expose two methods:
//        - "isIgnoring"   → returns true if the app is already whitelisted.
//        - "requestIgnore" → opens the system battery-optimization dialog
//                            for THIS app, so the user can grant it in one tap.
//
// The manifest already declares the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
// permission, so this call is fully supported on Android 6+ (API 23+).
// On stock Android the app is already whitelisted by default, so "isIgnoring"
// returns true and no dialog is ever shown. On aggressive OEMs the dialog
// appears once, the user grants it, and background FCM delivery becomes
// reliable from that point on.
// ─────────────────────────────────────────────────────────────────────────
class MainActivity : FlutterActivity() {

    private val CHANNEL = "concordia/battery"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isIgnoring" -> {
                        result.success(isIgnoringBatteryOptimizations())
                    }
                    "requestIgnore" -> {
                        requestIgnoreBatteryOptimizations()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    /// Returns true if the app is already exempt from battery optimization.
    /// On stock Android this is almost always true (apps are allowed by default).
    /// On aggressive OEMs (Xiaomi, Huawei, Oppo, Vivo) it's false until the user
    /// grants the permission via the system dialog.
    @Suppress("DEPRECATION")
    private fun isIgnoringBatteryOptimizations(): Boolean {
        // Android 6+ (API 23+) supports battery-optimization whitelisting.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    /// Open the system "Battery optimization" screen scoped to THIS app, so the
    /// user can tap "Allow" in one step (no need to find the app in a long list).
    private fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        } catch (e: Exception) {
            // Some OEMs ship without the standard settings action. Fall back to
            // the generic battery-optimization list so the user can still find
            // the app and whitelist it manually.
            try {
                val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(fallback)
            } catch (_: Exception) {
                // If even the fallback fails, there's nothing more we can do —
                // the app still works, just without the battery whitelist.
            }
        }
    }
}
