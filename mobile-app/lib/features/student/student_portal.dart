// Student / Parent portal — view-only access to own data.
// Mirrors src/components/portal/student-portal.tsx.
//
// Premium redesign:
//   • GradientHero welcome banner with warm orange gradient
//   • 2×2 StatCard grid mixing solid + gradient tiles for rhythm
//   • DonutChart + MiniBarChart visuals powered by fl_chart
//   • ListRow / PremiumCard / SectionHeader shared components
//   • parallelFetch() for tab data — fixes the 0.5/10 speed complaint

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api/api_cache.dart' show parallelFetch;
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';
import '../shared/nav_items.dart';

class StudentPortal extends StatefulWidget {
  final StudentTab initialTab;
  const StudentPortal({super.key, this.initialTab = StudentTab.dashboard});

  @override
  State<StudentPortal> createState() => _StudentPortalState();
}

class _StudentPortalState extends State<StudentPortal> {
  @override
  Widget build(BuildContext context) {
    switch (widget.initialTab) {
      case StudentTab.dashboard:
        return const _Dashboard();
      case StudentTab.fees:
        return const _Fees();
      case StudentTab.results:
        return const _Results();
      case StudentTab.attendance:
        return const _Attendance();
      case StudentTab.timetable:
        return const _Timetable();
    }
  }
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

class _Dashboard extends StatefulWidget {
  const _Dashboard();

