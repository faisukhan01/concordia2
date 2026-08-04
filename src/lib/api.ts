// Concordia API client — talks to the in-process Next.js API routes directly (no port).
function apiUrl(path: string) {
  return '/api/' + path.replace(/^\//, '');
}

// === In-memory + sessionStorage cache with stale-while-revalidate ===
// Solves the "every page is slow" problem — GET requests return cached data
// instantly and refresh silently in the background.
const _cache = new Map<string, { data: any; time: number }>();
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
  // No cache — fetch from network
  const data = await request<T>(path);
  _cache.set(path, { data, time: now });
  persistCache();
  return data;
}

async function backgroundRefresh<T>(path: string) {
  try {
    const data = await request<T>(path, { method: 'GET' }, true);
    _cache.set(path, { data, time: Date.now() });
    persistCache();
  } catch {}
}

// Get the stored auth token from the zustand-persisted auth state.
// IMPORTANT: we read from localStorage (NOT sessionStorage) so the session
// survives WebView/app closes — this is what keeps the user logged in across
// app restarts and is a prerequisite for reliable background FCM pushes
// (the device token is registered to the logged-in user).
function getToken(): string | null {
  try {
    const raw = localStorage.getItem('concordia-app');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.token || null;
    }
  } catch {}
  // Backward-compat fallback: some users may still have a sessionStorage entry
  // from the old build. Read it once so they don't get logged out on first
  // load of the new build, then it migrates to localStorage on next login.
  try {
    const raw = sessionStorage.getItem('concordia-app');
    if (raw) {
      const parsed = JSON.parse(raw);
      const token = parsed?.state?.token || null;
      if (token) {
        // Migrate to localStorage so it persists going forward.
        localStorage.setItem('concordia-app', raw);
        sessionStorage.removeItem('concordia-app');
      }
      return token;
    }
  } catch {}
  return null;
}

// Global blocked-state callback — set by the RolePortal to detect access revocation
let onBlockedCallback: ((msg: string) => void) | null = null;
export function setOnBlocked(cb: (msg: string) => void) { onBlockedCallback = cb; }

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

    // Detect blocked/access-revoked errors and trigger global handler
    if (res.status === 403 || res.status === 401) {
      const lowerMsg = errorMsg.toLowerCase();
      if (lowerMsg.includes('blocked') || lowerMsg.includes('access') || lowerMsg.includes('session') || lowerMsg.includes('expired')) {
        if (onBlockedCallback) {
          onBlockedCallback(errorMsg);
        }
      }
    }

    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string, name?: string) =>
    request<{ token: string; user: any; mustChangePassword?: boolean }>('auth/login', { method: 'POST', body: JSON.stringify({ email, password, name }) }),
  // Client-side logout — clears the persisted zustand session from localStorage
  // (and any legacy sessionStorage entry). Auth is stateless bearer-token, so no
  // server round-trip is needed. After calling, the app reloads to '/'.
  logout: async () => {
    try { localStorage.removeItem('concordia-app'); } catch {}
    try { sessionStorage.removeItem('concordia-app'); } catch {}
    // Also clear the API cache so a subsequent login as a different user
    // doesn't see stale cached data from the previous user.
    invalidateCache();
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    request<any>('auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  // platform
  platformOverview: () => cachedGet<any>('platform/overview'),
  institutes: () => cachedGet<any[]>('institutes'),
  institute: (id: string) => cachedGet<any>(`institutes/${id}`),
  createInstitute: async (body: any) => { const r = await request<any>('institutes', { method: 'POST', body: JSON.stringify(body) }); invalidateCache(); return r; },
  updateInstitute: async (id: string, body: any) => { const r = await request<any>(`institutes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); invalidateCache(); return r; },
  editInstitute: async (id: string, body: any) => { const r = await request<any>(`institutes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); invalidateCache(); return r; },
  deleteInstitute: async (id: string) => { const r = await request<any>(`institutes/${id}`, { method: 'DELETE' }); invalidateCache(); return r; },
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
  createPlatformUser: async (body: any) => { const r = await request<any>('platform/users', { method: 'POST', body: JSON.stringify(body) }); invalidateCache(); return r; },
  editUser: async (id: string, body: any) => { const r = await request<any>(`platform/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); invalidateCache(); return r; },
  blockUser: async (id: string, blocked: boolean, reason?: string) =>
    { const r = await request<any>(`platform/users/${id}/block`, { method: 'PATCH', body: JSON.stringify({ blocked, reason }) }); invalidateCache(); return r; },
  deleteUser: async (id: string) =>
    { const r = await request<any>(`platform/users/${id}`, { method: 'DELETE' }); invalidateCache(); return r; },
  getUserPassword: (id: string) => request<any>(`platform/users/${id}/password`),
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
  getClasses: (branchId?: string) => request<any[]>(branchId ? `classes?branchId=${branchId}` : 'classes'),
  // `program` and `part` are optional — pre-existing callers that omit them
  // still work (the backend defaults them to NULL / '1'). New Academic
  // Office flows pass program + part to drive the department hierarchy.
  createClass: (name: string, section: string, branchId?: string, program?: string, part?: string) =>
    request<any>('classes', { method: 'POST', body: JSON.stringify({ name, section, branchId, program, part }) }),
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
  // Create a new section (e.g. Class 1B) inside an existing class. Inherits the parent's course assignments.
  createClassSection: (classId: string, section?: string) =>
    request<any>(`classes/${classId}/sections`, { method: 'POST', body: JSON.stringify({ section }) }),
  // Delete a section (only allowed when it has no students assigned and is not the only section for that class)
  deleteClassSection: (classId: string) =>
    request<any>(`classes/${classId}`, { method: 'DELETE' }),
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
  getDateSheets: (params?: { examId?: string; part?: string; branchId?: string }) => {
    const q = new URLSearchParams();
    if (params?.examId) q.set('examId', params.examId);
    if (params?.part) q.set('part', params.part);
    if (params?.branchId) q.set('branchId', params.branchId);
    const qs = q.toString();
    return request<any[]>(qs ? `date-sheets?${qs}` : 'date-sheets');
  },
  saveDateSheet: (data: { examId: string; examName?: string; part: string; branchId?: string; entries: { subject: string; examDate: string; examTime?: string; roomName?: string }[] }) =>
    request<any>('date-sheets', { method: 'POST', body: JSON.stringify(data) }),
  deleteDateSheet: (id: string) =>
    request<{ success: boolean }>(`date-sheets/${id}`, { method: 'DELETE' }),

  // ───────────────────────────────────────────────────────────
  // Bulk Misc Charges (Accountant → Misc Charges → bulk add by Part)
  // ───────────────────────────────────────────────────────────
  bulkAddMiscCharges: (data: { part: string; program?: string; branchId?: string; type: string; amount: number; description?: string }) =>
    request<{ success: boolean; created: number; total: number }>('misc-charges/bulk', { method: 'POST', body: JSON.stringify(data) }),

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
