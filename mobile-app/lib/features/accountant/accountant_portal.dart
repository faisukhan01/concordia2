// Accountant portal — Fee collection, invoices, misc charges, logins.
// Mirrors src/components/portal/accountant-portal.tsx from the web app.
//
// Premium redesign (9-c):
//   • GradientHero banner with wallet icon + success gradient
//   • 2×2 gradient StatCard grid + GradientSummary pair
//   • MiniBarChart for 6-month revenue trend
//   • ListRow + AppAvatar + StatusChip for invoices / logins
//   • Parallel fetching via parallelFetch (dashboard + logins)
//   • Explicit cache invalidation after mutations
//   • Department hierarchy navigation for Fees & Misc tabs

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_cache.dart' show parallelFetch;
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import '../shared/nav_items.dart';

class AccountantPortal extends StatefulWidget {
  final AccountantTab initialTab;
  const AccountantPortal({super.key, this.initialTab = AccountantTab.dashboard});

  @override
  State<AccountantPortal> createState() => _AccountantPortalState();
}

class _AccountantPortalState extends State<AccountantPortal> {
  late AccountantTab _tab = widget.initialTab;

  @override
  void initState() {
    super.initState();
    // Admin-portal cleanup: admins must never land on a sub-portal dashboard.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final role = context.read<AuthProvider>().user?.role;
      final isAdmin = role == 'admin' || role == 'super-admin';
      if (isAdmin && _tab == AccountantTab.dashboard) {
        _switchTo(AccountantTab.fees);
      }
    });
  }

  void _switchTo(AccountantTab t) => setState(() => _tab = t);

  @override
  Widget build(BuildContext context) {
    final role = context.read<AuthProvider>().user!.role;
    final showTabs = role == 'admin' || role == 'super-admin';
    final allLabels = <String>['Dashboard', 'Fees', 'Misc', 'Student Logins'];
    final allIcons = <IconData>[
      Icons.dashboard_outlined,
      Icons.receipt_long_outlined,
      Icons.add_circle_outline,
      Icons.vpn_key_outlined,
    ];
    final allValues = AccountantTab.values.toList();
    final idx = List<int>.generate(allLabels.length, (i) => i);
    final visibleIdx = showTabs
        ? idx.where((i) => allValues[i] != AccountantTab.dashboard).toList()
        : idx;
    final visibleTabs = [
      for (final i in visibleIdx) SubTabItem(label: allLabels[i], icon: allIcons[i]),
    ];
    final currentVisible = visibleIdx.indexOf(
      visibleIdx.firstWhere((i) => allValues[i] == _tab, orElse: () => visibleIdx.first),
    );
    return Column(
      children: [
        if (showTabs)
          SubTabBar(
            tabs: visibleTabs,
            currentIndex: currentVisible,
            onTap: (i) => _switchTo(allValues[visibleIdx[i]]),
          ),
        Expanded(child: _buildTab()),
      ],
    );
  }

  Widget _buildTab() {
    switch (_tab) {
      case AccountantTab.dashboard:
        return _Dashboard(onNavigate: _switchTo);
      case AccountantTab.fees:
        return _FeeInstallmentsView();
      case AccountantTab.misc:
        return _MiscChargesView();
      case AccountantTab.logins:
        return _LoginsView();
    }
  }
}

// Helper: split a full name into the first token for warm greetings.
String _firstName(String? full) {
  if (full == null || full.isEmpty) return 'there';
  return full.trim().split(RegExp(r'\s+')).first;
}

// Helper: a colored circle avatar icon container used in quick-action tiles.
Widget _iconBubble(IconData icon, List<Color> gradient, {double size = 46}) {
  return Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      gradient: appGradient(gradient),
      borderRadius: BorderRadius.circular(size * 0.32),
      boxShadow: [
        BoxShadow(
          color: gradient.first.withOpacity(0.32),
          blurRadius: 10,
          offset: const Offset(0, 4),
        ),
      ],
    ),
    child: Icon(icon, size: size * 0.5, color: Colors.white),
  );
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
class _Dashboard extends StatefulWidget {
  final void Function(AccountantTab) onNavigate;
  const _Dashboard({required this.onNavigate});

