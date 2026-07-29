// Additional module screens — fills the feature-parity gap between the
// mobile app and the web app. Each screen is a clean, self-contained
// StatefulWidget that loads data from ApiClient and renders it in a
// professional card/list layout with loading + error states.
//
// Used by nav_items.dart for modules not already covered by the main
// portal tab widgets.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_provider.dart';
import '../auth/change_password_page.dart';

// ════════════════════════════════════════════════════════════════
// Shared building blocks
// ════════════════════════════════════════════════════════════════

class _LoadingView extends StatelessWidget {
  const _LoadingView();
  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(40),
          child: CircularProgressIndicator(color: AppColors.primary, strokeWidth: 2.5),
        ),
      );
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const _ErrorView(this.message, [this.onRetry]);
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.danger),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
              if (onRetry != null) ...[
                const SizedBox(height: 16),
                ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
              ],
            ],
          ),
        ),
      );
}

class _EmptyView extends StatelessWidget {
  final String message;
  const _EmptyView(this.message);
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.inbox_outlined, size: 48, color: AppColors.textMuted),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: AppColors.textMuted)),
            ],
          ),
        ),
      );
}

// ════════════════════════════════════════════════════════════════
// Settings — change password (all roles)
// ════════════════════════════════════════════════════════════════

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return const ChangePasswordPage(embedded: true);
  }
}

// ════════════════════════════════════════════════════════════════
// Announcements viewer (student / teacher / academic)
// ════════════════════════════════════════════════════════════════

class AnnouncementsViewScreen extends StatefulWidget {
  const AnnouncementsViewScreen({super.key});
  @override
  State<AnnouncementsViewScreen> createState() => _AnnouncementsViewScreenState();
}

