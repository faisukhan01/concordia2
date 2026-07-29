// Admissions Office portal — premium redesign with parallel fetching.
// Tabs: dashboard, new enrollment, student records, fee records.
// Mirrors src/components/portal/admissions-portal.tsx.
//
// Design language:
//   • GradientHero welcome banner with info-blue gradient
//   • 2×2 StatCard grid (real branch stats from /scoped/stats)
//   • MiniBarChart of last 6 months of enrollments (derived from roster)
//   • PremiumCard sectioned enrollment form with success dialog
//   • ListRow student roster with avatar + status chip + detail sheet
//   • ListRow invoice ledger with challan bottom sheet
//
// Performance:
//   • Dashboard uses parallelFetch for scopedStats + listUsers (60s cache)
//   • After create-user, invalidate('platform/users') + invalidate('scoped')
//     so sibling tabs and the dashboard refresh instantly.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_cache.dart' show parallelFetch;
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

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

class _AdDashboard extends StatefulWidget {
  const _AdDashboard();

  @override
  State<_AdDashboard> createState() => _AdDashboardState();
}

class _AdDashboardState extends State<_AdDashboard> {
  DashboardStats? _stats;
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
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      // Parallel fetch: scoped stats + student roster (used for the monthly
      // enrollment chart and the "new this month" stat). ApiClient's 60s
      // in-memory cache makes warm navigation instant.
      final results = await parallelFetch<dynamic>([
        () => api.scopedStats(branchId: auth.user!.branchId),
        () => api.listUsers(role: 'student', branchId: auth.user!.branchId),
      ]);
      _stats = results[0] as DashboardStats?;
      _students = (results[1] as List<User>?) ?? [];
      if (_stats == null) {
        _error = 'Unable to load dashboard data. Pull to retry.';
      }
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int _newThisMonth() {
    final now = DateTime.now();
    int count = 0;
    for (final s in _students) {
      final c = s.createdAt;
      if (c == null || c.length < 7) continue;
      final y = int.tryParse(c.substring(0, 4));
      final m = int.tryParse(c.substring(5, 7));
      if (y == now.year && m == now.month) count++;
    }
    return count;
  }

