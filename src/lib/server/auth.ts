import crypto from 'crypto';
import { db, initDB } from './db';

// ─────────────────────────────────────────────────────────────────────────
// SESSION LIFETIME — WhatsApp-style persistence
// ─────────────────────────────────────────────────────────────────────────
// Sessions live for 365 days and are renewed on a sliding window every time
// the user makes an authenticated request (see requireAuth below). This means
// an active user is NEVER logged out by the server, and a user who closes the
// app and reopens it weeks later still has a valid session.
//
// This is critical for background FCM push notifications: the device token is
// registered to the logged-in user, so the session MUST stay alive for pushes
// to keep flowing. With the old 8-hour TTL, a user who logged in at 9 AM and
// closed the app would be silently logged out by 5 PM — and any push sent
// after that would target a user whose session was gone, breaking delivery.
//
// 365 days is the standard "remember me" lifetime used by WhatsApp, Telegram,
// Gmail, etc. Users can still log out explicitly from the sidebar, which
// clears both the client localStorage entry and the server session row.
export const SESSION_TTL = 365 * 24 * 60 * 60 * 1000;
// Sliding renewal window: if the session is within this much of expiring, we
// extend it on the current request. 7 days means active users never see an
// expiry prompt.
const SESSION_RENEW_WINDOW = 7 * 24 * 60 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; lockedUntil: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOCKOUT_DURATION = 2 * 60 * 1000;

export const ROLE_LABELS: Record<string, string> = {
  'super-admin': 'Super Admin',
  'admin': 'Admin',
  'admissions': 'Admission Office',
  'accountant': 'Accountant',
  'academic': 'Academic Office',
  'institute-admin': 'Institute Admin',
  'branch-manager': 'Branch Manager',
  'teacher': 'Teacher',
  'student': 'Student',
  'parent': 'Parent / Guardian',
};

// Concordia role equivalence — new office roles inherit backend permissions
// from the legacy roles they replace, so all existing requireRole() checks
// in handler.ts keep working without modification.
//   admin       ≡ institute-admin + branch-manager  (top-level college oversight)
//   academic    ≡ branch-manager                    (teachers, timetable, tests, results)
//   admissions  ≡ branch-manager                    (student enrollment + base fee)
//   accountant  ≡ branch-manager                    (fee collection + challans)
const ROLE_EQUIVALENCE: Record<string, string[]> = {
  'admin': ['institute-admin', 'branch-manager'],
  'academic': ['branch-manager'],
  'admissions': ['branch-manager'],
  'accountant': ['branch-manager'],
};

export function nextId(prefix: string) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex');
}

export async function createSession(user: any) {
  const token = 'concordia-' + crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  // v4.5.1: Clean up expired sessions for this user BEFORE creating a new one.
  // Without this, the sessions table grows forever (every login adds a row,
  // expired ones are never deleted) → the Settings page shows "10 active
  // sessions" when only 1 is actually valid. We also cap at 5 most-recent
  // sessions per user to keep the list manageable.
  //
  // ── PERF: batch all 3 statements into a SINGLE Turso round-trip ──
  // (previously 3 sequential round-trips = 150-600ms on login).
  try {
    await db.batch([
      { sql: 'DELETE FROM sessions WHERE userId = ? AND expiresAt < ?', args: [user.id, now] },
      { sql: `DELETE FROM sessions WHERE userId = ? AND token NOT IN (
        SELECT token FROM sessions WHERE userId = ? ORDER BY issuedAt DESC LIMIT 5
      )`, args: [user.id, user.id] },
      { sql: 'INSERT INTO sessions (token, userId, role, issuedAt, expiresAt) VALUES (?, ?, ?, ?, ?)',
        args: [token, user.id, user.role, now, now + SESSION_TTL] },
    ]);
  } catch {
    // Fallback: if batch isn't supported, run individually
    try {
      await db.execute({ sql: 'DELETE FROM sessions WHERE userId = ? AND expiresAt < ?', args: [user.id, now] });
      await db.execute({ sql: `DELETE FROM sessions WHERE userId = ? AND token NOT IN (
        SELECT token FROM sessions WHERE userId = ? ORDER BY issuedAt DESC LIMIT 5
      )`, args: [user.id, user.id] });
    } catch {}
    await db.execute({
      sql: 'INSERT INTO sessions (token, userId, role, issuedAt, expiresAt) VALUES (?, ?, ?, ?, ?)',
      args: [token, user.id, user.role, now, now + SESSION_TTL],
    });
  }
  return token;
}

