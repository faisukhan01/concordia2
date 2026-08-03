// firebase-admin's TypeScript exports are notoriously finicky (the `app`,
// `credential`, `messaging` namespaces are attached at runtime but not
// declared as named exports in the .d.ts). Using `import * as admin` confuses
// tsc; using a default import + `any` casts avoids the false positives while
// keeping the runtime behavior identical.
import admin from 'firebase-admin';

// ─────────────────────────────────────────────────────────────────────────
// Firebase Cloud Messaging (FCM) server-side helper.
//
// This module initializes the Firebase Admin SDK ONCE (cached at module scope)
// and exposes a small set of helpers:
//   - sendPushToUser(userId, ...)    — push + persist a notification to ONE user
//   - sendPushToUsers(userIds, ...)  — push + persist to MANY users
//   - sendPushToRole(role, ...)      — push + persist to every user with a role
//
// Each helper:
//   1. Inserts a row into `notifications` (the in-app bell badge + history).
//   2. Looks up every FCM device token for the target user(s) in `device_tokens`.
//   3. Sends a multicast FCM push (works when the app is closed — true push).
//
// Failures in step 3 (invalid token, offline, etc.) are logged + the token is
// deleted from device_tokens so we don't keep sending to dead tokens. The
// in-app notification row is still kept — the user will see it next time they
// open the app's bell dropdown.
//
// CONFIG: the Firebase service account JSON is read from the env var
// FIREBASE_SERVICE_ACCOUNT (a JSON string). This is the recommended approach
// for Vercel — set it in Project Settings → Environment Variables. The value
// is the entire contents of the firebase-adminsdk-*.json file you downloaded.
// ─────────────────────────────────────────────────────────────────────────

import { db } from './db';

// Cast to `any` so we can access the runtime-attached namespaces
// (admin.app, admin.credential, admin.messaging) without TS false positives.
const fb: any = admin;

let _app: any | null = null;

function getServiceAccount(): any | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[fcm] FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON');
    return null;
  }
}

function getApp(): any | null {
  if (_app) return _app;
  const cred = getServiceAccount();
  if (!cred) return null;
  try {
    _app = fb.initializeApp({
      credential: fb.credential.cert(cred),
    });
    console.info('[fcm] Firebase Admin SDK initialized for project:', cred.projectId);
    return _app;
  } catch (e: any) {
    // initializeApp throws if called twice with the same name — reuse the default app.
    if (e?.code === 'app/duplicate-app') {
      _app = fb.app();
      return _app;
    }
    console.error('[fcm] Failed to initialize Firebase Admin SDK:', e?.message || e);
    return null;
  }
}

export function fcmEnabled(): boolean {
  return !!getServiceAccount();
}

// ───────────────────────── Persist notification row ─────────────────────────

export type NotifType =
  | 'announcement'
  | 'exam'
  | 'date-sheet'
  | 'marks'
  | 'attendance'
  | 'fee-due'
  | 'fee-paid'
  | 'salary'
  | 'general';

