// Concordia College — Shared Student Records list (Admissions + Accountant).
// Mirrors the web app's StudentRecordsView (src/components/portal/admissions-portal.tsx).
//
// Provides:
//   • StudentRecordsList — searchable, hierarchical student browser:
//       Department → Part 1/Part 2 → Class → Section → Student list
//     Also supports flat search across all students.
//   • showDocumentsSheet() — modal bottom sheet to upload/list/download/
//     delete per-student documents (mirrors web DocumentManagerDialog).
//   • showEditStudentSheet() — modal bottom sheet to edit a student's
//     name / father name / contact / address (calls api.updateUser).
//
// Uses the new design system: ConcordiaCard, ConcordiaButton, ConcordiaInput,
// SectionHeader, AppAvatar, StatusChip, etc.
// Uses withOpacity() for Flutter 3.24 compatibility.

import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/shared_widgets.dart';
import '../auth/auth_provider.dart';

// ════════════════════════════════════════════════════════════════
// CANONICAL 6 DEPARTMENTS — matches web app concordia-hierarchy.tsx
// ════════════════════════════════════════════════════════════════

const kDepartments = [
  'FSC Pre Med',
  'FSC Pre Eng',
  'ICS Phy',
  'ICS Stats',
  'FA',
  'FA IT',
];

class _DeptMeta {
  final IconData icon;
  final String desc;
  final List<Color> gradient;
  const _DeptMeta({
    required this.icon,
    required this.desc,
    required this.gradient,
  });
}

const _deptMeta = <String, _DeptMeta>{
  'FSC Pre Med': _DeptMeta(
    icon: Icons.biotech_rounded,
    desc: 'Pre-Medical (Biology, Chemistry, Physics)',
    gradient: [Color(0xFFE11D48), Color(0xFFBE123C)],
  ),
  'FSC Pre Eng': _DeptMeta(
    icon: Icons.calculate_rounded,
    desc: 'Pre-Engineering (Math, Physics, Chemistry)',
    gradient: [Color(0xFF0284C7), Color(0xFF0369A1)],
  ),
  'ICS Phy': _DeptMeta(
    icon: Icons.layers_rounded,
    desc: 'Computer Science with Physics',
    gradient: [Color(0xFF7C3AED), Color(0xFF6D28D9)],
  ),
  'ICS Stats': _DeptMeta(
    icon: Icons.layers_rounded,
    desc: 'Computer Science with Statistics',
    gradient: [Color(0xFFD97706), Color(0xFFB45309)],
  ),
  'FA': _DeptMeta(
    icon: Icons.menu_book_rounded,
    desc: 'Faculty of Arts (General)',
    gradient: [Color(0xFF059669), Color(0xFF047857)],
  ),
  'FA IT': _DeptMeta(
    icon: Icons.description_rounded,
    desc: 'Faculty of Arts with IT',
    gradient: [Color(0xFF0D9488), Color(0xFF0F766E)],
  ),
};

// ════════════════════════════════════════════════════════════════
// DRILL-DOWN STATE
// ════════════════════════════════════════════════════════════════

class _Drill {
  final String? dept;
  final String part; // '1' or '2'
  final SchoolClass? cls;
  final SchoolClass? section;

  const _Drill({
    this.dept,
    this.part = '1',
    this.cls,
    this.section,
  });

