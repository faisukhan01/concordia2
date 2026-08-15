'use client';

// ============================================================================
// Concordia College — Biometric Attendance (ZKTeco gate terminal)
//
// One component, four role modes (design language matches the other portals:
// flat, grayscale + single #F26522 orange accent, white cards on 1px borders,
// uppercase muted table headers). Everything is responsive — the Flutter app
// is a WebView of this same site.
//
//   mode='admin'      — device health, live punch feed, unmapped-PIN alert,
//                       daily register + manual override, reports, settings,
//                       holidays, recompute.
//   mode='accountant' — read-only monthly summary + defaulter list.
//   mode='admission'  — enrollment queue + Allocate PIN (with on-device steps).
//   mode='student'    — own monthly calendar + stats (also used by parents).
// ============================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useUiState } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
// NOTE: xlsx + jspdf are heavy (~1MB combined). They are imported LAZILY inside
// the export handlers below (await import) so they never enter the initial
// bundle — this component is loaded by every portal, incl. the student app.
import {
  Fingerprint, Radio, AlertTriangle, Clock, CheckCircle2,
  CalendarDays, Settings as SettingsIcon, RefreshCw, Copy, Search, Loader2,
  Wifi, WifiOff, Download, Trash2, Plus, ArrowRight, Users,
} from 'lucide-react';
import {
  DeptCardGrid, PartToggle, SectionCardGrid, HierarchyBreadcrumb, deptLabel,
} from './concordia-hierarchy';

type Props = { user: any; mode: 'admin' | 'accountant' | 'academic' | 'admission' | 'student' };

const ORANGE = '#F26522';
const DEPARTMENTS = ['FSC Pre Med', 'FSC Pre Eng', 'ICS Phy', 'ICS Stats', 'FA IT', 'I.Com'];
const SCROLLBAR_CLS =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300';

// ───────────────────────── shared bits ─────────────────────────

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="h-0.5 w-8 rounded-full mb-3" style={{ background: ORANGE }} />
        <h1 className="text-2xl font-bold text-[#1A1A1A] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-gray-200 rounded-xl p-4 sm:p-5', className)}>{children}</div>
  );
}

