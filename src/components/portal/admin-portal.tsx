'use client';

// ============================================================================
// Concordia College — Admin Portal (spec §1.1)
//
// SIDEBAR (clean & neat, per user spec):
//   Main              → Admin Dashboard (flat single page)
//   Admission Office  → dropdown (sub-portal modules, NO dashboard)
//   Accountant        → dropdown (sub-portal modules, NO dashboard)
//   Academic Office   → dropdown (sub-portal modules, NO dashboard)
//   Account           → Settings (flat single page)
//
// The Admin Dashboard is the single place where the admin monitors
// everything happening across the whole institute / all portals. It
// surfaces live stats (students, teachers, staff, fee collection,
// announcements, attendance, results) plus quick-access cards that
// jump directly into a sub-portal module.
//
// All data is fetched live from the API. NO hardcoded / fake data.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  GraduationCap,
  DollarSign,
  Building2,
  Megaphone,
  Award,
  BookOpen,
  Trophy,
  UserCog,
  Inbox,
  Lock,
  Clock,
  UserPlus,
  TrendingUp,
} from 'lucide-react';

// Sub-portal components — the admin accesses every role's full portal.
import { AdmissionsPortal } from './admissions-portal';
import { AccountantPortal, PromoteStudentsDialog } from './accountant-portal';
import { Button } from '@/components/ui/button';
import { AcademicPortal } from './academic-portal';
import { useApp } from '@/lib/store';
import { SimpleBarChart, SimplePieChart, ChartCard } from './shared/concordia-charts';
import { DEPARTMENTS, deptLabel } from './shared/concordia-hierarchy';
import dynamic from 'next/dynamic';
const BiometricAttendance = dynamic(() => import('./shared/biometric-attendance'), { ssr: false });
import { motion } from 'framer-motion';

type Props = { activeModule: string; user: any };