async function persistNotification(
  userId: string,
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<string> {
  const id = `NTF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.execute({
    sql: `INSERT INTO notifications (id, userId, type, title, body, data, read)
          VALUES (?, ?, ?, ?, ?, ?, 0)`,
    args: [id, userId, type, title, body, data ? JSON.stringify(data) : null],
  });
  return id;
}

// ───────────────────────── Get device tokens for a user ─────────────────────────

async function getTokensForUser(userId: string): Promise<string[]> {
  const r = await db.execute({
    sql: 'SELECT token FROM device_tokens WHERE userId = ?',
    args: [userId],
  });
  return r.rows.map((row: any) => row.token as string).filter(Boolean);
}

async function getTokensForUsers(userIds: string[]): Promise<Map<string, string[]>> {
  if (userIds.length === 0) return new Map();
  // SQLite parameter binding for an IN clause.
  const placeholders = userIds.map(() => '?').join(',');
  const r = await db.execute({
    sql: `SELECT userId, token FROM device_tokens WHERE userId IN (${placeholders})`,
    args: userIds,
  });
  const map = new Map<string, string[]>();
  for (const row of r.rows as any[]) {
    if (!row.token) continue;
    const arr = map.get(row.userId) || [];
    arr.push(row.token);
    map.set(row.userId, arr);
  }
  return map;
}

// ───────────────────────── Send FCM push to tokens ─────────────────────────

async function sendToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  const app = getApp();
  if (!app || tokens.length === 0) return { sent: 0, failed: 0 };

  // Android-specific payload — high priority so the system delivers promptly,
  // and a notification channel so it shows a banner + sound like WhatsApp.
  const message: any = {
    tokens,
    notification: { title, body },
    data: data || {},
    android: {
      priority: 'high',
      notification: {
        channelId: 'concordia_notifications',
        sound: 'default',
        icon: '@mipmap/ic_notification',
        color: '#F26522',
        priority: 'max',
        defaultVibrateTimings: true,
        defaultSound: true,
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
      },
    },
    webpush: {
      headers: { Urgency: 'high' },
    },
  };
  // Cast messaging access through `any` to dodge TS export quirks across
  // firebase-admin versions — the runtime API is stable.
  const messaging: any = app.messaging ? app.messaging() : fb.messaging();

  try {
    const response = await messaging.sendEachForMulticast(message);
    let failed = 0;
    // Clean up invalid tokens (the user uninstalled the app, or the token expired).
    if (response.failureCount > 0) {
      const deadTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failed++;
          const err = resp.error as any;
          // These error codes mean the token is permanently invalid.
          if (
            err?.code === 'messaging/invalid-registration-token' ||
            err?.code === 'messaging/registration-token-not-registered' ||
            err?.code === 'messaging/invalid-argument'
          ) {
            deadTokens.push(tokens[idx]);
          }
        }
      });
      if (deadTokens.length > 0) {
        await Promise.all(
          deadTokens.map((t) =>
            db.execute({ sql: 'DELETE FROM device_tokens WHERE token = ?', args: [t] }).catch(() => {}),
          ),
        );
      }
    }
    return { sent: response.successCount, failed };
  } catch (e: any) {
    console.error('[fcm] sendEachForMulticast error:', e?.message || e);
    return { sent: 0, failed: tokens.length };
  }
}

// ───────────────────────── Public helpers ─────────────────────────

/** Send a notification to ONE user. Persists the in-app row + pushes to all their devices. */
export async function sendPushToUser(
  userId: string,
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ notificationId: string; pushed: number }> {
  const notificationId = await persistNotification(userId, type, title, body, data);
  const tokens = await getTokensForUser(userId);
  if (tokens.length > 0) {
    await sendToTokens(tokens, title, body, data);
  }
  return { notificationId, pushed: tokens.length };
}

/** Send to many users (each gets their own in-app notification row). */
export async function sendPushToUsers(
  userIds: string[],
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number }> {
  if (userIds.length === 0) return { sent: 0 };
  // De-duplicate
  const unique = Array.from(new Set(userIds));
  // Persist one notification row per user
  await Promise.all(
    unique.map((uid) => persistNotification(uid, type, title, body, data)),
  );
  // Push to all their devices
  const tokensByUser = await getTokensForUsers(unique);
  let sent = 0;
  for (const [uid, tokens] of tokensByUser) {
    if (tokens.length > 0) {
      const r = await sendToTokens(tokens, title, body, data);
      sent += r.sent;
    }
  }
  return { sent };
}

/** Send to every user with a given role (e.g. all students, all teachers). */
export async function sendPushToRole(
  role: string,
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; recipients: number }> {
  // Look up all users with that role (active only).
  const r = await db.execute({
    sql: `SELECT id FROM users WHERE role = ? AND status = 'Active'`,
    args: [role],
  });
  const userIds = r.rows.map((row: any) => row.id as string);
  if (userIds.length === 0) return { sent: 0, recipients: 0 };
  const res = await sendPushToUsers(userIds, type, title, body, data);
  return { sent: res.sent, recipients: userIds.length };
}

/** Send to every user in a specific class/section (for exams, date sheets). */
export async function sendPushToClass(
  className: string,
  section: string | undefined,
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; recipients: number }> {
  let sql = `SELECT id FROM users WHERE role = 'student' AND status = 'Active' AND class = ?`;
  const args: any[] = [className];
  if (section) {
    sql += ` AND section = ?`;
    args.push(section);
  }
  const r = await db.execute({ sql, args });
  const userIds = r.rows.map((row: any) => row.id as string);
  if (userIds.length === 0) return { sent: 0, recipients: 0 };
  const res = await sendPushToUsers(userIds, type, title, body, data);
  return { sent: res.sent, recipients: userIds.length };
}
