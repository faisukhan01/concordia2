// Root widget + go_router setup.
// Routes to /login or the role-specific home based on auth state.
//
// Theme is forced to LIGHT always — the web portal is light-only and the
// mobile app must match. Never use ThemeMode.system (that caused the dark
// footer/bottom-nav bug on phones in dark mode).

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/login_page.dart';
import 'features/auth/change_password_page.dart';
import 'features/shared/role_shell.dart';

class ConcordiaApp extends StatelessWidget {
  const ConcordiaApp({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    // While restoring session, show a branded splash.
    if (auth.loading) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: const _Splash(),
      );
    }

    final router = GoRouter(
      initialLocation: '/',
      refreshListenable: auth,
      redirect: (context, state) {
        final loggedIn = auth.isLoggedIn;
        final loggingIn = state.matchedLocation == '/login';

        if (!loggedIn) return loggingIn ? null : '/login';

        // Logged in — force password change if flagged.
        if (auth.user!.mustChangePassword == 1 &&
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

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'Concordia College',
      theme: AppTheme.light,
      // Force light theme — NEVER system/dark. The web portal is light-only.
      themeMode: ThemeMode.light,
      routerConfig: router,
    );
  }
}

/// Branded splash — shown for <500ms while AuthProvider.bootstrap() restores
/// the session from SharedPreferences. Clean, minimal, no animation jank.
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF26522),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Concordia app icon (the orange square + black C from the real logo)
            ClipRRect(
              borderRadius: BorderRadius.circular(28),
              child: Image.asset(
                'assets/images/app-icon.png',
                width: 96,
                height: 96,
                fit: BoxFit.cover,
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
              'Management Portal',
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
    );
  }
}
