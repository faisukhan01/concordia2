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
      final api = ApiClient();
      // Parallel fetch — analytics + announcements at the same time
      // instead of sequential awaits. Combined with the 60s in-memory
      // GET cache, warm tab switches are instant.
      final results = await parallelFetch<dynamic>([
        () => api.studentAnalytics(),
        () => api.listAnnouncements(),
      ]);
      _analytics = results[0] as Map<String, dynamic>?;
      _announcements = (results[1] as List?)
              ?.map((j) => Announcement.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [];
      if (_analytics == null) {
        _error = 'Unable to load dashboard';
      }
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
    if (_loading) return const LoadingList(count: 6, height: 100);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final user = context.read<AuthProvider>().user!;
    final a = _analytics ?? {};
    final firstName = user.name.trim().split(RegExp(r'\s+')).first;
    final attendanceRate = (a['attendanceRate'] as num?)?.toInt() ?? 0;
    final avgMarks = (a['averageMarks'] as num?)?.toDouble() ?? 0;
    final pendingFees = (a['pendingFees'] as num?)?.toDouble() ?? 0;
    final courseCount = (a['courseCount'] as num?)?.toInt() ?? 0;

    final recent =
        _announcements.length > 5 ? _announcements.sublist(0, 5) : _announcements;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          GradientHero(
            eyebrow: 'Student Portal',
            title: 'Assalam-o-Alaikum, $firstName',
            subtitle:
                'Class ${user.className ?? '—'} ${user.section != null ? '· Sec ${user.section}' : ''} · Roll #${user.rollNo ?? user.displayId}',
            icon: Icons.school_rounded,
            gradient: AppColors.warmGradient,
          ),
          const SizedBox(height: 22),

          // ── Overview stat grid ──────────────────────────────
          const SectionHeader(
              title: 'Your Overview', subtitle: 'A snapshot of this term'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.08,
            children: [
              StatCard(
                label: 'Attendance',
                value: '$attendanceRate%',
                icon: Icons.check_circle_rounded,
                color: AppColors.success,
                trend: attendanceRate >= 75 ? 'Good' : 'Low',
                trendUp: attendanceRate >= 75,
              ),
              StatCard(
                label: 'Avg. Marks',
                value: '${avgMarks.toStringAsFixed(1)}%',
                icon: Icons.grade_rounded,
                gradient: AppColors.infoGradient,
                trend: avgMarks >= 50 ? 'Pass' : 'At risk',
                trendUp: avgMarks >= 50,
              ),
              StatCard(
                label: 'Pending Fees',
                value: formatMoney(pendingFees),
                icon: Icons.pending_actions_rounded,
                gradient: AppColors.warningGradient,
                trend: pendingFees > 0 ? 'Due' : 'Clear',
                trendUp: pendingFees == 0,
              ),
              StatCard(
                label: 'Courses',
                value: '$courseCount',
                icon: Icons.book_rounded,
                color: AppColors.primary,
              ),
            ],
          ),

          // ── Attendance donut spotlight ─────────────────────
          const SizedBox(height: 14),
          PremiumCard(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
            child: Row(
              children: [
                DonutChart(
                  percent: (attendanceRate / 100).clamp(0.0, 1.0),
                  centerLabel: '$attendanceRate%',
                  centerSub: 'Attendance',
                  gradient: attendanceRate >= 75
                      ? AppColors.successGradient
                      : AppColors.warningGradient,
                  size: 118,
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        attendanceRate >= 90
                            ? 'Outstanding! 🌟'
                            : attendanceRate >= 75
                                ? 'Keep it up 👍'
                                : 'Improve attendance',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        attendanceRate >= 75
                            ? 'You\'re meeting the 75% attendance requirement for term completion.'
                            : 'Attendance is below the 75% threshold required to sit for exams.',
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                          height: 1.45,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          StatusChip(
                            text: attendanceRate >= 75 ? 'On track' : 'At risk',
                            type: attendanceRate >= 75
                                ? StatusType.success
                                : StatusType.warning,
                          ),
                          const SizedBox(width: 8),
                          StatusChip(
                            text: 'Avg ${avgMarks.toStringAsFixed(0)}% marks',
                            type: StatusType.info,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ── Recent announcements ────────────────────────────
          SectionHeader(
            title: 'Recent Announcements',
            subtitle: 'Latest from your school',
            action: recent.isEmpty ? null : '${recent.length} new',
          ),
          if (recent.isEmpty)
            const EmptyState(
              icon: Icons.campaign_outlined,
              title: 'No announcements',
              subtitle: 'School-wide notices will appear here',
            )
          else
            ...recent.map((an) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ListRow(
                    title: an.title,
                    subtitle: an.message,
                    eyebrow: an.senderName ?? an.senderRole,
                    icon: Icons.campaign_rounded,
                    accentColor: AppColors.purple,
                  ),
                )),
        ],
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
      final user = context.read<AuthProvider>().user!;
      _invoices = await ApiClient().listFeeInvoices(studentId: user.id);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load fees';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6, height: 84);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final pending = _invoices
        .where((i) => !i.isPaid)
        .fold(0.0, (a, i) => a + i.amount);
    final paid = _invoices
        .where((i) => i.isPaid)
        .fold(0.0, (a, i) => a + (i.paidAmount ?? 0));
    final allPaid = pending == 0;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          GradientSummary.pair(
            label1: 'Pending',
            value1: formatMoneyFull(pending),
            label2: 'Paid',
            value2: formatMoneyFull(paid),
            gradient: allPaid
                ? AppColors.successGradient
                : AppColors.warningGradient,
          ),
          const SizedBox(height: 18),
          PremiumCard(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: (allPaid ? AppColors.success : AppColors.warning)
                        .withOpacity(0.12),
                    borderRadius: BorderRadius.circular(AppRadii.sm),
                  ),
                  child: Icon(
                    allPaid
                        ? Icons.verified_rounded
                        : Icons.schedule_rounded,
                    size: 20,
                    color: allPaid
                        ? AppColors.success
                        : AppColors.warning,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        allPaid ? 'All clear!' : 'Action needed',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        allPaid
                            ? 'You have no pending dues. Thank you.'
                            : '${_invoices.where((i) => !i.isPaid).length} invoice(s) awaiting payment.',
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          SectionHeader(
            title: 'Your Invoices',
            subtitle: '${_invoices.length} total',
          ),
          if (_invoices.isEmpty)
            const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No invoices yet',
              subtitle: 'Fee challans will appear here once generated',
            )
          else
            ..._invoices.map((inv) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ListRow(
                    title: inv.monthYear,
                    subtitle:
                        'Challan #${inv.challanNo ?? inv.id.substring(0, inv.id.length.clamp(6, 12))} · ${inv.type}',
                    eyebrow: inv.isPaid ? 'Paid' : 'Due',
                    accentColor: inv.isPaid
                        ? AppColors.success
                        : AppColors.warning,
                    icon: inv.isPaid
                        ? Icons.check_circle_rounded
                        : Icons.receipt_long_rounded,
                    onTap: () => _showInvoiceSheet(inv),
                    trailing: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          formatMoneyFull(inv.amount),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                            letterSpacing: -0.2,
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
        ],
      ),
    );
  }

  void _showInvoiceSheet(FeeInvoice inv) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      gradient: appGradient(inv.isPaid
                          ? AppColors.successGradient
                          : AppColors.warningGradient),
                      borderRadius: BorderRadius.circular(AppRadii.md),
                    ),
                    child: Icon(
                      inv.isPaid
                          ? Icons.verified_rounded
                          : Icons.receipt_long_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Challan ${inv.challanNo ?? inv.id.substring(0, 8)}',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${inv.type} · ${inv.monthYear}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  StatusChip(
                    text: inv.isPaid ? 'Paid' : 'Unpaid',
                    type: inv.isPaid
                        ? StatusType.success
                        : StatusType.warning,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              _sheetRow('Student', inv.studentName),
              _sheetRow('Class', inv.className.isEmpty ? '—' : inv.className),
              _sheetRow(
                  'Amount due', formatMoneyFull(inv.amount),
                  strong: true),
              if (inv.paidAmount != null && inv.paidAmount! > 0)
                _sheetRow('Amount paid', formatMoneyFull(inv.paidAmount!)),
              if (inv.dueDate != null && inv.dueDate!.isNotEmpty)
                _sheetRow('Due date', formatDate(inv.dueDate)),
              if (inv.paidDate != null && inv.paidDate!.isNotEmpty)
                _sheetRow('Paid on', formatDate(inv.paidDate)),
              if (inv.paymentMethod != null && inv.paymentMethod!.isNotEmpty)
                _sheetRow('Method', inv.paymentMethod!),
              _sheetRow('Generated',
                  inv.createdAt != null ? formatDate(inv.createdAt) : '—'),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.of(ctx).pop(),
                  icon: const Icon(Icons.check_rounded, size: 18),
                  label: const Text('Got it'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sheetRow(String label, String value, {bool strong = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: strong ? FontWeight.w800 : FontWeight.w600,
                color: strong ? AppColors.primary : AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
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
  List<ExamResult> _results = [];
  List<ReportCard> _cards = [];
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
      final user = context.read<AuthProvider>().user!;
      final api = ApiClient();
      // Run both fetches in parallel — was sequential before.
      final results = await parallelFetch<dynamic>([
        () => api.listResults(studentId: user.id),
        () => api.listReportCards(studentId: user.id),
      ]);
      _results = (results[0] as List?)
              ?.map((j) => ExamResult.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [];
      _cards = (results[1] as List?)
              ?.map((j) => ReportCard.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [];
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load results';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6, height: 84);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final user = context.read<AuthProvider>().user!;

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          // ── Spotlight: latest report card ─────────────────
          if (_cards.isNotEmpty) ...[
            _ReportCardSpotlight(card: _cards.first),
            const SizedBox(height: 6),
          ],

          // ── Report cards section ─────────────────────────
          SectionHeader(
            title: 'Report Cards',
            subtitle:
                _cards.isEmpty ? 'No cards issued yet' : '${_cards.length} issued',
          ),
          if (_cards.isEmpty)
            const EmptyState(
              icon: Icons.description_outlined,
              title: 'No report cards yet',
              subtitle: 'Term-end report cards will appear here',
            )
          else
            ..._cards.map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: PremiumCard(
                    onTap: () {},
                    child: Row(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: _gradeColor(c.grade).withOpacity(0.12),
                            borderRadius: BorderRadius.circular(AppRadii.md),
                          ),
                          child: Center(
                            child: Text(
                              c.grade.isEmpty ? '—' : c.grade,
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: _gradeColor(c.grade),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                c.examName.isEmpty ? 'Term Exam' : c.examName,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textPrimary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 3),
                              Row(
                                children: [
                                  StatusChip(
                                    text: c.term.isEmpty ? 'Term' : c.term,
                                    type: StatusType.purple,
                                    compact: true,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    '${c.percentage.toStringAsFixed(1)}%',
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              '${c.obtainedMarks}',
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            Text(
                              '/ ${c.totalMarks}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),

          // ── Test results section ─────────────────────────
          SectionHeader(
            title: 'Test Results',
            subtitle: _results.isEmpty
                ? 'No tests attempted yet'
                : '${_results.length} records',
          ),
          if (_results.isEmpty)
            const EmptyState(
              icon: Icons.grade_outlined,
              title: 'No test results yet',
              subtitle: 'Individual test scores will appear here',
            )
          else
            ..._results.map((r) {
              final myMarks = r.records[user.id] ?? 0;
              final pct = r.totalMarks > 0
                  ? (myMarks / r.totalMarks * 100).round()
                  : 0;
              final markColor = pct >= 80
                  ? AppColors.success
                  : pct >= 60
                      ? AppColors.warning
                      : AppColors.danger;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ListRow(
                  title: r.exam.isEmpty ? 'Untitled Test' : r.exam,
                  subtitle: formatDate(r.date),
                  eyebrow: '$pct% · $myMarks/${r.totalMarks}',
                  accentColor: markColor,
                  icon: pct >= 50
                      ? Icons.check_circle_rounded
                      : Icons.cancel_rounded,
                  trailing: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '$myMarks',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: markColor,
                        ),
                      ),
                      Text(
                        '/ ${r.totalMarks}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Color _gradeColor(String grade) {
    switch (grade.toUpperCase()) {
      case 'A+':
      case 'A':
        return AppColors.success;
      case 'B':
        return AppColors.info;
      case 'C':
        return AppColors.warning;
      default:
        return AppColors.danger;
    }
  }
}

class _ReportCardSpotlight extends StatelessWidget {
  final ReportCard card;
  const _ReportCardSpotlight({required this.card});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        gradient: appGradient(AppColors.primaryGradient),
        borderRadius: BorderRadius.circular(AppRadii.lg),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.30),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'LATEST REPORT CARD',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.white.withOpacity(0.85),
                    letterSpacing: 1.3,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  card.examName.isEmpty ? 'Term Exam' : card.examName,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${card.term} · ${card.className} ${card.section}',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: Colors.white.withOpacity(0.92),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _spotStat('Marks', '${card.obtainedMarks}/${card.totalMarks}'),
                    const SizedBox(width: 18),
                    _spotStat('Percent', '${card.percentage.toStringAsFixed(1)}%'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.22),
              borderRadius: BorderRadius.circular(AppRadii.md),
              border: Border.all(
                color: Colors.white.withOpacity(0.3),
                width: 1.5,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  card.grade.isEmpty ? '—' : card.grade,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                const Text(
                  'GRADE',
                  style: TextStyle(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.white70,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _spotStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            color: Colors.white.withOpacity(0.78),
            letterSpacing: 1.0,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ],
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
      final user = context.read<AuthProvider>().user!;
      _records = await ApiClient().listAttendance(studentId: user.id);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load attendance';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6, height: 84);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final user = context.read<AuthProvider>().user!;
    int present = 0, absent = 0, late = 0;
    for (final r in _records) {
      final s = r.records[user.id];
      if (s == 'present') {
        present++;
      } else if (s == 'absent') {
        absent++;
      } else if (s == 'late') {
        late++;
      }
    }
    final total = _records.length;
    final rate = total > 0 ? ((present / total) * 100).round() : 0;
    final donutColor = rate >= 75
        ? AppColors.successGradient
        : rate >= 50
            ? AppColors.warningGradient
            : AppColors.sunsetGradient;

    // Build last 6 months attendance bars
    final bars = _buildMonthlyBars(user.id);

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          // ── Big donut spotlight ────────────────────────────
          PremiumCard(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
            child: Column(
              children: [
                const Text(
                  'Attendance Rate',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 14),
                Center(
                  child: DonutChart(
                    percent: (rate / 100).clamp(0.0, 1.0),
                    centerLabel: '$rate%',
                    centerSub: 'Present',
                    gradient: donutColor,
                    size: 168,
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: StatCard(
                        label: 'Present',
                        value: '$present',
                        icon: Icons.check_circle_rounded,
                        color: AppColors.success,
                        compact: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: StatCard(
                        label: 'Absent',
                        value: '$absent',
                        icon: Icons.cancel_rounded,
                        color: AppColors.danger,
                        compact: true,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: StatCard(
                        label: 'Late',
                        value: '$late',
                        icon: Icons.access_time_rounded,
                        color: AppColors.warning,
                        compact: true,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // ── Monthly trend chart ────────────────────────────
          if (bars.isNotEmpty) ...[
            const SectionHeader(
              title: 'Monthly Trend',
              subtitle: 'Attendance % over last 6 months',
            ),
            PremiumCard(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: MiniBarChart(
                bars: bars,
                height: 180,
              ),
            ),
          ],

          // ── Daily history ──────────────────────────────────
          SectionHeader(
            title: 'History',
            subtitle: total > 0 ? '$total records' : 'No records yet',
          ),
          if (_records.isEmpty)
            const EmptyState(
              icon: Icons.check_circle_outline,
              title: 'No attendance records yet',
              subtitle: 'Daily attendance will appear here',
            )
          else
            ..._records.reversed.map((r) {
              final status = r.records[user.id] ?? 'unknown';
              final chipType = status == 'present'
                  ? StatusType.success
                  : status == 'absent'
                      ? StatusType.danger
                      : StatusType.warning;
              final leadColor = status == 'present'
                  ? AppColors.success
                  : status == 'absent'
                      ? AppColors.danger
                      : AppColors.warning;
              final leadIcon = status == 'present'
                  ? Icons.check_circle_rounded
                  : status == 'absent'
                      ? Icons.cancel_rounded
                      : Icons.access_time_rounded;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ListRow(
                  title: formatDate(r.date),
                  subtitle: status == 'present'
                      ? 'Marked present'
                      : status == 'absent'
                          ? 'Marked absent'
                          : 'Arrived late',
                  accentColor: leadColor,
                  icon: leadIcon,
                  trailing: StatusChip(
                    text: _capitalize(status),
                    type: chipType,
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  String _capitalize(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  /// Build the last 6 months of attendance percentages for the chart.
  List<BarData> _buildMonthlyBars(String studentId) {
    if (_records.isEmpty) return const [];
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    // group by YYYY-MM
    final byMonth = <String, _MonthStat>{};
    for (final r in _records) {
      if (r.date.length < 7) continue;
      final ym = r.date.substring(0, 7);
      final stat = byMonth.putIfAbsent(ym, () => _MonthStat());
      stat.total++;
      if (r.records[studentId] == 'present') stat.present++;
    }
    final months = byMonth.keys.toList()..sort();
    final last6 = months.length > 6 ? months.sublist(months.length - 6) : months;
    return last6.map((ym) {
      final s = byMonth[ym]!;
      final rate = s.total > 0 ? (s.present / s.total * 100) : 0.0;
      final m = int.tryParse(ym.substring(5, 7)) ?? 0;
      final label = (m >= 1 && m <= 12) ? monthNames[m - 1] : ym;
      final grad = rate >= 75
          ? AppColors.successGradient
          : rate >= 50
              ? AppColors.warningGradient
              : AppColors.sunsetGradient;
      return BarData(label: label, value: rate, gradient: grad);
    }).toList();
  }
}

class _MonthStat {
  int total = 0;
  int present = 0;
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
  bool _loading = true;
  String? _error;
  String _day = 'Monday';

  static const _days = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  // Subject accent palette — stable per subject name
  static const _subjectColors = [
    AppColors.primary,
    AppColors.info,
    AppColors.success,
    AppColors.purple,
    AppColors.warning,
    AppColors.primaryDark,
    AppColors.chart2,
  ];

  @override
  void initState() {
    super.initState();
    // Default to today's weekday if it's a school day
    final today = DateTime.now();
    const wkday = [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ];
    final todayName = wkday[today.weekday - 1];
    if (_days.contains(todayName)) _day = todayName;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = context.read<AuthProvider>().user!;
      _entries = await ApiClient().listTimetable(branchId: user.branchId);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load timetable';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Color _colorForSubject(String subject) {
    if (subject.isEmpty) return AppColors.primary;
    return _subjectColors[subject.hashCode.abs() % _subjectColors.length];
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 6, height: 84);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final today = _entries.where((e) => e.day == _day).toList()
      ..sort((a, b) => a.period.compareTo(b.period));

    return Column(
      children: [
        // ── Day selector chips ───────────────────────────────
        Container(
          color: AppColors.background,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Weekly Schedule',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Tap a day to view classes',
                style: TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 42,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _days.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final d = _days[i];
                    final active = d == _day;
                    return GestureDetector(
                      onTap: () => setState(() => _day = d),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          gradient: active
                              ? appGradient(AppColors.primaryGradient)
                              : null,
                          color: active ? null : AppColors.card,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                          border: Border.all(
                            color: active
                                ? Colors.transparent
                                : AppColors.border,
                          ),
                          boxShadow: active ? AppShadows.button : null,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          d.substring(0, 3),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: active
                                ? Colors.white
                                : AppColors.textSecondary,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 6),

        // ── Today's classes ─────────────────────────────────
        Expanded(
          child: today.isEmpty
              ? const EmptyState(
                  icon: Icons.calendar_today_outlined,
                  title: 'No classes scheduled',
                  subtitle: 'Enjoy your day off! 🎉',
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AppColors.primary,
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    itemCount: today.length + 1,
                    itemBuilder: (_, i) {
                      if (i == 0) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Row(
                            children: [
                              Text(
                                _day,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.primarySoft,
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                ),
                                child: Text(
                                  '${today.length} class${today.length == 1 ? '' : 'es'}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }
                      final e = today[i - 1];
                      final color = _colorForSubject(e.subject);
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: ListRow(
                          title: e.subject.isEmpty ? 'Free Period' : e.subject,
                          subtitle: e.teacherName != null
                              ? '${e.teacherName} · ${e.startTime} — ${e.endTime}'
                              : '${e.startTime} — ${e.endTime}',
                          eyebrow: 'Period ${e.period}',
                          accentColor: color,
                          leading: Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: color.withOpacity(0.12),
                              borderRadius:
                                  BorderRadius.circular(AppRadii.md),
                              border: Border.all(
                                color: color.withOpacity(0.32),
                                width: 1.2,
                              ),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  'P${e.period}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          trailing: e.roomName != null && e.roomName!.isNotEmpty
                              ? Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: AppColors.surfaceAlt,
                                    borderRadius: BorderRadius.circular(
                                        AppRadii.pill),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.meeting_room_rounded,
                                        size: 12,
                                        color: AppColors.textSecondary,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        e.roomName!,
                                        style: const TextStyle(
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
                                          color: AppColors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                )
                              : null,
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}
