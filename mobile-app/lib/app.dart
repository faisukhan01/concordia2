// Root widget + go_router setup.
// Routes to /login or the role-specific home based on auth state.

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
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}

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
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(
                Icons.school,
                size: 52,
                color: Color(0xFFF26522),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Concordia College',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Management Portal',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 32),
            const SizedBox(
              width: 28,
              height: 28,
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
