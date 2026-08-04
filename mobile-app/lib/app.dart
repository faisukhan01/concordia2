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
import 'package:firebase_messaging/firebase_messaging.dart';
import 'notification_service.dart';

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

class _SplashToWebViewState extends State<SplashToWebView>
    with WidgetsBindingObserver {
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
    // Observe app lifecycle (resume/pause) so we can re-register the FCM
    // token every time the user returns to the app. This ensures the token
    // is always current even if the WebView reloaded while in background.
    WidgetsBinding.instance.addObserver(this);
    _setupMethodChannel();
    _initWebView();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // When the app comes back to the foreground, re-register the FCM token.
    // The WebView may have reloaded while in the background (especially on
    // Chinese OEMs that freeze apps), so we push the token again to make
    // sure the web app has it.
    if (state == AppLifecycleState.resumed) {
      NotificationService().reRegisterToken();
    }
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
          // Also inject device info (manufacturer, OEM family, etc.) so the
          // web app can show Realme/Xiaomi-specific setup guidance.
          _injectDeviceInfo();
          break;
      }
    });
  }

  /// Fetch device info from the native side and inject it into the WebView
  /// so the web app can detect Realme/Xiaomi and show OEM-specific guidance.
  Future<void> _injectDeviceInfo() async {
    try {
      final info = await NotificationService().getDeviceInfo();
      if (info != null) {
        final infoJs = jsonEncode(info);
        _runJs('''
          (function() {
            window.concordiaNative = window.concordiaNative || {};
            window.concordiaNative.deviceInfo = $infoJs;
          })();
        ''');
      }
    } catch (e) {
      debugPrint('[WebView] injectDeviceInfo failed: $e');
    }
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

  /// Fetch the FCM token directly from Firebase, with a 5s timeout.
  /// Used when the web app requests the token via the JS channel but
  /// `_pendingToken` hasn't been set yet (FCM init still in progress).
  Future<String?> _fetchFcmTokenWithTimeout() async {
    try {
      final result = await FirebaseMessaging.instance.getToken().timeout(
        const Duration(seconds: 5),
      );
      if (result != null) {
        // Cache it so future requests are instant.
        _pendingToken = result;
      }
      return result;
    } catch (e) {
      debugPrint('[WebView] getToken timeout/error: $e');
      return null;
    }
  }

  void _initWebView() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      // JavaScript channel the web app uses to REQUEST the FCM token on demand.
      // The web app posts a message with a unique request id; we respond by
      // running JS that resolves the corresponding Promise with the token.
      // This eliminates the race condition where Flutter gets the token before
      // the WebView's React app has registered its onToken handler.
      ..addJavaScriptChannel(
        'concordiaFcmRequest',
        onMessageReceived: (JavaScriptMessage message) async {
          // message.message is a JSON string: {"id": "<reqId>", "method": "requestToken"}
          try {
            final req = jsonDecode(message.message) as Map<String, dynamic>;
            final reqId = req['id'] as String? ?? '';
            final method = req['method'] as String? ?? '';
            if (method == 'requestToken') {
              // Get the token (may need to wait for FCM init).
              String? token = _pendingToken;
              if (token == null) {
                // FCM might not have delivered yet — ask Firebase directly.
                try {
                  token = await _fetchFcmTokenWithTimeout();
                } catch (_) {
                  token = null;
                }
              }
              // Resolve the web app's Promise.
              final tokenJs = jsonEncode(token);
              _runJs(
                'window.__concordiaFcmResolve && '
                'window.__concordiaFcmResolve(${jsonEncode(reqId)}, $tokenJs);',
              );
            }
          } catch (e) {
            debugPrint('[WebView] concordiaFcmRequest parse error: $e');
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            // Whenever a new page loads, re-inject any pending token/tap
            // so the web app picks them up after a navigation/refresh.
            _pushTokenToWebView();
            _pushTapToWebView();
            // Mark the app as native + expose a `requestTokenAsync` function
            // the web app can CALL to pull the FCM token on demand. This
            // eliminates the race condition where Flutter gets the token
            // before the WebView's React app has registered its onToken
            // handler. The web app calls requestTokenAsync() which posts a
            // message to the `concordiaFcmRequest` JavaScript channel; the
            // Dart side responds by resolving the Promise via
            // window.__concordiaFcmResolve(reqId, token).
            _runJs('''
              window.concordiaNative = window.concordiaNative || {};
              window.concordiaNative.isNativeApp = true;
              window.concordiaNative.appVersion = "4.0.0";
              (function() {
                var pending = window.__concordiaFcmPending || (window.__concordiaFcmPending = {});
                var resolvers = window.__concordiaFcmResolvers || (window.__concordiaFcmResolvers = {});
                window.__concordiaFcmResolve = function(reqId, token) {
                  try {
                    if (resolvers[reqId]) {
                      resolvers[reqId](token);
                      delete resolvers[reqId];
                    }
                  } catch (e) {
                    console.warn('[native] resolve error:', e);
                  }
                };
                window.concordiaNative.requestTokenAsync = function() {
                  return new Promise(function(resolve) {
                    try {
                      var reqId = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                      resolvers[reqId] = resolve;
                      // Post a message to the Dart side via the JS channel.
                      window.concordiaFcmRequest.postMessage(JSON.stringify({
                        id: reqId,
                        method: 'requestToken'
                      }));
                      // Timeout: resolve with null after 5s so we never hang.
                      setTimeout(function() {
                        if (resolvers[reqId]) {
                          resolvers[reqId](null);
                          delete resolvers[reqId];
                        }
                      }, 5000);
                    } catch (e) {
                      console.warn('[native] requestTokenAsync error:', e);
                      resolve(null);
                    }
                  });
                };
              })();
            ''');
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
