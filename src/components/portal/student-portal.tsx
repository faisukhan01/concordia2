'use client';

// ============================================================================
// Concordia College — Student Portal (spec §6.1 + §6.2)
//
// The Student role has VIEW-ONLY access to their own academic data. They
// receive notifications of: results, announcements, attendance, date sheets.
//
// The Parent role (spec §6.2) REUSES this exact portal — parents log in
// with the student's credentials, so there is no separate parent UI. When
// `user.role === 'parent'`, headings swap "My" → "Ward's" / "Your child's".
// Everything else is identical (same data, same view-only posture).
//
// Modules (exactly 7 + `settings` handled by parent RolePortal):
//   1. student-dashboard       — welcome banner + stat cards + recent + quick links
//   2. student-results         — list of all test results (subject, marks, grade, %)
//   3. student-report-card     — published term result cards (view-only, expandable)
//   4. student-attendance      — summary stats + chronological log
//   5. student-timetable       — weekly grid (Mon–Sat × periods), today highlighted
//   6. student-datesheet       — exam date sheets (parsed from announcements)
//   7. student-announcements   — notices targeted at students
//
// Design language (matches teacher-portal / academic / admissions portals):
//   • Flat, restrained — grayscale + a single orange (#F26522) accent.
//   • Orange ONLY for primary actions, active states, the small section
//     accent line, the today's timetable column tint, and small inline
//     progress bars. Never on icon tiles, never as a card background.
//   • No gradients, no glassmorphism, no colored icon tiles, no framer-motion.
//   • White cards on 1px gray borders, rounded-xl, subtle shadow on hover.
//   • Tables: uppercase muted headers, hover row tint, subtle status badges.
//   • Section accent: `h-0.5 w-8 bg-[#F26522] rounded-full mb-3` above each title.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import {
  CalendarCheck,
  GraduationCap,
  Award,
  Bell,
  CalendarDays,
  Calendar,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Megaphone,
  FileText,
  ClipboardList,
  ChevronRight,
  Sparkles,
  Receipt,
  Download,
  Wallet,
  Loader2,
  DollarSign,
} from 'lucide-react';
import { savePdf, fmtMoney as pdfFmtMoney } from '@/lib/pdf-utils';
import { buildConcordiaChallan } from '@/lib/challan';
import dynamic from 'next/dynamic';
const BiometricAttendance = dynamic(() => import('./shared/biometric-attendance'), { ssr: false });

type Props = { activeModule: string; user: any };

// ───────────────────────── Shared constants ─────────────────────────

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Long-list scrollbar — thin, gray, matches the restrained design.
// Applied via cn() on any container with max-h-* + overflow-y-auto.
const SCROLLBAR_CLS =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300';

// ───────────────────────── Ward-aware labels ─────────────────────────

/** Returns the right possessive phrase based on the viewer's role. */
function possessive(user: any, student: string, parent: string): string {
  return user?.role === 'parent' ? parent : student;
}

// ───────────────────────── Shared helpers ─────────────────────────

/** Clean page header: thin orange accent line + h1 + optional muted subtitle. */
function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="h-0.5 w-8 bg-[#F26522] rounded-full mb-3" />
        <h1 className="text-2xl font-bold text-[#1A1A1A] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 flex gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

/** Square KPI card — white bg, contextual icon chip, large value, label below.
 *  v4.1.0: Added `accent` prop for contextual color-coding:
 *    'emerald' (good), 'amber' (warning), 'red' (danger), 'sky' (info), 'primary' (default orange).
 */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'primary',
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'emerald' | 'amber' | 'red' | 'sky' | 'primary';
}) {
  const accentMap = {
    primary: { chip: 'bg-[#FFF4ED]', icon: 'text-[#F26522]', hoverChip: 'bg-[#F26522]', hoverIcon: 'text-white', border: 'hover:border-[#F26522]/30' },
    emerald: { chip: 'bg-emerald-50', icon: 'text-emerald-600', hoverChip: 'bg-emerald-500', hoverIcon: 'text-white', border: 'hover:border-emerald-200' },
    amber:   { chip: 'bg-amber-50',   icon: 'text-amber-600',   hoverChip: 'bg-amber-500',   hoverIcon: 'text-white', border: 'hover:border-amber-200' },
    red:     { chip: 'bg-red-50',     icon: 'text-red-600',     hoverChip: 'bg-red-500',     hoverIcon: 'text-white', border: 'hover:border-red-200' },
    sky:     { chip: 'bg-sky-50',     icon: 'text-sky-600',     hoverChip: 'bg-sky-500',     hoverIcon: 'text-white', border: 'hover:border-sky-200' },
  };
  const a = accentMap[accent];
  return (
    <div className={cn('rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 transition-all hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] group min-h-[88px] sm:min-h-[104px] flex flex-col justify-between', a.border)}>
      <div className="flex items-start justify-between">
        <div className={cn('h-8 w-8 sm:h-9 sm:w-9 rounded-lg grid place-items-center shrink-0 transition-colors', a.chip, `group-hover:${a.hoverChip}`)}>
          <Icon className={cn('h-4 w-4 sm:h-[18px] sm:w-[18px] transition-colors', a.icon, `group-hover:${a.hoverIcon}`)} />
        </div>
      </div>
      <div className="min-w-0 mt-1.5">
        <div className="text-xl sm:text-2xl font-bold text-gray-900 truncate tabular-nums leading-tight">{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5 truncate">{label}</div>
        {sub && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

/** Clean section header — text-sm font-semibold + optional muted desc + action. */
function SectionHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">{title}</h3>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/** Simple loading skeleton — muted gray pulse, no decorations. */
function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-100', className)} />;
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-md" />
      ))}
    </div>
  );
}

function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

function SkeletonStatGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[88px] sm:h-[104px] w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Restrained empty state: small muted icon + title + optional subtitle. */
function EmptyState({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="h-12 w-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-[#1A1A1A]">{title}</p>
      {desc && <p className="text-xs text-gray-500 mt-1 max-w-sm">{desc}</p>}
    </div>
  );
}

function ErrorRow({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mb-3">
        <AlertCircle className="h-5 w-5 text-rose-400" />
      </div>
      <p className="text-sm font-medium text-[#1A1A1A]">{message || 'Something went wrong'}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-4 h-8 border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Try again
        </Button>
      )}
    </div>
  );
}

// ───────────────────────── Formatters & misc ─────────────────────────