  _Drill copyWith({
    String? dept,
    String? part,
    SchoolClass? cls,
    SchoolClass? section,
    bool clearDept = false,
    bool clearCls = false,
    bool clearSection = false,
  }) {
    return _Drill(
      dept: clearDept ? null : (dept ?? this.dept),
      part: part ?? this.part,
      cls: clearCls ? null : (cls ?? this.cls),
      section: clearSection ? null : (section ?? this.section),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// STUDENT RECORDS LIST — shared by Admissions + Accountant
// ════════════════════════════════════════════════════════════════

class StudentRecordsList extends StatefulWidget {
  const StudentRecordsList({super.key});

  @override
  State<StudentRecordsList> createState() => _StudentRecordsListState();
}

class _StudentRecordsListState extends State<StudentRecordsList> {
  List<User> _students = [];
  List<SchoolClass> _classes = [];
  bool _loading = true;
  String? _error;
  String _query = '';
  _Drill _drill = const _Drill();

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
      final results = await Future.wait([
        api.listUsers(role: 'student', branchId: auth.user!.branchId),
        api.listClasses(branchId: auth.user!.branchId),
      ]);
      _students = results[0] as List<User>;
      _classes = results[1] as List<SchoolClass>;
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load students';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ── Student counts per department ──
  Map<String, int> get _studentCounts {
    final map = <String, int>{};
    for (final dept in kDepartments) {
      map[dept] = 0;
    }
    for (final s in _students) {
      final p = (s.program ?? '').trim();
      if (map.containsKey(p)) map[p] = map[p]! + 1;
    }
    return map;
  }

  // ── Search results ──
  List<User> get _searchResults {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return [];
    return _students.where((s) {
      return s.name.toLowerCase().contains(q) ||
          (s.fatherName ?? '').toLowerCase().contains(q) ||
          (s.guardian ?? '').toLowerCase().contains(q) ||
          (s.rollNo ?? '').toLowerCase().contains(q) ||
          (s.cnic ?? '').toLowerCase().contains(q);
    }).toList();
  }

  bool get _isSearching => _query.trim().isNotEmpty;

  // ── Classes for the current dept + part ──
  List<SchoolClass> get _classesInDept {
    if (_drill.dept == null) return [];
    return _classes.where((c) {
      // Match by program on the class or by looking at students in the class
      // The web app filters by c.program === drill.dept && String(c.part) === drill.part
      // Our SchoolClass model doesn't have program/part, so we infer from student data
      final studentsInClass = _students.where((s) =>
          (s.className ?? '').trim() == c.name.trim() &&
          (s.section ?? '').trim() == c.section.trim());
      if (studentsInClass.isEmpty) return false;
      // Check if any student in this class has the matching program
      return studentsInClass.any((s) =>
          (s.program ?? '').trim() == _drill.dept);
    }).toList();
  }

  // ── Sections of the currently-selected class ──
  List<SchoolClass> get _sectionsOfClass {
    if (_drill.cls == null) return [];
    return _classes
        .where((c) => c.name.trim() == _drill.cls!.name.trim())
        .toList();
  }

  bool get _hasMultipleSections => _sectionsOfClass.length > 1;

  // ── Students in the final selected class/section ──
  List<User> get _tableStudents {
    final target = _drill.section ?? _drill.cls;
    if (target == null) return [];
    return _students.where((s) {
      return (s.className ?? '').trim() == target.name.trim() &&
          (s.section ?? '').trim() == target.section.trim();
    }).toList();
  }

  int _getStudentCountForClass(SchoolClass cls) {
    return _students.where((s) =>
        (s.className ?? '').trim() == cls.name.trim() &&
        (s.section ?? '').trim() == cls.section.trim()).length;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingList(count: 8);
    if (_error != null) return ErrorState(message: _error!, onRetry: _load);

    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.primary,
      child: Column(
        children: [
          // ── Search bar (always visible) ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: ConcordiaInput(
              hintText: 'Search by name, roll #, CNIC…',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          // ── Content area ──
          Expanded(
            child: _isSearching
                ? _buildSearchResults()
                : _drill.dept == null
                    ? _buildDepartmentGrid()
                    : _drill.cls == null
                        ? _buildClassCards()
                        : _hasMultipleSections && _drill.section == null
                            ? _buildSectionCards()
                            : _buildStudentTable(),
          ),
        ],
      ),
    );
  }

  // ────────────────────────────────────────────────────────────────
  // SEARCH RESULTS
  // ────────────────────────────────────────────────────────────────

  Widget _buildSearchResults() {
    final results = _searchResults;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // Header
        ConcordiaCard(
          title: 'Search Results',
          headerSubtitle: Text(
            '${results.length} match${results.length == 1 ? '' : 'es'} across all departments',
            style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
          headerTrailing: ConcordiaButton(
            label: 'Back to hierarchy',
            variant: ConcordiaButtonVariant.ghost,
            icon: Icons.arrow_back,
            onPressed: () => setState(() => _query = ''),
          ),
          child: const SizedBox.shrink(),
        ),
        const SizedBox(height: 12),
        if (results.isEmpty)
          const EmptyState(
            icon: Icons.people_outline,
            title: 'No matching records',
            subtitle: 'Try adjusting your search query.',
          )
        else
          ...results.map((s) => _buildStudentRow(s)),
      ],
    );
  }

  // ────────────────────────────────────────────────────────────────
  // DEPARTMENT CARDS
  // ────────────────────────────────────────────────────────────────

  Widget _buildDepartmentGrid() {
    final counts = _studentCounts;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        const SectionHeader(title: 'Select a Department'),
        const SizedBox(height: 4),
        Text(
          'Browse the 6 Concordia departments to drill into their classes and students.',
          style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
        ),
        const SizedBox(height: 14),
        ...kDepartments.map((dept) {
          final meta = _deptMeta[dept] ??
              const _DeptMeta(
                icon: Icons.school_rounded,
                desc: '',
                gradient: AppColors.primaryGradient,
              );
          final count = counts[dept] ?? 0;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GestureDetector(
              onTap: () => setState(() {
                _drill = _Drill(dept: dept, part: '1');
              }),
              child: ConcordiaCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    // Icon container
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: appGradient(meta.gradient),
                        borderRadius: BorderRadius.circular(AppRadii.lg),
                      ),
                      child: Icon(meta.icon, color: Colors.white, size: 24),
                    ),
                    const SizedBox(width: 14),
                    // Text
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            dept,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            meta.desc,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    // Count badge
                    if (count > 0)
                      ConcordiaBadge(
                        label: '$count',
                        variant: ConcordiaBadgeVariant.secondary,
                      ),
                    const SizedBox(width: 8),
                    const Icon(Icons.chevron_right,
                        color: AppColors.textMuted, size: 20),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  // ────────────────────────────────────────────────────────────────
  // CLASS CARDS (with Part toggle)
  // ────────────────────────────────────────────────────────────────

  Widget _buildClassCards() {
    final classesInDept = _classesInDept;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        // Breadcrumb
        _buildBreadcrumb(),
        const SizedBox(height: 12),
        // Title + Part toggle
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_drill.dept} Classes',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'Select Part 1 (1st year) or Part 2 (2nd year), then pick a class.',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Part 1 / Part 2 toggle
        _buildPartToggle(),
        const SizedBox(height: 14),
        if (classesInDept.isEmpty)
          ConcordiaCard(
            child: Column(
              children: [
                const Icon(Icons.folder_open_outlined,
                    size: 36, color: AppColors.textMuted),
                const SizedBox(height: 8),
                Text(
                  'No classes found for ${_drill.dept} · Part ${_drill.part}',
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary),
                ),
                const SizedBox(height: 4),
                const Text(
                  'The Academic Office needs to create classes for this department. Meanwhile, search students by name or CNIC above.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
          )
        else
          ..._buildClassCardGrid(classesInDept),
      ],
    );
  }

  Widget _buildPartToggle() {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        border: Border.all(color: AppColors.softBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _partToggleItem('1', 'Part 1', '1st Year', Icons.menu_book_rounded),
          const SizedBox(width: 6),
          _partToggleItem(
              '2', 'Part 2', '2nd Year', Icons.school_rounded),
        ],
      ),
    );
  }

