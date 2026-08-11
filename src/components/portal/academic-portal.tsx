'use client';

// ============================================================================
// Concordia College — Academic Office Portal (WEB-ACADEMIC-1 rewrite)
//
// Six modules (router at the bottom):
//   1. academic-overview    → Dashboard with KPIs + recharts analytics
//   2. academic-announcements → Post + list announcements (unchanged)
//   3. academic-classes     → "Classes & Teachers" — add class form with
//                             program + part fields, add-teacher form copied
//                             from the Accountant portal's LoginsView,
//                             class list with detail sheet + assign teacher,
//                             and a "Manage Teachers" list.
//   4. timetable            → Department hierarchy drill-down (Dept → Part →
//                             Class → Section → period grid). Clash detection
//                             is preserved (client + server).
//   5. academic-exams       → "Exams & Date Sheets" — merged page with two
//                             part tabs, exam creation, per-exam date-sheet
//                             builder backed by the date_sheets table.
//                             Backward-compat: academic-tests and
//                             academic-datesheet both route here.
//   6. report-cards         → Department hierarchy drill-down → per-section
//                             student results table with per-row PDF download
//                             + print.
//
// Design language: Concordia orange (#F26522) accent on a clean gray/white
// base. shadcn/ui components, framer-motion entrance animations. Uses the
// shared concordia-hierarchy + concordia-charts components.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp, useNavState } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import {
  Users, GraduationCap, BookOpen, Calendar, FileText, Award,
  Megaphone, ClipboardList, Loader2, Search, Copy, Check,
  Bell, Plus, Lock, AlertCircle,
  UserPlus, UserMinus, Trash2, Download, CalendarPlus, Clock,
  Printer, Pencil, ShieldAlert, KeyRound, ArrowLeft,
  TrendingUp, FileSpreadsheet, BookCopy, Layers,
} from 'lucide-react';
import {
  buildReportCard,
  savePdf,
  printPdf,
  gradeFromPct,
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
// Delegated sub-portals — the Academic Office reuses the Admissions & Accountant
// views verbatim for its Student Records / Fees pages (namespaced module IDs).
import { AdmissionsPortal } from './admissions-portal';
import { AccountantPortal } from './accountant-portal';
import { StudentImportDialog } from './shared/student-import-dialog';

type Props = { activeModule: string; user: any };

// ───────────────────────── Shared helpers ─────────────────────────

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
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

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
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
        {sub && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

function SectionHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
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

function SkeletonBox({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-100', className)} />;
}

function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBox key={i} className="h-11 w-full rounded-md" />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc, action }: { icon: any; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-6 w-6 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {desc && <p className="text-xs text-gray-500 mt-1 max-w-sm">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Field({ label, required, children }: { label?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
        {label}
        {required && <span className="text-[#F26522] ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { try { navigator.clipboard?.writeText(text); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#F26522] font-medium"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const inputCls = 'h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12';
const btnPrimary = 'bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60';
const btnSecondary = 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors';
const btnGhost = 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg h-9 px-3 text-sm font-medium inline-flex items-center gap-1.5 transition-colors';

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
};

const isBlocked = (u: any) => u?.blocked === 1 || u?.blocked === true;

function BlockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
      <ShieldAlert className="h-3 w-3" /> Blocked
    </span>
  );
}

// Parse a teacher's `classes` / `subjects` JSON field (string OR array).
function parseTeacherField(raw: any): string[] {
  try {
    if (!raw) return [];
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  } catch { return []; }
}

// ───────────────────────── Dashboard ─────────────────────────
function AcademicOverview({ user }: { user: any }) {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const setActiveModule = useApp((s) => s.setActiveModule);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.platformUsers({ role: 'teacher', branchId: user?.branchId }).catch(() => []),
      api.platformUsers({ role: 'student', branchId: user?.branchId }).catch(() => []),
      api.getAnnouncements().catch(() => []),
      api.getResults({ branchId: user?.branchId }).catch(() => []),
    ]).then(([t, s, a, r]) => {
      if (cancelled) return;
      setTeachers(Array.isArray(t) ? t : []);
      setStudents(Array.isArray(s) ? s : []);
      setAnnouncements(Array.isArray(a) ? a.slice(0, 5) : []);
      setResults(Array.isArray(r) ? r : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.branchId, reloadKey]);

  // ── Students-per-Program bar data — counts of students whose program
  // matches one of the canonical 6 departments.
  const studentsByProgram = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return DEPARTMENTS.map((d) => ({ label: deptLabel(d), value: map[d] }));
  }, [students]);

  // ── Teacher distribution by subject — collapses every teacher's subjects
  // array into { subject, count } pairs, sorted desc and capped at 6.
  const teacherSubjectDist = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of teachers) {
      const subs = parseTeacherField(t.subjects);
      if (subs.length === 0) {
        map['Unassigned'] = (map['Unassigned'] || 0) + 1;
      } else {
        for (const sub of subs) {
          map[sub] = (map[sub] || 0) + 1;
        }
      }
    }
    const arr = Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return arr;
  }, [teachers]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'Academic Coordinator'}`}
        subtitle="Manage teachers, timetables, tests and result cards."
        action={
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F26522] hover:bg-[#D4541E] text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Students from Excel
          </button>
        }
      />

      <StudentImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        branchId={user?.branchId}
        onImported={() => setReloadKey((k) => k + 1)}
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0,1,2,3].map(i => <SkeletonBox key={i} className="h-[88px] sm:h-[104px] rounded-xl" />)}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          <StatCard icon={Users} label="Total Teachers" value={teachers.length} sub="active faculty" />
          <StatCard icon={GraduationCap} label="Total Students" value={students.length} sub="enrolled" />
          <StatCard icon={ClipboardList} label="Pending Results" value={results.length} sub="awaiting review" />
          <StatCard icon={Megaphone} label="Announcements" value={announcements.length} sub="published" />
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <button
          type="button"
          onClick={() => setActiveModule('academic-classes')}
          className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Quick Action
              </div>
              <div className="text-base font-bold text-gray-900 mt-1.5">
                Create Class
              </div>
              <div className="text-xs text-amber-700/80 mt-1">
                Add a new class or section to the academic structure
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
              <BookOpen className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveModule('academic-classes')}
          className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Quick Action
              </div>
              <div className="text-base font-bold text-gray-900 mt-1.5">
                Add Teacher
              </div>
              <div className="text-xs text-amber-700/80 mt-1">
                Register a new faculty member and assign subjects
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
              <UserPlus className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveModule('academic-exams')}
          className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Quick Action
              </div>
              <div className="text-base font-bold text-gray-900 mt-1.5">
                Create Exam
              </div>
              <div className="text-xs text-amber-700/80 mt-1">
                Schedule a new exam and build its date sheet
              </div>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
              <CalendarPlus className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
            </div>
          </div>
        </button>
      </motion.div>

      {/* Analytics charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Students per Program"
          subtitle="Enrollment across the 6 Concordia departments"
          className="lg:col-span-2"
        >
          {loading ? (
            <SkeletonBox className="h-[260px] w-full rounded-lg" />
          ) : students.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No enrollment data yet" desc="Students will appear here once the Admissions Office enrolls them." />
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
          title="Teacher Distribution by Subject"
          subtitle="How faculty are spread across subjects"
        >
          {loading ? (
            <SkeletonBox className="h-[260px] w-full rounded-lg" />
          ) : teachers.length === 0 ? (
            <EmptyState icon={Users} title="No teachers yet" desc="Add teachers from the Classes & Teachers page." />
          ) : (
            <SimplePieChart data={teacherSubjectDist} height={260} donut />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader title="Recent Announcements" />
          {announcements.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements yet" />
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto concordia-scroll pr-1">
              {announcements.map((a, i) => (
                <div key={a.id || i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                  <Megaphone className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{a.title}</div>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{a.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader title="Teachers by Subject" />
          {teachers.length === 0 ? (
            <EmptyState icon={Users} title="No teachers yet" />
          ) : (
            <div className="space-y-0 max-h-72 overflow-y-auto concordia-scroll pr-1">
              {teachers.slice(0, 8).map(t => {
                const subs = parseTeacherField(t.subjects);
                return (
                  <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <span className="text-sm font-medium text-gray-900">{t.name}</span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {(subs.length ? subs : ['—']).map((s: string, i: number) => (
                        <span key={i} className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{s}</span>
                      ))}
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

// ───────────────────────── Announcements ─────────────────────────
function AnnouncementsView({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState('');
  const [target, setTarget] = useState('all');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.getAnnouncements().then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!title || !msg) { toast({ title: 'Title and message are required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await api.createAnnouncement({
        title, message: msg,
        targetRole: target === 'all' ? null : target,
        targetScope: 'all',
        instituteId: user?.instituteId, branchId: user?.branchId,
        senderId: user?.id, senderRole: user?.role,
      });
      toast({ title: 'Announcement published' });
      setTitle(''); setMsg(''); setTarget('all'); load();
    } catch {
      toast({ title: 'Failed to publish', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const audienceBadge = (role?: string | null) => {
    if (!role) return <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-transparent">All</span>;
    switch (role) {
      case 'student': return <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-transparent">Students</span>;
      case 'teacher': return <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-transparent">Teachers</span>;
      case 'accountant': return <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-transparent">Accountants</span>;
      case 'admin': return <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-transparent">Admins</span>;
      default: return <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-transparent">All</span>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" subtitle="Post announcements targeted to specific audiences or everyone." />

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader title="Post Announcement" desc="Choose the audience for your announcement." />
        <div className="space-y-3">
          <Field label="Title" required>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Monthly Test 1 Schedule" className={inputCls} />
          </Field>
          <Field label="Message" required>
            <Textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Write your announcement…" rows={3} className="w-full rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12 resize-none" />
          </Field>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="w-[200px] h-9 rounded-lg border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All — Everyone</SelectItem>
                  <SelectItem value="student">Students</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                  <SelectItem value="accountant">Accountants</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={submit} disabled={saving} className="ml-auto bg-[#F26522] hover:bg-[#D4541E] text-white h-9">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                Publish
              </Button>
            </div>
            <p className="text-[11px] text-gray-500">Choose who should receive this announcement. &lsquo;All&rsquo; sends to every portal user.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader title="Published Announcements" />
        {loading ? (
          <SkeletonTable rows={3} />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="No announcements yet" desc="Published announcements will appear here." />
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto concordia-scroll pr-1">
            {items.map((a, i) => (
              <div key={a.id || i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <Megaphone className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{a.title}</span>
                    {audienceBadge(a.targetRole)}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.message}</p>
                </div>
                <button onClick={() => api.deleteAnnouncement(a.id).then(load)} className="text-[11px] text-gray-400 hover:text-rose-600 shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Classes & Teachers ─────────────────────────
type ClassRow = { id: string; name: string; section: string; branchId?: string; program?: string | null; part?: string | null } & Record<string, any>;

function ClassesAndTeachersView({ user }: { user: any }) {
  // Add-class removed — sections are now assigned by the Accountant in New
  // Enrollments. Academic only manages teachers here.
  const [tab, setTab] = useState<'class' | 'teacher'>('teacher');

  // Shared loaded data
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-class form state
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [name, setName] = useState('');
  const [section, setSection] = useState('A');
  const [program, setProgram] = useState<string>(DEPARTMENTS[0]);
  const [part, setPart] = useState<'1' | '2'>('1');
  const [bulkSections, setBulkSections] = useState('');
  const [savingClass, setSavingClass] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  // Class detail sheet state
  const [detailClass, setDetailClass] = useState<ClassRow | null>(null);
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [removingTeacherId, setRemovingTeacherId] = useState<string | null>(null);

  // Course-assignment state for the class detail sheet.  WITHOUT this, the
  // "Assign Teacher" button only wrote the teacher's `classes` JSON tag —
  // the teacher's portal reads `teacher_class_courses` and saw nothing.
  // Now the officer must pick ≥1 course when assigning, and we also show
  // each assigned teacher's course list with an inline "+ Add courses"
  // control for already-assigned teachers.
  const [classCourses, setClassCourses] = useState<any[]>([]);        // courses available for this class (class_courses)
  const [classTcc, setClassTcc] = useState<any[]>([]);                // teacher_class_courses rows for this class
  const [assignCourseIds, setAssignCourseIds] = useState<string[]>([]); // courses for the NEW teacher being assigned
  const [addClassTeacherId, setAddClassTeacherId] = useState<string | null>(null); // teacher getting extra courses
  const [extraCourseIds, setExtraCourseIds] = useState<string[]>([]); // courses being added to an existing teacher
  const [addingCourses, setAddingCourses] = useState(false);

  // Delete class dialog
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Class list search
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Add-teacher form state (COPIED from accountant-portal LoginsView Teacher tab)
  const [teacherForm, setTeacherForm] = useState({ name: '', rollNo: '', email: '', phone: '', password: '' });
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [created, setCreated] = useState<{ user: string; pass: string; name: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Teachers page: Add-teacher sheet, per-teacher delete, Assign-Course + View
  const [addOpen, setAddOpen] = useState(false);
  const [deletingTeacherId, setDeletingTeacherId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<any | null>(null);   // teacher getting a course assignment
  const [viewTarget, setViewTarget] = useState<any | null>(null);       // teacher whose details are shown
  const [assignForm, setAssignForm] = useState<{ program: string; part: '1' | '2'; section: string; course: string; incharge: boolean }>(
    { program: DEPARTMENTS[0], part: '1', section: '', course: '', incharge: false },
  );
  const [savingAssign, setSavingAssign] = useState(false);

  // Sections available for the Assign-Course form's current program + part.
  const assignSectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of classes) {
      if ((c.program || '').trim() === assignForm.program && String(c.part || '1') === assignForm.part && c.section) {
        set.add(String(c.section).toUpperCase());
      }
    }
    return Array.from(set).sort();
  }, [classes, assignForm.program, assignForm.part]);

  // Manage-existing-teachers state
  const [teachersSearch, setTeachersSearch] = useState('');
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [teacherEditForm, setTeacherEditForm] = useState({ name: '', rollNo: '', email: '', password: '', title: '' });
  const [revealTeacherPw, setRevealTeacherPw] = useState(false);
  const [teacherPwLoading, setTeacherPwLoading] = useState(false);
  const [savingTeacherEdit, setSavingTeacherEdit] = useState(false);
  const [blockingTeacherId, setBlockingTeacherId] = useState('');

  // ── Password strength meter (copied from accountant)
  const pwLevel: 'empty' | 'weak' | 'medium' | 'strong' = (() => {
    if (!teacherForm.password) return 'empty';
    const len = teacherForm.password.length;
    const hasLetter = /[a-zA-Z]/.test(teacherForm.password);
    const hasNum = /[0-9]/.test(teacherForm.password);
    if (len < 6) return 'weak';
    if (len >= 10 && hasLetter && hasNum) return 'strong';
    return 'medium';
  })();
  const strengthMeta: Record<'empty' | 'weak' | 'medium' | 'strong', { label: string; color: string; bar: string; width: string }> = {
    empty: { label: '', color: '', bar: '', width: '0%' },
    weak: { label: 'Weak', color: 'text-red-600', bar: 'bg-red-500', width: '33%' },
    medium: { label: 'Medium', color: 'text-amber-600', bar: 'bg-amber-500', width: '66%' },
    strong: { label: 'Strong', color: 'text-emerald-600', bar: 'bg-emerald-500', width: '100%' },
  };
  const sm = strengthMeta[pwLevel];

  // ── Data load (parallel: classes + students + teachers)
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getClasses(user?.branchId).catch(() => []),
      api.platformUsers({ role: 'student', branchId: user?.branchId }).catch(() => []),
      api.platformUsers({ role: 'teacher', branchId: user?.branchId }).catch(() => []),
    ]).then(([c, s, t]) => {
      setClasses(Array.isArray(c) ? c : []);
      setStudents(Array.isArray(s) ? s : []);
      setTeachers(Array.isArray(t) ? t : []);
    }).finally(() => setLoading(false));
  }, [user?.branchId]);
  useEffect(() => { load(); }, [load]);

  // ── Load courses + teacher↔course assignments whenever the officer opens a
  // class detail sheet.  `classCourses` is the catalog of courses available
  // for this class (from class_courses); `classTcc` is the live
  // teacher_class_courses map so the officer sees exactly what the teacher's
  // portal will show.  Both are refreshed after every assign/remove/add.
  useEffect(() => {
    if (!detailClass?.id) {
      setClassCourses([]); setClassTcc([]); setAssignCourseIds([]); setAddClassTeacherId(null); setExtraCourseIds([]);
      return;
    }
    Promise.all([
      api.getCourses({ classId: detailClass.id }).catch(() => []),
      api.getClassTeacherCourses(detailClass.id).catch(() => []),
    ]).then(([co, tcc]) => {
      setClassCourses(Array.isArray(co) ? co : []);
      setClassTcc(Array.isArray(tcc) ? tcc : []);
    });
  }, [detailClass?.id]);

  const refreshTcc = (classId: string) => {
    api.getClassTeacherCourses(classId)
      .then((tcc) => setClassTcc(Array.isArray(tcc) ? tcc : []))
      .catch(() => {});
  };

  // ── Add-class single submit — passes program + part so the new class shows
  // up in the Timetable / Result Cards hierarchy drill-downs.
  // FLATTEN MODEL: the Program IS the class. The class `name` is set to the
  // program's canonical value so every drill-down groups all of a program's
  // sections under one card (Program → Part → Section).
  const submitClass = async () => {
    setSavingClass(true);
    try {
      await api.createClass(program, section.trim() || 'A', user?.branchId, program, part);
      toast({ title: 'Section added', description: `${deptLabel(program)} · Part ${part} · Section ${section.trim() || 'A'}` });
      setSection('A');
      load();
    } catch (e: any) {
      toast({ title: 'Failed to add section', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setSavingClass(false); }
  };

  const bulkList = Array.from(new Set(
    bulkSections.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  ));
  const submitBulk = async () => {
    if (bulkList.length === 0) { toast({ title: 'Enter at least one section', variant: 'destructive' }); return; }
    setSavingClass(true);
    setBulkProgress({ current: 0, total: bulkList.length });
    const failures: string[] = [];
    const successes: string[] = [];
    for (let i = 0; i < bulkList.length; i++) {
      const sec = bulkList[i];
      setBulkProgress({ current: i + 1, total: bulkList.length });
      try {
        await api.createClass(program, sec, user?.branchId, program, part);
        successes.push(sec);
      } catch (e: any) {
        failures.push(`${sec} (${e?.message || 'failed'})`);
      }
    }
    setBulkProgress(null);
    setSavingClass(false);
    if (successes.length > 0) {
      toast({ title: `${successes.length} section(s) created`, description: `${name.trim()} — ${successes.join(', ')}` });
      setName(''); setBulkSections('');
      load();
    }
    if (failures.length > 0) {
      toast({ title: `${failures.length} section(s) failed`, description: failures.join('; '), variant: 'destructive' });
    }
  };

  // ── Add-teacher submit (COPIED from accountant LoginsView Teacher tab).
  const submitTeacher = async () => {
    if (!teacherForm.name || !teacherForm.rollNo) {
      toast({ title: 'Name and Teacher ID are required', variant: 'destructive' });
      return;
    }
    const rollNoTrim = teacherForm.rollNo.trim();
    const dupTeacher = teachers.find(
      (t) => (t.rollNo || '').toLowerCase() === rollNoTrim.toLowerCase(),
    );
    if (dupTeacher) {
      toast({
        title: 'Duplicate Teacher ID',
        description: `Teacher ID "${rollNoTrim}" is already used by ${dupTeacher.name}. Please use a different ID.`,
        variant: 'destructive',
      });
      return;
    }
    const plannedEmail = teacherForm.email || `${rollNoTrim.toLowerCase()}@concordia.edu.pk`;
    setSavingTeacher(true);
    try {
      // Every teacher's first-time password is the same default (concordia1234);
      // they change it on first login — matching how student logins work.
      const password = teacherForm.password || 'concordia1234';
      await api.createPlatformUser({
        name: teacherForm.name,
        email: plannedEmail,
        rollNo: teacherForm.rollNo,
        guardianPhone: teacherForm.phone.trim() || null,
        password,
        role: 'teacher',
        branchId: user?.branchId,
        instituteId: user?.instituteId,
        title: 'Teacher',
      });
      setCreated({ user: teacherForm.rollNo, pass: password, name: teacherForm.name });
      setFormBlank();
      setAddOpen(false);
      load();
      toast({ title: 'Teacher login created', description: `${teacherForm.name} — username ${teacherForm.rollNo}` });
    } catch (e: any) {
      toast({ title: 'Failed to create login', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setSavingTeacher(false); }
  };
  const setFormBlank = () => setTeacherForm({ name: '', rollNo: '', email: '', phone: '', password: '' });

  // Delete a teacher entirely.
  const deleteTeacher = async (t: any) => {
    if (typeof window !== 'undefined' &&
      !window.confirm(`Delete teacher ${t.name}? This permanently removes their login and assignments.`)) return;
    setDeletingTeacherId(t.id);
    try {
      await api.deleteUser(t.id);
      setTeachers((prev) => prev.filter((x) => x.id !== t.id));
      toast({ title: 'Teacher deleted', description: t.name });
    } catch (e: any) {
      toast({ title: 'Could not delete teacher', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeletingTeacherId(null);
    }
  };

  // Save the current Assign-Course form as a new assignment on the teacher.
  const saveAssignment = async () => {
    if (!assignTarget) return;
    const course = assignForm.course.trim();
    const section = assignForm.section.trim().toUpperCase();
    if (!course) { toast({ title: 'Enter a course name', variant: 'destructive' }); return; }
    if (!section) { toast({ title: 'Select a section', variant: 'destructive' }); return; }
    const existing: any[] = Array.isArray(assignTarget.assignments) ? assignTarget.assignments : [];
    const dup = existing.some((a) =>
      a.program === assignForm.program && String(a.part) === assignForm.part &&
      String(a.section).toUpperCase() === section && (a.course || '').toLowerCase() === course.toLowerCase());
    if (dup) { toast({ title: 'Already assigned', description: `${course} · ${deptLabel(assignForm.program)} · Part ${assignForm.part} · ${section}`, variant: 'destructive' }); return; }
    const next = [...existing, { program: assignForm.program, part: assignForm.part, section, course, incharge: assignForm.incharge }];
    setSavingAssign(true);
    try {
      await api.editUser(assignTarget.id, { assignments: next });
      const updated = { ...assignTarget, assignments: next };
      setAssignTarget(updated);
      setTeachers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setAssignForm((f) => ({ ...f, course: '', incharge: false }));
      toast({ title: 'Course assigned', description: `${course} · ${deptLabel(assignForm.program)} · Part ${assignForm.part} · ${section}` });
    } catch (e: any) {
      toast({ title: 'Could not assign course', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingAssign(false);
    }
  };

  // Remove one assignment (by index) from a teacher.
  const removeAssignment = async (teacher: any, index: number) => {
    const existing: any[] = Array.isArray(teacher.assignments) ? teacher.assignments : [];
    const next = existing.filter((_, i) => i !== index);
    try {
      await api.editUser(teacher.id, { assignments: next });
      const updated = { ...teacher, assignments: next };
      if (assignTarget?.id === teacher.id) setAssignTarget(updated);
      if (viewTarget?.id === teacher.id) setViewTarget(updated);
      setTeachers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      toast({ title: 'Could not remove', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  // ── Teacher edit helpers (copied from accountant)
  const openEditTeacher = (t: any) => {
    setEditingTeacher(t);
    setRevealTeacherPw(false);
    setTeacherEditForm({ name: t.name || '', rollNo: t.rollNo || '', email: t.email || '', password: '', title: t.title || '' });
  };
  const revealTeacherPassword = async () => {
    if (!editingTeacher) return;
    if (revealTeacherPw) { setRevealTeacherPw(false); return; }
    setTeacherPwLoading(true);
    try {
      const r = await api.getUserPassword(editingTeacher.id);
      setTeacherEditForm((prev) => ({ ...prev, password: r?.password || '' }));
      setRevealTeacherPw(true);
    } catch (e: any) {
      toast({ title: 'Could not fetch password', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setTeacherPwLoading(false); }
  };
  const saveTeacher = async () => {
    if (!editingTeacher) return;
    if (!teacherEditForm.name || !teacherEditForm.rollNo) {
      toast({ title: 'Name and Teacher ID are required', variant: 'destructive' });
      return;
    }
    const rollNoTrim = teacherEditForm.rollNo.trim();
    const dup = teachers.find((t) => t.id !== editingTeacher.id && (t.rollNo || '').toLowerCase() === rollNoTrim.toLowerCase());
    if (dup) {
      toast({ title: 'Duplicate Teacher ID', description: `Teacher ID "${rollNoTrim}" is already used by ${dup.name}.`, variant: 'destructive' });
      return;
    }
    setSavingTeacherEdit(true);
    try {
      const body: any = { name: teacherEditForm.name, rollNo: teacherEditForm.rollNo, email: teacherEditForm.email, title: teacherEditForm.title };
      if (teacherEditForm.password) body.password = teacherEditForm.password;
      await api.editUser(editingTeacher.id, body);
      setTeachers((prev) => prev.map((t) => (t.id === editingTeacher.id ? { ...t, ...body } : t)));
      toast({ title: 'Teacher updated', description: `${teacherEditForm.name} — changes saved.` });
      setEditingTeacher(null);
    } catch (e: any) {
      toast({ title: 'Could not save changes', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setSavingTeacherEdit(false); }
  };
  const toggleTeacherBlock = async (t: any) => {
    if (isBlocked(t)) {
      // Unblock directly
      setBlockingTeacherId(t.id);
      try {
        await api.blockUser(t.id, false);
        setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, blocked: 0 } : x)));
        toast({ title: 'Teacher unblocked', description: `${t.name} can now sign in again.` });
      } catch (e: any) {
        toast({ title: 'Could not update block status', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally { setBlockingTeacherId(''); }
      return;
    }
    // Block directly (simpler than the accountant's popup — academic office
    // is the teacher's primary owner and the confirm flow is overkill here).
    if (!confirm(`Block ${t.name}? They will be signed out and can't log in until unblocked.`)) return;
    setBlockingTeacherId(t.id);
    try {
      await api.blockUser(t.id, true);
      setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, blocked: 1 } : x)));
      toast({ title: 'Teacher blocked', description: `${t.name} has been signed out.` });
    } catch (e: any) {
      toast({ title: 'Could not update block status', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setBlockingTeacherId(''); }
  };

  // ── Class list helpers
  const studentCount = (cls: ClassRow) =>
    students.filter((s) => s.class === cls.name && s.section === cls.section).length;
  const enrolledStudents = (cls: ClassRow) =>
    students.filter((s) => s.class === cls.name && s.section === cls.section);
  const classTeachers = (cls: ClassRow) => teachers.filter((t) => {
    const arr = parseTeacherField(t.classes);
    if (arr.length === 0) return false;
    const combinedDash = `${cls.name}-${cls.section}`;
    const combinedSpace = `${cls.name} ${cls.section}`;
    return arr.some((c) => c === cls.name || c === combinedDash || c === combinedSpace);
  });

  const assignTeacher = async () => {
    if (!detailClass) return;
    if (!assignTeacherId) { toast({ title: 'Pick a teacher to assign', variant: 'destructive' }); return; }
    // FIX: a teacher assigned to a class MUST also be assigned to ≥1 course —
    // otherwise the teacher's portal (which reads teacher_class_courses) shows
    // an empty class list.  This is the "assigned to class but not to course"
    // bug being fixed.
    if (assignCourseIds.length === 0) {
      toast({ title: 'Select at least one course', description: 'The teacher must be linked to one or more courses so their portal shows this class.', variant: 'destructive' });
      return;
    }
    const teacher = teachers.find((t) => t.id === assignTeacherId);
    if (!teacher) return;
    const current = parseTeacherField(teacher.classes);
    const combinedDash = `${detailClass.name}-${detailClass.section}`;
    const combinedSpace = `${detailClass.name} ${detailClass.section}`;
    if (current.some((c) => c === detailClass.name || c === combinedDash || c === combinedSpace)) {
      toast({ title: 'Teacher is already assigned to this class', variant: 'destructive' });
      return;
    }
    const next = [...current, combinedDash];
    setAssignSaving(true);
    try {
      // One PATCH does three things at once: (1) updates the teacher's
      // `classes` JSON tag (for the class-detail display), (2) sets classId
      // + addCourseIds so the backend inserts teacher_class_courses rows,
      // (3) the backend dedupes already-assigned courses.
      await api.editUser(teacher.id, { classes: next, classId: detailClass.id, addCourseIds: assignCourseIds });
      toast({
        title: 'Teacher assigned',
        description: `${teacher.name} now teaches ${assignCourseIds.length} course${assignCourseIds.length === 1 ? '' : 's'} in ${detailClass.name} — Section ${detailClass.section}`,
      });
      setAssignTeacherId('');
      setAssignCourseIds([]);
      load();
      refreshTcc(detailClass.id);
    } catch (e: any) {
      toast({ title: 'Failed to assign teacher', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setAssignSaving(false); }
  };

  // Add more courses to a teacher who is ALREADY assigned to this class.
  // Uses the same classId + addCourseIds channel; the backend dedupes so
  // picking an already-assigned course is a silent no-op.
  const addCoursesToTeacher = async (teacherId: string) => {
    if (!detailClass) return;
    if (extraCourseIds.length === 0) { toast({ title: 'Select at least one course', variant: 'destructive' }); return; }
    setAddingCourses(true);
    try {
      await api.editUser(teacherId, { classId: detailClass.id, addCourseIds: extraCourseIds });
      toast({ title: 'Courses added', description: `${extraCourseIds.length} course${extraCourseIds.length === 1 ? '' : 's'} linked to this teacher.` });
      setAddClassTeacherId(null);
      setExtraCourseIds([]);
      load();
      refreshTcc(detailClass.id);
    } catch (e: any) {
      toast({ title: 'Failed to add courses', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setAddingCourses(false); }
  };

  const removeTeacher = async (teacher: any) => {
    if (!detailClass || !teacher?.id) return;
    if (!confirm(`Remove ${teacher.name} from ${detailClass.name} — Section ${detailClass.section}?\n\nThis also unlinks all their course assignments for this class. The teacher's portal will stop showing this class.`)) return;
    const current = parseTeacherField(teacher.classes);
    const combinedDash = `${detailClass.name}-${detailClass.section}`;
    const combinedSpace = `${detailClass.name} ${detailClass.section}`;
    const next = current.filter((c) => c !== detailClass.name && c !== combinedDash && c !== combinedSpace);
    setRemovingTeacherId(teacher.id);
    try {
      // FIX: also wipe teacher_class_courses rows for this (teacher, class) —
      // previously the JSON tag was cleared but TCC rows lingered, leaving
      // ghost assignments in the teacher's portal.
      await api.editUser(teacher.id, { classes: next, removeClassId: detailClass.id });
      toast({ title: 'Teacher removed', description: `${teacher.name} unassigned from ${detailClass.name} — Section ${detailClass.section}` });
      load();
      refreshTcc(detailClass.id);
    } catch (e: any) {
      toast({ title: 'Failed to remove teacher', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setRemovingTeacherId(null); }
  };

  const confirmDeleteClass = async () => {
    const cls = deleteTarget;
    if (!cls) return;
    setDeleting(true);
    try {
      await api.deleteClassSection(cls.id);
      toast({ title: 'Class deleted', description: `${cls.name} — Section ${cls.section} has been removed.` });
      if (detailClass?.id === cls.id) setDetailClass(null);
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast({ title: 'Could not delete class', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setDeleting(false); }
  };

  const filteredClasses = classes.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) || (c.section || '').toLowerCase().includes(q)
      || (c.program || '').toLowerCase().includes(q);
  });
  const filteredTeachers = useMemo(() => {
    const q = teachersSearch.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => t.name?.toLowerCase().includes(q) || t.rollNo?.toLowerCase().includes(q));
  }, [teachers, teachersSearch]);

  const totalSections = classes.length;
  const uniqueNames = new Set(classes.map((c) => c.name)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        subtitle="Add teachers, then assign their courses & sections (and mark who is the section In-charge)."
        action={
          <button onClick={() => { setFormBlank(); setAddOpen(true); }} className={cn(btnPrimary, 'h-10')}>
            <Plus className="h-4 w-4" /> Add Teacher
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Teachers" value={teachers.length} sub="Active faculty" />
        <StatCard icon={BookOpen} label="Total Sections" value={totalSections} sub={`${uniqueNames} unique class name(s)`} />
        <StatCard icon={GraduationCap} label="Total Students" value={students.length} sub="Across all classes" />
      </div>

      {/* Add-class removed — sections are assigned by the Accountant during
          New Enrollments. Academic manages teachers here. */}

      {tab === 'class' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader title="Add Section to a Program" desc="Pick a program + part, then add its section(s). Sections appear wherever this program is selected across the app." />
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'bulk')}>
            <TabsList className="mb-4">
              <TabsTrigger value="single">Single Section</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Sections</TabsTrigger>
            </TabsList>

            {/* SINGLE MODE — the Program IS the class; just pick Part + Section */}
            <TabsContent value="single">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                <Field label="Program" required>
                  <Select value={program} onValueChange={setProgram}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{deptLabel(d)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Part">
                  <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
                </Field>
                <Field label="Section" required>
                  <Input value={section} onChange={(e) => setSection(e.target.value)} className={inputCls} placeholder="A" maxLength={3} />
                </Field>
                <div className="md:col-span-3 flex justify-end">
                  <button onClick={submitClass} disabled={savingClass} className={cn(btnPrimary, 'h-10')}>
                    {savingClass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Section
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3">
                Adds Section <span className="font-semibold">{section.trim().toUpperCase() || 'A'}</span> to <span className="font-semibold">{deptLabel(program)}</span> · Part {part}. It appears wherever this program is selected — Admissions, Accountant, Timetable and Result Cards.
              </p>
            </TabsContent>

            {/* BULK MODE — add several sections to a program + part at once */}
            <TabsContent value="bulk">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                <Field label="Program" required>
                  <Select value={program} onValueChange={setProgram}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{deptLabel(d)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Part">
                  <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
                </Field>
                <Field label="Sections (comma-separated)" required>
                  <Input value={bulkSections} onChange={(e) => setBulkSections(e.target.value)} className={inputCls} placeholder="A, B, C, D" />
                </Field>
                <div className="md:col-span-2 flex justify-end">
                  <button onClick={submitBulk} disabled={savingClass || !!bulkProgress} className={cn(btnPrimary, 'h-10')}>
                    {savingClass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create{bulkList.length > 0 ? ` ${bulkList.length}` : ''} Sections
                  </button>
                </div>
              </div>
              {bulkProgress && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center gap-2 text-xs text-gray-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F26522]" />
                    <span>Creating {bulkProgress.current} of {bulkProgress.total}…</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full bg-[#F26522] transition-all" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Teachers table — ID · Name · Email · Phone · Courses + row actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="All Teachers"
          desc="View, edit or delete a teacher, or assign their courses & sections."
          action={
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#F26522] font-medium disabled:opacity-60">
              <Loader2 className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          }
        />
        <div className="relative mb-4 w-full sm:max-w-xs">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={teachersSearch} onChange={(e) => setTeachersSearch(e.target.value)} placeholder="Search by name or Teacher ID…" className={cn(inputCls, 'pl-9 h-9')} />
        </div>
        {loading && teachers.length === 0 ? (
          <SkeletonTable rows={4} />
        ) : teachers.length === 0 ? (
          <EmptyState icon={Users} title="No teachers yet" desc="Click “Add Teacher” to create the first teacher login." />
        ) : filteredTeachers.length === 0 ? (
          <EmptyState icon={Search} title="No matching teachers" desc="Try a different search term." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Teacher ID</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Name</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Email</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Phone</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-center">Courses</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTeachers.map((t) => {
                  const aCount = Array.isArray(t.assignments) ? t.assignments.length : 0;
                  return (
                    <TableRow key={t.id} className="border-gray-100 hover:bg-gray-50">
                      <TableCell className="text-sm font-mono text-gray-700">{t.rollNo || '—'}</TableCell>
                      <TableCell className="text-sm font-medium text-gray-900">{t.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">{t.email || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{t.guardianPhone || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-700 text-center tabular-nums">{aCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button size="sm" className="h-8 px-2.5 text-xs bg-[#F26522] hover:bg-[#D4541E] text-white" onClick={() => { setAssignForm({ program: DEPARTMENTS[0], part: '1', section: '', course: '', incharge: false }); setAssignTarget(t); }}>
                            <BookOpen className="h-3.5 w-3.5 mr-1" /> Assign Course
                          </Button>
                          <button onClick={() => setViewTarget(t)} className="h-8 px-2 text-xs text-gray-600 hover:text-[#F26522] hover:bg-orange-50 rounded inline-flex items-center gap-1">
                            <ClipboardList className="h-3.5 w-3.5" /> View
                          </button>
                          <button onClick={() => openEditTeacher(t)} className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded inline-flex items-center gap-1">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button onClick={() => deleteTeacher(t)} disabled={deletingTeacherId === t.id} className="h-8 px-2 text-xs text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded inline-flex items-center gap-1 disabled:opacity-50">
                            {deletingTeacherId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                          </button>
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

      {/* ── Add Teacher sheet (opened by the header button) ── */}
      <Sheet open={addOpen} onOpenChange={(o) => setAddOpen(o)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold text-gray-900">Add Teacher</SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              Default password is <span className="font-semibold">concordia1234</span> — the teacher changes it on first login. Assign courses & sections after creating.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <Input ref={nameRef} value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} className={inputCls} placeholder="Ayesha Khan" />
              </Field>
              <Field label="Teacher ID" required>
                <Input value={teacherForm.rollNo} onChange={(e) => setTeacherForm({ ...teacherForm, rollNo: e.target.value })} className={inputCls} placeholder="T001" />
              </Field>
              <Field label="Email (optional)">
                <Input value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} className={inputCls} placeholder="auto-generated if blank" />
              </Field>
              <Field label="Phone">
                <Input value={teacherForm.phone} onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })} className={inputCls} placeholder="03XXXXXXXXX" />
              </Field>
            </div>
            <Field label="Password (optional)">
              <Input value={teacherForm.password} onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })} className={inputCls} placeholder="Defaults to concordia1234" />
            </Field>
            <div className="flex gap-2 pt-1">
              <button onClick={submitTeacher} disabled={savingTeacher} className={cn(btnPrimary, 'flex-1 h-10 justify-center')}>
                {savingTeacher ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Create Login
              </button>
              <button onClick={() => setAddOpen(false)} className={cn(btnSecondary, 'h-10')}>Cancel</button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Assign Course sheet ── */}
      <Sheet open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold text-gray-900">Assign Course — {assignTarget?.name}</SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              Pick a program, part and section, type the course, and mark whether this teacher is the section In-charge.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Program" required>
                <Select value={assignForm.program} onValueChange={(v) => setAssignForm((f) => ({ ...f, program: v, section: '' }))}>
                  <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{deptLabel(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Part">
                <PartToggle value={assignForm.part} onChange={(p) => setAssignForm((f) => ({ ...f, part: p as '1' | '2', section: '' }))} />
              </Field>
              <Field label="Section" required>
                {assignSectionOptions.length > 0 ? (
                  <Select value={assignForm.section} onValueChange={(v) => setAssignForm((f) => ({ ...f, section: v }))}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>
                      {assignSectionOptions.map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={assignForm.section} onChange={(e) => setAssignForm((f) => ({ ...f, section: e.target.value }))} className={inputCls} placeholder="No sections — type one (e.g. A)" maxLength={4} />
                )}
              </Field>
              <Field label="Course" required>
                <Input value={assignForm.course} onChange={(e) => setAssignForm((f) => ({ ...f, course: e.target.value }))} className={inputCls} placeholder="e.g. Biology" />
              </Field>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3">
              <input type="checkbox" checked={assignForm.incharge} onChange={(e) => setAssignForm((f) => ({ ...f, incharge: e.target.checked }))} className="h-4 w-4 mt-0.5 accent-[#F26522]" />
              <span className="text-xs text-gray-600">
                <span className="font-semibold text-gray-900">This teacher is the In-charge of this section.</span> Only section in-charges can mark attendance for it.
              </span>
            </label>
            <button onClick={saveAssignment} disabled={savingAssign} className={cn(btnPrimary, 'w-full h-10 justify-center')}>
              {savingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Assign Course
            </button>

            {/* Existing assignments */}
            <div className="pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Assigned Courses ({Array.isArray(assignTarget?.assignments) ? assignTarget!.assignments.length : 0})</h4>
              {(!assignTarget?.assignments || assignTarget.assignments.length === 0) ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">No courses assigned yet.</div>
              ) : (
                <div className="space-y-2">
                  {assignTarget.assignments.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.course}
                          {a.incharge && <span className="ml-2 inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Incharge</span>}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{deptLabel(a.program)} · Part {a.part} · Section {a.section}</p>
                      </div>
                      <button onClick={() => removeAssignment(assignTarget, i)} className="shrink-0 text-gray-400 hover:text-rose-600 p-1 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── View teacher sheet ── */}
      <Sheet open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-white">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold text-gray-900">{viewTarget?.name}</SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              {viewTarget?.rollNo || '—'}{viewTarget?.email ? ` · ${viewTarget.email}` : ''}{viewTarget?.guardianPhone ? ` · ${viewTarget.guardianPhone}` : ''}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Courses & Sections</h4>
            {(!viewTarget?.assignments || viewTarget.assignments.length === 0) ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">No courses assigned. Use “Assign Course”.</div>
            ) : (
              <div className="space-y-2">
                {viewTarget.assignments.map((a: any, i: number) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-2.5">
                    <p className="text-sm font-medium text-gray-900">{a.course}
                      {a.incharge && <span className="ml-2 inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Incharge</span>}
                    </p>
                    <p className="text-[11px] text-gray-500">{deptLabel(a.program)} · Part {a.part} · Section {a.section}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Class detail sheet (kept from old ClassesView) */}
      <Sheet open={!!detailClass} onOpenChange={(o) => !o && setDetailClass(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {detailClass && (() => {
            const count = studentCount(detailClass);
            const enrolled = enrolledStudents(detailClass);
            const visibleStudents = showAllStudents ? enrolled : enrolled.slice(0, 20);
            const clsTeachers = classTeachers(detailClass);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-gray-900 text-lg">{detailClass.name} — Section {detailClass.section}</SheetTitle>
                  <SheetDescription>
                    {detailClass.program ? `${detailClass.program} · ` : ''}Part {detailClass.part || '1'} — class details, enrolled students and assigned teachers.
                  </SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-2 space-y-5 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Enrolled</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{count}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Teachers</div>
                      <div className="text-lg font-bold text-gray-900 tabular-nums">{clsTeachers.length}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Enrolled Students ({enrolled.length})</h4>
                    {enrolled.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                        <p className="text-xs text-gray-500">No students enrolled in this section yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-60 overflow-y-auto concordia-scroll pr-1">
                        {visibleStudents.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 hover:bg-gray-50">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                              <div className="text-[11px] text-gray-500">Roll #{s.rollNo || '—'}{s.guardian ? ` • Father: ${s.guardian}` : ''}</div>
                            </div>
                          </div>
                        ))}
                        {enrolled.length > 20 && (
                          <button onClick={() => setShowAllStudents((v) => !v)} className="mt-2 w-full text-center text-xs text-[#F26522] hover:underline font-medium py-1">
                            {showAllStudents ? 'Show less' : `View all ${enrolled.length}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Subjects &amp; Teachers</h4>

                    {/* Course catalog hint — if the class has no courses linked
                        yet, the officer can't assign a teacher to any course.
                        Surface that early instead of letting the assign button
                        fail with "Select at least one course". */}
                    {classCourses.length === 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 mb-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <div className="text-[11px] text-amber-800 leading-relaxed">
                            <span className="font-semibold">No courses linked to this class yet.</span> Add courses to this class first (from the Courses page or by assigning class courses) — then assign teachers to those courses. A teacher must be linked to ≥1 course or their portal won't show this class.
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {clsTeachers.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                        <p className="text-xs text-gray-500 mb-1">No teachers assigned to this class yet.</p>
                        <p className="text-[11px] text-gray-400">Use the Assign Teacher control below to add one.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {clsTeachers.map((t) => {
                          const subs = parseTeacherField(t.subjects);
                          // Live course list for THIS teacher in THIS class,
                          // straight from teacher_class_courses — matches what
                          // the teacher's portal will show.
                          const myTcc = classTcc.filter((row) => row.teacherId === t.id);
                          const unassignedCourses = classCourses.filter((cc) => !myTcc.some((row) => row.courseId === cc.id));
                          return (
                            <div key={t.id} className="rounded-md border border-gray-200 bg-white px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-900 truncate">{t.name}</div>
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    {t.rollNo ? `ID ${t.rollNo}` : ''}
                                    {t.rollNo && subs.length > 0 ? ' • ' : ''}
                                    {subs.length > 0 ? `Subjects: ${subs.join(', ')}` : ''}
                                  </div>
                                </div>
                                <button onClick={() => removeTeacher(t)} disabled={removingTeacherId === t.id} className="shrink-0 h-7 px-2 text-[11px] font-medium text-gray-500 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 rounded inline-flex items-center gap-1 disabled:opacity-60">
                                  {removingTeacherId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />} Remove
                                </button>
                              </div>

                              {/* Assigned courses (live from TCC) */}
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {myTcc.length === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                                    <AlertCircle className="h-3 w-3" /> No courses linked — teacher's portal won't show this class
                                  </span>
                                ) : (
                                  myTcc.map((row) => (
                                    <span key={row.courseId} className="inline-flex items-center gap-1 text-[10px] font-medium text-[#9a3a0f] bg-orange-50 border border-orange-200 rounded px-2 py-0.5">
                                      <BookCopy className="h-3 w-3" />
                                      {row.courseName || row.courseCode || 'Course'}
                                      {row.courseCode ? <span className="text-orange-400 font-normal">· {row.courseCode}</span> : null}
                                    </span>
                                  ))
                                )}
                              </div>

                              {/* Inline "Add courses" control for already-assigned teachers */}
                              {addClassTeacherId === t.id ? (
                                <div className="mt-2.5 rounded-md border border-orange-200 bg-orange-50/40 p-2.5">
                                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Add courses</div>
                                  {unassignedCourses.length === 0 ? (
                                    <p className="text-[11px] text-gray-500">This teacher is already linked to every course in this class. 🎉</p>
                                  ) : (
                                    <>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto concordia-scroll pr-1">
                                        {unassignedCourses.map((cc) => {
                                          const checked = extraCourseIds.includes(cc.id);
                                          return (
                                            <label key={cc.id} className={cn('flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer transition-colors', checked ? 'border-[#F26522] bg-white' : 'border-gray-200 bg-white hover:bg-gray-50')}>
                                              <Checkbox
                                                checked={checked}
                                                onCheckedChange={(v) => {
                                                  if (v) setExtraCourseIds((prev) => [...prev, cc.id]);
                                                  else setExtraCourseIds((prev) => prev.filter((x) => x !== cc.id));
                                                }}
                                              />
                                              <span className="text-[11px] font-medium text-gray-700 truncate">{cc.name}{cc.code ? <span className="text-gray-400 font-normal"> · {cc.code}</span> : null}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                      <div className="flex gap-2 mt-2">
                                        <button onClick={() => addCoursesToTeacher(t.id)} disabled={addingCourses || extraCourseIds.length === 0} className={cn(btnPrimary, 'h-7 px-3 text-[11px]')}>
                                          {addingCourses ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add {extraCourseIds.length > 0 ? `${extraCourseIds.length} ` : ''}course{extraCourseIds.length === 1 ? '' : 's'}
                                        </button>
                                        <button onClick={() => { setAddClassTeacherId(null); setExtraCourseIds([]); }} className="h-7 px-3 text-[11px] font-medium text-gray-600 hover:text-gray-900 border border-gray-200 bg-white rounded">Cancel</button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setAddClassTeacherId(t.id); setExtraCourseIds([]); }}
                                  disabled={classCourses.length === 0}
                                  className="mt-2 h-6 px-2 text-[10px] font-medium text-[#F26522] hover:bg-orange-50 border border-orange-200 rounded inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Plus className="h-3 w-3" /> Add courses
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Assign NEW teacher — now requires course selection */}
                    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50/50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="h-3.5 w-3.5 text-[#F26522]" />
                        <span className="text-xs font-semibold text-gray-700">Assign Teacher</span>
                      </div>
                      {(() => {
                        const assignedIds = new Set(clsTeachers.map((t) => t.id));
                        const available = teachers.filter((t) => !assignedIds.has(t.id));
                        if (available.length === 0) return <p className="text-[11px] text-gray-500">All teachers in this branch are already assigned to this class.</p>;
                        if (classCourses.length === 0) {
                          return (
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                              Add courses to this class first — a teacher must be linked to ≥1 course so their portal shows this class.
                            </p>
                          );
                        }
                        return (
                          <div className="space-y-2.5">
                            <Select value={assignTeacherId} onValueChange={setAssignTeacherId}>
                              <SelectTrigger className={cn(inputCls, 'h-9 flex-1')}><SelectValue placeholder="Select a teacher…" /></SelectTrigger>
                              <SelectContent>
                                {available.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}{t.rollNo ? ` • ${t.rollNo}` : ''}</SelectItem>))}
                              </SelectContent>
                            </Select>

                            {/* Course multi-select — REQUIRED. The fix for
                                "teacher assigned to class but not to course". */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Layers className="h-3 w-3 text-gray-400" />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Courses to teach (pick ≥1)</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto concordia-scroll pr-1">
                                {classCourses.map((cc) => {
                                  const checked = assignCourseIds.includes(cc.id);
                                  return (
                                    <label key={cc.id} className={cn('flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer transition-colors', checked ? 'border-[#F26522] bg-white' : 'border-gray-200 bg-white hover:bg-gray-50')}>
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(v) => {
                                          if (v) setAssignCourseIds((prev) => [...prev, cc.id]);
                                          else setAssignCourseIds((prev) => prev.filter((x) => x !== cc.id));
                                        }}
                                      />
                                      <span className="text-[11px] font-medium text-gray-700 truncate">{cc.name}{cc.code ? <span className="text-gray-400 font-normal"> · {cc.code}</span> : null}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <button onClick={assignTeacher} disabled={!assignTeacherId || assignSaving || assignCourseIds.length === 0} className={cn(btnPrimary, 'h-9 w-full justify-center')}>
                              {assignSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                              Assign {assignCourseIds.length > 0 ? `· ${assignCourseIds.length} course${assignCourseIds.length === 1 ? '' : 's'}` : ''}
                            </button>
                          </div>
                        );
                      })()}
                      <p className="text-[11px] text-gray-400 mt-2">The teacher will see this class + the selected courses in their portal immediately.</p>
                    </div>
                  </div>
                </div>
                <SheetFooter>
                  <button onClick={() => setDeleteTarget(detailClass)} className="h-9 px-4 text-sm font-medium text-rose-600 border border-rose-200 bg-white hover:bg-rose-50 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors w-full">
                    <AlertCircle className="h-4 w-4" /> Delete Class
                  </button>
                </SheetFooter>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Credentials confirmation Sheet (teacher) */}
      <Sheet open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <SheetContent className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle className="text-gray-900">Teacher Login Created</SheetTitle>
            <SheetDescription>Share these credentials securely.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Name</div>
                <div className="text-sm font-semibold text-gray-900">{created?.name}</div>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Username</span>
                  <CopyButton text={created?.user || ''} />
                </div>
                <div className="text-sm font-mono font-semibold text-gray-900">{created?.user}</div>
              </div>
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Password</span>
                  <CopyButton text={created?.pass || ''} />
                </div>
                <div className="text-sm font-mono font-semibold text-gray-900">{created?.pass}</div>
              </div>
            </div>
            <button onClick={() => { setCreated(null); setFormBlank(); setAddOpen(true); }} className={cn(btnPrimary, 'w-full justify-center h-10')}>
              <Plus className="h-4 w-4" /> Create Another
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Teacher Edit Sheet */}
      <Sheet open={!!editingTeacher} onOpenChange={(o) => !o && setEditingTeacher(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold text-gray-900">Edit Teacher</SheetTitle>
            <SheetDescription className="text-sm text-gray-500">Update name, Teacher ID, email, and password. Subjects / classes are managed from the class detail sheet.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <Input value={teacherEditForm.name} onChange={(e) => setTeacherEditForm({ ...teacherEditForm, name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Teacher ID / Roll No" required>
                <Input value={teacherEditForm.rollNo} onChange={(e) => setTeacherEditForm({ ...teacherEditForm, rollNo: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Email">
                <Input value={teacherEditForm.email} onChange={(e) => setTeacherEditForm({ ...teacherEditForm, email: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Title">
                <Input value={teacherEditForm.title} onChange={(e) => setTeacherEditForm({ ...teacherEditForm, title: e.target.value })} className={inputCls} placeholder="Teacher" />
              </Field>
            </div>
            <Field label="Password">
              <div className="flex gap-2">
                <Input type={revealTeacherPw ? 'text' : 'password'} value={teacherEditForm.password} onChange={(e) => setTeacherEditForm({ ...teacherEditForm, password: e.target.value })} className={inputCls} placeholder="leave blank to keep current" />
                <button onClick={revealTeacherPassword} disabled={teacherPwLoading} className={cn(btnSecondary, 'shrink-0')}>
                  {teacherPwLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {revealTeacherPw ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">Reveal pulls the current password from the server. Type a new one to overwrite it (the teacher will be prompted to change it on next sign-in).</p>
            </Field>
            <div className="flex gap-2 pt-2">
              <button onClick={saveTeacher} disabled={savingTeacherEdit} className={cn(btnPrimary, 'flex-1 h-10')}>
                {savingTeacherEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Changes
              </button>
              <button onClick={() => setEditingTeacher(null)} className={cn(btnSecondary, 'h-10')}>Cancel</button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete class confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!deleting) setDeleteTarget(o ? deleteTarget : null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="h-8 w-8 rounded-lg bg-rose-100 grid place-items-center shrink-0">
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </span>
              Delete this class?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-600">
                {deleteTarget && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center justify-between">
                    <span className="text-gray-500">Class</span>
                    <span className="font-semibold text-gray-900">{deleteTarget.name} — Section {deleteTarget.section}</span>
                  </div>
                )}
                <p>This will permanently remove the class and clean up everything tied to it (timetable entries, attendance, results, teacher assignments). Students are unlinked but kept. This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg" disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDeleteClass(); }} disabled={deleting} className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg">
              {deleting ? (<><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting…</>) : (<><AlertCircle className="h-4 w-4 mr-1.5" /> Yes, delete class</>)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ───────────────────────── Timetable (department hierarchy drill-down) ─────────────────────────
type TimetableDrill = { dept: string | null; part: string; cls: { id: string; name: string; section: string } | null; section: { id: string; name: string; section: string } | null };

function TimetableView({ user, classes, teachers }: { user: any; classes: any[]; teachers: any[] }) {
  const [drill, setDrill] = useNavState<TimetableDrill>('timetable', { dept: null, part: '1', cls: null, section: null });
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<'builder' | 'weekly'>('builder');
  const [copyDest, setCopyDest] = useState('Tuesday');
  const [busy, setBusy] = useState(false);

  // New-entry form state
  const [fDay, setFDay] = useState('Monday');
  const [fPeriod, setFPeriod] = useState('1');
  const [fSubject, setFSubject] = useState('');
  const [fTeacherId, setFTeacherId] = useState('');
  const [fStart, setFStart] = useState('08:00');
  const [fEnd, setFEnd] = useState('08:45');
  const [fRoom, setFRoom] = useState('');

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = (day: string) => entries.filter(e => e.day === day).sort((a, b) => (a.period || 0) - (b.period || 0));

  // The active class id is whichever section was drilled into (or the single
  // section if there's only one).
  const activeClassId = drill.section?.id || drill.cls?.id || '';
  const activeClassObj = classes.find((c) => c.id === activeClassId) || null;

  // ── Classes filtered by selected dept + part
  const classesInDept = useMemo(() => {
    if (!drill.dept) return [];
    return classes.filter(
      (c) => (c.program || '').trim() === drill.dept && String(c.part || '') === drill.part,
    );
  }, [classes, drill.dept, drill.part]);

  // Sections of the selected class (same name, different section letters).
  const sectionsOfClass = useMemo(() => {
    if (!drill.cls) return [];
    // Scope to the current Part — never merge Part 1 and Part 2 sections of
    // the same class (e.g. MB/MG in Part 1 vs MK/MQ in Part 2).
    return classes.filter(
      (c) => c.name === drill.cls!.name && String(c.part || '1') === String(drill.part || '1'),
    );
  }, [classes, drill.cls, drill.part]);
  const hasMultipleSections = sectionsOfClass.length > 1;

  // Load timetable whenever the active class changes.
  useEffect(() => {
    if (!activeClassId) { setEntries([]); return; }
    let cancelled = false;
    setLoading(true);
    api.getTimetable({ classId: activeClassId }).then((d) => {
      if (cancelled) return;
      setEntries(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setEntries([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeClassId]);

  const reloadEntries = useCallback(() => {
    if (!activeClassId) { setEntries([]); return; }
    api.getTimetable({ classId: activeClassId })
      .then((d) => setEntries(Array.isArray(d) ? d : []))
      .catch(() => setEntries([]));
  }, [activeClassId]);

  const resetForm = () => {
    setFDay('Monday'); setFPeriod('1'); setFSubject(''); setFTeacherId(''); setFStart('08:00'); setFEnd('08:45'); setFRoom('');
  };

  // ── Save entry with client-side clash detection (PRESERVED from old code).
  // The backend enforces the same three rules but surfacing them here gives
  // the academic office instant, specific feedback before the round-trip.
  const saveEntry = async () => {
    if (!activeClassId) { toast({ title: 'Select a class first', variant: 'destructive' }); return; }
    const period = parseInt(fPeriod, 10);
    if (!fDay || !Number.isFinite(period) || period < 1 || period > 12) {
      toast({ title: 'Day and a valid Period (1–12) are required', variant: 'destructive' });
      return;
    }
    if (!fSubject.trim()) { toast({ title: 'Subject is required', variant: 'destructive' }); return; }
    if (!fTeacherId) { toast({ title: 'Teacher is required', description: 'Every period must have a teacher so it shows on their timetable.', variant: 'destructive' }); return; }
    const teacher = teachers.find((t) => t.id === fTeacherId) || null;

    // Clash #1 — class slot taken (ignore the entry being edited).
    const classClash = entries.find((e) => e.day === fDay && Number(e.period) === period && e.id !== editingId);
    if (classClash) {
      toast({
        title: '⚠ Clash: class slot taken',
        description: `This class already has a lecture at Period ${period} on ${fDay} (${classClash.subject || 'a lecture'}${classClash.teacherName ? ` · ${classClash.teacherName}` : ''}). Delete that entry first to change it.`,
        variant: 'destructive',
      });
      return;
    }

    // Clash #2 + #3 — teacher double-booked / time overlap
    if (teacher) {
      try {
        const teacherEntries = await api.getTimetable({ teacherId: teacher.id });
        const teacherClash = (Array.isArray(teacherEntries) ? teacherEntries : []).find(
          (e: any) => e.day === fDay && Number(e.period) === period && e.id !== editingId,
        );
        if (teacherClash) {
          const clashCls = teacherClash.className
            ? `${teacherClash.className}${teacherClash.section ? '-' + teacherClash.section : ''}`
            : 'another class';
          toast({
            title: '⚠ Clash: teacher double-booked',
            description: `${teacher.name} already has ${teacherClash.subject || 'a lecture'} at Period ${period} on ${fDay} in ${clashCls}. Pick a different teacher, day, or period.`,
            variant: 'destructive',
          });
          return;
        }
        if (fStart && fEnd) {
          const timeClash = (Array.isArray(teacherEntries) ? teacherEntries : []).find((e: any) =>
            e.day === fDay && e.id !== editingId && e.startTime && e.endTime && e.startTime < fEnd && e.endTime > fStart,
          );
          if (timeClash) {
            const clashCls = timeClash.className
              ? `${timeClash.className}${timeClash.section ? '-' + timeClash.section : ''}`
              : 'another class';
            toast({
              title: '⚠ Clash: teacher time overlap',
              description: `${teacher.name} already has a lecture on ${fDay} ${timeClash.startTime}–${timeClash.endTime} in ${clashCls} that overlaps ${fStart}–${fEnd}.`,
              variant: 'destructive',
            });
            return;
          }
        }
      } catch {
        // Network failure on the pre-check — fall through to the server.
      }
    }

    setSaving(true);
    try {
      await api.saveTimetableEntry({
        classId: activeClassId,
        className: activeClassObj?.name || '',
        section: activeClassObj?.section || '',
        day: fDay,
        period,
        startTime: fStart,
        endTime: fEnd,
        subject: fSubject.trim(),
        teacherId: teacher?.id || null,
        teacherName: teacher?.name || '',
        roomName: fRoom.trim(),
      });
      // When editing, remove the old row after the new one is saved.
      if (editingId) { try { await api.deleteTimetableEntry(editingId); } catch {} }
      toast({ title: editingId ? 'Timetable entry updated' : 'Timetable entry saved', description: `${fDay} • Period ${period} • ${fSubject.trim()}` });
      resetForm();
      setEditingId(null);
      setShowForm(false);
      reloadEntries();
    } catch (e: any) {
      // Server-side clash message (already very specific — surface verbatim).
      toast({ title: '⚠ Clash detected', description: e?.message || 'Failed to save entry', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Load an entry into the form for editing.
  const editEntry = (e: any) => {
    setEditingId(e.id);
    setFDay(e.day || 'Monday');
    setFPeriod(String(e.period || '1'));
    setFSubject(e.subject || '');
    setFTeacherId(e.teacherId || '');
    setFStart(e.startTime || '08:00');
    setFEnd(e.endTime || '08:45');
    setFRoom(e.roomName || '');
    setShowForm(true);
    setView('builder');
  };

  // Copy every period of one day to another day (skips periods already taken).
  const copyDay = async (src: string, dest: string) => {
    if (src === dest) { toast({ title: 'Pick two different days', variant: 'destructive' }); return; }
    const source = byDay(src);
    if (source.length === 0) { toast({ title: `${src} has no periods to copy`, variant: 'destructive' }); return; }
    const destPeriods = new Set(byDay(dest).map((e) => Number(e.period)));
    const toCopy = source.filter((e) => !destPeriods.has(Number(e.period)));
    if (toCopy.length === 0) { toast({ title: `${dest} already has those periods`, variant: 'destructive' }); return; }
    setBusy(true);
    try {
      for (const e of toCopy) {
        await api.saveTimetableEntry({
          classId: activeClassId, className: activeClassObj?.name || '', section: activeClassObj?.section || '',
          day: dest, period: Number(e.period), startTime: e.startTime, endTime: e.endTime,
          subject: e.subject, teacherId: e.teacherId || null, teacherName: e.teacherName || '', roomName: e.roomName || '',
        });
      }
      toast({ title: `Copied ${src} → ${dest}`, description: `${toCopy.length} period(s) copied.` });
      reloadEntries();
    } catch (e: any) {
      toast({ title: 'Copy failed', description: e?.message || 'A period may clash on the target day.', variant: 'destructive' });
      reloadEntries();
    } finally { setBusy(false); }
  };

  const deleteFullTimetable = async () => {
    if (entries.length === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete the ENTIRE timetable for ${activeClassObj?.name} — Section ${activeClassObj?.section}? (${entries.length} entries)`)) return;
    setBusy(true);
    try {
      for (const e of entries) { if (e.id) { try { await api.deleteTimetableEntry(e.id); } catch {} } }
      toast({ title: 'Timetable deleted' });
      reloadEntries();
    } finally { setBusy(false); }
  };

  const publishTimetable = async () => {
    if (!activeClassId) return;
    setBusy(true);
    try {
      const r = await api.publishTimetable(activeClassId);
      toast({ title: 'Timetable published', description: `Sent to ${r.students} student(s) & ${r.teachers} teacher(s).` });
    } catch (e: any) {
      toast({ title: 'Could not publish', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const removeEntry = async (entry: any) => {
    if (!entry?.id) return;
    if (!confirm(`Delete ${entry.day} Period ${entry.period} — ${entry.subject || 'entry'}?`)) return;
    setDeletingId(entry.id);
    try {
      await api.deleteTimetableEntry(entry.id);
      toast({ title: 'Entry deleted' });
      reloadEntries();
    } catch (e: any) {
      toast({ title: 'Failed to delete entry', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setDeletingId(null); }
  };

  const handleSelectDept = (dept: string) =>
    setDrill({ dept, part: '1', cls: null, section: null });
  const handleSelectClass = (cls: { id: string; name: string; section: string }) => {
    const secs = classes.filter((c) => c.name === cls.name);
    setDrill({ ...drill, cls, section: null });
  };
  const handleSelectSection = (section: { id: string; name: string; section: string }) =>
    setDrill({ ...drill, section });
  const handleClearHierarchy = () =>
    setDrill({ dept: null, part: '1', cls: null, section: null });

  // ── Render: hierarchy drill-down or timetable grid ──
  let body: React.ReactNode;
  if (!drill.dept) {
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Select a Department</h2>
          <p className="text-xs text-gray-500 mt-0.5">Browse the 6 Concordia departments to drill into their class timetables.</p>
        </div>
        <DeptCardGrid onSelect={handleSelectDept} />
      </motion.div>
    );
  } else if (!drill.cls) {
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <HierarchyBreadcrumb dept={drill.dept} part={drill.part} onClear={handleClearHierarchy} />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{drill.dept} Classes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pick Part 1 (1st year) or Part 2 (2nd year), then select a class.</p>
          </div>
          <PartToggle value={drill.part} onChange={(p) => setDrill((d) => ({ ...d, part: p, cls: null, section: null }))} />
        </div>
        {classesInDept.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-900">No classes found for {drill.dept} · Part {drill.part}</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">Create classes with this department + part from the Classes &amp; Teachers page.</p>
          </div>
        ) : (
          <ClassCardGrid classes={classesInDept} onSelect={handleSelectClass} />
        )}
      </motion.div>
    );
  } else if (drill.cls && !drill.section) {
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <HierarchyBreadcrumb dept={drill.dept} part={drill.part} cls={drill.cls.name} onClear={handleClearHierarchy} />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{drill.cls.name} — Select Section</h2>
            <p className="text-xs text-gray-500 mt-0.5">This class has multiple sections. Pick one to manage its timetable.</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => setDrill((d) => ({ ...d, cls: null, section: null }))}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to classes
          </Button>
        </div>
        <SectionCardGrid sections={sectionsOfClass} onSelect={handleSelectSection} />
      </motion.div>
    );
  } else {
    // Timetable grid for the selected class + section
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <HierarchyBreadcrumb dept={drill.dept} part={drill.part} cls={drill.cls.name} section={drill.section?.section} onClear={handleClearHierarchy} />
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {activeClassObj?.name} — Section {activeClassObj?.section}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {drill.dept} · Part {drill.part} · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {view === 'builder' && (
                <button onClick={() => { if (showForm) { setEditingId(null); resetForm(); } setShowForm((s) => !s); }} className={btnPrimary}>
                  <Plus className="h-4 w-4" /> {showForm ? 'Cancel' : 'Add Entry'}
                </button>
              )}
              <button
                onClick={() => setView((v) => (v === 'builder' ? 'weekly' : 'builder'))}
                disabled={entries.length === 0}
                className={cn(btnSecondary, 'h-10', entries.length === 0 && 'opacity-50')}
              >
                <Calendar className="h-4 w-4" /> {view === 'builder' ? 'Finalize · Weekly View' : 'Back to Builder'}
              </button>
            </div>
          </div>

          {/* Toolbar: copy a day, publish, delete all */}
          {entries.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4 rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600">
                <span className="font-medium text-gray-500">Copy {fDay}</span>
                <span>→</span>
                <Select value={copyDest} onValueChange={setCopyDest}>
                  <SelectTrigger className={cn(inputCls, 'h-8 w-36')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS.filter((d) => d !== fDay).map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button onClick={() => copyDay(fDay, copyDest)} disabled={busy} className={cn(btnSecondary, 'h-8 text-xs')}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Copy day
                </button>
                <span className="text-[11px] text-gray-400">(copies every period of {fDay})</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={publishTimetable} disabled={busy} className={cn(btnPrimary, 'h-8 text-xs')}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Publish &amp; Notify
                </button>
                <button onClick={deleteFullTimetable} disabled={busy} className="h-8 px-3 text-xs rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 inline-flex items-center gap-1.5 font-medium">
                  <Trash2 className="h-3.5 w-3.5" /> Delete all
                </button>
              </div>
            </div>
          )}

          {showForm && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 mb-4">
              <SectionHeader title={editingId ? 'Edit Timetable Entry' : 'New Timetable Entry'} desc="Pick a day + period. Teacher is required so the period shows on their timetable. Clashes are caught before saving." />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Day" required>
                  <Select value={fDay} onValueChange={setFDay}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Period" required>
                  <Input type="number" min={1} max={12} value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} className={inputCls} placeholder="1" />
                </Field>
                <Field label="Subject" required>
                  <Input value={fSubject} onChange={(e) => setFSubject(e.target.value)} className={inputCls} placeholder="Mathematics" />
                </Field>
                <Field label="Teacher" required>
                  <Select value={fTeacherId} onValueChange={setFTeacherId}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue placeholder="Select teacher" /></SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.rollNo ? ` • ${t.rollNo}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Start Time">
                  <Input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} className={inputCls} />
                </Field>
                <Field label="End Time">
                  <Input type="time" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Room">
                  <Input value={fRoom} onChange={(e) => setFRoom(e.target.value)} className={inputCls} placeholder="Room 101" />
                </Field>
                <div className="flex items-end gap-2">
                  <button onClick={saveEntry} disabled={saving} className={btnPrimary + ' h-10 flex-1'}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {editingId ? 'Update Entry' : 'Save Entry'}
                  </button>
                  <button onClick={() => { setShowForm(false); resetForm(); setEditingId(null); }} className={btnSecondary + ' h-10'}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonTable rows={4} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No timetable entries"
              desc="Add the first period for this class to build its weekly timetable."
              action={!showForm ? (
                <button onClick={() => setShowForm(true)} className={btnPrimary}><Plus className="h-4 w-4" /> Add Entry</button>
              ) : undefined}
            />
          ) : view === 'weekly' ? (
            // ── Finalized weekly grid: periods (rows) × days (columns) ──
            (() => {
              const periods = Array.from(new Set(entries.map((e) => Number(e.period)))).sort((a, b) => a - b);
              const cell = (day: string, p: number) => entries.find((e) => e.day === day && Number(e.period) === p);
              return (
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full border-collapse text-sm min-w-[720px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-white p-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 w-20">Period</th>
                        {DAYS.map((d) => (
                          <th key={d} className="p-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((p) => (
                        <tr key={p}>
                          <td className="sticky left-0 bg-white p-2 align-top text-xs font-bold text-gray-700 border-b border-gray-100">P{p}</td>
                          {DAYS.map((d) => {
                            const e = cell(d, p);
                            return (
                              <td key={d} className="p-1.5 align-top border-b border-gray-100">
                                {e ? (
                                  <div className="group relative rounded-lg border border-gray-200 bg-gradient-to-br from-orange-50/60 to-white p-2.5 pr-7 hover:border-[#F26522]/40 transition-colors">
                                    <div className="absolute top-1.5 right-1.5 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => editEntry(e)} title="Edit" className="h-5 w-5 grid place-items-center text-gray-400 hover:text-[#F26522] rounded"><Pencil className="h-3 w-3" /></button>
                                      <button onClick={() => removeEntry(e)} disabled={deletingId === e.id} title="Delete" className="h-5 w-5 grid place-items-center text-gray-400 hover:text-rose-600 rounded">{deletingId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}</button>
                                    </div>
                                    <div className="text-sm font-semibold text-gray-900 leading-tight">{e.subject || '—'}</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">{e.startTime}–{e.endTime}</div>
                                    {e.teacherName && <div className="text-[10px] text-gray-500 truncate">{e.teacherName}</div>}
                                    {e.roomName && <div className="text-[10px] text-gray-400">{e.roomName}</div>}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditingId(null); resetForm(); setFDay(d); setFPeriod(String(p)); setShowForm(true); setView('builder'); }}
                                    className="w-full h-full min-h-[52px] rounded-lg border border-dashed border-gray-200 text-gray-300 hover:text-[#F26522] hover:border-[#F26522]/40 grid place-items-center"
                                    title={`Add ${d} P${p}`}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()
          ) : (
            <div className="space-y-3">
              {DAYS.map((day) => {
                const dayEntries = byDay(day);
                if (dayEntries.length === 0) return null;
                return (
                  <div key={day}>
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{day}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {dayEntries.map((e, i) => (
                        <div key={e.id || i} className="group relative rounded-lg border border-gray-200 bg-white p-3 pr-16 hover:border-gray-300 transition-colors">
                          <div className="absolute top-2 right-2 flex items-center gap-0.5">
                            <button onClick={() => editEntry(e)} aria-label="Edit entry" className="h-6 w-6 inline-flex items-center justify-center text-gray-300 hover:text-[#F26522] hover:bg-orange-50 rounded">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => removeEntry(e)} disabled={deletingId === e.id} aria-label="Delete entry" className="h-6 w-6 inline-flex items-center justify-center text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded disabled:opacity-50">
                              {deletingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <div className="text-xs text-gray-400">Period {e.period}</div>
                          <div className="text-sm font-semibold text-gray-900 mt-0.5">{e.subject || '—'}</div>
                          <div className="text-xs text-gray-500 mt-1">{e.startTime} — {e.endTime}</div>
                          {e.teacherName && <div className="text-xs text-gray-400 mt-0.5">{e.teacherName}</div>}
                          {e.roomName && <div className="text-xs text-gray-400">{e.roomName}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" subtitle="Drill into a department → part → class → section to build its weekly timetable." />
      {body}
    </div>
  );
}

// ───────────────────────── Exams & Date Sheets (merged page) ─────────────────────────
const EXAM_TYPES = ['Monthly Test', 'Midterm', 'Final', 'Quiz', 'Assignment', 'Oral Test', 'Class Test', 'Other'];

function ExamsAndDateSheetsView({ user }: { user: any }) {
  const [part, setPart] = useState<'1' | '2'>('1');
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingExam, setSavingExam] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('Monthly Test');
  const [confirmDeleteExam, setConfirmDeleteExam] = useState<string | null>(null);

  // Date sheet builder state
  const [builderExam, setBuilderExam] = useState<any | null>(null);
  const [builderEntries, setBuilderEntries] = useState<{ subject: string; examDate: string; examTime: string; roomName: string }[]>([]);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderSaving, setBuilderSaving] = useState(false);

  // Existing date sheets (keyed by examId) — shown as tables under each exam card.
  const [existingSheets, setExistingSheets] = useState<Record<string, any>>({});
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getExams({ branchId: user?.branchId })
      .then((d) => setExams(Array.isArray(d) ? d : []))
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, [user?.branchId]);
  useEffect(() => { load(); }, [load]);

  // ── When the part tab changes, load all date sheets for that part so each
  // exam card can show its saved sheet (or "Build" button) without an extra
  // round-trip per card.
  useEffect(() => {
    let cancelled = false;
    api.getDateSheets({ part, branchId: user?.branchId })
      .then((d) => {
        if (cancelled) return;
        const map: Record<string, any> = {};
        for (const s of (Array.isArray(d) ? d : [])) {
          map[s.examId] = s;
        }
        setExistingSheets(map);
      })
      .catch(() => { if (!cancelled) setExistingSheets({}); });
    return () => { cancelled = true; };
  }, [part, user?.branchId]);

  const createExam = async () => {
    const clean = name.trim();
    if (!clean) { toast({ title: 'Enter an exam name', variant: 'destructive' }); return; }
    if (exams.some((e) => String(e.name).toLowerCase() === clean.toLowerCase())) {
      toast({ title: 'Duplicate exam name', description: `An exam named "${clean}" already exists.`, variant: 'destructive' });
      return;
    }
    setSavingExam(true);
    try {
      await api.createExam({ name: clean, type });
      toast({ title: 'Exam created', description: `"${clean}" is now available for date sheets.` });
      setName('');
      load();
    } catch (e: any) {
      toast({ title: 'Could not create exam', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setSavingExam(false); }
  };

  const removeExam = async (id: string) => {
    try {
      await api.deleteExam(id);
      toast({ title: 'Exam deleted' });
      setConfirmDeleteExam(null);
      load();
    } catch {
      toast({ title: 'Failed to delete exam', variant: 'destructive' });
    }
  };

  // ── Open the date sheet builder for an exam. Loads any existing entries so
  // the academic office can edit the saved sheet in place.
  const openBuilder = async (exam: any) => {
    setBuilderExam(exam);
    setBuilderLoading(true);
    try {
      const r = await api.getDateSheets({ examId: exam.id, part, branchId: user?.branchId });
      const sheet = Array.isArray(r) && r.length > 0 ? r[0] : null;
      if (sheet && Array.isArray(sheet.entries) && sheet.entries.length > 0) {
        setBuilderEntries(sheet.entries.map((e: any) => ({
          subject: e.subject || '',
          examDate: e.examDate ? String(e.examDate).slice(0, 10) : '',
          examTime: e.examTime || '',
          roomName: e.roomName || '',
        })));
      } else {
        setBuilderEntries([{ subject: '', examDate: '', examTime: '', roomName: '' }]);
      }
    } catch {
      setBuilderEntries([{ subject: '', examDate: '', examTime: '', roomName: '' }]);
    } finally { setBuilderLoading(false); }
  };

  const closeBuilder = () => {
    setBuilderExam(null);
    setBuilderEntries([]);
  };

  const saveDateSheet = async () => {
    if (!builderExam) return;
    const valid = builderEntries.filter((e) => e.subject && e.examDate);
    if (valid.length === 0) {
      toast({ title: 'Add at least one subject with a date', variant: 'destructive' });
      return;
    }
    setBuilderSaving(true);
    try {
      await api.saveDateSheet({
        examId: builderExam.id,
        examName: builderExam.name,
        part,
        branchId: user?.branchId,
        entries: valid.map((e) => ({
          subject: e.subject.trim(),
          examDate: e.examDate,
          examTime: e.examTime || '',
          roomName: e.roomName || '',
        })),
      });
      toast({ title: 'Date sheet saved', description: `${builderExam.name} — Part ${part}` });
      // Refresh the existing-sheets map so the table renders under the card.
      const r = await api.getDateSheets({ examId: builderExam.id, part, branchId: user?.branchId });
      const sheet = Array.isArray(r) && r.length > 0 ? r[0] : null;
      setExistingSheets((prev) => ({ ...prev, [builderExam.id]: sheet }));
      closeBuilder();
    } catch (e: any) {
      toast({ title: 'Failed to save date sheet', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setBuilderSaving(false); }
  };

  const deleteDateSheet = async (sheetId: string, examName: string) => {
    if (!confirm(`Delete the saved date sheet for ${examName} — Part ${part}?`)) return;
    setDeletingSheetId(sheetId);
    try {
      await api.deleteDateSheet(sheetId);
      toast({ title: 'Date sheet deleted' });
      // Drop it from the map (clear by examId).
      setExistingSheets((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v?.id === sheetId) delete next[k];
        }
        return next;
      });
    } catch (e: any) {
      toast({ title: 'Failed to delete date sheet', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setDeletingSheetId(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exams & Date Sheets"
        subtitle="Create exams and build date sheets per part. Each part has its own date sheet per exam."
      />

      {/* Part tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-gray-700">Part:</span>
        <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
      </div>

      {/* Create Exam form */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader title="Create New Exam" desc="Teachers will see this in their marks-entry dropdown. Date sheets are built per-part below." />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <Field label="Exam Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createExam(); }} className={inputCls} placeholder="e.g. Monthly Test 1, Midterm 2026" maxLength={80} />
          </Field>
          <Field label="Type">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className={inputCls + ' w-44'}><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXAM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <button onClick={createExam} disabled={savingExam || !name.trim()} className={btnPrimary}>
            {savingExam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Exam
          </button>
        </div>
      </div>

      {/* Exam cards */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader title={`Exams — Part ${part}`} desc={exams.length > 0 ? 'Build or edit the Part %s date sheet for each exam.'.replace('%s', part) : 'No exams yet — create one above.'} />
        {loading ? (
          <SkeletonTable rows={3} />
        ) : exams.length === 0 ? (
          <EmptyState icon={FileText} title="No exams yet" desc="Create your first exam above. Date sheets can then be built for it." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map((ex) => {
              const isConfirming = confirmDeleteExam === ex.id;
              const sheet = existingSheets[ex.id];
              return (
                <div key={ex.id} className="group relative rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-[#F26522]/40 hover:shadow-sm flex flex-col">
                  <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r bg-[#F26522]/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-[#F26522]/10 grid place-items-center shrink-0">
                      <FileText className="h-5 w-5 text-[#F26522]" />
                    </div>
                    <span className="inline-flex items-center rounded-md border bg-gray-50 text-gray-600 border-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      {ex.type || 'Exam'}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-gray-900 break-words">{ex.name}</h3>
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Created {ex.createdAt ? fmtDate(ex.createdAt) : '—'}
                  </p>

                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                    <button onClick={() => openBuilder(ex)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#F26522] hover:bg-[#D4541E] text-white text-xs font-medium h-8 px-3 transition-colors">
                      <CalendarPlus className="h-3.5 w-3.5" /> {sheet ? 'Edit Date Sheet' : 'Build Date Sheet'}
                    </button>
                    <button onClick={() => setConfirmDeleteExam(ex.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-gray-500 text-xs font-medium h-8 px-3 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>

                  {/* Saved date sheet table */}
                  {sheet && Array.isArray(sheet.entries) && sheet.entries.length > 0 && (
                    <div className="mt-4 rounded-lg border border-gray-100 overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Date Sheet · Part {part}</span>
                        <button
                          onClick={() => deleteDateSheet(sheet.id, ex.name)}
                          disabled={deletingSheetId === sheet.id}
                          className="text-[11px] text-gray-400 hover:text-rose-600 disabled:opacity-50"
                        >
                          {deletingSheetId === sheet.id ? 'Deleting…' : 'Delete Date Sheet'}
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto concordia-scroll">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-100">
                              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 h-8">Subject</TableHead>
                              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 h-8">Date</TableHead>
                              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 h-8">Time</TableHead>
                              <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 h-8">Room</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sheet.entries.map((e: any, i: number) => (
                              <TableRow key={i} className="border-gray-50">
                                <TableCell className="text-xs text-gray-900 py-1.5">{e.subject || '—'}</TableCell>
                                <TableCell className="text-xs text-gray-600 py-1.5">{fmtDate(e.examDate)}</TableCell>
                                <TableCell className="text-xs text-gray-600 py-1.5">{e.examTime || '—'}</TableCell>
                                <TableCell className="text-xs text-gray-600 py-1.5">{e.roomName || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {isConfirming && (
                    <div className="absolute inset-0 rounded-xl bg-white/95 backdrop-blur-sm border border-rose-200 flex flex-col items-center justify-center text-center p-5 gap-3">
                      <AlertCircle className="h-8 w-8 text-rose-500" />
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Delete this exam?</div>
                        <div className="text-xs text-gray-500 mt-1">Date sheets and submitted marks referencing it will remain.</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDeleteExam(null)} className={cn(btnSecondary, 'h-8 text-xs')}>Cancel</button>
                        <button onClick={() => removeExam(ex.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium h-8 px-3">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Date Sheet Builder Dialog */}
      <Sheet open={!!builderExam} onOpenChange={(o) => !o && closeBuilder()}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-gray-900 text-lg">
              Date Sheet Builder — {builderExam?.name}
            </SheetTitle>
            <SheetDescription>
              Part {part} · Add one row per subject. Saving replaces any existing date sheet for this exam + part.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            {builderLoading ? (
              <SkeletonTable rows={3} />
            ) : (
              <>
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="hidden md:grid grid-cols-[1fr_140px_120px_1fr_36px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-1">
                    <span>Subject</span>
                    <span>Date</span>
                    <span>Time</span>
                    <span>Room (optional)</span>
                    <span></span>
                  </div>
                  {builderEntries.map((r, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_140px_120px_1fr_36px] gap-2 items-end">
                      <Field label={i === 0 ? 'Subject' : undefined}>
                        <Input value={r.subject} onChange={(e) => { const n = [...builderEntries]; n[i].subject = e.target.value; setBuilderEntries(n); }} className={inputCls} placeholder="Mathematics" />
                      </Field>
                      <Field label={i === 0 ? 'Date' : undefined}>
                        <Input type="date" value={r.examDate} onChange={(e) => { const n = [...builderEntries]; n[i].examDate = e.target.value; setBuilderEntries(n); }} className={inputCls} />
                      </Field>
                      <Field label={i === 0 ? 'Time' : undefined}>
                        <Input type="time" value={r.examTime} onChange={(e) => { const n = [...builderEntries]; n[i].examTime = e.target.value; setBuilderEntries(n); }} className={inputCls} />
                      </Field>
                      <Field label={i === 0 ? 'Room' : undefined}>
                        <Input value={r.roomName} onChange={(e) => { const n = [...builderEntries]; n[i].roomName = e.target.value; setBuilderEntries(n); }} className={inputCls} placeholder="Room 101" />
                      </Field>
                      <button
                        onClick={() => i > 0 && setBuilderEntries(builderEntries.filter((_, j) => j !== i))}
                        disabled={i === 0 && builderEntries.length === 1}
                        className="h-10 px-2 text-gray-400 hover:text-rose-600 disabled:opacity-30"
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setBuilderEntries([...builderEntries, { subject: '', examDate: '', examTime: '', roomName: '' }])} className={btnSecondary}>
                    <Plus className="h-4 w-4" /> Add Row
                  </button>
                  <button onClick={saveDateSheet} disabled={builderSaving} className={btnPrimary}>
                    {builderSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Date Sheet
                  </button>
                  <button onClick={closeBuilder} className={cn(btnGhost, 'ml-auto')}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ───────────────────────── Result Cards (department hierarchy drill-down) ─────────────────────────
type ReportDrill = { dept: string | null; part: string; cls: { id: string; name: string; section: string } | null; section: { id: string; name: string; section: string } | null };

function ReportCardsView({ user, classes, students, teachers, exams }: { user: any; classes: any[]; students: any[]; teachers: any[]; exams: any[] }) {
  const [drill, setDrill] = useNavState<ReportDrill>('report-cards', { dept: null, part: '1', cls: null, section: null });
  const [courses, setCourses] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [pdfBusy, setPdfBusy] = useState<Record<string, 'download' | 'print' | undefined>>({});

  // The active class id.
  const activeClassId = drill.section?.id || drill.cls?.id || '';
  const activeClassObj = classes.find((c) => c.id === activeClassId) || null;

  // ── Classes filtered by selected dept + part
  const classesInDept = useMemo(() => {
    if (!drill.dept) return [];
    return classes.filter(
      (c) => (c.program || '').trim() === drill.dept && String(c.part || '') === drill.part,
    );
  }, [classes, drill.dept, drill.part]);

  const sectionsOfClass = useMemo(() => {
    if (!drill.cls) return [];
    // Scope to the current Part — never merge Part 1 and Part 2 sections of
    // the same class (e.g. MB/MG in Part 1 vs MK/MQ in Part 2).
    return classes.filter(
      (c) => c.name === drill.cls!.name && String(c.part || '1') === String(drill.part || '1'),
    );
  }, [classes, drill.cls, drill.part]);
  const hasMultipleSections = sectionsOfClass.length > 1;

  // ── Load courses + results for the active class (once the user drills in).
  useEffect(() => {
    if (!activeClassId) { setCourses([]); setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getCourses({ classId: activeClassId }).catch(() => []),
      api.getResults({ branchId: user?.branchId }).catch(() => []),
    ]).then(([co, r]) => {
      if (cancelled) return;
      setCourses(Array.isArray(co) ? co : []);
      setResults(Array.isArray(r) ? r : []);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeClassId, user?.branchId]);

  // Students enrolled in the active class.
  const clsStudents = useMemo(() => {
    if (!activeClassObj) return [];
    return students.filter((s) => s.class === activeClassObj.name && s.section === activeClassObj.section);
  }, [students, activeClassObj]);

  // Distinct exams that have at least one result row touching this class.
  const examsForClass = useMemo(() => {
    if (!activeClassObj) return [] as string[];
    const studentIds = new Set(clsStudents.map((s) => s.id));
    const examSet = new Set<string>();
    results.forEach((r) => {
      if (r.classId && r.classId === activeClassObj.id) { examSet.add(r.exam); return; }
      try {
        const recs = typeof r.records === 'string' ? JSON.parse(r.records) : (r.records || []);
        if (Array.isArray(recs) && recs.some((rec: any) => studentIds.has(rec.studentId))) {
          examSet.add(r.exam);
        }
      } catch { /* skip */ }
    });
    // Combine with the global exams list so the dropdown is never empty even
    // before teachers submit marks. Prefer result-derived names first.
    const fromResults = Array.from(examSet).sort();
    const fromExamsList = exams.map((e) => e.name).filter((n) => !examSet.has(n));
    return [...fromResults, ...fromExamsList];
  }, [results, clsStudents, activeClassObj, exams]);

  // Default the selected exam to the most-recent (first in the list, which is
  // already result-derived and sorted). Falls back to the first global exam.
  useEffect(() => {
    if (examsForClass.length === 0) {
      if (selectedExam) setSelectedExam('');
      return;
    }
    if (!examsForClass.includes(selectedExam)) {
      setSelectedExam(examsForClass[0]);
    }
  }, [examsForClass, selectedExam]);

  // ── Build the subject-column matrix for a class + exam (PRESERVED logic).
  const buildMatrix = (exam: string) => {
    if (!activeClassObj) return { subjects: [], matrix: {}, clsStudents: [] };
    const studentIds = new Set(clsStudents.map((s) => s.id));
    const subjOrder: string[] = [];
    const subjMap: Record<string, { courseId: string; name: string; total: number }> = {};
    const matrix: Record<string, Record<string, number | null>> = {};
    clsStudents.forEach((s) => { matrix[s.id] = {}; });

    results.forEach((r) => {
      if (r.exam !== exam) return;
      let touches = false;
      if (r.classId && r.classId === activeClassObj.id) touches = true;
      if (!touches) {
        try {
          const recs = typeof r.records === 'string' ? JSON.parse(r.records) : (r.records || []);
          if (Array.isArray(recs) && recs.some((rec: any) => studentIds.has(rec.studentId))) touches = true;
        } catch { /* skip */ }
      }
      if (!touches) return;

      const courseId = r.courseId || 'unknown';
      const courseName = (courses.find((c) => c.id === courseId)?.name) || r.courseId || 'Subject';
      const total = Number(r.totalMarks) || 100;
      if (!subjMap[courseId]) {
        subjMap[courseId] = { courseId, name: courseName, total };
        subjOrder.push(courseId);
      } else {
        subjMap[courseId].total = Math.max(subjMap[courseId].total, total);
      }
      try {
        const recs = typeof r.records === 'string' ? JSON.parse(r.records) : (r.records || []);
        (recs as any[]).forEach((rec) => {
          if (studentIds.has(rec.studentId)) {
            const prev = matrix[rec.studentId][courseId];
            const val = rec.marks != null ? Number(rec.marks) : null;
            if (prev == null || val != null) matrix[rec.studentId][courseId] = val;
          }
        });
      } catch { /* skip */ }
    });

    return {
      subjects: subjOrder.map((id) => subjMap[id]),
      matrix,
      clsStudents,
    };
  };

  const computeTotals = (subjects: any[], row: Record<string, number | null>) => {
    let obtained = 0;
    let total = 0;
    let entered = 0;
    subjects.forEach((s) => {
      const v = row[s.courseId];
      if (v != null && !isNaN(v)) { obtained += v; entered += 1; }
      total += s.total;
    });
    const pct = total > 0 ? Math.round((obtained / total) * 100) : null;
    return { obtained, total, entered, pct, grade: gradeFromPct(pct) };
  };

  // ── Per-row PDF download + print. Both call buildReportCard; download uses
  // savePdf, print uses printPdf (opens in a new tab + triggers the print
  // dialog).
  const generatePdf = async (student: any, mode: 'download' | 'print') => {
    if (!activeClassObj || !selectedExam) return;
    setPdfBusy((m) => ({ ...m, [student.id]: mode }));
    try {
      const { subjects, matrix } = buildMatrix(selectedExam);
      const row = matrix[student.id] || {};
      const { obtained, total, pct, grade } = computeTotals(subjects, row);
      const doc = await buildReportCard({
        instituteName: user?.instituteName || 'Concordia College',
        branchName: user?.branchName || 'Main Campus',
        docTitle: 'Result Card',
        docSubtitle: selectedExam,
        studentName: student.name,
        rollNo: student.rollNo || '—',
        className: activeClassObj.name,
        section: activeClassObj.section,
        term: selectedExam,
        fatherName: student.fatherName || student.guardian || '—',
        fatherContact: student.guardianPhone || student.fatherContact || '—',
        totalMarks: total,
        obtainedMarks: obtained,
        grade,
        position: pct != null ? `${pct}%` : '—',
        subjects: subjects.map((s) => {
          const v = row[s.courseId];
          const sp = v != null && s.total > 0 ? Math.round((v / s.total) * 100) : null;
          return { name: s.name, total: s.total, obtained: v != null ? v : 0, grade: gradeFromPct(sp) };
        }),
        remarks: pct == null ? 'Awaiting marks' : (pct >= 40 ? 'Promoted' : 'Needs improvement'),
      });
      const safeRoll = (student.rollNo || student.id || 'student').replace(/[^a-z0-9-]/gi, '-');
      const fileName = `ResultCard-${safeRoll}-${selectedExam.replace(/\s+/g, '_')}.pdf`;
      if (mode === 'download') {
        savePdf(doc, fileName);
        toast({ title: 'Result card downloaded', description: `${student.name} · ${selectedExam}` });
      } else {
        printPdf(doc);
        toast({ title: 'Opening print preview…', description: `${student.name} · ${selectedExam}` });
      }
    } catch (e: any) {
      toast({ title: 'Could not generate PDF', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setPdfBusy((m) => ({ ...m, [student.id]: undefined }));
    }
  };

  const handleSelectDept = (dept: string) =>
    setDrill({ dept, part: '1', cls: null, section: null });
  const handleSelectClass = (cls: { id: string; name: string; section: string }) => {
    const secs = classes.filter((c) => c.name === cls.name);
    setDrill({ ...drill, cls, section: null });
  };
  const handleSelectSection = (section: { id: string; name: string; section: string }) =>
    setDrill({ ...drill, section });
  const handleClearHierarchy = () =>
    setDrill({ dept: null, part: '1', cls: null, section: null });

  // ── Render
  let body: React.ReactNode;
  if (!drill.dept) {
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Select a Department</h2>
          <p className="text-xs text-gray-500 mt-0.5">Browse the 6 Concordia departments to drill into their class result cards.</p>
        </div>
        <DeptCardGrid onSelect={handleSelectDept} />
      </motion.div>
    );
  } else if (!drill.cls) {
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <HierarchyBreadcrumb dept={drill.dept} part={drill.part} onClear={handleClearHierarchy} />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{drill.dept} Classes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pick Part 1 (1st year) or Part 2 (2nd year), then select a class.</p>
          </div>
          <PartToggle value={drill.part} onChange={(p) => setDrill((d) => ({ ...d, part: p, cls: null, section: null }))} />
        </div>
        {classesInDept.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
            <Award className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium text-gray-900">No classes found for {drill.dept} · Part {drill.part}</p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">Create classes with this department + part from the Classes &amp; Teachers page.</p>
          </div>
        ) : (
          <ClassCardGrid classes={classesInDept} onSelect={handleSelectClass} />
        )}
      </motion.div>
    );
  } else if (drill.cls && !drill.section) {
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <HierarchyBreadcrumb dept={drill.dept} part={drill.part} cls={drill.cls.name} onClear={handleClearHierarchy} />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{drill.cls.name} — Select Section</h2>
            <p className="text-xs text-gray-500 mt-0.5">This class has multiple sections. Pick one to view its student results.</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50" onClick={() => setDrill((d) => ({ ...d, cls: null, section: null }))}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to classes
          </Button>
        </div>
        <SectionCardGrid sections={sectionsOfClass} onSelect={handleSelectSection} />
      </motion.div>
    );
  } else {
    // Student results table for the selected class + section + exam
    const { subjects, matrix } = selectedExam ? buildMatrix(selectedExam) : { subjects: [], matrix: {} };
    body = (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        <HierarchyBreadcrumb dept={drill.dept} part={drill.part} cls={drill.cls.name} section={drill.section?.section} onClear={handleClearHierarchy} />

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{activeClassObj?.name} — Section {activeClassObj?.section}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {clsStudents.length} student{clsStudents.length === 1 ? '' : 's'} · {subjects.length} subject{subjects.length === 1 ? '' : 's'}
                {selectedExam ? ` · ${selectedExam}` : ''}
              </p>
            </div>
            <Field label="Exam">
              <Select value={selectedExam} onValueChange={setSelectedExam}>
                <SelectTrigger className={cn(inputCls, 'w-64')}><SelectValue placeholder="Select exam…" /></SelectTrigger>
                <SelectContent>
                  {examsForClass.map((ex) => <SelectItem key={ex} value={ex}>{ex}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {loading ? (
            <SkeletonTable rows={4} />
          ) : clsStudents.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No students in this class" desc="Enroll students first to generate result cards." />
          ) : !selectedExam ? (
            <EmptyState icon={Award} title="No exam selected" desc="Pick an exam from the dropdown above to view results." />
          ) : subjects.length === 0 ? (
            <EmptyState icon={Award} title="No marks submitted yet" desc="Once teachers lock their subject marks for this exam, the class-wise result table will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200 bg-gray-50/50">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Roll #</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Student</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Father / Guardian</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">Contact</TableHead>
                    {subjects.map((s) => (
                      <TableHead key={s.courseId} className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 text-center whitespace-nowrap" title={s.name}>
                        {s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}
                        <span className="block text-[9px] font-normal text-gray-400 normal-case tracking-normal">/{s.total}</span>
                      </TableHead>
                    ))}
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 text-center whitespace-nowrap">Total</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 text-center whitespace-nowrap">%</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 text-center whitespace-nowrap">Grade</TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 text-right whitespace-nowrap">Download Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clsStudents.map((s) => {
                    const row = matrix[s.id] || {};
                    const { obtained, total, pct, grade } = computeTotals(subjects, row);
                    const busy = pdfBusy[s.id];
                    return (
                      <TableRow key={s.id} className="border-gray-100 hover:bg-gray-50">
                        <TableCell className="text-xs text-gray-700 font-mono whitespace-nowrap">{s.rollNo || '—'}</TableCell>
                        <TableCell className="text-sm font-medium text-gray-900 whitespace-nowrap">{s.name}</TableCell>
                        <TableCell className="text-xs text-gray-600 whitespace-nowrap">{s.fatherName || s.guardian || '—'}</TableCell>
                        <TableCell className="text-xs text-gray-600 font-mono whitespace-nowrap">{s.guardianPhone || s.fatherContact || '—'}</TableCell>
                        {subjects.map((sub) => {
                          const v = row[sub.courseId];
                          return (
                            <TableCell key={sub.courseId} className="text-sm text-center tabular-nums whitespace-nowrap">
                              {v == null ? <span className="text-gray-300">—</span> : <span className={v < sub.total * 0.4 ? 'text-red-600 font-semibold' : 'text-gray-900'}>{v}</span>}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-sm text-center font-semibold text-gray-900 tabular-nums whitespace-nowrap">{obtained}<span className="text-gray-400 font-normal">/{total}</span></TableCell>
                        <TableCell className="text-sm text-center tabular-nums font-semibold whitespace-nowrap">
                          {pct == null ? <span className="text-gray-300">—</span> : <span className={pct < 40 ? 'text-red-600' : pct >= 80 ? 'text-emerald-600' : 'text-gray-900'}>{pct}%</span>}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
                          <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                            grade === 'F' ? 'bg-red-50 text-red-700 border-red-100'
                            : grade === '—' ? 'bg-gray-50 text-gray-500 border-gray-200'
                            : grade.startsWith('A') ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-amber-50 text-amber-700 border-amber-100',
                          )}>{grade}</span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => generatePdf(s, 'download')}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy === 'download' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              PDF
                            </button>
                            <button
                              onClick={() => generatePdf(s, 'print')}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {busy === 'print' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                              Print
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Marks shown per subject are entered and locked by each subject&apos;s teacher from their portal. A dash (—) means marks haven&apos;t been submitted yet for that student.
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Result Cards"
        subtitle="Drill into a department → part → class → section to view aggregated marks and download / print result cards."
      />
      {body}
    </div>
  );
}

// ───────────────────────── Main router ─────────────────────────
export function AcademicPortal({ activeModule, user }: Props) {
  // ── Shared data — loaded in parallel so the hierarchy-driven views
  // (Timetable, Result Cards) have classes + students + teachers ready.
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [sharedLoading, setSharedLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getClasses(user?.branchId).catch(() => []),
      api.platformUsers({ role: 'student', branchId: user?.branchId }).catch(() => []),
      api.platformUsers({ role: 'teacher', branchId: user?.branchId }).catch(() => []),
      api.getExams({ branchId: user?.branchId }).catch(() => []),
    ]).then(([c, s, t, e]) => {
      if (cancelled) return;
      setClasses(Array.isArray(c) ? c : []);
      setStudents(Array.isArray(s) ? s : []);
      setTeachers(Array.isArray(t) ? t : []);
      setExams(Array.isArray(e) ? e : []);
      setSharedLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.branchId]);

  // Backward-compat: academic-tests and academic-datesheet both route to the
  // merged "Exams & Date Sheets" page.
  const effectiveModule =
    activeModule === 'academic-tests' || activeModule === 'academic-datesheet'
      ? 'academic-exams'
      : activeModule;

  let content: React.ReactNode;
  // ── Delegated Student-Records / Fees modules (namespaced role:moduleId) ──
  // The Academic Office gets the SAME add-student, student-records, and fee
  // pages the Admissions & Accountant offices use — rendered in-place, with
  // no duplicated logic. (Kept in the render switch, not an early return, so
  // the hook order above stays stable.)
  if (activeModule && activeModule.includes(':')) {
    const [ns, modId] = activeModule.split(':', 2);
    content = ns === 'accountant'
      ? <AccountantPortal activeModule={modId || ''} user={user} />
      : <AdmissionsPortal activeModule={modId || ''} user={user} />;
  } else if (effectiveModule === 'academic-overview') {
    content = <AcademicOverview user={user} />;
  } else if (effectiveModule === 'academic-announcements') {
    content = <AnnouncementsView user={user} />;
  } else if (effectiveModule === 'academic-classes') {
    content = <ClassesAndTeachersView user={user} />;
  } else if (effectiveModule === 'timetable') {
    content = sharedLoading ? (
      <div className="space-y-6">
        <PageHeader title="Timetable" subtitle="Drill into a department → part → class → section to build its weekly timetable." />
        <div className="rounded-xl border border-gray-200 bg-white p-5"><SkeletonTable rows={4} /></div>
      </div>
    ) : (
      <TimetableView user={user} classes={classes} teachers={teachers} />
    );
  } else if (effectiveModule === 'academic-exams') {
    content = <ExamsAndDateSheetsView user={user} />;
  } else if (effectiveModule === 'report-cards') {
    content = sharedLoading ? (
      <div className="space-y-6">
        <PageHeader title="Result Cards" subtitle="Drill into a department → part → class → section to view aggregated marks and download / print result cards." />
        <div className="rounded-xl border border-gray-200 bg-white p-5"><SkeletonTable rows={4} /></div>
      </div>
    ) : (
      <ReportCardsView user={user} classes={classes} students={students} teachers={teachers} exams={exams} />
    );
  } else {
    content = (
      <div className="space-y-6">
        <PageHeader title="Coming Soon" subtitle="This module is under development." />
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <EmptyState icon={BookOpen} title="Module in development" desc="This section will be available soon." />
        </div>
      </div>
    );
  }

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
