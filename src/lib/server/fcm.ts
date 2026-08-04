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
  | 'app-update'
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

  // ─────────────────────────────────────────────────────────────────────
  // HYBRID PAYLOAD: `notification` field + `data` field (WhatsApp-style).
  // ─────────────────────────────────────────────────────────────────────
  // This is the STANDARD reliable pattern used by WhatsApp, Telegram, Gmail,
  // and every major messaging app. Here's why we switched from data-only:
  //
  // PROBLEM with data-only (v3.6.1):
  //   • A data-only payload requires the app's BACKGROUND ISOLATE to spin up
  //     so the Dart `_firebaseMessagingBackgroundHandler` can run and call
  //     `flutterLocalNotifications.show()`.
  //   • On real Android devices — ESPECIALLY Chinese OEMs (Xiaomi, Huawei,
  //     Oppo, Vivo, Realme, OnePlus) — the OS AGGRESSIVELY KILLS background
  //     isolates to save battery. The isolate never spins up, so the local
  //     notification is never shown. The user sees NOTHING.
  //   • Even on stock Android, FCM THROTTLES/DELAYS data-only messages
  //     (even with priority:'high') because it can't verify the app will
  //     actually show a notification — it assumes the app might just be
  //     doing silent data sync.
  //
  // SOLUTION — hybrid `notification` + `data`:
  //   • The `notification` field makes the ANDROID OS ITSELF display the
  //     notification via the system tray. NO Dart code is needed. This works
  //     whether the app is in the foreground, background, OR terminated.
  //   • The OS uses the channel specified in `android.notification.channel_id`
  //     (which the app creates at startup with sound + high importance).
  //   • The `data` field carries extra routing info + is delivered to the
  //     app's onMessage handler (foreground) or onMessageOpenedApp (tap).
  //   • This is EXACTLY how WhatsApp delivers messages — even when the app
  //     is force-killed, the notification still appears because the OS (not
  //     the app) is responsible for displaying it.
  //
  // FOREGROUND behavior:
  //   When the app is open, `onMessage` fires. The Flutter handler reads
  //   title/body from `message.notification` (or `data` for backward compat)
  //   and shows a local notification with sound via our configured channel.
  //
  // CHANNEL IMMUTABILITY:
  //   Android does NOT let apps change a channel's settings after creation.
  //   v3.6.0/v3.6.1 used `concordia_notifications_v2`, v3.7.0 used `_v3`.
  //   v3.8.0 introduces `_v4`. Each release that needs to correct channel
  //   sound settings uses a FRESH channel ID to force Android to create a
  //   new channel with the correct sound + high importance — the old channel
  //   is deleted by the app at startup so it disappears from Settings.
  // ─────────────────────────────────────────────────────────────────────
  const fullData: Record<string, string> = {
    title,
    body,
    ...(data || {}),
  };

  const message: any = {
    tokens,
    notification: {
      title,
      body,
    },
    data: fullData,
    android: {
      priority: 'high',
      notification: {
        // MUST match the channel created at app startup + the manifest's
        // default_notification_channel_id. This is the channel that
        // determines sound, vibration, importance, and heads-up banner.
        channel_id: 'concordia_notifications_v4',
        // Use the default notification sound (the device's stock sound).
        sound: 'default',
        // Default vibration pattern.
        default_vibrate_timings: true,
        // Default LED light settings.
        default_light_settings: true,
        // Show on the lock screen + as a heads-up banner (slides down
        // from the top). 'public' = fully visible on lock screen.
        visibility: 'public',
        // Heads-up notification priority (slides down from top).
        notification_priority: 'PRIORITY_HIGH',
        // Increment the badge count (launcher icon badge on supported launchers).
        notification_count: 1,
        // The status bar icon — must be a white-on-transparent drawable.
        icon: '@drawable/ic_notification',
        // Tint applied to the icon (Concordia orange).
        color: '#F26522',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
          'content-available': 1,
        },
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
    // v4.0.0: Server-side logging for diagnostics. This helps pinpoint
    // whether the issue is token registration (0 tokens) vs FCM delivery
    // (tokens > 0 but failed) vs OEM killing (success but no display).
    console.info(`[fcm] push sent: title="${title.slice(0, 40)}" | tokens=${tokens.length} | success=${response.successCount} | failed=${failed}`);
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
  } else {
    // v4.0.0: Prominent warning — this is the #1 cause of "no notifications
    // on mobile". The user's device token isn't registered, so the push
    // can't be delivered. They need to open the app so the bridge can
    // register the token.
    console.warn(`[fcm] ⚠ NO TOKENS for user ${userId} — push "${title.slice(0, 40)}" was saved to DB but NOT delivered. The user must open the app to register their device token.`);
  }
  return { notificationId, pushed: tokens.length };
}

