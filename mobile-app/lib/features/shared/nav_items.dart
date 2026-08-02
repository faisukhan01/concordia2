// Navigation items per role — mirrors the web app's sidebar
// (src/lib/role-modules.ts) exactly. Every module in the web app is
// represented here. For roles with >5 modules, the RoleShell shows
// the first 4 + a "More" tab that opens a bottom sheet with the rest.
//
// The `group` field matches the web app's sidebar section headers so the
// mobile sidebar can render them identically.

import 'package:flutter/material.dart';
import '../admin/admin_portal.dart';
import '../accountant/accountant_portal.dart';
import '../admissions/admissions_portal.dart';
import '../academic/academic_portal.dart';
import '../teacher/teacher_portal.dart';
import '../student/student_portal.dart';
import 'additional_modules.dart';

// ── Per-portal tab enums (shared across nav + portal files) ──
enum AdminTab { dashboard, students, fees, academic, announcements }
enum AdmissionsTab { dashboard, newEnrollment, records }
enum AccountantTab { dashboard, fees, misc, logins }
enum AcademicTab { dashboard, classes, timetable, exams, results }
enum TeacherTab { dashboard, classes, attendance, results, announcements }
enum StudentTab { dashboard, fees, results, attendance, timetable }

class NavItem {
  final String id;
  final String label;
  final String shortLabel;
  final IconData icon;
  final IconData? activeIcon;
  final String? group; // Sidebar section header (matches web app groups)
  final Widget Function(BuildContext) builder;

  const NavItem({
    required this.id,
    required this.label,
    required this.shortLabel,
    required this.icon,
    this.activeIcon,
    this.group,
    required this.builder,
  });
}

