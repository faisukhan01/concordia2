// Academic Office portal — premium UI with parallel fetching.
// Mirrors src/components/portal/academic-portal.tsx.
//
// Tabs:
//   • Dashboard   — gradient hero, stat grid, summary card, chart, quick actions
//   • Classes     — list, create, delete, detail sheet
//   • Timetable   — day selector, entries, add-entry form
//   • Exams       — list, create, detail sheet
//   • Results     — recent cards + generate report card flow

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_cache.dart' show parallelFetch;
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import '../shared/nav_items.dart';

class AcademicPortal extends StatefulWidget {
  final AcademicTab initialTab;
  const AcademicPortal({super.key, this.initialTab = AcademicTab.dashboard});

  @override
  State<AcademicPortal> createState() => _AcademicPortalState();
}

class _AcademicPortalState extends State<AcademicPortal> {
  @override
  Widget build(BuildContext context) {
    switch (widget.initialTab) {
      case AcademicTab.dashboard:
        return const _AcDashboard();
      case AcademicTab.classes:
        return const _AcClasses();
      case AcademicTab.timetable:
        return const _AcTimetable();
      case AcademicTab.exams:
        return const _AcExams();
      case AcademicTab.results:
        return const _AcResults();
    }
  }
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
class _AcDashboard extends StatefulWidget {
  const _AcDashboard();