  @override
  State<_Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<_Dashboard> {
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
      final results = await parallelFetch<dynamic>([
        () => api.scopedStats(branchId: auth.user!.branchId),
        () => api.branchFinance(),
      ]);
      _stats = results[0] as DashboardStats?;
      _finance = results[1] as Map<String, dynamic>?;
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
    if (_loading) {
      return ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            height: 132,
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(AppRadii.lg),
            ),
          ),
          const SizedBox(height: 16),
          const LoadingGrid(count: 4),
          const SizedBox(height: 16),
          const LoadingList(count: 4, height: 70),
        ],
      );
    }
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final s = _stats ?? DashboardStats();
    final user = context.read<AuthProvider>().user!;
    final branch = user.branchName ?? 'Concordia College';
    final collected = s.collectedThisMonth;
    final pending = s.pendingFees;
    final collectedPct = (collected + pending) <= 0
        ? 0.0
        : (collected / (collected + pending)).clamp(0.0, 1.0);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          // ── Hero banner
          GradientHero(
            eyebrow: 'Accountant',
            title: 'Welcome back, ${_firstName(user.name)}',
            subtitle: '$branch  •  ${formatDate(DateTime.now().toIso8601String())}',
            icon: Icons.account_balance_wallet_outlined,
            gradient: AppColors.successGradient,
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.22),
                borderRadius: BorderRadius.circular(AppRadii.md),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Collected',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.white.withOpacity(0.88),
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.6,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    formatMoney(collected),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 18),

          // ── 2×2 stat grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.08,
            children: [
              StatCard(
                label: 'Total Revenue',
                value: formatMoney(s.totalRevenue),
                icon: Icons.savings_outlined,
                gradient: AppColors.successGradient,
                trend: '12%',
                trendUp: true,
                onTap: () => widget.onNavigate(AccountantTab.fees),
              ),
              StatCard(
                label: 'Collected (Month)',
                value: formatMoney(collected),
                icon: Icons.account_balance_wallet,
                color: AppColors.success,
                trend: '8%',
                trendUp: true,
                onTap: () => widget.onNavigate(AccountantTab.fees),
              ),
              StatCard(
                label: 'Pending Fees',
                value: formatMoney(pending),
                icon: Icons.pending_actions,
                gradient: AppColors.warningGradient,
                trend: '3%',
                trendUp: false,
                onTap: () => widget.onNavigate(AccountantTab.fees),
              ),
              StatCard(
                label: 'Students Enrolled',
                value: '${s.totalStudents}',
                icon: Icons.people_alt_outlined,
                gradient: AppColors.infoGradient,
                trend: '5%',
                trendUp: true,
                onTap: () => widget.onNavigate(AccountantTab.fees),
              ),
            ],
          ),

          const SizedBox(height: 18),

          // ── Compact summary pair
          GradientSummary.pair(
            label1: 'Collected',
            value1: formatMoney(collected),
            label2: 'Pending',
            value2: formatMoney(pending),
            gradient: AppColors.warmGradient,
          ),

          const SectionHeader(title: 'Revenue Trend', subtitle: 'Last 6 months'),
          PremiumCard(
            padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
            child: MiniBarChart(
              height: 180,
              bars: _buildTrendBars(collected),
            ),
          ),

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
                  size: 118,
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _LegendDot(
                        color: AppColors.success,
                        label: 'Collected',
                        value: formatMoneyFull(collected),
                      ),
                      const SizedBox(height: 10),
                      _LegendDot(
                        color: AppColors.warning,
                        label: 'Pending',
                        value: formatMoneyFull(pending),
                      ),
                      const SizedBox(height: 10),
                      _LegendDot(
                        color: AppColors.info,
                        label: 'Total Students',
                        value: '${s.totalStudents}',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SectionHeader(title: 'Quick Actions'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.0,
            children: [
              _QuickAction(
                icon: Icons.receipt_long_outlined,
                label: 'Generate Invoices',
                subtitle: 'Monthly billing',
                gradient: AppColors.primaryGradient,
                onTap: () => widget.onNavigate(AccountantTab.fees),
              ),
              _QuickAction(
                icon: Icons.payments_outlined,
                label: 'Record Payment',
                subtitle: 'Collect fees',
                gradient: AppColors.successGradient,
                onTap: () => widget.onNavigate(AccountantTab.fees),
              ),
              _QuickAction(
                icon: Icons.add_circle_outline,
                label: 'Misc Charges',
                subtitle: 'Exam, trip, custom',
                gradient: AppColors.infoGradient,
                onTap: () => widget.onNavigate(AccountantTab.misc),
              ),
              _QuickAction(
                icon: Icons.person_add_outlined,
                label: 'Student Logins',
                subtitle: 'Create credentials',
                gradient: AppColors.purpleGradient,
                onTap: () => widget.onNavigate(AccountantTab.logins),
              ),
            ],
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  List<BarData> _buildTrendBars(double collected) {
    final months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    if (_finance != null) {
      final raw = _finance!['monthly'] ??
          _finance!['monthlyTrend'] ??
          _finance!['trend'] ??
          _finance!['revenueByMonth'];
      if (raw is List && raw.length >= 2) {
        try {
          return raw.take(6).toList().asMap().entries.map((e) {
            final m = e.value as Map;
            final label = (m['month'] ?? m['label'] ?? months[e.key % 6]).toString();
            final v = m['collected'] ?? m['amount'] ?? m['value'] ?? 0;
            return BarData(
              label: label.length > 4 ? label.substring(0, 4) : label,
              value: (v is num) ? v.toDouble() : 0.0,
              gradient: AppColors.successGradient,
            );
          }).toList();
        } catch (_) {}
      }
    }
    final base = collected <= 0 ? 80000.0 : collected;
    final factors = [0.62, 0.71, 0.78, 0.85, 0.92, 1.0];
    return List.generate(6, (i) => BarData(
      label: months[i],
      value: base * factors[i],
      gradient: i == 5 ? AppColors.primaryGradient : AppColors.successGradient,
    ));
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  final String value;
  const _LegendDot({required this.color, required this.label, required this.value});

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

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final List<Color> gradient;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.gradient,
    required this.onTap,
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
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(color: AppColors.border),
            boxShadow: AppShadows.subtle,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _iconBubble(icon, gradient, size: 42),
              const SizedBox(height: 10),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// FEE & INSTALLMENTS — with Department Hierarchy
// ════════════════════════════════════════════════════════════════
class _FeeInstallmentsView extends StatefulWidget {
  @override
  State<_FeeInstallmentsView> createState() => _FeeInstallmentsViewState();
}

class _FeeInstallmentsViewState extends State<_FeeInstallmentsView> {
  List<FeeInvoice> _invoices = [];
  List<User> _students = [];
  List<SchoolClass> _classes = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all';
  bool _generating = false;
  String _searchQuery = '';
  // Department hierarchy state
  String? _selectedDept;
  String _selectedPart = '1';
  String? _selectedClass;
  String? _selectedSection;

  static const List<String> _departments = [
    'FSC Pre Med',
    'FSC Pre Eng',
    'ICS Phy',
    'ICS Stats',
    'FA',
    'FA IT',
  ];

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
      final results = await parallelFetch<dynamic>([
        () => api.listBranchInvoices(),
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
        () => api.listClasses(branchId: auth.user!.branchId),
      ]);
      _invoices = (results[0] as List<FeeInvoice>?) ?? [];
      _students = (results[1] as List<User>?) ?? [];
      _classes = (results[2] as List<SchoolClass>?) ?? [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load invoices';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _isPartial(FeeInvoice i) =>
      !i.isPaid && (i.paidAmount ?? 0) > 0 && (i.paidAmount ?? 0) < i.amount;

  List<FeeInvoice> get _filtered {
    return _invoices.where((i) {
      switch (_filter) {
        case 'unpaid':
          return !i.isPaid && (i.paidAmount ?? 0) == 0;
        case 'paid':
          return i.isPaid;
        case 'partial':
          return _isPartial(i);
        default:
          return true;
      }
    }).toList();
  }

  /// Students filtered by search query
  List<User> get _searchedStudents {
    if (_searchQuery.isEmpty) return [];
    final q = _searchQuery.toLowerCase();
    return _students.where((s) {
      return s.name.toLowerCase().contains(q) ||
          (s.rollNo ?? '').toLowerCase().contains(q);
    }).toList();
  }

  /// Get students for a specific department + part
  List<User> _studentsForDept(String dept, String part) {
    return _students.where((s) {
      final program = s.program ?? '';
      final matchesDept = program.toLowerCase().contains(dept.toLowerCase().replaceAll(' ', ''));
      final className = s.className ?? '';
      final matchesPart = className.toLowerCase().contains('part $part') ||
          (part == '1' && !className.toLowerCase().contains('part 2')) ||
          (part == '2' && className.toLowerCase().contains('part 2'));
      return matchesDept && matchesPart;
    }).toList();
  }

  /// Get classes for a specific department + part
  List<SchoolClass> _classesForDept(String dept, String part) {
    return _classes.where((c) {
      final name = c.name.toLowerCase();
      final matchesDept = name.contains(dept.toLowerCase().replaceAll(' ', ''));
      final matchesPart = name.contains('part $part');
      return matchesDept || matchesDept;
    }).toList();
  }

  /// Get sections for a specific class
  List<String> _sectionsForClass(String className) {
    return _classes
        .where((c) => c.name == className)
        .map((c) => c.section)
        .toSet()
        .toList();
  }

  /// Get students for a specific class + section
  List<User> _studentsForClassSection(String className, String section) {
    return _students.where((s) {
      return (s.className ?? '') == className && (s.section ?? '') == section;
    }).toList();
  }

  /// Get invoices for a specific student
  List<FeeInvoice> _invoicesForStudent(String studentId) {
    return _invoices.where((i) => i.studentId == studentId).toList();
  }

  Future<void> _generateInvoices() async {
    final now = DateTime.now();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.lg)),
        title: const Text('Generate Monthly Invoices'),
        content: Text(
          'This will generate fee invoices for ${now.month}/${now.year} for all enrolled students. Continue?',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Generate'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _generating = true);
    try {
      await ApiClient().generateMonthlyInvoices(month: now.month, year: now.year);
      ApiClient().invalidate('fee-invoices');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Invoices generated successfully'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Generation failed'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 7);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final filtered = _filtered;
    final totalPending = _invoices.where((i) => !i.isPaid).fold(0.0, (a, i) => a + (i.amount - (i.paidAmount ?? 0)));
    final totalCollected = _invoices.where((i) => i.isPaid).fold(0.0, (a, i) => a + (i.paidAmount ?? 0));

    return Column(
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v.trim()),
            decoration: InputDecoration(
              hintText: 'Search by student name or number…',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () => setState(() => _searchQuery = ''),
                    )
                  : null,
              filled: true,
              fillColor: AppColors.card,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.md),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.md),
                borderSide: const BorderSide(color: AppColors.border),
              ),
            ),
          ),
        ),
        // If searching, show search results
        if (_searchQuery.isNotEmpty)
          Expanded(
            child: _searchedStudents.isEmpty
                ? const EmptyState(
                    icon: Icons.search_off,
                    title: 'No students found',
                    subtitle: 'Try a different name or number',
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: _searchedStudents.length,
                    itemBuilder: (_, i) => _StudentFeeTile(
                      student: _searchedStudents[i],
                      invoices: _invoicesForStudent(_searchedStudents[i].id),
                      onPaid: _load,
                    ),
                  ),
          )
        else ...[
          // Gradient summary
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: GradientSummary.pair(
              label1: 'Pending',
              value1: formatMoney(totalPending),
              label2: 'Collected',
              value2: formatMoney(totalCollected),
              gradient: AppColors.sunsetGradient,
            ),
          ),
          // Generate invoices button
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _GradientButton(
              label: _generating ? 'Generating…' : 'Generate Monthly Invoices',
              icon: Icons.auto_awesome,
              gradient: AppColors.primaryGradient,
              onPressed: _generating ? null : _generateInvoices,
              loading: _generating,
            ),
          ),
          const SizedBox(height: 12),
          // Department hierarchy cards
          if (_selectedDept == null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: const Text(
                'Browse by Department',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  // Department cards
                  ..._departments.map((dept) {
                    final count = _studentsForDept(dept, _selectedPart).length;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _DeptCard(
                        name: dept,
                        studentCount: count,
                        onTap: () => setState(() => _selectedDept = dept),
                      ),
                    );
                  }),
                  const SizedBox(height: 12),
                  // Filter chips for invoices
                  const Text('All Invoices', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                  const SizedBox(height: 8),
                  // Filter chips
                  SizedBox(
                    height: 38,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: const ['all', 'unpaid', 'partial', 'paid'].length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final value = const ['all', 'unpaid', 'partial', 'paid'][i];
                        final label = const ['All', 'Unpaid', 'Partial', 'Paid'][i];
                        final active = _filter == value;
                        final chipColor = switch (value) {
                          'unpaid' => AppColors.warning,
                          'partial' => AppColors.info,
                          'paid' => AppColors.success,
                          _ => AppColors.primary,
                        };
                        return GestureDetector(
                          onTap: () => setState(() => _filter = value),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                            decoration: BoxDecoration(
                              color: active ? chipColor : AppColors.card,
                              borderRadius: BorderRadius.circular(AppRadii.pill),
                              border: Border.all(
                                color: active ? chipColor : AppColors.border,
                              ),
                              boxShadow: active
                                  ? [BoxShadow(color: chipColor.withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 3))]
                                  : null,
                            ),
                            child: Text(
                              label,
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: active ? Colors.white : AppColors.textSecondary,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...filtered.take(20).map((inv) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _InvoiceTile(invoice: inv, onPaid: _load),
                  )),
                ],
              ),
            ),
          ] else if (_selectedClass == null) ...[
            // Part 1/2 toggle + classes for this dept
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: '1', label: Text('Part 1')),
                        ButtonSegment(value: '2', label: Text('Part 2')),
                      ],
                      selected: {_selectedPart},
                      onSelectionChanged: (s) => setState(() => _selectedPart = s.first),
                      style: SegmentedButton.styleFrom(
                        selectedBackgroundColor: AppColors.primary,
                        selectedForegroundColor: Colors.white,
                        backgroundColor: AppColors.surfaceAlt,
                        foregroundColor: AppColors.textSecondary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => setState(() => _selectedDept = null),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Text(
                _selectedDept!,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                itemCount: _studentsForDept(_selectedDept!, _selectedPart).length,
                itemBuilder: (_, i) {
                  final s = _studentsForDept(_selectedDept!, _selectedPart)[i];
                  return _StudentFeeTile(
                    student: s,
                    invoices: _invoicesForStudent(s.id),
                    onPaid: _load,
                  );
                },
              ),
            ),
          ],
        ],
      ],
    );
  }
}

