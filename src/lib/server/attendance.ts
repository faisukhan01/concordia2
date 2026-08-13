/**
 * Biometric attendance — bridge ingest + rules engine.
 *
 * Adapted from docs/biometric/attendance.ts to THIS codebase:
 *   • student ids are TEXT (users.id like 'U-abc123'), NOT integers.
 *   • the daily table is `attendance_daily`, NOT `attendance` (that name is
 *     already taken by the teachers' manual JSON register).
 *   • "absent" is only ever set for ENROLLED students (those with an active
 *     device_users PIN) so rollout does not flood thousands of false absents.
 *   • on a student's first check-in of the day we push to the linked parent(s),
 *     gated behind attendance_settings.notify_parents.
 *
 * Wired into api/[...path]/route.ts via handler.ts (auth done in the handler,
 * body already parsed by the dispatcher — these are pure functions):
 *   POST bridge/punches    -> ingestPunches   (BRIDGE_API_KEY)
 *   POST bridge/heartbeat  -> applyHeartbeat  (BRIDGE_API_KEY)
 *   GET  cron/mark-absent  -> markAbsentNow   (CRON_SECRET)
 *
 * Design rule: raw_punches is the immutable source of truth; attendance_daily
 * is a projection derived from it and rebuildable at any time, EXCEPT rows
 * where source='manual' (staff overrides — including 'leave').
 */

import { db } from './db';

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5, no DST

// ---------------------------------------------------------------- time helpers

