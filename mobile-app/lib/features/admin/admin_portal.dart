// Admin / Super-Admin portal — hub for all modules.
// Delegates into the 3 office sub-portals but keeps a unified dashboard.
// Mirrors src/components/portal/admin-portal.tsx + super-admin-portal.tsx.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import '../shared/nav_items.dart';

class AdminPortal extends StatefulWidget {
  final AdminTab initialTab;
  const AdminPortal({super.key, this.initialTab = AdminTab.dashboard});

  @override
  State<AdminPortal> createState() => _AdminPortalState();
}

class _AdminPortalState extends State<AdminPortal> {
  @override
  Widget build(BuildContext context) {
    switch (widget.initialTab) {
      case AdminTab.dashboard:
        return const _AdminDashboard();
      case AdminTab.students:
        return _AdminStudents();
      case AdminTab.fees:
        return _AdminFees();
      case AdminTab.academic:
        return _AdminAcademic();
      case AdminTab.announcements:
        return _AdminAnnouncements();
    }
  }
}

class _AdminDashboard extends StatefulWidget {
  const _AdminDashboard();

  @override
  State<_AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<_AdminDashboard> {
  DashboardStats? _stats;
  Map<String, dynamic>? _finance;
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
      final api = ApiClient();
      _stats = await api.scopedStats(branchId: auth.user!.branchId);
      try {
        _finance = await api.branchFinance();
      } catch (_) { _finance = {}; }
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
    final f = _finance ?? {};
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
                Text(user.branchName ?? 'Concordia College', style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.9))),
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
              StatCard(label: 'Students', value: '${s.totalStudents}', icon: Icons.people, color: AppColors.primary),
              StatCard(label: 'Teachers', value: '${s.totalTeachers}', icon: Icons.person, color: AppColors.info),
              StatCard(label: 'Revenue', value: formatMoney((f['totalRevenue'] as num?)?.toDouble() ?? s.collectedThisMonth), icon: Icons.trending_up, color: AppColors.success),
              StatCard(label: 'Pending', value: formatMoney((f['pendingFees'] as num?)?.toDouble() ?? s.pendingFees), icon: Icons.pending_actions, color: AppColors.warning),
            ],
          ),
          const SectionHeader(title: 'Quick Actions'),
          _QuickAction(icon: Icons.people, label: 'Students', subtitle: '${s.totalStudents} enrolled', color: AppColors.primary),
          _QuickAction(icon: Icons.account_balance_wallet, label: 'Fees', subtitle: 'Collect & track payments', color: AppColors.success),
          _QuickAction(icon: Icons.school, label: 'Academics', subtitle: 'Classes, exams, results', color: AppColors.info),
          _QuickAction(icon: Icons.campaign, label: 'Announcements', subtitle: 'Send notices', color: AppColors.warning),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  const _QuickAction({required this.icon, required this.label, required this.subtitle, required this.color});

  @override
  Widget build(BuildContext context) {
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
                Container(width: 44, height: 44, decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(11)), child: Icon(icon, size: 22, color: color)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)), Text(subtitle, style: TextStyle(fontSize: 12, color: AppColors.textSecondary))])),
                Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Students tab ──
class _AdminStudents extends StatefulWidget {
  @override
  State<_AdminStudents> createState() => _AdminStudentsState();
}

class _AdminStudentsState extends State<_AdminStudents> {
  List<User> _students = [];
  List<User> _teachers = [];
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
      final api = ApiClient();
      _students = await api.listUsers(role: 'student', branchId: auth.user!.branchId);
      _teachers = await api.listUsers(role: 'teacher', branchId: auth.user!.branchId);
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
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.primary,
            tabs: [Tab(text: 'Students'), Tab(text: 'Teachers')],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _students.isEmpty
                    ? const EmptyState(icon: Icons.people_outline, title: 'No students')
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _students.length,
                        itemBuilder: (_, i) {
                          final s = _students[i];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                            child: Row(
                              children: [
                                CircleAvatar(radius: 20, backgroundColor: AppColors.primary.withOpacity(0.1), child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700))),
                                const SizedBox(width: 12),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(s.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)), Text('${s.rollNo ?? '—'} · ${s.className ?? '—'}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary))])),
                                StatusChip(text: s.isActive ? 'Active' : 'Blocked', type: s.isActive ? StatusType.success : StatusType.danger),
                              ],
                            ),
                          );
                        },
                      ),
                _teachers.isEmpty
                    ? const EmptyState(icon: Icons.person_outline, title: 'No teachers')
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _teachers.length,
                        itemBuilder: (_, i) {
                          final t = _teachers[i];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                            child: Row(
                              children: [
                                CircleAvatar(radius: 20, backgroundColor: AppColors.info.withOpacity(0.1), child: Text(t.name.isNotEmpty ? t.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.info, fontWeight: FontWeight.w700))),
                                const SizedBox(width: 12),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(t.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)), Text(t.title ?? t.roleLabel, style: TextStyle(fontSize: 12, color: AppColors.textSecondary))])),
                                StatusChip(text: t.isActive ? 'Active' : 'Blocked', type: t.isActive ? StatusType.success : StatusType.danger),
                              ],
                            ),
                          );
                        },
                      ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Fees tab ──