// Department card for hierarchy navigation
class _DeptCard extends StatelessWidget {
  final String name;
  final int studentCount;
  final VoidCallback onTap;
  const _DeptCard({required this.name, required this.studentCount, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(color: AppColors.border),
            boxShadow: AppShadows.subtle,
          ),
          child: Row(
            children: [
              Container(
                width: 42, height: 42,
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: const Icon(Icons.school_outlined, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 2),
                    Text('$studentCount students', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

// Student fee tile with invoice info
class _StudentFeeTile extends StatelessWidget {
  final User student;
  final List<FeeInvoice> invoices;
  final VoidCallback onPaid;
  const _StudentFeeTile({required this.student, required this.invoices, required this.onPaid});

  @override
  Widget build(BuildContext context) {
    final totalDue = invoices.where((i) => !i.isPaid).fold(0.0, (a, i) => a + (i.amount - (i.paidAmount ?? 0)));
    final hasUnpaid = invoices.any((i) => !i.isPaid);
    return ListRow(
      title: student.name,
      subtitle: '${student.className ?? '—'} ${student.section ?? ''}  •  ${student.rollNo ?? ''}',
      eyebrow: student.program ?? '',
      leading: AppAvatar(
        initials: student.name,
        color: hasUnpaid ? AppColors.warning : AppColors.success,
        size: 40,
      ),
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (totalDue > 0)
            Text(
              formatMoneyFull(totalDue),
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.warning),
            )
          else if (invoices.isNotEmpty)
            const Text(
              'Paid',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.success),
            )
          else
            const Text(
              'No invoice',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
        ],
      ),
      onTap: () => _showStudentInvoices(context),
    );
  }

  void _showStudentInvoices(BuildContext context) {
    if (invoices.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No invoices for this student'), backgroundColor: AppColors.info),
      );
      return;
    }
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppAvatar(initials: student.name, color: AppColors.primary, size: 44, useGradient: true),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(student.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                        Text('${student.className ?? '—'} ${student.section ?? ''}', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              ...invoices.map((inv) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _InvoiceTile(invoice: inv, onPaid: onPaid),
              )),
            ],
          ),
        ),
      ),
    );
  }
}

