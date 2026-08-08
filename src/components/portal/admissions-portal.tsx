'use client';

// ============================================================================
// Concordia College — Admission Office Portal
//
// Responsibilities:
//   1. Dashboard — KPI cards + recharts analytics (Enrollments by Program)
//   2. New Enrollment — 3-step wizard with optional base-fee lock
//   3. Student Records — department → part → class → section drill-down
//      hierarchy, plus per-student document manager (upload / download /
//      delete). Search bar bypasses the hierarchy for quick lookups.
//
// Design language: Concordia orange (#F26522) accent on a clean gray/white
// base. shadcn/ui components, framer-motion entrance animations.
// ============================================================================

import { useEffect, useMemo, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useApp, useNavState } from '@/lib/store';
import { isNativeApp } from '@/lib/session-store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  UserPlus,
  GraduationCap,
  DollarSign,
  Lock,
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit,
  CalendarDays,
  Hash,
  TrendingUp,
  Users,
  Clock,
  Info,
  KeyRound,
  Download,
  Phone,
  Printer,
  FileText,
  Trash2,
  Upload,
  FileUp,
  Inbox,
  ArrowLeft,
  FolderOpen,
  Eye,
  FileImage,
  FileType2,
  ShieldCheck,
  Paperclip,
} from 'lucide-react';
import {
  buildAdmissionReceipt,
  savePdf,
  printPdf,
} from '@/lib/pdf-utils';
import {
  DeptCardGrid,
  PartToggle,
  ClassCardGrid,
  SectionCardGrid,
  HierarchyBreadcrumb,
  DEPARTMENTS,
  deptLabel,
} from './shared/concordia-hierarchy';
import {
  SimpleBarChart,
  SimplePieChart,
  ChartCard,
} from './shared/concordia-charts';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------
const PROGRAMS = [...DEPARTMENTS];

const fmtMoney = (n: number) => 'PKR ' + Number(n || 0).toLocaleString('en-PK');

const isLocked = (s: any) =>
  Boolean(s?.baseFeeLocked) && s?.baseFee != null && s.baseFee !== '';

const monthName = (d: Date) =>
  d.toLocaleString('en-PK', { month: 'short', year: 'numeric' });

const genTempPassword = () =>
  'tmp-' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

// A default login password the Accountant/Academic hands out; student changes it.
const genStudentPassword = () =>
  'concordia' + Math.floor(1000 + Math.random() * 9000).toString();

// Whether a student already has a REAL login (not the tmp- placeholder created
// by admissions / Excel import). Matches the accountant portal's hasRealLogin.
const studentHasLogin = (s: any): boolean => {
  if (!s) return false;
  if (s.email && !String(s.email).includes('@pending.')) return true;
  if (s.password && !String(s.password).startsWith('tmp-')) return true;
  return false;
};