const formatDate = (iso?: string | number) => {
  if (!iso) return '';
  try {
    const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const formatDateTime = (iso?: string | number) => {
  if (!iso) return '';
  try {
    const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const relativeTime = (iso?: string | number) => {
  if (!iso) return '';
  try {
    const then = new Date(iso as any).getTime();
    const now = Date.now();
    const diff = Math.round((now - then) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return formatDate(iso);
  } catch {
    return '';
  }
};

/** Derive a readable subject label from a result row.
 *  Backend returns `courseId` (e.g. "CR-DEMO-MATH") — strip prefixes and
 *  prettify. Falls back to 'General' when nothing is available. */
const subjectLabel = (r: any): string => {
  if (r.subject) return r.subject;
  const cid = (r.courseId || '').trim();
  if (!cid) return 'General';
  // Strip common ID prefixes: "CR-DEMO-", "CR-", "C-", etc.
  const cleaned = cid.replace(/^[A-Z]{1,3}-([A-Z]+-)?/, '');
  if (!cleaned) return cid;
  return cleaned.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Compute percentage defensively. Backend demo seed stores `obtained`
 *  but the GET handler returns `marks` — accept either. */
const computePercentage = (r: any): number => {
  const marks = Number(r.marks ?? r.obtained ?? r.obtainedMarks ?? 0);
  const total = Number(r.totalMarks || 100);
  if (!total || isNaN(marks)) return 0;
  return Math.max(0, Math.min(100, Math.round((marks / total) * 100)));
};

/** Map a percentage to a letter grade. */
const computeGrade = (pct: number): string => {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
};

const gradeTone = (grade?: string) => {
  const g = (grade || '').toUpperCase().trim();
  if (!g) return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
  if (g === 'A+' || g === 'A') {
    return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' };
  }
  if (g === 'B' || g === 'C') {
    return { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
  }
  if (g === 'D') {
    return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' };
  }
  if (g === 'F') {
    return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' };
  }
  return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
};

/** Orange-tinted bar — only place we let the accent appear in a data row. */
const barTone = (_pct: number) => 'bg-[#F26522]';

// ───────────────────────── Small shared components ─────────────────────────

function GradeBadge({ grade, large }: { grade?: string; large?: boolean }) {
  const tone = gradeTone(grade);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-semibold tabular-nums',
        tone.bg,
        tone.text,
        tone.border,
        large ? 'h-10 min-w-10 px-3 text-base' : 'h-6 px-2 text-[11px]',
      )}
    >
      {grade || '—'}
    </span>
  );
}

function PercentageBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[60px]">
        <div
          className={cn('h-full rounded-full transition-all', barTone(v))}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 tabular-nums w-9 text-right">{v}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const cls =
    s === 'present' || s === 'upcoming' || s === 'active' || s === 'completed' || s === 'published'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : s === 'absent' || s === 'overdue' || s === 'past' || s === 'missed'
        ? 'bg-rose-50 text-rose-700 border-rose-100'
        : s === 'late' || s === 'pending' || s === 'scheduled'
          ? 'bg-amber-50 text-amber-700 border-amber-100'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize',
        cls,
      )}
    >
      {status || '—'}
    </span>
  );
}