  @override
  State<_Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<_Dashboard> {
  Map<String, dynamic>? _analytics;
  List<Announcement> _announcements = [];
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
        () => ApiClient().studentAnalytics(),
        () => ApiClient().listAnnouncements(),
      ]);
      if (!mounted) return;
      setState(() {
        _analytics = results[0] as Map<String, dynamic>?;
        _announcements = (results[1] as List<Announcement>?) ?? [];
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

    final attendanceRate = _analytics?['attendanceRate'] as num? ?? 0;
    final avgPerformance = _analytics?['avgPerformance'] as num? ?? 0;
    final pendingFees = _analytics?['pendingFees'] as num? ?? 0;
    final totalClasses = _analytics?['totalClasses'] as int? ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          GradientHero(
            title: 'My Portal',
            subtitle: 'Track your attendance, results, and fees.',
            icon: Icons.school_outlined,
          ),
          const SizedBox(height: 16),
          _buildStatGrid(
            attendanceRate,
            avgPerformance,
            pendingFees,
            totalClasses,
          ),
          const SizedBox(height: 16),
          _buildAttendanceDonut(attendanceRate),
          const SizedBox(height: 16),
          _buildAnnouncements(),
        ],
      ),
    );
  }

  Widget _buildStatGrid(
    num attendanceRate,
    num avgPerformance,
    num pendingFees,
    int totalClasses,
  ) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.15,
      children: [
        StatCard(
          label: 'Attendance',
          value: '${attendanceRate.toDouble().toStringAsFixed(0)}%',
          icon: Icons.check_circle_outline,
          color: AppColors.success,
        ),
        StatCard(
          label: 'Avg Performance',
          value: '${avgPerformance.toDouble().toStringAsFixed(0)}%',
          icon: Icons.trending_up_outlined,
          color: AppColors.primary,
        ),
        StatCard(
          label: 'Pending Fees',
          value: formatMoney(pendingFees.toDouble()),
          icon: Icons.account_balance_wallet_outlined,
          color: AppColors.danger,
        ),
        StatCard(
          label: 'Total Classes',
          value: '$totalClasses',
          icon: Icons.class_outlined,
          color: AppColors.info,
        ),
      ],
    );
  }

  Widget _buildAttendanceDonut(num attendanceRate) {
    final percent = (attendanceRate.toDouble() / 100).clamp(0.0, 1.0);
    return ConcordiaCard(
      title: 'My Attendance',
      child: Center(
        child: DonutChart(
          percent: percent,
          centerLabel: '${attendanceRate.toDouble().toStringAsFixed(0)}%',
          centerSub: 'Attendance',
          size: 140,
        ),
      ),
    );
  }

  Widget _buildAnnouncements() {
    final recent = _announcements.take(4).toList();
    if (recent.isEmpty) {
      return const EmptyState(
        icon: Icons.campaign_outlined,
        title: 'No Announcements',
        subtitle: 'Announcements from your school will appear here.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader(title: 'Announcements'),
        ...recent.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListRow(
                title: a.title,
                subtitle: a.message.length > 60
                    ? '${a.message.substring(0, 60)}...'
                    : a.message,
                initials: a.title[0],
                trailing: Text(
                  formatDate(a.createdAt),
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
                onTap: () => _showAnnouncementDetail(a),
              ),
            )),
      ],
    );
  }

  void _showAnnouncementDetail(Announcement a) {
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
            Text(
              a.title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              a.message,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (a.senderName != null)
                  Text(
                    'By ${a.senderName}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                const Spacer(),
                Text(
                  formatDate(a.createdAt),
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// FEES
// ════════════════════════════════════════════════════════════════

class _Fees extends StatefulWidget {
  const _Fees();

  @override
  State<_Fees> createState() => _FeesState();
}

class _FeesState extends State<_Fees> {
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
      final invoices = await ApiClient().listFeeInvoices();
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
    final totalPending =
        unpaid.fold<double>(0.0, (sum, i) => sum + i.amount);
    final totalPaid =
        paid.fold<double>(0.0, (sum, i) => sum + (i.paidAmount ?? i.amount));

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          // Summary
          GradientSummary.pair(
            label1: 'Pending',
            value1: formatMoney(totalPending),
            label2: 'Paid',
            value2: formatMoney(totalPaid),
          ),
          const SizedBox(height: 16),
          if (unpaid.isNotEmpty) ...[
            const SectionHeader(title: 'Pending Invoices'),
            ...unpaid.map((inv) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _InvoiceCard(
                    invoice: inv,
                    onTap: () => _showInvoiceDetail(inv),
                  ),
                )),
          ],
          if (paid.isNotEmpty) ...[
            const SectionHeader(title: 'Paid Invoices'),
            ...paid.map((inv) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _InvoiceCard(
                    invoice: inv,
                    onTap: () => _showInvoiceDetail(inv),
                  ),
                )),
          ],
          if (_invoices.isEmpty)
            const EmptyState(
              icon: Icons.account_balance_wallet_outlined,
              title: 'No Fee Records',
              subtitle: 'Your fee invoices will appear here.',
            ),
        ],
      ),
    );
  }

  void _showInvoiceDetail(FeeInvoice inv) {
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
            Row(
              children: [
                const Text(
                  'Invoice Details',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const Spacer(),
                StatusChip(
                  text: inv.status,
                  type: inv.isPaid ? StatusType.success : StatusType.warning,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _detailRow('Type', inv.type),
            _detailRow('Month/Year', inv.monthYear),
            _detailRow('Amount', formatMoney(inv.amount)),
            if (inv.isPaid) ...[
              _detailRow('Paid Amount', formatMoney(inv.paidAmount ?? 0)),
              _detailRow('Payment Method', inv.paymentMethod ?? '—'),
              _detailRow('Paid Date', formatDate(inv.paidDate)),
            ],
            if (inv.dueDate != null) _detailRow('Due Date', formatDate(inv.dueDate)),
            if (inv.challanNo != null) _detailRow('Challan No', inv.challanNo!),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
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
  final VoidCallback? onTap;

  const _InvoiceCard({
    required this.invoice,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListRow(
      title: '${invoice.type} • ${invoice.monthYear}',
      subtitle: formatMoney(invoice.amount),
      initials: invoice.type[0],
      trailing: StatusChip(
        text: invoice.status,
        type: invoice.isPaid ? StatusType.success : StatusType.warning,
        compact: true,
      ),
      onTap: onTap,
    );
  }
}

// ════════════════════════════════════════════════════════════════
// RESULTS
// ════════════════════════════════════════════════════════════════

class _Results extends StatefulWidget {
  const _Results();

  @override
  State<_Results> createState() => _ResultsState();
}

class _ResultsState extends State<_Results> {
  List<ReportCard> _reportCards = [];
  List<ExamResult> _testResults = [];
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
        () => ApiClient().listReportCards(),
        () => ApiClient().listResults(),
      ]);
      if (!mounted) return;
      setState(() {
        _reportCards = (results[0] as List<ReportCard>?) ?? [];
        _testResults = (results[1] as List<ExamResult>?) ?? [];
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
          // Report Cards
          const SectionHeader(title: 'Report Cards'),
          if (_reportCards.isEmpty)
            const EmptyState(
              icon: Icons.description_outlined,
              title: 'No Report Cards',
              subtitle: 'Your report cards will appear here when generated.',
            )
          else
            ..._reportCards.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: c.examName,
                    subtitle:
                        '${c.term} • ${c.percentage.toStringAsFixed(1)}% • ${c.totalMarks}/${c.obtainedMarks}',
                    initials: c.examName[0],
                    trailing: StatusChip(
                      text: c.grade,
                      type: _gradeType(c.grade),
                      compact: true,
                    ),
                    onTap: () => _showReportCardDetail(c),
                  ),
                )),
          const SizedBox(height: 8),
          // Test Results
          const SectionHeader(title: 'Test Results'),
          if (_testResults.isEmpty)
            const EmptyState(
              icon: Icons.assignment_outlined,
              title: 'No Test Results',
              subtitle: 'Your test results will appear here.',
            )
          else
            ..._testResults.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: r.exam,
                    subtitle:
                        '${r.date} • Total: ${r.totalMarks}',
                    initials: r.exam[0],
                    onTap: () => _showTestResultDetail(r),
                  ),
                )),
        ],
      ),
    );
  }

  StatusType _gradeType(String grade) {
    if (grade.startsWith('A')) return StatusType.success;
    if (grade.startsWith('B')) return StatusType.info;
    if (grade.startsWith('C')) return StatusType.warning;
    return StatusType.danger;
  }

  void _showReportCardDetail(ReportCard c) {
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
            Text(
              c.examName,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            _detailRow('Class', '${c.className} ${c.section}'),
            _detailRow('Term', c.term),
            _detailRow('Total Marks', '${c.totalMarks}'),
            _detailRow('Obtained', '${c.obtainedMarks}'),
            _detailRow('Percentage', '${c.percentage.toStringAsFixed(1)}%'),
            _detailRow('Grade', c.grade),
            if (c.remarks != null) _detailRow('Remarks', c.remarks!),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  void _showTestResultDetail(ExamResult r) {
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
            Text(
              r.exam,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),
            _detailRow('Date', r.date),
            _detailRow('Total Marks', '${r.totalMarks}'),
            _detailRow('Class ID', r.classId),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
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
            ),
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// ATTENDANCE
// ════════════════════════════════════════════════════════════════

class _Attendance extends StatefulWidget {
  const _Attendance();

  @override
  State<_Attendance> createState() => _AttendanceState();
}

class _AttendanceState extends State<_Attendance> {
  List<AttendanceRecord> _records = [];
  Map<String, dynamic>? _analytics;
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
        () => ApiClient().listAttendance(),
        () => ApiClient().studentAnalytics(),
      ]);
      if (!mounted) return;
      setState(() {
        _records = (results[0] as List<AttendanceRecord>?) ?? [];
        _analytics = results[1] as Map<String, dynamic>?;
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

    final attendanceRate = _analytics?['attendanceRate'] as num? ?? 0;
    final percent = (attendanceRate.toDouble() / 100).clamp(0.0, 1.0);

    // Build monthly trend
    final now = DateTime.now();
    final months = <String, double>{};
    for (int i = 5; i >= 0; i--) {
      final d = DateTime(now.year, now.month - i, 1);
      final key = '${d.year}-${d.month.toString().padLeft(2, '0')}';
      months[key] = 0;
    }
    for (final r in _records) {
      if (r.date.length >= 7) {
        final key = r.date.substring(0, 7);
        if (months.containsKey(key)) {
          final presentCount = r.records.values
              .where((v) => v == 'present' || v == 'late')
              .length;
          final total = r.records.length;
          if (total > 0) {
            months[key] = (months[key] ?? 0) + (presentCount / total * 100);
          }
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

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          // Donut chart
          Center(
            child: DonutChart(
              percent: percent,
              centerLabel: '${attendanceRate.toDouble().toStringAsFixed(0)}%',
              centerSub: 'Attendance',
              size: 150,
            ),
          ),
          const SizedBox(height: 16),
          // Monthly trend
          ConcordiaCard(
            title: 'Monthly Trend',
            child: MiniBarChart(bars: bars, height: 180),
          ),
          const SizedBox(height: 16),
          // History
          const SectionHeader(title: 'Attendance History'),
          if (_records.isEmpty)
            const EmptyState(
              icon: Icons.check_circle_outline,
              title: 'No Records',
              subtitle: 'Your attendance records will appear here.',
            )
          else
            ..._records.take(10).map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ListRow(
                    title: r.date,
                    subtitle:
                        '${r.records.values.where((v) => v == 'present').length} present / ${r.records.length} total',
                    initials: r.date.length > 2 ? r.date.substring(8, 10) : '?',
                    trailing: StatusChip(
                      text: r.records.values.where((v) => v == 'present').length >=
                              r.records.length / 2
                          ? 'Good'
                          : 'Low',
                      type: r.records.values
                                  .where((v) => v == 'present')
                                  .length >=
                              r.records.length / 2
                          ? StatusType.success
                          : StatusType.danger,
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
// TIMETABLE
// ════════════════════════════════════════════════════════════════

class _Timetable extends StatefulWidget {
  const _Timetable();

  @override
  State<_Timetable> createState() => _TimetableState();
}

class _TimetableState extends State<_Timetable> {
  List<TimetableEntry> _entries = [];
  int _selectedDayIndex = 0;
  bool _loading = true;
  String? _error;

  static const _days = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

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
      final entries = await ApiClient().listTimetable();
      if (!mounted) return;
      setState(() {
        _entries = entries;
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

    final dayEntries = _entries
        .where((e) => e.day == _days[_selectedDayIndex])
        .toList()
      ..sort((a, b) => a.period.compareTo(b.period));

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          // Day selector
          _buildDaySelector(),
          const SizedBox(height: 16),
          // Period cards
          if (dayEntries.isEmpty)
            const EmptyState(
              icon: Icons.calendar_today_outlined,
              title: 'No Classes',
              subtitle: 'No timetable entries for this day.',
            )
          else
            ...dayEntries.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _PeriodCard(entry: e),
                )),
        ],
      ),
    );
  }

  Widget _buildDaySelector() {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final active = i == _selectedDayIndex;
          return GestureDetector(
            onTap: () => setState(() => _selectedDayIndex = i),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                gradient: active
                    ? appGradient(AppColors.primaryGradient)
                    : null,
                color: active ? null : AppColors.card,
                borderRadius: BorderRadius.circular(AppRadii.pill),
                border: Border.all(
                  color: active ? AppColors.primary : AppColors.border,
                  width: 1,
                ),
              ),
              child: Text(
                _days[i].substring(0, 3),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  color: active ? Colors.white : AppColors.textSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Period card ─────────────────────────────────────────────────

class _PeriodCard extends StatelessWidget {
  final TimetableEntry entry;

  const _PeriodCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
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
      child: Row(
        children: [
          // Period number
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              gradient: appGradient(AppColors.primaryGradient),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                '${entry.period}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.subject,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${entry.startTime} – ${entry.endTime}',
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${entry.className} ${entry.section}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary,
                ),
              ),
              if (entry.teacherName != null)
                Text(
                  entry.teacherName!,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
              if (entry.roomName != null)
                Text(
                  entry.roomName!,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
