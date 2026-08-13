-- Attendance module migration for Turso (libSQL / SQLite).
-- Timestamps are TEXT ISO-8601 UTC. Booleans are INTEGER 0/1.
-- Add to the existing migrations list in db.ts.

CREATE TABLE IF NOT EXISTS devices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_number     TEXT NOT NULL UNIQUE,
  label             TEXT,
  ip_address        TEXT,
  firmware          TEXT,
  last_heartbeat_at TEXT,
  device_log_count  INTEGER DEFAULT 0,
  queue_depth       INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS device_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  device_pin  TEXT NOT NULL UNIQUE,
  enrolled_at TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_device_users_student ON device_users(student_id);

-- Immutable audit log. Never edited, never deleted.
CREATE TABLE IF NOT EXISTS raw_punches (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_serial TEXT NOT NULL,
  device_pin    TEXT NOT NULL,
  student_id    INTEGER REFERENCES students(id),
  punched_at    TEXT NOT NULL,
  local_date    TEXT NOT NULL,
  punch_state   INTEGER,
  status_code   INTEGER,
  received_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (device_serial, device_pin, punched_at)
);
CREATE INDEX IF NOT EXISTS idx_raw_punches_lookup ON raw_punches(local_date, student_id);
CREATE INDEX IF NOT EXISTS idx_raw_punches_pin ON raw_punches(device_pin, local_date);

-- Derived from raw_punches. Rebuildable at any time.
CREATE TABLE IF NOT EXISTS attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id),
  date          TEXT NOT NULL,
  check_in_at   TEXT,
  check_out_at  TEXT,
  status        TEXT NOT NULL,
  minutes_late  INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'biometric',
  edited_by     INTEGER,
  note          TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date, status);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id, date);

CREATE TABLE IF NOT EXISTS attendance_settings (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  late_after_time      TEXT NOT NULL DEFAULT '08:15',
  half_day_after_time  TEXT NOT NULL DEFAULT '10:00',
  dedup_window_minutes INTEGER NOT NULL DEFAULT 3,
  working_days         TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
  notify_parents       INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO attendance_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS holidays (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT
);

INSERT OR IGNORE INTO devices (serial_number, label, ip_address)
VALUES ('A8N5232460400', 'Main Gate', '192.168.100.201');