export function buildUserProfile(u: any) {
  const campus = u.branchName || u.instituteName || u.instituteShort || 'Concordia College';
  return {
    id: u.id, name: u.name, email: u.email, rollNo: u.rollNo, role: u.role,
    roleLabel: ROLE_LABELS[u.role] || u.role, title: u.title || '',
    status: u.status, mustChangePassword: u.mustChangePassword === 1, blocked: u.blocked === 1,
    instituteId: u.instituteId || null, instituteName: u.instituteName || null, instituteShort: u.instituteShort || null,
    branchId: u.branchId || null, branchName: u.branchName || null,
    class: u.class || null, section: u.section || null, part: u.part || null,
    guardian: u.guardian || null, ward: u.ward, wardId: u.wardId,
    fatherName: u.fatherName || null,
    guardianPhone: u.guardianPhone || null,
    cnic: u.cnic || null,
    dob: u.dob || null,
    address: u.address || null,
    prevResult: u.prevResult || null,
    program: u.program || null,
    photoUrl: u.photoUrl || null,
    classId: u.classId || null,
    subjects: u.subjects ? JSON.parse(u.subjects) : [],
    classes: u.classes ? JSON.parse(u.classes) : [],
    baseFee: u.baseFee ?? null, baseFeeLocked: u.baseFeeLocked === 1,
    baseFeePaid: u.baseFeePaid === 1,
    fatherCnic: u.fatherCnic || null,
    gender: u.gender || null,
    campus,
  };
}

export async function requireAuth(req: Request): Promise<any> {
  await initDB();
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, error: 'Authentication required' };
  }
  const token = authHeader.substring(7);

  // ── PERF: single JOINed query replaces 4 sequential round-trips ──
  // Previously: session lookup → user lookup → institute blocked check →
  // branch blocked check = 4 sequential Turso round-trips (200-800ms on
  // every API call). Now: session + user + institute (with blocked flag) +
  // branch (with blocked flag) in ONE query.
  const result = await db.execute({
    sql: `SELECT s.expiresAt, s.token,
                 u.*, i.name as instituteName, i.short as instituteShort, i.blocked as instituteBlocked,
                 b.name as branchName, b.blocked as branchBlocked
          FROM sessions s
          JOIN users u ON s.userId = u.id
          LEFT JOIN institutes i ON u.instituteId = i.id
          LEFT JOIN branches b ON u.branchId = b.id
          WHERE s.token = ?`,
    args: [token],
  });
  if (result.rows.length === 0) throw { status: 401, error: 'Invalid or expired session' };
  const row = result.rows[0] as any;

  if (Date.now() > row.expiresAt) {
    // Expired — fire-and-forget delete (don't block the response on it)
    db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] }).catch(() => {});
    throw { status: 401, error: 'Session expired' };
  }

  // ── Sliding renewal (WhatsApp-style "remember me") ──
  // Only fires an UPDATE when within 7 days of expiry (rare), so the vast
  // majority of requests pay ZERO extra round-trips here. Fire-and-forget
  // so the response isn't blocked by the renewal write.
  try {
    const now = Date.now();
    if (row.expiresAt - now < SESSION_RENEW_WINDOW) {
      const newExpiry = now + SESSION_TTL;
      db.execute({
        sql: 'UPDATE sessions SET expiresAt = ? WHERE token = ?',
        args: [newExpiry, token],
      }).catch(() => {});
    }
  } catch {}

  const user = row;
  if (user.status !== 'Active' || user.blocked === 1) {
    throw { status: 403, error: 'Account is blocked or inactive' };
  }
  // Check institute/branch blocked cascade (from JOINed columns — no extra query)
  if (user.instituteId && user.role !== 'super-admin') {
    if (user.instituteBlocked === 1) {
      throw { status: 403, error: 'Institute access has been blocked' };
    }
  }
  if (user.branchId && user.role !== 'super-admin') {
    if (user.branchBlocked === 1) {
      throw { status: 403, error: 'Branch access has been blocked' };
    }
  }
  return user;
}

export function requireRole(user: any, ...roles: string[]) {
  // Build the set of roles the current user effectively holds — their actual
  // role plus any equivalent legacy roles (see ROLE_EQUIVALENCE above).
  const effective = new Set<string>([user.role, ...(ROLE_EQUIVALENCE[user.role] || [])]);
  for (const r of roles) {
    if (effective.has(r)) return; // authorized
  }
  throw { status: 403, error: 'Not authorized' };
}

export function registerFailedAttempt(rateKey: string) {
  const current = loginAttempts.get(rateKey) || { count: 0, lockedUntil: 0, lastAttempt: 0 };
  current.count++;
  current.lastAttempt = Date.now();
  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    current.lockedUntil = Date.now() + LOCKOUT_DURATION;
    current.count = 0;
    loginAttempts.set(rateKey, current);
    return { status: 429, error: `Too many failed attempts. Account locked for 2 min.` };
  }
  loginAttempts.set(rateKey, current);
  const remaining = MAX_LOGIN_ATTEMPTS - current.count;
  return { status: 401, error: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} left.` };
}

// Auto-clear expired locks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of loginAttempts.entries()) {
    if (val.lockedUntil && now > val.lockedUntil) loginAttempts.delete(key);
    if (!val.lockedUntil && val.count > 0 && now - (val.lastAttempt || 0) > 10 * 60 * 1000) loginAttempts.delete(key);
  }
}, 30 * 1000);

// Clean expired sessions periodically
setInterval(async () => {
  try { await db.execute({ sql: 'DELETE FROM sessions WHERE expiresAt < ?', args: [Date.now()] }); } catch {}
}, 10 * 60 * 1000);
