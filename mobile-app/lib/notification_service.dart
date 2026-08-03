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
// The token is passed to the web app via `window.concordia.registerToken(token)`,
// which the web app's api.ts calls to POST /api/device-tokens.

import 'dart:async';
import 'dart:convert';
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
  // The OS will show the notification automatically because we set
  // `notification` in the FCM payload. We don't need to do anything here,
  // but this function must exist so the plugin knows to handle background msgs.
}

class NotificationService {
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;
  NotificationService._();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  // The Android notification channel ID — MUST match the one we set in the
  // FCM payload on the server (`android.notification.channelId`).
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
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
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
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        announcement: false,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
      );

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
      } catch {}
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
  void _onForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    final title = notification?.title ?? 'Concordia College';
    final body = notification?.body ?? '';
    final data = message.data;

    // Show a local notification (banner + sound + vibration).
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
          icon: '@mipmap/ic_launcher',
          color: const Color(0xFFF26522),
          playSound: true,
          enableVibration: true,
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