/** Today's date (YYYY-MM-DD) in Asia/Karachi. */
function todayKarachi(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}
function monthKarachi(): string {
  return todayKarachi().slice(0, 7);
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  late: { label: 'Late', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  half_day: { label: 'Half Day', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  absent: { label: 'Absent', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  leave: { label: 'Leave', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  holiday: { label: 'Holiday', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  not_marked: { label: 'Not marked', cls: 'bg-gray-50 text-gray-400 border-gray-200' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.not_marked;
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', s.cls)}>{s.label}</span>;
}

/** '8:05 AM' from a UTC ISO string, in Asia/Karachi. */
function clockPK(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Download check-in/out history as Excel — Last week / Last month / Complete.
// Staff → the whole section; student → their own. Range floored at go-live.
// ═══════════════════════════════════════════════════════════════════════════

const BIO_START = '2026-08-17'; // college biometric go-live — no data before this

function historyRange(kind: 'week' | 'month' | 'all'): { from: string; to: string } {
  const to = todayKarachi();
  if (kind === 'all') return { from: BIO_START, to };
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (kind === 'week' ? 7 : 30));
  let from = d.toISOString().slice(0, 10);
  if (from < BIO_START) from = BIO_START;
  return { from, to };
}

function HistoryDownload({ program, part, section, studentMode }: {
  program?: string; part?: string; section?: string; studentMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (kind: 'week' | 'month' | 'all') => {
    setBusy(kind);
    try {
      const { from, to } = historyRange(kind);
      const XLSX = await import('xlsx');
      let rows: any[] = [];
      let fname = '';
      if (studentMode) {
        const data = await api.bioStudentHistory('me');
        rows = (data.entries || [])
          .filter((e: any) => e.date >= from && e.date <= to)
          .sort((a: any, b: any) => a.date.localeCompare(b.date))
          .map((e: any) => ({
            Date: e.date, 'Check-in': clockPK(e.check_in_at), 'Check-out': clockPK(e.check_out_at),
            Status: STATUS_STYLES[e.status]?.label || e.status, 'Minutes Late': e.minutes_late || 0,
          }));
        fname = `MyGateAttendance_${from}_to_${to}.xlsx`;
      } else {
        const data = await api.bioHistory({ program, part, section, from, to });
        rows = (data.rows || []).map((r: any) => ({
          'Roll No': r.rollNo || '', Name: r.name, Class: deptLabel(r.class), Section: r.section, Part: r.part,
          Date: r.date, 'Check-in': clockPK(r.check_in_at), 'Check-out': clockPK(r.check_out_at),
          Status: STATUS_STYLES[r.status]?.label || r.status, 'Minutes Late': r.minutes_late || 0,
        }));
        fname = `GateAttendance_${section ? deptLabel(program || '') + '_P' + part + '_' + section + '_' : ''}${from}_to_${to}.xlsx`;
      }
      if (rows.length === 0) {
        toast({ title: 'No records', description: `No check-in/out records between ${from} and ${to}.` });
        setOpen(false); return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Check-in History');
      XLSX.writeFile(wb, fname);
      toast({ title: 'Excel downloaded', description: `${rows.length} record${rows.length === 1 ? '' : 's'}.` });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Could not download', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const options: [('week' | 'month' | 'all'), string][] = [
    ['week', 'Last week'], ['month', 'Last month'], ['all', 'Complete (since 17 Aug)'],
  ];

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <Download className="w-3.5 h-3.5 mr-1.5" /> Download History
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-1">
            <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400">Download as Excel</p>
            {options.map(([k, label]) => (
              <button key={k} onClick={() => download(k)} disabled={!!busy}
                className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-orange-50 flex items-center gap-2 disabled:opacity-60">
                {busy === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5 text-gray-400" />}
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Root — routes to the correct mode.
// ═══════════════════════════════════════════════════════════════════════════

export default function BiometricAttendance({ user, mode }: Props) {
  // Stable per-portal key so the drill/position survives reload + Back button
  // (mirrored into history + persisted storage by the app's nav layer).
  const navKey = `bio-${mode}`;
  return (
    <div className="space-y-6">
      {mode === 'admin' && <AdminView user={user} navKey={navKey} />}
      {(mode === 'accountant' || mode === 'academic') && <StaffReadOnlyView navKey={navKey} />}
      {mode === 'admission' && <EnrollmentView navKey={navKey} />}
      {mode === 'student' && <StudentCalendarView user={user} navKey={navKey} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — full control.
// ═══════════════════════════════════════════════════════════════════════════

function AdminView({ user, navKey }: { user: any; navKey: string }) {
  return (
    <>
      <PageHeader title="Biometric Attendance" subtitle="Fingerprint gate terminal · live feed, register, reports & settings" />
      <DeviceHealthCard />
      <Tabs defaultValue="live" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="live">Live Feed</TabsTrigger>
          <TabsTrigger value="register">Daily Register</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="mt-4"><LiveFeedTab /></TabsContent>
        <TabsContent value="register" className="mt-4">
          <SectionDrill navKey={`${navKey}-reg`}>{(sel, enroll, reload) => <SectionRegister {...sel} enroll={enroll} reloadEnroll={reload} />}</SectionDrill>
        </TabsContent>
        <TabsContent value="reports" className="mt-4"><SummaryView user={user} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
        <TabsContent value="holidays" className="mt-4"><HolidaysTab /></TabsContent>
      </Tabs>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : 'text-[#1A1A1A]';
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className={cn('text-xl font-bold mt-0.5', color)}>{value}</p>
    </div>
  );
}

function DeviceHealthCard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await api.bioDeviceStatus()); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const dev = data?.device;
  const online = data?.online;
  const lastSeen = dev?.last_heartbeat_at ? clockPK(dev.last_heartbeat_at) + ' PKT' : 'never';

  return (
    <Card className={cn('border-l-4', online ? 'border-l-emerald-500' : 'border-l-rose-500')}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {online ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#1A1A1A]">{dev?.label || 'Main Gate'}</h3>
              <Badge className={cn('border', online ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200')}>
                {loading ? 'checking…' : online ? 'Online' : 'Offline'}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {dev?.serial_number || '—'} · {dev?.ip_address || '—'} · fw {dev?.firmware || '—'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
      </div>
      {!online && !loading && (
        <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          No heartbeat in the last 3 minutes. The on-site bridge may be down — check that <code>python bridge.py</code> is running on the college network.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-100">
        <Stat label="Queue depth" value={dev?.queue_depth ?? 0} tone={(dev?.queue_depth ?? 0) > 0 ? 'warn' : 'ok'} />
        <Stat label="Device log" value={dev?.device_log_count ?? 0} />
        <Stat label="Punches today" value={data?.todayPunches ?? 0} />
        <Stat label="Enrolled" value={data?.enrolled ?? 0} />
        <Stat label="Unmapped PINs" value={data?.unmappedPins ?? 0} tone={(data?.unmappedPins ?? 0) > 0 ? 'bad' : 'ok'} />
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Last seen {lastSeen} · auto-refreshes every 15s</p>
    </Card>
  );
}

function LiveFeedTab() {
  const [punches, setPunches] = useState<any[]>([]);
  const [unmapped, setUnmapped] = useState<any[]>([]);
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([api.bioLivePunches(), api.bioUnmappedPins()]);
      setPunches(p || []); setUnmapped(u || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  return (
    <div className="space-y-4">
      {unmapped.length > 0 && (
        <Card className="border-l-4 border-l-rose-500 bg-rose-50/40">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <h3 className="font-semibold text-rose-700">{unmapped.length} unmapped PIN{unmapped.length > 1 ? 's' : ''} — attendance is being lost</h3>
          </div>
          <p className="text-xs text-gray-600 mb-3">These PINs punched at the gate but aren&apos;t linked to any student. Assign each one so its attendance is recorded.</p>
          <div className={cn('space-y-2 max-h-56 overflow-y-auto', SCROLLBAR_CLS)}>
            {unmapped.map((u) => (
              <div key={u.pin} className="flex items-center justify-between gap-3 bg-white border border-rose-200 rounded-lg px-3 py-2">
                <div className="text-sm">
                  <span className="font-mono font-semibold">{u.pin}</span>
                  <span className="text-gray-400 ml-2">{u.punches} punch{u.punches > 1 ? 'es' : ''} · last {clockPK(u.lastSeen)}</span>
                </div>
                <Button size="sm" onClick={() => setAssignFor(u.pin)} style={{ background: ORANGE }} className="text-white hover:opacity-90">
                  Assign to student
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4" style={{ color: ORANGE }} />
          <h3 className="font-semibold text-[#1A1A1A]">Live punch feed</h3>
          <span className="text-xs text-gray-400">last 50 · auto-refresh 15s</span>
        </div>
        <div className={cn('max-h-[28rem] overflow-y-auto', SCROLLBAR_CLS)}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="uppercase text-[11px] text-gray-400">Time</TableHead>
                <TableHead className="uppercase text-[11px] text-gray-400">PIN</TableHead>
                <TableHead className="uppercase text-[11px] text-gray-400">Student</TableHead>
                <TableHead className="uppercase text-[11px] text-gray-400">Class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {punches.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-gray-400 py-8">No punches yet. Put a finger on the sensor.</TableCell></TableRow>
              )}
              {punches.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{clockPK(p.punched_at)}<span className="text-gray-400 text-xs ml-1">{p.local_date}</span></TableCell>
                  <TableCell className="font-mono">{p.pin}</TableCell>
                  <TableCell>{p.studentName || <span className="text-rose-600 font-medium">Unmapped</span>}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{p.class ? `${p.class}${p.section ? ' · ' + p.section : ''}` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AssignPinDialog pin={assignFor} onClose={() => setAssignFor(null)} onDone={load} />
    </div>
  );
}

function AssignPinDialog({ pin, onClose, onDone }: { pin: string | null; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pin) return;
    setQ('');
    (async () => { try { setStudents(await api.bioEnrollment()); } catch { setStudents([]); } })();
  }, [pin]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return students.slice(0, 30);
    return students.filter((s) => `${s.name} ${s.rollNo || ''} ${s.class || ''}`.toLowerCase().includes(t)).slice(0, 30);
  }, [q, students]);

  const assign = async (studentId: string) => {
    if (!pin) return;
    setBusy(true);
    try {
      const r = await api.bioAssignPin(pin, studentId);
      toast({ title: 'PIN assigned', description: `Backfilled & recomputed ${r.datesRecomputed} day(s).` });
      onDone(); onClose();
    } catch (e: any) {
      toast({ title: 'Could not assign', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!pin} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Assign PIN <span className="font-mono">{pin}</span> to a student</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input autoFocus placeholder="Search name, roll no or class…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className={cn('max-h-72 overflow-y-auto space-y-1 mt-2', SCROLLBAR_CLS)}>
          {filtered.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => assign(s.id)}
              className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-[#F26522] hover:bg-orange-50/40 transition">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{s.name}</p>
                <p className="text-xs text-gray-400 truncate">{s.rollNo || '—'} · {s.class || '—'} {s.section || ''} {s.pin ? `· PIN ${s.pin}` : ''}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-6">No matching students.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Shared Program → Part → Section drill-down. Once a section is opened it
// renders `children(selection, enroll, reload)` — so the Daily Register and
// Monthly Summary tabs appear AFTER opening a section (one shared drill-down).
function SectionDrill({ navKey, children }: {
  navKey: string;
  children: (sel: { program: string; part: string; section: string }, enroll: any[], reload: () => Promise<void>) => React.ReactNode;
}) {
  const [enroll, setEnroll] = useState<any[]>([]);
  // Drill state lives in the app's nav layer so it survives page reload AND
  // steps through the Back button — same as every other drill-down page.
  const [drill, setDrill] = useUiState<{ dept: string | null; part: string; section: string | null }>(navKey, { dept: null, part: '1', section: null });
  const { dept, part, section } = drill;
  const setDept = (d: string | null) => setDrill((p) => ({ ...p, dept: d }));
  const setPart = (p2: string) => setDrill((p) => ({ ...p, part: p2 }));
  const setSection = (s: string | null) => setDrill((p) => ({ ...p, section: s }));

  const reload = useCallback(async () => { try { setEnroll(await api.bioEnrollment()); } catch { /* ignore */ } }, []);
  useEffect(() => { reload(); }, [reload]);

  const countsByDept = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of enroll) m[e.class] = (m[e.class] || 0) + 1;
    return m;
  }, [enroll]);
  const sectionCards = useMemo(() => {
    if (!dept) return [];
    const set = new Map<string, { id: string; name: string; section: string }>();
    for (const e of enroll) if (e.class === dept && (e.part || '1') === part && e.section) set.set(e.section, { id: e.section, name: dept, section: e.section });
    return [...set.values()];
  }, [enroll, dept, part]);
  const sectionCount = useCallback((sec: string) => enroll.filter((e) => e.class === dept && (e.part || '1') === part && e.section === sec).length, [enroll, dept, part]);

  // Leaf — a section is open: breadcrumb + back, then the caller's tabs/table.
  if (dept && section) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <HierarchyBreadcrumb dept={dept} part={part} section={section} onClear={() => { setDept(null); setSection(null); }} />
          <button onClick={() => setSection(null)} className="text-sm text-gray-500 hover:text-[#1A1A1A]">← Sections</button>
        </div>
        {children({ program: dept, part, section }, enroll, reload)}
      </div>
    );
  }

  // Picker — programs, then part + section cards.
  return (
    <Card>
      <HierarchyBreadcrumb dept={dept} part={dept ? part : null} section={null} onClear={() => { setDept(null); setSection(null); }} />
      {!dept
        ? <DeptCardGrid onSelect={(d) => { setDept(d); setSection(null); }} studentCounts={countsByDept} />
        : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => { setDept(null); setSection(null); }} className="text-sm text-gray-500 hover:text-[#1A1A1A]">← Programs</button>
              <PartToggle value={part} onChange={(p) => { setPart(p); setSection(null); }} />
            </div>
            {sectionCards.length > 0
              ? <SectionCardGrid sections={sectionCards} onSelect={(s) => setSection(s.section)} getStudentCount={(id) => sectionCount(id)} />
              : <p className="text-sm text-gray-400 py-6 text-center">No enrolled sections found for {deptLabel(dept)} · Part {part}.</p>}
          </div>
        )}
    </Card>
  );
}

// The daily check-in/check-out register for ONE section + date, with the
// "Allocate PIN to whole section" action (API enforces the role).
function SectionRegister({ program, part, section, enroll, reloadEnroll, readOnly }: {
  program: string; part: string; section: string; enroll: any[]; reloadEnroll: () => Promise<void>; readOnly?: boolean;
}) {
  const [date, setDate] = useState(todayKarachi());
  const [status, setStatus] = useState('all');
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [override, setOverride] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const loadRows = useCallback(async () => {
    setLoadingRows(true);
    try {
      const r = await api.bioRegister({ date, program, part, section, status: status === 'all' ? undefined : status });
      setRows(r.entries || []);
    } catch (e: any) {
      toast({ title: 'Could not load register', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setLoadingRows(false); }
  }, [date, program, part, section, status]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const sectionPending = useMemo(
    () => enroll.filter((e) => e.class === program && (e.part || '1') === part && e.section === section && !e.pinAllocated),
    [enroll, program, part, section],
  );

  const allocateSection = async () => {
    if (sectionPending.length === 0) return;
    setBusy(true);
    try {
      const r = await api.bioAllocateSection(program, part, section);
      toast({ title: 'Section PINs allocated', description: `${r.allocated} student${r.allocated === 1 ? '' : 's'} in ${deptLabel(program)} · P${part} · ${section} now have a PIN.` });
      await reloadEnroll(); await loadRows();
    } catch (e: any) {
      toast({ title: 'Could not allocate', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><Label className="text-xs text-gray-500">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></div>
        <div>
          <Label className="text-xs text-gray-500">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {['present', 'late', 'half_day', 'absent', 'leave', 'holiday', 'not_marked'].map((s) => (
                <SelectItem key={s} value={s}>{STATUS_STYLES[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={loadRows}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />{loadingRows ? 'Loading…' : 'Refresh'}</Button>
        <HistoryDownload program={program} part={part} section={section} />
      </div>

      {sectionPending.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-orange-50/60 border border-orange-100 rounded-lg px-3 py-2 flex-wrap mb-4">
          <span className="text-sm text-gray-600"><Users className="w-3.5 h-3.5 inline mr-1" />{sectionPending.length} student{sectionPending.length === 1 ? '' : 's'} in this section have no device PIN yet.</span>
          <Button size="sm" onClick={allocateSection} disabled={busy} style={{ background: ORANGE }} className="text-white hover:opacity-90">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Fingerprint className="w-3.5 h-3.5 mr-1.5" />}
            Allocate PIN to whole section ({sectionPending.length})
          </Button>
        </div>
      )}

      <div className={cn('max-h-[30rem] overflow-y-auto', SCROLLBAR_CLS)}>
        <Table>
          <TableHeader>
            <TableRow>
              {['Student', 'Class', 'PIN', 'Check-in', 'Check-out', 'Status', ...(readOnly ? [] : [''])].map((h, i) => (
                <TableHead key={h || `act${i}`} className="uppercase text-[11px] text-gray-400">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={readOnly ? 6 : 7} className="text-center text-gray-400 py-8">{loadingRows ? 'Loading…' : 'No enrolled students in this section yet — allocate PINs above.'}</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.studentId}>
                <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-gray-400">{r.rollNo || '—'}</div></TableCell>
                <TableCell className="text-sm text-gray-500">{deptLabel(r.class)} {r.section} · P{r.part || '1'}</TableCell>
                <TableCell className="font-mono text-sm">{r.pin || '—'}</TableCell>
                <TableCell className="text-emerald-700 font-medium">{clockPK(r.check_in_at)}{r.minutes_late > 0 && <span className="text-amber-600 text-xs ml-1">+{r.minutes_late}m</span>}</TableCell>
                <TableCell className="text-sky-700">{clockPK(r.check_out_at)}</TableCell>
                <TableCell><StatusBadge status={r.status} />{r.source === 'manual' && <span className="text-[10px] text-gray-400 ml-1">(manual)</span>}</TableCell>
                {!readOnly && <TableCell><Button variant="ghost" size="sm" onClick={() => setOverride(r)}>Override</Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!readOnly && <OverrideDialog row={override} date={date} onClose={() => setOverride(null)} onDone={loadRows} />}
    </Card>
  );
}

// Monthly attendance summary for ONE section (% per student + Excel/PDF export).
function SectionSummary({ program, part, section }: { program: string; part: string; section: string }) {
  const [month, setMonth] = useState(monthKarachi());
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.bioSummary({ month, program, section });
      // The summary API filters by program + section; narrow to the part here.
      setStudents((r.students || []).filter((s: any) => (s.part || '1') === part));
    } catch (e: any) {
      toast({ title: 'Could not load summary', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [month, program, section, part]);
  useEffect(() => { load(); }, [load]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = students.map((s) => ({
      Name: s.name, 'Roll No': s.rollNo || '', Class: deptLabel(s.class), Section: s.section, Part: s.part,
      Present: s.present, Late: s.late, 'Half Day': s.half_day, Absent: s.absent, 'Attendance %': s.percentage,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_${deptLabel(program)}_P${part}_${section}_${month}.xlsx`);
    toast({ title: 'Excel exported', description: `${rows.length} students.` });
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><Label className="text-xs text-gray-500">Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" /></div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportExcel}><Download className="w-3.5 h-3.5 mr-1.5" />Excel</Button>
      </div>
      <div className={cn('max-h-[30rem] overflow-y-auto', SCROLLBAR_CLS)}>
        <Table>
          <TableHeader>
            <TableRow>{['Student', 'Present', 'Late', 'Half', 'Absent', '%'].map((h) => <TableHead key={h} className="uppercase text-[11px] text-gray-400">{h}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {students.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">{loading ? 'Loading…' : 'No attendance recorded for this section this month yet.'}</TableCell></TableRow>}
            {students.map((s) => (
              <TableRow key={s.studentId}>
                <TableCell><div className="font-medium">{s.name}</div><div className="text-xs text-gray-400">{s.rollNo || '—'}</div></TableCell>
                <TableCell className="text-emerald-600 font-medium">{s.present}</TableCell>
                <TableCell className="text-amber-600">{s.late}</TableCell>
                <TableCell className="text-orange-600">{s.half_day}</TableCell>
                <TableCell className="text-rose-600 font-medium">{s.absent}</TableCell>
                <TableCell><span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', s.percentage < 75 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>{s.percentage}%</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// Read-only biometric view for Academic + Accountant offices. Drill
// Program → Part → Section FIRST; once a section is open, the Daily Register
// and Monthly Summary tabs appear scoped to that section. No device controls,
// no overrides, no settings.
function StaffReadOnlyView({ navKey }: { navKey: string }) {
  return (
    <>
      <PageHeader title="Biometric Attendance" subtitle="Open a Program → Part → Section to see its daily register and monthly summary" />
      <SectionDrill navKey={navKey}>
        {(sel, enroll, reload) => (
          <Tabs defaultValue="register" className="w-full">
            <TabsList>
              <TabsTrigger value="register">Daily Register</TabsTrigger>
              <TabsTrigger value="summary">Monthly Summary</TabsTrigger>
            </TabsList>
            <TabsContent value="register" className="mt-4"><SectionRegister {...sel} enroll={enroll} reloadEnroll={reload} readOnly /></TabsContent>
            <TabsContent value="summary" className="mt-4"><SectionSummary {...sel} /></TabsContent>
          </Tabs>
        )}
      </SectionDrill>
    </>
  );
}

function OverrideDialog({ row, date, onClose, onDone }: { row: any | null; date: string; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState('present');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (row) { setStatus(row.status === 'not_marked' ? 'present' : row.status); setNote(row.note || ''); } }, [row]);

  const save = async () => {
    if (!row) return;
    setBusy(true);
    try {
      await api.bioOverride({ studentId: row.studentId, date, status, note });
      toast({ title: 'Override saved', description: `${row.name} marked ${STATUS_STYLES[status]?.label || status}.` });
      onDone(); onClose();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Manual override — {row?.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500 -mt-2">{date} · a manual override is never overwritten by the automatic recompute.</p>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs text-gray-500">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['present', 'late', 'half_day', 'absent', 'leave', 'holiday'].map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_STYLES[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the override…" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} style={{ background: ORANGE }} className="text-white hover:opacity-90">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTab() {
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [recompFrom, setRecompFrom] = useState(monthKarachi() + '-01');
  const [recompTo, setRecompTo] = useState(todayKarachi());
  const [recomping, setRecomping] = useState(false);

  useEffect(() => { (async () => { try { setS(await api.bioGetSettings()); } catch { /* ignore */ } })(); }, []);

  const days = (s?.working_days || '').split(',').filter(Boolean);
  const toggleDay = (d: number) => {
    const set = new Set(days.map(Number));
    if (set.has(d)) set.delete(d); else set.add(d);
    setS({ ...s, working_days: [...set].sort().join(',') });
  };

  const save = async () => {
    setBusy(true);
    try {
      const upd = await api.bioUpdateSettings({
        late_after_time: s.late_after_time,
        half_day_after_time: s.half_day_after_time,
        dedup_window_minutes: Number(s.dedup_window_minutes),
        working_days: s.working_days,
        notify_parents: s.notify_parents === 1 || s.notify_parents === true,
      });
      setS(upd);
      toast({ title: 'Settings saved' });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const runRecompute = async () => {
    setRecomping(true);
    try {
      const r = await api.bioRecompute(recompFrom, recompTo);
      toast({ title: 'Recompute complete', description: `${r.pairsRecomputed} student-day pairs rebuilt from raw punches.` });
    } catch (e: any) {
      toast({ title: 'Recompute failed', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setRecomping(false); }
  };

  if (!s) return <Card><p className="text-gray-400 text-sm">Loading settings…</p></Card>;
  const DAY_LABELS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 mb-4"><SettingsIcon className="w-4 h-4" style={{ color: ORANGE }} /><h3 className="font-semibold">Attendance rules</h3></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Late after (on-time until)</Label>
            <Input type="time" value={s.late_after_time} onChange={(e) => setS({ ...s, late_after_time: e.target.value })} />
            <p className="text-[11px] text-gray-400 mt-1">Check-in at or before this = Present.</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Half-day after</Label>
            <Input type="time" value={s.half_day_after_time} onChange={(e) => setS({ ...s, half_day_after_time: e.target.value })} />
            <p className="text-[11px] text-gray-400 mt-1">After this = Half day; between the two = Late.</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Dedup window (minutes)</Label>
            <Input type="number" min={0} value={s.dedup_window_minutes} onChange={(e) => setS({ ...s, dedup_window_minutes: e.target.value })} />
            <p className="text-[11px] text-gray-400 mt-1">Repeat touches within this window count once.</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Working days</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {DAY_LABELS.map(([v, l]) => (
                <button key={v} onClick={() => toggleDay(Number(v))}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border', days.includes(v) ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200')}
                  style={days.includes(v) ? { background: ORANGE } : undefined}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <Switch checked={s.notify_parents === 1 || s.notify_parents === true} onCheckedChange={(v) => setS({ ...s, notify_parents: v })} />
            <div><p className="text-sm font-medium">Notify parents on check-in</p><p className="text-[11px] text-gray-400">Push &ldquo;{'{name}'} checked in at 8:05 AM&rdquo; to the linked parent.</p></div>
          </div>
          <Button onClick={save} disabled={busy} style={{ background: ORANGE }} className="text-white hover:opacity-90">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save settings'}</Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3"><RefreshCw className="w-4 h-4" style={{ color: ORANGE }} /><h3 className="font-semibold">Recompute a date range</h3></div>
        <p className="text-xs text-gray-500 mb-3">Rebuilds attendance from the immutable raw punches. Manual overrides are preserved.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs text-gray-500">From</Label><Input type="date" value={recompFrom} onChange={(e) => setRecompFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs text-gray-500">To</Label><Input type="date" value={recompTo} onChange={(e) => setRecompTo(e.target.value)} className="w-40" /></div>
          <Button variant="outline" onClick={runRecompute} disabled={recomping}>{recomping ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}Recompute</Button>
        </div>
      </Card>
    </div>
  );
}

function HolidaysTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setRows(await api.bioGetHolidays()); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!date) { toast({ title: 'Pick a date', variant: 'destructive' }); return; }
    setBusy(true);
    try { await api.bioAddHoliday(date, name); setDate(''); setName(''); await load(); toast({ title: 'Holiday added' }); }
    catch (e: any) { toast({ title: 'Could not add', description: e?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const remove = async (idOrDate: string) => { try { await api.bioDeleteHoliday(idOrDate); await load(); } catch { /* ignore */ } };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4"><CalendarDays className="w-4 h-4" style={{ color: ORANGE }} /><h3 className="font-semibold">Holidays</h3></div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div><Label className="text-xs text-gray-500">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></div>
        <div className="flex-1 min-w-[10rem]"><Label className="text-xs text-gray-500">Name (optional)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Independence Day" /></div>
        <Button onClick={add} disabled={busy} style={{ background: ORANGE }} className="text-white hover:opacity-90"><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
      <div className={cn('space-y-1.5 max-h-72 overflow-y-auto', SCROLLBAR_CLS)}>
        {rows.length === 0 && <p className="text-gray-400 text-sm">No holidays yet.</p>}
        {rows.map((h) => (
          <div key={h.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-sm"><span className="font-medium">{h.date}</span>{h.name && <span className="text-gray-500 ml-2">{h.name}</span>}</div>
            <Button variant="ghost" size="sm" onClick={() => remove(String(h.id))}><Trash2 className="w-4 h-4 text-rose-500" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY / REPORTS — shared by admin (Reports tab) and accountant (read-only).
// ═══════════════════════════════════════════════════════════════════════════

function SummaryView({ user, readOnly }: { user: any; readOnly?: boolean }) {
  const [month, setMonth] = useState(monthKarachi());
  const [program, setProgram] = useState('all');
  const [section, setSection] = useState('');
  const [threshold, setThreshold] = useState(75);
  const [defaultersOnly, setDefaultersOnly] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.bioSummary({ month, program: program === 'all' ? undefined : program, section: section || undefined });
      setStudents(r.students || []);
    } catch (e: any) {
      toast({ title: 'Could not load summary', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [month, program, section]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => defaultersOnly ? students.filter((s) => s.percentage < threshold) : students, [students, defaultersOnly, threshold]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = shown.map((s) => ({
      Name: s.name, 'Roll No': s.rollNo || '', Class: s.class, Section: s.section, Part: s.part,
      Present: s.present, Late: s.late, 'Half Day': s.half_day, Absent: s.absent, Leave: s.leave, Holiday: s.holiday,
      'Attendance %': s.percentage,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_${month}${program !== 'all' ? '_' + program : ''}.xlsx`);
    toast({ title: 'Excel exported', description: `${rows.length} students.` });
  };

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFontSize(14); doc.text(`Attendance Summary — ${month}`, 40, 40);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`${program === 'all' ? 'All programs' : program}${section ? ' · ' + section : ''}${defaultersOnly ? ` · defaulters < ${threshold}%` : ''}`, 40, 56);
    let y = 80; doc.setTextColor(0);
    doc.text('Name', 40, y); doc.text('Class', 240, y); doc.text('P/L/H/A', 330, y); doc.text('%', 500, y);
    y += 6; doc.setDrawColor(220); doc.line(40, y, 555, y); y += 16;
    shown.forEach((s) => {
      if (y > 790) { doc.addPage(); y = 50; }
      doc.text(String(s.name).slice(0, 34), 40, y);
      doc.text(`${s.class || ''} ${s.section || ''}`.slice(0, 22), 240, y);
      doc.text(`${s.present}/${s.late}/${s.half_day}/${s.absent}`, 330, y);
      doc.setTextColor(s.percentage < threshold ? 200 : 0, s.percentage < threshold ? 40 : 0, 40);
      doc.text(`${s.percentage}%`, 500, y); doc.setTextColor(0);
      y += 16;
    });
    doc.save(`Attendance_${month}.pdf`);
  };

  return (
    <div className="space-y-4">
      {!readOnly ? null : <PageHeader title="Attendance Summary" subtitle="Monthly attendance % and defaulters (read-only)" />}
      <Card>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div><Label className="text-xs text-gray-500">Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" /></div>
          <div>
            <Label className="text-xs text-gray-500">Program</Label>
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All programs</SelectItem>{DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs text-gray-500">Section</Label><Input value={section} onChange={(e) => setSection(e.target.value.toUpperCase())} placeholder="e.g. MK" className="w-24" /></div>
          <div className="flex items-center gap-2 pb-1">
            <Switch checked={defaultersOnly} onCheckedChange={setDefaultersOnly} />
            <span className="text-sm text-gray-600">Defaulters below</span>
            <Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-16 h-8" />%
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={exportExcel}><Download className="w-3.5 h-3.5 mr-1.5" />Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><Download className="w-3.5 h-3.5 mr-1.5" />PDF</Button>
        </div>

        <div className={cn('max-h-[30rem] overflow-y-auto', SCROLLBAR_CLS)}>
          <Table>
            <TableHeader>
              <TableRow>
                {['Student', 'Class', 'Present', 'Late', 'Half', 'Absent', '%'].map((h) => <TableHead key={h} className="uppercase text-[11px] text-gray-400">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-8">{loading ? 'Loading…' : 'No attendance recorded for this month yet.'}</TableCell></TableRow>}
              {shown.map((s) => (
                <TableRow key={s.studentId}>
                  <TableCell><div className="font-medium">{s.name}</div><div className="text-xs text-gray-400">{s.rollNo || '—'}</div></TableCell>
                  <TableCell className="text-sm text-gray-500">{s.class} {s.section} · P{s.part || '1'}</TableCell>
                  <TableCell className="text-emerald-600 font-medium">{s.present}</TableCell>
                  <TableCell className="text-amber-600">{s.late}</TableCell>
                  <TableCell className="text-orange-600">{s.half_day}</TableCell>
                  <TableCell className="text-rose-600 font-medium">{s.absent}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', s.percentage < threshold ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700')}>{s.percentage}%</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMISSION — enrollment queue + allocate PIN.
// ═══════════════════════════════════════════════════════════════════════════

// Shared enrollment table (used by both the flat search results and the
// per-section view). Follows the same restrained table style as the register.
function EnrollmentTable({ rows, loading, emptyText, onAllocate, onView }: {
  rows: any[]; loading: boolean; emptyText: string;
  onAllocate: (s: any) => void; onView: (s: any) => void;
}) {
  return (
    <div className={cn('max-h-[32rem] overflow-y-auto', SCROLLBAR_CLS)}>
      <Table>
        <TableHeader>
          <TableRow>
            {['Student', 'Class', 'PIN', 'Fingerprint', ''].map((h) => <TableHead key={h} className="uppercase text-[11px] text-gray-400">{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-gray-400 py-8">{loading ? 'Loading…' : emptyText}</TableCell></TableRow>}
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell><div className="font-medium">{s.name}</div><div className="text-xs text-gray-400">{s.rollNo || '—'}</div></TableCell>
              <TableCell className="text-sm text-gray-500">{deptLabel(s.class)} {s.section} · P{s.part || '1'}</TableCell>
              <TableCell>{s.pin ? <span className="font-mono font-semibold">{s.pin}</span> : <span className="text-gray-300">—</span>}</TableCell>
              <TableCell>
                {s.fingerprintConfirmed
                  ? <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Confirmed</Badge>
                  : s.pinAllocated
                    ? <Badge className="bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3 mr-1" />Awaiting punch</Badge>
                    : <span className="text-gray-300 text-sm">—</span>}
              </TableCell>
              <TableCell>
                {s.pinAllocated
                  ? <Button variant="ghost" size="sm" onClick={() => onView(s)}>View PIN</Button>
                  : <Button size="sm" onClick={() => onAllocate(s)} style={{ background: ORANGE }} className="text-white hover:opacity-90"><Fingerprint className="w-3.5 h-3.5 mr-1.5" />Allocate PIN</Button>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Program → Part → Section drill-down (the app's standard hierarchy), then the
// section's students with a "Allocate PIN to whole section" button.
function EnrollmentView({ navKey }: { navKey: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinInfo, setPinInfo] = useState<any | null>(null);
  // Drill persisted so reload / Back keeps the open Program → Part → Section.
  const [drill, setDrill] = useUiState<{ dept: string | null; part: string; section: string | null }>(navKey, { dept: null, part: '1', section: null });
  const { dept, part, section } = drill;
  const setDept = (d: string | null) => setDrill((p) => ({ ...p, dept: d }));
  const setPart = (p2: string) => setDrill((p) => ({ ...p, part: p2 }));
  const setSection = (s: string | null) => setDrill((p) => ({ ...p, section: s }));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.bioEnrollment()); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Total students per program (badge on the department cards).
  const countsByDept = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.class] = (m[r.class] || 0) + 1;
    return m;
  }, [rows]);

  // Distinct sections within the selected program + part.
  const sectionCards = useMemo(() => {
    if (!dept) return [];
    const set = new Map<string, { id: string; name: string; section: string }>();
    for (const r of rows) {
      if (r.class === dept && (r.part || '1') === part && r.section) {
        set.set(r.section, { id: r.section, name: dept, section: r.section });
      }
    }
    return [...set.values()];
  }, [rows, dept, part]);
  const sectionCount = useCallback((sec: string) => rows.filter((r) => r.class === dept && (r.part || '1') === part && r.section === sec).length, [rows, dept, part]);

  // Students of the currently-open section.
  const sectionStudents = useMemo(
    () => (dept && section) ? rows.filter((r) => r.class === dept && (r.part || '1') === part && r.section === section) : [],
    [rows, dept, part, section],
  );
  const sectionPending = sectionStudents.filter((s) => !s.pinAllocated);

  // Flat search across everything (bypasses the drill-down while typing).
  const searchResults = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return rows.filter((r) => `${r.name} ${r.rollNo || ''} ${deptLabel(r.class)} ${r.section || ''}`.toLowerCase().includes(t)).slice(0, 100);
  }, [q, rows]);

  const allocate = async (s: any) => {
    try {
      const r = await api.bioAllocatePin(s.id);
      setPinInfo({ pin: r.pin, name: r.studentName });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not allocate PIN', description: e?.message || 'Try again.', variant: 'destructive' });
    }
  };
  const view = (s: any) => setPinInfo({ pin: s.pin, name: s.name });

  const allocateSection = async () => {
    if (!dept || !section || sectionPending.length === 0) return;
    setBusy(true);
    try {
      const r = await api.bioAllocateSection(dept, part, section);
      toast({ title: 'Section PINs allocated', description: `${r.allocated} student${r.allocated === 1 ? '' : 's'} in ${deptLabel(dept)} · P${part} · ${section} now have a PIN.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not allocate', description: e?.message || 'Try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Biometric Enrollment" subtitle="Program → Part → Section, then allocate device PINs and enroll fingerprints" />

      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Search all students by name, roll no, class…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
        </div>

        {/* Flat search mode */}
        {searchResults ? (
          <EnrollmentTable rows={searchResults} loading={loading} emptyText="No matching students." onAllocate={allocate} onView={view} />
        ) : (
          <>
            <HierarchyBreadcrumb
              dept={dept} part={dept ? part : null} section={section}
              onClear={() => { setDept(null); setSection(null); }}
            />

            {/* Level 0 — programs */}
            {!dept && (
              <DeptCardGrid onSelect={(d) => { setDept(d); setSection(null); }} studentCounts={countsByDept} />
            )}

            {/* Level 1 — part + section */}
            {dept && !section && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => { setDept(null); setSection(null); }} className="text-sm text-gray-500 hover:text-[#1A1A1A]">← Programs</button>
                  <PartToggle value={part} onChange={(p) => { setPart(p); setSection(null); }} />
                </div>
                {sectionCards.length > 0
                  ? <SectionCardGrid sections={sectionCards} onSelect={(s) => setSection(s.section)} getStudentCount={(id) => sectionCount(id)} />
                  : <p className="text-sm text-gray-400 py-6 text-center">No sections found for {deptLabel(dept)} · Part {part}.</p>}
              </div>
            )}

            {/* Level 2 — section students */}
            {dept && section && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => setSection(null)} className="text-sm text-gray-500 hover:text-[#1A1A1A]">← Sections</button>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-gray-400">
                      <Users className="w-3.5 h-3.5 inline mr-1" />{sectionStudents.length} students · {sectionPending.length} without PIN
                    </span>
                    <HistoryDownload program={dept} part={part} section={section} />
                    <Button
                      size="sm" disabled={busy || sectionPending.length === 0}
                      onClick={allocateSection}
                      style={{ background: sectionPending.length === 0 ? undefined : ORANGE }}
                      className={cn(sectionPending.length === 0 ? 'bg-gray-200 text-gray-400' : 'text-white hover:opacity-90')}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Fingerprint className="w-3.5 h-3.5 mr-1.5" />}
                      Allocate PIN to whole section{sectionPending.length > 0 ? ` (${sectionPending.length})` : ''}
                    </Button>
                  </div>
                </div>
                <EnrollmentTable rows={sectionStudents} loading={loading} emptyText="No students in this section." onAllocate={allocate} onView={view} />
              </div>
            )}
          </>
        )}
      </Card>

      <PinInstructionsDialog info={pinInfo} onClose={() => setPinInfo(null)} />
    </>
  );
}

function PinInstructionsDialog({ info, onClose }: { info: any | null; onClose: () => void }) {
  const copy = () => { if (info?.pin) { navigator.clipboard?.writeText(info.pin); toast({ title: 'PIN copied' }); } };
  return (
    <Dialog open={!!info} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Device PIN allocated</DialogTitle></DialogHeader>
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 mb-1">{info?.name}</p>
          <button onClick={copy} className="inline-flex items-center gap-3 group">
            <span className="text-4xl font-bold font-mono tracking-widest text-[#1A1A1A]">{info?.pin}</span>
            <Copy className="w-5 h-5 text-gray-400 group-hover:text-[#F26522]" />
          </button>
          <p className="text-[11px] text-gray-400 mt-1">Tap to copy</p>
        </div>
        <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-4 text-sm text-gray-700 space-y-1.5">
          <p className="font-semibold text-[#1A1A1A]">On the device:</p>
          <p>1. <b>Menu → User Mgt → New User</b></p>
          <p>2. User ID = <b className="font-mono">{info?.pin}</b></p>
          <p>3. Name = <b>{info?.name}</b></p>
          <p>4. Enroll two fingers, then save.</p>
          <p className="text-[11px] text-gray-500 pt-1">Fingerprint confirms automatically on this PIN&apos;s first ever punch.</p>
        </div>
        <DialogFooter><Button onClick={onClose} style={{ background: ORANGE }} className="text-white hover:opacity-90">Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDENT / PARENT — own monthly calendar + stats.
// ═══════════════════════════════════════════════════════════════════════════

/** anchor date helpers (all in plain YYYY-MM-DD, UTC-safe). */
function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekDatesFor(iso: string): string[] {
  // Monday-start week containing `iso`.
  const d = new Date(`${iso}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // 0=Mon … 6=Sun
  const monday = addDaysIso(iso, -offset);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
}
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** One in/out line — the core "when did they come and leave" row. */
function InOutRow({ e, label }: { e: any; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">In</p>
          <p className="text-sm font-semibold text-emerald-700">{clockPK(e?.check_in_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Out</p>
          <p className="text-sm font-semibold text-sky-700">{clockPK(e?.check_out_at)}</p>
        </div>
        <StatusBadge status={e?.status || 'not_marked'} />
      </div>
    </div>
  );
}

function StudentCalendarView({ user, navKey }: { user: any; navKey: string }) {
  const isParent = user?.role === 'parent';
  // Persist the view + focused date so reload / Back keeps the same position.
  const [nav, setNav] = useUiState<{ view: 'day' | 'week' | 'month'; anchor: string }>(navKey, { view: 'week', anchor: todayKarachi() });
  const view = nav.view;
  const anchor = nav.anchor;
  const setView = (v: 'day' | 'week' | 'month') => setNav((p) => ({ ...p, view: v }));
  const setAnchor = (a: string) => setNav((p) => ({ ...p, anchor: a }));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    // For student/parent the server ignores the id and scopes to the logged-in
    // user's own linked student. No month filter → we get the full history and
    // slice it locally for the Day / Week / Month views.
    api.bioStudentHistory('me').then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of data?.entries || []) m.set(e.date, e);
    return m;
  }, [data]);

  const month = anchor.slice(0, 7);
  const [yy, mm] = month.split('-').map(Number);

  // Stat cards computed for the anchor's month.
  const monthStats = useMemo(() => {
    const ents = (data?.entries || []).filter((e: any) => e.date.startsWith(month));
    const c = (s: string) => ents.filter((e: any) => e.status === s).length;
    const present = c('present'), late = c('late'), half = c('half_day'), absent = c('absent');
    const attended = present + late + half, marked = attended + absent;
    return { present, late, half, absent, percentage: marked > 0 ? Math.round(((present + late + half * 0.5) / marked) * 100) : 0 };
  }, [data, month]);

  // Month calendar cells.
  const first = new Date(Date.UTC(yy, mm - 1, 1));
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const leadBlanks = first.getUTCDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);

  const dayEntry = byDate.get(anchor);
  const weekDates = weekDatesFor(anchor);

  return (
    <>
      <PageHeader
        title={isParent ? "Ward's Gate Attendance" : 'Biometric Attendance'}
        subtitle="When you check IN and OUT at the college gate — daily, weekly, and by date"
        action={<HistoryDownload studentMode />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="text-center"><p className="text-2xl font-bold text-emerald-600">{monthStats.percentage}%</p><p className="text-xs text-gray-400 uppercase tracking-wide">This month</p></Card>
        <Card className="text-center"><p className="text-2xl font-bold text-amber-600">{monthStats.late}</p><p className="text-xs text-gray-400 uppercase tracking-wide">Lates</p></Card>
        <Card className="text-center"><p className="text-2xl font-bold text-rose-600">{monthStats.absent}</p><p className="text-xs text-gray-400 uppercase tracking-wide">Absents</p></Card>
        <Card className="text-center"><p className="text-2xl font-bold text-[#1A1A1A]">{monthStats.present}</p><p className="text-xs text-gray-400 uppercase tracking-wide">Present</p></Card>
      </div>

      <Card>
        {/* View switch + date filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('px-4 py-1.5 text-sm font-medium capitalize', view === v ? 'text-white' : 'text-gray-500')} style={view === v ? { background: ORANGE } : undefined}>{v}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {view === 'month'
              ? <Input type="month" value={month} onChange={(e) => setAnchor(e.target.value + '-01')} className="w-40" />
              : <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="w-44" />}
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {/* DAY */}
        {view === 'day' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="sm" onClick={() => setAnchor(addDaysIso(anchor, -1))}>← Prev</Button>
              <h3 className="font-semibold">{prettyDate(anchor)}</h3>
              <Button variant="ghost" size="sm" onClick={() => setAnchor(addDaysIso(anchor, 1))}>Next →</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-center">
                <p className="text-xs uppercase tracking-wide text-emerald-600 font-medium">Checked in</p>
                <p className="text-3xl font-bold text-emerald-700 mt-1">{clockPK(dayEntry?.check_in_at)}</p>
                {dayEntry?.minutes_late > 0 && <p className="text-xs text-amber-600 mt-1">{dayEntry.minutes_late} min late</p>}
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-5 text-center">
                <p className="text-xs uppercase tracking-wide text-sky-600 font-medium">Checked out</p>
                <p className="text-3xl font-bold text-sky-700 mt-1">{clockPK(dayEntry?.check_out_at)}</p>
              </div>
            </div>
            <div className="flex justify-center mt-4"><StatusBadge status={dayEntry?.status || 'not_marked'} /></div>
            {!dayEntry && !loading && <p className="text-center text-gray-400 text-sm mt-3">No gate activity recorded for this day.</p>}
          </div>
        )}

        {/* WEEK */}
        {view === 'week' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Button variant="ghost" size="sm" onClick={() => setAnchor(addDaysIso(anchor, -7))}>← Prev week</Button>
              <h3 className="font-semibold text-sm">{prettyDate(weekDates[0])} — {prettyDate(weekDates[6])}</h3>
              <Button variant="ghost" size="sm" onClick={() => setAnchor(addDaysIso(anchor, 7))}>Next week →</Button>
            </div>
            <div>
              {weekDates.map((d) => (
                <InOutRow key={d} e={byDate.get(d)} label={new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} />
              ))}
            </div>
          </div>
        )}

        {/* MONTH */}
        {view === 'month' && (
          <div>
            <h3 className="font-semibold mb-3">{new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="text-[11px] uppercase tracking-wide text-gray-400 font-medium py-1">{d}</div>)}
              {cells.map((date, i) => {
                if (!date) return <div key={`b${i}`} />;
                const e = byDate.get(date);
                const st = e?.status;
                const cls = st ? (STATUS_STYLES[st]?.cls || 'border-gray-200') : 'bg-white border-gray-100';
                return (
                  <button key={date} onClick={() => { setAnchor(date); setView('day'); }}
                    className={cn('aspect-square rounded-lg border flex flex-col items-center justify-center text-xs hover:ring-2 hover:ring-[#F26522]/40 transition', cls)}
                    title={e ? `${STATUS_STYLES[st]?.label}${e.check_in_at ? ' · in ' + clockPK(e.check_in_at) : ''}${e.check_out_at ? ' · out ' + clockPK(e.check_out_at) : ''}` : ''}>
                    <span className="font-semibold">{Number(date.slice(-2))}</span>
                    {e?.check_in_at && <span className="text-[9px] opacity-70 leading-tight">{clockPK(e.check_in_at)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-100">
              {['present', 'late', 'half_day', 'absent', 'leave', 'holiday'].map((s) => (
                <div key={s} className="flex items-center gap-1.5"><span className={cn('w-3 h-3 rounded border', STATUS_STYLES[s].cls)} /><span className="text-xs text-gray-500">{STATUS_STYLES[s].label}</span></div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Tap any day to see its exact check-in / check-out times.</p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold mb-3">Recent gate activity</h3>
        <div className={cn('max-h-80 overflow-y-auto', SCROLLBAR_CLS)}>
          {(data?.entries || []).filter((e: any) => e.check_in_at).slice(0, 30).map((e: any) => (
            <InOutRow key={e.id} e={e} label={prettyDate(e.date)} />
          ))}
          {!loading && (data?.entries || []).filter((e: any) => e.check_in_at).length === 0 && <p className="text-gray-400 text-sm py-4 text-center">No check-ins recorded yet.</p>}
        </div>
      </Card>
    </>
  );
}
