# EXPLORE-1 — Concordia Web App Codebase Investigation

**Scope**: Backend API handler + 5 portal components + supporting lib files at `/home/z/my-project`.
**Stack**: Next.js 16 · TypeScript · Turso (libSQL) · Zustand · shadcn/ui · Tailwind 4 · jsPDF · recharts (installed but unused).
**Files reviewed**: `src/lib/server/{handler,db,auth}.ts`, `src/lib/{api,pdf-utils,store,role-modules}.ts`, `src/components/portal/{admin,role,admissions,academic,accountant}-portal.tsx`, `package.json`.

> Note: `/home/z/my-project/worklog.md` did **not** exist before this task; this entire report was produced from a fresh read of the source. The work-log entry appended to `worklog.md` is the first one.

---

## 1. Backend API Handler — `src/lib/server/handler.ts` (3165 lines)

The whole backend is a single dispatcher: `handleApiRequest(method, pathSegments, req)` (line 18). Each Express-style route from the previous Node service is mapped to an `if (method === '...' && path === '...')` block. The header comment (lines 5–17) documents the conventions.

### 1.1 Storage layer — `src/lib/server/db.ts` (262 lines)

| Aspect | Detail |
|---|---|
| DB driver | `@libsql/client` (`createClient`) |
| Production | **Turso** — env vars `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` |
| Local dev fallback | Local SQLite file (`DATABASE_URL` or `file:./db/custom.db`) when `TURSO_AUTH_TOKEN` is missing |
| Init | `initDB()` runs **once per cold start** (cached via `initPromise`) — schema + indexes in a single batched transaction, then drop-legacy-tables batch, then seed super-admin + Concordia institute + 4 office logins, then data cleanup batch |
| Seed | `I-DEMO` Concordia College, `B-DEMO` Main Campus, `U-SUPER` (faisu577277@gmail.com), `U-CONCORDIA-ADMIN`, `U-CONCORDIA-ADMISSIONS`, `U-CONCORDIA-ACCOUNTANT`, `U-CONCORDIA-ACADEMIC` (all password `concordia123` unless `SEED_PASSWORD_*` env vars override) |

### 1.2 Authentication — `src/lib/server/auth.ts` (153 lines)

- **Mechanism**: Bearer token in `Authorization` header. Tokens look like `concordia-<64-hex>`.
- **Sessions table**: `sessions(token, userId, role, issuedAt, expiresAt)`. TTL = 8 hours (`SESSION_TTL`).
- **`requireAuth(req)`** (line 75): looks up the token, validates expiry, loads the user (with institute+branch JOIN), checks `status === 'Active'` and `blocked !== 1`, and propagates institute/branch blocked-cascade. Returns the full user row.
- **`requireRole(user, ...roles)`** (line 116): uses `ROLE_EQUIVALENCE` so the new Concordia office roles inherit legacy role permissions:
  ```ts
  'admin'       ≡ ['institute-admin', 'branch-manager']
  'academic'    ≡ ['branch-manager']
  'admissions'  ≡ ['branch-manager']
  'accountant'  ≡ ['branch-manager']
  ```
- **Login rate limiting**: in-memory `loginAttempts` map. 10 failed attempts → 2-minute lockout (`MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION`).
- **Password storage**: **plaintext** (`u.password !== password` in handler.ts:78 and auth.ts:126). Security debt to flag.
- **`buildUserProfile(u)`** (line 49): the canonical user shape returned to the frontend. Includes `id, name, email, rollNo, role, roleLabel, title, status, mustChangePassword, blocked, instituteId/Name/Short, branchId/Name, class, section, guardian, ward, wardId, fatherName, guardianPhone, cnic, dob, address, prevResult, program, photoUrl, classId, subjects (parsed JSON), classes (parsed JSON), baseFee, baseFeeLocked, campus`.

### 1.3 Data models (TypeScript-equivalent shapes)

All table DDL is in `db.ts:54-127`. Key entities:

#### User (table `users`) — covers ALL roles (student / teacher / admin / office staff / parent / super-admin)
```ts
type User = {
  id: string;                    // 'U-<8hex>' via nextId('U')
  name: string;
  email: string | null;          // 'student@pending.concordia.edu.pk' placeholder until accountant issues real login
  rollNo: string | null;         // Student ID or Teacher ID — required for student/teacher
  password: string;              // PLAINTEXT — security debt
  role: 'super-admin'|'admin'|'admissions'|'accountant'|'academic'|'institute-admin'|'branch-manager'|'teacher'|'student'|'parent';
  status: 'Active' | 'Inactive';
  title: string;                 // 'Admission Officer', 'Teacher', 'Student', etc.
  mustChangePassword: 0|1;       // boolean-as-int
  blocked: 0|1;
  blockedReason: string | null;
  instituteId: string | null;
  branchId: string | null;
  class: string | null;          // student's class NAME (text — not a FK to classes.id)
  section: string;               // default 'A'
  guardian: string | null;       // father/guardian name (mirrored into fatherName on create)
  ward: string | null;           // parent's ward name (parent role)
  wardId: string | null;         // parent's linked student id
  subjects: string | null;       // JSON array of subject strings (teachers)
  classes: string | null;        // JSON array of class identifier strings (teachers)
  createdById: string | null;
  createdAt: string;             // ISO datetime
  baseFee: number | null;        // set & LOCKED by admissions
  baseFeeLocked: 0|1;            // boolean-as-int
  fatherName: string | null;     // legacy alias for guardian
  cnic: string | null;           // Pakistan national ID
  dob: string | null;            // ISO date
  address: string | null;
  prevResult: string | null;     // previous class/result (admissions field)
  program: string | null;        // 'ICS' | 'I.Com' | 'F.Sc Pre-Medical' | 'F.Sc Pre-Engineering' | 'FA' | 'F.A General Science' | 'ADP' | 'BS Commerce'
  photoUrl: string | null;
  guardianPhone: string | null;
};
```

#### Class (table `classes`) — minimal
```ts
type Class = {
  id: string;          // 'CLS-<8hex>'
  branchId: string;
  name: string;        // free-text — typically "ICS", "FSc Med", "Class 1", "Grade 10"
  section: string;     // 'A' | 'B' | 'C' | 'D' | custom — default 'A'
  teacherId: string | null;   // single homeroom teacher (rarely used — teachers.class JSON is the real assignment)
};
```
**Notable absences**: NO `program`, NO `year`/`part`, NO `capacity`, NO `courseId` list on the class. Course assignment is via the `class_courses` junction table. Capacity is frontend-only state (`capacityMap` in `ClassesView`). The "name + section" combination is the canonical identifier students match against (their `users.class` text field).

#### Teacher (subset of `users` where `role='teacher'`)
Stored as a `users` row + two assignment channels:
- `users.subjects` — JSON string array, e.g. `["Mathematics","Physics"]`
- `users.classes` — JSON string array, e.g. `["ICS-A","FSc Med-B"]` (combined `"Name-Section"` form, but legacy entries may use bare name or `"Name Section"`)
- `teacher_class_courses` junction table — formal teacher→class→course mapping (populated when the create-teacher form passes `classId` + `courseIds`)

#### Student (subset of `users` where `role='student'`)
Same row shape; notable fields:
- `class` (text) + `section` (text) — points to a class by NAME, not FK
- `program` — single text value from the curated 8-item list
- `rollNo` — student ID, unique per branch (`UNIQUE-rollNo-within-branch` enforced on create)
- `baseFee` + `baseFeeLocked` — set by Admissions, **immutable after lock**
- `fatherName` (legacy alias for `guardian` — Admissions writes both on create)
- `cnic`, `dob`, `address`, `prevResult`, `photoUrl`, `guardianPhone` (admissions fields)

