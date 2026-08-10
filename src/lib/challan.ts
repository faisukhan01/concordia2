// ─────────────────────────────────────────────────────────────
// Concordia College — Fee Challan (exact 3-copy Star Rise format)
//
// Replicates the "Fee Challan Template.pdf": three identical copies
// (Student / College / Bank) side by side on a landscape A4, with the
// Concordia logo, Faisal Bank / Star Rise Education account block, the
// student details, particulars + amount, QR code, payable-within / after,
// due date, arrears, the 3 notes, and the copy-label footer.
//
// Assets (in /public): challan-logo.jpg (Concordia logo), challan-qr.png (QR).
// ─────────────────────────────────────────────────────────────
import jsPDF from 'jspdf';

export interface ChallanData {
  collegeName?: string;
  campus?: string;
  bankName?: string;
  bankTitle?: string;
  bankAcct?: string;
  payableBefore?: string;
  studentId?: string;
  billNo?: string;
  studentName?: string;
  fatherName?: string;
  className?: string;
  section?: string;
  feeIns?: string;        // e.g. "1 of 3"
  particulars?: string;   // e.g. "Dec Jan Feb Payable"
  items?: { name: string; amount: number }[];
  payableWithin?: number;
  payableAfter?: number;
  dueDate?: string;
  arrears?: string;       // e.g. "Ins:1 Amount: 18333"
}

async function loadDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const money = (n: number | undefined | null) =>
  'Rs. ' + Math.round(Number(n) || 0).toLocaleString('en-US');

export async function buildConcordiaChallan(d: ChallanData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const [logo, qr] = await Promise.all([
    loadDataUrl('/challan-logo.jpg'),
    loadDataUrl('/challan-qr.png'),
  ]);

  const pageW = 297;
  const margin = 6;
  const gap = 4;
  const copyW = (pageW - margin * 2 - gap * 2) / 3;
  const top = 8;
  const labels = ['STUDENT COPY', 'COLLEGE COPY', 'BANK COPY'];
  for (let i = 0; i < 3; i++) {
    drawCopy(doc, margin + i * (copyW + gap), top, copyW, labels[i], d, logo, qr);
  }
  return doc;
}

// Combine many students' challans into ONE multi-page PDF — one landscape A4
// page (3 copies) per student. Ideal for printing a whole section at once.
// Assets are loaded a single time and reused across every page.
export async function buildConcordiaChallanBook(list: ChallanData[]): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const [logo, qr] = await Promise.all([
    loadDataUrl('/challan-logo.jpg'),
    loadDataUrl('/challan-qr.png'),
  ]);

  const pageW = 297;
  const margin = 6;
  const gap = 4;
  const copyW = (pageW - margin * 2 - gap * 2) / 3;
  const top = 8;
  const labels = ['STUDENT COPY', 'COLLEGE COPY', 'BANK COPY'];

  list.forEach((d, idx) => {
    if (idx > 0) doc.addPage();
    for (let i = 0; i < 3; i++) {
      drawCopy(doc, margin + i * (copyW + gap), top, copyW, labels[i], d, logo, qr);
    }
  });
  return doc;
}

