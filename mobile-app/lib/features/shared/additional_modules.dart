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
import '../../widgets/shared_widgets.dart';
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
    final branches = int.tryParse('${_overview?['branches'] ?? 0}') ?? 0;
    final classesNum = int.tryParse('${_overview?['classes'] ?? 0}') ?? 0;
    final teachersNum = int.tryParse('${_overview?['teachers'] ?? 0}') ?? 0;
    final studentsNum = int.tryParse('${_overview?['students'] ?? 0}') ?? 0;
    // Build chart bars for top classes by student count
    final chartBars = (_classes ?? <SchoolClass>[])
        .where((c) => (c.studentCount ?? 0) > 0)
        .toList()
      ..sort((a, b) => (b.studentCount ?? 0).compareTo(a.studentCount ?? 0));
    final bars = chartBars.take(6).map((c) => BarData(
      label: c.name,
      value: (c.studentCount ?? 0).toDouble(),
      gradient: AppColors.primaryGradient,
    )).toList();

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Gradient hero
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Branches & Classes',
            subtitle: 'College-wide overview',
            icon: Icons.business_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 18),
          // 2x2 stat grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.12,
            children: [
              StatCard(label: 'Branches', value: '$branches', icon: Icons.business_rounded, gradient: AppColors.primaryGradient),
              StatCard(label: 'Classes', value: '$classesNum', icon: Icons.class_rounded, color: AppColors.info),
              StatCard(label: 'Teachers', value: '$teachersNum', icon: Icons.person_rounded, gradient: AppColors.successGradient),
              StatCard(label: 'Students', value: '$studentsNum', icon: Icons.people_alt_rounded, gradient: AppColors.warningGradient),
            ],
          ),
          const SizedBox(height: 14),
          // Students per class chart
          if (bars.isNotEmpty) ...[
            const SectionHeader(title: 'Students per Class', subtitle: 'Top classes by enrollment'),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
              child: MiniBarChart(bars: bars, height: 180),
            ),
          ],
          const SectionHeader(title: 'All Classes'),
          if (_classes == null || _classes!.isEmpty)
            const _EmptyView('No classes found.')
          else
            for (final c in _classes!)
              ListRow(
                title: c.name ?? 'Class',
                subtitle: '${c.section ?? ''} • ${c.studentCount ?? 0} students',
                icon: Icons.class_rounded,
                accentColor: AppColors.primary,
              ),
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
    // Count by role for chart
    final roleCount = <String, int>{};
    for (final u in _staff!) {
      roleCount[u.role] = (roleCount[u.role] ?? 0) + 1;
    }
    final bars = roleCount.entries.map((e) => BarData(
      label: e.key.length > 8 ? e.key.substring(0, 8) : e.key,
      value: e.value.toDouble(),
      gradient: AppColors.primaryGradient,
    )).toList();

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Office Staff',
            subtitle: 'Administrative staff members',
            icon: Icons.manage_accounts_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 18),
          StatCard(
            label: 'Total Staff',
            value: '${_staff!.length}',
            icon: Icons.people_alt_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 14),
          if (bars.isNotEmpty) ...[
            const SectionHeader(title: 'Staff by Role', subtitle: 'Distribution'),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
              child: MiniBarChart(bars: bars, height: 160),
            ),
          ],
          const SectionHeader(title: 'All Staff'),
          for (final u in _staff!)
            ListRow(
              title: u.name,
              subtitle: u.email ?? '',
              leading: AppAvatar(initials: u.name, color: AppColors.primary, size: 40, useGradient: true),
              icon: Icons.person_rounded,
              accentColor: AppColors.primary,
              trailing: StatusChip(text: u.role, type: StatusType.info, compact: true),
            ),
        ],
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
    final activeCount = _teachers!.where((t) => t.blocked == 0).length;
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Teachers',
            subtitle: 'All faculty members',
            icon: Icons.people_rounded,
            gradient: AppColors.infoGradient,
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.12,
            children: [
              StatCard(label: 'Total', value: '${_teachers!.length}', icon: Icons.people_alt_rounded, gradient: AppColors.primaryGradient),
              StatCard(label: 'Active', value: '$activeCount', icon: Icons.check_circle_rounded, gradient: AppColors.successGradient),
            ],
          ),
          const SizedBox(height: 14),
          const SectionHeader(title: 'All Teachers'),
          for (final t in _teachers!)
            ListRow(
              title: t.name,
              subtitle: t.title ?? t.email ?? 'Teacher',
              leading: AppAvatar(initials: t.name, color: AppColors.info, size: 40, useGradient: true),
              icon: Icons.person_rounded,
              accentColor: AppColors.info,
            ),
        ],
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
    final activeCount = _students!.where((s) => s.blocked == 0).length;
    // Build chart by class
    final classCount = <String, int>{};
    for (final s in _students!) {
      final cls = s.className ?? 'Unknown';
      classCount[cls] = (classCount[cls] ?? 0) + 1;
    }
    final bars = classCount.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final chartBars = bars.take(6).map((e) => BarData(
      label: e.key.length > 6 ? e.key.substring(0, 6) : e.key,
      value: e.value.toDouble(),
      gradient: AppColors.primaryGradient,
    )).toList();

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Students',
            subtitle: 'All enrolled students',
            icon: Icons.school_rounded,
            gradient: AppColors.warningGradient,
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.12,
            children: [
              StatCard(label: 'Total', value: '${_students!.length}', icon: Icons.people_alt_rounded, gradient: AppColors.primaryGradient),
              StatCard(label: 'Active', value: '$activeCount', icon: Icons.check_circle_rounded, gradient: AppColors.successGradient),
              StatCard(label: 'Classes', value: '${classCount.length}', icon: Icons.class_rounded, color: AppColors.info),
              StatCard(label: 'Avg/Class', value: classCount.isEmpty ? '0' : '${(_students!.length / classCount.length).round()}', icon: Icons.people_outline, gradient: AppColors.warningGradient),
            ],
          ),
          const SizedBox(height: 14),
          if (chartBars.isNotEmpty) ...[
            const SectionHeader(title: 'Students per Class', subtitle: 'Distribution'),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
              child: MiniBarChart(bars: chartBars, height: 180),
            ),
          ],
          const SectionHeader(title: 'All Students'),
          for (final s in _students!.take(100))
            ListRow(
              title: s.name,
              subtitle: '${s.className ?? ''} ${s.section ?? ''} • ${s.rollNo ?? ''}',
              leading: AppAvatar(initials: s.name, color: AppColors.primary, size: 40, useGradient: true),
              icon: Icons.school_rounded,
              accentColor: AppColors.primary,
            ),
        ],
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
    final collected = double.tryParse('${_finance?['totalCollected'] ?? 0}') ?? 0;
    final pending = double.tryParse('${_finance?['totalPending'] ?? 0}') ?? 0;
    final invoiceCount = int.tryParse('${_finance?['invoiceCount'] ?? 0}') ?? 0;
    final collectedPct = (collected + pending) > 0 ? (collected / (collected + pending)).clamp(0.0, 1.0) : 0.0;
    final paidCount = _invoices?.where((i) => i.isPaid).length ?? 0;
    final unpaidCount = _invoices?.where((i) => !i.isPaid).length ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Fee Collection',
            subtitle: 'College-wide financial overview',
            icon: Icons.account_balance_wallet_rounded,
            gradient: AppColors.successGradient,
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.12,
            children: [
              StatCard(label: 'Collected', value: formatMoney(collected), icon: Icons.savings_outlined, gradient: AppColors.successGradient),
              StatCard(label: 'Pending', value: formatMoney(pending), icon: Icons.pending_actions, gradient: AppColors.warningGradient),
              StatCard(label: 'Invoices', value: '$invoiceCount', icon: Icons.receipt_long_rounded, color: AppColors.info),
              StatCard(label: 'Paid', value: '$paidCount', icon: Icons.check_circle_rounded, gradient: AppColors.primaryGradient),
            ],
          ),
          const SizedBox(height: 14),
          GradientSummary.pair(
            label1: 'Collected',
            value1: formatMoney(collected),
            label2: 'Pending',
            value2: formatMoney(pending),
            gradient: AppColors.warmGradient,
          ),
          // Donut chart for collection rate
          const SectionHeader(title: 'Collection Rate'),
          PremiumCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                DonutChart(
                  percent: collectedPct,
                  centerLabel: '${(collectedPct * 100).toStringAsFixed(0)}%',
                  centerSub: 'Collected',
                  gradient: AppColors.successGradient,
                  size: 100,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _MiniStatRow(color: AppColors.success, label: 'Paid', value: '$paidCount'),
                      const SizedBox(height: 8),
                      _MiniStatRow(color: AppColors.warning, label: 'Unpaid', value: '$unpaidCount'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Recent Invoices'),
          if (_invoices != null)
            for (final inv in _invoices!.take(20))
              ListRow(
                title: inv.studentName,
                subtitle: 'Rs ${inv.amount} • ${inv.status}',
                icon: inv.status == 'paid' ? Icons.check_circle : Icons.pending,
                accentColor: inv.status == 'paid' ? AppColors.success : AppColors.warning,
              ),
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
    int totalEntries = 0;
    int presentEntries = 0;
    for (final r in _records!) {
      for (final status in r.records.values) {
        totalEntries++;
        if (status == 'present') presentEntries++;
      }
    }
    final rate = totalEntries > 0 ? (presentEntries * 100 / totalEntries).round() : 0;
    final ratePct = totalEntries > 0 ? (presentEntries / totalEntries).clamp(0.0, 1.0) : 0.0;
    final absentEntries = totalEntries - presentEntries;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Attendance',
            subtitle: 'College-wide attendance overview',
            icon: Icons.check_circle_rounded,
            gradient: AppColors.successGradient,
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.12,
            children: [
              StatCard(label: 'Sessions', value: '${_records!.length}', icon: Icons.calendar_today_rounded, gradient: AppColors.primaryGradient),
              StatCard(label: 'Total Entries', value: '$totalEntries', icon: Icons.people_alt_rounded, color: AppColors.info),
              StatCard(label: 'Present', value: '$presentEntries', icon: Icons.check_circle_rounded, gradient: AppColors.successGradient),
              StatCard(label: 'Rate', value: '$rate%', icon: Icons.trending_up_rounded, gradient: AppColors.warningGradient),
            ],
          ),
          const SizedBox(height: 14),
          // Donut chart for attendance rate
          const SectionHeader(title: 'Attendance Rate'),
          PremiumCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                DonutChart(
                  percent: ratePct,
                  centerLabel: '$rate%',
                  centerSub: 'Present',
                  gradient: AppColors.successGradient,
                  size: 100,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _MiniStatRow(color: AppColors.success, label: 'Present', value: '$presentEntries'),
                      const SizedBox(height: 8),
                      _MiniStatRow(color: AppColors.danger, label: 'Absent', value: '$absentEntries'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Recent Sessions'),
          for (final r in _records!.take(30))
            ListRow(
              title: r.date,
              subtitle: '${r.records.length} students',
              icon: Icons.check_circle_rounded,
              accentColor: AppColors.primary,
            ),
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
    // Build chart bars for results
    final bars = _results!.take(6).map((r) {
      final avg = r.records.isNotEmpty
          ? (r.records.values.reduce((a, b) => a + b) / r.records.length)
          : 0.0;
      return BarData(
        label: r.exam.length > 6 ? r.exam.substring(0, 6) : r.exam,
        value: avg,
        gradient: AppColors.primaryGradient,
      );
    }).toList();

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Results',
            subtitle: 'College-wide exam performance',
            icon: Icons.emoji_events_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 18),
          StatCard(
            label: 'Total Exams',
            value: '${_results!.length}',
            icon: Icons.assignment_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 14),
          if (bars.isNotEmpty) ...[
            const SectionHeader(title: 'Average Score by Exam', subtitle: 'Top exams'),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
              child: MiniBarChart(bars: bars, height: 180),
            ),
          ],
          const SectionHeader(title: 'All Exams'),
          for (final r in _results!.take(50))
            ListRow(
              title: r.exam,
              subtitle: '${r.records.length} students • Max: ${r.totalMarks}',
              icon: Icons.assignment_rounded,
              accentColor: AppColors.primary,
              trailing: Text(
                r.records.isNotEmpty
                    ? (r.records.values.reduce((a, b) => a + b) / r.records.length).toStringAsFixed(1)
                    : '0',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
            ),
        ],
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
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const GradientHero(
            eyebrow: 'Super Admin',
            title: 'Announcements',
            subtitle: 'College-wide announcements',
            icon: Icons.campaign_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 18),
          StatCard(
            label: 'Total',
            value: '${_items!.length}',
            icon: Icons.campaign_rounded,
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 14),
          const SectionHeader(title: 'All Announcements'),
          for (final a in _items!)
            ListRow(
              title: a.title,
              subtitle: a.message,
              icon: Icons.campaign_rounded,
              accentColor: AppColors.primary,
            ),
        ],
      ),
    );
  }
}

// ── Mini stat row for donut chart legends ──
class _MiniStatRow extends StatelessWidget {
  final Color color;
  final String label;
  final String value;
  const _MiniStatRow({required this.color, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 10, height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ),
        Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      ],
    );
  }
}
