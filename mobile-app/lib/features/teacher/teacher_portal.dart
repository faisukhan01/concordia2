// Teacher portal — attendance, results, classes, announcements.
// Premium redesign with parallel fetching + 60s in-memory cache.
//
// All five tabs (dashboard, classes, attendance, results, announcements)
// use the shared premium widget kit (GradientHero, StatCard, ListRow,
// PremiumCard, MiniBarChart, DonutChart, etc.) and the new AppColors /
// AppShadows / AppRadii system.
//
// Performance: independent API calls are run in parallel via
// `parallelFetch` from api_cache.dart, and mutations invalidate the
// relevant cache prefix so subsequent reads re-fetch fresh data.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_cache.dart' show parallelFetch;
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import '../shared/nav_items.dart';

class TeacherPortal extends StatefulWidget {
  final TeacherTab initialTab;
  const TeacherPortal({super.key, this.initialTab = TeacherTab.dashboard});

  @override
  State<TeacherPortal> createState() => _TeacherPortalState();
}

class _TeacherPortalState extends State<TeacherPortal> {
  @override
  Widget build(BuildContext context) {
    switch (widget.initialTab) {
      case TeacherTab.dashboard:
        return const _TDashboard();
      case TeacherTab.classes:
        return const _TClasses();
      case TeacherTab.attendance:
        return const _TAttendance();
      case TeacherTab.results:
        return const _TResults();
      case TeacherTab.announcements:
        return const _TAnnouncements();
    }
  }
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
class _TDashboard extends StatefulWidget {
  const _TDashboard();
  @override
  State<_TDashboard> createState() => _TDashboardState();
}

class _TDashboardState extends State<_TDashboard> {
  Map<String, dynamic>? _analytics;
  List<Announcement> _announcements = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Parallel: analytics + announcements — saves a full network round-trip.
      final results = await parallelFetch<dynamic>([
        () => ApiClient().teacherAnalytics(),
        () => ApiClient().listAnnouncements(),
      ]);
      _analytics = results[0] as Map<String, dynamic>?;
      final ann = results[1];
      if (ann is List) {
        _announcements = (ann).take(3).cast<Announcement>().toList();
      } else {
        _announcements = [];
      }
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load dashboard';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.read<AuthProvider>().user!;
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.all(16),
        physics: const NeverScrollableScrollPhysics(),
        children: [
          Container(
            height: 132,
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(AppRadii.lg),
            ),
          ),
          const SizedBox(height: 16),
          const LoadingGrid(count: 4),
          const SizedBox(height: 16),
          const LoadingList(count: 3, height: 72),
        ],
      );
    }
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final a = _analytics ?? {};
    final kpi = (a['kpi'] as Map<String, dynamic>?) ?? {};
    final assignments = (a['assignments'] as List?) ?? [];
    final classPerf = (a['classPerformance'] as List?) ?? [];
    final attTrend = (a['attendanceTrend'] as List?) ?? [];

    final classCount = _int(kpi['totalClasses']);
    final studentCount = _int(kpi['totalStudents']);
    final attSessions = _int(kpi['attendanceSessions']);
    final attRate = _int(kpi['attendanceRate']);

    final firstName = _firstName(user.name);
    final subtitleParts = <String>[];
    if (user.title != null && user.title!.isNotEmpty) subtitleParts.add(user.title!);
    if (user.branchName != null && user.branchName!.isNotEmpty) {
      subtitleParts.add(user.branchName!);
    } else {
      subtitleParts.add(user.roleLabel);
    }
    final subtitle = subtitleParts.join(' · ');

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          GradientHero(
            eyebrow: 'Teacher Portal',
            title: 'Assalam-o-Alaikum, $firstName',
            subtitle: subtitle,
            icon: Icons.school_rounded,
            gradient: AppColors.warmGradient,
          ),
          const SizedBox(height: 18),
          // 2x2 StatCard grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.05,
            children: [
              StatCard(
                label: 'My Classes',
                value: '$classCount',
                icon: Icons.class_rounded,
                gradient: AppColors.primaryGradient,
              ),
              StatCard(
                label: 'My Students',
                value: '$studentCount',
                icon: Icons.people_alt_rounded,
                gradient: AppColors.infoGradient,
              ),
              StatCard(
                label: 'Classes Today',
                value: '$attSessions',
                icon: Icons.event_available_rounded,
                gradient: AppColors.successGradient,
              ),
              StatCard(
                label: 'Avg Attendance',
                value: '$attRate%',
                icon: Icons.check_circle_rounded,
                gradient: AppColors.warningGradient,
              ),
            ],
          ),
          const SizedBox(height: 16),
          GradientSummary.pair(
            label1: 'Classes Today',
            value1: '$attSessions',
            label2: 'Students',
            value2: '$studentCount',
            gradient: AppColors.sunsetGradient,
          ),
          if (classPerf.isNotEmpty) ...[
            const SectionHeader(
              title: 'Class Performance',
              subtitle: 'Average score per class',
              padding: EdgeInsets.only(top: 26, bottom: 10),
            ),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 8),
              child: MiniBarChart(
                height: 200,
                bars: [
                  for (final c in classPerf.take(5))
                    BarData(
                      label: '${c['className'] ?? '?'}',
                      value: _double(c['avgScore']),
                      gradient: AppColors.warmGradient,
                    ),
                ],
              ),
            ),
          ],
          if (assignments.isNotEmpty) ...[
            const SectionHeader(
              title: "Today's Schedule",
              subtitle: 'Your class assignments',
              padding: EdgeInsets.only(top: 26, bottom: 10),
            ),
            for (final asg in assignments.take(5))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: ListRow(
                  title: '${asg['courseName'] ?? 'Course'}',
                  subtitle:
                      'Class ${asg['className'] ?? '-'} · Section ${asg['section'] ?? '-'}',
                  eyebrow: asg['courseCode']?.toString(),
                  leading: const _GradientIconTile(
                    icon: Icons.menu_book_rounded,
                    gradient: AppColors.purpleGradient,
                  ),
                  accentColor: AppColors.purple,
                ),
              ),
          ],
          if (attTrend.isNotEmpty) ...[
            const SectionHeader(
              title: 'Attendance Trend',
              subtitle: 'Recent sessions',
              padding: EdgeInsets.only(top: 26, bottom: 10),
            ),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 8),
              child: MiniBarChart(
                height: 180,
                bars: [
                  for (final t in attTrend.take(6))
                    BarData(
                      label: '${t['label'] ?? ''}',
                      value: _double(t['rate']),
                      gradient: AppColors.successGradient,
                    ),
                ],
              ),
            ),
          ],
          const SectionHeader(
            title: 'Recent Announcements',
            subtitle: 'Latest from your school',
            padding: EdgeInsets.only(top: 26, bottom: 10),
          ),
          if (_announcements.isEmpty)
            const EmptyState(
              icon: Icons.campaign_outlined,
              title: 'No announcements yet',
            )
          else
            for (final an in _announcements)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: PremiumCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        an.title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        an.message,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// CLASSES