class _AdminFees extends StatefulWidget {
  @override
  State<_AdminFees> createState() => _AdminFeesState();
}

class _AdminFeesState extends State<_AdminFees> {
  List<FeeInvoice> _invoices = [];
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
      _invoices = await ApiClient().listBranchInvoices();
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

    final pending = _invoices.where((i) => !i.isPaid).fold(0.0, (a, i) => a + i.amount);
    final collected = _invoices.where((i) => i.isPaid).fold(0.0, (a, i) => a + (i.paidAmount ?? 0));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [AppColors.primary, AppColors.primaryDark]), borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Pending', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.85))), Text(formatMoney(pending), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white))])),
                Container(width: 1, height: 36, color: Colors.white.withOpacity(0.3)),
                const SizedBox(width: 16),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Collected', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.85))), Text(formatMoney(collected), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white))])),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_invoices.isEmpty)
            const EmptyState(icon: Icons.receipt_long_outlined, title: 'No invoices')
          else
            ..._invoices.take(20).map((i) => Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
              child: Row(
                children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(i.studentName, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)), Text('${i.className} · ${i.monthYear}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary))])),
                  Text(formatMoneyFull(i.amount), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  const SizedBox(width: 8),
                  StatusChip(text: i.isPaid ? 'Paid' : 'Unpaid', type: i.isPaid ? StatusType.success : StatusType.warning),
                ],
              ),
            )),
        ],
      ),
    );
  }
}

// ── Academic tab (summary) ──
class _AdminAcademic extends StatefulWidget {
  @override
  State<_AdminAcademic> createState() => _AdminAcademicState();
}

class _AdminAcademicState extends State<_AdminAcademic> {
  List<SchoolClass> _classes = [];
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
      final api = ApiClient();
      _classes = await api.listClasses(branchId: auth.user!.branchId);
      _exams = await api.listExams(branchId: auth.user!.branchId);
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
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SectionHeader(title: 'Classes'),
          if (_classes.isEmpty)
            const EmptyState(icon: Icons.class_outlined, title: 'No classes')
          else
            ..._classes.take(10).map((c) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
              child: Row(children: [const Icon(Icons.class_, color: AppColors.primary), const SizedBox(width: 12), Expanded(child: Text('${c.name} — ${c.section}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)))]),
            )),
          const SectionHeader(title: 'Exams'),
          if (_exams.isEmpty)
            const EmptyState(icon: Icons.assignment_outlined, title: 'No exams')
          else
            ..._exams.map((e) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.border)),
              child: Row(children: [const Icon(Icons.assignment, color: AppColors.primary), const SizedBox(width: 12), Expanded(child: Text(e.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)))]),
            )),
        ],
      ),
    );
  }
}

// ── Announcements tab ──
class _AdminAnnouncements extends StatefulWidget {
  @override
  State<_AdminAnnouncements> createState() => _AdminAnnouncementsState();
}

class _AdminAnnouncementsState extends State<_AdminAnnouncements> {
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

  Future<void> _create() async {
    final titleController = TextEditingController();
    final msgController = TextEditingController();
    String targetRole = 'all';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('New Announcement'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: titleController, decoration: const InputDecoration(labelText: 'Title')),
                const SizedBox(height: 12),
                TextField(controller: msgController, decoration: const InputDecoration(labelText: 'Message'), maxLines: 3),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: targetRole,
                  decoration: const InputDecoration(labelText: 'Target'),
                  items: const [
                    DropdownMenuItem(value: 'all', child: Text('Everyone')),
                    DropdownMenuItem(value: 'student', child: Text('Students')),
                    DropdownMenuItem(value: 'teacher', child: Text('Teachers')),
                    DropdownMenuItem(value: 'parent', child: Text('Parents')),
                  ],
                  onChanged: (v) => setSt(() => targetRole = v ?? 'all'),
                ),
              ],
            ),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Post'))],
        ),
      ),
    );
    if (ok != true || titleController.text.isEmpty) return;
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createAnnouncement({
        'title': titleController.text.trim(),
        'message': msgController.text.trim(),
        'targetRole': targetRole,
        'targetScope': targetRole == 'all' ? 'all' : 'role',
        'senderId': auth.user!.id,
        'senderRole': auth.user!.role,
        'branchId': auth.user!.branchId,
        'instituteId': auth.user!.instituteId,
      });
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
        child: _items.isEmpty
            ? const EmptyState(icon: Icons.campaign_outlined, title: 'No announcements', subtitle: 'Tap + to post one')
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
                            StatusChip(text: a.targetRole, type: StatusType.info),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(a.message, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                        if (a.createdAt != null) ...[const SizedBox(height: 6), Text(a.createdAt!.substring(0, 10), style: TextStyle(fontSize: 11, color: AppColors.textMuted))],
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
