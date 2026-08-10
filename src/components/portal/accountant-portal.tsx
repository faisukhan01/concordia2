'use client';

// ============================================================================
// Concordia College — Accountant Portal (spec §3)
//
// Responsibilities:
//   1. View every student's data class-wise (read-only personal info)
//   2. Collect fee payments (cash / bank / wallet / card)
//   3. Generate student logins — username = roll number, default password.
//      Logins are issued AFTER the first fee payment is confirmed.
//   4. Generate + view fee challans (one per student per month)
//   5. Split the locked base fee into installments (sum must equal base fee)
//   6. Add miscellaneous charges (admission, registration, trip, exam, etc.)
//
// The base fee is set & LOCKED by the Admission Office — the Accountant can
// never change it. The Accountant only restructures HOW it is paid.
//
// Design language (matches admissions-portal Task 5b + admin-portal Task 5a):
//   • Flat, restrained, grayscale + a single orange (#F26522) accent.
//   • No gradient welcome banners, no decorative blobs, no colored icon
//     tiles, no glassmorphism, no framer-motion.
//   • White cards on 1px gray borders, rounded-xl.
//   • Tables: uppercase muted headers, hover row tint, subtle status
//     badges (bg tint + matching text — never saturated fills).
//   • Money amounts: text-gray-900 font-semibold (NEVER orange / green).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApp, useNavState } from '@/lib/store';
// Delegated Student Records (detail page → mark fee Paid + provide login).
import { AdmissionsPortal } from './admissions-portal';
import {
  DEPARTMENTS,
  DeptCardGrid,
  PartToggle,
  ClassCardGrid,
  SectionCardGrid,
  HierarchyBreadcrumb,
  deptLabel,
} from '@/components/portal/shared/concordia-hierarchy';
import {
  SimpleBarChart,
  SimplePieChart,
  ChartCard,
} from '@/components/portal/shared/concordia-charts';
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
import { toast } from '@/hooks/use-toast';
import {
  Receipt,
  CreditCard,
  DollarSign,
  Lock,
  KeyRound,
  ClipboardList,
  Users,
  Loader2,
  Search,
  Copy,
  Check,
  AlertCircle,
  TrendingUp,
  FileText,
  Plus,
  GraduationCap,
  CalendarDays,
  Hash,
  Info,
  CheckCircle2,
  Clock,
  Printer,
  ArrowLeft,
  Pencil,
  Unlock,
  ShieldAlert,
  Eye,
  EyeOff,
  Download,
  ChevronDown,
  ChevronRight,
  Wallet,
  Trash2,
  ShieldBan,
  AlertTriangle,
  Ban,
  Layers,
  Zap,
  PieChart,
} from 'lucide-react';
import { savePdf, printPdf } from '@/lib/pdf-utils';
import { buildConcordiaChallan, buildConcordiaChallanBook } from '@/lib/challan';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = { activeModule: string; user: any };

// ───────────────────────── Shared helpers ─────────────────────────

/** Clean page header: thin orange accent line, h1, muted subtitle.
 *  No gradients, no blobs, no decorative circles. */
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

/** Square KPI card: white bg, 1px gray border, rounded-2xl, prominent orange
 *  icon chip top-left, large value, label below. Clean white + orange theme. */
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

/** Clean section header: text-sm font-semibold + optional muted desc.
 *  NO orange vertical bar accent before the header. */
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

/** Restrained empty state: small muted icon + title + optional subtitle.
 *  NO big colored circles. */
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

/** Subtle status badge — bg tint + matching text, never saturated fills. */
function StatusBadge({ status }: { status?: string }) {
  const s = (status || 'Pending').toLowerCase();
  const cls =
    s === 'paid' || s === 'completed' || s === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : s === 'pending' || s === 'partial' || s === 'unpaid'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : s === 'overdue' || s === 'blocked' || s === 'inactive'
          ? 'bg-rose-50 text-rose-700 border-rose-100'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize',
        cls,
      )}
    >
      {status || 'Pending'}
    </span>
  );
}

/** Field wrapper: label above input, small asterisk for required fields. */
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
      <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
        {label}
        {required && <span className="text-[#F26522] ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span
        className={cn(
          'text-sm font-medium text-gray-900 text-right',
          mono && 'font-mono text-xs',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.clipboard?.writeText(text);
        } catch {}
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#F26522] font-medium"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Business-rule callout — base fee locked by Admissions. Gray, restrained. */
function LockedFeeCallout() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex gap-3">
      <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
      <div className="text-sm text-gray-600 leading-relaxed">
        <p className="font-semibold text-gray-900">Base fee is locked by the Admission Office.</p>
        <p className="mt-1">
          You can restructure payments (installments) and add miscellaneous charges, but{' '}
          <span className="font-medium text-gray-900">cannot alter the base amount itself</span>.
        </p>
      </div>
    </div>
  );
}

// Shared input className — keeps every input visually consistent.
const inputCls =
  'h-10 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12';

// Shared button class names — keeps every primary/secondary action consistent.
const btnPrimary =
  'bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-60';
const btnSecondary =
  'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium inline-flex items-center gap-1.5 transition-colors';

// Whether a user (student or teacher) is currently blocked. The backend
// returns `blocked` as 0/1 or as a boolean — accept both.
const isBlocked = (u: any) => u?.blocked === 1 || u?.blocked === true;

// Small "Blocked" pill — rose tint, matches StatusBadge styling.
function BlockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
      <ShieldAlert className="h-3 w-3" />
      Blocked
    </span>
  );
}

