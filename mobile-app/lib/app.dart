// Concordia College — App Shell
//
// Shows a branded splash screen while the WebView loads,
// then transitions to the full-screen WebView.
//
// The WebView loads https://concordia-colleges.vercel.app/ which is the
// same web app users see in their browser. This guarantees the mobile app
// is 100% identical to the web app's mobile preview — because it IS the
// web app.

import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

// ── Brand colors (inlined to avoid external deps) ──────────────
class _C {
  static const primary = Color(0xFFF26522);
  static const background = Color(0xFFFCFBF9);
  static const textPrimary = Color(0xFF1A1A1A);
  static const textMuted = Color(0xFF4A5568);
}

class ConcordiaApp extends StatelessWidget {
  const ConcordiaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Concordia College',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.light(useMaterial3: true).copyWith(
        colorScheme: const ColorScheme.light(
          primary: _C.primary,
          onPrimary: Colors.white,
        ),
        scaffoldBackgroundColor: _C.background,
      ),
      home: const SplashToWebView(),
    );
  }
}

// ── Splash → WebView transition ─────────────────────────────────
class SplashToWebView extends StatefulWidget {
  const SplashToWebView({super.key});

  @override
  State<SplashToWebView> createState() => _SplashToWebViewState();
}

class _SplashToWebViewState extends State<SplashToWebView> {
  late WebViewController _controller;
  bool _loaded = false;
  bool _offline = false;

  // The most recent FCM token + notification-tap data (received from the
  // NotificationService via the method channel). We hold these so we can
  // re-inject them into the WebView whenever a new page loads.
  String? _pendingToken;
  Map<String, dynamic>? _pendingTap;

  // The method channel that NotificationService uses to talk to this widget.
  static const MethodChannel _fcmChannel = MethodChannel('concordia/fcm');

  static const String _webAppUrl = 'https://concordia-colleges.vercel.app/';

  @override
  void initState() {
    super.initState();
    _setupMethodChannel();
    _initWebView();
  }

  void _setupMethodChannel() {
    _fcmChannel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'onToken':
          _pendingToken = call.arguments['token'] as String?;
          _pushTokenToWebView();
          break;
        case 'onNotificationTap':
          _pendingTap =
              Map<String, dynamic>.from(call.arguments['data'] as Map);
          _pushTapToWebView();
          break;
        case 'onFcmReady':
          // The web app listens for this to know it's running inside the
          // native app (vs a regular browser tab).
          _runJs('window.concordiaNative = window.concordiaNative || {};'
              'window.concordiaNative.fcmReady = true;');
          break;
      }
    });
  }

  /// Inject the FCM token into the WebView so the web app can register it.
  void _pushTokenToWebView() {
    if (_pendingToken == null) return;
    final tokenJs = jsonEncode(_pendingToken);
    _runJs('''
      (function() {
        window.concordiaNative = window.concordiaNative || {};
        window.concordiaNative.fcmToken = $tokenJs;
        // If the web app has registered a handler, call it.
        if (window.concordiaNative.onToken) {
          try { window.concordiaNative.onToken($tokenJs); } catch(e) {}
        }
      })();
    ''');
  }

  /// Inject a notification-tap event into the WebView so the web app can
  /// navigate to the right page.
  void _pushTapToWebView() {
    if (_pendingTap == null) return;
    final dataJs = jsonEncode(_pendingTap);
    _runJs('''
      (function() {
        window.concordiaNative = window.concordiaNative || {};
        if (window.concordiaNative.onNotificationTap) {
          try { window.concordiaNative.onNotificationTap($dataJs); } catch(e) {}
        }
      })();
    ''');
  }

  void _runJs(String js) {
    try {
      _controller.runJavaScript(js);
    } catch (e) {
      debugPrint('[WebView] runJavaScript failed: $e');
    }
  }

  void _initWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            // Whenever a new page loads, re-inject any pending token/tap
            // so the web app picks them up after a navigation/refresh.
            _pushTokenToWebView();
            _pushTapToWebView();
            // Mark the app as native so the web app can show a "Send Test
            // Notification" button + hide browser-only features.
            _runJs('window.concordiaNative = window.concordiaNative || {};'
                'window.concordiaNative.isNativeApp = true;');
            if (!_loaded) {
              setState(() => _loaded = true);
            }
          },
          onWebResourceError: (error) {
            if (error.errorType == WebResourceErrorType.hostLookup ||
                error.errorType == WebResourceErrorType.connect ||
                error.errorType == WebResourceErrorType.timeout) {
              setState(() {
                _offline = true;
                _loaded = true;
              });
            }
          },
          onNavigationRequest: (NavigationRequest request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;

            // Allow the web app itself
            if (request.url.startsWith(_webAppUrl)) {
              return NavigationDecision.navigate;
            }

            // Allow same-origin API calls
            if (uri.host == 'concordia-colleges.vercel.app') {
              return NavigationDecision.navigate;
            }

            // Allow GitHub release downloads
            if (uri.host == 'github.com' &&
                request.url.contains('concordia2/releases')) {
              return NavigationDecision.navigate;
            }

            // Open everything else in external browser
            _launchUrl(request.url);
            return NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(Uri.parse(_webAppUrl));
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _retry() async {
    setState(() {
      _offline = false;
      _loaded = false;
    });
    _controller.reload();
  }

  @override
  Widget build(BuildContext context) {
    // Show splash screen while loading
    if (!_loaded) {
      return _SplashScreen();
    }

    // Show offline screen
    if (_offline) {
      return _OfflineScreen(onRetry: _retry);
    }

    // Show the WebView
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          _controller.goBack();
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: WebViewWidget(controller: _controller),
        ),
      ),
    );
  }
}

// ── Branded Splash Screen ───────────────────────────────────────
class _SplashScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Logo in white pill
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.08),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Image.asset(
                'assets/images/concordia-logo.png',
                height: 48,
              ),
            ),
            const SizedBox(height: 32),
            // Loading indicator
            SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                color: _C.primary,
                strokeWidth: 3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Offline Screen ──────────────────────────────────────────────
class _OfflineScreen extends StatelessWidget {
  final VoidCallback onRetry;

  const _OfflineScreen({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _C.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.wifi_off_rounded,
                size: 64,
                color: _C.textMuted,
              ),
              const SizedBox(height: 24),
              const Text(
                'No Internet Connection',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: _C.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Please check your internet connection and try again.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: _C.textMuted,
                ),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: onRetry,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _C.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'Try Again',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