class NavItems {
  static List<NavItem> forRole(String role) {
    switch (role) {
      case 'super-admin':
        return _superAdmin;
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

  // ── Super Admin — PRODUCT OWNER for the whole college (10 modules) ──
  // Groups: Main, College, Oversight, Account
  static final _superAdmin = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'Main',
      builder: (_) => const AdminPortal(),
    ),
    NavItem(
      id: 'branches',
      label: 'Branches & Classes',
      shortLabel: 'Branches',
      icon: Icons.business_outlined,
      activeIcon: Icons.business,
      group: 'College',
      builder: (_) => const SuperBranchesScreen(),
    ),
    NavItem(
      id: 'staff',
      label: 'Office Staff',
      shortLabel: 'Staff',
      icon: Icons.manage_accounts_outlined,
      activeIcon: Icons.manage_accounts,
      group: 'College',
      builder: (_) => const SuperStaffScreen(),
    ),
    NavItem(
      id: 'teachers',
      label: 'Teachers',
      shortLabel: 'Teachers',
      icon: Icons.people_outline,
      activeIcon: Icons.people,
      group: 'College',
      builder: (_) => const SuperTeachersScreen(),
    ),
    NavItem(
      id: 'students',
      label: 'Students',
      shortLabel: 'Students',
      icon: Icons.school_outlined,
      activeIcon: Icons.school,
      group: 'College',
      builder: (_) => const SuperStudentsScreen(),
    ),
    NavItem(
      id: 'announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      group: 'Oversight',
      builder: (_) => const SuperAnnouncementsScreen(),
    ),
    NavItem(
      id: 'fees',
      label: 'Fee Collection',
      shortLabel: 'Fees',
      icon: Icons.account_balance_wallet_outlined,
      activeIcon: Icons.account_balance_wallet,
      group: 'Oversight',
      builder: (_) => const SuperFeesScreen(),
    ),
    NavItem(
      id: 'attendance',
      label: 'Attendance',
      shortLabel: 'Attend',
      icon: Icons.check_circle_outline,
      activeIcon: Icons.check_circle,
      group: 'Oversight',
      builder: (_) => const SuperAttendanceScreen(),
    ),
    NavItem(
      id: 'results',
      label: 'Results',
      shortLabel: 'Results',
      icon: Icons.emoji_events_outlined,
      activeIcon: Icons.emoji_events,
      group: 'Oversight',
      builder: (_) => const SuperResultsScreen(),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];

  // ── Admin — oversees all sub-portals (mirrors web app sidebar exactly) ──
  // The admin sidebar now shows ALL modules from every sub-portal, just like
  // the web app. Groups: Main, Admission Office, Accountant, Academic Office, Account
  static final _admin = [
    NavItem(
      id: 'admin-dashboard',
      label: 'Admin Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'Main',
      builder: (_) => const AdminPortal(),
    ),
    NavItem(
      id: 'admissions-new',
      label: 'New Enrollment',
      shortLabel: 'Enroll',
      icon: Icons.person_add_outlined,
      activeIcon: Icons.person_add,
      group: 'Admission Office',
      builder: (_) => const AdmissionsPortal(
          initialTab: AdmissionsTab.newEnrollment),
    ),
    NavItem(
      id: 'admissions-students',
      label: 'Student Records',
      shortLabel: 'Records',
      icon: Icons.people_outline,
      activeIcon: Icons.people,
      group: 'Admission Office',
      builder: (_) => const AdmissionsPortal(
          initialTab: AdmissionsTab.records),
    ),
    NavItem(
      id: 'accountant-challans',
      label: 'Fee & Installments',
      shortLabel: 'Fees',
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long,
      group: 'Accountant',
      builder: (_) => const AccountantPortal(
          initialTab: AccountantTab.fees),
    ),
    NavItem(
      id: 'accountant-misc',
      label: 'Misc Charges',
      shortLabel: 'Charges',
      icon: Icons.add_circle_outline,
      activeIcon: Icons.add_circle,
      group: 'Accountant',
      builder: (_) => const AccountantPortal(
          initialTab: AccountantTab.misc),
    ),
    NavItem(
      id: 'accountant-logins',
      label: 'Create Student Logins',
      shortLabel: 'Logins',
      icon: Icons.vpn_key_outlined,
      activeIcon: Icons.vpn_key,
      group: 'Accountant',
      builder: (_) => const AccountantPortal(
          initialTab: AccountantTab.logins),
    ),
    NavItem(
      id: 'academic-announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      group: 'Academic Office',
      builder: (_) => const AnnouncementsViewScreen(),
    ),
    NavItem(
      id: 'academic-classes',
      label: 'Classes & Teachers',
      shortLabel: 'Classes',
      icon: Icons.class_outlined,
      activeIcon: Icons.class_,
      group: 'Academic Office',
      builder: (_) => const AcademicPortal(
          initialTab: AcademicTab.classes),
    ),
    NavItem(
      id: 'timetable',
      label: 'Timetable',
      shortLabel: 'Timetable',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      group: 'Academic Office',
      builder: (_) => const AcademicPortal(
          initialTab: AcademicTab.timetable),
    ),
    NavItem(
      id: 'academic-exams',
      label: 'Exams & Date Sheets',
      shortLabel: 'Exams',
      icon: Icons.assignment_outlined,
      activeIcon: Icons.assignment,
      group: 'Academic Office',
      builder: (_) => const AcademicPortal(
          initialTab: AcademicTab.exams),
    ),
    NavItem(
      id: 'report-cards',
      label: 'Result Cards',
      shortLabel: 'Results',
      icon: Icons.description_outlined,
      activeIcon: Icons.description,
      group: 'Academic Office',
      builder: (_) => const AcademicPortal(
          initialTab: AcademicTab.results),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];

  // ── Admissions Office ──
  // Groups: Enrollment, Account
  static final _admissions = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'Enrollment',
      builder: (_) => const AdmissionsPortal(),
    ),
    NavItem(
      id: 'new-enrollment',
      label: 'New Enrollment',
      shortLabel: 'Enroll',
      icon: Icons.person_add_outlined,
      activeIcon: Icons.person_add,
      group: 'Enrollment',
      builder: (_) => const AdmissionsPortal(initialTab: AdmissionsTab.newEnrollment),
    ),
    NavItem(
      id: 'students',
      label: 'Student Records',
      shortLabel: 'Records',
      icon: Icons.people_outline,
      activeIcon: Icons.people,
      group: 'Enrollment',
      builder: (_) => const AdmissionsPortal(initialTab: AdmissionsTab.records),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];

  // ── Accountant ──
  // Groups: Finance, Account
  static final _accountant = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'Finance',
      builder: (_) => const AccountantPortal(),
    ),
    NavItem(
      id: 'fees',
      label: 'Fee & Installments',
      shortLabel: 'Fees',
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long,
      group: 'Finance',
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.fees),
    ),
    NavItem(
      id: 'misc',
      label: 'Misc Charges',
      shortLabel: 'Charges',
      icon: Icons.add_circle_outline,
      activeIcon: Icons.add_circle,
      group: 'Finance',
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.misc),
    ),
    NavItem(
      id: 'logins',
      label: 'Create Student Logins',
      shortLabel: 'Logins',
      icon: Icons.vpn_key_outlined,
      activeIcon: Icons.vpn_key,
      group: 'Finance',
      builder: (_) => const AccountantPortal(initialTab: AccountantTab.logins),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];

  // ── Academic Office ──
  // Groups: Overview, Classes & Academics, Account
  static final _academic = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'Overview',
      builder: (_) => const AcademicPortal(),
    ),
    NavItem(
      id: 'announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      group: 'Overview',
      builder: (_) => const AnnouncementsViewScreen(),
    ),
    NavItem(
      id: 'classes',
      label: 'Classes & Teachers',
      shortLabel: 'Classes',
      icon: Icons.class_outlined,
      activeIcon: Icons.class_,
      group: 'Classes & Academics',
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.classes),
    ),
    NavItem(
      id: 'timetable',
      label: 'Timetable',
      shortLabel: 'Timetable',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      group: 'Classes & Academics',
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.timetable),
    ),
    NavItem(
      id: 'exams',
      label: 'Exams & Date Sheets',
      shortLabel: 'Exams',
      icon: Icons.assignment_outlined,
      activeIcon: Icons.assignment,
      group: 'Classes & Academics',
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.exams),
    ),
    NavItem(
      id: 'results',
      label: 'Result Cards',
      shortLabel: 'Results',
      icon: Icons.description_outlined,
      activeIcon: Icons.description,
      group: 'Classes & Academics',
      builder: (_) => const AcademicPortal(initialTab: AcademicTab.results),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];

  // ── Teacher ──
  // Groups: Teaching, Account
  static final _teacher = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'Teaching',
      builder: (_) => const TeacherPortal(),
    ),
    NavItem(
      id: 'classes',
      label: 'My Classes',
      shortLabel: 'Classes',
      icon: Icons.class_outlined,
      activeIcon: Icons.class_,
      group: 'Teaching',
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.classes),
    ),
    NavItem(
      id: 'attendance',
      label: 'Attendance',
      shortLabel: 'Attend',
      icon: Icons.check_circle_outline,
      activeIcon: Icons.check_circle,
      group: 'Teaching',
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.attendance),
    ),
    NavItem(
      id: 'results',
      label: 'Test Results',
      shortLabel: 'Results',
      icon: Icons.grade_outlined,
      activeIcon: Icons.grade,
      group: 'Teaching',
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.results),
    ),
    NavItem(
      id: 'feedback',
      label: 'Student Feedback',
      shortLabel: 'Feedback',
      icon: Icons.feedback_outlined,
      activeIcon: Icons.feedback,
      group: 'Teaching',
      builder: (_) => const StudentFeedbackScreen(),
    ),
    NavItem(
      id: 'announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      group: 'Teaching',
      builder: (_) => const TeacherPortal(initialTab: TeacherTab.announcements),
    ),
    NavItem(
      id: 'timetable',
      label: 'My Timetable',
      shortLabel: 'Timetable',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      group: 'Teaching',
      builder: (_) => const TimetableViewScreen(isTeacher: true),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];

  // ── Student / Parent ──
  // Groups: My Portal, Account
  static final _student = [
    NavItem(
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: Icons.dashboard_outlined,
      activeIcon: Icons.dashboard,
      group: 'My Portal',
      builder: (_) => const StudentPortal(),
    ),
    NavItem(
      id: 'fees',
      label: 'My Fees',
      shortLabel: 'Fees',
      icon: Icons.account_balance_wallet_outlined,
      activeIcon: Icons.account_balance_wallet,
      group: 'My Portal',
      builder: (_) => const StudentPortal(initialTab: StudentTab.fees),
    ),
    NavItem(
      id: 'results',
      label: 'My Results',
      shortLabel: 'Results',
      icon: Icons.grade_outlined,
      activeIcon: Icons.grade,
      group: 'My Portal',
      builder: (_) => const StudentPortal(initialTab: StudentTab.results),
    ),
    NavItem(
      id: 'report-card',
      label: 'Report Card',
      shortLabel: 'Report',
      icon: Icons.description_outlined,
      activeIcon: Icons.description,
      group: 'My Portal',
      builder: (_) => const ReportCardsScreen(),
    ),
    NavItem(
      id: 'attendance',
      label: 'My Attendance',
      shortLabel: 'Attend',
      icon: Icons.check_circle_outline,
      activeIcon: Icons.check_circle,
      group: 'My Portal',
      builder: (_) => const StudentPortal(initialTab: StudentTab.attendance),
    ),
    NavItem(
      id: 'timetable',
      label: 'Timetable',
      shortLabel: 'Timetable',
      icon: Icons.calendar_today_outlined,
      activeIcon: Icons.calendar_today,
      group: 'My Portal',
      builder: (_) => const StudentPortal(initialTab: StudentTab.timetable),
    ),
    NavItem(
      id: 'datesheets',
      label: 'Date Sheets',
      shortLabel: 'Dates',
      icon: Icons.event_note_outlined,
      activeIcon: Icons.event_note,
      group: 'My Portal',
      builder: (_) => const DateSheetsScreen(),
    ),
    NavItem(
      id: 'announcements',
      label: 'Announcements',
      shortLabel: 'Announce',
      icon: Icons.campaign_outlined,
      activeIcon: Icons.campaign,
      group: 'My Portal',
      builder: (_) => const AnnouncementsViewScreen(),
    ),
    NavItem(
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings,
      group: 'Account',
      builder: (_) => const SettingsScreen(),
    ),
  ];
}
