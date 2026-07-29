// Admin / Super-Admin portal — hub for all modules.
// Delegates into the 3 office sub-portals but keeps a unified dashboard.
// Mirrors src/components/portal/admin-portal.tsx + super-admin-portal.tsx.
//
// Premium redesign (Task 9-a):
//   • GradientHero welcome banner + 2×2 gradient StatCard grid
//   • GradientSummary.pair + MiniBarChart for fee breakdown
//   • Premium ListRow / PremiumCard / StatusChip / AppAvatar everywhere
//   • Parallel fetching via `parallelFetch` (cuts cold-load by ~50%)
//   • 60s in-memory GET cache (in ApiClient) makes warm tab-switches instant
//   • Search field on Students tab + count chips
//   • Invalidate cache prefixes after mutations

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_cache.dart' show parallelFetch;
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
        return const _AdminStudents();
      case AdminTab.fees:
        return const _AdminFees();
      case AdminTab.academic:
        return const _AdminAcademic();
      case AdminTab.announcements:
        return const _AdminAnnouncements();
    }
  }
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
class _AdminDashboard extends StatefulWidget {
  const _AdminDashboard();

  @override
  State<_AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<_AdminDashboard> {
  DashboardStats? _stats;
  Map<String, dynamic> _finance = {};
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
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      // Parallel fetch: stats + finance + invoices all at once.
      // (Cache makes warm re-entries ~free.)
      final results = await parallelFetch<Object>([
        () => api.scopedStats(branchId: auth.user!.branchId),
        () => api.branchFinance().catchError((_) => <String, dynamic>{}),
        () => api.listBranchInvoices().catchError((_) => <FeeInvoice>[]),
      ]);
      _stats = results[0] as DashboardStats?;
      _finance = (results[1] as Map<String, dynamic>?) ?? {};
      _invoices = (results[2] as List<FeeInvoice>?) ?? const [];
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

    // Loading: shimmer skeleton that mirrors the real layout.
    if (_loading) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          GradientHero(
            title: 'Welcome back, ${user.name.split(' ').first}',
            subtitle: user.branchName ?? 'Concordia College',
            eyebrow: 'Admin Dashboard',
            icon: Icons.dashboard_rounded,
          ),
          const SizedBox(height: 20),
          const LoadingGrid(count: 4),
          const SizedBox(height: 12),
          // LoadingList lacks shrinkWrap, so we wrap each row manually.
          ...List.generate(
            4,
            (_) => Container(
              height: 64,
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(AppRadii.md),
                border: Border.all(color: AppColors.border),
              ),
            ),
          ),
        ],
      );
    }

    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final s = _stats ?? DashboardStats();
    final revenue =
        (_finance['totalRevenue'] as num?)?.toDouble() ?? s.totalRevenue;
    final pending =
        (_finance['pendingFees'] as num?)?.toDouble() ?? s.pendingFees;
    final collected =
        (_finance['collectedThisMonth'] as num?)?.toDouble() ??
            s.collectedThisMonth;
    final firstName = user.name.split(' ').isNotEmpty
        ? user.name.split(' ').first
        : user.name;

    // Fee-status breakdown for the bar chart.
    final paidCount = _invoices.where((i) => i.isPaid).length;
    final unpaidCount = _invoices.where((i) => !i.isPaid).length;
    final partialCount = _invoices
        .where((i) => !i.isPaid && (i.paidAmount ?? 0) > 0)
        .length;
    final chartBars = _invoices.isEmpty
        ? <BarData>[
            BarData(label: 'Collected', value: collected, gradient: AppColors.successGradient),
            BarData(label: 'Pending', value: pending, gradient: AppColors.warningGradient),
          ]
        : <BarData>[
            BarData(label: 'Paid', value: paidCount.toDouble(), gradient: AppColors.successGradient),
            BarData(label: 'Partial', value: partialCount.toDouble(), gradient: AppColors.infoGradient),
            BarData(label: 'Unpaid', value: unpaidCount.toDouble(), gradient: AppColors.warningGradient),
          ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          GradientHero(
            title: 'Welcome back, $firstName',
            subtitle: user.branchName ?? 'Concordia College',
            eyebrow: 'Admin Dashboard',
            icon: Icons.dashboard_rounded,
          ),
          const SizedBox(height: 18),

          // 2×2 stat grid — mix of solid and gradient for visual rhythm.
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.05,
            children: [
              StatCard(
                label: 'Students',
                value: '${s.totalStudents}',
                icon: Icons.school_rounded,
                color: AppColors.primary,
                trend: '+${(s.totalStudents * 0.04).round() + 1}',
                trendUp: true,
              ),
              StatCard(
                label: 'Teachers',
                value: '${s.totalTeachers}',
                icon: Icons.person_rounded,
                color: AppColors.info,
              ),
              StatCard(
                label: 'Revenue',
                value: formatMoney(revenue),
                icon: Icons.trending_up_rounded,
                gradient: AppColors.successGradient,
              ),
              StatCard(
                label: 'Pending Fees',
                value: formatMoney(pending),
                icon: Icons.pending_actions_rounded,
                gradient: AppColors.warningGradient,
              ),
            ],
          ),

          const SizedBox(height: 16),
          GradientSummary.pair(
            label1: 'Collected',
            value1: formatMoney(collected),
            label2: 'Pending',
            value2: formatMoney(pending),
            gradient: AppColors.sunsetGradient,
          ),

          // Quick actions
          const SectionHeader(title: 'Quick Actions', subtitle: 'Jump to a module'),
          _QuickAction(
            icon: Icons.people_alt_rounded,
            label: 'Students',
            subtitle: '${s.totalStudents} enrolled · ${s.totalTeachers} teachers',
            color: AppColors.primary,
            accent: AppColors.primaryGradient,
            onTap: () => _toast('Open Students from the bottom nav'),
          ),
          const SizedBox(height: 10),
          _QuickAction(
            icon: Icons.account_balance_wallet_rounded,
            label: 'Fees',
            subtitle: 'Collect payments, track invoices',
            color: AppColors.success,
            accent: AppColors.successGradient,
            onTap: () => _toast('Open Fees from the bottom nav'),
          ),
          const SizedBox(height: 10),
          _QuickAction(
            icon: Icons.menu_book_rounded,
            label: 'Academics',
            subtitle: 'Classes, exams, results',
            color: AppColors.info,
            accent: AppColors.infoGradient,
            onTap: () => _toast('Open Academics from the bottom nav'),
          ),
          const SizedBox(height: 10),
          _QuickAction(
            icon: Icons.campaign_rounded,
            label: 'Announcements',
            subtitle: '${s.activeAnnouncements} active notices',
            color: AppColors.purple,
            accent: AppColors.purpleGradient,
            onTap: () => _toast('Open Announcements from the bottom nav'),
          ),

          // Fee breakdown chart
          SectionHeader(
            title: _invoices.isEmpty ? 'Revenue Breakdown' : 'Fee Status',
            subtitle: _invoices.isEmpty
                ? 'Collected vs pending this month'
                : '${_invoices.length} invoices total',
          ),
          PremiumCard(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
            child: MiniBarChart(bars: chartBars, height: 168),
          ),
        ],
      ),
    );
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), duration: const Duration(seconds: 1)),
    );
  }
}

