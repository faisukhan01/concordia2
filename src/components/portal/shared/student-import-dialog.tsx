'use client';

// ─────────────────────────────────────────────────────────────
// Student Excel Importer
//
// Upload a college enrollment spreadsheet (.xlsx / .xls / .csv), and this
// dialog:
//   1. parses it client-side (SheetJS),
//   2. auto-maps the columns to student fields by header name,
//   3. auto-detects each row's program (FA→FA(IT), ICOM→I.Com, FSC→Pre-Med…),
//   4. shows an editable preview (fix any program, toggle rows off),
//   5. posts the mapped rows to the bulk-import endpoint, which generates
//      roll numbers + logins, dedupes, and files each student under its
//      program → part → section.
// ─────────────────────────────────────────────────────────────

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { api, type ImportStudentRow } from '@/lib/api';
import { DEPARTMENTS, deptLabel, detectProgram, PartToggle } from './concordia-hierarchy';
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, X, ArrowLeft,
} from 'lucide-react';

type Row = ImportStudentRow & { include: boolean; rawProgram: string };

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function normPhone(v: any): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && d.startsWith('3')) return '0' + d; // 3XXXXXXXXX → 03XXXXXXXXX
  return d;
}

function parseFee(v: any): number | '' {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : '';
}

// Map the (normalised) header row to column indices for each field.
function buildColMap(headers: string[]) {
  const find = (pred: (h: string) => boolean) => headers.findIndex(pred);
  let name = find((h) => h.includes('studentname'));
  if (name < 0) name = find((h) => h === 'name');
  let phone = find((h) => h.includes('contactno1'));
  if (phone < 0) phone = find((h) => h.includes('contact'));
  let fee = find((h) => h.includes('tuitionfee'));
  if (fee < 0) fee = find((h) => h === 'fee' || (h.includes('fee') && !h.includes('test') && !h.includes('session') && !h.includes('install')));
  return {
    name,
    fatherName: find((h) => h.includes('fathername')),
    phone,
    program: find((h) => h.includes('program')),
    fee,
    cnic: find((h) => (h.includes('cnic') || h.includes('bform')) && !h.includes('father')),
    fatherCnic: find((h) => h.includes('cnic') && h.includes('father')),
    gender: find((h) => h.includes('gender')),
    address: find((h) => h.includes('address')),
    prevResult: find((h) => h.includes('10thmarks') || h.includes('marks')),
    rollNo: find((h) => h === 'rollno'),
  };
}

const cell = (row: any[], idx: number) => (idx >= 0 ? row[idx] : '');