  @override
  State<_AcDashboard> createState() => _AcDashboardState();
}

class _AcDashboardState extends State<_AcDashboard> {
  DashboardStats? _stats;
  List<SchoolClass> _classes = const [];
  List<Exam> _exams = const [];
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
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      final branchId = auth.user!.branchId;
      // Parallel fetch: stats, classes, exams — cuts perceived load
      // time from 3 sequential round-trips down to a single window.
      final results = await parallelFetch<dynamic>([
        () => api.scopedStats(branchId: branchId),
        () => api.listClasses(branchId: branchId),
        () => api.listExams(branchId: branchId),
      ]);
      _stats = (results[0] as DashboardStats?) ?? DashboardStats();
      _classes = (results[1] as List<SchoolClass>?) ?? const <SchoolClass>[];
      _exams = (results[2] as List<Exam>?) ?? const <Exam>[];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
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
        children: [
          Container(
            height: 132,
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(AppRadii.lg),
            ),
          ),
          const SizedBox(height: 20),
          const LoadingGrid(count: 4),
          const SizedBox(height: 12),
          const LoadingList(count: 4, height: 64),
        ],
      );
    }
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final s = _stats ?? DashboardStats();
    final firstName = user.name.split(' ').first;

    // Top 6 classes by student count for the bar chart.
    final topClasses = _classes.toList()
      ..sort((a, b) =>
          (b.studentCount ?? 0).compareTo(a.studentCount ?? 0));
    final chartBars = topClasses
        .take(6)
        .where((c) => (c.studentCount ?? 0) > 0)
        .map((c) => BarData(
              label: c.name,
              value: (c.studentCount ?? 0).toDouble(),
              gradient: AppColors.primaryGradient,
            ))
        .toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          GradientHero(
            eyebrow: 'Academic Office',
            title: 'Welcome back, $firstName',
            subtitle: user.branchName ?? 'Concordia College',
            icon: Icons.school_rounded,
            gradient: AppColors.purpleGradient,
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
              StatCard(
                label: 'Total Classes',
                value: '${s.totalClasses}',
                icon: Icons.class_rounded,
                gradient: AppColors.primaryGradient,
                onTap: () => _pushTab(AcademicTab.classes),
              ),
              StatCard(
                label: 'Active Exams',
                value: '${_exams.length}',
                icon: Icons.assignment_rounded,
                gradient: AppColors.warningGradient,
                onTap: () => _pushTab(AcademicTab.exams),
              ),
              StatCard(
                label: 'Students Enrolled',
                value: '${s.totalStudents}',
                icon: Icons.people_alt_rounded,
                color: AppColors.info,
                trend: '${s.totalClasses} cls',
                trendUp: true,
                onTap: () => _pushTab(AcademicTab.results),
              ),
              StatCard(
                label: 'Teachers',
                value: '${s.totalTeachers}',
                icon: Icons.person_rounded,
                color: AppColors.success,
                trend: 'Active',
                trendUp: true,
              ),
            ],
          ),
          const SizedBox(height: 14),
          // Compact summary pair
          GradientSummary.pair(
            label1: 'Classes',
            value1: '${s.totalClasses}',
            label2: 'Exams',
            value2: '${_exams.length}',
            gradient: AppColors.infoGradient,
          ),
          // Chart card — students per class
          if (chartBars.isNotEmpty) ...[
            const SectionHeader(
              title: 'Students per Class',
              subtitle: 'Top ${6} by enrollment',
            ),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
              child: MiniBarChart(
                bars: chartBars,
                height: 180,
              ),
            ),
          ],
          // Quick actions
          const SectionHeader(title: 'Quick Actions'),
          ListRow(
            title: 'Manage Classes',
            subtitle: '${s.totalClasses} classes · ${s.totalStudents} students',
            eyebrow: 'Classes',
            icon: Icons.class_rounded,
            accentColor: AppColors.primary,
            onTap: () => _pushTab(AcademicTab.classes),
          ),
          const SizedBox(height: 8),
          ListRow(
            title: 'Weekly Timetable',
            subtitle: 'Schedule periods & rooms',
            eyebrow: 'Timetable',
            icon: Icons.calendar_month_rounded,
            accentColor: AppColors.info,
            onTap: () => _pushTab(AcademicTab.timetable),
          ),
          const SizedBox(height: 8),
          ListRow(
            title: 'Exams',
            subtitle: '${_exams.length} exam sessions configured',
            eyebrow: 'Exams',
            icon: Icons.assignment_rounded,
            accentColor: AppColors.warning,
            onTap: () => _pushTab(AcademicTab.exams),
          ),
          const SizedBox(height: 8),
          ListRow(
            title: 'Results & Reports',
            subtitle: 'Generate report cards',
            eyebrow: 'Results',
            icon: Icons.description_rounded,
            accentColor: AppColors.success,
            onTap: () => _pushTab(AcademicTab.results),
          ),
        ],
      ),
    );
  }

  void _pushTab(AcademicTab tab) {
    // RoleShell drives tab switches via a Notification — but for in-tab
    // navigation we just swap our own state by replacing the route.
    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => AcademicPortal(initialTab: tab),
        transitionsBuilder: (_, a, __, child) => FadeTransition(
          opacity: a,
          child: child,
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// CLASSES
// ════════════════════════════════════════════════════════════════
class _AcClasses extends StatefulWidget {
  const _AcClasses();

  @override
  State<_AcClasses> createState() => _AcClassesState();
}

class _AcClassesState extends State<_AcClasses> {
  List<SchoolClass> _classes = const [];
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
      final auth = context.read<AuthProvider>();
      _classes = await ApiClient().listClasses(branchId: auth.user!.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final nameCtrl = TextEditingController();
    final sectionCtrl = TextEditingController(text: 'A');
    final teacherCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create Class'),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg)),
        content: Form(
          key: formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Class Name', hintText: 'e.g. Class 9'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: sectionCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Section', hintText: 'e.g. A'),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: teacherCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Class Teacher', hintText: 'Optional'),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState?.validate() != true) return;
              Navigator.pop(ctx, true);
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createClass({
        'name': nameCtrl.text.trim(),
        'section': sectionCtrl.text.trim().isEmpty
            ? 'A'
            : sectionCtrl.text.trim(),
        'teacherName': teacherCtrl.text.trim(),
        'branchId': auth.user!.branchId,
        'instituteId': auth.user!.instituteId,
        'createdBy': auth.user!.id,
      });
      ApiClient().invalidate('classes');
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _delete(SchoolClass c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete class?'),
        content: Text(
            'Are you sure you want to delete Class ${c.name} — ${c.section}? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient().deleteClass(c.id);
      ApiClient().invalidate('classes');
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Class ${c.name} — ${c.section} deleted'),
          backgroundColor: AppColors.success,
        ));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  void _showDetail(SchoolClass c) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                AppAvatar(
                  initials: c.name.isNotEmpty ? c.name[0] : '?',
                  color: AppColors.primary,
                  size: 56,
                  useGradient: true,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Class ${c.name} — ${c.section}',
                          style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 2),
                      Text(
                          'Teacher: ${c.teacherName?.isNotEmpty == true ? c.teacherName : 'Not assigned'}',
                          style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: _DetailTile(
                    label: 'Students',
                    value: '${c.studentCount ?? 0}',
                    icon: Icons.people_alt_rounded,
                    color: AppColors.info,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _DetailTile(
                    label: 'Section',
                    value: c.section,
                    icon: Icons.group_work_rounded,
                    color: AppColors.purple,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Quick Actions',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 8),
            ListRow(
              title: 'View Weekly Timetable',
              subtitle: 'See periods for this class',
              icon: Icons.calendar_month_rounded,
              accentColor: AppColors.primary,
              onTap: () => Navigator.pop(ctx),
            ),
            const SizedBox(height: 8),
            ListRow(
              title: 'Delete this class',
              subtitle: 'Permanently remove',
              icon: Icons.delete_outline_rounded,
              accentColor: AppColors.danger,
              onTap: () {
                Navigator.pop(ctx);
                _delete(c);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _create,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Class'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingList(count: 6, height: 72)
            : _error != null
                ? ErrorState(message: _error!, onRetry: _load)
                : _classes.isEmpty
                    ? ListView(
                        children: [
                          const SizedBox(height: 120),
                          EmptyState(
                            icon: Icons.class_outlined,
                            title: 'No classes yet',
                            subtitle:
                                'Create your first class to start enrolling students',
                            actionLabel: 'Create Class',
                            onAction: _create,
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 96),
                        itemCount: _classes.length + 1,
                        itemBuilder: (_, i) {
                          if (i == 0) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${_classes.length} classes',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                  ),
                                  StatusChip(
                                    text:
                                        '${_classes.fold<int>(0, (a, c) => a + (c.studentCount ?? 0))} students',
                                    type: StatusType.info,
                                    compact: true,
                                  ),
                                ],
                              ),
                            );
                          }
                          final c = _classes[i - 1];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: ListRow(
                              title: 'Class ${c.name} — ${c.section}',
                              subtitle:
                                  '${c.studentCount ?? 0} students · ${c.teacherName?.isNotEmpty == true ? c.teacherName : 'No teacher yet'}',
                              eyebrow: c.section,
                              icon: Icons.class_rounded,
                              accentColor: AppColors.primary,
                              onTap: () => _showDetail(c),
                              trailing: GestureDetector(
                                onTap: () => _delete(c),
                                child: Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: AppColors.dangerSoft,
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.sm),
                                  ),
                                  child: const Icon(Icons.delete_outline,
                                      color: AppColors.danger, size: 18),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// TIMETABLE
// ════════════════════════════════════════════════════════════════
class _AcTimetable extends StatefulWidget {
  const _AcTimetable();

  @override
  State<_AcTimetable> createState() => _AcTimetableState();
}

class _AcTimetableState extends State<_AcTimetable> {
  List<TimetableEntry> _entries = const [];
  List<SchoolClass> _classes = const [];
  bool _loading = true;
  String? _error;
  String _day = 'Monday';
  static const _days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

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
      final branchId = auth.user!.branchId;
      // Parallel fetch: timetable entries + classes (for the add-entry picker)
      final results = await parallelFetch<dynamic>([
        () => api.listTimetable(branchId: branchId),
        () => api.listClasses(branchId: branchId),
      ]);
      _entries = (results[0] as List<TimetableEntry>?) ??
          const <TimetableEntry>[];
      _classes = (results[1] as List<SchoolClass>?) ?? const <SchoolClass>[];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addEntry() async {
    if (_classes.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Create a class first'),
        backgroundColor: AppColors.warning,
      ));
      return;
    }
    final formKey = GlobalKey<FormState>();
    String? classId = _classes.first.id;
    String day = _day;
    final subjectCtrl = TextEditingController();
    final periodCtrl = TextEditingController(text: '1');
    final startCtrl = TextEditingController(text: '08:00');
    final endCtrl = TextEditingController(text: '08:45');
    final roomCtrl = TextEditingController();
    final teacherCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('Add Timetable Entry'),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.lg)),
          content: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    value: classId,
                    decoration: const InputDecoration(labelText: 'Class'),
                    items: _classes
                        .map((c) => DropdownMenuItem(
                              value: c.id,
                              child: Text('${c.name} — ${c.section}'),
                            ))
                        .toList(),
                    onChanged: (v) => setSt(() => classId = v),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: day,
                    decoration: const InputDecoration(labelText: 'Day'),
                    items: _days
                        .map((d) =>
                            DropdownMenuItem(value: d, child: Text(d)))
                        .toList(),
                    onChanged: (v) => setSt(() => day = v ?? day),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: subjectCtrl,
                    decoration: const InputDecoration(
                        labelText: 'Subject', hintText: 'e.g. Mathematics'),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: periodCtrl,
                          decoration: const InputDecoration(labelText: 'Period'),
                          keyboardType: TextInputType.number,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          controller: startCtrl,
                          decoration: const InputDecoration(labelText: 'Start'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          controller: endCtrl,
                          decoration: const InputDecoration(labelText: 'End'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: roomCtrl,
                    decoration: const InputDecoration(
                        labelText: 'Room', hintText: 'e.g. R-201'),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: teacherCtrl,
                    decoration: const InputDecoration(labelText: 'Teacher'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState?.validate() != true) return;
                Navigator.pop(ctx, true);
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final selected =
        _classes.firstWhere((c) => c.id == classId, orElse: () => _classes.first);
    if (!mounted) return;
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().saveTimetableEntry({
        'branchId': auth.user!.branchId,
        'instituteId': auth.user!.instituteId,
        'classId': selected.id,
        'className': selected.name,
        'section': selected.section,
        'day': day,
        'period': int.tryParse(periodCtrl.text) ?? 1,
        'startTime': startCtrl.text.trim(),
        'endTime': endCtrl.text.trim(),
        'subject': subjectCtrl.text.trim(),
        'roomName': roomCtrl.text.trim(),
        'teacherName': teacherCtrl.text.trim(),
        'createdBy': auth.user!.id,
      });
      ApiClient().invalidate('timetable');
      setState(() => _day = day);
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addEntry,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add Entry'),
      ),
      body: _loading
          ? const LoadingList(count: 6, height: 80)
          : _error != null
              ? ErrorState(message: _error!, onRetry: _load)
              : Column(
                  children: [
                    // Day selector chips — horizontal scroll
                    Container(
                      color: AppColors.background,
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                      child: SizedBox(
                        height: 44,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _days.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (_, i) {
                            final d = _days[i];
                            final active = d == _day;
                            return GestureDetector(
                              onTap: () => setState(() => _day = d),
                              child: AnimatedContainer(
                                duration:
                                    const Duration(milliseconds: 180),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 18, vertical: 10),
                                decoration: BoxDecoration(
                                  gradient: active
                                      ? appGradient(
                                          AppColors.primaryGradient)
                                      : null,
                                  color: active
                                      ? null
                                      : AppColors.card,
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                  border: Border.all(
                                    color: active
                                        ? AppColors.primary
                                        : AppColors.border,
                                    width: active ? 1.2 : 1,
                                  ),
                                  boxShadow: active ? AppShadows.button : null,
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  d.substring(0, 3),
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: active
                                        ? Colors.white
                                        : AppColors.textSecondary,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    Expanded(
                      child: RefreshIndicator(
                        onRefresh: _load,
                        child: _entriesForDay().isEmpty
                            ? ListView(
                                children: [
                                  const SizedBox(height: 80),
                                  EmptyState(
                                    icon: Icons.calendar_today_outlined,
                                    title: 'No classes scheduled',
                                    subtitle:
                                        'Add a timetable entry for $_day to get started',
                                  ),
                                ],
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.fromLTRB(
                                    16, 6, 16, 96),
                                itemCount: _entriesForDay().length,
                                itemBuilder: (_, i) {
                                  final e = _entriesForDay()[i];
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: ListRow(
                                      title: e.subject,
                                      subtitle:
                                          '${e.className} — ${e.section} · ${e.startTime} – ${e.endTime}',
                                      eyebrow: 'Period ${e.period}',
                                      leading: Container(
                                        width: 44,
                                        height: 44,
                                        decoration: BoxDecoration(
                                          gradient: appGradient(
                                              AppColors.infoGradient),
                                          borderRadius: BorderRadius.circular(
                                              AppRadii.sm),
                                        ),
                                        child: Center(
                                          child: Text(
                                            'P${e.period}',
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w800,
                                              color: Colors.white,
                                            ),
                                          ),
                                        ),
                                      ),
                                      trailing: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.end,
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          if (e.roomName != null &&
                                              e.roomName!.isNotEmpty)
                                            Text('Room ${e.roomName}',
                                                style: const TextStyle(
                                                    fontSize: 11,
                                                    fontWeight:
                                                        FontWeight.w700,
                                                    color: AppColors
                                                        .textSecondary)),
                                          if (e.teacherName != null &&
                                              e.teacherName!.isNotEmpty)
                                            Text(e.teacherName!,
                                                style: const TextStyle(
                                                    fontSize: 11,
                                                    color: AppColors
                                                        .textMuted)),
                                        ],
                                      ),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ),
                  ],
                ),
    );
  }

  List<TimetableEntry> _entriesForDay() {
    return _entries
        .where((e) => e.day == _day)
        .toList()
      ..sort((a, b) => a.period.compareTo(b.period));
  }
}

// ════════════════════════════════════════════════════════════════
// EXAMS
// ════════════════════════════════════════════════════════════════
class _AcExams extends StatefulWidget {
  const _AcExams();

  @override
  State<_AcExams> createState() => _AcExamsState();
}

class _AcExamsState extends State<_AcExams> {
  List<Exam> _exams = const [];
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
      final auth = context.read<AuthProvider>();
      _exams = await ApiClient().listExams(branchId: auth.user!.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final nameCtrl = TextEditingController();
    String type = 'Monthly Test';
    final types = ['Monthly Test', 'Mid Term', 'Final Term', 'Quiz', 'Sessional'];
    final formKey = GlobalKey<FormState>();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('Create Exam'),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.lg)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Form(
                key: formKey,
                child: TextFormField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                      labelText: 'Exam Name',
                      hintText: 'e.g. Mid Term 2026'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Required' : null,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: types
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setSt(() => type = v ?? type),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () {
                if (formKey.currentState?.validate() != true) return;
                Navigator.pop(ctx, true);
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    if (!mounted) return;
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createExam({
        'name': nameCtrl.text.trim(),
        'branchId': auth.user!.branchId,
        'instituteId': auth.user!.instituteId,
        'type': type,
        'createdBy': auth.user!.id,
      });
      ApiClient().invalidate('exams');
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _delete(Exam e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete exam?'),
        content: Text('Delete "${e.name}"? This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient().deleteExam(e.id);
      ApiClient().invalidate('exams');
      _load();
    } on ApiException catch (er) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(er.message), backgroundColor: AppColors.danger));
      }
    }
  }

  void _showDetail(Exam e) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.warningGradient),
                    borderRadius: BorderRadius.circular(AppRadii.md),
                  ),
                  child: const Icon(Icons.assignment_rounded,
                      color: Colors.white, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(e.name,
                          style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 4),
                      StatusChip(text: e.type, type: _examType(e.type)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            const Text('Actions',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 8),
            ListRow(
              title: 'Record Results',
              subtitle: 'Enter marks for this exam',
              icon: Icons.edit_note_rounded,
              accentColor: AppColors.success,
              onTap: () => Navigator.pop(ctx),
            ),
            const SizedBox(height: 8),
            ListRow(
              title: 'Delete exam',
              subtitle: 'Permanently remove',
              icon: Icons.delete_outline_rounded,
              accentColor: AppColors.danger,
              onTap: () {
                Navigator.pop(ctx);
                _delete(e);
              },
            ),
          ],
        ),
      ),
    );
  }

  StatusType _examType(String type) {
    switch (type) {
      case 'Final Term':
        return StatusType.danger;
      case 'Mid Term':
        return StatusType.warning;
      case 'Quiz':
        return StatusType.info;
      case 'Sessional':
        return StatusType.purple;
      default:
        return StatusType.info;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _create,
        icon: const Icon(Icons.add_rounded),
        label: const Text('New Exam'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const LoadingList(count: 6, height: 72)
            : _error != null
                ? ErrorState(message: _error!, onRetry: _load)
                : _exams.isEmpty
                    ? ListView(
                        children: [
                          const SizedBox(height: 120),
                          EmptyState(
                            icon: Icons.assignment_outlined,
                            title: 'No exams yet',
                            subtitle: 'Create an exam session to record results',
                            actionLabel: 'Create Exam',
                            onAction: _create,
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 14, 16, 96),
                        itemCount: _exams.length + 1,
                        itemBuilder: (_, i) {
                          if (i == 0) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      '${_exams.length} exam sessions',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                  ),
                                  const StatusChip(
                                    text: 'Active',
                                    type: StatusType.success,
                                    compact: true,
                                  ),
                                ],
                              ),
                            );
                          }
                          final e = _exams[i - 1];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: ListRow(
                              title: e.name,
                              subtitle: e.type,
                              eyebrow: 'Exam',
                              leading: Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  gradient:
                                      appGradient(AppColors.warningGradient),
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.sm),
                                ),
                                child: const Icon(Icons.assignment_rounded,
                                    color: Colors.white, size: 22),
                              ),
                              trailing: StatusChip(
                                  text: e.type, type: _examType(e.type)),
                              onTap: () => _showDetail(e),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════════════════════════
class _AcResults extends StatefulWidget {
  const _AcResults();

  @override
  State<_AcResults> createState() => _AcResultsState();
}

class _AcResultsState extends State<_AcResults> {
  List<ReportCard> _cards = const [];
  bool _loading = true;
  String? _error;
  ReportCard? _generated;
  bool _generating = false;

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
      _cards = await ApiClient()
          .listReportCards(branchId: auth.user!.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _generate() async {
    final auth0 = context.read<AuthProvider>();
    List<User> students = const [];
    try {
      students = await ApiClient().listUsers(
        role: 'student',
        branchId: auth0.user!.branchId,
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.message), backgroundColor: AppColors.danger));
      }
      return;
    }
    if (students.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('No students found in this branch'),
        backgroundColor: AppColors.warning,
      ));
      return;
    }
    String? studentId = students.first.id;
    String term = 'First Term';
    final terms = ['First Term', 'Mid Term', 'Final Term', 'Monthly Test'];

    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('Generate Report Card'),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.lg)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: studentId,
                decoration: const InputDecoration(labelText: 'Student'),
                items: students
                    .map((s) => DropdownMenuItem(
                          value: s.id,
                          child: Text(
                              '${s.name}${s.className != null ? ' · ${s.className}' : ''}'),
                        ))
                    .toList(),
                onChanged: (v) => setSt(() => studentId = v),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: term,
                decoration: const InputDecoration(labelText: 'Term'),
                items: terms
                    .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                    .toList(),
                onChanged: (v) => setSt(() => term = v ?? term),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Generate'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || studentId == null) return;
    if (!mounted) return;
    setState(() => _generating = true);
    try {
      final card = await ApiClient()
          .generateReportCard(studentId!, term: term);
      ApiClient().invalidate('report-cards');
      setState(() => _generated = card);
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.message), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  StatusType _gradeType(String g) {
    if (g.startsWith('A')) return StatusType.success;
    if (g.startsWith('B')) return StatusType.info;
    if (g.startsWith('C')) return StatusType.warning;
    return StatusType.danger;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6, height: 72);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
        children: [
          const GradientHero(
            eyebrow: 'Academic Performance',
            title: 'Results & Reports',
            subtitle: 'View report cards and generate new ones',
            icon: Icons.description_rounded,
            gradient: AppColors.successGradient,
          ),
          const SizedBox(height: 18),
          // Generate section
          PremiumCard(
            onTap: _generating ? null : _generate,
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.primaryGradient),
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    boxShadow: AppShadows.button,
                  ),
                  child: const Icon(Icons.auto_awesome_rounded,
                      color: Colors.white, size: 24),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Generate Report Card',
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 2),
                      Text(
                          _generating
                              ? 'Generating…'
                              : 'Pick a student & term to compute grades',
                          style: const TextStyle(
                              fontSize: 12.5,
                              color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                _generating
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.chevron_right_rounded,
                        color: AppColors.textMuted, size: 22),
              ],
            ),
          ),
          // Generated report card preview
          if (_generated != null) ...[
            const SizedBox(height: 16),
            const SectionHeader(title: 'Generated Report'),
            _ReportCardView(card: _generated!),
          ],
          // Recent results
          const SectionHeader(
            title: 'Recent Results',
            subtitle: '${0} report cards',
          ),
          if (_cards.isEmpty)
            PremiumCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: const BoxDecoration(
                      color: AppColors.primarySoft,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.description_outlined,
                        color: AppColors.primary, size: 26),
                  ),
                  const SizedBox(height: 12),
                  const Text('No report cards yet',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary)),
                  const SizedBox(height: 4),
                  const Text(
                      'Generate a report card above to see it here',
                      style: TextStyle(
                          fontSize: 12.5, color: AppColors.textSecondary),
                      textAlign: TextAlign.center),
                ],
              ),
            )
          else
            ..._cards.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: c.studentName,
                    subtitle:
                        '${c.className} — ${c.section} · ${c.term} · ${c.examName}',
                    eyebrow: c.term,
                    icon: Icons.person_rounded,
                    accentColor: AppColors.purple,
                    trailing: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        StatusChip(
                            text: c.grade.isEmpty ? '—' : c.grade,
                            type: _gradeType(c.grade.isEmpty ? 'D' : c.grade)),
                        const SizedBox(height: 4),
                        Text('${c.obtainedMarks}/${c.totalMarks}',
                            style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textSecondary)),
                      ],
                    ),
                    onTap: () {
                      setState(() => _generated = c);
                    },
                  ),
                )),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════
