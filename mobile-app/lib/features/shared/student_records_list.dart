// Concordia College — Shared Student Records list (Admissions + Accountant).
// Mirrors the web app's StudentRecordsView (src/components/portal/admissions-portal.tsx).
//
// Provides:
//   • StudentRecordsList — searchable, flat list of students with Edit +
//     View & Add Docs buttons per row (single-color Concordia orange theme).
//   • showDocumentsSheet() — modal bottom sheet to upload/list/download/
//     delete per-student documents (mirrors web DocumentManagerDialog).
//   • showEditStudentSheet() — modal bottom sheet to edit a student's
//     name / father name / contact / address (calls api.updateUser).
//
// Both the Admissions portal's `_AdRecords` tab and the Accountant portal's
// `accountant-students` tab render this widget so the two portals stay in
// perfect sync — the same Student Records page, the same documents flow.

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
// STUDENT RECORDS LIST — shared by Admissions + Accountant
// ════════════════════════════════════════════════════════════════

class StudentRecordsList extends StatefulWidget {
  const StudentRecordsList({super.key});

  @override
  State<StudentRecordsList> createState() => _StudentRecordsListState();
}

class _StudentRecordsListState extends State<StudentRecordsList> {
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
      _error = 'Failed to load students';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<String> get _classOptions {
    final set = <String>{};
    for (final s in _students) {
      final c = (s.className ?? '').trim();
      if (c.isNotEmpty) set.add(c);
    }
    final list = set.toList()..sort();
    return ['All', ...list];
  }

  List<User> get _filtered {
    return _students.where((s) {
      if (_classFilter != 'All' &&
          (s.className ?? '').trim() != _classFilter) {
        return false;
      }
      if (_query.isEmpty) return true;
      final q = _query.toLowerCase();
      return s.name.toLowerCase().contains(q) ||
          (s.rollNo ?? '').toLowerCase().contains(q) ||
          (s.className ?? '').toLowerCase().contains(q) ||
          (s.fatherName ?? '').toLowerCase().contains(q) ||
          (s.cnic ?? '').toLowerCase().contains(q) ||
          (s.program ?? '').toLowerCase().contains(q);
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
                hintText: 'Search by name, roll #, class, CNIC…',
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
                    subtitle: 'Try a different search or class filter',
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) {
                      final s = filtered[i];
                      final active = s.blocked == 0 && s.status == 'Active';
                      final subtitle = <String>[
                        if ((s.rollNo ?? '').isNotEmpty) s.rollNo!,
                        if ((s.className ?? '').isNotEmpty) s.className!,
                        if ((s.section ?? '').isNotEmpty) s.section!,
                        if ((s.program ?? '').isNotEmpty) s.program!,
                      ].join(' · ');
                      return ListRow(
                        title: s.name,
                        subtitle: subtitle.isEmpty ? '—' : subtitle,
                        eyebrow: s.className ?? 'Student',
                        accentColor: AppColors.primary,
                        onTap: () => _showStudentDetail(context, s),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _actionIcon(
                              Icons.edit_outlined,
                              AppColors.primary,
                              () =>
                                  showEditStudentSheet(context, s, onSaved: _load),
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
                      );
                    },
                  ),
          ),
        ],
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