/** Small "scope" pill used on announcements / date sheets. */
function ScopeBadge({ scope, classLabel }: { scope?: string; classLabel?: string }) {
  const s = (scope || 'all').toLowerCase();
  if (s === 'class') {
    return (
      <span className="inline-flex items-center rounded-md border border-[#F26522]/20 bg-[#FFF0E8] px-2 py-0.5 text-[11px] font-medium text-[#F26522]">
        {classLabel ? `Class · ${classLabel}` : 'Class'}
      </span>
    );
  }
  if (s === 'branch') {
    return (
      <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
        Branch
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
      College-wide
    </span>
  );
}

// ───────────────────────── Class ID resolver ─────────────────────────
//
// The user profile doesn't ship `classId` (only `class` name + `section`).
// We resolve the actual classId by listing the branch's classes once and
// matching on name + section. Falls back to undefined → timetable/datesheet
// views render a friendly "class not assigned" empty state.
function useStudentClassId(user: any) {
  const [classId, setClassId] = useState<string | undefined>(user?.classId);
  const [classes, setClasses] = useState<any[]>([]);

  const branchId = user?.branchId;
  const className = user?.class;
  const section = user?.section;

  useEffect(() => {
    let cancelled = false;
    if (!branchId || !className) {
      // Nothing to resolve — keep whatever the user object already had.
      return;
    }
    api
      .getClasses(branchId)
      .then((d: any) => {
        if (cancelled) return;
        const list = Array.isArray(d) ? d : [];
        setClasses(list);
        const match = list.find(
          (c: any) => c.name === className && (!section || c.section === section),
        );
        if (match?.id) setClassId(match.id);
      })
      .catch(() => {
        // Silent — timetable will fall back to "class not assigned" empty state.
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, className, section]);

  return { classId, classes };
}

// ───────────────────────── Router ─────────────────────────

export function StudentPortal({ activeModule, user }: Props) {
  // Strip the `student:` namespace when the admin hub opens this portal.
  const moduleId = activeModule.includes(':')
    ? activeModule.split(':', 2)[1]
    : activeModule;

  // `settings` is rendered by the parent RolePortal.
  if (moduleId === 'settings') return null;

  switch (moduleId) {
    case 'student-dashboard':
      return <StudentDashboard user={user} />;
    case 'student-fees':
      return <StudentFees user={user} />;
    case 'student-results':
      return <StudentResults user={user} />;
    case 'student-syllabus':
      return <StudentSyllabus user={user} />;
    case 'student-report-card':
      return <StudentReportCard user={user} />;
    case 'student-attendance':
      return <StudentAttendance user={user} />;
    case 'student-biometric':
      return <BiometricAttendance user={user} mode="student" />;
    case 'student-timetable':
      return <StudentTimetable user={user} />;
    case 'student-datesheet':
      return <StudentDateSheets user={user} />;
    case 'student-announcements':
      return <StudentAnnouncements user={user} />;
    default:
      return <ComingSoon />;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Syllabus — today's topic posted by teachers, grouped by subject.
// ═══════════════════════════════════════════════════════════════════════

function StudentSyllabus({ user }: { user: any }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSubject, setOpenSubject] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getSyllabus({ program: user?.class, part: user?.part, section: user?.section })
      .then((d) => { if (!cancelled) setEntries(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.class, user?.part, user?.section]);

  // Group entries by subject (course); null/empty → "General".
  const bySubject = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of entries) {
      const key = (e.course || 'General').trim() || 'General';
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([subject, list]) => ({
      subject,
      list: list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    })).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [entries]);

  const openList = openSubject ? (bySubject.find((s) => s.subject === openSubject)?.list || []) : [];

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader title="Syllabus" subtitle="Today's topics your teachers posted — tap a subject to see what was covered." />

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6"><Loader2 className="h-5 w-5 animate-spin text-[#F26522]" /></div>
      ) : entries.length === 0 ? (
        <EmptyState icon={FileText} title="No syllabus yet" desc="When your teachers post today's topic, it will appear here by subject." />
      ) : openSubject ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <button onClick={() => setOpenSubject(null)} className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 rotate-180" /> All subjects
          </button>
          <h3 className="text-base font-bold text-gray-900">{openSubject}</h3>
          <div className="space-y-2">
            {openList.map((e) => (
              <div key={e.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#F26522]">{e.date}</span>
                  {e.teacherName && <span className="text-[11px] text-gray-400">{e.teacherName}</span>}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.content}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bySubject.map(({ subject, list }) => (
            <button
              key={subject}
              onClick={() => setOpenSubject(subject)}
              className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md hover:border-[#F26522]/40 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="h-10 w-10 rounded-lg bg-[#F26522]/10 grid place-items-center"><FileText className="h-5 w-5 text-[#F26522]" /></div>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-900">{subject}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{list.length} entr{list.length === 1 ? 'y' : 'ies'} · latest {list[0]?.date}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Dashboard — welcome banner + stat cards + recent + quick links
// ═══════════════════════════════════════════════════════════════════════

function StudentDashboard({ user }: { user: any }) {
  const { setActiveModule } = useApp();
  const [loading, setLoading] = useState(true);
  const [att, setAtt] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [reportCards, setReportCards] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [notifs, setNotifs] = useState<{ items: any[]; unread: number } | null>(null);
  const [fees, setFees] = useState<any[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  const studentId = user?.id;
  const { classId } = useStudentClassId(user);

  const isParent = user?.role === 'parent';
  const firstName = (user?.name || 'Student').split(' ')[0];
  const wardPrefix = isParent ? "Your child " : '';
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      studentId ? api.getAttendance({ studentId }) : Promise.reject(new Error('no id')),
      studentId ? api.getResults({ studentId }) : Promise.reject(new Error('no id')),
      studentId ? api.getReportCards({ studentId }) : Promise.reject(new Error('no id')),
      api.getAnnouncements(),
      api.getNotifications().catch(() => null),
      studentId ? api.getFeeInvoices(studentId) : Promise.reject(new Error('no id')),
    ]).then(([a, r, rc, an, nf, fe]) => {
      if (cancelled) return;
      if (a.status === 'fulfilled') setAtt(a.value);
      if (r.status === 'fulfilled') {
        const d = r.value;
        setResults(Array.isArray(d) ? d : d?.entries || []);
      }
      if (fe.status === 'fulfilled') setFees(Array.isArray(fe.value) ? fe.value : []);
      if (rc.status === 'fulfilled') setReportCards(Array.isArray(rc.value) ? rc.value : []);
      if (an.status === 'fulfilled') {
        const all = Array.isArray(an.value) ? an.value : [];
        const scoped = filterStudentAnnouncements(all, user, classId).filter(
          (x: any) => !x.title?.startsWith('Date Sheet:'),
        );
        setAnnouncements(scoped);
      }
      if (nf.status === 'fulfilled' && nf.value) setNotifs(nf.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, classId, user, retryCount]);

  const attRate = useMemo(() => {
    if (!att) return null;
    const present = Number(att.present || 0);
    const total = Number(att.total || att.entries?.length || 0);
    if (!total) return null;
    return Math.round((present / total) * 100);
  }, [att]);

  const avgScore = useMemo(() => {
    if (!results.length) return null;
    const sum = results.reduce((s, r) => s + computePercentage(r), 0);
    return Math.round(sum / results.length);
  }, [results]);

  const recentResults = useMemo(
    () =>
      [...results]
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
        .slice(0, 3),
    [results],
  );

  // Fee overview (matches the My Fees page totals).
  const feeSummary = useMemo(() => {
    const totalPayable = fees.reduce((acc, i) => acc + Number(i.amount || 0), 0);
    const paid = fees
      .filter((i) => (i.status || '').toLowerCase() === 'paid')
      .reduce((acc, i) => acc + Number(i.paidAmount || i.amount || 0), 0);
    const outstanding = Math.max(0, totalPayable - paid);
    const pendingCount = fees.filter((i) => (i.status || '').toLowerCase() !== 'paid').length;
    return { totalPayable, paid, outstanding, pendingCount, count: fees.length };
  }, [fees]);

  const reportCardCount = reportCards.length;
  const announcementCount = announcements.length;
  const recentAnnouncements = announcements.slice(0, 3);
  const unreadNotifs = notifs?.unread ?? 0;

  const retry = () => {
    setLoading(true);
    setRetryCount((c) => c + 1);
  };

  const quickLinks = [
    { id: 'student-results', label: possessive(user, 'My Results', "Ward's Results"), icon: GraduationCap, color: 'emerald' },
    { id: 'student-report-card', label: 'Report Card', icon: Award, color: 'sky' },
    { id: 'student-attendance', label: possessive(user, 'My Attendance', "Ward's Attendance"), icon: CalendarCheck, color: 'amber' },
    { id: 'student-timetable', label: 'Timetable', icon: Calendar, color: 'violet' },
    { id: 'student-datesheet', label: 'Date Sheets', icon: CalendarDays, color: 'violet' },
    { id: 'student-announcements', label: 'Announcements', icon: Bell, color: 'primary' },
  ];

  // v4.1.0: Module-specific icon colors for quick links.
  const qlColorMap: Record<string, { chip: string; icon: string; hover: string }> = {
    emerald: { chip: 'bg-emerald-50 border-emerald-100', icon: 'text-emerald-600', hover: 'group-hover:bg-emerald-100 group-hover:border-emerald-200' },
    sky:     { chip: 'bg-sky-50 border-sky-100',         icon: 'text-sky-600',     hover: 'group-hover:bg-sky-100 group-hover:border-sky-200' },
    amber:   { chip: 'bg-amber-50 border-amber-100',     icon: 'text-amber-600',   hover: 'group-hover:bg-amber-100 group-hover:border-amber-200' },
    violet:  { chip: 'bg-violet-50 border-violet-100',   icon: 'text-violet-600',  hover: 'group-hover:bg-violet-100 group-hover:border-violet-200' },
    primary: { chip: 'bg-[#FFF4ED] border-[#FDE8D5]',    icon: 'text-[#F26522]',   hover: 'group-hover:bg-[#FFF0E8] group-hover:border-[#F26522]/20' },
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      {/* Welcome banner — v4.1.0: gradient left accent + avatar initial + attendance-based motivational badge. */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F26522] to-orange-300" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-[#F26522] to-orange-400 grid place-items-center shrink-0 shadow-sm shadow-[#F26522]/20">
              <span className="text-lg sm:text-xl font-bold text-white">{firstName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1A1A1A] tracking-tight">
                {isParent ? `Welcome to your ward's portal` : `Welcome back, ${firstName}`}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {user?.class ? `${wardPrefix}${user.class}` : `${wardPrefix}Student`}
                {user?.section ? ` · Section ${user.section}` : ''}
                {user?.rollNo ? ` · Roll No ${user.rollNo}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:block text-xs text-gray-400">{todayStr}</div>
            {attRate !== null && (
              <div className={cn(
                'text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full',
                attRate >= 80 ? 'bg-emerald-50 text-emerald-700' : attRate >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700',
              )}>
                {attRate >= 80 ? '👍 Great attendance' : attRate >= 60 ? '⚡ Keep it up' : '📉 Needs improvement'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards — v4.1.0: contextual accent colors based on values. */}
      {loading ? (
        <SkeletonStatGrid />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={CalendarCheck}
            label="Attendance Rate"
            value={attRate !== null ? `${attRate}%` : '—'}
            sub={
              att
                ? `${att.present || 0} of ${att.total || 0} sessions present`
                : 'No attendance recorded'
            }
            accent={attRate !== null ? (attRate >= 80 ? 'emerald' : attRate >= 60 ? 'amber' : 'red') : 'primary'}
          />
          <StatCard
            icon={GraduationCap}
            label="Average Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            sub={`${results.length} ${results.length === 1 ? 'result' : 'results'} recorded`}
            accent={avgScore !== null ? (avgScore >= 70 ? 'emerald' : avgScore >= 50 ? 'amber' : 'red') : 'primary'}
          />
          <StatCard
            icon={Award}
            label="Report Cards"
            value={reportCardCount}
            sub={reportCardCount ? 'Published' : 'None published yet'}
            accent="sky"
          />
          <StatCard
            icon={Bell}
            label="Announcements"
            value={announcementCount}
            sub={
              unreadNotifs > 0
                ? `${unreadNotifs} unread notice${unreadNotifs === 1 ? '' : 's'}`
                : announcementCount
                  ? `${announcementCount} notice${announcementCount === 1 ? '' : 's'}`
                  : 'No notices'
            }
          />
        </div>
      )}

      {/* Fee overview — total payable / paid / outstanding, links to My Fees */}
      {!loading && feeSummary.count > 0 && (
        <button
          onClick={() => setActiveModule('student-fees')}
          className="group w-full text-left rounded-xl border border-gray-200 bg-white p-5 hover:border-[#F26522]/40 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-[#FFF4ED] border border-[#FDE8D5] grid place-items-center">
                <Receipt className="h-[18px] w-[18px] text-[#F26522]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1A1A1A]">{isParent ? "Ward's Fees" : 'My Fees'}</h3>
                <p className="text-xs text-gray-500">{feeSummary.count} invoice(s) · {feeSummary.pendingCount} pending</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#F26522] transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Total Payable</p>
              <p className="text-lg font-bold text-[#1A1A1A] mt-0.5 tabular-nums">{pdfFmtMoney(feeSummary.totalPayable)}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-medium">Paid</p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5 tabular-nums">{pdfFmtMoney(feeSummary.paid)}</p>
            </div>
            <div className={cn('rounded-lg border p-3', feeSummary.outstanding > 0 ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100')}>
              <p className={cn('text-[10px] uppercase tracking-wide font-medium', feeSummary.outstanding > 0 ? 'text-rose-600' : 'text-gray-400')}>Outstanding</p>
              <p className={cn('text-lg font-bold mt-0.5 tabular-nums', feeSummary.outstanding > 0 ? 'text-rose-700' : 'text-[#1A1A1A]')}>{pdfFmtMoney(feeSummary.outstanding)}</p>
            </div>
          </div>
        </button>
      )}

      {/* Two-column body: recent announcements + recent results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent announcements — wider */}
        <div className="rounded-xl border border-gray-200 bg-white lg:col-span-2 overflow-hidden">
          <div className="p-5 pb-0">
            <SectionHeader
              title="Recent Announcements"
              desc="Latest notices from your college."
              action={
                announcementCount > 0 ? (
                  <button
                    onClick={() => setActiveModule('student-announcements')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#F26522] transition-colors"
                  >
                    View all
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : undefined
              }
            />
          </div>
          {loading ? (
            <div className="p-5 pt-0">
              <SkeletonCards count={3} />
            </div>
          ) : recentAnnouncements.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No announcements yet"
              desc="College-wide notices will appear here once published."
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {recentAnnouncements.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setActiveModule('student-announcements')}
                  className="w-full text-left p-5 hover:bg-gray-50/60 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gray-50 border border-gray-100 grid place-items-center shrink-0">
                      <Megaphone className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                          {a.senderRole || 'College'}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-[11px] text-gray-400">
                          {relativeTime(a.createdAt)}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-[#1A1A1A] group-hover:text-[#F26522] transition-colors truncate">
                        {a.title}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.message}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#F26522] transition-colors shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent results — narrower */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-5 pb-0">
            <SectionHeader
              title="Latest Results"
              desc={possessive(user, 'Your most recent scores.', "Your child's most recent scores.")}
              action={
                results.length > 0 ? (
                  <button
                    onClick={() => setActiveModule('student-results')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#F26522] transition-colors"
                  >
                    All
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : undefined
              }
            />
          </div>
          {loading ? (
            <div className="p-5 pt-0 space-y-2">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </div>
          ) : recentResults.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No results yet"
              desc="Scores appear here once teachers post them."
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {recentResults.map((r, i) => {
                const pct = computePercentage(r);
                const grade = r.grade || computeGrade(pct);
                const marks = r.marks ?? r.obtained;
                return (
                  <div key={r.id || i} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#1A1A1A] truncate">
                          {subjectLabel(r)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {r.exam || 'Test'} · {formatDate(r.date) || 'Recently'}
                        </div>
                      </div>
                      <GradeBadge grade={grade} />
                    </div>
                    <div className="mt-3">
                      <PercentageBar value={pct} />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1.5 tabular-nums">
                      {marks !== undefined && marks !== null
                        ? `${marks} / ${r.totalMarks || 100} marks`
                        : `${pct}% score`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick links — flat grid of module jump cards */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <SectionHeader
          title="Quick Links"
          desc="Jump straight to a section."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickLinks.map((q) => {
            const c = qlColorMap[q.color || 'primary'] || qlColorMap.primary;
            return (
              <button
                key={q.id}
                onClick={() => setActiveModule(q.id)}
                className="group flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] transition-all text-left"
              >
                <div className={cn('h-8 w-8 rounded-lg border grid place-items-center transition-colors', c.chip, c.hover)}>
                  <q.icon className={cn('h-4 w-4 transition-colors', c.icon)} />
                </div>
                <span className="text-xs font-semibold text-[#1A1A1A] leading-tight">{q.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 1b. My Fees — installments + monthly challans set by the Accountant,
//     each downloadable as a branded PDF. View-only for the student.
// ═══════════════════════════════════════════════════════════════════════

function StudentFees({ user }: { user: any }) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const studentId = user?.id;
  const isParent = user?.role === 'parent';

  const load = () => {
    if (!studentId) {
      setError('No student record linked to this account.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getFeeInvoices(studentId)
      .then((data) => setInvoices(Array.isArray(data) ? data : []))
      .catch((e) => setError(e?.message || 'Could not load your fee records.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [studentId]);

  // Installment number = the trailing "-N" in the challan (CH-INST-…-{n}).
  const instSeq = (inv: any) => {
    const m = String(inv.challanNo || '').match(/-(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : 9999;
  };
  // Sort: installments first (by installment NUMBER, not due date), then monthly.
  const sorted = useMemo(() => {
    return [...invoices].sort((a, b) => {
      const aType = (a.type || '').toLowerCase() === 'installment' ? 0 : 1;
      const bType = (b.type || '').toLowerCase() === 'installment' ? 0 : 1;
      if (aType !== bType) return aType - bType;
      if (aType === 0) {
        const sa = instSeq(a), sb = instSeq(b);
        if (sa !== sb) return sa - sb;
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      }
      return (b.year || 0) - (a.year || 0) || (a.month || '').localeCompare(b.month || '');
    });
  }, [invoices]);

  const installments = sorted.filter((i) => (i.type || '').toLowerCase() === 'installment');
  const monthly = sorted.filter((i) => (i.type || '').toLowerCase() !== 'installment');

  const totalPayable = invoices.reduce((acc, i) => acc + Number(i.amount || 0), 0);
  const totalPaid = invoices
    .filter((i) => (i.status || '').toLowerCase() === 'paid')
    .reduce((acc, i) => acc + Number(i.paidAmount || i.amount || 0), 0);
  const totalOutstanding = totalPayable - totalPaid;

  const downloadPdf = async (inv: any) => {
    setDownloadingId(inv.id);
    try {
      let data = inv;
      try {
        const full = await api.getChallanData(inv.id);
        data = { ...inv, ...full };
      } catch {}
      
      // Build the 3-copy bank challan (same format as Accountant Portal)
      const within = Number(data.amount || 0);
      const after = within + Math.round(within * 0.05);
      const due = data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-GB') : '';
      
      const doc = await buildConcordiaChallan({
        studentId: data.rollNo || user?.rollNo,
        billNo: data.challanNo || String(data.id || '').slice(-6),
        studentName: data.studentName || user?.name,
        fatherName: data.fatherName || user?.fatherName || user?.guardian,
        className: data.className || data.class || user?.class,
        section: data.section || user?.section,
        feeIns: data.type === 'Installment' ? '1 of 3' : '',
        particulars: data.month ? `${data.month} Payable` : 'Installment Payable',
        items: [{ name: 'College Fee', amount: within }],
        payableWithin: within,
        payableAfter: after,
        dueDate: due,
        payableBefore: due,
        arrears: '',
      });
      
      const fileName = `Challan-${data.challanNo || data.id}.pdf`;
      savePdf(doc, fileName);
      toast({ title: 'Challan downloaded', description: fileName });
    } catch (e: any) {
      toast({
        title: 'Could not download PDF',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const feeLabel = isParent ? "Your child's fees" : 'My Fees';

  return (
    <div className="space-y-6">
      <PageHeader
        title={feeLabel}
        subtitle="Installments and monthly challans set by the Accountant — download any as PDF."
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Wallet}
          label="Total Payable"
          value={pdfFmtMoney(totalPayable)}
          sub={`${invoices.length} invoice(s)`}
        />
        <StatCard
          icon={CheckCircle2}
          label="Paid"
          value={pdfFmtMoney(totalPaid)}
          sub={invoices.filter((i) => (i.status || '').toLowerCase() === 'paid').length + ' paid'}
        />
        <StatCard
          icon={AlertCircle}
          label="Outstanding"
          value={pdfFmtMoney(totalOutstanding)}
          sub={invoices.filter((i) => (i.status || '').toLowerCase() !== 'paid').length + ' pending'}
        />
      </div>

      {/* Installments section */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="Installments"
          desc={
            installments.length
              ? `${installments.length} installment(s) — dates set by the Accountant.`
              : 'No installment plan yet. The Accountant will create one from your locked base fee.'
          }
        />
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <ErrorRow message={error} onRetry={load} />
        ) : installments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No installments yet"
            desc="Once the Accountant splits your locked base fee into installments, each one will appear here with its due date and a Download button."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Description
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Due Date
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                    PDF
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((inv, i) => {
                  const isPaid = (inv.status || '').toLowerCase() === 'paid';
                  const seq = instSeq(inv);
                  return (
                    <TableRow key={inv.id} className="border-gray-100 hover:bg-gray-50">
                      <TableCell className="text-sm font-medium text-gray-900">
                        Installment #{seq !== 9999 ? seq : i + 1}
                        <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
                          {inv.challanNo || String(inv.id || '').slice(0, 12)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-gray-900 text-right tabular-nums">
                        {pdfFmtMoney(Number(inv.amount || 0))}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200',
                          )}
                        >
                          {isPaid ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {inv.status || 'Unpaid'}
                        </span>
                        {isPaid && (inv.paidDate || inv.paidAt) && (
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Paid {formatDate(inv.paidDate || inv.paidAt)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                          onClick={() => downloadPdf(inv)}
                          disabled={downloadingId === inv.id}
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5 mr-1" />
                          )}
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Monthly challans section */}
      {monthly.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader
            title="Monthly Challans"
            desc={`${monthly.length} monthly tuition challan(s).`}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Period
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                    PDF
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.map((inv) => {
                  const isPaid = (inv.status || '').toLowerCase() === 'paid';
                  return (
                    <TableRow key={inv.id} className="border-gray-100 hover:bg-gray-50">
                      <TableCell className="text-sm font-medium text-gray-900">
                        {inv.month ? inv.month : '—'}{inv.year ? ` ${inv.year}` : ''}
                        <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
                          {inv.challanNo || String(inv.id || '').slice(0, 12)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-gray-900 text-right tabular-nums">
                        {pdfFmtMoney(Number(inv.amount || 0))}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200',
                          )}
                        >
                          {inv.status || 'Unpaid'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                          onClick={() => downloadPdf(inv)}
                          disabled={downloadingId === inv.id}
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5 mr-1" />
                          )}
                          PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. My Results — list of all test results (subject, marks, grade, %, bar)
// ═══════════════════════════════════════════════════════════════════════

function StudentResults({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const studentId = user?.id;
  const isParent = user?.role === 'parent';

  useEffect(() => {
    let cancelled = false;
    api
      .getResults({ studentId })
      .then((d: any) => {
        if (cancelled) return;
        const arr = Array.isArray(d) ? d : d?.entries || [];
        arr.sort(
          (a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
        );
        setItems(arr);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        toast({ title: 'Failed to load results', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, retryCount]);

  const avg = useMemo(() => {
    if (!items.length) return null;
    return Math.round(items.reduce((s, r) => s + computePercentage(r), 0) / items.length);
  }, [items]);

  const highest = useMemo(() => {
    if (!items.length) return null;
    return Math.max(...items.map(computePercentage));
  }, [items]);

  const lowest = useMemo(() => {
    if (!items.length) return null;
    return Math.min(...items.map(computePercentage));
  }, [items]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((c) => c + 1);
  };

  const title = isParent ? "Ward's Results" : 'My Results';

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title={title}
        subtitle={possessive(
          user,
          'Your test scores across all examinations.',
          "Your child's test scores across all examinations.",
        )}
        action={
          avg !== null ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 h-9">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                Average
              </span>
              <span className="text-sm font-semibold text-[#1A1A1A] tabular-nums">{avg}%</span>
            </div>
          ) : undefined
        }
      />

      {/* Quick stats strip — only when we have results */}
      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Sparkles}
            label="Highest Score"
            value={`${highest}%`}
            sub="Across all tests"
          />
          <StatCard icon={GraduationCap} label="Average" value={`${avg}%`} sub={`${items.length} results`} />
          <StatCard icon={ClipboardList} label="Lowest Score" value={`${lowest}%`} sub="Across all tests" />
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <SkeletonTable rows={4} />
        ) : error ? (
          <ErrorRow message="Couldn't load your results." onRetry={retry} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No results published yet"
            desc="Test scores will appear here once teachers post them."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-gray-100">
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold pl-5">
                    Subject
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                    Exam
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                    Date
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                    Marks
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                    Grade
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold w-48 pr-5">
                    Percentage
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r, i) => {
                  const pct = computePercentage(r);
                  const grade = r.grade || computeGrade(pct);
                  const marks = r.marks ?? r.obtained;
                  return (
                    <TableRow
                      key={r.id || i}
                      className="border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      <TableCell className="font-medium text-[#1A1A1A] pl-5">
                        {subjectLabel(r)}
                      </TableCell>
                      <TableCell className="text-gray-600">{r.exam || '—'}</TableCell>
                      <TableCell className="text-gray-500 tabular-nums">
                        {formatDate(r.date) || '—'}
                      </TableCell>
                      <TableCell className="text-gray-700 tabular-nums">
                        {marks !== undefined && marks !== null ? (
                          <>
                            <span className="font-medium text-[#1A1A1A]">{marks}</span>
                            <span className="text-gray-400"> / {r.totalMarks || 100}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <GradeBadge grade={grade} />
                      </TableCell>
                      <TableCell className="pr-5">
                        <PercentageBar value={pct} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Report Card — published term result cards (view-only, expandable)
// ═══════════════════════════════════════════════════════════════════════

function StudentReportCard({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const studentId = user?.id;
  const isParent = user?.role === 'parent';

  useEffect(() => {
    let cancelled = false;
    api
      .getReportCards({ studentId })
      .then((d: any) => {
        if (cancelled) return;
        const arr = Array.isArray(d) ? d : [];
        arr.sort((a: any, b: any) => {
          const ta = new Date(a.generatedAt || a.createdAt || 0).getTime();
          const tb = new Date(b.generatedAt || b.createdAt || 0).getTime();
          return tb - ta;
        });
        setItems(arr);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        toast({ title: 'Failed to load report cards', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, retryCount]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title={isParent ? "Ward's Report Card" : 'Report Card'}
        subtitle={possessive(
          user,
          'Your published term result cards.',
          "Your child's published term result cards.",
        )}
      />

      {loading ? (
        <SkeletonCards count={2} />
      ) : error ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <ErrorRow message="Couldn't load your report cards." onRetry={retry} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <EmptyState
            icon={Award}
            title="No report card published yet"
            desc="The term result card will appear here once the academic office publishes it."
          />
        </div>
      ) : (
        <Accordion type="single" collapsible defaultValue={items[0]?.id} className="space-y-4">
          {items.map((rc) => (
            <ReportCardItem key={rc.id} rc={rc} />
          ))}
        </Accordion>
      )}
    </div>
  );
}

function ReportCardItem({ rc }: { rc: any }) {
  const pct = Math.round(Number(rc.percentage || 0));
  const grade = rc.grade || computeGrade(pct);
  const generatedAt = rc.generatedAt || rc.createdAt;

  return (
    <AccordionItem
      value={rc.id}
      className="rounded-xl border border-gray-200 bg-white overflow-hidden !border-b"
    >
      {/* Header — always visible */}
      <AccordionTrigger className="hover:no-underline px-5 py-4 group">
        <div className="flex items-center justify-between gap-4 w-full min-w-0 pr-4">
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {rc.term && (
                <span className="inline-flex items-center rounded-md border border-[#F26522]/20 bg-[#FFF0E8] px-2 py-0.5 text-[11px] font-medium text-[#F26522]">
                  {rc.term}
                </span>
              )}
              <span className="text-[11px] text-gray-400">
                {formatDate(generatedAt) || 'Recently'}
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#1A1A1A] truncate">
              {rc.examName || rc.term || 'Result Card'}
            </h3>
            {(rc.class || rc.section) && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {rc.class || '—'}
                {rc.section ? ` · Section ${rc.section}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:block text-right">
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                Score
              </div>
              <div className="text-lg font-bold text-[#1A1A1A] tabular-nums">{pct}%</div>
            </div>
            <GradeBadge grade={grade} large />
            <ChevronRight className="h-4 w-4 text-gray-400 transition-transform group-data-[state=open]:rotate-90" />
          </div>
        </div>
      </AccordionTrigger>

      {/* Expanded content */}
      <AccordionContent className="px-5 pb-5 pt-0">
        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 -mx-5">
          <div className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Obtained
            </div>
            <div className="text-lg font-bold text-[#1A1A1A] mt-1.5 tabular-nums">
              {rc.obtainedMarks ?? '—'}
              <span className="text-sm text-gray-400 font-normal"> / {rc.totalMarks ?? '—'}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Percentage
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-lg font-bold text-[#1A1A1A] tabular-nums">{pct}%</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[40px]">
                <div
                  className={cn('h-full rounded-full', barTone(pct))}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
              Grade
            </div>
            <div className="text-lg font-bold text-[#1A1A1A] mt-1.5">{grade}</div>
          </div>
        </div>

        {/* Remarks */}
        {rc.remarks && (
          <div className="mt-4 rounded-lg bg-gray-50/60 border border-gray-100 p-4">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">
              Remarks
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{rc.remarks}</p>
          </div>
        )}

        {/* Student info footer */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-400">
          <FileText className="h-3.5 w-3.5" />
          <span>
            Issued for {rc.studentName || 'Student'}
            {rc.class ? ` · ${rc.class}` : ''}
            {rc.section ? ` · Section ${rc.section}` : ''}
          </span>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4. My Attendance — summary stats + chronological log with status badges
// ═══════════════════════════════════════════════════════════════════════

function StudentAttendance({ user }: { user: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const studentId = user?.id;
  const isParent = user?.role === 'parent';

  useEffect(() => {
    let cancelled = false;
    api
      .getAttendance({ studentId })
      .then((d: any) => {
        if (cancelled) return;
        setData(d);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        toast({ title: 'Failed to load attendance', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, retryCount]);

  const present = Number(data?.present || 0);
  const absent = Number(data?.absent || 0);
  const late = Number(data?.late || 0);
  const total = Number(data?.total || data?.entries?.length || 0);
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  const entries: any[] = data?.entries || [];

  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title={isParent ? "Ward's Attendance" : 'My Attendance'}
        subtitle={possessive(
          user,
          'Your attendance record across all sessions.',
          "Your child's attendance record across all sessions.",
        )}
      />

      {/* Summary card — big rate + 3 stat tiles + bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            {/* Rate — emphasised */}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                Attendance Rate
              </div>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-bold text-[#1A1A1A] tabular-nums">{rate}</span>
                <span className="text-lg font-semibold text-gray-400">%</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{total} sessions total</div>
            </div>

            {/* Present */}
            <SummaryStat icon={CheckCircle2} label="Present" value={present} tone="text-emerald-600" />
            {/* Absent */}
            <SummaryStat icon={XCircle} label="Absent" value={absent} tone="text-rose-600" />
            {/* Late */}
            <SummaryStat icon={Clock} label="Late" value={late} tone="text-amber-600" />
          </div>
        )}

        {/* Distribution bar — only when there's data */}
        {!loading && !error && total > 0 && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                Distribution
              </span>
              <span className="text-[11px] text-gray-400 tabular-nums">{total} sessions</span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
              {present > 0 && (
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(present / total) * 100}%` }}
                  title={`${present} Present`}
                />
              )}
              {late > 0 && (
                <div
                  className="bg-amber-500"
                  style={{ width: `${(late / total) * 100}%` }}
                  title={`${late} Late`}
                />
              )}
              {absent > 0 && (
                <div
                  className="bg-rose-500"
                  style={{ width: `${(absent / total) * 100}%` }}
                  title={`${absent} Absent`}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-5 pb-0">
          <SectionHeader
            title="Attendance Log"
            desc={
              entries.length
                ? `${entries.length} ${entries.length === 1 ? 'session' : 'sessions'} recorded.`
                : undefined
            }
          />
        </div>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <ErrorRow message="Couldn't load your attendance." onRetry={retry} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No attendance recorded yet"
            desc="Attendance entries will appear here once teachers start marking."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-gray-100">
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold pl-5">
                    Date
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                    Day
                  </TableHead>
                  <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold pr-5">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e, i) => {
                  const d = e.date ? new Date(e.date) : null;
                  return (
                    <TableRow
                      key={e.id || i}
                      className="border-gray-100 hover:bg-gray-50/60 transition-colors"
                    >
                      <TableCell className="font-medium text-[#1A1A1A] pl-5 tabular-nums">
                        {formatDate(e.date) || '—'}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {d ? d.toLocaleDateString('en-US', { weekday: 'long' }) : '—'}
                      </TableCell>
                      <TableCell className="pr-5">
                        <StatusBadge status={e.status || 'Unknown'} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', tone)} />
        <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-[#1A1A1A] mt-1.5 tabular-nums">{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Timetable — weekly grid Mon–Sat × periods (view-only)
// ═══════════════════════════════════════════════════════════════════════

function StudentTimetable({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const { classId } = useStudentClassId(user);

  useEffect(() => {
    let cancelled = false;
    const promise = classId ? api.getTimetable({ classId }) : Promise.resolve([]);
    promise
      .then((d: any) => {
        if (cancelled) return;
        setItems(Array.isArray(d) ? d : []);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        toast({ title: 'Failed to load timetable', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, retryCount]);

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    TIMETABLE_DAYS.forEach((d) => (map[d] = []));
    items.forEach((e) => {
      const day = e.day;
      if (map[day]) map[day].push(e);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (Number(a.period) || 0) - (Number(b.period) || 0)),
    );
    return map;
  }, [items]);

  const maxPeriods = useMemo(
    () => Math.max(1, ...items.map((e) => Number(e.period) || 0)),
    [items],
  );

  const todayName = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-US', { weekday: 'long' });
    } catch {
      return '';
    }
  }, []);

  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Timetable"
        subtitle={possessive(
          user,
          'Your weekly class schedule.',
          "Your child's weekly class schedule.",
        )}
        action={
          !loading && !error && items.length > 0 ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 h-9">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F26522]" />
              <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
                Today
              </span>
            </div>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        {loading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <ErrorRow message="Couldn't load your timetable." onRetry={retry} />
        ) : !classId ? (
          <EmptyState
            icon={Calendar}
            title="Class not assigned"
            desc="The timetable will appear here once your class is set up."
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="Timetable not published yet"
            desc="Your weekly schedule will appear here once the academic office publishes it."
          />
        ) : (
          <div className={cn('overflow-x-auto -mx-5 px-5', SCROLLBAR_CLS)}>
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  <th className="w-14 text-left text-[11px] uppercase tracking-wider text-gray-400 font-semibold pb-3 pr-2">
                    Period
                  </th>
                  {TIMETABLE_DAYS.map((d) => {
                    const isToday = d === todayName;
                    return (
                      <th
                        key={d}
                        className={cn(
                          'text-left text-[11px] uppercase tracking-wider font-semibold pb-3 px-2',
                          isToday ? 'text-[#F26522]' : 'text-gray-400',
                        )}
                      >
                        {d.slice(0, 3)}
                        <span className="hidden sm:inline"> {d.slice(3)}</span>
                        {isToday && (
                          <span className="ml-1.5 inline-flex h-1 w-1 rounded-full bg-[#F26522] align-middle" />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxPeriods }).map((_, periodIdx) => {
                  const period = periodIdx + 1;
                  return (
                    <tr key={period}>
                      <td className="align-top pr-2 pb-2">
                        <div className="h-9 w-9 rounded-lg bg-gray-50 border border-gray-100 grid place-items-center text-xs font-semibold text-gray-500 tabular-nums">
                          {period}
                        </div>
                      </td>
                      {TIMETABLE_DAYS.map((day) => {
                        const entry = byDay[day].find((e) => Number(e.period) === period);
                        const isToday = day === todayName;
                        return (
                          <td key={day} className="align-top px-1 pb-2">
                            {entry ? (
                              <TimetableCell entry={entry} isToday={isToday} />
                            ) : (
                              <div
                                className={cn(
                                  'h-[60px] rounded-lg border border-dashed grid place-items-center',
                                  isToday
                                    ? 'border-[#F26522]/15 bg-[#FFF0E8]/30'
                                    : 'border-gray-100',
                                )}
                              >
                                <span className="text-gray-300 text-xs">—</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TimetableCell({ entry, isToday }: { entry: any; isToday?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-2.5 transition-all min-h-[60px]',
        isToday
          ? 'border-[#F26522]/40 hover:border-[#F26522] hover:shadow-sm'
          : 'border-gray-200 hover:border-[#F26522]/40 hover:shadow-sm',
      )}
    >
      <div className="text-xs font-semibold text-[#1A1A1A] truncate leading-tight">
        {entry.subject || 'Subject'}
      </div>
      {entry.teacherName && (
        <div className="text-[10px] text-gray-500 truncate mt-0.5">{entry.teacherName}</div>
      )}
      {(entry.startTime || entry.endTime) && (
        <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">
          {entry.startTime || ''}
          {entry.startTime && entry.endTime ? '–' : ''}
          {entry.endTime || ''}
        </div>
      )}
      {entry.roomName && (
        <div className="text-[10px] text-gray-400 truncate mt-0.5">{entry.roomName}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Date Sheets — exam date sheets (parsed from announcements)
// ═══════════════════════════════════════════════════════════════════════

function StudentDateSheets({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const { classId } = useStudentClassId(user);

  useEffect(() => {
    let cancelled = false;
    api
      .getAnnouncements()
      .then((d: any) => {
        if (cancelled) return;
        const all = Array.isArray(d) ? d : [];
        const scoped = all
          .filter((a: any) => {
            if (!a.title?.startsWith('Date Sheet:')) return false;
            const role = (a.targetRole || '').toLowerCase();
            if (role && role !== 'student' && role !== 'all') return false;
            const scope = (a.targetScope || 'all').toLowerCase();
            if (scope === 'class' && a.classId && classId && a.classId !== classId) return false;
            return true;
          })
          .sort(
            (a: any, b: any) =>
              new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
          );
        setItems(scoped);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        toast({ title: 'Failed to load date sheets', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, retryCount]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Date Sheets"
        subtitle={possessive(
          user,
          'Upcoming and past examination schedules.',
          "Your child's upcoming and past examination schedules.",
        )}
      />

      {loading ? (
        <SkeletonCards count={2} />
      ) : error ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <ErrorRow message="Couldn't load date sheets." onRetry={retry} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <EmptyState
            icon={CalendarDays}
            title="No date sheets published yet"
            desc="Exam schedules will appear here once the academic office publishes them."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((ds) => (
            <DateSheetCard key={ds.id} ds={ds} />
          ))}
        </div>
      )}
    </div>
  );
}

function DateSheetCard({ ds }: { ds: any }) {
  // Title format: "Date Sheet: {examName} — {class}"
  const titleStr = (ds.title || '').replace(/^Date Sheet:\s*/, '');
  const titleParts = titleStr.split('—').map((s: string) => s.trim());
  const examName = titleParts[0] || 'Exam';
  const className = titleParts[1] || '';

  // Message format: lines of "Subject — Date at Time"
  const rows = useMemo(() => {
    const lines = (ds.message || '')
      .split('\n')
      .filter((l: string) => l.trim());
    return lines.map((line: string) => {
      const m = line.match(/^(.+?)\s+—\s+(.+?)(?:\s+at\s+(.+))?$/);
      if (!m) return { subject: line.trim(), date: '', time: '', past: false };
      const subject = m[1].trim();
      const date = m[2].trim();
      const time = (m[3] || '').trim();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let past = false;
      try {
        past = date ? new Date(date) < today : false;
      } catch {
        past = false;
      }
      return { subject, date, time, past };
    });
  }, [ds.message]);

  const upcomingCount = rows.filter((r) => !r.past).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          {className && (
            <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {className}
            </span>
          )}
          <ScopeBadge scope={ds.targetScope} />
          <span className="text-[11px] text-gray-400">
            Published {relativeTime(ds.createdAt)}
          </span>
        </div>
        <h3 className="text-base font-semibold text-[#1A1A1A] mt-2">{examName}</h3>
        {rows.length > 0 && (
          <p className="text-xs text-gray-500 mt-0.5">
            {upcomingCount > 0
              ? `${upcomingCount} upcoming ${upcomingCount === 1 ? 'exam' : 'exams'}`
              : `${rows.length} past ${rows.length === 1 ? 'exam' : 'exams'}`}
          </p>
        )}
      </div>

      {/* Schedule */}
      {rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No subjects scheduled" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-gray-100">
                <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold pl-5">
                  Subject
                </TableHead>
                <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                  Date
                </TableHead>
                <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold">
                  Time
                </TableHead>
                <TableHead className="uppercase text-[11px] tracking-wider text-gray-400 font-semibold pr-5">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow
                  key={i}
                  className="border-gray-100 hover:bg-gray-50/60 transition-colors"
                >
                  <TableCell className="font-medium text-[#1A1A1A] pl-5">{r.subject}</TableCell>
                  <TableCell className="text-gray-700 tabular-nums">
                    {r.date ? formatDate(r.date) : '—'}
                  </TableCell>
                  <TableCell className="text-gray-500 tabular-nums">{r.time || '—'}</TableCell>
                  <TableCell className="pr-5">
                    <StatusBadge status={r.past ? 'Past' : 'Upcoming'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 7. Announcements — notices targeted at students
// ═══════════════════════════════════════════════════════════════════════

function StudentAnnouncements({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const { classId } = useStudentClassId(user);

  useEffect(() => {
    let cancelled = false;
    api
      .getAnnouncements()
      .then((d: any) => {
        if (cancelled) return;
        const all = Array.isArray(d) ? d : [];
        const scoped = filterStudentAnnouncements(all, user, classId).filter(
          (a: any) => !a.title?.startsWith('Date Sheet:'),
        );
        setItems(scoped);
        setError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        toast({ title: 'Failed to load announcements', variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, user, retryCount]);

  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((c) => c + 1);
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Announcements"
        subtitle={possessive(
          user,
          'Notices and updates from your college.',
          'Notices and updates from your child\u2019s college.',
        )}
      />

      {loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <ErrorRow message="Couldn't load announcements." onRetry={retry} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white">
          <EmptyState
            icon={Bell}
            title="No announcements yet"
            desc="College-wide notices will appear here once published."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <AnnouncementCard key={a.id} a={a} classId={classId} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ a, classId }: { a: any; classId?: string }) {
  const scope = (a.targetScope || 'all').toLowerCase();
  const isClassScope = scope === 'class' && a.classId && classId && a.classId === classId;
  const scopeLabel = isClassScope ? 'class' : scope;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-gray-50 border border-gray-100 grid place-items-center shrink-0">
          <Megaphone className="h-4 w-4 text-gray-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <ScopeBadge scope={scopeLabel} />
            <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              {a.senderRole || 'College'}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-[11px] text-gray-400">{relativeTime(a.createdAt)}</span>
          </div>
          <h3 className="text-sm font-semibold text-[#1A1A1A]">{a.title}</h3>
          {a.message && (
            <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-wrap leading-relaxed">
              {a.message}
            </p>
          )}
          <div className="text-[11px] text-gray-400 mt-2.5">{formatDateTime(a.createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Helpers ─────────────────────────

/** Filter announcements for student/parent view: role match + class scope. */
function filterStudentAnnouncements(all: any[], user: any, classId?: string): any[] {
  return all
    .filter((a: any) => {
      const role = (a.targetRole || '').toLowerCase();
      if (role && role !== 'student' && role !== 'all') return false;
      const scope = (a.targetScope || 'all').toLowerCase();
      if (scope === 'class' && a.classId && classId && a.classId !== classId) return false;
      return true;
    })
    .sort(
      (a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
}

// ───────────────────────── Coming Soon (unknown module) ─────────────────────────

function ComingSoon() {
  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={FileText}
          title="Coming soon"
          desc="This module is not available yet."
        />
      </div>
    </div>
  );
}