  List<BarData> _monthlyEnrollments() {
    const abbr = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final now = DateTime.now();
    final labels = <String>[];
    final counts = [0, 0, 0, 0, 0, 0];
    for (int i = 5; i >= 0; i--) {
      final d = DateTime(now.year, now.month - i, 1);
      labels.add(abbr[d.month - 1]);
    }
    for (final s in _students) {
      final c = s.createdAt;
      if (c == null || c.length < 7) continue;
      final y = int.tryParse(c.substring(0, 4));
      final m = int.tryParse(c.substring(5, 7));
      if (y == null || m == null) continue;
      final idx = (now.year - y) * 12 + (now.month - m);
      if (idx >= 0 && idx <= 5) counts[5 - idx]++;
    }
    return List.generate(6, (i) {
      return BarData(
        label: labels[i],
        value: counts[i].toDouble(),
        gradient: i == 5
            ? AppColors.successGradient
            : (i == 4 ? AppColors.warmGradient : AppColors.primaryGradient),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = context.read<AuthProvider>().user!;
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    final s = _stats ?? DashboardStats();
    final firstName = user.name.split(' ').first;
    final newThisMonth = _newThisMonth();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          GradientHero(
            eyebrow: 'Admissions Office',
            title: 'Welcome, $firstName',
            subtitle: user.branchName ?? 'Concordia College',
            icon: Icons.person_add_rounded,
            gradient: AppColors.infoGradient,
          ),
          const SectionHeader(
            title: 'Overview',
            subtitle: 'Branch snapshot at a glance',
          ),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.12,
            children: [
              StatCard(
                label: 'Total Students',
                value: '${s.totalStudents}',
                icon: Icons.people_rounded,
                color: AppColors.primary,
                trend: 'Active',
                trendUp: true,
              ),
              StatCard(
                label: 'New This Month',
                value: '$newThisMonth',
                icon: Icons.person_add_alt_1_rounded,
                gradient: AppColors.successGradient,
                trend: '+$newThisMonth',
                trendUp: true,
              ),
              StatCard(
                label: 'Pending Fees',
                value: formatMoney(s.pendingFees),
                icon: Icons.pending_actions_rounded,
                gradient: AppColors.warningGradient,
              ),
              StatCard(
                label: 'Active Classes',
                value: '${s.totalClasses}',
                icon: Icons.class_rounded,
                color: AppColors.info,
              ),
            ],
          ),
          const SizedBox(height: 16),
          GradientSummary.pair(
            label1: 'Enrolled',
            value1: '${s.totalStudents}',
            label2: 'Pending Fees',
            value2: formatMoney(s.pendingFees),
            gradient: AppColors.warmGradient,
          ),
          const SectionHeader(
            title: 'Enrollment Trend',
            subtitle: 'New students · last 6 months',
          ),
          PremiumCard(
            padding: const EdgeInsets.fromLTRB(12, 18, 12, 8),
            child: MiniBarChart(
              bars: _monthlyEnrollments(),
              height: 170,
            ),
          ),
          const SectionHeader(
            title: 'Quick Actions',
            subtitle: 'Jump to a workflow',
          ),
          ListRow(
            leading: _actionIcon(AppColors.primaryGradient, Icons.person_add_rounded),
            title: 'New Enrollment',
            subtitle: 'Register a new student',
            eyebrow: 'Step 1',
            accentColor: AppColors.primary,
          ),
          const SizedBox(height: 10),
          ListRow(
            leading: _actionIcon(AppColors.infoGradient, Icons.people_alt_rounded),
            title: 'Student Records',
            subtitle: 'Search & manage enrolled students',
            eyebrow: 'Step 2',
            accentColor: AppColors.info,
          ),
          const SizedBox(height: 10),
          ListRow(
            leading: _actionIcon(AppColors.successGradient, Icons.receipt_long_rounded),
            title: 'Fee Records',
            subtitle: 'Invoices, challans & payments',
            eyebrow: 'Step 3',
            accentColor: AppColors.success,
          ),
        ],
      ),
    );
  }

  Widget _actionIcon(List<Color> gradient, IconData icon) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        gradient: appGradient(gradient),
        borderRadius: BorderRadius.circular(AppRadii.sm),
        boxShadow: [
          BoxShadow(
            color: gradient.first.withValues(alpha: 0.32),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Icon(icon, color: Colors.white, size: 20),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// NEW ENROLLMENT FORM
// ════════════════════════════════════════════════════════════════

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
  final _className = TextEditingController();
  final _rollNo = TextEditingController();
  final _baseFee = TextEditingController();
  String _section = 'A';
  String _gender = 'Male';
  bool _feeLocked = true;
  bool _busy = false;

  static const _defaultPassword = 'concordia123';

  @override
  void initState() {
    super.initState();
    _suggestRollNo();
  }

  @override
  void dispose() {
    _name.dispose();
    _father.dispose();
    _dob.dispose();
    _cnic.dispose();
    _phone.dispose();
    _address.dispose();
    _prevResult.dispose();
    _className.dispose();
    _rollNo.dispose();
    _baseFee.dispose();
    super.dispose();
  }

  void _suggestRollNo() {
    final y = DateTime.now().year;
    final r = (DateTime.now().millisecondsSinceEpoch % 10000)
        .toString()
        .padLeft(4, '0');
    _rollNo.text = 'STU-$y-$r';
  }

  Future<void> _pickDob() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(2010, 1, 1),
      firstDate: DateTime(1990),
      lastDate: DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: Theme.of(ctx).colorScheme.copyWith(
                primary: AppColors.primary,
              ),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        _dob.text =
            '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final auth = context.read<AuthProvider>();
      final api = ApiClient();
      final result = await api.createUser({
        'name': _name.text.trim(),
        'fatherName': _father.text.trim(),
        'dob': _dob.text.trim(),
        'cnic': _cnic.text.trim(),
        'guardianPhone': _phone.text.trim(),
        'address': _address.text.trim(),
        'prevResult': _prevResult.text.trim(),
        'class': _className.text.trim(),
        'section': _section,
        'rollNo': _rollNo.text.trim(),
        'password': _defaultPassword,
        'baseFee': double.tryParse(_baseFee.text.trim()) ?? 0,
        'baseFeeLocked': _feeLocked ? 1 : 0,
        'role': 'student',
        'status': 'Active',
        'instituteId': auth.user!.instituteId,
        'branchId': auth.user!.branchId,
        'createdById': auth.user!.id,
        'mustChangePassword': 1,
      });
      // Force sibling tabs + dashboard to refetch on next visit.
      api.invalidate('platform/users');
      api.invalidate('scoped');
      if (mounted) {
        _showSuccess(result);
        _formKey.currentState!.reset();
        _name.clear();
        _father.clear();
        _dob.clear();
        _cnic.clear();
        _phone.clear();
        _address.clear();
        _prevResult.clear();
        _className.clear();
        _baseFee.clear();
        setState(() {
          _section = 'A';
          _gender = 'Male';
          _feeLocked = true;
        });
        _suggestRollNo();
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to enroll: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showSuccess(User student) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.xl),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.successGradient),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.success.withValues(alpha: 0.30),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: const Icon(Icons.check_rounded,
                    color: Colors.white, size: 36),
              ),
              const SizedBox(height: 14),
              const Text(
                'Student Enrolled!',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${student.name} has been added to ${student.className ?? '—'} ${student.section ?? ''}'
                    .trim(),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceAlt,
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    _successRow('Roll Number', student.rollNo ?? '—', AppColors.primary),
                    const SizedBox(height: 10),
                    _successRow('Generated Password', _defaultPassword, AppColors.success),
                    const SizedBox(height: 10),
                    _successRow('Must Change', 'On first login', AppColors.info),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadii.md),
                    ),
                  ),
                  child: const Text('Done',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _successRow(String label, String value, Color color) {
    return Row(
      children: [
        Expanded(
          child: Text(label,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              )),
        ),
        Flexible(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // Photo placeholder (decorative)
          Center(
            child: Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(
                gradient: appGradient(AppColors.primaryGradient),
                shape: BoxShape.circle,
                boxShadow: AppShadows.card,
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.camera_alt_rounded, color: Colors.white, size: 28),
                  SizedBox(height: 2),
                  Text('Add Photo',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      )),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),

          // SECTION 1 — Student Information
          _sectionHeader(Icons.person_rounded, 'Student Information',
              'Personal & contact details'),
          const SizedBox(height: 10),
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                _field(_name, 'Full Name *', Icons.person_outline,
                    validator: true),
                const SizedBox(height: 12),
                _field(_father, "Father's Name", Icons.family_restroom),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: _dobField()),
                    const SizedBox(width: 10),
                    Expanded(child: _genderField()),
                  ],
                ),
                const SizedBox(height: 12),
                _field(_cnic, 'B-Form / CNIC', Icons.badge_outlined),
                const SizedBox(height: 12),
                _field(_phone, 'Guardian Phone', Icons.phone_outlined,
                    keyboardType: TextInputType.phone),
                const SizedBox(height: 12),
                _field(_address, 'Address', Icons.location_on_outlined,
                    maxLines: 2),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // SECTION 2 — Academic Placement
          _sectionHeader(Icons.school_rounded, 'Academic Placement',
              'Class, section & history'),
          const SizedBox(height: 10),
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _field(
                        _className,
                        'Class *',
                        Icons.class_outlined,
                        validator: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: _sectionField()),
                  ],
                ),
                const SizedBox(height: 12),
                _rollNoField(),
                const SizedBox(height: 12),
                _field(_prevResult, 'Previous Result / School',
                    Icons.history_edu,
                    maxLines: 2),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // SECTION 3 — Fee Information
          _sectionHeader(Icons.payments_rounded, 'Fee Information',
              'Base tuition & lock status'),
          const SizedBox(height: 10),
          PremiumCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                _field(_baseFee, 'Base Fee (Rs) *', Icons.currency_rupee,
                    keyboardType: TextInputType.number),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceAlt,
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Lock Base Fee',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary,
                                )),
                            SizedBox(height: 2),
                            Text(
                              'Prevents accidental edits by accountant',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Switch(
                        value: _feeLocked,
                        onChanged: (v) => setState(() => _feeLocked = v),
                        activeColor: AppColors.primary,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Submit button — full-width gradient
          Container(
            width: double.infinity,
            height: 54,
            decoration: BoxDecoration(
              gradient: appGradient(AppColors.primaryGradient),
              borderRadius: BorderRadius.circular(AppRadii.md),
              boxShadow: AppShadows.button,
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(AppRadii.md),
                onTap: _busy ? null : _submit,
                child: Center(
                  child: _busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2.5,
                          ),
                        )
                      : const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.check_circle_outline,
                                color: Colors.white, size: 20),
                            SizedBox(width: 8),
                            Text('Enroll Student',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                )),
                          ],
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(IconData icon, String title, String subtitle) {
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            gradient: appGradient(AppColors.primaryGradient),
            borderRadius: BorderRadius.circular(AppRadii.sm),
          ),
          child: Icon(icon, color: Colors.white, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  )),
              const SizedBox(height: 1),
              Text(subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  )),
            ],
          ),
        ),
      ],
    );
  }

  Widget _field(
    TextEditingController controller,
    String label,
    IconData icon, {
    bool validator = false,
    int maxLines = 1,
    TextInputType? keyboardType,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon),
      ),
      validator: validator
          ? (v) => (v == null || v.isEmpty) ? 'Required' : null
          : null,
    );
  }

  Widget _dobField() {
    return TextFormField(
      controller: _dob,
      readOnly: true,
      onTap: _pickDob,
      decoration: const InputDecoration(
        labelText: 'Date of Birth',
        prefixIcon: Icon(Icons.cake_outlined),
        suffixIcon: Icon(Icons.calendar_today_outlined, size: 18),
      ),
    );
  }

  Widget _genderField() {
    return DropdownButtonFormField<String>(
      value: _gender,
      decoration: const InputDecoration(
        labelText: 'Gender',
        prefixIcon: Icon(Icons.wc_rounded),
      ),
      items: const [
        DropdownMenuItem(value: 'Male', child: Text('Male')),
        DropdownMenuItem(value: 'Female', child: Text('Female')),
        DropdownMenuItem(value: 'Other', child: Text('Other')),
      ],
      onChanged: (v) => setState(() => _gender = v ?? 'Male'),
    );
  }

  Widget _sectionField() {
    return DropdownButtonFormField<String>(
      value: _section,
      decoration: const InputDecoration(labelText: 'Section'),
      items: ['A', 'B', 'C', 'D']
          .map((s) => DropdownMenuItem(value: s, child: Text(s)))
          .toList(),
      onChanged: (v) => setState(() => _section = v ?? 'A'),
    );
  }

  Widget _rollNoField() {
    return TextFormField(
      controller: _rollNo,
      decoration: InputDecoration(
        labelText: 'Roll Number *',
        prefixIcon: const Icon(Icons.badge_rounded),
        suffixIcon: IconButton(
          icon: const Icon(Icons.refresh_rounded, size: 20),
          onPressed: _suggestRollNo,
          tooltip: 'Re-suggest',
        ),
      ),
      validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
    );
  }
}

