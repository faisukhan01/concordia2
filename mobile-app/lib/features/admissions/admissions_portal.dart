// Admissions Office portal — new enrollment, student records, fee records.
// Mirrors src/components/portal/admissions-portal.tsx.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import '../shared/nav_items.dart';

class AdmissionsPortal extends StatefulWidget {
  final AdmissionsTab initialTab;
  const AdmissionsPortal({super.key, this.initialTab = AdmissionsTab.dashboard});

  @override
  State<AdmissionsPortal> createState() => _AdmissionsPortalState();
}

class _AdmissionsPortalState extends State<AdmissionsPortal> {
  @override
  Widget build(BuildContext context) {
    switch (widget.initialTab) {
      case AdmissionsTab.dashboard:
        return const _AdDashboard();
      case AdmissionsTab.newEnrollment:
        return const _AdEnroll();
      case AdmissionsTab.records:
        return const _AdRecords();
      case AdmissionsTab.feeRecords:
        return const _AdFees();
    }
  }
}

class _AdDashboard extends StatefulWidget {
  const _AdDashboard();

  @override
  State<_AdDashboard> createState() => _AdDashboardState();
}

class _AdDashboardState extends State<_AdDashboard> {
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
                Text('Admission Office', style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.85))),
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
              StatCard(label: 'Total Students', value: '${s.totalStudents}', icon: Icons.people, color: AppColors.primary),
              StatCard(label: 'Classes', value: '${s.totalClasses}', icon: Icons.class_, color: AppColors.info),
              StatCard(label: 'Pending Fees', value: formatMoney(s.pendingFees), icon: Icons.pending_actions, color: AppColors.warning),
              StatCard(label: 'Collected', value: formatMoney(s.collectedThisMonth), icon: Icons.account_balance_wallet, color: AppColors.success),
            ],
          ),
        ],
      ),
    );
  }
}

class _AdEnroll extends StatefulWidget {
  const _AdEnroll();

  @override
  State<_AdEnroll> createState() => _AdEnrollState();
}

class _AdEnrollState extends State<_AdEnroll> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _father = TextEditingController();
  final _dob = TextEditingController();
  final _cnic = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _prevResult = TextEditingController();
  String _class = '';
  String _section = 'A';
  double _baseFee = 0;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose(); _father.dispose(); _dob.dispose(); _cnic.dispose(); _phone.dispose(); _address.dispose(); _prevResult.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final auth = context.read<AuthProvider>();
      await ApiClient().createUser({
        'name': _name.text.trim(),
        'fatherName': _father.text.trim(),
        'dob': _dob.text.trim(),
        'cnic': _cnic.text.trim(),
        'guardianPhone': _phone.text.trim(),
        'address': _address.text.trim(),
        'prevResult': _prevResult.text.trim(),
        'class': _class,
        'section': _section,
        'baseFee': _baseFee,
        'baseFeeLocked': 1,
        'role': 'student',
        'status': 'Active',
        'instituteId': auth.user!.instituteId,
        'branchId': auth.user!.branchId,
        'createdById': auth.user!.id,
        'mustChangePassword': 1,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Student enrolled successfully'), backgroundColor: AppColors.success));
        _formKey.currentState!.reset();
        _name.clear(); _father.clear(); _dob.clear(); _cnic.clear(); _phone.clear(); _address.clear(); _prevResult.clear();
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('New Student Enrollment', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          Text('Fill in the student\'s details to enroll them.', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
          const SizedBox(height: 20),

          // Student info
          Text('Student Information', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primary)),
          const SizedBox(height: 10),
          TextFormField(controller: _name, decoration: const InputDecoration(labelText: 'Full Name *', prefixIcon: Icon(Icons.person_outline)), validator: (v) => v!.isEmpty ? 'Required' : null),
          const SizedBox(height: 12),
          TextFormField(controller: _father, decoration: const InputDecoration(labelText: 'Father\'s Name', prefixIcon: Icon(Icons.family_restroom))),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: TextFormField(controller: _dob, decoration: const InputDecoration(labelText: 'Date of Birth', hintText: 'YYYY-MM-DD', prefixIcon: Icon(Icons.cake_outlined)))),
              const SizedBox(width: 8),
              Expanded(child: TextFormField(controller: _cnic, decoration: const InputDecoration(labelText: 'B-Form / CNIC', prefixIcon: Icon(Icons.badge_outlined)))),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Guardian Phone', prefixIcon: Icon(Icons.phone_outlined))),
          const SizedBox(height: 12),
          TextFormField(controller: _address, decoration: const InputDecoration(labelText: 'Address', prefixIcon: Icon(Icons.location_on_outlined)), maxLines: 2),
          const SizedBox(height: 12),
          TextFormField(controller: _prevResult, decoration: const InputDecoration(labelText: 'Previous Result / School', prefixIcon: Icon(Icons.history_edu))),

          const SizedBox(height: 20),
          Text('Academic Placement', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.primary)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: TextFormField(
                decoration: const InputDecoration(labelText: 'Class *'),
                onChanged: (v) => _class = v,
                validator: (v) => v!.isEmpty ? 'Required' : null,
              )),
              const SizedBox(width: 8),
              Expanded(child: DropdownButtonFormField<String>(
                value: _section,
                decoration: const InputDecoration(labelText: 'Section'),
                items: ['A', 'B', 'C', 'D'].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                onChanged: (v) => setState(() => _section = v ?? 'A'),
              )),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Base Fee (Rs) *', prefixIcon: Icon(Icons.currency_rupee)),
            onChanged: (v) => _baseFee = double.tryParse(v) ?? 0,
          ),

          const SizedBox(height: 24),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5)) : const Text('Enroll Student'),
            ),
          ),
        ],
      ),
    );
  }
}

class _AdRecords extends StatefulWidget {
  const _AdRecords();

  @override
  State<_AdRecords> createState() => _AdRecordsState();
}

class _AdRecordsState extends State<_AdRecords> {
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
      _error = 'Failed to load';
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
      return s.name.toLowerCase().contains(q) || (s.rollNo ?? '').toLowerCase().contains(q) || (s.className ?? '').toLowerCase().contains(q);
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            decoration: const InputDecoration(hintText: 'Search students…', prefixIcon: Icon(Icons.search), isDense: true),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const EmptyState(icon: Icons.people_outline, title: 'No students enrolled')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) {
                    final s = filtered[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                      child: Row(
                        children: [
                          CircleAvatar(radius: 20, backgroundColor: AppColors.primary.withOpacity(0.1), child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?', style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700))),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(s.name, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                                Text('${s.rollNo ?? '—'} · ${s.className ?? '—'} ${s.section ?? ''}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              ],
                            ),
                          ),
                          if (s.baseFee != null) Text(formatMoney(s.baseFee!), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary)),
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

class _AdFees extends StatefulWidget {
  const _AdFees();

  @override
  State<_AdFees> createState() => _AdFeesState();
}

class _AdFeesState extends State<_AdFees> {
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
      _students = await ApiClient().listUsers(role: 'student', branchId: auth.user!.branchId);
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
      child: _students.isEmpty
          ? const EmptyState(icon: Icons.account_balance_wallet_outlined, title: 'No fee records')
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _students.length,
              itemBuilder: (_, i) {
                final s = _students[i];
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                            Text('${s.rollNo ?? '—'} · ${s.className ?? '—'}', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('Base Fee', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                          Text(formatMoneyFull(s.baseFee ?? 0), style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary)),
                          if (s.baseFeeLocked == 1) const StatusChip(text: 'Locked', type: StatusType.info),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
