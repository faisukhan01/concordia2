// Admissions Office portal — premium redesign with parallel fetching.
// Tabs: dashboard, new enrollment, student records.
// Mirrors src/components/portal/admissions-portal.tsx.
//
// Design language:
//   • GradientHero welcome banner with primary-orange gradient
//   • 2×2 StatCard grid (real branch stats from /scoped/stats)
//   • MiniBarChart of last 6 months of enrollments
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final role = context.read<AuthProvider>().user?.role;
      final isAdmin = role == 'admin' || role == 'super-admin';
      if (isAdmin && _tab == AdmissionsTab.dashboard) {
        setState(() => _tab = AdmissionsTab.newEnrollment);
      }
    });
  }

  void _switchTo(AdmissionsTab t) {
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
            SubTabItem(label: 'New Enrollment', icon: Icons.person_add_outlined),
            SubTabItem(label: 'Student Records', icon: Icons.people_outline),
          ],
          currentIndex: _tab.index,
          onTap: (i) => _switchTo(AdmissionsTab.values[i]),
        ),
        Expanded(
          child: _tabBody,
        ),
      ],
    );
  }

  Widget get _tabBody {
    switch (_tab) {
      case AdmissionsTab.dashboard:
        return const _AdDashboard();
      case AdmissionsTab.newEnrollment:
        return const _AdNewEnrollment();
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
      final results = await parallelFetch<dynamic>([
        () => ApiClient().scopedStats(),
        () => ApiClient().listUsers(role: 'student'),
      ]);
      if (!mounted) return;
      setState(() {
        _stats = results[0] as DashboardStats?;
        _students = (results[1] as List<User>?) ?? [];
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

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          GradientHero(
            title: 'Admissions Office',
            subtitle: 'Manage enrollments and student records.',
            icon: Icons.school_outlined,
          ),
          const SizedBox(height: 16),
          _buildStatGrid(),
          const SizedBox(height: 16),
          _buildChart(),
          const SizedBox(height: 16),
          _buildRecentStudents(),
        ],
      ),
    );
  }

  Widget _buildStatGrid() {
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
          label: 'Total Students',
          value: '${s?.totalStudents ?? 0}',
          icon: Icons.school_outlined,
          color: AppColors.primary,
          trend: '+8%',
          trendUp: true,
        ),
        StatCard(
          label: 'Total Classes',
          value: '${s?.totalClasses ?? 0}',
          icon: Icons.class_outlined,
          color: AppColors.info,
        ),
        StatCard(
          label: 'Attendance Rate',
          value: '${s?.attendanceRate ?? 0}%',
          icon: Icons.check_circle_outline,
          color: AppColors.success,
        ),
        StatCard(
          label: 'Announcements',
          value: '${s?.activeAnnouncements ?? 0}',
          icon: Icons.campaign_outlined,
          color: AppColors.warning,
        ),
      ],
    );
  }

  Widget _buildChart() {
    final now = DateTime.now();
    final months = <String, int>{};
    for (int i = 5; i >= 0; i--) {
      final d = DateTime(now.year, now.month - i, 1);
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      months[key] = 0;
    }
    for (final s in _students) {
      if (s.createdAt != null && s.createdAt!.length >= 7) {
        final key = s.createdAt!.substring(0, 7);
        if (months.containsKey(key)) {
          months[key] = (months[key] ?? 0) + 1;
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
        value: entry.value.toDouble(),
      ));
    }
    return ConcordiaCard(
      title: 'Enrollment Trend',
      child: MiniBarChart(bars: bars, height: 180),
    );
  }

  Widget _buildRecentStudents() {
    final recent = _students.take(5).toList();
    if (recent.isEmpty) {
      return const EmptyState(
        icon: Icons.school_outlined,
        title: 'No students yet',
        subtitle: 'Students will appear here once enrolled.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Recent Enrollments'),
        ...recent.map((s) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                title: s.name,
                subtitle:
                    '${s.className ?? '—'} • ${s.rollNo ?? s.displayId}',
                initials: initialsOf(s.name),
                trailing: StatusChip(
                  text: s.status,
                  type: s.isActive
                      ? StatusType.success
                      : StatusType.danger,
                  compact: true,
                ),
              ),
            )),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════
