// Academic Office portal — classes, timetable, exams, report cards.
// Mirrors src/components/portal/academic-portal.tsx.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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

class _AcDashboard extends StatefulWidget {
  const _AcDashboard();

  @override
  State<_AcDashboard> createState() => _AcDashboardState();
}

class _AcDashboardState extends State<_AcDashboard> {
  DashboardStats? _stats;
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
      final auth = context.read<AuthProvider>();
      _stats = await ApiClient().scopedStats(branchId: auth.user!.branchId);
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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    final s = _stats ?? DashboardStats();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.primary, AppColors.primaryDark]),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Academic Office', style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.85))),
                Text(user.branchName ?? 'Concordia College', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const SectionHeader(title: 'Overview'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.1,
            children: [
              StatCard(label: 'Classes', value: '${s.totalClasses}', icon: Icons.class_, color: AppColors.primary),
              StatCard(label: 'Students', value: '${s.totalStudents}', icon: Icons.people, color: AppColors.info),
              StatCard(label: 'Teachers', value: '${s.totalTeachers}', icon: Icons.person, color: AppColors.success),
              StatCard(label: 'Announcements', value: '${s.activeAnnouncements}', icon: Icons.campaign, color: AppColors.warning),
            ],
          ),
        ],
      ),
    );
  }
}

class _AcClasses extends StatefulWidget {
  const _AcClasses();

  @override
  State<_AcClasses> createState() => _AcClassesState();
}

class _AcClassesState extends State<_AcClasses> {
  List<SchoolClass> _classes = [];
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: _classes.isEmpty
          ? const EmptyState(icon: Icons.class_outlined, title: 'No classes yet')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _classes.length,
              itemBuilder: (_, i) {
                final c = _classes[i];
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                  child: Row(
                    children: [
                      Container(
                        width: 48, height: 48,
                        decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                        child: const Icon(Icons.class_, color: AppColors.primary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${c.name} — ${c.section}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                            if (c.teacherName != null) Text('Teacher: ${c.teacherName}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}

class _AcTimetable extends StatefulWidget {
  const _AcTimetable();

  @override
  State<_AcTimetable> createState() => _AcTimetableState();
}

class _AcTimetableState extends State<_AcTimetable> {
  List<TimetableEntry> _entries = [];
  bool _loading = true;
  String? _error;
  String _day = 'Monday';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      _entries = await ApiClient().listTimetable(branchId: auth.user!.branchId);
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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    final today = _entries.where((e) => e.day == _day).toList()..sort((a, b) => a.period.compareTo(b.period));

    return Column(
      children: [
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: days.map((d) {
              final active = d == _day;
              return GestureDetector(
                onTap: () => setState(() => _day = d),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : AppColors.card,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: active ? AppColors.primary : AppColors.border),
                  ),
                  alignment: Alignment.center,
                  child: Text(d.substring(0, 3), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? Colors.white : AppColors.textSecondary)),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: today.isEmpty
              ? const EmptyState(icon: Icons.calendar_today_outlined, title: 'No classes scheduled')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: today.length,
                  itemBuilder: (_, i) {
                    final e = today[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border(left: BorderSide(color: AppColors.primary, width: 3), top: const BorderSide(color: AppColors.border), right: const BorderSide(color: AppColors.border), bottom: const BorderSide(color: AppColors.border)),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                            child: Text('P${e.period}', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(e.subject, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                                Text('${e.className}-${e.section}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                Text('${e.startTime} — ${e.endTime}', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

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
    setState(() { _loading = true; _error = null; });
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
    final nameController = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create Exam'),
        content: TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Exam Name', hintText: 'e.g. Mid Term 2026')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
        ],
      ),
    );
    if (ok != true || nameController.text.isEmpty) return;
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createExam({'name': nameController.text.trim(), 'branchId': auth.user!.branchId, 'instituteId': auth.user!.instituteId, 'type': 'Monthly Test', 'createdBy': auth.user!.id});
      _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    return Scaffold(
      floatingActionButton: FloatingActionButton(onPressed: _create, backgroundColor: AppColors.primary, child: const Icon(Icons.add, color: Colors.white)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _exams.isEmpty
            ? const EmptyState(icon: Icons.assignment_outlined, title: 'No exams yet', subtitle: 'Tap + to create an exam')
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _exams.length,
                itemBuilder: (_, i) {
                  final e = _exams[i];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                    child: Row(
                      children: [
                        const Icon(Icons.assignment, color: AppColors.primary),
                        const SizedBox(width: 12),
                        Expanded(child: Text(e.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                        StatusChip(text: e.type, type: StatusType.info),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}

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
    setState(() { _loading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      _cards = await ApiClient().listReportCards(branchId: auth.user!.branchId);
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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    return RefreshIndicator(
      onRefresh: _load,
      child: _cards.isEmpty
          ? const EmptyState(icon: Icons.description_outlined, title: 'No report cards generated yet')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _cards.length,
              itemBuilder: (_, i) {
                final c = _cards[i];
                Color gc = c.grade.startsWith('A') ? AppColors.success : c.grade.startsWith('B') ? AppColors.info : c.grade.startsWith('C') ? AppColors.warning : AppColors.danger;
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                  child: Row(
                    children: [
                      Container(
                        width: 48, height: 48,
                        decoration: BoxDecoration(color: gc.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                        child: Center(child: Text(c.grade, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: gc))),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.studentName, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                            Text('${c.className}-${c.section} · ${c.term}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                      Text('${c.obtainedMarks}/${c.totalMarks}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