function drawCopy(
  doc: jsPDF,
  x: number,
  top: number,
  w: number,
  copyLabel: string,
  d: ChallanData,
  logo: string | null,
  qr: string | null,
) {
  const BLACK: [number, number, number] = [25, 25, 25];
  // All challan text is black (name/father/class values + notes included).
  const BLUE: [number, number, number] = [25, 25, 25];
  const GREY: [number, number, number] = [216, 216, 216];
  const rightX = x + w;

  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.2);
  let y = top;

  const box = (h: number) => { doc.rect(x, y, w, h); };
  const bar = (h: number) => {
    doc.setFillColor(GREY[0], GREY[1], GREY[2]);
    doc.rect(x, y, w, h, 'FD');
  };
  const T = (
    str: any,
    px: number,
    py: number,
    o: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center' } = {},
  ) => {
    const { size = 7, bold = false, color = BLACK, align = 'left' } = o;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(String(str ?? ''), px, py, { align });
  };

  // 1 ── Header: logo | college name
  const hHeader = 17;
  box(hHeader);
  const dividerH = x + w * 0.34;
  if (logo) {
    try {
      const lw = 11, lh = Math.min(lw * (745 / 541), hHeader - 2);
      doc.addImage(logo, 'JPEG', x + (w * 0.34 - lw) / 2 + 1, y + (hHeader - lh) / 2, lw, lh);
    } catch {}
  }
  doc.line(dividerH, y, dividerH, y + hHeader);
  T(d.collegeName || 'Concordia College', dividerH + 3, y + 7.5, { size: 9.5, bold: true });
  T(d.campus || 'Canal Campus Lahore', dividerH + 3, y + 12.5, { size: 9.5, bold: true });
  y += hHeader;

  // 2 ── Bank block
  const hBank = 15;
  box(hBank);
  T(d.bankName || 'Faisal Bank-Payable at any branch.', x + 2, y + 5, { size: 7.5, bold: true });
  T('Title:-' + (d.bankTitle || 'Star Rise Education'), x + 2, y + 9.5, { size: 7.5, bold: true });
  T('A/c No:- ' + (d.bankAcct || '3568301000004558'), x + 2, y + 14, { size: 7.5, bold: true });
  y += hBank;

  // 3 ── "Payable on or before" bar
  const hBar1 = 5.5;
  bar(hBar1);
  T('Payable on or before', x + 2, y + 3.9, { size: 7, bold: true });
  T(d.payableBefore || '', rightX - 2, y + 3.9, { size: 7, bold: true, align: 'right' });
  y += hBar1;

  // 4 ── Student details
  const hStu = 22;
  box(hStu);
  let sy = y + 5;
  T('Student ID:', x + 2, sy, { size: 7, bold: true });
  T(d.studentId || '', x + 17, sy, { size: 7, bold: true });
  T('Bill No. ' + (d.billNo || ''), rightX - 2, sy, { size: 7, bold: true, align: 'right' });
  sy += 5.5;
  T('Student Name:', x + 2, sy, { size: 7, bold: true });
  T(d.studentName || '', rightX - 2, sy, { size: 7.5, bold: true, color: BLUE, align: 'right' });
  sy += 5.5;
  T('Father Name:', x + 2, sy, { size: 7, bold: true });
  T(d.fatherName || '', rightX - 2, sy, { size: 7.5, bold: true, color: BLUE, align: 'right' });
  sy += 5.5;
  T('Class:', x + 2, sy, { size: 7, bold: true });
  T(d.className || '', x + 12, sy, { size: 7, bold: true, color: BLUE });
  T('Section:', x + w * 0.42, sy, { size: 7, bold: true });
  T(d.section || '', x + w * 0.42 + 12, sy, { size: 7, bold: true, color: BLUE });
  T('Fee Ins: ' + (d.feeIns || ''), rightX - 2, sy, { size: 7, bold: true, align: 'right' });
  y += hStu;

  // 5 ── "Particulars" bar
  const hBar2 = 5.5;
  bar(hBar2);
  T('Particulars', x + 2, y + 3.9, { size: 7, bold: true });
  T(d.particulars || '', rightX - 2, y + 3.9, { size: 7, bold: true, align: 'right' });
  y += hBar2;

  // 6 ── Fee area (item + amount, QR bottom-right), vertical divider
  const hFee = 56;
  box(hFee);
  const xd = x + w * 0.55;
  doc.line(xd, y, xd, y + hFee);
  let fy = y + 5.5;
  (d.items && d.items.length ? d.items : [{ name: 'College Fee', amount: d.payableWithin || 0 }]).forEach((it) => {
    T(it.name, x + 2, fy, { size: 7.5, bold: true });
    T(money(it.amount), rightX - 2, fy, { size: 7.5, align: 'right' });
    fy += 6;
  });
  if (qr) {
    try {
      const qs = 22;
      doc.addImage(qr, 'PNG', rightX - qs - 4, y + hFee - qs - 5, qs, qs);
    } catch {}
  }
  y += hFee;

  // 7-10 ── Payable within / after / Due Date / Arrears
  const rows: [string, string][] = [
    ['Payable within due date', money(d.payableWithin)],
    ['Payable after due date', money(d.payableAfter)],
    ['Due Date', d.dueDate || ''],
    ['Arrears', d.arrears || ''],
  ];
  const hRow = 6.5;
  rows.forEach(([l, v]) => {
    box(hRow);
    T(l, x + 2, y + 4.4, { size: 7, bold: true });
    T(v, rightX - 2, y + 4.4, { size: 7, bold: true, align: 'right' });
    y += hRow;
  });

  // 11 ── Notes
  const hNotes = 16;
  box(hNotes);
  const notes = [
    '1- Rs 50/- Will be charged in case of Re-Issuance of Challan.',
    '2- Scholarship/Concession will be continued on the basis of 80% attendance.',
    '3- Dues once paid are non refundable or non transferable.',
  ];
  let ny = y + 4;
  notes.forEach((n) => {
    const wrapped = doc.splitTextToSize(n, w - 4) as string[];
    wrapped.forEach((ln) => { T(ln, x + 2, ny, { size: 6, color: BLUE }); ny += 3.1; });
    ny += 0.6;
  });
  y += hNotes;

  // 12 ── Copy label footer
  const hF = 6.5;
  bar(hF);
  T(copyLabel, x + w / 2, y + 4.4, { size: 8, bold: true, align: 'center' });
  y += hF;

  // Clean outer border
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.4);
  doc.rect(x, top, w, y - top);
}
