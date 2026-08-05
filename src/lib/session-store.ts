// Concordia College — session storage adapter
//
// ═══════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — multi-tab portal isolation (v4.6.3)
// ═══════════════════════════════════════════════════════════════════════
// PROBLEM:
//   The auth/view state (which portal you're in + your logged-in user) was
//   persisted to localStorage under the `concordia-app` key. localStorage is
//   SHARED across every browser tab. So if you opened the Admin portal in
//   tab A, then opened the Teacher portal in tab B, tab B's login overwrote
//   the shared entry. Refreshing tab A then loaded tab B's session → the
//   Admin portal silently switched to the Teacher portal.
//
// FIX:
//   • In a regular browser → use sessionStorage. It is scoped PER TAB (each
//     tab keeps its own portal/user) but survives refresh and in-tab
//     navigation, so reloading a tab keeps that tab's portal.
//   • In the native mobile app → keep using localStorage. The mobile app is
//     a single WebView (no multi-tab concern), and localStorage survives
//     app kills / phone reboots, which is required for reliable background
//     FCM push delivery (the device token is registered to the logged-in
//     user, so the session must persist).
//
// MIGRATION:
//   On first load of the new build in a browser, if sessionStorage is empty
//   but the old localStorage `concordia-app` entry exists, copy it across so
//   existing users aren't logged out by the upgrade. The localStorage entry
//   is left in place (harmless — the store now reads sessionStorage) and gets
//   cleaned up on the next logout.
// ═══════════════════════════════════════════════════════════════════════

export const SESSION_KEY = 'concordia-app';

/**
 * Detect whether we're running inside the native Flutter WebView.
 *
 * This MUST be available synchronously at module-load time (the Zustand
 * persist middleware reads storage during store creation, which happens when
 * the JS bundle first evaluates — BEFORE `onPageFinished` fires). So we can't
 * rely on `window.concordiaNative.isNativeApp` alone (that flag is injected
 * in `onPageFinished`). Instead we layer three independent signals:
 *
 *   1. The `concordiaFcmRequest` JS channel — injected by webview_flutter's
 *      `addJavaScriptChannel()` BEFORE any page scripts run. Available at
 *      first JS execution. (Primary signal.)
 *   2. `window.concordiaNative.isNativeApp` — set in `onPageFinished`.
 *      (Backup for older mobile builds / later in the lifecycle.)
 *   3. A `ConcordiaNative` marker in the User-Agent — set via
 *      `setUserAgent()` in the WebView controller config. Available from the
 *      very first JS execution and 100% reliable. (Belt-and-suspenders.)
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  // 1. JS channel (injected before page scripts run).
  if (typeof w.concordiaFcmRequest !== 'undefined') return true;
  // 2. Native bridge flag (set in onPageFinished — later lifecycle).
  if (w.concordiaNative?.isNativeApp) return true;
  // 3. User-Agent marker (most reliable — set at WebView config time).
  if (typeof navigator !== 'undefined' && /ConcordiaNative/.test(navigator.userAgent)) return true;
  return false;
}

/**
 * Pick the right Web Storage object for this environment.
 * - Native app → localStorage (persists across app restarts).
 * - Browser → sessionStorage (per-tab isolation).
 */
function pickStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return isNativeApp() ? window.localStorage : window.sessionStorage;
  } catch {
    // Some browsers throw on storage access in private mode / with cookies
    // disabled. Fall back to an in-memory shim so the app doesn't crash.
    return null;
  }
}

// ── In-memory fallback (private mode / storage disabled) ─────────────────
// When localStorage/sessionStorage throw, we degrade to a Map so the app
// still works for the current page lifetime (just no persistence).
const _memStore = new Map<string, string>();
const memoryShim: Storage = {
  get length() { return _memStore.size; },
  clear() { _memStore.clear(); },
  getItem(k: string) { return _memStore.has(k) ? _memStore.get(k)! : null; },
  key(i: number) { return Array.from(_memStore.keys())[i] ?? null; },
  removeItem(k: string) { _memStore.delete(k); },
  setItem(k: string, v: string) { _memStore.set(k, v); },
};

function store(): Storage {
  return pickStore() ?? memoryShim;
}

// ── One-time migration: localStorage → sessionStorage (browser only) ─────
// Runs at module load. Copies the old shared entry into per-tab storage so
// existing users keep their session through the upgrade.
if (typeof window !== 'undefined' && !isNativeApp()) {
  try {
    const inSession = window.sessionStorage.getItem(SESSION_KEY);
    const inLocal = window.localStorage.getItem(SESSION_KEY);
    if (!inSession && inLocal) {
      window.sessionStorage.setItem(SESSION_KEY, inLocal);
      // Intentionally do NOT remove the localStorage entry here: removing it
      // would log out other tabs that haven't reloaded yet. Each tab migrates
      // on its own next reload. The stale entry is harmless (the store reads
      // sessionStorage) and gets cleared on the next logout.
    }
  } catch {
    // Storage access blocked — nothing to migrate, carry on.
  }
}

/** Read the raw persisted session JSON string (or null). */
export function readSession(): string | null {
  try {
    return store().getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Write the raw session JSON string. */
export function writeSession(value: string): void {
  try {
    store().setItem(SESSION_KEY, value);
  } catch {
    // best-effort
  }
}

/**
 * Remove the session from BOTH storages.
 *
 * In the browser the live session lives in sessionStorage (per-tab), but a
 * stale localStorage entry may linger from before the v4.6.3 upgrade (or from
 * the migration step above). Clearing both guarantees a full logout and
 * prevents any chance of a half-migrated session resurrecting.
 *
 * In the native app only localStorage is used, so this clears it directly.
 */
export function clearSession(): void {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
  try { window.localStorage.removeItem(SESSION_KEY); } catch {}
  _memStore.delete(SESSION_KEY);
}

/**
 * Extract the bearer auth token from the persisted session.
 * Used by the API client (api.ts) to authenticate requests without going
 * through the React render cycle (avoids stale-closure issues).
 */
export function readSessionToken(): string | null {
  const raw = readSession();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}
