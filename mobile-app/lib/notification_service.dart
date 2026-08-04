// Concordia College — Push Notification Service (v3.9.0)
//
// Handles:
//   1. Creating the Android notification channel (FIRST — before Firebase)
//   2. Starting the foreground keep-alive service (Realme/Chinese OEM fix)
//   3. Firebase initialization
//   4. Requesting notification permission (Android 13+)
//   5. Getting the FCM device token
//   6. Listening for incoming push messages (foreground + background)
//   7. Showing a local notification banner when a push arrives
//   8. Forwarding the token + tap events to the WebView via JavaScript bridge
//
// ─────────────────────────────────────────────────────────────────────────
// HYBRID FCM PAYLOAD (WhatsApp-style) — v3.8.0+
// ─────────────────────────────────────────────────────────────────────────
// The server sends BOTH a `notification` field AND a `data` field.
//
// BACKGROUND / TERMINATED (app closed):
//   The Android OS ITSELF displays the notification via the system tray using
//   the channel specified in `android.notification.channel_id`. NO Dart code
//   runs. This is the RELIABLE delivery path — it works even when the app is
//   force-killed, because the OS (not the app) is responsible for showing
//   the notification. This is exactly how WhatsApp/Telegram deliver messages.
//
// FOREGROUND (app open):
//   `onMessage` fires. The OS does NOT auto-display a notification when the
//   app is in the foreground — so we show a local notification ourselves via
//   flutter_local_notifications, with sound + vibration + heads-up banner.
//
// ─────────────────────────────────────────────────────────────────────────
// v3.9.0 CHANGES (Realme / Chinese OEM reliability):
// ─────────────────────────────────────────────────────────────────────────
//   1. CHANNEL CREATED FIRST — before Firebase.initializeApp(). If Firebase
//      init hangs or fails (network issue, misconfigured google-services.json),
//      the channel STILL gets created. Without the channel, the OS silently
//      DROPS all background FCM notifications. This was a critical bug: if
//      the app was killed during splash while Firebase was still initializing,
//      the channel never existed, and NO notifications were ever shown.
//
//   2. FOREGROUND SERVICE — we start ConcordiaKeepAliveService (a native
//      Android foreground service) immediately after channel creation. This
//      keeps the app process alive so Chinese OEMs (Realme, Xiaomi, Huawei,
//      Oppo, Vivo, OnePlus) can't freeze/kill it. This is the SAME mechanism
//      WhatsApp/Telegram use for reliable push delivery on those devices.
//
//   3. DEVICE DETECTION — we expose device manufacturer info (Realme, Xiaomi,
//      etc.) to the web app via a MethodChannel so it can show OEM-specific
//      setup guidance (e.g., "enable Auto-start" on Realme).
//
//   4. RESILIENT INIT — each step is in its own try/catch so a failure in
//      one step doesn't block the others. The channel is created even if
//      Firebase fails entirely.
//
// ─────────────────────────────────────────────────────────────────────────
// v4.0.0 CHANGES — BULLETPROOF TOKEN REGISTRATION (fixes "no notifications"):
// ─────────────────────────────────────────────────────────────────────────
//   ROOT CAUSE: The FCM token was not being reliably registered to the
//   logged-in user's account. The web app's fcm-bridge polled for the token
//   for only 60 seconds after the portal mounted. If the user wasn't logged
//   in within those 60s, OR if Flutter delivered the token slightly late,
//   the token was NEVER registered. The server then had no token for that
//   user → announcements/fees pushes were silently discarded (the in-app
//   notification row was still saved, but no push was delivered).
//
//   FIX:
//   1. PERIODIC TOKEN RE-PUSH (every 60s) — Flutter re-fetches the FCM token
//      and pushes it to the WebView every 60 seconds. This handles the case
//      where the WebView reloaded while in the background (common on Realme)
//      and lost the previously-injected token. Combined with the web app's
//      forever-poll, this GUARANTEES the token is registered within seconds
//      of the user logging in, no matter the timing.
//
//   2. The web app's fcm-bridge (fcm-bridge.ts) now polls FOREVER (every 60s
//      after the initial 2-minute aggressive poll) while the user is logged
//      in, and re-registers on every visibilitychange event. See the
//      fcm-bridge.ts header for details.
//
//   3. The server now logs prominently when a push is sent to a user with
//      ZERO tokens — this is the #1 diagnostic signal that the token isn't
//      registered.
// ─────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

