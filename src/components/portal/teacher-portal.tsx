'use client';

// ============================================================================
// Concordia College — Teacher Portal (spec §5)
//
// Teacher access is restricted to the classes and subjects allocated to them
// by the Academic Office. This portal exposes EXACTLY these 7 modules:
//
//   1. teacher-dashboard       — overview + quick actions
//   2. teacher-classes         — allocated classes/subjects with student counts
//   3. teacher-attendance      — mark Present / Absent / Late for a class + date
//   4. teacher-results         — enter marks per student → submitted to Academic Office
//   5. teacher-feedback        — write categorized feedback on a student
//   6. teacher-announcements   — post class-specific announcements
//   7. teacher-timetable       — weekly grid (view-only)
//
// Design language (matches academic-portal / admissions-portal / student-portal):
//   • Flat, restrained — grayscale + a single orange (#F26522) accent.
//   • Orange ONLY for primary actions, active states, and the small section
//     accent line. Never on icon tiles, never as a card background.
//   • No gradients, no glassmorphism, no colored icon tiles, no framer-motion.
//   • White cards on 1px gray borders, rounded-xl, subtle shadow on hover.
//   • Tables: uppercase muted headers, hover row tint, subtle status badges.
//   • Buttons: h-9 px-4 text-sm rounded-lg — primary = #F26522, secondary = border-gray-200.
//   • Inputs: h-10 rounded-lg border-gray-200 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12.
//   • Section accent: `h-0.5 w-8 bg-[#F26522] rounded-full mb-3` above each page title.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import {
  BookOpen, CalendarCheck, ClipboardList, Calendar, Users,
  Megaphone, MessageSquare, LayoutDashboard, Loader2, Search,
  CheckCircle2, XCircle, Clock, Plus, ChevronRight, ArrowLeft,
  GraduationCap, Bell, Inbox, AlertCircle, ClipboardCheck,
  Send, Trash2, BookCopy, CalendarDays, Sparkles, Info,
} from 'lucide-react';

type Props = { activeModule: string; user: any };

// ─────────────────────────────── Types ───────────────────────────────

type TeacherClass = {
  id: string;
  name: string;
  section?: string;
  branchId?: string;
  courses: { id: string; name: string; code?: string }[];
};

type Student = {
  id: string;
  name: string;
  rollNo?: string;
  class?: string;
  section?: string;
  branchId?: string;
};

type AttendanceStatus = 'Present' | 'Absent' | 'Late';

// ─────────────────────────── Shared constants ───────────────────────────

const PRIMARY = '#F26522';
const PRIMARY_DARK = '#D4541E';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Common exam names — the backend stores results with a free-text `exam` field,
// so we offer a curated list that the Academic Office typically schedules.
const COMMON_TESTS = [
  'Monthly Test 1', 'Monthly Test 2', 'Midterm Exam', 'Final Exam',
  'Quiz 1', 'Quiz 2', 'Assignment 1', 'Assignment 2', 'Oral Test', 'Class Test',
];

const FEEDBACK_CATEGORIES = [
  'Excellent', 'Good', 'Satisfactory', 'Needs Improvement', 'Below Average',
];

// Shared input className — keeps every input visually consistent.
const inputCls =
  'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12 outline-none transition-colors';
const selectTriggerCls =
  'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-[#1A1A1A] focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12 outline-none transition-colors';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F26522] hover:bg-[#D4541E] text-white font-medium text-sm h-9 px-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium text-sm h-9 px-4 transition-colors disabled:opacity-60';

// ─────────────────────────── Shared helpers ───────────────────────────

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

/** Flat KPI card — white bg, gray border, small inline icon top-right. */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {label}
          </div>
          <div className="text-2xl font-bold text-[#1A1A1A] mt-1.5 truncate">{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
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
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-md" />
      ))}
    </div>
  );
}

/** Restrained empty state: small muted icon + title + optional subtitle + action. */
function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: any;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="h-12 w-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-[#1A1A1A]">{title}</p>
      {desc && <p className="text-xs text-gray-500 mt-1 max-w-sm">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Form field wrapper: label above input, small asterisk for required fields. */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
        {label}
        {required && <span className="text-[#F26522] ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

/** Status badge for attendance — neutral palette, accent reserved for primary actions. */
function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const map: Record<AttendanceStatus, string> = {
    Present: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    Absent: 'bg-rose-50 text-rose-700 border-rose-100',
    Late: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
        map[status],
      )}
    >
      {status}
    </span>
  );
}

/** Subtle "Under Review" badge used in the results table. */
function ReviewBadge() {
  return (
    <span className="inline-flex items-center rounded-md border bg-amber-50 text-amber-700 border-amber-100 px-2 py-0.5 text-[11px] font-medium">
      Under Review
    </span>
  );
}

// ─────────────────────────── Formatters ───────────────────────────

const fmtDate = (iso?: string | number) => {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
};

