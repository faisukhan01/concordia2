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
  TrendingUp,
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
} from './shared/concordia-hierarchy';
import {
  SimpleBarChart,
  SimplePieChart,
  ChartCard,
} from './shared/concordia-charts';

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
    <div className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
          <div className="text-2xl font-bold text-gray-900 mt-1.5 truncate">{value}</div>
          {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
        </div>
        <Icon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
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
  }, [user?.branchId]);

  // ── Students-per-Program bar data — counts of students whose program
  // matches one of the canonical 6 departments.
  const studentsByProgram = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return DEPARTMENTS.map((d) => ({ label: d, value: map[d] }));
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
      <PageHeader title={`Welcome back, ${user?.name?.split(' ')[0] || 'Academic Coordinator'}`} subtitle="Manage teachers, timetables, tests and result cards." />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <SkeletonBox key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <StatCard icon={Users} label="Total Teachers" value={teachers.length} sub="active faculty" />
          <StatCard icon={GraduationCap} label="Total Students" value={students.length} sub="enrolled" />
          <StatCard icon={ClipboardList} label="Pending Results" value={results.length} sub="awaiting review" />
          <StatCard icon={Megaphone} label="Announcements" value={announcements.length} sub="published" />
        </motion.div>
      )}

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
  const [tab, setTab] = useState<'class' | 'teacher'>('class');

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
  const [teacherForm, setTeacherForm] = useState({ name: '', rollNo: '', email: '', password: '' });
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [created, setCreated] = useState<{ user: string; pass: string; name: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

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

  // ── Add-class single submit — passes program + part so the new class shows
  // up in the Timetable / Result Cards hierarchy drill-downs.
  const submitClass = async () => {
    if (!name.trim()) { toast({ title: 'Class name is required', variant: 'destructive' }); return; }
    setSavingClass(true);
    try {
      await api.createClass(name.trim(), section.trim() || 'A', user?.branchId, program, part);
      toast({ title: 'Class created', description: `${name.trim()} — Section ${section.trim() || 'A'} (${program} · Part ${part})` });
      setName(''); setSection('A');
      load();
    } catch (e: any) {
      toast({ title: 'Failed to create class', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setSavingClass(false); }
  };

  const bulkList = Array.from(new Set(
    bulkSections.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  ));
  const submitBulk = async () => {
    if (!name.trim()) { toast({ title: 'Class name is required', variant: 'destructive' }); return; }
    if (bulkList.length === 0) { toast({ title: 'Enter at least one section', variant: 'destructive' }); return; }
    setSavingClass(true);
    setBulkProgress({ current: 0, total: bulkList.length });
    const failures: string[] = [];
    const successes: string[] = [];
    for (let i = 0; i < bulkList.length; i++) {
      const sec = bulkList[i];
      setBulkProgress({ current: i + 1, total: bulkList.length });
      try {
        await api.createClass(name.trim(), sec, user?.branchId, program, part);
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
      const password = teacherForm.password || 'teacher' + Math.floor(1000 + Math.random() * 9000);
      await api.createPlatformUser({
        name: teacherForm.name,
        email: plannedEmail,
        rollNo: teacherForm.rollNo,
        password,
        role: 'teacher',
        branchId: user?.branchId,
        instituteId: user?.instituteId,
        title: 'Teacher',
      });
      setCreated({ user: teacherForm.rollNo, pass: password, name: teacherForm.name });
      setFormBlank();
      load();
      toast({ title: 'Teacher login created', description: `${teacherForm.name} — username ${teacherForm.rollNo}` });
    } catch (e: any) {
      toast({ title: 'Failed to create login', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally { setSavingTeacher(false); }
  };
  const setFormBlank = () => setTeacherForm({ name: '', rollNo: '', email: '', password: '' });

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
      await api.editUser(teacher.id, { classes: next });
      toast({ title: 'Teacher assigned', description: `${teacher.name} now teaches ${detailClass.name} — Section ${detailClass.section}` });
      setAssignTeacherId('');
      load();
    } catch (e: any) {
      toast({ title: 'Failed to assign teacher', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally { setAssignSaving(false); }
  };

  const removeTeacher = async (teacher: any) => {
    if (!detailClass || !teacher?.id) return;
    if (!confirm(`Remove ${teacher.name} from ${detailClass.name} — Section ${detailClass.section}?`)) return;
    const current = parseTeacherField(teacher.classes);
    const combinedDash = `${detailClass.name}-${detailClass.section}`;
    const combinedSpace = `${detailClass.name} ${detailClass.section}`;
    const next = current.filter((c) => c !== detailClass.name && c !== combinedDash && c !== combinedSpace);
    setRemovingTeacherId(teacher.id);
    try {
      await api.editUser(teacher.id, { classes: next });
      toast({ title: 'Teacher removed', description: `${teacher.name} unassigned from ${detailClass.name} — Section ${detailClass.section}` });
      load();
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
        title="Classes & Teachers"
        subtitle="Create class sections with program + part, add teacher logins, and assign teachers to classes."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={BookOpen} label="Total Sections" value={totalSections} sub={`${uniqueNames} unique class name(s)`} />
        <StatCard icon={GraduationCap} label="Total Students" value={students.length} sub="Across all classes" />
        <StatCard icon={Users} label="Total Teachers" value={teachers.length} sub="Active faculty" />
      </div>

      {/* Tab switcher — Add Class / Add Teacher */}
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          onClick={() => setTab('class')}
          className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-colors', tab === 'class' ? 'bg-[#F26522] text-white' : 'text-gray-600 hover:bg-gray-50')}
        >
          Add Class
        </button>
        <button
          onClick={() => setTab('teacher')}
          className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-colors', tab === 'teacher' ? 'bg-[#F26522] text-white' : 'text-gray-600 hover:bg-gray-50')}
        >
          Add Teacher
        </button>
      </div>

      {tab === 'class' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <SectionHeader title="New Class" desc="Pick a department + part so the class shows up in the Timetable & Result Cards hierarchy." />
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'bulk')}>
            <TabsList className="mb-4">
              <TabsTrigger value="single">Single Section</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Sections</TabsTrigger>
            </TabsList>

            {/* SINGLE MODE — now includes program + part */}
            <TabsContent value="single">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                <Field label="Class Name" required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Grade 10, Prep" />
                </Field>
                <Field label="Section">
                  <Input value={section} onChange={(e) => setSection(e.target.value)} className={inputCls} placeholder="A" maxLength={3} />
                </Field>
                <Field label="Department (Program)" required>
                  <Select value={program} onValueChange={setProgram}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Part">
                  <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
                </Field>
                <div className="md:col-span-2 flex justify-end">
                  <button onClick={submitClass} disabled={savingClass} className={cn(btnPrimary, 'h-10')}>
                    {savingClass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create Class
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3">
                Classes are tagged with <span className="font-semibold">{program}</span> · Part {part}. They will appear under this department in the Timetable and Result Cards drill-downs.
              </p>
            </TabsContent>

            {/* BULK MODE — also program + part */}
            <TabsContent value="bulk">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                <Field label="Class Name" required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Grade 10" />
                </Field>
                <Field label="Sections (comma-separated)" required>
                  <Input value={bulkSections} onChange={(e) => setBulkSections(e.target.value)} className={inputCls} placeholder="A, B, C, D" />
                </Field>
                <Field label="Department (Program)" required>
                  <Select value={program} onValueChange={setProgram}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Part">
                  <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
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

      {tab === 'teacher' && (
        <>
          {/* Add-teacher form (COPIED from accountant LoginsView Teacher tab) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 max-w-2xl">
            <SectionHeader
              title="New Teacher Login"
              desc="Credentials auto-generate if you leave email / password blank."
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <Input ref={nameRef} value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} className={inputCls} placeholder="Ayesha Khan" />
              </Field>
              <Field label="Teacher ID / Roll No" required>
                <Input value={teacherForm.rollNo} onChange={(e) => setTeacherForm({ ...teacherForm, rollNo: e.target.value })} className={inputCls} placeholder="T001" />
              </Field>
              <Field label="Email (optional)">
                <Input value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} className={inputCls} placeholder="auto-generated if blank" />
              </Field>
              <Field label="Password (optional)">
                <Input value={teacherForm.password} onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })} className={inputCls} placeholder="auto-generated if blank" />
                {pwLevel === 'empty' ? (
                  <p className="text-[11px] text-gray-500 mt-1.5">Will be auto-generated (e.g. teacher4827).</p>
                ) : (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="h-1 flex-1 rounded-full bg-gray-100 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', sm.bar)} style={{ width: sm.width }} />
                    </div>
                    <span className={cn('text-[11px] font-medium tabular-nums', sm.color)}>{sm.label}</span>
                  </div>
                )}
              </Field>
            </div>
            <div className="mt-5">
              <button onClick={submitTeacher} disabled={savingTeacher} className={btnPrimary}>
                {savingTeacher ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Generate Login
              </button>
            </div>
          </div>

          {/* Manage Existing Teachers list (COPIED from accountant) */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <SectionHeader
              title="Manage Existing Teachers"
              desc="Edit portal details or block / unblock any teacher in your branch."
              action={
                <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#F26522] font-medium disabled:opacity-60">
                  <Loader2 className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
                </button>
              }
            />
            <div className="relative mb-4">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input value={teachersSearch} onChange={(e) => setTeachersSearch(e.target.value)} placeholder="Search by name or Teacher ID…" className={cn(inputCls, 'pl-9')} />
            </div>
            {loading && teachers.length === 0 ? (
              <SkeletonTable rows={4} />
            ) : teachers.length === 0 ? (
              <EmptyState icon={Users} title="No teachers found" desc="Create a new teacher login above — it will appear here once created." />
            ) : filteredTeachers.length === 0 ? (
              <EmptyState icon={Search} title="No matching teachers" desc="Try a different search term." />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto concordia-scroll pr-1">
                {filteredTeachers.map((t) => {
                  const blocked = isBlocked(t);
                  return (
                    <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-lg border border-gray-200 bg-gray-50 grid place-items-center shrink-0">
                          <Users className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                            {blocked ? <BlockedBadge /> : (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                <Check className="h-3 w-3" /> Active
                              </span>
                            )}
                            {t.title ? <span className="text-[11px] text-gray-500">{t.title}</span> : null}
                          </div>
                          <p className="text-[11px] text-gray-500 truncate">
                            {t.rollNo || '—'}{t.email ? ` · ${t.email}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-8 px-3 text-xs font-medium" onClick={() => openEditTeacher(t)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        {blocked ? (
                          <Button size="sm" variant="outline" className="border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg h-8 px-3 text-xs font-medium" onClick={() => toggleTeacherBlock(t)} disabled={blockingTeacherId === t.id}>
                            {blockingTeacherId === t.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Lock className="h-3.5 w-3.5 mr-1" />} Unblock
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg h-8 px-3 text-xs font-medium" onClick={() => toggleTeacherBlock(t)} disabled={blockingTeacherId === t.id}>
                            {blockingTeacherId === t.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Lock className="h-3.5 w-3.5 mr-1" />} Block
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Class list (always visible below the tab forms) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader title="All Classes" desc={`${totalSections} section(s) in this campus`} />
        <div className="relative mb-4 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by class name or section…" className={cn(inputCls, 'pl-9 h-9')} />
        </div>
        {loading ? (
          <SkeletonTable rows={4} />
        ) : classes.length === 0 ? (
          <EmptyState icon={BookOpen} title="No classes yet" desc="Create your first class section using the Add Class tab above." />
        ) : filteredClasses.length === 0 ? (
          <EmptyState icon={Search} title="No matches" desc={`No classes match "${searchQuery}".`} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Class Name</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Section</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Department</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Part</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-center">Students</TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClasses.map((c) => {
                  const count = studentCount(c);
                  return (
                    <TableRow key={c.id} className="border-gray-100 hover:bg-gray-50">
                      <TableCell className="text-sm font-medium text-gray-900">{c.name}</TableCell>
                      <TableCell className="text-sm text-gray-700">{c.section}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.program || '—'}</TableCell>
                      <TableCell className="text-sm text-gray-600">{c.part ? `Part ${c.part}` : '—'}</TableCell>
                      <TableCell className="text-sm text-gray-700 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {count > 0 ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">Empty</span>
                          )}
                          <span className="tabular-nums">{count}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => { setDetailClass(c); setShowAllStudents(false); setAssignTeacherId(''); }} className="h-8 px-2 text-xs text-gray-600 hover:text-[#F26522] hover:bg-orange-50 rounded inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" /> View
                          </button>
                          <button onClick={() => setDeleteTarget(c)} className="h-8 px-2 text-xs text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded inline-flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" /> Delete
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
                    {clsTeachers.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                        <p className="text-xs text-gray-500 mb-1">No teachers assigned to this class yet.</p>
                        <p className="text-[11px] text-gray-400">Use the Assign Teacher control below to add one.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {clsTeachers.map((t) => {
                          const subs = parseTeacherField(t.subjects);
                          return (
                            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-100 px-3 py-2 hover:bg-gray-50">
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{t.name}</div>
                                <div className="text-[11px] text-gray-500 mt-0.5">
                                  {subs.length > 0 ? subs.join(', ') : 'No subjects assigned'}
                                  {t.rollNo ? ` • ${t.rollNo}` : ''}
                                </div>
                              </div>
                              <button onClick={() => removeTeacher(t)} disabled={removingTeacherId === t.id} className="shrink-0 h-7 px-2 text-[11px] font-medium text-gray-500 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 rounded inline-flex items-center gap-1 disabled:opacity-60">
                                {removingTeacherId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />} Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50/50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="h-3.5 w-3.5 text-[#F26522]" />
                        <span className="text-xs font-semibold text-gray-700">Assign Teacher</span>
                      </div>
                      {(() => {
                        const assignedIds = new Set(clsTeachers.map((t) => t.id));
                        const available = teachers.filter((t) => !assignedIds.has(t.id));
                        if (available.length === 0) return <p className="text-[11px] text-gray-500">All teachers in this branch are already assigned to this class.</p>;
                        return (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={assignTeacherId} onValueChange={setAssignTeacherId}>
                              <SelectTrigger className={cn(inputCls, 'h-9 flex-1')}><SelectValue placeholder="Select a teacher…" /></SelectTrigger>
                              <SelectContent>
                                {available.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}{t.rollNo ? ` • ${t.rollNo}` : ''}</SelectItem>))}
                              </SelectContent>
                            </Select>
                            <button onClick={assignTeacher} disabled={!assignTeacherId || assignSaving} className={cn(btnPrimary, 'h-9 shrink-0')}>
                              {assignSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Assign
                            </button>
                          </div>
                        );
                      })()}
                      <p className="text-[11px] text-gray-400 mt-2">Assigned teachers will see this class in their portal.</p>
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
            <button onClick={() => { setCreated(null); setTimeout(() => nameRef.current?.focus(), 200); }} className={cn(btnPrimary, 'w-full justify-center h-10')}>
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
  const [drill, setDrill] = useState<TimetableDrill>({ dept: null, part: '1', cls: null, section: null });
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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
    return classes.filter((c) => c.name === drill.cls!.name);
  }, [classes, drill.cls]);
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
    const teacher = teachers.find((t) => t.id === fTeacherId) || null;

    // Clash #1 — class slot taken
    const classClash = entries.find((e) => e.day === fDay && Number(e.period) === period);
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
          (e: any) => e.day === fDay && Number(e.period) === period,
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
            e.day === fDay && e.startTime && e.endTime && e.startTime < fEnd && e.endTime > fStart,
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
      toast({ title: 'Timetable entry saved', description: `${fDay} • Period ${period} • ${fSubject.trim()}` });
      resetForm();
      setShowForm(false);
      reloadEntries();
    } catch (e: any) {
      // Server-side clash message (already very specific — surface verbatim).
      toast({ title: '⚠ Clash detected', description: e?.message || 'Failed to save entry', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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
    if (secs.length > 1) setDrill({ ...drill, cls, section: null });
    else setDrill({ ...drill, cls, section: cls });
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
  } else if (hasMultipleSections && !drill.section) {
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
            <button onClick={() => setShowForm((s) => !s)} className={btnPrimary}>
              <Plus className="h-4 w-4" /> {showForm ? 'Cancel' : 'Add Entry'}
            </button>
          </div>

          {showForm && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-4 mb-4">
              <SectionHeader title="New Timetable Entry" desc="Pick a day + period. Clashes (class slot taken, teacher double-booked, or teacher time overlap) are caught before saving." />
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
                <Field label="Teacher">
                  <Select value={fTeacherId} onValueChange={setFTeacherId}>
                    <SelectTrigger className={cn(inputCls, 'h-10')}><SelectValue placeholder="Optional" /></SelectTrigger>
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
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save Entry
                  </button>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className={btnSecondary + ' h-10'}>Cancel</button>
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
                        <div key={e.id || i} className="relative rounded-lg border border-gray-200 bg-white p-3 pr-9 hover:border-gray-300 transition-colors">
                          <button onClick={() => removeEntry(e)} disabled={deletingId === e.id} aria-label="Delete entry" className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center text-gray-300 hover:text-rose-600 hover:bg-rose-50 rounded disabled:opacity-50">
                            {deletingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
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
  const [drill, setDrill] = useState<ReportDrill>({ dept: null, part: '1', cls: null, section: null });
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
    return classes.filter((c) => c.name === drill.cls!.name);
  }, [classes, drill.cls]);
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
    if (secs.length > 1) setDrill({ ...drill, cls, section: null });
    else setDrill({ ...drill, cls, section: cls });
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
  } else if (hasMultipleSections && !drill.section) {
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
  if (effectiveModule === 'academic-overview') {
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
