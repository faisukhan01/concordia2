// Academic Office portal — premium UI with parallel fetching.
// Mirrors src/components/portal/academic-portal.tsx.
//
// Tabs:
//   • Dashboard   — gradient hero, stat grid, summary card, chart, quick actions
//   • Classes & Teachers — list, create, delete, detail sheet + teacher management
//   • Timetable   — day selector, entries, add-entry form
//   • Exams & Date Sheets — list, create, detail sheet
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
  late AcademicTab _tab = widget.initialTab;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final role = context.read<AuthProvider>().user?.role;
      final isAdmin = role == 'admin' || role == 'super-admin';
      if (isAdmin && _tab == AcademicTab.dashboard) {
        setState(() => _tab = AcademicTab.classes);
      }
    });
  }

  void _switchTo(AcademicTab t) {
    if (_tab == t) return;
    setState(() => _tab = t);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SubTabBar(
          tabs: const [
            SubTabItem(label: 'Dashboard', icon: Icons.dashboard_outlined),
            SubTabItem(label: 'Classes', icon: Icons.class_outlined),
            SubTabItem(label: 'Timetable', icon: Icons.calendar_today_outlined),
            SubTabItem(label: 'Exams', icon: Icons.assignment_outlined),
            SubTabItem(label: 'Results', icon: Icons.description_outlined),
          ],
          currentIndex: _tab.index,
          onTap: (i) => _switchTo(AcademicTab.values[i]),
        ),
        Expanded(child: _tabBody),
      ],
    );
  }

  Widget get _tabBody {
    switch (_tab) {
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
        () => ApiClient().scopedStats(),
        () => ApiClient().listAnnouncements(),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as DashboardStats?;
        _announcements = (results[1] as List<Announcement>?) ?? [];
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

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          GradientHero(
            title: 'Academic Office',
            subtitle: 'Manage classes, timetable, exams, and results.',
            icon: Icons.school_outlined,
          ),
          const SizedBox(height: 16),
          _buildStatGrid(),
          const SizedBox(height: 20),
          _buildQuickActions(),
          const SizedBox(height: 20),
          _buildAnnouncements(),
        ],
      ),
    );
  }

  Widget _buildStatGrid() {
    final s = _stats;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.15,
      children: [
        StatCard(
          label: 'Total Students',
          value: '${s?.totalStudents ?? 0}',
          icon: Icons.school_outlined,
          color: AppColors.primary,
        ),
        StatCard(
          label: 'Total Teachers',
          value: '${s?.totalTeachers ?? 0}',
          icon: Icons.people_outline,
          color: AppColors.info,
        ),
        StatCard(
          label: 'Total Classes',
          value: '${s?.totalClasses ?? 0}',
          icon: Icons.class_outlined,
          color: AppColors.warning,
        ),
        StatCard(
          label: 'Announcements',
          value: '${s?.activeAnnouncements ?? 0}',
          icon: Icons.campaign_outlined,
          color: AppColors.success,
        ),
      ],
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Quick Actions'),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                icon: Icons.class_outlined,
                label: 'Manage Classes',
                color: AppColors.primary,
                onTap: () => _switchTo(AcademicTab.classes),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                icon: Icons.calendar_today_outlined,
                label: 'Timetable',
                color: AppColors.info,
                onTap: () => _switchTo(AcademicTab.timetable),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                icon: Icons.assignment_outlined,
                label: 'Exams',
                color: AppColors.warning,
                onTap: () => _switchTo(AcademicTab.exams),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                icon: Icons.description_outlined,
                label: 'Result Cards',
                color: AppColors.success,
                onTap: () => _switchTo(AcademicTab.results),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _switchTo(AcademicTab t) {
    // Find the parent AcademicPortal state and switch tabs
    final state = context.findAncestorStateOfType<_AcademicPortalState>();
    state?._switchTo(t);
  }

  Widget _buildAnnouncements() {
    final recent = _announcements.take(3).toList();
    if (recent.isEmpty) {
      return const EmptyState(
        icon: Icons.campaign_outlined,
        title: 'No Announcements',
        subtitle: 'Create announcements to inform students and teachers.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Recent Announcements'),
        ...recent.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                title: a.title,
                subtitle: a.message.length > 60
                    ? '${a.message.substring(0, 60)}...'
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
// CLASSES & TEACHERS
// ════════════════════════════════════════════════════════════════

class _AcClasses extends StatefulWidget {
  const _AcClasses();

  @override
  State<_AcClasses> createState() => _AcClassesState();
}

class _AcClassesState extends State<_AcClasses> {
  List<SchoolClass> _classes = [];
  List<User> _teachers = [];
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
        () => ApiClient().listClasses(),
        () => ApiClient().listUsers(role: 'teacher'),
      ]);
      if (!mounted) return;
      setState(() {
        _classes = (results[0] as List<SchoolClass>?) ?? [];
        _teachers = (results[1] as List<User>?) ?? [];
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
          Row(
            children: [
              Expanded(
                child: ConcordiaButton(
                  label: 'Add Class',
                  icon: Icons.add_outlined,
                  onPressed: () => _showCreateClassDialog(),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ConcordiaButton(
                  label: 'Add Teacher',
                  icon: Icons.person_add_outlined,
                  variant: ConcordiaButtonVariant.outline,
                  onPressed: () => _showCreateTeacherDialog(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const SectionHeader(title: 'Classes'),
          if (_classes.isEmpty)
            const EmptyState(
              icon: Icons.class_outlined,
              title: 'No Classes',
              subtitle: 'Add a class to get started.',
            )
          else
            ..._classes.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: c.name,
                    subtitle:
                        'Section ${c.section} • ${c.studentCount ?? 0} students • ${c.teacherName ?? 'No teacher'}',
                    initials: c.name[0],
                    onTap: () => _showClassDetail(c),
                    trailing: GestureDetector(
                      onTap: () => _confirmDeleteClass(c),
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: AppColors.dangerSoft,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.delete_outline,
                            size: 16, color: AppColors.danger),
                      ),
                    ),
                  ),
                )),
          const SizedBox(height: 8),
          const SectionHeader(title: 'Teachers'),
          if (_teachers.isEmpty)
            const EmptyState(
              icon: Icons.people_outline,
              title: 'No Teachers',
              subtitle: 'Add a teacher to get started.',
            )
          else
            ..._teachers.map((t) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: t.name,
                    subtitle:
                        '${t.title ?? 'Teacher'} • ${t.displayId}',
                    initials: initialsOf(t.name),
                    onTap: () => _showTeacherDetail(t),
                  ),
                )),
        ],
      ),
    );
  }

  void _showCreateClassDialog() {
    final nameCtrl = TextEditingController();
    final sectionCtrl = TextEditingController(text: 'A');
    String? selectedTeacherId;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg),
          ),
          title: const Text('Add Class'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ConcordiaInput(
                label: 'Class Name',
                controller: nameCtrl,
                hintText: 'e.g. Class 9',
              ),
              const SizedBox(height: 12),
              ConcordiaInput(
                label: 'Section',
                controller: sectionCtrl,
                hintText: 'A, B, C...',
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: selectedTeacherId,
                decoration: InputDecoration(
                  labelText: 'Class Teacher',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                  ),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('No Teacher')),
                  ..._teachers.map((t) => DropdownMenuItem(
                        value: t.id,
                        child: Text(t.name),
                      )),
                ],
                onChanged: (v) => setDialogState(() => selectedTeacherId = v),
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
                  await ApiClient().createClass({
                    'name': nameCtrl.text.trim(),
                    'section': sectionCtrl.text.trim().isEmpty ? 'A' : sectionCtrl.text.trim(),
                    if (selectedTeacherId != null)
                      'teacherId': selectedTeacherId,
                  });
                  ApiClient().invalidate('classes');
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Class created!'),
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

  void _showCreateTeacherDialog() {
    final nameCtrl = TextEditingController();
    final emailCtrl = TextEditingController();
    final passwordCtrl = TextEditingController();
    final titleCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Add Teacher'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConcordiaInput(
              label: 'Full Name',
              controller: nameCtrl,
              hintText: 'Enter teacher name',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Email',
              controller: emailCtrl,
              hintText: 'teacher@example.com',
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Title',
              controller: titleCtrl,
              hintText: 'e.g. Lecturer, Professor',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Password',
              controller: passwordCtrl,
              hintText: 'Leave blank for auto-generated',
              obscureText: true,
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
                await ApiClient().createUser({
                  'name': nameCtrl.text.trim(),
                  'email': emailCtrl.text.trim(),
                  'title': titleCtrl.text.trim(),
                  'role': 'teacher',
                  if (passwordCtrl.text.isNotEmpty)
                    'password': passwordCtrl.text.trim(),
                });
                ApiClient().invalidate('platform/users');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Teacher created!'),
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
            _detailRow('Class Teacher', c.teacherName ?? 'Not assigned'),
            _detailRow('Class ID', c.id),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  void _showTeacherDetail(User t) {
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
              t.name,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            _detailRow('Title', t.title ?? 'Teacher'),
            _detailRow('Email', t.email ?? '—'),
            _detailRow('ID', t.displayId),
            _detailRow('Status', t.isActive ? 'Active' : 'Inactive'),
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

  void _confirmDeleteClass(SchoolClass c) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Delete Class?'),
        content: Text(
          'Delete ${c.name} (Section ${c.section})? This action cannot be undone.',
        ),
        actions: [
          ConcordiaButton(
            label: 'Cancel',
            variant: ConcordiaButtonVariant.ghost,
            onPressed: () => Navigator.pop(ctx),
          ),
          ConcordiaButton(
            label: 'Delete',
            variant: ConcordiaButtonVariant.destructive,
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ApiClient().deleteClass(c.id);
                ApiClient().invalidate('classes');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Class deleted!'),
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
  List<TimetableEntry> _entries = [];
  List<SchoolClass> _classes = [];
  int _selectedDayIndex = 0;
  bool _loading = true;
  String? _error;

  static const _days = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
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
      final results = await parallelFetch<dynamic>([
        () => ApiClient().listTimetable(),
        () => ApiClient().listClasses(),
      ]);
      if (!mounted) return;
      setState(() {
        _entries = (results[0] as List<TimetableEntry>?) ?? [];
        _classes = (results[1] as List<SchoolClass>?) ?? [];
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

    final dayEntries = _entries
        .where((e) => e.day == _days[_selectedDayIndex])
        .toList()
      ..sort((a, b) => a.period.compareTo(b.period));

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          // Day selector
          _buildDaySelector(),
          const SizedBox(height: 16),
          // Add entry button
          ConcordiaButton(
            label: 'Add Entry',
            icon: Icons.add_outlined,
            onPressed: () => _showAddEntryDialog(),
          ),
          const SizedBox(height: 16),
          if (dayEntries.isEmpty)
            const EmptyState(
              icon: Icons.calendar_today_outlined,
              title: 'No Entries',
              subtitle: 'Add timetable entries for this day.',
            )
          else
            ...dayEntries.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: e.subject,
                    subtitle:
                        'Period ${e.period} • ${e.startTime} – ${e.endTime} • ${e.className} ${e.section}',
                    initials: e.subject[0],
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (e.teacherName != null)
                          ConcordiaBadge(
                            label: e.teacherName!,
                            variant: ConcordiaBadgeVariant.secondary,
                          ),
                        const SizedBox(width: 6),
                        GestureDetector(
                          onTap: () => _confirmDeleteEntry(e),
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: AppColors.dangerSoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.delete_outline,
                                size: 16, color: AppColors.danger),
                          ),
                        ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }

  Widget _buildDaySelector() {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final active = i == _selectedDayIndex;
          return GestureDetector(
            onTap: () => setState(() => _selectedDayIndex = i),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                gradient: active
                    ? appGradient(AppColors.primaryGradient)
                    : null,
                color: active ? null : AppColors.card,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(
                  color: active ? AppColors.primary : AppColors.border,
                  width: 1,
                ),
              ),
              child: Text(
                _days[i].substring(0, 3),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color: active ? Colors.white : AppColors.textSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  void _showAddEntryDialog() {
    final subjectCtrl = TextEditingController();
    final startTimeCtrl = TextEditingController();
    final endTimeCtrl = TextEditingController();
    final periodCtrl = TextEditingController();
    String? selectedClassId;
    String? selectedTeacherId;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg),
          ),
          title: Text('Add Entry – ${_days[_selectedDayIndex]}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ConcordiaInput(
                  label: 'Subject',
                  controller: subjectCtrl,
                  hintText: 'e.g. Mathematics',
                ),
                const SizedBox(height: 12),
                ConcordiaInput(
                  label: 'Period',
                  controller: periodCtrl,
                  hintText: '1',
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: ConcordiaInput(
                        label: 'Start',
                        controller: startTimeCtrl,
                        hintText: '08:00',
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ConcordiaInput(
                        label: 'End',
                        controller: endTimeCtrl,
                        hintText: '08:45',
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedClassId,
                  decoration: InputDecoration(
                    labelText: 'Class',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                    ),
                  ),
                  items: _classes
                      .map((c) => DropdownMenuItem(
                            value: c.id,
                            child: Text('${c.name} (${c.section})'),
                          ))
                      .toList(),
                  onChanged: (v) =>
                      setDialogState(() => selectedClassId = v),
                ),
              ],
            ),
          ),
          actions: [
            ConcordiaButton(
              label: 'Cancel',
              variant: ConcordiaButtonVariant.ghost,
              onPressed: () => Navigator.pop(ctx),
            ),
            ConcordiaButton(
              label: 'Add',
              onPressed: () async {
                Navigator.pop(ctx);
                try {
                  await ApiClient().saveTimetableEntry({
                    'day': _days[_selectedDayIndex],
                    'subject': subjectCtrl.text.trim(),
                    'period': int.tryParse(periodCtrl.text.trim()) ?? 1,
                    'startTime': startTimeCtrl.text.trim(),
                    'endTime': endTimeCtrl.text.trim(),
                    if (selectedClassId != null) 'classId': selectedClassId,
                  });
                  ApiClient().invalidate('timetable');
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Entry added!'),
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

  void _confirmDeleteEntry(TimetableEntry e) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Delete Entry?'),
        content: Text(
          'Delete ${e.subject} (Period ${e.period}) on ${e.day}?',
        ),
        actions: [
          ConcordiaButton(
            label: 'Cancel',
            variant: ConcordiaButtonVariant.ghost,
            onPressed: () => Navigator.pop(ctx),
          ),
          ConcordiaButton(
            label: 'Delete',
            variant: ConcordiaButtonVariant.destructive,
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ApiClient().deleteTimetableEntry(e.id);
                ApiClient().invalidate('timetable');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Entry deleted!'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _load();
                }
              } catch (err) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                        content: Text('Error: $err'),
                        backgroundColor: AppColors.danger),
                  );
                }
              }
            },
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// EXAMS & DATE SHEETS
// ════════════════════════════════════════════════════════════════

class _AcExams extends StatefulWidget {
  const _AcExams();

  @override
  State<_AcExams> createState() => _AcExamsState();
}

class _AcExamsState extends State<_AcExams> {
  List<Exam> _exams = [];
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
      final exams = await ApiClient().listExams();
      if (!mounted) return;
      setState(() {
        _exams = exams;
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
            label: 'Create Exam',
            icon: Icons.add_outlined,
            onPressed: () => _showCreateExamDialog(),
          ),
          const SizedBox(height: 16),
          if (_exams.isEmpty)
            const EmptyState(
              icon: Icons.assignment_outlined,
              title: 'No Exams',
              subtitle: 'Create an exam to get started.',
            )
          else
            ..._exams.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: e.name,
                    subtitle: e.type,
                    initials: e.name[0],
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        ConcordiaBadge(
                          label: e.type,
                          variant: ConcordiaBadgeVariant.secondary,
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => _confirmDeleteExam(e),
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: AppColors.dangerSoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.delete_outline,
                                size: 16, color: AppColors.danger),
                          ),
                        ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }

  void _showCreateExamDialog() {
    final nameCtrl = TextEditingController();
    String type = 'Monthly Test';
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg),
          ),
          title: const Text('Create Exam'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ConcordiaInput(
                label: 'Exam Name',
                controller: nameCtrl,
                hintText: 'e.g. Mid-Term 2025',
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: type,
                decoration: InputDecoration(
                  labelText: 'Exam Type',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                  ),
                ),
                items: [
                  'Monthly Test',
                  'Mid-Term',
                  'Final Exam',
                  'Quiz',
                  'Practical',
                ].map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                onChanged: (v) => setDialogState(() => type = v ?? 'Monthly Test'),
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
                  await ApiClient().createExam({
                    'name': nameCtrl.text.trim(),
                    'type': type,
                  });
                  ApiClient().invalidate('exams');
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Exam created!'),
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

  void _confirmDeleteExam(Exam e) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Delete Exam?'),
        content: Text('Delete "${e.name}"? This action cannot be undone.'),
        actions: [
          ConcordiaButton(
            label: 'Cancel',
            variant: ConcordiaButtonVariant.ghost,
            onPressed: () => Navigator.pop(ctx),
          ),
          ConcordiaButton(
            label: 'Delete',
            variant: ConcordiaButtonVariant.destructive,
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ApiClient().deleteExam(e.id);
                ApiClient().invalidate('exams');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Exam deleted!'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _load();
                }
              } catch (err) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                        content: Text('Error: $err'),
                        backgroundColor: AppColors.danger),
                  );
                }
              }
            },
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// RESULT CARDS
// ════════════════════════════════════════════════════════════════

