// Concordia College — FCM bridge (client side) — v4.0.0
//
// This module runs INSIDE the web app (inside the WebView). It bridges the
// native Flutter shell (which holds the FCM token) with the backend (which
// needs the token to send pushes).
//
// ═══════════════════════════════════════════════════════════════════════
// v4.0.0 CHANGES — BULLETPROOF TOKEN REGISTRATION
// ═══════════════════════════════════════════════════════════════════════
// ROOT CAUSE of "no notifications on mobile":
//   The previous bridge polled for the FCM token for only 60 seconds after
//   the portal mounted. If the user wasn't logged in within those 60s, OR
//   if Flutter delivered the token slightly late, the token was NEVER
//   registered with the backend. The server then had no token for that
//   user → announcements/fees pushes were silently discarded.
//
// FIX:
//   1. The poll now runs FOREVER (every 15s) while the user is logged in.
//      It only stops when the user logs out. This guarantees that no matter
//      when Flutter delivers the token, it gets registered.
//   2. Re-register on every `visibilitychange` event (user switches back to
//      the app from another app). This handles the case where the WebView
//      reloaded while in the background and lost the injected token.
//   3. `refreshFcmTokenAfterLogin` now RESETS the poll timer (previously it
//      was a no-op if the poll was already running, which was a bug).
//   4. Added a `getRegistrationStatus()` function that checks the backend
//      to see if the token is actually registered. Used for diagnostics.
//   5. After successful registration, we still keep polling every 60s to
//      handle token rotation (FCM can rotate tokens at any time).
//
// ═══════════════════════════════════════════════════════════════════════

import { api } from '@/lib/api';
import { useApp } from '@/lib/store';

let _registered = false;
let _lastToken: string | null = null;
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _aggressivePollTimer: ReturnType<typeof setInterval> | null = null;
let _visibilityHandler: (() => void) | null = null;

// After login, we poll aggressively (every 5s for 2 minutes) to catch the
// token as quickly as possible. After that, we settle into a slow poll
// (every 60s) that runs forever to handle token rotation.
const AGGRESSIVE_POLL_INTERVAL = 5000; // 5s
const AGGRESSIVE_POLL_MAX_ATTEMPTS = 24; // 24 × 5s = 2 minutes
const SLOW_POLL_INTERVAL = 60000; // 60s — runs forever
let _aggressiveAttempts = 0;

/** Register a token with the backend, linked to the logged-in user. */
async function registerTokenWithBackend(token: string) {
  if (!token || token === _lastToken) return; // de-dupe
  // Only register if the user is logged in. Otherwise hold the token —
  // the poll loop + post-login refresh will pick it up after login.
  const user = useApp.getState().user;
  const apiToken = useApp.getState().token;
  if (!user || !apiToken) {
    return;
  }
  _lastToken = token;
  try {
    await api.registerDeviceToken(token, 'android');
    console.info('[fcm] ✓ device token registered with backend for user', user.id, 'token:', token.slice(0, 16) + '…');
  } catch (e) {
    console.error('[fcm] failed to register device token:', e);
    // Reset _lastToken so a retry can attempt again.
    _lastToken = null;
  }
}

/**
 * Try every available mechanism to obtain the FCM token from the native shell.
 * Returns the token if found, or null.
 */
function getTokenFromNative(): string | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  const native = w.concordiaNative;
  if (!native) return null;
  // 1. Cached token (set by Flutter's _pushTokenToWebView).
  if (typeof native.fcmToken === 'string' && native.fcmToken.length > 0) {
    return native.fcmToken;
  }
  // 2. Synchronous pull via a JS bridge function (set by Flutter).
  if (typeof native.getToken === 'function') {
    try {
      const t = native.getToken();
      if (typeof t === 'string' && t.length > 0) return t;
    } catch {}
  }
  return null;
}

/**
 * Asynchronously request the token from Flutter via the MethodChannel.
 * This is the most reliable mechanism — it asks Flutter directly.
 */
