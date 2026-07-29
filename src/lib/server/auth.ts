import crypto from 'crypto';
import { db, initDB } from './db';

export const SESSION_TTL = 8 * 60 * 60 * 1000;
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
  await db.execute({
    sql: 'INSERT INTO sessions (token, userId, role, issuedAt, expiresAt) VALUES (?, ?, ?, ?, ?)',
    args: [token, user.id, user.role, Date.now(), Date.now() + SESSION_TTL],
  });
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
    class: u.class || null, section: u.section || null,
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
  const result = await db.execute({ sql: 'SELECT * FROM sessions WHERE token = ?', args: [token] });
  if (result.rows.length === 0) throw { status: 401, error: 'Invalid or expired session' };
  const session = result.rows[0] as any;
  if (Date.now() > session.expiresAt) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
    throw { status: 401, error: 'Session expired' };
  }
  const userResult = await db.execute({
    sql: `SELECT u.*, i.name as instituteName, i.short as instituteShort, b.name as branchName
          FROM users u LEFT JOIN institutes i ON u.instituteId = i.id LEFT JOIN branches b ON u.branchId = b.id
          WHERE u.id = ?`,
    args: [session.userId],
  });
  if (userResult.rows.length === 0) throw { status: 401, error: 'User not found' };
  const user = userResult.rows[0] as any;
  if (user.status !== 'Active' || user.blocked === 1) {
    throw { status: 403, error: 'Account is blocked or inactive' };
  }
  // Check institute/branch blocked cascade
  if (user.instituteId && user.role !== 'super-admin') {
    const inst = await db.execute({ sql: 'SELECT blocked FROM institutes WHERE id = ?', args: [user.instituteId] });
    if (inst.rows.length > 0 && (inst.rows[0] as any).blocked === 1) {
      throw { status: 403, error: 'Institute access has been blocked' };
    }
  }
  if (user.branchId && user.role !== 'super-admin') {
    const br = await db.execute({ sql: 'SELECT blocked FROM branches WHERE id = ?', args: [user.branchId] });
    if (br.rows.length > 0 && (br.rows[0] as any).blocked === 1) {
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