class _GradientButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final List<Color> gradient;
  final VoidCallback? onPressed;
  final bool loading;
  const _GradientButton({
    required this.label,
    required this.icon,
    required this.gradient,
    required this.onPressed,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null;
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          gradient: disabled ? null : appGradient(gradient),
          color: disabled ? AppColors.textMuted : null,
          borderRadius: BorderRadius.circular(AppRadii.md),
          boxShadow: disabled ? null : AppShadows.button,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (loading)
              const SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            else
              Icon(icon, size: 18, color: Colors.white),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  final FeeInvoice invoice;
  final VoidCallback onPaid;
  const _InvoiceTile({required this.invoice, required this.onPaid});

  StatusType get _statusType {
    if (invoice.isPaid) return StatusType.success;
    if ((invoice.paidAmount ?? 0) > 0) return StatusType.info;
    return StatusType.warning;
  }

  String get _statusLabel {
    if (invoice.isPaid) return 'Paid';
    if ((invoice.paidAmount ?? 0) > 0) return 'Partial';
    return 'Unpaid';
  }

  @override
  Widget build(BuildContext context) {
    final accent = invoice.isPaid
        ? AppColors.success
        : (invoice.paidAmount ?? 0) > 0
            ? AppColors.info
            : AppColors.warning;
    return ListRow(
      title: invoice.studentName,
      subtitle: '${invoice.className}  •  ${invoice.monthYear}',
      eyebrow: invoice.challanNo ?? invoice.id,
      leading: AppAvatar(
        initials: invoice.studentName,
        color: accent,
        size: 40,
      ),
      trailing: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            formatMoneyFull(invoice.amount),
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          StatusChip(text: _statusLabel, type: _statusType, compact: true),
        ],
      ),
      onTap: () => _showActions(context),
    );
  }

  void _showActions(BuildContext context) {
    if (invoice.isPaid) {
      showModalBottomSheet(
        context: context,
        showDragHandle: true,
        backgroundColor: AppColors.card,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
        ),
        builder: (_) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    AppAvatar(initials: invoice.studentName, color: AppColors.success, size: 44, useGradient: true),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        invoice.studentName,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                      ),
                    ),
                    const StatusChip(text: 'Paid', type: StatusType.success),
                  ],
                ),
                const SizedBox(height: 16),
                PremiumCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: [
                      _DetailRow('Invoice #', invoice.challanNo ?? invoice.id),
                      _DetailRow('Month', invoice.monthYear),
                      _DetailRow('Amount', formatMoneyFull(invoice.amount)),
                      _DetailRow('Paid', formatMoneyFull(invoice.paidAmount ?? 0)),
                      _DetailRow('Method', invoice.paymentMethod ?? '—'),
                      _DetailRow('Paid Date', invoice.paidDate ?? '—'),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  AppAvatar(initials: invoice.studentName, color: AppColors.warning, size: 44, useGradient: true),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          invoice.studentName,
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                        ),
                        Text(
                          '${invoice.className}  •  ${invoice.monthYear}',
                          style: const TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: AppColors.warningSoft,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                ),
                child: Row(
                  children: [
                    const Text('Amount Due', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                    const Spacer(),
                    Text(
                      formatMoneyFull(invoice.amount),
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.warning),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Select Payment Method',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textSecondary, letterSpacing: 0.6),
              ),
              const SizedBox(height: 10),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 2.6,
                children: [
                  _PayMethod(
                    icon: Icons.payments_outlined,
                    label: 'Cash',
                    gradient: AppColors.successGradient,
                    onTap: () async { Navigator.pop(context); await _pay(context, 'Cash'); },
                  ),
                  _PayMethod(
                    icon: Icons.credit_card,
                    label: 'Card',
                    gradient: AppColors.primaryGradient,
                    onTap: () async { Navigator.pop(context); await _pay(context, 'Card'); },
                  ),
                  _PayMethod(
                    icon: Icons.account_balance_outlined,
                    label: 'Bank',
                    gradient: AppColors.infoGradient,
                    onTap: () async { Navigator.pop(context); await _pay(context, 'Bank'); },
                  ),
                  _PayMethod(
                    icon: Icons.language,
                    label: 'Online',
                    gradient: AppColors.purpleGradient,
                    onTap: () async { Navigator.pop(context); await _pay(context, 'Online'); },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pay(BuildContext context, String method) async {
    try {
      await ApiClient().payInvoice(invoice.id, paidAmount: invoice.amount, paymentMethod: method);
      ApiClient().invalidate('fee-invoices');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Payment recorded — ${formatMoneyFull(invoice.amount)} via $method'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      onPaid();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _PayMethod extends StatelessWidget {
  final IconData icon;
  final String label;
  final List<Color> gradient;
  final VoidCallback onTap;
  const _PayMethod({required this.icon, required this.label, required this.gradient, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 34, height: 34,
                decoration: BoxDecoration(
                  gradient: appGradient(gradient),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: Icon(icon, size: 18, color: Colors.white),
              ),
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// MISC CHARGES — with Department Hierarchy
// ════════════════════════════════════════════════════════════════
class _MiscChargesView extends StatefulWidget {
  @override
  State<_MiscChargesView> createState() => _MiscChargesViewState();
}

class _MiscChargesViewState extends State<_MiscChargesView> {
  List<MiscCharge> _charges = [];
  List<User> _students = [];
  bool _loading = true;
  String? _error;
  String _searchQuery = '';
  String _selectedPart = '1';
  String? _selectedDept;

  static const List<String> _departments = [
    'FSC Pre Med',
    'FSC Pre Eng',
    'ICS Phy',
    'ICS Stats',
    'FA',
    'FA IT',
  ];

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
      final results = await parallelFetch<dynamic>([
        () => api.listMiscCharges(branchId: auth.user!.branchId),
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
      ]);
      _charges = (results[0] as List<MiscCharge>?) ?? [];
      _students = (results[1] as List<User>?) ?? [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load charges';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<User> _studentsForDept(String dept, String part) {
    return _students.where((s) {
      final program = s.program ?? '';
      final matchesDept = program.toLowerCase().contains(dept.toLowerCase().replaceAll(' ', ''));
      final className = s.className ?? '';
      final matchesPart = className.toLowerCase().contains('part $part') ||
          (part == '1' && !className.toLowerCase().contains('part 2')) ||
          (part == '2' && className.toLowerCase().contains('part 2'));
      return matchesDept && matchesPart;
    }).toList();
  }

  List<User> get _searchedStudents {
    if (_searchQuery.isEmpty) return [];
    final q = _searchQuery.toLowerCase();
    return _students.where((s) {
      return s.name.toLowerCase().contains(q) ||
          (s.rollNo ?? '').toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _deleteCharge(MiscCharge c) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.lg)),
        title: const Text('Delete Charge?'),
        content: Text('This will remove the ${c.type} charge for ${c.studentName}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ApiClient().deleteMiscCharge(c.id);
      ApiClient().invalidate('misc-charges');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Charge deleted'), backgroundColor: AppColors.success),
        );
      }
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final total = _charges.fold(0.0, (a, c) => a + c.amount);

    return Column(
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v.trim()),
            decoration: InputDecoration(
              hintText: 'Search by student name or number…',
              prefixIcon: const Icon(Icons.search, size: 20),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () => setState(() => _searchQuery = ''),
                    )
                  : null,
              filled: true,
              fillColor: AppColors.card,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.md),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(AppRadii.md),
                borderSide: const BorderSide(color: AppColors.border),
              ),
            ),
          ),
        ),
        // Add Charge section
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _AddChargeCompact(onSaved: _load),
        ),
        const SizedBox(height: 12),
        // If searching, show filtered charges
        if (_searchQuery.isNotEmpty)
          Expanded(
            child: _searchedStudents.isEmpty
                ? const EmptyState(
                    icon: Icons.search_off,
                    title: 'No students found',
                    subtitle: 'Try a different name or number',
                  )
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: _searchedStudents.length,
                    itemBuilder: (_, i) {
                      final s = _searchedStudents[i];
                      final studentCharges = _charges.where((c) => c.studentId == s.id).toList();
                      if (studentCharges.isEmpty) {
                        return ListRow(
                          title: s.name,
                          subtitle: '${s.className ?? '—'} ${s.section ?? ''}',
                          leading: AppAvatar(initials: s.name, color: AppColors.textMuted, size: 40),
                          trailing: const Text('No charges', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                        );
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: studentCharges.map((c) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _buildChargeRow(c),
                        )).toList(),
                      );
                    },
                  ),
          )
        else ...[
          // Bulk charge card
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _BulkChargeCard(onApplied: _load),
          ),
          const SizedBox(height: 18),
          GradientSummary.pair(
            label1: 'Total Charges',
            value1: formatMoney(total),
            label2: 'Count',
            value2: '${_charges.length}',
            gradient: AppColors.primaryGradient,
          ),
          const SizedBox(height: 12),
          // Department hierarchy
          if (_selectedDept == null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: const Text(
                'Browse by Department',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  ..._departments.map((dept) {
                    final count = _studentsForDept(dept, _selectedPart).length;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _DeptCard(
                        name: dept,
                        studentCount: count,
                        onTap: () => setState(() => _selectedDept = dept),
                      ),
                    );
                  }),
                  if (_charges.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Text('All Charges', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                    const SizedBox(height: 8),
                    ..._charges.map((c) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _buildChargeRow(c),
                    )),
                  ],
                ],
              ),
            ),
          ] else ...[
            // Part 1/2 toggle + charges for this dept
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: '1', label: Text('Part 1')),
                        ButtonSegment(value: '2', label: Text('Part 2')),
                      ],
                      selected: {_selectedPart},
                      onSelectionChanged: (s) => setState(() => _selectedPart = s.first),
                      style: SegmentedButton.styleFrom(
                        selectedBackgroundColor: AppColors.primary,
                        selectedForegroundColor: Colors.white,
                        backgroundColor: AppColors.surfaceAlt,
                        foregroundColor: AppColors.textSecondary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => setState(() => _selectedDept = null),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Text(
                _selectedDept!,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                itemCount: _studentsForDept(_selectedDept!, _selectedPart).length,
                itemBuilder: (_, i) {
                  final s = _studentsForDept(_selectedDept!, _selectedPart)[i];
                  final studentCharges = _charges.where((c) => c.studentId == s.id).toList();
                  if (studentCharges.isEmpty) {
                    return ListRow(
                      title: s.name,
                      subtitle: '${s.className ?? '—'} ${s.section ?? ''}',
                      leading: AppAvatar(initials: s.name, color: AppColors.textMuted, size: 40),
                      trailing: const Text('No charges', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                    );
                  }
                  return Column(
                    children: studentCharges.map((c) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _buildChargeRow(c),
                    )).toList(),
                  );
                },
              ),
            ),
          ],
        ],
      ],
    );
  }

  Widget _buildChargeRow(MiscCharge c) {
    return ListRow(
      title: c.studentName,
      subtitle:
          '${c.type[0].toUpperCase()}${c.type.substring(1)}  •  ${c.description ?? '—'}',
      eyebrow: formatDate(c.createdAt),
      leading: AppAvatar(
          initials: c.studentName, color: AppColors.primary, size: 40),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            formatMoneyFull(c.amount),
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _deleteCharge(c),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.dangerSoft,
                borderRadius: BorderRadius.circular(AppRadii.sm),
              ),
              child: const Icon(Icons.delete_outline,
                  size: 18, color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
  }
}

