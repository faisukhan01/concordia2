/**
 * Attendance module — bridge ingest + rules engine.
 *
 * Wire these into the existing api/[...path]/route.ts dispatcher in handler.ts:
 *
 *   'bridge/punches'    -> handleBridgePunches
 *   'bridge/heartbeat'  -> handleBridgeHeartbeat
 *   'cron/mark-absent'  -> handleMarkAbsent
 *
 * Bridge routes authenticate with BRIDGE_API_KEY (an env var), NOT the sessions
 * table — the bridge is a machine client, not a user.
 */

import { db } from "./db"; // existing @libsql/client instance

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
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function todayLocal(): string {
  return localDate(new Date().toISOString());
}

function authorize(req: Request): boolean {
  const key = process.env.BRIDGE_API_KEY;
  return !!key && req.headers.get("authorization") === `Bearer ${key}`;
}

// ---------------------------------------------------------------- ingest

type IncomingPunch = {
  pin: string;
  punched_at: string; // UTC ISO
  punch_state?: number;
  status_code?: number;
};

export async function handleBridgePunches(req: Request): Promise<Response> {
  if (!authorize(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { device_serial, punches } = (await req.json()) as {
    device_serial: string;
    punches: IncomingPunch[];
  };

  if (!Array.isArray(punches) || punches.length === 0) {
    return Response.json({ accepted: 0, duplicates: 0, unmapped: [] });
  }

  // Resolve PIN -> student in one query rather than one per punch.
  const pins = [...new Set(punches.map((p) => String(p.pin)))];
  const mapRows = await db.execute({
    sql: `SELECT device_pin, student_id FROM device_users
          WHERE is_active = 1 AND device_pin IN (${pins.map(() => "?").join(",")})`,
    args: pins,
  });
  const pinToStudent = new Map<string, number>(
    mapRows.rows.map((r) => [String(r.device_pin), Number(r.student_id)]),
  );

  // INSERT OR IGNORE is load-bearing: the bridge WILL resend the same punch
  // after a timeout or a restart. Idempotency is not optional here.
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

  const results = await db.batch(inserts, "write");
  const accepted = results.reduce((n, r) => n + Number(r.rowsAffected ?? 0), 0);

  // Recompute only the (student, date) pairs this batch actually touched.
  const affected = new Set<string>();
  for (const p of punches) {
    const sid = pinToStudent.get(String(p.pin));
    if (sid) affected.add(`${sid}|${localDate(p.punched_at)}`);
  }
  for (const key of affected) {
    const [sid, date] = key.split("|");
    await recomputeAttendance(Number(sid), date);
  }

  const unmapped = pins.filter((pin) => !pinToStudent.has(pin));

  return Response.json({
    accepted,
    duplicates: punches.length - accepted,
    unmapped,
  });
}

export async function handleBridgeHeartbeat(req: Request): Promise<Response> {
  if (!authorize(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = await req.json();
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

  return Response.json({ ok: true });
}

// ---------------------------------------------------------------- rules engine

type Settings = {
  late_after_time: string;
  half_day_after_time: string;
  dedup_window_minutes: number;
  working_days: string;
  notify_parents: number;
};

async function getSettings(): Promise<Settings> {
  const r = await db.execute("SELECT * FROM attendance_settings WHERE id = 1");
  return r.rows[0] as unknown as Settings;
}

/**
 * Rebuild one student's attendance row for one date from raw_punches.
 *
 * raw_punches is the source of truth; attendance is a projection. Running this
 * twice must produce the same result. Rows edited by staff (source='manual')
 * are never overwritten.
 */
export async function recomputeAttendance(studentId: number, date: string): Promise<void> {
  const existing = await db.execute({
    sql: `SELECT source FROM attendance WHERE student_id = ? AND date = ?`,
    args: [studentId, date],
  });
  if (existing.rows[0]?.source === "manual") return;

  const holiday = await db.execute({ sql: `SELECT 1 FROM holidays WHERE date = ?`, args: [date] });
  const s = await getSettings();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun
  const isWorkingDay = s.working_days.split(",").map(Number).includes(weekday === 0 ? 7 : weekday);

  if (holiday.rows.length > 0 || !isWorkingDay) {
    await upsertAttendance(studentId, date, null, null, "holiday", 0);
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

  let status = "present";
  let minutesLate = 0;
  if (inMin > halfDayAfter) {
    status = "half_day";
    minutesLate = inMin - lateAfter;
  } else if (inMin > lateAfter) {
    status = "late";
    minutesLate = inMin - lateAfter;
  }

  await upsertAttendance(studentId, date, checkIn, checkOut, status, minutesLate);
}

async function upsertAttendance(
  studentId: number,
  date: string,
  checkIn: string | null,
  checkOut: string | null,
  status: string,
  minutesLate: number,
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO attendance
            (student_id, date, check_in_at, check_out_at, status, minutes_late, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'biometric', datetime('now'))
          ON CONFLICT (student_id, date) DO UPDATE SET
            check_in_at = excluded.check_in_at,
            check_out_at = excluded.check_out_at,
            status = excluded.status,
            minutes_late = excluded.minutes_late,
            updated_at = datetime('now')
          WHERE attendance.source != 'manual'`,
    args: [studentId, date, checkIn, checkOut, status, minutesLate],
  });
}

// ---------------------------------------------------------------- nightly job

/**
 * Vercel Cron. Schedules are UTC — '0 15 * * *' is 8:00 PM Pakistan time.
 *   vercel.json: { "crons": [{ "path": "/api/cron/mark-absent", "schedule": "0 15 * * *" }] }
 *
 * Idempotent: safe to run twice. Skips holidays and non-working days.
 */
export async function handleMarkAbsent(req: Request): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = todayLocal();
  const s = await getSettings();
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const isWorkingDay = s.working_days.split(",").map(Number).includes(weekday === 0 ? 7 : weekday);
  const holiday = await db.execute({ sql: `SELECT 1 FROM holidays WHERE date = ?`, args: [date] });

  if (!isWorkingDay || holiday.rows.length > 0) {
    return Response.json({ date, skipped: "non-working day" });
  }

  const result = await db.execute({
    sql: `INSERT OR IGNORE INTO attendance (student_id, date, status, source)
          SELECT s.id, ?, 'absent', 'biometric'
          FROM students s
          WHERE s.is_active = 1
            AND NOT EXISTS (
              SELECT 1 FROM attendance a WHERE a.student_id = s.id AND a.date = ?
            )`,
    args: [date, date],
  });

  return Response.json({ date, marked_absent: Number(result.rowsAffected ?? 0) });
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
export async function allocatePin(studentId: number): Promise<string> {
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