// ════════════════════════════════════════════════════════════════
class _TClasses extends StatefulWidget {
  const _TClasses();
  @override
  State<_TClasses> createState() => _TClassesState();
}

class _TClassesState extends State<_TClasses> {
  List<SchoolClass> _classes = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _classes = await ApiClient().teacherClasses();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load classes';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openClassDetail(SchoolClass c) async {
    List<User> students = [];
    try {
      final auth = context.read<AuthProvider>();
      final all = await ApiClient().listUsers(
        role: 'student',
        branchId: auth.user!.branchId,
      );
      students = all
          .where((s) => s.className == c.name && s.section == c.section)
          .toList();
    } catch (_) {}

    if (!mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (ctx) => Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(ctx).size.height * 0.82,
        ),
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.borderStrong,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 14),
              child: Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      gradient: appGradient(AppColors.primaryGradient),
                      borderRadius: BorderRadius.circular(AppRadii.md),
                      boxShadow: AppShadows.subtle,
                    ),
                    child: const Icon(Icons.class_rounded,
                        color: Colors.white, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Class ${c.name} — ${c.section}',
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${students.length} students enrolled',
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(
              child: students.isEmpty
                  ? const EmptyState(
                      icon: Icons.people_outline,
                      title: 'No students in this class',
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      shrinkWrap: true,
                      itemCount: students.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) {
                        final s = students[i];
                        return ListRow(
                          title: s.name,
                          subtitle: s.rollNo != null
                              ? 'Roll #${s.rollNo}'
                              : 'Student ${i + 1}',
                          accentColor: AppColors.info,
                          initials: s.name.isNotEmpty ? s.name[0] : '?',
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6, height: 76);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: _classes.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                SizedBox(height: 80),
                EmptyState(
                  icon: Icons.class_outlined,
                  title: 'No classes assigned',
                  subtitle: 'The Academic Office will assign classes to you.',
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                GradientHero(
                  eyebrow: 'Teaching',
                  title: 'My Classes',
                  subtitle: '${_classes.length} classes assigned to you',
                  icon: Icons.class_rounded,
                  gradient: AppColors.infoGradient,
                ),
                const SizedBox(height: 16),
                for (final c in _classes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ListRow(
                      title: 'Class ${c.name} — ${c.section}',
                      subtitle:
                          c.studentCount != null ? '${c.studentCount} students' : null,
                      eyebrow: 'Class',
                      leading: const _GradientIconTile(
                        icon: Icons.class_rounded,
                        gradient: AppColors.primaryGradient,
                      ),
                      accentColor: AppColors.primary,
                      onTap: () => _openClassDetail(c),
                    ),
                  ),
              ],
            ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// ATTENDANCE
// ════════════════════════════════════════════════════════════════
class _TAttendance extends StatefulWidget {
  const _TAttendance();
  @override
  State<_TAttendance> createState() => _TAttendanceState();
}

class _TAttendanceState extends State<_TAttendance> {
  List<SchoolClass> _classes = [];
  List<User> _students = [];
  SchoolClass? _selectedClass;
  DateTime _selectedDate = DateTime.now();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  Map<String, String> _marks = {}; // studentId -> present|absent|late

  @override
  void initState() {
    super.initState();
    _loadClassesAndStudents();
  }

  Future<void> _loadClassesAndStudents() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      // Parallel: teacher's classes + branch students (filtered locally).
      final results = await parallelFetch<dynamic>([
        () => api.teacherClasses(),
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
      ]);
      _classes = (results[0] as List?)?.cast<SchoolClass>() ?? [];
      final all = (results[1] as List?)?.cast<User>() ?? [];
      if (_classes.isNotEmpty) {
        _selectedClass = _classes.first;
        _students = all
            .where((s) =>
                s.className == _selectedClass!.name &&
                s.section == _selectedClass!.section)
            .toList();
        _marks = {for (final s in _students) s.id: 'present'};
      } else {
        _students = [];
        _marks = {};
      }
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _switchClass(SchoolClass c) async {
    setState(() {
      _selectedClass = c;
      _students = [];
      _marks = {};
    });
    try {
      final auth = context.read<AuthProvider>();
      final all = await ApiClient().listUsers(
        role: 'student',
        branchId: auth.user!.branchId,
      );
      _students = all
          .where((s) => s.className == c.name && s.section == c.section)
          .toList();
      _marks = {for (final s in _students) s.id: 'present'};
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2024, 1, 1),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (d != null) setState(() => _selectedDate = d);
  }

  Future<void> _submit() async {
    if (_selectedClass == null || _saving) return;
    setState(() => _saving = true);
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().markAttendance({
        'branchId': auth.user!.branchId,
        'classId': _selectedClass!.id,
        'date': _selectedDate.toIso8601String().substring(0, 10),
        'teacherId': auth.user!.id,
        'records': _marks,
      });
      ApiClient().invalidate('attendance'); // force fresh read next time
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(children: [
              Icon(Icons.check_circle, color: Colors.white, size: 18),
              SizedBox(width: 10),
              Text('Attendance saved successfully'),
            ]),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } on ApiException catch (e) {
      _snack(e.message, AppColors.danger);
    } catch (_) {
      _snack('Failed to save attendance', AppColors.danger);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }

  int _countBy(String status) => _marks.values.where((v) => v == status).length;

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 8, height: 76);
    if (_error != null) {
      return ErrorState(message: _error!, onRetry: _loadClassesAndStudents);
    }
    if (_classes.isEmpty) {
      return const EmptyState(
        icon: Icons.class_outlined,
        title: 'No classes assigned',
        subtitle: 'You need assigned classes to mark attendance.',
      );
    }

    final present = _countBy('present');
    final total = _students.length;

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadClassesAndStudents,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                // Gradient header card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.primaryGradient),
                    borderRadius: BorderRadius.circular(AppRadii.lg),
                    boxShadow: AppShadows.card,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'MARK ATTENDANCE',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.white.withOpacity(0.85),
                                letterSpacing: 1.2,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _selectedClass != null
                                  ? 'Class ${_selectedClass!.name} — ${_selectedClass!.section}'
                                  : 'Select a class',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              formatDate(_selectedDate.toIso8601String()),
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.white.withOpacity(0.9),
                              ),
                            ),
                          ],
                        ),
                      ),
                      GestureDetector(
                        onTap: _pickDate,
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.22),
                            borderRadius: BorderRadius.circular(AppRadii.md),
                          ),
                          child: const Icon(Icons.calendar_today_rounded,
                              color: Colors.white, size: 20),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                // Class dropdown
                _PremiumDropdown<SchoolClass>(
                  value: _selectedClass,
                  items: _classes,
                  label: _classes.isEmpty ? 'No classes' : 'Select class',
                  display: (c) => 'Class ${c.name} — ${c.section}',
                  onChanged: (c) {
                    if (c != null) _switchClass(c);
                  },
                ),
                const SizedBox(height: 16),
                // Summary: DonutChart + counts
                PremiumCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      DonutChart(
                        percent: total == 0 ? 0 : present / total,
                        centerLabel: '$present/$total',
                        centerSub: 'Present',
                        gradient: AppColors.successGradient,
                        size: 110,
                      ),
                      const SizedBox(width: 18),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _summaryRow('Present', present, AppColors.success),
                            const SizedBox(height: 8),
                            _summaryRow(
                                'Absent', _countBy('absent'), AppColors.danger),
                            const SizedBox(height: 8),
                            _summaryRow(
                                'Late', _countBy('late'), AppColors.warning),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                const SectionHeader(
                  title: 'Student List',
                  subtitle: 'Tap a status chip to mark',
                  padding: EdgeInsets.zero,
                ),
                if (_students.isEmpty)
                  const EmptyState(
                      icon: Icons.people_outline,
                      title: 'No students in this class')
                else
                  for (final s in _students)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: PremiumCard(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        child: Row(
                          children: [
                            AppAvatar(
                              initials: s.name.isNotEmpty ? s.name[0] : '?',
                              color: AppColors.info,
                              size: 38,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                s.name,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            _StatusToggle(
                              status: _marks[s.id] ?? 'present',
                              onChanged: (v) =>
                                  setState(() => _marks[s.id] = v),
                            ),
                          ],
                        ),
                      ),
                    ),
                const SizedBox(height: 80),
              ],
            ),
          ),
        ),
        // Pinned bottom save bar
        Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          decoration: const BoxDecoration(
            color: AppColors.background,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: SafeArea(
            top: false,
            child: _GradientSaveButton(
              label: 'Save Attendance',
              icon: Icons.save_rounded,
              loading: _saving,
              onPressed: _submit,
            ),
          ),
        ),
      ],
    );
  }

  Widget _summaryRow(String label, int value, Color color) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              )),
        ),
        Text('$value',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: color,
            )),
      ],
    );
  }
}

