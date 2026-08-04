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
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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
    try {
      final info = await _deviceChannel.invokeMethod<Map>('getDeviceInfo');
      if (info != null) {
        final oem = info['oemFamily'] as String? ?? 'other';
        final needsAutoStart = info['needsAutoStart'] == true;
        debugPrint('[NotificationService] device: ${info['manufacturer']} ${info['model']} (oem=$oem, needsAutoStart=$needsAutoStart)');
        if (needsAutoStart) {
          debugPrint('[NotificationService] ⚠ Chinese OEM detected ($oem). The user MUST enable Auto-start in settings for reliable background delivery.');
        }
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
    await _requestIgnoreBatteryOptimizations();

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