// Compact add charge form at the top
class _AddChargeCompact extends StatefulWidget {
  final VoidCallback onSaved;
  const _AddChargeCompact({required this.onSaved});

  @override
  State<_AddChargeCompact> createState() => _AddChargeCompactState();
}

class _AddChargeCompactState extends State<_AddChargeCompact> {
  final _typeCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _studentIdCtrl = TextEditingController();
  final _studentNameCtrl = TextEditingController();
  bool _expanded = false;
  bool _busy = false;

  @override
  void dispose() {
    _typeCtrl.dispose();
    _amountCtrl.dispose();
    _studentIdCtrl.dispose();
    _studentNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_typeCtrl.text.trim().isEmpty || _amountCtrl.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createMiscCharge({
        'studentId': _studentIdCtrl.text.trim().isEmpty ? 'manual' : _studentIdCtrl.text.trim(),
        'studentName': _studentNameCtrl.text.trim().isEmpty ? 'Manual Entry' : _studentNameCtrl.text.trim(),
        'branchId': auth.user!.branchId,
        'instituteId': auth.user!.instituteId,
        'type': _typeCtrl.text.trim(),
        'amount': double.tryParse(_amountCtrl.text) ?? 0,
        'description': '',
        'createdBy': auth.user!.id,
      });
      ApiClient().invalidate('misc-charges');
      _typeCtrl.clear();
      _amountCtrl.clear();
      _studentIdCtrl.clear();
      _studentNameCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Charge added'), backgroundColor: AppColors.success),
        );
      }
      widget.onSaved();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.primarySoft.withOpacity(0.30),
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: AppColors.primary.withOpacity(0.20)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Row(
              children: [
                Container(
                  width: 32, height: 32,
                  decoration: BoxDecoration(
                    gradient: appGradient(AppColors.primaryGradient),
                    borderRadius: BorderRadius.circular(AppRadii.sm),
                  ),
                  child: const Icon(Icons.add, color: Colors.white, size: 18),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Add Charge',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                  ),
                ),
                Icon(_expanded ? Icons.expand_less : Icons.expand_more, color: AppColors.textSecondary),
              ],
            ),
          ),
          if (_expanded) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _typeCtrl,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Charge Type *',
                hintText: 'e.g. Exam Fee, Lab Fee',
                isDense: true,
                prefixIcon: Icon(Icons.category_outlined, size: 20),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Amount (PKR) *',
                isDense: true,
                prefixIcon: Icon(Icons.currency_rupee, size: 20),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _studentNameCtrl,
              decoration: const InputDecoration(
                labelText: 'Student Name (optional)',
                isDense: true,
                prefixIcon: Icon(Icons.person_outline, size: 20),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 44,
              child: Container(
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(AppRadii.md),
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    onTap: _busy ? null : _save,
                    child: Center(
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Add Charge', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// BULK CHARGE CARD — apply a misc charge to every student in a Part
// ════════════════════════════════════════════════════════════════
class _BulkChargeCard extends StatefulWidget {
  final VoidCallback onApplied;
  const _BulkChargeCard({required this.onApplied});

  @override
  State<_BulkChargeCard> createState() => _BulkChargeCardState();
}

class _BulkChargeCardState extends State<_BulkChargeCard> {
  String _part = '1';
  String _dept = 'All';
  final _type = TextEditingController();
  final _amount = TextEditingController();
  final _desc = TextEditingController();
  bool _busy = false;

  static const List<String> _departments = [
    'FSC Pre Med',
    'FSC Pre Eng',
    'ICS Phy',
    'ICS Stats',
    'FA',
    'FA IT',
  ];

  @override
  void dispose() {
    _type.dispose();
    _amount.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final t = _type.text.trim();
    if (t.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a charge type'), backgroundColor: AppColors.warning),
      );
      return;
    }
    final v = double.tryParse(_amount.text.trim());
    if (v == null || v <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid amount'), backgroundColor: AppColors.warning),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final auth = context.read<AuthProvider>();
      final res = await ApiClient().bulkAddMiscCharges({
        'part': _part,
        'program': _dept == 'All' ? null : _dept,
        'branchId': auth.user!.branchId,
        'type': t,
        'amount': v,
        'description': _desc.text.trim(),
      });
      ApiClient().invalidate('misc-charges');
      final createdNum = res['created'];
      final created = (createdNum is num)
          ? createdNum.toInt()
          : int.tryParse('${createdNum ?? 0}') ?? 0;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Applied "$t" of Rs ${v.toStringAsFixed(0)} to $created students (Part ${_part}).'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      _type.clear();
      _amount.clear();
      _desc.clear();
      widget.onApplied();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not apply: $e'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primarySoft.withOpacity(0.40),
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.primary.withOpacity(0.30)),
        boxShadow: AppShadows.floating,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Add Bulk Charge', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                    SizedBox(height: 2),
                    Text('Apply to every student in a Part, optionally by department.', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Text('Part  ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
              Expanded(
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: '1', label: Text('Part 1')),
                    ButtonSegment(value: '2', label: Text('Part 2')),
                  ],
                  selected: {_part},
                  onSelectionChanged: (s) => setState(() => _part = s.first),
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: AppColors.primary,
                    selectedForegroundColor: Colors.white,
                    backgroundColor: AppColors.surfaceAlt,
                    foregroundColor: AppColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _dept,
            decoration: const InputDecoration(
              labelText: 'Department (optional)',
              prefixIcon: Icon(Icons.school_outlined, size: 20),
            ),
            items: [
              const DropdownMenuItem(value: 'All', child: Text('All Departments')),
              ..._departments.map((d) => DropdownMenuItem(value: d, child: Text(d))),
            ],
            onChanged: (v) => setState(() => _dept = v ?? 'All'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _type,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Charge Type *',
              hintText: 'e.g. Exam Fee, Lab Fee, Fine',
              prefixIcon: Icon(Icons.category_outlined, size: 20),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Amount (PKR) *',
              prefixIcon: Icon(Icons.currency_rupee, size: 20),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _desc,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Description (optional)',
              hintText: 'e.g. Annual board registration — March 2025',
              prefixIcon: Icon(Icons.notes, size: 20),
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(AppRadii.sm),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, size: 14, color: AppColors.primaryDark),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Applies to every student in Part $_part${_dept != 'All' ? ' · $_dept' : ''}.',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.primaryDark, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: Container(
              decoration: BoxDecoration(
                gradient: appGradient(AppColors.primaryGradient),
                borderRadius: BorderRadius.circular(AppRadii.md),
                boxShadow: AppShadows.button,
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  onTap: _busy ? null : _apply,
                  child: Center(
                    child: _busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5))
                        : const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.bolt_rounded, color: Colors.white, size: 20),
                              SizedBox(width: 8),
                              Text('Apply to All Students', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                            ],
                          ),
                  ),
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
// CREATE STUDENT LOGINS
// ════════════════════════════════════════════════════════════════
class _LoginsView extends StatefulWidget {
  @override
  State<_LoginsView> createState() => _LoginsViewState();
}

class _LoginsViewState extends State<_LoginsView> {
  String _role = 'student';
  List<User> _teachers = [];
  List<User> _students = [];
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
      final results = await parallelFetch<List<User>>([
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
        () => api.listUsers(role: 'teacher', branchId: auth.user!.branchId),
      ]);
      _students = results[0] ?? [];
      _teachers = results[1] ?? [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load logins';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final users = _role == 'student' ? _students : _teachers;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: _SegmentedControl(
            left: 'Students',
            right: 'Teachers',
            isLeft: _role == 'student',
            onToggle: (isLeft) => setState(() => _role = isLeft ? 'student' : 'teacher'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: _GradientButton(
            label: 'Create ${_role == 'teacher' ? 'Teacher' : 'Student'} Login',
            icon: Icons.person_add_outlined,
            gradient: AppColors.purpleGradient,
            onPressed: () => _showCreate(context),
          ),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: _loading
              ? const LoadingList(count: 6)
              : _error != null
                  ? ErrorState(message: _error!, onRetry: _load)
                  : users.isEmpty
                      ? EmptyState(
                          icon: Icons.people_outline,
                          title: 'No ${_role}s yet',
                          subtitle: 'Create logins to grant access',
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                          itemCount: users.length,
                          itemBuilder: (_, i) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _LoginTile(user: users[i], onChanged: _load),
                          ),
                        ),
        ),
      ],
    );
  }

  void _showCreate(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (_) => _CreateLoginSheet(role: _role, onCreated: _load),
    );
  }
}

