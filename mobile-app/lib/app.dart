// Root widget + go_router setup.
// Routes to /login or the role-specific home based on auth state.
//
// IMPORTANT: the GoRouter is created ONCE in a Stateful widget and wired to
// `auth` via refreshListenable. The previous version rebuilt the router inside
// a StatelessWidget.build on every auth notify — that recreated the whole
// navigator tree and caused the "flash / refresh" the user saw right after
// sign-in. Creating it once fixes that.
//
// Theme is forced to LIGHT always — the web portal is light-only and the
// mobile app must match. Never use ThemeMode.system (that caused the dark
// footer/bottom-nav bug on phones in dark mode).
//
// Uses the new design system: AppTheme.light, AppColors, AppRadii.
// Splash screen uses the Concordia logo on an orange gradient background.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_page.dart';
import 'features/auth/change_password_page.dart';
import 'features/shared/role_shell.dart';

class ConcordiaApp extends StatefulWidget {
  const ConcordiaApp({super.key});

  @override
  State<ConcordiaApp> createState() => _ConcordiaAppState();
}

class _ConcordiaAppState extends State<ConcordiaApp> {
  late final AuthProvider _auth;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _auth = context.read<AuthProvider>();
    _router = GoRouter(
      initialLocation: '/',
      refreshListenable: _auth,
      redirect: (context, state) {
        final loggedIn = _auth.isLoggedIn;
        final loggingIn = state.matchedLocation == '/login';

        if (!loggedIn) return loggingIn ? null : '/login';

        // Logged in — force password change if flagged.
        if (_auth.user!.mustChangePassword == 1 &&
            state.matchedLocation != '/change-password') {
          return '/change-password';
        }

        if (loggingIn) return '/';
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          builder: (_, __) => const LoginPage(),
        ),
        GoRoute(
          path: '/change-password',
          builder: (_, __) => const ChangePasswordPage(),
        ),
        GoRoute(
          path: '/',
          builder: (_, __) => const RoleShell(),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    // While restoring session, show a branded splash. This branch only runs
    // during the initial bootstrap (loading flips once), never during a
    // login/logout transition (those flip `isLoggedIn`, not `loading`).
    if (auth.loading) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: const _Splash(),
      );
    }

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'Concordia College',
      theme: AppTheme.light,
      // Force light theme — NEVER system/dark. The web portal is light-only.
      themeMode: ThemeMode.light,
      routerConfig: _router,
    );
  }
}

/// Branded splash — shown for <500ms while AuthProvider.bootstrap() restores
/// the session from SharedPreferences. Uses the Concordia logo on an orange
/// gradient background matching the web app's splash/branding.
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: AppColors.primaryGradient,
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Concordia logo in a white pill container
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.15),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.asset(
                    'assets/images/concordia-logo.png',
                    width: 80,
                    height: 80,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(
                      Icons.school_rounded,
                      size: 64,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'Concordia College',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Student & Staff Portal',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                ),
              ),
              const SizedBox(height: 36),
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