const fmtDate = (d?: string | Date | null): string => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const fmtBytes = (bytes: number): string => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type Props = { activeModule: string; user: any };

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------
export function AdmissionsPortal({ activeModule, user }: Props) {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wire the global module-switcher so the Overview quick-action cards can
  // deep-link into the New Enrollment and Student Records pages.
  const setActiveModule = useApp((s) => s.setActiveModule);

  // Initial + branch-change load. Loads both students AND classes in parallel
  // — classes are needed by the new hierarchy Student Records view.
  // All setState calls happen inside async promise callbacks (not in the
  // effect body) to avoid cascading renders.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.platformUsers({ role: 'student', branchId: user?.branchId }),
      api.getClasses(user?.branchId),
    ])
      .then(([stu, cls]) => {
        if (cancelled) return;
        setStudents(Array.isArray(stu) ? stu : []);
        setClasses(Array.isArray(cls) ? cls : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load admissions data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.branchId]);

  // Manual refresh — re-loads both lists.
  const refresh = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.platformUsers({ role: 'student', branchId: user?.branchId }),
      api.getClasses(user?.branchId),
    ])
      .then(([stu, cls]) => {
        setStudents(Array.isArray(stu) ? stu : []);
        setClasses(Array.isArray(cls) ? cls : []);
      })
      .catch((e) => setError(e.message || 'Failed to load admissions data'))
      .finally(() => setLoading(false));
  };

  // Optimistic local upsert — keeps the UI responsive while the backend
  // catches up.
  const upsertLocal = (s: any) =>
    setStudents((prev) => {
      const idx = prev.findIndex((x) => x.id === s.id);
      if (idx === -1) return [s, ...prev];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...s };
      return copy;
    });

  let content: React.ReactNode;
  if (activeModule === 'admissions-new')
    content = (
      <NewEnrollmentView
        user={user}
        students={students}
        onCreated={refresh}
        onLocalUpsert={upsertLocal}
      />
    );
  else if (activeModule === 'admissions-students')
    content = (
      <StudentRecordsView
        user={user}
        students={students}
        classes={classes}
        loading={loading}
        error={error}
        onRefresh={refresh}
        onLocalUpsert={upsertLocal}
      />
    );
  else
    content = (
      <OverviewView
        user={user}
        students={students}
        loading={loading}
        onNavigate={(id) => setActiveModule(id)}
      />
    );

  return (
    <div className="animate-in fade-in-0 duration-200">
      {/* Local scrollbar styling — injected once for all child views. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .concordia-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .concordia-scroll::-webkit-scrollbar-track { background: transparent; }
        .concordia-scroll::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.15);
          border-radius: 9999px;
        }
        .concordia-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
      `}} />
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared presentational bits
// ---------------------------------------------------------------------------

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <div className="h-0.5 w-8 bg-[#F26522] mb-3" />
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 transition-all hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 active:scale-[0.98] group min-h-[88px] sm:min-h-[104px] flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#FFF4ED] grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-[#F26522] group-hover:text-white transition-colors" />
        </div>
      </div>
      <div className="min-w-0 mt-1.5">
        <div className="text-xl sm:text-2xl font-bold text-gray-900 truncate tabular-nums leading-tight">{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5 truncate">{label}</div>
        {hint && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</div>}
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function StatusBadge({ student }: { student: any }) {
  if (isLocked(student))
    return (
      <Badge
        variant="outline"
        className="bg-emerald-50 text-emerald-700 border-transparent gap-1"
      >
        <Lock className="h-3 w-3" /> Locked
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-700 border-transparent gap-1"
    >
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
}

function BaseFeeCallout() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex gap-3">
      <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
      <div className="text-sm text-gray-600 leading-relaxed">
        <p className="font-semibold text-gray-900">
          Base Fee is set once by the Admission Office and locked forever.
        </p>
        <p className="mt-1">
          The Accountant may later split this amount into installments, but{' '}
          <span className="font-medium text-gray-900">cannot change the base amount</span>.
          Double-check the figure before clicking{' '}
          <span className="font-medium text-gray-900">Finalize &amp; Lock</span> — there is no
          undo.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  desc,
  action,
}: {
  icon: any;
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 text-center">
      <Icon className="h-6 w-6 text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs font-semibold text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-[#F26522] ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span
        className={`text-sm font-medium text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

const inputCls =
  'h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12';

// Custom scrollbar utility for long lists.
const scrollListCls =
  'max-h-96 overflow-y-auto concordia-scroll';

// ---------------------------------------------------------------------------
// Coming Soon — used for the retired admissions-base-fee module id.
// ---------------------------------------------------------------------------
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-12 w-12 rounded-xl bg-[#FFF0E8] grid place-items-center mb-4">
        <Inbox className="h-6 w-6 text-[#F26522]" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 max-w-sm">
        This module has been retired. Fee records are now managed by the Accountant.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Overview / Dashboard
// ---------------------------------------------------------------------------
function OverviewView({
  user,
  students,
  loading,
  onNavigate,
}: {
  user: any;
  students: any[];
  loading: boolean;
  onNavigate: (moduleId: string) => void;
}) {
  const now = useMemo(() => new Date(), []);

  const recent = useMemo(
    () =>
      [...students]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 5),
    [students],
  );

  const thisMonthCount = useMemo(() => {
    const m = now.getMonth();
    const y = now.getFullYear();
    return students.filter((s) => {
      const d = s.createdAt ? new Date(s.createdAt) : null;
      return !!d && d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }, [students, now]);

  const pendingFee = useMemo(() => students.filter((s) => !isLocked(s)), [students]);
  const lockedCount = students.length - pendingFee.length;
  const lockedSum = useMemo(
    () =>
      students
        .filter((s) => isLocked(s))
        .reduce((acc, s) => acc + Number(s.baseFee || 0), 0),
    [students],
  );

  // Enrollment by program — counts students whose program is one of the
  // canonical 6 departments. Always render all 6 departments in the catalog
  // order so the chart stays stable as counts change.
  const byProgram = useMemo(() => {
    const map = new Map<string, number>();
    for (const dept of DEPARTMENTS) map.set(dept, 0);
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map.has(p)) map.set(p, (map.get(p) || 0) + 1);
    }
    return DEPARTMENTS.map((dept) => ({
      label: deptLabel(dept),
      value: map.get(dept) || 0,
    }));
  }, [students]);

  // Pie data — same as bar but with non-zero filter handled by SimplePieChart.
  const pieData = byProgram;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] || 'Officer'}`}
        subtitle="Register new students, finalize base fees, and manage enrollment records — all in one place."
      />

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] sm:h-[104px] rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          <KpiCard
            label="Enrolled Students"
            value={students.length}
            icon={GraduationCap}
            hint="All records in this branch"
          />
          <KpiCard
            label="This Month"
            value={thisMonthCount}
            icon={TrendingUp}
            hint={monthName(now)}
          />
          <KpiCard
            label="Pending Base Fee"
            value={pendingFee.length}
            icon={Clock}
            hint="Awaiting finalization"
          />
          <KpiCard
            label="Base Fee Locked"
            value={lockedCount}
            icon={Lock}
            hint={fmtMoney(lockedSum)}
          />
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
      >
        <button
          type="button"
          onClick={() => onNavigate('admissions-new')}
          className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Quick Action
              </div>
              <div className="text-base font-bold text-gray-900 mt-1.5">
                New Enrollment
              </div>
              <div className="text-xs text-amber-700/80 mt-1">
                Register a new student with the 3-step enrollment wizard
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
              <UserPlus className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('admissions-students')}
          className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Quick Action
              </div>
              <div className="text-base font-bold text-gray-900 mt-1.5">
                Student Records
              </div>
              <div className="text-xs text-amber-700/80 mt-1">
                Browse, search, and manage enrolled student records
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
              <Users className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
            </div>
          </div>
        </button>
      </motion.div>

      {/* Analytics charts */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ChartCard
            title="Enrollments by Program"
            subtitle="Student count across the 6 departments"
            className="lg:col-span-2"
          >
            {students.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No enrollment data yet" desc="" />
            ) : (
              <SimpleBarChart
                data={byProgram}
                height={260}
                yLabel="Students"
                formatValue={(v) => `${v} student${v === 1 ? '' : 's'}`}
              />
            )}
          </ChartCard>
          <ChartCard
            title="Enrollment Distribution"
            subtitle="Share by department"
          >
            {students.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No distribution data yet" desc="" />
            ) : (
              <SimplePieChart data={pieData} height={260} donut />
            )}
          </ChartCard>
        </div>
      )}

      {/* Recent admissions table */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recent Admissions</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 5 enrolled students</p>
          </div>
        </div>
        {loading ? (
          <SkeletonTable rows={5} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students enrolled yet"
            desc="Use New Enrollment to add the first one."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Name
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Class
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Roll #
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                  Base Fee
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-center">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((s) => (
                <TableRow
                  key={s.id}
                  className="border-gray-100 hover:bg-gray-50"
                >
                  <TableCell className="text-sm font-medium text-gray-900">
                    {s.name}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">
                    {s.class || '—'}
                    {s.section ? ` · ${s.section}` : ''}
                  </TableCell>
                  <TableCell className="text-sm font-mono text-gray-700">
                    {s.rollNo || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700 text-right">
                    {isLocked(s) ? fmtMoney(Number(s.baseFee)) : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge student={s} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. New Enrollment
// ---------------------------------------------------------------------------
type EnrollForm = {
  name: string;
  fatherName: string;
  cnic: string;
  dob: string;
  address: string;
  prevResult: string;
  program: string;
  classId: string;
  section: string;
  rollNo: string;
  guardian: string;
  guardianPhone: string;
  baseFee: string;
};

const emptyForm: EnrollForm = {
  name: '',
  fatherName: '',
  cnic: '',
  dob: '',
  address: '',
  prevResult: '',
  program: '',
  classId: '',
  section: '',
  rollNo: '',
  guardian: '',
  guardianPhone: '',
  baseFee: '',
};

function NewEnrollmentView({
  user,
  students,
  onCreated,
  onLocalUpsert,
}: {
  user: any;
  students: any[];
  onCreated: () => void;
  onLocalUpsert: (s: any) => void;
}) {
  const [form, setForm] = useState<EnrollForm>(emptyForm);
  const [classes, setClasses] = useState<any[]>([]);
  const [reference, setReference] = useState<{ sections: string[] }>({ sections: [] });
  const [saving, setSaving] = useState(false);
  const [feeLocked, setFeeLocked] = useState(false);
  const [created, setCreated] = useState<any>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [cnicWarning, setCnicWarning] = useState<string | null>(null);

  useEffect(() => {
    if (user?.branchId) {
      api
        .getClasses(user.branchId)
        .then((r) => setClasses(Array.isArray(r) ? r : []))
        .catch(() => setClasses([]));
    }
    api
      .reference()
      .then((r) => setReference({ sections: r?.sections || ['A', 'B', 'C'] }))
      .catch(() => setReference({ sections: ['A', 'B', 'C'] }));
  }, [user?.branchId]);

  useEffect(() => {
    if (!form.classId) return;
    const inClass = students.filter((s) => s.classId === form.classId);
    const year = new Date().getFullYear();
    const seq = inClass.length + 1;
    setForm((f) => ({ ...f, rollNo: `STU-${year}-${String(seq).padStart(3, '0')}` }));
  }, [form.classId]);

  useEffect(() => {
    const cnic = form.cnic.trim();
    if (!cnic) {
      setCnicWarning(null);
      return;
    }
    const t = setTimeout(() => {
      const match = students.find(
        (s) => s.cnic && String(s.cnic).trim() === cnic,
      );
      if (match) {
        setCnicWarning(
          `A student with this CNIC is already enrolled: ${match.name} (${match.rollNo}). Verify this is a different person before saving.`,
        );
      } else {
        setCnicWarning(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.cnic, students]);

  const set = (k: keyof EnrollForm, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const markTouched = (k: string) =>
    setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const err = (k: keyof EnrollForm, label: string): React.ReactNode =>
    touched[k] && !form[k].trim() ? (
      <p className="text-[11px] text-red-500 mt-1">{label} is required.</p>
    ) : null;

  const validateStep = (n: 1 | 2 | 3): boolean => {
    if (n === 1) {
      const required: (keyof EnrollForm)[] = ['name', 'guardian', 'cnic'];
      const missing = required.filter((k) => !form[k].trim());
      if (missing.length) {
        setTouched((t) => {
          const next = { ...t };
          for (const k of missing) next[k] = true;
          return next;
        });
        toast({
          title: 'Please complete required fields',
          description: 'Highlighted fields on this step are required.',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    }
    if (n === 2) {
      // Class + Roll Number are assigned later by the Accountant — Admission
      // only records the program at enrollment.
      const required: (keyof EnrollForm)[] = ['program'];
      const missing = required.filter((k) => !form[k].trim());
      if (missing.length) {
        setTouched((t) => {
          const next = { ...t };
          for (const k of missing) next[k] = true;
          return next;
        });
        toast({
          title: 'Please select a program',
          description: 'Program is required for enrollment.',
          variant: 'destructive',
        });
        return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => (s === 1 ? 2 : s === 2 ? 3 : s));
  };

  const goBack = () => setStep((s) => (s === 3 ? 2 : s === 2 ? 1 : s));

  const lockFeeNow = () => {
    const v = Number(form.baseFee);
    if (!form.baseFee || isNaN(v) || v <= 0) {
      toast({
        title: 'Enter a valid amount',
        description: 'Base fee must be a positive number.',
        variant: 'destructive',
      });
      return;
    }
    setFeeLocked(true);
    toast({
      title: 'Base fee staged',
      description: `${fmtMoney(v)} will be locked permanently once you save the enrollment.`,
    });
  };

  const submit = async () => {
    if (!validateStep(1)) {
      setStep(1);
      return;
    }
    if (!validateStep(2)) {
      setStep(2);
      return;
    }

    const selectedClass = classes.find((c) => c.id === form.classId);

    const rollNoTrim = form.rollNo.trim();
    // Roll number is optional at admission (assigned by the Accountant). Only
    // guard against duplicates when one was actually entered.
    if (rollNoTrim) {
      const dupStudent = students.find(
        (s) => (s.rollNo || '').toLowerCase() === rollNoTrim.toLowerCase(),
      );
      if (dupStudent) {
        toast({
          title: 'Duplicate Roll Number',
          description: `Roll Number "${rollNoTrim}" is already used by ${dupStudent.name}. Please use a different roll number.`,
          variant: 'destructive',
        });
        setStep(2);
        return;
      }
    }

    const body: any = {
      name: form.name.trim(),
      rollNo: rollNoTrim || null,
      password: genTempPassword(),
      // Unique pending email → no real login yet (Accountant provisions later).
      email: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@pending.concordia.edu.pk`,
      role: 'student',
      instituteId: user?.instituteId,
      branchId: user?.branchId,
      class: selectedClass?.name || null,
      classId: form.classId || null,
      section: form.section || selectedClass?.section || 'A',
      guardian: form.guardian.trim() || null,
      fatherName: form.guardian.trim(),
      guardianPhone: form.guardianPhone.trim() || null,
      cnic: form.cnic.trim(),
      dob: form.dob || null,
      address: form.address.trim() || null,
      prevResult: form.prevResult.trim() || null,
      program: form.program,
      photoUrl: null,
    };
    if (feeLocked && form.baseFee) {
      body.baseFee = Number(form.baseFee);
      body.baseFeeLocked = true;
    }

    setSaving(true);
    try {
      const res = await api.createPlatformUser(body);
      const newStudent: any = {
        id: res?.user?.id || `local-${Date.now()}`,
        ...body,
        baseFee: body.baseFee ?? null,
        baseFeeLocked: !!body.baseFeeLocked,
        createdAt: new Date().toISOString(),
      };
      onLocalUpsert(newStudent);
      onCreated();
      setCreated(newStudent);
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      const isDuplicate =
        e?.status === 409 ||
        msg.includes('already') ||
        msg.includes('duplicate') ||
        msg.includes('exists');
      if (isDuplicate) {
        toast({
          title: 'Could not enroll student',
          description: e?.message || 'A student with this roll number, email, or CNIC already exists.',
          variant: 'destructive',
        });
        setStep(2);
        return;
      }
      const newStudent: any = {
        id: `local-${Date.now()}`,
        ...body,
        baseFee: body.baseFee ?? null,
        baseFeeLocked: !!body.baseFeeLocked,
        createdAt: new Date().toISOString(),
      };
      onLocalUpsert(newStudent);
      setCreated(newStudent);
      toast({
        title: 'Saved in this session',
        description:
          (e?.message || 'Backend sync failed') +
          ' — the record is visible here and will sync once the admissions API is wired.',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm({ ...emptyForm });
    setFeeLocked(false);
    setCreated(null);
    setStep(1);
    setTouched({});
    setCnicWarning(null);
  };

  const [receiptBusy, setReceiptBusy] = useState<'download' | 'print' | null>(null);

  const buildReceiptDoc = async () => {
    return buildAdmissionReceipt({
      instituteName: user?.instituteName,
      branchName: user?.branchName,
      docTitle: 'Enrollment Receipt',
      docSubtitle: 'Admission Office',
      refLabel: 'Receipt No.',
      refValue: created.rollNo,
      studentName: created.name,
      rollNo: created.rollNo,
      program: created.program,
      className: created.class || '',
      section: created.section,
      baseFee: created.baseFee,
      baseFeeLocked: created.baseFeeLocked,
      guardian: created.guardian,
      guardianPhone: created.guardianPhone,
      cnic: created.cnic,
      dob: created.dob,
      address: created.address,
      enrolledAt: created.createdAt,
    });
  };

  const handleDownloadReceipt = async () => {
    setReceiptBusy('download');
    try {
      const doc = await buildReceiptDoc();
      savePdf(doc, `Enrollment-${created.rollNo}.pdf`);
      toast({ title: 'Receipt downloaded', description: `Enrollment-${created.rollNo}.pdf` });
    } catch (e: any) {
      toast({
        title: 'Could not generate PDF',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setReceiptBusy(null);
    }
  };

  const handlePrintReceipt = async () => {
    setReceiptBusy('print');
    try {
      const doc = await buildReceiptDoc();
      printPdf(doc);
    } catch (e: any) {
      toast({
        title: 'Could not open print dialog',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setReceiptBusy(null);
    }
  };

  if (created) {
    return (
      <div className="max-w-xl mx-auto">
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                body * { visibility: hidden !important; }
                .print-receipt, .print-receipt * { visibility: visible !important; }
                .print-receipt {
                  position: absolute !important;
                  left: 0; top: 0; right: 0;
                  width: 100% !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 24px !important;
                  border: none !important;
                  box-shadow: none !important;
                }
                .no-print { display: none !important; }
              }
            `,
          }}
        />
        <div className="print-receipt rounded-xl border border-gray-200 bg-white p-8 text-center">
          <div className="h-0.5 w-8 bg-[#F26522] mx-auto mb-4" />
          <CheckCircle2 className="h-9 w-9 text-emerald-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Enrollment Confirmed</h2>
          <p className="text-sm text-gray-500 mt-1.5">
            <span className="font-medium text-gray-900">{created.name}</span> has been
            registered in{' '}
            <span className="font-medium text-gray-900">{created.program}</span>.
          </p>
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left text-sm space-y-2">
            <Row label="Roll Number" value={created.rollNo} mono />
            <Row
              label="Class"
              value={`${created.class || '—'}${created.section ? ' · ' + created.section : ''}`}
            />
            <Row
              label="Base Fee"
              value={
                created.baseFeeLocked ? fmtMoney(Number(created.baseFee)) : 'Not finalized yet'
              }
            />
            <Row
              label="Status"
              value={created.baseFeeLocked ? 'Locked' : 'Pending finalization'}
            />
          </div>
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left flex gap-3">
            <KeyRound className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-relaxed">
              Login credentials are <span className="font-medium text-gray-900">not</span>{' '}
              created at this stage. The Accountant will issue the student&apos;s email &amp;
              password after the first fee payment.
            </p>
          </div>
          <div className="flex flex-col gap-2 mt-6 no-print">
            <p className="text-xs text-gray-500 text-left">
              Save a copy of this enrollment receipt — choose download or print.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium flex-1"
                onClick={handleDownloadReceipt}
                disabled={receiptBusy !== null}
              >
                {receiptBusy === 'download' ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                Download PDF
              </Button>
              <Button
                variant="outline"
                className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium flex-1"
                onClick={handlePrintReceipt}
                disabled={receiptBusy !== null}
              >
                {receiptBusy === 'print' ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4 mr-1.5" />
                )}
                Print Receipt
              </Button>
            </div>
            <Button
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium w-full mt-1"
              onClick={reset}
            >
              <Plus className="h-4 w-4 mr-1.5" /> Enroll Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const stepLabels = ['Personal', 'Academic', 'Fees'];
  const stepIndicator = (
    <div className="sticky top-0 z-20 py-3 bg-white/95 backdrop-blur border-y border-gray-200">
      <div className="relative max-w-md mx-auto">
        <div className="absolute left-4 right-4 top-[18px] h-px bg-gray-200" />
        <div
          className="absolute left-4 top-[18px] h-px bg-[#F26522] transition-all duration-300"
          style={{
            width:
              step === 1
                ? '0px'
                : step === 2
                  ? 'calc(50% - 1rem)'
                  : 'calc(100% - 2rem)',
          }}
        />
        <div className="relative flex justify-between items-start">
          {[1, 2, 3].map((n, i) => {
            const isActive = step === n;
            const isDone = step > n;
            return (
              <div key={n} className="flex flex-col items-center">
                <div
                  className={`h-9 w-9 rounded-full grid place-items-center text-sm font-semibold border-2 bg-white shrink-0 ${
                    isActive || isDone
                      ? 'bg-[#F26522] text-white border-[#F26522]'
                      : 'bg-white text-gray-400 border-gray-200'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : n}
                </div>
                <span
                  className={`text-[11px] font-medium mt-1.5 ${
                    isActive ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {stepLabels[i]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="New Enrollment"
        subtitle="Capture the student's personal details and finalize the one-time base fee."
      />

      {stepIndicator}

      {/* === Step 1 — Personal Information === */}
      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Personal Information</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Student identity and contact details.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Student Name" required>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                onBlur={() => markTouched('name')}
                placeholder="e.g. Ahmed Raza"
                className={inputCls}
              />
              {err('name', 'Student name')}
            </Field>
            <Field label="Father / Guardian Name" required>
              <Input
                value={form.guardian}
                onChange={(e) => set('guardian', e.target.value)}
                onBlur={() => markTouched('guardian')}
                placeholder="e.g. Muhammad Raza"
                className={inputCls}
              />
              {err('guardian', 'Father / Guardian name')}
            </Field>
            <Field label="Father / Guardian Contact Number">
              <div className="relative">
                <Phone className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={form.guardianPhone}
                  onChange={(e) => set('guardianPhone', e.target.value)}
                  placeholder="e.g. 0300-1234567"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
            <Field label="CNIC / B-Form Number" required>
              <div className="relative">
                <Hash className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={form.cnic}
                  onChange={(e) => set('cnic', e.target.value)}
                  onBlur={() => markTouched('cnic')}
                  placeholder="xxxxx-xxxxxxx-x"
                  className={`${inputCls} pl-9`}
                />
              </div>
              {err('cnic', 'CNIC / B-Form number')}
              {cnicWarning && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-snug">
                    ⚠ {cnicWarning}
                  </p>
                </div>
              )}
            </Field>
            <Field label="Date of Birth">
              <div className="relative">
                <CalendarDays className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="date"
                  value={form.dob}
                  onChange={(e) => set('dob', e.target.value)}
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
            <Field label="Previous Academic Result">
              <Input
                value={form.prevResult}
                onChange={(e) => set('prevResult', e.target.value)}
                placeholder="e.g. Matric — 85% (A Grade)"
                className={inputCls}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address">
                <Textarea
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="House #, Street, Area, City"
                  rows={2}
                  className="rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12"
                />
              </Field>
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <Button
              type="button"
              onClick={goNext}
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-5 text-sm font-medium min-w-32"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* === Step 2 — Academic Placement === */}
      {step === 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Academic Placement</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Program, class, and roll number.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Course / Program" required>
              <Select
                value={form.program}
                onValueChange={(v) => {
                  set('program', v);
                  markTouched('program');
                }}
              >
                <SelectTrigger className={`${inputCls} w-full`}>
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {PROGRAMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {deptLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('program', 'Program')}
            </Field>
            {/* Class + Roll Number are NOT set here — the Accountant assigns them
                later when collecting the fee / providing the login. */}
            <div className="sm:col-span-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-500">
              <span className="font-medium text-gray-700">Class &amp; Roll Number</span> are
              assigned later by the Accountant (when the fee is collected). Admission only
              records the program here.
            </div>
          </div>

          <div className="flex gap-2 justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={goNext}
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-5 text-sm font-medium min-w-32"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* === Step 3 — Base Fee Finalization === */}
      {step === 3 && (
        <div className="space-y-6">
          <BaseFeeCallout />

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Base Fee Finalization</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  One-time amount, locked permanently on save.
                </p>
              </div>
              {feeLocked && (
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-transparent gap-1"
                >
                  <Lock className="h-3 w-3" /> Staged for Lock
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label="Base Fee Amount (PKR)">
                <div className="relative">
                  <DollarSign className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    min={0}
                    value={form.baseFee}
                    onChange={(e) => {
                      set('baseFee', e.target.value);
                      if (feeLocked) setFeeLocked(false);
                    }}
                    placeholder="e.g. 45000"
                    className={`${inputCls} pl-9`}
                    disabled={feeLocked}
                  />
                </div>
              </Field>
              <Button
                type="button"
                className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-10 px-5 text-sm font-medium"
                onClick={lockFeeNow}
                disabled={feeLocked}
              >
                {feeLocked ? (
                  <>
                    <Lock className="h-4 w-4 mr-1.5" /> Locked
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-1.5" /> Finalize &amp; Lock
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {feeLocked
                ? 'Base fee is staged. It will be permanently locked when you save the enrollment.'
                : 'Optional at enrollment — you can also lock it later from Base Fee Finalization. Once locked, it cannot be edited.'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Review &amp; Save</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Confirm the enrollment details below before saving.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="Student" value={form.name || '—'} />
              <Row label="Father / Guardian" value={form.guardian || '—'} />
              <Row label="CNIC" value={form.cnic || '—'} mono />
              <Row label="Program" value={form.program || '—'} />
              <Row
                label="Class"
                value={
                  form.classId
                    ? `${classes.find((c) => c.id === form.classId)?.name || '—'}${form.section ? ' · ' + form.section : ''}`
                    : '—'
                }
              />
              <Row label="Roll #" value={form.rollNo || '—'} mono />
              <Row
                label="Base Fee"
                value={
                  feeLocked && form.baseFee ? fmtMoney(Number(form.baseFee)) : 'Not finalized'
                }
              />
            </div>
          </div>

          <div className="flex gap-2 justify-between pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium"
            >
              Back
            </Button>
            <Button
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium min-w-40"
              onClick={submit}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Save Enrollment
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Student Records — department → part → class → section → student table
// ---------------------------------------------------------------------------
type Drill = {
  dept: string | null;
  part: string;          // '1' | '2' — default '1'
  cls: { id: string; name: string; section: string } | null;
  section: { id: string; name: string; section: string } | null;
};

// Exported so the Accountant portal can render the EXACT same Student Records
// page (hierarchy + search + document manager + edit sheet) without duplicating
// ~400 lines of code. See accountant-portal.tsx → case 'accountant-students'.
export function StudentRecordsView({
  user,
  students,
  classes,
  loading,
  error,
  onRefresh,
  onLocalUpsert,
}: {
  user: any;
  students: any[];
  classes: any[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onLocalUpsert: (s: any) => void;
}) {
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useNavState<Drill>('admissions-students', { dept: null, part: '1', cls: null, section: null });
  const [editing, setEditing] = useState<any | null>(null);
  const [docStudent, setDocStudent] = useState<any | null>(null);

  // ── Counts per department — count students whose program matches one of
  // the canonical 6 departments. Legacy programs (ICS, F.Sc Pre-Medical, …)
  // are silently excluded from the per-department count but still searchable.
  const studentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const dept of DEPARTMENTS) map[dept] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return map;
  }, [students]);

  // ── Search results — flat table bypassing the hierarchy when the user
  // types anything into the search box.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) =>
      s.name?.toLowerCase().includes(q) ||
      s.guardian?.toLowerCase().includes(q) ||
      s.fatherName?.toLowerCase().includes(q) ||
      s.rollNo?.toLowerCase().includes(q) ||
      s.cnic?.toLowerCase().includes(q)
    );
  }, [students, search]);

  const isSearching = search.trim().length > 0;

  // ── Classes for the currently-selected department + part. A class row in
  // the `classes` table may have program + part columns; legacy rows have
  // nulls and won't match — that's fine, they won't show in the hierarchy
  // but their students are still searchable.
  const classesInDept = useMemo(() => {
    if (!drill.dept) return [];
    return classes.filter(
      (c) =>
        (c.program || '').trim() === drill.dept &&
        String(c.part || '') === drill.part,
    );
  }, [classes, drill.dept, drill.part]);

  // ── Sections of the currently-selected class (same name, different
  // section letters). Used to decide whether to show the SectionCardGrid or
  // skip straight to the student table.
  const sectionsOfClass = useMemo(() => {
    if (!drill.cls) return [];
    return classes.filter((c) => c.name === drill.cls!.name);
  }, [classes, drill.cls]);

  const hasMultipleSections = sectionsOfClass.length > 1;

  // ── Final student list to show in the student table.
  // Match by TEXT on (student.class === cls.name && student.section === cls.section).
  // If multiple sections, drill.section drives the match; otherwise drill.cls.
  const tableStudents = useMemo(() => {
    const target = drill.section || drill.cls;
    if (!target) return [];
    return students.filter(
      (s) =>
        (s.class || '') === target.name &&
        (s.section || '') === target.section,
    );
  }, [students, drill.cls, drill.section]);

  // ── Student count helpers for the card grids.
  const getStudentCountForClass = (clsId: string) => {
    const c = classes.find((x) => x.id === clsId);
    if (!c) return 0;
    return students.filter(
      (s) => (s.class || '') === c.name && (s.section || '') === c.section,
    ).length;
  };

  const handleSelectDept = (dept: string) =>
    setDrill({ dept, part: '1', cls: null, section: null });

  const handleSelectClass = (cls: { id: string; name: string; section: string }) => {
    // Always open the section step so the exact section name(s) and count are
    // shown — even when the class has a single section.
    setDrill({ ...drill, cls, section: null });
  };

  const handleSelectSection = (section: {
    id: string;
    name: string;
    section: string;
  }) => setDrill({ ...drill, cls: section, section });

  const handleClearHierarchy = () =>
    setDrill({ dept: null, part: '1', cls: null, section: null });

  // ── Header actions: refresh only.
  const headerActions = (
    <Button
      variant="outline"
      className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium"
      onClick={onRefresh}
    >
      <Loader2 className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
      Refresh
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Records"
        subtitle="Browse by department → part → class → section, or search by name, roll #, or CNIC for a quick lookup."
        actions={headerActions}
      />

      {/* Search bar — always visible. Drives the flat-search fallback. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, father / guardian, roll #, or CNIC…"
            className={`${inputCls} pl-9`}
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
              {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      ) : isSearching ? (
        // ── Flat search results — bypass hierarchy ──
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Search Results</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Matching students across all departments
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              onClick={() => setSearch('')}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to hierarchy
            </Button>
          </div>
          <StudentTable
            students={searchResults}
            loading={loading}
            onEdit={setEditing}
            onDocs={setDocStudent}
            emptyTitle={students.length === 0 ? 'No students enrolled yet' : 'No matching records'}
            emptyDesc={
              students.length === 0
                ? 'Start by enrolling your first student from the New Enrollment tab.'
                : 'Try adjusting your search query.'
            }
          />
        </div>
      ) : !drill.dept ? (
        // ── Level 1: Department cards ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Select a Department</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Browse the 6 Concordia departments to drill into their classes and students.
            </p>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : (
            <DeptCardGrid
              onSelect={handleSelectDept}
              studentCounts={studentCounts}
            />
          )}
        </motion.div>
      ) : !drill.section ? (
        // ── Level 2 (merged): Part toggle + section cards, shown directly ──
        // In the flatten model the Program IS the class, so we skip the
        // redundant class-card step: after Department + Part we list the
        // program's sections right here (with their exact names + counts).
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <HierarchyBreadcrumb
            dept={drill.dept}
            part={drill.part}
            onClear={handleClearHierarchy}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {deptLabel(drill.dept)} · Part {drill.part} — {classesInDept.length} Section{classesInDept.length === 1 ? '' : 's'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Pick Part 1 / Part 2, then choose a section to view its students.
              </p>
            </div>
            <PartToggle value={drill.part} onChange={(p) =>
              setDrill((d) => ({ ...d, part: p, cls: null, section: null }))
            } />
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : classesInDept.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                No sections yet for {deptLabel(drill.dept)} · Part {drill.part}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                The Academic Office adds sections from Classes &amp; Teachers. You can still
                search students by name or CNIC above.
              </p>
            </div>
          ) : (
            <SectionCardGrid
              sections={classesInDept}
              onSelect={handleSelectSection}
              getStudentCount={getStudentCountForClass}
            />
          )}
        </motion.div>
      ) : (
        // ── Level 4: Student table ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <HierarchyBreadcrumb
            dept={drill.dept}
            part={drill.part}
            cls={drill.cls.name}
            section={(drill.section || drill.cls).section}
            onClear={handleClearHierarchy}
          />
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {drill.cls.name} · Section {(drill.section || drill.cls).section}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {tableStudents.length} student{tableStudents.length === 1 ? '' : 's'} enrolled
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                onClick={() =>
                  setDrill((d) => ({ ...d, cls: null, section: null }))
                }
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back to sections
              </Button>
            </div>
            <StudentTable
              students={tableStudents}
              loading={loading}
              onEdit={setEditing}
              onDocs={setDocStudent}
              emptyTitle="No students in this class yet"
              emptyDesc="Enroll students from the New Enrollment tab to populate this class."
            />
          </div>
        </motion.div>
      )}

      {/* Edit sheet */}
      <EditStudentSheet
        student={editing}
        user={user}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          onLocalUpsert(updated);
          setEditing(null);
        }}
      />

      {/* Document manager dialog */}
      <DocumentManagerDialog
        student={docStudent}
        onClose={() => setDocStudent(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StudentTable — shared table used by both the hierarchy drill-down and the
// flat search results.
// ---------------------------------------------------------------------------
function StudentTable({
  students,
  loading,
  onEdit,
  onDocs,
  emptyTitle,
  emptyDesc,
}: {
  students: any[];
  loading: boolean;
  onEdit: (s: any) => void;
  onDocs: (s: any) => void;
  emptyTitle: string;
  emptyDesc: string;
}) {
  if (loading) return <SkeletonTable rows={6} />;
  if (students.length === 0)
    return (
      <EmptyState
        icon={GraduationCap}
        title={emptyTitle}
        desc={emptyDesc}
      />
    );
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-200 hover:bg-transparent">
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Roll #
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Name
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Father / Guardian
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Contact
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
              CNIC
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Program
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
              Documents
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((s) => (
            <TableRow key={s.id} className="border-gray-100 hover:bg-gray-50">
              <TableCell className="text-sm font-mono text-gray-700">
                {s.rollNo || '—'}
              </TableCell>
              <TableCell className="text-sm font-medium text-gray-900">
                {s.name}
              </TableCell>
              <TableCell className="text-sm text-gray-700">
                {s.guardian || s.fatherName || '—'}
              </TableCell>
              <TableCell className="text-sm text-gray-700">
                {s.guardianPhone || '—'}
              </TableCell>
              <TableCell className="text-sm font-mono text-gray-700">
                {s.cnic || '—'}
              </TableCell>
              <TableCell className="text-sm text-gray-700">
                {s.program || '—'}
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    onClick={() => onEdit(s)}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-[#F26522] hover:text-[#D4541E] hover:bg-[#FFF0E8] font-semibold"
                    onClick={() => onDocs(s)}
                  >
                    <FolderOpen className="h-3.5 w-3.5 mr-1" /> Documents
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentManagerDialog — upload / list / download / delete per-student docs.
// ---------------------------------------------------------------------------
const DOC_ACCEPT =
  '.jpg,.jpeg,.png,.pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MAX_BYTES = 5 * 1024 * 1024; // 5 MB safety cap — base64 will inflate by ~33%

function DocumentManagerDialog({
  student,
  onClose,
}: {
  student: any | null;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docName, setDocName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents whenever a new student is opened.
  useEffect(() => {
    if (!student) {
      setDocs([]);
      setDocName('');
      setFile(null);
      return;
    }
    setLoadingDocs(true);
    api
      .getStudentDocuments(student.id)
      .then((r) => setDocs(Array.isArray(r) ? r : []))
      .catch((e) => {
        toast({
          title: 'Could not load documents',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
        setDocs([]);
      })
      .finally(() => setLoadingDocs(false));
  }, [student]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    // Auto-fill the document name from the file name (without extension) if empty.
    if (f && !docName.trim()) {
      const baseName = f.name.replace(/\.[^/.]+$/, '');
      setDocName(baseName);
    }
  };

  const onUpload = async () => {
    if (!student) return;
    if (!file) {
      toast({
        title: 'Select a file',
        description: 'Pick a file to upload before clicking Upload.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      toast({
        title: 'File too large',
        description: `Maximum allowed size is ${(DOC_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.`,
        variant: 'destructive',
      });
      return;
    }
    const name = docName.trim() || file.name.replace(/\.[^/.]+$/, '');
    if (!name) {
      toast({
        title: 'Enter a document name',
        description: 'e.g. Father CNIC, Student B-Form, Previous Results.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      // Convert to base64 data URL via FileReader.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const created = await api.uploadStudentDocument({
        studentId: student.id,
        name,
        fileName: file.name,
        fileType: file.type || '',
        fileSize: file.size,
        dataUrl,
      });

      setDocs((prev) => [created, ...prev]);
      setDocName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast({
        title: 'Document uploaded',
        description: `${name} — ${file.name}`,
      });
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      const res = await api.downloadStudentDocument(id);
      const dataUrl: string | undefined = res?.dataUrl;
      if (!dataUrl) {
        toast({
          title: 'Download failed',
          description: 'No file content returned.',
          variant: 'destructive',
        });
        return;
      }
      // ── Mobile app path ──
      // Inside the Flutter WebView, <a download> + blob: URLs are blocked
      // by Android. Hand off to the native bridge — it decodes the base64,
      // writes a temp file, and opens the Android share sheet so the user
      // can save to Downloads or share via WhatsApp.
      if (isNativeApp() && (window as any).concordiaNative?.downloadDocument) {
        (window as any).concordiaNative.downloadDocument(
          dataUrl,
          res?.fileName || 'document',
          res?.fileType || '',
        );
        toast({
          title: 'Opening share sheet…',
          description: 'Pick "Save to Downloads" or any app to save the file.',
        });
        return;
      }
      // ── Web browser path ──
      // Convert the data URL to a Blob and trigger a real download via an
      // <a download> element with a blob: URL. This is the ONLY reliable
      // way to download data-URL content in modern browsers — assigning a
      // data: URL to window.location or a popup's location.href is silently
      // blocked by Chrome / Firefox / Safari (top-level navigation to data:
      // URLs was deprecated for security in Chrome 60+).
      const byteString = atob((dataUrl.split(',')[1] || ''));
      const mimeMatch = dataUrl.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = res?.fileName || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke the blob URL after a short delay so the download has time
      // to start in older browsers.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (e: any) {
      toast({
        title: 'Download failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Open a preview of the document in a new browser tab. Blob URLs CAN be
  // navigated to (unlike data: URLs), so this works reliably for images
  // and PDFs. Office documents (.doc/.docx) typically download instead.
  const onPreview = async (id: string) => {
    setDownloadingId(id);
    try {
      const res = await api.downloadStudentDocument(id);
      const dataUrl: string | undefined = res?.dataUrl;
      if (!dataUrl) {
        toast({ title: 'Preview failed', description: 'No file content returned.', variant: 'destructive' });
        return;
      }
      // ── Mobile app path ──
      // Hand off to the native bridge — it writes a temp file and opens
      // the Android share sheet so the user can pick a viewer (Photos,
      // PDF reader, etc.). window.open(blob:) doesn't work in WebView.
      if (isNativeApp() && (window as any).concordiaNative?.previewDocument) {
        (window as any).concordiaNative.previewDocument(
          dataUrl,
          res?.fileName || 'document',
          res?.fileType || '',
        );
        return;
      }
      // ── Web browser path ──
      const byteString = atob((dataUrl.split(',')[1] || ''));
      const mimeMatch = dataUrl.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      // Give the new tab time to load before revoking.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  // Decide whether a document is previewable. In the web browser, only
  // images + PDFs can be previewed (Office docs don't render in-browser).
  // In the native mobile app, the share sheet can open ANY file type via
  // the user's installed apps, so always show the Preview button.
  const isPreviewable = (_d: any) => {
    if (isNativeApp()) return true;
    const t = (_d.fileType || '').toLowerCase();
    const n = (_d.fileName || '').toLowerCase();
    return t.startsWith('image/') || t === 'application/pdf' ||
      /\.(jpg|jpeg|png|gif|webp|pdf)$/i.test(n);
  };

  // Pick the right file-type icon for a document.
  const fileIcon = (d: any) => {
    const t = (d.fileType || '').toLowerCase();
    const n = (d.fileName || '').toLowerCase();
    if (t.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(n)) return FileImage;
    if (t === 'application/pdf' || /\.pdf$/i.test(n)) return FileType2;
    return FileText;
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.deleteStudentDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
      toast({ title: 'Document deleted', description: name });
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Aggregate stats for the header summary strip.
  const totalSize = docs.reduce((sum, d) => sum + Number(d.fileSize || 0), 0);

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[97vw] sm:max-w-5xl bg-white max-h-[94vh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl shadow-2xl">
        {/* ── Header: gradient accent + student identity + summary stats ── */}
        <DialogHeader className="px-6 pt-6 pb-5 border-b border-gray-100 shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFF4ED] via-white to-white pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#F26522]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-12 w-12 rounded-xl bg-[#F26522] grid place-items-center shrink-0 shadow-sm shadow-[#F26522]/30">
                <FolderOpen className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  Student Document Vault
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-0.5">
                  Securely upload, preview, download, and manage scanned documents.
                </DialogDescription>
              </div>
            </div>
            {student && (
              <div className="hidden sm:flex items-center gap-3 shrink-0 rounded-xl border border-gray-200 bg-white/80 backdrop-blur px-3 py-2">
                <div className="h-9 w-9 rounded-full border border-gray-200 bg-gray-50 grid place-items-center shrink-0">
                  <GraduationCap className="h-4 w-4 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">
                    {student.name}
                  </p>
                  <p className="text-[11px] font-mono text-gray-500">
                    Roll # {student.rollNo || '—'}
                    {student.class ? ` · ${student.class}` : ''}
                    {student.section ? ` · ${student.section}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Summary stat chips */}
          <div className="relative flex flex-wrap items-center gap-2 mt-4">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
              <Paperclip className="h-3.5 w-3.5 text-[#F26522]" />
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{docs.length}</span>
              <span className="text-[11px] text-gray-500">{docs.length === 1 ? 'document' : 'documents'}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-900 tabular-nums">{fmtBytes(totalSize)}</span>
              <span className="text-[11px] text-gray-500">total</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700">Encrypted at rest</span>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body: two-column on desktop — documents grid (left) + upload panel (right) ── */}
        <div className="flex-1 overflow-y-auto concordia-scroll min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
            {/* Left: existing documents */}
            <div className="lg:col-span-3 p-5 sm:p-6 lg:border-r border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#F26522]" />
                  Uploaded Documents
                </h3>
                {docs.length > 0 && (
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                    {docs.length} {docs.length === 1 ? 'file' : 'files'}
                  </span>
                )}
              </div>

              {loadingDocs ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-xl" />
                  ))}
                </div>
              ) : docs.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-white border border-gray-200 grid place-items-center mx-auto mb-3 shadow-sm">
                    <FileText className="h-7 w-7 text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">No documents yet</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    Upload the student's CNIC, B-Form, previous results, photos, or any other
                    scanned document using the panel on the right.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {docs.map((d) => {
                    const Icon = fileIcon(d);
                    const previewable = isPreviewable(d);
                    return (
                      <div
                        key={d.id}
                        className="group rounded-xl border border-gray-200 bg-white hover:border-[#F26522]/40 hover:shadow-sm transition-all overflow-hidden"
                      >
                        <div className="p-3.5">
                          <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#FFF4ED] to-[#FFF0E8] border border-[#F26522]/10 grid place-items-center shrink-0">
                              <Icon className="h-5 w-5 text-[#F26522]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 truncate" title={d.name}>
                                {d.name}
                              </p>
                              <p className="text-[11px] text-gray-500 truncate" title={d.fileName}>
                                {d.fileName || '—'}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                                <span className="tabular-nums">{fmtBytes(Number(d.fileSize || 0))}</span>
                                {d.createdAt && (
                                  <>
                                    <span>·</span>
                                    <span>{fmtDate(d.createdAt)}</span>
                                  </>
                                )}
                              </div>
                              {d.uploadedByName && (
                                <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                                  by {d.uploadedByName}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="px-3.5 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-1">
                          {previewable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] font-medium text-gray-600 hover:text-[#F26522] hover:bg-[#FFF0E8]"
                              onClick={() => onPreview(d.id)}
                              disabled={downloadingId === d.id}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Preview
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] font-medium text-gray-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => onDownload(d.id)}
                            disabled={downloadingId === d.id}
                          >
                            {downloadingId === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5 mr-1" />
                            )}
                            Download
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] font-medium text-gray-500 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => onDelete(d.id, d.name)}
                            disabled={deletingId === d.id}
                          >
                            {deletingId === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: upload panel */}
            <div className="lg:col-span-2 p-5 sm:p-6 bg-gray-50/40">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                <FileUp className="h-4 w-4 text-[#F26522]" />
                Upload New Document
              </h3>

              <div className="space-y-4">
                <Field label="Document Name" required>
                  <Input
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="e.g. Father CNIC, Student B-Form, Previous Results"
                    className={inputCls}
                  />
                </Field>

                <Field label="File" required>
                  <label
                    className={`block cursor-pointer rounded-xl border-2 border-dashed transition-all ${
                      file
                        ? 'border-[#F26522]/40 bg-[#FFF0E8]/40'
                        : 'border-gray-300 bg-white hover:border-[#F26522]/50 hover:bg-[#FFF4ED]/30'
                    } px-4 py-5 text-center`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={DOC_ACCEPT}
                      onChange={onFileChange}
                      className="sr-only"
                    />
                    {file ? (
                      <div className="flex items-center justify-center gap-2.5">
                        <div className="h-9 w-9 rounded-lg bg-[#F26522] grid place-items-center shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-semibold text-gray-900 truncate max-w-[180px]" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-[11px] text-gray-500 tabular-nums">
                            {fmtBytes(file.size)} · click to replace
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="h-10 w-10 rounded-lg bg-white border border-gray-200 grid place-items-center mx-auto mb-2">
                          <Upload className="h-5 w-5 text-gray-400" />
                        </div>
                        <p className="text-xs font-semibold text-gray-700">
                          Click to choose a file
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          JPG, PNG, PDF, DOC, DOCX · max {(DOC_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
                        </p>
                      </div>
                    )}
                  </label>
                </Field>

                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1">
                    <Info className="h-3 w-3" /> Tips
                  </p>
                  <ul className="text-[11px] text-gray-600 space-y-1">
                    <li>• Use clear, scanned copies for CNIC and B-Form.</li>
                    <li>• PDF is preferred for multi-page documents.</li>
                    <li>• Files are stored securely and only visible to authorised staff.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer: pinned action bar ── */}
        <div className="px-6 py-3.5 border-t border-gray-100 bg-white shrink-0 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-400 hidden sm:block">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'} · {fmtBytes(totalSize)} total
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-4 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              type="button"
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-5 text-sm font-medium shadow-sm shadow-[#F26522]/30"
              onClick={onUpload}
              disabled={uploading || !file}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1.5" /> Upload Document
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 4. EditStudentSheet — unchanged from prior implementation.
// ---------------------------------------------------------------------------
// ── Fees & Login panel ──
// Shown on the student detail sheet. The Accountant / Academic Office mark the
// fee Paid and then provide the login (enter the college roll number → a default
// password is generated). Admin / Admission see status only (read-only).
function StudentFeeLoginPanel({
  student,
  user,
  onUpdated,
}: {
  student: any;
  user: any;
  onUpdated: (u: any) => void;
}) {
  const role = user?.role;
  const canAct = role === 'accountant' || role === 'academic';
  const [feePaid, setFeePaid] = useState<boolean>(!!student.baseFeePaid);
  const [hasLogin, setHasLogin] = useState<boolean>(studentHasLogin(student));
  const [rollNoInput, setRollNoInput] = useState<string>(student.rollNo || '');
  const [creds, setCreds] = useState<{ rollNo: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFeePaid(!!student.baseFeePaid);
    setHasLogin(studentHasLogin(student));
    setRollNoInput(student.rollNo || '');
    setCreds(null);
  }, [student]);

  const markPaid = async () => {
    setBusy(true);
    try {
      await api.editUser(student.id, { baseFeePaid: true });
      setFeePaid(true);
      onUpdated({ ...student, baseFeePaid: 1 });
      toast({ title: 'Fee marked as paid', description: student.name });
    } catch (e: any) {
      toast({ title: 'Could not mark paid', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const provideLogin = async () => {
    const rn = rollNoInput.trim();
    if (!rn) { toast({ title: 'Enter the roll number first', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const password = 'concordia1234'; // default first-time password
      const email = `${rn.toLowerCase()}@concordia.edu.pk`;
      await api.editUser(student.id, { rollNo: rn, email, password });
      setHasLogin(true);
      setCreds({ rollNo: rn, password });
      onUpdated({ ...student, rollNo: rn, email, password });
      toast({ title: 'Login provided', description: `Roll no ${rn}` });
    } catch (e: any) {
      toast({ title: 'Could not provide login', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // Reset a forgotten login back to the default password (roll number kept).
  const resetLogin = async () => {
    const rn = (student.rollNo || rollNoInput).trim();
    if (!rn) { toast({ title: 'No roll number on file', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const password = 'concordia1234';
      await api.editUser(student.id, { password });
      setCreds({ rollNo: rn, password });
      onUpdated({ ...student, password });
      toast({ title: 'Login reset', description: `Password reset to the default for ${rn}` });
    } catch (e: any) {
      toast({ title: 'Could not reset login', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[#F26522]" />
        <h4 className="text-sm font-semibold text-gray-900">Fees &amp; Login</h4>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 ${feePaid ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
          Fee: {feePaid ? 'Paid' : 'Unpaid'}
        </span>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 ${hasLogin ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500'}`}>
          Login: {hasLogin ? `Active · ${student.rollNo || rollNoInput || '—'}` : 'Not provided'}
        </span>
        {student.baseFee != null && student.baseFee !== '' && (
          <span className="text-gray-500">Base fee: {fmtMoney(Number(student.baseFee))}</span>
        )}
      </div>

      {!canAct ? (
        <p className="text-xs text-gray-500">
          Only the Accountant / Academic Office can mark the fee paid and provide the login.
        </p>
      ) : hasLogin ? (
        <div className="space-y-2">
          <p className="text-xs text-emerald-700">
            Login is active. The student signs in with their roll number and changes the password on first login.
          </p>
          <button
            onClick={resetLogin}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Reset Login (to default)
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {!feePaid ? (
            <button
              onClick={markPaid}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Mark Fee Paid
            </button>
          ) : (
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Roll Number (assigned by college)</label>
                <Input value={rollNoInput} onChange={(e) => setRollNoInput(e.target.value)} placeholder="e.g. 1024" className={inputCls} />
              </div>
              <button
                onClick={provideLogin}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg bg-[#F26522] hover:bg-[#D4541E] text-white px-3 py-2 text-xs font-semibold h-10 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Provide Login
              </button>
            </div>
          )}
          {creds && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 space-y-1">
              <p className="font-semibold">Login created — share with the student:</p>
              <p>Roll No / Username: <span className="font-mono font-bold">{creds.rollNo}</span></p>
              <p>Password: <span className="font-mono font-bold">{creds.password}</span></p>
              <p className="text-emerald-600">They change it on first login.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditStudentSheet({
  student,
  user,
  onClose,
  onSaved,
}: {
  student: any | null;
  user: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name || '',
        fatherName: student.fatherName || '',
        cnic: student.cnic || '',
        dob: student.dob || '',
        address: student.address || '',
        prevResult: student.prevResult || '',
        program: student.program || '',
        guardian: student.guardian || '',
        guardianPhone: student.guardianPhone || '',
        section: student.section || 'A',
      });
    }
  }, [student]);

  if (!student) return null;
  const locked = isLocked(student);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim())
      return toast({ title: 'Name is required', variant: 'destructive' });
    setSaving(true);
    const body: any = {
      name: form.name.trim(),
      fatherName: form.guardian.trim(),
      guardian: form.guardian.trim(),
      guardianPhone: form.guardianPhone.trim(),
      cnic: form.cnic.trim(),
      dob: form.dob || null,
      address: form.address.trim(),
      prevResult: form.prevResult.trim(),
      program: form.program,
      section: form.section,
    };
    try {
      await api.editUser(student.id, body);
      toast({ title: 'Student updated', description: form.name });
    } catch (e: any) {
      toast({
        title: 'Saved in this session',
        description: (e?.message || 'Backend sync failed') + ' — changes are visible locally.',
      });
    } finally {
      setSaving(false);
      onSaved({ ...student, ...body });
    }
  };

  return (
    <Sheet open={!!student} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white">
        <SheetHeader>
          <SheetTitle className="text-base font-semibold text-gray-900">
            Edit Student
          </SheetTitle>
          <SheetDescription className="text-sm text-gray-500">
            Update personal information.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-4">
          {locked && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Base fee is locked at{' '}
              <strong className="mx-1">{fmtMoney(Number(student.baseFee))}</strong> — not
              editable here.
            </div>
          )}
          <Field label="Student Name" required>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Father / Guardian Name">
              <Input
                value={form.guardian}
                onChange={(e) => set('guardian', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Father / Guardian Contact">
              <div className="relative">
                <Phone className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={form.guardianPhone}
                  onChange={(e) => set('guardianPhone', e.target.value)}
                  placeholder="e.g. 0300-1234567"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CNIC / B-Form">
              <Input
                value={form.cnic}
                onChange={(e) => set('cnic', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Date of Birth">
              <Input
                type="date"
                value={form.dob}
                onChange={(e) => set('dob', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Program">
            <Select value={form.program} onValueChange={(v) => set('program', v)}>
              <SelectTrigger className={`${inputCls} w-full`}>
                <SelectValue placeholder="Select program" />
              </SelectTrigger>
              <SelectContent>
                {PROGRAMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {deptLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Section">
            <Input
              value={form.section}
              onChange={(e) => set('section', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Previous Result">
            <Input
              value={form.prevResult}
              onChange={(e) => set('prevResult', e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Address">
            <Textarea
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              rows={2}
              className="rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12"
            />
          </Field>

          {/* Fees & Login — mark paid + provide login (Accountant / Academic) */}
          <StudentFeeLoginPanel student={student} user={user} onUpdated={onSaved} />
        </div>

        <SheetFooter>
          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium flex-1"
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
