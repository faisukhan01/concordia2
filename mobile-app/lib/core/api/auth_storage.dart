// Token + user storage (shared_preferences).
// On a real device you'd swap this for flutter_secure_storage; for broad
// Android compatibility we use shared_preferences which works on all API levels.

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

class AuthStorage {
  static const _kToken = 'concordia_token';
  static const _kUser = 'concordia_user';

  static String? _cachedToken;
  static User? _cachedUser;

  static Future<String?> getToken() async {
    if (_cachedToken != null) return _cachedToken;
    final sp = await SharedPreferences.getInstance();
    _cachedToken = sp.getString(_kToken);
    return _cachedToken;
  }

  static Future<void> setToken(String token) async {
    _cachedToken = token;
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kToken, token);
  }

  static Future<User?> getUser() async {
    if (_cachedUser != null) return _cachedUser;
    final sp = await SharedPreferences.getInstance();
    final raw = sp.getString(_kUser);
    if (raw == null) return null;
    try {
      _cachedUser = User.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      _cachedUser = null;
    }
    return _cachedUser;
  }

  static Future<void> setUser(User user) async {
    _cachedUser = user;
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kUser, jsonEncode(user.toJson()));
  }

  static Future<void> clear() async {
    _cachedToken = null;
    _cachedUser = null;
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kToken);
    await sp.remove(_kUser);
  }
}