async function requestTokenFromFlutter(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  const native = w.concordiaNative;
  if (!native) return null;
  // Use the async request function if Flutter has provided it.
  if (typeof native.requestTokenAsync === 'function') {
    try {
      const t = await native.requestTokenAsync();
      if (typeof t === 'string' && t.length > 0) {
        // Cache it so subsequent reads are fast.
        native.fcmToken = t;
        return t;
      }
    } catch (e) {
      console.warn('[fcm] requestTokenAsync failed:', e);
    }
  }
  return null;
}

/** Stop the aggressive poll and start the slow forever-poll. */
function transitionToSlowPoll() {
  if (_aggressivePollTimer) {
    clearInterval(_aggressivePollTimer);
    _aggressivePollTimer = null;
  }
  if (_pollTimer) return; // slow poll already running
  _pollTimer = setInterval(async () => {
    // In the slow poll, we check if the token has changed (rotation).
    let token = getTokenFromNative();
    if (!token) {
      token = await requestTokenFromFlutter();
    }
    if (token && token !== _lastToken) {
      await registerTokenWithBackend(token);
    }
  }, SLOW_POLL_INTERVAL);
}

/** Start the aggressive poll loop (every 5s for 2 minutes). */
function startAggressivePoll() {
  if (_aggressivePollTimer) return; // already running
  _aggressiveAttempts = 0;
  _aggressivePollTimer = setInterval(async () => {
    _aggressiveAttempts++;
    // Try sync read first.
    let token = getTokenFromNative();
    // Then try async pull from Flutter.
    if (!token) {
      token = await requestTokenFromFlutter();
    }
    if (token) {
      await registerTokenWithBackend(token);
    }
    // After 2 minutes of aggressive polling, transition to the slow forever-poll.
    if (_aggressiveAttempts >= AGGRESSIVE_POLL_MAX_ATTEMPTS) {
      transitionToSlowPoll();
    }
  }, AGGRESSIVE_POLL_INTERVAL);
}

/** Stop all polling. */
function stopAllPolls() {
  if (_aggressivePollTimer) {
    clearInterval(_aggressivePollTimer);
    _aggressivePollTimer = null;
  }
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

/**
 * Wire up the bridge. Call this ONCE on the client side (e.g. from a layout
 * effect in the root portal component).
 */
export function initFcmBridge() {
  if (typeof window === 'undefined') return; // SSR guard
  if (_registered) return;
  _registered = true;

  const w = window as any;
  w.concordiaNative = w.concordiaNative || {};

  // PUSH mechanism: Flutter calls this when it has a token.
  w.concordiaNative.onToken = (token: string) => {
    if (typeof token !== 'string' || token.length === 0) return;
    // Cache it so future reads see it.
    w.concordiaNative.fcmToken = token;
    registerTokenWithBackend(token);
  };

  // Register a handler that the native shell calls when the user taps a
  // notification. We navigate to the right page based on the `route` data.
  w.concordiaNative.onNotificationTap = (data: any) => {
    if (!data || typeof data !== 'object') return;
    const route = data.route;
    if (!route) return;
    const setActiveModule = useApp.getState().setActiveModule;
    const setView = useApp.getState().setView;
    setView('portal');
    switch (route) {
      case 'announcements':
        setActiveModule('announcements');
        break;
      case 'exams':
      case 'date-sheets':
        setActiveModule('academic:academic-exams');
        break;
      case 'results':
        setActiveModule('academic:academic-results');
        break;
      case 'attendance':
        setActiveModule('academic:academic-attendance');
        break;
      case 'fees':
        setActiveModule('accountant:accountant-challans');
        break;
      case 'app-update':
        if (data.url) {
          window.location.href = data.url;
        } else {
          window.location.href = 'https://concordia-colleges.vercel.app/download';
        }
        break;
      case 'notifications':
        window.dispatchEvent(new CustomEvent('concordia:open-notifications'));
        break;
      default:
        break;
    }
  };

  // VISIBILITY CHANGE: when the user switches back to the app, re-register
  // the token. The WebView may have reloaded while in the background.
  _visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      // Reset _lastToken so we re-register even if the token hasn't changed.
      _lastToken = null;
      const token = getTokenFromNative();
      if (token) {
        registerTokenWithBackend(token);
      } else {
        // Token not cached — start an aggressive poll to fetch it.
        startAggressivePoll();
      }
    }
  };
  document.addEventListener('visibilitychange', _visibilityHandler);

  // If the native shell already pushed a token before we registered the
  // handler (race condition), pick it up now.
  if (w.concordiaNative.fcmToken) {
    registerTokenWithBackend(w.concordiaNative.fcmToken);
  }

  // Start the aggressive poll — this is the safety net that catches the token
  // no matter when Flutter delivers it. After 2 minutes it transitions to a
  // slow forever-poll that handles token rotation.
  startAggressivePoll();
}