class _AcResults extends StatefulWidget {
  const _AcResults();

  @override
  State<_AcResults> createState() => _AcResultsState();
}

class _AcResultsState extends State<_AcResults> {
  List<ReportCard> _cards = [];
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
      final cards = await ApiClient().listReportCards();
      if (!mounted) return;
      setState(() {
        _cards = cards;
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
            label: 'Generate Report Card',
            icon: Icons.description_outlined,
            onPressed: () => _showGenerateDialog(),
          ),
          const SizedBox(height: 16),
          if (_cards.isEmpty)
            const EmptyState(
              icon: Icons.description_outlined,
              title: 'No Report Cards',
              subtitle: 'Generate report cards for students.',
            )
          else
            ..._cards.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: c.studentName,
                    subtitle:
                        '${c.className} ${c.section} • ${c.examName} • ${c.percentage.toStringAsFixed(1)}%',
                    initials: initialsOf(c.studentName),
                    trailing: StatusChip(
                      text: c.grade,
                      type: _gradeType(c.grade),
                      compact: true,
                    ),
                    onTap: () => _showCardDetail(c),
                  ),
                )),
        ],
      ),
    );
  }

  StatusType _gradeType(String grade) {
    if (grade.startsWith('A')) return StatusType.success;
    if (grade.startsWith('B')) return StatusType.info;
    if (grade.startsWith('C')) return StatusType.warning;
    return StatusType.danger;
  }

  void _showGenerateDialog() {
    final studentIdCtrl = TextEditingController();
    final termCtrl = TextEditingController();
    final examCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Generate Report Card'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConcordiaInput(
              label: 'Student ID',
              controller: studentIdCtrl,
              hintText: 'Enter student ID',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Term',
              controller: termCtrl,
              hintText: 'e.g. Term 1',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Exam Name',
              controller: examCtrl,
              hintText: 'e.g. Mid-Term',
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
            label: 'Generate',
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ApiClient().generateReportCard(
                  studentIdCtrl.text.trim(),
                  term: termCtrl.text.trim().isNotEmpty
                      ? termCtrl.text.trim()
                      : null,
                  examName: examCtrl.text.trim().isNotEmpty
                      ? examCtrl.text.trim()
                      : null,
                );
                ApiClient().invalidate('report-cards');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Report card generated!'),
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
    );
  }

  void _showCardDetail(ReportCard c) {
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
              c.studentName,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            _detailRow('Class', '${c.className} ${c.section}'),
            _detailRow('Term', c.term),
            _detailRow('Exam', c.examName),
            _detailRow('Total Marks', '${c.totalMarks}'),
            _detailRow('Obtained', '${c.obtainedMarks}'),
            _detailRow('Percentage', '${c.percentage.toStringAsFixed(1)}%'),
            _detailRow('Grade', c.grade),
            if (c.remarks != null) _detailRow('Remarks', c.remarks!),
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

// ── Quick-action card ────────────────────────────────────────────

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionCard({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.border, width: 1),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 17, color: color),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
