import { createClient } from '@libsql/client';

// ─────────────────────────────────────────────────────────────
// Database client — Turso (production) + local SQLite (dev fallback)
//
// PRODUCTION (Vercel): uses Turso exclusively. TURSO_DATABASE_URL +
//   TURSO_AUTH_TOKEN are configured in the Vercel project env vars.
//   Turso is the single source of truth — all data persists there.
//
// LOCAL DEV: if TURSO_AUTH_TOKEN is set in .env, uses Turso too.
//   If the token is missing (e.g. fresh checkout), falls back to a
//   local SQLite file so the dev server still runs.
//
// PERFORMANCE: initDB() is cached for the LIFETIME of the server
//   process (not just the schema flag). The schema + indexes + seed
//   + cleanup run AT MOST ONCE per cold start. Every subsequent
//   API request skips all of that and goes straight to the handler.
//   This is critical for Turso (remote) where each SQL statement is
//   a network round-trip — previously initDB ran ~30+ statements on
//   every single request, making every page painfully slow.
// ─────────────────────────────────────────────────────────────
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';
const LOCAL_DB = process.env.DATABASE_URL;

// Turso is used when BOTH the URL and a non-empty token are present.
const useTurso = !!(TURSO_URL && TURSO_TOKEN);
const dbUrl = useTurso ? TURSO_URL! : (LOCAL_DB || 'file:./db/custom.db');
const dbToken = useTurso ? TURSO_TOKEN : '';

if (useTurso) {
  // Production / authenticated dev — Turso
} else if (LOCAL_DB) {
  console.info('[db] TURSO_AUTH_TOKEN not set — using local SQLite at', LOCAL_DB, '(dev only. Production uses Turso.)');
} else {
  console.warn('[db] TURSO_AUTH_TOKEN not set — using local SQLite at file:./db/custom.db (dev only. Production uses Turso.)');
}

export const db = createClient({
  url: dbUrl,
  authToken: dbToken,
});

// ─────────────────────────────────────────────────────────────
// ONE-TIME initialization — schema + indexes + seed + cleanup.
// Cached for the LIFETIME of the server process so warm lambdas /
// hot-reloaded dev servers never re-run the 30+ statements.
// ─────────────────────────────────────────────────────────────
let initPromise: Promise<void> | null = null;

