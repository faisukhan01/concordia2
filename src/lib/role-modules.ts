// Role-scoped module catalogs — each role sees a different sidebar.
// Concordia College structure per the Admin Management System spec (v1.0):
//   Admin, Admission Office, Accountant, Academic Office, Teacher, Student, Parent
//
// DESIGN PHILOSOPHY (per document v1.0):
//   Each role has a MINIMAL, clearly-scoped set of modules matching its
//   permissions. No legacy modules (e-learning, exam-portal, digital-id,
//   campus-wallet, diary, sms, complaint-portal, transport, health-records,
//   ptm) — those are not in the spec.
//
// ADMIN HUB:
//   The Admin sidebar does NOT expand every sub-portal's modules as
//   dropdowns (that was too messy). Instead it has a single "Portals"
//   section with 6 entries. Clicking one opens a hub page showing all
//   that role's modules as cards — clean and organized.
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Building2, Network, Users, DollarSign, TrendingUp, Settings, ShieldCheck,
  CalendarCheck, GraduationCap, BookOpen, MessageSquare, Trophy,
  ClipboardList, FileText, Bell, CreditCard, Calendar, Award,
  UserPlus, UserCog, Receipt, CalendarDays, Megaphone, KeyRound,
  MessageCircle, FileSpreadsheet, Inbox, CheckCircle2,
  LifeBuoy,
  Download as DownloadIcon,
} from 'lucide-react';

export type RoleModule = {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
};

export type RoleModuleGroup = {
  group: string;
  items: RoleModule[];
  // `flat: true` → render items directly without a collapsible dropdown header.
  // Used for single-item groups like "Admin Dashboard" or "Settings" that
  // should always be visible (not hidden behind a toggle).
  flat?: boolean;
};

export type RoleModules = {
  [role: string]: RoleModuleGroup[];
};

// Concordia orange professional palette.
const PRIMARY = 'from-primary to-primary/80';
const SECONDARY = 'from-primary/80 to-primary';

