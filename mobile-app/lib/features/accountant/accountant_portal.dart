// Accountant portal — Fee collection, invoices, misc charges, logins.
// Mirrors src/components/portal/accountant-portal.tsx from the web app.
//
// Premium redesign:
//   • GradientHero banner with wallet icon
//   • 2×2 StatCard grid + GradientSummary pair
//   • DonutChart for collection rate + MiniBarChart for revenue trend
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final role = context.read<AuthProvider>().user?.role;
      final isAdmin = role == 'admin' || role == 'super-admin';
      if (isAdmin && _tab == AccountantTab.dashboard) {
        setState(() => _tab = AccountantTab.fees);
      }
    });
  }

  void _switchTo(AccountantTab t) {
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
            SubTabItem(label: 'Fee & Installments', icon: Icons.receipt_long_outlined),
            SubTabItem(label: 'Misc Charges', icon: Icons.add_circle_outline),
            SubTabItem(label: 'Student Logins', icon: Icons.vpn_key_outlined),
          ],
          currentIndex: _tab.index,
          onTap: (i) => _switchTo(AccountantTab.values[i]),
        ),
        Expanded(child: _tabBody),
      ],
    );
  }

  Widget get _tabBody {
    switch (_tab) {
      case AccountantTab.dashboard:
        return const _AcDashboard();
      case AccountantTab.fees:
        return const _AcFees();
      case AccountantTab.misc:
        return const _AcMiscCharges();
      case AccountantTab.logins:
        return const _AcLogins();
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
  Map<String, dynamic>? _finance;
  List<FeeInvoice> _invoices = [];
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
        () => ApiClient().branchFinance(),
        () => ApiClient().listBranchInvoices(),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as DashboardStats?;
        _finance = results[1] as Map<String, dynamic>?;
        _invoices = (results[2] as List<FeeInvoice>?) ?? [];
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

    final pending = (_finance?['pendingFees'] as num?)?.toDouble() ??
        _stats?.pendingFees ??
        0;
    final collected = (_finance?['collectedThisMonth'] as num?)?.toDouble() ??
        _stats?.collectedThisMonth ??
        0;
    final totalRevenue = (_finance?['totalRevenue'] as num?)?.toDouble() ??
        _stats?.totalRevenue ??
        0;
    final collectionRate = totalRevenue > 0
        ? (collected / totalRevenue).clamp(0.0, 1.0)
        : 0.0;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          GradientHero(
            title: 'Finance Overview',
            subtitle: 'Track fee collection and manage charges.',
            icon: Icons.account_balance_wallet_outlined,
          ),
          const SizedBox(height: 16),
          _buildStatGrid(pending, collected),
          const SizedBox(height: 16),
          GradientSummary.pair(
            label1: 'Pending Fees',
            value1: formatMoney(pending),
            label2: 'Collected This Month',
            value2: formatMoney(collected),
          ),
          const SizedBox(height: 16),
          _buildCharts(collectionRate),
          const SizedBox(height: 20),
          _buildQuickActions(),
          const SizedBox(height: 20),
          _buildRecentInvoices(),
        ],
      ),
    );
  }

  Widget _buildStatGrid(double pending, double collected) {
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
          label: 'Total Revenue',
          value: formatMoney(s?.totalRevenue ?? 0),
          icon: Icons.trending_up_outlined,
          color: AppColors.success,
          compact: true,
        ),
        StatCard(
          label: 'Pending Fees',
          value: formatMoney(pending),
          icon: Icons.pending_outlined,
          color: AppColors.danger,
          compact: true,
        ),
        StatCard(
          label: 'Collected',
          value: formatMoney(collected),
          icon: Icons.check_circle_outline,
          color: AppColors.primary,
          compact: true,
        ),
        StatCard(
          label: 'Students',
          value: '${s?.totalStudents ?? 0}',
          icon: Icons.school_outlined,
          color: AppColors.info,
          compact: true,
        ),
      ],
    );
  }

  Widget _buildCharts(double collectionRate) {
    // Build revenue trend from invoice data
    final now = DateTime.now();
    final months = <String, double>{};
    for (int i = 5; i >= 0; i--) {
      final d = DateTime(now.year, now.month - i, 1);
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      months[key] = 0;
    }
    for (final inv in _invoices) {
      if (inv.isPaid && inv.paidAmount != null) {
        final key = '${inv.year}-${inv.month.toString().padLeft(2, '0')}';
        if (months.containsKey(key)) {
          months[key] = (months[key] ?? 0) + inv.paidAmount!;
        }
      }
    }
    final monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final bars = <BarData>[];
    for (final entry in months.entries) {
      final parts = entry.key.split('-');
      final m = int.tryParse(parts[1]) ?? 1;
      bars.add(BarData(
        label: monthNames[m - 1],
        value: entry.value,
      ));
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: ConcordiaCard(
            title: 'Collection Rate',
            child: DonutChart(
              percent: collectionRate,
              centerLabel: '${(collectionRate * 100).toStringAsFixed(0)}%',
              centerSub: 'Collected',
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ConcordiaCard(
            title: 'Revenue Trend',
            child: MiniBarChart(bars: bars, height: 180),
          ),
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
                icon: Icons.add_outlined,
                label: 'Add Installment',
                color: AppColors.primary,
                onTap: () => _showGenerateDialog(),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                icon: Icons.check_outlined,
                label: 'Check Installments',
                color: AppColors.success,
                onTap: () => _showGenerateDialog(),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showGenerateDialog() {
    final monthCtrl = TextEditingController();
    final yearCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Generate Monthly Invoices'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConcordiaInput(
              label: 'Month (1-12)',
              controller: monthCtrl,
              hintText: '${DateTime.now().month}',
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Year',
              controller: yearCtrl,
              hintText: '${DateTime.now().year}',
              keyboardType: TextInputType.number,
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
              final month = int.tryParse(monthCtrl.text) ?? DateTime.now().month;
              final year = int.tryParse(yearCtrl.text) ?? DateTime.now().year;
              Navigator.pop(ctx);
              try {
                await ApiClient().generateMonthlyInvoices(month: month, year: year);
                ApiClient().invalidate('fee-invoices');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Invoices generated successfully!'),
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
                      backgroundColor: AppColors.danger,
                    ),
                  );
                }
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildRecentInvoices() {
    final recent = _invoices.where((i) => !i.isPaid).take(5).toList();
    if (recent.isEmpty) {
      return const EmptyState(
        icon: Icons.check_circle_outline,
        title: 'All caught up!',
        subtitle: 'No pending invoices right now.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Pending Invoices'),
        ...recent.map((inv) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                title: inv.studentName,
                subtitle:
                    '${inv.className} • ${inv.monthYear} • ${formatMoney(inv.amount)}',
                initials: initialsOf(inv.studentName),
                trailing: StatusChip(
                  text: inv.status,
                  type: inv.isPaid ? StatusType.success : StatusType.warning,
                  compact: true,
                ),
              ),
            )),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════
// FEE & INSTALLMENTS
// ════════════════════════════════════════════════════════════════

class _AcFees extends StatefulWidget {
  const _AcFees();

  @override
  State<_AcFees> createState() => _AcFeesState();
}

class _AcFeesState extends State<_AcFees> {
  List<FeeInvoice> _invoices = [];
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
      final invoices = await ApiClient().listBranchInvoices();
      if (!mounted) return;
      setState(() {
        _invoices = invoices;
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

    final paid = _invoices.where((i) => i.isPaid).toList();
    final unpaid = _invoices.where((i) => !i.isPaid).toList();

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
                  label: 'Generate Invoices',
                  icon: Icons.add_outlined,
                  onPressed: () => _showGenerateDialog(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (unpaid.isNotEmpty) ...[
            const SectionHeader(title: 'Pending Invoices'),
            ...unpaid.map((inv) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _InvoiceCard(
                    invoice: inv,
                    onPay: () => _showPayDialog(inv),
                    onChallan: () => _showChallanDetail(inv),
                  ),
                )),
          ],
          if (paid.isNotEmpty) ...[
            const SectionHeader(title: 'Paid Invoices'),
            ...paid.map((inv) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _InvoiceCard(
                    invoice: inv,
                    onPay: null,
                    onChallan: () => _showChallanDetail(inv),
                  ),
                )),
          ],
          if (unpaid.isEmpty && paid.isEmpty)
            const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No Invoices',
              subtitle: 'Generate invoices to get started.',
            ),
        ],
      ),
    );
  }

  void _showGenerateDialog() {
    final monthCtrl = TextEditingController();
    final yearCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Generate Monthly Invoices'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConcordiaInput(
              label: 'Month (1-12)',
              controller: monthCtrl,
              hintText: '${DateTime.now().month}',
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Year',
              controller: yearCtrl,
              hintText: '${DateTime.now().year}',
              keyboardType: TextInputType.number,
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
              final month = int.tryParse(monthCtrl.text) ?? DateTime.now().month;
              final year = int.tryParse(yearCtrl.text) ?? DateTime.now().year;
              Navigator.pop(ctx);
              try {
                await ApiClient().generateMonthlyInvoices(month: month, year: year);
                ApiClient().invalidate('fee-invoices');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Invoices generated!'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _load();
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
                  );
                }
              }
            },
          ),
        ],
      ),
    );
  }

  void _showPayDialog(FeeInvoice inv) {
    final amountCtrl = TextEditingController(text: inv.amount.toStringAsFixed(0));
    String method = 'Cash';
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg),
          ),
          title: Text('Pay: ${inv.studentName}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Amount Due: ${formatMoney(inv.amount)}',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              ConcordiaInput(
                label: 'Paid Amount',
                controller: amountCtrl,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: method,
                decoration: InputDecoration(
                  labelText: 'Payment Method',
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: Color(0xFFFFE0CC)),
                  ),
                ),
                items: ['Cash', 'Bank Transfer', 'Cheque', 'Online']
                    .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                    .toList(),
                onChanged: (v) => setDialogState(() => method = v ?? 'Cash'),
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
              label: 'Record Payment',
              onPressed: () async {
                Navigator.pop(ctx);
                try {
                  await ApiClient().payInvoice(
                    inv.id,
                    paidAmount: double.tryParse(amountCtrl.text) ?? inv.amount,
                    paymentMethod: method,
                  );
                  ApiClient().invalidate('fee-invoices');
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Payment recorded!'),
                        backgroundColor: AppColors.success,
                      ),
                    );
                    _load();
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
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

  void _showChallanDetail(FeeInvoice inv) async {
    try {
      final challan = await ApiClient().getChallan(inv.id);
      if (!mounted) return;
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
              const Text(
                'Challan Details',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 16),
              _challanRow('Challan No', challan['challanNo']?.toString() ?? inv.challanNo ?? '—'),
              _challanRow('Student', inv.studentName),
              _challanRow('Class', inv.className),
              _challanRow('Month/Year', inv.monthYear),
              _challanRow('Amount', formatMoney(inv.amount)),
              _challanRow('Status', inv.status),
              if (inv.isPaid) ...[
                _challanRow('Paid Amount', formatMoney(inv.paidAmount ?? 0)),
                _challanRow('Payment Method', inv.paymentMethod ?? '—'),
                _challanRow('Paid Date', formatDate(inv.paidDate)),
              ],
              if (inv.dueDate != null) _challanRow('Due Date', formatDate(inv.dueDate)),
              const SizedBox(height: 20),
            ],
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
        );
      }
    }
  }

  Widget _challanRow(String label, String value) {
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
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Invoice card ────────────────────────────────────────────────

class _InvoiceCard extends StatelessWidget {
  final FeeInvoice invoice;
  final VoidCallback? onPay;
  final VoidCallback? onChallan;

  const _InvoiceCard({
    required this.invoice,
    this.onPay,
    this.onChallan,
  });

  @override
  Widget build(BuildContext context) {
    return ListRow(
      title: invoice.studentName,
      subtitle:
          '${invoice.className} • ${invoice.monthYear} • ${formatMoney(invoice.amount)}',
      initials: initialsOf(invoice.studentName),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onPay != null)
            GestureDetector(
              onTap: onPay,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.successSoft,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: const Text(
                  'Pay',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.success,
                  ),
                ),
              ),
            ),
          if (onPay != null) const SizedBox(width: 6),
          if (onChallan != null)
            GestureDetector(
              onTap: onChallan,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.infoSoft,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: const Text(
                  'Challan',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.info,
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
// MISC CHARGES
// ════════════════════════════════════════════════════════════════

class _AcMiscCharges extends StatefulWidget {
  const _AcMiscCharges();

  @override
  State<_AcMiscCharges> createState() => _AcMiscChargesState();
}

class _AcMiscChargesState extends State<_AcMiscCharges> {
  List<MiscCharge> _charges = [];
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
      final charges = await ApiClient().listMiscCharges();
      if (!mounted) return;
      setState(() {
        _charges = charges;
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
                  label: 'Add Charge',
                  icon: Icons.add_outlined,
                  onPressed: () => _showCreateDialog(),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ConcordiaButton(
                  label: 'Bulk Add',
                  icon: Icons.group_add_outlined,
                  variant: ConcordiaButtonVariant.outline,
                  onPressed: () => _showBulkDialog(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_charges.isEmpty)
            const EmptyState(
              icon: Icons.add_circle_outline,
              title: 'No Misc Charges',
              subtitle: 'Add a charge to get started.',
            )
          else
            ..._charges.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: c.type,
                    subtitle:
                        '${c.studentName} • ${formatMoney(c.amount)}${c.description != null ? ' • ${c.description}' : ''}',
                    initials: initialsOf(c.studentName),
                    trailing: GestureDetector(
                      onTap: () => _confirmDelete(c),
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
        ],
      ),
    );
  }

  void _showCreateDialog() {
    final studentCtrl = TextEditingController();
    final typeCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Add Misc Charge'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ConcordiaInput(
              label: 'Student ID',
              controller: studentCtrl,
              hintText: 'Enter student ID',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Charge Type',
              controller: typeCtrl,
              hintText: 'e.g. Transport, Lab Fee',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Amount (Rs)',
              controller: amountCtrl,
              hintText: '0',
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Description',
              controller: descCtrl,
              hintText: 'Optional details',
              maxLines: 2,
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
            label: 'Add',
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ApiClient().createMiscCharge({
                  'studentId': studentCtrl.text.trim(),
                  'type': typeCtrl.text.trim(),
                  'amount': double.tryParse(amountCtrl.text.trim()) ?? 0,
                  'description': descCtrl.text.trim(),
                });
                ApiClient().invalidate('misc-charges');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Charge added!'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _load();
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
                  );
                }
              }
            },
          ),
        ],
      ),
    );
  }

  void _showBulkDialog() {
    final typeCtrl = TextEditingController();
    final amountCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Bulk Add Misc Charge'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'This will add the charge to all students in your branch.',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Charge Type',
              controller: typeCtrl,
              hintText: 'e.g. Transport, Lab Fee',
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Amount (Rs)',
              controller: amountCtrl,
              hintText: '0',
              keyboardType: TextInputType.number,
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Description',
              controller: descCtrl,
              hintText: 'Optional details',
              maxLines: 2,
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
            label: 'Bulk Add',
            onPressed: () async {
              Navigator.pop(ctx);
              try {
                await ApiClient().bulkAddMiscCharges({
                  'type': typeCtrl.text.trim(),
                  'amount': double.tryParse(amountCtrl.text.trim()) ?? 0,
                  'description': descCtrl.text.trim(),
                });
                ApiClient().invalidate('misc-charges');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Bulk charges added!'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _load();
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
                  );
                }
              }
            },
          ),
        ],
      ),
    );
  }

  void _confirmDelete(MiscCharge c) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: const Text('Delete Charge?'),
        content: Text(
          'Delete ${c.type} charge of ${formatMoney(c.amount)} for ${c.studentName}?',
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
                await ApiClient().deleteMiscCharge(c.id);
                ApiClient().invalidate('misc-charges');
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Charge deleted!'),
                      backgroundColor: AppColors.success,
                    ),
                  );
                  _load();
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
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
// CREATE STUDENT LOGINS
// ════════════════════════════════════════════════════════════════

