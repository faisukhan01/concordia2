// Student / Parent portal — view-only access to own data.
// Mirrors src/components/portal/student-portal.tsx.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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
class _Dashboard extends StatefulWidget {
  const _Dashboard();

  @override
  State<_Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<_Dashboard> {
  Map<String, dynamic>? _analytics;
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
      _analytics = await ApiClient().studentAnalytics();
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

    final a = _analytics ?? {};
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Greeting card
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.primary, AppColors.primaryDark],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Assalam-o-Alaikum', style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.85))),
                Text(user.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                const SizedBox(height: 6),
                Text('${user.className ?? '—'} ${user.section ?? ''} · ${user.rollNo ?? user.displayId}',
                    style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.9))),
              ],
            ),
          ),
          const SizedBox(height: 20),

          const SectionHeader(title: 'Your Overview'),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.1,
            children: [
              StatCard(label: 'Attendance', value: '${a['attendanceRate'] ?? 0}%', icon: Icons.check_circle, color: AppColors.success),
              StatCard(label: 'Avg. Marks', value: '${a['averageMarks'] ?? 0}%', icon: Icons.grade, color: AppColors.info),
              StatCard(label: 'Pending Fees', value: formatMoney((a['pendingFees'] as num?)?.toDouble() ?? 0), icon: Icons.pending_actions, color: AppColors.warning),
              StatCard(label: 'Courses', value: '${a['courseCount'] ?? 0}', icon: Icons.book, color: AppColors.primary),
            ],
          ),

          const SectionHeader(title: 'Recent Announcements'),
          _AnnouncementsPreview(),
        ],
      ),
    );
  }
}

class _AnnouncementsPreview extends StatefulWidget {
  @override
  State<_AnnouncementsPreview> createState() => _AnnouncementsPreviewState();
}