class _StatusToggle extends StatelessWidget {
  final String status;
  final ValueChanged<String> onChanged;
  const _StatusToggle({required this.status, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _chip('P', 'present', AppColors.success),
          _chip('A', 'absent', AppColors.danger),
          _chip('L', 'late', AppColors.warning),
        ],
      ),
    );
  }

  Widget _chip(String label, String value, Color color) {
    final active = status == value;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 34,
        height: 30,
        margin: const EdgeInsets.symmetric(horizontal: 2),
        decoration: BoxDecoration(
          color: active ? color : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: active ? Colors.white : color,
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════════════════════════
class _TResults extends StatefulWidget {
  const _TResults();
  @override
  State<_TResults> createState() => _TResultsState();
}

class _TResultsState extends State<_TResults> {
  List<SchoolClass> _classes = [];
  List<Exam> _exams = [];
  List<User> _students = [];
  List<User> _allStudents = [];
  SchoolClass? _selectedClass;
  Exam? _selectedExam;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  Map<String, int> _marks = {};
  final _totalController = TextEditingController(text: '100');
  Map<String, TextEditingController> _controllers = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      // Parallel: classes + exams + branch students.
      final results = await parallelFetch<dynamic>([
        () => api.teacherClasses(),
        () => api.listExams(branchId: auth.user!.branchId),
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
      ]);
      _classes = (results[0] as List?)?.cast<SchoolClass>() ?? [];
      _exams = (results[1] as List?)?.cast<Exam>() ?? [];
      _allStudents = (results[2] as List?)?.cast<User>() ?? [];
      if (_classes.isNotEmpty) {
        _selectedClass = _classes.first;
        _filterStudents();
      }
      if (_exams.isNotEmpty) _selectedExam = _exams.first;
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _filterStudents() {
    final oldControllers = _controllers;
    if (_selectedClass == null) {
      _students = [];
      _marks.clear();
      _controllers = {};
    } else {
      _students = _allStudents
          .where((s) =>
              s.className == _selectedClass!.name &&
              s.section == _selectedClass!.section)
          .toList();
      _marks = {for (final s in _students) s.id: 0};
      _controllers = {
        for (final s in _students) s.id: TextEditingController(text: '0'),
      };
    }
    // Dispose old controllers after the next frame so any mounted TextField
    // has been rebuilt with the new controllers first.
    if (oldControllers.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        for (final c in oldControllers.values) {
          c.dispose();
        }
      });
    }
  }

  Future<void> _submit() async {
    if (_selectedClass == null || _selectedExam == null || _saving) return;
    setState(() => _saving = true);
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().submitResults({
        'branchId': auth.user!.branchId,
        'classId': _selectedClass!.id,
        'exam': _selectedExam!.name,
        'totalMarks': int.tryParse(_totalController.text) ?? 100,
        'date': DateTime.now().toIso8601String().substring(0, 10),
        'teacherId': auth.user!.id,
        'records': _marks,
      });
      ApiClient().invalidate('results'); // force fresh read next time
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(children: [
              Icon(Icons.check_circle, color: Colors.white, size: 18),
              SizedBox(width: 10),
              Text('Results submitted successfully'),
            ]),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } on ApiException catch (e) {
      _snack(e.message, AppColors.danger);
    } catch (_) {
      _snack('Failed to submit results', AppColors.danger);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }

  double get _classAverage {
    if (_marks.isEmpty) return 0;
    final total = int.tryParse(_totalController.text) ?? 100;
    if (total == 0) return 0;
    final sum = _marks.values.fold<int>(0, (a, b) => a + b);
    return (sum / _marks.length / total) * 100;
  }

  @override
  void dispose() {
    _totalController.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 8, height: 76);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                // Gradient header
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.purpleGradient),
                    borderRadius: BorderRadius.circular(AppRadii.lg),
                    boxShadow: AppShadows.card,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'TEST RESULTS',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.white.withOpacity(0.85),
                                letterSpacing: 1.2,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _selectedExam?.name ?? 'Select an exam',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _selectedClass != null
                                  ? 'Class ${_selectedClass!.name} — ${_selectedClass!.section}'
                                  : '',
                              style: TextStyle(
                                fontSize: 13,
                                color: Colors.white.withOpacity(0.9),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.22),
                          borderRadius: BorderRadius.circular(AppRadii.md),
                        ),
                        child: const Icon(Icons.grade_rounded,
                            color: Colors.white, size: 22),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                // Compact stat row
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        label: 'Class Average',
                        value: '${_classAverage.toStringAsFixed(1)}%',
                        icon: Icons.trending_up_rounded,
                        gradient: AppColors.successGradient,
                        compact: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: StatCard(
                        label: 'Total Marks',
                        value: _totalController.text,
                        icon: Icons.flag_rounded,
                        color: AppColors.info,
                        compact: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: StatCard(
                        label: 'Students',
                        value: '${_students.length}',
                        icon: Icons.people_alt_rounded,
                        color: AppColors.purple,
                        compact: true,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                // Class + Exam selectors
                Row(
                  children: [
                    Expanded(
                      child: _PremiumDropdown<SchoolClass>(
                        value: _selectedClass,
                        items: _classes,
                        label: 'Class',
                        display: (c) => '${c.name}-${c.section}',
                        onChanged: (c) {
                          if (c != null) {
                            setState(() {
                              _selectedClass = c;
                              _filterStudents();
                            });
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _PremiumDropdown<Exam>(
                        value: _selectedExam,
                        items: _exams,
                        label: 'Exam',
                        display: (e) => e.name,
                        onChanged: (e) {
                          if (e != null) setState(() => _selectedExam = e);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Total marks editor
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    border: Border.all(color: AppColors.border),
                    boxShadow: AppShadows.subtle,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.flag_outlined,
                          size: 20, color: AppColors.primary),
                      const SizedBox(width: 10),
                      const Text('Total Marks',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textSecondary,
                          )),
                      const Spacer(),
                      SizedBox(
                        width: 70,
                        child: TextField(
                          controller: _totalController,
                          keyboardType: TextInputType.number,
                          textAlign: TextAlign.center,
                          decoration: const InputDecoration(
                            isDense: true,
                            border: InputBorder.none,
                            contentPadding: EdgeInsets.zero,
                          ),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                const SectionHeader(
                  title: 'Student Marks',
                  subtitle: 'Enter obtained marks per student',
                  padding: EdgeInsets.zero,
                ),
                if (_students.isEmpty)
                  const EmptyState(
                      icon: Icons.people_outline, title: 'No students')
                else
                  for (final s in _students)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: PremiumCard(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        child: Row(
                          children: [
                            AppAvatar(
                              initials: s.name.isNotEmpty ? s.name[0] : '?',
                              color: AppColors.purple,
                              size: 38,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                s.name,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            SizedBox(
                              width: 80,
                              child: TextField(
                                controller: _controllers[s.id],
                                keyboardType: TextInputType.number,
                                textAlign: TextAlign.center,
                                decoration: InputDecoration(
                                  hintText: '0',
                                  isDense: true,
                                  contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 10),
                                  border: OutlineInputBorder(
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.sm),
                                    borderSide: const BorderSide(
                                        color: AppColors.border),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.sm),
                                    borderSide: const BorderSide(
                                        color: AppColors.border),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.sm),
                                    borderSide: const BorderSide(
                                        color: AppColors.primary, width: 2),
                                  ),
                                ),
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.textPrimary,
                                ),
                                onChanged: (v) =>
                                    _marks[s.id] = int.tryParse(v) ?? 0,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                const SizedBox(height: 80),
              ],
            ),
          ),
        ),
        // Pinned submit bar
        Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          decoration: const BoxDecoration(
            color: AppColors.background,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: SafeArea(
            top: false,
            child: _GradientSaveButton(
              label: 'Submit Results',
              icon: Icons.send_rounded,
              loading: _saving,
              onPressed: _submit,
            ),
          ),
        ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ════════════════════════════════════════════════════════════════
class _TAnnouncements extends StatefulWidget {
  const _TAnnouncements();
  @override
  State<_TAnnouncements> createState() => _TAnnouncementsState();
}

class _TAnnouncementsState extends State<_TAnnouncements> {
  List<Announcement> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _items = await ApiClient().listAnnouncements();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load announcements';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCreate() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.background,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (ctx) => const _CreateAnnouncementSheet(),
    );
    if (result == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 4, height: 110);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    return Stack(
      children: [
        RefreshIndicator(
          onRefresh: _load,
          child: _items.isEmpty
              ? ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    const SizedBox(height: 60),
                    EmptyState(
                      icon: Icons.campaign_outlined,
                      title: 'No announcements yet',
                      subtitle:
                          'Tap the + button to create your first announcement.',
                      actionLabel: 'Create announcement',
                      onAction: _openCreate,
                    ),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  physics: const AlwaysScrollableScrollPhysics(),
                  itemCount: _items.length + 1,
                  itemBuilder: (_, i) {
                    if (i == 0) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: GradientHero(
                          eyebrow: 'Announcements',
                          title: 'School Updates',
                          subtitle: '${_items.length} announcements posted',
                          icon: Icons.campaign_rounded,
                          gradient: AppColors.sunsetGradient,
                        ),
                      );
                    }
                    final a = _items[i - 1];
                    final isParents = a.targetRole == 'parents';
                    final isStudents = a.targetRole == 'students';
                    final target = isParents
                        ? 'Parents'
                        : isStudents
                            ? 'Students'
                            : 'Everyone';
                    final chipType = isParents
                        ? StatusType.purple
                        : isStudents
                            ? StatusType.info
                            : StatusType.success;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: PremiumCard(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: AppColors.primarySoft,
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.md),
                                  ),
                                  child: const Icon(Icons.campaign_rounded,
                                      color: AppColors.primary, size: 20),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        a.title,
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.textPrimary,
                                        ),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      if (a.senderName != null &&
                                          a.senderName!.isNotEmpty) ...[
                                        const SizedBox(height: 2),
                                        Text(
                                          a.senderName!,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: AppColors.textMuted,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                StatusChip(
                                    text: target, type: chipType, compact: true),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              a.message,
                              style: const TextStyle(
                                fontSize: 13.5,
                                color: AppColors.textSecondary,
                                height: 1.45,
                              ),
                            ),
                            if (a.createdAt != null) ...[
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  const Icon(Icons.access_time_rounded,
                                      size: 13, color: AppColors.textMuted),
                                  const SizedBox(width: 4),
                                  Text(
                                    formatDate(a.createdAt),
                                    style: const TextStyle(
                                      fontSize: 11.5,
                                      color: AppColors.textMuted,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        Positioned(
          right: 16,
          bottom: 16,
          child: FloatingActionButton.extended(
            onPressed: _openCreate,
            icon: const Icon(Icons.add_rounded),
            label: const Text('New'),
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            elevation: 4,
          ),
        ),
      ],
    );
  }
}

class _CreateAnnouncementSheet extends StatefulWidget {
  const _CreateAnnouncementSheet();
  @override
  State<_CreateAnnouncementSheet> createState() =>
      _CreateAnnouncementSheetState();
}

class _CreateAnnouncementSheetState extends State<_CreateAnnouncementSheet> {
  final _title = TextEditingController();
  final _message = TextEditingController();
  String _target = 'students';
  bool _posting = false;

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty ||
        _message.text.trim().isEmpty ||
        _posting) {
      return;
    }
    setState(() => _posting = true);
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createAnnouncement({
        'title': _title.text.trim(),
        'message': _message.text.trim(),
        'targetRole': _target,
        'targetScope': 'all',
        'senderId': auth.user!.id,
        'senderRole': 'teacher',
        'branchId': auth.user!.branchId,
      });
      ApiClient().invalidate('announcements'); // force fresh read
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(children: [
              Icon(Icons.check_circle, color: Colors.white, size: 18),
              SizedBox(width: 10),
              Text('Announcement posted'),
            ]),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.of(context).pop(true);
      }
    } on ApiException catch (e) {
      _snack(e.message, AppColors.danger);
    } catch (_) {
      _snack('Failed to post announcement', AppColors.danger);
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  void _snack(String msg, Color color) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }

  @override
  void dispose() {
    _title.dispose();
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.borderStrong,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      gradient: appGradient(AppColors.primaryGradient),
                      borderRadius: BorderRadius.circular(AppRadii.md),
                    ),
                    child: const Icon(Icons.campaign_rounded,
                        color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'New Announcement',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Title',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textSecondary,
                        )),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _title,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                          hintText: 'e.g. Homework reminder'),
                    ),
                    const SizedBox(height: 14),
                    const Text('Message',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textSecondary,
                        )),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _message,
                      maxLines: 4,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Write your announcement...',
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text('Target Audience',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textSecondary,
                        )),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _TargetOption(
                            value: 'students',
                            label: 'Students',
                            icon: Icons.school_rounded,
                            color: AppColors.info,
                            active: _target == 'students',
                            onTap: () => setState(() => _target = 'students'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _TargetOption(
                            value: 'parents',
                            label: 'Parents',
                            icon: Icons.family_restroom_rounded,
                            color: AppColors.purple,
                            active: _target == 'parents',
                            onTap: () => setState(() => _target = 'parents'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    _GradientSaveButton(
                      label: _posting ? 'Posting...' : 'Post Announcement',
                      icon: Icons.send_rounded,
                      loading: _posting,
                      onPressed: _submit,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════════

/// Compact gradient-filled icon tile used as `ListRow.leading`.
class _GradientIconTile extends StatelessWidget {
  final IconData icon;
  final List<Color> gradient;
  const _GradientIconTile({
    required this.icon,
    required this.gradient,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        gradient: appGradient(gradient),
        borderRadius: BorderRadius.circular(AppRadii.md),
        boxShadow: AppShadows.subtle,
      ),
      child: Icon(icon, color: Colors.white, size: 20),
    );
  }
}

/// Full-width gradient save button with loading spinner state.
class _GradientSaveButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool loading;
  final VoidCallback onPressed;
  const _GradientSaveButton({
    required this.label,
    required this.icon,
    required this.loading,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: loading ? null : onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 15),
        decoration: BoxDecoration(
          gradient: appGradient(AppColors.primaryGradient),
          borderRadius: BorderRadius.circular(AppRadii.md),
          boxShadow: AppShadows.button,
        ),
        child: Center(
          child: loading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    color: Colors.white,
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, color: Colors.white, size: 18),
                    const SizedBox(width: 8),
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Premium-styled dropdown that matches the new design system.
class _PremiumDropdown<T> extends StatelessWidget {
  final T? value;
  final List<T> items;
  final String label;
  final String Function(T) display;
  final ValueChanged<T?> onChanged;
  const _PremiumDropdown({
    required this.value,
    required this.items,
    required this.label,
    required this.display,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: AppColors.border),
        boxShadow: AppShadows.subtle,
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          isExpanded: true,
          hint: Text(label,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textMuted,
              )),
          icon: const Icon(Icons.keyboard_arrow_down_rounded,
              color: AppColors.textMuted),
          items: items
              .map((t) => DropdownMenuItem<T>(
                    value: t,
                    child: Text(
                      display(t),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ))
              .toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

class _TargetOption extends StatelessWidget {
  final String value;
  final String label;
  final IconData icon;
  final Color color;
  final bool active;
  final VoidCallback onTap;
  const _TargetOption({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
        decoration: BoxDecoration(
          color: active ? color.withOpacity(0.1) : AppColors.card,
          borderRadius: BorderRadius.circular(AppRadii.md),
          border: Border.all(
            color: active ? color : AppColors.border,
            width: active ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: active ? color : AppColors.textSecondary,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Numeric helpers (defensive parsing of analytics payload) ─────
int _int(dynamic v, [int def = 0]) {
  if (v == null) return def;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? def;
  return def;
}

double _double(dynamic v, [double def = 0]) {
  if (v == null) return def;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? def;
  return def;
}

String _firstName(String name) {
  if (name.isEmpty) return '';
  return name.trim().split(RegExp(r'\s+')).first;
}
