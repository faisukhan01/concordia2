// Teacher portal — attendance, results, classes, announcements.
// Mirrors src/components/portal/teacher-portal.tsx.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
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
class _TDashboard extends StatefulWidget {
  const _TDashboard();

  @override
  State<_TDashboard> createState() => _TDashboardState();
}

class _TDashboardState extends State<_TDashboard> {
  Map<String, dynamic>? _a;
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
      _a = await ApiClient().teacherAnalytics();
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

    final a = _a ?? {};
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
                Text('Welcome back', style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.85))),
                Text(user.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                const SizedBox(height: 6),
                Text(user.title ?? user.roleLabel, style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.9))),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const SectionHeader(title: 'Your Overview'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.1,
            children: [
              StatCard(label: 'My Classes', value: '${a['classCount'] ?? 0}', icon: Icons.class_, color: AppColors.primary),
              StatCard(label: 'My Students', value: '${a['studentCount'] ?? 0}', icon: Icons.people, color: AppColors.info),
              StatCard(label: 'Avg Attendance', value: '${a['attendanceRate'] ?? 0}%', icon: Icons.check_circle, color: AppColors.success),
              StatCard(label: 'Avg Result', value: '${a['averageMarks'] ?? 0}%', icon: Icons.grade, color: AppColors.warning),
            ],
          ),
          const SectionHeader(title: 'Recent Announcements'),
          _TAnnouncementsPreview(),
        ],
      ),
    );
  }
}

class _TAnnouncementsPreview extends StatefulWidget {
  @override
  State<_TAnnouncementsPreview> createState() => _TAnnouncementsPreviewState();
}