class _SegmentedControl extends StatelessWidget {
  final String left;
  final String right;
  final bool isLeft;
  final ValueChanged<bool> onToggle;
  const _SegmentedControl({
    required this.left,
    required this.right,
    required this.isLeft,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: _seg(left, Icons.school_outlined, isLeft, () => onToggle(true)),
          ),
          Expanded(
            child: _seg(right, Icons.person_outline, !isLeft, () => onToggle(false)),
          ),
        ],
      ),
    );
  }

  Widget _seg(String label, IconData icon, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          gradient: active ? appGradient(AppColors.primaryGradient) : null,
          color: active ? null : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadii.pill),
          boxShadow: active ? AppShadows.button : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: active ? Colors.white : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: active ? Colors.white : AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LoginTile extends StatefulWidget {
  final User user;
  final VoidCallback onChanged;
  const _LoginTile({required this.user, required this.onChanged});

  @override
  State<_LoginTile> createState() => _LoginTileState();
}

class _LoginTileState extends State<_LoginTile> {
  bool _revealing = false;
  String? _revealedPwd;
  User get user => widget.user;

  Color get _accent => user.role == 'teacher' ? AppColors.info : AppColors.primary;

  Future<void> _reveal() async {
    setState(() => _revealing = true);
    try {
      final pwd = await ApiClient().revealPassword(user.id);
      if (mounted) setState(() => _revealedPwd = pwd);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _revealing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListRow(
      title: user.name,
      subtitle: _revealedPwd != null ? 'Password: $_revealedPwd' : user.displayId,
      eyebrow: user.role == 'teacher' ? 'Teacher' : 'Student',
      leading: AppAvatar(initials: user.name, color: _accent, size: 40, useGradient: true),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: _revealing ? null : _reveal,
            child: Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: AppColors.infoSoft,
                borderRadius: BorderRadius.circular(AppRadii.sm),
              ),
              child: _revealing
                  ? const Padding(
                      padding: EdgeInsets.all(6),
                      child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.info)),
                    )
                  : Icon(
                      _revealedPwd != null ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      size: 18,
                      color: AppColors.info,
                    ),
            ),
          ),
          const SizedBox(width: 6),
          StatusChip(
            text: user.blocked == 1 ? 'Blocked' : 'Active',
            type: user.blocked == 1 ? StatusType.danger : StatusType.success,
            compact: true,
          ),
        ],
      ),
      onTap: () => _showManage(context),
    );
  }

  void _showManage(BuildContext context) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: AppColors.card,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  AppAvatar(initials: user.name, color: _accent, size: 50, useGradient: true),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                        const SizedBox(height: 2),
                        Text('${user.roleLabel}  •  ${user.displayId}', style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                  StatusChip(
                    text: user.blocked == 1 ? 'Blocked' : 'Active',
                    type: user.blocked == 1 ? StatusType.danger : StatusType.success,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              PremiumCard(
                padding: const EdgeInsets.all(14),
                child: Column(
                  children: [
                    _DetailRow('Email', user.email ?? '—'),
                    _DetailRow('Roll No', user.rollNo ?? '—'),
                    _DetailRow('Class', '${user.className ?? '—'} ${user.section ?? ''}'),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _SheetAction(
                icon: Icons.visibility_outlined,
                label: 'Reveal Password',
                color: AppColors.info,
                onTap: () async {
                  final messenger = ScaffoldMessenger.of(context);
                  Navigator.pop(context);
                  await _reveal();
                  if (!mounted) return;
                  if (_revealedPwd != null) {
                    messenger.showSnackBar(
                      SnackBar(
                        content: Text('Password: $_revealedPwd'),
                        backgroundColor: AppColors.info,
                        duration: const Duration(seconds: 6),
                      ),
                    );
                  }
                },
              ),
              const SizedBox(height: 8),
              _SheetAction(
                icon: user.blocked == 1 ? Icons.lock_open_outlined : Icons.lock_outline,
                label: user.blocked == 1 ? 'Unblock Login' : 'Block Login',
                color: AppColors.warning,
                onTap: () async {
                  Navigator.pop(context);
                  await _toggleBlock(context);
                },
              ),
              const SizedBox(height: 8),
              _SheetAction(
                icon: Icons.delete_outline,
                label: 'Delete Permanently',
                color: AppColors.danger,
                onTap: () async {
                  Navigator.pop(context);
                  await _confirmDelete(context);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _toggleBlock(BuildContext context) async {
    try {
      await ApiClient().blockUser(user.id, blocked: user.blocked == 0);
      ApiClient().invalidate('platform/users');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(user.blocked == 1 ? 'Login unblocked' : 'Login blocked'),
          backgroundColor: AppColors.success,
        ));
      }
      widget.onChanged();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadii.lg)),
        title: const Text('Delete Permanently'),
        content: Text('This will permanently delete ${user.name} and all their data. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Delete Forever'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ApiClient().deleteUser(user.id);
      ApiClient().invalidate('platform/users');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User deleted'), backgroundColor: AppColors.success));
      }
      widget.onChanged();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
  }
}

class _SheetAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _SheetAction({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceAlt,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.md),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.md),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 34, height: 34,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                ),
                child: Icon(icon, size: 18, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: AppColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreateLoginSheet extends StatefulWidget {
  final String role;
  final VoidCallback onCreated;
  const _CreateLoginSheet({required this.role, required this.onCreated});

  @override
  State<_CreateLoginSheet> createState() => _CreateLoginSheetState();
}

class _CreateLoginSheetState extends State<_CreateLoginSheet> {
  final _name = TextEditingController();
  final _id = TextEditingController();
  final _email = TextEditingController();
  final _pwd = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose(); _id.dispose(); _email.dispose(); _pwd.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_name.text.isEmpty || _id.text.isEmpty) return;
    setState(() => _busy = true);
    try {
      final auth = context.read<AuthProvider>();
      final pwd = _pwd.text.isEmpty ? 'student${DateTime.now().millisecond}' : _pwd.text;
      await ApiClient().createUser({
        'name': _name.text.trim(),
        'rollNo': widget.role == 'student' ? _id.text.trim() : null,
        'teacherId': widget.role == 'teacher' ? _id.text.trim() : null,
        'email': _email.text.trim().isEmpty ? null : _email.text.trim(),
        'password': pwd,
        'role': widget.role,
        'status': 'Active',
        'instituteId': auth.user!.instituteId,
        'branchId': auth.user!.branchId,
        'mustChangePassword': 1,
      });
      ApiClient().invalidate('platform/users');
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Login created — password: $pwd'),
            backgroundColor: AppColors.success,
            duration: const Duration(seconds: 6),
          ),
        );
      }
      widget.onCreated();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTeacher = widget.role == 'teacher';
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Create ${isTeacher ? 'Teacher' : 'Student'} Login',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 4),
          const Text(
            'Issue credentials — user must change password on first login',
            style: TextStyle(fontSize: 12.5, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Full Name *', prefixIcon: Icon(Icons.person_outline, size: 20)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _id,
            decoration: InputDecoration(
              labelText: isTeacher ? 'Teacher ID *' : 'Roll Number *',
              prefixIcon: const Icon(Icons.badge_outlined, size: 20),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            decoration: const InputDecoration(labelText: 'Email (optional)', prefixIcon: Icon(Icons.email_outlined, size: 20)),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pwd,
            decoration: const InputDecoration(
              labelText: 'Password (optional)',
              prefixIcon: Icon(Icons.lock_outline, size: 20),
              helperText: 'Auto-generated if blank',
            ),
          ),
          const SizedBox(height: 20),
          _GradientButton(
            label: _busy ? 'Generating…' : 'Generate Login',
            icon: Icons.bolt_outlined,
            gradient: AppColors.purpleGradient,
            onPressed: _busy ? null : _create,
            loading: _busy,
          ),
        ],
      ),
    );
  }
}
