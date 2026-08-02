// Auth state provider — the single source of truth for the logged-in user.
// Exposes login(), logout(), changePassword() and the current user.
//
// Shows user-friendly error messages (matching web app's toast messages):
//   • 401 → "Invalid username or password"
//   • 429 → "Account temporarily locked"
//   • Network → "Cannot connect to server"
//   • Blocked → "Access blocked"

import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../core/api/auth_storage.dart';
import '../../core/models/models.dart';

class AuthProvider extends ChangeNotifier {
  final _api = ApiClient();

  AuthProvider() {
    // Kick off session restore immediately on construction so the splash
    // screen doesn't hang forever.
    bootstrap();
  }

  User? _user;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  User? get user => _user;
  bool get loading => _loading;
  bool get busy => _busy;
  bool get isLoggedIn => _user != null;
  String? get error => _error;

  /// Restore session from storage on app start.
  Future<void> bootstrap() async {
    _loading = true;
    notifyListeners();
    try {
      _user = await AuthStorage.getUser();
    } catch (e) {
      _error = null; // Don't show error on bootstrap
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Convert raw ApiException messages into user-friendly text
  /// (matches the web app's toast messages exactly).
  String _friendlyError(ApiException e) {
    final msg = e.message.toLowerCase();
    final code = e.statusCode;

    // Account locked / too many attempts
    if (code == 429 || msg.contains('locked') || msg.contains('too many')) {
      return 'Account temporarily locked. Please try again later.';
    }

    // Invalid credentials
    if (code == 401 || msg.contains('invalid') || msg.contains('incorrect')) {
      return 'Invalid username or password. Students & Teachers: use your Roll # / Teacher ID and the password given by the Accountant.';
    }

    // Access blocked
    if (msg.contains('blocked') || msg.contains('retired')) {
      return 'Access blocked. Contact your administrator.';
    }

    // Network errors (statusCode == 0)
    if (code == 0) {
      return e.message; // Already user-friendly from api_client.dart
    }

    // Fallback — show the server message but clean it up
    return e.message;
  }

  Future<bool> login(String identifier, String password) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final session = await _api.login(identifier, password);
      _user = session.user;
      await AuthStorage.setUser(session.user);
      await AuthStorage.setToken(session.token);
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = _friendlyError(e);
      _busy = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'An unexpected error occurred. Please try again.';
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  /// Instant logout: clears local state + notifies listeners FIRST so the UI
  /// navigates to /login immediately, then fires the server logout call in
  /// the background (fire-and-forget).
  Future<void> logout() async {
    if (_user == null) return;
    _user = null;
    _error = null;
    _busy = false;
    notifyListeners(); // immediate redirect to /login
    try {
      await AuthStorage.clear();
    } catch (_) {}
    _api.logout().catchError((_) {});
  }

  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      await _api.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );
      _busy = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = _friendlyError(e);
      _busy = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'An unexpected error occurred.';
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
