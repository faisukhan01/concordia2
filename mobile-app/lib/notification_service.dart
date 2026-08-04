// Concordia College — Push Notification Service
//
// Handles:
//   1. Firebase initialization
//   2. Requesting notification permission (Android 13+)
//   3. Getting the FCM device token
//   4. Creating the notification channel (Android)
//   5. Listening for incoming push messages (foreground + background)
//   6. Showing a local notification banner when a push arrives
//   7. Forwarding the token + tap events to the WebView via JavaScript bridge
//
// The token is passed to the web app via `window.concordiaNative.registerToken(token)`,
// which the web app's api.ts calls to POST /api/device-tokens.
//
// ─────────────────────────────────────────────────────────────────────────
// HYBRID FCM PAYLOAD (WhatsApp-style) — v3.8.0
// ─────────────────────────────────────────────────────────────────────────
// The server sends BOTH a `notification` field AND a `data` field.
//
// BACKGROUND / TERMINATED (app closed):
//   The Android OS ITSELF displays the notification via the system tray using
//   the channel specified in `android.notification.channel_id` (which we
//   create at app startup with sound + high importance). NO Dart code runs.
//   This is the RELIABLE delivery path — it works even when the app is
//   force-killed, because the OS (not the app) is responsible for showing
//   the notification. This is exactly how WhatsApp/Telegram deliver messages.
//
// FOREGROUND (app open):
//   `onMessage` fires. The OS does NOT auto-display a notification when the
//   app is in the foreground — so we show a local notification ourselves via
//   flutter_local_notifications, with sound + vibration + heads-up banner.
//
// WHY NOT data-only (v3.6.1's approach)?
//   Data-only required the app's background isolate to spin up so Dart could
//   call `flutterLocalNotifications.show()`. On real Android devices —
//   especially Chinese OEMs (Xiaomi, Huawei, Oppo, Vivo) — the OS aggressively
//   KILLS background isolates. The isolate never spun up, the local
//   notification was never shown, and the user saw NOTHING. The hybrid
//   approach delegates display to the OS, which always works.
//
// CHANNEL IMMUTABILITY:
//   Android does NOT let apps change a channel's settings after creation.
//   v3.7.0 used `concordia_notifications_v3`. v3.8.0 introduces `_v4` —
//   a FRESH channel ID that forces Android to create a new channel with the
//   correct sound + high importance. The old v1/v2/v3 channels are deleted at
//   startup so they disappear from Settings.
//
// BATTERY OPTIMIZATION (Chinese OEMs):
//   v3.8.0 also prompts the user to whitelist the app from battery
//   optimization. Without this, Xiaomi/Huawei/Oppo/Vivo aggressively kill the
//   app in the background and even the OS-tray notification path can be
//   delayed or dropped. This is the single most important setting for
//   WhatsApp-style always-on delivery on those devices.
//
// The background handler (`_firebaseMessagingBackgroundHandler`) is still
// registered as a fallback — if the OS does spin up the isolate (e.g. on
// stock Android with no battery optimization), it will ALSO show a local
// notification. This is harmless (Android dedupes by notification ID) and
// ensures the notification is shown even if the system-tray path fails.
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
    // Without this, `show()` may silently fail in the background isolate.
    const androidInit = AndroidInitializationSettings('@drawable/ic_notification');
    await flutterLocalNotifications.initialize(
      const InitializationSettings(android: androidInit),
    );

    // Delete OLD channels (v1, v2, v3) so they disappear from Android settings.
    // Android does NOT let apps change a channel's settings after creation,
    // so the only fix for a channel created with broken sound by an older app
    // version is to use a NEW channel ID (v4) and delete the old ones.
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

    // SHOW the local notification as a fallback. With the hybrid payload,
    // the Android OS already shows a system-tray notification when the app
    // is in the background/terminated. But on some devices (or if the
    // system-tray path fails), the background isolate ALSO runs — so we show
    // a local notification here too. Android dedupes by notification ID, and
    // since we use a unique timestamp ID, this just ensures the notification
    // is always visible.
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
  // FCM payload on the server (`android.notification.channel_id`) AND in the
  // AndroidManifest.xml (`com.google.firebase.messaging.default_notification_channel_id`).
  //
  // v4 (v3.8.0): We switched from `concordia_notifications_v3` →
  // `concordia_notifications_v4`. Android does NOT let apps change a channel's
  // settings after creation, so each release that needs to correct sound
  // settings uses a FRESH channel ID. The old v1/v2/v3 channels are deleted
  // at startup so they disappear from Settings, and a new v4 channel is
  // created with the correct sound + high importance.
  static const String _channelId = 'concordia_notifications_v4';
  static const String _channelName = 'Concordia Notifications';
  static const String _channelDesc =
      'Announcements, exams, marks, attendance, and fee reminders from Concordia College.';

  // A JS callback the web app can set to receive the token + tap events.
  // We invoke it via the WebView's JavaScript channel.
  static const MethodChannel _channel = MethodChannel('concordia/fcm');

  // Dedicated channel for the battery-optimization request. We use a separate
  // channel so the native MainActivity handler is cleanly scoped to just this
  // one platform call (no risk of method-name collisions with the FCM bridge).
  static const MethodChannel _batteryChannel =
      MethodChannel('concordia/battery');

  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    try {
      // 1. Initialize Firebase
      await Firebase.initializeApp();

      // 2. Create the Android notification channel (required for Android 8+).
      //    Without this, notifications are silently dropped on Android 8+.
      //    We use Importance.high so the notification makes a sound + appears as a heads-up banner.
      //    We DELETE the old v1/v2/v3 channels so they don't confuse the user
      //    in Android settings (they just disappear from the list), AND so
      //    we bypass Android's channel immutability restriction (if v3 was
      //    created by an older app version with broken sound, we can't fix
      //    it — we can only use a new v4 channel ID).
      try {
        final androidPlugin = _localNotifications
            .resolvePlatformSpecificImplementation<
                AndroidFlutterLocalNotificationsPlugin>();
        // Delete old v1/v2/v3 channels (no-op if they don't exist).
        await androidPlugin?.deleteNotificationChannel('concordia_notifications');
        await androidPlugin?.deleteNotificationChannel('concordia_notifications_v2');
        await androidPlugin?.deleteNotificationChannel('concordia_notifications_v3');
        // Create the fresh v4 channel with sound + vibration.
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
      } catch (e) {
        debugPrint('[NotificationService] channel setup failed: $e');
      }

      // 3. Initialize the local notifications plugin (for foreground banners).
      //    Use ic_notification (the white bell silhouette) for the status bar icon.
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

      // 4. Register the background handler.
      FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

      // 5. Request permission (Android 13+ shows a prompt; older versions auto-grant).
      //    CRITICAL: On Android 13+, if the user denies this, NO notifications will show.
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

      // 5b. ALSO request permission via the local notifications plugin.
      //     On Android 13+, this explicitly triggers the POST_NOTIFICATIONS dialog.
      //     Some devices grant FCM permission but NOT local notification permission,
      //     which means foreground banners + sounds won't show. This covers that gap.
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

      // 5c. CRITICAL — Request battery-optimization whitelist (WhatsApp-style).
      //     On Chinese OEMs (Xiaomi, Huawei, Oppo, Vivo, Realme, OnePlus) the OS
      //     AGGRESSIVELY kills background apps to save battery. Even with a hybrid
      //     FCM payload, the OS may delay or drop background notifications if the
      //     app is battery-optimized. Asking the user to whitelist the app is the
      //     single most impactful setting for reliable always-on delivery.
      //     This is a no-op on stock Android (it auto-grants) and only prompts on
      //     devices that actually restrict background execution.
      await _requestIgnoreBatteryOptimizations();

      // 6. Get the FCM token + register it. Also listen for token refresh.
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        _sendTokenToWeb(token);
      }
      FirebaseMessaging.instance.onTokenRefresh.listen(_sendTokenToWeb);

      // 7. Listen for foreground messages (app is open).
      //    The OS does NOT show a banner automatically when the app is in the
      //    foreground — we have to show it ourselves.
      FirebaseMessaging.onMessage.listen(_onForegroundMessage);

      // 8. Listen for when the user taps a notification that opened the app.
      final initialMessage =
          await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        _onNotificationTappedData(initialMessage.data);
      }

      // 9. Listen for when a notification tap brings the app from background to foreground.
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _onNotificationTappedData(message.data);
      });

      // 10. Tell the web app that FCM is ready (so it can show the right UI).
      try {
        await _channel.invokeMethod('onFcmReady');
      } catch (e) {
        debugPrint('[NotificationService] onFcmReady failed: $e');
      }
    } catch (e) {
      // Fail silently — the app still works without notifications. We just log.
      debugPrint('[NotificationService] init failed: $e');
    }
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
  ///
  /// On stock Android this is a no-op (the app is already allowed). On
  /// aggressive OEMs (Xiaomi, Huawei, Oppo, Vivo, Realme, OnePlus), it pops
  /// the system "Allow background activity" dialog. Without this, those OEMs
  /// will freeze or kill the app in the background — and even though the FCM
  /// hybrid payload is displayed by the OS, the delivery can be delayed by
  /// minutes or dropped entirely during doze mode.
  ///
  /// We only prompt if the app is NOT already whitelisted (so we don't spam
  /// the user with a dialog on every launch).
  Future<void> _requestIgnoreBatteryOptimizations() async {
    try {
      // First check if we're already whitelisted (no point prompting twice).
      final already = await _batteryChannel.invokeMethod<bool>('isIgnoring');
      if (already == true) return;
      // Not whitelisted — request it. This shows the system dialog.
      await _batteryChannel.invokeMethod<void>('requestIgnore');
    } catch (e) {
      // Non-fatal — the app still works without the whitelist, just with
      // degraded background delivery on aggressive OEMs.
      debugPrint('[NotificationService] battery-opt request failed: $e');
    }
  }

  /// Foreground message handler — shows a local notification banner.
  /// This is called when a push arrives WHILE THE APP IS OPEN.
  /// The OS does NOT auto-show a notification in this case — we MUST show it ourselves.
  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    final data = message.data;

    // Read title/body from `data` first (data-only payload), then fall back
    // to `notification` for backward compat with older app versions.
    final title = (data['title'] as String?)?.isNotEmpty == true
        ? data['title'] as String
        : (notification?.title ?? 'Concordia College');
    final body = (data['body'] as String?)?.isNotEmpty == true
        ? data['body'] as String
        : (notification?.body ?? '');

    // Show a local notification (banner + sound + vibration).
    // Use the channel we created above (with Importance.high) so it appears
    // as a heads-up banner AND makes a sound.
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
          // Heads-up notification (slides down from the top).
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

  /// Called when the user taps a local notification (foreground banner tap).
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

  /// Forward the tap event (with route + params) to the web app.
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
}
