// Navigation items per role.
// Each item maps to a screen builder. The list mirrors the web app's
// sidebar (src/lib/role-modules.ts).

import 'package:flutter/material.dart';
import '../admin/admin_portal.dart';
import '../accountant/accountant_portal.dart';
import '../admissions/admissions_portal.dart';
import '../academic/academic_portal.dart';
import '../teacher/teacher_portal.dart';
import '../student/student_portal.dart';

// ── Per-portal tab enums (shared across nav + portal files) ──
enum AdminTab { dashboard, students, fees, academic, announcements }
enum AdmissionsTab { dashboard, newEnrollment, records, feeRecords }
enum AccountantTab { dashboard, students, fees, misc, logins }
enum AcademicTab { dashboard, classes, timetable, exams, results }
enum TeacherTab { dashboard, classes, attendance, results, announcements }
enum StudentTab { dashboard, fees, results, attendance, timetable }

class NavItem {
  final String id;
  final String label;
  final String shortLabel;
  final IconData icon;
  final IconData? activeIcon;
  final Widget Function(BuildContext) builder;

  const NavItem({
    required this.id,
    required this.label,
    required this.shortLabel,
    required this.icon,
    this.activeIcon,
    required this.builder,
  });
}

class NavItems {
  static List<NavItem> forRole(String role) {
    switch (role) {
      case 'super-admin':
      case 'admin':
        return _admin;
      case 'admissions':
        return _admissions;
      case 'accountant':
        return _accountant;
      case 'academic':
        return _academic;
      case 'teacher':
        return _teacher;
      case 'student':
      case 'parent':
        return _student;
      default:
        return _student;
    }
  }

  // ── Admin / Super-Admin ──
  static final _admin = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      builder: (_) => const AdminPortal(),
    ),
    NavItem(
      id: 'students',
      label: 'Students',
      shortLabel: 'Students',
      icon: Icons.people_outline,
      activeIcon: Icons.people,
      builder: (_) => const AdminPortal(initialTab: AdminTab.students),
    ),
    NavItem(
      id: 'fees',
      label: 'Fees',
      shortLabel: 'Fees',
      icon: Icons.account_balance_wallet_outlined,
      activeIcon: Icons.account_balance_wallet,
      builder: (_) => const AdminPortal(initialTab: AdminTab.fees),
    ),
    NavItem(
      id: 'academic',
      label: 'Academics',
      shortLabel: 'Academic',
      icon: Icons.school_outlined,
      activeIcon: Icons.school,
      builder: (_) => const AdminPortal(initialTab: AdminTab.academic),
    ),
    NavItem(
      id: 'announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      builder: (_) => const AdminPortal(initialTab: AdminTab.announcements),
    ),
  ];

  // ── Admissions ──
  static final _admissions = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      builder: (_) => const AdmissionsPortal(),
    ),
    NavItem(
      id: 'new-enrollment',
      label: 'New Enrollment',
      shortLabel: 'Enroll',
      icon: Icons.person_add_outlined,
      activeIcon: Icons.person_add,
      builder: (_) => const AdmissionsPortal(initialTab: AdmissionsTab.newEnrollment),
    ),
    NavItem(
      id: 'students',
      label: 'Student Records',
      shortLabel: 'Records',
      icon: Icons.people_outline,
      activeIcon: Icons.people,
      builder: (_) => const AdmissionsPortal(initialTab: AdmissionsTab.records),
    ),
    NavItem(
      id: 'fee-records',
      label: 'Fee Records',
      shortLabel: 'Fees',
      icon: Icons.account_balance_wallet_outlined,
      activeIcon: Icons.account_balance_wallet,
      builder: (_) => const AdmissionsPortal(initialTab: AdmissionsTab.feeRecords),
    ),
  ];

  // ── Accountant ──
  static final _accountant = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      builder: (_) => const AccountantPortal(),
    ),
    NavItem(
      id: 'students',
      label: 'Students',
      shortLabel: 'Students',
      icon: Icons.people_outline,
      activeIcon: Icons.people,
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.students),
    ),
    NavItem(
      id: 'fees',
      label: 'Fee & Installments',
      shortLabel: 'Fees',
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long,
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.fees),
    ),
    NavItem(
      id: 'misc',
      label: 'Misc Charges',
      shortLabel: 'Charges',
      icon: Icons.add_circle_outline,
      activeIcon: Icons.add_circle,
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.misc),
    ),
    NavItem(
      id: 'logins',
      label: 'Create Logins',
      shortLabel: 'Logins',
      icon: Icons.vpn_key_outlined,
      activeIcon: Icons.vpn_key,
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.logins),
    ),
  ];

  // ── Academic Office ──
  static final _academic = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      builder: (_) => const AcademicPortal(),
    ),
    NavItem(
      id: 'classes',
      label: 'Classes',
      shortLabel: 'Classes',
      icon: Icons.class_outlined,
      activeIcon: Icons.class_,
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.classes),
    ),
    NavItem(
      id: 'timetable',
      label: 'Timetable',
      shortLabel: 'Timetable',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.timetable),
    ),
    NavItem(
      id: 'exams',
      label: 'Exams',
      shortLabel: 'Exams',
      icon: Icons.assignment_outlined,
      activeIcon: Icons.assignment,
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.exams),
    ),
    NavItem(
      id: 'results',
      label: 'Report Cards',
      shortLabel: 'Results',
      icon: Icons.description_outlined,
      activeIcon: Icons.description,
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.results),
    ),
  ];

  // ── Teacher ──
  static final _teacher = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      builder: (_) => const TeacherPortal(),
    ),
    NavItem(
      id: 'classes',
      label: 'My Classes',
      shortLabel: 'Classes',
      icon: Icons.class_outlined,
      activeIcon: Icons.class_,
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.classes),
    ),
    NavItem(
      id: 'attendance',
      label: 'Attendance',
      shortLabel: 'Attend',
      icon: Icons.check_circle_outline,
      activeIcon: Icons.check_circle,
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.attendance),
    ),
    NavItem(
      id: 'results',
      label: 'Test Results',
      shortLabel: 'Results',
      icon: Icons.grade_outlined,
      activeIcon: Icons.grade,
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.results),
    ),
    NavItem(
      id: 'announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.announcements),
    ),
  ];

  // ── Student / Parent ──
  static final _student = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      builder: (_) => const StudentPortal(),
    ),
    NavItem(
      id: 'fees',
      label: 'My Fees',
      shortLabel: 'Fees',
      icon: Icons.account_balance_wallet_outlined,
      activeIcon: Icons.account_balance_wallet,
      builder: (_) => const StudentPortal(initialTab: StudentTab.fees),
    ),
    NavItem(
      id: 'results',
      label: 'My Results',
      shortLabel: 'Results',
      icon: Icons.grade_outlined,
      activeIcon: Icons.grade,
      builder: (_) => const StudentPortal(initialTab: StudentTab.results),
    ),
    NavItem(
      id: 'attendance',
      label: 'My Attendance',
      shortLabel: 'Attend',
      icon: Icons.check_circle_outline,
      activeIcon: Icons.check_circle,
      builder: (_) => const StudentPortal(initialTab: StudentTab.attendance),
    ),
    NavItem(
      id: 'timetable',
      label: 'Timetable',
      shortLabel: 'Timetable',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      builder: (_) => const StudentPortal(initialTab: StudentTab.timetable),
    ),
  ];
}