// === All schema statements (tables + indexes) ===
// Run in a SINGLE batched transaction so Turso does one round-trip
// instead of ~50 separate ones.
const SCHEMA_STATEMENTS: string[] = [
  // ── Tables ──
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, rollNo TEXT, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', status TEXT NOT NULL DEFAULT 'Active', title TEXT DEFAULT '', mustChangePassword INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, blockedReason TEXT, instituteId TEXT, branchId TEXT, class TEXT, section TEXT DEFAULT 'A', part TEXT DEFAULT '1', guardian TEXT, ward TEXT, wardId TEXT, subjects TEXT, classes TEXT, createdById TEXT, createdAt TEXT DEFAULT (datetime('now')), baseFee REAL, baseFeeLocked INTEGER NOT NULL DEFAULT 0, fatherName TEXT, cnic TEXT, dob TEXT, address TEXT, prevResult TEXT, program TEXT, photoUrl TEXT, guardianPhone TEXT)`,
  `CREATE TABLE IF NOT EXISTS institutes (id TEXT PRIMARY KEY, name TEXT NOT NULL, short TEXT, city TEXT DEFAULT '', country TEXT DEFAULT 'USA', plan TEXT DEFAULT 'Starter', status TEXT DEFAULT 'Trial', adminName TEXT, adminEmail TEXT, branches INTEGER DEFAULT 0, students INTEGER DEFAULT 0, staff INTEGER DEFAULT 0, revenue REAL DEFAULT 0, createdAt TEXT DEFAULT (datetime('now')), color TEXT DEFAULT 'emerald', domain TEXT DEFAULT 'edu', blocked INTEGER NOT NULL DEFAULT 0, blockedReason TEXT)`,
  `CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, instituteId TEXT NOT NULL, name TEXT NOT NULL, city TEXT DEFAULT '', manager TEXT, managerEmail TEXT, students INTEGER DEFAULT 0, teachers INTEGER DEFAULT 0, status TEXT DEFAULT 'Active', createdAt TEXT DEFAULT (datetime('now')), blocked INTEGER NOT NULL DEFAULT 0, blockedReason TEXT)`,
  `CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, name TEXT NOT NULL, section TEXT DEFAULT 'A', program TEXT, part TEXT DEFAULT '1', teacherId TEXT)`,
  `CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, name TEXT NOT NULL, code TEXT)`,
  `CREATE TABLE IF NOT EXISTS class_courses (id TEXT PRIMARY KEY, classId TEXT NOT NULL, courseId TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS teacher_class_courses (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, classId TEXT NOT NULL, courseId TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, senderId TEXT NOT NULL, senderRole TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, targetRole TEXT, targetScope TEXT DEFAULT 'all', targetIds TEXT, instituteId TEXT, branchId TEXT, classId TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, branchId TEXT, classId TEXT, date TEXT NOT NULL, teacherId TEXT, records TEXT NOT NULL, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, branchId TEXT, exam TEXT NOT NULL, courseId TEXT, classId TEXT, teacherId TEXT, totalMarks INTEGER DEFAULT 100, date TEXT NOT NULL, records TEXT NOT NULL, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS fees (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, instituteId TEXT, branchId TEXT, amount REAL NOT NULL, type TEXT DEFAULT 'Tuition', method TEXT DEFAULT 'Online', date TEXT NOT NULL, status TEXT DEFAULT 'Paid')`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL, role TEXT NOT NULL, issuedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS fee_structure (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, classId TEXT NOT NULL, monthlyFee REAL NOT NULL DEFAULT 0, admissionFee REAL DEFAULT 0, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS fee_invoices (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT, className TEXT, branchId TEXT, instituteId TEXT, month TEXT NOT NULL, year INTEGER NOT NULL, amount REAL NOT NULL, type TEXT DEFAULT 'Tuition', status TEXT DEFAULT 'Unpaid', paidDate TEXT, paidAmount REAL DEFAULT 0, paymentMethod TEXT, challanNo TEXT, createdAt TEXT DEFAULT (datetime('now')), dueDate TEXT)`,
  `CREATE TABLE IF NOT EXISTS teacher_salaries (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, instituteId TEXT, branchId TEXT, monthlySalary REAL NOT NULL DEFAULT 0, effectiveFrom TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS salary_payments (id TEXT PRIMARY KEY, teacherId TEXT NOT NULL, teacherName TEXT, instituteId TEXT, branchId TEXT, month TEXT NOT NULL, year INTEGER NOT NULL, amount REAL NOT NULL, status TEXT DEFAULT 'Paid', paidDate TEXT, paymentMethod TEXT DEFAULT 'Bank Transfer', notes TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, startDate TEXT, endDate TEXT, location TEXT, type TEXT DEFAULT 'Event', instituteId TEXT, branchId TEXT, createdBy TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS manual_revenue (id TEXT PRIMARY KEY, enteredBy TEXT NOT NULL, enteredByRole TEXT NOT NULL, instituteId TEXT, sourceType TEXT NOT NULL, sourceId TEXT NOT NULL, sourceName TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, month TEXT NOT NULL, year INTEGER NOT NULL, notes TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS timetable (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, classId TEXT, className TEXT, section TEXT DEFAULT 'A', day TEXT NOT NULL, period INTEGER NOT NULL, startTime TEXT, endTime TEXT, subject TEXT, teacherId TEXT, teacherName TEXT, roomId TEXT, roomName TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS report_cards (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT, class TEXT, section TEXT DEFAULT 'A', branchId TEXT, instituteId TEXT, term TEXT NOT NULL, examName TEXT, totalMarks INTEGER DEFAULT 0, obtainedMarks INTEGER DEFAULT 0, percentage REAL DEFAULT 0, grade TEXT, remarks TEXT, generatedBy TEXT, generatedAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS misc_charges (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT, branchId TEXT, instituteId TEXT, type TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, description TEXT, createdBy TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  // Exams scheduled by the Academic Office (Monthly Test 1, Midterm, Final, …).
  // Each branch can have many exams; names must be unique per branch so
  // teachers, date sheets, and result cards can reference them unambiguously.
  `CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, instituteId TEXT, name TEXT NOT NULL, type TEXT DEFAULT 'Monthly Test', createdBy TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  // ── Student Documents (Admissions → Student Records → Add Documents) ──
  // Stores Father CNIC, Student B-Form/CNIC, Previous Results, etc.
  // Files are embedded as base64 data URLs (no external file storage needed).
  `CREATE TABLE IF NOT EXISTS student_documents (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, branchId TEXT, instituteId TEXT, name TEXT NOT NULL, fileName TEXT NOT NULL, fileType TEXT NOT NULL, fileSize INTEGER DEFAULT 0, dataUrl TEXT NOT NULL, uploadedBy TEXT, uploadedByName TEXT, createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now')))`,
  // ── Date Sheets (Academic → Exams & Date Sheets) ──
  // A date sheet belongs to one (exam, part) combination — e.g. "Monthly
  // Test 1, Part 1". Each date sheet has multiple entries (subject+date+time).
  `CREATE TABLE IF NOT EXISTS date_sheets (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, instituteId TEXT, examId TEXT NOT NULL, examName TEXT, part TEXT NOT NULL DEFAULT '1', createdBy TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS date_sheet_entries (id TEXT PRIMARY KEY, dateSheetId TEXT NOT NULL, subject TEXT NOT NULL, examDate TEXT NOT NULL, examTime TEXT, roomName TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  // NOTE: legacy tables (diary, sms_log, complaints, library_books,
  // transport_routes, course_materials, royalty_settings, royalty_invoices)
  // are intentionally NOT created here — they are unused by the Concordia
  // spec and were bloating the schema. Existing rows (if any) are left
  // alone; the tables themselves are dropped below to reclaim space.

  // ── Indexes on hot columns (huge perf win for WHERE / JOIN / ORDER BY) ──
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
  `CREATE INDEX IF NOT EXISTS idx_users_branchId ON users(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_users_instituteId ON users(instituteId)`,
  `CREATE INDEX IF NOT EXISTS idx_users_rollNo ON users(rollNo)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email))`,
  `CREATE INDEX IF NOT EXISTS idx_users_class ON users(class)`,
  `CREATE INDEX IF NOT EXISTS idx_users_part ON users(part)`,
  `CREATE INDEX IF NOT EXISTS idx_classes_branchId ON classes(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_classes_program ON classes(program)`,
  `CREATE INDEX IF NOT EXISTS idx_classes_part ON classes(part)`,
  `CREATE INDEX IF NOT EXISTS idx_courses_branchId ON courses(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_class_courses_classId ON class_courses(classId)`,
  `CREATE INDEX IF NOT EXISTS idx_class_courses_courseId ON class_courses(courseId)`,
  `CREATE INDEX IF NOT EXISTS idx_teacher_class_courses_teacherId ON teacher_class_courses(teacherId)`,
  `CREATE INDEX IF NOT EXISTS idx_teacher_class_courses_classId ON teacher_class_courses(classId)`,
  `CREATE INDEX IF NOT EXISTS idx_announcements_createdAt ON announcements(createdAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_announcements_branchId ON announcements(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_announcements_targetRole ON announcements(targetRole)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_classId_date ON attendance(classId, date)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_branchId ON attendance(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_results_classId ON results(classId)`,
  `CREATE INDEX IF NOT EXISTS idx_results_branchId ON results(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_fee_invoices_studentId ON fee_invoices(studentId)`,
  `CREATE INDEX IF NOT EXISTS idx_fee_invoices_branchId ON fee_invoices(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_fee_invoices_status ON fee_invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_fee_invoices_type ON fee_invoices(type)`,
  `CREATE INDEX IF NOT EXISTS idx_fee_structure_branchId ON fee_structure(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt)`,
  `CREATE INDEX IF NOT EXISTS idx_timetable_classId ON timetable(classId)`,
  `CREATE INDEX IF NOT EXISTS idx_timetable_branchId ON timetable(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_timetable_class_day_period ON timetable(classId, day, period)`,
  `CREATE INDEX IF NOT EXISTS idx_timetable_teacherId ON timetable(teacherId)`,
  `CREATE INDEX IF NOT EXISTS idx_timetable_teacher_day_period ON timetable(teacherId, day, period)`,
  `CREATE INDEX IF NOT EXISTS idx_report_cards_studentId ON report_cards(studentId)`,
  `CREATE INDEX IF NOT EXISTS idx_report_cards_branchId ON report_cards(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_misc_charges_studentId ON misc_charges(studentId)`,
  `CREATE INDEX IF NOT EXISTS idx_misc_charges_branchId ON misc_charges(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_exams_branchId ON exams(branchId)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_branch_name ON exams(branchId, name)`,
  `CREATE INDEX IF NOT EXISTS idx_student_documents_studentId ON student_documents(studentId)`,
  `CREATE INDEX IF NOT EXISTS idx_student_documents_branchId ON student_documents(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_date_sheets_examId ON date_sheets(examId)`,
  `CREATE INDEX IF NOT EXISTS idx_date_sheets_branchId ON date_sheets(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_date_sheet_entries_dateSheetId ON date_sheet_entries(dateSheetId)`,
  `CREATE INDEX IF NOT EXISTS idx_teacher_salaries_teacherId ON teacher_salaries(teacherId)`,
  `CREATE INDEX IF NOT EXISTS idx_salary_payments_teacherId ON salary_payments(teacherId)`,
  `CREATE INDEX IF NOT EXISTS idx_events_branchId ON events(branchId)`,
  `CREATE INDEX IF NOT EXISTS idx_manual_revenue_branchId ON manual_revenue(branchId)`,
];

// === Migration statements — add columns to EXISTING tables ===
// SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we run each ALTER
// individually and silently catch "duplicate column name" errors for
// tables that already have the column from a previous init.
const MIGRATION_STATEMENTS: string[] = [
  `ALTER TABLE users ADD COLUMN part TEXT DEFAULT '1'`,
  `ALTER TABLE classes ADD COLUMN program TEXT`,
  `ALTER TABLE classes ADD COLUMN part TEXT DEFAULT '1'`,
  // Extra student fields captured by the Excel bulk-import (Father CNIC + Gender).
  `ALTER TABLE users ADD COLUMN fatherCnic TEXT`,
  `ALTER TABLE users ADD COLUMN gender TEXT`,
];

// === Data migration — backfill program+part on existing classes from name ===
// Maps legacy class names to the new 6-department catalog + part.
const DATA_MIGRATION_STATEMENTS: string[] = [
  // Backfill classes.program from class name patterns
  `UPDATE classes SET program = CASE
    WHEN name LIKE '%FSc%Med%' OR name LIKE '%Pre%Med%' THEN 'FSC Pre Med'
    WHEN name LIKE '%FSc%Eng%' OR name LIKE '%Pre%Eng%' THEN 'FSC Pre Eng'
    WHEN name LIKE '%ICS%Stat%' THEN 'ICS Stats'
    WHEN name LIKE '%ICS%' THEN 'ICS Phy'
    WHEN name LIKE '%FA%IT%' THEN 'FA IT'
    WHEN name LIKE '%I.Com%' OR name LIKE '%ICom%' OR name LIKE '%Commerce%' THEN 'I.Com'
    WHEN name LIKE '%FA%' THEN 'I.Com'
    ELSE program
  END WHERE program IS NULL OR program = ''`,
  // Backfill classes.part from class name patterns (e.g. "ICS-1-A" → part 1)
  `UPDATE classes SET part = CASE
    WHEN name LIKE '%-1-%' OR name LIKE '%Part 1%' OR name LIKE '%1st Year%' THEN '1'
    WHEN name LIKE '%-2-%' OR name LIKE '%Part 2%' OR name LIKE '%2nd Year%' THEN '2'
    ELSE '1'
  END WHERE part IS NULL OR part = ''`,
  // Backfill users.part from their class's part
  `UPDATE users SET part = (
    SELECT COALESCE(c.part, '1') FROM classes c
    WHERE c.name = users.class AND c.branchId = users.branchId
  ) WHERE (part IS NULL OR part = '') AND role = 'student'`,
  // Migrate legacy program names on students to the new 6-dept catalog.
  // NOTE: 'FA' (Faculty of Arts General) was retired and replaced by 'I.Com'.
  // Legacy Commerce-ish programs now map straight to 'I.Com'.
  `UPDATE users SET program = CASE
    WHEN program = 'F.Sc Pre-Medical' THEN 'FSC Pre Med'
    WHEN program = 'F.Sc Pre-Engineering' THEN 'FSC Pre Eng'
    WHEN program = 'ICS' THEN 'ICS Phy'
    WHEN program IN ('F.A General Science', 'ADP', 'BS Commerce', 'I.Com') THEN 'I.Com'
    ELSE program
  END WHERE program IS NOT NULL AND program != ''`,
  // Retire 'FA' → 'I.Com' on any already-migrated students.
  `UPDATE users SET program = 'I.Com' WHERE program = 'FA'`,
  // Retire 'FA' → 'I.Com' on classes too (and keep the class name in sync so
  // the flattened Program→Part→Section drill-down groups them correctly).
  `UPDATE classes SET program = 'I.Com' WHERE program = 'FA'`,
  `UPDATE classes SET name = 'I.Com' WHERE name = 'FA'`,
];

// === One-time cleanup statements — drop unused legacy tables ===
// (These tables are not in the Concordia spec and only bloat the DB.)
const CLEANUP_DROP_TABLES: string[] = [
  `DROP TABLE IF EXISTS Post`,            // Prisma demo table — orphaned
  `DROP TABLE IF EXISTS User`,            // Prisma demo table — orphaned (conflicts with users!)
  `DROP TABLE IF EXISTS diary`,           // Not in spec
  `DROP TABLE IF EXISTS sms_log`,         // Not in spec
  `DROP TABLE IF EXISTS complaints`,      // Not in spec
  `DROP TABLE IF EXISTS library_books`,   // Not in spec
  `DROP TABLE IF EXISTS transport_routes`,// Not in spec
  `DROP TABLE IF EXISTS course_materials`,// Not in spec
  `DROP TABLE IF EXISTS royalty_settings`,// Not in spec
  `DROP TABLE IF EXISTS royalty_invoices`,// Not in spec
];

// === One-time data cleanup — legacy demo/test rows ===
const CLEANUP_DATA: string[] = [
  `DELETE FROM users WHERE role IN ('institute-admin', 'branch-manager')`,
  `DELETE FROM users WHERE id IN ('U-DEMO-TEACHER', 'U-DEMO-STUDENT', 'U-DEMO-PARENT', 'U-DEMO-ADMIN', 'U-DEMO-BRANCH', 'U-7ec51783')`,
  `DELETE FROM timetable WHERE id LIKE 'TT-DEMO-%'`,
  `DELETE FROM fee_invoices WHERE id LIKE 'FI-DEMO-%'`,
  `DELETE FROM attendance WHERE id LIKE 'ATT-DEMO-%'`,
  `DELETE FROM results WHERE id LIKE 'R-DEMO-%'`,
  `DELETE FROM events WHERE id LIKE 'E-DEMO-%'`,
  `DELETE FROM classes WHERE id LIKE 'C-DEMO-%'`,
  `DELETE FROM courses WHERE id LIKE 'CR-DEMO-%'`,
  `DELETE FROM teacher_class_courses WHERE teacherId IN ('U-DEMO-TEACHER', 'U-7ec51783')`,
];

export async function initDB() {
  // Cache the in-flight init promise so concurrent requests wait for
  // the SAME init rather than each triggering their own.
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // ── Step 1: batch-create all tables + indexes in ONE transaction ──
    // Turso/libSQL supports `batch()` which sends all statements in a
    // single round-trip. This turns ~50 sequential awaits into 1.
    try {
      const batchStmts = SCHEMA_STATEMENTS.map(sql => ({ sql, args: [] as any[] }));
      await db.batch(batchStmts);
    } catch (e: any) {
      // Fallback: run individually if batch isn't supported
      for (const sql of SCHEMA_STATEMENTS) {
        try { await db.execute({ sql, args: [] }); } catch {}
      }
    }

    // ── Step 2: drop unused legacy tables (single batch) ──
    try {
      await db.batch(CLEANUP_DROP_TABLES.map(sql => ({ sql, args: [] as any[] })));
    } catch {
      for (const sql of CLEANUP_DROP_TABLES) {
        try { await db.execute({ sql, args: [] }); } catch {}
      }
    }

    // ── Step 2b: run column migrations (ALTER TABLE ADD COLUMN) ──
    // Each statement is run individually — "duplicate column name" errors
    // are silently ignored (column already exists from a prior init).
    for (const sql of MIGRATION_STATEMENTS) {
      try { await db.execute({ sql, args: [] }); } catch {}
    }

    // ── Step 2c: run data migrations (backfill program+part) ──
    try {
      await db.batch(DATA_MIGRATION_STATEMENTS.map(sql => ({ sql, args: [] as any[] })));
    } catch {
      for (const sql of DATA_MIGRATION_STATEMENTS) {
        try { await db.execute({ sql, args: [] }); } catch {}
      }
    }

    // ── Step 3: seed super admin (if missing) ──
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE role = ?', args: ['super-admin'] });
    if (existing.rows.length === 0) {
      const superPwd = process.env.SEED_PASSWORD_SUPER_ADMIN || 'QaReLc_61y8';
      await db.execute({
        sql: `INSERT INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['U-SUPER', 'Faisal Khan', 'faisu577277@gmail.com', superPwd, 'super-admin', 'Active', 'Chief Executive Officer', 0, 0],
      });
    }

    // ── Step 4: seed Concordia institute + branch + 4 office logins (if missing) ──
    const concordiaAdminExists = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: ['U-CONCORDIA-ADMIN'] });
    if (concordiaAdminExists.rows.length === 0) {
      const adminPwd = process.env.SEED_PASSWORD_ADMIN || 'concordia123';
      const admissionsPwd = process.env.SEED_PASSWORD_ADMISSIONS || 'concordia123';
      const accountantPwd = process.env.SEED_PASSWORD_ACCOUNTANT || 'concordia123';
      const academicPwd = process.env.SEED_PASSWORD_ACADEMIC || 'concordia123';
      if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD_ADMIN) {
        console.warn('[security] SEED_PASSWORD_* env vars not set — using dev fallback passwords in production. Set them in Vercel project settings immediately.');
      }
      // Batch all 6 inserts (institute + branch + 4 logins) in one round-trip.
      try {
        await db.batch([
          { sql: `INSERT OR IGNORE INTO institutes (id, name, short, city, country, plan, status, adminName, adminEmail, branches, students, staff, revenue, color, domain, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['I-DEMO', 'Concordia College', 'CC', 'Lahore', 'Pakistan', 'Premium', 'Active', 'Concordia Admin', 'admin@concordia.edu.pk', 1, 0, 4, 0, 'orange', 'edu', 0] },
          { sql: `INSERT OR IGNORE INTO branches (id, instituteId, name, city, manager, managerEmail, students, teachers, status, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['B-DEMO', 'I-DEMO', 'Main Campus', 'Lahore', 'Concordia Admin', 'admin@concordia.edu.pk', 0, 0, 'Active', 0] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ADMIN', 'Concordia Admin', 'admin@concordia.edu.pk', adminPwd, 'admin', 'Active', 'College Administrator', 0, 0, 'I-DEMO', 'B-DEMO'] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ADMISSIONS', 'Admission Office', 'admissions@concordia.edu.pk', admissionsPwd, 'admissions', 'Active', 'Admission Officer', 0, 0, 'I-DEMO', 'B-DEMO'] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ACCOUNTANT', 'Accountant', 'accountant@concordia.edu.pk', accountantPwd, 'accountant', 'Active', 'Chief Accountant', 0, 0, 'I-DEMO', 'B-DEMO'] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ACADEMIC', 'Academic Office', 'academics@concordia.edu.pk', academicPwd, 'academic', 'Active', 'Academic Coordinator', 0, 0, 'I-DEMO', 'B-DEMO'] },
        ]);
      } catch {
        // Fallback to individual inserts
        const inserts = [
          { sql: `INSERT OR IGNORE INTO institutes (id, name, short, city, country, plan, status, adminName, adminEmail, branches, students, staff, revenue, color, domain, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['I-DEMO', 'Concordia College', 'CC', 'Lahore', 'Pakistan', 'Premium', 'Active', 'Concordia Admin', 'admin@concordia.edu.pk', 1, 0, 4, 0, 'orange', 'edu', 0] },
          { sql: `INSERT OR IGNORE INTO branches (id, instituteId, name, city, manager, managerEmail, students, teachers, status, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['B-DEMO', 'I-DEMO', 'Main Campus', 'Lahore', 'Concordia Admin', 'admin@concordia.edu.pk', 0, 0, 'Active', 0] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ADMIN', 'Concordia Admin', 'admin@concordia.edu.pk', adminPwd, 'admin', 'Active', 'College Administrator', 0, 0, 'I-DEMO', 'B-DEMO'] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ADMISSIONS', 'Admission Office', 'admissions@concordia.edu.pk', admissionsPwd, 'admissions', 'Active', 'Admission Officer', 0, 0, 'I-DEMO', 'B-DEMO'] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ACCOUNTANT', 'Accountant', 'accountant@concordia.edu.pk', accountantPwd, 'accountant', 'Active', 'Chief Accountant', 0, 0, 'I-DEMO', 'B-DEMO'] },
          { sql: `INSERT OR IGNORE INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['U-CONCORDIA-ACADEMIC', 'Academic Office', 'academics@concordia.edu.pk', academicPwd, 'academic', 'Active', 'Academic Coordinator', 0, 0, 'I-DEMO', 'B-DEMO'] },
        ];
        for (const s of inserts) { try { await db.execute(s); } catch {} }
      }
    }

    // ── Step 5: legacy data cleanup (single batch) ──
    try {
      await db.batch(CLEANUP_DATA.map(sql => ({ sql, args: [] as any[] })));
    } catch {
      for (const sql of CLEANUP_DATA) {
        try { await db.execute({ sql, args: [] }); } catch {}
      }
    }

    // ── Step 6: re-brand institute + branch to Concordia (idempotent) ──
    try {
      await db.batch([
        { sql: `UPDATE institutes SET name = 'Concordia College', short = 'CC', color = 'orange', students = 0, staff = 4, revenue = 0 WHERE id = 'I-DEMO'`, args: [] },
        { sql: `UPDATE branches SET name = 'Main Campus', manager = 'Concordia Admin', managerEmail = 'admin@concordia.edu.pk', students = 0, teachers = 0 WHERE id = 'B-DEMO'`, args: [] },
      ]);
    } catch {
      try { await db.execute({ sql: `UPDATE institutes SET name = 'Concordia College', short = 'CC', color = 'orange', students = 0, staff = 4, revenue = 0 WHERE id = 'I-DEMO'`, args: [] }); } catch {}
      try { await db.execute({ sql: `UPDATE branches SET name = 'Main Campus', manager = 'Concordia Admin', managerEmail = 'admin@concordia.edu.pk', students = 0, teachers = 0 WHERE id = 'B-DEMO'`, args: [] }); } catch {}
    }
  })();
  return initPromise;
}
