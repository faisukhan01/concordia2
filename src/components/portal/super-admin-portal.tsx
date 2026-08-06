'use client';

// ============================================================================
// Concordia College — Super Admin Portal (Product Owner)
//
// ROLE
//   The super admin (Faisal Khan — faisu577277@gmail.com) is the PRODUCT
//   OWNER of the Concordia College platform. They monitor the WHOLE
//   college (single-institution model — Concordia is THE institute,
//   id: I-DEMO, branch: B-DEMO Main Campus) and manage every account.
//
// SIDEBAR (matches the admin / teacher / student portals — clean & flat):
//   MAIN
//     • Dashboard          — college-wide overview (stats + recent activity)
//   COLLEGE
//     • Branches & Classes — view all branches/classes/courses
//     • Office Staff       — manage admin/admissions/accountant/academic
//     • Teachers           — view all teachers, block/unblock, reset pwd
//     • Students           — view all students, block/unblock, reset pwd
//   OVERSIGHT
//     • Announcements      — broadcast college-wide + view history
//     • Fee Collection     — fee stats + recent invoices
//     • Attendance         — all attendance records (latest 50)
//     • Results            — all test results (latest 50)
//   ACCOUNT
//     • Settings           — change own password (handled by role-portal.tsx)
//
// DESIGN LANGUAGE (matches teacher / student / admin / academic portals):
//   • Orange #F26522 used ONLY for: primary buttons, active row states,
//     the h-0.5 w-8 section accent line, small active badges, focus rings.
//   • NO gradients. NO glassmorphism. NO colored icon tiles. NO framer-motion.
//   • White cards on border-gray-200 rounded-xl with hover:shadow-sm.
//   • Tables: uppercase muted headers + hover:bg-gray-50 row tint.
//   • All data is fetched live from the API. NO dummy / fake data.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
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
  Building2, UserCog, Users, GraduationCap, Megaphone,
  DollarSign, CheckCircle2, Award, Search,
  Loader2, Lock, Unlock, Edit, KeyRound, Trash2, ChevronRight, AlertCircle,
  Inbox, BookOpen, Send, TrendingUp, Crown,
  ShieldCheck, ShieldOff, Ban, Power, MapPin, Layers,
  DatabaseZap, AlertTriangle,
} from 'lucide-react';
import { SimpleBarChart, SimplePieChart, ChartCard } from './shared/concordia-charts';
import { DEPARTMENTS } from './shared/concordia-hierarchy';

type Props = { activeModule: string; user: any };

// ───────────────────────── Shared constants ─────────────────────────

const STAFF_ROLES = ['admin', 'admissions', 'accountant', 'academic'] as const;

const ROLE_LABELS: Record<string, string> = {
  'admin': 'Administrator',
  'admissions': 'Admission Office',
  'accountant': 'Accountant',
  'academic': 'Academic Office',
  'teacher': 'Teacher',
  'student': 'Student',
  'parent': 'Parent / Guardian',
};

const SCROLLBAR_CLS =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent';

const inputCls =
  'h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12';

const btnPrimary =
  'bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
const btnSecondary =
  'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60';

const fmtMoney = (n: number) => `Rs ${(Number(n) || 0).toLocaleString('en-PK')}`;

// SQLite datetime('now') returns UTC as "YYYY-MM-DD HH:MM:SS" (no tz marker).
// JS treats tz-less strings as LOCAL time → causes "5h ago" for UTC+5 users.
// Normalize to ISO 8601 UTC before parsing.
const parseUtc = (iso?: string): Date | null => {
  if (!iso) return null;
  let s = iso;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (iso?: string) => {
  const d = parseUtc(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (iso?: string) => {
  const d = parseUtc(iso);
  if (!d) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const relativeTime = (iso?: string) => {
  const d = parseUtc(iso);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
};

// ───────────────────────── Shared UI helpers ─────────────────────────

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
        <div className="h-0.5 w-8 bg-[#F26522] mb-3" />
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 flex gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'w-full text-left rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 transition-all group min-h-[88px] sm:min-h-[104px] flex flex-col justify-between',
        onClick ? 'hover:border-[#F26522] hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer' : 'cursor-default hover:border-gray-300 hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-[#FFF4ED] grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-[#F26522] group-hover:text-white transition-colors" />
        </div>
      </div>
      <div className="min-w-0 mt-1.5">
        <div className="text-xl sm:text-2xl font-bold text-gray-900 truncate tabular-nums leading-tight">{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5 truncate">{label}</div>
        {sub && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</div>}
      </div>
    </button>
  );
}

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
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-6 w-6 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {desc && <p className="text-xs text-gray-500 mt-1 max-w-sm">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <AlertCircle className="h-6 w-6 text-rose-400 mb-3" />
      <p className="text-sm font-medium text-gray-900">Failed to load</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm">
        {message || 'Something went wrong. Please try again.'}
      </p>
    </div>
  );
}

function StatusBadge({ status, blocked }: { status?: string; blocked?: boolean }) {
  if (blocked) {
    return (
      <span className="inline-flex items-center rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
        Blocked
      </span>
    );
  }
  const s = (status || 'Active').toLowerCase();
  const cls =
    s === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : s === 'inactive'
        ? 'bg-gray-100 text-gray-600 border-gray-200'
        : 'bg-amber-50 text-amber-700 border-amber-100';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize',
        cls,
      )}
    >
      {status || 'Active'}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
      {ROLE_LABELS[role] || role}
    </span>
  );
}

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

// ═══════════════════════════════════════════════════════════════
// SuperAdminDashboard — Product Owner welcome + college-wide stats
// ═══════════════════════════════════════════════════════════════

