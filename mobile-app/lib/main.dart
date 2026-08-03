// Concordia College — Mobile App
//
// This app wraps the web app (https://concordia-colleges.vercel.app/) in a
// native WebView shell. This guarantees the mobile app is 100% identical to
// the web app's mobile preview — because it IS the web app.
//
// Features:
//   • Native splash screen with Concordia branding
//   • Full WebView with JavaScript enabled
//   • Proper back-button navigation (goes back in WebView history)
//   • Offline detection with retry button
//   • External links open in the device browser
//   • Pull-to-refresh support
//   • No ugly Flutter UI — the web app IS the UI

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app.dart';
import 'notification_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase + FCM push notifications.
  // Done early so the app can receive pushes as soon as possible.
  await NotificationService().init();

  // Lock to portrait orientation
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Make status bar transparent for immersive splash
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));

  runApp(const ConcordiaApp());
}
