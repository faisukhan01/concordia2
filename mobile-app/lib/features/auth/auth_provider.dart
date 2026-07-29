// Auth state provider — the single source of truth for the logged-in user.
// Exposes login(), logout(), changePassword() and the current user.

import 'package:flutter/foundation.dart';
import '../../core/api/api_client.dart';
import '../../core/api/auth_storage.dart';
import '../../core/models/models.dart';

class AuthProvider extends ChangeNotifier {
  final _api = ApiClient();

  AuthProvider() {
    // Kick off session restore immediately on construction so the splash
    // screen doesn't hang forever. main.dart creates this provider via
    // ChangeNotifierProvider, and app.dart shows the splash while
    // `loading` is true — without this call, loading never flips to false.
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
      // If we have a stored user but no valid token, the first API call
      // will 401 and trigger logout. No need to validate eagerly.
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
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
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'Network error. Check your connection.';
      _busy = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _api.logout();
    _user = null;
    notifyListeners();
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
      _error = e.message;
      _busy = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'Network error.';
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
