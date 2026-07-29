// Accountant portal — Fee collection, invoices, students, misc charges, logins.
// Mirrors src/components/portal/accountant-portal.tsx from the web app.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
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

  void _switchTo(AccountantTab t) => setState(() => _tab = t);

  @override
  Widget build(BuildContext context) {
    // Listen to bottom-nav driven tab changes via a ValueNotifier pattern.
    // Since RoleShell uses IndexedStack-like rebuilds, we read the initial tab.
    return _buildTab();
  }

  Widget _buildTab() {
    switch (_tab) {
      case AccountantTab.dashboard:
        return _Dashboard(onNavigate: _switchTo);
      case AccountantTab.students:
        return _StudentsView();
      case AccountantTab.fees:
        return _FeeInstallmentsView();
      case AccountantTab.misc:
        return _MiscChargesView();
      case AccountantTab.logins:
        return _LoginsView();
    }
  }
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
      _error = 'Failed to load dashboard';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final s = _stats ?? DashboardStats();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Greeting
          Text(
            'Welcome back 👋',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 4),
          Text(
            'Here\'s what\'s happening with fees today.',
            style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
          ),

          const SectionHeader(title: 'Overview'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.1,
            children: [
              StatCard(label: 'Total Students', value: '${s.totalStudents}', icon: Icons.people, color: AppColors.primary),
              StatCard(label: 'Collected (Month)', value: formatMoney(s.collectedThisMonth), icon: Icons.account_balance_wallet, color: AppColors.success),
              StatCard(label: 'Pending Fees', value: formatMoney(s.pendingFees), icon: Icons.pending_actions, color: AppColors.warning),
              StatCard(label: 'Classes', value: '${s.totalClasses}', icon: Icons.class_, color: AppColors.info),
            ],
          ),

          const SectionHeader(title: 'Quick Actions'),
          _ActionTile(
            icon: Icons.receipt_long, label: 'Collect Fee', subtitle: 'Mark invoices as paid',
            onTap: () => widget.onNavigate(AccountantTab.fees),
          ),
          _ActionTile(
            icon: Icons.person_add, label: 'Create Login', subtitle: 'Issue student/teacher credentials',
            onTap: () => widget.onNavigate(AccountantTab.logins),
          ),
          _ActionTile(
            icon: Icons.add_circle, label: 'Add Misc Charge', subtitle: 'Exam trip, custom charge',
            onTap: () => widget.onNavigate(AccountantTab.misc),
          ),
          _ActionTile(
            icon: Icons.people, label: 'View Students', subtitle: 'Class-wise student list',
            onTap: () => widget.onNavigate(AccountantTab.students),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;
  const _ActionTile({required this.icon, required this.label, required this.subtitle, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Icon(icon, size: 22, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                      Text(subtitle, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: AppColors.textMuted, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// STUDENTS (class-wise)
// ════════════════════════════════════════════════════════════════
class _StudentsView extends StatefulWidget {
  @override
  State<_StudentsView> createState() => _StudentsViewState();
}

class _StudentsViewState extends State<_StudentsView> {
  List<User> _students = [];
  bool _loading = true;
  String? _error;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final auth = context.read<AuthProvider>();
      _students = await ApiClient().listUsers(role: 'student', branchId: auth.user!.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load students';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final filtered = _students.where((s) {
      if (_query.isEmpty) return true;
      final q = _query.toLowerCase();
      return s.name.toLowerCase().contains(q) ||
          (s.rollNo ?? '').toLowerCase().contains(q) ||
          (s.className ?? '').toLowerCase().contains(q);
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            decoration: const InputDecoration(
              hintText: 'Search by name, roll #, class…',
              prefixIcon: Icon(Icons.search, size: 20),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const EmptyState(icon: Icons.people_outline, title: 'No students found')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _StudentTile(student: filtered[i]),
                ),
        ),
      ],
    );
  }
}

class _StudentTile extends StatelessWidget {
  final User student;
  const _StudentTile({required this.student});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _showDetail(context),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: AppColors.primary.withOpacity(0.1),
                  child: Text(
                    student.name.isNotEmpty ? student.name[0].toUpperCase() : '?',
                    style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(student.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                      const SizedBox(height: 2),
                      Text(
                        '${student.rollNo ?? '—'} · ${student.className ?? 'No class'} ${student.section ?? ''}',
                        style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                if (student.baseFee != null)
                  Text(formatMoney(student.baseFee!), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showDetail(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(student.name, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
            const SizedBox(height: 4),
            Text(student.roleLabel, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
            const SizedBox(height: 20),
            _DetailRow('Roll No', student.rollNo ?? '—'),
            _DetailRow('Class', '${student.className ?? '—'} ${student.section ?? ''}'),
            _DetailRow('Email', student.email ?? '—'),
            _DetailRow('Father', student.fatherName ?? '—'),
            _DetailRow('Guardian Phone', student.guardianPhone ?? '—'),
            _DetailRow('Base Fee', student.baseFee != null ? formatMoneyFull(student.baseFee!) : '—'),
            _DetailRow('Status', student.isActive ? 'Active' : 'Blocked'),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          ),
          Expanded(child: Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// FEE & INSTALLMENTS
// ════════════════════════════════════════════════════════════════
class _FeeInstallmentsView extends StatefulWidget {
  @override
  State<_FeeInstallmentsView> createState() => _FeeInstallmentsViewState();
}

class _FeeInstallmentsViewState extends State<_FeeInstallmentsView> {
  List<FeeInvoice> _invoices = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all'; // all | unpaid | paid

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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final filtered = _invoices.where((i) {
      if (_filter == 'unpaid') return !i.isPaid;
      if (_filter == 'paid') return i.isPaid;
      return true;
    }).toList();

    final totalPending = _invoices.where((i) => !i.isPaid).fold(0.0, (a, i) => a + i.amount);
    final totalCollected = _invoices.where((i) => i.isPaid).fold(0.0, (a, i) => a + (i.paidAmount ?? 0));

    return Column(
      children: [
        // Summary
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.primary, AppColors.primaryDark],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pending', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.85))),
                    Text(formatMoney(totalPending), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
                  ],
                ),
              ),
              Container(width: 1, height: 36, color: Colors.white.withOpacity(0.3)),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Collected', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.85))),
                    Text(formatMoney(totalCollected), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
                  ],
                ),
              ),
            ],
          ),
        ),
        // Filter chips
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _FilterChip(label: 'All', value: 'all', current: _filter, onChanged: (v) => setState(() => _filter = v)),
              const SizedBox(width: 8),
              _FilterChip(label: 'Unpaid', value: 'unpaid', current: _filter, onChanged: (v) => setState(() => _filter = v)),
              const SizedBox(width: 8),
              _FilterChip(label: 'Paid', value: 'paid', current: _filter, onChanged: (v) => setState(() => _filter = v)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: filtered.isEmpty
              ? const EmptyState(icon: Icons.receipt_long_outlined, title: 'No invoices', subtitle: 'Generate monthly invoices to get started')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _InvoiceTile(invoice: filtered[i], onPaid: _load),
                ),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final String value;
  final String current;
  final ValueChanged<String> onChanged;
  const _FilterChip({required this.label, required this.value, required this.current, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final active = current == value;
    return GestureDetector(
      onTap: () => onChanged(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : AppColors.card,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? AppColors.primary : AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: active ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  final FeeInvoice invoice;
  final VoidCallback onPaid;
  const _InvoiceTile({required this.invoice, required this.onPaid});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _showActions(context),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: (invoice.isPaid ? AppColors.success : AppColors.warning).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    invoice.isPaid ? Icons.check_circle : Icons.pending,
                    size: 20,
                    color: invoice.isPaid ? AppColors.success : AppColors.warning,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(invoice.studentName, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                      Text(
                        '${invoice.className} · ${invoice.monthYear}',
                        style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(formatMoneyFull(invoice.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    const SizedBox(height: 4),
                    StatusChip(
                      text: invoice.isPaid ? 'Paid' : 'Unpaid',
                      type: invoice.isPaid ? StatusType.success : StatusType.warning,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showActions(BuildContext context) {
    if (invoice.isPaid) {
      showModalBottomSheet(
        context: context,
        showDragHandle: true,
        builder: (_) => Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(invoice.studentName, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
              const SizedBox(height: 12),
              _DetailRow('Invoice #', invoice.challanNo ?? invoice.id),
              _DetailRow('Month', invoice.monthYear),
              _DetailRow('Amount', formatMoneyFull(invoice.amount)),
              _DetailRow('Paid', formatMoneyFull(invoice.paidAmount ?? 0)),
              _DetailRow('Method', invoice.paymentMethod ?? '—'),
              _DetailRow('Paid Date', invoice.paidDate ?? '—'),
            ],
          ),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Collect Payment', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
            const SizedBox(height: 4),
            Text(invoice.studentName, style: TextStyle(fontSize: 14, color: AppColors.textSecondary)),
            const SizedBox(height: 16),
            Text('Amount Due', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            Text(formatMoneyFull(invoice.amount), style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.primary)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () async {
                Navigator.pop(context);
                await _pay(context, 'Cash');
              },
              icon: const Icon(Icons.payments),
              label: const Text('Mark Paid — Cash'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () async {
                Navigator.pop(context);
                await _pay(context, 'Online');
              },
              icon: const Icon(Icons.account_balance),
              label: const Text('Mark Paid — Online'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pay(BuildContext context, String method) async {
    try {
      await ApiClient().payInvoice(invoice.id, paidAmount: invoice.amount, paymentMethod: method);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Payment recorded — ${formatMoneyFull(invoice.amount)}'), backgroundColor: AppColors.success),
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

// ════════════════════════════════════════════════════════════════
// MISC CHARGES
// ════════════════════════════════════════════════════════════════
class _MiscChargesView extends StatefulWidget {
  @override
  State<_MiscChargesView> createState() => _MiscChargesViewState();
}

class _MiscChargesViewState extends State<_MiscChargesView> {
  List<MiscCharge> _charges = [];
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
      _charges = await ApiClient().listMiscCharges(branchId: auth.user!.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load charges';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton.icon(
            onPressed: () => _showAdd(context),
            icon: const Icon(Icons.add),
            label: const Text('Add Charge'),
          ),
        ),
        Expanded(
          child: _charges.isEmpty
              ? const EmptyState(icon: Icons.add_circle_outline, title: 'No charges yet', subtitle: 'Add exam, trip, or custom charges')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _charges.length,
                  itemBuilder: (_, i) {
                    final c = _charges[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(
                              color: AppColors.info.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.receipt, size: 20, color: AppColors.info),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(c.studentName, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                                Text('${c.type} · ${c.description ?? '—'}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              ],
                            ),
                          ),
                          Text(formatMoneyFull(c.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primary)),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  void _showAdd(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AddChargeSheet(onSaved: _load),
    );
  }
}

class _AddChargeSheet extends StatefulWidget {
  final VoidCallback onSaved;
  const _AddChargeSheet({required this.onSaved});

  @override
  State<_AddChargeSheet> createState() => _AddChargeSheetState();
}

class _AddChargeSheetState extends State<_AddChargeSheet> {
  final _studentId = TextEditingController();
  final _studentName = TextEditingController();
  final _amount = TextEditingController();
  final _desc = TextEditingController();
  String _type = 'custom';
  bool _busy = false;

  @override
  void dispose() {
    _studentId.dispose();
    _studentName.dispose();
    _amount.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_studentId.text.isEmpty || _amount.text.isEmpty) return;
    setState(() => _busy = true);
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createMiscCharge({
        'studentId': _studentId.text.trim(),
        'studentName': _studentName.text.trim(),
        'branchId': auth.user!.branchId,
        'instituteId': auth.user!.instituteId,
        'type': _type,
        'amount': double.tryParse(_amount.text) ?? 0,
        'description': _desc.text.trim(),
        'createdBy': auth.user!.id,
      });
      if (mounted) {
        Navigator.pop(context);
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
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add Charge', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          const SizedBox(height: 16),
          TextField(controller: _studentId, decoration: const InputDecoration(labelText: 'Student ID', prefixIcon: Icon(Icons.badge_outlined, size: 20))),
          const SizedBox(height: 12),
          TextField(controller: _studentName, decoration: const InputDecoration(labelText: 'Student Name', prefixIcon: Icon(Icons.person_outline, size: 20))),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _type,
            decoration: const InputDecoration(labelText: 'Type', prefixIcon: Icon(Icons.category_outlined, size: 20)),
            items: const [
              DropdownMenuItem(value: 'admission', child: Text('Admission')),
              DropdownMenuItem(value: 'exam', child: Text('Exam Fee')),
              DropdownMenuItem(value: 'trip', child: Text('Trip')),
              DropdownMenuItem(value: 'custom', child: Text('Custom')),
            ],
            onChanged: (v) => setState(() => _type = v ?? 'custom'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Amount (Rs)', prefixIcon: Icon(Icons.currency_rupee, size: 20)),
          ),
          const SizedBox(height: 12),
          TextField(controller: _desc, decoration: const InputDecoration(labelText: 'Description (optional)'), maxLines: 2),
          const SizedBox(height: 20),
          ElevatedButton(onPressed: _busy ? null : _save, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Text('Save Charge')),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// CREATE LOGINS
// ════════════════════════════════════════════════════════════════
class _LoginsView extends StatefulWidget {
  @override
  State<_LoginsView> createState() => _LoginsViewState();
}

class _LoginsViewState extends State<_LoginsView> with SingleTickerProviderStateMixin {
  late TabController _tc;
  List<User> _teachers = [];
  List<User> _students = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tc = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tc.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      _teachers = await api.listUsers(role: 'teacher', branchId: auth.user!.branchId);
      _students = await api.listUsers(role: 'student', branchId: auth.user!.branchId);
    } catch (_) {}
    finally { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TabBar(
          controller: _tc,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(icon: Icon(Icons.school_outlined, size: 18), text: 'Students'),
            Tab(icon: Icon(Icons.person_outline, size: 18), text: 'Teachers'),
          ],
        ),
        Expanded(
          child: _loading
              ? const LoadingList()
              : TabBarView(
                  controller: _tc,
                  children: [
                    _LoginsList(users: _students, role: 'student', onChanged: _load),
                    _LoginsList(users: _teachers, role: 'teacher', onChanged: _load),
                  ],
                ),
        ),
      ],
    );
  }
}

class _LoginsList extends StatelessWidget {
  final List<User> users;
  final String role;
  final VoidCallback onChanged;
  const _LoginsList({required this.users, required this.role, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton.icon(
            onPressed: () => _showCreate(context),
            icon: const Icon(Icons.person_add),
            label: Text('Create ${role == 'teacher' ? 'Teacher' : 'Student'} Login'),
          ),
        ),
        Expanded(
          child: users.isEmpty
              ? const EmptyState(icon: Icons.people_outline, title: 'No logins yet')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: users.length,
                  itemBuilder: (_, i) => _LoginTile(user: users[i], onChanged: onChanged),
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
      builder: (_) => _CreateLoginSheet(role: role, onCreated: onChanged),
    );
  }
}

class _LoginTile extends StatelessWidget {
  final User user;
  final VoidCallback onChanged;
  const _LoginTile({required this.user, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _showManage(context),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: AppColors.primary.withOpacity(0.1),
                  child: Text(user.name.isNotEmpty ? user.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                      Text(user.displayId, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                StatusChip(
                  text: user.blocked == 1 ? 'Blocked' : 'Active',
                  type: user.blocked == 1 ? StatusType.danger : StatusType.success,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showManage(BuildContext context) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(user.name, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
              const SizedBox(height: 4),
              Text('${user.roleLabel} · ${user.displayId}', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
              const SizedBox(height: 20),
              ListTile(
                leading: Icon(user.blocked == 1 ? Icons.lock_open : Icons.lock_outline, color: AppColors.warning),
                title: Text(user.blocked == 1 ? 'Unblock Login' : 'Block Login'),
                onTap: () async {
                  Navigator.pop(context);
                  await _toggleBlock(context);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: AppColors.danger),
                title: const Text('Delete Permanently'),
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
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(user.blocked == 1 ? 'Login unblocked' : 'Login blocked'),
          backgroundColor: AppColors.success,
        ));
      }
      onChanged();
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
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User deleted'), backgroundColor: AppColors.success));
      }
      onChanged();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
      }
    }
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
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Login created — password: $pwd'), backgroundColor: AppColors.success, duration: const Duration(seconds: 6)),
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
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Create ${isTeacher ? 'Teacher' : 'Student'} Login', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
          const SizedBox(height: 16),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Full Name *', prefixIcon: Icon(Icons.person_outline, size: 20))),
          const SizedBox(height: 12),
          TextField(
            controller: _id,
            decoration: InputDecoration(
              labelText: isTeacher ? 'Teacher ID *' : 'Roll Number *',
              prefixIcon: const Icon(Icons.badge_outlined, size: 20),
            ),
          ),
          const SizedBox(height: 12),
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email (optional)', prefixIcon: Icon(Icons.email_outlined, size: 20))),
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
          ElevatedButton(onPressed: _busy ? null : _create, child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Text('Generate Login')),
        ],
      ),
    );
  }
}
