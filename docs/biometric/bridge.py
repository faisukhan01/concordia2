"""
ZKTeco -> Concordia College dashboard bridge.

Runs on an always-on machine on the college LAN. Holds a live session to the
device, queues every punch to local SQLite first, then forwards to the Next.js
API. Survives internet outages, device reboots, and its own restarts.

Setup:
    pip install pyzk requests python-dotenv
    cp .env.example .env      # fill in values
    python bridge.py
"""

import os
import sys
import time
import json
import sqlite3
import logging
import logging.handlers
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from zk import ZK

load_dotenv()

# ---------------------------------------------------------------- config

DEVICE_IP     = os.environ["DEVICE_IP"]
DEVICE_PORT   = int(os.environ.get("DEVICE_PORT", 4370))
COMM_KEY      = int(os.environ.get("DEVICE_COMM_KEY", 0))
DEVICE_SERIAL = os.environ["DEVICE_SERIAL"]
API_BASE      = os.environ["API_BASE_URL"].rstrip("/")
API_KEY       = os.environ["BRIDGE_API_KEY"]
FORCE_UDP     = os.environ.get("FORCE_UDP", "false").lower() == "true"

# Only forward punches on or after this date. The device already holds thousands
# of historical records from before go-live; without this they would all be
# replayed into the database and generate attendance for past dates.
BACKFILL_SINCE = os.environ.get("BACKFILL_SINCE", "2026-08-12")

PKT        = timezone(timedelta(hours=5))   # Asia/Karachi, no DST
BATCH_SIZE = 100
HEARTBEAT_INTERVAL = 60
QUEUE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "queue.db")

# Log rotation so bridge.log can never fill the disk: 2 MB per file, keep 5
# rotated files (bridge.log, bridge.log.1 … bridge.log.5) = ~12 MB ceiling.
# On an unattended on-site machine this is essential — the process runs for
# months and would otherwise grow an unbounded log.
_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler(
            _LOG_PATH, maxBytes=2 * 1024 * 1024, backupCount=5, encoding="utf-8"
        ),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("bridge")

# ---------------------------------------------------------------- local queue

queue = sqlite3.connect(QUEUE_FILE, check_same_thread=False)
queue.execute("""
    CREATE TABLE IF NOT EXISTS pending (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        pin         TEXT NOT NULL,
        punched_at  TEXT NOT NULL,
        punch_state INTEGER,
        status_code INTEGER,
        queued_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (pin, punched_at)
    )
""")
queue.commit()


def enqueue(pin, device_ts, punch_state, status_code):
    """Store one punch locally. Device timestamps are naive Karachi time."""
    if device_ts.date().isoformat() < BACKFILL_SINCE:
        return False
    utc_iso = device_ts.replace(tzinfo=PKT).astimezone(timezone.utc) \
                       .isoformat(timespec="seconds").replace("+00:00", "Z")
    cur = queue.execute(
        "INSERT OR IGNORE INTO pending (pin, punched_at, punch_state, status_code) VALUES (?,?,?,?)",
        (str(pin), utc_iso, punch_state, status_code),
    )
    queue.commit()
    return cur.rowcount > 0


def queue_depth():
    return queue.execute("SELECT COUNT(*) FROM pending").fetchone()[0]


def flush():
    """Send queued punches. Rows are deleted only after a 2xx response."""
    sent = 0
    while True:
        rows = queue.execute(
            "SELECT id, pin, punched_at, punch_state, status_code FROM pending ORDER BY id LIMIT ?",
            (BATCH_SIZE,),
        ).fetchall()
        if not rows:
            return sent

        payload = {
            "device_serial": DEVICE_SERIAL,
            "punches": [
                {"pin": r[1], "punched_at": r[2], "punch_state": r[3], "status_code": r[4]}
                for r in rows
            ],
        }
        resp = requests.post(
            f"{API_BASE}/api/bridge/punches",
            json=payload,
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()

        queue.executemany("DELETE FROM pending WHERE id = ?", [(r[0],) for r in rows])
        queue.commit()
        sent += len(rows)

        try:
            body = resp.json()
            if body.get("unmapped"):
                log.warning("unmapped PINs (no student assigned): %s", body["unmapped"])
        except (ValueError, json.JSONDecodeError):
            pass

        if len(rows) < BATCH_SIZE:
            return sent


def heartbeat(conn, extra=None):
    payload = {"device_serial": DEVICE_SERIAL, "queue_depth": queue_depth()}
    if extra:
        payload.update(extra)
    try:
        requests.post(
            f"{API_BASE}/api/bridge/heartbeat",
            json=payload,
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=15,
        )
    except requests.RequestException as e:
        log.warning("heartbeat failed: %s", e)


# ---------------------------------------------------------------- main session

def check_clock(conn):
    """Attendance timing depends entirely on the device clock, not the server."""
    device_time = conn.get_time()
    drift = abs((device_time - datetime.now()).total_seconds())
    if drift > 120:
        log.error(
            "DEVICE CLOCK IS OFF BY %.0f SECONDS (device=%s, machine=%s). "
            "Late/absent marking will be wrong until this is fixed on the device.",
            drift, device_time, datetime.now(),
        )
    return device_time


def session():
    zk = ZK(
        DEVICE_IP, port=DEVICE_PORT, timeout=10, password=COMM_KEY,
        force_udp=FORCE_UDP, ommit_ping=False,
    )
    conn = zk.connect()
    try:
        firmware = conn.get_firmware_version()
        log.info("connected  firmware=%s  serial=%s", firmware, conn.get_serialnumber())
        check_clock(conn)

        # Backfill: recovers anything punched while the bridge was down.
        # get_attendance() returns the FULL device log every time; the UNIQUE
        # constraints here and server-side absorb the repeats.
        stored = conn.get_attendance()
        added = sum(1 for a in stored if enqueue(a.user_id, a.timestamp, a.punch, a.status))
        log.info("device holds %d records, %d new since %s", len(stored), added, BACKFILL_SINCE)

        heartbeat(conn, {"firmware": firmware, "device_log_count": len(stored)})
        if queue_depth():
            log.info("flushed %d queued punches", flush())

        log.info("listening for live punches")
        last_beat = time.time()

        for punch in conn.live_capture():
            if punch is not None:
                if enqueue(punch.user_id, punch.timestamp, punch.punch, punch.status):
                    log.info("punch  pin=%s  at=%s", punch.user_id, punch.timestamp)

            try:
                if queue_depth():
                    flush()
            except requests.RequestException as e:
                log.warning("API unreachable, holding %d punches locally: %s", queue_depth(), e)

            if time.time() - last_beat > HEARTBEAT_INTERVAL:
                heartbeat(conn, {"firmware": firmware})
                last_beat = time.time()
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    log.info("bridge starting  device=%s:%s  serial=%s", DEVICE_IP, DEVICE_PORT, DEVICE_SERIAL)
    backoff = 5
    while True:
        try:
            session()
            backoff = 5
        except KeyboardInterrupt:
            log.info("stopped by user")
            break
        except Exception as e:
            log.error("session failed (%s: %s) — retrying in %ss", type(e).__name__, e, backoff)
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