/** 'YYYY-MM-DD' in Asia/Karachi for a UTC ISO timestamp. */
export function localDate(utcIso: string): string {
  return new Date(new Date(utcIso).getTime() + KARACHI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** Minutes past local midnight, for comparing against '08:15' style settings. */
function localMinutes(utcIso: string): number {
  const d = new Date(new Date(utcIso).getTime() + KARACHI_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function settingMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function todayLocal(): string {
  return localDate(new Date().toISOString());
}

/** '8:05 AM' style local time from a UTC ISO timestamp (for parent messages). */
export function localClock(utcIso: string): string {
  const d = new Date(new Date(utcIso).getTime() + KARACHI_OFFSET_MS);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** True when the request carries the machine bridge's API key. */
export function authorizeBridge(authHeader: string | null): boolean {
  const key = process.env.BRIDGE_API_KEY;
  return !!key && authHeader === `Bearer ${key}`;
}

// ---------------------------------------------------------------- ingest

type IncomingPunch = {
  pin: string;
  punched_at: string; // UTC ISO
  punch_state?: number;
  status_code?: number;
};

export type IngestPayload = { device_serial: string; punches: IncomingPunch[] };

/**
 * Ingest a batch of punches. Pure (no Request) — auth + body parsing happen in
 * the handler, which has already read req.json(). Idempotent: INSERT OR IGNORE
 * absorbs the bridge's resends.
 */
export async function ingestPunches(payload: IngestPayload): Promise<{
  accepted: number;
  duplicates: number;
  unmapped: string[];
}> {
  const { device_serial, punches } = payload || ({} as IngestPayload);

  if (!Array.isArray(punches) || punches.length === 0) {
    return { accepted: 0, duplicates: 0, unmapped: [] };
  }

  // Resolve PIN -> student in one query rather than one per punch.
  const pins = [...new Set(punches.map((p) => String(p.pin)))];
  const mapRows = await db.execute({
    sql: `SELECT device_pin, student_id, enrolled_at FROM device_users
          WHERE is_active = 1 AND device_pin IN (${pins.map(() => '?').join(',')})`,
    args: pins,
  });
  const pinToStudent = new Map<string, string>(
    mapRows.rows.map((r) => [String(r.device_pin), String(r.student_id)]),
  );
  // PINs that have never punched before (enrolled_at NULL) — first punch on
  // any of these confirms the fingerprint enrollment.
  const unconfirmedPins = new Set<string>(
    mapRows.rows.filter((r) => !r.enrolled_at).map((r) => String(r.device_pin)),
  );

  // INSERT OR IGNORE is load-bearing: the bridge WILL resend the same punch
  // after a timeout or a restart. Idempotency is not optional here. Batch so
  // 100 punches are ONE Turso round-trip, not 100.
  const inserts = punches.map((p) => ({
    sql: `INSERT OR IGNORE INTO raw_punches
            (device_serial, device_pin, student_id, punched_at, local_date, punch_state, status_code)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      device_serial,
      String(p.pin),
      pinToStudent.get(String(p.pin)) ?? null,
      p.punched_at,
      localDate(p.punched_at),
      p.punch_state ?? null,
      p.status_code ?? null,
    ],
  }));

  const results = await db.batch(inserts, 'write');
  const accepted = results.reduce((n, r) => n + Number(r.rowsAffected ?? 0), 0);

  // Auto-confirm enrollment: first ever punch for a mapped-but-unconfirmed PIN
  // stamps enrolled_at. Lets the Admission portal show "fingerprint confirmed".
  const pinsSeen = new Set(punches.map((p) => String(p.pin)));
  const toConfirm = [...unconfirmedPins].filter((pin) => pinsSeen.has(pin));
  if (toConfirm.length > 0) {
    await db.batch(
      toConfirm.map((pin) => ({
        sql: `UPDATE device_users SET enrolled_at = ? WHERE device_pin = ? AND enrolled_at IS NULL`,
        args: [new Date().toISOString(), pin],
      })),
      'write',
    );
  }

  // Recompute only the (student, date) pairs this batch actually touched. Track
  // which of those had NO check-in beforehand so we can fire a single parent
  // notification on the true first check-in of the day.
  const affected = new Set<string>();
  for (const p of punches) {
    const sid = pinToStudent.get(String(p.pin));
    if (sid) affected.add(`${sid}|${localDate(p.punched_at)}`);
  }

  const today = todayLocal();
  const settings = await getSettings();
  for (const key of affected) {
    const [sid, date] = key.split('|');
    // Snapshot prior check-in so we only notify on the FIRST one.
    const prior = await db.execute({
      sql: `SELECT check_in_at FROM attendance_daily WHERE student_id = ? AND date = ?`,
      args: [sid, date],
    });
    const hadCheckIn = !!(prior.rows[0]?.check_in_at);

    await recomputeAttendance(sid, date);

    if (!hadCheckIn && date === today && settings.notify_parents === 1) {
      const after = await db.execute({
        sql: `SELECT check_in_at, status FROM attendance_daily WHERE student_id = ? AND date = ?`,
        args: [sid, date],
      });
      const checkIn = after.rows[0]?.check_in_at as string | undefined;
      if (checkIn) {
        // Fire-and-forget — never let a push failure break ingest.
        notifyParentsOfCheckIn(sid, checkIn).catch((e) =>
          console.error('[attendance] parent notify failed:', e),
        );
      }
    }
  }

  const unmapped = pins.filter((pin) => !pinToStudent.has(pin));

  return {
    accepted,
    duplicates: punches.length - accepted,
    unmapped,
  };
}

/** Update device liveness/telemetry from a heartbeat body. */
export async function applyHeartbeat(b: any): Promise<{ ok: true }> {
  await db.execute({
    sql: `UPDATE devices
          SET last_heartbeat_at = ?, queue_depth = ?,
              device_log_count = COALESCE(?, device_log_count),
              firmware = COALESCE(?, firmware)
          WHERE serial_number = ?`,
    args: [
      new Date().toISOString(),
      b.queue_depth ?? 0,
      b.device_log_count ?? null,
      b.firmware ?? null,
      b.device_serial,
    ],
  });

  return { ok: true };
}

// ---------------------------------------------------------------- parent push

/** Push "Ahmed checked in at 8:05 AM" to every parent linked to the student. */
async function notifyParentsOfCheckIn(studentId: string, checkInIso: string): Promise<void> {
  const stu = await db.execute({
    sql: `SELECT name FROM users WHERE id = ?`,
    args: [studentId],
  });
  const name = (stu.rows[0]?.name as string) || 'Your child';
  // Parents link to the student via ward / wardId (same pattern as elsewhere).
  const parents = await db.execute({
    sql: `SELECT id FROM users WHERE role = 'parent' AND (wardId = ? OR ward = ?)`,
    args: [studentId, name],
  });
  if (parents.rows.length === 0) return;
  const { sendPushToUser } = await import('./fcm');
  const title = '🟢 Checked in';
  const body = `${name} checked in at ${localClock(checkInIso)}.`;
  for (const p of parents.rows) {
    await sendPushToUser(String((p as any).id), 'attendance', title, body, {
      route: 'student-biometric',
    });
  }
}

// ---------------------------------------------------------------- rules engine

type Settings = {
  late_after_time: string;
  half_day_after_time: string;
  dedup_window_minutes: number;
  working_days: string;
  notify_parents: number;
};

export async function getSettings(): Promise<Settings> {
  const r = await db.execute('SELECT * FROM attendance_settings WHERE id = 1');
  return r.rows[0] as unknown as Settings;
}

function isWorkingDay(settings: Settings, date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun
  return settings.working_days
    .split(',')
    .map(Number)
    .includes(weekday === 0 ? 7 : weekday);
}

/**
 * Rebuild one student's attendance row for one date from raw_punches.
 *
 * raw_punches is the source of truth; attendance_daily is a projection. Running
 * this twice must produce the same result. Rows edited by staff (source='manual',
 * which also covers 'leave') are never overwritten.
 */
export async function recomputeAttendance(studentId: string, date: string): Promise<void> {
  const existing = await db.execute({
    sql: `SELECT source FROM attendance_daily WHERE student_id = ? AND date = ?`,
    args: [studentId, date],
  });
  if (existing.rows[0]?.source === 'manual') return; // manual/leave wins

  const s = await getSettings();
  const holiday = await db.execute({ sql: `SELECT 1 FROM holidays WHERE date = ?`, args: [date] });

  if (holiday.rows.length > 0 || !isWorkingDay(s, date)) {
    await upsertBiometricAttendance(studentId, date, null, null, 'holiday', 0);
    return;
  }

  const punchRows = await db.execute({
    sql: `SELECT punched_at FROM raw_punches
          WHERE student_id = ? AND local_date = ? ORDER BY punched_at ASC`,
    args: [studentId, date],
  });
  const times = punchRows.rows.map((r) => String(r.punched_at));
  if (times.length === 0) return; // absent is set by the nightly job, not here

  // Collapse repeat touches — students press the sensor two or three times.
  // The raw rows stay in the audit log; they just don't move check-in/out.
  const windowMs = s.dedup_window_minutes * 60 * 1000;
  const deduped = times.filter(
    (t, i) => i === 0 || new Date(t).getTime() - new Date(times[i - 1]).getTime() > windowMs,
  );

  const checkIn = deduped[0];
  const checkOut = deduped.length > 1 ? deduped[deduped.length - 1] : null;

  const inMin = localMinutes(checkIn);
  const lateAfter = settingMinutes(s.late_after_time);
  const halfDayAfter = settingMinutes(s.half_day_after_time);

  let status = 'present';
  let minutesLate = 0;
  if (inMin > halfDayAfter) {
    status = 'half_day';
    minutesLate = inMin - lateAfter;
  } else if (inMin > lateAfter) {
    status = 'late';
    minutesLate = inMin - lateAfter;
  }

  await upsertBiometricAttendance(studentId, date, checkIn, checkOut, status, minutesLate);
}

async function upsertBiometricAttendance(
  studentId: string,
  date: string,
  checkIn: string | null,
  checkOut: string | null,
  status: string,
  minutesLate: number,
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO attendance_daily
            (student_id, date, check_in_at, check_out_at, status, minutes_late, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'biometric', datetime('now'))
          ON CONFLICT (student_id, date) DO UPDATE SET
            check_in_at = excluded.check_in_at,
            check_out_at = excluded.check_out_at,
            status = excluded.status,
            minutes_late = excluded.minutes_late,
            updated_at = datetime('now')
          WHERE attendance_daily.source != 'manual'`,
    args: [studentId, date, checkIn, checkOut, status, minutesLate],
  });
}

/**
 * Rebuild every ENROLLED student's attendance across a date range from
 * raw_punches. Manual rows are preserved by recomputeAttendance. Used by the
 * admin "Recompute" button. Returns the number of (student, date) pairs walked.
 */
export async function recomputeRange(from: string, to: string): Promise<number> {
  // Only students who have an active device mapping are eligible.
  const students = await db.execute({
    sql: `SELECT du.student_id AS id FROM device_users du
          JOIN users u ON u.id = du.student_id
          WHERE du.is_active = 1 AND u.role = 'student' AND u.status = 'Active'`,
    args: [],
  });
  const ids = students.rows.map((r) => String((r as any).id));

  // Walk each date in [from, to] inclusive.
  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  let count = 0;
  for (const date of dates) {
    for (const id of ids) {
      await recomputeAttendance(id, date);
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------- nightly job

/**
 * Vercel Cron. Schedules are UTC — '0 15 * * *' is 8:00 PM Pakistan time.
 *   vercel.json: { "crons": [{ "path": "/api/cron/mark-absent", "schedule": "0 15 * * *" }] }
 *
 * Idempotent (INSERT OR IGNORE): safe to run twice. Skips holidays and
 * non-working days. Marks absent ONLY enrolled students with no punch — never
 * the whole roster (see the rollout decision in the module docs). Auth is
 * checked by the caller (CRON_SECRET).
 */
export async function markAbsentNow(): Promise<{ date: string; skipped?: string; marked_absent?: number }> {
  const date = todayLocal();
  const s = await getSettings();
  const holiday = await db.execute({ sql: `SELECT 1 FROM holidays WHERE date = ?`, args: [date] });

  if (!isWorkingDay(s, date) || holiday.rows.length > 0) {
    return { date, skipped: 'non-working day' };
  }

  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO attendance_daily (student_id, date, status, source)
          SELECT du.student_id, ?, 'absent', 'biometric'
          FROM device_users du
          JOIN users u ON u.id = du.student_id
          WHERE du.is_active = 1 AND u.role = 'student' AND u.status = 'Active'
            AND NOT EXISTS (
              SELECT 1 FROM attendance_daily a WHERE a.student_id = du.student_id AND a.date = ?
            )`,
    args: [date, date],
  });

  return { date, marked_absent: Number(result.rowsAffected ?? 0) };
}

// ---------------------------------------------------------------- PIN allocation

/**
 * Device user IDs must be numeric — a roll number like '2023-BSCS-045' cannot be
 * typed on the keypad. Generate a 7-digit numeric PIN instead and keep the
 * mapping here, so roll numbers can change without re-enrolling fingerprints.
 *
 * Starts at 1000000 to stay clear of the low IDs (1, 9, 10, 11...) already on
 * the device from before go-live.
 */
export async function allocatePin(studentId: string): Promise<string> {
  const existing = await db.execute({
    sql: `SELECT device_pin FROM device_users WHERE student_id = ?`,
    args: [studentId],
  });
  if (existing.rows[0]) return String(existing.rows[0].device_pin);

  const max = await db.execute(
    `SELECT MAX(CAST(device_pin AS INTEGER)) AS m FROM device_users`,
  );
  const next = Math.max(Number(max.rows[0]?.m ?? 0) + 1, 1000000);
  const pin = String(next);

  await db.execute({
    sql: `INSERT INTO device_users (student_id, device_pin) VALUES (?, ?)`,
    args: [studentId, pin],
  });
  return pin;
}

/**
 * Allocate PINs to many students in ONE pass — computes the next free PIN once,
 * then hands out consecutive numbers and inserts them in a single batch. Students
 * who already have a PIN keep it. Used by the "Allocate PIN to whole section"
 * button.
 */
export async function allocatePinsBulk(studentIds: string[]): Promise<{ studentId: string; pin: string; created: boolean }[]> {
  if (studentIds.length === 0) return [];
  const uniq = [...new Set(studentIds)];
  const existing = await db.execute({
    sql: `SELECT student_id, device_pin FROM device_users WHERE student_id IN (${uniq.map(() => '?').join(',')})`,
    args: uniq,
  });
  const have = new Map<string, string>(existing.rows.map((r) => [String(r.student_id), String(r.device_pin)]));

  const maxR = await db.execute(`SELECT MAX(CAST(device_pin AS INTEGER)) AS m FROM device_users`);
  let next = Math.max(Number(maxR.rows[0]?.m ?? 0) + 1, 1000000);

  const out: { studentId: string; pin: string; created: boolean }[] = [];
  const inserts: { sql: string; args: any[] }[] = [];
  for (const sid of uniq) {
    if (have.has(sid)) { out.push({ studentId: sid, pin: have.get(sid)!, created: false }); continue; }
    const pin = String(next++);
    inserts.push({ sql: `INSERT INTO device_users (student_id, device_pin) VALUES (?, ?)`, args: [sid, pin] });
    out.push({ studentId: sid, pin, created: true });
  }
  if (inserts.length > 0) await db.batch(inserts, 'write');
  return out;
}