/**
 * Send a TEST push to ONE user with DETAILED diagnostic info.
 *
 * Unlike sendPushToUser (which returns only counts), this returns:
 *   - The token count for the user
 *   - Masked token previews (so the user can verify it's their device)
 *   - FCM success / failure counts
 *   - Per-token error messages (so we can see WHY delivery failed)
 *   - The FCM message ID (for Firebase support tickets)
 *
 * This is used by the "Send Test Notification" button in the admin
 * diagnostics panel. The detailed response lets the user (and us)
 * pinpoint exactly where the delivery chain breaks:
 *   - 0 tokens → the device never registered (bridge/FCM init issue)
 *   - tokens > 0 but fcmFailed > 0 → the token is invalid/stale
 *   - fcmSuccess > 0 but phone shows nothing → Realme/OEM killed the app
 */
export async function sendTestPushToUser(
  userId: string,
): Promise<{
  notificationId: string;
  tokenCount: number;
  tokenPreviews: string[];
  fcmSuccess: number;
  fcmFailed: number;
  errors: Array<{ tokenPreview: string; error: string }>;
  fcmEnabled: boolean;
}> {
  const title = '🔔 Concordia notifications are working!';
  const userName = await getUserName(userId);
  const body = `Hi ${userName} — this is a test push notification. You'll receive real ones when announcements, exams, marks, attendance, or fees are updated.`;

  const notificationId = await persistNotification(
    userId,
    'general',
    title,
    body,
    { route: 'notifications' },
  );

  const tokens = await getTokensForUser(userId);
  const tokenPreviews = tokens.map((t) =>
    t.length > 24 ? `${t.slice(0, 12)}…${t.slice(-8)}` : `${t.slice(0, 8)}…`,
  );

  if (tokens.length === 0) {
    return {
      notificationId,
      tokenCount: 0,
      tokenPreviews: [],
      fcmSuccess: 0,
      fcmFailed: 0,
      errors: [],
      fcmEnabled: fcmEnabled(),
    };
  }

  const app = getApp();
  if (!app) {
    return {
      notificationId,
      tokenCount: tokens.length,
      tokenPreviews,
      fcmSuccess: 0,
      fcmFailed: tokens.length,
      errors: tokens.map((t, i) => ({
        tokenPreview: tokenPreviews[i],
        error: 'Firebase Admin SDK not initialized (FIREBASE_SERVICE_ACCOUNT env var missing or invalid)',
      })),
      fcmEnabled: false,
    };
  }

  // Build the same hybrid payload as sendToTokens.
  const fullData: Record<string, string> = {
    title,
    body,
    route: 'notifications',
  };
  const message: any = {
    tokens,
    notification: { title, body },
    data: fullData,
    android: {
      priority: 'high',
      notification: {
        channel_id: 'concordia_notifications_v4',
        sound: 'default',
        default_vibrate_timings: true,
        default_light_settings: true,
        visibility: 'public',
        notification_priority: 'PRIORITY_HIGH',
        notification_count: 1,
        icon: '@drawable/ic_notification',
        color: '#F26522',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
          'content-available': 1,
        },
      },
    },
    webpush: { headers: { Urgency: 'high' } },
  };

  const messaging: any = app.messaging ? app.messaging() : fb.messaging();
  const errors: Array<{ tokenPreview: string; error: string }> = [];
  let fcmSuccess = 0;
  let fcmFailed = 0;

  try {
    const response = await messaging.sendEachForMulticast(message);
    fcmSuccess = response.successCount || 0;
    fcmFailed = response.failureCount || 0;

    if (response.failureCount > 0) {
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          const err = resp.error as any;
          const errMsg = err?.message || err?.code || 'Unknown FCM error';
          errors.push({
            tokenPreview: tokenPreviews[idx] || `token[${idx}]`,
            error: errMsg,
          });
          // Clean up permanently invalid tokens.
          if (
            err?.code === 'messaging/invalid-registration-token' ||
            err?.code === 'messaging/registration-token-not-registered' ||
            err?.code === 'messaging/invalid-argument'
          ) {
            db.execute({
              sql: 'DELETE FROM device_tokens WHERE token = ?',
              args: [tokens[idx]],
            }).catch(() => {});
          }
        }
      });
    }
  } catch (e: any) {
    fcmFailed = tokens.length;
    errors.push({
      tokenPreview: '(all)',
      error: e?.message || 'FCM send threw an exception',
    });
  }

  return {
    notificationId,
    tokenCount: tokens.length,
    tokenPreviews,
    fcmSuccess,
    fcmFailed,
    errors,
    fcmEnabled: true,
  };
}