// v4.5.0: Global navigator key — used by NotificationService to show the
// OEM settings dialog (Auto-start + battery optimization) over the WebView.
// Declared here (not in main.dart) to avoid circular imports between
// main.dart and app.dart. Both files import it from here.
final GlobalKey<NavigatorState> concordiaNavigatorKey = GlobalKey<NavigatorState>();

// MUST be a top-level function (not a class method) so the Android OS can
// call it when a push arrives while the app is in the background/terminated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Ensure Firebase is initialized in the background isolate.
  await Firebase.initializeApp();

  // Extract title + body. The server sends them in `data` (data-only payload).
  // Fall back to `message.notification` for backward compat with older pushes.
  final data = message.data;
  final title = (data['title'] as String?)?.isNotEmpty == true
      ? data['title'] as String
      : (message.notification?.title ?? 'Concordia College');
  final body = (data['body'] as String?)?.isNotEmpty == true
      ? data['body'] as String
      : (message.notification?.body ?? '');

  try {
    final flutterLocalNotifications = FlutterLocalNotificationsPlugin();

    // CRITICAL: Initialize the plugin in the background isolate too.
    const androidInit = AndroidInitializationSettings('@drawable/ic_notification');
    await flutterLocalNotifications.initialize(
      const InitializationSettings(android: androidInit),
    );

    // Delete OLD channels (v1, v2, v3) so they disappear from Android settings.
    final bgAndroidPlugin = flutterLocalNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await bgAndroidPlugin?.deleteNotificationChannel('concordia_notifications');
    await bgAndroidPlugin?.deleteNotificationChannel('concordia_notifications_v2');
    await bgAndroidPlugin?.deleteNotificationChannel('concordia_notifications_v3');

    // Create the FRESH v4 channel (sound + vibration + high importance).
    await bgAndroidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        'concordia_notifications_v4',
        'Concordia Notifications',
        description:
            'Announcements, exams, marks, attendance, and fee reminders from Concordia College.',
        importance: Importance.high,
        playSound: true,
        enableVibration: true,
        showBadge: true,
      ),
    );

    // SHOW the local notification as a fallback.
    await flutterLocalNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          'concordia_notifications_v4',
          'Concordia Notifications',
          channelDescription:
              'Announcements, exams, marks, attendance, and fee reminders from Concordia College.',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@drawable/ic_notification',
          color: Color(0xFFF26522),
          playSound: true,
          enableVibration: true,
          fullScreenIntent: false,
          category: AndroidNotificationCategory.message,
          visibility: NotificationVisibility.public,
        ),
      ),
      payload: jsonEncode(data),
    );
  } catch (e) {
    debugPrint('[bg] failed to show notification: $e');
  }
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  // The Android notification channel ID — MUST match the one we set in the
  // FCM payload on the server AND in the AndroidManifest.xml.
  static const String _channelId = 'concordia_notifications_v4';
  static const String _channelName = 'Concordia Notifications';
  static const String _channelDesc =
      'Announcements, exams, marks, attendance, and fee reminders from Concordia College.';

  // JS callback channels.
  static const MethodChannel _channel = MethodChannel('concordia/fcm');
  static const MethodChannel _batteryChannel =
      MethodChannel('concordia/battery');
  static const MethodChannel _keepAliveChannel =
      MethodChannel('concordia/keepalive');
  static const MethodChannel _deviceChannel =
      MethodChannel('concordia/device');

  bool _initialized = false;
  // v4.0.0: Periodic timer that re-pushes the FCM token to the WebView
  // every 60 seconds. This handles the case where the WebView reloaded
  // while in the background (common on Realme/Chinese OEMs that freeze
  // apps) and lost the previously-injected token. Without this, the web
  // app's fcm-bridge would have no token to register with the backend,
  // and push notifications would silently fail.
  Timer? _tokenRePushTimer;

  // v4.5.0: Navigator key — used to show the OEM settings dialog (Auto-start
  // + battery optimization) over the WebView. Set from app.dart via
  // setNavigatorKey() before init() is called.
  GlobalKey<NavigatorState>? _navigatorKey;

  /// Set the navigator key so we can show dialogs over the WebView.
  void setNavigatorKey(GlobalKey<NavigatorState>? key) {
    _navigatorKey = key;
  }

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: CREATE THE NOTIFICATION CHANNEL — FIRST, BEFORE ANYTHING ELSE.
    // ═══════════════════════════════════════════════════════════════════
    // This is the MOST CRITICAL step. If the channel doesn't exist when a
    // background FCM push arrives, the Android OS SILENTLY DROPS the
    // notification (it can't find the channel_id referenced in the FCM
    // payload). By creating the channel BEFORE Firebase init, we guarantee
    // it exists even if Firebase fails to initialize (network issue, missing
    // config, etc.).
    //
    // We also DELETE the old v1/v2/v3 channels here (not just in the main
    // init below) so they're cleaned up as early as possible.
    try {
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();
      // Delete old channels (no-op if they don't exist).
      await androidPlugin?.deleteNotificationChannel('concordia_notifications');
      await androidPlugin?.deleteNotificationChannel('concordia_notifications_v2');
      await androidPlugin?.deleteNotificationChannel('concordia_notifications_v3');
      // Create the fresh v4 channel with sound + vibration + high importance.
      await androidPlugin?.createNotificationChannel(
        const AndroidNotificationChannel(
          _channelId,
          _channelName,
          description: _channelDesc,
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
          showBadge: true,
        ),
      );
      debugPrint('[NotificationService] ✓ v4 notification channel created (early)');
    } catch (e) {
      debugPrint('[NotificationService] channel setup failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: INITIALIZE LOCAL NOTIFICATIONS PLUGIN (for foreground banners).
    // ═══════════════════════════════════════════════════════════════════
    try {
      const androidInit = AndroidInitializationSettings('@drawable/ic_notification');
      const iosInit = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );
      await _localNotifications.initialize(
        const InitializationSettings(android: androidInit, iOS: iosInit),
        onDidReceiveNotificationResponse: _onNotificationTapped,
      );
    } catch (e) {
      debugPrint('[NotificationService] local notif init failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: START THE FOREGROUND KEEP-ALIVE SERVICE.
    // ═══════════════════════════════════════════════════════════════════
    // This is the #1 fix for Realme / Chinese OEMs. The foreground service
    // keeps the app process alive so the OEM can't freeze/kill it. Without
    // this, Realme UI aggressively kills the app in the background and even
    // the OS-tray FCM notification path can be delayed or dropped.
    //
    // The service shows a low-priority persistent notification ("Concordia
    // notifications are active") that does NOT make a sound. This is the
    // same mechanism WhatsApp/Telegram use.
    try {
      await _keepAliveChannel.invokeMethod<bool>('start');
      debugPrint('[NotificationService] ✓ foreground keep-alive service started');
    } catch (e) {
      debugPrint('[NotificationService] keep-alive service failed to start: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: DETECT DEVICE MANUFACTURER (for Realme/Xiaomi guidance).
    // ═══════════════════════════════════════════════════════════════════
    // v4.5.0: CRITICAL FIX — we now ACTUALLY PROMPT THE USER to enable
    // Auto-start on Chinese OEMs. v4.3.0 only logged a debug message,
    // which meant the user never knew they needed to enable this setting.
    // Without Auto-start, Realme/Xiaomi KILL the app process when swiped
    // away AND block AlarmManager/JobScheduler restarts → NO notifications
    // when the app is closed. This is THE root cause of the user's bug.
    String? _detectedOem;
    bool _needsAutoStart = false;
    try {
      final info = await _deviceChannel.invokeMethod<Map>('getDeviceInfo');
      if (info != null) {
        final oem = info['oemFamily'] as String? ?? 'other';
        final needsAutoStart = info['needsAutoStart'] == true;
        _detectedOem = oem;
        _needsAutoStart = needsAutoStart;
        debugPrint('[NotificationService] device: ${info['manufacturer']} ${info['model']} (oem=$oem, needsAutoStart=$needsAutoStart)');
      }
    } catch (e) {
      debugPrint('[NotificationService] device detection failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: INITIALIZE FIREBASE (in its own try/catch — must NOT block
    // the channel creation above if it fails).
    // ═══════════════════════════════════════════════════════════════════
    try {
      await Firebase.initializeApp();
      debugPrint('[NotificationService] ✓ Firebase initialized');
    } catch (e) {
      debugPrint('[NotificationService] Firebase init failed: $e — channel is still active, but FCM token + push will not work until Firebase is configured.');
      // Even if Firebase fails, we've already created the channel + started
      // the keep-alive service. The app still works; just no push notifications.
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 6: REGISTER THE BACKGROUND HANDLER.
    // ═══════════════════════════════════════════════════════════════════
    try {
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    } catch (e) {
      debugPrint('[NotificationService] background handler registration failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 7: REQUEST PERMISSIONS (Android 13+ POST_NOTIFICATIONS + FCM).
    // ═══════════════════════════════════════════════════════════════════
    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        announcement: false,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[NotificationService] WARNING: User denied FCM notification permission. Pushes will NOT show.');
      }
    } catch (e) {
      debugPrint('[NotificationService] FCM permission request failed: $e');
    }

    // Also request via the local notifications plugin (Android 13+ dialog).
    try {
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();
      final granted = await androidPlugin?.requestNotificationsPermission();
      if (granted != true) {
        debugPrint('[NotificationService] WARNING: User denied local notification permission.');
      }
    } catch (e) {
      debugPrint('[NotificationService] local notif permission request failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 8: REQUEST BATTERY-OPTIMIZATION WHITELIST (Chinese OEMs).
    // ═══════════════════════════════════════════════════════════════════
    // v4.5.0: We now check the ACTUAL state (isIgnoringBatteryOptimizations)
    // and defer the prompt to Step 14 where we show a combined dialog for
    // both battery optimization AND Auto-start. This gives the user a clear
    // explanation of WHY these settings are needed (like WhatsApp) rather
    // than silently opening the system dialog.
    bool _batteryOptDenied = false;
    try {
      final already = await _batteryChannel.invokeMethod<bool>('isIgnoring');
      if (already != true) {
        _batteryOptDenied = true;
        debugPrint('[NotificationService] ⚠ Battery optimization is NOT ignored — will prompt user');
      }
    } catch (e) {
      debugPrint('[NotificationService] battery-opt check failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 9: GET THE FCM TOKEN + REGISTER IT.
    // ═══════════════════════════════════════════════════════════════════
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        _sendTokenToWeb(token);
        debugPrint('[NotificationService] ✓ FCM token obtained: ${token.substring(0, 20)}...');
      } else {
        debugPrint('[NotificationService] WARNING: FCM token is null — push will not work.');
      }
      FirebaseMessaging.instance.onTokenRefresh.listen(_sendTokenToWeb);
    } catch (e) {
      debugPrint('[NotificationService] getToken failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 10: LISTEN FOR FOREGROUND MESSAGES.
    // ═══════════════════════════════════════════════════════════════════
    try {
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);
    } catch (e) {
      debugPrint('[NotificationService] onMessage listener failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 11: HANDLE NOTIFICATION TAPS (app opened from notification).
    // ═══════════════════════════════════════════════════════════════════
    try {
      final initialMessage =
          await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        _onNotificationTappedData(initialMessage.data);
      }
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _onNotificationTappedData(message.data);
      });
    } catch (e) {
      debugPrint('[NotificationService] notification tap handler failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 12: TELL THE WEB APP FCM IS READY.
    // ═══════════════════════════════════════════════════════════════════
    try {
      await _channel.invokeMethod('onFcmReady');
    } catch (e) {
      debugPrint('[NotificationService] onFcmReady failed: $e');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 13 (v4.0.0): START PERIODIC TOKEN RE-PUSH.
    // ═══════════════════════════════════════════════════════════════════
    // Every 60 seconds, re-fetch the FCM token and push it to the WebView.
    // This is critical for Realme/Chinese OEMs that freeze the app in the
    // background — when the OS thaws the app, the WebView may have reloaded
    // and lost the injected token. Without this periodic re-push, the web
    // app's fcm-bridge would have no token to register, and the backend
    // would have no token to send pushes to → "no notifications on mobile".
    _tokenRePushTimer?.cancel();
    _tokenRePushTimer = Timer.periodic(const Duration(seconds: 60), (_) async {
      try {
        final token = await FirebaseMessaging.instance.getToken();
        if (token != null) {
          _sendTokenToWeb(token);
        }
      } catch (e) {
        debugPrint('[NotificationService] periodic token re-push failed: $e');
      }
    });
    debugPrint('[NotificationService] ✓ periodic token re-push started (every 60s)');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 14 (v4.5.0): PROMPT FOR OEM-SPECIFIC SETTINGS (Auto-start +
    // battery optimization). THIS IS THE CRITICAL FIX.
    // ═══════════════════════════════════════════════════════════════════
    // On Chinese OEMs (Realme, Xiaomi, Huawei, Oppo, Vivo, OnePlus), the OS
    // AGGRESSIVELY kills background apps when swiped away — EVEN with a
    // foreground service + AlarmManager + JobScheduler. The ONLY way to
    // survive is if the user explicitly whitelists the app in:
    //   1. Battery Optimization → "Don't optimize" (standard Android)
    //   2. Auto-start / Startup Manager (OEM-specific, Realme ColorOS)
    //
    // v4.3.0 detected the OEM but NEVER prompted the user — so they never
    // knew to enable these settings. This is THE root cause of "no
    // notifications when app is closed".
    //
    // We now show a Flutter dialog explaining both settings, with buttons
    // to open each settings screen. We persist a flag in SharedPreferences
    // so we only show the dialog ONCE per version (not every launch).
    // ──────────────────────────────────────────────────────────────────
    // We schedule this with a 2-second delay so the WebView + Flutter UI
    // are fully rendered before the dialog appears (otherwise the dialog
    // can appear over a blank screen on cold start).
    Future.delayed(const Duration(seconds: 2), () {
      _promptForOemSettingsIfNeeded(
        oem: _detectedOem,
        needsAutoStart: _needsAutoStart,
        batteryOptDenied: _batteryOptDenied,
      );
    });
  }

  /// Pass the FCM token to the web app (running inside the WebView) so it can
  /// POST it to /api/device-tokens linked to the logged-in user.
  void _sendTokenToWeb(String token) {
    try {
      _channel.invokeMethod('onToken', {'token': token});
    } catch (e) {
      debugPrint('[NotificationService] failed to send token to web: $e');
    }
  }

  /// Ask the OS to whitelist this app from battery optimization.
  Future<void> _requestIgnoreBatteryOptimizations() async {
    try {
      final already = await _batteryChannel.invokeMethod<bool>('isIgnoring');
      if (already == true) return;
      await _batteryChannel.invokeMethod<void>('requestIgnore');
    } catch (e) {
      debugPrint('[NotificationService] battery-opt request failed: $e');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // v4.5.0: PROMPT FOR OEM-SPECIFIC SETTINGS
  // ═══════════════════════════════════════════════════════════════════════
  // Shows a Flutter dialog explaining that the user MUST enable:
  //   1. Battery Optimization whitelist (standard Android)
  //   2. Auto-start (Realme/Xiaomi/Huawei/Oppo/Vivo/OnePlus only)
  //
  // Without these, the app is KILLED when swiped away and notifications
  // DON'T arrive. This is the #1 fix for the user's bug.
  //
  // The dialog has buttons to open each settings screen. We persist a flag
  // in SharedPreferences so we only show this ONCE per app version (the
  // flag key includes the version string, so upgrading to a new version
  // re-shows the dialog once).
  // ═══════════════════════════════════════════════════════════════════════
  Future<void> _promptForOemSettingsIfNeeded({
    String? oem,
    bool needsAutoStart = false,
    bool batteryOptDenied = false,
  }) async {
    // If both settings are already satisfied, no prompt needed.
    if (!needsAutoStart && !batteryOptDenied) {
      debugPrint('[NotificationService] ✓ All OEM settings already satisfied — no prompt needed');
      return;
    }

    try {
      final prefs = await SharedPreferences.getInstance();
      // Include the version in the key so a new version re-prompts once.
      final flagKey = 'v4.5.0_oem_prompt_shown';
      final alreadyShown = prefs.getBool(flagKey) ?? false;
      if (alreadyShown) {
        debugPrint('[NotificationService] OEM prompt already shown for this version — skipping');
        return;
      }

      // We need a BuildContext to show a dialog. Get it from the navigator key.
      final context = _navigatorKey?.currentContext;
      if (context == null) {
        debugPrint('[NotificationService] No navigator context — cannot show OEM prompt dialog');
        return;
      }

      // Mark as shown BEFORE showing the dialog (so we don't show it twice
      // if init() runs again before the dialog is dismissed).
      await prefs.setBool(flagKey, true);

      // Build the dialog content based on what's needed.
      final List<String> steps = [];
      if (batteryOptDenied) {
        steps.add(
          '1. Battery Optimization — tap "Enable Battery Whitelist" below, '
          'then choose "Allow" / "Don\'t optimize" for Concordia College.',
        );
      }
      if (needsAutoStart) {
        final oemLabel = _oemDisplayName(oem);
        steps.add(
          '${batteryOptDenied ? '2' : '1'}. Auto-start ($oemLabel) — tap "Open Auto-start Settings" below, '
          'then find Concordia College in the list and enable it.',
        );
      }

      // Show the dialog.
      if (!context.mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false, // user MUST tap a button
        builder: (dialogContext) {
          return AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.notifications_active, color: Color(0xFFF26522)),
                SizedBox(width: 8),
                Expanded(child: Text('Enable Notifications')),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'To receive notifications when the app is closed (like WhatsApp), '
                    'you need to enable the following setting(s):',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 12),
                  ...steps.map((s) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.check_circle, size: 16, color: Color(0xFFF26522)),
                        const SizedBox(width: 8),
                        Expanded(child: Text(s, style: const TextStyle(fontSize: 13))),
                      ],
                    ),
                  )),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF26522).withOpacity(0.08),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFF26522).withOpacity(0.2)),
                    ),
                    child: const Text(
                      '⚠ Without these settings, your phone will kill the app when '
                      'closed and you will NOT receive notifications.',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              if (needsAutoStart)
                TextButton(
                  onPressed: () {
                    openAutoStartSettings();
                  },
                  child: const Text('Open Auto-start Settings'),
                ),
              if (batteryOptDenied)
                TextButton(
                  onPressed: () {
                    _requestIgnoreBatteryOptimizations();
                  },
                  child: const Text('Enable Battery Whitelist'),
                ),
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFF26522),
                ),
                child: const Text('I\'ve done it'),
              ),
            ],
          );
        },
      );
      debugPrint('[NotificationService] ✓ OEM settings prompt shown');
    } catch (e) {
      debugPrint('[NotificationService] OEM prompt failed: $e');
    }
  }

  /// Convert the OEM family code to a user-friendly display name.
  String _oemDisplayName(String? oem) {
    switch (oem) {
      case 'realme': return 'Realme';
      case 'oppo': return 'Oppo';
      case 'xiaomi': return 'Xiaomi / MIUI';
      case 'huawei': return 'Huawei / EMUI';
      case 'vivo': return 'Vivo';
      case 'oneplus': return 'OnePlus';
      case 'samsung': return 'Samsung';
      default: return 'your device';
    }
  }

  /// Foreground message handler — shows a local notification banner.
  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    final data = message.data;

    final title = (data['title'] as String?)?.isNotEmpty == true
        ? data['title'] as String
        : (notification?.title ?? 'Concordia College');
    final body = (data['body'] as String?)?.isNotEmpty == true
        ? data['body'] as String
        : (notification?.body ?? '');

    _localNotifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: _channelDesc,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@drawable/ic_notification',
          color: const Color(0xFFF26522),
          playSound: true,
          enableVibration: true,
          fullScreenIntent: false,
          category: AndroidNotificationCategory.message,
          visibility: NotificationVisibility.public,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(data),
    );
  }

  /// Called when the user taps a local notification.
  void _onNotificationTapped(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null) return;
    try {
      final data = jsonDecode(payload) as Map<String, dynamic>;
      _onNotificationTappedData(data);
    } catch (e) {
      debugPrint('[NotificationService] failed to parse payload: $e');
    }
  }

  /// Forward the tap event to the web app.
  void _onNotificationTappedData(Map<String, dynamic> data) {
    try {
      _channel.invokeMethod('onNotificationTap', {'data': data});
    } catch (e) {
      debugPrint('[NotificationService] failed to forward tap: $e');
    }
  }

  /// Unregister the device token (called on sign-out).
  Future<void> unregisterToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await FirebaseMessaging.instance.deleteToken();
      }
    } catch (e) {
      debugPrint('[NotificationService] failed to unregister: $e');
    }
  }

  /// Public method to re-register the token (called on app resume).
  /// Re-fetches the token and pushes it to the web app in case the WebView
  /// reloaded and lost the previous injection.
  ///
  /// v4.0.0: Also ensures the periodic token re-push timer is running.
  /// If it was cancelled (e.g., by a hot reload), this restarts it.
  Future<void> reRegisterToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        _sendTokenToWeb(token);
      }
      // Ensure the periodic timer is running (it might have been cancelled).
      if (_tokenRePushTimer == null || !_tokenRePushTimer!.isActive) {
        _tokenRePushTimer?.cancel();
        _tokenRePushTimer = Timer.periodic(const Duration(seconds: 60), (_) async {
          try {
            final t = await FirebaseMessaging.instance.getToken();
            if (t != null) {
              _sendTokenToWeb(t);
            }
          } catch (e) {
            debugPrint('[NotificationService] periodic token re-push failed: $e');
          }
        });
        debugPrint('[NotificationService] ✓ periodic token re-push restarted on resume');
      }
    } catch (e) {
      debugPrint('[NotificationService] re-register failed: $e');
    }
  }

  /// Returns the device manufacturer info (for Realme/Xiaomi guidance).
  /// Called by the web app via the JS bridge.
  Future<Map<String, dynamic>?> getDeviceInfo() async {
    try {
      final info = await _deviceChannel.invokeMethod<Map>('getDeviceInfo');
      if (info != null) {
        return Map<String, dynamic>.from(info);
      }
    } catch (e) {
      debugPrint('[NotificationService] getDeviceInfo failed: $e');
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // v4.2.0 — LOCAL NOTIFICATION FALLBACK (bulletproof delivery)
  // ═══════════════════════════════════════════════════════════════════════
  // Called by the WebView shell (app.dart) when the web app's notification
  // poller detects a new notification in the database. We show a LOCAL
  // system notification via flutter_local_notifications — the SAME plugin +
  // channel (concordia_notifications_v4) used for FCM foreground messages.
  //
  // This is the BULLETPROOF fallback: it works EVEN IF FCM is completely
  // broken, because it only requires:
  //   1. The WebView to be running (app open or background with keep-alive)
  //   2. The notification to be persisted in the DB (always happens)
  //
  // The user sees the notification on the lock screen + notification shade,
  // IDENTICAL to how the keep-alive service notification appears.
  // ═══════════════════════════════════════════════════════════════════════
  Future<void> showLocalNotification(String title, String body, String dataJson) async {
    try {
      Map<String, dynamic> data = {};
      try {
        data = jsonDecode(dataJson) as Map<String, dynamic>;
      } catch (_) {}

      // Use a unique ID per notification (based on timestamp) so multiple
      // notifications don't overwrite each other.
      final notifId = DateTime.now().millisecondsSinceEpoch ~/ 1000;

      await _localNotifications.show(
        notifId,
        title,
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _channelId,
            _channelName,
            channelDescription: _channelDesc,
            importance: Importance.high,
            priority: Priority.high,
            icon: '@drawable/ic_notification',
            color: const Color(0xFFF26522),
            playSound: true,
            enableVibration: true,
            fullScreenIntent: false,
            category: AndroidNotificationCategory.message,
            visibility: NotificationVisibility.public,
          ),
          iOS: const DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
          ),
        ),
        payload: dataJson,
      );
      debugPrint('[NotificationService] ✓ local notification shown: "$title"');
    } catch (e) {
      debugPrint('[NotificationService] showLocalNotification failed: $e');
    }
  }

  /// Opens the proprietary Auto-start settings screen (Realme/Xiaomi/Huawei).
  /// Returns true if a settings screen was opened.
  Future<bool> openAutoStartSettings() async {
    try {
      final result = await _deviceChannel.invokeMethod<bool>('openAutoStartSettings');
      return result == true;
    } catch (e) {
      debugPrint('[NotificationService] openAutoStartSettings failed: $e');
      return false;
    }
  }
}
