'use client';

// ============================================================================
// Concordia College — Shared PDF Document Builder
//
// A single, reusable jsPDF toolkit that produces branded, aesthetic,
// "educational-platform-grade" PDFs for every portal:
//   - Admission enrollment receipts
//   - Fee challans / installment invoices
//   - Salary slips
//   - Result / report cards
//
// Design language:
//   - Top accent bar in Concordia orange (#F26522)
//   - Embedded logo (fetched once + cached) on every document
//   - Institute name + branch + document title in a header band
//   - Two-column info grid with uppercase micro-labels
//   - Banded table with header row + zebra rows
//   - Status pill (PAID / UNPAID / CONFIRMED) with proper colors
//   - Signature block + generated-on footer
//
// All public builders return a jsPDF doc so callers can either .save() it
// (download) or .output('bloburl') / open in a new tab to print.
// ============================================================================

import { jsPDF } from 'jspdf';

// Concordia brand palette
const BRAND = {
  orange: [242, 101, 34] as [number, number, number], // #F26522
  orangeDark: [212, 84, 30] as [number, number, number],
  ink: [17, 24, 39] as [number, number, number], // gray-900
  inkSoft: [55, 65, 81] as [number, number, number], // gray-700
  muted: [107, 114, 128] as [number, number, number], // gray-500
  faint: [156, 163, 175] as [number, number, number], // gray-400
  line: [229, 231, 235] as [number, number, number], // gray-200
  bg: [249, 250, 251] as [number, number, number], // gray-50
  bgBand: [243, 244, 246] as [number, number, number], // gray-100
  white: [255, 255, 255] as [number, number, number],
  paidBg: [236, 253, 245] as [number, number, number],
  paidFg: [4, 120, 87] as [number, number, number],
  paidLine: [167, 243, 208] as [number, number, number],
  unpaidBg: [255, 247, 237] as [number, number, number],
  unpaidFg: [194, 120, 3] as [number, number, number],
  unpaidLine: [254, 215, 170] as [number, number, number],
  confirmedBg: [239, 246, 255] as [number, number, number],
  confirmedFg: [30, 64, 175] as [number, number, number],
  confirmedLine: [191, 219, 254] as [number, number, number],
};

// ---------------------------------------------------------------------------
// Logo — fetched once, cached as a base64 data URL for the lifetime of the
// page. jsPDF needs the raw base64 (without the data: prefix) + format.
// ---------------------------------------------------------------------------
let logoCache: { dataUrl: string; w: number; h: number } | null = null;
let logoPromise: Promise<typeof logoCache> | null = null;

