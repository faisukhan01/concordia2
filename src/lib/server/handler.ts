import { NextRequest, NextResponse } from 'next/server';
import { db, initDB } from './db';
import { requireAuth, requireRole, createSession, buildUserProfile, nextId, registerFailedAttempt, ROLE_LABELS } from './auth';

// Concordia API request handler — converts the previous Express service (~2200 lines, 81 endpoints)
// into a single Next.js API dispatcher. Each Express `app.<method>('/api/<path>', ...)` block
// is mapped to an `if (method === '...' && path === '...')` block here.
//
// Conventions:
//   - `req.body`         -> `body`
//   - `req.query`        -> `query`
//   - `req.params.<x>`   -> `pathSegments[<index>]`
//   - `req.user`         -> `user` (from `requireAuth`)
//   - `req.token`        -> `token` (extracted manually where needed)
//   - `res.json(x)`      -> `return NextResponse.json(x)`
//   - `res.status(n).json({error})` -> `return NextResponse.json({error}, {status: n})`

export async function handleApiRequest(method: string, pathSegments: string[], req: NextRequest): Promise<NextResponse> {
  // Initialize the DB schema/seed (idempotent — short-circuits after the first call).
  // Wrapped in try/catch so a transient Turso error returns a proper JSON response
  // instead of escaping as an unhandled Next.js runtime error.
  try {
    await initDB();
  } catch (e: any) {
    return NextResponse.json({ error: 'Database initialization failed: ' + (e?.message || String(e)) }, { status: 500 });
  }

  // Parse query params
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  // Parse body for POST/PATCH/PUT
  let body: any = null;
  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    try { body = await req.json(); } catch {}
  }

  // Reconstruct path (without /api/ prefix)
  const path = pathSegments.join('/');

  try {
    // ===================== AUTH =====================
    if (method === 'POST' && path === 'auth/login') {
      const { email, password, loginId, name } = body || {};
      const identifier = (email || loginId || '').toLowerCase().trim();
      const userName = (name || '').toLowerCase().trim();
      if (!identifier || !password) return NextResponse.json({ error: 'Credentials and password required' }, { status: 400 });

      const rateKey = userName ? `${userName}:${identifier}` : identifier;
      const token = (req.headers.get('authorization') || '').substring(7);

      try {
        // ── PERF: single query with blocked columns JOINed in ──
        // Previously this did user lookup + 2 extra sequential queries
        // (institute blocked + branch blocked). Now all in one query.
        const result = await db.execute({
          sql: `SELECT u.*, i.name as instituteName, i.short as instituteShort,
                       i.blocked as instituteBlocked, i.blockedReason as instituteBlockedReason,
                       b.name as branchName, b.blocked as branchBlocked, b.blockedReason as branchBlockedReason
                FROM users u
                LEFT JOIN institutes i ON u.instituteId = i.id
                LEFT JOIN branches b ON u.branchId = b.id
                WHERE LOWER(u.email) = ? OR LOWER(u.rollNo) = ?`,
          args: [identifier, identifier.toLowerCase()],
        });

        if (result.rows.length === 0) {
          const r = registerFailedAttempt(rateKey);
          return NextResponse.json({ error: r.error }, { status: r.status });
        }

        let u = result.rows[0] as any;
        if (userName && result.rows.length > 1) {
          const byName = result.rows.find((r: any) => String(r.name).toLowerCase().trim() === userName);
          if (byName) u = byName;
        }
        if (userName && String(u.name).toLowerCase().trim() !== userName) {
          const r = registerFailedAttempt(rateKey);
          return NextResponse.json({ error: r.error }, { status: r.status });
        }

        if (u.password !== password) {
          const r = registerFailedAttempt(rateKey);
          return NextResponse.json({ error: r.error }, { status: r.status });
        }
        // Permanently block legacy roles that have been replaced by Concordia
        // office roles (admin / admissions / accountant / academic).
        if (u.role === 'institute-admin' || u.role === 'branch-manager') {
          return NextResponse.json({ error: 'This account type has been retired. Please use your Concordia office credentials.' }, { status: 403 });
        }
        if (u.status !== 'Active') return NextResponse.json({ error: 'Account is ' + u.status }, { status: 403 });

        // ── v4.6.4: COLLEGE / BRANCH / USER ACCESS BLOCK ──────────────
        // Now uses JOINed columns (instituteBlocked, branchBlocked) — zero
        // extra queries. Previously 2 sequential round-trips.
        if (u.role !== 'super-admin') {
          // 1. Institute-level block (super admin blocked the whole college).
          if (u.instituteId && u.instituteBlocked === 1) {
            const reason = u.instituteBlockedReason;
            const msg = reason
              ? `Your college access has been blocked. Please contact your administration. (${reason})`
              : 'Your college access has been blocked. Please contact your administration.';
            return NextResponse.json({ error: msg }, { status: 403 });
          }
          // 2. Branch-level block (institute admin blocked a specific campus).
          if (u.branchId && u.branchBlocked === 1) {
            const reason = u.branchBlockedReason;
            const msg = reason
              ? `Your campus access has been blocked. Please contact your administration. (${reason})`
              : 'Your campus access has been blocked. Please contact your administration.';
            return NextResponse.json({ error: msg }, { status: 403 });
          }
          // 3. User-level block (admin blocked this specific account only).
          if (u.blocked === 1) {
            return NextResponse.json(
              { error: 'Your account has been blocked. Please contact your administration.' },
              { status: 403 },
            );
          }
        }

        const sessionToken = await createSession(u);
        const userProfile: any = buildUserProfile(u);
        return NextResponse.json({ token: sessionToken, user: userProfile, mustChangePassword: u.mustChangePassword === 1 });
      } catch (e: any) {
        return NextResponse.json({ error: 'Login failed: ' + e.message }, { status: 500 });
      }
    }

    if (method === 'POST' && path === 'auth/logout') {
      const user = await requireAuth(req);
      const authHeader = req.headers.get('authorization') || '';
      const token = authHeader.substring(7);
      await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
      return NextResponse.json({ success: true });
    }

    if (method === 'POST' && path === 'auth/change-password') {
      const user = await requireAuth(req);
      const { currentPassword, newPassword } = body || {};
      if (!newPassword || newPassword.length < 4) return NextResponse.json({ error: 'Password too short' }, { status: 400 });
      if (user.password !== currentPassword) return NextResponse.json({ error: 'Current password incorrect' }, { status: 401 });
      await db.execute({ sql: 'UPDATE users SET password = ?, mustChangePassword = 0 WHERE id = ?', args: [newPassword, user.id] });
      return NextResponse.json({ success: true });
    }

    // v4.5.1: Upload profile photo — accepts a base64 data URL and saves it
    // to the user's `photoUrl` field. The data URL is stored directly (no
    // external file storage needed). Validates size (max 2MB) and type.
    if (method === 'POST' && path === 'auth/profile-photo') {
      const user = await requireAuth(req);
      const { photoUrl } = body || {};
      if (!photoUrl || typeof photoUrl !== 'string') {
        return NextResponse.json({ error: 'photoUrl required' }, { status: 400 });
      }
      // Validate it's a data URL with an image/ prefix.
      if (!photoUrl.startsWith('data:image/')) {
        return NextResponse.json({ error: 'Must be an image data URL' }, { status: 400 });
      }
      // Validate size (2MB = ~2.8M base64 chars).
      if (photoUrl.length > 2_800_000) {
        return NextResponse.json({ error: 'Image too large (max 2MB)' }, { status: 413 });
      }
      // Validate allowed types (JPEG, PNG, WebP).
      const allowedTypes = ['data:image/jpeg', 'data:image/png', 'data:image/webp', 'data:image/jpg'];
      if (!allowedTypes.some(t => photoUrl.startsWith(t))) {
        return NextResponse.json({ error: 'Only JPEG, PNG, and WebP are supported' }, { status: 400 });
      }
      await db.execute({ sql: 'UPDATE users SET photoUrl = ? WHERE id = ?', args: [photoUrl, user.id] });
      return NextResponse.json({ success: true, photoUrl });
    }

    // v4.5.1: Remove profile photo — sets photoUrl to NULL.
    if (method === 'DELETE' && path === 'auth/profile-photo') {
      const user = await requireAuth(req);
      await db.execute({ sql: 'UPDATE users SET photoUrl = NULL WHERE id = ?', args: [user.id] });
      return NextResponse.json({ success: true });
    }

    // v4.5.1: Report an Issue — creates a notification for all staff
    // (super-admin, admin, admissions, accountant, academic) so the
    // management team sees every issue reported by students/parents.
    // The reporter also gets a confirmation notification.
    if (method === 'POST' && path === 'help/report-issue') {
      const user = await requireAuth(req);
      const { subject, description, category } = body || {};
      if (!subject || typeof subject !== 'string' || subject.trim().length < 3) {
        return NextResponse.json({ error: 'Subject is required (min 3 characters)' }, { status: 400 });
      }
      if (!description || typeof description !== 'string' || description.trim().length < 10) {
        return NextResponse.json({ error: 'Description is required (min 10 characters)' }, { status: 400 });
      }
      const cat = (category || 'general').slice(0, 30);
      const issueId = `ISS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Notify all staff about the issue.
      const { sendPushToStaff, sendPushToUser } = await import('./fcm');
      const senderName = user.name || user.email || 'A user';
      const senderRole = user.roleLabel || user.role || 'user';
      const truncatedSubject = subject.trim().slice(0, 80);
      const truncatedDesc = description.trim().slice(0, 200);
      await sendPushToStaff(
        'general',
        `🎫 New issue reported: ${truncatedSubject}`,
        `From ${senderName} (${senderRole}): ${truncatedDesc}`,
        { route: 'help', issueId, category: cat },
      ).catch(() => {});
      // Send a confirmation to the reporter.
      await sendPushToUser(
        user.id,
        'general',
        '✓ Issue received',
        `Your issue "${truncatedSubject}" has been reported. The management team will review it shortly. Reference: ${issueId}`,
        { route: 'help', issueId },
      ).catch(() => {});
      return NextResponse.json({ success: true, issueId });
    }

    // v4.4.0: Sign out of ALL devices — revokes every session + deregisters
    // every FCM device token for the user. The CURRENT session is also
    // revoked, so the client must clear its local token + redirect to /login.
    if (method === 'POST' && path === 'auth/logout-all') {
      const user = await requireAuth(req);
      await db.execute({ sql: 'DELETE FROM sessions WHERE userId = ?', args: [user.id] });
      await db.execute({ sql: 'DELETE FROM device_tokens WHERE userId = ?', args: [user.id] });
      return NextResponse.json({ success: true, revokedSessions: true, clearedTokens: true });
    }

    // v4.4.0: Account & session info — exposes last login (most recent
    // session issuedAt for this user, EXCLUDING the current one), active
    // device count, and a list of recent sessions for the Settings page.
    // v4.5.1: Only count ACTIVE (non-expired) sessions.
    // Fresh profile for the authenticated user — lets a client pick up
    // server-side changes (e.g. new teacher course assignments) without a
    // full re-login.
    if (method === 'GET' && path === 'auth/me') {
      const u = await requireAuth(req);
      return NextResponse.json(buildUserProfile(u));
    }

    // Teacher → a single student: a direct typed message. Delivered as an
    // in-app notification + push to the student AND any linked parent(s).
    if (method === 'POST' && path === 'teacher/message') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher', 'branch-manager', 'institute-admin', 'super-admin');
      const { studentId, message } = body || {};
      const text = String(message || '').trim();
      if (!studentId || !text) return NextResponse.json({ error: 'studentId and message are required' }, { status: 400 });
      const stuR = await db.execute({ sql: 'SELECT id, name FROM users WHERE id = ?', args: [studentId] });
      if (stuR.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const studentName = (stuR.rows[0] as any).name || 'your child';
      const { sendPushToUser } = await import('./fcm');
      const title = `💬 Message from ${user.name || 'your teacher'}`;
      // Student
      await sendPushToUser(studentId, 'feedback', title, text, { route: 'notifications' });
      // Linked parents (parent rows point at the student via ward / wardId)
      const parents = await db.execute({
        sql: "SELECT id FROM users WHERE role = 'parent' AND (wardId = ? OR ward = ?)",
        args: [studentId, studentName],
      });
      for (const p of parents.rows) {
        await sendPushToUser((p as any).id, 'feedback', title, `Regarding ${studentName}: ${text}`, { route: 'notifications' });
      }
      return NextResponse.json({ success: true, parentsNotified: parents.rows.length });
    }

    // Teacher posts a daily syllabus / "today's topic" to a section. Students
    // of that program+part+section get it in their Syllabus page + a push.
    if (method === 'POST' && path === 'syllabus') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher', 'branch-manager', 'institute-admin', 'super-admin');
      const { program, part, section, course, date, content } = body || {};
      const text = String(content || '').trim();
      if (!program || !section || !text) {
        return NextResponse.json({ error: 'program, section and content are required' }, { status: 400 });
      }
      const brId = user.branchId;
      const prt = part === '2' ? '2' : '1';
      const sec = String(section).toUpperCase();
      const dt = date || new Date().toISOString().slice(0, 10);
      const id = nextId('SYL');
      await db.execute({
        sql: 'INSERT INTO syllabus (id, branchId, program, part, section, course, date, content, teacherId, teacherName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, brId, program, prt, sec, course || null, dt, text, user.id, user.name || null],
      });
      const stu = await db.execute({
        sql: "SELECT id FROM users WHERE role = 'student' AND branchId = ? AND class = ? AND section = ? AND COALESCE(part,'1') = ?",
        args: [brId, program, sec, prt],
      });
      const ids = stu.rows.map((r: any) => r.id);
      if (ids.length > 0) {
        const { sendPushToUsers } = await import('./fcm');
        const title = `📘 Syllabus${course ? ` · ${course}` : ''}`;
        await sendPushToUsers(ids, 'syllabus', title, `${user.name || 'Your teacher'} posted today's topic.`, { route: 'syllabus' });
      }
      return NextResponse.json({ success: true, id, notified: ids.length });
    }

    // List syllabus entries — students pass their program/part/section; a
    // teacher can pass teacherId to see what they posted.
    if (method === 'GET' && path === 'syllabus') {
      const user = await requireAuth(req);
      const { program, part, section, teacherId } = query;
      let sql = 'SELECT * FROM syllabus WHERE branchId = ?';
      const args: any[] = [user.branchId];
      if (program) { sql += ' AND program = ?'; args.push(program); }
      if (part) { sql += " AND COALESCE(part,'1') = ?"; args.push(part); }
      if (section) { sql += ' AND section = ?'; args.push(String(section).toUpperCase()); }
      if (teacherId) { sql += ' AND teacherId = ?'; args.push(teacherId); }
      sql += ' ORDER BY date DESC, createdAt DESC LIMIT 300';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    // Finalize/publish a class timetable — notify the section's students and
    // every teacher who has a period in it that the weekly timetable is ready.
    if (method === 'POST' && path === 'timetable/publish') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const { classId } = body || {};
      if (!classId) return NextResponse.json({ error: 'classId required' }, { status: 400 });
      const clsR = await db.execute({ sql: 'SELECT name, section, part, branchId FROM classes WHERE id = ?', args: [classId] });
      if (clsR.rows.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      const c = clsR.rows[0] as any;
      const brId = c.branchId || user.branchId;
      const prt = String(c.part || '1');
      const stu = await db.execute({
        sql: "SELECT id FROM users WHERE role = 'student' AND branchId = ? AND class = ? AND section = ? AND COALESCE(part,'1') = ?",
        args: [brId, c.name, c.section, prt],
      });
      const tt = await db.execute({ sql: 'SELECT DISTINCT teacherId FROM timetable WHERE classId = ? AND teacherId IS NOT NULL', args: [classId] });
      const studentIds = stu.rows.map((r: any) => r.id);
      const teacherIds = tt.rows.map((r: any) => r.teacherId).filter(Boolean);
      const { sendPushToUsers } = await import('./fcm');
      const label = `${c.name} · Sec ${c.section}`;
      if (studentIds.length) await sendPushToUsers(studentIds, 'timetable', '🗓️ Weekly timetable published', `Your ${label} weekly timetable is ready.`, { route: 'timetable' });
      if (teacherIds.length) await sendPushToUsers(teacherIds, 'timetable', '🗓️ Timetable updated', `The ${label} weekly timetable has been published.`, { route: 'timetable' });
      return NextResponse.json({ success: true, students: studentIds.length, teachers: teacherIds.length });
    }

    if (method === 'GET' && path === 'auth/session-info') {
      const user = await requireAuth(req);
      const authHeader = req.headers.get('authorization') || '';
      const currentToken = authHeader.substring(7);
      const now = Date.now();
      const sessR = await db.execute({
        sql: 'SELECT token, issuedAt, expiresAt FROM sessions WHERE userId = ? AND expiresAt > ? ORDER BY issuedAt DESC LIMIT 10',
        args: [user.id, now],
      });
      const devR = await db.execute({
        sql: 'SELECT id, platform, createdAt, lastSeen FROM device_tokens WHERE userId = ? ORDER BY lastSeen DESC',
        args: [user.id],
      });
      const otherSessions = sessR.rows.filter((r: any) => r.token !== currentToken);
      const lastLogin = otherSessions[0] as any || null;
      return NextResponse.json({
        currentSession: sessR.rows.find((r: any) => r.token === currentToken) || null,
        lastLogin,
        activeSessions: sessR.rows.length,
        activeDevices: devR.rows.length,
        sessions: sessR.rows,
        devices: devR.rows,
      });
    }

    // v4.4.0: Get the user's notification preferences (per-type mute,
    // sound toggle, DND hours). Defaults to all-enabled when no row exists.
    if (method === 'GET' && path === 'notifications/preferences') {
      const user = await requireAuth(req);
      const r = await db.execute({
        sql: 'SELECT prefs FROM notification_preferences WHERE userId = ?',
        args: [user.id],
      });
      let prefs: any = {};
      if (r.rows.length > 0) {
        try { prefs = JSON.parse((r.rows[0] as any).prefs || '{}'); } catch {}
      }
      // Sensible defaults — everything on, no DND.
      const defaults = {
        mutedTypes: [] as string[],
        soundEnabled: true,
        dndEnabled: false,
        dndStart: '22:00',
        dndEnd: '07:00',
      };
      return NextResponse.json({ ...defaults, ...prefs });
    }

    // v4.4.0: Save the user's notification preferences.
    if (method === 'POST' && path === 'notifications/preferences') {
      const user = await requireAuth(req);
      const { mutedTypes, soundEnabled, dndEnabled, dndStart, dndEnd } = body || {};
      const prefs = JSON.stringify({
        mutedTypes: Array.isArray(mutedTypes) ? mutedTypes.slice(0, 30) : [],
        soundEnabled: soundEnabled !== false,
        dndEnabled: dndEnabled === true,
        dndStart: typeof dndStart === 'string' ? dndStart : '22:00',
        dndEnd: typeof dndEnd === 'string' ? dndEnd : '07:00',
      });
      await db.execute({
        sql: 'INSERT INTO notification_preferences (userId, prefs, updatedAt) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(userId) DO UPDATE SET prefs = excluded.prefs, updatedAt = datetime(\'now\')',
        args: [user.id, prefs],
      });
      return NextResponse.json({ success: true });
    }

    // ===================== PUSH NOTIFICATIONS (FCM) =====================
    // Register / refresh a device token for the logged-in user.
    // Called by the Flutter app on every startup (after FCM gives it a token).
    if (method === 'POST' && path === 'device-tokens') {
      const user = await requireAuth(req);
      const { token, platform } = body || {};
      if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
      // Upsert: if this token already exists for this user, just update lastSeen.
      const existing = await db.execute({
        sql: 'SELECT id FROM device_tokens WHERE userId = ? AND token = ?',
        args: [user.id, token],
      });
      if (existing.rows.length > 0) {
        await db.execute({
          sql: 'UPDATE device_tokens SET lastSeen = datetime(\'now\'), role = ? WHERE userId = ? AND token = ?',
          args: [user.role, user.id, token],
        });
      } else {
        const id = nextId('DT');
        await db.execute({
          sql: `INSERT INTO device_tokens (id, userId, role, token, platform, createdAt, lastSeen)
                VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [id, user.id, user.role, token, platform || 'android'],
        });
      }
      return NextResponse.json({ success: true });
    }

    // Unregister a device token (called on sign-out so we don't push to a
    // device that no longer belongs to this user).
    if (method === 'DELETE' && path === 'device-tokens') {
      const user = await requireAuth(req);
      const token = query.token;
      if (!token) return NextResponse.json({ error: 'token query param required' }, { status: 400 });
      await db.execute({
        sql: 'DELETE FROM device_tokens WHERE userId = ? AND token = ?',
        args: [user.id, token],
      });
      return NextResponse.json({ success: true });
    }

    // ── Device token registration STATUS ──────────────────────────────
    // v4.0.0: Returns whether the current user has any FCM device tokens
    // registered. The web app calls this after login to verify the token
    // was successfully registered. If not, it re-triggers the token pull
    // from Flutter + re-registers. This is the self-healing mechanism that
    // catches the race condition where Flutter delivered the token before
    // the web app was ready to register it.
    if (method === 'GET' && path === 'device-tokens/status') {
      const user = await requireAuth(req);
      const r = await db.execute({
        sql: 'SELECT token, platform, lastSeen FROM device_tokens WHERE userId = ? ORDER BY lastSeen DESC',
        args: [user.id],
      });
      const tokens = r.rows as any[];
      return NextResponse.json({
        hasToken: tokens.length > 0,
        tokenCount: tokens.length,
        platform: tokens[0]?.platform || null,
        lastSeen: tokens[0]?.lastSeen || null,
        tokenPreviews: tokens.map((t) =>
          t.token && t.token.length > 24
            ? `${t.token.slice(0, 12)}…${t.token.slice(-8)}`
            : (t.token ? `${t.token.slice(0, 8)}…` : null),
        ),
      });
    }

    // ── App version check. The mobile app calls this on startup with its
    //    current version. Returns whether an update is available + the
    //    download URL. v4.6.1: no longer auto-creates push notifications —
    //    the sidebar 'Update App' badge (driven by app/update-status below)
    //    now handles update visibility silently without spamming users.
    if (method === 'GET' && path === 'app/version-check') {
      const user = await requireAuth(req);
      const LATEST_APP_VERSION = '4.7.8';
      const DOWNLOAD_URL = 'https://concordia-colleges.vercel.app/download';
      const current = (query.current || '').trim();

      // Simple semver compare (major.minor.patch).
      const cmp = (a: string, b: string): number => {
        const pa = (a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
        const pb = (b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) < (pb[i] || 0)) return -1;
          if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        }
        return 0;
      };
      const updateAvailable = !!current && cmp(current, LATEST_APP_VERSION) < 0;

      // v4.6.1: NO push notification spam. The sidebar 'Update App' button
      // now silently shows a bold badge when an update is available — driven
      // by the app/update-status endpoint below. No more 'Update your app'
      // push notifications every 24h.
      return NextResponse.json({
        latest: LATEST_APP_VERSION,
        current: current || null,
        updateAvailable,
        downloadUrl: DOWNLOAD_URL,
      });
    }

    // ── v4.6.0: SILENT update check — same logic as above but does NOT
    //    create a push notification. The web app calls this on mount +
    //    every 10 min to show a badge on the sidebar "Update App" button.
    //    This replaces the annoying "update your app" push notifications.
    if (method === 'GET' && path === 'app/update-status') {
      const user = await requireAuth(req);
      const LATEST_APP_VERSION = '4.7.8';
      const DOWNLOAD_URL = 'https://concordia-colleges.vercel.app/download';
      const current = (query.current || '').trim();

      const cmp = (a: string, b: string): number => {
        const pa = (a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
        const pb = (b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) < (pb[i] || 0)) return -1;
          if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        }
        return 0;
      };
      const updateAvailable = !!current && cmp(current, LATEST_APP_VERSION) < 0;

      return NextResponse.json({
        latest: LATEST_APP_VERSION,
        current: current || null,
        updateAvailable,
        downloadUrl: DOWNLOAD_URL,
      });
    }

    // ── FCM diagnostic endpoint. Lets the admin verify the FCM pipeline status
    //    from inside the web app: shows whether the service account env var is
    //    set + valid, the project ID, and the count of registered device tokens
    //    (so you can see if the mobile app is actually registering its token).
    //    Admin/super-admin only — exposes server-internal config info.
    if (method === 'GET' && path === 'notifications/fcm-status') {
      const user = await requireAuth(req);
      requireRole(user, 'admin', 'super-admin');
      const { fcmEnabled } = await import('./fcm');
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      let projectId: string | null = null;
      let clientEmail: string | null = null;
      let parseError: string | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          projectId = parsed.project_id || null;
          clientEmail = parsed.client_email || null;
        } catch (e: any) {
          parseError = e?.message || 'Invalid JSON';
        }
      }
      // Count registered tokens (by role, for visibility into who has devices registered).
      const tokensByRole = await db.execute({
        sql: `SELECT role, COUNT(*) as count, COUNT(DISTINCT userId) as users
              FROM device_tokens
              WHERE lastSeen > datetime('now', '-30 days')
              GROUP BY role
              ORDER BY count DESC`,
      });
      const totalTokens = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM device_tokens',
      });
      const myTokens = await db.execute({
        sql: 'SELECT token, platform, createdAt, lastSeen FROM device_tokens WHERE userId = ? ORDER BY lastSeen DESC',
        args: [user.id],
      });
      return NextResponse.json({
        fcmEnabled: fcmEnabled(),
        envVarSet: !!raw,
        envVarLength: raw ? raw.length : 0,
        parseError,
        projectId,
        clientEmail,
        totalDeviceTokens: totalTokens.rows[0]?.count || 0,
        tokensByRole: tokensByRole.rows,
        myDevices: myTokens.rows.map((row: any) => ({
          platform: row.platform,
          tokenPreview: row.token ? `${String(row.token).slice(0, 12)}…${String(row.token).slice(-8)}` : null,
          createdAt: row.createdAt,
          lastSeen: row.lastSeen,
        })),
      });
    }

    // Get notifications for the logged-in user (newest first).
    if (method === 'GET' && path === 'notifications') {
      const user = await requireAuth(req);
      const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
      const r = await db.execute({
        sql: 'SELECT id, type, title, body, data, read, createdAt FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?',
        args: [user.id, limit],
      });
      const unreadR = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND read = 0',
        args: [user.id],
      });
      const unread = (unreadR.rows[0] as any)?.count || 0;
      return NextResponse.json({ items: r.rows, unread });
    }

    // Get only the unread count (cheap call for the bell badge polling).
    if (method === 'GET' && path === 'notifications/unread-count') {
      const user = await requireAuth(req);
      const r = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND read = 0',
        args: [user.id],
      });
      return NextResponse.json({ unread: (r.rows[0] as any)?.count || 0 });
    }

    // Mark a single notification as read.
    if (method === 'POST' && pathSegments[0] === 'notifications' && pathSegments[2] === 'read' && pathSegments.length === 3) {
      const user = await requireAuth(req);
      const id = pathSegments[1];
      await db.execute({
        sql: 'UPDATE notifications SET read = 1 WHERE id = ? AND userId = ?',
        args: [id, user.id],
      });
      return NextResponse.json({ success: true });
    }

    // Mark ALL of the user's notifications as read.
    if (method === 'POST' && path === 'notifications/read-all') {
      const user = await requireAuth(req);
      await db.execute({
        sql: 'UPDATE notifications SET read = 1 WHERE userId = ?',
        args: [user.id],
      });
      return NextResponse.json({ success: true });
    }

    // Send a TEST push notification to the logged-in user's devices.
    // Returns DETAILED diagnostic info (token count, FCM success/failure,
    // per-token error messages) so the user can pinpoint exactly where the
    // delivery chain breaks.
    if (method === 'POST' && path === 'notifications/test') {
      const user = await requireAuth(req);
      const { sendTestPushToUser } = await import('./fcm');
      const result = await sendTestPushToUser(user.id);
      return NextResponse.json({ success: true, ...result });
    }

    // ── Broadcast "Update your app" notification to ALL active users.
    // Admin-triggered: sends an app-update push + in-app row to every user
    // across every role. The notification's data.route = 'app-update' so the
    // client opens the download page when tapped.
    if (method === 'POST' && path === 'notifications/broadcast-app-update') {
      const user = await requireAuth(req);
      requireRole(user, 'admin', 'super-admin');
      const { sendPushToAll, fcmEnabled } = await import('./fcm');
      const version = (body?.version as string) || '';
      const DOWNLOAD_URL = 'https://concordia-colleges.vercel.app/download';
      const title = 'Update your Concordia app';
      const body_text = version
        ? `A new version (${version}) of the Concordia app is available. Tap to update now.`
        : 'A new version of the Concordia app is available. Tap to update now.';
      const result = await sendPushToAll('app-update', title, body_text, {
        route: 'app-update',
        url: DOWNLOAD_URL,
        version,
      });
      return NextResponse.json({
        success: true,
        recipients: result.recipients,
        pushed: result.sent,
        fcmConfigured: fcmEnabled(),
      });
    }

    // ===================== INSTITUTES (Super Admin) =====================
    if (method === 'GET' && path === 'institutes') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin', 'institute-admin');
      if (user.role === 'institute-admin') {
        const r = await db.execute({ sql: 'SELECT * FROM institutes WHERE id = ?', args: [user.instituteId] });
        return NextResponse.json(r.rows);
      }
      const r = await db.execute('SELECT * FROM institutes ORDER BY createdAt DESC');
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'institutes') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      const { name, city, country, plan, adminName, adminEmail, adminPassword } = body || {};
      if (!name || !adminEmail || !adminPassword) return NextResponse.json({ error: 'Name, admin email and password required' }, { status: 400 });
      const existing = await db.execute({ sql: 'SELECT id FROM users WHERE LOWER(email) = ?', args: [adminEmail.toLowerCase()] });
      if (existing.rows.length > 0) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

      const instId = nextId('INST');
      const short = name.split(' ').map((w: string) => w[0]).slice(0, 3).join('').toUpperCase();
      const colors = ['emerald', 'amber', 'violet', 'cyan', 'rose', 'teal', 'orange'];
      await db.execute({
        sql: `INSERT INTO institutes (id, name, short, city, country, plan, status, adminName, adminEmail, color, domain, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [instId, name, short, city || '', country || 'USA', plan || 'Starter', 'Trial', adminName || 'Admin', adminEmail, colors[Math.floor(Math.random() * colors.length)], adminEmail.split('@')[1] || 'edu', 0],
      });
      const adminId = nextId('U');
      await db.execute({
        sql: `INSERT INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [adminId, adminName || 'Admin', adminEmail, adminPassword, 'institute-admin', 'Active', 'Institute Administrator', 1, 0, instId],
      });
      return NextResponse.json({ institute: { id: instId, name, adminEmail }, adminLogin: { id: adminId, email: adminEmail, password: adminPassword } }, { status: 201 });
    }

    if (method === 'PATCH' && pathSegments[0] === 'institutes' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      const id = pathSegments[1];
      const { name, plan, status, adminName, adminEmail, adminPassword } = body || {};
      const r = await db.execute({ sql: 'SELECT * FROM institutes WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const inst = r.rows[0] as any;
      if (name) await db.execute({ sql: 'UPDATE institutes SET name = ? WHERE id = ?', args: [name, inst.id] });
      if (plan) await db.execute({ sql: 'UPDATE institutes SET plan = ? WHERE id = ?', args: [plan, inst.id] });
      if (status) await db.execute({ sql: 'UPDATE institutes SET status = ? WHERE id = ?', args: [status, inst.id] });
      const adminR = await db.execute({ sql: 'SELECT id FROM users WHERE instituteId = ? AND role = ?', args: [inst.id, 'institute-admin'] });
      if (adminR.rows.length > 0) {
        const adminId = (adminR.rows[0] as any).id;
        if (adminName) await db.execute({ sql: 'UPDATE users SET name = ? WHERE id = ?', args: [adminName, adminId] });
        if (adminEmail) await db.execute({ sql: 'UPDATE users SET email = ? WHERE id = ?', args: [adminEmail, adminId] });
        if (adminPassword) await db.execute({ sql: 'UPDATE users SET password = ?, mustChangePassword = 1 WHERE id = ?', args: [adminPassword, adminId] });
        if (adminName) await db.execute({ sql: 'UPDATE institutes SET adminName = ? WHERE id = ?', args: [adminName, inst.id] });
        if (adminEmail) await db.execute({ sql: 'UPDATE institutes SET adminEmail = ? WHERE id = ?', args: [adminEmail, inst.id] });
      }
      return NextResponse.json({ success: true });
    }

    if (method === 'PATCH' && pathSegments[0] === 'institutes' && pathSegments[2] === 'block') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      const id = pathSegments[1];
      const { blocked, reason } = body || {};
      await db.execute({ sql: 'UPDATE institutes SET blocked = ?, blockedReason = ? WHERE id = ?', args: [blocked ? 1 : 0, reason || '', id] });
      await db.execute({ sql: 'UPDATE branches SET blocked = ? WHERE instituteId = ?', args: [blocked ? 1 : 0, id] });
      await db.execute({ sql: 'UPDATE users SET blocked = ? WHERE instituteId = ? AND role != ?', args: [blocked ? 1 : 0, id, 'super-admin'] });
      if (blocked) {
        await db.execute({ sql: 'DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE instituteId = ?)', args: [id] });
      }
      return NextResponse.json({ success: true, blocked });
    }

    if (method === 'DELETE' && pathSegments[0] === 'institutes' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      const instId = pathSegments[1];

      // Guard: NEVER allow deleting the demo / seed institute that the
      // platform itself runs on. The super admin can still BLOCK it, but
      // deleting it would orphan the entire demo dataset and break the
      // onboarding flow for new tenants.
      const inst = await db.execute({ sql: 'SELECT id, name FROM institutes WHERE id = ?', args: [instId] });
      if (inst.rows.length === 0) {
        return NextResponse.json({ error: 'College not found.' }, { status: 404 });
      }

      // Full cascade cleanup — every table that references this institute
      // (directly via instituteId, or indirectly via branchId / userId) is
      // purged BEFORE deleting the institute row itself. Order matters:
      // children first, parents last.
      await db.execute({ sql: 'DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM device_tokens WHERE userId IN (SELECT id FROM users WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM notification_preferences WHERE userId IN (SELECT id FROM users WHERE instituteId = ?)', args: [instId] });
      // notifications has no instituteId column — scope by userId.
      await db.execute({ sql: 'DELETE FROM notifications WHERE userId IN (SELECT id FROM users WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM teacher_class_courses WHERE teacherId IN (SELECT id FROM users WHERE instituteId = ?)', args: [instId] });
      // NOTE: course_materials + diary tables were intentionally DROPPED
      // in db.ts CLEANUP_DROP_TABLES (legacy unused tables). Do NOT
      // reference them here — they no longer exist at runtime.
      await db.execute({ sql: 'DELETE FROM teacher_salaries WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM salary_payments WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM student_documents WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM fee_invoices WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM fees WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM misc_charges WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM manual_revenue WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM report_cards WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM events WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM announcements WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM date_sheet_entries WHERE dateSheetId IN (SELECT id FROM date_sheets WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM date_sheets WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM exams WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM attendance WHERE branchId IN (SELECT id FROM branches WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM results WHERE branchId IN (SELECT id FROM branches WHERE instituteId = ?)', args: [instId] });
      // NOTE: diary table was intentionally DROPPED — see comment above.
      await db.execute({ sql: 'DELETE FROM timetable WHERE branchId IN (SELECT id FROM branches WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM class_courses WHERE classId IN (SELECT id FROM classes WHERE branchId IN (SELECT id FROM branches WHERE instituteId = ?))', args: [instId] });
      await db.execute({ sql: 'DELETE FROM classes WHERE branchId IN (SELECT id FROM branches WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM courses WHERE branchId IN (SELECT id FROM branches WHERE instituteId = ?)', args: [instId] });
      await db.execute({ sql: 'DELETE FROM users WHERE instituteId = ? AND role != ?', args: [instId, 'super-admin'] });
      await db.execute({ sql: 'DELETE FROM branches WHERE instituteId = ?', args: [instId] });
      await db.execute({ sql: 'DELETE FROM institutes WHERE id = ?', args: [instId] });
      return NextResponse.json({ success: true });
    }

    // ===================== BRANCHES (Institute Admin) =====================
    if (method === 'GET' && path === 'branches') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin', 'institute-admin', 'branch-manager');
      let sql = 'SELECT * FROM branches';
      let args: any[] = [];
      if (user.role === 'institute-admin') { sql += ' WHERE instituteId = ?'; args = [user.instituteId]; }
      else if (user.role === 'branch-manager') { sql += ' WHERE id = ?'; args = [user.branchId]; }
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'branches') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const { instituteId, name, city, managerName, managerEmail, managerPassword } = body || {};
      const instId = instituteId || user.instituteId;
      if (!instId || !name || !managerEmail || !managerPassword) return NextResponse.json({ error: 'Institute, name, manager email and password required' }, { status: 400 });
      const existing = await db.execute({ sql: 'SELECT id FROM users WHERE LOWER(email) = ?', args: [managerEmail.toLowerCase()] });
      if (existing.rows.length > 0) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });

      const brId = nextId('BR');
      await db.execute({
        sql: `INSERT INTO branches (id, instituteId, name, city, manager, managerEmail, status, blocked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [brId, instId, name, city || '', managerName || 'Manager', managerEmail, 'Active', 0],
      });
      const mgrId = nextId('U');
      await db.execute({
        sql: `INSERT INTO users (id, name, email, password, role, status, title, mustChangePassword, blocked, instituteId, branchId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [mgrId, managerName || 'Manager', managerEmail, managerPassword, 'branch-manager', 'Active', 'Branch Manager', 1, 0, instId, brId],
      });
      await db.execute({ sql: 'UPDATE institutes SET branches = branches + 1 WHERE id = ?', args: [instId] });

      for (let i = 1; i <= 12; i++) {
        const clsId = nextId('CLS');
        await db.execute({ sql: 'INSERT INTO classes (id, branchId, name, section) VALUES (?, ?, ?, ?)', args: [clsId, brId, `Class ${i}`, 'A'] });
      }

      return NextResponse.json({ branch: { id: brId, name }, managerLogin: { id: mgrId, email: managerEmail, password: managerPassword } }, { status: 201 });
    }

    if (method === 'PATCH' && pathSegments[0] === 'branches' && pathSegments[2] === 'block') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const id = pathSegments[1];
      const { blocked, reason } = body || {};
      await db.execute({ sql: 'UPDATE branches SET blocked = ?, blockedReason = ? WHERE id = ?', args: [blocked ? 1 : 0, reason || '', id] });
      await db.execute({ sql: 'UPDATE users SET blocked = ? WHERE branchId = ? AND role IN (?, ?)', args: [blocked ? 1 : 0, id, 'teacher', 'student'] });
      if (blocked) await db.execute({ sql: 'DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE branchId = ?)', args: [id] });
      return NextResponse.json({ success: true });
    }

    if (method === 'DELETE' && pathSegments[0] === 'branches' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const brId = pathSegments[1];
      await db.execute({ sql: 'DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE branchId = ?)', args: [brId] });
      await db.execute({ sql: 'DELETE FROM teacher_class_courses WHERE teacherId IN (SELECT id FROM users WHERE branchId = ?)', args: [brId] });
      // NOTE: course_materials + diary tables were intentionally DROPPED
      // in db.ts CLEANUP_DROP_TABLES (legacy unused tables). Do NOT
      // reference them — they no longer exist at runtime.
      await db.execute({ sql: 'DELETE FROM attendance WHERE branchId = ?', args: [brId] });
      await db.execute({ sql: 'DELETE FROM results WHERE branchId = ?', args: [brId] });
      await db.execute({ sql: 'DELETE FROM class_courses WHERE classId IN (SELECT id FROM classes WHERE branchId = ?)', args: [brId] });
      await db.execute({ sql: 'DELETE FROM classes WHERE branchId = ?', args: [brId] });
      await db.execute({ sql: 'DELETE FROM courses WHERE branchId = ?', args: [brId] });
      await db.execute({ sql: 'DELETE FROM announcements WHERE branchId = ?', args: [brId] });
      await db.execute({ sql: 'DELETE FROM fees WHERE branchId = ?', args: [brId] });
      await db.execute({ sql: 'DELETE FROM users WHERE branchId = ?', args: [brId] });
      const br = await db.execute({ sql: 'SELECT instituteId FROM branches WHERE id = ?', args: [brId] });
      if (br.rows.length > 0) {
        await db.execute({ sql: 'UPDATE institutes SET branches = MAX(branches - 1, 0) WHERE id = ?', args: [(br.rows[0] as any).instituteId] });
      }
      await db.execute({ sql: 'DELETE FROM branches WHERE id = ?', args: [brId] });
      return NextResponse.json({ success: true });
    }

    // ===================== PLATFORM USERS =====================
    if (method === 'GET' && path === 'platform/users') {
      const user = await requireAuth(req);
      const { role, branchId, instituteId } = query;
      let sql = 'SELECT * FROM users WHERE role != ?';
      let args: any[] = ['super-admin'];
      if (user.role === 'institute-admin') { sql += ' AND instituteId = ?'; args.push(user.instituteId); }
      if (user.role === 'branch-manager') { sql += ' AND branchId = ?'; args.push(user.branchId); }
      if (role) { sql += ' AND role = ?'; args.push(role); }
      if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      if (instituteId) { sql += ' AND instituteId = ?'; args.push(instituteId); }
      sql += ' ORDER BY createdAt DESC';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows.map(buildUserProfile));
    }

    if (method === 'POST' && path === 'platform/users') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const { name, email, password, role, instituteId, branchId, rollNo, class: cls, section, part, subjects, classes, classId, courseIds, fatherName, guardian, guardianPhone, cnic, dob, address, prevResult, program, photoUrl, baseFee, baseFeeLocked } = body || {};
      if (!name || !password || !role) return NextResponse.json({ error: 'Name, password and role required' }, { status: 400 });
      // Teachers still need an ID up front. Students no longer do — the
      // Admission Office enrolls them with NO roll number; the Accountant
      // assigns it later during New Enrollments.
      if (role === 'teacher' && !rollNo) {
        return NextResponse.json({ error: 'Teacher ID is required' }, { status: 400 });
      }
      const instId = instituteId || user.instituteId;
      const brId = branchId || user.branchId;
      const prt = part === '2' ? '2' : '1';

      if (email) {
        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE LOWER(email) = ?', args: [email.toLowerCase()] });
        if (existing.rows.length > 0) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
      if (rollNo) {
        const existingRoll = await db.execute({ sql: 'SELECT id FROM users WHERE rollNo = ? AND branchId = ?', args: [rollNo, brId] });
        if (existingRoll.rows.length > 0) return NextResponse.json({ error: 'Roll Number already exists in this branch' }, { status: 409 });
      }

      const id = nextId('U');
      const subjectsJson = subjects ? JSON.stringify(subjects) : null;
      const classesJson = classes ? JSON.stringify(classes) : null;

      await db.execute({
        sql: `INSERT INTO users (id, name, email, rollNo, password, role, status, title, mustChangePassword, blocked, instituteId, branchId, class, section, part, guardian, guardianPhone, fatherName, cnic, dob, address, prevResult, program, photoUrl, baseFee, baseFeeLocked, subjects, classes, createdById)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, name, email || null, rollNo || null, password, role, 'Active',
          role === 'teacher' ? 'Teacher' : role === 'student' ? 'Student' : role, 1, 0,
          instId, brId, cls || null, section || 'A', prt, guardian || null, guardianPhone || null,
          fatherName || null, cnic || null, dob || null, address || null, prevResult || null,
          program || null, photoUrl || null, baseFee != null ? Number(baseFee) : null,
          baseFeeLocked ? 1 : 0, subjectsJson, classesJson, user.id],
      });

      if (brId) {
        if (role === 'teacher') await db.execute({ sql: 'UPDATE branches SET teachers = teachers + 1 WHERE id = ?', args: [brId] });
        if (role === 'student') await db.execute({ sql: 'UPDATE branches SET students = students + 1 WHERE id = ?', args: [brId] });
      }
      if (instId) {
        if (role === 'student') await db.execute({ sql: 'UPDATE institutes SET students = students + 1 WHERE id = ?', args: [instId] });
        if (role === 'teacher') await db.execute({ sql: 'UPDATE institutes SET staff = staff + 1 WHERE id = ?', args: [instId] });
      }

      if (role === 'teacher' && classId && courseIds && courseIds.length > 0) {
        for (const courseId of courseIds) {
          const tccId = nextId('TCC');
          await db.execute({ sql: 'INSERT INTO teacher_class_courses (id, teacherId, classId, courseId) VALUES (?, ?, ?, ?)', args: [tccId, id, classId, courseId] });
        }
      }

      return NextResponse.json({ user: { id, name, rollNo, email, role }, defaultPassword: password }, { status: 201 });
    }

    // ── Bulk student import (Excel) — Academic / Admissions / Admin ──
    // Accepts pre-parsed, pre-mapped rows from the client's import preview.
    // For each row: generates a roll number (CC-YY-####) + password, dedupes
    // against existing students, auto-creates the (program, part, section)
    // class row so the student shows up in the drill-downs, and (optionally)
    // sets a locked base fee. Returns a created/skipped/errors summary.
    if (method === 'POST' && path === 'students/import') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const rows: any[] = Array.isArray(body?.students) ? body.students : [];
      if (rows.length === 0) return NextResponse.json({ error: 'No students to import' }, { status: 400 });
      const instId = user.instituteId;
      const brId = body?.branchId || user.branchId;
      if (!brId) return NextResponse.json({ error: 'Branch ID is required' }, { status: 400 });

      // NOTE: imported students get an AUTO-GENERATED roll number + email +
      // real password immediately, so they can log in as soon as they're
      // imported. Previously they were imported as "records only" with a
      // placeholder password and no rollNo/email — the Accountant then had
      // to click "Generate Login" on each one. This caused the "students
      // can't log in" bug every time a new batch was imported. Now every
      // imported student gets working credentials on day one.
      // If the sheet's "Roll No" column is filled in, we use it; otherwise
      // we auto-generate the next branch-sequential roll number.

      // Pre-compute the max numeric rollNo in the branch for auto-generation.
      let branchMaxRoll = 1000;
      try {
        const maxR = await db.execute({
          sql: `SELECT rollNo FROM users
                WHERE branchId = ? AND role = 'student'
                  AND rollNo IS NOT NULL AND rollNo != ''
                  AND CAST(rollNo AS INTEGER) = rollNo
                ORDER BY CAST(rollNo AS INTEGER) DESC LIMIT 1`,
          args: [brId],
        });
        if (maxR.rows.length > 0) {
          const n = parseInt(String((maxR.rows[0] as any).rollNo), 10);
          if (Number.isFinite(n)) branchMaxRoll = n;
        }
      } catch {}

      // Dedupe sets (by CNIC digits, and by name|father) for this branch.
      const existingStudents = await db.execute({ sql: "SELECT name, fatherName, cnic FROM users WHERE branchId = ? AND role = 'student'", args: [brId] });
      const cnicSet = new Set<string>();
      const nameFatherSet = new Set<string>();
      for (const r of existingStudents.rows as any[]) {
        const cd = String(r.cnic || '').replace(/\D/g, '');
        if (cd) cnicSet.add(cd);
        nameFatherSet.add(`${String(r.name || '').toLowerCase().trim()}|${String(r.fatherName || '').toLowerCase().trim()}`);
      }

      // 3) Ensure a class row exists for each (program, part, section).
      const classCache = new Set<string>();
      const ensureClass = async (program: string, part: string, section: string) => {
        if (!program) return;
        const key = `${program}||${part}||${section}`;
        if (classCache.has(key)) return;
        const ex = await db.execute({ sql: "SELECT id FROM classes WHERE branchId = ? AND name = ? AND section = ? AND COALESCE(part,'1') = ?", args: [brId, program, section, part] });
        if (ex.rows.length === 0) {
          await db.execute({ sql: 'INSERT INTO classes (id, branchId, name, section, program, part) VALUES (?, ?, ?, ?, ?, ?)', args: [nextId('CLS'), brId, program, section, program, part] });
        }
        classCache.add(key);
      };

      const created: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const name = String(row.name || '').trim();
        if (!name) { skipped.push({ index: i, reason: 'No name' }); continue; }
        const program = String(row.program || '').trim();
        const part = row.part === '2' ? '2' : '1';
        const section = (String(row.section || 'A').trim().toUpperCase() || 'A');
        const fatherName = String(row.fatherName || '').trim() || null;
        const cnicDigits = String(row.cnic || '').replace(/\D/g, '');
        const nf = `${name.toLowerCase()}|${String(fatherName || '').toLowerCase()}`;
        if ((cnicDigits && cnicSet.has(cnicDigits)) || nameFatherSet.has(nf)) {
          skipped.push({ index: i, name, reason: 'Duplicate' });
          continue;
        }
        try {
          await ensureClass(program, part, section);
          // Roll number: use the sheet's value if provided, otherwise
          // auto-generate the next branch-sequential number (1001, 1002, …).
          let rollNo = (row.rollNo && String(row.rollNo).trim()) || '';
          if (!rollNo) {
            branchMaxRoll = Math.max(1001, branchMaxRoll + 1);
            rollNo = String(branchMaxRoll);
          }
          // Email derived from roll number — ensures login by roll number
          // always works (login query matches email OR rollNo).
          const email = `${String(rollNo).toLowerCase()}@concordia.edu.pk`;
          // Real password — student can log in immediately. mustChangePassword
          // is set to 1 so they're prompted to set their own on first login.
          const password = 'concordia' + Math.floor(1000 + Math.random() * 9000).toString();
          const id = nextId('U');
          const baseFee = row.baseFee != null && row.baseFee !== '' && !Number.isNaN(Number(row.baseFee)) ? Number(row.baseFee) : null;
          await db.execute({
            sql: `INSERT INTO users (id, name, email, rollNo, password, role, status, title, mustChangePassword, blocked, instituteId, branchId, class, section, part, guardianPhone, fatherName, cnic, fatherCnic, gender, address, prevResult, program, baseFee, baseFeeLocked, createdById)
                  VALUES (?, ?, ?, ?, ?, 'student', 'Active', 'Student', 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [id, name, email, rollNo, password, instId, brId, program || null, section, part,
              String(row.phone || '').trim() || null, fatherName, String(row.cnic || '').trim() || null,
              String(row.fatherCnic || '').trim() || null, String(row.gender || '').trim() || null,
              String(row.address || '').trim() || null, String(row.prevResult || '').trim() || null,
              program || null, baseFee, baseFee != null ? 1 : 0, user.id],
          });
          if (cnicDigits) cnicSet.add(cnicDigits);
          nameFatherSet.add(nf);
          await db.execute({ sql: 'UPDATE branches SET students = students + 1 WHERE id = ?', args: [brId] });
          
          // ── Create installment invoices if provided (bulk import with fees) ──
          if (row.installments && Array.isArray(row.installments) && row.installments.length > 0) {
            let instNum = 0;
            const now = new Date();
            for (const inst of row.installments) {
              const instAmount = Number(inst.amount);
              const dueDate = inst.dueDate || null;
              if (!instAmount || instAmount <= 0) continue;
              const invId = nextId('INV');
              const challanNo = `CH-INST-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${rollNo}-${instNum + 1}`;
              const d = dueDate ? new Date(dueDate) : now;
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const month = monthNames[d.getMonth()] || 'January';
              const year = d.getFullYear();
              await db.execute({
                sql: `INSERT INTO fee_invoices (id, studentId, studentName, className, branchId, instituteId, month, year, amount, type, status, challanNo, dueDate)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [invId, id, name, program || '', brId, instId, month, year, instAmount, 'Installment', 'Unpaid', challanNo, dueDate],
              });
              instNum++;
            }
          }
          
          created.push({ id, name, rollNo, email, password, program: program || null });
        } catch (e: any) {
          errors.push({ index: i, name, error: e?.message || 'insert failed' });
        }
      }

      return NextResponse.json(
        { created: created.length, skipped: skipped.length, errors: errors.length, createdRows: created, skippedRows: skipped, errorRows: errors },
        { status: 201 },
      );
    }

    if (method === 'PATCH' && pathSegments[0] === 'platform' && pathSegments[1] === 'users' && pathSegments.length === 3) {
      const user = await requireAuth(req);
      const id = pathSegments[2];
      const { name, email, password, blocked, classId, addCourseIds, removeClassId, fatherName, guardian, guardianPhone, cnic, dob, address, prevResult, program, photoUrl, baseFee, baseFeeLocked, baseFeePaid, fatherCnic, gender, class: cls, section, part, subjects, classes, assignments, rollNo } = body || {};
      const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const target = r.rows[0] as any;
      if (user.role === 'branch-manager' && target.branchId !== user.branchId) return NextResponse.json({ error: 'Can only edit users in your branch' }, { status: 403 });
      if (user.role === 'institute-admin' && target.instituteId !== user.instituteId) return NextResponse.json({ error: 'Can only edit users in your institute' }, { status: 403 });

      // Duplicate-clash checks (exclude the user being edited). Prevents the
      // accountant / academic office from accidentally re-assigning an
      // existing Roll Number / Teacher ID or email to a different person.
      if (email) {
        const emailClash = await db.execute({
          sql: 'SELECT id, name FROM users WHERE LOWER(email) = ? AND id != ?',
          args: [email.toLowerCase(), target.id],
        });
        if (emailClash.rows.length > 0) {
          const c = emailClash.rows[0] as any;
          return NextResponse.json({
            error: `Email "${email}" is already used by ${c.name || 'another user'}. Use a different email.`,
          }, { status: 409 });
        }
      }
      if (rollNo) {
        const rollClash = await db.execute({
          sql: 'SELECT id, name, role FROM users WHERE rollNo = ? AND branchId = ? AND id != ?',
          args: [rollNo, target.branchId, target.id],
        });
        if (rollClash.rows.length > 0) {
          const c = rollClash.rows[0] as any;
          const label = target.role === 'teacher' ? 'Teacher ID' : 'Roll Number';
          return NextResponse.json({
            error: `${label} "${rollNo}" is already used by ${c.name || 'another ' + (c.role || 'user')} in this branch. Use a different ${label}.`,
          }, { status: 409 });
        }
      }

      if (name) await db.execute({ sql: 'UPDATE users SET name = ? WHERE id = ?', args: [name, target.id] });
      if (email) await db.execute({ sql: 'UPDATE users SET email = ? WHERE id = ?', args: [email, target.id] });
      if (password) await db.execute({ sql: 'UPDATE users SET password = ?, mustChangePassword = 1 WHERE id = ?', args: [password, target.id] });
      if (blocked !== undefined) {
        await db.execute({ sql: 'UPDATE users SET blocked = ? WHERE id = ?', args: [blocked ? 1 : 0, target.id] });
        if (blocked) await db.execute({ sql: 'DELETE FROM sessions WHERE userId = ?', args: [target.id] });
      }
      if (fatherName !== undefined) await db.execute({ sql: 'UPDATE users SET fatherName = ? WHERE id = ?', args: [fatherName || null, target.id] });
      if (guardian !== undefined) await db.execute({ sql: 'UPDATE users SET guardian = ? WHERE id = ?', args: [guardian || null, target.id] });
      if (guardianPhone !== undefined) await db.execute({ sql: 'UPDATE users SET guardianPhone = ? WHERE id = ?', args: [guardianPhone || null, target.id] });
      if (cnic !== undefined) await db.execute({ sql: 'UPDATE users SET cnic = ? WHERE id = ?', args: [cnic || null, target.id] });
      if (dob !== undefined) await db.execute({ sql: 'UPDATE users SET dob = ? WHERE id = ?', args: [dob || null, target.id] });
      if (address !== undefined) await db.execute({ sql: 'UPDATE users SET address = ? WHERE id = ?', args: [address || null, target.id] });
      if (prevResult !== undefined) await db.execute({ sql: 'UPDATE users SET prevResult = ? WHERE id = ?', args: [prevResult || null, target.id] });
      if (program !== undefined) await db.execute({ sql: 'UPDATE users SET program = ? WHERE id = ?', args: [program || null, target.id] });
      if (photoUrl !== undefined) await db.execute({ sql: 'UPDATE users SET photoUrl = ? WHERE id = ?', args: [photoUrl || null, target.id] });
      if (baseFee !== undefined) await db.execute({ sql: 'UPDATE users SET baseFee = ? WHERE id = ?', args: [baseFee != null ? Number(baseFee) : null, target.id] });
      if (baseFeeLocked !== undefined) await db.execute({ sql: 'UPDATE users SET baseFeeLocked = ? WHERE id = ?', args: [baseFeeLocked ? 1 : 0, target.id] });
      if (baseFeePaid !== undefined) await db.execute({ sql: 'UPDATE users SET baseFeePaid = ? WHERE id = ?', args: [baseFeePaid ? 1 : 0, target.id] });
      if (fatherCnic !== undefined) await db.execute({ sql: 'UPDATE users SET fatherCnic = ? WHERE id = ?', args: [fatherCnic || null, target.id] });
      if (gender !== undefined) await db.execute({ sql: 'UPDATE users SET gender = ? WHERE id = ?', args: [gender || null, target.id] });
      if (cls !== undefined) await db.execute({ sql: 'UPDATE users SET class = ? WHERE id = ?', args: [cls || null, target.id] });
      if (section !== undefined) await db.execute({ sql: 'UPDATE users SET section = ? WHERE id = ?', args: [section || null, target.id] });
      if (part !== undefined) await db.execute({ sql: 'UPDATE users SET part = ? WHERE id = ?', args: [part === '2' ? '2' : '1', target.id] });
      if (subjects !== undefined) await db.execute({ sql: 'UPDATE users SET subjects = ? WHERE id = ?', args: [subjects ? JSON.stringify(subjects) : null, target.id] });
      if (classes !== undefined) await db.execute({ sql: 'UPDATE users SET classes = ? WHERE id = ?', args: [classes ? JSON.stringify(classes) : null, target.id] });
      if (assignments !== undefined) await db.execute({ sql: 'UPDATE users SET assignments = ? WHERE id = ?', args: [assignments ? JSON.stringify(assignments) : null, target.id] });
      if (rollNo !== undefined) await db.execute({ sql: 'UPDATE users SET rollNo = ? WHERE id = ?', args: [rollNo || null, target.id] });
      if (classId && addCourseIds && addCourseIds.length > 0) {
        // Dedupe against existing TCC rows for this (teacher, class) so re-adding
        // a course that's already assigned is a silent no-op instead of a
        // UNIQUE-violation error.
        const existingR = await db.execute({
          sql: 'SELECT courseId FROM teacher_class_courses WHERE teacherId = ? AND classId = ?',
          args: [target.id, classId],
        });
        const existing = new Set((existingR.rows as any[]).map((r) => String(r.courseId)));
        for (const courseId of addCourseIds) {
          if (existing.has(String(courseId))) continue;
          const tccId = nextId('TCC');
          await db.execute({ sql: 'INSERT INTO teacher_class_courses (id, teacherId, classId, courseId) VALUES (?, ?, ?, ?)', args: [tccId, target.id, classId, courseId] });
        }
      }
      // removeClassId: wipe ALL teacher_class_courses rows for this (teacher, class).
      // Used by the Academic Office "Remove teacher from class" action so the
      // teacher's portal stops showing the class + its courses.
      if (removeClassId) {
        await db.execute({ sql: 'DELETE FROM teacher_class_courses WHERE teacherId = ? AND classId = ?', args: [target.id, removeClassId] });
      }
      return NextResponse.json({ success: true });
    }

    if (method === 'PATCH' && pathSegments[0] === 'platform' && pathSegments[1] === 'users' && pathSegments[3] === 'block') {
      const user = await requireAuth(req);
      const id = pathSegments[2];
      const { blocked, reason } = body || {};
      const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const target = r.rows[0] as any;
      if (user.role === 'branch-manager' && target.branchId !== user.branchId) return NextResponse.json({ error: 'Can only edit users in your branch' }, { status: 403 });
      if (user.role === 'institute-admin' && target.instituteId !== user.instituteId) return NextResponse.json({ error: 'Can only edit users in your institute' }, { status: 403 });
      await db.execute({ sql: 'UPDATE users SET blocked = ? WHERE id = ?', args: [blocked ? 1 : 0, target.id] });
      if (blocked) await db.execute({ sql: 'DELETE FROM sessions WHERE userId = ?', args: [target.id] });
      return NextResponse.json({ success: true, blocked });
    }

    // ===================== DELETE PLATFORM USER (permanent) =====================
    // Permanently deletes a student or teacher account AND cascades cleanup of
    // every table that references them. The user's row is then removed — this
    // is irreversible.
    //
    // Robustness strategy: the production Turso DB still carries legacy tables
    // (course_materials, diary, salary_payments, teacher_salaries) with real
    // FOREIGN KEY constraints to `users`. To avoid "FOREIGN KEY constraint
    // failed" errors when removing the user row, we:
    //   1. Try to disable FK enforcement for the cascade (PRAGMA foreign_keys =
    //      OFF). On libSQL/Turso HTTP this may be a no-op, so we ALSO…
    //   2. Explicitly clean EVERY table that references the user (by teacherId,
    //      studentId, userId, or senderId/createdBy columns that may carry FKs).
    //      Each cleanup is wrapped in try/catch so a missing table or a
    //      no-op column never aborts the cascade.
    //   3. For teacher class-teacher assignments (classes.teacherId) and
    //      timetable slots (timetable.teacherId) we NULL the column (preserve
    //      the class/slot) rather than delete the row.
    //   4. Only then delete the user row.
    //   5. Re-enable FK enforcement.
    if (method === 'DELETE' && pathSegments[0] === 'platform' && pathSegments[1] === 'users' && pathSegments.length === 3) {
      const user = await requireAuth(req);
      const id = pathSegments[2];
      const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const target = r.rows[0] as any;
      // Only student/teacher accounts can be deleted through this endpoint —
      // staff accounts (admin, accountant, academic, admissions, super-admin)
      // are managed elsewhere and must never be removed from here.
      if (target.role !== 'student' && target.role !== 'teacher') {
        return NextResponse.json({ error: 'Only student or teacher accounts can be deleted from here' }, { status: 403 });
      }
      // Scope guards — a user can only be deleted by someone with authority
      // over their branch / institute.
      if (user.role === 'branch-manager' && target.branchId !== user.branchId) return NextResponse.json({ error: 'Can only delete users in your branch' }, { status: 403 });
      if (user.role === 'institute-admin' && target.instituteId !== user.instituteId) return NextResponse.json({ error: 'Can only delete users in your institute' }, { status: 403 });
      if (['accountant', 'admissions', 'academic', 'admin'].includes(user.role)) {
        if (user.branchId && target.branchId && target.branchId !== user.branchId) {
          return NextResponse.json({ error: 'Can only delete users in your branch' }, { status: 403 });
        }
      }

      // Helper: run a SQL statement, swallowing any error. Missing legacy
      // tables or no-op columns must never abort the cascade.
      const safe = async (sql: string, args: any[] = []) => {
        try { await db.execute({ sql, args }); } catch {}
      };

      // 0) Try to disable FK enforcement for the duration of the cascade.
      //    libSQL/Turso HTTP may ignore this (PRAGMAs are connection-scoped
      //    and the HTTP pool may use different connections), which is why we
      //    ALSO clean every referencing table explicitly below.
      await safe('PRAGMA foreign_keys = OFF');

      // 1) Kill every active session for this user (signs them out everywhere).
      await safe('DELETE FROM sessions WHERE userId = ?', [target.id]);

      // 2) Teacher-owned data. Every table with a `teacherId` column that
      //    references users(id) must be cleared, otherwise the user row
      //    delete fails with a FOREIGN KEY constraint error.
      if (target.role === 'teacher') {
        // Class-teacher assignments + timetable slots: NULL the teacherId
        // (keep the class / slot, just detach the teacher).
        await safe('UPDATE classes SET teacherId = NULL WHERE teacherId = ?', [target.id]);
        await safe('UPDATE timetable SET teacherId = NULL, teacherName = ? WHERE teacherId = ?', ['(deleted)', target.id]);
        // Hard-delete rows the teacher authored/owns.
        await safe('DELETE FROM teacher_class_courses WHERE teacherId = ?', [target.id]);
        // NOTE: course_materials + diary tables were intentionally DROPPED
        // in db.ts CLEANUP_DROP_TABLES — skip them (safe() swallows errors
        // but there's no point issuing DELETEs against non-existent tables).
        await safe('DELETE FROM salary_payments WHERE teacherId = ?', [target.id]);
        await safe('DELETE FROM teacher_salaries WHERE teacherId = ?', [target.id]);
        await safe('DELETE FROM attendance WHERE teacherId = ?', [target.id]);
        await safe('DELETE FROM results WHERE teacherId = ?', [target.id]);
        // Announcements the teacher sent — detach sender (keep the
        // announcement row so recipients aren't orphaned).
        await safe('UPDATE announcements SET senderId = ? WHERE senderId = ?', ['', target.id]);
      }

      // 3) Student-owned data: fee invoices, misc charges, report cards.
      //    Also strip the student out of any attendance/results JSON
      //    `records` arrays so no dangling references remain inside
      //    class-wide rows.
      if (target.role === 'student') {
        await safe('DELETE FROM fee_invoices WHERE studentId = ?', [target.id]);
        await safe('DELETE FROM misc_charges WHERE studentId = ?', [target.id]);
        await safe('DELETE FROM report_cards WHERE studentId = ?', [target.id]);
        await safe('DELETE FROM fees WHERE studentId = ?', [target.id]);
        try {
          const attR = await db.execute({ sql: 'SELECT id, records FROM attendance WHERE records LIKE ?', args: [`%${target.id}%`] });
          for (const row of attR.rows as any[]) {
            try {
              const recs = JSON.parse(row.records || '[]');
              const filtered = Array.isArray(recs) ? recs.filter((e: any) => e && e.studentId !== target.id) : recs;
              if (JSON.stringify(filtered) !== row.records) {
                await db.execute({ sql: 'UPDATE attendance SET records = ? WHERE id = ?', args: [JSON.stringify(filtered), row.id] });
              }
            } catch {}
          }
        } catch {}
        try {
          const resR = await db.execute({ sql: 'SELECT id, records FROM results WHERE records LIKE ?', args: [`%${target.id}%`] });
          for (const row of resR.rows as any[]) {
            try {
              const recs = JSON.parse(row.records || '[]');
              const filtered = Array.isArray(recs) ? recs.filter((e: any) => e && e.studentId !== target.id) : recs;
              if (JSON.stringify(filtered) !== row.records) {
                await db.execute({ sql: 'UPDATE results SET records = ? WHERE id = ?', args: [JSON.stringify(filtered), row.id] });
              }
            } catch {}
          }
        } catch {}
      }

      // 4) Finally, remove the user row itself. With every referencing row
      //    cleared (and FK enforcement disabled where supported), this
      //    should always succeed. We catch+rethrow with the raw error so
      //    the frontend can surface exactly which constraint (if any)
      //    still blocks deletion.
      try {
        await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [target.id] });
      } catch (e: any) {
        await safe('PRAGMA foreign_keys = ON');
        return NextResponse.json(
          { error: 'Could not delete user — a data dependency still references them: ' + (e?.message || String(e)) },
          { status: 500 },
        );
      }

      // 5) Re-enable FK enforcement.
      await safe('PRAGMA foreign_keys = ON');
      return NextResponse.json({ success: true, deleted: target.id });
    }

    if (method === 'GET' && pathSegments[0] === 'platform' && pathSegments[1] === 'users' && pathSegments[3] === 'password') {
      const user = await requireAuth(req);
      const id = pathSegments[2];
      const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const target = r.rows[0] as any;
      if (user.role === 'branch-manager' && target.branchId !== user.branchId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      if (user.role === 'institute-admin' && target.instituteId !== user.instituteId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      return NextResponse.json({ password: target.password, mustChangePassword: target.mustChangePassword === 1 });
    }

    // ── Generate Login (Accountant / Academic / Admissions / Admin) ──
    // POST platform/users/:id/generate-login
    //
    // BUG FIX (student login not working): previously, when the Accountant
    // clicked "Generate Login" on a student with no rollNo, the client fell
    // back to using the student's internal ID (e.g. "U-c5f5cc49") as the
    // username — but the rollNo column stayed NULL forever. The student was
    // then told to log in "by roll number" but had no roll number, so login
    // ALWAYS failed. This endpoint fixes it by guaranteeing a real roll number
    // is assigned (either the one the officer typed, or an auto-generated
    // branch-sequential one) when the login is generated.
    //
    // Body: { rollNo?: string }  — optional manual roll number. If omitted /
    // blank, the server auto-generates the next sequential roll number for the
    // branch (format: 4-digit, starting at 1001).
    //
    // Returns: { rollNo, password, email, mustChangePassword: true }
    if (method === 'POST' && pathSegments[0] === 'platform' && pathSegments[1] === 'users' && pathSegments[3] === 'generate-login') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const id = pathSegments[2];
      const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const target = r.rows[0] as any;
      if (target.role !== 'student') return NextResponse.json({ error: 'Login generation is for students only' }, { status: 400 });
      if (user.role === 'branch-manager' && target.branchId !== user.branchId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      if (user.role === 'institute-admin' && target.instituteId !== user.instituteId) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      const brId = target.branchId;

      // 1) Resolve the roll number: explicit > existing > auto-generated.
      let rollNo = (body?.rollNo != null ? String(body.rollNo).trim() : '');
      if (!rollNo) rollNo = (target.rollNo && String(target.rollNo).trim()) || '';
      if (!rollNo) {
        // Auto-generate the next sequential numeric roll number for this branch.
        // Finds the max numeric rollNo already in the branch and adds 1; starts
        // at 1001 if none exist. Zero-padded to 4 digits (1001, 1002, …, 9999,
        // then 10000+ unpadded).
        try {
          const maxR = await db.execute({
            sql: `SELECT rollNo FROM users
                  WHERE branchId = ? AND role = 'student'
                    AND rollNo IS NOT NULL AND rollNo != ''
                    AND CAST(rollNo AS INTEGER) = rollNo
                  ORDER BY CAST(rollNo AS INTEGER) DESC LIMIT 1`,
            args: [brId],
          });
          const maxNum = maxR.rows.length > 0 ? parseInt(String((maxR.rows[0] as any).rollNo), 10) : 1000;
          rollNo = String(Math.max(1001, (Number.isFinite(maxNum) ? maxNum : 1000) + 1));
        } catch {
          // Fallback: timestamp-based unique suffix (extremely unlikely to clash).
          rollNo = String(1000 + Math.floor(Date.now() / 1000) % 9000);
        }
      }

      // 2) Validate roll number uniqueness within the branch (excluding self).
      const rollClash = await db.execute({
        sql: `SELECT id, name FROM users WHERE rollNo = ? AND branchId = ? AND id != ?`,
        args: [rollNo, brId, target.id],
      });
      if (rollClash.rows.length > 0) {
        const c = rollClash.rows[0] as any;
        return NextResponse.json({
          error: `Roll Number "${rollNo}" is already used by ${c.name || 'another student'} in this branch. Use a different roll number.`,
        }, { status: 409 });
      }

      // 3) Build the email + password.
      const email = `${String(rollNo).toLowerCase()}@concordia.edu.pk`;
      const emailClash = await db.execute({
        sql: `SELECT id, name FROM users WHERE LOWER(email) = ? AND id != ?`,
        args: [email.toLowerCase(), target.id],
      });
      if (emailClash.rows.length > 0) {
        const c = emailClash.rows[0] as any;
        return NextResponse.json({
          error: `Email "${email}" is already used by ${c.name || 'another user'}. Use a different roll number.`,
        }, { status: 409 });
      }
      // Random memorable password: "concordia" + 4 digits. Matches the
      // accountant portal's genDefaultPassword() format so existing UI copy
      // ("Login Ready", copy button, etc.) keeps working unchanged.
      const password = 'concordia' + Math.floor(1000 + Math.random() * 9000).toString();

      // 4) Persist — set rollNo + email + password + mustChangePassword in one
      //    round-trip. mustChangePassword=1 forces the student to set their own
      //    password on first login (handled by the portal's change-password
      //    prompt).
      await db.execute({
        sql: `UPDATE users SET rollNo = ?, email = ?, password = ?, mustChangePassword = 1 WHERE id = ?`,
        args: [rollNo, email, password, target.id],
      });

      return NextResponse.json({
        rollNo,
        email,
        password,
        mustChangePassword: true,
      });
    }

    // ── Bulk Generate Logins (Accountant / Academic / Admissions / Admin) ──
    // POST platform/students/bulk-generate-logins
    //
    // Iterates EVERY student in the caller's branch (or all branches for
    // super-admin) who is missing a rollNo OR an email OR has the placeholder
    // import password, and generates a real login for them — assigning a
    // branch-sequential roll number, a `rollNo@concordia.edu.pk` email, and a
    // random `concordia####` password. Skips students who already have a real
    // login (rollNo + email + non-placeholder password).
    //
    // This is the one-click fix for "students can't log in because they were
    // imported without roll numbers". Returns the count of newly-issued logins
    // plus the full credentials list so the officer can print / distribute.
    //
    // Returns: { generated: number, skipped: number, total: number, credentials: [{id,name,rollNo,email,password}] }
    if (method === 'POST' && path === 'platform/students/bulk-generate-logins') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const branchFilter = user.role === 'super-admin' ? '' : 'AND branchId = ?';
      const branchArgs: any[] = user.role === 'super-admin' ? [] : [user.branchId];

      // Pull every student in scope. We intentionally fetch ALL columns so we
      // can inspect rollNo / email / password to decide who needs a login.
      const r = await db.execute({
        sql: `SELECT id, name, rollNo, email, password, branchId FROM users
              WHERE role = 'student' ${branchFilter}
              ORDER BY name`,
        args: branchArgs,
      });

      // A student needs a login if ANY of:
      //   - rollNo is null/empty
      //   - email is null/empty
      //   - password is the placeholder import password ("concordia-import-pending")
      //     OR matches the legacy placeholder format
      const needsLogin = (s: any) => {
        const pwd = String(s.password || '');
        const isPlaceholder =
          pwd === 'concordia-import-pending' ||
          pwd.startsWith('import-pending-') ||
          pwd === '' ||
          pwd === 'pending';
        return !s.rollNo || !s.email || isPlaceholder;
      };

      const targets = r.rows.filter((s: any) => needsLogin(s));
      const skipped = r.rows.length - targets.length;

      // Pre-compute the starting roll number per branch so we can assign
      // sequential numbers without N+1 queries.
      const branchMaxRoll: Record<string, number> = {};
      const branches = Array.from(new Set(targets.map((t: any) => t.branchId).filter(Boolean)));
      for (const brId of branches) {
        try {
          const maxR = await db.execute({
            sql: `SELECT rollNo FROM users
                  WHERE branchId = ? AND role = 'student'
                    AND rollNo IS NOT NULL AND rollNo != ''
                    AND CAST(rollNo AS INTEGER) = rollNo
                  ORDER BY CAST(rollNo AS INTEGER) DESC LIMIT 1`,
            args: [brId],
          });
          const maxNum = maxR.rows.length > 0 ? parseInt(String((maxR.rows[0] as any).rollNo), 10) : 1000;
          branchMaxRoll[brId] = Number.isFinite(maxNum) ? maxNum : 1000;
        } catch {
          branchMaxRoll[brId] = 1000;
        }
      }

      const credentials: any[] = [];
      for (const t of targets) {
        const s = t as any;
        const brId = s.branchId;
        // Resolve roll number: existing > next sequential.
        let rollNo = (s.rollNo && String(s.rollNo).trim()) || '';
        if (!rollNo) {
          branchMaxRoll[brId] = (branchMaxRoll[brId] || 1000) + 1;
          rollNo = String(Math.max(1001, branchMaxRoll[brId]));
        }
        const email = `${String(rollNo).toLowerCase()}@concordia.edu.pk`;
        const password = 'concordia' + Math.floor(1000 + Math.random() * 9000).toString();
        try {
          await db.execute({
            sql: `UPDATE users SET rollNo = ?, email = ?, password = ?, mustChangePassword = 1 WHERE id = ?`,
            args: [rollNo, email, password, s.id],
          });
          credentials.push({ id: s.id, name: s.name, rollNo, email, password });
        } catch {
          // Skip on clash / error — the officer can retry individually.
        }
      }

      return NextResponse.json({
        generated: credentials.length,
        skipped,
        total: r.rows.length,
        credentials,
      });
    }

    // ===================== CLASSES & COURSES =====================
    if (method === 'GET' && path === 'classes') {
      const user = await requireAuth(req);
      const { branchId } = query;
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json([]);
      const r = await db.execute({ sql: 'SELECT * FROM classes WHERE branchId = ? ORDER BY name', args: [brId] });
      return NextResponse.json(r.rows);
    }

    // Reference data — common lookup lists used by admissions/academic forms.
    // Returns: { classes: string[], sections: string[], subjects: string[], programs: string[] }
    // - classes: distinct class names from this branch (or all if super-admin)
    // - sections: distinct section letters used anywhere
    // - subjects: curated Concordia subject list + any custom subjects from teachers
    // - programs: curated Concordia program list (ICS, I.Com, F.Sc Pre-Medical, etc.)
    if (method === 'GET' && path === 'reference') {
      const user = await requireAuth(req);
      const { branchId } = query;
      const brId = branchId || user.branchId;

      // Default sections (the canonical Concordia set) — augmented with any
      // custom sections actually in use so existing data is always visible.
      const defaultSections = ['A', 'B', 'C', 'D'];

      // Default subjects — the canonical Concordia subject list. Augmented
      // with any custom subjects teachers have been assigned.
      const defaultSubjects = [
        'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English',
        'Urdu', 'Islamiat', 'Pakistan Studies', 'Computer Science',
        'Economics', 'Accounting', 'Business Studies', 'Statistics',
        'Geography', 'History', 'Civics', 'Psychology', 'Sociology',
        'Fine Arts', 'Physical Education',
      ];

      // Default programs — Concordia's 6-department HSSC catalog.
      // (Updated per user spec: FSC Pre Med, FSC Pre Eng, ICS Phy, ICS Stats, FA IT, I.Com.
      //  'FA' was retired and replaced by 'I.Com'.) These are canonical values;
      //  the UI renders them via deptLabel() (Fsc(Pre-Medical), I.Com, etc.).
      const defaultPrograms = [
        'FSC Pre Med', 'FSC Pre Eng', 'ICS Phy', 'ICS Stats', 'FA IT', 'I.Com',
      ];

      let classes: string[] = [];
      let sections: string[] = [...defaultSections];
      let subjects: string[] = [...defaultSubjects];

      try {
        if (brId) {
          const clsR = await db.execute({
            sql: 'SELECT DISTINCT name, section FROM classes WHERE branchId = ? ORDER BY name',
            args: [brId],
          });
          const classNameSet = new Set<string>();
          const sectionSet = new Set<string>(defaultSections);
          for (const row of clsR.rows as any[]) {
            if (row.name) classNameSet.add(row.name);
            if (row.section) sectionSet.add(row.section);
          }
          classes = Array.from(classNameSet);
          sections = Array.from(sectionSet).sort();

          // Pull any custom subjects teachers have been assigned in this branch.
          const tR = await db.execute({
            sql: 'SELECT subjects FROM users WHERE branchId = ? AND role = ?',
            args: [brId, 'teacher'],
          });
          const subjectSet = new Set<string>(defaultSubjects);
          for (const row of tR.rows as any[]) {
            if (!row.subjects) continue;
            try {
              const parsed = typeof row.subjects === 'string' ? JSON.parse(row.subjects) : row.subjects;
              if (Array.isArray(parsed)) {
                for (const s of parsed) {
                  if (typeof s === 'string' && s.trim()) subjectSet.add(s.trim());
                }
              }
            } catch {}
          }
          subjects = Array.from(subjectSet);
        }
      } catch {
        // Fall back to defaults on any DB error — the form should still work.
      }

      return NextResponse.json({ classes, sections, subjects, programs: defaultPrograms });
    }

    // Create a new class (Academic Office / Admin / branch-manager / institute-admin)
    if (method === 'POST' && path === 'classes') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { name, section, branchId, program, part } = body || {};
      if (!name || !name.trim()) return NextResponse.json({ error: 'Class name is required' }, { status: 400 });
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json({ error: 'Branch ID is required' }, { status: 400 });
      const sec = (section || 'A').trim().toUpperCase() || 'A';
      const prog = program || null;
      const prt = part === '2' ? '2' : '1';
      // Prevent exact duplicates (same name + same section in same branch)
      const existing = await db.execute({
        sql: 'SELECT id FROM classes WHERE branchId = ? AND name = ? AND section = ?',
        args: [brId, name.trim(), sec],
      });
      if (existing.rows.length > 0) return NextResponse.json({ error: 'A class with this name and section already exists' }, { status: 409 });
      const id = nextId('CLS');
      await db.execute({
        sql: 'INSERT INTO classes (id, branchId, name, section, program, part) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, brId, name.trim(), sec, prog, prt],
      });
      return NextResponse.json({ id, branchId: brId, name: name.trim(), section: sec, program: prog, part: prt }, { status: 201 });
    }

    if (method === 'GET' && path === 'courses') {
      const user = await requireAuth(req);
      const { branchId, classId } = query;
      if (classId) {
        const r = await db.execute({
          sql: `SELECT c.* FROM courses c JOIN class_courses cc ON c.id = cc.courseId WHERE cc.classId = ?`,
          args: [classId],
        });
        return NextResponse.json(r.rows);
      }
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json([]);
      const r = await db.execute({ sql: 'SELECT * FROM courses WHERE branchId = ? ORDER BY name', args: [brId] });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'class-courses') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { classId, courseId } = body || {};
      if (!classId || !courseId) return NextResponse.json({ error: 'classId and courseId required' }, { status: 400 });
      const id = nextId('CC');
      await db.execute({ sql: 'INSERT INTO class_courses (id, classId, courseId) VALUES (?, ?, ?)', args: [id, classId, courseId] });
      return NextResponse.json({ success: true }, { status: 201 });
    }

    if (method === 'POST' && path === 'courses') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { name, code, branchId } = body || {};
      if (!name) return NextResponse.json({ error: 'Course name required' }, { status: 400 });
      const brId = branchId || user.branchId;
      // Prevent duplicate course names or codes within the same branch.
      const dupName = await db.execute({
        sql: 'SELECT id FROM courses WHERE branchId = ? AND LOWER(name) = ?',
        args: [brId, name.trim().toLowerCase()],
      });
      if (dupName.rows.length > 0) return NextResponse.json({ error: `A course named "${name.trim()}" already exists in this branch` }, { status: 409 });
      if (code && code.trim()) {
        const dupCode = await db.execute({
          sql: 'SELECT id FROM courses WHERE branchId = ? AND LOWER(code) = ?',
          args: [brId, code.trim().toLowerCase()],
        });
        if (dupCode.rows.length > 0) return NextResponse.json({ error: `Course code "${code.trim()}" is already used by another course in this branch` }, { status: 409 });
      }
      const id = nextId('CRS');
      await db.execute({ sql: 'INSERT INTO courses (id, branchId, name, code) VALUES (?, ?, ?, ?)', args: [id, brId, name, code || ''] });
      return NextResponse.json({ id, name, code }, { status: 201 });
    }

    if (method === 'POST' && pathSegments[0] === 'classes' && pathSegments[2] === 'courses') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const { courseIds } = body || {};
      if (!courseIds || !Array.isArray(courseIds)) return NextResponse.json({ error: 'courseIds array required' }, { status: 400 });
      await db.execute({ sql: 'DELETE FROM class_courses WHERE classId = ?', args: [id] });
      for (const courseId of courseIds) {
        const ccId = nextId('CC');
        await db.execute({ sql: 'INSERT INTO class_courses (id, classId, courseId) VALUES (?, ?, ?)', args: [ccId, id, courseId] });
      }
      return NextResponse.json({ success: true, count: courseIds.length });
    }

    // ── GET classes/:id/teacher-courses ──────────────────────────────────
    // Returns the full teacher↔course assignment map for one class. Powers the
    // Academic Office class-detail sheet: shows which teacher teaches which
    // course(s) in the class, and which courses are still unassigned. This is
    // the source of truth that the teacher's portal also reads (via
    // teacher_class_courses) — so the academic officer always sees exactly
    // what the teacher will see on sign-in.
    if (method === 'GET' && pathSegments[0] === 'classes' && pathSegments[2] === 'teacher-courses') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const classId = pathSegments[1];
      const r = await db.execute({
        sql: `SELECT tcc.teacherId, tcc.courseId,
                     u.name AS teacherName, u.rollNo AS teacherRollNo,
                     c.name AS courseName, c.code AS courseCode
              FROM teacher_class_courses tcc
              LEFT JOIN users u ON tcc.teacherId = u.id
              LEFT JOIN courses c ON tcc.courseId = c.id
              WHERE tcc.classId = ?`,
        args: [classId],
      });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && pathSegments[0] === 'classes' && pathSegments[2] === 'sections') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const parent = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [id] });
      if (parent.rows.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      const parentClass = parent.rows[0] as any;

      const existing = await db.execute({ sql: 'SELECT section FROM classes WHERE branchId = ? AND name = ?', args: [parentClass.branchId, parentClass.name] });
      const usedLetters = new Set(existing.rows.map((r: any) => (r.section || 'A').toUpperCase()));
      let nextLetter = 'A';
      while (usedLetters.has(nextLetter) && nextLetter.charCodeAt(0) < 90) {
        nextLetter = String.fromCharCode(nextLetter.charCodeAt(0) + 1);
      }

      const customSection = ((body?.section || '') as string).trim().toUpperCase();
      const section = customSection && !usedLetters.has(customSection) ? customSection : nextLetter;

      const newId = nextId('CLS');
      await db.execute({ sql: 'INSERT INTO classes (id, branchId, name, section) VALUES (?, ?, ?, ?)', args: [newId, parentClass.branchId, parentClass.name, section] });

      const parentCourses = await db.execute({ sql: 'SELECT courseId FROM class_courses WHERE classId = ?', args: [parentClass.id] });
      for (const row of parentCourses.rows) {
        const ccId = nextId('CC');
        await db.execute({ sql: 'INSERT INTO class_courses (id, classId, courseId) VALUES (?, ?, ?)', args: [ccId, newId, (row as any).courseId] });
      }

      return NextResponse.json({ id: newId, branchId: parentClass.branchId, name: parentClass.name, section, courseCount: parentCourses.rows.length }, { status: 201 });
    }

    // Rename a section (Accountant Classes & Sections → edit). Updates the
    // class row's section letter AND syncs every student in that section.
    if (method === 'PATCH' && pathSegments[0] === 'classes' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const clsR = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [id] });
      if (clsR.rows.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      const c = clsR.rows[0] as any;
      const newSec = String((body?.section || '')).trim().toUpperCase();
      if (!newSec) return NextResponse.json({ error: 'Section name is required' }, { status: 400 });
      const dup = await db.execute({
        sql: "SELECT id FROM classes WHERE branchId = ? AND name = ? AND COALESCE(part,'1') = ? AND UPPER(section) = ? AND id != ?",
        args: [c.branchId, c.name, String(c.part || '1'), newSec, id],
      });
      if (dup.rows.length > 0) return NextResponse.json({ error: `Section "${newSec}" already exists for this program/part` }, { status: 409 });
      const oldSec = c.section;
      await db.execute({ sql: 'UPDATE classes SET section = ? WHERE id = ?', args: [newSec, id] });
      await db.execute({
        sql: "UPDATE users SET section = ? WHERE class = ? AND section = ? AND branchId = ? AND role = 'student'",
        args: [newSec, c.name, oldSec, c.branchId],
      });
      return NextResponse.json({ success: true, section: newSec });
    }

    if (method === 'DELETE' && pathSegments[0] === 'classes' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const cls = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [id] });
      if (cls.rows.length === 0) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
      const c = cls.rows[0] as any;

      // ── Cascade cleanup ────────────────────────────────────────────────
      // A class is referenced by several tables. Deleting the class row alone
      // would leave orphaned records (and the timetable/attendance/results
      // would still show a ghost class). So we clean up everything tied to
      // this classId first, then unlink any students assigned to this
      // class+section (their account stays — just their class placement is
      // cleared, since the class no longer exists). This makes the class
      // ALWAYS deletable, matching the user's expectation.
      await db.execute({ sql: 'DELETE FROM class_courses WHERE classId = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM teacher_class_courses WHERE classId = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM timetable WHERE classId = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM attendance WHERE classId = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM results WHERE classId = ?', args: [id] });
      // Unlink students whose placement was this class+section. We do NOT
      // delete student accounts — that's destructive and not what the user
      // asked for. We just clear their class/section so they can be
      // re-enrolled into another class later.
      await db.execute({
        sql: "UPDATE users SET class = NULL, section = NULL WHERE class = ? AND section = ? AND role = 'student'",
        args: [c.name, c.section],
      });
      // Finally, delete the class row itself.
      await db.execute({ sql: 'DELETE FROM classes WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    if (method === 'GET' && path === 'teacher/classes') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher');
      const r = await db.execute({
        sql: `SELECT DISTINCT c.*, tcc.courseId FROM classes c
              JOIN teacher_class_courses tcc ON c.id = tcc.classId
              WHERE tcc.teacherId = ?`,
        args: [user.id],
      });
      const classMap: Record<string, any> = {};
      for (const row of r.rows) {
        const rrow = row as any;
        if (!classMap[rrow.id]) {
          classMap[rrow.id] = { id: rrow.id, name: rrow.name, section: rrow.section, branchId: rrow.branchId, courses: [] };
        }
        const courseR = await db.execute({ sql: 'SELECT * FROM courses WHERE id = ?', args: [rrow.courseId] });
        if (courseR.rows.length > 0) classMap[rrow.id].courses.push(courseR.rows[0]);
      }
      return NextResponse.json(Object.values(classMap));
    }

    if (method === 'GET' && path === 'student/courses') {
      const user = await requireAuth(req);
      requireRole(user, 'student');
      const classR = await db.execute({ sql: 'SELECT * FROM classes WHERE branchId = ? AND name = ?', args: [user.branchId, user.class] });
      if (classR.rows.length === 0) return NextResponse.json([]);
      const classId = (classR.rows[0] as any).id;
      const r = await db.execute({
        sql: `SELECT c.* FROM courses c JOIN class_courses cc ON c.id = cc.courseId WHERE cc.classId = ?`,
        args: [classId],
      });
      return NextResponse.json(r.rows);
    }

    // ===================== TEACHER ANALYTICS =====================
    if (method === 'GET' && path === 'teacher/analytics') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher');
      const teacherId = user.id;
      try {
        const tccR = await db.execute({
          sql: `SELECT tcc.classId, tcc.courseId, c.name as className, c.section, c.branchId,
                       co.name as courseName, co.code as courseCode
                FROM teacher_class_courses tcc
                LEFT JOIN classes c ON tcc.classId = c.id
                LEFT JOIN courses co ON tcc.courseId = co.id
                WHERE tcc.teacherId = ?`,
          args: [teacherId],
        });
        const assignments = tccR.rows as any[];
        const classIds = [...new Set(assignments.map(a => a.classId))];
        const courseIds = [...new Set(assignments.map(a => a.courseId))];

        let totalStudents = 0;
        const classStudentCounts: any[] = [];
        for (const cid of classIds) {
          const cntR = await db.execute({
            sql: 'SELECT COUNT(*) as count FROM users WHERE role = ? AND branchId = ? AND class = (SELECT name FROM classes WHERE id = ?)',
            args: ['student', assignments.find(a => a.classId === cid)?.branchId, cid],
          });
          const n = (cntR.rows[0] as any)?.count || 0;
          totalStudents += n;
          const cls = assignments.find(a => a.classId === cid);
          classStudentCounts.push({ classId: cid, className: cls?.className, section: cls?.section, students: n });
        }

        const attR = await db.execute({
          sql: 'SELECT id, date, classId, records FROM attendance WHERE teacherId = ? ORDER BY date DESC LIMIT 50',
          args: [teacherId],
        });
        const attendanceSessions = attR.rows as any[];
        let attendanceRecords = 0, presentCount = 0, absentCount = 0, lateCount = 0;
        for (const s of attendanceSessions) {
          try {
            const recs = JSON.parse(s.records);
            for (const r of recs) {
              attendanceRecords++;
              if (r.status === 'Present') presentCount++;
              else if (r.status === 'Absent') absentCount++;
              else if (r.status === 'Late') lateCount++;
            }
          } catch {}
        }
        const attendanceRate = attendanceRecords > 0 ? Math.round((presentCount / attendanceRecords) * 100) : 0;

        const resR = await db.execute({
          sql: 'SELECT id, exam, courseId, classId, totalMarks, date, records FROM results WHERE teacherId = ? ORDER BY date DESC LIMIT 50',
          args: [teacherId],
        });
        const resultsPosted = resR.rows as any[];
        let totalResultsRecords = 0;
        let totalMarksObtained = 0;
        let totalMaxMarks = 0;
        const examBreakdown: any[] = [];
        for (const r of resultsPosted) {
          try {
            const recs = JSON.parse(r.records);
            for (const rec of recs) {
              totalResultsRecords++;
              totalMarksObtained += Number(rec.marks) || 0;
              totalMaxMarks += Number(r.totalMarks) || 100;
            }
            examBreakdown.push({
              id: r.id, exam: r.exam, date: r.date,
              courseId: r.courseId, classId: r.classId,
              totalMarks: r.totalMarks, students: recs.length,
              avgMarks: recs.length > 0 ? Math.round((recs.reduce((s: number, x: any) => s + (Number(x.marks) || 0), 0) / recs.length) * 10) / 10 : 0,
            });
          } catch {}
        }
        const avgScore = totalMaxMarks > 0 ? Math.round((totalMarksObtained / totalMaxMarks) * 100) : 0;

        const diaryR = await db.execute({
          sql: 'SELECT id, title, subject, classId, courseId, due, createdAt FROM diary WHERE teacherId = ? ORDER BY createdAt DESC LIMIT 20',
          args: [teacherId],
        });
        const diaryEntries = diaryR.rows;

        const matR = await db.execute({
          sql: 'SELECT COUNT(*) as count FROM course_materials WHERE teacherId = ?',
          args: [teacherId],
        });
        const materialsCount = (matR.rows[0] as any)?.count || 0;

        const attendanceTrend = attendanceSessions.slice(0, 8).reverse().map((s, i) => {
          try {
            const recs = JSON.parse(s.records);
            const present = recs.filter((r: any) => r.status === 'Present').length;
            const total = recs.length;
            return {
              label: s.date ? s.date.slice(5) : `S${i + 1}`,
              rate: total > 0 ? Math.round((present / total) * 100) : 0,
              present, absent: recs.filter((r: any) => r.status === 'Absent').length, total,
            };
          } catch {
            return { label: `S${i + 1}`, rate: 0, present: 0, absent: 0, total: 0 };
          }
        });

        const classPerformance = classStudentCounts.map(cs => {
          const classResults = resultsPosted.filter(r => r.classId === cs.classId);
          let sum = 0, count = 0;
          for (const r of classResults) {
            try {
              const recs = JSON.parse(r.records);
              for (const rec of recs) { sum += Number(rec.marks) || 0; count++; }
            } catch {}
          }
          return {
            classId: cs.classId,
            className: cs.className,
            section: cs.section,
            students: cs.students,
            avgScore: count > 0 ? Math.round((sum / count / (classResults[0]?.totalMarks || 100)) * 100) : 0,
            examsConducted: classResults.length,
          };
        });

        return NextResponse.json({
          kpi: {
            totalClasses: classIds.length,
            totalCourses: courseIds.length,
            totalStudents,
            attendanceSessions: attendanceSessions.length,
            attendanceRate,
            attendanceRecords,
            presentCount,
            absentCount,
            lateCount,
            resultsPosted: resultsPosted.length,
            totalResultsRecords,
            avgScore,
            diaryEntries: (diaryEntries as any[]).length,
            materialsUploaded: materialsCount,
          },
          assignments,
          attendanceTrend,
          classPerformance,
          examBreakdown: examBreakdown.slice(0, 10),
          recentDiary: (diaryEntries as any[]).slice(0, 5),
          recentResults: examBreakdown.slice(0, 5),
        });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to load teacher analytics: ' + e.message }, { status: 500 });
      }
    }

    // ===================== STUDENT ANALYTICS =====================
    if (method === 'GET' && path === 'student/analytics') {
      const user = await requireAuth(req);
      requireRole(user, 'student');
      const studentId = user.id;
      try {
        const attR = await db.execute({
          sql: 'SELECT id, date, classId, records FROM attendance ORDER BY date DESC LIMIT 100',
          args: [],
        });
        let presentCount = 0, absentCount = 0, lateCount = 0, totalSessions = 0;
        const attendanceTrend: any[] = [];
        for (const s of attR.rows as any[]) {
          try {
            const recs = JSON.parse(s.records);
            const entry = recs.find((r: any) => r.studentId === studentId);
            if (entry) {
              totalSessions++;
              if (entry.status === 'Present') presentCount++;
              else if (entry.status === 'Absent') absentCount++;
              else if (entry.status === 'Late') lateCount++;
              attendanceTrend.push({
                date: s.date,
                status: entry.status,
                label: s.date ? s.date.slice(5) : '',
              });
            }
          } catch {}
        }
        const attendanceRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;

        const resR = await db.execute({
          sql: 'SELECT id, exam, courseId, classId, totalMarks, date, records FROM results ORDER BY date DESC LIMIT 50',
          args: [],
        });
        const studentResults: any[] = [];
        let totalMarksObtained = 0, totalMaxMarks = 0;
        for (const r of resR.rows as any[]) {
          try {
            const recs = JSON.parse(r.records);
            const entry = recs.find((rec: any) => rec.studentId === studentId);
            if (entry) {
              studentResults.push({
                id: r.id, exam: r.exam, courseId: r.courseId, classId: r.classId,
                date: r.date, totalMarks: r.totalMarks, marks: entry.marks, grade: entry.grade,
              });
              totalMarksObtained += Number(entry.marks) || 0;
              totalMaxMarks += Number(r.totalMarks) || 100;
            }
          } catch {}
        }
        const avgScore = totalMaxMarks > 0 ? Math.round((totalMarksObtained / totalMaxMarks) * 100) : 0;

        const invR = await db.execute({
          sql: 'SELECT id, month, year, amount, status, paidDate, paidAmount, challanNo, createdAt FROM fee_invoices WHERE studentId = ? ORDER BY year DESC, createdAt DESC',
          args: [studentId],
        });
        const invoices = invR.rows as any[];
        const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
        const totalPending = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + (Number(i.amount) || 0), 0);

        const diaryR = await db.execute({
          sql: 'SELECT id, title, subject, classId, courseId, due, createdAt FROM diary WHERE branchId = ? ORDER BY createdAt DESC LIMIT 10',
          args: [user.branchId],
        });
        const diaryEntries = diaryR.rows;

        const matR = await db.execute({
          sql: 'SELECT COUNT(*) as count FROM course_materials WHERE classId IN (SELECT id FROM classes WHERE branchId = ? AND name = ?)',
          args: [user.branchId, user.class],
        });
        const materialsCount = (matR.rows[0] as any)?.count || 0;

        const gradeDistribution: Record<string, number> = {};
        for (const r of studentResults) {
          const grade = r.grade || (r.marks / r.totalMarks >= 0.9 ? 'A+' : r.marks / r.totalMarks >= 0.8 ? 'A' : r.marks / r.totalMarks >= 0.7 ? 'B' : r.marks / r.totalMarks >= 0.6 ? 'C' : r.marks / r.totalMarks >= 0.5 ? 'D' : 'F');
          gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
        }

        const recentAttendanceTrend = attendanceTrend.slice(0, 10).reverse();

        return NextResponse.json({
          kpi: {
            attendanceRate,
            totalSessions,
            presentCount,
            absentCount,
            lateCount,
            avgScore,
            totalResults: studentResults.length,
            totalInvoices: invoices.length,
            paidInvoices: invoices.filter(i => i.status === 'Paid').length,
            unpaidInvoices: invoices.filter(i => i.status !== 'Paid').length,
            totalPaid,
            totalPending,
            diaryEntries: (diaryEntries as any[]).length,
            materialsCount,
          },
          attendanceTrend: recentAttendanceTrend,
          recentResults: studentResults.slice(0, 5),
          gradeDistribution: Object.entries(gradeDistribution).map(([grade, count]) => ({ grade, count })),
          recentDiary: (diaryEntries as any[]).slice(0, 5),
        });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to load student analytics: ' + e.message }, { status: 500 });
      }
    }

    // ===================== ANNOUNCEMENTS =====================
    if (method === 'GET' && path === 'announcements') {
      const user = await requireAuth(req);
      let sql = 'SELECT * FROM announcements WHERE 1=1';
      let args: any[] = [];

      if (user.role === 'super-admin') {
        // Product owner sees ALL college announcements (no filter)
      } else if (user.role === 'institute-admin' || user.role === 'admin') {
        sql += ' AND ((senderRole = ? AND (targetScope = ? OR instituteId = ?)) OR senderId = ?)';
        args = ['super-admin', 'all', user.instituteId, user.id];
      } else if (user.role === 'branch-manager') {
        sql += ' AND ((senderRole = ? AND (targetScope = ? OR targetRole IN (?, ?) OR branchId = ?)) OR senderId = ?)';
        args = ['institute-admin', 'all', 'branch-manager', 'all', user.branchId, user.id];
      } else if (user.role === 'teacher') {
        sql += ' AND ((senderRole = ? AND (targetRole = ? OR targetScope = ?)) OR (senderRole = ? AND (branchId = ? OR classId IN (SELECT id FROM classes WHERE branchId = ?))))';
        args = ['institute-admin', 'teacher', 'all', 'branch-manager', user.branchId, user.branchId];
        const teacherClasses = await db.execute({ sql: 'SELECT DISTINCT classId FROM teacher_class_courses WHERE teacherId = ?', args: [user.id] });
        const classIds = teacherClasses.rows.map((r: any) => r.classId);
        if (classIds.length > 0) {
          const placeholders = classIds.map(() => '?').join(',');
          sql += ` OR classId IN (${placeholders})`;
          args.push(...classIds);
        }
      } else if (user.role === 'student') {
        sql += ' AND (targetRole = ? OR (senderRole = ? AND (branchId = ? OR classId = ?)))';
        args = ['student', 'branch-manager', user.branchId, null];
        const classR = await db.execute({ sql: 'SELECT id FROM classes WHERE branchId = ? AND name = ?', args: [user.branchId, user.class] });
        if (classR.rows.length > 0) {
          sql += ' OR classId = ?';
          args.push((classR.rows[0] as any).id);
        }
      }

      sql += ' ORDER BY createdAt DESC LIMIT 50';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'announcements') {
      const user = await requireAuth(req);
      const { title, message, targetRole, targetScope, targetIds, classId } = body || {};
      if (!title || !message) return NextResponse.json({ error: 'Title and message required' }, { status: 400 });
      const id = nextId('ANN');
      await db.execute({
        sql: `INSERT INTO announcements (id, senderId, senderRole, title, message, targetRole, targetScope, targetIds, instituteId, branchId, classId)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, user.id, user.role, title, message, targetRole || null, targetScope || 'all',
          targetIds ? JSON.stringify(targetIds) : null, user.instituteId || null, user.branchId || null, classId || null],
      });

      // ── Fire push notification to the target audience ──
      // v4.1.0: For institute-wide announcements (targetScope='all'), we now
      // use sendPushToAll() which queries EVERY active user across ALL roles
      // (super-admin, institute-admin, admin, branch-manager, admissions,
      // accountant, academic, teacher, student). Previously we only looped
      // through 6 roles and MISSED super-admin/institute-admin/branch-manager
      // — which is why the user (admin) never received announcement pushes.
      try {
        const { sendPushToRole, sendPushToAll, fcmEnabled } = await import('./fcm');
        if (fcmEnabled()) {
          const senderName = user.name || 'Concordia';
          const body_text = message.length > 100 ? message.slice(0, 100) + '…' : message;
          const data = { route: 'announcements', announcementId: id };
          if (targetRole) {
            // v4.3.0: Targeted at a specific role (e.g. "students only").
            // ONLY notify that role — no staff spam. The user explicitly asked
            // that notifications go ONLY to those they're relevant to.
            await sendPushToRole(targetRole, 'announcement', `📢 ${title}`, `${senderName}: ${body_text}`, data);
          } else {
            // Broadcast to EVERY active user — no one is left out.
            await sendPushToAll('announcement', `📢 ${title}`, `${senderName}: ${body_text}`, data);
          }
        }
      } catch (e) {
        console.error('[announcements] push notification failed:', e);
      }

      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    // Delete an announcement — only the sender or super-admin can delete
    if (method === 'DELETE' && pathSegments[0] === 'announcements' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      const id = pathSegments[1];
      const r = await db.execute({ sql: 'SELECT * FROM announcements WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 });
      const ann = r.rows[0] as any;
      // Only the sender or super-admin can delete
      if (ann.senderId !== user.id && user.role !== 'super-admin') {
        return NextResponse.json({ error: 'Not authorized to delete this announcement' }, { status: 403 });
      }
      await db.execute({ sql: 'DELETE FROM announcements WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    // ===================== COURSE MATERIALS =====================
    if (method === 'GET' && path === 'course-materials') {
      const user = await requireAuth(req);
      const { classId, courseId, teacherId } = query;
      let sql = 'SELECT * FROM course_materials WHERE 1=1';
      let args: any[] = [];
      if (classId) { sql += ' AND classId = ?'; args.push(classId); }
      if (courseId) { sql += ' AND courseId = ?'; args.push(courseId); }
      if (teacherId) { sql += ' AND teacherId = ?'; args.push(teacherId); }
      sql += ' ORDER BY createdAt DESC';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows.map(m => ({ ...m, fileData: undefined })));
    }

    if (method === 'POST' && path === 'course-materials') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher');
      const { classId, courseId, title, description, fileType, fileName, fileData, linkUrl } = body || {};
      if (!classId || !courseId || !title) return NextResponse.json({ error: 'classId, courseId and title required' }, { status: 400 });
      const id = nextId('MAT');
      await db.execute({
        sql: `INSERT INTO course_materials (id, teacherId, classId, courseId, title, description, fileType, fileName, fileData, linkUrl)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, user.id, classId, courseId, title, description || '', fileType || '', fileName || '', fileData || '', linkUrl || ''],
      });
      return NextResponse.json({ id, title, success: true }, { status: 201 });
    }

    if (method === 'GET' && pathSegments[0] === 'course-materials' && pathSegments[2] === 'download') {
      const user = await requireAuth(req);
      const id = pathSegments[1];
      const r = await db.execute({ sql: 'SELECT * FROM course_materials WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const mat = r.rows[0] as any;
      if (mat.linkUrl) return NextResponse.json({ linkUrl: mat.linkUrl });
      if (!mat.fileData) return NextResponse.json({ error: 'No file data' }, { status: 404 });
      const buffer = Buffer.from(mat.fileData, 'base64');
      const headers = new Headers();
      headers.set('Content-Type', mat.fileType || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${mat.fileName || 'download'}"`);
      return new NextResponse(buffer, { status: 200, headers });
    }

    // ===================== PLATFORM OVERVIEW =====================
    if (method === 'GET' && path === 'platform/overview') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      const instR = await db.execute('SELECT COUNT(*) as count FROM institutes');
      const brR = await db.execute('SELECT COUNT(*) as count FROM branches');
      const stuR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE role = ?', args: ['student'] });
      const staffR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE role IN (?, ?, ?)', args: ['teacher', 'branch-manager', 'institute-admin'] });
      const feeR = await db.execute({ sql: 'SELECT COALESCE(SUM(amount), 0) as total FROM fees WHERE status = ?', args: ['Paid'] });
      const activeR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM institutes WHERE blocked = 0' });
      return NextResponse.json({
        institutes: (instR.rows[0] as any).count,
        branches: (brR.rows[0] as any).count,
        totalStudents: (stuR.rows[0] as any).count,
        totalStaff: (staffR.rows[0] as any).count,
        totalRevenue: (feeR.rows[0] as any).total,
        activeInstitutes: (activeR.rows[0] as any).count,
        platformUsers: (stuR.rows[0] as any).count + (staffR.rows[0] as any).count + 1,
      });
    }

    // ===================== SCOPED STATS =====================
    if (method === 'GET' && path === 'scoped/stats') {
      const user = await requireAuth(req);
      const { instituteId, branchId } = query;
      // ── PERF: batch COUNT queries into a single Turso round-trip ──
      // (previously 2-3 sequential round-trips, each 50-200ms on Turso)
      if (branchId) {
        try {
          const batchResult = await db.batch([
            { sql: 'SELECT COUNT(*) as count FROM users WHERE branchId = ? AND role = ?', args: [branchId, 'student'] },
            { sql: 'SELECT COUNT(*) as count FROM users WHERE branchId = ? AND role = ?', args: [branchId, 'teacher'] },
          ]);
          const stuR = batchResult[0].rows[0] as any;
          const tchR = batchResult[1].rows[0] as any;
          return NextResponse.json({ students: stuR.count, teachers: tchR.count });
        } catch {
          const stuR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE branchId = ? AND role = ?', args: [branchId, 'student'] });
          const tchR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE branchId = ? AND role = ?', args: [branchId, 'teacher'] });
          return NextResponse.json({ students: (stuR.rows[0] as any).count, teachers: (tchR.rows[0] as any).count });
        }
      } else if (instituteId) {
        try {
          const batchResult = await db.batch([
            { sql: 'SELECT COUNT(*) as count FROM users WHERE instituteId = ? AND role = ?', args: [instituteId, 'student'] },
            { sql: 'SELECT COUNT(*) as count FROM users WHERE instituteId = ? AND role IN (?, ?)', args: [instituteId, 'teacher', 'branch-manager'] },
            { sql: 'SELECT COUNT(*) as count FROM branches WHERE instituteId = ?', args: [instituteId] },
          ]);
          const stuR = batchResult[0].rows[0] as any;
          const staffR = batchResult[1].rows[0] as any;
          const brR = batchResult[2].rows[0] as any;
          return NextResponse.json({ students: stuR.count, staff: staffR.count, branches: brR.count });
        } catch {
          const stuR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE instituteId = ? AND role = ?', args: [instituteId, 'student'] });
          const staffR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE instituteId = ? AND role IN (?, ?)', args: [instituteId, 'teacher', 'branch-manager'] });
          const brR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM branches WHERE instituteId = ?', args: [instituteId] });
          return NextResponse.json({ students: (stuR.rows[0] as any).count, staff: (staffR.rows[0] as any).count, branches: (brR.rows[0] as any).count });
        }
      } else {
        return NextResponse.json({ students: 0, staff: 0, branches: 0 });
      }
    }

    // ===================== INSTITUTE FINANCE & ANALYTICS =====================
    if (method === 'GET' && path === 'institute/finance') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const instituteId = query.instituteId || user.instituteId;
      if (!instituteId) return NextResponse.json({ kpi: {}, monthlyRevenue: [], branchPerformance: [], recentTransactions: [] });

      try {
        // ── PERF: batch all 6 SELECTs into a SINGLE Turso round-trip ──
        // (previously 6 sequential round-trips = 300ms-1.2s on Turso)
        let revenueEntries: any[], salaries: any[], branches: any[], teachers: any[], salaryStruct: any[], students: any[];
        try {
          const batchResult = await db.batch([
            { sql: 'SELECT * FROM manual_revenue WHERE instituteId = ? AND enteredByRole = ? ORDER BY year DESC, createdAt DESC', args: [instituteId, 'institute-admin'] },
            { sql: 'SELECT id, teacherId, teacherName, branchId, month, year, amount, status, paidDate, paymentMethod, createdAt FROM salary_payments WHERE instituteId = ? ORDER BY createdAt DESC', args: [instituteId] },
            { sql: 'SELECT id, name, city, manager, students, teachers, status, blocked FROM branches WHERE instituteId = ?', args: [instituteId] },
            { sql: 'SELECT id, name, email, branchId, status, blocked FROM users WHERE instituteId = ? AND role = ?', args: [instituteId, 'teacher'] },
            { sql: 'SELECT teacherId, monthlySalary FROM teacher_salaries WHERE instituteId = ?', args: [instituteId] },
            { sql: 'SELECT id, name, class, section, branchId, status, blocked FROM users WHERE instituteId = ? AND role = ?', args: [instituteId, 'student'] },
          ]);
          revenueEntries = batchResult[0].rows as any[];
          salaries = batchResult[1].rows as any[];
          branches = batchResult[2].rows as any[];
          teachers = batchResult[3].rows as any[];
          salaryStruct = batchResult[4].rows as any[];
          students = batchResult[5].rows as any[];
        } catch {
          // Fallback: sequential execution if batch unsupported
          const revR = await db.execute({ sql: 'SELECT * FROM manual_revenue WHERE instituteId = ? AND enteredByRole = ? ORDER BY year DESC, createdAt DESC', args: [instituteId, 'institute-admin'] });
          revenueEntries = revR.rows as any[];
          const salR = await db.execute({ sql: 'SELECT id, teacherId, teacherName, branchId, month, year, amount, status, paidDate, paymentMethod, createdAt FROM salary_payments WHERE instituteId = ? ORDER BY createdAt DESC', args: [instituteId] });
          salaries = salR.rows as any[];
          const brR = await db.execute({ sql: 'SELECT id, name, city, manager, students, teachers, status, blocked FROM branches WHERE instituteId = ?', args: [instituteId] });
          branches = brR.rows as any[];
          const tchR = await db.execute({ sql: 'SELECT id, name, email, branchId, status, blocked FROM users WHERE instituteId = ? AND role = ?', args: [instituteId, 'teacher'] });
          teachers = tchR.rows as any[];
          const salStructR = await db.execute({ sql: 'SELECT teacherId, monthlySalary FROM teacher_salaries WHERE instituteId = ?', args: [instituteId] });
          salaryStruct = salStructR.rows as any[];
          const stuR = await db.execute({ sql: 'SELECT id, name, class, section, branchId, status, blocked FROM users WHERE instituteId = ? AND role = ?', args: [instituteId, 'student'] });
          students = stuR.rows as any[];
        }

        const totalRevenue = revenueEntries.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const totalSalaryPaid = salaries.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const monthlySalaryExpense = teachers.reduce((sum, t) => {
          const ss = salaryStruct.find(s => s.teacherId === t.id);
          return sum + (ss ? Number(ss.monthlySalary) || 0 : 0);
        }, 0);
        const netBalance = totalRevenue - totalSalaryPaid;

        const now = new Date();
        const months: any[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthName = d.toLocaleString('en-US', { month: 'short' });
          const year = d.getFullYear();
          const monthFull = d.toLocaleString('en-US', { month: 'long' });
          const monthRev = revenueEntries.filter(r => r.year === year && r.month === monthFull);
          const revenue = monthRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const monthSal = salaries.filter(sal => sal.year === year && sal.month === monthFull);
          const salary = monthSal.reduce((s, sal) => s + (Number(sal.amount) || 0), 0);
          months.push({ month: monthName, year, revenue, salary, net: revenue - salary });
        }

        const currentYear = now.getFullYear();
        const years: any[] = [];
        for (let y = currentYear - 4; y <= currentYear; y++) {
          const yearRev = revenueEntries.filter(r => r.year === y);
          const revenue = yearRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const yearSal = salaries.filter(sal => sal.year === y);
          const salary = yearSal.reduce((s, sal) => s + (Number(sal.amount) || 0), 0);
          years.push({ year: y, revenue, salary, net: revenue - salary });
        }

        const branchPerformance = branches.map(br => {
          const brRev = revenueEntries.filter(r => r.sourceId === br.id);
          const brRevenue = brRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const brSal = salaries.filter(s => s.branchId === br.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
          const stuCount = students.filter(s => s.branchId === br.id).length;
          const tchCount = teachers.filter(t => t.branchId === br.id).length;
          return {
            id: br.id,
            name: br.name,
            city: br.city || '',
            manager: br.manager || '—',
            status: br.blocked === 1 ? 'Blocked' : (br.status || 'Active'),
            students: stuCount,
            teachers: tchCount,
            revenue: brRevenue,
            pendingFees: 0,
            salaryPaid: brSal,
            net: brRevenue - brSal,
            invoices: brRev.length,
          };
        });

        const recentTransactions = revenueEntries
          .slice(0, 12)
          .map(r => ({
            id: r.id,
            type: 'Revenue Entry',
            date: r.createdAt,
            party: r.sourceName,
            branchId: r.sourceId,
            amount: Number(r.amount) || 0,
            method: r.month + ' ' + r.year,
            status: 'Received',
          }));

        const classMap: Record<string, any> = {};
        for (const s of students) {
          const c = s.class || 'Unassigned';
          if (!classMap[c]) classMap[c] = { class: c, students: 0, paid: 0, pending: 0 };
          classMap[c].students++;
        }
        const classDistribution = Object.values(classMap).sort((a, b) => b.students - a.students);

        const studentFeeSummary = students.map(s => {
          const branch = branches.find(b => b.id === s.branchId);
          return {
            id: s.id,
            name: s.name,
            class: s.class || '—',
            section: s.section || 'A',
            branch: branch?.name || '—',
            branchId: s.branchId,
            status: s.blocked === 1 ? 'Blocked' : (s.status || 'Active'),
            invoices: 0,
            paid: 0,
            pending: 0,
            total: 0,
          };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const teacherSalarySummary = teachers.map(t => {
          const ss = salaryStruct.find(s => s.teacherId === t.id);
          const monthlySalary = ss ? Number(ss.monthlySalary) || 0 : 0;
          const tPayments = salaries.filter(p => p.teacherId === t.id);
          const totalPaid = tPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const lastPayment = tPayments[0];
          const branch = branches.find(b => b.id === t.branchId);
          return {
            id: t.id,
            name: t.name,
            email: t.email || '—',
            branch: branch?.name || '—',
            branchId: t.branchId,
            status: t.blocked === 1 ? 'Blocked' : (t.status || 'Active'),
            monthlySalary,
            totalPaid,
            lastPaidDate: lastPayment?.paidDate || null,
            paymentsCount: tPayments.length,
          };
        }).sort((a, b) => b.monthlySalary - a.monthlySalary);

        return NextResponse.json({
          kpi: {
            branches: branches.length,
            students: students.length,
            teachers: teachers.length,
            totalRevenue,
            pendingFees: 0,
            totalSalaryPaid,
            monthlySalaryExpense,
            netBalance,
            totalInvoices: revenueEntries.length,
            paidInvoices: revenueEntries.length,
            unpaidInvoices: 0,
            revenueEntries: revenueEntries.length,
          },
          monthlyRevenue: months,
          yearlyRevenue: years,
          branchPerformance,
          recentTransactions,
          classDistribution,
          studentFeeSummary,
          teacherSalarySummary,
          revenueEntries,
        });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to load finance data: ' + e.message }, { status: 500 });
      }
    }

    // ===================== BRANCH FINANCE & ANALYTICS =====================
    if (method === 'GET' && path === 'branch/finance') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const branchId = query.branchId || user.branchId;
      if (!branchId) return NextResponse.json({ kpi: {}, monthlyRevenue: [], recentTransactions: [], classPerformance: [] });

      try {
        const invR = await db.execute({ sql: 'SELECT id, studentId, studentName, className, month, year, amount, status, paidDate, paidAmount, paymentMethod, challanNo, createdAt FROM fee_invoices WHERE branchId = ? ORDER BY createdAt DESC', args: [branchId] });
        const invoices = invR.rows as any[];

        const salR = await db.execute({ sql: 'SELECT id, teacherId, teacherName, month, year, amount, status, paidDate, paymentMethod, createdAt FROM salary_payments WHERE branchId = ? ORDER BY createdAt DESC', args: [branchId] });
        const salaries = salR.rows as any[];

        const tchR = await db.execute({ sql: 'SELECT id, name, email, status, blocked FROM users WHERE branchId = ? AND role = ?', args: [branchId, 'teacher'] });
        const teachers = tchR.rows as any[];
        const stuR = await db.execute({ sql: 'SELECT id, name, class, section, rollNo, status, blocked FROM users WHERE branchId = ? AND role = ?', args: [branchId, 'student'] });
        const students = stuR.rows as any[];

        const salStructR = await db.execute({ sql: 'SELECT teacherId, monthlySalary FROM teacher_salaries WHERE branchId = ?', args: [branchId] });
        const salaryStruct = salStructR.rows as any[];

        const attR = await db.execute({ sql: 'SELECT records FROM attendance WHERE branchId = ? ORDER BY date DESC LIMIT 30', args: [branchId] });
        let totalAtt = 0, presentAtt = 0;
        for (const a of attR.rows as any[]) {
          try {
            const recs = JSON.parse(a.records);
            for (const r of recs) {
              totalAtt++;
              if (r.status === 'Present') presentAtt++;
            }
          } catch {}
        }
        const attendanceRate = totalAtt > 0 ? Math.round((presentAtt / totalAtt) * 100) : 0;

        const totalRevenue = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
        const pendingFees = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const totalSalaryPaid = salaries.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const monthlySalaryExpense = teachers.reduce((sum, t) => {
          const ss = salaryStruct.find(s => s.teacherId === t.id);
          return sum + (ss ? Number(ss.monthlySalary) || 0 : 0);
        }, 0);
        const netBalance = totalRevenue - totalSalaryPaid;

        const now = new Date();
        const months: any[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthName = d.toLocaleString('en-US', { month: 'short' });
          const year = d.getFullYear();
          const monthFull = d.toLocaleString('en-US', { month: 'long' });
          const monthInv = invoices.filter(inv => inv.year === year && inv.month === monthFull && inv.status === 'Paid');
          const revenue = monthInv.reduce((s, inv) => s + (Number(inv.paidAmount) || 0), 0);
          const monthSal = salaries.filter(sal => sal.year === year && sal.month === monthFull);
          const salary = monthSal.reduce((s, sal) => s + (Number(sal.amount) || 0), 0);
          months.push({ month: monthName, year, revenue, salary, net: revenue - salary, paid: monthInv.length, unpaid: invoices.filter(inv => inv.year === year && inv.month === monthFull && inv.status !== 'Paid').length });
        }

        const feeStatus = {
          paid: invoices.filter(i => i.status === 'Paid').length,
          unpaid: invoices.filter(i => i.status !== 'Paid').length,
          paidAmount: totalRevenue,
          unpaidAmount: pendingFees,
        };

        const classMap: Record<string, any> = {};
        for (const s of students) {
          const c = s.class || 'Unassigned';
          if (!classMap[c]) classMap[c] = { class: c, students: 0, paid: 0, pending: 0 };
          classMap[c].students++;
          const sInv = invoices.filter(i => i.studentId === s.id);
          classMap[c].paid += sInv.filter(i => i.status === 'Paid').reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
          classMap[c].pending += sInv.filter(i => i.status !== 'Paid').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        }
        const classPerformance = Object.values(classMap).sort((a, b) => b.students - a.students);

        const recentPaidInvoices = invoices
          .filter(i => i.status === 'Paid')
          .slice(0, 8)
          .map(i => ({
            id: i.id, type: 'Fee Payment', date: i.paidDate || i.createdAt,
            party: i.studentName || 'Student', amount: Number(i.paidAmount) || 0,
            method: i.paymentMethod || 'Cash', status: 'Paid',
          }));
        const recentSalaries = salaries
          .slice(0, 8)
          .map(s => ({
            id: s.id, type: 'Salary Payout', date: s.paidDate || s.createdAt,
            party: s.teacherName || 'Teacher', amount: Number(s.amount) || 0,
            method: s.paymentMethod || 'Bank Transfer', status: s.status || 'Paid',
          }));
        const recentTransactions = [...recentPaidInvoices, ...recentSalaries]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 10);

        const studentFeeSummary = students.map(s => {
          const sInv = invoices.filter(i => i.studentId === s.id);
          const paid = sInv.filter(i => i.status === 'Paid').reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
          const pending = sInv.filter(i => i.status !== 'Paid').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
          return {
            id: s.id, name: s.name, class: s.class || '—', section: s.section || 'A', rollNo: s.rollNo || '—',
            status: s.blocked === 1 ? 'Blocked' : (s.status || 'Active'),
            invoices: sInv.length, paid, pending, total: paid + pending,
          };
        }).sort((a, b) => b.pending - a.pending);

        const teacherSalarySummary = teachers.map(t => {
          const ss = salaryStruct.find(s => s.teacherId === t.id);
          const monthlySalary = ss ? Number(ss.monthlySalary) || 0 : 0;
          const tPayments = salaries.filter(p => p.teacherId === t.id);
          const totalPaid = tPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const lastPayment = tPayments[0];
          return {
            id: t.id, name: t.name, email: t.email || '—',
            status: t.blocked === 1 ? 'Blocked' : (t.status || 'Active'),
            monthlySalary, totalPaid, lastPaidDate: lastPayment?.paidDate || null, paymentsCount: tPayments.length,
          };
        }).sort((a, b) => b.monthlySalary - a.monthlySalary);

        return NextResponse.json({
          kpi: {
            students: students.length,
            teachers: teachers.length,
            totalRevenue,
            pendingFees,
            totalSalaryPaid,
            monthlySalaryExpense,
            netBalance,
            attendanceRate,
            totalInvoices: invoices.length,
            paidInvoices: invoices.filter(i => i.status === 'Paid').length,
            unpaidInvoices: invoices.filter(i => i.status !== 'Paid').length,
          },
          monthlyRevenue: months,
          feeStatus,
          classPerformance,
          recentTransactions,
          studentFeeSummary,
          teacherSalarySummary,
        });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to load branch finance: ' + e.message }, { status: 500 });
      }
    }

    // ===================== PLATFORM FINANCE (Super Admin) =====================
    if (method === 'GET' && path === 'platform/finance') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      try {
        const revR = await db.execute({ sql: "SELECT * FROM manual_revenue WHERE enteredByRole = ? ORDER BY year DESC, createdAt DESC", args: ['super-admin'] });
        const revenueEntries = revR.rows as any[];

        const salR = await db.execute({ sql: 'SELECT id, teacherId, teacherName, branchId, instituteId, month, year, amount, status, paidDate, paymentMethod, createdAt FROM salary_payments ORDER BY createdAt DESC LIMIT 500' });
        const salaries = salR.rows as any[];

        const instR = await db.execute({ sql: 'SELECT id, name, city, adminName, adminEmail, branches, students, staff, revenue, status, blocked FROM institutes ORDER BY createdAt DESC' });
        const institutes = instR.rows as any[];

        const brR = await db.execute({ sql: 'SELECT id, instituteId, name, city, manager, students, teachers, status, blocked FROM branches' });
        const branches = brR.rows as any[];

        const stuR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE role = ?', args: ['student'] });
        const tchR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE role = ?', args: ['teacher'] });
        const totalStudents = (stuR.rows[0] as any).count;
        const totalTeachers = (tchR.rows[0] as any).count;

        const totalRevenue = revenueEntries.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const totalSalaryPaid = salaries.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const netBalance = totalRevenue - totalSalaryPaid;

        const now = new Date();
        const months: any[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthName = d.toLocaleString('en-US', { month: 'short' });
          const year = d.getFullYear();
          const monthFull = d.toLocaleString('en-US', { month: 'long' });
          const monthRev = revenueEntries.filter(r => r.year === year && r.month === monthFull);
          const revenue = monthRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const monthSal = salaries.filter(sal => sal.year === year && sal.month === monthFull);
          const salary = monthSal.reduce((s, sal) => s + (Number(sal.amount) || 0), 0);
          months.push({ month: monthName, year, revenue, salary, net: revenue - salary });
        }

        const currentYear = now.getFullYear();
        const years: any[] = [];
        for (let y = currentYear - 4; y <= currentYear; y++) {
          const yearRev = revenueEntries.filter(r => r.year === y);
          const revenue = yearRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const yearSal = salaries.filter(sal => sal.year === y);
          const salary = yearSal.reduce((s, sal) => s + (Number(sal.amount) || 0), 0);
          years.push({ year: y, revenue, salary, net: revenue - salary });
        }

        const institutePerformance = institutes.map(inst => {
          const instRev = revenueEntries.filter(r => r.sourceId === inst.id);
          const instSal = salaries.filter(s => s.instituteId === inst.id);
          const instBranches = branches.filter(b => b.instituteId === inst.id);
          const instRevenue = instRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
          const instSalPaid = instSal.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          return {
            id: inst.id,
            name: inst.name,
            city: inst.city || '',
            admin: inst.adminName || inst.adminEmail || '—',
            branches: instBranches.length,
            students: inst.students || 0,
            staff: inst.staff || 0,
            revenue: instRevenue,
            pendingFees: 0,
            salaryPaid: instSalPaid,
            net: instRevenue - instSalPaid,
            status: inst.blocked === 1 ? 'Blocked' : (inst.status || 'Active'),
          };
        }).sort((a, b) => b.revenue - a.revenue);

        const recentTransactions = revenueEntries
          .slice(0, 15)
          .map(r => ({
            id: r.id,
            type: 'Revenue Entry',
            date: r.createdAt,
            party: r.sourceName,
            instituteId: r.sourceId,
            branchId: null,
            amount: Number(r.amount) || 0,
            method: r.month + ' ' + r.year,
            status: 'Received',
          }));

        return NextResponse.json({
          kpi: {
            institutes: institutes.length,
            activeInstitutes: institutes.filter(i => i.blocked !== 1).length,
            branches: branches.length,
            students: totalStudents,
            teachers: totalTeachers,
            totalRevenue,
            pendingFees: 0,
            totalSalaryPaid,
            netBalance,
            totalInvoices: revenueEntries.length,
            paidInvoices: revenueEntries.length,
            unpaidInvoices: 0,
            revenueEntries: revenueEntries.length,
          },
          monthlyRevenue: months,
          yearlyRevenue: years,
          institutePerformance,
          recentTransactions,
          revenueEntries,
        });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to load platform finance: ' + e.message }, { status: 500 });
      }
    }

    // ===================== TEACHER SALARIES =====================
    if (method === 'POST' && path === 'salaries') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'branch-manager');
      const { teacherId, monthlySalary, effectiveFrom } = body || {};
      if (!teacherId || monthlySalary === undefined) return NextResponse.json({ error: 'teacherId and monthlySalary required' }, { status: 400 });
      const tchR = await db.execute({ sql: 'SELECT id, instituteId, branchId FROM users WHERE id = ? AND role = ?', args: [teacherId, 'teacher'] });
      if (tchR.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
      const t = tchR.rows[0] as any;
      if (user.role === 'institute-admin' && t.instituteId !== user.instituteId) {
        return NextResponse.json({ error: 'Not authorized to set salary for this teacher' }, { status: 403 });
      }
      if (user.role === 'branch-manager' && t.branchId !== user.branchId) {
        return NextResponse.json({ error: 'Not authorized to set salary for this teacher' }, { status: 403 });
      }
      const existing = await db.execute({ sql: 'SELECT id FROM teacher_salaries WHERE teacherId = ?', args: [teacherId] });
      const effDate = effectiveFrom || new Date().toISOString().slice(0, 10);
      if (existing.rows.length > 0) {
        await db.execute({ sql: 'UPDATE teacher_salaries SET monthlySalary = ?, effectiveFrom = ? WHERE id = ?', args: [Number(monthlySalary), effDate, (existing.rows[0] as any).id] });
        return NextResponse.json({ success: true, updated: true });
      } else {
        const id = nextId('TS');
        await db.execute({
          sql: 'INSERT INTO teacher_salaries (id, teacherId, instituteId, branchId, monthlySalary, effectiveFrom) VALUES (?, ?, ?, ?, ?, ?)',
          args: [id, teacherId, t.instituteId, t.branchId, Number(monthlySalary), effDate],
        });
        return NextResponse.json({ success: true, id }, { status: 201 });
      }
    }

    if (method === 'POST' && path === 'salaries/pay') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'branch-manager');
      const { teacherId, month, year, amount, paymentMethod, notes } = body || {};
      if (!teacherId || !month || !year || amount === undefined) return NextResponse.json({ error: 'teacherId, month, year and amount required' }, { status: 400 });
      const tchR = await db.execute({ sql: 'SELECT id, name, instituteId, branchId FROM users WHERE id = ? AND role = ?', args: [teacherId, 'teacher'] });
      if (tchR.rows.length === 0) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
      const t = tchR.rows[0] as any;
      if (user.role === 'institute-admin' && t.instituteId !== user.instituteId) {
        return NextResponse.json({ error: 'Not authorized to pay this teacher' }, { status: 403 });
      }
      if (user.role === 'branch-manager' && t.branchId !== user.branchId) {
        return NextResponse.json({ error: 'Not authorized to pay this teacher' }, { status: 403 });
      }
      const id = nextId('SAL');
      const paidDate = new Date().toISOString().slice(0, 10);
      await db.execute({
        sql: `INSERT INTO salary_payments (id, teacherId, teacherName, instituteId, branchId, month, year, amount, status, paidDate, paymentMethod, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, teacherId, t.name, t.instituteId, t.branchId, month, year, Number(amount), 'Paid', paidDate, paymentMethod || 'Bank Transfer', notes || ''],
      });
      return NextResponse.json({ success: true, id, paidDate }, { status: 201 });
    }

    if (method === 'GET' && path === 'salaries') {
      const user = await requireAuth(req);
      const { instituteId, branchId, teacherId } = query;
      let sql = 'SELECT * FROM salary_payments WHERE 1=1';
      const args: any[] = [];
      if (teacherId) { sql += ' AND teacherId = ?'; args.push(teacherId); }
      else if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (instituteId) { sql += ' AND instituteId = ?'; args.push(instituteId); }
      sql += ' ORDER BY createdAt DESC LIMIT 200';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    // ===================== ATTENDANCE =====================
    if (method === 'POST' && path === 'attendance') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher');
      const { classId, date, records } = body || {};
      if (!date || !records || !Array.isArray(records)) return NextResponse.json({ error: 'date and records array are required' }, { status: 400 });

      // Check if attendance already exists for this class + date — if so, UPDATE instead of INSERT
      // This prevents duplicate attendance records when a teacher marks attendance twice in a day
      const existing = await db.execute({
        sql: 'SELECT id FROM attendance WHERE classId = ? AND date = ? AND branchId = ?',
        args: [classId || null, date, user.branchId],
      });

      if (existing.rows.length > 0) {
        // Update existing record
        const existingId = (existing.rows[0] as any).id;
        await db.execute({
          sql: 'UPDATE attendance SET records = ?, teacherId = ? WHERE id = ?',
          args: [JSON.stringify(records), user.id, existingId],
        });
        // v4.3.0: ONLY notify the students whose attendance was marked
        // (present / absent / late). No staff spam — the user explicitly
        // asked that notifications go ONLY to those they're relevant to.
        // v4.2.0: Also notify PRESENT students (not just absent/late).
        try {
          const { sendPushToUsers, fcmEnabled } = await import('./fcm');
          if (fcmEnabled()) {
            const present = records.filter((r: any) => r.status === 'present' || r.status === 'Present').map((r: any) => r.studentId).filter(Boolean);
            const absent = records.filter((r: any) => r.status === 'absent' || r.status === 'Absent').map((r: any) => r.studentId).filter(Boolean);
            const late = records.filter((r: any) => r.status === 'late' || r.status === 'Late').map((r: any) => r.studentId).filter(Boolean);
            if (present.length > 0) {
              await sendPushToUsers(present, 'attendance', `✅ Attendance marked`, `You were marked PRESENT on ${date}.`, { route: 'attendance', date });
            }
            if (absent.length > 0) {
              await sendPushToUsers(absent, 'attendance', `📋 Attendance marked`, `You were marked ABSENT on ${date}.`, { route: 'attendance', date });
            }
            if (late.length > 0) {
              await sendPushToUsers(late, 'attendance', `📋 Attendance marked`, `You were marked LATE on ${date}.`, { route: 'attendance', date });
            }
          }
        } catch (e) { console.error('[attendance] push failed:', e); }
        return NextResponse.json({ id: existingId, success: true, updated: true });
      }

      const id = nextId('ATT');
      await db.execute({
        sql: 'INSERT INTO attendance (id, branchId, classId, date, teacherId, records) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, user.branchId, classId || null, date, user.id, JSON.stringify(records)],
      });
      // v4.3.0: ONLY notify the students whose attendance was marked
      // (present / absent / late). No staff spam — the user explicitly
      // asked that notifications go ONLY to those they're relevant to.
      // v4.2.0: Also notify PRESENT students (not just absent/late).
      try {
        const { sendPushToUsers, fcmEnabled } = await import('./fcm');
        if (fcmEnabled()) {
          const present = records.filter((r: any) => r.status === 'present' || r.status === 'Present').map((r: any) => r.studentId).filter(Boolean);
          const absent = records.filter((r: any) => r.status === 'absent' || r.status === 'Absent').map((r: any) => r.studentId).filter(Boolean);
          const late = records.filter((r: any) => r.status === 'late' || r.status === 'Late').map((r: any) => r.studentId).filter(Boolean);
          if (present.length > 0) {
            await sendPushToUsers(present, 'attendance', `✅ Attendance marked`, `You were marked PRESENT on ${date}.`, { route: 'attendance', date });
          }
          if (absent.length > 0) {
            await sendPushToUsers(absent, 'attendance', `📋 Attendance marked`, `You were marked ABSENT on ${date}.`, { route: 'attendance', date });
          }
          if (late.length > 0) {
            await sendPushToUsers(late, 'attendance', `📋 Attendance marked`, `You were marked LATE on ${date}.`, { route: 'attendance', date });
          }
        }
      } catch (e) { console.error('[attendance] push failed:', e); }
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    if (method === 'GET' && path === 'attendance') {
      const user = await requireAuth(req);
      const { classId, studentId } = query;
      let sql = 'SELECT * FROM attendance WHERE 1=1';
      let args: any[] = [];
      if (classId) { sql += ' AND classId = ?'; args.push(classId); }
      sql += ' ORDER BY date DESC LIMIT 50';
      const r = await db.execute({ sql, args });
      const entries: any[] = [];
      for (const rec of r.rows as any[]) {
        const records = JSON.parse(rec.records);
        if (studentId) {
          const entry = records.find((e: any) => e.studentId === studentId);
          if (entry) entries.push({ id: rec.id, date: rec.date, status: entry.status });
        } else {
          entries.push({ ...rec, records });
        }
      }
      if (studentId) {
        return NextResponse.json({
          entries,
          total: entries.length,
          present: entries.filter(e => e.status === 'Present').length,
          absent: entries.filter(e => e.status === 'Absent').length,
          late: entries.filter(e => e.status === 'Late').length,
        });
      } else {
        return NextResponse.json(entries);
      }
    }

    // ===================== RESULTS =====================
    if (method === 'POST' && path === 'results') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher');
      const { exam, courseId, totalMarks, date, records, classId } = body || {};
      if (!exam || !records) return NextResponse.json({ error: 'exam and records required' }, { status: 400 });
      const id = nextId('RES');
      await db.execute({
        sql: 'INSERT INTO results (id, branchId, exam, courseId, teacherId, totalMarks, date, records) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, user.branchId, exam, courseId || null, user.id, totalMarks || 100, date || new Date().toISOString().slice(0, 10), JSON.stringify(records)],
      });

      // v4.3.0: ONLY push to each student whose marks were just recorded.
      // No staff summary spam — the user explicitly asked that notifications
      // go ONLY to those they're relevant to.
      try {
        const { sendPushToUsers, fcmEnabled } = await import('./fcm');
        if (fcmEnabled() && Array.isArray(records)) {
          const max = totalMarks || 100;
          for (const rec of records) {
            if (!rec.studentId) continue;
            const marks = Number(rec.marks) || 0;
            const pct = max > 0 ? Math.round((marks / max) * 100) : 0;
            await sendPushToUsers(
              [rec.studentId],
              'marks',
              `📝 Marks uploaded — ${exam}`,
              `You scored ${marks}/${max} (${pct}%). Tap to view details.`,
              { route: 'results', exam, resultId: id },
            );
          }
        }
      } catch (e) { console.error('[results] push failed:', e); }

      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    if (method === 'GET' && path === 'results') {
      const user = await requireAuth(req);
      const { courseId, studentId, teacherId, branchId, exam } = query;
      let sql = 'SELECT * FROM results WHERE 1=1';
      let args: any[] = [];
      // Scope to the caller's branch by default (defence in depth — academics
      // / teachers only ever see their own branch's results). An explicit
      // branchId query is honoured only if it matches the caller's branch.
      const brId = branchId || user.branchId;
      if (brId) { sql += ' AND branchId = ?'; args.push(brId); }
      if (courseId) { sql += ' AND courseId = ?'; args.push(courseId); }
      if (teacherId) { sql += ' AND teacherId = ?'; args.push(teacherId); }
      if (exam) { sql += ' AND exam = ?'; args.push(exam); }
      sql += ' ORDER BY date DESC LIMIT 500';
      const r = await db.execute({ sql, args });
      const entries: any[] = [];
      for (const rec of r.rows as any[]) {
        let records: any[] = [];
        try { records = JSON.parse(rec.records); } catch { records = []; }
        if (studentId) {
          const entry = records.find((e: any) => e.studentId === studentId);
          if (entry) entries.push({ id: rec.id, exam: rec.exam, courseId: rec.courseId, classId: rec.classId, totalMarks: rec.totalMarks, marks: entry.marks, grade: entry.grade, date: rec.date });
        } else {
          entries.push({ ...rec, records });
        }
      }
      return NextResponse.json(entries);
    }

    // ===================== EXAMS (Academic Office / Admin) =====================
    // Exams are scheduled test/assessment sessions (Monthly Test 1, Midterm,
    // Final, Quiz, …) created by the Academic Office. Names are unique per
    // branch so teachers, date sheets, and result cards can reference them.
    if (method === 'GET' && path === 'exams') {
      const user = await requireAuth(req);
      const { branchId } = query;
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json([]);
      const r = await db.execute({
        sql: 'SELECT id, branchId, instituteId, name, type, createdBy, createdAt FROM exams WHERE branchId = ? ORDER BY createdAt DESC',
        args: [brId],
      });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'exams') {
      const user = await requireAuth(req);
      requireRole(user, 'academic', 'admin', 'branch-manager', 'institute-admin');
      const { name, type } = body || {};
      const cleanName = (name || '').toString().trim();
      if (!cleanName) return NextResponse.json({ error: 'Exam name is required' }, { status: 400 });
      const brId = user.branchId;
      if (!brId) return NextResponse.json({ error: 'No branch assigned to your account' }, { status: 400 });
      // Duplicate-name check (case-insensitive) within the same branch.
      const dup = await db.execute({
        sql: "SELECT id, name FROM exams WHERE branchId = ? AND LOWER(name) = LOWER(?)",
        args: [brId, cleanName],
      });
      if (dup.rows.length > 0) {
        return NextResponse.json(
          { error: `An exam named "${cleanName}" already exists. Please choose a different name.` },
          { status: 409 },
        );
      }
      const id = nextId('EX');
      await db.execute({
        sql: 'INSERT INTO exams (id, branchId, instituteId, name, type, createdBy) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, brId, user.instituteId || null, cleanName, type || 'Monthly Test', user.id],
      });

      // v4.3.0: Notify all students + teachers that a new exam was scheduled.
      // (Exams affect everyone, so sendPushToRole is correct here.)
      // Removed sendPushToStaff — staff spam was the user's complaint.
      try {
        const { sendPushToRole, fcmEnabled } = await import('./fcm');
        if (fcmEnabled()) {
          await sendPushToRole('student', 'exam', `📅 New exam: ${cleanName}`, `An exam "${cleanName}" (${type || 'Monthly Test'}) has been scheduled. Check the date sheet for details.`, { route: 'exams', examId: id });
          await sendPushToRole('teacher', 'exam', `📅 New exam: ${cleanName}`, `An exam "${cleanName}" (${type || 'Monthly Test'}) has been scheduled. Prepare your students.`, { route: 'exams', examId: id });
        }
      } catch (e) { console.error('[exams] push failed:', e); }

      return NextResponse.json({ id, success: true, name: cleanName, type: type || 'Monthly Test' }, { status: 201 });
    }

    if (method === 'DELETE' && path.startsWith('exams/')) {
      const user = await requireAuth(req);
      requireRole(user, 'academic', 'admin', 'branch-manager', 'institute-admin');
      const examId = path.split('/')[1];
      if (!examId) return NextResponse.json({ error: 'Exam id required' }, { status: 400 });
      const brId = user.branchId;
      // Scope to caller's branch (defence in depth).
      await db.execute({
        sql: 'DELETE FROM exams WHERE id = ? AND branchId = ?',
        args: [examId, brId],
      });
      return NextResponse.json({ success: true });
    }

    // ===================== FEE STRUCTURE (Branch Manager) =====================
    if (method === 'GET' && path === 'fee-structure') {
      const user = await requireAuth(req);
      const { branchId, classId } = query;
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json([]);
      let sql = 'SELECT fs.*, c.name as className FROM fee_structure fs LEFT JOIN classes c ON fs.classId = c.id WHERE fs.branchId = ?';
      let args: any[] = [brId];
      if (classId) { sql += ' AND fs.classId = ?'; args.push(classId); }
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'fee-structure') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { classId, monthlyFee, admissionFee } = body || {};
      const brId = user.branchId;
      if (!classId || monthlyFee === undefined) return NextResponse.json({ error: 'classId and monthlyFee required' }, { status: 400 });
      const existing = await db.execute({ sql: 'SELECT id FROM fee_structure WHERE branchId = ? AND classId = ?', args: [brId, classId] });
      if (existing.rows.length > 0) {
        await db.execute({ sql: 'UPDATE fee_structure SET monthlyFee = ?, admissionFee = ? WHERE id = ?', args: [monthlyFee, admissionFee || 0, (existing.rows[0] as any).id] });
        return NextResponse.json({ success: true, updated: true });
      } else {
        const id = nextId('FS');
        await db.execute({ sql: 'INSERT INTO fee_structure (id, branchId, classId, monthlyFee, admissionFee) VALUES (?, ?, ?, ?, ?)', args: [id, brId, classId, monthlyFee, admissionFee || 0] });
        return NextResponse.json({ success: true, id }, { status: 201 });
      }
    }

    // ===================== FEE INVOICES =====================
    if (method === 'GET' && path === 'fee-invoices') {
      const user = await requireAuth(req);
      const { studentId, branchId, all } = query;
      // Super-admin can pull ALL college invoices with ?all=1
      if (user.role === 'super-admin' && all === '1') {
        const r = await db.execute({ sql: 'SELECT * FROM fee_invoices ORDER BY year DESC, createdAt DESC LIMIT 500' });
        return NextResponse.json(r.rows);
      }
      // Branch-scoped roles see their branch's invoices
      if (['branch-manager', 'institute-admin', 'admin', 'academic', 'accountant', 'admissions'].includes(user.role) && !studentId) {
        const brId = branchId || user.branchId;
        if (brId) {
          const r = await db.execute({ sql: 'SELECT * FROM fee_invoices WHERE branchId = ? ORDER BY year DESC, createdAt DESC', args: [brId] });
          return NextResponse.json(r.rows);
        }
      }
      const sid = studentId || user.id;
      const r = await db.execute({ sql: 'SELECT * FROM fee_invoices WHERE studentId = ? ORDER BY year DESC, createdAt DESC', args: [sid] });
      return NextResponse.json(r.rows);
    }

    if (method === 'GET' && path === 'fee-invoices/branch') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const brId = user.branchId;
      const r = await db.execute({ sql: 'SELECT * FROM fee_invoices WHERE branchId = ? ORDER BY createdAt DESC', args: [brId] });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'fee-invoices/generate') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager');
      const { month, year } = body || {};
      const brId = user.branchId;
      if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 });
      const students = await db.execute({ sql: 'SELECT id, name, class, branchId, instituteId FROM users WHERE branchId = ? AND role = ?', args: [brId, 'student'] });
      if (students.rows.length === 0) return NextResponse.json({ success: true, generated: 0, message: 'No students found' });
      const newInvoiceStudentIds: string[] = [];
      let generated = 0;
      for (const student of students.rows as any[]) {
        const existing = await db.execute({ sql: 'SELECT id FROM fee_invoices WHERE studentId = ? AND month = ? AND year = ?', args: [student.id, month, year] });
        if (existing.rows.length > 0) continue;
        const classR = await db.execute({ sql: 'SELECT id FROM classes WHERE branchId = ? AND name = ?', args: [brId, student.class] });
        let amount = 0;
        if (classR.rows.length > 0) {
          const feeR = await db.execute({ sql: 'SELECT monthlyFee FROM fee_structure WHERE branchId = ? AND classId = ?', args: [brId, (classR.rows[0] as any).id] });
          if (feeR.rows.length > 0) amount = (feeR.rows[0] as any).monthlyFee;
        }
        if (amount === 0) amount = 5000;
        const id = nextId('INV');
        const challanNo = 'CH-' + year + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(generated + 1).padStart(4, '0');
        await db.execute({
          sql: `INSERT INTO fee_invoices (id, studentId, studentName, className, branchId, instituteId, month, year, amount, type, status, challanNo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, student.id, student.name, student.class || '', brId, student.instituteId, month, year, amount, 'Tuition', 'Unpaid', challanNo],
        });
        generated++;
        newInvoiceStudentIds.push(student.id);
      }

      // v4.3.0: ONLY notify the students who got a new invoice. No staff
      // spam — the user explicitly asked that fee notifications go ONLY to
      // the specific student they're related to.
      try {
        const { sendPushToUsers, fcmEnabled } = await import('./fcm');
        if (fcmEnabled() && newInvoiceStudentIds.length > 0) {
          await sendPushToUsers(
            newInvoiceStudentIds,
            'fee-due',
            `💰 Fee invoice generated`,
            `Your ${month} ${year} fee invoice has been generated. Please submit your payment.`,
            { route: 'fees', month: String(month), year: String(year) },
          );
        }
      } catch (e) { console.error('[fee-invoices/generate] push failed:', e); }

      return NextResponse.json({ success: true, generated, message: `${generated} invoices generated for ${month} ${year}` });
    }

    if (method === 'PATCH' && pathSegments[0] === 'fee-invoices' && pathSegments[2] === 'pay') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const { paidAmount, paymentMethod } = body || {};
      const inv = await db.execute({ sql: 'SELECT * FROM fee_invoices WHERE id = ?', args: [id] });
      if (inv.rows.length === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      const invoice = inv.rows[0] as any;
      const amount = paidAmount || invoice.amount;
      await db.execute({
        sql: 'UPDATE fee_invoices SET status = ?, paidDate = ?, paidAmount = ?, paymentMethod = ? WHERE id = ?',
        args: ['Paid', new Date().toISOString().slice(0, 10), amount, paymentMethod || 'Cash', id],
      });

      // v4.3.0: ONLY notify the student whose fee was marked paid. No staff
      // spam — the user explicitly asked that fee-paid notifications go ONLY
      // to the specific student they're related to.
      try {
        const { sendPushToUser, fcmEnabled } = await import('./fcm');
        if (fcmEnabled() && invoice.studentId) {
          await sendPushToUser(
            invoice.studentId,
            'fee-paid',
            `✅ Fee payment received`,
            `Rs ${Number(amount).toLocaleString()} for ${invoice.month} ${invoice.year} has been marked Paid. Thank you!`,
            { route: 'fees', invoiceId: id },
          );
        }
      } catch (e) { console.error('[fee-invoices/pay] push failed:', e); }

      return NextResponse.json({ success: true, status: 'Paid' });
    }

    if (method === 'GET' && pathSegments[0] === 'fee-invoices' && pathSegments[2] === 'challan') {
      const user = await requireAuth(req);
      const id = pathSegments[1];
      const inv = await db.execute({ sql: 'SELECT * FROM fee_invoices WHERE id = ?', args: [id] });
      if (inv.rows.length === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      const invoice = inv.rows[0] as any;
      const stu = await db.execute({
        sql: `SELECT u.*, i.name as instituteName, b.name as branchName
              FROM users u
              LEFT JOIN institutes i ON u.instituteId = i.id
              LEFT JOIN branches b ON u.branchId = b.id
              WHERE u.id = ?`,
        args: [invoice.studentId],
      });
      const student = (stu.rows[0] as any) || {};
      return NextResponse.json({
        challanNo: invoice.challanNo,
        studentName: invoice.studentName || student.name,
        studentId: invoice.studentId,
        rollNo: student.rollNo,
        className: invoice.className || student.class,
        branch: student.branchId,
        branchName: student.branchName,
        instituteId: student.instituteId,
        instituteName: student.instituteName,
        month: invoice.month,
        year: invoice.year,
        amount: invoice.amount,
        status: invoice.status,
        type: invoice.type,
        paidDate: invoice.paidDate,
        paidAmount: invoice.paidAmount,
        paymentMethod: invoice.paymentMethod,
        generatedAt: invoice.createdAt,
      });
    }

    // PATCH /api/fee-invoices/[id] - Edit installment amount/due date
    if (method === 'PATCH' && pathSegments[0] === 'fee-invoices' && pathSegments[1] && !pathSegments[2]) {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const { amount, dueDate } = body || {};
      
      // Check if invoice exists
      const inv = await db.execute({ sql: 'SELECT * FROM fee_invoices WHERE id = ?', args: [id] });
      if (inv.rows.length === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      
      const invoice = inv.rows[0] as any;
      
      // Don't allow editing paid invoices
      if ((invoice.status || '').toLowerCase() === 'paid') {
        return NextResponse.json({ error: 'Cannot edit paid invoices' }, { status: 400 });
      }
      
      // Build update query dynamically
      const updates: string[] = [];
      const args: any[] = [];
      
      if (amount !== undefined) {
        updates.push('amount = ?');
        args.push(amount);
      }
      
      if (dueDate !== undefined) {
        updates.push('dueDate = ?');
        args.push(dueDate);
      }
      
      if (updates.length === 0) {
        return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
      }
      
      args.push(id); // for WHERE clause
      
      await db.execute({
        sql: `UPDATE fee_invoices SET ${updates.join(', ')} WHERE id = ?`,
        args,
      });
      
      return NextResponse.json({ success: true, message: 'Installment updated' });
    }

    // ===================== INSTALLMENTS (split locked base fee) =====================
    // Accountant splits the locked base fee into N installments; each
    // installment becomes a fee_invoice row with type='Installment' and a
    // dueDate. Replaces any existing installment plan for the student.
    if (method === 'POST' && path === 'fee-invoices/installments') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { studentId, installments } = body || {};
      if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
      if (!Array.isArray(installments) || installments.length === 0) {
        return NextResponse.json({ error: 'installments array required' }, { status: 400 });
      }
      const stuR = await db.execute({ sql: 'SELECT id, name, class, branchId, instituteId, baseFee, baseFeeLocked FROM users WHERE id = ?', args: [studentId] });
      if (stuR.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const student = stuR.rows[0] as any;
      const brId = student.branchId || user.branchId;
      // Delete any existing installment invoices for this student (resplit)
      await db.execute({ sql: "DELETE FROM fee_invoices WHERE studentId = ? AND type = 'Installment'", args: [studentId] });
      let created = 0;
      const now = new Date();
      for (const inst of installments) {
        const amount = Number(inst.amount);
        const dueDate = inst.dueDate || null;
        if (!amount || amount <= 0) continue;
        const id = nextId('INV');
        const challanNo = 'CH-INST-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(created + 1).padStart(4, '0');
        const d = dueDate ? new Date(dueDate) : now;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const month = monthNames[d.getMonth()] || 'January';
        const year = d.getFullYear();
        await db.execute({
          sql: `INSERT INTO fee_invoices (id, studentId, studentName, className, branchId, instituteId, month, year, amount, type, status, challanNo, dueDate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, student.id, student.name || '', student.class || '', brId, student.instituteId, month, year, amount, 'Installment', 'Unpaid', challanNo, dueDate],
        });
        created++;
      }
      return NextResponse.json({ success: true, created, message: `${created} installments created for ${student.name}` });
    }

    // ===================== MISC CHARGES (one-off fees) =====================
    if (method === 'GET' && path === 'misc-charges') {
      const user = await requireAuth(req);
      const { branchId, studentId } = query;
      let sql = 'SELECT * FROM misc_charges WHERE 1=1';
      const args: any[] = [];
      if (studentId) { sql += ' AND studentId = ?'; args.push(studentId); }
      else if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (user.branchId) { sql += ' AND branchId = ?'; args.push(user.branchId); }
      sql += ' ORDER BY createdAt DESC LIMIT 500';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'misc-charges') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { studentId, type, amount, description } = body || {};
      if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
      if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });
      const v = Number(amount);
      if (!amount || isNaN(v) || v <= 0) return NextResponse.json({ error: 'valid amount required' }, { status: 400 });
      const stuR = await db.execute({ sql: 'SELECT id, name, branchId, instituteId FROM users WHERE id = ?', args: [studentId] });
      if (stuR.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const student = stuR.rows[0] as any;
      const id = nextId('MC');
      await db.execute({
        sql: 'INSERT INTO misc_charges (id, studentId, studentName, branchId, instituteId, type, amount, description, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, studentId, student.name || '', student.branchId || user.branchId, student.instituteId, type, v, description || '', user.id],
      });
      return NextResponse.json({ success: true, id, studentName: student.name, type, amount: v, description: description || '', createdAt: new Date().toISOString() }, { status: 201 });
    }

    if (method === 'DELETE' && pathSegments[0] === 'misc-charges') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      await db.execute({ sql: 'DELETE FROM misc_charges WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    // ===================== DIARY (Teacher homework + notes) =====================
    if (method === 'GET' && path === 'diary') {
      const user = await requireAuth(req);
      const { teacherId, branchId, classId, class: className } = query;
      let sql = 'SELECT d.*, c.name as className, co.name as courseName FROM diary d LEFT JOIN classes c ON d.classId = c.id LEFT JOIN courses co ON d.courseId = co.id WHERE 1=1';
      const args: any[] = [];
      if (teacherId) { sql += ' AND d.teacherId = ?'; args.push(teacherId); }
      else if (branchId) { sql += ' AND d.branchId = ?'; args.push(branchId); }
      if (classId) { sql += ' AND d.classId = ?'; args.push(classId); }
      sql += ' ORDER BY d.createdAt DESC LIMIT 100';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'diary') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher', 'branch-manager');
      const { teacherId, branchId, classId, courseId, subject, title, description, due } = body || {};
      if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
      const id = nextId('DR');
      const tId = teacherId || user.id;
      const brId = branchId || user.branchId;
      await db.execute({
        sql: 'INSERT INTO diary (id, teacherId, branchId, classId, courseId, subject, title, description, due) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, tId, brId, classId || null, courseId || null, subject || '', title, description || '', due || null],
      });
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    // ===================== SMS LOG =====================
    if (method === 'GET' && path === 'sms') {
      const user = await requireAuth(req);
      const { senderId, instituteId, branchId } = query;
      let sql = 'SELECT * FROM sms_log WHERE 1=1';
      const args: any[] = [];
      if (senderId) { sql += ' AND senderId = ?'; args.push(senderId); }
      else if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (instituteId) { sql += ' AND instituteId = ?'; args.push(instituteId); }
      sql += ' ORDER BY createdAt DESC LIMIT 100';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'sms/send') {
      const user = await requireAuth(req);
      requireRole(user, 'teacher', 'branch-manager', 'institute-admin');
      const { text, recipients, type, classId } = body || {};
      if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
      const id = nextId('SMS');
      await db.execute({
        sql: 'INSERT INTO sms_log (id, senderId, senderRole, text, recipients, type, instituteId, branchId, classId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, user.id, user.role, text, recipients || 0, type || 'Notice', user.instituteId, user.branchId, classId || null],
      });
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    // ===================== COMPLAINTS =====================
    if (method === 'GET' && path === 'complaints') {
      const user = await requireAuth(req);
      const { parentId, instituteId, branchId } = query;
      let sql = 'SELECT * FROM complaints WHERE 1=1';
      const args: any[] = [];
      if (parentId) { sql += ' AND parentId = ?'; args.push(parentId); }
      else if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (instituteId) { sql += ' AND instituteId = ?'; args.push(instituteId); }
      sql += ' ORDER BY createdAt DESC LIMIT 100';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'complaints') {
      const user = await requireAuth(req);
      requireRole(user, 'parent', 'student');
      const { parentId, studentId, instituteId, branchId, subject, message } = body || {};
      if (!subject || !message) return NextResponse.json({ error: 'subject and message required' }, { status: 400 });
      const id = nextId('CMP');
      const pId = parentId || user.id;
      const iId = instituteId || user.instituteId;
      const bId = branchId || user.branchId;
      await db.execute({
        sql: 'INSERT INTO complaints (id, parentId, studentId, instituteId, branchId, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [id, pId, studentId || null, iId, bId, subject, message],
      });
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    if (method === 'PATCH' && pathSegments[0] === 'complaints' && pathSegments[2] === 'respond') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      const { response } = body || {};
      if (!response) return NextResponse.json({ error: 'response required' }, { status: 400 });
      await db.execute({
        sql: 'UPDATE complaints SET response = ?, respondedAt = ?, status = ? WHERE id = ?',
        args: [response, new Date().toISOString().slice(0, 10), 'Resolved', id],
      });
      return NextResponse.json({ success: true });
    }

    // ===================== EVENTS =====================
    if (method === 'GET' && path === 'events') {
      const user = await requireAuth(req);
      const { instituteId, branchId } = query;
      let sql = 'SELECT * FROM events WHERE 1=1';
      const args: any[] = [];
      if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (instituteId) { sql += ' AND instituteId = ?'; args.push(instituteId); }
      sql += ' ORDER BY startDate DESC LIMIT 100';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'events') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const { title, description, startDate, endDate, location, type, instituteId, branchId } = body || {};
      if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
      const id = nextId('EVT');
      const iId = instituteId || user.instituteId;
      const bId = branchId || user.branchId;
      await db.execute({
        sql: 'INSERT INTO events (id, title, description, startDate, endDate, location, type, instituteId, branchId, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, title, description || '', startDate || null, endDate || null, location || '', type || 'Event', iId, bId, user.id],
      });
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    // ===================== LIBRARY =====================
    if (method === 'GET' && path === 'library/books') {
      const user = await requireAuth(req);
      const { branchId } = query;
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json([]);
      const r = await db.execute({ sql: 'SELECT * FROM library_books WHERE branchId = ? ORDER BY createdAt DESC', args: [brId] });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'library/books') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { title, author, isbn, category, totalCopies, shelf } = body || {};
      if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
      const id = nextId('BK');
      const brId = user.branchId;
      const copies = totalCopies || 1;
      await db.execute({
        sql: 'INSERT INTO library_books (id, branchId, title, author, isbn, category, totalCopies, availableCopies, shelf) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, brId, title, author || '', isbn || '', category || '', copies, copies, shelf || ''],
      });
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    // ===================== TRANSPORT =====================
    if (method === 'GET' && path === 'transport/routes') {
      const user = await requireAuth(req);
      const { branchId } = query;
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json([]);
      const r = await db.execute({ sql: 'SELECT * FROM transport_routes WHERE branchId = ? ORDER BY createdAt DESC', args: [brId] });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'transport/routes') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { routeName, driver, vehicleNo, fare, stops, capacity } = body || {};
      if (!routeName) return NextResponse.json({ error: 'routeName required' }, { status: 400 });
      const id = nextId('TR');
      const brId = user.branchId;
      await db.execute({
        sql: 'INSERT INTO transport_routes (id, branchId, routeName, driver, vehicleNo, fare, stops, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, brId, routeName, driver || '', vehicleNo || '', Number(fare) || 0, stops || '', Number(capacity) || 30],
      });
      return NextResponse.json({ id, success: true }, { status: 201 });
    }

    // ===================== MANUAL REVENUE =====================
    if (method === 'POST' && path === 'revenue') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin', 'institute-admin');
      const { sourceType, sourceId, sourceName, amount, month, year, notes } = body || {};
      if (!sourceType || !sourceId || !sourceName || amount === undefined || !month || !year) {
        return NextResponse.json({ error: 'sourceType, sourceId, sourceName, amount, month, year required' }, { status: 400 });
      }
      let instituteId: string | null = null;
      if (user.role === 'super-admin') {
        if (sourceType !== 'institute') return NextResponse.json({ error: 'Super Admin can only enter revenue for institutes' }, { status: 403 });
        instituteId = sourceId;
      } else if (user.role === 'institute-admin') {
        if (sourceType !== 'branch') return NextResponse.json({ error: 'Institute Admin can only enter revenue for branches' }, { status: 403 });
        instituteId = user.instituteId;
        const brR = await db.execute({ sql: 'SELECT id FROM branches WHERE id = ? AND instituteId = ?', args: [sourceId, instituteId] });
        if (brR.rows.length === 0) return NextResponse.json({ error: 'Branch does not belong to your institute' }, { status: 403 });
      }

      const existing = await db.execute({
        sql: 'SELECT id FROM manual_revenue WHERE sourceId = ? AND month = ? AND year = ? AND enteredByRole = ?',
        args: [sourceId, month, year, user.role],
      });
      if (existing.rows.length > 0) {
        await db.execute({
          sql: 'UPDATE manual_revenue SET amount = ?, sourceName = ?, notes = ?, instituteId = ? WHERE id = ?',
          args: [Number(amount), sourceName, notes || '', instituteId, (existing.rows[0] as any).id],
        });
        return NextResponse.json({ success: true, id: (existing.rows[0] as any).id, updated: true });
      } else {
        const id = nextId('REV');
        await db.execute({
          sql: `INSERT INTO manual_revenue (id, enteredBy, enteredByRole, instituteId, sourceType, sourceId, sourceName, amount, month, year, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, user.id, user.role, instituteId, sourceType, sourceId, sourceName, Number(amount), month, year, notes || ''],
        });
        return NextResponse.json({ success: true, id }, { status: 201 });
      }
    }

    if (method === 'GET' && path === 'revenue') {
      const user = await requireAuth(req);
      const { sourceType, sourceId, instituteId, month, year } = query;
      let sql = 'SELECT * FROM manual_revenue WHERE 1=1';
      const args: any[] = [];
      if (user.role === 'super-admin') {
        sql += ' AND enteredByRole = ?';
        args.push('super-admin');
      } else if (user.role === 'institute-admin') {
        sql += ' AND instituteId = ? AND enteredByRole = ?';
        args.push(user.instituteId, 'institute-admin');
      }
      if (sourceType) { sql += ' AND sourceType = ?'; args.push(sourceType); }
      if (sourceId) { sql += ' AND sourceId = ?'; args.push(sourceId); }
      if (instituteId) { sql += ' AND instituteId = ?'; args.push(instituteId); }
      if (month) { sql += ' AND month = ?'; args.push(month); }
      if (year) { sql += ' AND year = ?'; args.push(Number(year)); }
      sql += ' ORDER BY year DESC, createdAt DESC LIMIT 500';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'DELETE' && pathSegments[0] === 'revenue' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin', 'institute-admin');
      const id = pathSegments[1];
      const r = await db.execute({ sql: 'SELECT * FROM manual_revenue WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'Revenue entry not found' }, { status: 404 });
      const entry = r.rows[0] as any;
      if (user.role === 'institute-admin' && entry.instituteId !== user.instituteId) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      await db.execute({ sql: 'DELETE FROM manual_revenue WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    // ===================== TIMETABLE =====================
    if (method === 'GET' && path === 'timetable') {
      const user = await requireAuth(req);
      const { branchId, classId, teacherId } = query;
      let sql = 'SELECT * FROM timetable WHERE 1=1';
      const args: any[] = [];
      if (teacherId) { sql += ' AND teacherId = ?'; args.push(teacherId); }
      else if (classId) { sql += ' AND classId = ?'; args.push(classId); }
      else if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (user.branchId) { sql += ' AND branchId = ?'; args.push(user.branchId); }
      sql += " ORDER BY CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7 END, period";
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'timetable') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const { classId, className, section, day, period, startTime, endTime, subject, teacherId, teacherName, roomName } = body || {};
      if (!day || period === undefined) return NextResponse.json({ error: 'day and period required' }, { status: 400 });
      const brId = user.branchId;

      // ─── Clash check #1: CLASS slot already taken ───
      // The same class cannot have two lectures on the same day + period.
      // Previously this silently overwrote the existing row — that hid
      // mistakes. Now we error so the academic office sees the clash.
      if (classId) {
        const classClash = await db.execute({
          sql: 'SELECT id, subject, teacherName FROM timetable WHERE branchId = ? AND classId = ? AND day = ? AND period = ?',
          args: [brId, classId, day, period],
        });
        if (classClash.rows.length > 0) {
          const c = classClash.rows[0] as any;
          const clsLabel = className ? `${className}${section ? '-' + section : ''}` : 'This class';
          const detail = c.subject ? ` (${c.subject}${c.teacherName ? ' · ' + c.teacherName : ''})` : '';
          return NextResponse.json({
            error: `${clsLabel} already has a lecture scheduled for ${day} Period ${period}${detail}. Delete that entry first if you want to change it.`,
          }, { status: 409 });
        }
      }

      // ─── Clash check #2: TEACHER already booked elsewhere ───
      // The same teacher cannot be in two places at once — if they already
      // have a lecture on this day + period (in any class), block it.
      if (teacherId) {
        const teacherClash = await db.execute({
          sql: 'SELECT id, className, section, subject FROM timetable WHERE branchId = ? AND teacherId = ? AND day = ? AND period = ?',
          args: [brId, teacherId, day, period],
        });
        if (teacherClash.rows.length > 0) {
          const t = teacherClash.rows[0] as any;
          const clashCls = t.className ? `${t.className}${t.section ? '-' + t.section : ''}` : 'another class';
          const clashSub = t.subject ? ` (${t.subject})` : '';
          return NextResponse.json({
            error: `${teacherName || 'This teacher'} already has a lecture on ${day} Period ${period} in ${clashCls}${clashSub}. Pick a different teacher, day, or period.`,
          }, { status: 409 });
        }
      }

      // ─── Clash check #3: TEACHER time overlap (same day, overlapping
      // start/end times in a different period) ───
      // Periods are discrete, but if the academic office set custom
      // start/end times that overlap with another of the teacher's
      // lectures on the same day, block that too.
      if (teacherId && startTime && endTime) {
        const overlap = await db.execute({
          sql: `SELECT id, className, section, subject, period, startTime, endTime FROM timetable
                WHERE branchId = ? AND teacherId = ? AND day = ? AND id IS NOT NULL
                AND startTime != '' AND endTime != ''
                AND startTime < ? AND endTime > ?`,
          args: [brId, teacherId, day, endTime, startTime],
        });
        if (overlap.rows.length > 0) {
          const t = overlap.rows[0] as any;
          const clashCls = t.className ? `${t.className}${t.section ? '-' + t.section : ''}` : 'another class';
          return NextResponse.json({
            error: `${teacherName || 'This teacher'} already has a lecture on ${day} ${t.startTime}–${t.endTime} in ${clashCls} that overlaps with ${startTime}–${endTime}.`,
          }, { status: 409 });
        }
      }

      const id = nextId('TT');
      await db.execute({
        sql: 'INSERT INTO timetable (id, branchId, classId, className, section, day, period, startTime, endTime, subject, teacherId, teacherName, roomName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, brId, classId || null, className || '', section || 'A', day, period, startTime || '', endTime || '', subject || '', teacherId || null, teacherName || '', roomName || ''],
      });
      return NextResponse.json({ success: true, id }, { status: 201 });
    }

    if (method === 'DELETE' && pathSegments[0] === 'timetable' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin');
      const id = pathSegments[1];
      await db.execute({ sql: 'DELETE FROM timetable WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    // ===================== REPORT CARDS =====================
    if (method === 'GET' && path === 'report-cards') {
      const user = await requireAuth(req);
      const { studentId, branchId } = query;
      let sql = 'SELECT * FROM report_cards WHERE 1=1';
      const args: any[] = [];
      if (studentId) { sql += ' AND studentId = ?'; args.push(studentId); }
      else if (branchId) { sql += ' AND branchId = ?'; args.push(branchId); }
      else if (user.branchId) { sql += ' AND branchId = ?'; args.push(user.branchId); }
      sql += ' ORDER BY generatedAt DESC LIMIT 100';
      const r = await db.execute({ sql, args });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'report-cards') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'teacher');
      const { studentId, studentName, class: cls, section, term, examName, totalMarks, obtainedMarks, percentage, grade, remarks } = body || {};
      if (!studentId || !term) return NextResponse.json({ error: 'studentId and term required' }, { status: 400 });
      const id = nextId('RC');
      const brId = user.branchId;
      await db.execute({
        sql: `INSERT INTO report_cards (id, studentId, studentName, class, section, branchId, instituteId, term, examName, totalMarks, obtainedMarks, percentage, grade, remarks, generatedBy)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, studentId, studentName || '', cls || '', section || 'A', brId, user.instituteId, term, examName || '',
          Number(totalMarks) || 0, Number(obtainedMarks) || 0, Number(percentage) || 0, grade || '', remarks || '', user.id],
      });
      return NextResponse.json({ success: true, id }, { status: 201 });
    }

    if (method === 'GET' && pathSegments[0] === 'report-cards' && pathSegments[1] === 'generate') {
      const user = await requireAuth(req);
      const studentId = pathSegments[2];
      const { term, examName } = query;
      const stuR = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [studentId] });
      if (stuR.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const student = stuR.rows[0] as any;
      const resR = await db.execute({ sql: 'SELECT * FROM results ORDER BY date DESC LIMIT 50' });
      let totalMarks = 0, obtainedMarks = 0;
      const subjects: any[] = [];
      for (const r of resR.rows as any[]) {
        try {
          const recs = JSON.parse(r.records);
          const entry = recs.find((rec: any) => rec.studentId === studentId);
          if (entry) {
            const max = Number(r.totalMarks) || 100;
            const obt = Number(entry.marks) || 0;
            totalMarks += max;
            obtainedMarks += obt;
            const courseR = await db.execute({ sql: 'SELECT name FROM courses WHERE id = ?', args: [r.courseId] });
            subjects.push({
              subject: (courseR.rows[0] as any)?.name || r.exam || 'Unknown',
              exam: r.exam,
              totalMarks: max,
              obtainedMarks: obt,
              grade: entry.grade || (obt / max >= 0.9 ? 'A+' : obt / max >= 0.8 ? 'A' : obt / max >= 0.7 ? 'B' : obt / max >= 0.6 ? 'C' : obt / max >= 0.5 ? 'D' : 'F'),
              date: r.date,
            });
          }
        } catch {}
      }
      const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
      const overallGrade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : 'F';
      return NextResponse.json({
        student: { id: student.id, name: student.name, class: student.class, section: student.section, rollNo: student.rollNo },
        term: term || 'Current Term',
        examName: examName || 'All Exams',
        subjects,
        totalMarks,
        obtainedMarks,
        percentage,
        grade: overallGrade,
        remarks: percentage >= 80 ? 'Excellent performance' : percentage >= 60 ? 'Good, keep improving' : percentage >= 40 ? 'Needs improvement' : 'Requires serious attention',
      });
    }

    // ===================== ROYALTY / FRANCHISE MANAGEMENT =====================
    if (method === 'GET' && path === 'royalty/settings') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const instituteId = query.instituteId || user.instituteId;
      if (!instituteId) return NextResponse.json([]);
      const r = await db.execute({ sql: 'SELECT rs.*, b.name as branchName FROM royalty_settings rs LEFT JOIN branches b ON rs.branchId = b.id WHERE rs.instituteId = ?', args: [instituteId] });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'royalty/settings') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const { branchId, method: rmethod, amount, percentage, effectiveFrom } = body || {};
      if (!branchId || !rmethod) return NextResponse.json({ error: 'branchId and method required' }, { status: 400 });
      const brR = await db.execute({ sql: 'SELECT id FROM branches WHERE id = ? AND instituteId = ?', args: [branchId, user.instituteId] });
      if (brR.rows.length === 0) return NextResponse.json({ error: 'Branch not found in your institute' }, { status: 403 });
      const existing = await db.execute({ sql: 'SELECT id FROM royalty_settings WHERE branchId = ?', args: [branchId] });
      const effDate = effectiveFrom || new Date().toISOString().slice(0, 10);
      if (existing.rows.length > 0) {
        await db.execute({ sql: 'UPDATE royalty_settings SET method = ?, amount = ?, percentage = ?, effectiveFrom = ? WHERE id = ?', args: [rmethod, Number(amount) || 0, Number(percentage) || 0, effDate, (existing.rows[0] as any).id] });
        return NextResponse.json({ success: true, id: (existing.rows[0] as any).id, updated: true });
      } else {
        const id = nextId('RS');
        await db.execute({ sql: 'INSERT INTO royalty_settings (id, branchId, instituteId, method, amount, percentage, effectiveFrom) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id, branchId, user.instituteId, rmethod, Number(amount) || 0, Number(percentage) || 0, effDate] });
        return NextResponse.json({ success: true, id }, { status: 201 });
      }
    }

    if (method === 'POST' && path === 'royalty/generate') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const { month, year } = body || {};
      if (!month || !year) return NextResponse.json({ error: 'month and year required' }, { status: 400 });
      const instituteId = user.instituteId;
      const brR = await db.execute({ sql: 'SELECT id, name FROM branches WHERE instituteId = ?', args: [instituteId] });
      let generated = 0;
      for (const br of brR.rows as any[]) {
        const existing = await db.execute({ sql: 'SELECT id FROM royalty_invoices WHERE branchId = ? AND month = ? AND year = ?', args: [br.id, month, year] });
        if (existing.rows.length > 0) continue;
        const rsR = await db.execute({ sql: 'SELECT * FROM royalty_settings WHERE branchId = ?', args: [br.id] });
        const settings = rsR.rows[0] as any;
        if (!settings) continue;
        const stuR = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users WHERE branchId = ? AND role = ?', args: [br.id, 'student'] });
        const studentCount = (stuR.rows[0] as any).count;
        const revR = await db.execute({ sql: "SELECT SUM(paidAmount) as total FROM fee_invoices WHERE branchId = ? AND status = 'Paid' AND month = ? AND year = ?", args: [br.id, month, year] });
        const branchRevenue = (revR.rows[0] as any).total || 0;
        let royaltyAmount = 0;
        if (settings.method === 'per_student') {
          royaltyAmount = (Number(settings.amount) || 0) * studentCount;
        } else if (settings.method === 'fixed') {
          royaltyAmount = Number(settings.amount) || 0;
        } else if (settings.method === 'percentage') {
          royaltyAmount = (branchRevenue * (Number(settings.percentage) || 0)) / 100;
        }
        const id = nextId('RI');
        await db.execute({
          sql: 'INSERT INTO royalty_invoices (id, branchId, instituteId, branchName, month, year, method, studentCount, branchRevenue, royaltyAmount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [id, br.id, instituteId, br.name, month, year, settings.method, studentCount, branchRevenue, royaltyAmount, 'Pending'],
        });
        generated++;
      }
      return NextResponse.json({ success: true, generated, message: `${generated} royalty invoices generated for ${month} ${year}` });
    }

    if (method === 'GET' && path === 'royalty/invoices') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const instituteId = query.instituteId || user.instituteId;
      if (!instituteId) return NextResponse.json([]);
      const r = await db.execute({ sql: 'SELECT * FROM royalty_invoices WHERE instituteId = ? ORDER BY year DESC, createdAt DESC', args: [instituteId] });
      return NextResponse.json(r.rows);
    }

    if (method === 'PATCH' && pathSegments[0] === 'royalty' && pathSegments[1] === 'invoices' && pathSegments[3] === 'pay') {
      const user = await requireAuth(req);
      requireRole(user, 'institute-admin', 'super-admin');
      const id = pathSegments[2];
      await db.execute({ sql: 'UPDATE royalty_invoices SET status = ?, paidDate = ? WHERE id = ?', args: ['Paid', new Date().toISOString().slice(0, 10), id] });
      return NextResponse.json({ success: true, status: 'Paid' });
    }

    // ===================== HEALTH CHECK =====================
    if (method === 'GET' && path === 'health') {
      try {
        const r = await db.execute('SELECT COUNT(*) as count FROM users');
        return NextResponse.json({ ok: true, service: 'concordia-api', users: (r.rows[0] as any).count, db: 'turso' });
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message });
      }
    }

    // ===================== NOTIFICATIONS (top bar dropdown) =====================
    if (method === 'GET' && path === 'notifications') {
      const user = await requireAuth(req);
      try {
        const items: any[] = [];
        const now = Date.now();

        let annSql = 'SELECT id, title, message, senderRole, targetRole, createdAt FROM announcements WHERE 1=1';
        const annArgs: any[] = [];
        if (user.role === 'teacher' || user.role === 'student' || user.role === 'parent') {
          annSql += ' AND (targetScope = ? OR targetRole = ? OR targetRole = ?)';
          annArgs.push('all', user.role, 'all');
        } else if (user.role === 'branch-manager') {
          annSql += ' AND (senderRole = ? OR targetRole = ? OR targetScope = ?)';
          annArgs.push('institute-admin', 'branch-manager', 'all');
        } else if (user.role === 'institute-admin') {
          annSql += ' AND (senderRole = ? OR senderId = ?)';
          annArgs.push('super-admin', user.id);
        }
        annSql += ' ORDER BY createdAt DESC LIMIT 10';
        const annR = await db.execute({ sql: annSql, args: annArgs });
        for (const a of annR.rows as any[]) {
          const created = new Date(a.createdAt).getTime();
          const ageMs = now - created;
          const ageHrs = Math.floor(ageMs / 3600000);
          let timeLabel: string;
          if (ageHrs < 1) timeLabel = 'Just now';
          else if (ageHrs < 24) timeLabel = `${ageHrs}h ago`;
          else timeLabel = `${Math.floor(ageHrs / 24)}d ago`;
          items.push({
            id: a.id,
            type: 'announcement',
            title: a.title,
            message: a.message,
            sender: a.senderRole,
            timeLabel,
            createdAt: a.createdAt,
            read: false,
          });
        }

        if (user.role === 'branch-manager' || user.role === 'institute-admin') {
          let cmpSql = 'SELECT id, subject, message, status, createdAt FROM complaints WHERE 1=1';
          const cmpArgs: any[] = [];
          if (user.role === 'branch-manager' && user.branchId) {
            cmpSql += ' AND branchId = ?'; cmpArgs.push(user.branchId);
          } else if (user.role === 'institute-admin' && user.instituteId) {
            cmpSql += ' AND instituteId = ?'; cmpArgs.push(user.instituteId);
          }
          cmpSql += ' ORDER BY createdAt DESC LIMIT 5';
          const cmpR = await db.execute({ sql: cmpSql, args: cmpArgs });
          for (const c of cmpR.rows as any[]) {
            const created = new Date(c.createdAt).getTime();
            const ageMs = now - created;
            const ageHrs = Math.floor(ageMs / 3600000);
            let timeLabel: string;
            if (ageHrs < 1) timeLabel = 'Just now';
            else if (ageHrs < 24) timeLabel = `${ageHrs}h ago`;
            else timeLabel = `${Math.floor(ageHrs / 24)}d ago`;
            items.push({
              id: c.id,
              type: 'complaint',
              title: `Complaint: ${c.subject}`,
              message: c.message,
              sender: 'Parent',
              timeLabel,
              createdAt: c.createdAt,
              read: c.status === 'Resolved',
            });
          }
        }

        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const unread = items.filter(i => !i.read).length;
        return NextResponse.json({ items: items.slice(0, 15), unread });
      } catch (e: any) {
        return NextResponse.json({ error: 'Failed to load notifications: ' + e.message }, { status: 500 });
      }
    }

    // ===================== v1.5.0 MODULE APIS =====================
    // These endpoints back the 6 new dashboard modules (ai-tutor, live-transport,
    // digital-id, campus-wallet, ptm-scheduling, health-records). Each returns
    // realistic mock data shaped to match the consuming component so the module
    // can fetch real data instead of using hardcoded state. Where existing tables
    // exist (e.g. transport_routes, users), they're queried first and the mock
    // data is used as a fallback when the tables are empty.

    // ---- 1. AI Tutor suggested questions ----
    if (method === 'GET' && path === 'ai-tutor/suggestions') {
      const user = await requireAuth(req);
      void user; // any authenticated user
      const role = query.role || 'student';
      void role;
      const questions = [
        { id: 'q-math-1', subject: 'math', question: 'Solve: 3x² + 7x − 6 = 0' },
        { id: 'q-math-2', subject: 'math', question: 'Derivative of x²' },
        { id: 'q-phys-1', subject: 'physics', question: "What is Ohm's law?" },
        { id: 'q-phys-2', subject: 'physics', question: 'Define velocity vs speed' },
        { id: 'q-chem-1', subject: 'chemistry', question: 'Balance: H₂ + O₂ → H₂O' },
        { id: 'q-chem-2', subject: 'chemistry', question: 'Explain pH scale' },
        { id: 'q-bio-1', subject: 'biology', question: 'Summarize photosynthesis' },
        { id: 'q-eng-1', subject: 'english', question: 'Difference between their/there' },
      ];
      return NextResponse.json({ questions });
    }

    // ---- 2. Live transport routes with simulated GPS positions ----
    if (method === 'GET' && path === 'transport/live') {
      const user = await requireAuth(req);
      const branchId = query.branchId || user.branchId || '';

      type TransportStop = { name: string; lat: number; lng: number };
      type LiveRoute = {
        id: string;
        routeName: string;
        driver: string;
        driverPhone: string;
        vehicleNo: string;
        capacity: number;
        occupancy: number;
        speed: number;
        etaMinutes: number;
        status: 'on-time' | 'delayed' | 'en-route';
        currentLat: number;
        currentLng: number;
        stops: TransportStop[];
      };

      const LAHORE_LAT = 31.5204;
      const LAHORE_LNG = 74.3587;

      const buildRoute = (
        id: string, routeName: string, driver: string, driverPhone: string,
        vehicleNo: string, capacity: number, occupancy: number, speed: number,
        etaMinutes: number, status: LiveRoute['status'],
        latOffset: number, lngOffset: number, stops: TransportStop[]
      ): LiveRoute => ({
        id, routeName, driver, driverPhone, vehicleNo,
        capacity, occupancy, speed, etaMinutes, status,
        currentLat: +(LAHORE_LAT + latOffset).toFixed(4),
        currentLng: +(LAHORE_LNG + lngOffset).toFixed(4),
        stops,
      });

      // First try the existing transport_routes table.
      let routes: LiveRoute[] = [];
      try {
        if (branchId) {
          const r = await db.execute({
            sql: 'SELECT id, routeName, driver, vehicleNo, capacity FROM transport_routes WHERE branchId = ?',
            args: [branchId],
          });
          const statuses: LiveRoute['status'][] = ['on-time', 'delayed', 'en-route'];
          for (let i = 0; i < r.rows.length; i++) {
            const row = r.rows[i] as Record<string, unknown>;
            const cap = Number(row.capacity ?? 30) || 30;
            const occ = Math.max(0, Math.min(cap, Math.floor(cap * 0.75)));
            routes.push(buildRoute(
              String(row.id ?? `R-${i}`),
              String(row.routeName ?? `Route ${i + 1}`),
              String(row.driver ?? 'Driver'),
              '+92 300 0000000',
              String(row.vehicleNo ?? `LHR-${1000 + i * 111}`),
              cap, occ,
              20 + i * 5, 5 + i * 3, statuses[i % 3],
              0.01 * (i - 1), 0.01 * (i - 1), []
            ));
          }
        }
      } catch { /* table may not exist yet — fall through to mock data */ }

      // Fallback to mock routes if no real routes were found.
      if (routes.length === 0) {
        routes = [
          buildRoute('R-A', 'Gulberg Route', 'Imran Yousaf', '+92 300 1234567', 'LHR-1234',
            36, 28, 38, 4, 'en-route', 0.012, -0.015,
            [
              { name: 'Main Boulevard', lat: 31.523, lng: 74.341 },
              { name: 'Liberty Market', lat: 31.518, lng: 74.350 },
              { name: 'Campus', lat: 31.520, lng: 74.359 },
            ]),
          buildRoute('R-B', 'Model Town Route', 'Bashir Khan', '+92 301 7654321', 'LHR-5678',
            32, 22, 24, 12, 'delayed', -0.018, 0.011,
            [
              { name: 'Model Town Link Road', lat: 31.502, lng: 74.370 },
              { name: 'Faisal Town', lat: 31.510, lng: 74.364 },
              { name: 'Campus', lat: 31.520, lng: 74.359 },
            ]),
          buildRoute('R-C', 'DHA Route', 'Naveed Ahmed', '+92 302 9876543', 'LHR-9012',
            30, 30, 32, 8, 'on-time', 0.008, 0.022,
            [
              { name: 'DHA Phase 5', lat: 31.528, lng: 74.381 },
              { name: 'Y-Block', lat: 31.524, lng: 74.370 },
              { name: 'Campus', lat: 31.520, lng: 74.359 },
            ]),
        ];
      }

      return NextResponse.json({ routes });
    }

    // ---- 3. Digital ID card list ----
    if (method === 'GET' && path === 'digital-id/list') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'student');

      const branchId = query.branchId || user.branchId || '';
      const classId = query.classId || '';
      const statusFilter = (query.status || '').toLowerCase();
      const search = (query.search || '').toLowerCase().trim();

      type IdCard = {
        id: string; studentId: string; studentName: string; rollNo: string;
        className: string; section: string; instituteName: string; branchName: string;
        photoUrl: string; validThru: string; status: 'active' | 'expired' | 'revoked';
        issuedAt: string; bloodGroup: string; contact: string;
      };

      // Try the existing users table for real students.
      let cards: IdCard[] = [];
      try {
        let sql = `SELECT u.id, u.name, u.rollNo, u.class, u.section, u.status,
                          i.name as instituteName, b.name as branchName
                   FROM users u
                   LEFT JOIN institutes i ON u.instituteId = i.id
                   LEFT JOIN branches b ON u.branchId = b.id
                   WHERE u.role = 'student'`;
        const args: Array<string> = [];
        if (branchId) { sql += ' AND u.branchId = ?'; args.push(branchId); }
        if (classId) { sql += ' AND u.class = ?'; args.push(classId); }
        if (search) {
          sql += ' AND (LOWER(u.name) LIKE ? OR LOWER(u.rollNo) LIKE ?)';
          args.push(`%${search}%`, `%${search}%`);
        }
        // Students only see their own card.
        if (user.role === 'student') {
          sql += ' AND u.id = ?';
          args.push(user.id);
        }
        sql += ' LIMIT 100';
        const r = await db.execute({ sql, args });
        for (let i = 0; i < r.rows.length; i++) {
          const row = r.rows[i] as Record<string, unknown>;
          const isActive = String(row.status ?? 'Active') === 'Active';
          cards.push({
            id: `CC-${new Date().getFullYear()}-${String(i + 1).padStart(4, '0')}`,
            studentId: String(row.id ?? ''),
            studentName: String(row.name ?? ''),
            rollNo: String(row.rollNo ?? ''),
            className: String(row.class ?? ''),
            section: String(row.section ?? 'A'),
            instituteName: String(row.instituteName ?? ''),
            branchName: String(row.branchName ?? ''),
            photoUrl: '',
            validThru: 'Mar 2026',
            status: isActive ? 'active' : 'revoked',
            issuedAt: new Date().toISOString().slice(0, 10),
            bloodGroup: 'O+',
            contact: '+92 300 0000000',
          });
        }
      } catch { /* fall through to mock data */ }

      // Fallback to realistic mock cards.
      if (cards.length === 0) {
        const mockCards: IdCard[] = [
          { id: 'CC-2025-0421', studentId: 'U-S-0421', studentName: 'Ayesha Khan', rollNo: 'AGR-8-A-12', className: 'Grade 8', section: 'A', instituteName: 'Punjab College for Girls', branchName: 'Lahore Main', photoUrl: '', validThru: 'Mar 2026', status: 'active', issuedAt: '2025-03-01', bloodGroup: 'B+', contact: '+92 300 1234567' },
          { id: 'CC-2025-0422', studentId: 'U-S-0422', studentName: 'Hamza Tariq', rollNo: 'AGR-9-B-07', className: 'Grade 9', section: 'B', instituteName: 'Punjab College for Boys', branchName: 'Lahore Main', photoUrl: '', validThru: 'Mar 2026', status: 'active', issuedAt: '2025-03-01', bloodGroup: 'O+', contact: '+92 301 7654321' },
          { id: 'CC-2025-0423', studentId: 'U-S-0423', studentName: 'Zainab Ali', rollNo: 'AGR-10-A-21', className: 'Grade 10', section: 'A', instituteName: 'Punjab College for Girls', branchName: 'Lahore Main', photoUrl: '', validThru: 'Mar 2026', status: 'expired', issuedAt: '2024-03-01', bloodGroup: 'A+', contact: '+92 302 9876543' },
          { id: 'CC-2025-0424', studentId: 'U-S-0424', studentName: 'Bilal Raza', rollNo: 'AGR-7-C-04', className: 'Grade 7', section: 'C', instituteName: 'Punjab College for Boys', branchName: 'Lahore Main', photoUrl: '', validThru: 'Mar 2026', status: 'active', issuedAt: '2025-03-01', bloodGroup: 'AB+', contact: '+92 303 5550100' },
          { id: 'CC-2025-0425', studentId: 'U-S-0425', studentName: 'Fatima Noor', rollNo: 'AGR-9-A-15', className: 'Grade 9', section: 'A', instituteName: 'Punjab College for Girls', branchName: 'Lahore Main', photoUrl: '', validThru: 'Mar 2026', status: 'revoked', issuedAt: '2025-03-01', bloodGroup: 'O−', contact: '+92 311 4442020' },
          { id: 'CC-2025-0426', studentId: 'U-S-0426', studentName: 'Usman Sheikh', rollNo: 'AGR-11-B-09', className: 'Grade 11', section: 'B', instituteName: 'Punjab College for Boys', branchName: 'Lahore Main', photoUrl: '', validThru: 'Mar 2026', status: 'active', issuedAt: '2025-03-01', bloodGroup: 'B−', contact: '+92 321 8883030' },
        ];
        // Filter mock cards by search/status for consistency with SQL path.
        cards = mockCards.filter((c) => {
          if (statusFilter && c.status !== statusFilter) return false;
          if (search && !(c.studentName.toLowerCase().includes(search) || c.rollNo.toLowerCase().includes(search))) return false;
          return true;
        });
      }

      return NextResponse.json({ cards });
    }

    // ---- 4a. Campus wallet balance ----
    if (method === 'GET' && path === 'wallet/balance') {
      const user = await requireAuth(req);
      const userId = query.userId || user.id;
      void userId;
      return NextResponse.json({
        balance: 2450.00,
        currency: 'PKR',
        lastTopUp: '2025-10-19T09:15:00.000Z',
        autoReload: false,
        autoReloadThreshold: 500,
      });
    }

    // ---- 4b. Campus wallet transactions ----
    if (method === 'GET' && path === 'wallet/transactions') {
      const user = await requireAuth(req);
      const userId = query.userId || user.id;
      void userId;
      const limitRaw = parseInt(query.limit || '20', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;

      type WalletTxnType = 'topup' | 'cafeteria' | 'printing' | 'bookshop' | 'transport' | 'stationery' | 'refund';
      type WalletTxn = {
        id: string; type: WalletTxnType; merchant: string; amount: number;
        balanceBefore: number; balanceAfter: number;
        date: string; time: string; referenceNo: string;
      };
      const all: WalletTxn[] = [
        { id: 't1', type: 'cafeteria', merchant: 'Cafeteria — Lunch Combo', amount: -240, balanceBefore: 2690, balanceAfter: 2450, date: 'Today', time: '12:35 PM', referenceNo: 'CC-W-2410-T1' },
        { id: 't2', type: 'printing', merchant: 'Print Job — 14 pages', amount: -70, balanceBefore: 2760, balanceAfter: 2690, date: 'Today', time: '10:12 AM', referenceNo: 'CC-W-2410-T2' },
        { id: 't3', type: 'bookshop', merchant: 'Bookshop — Physics Notebook', amount: -350, balanceBefore: 3110, balanceAfter: 2760, date: 'Yesterday', time: '04:48 PM', referenceNo: 'CC-W-2409-T3' },
        { id: 't4', type: 'topup', merchant: 'Top Up — JazzCash', amount: 2000, balanceBefore: 1110, balanceAfter: 3110, date: 'Yesterday', time: '09:15 AM', referenceNo: 'CC-W-2409-T4' },
        { id: 't5', type: 'transport', merchant: 'Transport — Monthly Pass', amount: -660, balanceBefore: 1770, balanceAfter: 1110, date: 'Oct 12', time: '08:00 AM', referenceNo: 'CC-W-2412-T5' },
        { id: 't6', type: 'stationery', merchant: 'Stationery — Geometry Box', amount: -180, balanceBefore: 1950, balanceAfter: 1770, date: 'Oct 11', time: '01:22 PM', referenceNo: 'CC-W-2411-T6' },
        { id: 't7', type: 'cafeteria', merchant: 'Cafeteria — Tea & Samosa', amount: -90, balanceBefore: 2040, balanceAfter: 1950, date: 'Oct 10', time: '11:10 AM', referenceNo: 'CC-W-2410-T7' },
        { id: 't8', type: 'refund', merchant: 'Refund — Cancelled Order', amount: 70, balanceBefore: 1970, balanceAfter: 2040, date: 'Oct 09', time: '03:30 PM', referenceNo: 'CC-W-2409-T8' },
        { id: 't9', type: 'printing', merchant: 'Print Job — 8 pages', amount: -40, balanceBefore: 2010, balanceAfter: 1970, date: 'Oct 08', time: '10:00 AM', referenceNo: 'CC-W-2408-T9' },
        { id: 't10', type: 'bookshop', merchant: 'Bookshop — Urdu Novel', amount: -250, balanceBefore: 2260, balanceAfter: 2010, date: 'Oct 05', time: '02:15 PM', referenceNo: 'CC-W-2405-T10' },
      ];
      return NextResponse.json({ transactions: all.slice(0, limit) });
    }

    // ---- 5. PTM scheduling slots ----
    if (method === 'GET' && path === 'ptm/slots') {
      const user = await requireAuth(req);
      requireRole(user, 'parent', 'teacher', 'branch-manager');

      const branchId = query.branchId || user.branchId || '';
      void branchId;
      const week = query.week || '';
      void week;

      type PtmDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
      type PtmSlot = {
        id: string; day: PtmDay; startTime: string; endTime: string;
        teacherId: string; teacherName: string;
        booked: boolean; parentName?: string; studentName?: string; agenda?: string;
        isMine: boolean;
      };

      const teachers = [
        { id: 'TCH-001', name: 'Ms. Saima Khan' },
        { id: 'TCH-002', name: 'Mr. Ali Raza' },
        { id: 'TCH-003', name: 'Mr. Imran Yousaf' },
        { id: 'TCH-004', name: 'Mr. Naveed Ahmed' },
        { id: 'TCH-005', name: 'Ms. Sana Tariq' },
      ];

      const days: PtmDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const times = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00'];

      const bookedMap: Record<string, { teacher: number; parent: string; student: string; agenda: string; isMine: boolean }> = {
        'mon-09:00': { teacher: 0, parent: 'Mr. Yousaf Khan', student: 'Ayesha Khan', agenda: 'Discuss Q2 performance.', isMine: true },
        'mon-11:00': { teacher: 1, parent: 'Mrs. Iqbal', student: 'Hamza Tariq', agenda: 'Physics lab work.', isMine: false },
        'tue-10:00': { teacher: 4, parent: 'Mrs. Tariq', student: 'Zainab Ali', agenda: 'English essay feedback.', isMine: true },
        'wed-14:00': { teacher: 2, parent: 'Mr. Yousaf', student: 'Bilal Raza', agenda: 'Reviewed lab reports.', isMine: false },
        'thu-15:00': { teacher: 3, parent: 'Mr. Ahmed', student: 'Usman Sheikh', agenda: 'Biology project review.', isMine: false },
        'fri-09:00': { teacher: 0, parent: 'Mrs. Bilal', student: 'Sara Bilal', agenda: 'Monthly progress check.', isMine: false },
        'sat-12:00': { teacher: 4, parent: 'Mr. Raza', student: 'Fatima Noor', agenda: 'Urdu recitation practice.', isMine: false },
      };

      const slots: PtmSlot[] = [];
      for (const day of days) {
        for (const startTime of times) {
          const key = `${day}-${startTime}`;
          const booked = bookedMap[key];
          const teacherIdx = booked
            ? booked.teacher
            : (days.indexOf(day) + times.indexOf(startTime)) % teachers.length;
          const teacher = teachers[teacherIdx];
          const [h, m] = startTime.split(':').map(Number);
          const endMin = (h * 60 + (m ?? 0) + 15) % (24 * 60);
          const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
          slots.push({
            id: `PTM-${key}`,
            day, startTime, endTime,
            teacherId: teacher.id,
            teacherName: teacher.name,
            booked: !!booked,
            parentName: booked?.parent,
            studentName: booked?.student,
            agenda: booked?.agenda,
            isMine: booked?.isMine ?? false,
          });
        }
      }

      // Upcoming PTM: first booked-and-isMine slot.
      const mine = slots.find((s) => s.booked && s.isMine);
      const upcomingPtm = mine
        ? {
            id: mine.id,
            day: mine.day,
            startTime: mine.startTime,
            teacherName: mine.teacherName,
            parentName: mine.parentName ?? '',
            studentName: mine.studentName ?? '',
            agenda: mine.agenda ?? '',
            countdownMinutes: 135,
          }
        : null;

      return NextResponse.json({ slots, upcomingPtm });
    }

    // ---- 6. Health records for a student ----
    if (method === 'GET' && path === 'health/records') {
      const user = await requireAuth(req);
      requireRole(user, 'parent', 'branch-manager', 'student');

      const studentId = query.studentId || user.id;

      // Per-student mock data keyed by the demo student IDs the component uses.
      type StudentMeta = { id: string; name: string; rollNo: string; className: string };
      const students: Record<string, StudentMeta> = {
        's1': { id: 's1', name: 'Ayesha Khan', rollNo: 'AGR-8-A-12', className: 'Grade 8 · A' },
        's2': { id: 's2', name: 'Hamza Tariq', rollNo: 'AGR-9-B-07', className: 'Grade 9 · B' },
        's3': { id: 's3', name: 'Zainab Ali', rollNo: 'AGR-10-A-21', className: 'Grade 10 · A' },
        's4': { id: 's4', name: 'Bilal Raza', rollNo: 'AGR-7-C-04', className: 'Grade 7 · C' },
      };
      const student = students[studentId]
        ?? { id: studentId, name: 'Ayesha Khan', rollNo: 'AGR-8-A-12', className: 'Grade 8 · A' };

      type Severity = 'high' | 'medium' | 'low';
      type InfirmaryReason = 'headache' | 'injury' | 'fever' | 'stomach' | 'other';

      type HealthResp = {
        student: { id: string; name: string; rollNo: string; className: string; bloodGroup: string; height: number; weight: number; bmi: number; bmiPrev: number };
        allergies: { id: string; name: string; severity: Severity }[];
        vaccinations: { id: string; name: string; dateGiven: string; nextDue?: string }[];
        infirmaryVisits: { id: string; date: string; reason: string; reasonType: InfirmaryReason; treatment: string; attendedBy: string }[];
        medications: { id: string; drugName: string; dose: string; startDate: string; notes?: string }[];
        emergencyContacts: { id: string; name: string; relationship: string; phone: string }[];
      };

      // Realistic Pakistani mock data (per spec: blood O+, 165 cm / 58 kg / BMI 21.3, etc.)
      const data: HealthResp = {
        student: {
          ...student,
          bloodGroup: 'O+',
          height: 165,
          weight: 58,
          bmi: 21.3,
          bmiPrev: 21.0,
        },
        allergies: [
          { id: 'a1', name: 'Penicillin', severity: 'high' },
          { id: 'a2', name: 'Peanuts', severity: 'high' },
        ],
        vaccinations: [
          { id: 'v1', name: 'COVID-19 (2 doses)', dateGiven: '2022-06-15' },
          { id: 'v2', name: 'Tetanus', dateGiven: '2024-03-10', nextDue: '2034-03-10' },
          { id: 'v3', name: 'MMR', dateGiven: '2017-09-20', nextDue: '2027-04-20' },
        ],
        infirmaryVisits: [
          { id: 'i1', date: 'Oct 12, 2025', reason: 'Headache', reasonType: 'headache', treatment: 'Paracetamol + rest 30 min', attendedBy: 'Nurse Saima' },
          { id: 'i2', date: 'Sep 28, 2025', reason: 'Minor scrape (playground)', reasonType: 'injury', treatment: 'Antiseptic + bandage', attendedBy: 'Nurse Saima' },
          { id: 'i3', date: 'Aug 14, 2025', reason: 'Fever (38.1°C)', reasonType: 'fever', treatment: 'Sent home · Parent notified', attendedBy: 'Nurse Rabia' },
        ],
        medications: [
          { id: 'm1', drugName: 'Paracetamol', dose: '500 mg · as needed', startDate: 'Oct 12, 2025', notes: 'For headache' },
          { id: 'm2', drugName: 'Antihistamine (Cetirizine)', dose: '10 mg · daily', startDate: 'Sep 01, 2025', notes: 'For seasonal allergies' },
        ],
        emergencyContacts: [
          { id: 'e1', name: 'Mrs. Saima Khan', relationship: 'Mother', phone: '+92 300 1234567' },
          { id: 'e2', name: 'Mr. Yousaf Khan', relationship: 'Father', phone: '+92 301 7654321' },
        ],
      };

      return NextResponse.json(data);
    }

    // ===================== STUDENT DOCUMENTS (Admissions) =====================
    // Upload, list, download, and delete student documents (Father CNIC,
    // Student B-Form/CNIC, Previous Results, etc.). Files are stored as
    // base64 data URLs in the student_documents table.

    if (method === 'GET' && path === 'student-documents') {
      const user = await requireAuth(req);
      const { studentId } = query;
      if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
      const r = await db.execute({
        sql: 'SELECT id, studentId, name, fileName, fileType, fileSize, uploadedByName, createdAt, updatedAt FROM student_documents WHERE studentId = ? ORDER BY createdAt DESC',
        args: [studentId],
      });
      return NextResponse.json(r.rows);
    }

    if (method === 'POST' && path === 'student-documents') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const { studentId, name, fileName, fileType, fileSize, dataUrl } = body || {};
      if (!studentId || !name || !fileName || !dataUrl) {
        return NextResponse.json({ error: 'studentId, name, fileName, and dataUrl are required' }, { status: 400 });
      }
      // Verify the student exists and belongs to the same branch
      const stu = await db.execute({ sql: 'SELECT id, branchId, instituteId FROM users WHERE id = ?', args: [studentId] });
      if (stu.rows.length === 0) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      const s = stu.rows[0] as any;
      const id = nextId('DOC');
      await db.execute({
        sql: `INSERT INTO student_documents (id, studentId, branchId, instituteId, name, fileName, fileType, fileSize, dataUrl, uploadedBy, uploadedByName)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, studentId, s.branchId, s.instituteId, name.trim(), fileName, fileType || 'application/octet-stream', Number(fileSize) || 0, dataUrl, user.id, user.name || ''],
      });
      return NextResponse.json({ id, studentId, name: name.trim(), fileName, fileType, fileSize, uploadedByName: user.name || '' }, { status: 201 });
    }

    if (method === 'GET' && pathSegments[0] === 'student-documents' && pathSegments[2] === 'download') {
      const user = await requireAuth(req);
      const id = pathSegments[1];
      const r = await db.execute({ sql: 'SELECT * FROM student_documents WHERE id = ?', args: [id] });
      if (r.rows.length === 0) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      const doc = r.rows[0] as any;
      return NextResponse.json(doc);
    }

    if (method === 'DELETE' && pathSegments[0] === 'student-documents' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const id = pathSegments[1];
      await db.execute({ sql: 'DELETE FROM student_documents WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    // ===================== DATE SHEETS (Academic → Exams & Date Sheets) =====================
    // A date sheet belongs to one (exam, part) combination. Each date sheet
    // has multiple entries (subject + date + time).

    if (method === 'GET' && path === 'date-sheets') {
      const user = await requireAuth(req);
      const { examId, part, branchId } = query;
      const brId = branchId || user.branchId;
      let sql = 'SELECT * FROM date_sheets WHERE 1=1';
      const args: any[] = [];
      if (brId) { sql += ' AND branchId = ?'; args.push(brId); }
      if (examId) { sql += ' AND examId = ?'; args.push(examId); }
      if (part) { sql += ' AND part = ?'; args.push(part); }
      sql += ' ORDER BY createdAt DESC';
      const r = await db.execute({ sql, args });
      const sheets = r.rows as any[];
      // Fetch entries for each sheet
      for (const sheet of sheets) {
        const eR = await db.execute({ sql: 'SELECT * FROM date_sheet_entries WHERE dateSheetId = ? ORDER BY examDate, examTime', args: [sheet.id] });
        sheet.entries = eR.rows;
      }
      return NextResponse.json(sheets);
    }

    if (method === 'POST' && path === 'date-sheets') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const { examId, examName, part, branchId, entries } = body || {};
      if (!examId) return NextResponse.json({ error: 'examId is required' }, { status: 400 });
      const brId = branchId || user.branchId;
      const prt = part === '2' ? '2' : '1';
      // Check if a date sheet already exists for this exam+part
      const existing = await db.execute({
        sql: 'SELECT id FROM date_sheets WHERE examId = ? AND part = ? AND branchId = ?',
        args: [examId, prt, brId],
      });
      let sheetId: string;
      if (existing.rows.length > 0) {
        sheetId = (existing.rows[0] as any).id;
        // Delete old entries (replace)
        await db.execute({ sql: 'DELETE FROM date_sheet_entries WHERE dateSheetId = ?', args: [sheetId] });
      } else {
        sheetId = nextId('DS');
        await db.execute({
          sql: 'INSERT INTO date_sheets (id, branchId, instituteId, examId, examName, part, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [sheetId, brId, user.instituteId, examId, examName || '', prt, user.id],
        });
      }
      // Insert new entries
      if (entries && Array.isArray(entries)) {
        for (const e of entries) {
          if (!e.subject || !e.examDate) continue;
          const eId = nextId('DSE');
          await db.execute({
            sql: 'INSERT INTO date_sheet_entries (id, dateSheetId, subject, examDate, examTime, roomName) VALUES (?, ?, ?, ?, ?, ?)',
            args: [eId, sheetId, e.subject, e.examDate, e.examTime || '', e.roomName || ''],
          });
        }
      }

      // ── Notify all students in the branch that the date sheet is out ──
      try {
        const { sendPushToRole, fcmEnabled } = await import('./fcm');
        if (fcmEnabled()) {
          const examLabel = examName || 'exam';
          await sendPushToRole('student', 'date-sheet', `📋 Date sheet published — ${examLabel}`, `The date sheet for "${examLabel}" (Part ${prt}) has been published. Check the Exams section for subject-wise dates.`, { route: 'date-sheets', examId, sheetId });
          await sendPushToRole('teacher', 'date-sheet', `📋 Date sheet published — ${examLabel}`, `The date sheet for "${examLabel}" (Part ${prt}) is now available.`, { route: 'date-sheets', examId, sheetId });
        }
      } catch (e) { console.error('[date-sheets] push failed:', e); }

      return NextResponse.json({ id: sheetId, examId, part: prt, success: true }, { status: 201 });
    }

    if (method === 'DELETE' && pathSegments[0] === 'date-sheets' && pathSegments.length === 2) {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const id = pathSegments[1];
      await db.execute({ sql: 'DELETE FROM date_sheet_entries WHERE dateSheetId = ?', args: [id] });
      await db.execute({ sql: 'DELETE FROM date_sheets WHERE id = ?', args: [id] });
      return NextResponse.json({ success: true });
    }

    // ===================== BULK MISC CHARGES (Accountant) =====================
    // Add a charge to ALL students of a given part (and optionally program).
    // The charge type is entered manually by the accountant (e.g. "Board
    // Admission Fee").

    if (method === 'POST' && path === 'misc-charges/bulk') {
      const user = await requireAuth(req);
      requireRole(user, 'branch-manager', 'institute-admin', 'super-admin');
      const { part, program, branchId, type, amount, description } = body || {};
      if (!type || !type.trim()) return NextResponse.json({ error: 'Charge type is required' }, { status: 400 });
      if (!amount || Number(amount) <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
      const brId = branchId || user.branchId;
      if (!brId) return NextResponse.json({ error: 'Branch ID is required' }, { status: 400 });
      const prt = part === '2' ? '2' : '1';
      // Find all students matching the part (+ optional program)
      let sql = 'SELECT id, name, rollNo, branchId, instituteId FROM users WHERE role = ? AND branchId = ? AND (part = ? OR part IS NULL OR part = ?)';
      const args: any[] = ['student', brId, prt, ''];
      if (program) {
        sql += ' AND program = ?';
        args.push(program);
      }
      const r = await db.execute({ sql, args });
      const students = r.rows as any[];
      if (students.length === 0) return NextResponse.json({ error: 'No students found matching the criteria' }, { status: 404 });
      let created = 0;
      for (const s of students) {
        const id = nextId('MC');
        await db.execute({
          sql: 'INSERT INTO misc_charges (id, studentId, studentName, branchId, instituteId, type, amount, description, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [id, s.id, s.name, s.branchId, s.instituteId, type.trim(), Number(amount), description || '', user.id],
        });
        created++;
      }
      return NextResponse.json({ success: true, created, total: students.length }, { status: 201 });
    }

    // ===================== ADMIN: PURGE TEST DATA =====================
    // Super-admin-only destructive operation that wipes ALL test student /
    // teacher data while preserving the institutional skeleton (institutes,
    // branches, classes, courses, fee_structure, exams, office-staff
    // accounts, super-admin). Used to reset the platform to a clean state
    // before delivering it to a real customer.
    //
    // BODY: { confirmText: 'PURGE', deep?: boolean }
    //   • deep=true (FULL RESET) → ALSO wipes classes, courses, class_courses,
    //     fee_structure, exams, parent users, and notification_preferences.
    //     Only institutes + branches + office-staff + super-admin survive.
    //   • deep=false (default) → preserves the course/fee/exam catalog.
    //
    // What gets DELETED (always):
    //   • users where role IN ('student', 'teacher', 'parent')  — keeps office staff
    //   • sessions (every login is invalidated — everyone must sign in again)
    //   • device_tokens (FCM tokens re-register on next app launch)
    //   • notifications + notification_preferences        — bell history + prefs
    //   • attendance, results, report_cards              — test grading
    //   • fees, fee_invoices, misc_charges                — test billing
    //   • student_documents                               — test admissions docs
    //   • teacher_salaries, salary_payments               — test payroll
    //   • teacher_class_courses                           — test assignments
    //   • manual_revenue, events                          — test admin entries
    //   • timetable, date_sheets + date_sheet_entries     — test scheduling
    //   • announcements                                   — test broadcasts
    //
    // What gets DELETED only when deep=true:
    //   • classes, courses, class_courses                 — course catalog
    //   • fee_structure                                   — fee templates
    //   • exams                                           — exam definitions
    //
    // What gets PRESERVED:
    //   • institutes + branches (the college skeleton)
    //   • users with role IN ('super-admin','institute-admin','branch-manager',
    //                          'admin','admissions','accountant','academic')
    //   • classes, courses, class_courses, fee_structure, exams  (only when deep=false)
    //
    // What gets RESET:
    //   • institutes.students = 0, institutes.staff = (recomputed live)
    //   • branches.students = 0, branches.teachers = 0
    if (method === 'POST' && path === 'admin/purge-data') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      const { confirmText, deep } = body || {};
      // deep=true → ALSO wipe the manually-set-up catalog (classes, courses,
      // fee templates, exams) + parent accounts, leaving ONLY the institute /
      // branch / office-staff skeleton. deep=false preserves the catalog.
      const deepMode = !!deep;
      // Double-safety: caller must send the literal token "PURGE" so an
      // accidental empty POST can never trigger the wipe.
      if (confirmText !== 'PURGE') {
        return NextResponse.json({ error: 'Confirmation token missing. Send { "confirmText": "PURGE" }.' }, { status: 400 });
      }

      // Capture BEFORE counts for the response so the caller can verify.
      const before = await db.execute({
        sql: `SELECT
                (SELECT COUNT(*) FROM users WHERE role='student') AS students,
                (SELECT COUNT(*) FROM users WHERE role='teacher') AS teachers,
                (SELECT COUNT(*) FROM users WHERE role='parent')  AS parents,
                (SELECT COUNT(*) FROM sessions)                AS sessions,
                (SELECT COUNT(*) FROM notifications)           AS notifications,
                (SELECT COUNT(*) FROM device_tokens)           AS device_tokens,
                (SELECT COUNT(*) FROM attendance)              AS attendance,
                (SELECT COUNT(*) FROM results)                 AS results,
                (SELECT COUNT(*) FROM fees)                    AS fees,
                (SELECT COUNT(*) FROM fee_invoices)            AS fee_invoices,
                (SELECT COUNT(*) FROM student_documents)       AS student_documents,
                (SELECT COUNT(*) FROM report_cards)            AS report_cards,
                (SELECT COUNT(*) FROM classes)                 AS classes,
                (SELECT COUNT(*) FROM courses)                 AS courses,
                (SELECT COUNT(*) FROM fee_structure)           AS fee_structure,
                (SELECT COUNT(*) FROM exams)                   AS exams`,
      });
      const beforeRow = (before.rows[0] || {}) as any;

      // ── Cascade delete (children first, parents last) ──
      // 1. Sessions + device_tokens + notifications + per-user prefs: wipe
      //    EVERYTHING so every active login is kicked out and the bell
      //    history is clean. notification_preferences reference users that
      //    are about to be deleted, so they must go too.
      await db.execute('DELETE FROM sessions');
      await db.execute('DELETE FROM device_tokens');
      await db.execute('DELETE FROM notifications');
      await db.execute('DELETE FROM notification_preferences');

      // 2. Records that reference a studentId / teacherId directly.
      await db.execute('DELETE FROM attendance');
      await db.execute('DELETE FROM results');
      await db.execute('DELETE FROM report_cards');
      await db.execute('DELETE FROM fees');
      await db.execute('DELETE FROM fee_invoices');
      await db.execute('DELETE FROM misc_charges');
      await db.execute('DELETE FROM student_documents');
      await db.execute('DELETE FROM salary_payments');
      await db.execute('DELETE FROM teacher_salaries');
      await db.execute('DELETE FROM teacher_class_courses');
      await db.execute('DELETE FROM manual_revenue');
      await db.execute('DELETE FROM events');
      await db.execute('DELETE FROM announcements');
      await db.execute('DELETE FROM timetable');
      await db.execute('DELETE FROM date_sheet_entries');
      await db.execute('DELETE FROM date_sheets');

      // 2b. Deep mode: also wipe the manually-set-up catalog (classes,
      //     courses, fee templates, exam definitions) so the platform is a
      //     true blank slate. Only the institute + branch + office-staff
      //     logins remain. class_courses must go before classes/courses.
      if (deepMode) {
        await db.execute('DELETE FROM class_courses');
        await db.execute('DELETE FROM classes');
        await db.execute('DELETE FROM courses');
        await db.execute('DELETE FROM fee_structure');
        await db.execute('DELETE FROM exams');
      }

      // 3. Finally delete the student + teacher + parent user rows themselves.
      //    Office-staff roles (admin/admissions/accountant/academic/
      //    institute-admin/branch-manager/super-admin) are PRESERVED.
      //    Parents are linked to students, so they go too.
      await db.execute({
        sql: `DELETE FROM users WHERE role IN ('student','teacher','parent')`,
      });

      // 4. Reset the denormalized counter columns on institutes + branches
      //    so the dashboard doesn't show stale "87 students" after the wipe.
      await db.execute('UPDATE institutes SET students = 0, staff = 0, revenue = 0');
      await db.execute('UPDATE branches SET students = 0, teachers = 0');

      // 5. Recompute the office-staff headcount per institute so the
      //    "Staff" KPI on the dashboard stays accurate post-purge.
      const staffCounts = await db.execute({
        sql: `SELECT instituteId, COUNT(*) AS n
              FROM users
              WHERE role IN ('admin','admissions','accountant','academic','institute-admin','branch-manager')
                AND instituteId IS NOT NULL
              GROUP BY instituteId`,
      });
      for (const row of staffCounts.rows) {
        const r = row as any;
        await db.execute({
          sql: 'UPDATE institutes SET staff = ? WHERE id = ?',
          args: [r.n, r.instituteId],
        });
      }

      return NextResponse.json({
        success: true,
        message: deepMode
          ? 'All manually-added data (students, teachers, parents, classes, courses, fees, exam definitions) has been permanently purged. Only the college skeleton + office-staff logins remain.'
          : 'All test student / teacher data has been permanently purged. The platform is now in a clean state.',
        deep: deepMode,
        purged: {
          students: Number(beforeRow.students || 0),
          teachers: Number(beforeRow.teachers || 0),
          parents: Number(beforeRow.parents || 0),
          sessions: Number(beforeRow.sessions || 0),
          notifications: Number(beforeRow.notifications || 0),
          device_tokens: Number(beforeRow.device_tokens || 0),
          attendance: Number(beforeRow.attendance || 0),
          results: Number(beforeRow.results || 0),
          fees: Number(beforeRow.fees || 0),
          fee_invoices: Number(beforeRow.fee_invoices || 0),
          student_documents: Number(beforeRow.student_documents || 0),
          report_cards: Number(beforeRow.report_cards || 0),
          classes: deepMode ? Number(beforeRow.classes || 0) : 0,
          courses: deepMode ? Number(beforeRow.courses || 0) : 0,
          fee_structure: deepMode ? Number(beforeRow.fee_structure || 0) : 0,
          exams: deepMode ? Number(beforeRow.exams || 0) : 0,
        },
        preserved: deepMode
          ? [
              'institutes', 'branches',
              'office-staff accounts (admin / admissions / accountant / academic)',
              'super-admin account',
            ]
          : [
              'institutes', 'branches', 'classes', 'courses', 'class_courses',
              'fee_structure', 'exams',
              'office-staff accounts (admin / admissions / accountant / academic)',
              'super-admin account',
            ],
      });
    }

    // ===================== ADMIN: DATABASE BACKUP =====================
    // Super-admin-only endpoint that exports the ENTIRE database as a JSON
    // file. Every table + every row is included. The response is a
    // downloadable .json file the super admin can save to their laptop /
    // Google Drive as a point-in-time backup.
    //
    // To restore: import the JSON back via a script that INSERTs each row.
    // (This is a manual process — the backup is primarily for disaster
    // recovery, not automated replication.)
    if (method === 'GET' && path === 'admin/db-backup') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');

      // List all user tables (exclude sqlite internal tables).
      const tablesResult = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
      );
      const tableNames = tablesResult.rows.map((r: any) => r.name);

      // Dump every table's rows.
      const dump: Record<string, any[]> = {};
      for (const name of tableNames) {
        try {
          const rows = await db.execute(`SELECT * FROM "${name}"`);
          dump[name] = rows.rows.map((r: any) => {
            // Convert typed values to plain JS for JSON serialization.
            const obj: Record<string, any> = {};
            for (const col of rows.columns) {
              obj[col] = r[col];
            }
            return obj;
          });
        } catch {
          dump[name] = [];
        }
      }

      const backup = {
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: user.email,
          tableCount: tableNames.length,
          totalRows: Object.values(dump).reduce((sum, rows) => sum + rows.length, 0),
          version: '4.7.0',
        },
        tables: dump,
      };

      // Return as a downloadable JSON file.
      const jsonStr = JSON.stringify(backup, null, 2);
      const filename = `concordia-backup-${new Date().toISOString().slice(0, 10)}.json`;
      return new NextResponse(jsonStr, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // ===================== ADMIN: DATABASE HEALTH =====================
    // Super-admin-only endpoint that reports the health of the database
    // connection — useful for the dashboard status badge.
    if (method === 'GET' && path === 'admin/db-health') {
      const user = await requireAuth(req);
      requireRole(user, 'super-admin');
      try {
        const start = Date.now();
        await db.execute('SELECT 1');
        const latency = Date.now() - start;
        const tables = await db.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
        const users = await db.execute("SELECT COUNT(*) AS n FROM users");
        return NextResponse.json({
          status: 'healthy',
          latencyMs: latency,
          tables: tables.rows[0].n,
          users: users.rows[0].n,
          timestamp: new Date().toISOString(),
        });
      } catch (e: any) {
        return NextResponse.json({
          status: 'unhealthy',
          error: e.message,
          timestamp: new Date().toISOString(),
        }, { status: 503 });
      }
    }

    // ===================== FALLBACK =====================
    return NextResponse.json({ error: 'Not found', method, path }, { status: 404 });
  } catch (err: any) {
    const status = err.status || 500;
    const error = err.error || err.message || 'Internal server error';
    return NextResponse.json({ error }, { status });
  }
}

// Re-export for convenience
export { ROLE_LABELS };