export const ROLE_MODULES: RoleModules = {
  // ═══════════════════════════════════════════════════════════════
  // Super Admin — PRODUCT OWNER for the Concordia College platform.
  //
  // The single-institution model replaces the old multi-tenant SaaS
  // provisioning UI. The super admin now monitors the WHOLE college:
  //   • Dashboard         — college-wide stats + recent activity
  //   • Colleges & Access — BLOCK / unblock an entire college's portal
  //   • Branches & Classes — view all branches/classes/courses
  //   • Office Staff      — manage admin/admissions/accountant/academic
  //   • Teachers          — view all teachers, block/unblock, reset pwd
  //   • Students          — view all students, block/unblock, reset pwd
  //   • Announcements     — broadcast college-wide + view history
  //   • Fee Collection    — fee stats + recent invoices
  //   • Attendance        — all attendance records across classes
  //   • Results           — all test results across classes
  //   • Settings          — change own password (handled by role-portal.tsx)
  // ═══════════════════════════════════════════════════════════════
  'super-admin': [
    { group: 'Main', flat: true, items: [
      { id: 'super-dashboard', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
    ]},
    { group: 'College', items: [
      { id: 'super-institutes', name: 'Colleges & Access', icon: ShieldCheck, color: PRIMARY },
      { id: 'super-branches', name: 'Branches & Classes', icon: Building2, color: PRIMARY },
      { id: 'super-staff', name: 'Office Staff', icon: UserCog, color: PRIMARY },
      { id: 'super-teachers', name: 'Teachers', icon: Users, color: PRIMARY },
      { id: 'super-students', name: 'Students', icon: GraduationCap, color: PRIMARY },
    ]},
    { group: 'Oversight', items: [
      { id: 'super-announcements', name: 'Announcements', icon: Megaphone, color: SECONDARY },
      { id: 'super-fees', name: 'Fee Collection', icon: DollarSign, color: SECONDARY },
      { id: 'super-attendance', name: 'Attendance', icon: CheckCircle2, color: SECONDARY },
      { id: 'super-results', name: 'Results', icon: Award, color: SECONDARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════════
  // Admin — top-level, oversees all other roles (spec §1.1)
  //
  // SIDEBAR STRUCTURE (clean & neat, per user spec):
  //   1. Admin Dashboard  (flat single page — monitors the whole institute)
  //   2. Admission Office  (dropdown — sub-portal modules, NO dashboard)
  //   3. Accountant        (dropdown — sub-portal modules, NO dashboard)
  //   4. Academic Office   (dropdown — sub-portal modules, NO dashboard)
  //   5. Settings          (flat single page)
  //
  // The admin does NOT need each sub-portal's dashboard — they monitor
  // everything from their own Admin Dashboard. Dropdowns open on click
  // (not by default). Each sub-portal module ID is namespaced
  // (`role:moduleId`) so the AdminPortal router delegates to the
  // dedicated portal component.
  //
  // Teacher / Student / Parent portals are accessible via cards on the
  // Admin Dashboard (quick-access row) — not as sidebar dropdowns — to
  // keep the sidebar clean.
  // ═══════════════════════════════════════════════════════════════
  'admin': [
    { group: 'Main', flat: true, items: [
      { id: 'admin-dashboard', name: 'Admin Dashboard', icon: LayoutDashboard, color: PRIMARY },
    ]},
    { group: 'Admission Office', items: [
      { id: 'admissions:admissions-new', name: 'New Enrollment', icon: UserPlus, color: PRIMARY },
      { id: 'admissions:admissions-students', name: 'Student Records', icon: GraduationCap, color: PRIMARY },
    ]},
    { group: 'Accountant', items: [
      { id: 'accountant:accountant-new', name: 'New Enrollments', icon: UserPlus, color: PRIMARY },
      { id: 'accountant:accountant-classes', name: 'Classes & Sections', icon: BookOpen, color: PRIMARY },
      { id: 'accountant:accountant-challans', name: 'Fee & Installments', icon: Receipt, color: PRIMARY },
      { id: 'accountant:accountant-misc', name: 'Miscellaneous Charges', icon: DollarSign, color: SECONDARY },
    ]},
    { group: 'Academic Office', items: [
      { id: 'academic:academic-announcements', name: 'Announcements', icon: Megaphone, color: PRIMARY },
      { id: 'academic:academic-classes', name: 'Teachers', icon: BookOpen, color: PRIMARY },
      { id: 'academic:timetable', name: 'Timetable', icon: Calendar, color: SECONDARY },
      { id: 'academic:academic-exams', name: 'Exams & Date Sheets', icon: FileText, color: PRIMARY },
      { id: 'academic:report-cards', name: 'Result Cards', icon: Award, color: PRIMARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
    ]},
  ],

  // ─────────────────────────────────────────────────────────────
  // Admission Office — registers students + finalizes (locks) base fee
  // (spec §2)
  // ─────────────────────────────────────────────────────────────
  'admissions': [
    { group: 'Enrollment', items: [
      { id: 'admissions-overview', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
      { id: 'admissions-new', name: 'New Enrollment', icon: UserPlus, color: PRIMARY },
      { id: 'admissions-students', name: 'Student Records', icon: GraduationCap, color: PRIMARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
    ]},
  ],

  // ─────────────────────────────────────────────────────────────
  // Accountant — fee collection, challans, installments, misc charges
  // (spec §3)
  // ─────────────────────────────────────────────────────────────
  'accountant': [
    { group: 'Finance', items: [
      { id: 'accountant-overview', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
      { id: 'accountant-new', name: 'New Enrollments', icon: UserPlus, color: PRIMARY },
      { id: 'accountant-classes', name: 'Classes & Sections', icon: BookOpen, color: PRIMARY },
      { id: 'admissions:admissions-students', name: 'Student Records', icon: GraduationCap, color: PRIMARY },
      { id: 'accountant-challans', name: 'Fee & Installments', icon: Receipt, color: PRIMARY },
      { id: 'accountant-misc', name: 'Miscellaneous Charges', icon: DollarSign, color: SECONDARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
    ]},
  ],

  // ─────────────────────────────────────────────────────────────
  // Academic Office — teachers, timetables, date sheets, tests, results
  // (spec §4)
  // ─────────────────────────────────────────────────────────────
  // Academic Office — teachers and students are created by the Accountant
  // (Create Logins page), so the Academic Office does NOT have separate
  // Teachers / Students management pages. They DO manage Classes (creating
  // classes/sections), and then focus on: announcements, timetables (with a
  // teacher dropdown of Accountant-created teachers), date sheets, monthly
  // tests, result review, and result cards.
  'academic': [
    { group: 'Overview', items: [
      { id: 'academic-overview', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
      { id: 'academic-announcements', name: 'Announcements', icon: Megaphone, color: PRIMARY },
    ]},
    { group: 'Classes & Academics', items: [
      { id: 'academic-classes', name: 'Teachers', icon: BookOpen, color: PRIMARY },
      { id: 'timetable', name: 'Timetable', icon: Calendar, color: SECONDARY },
      { id: 'academic-exams', name: 'Exams & Date Sheets', icon: FileText, color: PRIMARY },
      { id: 'report-cards', name: 'Result Cards', icon: Award, color: PRIMARY },
    ]},
    // Student Records — the Academic Office can now enroll students with full
    // details and manage their fees, exactly like Admissions + Accountant.
    // These namespaced IDs (role:moduleId) are delegated by AcademicPortal to
    // the dedicated Admissions / Accountant views (no logic duplicated).
    { group: 'Student Records', items: [
      { id: 'admissions:admissions-new', name: 'Add Student', icon: UserPlus, color: PRIMARY },
      { id: 'admissions:admissions-students', name: 'Student Records', icon: GraduationCap, color: PRIMARY },
      { id: 'accountant:accountant-challans', name: 'Fees & Installments', icon: Receipt, color: SECONDARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════════
  // Teacher — manages attendance, results, and feedback for ASSIGNED
  // classes/subjects only (spec §5)
  //
  // Permissions:
  //   ✓ Mark/manage attendance for allocated classes
  //   ✓ Enter and submit test results for allocated subjects
  //   ✓ Give feedback on students
  //   ✓ Post class-specific announcements
  //   ✗ Access classes/subjects outside allocation
  // ═══════════════════════════════════════════════════════════════
  'teacher': [
    { group: 'Teaching', items: [
      { id: 'teacher-dashboard', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
      { id: 'teacher-classes', name: 'My Classes', icon: BookOpen, color: PRIMARY },
      { id: 'teacher-attendance', name: 'Attendance', icon: CalendarCheck, color: PRIMARY },
      { id: 'teacher-results', name: 'Test Results', icon: ClipboardList, color: PRIMARY },
      { id: 'teacher-syllabus', name: 'Syllabus', icon: BookOpen, color: PRIMARY },
      { id: 'teacher-feedback', name: 'Student Feedback', icon: MessageCircle, color: SECONDARY },
      { id: 'teacher-announcements', name: 'Announcements', icon: Megaphone, color: SECONDARY },
      { id: 'teacher-timetable', name: 'My Timetable', icon: Calendar, color: SECONDARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════════
  // Student — view-only access to their own academic data (spec §6.1)
  //
  // Receives notifications of: results, announcements, attendance, date sheets
  // ═══════════════════════════════════════════════════════════════
  'student': [
    { group: 'My Portal', items: [
      { id: 'student-dashboard', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
      { id: 'student-fees', name: 'My Fees', icon: Receipt, color: PRIMARY },
      { id: 'student-results', name: 'My Results', icon: GraduationCap, color: PRIMARY },
      { id: 'student-syllabus', name: 'Syllabus', icon: BookOpen, color: PRIMARY },
      { id: 'student-report-card', name: 'Report Card', icon: Award, color: PRIMARY },
      { id: 'student-attendance', name: 'My Attendance', icon: CalendarCheck, color: SECONDARY },
      { id: 'student-timetable', name: 'Timetable', icon: Calendar, color: SECONDARY },
      { id: 'student-datesheet', name: 'Date Sheets', icon: CalendarDays, color: SECONDARY },
      { id: 'student-announcements', name: 'Announcements', icon: Bell, color: SECONDARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
      { id: 'download-app', name: 'Update App', icon: DownloadIcon, color: SECONDARY },
    ]},
  ],

  // ═══════════════════════════════════════════════════════════════
  // Parent — view-only, mirrors the Student role exactly (spec §6.2).
  //
  // NOTE: Parents log in using the STUDENT's credentials, so there is no
  // separate parent portal UI. The parent role reuses the exact same
  // Student sidebar modules (student-*) and renders the StudentPortal
  // component. See role-portal.tsx → case 'parent'.
  // ═══════════════════════════════════════════════════════════════
  'parent': [
    { group: 'My Portal', items: [
      { id: 'student-dashboard', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
      { id: 'student-fees', name: 'Fees', icon: Receipt, color: PRIMARY },
      { id: 'student-results', name: 'Results', icon: GraduationCap, color: PRIMARY },
      { id: 'student-report-card', name: 'Report Card', icon: Award, color: PRIMARY },
      { id: 'student-attendance', name: 'Attendance', icon: CalendarCheck, color: SECONDARY },
      { id: 'student-timetable', name: 'Timetable', icon: Calendar, color: SECONDARY },
      { id: 'student-datesheet', name: 'Date Sheets', icon: CalendarDays, color: SECONDARY },
      { id: 'student-announcements', name: 'Announcements', icon: Bell, color: SECONDARY },
    ]},
    { group: 'Account', flat: true, items: [
      { id: 'notifications', name: 'Notifications', icon: Bell, color: SECONDARY },
      { id: 'settings', name: 'Settings', icon: Settings, color: SECONDARY },
      { id: 'help', name: 'Help & Support', icon: LifeBuoy, color: SECONDARY },
      { id: 'download-app', name: 'Update App', icon: DownloadIcon, color: SECONDARY },
    ]},
  ],

  // Legacy roles — kept for backward compat but login is blocked in handler.ts
  'institute-admin': [
    { group: 'Institute', items: [
      { id: 'institute-overview', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
    ]},
  ],
  'branch-manager': [
    { group: 'Branch', items: [
      { id: 'branch-overview', name: 'Dashboard', icon: LayoutDashboard, color: PRIMARY },
    ]},
  ],
};

// ─────────────────────────────────────────────────────────────
// SUB-PORTAL MODULE MAP — used by the Admin PortalHub
//
// When the admin clicks a portal entry (e.g. "Admission Office"), the
// hub page shows cards for each module in that role's sidebar. This map
// is the single source of truth — it reuses ROLE_MODULES so the hub
// always matches the dedicated portal's actual modules.
// ─────────────────────────────────────────────────────────────
export const SUB_PORTAL_ROLES = [
  'admissions',
  'accountant',
  'academic',
  'teacher',
  'student',
  'parent',
] as const;

export const SUB_PORTAL_META: Record<string, { label: string; description: string; icon: LucideIcon }> = {
  admissions: { label: 'Admission Office', description: 'Register new students and finalize base fees', icon: UserPlus },
  accountant: { label: 'Accountant', description: 'Manage fee collection, challans, and installments', icon: CreditCard },
  academic:   { label: 'Academic Office', description: 'Manage teachers, timetables, tests, and result cards', icon: BookOpen },
  teacher:    { label: 'Teacher', description: 'Attendance, test results, and feedback for assigned classes', icon: Users },
  student:    { label: 'Student', description: 'View-only access to academic data', icon: GraduationCap },
  parent:     { label: 'Parent', description: 'View-only access, mirrored to the linked student', icon: MessageCircle },
};

export const roleAccent: Record<string, { from: string; to: string; text: string; bg: string }> = {
  'super-admin': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'admin': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'admissions': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'accountant': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'academic': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'teacher': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'student': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
  'parent': { from: 'from-primary', to: 'to-primary/80', text: 'text-primary', bg: 'bg-primary/10' },
};