  Widget _partToggleItem(
      String key, String label, String sub, IconData icon) {
    final active = _drill.part == key;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() {
          _drill = _drill.copyWith(part: key, clearCls: true, clearSection: true);
        }),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            gradient: active ? appGradient(AppColors.primaryGradient) : null,
            color: active ? null : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadii.lg),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: AppColors.primary.withOpacity(0.25),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: active
                      ? Colors.white.withOpacity(0.2)
                      : AppColors.card,
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                  border: Border.all(
                    color: active
                        ? Colors.white.withOpacity(0.3)
                        : AppColors.border,
                  ),
                ),
                child: Icon(icon,
                    size: 14,
                    color: active ? Colors.white : AppColors.textMuted),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: active ? Colors.white : AppColors.textPrimary,
                    ),
                  ),
                  Text(
                    sub,
                    style: TextStyle(
                      fontSize: 10,
                      color: active
                          ? Colors.white.withOpacity(0.8)
                          : AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildClassCardGrid(List<SchoolClass> classes) {
    // Group by name
    final byName = <String, List<SchoolClass>>{};
    for (final c in classes) {
      final arr = byName[c.name] ?? [];
      arr.add(c);
      byName[c.name] = arr;
    }

    return byName.entries.map((entry) {
      final name = entry.key;
      final sections = entry.value;
      final studentCount = sections.fold<int>(
          0, (sum, s) => sum + _getStudentCountForClass(s));
      final secCount = sections.length;

      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: GestureDetector(
          onTap: () {
            if (secCount > 1) {
              setState(() {
                _drill = _drill.copyWith(
                  cls: sections.first,
                  clearSection: true,
                );
              });
            } else {
              setState(() {
                _drill = _drill.copyWith(
                  cls: sections.first,
                  section: sections.first,
                );
              });
            }
          },
          child: ConcordiaCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(AppRadii.lg),
                    border: Border.all(
                        color: AppColors.primary.withOpacity(0.2)),
                  ),
                  child: const Icon(Icons.menu_book_rounded,
                      color: AppColors.primary, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          if (secCount > 1)
                            Text(
                              'Sections: ${sections.map((s) => s.section).join(', ')}',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.textMuted),
                            ),
                          if (secCount > 1 && studentCount > 0)
                            const Text(' · ',
                                style: TextStyle(
                                    fontSize: 12, color: AppColors.textMuted)),
                          if (studentCount > 0)
                            Text(
                              '$studentCount students',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.textMuted),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (secCount > 1)
                  ConcordiaBadge(
                    label: '$secCount sections',
                    variant: ConcordiaBadgeVariant.secondary,
                  ),
                const SizedBox(width: 6),
                const Icon(Icons.chevron_right,
                    color: AppColors.textMuted, size: 20),
              ],
            ),
          ),
        ),
      );
    }).toList();
  }

  // ────────────────────────────────────────────────────────────────
  // SECTION CARDS
  // ────────────────────────────────────────────────────────────────

  Widget _buildSectionCards() {
    final sections = _sectionsOfClass;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _buildBreadcrumb(),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_drill.cls!.name} — Select Section',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  const Text(
                    'This class has multiple sections. Pick one to view its students.',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        // Section cards in a 2-column grid
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.3,
          children: sections.map((s) {
            final count = _getStudentCountForClass(s);
            return GestureDetector(
              onTap: () => setState(() {
                _drill = _drill.copyWith(section: s);
              }),
              child: ConcordiaCard(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(AppRadii.xl),
                        border: Border.all(
                            color: AppColors.primary.withOpacity(0.2)),
                      ),
                      child: Center(
                        child: Text(
                          s.section,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Section ${s.section}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (count > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        '$count students',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.textMuted),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // ────────────────────────────────────────────────────────────────
  // STUDENT TABLE
  // ────────────────────────────────────────────────────────────────

  Widget _buildStudentTable() {
    final students = _tableStudents;
    final target = _drill.section ?? _drill.cls!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _buildBreadcrumb(),
        const SizedBox(height: 12),
        ConcordiaCard(
          title: '${target.name} · Section ${target.section}',
          headerSubtitle: Text(
            '${students.length} student${students.length == 1 ? '' : 's'} enrolled',
            style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
          child: students.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: EmptyState(
                    icon: Icons.people_outline,
                    title: 'No students in this class yet',
                    subtitle:
                        'Enroll students from the New Enrollment tab to populate this class.',
                  ),
                )
              : Column(
                  children: students
                      .map((s) => _buildStudentRow(s))
                      .toList(),
                ),
        ),
      ],
    );
  }

  Widget _buildStudentRow(User s) {
    final active = s.blocked == 0 && s.status == 'Active';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ListRow(
        title: s.name,
        subtitle: [
          if ((s.rollNo ?? '').isNotEmpty) 'Roll # ${s.rollNo}',
          if ((s.fatherName ?? '').isNotEmpty) s.fatherName,
          if ((s.guardianPhone ?? '').isNotEmpty) s.guardianPhone,
        ].join(' · '),
        eyebrow: s.className ?? 'Student',
        accentColor: AppColors.primary,
        leading: AppAvatar(
          initials: s.name,
          color: AppColors.primary,
          size: 40,
          useGradient: true,
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _actionIcon(
              Icons.edit_outlined,
              AppColors.primary,
              () => showEditStudentSheet(context, s, onSaved: _load),
              tooltip: 'Edit',
            ),
            const SizedBox(width: 6),
            _actionIcon(
              Icons.folder_open_outlined,
              AppColors.primaryDark,
              () => showDocumentsSheet(context, s),
              tooltip: 'View & Add Docs',
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionIcon(
      IconData icon, Color color, VoidCallback onTap,
      {String? tooltip}) {
    return Tooltip(
      message: tooltip ?? '',
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withOpacity(0.10),
            borderRadius: BorderRadius.circular(AppRadii.sm),
            border: Border.all(color: color.withOpacity(0.22)),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
      ),
    );
  }

  // ────────────────────────────────────────────────────────────────
  // BREADCRUMB
  // ────────────────────────────────────────────────────────────────

  Widget _buildBreadcrumb() {
    final crumbs = <_Crumb>[];
    if (_drill.dept != null) crumbs.add(_Crumb(_drill.dept!));
    if (_drill.dept != null) crumbs.add(_Crumb('Part ${_drill.part}'));
    if (_drill.cls != null) crumbs.add(_Crumb(_drill.cls!.name));
    if (_drill.section != null) {
      crumbs.add(_Crumb('Section ${_drill.section!.section}'));
    }

    return Row(
      children: [
        GestureDetector(
          onTap: () => setState(() {
            _drill = const _Drill();
          }),
          child: const Text(
            'All Departments',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.primary,
            ),
          ),
        ),
        ...crumbs.map((c) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right,
                    size: 14, color: AppColors.textMuted),
                const SizedBox(width: 4),
                Text(
                  c.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: c == crumbs.last
                        ? FontWeight.w700
                        : FontWeight.w500,
                    color: c == crumbs.last
                        ? AppColors.textPrimary
                        : AppColors.textMuted,
                  ),
                ),
              ],
            )),
      ],
    );
  }
}

