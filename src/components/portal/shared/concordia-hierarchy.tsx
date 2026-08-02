'use client';

// ─────────────────────────────────────────────────────────────
// Concordia College — Department Hierarchy shared components
//
// The 6-department navigation pattern used across Admissions,
// Academic, and Accountant portals:
//   Department → Part 1/Part 2 → Class → Section → (students/records)
//
// This file exports:
//   • DEPARTMENTS — the canonical 6-item list
//   • DeptCardGrid — department selection cards
//   • PartToggle — Part 1 / Part 2 segmented toggle
//   • ClassCardGrid — class selection cards (within a dept+part)
//   • SectionCardGrid — section selection cards (within a class)
//   • HierarchyBreadcrumb — shows the current drill-down path
// ─────────────────────────────────────────────────────────────

import { motion } from 'framer-motion';
import { ChevronRight, GraduationCap, Layers, Users, BookOpen, FlaskConical, Calculator, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// The canonical 6-department catalog for Concordia College.
export const DEPARTMENTS = [
  'FSC Pre Med',
  'FSC Pre Eng',
  'ICS Phy',
  'ICS Stats',
  'FA',
  'FA IT',
] as const;

export type Department = typeof DEPARTMENTS[number];

// Department metadata for card display.
const DEPT_META: Record<string, { icon: LucideIcon; desc: string; gradient: string }> = {
  'FSC Pre Med': { icon: FlaskConical, desc: 'Pre-Medical (Biology, Chemistry, Physics)', gradient: 'from-rose-500/20 to-rose-600/10' },
  'FSC Pre Eng': { icon: Calculator, desc: 'Pre-Engineering (Math, Physics, Chemistry)', gradient: 'from-sky-500/20 to-sky-600/10' },
  'ICS Phy': { icon: Layers, desc: 'Computer Science with Physics', gradient: 'from-violet-500/20 to-violet-600/10' },
  'ICS Stats': { icon: Layers, desc: 'Computer Science with Statistics', gradient: 'from-amber-500/20 to-amber-600/10' },
  'FA': { icon: BookOpen, desc: 'Faculty of Arts (General)', gradient: 'from-emerald-500/20 to-emerald-600/10' },
  'FA IT': { icon: FileText, desc: 'Faculty of Arts with IT', gradient: 'from-teal-500/20 to-teal-600/10' },
};

// ── Breadcrumb ──
export function HierarchyBreadcrumb(props: {
  dept?: string | null;
  part?: string | null;
  cls?: string | null;
  section?: string | null;
  onClear?: () => void;
}) {
  const { dept, part, cls, section, onClear } = props;
  const crumbs: { label: string; onClick?: () => void }[] = [];
  if (dept) crumbs.push({ label: dept });
  if (part) crumbs.push({ label: `Part ${part}` });
  if (cls) crumbs.push({ label: cls });
  if (section) crumbs.push({ label: `Section ${section}` });

  if (crumbs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4 flex-wrap">
      <button
        onClick={onClear}
        className="hover:text-foreground transition-colors font-medium"
      >
        All Departments
      </button>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className={i === crumbs.length - 1 ? 'text-foreground font-semibold' : ''}>{c.label}</span>
        </span>
      ))}
    </div>
  );
}

// ── Department Card Grid ──
export function DeptCardGrid(props: {
  onSelect: (dept: string) => void;
  studentCounts?: Record<string, number>;
}) {
  const { onSelect, studentCounts } = props;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {DEPARTMENTS.map((dept, i) => {
        const meta = DEPT_META[dept];
        const Icon = meta?.icon || GraduationCap;
        const count = studentCounts?.[dept] ?? 0;
        return (
          <motion.button
            key={dept}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect(dept)}
            className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${meta?.gradient || 'from-primary/10 to-primary/5'} p-5 text-left transition-all hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              {count > 0 && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm border border-border/50">
                  {count} students
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">{dept}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{meta?.desc || ''}</p>
            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Part Toggle (Part 1 / Part 2) ──
export function PartToggle(props: {
  value: string;
  onChange: (part: string) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border/50">
      {['1', '2'].map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            value === p
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          }`}
        >
          Part {p}
          <span className="block text-[10px] font-normal opacity-70">
            {p === '1' ? '1st Year' : '2nd Year'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Class Card Grid ──
export function ClassCardGrid(props: {
  classes: { id: string; name: string; section: string; program?: string | null; part?: string | null }[];
  onSelect: (cls: { id: string; name: string; section: string }) => void;
  getSectionCount?: (clsId: string) => number;
  getStudentCount?: (clsId: string) => number;
}) {
  const { classes, onSelect, getSectionCount, getStudentCount } = props;
  if (classes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
        <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm font-medium">No classes found</p>
        <p className="text-xs mt-1">Create classes for this department in Classes &amp; Teachers.</p>
      </div>
    );
  }
  // Group classes by name (a class name may have multiple sections)
  const byName = new Map<string, typeof classes>();
  for (const c of classes) {
    const arr = byName.get(c.name) || [];
    arr.push(c);
    byName.set(c.name, arr);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from(byName.entries()).map(([name, sections], i) => {
        const studentCount = getStudentCount ? sections.reduce((sum, s) => sum + (getStudentCount(s.id) || 0), 0) : 0;
        const secCount = sections.length;
        return (
          <motion.button
            key={name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect({ id: sections[0].id, name: sections[0].name, section: sections[0].section })}
            className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              {secCount > 1 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {secCount} sections
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-foreground">{name}</h3>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              {secCount > 1 && <span>Sections: {sections.map(s => s.section).join(', ')}</span>}
              {studentCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {studentCount} students
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              {secCount > 1 ? 'Select Section' : 'Open'}
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Section Card Grid ──
export function SectionCardGrid(props: {
  sections: { id: string; name: string; section: string }[];
  onSelect: (section: { id: string; name: string; section: string }) => void;
  getStudentCount?: (clsId: string) => number;
}) {
  const { sections, onSelect, getStudentCount } = props;
  if (sections.length <= 1) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {sections.map((s, i) => {
        const count = getStudentCount ? getStudentCount(s.id) || 0 : 0;
        return (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelect(s)}
            className="group rounded-xl border border-border bg-card p-4 text-center transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5"
          >
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-primary/10 border border-primary/20 mb-2">
              <span className="text-lg font-bold text-primary">{s.section}</span>
            </div>
            <p className="text-xs font-semibold text-foreground">Section {s.section}</p>
            {count > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{count} students</p>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
