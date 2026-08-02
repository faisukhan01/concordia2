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
  List<SchoolClass> _classes = [];
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
      final results = await parallelFetch<dynamic>([
        () => ApiClient().teacherAnalytics(),
        () => ApiClient().teacherClasses(),
        () => ApiClient().listAnnouncements(),
      ]);
      if (!mounted) return;
      setState(() {
        _analytics = results[0] as Map<String, dynamic>?;
        _classes = (results[1] as List<SchoolClass>?) ?? [];
        _announcements = (results[2] as List<Announcement>?) ?? [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingGrid(count: 4);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final totalStudents = _analytics?['totalStudents'] as int? ?? 0;
    final avgAttendance = _analytics?['avgAttendance'] as num? ?? 0;
    final avgPerformance = _analytics?['avgPerformance'] as num? ?? 0;
    final attendancePercent = (avgAttendance.toDouble() / 100).clamp(0.0, 1.0);

    // Build class performance chart data
    final bars = <BarData>[];
    for (final c in _classes.take(6)) {
      bars.add(BarData(
        label: c.name.length > 6 ? c.name.substring(0, 6) : c.name,
        value: (c.studentCount ?? 0).toDouble(),
      ));
    }

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          GradientHero(
            title: 'Teacher Dashboard',
            subtitle: 'Manage your classes, attendance, and results.',
            icon: Icons.school_outlined,
          ),
          const SizedBox(height: 16),
          _buildStatGrid(totalStudents, avgAttendance, avgPerformance),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: ConcordiaCard(
                  title: 'Attendance',
                  child: DonutChart(
                    percent: attendancePercent,
                    centerLabel: '${avgAttendance.toDouble().toStringAsFixed(0)}%',
                    centerSub: 'Avg',
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ConcordiaCard(
                  title: 'Class Sizes',
                  child: bars.isNotEmpty
                      ? MiniBarChart(bars: bars, height: 180)
                      : const SizedBox(
                          height: 180,
                          child: Center(
                            child: Text(
                              'No data',
                              style: TextStyle(
                                color: AppColors.textMuted,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildSchedule(),
          const SizedBox(height: 16),
          _buildAnnouncements(),
        ],
      ),
    );
  }

  Widget _buildStatGrid(
      int totalStudents, num avgAttendance, num avgPerformance) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.15,
      children: [
        StatCard(
          label: 'My Classes',
          value: '${_classes.length}',
          icon: Icons.class_outlined,
          color: AppColors.primary,
        ),
        StatCard(
          label: 'Total Students',
          value: '$totalStudents',
          icon: Icons.school_outlined,
          color: AppColors.info,
        ),
        StatCard(
          label: 'Avg Attendance',
          value: '${avgAttendance.toDouble().toStringAsFixed(0)}%',
          icon: Icons.check_circle_outline,
          color: AppColors.success,
        ),
        StatCard(
          label: 'Avg Performance',
          value: '${avgPerformance.toDouble().toStringAsFixed(0)}%',
          icon: Icons.trending_up_outlined,
          color: AppColors.warning,
        ),
      ],
    );
  }

  Widget _buildSchedule() {
    if (_classes.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'My Classes'),
        ..._classes.take(4).map((c) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                title: c.name,
                subtitle:
                    'Section ${c.section} • ${c.studentCount ?? 0} students',
                initials: c.name[0],
                onTap: () {},
              ),
            )),
      ],
    );
  }

  Widget _buildAnnouncements() {
    final recent = _announcements.take(3).toList();
    if (recent.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Announcements'),
        ...recent.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                title: a.title,
                subtitle: a.message.length > 50
                    ? '${a.message.substring(0, 50)}...'
                    : a.message,
                initials: a.title[0],
                trailing: Text(
                  formatDate(a.createdAt),
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
            )),
      ],
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
      final classes = await ApiClient().teacherClasses();
      if (!mounted) return;
      setState(() {
        _classes = classes;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_classes.isEmpty)
            const EmptyState(
              icon: Icons.class_outlined,
              title: 'No Classes',
              subtitle: 'You haven\'t been assigned any classes yet.',
            )
          else
            ..._classes.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: c.name,
                    subtitle:
                        'Section ${c.section} • ${c.studentCount ?? 0} students',
                    initials: c.name[0],
                    onTap: () => _showClassDetail(c),
                  ),
                )),
        ],
      ),
    );
  }

  void _showClassDetail(SchoolClass c) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              c.name,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            _detailRow('Section', c.section),
            _detailRow('Students', '${c.studentCount ?? 0}'),
            _detailRow('Class Teacher', c.teacherName ?? 'You'),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
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
  Map<String, String> _attendanceMap = {}; // studentId -> 'present'|'absent'|'late'
  bool _loading = true;
  String? _error;
  bool _saving = false;

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
      final results = await parallelFetch<dynamic>([
        () => ApiClient().teacherClasses(),
        () => ApiClient().listUsers(role: 'student'),
      ]);
      if (!mounted) return;
      setState(() {
        _classes = (results[0] as List<SchoolClass>?) ?? [];
        _students = (results[1] as List<User>?) ?? [];
        if (_classes.isNotEmpty) {
          _selectedClass = _classes.first;
        }
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<User> get _classStudents {
    if (_selectedClass == null) return [];
    return _students.where((s) => s.className == _selectedClass!.name).toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final students = _classStudents;
    final presentCount = _attendanceMap.values.where((v) => v == 'present').length;
    final absentCount = _attendanceMap.values.where((v) => v == 'absent').length;
    final lateCount = _attendanceMap.values.where((v) => v == 'late').length;
    final attendancePercent = students.isNotEmpty
        ? (presentCount + lateCount) / students.length
        : 0.0;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          // Class selector
          if (_classes.isNotEmpty)
            DropdownButtonFormField<SchoolClass>(
              value: _selectedClass,
              decoration: InputDecoration(
                labelText: 'Select Class',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                ),
              ),
              items: _classes
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text('${c.name} (${c.section})'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() {
                _selectedClass = v;
                _attendanceMap.clear();
              }),
            ),
          const SizedBox(height: 16),
          // Attendance donut
          if (students.isNotEmpty)
            Center(
              child: DonutChart(
                percent: attendancePercent,
                centerLabel: '${(attendancePercent * 100).toStringAsFixed(0)}%',
                centerSub: 'Present',
                size: 120,
              ),
            ),
          const SizedBox(height: 8),
          // Summary chips
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              StatusChip(
                text: 'Present: $presentCount',
                type: StatusType.success,
                compact: true,
              ),
              const SizedBox(width: 8),
              StatusChip(
                text: 'Absent: $absentCount',
                type: StatusType.danger,
                compact: true,
              ),
              const SizedBox(width: 8),
              StatusChip(
                text: 'Late: $lateCount',
                type: StatusType.warning,
                compact: true,
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Student list with P/A/L toggle
          if (students.isEmpty)
            const EmptyState(
              icon: Icons.people_outline,
              title: 'No Students',
              subtitle: 'No students found in this class.',
            )
          else
            ...students.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _AttendanceRow(
                    student: s,
                    status: _attendanceMap[s.id],
                    onChanged: (status) {
                      setState(() {
                        _attendanceMap[s.id] = status;
                      });
                    },
                  ),
                )),
          const SizedBox(height: 16),
          // Save button
          if (students.isNotEmpty)
            ConcordiaButton(
              label: 'Save Attendance',
              icon: Icons.check,
              loading: _saving,
              onPressed: _saving ? null : _saveAttendance,
              large: true,
            ),
        ],
      ),
    );
  }

  Future<void> _saveAttendance() async {
    if (_selectedClass == null) return;
    setState(() => _saving = true);
    try {
      await ApiClient().markAttendance({
        'classId': _selectedClass!.id,
        'date': DateTime.now().toIso8601String().substring(0, 10),
        'records': _attendanceMap,
      });
      ApiClient().invalidate('attendance');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Attendance saved!'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

// ── Attendance row with P/A/L toggle ────────────────────────────

class _AttendanceRow extends StatelessWidget {
  final User student;
  final String? status;
  final ValueChanged<String> onChanged;

  const _AttendanceRow({
    required this.student,
    this.status,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Row(
        children: [
          AppAvatar(
            initials: initialsOf(student.name),
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  student.rollNo ?? student.displayId,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          // P/A/L toggle
          _toggleButton('P', 'present', AppColors.success, AppColors.successSoft),
          const SizedBox(width: 4),
          _toggleButton('A', 'absent', AppColors.danger, AppColors.dangerSoft),
          const SizedBox(width: 4),
          _toggleButton('L', 'late', AppColors.warning, AppColors.warningSoft),
        ],
      ),
    );
  }

  Widget _toggleButton(String label, String value, Color activeColor, Color bg) {
    final isActive = status == value;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: isActive ? activeColor : bg,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isActive ? activeColor : AppColors.border,
            width: 1,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: isActive ? Colors.white : activeColor,
            ),
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
  SchoolClass? _selectedClass;
  Exam? _selectedExam;
  Map<String, TextEditingController> _marksControllers = {};
  bool _loading = true;
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _marksControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await parallelFetch<dynamic>([
        () => ApiClient().teacherClasses(),
        () => ApiClient().listExams(),
        () => ApiClient().listUsers(role: 'student'),
      ]);
      if (!mounted) return;
      setState(() {
        _classes = (results[0] as List<SchoolClass>?) ?? [];
        _exams = (results[1] as List<Exam>?) ?? [];
        _students = (results[2] as List<User>?) ?? [];
        if (_classes.isNotEmpty) _selectedClass = _classes.first;
        if (_exams.isNotEmpty) _selectedExam = _exams.first;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<User> get _classStudents {
    if (_selectedClass == null) return [];
    return _students.where((s) => s.className == _selectedClass!.name).toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final students = _classStudents;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          // Class selector
          if (_classes.isNotEmpty)
            DropdownButtonFormField<SchoolClass>(
              value: _selectedClass,
              decoration: InputDecoration(
                labelText: 'Select Class',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                ),
              ),
              items: _classes
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text('${c.name} (${c.section})'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() {
                _selectedClass = v;
                _marksControllers.clear();
              }),
            ),
          const SizedBox(height: 12),
          // Exam selector
          if (_exams.isNotEmpty)
            DropdownButtonFormField<Exam>(
              value: _selectedExam,
              decoration: InputDecoration(
                labelText: 'Select Exam',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                ),
              ),
              items: _exams
                  .map((e) => DropdownMenuItem(
                        value: e,
                        child: Text(e.name),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _selectedExam = v),
            ),
          const SizedBox(height: 16),
          // Student marks entry
          if (students.isEmpty)
            const EmptyState(
              icon: Icons.people_outline,
              title: 'No Students',
              subtitle: 'No students found in this class.',
            )
          else
            ...students.map((s) {
              _marksControllers.putIfAbsent(
                  s.id, () => TextEditingController());
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _MarksEntryRow(
                  student: s,
                  controller: _marksControllers[s.id]!,
                ),
              );
            }),
          const SizedBox(height: 16),
          // Submit button
          if (students.isNotEmpty)
            ConcordiaButton(
              label: 'Submit Results',
              icon: Icons.check,
              loading: _submitting,
              onPressed: _submitting ? null : _submitResults,
              large: true,
            ),
        ],
      ),
    );
  }

  Future<void> _submitResults() async {
    if (_selectedClass == null || _selectedExam == null) return;
    setState(() => _submitting = true);
    try {
      final records = <String, int>{};
      for (final entry in _marksControllers.entries) {
        final marks = int.tryParse(entry.value.text.trim()) ?? 0;
        records[entry.key] = marks;
      }
      await ApiClient().submitResults({
        'classId': _selectedClass!.id,
        'exam': _selectedExam!.name,
        'totalMarks': 100,
        'date': DateTime.now().toIso8601String().substring(0, 10),
        'records': records,
      });
      ApiClient().invalidate('results');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Results submitted!'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

// ── Marks entry row ─────────────────────────────────────────────

class _MarksEntryRow extends StatelessWidget {
  final User student;
  final TextEditingController controller;

  const _MarksEntryRow({
    required this.student,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border, width: 1),
      ),
      child: Row(
        children: [
          AppAvatar(
            initials: initialsOf(student.name),
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  student.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  student.rollNo ?? student.displayId,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            width: 72,
            child: TextFormField(
              controller: controller,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
              decoration: InputDecoration(
                hintText: '/100',
                hintStyle: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textMuted,
                ),
                filled: true,
                fillColor: AppColors.surfaceAlt,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(
                      color: AppColors.primary, width: 1.5),
                ),
              ),
            ),
          ),
        ],
      ),
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
      final announcements = await ApiClient().listAnnouncements();
      if (!mounted) return;
      setState(() {
        _announcements = announcements;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          ConcordiaButton(
            label: 'Create Announcement',
            icon: Icons.campaign_outlined,
            onPressed: () => _showCreateDialog(),
          ),
          const SizedBox(height: 16),
          if (_announcements.isEmpty)
            const EmptyState(
              icon: Icons.campaign_outlined,
              title: 'No Announcements',
              subtitle: 'Create an announcement to get started.',
            )
          else
            ..._announcements.map((a) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: a.title,
                    subtitle: a.message.length > 80
                        ? '${a.message.substring(0, 80)}...'
                        : a.message,
                    initials: a.title[0],
                    trailing: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatDate(a.createdAt),
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 4),
                        ConcordiaBadge(
                          label: a.targetRole,
                          variant: ConcordiaBadgeVariant.secondary,
                        ),
                      ],
                    ),
                    onTap: () => _showDetail(a),
                  ),
                )),
        ],
      ),
    );
  }

  void _showCreateDialog() {
    final titleCtrl = TextEditingController();
    final messageCtrl = TextEditingController();
    String targetRole = 'all';
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg),
          ),
          title: const Text('Create Announcement'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ConcordiaInput(
                label: 'Title',
                controller: titleCtrl,
                hintText: 'Announcement title',
              ),
              const SizedBox(height: 12),
              ConcordiaInput(
                label: 'Message',
                controller: messageCtrl,
                hintText: 'Write your announcement...',
                maxLines: 4,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: targetRole,
                decoration: InputDecoration(
                  labelText: 'Target Audience',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                  ),
                ),
                items: [
                  'all', 'student', 'teacher', 'parent',
                ].map((r) => DropdownMenuItem(
                      value: r,
                      child: Text(r[0].toUpperCase() + r.substring(1)),
                    ))
                    .toList(),
                onChanged: (v) =>
                    setDialogState(() => targetRole = v ?? 'all'),
              ),
            ],
          ),
          actions: [
            ConcordiaButton(
              label: 'Cancel',
              variant: ConcordiaButtonVariant.ghost,
              onPressed: () => Navigator.pop(ctx),
            ),
            ConcordiaButton(
              label: 'Create',
              onPressed: () async {
                Navigator.pop(ctx);
                try {
                  await ApiClient().createAnnouncement({
                    'title': titleCtrl.text.trim(),
                    'message': messageCtrl.text.trim(),
                    'targetRole': targetRole,
                  });
                  ApiClient().invalidate('announcements');
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Announcement created!'),
                        backgroundColor: AppColors.success,
                      ),
                    );
                    _load();
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text('Error: $e'),
                          backgroundColor: AppColors.danger),
                    );
                  }
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showDetail(Announcement a) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              a.title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              a.message,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                ConcordiaBadge(
                  label: a.targetRole,
                  variant: ConcordiaBadgeVariant.secondary,
                ),
                const Spacer(),
                Text(
                  formatDate(a.createdAt),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