class _Crumb {
  final String label;
  const _Crumb(this.label);
}

// ════════════════════════════════════════════════════════════════
// DOCUMENTS SHEET — upload / list / download / delete per student
// Mirrors the web DocumentManagerDialog.
// ════════════════════════════════════════════════════════════════

void showDocumentsSheet(BuildContext context, User student) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _DocumentsSheet(student: student),
  );
}

class _DocumentsSheet extends StatefulWidget {
  final User student;
  const _DocumentsSheet({required this.student});

  @override
  State<_DocumentsSheet> createState() => _DocumentsSheetState();
}

class _DocumentsSheetState extends State<_DocumentsSheet> {
  List<Map<String, dynamic>> _docs = [];
  bool _loading = true;
  bool _uploading = false;
  String? _downloadingId;
  String? _deletingId;

  final _docNameCtrl = TextEditingController();
  PlatformFile? _pickedFile;

  static const int _maxBytes = 5 * 1024 * 1024; // 5 MB
  static const List<String> _allowedExtensions = [
    'jpg',
    'jpeg',
    'png',
    'pdf',
    'doc',
    'docx',
  ];

  @override
  void initState() {
    super.initState();
    _loadDocs();
  }

  @override
  void dispose() {
    _docNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadDocs() async {
    setState(() => _loading = true);
    try {
      _docs = await ApiClient().listStudentDocuments(widget.student.id);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
        );
      }
    } catch (_) {
      // ignore — keep empty list
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: _allowedExtensions,
        withData: true,
      );
      if (result == null) return;
      final file = result.files.first;
      if (file.size > _maxBytes) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('File too large. Maximum allowed size is 5 MB.'),
              backgroundColor: AppColors.danger,
            ),
          );
        }
        return;
      }
      setState(() {
        _pickedFile = file;
        if (_docNameCtrl.text.trim().isEmpty) {
          final baseName = file.name.replaceFirst(RegExp(r'\.[^.]+$'), '');
          _docNameCtrl.text = baseName;
        }
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not pick file: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  Future<void> _upload() async {
    final file = _pickedFile;
    if (file == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pick a file first.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }
    final name = _docNameCtrl.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a document name.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }
    if (file.bytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not read file bytes.'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }
    setState(() => _uploading = true);
    try {
      final mime = _mimeTypeForFile(file.name);
      final b64 = base64Encode(file.bytes!);
      final dataUrl = 'data:$mime;base64,$b64';
      await ApiClient().uploadStudentDocument({
        'studentId': widget.student.id,
        'name': name,
        'fileName': file.name,
        'fileType': mime,
        'fileSize': file.size,
        'dataUrl': dataUrl,
      });
      ApiClient().invalidate('student-documents');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Uploaded — $name'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      _docNameCtrl.clear();
      setState(() => _pickedFile = null);
      await _loadDocs();
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
            content: Text('Upload failed: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _download(Map<String, dynamic> doc) async {
    final id = (doc['id'] ?? '').toString();
    setState(() => _downloadingId = id);
    try {
      final res = await ApiClient().downloadStudentDocument(id);
      final dataUrl = res['dataUrl'] as String?;
      if (dataUrl == null || dataUrl.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('No file content returned.'),
              backgroundColor: AppColors.danger,
            ),
          );
        }
        return;
      }
      final uri = Uri.parse(dataUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.platformDefault);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Could not open file.'),
              backgroundColor: AppColors.danger,
            ),
          );
        }
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
            content: Text('Download failed: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadingId = null);
    }
  }

  Future<void> _delete(Map<String, dynamic> doc) async {
    final id = (doc['id'] ?? '').toString();
    final name = (doc['name'] ?? 'document').toString();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.lg)),
        title: const Text('Delete Document?'),
        content: Text('Delete "$name"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style:
                TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _deletingId = id);
    try {
      await ApiClient().deleteStudentDocument(id);
      ApiClient().invalidate('student-documents');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Document deleted — $name'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      await _loadDocs();
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
            content: Text('Delete failed: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _deletingId = null);
    }
  }

  String _mimeTypeForFile(String fileName) {
    final ext = fileName.toLowerCase().split('.').last;
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'pdf':
        return 'application/pdf';
      case 'doc':
        return 'application/msword';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return 'application/octet-stream';
    }
  }

  String _formatFileSize(dynamic bytes) {
    if (bytes == null) return '—';
    final b = (bytes is num) ? bytes.toInt() : int.tryParse('$bytes') ?? 0;
    if (b < 1024) return '$b B';
    if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
    return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.student;
    final subtitle = <String>[
      if ((s.rollNo ?? '').isNotEmpty) 'Roll # ${s.rollNo}',
      if ((s.className ?? '').isNotEmpty) s.className!,
      if ((s.section ?? '').isNotEmpty) s.section!,
    ].join(' · ');
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      margin: const EdgeInsets.all(12),
      padding: EdgeInsets.only(bottom: bottomInset),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppRadii.xl),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header — gradient bar with student identity
            Container(
              padding: const EdgeInsets.fromLTRB(18, 14, 8, 14),
              decoration: BoxDecoration(
                gradient: appGradient(AppColors.primaryGradient),
                borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppRadii.xl)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.folder_open_rounded,
                      color: Colors.white, size: 22),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          s.name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (subtitle.isNotEmpty)
                          Text(
                            subtitle,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.white.withOpacity(0.9),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        const SizedBox(height: 2),
                        const Text(
                          'Student Documents',
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.white70,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ],
              ),
            ),
            // Body — docs list + upload form (scrollable)
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Existing Documents${_docs.isNotEmpty ? ' (${_docs.length})' : ''}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 300),
                      child: _loading
                          ? const Center(
                              child: Padding(
                                padding: EdgeInsets.all(24),
                                child: CircularProgressIndicator(
                                    color: AppColors.primary),
                              ),
                            )
                          : _docs.isEmpty
                              ? Container(
                                  padding: const EdgeInsets.all(24),
                                  decoration: BoxDecoration(
                                    color: AppColors.surfaceAlt,
                                    borderRadius: BorderRadius.circular(
                                        AppRadii.md),
                                    border: Border.all(
                                        color: AppColors.border),
                                  ),
                                  child: Column(
                                    children: [
                                      const Icon(
                                          Icons.description_outlined,
                                          size: 28,
                                          color: AppColors.textMuted),
                                      const SizedBox(height: 8),
                                      const Text(
                                        'No documents uploaded yet.',
                                        style: TextStyle(
                                            fontSize: 12.5,
                                            color:
                                                AppColors.textSecondary),
                                      ),
                                    ],
                                  ),
                                )
                              : ListView.separated(
                                  shrinkWrap: true,
                                  itemCount: _docs.length,
                                  separatorBuilder: (_, __) =>
                                      const Divider(
                                          height: 1,
                                          color: AppColors.border),
                                  itemBuilder: (_, i) {
                                    final d = _docs[i];
                                    final id =
                                        (d['id'] ?? '').toString();
                                    final name = (d['name'] ??
                                            'Document')
                                        .toString();
                                    final fileName =
                                        (d['fileName'] ?? '—')
                                            .toString();
                                    final size =
                                        _formatFileSize(d['fileSize']);
                                    final uploadedByName =
                                        (d['uploadedByName'] ?? '')
                                            .toString();
                                    final createdAt =
                                        d['createdAt'];
                                    final meta = <String>[
                                      fileName,
                                      size,
                                      if (uploadedByName.isNotEmpty)
                                        'by $uploadedByName',
                                      if (createdAt != null)
                                        formatDate(createdAt),
                                    ].join(' · ');
                                    return Padding(
                                      padding:
                                          const EdgeInsets.symmetric(
                                              vertical: 8),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 36,
                                            height: 36,
                                            decoration: BoxDecoration(
                                              color:
                                                  AppColors.primarySoft,
                                              borderRadius:
                                                  BorderRadius.circular(
                                                      AppRadii.sm),
                                            ),
                                            child: const Icon(
                                                Icons
                                                    .description_outlined,
                                                size: 18,
                                                color:
                                                    AppColors.primary),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment
                                                      .start,
                                              mainAxisSize:
                                                  MainAxisSize.min,
                                              children: [
                                                Text(
                                                  name,
                                                  style:
                                                      const TextStyle(
                                                    fontSize: 13.5,
                                                    fontWeight:
                                                        FontWeight
                                                            .w700,
                                                    color: AppColors
                                                        .textPrimary,
                                                  ),
                                                  maxLines: 1,
                                                  overflow: TextOverflow
                                                      .ellipsis,
                                                ),
                                                const SizedBox(
                                                    height: 2),
                                                Text(
                                                  meta,
                                                  style:
                                                      const TextStyle(
                                                    fontSize: 11,
                                                    color: AppColors
                                                        .textSecondary,
                                                  ),
                                                  maxLines: 2,
                                                  overflow: TextOverflow
                                                      .ellipsis,
                                                ),
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          _docAction(
                                            icon:
                                                Icons.download_outlined,
                                            color: AppColors.primary,
                                            onTap: _downloadingId == id
                                                ? null
                                                : () => _download(d),
                                            loading:
                                                _downloadingId == id,
                                          ),
                                          const SizedBox(width: 6),
                                          _docAction(
                                            icon:
                                                Icons.delete_outline,
                                            color: AppColors.danger,
                                            onTap: _deletingId == id
                                                ? null
                                                : () => _delete(d),
                                            loading:
                                                _deletingId == id,
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                    ),
                    const SizedBox(height: 18),
                    // Upload form
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft.withOpacity(0.40),
                        borderRadius:
                            BorderRadius.circular(AppRadii.md),
                        border: Border.all(
                            color: AppColors.primary.withOpacity(0.30)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.upload_file,
                                  size: 16,
                                  color: AppColors.primaryDark),
                              const SizedBox(width: 6),
                              const Text(
                                'Upload New Document',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primaryDark,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ConcordiaInput(
                            hintText: 'Document name (e.g. Father CNIC)',
                            controller: _docNameCtrl,
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ConcordiaButton(
                              label: _pickedFile == null
                                  ? 'Pick File'
                                  : _pickedFile!.name,
                              variant: ConcordiaButtonVariant.outline,
                              icon: Icons.attach_file,
                              onPressed:
                                  _uploading ? null : _pickFile,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Accepted: JPG, PNG, PDF, DOC, DOCX · max 5 MB',
                            style: TextStyle(
                                fontSize: 11,
                                color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    // Upload button
                    SizedBox(
                      width: double.infinity,
                      child: ConcordiaButton(
                        label: 'Upload Document',
                        icon: Icons.cloud_upload_outlined,
                        large: true,
                        loading: _uploading,
                        onPressed: _uploading ? null : _upload,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _docAction({
    required IconData icon,
    required Color color,
    VoidCallback? onTap,
    bool loading = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: color.withOpacity(0.10),
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
        child: loading
            ? Padding(
                padding: const EdgeInsets.all(7),
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: color),
                ),
              )
            : Icon(icon, size: 18, color: color),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════
// EDIT STUDENT SHEET — name / father / phone / address
// Calls api.updateUser.
// ════════════════════════════════════════════════════════════════

void showEditStudentSheet(BuildContext context, User student,
    {VoidCallback? onSaved}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => _EditStudentSheet(student: student, onSaved: onSaved),
  );
}

class _EditStudentSheet extends StatefulWidget {
  final User student;
  final VoidCallback? onSaved;
  const _EditStudentSheet({required this.student, this.onSaved});

  @override
  State<_EditStudentSheet> createState() => _EditStudentSheetState();
}

class _EditStudentSheetState extends State<_EditStudentSheet> {
  late final TextEditingController _name;
  late final TextEditingController _father;
  late final TextEditingController _phone;
  late final TextEditingController _address;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: widget.student.name);
    _father = TextEditingController(text: widget.student.fatherName ?? '');
    _phone = TextEditingController(text: widget.student.guardianPhone ?? '');
    _address = TextEditingController(text: widget.student.address ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _father.dispose();
    _phone.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ApiClient().updateUser(widget.student.id, {
        'name': _name.text.trim(),
        'fatherName': _father.text.trim(),
        'guardianPhone': _phone.text.trim(),
        'address': _address.text.trim(),
      });
      ApiClient().invalidate('platform/users');
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Student updated'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      widget.onSaved?.call();
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
            content: Text('Update failed: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      margin: const EdgeInsets.all(12),
      padding: EdgeInsets.fromLTRB(18, 18, 18, bottomInset + 22),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppRadii.xl),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
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
            // Title
            Row(
              children: [
                const Icon(Icons.edit_outlined,
                    color: AppColors.primary, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Edit Student',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.student.name,
                        style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            // Form fields using ConcordiaInput
            ConcordiaInput(
              label: 'Full Name',
              controller: _name,
              prefixIcon: const Icon(Icons.person_outline, size: 20),
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: "Father's Name",
              controller: _father,
              prefixIcon:
                  const Icon(Icons.family_restroom, size: 20),
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Guardian Phone',
              controller: _phone,
              keyboardType: TextInputType.phone,
              prefixIcon:
                  const Icon(Icons.phone_outlined, size: 20),
            ),
            const SizedBox(height: 12),
            ConcordiaInput(
              label: 'Address',
              controller: _address,
              maxLines: 2,
              prefixIcon:
                  const Icon(Icons.location_on_outlined, size: 20),
            ),
            const SizedBox(height: 20),
            // Save button
            SizedBox(
              width: double.infinity,
              child: ConcordiaButton(
                label: 'Save Changes',
                icon: Icons.check_rounded,
                large: true,
                loading: _busy,
                onPressed: _busy ? null : _save,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