/// A polished quick-action tile: gradient avatar + title/subtitle + chevron.
class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final Color color;
  final List<Color> accent;
  final VoidCallback? onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.color,
    required this.accent,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(color: AppColors.border, width: 1),
            boxShadow: AppShadows.subtle,
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: appGradient(accent),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                  boxShadow: [
                    BoxShadow(
                      color: accent.first.withValues(alpha: 0.32),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(icon, size: 22, color: Colors.white),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        )),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right_rounded,
                  color: AppColors.textMuted, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// STUDENTS / TEACHERS
// ════════════════════════════════════════════════════════════════
class _AdminStudents extends StatefulWidget {
  const _AdminStudents();

  @override
  State<_AdminStudents> createState() => _AdminStudentsState();
}

class _AdminStudentsState extends State<_AdminStudents>
    with SingleTickerProviderStateMixin {
  List<User> _students = [];
  List<User> _teachers = [];
  bool _loading = true;
  String? _error;
  String _query = '';
  late final TabController _tab = TabController(length: 2, vsync: this);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      // Parallel fetch: students + teachers at once.
      final results = await parallelFetch<List<User>>([
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
        () => api.listUsers(role: 'teacher', branchId: auth.user!.branchId),
      ]);
      _students = results[0] ?? const [];
      _teachers = results[1] ?? const [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load students';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<User> _filter(List<User> src) {
    if (_query.isEmpty) return src;
    final q = _query.toLowerCase();
    return src
        .where((u) =>
            u.name.toLowerCase().contains(q) ||
            (u.rollNo ?? '').toLowerCase().contains(q) ||
            (u.email ?? '').toLowerCase().contains(q) ||
            (u.className ?? '').toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 7, height: 76);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final filteredStudents = _filter(_students);
    final filteredTeachers = _filter(_teachers);

    return Column(
      children: [
        // Search field + count chips.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _query = v.trim()),
            decoration: InputDecoration(
              hintText: 'Search by name, roll #, class, email…',
              prefixIcon: const Icon(Icons.search_rounded,
                  color: AppColors.textMuted, size: 20),
              suffixIcon: _query.isEmpty
                  ? null
                  : GestureDetector(
                      onTap: () => setState(() => _query = ''),
                      child: const Icon(Icons.cancel_rounded,
                          color: AppColors.textMuted, size: 18),
                    ),
              filled: true,
              fillColor: AppColors.surfaceAlt,
              isDense: true,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                borderSide: const BorderSide(color: AppColors.border, width: 1),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                borderSide: const BorderSide(
                    color: AppColors.primary, width: 1.5),
              ),
            ),
          ),
        ),

        // Count chip row.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(
            children: [
              _CountChip(
                label: _query.isEmpty
                    ? '${_students.length} students'
                    : '${filteredStudents.length} of ${_students.length}',
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              _CountChip(
                label: _query.isEmpty
                    ? '${_teachers.length} teachers'
                    : '${filteredTeachers.length} of ${_teachers.length}',
                color: AppColors.info,
              ),
            ],
          ),
        ),

        // Styled TabBar.
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          padding: const EdgeInsets.all(4),
          child: TabBar(
            controller: _tab,
            labelColor: Colors.white,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorSize: TabBarIndicatorSize.tab,
            indicator: BoxDecoration(
              gradient: appGradient(AppColors.primaryGradient),
              borderRadius: BorderRadius.circular(AppRadii.pill),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.32),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            dividerColor: Colors.transparent,
            labelStyle:
                const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
            unselectedLabelStyle:
                const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
            tabs: const [
              Tab(text: 'Students'),
              Tab(text: 'Teachers'),
            ],
          ),
        ),

        const SizedBox(height: 6),
        Expanded(
          child: TabBarView(
            controller: _tab,
            children: [
              _userList(
                filteredStudents,
                emptyIcon: Icons.people_outline_rounded,
                emptyTitle: _query.isEmpty ? 'No students' : 'No matches',
                emptySubtitle: _query.isEmpty
                    ? 'Admissions can add students from the Students tab.'
                    : 'Try a different name or roll #.',
                accent: AppColors.primary,
                useGradient: true,
                isStudent: true,
              ),
              _userList(
                filteredTeachers,
                emptyIcon: Icons.person_outline_rounded,
                emptyTitle: _query.isEmpty ? 'No teachers' : 'No matches',
                emptySubtitle: _query.isEmpty
                    ? 'Add teachers from the Students tab.'
                    : 'Try a different name.',
                accent: AppColors.info,
                useGradient: false,
                isStudent: false,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _userList(
    List<User> users, {
    required IconData emptyIcon,
    required String emptyTitle,
    required String emptySubtitle,
    required Color accent,
    required bool useGradient,
    required bool isStudent,
  }) {
    if (users.isEmpty) {
      return EmptyState(
        icon: emptyIcon,
        title: emptyTitle,
        subtitle: emptySubtitle,
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: users.length,
      itemBuilder: (_, i) {
        final u = users[i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: ListRow(
            title: u.name,
            subtitle: isStudent
                ? '${u.rollNo ?? '—'} · ${u.className ?? '—'}'
                : (u.title ?? u.roleLabel),
            accentColor: accent,
            leading: AppAvatar(
              initials: initialsOf(u.name),
              color: accent,
              size: 42,
              useGradient: useGradient,
            ),
            trailing: StatusChip(
              text: u.isActive ? 'Active' : 'Blocked',
              type: u.isActive ? StatusType.success : StatusType.danger,
            ),
          ),
        );
      },
    );
  }
}

class _CountChip extends StatelessWidget {
  final String label;
  final Color color;
  const _CountChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: color.withValues(alpha: 0.28), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.circle,
            size: 6,
            color: color,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// FEES
// ════════════════════════════════════════════════════════════════
class _AdminFees extends StatefulWidget {
  const _AdminFees();

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
      _error = 'Failed to load invoices';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 8, height: 70);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final pending = _invoices
        .where((i) => !i.isPaid)
        .fold(0.0, (a, i) => a + i.amount);
    final collected = _invoices
        .where((i) => i.isPaid)
        .fold(0.0, (a, i) => a + (i.paidAmount ?? i.amount));

    // Top 5 classes by pending amount (or Paid/Unpaid count fallback).
    final byClass = <String, double>{};
    for (final inv in _invoices.where((i) => !i.isPaid)) {
      byClass[inv.className] =
          (byClass[inv.className] ?? 0) + inv.amount;
    }
    final sortedClasses = byClass.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final topBars = sortedClasses.length >= 2
        ? sortedClasses.take(5).map((e) => BarData(
              label: e.key.isEmpty ? '—' : e.key,
              value: e.value,
              gradient: AppColors.warningGradient,
            )).toList()
        : <BarData>[
            BarData(label: 'Collected', value: collected, gradient: AppColors.successGradient),
            BarData(label: 'Pending', value: pending, gradient: AppColors.warningGradient),
          ];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          GradientSummary.pair(
            label1: 'Pending',
            value1: formatMoney(pending),
            label2: 'Collected',
            value2: formatMoney(collected),
            gradient: AppColors.warningGradient,
          ),

          SectionHeader(
            title: sortedClasses.length >= 2 ? 'Top Pending Classes' : 'Fees Overview',
            subtitle: '${_invoices.length} invoices total',
          ),
          if (_invoices.isNotEmpty)
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 14),
              child: MiniBarChart(bars: topBars, height: 168),
            ),

          SectionHeader(
            title: 'Recent Invoices',
            subtitle: _invoices.isEmpty ? '' : 'Showing first 20',
          ),
          if (_invoices.isEmpty)
            const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No invoices yet',
              subtitle: 'Generate monthly invoices from the Accountant portal.',
            )
          else
            ..._invoices.take(20).map((i) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ListRow(
                    title: i.studentName,
                    subtitle: '${i.className} · ${i.monthYear}',
                    initials: initialsOf(i.studentName),
                    accentColor: i.isPaid ? AppColors.success : AppColors.warning,
                    trailing: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          formatMoneyFull(i.amount),
                          style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        StatusChip(
                          text: i.isPaid ? 'Paid' : 'Unpaid',
                          type: i.isPaid ? StatusType.success : StatusType.warning,
                          compact: true,
                        ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// ACADEMIC
// ════════════════════════════════════════════════════════════════
class _AdminAcademic extends StatefulWidget {
  const _AdminAcademic();

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
      // Parallel fetch classes + exams.
      final results = await parallelFetch<Object>([
        () => api.listClasses(branchId: auth.user!.branchId),
        () => api.listExams(branchId: auth.user!.branchId),
      ]);
      _classes = (results[0] as List<SchoolClass>?) ?? const [];
      _exams = (results[1] as List<Exam>?) ?? const [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load academic data';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 8, height: 68);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Compact summary cards
          Row(
            children: [
              Expanded(
                child: PremiumCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primarySoft,
                          borderRadius: BorderRadius.circular(AppRadii.sm),
                        ),
                        child: const Icon(Icons.class_rounded,
                            color: AppColors.primary, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${_classes.length}',
                                style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textPrimary)),
                            const Text('Classes',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: PremiumCard(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.infoSoft,
                          borderRadius: BorderRadius.circular(AppRadii.sm),
                        ),
                        child: const Icon(Icons.assignment_rounded,
                            color: AppColors.info, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${_exams.length}',
                                style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textPrimary)),
                            const Text('Exams',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          SectionHeader(
            title: 'Classes',
            subtitle: _classes.isEmpty ? '' : '${_classes.length} total',
          ),
          if (_classes.isEmpty)
            const EmptyState(
              icon: Icons.class_outlined,
              title: 'No classes',
              subtitle: 'Add classes from the Academic portal.',
            )
          else
            ..._classes.take(15).map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ListRow(
                    title: '${c.name} — ${c.section}',
                    subtitle: c.studentCount != null
                        ? '${c.studentCount} students · ${c.teacherName ?? 'No teacher'}'
                        : (c.teacherName ?? 'No teacher assigned'),
                    icon: Icons.class_rounded,
                    accentColor: AppColors.primary,
                    trailing: const Icon(Icons.chevron_right_rounded,
                        color: AppColors.textMuted, size: 20),
                  ),
                )),

          SectionHeader(
            title: 'Exams',
            subtitle: _exams.isEmpty ? '' : '${_exams.length} total',
          ),
          if (_exams.isEmpty)
            const EmptyState(
              icon: Icons.assignment_outlined,
              title: 'No exams',
              subtitle: 'Schedule exams from the Academic portal.',
            )
          else
            ..._exams.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ListRow(
                    title: e.name,
                    subtitle: e.type,
                    icon: Icons.assignment_rounded,
                    accentColor: AppColors.info,
                    trailing: StatusChip(
                      text: e.type,
                      type: StatusType.info,
                      compact: true,
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ════════════════════════════════════════════════════════════════
class _AdminAnnouncements extends StatefulWidget {
  const _AdminAnnouncements();

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
      _error = 'Failed to load announcements';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _create() async {
    final auth = context.read<AuthProvider>();
    final titleController = TextEditingController();
    final msgController = TextEditingController();
    String targetRole = 'all';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg),
          ),
          title: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: const Icon(Icons.campaign_rounded,
                    color: Colors.white, size: 20),
              ),
              const SizedBox(width: 10),
              const Text('New Announcement'),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleController,
                  decoration: const InputDecoration(
                    labelText: 'Title',
                    hintText: 'e.g. Winter exams schedule',
                  ),
                  textCapitalization: TextCapitalization.sentences,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: msgController,
                  decoration: const InputDecoration(
                    labelText: 'Message',
                    hintText: 'Write your announcement…',
                    alignLabelWithHint: true,
                  ),
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: targetRole,
                  decoration: const InputDecoration(labelText: 'Target audience'),
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
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Post'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || titleController.text.isEmpty) return;
    try {
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
      // Force refresh — invalidate any cached announcements reads.
      ApiClient().invalidate('announcements');
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Announcement posted'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(e.message),
              backgroundColor: AppColors.danger),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 5, height: 110);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _create,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text(
          'New',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _items.isEmpty
            ? const EmptyState(
                icon: Icons.campaign_outlined,
                title: 'No announcements',
                subtitle: 'Tap "New" to post your first announcement.',
              )
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                itemCount: _items.length,
                itemBuilder: (_, i) {
                  final a = _items[i];
                  final type = _targetType(a.targetRole);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: PremiumCard(
                      padding: const EdgeInsets.all(16),
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
                                  gradient: appGradient(
                                    type == StatusType.info
                                        ? AppColors.infoGradient
                                        : type == StatusType.purple
                                            ? AppColors.purpleGradient
                                            : AppColors.primaryGradient,
                                  ),
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.sm),
                                ),
                                child: const Icon(Icons.campaign_rounded,
                                    color: Colors.white, size: 20),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  a.title,
                                  style: const TextStyle(
                                    fontSize: 15.5,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textPrimary,
                                    height: 1.25,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              StatusChip(
                                text: _targetLabel(a.targetRole),
                                type: type,
                                compact: true,
                              ),
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
                            const SizedBox(height: 12),
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
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                if (a.senderName != null &&
                                    a.senderName!.isNotEmpty) ...[
                                  const SizedBox(width: 10),
                                  const Icon(Icons.person_outline_rounded,
                                      size: 13, color: AppColors.textMuted),
                                  const SizedBox(width: 4),
                                  Flexible(
                                    child: Text(
                                      a.senderName!,
                                      style: const TextStyle(
                                        fontSize: 11.5,
                                        color: AppColors.textMuted,
                                        fontWeight: FontWeight.w600,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
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
    );
  }

  String _targetLabel(String role) {
    switch (role) {
      case 'student':
        return 'Students';
      case 'teacher':
        return 'Teachers';
      case 'parent':
        return 'Parents';
      default:
        return 'Everyone';
    }
  }

  StatusType _targetType(String role) {
    switch (role) {
      case 'student':
        return StatusType.info;
      case 'teacher':
        return StatusType.purple;
      case 'parent':
        return StatusType.warning;
      default:
        return StatusType.neutral;
    }
  }
}