async function loadLogo(): Promise<typeof logoCache> {
  if (logoCache) return logoCache;
  if (logoPromise) return logoPromise;
  logoPromise = (async () => {
    try {
      const res = await fetch('/concordia-logo.png');
      if (!res.ok) throw new Error('logo fetch failed');
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      // Preserve aspect ratio (source is 402x120 → ratio ~3.35)
      const targetW = 150;
      const targetH = Math.round(targetW / 3.35);
      logoCache = { dataUrl, w: targetW, h: targetH };
      return logoCache;
    } catch {
      logoCache = null;
      return null;
    }
  })();
  return logoPromise;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export function fmtMoney(n: number | string): string {
  return 'PKR ' + Number(n || 0).toLocaleString('en-PK');
}

export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '—';
  try {
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return '—';
    return (
      dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' +
      dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Core layout primitives
// ---------------------------------------------------------------------------

function setFill(doc: jsPDF, c: [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}
function setDraw(doc: jsPDF, c: [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

export interface PdfMeta {
  instituteName?: string;
  branchName?: string;
  docTitle: string; // e.g. "Fee Challan", "Enrollment Receipt"
  docSubtitle?: string; // e.g. "Academic Year 2026"
  refLabel?: string; // e.g. "Challan #", "Receipt #"
  refValue?: string; // e.g. "CH-INST-202607-0001"
}

interface LayoutCtx {
  doc: jsPDF;
  W: number;
  M: number;
  y: number;
}

/**
 * Draws the branded header on page 1:
 *  - top accent bar
 *  - logo (left)
 *  - institute name + branch (center-left)
 *  - document title pill (right)
 *  - ref label/value (right, under title)
 * Returns the y position where body content should start.
 */
async function drawHeader(ctx: LayoutCtx, meta: PdfMeta): Promise<number> {
  const { doc, W, M } = ctx;
  let y = ctx.y;

  // Top accent bar (full width)
  setFill(doc, BRAND.orange);
  doc.rect(0, 0, W, 7, 'F');

  // Thin secondary accent (subtle design detail)
  setFill(doc, BRAND.orangeDark);
  doc.rect(0, 7, W, 1.5, 'F');

  y = 30;

  // Logo (left)
  const logo = await loadLogo();
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, 'PNG', M, y, logo.w, logo.h);
    } catch {
      /* ignore */
    }
  }

  // Institute name (next to / under logo)
  const textX = M + (logo ? logo.w + 14 : 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  setText(doc, BRAND.ink);
  doc.text(meta.instituteName || 'Concordia College', textX, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, BRAND.muted);
  doc.text(meta.branchName || 'Main Campus', textX, y + 28);

  if (meta.docSubtitle) {
    doc.setFontSize(8);
    setText(doc, BRAND.faint);
    doc.text(meta.docSubtitle, textX, y + 40);
  }

  // Document title pill (right side)
  const titleText = meta.docTitle.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const titleW = doc.getTextWidth(titleText) + 22;
  const titleX = W - M - titleW;
  const titleY = y + 2;
  setFill(doc, BRAND.orange);
  doc.roundedRect(titleX, titleY, titleW, 22, 4, 4, 'F');
  setText(doc, BRAND.white);
  doc.text(titleText, titleX + 11, titleY + 15);

  // Ref label/value under the pill
  if (meta.refLabel && meta.refValue) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, BRAND.faint);
    doc.text(meta.refLabel.toUpperCase(), W - M, titleY + 34, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(doc, BRAND.ink);
    doc.text(meta.refValue, W - M, titleY + 46, { align: 'right' });
  }

  // Divider line below header
  y = Math.max(y + (logo ? logo.h : 44), titleY + 56) + 14;
  setDraw(doc, BRAND.line);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  y += 22;

  ctx.y = y;
  return y;
}

/**
 * Draws a two-column info grid (label / value pairs).
 */
function drawInfoGrid(ctx: LayoutCtx, rows: [string, string][]): number {
  const { doc, W, M } = ctx;
  let y = ctx.y;
  const colW = (W - 2 * M - 16) / 2;
  const rowH = 34;

  rows.forEach((r, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (colW + 16);
    const ry = y + row * rowH;

    // Subtle background band for label
    setFill(doc, BRAND.bg);
    doc.roundedRect(x, ry - 4, colW, rowH - 8, 3, 3, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, BRAND.faint);
    doc.text(r[0].toUpperCase(), x + 10, ry + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    setText(doc, BRAND.ink);
    const val = r[1] || '—';
    // Truncate long values to fit
    const maxW = colW - 20;
    let txt = val;
    if (doc.getTextWidth(txt) > maxW) {
      while (doc.getTextWidth(txt + '…') > maxW && txt.length > 0) {
        txt = txt.slice(0, -1);
      }
      txt += '…';
    }
    doc.text(txt, x + 10, ry + 22);
  });

  const rowsDrawn = Math.ceil(rows.length / 2);
  y += rowsDrawn * rowH + 8;
  ctx.y = y;
  return y;
}

export interface TableCol {
  header: string;
  align?: 'left' | 'right' | 'center';
  width?: number; // fraction of content width (0..1)
}

/**
 * Draws a banded table with header row + zebra rows.
 */
function drawTable(
  ctx: LayoutCtx,
  cols: TableCol[],
  rows: (string | number)[][],
): number {
  const { doc, W, M } = ctx;
  let y = ctx.y;
  const contentW = W - 2 * M;
  const colWidths = cols.map(
    (c) => (c.width ?? 1 / cols.length) * contentW,
  );

  // Header band
  setFill(doc, BRAND.ink);
  doc.roundedRect(M, y, contentW, 26, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setText(doc, BRAND.white);
  let cx = M + 10;
  cols.forEach((c, i) => {
    const align = c.align || 'left';
    let tx = cx;
    if (align === 'right') tx = cx + colWidths[i] - 20;
    else if (align === 'center') tx = cx + colWidths[i] / 2;
    doc.text(c.header.toUpperCase(), tx, y + 17, {
      align: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
    });
    cx += colWidths[i];
  });
  y += 26;

  // Body rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  rows.forEach((row, ri) => {
    const rowH = 24;
    if (ri % 2 === 1) {
      setFill(doc, BRAND.bg);
      doc.rect(M, y, contentW, rowH, 'F');
    }
    setText(doc, BRAND.inkSoft);
    cx = M + 10;
    row.forEach((cell, i) => {
      const align = cols[i].align || 'left';
      let tx = cx;
      if (align === 'right') tx = cx + colWidths[i] - 20;
      else if (align === 'center') tx = cx + colWidths[i] / 2;
      const txt = String(cell ?? '—');
      // Truncate
      const maxW = colWidths[i] - 20;
      let t = txt;
      if (doc.getTextWidth(t) > maxW) {
        while (doc.getTextWidth(t + '…') > maxW && t.length > 0) t = t.slice(0, -1);
        t += '…';
      }
      doc.text(t, tx, y + 16, {
        align: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
      });
      cx += colWidths[i];
    });
    y += rowH;
  });

  // Bottom border
  setDraw(doc, BRAND.line);
  doc.setLineWidth(0.7);
  doc.line(M, y, W - M, y);
  y += 14;
  ctx.y = y;
  return y;
}

/**
 * Draws a status pill (PAID / UNPAID / CONFIRMED / etc.)
 */
function drawStatusPill(
  ctx: LayoutCtx,
  label: string,
  variant: 'paid' | 'unpaid' | 'confirmed',
  rightText?: string,
): number {
  const { doc, W, M } = ctx;
  let y = ctx.y;
  const palette =
    variant === 'paid'
      ? { bg: BRAND.paidBg, fg: BRAND.paidFg, line: BRAND.paidLine }
      : variant === 'confirmed'
        ? { bg: BRAND.confirmedBg, fg: BRAND.confirmedFg, line: BRAND.confirmedLine }
        : { bg: BRAND.unpaidBg, fg: BRAND.unpaidFg, line: BRAND.unpaidLine };

  setFill(doc, palette.bg);
  setDraw(doc, palette.line);
  doc.setLineWidth(1);
  doc.roundedRect(M, y, W - 2 * M, 34, 4, 4, 'F');

  // small dot
  setFill(doc, palette.fg);
  doc.circle(M + 16, y + 17, 3.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setText(doc, palette.fg);
  doc.text(label.toUpperCase(), M + 26, y + 21);

  if (rightText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, palette.fg);
    doc.text(rightText, W - M - 14, y + 21, { align: 'right' });
  }
  y += 48;
  ctx.y = y;
  return y;
}

/**
 * Draws a "total payable" band (full width, bold, large).
 */
function drawTotal(ctx: LayoutCtx, label: string, amount: string): number {
  const { doc, W, M } = ctx;
  let y = ctx.y;
  setFill(doc, BRAND.bgBand);
  doc.roundedRect(M, y, W - 2 * M, 34, 4, 4, 'F');
  setFill(doc, BRAND.orange);
  doc.rect(M, y, 5, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, BRAND.muted);
  doc.text(label.toUpperCase(), M + 18, y + 21);
  doc.setFontSize(14);
  setText(doc, BRAND.ink);
  doc.text(amount, W - M - 14, y + 22, { align: 'right' });
  y += 48;
  ctx.y = y;
  return y;
}

/**
 * Draws the footer: signature block (left) + generated-on stamp (right) +
 * thin divider + micro-disclaimer.
 */
function drawFooter(ctx: LayoutCtx): number {
  const { doc, W, M } = ctx;
  const pageH = doc.internal.pageSize.getHeight();
  let y = pageH - 110;

  // Signature line
  setDraw(doc, BRAND.line);
  doc.setLineWidth(0.8);
  doc.line(M, y, M + 180, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, BRAND.faint);
  doc.text('Authorized Signature', M, y + 12);

  // Generated-on stamp (right)
  doc.text('Generated on ' + fmtDateTime(new Date()), W - M, y + 12, {
    align: 'right',
  });

  // Divider
  y = pageH - 50;
  setDraw(doc, BRAND.line);
  doc.setLineWidth(0.7);
  doc.line(M, y, W - M, y);

  // Disclaimer
  doc.setFontSize(7.5);
  setText(doc, BRAND.faint);
  doc.text(
    'This is a computer-generated document from the Concordia College portal and does not require a physical signature.',
    M,
    y + 14,
  );
  doc.setFont('helvetica', 'bold');
  setText(doc, BRAND.muted);
  doc.text('Concordia College · Knowledge with Character', W - M, y + 14, {
    align: 'right',
  });
  return y;
}

// ---------------------------------------------------------------------------
// Section heading (small uppercase label with orange tick)
// ---------------------------------------------------------------------------
function drawSection(ctx: LayoutCtx, label: string): number {
  const { doc, M } = ctx;
  let y = ctx.y;
  setFill(doc, BRAND.orange);
  doc.rect(M, y + 2, 3, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setText(doc, BRAND.ink);
  doc.text(label.toUpperCase(), M + 10, y + 11);
  y += 22;
  ctx.y = y;
  return y;
}

// ===========================================================================
// PUBLIC BUILDERS
// ===========================================================================

export interface AdmissionReceiptData extends PdfMeta {
  studentName: string;
  rollNo: string;
  program: string;
  className: string;
  section?: string;
  baseFee: number | string | null;
  baseFeeLocked: boolean;
  guardian?: string;
  guardianPhone?: string;
  cnic?: string;
  dob?: string;
  address?: string;
  enrolledAt?: string;
}

/**
 * Build a branded admission enrollment receipt.
 * Returns the jsPDF doc (caller decides .save() for download or open for print).
 */
export async function buildAdmissionReceipt(
  data: AdmissionReceiptData,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const ctx: LayoutCtx = { doc, W, M, y: 0 };

  await drawHeader(ctx, {
    instituteName: data.instituteName,
    branchName: data.branchName,
    docTitle: 'Enrollment Receipt',
    docSubtitle: data.docSubtitle || 'Admission Office',
    refLabel: 'Receipt No.',
    refValue: data.refValue || data.rollNo || '—',
  });

  drawSection(ctx, 'Student Details');
  drawInfoGrid(ctx, [
    ['Student Name', data.studentName || '—'],
    ['Roll Number', data.rollNo || '—'],
    ['Program / Course', data.program || '—'],
    ['Class', data.className ? `${data.className}${data.section ? ' · ' + data.section : ''}` : '—'],
    ['Father / Guardian', data.guardian || '—'],
    ['Guardian Phone', data.guardianPhone || '—'],
    ['CNIC / B-Form', data.cnic || '—'],
    ['Date of Birth', fmtDate(data.dob)],
  ]);

  ctx.y += 6;
  drawSection(ctx, 'Fee Summary');
  drawInfoGrid(ctx, [
    [
      'Base Fee',
      data.baseFeeLocked ? fmtMoney(data.baseFee) : 'Not finalized yet',
    ],
    ['Fee Status', data.baseFeeLocked ? 'Locked (Immutable)' : 'Pending finalization'],
    ['Enrollment Date', fmtDate(data.enrolledAt || new Date())],
    ['Academic Year', '2026 — 2027'],
  ]);

  // Address block
  ctx.y += 6;
  drawSection(ctx, 'Residential Address');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setText(doc, BRAND.inkSoft);
  const address = data.address || '—';
  const addrLines = doc.splitTextToSize(address, W - 2 * M - 20);
  doc.text(addrLines, M + 10, ctx.y + 4);
  ctx.y += addrLines.length * 14 + 10;

  // Status pill
  ctx.y += 10;
  drawStatusPill(
    ctx,
    data.baseFeeLocked ? 'Enrollment Confirmed' : 'Provisional Enrollment',
    data.baseFeeLocked ? 'confirmed' : 'unpaid',
    data.baseFeeLocked ? `Base Fee Locked · ${fmtMoney(data.baseFee)}` : 'Finalize base fee via Accountant',
  );

  // Note box
  ctx.y += 4;
  setFill(doc, BRAND.bg);
  doc.roundedRect(M, ctx.y, W - 2 * M, 46, 4, 4, 'F');
  setFill(doc, BRAND.orange);
  doc.rect(M, ctx.y, 5, 46, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(doc, BRAND.muted);
  const note =
    'Login credentials are NOT created at this stage. The Accountant will issue the student\u2019s email & password after the first fee payment. The student then signs in with their Roll Number and the assigned password.';
  const noteLines = doc.splitTextToSize(note, W - 2 * M - 30);
  doc.text(noteLines, M + 16, ctx.y + 18);

  drawFooter(ctx);
  return doc;
}

export interface FeeChallanData extends PdfMeta {
  studentName: string;
  rollNo: string;
  className: string;
  section?: string;
  challanNo?: string;
  amount: number | string;
  type?: string; // Tuition | Installment
  status?: string; // Paid | Unpaid
  dueDate?: string;
  month?: string;
  year?: number | string;
  paidDate?: string;
  description?: string;
}

/**
 * Build a branded fee challan / installment invoice.
 */
export async function buildFeeChallan(data: FeeChallanData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const ctx: LayoutCtx = { doc, W, M, y: 0 };

  await drawHeader(ctx, {
    instituteName: data.instituteName,
    branchName: data.branchName,
    docTitle: 'Fee Challan',
    docSubtitle: data.docSubtitle || 'Accountant Office',
    refLabel: 'Challan #',
    refValue: data.challanNo || data.refValue || '—',
  });

  drawSection(ctx, 'Student Details');
  drawInfoGrid(ctx, [
    ['Student Name', data.studentName || '—'],
    ['Roll Number', data.rollNo || '—'],
    ['Class', data.className ? `${data.className}${data.section ? ' · ' + data.section : ''}` : '—'],
    ['Fee Type', data.type || 'Tuition'],
    [
      'Period',
      data.dueDate
        ? `Due ${fmtDate(data.dueDate)}`
        : `${data.month || ''}${data.year ? ' ' + data.year : ''}`.trim() || '—',
    ],
    ['Status', data.status || 'Unpaid'],
  ]);

  ctx.y += 8;
  drawSection(ctx, 'Fee Breakdown');
  drawTable(
    ctx,
    [
      { header: 'Description', align: 'left', width: 0.7 },
      { header: 'Amount (Rs)', align: 'right', width: 0.3 },
    ],
    [
      [
        data.description ||
          (data.type === 'Installment'
            ? `Installment — Due ${fmtDate(data.dueDate)}`
            : `${data.type || 'Tuition'} Fee — ${data.month || ''} ${data.year || ''}`.trim()),
        Number(data.amount || 0).toLocaleString('en-PK'),
      ],
    ],
  );

  drawTotal(ctx, 'Total Payable', fmtMoney(data.amount));

  // Status pill
  const statusLower = (data.status || '').toLowerCase();
  if (statusLower === 'paid') {
    drawStatusPill(
      ctx,
      'Paid',
      'paid',
      data.paidDate ? `Paid on ${fmtDate(data.paidDate)}` : undefined,
    );
  } else {
    drawStatusPill(
      ctx,
      'Unpaid',
      'unpaid',
      data.dueDate ? `Due ${fmtDate(data.dueDate)}` : 'Please pay before due date',
    );
  }

  // Payment instructions box
  ctx.y += 4;
  setFill(doc, BRAND.bg);
  doc.roundedRect(M, ctx.y, W - 2 * M, 56, 4, 4, 'F');
  setFill(doc, BRAND.orange);
  doc.rect(M, ctx.y, 5, 56, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setText(doc, BRAND.ink);
  doc.text('PAYMENT INSTRUCTIONS', M + 16, ctx.y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, BRAND.muted);
  const inst = [
    'Pay at the college accounts office during working hours (Mon–Sat, 9:00 AM – 2:00 PM).',
    'Online transfers: contact the accounts office for bank details. Quote your Roll Number & Challan #.',
    'Late payment may incur a surcharge as per college policy.',
  ];
  let iy = ctx.y + 30;
  inst.forEach((line) => {
    const lines = doc.splitTextToSize(line, W - 2 * M - 32);
    doc.text(lines, M + 16, iy);
    iy += lines.length * 11;
  });

  drawFooter(ctx);
  return doc;
}

export interface SalarySlipData extends PdfMeta {
  teacherName: string;
  teacherId: string;
  designation?: string;
  month: string;
  year: number | string;
  grossSalary: number | string;
  deductions: number | string;
  netSalary: number | string;
  status?: string; // Paid | Unpaid
  paidDate?: string;
  bankAccount?: string;
}

/**
 * Build a branded salary slip.
 */
export async function buildSalarySlip(data: SalarySlipData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const ctx: LayoutCtx = { doc, W, M, y: 0 };

  await drawHeader(ctx, {
    instituteName: data.instituteName,
    branchName: data.branchName,
    docTitle: 'Salary Slip',
    docSubtitle: `${data.month} ${data.year}`,
    refLabel: 'Employee ID',
    refValue: data.teacherId,
  });

  drawSection(ctx, 'Employee Details');
  drawInfoGrid(ctx, [
    ['Employee Name', data.teacherName],
    ['Employee ID', data.teacherId],
    ['Designation', data.designation || 'Teacher'],
    ['Pay Period', `${data.month} ${data.year}`],
    ['Bank Account', data.bankAccount || '—'],
    ['Status', data.status || 'Unpaid'],
  ]);

  ctx.y += 8;
  drawSection(ctx, 'Salary Breakdown');
  drawTable(
    ctx,
    [
      { header: 'Component', align: 'left', width: 0.6 },
      { header: 'Amount (Rs)', align: 'right', width: 0.4 },
    ],
    [
      ['Gross Salary', Number(data.grossSalary || 0).toLocaleString('en-PK')],
      ['Deductions', `- ${Number(data.deductions || 0).toLocaleString('en-PK')}`],
    ],
  );

  drawTotal(ctx, 'Net Payable', fmtMoney(data.netSalary));

  drawStatusPill(
    ctx,
    (data.status || 'Unpaid').toLowerCase() === 'paid' ? 'Paid' : 'Pending',
    (data.status || '').toLowerCase() === 'paid' ? 'paid' : 'unpaid',
    data.paidDate ? `Paid on ${fmtDate(data.paidDate)}` : undefined,
  );

  drawFooter(ctx);
  return doc;
}

export interface ReportCardData extends PdfMeta {
  studentName: string;
  rollNo: string;
  className: string;
  section?: string;
  term?: string;
  examMonth?: string;
  fatherName?: string;
  fatherContact?: string;
  totalMarks?: number;
  obtainedMarks?: number;
  grade?: string;
  position?: string;
  subjects: { name: string; total: number; obtained: number; grade: string }[];
  remarks?: string;
}

/** Convert a percentage to a letter grade (Concordia grading scale). */
export function gradeFromPct(pct: number | null | undefined): string {
  if (pct == null || isNaN(pct)) return '—';
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 40) return 'E';
  return 'F';
}

/**
 * Build a branded result / report card.
 */
export async function buildReportCard(data: ReportCardData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const ctx: LayoutCtx = { doc, W, M, y: 0 };

  await drawHeader(ctx, {
    instituteName: data.instituteName,
    branchName: data.branchName,
    docTitle: 'Result Card',
    docSubtitle: data.term || data.docSubtitle || 'Academic Assessment',
    refLabel: 'Roll No.',
    refValue: data.rollNo || '—',
  });

  drawSection(ctx, 'Student Details');
  drawInfoGrid(ctx, [
    ['Student Name', data.studentName],
    ['Roll Number', data.rollNo],
    ['Father / Guardian', data.fatherName || '—'],
    ['Father Contact', data.fatherContact || '—'],
    ['Class', data.className ? `${data.className}${data.section ? ' · ' + data.section : ''}` : '—'],
    ['Term / Exam', data.term || data.examMonth || '—'],
  ]);

  ctx.y += 8;
  drawSection(ctx, 'Subject-wise Marks');
  drawTable(
    ctx,
    [
      { header: 'Subject', align: 'left', width: 0.45 },
      { header: 'Total', align: 'center', width: 0.15 },
      { header: 'Obtained', align: 'center', width: 0.2 },
      { header: 'Grade', align: 'center', width: 0.2 },
    ],
    data.subjects.map((s) => [s.name, String(s.total), String(s.obtained), s.grade]),
  );

  // Summary
  const pct = data.totalMarks && data.obtainedMarks
    ? Math.round((Number(data.obtainedMarks) / Number(data.totalMarks)) * 100)
    : null;
  drawInfoGrid(ctx, [
    ['Total Marks', data.totalMarks ? String(data.totalMarks) : '—'],
    ['Obtained', data.obtainedMarks ? String(data.obtainedMarks) : '—'],
    ['Percentage', pct != null ? `${pct}%` : '—'],
    ['Grade', data.grade || '—'],
    ['Position', data.position || '—'],
    ['Remarks', data.remarks || '—'],
  ]);

  // Pass/Fail status — F grade is a fail, anything else (A+ to E) is a pass.
  const isPass = data.grade && data.grade !== 'F' && data.grade !== '—';
  drawStatusPill(
    ctx,
    isPass ? 'PASSED' : (data.grade === 'F' ? 'FAILED' : 'Result'),
    isPass ? 'confirmed' : 'pending',
    [data.grade ? `Grade ${data.grade}` : '', pct != null ? `${pct}% · ${data.obtainedMarks}/${data.totalMarks}` : ''].filter(Boolean).join(' · ') || undefined,
  );

  drawFooter(ctx);
  return doc;
}

// ---------------------------------------------------------------------------
// Student credentials slip — printable handout with the student's details +
// portal username & password. Given to students/parents when the login is
// issued, and re-printable any time from the student record.
// ---------------------------------------------------------------------------

export interface StudentCredentialsData {
  name?: string;
  fatherName?: string;
  program?: string;      // human label
  part?: string;
  section?: string;
  rollNo?: string;       // = username
  password?: string;
  cnic?: string;
  phone?: string;
  baseFee?: number | string | null;
  campus?: string;
}

export function buildStudentCredentialsSlip(d: StudentCredentialsData): jsPDF {
  const doc = new jsPDF();
  doc.setFontSize(20); doc.setTextColor('#F26522'); doc.text('Concordia College', 20, 24);
  doc.setTextColor('#111827'); doc.setFontSize(13); doc.text('Student Record & Portal Login', 20, 35);
  doc.setDrawColor('#e5e7eb'); doc.line(20, 40, 190, 40);
  doc.setFontSize(11);
  let y = 54;
  const line = (label: string, val: any) => {
    doc.setTextColor('#6b7280'); doc.text(`${label}:`, 20, y);
    doc.setTextColor('#111827'); doc.text(String(val ?? '—'), 75, y);
    y += 10;
  };
  line('Student Name', d.name);
  line('Father / Guardian', d.fatherName);
  line('Program', d.program);
  line('Part / Section', [d.part ? `Part ${d.part}` : '', d.section].filter(Boolean).join(' · ') || '—');
  line('CNIC / B-Form', d.cnic);
  line('Contact', d.phone);
  if (d.baseFee != null && d.baseFee !== '') line('Base Fee', `Rs ${Number(d.baseFee).toLocaleString()}`);
  y += 4; doc.setDrawColor('#e5e7eb'); doc.line(20, y, 190, y); y += 12;
  doc.setFontSize(13); doc.setTextColor('#111827'); doc.text('Portal Login', 20, y); y += 12;
  doc.setFontSize(13);
  doc.text(`Username / Roll No:   ${d.rollNo ?? '—'}`, 20, y); y += 11;
  doc.text(`Password:   ${d.password ?? '—'}`, 20, y); y += 12;
  doc.setFontSize(9); doc.setTextColor('#6b7280');
  doc.text('Sign in at the Concordia portal (web or mobile app) with the above. Keep these safe —', 20, y); y += 6;
  doc.text('the password is managed by the college; for a reset, contact the Accountant office.', 20, y);
  return doc;
}

// ---------------------------------------------------------------------------
// Convenience helpers — caller chooses download vs print
// ---------------------------------------------------------------------------

/** Save the doc as a file (triggers browser download). */
export function savePdf(doc: jsPDF, fileName: string) {
  doc.save(fileName);
}

/** Open the doc in a new browser tab and trigger the print dialog. */
export function printPdf(doc: jsPDF) {
  const blobUrl = doc.output('bloburl');
  const w = window.open(blobUrl, '_blank');
  if (w) {
    w.addEventListener('load', () => {
      try {
        w.focus();
        w.print();
      } catch {
        /* user can Ctrl+P manually */
      }
    });
  }
}
