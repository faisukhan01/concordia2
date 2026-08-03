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

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// Must be a top-level function (not a class method) so the Android OS can
// call it when a push arrives while the app is in the background/terminated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Ensure Firebase is initialized in the background isolate.
  await Firebase.initializeApp();

  // CRITICAL: Create the notification channel in the background isolate too.
  // When the app is CLOSED and a push arrives, this handler runs in a separate
  // isolate. If the channel doesn't exist, the OS SILENTLY DROPS the notification.
  // We create it here so background notifications always show.
  try {
    final flutterLocalNotifications = FlutterLocalNotificationsPlugin();
    await flutterLocalNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            'concordia_notifications',
            'Concordia Notifications',
            description:
                'Announcements, exams, marks, attendance, and fee reminders from Concordia College.',
            importance: Importance.high,
            playSound: true,
            enableVibration: true,
            showBadge: true,
          ),
        );
  } catch (e) {
    debugPrint('[bg] failed to create notification channel: $e');
  }
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  // The Android notification channel ID — MUST match the one we set in the
  // FCM payload on the server (`android.notification.channelId`) AND in the
  // AndroidManifest.xml (`com.google.firebase.messaging.default_notification_channel_id`).
  static const String _channelId = 'concordia_notifications';
  static const String _channelName = 'Concordia Notifications';
  static const String _channelDesc =
      'Announcements, exams, marks, attendance, and fee reminders from Concordia College.';

  // A JS callback the web app can set to receive the token + tap events.
  // We invoke it via the WebView's JavaScript channel.
  static const MethodChannel _channel = MethodChannel('concordia/fcm');

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
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(
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

  /// Foreground message handler — shows a local notification banner.
  /// This is called when a push arrives WHILE THE APP IS OPEN.
  /// The OS does NOT auto-show a notification in this case — we MUST show it ourselves.
  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    final title = notification?.title ?? 'Concordia College';
    final body = notification?.body ?? '';
    final data = message.data;

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