#### Class / Course / Teacher mapping tables
- `courses`: `{ id, branchId, name, code }` — branch-scoped course catalog
- `class_courses`: `{ id, classId, courseId }` — many-to-many class↔course
- `teacher_class_courses`: `{ id, teacherId, classId, courseId }` — teacher assigned to teach a course in a class

#### Fee tables
- `fee_structure`: `{ id, branchId, classId, monthlyFee, admissionFee, createdAt }` — one row per (branch, class)
- `fee_invoices`: `{ id, studentId, studentName, className, branchId, instituteId, month, year, amount, type, status, paidDate, paidAmount, paymentMethod, challanNo, createdAt, dueDate }` — both monthly tuition invoices AND installment invoices (distinguished by `type` field: 'Tuition' vs 'Installment')
- `misc_charges`: `{ id, studentId, studentName, branchId, instituteId, type, amount, description, createdBy, createdAt }` — one-off fees (Admission Fee / Exam Fee / custom)

#### Other tables
- `exams`: `{ id, branchId, instituteId, name, type, createdBy, createdAt }` — unique name per branch (`idx_exams_branch_name`)
- `timetable`: `{ id, branchId, classId, className, section, day, period, startTime, endTime, subject, teacherId, teacherName, roomId, roomName, createdAt }`
- `results`: `{ id, branchId, exam, courseId, classId, teacherId, totalMarks, date, records (JSON), createdAt }` — `records` is `[{ studentId, marks, grade }]`
- `report_cards`: `{ id, studentId, studentName, class, section, branchId, instituteId, term, examName, totalMarks, obtainedMarks, percentage, grade, remarks, generatedBy, generatedAt }`
- `announcements`: `{ id, senderId, senderRole, title, message, targetRole, targetScope, targetIds, instituteId, branchId, classId, createdAt }`
- `attendance`: `{ id, branchId, classId, date, teacherId, records (JSON), createdAt }`
- `teacher_salaries` + `salary_payments`: salary structure + per-month payments
- `events`, `manual_revenue`, `sessions`
- **Legacy tables dropped on init** (intentionally): `Post`, `User`, `diary`, `sms_log`, `complaints`, `library_books`, `transport_routes`, `course_materials`, `royalty_settings`, `royalty_invoices`. (Some endpoints still reference `course_materials` / `diary` / `complaints` / `library_books` / `transport/routes` / `royalty/*` — see endpoint list. They will fail at runtime since the tables don't exist; the code is dead-ish but kept for compat.)

### 1.4 Complete endpoint catalog (81 endpoints)

#### Authentication (handler.ts:44–129)
| Method | Path | What it does |
|---|---|---|
| POST | `/api/auth/login` | Email/rollNo + password login. Optional `name` field for disambiguation when multiple users share an identifier. Blocks `institute-admin`/`branch-manager` logins. Returns `{ token, user, mustChangePassword }`. |
| POST | `/api/auth/logout` | Deletes the session row. |
| POST | `/api/auth/change-password` | Compares `currentPassword` (plaintext), updates to `newPassword` (min 4 chars), clears `mustChangePassword`. |

#### Institutes — super-admin only (131–221)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/institutes` | Super-admin: all. Institute-admin: only own. |
| POST | `/api/institutes` | Creates institute + institute-admin user (role=`institute-admin`, mustChangePassword=1). |
| PATCH | `/api/institutes/:id` | Updates name/plan/status + admin name/email/password. |
| PATCH | `/api/institutes/:id/block` | Blocks institute + cascades to branches + users (except super-admin). Deletes their sessions. |
| DELETE | `/api/institutes/:id` | Full cascade delete (sessions, classes, courses, users, etc.). |

#### Branches — institute-admin (223–297)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/branches` | Scoped by role (institute-admin sees own institute, branch-manager sees own branch). |
| POST | `/api/branches` | Creates branch + branch-manager user + auto-creates 12 placeholder classes "Class 1"…"Class 12". |
| PATCH | `/api/branches/:id/block` | Cascade block + session deletion. |
| DELETE | `/api/branches/:id` | Cascade delete. |

#### Platform Users — the main "create user" endpoint (299–596)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/platform/users` | Filterable by `role`, `branchId`, `instituteId`. Returns `buildUserProfile`-shaped rows. Excludes super-admin. |
| POST | `/api/platform/users` | Creates any role (student/teacher/parent/admin/office). Required: name, password, role (+ rollNo for student/teacher). Accepts: class, section, subjects(JSON), classes(JSON), classId, courseIds, fatherName, guardian, guardianPhone, cnic, dob, address, prevResult, program, photoUrl, baseFee, baseFeeLocked. For teachers with classId+courseIds → also inserts `teacher_class_courses` rows. Updates `branches.teachers/students` and `institutes.staff/students` counters. |
| PATCH | `/api/platform/users/:id` | Edits any subset of fields. Duplicate-email + duplicate-rollNo guard (per branch). |
| PATCH | `/api/platform/users/:id/block` | Sets blocked flag + deletes sessions. |
| DELETE | `/api/platform/users/:id` | Permanent delete (used by accountant's "Manage Access → Delete"). |
| GET | `/api/platform/users/:id/password` | Returns the user's plaintext password (used by accountant "reveal password" buttons). Security debt. |

#### Classes & Courses (598–866)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/classes` | All classes in a branch (`?branchId=`). |
| GET | `/api/reference` | Returns curated lookup lists: `classes`, `sections` (A/B/C/D + custom in use), `subjects` (18-item Concordia list + custom from teachers), `programs` (8-item Concordia catalog). |
| POST | `/api/classes` | Create class. Body: `{ name, section, branchId }`. Duplicate (name+section+branch) → 409. |
| GET | `/api/courses` | By branch or by classId (joins `class_courses`). |
| POST | `/api/courses` | Create course. Body: `{ name, code, branchId }`. Duplicate name/code → 409. |
| POST | `/api/class-courses` | Single class↔course link. |
| POST | `/api/classes/:id/courses` | Replace a class's courses (delete + reinsert). Body: `{ courseIds: string[] }`. |
| POST | `/api/classes/:id/sections` | Create a new section (sibling class row, same name, different section letter). Auto-picks next letter A→B→C… or accepts custom. Inherits parent's courses. |
| DELETE | `/api/classes/:id` | Cascade-cleans class_courses, teacher_class_courses, timetable, attendance, results, and **nullifies** `users.class`/`section` for matched students (doesn't delete the student accounts). |
| GET | `/api/teacher/classes` | Teacher-only — their assigned classes with embedded courses. |
| GET | `/api/student/courses` | Student-only — courses for the class matching their `class` name in their branch. |

#### Analytics — teacher + student (869–1129)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/teacher/analytics` | Teacher's classes, student counts per class, recent results, attendance summary. |
| GET | `/api/student/analytics` | Student's courses, attendance, results, fee invoices summary, report cards. |

#### Announcements (1130–1196)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/announcements` | Role-scoped filtering (super-admin sees all; institute-admin/branch-manager/teacher/student see scoped subsets based on senderRole/targetRole/targetScope/branchId/classId). |
| POST | `/api/announcements` | Body: `{ title, message, targetRole, targetScope, targetIds, classId }`. Sender is `user.id`/`user.role`. |
| DELETE | `/api/announcements/:id` | Sender or super-admin only. |

#### Course Materials (1198–1239) — legacy table
| Method | Path | Notes |
|---|---|---|
| GET | `/api/course-materials` | Filter by classId/courseId/teacherId. |
| POST | `/api/course-materials` | Teacher-only. |
| GET | `/api/course-materials/:id/download` | Returns file bytes or linkUrl. **NOTE**: `course_materials` table is NOT created by `initDB` — these endpoints will fail at runtime. |

#### Platform overview + scoped stats (1241–1278)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/platform/overview` | Super-admin only. Counts of institutes/branches/students/staff + total revenue from `fees` table. |
| GET | `/api/scoped/stats` | By instituteId or branchId. Returns student/teacher/branch counts. |

#### Finance dashboards (1280–1704)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/institute/finance` | Institute-admin/super-admin. KPIs + monthly revenue (12 months) + yearly revenue (5 years) + branchPerformance + recentTransactions + studentFeeSummary + teacherSalarySummary. |
| GET | `/api/branch/finance` | Branch-manager/institute-admin. KPIs (students, teachers, totalRevenue, pendingFees, totalSalaryPaid, monthlySalaryExpense, netBalance, attendanceRate, totalInvoices, paidInvoices, unpaidInvoices) + monthlyRevenue + feeStatus + classPerformance + recentTransactions + studentFeeSummary + teacherSalarySummary. **This is what the accountant dashboard SHOULD use** (it currently uses client-side derivation from `getBranchInvoices`). |
| GET | `/api/platform/finance` | Super-admin. InstitutePerformance + monthly/yearly revenue + recentTransactions + revenueEntries. |

#### Teacher Salaries (1706–1771)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/salaries` | Set/update a teacher's monthly salary. |
| POST | `/api/salaries/pay` | Record a salary payment. |
| GET | `/api/salaries` | List salary payments (filter by instituteId/branchId/teacherId). |

#### Attendance (1773–1834)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/attendance` | Teacher-only. Upserts attendance for (classId, date, branchId). Body: `{ classId, date, records }`. |
| GET | `/api/attendance` | Filter by classId/studentId. |

#### Results (1836–1877)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/results` | Teacher-only. Body: `{ exam, courseId, totalMarks, date, records, classId }`. `records` is `[{ studentId, marks, grade }]` stored as JSON. |
| GET | `/api/results` | Filter by courseId/studentId/teacherId/branchId/exam. Branch-scoped. |

#### Exams (Academic Office) (1879–1934)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/exams` | Branch-scoped list. |
| POST | `/api/exams` | Roles: academic/admin/branch-manager/institute-admin. Body: `{ name, type }`. Name unique per branch → 409 on duplicate. |
| DELETE | `/api/exams/:id` | Same roles. Branch-scoped delete. |

#### Fee Structure (1936–1965)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/fee-structure` | By branch / classId. |
| POST | `/api/fee-structure` | Upsert (branchId + classId → monthlyFee + admissionFee). |

#### Fee Invoices (1966–2077)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/fee-invoices` | Branch-scoped for office roles; student-scoped for students; super-admin can pass `?all=1` for everything. |
| GET | `/api/fee-invoices/branch` | Branch-manager/institute-admin. |
| POST | `/api/fee-invoices/generate` | Bulk-generate monthly tuition invoices for all students in branch. Skips if an invoice already exists for (student, month, year). Falls back to `amount=5000` if no fee_structure row exists. |
| PATCH | `/api/fee-invoices/:id/pay` | Marks invoice paid. Body: `{ paidAmount, paymentMethod }`. |
| GET | `/api/fee-invoices/:id/challan` | Returns full challan data (invoice + student + institute + branch names) for PDF rendering. |

#### Installments (2079–2118)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/fee-invoices/installments` | Body: `{ studentId, installments: [{ amount, dueDate }] }`. **Deletes** any existing `type='Installment'` invoices for the student, then creates new ones. Challan numbers prefixed `CH-INST-`. |

#### Misc Charges (2119–2158)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/misc-charges` | Filter by branchId/studentId. |
| POST | `/api/misc-charges` | Body: `{ studentId, type, amount, description }`. |
| DELETE | `/api/misc-charges/:id` | |

#### Diary, SMS, Complaints, Library, Transport (2160–2335) — all legacy tables
These endpoints exist in the handler but the underlying tables were dropped from `initDB`. They will fail at runtime.
- `GET/POST /api/diary`, `GET /api/sms`, `POST /api/sms/send`, `GET/POST /api/complaints`, `PATCH /api/complaints/:id/respond`, `GET/POST /api/library/books`, `GET/POST /api/transport/routes`

#### Manual Revenue (2336–2410)
| Method | Path | Notes |
|---|---|---|
| POST | `/api/revenue` | Records a manual revenue entry. Body: `{ sourceType, sourceId, sourceName, amount, month, year, notes }`. |
| GET | `/api/revenue` | Filter by sourceType/sourceId/instituteId/month/year. |
| DELETE | `/api/revenue/:id` | |

#### Timetable (2412–2507)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/timetable` | Filter by branchId/classId/teacherId. Sorts by day-of-week + period. |
| POST | `/api/timetable` | Body: `{ classId, className, section, day, period, startTime, endTime, subject, teacherId, teacherName, roomName }`. Three clash checks: (1) class slot taken, (2) teacher double-booked same period, (3) teacher time overlap. Each returns a specific 409 error message. |
| DELETE | `/api/timetable/:id` | |

#### Report Cards (2509–2583)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/report-cards` | Filter by studentId/branchId. |
| POST | `/api/report-cards` | Body: `{ studentId, studentName, class, section, term, examName, totalMarks, obtainedMarks, percentage, grade, remarks }`. |
| GET | `/api/report-cards/generate/:studentId` | Auto-builds a report card by aggregating the latest `results` rows that mention the student. **Buggy**: line 2546 selects `FROM results ORDER BY date DESC LIMIT 50` without scoping by student — it then filters in JS. |

#### Royalty — legacy (2585–2665)
Endpoints exist (`GET/POST /api/royalty/settings`, `POST /api/royalty/generate`, `GET /api/royalty/invoices`, `PATCH /api/royalty/invoices/:id/pay`) but the underlying tables were dropped. Will fail at runtime.

#### Health + Notifications (2667–2755)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Returns `{ ok: true, ts }`. |
| GET | `/api/notifications` | Builds a notification feed from announcements + fee invoices + results + attendance. Returns `{ items, unread }`. |

#### v1.5 Module APIs (2757–3155)
Mock/stub endpoints returning hardcoded data: `ai-tutor/suggestions`, `transport/live`, `digital-id/list`, `wallet/balance`, `wallet/transactions`, `ptm/slots`, `health/records`.

#### Fallback (3155+)
Returns 404 `{ error: 'Not found', path }`.

---

## 2. Admissions Portal — `src/components/portal/admissions-portal.tsx` (2749 lines)

### 2.1 Router (lines 128–208)
```tsx
export function AdmissionsPortal({ activeModule, user }) {
  // Loads students once via api.platformUsers({ role: 'student', branchId }) and keeps them in state.
  // Provides upsertLocal() for optimistic updates.
  if (activeModule === 'admissions-new')        return <NewEnrollmentView ... />;
  if (activeModule === 'admissions-students')   return <StudentRecordsView ... />;
  if (activeModule === 'admissions-base-fee')   return <BaseFeeView ... />;
  return <OverviewView user students loading />; // 'admissions-overview' default
}
```

### 2.2 Dashboard / OverviewView (lines 378–576)
- **KPI cards** (4): Enrolled Students, This Month (count created in current month), Pending Base Fee, Base Fee Locked (count + sum).
- **Recent Admissions table** (last 10): Name, Class, Roll #, Base Fee, Status badge.
- **Enrollment by Program** — pure CSS bars (not recharts). Counts students grouped by `s.program`.
- API calls: `api.platformUsers({ role: 'student', branchId })` (parent component level).

### 2.3 New Enrollment — `NewEnrollmentView` (lines 616–1475)
3-step wizard. State shape (`EnrollForm`, lines 581–598):
```ts
type EnrollForm = {
  name, fatherName (legacy), cnic, dob, address, prevResult,
  program, classId, section, rollNo, guardian, guardianPhone, baseFee
};
```
- **Step 1**: name, guardian (= father/guardian name), cnic, dob, address, prevResult, guardianPhone.
- **Step 2**: program (dropdown from `PROGRAMS` constant), classId (dropdown from `api.getClasses`), section (dropdown from `api.reference().sections`), rollNo (auto-suggested as `STU-{year}-{seq:03d}` based on existing students in that class — editable).
- **Step 3**: optional baseFee + "Lock base fee now" button (staged, persisted on save).
- **CNIC duplicate check**: debounced 400ms — warns but does not block.
- **Roll number duplicate check**: client-side pre-check + server-side 409.
- **Submit** (line 771): POSTs to `api.createPlatformUser` with:
  ```ts
  {
    name, rollNo,
    password: genTempPassword(),                  // 'tmp-<random>'
    email: `${rollNo.toLowerCase()}@pending.concordia.edu.pk`,  // placeholder
    role: 'student',
    instituteId, branchId,
    class: selectedClass.name,                    // TEXT name, not id
    classId: form.classId,
    section: form.section || selectedClass.section || 'A',
    guardian, fatherName: guardian,               // mirrored
    guardianPhone, cnic, dob, address, prevResult, program,
    photoUrl: null,
    baseFee?: number, baseFeeLocked?: true        // only if staged
  }
  ```
  On 409 (duplicate), shows toast and stops — does NOT optimistic-fallback. On network error, optimistic-fallback creates a local-only record.
- **On success**: shows `Admission Receipt` PDF via `buildAdmissionReceipt` from `pdf-utils.ts` (download + print buttons).

### 2.4 Student Records — `StudentRecordsView` (lines 1477–1676)
- Search (name/guardian/fatherName/rollNo/cnic) + class filter (derived from existing students).
- Table columns: Roll #, Name, Father/Guardian, Contact, Class, Program, Base Fee, Status, Edit button.
- **EditStudentSheet** (lines 1678–1888): Sheet with editable fields (name, rollNo, cnic, dob, address, prevResult, program, class, section, guardian, guardianPhone). Saves via `api.editUser(student.id, body)`. No base-fee editing here.
- API: `api.editUser`.

### 2.5 Fee Records — `BaseFeeView` (lines 2290–2539)
- 4 KPI cards: Total Students, Fee Locked, Pending, Total Locked (sum).
- Search + status filter (All / Locked / Pending).
- Table: Roll #, Name, Class, Program, Base Fee, Status, Actions.
- **Pending rows** render `PendingFeeRow` inline — an amount input + "Lock" button → confirm dialog → `api.editUser(s.id, { baseFee, baseFeeLocked: true })`.
- **Locked rows** show a "View" eye button → `StudentFeeDetailSheet` (lines 1936–2059) showing the student's full fee summary + installment breakdown + CSV/print options.
- **Bulk Lock** sheet (lines 2061–2288): multi-select pending students by program → set a uniform amount → confirm → loops `api.editUser` calls. Useful for locking many at once.
- **Export CSV** button — `exportFeeCsv(students)` (lines 1889–1935) generates a CSV blob and triggers download.

### 2.6 Constants
```ts
const PROGRAMS = ['ICS','I.Com','F.Sc Pre-Medical','F.Sc Pre-Engineering','FA','F.A General Science','ADP','BS Commerce'];
const fmtMoney = (n) => 'PKR ' + Number(n||0).toLocaleString('en-PK');
const isLocked = (s) => Boolean(s?.baseFeeLocked) && s?.baseFee != null && s.baseFee !== '';
```

---

## 3. Academic Portal — `src/components/portal/academic-portal.tsx` (2419 lines)

### 3.1 Router (lines 2398–2417)
```tsx
switch (activeModule) {
  case 'academic-overview':    return <AcademicOverview />;
  case 'academic-announcements': return <AnnouncementsView />;
  case 'academic-classes':     return <ClassesView />;
  case 'academic-teachers':    return <TeachersView />;
  case 'academic-students':    return <StudentsView />;
  case 'timetable':            return <TimetableView />;
  case 'academic-datesheet':   return <DateSheetView />;
  case 'academic-tests':       return <ExamsView />;
  case 'report-cards':         return <ReportCardsView />;
  default:                     return <ComingSoon />;
}
```

### 3.2 Dashboard — `AcademicOverview` (lines 185–272)
KPIs (4): Total Teachers, Total Students, Pending Results, Announcements. Two panels: Recent Announcements + Teachers by Subject (showing first 6 teachers with their subject tags).
API: `api.platformUsers({role:'teacher'})`, `api.platformUsers({role:'student'})`, `api.getAnnouncements()`, `api.getResults({})`.

### 3.3 Announcements — `AnnouncementsView` (lines 275–378)
Form: title, message, target audience (All / Students / Teachers / Accountants / Admins). Publishes via `api.createAnnouncement({ title, message, targetRole, targetScope:'all', instituteId, branchId, senderId, senderRole })`. Lists existing announcements with delete buttons (`api.deleteAnnouncement`).

### 3.4 Classes — `ClassesView` (lines 1735–2396)
This is the BIG one (~660 lines).
- **State**: classes, students, teachers, search (debounced 200ms), `showForm`, mode `'single'|'bulk'`, name, section, capacity (frontend-only!), bulkSections, detail sheet, delete-target dialog, assign-teacher state.
- **Load**: `api.getClasses(branchId)`, `api.platformUsers({role:'student'})`, `api.platformUsers({role:'teacher'})`.
- **Create single class**: `api.createClass(name, section, branchId)` → on success, optionally stores capacity in local `capacityMap` (lost on refresh).
- **Create bulk sections**: parses comma-separated sections (e.g. "A,B,C"), loops `api.createClass` per section. Reports per-section failures.
- **Class detail Sheet**: shows enrolled students (matched by `s.class === cls.name && s.section === cls.section`), assigned teachers (matched by parsing `teacher.classes` JSON and checking combined forms `"Name-Section"` and `"Name Section"`), and an "Assign Teacher" dropdown.
- **Assign teacher**: appends `"${cls.name}-${cls.section}"` to the teacher's `classes` JSON array via `api.editUser(teacher.id, { classes: next })`.
- **Remove teacher**: filters the combined forms out of `teacher.classes` and PATCHes.
- **Delete class**: confirmation dialog → `api.deleteClassSection(cls.id)` (which DELETEs `/api/classes/:id` and cascades server-side).
- **`parseTeacherField(raw)`** (lines 1727–1733): accepts string OR array, returns `string[]`.

### 3.5 Teachers — `TeachersView` (lines 381–527)
**Duplicative with Accountant → Create Logins → Teacher tab.** This view also lets you create teachers (name, rollNo/Teacher ID, email, password, subjects comma-separated, classes comma-separated, title). Calls `api.createPlatformUser({ role:'teacher', ... })`. Lists existing teachers with their subjects/classes parsed from JSON.
- **NOTE**: the role-modules.ts comment (lines 172–177) says: "Academic Office does NOT have separate Teachers / Students management pages. They DO manage Classes (creating classes/sections)." But the AcademicPortal router DOES expose `academic-teachers` and `academic-students` cases. The admin sidebar does NOT surface these (only `academic-classes`). So this view is reachable only via direct module navigation, not the sidebar — effectively dead code.

### 3.6 Students — `StudentsView` (lines 530–587)
Read-only table of all students (rollNo, name, class, father/guardian, contact). Search filter. Same dead-code note as above.

### 3.7 Timetable — `TimetableView` (lines 589–916)
- Class selector dropdown (from `api.getClasses`). Default: first class.
- Period grid: Monday–Saturday rows × period columns.
- **Add Entry** form: Day, Period (1–12), Subject (required), Teacher (optional dropdown), Start/End time (HH:MM), Room.
- **Client-side clash checks** (lines 666–726): (1) class slot taken in `entries`, (2) teacher double-booked via `api.getTimetable({ teacherId })`, (3) teacher time overlap (same day, overlapping start/end).
- **Save**: `api.saveTimetableEntry({ classId, className, section, day, period, startTime, endTime, subject, teacherId, teacherName, roomName })`. Server re-runs the same clash checks → 409 on conflict.
- **Delete**: `api.deleteTimetableEntry(entry.id)` after `confirm()`.

### 3.8 Date Sheets — `DateSheetView` (lines 918–1094)
**Important quirk**: Date sheets are NOT a dedicated table. They're stored as **announcements** with the title prefix `"Date Sheet: "` and the message body containing lines like `"Mathematics — Jan 15, 2026 at 09:00 AM"`.
- **Gated on exams**: if no exams exist, shows an amber banner with a "Create Exam" button that navigates to `academic-tests`.
- **Form**: exam name dropdown (from `api.getExams`), class name (free text), rows of `{ subject, date, time }`.
- **Submit**: `api.createAnnouncement({ title: 'Date Sheet: <exam> — <class>', message: lines.join('\n'), targetRole: 'student', targetScope: 'all', ... })`.
- **List**: fetches all announcements, filters by `title.startsWith('Date Sheet: ')`, displays them.

### 3.9 Exams — `ExamsView` (lines 1110–1301)
- `EXAM_TYPES = ['Monthly Test', 'Midterm', 'Final', 'Quiz', 'Assignment', 'Oral Test', 'Class Test', 'Other']`.
- **Create**: name + type → `api.createExam({ name, type })`. Client-side duplicate-name check + server-side 409.
- **List as cards**: each exam card shows name, type, created date, "Build Date Sheet" button (stashes exam name in zustand `pendingExamName` and navigates to `academic-datesheet`), and a "Delete" button with inline confirm dialog.
- **Namespace-aware navigation** (line 1116): `goTo('academic-tests')` preserves the current namespace (so admin browsing as `academic:academic-tests` navigates to `academic:academic-datesheet`, not the bare id).

### 3.10 Result Cards — `ReportCardsView` (lines 1329–1718)
3-level drill-down:
1. **Class grid**: every class as a card (name, section, student count, test count). Click → drill to tests.
2. **Test grid**: distinct exam names that have at least one `results` row touching this class's students. Each card shows exam name, subject count, entered/total students, class average %. Click → drill to student table.
3. **Student table**: rows = students in the class; columns = subjects (one per `courseId` in `results`); cells = marks (red if < 40% of total). Plus Total, %, Grade, and a per-row **Download Result Card** PDF button.

PDF generation (lines 1454–1492): dynamically imports `buildReportCard` from `pdf-utils.ts` and calls it with the aggregated subject matrix + student info. `savePdf(doc, 'ResultCard-<roll>-<exam>.pdf')` triggers the download.

`gradeFromPct(pct)` (lines 1318–1328): A+ (≥90), A (≥80), B (≥70), C (≥60), D (≥50), F (<50), '—' (null).

API: `api.getClasses`, `api.platformUsers({role:'student'})`, `api.getCourses`, `api.getResults`.

---

## 4. Accountant Portal — `src/components/portal/accountant-portal.tsx` (3888 lines)

### 4.1 Router (lines 427–542)
Top-level state holds `students`, `classes`, `invoices`, `loading`. Loads all three in parallel via `api.platformUsers({role:'student'})`, `api.getClasses`, `api.getBranchInvoices`.
```tsx
if (activeModule === 'accountant-students')   return <StudentsView ... />;
if (['accountant-challans','accountant-collect','accountant-installments'].includes(activeModule))
                                                return <FeeInstallmentsView ... />;
if (activeModule === 'accountant-misc')        return <MiscChargesView ... />;
if (activeModule === 'accountant-logins')      return <LoginsView ... />;
return <OverviewView ... />; // 'accountant-overview' default
```

### 4.2 Dashboard — `OverviewView` (lines 546–775)
**KPIs (4)**:
- **Total Collected** = sum of `paidAmount` for invoices where `status==='Paid'`.
- **Pending** = sum of `amount` for invoices where `status!=='Paid'`.
- **Overdue** = count of invoices with `status==='Overdue'`.
- **Students with Login** = count of students where `hasRealLogin(s)` is true.

**Monthly Collection chart** (lines 657–698): last 6 months, current month in Concordia orange, prior months in gray. **Pure CSS bars** (height % = total/maxTotal×100). **recharts is NOT used here despite being installed.**

**Recent Payments table**: top 8 paid invoices sorted by `paidAt`/`updatedAt` desc.

Helper functions:
```ts
const hasRealLogin = (s) => s.email && !s.email.includes('@pending.') || s.password && !s.password.startsWith('tmp-');
const deriveFeeStatus = (invoices) => /* 'Paid' | 'Pending' | 'Overdue' */;
const sumPaid = (invoices) => /* Σ paidAmount */;
const sumOutstanding = (invoices) => /* Σ (amount - paidAmount) for unpaid */;
const genDefaultPassword = () => 'concordia' + Math.floor(1000 + Math.random()*9000);
const MISC_CHARGE_TYPES = ['Admission Fee', 'Exam Fee', 'Other'];
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'JazzCash', 'EasyPaisa', 'Card'];
const MONTHS = ['January', 'February', … 'December'];
```

### 4.3 Students (Class-wise) — `StudentsView` (lines 777–1064)
- Groups students by `"${class} - ${section}"` (or `'Unassigned'`).
- KPIs: Total Students, Fee Locked, Collected (all-time paid).
- Search by name/roll/father/guardian/contact.
- Class cards grid (3 cols on xl): each shows student count + Paid/Due totals. Click to expand → inline student table (Roll #, Name, Father/Guardian, Contact, Base Fee, Paid, Balance, Status).
- Click a student row → `StudentFeeSheet` (lines 1066–1200) shows their invoice list + paid/outstanding summary + close button.

### 4.4 Fee & Installments — `FeeInstallmentsView` (lines 1203–1900)
Only shows students with `baseFeeLocked && baseFee != null`. Layout: 3 columns (student picker / installment plan builder / invoice list).

**Installment plan builder**:
- Add row / remove row / auto-split into N (2/3/4 buttons).
- Validates: total installments must equal `baseFee` (else `planError`).
- Save: `api.createInstallments(selected.id, [{ amount, dueDate }])` (which DELETEs existing installment invoices then creates new ones).

**Invoice list** (right column): all invoices for the selected student, sorted (installments first by dueDate, then monthly by year/month). Each row has:
- "Mark Paid" button → `api.markInvoicePaid(inv.id, inv.amount, 'Cash')`. On first payment, if student lacks a real login, **auto-generates one** via `api.editUser(s.id, { email: '<rollNo>@concordia.edu.pk', password: genDefaultPassword() })` and shows the credentials in a popup.
- "Download Challan" button → fetches `api.getChallanData(inv.id)` then `buildFeeChallan(...)` + `savePdf(doc, 'Challan-<no>.pdf')`.

**Bulk monthly generation**: "Generate Monthly Challans" button → `api.generateInvoices(month, year)` (uses current month/year).

### 4.5 Misc Charges — `MiscChargesView` (lines 1913–2253)
- 2-column layout: Add Charge form + charges list.
- **Student picker**: searchable (only shows results once the user types). Confirm selection.
- **Charge Type**: dropdown (`MISC_CHARGE_TYPES` = Admission Fee / Exam Fee / Other). Selecting "Other" reveals a custom text input.
- **Amount** + **Description**.
- Save: `api.addMiscCharge({ studentId, type, amount, description })`. Optimistically prepends to local list.
- List: search by studentName/type. Delete button: `api.deleteMiscCharge(id)` with optimistic rollback on failure.

### 4.6 Create Logins — `LoginsView` (lines 2298–3888)
**Two tabs**: Student Logins / Teacher Logins. This is the LARGEST view (~1600 lines).

#### Student Logins tab
- Filter: All / With Login / Without Login.
- Search by name/roll/class.
- For each student: if `hasRealLogin(s)` is false, show "Generate Login" button. Otherwise show "Edit" + "Block/Unblock" buttons.
- **Generate Login** (lines 2435–2489):
  ```ts
  const password = genDefaultPassword();           // 'concordia1234'
  const rollNo = s.rollNo || s.email?.split('@')[0] || s.id;
  const email = `${rollNo.toLowerCase()}@concordia.edu.pk`;
  // Pre-check email clash client-side, then:
  await api.editUser(s.id, { email, password });   // primary path
  // Fallback (if row missing): api.createPlatformUser({ ...studentFields, email, password, role: 'student' })
  ```
- **Edit student** sheet (lines 2587+): editable name, rollNo, email, password (with reveal button via `api.getUserPassword`), class, section, guardian, guardianPhone, cnic. Saves via `api.editUser`.
- **Manage Access popup** (lines 2855+): when block is clicked, opens a popup offering "Block (temporary)" or "Delete (permanent, type-to-confirm by name)".
  - Block: `api.blockUser(id, true)` → signs them out.
  - Delete: `api.deleteUser(id)` → permanent removal.

#### Teacher Logins tab
**YES, teachers ARE created here.** Form (lines 2319–2332):
```ts
const [form, setForm] = useState({
  name: '', rollNo: '', email: '', password: ''
});
```
- Fields: Full Name, Teacher ID (= rollNo, required), Email (optional, auto-generates `<rollNo>@concordia.edu.pk` if blank), Password (optional, auto-generates `'teacher' + 4 random digits`).
- **Password strength meter** (lines 2494–2513): weak (<6 chars), medium (6-9 or letters-only), strong (≥10 chars with letters + numbers).
- **Submit** (lines 2515–2577):
  ```ts
  await api.createPlatformUser({
    name, email, rollNo, password,
    role: 'teacher',
    branchId: user?.branchId,
    instituteId: user?.instituteId,
    title: 'Teacher',
    // NOTE: subjects and classes are NOT set here — Academic Office assigns them later
  });
  ```
- Below the form: **"Manage Existing Teachers"** list (filtered by search). Each row has Edit + Block/Unblock buttons (same popup as students).
- Edit teacher sheet (lines 2760+): name, rollNo, email, password (reveal), title. NO subjects/classes editing here (those are managed by the Academic Office's `ClassesView`).

API calls in LoginsView: `api.platformUsers({role:'teacher', branchId})`, `api.createPlatformUser`, `api.editUser`, `api.getUserPassword`, `api.blockUser`, `api.deleteUser`.

---

## 5. Admin Portal — `src/components/portal/admin-portal.tsx` (594 lines) + `role-portal.tsx` (577 lines)

### 5.1 Admin routing pattern — namespaced modules
The admin sidebar (`role-modules.ts:107-133`) defines modules with namespaced IDs:
```ts
'admin': [
  { group: 'Main', flat: true, items: [
    { id: 'admin-dashboard', name: 'Admin Dashboard', ... },
  ]},
  { group: 'Admission Office', items: [
    { id: 'admissions:admissions-new',        name: 'New Enrollment', ... },
    { id: 'admissions:admissions-students',   name: 'Student Records', ... },
    { id: 'admissions:admissions-base-fee',   name: 'Fee Records', ... },
  ]},
  { group: 'Accountant', items: [
    { id: 'accountant:accountant-students',   name: 'Students (Class-wise)', ... },
    { id: 'accountant:accountant-challans',   name: 'Fee & Installments', ... },
    { id: 'accountant:accountant-misc',       name: 'Miscellaneous Charges', ... },
    { id: 'accountant:accountant-logins',     name: 'Create Logins', ... },
  ]},
  { group: 'Academic Office', items: [
    { id: 'academic:academic-announcements',  name: 'Announcements', ... },
    { id: 'academic:academic-classes',        name: 'Classes', ... },
    { id: 'academic:timetable',               name: 'Timetable', ... },
    { id: 'academic:academic-datesheet',      name: 'Date Sheets', ... },
    { id: 'academic:academic-tests',          name: 'Exams', ... },
    { id: 'academic:report-cards',            name: 'Result Cards', ... },
  ]},
  { group: 'Account', flat: true, items: [
    { id: 'settings', name: 'Settings', ... },
  ]},
],
```

The `AdminPortal` component (lines 551–594) routes by splitting on `:`:
```tsx
if (activeModule.includes(':')) {
  const [ns, modId] = activeModule.split(':', 2);
  switch (ns) {
    case 'admissions': return <AdmissionsPortal activeModule={modId} user={user} />;
    case 'accountant': return <AccountantPortal activeModule={modId} user={user} />;
    case 'academic':   return <AcademicPortal   activeModule={modId} user={user} />;
  }
}
// Native admin modules:
switch (activeModule) {
  case 'admin-dashboard':
  case 'admin-overview': return <AdminDashboard user={user} setActiveModule={...} />;
  default: return <ComingSoon title="Module" />;
}
```

The `settings` module is handled at the **`role-portal.tsx`** level (line 314): `if (activeModule === 'settings') return <SettingsPage user={user} />;` — so it never reaches the AdminPortal switch.

### 5.2 Admin Dashboard — `AdminDashboard` (lines 184–523)
- **KPI cards** (4): Total Students, Teachers, Office Staff (admin/admissions/accountant/academic), Fee Collected. Each is clickable → jumps to a sub-portal module via `setActiveModule('academic:academic-students')` etc.
- **Two-column row**: Recent Announcements (last 5) + At a Glance (branches, classes, events, report cards counts).
- **Admission Office Pulse**: 4 small stat tiles (Enrolled + this-month count, Fee Locked + sum, Pending Lock with CTA to Fee Records, New Enrollment CTA).
- **Recent Students table**: Roll No, Name, Class, Guardian, Base Fee, Fee Status (Locked/Pending badge).
- API: `api.scopedStats(instituteId, branchId)`, `api.platformUsers({})` (all roles), `api.getAnnouncements()`, `api.getFeeInvoices()`.

### 5.3 Role Portal — `src/components/portal/role-portal.tsx` (577 lines)
Top-level shell. Renders the sidebar (from `ROLE_MODULES[role]`), the header (title + ⌘K command palette + notifications dropdown + avatar + logout), and the active portal component:
```tsx
const renderPortal = () => {
  if (activeModule === 'settings') return <SettingsPage user={user} />;
  switch (role) {
    case 'super-admin': return <SuperAdminPortal activeModule={activeModule} user={user} />;
    case 'admin':       return <AdminPortal activeModule={activeModule} user={user} />;
    case 'admissions':  return <AdmissionsPortal activeModule={activeModule} user={user} />;
    case 'accountant':  return <AccountantPortal activeModule={activeModule} user={user} />;
    case 'academic':    return <AcademicPortal activeModule={activeModule} user={user} />;
    case 'teacher':     return <TeacherPortal activeModule={activeModule} user={user} />;
    case 'student':     return <StudentPortal activeModule={activeModule} user={user} />;
    case 'parent':      return <StudentPortal activeModule={activeModule} user={user} />;
    default:            return <StudentPortal activeModule={activeModule} user={user} />;
  }
};
```
The sidebar resolves the active module's display name even for namespaced IDs by looking up the sub-portal's module catalog (`ROLE_MODULES[ns]`, lines 296–310).

The `setOnBlocked(cb)` global callback (from `api.ts`) is wired here — when the API client receives a 401/403 with "blocked" in the message, it triggers a full-screen "Access Blocked" page (lines 333–359) and forces logout.

Notifications dropdown (lines 415–540): bell icon with unread badge, fetches from `api.getNotifications()`, displays items with role-specific icons (announcement/complaint/fee/result/attendance).

---

## 6. API Client — `src/lib/api.ts` (508 lines)

### 6.1 Core mechanics
- **`apiUrl(path)`**: prepends `/api/`.
- **`getToken()`**: reads from `sessionStorage['concordia-app']` (zustand persist) → `parsed.state.token`.
- **`request<T>(path, options, _skipCache)`**: fetch with `Authorization: Bearer <token>` header. On non-2xx, parses JSON error; if 401/403 with "blocked" in the message, fires `onBlockedCallback`. Network errors throw a friendly "Cannot connect to server" message.
- **`cachedGet<T>(path)`**: stale-while-revalidate cache. 60-second TTL (`CACHE_TTL`). In-memory `Map` + persisted to `sessionStorage['concordia-api-cache']`. Returns stale instantly and refreshes in the background.
- **`invalidateCache()`**: clears both maps. Called after every successful mutation (POST/PATCH/DELETE).
- **`backgroundRefresh<T>(path)`**: silent re-fetch that updates the cache without notifying callers.

### 6.2 Exported `api` object (lines 119–467)
~80 methods grouped by domain:
- **Auth**: `login`, `logout` (client-side only — clears sessionStorage), `changePassword`.
- **Platform**: `platformOverview`, `institutes`, `institute`, `createInstitute`, `updateInstitute`/`editInstitute`, `deleteInstitute`, `blockInstitute`, `branches`, `createBranch`, `blockBranch`, `deleteBranch`, `platformUsers`, `createPlatformUser`, `editUser`, `blockUser`, `deleteUser`, `getUserPassword`, `scopedStats`.
- **Attendance**: `getAttendance`, `markAttendance`.
- **Results**: `getResults`, `postResults`.
- **Exams**: `getExams`, `createExam`, `deleteExam`.
- **Fees**: `getFees`, `payFee`.
- **SMS/Diary/Complaints/Events/Library/Transport**: legacy methods (likely unused by current portals).
- **Reference**: `reference()` returns `{ classes, sections, subjects, programs }`.
- **Classes & Courses**: `getClasses`, `createClass`, `getCourses`, `createCourse`, `createClassCourse`, `assignClassCourses`, `createClassSection`, `deleteClassSection`.
- **Teacher/Student scoped**: `getTeacherClasses`, `getStudentCourses`.
- **Announcements**: `getAnnouncements`, `createAnnouncement`, `deleteAnnouncement`.
- **Course Materials**: `getCourseMaterials`, `addCourseMaterial`, `downloadMaterial` (URL), `downloadMaterialBlob` (fetch with auth → Blob).
- **Fee system**: `getFeeStructure`, `setFeeStructure`, `getFeeInvoices`, `getAllInvoices`, `getBranchInvoices`, `markInvoicePaid`, `getChallanData`, `createInstallments`, `generateInvoices`, `getMiscCharges`, `addMiscCharge`, `deleteMiscCharge`.
- **Finance dashboards**: `getInstituteFinance`, `getBranchFinance`, `getPlatformFinance`.
- **Analytics**: `getTeacherAnalytics`, `getStudentAnalytics`.
- **Notifications**: `getNotifications`.
- **Revenue**: `addRevenue`, `getRevenue`, `deleteRevenue`.
- **Timetable**: `getTimetable`, `saveTimetableEntry`, `deleteTimetableEntry`.
- **Report Cards**: `getReportCards`, `generateReportCard`, `saveReportCard`.
- **Royalty**: legacy methods.
- **Salaries**: `setTeacherSalary`, `payTeacherSalary`, `getSalaryPayments`.
- **v1.5 module APIs**: `getAiTutorSuggestions`, `getTransportLive`, `getDigitalIds`, `getWalletBalance`, `getWalletTransactions`, `getPtmSlots`, `getHealthRecords`. Each returns typed data (see types `DigitalIdCard`, `WalletTransaction`, `PtmApiSlot`, `HealthRecordBundle` at lines 470–507).

---

## 7. Department / Program / Part / Section — current state

### 7.1 Programs (departments) — YES, single text field
- Stored on `users.program` (text column).
- Curated list returned by `GET /api/reference` (handler.ts:634–637):
  ```ts
  const defaultPrograms = [
    'ICS', 'I.Com', 'F.Sc Pre-Medical', 'F.Sc Pre-Engineering',
    'FA', 'F.A General Science', 'ADP', 'BS Commerce',
  ];
  ```
- Hardcoded duplicate in `admissions-portal.tsx:101-110` (`PROGRAMS` constant — identical list).
- No `departments` table, no FK. Just a free-text field on the student row.

### 7.2 Sections — YES, single text field
- Stored on `users.section` (text column, default `'A'`) AND on `classes.section`.
- Canonical set returned by `GET /api/reference`: `['A', 'B', 'C', 'D']` augmented with any custom sections in use.
- When a new class is created, section defaults to `'A'` and is uppercased.

### 7.3 Part 1 / Part 2 (1st year / 2nd year) — **NO**
There is **NO** concept of "Part 1" / "Part 2" / "1st year" / "2nd year" anywhere in the codebase. Grep for these terms returned zero matches in source code (only in unrelated UI strings like "first year" in download page copy).

The closest analog is the **`class` field** (text), which is meant to encode the program + year + section combination in its name — e.g. `"ICS-1-A"` for ICS Part 1 Section A, or `"FSc Med-2-B"` for F.Sc Pre-Medical Part 2 Section B. But this is purely by convention — nothing in the schema enforces or parses the year out of the class name.

### 7.4 How classes are currently organized
The `classes` table has only `{ id, branchId, name, section, teacherId }`. There is:
- NO `program` column (program lives on the student row)
- NO `year` / `part` column
- NO `capacity` column (frontend-only state in `ClassesView.capacityMap`)
- NO `courseId` column (course assignment via `class_courses` junction)

When the branch is auto-created (POST `/api/branches`), 12 placeholder classes `"Class 1"` … `"Class 12"` are created with section `'A'`. The Academic Office is then expected to delete these and create real ones with proper names.

Students are linked to a class by **text match** on `(users.class, users.section)` against `(classes.name, classes.section)` — NOT by a foreign key. The `student/courses` endpoint (handler.ts:859) and `ClassesView.enrolledStudents` both do this lookup. This means renaming a class silently orphans its students.

---

## 8. Charts Library — `package.json`

```
"recharts": "^2.15.4"   ✅ installed
```

Also relevant:
```
"framer-motion": "^12.23.2"   ✅ (used by role-portal.tsx for mobile drawer animation only)
"html2canvas": "^1.4.1"       ✅ (installed but UNUSED in source — likely a leftover dep)
```

**Current state**: recharts is installed but the accountant dashboard's "Monthly Collection" chart is hand-rolled CSS bars (accountant-portal.tsx:666–687). The admin dashboard's "At a Glance" is a simple list, no chart. No `<LineChart>`, `<BarChart>`, etc. anywhere in the codebase.

**Implication for the refactor**: recharts is ready to use immediately. No install needed. Import `{ BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer }` from `'recharts'`.

---

## 9. PDF Generation — `src/lib/pdf-utils.ts` (900 lines) + `package.json`

```
"jspdf": "^4.2.1"        ✅ — the PDF engine used by pdf-utils.ts
"html2canvas": "^1.4.1"  ✅ — installed but UNUSED (legacy dep)
```

**No** pdfkit, pdf-lib, or puppeteer. Just jsPDF.

### 9.1 `pdf-utils.ts` exports
```ts
// Branding constants (lines 29–50)
const BRAND = {
  orange: [242, 101, 34],      // #F26522 — primary accent
  orangeDark: [212, 84, 30],
  ink: [17, 24, 39],           // gray-900
  inkSoft: [55, 65, 81],       // gray-700
  muted: [107, 114, 128],      // gray-500
  faint: [156, 163, 175],      // gray-400
  line: [229, 231, 235],       // gray-200
  bg: [249, 250, 251],         // gray-50
  bgBand: [243, 244, 246],     // gray-100
};

// Formatters
export function fmtMoney(n: number | string): string;        // 'PKR 12,345'
export function fmtDate(d?: string | Date | null): string;   // 'Jan 15, 2026'
export function fmtDateTime(d?: string | Date | null): string;

// Grade helper (duplicate of academic-portal.tsx's gradeFromPct)
export function gradeFromPct(pct: number | null | undefined): string;  // 'A+'|'A'|'B'|'C'|'D'|'F'|'—'

// Builders — all async (load logo via fetch + cache), all return jsPDF
export async function buildAdmissionReceipt(data: AdmissionReceiptData): Promise<jsPDF>;
export async function buildFeeChallan(data: FeeChallanData): Promise<jsPDF>;
export async function buildSalarySlip(data: SalarySlipData): Promise<jsPDF>;
export async function buildReportCard(data: ReportCardData): Promise<jsPDF>;

// Output helpers
export function savePdf(doc: jsPDF, fileName: string);   // triggers browser download
export function printPdf(doc: jsPDF);                    // opens in new tab for printing
```

### 9.2 Design language (per file header, lines 3–24)
- Top accent bar in Concordia orange (#F26522)
- Embedded logo (fetched once + cached) on every document
- Institute name + branch + document title in a header band
- Two-column info grid with uppercase micro-labels
- Banded table with header row + zebra rows
- Status pill (PAID / UNPAID / CONFIRMED) with proper colors
- Signature block + generated-on footer

### 9.3 Data shapes (around lines 480–515)
- `AdmissionReceiptData`: instituteName, branchName, docTitle, docSubtitle, refLabel, refValue, studentName, rollNo, className, section, fatherName, fatherContact, cnic, dob, address, prevResult, program, guardianName, guardianPhone, session, baseFee, amountPaid, dueDate, receiptNo, issueDate.
- `FeeChallanData`: instituteName, branchName, docTitle, docSubtitle, refLabel, refValue, studentName, rollNo, className, section, challanNo, amount, type, status, dueDate, month, year, paidDate.
- `SalarySlipData`: instituteName, branchName, docTitle, docSubtitle, refLabel, refValue, teacherName, teacherId, designation, month, year, basicSalary, allowances, deductions, netSalary, paidDate, paymentMethod, status.
- `ReportCardData`: instituteName, branchName, docTitle, docSubtitle, studentName, rollNo, className, section, term, fatherName, fatherContact, totalMarks, obtainedMarks, grade, position, subjects: [{ name, total, obtained, grade }], remarks.

### 9.4 Usage in portals
- **Admissions portal** (admissions-portal.tsx:93–96): `buildAdmissionReceipt` + `savePdf` + `printPdf`. Called from New Enrollment success screen.
- **Accountant portal** (accountant-portal.tsx:97): `buildFeeChallan` + `savePdf`. Called from FeeInstallmentsView "Download Challan" button.
- **Academic portal** (academic-portal.tsx:1457): dynamically imported `buildReportCard` + `savePdf` + `gradeFromPct`. Called from ReportCardsView per-row "Download" button.
- **Salary slips**: `buildSalarySlip` is exported but no portal currently calls it. Likely wired up in the SuperAdminPortal or planned for future use.

---

## Summary of Key Facts for the Upcoming Refactor

| Question | Answer |
|---|---|
| In-memory or DB? | Real SQL DB (Turso prod / SQLite dev). Single source of truth. |
| Auth mechanism | Bearer token (8h TTL) in `sessions` table. Plaintext passwords (debt). |
| Role model | 4 office roles (admin/admissions/accountant/academic) + teacher + student + parent + super-admin. Office roles inherit `branch-manager` perms via `ROLE_EQUIVALENCE`. |
| Student fields | class (text), section (text), program (text — 8-item catalog), rollNo, fatherName, guardian, guardianPhone, cnic, dob, address, prevResult, photoUrl, baseFee, baseFeeLocked. NO Part 1/Part 2. |
| Class fields | id, branchId, name, section, teacherId. NO program/year/capacity columns. |
| Teacher fields | users row (role='teacher') + subjects (JSON) + classes (JSON of "Name-Section" strings) + teacher_class_courses junction. |
| Departments/Programs? | YES — `users.program` text field. 8-item curated list. No `departments` table. |
| Part 1 / Part 2? | **NO** — not modeled anywhere. Year is implicitly encoded in the class name (e.g. "ICS-1-A"). |
| Sections? | YES — `users.section` + `classes.section` text columns. Canonical A/B/C/D + custom. |
| Where are teachers created? | **Accountant → Create Logins → Teacher Logins tab** (accountant-portal.tsx:2298+). Posts to `api.createPlatformUser({ role: 'teacher', name, rollNo, email, password, branchId, instituteId, title: 'Teacher' })`. Subjects/classes assigned later by Academic Office via `ClassesView` (edits `teacher.classes` JSON). |
| Where are students created? | **Admissions → New Enrollment** (admissions-portal.tsx:616+). Posts to `api.createPlatformUser({ role: 'student', ... })` with placeholder email/password. Real login issued by Accountant after first fee payment. |
| Where is base fee locked? | **Admissions → Fee Records** (BaseFeeView) or inline during New Enrollment. `api.editUser(s.id, { baseFee, baseFeeLocked: true })`. Immutable after lock (no unlock endpoint). |
| Date Sheets storage? | **Announcements with title prefix `"Date Sheet: "`**. No dedicated table. Gated on having ≥1 exam. |
| Result Cards storage? | `report_cards` table + aggregated from `results` table (JSON records column). 3-level drill-down in ReportCardsView. Per-row PDF download. |
| Charts library? | recharts ^2.15.4 installed but **unused**. Accountant dashboard chart is hand-rolled CSS bars. Ready to swap to recharts. |
| PDF library? | jspdf ^4.2.1 (used by `src/lib/pdf-utils.ts`). html2canvas installed but unused. 4 builders: admission receipt, fee challan, salary slip, report card. |
| Admin → sub-portal routing? | Namespaced module IDs (`"admissions:admissions-new"`). AdminPortal splits on `:` and delegates to the sub-portal component with the de-namespaced id. Settings handled at role-portal.tsx level. |
| API cache strategy? | 60s stale-while-revalidate in-memory Map + sessionStorage. Mutations call `invalidateCache()`. |
| Concordia seed logins | admin@concordia.edu.pk, admissions@concordia.edu.pk, accountant@concordia.edu.pk, academics@concordia.edu.pk (all `concordia123`). Super-admin: faisu577277@gmail.com / `QaReLc_61y8`. |
