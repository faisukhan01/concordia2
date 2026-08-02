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
  else if (activeModule === 'admissions-base-fee')
    content = <ComingSoon title="Fee Records" />;
  else
    content = (
      <OverviewView
        user={user}
        students={students}
        loading={loading}
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
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {label}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-2 truncate">{value}</p>
          {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
        </div>
        <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
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
}: {
  user: any;
  students: any[];
  loading: boolean;
}) {
  const now = useMemo(() => new Date(), []);

  const recent = useMemo(
    () =>
      [...students]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 10),
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
      label: dept,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
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
            <p className="text-xs text-gray-500 mt-0.5">Last 10 enrolled students</p>
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
      const required: (keyof EnrollForm)[] = ['program', 'classId', 'rollNo'];
      const missing = required.filter((k) => !form[k].trim());
      if (missing.length) {
        setTouched((t) => {
          const next = { ...t };
          for (const k of missing) next[k] = true;
          return next;
        });
        toast({
          title: 'Please complete academic placement',
          description: 'Program, class, and roll number are required.',
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

    const body: any = {
      name: form.name.trim(),
      rollNo: rollNoTrim,
      password: genTempPassword(),
      email: `${rollNoTrim.toLowerCase()}@pending.concordia.edu.pk`,
      role: 'student',
      instituteId: user?.instituteId,
      branchId: user?.branchId,
      class: selectedClass?.name || null,
      classId: form.classId,
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
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('program', 'Program')}
            </Field>
            <Field label="Class" required>
              <Select
                value={form.classId}
                onValueChange={(v) => {
                  const c = classes.find((x) => x.id === v);
                  set('classId', v);
                  if (c?.section) set('section', c.section);
                  markTouched('classId');
                }}
              >
                <SelectTrigger className={`${inputCls} w-full`}>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">
                      No classes in this branch.
                    </div>
                  )}
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.section ? ` — ${c.section}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('classId', 'Class')}
            </Field>
            <Field label="Section">
              <Select value={form.section} onValueChange={(v) => set('section', v)}>
                <SelectTrigger className={`${inputCls} w-full`}>
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {(reference.sections.length ? reference.sections : ['A', 'B', 'C']).map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Roll Number" required>
              <div className="relative">
                <Hash className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={form.rollNo}
                  onChange={(e) => set('rollNo', e.target.value)}
                  onBlur={() => markTouched('rollNo')}
                  placeholder="Auto-suggested from class"
                  className={`${inputCls} pl-9 font-mono text-sm`}
                />
              </div>
              {err('rollNo', 'Roll number')}
              <p className="text-[11px] text-gray-500 mt-1">
                Auto-suggested from this class — edit if needed.
              </p>
            </Field>
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

function StudentRecordsView({
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
  const [drill, setDrill] = useState<Drill>({ dept: null, part: '1', cls: null, section: null });
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
    // If the class has multiple sections, clear the section selection so the
    // SectionCardGrid shows; otherwise pre-fill section with the single
    // section so the table renders immediately.
    const secs = classes.filter((c) => c.name === cls.name);
    if (secs.length > 1) {
      setDrill({ ...drill, cls, section: null });
    } else {
      setDrill({ ...drill, cls, section: cls });
    }
  };

  const handleSelectSection = (section: {
    id: string;
    name: string;
    section: string;
  }) => setDrill({ ...drill, section });

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
      ) : !drill.cls ? (
        // ── Level 2: Part toggle + class cards ──
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
              <h2 className="text-sm font-semibold text-gray-900">{drill.dept} Classes</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Select Part 1 (1st year) or Part 2 (2nd year), then pick a class.
              </p>
            </div>
            <PartToggle value={drill.part} onChange={(p) =>
              setDrill((d) => ({ ...d, part: p, cls: null, section: null }))
            } />
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : classesInDept.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                No classes found for {drill.dept} · Part {drill.part}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                The Academic Office needs to create classes with program={drill.dept} and
                part={drill.part}. Meanwhile, you can still search students by name or CNIC
                above.
              </p>
            </div>
          ) : (
            <ClassCardGrid
              classes={classesInDept}
              onSelect={handleSelectClass}
              getStudentCount={getStudentCountForClass}
            />
          )}
        </motion.div>
      ) : hasMultipleSections && !drill.section ? (
        // ── Level 3a: Section cards (only when multiple sections exist) ──
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
            onClear={handleClearHierarchy}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {drill.cls.name} — Select Section
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                This class has multiple sections. Pick one to view its students.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              onClick={() => setDrill((d) => ({ ...d, cls: null, section: null }))}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to classes
            </Button>
          </div>
          <SectionCardGrid
            sections={sectionsOfClass}
            onSelect={handleSelectSection}
            getStudentCount={getStudentCountForClass}
          />
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
                  setDrill((d) => ({
                    ...d,
                    cls: hasMultipleSections ? d.cls : null,
                    section: null,
                  }))
                }
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                {hasMultipleSections ? 'Back to sections' : 'Back to classes'}
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
                    className="h-8 px-2 text-xs text-[#F26522] hover:text-[#D4541E] hover:bg-[#FFF0E8]"
                    onClick={() => onDocs(s)}
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" /> Add Documents
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
      // Open the data URL in a new tab. For images and PDFs, this displays
      // them in the browser; for binary Office docs, the browser will offer
      // a download.
      const win = window.open();
      if (win) {
        win.location.href = dataUrl;
      } else {
        // Fallback — trigger a direct download via an <a> click.
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = res?.fileName || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
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

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-white max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[#F26522]" />
            Student Documents
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Upload and manage scanned documents for this student.
          </DialogDescription>
        </DialogHeader>

        {student && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full border border-gray-200 bg-white grid place-items-center shrink-0">
              <GraduationCap className="h-5 w-5 text-gray-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {student.name}
              </p>
              <p className="text-xs font-mono text-gray-500">
                Roll # {student.rollNo || '—'}
                {student.class ? ` · ${student.class}` : ''}
                {student.section ? ` · ${student.section}` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Existing documents list */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">
            Existing Documents {docs.length > 0 && `(${docs.length})`}
          </p>
          <div className={`${scrollListCls} rounded-lg border border-gray-200 bg-white`}>
            {loadingDocs ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : docs.length === 0 ? (
              <div className="p-5 text-center">
                <FileText className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-500">
                  No documents uploaded yet.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50"
                  >
                    <div className="h-9 w-9 rounded-lg border border-gray-200 bg-white grid place-items-center shrink-0">
                      <FileText className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {d.name}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {d.fileName || '—'} · {fmtBytes(Number(d.fileSize || 0))}
                        {d.uploadedByName ? ` · by ${d.uploadedByName}` : ''}
                        {d.createdAt ? ` · ${fmtDate(d.createdAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                        onClick={() => onDownload(d.id)}
                        disabled={downloadingId === d.id}
                        aria-label={`Download ${d.name}`}
                      >
                        {downloadingId === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-500 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => onDelete(d.id, d.name)}
                        disabled={deletingId === d.id}
                        aria-label={`Delete ${d.name}`}
                      >
                        {deletingId === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Upload form */}
        <div className="rounded-lg border border-[#F26522]/30 bg-[#FFF0E8]/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D4541E]">
            <FileUp className="h-4 w-4" />
            Upload New Document
          </div>
          <Field label="Document Name" required>
            <Input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Father CNIC, Student B-Form, Previous Results"
              className={inputCls}
            />
          </Field>
          <Field label="File" required>
            <Input
              ref={fileInputRef}
              type="file"
              accept={DOC_ACCEPT}
              onChange={onFileChange}
              className="h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 file:mr-3 file:ml-0 file:rounded-md file:border-0 file:bg-[#F26522] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#D4541E] cursor-pointer"
            />
            {file && (
              <p className="text-[11px] text-gray-500 mt-1">
                {file.name} · {fmtBytes(file.size)}
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              Accepted: JPG, PNG, PDF, DOC, DOCX · max{' '}
              {(DOC_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB
            </p>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium w-full sm:w-auto"
              onClick={onUpload}
              disabled={uploading}
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
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 4. EditStudentSheet — unchanged from prior implementation.
// ---------------------------------------------------------------------------
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
                    {p}
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
