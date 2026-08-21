// Concordia API client — talks to the in-process Next.js API routes directly (no port).
import { readSessionToken, clearSession } from '@/lib/session-store';

function apiUrl(path: string) {
  return '/api/' + path.replace(/^\//, '');
}

// === In-memory + sessionStorage cache with stale-while-revalidate ===
// Solves the "every page is slow" problem — GET requests return cached data
// instantly and refresh silently in the background.
const _cache = new Map<string, { data: any; time: number }>();
// In-flight GET de-duplication: when several components request the same
// endpoint at once (very common on a page mount), they share ONE network
// request instead of firing N. Huge win under concurrent load.
const _inflight = new Map<string, Promise<any>>();
const CACHE_TTL = 60_000; // 60 seconds
const SESSION_KEY = 'concordia-api-cache';

// Restore cache from sessionStorage on module load
try {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      _cache.set(k, v as any);
    }
  }
} catch {}

function persistCache() {
  try {
    const obj: Record<string, any> = {};
    for (const [k, v] of _cache.entries()) obj[k] = v;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  } catch {}
}

function invalidateCache() {
  _cache.clear();
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

async function cachedGet<T>(path: string): Promise<T> {
  const entry = _cache.get(path);
  const now = Date.now();
  if (entry) {
    // Fresh cache — return instantly
    if (now - entry.time < CACHE_TTL) {
      return entry.data as T;
    }
    // Stale — return stale instantly, refresh in background
    backgroundRefresh<T>(path);
    return entry.data as T;
  }
  // No cache — coalesce concurrent identical fetches into a single request.
  const pending = _inflight.get(path);
  if (pending) return pending as Promise<T>;
  const p = request<T>(path)
    .then((data) => { _cache.set(path, { data, time: Date.now() }); persistCache(); return data; })
    .finally(() => { _inflight.delete(path); });
  _inflight.set(path, p);
  return p;
}

async function backgroundRefresh<T>(path: string) {
  try {
    const data = await request<T>(path, { method: 'GET' }, true);
    _cache.set(path, { data, time: Date.now() });
    persistCache();
  } catch {}
}

// Get the stored auth token from the persisted session.
// v4.6.3: delegates to session-store.ts, which reads from sessionStorage in a
// browser (per-tab isolation) and localStorage in the native mobile app
// (persists across app restarts for reliable background FCM pushes). The
// legacy localStorage → sessionStorage migration is handled inside
// session-store.ts on module load, so we don't need a fallback here.
function getToken(): string | null {
  return readSessionToken();
}

// Global blocked-state callback — set by the RolePortal to detect access revocation.
// IMPORTANT: this is ONLY for real admin-blocked accounts (403 + "blocked").
// A normal session expiry (401 "Invalid or expired session") must NOT trigger
// this — it triggers onSessionExpired instead, which does a clean logout +
// redirect to the login page. Without this distinction, every expired session
// wrongly shows the scary "Access Blocked" screen (user has to go back +
// sign in again — reported bug).
let onBlockedCallback: ((msg: string) => void) | null = null;
export function setOnBlocked(cb: (msg: string) => void) { onBlockedCallback = cb; }

// Session-expired callback — set by the RolePortal. Fired on 401 responses
// (invalid/expired token). Performs a clean logout + redirect to login so the
// user just sees the sign-in page, NOT the "Access Blocked" screen.
let onSessionExpiredCallback: (() => void) | null = null;
export function setOnSessionExpired(cb: () => void) { onSessionExpiredCallback = cb; }

async function request<T>(path: string, options?: RequestInit, _skipCache = false): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...options, headers });
  } catch (networkErr: any) {
    // Network error — API is down, gateway is down, or CORS issue
    throw new Error('Cannot connect to server. Please check your connection and try again.');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    // Parse error message
    let errorMsg = txt;
    try {
      const parsed = JSON.parse(txt);
      errorMsg = parsed.error || parsed.message || `Request failed (${res.status})`;
    } catch {}

    const lowerMsg = errorMsg.toLowerCase();

    // ── 401 Unauthorized: session is invalid or expired ──
    // This is a NORMAL session expiry — do a clean logout + redirect to the
    // login page. Do NOT show the "Access Blocked" screen (that's only for
    // real admin-blocked accounts). Guard with a once-per-page-load flag so
    // we don't fire N concurrent logouts when multiple API calls fail at once.
    //
    // ── STALE-REQUEST GUARD (fixes "kicked back to login right after
    //    logging in as a student") ──
    // CRITICAL: a 401 must only trigger a redirect if the token used for THIS
    // request is the SAME as the token currently in storage. If they differ,
    // the 401 is from a STALE request that was in-flight from a PREVIOUS
    // (expired) session — the user has SINCE logged in with a fresh token,
    // and the stale 401 arriving late must NOT clobber the new session. This
    // is the root cause of the "login as student → immediately redirected
    // back to login" loop: slow cold-start API calls from the expired session
    // return 401 AFTER the new login completes, and since `api.login()` reset
    // the once-per-page guard, the late 401 wrongly triggers another logout.
    if (res.status === 401) {
      const currentToken = getToken();
      const isStaleRequest = token && currentToken && token !== currentToken;
      // ── LOGIN GRACE PERIOD ──
      // If a 401 arrives within LOGIN_GRACE_MS of a successful login, treat
      // it as a stale request from a previous session. The new login is
      // valid; the 401 is from a slow in-flight request that used the old
      // (expired) token. Silently ignore it — do NOT redirect to login.
      const inLoginGrace = _lastLoginAt > 0 && (Date.now() - _lastLoginAt < LOGIN_GRACE_MS);
      if (!isStaleRequest && !inLoginGrace && !_sessionExpiredFired) {
        _sessionExpiredFired = true;
        try { clearSession(); } catch {}
        if (onSessionExpiredCallback) {
          onSessionExpiredCallback();
        } else {
          // Fallback: hard redirect to the login page if no callback registered yet.
          if (typeof window !== 'undefined') {
            try { window.location.replace('/?view=login'); } catch {}
          }
        }
      }
      throw new Error(errorMsg);
    }

    // ── 403 Forbidden: real access revocation (admin blocked the account,
    //    institute, or branch). Only trigger the blocked screen for actual
    //    "blocked" messages — NOT for generic "access" / "session" / "expired"
    //    strings (those caused the previous false-positive bug). ──
    if (res.status === 403) {
      if (lowerMsg.includes('blocked') || lowerMsg.includes('revoked') || lowerMsg.includes('retired')) {
        if (onBlockedCallback) {
          onBlockedCallback(errorMsg);
        }
      }
    }

    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

// Once-per-page-load guard for 401 session-expiry handling. Prevents N
// concurrent API calls (all failing with 401 at once) from each triggering
// a logout/redirect. Reset when the page reloads or the user logs in again.
let _sessionExpiredFired = false;
export function _resetSessionExpiredGuard() { _sessionExpiredFired = false; }

// ── LOGIN GRACE PERIOD ──
// Timestamp of the most recent SUCCESSFUL login (set when api.login()
// resolves with a token). Any 401 arriving within LOGIN_GRACE_MS of this
// timestamp is treated as a STALE request from a previous (expired) session
// and is silently ignored — it must NOT trigger a redirect to the login
// page. This is the bulletproof fix for the "login as student → instantly
// kicked back to login" loop: the new login is valid, but slow cold-start
// API calls from the expired session return 401 late and would otherwise
// clobber the new session. 8 seconds covers even the worst Vercel cold
// start + network latency.
let _lastLoginAt = 0;
const LOGIN_GRACE_MS = 8000;

export const api = {
  login: async (email: string, password: string, name?: string) => {
    // Reset the 401 session-expired guard so a fresh login starts clean.
    _sessionExpiredFired = false;
    const r = await request<{ token: string; user: any; mustChangePassword?: boolean }>('auth/login', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    // Mark the login time AFTER the new token is stored (setToken is called
    // by the caller immediately after this resolves). The grace window
    // starts from here, so any 401 arriving in the next 8s is treated as
    // stale and ignored.
    _lastLoginAt = Date.now();
    return r;
  },
  // Client-side logout — clears the persisted session from BOTH storages
  // (sessionStorage in browser, localStorage in native app, plus any stale
  // legacy localStorage entry from before v4.6.3). Auth is stateless
  // bearer-token, so no server round-trip is needed. After calling, the app
  // reloads to '/'.
  logout: async () => {
    clearSession();
    _sessionExpiredFired = false;
    // Also clear the API cache so a subsequent login as a different user
    // doesn't see stale cached data from the previous user.
    invalidateCache();
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    request<any>('auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  // v4.5.1: Profile photo upload/remove.
  uploadProfilePhoto: (photoUrl: string) =>
    request<{ success: boolean; photoUrl: string }>('auth/profile-photo', { method: 'POST', body: JSON.stringify({ photoUrl }) }),
  removeProfilePhoto: () =>
    request<{ success: boolean }>('auth/profile-photo', { method: 'DELETE' }),
  // v4.5.1: Report an issue to management.
  reportIssue: (body: { subject: string; description: string; category?: string }) =>
    request<{ success: boolean; issueId: string }>('help/report-issue', { method: 'POST', body: JSON.stringify(body) }),
  // v4.4.0: Sign out of ALL devices — revokes every session + clears every
  // FCM token for this user. The client must clear its stored token + redirect
  // to /login afterwards.
  logoutAllDevices: () =>
    request<{ success: boolean; revokedSessions: boolean; clearedTokens: boolean }>('auth/logout-all', { method: 'POST' }),
  // v4.4.0: Account & session info — last login, active sessions, active devices.
  getMe: () => request<any>('auth/me'),
  sendStudentMessage: (studentId: string, message: string) =>
    request<{ success: boolean; parentsNotified: number }>('teacher/message', { method: 'POST', body: JSON.stringify({ studentId, message }) }),
  // Syllabus / "today's topic"
  createSyllabus: (body: { program: string; part?: string; section: string; course?: string; date?: string; content: string }) =>
    request<{ success: boolean; id: string; notified: number }>('syllabus', { method: 'POST', body: JSON.stringify(body) }),
  getSyllabus: (params?: { program?: string; part?: string; section?: string; teacherId?: string }) => {
    const q = new URLSearchParams();
    if (params?.program) q.set('program', params.program);
    if (params?.part) q.set('part', params.part);
    if (params?.section) q.set('section', params.section);
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    const qs = q.toString();
    return request<any[]>(qs ? `syllabus?${qs}` : 'syllabus');
  },

  // ── Biometric Attendance (ZKTeco gate) ──────────────────────────────────
  // Daily register for a date, optionally filtered by program/part/section/status.
  bioRegister: (params?: { date?: string; program?: string; part?: string; section?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.program) q.set('program', params.program);
    if (params?.part) q.set('part', params.part);
    if (params?.section) q.set('section', params.section);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{ date: string; entries: any[] }>(qs ? `biometric/attendance?${qs}` : 'biometric/attendance');
  },
  // One student's history + calendar. For student/parent the id is ignored
  // server-side and scoped to their own linked student — pass 'me' for clarity.
  bioStudentHistory: (studentId: string, month?: string) =>
    request<{ studentId: string; entries: any[]; totals: any }>(
      `biometric/attendance/student/${encodeURIComponent(studentId)}${month ? `?month=${month}` : ''}`,
    ),
  bioDeviceStatus: () => request<any>('biometric/devices/status'),
  bioLivePunches: () => request<any[]>('biometric/punches/live'),
  bioUnmappedPins: () => request<any[]>('biometric/punches/unmapped'),
  bioAssignPin: async (pin: string, studentId: string) => {
    const r = await request<{ success: boolean; datesRecomputed: number }>('biometric/punches/assign', {
      method: 'POST', body: JSON.stringify({ pin, studentId }),
    });
    invalidateCache();
    return r;
  },
  bioOverride: (body: { studentId: string; date: string; status: string; note?: string; check_in_at?: string; check_out_at?: string }) =>
    request<{ success: boolean }>('biometric/attendance/manual', {
      method: 'PATCH', body: JSON.stringify(body),
    }),
  bioRecompute: (from: string, to: string) =>
    request<{ success: boolean; pairsRecomputed: number }>('biometric/attendance/recompute', {
      method: 'POST', body: JSON.stringify({ from, to }),
    }),
  bioAllocatePin: async (studentId: string) => {
    const r = await request<{ success: boolean; pin: string; studentName: string }>(
      `biometric/students/${encodeURIComponent(studentId)}/allocate-pin`, { method: 'POST' },
    );
    invalidateCache(); // the enrollment list (cached) just changed
    return r;
  },
  bioAllocateSection: async (program: string, part: string, section: string) => {
    const r = await request<{ success: boolean; allocated: number }>('biometric/allocate-pin-section', {
      method: 'POST', body: JSON.stringify({ program, part, section }),
    });
    invalidateCache();
    return r;
  },
  // Cached (60s, stale-while-revalidate) — the enrollment list is loaded on
  // every biometric page open; mutations above invalidate it.
  bioEnrollment: () => cachedGet<any[]>('biometric/enrollment'),
  bioSummary: (params?: { month?: string; program?: string; section?: string }) => {
    const q = new URLSearchParams();
    if (params?.month) q.set('month', params.month);
    if (params?.program) q.set('program', params.program);
    if (params?.section) q.set('section', params.section);
    const qs = q.toString();
    return request<{ month: string; students: any[] }>(qs ? `biometric/summary?${qs}` : 'biometric/summary');
  },
  // Section-wide check-in/out history for a date range (staff Excel export).
  bioHistory: (params: { program?: string; part?: string; section?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params.program) q.set('program', params.program);
    if (params.part) q.set('part', params.part);
    if (params.section) q.set('section', params.section);
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const qs = q.toString();
    return request<{ from: string; to: string; rows: any[] }>(qs ? `biometric/history?${qs}` : 'biometric/history');
  },
  bioGetSettings: () => request<any>('biometric/settings'),
  bioUpdateSettings: (body: Partial<{ late_after_time: string; half_day_after_time: string; dedup_window_minutes: number; working_days: string; notify_parents: boolean }>) =>
    request<any>('biometric/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  bioGetHolidays: () => request<any[]>('biometric/holidays'),
  bioAddHoliday: (date: string, name?: string) =>
    request<{ success: boolean }>('biometric/holidays', { method: 'POST', body: JSON.stringify({ date, name }) }),
  bioDeleteHoliday: (idOrDate: string) =>
    request<{ success: boolean }>(`biometric/holidays/${encodeURIComponent(idOrDate)}`, { method: 'DELETE' }),
  getSessionInfo: () =>
    cachedGet<{
      currentSession: { token: string; issuedAt: number; expiresAt: number } | null;
      lastLogin: { token: string; issuedAt: number; expiresAt: number } | null;
      activeSessions: number;
      activeDevices: number;
      sessions: Array<{ token: string; issuedAt: number; expiresAt: number }>;
      devices: Array<{ id: string; platform: string; createdAt: string; lastSeen: string }>;
    }>('auth/session-info'),
  // platform
  platformOverview: () => cachedGet<any>('platform/overview'),
  institutes: () => cachedGet<any[]>('institutes'),
  institute: (id: string) => cachedGet<any>(`institutes/${id}`),
  createInstitute: async (body: any) => { const r = await request<any>('institutes', { method: 'POST', body: JSON.stringify(body) }); invalidateCache(); return r; },
  updateInstitute: async (id: string, body: any) => { const r = await request<any>(`institutes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); invalidateCache(); return r; },
  editInstitute: async (id: string, body: any) => { const r = await request<any>(`institutes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); invalidateCache(); return r; },
  deleteInstitute: async (id: string) => { const r = await request<any>(`institutes/${id}`, { method: 'DELETE' }); invalidateCache(); return r; },
  // Super-admin-only: wipe ALL test data from the platform.
  //  • deep=false → wipes students/teachers/parents/sessions/notifications/
  //    attendance/results/fees/documents/salaries/timetable/etc. but PRESERVES
  //    the class/course/fee-template/exam catalog (the "college skeleton").
  //  • deep=true  → FULL RESET. Also wipes classes, courses, class_courses,
  //    fee_structure, and exams. Only institutes + branches + office-staff
  //    logins + super-admin survive. Use when delivering a clean install.
  purgeTestData: async (opts?: { deep?: boolean }) => {
    const r = await request<any>('admin/purge-data', {
      method: 'POST',
      body: JSON.stringify({ confirmText: 'PURGE', deep: opts?.deep }),
    });
    invalidateCache();
    return r;
  },
  // Super-admin-only: download a full JSON backup of the entire database.
  // Returns a Blob (the JSON file) that the browser saves as a download.
  dbBackup: async () => {
    const token = readSessionToken();
    const res = await fetch('/api/admin/db-backup', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Backup failed');
    return res.blob();
  },
  // Super-admin-only: check the health of the database connection.
  dbHealth: () => cachedGet<any>('admin/db-health'),
  blockInstitute: async (id: string, blocked: boolean, reason?: string) =>
    { const r = await request<any>(`institutes/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked, reason }) }); invalidateCache(); return r; },
  branches: (instituteId?: string) => cachedGet<any[]>(instituteId ? `branches?instituteId=${instituteId}` : 'branches'),
  createBranch: async (body: any) => { const r = await request<any>('branches', { method: 'POST', body: JSON.stringify(body) }); invalidateCache(); return r; },
  blockBranch: async (id: string, blocked: boolean, reason?: string) =>
    { const r = await request<any>(`branches/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked, reason }) }); invalidateCache(); return r; },
  deleteBranch: async (id: string) => { const r = await request<any>(`branches/${id}`, { method: 'DELETE' }); invalidateCache(); return r; },
  platformUsers: (params?: { role?: string; branchId?: string; instituteId?: string }) => {
    const q = new URLSearchParams();
    if (params?.role) q.set('role', params.role);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    const qs = q.toString();
    return cachedGet<any[]>(qs ? `platform/users?${qs}` : 'platform/users');
  },
  // Force-clear the client GET cache so the next fetch is fresh (used by
  // "Refresh" buttons that must show just-created records immediately).
  clearCache: () => invalidateCache(),
  createPlatformUser: async (body: any) => { const r = await request<any>('platform/users', { method: 'POST', body: JSON.stringify(body) }); invalidateCache(); return r; },
  editUser: async (id: string, body: any) => { const r = await request<any>(`platform/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); invalidateCache(); return r; },
  blockUser: async (id: string, blocked: boolean, reason?: string) =>
    { const r = await request<any>(`platform/users/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked, reason }) }); invalidateCache(); return r; },
  deleteUser: async (id: string) =>
    { const r = await request<any>(`platform/users/${id}`, { method: 'DELETE' }); invalidateCache(); return r; },
  getUserPassword: (id: string) => request<any>(`platform/users/${id}/password`),
  // Generate (or regenerate) a student's login. Auto-assigns a branch-sequential
  // roll number if `rollNo` is omitted, so students imported without a roll
  // number can finally log in. Returns { rollNo, email, password }.
  generateStudentLogin: async (id: string, rollNo?: string) => {
    const r = await request<{ rollNo: string; email: string; password: string; mustChangePassword: boolean }>(
      `platform/users/${id}/generate-login`,
      { method: 'POST', body: JSON.stringify(rollNo ? { rollNo } : {}) },
    );
    invalidateCache();
    return r;
  },
  // Bulk-generate logins for EVERY student in the caller's branch who is
  // missing a rollNo / email / has the placeholder import password. One-click
  // fix for "students can't log in because they were imported without roll
  // numbers". Returns { generated, skipped, total, credentials[] }.
  bulkGenerateStudentLogins: async () => {
    const r = await request<{ generated: number; skipped: number; total: number; credentials: { id: string; name: string; rollNo: string; email: string; password: string }[] }>(
      'platform/students/bulk-generate-logins',
      { method: 'POST', body: JSON.stringify({}) },
    );
    invalidateCache();
    return r;
  },
  // Year-end promotion: move Part 1 students (program + fromSections) up to
  // Part 2 section `toSection`; optionally graduate (Pass Out) the outgoing
  // Part 2 students in that target section. Accountant / Admin only.
  promoteStudents: async (body: { program: string; fromSections: string[]; toSection: string; graduateExisting?: boolean }) => {
    const r = await request<{ success: boolean; promoted: number; graduated: number }>(
      'platform/students/promote', { method: 'POST', body: JSON.stringify(body) },
    );
    invalidateCache();
    return r;
  },
  scopedStats: (instituteId?: string, branchId?: string) => {
    const q = new URLSearchParams();
    if (instituteId) q.set('instituteId', instituteId);
    if (branchId) q.set('branchId', branchId);
    const qs = q.toString();
    return cachedGet<any>(qs ? `scoped/stats?${qs}` : 'scoped/stats');
  },
  // attendance
  getAttendance: (params?: { studentId?: string; branchId?: string; teacherId?: string }) => {
    const q = new URLSearchParams();
    if (params?.studentId) q.set('studentId', params.studentId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    return request<any>(q.toString() ? `attendance?${q.toString()}` : 'attendance');
  },
  markAttendance: (body: any) => request<any>('attendance', { method: 'POST', body: JSON.stringify(body) }),
  // results
  getResults: (params?: { studentId?: string; branchId?: string; teacherId?: string }) => {
    const q = new URLSearchParams();
    if (params?.studentId) q.set('studentId', params.studentId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    return request<any>(q.toString() ? `results?${q.toString()}` : 'results');
  },
  postResults: (body: any) => request<any>('results', { method: 'POST', body: JSON.stringify(body) }),
  // exams — scheduled test/assessment sessions created by the Academic Office
  getExams: (params?: { branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    return request<any[]>(q.toString() ? `exams?${q.toString()}` : 'exams');
  },
  createExam: (body: { name: string; type?: string }) =>
    request<any>('exams', { method: 'POST', body: JSON.stringify(body) }),
  deleteExam: (id: string) => request<any>(`exams/${id}`, { method: 'DELETE' }),
  // fees
  getFees: (params?: { studentId?: string; branchId?: string; instituteId?: string }) => {
    const q = new URLSearchParams();
    if (params?.studentId) q.set('studentId', params.studentId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    return request<any[]>(q.toString() ? `fees?${q.toString()}` : 'fees');
  },
  payFee: (body: any) => request<any>('fees', { method: 'POST', body: JSON.stringify(body) }),
  // sms
  getSms: (params?: { senderId?: string; instituteId?: string; branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.senderId) q.set('senderId', params.senderId);
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    if (params?.branchId) q.set('branchId', params.branchId);
    return request<any[]>(q.toString() ? `sms?${q.toString()}` : 'sms');
  },
  sendSms: (body: any) => request<any>('sms/send', { method: 'POST', body: JSON.stringify(body) }),
  // diary
  getDiary: (params?: { teacherId?: string; branchId?: string; class?: string }) => {
    const q = new URLSearchParams();
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.class) q.set('class', params.class);
    return request<any[]>(q.toString() ? `diary?${q.toString()}` : 'diary');
  },
  postDiary: (body: any) => request<any>('diary', { method: 'POST', body: JSON.stringify(body) }),
  // complaints
  getComplaints: (params?: { parentId?: string; instituteId?: string; branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.parentId) q.set('parentId', params.parentId);
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    if (params?.branchId) q.set('branchId', params.branchId);
    return request<any[]>(q.toString() ? `complaints?${q.toString()}` : 'complaints');
  },
  createComplaint: (body: any) => request<any>('complaints', { method: 'POST', body: JSON.stringify(body) }),
  respondToComplaint: (id: string, response: string) =>
    request<any>(`complaints/${id}/respond`, { method: 'PATCH', body: JSON.stringify({ response }) }),
  // events
  getEvents: (params?: { instituteId?: string; branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    if (params?.branchId) q.set('branchId', params.branchId);
    return request<any[]>(q.toString() ? `events?${q.toString()}` : 'events');
  },
  createEvent: (body: any) => request<any>('events', { method: 'POST', body: JSON.stringify(body) }),
  // library
  getBooks: (branchId?: string) => request<any[]>(branchId ? `library/books?branchId=${branchId}` : 'library/books'),
  addBook: (body: any) => request<any>('library/books', { method: 'POST', body: JSON.stringify(body) }),
  // transport
  getRoutes: (branchId?: string) => request<any[]>(branchId ? `transport/routes?branchId=${branchId}` : 'transport/routes'),
  addRoute: (body: any) => request<any>('transport/routes', { method: 'POST', body: JSON.stringify(body) }),
  // reference
  reference: () => cachedGet<{ classes: string[]; sections: string[]; subjects: string[]; programs: string[] }>('reference'),
  // classes & courses
  getClasses: (branchId?: string) => cachedGet<any[]>(branchId ? `classes?branchId=${branchId}` : 'classes'),
  // `program` and `part` are optional — pre-existing callers that omit them
  // still work (the backend defaults them to NULL / '1'). New Academic
  // Office flows pass program + part to drive the department hierarchy.
  createClass: async (name: string, section: string, branchId?: string, program?: string, part?: string) => {
    const r = await request<any>('classes', { method: 'POST', body: JSON.stringify({ name, section, branchId, program, part }) });
    invalidateCache();
    return r;
  },
  getCourses: (params?: { branchId?: string; classId?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.classId) q.set('classId', params.classId);
    return request<any[]>(q.toString() ? `courses?${q.toString()}` : 'courses');
  },
  createCourse: (body: any) => request<any>('courses', { method: 'POST', body: JSON.stringify(body) }),
  createClassCourse: (classId: string, courseId: string) =>
    request<any>('class-courses', { method: 'POST', body: JSON.stringify({ classId, courseId }) }),
  assignClassCourses: (classId: string, courseIds: string[]) =>
    request<any>(`classes/${classId}/courses`, { method: 'POST', body: JSON.stringify({ courseIds }) }),
  // Fetch every (teacher, course) pair assigned to a class — powers the
  // Academic Office class-detail sheet so officers see exactly what the
  // teacher's portal will show.  WITHOUT this, assigning a teacher to a
  // class never writes to teacher_class_courses and the teacher's portal
  // stays empty (the "assigned to class but not to course" bug).
  getClassTeacherCourses: (classId: string) => cachedGet<any[]>(`classes/${classId}/teacher-courses`),
  // Create a new section (e.g. Class 1B) inside an existing class. Inherits the parent's course assignments.
  createClassSection: (classId: string, section?: string) =>
    request<any>(`classes/${classId}/sections`, { method: 'POST', body: JSON.stringify({ section }) }),
  // Delete a section (only allowed when it has no students assigned and is not the only section for that class)
  deleteClassSection: async (classId: string) => { const r = await request<any>(`classes/${classId}`, { method: 'DELETE' }); invalidateCache(); return r; },
  renameClassSection: async (classId: string, section: string) => { const r = await request<any>(`classes/${classId}`, { method: 'PATCH', body: JSON.stringify({ section }) }); invalidateCache(); return r; },
  // teacher & student scoped
  getTeacherClasses: () => cachedGet<any[]>('teacher/classes'),
  getStudentCourses: () => cachedGet<any[]>('student/courses'),
  // announcements
  getAnnouncements: () => cachedGet<any[]>('announcements'),
  createAnnouncement: async (body: any) => { const r = await request<any>('announcements', { method: 'POST', body: JSON.stringify(body) }); invalidateCache(); return r; },
  deleteAnnouncement: async (id: string) => { const r = await request<any>(`announcements/${id}`, { method: 'DELETE' }); invalidateCache(); return r; },
  // course materials
  getCourseMaterials: (params?: { classId?: string; courseId?: string; teacherId?: string }) => {
    const q = new URLSearchParams();
    if (params?.classId) q.set('classId', params.classId);
    if (params?.courseId) q.set('courseId', params.courseId);
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    return request<any[]>(q.toString() ? `course-materials?${q.toString()}` : 'course-materials');
  },
  addCourseMaterial: (body: any) => request<any>('course-materials', { method: 'POST', body: JSON.stringify(body) }),
  downloadMaterial: (id: string) => apiUrl(`course-materials/${id}/download`),
  /** Downloads a material file with auth headers; returns { blob, fileName } for files or { linkUrl } for link-type materials. */
  downloadMaterialBlob: async (id: string): Promise<{ blob: Blob; fileName: string } | { linkUrl: string }> => {
    const token = getToken();
    const res = await fetch(apiUrl(`course-materials/${id}/download`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      if (json?.linkUrl) return { linkUrl: json.linkUrl as string };
      throw new Error('No file or link available');
    }
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const fileName = m ? m[1] : 'download';
    const blob = await res.blob();
    return { blob, fileName };
  },
  // fee system
  getFeeStructure: (branchId?: string) => request<any[]>(branchId ? `fee-structure?branchId=${branchId}` : 'fee-structure'),
  setFeeStructure: (classId: string, monthlyFee: number, admissionFee?: number) =>
    request<any>('fee-structure', { method: 'POST', body: JSON.stringify({ classId, monthlyFee, admissionFee }) }),
  getFeeInvoices: (studentId?: string | { studentId?: string }) => {
    // Be defensive: accept either a raw studentId string or (legacy) an
    // options object. Coerce anything that isn't a real string to undefined
    // so we never serialize `[object Object]` into the URL.
    const sid = typeof studentId === 'string' ? studentId : studentId?.studentId;
    return request<any[]>(sid ? `fee-invoices?studentId=${encodeURIComponent(sid)}` : 'fee-invoices');
  },
  getAllInvoices: () => request<any[]>('fee-invoices?all=1'),
  getBranchInvoices: () => cachedGet<any[]>('fee-invoices/branch'),
  markInvoiceUnpaid: async (id: string) => {
    const r = await request<any>(`fee-invoices/${id}/unpay`, { method: 'PATCH' });
    invalidateCache();
    return r;
  },
  markInvoicePaid: async (id: string, paidAmount?: number, paymentMethod?: string) => {
    const r = await request<any>(`fee-invoices/${id}/pay`, { method: 'PATCH', body: JSON.stringify({ paidAmount, paymentMethod }) });
    invalidateCache();
    return r;
  },
  getChallanData: (id: string) => request<any>(`fee-invoices/${id}/challan`),
  // Installments — split the locked base fee into N installment invoices
  createInstallments: async (studentId: string, installments: { amount: number; dueDate: string }[]) => {
    const r = await request<any>('fee-invoices/installments', { method: 'POST', body: JSON.stringify({ studentId, installments }) });
    invalidateCache();
    return r;
  },
  // Edit an existing installment amount
  editInstallment: async (installmentId: string, updates: { amount?: number; dueDate?: string }) => {
    const r = await request<any>(`fee-invoices/${installmentId}`, { method: 'PATCH', body: JSON.stringify(updates) });
    invalidateCache();
    return r;
  },
  generateInvoices: async (month: string, year: number) => {
    const r = await request<any>('fee-invoices/generate', { method: 'POST', body: JSON.stringify({ month, year }) });
    invalidateCache();
    return r;
  },
  // Misc charges — one-off fees (admission, exam, trip, custom)
  getMiscCharges: (params?: { branchId?: string; studentId?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.studentId) q.set('studentId', params.studentId);
    return request<any[]>(q.toString() ? `misc-charges?${q.toString()}` : 'misc-charges');
  },
  addMiscCharge: async (body: { studentId: string; type: string; amount: number; description?: string }) => {
    const r = await request<any>('misc-charges', { method: 'POST', body: JSON.stringify(body) });
    invalidateCache();
    return r;
  },
  deleteMiscCharge: async (id: string) => {
    const r = await request<any>(`misc-charges/${id}`, { method: 'DELETE' });
    invalidateCache();
    return r;
  },
  // Institute-level finance & analytics (Institute Admin)
  getInstituteFinance: (instituteId: string) => cachedGet<any>(`institute/finance?instituteId=${instituteId}`),
  // Branch-level finance & analytics (Branch Manager)
  getBranchFinance: (branchId: string) => cachedGet<any>(`branch/finance?branchId=${branchId}`),
  // Platform-wide finance & analytics (Super Admin)
  getPlatformFinance: () => cachedGet<any>('platform/finance'),
  // Teacher academic analytics
  getTeacherAnalytics: () => cachedGet<any>('teacher/analytics'),
  // Student academic + fee analytics
  getStudentAnalytics: () => cachedGet<any>('student/analytics'),
  // Notifications (top bar dropdown) — NOT cached so the user always sees fresh data.
  getNotifications: (limit = 50) =>
    request<{ items: any[]; unread: number }>(`notifications?limit=${limit}`),
  // Manual revenue management (Super Admin enters per institute, Institute Admin enters per branch)
  addRevenue: (body: { sourceType: string; sourceId: string; sourceName: string; amount: number; month: string; year: number; notes?: string }) =>
    request<any>('revenue', { method: 'POST', body: JSON.stringify(body) }),
  getRevenue: (params?: { sourceType?: string; sourceId?: string; instituteId?: string; month?: string; year?: number }) => {
    const q = new URLSearchParams();
    if (params?.sourceType) q.set('sourceType', params.sourceType);
    if (params?.sourceId) q.set('sourceId', params.sourceId);
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    if (params?.month) q.set('month', params.month);
    if (params?.year) q.set('year', String(params.year));
    return request<any[]>(q.toString() ? `revenue?${q.toString()}` : 'revenue');
  },
  deleteRevenue: (id: string) => request<any>(`revenue/${id}`, { method: 'DELETE' }),
  // Timetable
  getTimetable: (params?: { branchId?: string; classId?: string; teacherId?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.classId) q.set('classId', params.classId);
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    return request<any[]>(q.toString() ? `timetable?${q.toString()}` : 'timetable');
  },
  saveTimetableEntry: (body: any) => request<any>('timetable', { method: 'POST', body: JSON.stringify(body) }),
  deleteTimetableEntry: (id: string) => request<any>(`timetable/${id}`, { method: 'DELETE' }),
  publishTimetable: (classId: string) => request<{ success: boolean; students: number; teachers: number }>('timetable/publish', { method: 'POST', body: JSON.stringify({ classId }) }),
  // Report cards
  getReportCards: (params?: { studentId?: string; branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.studentId) q.set('studentId', params.studentId);
    if (params?.branchId) q.set('branchId', params.branchId);
    return request<any[]>(q.toString() ? `report-cards?${q.toString()}` : 'report-cards');
  },
  generateReportCard: (studentId: string, term?: string, examName?: string) =>
    request<any>(`report-cards/generate/${studentId}${term ? `?term=${encodeURIComponent(term)}` : ''}${examName ? `${term ? '&' : '?'}examName=${encodeURIComponent(examName)}` : ''}`),
  saveReportCard: (body: any) => request<any>('report-cards', { method: 'POST', body: JSON.stringify(body) }),
  // Royalty / Franchise management
  getRoyaltySettings: (instituteId?: string) => request<any[]>(`royalty/settings${instituteId ? `?instituteId=${instituteId}` : ''}`),
  setRoyaltySettings: (body: { branchId: string; method: string; amount?: number; percentage?: number; effectiveFrom?: string }) =>
    request<any>('royalty/settings', { method: 'POST', body: JSON.stringify(body) }),
  generateRoyaltyInvoices: (month: string, year: number) =>
    request<any>('royalty/generate', { method: 'POST', body: JSON.stringify({ month, year }) }),
  getRoyaltyInvoices: (instituteId?: string) => request<any[]>(`royalty/invoices${instituteId ? `?instituteId=${instituteId}` : ''}`),
  payRoyaltyInvoice: (id: string) => request<any>(`royalty/invoices/${id}/pay`, { method: 'PATCH' }),
  // Teacher salaries
  setTeacherSalary: (teacherId: string, monthlySalary: number, effectiveFrom?: string) =>
    request<any>('salaries', { method: 'POST', body: JSON.stringify({ teacherId, monthlySalary, effectiveFrom }) }),
  payTeacherSalary: (body: { teacherId: string; month: string; year: number; amount: number; paymentMethod?: string; notes?: string }) =>
    request<any>('salaries/pay', { method: 'POST', body: JSON.stringify(body) }),
  getSalaryPayments: (params?: { instituteId?: string; branchId?: string; teacherId?: string }) => {
    const q = new URLSearchParams();
    if (params?.instituteId) q.set('instituteId', params.instituteId);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.teacherId) q.set('teacherId', params.teacherId);
    return request<any[]>(q.toString() ? `salaries?${q.toString()}` : 'salaries');
  },
  // === v1.5.0 module APIs ===
  // AI Tutor — suggested questions keyed by subject.
  getAiTutorSuggestions: (role?: string) =>
    request<{ questions: { id: string; subject: string; question: string }[] }>(
      role ? `ai-tutor/suggestions?role=${encodeURIComponent(role)}` : 'ai-tutor/suggestions',
    ),
  // Live transport — active routes with simulated GPS positions.
  getTransportLive: (branchId?: string) =>
    request<{
      routes: {
        id: string; routeName: string; driver: string; driverPhone: string;
        vehicleNo: string; capacity: number; occupancy: number; speed: number;
        etaMinutes: number; status: 'on-time' | 'delayed' | 'en-route';
        currentLat: number; currentLng: number;
        stops: { name: string; lat: number; lng: number }[];
      }[];
    }>(branchId ? `transport/live?branchId=${encodeURIComponent(branchId)}` : 'transport/live'),
  // Digital ID cards — list/filter student ID cards.
  getDigitalIds: (params?: { branchId?: string; classId?: string; status?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.classId) q.set('classId', params.classId);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return request<{ cards: DigitalIdCard[] }>(qs ? `digital-id/list?${qs}` : 'digital-id/list');
  },
  // Campus wallet — current balance + auto-reload config.
  getWalletBalance: (userId?: string) =>
    request<{ balance: number; currency: string; lastTopUp: string | null; autoReload: boolean; autoReloadThreshold: number }>(
      userId ? `wallet/balance?userId=${encodeURIComponent(userId)}` : 'wallet/balance',
    ),
  // Campus wallet — recent transactions (newest first).
  getWalletTransactions: (userId?: string, limit?: number) => {
    const q = new URLSearchParams();
    if (userId) q.set('userId', userId);
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return request<{ transactions: WalletTransaction[] }>(qs ? `wallet/transactions?${qs}` : 'wallet/transactions');
  },
  // PTM scheduling — weekly slot grid + the next upcoming PTM for the current user.
  getPtmSlots: (params?: { branchId?: string; week?: string }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.week) q.set('week', params.week);
    const qs = q.toString();
    return request<{ slots: PtmApiSlot[]; upcomingPtm: PtmApiUpcoming | null }>(qs ? `ptm/slots?${qs}` : 'ptm/slots');
  },
  // Health records — full medical record for a single student.
  getHealthRecords: (studentId?: string) =>
    request<HealthRecordBundle>(studentId ? `health/records?studentId=${encodeURIComponent(studentId)}` : 'health/records'),

  // ───────────────────────────────────────────────────────────
  // Student Documents (Admissions → Student Records → Add Documents)
  // ───────────────────────────────────────────────────────────
  getStudentDocuments: (studentId: string) =>
    request<any[]>(`student-documents?studentId=${encodeURIComponent(studentId)}`),
  uploadStudentDocument: (data: { studentId: string; name: string; fileName: string; fileType: string; fileSize: number; dataUrl: string }) =>
    request<any>('student-documents', { method: 'POST', body: JSON.stringify(data) }),
  downloadStudentDocument: (id: string) =>
    request<any>(`student-documents/${id}/download`),
  deleteStudentDocument: (id: string) =>
    request<{ success: boolean }>(`student-documents/${id}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────
  // Date Sheets (Academic → Exams & Date Sheets)
  // ───────────────────────────────────────────────────────────
  getDateSheets: (params?: { examId?: string; part?: string; branchId?: string; program?: string }) => {
    const q = new URLSearchParams();
    if (params?.examId) q.set('examId', params.examId);
    if (params?.part) q.set('part', params.part);
    if (params?.branchId) q.set('branchId', params.branchId);
    if (params?.program) q.set('program', params.program);
    const qs = q.toString();
    return request<any[]>(qs ? `date-sheets?${qs}` : 'date-sheets');
  },
  saveDateSheet: (data: { examId: string; examName?: string; part: string; program: string; branchId?: string; entries: { subject: string; examDate: string; examTime?: string; roomName?: string }[] }) =>
    request<any>('date-sheets', { method: 'POST', body: JSON.stringify(data) }),
  deleteDateSheet: (id: string) =>
    request<{ success: boolean }>(`date-sheets/${id}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────
  // Bulk Misc Charges (Accountant → Misc Charges → bulk add by Part)
  // ───────────────────────────────────────────────────────────
  bulkAddMiscCharges: (data: { part: string; program?: string; branchId?: string; type: string; amount: number; description?: string }) =>
    request<{ success: boolean; created: number; total: number }>('misc-charges/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // ───────────────────────────────────────────────────────────
  // Bulk student import (Excel) — sends pre-mapped rows from the import preview.
  // ───────────────────────────────────────────────────────────
  importStudents: async (students: ImportStudentRow[], branchId?: string) => {
    const r = await request<{
      created: number; skipped: number; errors: number;
      createdRows: { id: string; name: string; rollNo: string; program: string | null }[];
      skippedRows: { index: number; name?: string; reason: string }[];
      errorRows: { index: number; name?: string; error: string }[];
    }>('students/import', { method: 'POST', body: JSON.stringify({ students, branchId }) });
    invalidateCache();
    return r;
  },

  // ───────────────────────────────────────────────────────────
  // Push Notifications (FCM) — device token registration + in-app bell
  // ───────────────────────────────────────────────────────────
  registerDeviceToken: (token: string, platform: string = 'android') =>
    request<{ success: boolean }>('device-tokens', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  unregisterDeviceToken: (token: string) =>
    request<{ success: boolean }>(`device-tokens?token=${encodeURIComponent(token)}`, { method: 'DELETE' }),
  getUnreadCount: () =>
    request<{ unread: number }>('notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ success: boolean }>('notifications/read-all', { method: 'POST' }),
  // v4.4.0: User notification preferences (per-type mute, sound, DND hours).
  getNotificationPreferences: () =>
    cachedGet<{
      mutedTypes: string[];
      soundEnabled: boolean;
      dndEnabled: boolean;
      dndStart: string;
      dndEnd: string;
    }>('notifications/preferences'),
  saveNotificationPreferences: (body: {
    mutedTypes: string[];
    soundEnabled: boolean;
    dndEnabled: boolean;
    dndStart: string;
    dndEnd: string;
  }) => {
    invalidateCache();
    return request<{ success: boolean }>('notifications/preferences', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  sendTestNotification: () =>
    request<{
      success: boolean;
      notificationId: string;
      tokenCount: number;
      tokenPreviews: string[];
      fcmSuccess: number;
      fcmFailed: number;
      errors: Array<{ tokenPreview: string; error: string }>;
      fcmEnabled: boolean;
    }>('notifications/test', { method: 'POST' }),
  broadcastAppUpdate: (version?: string) =>
    request<{ success: boolean; recipients: number; pushed: number; fcmConfigured: boolean }>('notifications/broadcast-app-update', { method: 'POST', body: JSON.stringify({ version }) }),
  checkAppVersion: (current: string) =>
    request<{ latest: string; current: string | null; updateAvailable: boolean; downloadUrl: string; notificationCreated: boolean }>(`app/version-check?current=${encodeURIComponent(current)}`),
  // v4.6.0: Silent update check — does NOT send a push notification.
  // Returns whether an update is available so the web app can show a
  // badge on the sidebar "Update App" button instead of spamming pushes.
  getAppUpdateStatus: (current: string) =>
    request<{ latest: string; current: string | null; updateAvailable: boolean; downloadUrl: string }>(`app/update-status?current=${encodeURIComponent(current)}`),
  getFcmStatus: () =>
    request<{
      fcmEnabled: boolean;
      envVarSet: boolean;
      envVarLength: number;
      parseError: string | null;
      projectId: string | null;
      clientEmail: string | null;
      totalDeviceTokens: number;
      tokensByRole: Array<{ role: string; count: number; users: number }>;
      myDevices: Array<{ platform: string; tokenPreview: string | null; createdAt: string; lastSeen: string }>;
    }>('notifications/fcm-status'),
};

// A single pre-mapped student row for the bulk importer.
export type ImportStudentRow = {
  name: string;
  fatherName?: string;
  phone?: string;
  program?: string;   // canonical (may be '' → flagged)
  part?: string;      // '1' | '2'
  section?: string;   // default 'A'
  baseFee?: number | string | null;
  cnic?: string;
  fatherCnic?: string;
  gender?: string;
  address?: string;
  prevResult?: string;
  rollNo?: string;    // usually blank → auto-generated
  /** Optional installment plan for already-enrolled students imported via
   *  Student Records drill-down. When provided, fee_invoice rows are created
   *  automatically so the student appears in Fee & Installments with invoices
   *  ready (no manual "Generate Plan" step needed). */
  installments?: { amount: number; dueDate?: string }[];
};

// === Shared types for the v1.5.0 module APIs ===
export type DigitalIdStatus = 'active' | 'expired' | 'revoked';
export type DigitalIdCard = {
  id: string; studentId: string; studentName: string; rollNo: string;
  className: string; section: string; instituteName: string; branchName: string;
  photoUrl: string; validThru: string; status: DigitalIdStatus;
  issuedAt: string; bloodGroup: string; contact: string;
};

export type WalletTxnType = 'topup' | 'cafeteria' | 'printing' | 'bookshop' | 'transport' | 'stationery' | 'refund';
export type WalletTransaction = {
  id: string; type: WalletTxnType; merchant: string; amount: number;
  balanceBefore: number; balanceAfter: number;
  date: string; time: string; referenceNo: string;
};

export type PtmDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type PtmApiSlot = {
  id: string; day: PtmDay; startTime: string; endTime: string;
  teacherId: string; teacherName: string;
  booked: boolean; parentName?: string; studentName?: string; agenda?: string;
  isMine: boolean;
};
export type PtmApiUpcoming = {
  id: string; day: PtmDay; startTime: string;
  teacherName: string; parentName: string; studentName: string;
  agenda: string; countdownMinutes: number;
};

export type HealthSeverity = 'high' | 'medium' | 'low';
export type HealthInfirmaryReason = 'headache' | 'injury' | 'fever' | 'stomach' | 'other';
export type HealthRecordBundle = {
  student: { id: string; name: string; rollNo: string; className: string; bloodGroup: string; height: number; weight: number; bmi: number; bmiPrev: number };
  allergies: { id: string; name: string; severity: HealthSeverity }[];
  vaccinations: { id: string; name: string; dateGiven: string; nextDue?: string }[];
  infirmaryVisits: { id: string; date: string; reason: string; reasonType: HealthInfirmaryReason; treatment: string; attendedBy: string }[];
  medications: { id: string; drugName: string; dose: string; startDate: string; notes?: string }[];
  emergencyContacts: { id: string; name: string; relationship: string; phone: string }[];
};