class _AnnouncementsViewScreenState extends State<AnnouncementsViewScreen> {
  final _api = ApiClient();
  List<Announcement>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _items = await _api.listAnnouncements();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_items == null || _items!.isEmpty) return const _EmptyView('No announcements yet.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items!.length,
        itemBuilder: (_, i) {
          final a = _items![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.campaign, size: 18, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(a.title,
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(a.message, style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
                  if (a.targetRole.isNotEmpty || a.targetScope.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.secondary,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(a.targetScope.isNotEmpty ? a.targetScope : a.targetRole,
                          style: TextStyle(fontSize: 11, color: AppColors.secondaryText, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Timetable viewer (student / teacher)
// ════════════════════════════════════════════════════════════════

class TimetableViewScreen extends StatefulWidget {
  final bool isTeacher;
  const TimetableViewScreen({super.key, this.isTeacher = false});
  @override
  State<TimetableViewScreen> createState() => _TimetableViewScreenState();
}

class _TimetableViewScreenState extends State<TimetableViewScreen> {
  final _api = ApiClient();
  List<TimetableEntry>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _items = await _api.listTimetable();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_items == null || _items!.isEmpty) return const _EmptyView('No timetable entries.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items!.length,
        itemBuilder: (_, i) {
          final t = _items![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: AppColors.secondary,
                child: Text(t.day.substring(0, 2).toUpperCase(),
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary)),
              ),
              title: Text('${t.startTime} - ${t.endTime}',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text('${t.subject} • ${t.teacherName ?? ''}',
                  style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              trailing: Text(t.day,
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Exams list (academic / student)
// ════════════════════════════════════════════════════════════════

class ExamsScreen extends StatefulWidget {
  const ExamsScreen({super.key});
  @override
  State<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends State<ExamsScreen> {
  final _api = ApiClient();
  List<Exam>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _items = await _api.listExams();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_items == null || _items!.isEmpty) return const _EmptyView('No exams scheduled.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items!.length,
        itemBuilder: (_, i) {
          final e = _items![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.primary, child: const Icon(Icons.assignment, color: Colors.white, size: 20)),
              title: Text(e.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text(e.type, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Report Cards (student)
// ════════════════════════════════════════════════════════════════

class ReportCardsScreen extends StatefulWidget {
  const ReportCardsScreen({super.key});
  @override
  State<ReportCardsScreen> createState() => _ReportCardsScreenState();
}

class _ReportCardsScreenState extends State<ReportCardsScreen> {
  final _api = ApiClient();
  List<ReportCard>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _items = await _api.listReportCards();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_items == null || _items!.isEmpty) return const _EmptyView('No report cards available.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items!.length,
        itemBuilder: (_, i) {
          final r = _items![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.description, size: 20, color: AppColors.primary),
                      const SizedBox(width: 8),
                      Expanded(child: Text(r.term ?? 'Report Card',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('Exam: ${r.examName}', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  Text('Total: ${r.totalMarks} • Obtained: ${r.obtainedMarks}', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(6)),
                      child: Text('Grade: ${r.grade} (${r.percentage.toStringAsFixed(1)}%)',
                          style: const TextStyle(fontSize: 12, color: Colors.white, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Date Sheets (student / academic) — uses exams endpoint as date sheet source
// ════════════════════════════════════════════════════════════════

class DateSheetsScreen extends StatefulWidget {
  const DateSheetsScreen({super.key});
  @override
  State<DateSheetsScreen> createState() => _DateSheetsScreenState();
}

class _DateSheetsScreenState extends State<DateSheetsScreen> {
  final _api = ApiClient();
  List<Exam>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _items = await _api.listExams();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_items == null || _items!.isEmpty) return const _EmptyView('No date sheets available.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items!.length,
        itemBuilder: (_, i) {
          final e = _items![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.secondary, child: Icon(Icons.calendar_today, color: AppColors.primary, size: 18)),
              title: Text(e.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text(e.type, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Student Feedback (teacher) — lists students in teacher's classes
// ════════════════════════════════════════════════════════════════

class StudentFeedbackScreen extends StatefulWidget {
  const StudentFeedbackScreen({super.key});
  @override
  State<StudentFeedbackScreen> createState() => _StudentFeedbackScreenState();
}

class _StudentFeedbackScreenState extends State<StudentFeedbackScreen> {
  final _api = ApiClient();
  List<SchoolClass>? _classes;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _classes = await _api.teacherClasses();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_classes == null || _classes!.isEmpty) return const _EmptyView('No classes assigned yet.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _classes!.length,
        itemBuilder: (_, i) {
          final c = _classes![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.primary, child: const Icon(Icons.feedback, color: Colors.white, size: 18)),
              title: Text(c.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text('${c.section} • ${c.studentCount ?? 0} students', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              trailing: const Icon(Icons.chevron_right, color: AppColors.textMuted),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Feedback for ${c.name} — coming soon'), backgroundColor: AppColors.primary),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Branches & Classes overview
// ════════════════════════════════════════════════════════════════

class SuperBranchesScreen extends StatefulWidget {
  const SuperBranchesScreen({super.key});
  @override
  State<SuperBranchesScreen> createState() => _SuperBranchesScreenState();
}

class _SuperBranchesScreenState extends State<SuperBranchesScreen> {
  final _api = ApiClient();
  List<SchoolClass>? _classes;
  Map<String, dynamic>? _overview;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _overview = await _api.platformOverview();
      _classes = await _api.listClasses();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_overview != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('College Overview', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 12),
                    _statRow('Branches', _overview!['branches']?.toString() ?? '0'),
                    _statRow('Classes', _overview!['classes']?.toString() ?? '0'),
                    _statRow('Teachers', _overview!['teachers']?.toString() ?? '0'),
                    _statRow('Students', _overview!['students']?.toString() ?? '0'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          Text('All Classes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          const SizedBox(height: 8),
          if (_classes == null || _classes!.isEmpty)
            const _EmptyView('No classes found.')
          else
            for (final c in _classes!)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(backgroundColor: AppColors.secondary, child: Icon(Icons.class_, color: AppColors.primary, size: 18)),
                  title: Text(c.name ?? 'Class', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                  subtitle: Text('${c.section ?? ''} • ${c.studentCount ?? 0} students', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ),
              ),
        ],
      ),
    );
  }

  Widget _statRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Staff management (list users by role)
// ════════════════════════════════════════════════════════════════

class SuperStaffScreen extends StatefulWidget {
  const SuperStaffScreen({super.key});
  @override
  State<SuperStaffScreen> createState() => _SuperStaffScreenState();
}

class _SuperStaffScreenState extends State<SuperStaffScreen> {
  final _api = ApiClient();
  List<User>? _staff;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      // Load admin-level staff
      _staff = await _api.listUsers();
      _staff = _staff!.where((u) => ['admin', 'admissions', 'accountant', 'academic', 'super-admin'].contains(u.role)).toList();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_staff == null || _staff!.isEmpty) return const _EmptyView('No staff found.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _staff!.length,
        itemBuilder: (_, i) {
          final u = _staff![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.primary, child: Text(u.name.isNotEmpty ? u.name[0].toUpperCase() : '?', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600))),
              title: Text(u.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text(u.email ?? '', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              trailing: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: AppColors.secondary, borderRadius: BorderRadius.circular(6)),
                child: Text(u.role, style: TextStyle(fontSize: 11, color: AppColors.secondaryText, fontWeight: FontWeight.w600)),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Teachers list
// ════════════════════════════════════════════════════════════════

class SuperTeachersScreen extends StatefulWidget {
  const SuperTeachersScreen({super.key});
  @override
  State<SuperTeachersScreen> createState() => _SuperTeachersScreenState();
}

class _SuperTeachersScreenState extends State<SuperTeachersScreen> {
  final _api = ApiClient();
  List<User>? _teachers;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _teachers = await _api.listUsers(role: 'teacher');
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_teachers == null || _teachers!.isEmpty) return const _EmptyView('No teachers found.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _teachers!.length,
        itemBuilder: (_, i) {
          final t = _teachers![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.secondary, child: Text(t.name.isNotEmpty ? t.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600))),
              title: Text(t.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text(t.title ?? t.email ?? 'Teacher', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Students list
// ════════════════════════════════════════════════════════════════

class SuperStudentsScreen extends StatefulWidget {
  const SuperStudentsScreen({super.key});
  @override
  State<SuperStudentsScreen> createState() => _SuperStudentsScreenState();
}

class _SuperStudentsScreenState extends State<SuperStudentsScreen> {
  final _api = ApiClient();
  List<User>? _students;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _students = await _api.listUsers(role: 'student');
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_students == null || _students!.isEmpty) return const _EmptyView('No students found.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _students!.length > 100 ? 100 : _students!.length,
        itemBuilder: (_, i) {
          final s = _students![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.secondary, child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600))),
              title: Text(s.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text('${s.className ?? ''} ${s.section ?? ''} • ${s.rollNo ?? ''}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Fee Collection overview
// ════════════════════════════════════════════════════════════════

class SuperFeesScreen extends StatefulWidget {
  const SuperFeesScreen({super.key});
  @override
  State<SuperFeesScreen> createState() => _SuperFeesScreenState();
}

class _SuperFeesScreenState extends State<SuperFeesScreen> {
  final _api = ApiClient();
  Map<String, dynamic>? _finance;
  List<FeeInvoice>? _invoices;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _finance = await _api.platformFinance();
      _invoices = await _api.listFeeInvoices(all: true);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_finance != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Fee Collection', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 12),
                    _statRow('Total Collected', 'Rs ${_finance!['totalCollected']?.toString() ?? '0'}'),
                    _statRow('Pending', 'Rs ${_finance!['totalPending']?.toString() ?? '0'}'),
                    _statRow('Invoices', _finance!['invoiceCount']?.toString() ?? '0'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Recent Invoices', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
            const SizedBox(height: 8),
          ],
          if (_invoices != null)
            for (final inv in _invoices!.take(20))
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(backgroundColor: inv.status == 'paid' ? AppColors.success : AppColors.warning,
                      child: Icon(inv.status == 'paid' ? Icons.check : Icons.pending, color: Colors.white, size: 18)),
                  title: Text(inv.studentName, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                  subtitle: Text('Rs ${inv.amount} • ${inv.status}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                ),
              ),
        ],
      ),
    );
  }

  Widget _statRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Attendance overview
// ════════════════════════════════════════════════════════════════

class SuperAttendanceScreen extends StatefulWidget {
  const SuperAttendanceScreen({super.key});
  @override
  State<SuperAttendanceScreen> createState() => _SuperAttendanceScreenState();
}

class _SuperAttendanceScreenState extends State<SuperAttendanceScreen> {
  final _api = ApiClient();
  List<AttendanceRecord>? _records;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _records = await _api.listAttendance();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_records == null || _records!.isEmpty) return const _EmptyView('No attendance records.');
    // AttendanceRecord has a Map<String,String> records field (studentId -> status).
    // Aggregate present/absent across all records.
    int totalEntries = 0;
    int presentEntries = 0;
    for (final r in _records!) {
      for (final status in r.records.values) {
        totalEntries++;
        if (status == 'present') presentEntries++;
      }
    }
    final rate = totalEntries > 0 ? (presentEntries * 100 / totalEntries).round() : 0;
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Attendance Overview', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  const SizedBox(height: 12),
                  _statRow('Sessions', _records!.length.toString()),
                  _statRow('Total Entries', totalEntries.toString()),
                  _statRow('Present', presentEntries.toString()),
                  _statRow('Attendance Rate', '$rate%'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('Recent Sessions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          const SizedBox(height: 8),
          for (final r in _records!.take(30))
            Card(
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                leading: CircleAvatar(backgroundColor: AppColors.primary,
                    child: const Icon(Icons.check_circle, color: Colors.white, size: 16)),
                title: Text(r.date, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                subtitle: Text('${r.records.length} students', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ),
            ),
        ],
      ),
    );
  }

  Widget _statRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
          Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Results overview
// ════════════════════════════════════════════════════════════════

class SuperResultsScreen extends StatefulWidget {
  const SuperResultsScreen({super.key});
  @override
  State<SuperResultsScreen> createState() => _SuperResultsScreenState();
}

class _SuperResultsScreenState extends State<SuperResultsScreen> {
  final _api = ApiClient();
  List<ExamResult>? _results;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _results = await _api.listResults();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_results == null || _results!.isEmpty) return const _EmptyView('No results found.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _results!.length > 50 ? 50 : _results!.length,
        itemBuilder: (_, i) {
          final r = _results![i];
          // ExamResult has exam (name), totalMarks, and records (Map<studentId, marks>)
          final avg = r.records.isNotEmpty
              ? (r.records.values.reduce((a, b) => a + b) / r.records.length).toStringAsFixed(1)
              : '0';
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.primary, child: Text(avg, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600))),
              title: Text(r.exam, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text('${r.records.length} students • Max: ${r.totalMarks}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// Super Admin — Announcements (create + list)
// ════════════════════════════════════════════════════════════════

class SuperAnnouncementsScreen extends StatefulWidget {
  const SuperAnnouncementsScreen({super.key});
  @override
  State<SuperAnnouncementsScreen> createState() => _SuperAnnouncementsScreenState();
}

class _SuperAnnouncementsScreenState extends State<SuperAnnouncementsScreen> {
  final _api = ApiClient();
  List<Announcement>? _items;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _items = await _api.listAnnouncements();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Network error';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const _LoadingView();
    if (_error != null) return _ErrorView(_error!, _load);
    if (_items == null || _items!.isEmpty) return const _EmptyView('No announcements yet.');
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items!.length,
        itemBuilder: (_, i) {
          final a = _items![i];
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(backgroundColor: AppColors.primary, child: const Icon(Icons.campaign, color: Colors.white, size: 18)),
              title: Text(a.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              subtitle: Text(a.message, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            ),
          );
        },
      ),
    );
  }
}
