// Concordia College — API client (Dio-based).
// Mirrors every endpoint in the web app's src/lib/server/handler.ts.
//
// Auth: Bearer token in the Authorization header, stored in SecureStorage.

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../config/api_config.dart';
import '../models/models.dart';
import 'api_cache.dart';
import 'auth_storage.dart';

final _log = _Logger();

/// Minimal logger wrapper — avoids version-specific PrettyPrinter API differences.
class _Logger {
  void w(String msg) => debugPrint('[WARN] $msg');
  void e(String msg) => debugPrint('[ERROR] $msg');
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  final dynamic data;
  ApiException(this.statusCode, this.message, [this.data]);

  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late final Dio _dio;
  final ApiCache _cache = ApiCache();
  String? _token;

  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      validateStatus: (_) => true, // we handle status ourselves
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        // Attach bearer token from storage on every request.
        _token ??= await AuthStorage.getToken();
        if (_token != null && _token!.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $_token';
        }
        handler.next(options);
      },
      onResponse: (response, handler) {
        // Centralized error mapping for 4xx/5xx.
        final status = response.statusCode ?? 0;
        if (status >= 400) {
          final msg = (response.data is Map)
              ? (response.data['error'] ?? response.data['message'] ?? 'Request failed')
              : 'Request failed ($status)';
          _log.w('API ${response.requestOptions.method} ${response.requestOptions.path} → $status: $msg');
          throw ApiException(status, msg.toString(), response.data);
        }
        handler.next(response);
      },
      onError: (e, handler) {
        _log.e('Network error: ${e.message}');
        handler.next(e);
      },
    ));
  }

  /// Force-set the token (called after login).
  Future<void> setToken(String token) async {
    _token = token;
    await AuthStorage.setToken(token);
  }

  /// Clear token (called on logout / 401).
  Future<void> clearToken() async {
    _token = null;
    _cache.clear();
    await AuthStorage.clear();
  }

  // ── Core request helper ──────────────────────────────────────────
  Future<dynamic> _req(
    String method,
    String path, {
    Map<String, dynamic>? query,
    dynamic body,
  }) async {
    // Cache GET requests for 60s (cuts perceived load time dramatically).
    if (method == 'GET') {
      final key = cacheKey(path, query);
      return _cache.getOrFetch(key, () => _rawRequest(method, path, query: query, body: body));
    }
    // Mutations: fire the request, then invalidate any cached GETs for this
    // resource prefix so the next read reflects the new state.
    final result = await _rawRequest(method, path, query: query, body: body);
    _invalidateForMutation(method, path);
    return result;
  }

  Future<dynamic> _rawRequest(
    String method,
    String path, {
    Map<String, dynamic>? query,
    dynamic body,
  }) async {
    final url = ApiConfig.endpoint(path);
    try {
      final res = await _dio.request(
        url,
        options: Options(method: method),
        queryParameters: query,
        data: body,
      );
      // The onResponse interceptor throws on 4xx/5xx; if we get here it's 2xx.
      if (res.data == null) return null;
      return res.data;
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException(0, 'Network error: $e');
    }
  }

  /// Invalidate cache entries that would be affected by a mutation.
  /// Heuristic: clear any cached GET whose key starts with the resource path.
  void _invalidateForMutation(String method, String path) {
    // path e.g. "fee-invoices/123/pay" → prefix "fee-invoices"
    final seg = path.split('/').first;
    _cache.invalidate(seg);
    // Also clear dashboards/overview aggregates that depend on this resource.
    const aggregates = [
      'scoped/stats', 'platform/overview', 'branch/finance',
      'institute/finance', 'platform/finance', 'teacher/analytics',
      'student/analytics', 'notifications',
    ];
    for (final a in aggregates) {
      _cache.invalidate(a);
    }
  }

  /// Force-invalidate a cache prefix (call from UI after a manual refresh).
  void invalidate(String prefix) => _cache.invalidate(prefix);

  /// Clear the entire API cache (call on logout).
  void clearCache() => _cache.clear();

  // ════════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════════

  /// Login with email/rollNo/teacherId + password.
  /// Returns the session (token + user).
  Future<AuthSession> login(String identifier, String password) async {
    final data = await _req('POST', 'auth/login', body: {
      'email': identifier,
      'password': password,
    });
    final session = AuthSession.fromJson(data as Map<String, dynamic>);
    await setToken(session.token);
    return session;
  }

  Future<void> logout() async {
    try {
      await _req('POST', 'auth/logout');
    } catch (_) {}
    await clearToken();
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _req('POST', 'auth/change-password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  // ════════════════════════════════════════════════════════════════
  // PLATFORM USERS (super-admin / admin / accountant)
  // ════════════════════════════════════════════════════════════════

  Future<List<User>> listUsers({
    String? role,
    String? branchId,
    String? instituteId,
  }) async {
    final data = await _req('GET', 'platform/users', query: {
      if (role != null) 'role': role,
      if (branchId != null) 'branchId': branchId,
      if (instituteId != null) 'instituteId': instituteId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => User.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<User> createUser(Map<String, dynamic> body) async {
    final data = await _req('POST', 'platform/users', body: body);
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User> updateUser(String id, Map<String, dynamic> body) async {
    final data = await _req('PATCH', 'platform/users/$id', body: body);
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<void> blockUser(String id, {required bool blocked, String? reason}) async {
    await _req('PATCH', 'platform/users/$id/block', body: {
      'blocked': blocked,
      if (reason != null) 'blockedReason': reason,
    });
  }

  Future<void> deleteUser(String id) async {
    await _req('DELETE', 'platform/users/$id');
  }

  Future<String> revealPassword(String id) async {
    final data = await _req('GET', 'platform/users/$id/password');
    return data['password'] as String? ?? '';
  }

  // ════════════════════════════════════════════════════════════════
  // CLASSES & COURSES
  // ════════════════════════════════════════════════════════════════

  Future<List<SchoolClass>> listClasses({String? branchId}) async {
    final data = await _req('GET', 'classes', query: {
      if (branchId != null) 'branchId': branchId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => SchoolClass.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<Course>> listCourses({String? branchId, String? classId}) async {
    final data = await _req('GET', 'courses', query: {
      if (branchId != null) 'branchId': branchId,
      if (classId != null) 'classId': classId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => Course.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<SchoolClass> createClass(Map<String, dynamic> body) async {
    final data = await _req('POST', 'classes', body: body);
    return SchoolClass.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteClass(String id) async {
    await _req('DELETE', 'classes/$id');
  }

  Future<Course> createCourse(Map<String, dynamic> body) async {
    final data = await _req('POST', 'courses', body: body);
    return Course.fromJson(data as Map<String, dynamic>);
  }

  // ════════════════════════════════════════════════════════════════
  // TEACHER / STUDENT SCOPED
  // ════════════════════════════════════════════════════════════════

  Future<List<SchoolClass>> teacherClasses() async {
    final data = await _req('GET', 'teacher/classes');
    final list = (data as List? ?? []) as List;
    return list.map((j) => SchoolClass.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<Course>> studentCourses() async {
    final data = await _req('GET', 'student/courses');
    final list = (data as List? ?? []) as List;
    return list.map((j) => Course.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> teacherAnalytics() async {
    return await _req('GET', 'teacher/analytics') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> studentAnalytics() async {
    return await _req('GET', 'student/analytics') as Map<String, dynamic>;
  }

  // ════════════════════════════════════════════════════════════════
  // ANNOUNCEMENTS
  // ════════════════════════════════════════════════════════════════

  Future<List<Announcement>> listAnnouncements() async {
    final data = await _req('GET', 'announcements');
    final list = (data as List? ?? []) as List;
    return list.map((j) => Announcement.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Announcement> createAnnouncement(Map<String, dynamic> body) async {
    final data = await _req('POST', 'announcements', body: body);
    return Announcement.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteAnnouncement(String id) async {
    await _req('DELETE', 'announcements/$id');
  }

  // ════════════════════════════════════════════════════════════════
  // ATTENDANCE
  // ════════════════════════════════════════════════════════════════

  Future<List<AttendanceRecord>> listAttendance({
    String? studentId,
    String? branchId,
    String? teacherId,
  }) async {
    final data = await _req('GET', 'attendance', query: {
      if (studentId != null) 'studentId': studentId,
      if (branchId != null) 'branchId': branchId,
      if (teacherId != null) 'teacherId': teacherId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => AttendanceRecord.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> markAttendance(Map<String, dynamic> body) async {
    await _req('POST', 'attendance', body: body);
  }

  // ════════════════════════════════════════════════════════════════
  // RESULTS
  // ════════════════════════════════════════════════════════════════

  Future<List<ExamResult>> listResults({
    String? studentId,
    String? branchId,
    String? teacherId,
  }) async {
    final data = await _req('GET', 'results', query: {
      if (studentId != null) 'studentId': studentId,
      if (branchId != null) 'branchId': branchId,
      if (teacherId != null) 'teacherId': teacherId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => ExamResult.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> submitResults(Map<String, dynamic> body) async {
    await _req('POST', 'results', body: body);
  }

  // ════════════════════════════════════════════════════════════════
  // EXAMS
  // ════════════════════════════════════════════════════════════════

  Future<List<Exam>> listExams({String? branchId}) async {
    final data = await _req('GET', 'exams', query: {
      if (branchId != null) 'branchId': branchId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => Exam.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Exam> createExam(Map<String, dynamic> body) async {
    final data = await _req('POST', 'exams', body: body);
    return Exam.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteExam(String id) async {
    await _req('DELETE', 'exams/$id');
  }

  // ════════════════════════════════════════════════════════════════
  // FEE SYSTEM
  // ════════════════════════════════════════════════════════════════

  Future<List<FeeInvoice>> listFeeInvoices({String? studentId, bool all = false}) async {
    final data = await _req('GET', 'fee-invoices', query: {
      if (studentId != null) 'studentId': studentId,
      if (all) 'all': '1',
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => FeeInvoice.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<FeeInvoice>> listBranchInvoices() async {
    final data = await _req('GET', 'fee-invoices/branch');
    final list = (data as List? ?? []) as List;
    return list.map((j) => FeeInvoice.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> generateMonthlyInvoices({required int month, required int year}) async {
    await _req('POST', 'fee-invoices/generate', body: {
      'month': month,
      'year': year,
    });
  }

  Future<FeeInvoice> payInvoice(String id, {required double paidAmount, required String paymentMethod}) async {
    final data = await _req('PATCH', 'fee-invoices/$id/pay', body: {
      'paidAmount': paidAmount,
      'paymentMethod': paymentMethod,
    });
    return FeeInvoice.fromJson(data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> getChallan(String id) async {
    return await _req('GET', 'fee-invoices/$id/challan') as Map<String, dynamic>;
  }

  Future<void> createInstallments(Map<String, dynamic> body) async {
    await _req('POST', 'fee-invoices/installments', body: body);
  }

  Future<List<MiscCharge>> listMiscCharges({String? branchId, String? studentId}) async {
    final data = await _req('GET', 'misc-charges', query: {
      if (branchId != null) 'branchId': branchId,
      if (studentId != null) 'studentId': studentId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => MiscCharge.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<MiscCharge> createMiscCharge(Map<String, dynamic> body) async {
    final data = await _req('POST', 'misc-charges', body: body);
    return MiscCharge.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteMiscCharge(String id) async {
    await _req('DELETE', 'misc-charges/$id');
  }

  // ════════════════════════════════════════════════════════════════
  // TIMETABLE
  // ════════════════════════════════════════════════════════════════

  Future<List<TimetableEntry>> listTimetable({
    String? branchId,
    String? classId,
    String? teacherId,
  }) async {
    final data = await _req('GET', 'timetable', query: {
      if (branchId != null) 'branchId': branchId,
      if (classId != null) 'classId': classId,
      if (teacherId != null) 'teacherId': teacherId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => TimetableEntry.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<TimetableEntry> saveTimetableEntry(Map<String, dynamic> body) async {
    final data = await _req('POST', 'timetable', body: body);
    return TimetableEntry.fromJson(data as Map<String, dynamic>);
  }

  Future<void> deleteTimetableEntry(String id) async {
    await _req('DELETE', 'timetable/$id');
  }

  // ════════════════════════════════════════════════════════════════
  // REPORT CARDS
  // ════════════════════════════════════════════════════════════════

  Future<List<ReportCard>> listReportCards({String? studentId, String? branchId}) async {
    final data = await _req('GET', 'report-cards', query: {
      if (studentId != null) 'studentId': studentId,
      if (branchId != null) 'branchId': branchId,
    });
    final list = (data as List? ?? []) as List;
    return list.map((j) => ReportCard.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<ReportCard> generateReportCard(String studentId, {String? term, String? examName}) async {
    final data = await _req('GET', 'report-cards/generate/$studentId', query: {
      if (term != null) 'term': term,
      if (examName != null) 'examName': examName,
    });
    return ReportCard.fromJson(data as Map<String, dynamic>);
  }

  // ════════════════════════════════════════════════════════════════
  // DASHBOARDS & STATS
  // ════════════════════════════════════════════════════════════════

  Future<Map<String, dynamic>> platformOverview() async {
    return await _req('GET', 'platform/overview') as Map<String, dynamic>;
  }

  Future<DashboardStats> scopedStats({String? instituteId, String? branchId}) async {
    final data = await _req('GET', 'scoped/stats', query: {
      if (instituteId != null) 'instituteId': instituteId,
      if (branchId != null) 'branchId': branchId,
    });
    return DashboardStats.fromJson(data as Map<String, dynamic>);
  }

  Future<Map<String, dynamic>> branchFinance() async {
    return await _req('GET', 'branch/finance') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> instituteFinance() async {
    return await _req('GET', 'institute/finance') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> platformFinance() async {
    return await _req('GET', 'platform/finance') as Map<String, dynamic>;
  }

  // ════════════════════════════════════════════════════════════════
  // SALARIES
  // ════════════════════════════════════════════════════════════════

  Future<void> setSalary(Map<String, dynamic> body) async {
    await _req('POST', 'salaries', body: body);
  }

  Future<void> paySalary(Map<String, dynamic> body) async {
    await _req('POST', 'salaries/pay', body: body);
  }

  Future<List<Map<String, dynamic>>> listSalaries({
    String? instituteId,
    String? branchId,
    String? teacherId,
  }) async {
    final data = await _req('GET', 'salaries', query: {
      if (instituteId != null) 'instituteId': instituteId,
      if (branchId != null) 'branchId': branchId,
      if (teacherId != null) 'teacherId': teacherId,
    });
    final list = (data as List? ?? []) as List;
    return list.cast<Map<String, dynamic>>();
  }

  // ════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════

  Future<Map<String, dynamic>> notifications() async {
    return await _req('GET', 'notifications') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> healthCheck() async {
    return await _req('GET', 'health') as Map<String, dynamic>;
  }
}