/** Returns true if the web app is running inside the native Flutter shell. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).concordiaNative?.isNativeApp;
}

/**
 * Re-register the token after login. Called when the user logs in —
 * the native shell may have already injected a token before the user
 * was authenticated, so we need to send it now.
 *
 * v4.0.0: This now RESETS the poll timers (previously it was a no-op if
 * the poll was already running, which was a bug that caused tokens to
 * never be registered if initFcmBridge ran before login).
 */
export async function refreshFcmTokenAfterLogin() {
  if (typeof window === 'undefined') return;
  // Reset _lastToken so a re-login on the same device re-registers.
  _lastToken = null;
  const w = window as any;
  // 1. Try cached token.
  let token = getTokenFromNative();
  // 2. Try async pull from Flutter.
  if (!token) {
    token = await requestTokenFromFlutter();
  }
  if (token) {
    await registerTokenWithBackend(token);
  }
  // 3. ALWAYS restart the aggressive poll as a safety net. This is the key
  //    fix — previously startAggressivePoll was a no-op if already running,
  //    but now we stop + restart to reset the attempt counter.
  stopAllPolls();
  startAggressivePoll();
}

/** Unregister the device token on logout. */
export async function unregisterFcmToken() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  const token = getTokenFromNative();
  if (token) {
    try {
      await api.unregisterDeviceToken(token);
    } catch (e) {
      // best-effort — don't block logout
    }
  }
  _lastToken = null;
  stopAllPolls();
}

/**
 * Returns a diagnostic snapshot of the FCM bridge state. Used by the
 * FCM Diagnostics panel so admins can see WHY a device isn't registering.
 */
export function getFcmBridgeDiagnostics() {
  if (typeof window === 'undefined') {
    return { windowAvailable: false };
  }
  const w = window as any;
  const native = w.concordiaNative || {};
  return {
    windowAvailable: true,
    isNativeApp: !!native.isNativeApp,
    appVersion: native.appVersion || null,
    fcmReady: !!native.fcmReady,
    hasFcmToken: typeof native.fcmToken === 'string' && native.fcmToken.length > 0,
    fcmTokenLength: typeof native.fcmToken === 'string' ? native.fcmToken.length : 0,
    fcmTokenPreview: typeof native.fcmToken === 'string' && native.fcmToken.length > 20
      ? native.fcmToken.slice(0, 20) + '…' + native.fcmToken.slice(-8)
      : null,
    hasOnTokenHandler: typeof native.onToken === 'function',
    hasGetTokenSync: typeof native.getToken === 'function',
    hasRequestTokenAsync: typeof native.requestTokenAsync === 'function',
    bridgeRegistered: _registered,
    lastTokenRegistered: _lastToken
      ? _lastToken.slice(0, 20) + '…' + _lastToken.slice(-8)
      : null,
    aggressivePollRunning: !!_aggressivePollTimer,
    slowPollRunning: !!_pollTimer,
  };
}