// ───────────────────────── Constants ─────────────────────────

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'JazzCash', 'EasyPaisa', 'Card'];
// Per user spec: show 2 fixed charge types + "Other" (customizable by admin).
const MISC_CHARGE_TYPES = ['Admission Fee', 'Exam Fee', 'Other'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CH_MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Challan dates + particulars for the installment at 0-based `index`, anchored
// on the plan's FIRST installment date (`baseIso`, its createdAt/dueDate).
//   • Each installment is a quarter: created = base + index*3 months.
//   • Due date = created + 5 days (Payable-on-or-before + Due Date on the challan).
//   • Particulars = that quarter's 3 months, e.g. "Aug Sep Oct Payable"
//     (Ins 1 → Aug Sep Oct, Ins 2 → Nov Dec Jan, Ins 3 → Feb Mar Apr).
function challanInstallmentDates(baseIso: string | undefined | null, index: number) {
  const parsed = baseIso ? new Date(baseIso) : new Date();
  const b = isNaN(parsed.getTime()) ? new Date() : parsed;
  const created = new Date(b.getFullYear(), b.getMonth() + index * 3, b.getDate());
  const due = new Date(created.getFullYear(), created.getMonth(), created.getDate() + 5);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB'); // dd/mm/yyyy
  const months = [0, 1, 2].map((k) => CH_MON_SHORT[(created.getMonth() + k) % 12]).join(' ');
  return { createdStr: fmt(created), dueStr: fmt(due), particulars: `${months} Payable` };
}

const fmtMoney = (n: number) => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const monthName = (m: string | number) => {
  const i = typeof m === 'number' ? m - 1 : MONTHS.findIndex((x) => x === m);
  return MONTHS[i] || String(m);
};

const genDefaultPassword = () =>
  'concordia' + Math.floor(1000 + Math.random() * 9000).toString();

// Whether a student already has a real login (not the admissions placeholder).
// The admissions portal creates the row with a placeholder `tmp-…` password and
// an `@pending.concordia.edu.pk` email — the accountant swaps them for the real
// credentials when generating the login.
const hasRealLogin = (s: any) => {
  if (!s) return false;
  if (s.email && !String(s.email).includes('@pending.')) return true;
  if (s.password && !String(s.password).startsWith('tmp-')) return true;
  return false;
};

// A student's overall fee status: Paid / Pending / Overdue, derived from
// their invoice list.
function deriveFeeStatus(invoices: any[]): 'Paid' | 'Pending' | 'Overdue' {
  if (!invoices || invoices.length === 0) return 'Pending';
  const unpaid = invoices.filter((i) => (i.status || '').toLowerCase() !== 'paid');
  if (unpaid.length === 0) return 'Paid';
  const overdue = unpaid.some((i) => (i.status || '').toLowerCase() === 'overdue');
  return overdue ? 'Overdue' : 'Pending';
}

// Total paid amount across a student's invoices
const sumPaid = (invoices: any[]) =>
  invoices.reduce((acc, i) => acc + Number(i.paidAmount || 0), 0);

// Total outstanding across a student's invoices
const sumOutstanding = (invoices: any[]) =>
  invoices.reduce(
    (acc, i) =>
      acc +
      ((i.status || '').toLowerCase() === 'paid'
        ? 0
        : Number(i.amount || 0) - Number(i.paidAmount || 0)),
    0,
  );

// ───────────────────────── Main router ─────────────────────────

// ═══════════════════════════════════════════════════════════════════════
// NEW ENROLLMENTS (Accountant)
//
// Students enrolled by the Admission Office arrive here (no login yet). The
// Accountant, per department:
//   1. assigns a Roll Number (typed; duplicate → "already exists")
//   2. assigns a Section
//   3. reviews/edits the fee installment plan and collects the FIRST payment:
//        • Rs 10,000 admission fee is folded into the FIRST of 3 installments
//        • the remaining fee is split into 3 equal installments
//        • everything is editable (supports partial payment)
//   4. once the first installment is paid, issues the login
//        (username = roll number, password = concordia1234)
// After the login is issued the student drops off this page and can sign in.
// ═══════════════════════════════════════════════════════════════════════
const DEFAULT_STUDENT_PASSWORD = 'concordia1234';
const ADMISSION_FEE = 10000;

// 10,000 admission fee folded into the first of 3 equal installments.
//   40,000 → [20,000, 10,000, 10,000] ; 55,000 → [25,000, 15,000, 15,000]
function computeInstallmentPlan(baseFee: number): number[] {
  const total = Math.max(0, Math.round(Number(baseFee) || 0));
  const fixed = Math.min(ADMISSION_FEE, total);
  const remaining = Math.max(0, total - fixed);
  const each = Math.round(remaining / 3);
  const firstThird = remaining - 2 * each; // keep the sum exact
  return [fixed + firstThird, each, each];
}

function ProcessEnrollmentCard({ student, allStudents, classes, invoices, user, onStudentUpdate, onRefresh, onClose }: any) {
  const setActiveModule = useApp((s) => s.setActiveModule);
  const setFeeFocusStudentId = useApp((s) => s.setFeeFocusStudentId);
  // Close the wizard and jump straight to Fee & Installments, pre-selecting
  // this exact student so the Accountant lands directly on their record.
  const goToFees = () => { setFeeFocusStudentId(student.id); onClose(); setActiveModule('accountant-challans'); };
  // Sections available for this student's program (Part 1) — created by the
  // Accountant on the Classes & Sections page.
  const sectionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of (classes || [])) {
      if ((c.program || '').trim() === (student.program || '').trim() && String(c.part || '1') === '1' && c.section) {
        set.add(String(c.section).toUpperCase());
      }
    }
    return Array.from(set).sort();
  }, [classes, student.program]);

  const [rollNo, setRollNo] = useState(student.rollNo && !String(student.rollNo).startsWith('TMP-') ? student.rollNo : '');
  const [section, setSection] = useState(sectionOptions.includes(String(student.section || '').toUpperCase()) ? String(student.section).toUpperCase() : (sectionOptions[0] || ''));
  const [wizStep, setWizStep] = useState<1 | 2 | 3>(1);
  const [savingPlacement, setSavingPlacement] = useState(false);
  const [amounts, setAmounts] = useState<number[]>(computeInstallmentPlan(student.baseFee));
  const [generating, setGenerating] = useState(false);
  const [payAmt, setPayAmt] = useState<string>('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ rollNo: string; password: string } | null>(null);
  const [creatingLogin, setCreatingLogin] = useState(false);

  const rollTrim = rollNo.trim();
  const rollTaken = !!rollTrim && allStudents.some(
    (s: any) => s.id !== student.id && String(s.rollNo || '').toLowerCase() === rollTrim.toLowerCase(),
  );
  const myInvoices = invoices
    .filter((inv: any) => inv.studentId === student.id && inv.type === 'Installment')
    .sort((a: any, b: any) => String(a.challanNo || '').localeCompare(String(b.challanNo || '')));
  const generated = myInvoices.length > 0;
  const firstInv = myInvoices[0];
  const firstPaid = !!firstInv && String(firstInv.status || '').toLowerCase() === 'paid';
  const hasLogin = hasRealLogin(student) || !!creds;
  const totalPlanned = amounts.reduce((s, a) => s + (Number(a) || 0), 0);

  const savePlacement = async () => {
    if (!rollTrim) { toast({ title: 'Enter a roll number', variant: 'destructive' }); return; }
    if (rollTaken) { toast({ title: 'Roll number already exists', description: 'Choose a different one.', variant: 'destructive' }); return; }
    const sec = section.trim().toUpperCase() || 'A';
    setSavingPlacement(true);
    try {
      // Ensure the (program, section) class row exists so the student shows in drill-downs.
      try { await api.createClass(student.program, sec, user?.branchId, student.program, student.part || '1'); } catch {}
      await api.editUser(student.id, { rollNo: rollTrim, section: sec, class: student.program, part: student.part || '1' });
      onStudentUpdate({ ...student, rollNo: rollTrim, section: sec, class: student.program });
      setWizStep(2);
      toast({ title: 'Roll number + section assigned', description: `${rollTrim} · Section ${sec}` });
    } catch (e: any) {
      toast({ title: 'Failed to assign', description: e?.message || 'Try again', variant: 'destructive' });
    } finally { setSavingPlacement(false); }
  };

  const generatePlan = async () => {
    const list = amounts.map((a) => Number(a) || 0).filter((a) => a > 0);
    if (list.length === 0) { toast({ title: 'Enter installment amounts', variant: 'destructive' }); return; }
    setGenerating(true);
    try {
      await api.createInstallments(student.id, list.map((a) => ({ amount: a, dueDate: '' })));
      toast({ title: 'Installment plan created', description: `${list.length} installments · ${fmtMoney(totalPlanned)}` });
      onRefresh();
    } catch (e: any) {
      toast({ title: 'Failed to create installments', description: e?.message, variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  const [challanBusy, setChallanBusy] = useState(false);
  const [challanReady, setChallanReady] = useState(false);

  // Build the first-installment fee challan for this student.
  const buildChallanDoc = async () => {
    const inv: any = myInvoices[0] || {};
    const total = myInvoices.length || 3;
    const within = Number(inv.amount) || totalPlanned;
    const others = myInvoices.slice(1);
    const arrearsSum = others.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    const dt = challanInstallmentDates(inv.createdAt || inv.dueDate, 0);
    return buildConcordiaChallan({
      studentId: student.rollNo || rollTrim,
      billNo: inv.challanNo || String(inv.id || '').slice(-6),
      studentName: student.name,
      fatherName: student.fatherName || student.guardian,
      className: deptLabel(student.program),
      section: student.section || section,
      feeIns: `1 of ${total}`,
      particulars: dt.particulars,
      items: [{ name: 'College Fee', amount: within }],
      payableWithin: within,
      payableAfter: within + Math.round(within * 0.05),
      dueDate: dt.dueStr,
      payableBefore: dt.dueStr,
      arrears: others.length ? `Ins:${others.length} Amount: ${arrearsSum}` : '',
    });
  };
  const downloadChallan = async () => {
    setChallanBusy(true);
    try { const doc = await buildChallanDoc(); savePdf(doc, `Challan-${student.rollNo || rollTrim}.pdf`); setChallanReady(true); }
    catch (e: any) { toast({ title: 'Could not build challan', description: e?.message, variant: 'destructive' }); }
    finally { setChallanBusy(false); }
  };
  const printChallan = async () => {
    setChallanBusy(true);
    try { const doc = await buildChallanDoc(); printPdf(doc); setChallanReady(true); }
    catch (e: any) { toast({ title: 'Could not build challan', description: e?.message, variant: 'destructive' }); }
    finally { setChallanBusy(false); }
  };

  const steps = [{ n: 1, label: 'Roll & Section' }, { n: 2, label: 'Fees & Challan' }] as const;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Process Enrollment — {student.name}</DialogTitle>
          <DialogDescription>
            {student.fatherName || student.guardian || '—'} · {deptLabel(student.program) || 'No program'} · Base fee {fmtMoney(Number(student.baseFee || 0))} · Part 1
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-1">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${wizStep >= s.n ? 'bg-[#F26522] text-white' : 'bg-gray-100 text-gray-400'}`}>
                {wizStep > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </div>
              <span className={`text-xs font-medium ${wizStep === s.n ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
              {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Roll number + Section ── */}
        {wizStep === 1 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Roll Number</label>
              <Input value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="e.g. 1024" className={`${inputCls} ${rollTaken ? 'border-red-400' : ''}`} />
              {rollTaken && <p className="text-[11px] text-red-500 mt-1">This roll number already exists.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Section (Part 1)</label>
              {sectionOptions.length === 0 ? (
                <p className="text-xs text-amber-600">No sections yet — create them on the <span className="font-semibold">Classes &amp; Sections</span> page first.</p>
              ) : (
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>{sectionOptions.map((s: string) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button onClick={savePlacement} disabled={savingPlacement || rollTaken || !rollTrim || !section} className="bg-[#F26522] hover:bg-[#D4541E] text-white">
                {savingPlacement ? <Loader2 className="h-4 w-4 animate-spin" /> : null}<span className="ml-1.5">Continue</span><ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Fee installments → generate challan (no login here) ── */}
        {wizStep === 2 && (
          <div className="space-y-3">
            {!generated ? (
              <>
                <p className="text-xs text-gray-500">Rs 10,000 admission fee is folded into installment 1. Edit any amount if needed.</p>
                <div className="grid grid-cols-3 gap-2">
                  {amounts.map((a, i) => (
                    <div key={i}>
                      <label className="block text-[11px] text-gray-500 mb-1">Installment {i + 1}{i === 0 ? ' (+adm.)' : ''}</label>
                      <Input type="number" value={a} onChange={(e) => setAmounts((prev) => prev.map((x, j) => j === i ? Number(e.target.value) : x))} className={inputCls} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">Total: <span className="font-semibold text-gray-800">{fmtMoney(totalPlanned)}</span></span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setWizStep(1)} className="h-9"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
                    <Button onClick={generatePlan} disabled={generating} className="bg-[#F26522] hover:bg-[#D4541E] text-white h-9">
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}<span className="ml-1.5">Create Plan</span>
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 space-y-1.5">
                  {myInvoices.map((inv: any, i: number) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Installment {i + 1}{i === 0 ? ' (incl. admission)' : ''}</span>
                      <span className="font-medium text-gray-800">{fmtMoney(Number(inv.amount))}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-1.5 border-t border-gray-200">
                    <span className="font-semibold text-gray-700">Total</span>
                    <span className="font-bold text-gray-900">{fmtMoney(myInvoices.reduce((s: number, i: any) => s + Number(i.amount || 0), 0))}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500">Generate the fee challan for the first installment and give it to the student. Payment collection + login happen later on the <span className="font-semibold">Fee &amp; Installments</span> page.</p>
                {challanReady && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Fee challan generated.</div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <Button variant="outline" onClick={printChallan} disabled={challanBusy} className="h-9"><Receipt className="h-4 w-4 mr-1.5" /> Print Challan</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={downloadChallan} disabled={challanBusy} className="h-9">{challanBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />} Download</Button>
                    <Button onClick={goToFees} className="bg-[#F26522] hover:bg-[#D4541E] text-white h-9">Done → Fee &amp; Installments <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewEnrollmentsView({ user, students, classes, invoices, loading, onRefresh, onStudentUpdate }: any) {
  const [dept, setDept] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // "New enrollments" = students the Admission Office added who are NOT yet
  // placed by the Accountant — they still carry a temporary roll number
  // (TMP-…) or none. Once the Accountant assigns the real roll number (step 1),
  // they move to the Fee & Installments page for payment + login. Part 1.
  const pending = useMemo(
    () => (students || []).filter((s: any) => {
      const r = String(s.rollNo || '').trim();
      return !r || r.toUpperCase().startsWith('TMP-');
    }),
    [students],
  );
  const refreshNow = () => { api.clearCache(); onRefresh(); };
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const removeEnrollment = async (s: any) => {
    if (typeof window !== 'undefined' &&
      !window.confirm(`Delete the enrollment for ${s.name}? This permanently removes the student record.`)) return;
    setDeletingId(s.id);
    try {
      await api.deleteUser(s.id);
      onStudentUpdate({ id: s.id, deleted: true });
      api.clearCache();
    } catch (e) {
      if (typeof window !== 'undefined') window.alert('Could not delete this enrollment. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };
  const countByDept = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of DEPARTMENTS) m[d] = 0;
    for (const s of pending) { const p = (s.program || '').trim(); if (m[p] != null) m[p] += 1; }
    return m;
  }, [pending]);
  const inDept = useMemo(() => pending.filter((s: any) => (s.program || '').trim() === dept), [pending, dept]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Enrollments"
        subtitle="Process students enrolled by the Admission Office — assign roll number + section, collect the first fee, and issue the login."
        action={
          <button onClick={refreshNow} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 text-sm font-medium">
            <Loader2 className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh
          </button>
        }
      />
      {!dept ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Select a department</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
          ) : (
            <DeptCardGrid onSelect={(d) => { setDept(d); setOpenId(null); }} studentCounts={countByDept} />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setDept(null); setOpenId(null); }} className="text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> All departments</button>
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            <span className="font-semibold text-gray-900">{deptLabel(dept)}</span>
          </div>
          {inDept.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">No new enrollments awaiting processing in {deptLabel(dept)}.</div>
          ) : (
            <div className="space-y-2">
              {inDept.map((s: any) => (
                <div key={s.id} className="flex items-stretch gap-2 rounded-xl border border-gray-200 bg-white hover:border-[#F26522]/40 hover:shadow-sm transition-all">
                  <button onClick={() => setOpenId(s.id)} className="flex-1 min-w-0 flex items-center justify-between gap-3 p-3 text-left">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.fatherName || s.guardian || '—'} · {deptLabel(s.program)} · Base fee {fmtMoney(Number(s.baseFee || 0))}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F26522] shrink-0">Process <ChevronRight className="h-3.5 w-3.5" /></span>
                  </button>
                  <button
                    onClick={() => removeEnrollment(s)}
                    disabled={deletingId === s.id}
                    title="Delete enrollment"
                    className="shrink-0 flex items-center justify-center px-3 border-l border-gray-100 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-r-xl transition-colors disabled:opacity-50"
                  >
                    {deletingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Processing wizard modal — rendered once, from the full student list so
          it persists through the "login created" step (the student leaves the
          pending list the moment the login is issued). */}
      {openId && (() => {
        const s = (students || []).find((x: any) => x.id === openId);
        return s ? (
          <ProcessEnrollmentCard student={s} allStudents={students} classes={classes} invoices={invoices} user={user} onStudentUpdate={onStudentUpdate} onRefresh={onRefresh} onClose={() => setOpenId(null)} />
        ) : null;
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CLASSES & SECTIONS (Accountant) — create/rename/delete the sections per
// program that students are assigned to during New Enrollments (Part 1).
// ═══════════════════════════════════════════════════════════════════════
function SectionChip({ row, onRename, onDelete }: {
  row: { id: string; section: string };
  onRename: (id: string, s: string) => Promise<void>;
  onDelete: (id: string, s: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.section);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const v = val.trim().toUpperCase();
    if (!v || v === row.section) { setEditing(false); setVal(row.section); return; }
    setBusy(true);
    try { await onRename(row.id, v); setEditing(false); } finally { setBusy(false); }
  };
  const del = async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete Section ${row.section}? Students in it will be unassigned.`)) return;
    setBusy(true);
    try { await onDelete(row.id, row.section); } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#F26522]/40 bg-white px-2 py-1.5 shadow-sm">
        <Input value={val} onChange={(e) => setVal(e.target.value)} maxLength={4} className={`${inputCls} h-8 w-20`} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <button onClick={save} disabled={busy} title="Save" className="text-emerald-600 hover:text-emerald-700 p-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
        <button onClick={() => { setEditing(false); setVal(row.section); }} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
      </div>
    );
  }
  return (
    <div className="group inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm hover:border-[#F26522]/40 hover:shadow transition-all">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26522]/10 text-[#F26522] text-sm font-bold">{row.section}</span>
      <span className="text-sm font-medium text-gray-800">Section {row.section}</span>
      <div className="flex items-center gap-0.5 ml-1 opacity-60 group-hover:opacity-100 transition-opacity">
        <button onClick={() => { setVal(row.section); setEditing(true); }} title="Rename" className="p-1 rounded-md text-gray-400 hover:text-[#F26522] hover:bg-[#F26522]/10"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={del} disabled={busy} title="Delete" className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
      </div>
    </div>
  );
}

function AccountantClassesView({ user, classes, loading, onRefresh }: any) {
  const [dept, setDept] = useState<string | null>(null);
  const [part, setPart] = useState<'1' | '2'>('1');
  const [newSection, setNewSection] = useState('');
  const [saving, setSaving] = useState(false);

  // Section rows (id + letter) for the selected program + part, deduped.
  const sectionRows = useMemo(() => {
    if (!dept) return [] as { id: string; section: string }[];
    const seen = new Set<string>();
    const out: { id: string; section: string }[] = [];
    for (const c of (classes || [])) {
      if ((c.program || '').trim() === dept && String(c.part || '1') === part && c.section) {
        const s = String(c.section).toUpperCase();
        if (!seen.has(s)) { seen.add(s); out.push({ id: c.id, section: s }); }
      }
    }
    return out.sort((a, b) => a.section.localeCompare(b.section));
  }, [classes, dept, part]);

  const addSection = async () => {
    const sec = newSection.trim().toUpperCase();
    if (!sec) { toast({ title: 'Enter a section letter', variant: 'destructive' }); return; }
    if (sectionRows.some((r) => r.section === sec)) { toast({ title: 'Section already exists', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await api.createClass(dept!, sec, user?.branchId, dept!, part);
      toast({ title: 'Section created', description: `${deptLabel(dept)} · Part ${part} · Section ${sec}` });
      setNewSection('');
      onRefresh();
    } catch (e: any) {
      toast({ title: 'Failed to create section', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const renameSection = async (id: string, s: string) => {
    try { await api.renameClassSection(id, s); toast({ title: 'Section renamed', description: `Section ${s}` }); onRefresh(); }
    catch (e: any) { toast({ title: 'Rename failed', description: e?.message, variant: 'destructive' }); }
  };
  const deleteSection = async (id: string, s: string) => {
    try { await api.deleteClassSection(id); toast({ title: 'Section deleted', description: `Section ${s}` }); onRefresh(); }
    catch (e: any) { toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' }); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Classes & Sections" subtitle="Create the sections for each program. Students are assigned to these sections during New Enrollments (new students are Part 1)." />
      {!dept ? (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Select a program</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
          ) : (
            <DeptCardGrid onSelect={(d) => setDept(d)} />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setDept(null)} className="text-gray-500 hover:text-gray-900 inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> All programs</button>
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            <span className="font-semibold text-gray-900">{deptLabel(dept)}</span>
          </div>
          <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sections in {deptLabel(dept)} · Part {part}</p>
            {sectionRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No sections yet — add one below.</div>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {sectionRows.map((r) => (
                  <SectionChip key={r.id} row={r} onRename={renameSection} onDelete={deleteSection} />
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 pt-3 border-t border-gray-100">
              <div className="w-40">
                <label className="block text-[11px] text-gray-500 mb-1">New section</label>
                <Input value={newSection} onChange={(e) => setNewSection(e.target.value)} maxLength={4} placeholder="A" className={inputCls} onKeyDown={(e) => { if (e.key === 'Enter') addSection(); }} />
              </div>
              <Button onClick={addSection} disabled={saving} className="bg-[#F26522] hover:bg-[#D4541E] text-white h-10">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}<span className="ml-1.5">Add Section</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AccountantPortal({ activeModule, user }: Props) {
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wire the global module-switcher from the zustand store so the Overview
  // quick-action cards can deep-link into the Fee & Installments page.
  const setActiveModule = useApp((s) => s.setActiveModule);

  // Initial + branch-change load. The effect body performs NO synchronous
  // setState — all state updates happen inside async promise callbacks.
  // `loading` starts true (useState initial), so we don't need to flip it
  // here on branch changes — the previous data stays visible until the new
  // data arrives, which keeps the UI smooth.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.platformUsers({ role: 'student', branchId: user?.branchId }).catch(() => []),
      api.getClasses(user?.branchId).catch(() => []),
      api.getBranchInvoices().catch(() => []),
    ]).then(([s, c, inv]) => {
      if (cancelled) return;
      setStudents(Array.isArray(s) ? s : []);
      setClasses(Array.isArray(c) ? c : []);
      setInvoices(Array.isArray(inv) ? inv : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.branchId]);

  // Manual refresh (button clicks) may synchronously flip loading=true.
  const refresh = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.platformUsers({ role: 'student', branchId: user?.branchId }).catch(() => []),
      api.getClasses(user?.branchId).catch(() => []),
      api.getBranchInvoices().catch(() => []),
    ])
      .then(([s, c, inv]) => {
        setStudents(Array.isArray(s) ? s : []);
        setClasses(Array.isArray(c) ? c : []);
        setInvoices(Array.isArray(inv) ? inv : []);
      })
      .catch((e) => setError(e?.message || 'Failed to load data'))
      .finally(() => setLoading(false));
  };

  // Optimistic local upsert — keeps the UI responsive while the backend
  // catches up. When called with `{ id, deleted: true }` (from the
  // manage-access popup's Delete action), the row is dropped instead.
  const upsertStudent = (s: any) =>
    setStudents((prev) => {
      if (s && s.deleted === true) {
        return prev.filter((x) => x.id !== s.id);
      }
      const idx = prev.findIndex((x) => x.id === s.id);
      if (idx === -1) return [s, ...prev];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...s };
      return copy;
    });

  const upsertInvoice = (inv: any) =>
    setInvoices((prev) => {
      const idx = prev.findIndex((x) => x.id === inv.id);
      if (idx === -1) return [inv, ...prev];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...inv };
      return copy;
    });

  let content: React.ReactNode;
  // Delegated Student Records (namespaced `admissions:…`) so the Accountant can
  // open a student's detail page and mark fee Paid + provide the login.
  if (activeModule && activeModule.includes(':')) {
    const [, modId] = activeModule.split(':', 2);
    content = <AdmissionsPortal activeModule={modId || ''} user={user} />;
  } else if (activeModule === 'accountant-classes') {
    content = (
      <AccountantClassesView user={user} classes={classes} loading={loading} onRefresh={refresh} />
    );
  } else if (activeModule === 'accountant-new') {
    content = (
      <NewEnrollmentsView
        user={user}
        students={students}
        classes={classes}
        invoices={invoices}
        loading={loading}
        onRefresh={refresh}
        onStudentUpdate={upsertStudent}
      />
    );
  } else if (
    activeModule === 'accountant-challans' ||
    activeModule === 'accountant-collect' ||
    activeModule === 'accountant-installments'
  )
    content = (
      <FeeInstallmentsView
        user={user}
        students={students}
        classes={classes}
        invoices={invoices}
        loading={loading}
        onRefresh={refresh}
        onInvoiceUpdate={upsertInvoice}
        onStudentUpdate={upsertStudent}
      />
    );
  else if (activeModule === 'accountant-misc')
    content = (
      <MiscChargesView
        user={user}
        students={students}
        classes={classes}
        loading={loading}
      />
    );
  else if (activeModule === 'accountant-logins')
    content = (
      <LoginsView user={user} students={students} loading={loading} onUpdate={upsertStudent} />
    );
  else
    content = (
      <OverviewView
        user={user}
        students={students}
        invoices={invoices}
        loading={loading}
        onNavigate={(moduleId) => setActiveModule(moduleId)}
      />
    );

  return <div className="animate-in fade-in-0 duration-200">{content}</div>;
}

// ───────────────────────── 1. Overview / Dashboard ─────────────────────────

function OverviewView({
  user,
  students,
  invoices,
  loading,
  onNavigate,
}: {
  user: any;
  students: any[];
  invoices: any[];
  loading: boolean;
  onNavigate: (moduleId: string) => void;
}) {
  const firstName = (user?.name || 'Accountant').split(' ')[0];

  // KPIs derived from invoices + students
  const overdue = useMemo(
    () => invoices.filter((i) => (i.status || '').toLowerCase() === 'overdue').length,
    [invoices],
  );
  const withLogin = useMemo(() => students.filter(hasRealLogin).length, [students]);

  // Recent payments — newest paid invoices first, top 8
  const recentPayments = useMemo(
    () =>
      invoices
        .filter((i) => (i.status || '').toLowerCase() === 'paid')
        .sort((a, b) => (b.paidAt || b.updatedAt || '').localeCompare(a.paidAt || a.updatedAt || ''))
        .slice(0, 5),
    [invoices],
  );

  // Monthly collection — last 6 months (drives the SimpleBarChart).
  const monthlyData = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const total = invoices
        .filter((inv) => {
          if ((inv.status || '').toLowerCase() !== 'paid') return false;
          const pd = inv.paidAt ? new Date(inv.paidAt) : null;
          return !!pd && pd.getMonth() === m && pd.getFullYear() === y;
        })
        .reduce((acc, inv) => acc + Number(inv.paidAmount || inv.amount || 0), 0);
      buckets.push({
        label: d.toLocaleString('en-US', { month: 'short' }),
        value: total,
      });
    }
    return buckets;
  }, [invoices]);

  // Fee-status distribution (Paid / Pending / Overdue) for the pie chart.
  const feeStatusData = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let over = 0;
    for (const i of invoices) {
      const s = (i.status || '').toLowerCase();
      if (s === 'paid') paid += 1;
      else if (s === 'overdue') over += 1;
      else pending += 1;
    }
    return [
      { label: 'Paid', value: paid },
      { label: 'Pending', value: pending },
      { label: 'Overdue', value: over },
    ];
  }, [invoices]);

  // Students-per-program — counts of students whose `program` matches one
  // of the canonical 6 Concordia departments (matches the Academic portal).
  const studentsByProgram = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return DEPARTMENTS.map((d) => ({ label: deptLabel(d), value: map[d] }));
  }, [students]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Fee collection, challans, and student logins — all in one place."
      />

      {/* KPI cards — 2 stats + 2 quick-actions, in a 4-col responsive grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[88px] sm:h-[104px] rounded-xl" />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          <StatCard
            icon={AlertCircle}
            label="Overdue"
            value={overdue}
            sub="Unpaid invoices past due"
          />
          <StatCard
            icon={KeyRound}
            label="Students with Login"
            value={withLogin}
            sub={`of ${students.length} enrolled`}
          />
          {/* Quick-action card — amber/orange accent so it reads as an action */}
          <button
            type="button"
            onClick={() => onNavigate('accountant-challans')}
            className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  Quick Action
                </div>
                <div className="text-base font-bold text-gray-900 mt-1.5">
                  Add New Installment
                </div>
                <div className="text-xs text-amber-700/80 mt-1">
                  Split a student&apos;s locked fee into a payment plan
                </div>
              </div>
              <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
                <Plus className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('accountant-challans')}
            className="group rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition-all hover:shadow-md hover:border-amber-300 hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  Quick Action
                </div>
                <div className="text-base font-bold text-gray-900 mt-1.5">
                  Check Installments
                </div>
                <div className="text-xs text-amber-700/80 mt-1">
                  Review paid / outstanding balances per student
                </div>
              </div>
              <div className="h-9 w-9 rounded-lg bg-amber-100 grid place-items-center shrink-0 group-hover:bg-[#F26522] transition-colors">
                <Receipt className="h-4 w-4 text-amber-700 group-hover:text-white transition-colors" />
              </div>
            </div>
          </button>
        </motion.div>
      )}

      {/* Analytics charts — monthly collection (2/3 width) + fee-status pie (1/3 width) */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.05 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <ChartCard
          title="Monthly Collection"
          subtitle="Total fee collected — last 6 months"
          className="lg:col-span-2"
        >
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : monthlyData.every((m) => m.value === 0) ? (
            <EmptyState
              icon={TrendingUp}
              title="No collections yet"
              desc="Record your first payment from the Fee & Installments page to see the trend here."
            />
          ) : (
            <SimpleBarChart
              data={monthlyData}
              height={260}
              yLabel="Rs"
              formatValue={(v) => fmtMoney(v)}
            />
          )}
        </ChartCard>
        <ChartCard
          title="Fee Status Distribution"
          subtitle="Across all invoices"
        >
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : feeStatusData.every((d) => d.value === 0) ? (
            <EmptyState
              icon={PieChart}
              title="No invoices yet"
              desc="Generate monthly challans from the Fee & Installments page."
            />
          ) : (
            <SimplePieChart data={feeStatusData} height={260} donut />
          )}
        </ChartCard>
      </motion.div>

      {/* Students-per-program chart — matches the Academic portal overview */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
      >
        <ChartCard
          title="Students per Program"
          subtitle="Enrollment across the 6 Concordia departments"
        >
          {loading ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : students.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No enrollment data yet"
              desc="Students will appear here once the Admissions Office enrolls them."
            />
          ) : (
            <SimpleBarChart
              data={studentsByProgram}
              height={240}
              yLabel="Students"
              formatValue={(v) => `${v} student${v === 1 ? '' : 's'}`}
            />
          )}
        </ChartCard>
      </motion.div>

      {/* Fee Status Summary */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.12 }}
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <SectionHeader
          title="Fee Status Summary"
          desc="Breakdown of all invoices by payment status"
        />
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : feeStatusData.every((d) => d.value === 0) ? (
          <EmptyState
            icon={PieChart}
            title="No invoices yet"
            desc="Generate monthly challans from the Fee & Installments page."
          />
        ) : (
          <div className="space-y-4">
            {(() => {
              const total = feeStatusData.reduce((s, d) => s + d.value, 0);
              const statusConfig: Record<string, { bg: string; bar: string; text: string; icon: any }> = {
                Paid: { bg: 'bg-emerald-50', bar: 'bg-emerald-500', text: 'text-emerald-700', icon: CheckCircle2 },
                Pending: { bg: 'bg-amber-50', bar: 'bg-amber-500', text: 'text-amber-700', icon: Clock },
                Overdue: { bg: 'bg-red-50', bar: 'bg-red-500', text: 'text-red-700', icon: AlertCircle },
              };
              return feeStatusData.map((d) => {
                const cfg = statusConfig[d.label] || statusConfig.Pending;
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.label} className="flex items-center gap-4">
                    <div className={`h-9 w-9 rounded-lg ${cfg.bg} grid place-items-center shrink-0`}>
                      <cfg.icon className={`h-4 w-4 ${cfg.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{d.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{d.value} <span className="text-xs text-gray-500 font-normal">({pct}%)</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${cfg.bar} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </motion.div>

      {/* Recent payments table */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeader
          title="Recent Payments"
          desc="Latest fee collections"
          action={
            <span className="text-[11px] text-gray-400">{recentPayments.length} shown</span>
          }
        />
        {loading ? (
          <SkeletonTable rows={5} />
        ) : recentPayments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No payments recorded yet"
            desc="Use Collect Payment to record a student's first fee payment."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200 hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Student
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Period
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Method
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Date
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-center">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((p) => (
                  <TableRow key={p.id} className="border-gray-100 hover:bg-gray-50">
                    <TableCell className="text-sm font-medium text-gray-900">
                      {p.studentName || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">
                      {p.month ? monthName(p.month) : '—'}
                      {p.year ? ` ${p.year}` : ''}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-gray-900 text-right tabular-nums">
                      {fmtMoney(Number(p.paidAmount || p.amount || 0))}
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">
                      {p.paymentMethod || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(p.paidAt || p.updatedAt || p.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={p.status} />
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

// ───────────────────────── 3. Fee & Installments (merged) ─────────────────────────
//
// One unified page that replaces the old Collect Payment + Fee Challans +
// Installments pages. The accountant can:
//   1. Pick a student whose base fee has been locked by the Admission Office
//   2. Split the locked base fee into 3-5 installments (creates invoice rows)
//   3. Mark any installment / monthly invoice as Paid
//   4. Download a print-ready challan as a PDF (jsPDF)
//   5. Bulk-generate monthly tuition challans for the whole branch

type InstallmentRow = { id: string; amount: string; due: string };

function FeeInstallmentsView({
  user,
  students,
  classes,
  invoices,
  loading,
  onRefresh,
  onInvoiceUpdate,
  onStudentUpdate,
}: {
  user: any;
  students: any[];
  classes: any[];
  invoices: any[];
  loading: boolean;
  onRefresh: () => void;
  onInvoiceUpdate: (inv: any) => void;
  onStudentUpdate: (s: any) => void;
}) {
  type FeeDrill = {
    dept: string | null;
    part: string;
    cls: { id: string; name: string; section: string } | null;
    section: { id: string; name: string; section: string } | null;
  };

  const feeFocusStudentId = useApp((s) => s.feeFocusStudentId);
  const setFeeFocusStudentId = useApp((s) => s.setFeeFocusStudentId);

  const [search, setSearch] = useState('');
  const [drill, setDrill] = useNavState<FeeDrill>('accountant-challans', {
    dept: null,
    part: '1',
    cls: null,
    section: null,
  });
  const [selected, setSelected] = useState<any | null>(null);
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [generatedLogin, setGeneratedLogin] = useState<{ rollNo: string; password: string } | null>(null);
  const [generatingMonthly, setGeneratingMonthly] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [sectionPdfDownloading, setSectionPdfDownloading] = useState(false);
  // Bulk-export installment picker: which export (zip/pdf) is being configured.
  const [bulkPick, setBulkPick] = useState<{ open: boolean; mode: 'zip' | 'pdf' }>({ open: false, mode: 'zip' });
  const [editingInstallment, setEditingInstallment] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [manualPlanMode, setManualPlanMode] = useState(false);

  // Delete student function
  const deleteStudent = async () => {
    if (!selected) return;
    setDeletingStudent(true);
    try {
      await api.deleteUser(selected.id);
      onStudentUpdate({ id: selected.id, deleted: true });
      setSelected(null); // Clear selection
      setDeleteDialogOpen(false);
      toast({ title: 'Student deleted', description: `${selected.name} has been removed from the system.` });
      api.clearCache();
    } catch (e: any) {
      toast({ 
        title: 'Delete failed', 
        description: e?.message || 'Could not delete student. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setDeletingStudent(false);
    }
  };

  // Bulk download all challans for section
  // ZIP export — one PDF per student. `installmentIndex` (0-based) targets a
  // single installment; omit for each student's next-due installment.
  const downloadAllChallans = async (installmentIndex?: number) => {
    if (!displayedStudents?.length) return;

    setBulkDownloading(true);
    try {
      const zip = new JSZip();
      const section = drill.section || drill.cls;
      const insLabel = installmentIndex != null ? `Installment${installmentIndex + 1}` : 'NextDue';
      const sectionName = `${drill.cls?.name}-Part${drill.part}-Section${section?.section}-${insLabel}`;
      let count = 0;

      for (const student of displayedStudents) {
        try {
          const built = buildChallanDataForStudent(student, installmentIndex);
          if (!built) continue; // student has no such installment
          const doc = await buildConcordiaChallan(built.data);
          const pdfBlob = doc.output('blob');
          const fileName = `${student.rollNo || student.name.replace(/[^a-zA-Z0-9]/g, '_')}_Installment_${built.instNum}.pdf`;
          zip.file(fileName, pdfBlob);
          count += 1;
        } catch (error) {
          console.error(`Failed to generate challan for ${student.name}:`, error);
        }
      }

      if (count === 0) {
        toast({ title: 'Nothing to download', description: 'No matching installment challans for this section.', variant: 'destructive' });
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sectionName}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: 'Challans downloaded', description: `ZIP with ${count} challan${count === 1 ? '' : 's'} created.` });
    } catch (error: any) {
      toast({
        title: 'Bulk download failed',
        description: error?.message || 'Could not generate ZIP file. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBulkDownloading(false);
    }
  };

  // Build the ChallanData for a student's next-due installment (shared by the
  // ZIP export and the combined-PDF export). Returns null when nothing is due.
  // Build a student's challan data. `installmentIndex` (0-based) targets a
  // SPECIFIC installment (e.g. only Installment 2); when omitted, the next
  // unpaid installment is used. Returns null when that installment doesn't
  // exist. `instNum` is the 1-based number for filenames.
  const buildChallanDataForStudent = (student: any, installmentIndex?: number) => {
    const studentInvoices = invoices.filter((inv) =>
      (inv.studentId === student.id || inv.userId === student.id) &&
      inv.type === 'Installment'
    ).sort((a, b) =>
      (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) ||
      String(a.challanNo || '').localeCompare(String(b.challanNo || ''))
    );
    if (studentInvoices.length === 0) return null;
    let target: any;
    let idx: number;
    if (installmentIndex != null) {
      if (installmentIndex >= studentInvoices.length) return null;
      idx = installmentIndex;
      target = studentInvoices[idx];
    } else {
      target = studentInvoices.find(inv => (inv.status || '').toLowerCase() !== 'paid');
      if (!target) return null;
      idx = studentInvoices.findIndex(inv => inv.id === target.id);
    }
    const totalInstallments = studentInvoices.length;
    const paidCount = studentInvoices.filter(inv => (inv.status || '').toLowerCase() === 'paid').length;
    const within = Number(target.amount || 0);
    const after = within + Math.round(within * 0.05);
    const dt = challanInstallmentDates(studentInvoices[0]?.createdAt || target.createdAt, idx);
    const data = {
      studentId: student.rollNo || student.id,
      billNo: target.challanNo || String(target.id || '').slice(-6),
      studentName: student.name,
      fatherName: student.fatherName || student.guardian,
      className: student.class || drill.cls?.name,
      section: student.section || (drill.section || drill.cls)?.section,
      feeIns: `${idx + 1} of ${totalInstallments}`,
      particulars: dt.particulars,
      items: [{ name: 'College Fee', amount: within }],
      payableWithin: within,
      payableAfter: after,
      dueDate: dt.dueStr,
      payableBefore: dt.dueStr,
      arrears: paidCount > 0 ? `Paid: ${paidCount} installments` : '',
    };
    return { data, instNum: idx + 1 };
  };

  // Download the WHOLE section's challans as ONE multi-page PDF (one page per
  // student) — ready to print in a single job, no unzipping. `installmentIndex`
  // targets one installment (0-based); omit for each student's next-due.
  const downloadSectionSinglePdf = async (installmentIndex?: number) => {
    if (!displayedStudents?.length) return;
    setSectionPdfDownloading(true);
    try {
      const section = drill.section || drill.cls;
      const insLabel = installmentIndex != null ? `Installment${installmentIndex + 1}` : 'NextDue';
      const sectionName = `${drill.cls?.name}-Part${drill.part}-Section${section?.section}-${insLabel}`;
      const list = displayedStudents
        .map((s) => buildChallanDataForStudent(s, installmentIndex))
        .filter(Boolean)
        .map((r) => (r as any).data);
      if (list.length === 0) {
        toast({ title: 'Nothing to print', description: 'No matching installment challans for this section.', variant: 'destructive' });
        return;
      }
      const doc = await buildConcordiaChallanBook(list);
      doc.save(`${sectionName}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast({ title: 'Section challans ready', description: `${list.length} challans in one PDF — ready to print.` });
    } catch (error: any) {
      toast({ title: 'Could not build PDF', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSectionPdfDownloading(false);
    }
  };

  // Run the chosen bulk export for the picked installment (undefined = next due).
  const runBulkExport = (installmentIndex?: number) => {
    const mode = bulkPick.mode;
    setBulkPick({ open: false, mode });
    if (mode === 'pdf') downloadSectionSinglePdf(installmentIndex);
    else downloadAllChallans(installmentIndex);
  };

  // Start editing an installment
  const startEditInstallment = (inv: any) => {
    setEditingInstallment(inv.id);
    setEditAmount(String(inv.amount || ''));
  };

  // Cancel editing
  const cancelEditInstallment = () => {
    setEditingInstallment(null);
    setEditAmount('');
  };

  // Save edited installment amount with auto-recalculation
  const saveEditInstallment = async (inv: any) => {
    if (!selected || !editAmount) return;
    
    const newAmount = Number(editAmount);
    if (newAmount <= 0) {
      toast({ title: 'Invalid amount', description: 'Amount must be greater than 0', variant: 'destructive' });
      return;
    }

    try {
      // Get all unpaid installments for this student
      const unpaidInstallments = studentInvoices.filter(i => 
        i.type === 'Installment' && (i.status || '').toLowerCase() !== 'paid'
      );
      
      const currentInstallment = unpaidInstallments.find(i => i.id === inv.id);
      if (!currentInstallment) return;
      
      // Calculate difference
      const oldAmount = Number(currentInstallment.amount || 0);
      const difference = oldAmount - newAmount;
      
      // Update current installment
      await api.editInstallment(inv.id, { amount: newAmount });
      
      // If there's a difference, redistribute to other unpaid installments
      if (difference !== 0 && unpaidInstallments.length > 1) {
        const otherInstallments = unpaidInstallments.filter(i => i.id !== inv.id);
        const redistributeAmount = difference / otherInstallments.length;
        
        for (const other of otherInstallments) {
          const newOtherAmount = Number(other.amount || 0) + redistributeAmount;
          if (newOtherAmount > 0) {
            await api.editInstallment(other.id, { amount: Math.round(newOtherAmount) });
          }
        }
      }
      
      // Update UI
      onInvoiceUpdate({ ...inv, amount: newAmount });
      cancelEditInstallment();
      onRefresh(); // Refresh to get updated amounts
      
      toast({ 
        title: 'Installment updated', 
        description: `Amount changed to ${fmtMoney(newAmount)}${difference !== 0 ? ' and remaining balance redistributed' : ''}` 
      });
      
    } catch (error: any) {
      toast({ 
        title: 'Update failed', 
        description: error?.message || 'Could not update installment', 
        variant: 'destructive' 
      });
    }
  };

  // Enable manual plan mode with 4 empty installments
  const startManualPlan = () => {
    setManualPlanMode(true);
    const today = new Date();
    const emptyRows = Array.from({ length: 4 }, (_, i) => {
      const dueDate = new Date(today);
      dueDate.setMonth(today.getMonth() + i + 1); // Due monthly
      return {
        id: `manual-${i}`,
        amount: '',
        due: dueDate.toISOString().slice(0, 10),
      };
    });
    setRows(emptyRows);
    setPlanError(null);
  };

  // Add another manual installment (max 5 total)
  const addManualInstallment = () => {
    if (rows.length >= 5) return;
    const lastRow = rows[rows.length - 1];
    const lastDate = new Date(lastRow?.due || new Date());
    const nextDate = new Date(lastDate);
    nextDate.setMonth(lastDate.getMonth() + 1);
    
    setRows([...rows, {
      id: `manual-${Date.now()}`,
      amount: '',
      due: nextDate.toISOString().slice(0, 10),
    }]);
  };

  // Cancel manual plan mode
  const cancelManualPlan = () => {
    setManualPlanMode(false);
    setRows([]);
    setPlanError(null);
  };

  // Students with a locked base fee are the primary audience for this page.
  // Fee & Installments works on PLACED students only — those the Accountant
  // has assigned a real roll number + section in New Enrollments (temp "TMP-…"
  // rolls are still pending placement and belong on the New Enrollments page).
  const lockedStudents = useMemo(
    () => students.filter((s) => {
      const r = String(s.rollNo || '').trim();
      return r && !r.toUpperCase().startsWith('TMP-') && (s.section != null && s.section !== '');
    }),
    [students],
  );

  // Per-department counts of locked-fee students (drives the DeptCardGrid).
  const studentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of lockedStudents) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return map;
  }, [lockedStudents]);

  // ── Hierarchy memos ──
  const classesInDept = useMemo(() => {
    if (!drill.dept) return [];
    return classes.filter(
      (c) => (c.program || '').trim() === drill.dept && String(c.part || '') === drill.part,
    );
  }, [classes, drill.dept, drill.part]);

  const sectionsOfClass = useMemo(() => {
    if (!drill.cls) return [];
    // Sections belong to a specific Part — never merge Part 1 and Part 2
    // sections of the same class (e.g. MB/MG in Part 1 vs MK/MQ in Part 2).
    return classes.filter(
      (c) => c.name === drill.cls!.name && String(c.part || '1') === String(drill.part || '1'),
    );
  }, [classes, drill.cls, drill.part]);
  const hasMultipleSections = sectionsOfClass.length > 1;

  const activeClassId = drill.section?.id || drill.cls?.id || '';
  const activeClassObj = classes.find((c) => c.id === activeClassId) || null;

  const isSearching = search.trim().length > 0;

  // ── Student list shown in the picker — flat search OR drilled class+section.
  const displayedStudents = useMemo(() => {
    if (isSearching) {
      const q = search.trim().toLowerCase();
      return lockedStudents.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.rollNo?.toLowerCase().includes(q) ||
          s.class?.toLowerCase().includes(q),
      );
    }
    if (!activeClassObj) return [];
    // Scope by Department (class name) + Part + Section — identical section
    // letters across programs/parts must never bleed together.
    const wantPart = String(activeClassObj.part || '1');
    return lockedStudents.filter(
      (s) =>
        (s.class || s.program || '') === activeClassObj.name &&
        (s.section || '') === activeClassObj.section &&
        String(s.part || '1') === wantPart,
    );
  }, [lockedStudents, search, activeClassObj, isSearching]);

  // Largest installment count across the section — drives the picker options.
  const maxInstallmentsInSection = useMemo(() => {
    let max = 0;
    for (const s of displayedStudents) {
      const n = invoices.filter((i) => (i.studentId === s.id || i.userId === s.id) && i.type === 'Installment').length;
      if (n > max) max = n;
    }
    return max;
  }, [displayedStudents, invoices]);

  // Helper: count locked-fee students for a given class id (for the card grids).
  const getLockedCountForClass = (clsId: string) => {
    const c = classes.find((x) => x.id === clsId);
    if (!c) return 0;
    const cPart = String(c.part || '1');
    return lockedStudents.filter(
      (s) =>
        (s.class || s.program || '') === c.name &&
        (s.section || '') === c.section &&
        String(s.part || '1') === cPart,
    ).length;
  };

  // Reset the selected student + plan builder whenever the user navigates
  // to a new section or toggles between hierarchy / search modes — the
  // detail panel should never show a stale student.
  useEffect(() => {
    setSelected(null);
    setRows([]);
    setPlanError(null);
    setGeneratedLogin(null);
  }, [activeClassId, isSearching]);

  // ── feeFocusStudentId: jump directly to a student coming from New Enrollments.
  // When the Accountant clicks "Done → Fee & Installments" in the wizard, the
  // store holds the just-processed student's id. On mount (or whenever
  // lockedStudents becomes available), find that student, switch to search mode
  // so they appear in the list, and select them immediately. Then clear the
  // store value so a subsequent manual visit to this page starts fresh.
  useEffect(() => {
    if (!feeFocusStudentId) return;
    const target = lockedStudents.find((s) => s.id === feeFocusStudentId);
    if (!target) return; // not yet in lockedStudents — wait for next render
    // Use search mode: type the student's name so they appear in displayedStudents.
    setSearch(target.name || target.rollNo || '');
    setSelected(target);
    setRows([]);
    setPlanError(null);
    setGeneratedLogin(null);
    // Consume and clear — next visit starts from the hierarchy picker.
    setFeeFocusStudentId(null);
  }, [feeFocusStudentId, lockedStudents, setFeeFocusStudentId]);

  // All invoices for the selected student
  const studentInvoices = useMemo(() => {
    if (!selected) return [];
    return invoices
      .filter((i) => i.studentId === selected.id || i.userId === selected.id)
      .sort((a, b) => {
        // Installments first (by dueDate), then monthly (by year/month desc)
        const aType = (a.type || '').toLowerCase() === 'installment' ? 0 : 1;
        const bType = (b.type || '').toLowerCase() === 'installment' ? 0 : 1;
        if (aType !== bType) return aType - bType;
        if (aType === 0) return (a.dueDate || '').localeCompare(b.dueDate || '');
        return (b.year || 0) - (a.year || 0) || (a.month || '').localeCompare(b.month || '');
      });
  }, [invoices, selected]);

  const studentInstallments = useMemo(
    () => studentInvoices.filter((i) => (i.type || '').toLowerCase() === 'installment'),
    [studentInvoices],
  );

  const baseFee = Number(selected?.baseFee || 0);
  const totalPlanned = rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const remaining = baseFee - totalPlanned;

  const outstandingTotal = useMemo(
    () =>
      studentInvoices
        .filter((i) => (i.status || '').toLowerCase() !== 'paid')
        .reduce((acc, i) => acc + Number(i.amount || 0) - Number(i.paidAmount || 0), 0),
    [studentInvoices],
  );
  const paidTotal = useMemo(
    () =>
      studentInvoices
        .filter((i) => (i.status || '').toLowerCase() === 'paid')
        .reduce((acc, i) => acc + Number(i.paidAmount || i.amount || 0), 0),
    [studentInvoices],
  );

  // ── Installment plan builder helpers ──
  const addRow = () =>
    setRows((prev) => [...prev, { id: `inst-${Date.now()}`, amount: '', due: '' }]);

  const updateRow = (id: string, patch: Partial<InstallmentRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const autoSplit = (n: number) => {
    if (!baseFee) return;
    const per = Math.floor(baseFee / n);
    const last = baseFee - per * (n - 1);
    const now = new Date();
    const next: InstallmentRow[] = Array.from({ length: n }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 5);
      return {
        id: `inst-${Date.now()}-${i}`,
        amount: String(i === n - 1 ? last : per),
        due: d.toISOString().split('T')[0],
      };
    });
    setRows(next);
    setPlanError(null);
  };

  const createPlan = async () => {
    if (!selected) return;
    if (rows.length === 0) {
      setPlanError('Add at least one installment.');
      return;
    }
    if (rows.some((r) => !r.amount || !r.due)) {
      setPlanError('Fill in all amounts and due dates.');
      return;
    }
    if (totalPlanned !== baseFee) {
      setPlanError(
        `Installments total ${fmtMoney(totalPlanned)} — must equal the locked base fee ${fmtMoney(baseFee)}.`,
      );
      return;
    }
    setSavingPlan(true);
    setPlanError(null);
    try {
      const payload = rows.map((r) => ({ amount: Number(r.amount), dueDate: r.due }));
      await api.createInstallments(selected.id, payload);
      toast({
        title: 'Installment plan created',
        description: `${rows.length} installments for ${selected.name}.`,
      });
      setRows([]);
      onRefresh();
    } catch (e: any) {
      toast({
        title: 'Could not create installments',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingPlan(false);
    }
  };

  // ── Mark an invoice paid ──
  const markPaid = async (inv: any) => {
    setMarkingId(inv.id);
    try {
      const updated = await api.markInvoicePaid(inv.id, Number(inv.amount), 'Cash');
      onInvoiceUpdate({
        ...inv,
        ...updated,
        status: 'Paid',
        paidAmount: Number(inv.amount),
        paidAt: new Date().toISOString(),
        paymentMethod: 'Cash',
      });
      toast({
        title: 'Marked as paid',
        description: `${inv.studentName || selected?.name} — ${fmtMoney(Number(inv.amount))}`,
      });
      // If first payment (no real login yet), issue the login. Every student's
      // first-time password is the SAME default — they change it on first login.
      if (selected && !hasRealLogin(selected)) {
        const password = 'concordia1234';
        const rollNo = selected.rollNo || selected.email?.split('@')[0] || selected.id;
        try {
          await api.editUser(selected.id, {
            email: `${String(rollNo).toLowerCase()}@concordia.edu.pk`,
            password,
          });
          onStudentUpdate({
            ...selected,
            email: `${String(rollNo).toLowerCase()}@concordia.edu.pk`,
            password,
          });
          setGeneratedLogin({ rollNo: String(rollNo), password });
          toast({
            title: 'Student login generated',
            description: `Username ${rollNo} — share the credentials below.`,
          });
        } catch {
          setGeneratedLogin({ rollNo: String(rollNo), password });
        }
      }
    } catch (e: any) {
      toast({
        title: 'Could not mark paid',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setMarkingId(null);
    }
  };

  // ── Download the student record + login credentials as a PDF ──
  const downloadCredentialsPdf = () => {
    if (!generatedLogin) return;
    const s: any = selected || {};
    const doc = new jsPDF();
    doc.setFontSize(20); doc.setTextColor('#F26522'); doc.text('Concordia College', 20, 24);
    doc.setTextColor('#111827'); doc.setFontSize(13); doc.text('Student Record & Login', 20, 35);
    doc.setDrawColor('#e5e7eb'); doc.line(20, 40, 190, 40);
    doc.setFontSize(11);
    let y = 54;
    const line = (label: string, val: any) => {
      doc.setTextColor('#6b7280'); doc.text(`${label}:`, 20, y);
      doc.setTextColor('#111827'); doc.text(String(val ?? '—'), 75, y);
      y += 10;
    };
    line('Student Name', s.name);
    line('Father / Guardian', s.fatherName || s.guardian);
    line('Program', deptLabel(s.program));
    line('Section', s.section);
    line('CNIC / B-Form', s.cnic);
    line('Contact', s.guardianPhone);
    line('Base Fee', s.baseFee != null && s.baseFee !== '' ? fmtMoney(Number(s.baseFee)) : '—');
    y += 4; doc.setDrawColor('#e5e7eb'); doc.line(20, y, 190, y); y += 12;
    doc.setFontSize(13); doc.setTextColor('#111827'); doc.text('Login Credentials', 20, y); y += 12;
    doc.setFontSize(13);
    doc.text(`Roll No / Username:   ${generatedLogin.rollNo}`, 20, y); y += 11;
    doc.text(`Password:   ${generatedLogin.password}`, 20, y); y += 12;
    doc.setFontSize(9); doc.setTextColor('#6b7280');
    doc.text('Sign in at the Concordia portal with the above. Change your password after first sign-in.', 20, y);
    savePdf(doc, `Student-${generatedLogin.rollNo}.pdf`);
  };

  // ── Download a challan as PDF (branded, with logo) ──
  const downloadChallanPdf = async (inv: any) => {
    setDownloadingId(inv.id);
    try {
      let data = inv;
      // Fetch the full challan data (includes institute + branch names) for a clean PDF.
      try {
        const full = await api.getChallanData(inv.id);
        data = { ...inv, ...full };
      } catch {}
      const insts = studentInstallments;
      const idx = insts.findIndex((i: any) => i.id === inv.id);
      const total = insts.length || 1;
      const within = Number(data.amount) || 0;
      const others = insts.filter((i: any) => i.id !== inv.id && (i.status || '').toLowerCase() !== 'paid');
      const arrearsSum = others.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const dt = challanInstallmentDates(insts[0]?.createdAt || data.createdAt, idx >= 0 ? idx : 0);
      const doc = await buildConcordiaChallan({
        studentId: data.rollNo || selected?.rollNo,
        billNo: data.challanNo || String(data.id || '').slice(-6),
        studentName: data.studentName || selected?.name,
        fatherName: selected?.fatherName || selected?.guardian,
        className: deptLabel(selected?.program) || data.className || data.class,
        section: data.section || selected?.section,
        feeIns: `${idx >= 0 ? idx + 1 : 1} of ${total}`,
        particulars: dt.particulars,
        items: [{ name: 'College Fee', amount: within }],
        payableWithin: within,
        payableAfter: within + Math.round(within * 0.05),
        dueDate: dt.dueStr,
        payableBefore: dt.dueStr,
        arrears: others.length ? `Ins:${others.length} Amount: ${arrearsSum}` : '',
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

  // ── Bulk-generate monthly tuition challans ──
  const generateMonthly = async () => {
    const now = new Date();
    const m = MONTHS[now.getMonth()];
    const y = now.getFullYear();
    setGeneratingMonthly(true);
    try {
      const res = await api.generateInvoices(m, y);
      toast({
        title: 'Monthly challans generated',
        description:
          res?.generated != null
            ? `${res.generated} new challan(s) for ${m} ${y}.`
            : `Challans queued for ${m} ${y}.`,
      });
      onRefresh();
    } catch (e: any) {
      toast({
        title: 'Could not generate challans',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingMonthly(false);
    }
  };

  // ── Drill handlers ──
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

  // ── Student picker + detail panel (rendered for both L4 and search-bypass) ──
  const renderStudentPickerAndDetail = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Student picker */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SectionHeader
          title={
            isSearching
              ? 'Matching Students'
              : `${activeClassObj?.name || '—'} · Section ${activeClassObj?.section || '—'}`
          }
          desc={
            displayedStudents.length === 0
              ? 'No students with a locked fee here.'
              : `${displayedStudents.length} student(s) with locked fee`
          }
        />
        {loading ? (
          <SkeletonTable rows={4} />
        ) : (
          <div className="space-y-1.5 max-h-[32rem] overflow-y-auto -mr-1 pr-1">
            {displayedStudents.length === 0 ? (
              <EmptyState
                icon={Users}
                title={
                  lockedStudents.length === 0
                    ? 'No locked fees'
                    : isSearching
                      ? 'No matching students'
                      : 'No locked-fee students in this section'
                }
                desc={
                  lockedStudents.length === 0
                    ? "The Admission Office must lock each student's base fee first."
                    : isSearching
                      ? 'Try a different search.'
                      : 'Pick another section or use the search box above.'
                }
              />
            ) : (
              displayedStudents.map((s) => {
                const invs = invoices.filter((i) => i.studentId === s.id || i.userId === s.id);
                const instCount = invs.filter((i) => (i.type || '').toLowerCase() === 'installment').length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSelected(s);
                      setRows([]);
                      setPlanError(null);
                      setGeneratedLogin(null);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border transition-colors',
                      selected?.id === s.id
                        ? 'border-[#F26522] bg-[#F26522]/5'
                        : 'border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                      {instCount > 0 && (
                        <span className="text-[10px] uppercase tracking-wider text-emerald-700 border border-emerald-100 bg-emerald-50 rounded px-1.5 py-0.5 shrink-0">
                          {instCount} inst.
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate mt-0.5">
                      {s.rollNo} · {s.class || '—'}
                      {s.section ? `-${s.section}` : ''} · {fmtMoney(Number(s.baseFee || 0))}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
        {!selected ? (
          <EmptyState
            icon={Receipt}
            title="Select a student"
            desc="Pick a student on the left to split their locked base fee into installments, collect payments, and download challans."
          />
        ) : (
          <div className="space-y-5">
            {/* Student summary */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selected.rollNo} · {selected.class || '—'}
                  {selected.section ? `-${selected.section}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    Base Fee (locked)
                  </p>
                  <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 justify-end mt-0.5">
                    <Lock className="h-3 w-3 text-gray-400" />
                    {fmtMoney(baseFee)}
                  </p>
                </div>
                
                {/* Actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem 
                      onClick={() => setDeleteDialogOpen(true)}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Student
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Paid + Outstanding KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Collected</p>
                <p className="text-base font-bold text-emerald-700 mt-1 tabular-nums">{fmtMoney(paidTotal)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Outstanding</p>
                <p className="text-base font-bold text-amber-700 mt-1 tabular-nums">{fmtMoney(outstandingTotal)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400">Installments</p>
                <p className="text-base font-bold text-gray-900 mt-1 tabular-nums">
                  {studentInstallments.length}
                  <span className="text-xs text-gray-400 font-normal"> / plan</span>
                </p>
              </div>
            </div>

            {/* ── Installment plan builder ── */}
            {studentInstallments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/40 p-4">
                <SectionHeader
                  title="Create Installment Plan"
                  desc="Add each installment with its amount and a due date you pick manually."
                />
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="text-xs text-gray-500">
                    {manualPlanMode ? 'Manual Plan Mode:' : 'Quick split (you can edit dates after):'}
                  </span>
                  {!manualPlanMode ? (
                    <>
                      {[3, 4, 5].map((n) => (
                        <Button
                          key={n}
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                          onClick={() => autoSplit(n)}
                          disabled={!baseFee}
                        >
                          {n} installments
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                        onClick={startManualPlan}
                        disabled={!baseFee}
                      >
                        Manual Plan
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs border-green-200 bg-green-50 hover:bg-green-100 text-green-700"
                        onClick={addManualInstallment}
                        disabled={rows.length >= 5}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Installment
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 text-xs border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                        onClick={cancelManualPlan}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancel Manual
                      </Button>
                    </>
                  )}
                </div>
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500 bg-white">
                    No installments yet. Click “Add Row” to create each
                    installment with its own due date, or use a quick split.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[2rem_1fr_1.3fr_2rem] gap-2 text-[10px] uppercase tracking-wider text-gray-400 px-1">
                      <span>#</span>
                      <span>Amount (Rs)</span>
                      <span>Due Date (pick manually)</span>
                      <span />
                    </div>
                    {rows.map((r, i) => (
                      <div key={r.id} className="grid grid-cols-[2rem_1fr_1.3fr_2rem] gap-2 items-center">
                        <span className="text-sm font-semibold text-gray-400 text-center">{i + 1}</span>
                        <Input
                          type="number"
                          min={0}
                          value={r.amount}
                          onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                          placeholder="0"
                          className={`${inputCls} h-9`}
                        />
                        <Input
                          type="date"
                          value={r.due}
                          onChange={(e) => updateRow(r.id, { due: e.target.value })}
                          className={`${inputCls} h-9`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                          onClick={() => removeRow(r.id)}
                          aria-label="Remove installment"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    variant="outline"
                    className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium"
                    onClick={manualPlanMode ? addManualInstallment : addRow}
                    disabled={manualPlanMode && rows.length >= 5}
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> 
                    {manualPlanMode ? 'Add Installment' : 'Add Row'}
                    {manualPlanMode && ` (${rows.length}/5)`}
                  </Button>
                  <Button
                    className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium ml-auto"
                    onClick={createPlan}
                    disabled={savingPlan || rows.length === 0}
                  >
                    {savingPlan ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Create Installments
                      </>
                    )}
                  </Button>
                </div>
                {/* Totals */}
                {rows.length > 0 && (
                  <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-1.5 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{manualPlanMode ? 'Original Base Fee' : 'Base Fee'}</span>
                      <span className="font-mono text-gray-900">{fmtMoney(baseFee)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{manualPlanMode ? 'Custom Total' : 'Planned Total'}</span>
                      <span className="font-mono text-gray-900">{fmtMoney(totalPlanned)}</span>
                    </div>
                    {!manualPlanMode && (
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200">
                        <span className="font-semibold text-gray-700">Remaining</span>
                        <span
                          className={cn(
                            'font-bold tabular-nums font-mono',
                            remaining === 0 ? 'text-emerald-700' : 'text-gray-900',
                          )}
                        >
                          {fmtMoney(remaining)}
                        </span>
                      </div>
                    )}
                    {manualPlanMode && (
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200">
                        <span className="font-semibold text-gray-700">Difference</span>
                        <span
                          className={cn(
                            'font-bold tabular-nums font-mono',
                            remaining === 0 ? 'text-emerald-700' : remaining > 0 ? 'text-blue-700' : 'text-amber-700',
                          )}
                        >
                          {remaining > 0 ? '+' : ''}{fmtMoney(Math.abs(remaining))}
                          {remaining !== 0 && (
                            <span className="text-[10px] ml-1 font-normal">
                              ({remaining > 0 ? 'over' : 'under'} base fee)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {planError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2 mt-3">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {planError}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Installment plan active</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      {studentInstallments.length} installments · use the list below to mark paid or download.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700"
                  onClick={() => {
                    setRows(
                      studentInstallments.map((i) => ({
                        id: `inst-${i.id}`,
                        amount: String(i.amount),
                        due: i.dueDate || '',
                      })),
                    );
                    setPlanError(null);
                  }}
                >
                  Re-split
                </Button>
              </div>
            )}

            {/* ── Invoices list ── */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                All Invoices & Installments
              </h4>
              {studentInvoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                  No invoices yet. Create an installment plan above.
                </div>
              ) : (
                <div className="space-y-2">
                  {studentInvoices.map((inv) => {
                    const isPaid = (inv.status || '').toLowerCase() === 'paid';
                    const isInstallment = (inv.type || '').toLowerCase() === 'installment';
                    return (
                      <div
                        key={inv.id}
                        className={cn(
                          'flex items-center justify-between gap-3 p-3 rounded-lg border',
                          isPaid ? 'border-emerald-100 bg-emerald-50/40' : 'border-gray-200 bg-white',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900">
                              {isInstallment
                                ? `Installment — Due ${formatDate(inv.dueDate)}`
                                : `${inv.type || 'Tuition'} — ${inv.month ? monthName(inv.month) : ''} ${inv.year || ''}`}
                            </p>
                            <StatusBadge status={inv.status} />
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                            {inv.challanNo || String(inv.id || '').slice(0, 12)}
                            {inv.paidAt && ` · Paid ${formatDate(inv.paidAt)}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {editingInstallment === inv.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                                className="h-8 w-24 text-sm text-right"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => saveEditInstallment(inv)}
                                disabled={!editAmount || Number(editAmount) <= 0}
                              >
                                ✓
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs"
                                onClick={cancelEditInstallment}
                              >
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-gray-900 tabular-nums">
                              {fmtMoney(Number(inv.amount || 0))}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                            onClick={() => downloadChallanPdf(inv)}
                            disabled={downloadingId === inv.id}
                          >
                            {downloadingId === inv.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5 mr-1" />
                            )}
                            PDF
                          </Button>
                          {!isPaid && isInstallment && editingInstallment !== inv.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-xs border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700"
                              onClick={() => startEditInstallment(inv)}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                          )}
                          {!isPaid && (
                            <Button
                              size="sm"
                              className="h-8 px-2.5 text-xs bg-[#F26522] hover:bg-[#D4541E] text-white"
                              onClick={() => markPaid(inv)}
                              disabled={markingId === inv.id}
                            >
                              {markingId === inv.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              )}
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Login credentials popup (with student-record PDF download) */}
            <Dialog open={!!generatedLogin} onOpenChange={(o) => { if (!o) setGeneratedLogin(null); }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Student login created</DialogTitle>
                  <DialogDescription>Share these with {selected?.name || 'the student'} — they change the password on first sign-in.</DialogDescription>
                </DialogHeader>
                {generatedLogin && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Username (Roll #)</p>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{generatedLogin.rollNo}</span>
                          <CopyButton text={generatedLogin.rollNo} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Password</p>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="font-mono font-semibold text-gray-900 text-sm">{generatedLogin.password}</span>
                          <CopyButton text={generatedLogin.password} />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between pt-1">
                      <Button variant="outline" onClick={downloadCredentialsPdf} className="h-9"><Download className="h-4 w-4 mr-1.5" /> Download PDF</Button>
                      <Button onClick={() => setGeneratedLogin(null)} className="bg-[#F26522] hover:bg-[#D4541E] text-white h-9">Done</Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee & Installments"
        subtitle="Split the locked base fee into installments, collect payments, and download challans as PDF."
        action={
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-9 px-4 text-sm font-medium"
              onClick={onRefresh}
            >
              <Loader2 className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium"
              onClick={generateMonthly}
              disabled={generatingMonthly || students.length === 0}
            >
              {generatingMonthly ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1.5" /> Generate Monthly Challans
                </>
              )}
            </Button>
          </div>
        }
      />

      <LockedFeeCallout />

      {/* Search bar — always visible. Drives the flat-search fallback. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search locked-fee students by name, roll #, or class…"
            className={`${inputCls} pl-9`}
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
              {displayedStudents.length} match{displayedStudents.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </div>

      {/* ── Body: search results / hierarchy / drilled-in picker+detail ── */}
      {isSearching ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Search Results</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Matching locked-fee students across all departments
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
          {renderStudentPickerAndDetail()}
        </motion.div>
      ) : !drill.dept ? (
        // ── L1: Department cards ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Select a Department</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Browse the 6 Concordia departments to find students with a locked base fee.
            </p>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : (
            <DeptCardGrid onSelect={handleSelectDept} studentCounts={studentCounts} />
          )}
        </motion.div>
      ) : !drill.cls ? (
        // ── L2: Part toggle + class cards ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <HierarchyBreadcrumb dept={drill.dept} part={drill.part} onClear={handleClearHierarchy} />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{drill.dept} Classes</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Select Part 1 (1st year) or Part 2 (2nd year), then pick a class.
              </p>
            </div>
            <PartToggle
              value={drill.part}
              onChange={(p) => setDrill((d) => ({ ...d, part: p, cls: null, section: null }))}
            />
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : classesInDept.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <GraduationCap className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                No classes found for {drill.dept} · Part {drill.part}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                The Academic Office needs to create classes with program={drill.dept} and
                part={drill.part}. Meanwhile, you can still search locked-fee students by name
                or roll # above.
              </p>
            </div>
          ) : (
            <ClassCardGrid
              classes={classesInDept}
              onSelect={handleSelectClass}
              getStudentCount={getLockedCountForClass}
            />
          )}
        </motion.div>
      ) : !drill.section ? (
        // ── L3: Section cards (only when multiple sections exist) ──
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
                This class has multiple sections. Pick one to view its locked-fee students.
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
            getStudentCount={getLockedCountForClass}
          />
        </motion.div>
      ) : (
        // ── L4: Student picker + detail panel ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <HierarchyBreadcrumb
            dept={drill.dept}
            part={drill.part}
            section={(drill.section || drill.cls).section}
            onClear={handleClearHierarchy}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {drill.cls.name} · Section {(drill.section || drill.cls).section}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {displayedStudents.length} locked-fee student
                {displayedStudents.length === 1 ? '' : 's'} in this section
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 px-3 text-xs bg-[#F26522] hover:bg-[#D4541E] text-white"
                onClick={() => setBulkPick({ open: true, mode: 'pdf' })}
                disabled={sectionPdfDownloading || displayedStudents.length === 0}
              >
                {sectionPdfDownloading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Building PDF...
                  </>
                ) : (
                  <>
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Print All (One PDF)
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs border-[#F26522] text-[#F26522] hover:bg-[#F26522] hover:text-white"
                onClick={() => setBulkPick({ open: true, mode: 'zip' })}
                disabled={bulkDownloading || displayedStudents.length === 0}
              >
                {bulkDownloading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download All (ZIP)
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                onClick={() =>
                  setDrill((d) => ({
                    ...d,
                    cls: d.cls,
                    section: null,
                  }))
                }
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back to sections
              </Button>
            </div>
          </div>
          {renderStudentPickerAndDetail()}
        </motion.div>
      )}
      
      {/* Delete Student Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selected?.name}</strong>? This will permanently remove:
              <br />• Student record and profile
              <br />• All fee installments and invoices
              <br />• Login credentials and access
              <br /><br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingStudent}>Cancel</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={deleteStudent}
              disabled={deletingStudent}
            >
              {deletingStudent ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Student
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk export — pick which installment's challan to include */}
      <Dialog open={bulkPick.open} onOpenChange={(o) => setBulkPick((p) => ({ ...p, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select installment</DialogTitle>
            <DialogDescription>
              Choose which installment's challan to {bulkPick.mode === 'pdf' ? 'include in the combined PDF' : 'download'} for every student in this section.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-1">
            {Array.from({ length: Math.max(1, maxInstallmentsInSection) }).map((_, i) => (
              <Button
                key={i}
                variant="outline"
                className="justify-start h-10 border-gray-200 hover:border-[#F26522] hover:bg-[#FFF7F2]"
                onClick={() => runBulkExport(i)}
              >
                <FileText className="h-4 w-4 mr-2 text-[#F26522]" />
                Installment {i + 1} only
              </Button>
            ))}
            <Button
              variant="ghost"
              className="justify-start h-10 text-gray-600"
              onClick={() => runBulkExport(undefined)}
            >
              Each student's next unpaid installment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}




// ───────────────────────── 6. Miscellaneous Charges ─────────────────────────

type MiscCharge = {
  id: string;
  studentId: string;
  studentName: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
};

function MiscChargesView({
  user,
  students,
  classes,
  loading,
}: {
  user: any;
  students: any[];
  classes: any[];
  loading: boolean;
}) {
  type MiscDrill = {
    dept: string | null;
    part: string;
    cls: { id: string; name: string; section: string } | null;
    section: { id: string; name: string; section: string } | null;
  };

  const [charges, setCharges] = useState<MiscCharge[]>([]);
  const [chargesLoading, setChargesLoading] = useState(true);
  const [search, setSearch] = useState('');

  // ── Per-student charge form state (preserved from the legacy view) ──
  const [studentSearch, setStudentSearch] = useState('');
  const [selStudent, setSelStudent] = useState('');
  const [type, setType] = useState(MISC_CHARGE_TYPES[0]);
  const [customType, setCustomType] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // ── Bulk-charge card state ──
  const [bulkPart, setBulkPart] = useState('1');
  const [bulkDept, setBulkDept] = useState('All');
  const [bulkType, setBulkType] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkDesc, setBulkDesc] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Hierarchy drill state ──
  const [drill, setDrill] = useNavState<MiscDrill>('accountant-misc', {
    dept: null,
    part: '1',
    cls: null,
    section: null,
  });

  // Load persisted misc charges for the branch
  useEffect(() => {
    let cancelled = false;
    setChargesLoading(true);
    api
      .getMiscCharges({ branchId: user?.branchId })
      .then((data) => {
        if (cancelled) return;
        setCharges(Array.isArray(data) ? (data as MiscCharge[]) : []);
      })
      .catch(() => {
        if (!cancelled) setCharges([]);
      })
      .finally(() => !cancelled && setChargesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user?.branchId]);

  // Reload the charges list (called after bulk / per-student adds).
  const reloadCharges = () => {
    setChargesLoading(true);
    api
      .getMiscCharges({ branchId: user?.branchId })
      .then((data) => setCharges(Array.isArray(data) ? (data as MiscCharge[]) : []))
      .catch(() => setCharges([]))
      .finally(() => setChargesLoading(false));
  };

  // Per-department student counts (drives the DeptCardGrid).
  const studentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of DEPARTMENTS) map[d] = 0;
    for (const s of students) {
      const p = (s.program || '').trim();
      if (map[p] != null) map[p] += 1;
    }
    return map;
  }, [students]);

  // ── Hierarchy memos ──
  const classesInDept = useMemo(() => {
    if (!drill.dept) return [];
    return classes.filter(
      (c) => (c.program || '').trim() === drill.dept && String(c.part || '') === drill.part,
    );
  }, [classes, drill.dept, drill.part]);

  const sectionsOfClass = useMemo(() => {
    if (!drill.cls) return [];
    // Sections belong to a specific Part — never merge Part 1 and Part 2
    // sections of the same class (e.g. MB/MG in Part 1 vs MK/MQ in Part 2).
    return classes.filter(
      (c) => c.name === drill.cls!.name && String(c.part || '1') === String(drill.part || '1'),
    );
  }, [classes, drill.cls, drill.part]);
  const hasMultipleSections = sectionsOfClass.length > 1;

  const activeClassId = drill.section?.id || drill.cls?.id || '';
  const activeClassObj = classes.find((c) => c.id === activeClassId) || null;

  const isSearching = search.trim().length > 0;

  // Map studentId → student row, for joining charges back to a class+section.
  const studentById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of students) m[s.id] = s;
    return m;
  }, [students]);

  // Charges shown in the list — flat search OR filtered to the drilled section.
  const displayedCharges = useMemo(() => {
    if (isSearching) {
      const q = search.trim().toLowerCase();
      return charges.filter(
        (c) =>
          c.studentName?.toLowerCase().includes(q) ||
          c.type?.toLowerCase().includes(q),
      );
    }
    if (!activeClassObj) return charges;
    const wantPart = String(activeClassObj.part || '1');
    return charges.filter((c) => {
      const s = studentById[c.studentId];
      if (!s) return false;
      return (
        (s.class || s.program || '') === activeClassObj.name &&
        (s.section || '') === activeClassObj.section &&
        String(s.part || '1') === wantPart
      );
    });
  }, [charges, search, activeClassObj, isSearching, studentById]);

  // Searchable student list for the per-student Add Charge form.
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return [];
    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.rollNo?.toLowerCase().includes(q) ||
        s.class?.toLowerCase().includes(q),
    );
  }, [students, studentSearch]);

  const selectedStudent = students.find((s) => s.id === selStudent);
  const isOther = type === 'Other';
  const finalType = isOther ? customType.trim() : type;

  const total = displayedCharges.reduce((acc, c) => acc + c.amount, 0);

  // ── Add a single per-student charge (preserved legacy logic) ──
  const add = async () => {
    if (!selStudent) {
      toast({ title: 'Select a student', variant: 'destructive' });
      return;
    }
    if (isOther && !customType.trim()) {
      toast({ title: 'Enter a custom charge type', variant: 'destructive' });
      return;
    }
    const v = Number(amount);
    if (!amount || isNaN(v) || v <= 0) {
      toast({
        title: 'Enter a valid amount',
        description: 'Amount must be a positive number.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const created = await api.addMiscCharge({
        studentId: selStudent,
        type: finalType,
        amount: v,
        description: desc.trim(),
      });
      const newCharge: MiscCharge = {
        id: created.id || `MC-${Date.now()}`,
        studentId: selStudent,
        studentName: created.studentName || selectedStudent?.name || '—',
        type: finalType,
        amount: v,
        description: desc.trim(),
        createdAt: created.createdAt || new Date().toISOString(),
      };
      setCharges((prev) => [newCharge, ...prev]);
      setAmount('');
      setDesc('');
      setCustomType('');
      setType(MISC_CHARGE_TYPES[0]);
      setSelStudent('');
      setStudentSearch('');
      toast({
        title: 'Charge added',
        description: `${finalType} — ${fmtMoney(v)} for ${selectedStudent?.name || 'student'}.`,
      });
      setAddOpen(false);
    } catch (e: any) {
      toast({
        title: 'Could not add charge',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const prev = charges;
    setCharges((c) => c.filter((x) => x.id !== id));
    try {
      await api.deleteMiscCharge(id);
      toast({ title: 'Charge removed' });
    } catch (e: any) {
      setCharges(prev); // rollback
      toast({
        title: 'Could not remove charge',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // ── Apply a bulk charge to every student in the chosen Part (+ optional dept) ──
  const applyBulk = async () => {
    const t = bulkType.trim();
    if (!t) {
      toast({ title: 'Enter a charge type', variant: 'destructive' });
      return;
    }
    const v = Number(bulkAmount);
    if (!bulkAmount || isNaN(v) || v <= 0) {
      toast({
        title: 'Enter a valid amount',
        description: 'Amount must be a positive number.',
        variant: 'destructive',
      });
      return;
    }
    setBulkSaving(true);
    try {
      const res = await api.bulkAddMiscCharges({
        part: bulkPart,
        program: bulkDept === 'All' ? undefined : bulkDept,
        branchId: user?.branchId,
        type: t,
        amount: v,
        description: bulkDesc.trim(),
      });
      toast({
        title: 'Bulk charge applied',
        description: `Applied "${t}" of Rs ${v.toLocaleString('en-PK')} to ${res?.created ?? 0} students (Part ${bulkPart}).`,
      });
      setBulkType('');
      setBulkAmount('');
      setBulkDesc('');
      reloadCharges();
    } catch (e: any) {
      toast({
        title: 'Could not apply bulk charge',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBulkSaving(false);
    }
  };

  // ── Drill handlers ──
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

  // Helper: count students for a given class id (for the card grids).
  const getStudentCountForClass = (clsId: string) => {
    const c = classes.find((x) => x.id === clsId);
    if (!c) return 0;
    const cPart = String(c.part || '1');
    return students.filter(
      (s) =>
        (s.class || s.program || '') === c.name &&
        (s.section || '') === c.section &&
        String(s.part || '1') === cPart,
    ).length;
  };

  // ── Charges list card — used by both search mode and L4 drilled-in mode ──
  const renderChargesList = (title: string, subtitle: string) => (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <SectionHeader
        title={title}
        desc={subtitle}
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Individual Charge
          </Button>
        }
      />
      {chargesLoading ? (
        <SkeletonTable rows={5} />
      ) : displayedCharges.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title={charges.length === 0 ? 'No misc charges yet' : 'No charges in this view'}
          desc={
            charges.length === 0
              ? 'Use the bulk card above or the “Add Individual Charge” button to record the first charge.'
              : 'Try a different section or clear the search.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200 hover:bg-transparent">
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Student
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Type
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                  Amount
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Description
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400 text-right">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedCharges.map((c) => (
                <TableRow key={c.id} className="border-gray-100 hover:bg-gray-50">
                  <TableCell className="text-sm font-medium text-gray-900">
                    {c.studentName}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700">
                    <Badge
                      variant="outline"
                      className="bg-gray-50 text-gray-700 border-gray-200 text-[10px]"
                    >
                      {c.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-gray-900 text-right tabular-nums">
                    {fmtMoney(c.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 max-w-xs truncate">
                    {c.description || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-gray-500 hover:text-rose-600 hover:bg-rose-50"
                      onClick={() => remove(c.id)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Miscellaneous Charges"
        subtitle="One-off fees (admission, exam, or custom) — separate from base tuition. Bulk-apply to a whole cohort, or add per student."
      />

      {/* ── Bulk-charge card (always visible at the top) ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-orange-50/40 p-5"
      >
        <SectionHeader
          title="Add Bulk Charge"
          desc="Apply a one-off charge to every student in a Part (optionally filtered by department)."
          action={
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded-md px-2 py-0.5">
              <Zap className="h-3 w-3" /> Bulk action
            </span>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Part toggle */}
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
              Part
            </Label>
            <PartToggle value={bulkPart} onChange={setBulkPart} />
          </div>
          {/* Department select */}
          <Field label="Department (optional)">
            <Select value={bulkDept} onValueChange={setBulkDept}>
              <SelectTrigger className={`${inputCls} w-full`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Departments</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {deptLabel(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {/* Charge type — free text */}
          <Field label="Charge Type" required>
            <Input
              value={bulkType}
              onChange={(e) => setBulkType(e.target.value)}
              placeholder="e.g. Board admission fee"
              className={inputCls}
            />
          </Field>
          {/* Amount */}
          <Field label="Amount (PKR)" required>
            <div className="relative">
              <DollarSign className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="number"
                min={0}
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                placeholder="0"
                className={`${inputCls} pl-9`}
              />
            </div>
          </Field>
          {/* Description */}
          <div className="md:col-span-2">
            <Field label="Description (optional)">
              <Textarea
                value={bulkDesc}
                onChange={(e) => setBulkDesc(e.target.value)}
                rows={2}
                placeholder="e.g. Annual board registration — March 2025"
                className="rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12"
              />
            </Field>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-amber-200/60">
          <p className="text-xs text-amber-800/90 leading-relaxed">
            This charge applies to every student in{' '}
            <span className="font-semibold">Part {bulkPart}</span>
            {bulkDept !== 'All' ? (
              <>
                {' '}· <span className="font-semibold">{deptLabel(bulkDept)}</span>
              </>
            ) : null}
            .
          </p>
          <Button
            className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-9 px-4 text-sm font-medium shrink-0"
            onClick={applyBulk}
            disabled={bulkSaving}
          >
            {bulkSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Applying…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-1.5" /> Apply to All Students
              </>
            )}
          </Button>
        </div>
      </motion.div>

      {/* Search bar — always visible. Drives the flat-search fallback. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search charges by student name or charge type…"
            className={`${inputCls} pl-9`}
          />
          {isSearching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">
              {displayedCharges.length} match{displayedCharges.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </div>

      {/* ── Body: search results / hierarchy / drilled-in charges ── */}
      {isSearching ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Search Results</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Matching charges across all students · Total {fmtMoney(total)}
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
          {renderChargesList('Matching Charges', `${displayedCharges.length} record(s) · Total ${fmtMoney(total)}`)}
        </motion.div>
      ) : !drill.dept ? (
        // ── L1: Department cards ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Select a Department</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Drill into a department to view per-student charges for its classes.
            </p>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : (
            <DeptCardGrid onSelect={handleSelectDept} studentCounts={studentCounts} />
          )}
        </motion.div>
      ) : !drill.cls ? (
        // ── L2: Part toggle + class cards ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <HierarchyBreadcrumb dept={drill.dept} part={drill.part} onClear={handleClearHierarchy} />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{drill.dept} Classes</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Select Part 1 (1st year) or Part 2 (2nd year), then pick a class.
              </p>
            </div>
            <PartToggle
              value={drill.part}
              onChange={(p) => setDrill((d) => ({ ...d, part: p, cls: null, section: null }))}
            />
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : classesInDept.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <GraduationCap className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">
                No classes found for {drill.dept} · Part {drill.part}
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                The Academic Office needs to create classes with program={drill.dept} and
                part={drill.part}. Meanwhile, you can still search charges by student name above.
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
      ) : !drill.section ? (
        // ── L3: Section cards (only when multiple sections exist) ──
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
                This class has multiple sections. Pick one to view its charges.
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
        // ── L4: Charges for the drilled class + section ──
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <HierarchyBreadcrumb
            dept={drill.dept}
            part={drill.part}
            section={(drill.section || drill.cls).section}
            onClear={handleClearHierarchy}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {drill.cls.name} · Section {(drill.section || drill.cls).section}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {displayedCharges.length} charge{displayedCharges.length === 1 ? '' : 's'} · Total {fmtMoney(total)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              onClick={() =>
                setDrill((d) => ({
                  ...d,
                  cls: d.cls,
                  section: null,
                }))
              }
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back to sections
            </Button>
          </div>
          {renderChargesList(
            `Charges — ${drill.cls.name} · Section ${(drill.section || drill.cls).section}`,
            `${displayedCharges.length} record(s) · Total ${fmtMoney(total)}`,
          )}
        </motion.div>
      )}

      {/* ── Per-student Add Charge Sheet (preserved form) ── */}
      <Sheet open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold text-gray-900">
              Add Individual Charge
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              Record a one-off fee for a specific student.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-4">
            {/* Searchable student picker */}
            <Field label="Student" required>
              {selStudent ? (
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-[#F26522] bg-[#F26522]/5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {selectedStudent?.name || '—'}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {selectedStudent?.rollNo || '—'} · {selectedStudent?.class || '—'}
                      {selectedStudent?.section ? `-${selectedStudent.section}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    onClick={() => setSelStudent('')}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="relative mb-2">
                    <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Type a student name, roll #, or class to search…"
                      className={`${inputCls} pl-9`}
                      autoFocus
                    />
                  </div>
                  {loading ? (
                    <SkeletonTable rows={3} />
                  ) : students.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                      No students enrolled yet. The Admission Office must enroll students first.
                    </div>
                  ) : studentSearch.trim() === '' ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                      Start typing above to search for a student by name, roll #, or class.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto -mr-1 pr-1 space-y-1.5 rounded-lg border border-gray-200 p-1.5">
                      {filteredStudents.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-500 text-center">
                          No matching students. Try a different name.
                        </div>
                      ) : (
                        filteredStudents.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelStudent(s.id);
                              setStudentSearch('');
                            }}
                            className="w-full text-left p-2.5 rounded-md border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            <div className="text-sm font-medium text-gray-900 truncate">{s.name}</div>
                            <div className="text-[11px] text-gray-500 truncate mt-0.5">
                              {s.rollNo || '—'} · {s.class || '—'}
                              {s.section ? `-${s.section}` : ''}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </Field>

            {/* Charge type — 2 fixed + Other (custom text input) */}
            <Field label="Charge Type" required>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className={`${inputCls} w-full`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MISC_CHARGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isOther && (
                <div className="mt-2">
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">
                    Write the charge name
                  </label>
                  <Input
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    placeholder="e.g. Sports Fee, Trip Fee, Library Fine…"
                    className={`${inputCls} w-full`}
                    autoFocus
                  />
                </div>
              )}
            </Field>

            <Field label="Amount (Rs)" required>
              <div className="relative">
                <DollarSign className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </Field>
            <Field label="Description (optional)">
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder="e.g. Annual educational trip — Lahore"
                className="rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/12"
              />
            </Field>
          </div>

          <SheetFooter>
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={() => setAddOpen(false)}
                className={cn(btnSecondary, 'justify-center h-10')}
              >
                Cancel
              </button>
              <button
                onClick={add}
                disabled={saving}
                className={cn(btnPrimary, 'justify-center h-10')}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Charge
              </button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}



// ───────────────────────── 7. Create Logins (Student + Teacher) ─────────────────────────

function LoginsView({
  user,
  students,
  loading,
  onUpdate,
}: {
  user: any;
  students: any[];
  loading: boolean;
  onUpdate: (s: any) => void;
}) {
  // --- Student logins state ---
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const [creating, setCreating] = useState('');
  const [generated, setGenerated] = useState<
    Record<string, { rollNo: string; password: string }>
  >({});
  // Per-student optional manual roll-number input (shown inline next to the
  // "Generate Login" button). If left blank, the server auto-assigns the next
  // branch-sequential roll number.
  const [rollInputs, setRollInputs] = useState<Record<string, string>>({});

  // --- Student edit + block state ---
  // The accountant can edit a student's portal details (name, roll #,
  // email, password, class, section, guardian, contact, CNIC) and can
  // block / unblock a student's login.
  const [editStudent, setEditStudent] = useState<any | null>(null);
  const [studentForm, setStudentForm] = useState({
    name: '',
    rollNo: '',
    email: '',
    password: '',
    class: '',
    section: '',
    guardian: '',
    guardianPhone: '',
    cnic: '',
  });
  const [revealStudentPw, setRevealStudentPw] = useState(false);
  const [studentPwLoading, setStudentPwLoading] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);
  const [blockingStudentId, setBlockingStudentId] = useState('');

  // --- Manage-access popup state ---
  // When the accountant clicks "Block" on a student, instead of
  // immediately blocking we open a popup offering two choices:
  //   • Block  — temporary; the user can't log in but their data is kept.
  //   • Delete — permanent; the login AND all their data are erased forever.
  // `manageTarget` holds the student being acted on. `manageMode` flips
  // between the choice view ('choose') and the delete confirmation view
  // ('confirm-delete') once Delete is picked.
  const [manageTarget, setManageTarget] = useState<any | null>(null);
  const [manageMode, setManageMode] = useState<'choose' | 'confirm-delete'>('choose');
  const [manageBusy, setManageBusy] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // --- Bulk generate logins state ---
  // One-click "Generate All Missing Logins" — iterates every student in the
  // branch who lacks a rollNo / email / has a placeholder password and issues
  // them a real login. The result sheet shows the full credentials list so
  // the officer can print or distribute to students.
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const [bulkCopied, setBulkCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      const hasLogin = hasRealLogin(s);
      if (filter === 'with' && !hasLogin) return false;
      if (filter === 'without' && hasLogin) return false;
      if (!q) return true;
      return (
        s.name?.toLowerCase().includes(q) ||
        s.rollNo?.toLowerCase().includes(q) ||
        s.class?.toLowerCase().includes(q)
      );
    });
  }, [students, search, filter]);

  const stats = useMemo(() => {
    const withLogin = students.filter(hasRealLogin).length;
    return { total: students.length, with: withLogin, without: students.length - withLogin };
  }, [students]);

  const generate = async (s: any) => {
    setCreating(s.id);
    try {
      // Use the new server-side generate-login endpoint. This GUARANTEES the
      // student gets a real roll number (either the one the officer typed, or
      // an auto-generated branch-sequential one) — fixing the bug where
      // students had no roll number and could not log in.
      const manualRoll = (rollInputs[s.id] || '').trim();
      const r = await api.generateStudentLogin(s.id, manualRoll || undefined);
      const rollNo = r.rollNo;
      const password = r.password;
      const email = r.email;
      onUpdate({ ...s, rollNo, email, password });
      setGenerated((prev) => ({ ...prev, [s.id]: { rollNo, password } }));
      setRollInputs((prev) => ({ ...prev, [s.id]: '' }));
      toast({
        title: 'Login generated',
        description: `${s.name} — username ${rollNo}`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not generate login',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreating('');
    }
  };

  // Bulk-generate logins for every student in the branch who is missing
  // credentials. The result sheet (bulkResult) shows the full credentials
  // list so the officer can print or copy them. This is the one-click fix
  // for "students can't log in because they were imported without roll
  // numbers".
  const bulkGenerate = async () => {
    setBulkBusy(true);
    setBulkCopied(false);
    try {
      const r = await api.bulkGenerateStudentLogins();
      setBulkResult(r);
      // Refresh every student in the local list so the UI reflects the
      // newly-assigned roll numbers + login-active badges.
      for (const c of r.credentials) {
        const existing = students.find((s) => s.id === c.id);
        if (existing) onUpdate({ ...existing, rollNo: c.rollNo, email: c.email, password: c.password });
      }
      toast({
        title: r.generated > 0 ? `${r.generated} logins generated` : 'All students already have logins',
        description:
          r.generated > 0
            ? `${r.generated} of ${r.total} students received credentials. ${r.skipped} already had logins.`
            : `All ${r.total} students already have credentials.`,
      });
    } catch (e: any) {
      toast({
        title: 'Bulk generate failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const copyBulkToClipboard = () => {
    if (!bulkResult?.credentials?.length) return;
    const lines = ['Roll No,Name,Email,Password'];
    for (const c of bulkResult.credentials) {
      lines.push(`${c.rollNo},"${c.name}",${c.email},${c.password}`);
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setBulkCopied(true);
      setTimeout(() => setBulkCopied(false), 2000);
    });
  };

  // ─── Student edit + block helpers ───

  const openEditStudent = (s: any) => {
    setEditStudent(s);
    setRevealStudentPw(false);
    setStudentForm({
      name: s.name || '',
      rollNo: s.rollNo || '',
      email: s.email || '',
      password: '',
      class: s.class || '',
      section: s.section || '',
      guardian: s.guardian || s.fatherName || '',
      guardianPhone: s.guardianPhone || '',
      cnic: s.cnic || '',
    });
  };

  // Reveal / hide the student's current password. Tapping "Reveal" calls the
  // backend password endpoint; tapping again just hides the field locally.
  const revealStudentPassword = async () => {
    if (!editStudent) return;
    if (revealStudentPw) {
      setRevealStudentPw(false);
      return;
    }
    setStudentPwLoading(true);
    try {
      const r = await api.getUserPassword(editStudent.id);
      setStudentForm((prev) => ({ ...prev, password: r?.password || '' }));
      setRevealStudentPw(true);
    } catch (e: any) {
      toast({
        title: 'Could not fetch password',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setStudentPwLoading(false);
    }
  };

  const saveStudent = async () => {
    if (!editStudent) return;
    if (!studentForm.name || !studentForm.rollNo) {
      toast({ title: 'Name and Roll No are required', variant: 'destructive' });
      return;
    }
    // Client-side duplicate Roll Number check — excludes the student being
    // edited. The server (PATCH platform/users) also enforces this, but
    // checking here gives instant feedback.
    const rollNoTrim = studentForm.rollNo.trim();
    const dupStudent = students.find(
      (s) =>
        s.id !== editStudent.id &&
        (s.rollNo || '').toLowerCase() === rollNoTrim.toLowerCase(),
    );
    if (dupStudent) {
      toast({
        title: 'Duplicate Roll Number',
        description: `Roll Number "${rollNoTrim}" is already used by ${dupStudent.name}. Please use a different roll number.`,
        variant: 'destructive',
      });
      return;
    }
    setSavingStudent(true);
    try {
      const body: any = {
        name: studentForm.name,
        rollNo: studentForm.rollNo,
        email: studentForm.email,
        class: studentForm.class,
        section: studentForm.section,
        guardian: studentForm.guardian,
        guardianPhone: studentForm.guardianPhone,
        cnic: studentForm.cnic,
      };
      // Only send a new password when the accountant actually typed one —
      // leaving the field blank keeps the existing password intact.
      if (studentForm.password) body.password = studentForm.password;
      await api.editUser(editStudent.id, body);
      onUpdate({ id: editStudent.id, ...body });
      toast({
        title: 'Student updated',
        description: `${studentForm.name} — changes saved.`,
      });
      setEditStudent(null);
    } catch (e: any) {
      toast({
        title: 'Could not save changes',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingStudent(false);
    }
  };

  // Opens the manage-access popup for a student. Offers Block (temporary) or
  // Delete (permanent). When the student is already blocked, the row's button
  // reads "Unblock" and calls unblockStudent directly — no popup, since
  // unblocking is reversible.
  const openManageStudent = (s: any) => {
    setManageTarget(s);
    setManageMode('choose');
    setDeleteConfirmText('');
  };

  const unblockStudent = async (s: any) => {
    setBlockingStudentId(s.id);
    try {
      await api.blockUser(s.id, false);
      onUpdate({ id: s.id, blocked: 0 });
      toast({
        title: 'Student unblocked',
        description: `${s.name} can now sign in again.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not update block status',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBlockingStudentId('');
    }
  };

  // Toggling an already-blocked student off is a direct action (no popup).
  const toggleStudentBlock = (s: any) => {
    if (isBlocked(s)) {
      unblockStudent(s);
    } else {
      openManageStudent(s);
    }
  };

  // ─── Manage-access popup actions ───

  const closeManagePopup = () => {
    if (manageBusy) return;
    setManageTarget(null);
    setManageMode('choose');
    setDeleteConfirmText('');
  };

  const confirmBlockFromPopup = async () => {
    if (!manageTarget) return;
    setManageBusy(true);
    try {
      await api.blockUser(manageTarget.id, true);
      onUpdate({ id: manageTarget.id, blocked: 1 });
      toast({
        title: 'Student blocked',
        description: `${manageTarget.name} has been signed out and can no longer log in. Their data is preserved — unblock anytime.`,
      });
      closeManagePopup();
    } catch (e: any) {
      toast({
        title: 'Could not block user',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setManageBusy(false);
    }
  };

  const confirmDeleteFromPopup = async () => {
    if (!manageTarget) return;
    // Safety gate: the typed confirmation must match the user's name.
    if (deleteConfirmText.trim().toLowerCase() !== (manageTarget.name || '').trim().toLowerCase()) {
      toast({
        title: 'Name does not match',
        description: 'Type the name exactly as shown to confirm permanent deletion.',
        variant: 'destructive',
      });
      return;
    }
    setManageBusy(true);
    try {
      await api.deleteUser(manageTarget.id);
      onUpdate({ id: manageTarget.id, deleted: true });
      toast({
        title: 'Student deleted',
        description: `${manageTarget.name}'s login and all associated data have been permanently removed.`,
      });
      closeManagePopup();
    } catch (e: any) {
      toast({
        title: 'Could not delete user',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setManageBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Logins"
        subtitle="Issue login credentials to enrolled students after fee payment, edit portal details, and block / unblock access."
      />

      {/* Info callout — when to issue logins */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex gap-3">
        <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-900">Per spec §3 — when to issue logins.</p>
          <p className="mt-1">
            Student logins are created by the Accountant after the first fee payment is
            confirmed. The username is the student&apos;s roll number and the password is a
            system-generated default that the student must change on first sign-in.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Students" value={stats.total} sub="Enrolled" />
        <StatCard icon={KeyRound} label="With Login" value={stats.with} sub="Credentials issued" />
        <StatCard
          icon={AlertCircle}
          label="Without Login"
          value={stats.without}
          sub="Awaiting first payment"
        />
      </div>

      {/* Bulk generate logins — one-click fix for "students can't log in".
          Shows when there are students without logins. Generates a real roll
          number + email + password for every student in the branch who is
          missing credentials. The result sheet lists all newly-issued
          credentials so the officer can print / distribute. */}
      {stats.without > 0 && (
        <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#F26522] to-[#D4541E] grid place-items-center shrink-0 shadow-sm">
                <KeyRound className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  {stats.without} student{stats.without === 1 ? '' : 's'} can&apos;t log in yet
                </p>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                  Generate login credentials (roll number + password) for all of them in one click.
                  Students will use their roll number as the username.
                </p>
              </div>
            </div>
            <Button
              className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-10 px-4 text-sm font-medium shadow-sm shrink-0"
              onClick={bulkGenerate}
              disabled={bulkBusy}
            >
              {bulkBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Generate All Missing Logins
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Bulk generate result sheet — shows the full credentials list after
          a bulk generate run, with a "copy all to clipboard" button so the
          officer can paste into Excel / print for distribution. */}
      {bulkResult && (
        <div className="rounded-xl border border-emerald-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 grid place-items-center shrink-0">
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {bulkResult.generated > 0
                    ? `${bulkResult.generated} login${bulkResult.generated === 1 ? '' : 's'} generated`
                    : 'All students already have logins'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bulkResult.generated} new · {bulkResult.skipped} already had logins · {bulkResult.total} total students
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {bulkResult.credentials?.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={copyBulkToClipboard}
                >
                  {bulkCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy all
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setBulkResult(null)}
              >
                Close
              </Button>
            </div>
          </div>
          {bulkResult.credentials?.length > 0 ? (
            <div className="max-h-80 overflow-y-auto pr-1 -mr-1 space-y-1.5">
              {bulkResult.credentials.map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[#F26522]/10 to-[#F26522]/5 grid place-items-center shrink-0">
                      <GraduationCap className="h-3.5 w-3.5 text-[#F26522]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-[11px] text-gray-500">Roll #{c.rollNo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px]">
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block leading-none mb-0.5">User</span>
                      <span className="font-mono font-semibold text-gray-900">{c.rollNo}</span>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px]">
                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block leading-none mb-0.5">Pass</span>
                      <span className="font-mono font-semibold text-gray-900">{c.password}</span>
                    </div>
                    <CopyButton text={`Roll #: ${c.rollNo}\nPassword: ${c.password}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">
              No new logins needed — every student already has credentials.
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll #, or class…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className={`${inputCls} w-full sm:w-48`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              <SelectItem value="with">With login</SelectItem>
              <SelectItem value="without">Without login</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Student list */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        {loading ? (
          <SkeletonTable rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title={students.length === 0 ? 'No students enrolled' : 'No matching students'}
            desc={
              students.length === 0
                ? 'The Admission Office must enroll students first.'
                : 'Try a different search or filter.'
            }
          />
        ) : (
          <div className="space-y-2 max-h-[40rem] overflow-y-auto pr-1">
            {filtered.map((s) => {
              const hasLogin = hasRealLogin(s);
              const creds = generated[s.id];
              const blocked = isBlocked(s);
              return (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg border border-gray-200 bg-gray-50 grid place-items-center shrink-0">
                      <GraduationCap className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        {blocked ? <BlockedBadge /> : null}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {s.rollNo} · {s.class || '—'}
                        {s.section ? `-${s.section}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {creds ? (
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="rounded-lg border border-emerald-100 bg-white px-3 py-1.5 text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-gray-400 block">
                            Username (Roll #)
                          </span>
                          <span className="font-mono font-semibold text-gray-900 flex items-center gap-2">
                            {creds.rollNo}
                            <CopyButton text={creds.rollNo} />
                          </span>
                        </div>
                        <div className="rounded-lg border border-emerald-100 bg-white px-3 py-1.5 text-xs">
                          <span className="text-[10px] uppercase tracking-wider text-gray-400 block">
                            Password
                          </span>
                          <span className="font-mono font-semibold text-gray-900 flex items-center gap-2">
                            {creds.password}
                            <CopyButton text={creds.password} />
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-100 gap-1"
                        >
                          <Check className="h-3 w-3" /> Login Ready
                        </Badge>
                      </div>
                    ) : hasLogin ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-100 gap-1"
                      >
                        <Check className="h-3 w-3" /> Login Active
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Optional manual roll-number override. If left blank,
                            the server auto-assigns the next branch-sequential
                            roll number (1001, 1002, …). This fixes the bug
                            where students had no roll number and could not
                            log in. */}
                        <input
                          type="text"
                          value={rollInputs[s.id] || ''}
                          onChange={(e) =>
                            setRollInputs((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          placeholder="Roll # (auto)"
                          className="h-8 w-[120px] rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none focus:border-[#F26522] focus:ring-2 focus:ring-[#F26522]/30 placeholder:text-gray-400"
                        />
                        <Button
                          size="sm"
                          className="bg-[#F26522] hover:bg-[#D4541E] text-white rounded-lg h-8 px-3 text-xs font-medium"
                          onClick={() => generate(s)}
                          disabled={creating === s.id}
                          title="Generate login. Leave roll # blank to auto-assign the next sequential number."
                        >
                          {creating === s.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…
                            </>
                          ) : (
                            <>
                              <KeyRound className="h-3.5 w-3.5 mr-1" /> Generate Login
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Edit portal details */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 rounded-lg h-8 px-3 text-xs font-medium"
                      onClick={() => openEditStudent(s)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>

                    {/* Block / Unblock login */}
                    {blocked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border border-emerald-100 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg h-8 px-3 text-xs font-medium"
                        onClick={() => toggleStudentBlock(s)}
                        disabled={blockingStudentId === s.id}
                      >
                        {blockingStudentId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5 mr-1" />
                        )}
                        Unblock
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg h-8 px-3 text-xs font-medium"
                        onClick={() => toggleStudentBlock(s)}
                        disabled={blockingStudentId === s.id}
                      >
                        {blockingStudentId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 mr-1" />
                        )}
                        Block
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Student Edit Sheet ===== */}
      <Sheet
        open={!!editStudent}
        onOpenChange={(o) => !o && setEditStudent(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-white">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold text-gray-900">
              Edit Student Portal
            </SheetTitle>
            <SheetDescription className="text-sm text-gray-500">
              Update name, roll number, credentials, and contact details.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required>
                <Input
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  className={inputCls}
                  placeholder="Student name"
                />
              </Field>
              <Field label="Roll Number" required>
                <Input
                  value={studentForm.rollNo}
                  onChange={(e) => setStudentForm({ ...studentForm, rollNo: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. 10-A-001"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={studentForm.email}
                  onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                  className={inputCls}
                  placeholder="username@concordia.edu.pk"
                />
              </Field>
              <Field label="Password">
                <div className="relative">
                  <Input
                    type={revealStudentPw ? 'text' : 'password'}
                    value={studentForm.password}
                    onChange={(e) =>
                      setStudentForm({ ...studentForm, password: e.target.value })
                    }
                    className={`${inputCls} pr-24`}
                    placeholder="Leave blank to keep current"
                  />
                  <button
                    type="button"
                    onClick={revealStudentPassword}
                    disabled={studentPwLoading}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium text-gray-500 hover:text-[#F26522] rounded-md hover:bg-gray-50 disabled:opacity-60"
                  >
                    {studentPwLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : revealStudentPw ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {revealStudentPw ? 'Hide' : 'Reveal'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Tap Reveal to fetch the current password from the server.
                </p>
              </Field>
              <Field label="Class">
                <Input
                  value={studentForm.class}
                  onChange={(e) => setStudentForm({ ...studentForm, class: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Grade 10"
                />
              </Field>
              <Field label="Section">
                <Input
                  value={studentForm.section}
                  onChange={(e) => setStudentForm({ ...studentForm, section: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. A"
                />
              </Field>
              <Field label="Father / Guardian">
                <Input
                  value={studentForm.guardian}
                  onChange={(e) => setStudentForm({ ...studentForm, guardian: e.target.value })}
                  className={inputCls}
                  placeholder="Father or guardian name"
                />
              </Field>
              <Field label="Contact">
                <Input
                  value={studentForm.guardianPhone}
                  onChange={(e) =>
                    setStudentForm({ ...studentForm, guardianPhone: e.target.value })
                  }
                  className={inputCls}
                  placeholder="03xx-xxxxxxx"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="CNIC">
                  <Input
                    value={studentForm.cnic}
                    onChange={(e) => setStudentForm({ ...studentForm, cnic: e.target.value })}
                    className={inputCls}
                    placeholder="xxxxx-xxxxxxx-x"
                  />
                </Field>
              </div>
            </div>
          </div>

          <SheetFooter>
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={() => setEditStudent(null)}
                className={cn(btnSecondary, 'justify-center h-10')}
              >
                Cancel
              </button>
              <button
                onClick={saveStudent}
                disabled={savingStudent}
                className={cn(btnPrimary, 'justify-center h-10')}
              >
                {savingStudent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save Changes
              </button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ===== Manage-access popup =====
          Opens when the accountant clicks "Block" on a student whose login
          is currently active. Offers two choices:
            • Block           — temporary; data kept, can be unblocked.
            • Delete forever  — permanent; login + all data erased.
          Delete requires typing the user's name to confirm. */}
      <AlertDialog open={!!manageTarget} onOpenChange={(o) => !o && closeManagePopup()}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
              <ShieldBan className="h-5 w-5 text-[#F26522]" />
              Manage Student Access
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-gray-600">
                Choose what to do with{' '}
                <span className="font-semibold text-gray-900">
                  {manageTarget?.name || 'this student'}
                </span>
                &apos;s login.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* User summary card */}
          {manageTarget && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-gray-400">
                  Student
                </span>
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Login active
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-900">{manageTarget.name}</div>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span>ID: {manageTarget.rollNo || '—'}</span>
                {manageTarget.class ? (
                  <span>Class: {manageTarget.class}{manageTarget.section ? `-${manageTarget.section}` : ''}</span>
                ) : null}
                {manageTarget.email ? <span className="truncate">{manageTarget.email}</span> : null}
              </div>
            </div>
          )}

          {/* ─── Choice view ─── */}
          {manageMode === 'choose' && (
            <div className="space-y-3">
              {/* Block option */}
              <button
                type="button"
                onClick={confirmBlockFromPopup}
                disabled={manageBusy}
                className="w-full text-left rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 hover:border-amber-300 transition-colors p-4 group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
                    {manageBusy ? (
                      <Loader2 className="h-4 w-4 text-amber-700 animate-spin" />
                    ) : (
                      <Ban className="h-4 w-4 text-amber-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-amber-900">Block login</div>
                    <p className="text-[12px] text-amber-800/90 mt-0.5 leading-relaxed">
                      They&apos;ll be signed out and can&apos;t log in until you unblock them.
                      <span className="font-medium"> Their data is preserved</span> —
                      attendance, results, fees, everything stays. Reversible anytime.
                    </p>
                  </div>
                </div>
              </button>

              {/* Delete option */}
              <button
                type="button"
                onClick={() => setManageMode('confirm-delete')}
                disabled={manageBusy}
                className="w-full text-left rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100/70 hover:border-rose-300 transition-colors p-4 group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 group-hover:bg-rose-200 transition-colors">
                    <Trash2 className="h-4 w-4 text-rose-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-rose-900">Delete permanently</div>
                    <p className="text-[12px] text-rose-800/90 mt-0.5 leading-relaxed">
                      Permanently deletes the login{' '}
                      <span className="font-medium">and all their data</span> —
                      fee invoices, misc charges, attendance &amp; results entries are erased.
                      <span className="font-semibold"> This cannot be undone.</span>
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ─── Delete confirmation view ─── */}
          {manageMode === 'confirm-delete' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex gap-2.5">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-[12px] text-rose-800 leading-relaxed">
                  You are about to <span className="font-semibold">permanently delete</span>{' '}
                  <span className="font-semibold">{manageTarget?.name}</span> and{' '}
                  all their fee, attendance, and result records.
                  This action <span className="font-semibold">cannot be undone</span>.
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-700 mb-1.5 block">
                  Type the name{' '}
                  <span className="text-rose-600 font-bold">{manageTarget?.name}</span> to confirm
                </Label>
                <Input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="border-rose-200 focus-visible:ring-rose-300"
                  placeholder={manageTarget?.name || ''}
                  autoFocus
                  disabled={manageBusy}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setManageMode('choose')}
                  disabled={manageBusy}
                  className="flex-1 h-9 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteFromPopup}
                  disabled={
                    manageBusy ||
                    deleteConfirmText.trim().toLowerCase() !==
                      (manageTarget?.name || '').trim().toLowerCase()
                  }
                  className="flex-1 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {manageBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete forever
                </button>
              </div>
            </div>
          )}

          {/* Footer (only on choice view) */}
          {manageMode === 'choose' && (
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={manageBusy}
                className="mt-0"
              >
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