// ───────────────────────── Shared helpers ─────────────────────────

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
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
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
        'group relative w-full text-left rounded-2xl border border-border bg-card p-3 sm:p-4 transition-all min-h-[88px] sm:min-h-[104px] flex flex-col justify-between overflow-hidden',
        onClick
          ? 'hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
          : 'cursor-default hover:border-border hover:shadow-sm',
      )}
    >
      {/* Subtle gradient accent on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div className="flex items-start justify-between relative">
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0 transition-transform group-hover:scale-110 group-hover:bg-primary/15">
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-primary" />
        </div>
      </div>
      <div className="min-w-0 mt-1.5 relative">
        <div className="text-xl sm:text-2xl font-bold text-foreground truncate tabular-nums leading-tight">{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mt-0.5 truncate">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
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
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}

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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/40 mb-2.5" />
      <div className="text-sm text-muted-foreground">{title}</div>
      {desc && <div className="text-xs text-muted-foreground/70 mt-1 max-w-sm">{desc}</div>}
    </div>
  );
}

// ───────────────────────── Constants ─────────────────────────

const STAFF_ROLES = ['admin', 'admissions', 'accountant', 'academic'];

const fmtMoney = (n: number) => `Rs ${(n || 0).toLocaleString()}`;

const formatDate = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

// ═══════════════════════════════════════════════════════════════
// Admin Dashboard — the single monitoring page for the whole institute.
// Live stats + recent activity. Sub-portal access is via the sidebar
// dropdowns (Admission Office / Accountant / Academic Office).
// ═══════════════════════════════════════════════════════════════

function AdminDashboard({ user, setActiveModule }: { user: any; setActiveModule: (id: string) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [fees, setFees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = (user?.name || 'Admin').split(' ')[0];

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.scopedStats(user?.instituteId, user?.branchId).catch(() => null),
      api.platformUsers({}).catch(() => []),
      api.getAnnouncements().catch(() => []),
      api.getFeeInvoices().catch(() => []),
    ]).then(([s, u, a, f]) => {
      if (cancelled) return;
      setStats(s);
      setUsers(Array.isArray(u) ? u : []);
      setAnnouncements(Array.isArray(a) ? a.slice(0, 5) : []);
      setFees(Array.isArray(f) ? f.slice(0, 200) : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.instituteId, user?.branchId]);

  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const teachers = useMemo(() => users.filter((u) => u.role === 'teacher'), [users]);
  const staff = useMemo(() => users.filter((u) => STAFF_ROLES.includes(u.role)), [users]);
  const feeCollected = stats?.totalRevenue ?? fees.filter((f) => f.status === 'Paid').reduce((s, f) => s + (f.paidAmount || f.amount || 0), 0);

  // Base-fee monitoring — surfaces admission-office work to the admin.
  const isLocked = (s: any) => Boolean(s?.baseFeeLocked) && s?.baseFee != null && s.baseFee !== '';
  const pendingBaseFee = useMemo(() => students.filter((s) => !isLocked(s)), [students]);
  const lockedBaseFee = useMemo(() => students.filter((s) => isLocked(s)), [students]);
  const lockedTotal = useMemo(
    () => lockedBaseFee.reduce((acc, s) => acc + Number(s.baseFee || 0), 0),
    [lockedBaseFee],
  );
  const thisMonthCount = useMemo(() => {
    const m = new Date().getMonth();
    const y = new Date().getFullYear();
    return students.filter((s) => {
      const d = s.createdAt ? new Date(s.createdAt) : null;
      return !!d && d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }, [students]);

  const recentStudents = useMemo(
    () =>
      [...students]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, 6),
    [students],
  );

  // ── Chart data ──
  // Students per program — counts by the 6-department catalog
  const studentsByProgram = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return DEPARTMENTS.map((d) => ({ label: deptLabel(d), value: map[d] }));
  }, [students]);

  // Monthly fee collection — last 6 months from paid invoices
  const monthlyCollection = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const total = fees
        .filter((f) => {
          if ((f.status || '').toLowerCase() !== 'paid') return false;
          const pd = f.paidAt ? new Date(f.paidAt) : null;
          return !!pd && pd.getMonth() === m && pd.getFullYear() === y;
        })
        .reduce((acc, f) => acc + Number(f.paidAmount || f.amount || 0), 0);
      buckets.push({ label: d.toLocaleString('en-US', { month: 'short' }), value: total });
    }
    return buckets;
  }, [fees]);

  // Fee status distribution — Paid vs Pending vs Overdue
  const feeStatusDist = useMemo(() => {
    let paid = 0, pending = 0, overdue = 0;
    for (const f of fees) {
      const st = (f.status || '').toLowerCase();
      if (st === 'paid') paid++;
      else if (st === 'overdue') overdue++;
      else pending++;
    }
    return [
      { label: 'Paid', value: paid },
      { label: 'Pending', value: pending },
      { label: 'Overdue', value: overdue },
    ].filter((d) => d.value > 0);
  }, [fees]);

  const [promoteOpen, setPromoteOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Monitor everything happening across the whole institute and all portals."
        action={
          <Button onClick={() => setPromoteOpen(true)} className="bg-[#F26522] hover:bg-[#D4541E] text-white">
            <GraduationCap className="h-4 w-4 mr-1.5" /> Promote Students
          </Button>
        }
      />
      <PromoteStudentsDialog open={promoteOpen} onClose={() => setPromoteOpen(false)} students={students} branchId={user?.branchId} />

      {/* ── Live KPIs — no fake data, all from API ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px] sm:h-[104px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={GraduationCap}
            label="Total Students"
            value={stats?.totalStudents ?? students.length}
            sub="Enrolled across all classes"
            onClick={() => setActiveModule('academic:academic-classes')}
          />
          <StatCard
            icon={Users}
            label="Teachers"
            value={stats?.totalTeachers ?? teachers.length}
            sub="Active faculty members"
            onClick={() => setActiveModule('academic:academic-classes')}
          />
          <StatCard
            icon={UserCog}
            label="Office Staff"
            value={staff.length}
            sub="Admissions · accounts · academics"
          />
          <StatCard
            icon={DollarSign}
            label="Fee Collected"
            value={fmtMoney(feeCollected)}
            sub="Collected this period"
            onClick={() => setActiveModule('accountant:accountant-challans')}
          />
        </div>
      )}

      {/* ── Analytics charts ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Chart 1: Students per Program (bar, 2/3) */}
        <ChartCard
          title="Students per Program"
          subtitle="Enrollment across the 6 Concordia departments"
          className="lg:col-span-2"
        >
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
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

        {/* Chart 2: Enrollment Distribution (pie, 1/3) */}
        <ChartCard
          title="Enrollment Distribution"
          subtitle="By department"
        >
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : studentsByProgram.filter((d) => d.value > 0).length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No enrollment data yet"
              desc="Students will appear here once the Admissions Office enrolls them."
            />
          ) : (
            <SimplePieChart data={studentsByProgram} height={260} donut />
          )}
        </ChartCard>

        {/* Chart 3: Fee Collection — Last 6 Months (bar, 2/3) */}
        <ChartCard
          title="Fee Collection — Last 6 Months"
          subtitle="Total collected per month"
          className="lg:col-span-2"
        >
          {loading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : fees.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No fee data yet"
              desc="Collections will appear here once invoices are paid."
            />
          ) : (
            <SimpleBarChart
              data={monthlyCollection}
              height={240}
              formatValue={(v) => fmtMoney(v)}
            />
          )}
        </ChartCard>

        {/* Chart 4: Fee Status (pie, 1/3) */}
        <ChartCard
          title="Fee Status"
          subtitle="Paid vs Pending vs Overdue"
        >
          {loading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : feeStatusDist.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No fee data yet"
              desc="Fee status will appear here once invoices exist."
            />
          ) : (
            <SimplePieChart data={feeStatusDist} height={240} donut />
          )}
        </ChartCard>
      </motion.div>

      {/* ── Two-column: announcements + at-a-glance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <SectionHeader
            title="Recent Announcements"
            desc="Latest college-wide notices"
            action={<span className="text-[11px] text-muted-foreground/70">Last 5</span>}
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
              desc="Posts will appear here once the Academic Office publishes them."
            />
          ) : (
            <ul className="divide-y divide-border">
              {announcements.map((a, i) => (
                <li
                  key={a.id || i}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Megaphone className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {a.title}
                      </span>
                      {a.targetRole && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border border-border rounded px-1.5 py-0.5">
                          {a.targetRole}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
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
                { label: 'Total Branches', value: stats?.totalBranches ?? 1, icon: Building2 },
                { label: 'Active Classes', value: stats?.totalClasses ?? 0, icon: BookOpen },
                { label: 'Events This Month', value: stats?.totalEvents ?? 0, icon: Trophy },
                { label: 'Report Cards', value: stats?.totalReportCards ?? 0, icon: Award },
              ].map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <s.icon className="h-4 w-4 text-muted-foreground/70" />
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground">{s.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Admission Office Pulse — surfaces admissions work to the admin ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          title="Admission Office Pulse"
          desc="Live snapshot of enrollment + base-fee finalization"
          action={
            <button
              type="button"
              onClick={() => setActiveModule('admissions:admissions-students')}
              className="text-[11px] font-semibold text-[#F26522] hover:text-[#D4541E] inline-flex items-center gap-1"
            >
              View Student Records →
            </button>
          }
        />
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                <GraduationCap className="h-3.5 w-3.5" /> Enrolled
              </div>
              <div className="text-xl font-bold text-foreground mt-1.5">{students.length}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{thisMonthCount} this month</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                <Lock className="h-3.5 w-3.5" /> Fee Locked
              </div>
              <div className="text-xl font-bold text-foreground mt-1.5">{lockedBaseFee.length}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Rs {lockedTotal.toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule('admissions:admissions-students')}
              className="text-left rounded-lg border border-[#F26522]/30 bg-[#FFF4ED] p-4 hover:border-[#F26522] hover:bg-[#FFE5D8] hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4541E]">
                <Clock className="h-3.5 w-3.5" /> Pending Lock
              </div>
              <div className="text-xl font-bold text-[#D4541E] mt-1.5 tabular-nums">
                {pendingBaseFee.length}
              </div>
              <div className="text-[11px] text-[#D4541E]/70 mt-0.5">
                {pendingBaseFee.length === 0 ? 'All finalized ✓' : 'Click to review →'}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('admissions:admissions-new')}
              className="text-left rounded-lg border border-[#F26522]/30 bg-[#FFF0E8] p-4 hover:border-[#F26522] hover:bg-[#FFE5D8] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#D4541E]">
                <UserPlus className="h-3.5 w-3.5" /> New Enrollment
              </div>
              <div className="text-xl font-bold text-[#D4541E] mt-1.5">Open</div>
              <div className="text-[11px] text-[#D4541E]/70 mt-0.5">Click to enroll →</div>
            </button>
          </div>
        )}
      </div>

      {/* ── Recent students table ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <SectionHeader
          title="Recent Students"
          desc="Latest enrolled students across the college"
          action={
            <span className="text-[11px] text-muted-foreground/70">{students.length} total</span>
          }
        />
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : recentStudents.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students enrolled yet"
            desc="The Admission Office can enroll new students from the Admission Office portal."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 py-2.5 px-3">
                  Roll No
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 py-2.5 px-3">
                  Name
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 py-2.5 px-3">
                  Class
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 py-2.5 px-3">
                  Guardian
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 py-2.5 px-3 text-right">
                  Base Fee
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70 py-2.5 px-3 text-center">
                  Fee Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentStudents.map((u) => {
                const locked = isLocked(u);
                return (
                  <TableRow key={u.id} className="border-border hover:bg-[#FFF4ED]/60 transition-colors">
                    <TableCell className="py-3 px-3 text-sm text-muted-foreground font-mono tabular-nums">
                      {u.rollNo || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm font-medium text-foreground">
                      {u.name}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-muted-foreground">
                      {u.class || '—'}
                      {u.section ? `-${u.section}` : ''}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-muted-foreground">
                      {u.fatherName || u.guardian || '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-sm text-muted-foreground text-right tabular-nums">
                      {locked ? `Rs ${Number(u.baseFee || 0).toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="py-3 px-3 text-center">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-[#F26522]/30 bg-[#FFF4ED] px-2 py-0.5 text-[11px] font-medium text-[#D4541E]">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
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
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        This module is being prepared. Check back soon.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// AdminPortal — main router
//
// The admin sidebar has flat pages (Admin Dashboard, Settings) and
// dropdown groups (Admission Office, Accountant, Academic Office).
// Dropdown items use namespaced IDs like `admissions:admissions-new`.
// The router delegates namespaced modules to the dedicated portal
// component, passing the de-namespaced module ID.
// ═══════════════════════════════════════════════════════════════

export function AdminPortal({ activeModule, user }: Props) {
  const setActiveModule = useApp(s => s.setActiveModule);

  // ── Sub-portal delegation (namespaced modules) ──
  if (activeModule && activeModule.includes(':')) {
    const [ns, modId] = activeModule.split(':', 2);
    const subModule = modId || '';

    switch (ns) {
      case 'admissions':
        return (
          <div className="animate-in fade-in-0 duration-200">
            <AdmissionsPortal activeModule={subModule} user={user} />
          </div>
        );
      case 'accountant':
        return (
          <div className="animate-in fade-in-0 duration-200">
            <AccountantPortal activeModule={subModule} user={user} />
          </div>
        );
      case 'academic':
        return (
          <div className="animate-in fade-in-0 duration-200">
            <AcademicPortal activeModule={subModule} user={user} />
          </div>
        );
    }
  }

  // ── Admin-native flat modules ──
  let content: React.ReactNode;
  switch (activeModule) {
    case 'admin-dashboard':
    case 'admin-overview':
      content = <AdminDashboard user={user} setActiveModule={setActiveModule} />;
      break;
    case 'biometric-attendance':
      content = <BiometricAttendance user={user} mode="admin" />;
      break;
    // `settings` is intentionally NOT rendered here (handled in role-portal.tsx).
    default:
      content = <ComingSoon title="Module" />;
  }

  return <div className="animate-in fade-in-0 duration-200">{content}</div>;
}