  void _showStudentDetail(BuildContext context, User s) {
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
                _detailSection(
                    Icons.contact_phone_rounded, 'Contact & Demographics', [
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
                    s.baseFee != null ? formatMoneyFull(s.baseFee!) : '—',
                  ),
                  _DetailRow('Fee Locked', s.baseFeeLocked == 1 ? 'Yes' : 'No'),
                ]),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          showEditStudentSheet(context, s, onSaved: _load);
                        },
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        label: const Text('Edit'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppRadii.md),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          showDocumentsSheet(context, s);
                        },
                        icon: const Icon(Icons.folder_open_outlined, size: 18),
                        label: const Text('Documents'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppRadii.md),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
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
    'jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx',
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
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
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
            // Header — student identity
            Container(
              padding: const EdgeInsets.fromLTRB(18, 14, 8, 14),
              decoration: BoxDecoration(
                gradient: appGradient(AppColors.primaryGradient),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
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
                                child: CircularProgressIndicator(),
                              ),
                            )
                          : _docs.isEmpty
                              ? Container(
                                  padding: const EdgeInsets.all(24),
                                  decoration: BoxDecoration(
                                    color: AppColors.surfaceAlt,
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.md),
                                    border:
                                        Border.all(color: AppColors.border),
                                  ),
                                  child: Column(
                                    children: [
                                      const Icon(Icons.description_outlined,
                                          size: 28,
                                          color: AppColors.textMuted),
                                      const SizedBox(height: 8),
                                      const Text(
                                        'No documents uploaded yet.',
                                        style: TextStyle(
                                            fontSize: 12.5,
                                            color: AppColors.textSecondary),
                                      ),
                                    ],
                                  ),
                                )
                              : ListView.separated(
                                  shrinkWrap: true,
                                  itemCount: _docs.length,
                                  separatorBuilder: (_, __) =>
                                      const Divider(height: 1, color: AppColors.border),
                                  itemBuilder: (_, i) {
                                    final d = _docs[i];
                                    final id = (d['id'] ?? '').toString();
                                    final name =
                                        (d['name'] ?? 'Document').toString();
                                    final fileName =
                                        (d['fileName'] ?? '—').toString();
                                    final size = _formatFileSize(d['fileSize']);
                                    final uploadedByName =
                                        (d['uploadedByName'] ?? '').toString();
                                    final createdAt = d['createdAt'];
                                    final meta = <String>[
                                      fileName,
                                      size,
                                      if (uploadedByName.isNotEmpty)
                                        'by $uploadedByName',
                                      if (createdAt != null)
                                        formatDate(createdAt),
                                    ].join(' · ');
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 8),
                                      child: Row(
                                        children: [
                                          Container(
                                            width: 36,
                                            height: 36,
                                            decoration: BoxDecoration(
                                              color: AppColors.primarySoft,
                                              borderRadius: BorderRadius.circular(
                                                  AppRadii.sm),
                                            ),
                                            child: const Icon(
                                                Icons.description_outlined,
                                                size: 18,
                                                color: AppColors.primary),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Text(
                                                  name,
                                                  style: const TextStyle(
                                                    fontSize: 13.5,
                                                    fontWeight: FontWeight.w700,
                                                    color: AppColors.textPrimary,
                                                  ),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                                const SizedBox(height: 2),
                                                Text(
                                                  meta,
                                                  style: const TextStyle(
                                                    fontSize: 11,
                                                    color:
                                                        AppColors.textSecondary,
                                                  ),
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                ),
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 6),
                                          _docAction(
                                            icon: Icons.download_outlined,
                                            color: AppColors.primary,
                                            onTap: _downloadingId == id
                                                ? null
                                                : () => _download(d),
                                            loading: _downloadingId == id,
                                          ),
                                          const SizedBox(width: 6),
                                          _docAction(
                                            icon: Icons.delete_outline,
                                            color: AppColors.danger,
                                            onTap: _deletingId == id
                                                ? null
                                                : () => _delete(d),
                                            loading: _deletingId == id,
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
                        borderRadius: BorderRadius.circular(AppRadii.md),
                        border: Border.all(
                            color:
                                AppColors.primary.withOpacity(0.30)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.upload_file,
                                  size: 16, color: AppColors.primaryDark),
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
                          TextField(
                            controller: _docNameCtrl,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              hintText: 'Document name (e.g. Father CNIC)',
                              isDense: true,
                              prefixIcon:
                                  Icon(Icons.label_outline, size: 18),
                            ),
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: _uploading ? null : _pickFile,
                              icon: const Icon(Icons.attach_file, size: 18),
                              label: Text(
                                _pickedFile == null
                                    ? 'Pick File'
                                    : _pickedFile!.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                side: const BorderSide(
                                    color: AppColors.primary),
                                padding:
                                    const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.md),
                                ),
                              ),
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
                    // Upload button — full-width gradient
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: appGradient(AppColors.primaryGradient),
                          borderRadius: BorderRadius.circular(AppRadii.md),
                          boxShadow: AppShadows.button,
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius:
                                BorderRadius.circular(AppRadii.md),
                            onTap: _uploading ? null : _upload,
                            child: Center(
                              child: _uploading
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
                                        Icon(Icons.cloud_upload_outlined,
                                            color: Colors.white, size: 20),
                                        SizedBox(width: 8),
                                        Text(
                                          'Upload Document',
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white,
                                          ),
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ),
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
            TextField(
              controller: _name,
              decoration: const InputDecoration(
                labelText: 'Full Name',
                prefixIcon: Icon(Icons.person_outline, size: 20),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _father,
              decoration: const InputDecoration(
                labelText: "Father's Name",
                prefixIcon: Icon(Icons.family_restroom, size: 20),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Guardian Phone',
                prefixIcon: Icon(Icons.phone_outlined, size: 20),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _address,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Address',
                prefixIcon: Icon(Icons.location_on_outlined, size: 20),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: Container(
                decoration: BoxDecoration(
                  gradient: appGradient(AppColors.primaryGradient),
                  borderRadius: BorderRadius.circular(AppRadii.md),
                  boxShadow: AppShadows.button,
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    onTap: _busy ? null : _save,
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
                                Icon(Icons.check_rounded,
                                    color: Colors.white, size: 20),
                                SizedBox(width: 8),
                                Text(
                                  'Save Changes',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