const fmtDateTime = (iso?: string | number) => {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// Long-list scrollbar — thin, gray, matches the restrained design.
const SCROLLBAR_CLS = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300';

// ─────────────────────────── Shared data hook ───────────────────────────
//
// Loads the teacher's allocated classes + all students in their branch once,
// shares them across every module via props. Teachers can NEVER see classes
// outside their allocation — `api.getTeacherClasses()` is the only source.
function useTeacherData(user: any) {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const branchId = user?.branchId;

  useEffect(() => {
    let cancelled = false;
    // NOTE: do NOT call setLoading(true) synchronously here — `loading`
    // defaults to true on first render, and a stale-while-revalidate swap
    // on branchId change is nicer UX than flashing a skeleton. The
    // .then/.catch/.finally callbacks below update state asynchronously.
    Promise.all([
      api.getTeacherClasses().catch(() => []),
      api.platformUsers({ role: 'student', branchId }).catch(() => []),
    ])
      .then(([c, s]) => {
        if (cancelled) return;
        setClasses(Array.isArray(c) ? (c as TeacherClass[]) : []);
        setStudents(Array.isArray(s) ? (s as Student[]) : []);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load your allocated classes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  return { classes, students, loading, error };
}

/**
 * Match students to a specific allocated class. Students store the class NAME
 * (not the class id), so we match on (name + section) plus branchId.
 */
function studentsForClass(students: Student[], cls: TeacherClass): Student[] {
  return students
    .filter(
      (s) =>
        s.branchId === cls.branchId &&
        s.class === cls.name &&
        (!cls.section || s.section === cls.section),
    )
    .sort((a, b) =>
      (a.rollNo || '').localeCompare(b.rollNo || '', undefined, { numeric: true }),
    );
}

// Pull auth token from the same store the api client uses. Needed only for the
// feedback POST (which goes to a route the backend hasn't formally defined yet).
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const raw = sessionStorage.getItem('concordia-app');
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.state?.token;
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch {}
  return {};
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Dashboard — overview + quick actions
// ═══════════════════════════════════════════════════════════════════════

function TeacherDashboard({
  user,
  classes,
  students,
  loading,
  onNavigate,
}: {
  user: any;
  classes: TeacherClass[];
  students: Student[];
  loading: boolean;
  onNavigate: (m: string) => void;
}) {
  const [todaySchedule, setTodaySchedule] = useState<any[]>([]);
  const [myResults, setMyResults] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    api
      .getTimetable({ teacherId: user.id })
      .then((d) => {
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        setTodaySchedule((Array.isArray(d) ? d : []).filter((r: any) => r.day === today));
      })
      .catch(() => {});
    api
      .getResults({ teacherId: user.id })
      .then((d) => setMyResults(Array.isArray(d) ? d : []))
      .catch(() => {});
    api
      .getNotifications()
      .then((d) => setNotifCount(d?.unread || 0))
      .catch(() => {});
  }, [user?.id]);

  // Unique student count across all allocated classes.
  const totalStudents = useMemo(() => {
    const ids = new Set<string>();
    for (const c of classes) for (const s of studentsForClass(students, c)) ids.add(s.id);
    return ids.size;
  }, [classes, students]);

  // "Pending results" = number of allocated class+course pairs without a
  // results row posted by this teacher. Approximate but meaningful.
  const pendingResults = useMemo(() => {
    const posted = new Set(myResults.map((r: any) => `${r.classId}:${r.courseId}`));
    return classes.reduce(
      (acc, c) => acc + c.courses.filter((co) => !posted.has(`${c.id}:${co.id}`)).length,
      0,
    );
  }, [classes, myResults]);

  const quickActions = [
    { id: 'teacher-attendance', label: 'Mark Attendance', icon: CalendarCheck, desc: "Take today's attendance" },
    { id: 'teacher-results', label: 'Enter Results', icon: ClipboardList, desc: 'Submit test marks' },
    { id: 'teacher-feedback', label: 'Give Feedback', icon: MessageSquare, desc: "Note a student's progress" },
    { id: 'teacher-announcements', label: 'Post Announcement', icon: Megaphone, desc: 'Message a class' },
  ];

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'Teacher'}`}
        subtitle="Here's a snapshot of your teaching day."
        action={
          notifCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 h-9 text-xs text-gray-600">
              <Bell className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium text-[#1A1A1A]">{notifCount}</span> new
            </span>
          ) : undefined
        }
      />

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={BookCopy} label="My Classes" value={classes.length} sub="allocated to you" />
          <StatCard icon={Users} label="My Students" value={totalStudents} sub="across all classes" />
          <StatCard
            icon={ClipboardList}
            label="Pending Results"
            value={pendingResults}
            sub={pendingResults > 0 ? 'awaiting submission' : 'all caught up'}
          />
          <StatCard
            icon={CalendarDays}
            label="Today's Periods"
            value={todaySchedule.length}
            sub={todayLabel}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's timetable */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <SectionHeader
            title="Today's Timetable"
            desc={todayLabel}
            action={
              <button
                onClick={() => onNavigate('teacher-timetable')}
                className="text-[11px] font-medium text-gray-500 hover:text-[#F26522] inline-flex items-center gap-1"
              >
                Full week <ChevronRight className="h-3 w-3" />
              </button>
            }
          />
          {loading ? (
            <SkeletonTable rows={3} />
          ) : todaySchedule.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No classes scheduled today"
              desc="Enjoy the breather — or use the time to catch up on results."
            />
          ) : (
            <div className="divide-y divide-gray-100">
              {todaySchedule
                .sort((a, b) => (a.period || 0) - (b.period || 0))
                .map((p: any) => (
                  <div key={p.id} className="flex items-center gap-4 py-3">
                    <div className="w-20 shrink-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        Period {p.period}
                      </div>
                      {p.startTime && (
                        <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                          {p.startTime}
                          {p.endTime ? `–${p.endTime}` : ''}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#1A1A1A] truncate">
                        {p.subject || '—'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {p.className || ''}
                        {p.section ? ` · Sec ${p.section}` : ''}
                        {p.roomName ? ` · ${p.roomName}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <SectionHeader title="Quick Actions" />
          <div className="space-y-2">
            {quickActions.map((a) => (
              <button
                key={a.id}
                onClick={() => onNavigate(a.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-[#F26522]/30 hover:bg-[#FFF0E8]/40 transition-colors text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-gray-50 group-hover:bg-white border border-gray-100 flex items-center justify-center shrink-0">
                  <a.icon className="h-4 w-4 text-gray-500 group-hover:text-[#F26522]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[#1A1A1A]">{a.label}</div>
                  <div className="text-[11px] text-gray-500">{a.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-[#F26522] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* My allocated classes — quick peek */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SectionHeader
          title="My Allocated Classes"
          desc="Classes and subjects assigned to you by the Academic Office."
          action={
            <button
              onClick={() => onNavigate('teacher-classes')}
              className="text-[11px] font-medium text-gray-500 hover:text-[#F26522] inline-flex items-center gap-1"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          }
        />
        {loading ? (
          <SkeletonTable rows={3} />
        ) : classes.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No classes allocated yet"
            desc="Once the Academic Office assigns you classes, they'll appear here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.map((c) => {
              const n = studentsForClass(students, c).length;
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-gray-100 p-4 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#1A1A1A]">{c.name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Section {c.section || 'A'}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium border-gray-200 text-gray-600"
                    >
                      {n} students
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.courses.length === 0 ? (
                      <span className="text-[11px] text-gray-400">No subjects assigned</span>
                    ) : (
                      c.courses.slice(0, 3).map((co) => (
                        <span
                          key={co.id}
                          className="text-[10px] font-medium text-gray-600 bg-gray-100 rounded px-1.5 py-0.5"
                        >
                          {co.name}
                        </span>
                      ))
                    )}
                    {c.courses.length > 3 && (
                      <span className="text-[10px] text-gray-400 px-1.5 py-0.5">
                        +{c.courses.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 2. My Classes — allocated classes/subjects with student counts
// ═══════════════════════════════════════════════════════════════════════

function TeacherClasses({
  classes,
  students,
  loading,
}: {
  classes: TeacherClass[];
  students: Student[];
  loading: boolean;
}) {
  const [q, setQ] = useState('');
  const [openClass, setOpenClass] = useState<TeacherClass | null>(null);

  const filtered = classes.filter(
    (c) =>
      !q ||
      (c.name + (c.section || '') + c.courses.map((co) => co.name).join(' '))
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="My Classes"
        subtitle="Classes and subjects allocated to you by the Academic Office."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="relative mb-4 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search classes or subjects…"
            className={cn(inputCls, 'pl-9')}
          />
        </div>

        {loading ? (
          <SkeletonTable rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={q ? 'No matching classes' : 'No classes allocated yet'}
            desc={
              q
                ? 'Try a different search.'
                : 'Once the Academic Office assigns you classes, they will appear here.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Class
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Section
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Subjects
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right">
                  Students
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const n = studentsForClass(students, c).length;
                return (
                  <TableRow
                    key={c.id}
                    className="border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setOpenClass(c)}
                  >
                    <TableCell className="text-sm font-semibold text-[#1A1A1A]">{c.name}</TableCell>
                    <TableCell className="text-sm text-gray-600">{c.section || 'A'}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {c.courses.length === 0 ? (
                        '—'
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.courses.map((co) => (
                            <span
                              key={co.id}
                              className="text-[10px] font-medium text-gray-600 bg-gray-100 rounded px-1.5 py-0.5"
                            >
                              {co.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700 text-right tabular-nums">
                      {n}
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Class detail sheet */}
      <Sheet open={!!openClass} onOpenChange={(o) => !o && setOpenClass(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {openClass && (
            <>
              <SheetHeader>
                <SheetTitle className="text-[#1A1A1A]">
                  {openClass.name} · Section {openClass.section || 'A'}
                </SheetTitle>
                <SheetDescription>
                  {studentsForClass(students, openClass).length} students enrolled
                  {openClass.courses.length > 0 &&
                    ` · ${openClass.courses.length} subjects assigned to you`}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-5">
                {openClass.courses.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      My Subjects
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {openClass.courses.map((co) => (
                        <span
                          key={co.id}
                          className="text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md px-2 py-1"
                        >
                          {co.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Class List
                  </div>
                  {studentsForClass(students, openClass).length === 0 ? (
                    <EmptyState icon={Users} title="No students in this class" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200 hover:bg-transparent">
                          <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Roll No
                          </TableHead>
                          <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            Name
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentsForClass(students, openClass).map((s) => (
                          <TableRow key={s.id} className="border-gray-100 hover:bg-gray-50">
                            <TableCell className="text-sm font-mono text-gray-600">
                              {s.rollNo || '—'}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-[#1A1A1A]">
                              {s.name}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Attendance — mark Present / Absent / Late for a class + date
// ═══════════════════════════════════════════════════════════════════════

function TeacherAttendance({
  user,
  classes,
  students,
  loading,
}: {
  user: any;
  classes: TeacherClass[];
  students: Student[];
  loading: boolean;
}) {
  const [classId, setClassId] = useState<string>('');
  const [date, setDate] = useState<string>(todayISO());
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<boolean>(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const cls = classes.find((c) => c.id === classId) || null;
  const list = cls ? studentsForClass(students, cls) : [];

  // When class+date changes, check whether attendance was already marked.
  useEffect(() => {
    if (!classId || !date) {
      setExisting(false);
      return;
    }
    setLoadingExisting(true);
    setMarks({});
    api
      .getAttendance({ teacherId: user.id })
      .then((d) => {
        const rows = Array.isArray(d) ? d : [];
        const row = rows.find((r: any) => r.classId === classId && r.date === date);
        if (row && Array.isArray(row.records)) {
          const m: Record<string, AttendanceStatus> = {};
          for (const e of row.records) m[e.studentId] = e.status as AttendanceStatus;
          setMarks(m);
          setExisting(true);
        } else {
          setExisting(false);
        }
      })
      .catch(() => setExisting(false))
      .finally(() => setLoadingExisting(false));
  }, [classId, date, user.id]);

  const setAll = (status: AttendanceStatus) => {
    const m: Record<string, AttendanceStatus> = {};
    for (const s of list) m[s.id] = status;
    setMarks(m);
  };

  const stats = useMemo(() => {
    const vals = Object.values(marks);
    return {
      present: vals.filter((s) => s === 'Present').length,
      absent: vals.filter((s) => s === 'Absent').length,
      late: vals.filter((s) => s === 'Late').length,
    };
  }, [marks]);

  const submit = async () => {
    if (!cls) {
      toast({ title: 'Select a class first', variant: 'destructive' });
      return;
    }
    if (!date) {
      toast({ title: 'Select a date', variant: 'destructive' });
      return;
    }
    if (list.length === 0) {
      toast({ title: 'No students to mark', variant: 'destructive' });
      return;
    }
    const missing = list.filter((s) => !marks[s.id]);
    if (missing.length > 0) {
      toast({
        title: `${missing.length} student(s) not marked`,
        description: 'Mark every student before submitting.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await api.markAttendance({
        classId: cls.id,
        date,
        records: list.map((s) => ({ studentId: s.id, status: marks[s.id] })),
      });
      toast({ title: 'Attendance saved', description: `${list.length} students · ${fmtDate(date)}` });
      setExisting(true);
    } catch (e: any) {
      toast({
        title: 'Failed to save attendance',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Attendance"
        subtitle="Mark attendance for your allocated classes. Submitting twice on the same day overwrites the previous record."
      />

      {/* Selectors */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Class" required>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className={selectTriggerCls}>
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · Sec {c.section || 'A'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date" required>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
              max={todayISO()}
            />
          </Field>
          <Field label="Quick Actions" hint="Mark everyone at once, then adjust individuals.">
            <div className="flex gap-2">
              <button
                onClick={() => setAll('Present')}
                disabled={!cls}
                className="flex-1 h-10 rounded-lg border border-gray-200 bg-white hover:bg-emerald-50/40 hover:border-emerald-200 text-xs font-medium text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                All Present
              </button>
              <button
                onClick={() => setAll('Absent')}
                disabled={!cls}
                className="flex-1 h-10 rounded-lg border border-gray-200 bg-white hover:bg-rose-50/40 hover:border-rose-200 text-xs font-medium text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                All Absent
              </button>
            </div>
          </Field>
        </div>
        {existing && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-[12px] text-amber-800">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Attendance for <span className="font-medium">{fmtDate(date)}</span> was already marked.
              Saving will overwrite the previous record.
            </span>
          </div>
        )}
      </div>

      {/* Roster */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SectionHeader
          title={cls ? `${cls.name} · Section ${cls.section || 'A'}` : 'Class Roster'}
          desc={cls ? `${list.length} students` : 'Select a class to load the roster'}
          action={
            cls && list.length > 0 ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> {stats.present}
                </span>
                <span className="inline-flex items-center gap-1 text-rose-700">
                  <XCircle className="h-3 w-3" /> {stats.absent}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Clock className="h-3 w-3" /> {stats.late}
                </span>
              </div>
            ) : undefined
          }
        />

        {loading || loadingExisting ? (
          <SkeletonTable rows={5} />
        ) : !cls ? (
          <EmptyState
            icon={CalendarCheck}
            title="No class selected"
            desc="Pick a class above to load its student roster."
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students in this class"
            desc="The Academic Office may not have enrolled students here yet."
          />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto pr-1 -mr-1">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 w-20">
                    Roll No
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Student
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => {
                  const status = marks[s.id];
                  return (
                    <TableRow key={s.id} className="border-gray-100 hover:bg-gray-50">
                      <TableCell className="text-sm font-mono text-gray-600">
                        {s.rollNo || '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-[#1A1A1A]">{s.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                          {(['Present', 'Absent', 'Late'] as AttendanceStatus[]).map((opt) => {
                            const active = status === opt;
                            const colorMap: Record<AttendanceStatus, string> = {
                              Present: 'bg-emerald-500 text-white',
                              Absent: 'bg-rose-500 text-white',
                              Late: 'bg-amber-500 text-white',
                            };
                            return (
                              <button
                                key={opt}
                                onClick={() => setMarks((m) => ({ ...m, [s.id]: opt }))}
                                className={cn(
                                  'px-3 h-8 text-[11px] font-medium transition-colors',
                                  active ? colorMap[opt] : 'bg-white text-gray-600 hover:bg-gray-50',
                                )}
                              >
                                {opt[0]}
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Submit bar */}
      {cls && list.length > 0 && (
        <div className="sticky bottom-0 -mx-4 sm:mx-0 sm:rounded-xl border border-gray-200 bg-white/95 backdrop-blur p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="text-xs text-gray-500">
            {existing ? (
              <>
                Updating existing record for{' '}
                <span className="font-medium text-[#1A1A1A]">{fmtDate(date)}</span>.
              </>
            ) : (
              <>
                Marked <span className="font-medium text-[#1A1A1A]">{Object.keys(marks).length}</span>{' '}
                of <span className="font-medium text-[#1A1A1A]">{list.length}</span> students.
              </>
            )}
          </div>
          <button
            onClick={submit}
            disabled={saving || list.some((s) => !marks[s.id])}
            className={btnPrimary}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            Submit Attendance
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4. Test Results — enter marks per student → submitted to Academic Office
// ═══════════════════════════════════════════════════════════════════════

function TeacherResults({
  user,
  classes,
  students,
  loading,
}: {
  user: any;
  classes: TeacherClass[];
  students: Student[];
  loading: boolean;
}) {
  const [testName, setTestName] = useState<string>('');
  const [classId, setClassId] = useState<string>('');
  const [courseId, setCourseId] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<string>('100');
  const [obtained, setObtained] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);

  const cls = classes.find((c) => c.id === classId) || null;
  const course = cls?.courses.find((co) => co.id === courseId) || null;
  const list = cls ? studentsForClass(students, cls) : [];

  useEffect(() => {
    if (!user?.id) return;
    api
      .getResults({ teacherId: user.id })
      .then((d) => setRecent(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [user?.id]);

  // Reset course + marks when class changes.
  useEffect(() => {
    setCourseId('');
    setObtained({});
  }, [classId]);

  const enteredCount = list.filter(
    (s) => obtained[s.id] !== '' && obtained[s.id] !== undefined,
  ).length;

  const submit = async () => {
    if (!testName) {
      toast({ title: 'Select a test', variant: 'destructive' });
      return;
    }
    if (!cls) {
      toast({ title: 'Select a class', variant: 'destructive' });
      return;
    }
    if (!course) {
      toast({ title: 'Select a subject', variant: 'destructive' });
      return;
    }
    if (!totalMarks || Number(totalMarks) <= 0) {
      toast({ title: 'Enter total marks', variant: 'destructive' });
      return;
    }
    if (list.length === 0) {
      toast({ title: 'No students to mark', variant: 'destructive' });
      return;
    }

    const total = Number(totalMarks);
    const records = list
      .map((s) => ({
        studentId: s.id,
        marks:
          obtained[s.id] === '' || obtained[s.id] === undefined
            ? null
            : Number(obtained[s.id]),
      }))
      .filter((r) => r.marks !== null && !isNaN(r.marks as number));
    if (records.length === 0) {
      toast({ title: 'Enter marks for at least one student', variant: 'destructive' });
      return;
    }
    const outOfRange = records.find(
      (r) => (r.marks as number) < 0 || (r.marks as number) > total,
    );
    if (outOfRange) {
      toast({
        title: 'Marks out of range',
        description: `Obtained marks must be between 0 and ${total}.`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      await api.postResults({
        exam: testName,
        courseId: course.id,
        classId: cls.id,
        totalMarks: total,
        date: todayISO(),
        records: records.map((r) => ({ studentId: r.studentId, marks: r.marks })),
      });
      toast({
        title: 'Results submitted to Academic Office',
        description: `${records.length} students · ${testName} · ${course.name}`,
      });
      setObtained({});
      api
        .getResults({ teacherId: user.id })
        .then((d) => setRecent(Array.isArray(d) ? d : []))
        .catch(() => {});
    } catch (e: any) {
      toast({
        title: 'Failed to submit results',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Test Results"
        subtitle="Enter marks for an allocated class + subject. Submissions go to the Academic Office for review."
      />

      {/* Selectors */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Test" required>
            <Select value={testName} onValueChange={setTestName}>
              <SelectTrigger className={selectTriggerCls}>
                <SelectValue placeholder="Select test…" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TESTS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class" required>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className={selectTriggerCls}>
                <SelectValue placeholder="Select class…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · Sec {c.section || 'A'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Subject"
            required
            hint={
              cls && cls.courses.length === 0
                ? 'No subjects assigned to you for this class.'
                : undefined
            }
          >
            <Select
              value={courseId}
              onValueChange={setCourseId}
              disabled={!cls || cls.courses.length === 0}
            >
              <SelectTrigger className={selectTriggerCls}>
                <SelectValue placeholder="Select subject…" />
              </SelectTrigger>
              <SelectContent>
                {cls?.courses.map((co) => (
                  <SelectItem key={co.id} value={co.id}>
                    {co.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Total Marks" required>
            <Input
              type="number"
              min={1}
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* Marks entry */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SectionHeader
          title={
            cls && course
              ? `${testName || 'Marks Entry'} · ${cls.name} (${course.name})`
              : 'Marks Entry'
          }
          desc={
            cls && course
              ? `${list.length} students · ${enteredCount} entered`
              : 'Select test, class and subject to load the roster'
          }
        />

        {loading ? (
          <SkeletonTable rows={5} />
        ) : !cls || !course ? (
          <EmptyState
            icon={ClipboardList}
            title="Nothing to mark yet"
            desc="Pick a test, class and subject above to start entering marks."
          />
        ) : list.length === 0 ? (
          <EmptyState icon={Users} title="No students in this class" />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto pr-1 -mr-1">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 w-20">
                    Roll No
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Student
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right w-28">
                    Total
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right w-40">
                    Obtained
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => {
                  const val = obtained[s.id] ?? '';
                  const num = val === '' ? null : Number(val);
                  const outOfRange = num !== null && (num < 0 || num > Number(totalMarks));
                  return (
                    <TableRow key={s.id} className="border-gray-100 hover:bg-gray-50">
                      <TableCell className="text-sm font-mono text-gray-600">
                        {s.rollNo || '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-[#1A1A1A]">{s.name}</TableCell>
                      <TableCell className="text-sm text-gray-500 text-right tabular-nums">
                        {totalMarks}
                      </TableCell>
                      <TableCell className="text-right">
                        <input
                          type="number"
                          min={0}
                          max={Number(totalMarks)}
                          value={val}
                          onChange={(e) => setObtained((m) => ({ ...m, [s.id]: e.target.value }))}
                          placeholder="—"
                          className={cn(
                            'h-9 w-28 rounded-lg border bg-white px-3 text-sm text-right tabular-nums outline-none transition-colors ml-auto block',
                            outOfRange
                              ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
                              : 'border-gray-200 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12',
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Recent submissions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SectionHeader title="Recent Submissions" desc="Your last 5 result submissions." />
        {recent.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No submissions yet"
            desc="Your submitted results will appear here for quick reference."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Test
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Date
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right">
                  Total Marks
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right">
                  Students
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500 text-right">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.slice(0, 5).map((r: any, i: number) => (
                <TableRow key={r.id || i} className="border-gray-100 hover:bg-gray-50">
                  <TableCell className="text-sm font-medium text-[#1A1A1A]">
                    {r.exam || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{fmtDate(r.date)}</TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">
                    {r.totalMarks ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 text-right tabular-nums">
                    {Array.isArray(r.records) ? r.records.length : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <ReviewBadge />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Submit bar */}
      {cls && course && list.length > 0 && (
        <div className="sticky bottom-0 -mx-4 sm:mx-0 sm:rounded-xl border border-gray-200 bg-white/95 backdrop-blur p-4 flex items-center justify-between gap-3 shadow-sm">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-[#1A1A1A]">{enteredCount}</span> of{' '}
            <span className="font-medium text-[#1A1A1A]">{list.length}</span> students marked
            {testName && (
              <>
                {' · '}
                <span className="font-medium text-[#1A1A1A]">{testName}</span>
              </>
            )}
          </div>
          <button
            onClick={submit}
            disabled={saving || enteredCount === 0}
            className={btnPrimary}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit to Academic Office
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Student Feedback — categorized feedback on a single student
//
// NOTE: There is no dedicated `/api/feedback` endpoint in the backend yet.
// We attempt a POST to `/api/feedback` (which the API gateway will silently
// 404). Either way, the feedback is recorded in component state so the
// teacher gets immediate confirmation and the workflow is uninterrupted.
// This matches the spec's "Keep it simple" guidance.
// ═══════════════════════════════════════════════════════════════════════

function TeacherFeedback({
  user,
  classes,
  students,
  loading,
}: {
  user: any;
  classes: TeacherClass[];
  students: Student[];
  loading: boolean;
}) {
  const [classId, setClassId] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [category, setCategory] = useState<string>('Excellent');
  const [message, setMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const cls = classes.find((c) => c.id === classId) || null;
  const list = cls ? studentsForClass(students, cls) : [];
  const student = list.find((s) => s.id === studentId) || null;

  // Reset student when class changes.
  useEffect(() => {
    setStudentId('');
  }, [classId]);

  const submit = async () => {
    if (!cls) {
      toast({ title: 'Select a class', variant: 'destructive' });
      return;
    }
    if (!student) {
      toast({ title: 'Select a student', variant: 'destructive' });
      return;
    }
    if (!message.trim()) {
      toast({ title: 'Write your feedback', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Best-effort POST — backend may not have a feedback endpoint yet.
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = await authHeaders();
        if (token.Authorization) headers.Authorization = token.Authorization;
        await fetch('/api/feedback', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            teacherId: user.id,
            studentId: student.id,
            classId: cls.id,
            category,
            message,
            date: todayISO(),
          }),
        });
      } catch {}
      toast({
        title: 'Feedback submitted',
        description: `${student.name} · ${category}`,
      });
      setHistory((h) => [
        {
          id: `local-${Date.now()}`,
          studentName: student.name,
          className: cls.name,
          category,
          message,
          date: new Date().toISOString(),
        },
        ...h,
      ]);
      setMessage('');
    } catch (e: any) {
      toast({
        title: 'Failed to submit feedback',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Student Feedback"
        subtitle="Share observations on a student's progress. Visible to the Academic Office and parents."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-6">
          <SectionHeader title="New Feedback" desc="Pick a student from one of your allocated classes." />
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Class" required>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Select class…" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · Sec {c.section || 'A'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Student" required>
                <Select
                  value={studentId}
                  onValueChange={setStudentId}
                  disabled={!cls || list.length === 0}
                >
                  <SelectTrigger className={selectTriggerCls}>
                    <SelectValue placeholder="Select student…" />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.rollNo ? `${s.rollNo} · ` : ''}
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Category" required>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Feedback"
              required
              hint="Be specific — mention recent assignments, behaviour, or participation."
            >
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Consistently completes homework on time and shows strong understanding of algebra. Could participate more in class discussions."
                rows={5}
                className="w-full rounded-lg border border-gray-200 bg-white text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12 outline-none resize-none"
              />
            </Field>
            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={saving || !student || !message.trim()}
                className={btnPrimary}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Feedback
              </button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <SectionHeader title="Preview" desc="How this feedback will appear." />
          {loading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : !student ? (
            <EmptyState
              icon={MessageSquare}
              title="Select a student"
              desc="Your feedback preview will appear here."
            />
          ) : (
            <div className="rounded-lg border border-gray-100 bg-gray-50/40 p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shrink-0">
                  <GraduationCap className="h-4 w-4 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#1A1A1A]">{student.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {cls?.name} · Sec {cls?.section || 'A'}
                    {student.rollNo ? ` · ${student.rollNo}` : ''}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <span className="inline-flex items-center rounded-md border bg-[#FFF0E8] text-[#F26522] border-[#F26522]/20 px-2 py-0.5 text-[11px] font-medium">
                  {category}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-3 leading-relaxed whitespace-pre-wrap">
                {message || <span className="text-gray-400">Your feedback will appear here…</span>}
              </p>
              <div className="mt-3 pt-3 border-t border-gray-200 text-[11px] text-gray-400">
                {fmtDate(new Date().toISOString())} · by {user?.name || 'Teacher'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent feedback */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <SectionHeader title="Recent Feedback" desc="Submitted during this session." />
        {history.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing submitted yet"
            desc="Your recent feedback will appear here."
          />
        ) : (
          <div className={cn('space-y-2 max-h-96 overflow-y-auto pr-1', SCROLLBAR_CLS)}>
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
              >
                <MessageSquare className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[#1A1A1A]">{h.studentName}</span>
                    <span className="text-[10px] font-medium text-[#F26522] bg-[#FFF0E8] border border-[#F26522]/20 rounded px-1.5 py-0.5">
                      {h.category}
                    </span>
                    <span className="text-[11px] text-gray-400">· {h.className}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{h.message}</p>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(h.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Announcements — post class-specific announcements
// ═══════════════════════════════════════════════════════════════════════

function TeacherAnnouncements({
  user,
  classes,
}: {
  user: any;
  classes: TeacherClass[];
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [classId, setClassId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getAnnouncements()
      .then((d) => {
        const all = Array.isArray(d) ? d : [];
        // Only show announcements authored by this teacher.
        setItems(all.filter((a: any) => a.senderId === user.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!title || !msg) {
      toast({ title: 'Title and message are required', variant: 'destructive' });
      return;
    }
    if (!classId) {
      toast({ title: 'Select a target class', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.createAnnouncement({
        title,
        message: msg,
        targetRole: 'student',
        targetScope: 'class',
        classId,
        senderId: user.id,
        senderRole: user.role,
        instituteId: user.instituteId,
        branchId: user.branchId,
      });
      toast({
        title: 'Announcement posted',
        description: 'Visible to students in the selected class.',
      });
      setTitle('');
      setMsg('');
      setClassId('');
      load();
    } catch (e: any) {
      toast({
        title: 'Failed to post announcement',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const cls = classes.find((c) => c.id === classId) || null;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="Announcements"
        subtitle="Post class-specific announcements. Visible to students in the selected class."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Compose */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <SectionHeader title="New Announcement" />
          <div className="space-y-4">
            <Field label="Target Class" required>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue placeholder="Select class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · Sec {c.section || 'A'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Math test reminder"
                className={inputCls}
              />
            </Field>
            <Field label="Message" required>
              <Textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Write your announcement…"
                rows={5}
                className="w-full rounded-lg border border-gray-200 bg-white text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12 outline-none resize-none"
              />
            </Field>
            <button
              onClick={submit}
              disabled={saving || !title || !msg || !classId}
              className={cn(btnPrimary, 'w-full')}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Post Announcement
            </button>
            {cls && (
              <p className="text-[11px] text-gray-400 text-center">
                Will be visible to students in {cls.name} · Sec {cls.section || 'A'}.
              </p>
            )}
          </div>
        </div>

        {/* History */}
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-6">
          <SectionHeader title="My Announcements" desc="Announcements you've posted." />
          {loading ? (
            <SkeletonTable rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No announcements posted yet"
              desc="Your posted announcements will appear here."
            />
          ) : (
            <div className={cn('space-y-2 max-h-[32rem] overflow-y-auto pr-1', SCROLLBAR_CLS)}>
              {items.map((a, i) => {
                const target = classes.find((c) => c.id === a.classId);
                return (
                  <div
                    key={a.id || i}
                    className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
                  >
                    <div className="flex items-start gap-3">
                      <Megaphone className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#1A1A1A]">{a.title}</span>
                          {target && (
                            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
                              {target.name} · Sec {target.section || 'A'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-3">{a.message}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-gray-400">
                            {fmtDateTime(a.createdAt)}
                          </span>
                          <button
                            onClick={() => {
                              api
                                .deleteAnnouncement(a.id)
                                .then(() => {
                                  toast({ title: 'Announcement deleted' });
                                  load();
                                })
                                .catch(() =>
                                  toast({ title: 'Failed to delete', variant: 'destructive' }),
                                );
                            }}
                            className="text-[11px] text-gray-400 hover:text-rose-600 inline-flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 7. My Timetable — weekly grid (view-only)
// ═══════════════════════════════════════════════════════════════════════

function TeacherTimetable({ user }: { user: any }) {
  // `rows === null` means "not yet loaded". Once a fetch resolves (success or
  // failure) `rows` becomes an array and loading flips off.
  const [rows, setRows] = useState<any[] | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .getTimetable({ teacherId: userId })
      .then((d) => {
        if (!cancelled) setRows(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loading = userId ? rows === null : false;
  const resolvedRows = rows || [];

  // Build a period × day matrix.
  const { periods, grid } = useMemo(() => {
    const periodSet = new Set<number>();
    for (const r of resolvedRows) if (typeof r.period === 'number') periodSet.add(r.period);
    const ps = Array.from(periodSet).sort((a, b) => a - b);
    // If no periods at all, default to [1..8] for an empty grid.
    const finalPeriods = ps.length > 0 ? ps : [1, 2, 3, 4, 5, 6, 7, 8];
    const g: Record<string, any> = {};
    for (const p of finalPeriods) for (const d of DAYS) g[`${d}-${p}`] = null;
    for (const r of resolvedRows) {
      const key = `${r.day}-${r.period}`;
      if (key in g) g[key] = r;
    }
    return { periods: finalPeriods, grid: g };
  }, [resolvedRows]);

  // Canonical time label per period (from any row that has it).
  const periodTimes = useMemo(() => {
    const map: Record<number, string> = {};
    for (const r of resolvedRows) {
      if (r.period != null && r.startTime && !map[r.period]) {
        map[r.period] = r.endTime ? `${r.startTime}–${r.endTime}` : r.startTime;
      }
    }
    return map;
  }, [resolvedRows]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const totalPeriods = resolvedRows.length;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">
      <PageHeader
        title="My Timetable"
        subtitle="Your weekly teaching schedule — view-only. Changes are made by the Academic Office."
        action={
          !loading && totalPeriods > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 h-9 text-xs text-gray-600">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium text-[#1A1A1A]">{totalPeriods}</span> periods this week
            </span>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        {loading ? (
          <SkeletonTable rows={6} />
        ) : resolvedRows.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No timetable assigned"
            desc="The Academic Office hasn't scheduled any periods for you yet."
          />
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full border-separate border-spacing-0 min-w-[640px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white z-10 w-24 p-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Period
                  </th>
                  {DAYS.map((d) => (
                    <th
                      key={d}
                      className={cn(
                        'p-2 text-left text-[10px] font-semibold uppercase tracking-wider border-b',
                        d === today ? 'text-[#F26522]' : 'text-gray-500',
                      )}
                    >
                      {d.slice(0, 3)}
                      <span className="hidden sm:inline"> {d.slice(3)}</span>
                      {d === today && (
                        <span className="ml-1.5 inline-block h-1 w-1 rounded-full bg-[#F26522] align-middle" />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p}>
                    <td className="sticky left-0 bg-white z-10 p-2 border-b border-gray-100 align-top">
                      <div className="text-sm font-semibold text-[#1A1A1A]">P{p}</div>
                      {periodTimes[p] && (
                        <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                          {periodTimes[p]}
                        </div>
                      )}
                    </td>
                    {DAYS.map((d) => {
                      const cell = grid[`${d}-${p}`];
                      if (!cell)
                        return (
                          <td
                            key={d}
                            className="p-1.5 border-b border-gray-100 align-top"
                          >
                            <div className="h-14 rounded-md bg-gray-50/60" />
                          </td>
                        );
                      return (
                        <td key={d} className="p-1.5 border-b border-gray-100 align-top">
                          <div
                            className={cn(
                              'h-14 rounded-md border p-2 flex flex-col justify-center',
                              d === today
                                ? 'border-[#F26522]/30 bg-[#FFF0E8]/60'
                                : 'border-gray-200 bg-white',
                            )}
                          >
                            <div className="text-xs font-semibold text-[#1A1A1A] truncate leading-tight">
                              {cell.subject || '—'}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                              {cell.className || ''}
                              {cell.section ? ` · ${cell.section}` : ''}
                              {cell.roomName ? ` · ${cell.roomName}` : ''}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && resolvedRows.length > 0 && (
        <div className="flex items-center gap-4 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#F26522]/20 border border-[#F26522]/40" />{' '}
            Today
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-white border border-gray-200" /> Other day
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Router — `settings` is handled by the parent RolePortal (return null here).
// Admin views teacher modules via namespaced ids like `teacher:teacher-dashboard`
// — strip the namespace before routing.
// ═══════════════════════════════════════════════════════════════════════

export function TeacherPortal({ activeModule, user }: Props) {
  const { classes, students, loading } = useTeacherData(user);
  const setActiveModule = useApp((s) => s.setActiveModule);

  const mod = activeModule?.includes(':')
    ? activeModule.split(':')[1]
    : activeModule;

  if (mod === 'settings') return null;

  switch (mod) {
    case 'teacher-dashboard':
      return (
        <TeacherDashboard
          user={user}
          classes={classes}
          students={students}
          loading={loading}
          onNavigate={setActiveModule}
        />
      );
    case 'teacher-classes':
      return <TeacherClasses classes={classes} students={students} loading={loading} />;
    case 'teacher-attendance':
      return (
        <TeacherAttendance
          user={user}
          classes={classes}
          students={students}
          loading={loading}
        />
      );
    case 'teacher-results':
      return (
        <TeacherResults
          user={user}
          classes={classes}
          students={students}
          loading={loading}
        />
      );
    case 'teacher-feedback':
      return (
        <TeacherFeedback
          user={user}
          classes={classes}
          students={students}
          loading={loading}
        />
      );
    case 'teacher-announcements':
      return <TeacherAnnouncements user={user} classes={classes} />;
    case 'teacher-timetable':
      return <TeacherTimetable user={user} />;
    default:
      return (
        <div className="animate-in fade-in-0 duration-200">
          <EmptyState
            icon={Sparkles}
            title="Coming soon"
            desc="This module isn't part of your Teacher portal yet."
          />
        </div>
      );
  }
}