// NEW ENROLLMENT — 3-step form
// ════════════════════════════════════════════════════════════════

class _AdNewEnrollment extends StatefulWidget {
  const _AdNewEnrollment();

  @override
  State<_AdNewEnrollment> createState() => _AdNewEnrollmentState();
}

class _AdNewEnrollmentState extends State<_AdNewEnrollment> {
  int _step = 0;
  bool _submitting = false;

  // Step 1: Student info
  final _nameCtrl = TextEditingController();
  final _fatherNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _cnicCtrl = TextEditingController();
  final _dobCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();

  // Step 2: Academic placement
  final _classCtrl = TextEditingController();
  final _sectionCtrl = TextEditingController();
  final _programCtrl = TextEditingController();
  final _prevResultCtrl = TextEditingController();
  String? _selectedBranchId;
  List<SchoolClass> _classes = [];

  // Step 3: Fee info
  final _baseFeeCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();

  @override
  void dispose() {
    for (final c in [
      _nameCtrl,
      _fatherNameCtrl,
      _emailCtrl,
      _phoneCtrl,
      _cnicCtrl,
      _dobCtrl,
      _addressCtrl,
      _classCtrl,
      _sectionCtrl,
      _programCtrl,
      _prevResultCtrl,
      _baseFeeCtrl,
      _passwordCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadClasses() async {
    if (_selectedBranchId == null) return;
    try {
      final classes = await ApiClient().listClasses(branchId: _selectedBranchId);
      if (mounted) setState(() => _classes = classes);
    } catch (_) {}
  }

  Future<void> _submit() async {
    if (_nameCtrl.text.trim().isEmpty) {
      _showSnackBar('Student name is required.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final api = ApiClient();
      await api.createUser({
        'name': _nameCtrl.text.trim(),
        'fatherName': _fatherNameCtrl.text.trim(),
        'email': _emailCtrl.text.trim(),
        'guardianPhone': _phoneCtrl.text.trim(),
        'cnic': _cnicCtrl.text.trim(),
        'dob': _dobCtrl.text.trim(),
        'address': _addressCtrl.text.trim(),
        'role': 'student',
        'className': _classCtrl.text.trim(),
        'section': _sectionCtrl.text.trim().isEmpty ? 'A' : _sectionCtrl.text.trim(),
        'program': _programCtrl.text.trim(),
        'prevResult': _prevResultCtrl.text.trim(),
        'branchId': _selectedBranchId,
        'baseFee': double.tryParse(_baseFeeCtrl.text.trim()) ?? 0,
        'password': _passwordCtrl.text.trim().isNotEmpty
            ? _passwordCtrl.text.trim()
            : null,
      });
      api.invalidate('platform/users');
      api.invalidate('scoped');
      if (mounted) {
        _showSuccessDialog();
      }
    } catch (e) {
      if (mounted) {
        _showSnackBar('Error: $e');
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSnackBar(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.danger,
      ),
    );
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
        ),
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppColors.successSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.check_circle,
                  color: AppColors.success, size: 20),
            ),
            const SizedBox(width: 12),
            const Text('Student Enrolled!'),
          ],
        ),
        content: Text(
          '${_nameCtrl.text.trim()} has been successfully enrolled.',
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.textSecondary,
          ),
        ),
        actions: [
          ConcordiaButton(
            label: 'Enroll Another',
            variant: ConcordiaButtonVariant.outline,
            onPressed: () {
              Navigator.pop(ctx);
              _resetForm();
            },
          ),
          ConcordiaButton(
            label: 'Done',
            onPressed: () {
              Navigator.pop(ctx);
              _resetForm();
            },
          ),
        ],
      ),
    );
  }

  void _resetForm() {
    for (final c in [
      _nameCtrl,
      _fatherNameCtrl,
      _emailCtrl,
      _phoneCtrl,
      _cnicCtrl,
      _dobCtrl,
      _addressCtrl,
      _classCtrl,
      _sectionCtrl,
      _programCtrl,
      _prevResultCtrl,
      _baseFeeCtrl,
      _passwordCtrl,
    ]) {
      c.clear();
    }
    setState(() {
      _step = 0;
      _selectedBranchId = null;
      _classes = [];
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final branchId = user?.branchId;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Step indicator
        _buildStepIndicator(),
        const SizedBox(height: 20),
        // Step content
        if (_step == 0)
          _buildStudentInfoStep(branchId)
        else if (_step == 1)
          _buildAcademicStep()
        else
          _buildFeeStep(),
        const SizedBox(height: 20),
        // Navigation buttons
        _buildNavButtons(),
      ],
    );
  }

  Widget _buildStepIndicator() {
    const labels = ['Student Info', 'Academic Placement', 'Fee Info'];
    return Row(
      children: List.generate(3, (i) {
        final active = i == _step;
        final done = i < _step;
        return Expanded(
          child: GestureDetector(
            onTap: done ? () => setState(() => _step = i) : null,
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
              decoration: BoxDecoration(
                color: active
                    ? AppColors.primary
                    : done
                        ? AppColors.successSoft
                        : AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(
                  color: active
                      ? AppColors.primary
                      : done
                          ? AppColors.success
                          : AppColors.border,
                  width: 1,
                ),
              ),
              child: Text(
                labels[i],
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color: active
                      ? Colors.white
                      : done
                          ? AppColors.success
                          : AppColors.textMuted,
                ),
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildStudentInfoStep(String? branchId) {
    return ConcordiaCard(
      title: 'Student Information',
      child: Column(
        children: [
          ConcordiaInput(
            label: 'Full Name *',
            controller: _nameCtrl,
            hintText: 'Enter student name',
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: "Father's Name",
            controller: _fatherNameCtrl,
            hintText: "Enter father's name",
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Email',
            controller: _emailCtrl,
            hintText: 'student@example.com',
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Guardian Phone',
            controller: _phoneCtrl,
            hintText: '03XX-XXXXXXX',
            keyboardType: TextInputType.phone,
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'CNIC',
            controller: _cnicCtrl,
            hintText: 'XXXXX-XXXXXXX-X',
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Date of Birth',
            controller: _dobCtrl,
            hintText: 'YYYY-MM-DD',
            keyboardType: TextInputType.datetime,
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Address',
            controller: _addressCtrl,
            hintText: 'Enter address',
            maxLines: 2,
          ),
        ],
      ),
    );
  }

  Widget _buildAcademicStep() {
    return ConcordiaCard(
      title: 'Academic Placement',
      child: Column(
        children: [
          ConcordiaInput(
            label: 'Class / Grade',
            controller: _classCtrl,
            hintText: 'e.g. Class 9',
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Section',
            controller: _sectionCtrl,
            hintText: 'A, B, C...',
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Program',
            controller: _programCtrl,
            hintText: 'e.g. Science, Arts',
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Previous Result',
            controller: _prevResultCtrl,
            hintText: 'e.g. A+, 85%',
          ),
        ],
      ),
    );
  }

  Widget _buildFeeStep() {
    return ConcordiaCard(
      title: 'Fee Information',
      child: Column(
        children: [
          ConcordiaInput(
            label: 'Base Fee (Rs)',
            controller: _baseFeeCtrl,
            hintText: '0',
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: 12),
          ConcordiaInput(
            label: 'Login Password',
            controller: _passwordCtrl,
            hintText: 'Leave blank for auto-generated',
            obscureText: true,
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(AppRadii.md),
              border: Border.all(
                color: AppColors.primary.withOpacity(0.16),
                width: 1,
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'If no password is set, one will be auto-generated. The student can change it after first login.',
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
    );
  }

  Widget _buildNavButtons() {
    return Row(
      children: [
        if (_step > 0)
          Expanded(
            child: ConcordiaButton(
              label: 'Back',
              variant: ConcordiaButtonVariant.outline,
              onPressed: () => setState(() => _step--),
            ),
          ),
        if (_step > 0) const SizedBox(width: 12),
        Expanded(
          child: _step < 2
              ? ConcordiaButton(
                  label: 'Next',
                  icon: Icons.arrow_forward,
                  onPressed: () => setState(() => _step++),
                )
              : ConcordiaButton(
                  label: 'Enroll Student',
                  icon: Icons.check,
                  loading: _submitting,
                  onPressed: _submitting ? null : _submit,
                ),
        ),
      ],
    );
  }
}