// ════════════════════════════════════════════════════════════════
// STUDENT RECORDS
// ════════════════════════════════════════════════════════════════

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
  String _classFilter = 'All';

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
      _students = await ApiClient()
          .listUsers(role: 'student', branchId: auth.user!.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<String> get _classOptions {
    final set = <String>{};
    for (final s in _students) {
      if (s.className != null && s.className!.isNotEmpty) {
        set.add(s.className!);
      }
    }
    final list = set.toList()..sort();
    return ['All', ...list];
  }

  List<User> get _filtered {
    return _students.where((s) {
      if (_classFilter != 'All' && s.className != _classFilter) return false;
      if (_query.isEmpty) return true;
      final q = _query.toLowerCase();
      return s.name.toLowerCase().contains(q) ||
          (s.rollNo ?? '').toLowerCase().contains(q) ||
          (s.className ?? '').toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 8);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    final filtered = _filtered;
    return RefreshIndicator(
      onRefresh: _load,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: 'Search by name, roll no, class…',
                prefixIcon: const Icon(Icons.search_rounded),
                filled: true,
                fillColor: AppColors.surfaceAlt,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  borderSide:
                      const BorderSide(color: AppColors.primary, width: 2),
                ),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 12),
              ),
            ),
          ),
          if (_classOptions.length > 1)
            SizedBox(
              height: 42,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _classOptions.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final c = _classOptions[i];
                  final selected = c == _classFilter;
                  return GestureDetector(
                    onTap: () => setState(() => _classFilter = c),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        gradient: selected
                            ? appGradient(AppColors.primaryGradient)
                            : null,
                        color: selected ? null : AppColors.surfaceAlt,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                        border: Border.all(
                          color: selected
                              ? Colors.transparent
                              : AppColors.border,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          c,
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: selected
                                ? Colors.white
                                : AppColors.textSecondary,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          Expanded(
            child: filtered.isEmpty
                ? const EmptyState(
                    icon: Icons.people_outline,
                    title: 'No students found',
                    subtitle:
                        'Try a different search or class filter',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final s = filtered[i];
                      final active = s.blocked == 0 && s.status == 'Active';
                      return ListRow(
                        title: s.name,
                        subtitle:
                            '${s.rollNo ?? '—'} · ${s.className ?? '—'} ${s.section ?? ''}'
                                .trim(),
                        eyebrow: s.className ?? 'Student',
                        accentColor: _colorForIndex(i),
                        onTap: () => _showStudentDetail(s),
                        trailing: StatusChip(
                          text: active ? 'Active' : 'Blocked',
                          type: active
                              ? StatusType.success
                              : StatusType.danger,
                          compact: true,
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Color _colorForIndex(int i) {
    const palette = [
      AppColors.primary,
      AppColors.info,
      AppColors.success,
      AppColors.purple,
      AppColors.warning,
    ];
    return palette[i % palette.length];
  }

  void _showStudentDetail(User s) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        final active = s.blocked == 0 && s.status == 'Active';
        return Container(
          margin: const EdgeInsets.all(12),
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(AppRadii.xl),
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.border,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    AppAvatar(
                      initials: s.name,
                      color: AppColors.primary,
                      size: 52,
                      useGradient: true,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(s.name,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: AppColors.textPrimary,
                              )),
                          const SizedBox(height: 2),
                          Text(
                            '${s.rollNo ?? '—'} · ${s.className ?? '—'} ${s.section ?? ''}'
                                .trim(),
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    StatusChip(
                      text: active ? 'Active' : 'Blocked',
                      type: active
                          ? StatusType.success
                          : StatusType.danger,
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                _detailSection(Icons.contact_phone_rounded,
                    'Contact & Demographics', [
                  _DetailRow('Father', s.fatherName ?? '—'),
                  _DetailRow('Date of Birth', s.dob ?? '—'),
                  _DetailRow('B-Form / CNIC', s.cnic ?? '—'),
                  _DetailRow('Guardian Phone', s.guardianPhone ?? '—'),
                  _DetailRow('Address', s.address ?? '—'),
                ]),
                const SizedBox(height: 14),
                _detailSection(Icons.school_rounded, 'Academic', [
                  _DetailRow('Class', s.className ?? '—'),
                  _DetailRow('Section', s.section ?? '—'),
                  _DetailRow('Program', s.program ?? '—'),
                  _DetailRow('Previous Result', s.prevResult ?? '—'),
                ]),
                const SizedBox(height: 14),
                _detailSection(Icons.payments_rounded, 'Fee', [
                  _DetailRow(
                    'Base Fee',
                    s.baseFee != null
                        ? formatMoneyFull(s.baseFee!)
                        : '—',
                  ),
                  _DetailRow(
                    'Fee Locked',
                    s.baseFeeLocked == 1 ? 'Yes' : 'No',
                  ),
                ]),
                if (s.createdAt != null) ...[
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'Enrolled on ${formatDate(s.createdAt)}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _detailSection(
      IconData icon, String title, List<_DetailRow> rows) {
    return PremiumCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Text(title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  )),
            ],
          ),
          const SizedBox(height: 10),
          ...rows.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 120,
                      child: Text(r.label,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSecondary,
                          )),
                    ),
                    Expanded(
                      child: Text(r.value,
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          )),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _DetailRow {
  final String label;
  final String value;
  const _DetailRow(this.label, this.value);
}

// ════════════════════════════════════════════════════════════════
// FEE RECORDS
// ════════════════════════════════════════════════════════════════

class _AdFees extends StatefulWidget {
  const _AdFees();

  @override
  State<_AdFees> createState() => _AdFeesState();
}

class _AdFeesState extends State<_AdFees> {
  List<FeeInvoice> _invoices = [];
  bool _loading = true;
  String? _error;
  String _filter = 'All'; // All | Unpaid | Paid

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
      // Branch-scoped invoices (admissions role is permitted on /fee-invoices
      // when no studentId is passed). 60s in-memory cache makes warm
      // navigation instant.
      _invoices = await ApiClient().listFeeInvoices();
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<FeeInvoice> get _filtered {
    if (_filter == 'All') return _invoices;
    return _invoices
        .where((i) => _filter == 'Paid' ? i.isPaid : !i.isPaid)
        .toList();
  }

  double get _pending =>
      _invoices.fold<double>(0, (a, i) => i.isPaid ? a : a + i.amount);

  double get _collected => _invoices.fold<double>(
      0,
      (a, i) =>
          a + (i.paidAmount ?? (i.isPaid ? i.amount : 0)));

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);
    final filtered = _filtered;
    return RefreshIndicator(
      onRefresh: _load,
      child: _invoices.isEmpty
          ? ListView(
              children: const [
                SizedBox(height: 80),
                EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'No fee invoices',
                  subtitle:
                      'Generate monthly invoices from the Accountant portal',
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              children: [
                GradientSummary.pair(
                  label1: 'Pending',
                  value1: formatMoney(_pending),
                  label2: 'Collected',
                  value2: formatMoney(_collected),
                  gradient: _pending > _collected
                      ? AppColors.warningGradient
                      : AppColors.successGradient,
                ),
                const SizedBox(height: 16),
                _filterChips(),
                const SizedBox(height: 12),
                ...filtered.map((inv) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: ListRow(
                        title: inv.studentName,
                        subtitle:
                            '${inv.className} · ${_monthName(inv.month)} ${inv.year}',
                        eyebrow: inv.type,
                        accentColor:
                            inv.isPaid ? AppColors.success : AppColors.warning,
                        onTap: () => _showChallan(inv),
                        trailing: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              formatMoneyFull(inv.amount),
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            StatusChip(
                              text: inv.isPaid ? 'Paid' : 'Unpaid',
                              type: inv.isPaid
                                  ? StatusType.success
                                  : StatusType.warning,
                              compact: true,
                            ),
                          ],
                        ),
                      ),
                    )),
                if (filtered.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 40),
                    child: EmptyState(
                      icon: Icons.search_off_rounded,
                      title: 'No invoices match this filter',
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _filterChips() {
    final options = ['All', 'Unpaid', 'Paid'];
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final o = options[i];
          final selected = o == _filter;
          final grad = selected
              ? (o == 'Paid'
                  ? AppColors.successGradient
                  : o == 'Unpaid'
                      ? AppColors.warningGradient
                      : AppColors.primaryGradient)
              : null;
          return GestureDetector(
            onTap: () => setState(() => _filter = o),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                gradient: selected ? appGradient(grad!) : null,
                color: selected ? null : AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(
                  color: selected ? Colors.transparent : AppColors.border,
                ),
              ),
              child: Center(
                child: Text(
                  o,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color:
                        selected ? Colors.white : AppColors.textSecondary,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  String _monthName(int m) {
    const names = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return (m >= 1 && m <= 12) ? names[m - 1] : '—';
  }

  void _showChallan(FeeInvoice inv) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.card,
            borderRadius: BorderRadius.circular(AppRadii.xl),
          ),
          child: SingleChildScrollView(
            child: Column(
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
                  decoration: BoxDecoration(
                    gradient: appGradient(inv.isPaid
                        ? AppColors.successGradient
                        : AppColors.primaryGradient),
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(AppRadii.xl),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.receipt_long_rounded,
                              color: Colors.white, size: 22),
                          const SizedBox(width: 8),
                          const Text('Fee Challan',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              )),
                          const Spacer(),
                          StatusChip(
                            text: inv.isPaid ? 'PAID' : 'UNPAID',
                            type: inv.isPaid
                                ? StatusType.success
                                : StatusType.warning,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Challan #${inv.challanNo ?? inv.id.substring(0, 8).toUpperCase()}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.white.withValues(alpha: 0.9),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                // Body
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _challanRow('Student', inv.studentName),
                      _challanRow('Class', inv.className),
                      _challanRow('Month',
                          '${_monthName(inv.month)} ${inv.year}'),
                      _challanRow('Type', inv.type),
                      if (inv.dueDate != null)
                        _challanRow('Due Date', formatDate(inv.dueDate)),
                      const SizedBox(height: 12),
                      const Divider(),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Expanded(
                            child: Text('Total Amount',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textSecondary,
                                )),
                          ),
                          Text(
                            formatMoneyFull(inv.amount),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      ),
                      if (inv.isPaid && inv.paidAmount != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Expanded(
                              child: Text('Paid',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: AppColors.success,
                                  )),
                            ),
                            Text(
                              formatMoneyFull(inv.paidAmount!),
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppColors.success,
                              ),
                            ),
                          ],
                        ),
                        if (inv.paymentMethod != null)
                          _challanRow('Method', inv.paymentMethod!),
                        if (inv.paidDate != null)
                          _challanRow('Paid On', formatDate(inv.paidDate)),
                      ],
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () => Navigator.of(ctx).pop(),
                          icon: const Icon(Icons.close),
                          label: const Text('Close'),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            foregroundColor: AppColors.textPrimary,
                            side: const BorderSide(color: AppColors.border),
                            shape: RoundedRectangleBorder(
                              borderRadius:
                                  BorderRadius.circular(AppRadii.md),
                            ),
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
      },
    );
  }

  Widget _challanRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(label,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textSecondary,
                )),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                )),
          ),
        ],
      ),
    );
  }
}