function SuperAdminDashboard({
  user,
  setActiveModule,
}: {
  user: any;
  setActiveModule: (id: string) => void;
}) {
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [finance, setFinance] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Purge Test Data dialog state ──
  // Destructive, irreversible operation: wipes ALL test students, teachers,
  // sessions, notifications, attendance, results, fees, documents, etc.
  // while preserving institutes, branches, office-staff accounts, classes,
  // courses, fee_structure, and exams. Used to reset the platform to a
  // clean state before delivering it to a real customer.
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<any>(null);

  const openPurgeDialog = () => {
    setPurgeConfirmText('');
    setPurgeResult(null);
    setPurgeDialogOpen(true);
  };

  const cancelPurgeDialog = () => {
    setPurgeDialogOpen(false);
    setPurgeConfirmText('');
    setPurgeResult(null);
  };

  const confirmPurge = async () => {
    // Require exact typed confirmation to prevent accidents.
    if (purgeConfirmText.trim() !== 'PURGE ALL DATA') {
      toast({
        title: 'Confirmation phrase does not match',
        description: 'Type "PURGE ALL DATA" exactly to confirm.',
        variant: 'destructive',
      });
      return;
    }
    setPurging(true);
    try {
      const result = await api.purgeTestData();
      setPurgeResult(result);
      toast({
        title: 'Test data purged',
        description: 'All test students, teachers, sessions, notifications and related records have been permanently removed.',
      });
      // Reload dashboard so KPIs reflect the wiped state.
      setOverview(null);
      setUsers([]);
      setAnnouncements([]);
      setLoading(true);
      Promise.all([
        api.platformOverview().catch(() => null),
        api.platformUsers({}).catch(() => []),
        api.getAnnouncements().catch(() => []),
        api.getPlatformFinance().catch(() => null),
        api.branches().catch(() => []),
      ]).then(([o, u, a, f, b]) => {
        setOverview(o);
        setUsers(Array.isArray(u) ? u : []);
        setAnnouncements(Array.isArray(a) ? a.slice(0, 5) : []);
        setFinance(f);
        setBranches(Array.isArray(b) ? b : []);
        setLoading(false);
      });
    } catch (e: any) {
      toast({
        title: 'Purge failed',
        description: e?.message || 'Could not purge test data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPurging(false);
    }
  };

  const firstName = (user?.name || 'Owner').split(' ')[0];

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.platformOverview().catch(() => null),
      api.platformUsers({}).catch(() => []),
      api.getAnnouncements().catch(() => []),
      api.getPlatformFinance().catch(() => null),
      api.branches().catch(() => []),
    ]).then(([o, u, a, f, b]) => {
      if (cancelled) return;
      setOverview(o);
      setUsers(Array.isArray(u) ? u : []);
      setAnnouncements(Array.isArray(a) ? a.slice(0, 5) : []);
      setFinance(f);
      setBranches(Array.isArray(b) ? b : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const teachers = useMemo(() => users.filter((u) => u.role === 'teacher'), [users]);
  const staff = useMemo(() => users.filter((u) => STAFF_ROLES.includes(u.role)), [users]);

  const feeCollected =
    overview?.totalRevenue ??
    finance?.kpi?.totalRevenue ??
    0;

  const recentUsers = useMemo(
    () =>
      [...users]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 6),
    [users],
  );

  // ── Chart data ──
  const studentsByProgram = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return DEPARTMENTS.map((d) => ({ label: d, value: map[d] }));
  }, [students]);

  const usersByRole = useMemo(() => {
    const map: Record<string, number> = {};
    for (const u of users) {
      const r = u.role || 'unknown';
      map[r] = (map[r] || 0) + 1;
    }
    return Object.entries(map).map(([label, value]) => ({ label, value }));
  }, [users]);

  const quickActions = [
    {
      icon: ShieldCheck,
      title: 'Block College Access',
      subtitle: 'Instantly revoke portal access for an entire college',
      target: 'super-institutes',
    },
    {
      icon: UserCog,
      title: 'Manage Office Staff',
      subtitle: 'Edit accounts, reset passwords, block access',
      target: 'super-staff',
    },
    {
      icon: Megaphone,
      title: 'Broadcast Announcement',
      subtitle: 'Send a college-wide notice to staff, teachers or students',
      target: 'super-announcements',
    },
    {
      icon: Users,
      title: 'View Teachers',
      subtitle: 'Audit teacher accounts and reset credentials',
      target: 'super-teachers',
    },
    {
      icon: GraduationCap,
      title: 'View Students',
      subtitle: 'Audit student accounts across all classes',
      target: 'super-students',
    },
    {
      icon: DollarSign,
      title: 'Fee Collection',
      subtitle: 'Review collected fees and recent transactions',
      target: 'super-fees',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Product Owner — college-wide oversight of Concordia College."
        action={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
            <Crown className="h-3.5 w-3.5 text-[#F26522]" />
            Product Owner
          </span>
        }
      />

      {/* ── KPI cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            icon={ShieldCheck}
            label="Colleges"
            value={overview?.institutes ?? 1}
            sub={
              overview && overview.institutes > 0
                ? `${overview.activeInstitutes ?? overview.institutes} active · ${Math.max(0, (overview.institutes ?? 1) - (overview.activeInstitutes ?? overview.institutes ?? 1))} blocked`
                : 'Access control'
            }
            onClick={() => setActiveModule('super-institutes')}
          />
          <StatCard
            icon={GraduationCap}
            label="Total Students"
            value={overview?.totalStudents ?? students.length}
            sub="Enrolled across the college"
            onClick={() => setActiveModule('super-students')}
          />
          <StatCard
            icon={Users}
            label="Teachers"
            value={overview?.totalStaff ?? teachers.length}
            sub="Active faculty members"
            onClick={() => setActiveModule('super-teachers')}
          />
          <StatCard
            icon={UserCog}
            label="Office Staff"
            value={staff.length}
            sub="Admin · admissions · accounts · academic"
            onClick={() => setActiveModule('super-staff')}
          />
          <StatCard
            icon={Building2}
            label="Branches"
            value={overview?.branches ?? branches.length}
            sub="Across Concordia College"
            onClick={() => setActiveModule('super-branches')}
          />
          <StatCard
            icon={DollarSign}
            label="Fee Collected"
            value={fmtMoney(feeCollected)}
            sub="Total paid fees"
            onClick={() => setActiveModule('super-fees')}
          />
        </div>
      )}

      {/* ── Analytics charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Students per Program"
          subtitle="Enrollment across the 6 Concordia departments"
          className="lg:col-span-2"
        >
          {loading ? (
            <div className="h-[260px] w-full rounded-lg bg-gray-100 animate-pulse" />
          ) : students.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No enrollment data yet"
              desc="Students will appear here once the Admissions Office enrolls them."
            />
          ) : (
            <SimpleBarChart
              data={studentsByProgram}
              height={260}
              yLabel="Students"
              formatValue={(v) => `${v} student${v === 1 ? '' : 's'}`}
            />
          )}
        </ChartCard>
        <ChartCard
          title="Users by Role"
          subtitle="Distribution across all accounts"
        >
          {loading ? (
            <div className="h-[260px] w-full rounded-lg bg-gray-100 animate-pulse" />
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No user data yet"
              desc="Users will appear here once accounts are created."
            />
          ) : (
            <SimplePieChart data={usersByRole} height={260} donut />
          )}
        </ChartCard>
      </div>

      {/* ── Two-column: recent announcements + recent users ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader
            title="Recent Announcements"
            desc="Latest college-wide broadcasts"
            action={
              <button
                onClick={() => setActiveModule('super-announcements')}
                className="text-[11px] font-medium text-[#F26522] hover:underline inline-flex items-center gap-1"
              >
                View all <ChevronRight className="h-3 w-3" />
              </button>
            }
          />
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              desc="Broadcast your first college-wide notice from the Announcements module."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {announcements.map((a, i) => (
                <li
                  key={a.id || i}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Megaphone className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {a.title}
                      </span>
                      {a.targetRole && (
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                          {ROLE_LABELS[a.targetRole] || a.targetRole}
                        </span>
                      )}
                      {a.targetScope === 'all' && !a.targetRole && (
                        <span className="text-[10px] uppercase tracking-wider text-[#F26522] border border-[#F26522]/20 bg-[#F26522]/5 rounded px-1.5 py-0.5">
                          College-wide
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{a.message}</p>
                    <span className="text-[11px] text-gray-400 mt-1 block">
                      {relativeTime(a.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader title="At a Glance" />
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <ul className="space-y-1">
              {[
                { label: 'Total Branches', value: overview?.branches ?? branches.length, icon: Building2 },
                { label: 'Office Staff', value: staff.length, icon: UserCog },
                { label: 'Teachers', value: overview?.totalStaff ?? teachers.length, icon: Users },
                { label: 'Students', value: overview?.totalStudents ?? students.length, icon: GraduationCap },
                { label: 'Fee Collected', value: fmtMoney(feeCollected), icon: DollarSign },
              ].map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <s.icon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{s.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{s.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Recent users table ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="Recent Accounts"
          desc="Latest created accounts across the college"
          action={
            <span className="text-[11px] text-gray-400">{users.length} total</span>
          }
        />
        {loading ? (
          <SkeletonTable rows={4} />
        ) : recentUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No accounts yet"
            desc="Office staff, teachers and students will appear here once created."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Name
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Role
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Created
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentUsers.map((u) => (
                  <TableRow key={u.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="py-3 px-3 text-sm font-medium text-gray-900">
                      {u.name}
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-600 truncate max-w-[200px]">
                      {u.email || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-500">
                      {fmtDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <StatusBadge status={u.status} blocked={u.blocked} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div>
        <SectionHeader
          title="Quick Actions"
          desc="Jump straight to common oversight workflows"
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((a) => (
            <button
              key={a.target}
              onClick={() => setActiveModule(a.target)}
              className="group text-left border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5 transition-all flex items-start gap-3"
            >
              <div className="h-9 w-9 shrink-0 rounded-lg bg-amber-100 grid place-items-center group-hover:bg-[#F26522] transition-colors">
                <a.icon className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Quick Action</div>
                <div className="text-base font-bold text-gray-900 mt-1.5">{a.title}</div>
                <div className="text-xs text-amber-700/80 mt-1">{a.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="Recent Activity"
          desc="Latest user signups and announcements across the college"
          action={
            <span className="text-[11px] text-gray-400">{users.length + announcements.length} total</span>
          }
        />
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (() => {
          const activities = [
            ...recentUsers.map((u) => ({
              id: `user-${u.id}`,
              type: 'signup' as const,
              icon: u.role === 'student' ? GraduationCap : u.role === 'teacher' ? Users : UserCog,
              title: u.name,
              desc: `New ${ROLE_LABELS[u.role] || u.role} account created`,
              time: u.createdAt,
            })),
            ...announcements.map((a) => ({
              id: `ann-${a.id}`,
              type: 'announcement' as const,
              icon: Megaphone,
              title: a.title,
              desc: a.message,
              time: a.createdAt,
            })),
          ]
            .sort((a, b) => (b.time || '').localeCompare(a.time || ''))
            .slice(0, 8);

          return activities.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No activity yet"
              desc="User signups and announcements will appear here."
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${a.type === 'signup' ? 'bg-emerald-50' : 'bg-[#FFF4ED]'}`}>
                    <a.icon className={`h-4 w-4 ${a.type === 'signup' ? 'text-emerald-600' : 'text-[#F26522]'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{a.title}</span>
                      <span className={`text-[10px] font-medium uppercase tracking-wider rounded px-1.5 py-0.5 ${a.type === 'signup' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#FFF4ED] text-[#F26522]'}`}>
                        {a.type === 'signup' ? 'Signup' : 'Announcement'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{a.desc}</p>
                    {a.time && (
                      <span className="text-[11px] text-gray-400 mt-0.5 block">{relativeTime(a.time)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          );
        })()}
      </div>

      {/* ── Danger Zone — Purge Test Data ── */}
      {/* destructive, irreversible. Wipes ALL test students/teachers/sessions/
          notifications/attendance/results/fees/documents/salaries/etc. while
          preserving institutes, branches, classes, courses, fee_structure,
          exams, and office-staff accounts. */}
      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-rose-100 grid place-items-center">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                Danger Zone
              </div>
              <h3 className="text-base font-bold text-gray-900 mt-0.5">
                Purge all test data
              </h3>
              <p className="text-xs text-gray-600 mt-1 max-w-xl">
                Permanently deletes every test student, teacher, login session,
                notification, attendance record, result, fee, invoice, document,
                salary payment, and timetable entry. Preserves colleges,
                departments, office-staff accounts, classes, courses, fee
                templates, and exam definitions. Use before delivering the
                platform to a real customer.
              </p>
            </div>
          </div>
          <button
            onClick={openPurgeDialog}
            className="shrink-0 rounded-lg h-10 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors text-white bg-rose-600 hover:bg-rose-700"
          >
            <DatabaseZap className="h-4 w-4" /> Purge Test Data
          </button>
        </div>
      </div>

      {/* ── Purge confirmation dialog ── */}
      {/* Requires the user to type "PURGE ALL DATA" exactly. Shows a live
          result panel after the operation completes so the caller can verify
          what was deleted. */}
      {purgeDialogOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={cancelPurgeDialog}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-in fade-in-0 zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-rose-50 grid place-items-center">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">
                  Purge all test data?
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  This will permanently remove everything listed below.
                </p>
              </div>
            </div>

            <div className="rounded-md bg-rose-50 border border-rose-100 px-3 py-2.5 mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 mb-1.5">
                This will permanently delete
              </p>
              <ul className="text-xs text-rose-800 space-y-0.5">
                <li>• All student accounts (every test student)</li>
                <li>• All teacher accounts (every test teacher)</li>
                <li>• Every active login session (everyone must sign in again)</li>
                <li>• All in-app notifications + FCM device tokens</li>
                <li>• All attendance, results, and report cards</li>
                <li>• All fees, invoices, misc charges, and salaries</li>
                <li>• All student documents, events, and announcements</li>
                <li>• All timetables and date sheets</li>
              </ul>
              <p className="text-[11px] text-rose-700 mt-2 font-semibold uppercase tracking-wider">
                Preserved
              </p>
              <ul className="text-xs text-emerald-700 space-y-0.5 mt-1">
                <li>• Colleges, departments, classes, courses, fee templates, exams</li>
                <li>• Office-staff accounts (admin / admissions / accountant / academic)</li>
                <li>• Super-admin account (you stay logged in)</li>
              </ul>
              <p className="text-[11px] text-rose-700 mt-2 font-medium">
                This action cannot be undone.
              </p>
            </div>

            {purgeResult ? (
              <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2.5 mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 mb-1.5">
                  Purge complete
                </p>
                <ul className="text-xs text-emerald-800 space-y-0.5">
                  <li>• {purgeResult.purged?.students ?? 0} students removed</li>
                  <li>• {purgeResult.purged?.teachers ?? 0} teachers removed</li>
                  <li>• {purgeResult.purged?.sessions ?? 0} login sessions cleared</li>
                  <li>• {purgeResult.purged?.notifications ?? 0} notifications cleared</li>
                  <li>• {purgeResult.purged?.attendance ?? 0} attendance records removed</li>
                  <li>• {purgeResult.purged?.results ?? 0} results removed</li>
                  <li>• {purgeResult.purged?.fees ?? 0} fees removed</li>
                  <li>• {purgeResult.purged?.fee_invoices ?? 0} invoices removed</li>
                  <li>• {purgeResult.purged?.student_documents ?? 0} documents removed</li>
                  <li>• {purgeResult.purged?.report_cards ?? 0} report cards removed</li>
                </ul>
              </div>
            ) : (
              <Field
                label={`Type the confirmation phrase to proceed`}
                hint={`Exactly: PURGE ALL DATA`}
              >
                <Input
                  value={purgeConfirmText}
                  onChange={(e) => setPurgeConfirmText(e.target.value)}
                  placeholder="PURGE ALL DATA"
                  className={inputCls}
                  autoFocus
                  disabled={purging}
                />
              </Field>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={cancelPurgeDialog} className={btnSecondary} disabled={purging}>
                {purgeResult ? 'Close' : 'Cancel'}
              </button>
              {!purgeResult && (
                <button
                  onClick={confirmPurge}
                  disabled={purging || purgeConfirmText.trim() !== 'PURGE ALL DATA'}
                  className={cn(
                    'rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-white bg-rose-600 hover:bg-rose-700',
                    purgeConfirmText.trim() !== 'PURGE ALL DATA' && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {purging && <Loader2 className="h-4 w-4 animate-spin" />}
                  <DatabaseZap className="h-4 w-4" /> Purge Permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperBranches — view all branches + classes + courses
// ═══════════════════════════════════════════════════════════════

function SuperBranches() {
  const [branches, setBranches] = useState<any[]>([]);
  const [institutes, setInstitutes] = useState<any[]>([]);
  const [classesByBranch, setClassesByBranch] = useState<Record<string, any[]>>({});
  const [coursesByClass, setCoursesByClass] = useState<Record<string, any[]>>({});
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadClassesForBranch = async (branchId: string) => {
    setClassesByBranch((prev) => {
      if (prev[branchId]) return prev;
      api
        .getClasses(branchId)
        .then((cls) =>
          setClassesByBranch((p) => ({ ...p, [branchId]: Array.isArray(cls) ? cls : [] })),
        )
        .catch(() => setClassesByBranch((p) => ({ ...p, [branchId]: [] })));
      return prev;
    });
  };

  const loadCoursesForClass = async (classId: string) => {
    setCoursesByClass((prev) => {
      if (prev[classId]) return prev;
      api
        .getCourses({ classId })
        .then((crs) =>
          setCoursesByClass((p) => ({ ...p, [classId]: Array.isArray(crs) ? crs : [] })),
        )
        .catch(() => setCoursesByClass((p) => ({ ...p, [classId]: [] })));
      return prev;
    });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.branches().catch(() => []),
      api.institutes().catch(() => []),
    ]).then(([b, i]) => {
      if (cancelled) return;
      const brs = Array.isArray(b) ? b : [];
      const insts = Array.isArray(i) ? i : [];
      setBranches(brs);
      setInstitutes(insts);
      // Auto-expand the first branch
      if (brs.length > 0) {
        setExpandedBranch(brs[0].id);
        loadClassesForBranch(brs[0].id);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleBranch = (branchId: string) => {
    setExpandedBranch((cur) => (cur === branchId ? null : branchId));
    setExpandedClass(null);
    loadClassesForBranch(branchId);
  };

  const toggleClass = (classId: string) => {
    setExpandedClass((cur) => (cur === classId ? null : classId));
    loadCoursesForClass(classId);
  };

  const instName = (id?: string) =>
    institutes.find((i) => i.id === id)?.name || 'Concordia College';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches & Classes"
        subtitle="Inspect the college structure — branches, classes, and assigned courses."
      />

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SkeletonTable rows={4} />
        </div>
      ) : branches.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <EmptyState
            icon={Building2}
            title="No branches found"
            desc="The Concordia College branch will appear here once initialized."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {branches.map((b) => {
            const isOpen = expandedBranch === b.id;
            const classes = classesByBranch[b.id] || [];
            return (
              <div
                key={b.id}
                className="rounded-xl border border-gray-200 bg-white overflow-hidden"
              >
                <button
                  onClick={() => toggleBranch(b.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-50 grid place-items-center">
                      <Building2 className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {b.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {instName(b.instituteId)} · {b.city || 'Main Campus'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400">
                      {classes.length || '…'} classes
                    </span>
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 text-gray-400 transition-transform',
                        isOpen && 'rotate-90',
                      )}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-4 space-y-2">
                    {classes.length === 0 ? (
                      <EmptyState
                        icon={BookOpen}
                        title="No classes in this branch"
                        desc="Classes are created by the Academic Office."
                      />
                    ) : (
                      classes.map((c) => {
                        const classOpen = expandedClass === c.id;
                        const courses = coursesByClass[c.id] || [];
                        return (
                          <div
                            key={c.id}
                            className="rounded-lg border border-gray-200 bg-white overflow-hidden"
                          >
                            <button
                              onClick={() => toggleClass(c.id)}
                              className="w-full flex items-center justify-between gap-3 p-3 hover:bg-gray-50 transition text-left"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <BookOpen className="h-4 w-4 text-gray-400 shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900">
                                    {c.name}
                                    {c.section ? (
                                      <span className="text-gray-400"> · Section {c.section}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-xs text-gray-400">
                                  {courses.length || '…'} courses
                                </span>
                                <ChevronRight
                                  className={cn(
                                    'h-3.5 w-3.5 text-gray-400 transition-transform',
                                    classOpen && 'rotate-90',
                                  )}
                                />
                              </div>
                            </button>
                            {classOpen && (
                              <div className="border-t border-gray-100 p-3 bg-white">
                                {courses.length === 0 ? (
                                  <p className="text-xs text-gray-400 py-2 text-center">
                                                    No courses assigned to this class yet.
                                  </p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {courses.map((cr) => (
                                      <span
                                        key={cr.id}
                                        className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700"
                                      >
                                        {cr.name}
                                        {cr.code ? (
                                          <span className="text-gray-400 ml-1.5">
                                            ({cr.code})
                                          </span>
                                        ) : null}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EditUserSheet — shared edit form for office staff / teachers / students
// ═══════════════════════════════════════════════════════════════

function EditUserSheet({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPassword('');
    }
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const patch: any = { name: name.trim() };
      if (email.trim() && email.trim() !== (user.email || '')) patch.email = email.trim();
      if (password) patch.password = password;
      await api.editUser(user.id, patch);
      toast({
        title: 'Account updated',
        description: password
          ? 'Password reset — user will be prompted to change it on next login.'
          : 'Changes saved successfully.',
      });
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast({
        title: 'Failed to update account',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-gray-900">Edit Account</SheetTitle>
          <SheetDescription>
            Update profile details or reset the password. Changes apply immediately.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {user && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">
                {ROLE_LABELS[user.role] || user.role}
              </div>
              <div className="text-sm font-medium text-gray-900 mt-0.5">{user.name}</div>
              <div className="text-xs text-gray-500 mt-0.5 font-mono">{user.id}</div>
            </div>
          )}
          <Field label="Full Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Full name"
            />
          </Field>
          <Field label="Email" hint="Leave blank to keep the existing email.">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="name@concordia.edu.pk"
              type="email"
            />
          </Field>
          <Field
            label="New Password"
            hint="Leave blank to keep the current password. Resetting forces a password change on next login."
          >
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="Enter new password"
              type="text"
            />
          </Field>
          <button
            onClick={save}
            disabled={saving}
            className={cn(btnPrimary, 'w-full justify-center h-10')}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Save Changes
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperStaff — manage admin / admissions / accountant / academic
// ═══════════════════════════════════════════════════════════════

function SuperStaff() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all(STAFF_ROLES.map((r) => api.platformUsers({ role: r }).catch(() => [])))
      .then((results) => {
        const all = results.flat();
        setUsers(all);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggleBlock = async (u: any) => {
    setActingId(u.id);
    try {
      await api.blockUser(u.id, !u.blocked);
      toast({
        title: u.blocked ? 'Account unblocked' : 'Account blocked',
        description: u.blocked
          ? `${u.name} can now sign in again.`
          : `${u.name} has been signed out and blocked.`,
      });
      load();
    } catch (e: any) {
      toast({
        title: 'Failed to update account',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Office Staff"
        subtitle="Manage administrator, admission, accountant, and academic office accounts."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="All Office Staff"
          desc="Edit profiles, reset passwords, or block access."
          action={
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className={cn(inputCls, 'pl-9 w-64')}
              />
            </div>
          }
        />

        {loading ? (
          <SkeletonTable rows={5} />
        ) : error ? (
          <ErrorState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title={search ? 'No matching staff' : 'No office staff yet'}
            desc={
              search
                ? 'Try a different search term.'
                : 'Office staff accounts will appear here once created.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Name
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Role
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="py-3 px-3 text-sm font-medium text-gray-900">
                      {u.name}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-600">
                      {u.email || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <StatusBadge status={u.status} blocked={u.blocked} />
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditing(u)}
                          className={cn(btnSecondary, 'h-8 px-3 text-xs')}
                          title="Edit account"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => toggleBlock(u)}
                          disabled={actingId === u.id}
                          className={cn(
                            'h-8 px-3 text-xs rounded-lg border transition-colors inline-flex items-center gap-1.5 font-medium disabled:opacity-60',
                            u.blocked
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
                          )}
                          title={u.blocked ? 'Unblock account' : 'Block account'}
                        >
                          {actingId === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : u.blocked ? (
                            <Unlock className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                          {u.blocked ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EditUserSheet
        user={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperTeachers — view all teachers, block/unblock, reset password
// ═══════════════════════════════════════════════════════════════

function SuperTeachers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    api
      .platformUsers({ role: 'teacher' })
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.rollNo || '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggleBlock = async (u: any) => {
    setActingId(u.id);
    try {
      await api.blockUser(u.id, !u.blocked);
      toast({
        title: u.blocked ? 'Teacher unblocked' : 'Teacher blocked',
        description: u.blocked
          ? `${u.name} can sign in again.`
          : `${u.name} has been signed out and blocked.`,
      });
      load();
    } catch (e: any) {
      toast({
        title: 'Failed to update account',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        subtitle="View all teacher accounts, reset passwords, or block access."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title={`${users.length} Teacher${users.length === 1 ? '' : 's'}`}
          desc="Faculty members across all branches."
          action={
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teachers…"
                className={cn(inputCls, 'pl-9 w-64')}
              />
            </div>
          }
        />

        {loading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <ErrorState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No matching teachers' : 'No teachers yet'}
            desc={
              search
                ? 'Try a different search term.'
                : 'Teachers are created by the Academic Office.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Name
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Roll No
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="py-3 px-3 text-sm font-medium text-gray-900">
                      {u.name}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-600">
                      {u.email || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-500 font-mono">
                      {u.rollNo || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <StatusBadge status={u.status} blocked={u.blocked} />
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditing(u)}
                          className={cn(btnSecondary, 'h-8 px-3 text-xs')}
                          title="Edit / reset password"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset
                        </button>
                        <button
                          onClick={() => toggleBlock(u)}
                          disabled={actingId === u.id}
                          className={cn(
                            'h-8 px-3 text-xs rounded-lg border transition-colors inline-flex items-center gap-1.5 font-medium disabled:opacity-60',
                            u.blocked
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
                          )}
                          title={u.blocked ? 'Unblock account' : 'Block account'}
                        >
                          {actingId === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : u.blocked ? (
                            <Unlock className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                          {u.blocked ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EditUserSheet
        user={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperStudents — view all students, block/unblock, reset password
// ═══════════════════════════════════════════════════════════════

function SuperStudents() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    api
      .platformUsers({ role: 'student' })
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.rollNo || '').toLowerCase().includes(q) ||
        (u.class || '').toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggleBlock = async (u: any) => {
    setActingId(u.id);
    try {
      await api.blockUser(u.id, !u.blocked);
      toast({
        title: u.blocked ? 'Student unblocked' : 'Student blocked',
        description: u.blocked
          ? `${u.name} can sign in again.`
          : `${u.name} has been signed out and blocked.`,
      });
      load();
    } catch (e: any) {
      toast({
        title: 'Failed to update account',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        subtitle="View all student accounts, reset passwords, or block access."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title={`${users.length} Student${users.length === 1 ? '' : 's'}`}
          desc="Enrolled students across all branches and classes."
          action={
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, roll no, class…"
                className={cn(inputCls, 'pl-9 w-72')}
              />
            </div>
          }
        />

        {loading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <ErrorState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={search ? 'No matching students' : 'No students yet'}
            desc={
              search
                ? 'Try a different search term.'
                : 'Students are enrolled by the Admission Office.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Name
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Email
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Roll No
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Class
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="py-3 px-3 text-sm font-medium text-gray-900">
                      {u.name}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-600">
                      {u.email || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-500 font-mono">
                      {u.rollNo || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-gray-700">
                      {u.class ? `${u.class}${u.section ? `-${u.section}` : ''}` : '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <StatusBadge status={u.status} blocked={u.blocked} />
                    </TableCell>
                    <TableCell className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditing(u)}
                          className={cn(btnSecondary, 'h-8 px-3 text-xs')}
                          title="Edit / reset password"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset
                        </button>
                        <button
                          onClick={() => toggleBlock(u)}
                          disabled={actingId === u.id}
                          className={cn(
                            'h-8 px-3 text-xs rounded-lg border transition-colors inline-flex items-center gap-1.5 font-medium disabled:opacity-60',
                            u.blocked
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
                          )}
                          title={u.blocked ? 'Unblock account' : 'Block account'}
                        >
                          {actingId === u.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : u.blocked ? (
                            <Unlock className="h-3.5 w-3.5" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                          {u.blocked ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EditUserSheet
        user={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperAnnouncements — broadcast college-wide + view history
// ═══════════════════════════════════════════════════════════════

function SuperAnnouncements({ user }: { user: any }) {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<string>('all');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    api
      .getAnnouncements()
      .then((d) => setAnnouncements(Array.isArray(d) ? d : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const broadcast = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: 'Title and message are required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const body: any = {
        title: title.trim(),
        message: message.trim(),
        targetScope: 'all',
      };
      if (targetRole !== 'all') body.targetRole = targetRole;
      await api.createAnnouncement(body);
      toast({
        title: 'Announcement broadcast',
        description:
          targetRole === 'all'
            ? 'Sent college-wide to all roles.'
            : `Sent to ${ROLE_LABELS[targetRole] || targetRole} accounts.`,
      });
      setTitle('');
      setMessage('');
      setTargetRole('all');
      load();
    } catch (e: any) {
      toast({
        title: 'Failed to broadcast',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteAnnouncement(id);
      toast({ title: 'Announcement deleted' });
      load();
    } catch (e: any) {
      toast({
        title: 'Failed to delete',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        subtitle="Broadcast notices to the whole college or specific roles."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Compose ── */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader
            title="New Broadcast"
            desc={`Posted as ${user?.name?.split(' ')[0] || 'Product Owner'} · visible college-wide.`}
          />
          <div className="space-y-4">
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder="e.g. Eid Holidays Notice"
              />
            </Field>
            <Field label="Message" required>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={cn(inputCls, 'min-h-[120px] resize-y')}
                placeholder="Write the announcement message…"
              />
            </Field>
            <Field label="Audience" hint="Choose who should see this announcement.">
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone (college-wide)</SelectItem>
                  <SelectItem value="admin">Office Staff only</SelectItem>
                  <SelectItem value="teacher">Teachers only</SelectItem>
                  <SelectItem value="student">Students only</SelectItem>
                  <SelectItem value="parent">Parents only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <button
              onClick={broadcast}
              disabled={sending}
              className={cn(btnPrimary, 'w-full justify-center h-10')}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Broadcast Announcement
            </button>
          </div>
        </div>

        {/* ── History ── */}
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader
            title="Broadcast History"
            desc="Your previously sent announcements."
            action={
              <span className="text-[11px] text-gray-400">
                {announcements.length} total
              </span>
            }
          />
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : error ? (
            <ErrorState />
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              desc="Use the form on the left to broadcast your first college-wide notice."
            />
          ) : (
            <ul className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {announcements.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-gray-200 p-3.5 hover:border-gray-300 transition group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">
                          {a.title}
                        </span>
                        {a.targetRole ? (
                          <span className="text-[10px] uppercase tracking-wider text-gray-500 border border-gray-200 rounded px-1.5 py-0.5">
                            {ROLE_LABELS[a.targetRole] || a.targetRole}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-[#F26522] border border-[#F26522]/20 bg-[#F26522]/5 rounded px-1.5 py-0.5">
                            College-wide
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1.5 line-clamp-3">
                        {a.message}
                      </p>
                      <div className="text-[11px] text-gray-400 mt-2 flex items-center gap-2">
                        <span>{fmtDateTime(a.createdAt)}</span>
                        <span>·</span>
                        <span>{relativeTime(a.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => remove(a.id)}
                      disabled={deletingId === a.id}
                      className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-60"
                      title="Delete announcement"
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperFees — fee collection stats + recent revenue entries
// ═══════════════════════════════════════════════════════════════

function SuperFees() {
  const [overview, setOverview] = useState<any>(null);
  const [finance, setFinance] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.platformOverview().catch(() => null),
      api.getPlatformFinance().catch(() => null),
      api.getAllInvoices().catch(() => []),
    ])
      .then(([o, f, inv]) => {
        if (cancelled) return;
        setOverview(o);
        setFinance(f);
        setInvoices(Array.isArray(inv) ? inv : []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const kpi = finance?.kpi;
  const revenueEntries: any[] = finance?.revenueEntries || [];
  const recentTxns: any[] = finance?.recentTransactions || [];
  const paidInvoices = invoices.filter((i) => i.status === 'Paid');
  const unpaidInvoices = invoices.filter((i) => i.status !== 'Paid');
  const totalCollected = paidInvoices.reduce((s, i) => s + (i.paidAmount || i.amount || 0), 0);
  const totalOutstanding = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Collection"
        subtitle="College-wide fee revenue and recent financial activity."
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <ErrorState />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              icon={DollarSign}
              label="Total Collected"
              value={fmtMoney(totalCollected || overview?.totalRevenue || kpi?.totalRevenue || 0)}
              sub={`${paidInvoices.length} paid invoices`}
            />
            <StatCard
              icon={AlertCircle}
              label="Outstanding"
              value={fmtMoney(totalOutstanding || 0)}
              sub={`${unpaidInvoices.length} unpaid invoices`}
            />
            <StatCard
              icon={TrendingUp}
              label="Manual Revenue"
              value={fmtMoney(kpi?.totalRevenue ?? 0)}
              sub={`${revenueEntries.length} entries logged`}
            />
            <StatCard
              icon={Award}
              label="Salary Disbursed"
              value={fmtMoney(kpi?.totalSalaryPaid ?? 0)}
              sub="Total teacher salaries paid"
            />
          </div>

          {/* Recent transactions */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <SectionHeader
              title="Recent Transactions"
              desc="Latest revenue entries logged by the Product Owner."
              action={
                <span className="text-[11px] text-gray-400">
                  {recentTxns.length} shown
                </span>
              }
            />
            {recentTxns.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="No transactions yet"
                desc="Revenue entries will appear here once logged via the platform analytics."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200 hover:bg-transparent">
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Date
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Source
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Period
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3 text-right">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTxns.map((t, i) => (
                      <TableRow key={t.id || i} className="border-gray-100 hover:bg-gray-50">
                        <TableCell className="py-3 px-3 text-sm text-gray-500">
                          {fmtDate(t.date)}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-medium text-gray-900">
                          {t.party || '—'}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-gray-600">
                          {t.method || '—'}
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <StatusBadge status={t.status} />
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-semibold text-gray-900 text-right">
                          {fmtMoney(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* All College Fee Invoices */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <SectionHeader
              title="All Fee Invoices"
              desc="Every fee invoice issued across the college."
              action={
                <span className="text-[11px] text-gray-400">
                  {invoices.length} total · {paidInvoices.length} paid · {unpaidInvoices.length} unpaid
                </span>
              }
            />
            {invoices.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="No fee invoices yet"
                desc="Invoices will appear here once the Accountant office generates them."
              />
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200 hover:bg-transparent sticky top-0 bg-white">
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Student
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Class
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Period
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Type
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3 text-right">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.slice(0, 100).map((inv, i) => (
                      <TableRow key={inv.id || i} className="border-gray-100 hover:bg-gray-50">
                        <TableCell className="py-3 px-3 text-sm font-medium text-gray-900">
                          {inv.studentName || '—'}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-gray-600">
                          {inv.className || '—'}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-gray-500">
                          {inv.month ? `${inv.month} ${inv.year}` : String(inv.year || '—')}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm text-gray-600">
                          {inv.type || 'Tuition'}
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <StatusBadge status={inv.status || 'Unpaid'} />
                        </TableCell>
                        <TableCell className="py-3 px-3 text-sm font-semibold text-gray-900 text-right">
                          {fmtMoney(inv.paidAmount || inv.amount || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperAttendance — all attendance records across classes (latest 50)
// ═══════════════════════════════════════════════════════════════

function SuperAttendance() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Initial state of `loading=true` + `error=false` covers the first render.
  // On refresh we use stale-while-revalidate (keep old data visible while fetching).
  const load = () => {
    api
      .getAttendance({})
      .then((d) => {
        // API may return an array of records (with nested `records` JSON) or
        // an object with `entries`. Normalize to a flat array.
        const list = Array.isArray(d) ? d : (d?.entries ?? []);
        setRecords(list);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Flatten each attendance session's per-student records into rows.
  const rows = useMemo(() => {
    const out: any[] = [];
    for (const rec of records) {
      const inner = rec.records;
      const list = typeof inner === 'string' ? safeParse(inner) : Array.isArray(inner) ? inner : [];
      for (const e of list) {
        out.push({
          id: `${rec.id}-${e.studentId}`,
          date: rec.date,
          classId: rec.classId,
          studentId: e.studentId,
          status: e.status,
        });
      }
    }
    return out;
  }, [records]);

  const counts = useMemo(() => {
    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    return { present, absent, late, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Latest attendance records across all classes (most recent 50 sessions)."
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={CheckCircle2} label="Total Entries" value={counts.total} sub="From latest sessions" />
        <StatCard icon={CheckCircle2} label="Present" value={counts.present} sub="Marked present" />
        <StatCard icon={AlertCircle} label="Absent" value={counts.absent} sub="Marked absent" />
        <StatCard icon={Award} label="Late" value={counts.late} sub="Arrived late" />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="Attendance Log"
          desc="Per-student entries from the latest sessions."
          action={<span className="text-[11px] text-gray-400">{rows.length} rows</span>}
        />
        {loading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <ErrorState />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No attendance recorded yet"
            desc="Teachers mark attendance from their portal — entries will appear here."
          />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Date
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Class ID
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Student ID
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="py-2.5 px-3 text-sm text-gray-600">
                      {fmtDate(r.date)}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-sm text-gray-500 font-mono">
                      {r.classId || '—'}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-sm text-gray-500 font-mono">
                      {r.studentId || '—'}
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <AttendanceStatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const cls =
    s === 'present'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : s === 'absent'
        ? 'bg-rose-50 text-rose-700 border-rose-100'
        : s === 'late'
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

function safeParse(s: string): any[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// SuperResults — all test results across classes (latest 50)
// ═══════════════════════════════════════════════════════════════

function SuperResults() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Initial state of `loading=true` + `error=false` covers the first render.
  // On refresh we use stale-while-revalidate (keep old data visible while fetching).
  const load = () => {
    api
      .getResults({})
      .then((d) => {
        const list = Array.isArray(d) ? d : (d?.entries ?? []);
        setRecords(list);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Flatten per-student result entries
  const rows = useMemo(() => {
    const out: any[] = [];
    for (const rec of records) {
      const inner = rec.records;
      const list = typeof inner === 'string' ? safeParse(inner) : Array.isArray(inner) ? inner : [];
      for (const e of list) {
        out.push({
          id: `${rec.id}-${e.studentId}`,
          date: rec.date,
          exam: rec.exam,
          courseId: rec.courseId,
          totalMarks: rec.totalMarks,
          studentId: e.studentId,
          marks: e.marks,
          grade: e.grade,
        });
      }
    }
    return out;
  }, [records]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        subtitle="Latest test results across all classes (most recent 50 sessions)."
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="Results Log"
          desc="Per-student marks from the latest test sessions."
          action={<span className="text-[11px] text-gray-400">{rows.length} entries</span>}
        />
        {loading ? (
          <SkeletonTable rows={6} />
        ) : error ? (
          <ErrorState />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No results recorded yet"
            desc="Teachers submit test results from their portal — entries will appear here."
          />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Date
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Exam
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Course
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Student
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3 text-right">
                    Marks
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 py-2.5 px-3">
                    Grade
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="py-2.5 px-3 text-sm text-gray-600">
                      {fmtDate(r.date)}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-sm font-medium text-gray-900">
                      {r.exam || '—'}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-sm text-gray-500 font-mono">
                      {r.courseId || '—'}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-sm text-gray-500 font-mono">
                      {r.studentId || '—'}
                    </TableCell>
                    <TableCell className="py-2.5 px-3 text-sm text-right text-gray-900 font-medium">
                      {r.marks ?? '—'}
                      <span className="text-gray-400">/{r.totalMarks ?? '?'}</span>
                    </TableCell>
                    <TableCell className="py-2.5 px-3">
                      <GradeBadge grade={r.grade} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade?: string }) {
  if (!grade) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const g = grade.toUpperCase();
  const cls =
    g.startsWith('A')
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : g.startsWith('B')
        ? 'bg-sky-50 text-sky-700 border-sky-100'
        : g.startsWith('C')
          ? 'bg-gray-100 text-gray-700 border-gray-200'
          : g.startsWith('D')
            ? 'bg-amber-50 text-amber-700 border-amber-100'
            : g === 'F'
              ? 'bg-rose-50 text-rose-700 border-rose-100'
              : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold',
        cls,
      )}
    >
      {grade}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperInstitutes — COLLEGE ACCESS CONTROL (v4.6.4)
//
// The super admin's primary security lever. Blocking a college instantly
// revokes portal access for EVERYONE in that institute — admin, admission
// office, accountant, academic office, teachers, AND students. None of them
// can log in (they get a clear "Your college access has been blocked. Please
// contact your administration." error) and anyone already logged in is
// kicked out on their next API call (active sessions are deleted by the
// cascade block endpoint).
//
// The super admin themselves is ALWAYS exempted, so the platform owner can
// still log in to unblock the college.
// ═══════════════════════════════════════════════════════════════

function SuperInstitutes() {
  const [institutes, setInstitutes] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked'>('all');
  // Block/unblock dialog state.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  // Delete dialog state (separate from block — irreversible action gets its
  // own confirmation flow with a typed confirmation token).
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const [insts, brs, usrs] = await Promise.all([
      api.institutes().catch(() => []),
      api.branches().catch(() => []),
      api.platformUsers({}).catch(() => []),
    ]);
    setInstitutes(Array.isArray(insts) ? insts : []);
    setBranches(Array.isArray(brs) ? brs : []);
    setUsers(Array.isArray(usrs) ? usrs : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Per-institute live stats (branches / students / staff counts).
  const statsFor = (instId: string) => {
    const instBranches = branches.filter((b) => b.instituteId === instId);
    const instUsers = users.filter((u) => u.instituteId === instId);
    const students = instUsers.filter((u) => u.role === 'student').length;
    const staff = instUsers.filter((u) =>
      ['admin', 'admissions', 'accountant', 'academic', 'teacher'].includes(u.role),
    ).length;
    return {
      branchCount: instBranches.length,
      studentCount: students,
      staffCount: staff,
    };
  };

  const filtered = useMemo(() => {
    let list = institutes;
    if (filter === 'active') list = list.filter((i) => !(i.blocked === 1));
    if (filter === 'blocked') list = list.filter((i) => i.blocked === 1);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.city || '').toLowerCase().includes(q) ||
          (i.id || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [institutes, filter, search]);

  const blockedCount = institutes.filter((i) => i.blocked === 1).length;
  const activeCount = institutes.length - blockedCount;

  const openBlockDialog = (inst: any) => {
    setTarget(inst);
    setReason(inst.blockedReason || '');
    setDialogOpen(true);
  };

  const confirmAction = async () => {
    if (!target) return;
    const willBlock = !(target.blocked === 1);
    setActing(true);
    try {
      await api.blockInstitute(target.id, willBlock, willBlock ? reason.trim() : '');
      toast({
        title: willBlock ? 'College access blocked' : 'College access restored',
        description: willBlock
          ? `${target.name} can no longer log in. All active sessions were revoked.`
          : `${target.name} can log in again.`,
      });
      setDialogOpen(false);
      setTarget(null);
      setReason('');
      // Refresh data (bypass cache so the new blocked state is reflected).
      await load();
    } catch (e: any) {
      toast({
        title: 'Action failed',
        description: e?.message || 'Could not update college access. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  const cancelDialog = () => {
    setDialogOpen(false);
    setTarget(null);
    setReason('');
  };

  // ── Delete college flow ──
  // Deleting an institute is IRREVERSIBLE — it cascades to every user,
  // branch, class, student record, fee, document, attendance, result,
  // etc. in that college. We require the super admin to type the
  // college name exactly as a guard against accidental clicks.
  const openDeleteDialog = (inst: any) => {
    setDeleteTarget(inst);
    setDeleteConfirmText('');
    setDeleteDialogOpen(true);
  };

  const cancelDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Require exact name match before allowing the delete.
    if (deleteConfirmText.trim() !== deleteTarget.name) {
      toast({
        title: 'Name does not match',
        description: 'Type the college name exactly as shown to confirm.',
        variant: 'destructive',
      });
      return;
    }
    setDeleting(true);
    try {
      await api.deleteInstitute(deleteTarget.id);
      toast({
        title: 'College deleted',
        description: `${deleteTarget.name} and all of its data have been permanently removed.`,
      });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      await load();
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e?.message || 'Could not delete this college. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Colleges & Access Control"
        subtitle="Block or restore portal access for an entire college. When blocked, no one from that college can log in."
      />

      {/* ── Summary KPI strip ── */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#FFF4ED] grid place-items-center">
                <Layers className="h-5 w-5 text-[#F26522]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">{institutes.length}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total Colleges</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">{activeCount}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Active</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 grid place-items-center">
                <ShieldOff className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">{blockedCount}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Blocked</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filter + search bar ── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 self-start">
          {(['all', 'active', 'blocked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors',
                filter === f
                  ? 'bg-[#F26522] text-white'
                  : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              {f} ({f === 'all' ? institutes.length : f === 'active' ? activeCount : blockedCount})
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, city, or ID…"
            className={cn(inputCls, 'pl-9 w-full')}
          />
        </div>
      </div>

      {/* ── Institute list ── */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SkeletonTable rows={3} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <EmptyState
            icon={Building2}
            title={institutes.length === 0 ? 'No colleges yet' : 'No matches'}
            desc={
              institutes.length === 0
                ? 'Colleges will appear here once the platform is provisioned.'
                : 'Try a different search or filter.'
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inst) => {
            const isBlocked = inst.blocked === 1;
            const s = statsFor(inst.id);
            return (
              <div
                key={inst.id}
                className={cn(
                  'rounded-xl border bg-white overflow-hidden transition-all',
                  isBlocked ? 'border-rose-200 bg-rose-50/30' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm',
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 sm:p-5">
                  {/* Identity */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        'h-11 w-11 shrink-0 rounded-xl grid place-items-center',
                        isBlocked ? 'bg-rose-100' : 'bg-[#FFF4ED]',
                      )}
                    >
                      {isBlocked ? (
                        <ShieldOff className="h-5 w-5 text-rose-600" />
                      ) : (
                        <Building2 className="h-5 w-5 text-[#F26522]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{inst.name}</h3>
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            <Ban className="h-3 w-3" /> Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <ShieldCheck className="h-3 w-3" /> Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {inst.city || '—'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3" /> {s.branchCount} campus{s.branchCount === 1 ? '' : 'es'}
                        </span>
                        <span>{s.studentCount} students</span>
                        <span>{s.staffCount} staff &amp; teachers</span>
                        <span className="text-gray-300">·</span>
                        <span className="font-mono text-[10px] text-gray-400">{inst.id}</span>
                      </div>
                      {isBlocked && inst.blockedReason && (
                        <p className="mt-2 text-xs text-rose-700 bg-rose-100/60 border border-rose-200 rounded-md px-2 py-1.5">
                          <span className="font-semibold">Reason: </span>
                          {inst.blockedReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0 flex items-center gap-2">
                    {isBlocked ? (
                      <button
                        onClick={() => openBlockDialog(inst)}
                        className={cn(btnSecondary, 'border-emerald-200 text-emerald-700 hover:bg-emerald-50')}
                      >
                        <Power className="h-4 w-4" /> Restore Access
                      </button>
                    ) : (
                      <button
                        onClick={() => openBlockDialog(inst)}
                        className={cn(
                          'border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors',
                        )}
                      >
                        <Ban className="h-4 w-4" /> Block Access
                      </button>
                    )}
                    <button
                      onClick={() => openDeleteDialog(inst)}
                      title="Permanently delete this college and all its data"
                      className={cn(
                          'border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 rounded-lg h-9 w-9 text-sm font-medium inline-flex items-center justify-center transition-colors',
                      )}
                      aria-label={`Delete ${inst.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Block / Restore confirmation dialog ── */}
      {dialogOpen && target && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={cancelDialog}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className={cn(
                  'h-11 w-11 shrink-0 rounded-xl grid place-items-center',
                  target.blocked === 1 ? 'bg-emerald-50' : 'bg-rose-50',
                )}
              >
                {target.blocked === 1 ? (
                  <Power className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Ban className="h-5 w-5 text-rose-600" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">
                  {target.blocked === 1 ? 'Restore college access?' : 'Block college access?'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {target.name} · {target.city || '—'}
                </p>
              </div>
            </div>

            {target.blocked === 1 ? (
              <p className="text-sm text-gray-600 mb-4">
                Everyone in this college (admin, admissions, accountant, academic office, teachers, and students)
                will be able to log in again immediately. Their accounts were preserved during the block.
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  <span className="font-semibold text-rose-700">No one</span> from this college will be able to log in —
                  admin, admissions, accountant, academic office, teachers, AND students. Anyone currently logged in
                  will be signed out instantly. You (super admin) will still be able to log in to unblock later.
                </p>
                <Field
                  label="Reason (optional, shown to users)"
                  hint="e.g. 'Fee pending' or 'Under review'. Leave blank for a generic message."
                >
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="Why is this college being blocked?"
                    className="resize-none"
                  />
                </Field>
                <div className="mt-3 rounded-md bg-rose-50 border border-rose-100 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 mb-1">
                    Users will see this message at login
                  </p>
                  <p className="text-xs text-rose-800">
                    {reason.trim()
                      ? `Your college access has been blocked. Please contact your administration. (${reason.trim()})`
                      : 'Your college access has been blocked. Please contact your administration.'}
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={cancelDialog} className={btnSecondary} disabled={acting}>
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={acting}
                className={cn(
                  'rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-white',
                  target.blocked === 1 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700',
                )}
              >
                {acting && <Loader2 className="h-4 w-4 animate-spin" />}
                {target.blocked === 1 ? (
                  <>
                    <Power className="h-4 w-4" /> Restore Access
                  </>
                ) : (
                  <>
                    <Ban className="h-4 w-4" /> Block Access
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {/* Deleting an institute cascades to EVERYTHING under it — every
          user, branch, class, student record, fee, document, attendance,
          result, etc. To prevent accidents, the super admin MUST type
          the college name exactly as shown before the Delete button
          becomes enabled. */}
      {deleteDialogOpen && deleteTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={cancelDeleteDialog}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in-0 zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-rose-50 grid place-items-center">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">
                  Delete this college permanently?
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {deleteTarget.name} · {deleteTarget.city || '—'}
                </p>
              </div>
            </div>

            <div className="rounded-md bg-rose-50 border border-rose-100 px-3 py-2.5 mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 mb-1.5">
                This will permanently delete
              </p>
              <ul className="text-xs text-rose-800 space-y-0.5">
                <li>• All branches, classes, courses & sections</li>
                <li>• Every user account (admin, staff, teachers, students)</li>
                <li>• All student documents, fees, invoices & salaries</li>
                <li>• Attendance, results, report cards & exams</li>
                <li>• Announcements, events, timetables & notifications</li>
              </ul>
              <p className="text-[11px] text-rose-700 mt-2 font-medium">
                This action cannot be undone.
              </p>
            </div>

            <Field
              label={`Type the college name to confirm`}
              hint={`Exactly: ${deleteTarget.name}`}
            >
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget.name}
                className={inputCls}
                autoFocus
              />
            </Field>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={cancelDeleteDialog} className={btnSecondary} disabled={deleting}>
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting || deleteConfirmText.trim() !== deleteTarget.name}
                className={cn(
                  'rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-white bg-rose-600 hover:bg-rose-700',
                  deleteConfirmText.trim() !== deleteTarget.name && 'opacity-50 cursor-not-allowed',
                )}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                <Trash2 className="h-4 w-4" /> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Coming Soon ─────────────────────────

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-12 w-12 rounded-xl bg-[#FFF0E8] grid place-items-center mb-4">
        <Inbox className="h-6 w-6 text-[#F26522]" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-1 max-w-sm">
        This module is being prepared. Check back soon.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SuperAdminPortal — main router
//
// `settings` is intentionally NOT rendered here — the parent
// role-portal.tsx intercepts it and renders the shared SettingsPage
// (change own password) for every role.
// ═══════════════════════════════════════════════════════════════

export function SuperAdminPortal({ activeModule, user }: Props) {
  const setActiveModule = useApp((s) => s.setActiveModule);

  // Settings is handled by the parent RolePortal — return null here.
  if (activeModule === 'settings') return null;

  let content: React.ReactNode;
  switch (activeModule) {
    case 'super-dashboard':
    case 'platform-overview': // legacy fallback
      content = <SuperAdminDashboard user={user} setActiveModule={setActiveModule} />;
      break;
    case 'super-branches':
      content = <SuperBranches />;
      break;
    case 'super-institutes':
      content = <SuperInstitutes />;
      break;
    case 'super-staff':
      content = <SuperStaff />;
      break;
    case 'super-teachers':
      content = <SuperTeachers />;
      break;
    case 'super-students':
      content = <SuperStudents />;
      break;
    case 'super-announcements':
      content = <SuperAnnouncements user={user} />;
      break;
    case 'super-fees':
      content = <SuperFees />;
      break;
    case 'super-attendance':
      content = <SuperAttendance />;
      break;
    case 'super-results':
      content = <SuperResults />;
      break;
    default:
      content = <ComingSoon title="Module" />;
  }

  return <div className="animate-in fade-in-0 duration-200">{content}</div>;
}