export function StudentImportDialog({
  open, onClose, onImported, branchId,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
  branchId?: string;
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [part, setPart] = useState<'1' | '2'>('1');
  const [section, setSection] = useState('A');
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload'); setRows([]); setFileName(''); setResult(null);
    setPart('1'); setSection('A');
  };

  const close = () => { reset(); onClose(); };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Formatted text (raw:false) keeps CNIC/phone as displayed strings.
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      let headerIdx = aoa.findIndex((r) => r.some((c) => norm(c).includes('studentname')));
      if (headerIdx < 0) headerIdx = 0;
      const headers = (aoa[headerIdx] || []).map((h) => norm(h));
      const col = buildColMap(headers);
      if (col.name < 0) {
        toast({ title: 'Could not find a "Student Name" column', description: 'Make sure the sheet has a header row with Student Name, Father Name, Program, etc.', variant: 'destructive' });
        setParsing(false);
        return;
      }
      const parsed: Row[] = [];
      for (const r of aoa.slice(headerIdx + 1)) {
        const nm = String(cell(r, col.name) ?? '').trim();
        if (!nm) continue;
        const rawProgram = String(cell(r, col.program) ?? '').trim();
        parsed.push({
          name: nm,
          fatherName: String(cell(r, col.fatherName) ?? '').trim(),
          phone: normPhone(cell(r, col.phone)),
          program: detectProgram(rawProgram),
          baseFee: parseFee(cell(r, col.fee)),
          cnic: String(cell(r, col.cnic) ?? '').trim(),
          fatherCnic: String(cell(r, col.fatherCnic) ?? '').trim(),
          gender: String(cell(r, col.gender) ?? '').trim(),
          address: String(cell(r, col.address) ?? '').trim(),
          prevResult: String(cell(r, col.prevResult) ?? '').trim(),
          rollNo: String(cell(r, col.rollNo) ?? '').trim(),
          include: true,
          rawProgram,
        });
      }
      if (parsed.length === 0) {
        toast({ title: 'No student rows found', description: 'The sheet has a header but no data rows with a name.', variant: 'destructive' });
        setParsing(false);
        return;
      }
      setFileName(file.name);
      setRows(parsed);
      setStep('preview');
    } catch (e: any) {
      toast({ title: 'Could not read the file', description: e?.message || 'Please upload a valid .xlsx / .xls / .csv file.', variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const setRowProgram = (i: number, program: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, program } : r)));
  const toggleRow = (i: number) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, include: !r.include } : r)));

  const included = rows.filter((r) => r.include);
  const missingProgram = included.filter((r) => !r.program).length;

  const doImport = async () => {
    if (included.length === 0) { toast({ title: 'No rows selected', variant: 'destructive' }); return; }
    setImporting(true);
    try {
      const payload: ImportStudentRow[] = included.map((r) => ({
        name: r.name,
        fatherName: r.fatherName,
        phone: r.phone,
        program: r.program,
        part,
        section: section.trim().toUpperCase() || 'A',
        baseFee: r.baseFee,
        cnic: r.cnic,
        fatherCnic: r.fatherCnic,
        gender: r.gender,
        address: r.address,
        prevResult: r.prevResult,
        rollNo: r.rollNo,
      }));
      const res = await api.importStudents(payload, branchId);
      setResult(res);
      setStep('done');
      onImported?.();
      toast({ title: `Imported ${res.created} student${res.created === 1 ? '' : 's'}`, description: `${res.skipped} skipped · ${res.errors} error(s)` });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#F26522]" />
            Import Students from Excel
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload your enrollment sheet — programs are auto-detected and filed into Program → Part → Section.'}
            {step === 'preview' && `${fileName} · ${rows.length} rows found. Review programs, then import.`}
            {step === 'done' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div className="py-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-[#F26522] hover:bg-[#FFF7F2] transition-colors p-10 flex flex-col items-center justify-center gap-3 text-center"
            >
              {parsing ? (
                <Loader2 className="h-10 w-10 text-[#F26522] animate-spin" />
              ) : (
                <Upload className="h-10 w-10 text-gray-400" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">{parsing ? 'Reading file…' : 'Click to choose an Excel / CSV file'}</p>
                <p className="text-xs text-gray-500 mt-1">.xlsx, .xls or .csv · header row with Student Name, Father Name, Program, Tuition Fee, CNIC…</p>
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Enroll into Part</p>
                  <PartToggle value={part} onChange={(p) => setPart(p as '1' | '2')} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Section</p>
                  <Input value={section} onChange={(e) => setSection(e.target.value)} className="h-10 w-20" maxLength={3} placeholder="A" />
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5 text-right">
                <p><span className="font-semibold text-gray-900">{included.length}</span> selected of {rows.length}</p>
                {missingProgram > 0 && (
                  <p className="text-amber-600 flex items-center gap-1 justify-end">
                    <AlertTriangle className="h-3.5 w-3.5" /> {missingProgram} need a program
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-auto flex-1 -mx-6 px-6">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-[11px] uppercase tracking-wider text-gray-400 text-left border-b border-gray-200">
                    <th className="py-2 pr-2 w-8"></th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Father</th>
                    <th className="py-2 pr-3 min-w-[190px]">Program {' '}
                      <span className="normal-case text-gray-300">(from “{'{'}sheet{'}'}”)</span>
                    </th>
                    <th className="py-2 pr-3 text-right">Fee</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">CNIC</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={i}
                      className={`border-b border-gray-100 ${!r.include ? 'opacity-40' : ''} ${r.include && !r.program ? 'bg-amber-50/60' : ''}`}
                    >
                      <td className="py-1.5 pr-2">
                        <input type="checkbox" checked={r.include} onChange={() => toggleRow(i)} className="h-4 w-4 accent-[#F26522]" />
                      </td>
                      <td className="py-1.5 pr-3 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                      <td className="py-1.5 pr-3 text-gray-600 whitespace-nowrap">{r.fatherName || '—'}</td>
                      <td className="py-1.5 pr-3">
                        <Select value={r.program || 'none'} onValueChange={(v) => setRowProgram(i, v === 'none' ? '' : v)}>
                          <SelectTrigger className={`h-8 text-xs ${!r.program ? 'border-amber-300 text-amber-700' : ''}`}>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Unassigned —</SelectItem>
                            {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{deptLabel(d)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-gray-700">{r.baseFee ? Number(r.baseFee).toLocaleString() : '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-600 tabular-nums whitespace-nowrap">{r.phone || '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-500 tabular-nums whitespace-nowrap">{r.cnic || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
              <Button variant="ghost" onClick={reset} className="text-gray-600">
                <ArrowLeft className="h-4 w-4 mr-1" /> Choose another file
              </Button>
              <Button onClick={doImport} disabled={importing || included.length === 0} className="bg-[#F26522] hover:bg-[#D4541E] text-white">
                {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Import {included.length} student{included.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && result && (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <div className="h-14 w-14 rounded-full bg-emerald-50 grid place-items-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{result.created} student{result.created === 1 ? '' : 's'} imported</p>
              <p className="text-sm text-gray-500 mt-1">
                {result.skipped} skipped (duplicates){result.errors > 0 ? ` · ${result.errors} error(s)` : ''}. These are records only — <span className="font-medium text-gray-700">no logins yet</span>. The Accountant provides each login (roll number + password) after marking the fee Paid on the student&rsquo;s detail page.
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={close} className="bg-[#F26522] hover:bg-[#D4541E] text-white">Done</Button>
            </div>
          </div>
        )}

        <button onClick={close} className="absolute right-4 top-4 text-gray-400 hover:text-gray-600" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