class _AcLogins extends StatefulWidget {
  const _AcLogins();

  @override
  State<_AcLogins> createState() => _AcLoginsState();
}

class _AcLoginsState extends State<_AcLogins> {
  List<User> _students = [];
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
      final students = await ApiClient().listUsers(role: 'student');
      if (!mounted) return;
      setState(() {
        _students = students;
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

    final noLogin = _students.where((s) => s.mustChangePassword == 1).toList();
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (noLogin.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.warningSoft,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  border: Border.all(
                    color: AppColors.warning.withOpacity(0.3),
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, size: 18, color: AppColors.warning),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${noLogin.length} student(s) need to change their password on first login.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_students.isEmpty)
            const EmptyState(
              icon: Icons.vpn_key_outlined,
              title: 'No Students',
              subtitle: 'Create student logins after enrollment.',
            )
          else
            ..._students.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: s.name,
                    subtitle:
                        '${s.rollNo ?? s.displayId} • ${s.className ?? '—'}',
                    initials: initialsOf(s.name),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        StatusChip(
                          text: s.mustChangePassword == 1
                              ? 'Must Change'
                              : 'Active',
                          type: s.mustChangePassword == 1
                              ? StatusType.warning
                              : StatusType.success,
                          compact: true,
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => _revealPassword(s),
                          child: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: AppColors.primarySoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.visibility_outlined,
                                size: 16, color: AppColors.primary),
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

  void _revealPassword(User s) async {
    try {
      final password = await ApiClient().revealPassword(s.id);
      if (!mounted) return;
      showModalBottomSheet(
        context: context,
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
              const Text(
                'Student Login Credentials',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 16),
              _credentialRow('Name', s.name),
              _credentialRow('Roll No / ID', s.displayId),
              _credentialRow('Email', s.email ?? '—'),
              _credentialRow('Password', password),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.warningSoft,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                ),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber, size: 18, color: AppColors.warning),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Share these credentials securely. The student should change their password after first login.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.danger),
        );
      }
    }
  }

  Widget _credentialRow(String label, String value) {
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
              overflow: TextOverflow.ellipsis,
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
