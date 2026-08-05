'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/store';
import { api } from '@/lib/api';
import { getFcmBridgeDiagnostics } from '@/lib/fcm-bridge';

// ─────────────────────────────────────────────────────────────────────────
// v4.6.0: Silent app-update checker.
//
// WHY: Previously, the backend's `app/version-check` endpoint would SEND A
// PUSH NOTIFICATION every 24h when the user's app was outdated. The user
// found this annoying ("multiple times the notifications comes to update app").
//
// NEW BEHAVIOR:
//   • The web app checks the latest version silently via the new
//     `app/update-status` endpoint (no push notification created).
//   • If an update is available, the sidebar "Update App" button gets a
//     bold style + "Update Available" badge.
//   • The user taps the button to go to the /download page — no push spam.
//
// This runs on mount + every 10 minutes while the app is open.
// ─────────────────────────────────────────────────────────────────────────

export function useAppUpdateChecker() {
  const token = useApp((s) => s.token);
  const setAppUpdateAvailable = useApp((s) => s.setAppUpdateAvailable);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const check = async () => {
      try {
        // Get the current app version from the native bridge (if running
        // inside the Flutter WebView). In a regular browser, this is null
        // and we skip the check (browser users always have the "latest").
        const diag = getFcmBridgeDiagnostics();
        const currentVersion = (diag as any)?.appVersion || null;
        if (!currentVersion) {
          // Not running in the native app — no update check needed.
          setAppUpdateAvailable(false, null);
          return;
        }

        const res = await api.getAppUpdateStatus(currentVersion);
        if (!cancelled) {
          setAppUpdateAvailable(res.updateAvailable, res.latest);
        }
      } catch {
        // Silent failure — don't bother the user with errors.
      }
    };

    check();
    // Re-check every 10 minutes (in case the user keeps the app open for
    // a long time and a new version is released mid-session).
    const interval = setInterval(check, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, setAppUpdateAvailable]);
}
