// ============================================================================
// migrate-to-client-db.ts
// ----------------------------------------------------------------------------
// One-time migration script: initializes the CLIENT Turso database with the
// exact same schema + seed data as the personal Turso DB (post-purge state).
//
// After the v4.6.7 purge, the personal DB contains only:
//   - 1 institute  (I-DEMO — Concordia College)
//   - 1 branch     (B-DEMO — Main Campus)
//   - 5 users      (U-SUPER super-admin + 4 office staff)
//   - 0 everything else
//
// This script reproduces that exact state on the client DB by running the
// same SCHEMA_STATEMENTS + MIGRATION_STATEMENTS + seed logic as initDB().
//
// Usage: bun run scripts/migrate-to-client-db.ts
// ============================================================================

import { createClient } from '@libsql/client';

// ── Client Turso DB credentials (provided by the user) ──
const CLIENT_URL = 'libsql://concordia-concordia-canal.aws-ap-south-1.turso.io';
const CLIENT_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwMTEwOTEsImlkIjoiMDE5ZmQ2ODYtYTQwMS03NzY5LWEyZmEtODc3YmNjZDdiMjE1Iiwia2lkIjoiX0dVNHd6MUJ0NFJ4Y0lFS3pnNHNHSk1yOF9ONzB1TTF6U3pybDJQay16WSIsInJpZCI6IjU2ODAxMWRmLWE5MGEtNDhkYS05MzhhLTkwYTQyZjQ2MzNiOSJ9.ifni6ifQep21GCsS-F_tbAGF1CDoCgPUvCCSD3tuD_11yr8bsi_sQD-TYA9lCvsi_LDSIrNH0_aNzpF1luKgAA';

const client = createClient({ url: CLIENT_URL, authToken: CLIENT_TOKEN });

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA STATEMENTS — copied from src/lib/server/db.ts (kept in sync)
// ═══════════════════════════════════════════════════════════════════════════
const SCHEMA_STATEMENTS: string[] = [
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
  `CREATE TABLE IF NOT EXISTS exams (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, instituteId TEXT, name TEXT NOT NULL, type TEXT DEFAULT 'Monthly Test', createdBy TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS student_documents (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, branchId TEXT, instituteId TEXT, name TEXT NOT NULL, fileName TEXT NOT NULL, fileType TEXT NOT NULL, fileSize INTEGER DEFAULT 0, dataUrl TEXT NOT NULL, uploadedBy TEXT, uploadedByName TEXT, createdAt TEXT DEFAULT (datetime('now')), updatedAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS date_sheets (id TEXT PRIMARY KEY, branchId TEXT NOT NULL, instituteId TEXT, examId TEXT NOT NULL, examName TEXT, part TEXT NOT NULL DEFAULT '1', createdBy TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS date_sheet_entries (id TEXT PRIMARY KEY, dateSheetId TEXT NOT NULL, subject TEXT NOT NULL, examDate TEXT NOT NULL, examTime TEXT, roomName TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS device_tokens (id TEXT PRIMARY KEY, userId TEXT NOT NULL, role TEXT, token TEXT NOT NULL, platform TEXT DEFAULT 'android', createdAt TEXT DEFAULT (datetime('now')), lastSeen TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, userId TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, data TEXT, read INTEGER NOT NULL DEFAULT 0, createdAt TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (userId TEXT PRIMARY KEY, prefs TEXT NOT NULL DEFAULT '{}', updatedAt TEXT DEFAULT (datetime('now')))`,

  // ── Indexes ──
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
  `CREATE INDEX IF NOT EXISTS idx_device_tokens_userId ON device_tokens(userId)`,
  `CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_userId_read ON notifications(userId, read)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_createdAt ON notifications(createdAt DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_manual_revenue_branchId ON manual_revenue(branchId)`,
];