class _DetailTile extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _DetailTile({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(AppRadii.sm),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(value,
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: color)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReportCardView extends StatelessWidget {
  final ReportCard card;
  const _ReportCardView({required this.card});

  StatusType _gradeType(String g) {
    if (g.startsWith('A')) return StatusType.success;
    if (g.startsWith('B')) return StatusType.info;
    if (g.startsWith('C')) return StatusType.warning;
    return StatusType.danger;
  }

  @override
  Widget build(BuildContext context) {
    final pct = card.percentage.clamp(0.0, 100.0);
    return PremiumCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Student header
          Row(
            children: [
              AppAvatar(
                initials: initialsOf(card.studentName),
                color: AppColors.purple,
                size: 48,
                useGradient: true,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(card.studentName,
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary)),
                    const SizedBox(height: 2),
                    Text(
                        'Class ${card.className} — ${card.section} · ${card.term}',
                        style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSecondary)),
                  ],
                ),
              ),
              StatusChip(
                  text: card.grade.isEmpty ? '—' : card.grade,
                  type: _gradeType(card.grade.isEmpty ? 'D' : card.grade)),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(AppRadii.md),
            ),
            child: Row(
              children: [
                const Icon(Icons.assignment_rounded,
                    size: 18, color: AppColors.textSecondary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(card.examName,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Marks progress
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${card.obtainedMarks}',
                  style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                      letterSpacing: -0.5)),
              const SizedBox(width: 4),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('/ ${card.totalMarks}',
                    style: const TextStyle(
                        fontSize: 14,
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w600)),
              ),
              const Spacer(),
              Text('${pct.toStringAsFixed(1)}%',
                  style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary)),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: LinearProgressIndicator(
              value: pct / 100,
              minHeight: 8,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation<Color>(
                card.grade.startsWith('A')
                    ? AppColors.success
                    : card.grade.startsWith('B')
                        ? AppColors.info
                        : card.grade.startsWith('C')
                            ? AppColors.warning
                            : AppColors.danger,
              ),
            ),
          ),
          if (card.remarks != null && card.remarks!.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text('Remarks',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textSecondary)),
            const SizedBox(height: 4),
            Text(card.remarks!,
                style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textPrimary,
                    height: 1.4)),
          ],
        ],
      ),
    );
  }
}