/// Helper: fetch a user's first name (for the test notification greeting).
async function getUserName(userId: string): Promise<string> {
  try {
    const r = await db.execute({
      sql: 'SELECT name FROM users WHERE id = ?',
      args: [userId],
    });
    const name = r.rows[0]?.name as string | undefined;
    return name?.split(' ')[0] || 'there';
  } catch {
    return 'there';
  }
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

/**
 * Send to EVERY active user across ALL roles (admin, admissions, accountant,
 * academic, teacher, student, super-admin). Used for institute-wide broadcasts
 * like "update your app" announcements.
 */
export async function sendPushToAll(
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; recipients: number }> {
  const r = await db.execute({
    sql: `SELECT id FROM users WHERE status = 'Active'`,
  });
  const userIds = r.rows.map((row: any) => row.id as string);
  if (userIds.length === 0) return { sent: 0, recipients: 0 };
  const res = await sendPushToUsers(userIds, type, title, body, data);
  return { sent: res.sent, recipients: userIds.length };
}

/**
 * Send to EVERY staff member across all administrative/managerial roles.
 *
 * v4.1.0: The user (admin/super-admin) complained they never received
 * notifications when announcements, fees, attendance, or marks were created
 * — because the old code only notified the directly-affected users (e.g. the
 * student whose fee was paid) and NOT the institute staff who need visibility
 * into ALL activity. This helper sends a SUMMARY notification to every
 * staff member (super-admin, institute-admin, admin, branch-manager,
 * admissions, accountant, academic) so the management team always knows
 * what's happening across the college.
 *
 * Use this alongside sendPushToUsers/sendPushToRole for any activity where
 * staff oversight is important (fee payments, attendance, marks, exams).
 */
export async function sendPushToStaff(
  type: NotifType,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; recipients: number }> {
  const staffRoles = [
    'super-admin',
    'institute-admin',
    'admin',
    'branch-manager',
    'admissions',
    'accountant',
    'academic',
  ];
  let totalSent = 0;
  let totalRecipients = 0;
  for (const role of staffRoles) {
    const res = await sendPushToRole(role, type, title, body, data);
    totalSent += res.sent;
    totalRecipients += res.recipients;
  }
  return { sent: totalSent, recipients: totalRecipients };
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