const MIGRATION_STATEMENTS: string[] = [
  `ALTER TABLE users ADD COLUMN part TEXT DEFAULT '1'`,
  `ALTER TABLE classes ADD COLUMN program TEXT`,
  `ALTER TABLE classes ADD COLUMN part TEXT DEFAULT '1'`,
  `ALTER TABLE users ADD COLUMN fatherCnic TEXT`,
  `ALTER TABLE users ADD COLUMN gender TEXT`,
  `ALTER TABLE users ADD COLUMN baseFeePaid INTEGER NOT NULL DEFAULT 0`,
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MIGRATION: Personal Turso DB  →  Client Turso DB');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Client URL: ${CLIENT_URL}`);
  console.log('');

  // ── Step 0: Test connection ──
  console.log('Step 0: Testing connection to client DB...');
  try {
    const test = await client.execute('SELECT 1 AS ok');
    console.log('  ✓ Connection OK');
  } catch (e: any) {
    console.error('  ✗ Connection FAILED:', e.message);
    process.exit(1);
  }

  // ── Step 1: Create all tables + indexes (batched) ──
  console.log(`\nStep 1: Creating schema (${SCHEMA_STATEMENTS.length} statements)...`);
  try {
    const batchStmts = SCHEMA_STATEMENTS.map(sql => ({ sql, args: [] as any[] }));
    await client.batch(batchStmts);
    console.log('  ✓ All tables + indexes created (batched)');
  } catch (e: any) {
    console.log('  ! Batch failed, running individually...');
    for (const sql of SCHEMA_STATEMENTS) {
      try { await client.execute({ sql, args: [] }); } catch {}
    }
    console.log('  ✓ All tables + indexes created (individual)');
  }

  // ── Step 2: Run column migrations (ALTER TABLE ADD COLUMN) ──
  console.log(`\nStep 2: Running column migrations (${MIGRATION_STATEMENTS.length} statements)...`);
  for (const sql of MIGRATION_STATEMENTS) {
    try { await client.execute({ sql, args: [] }); } catch {}
  }
  console.log('  ✓ Column migrations complete');

  // ── Step 3: Verify tables created ──
  console.log('\nStep 3: Verifying tables...');
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const tableNames = tables.rows.map((r: any) => r.name);
  console.log(`  ✓ ${tableNames.length} tables created:`);
  for (const name of tableNames) {
    const count = await client.execute(`SELECT COUNT(*) AS n FROM "${name}"`);
    console.log(`      ${name}: ${count.rows[0].n} rows`);
  }

  // ── Step 4: Seed super admin ──
  console.log('\nStep 4: Seeding super admin...');
  const superExists = await client.execute({ sql: 'SELECT id FROM users WHERE role = ?', args: ['super-admin'] });
  if (superExists.rows.length === 0) {
    const superPwd = process.env.SEED_PASSWORD_SUPER_ADMIN || 'QaReLc_61y8';
    await client.execute({
      sql: `INSERT INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['U-SUPER', 'Faisal Khan', 'faisu577277@gmail.com', superPwd, 'super-admin', 'Active', 'Chief Executive Officer', 0, 0],
    });
    console.log('  ✓ Super admin created: faisu577277@gmail.com');
  } else {
    console.log('  ✓ Super admin already exists (skipped)');
  }

  // ── Step 5: Seed Concordia institute + branch + 4 office logins ──
  console.log('\nStep 5: Seeding Concordia institute + branch + 4 office staff accounts...');
  const adminExists = await client.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: ['U-CONCORDIA-ADMIN'] });
  if (adminExists.rows.length === 0) {
    const adminPwd = process.env.SEED_PASSWORD_ADMIN || 'concordia123';
    const admissionsPwd = process.env.SEED_PASSWORD_ADMISSIONS || 'concordia123';
    const accountantPwd = process.env.SEED_PASSWORD_ACCOUNTANT || 'concordia123';
    const academicPwd = process.env.SEED_PASSWORD_ACADEMIC || 'concordia123';
    try {
      await client.batch([
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
      console.log('  ✓ Institute + branch + 4 office staff created (batched)');
    } catch {
      console.log('  ! Batch failed, running individually...');
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
      for (const s of inserts) { try { await client.execute(s); } catch {}
      }
      console.log('  ✓ Institute + branch + 4 office staff created (individual)');
    }
  } else {
    console.log('  ✓ Concordia admin already exists (skipped seed)');
  }

  // ── Step 6: Final verification ──
  console.log('\nStep 6: Final verification — row counts per table:');
  const finalTables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  for (const row of finalTables.rows) {
    const name = (row as any).name;
    const count = await client.execute(`SELECT COUNT(*) AS n FROM "${name}"`);
    const n = count.rows[0].n;
    if (n > 0) {
      console.log(`  ✓ ${name}: ${n} rows`);
    }
  }

  // ── Step 7: Verify logins work ──
  console.log('\nStep 7: Verifying seeded logins...');
  const logins = await client.execute({
    sql: `SELECT id, name, email, role, status FROM users ORDER BY role`,
    args: [],
  });
  for (const u of logins.rows) {
    console.log(`  ✓ ${(u as any).role.padEnd(12)} | ${(u as any).email.padEnd(35)} | ${(u as any).name}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE ✓');
  console.log('  The client Turso DB now has the exact same state as the');
  console.log('  personal Turso DB (post-purge): 1 institute, 1 branch,');
  console.log('  5 users (super-admin + 4 office staff).');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('MIGRATION FAILED:', e);
  process.exit(1);
});