class _AnnouncementsPreviewState extends State<_AnnouncementsPreview> {
  List<Announcement> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _items = await ApiClient().listAnnouncements();
      if (_items.length > 3) _items = _items.sublist(0, 3);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox(height: 60, child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
    if (_items.isEmpty) return const EmptyState(icon: Icons.campaign_outlined, title: 'No announcements');
    return Column(
      children: _items.map((a) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(a.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
            const SizedBox(height: 4),
            Text(a.message, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
          ],
        ),
      )).toList(),
    );
  }
}

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
    setState(() { _loading = true; _error = null; });
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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final pending = _invoices.where((i) => !i.isPaid).fold(0.0, (a, i) => a + i.amount);
    final paid = _invoices.where((i) => i.isPaid).fold(0.0, (a, i) => a + (i.paidAmount ?? 0));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Summary
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.primary, AppColors.primaryDark]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Pending', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.85))),
                      Text(formatMoney(pending), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
                    ],
                  ),
                ),
                Container(width: 1, height: 36, color: Colors.white.withOpacity(0.3)),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Paid', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.85))),
                      Text(formatMoney(paid), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'Your Invoices'),
          if (_invoices.isEmpty)
            const EmptyState(icon: Icons.receipt_long_outlined, title: 'No invoices yet')
          else
            ..._invoices.map((i) => Container(
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
                      color: (i.isPaid ? AppColors.success : AppColors.warning).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(i.isPaid ? Icons.check_circle : Icons.pending, size: 20, color: i.isPaid ? AppColors.success : AppColors.warning),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${i.monthYear}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                        Text(i.challanNo ?? i.id, style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(formatMoneyFull(i.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                      const SizedBox(height: 4),
                      StatusChip(text: i.isPaid ? 'Paid' : 'Unpaid', type: i.isPaid ? StatusType.success : StatusType.warning),
                    ],
                  ),
                ],
              ),
            )),
        ],
      ),
    );
  }
}

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
    setState(() { _loading = true; _error = null; });
    try {
      final user = context.read<AuthProvider>().user!;
      final api = ApiClient();
      _results = await api.listResults(studentId: user.id);
      _cards = await api.listReportCards(studentId: user.id);
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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final user = context.read<AuthProvider>().user!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SectionHeader(title: 'Report Cards'),
          if (_cards.isEmpty)
            const EmptyState(icon: Icons.description_outlined, title: 'No report cards yet')
          else
            ..._cards.map((c) => Container(
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
                    width: 48, height: 48,
                    decoration: BoxDecoration(
                      color: _gradeColor(c.grade).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(child: Text(c.grade, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _gradeColor(c.grade)))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.examName.isEmpty ? 'Exam' : c.examName, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                        Text('${c.term} · ${c.percentage.toStringAsFixed(1)}%', style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                      ],
                    ),
                  ),
                  Text('${c.obtainedMarks}/${c.totalMarks}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                ],
              ),
            )),
          const SectionHeader(title: 'Test Results'),
          if (_results.isEmpty)
            const EmptyState(icon: Icons.grade_outlined, title: 'No test results yet')
          else
            ..._results.map((r) {
              final myMarks = r.records[user.id] ?? 0;
              final pct = r.totalMarks > 0 ? (myMarks / r.totalMarks * 100).round() : 0;
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
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.exam, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                          Text(r.date, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                    Text('$myMarks / ${r.totalMarks}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary)),
                    const SizedBox(width: 12),
                    StatusChip(text: '$pct%', type: pct >= 50 ? StatusType.success : StatusType.danger),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Color _gradeColor(String grade) {
    switch (grade.toUpperCase()) {
      case 'A+': case 'A': return AppColors.success;
      case 'B': return AppColors.info;
      case 'C': return AppColors.warning;
      default: return AppColors.danger;
    }
  }
}

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
    setState(() { _loading = true; _error = null; });
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
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final user = context.read<AuthProvider>().user!;
    int present = 0, absent = 0, late = 0;
    for (final r in _records) {
      final s = r.records[user.id];
      if (s == 'present') present++;
      else if (s == 'absent') absent++;
      else if (s == 'late') late++;
    }
    final total = _records.length;
    final rate = total > 0 ? ((present / total) * 100).round() : 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Big rate circle
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                Text('Attendance Rate', style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                const SizedBox(height: 8),
                Text('$rate%', style: TextStyle(fontSize: 48, fontWeight: FontWeight.w800, color: rate >= 75 ? AppColors.success : AppColors.warning)),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _Pill(label: 'Present', value: present, color: AppColors.success),
                    _Pill(label: 'Absent', value: absent, color: AppColors.danger),
                    _Pill(label: 'Late', value: late, color: AppColors.warning),
                  ],
                ),
              ],
            ),
          ),
          const SectionHeader(title: 'History'),
          if (_records.isEmpty)
            const EmptyState(icon: Icons.check_circle_outline, title: 'No attendance records yet')
          else
            ..._records.reversed.map((r) {
              final status = r.records[user.id] ?? 'unknown';
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.card,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Icon(
                      status == 'present' ? Icons.check_circle : status == 'absent' ? Icons.cancel : Icons.access_time,
                      size: 20,
                      color: status == 'present' ? AppColors.success : status == 'absent' ? AppColors.danger : AppColors.warning,
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Text(r.date, style: TextStyle(fontSize: 13, color: AppColors.textPrimary))),
                    StatusChip(
                      text: status[0].toUpperCase() + status.substring(1),
                      type: status == 'present' ? StatusType.success : status == 'absent' ? StatusType.danger : StatusType.warning,
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final int value;
  final Color color;
  const _Pill({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('$value', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
      ],
    );
  }
}

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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
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

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList();
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    final days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    final today = _entries.where((e) => e.day == _day).toList()..sort((a, b) => a.period.compareTo(b.period));

    return Column(
      children: [
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: days.map((d) {
              final active = d == _day;
              return GestureDetector(
                onTap: () => setState(() => _day = d),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: active ? AppColors.primary : AppColors.card,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: active ? AppColors.primary : AppColors.border),
                  ),
                  alignment: Alignment.center,
                  child: Text(d.substring(0, 3), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: active ? Colors.white : AppColors.textSecondary)),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: today.isEmpty
              ? const EmptyState(icon: Icons.calendar_today_outlined, title: 'No classes', subtitle: 'Enjoy your day off!')
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: today.length,
                  itemBuilder: (_, i) {
                    final e = today[i];
                    return Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border(
                          left: BorderSide(color: AppColors.primary, width: 3),
                          top: const BorderSide(color: AppColors.border),
                          right: const BorderSide(color: AppColors.border),
                          bottom: const BorderSide(color: AppColors.border),
                        ),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              children: [
                                Text('P${e.period}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primary)),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(e.subject, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                                if (e.teacherName != null)
                                  Text(e.teacherName!, style: TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                                Text('${e.startTime} — ${e.endTime}', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                              ],
                            ),
                          ),
                          if (e.roomName != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.secondary,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(e.roomName!, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.secondaryText)),
                            ),
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