class _TAnnouncementsPreviewState extends State<_TAnnouncementsPreview> {
  List<Announcement> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _items = await ApiClient().listAnnouncements();
      if (_items.length > 3) _items = _items.sublist(0, 3);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox(height: 60, child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
    if (_items.isEmpty) return const EmptyState(icon: Icons.campaign_outlined, title: 'No announcements');
    return Column(
      children: _items.map((a) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: 4),
            Text(a.message, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ),
      )).toList(),
    );
  }
}

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
    setState(() { _loading = true; _error = null; });
    try {
      _classes = await ApiClient().teacherClasses();
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
          ? const EmptyState(icon: Icons.class_outlined, title: 'No classes assigned', subtitle: 'The Academic Office will assign classes to you.')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _classes.length,
              itemBuilder: (_, i) {
                final c = _classes[i];
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Material(
                    color: AppColors.card,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () {},
                      child: Padding(
                        padding: const EdgeInsets.all(14),
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
                                  if (c.studentCount != null)
                                    Text('${c.studentCount} students', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}

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
  bool _loading = true;
  Map<String, String> _marks = {}; // studentId -> present/absent/late

  @override
  void initState() {
    super.initState();
    _loadClasses();
  }

  Future<void> _loadClasses() async {
    setState(() => _loading = true);
    try {
      _classes = await ApiClient().teacherClasses();
      if (_classes.isNotEmpty) {
        _selectedClass = _classes.first;
        await _loadStudents();
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadStudents() async {
    if (_selectedClass == null) return;
    try {
      final auth = context.read<AuthProvider>();
      final all = await ApiClient().listUsers(role: 'student', branchId: auth.user!.branchId);
      _students = all.where((s) => s.className == _selectedClass!.name && s.section == _selectedClass!.section).toList();
      // Default everyone to present
      _marks = {for (final s in _students) s.id: 'present'};
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Future<void> _submit() async {
    if (_selectedClass == null) return;
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().markAttendance({
        'branchId': auth.user!.branchId,
        'classId': _selectedClass!.id,
        'date': DateTime.now().toIso8601String().substring(0, 10),
        'teacherId': auth.user!.id,
        'records': _marks,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Attendance saved'), backgroundColor: AppColors.success));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_classes.isEmpty) return const EmptyState(icon: Icons.class_outlined, title: 'No classes assigned');

    return Column(
      children: [
        // Class dropdown
        Padding(
          padding: const EdgeInsets.all(16),
          child: DropdownButtonFormField<SchoolClass>(
            value: _selectedClass,
            decoration: const InputDecoration(labelText: 'Select Class', prefixIcon: Icon(Icons.class_outlined, size: 20)),
            items: _classes.map((c) => DropdownMenuItem(value: c, child: Text('${c.name} — ${c.section}'))).toList(),
            onChanged: (c) async {
              setState(() => _selectedClass = c);
              await _loadStudents();
            },
          ),
        ),
        Expanded(
          child: _students.isEmpty
              ? const EmptyState(icon: Icons.people_outline, title: 'No students in this class')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _students.length,
                  itemBuilder: (_, i) {
                    final s = _students[i];
                    final status = _marks[s.id] ?? 'present';
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
                      child: Row(
                        children: [
                          CircleAvatar(radius: 18, backgroundColor: AppColors.primary.withOpacity(0.1), child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700))),
                          const SizedBox(width: 10),
                          Expanded(child: Text(s.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppColors.textPrimary))),
                          // Status toggle
                          _StatusToggle(
                            status: status,
                            onChanged: (v) => setState(() => _marks[s.id] = v),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton.icon(
            onPressed: _submit,
            icon: const Icon(Icons.save),
            label: const Text('Save Attendance'),
          ),
        ),
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
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _btn('P', 'present', AppColors.success),
        const SizedBox(width: 4),
        _btn('A', 'absent', AppColors.danger),
        const SizedBox(width: 4),
        _btn('L', 'late', AppColors.warning),
      ],
    );
  }

  Widget _btn(String label, String value, Color color) {
    final active = status == value;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: Container(
        width: 30, height: 30,
        decoration: BoxDecoration(
          color: active ? color : color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color),
        ),
        alignment: Alignment.center,
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: active ? Colors.white : color)),
      ),
    );
  }
}

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
  bool _loading = true;
  final _marks = <String, int>{};
  final _totalController = TextEditingController(text: '100');

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      _classes = await api.teacherClasses();
      _exams = await api.listExams(branchId: auth.user!.branchId);
      if (_classes.isNotEmpty) {
        _selectedClass = _classes.first;
        await _loadStudents();
      }
      if (_exams.isNotEmpty) _selectedExam = _exams.first;
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadStudents() async {
    if (_selectedClass == null) return;
    try {
      final auth = context.read<AuthProvider>();
      final all = await ApiClient().listUsers(role: 'student', branchId: auth.user!.branchId);
      _students = all.where((s) => s.className == _selectedClass!.name && s.section == _selectedClass!.section).toList();
      _marks.clear();
      for (final s in _students) {
        _marks[s.id] = 0;
      }
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Future<void> _submit() async {
    if (_selectedClass == null || _selectedExam == null) return;
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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Results submitted'), backgroundColor: AppColors.success));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  void dispose() {
    _totalController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<SchoolClass>(
                  value: _selectedClass,
                  decoration: const InputDecoration(labelText: 'Class', isDense: true),
                  items: _classes.map((c) => DropdownMenuItem(value: c, child: Text('${c.name}-${c.section}'))).toList(),
                  onChanged: (c) async { setState(() => _selectedClass = c); await _loadStudents(); },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<Exam>(
                  value: _selectedExam,
                  decoration: const InputDecoration(labelText: 'Exam', isDense: true),
                  items: _exams.map((e) => DropdownMenuItem(value: e, child: Text(e.name))).toList(),
                  onChanged: (e) => setState(() => _selectedExam = e),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SizedBox(
            width: 120,
            child: TextField(
              controller: _totalController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Total Marks', isDense: true),
            ),
          ),
        ),
        Expanded(
          child: _students.isEmpty
              ? const EmptyState(icon: Icons.people_outline, title: 'No students')
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _students.length,
                  itemBuilder: (_, i) {
                    final s = _students[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
                      child: Row(
                        children: [
                          Expanded(child: Text(s.name, style: TextStyle(fontSize: 14, color: AppColors.textPrimary))),
                          SizedBox(
                            width: 80,
                            child: TextField(
                              keyboardType: TextInputType.number,
                              decoration: InputDecoration(hintText: '0', isDense: true, contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8)),
                              onChanged: (v) => _marks[s.id] = int.tryParse(v) ?? 0,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton.icon(onPressed: _submit, icon: const Icon(Icons.send), label: const Text('Submit Results')),
        ),
      ],
    );
  }
}

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
    setState(() { _loading = true; _error = null; });
    try {
      _items = await ApiClient().listAnnouncements();
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
      child: _items.isEmpty
          ? const EmptyState(icon: Icons.campaign_outlined, title: 'No announcements')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _items.length,
              itemBuilder: (_, i) {
                final a = _items[i];
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(child: Text(a.title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.textPrimary))),
                          if (a.createdAt != null) Text(a.createdAt!.substring(0, 10), style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(a.message, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
