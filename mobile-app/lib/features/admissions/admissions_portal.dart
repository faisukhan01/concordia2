// Admissions Office portal — premium redesign with parallel fetching.
// Tabs: dashboard, new enrollment, student records.
// Mirrors src/components/portal/admissions-portal.tsx.
//
// Design language:
//   • GradientHero welcome banner with primary-orange gradient
//   • 2×2 StatCard grid (real branch stats from /scoped/stats)
//   • MiniBarChart of last 6 months of enrollments (derived from roster)
//   • PremiumCard sectioned enrollment form with success dialog
//   • StudentRecordsList (shared with Accountant) — search + Edit + Docs
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
import '../shared/student_records_list.dart';

class AdmissionsPortal extends StatefulWidget {
  final AdmissionsTab initialTab;
  const AdmissionsPortal({super.key, this.initialTab = AdmissionsTab.dashboard});

  @override
  State<AdmissionsPortal> createState() => _AdmissionsPortalState();
}

class _AdmissionsPortalState extends State<AdmissionsPortal> {
  late AdmissionsTab _tab = widget.initialTab;

  @override
  void initState() {
    super.initState();
    // Admin-portal cleanup: admins must never land on a sub-portal dashboard.
    // If an admin opens this portal with the default dashboard tab, jump to
    // the first working module instead.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final role = context.read<AuthProvider>().user?.role;
      final isAdmin = role == 'admin' || role == 'super-admin';
      if (isAdmin && _tab == AdmissionsTab.dashboard) {
        _switchTo(AdmissionsTab.newEnrollment);
      }
    });
  }

  void _switchTo(AdmissionsTab t) => setState(() => _tab = t);

  @override
  Widget build(BuildContext context) {
    // Admins need this tab bar to switch a sub-portal's tasks; the portal's
    // own role already has the same items in the bottom nav, so we hide it
    // there to avoid redundancy.
    //
    // IMPORTANT (admin-portal cleanup): when an ADMIN opens a sub-portal, the
    // sub-portal's own Dashboard is intentionally HIDDEN from the tab bar.
    // The admin already has his own Admin Dashboard — sub-portal dashboards
    // are for the portal's own role only. This mirrors the web app, where the
    // admin sidebar's sub-portal dropdowns contain only working modules.
    final role = context.read<AuthProvider>().user!.role;
    final showTabs = role == 'admin' || role == 'super-admin';
    // Parallel lists: SubTabItem (UI) <-> AdmissionsTab (state).
    final allLabels = <String>['Dashboard', 'New Enrollment', 'Records'];
    final allIcons = <IconData>[
      Icons.dashboard_outlined,
      Icons.person_add_outlined,
      Icons.people_outline,
    ];
    final allValues = AdmissionsTab.values.toList();
    // Admins never see the Dashboard pill in a sub-portal.
    final idx = List<int>.generate(allLabels.length, (i) => i);
    final visibleIdx = showTabs
        ? idx.where((i) => allValues[i] != AdmissionsTab.dashboard).toList()
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
      case AdmissionsTab.dashboard:
        return const _AdDashboard();
      case AdmissionsTab.newEnrollment:
        return const _AdEnroll();
      case AdmissionsTab.records:
        return const StudentRecordsList();
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
            leading: _actionIcon(AppColors.primaryGradient, Icons.people_alt_rounded),
            title: 'Student Records',
            subtitle: 'Search & manage enrolled students',
            eyebrow: 'Step 2',
            accentColor: AppColors.primary,
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
// STUDENT RECORDS — provided by shared StudentRecordsList widget
// (lib/features/shared/student_records_list.dart)
// ════════════════════════════════════════════════════════════════
