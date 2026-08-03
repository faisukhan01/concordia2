// Concordia College — FCM bridge (client side)
//
// This module runs INSIDE the web app (inside the WebView). It bridges the
// native Flutter shell (which holds the FCM token) with the backend (which
// needs the token to send pushes).
//
// ROBUSTNESS STRATEGY:
// The original implementation relied on Flutter PUSHING the token to the web
// app at the exact moment `onToken` was registered. This caused a race
// condition: if Flutter got the token before React mounted, the token was
// silently dropped. The fix below uses THREE complementary mechanisms:
//
//   1. PUSH:   Flutter calls `window.concordiaNative.onToken(token)` — handled.
//   2. PULL:   The web app calls `window.concordiaNative.requestToken()` to
//              ASK Flutter for the token on demand (via a MethodChannel).
//   3. POLL:   A background loop checks for `fcmToken` every 2s for 60s,
//              so even if Flutter is slow to deliver, we eventually pick it up.
//
// When NOT running inside the native app (i.e. a regular browser tab), this
// module is a no-op — the web app still works, just without push notifications.

import { api } from '@/lib/api';
import { useApp } from '@/lib/store';

let _registered = false;
let _lastToken: string | null = null;
let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _pollAttempts = 0;
const MAX_POLL_ATTEMPTS = 30; // 30 × 2s = 60s

/** Register a token with the backend, linked to the logged-in user. */
async function registerTokenWithBackend(token: string) {
  if (!token || token === _lastToken) return; // de-dupe
  // Only register if the user is logged in. Otherwise hold the token —
  // the retry loop + post-login refresh will pick it up after login.
  const user = useApp.getState().user;
  const apiToken = useApp.getState().token;
  if (!user || !apiToken) {
    return;
  }
  _lastToken = token;
  try {
    await api.registerDeviceToken(token, 'android');
    console.info('[fcm] device token registered with backend for user', user.id);
    // Stop the poll loop once we've successfully registered.
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
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

/** Start the background poll loop (called once after the bridge is wired). */
function startTokenPoll() {
  if (_pollTimer) return; // already polling
  _pollAttempts = 0;
  _pollTimer = setInterval(async () => {
    _pollAttempts++;
    // Try sync read first.
    let token = getTokenFromNative();
    // Then try async pull from Flutter.
    if (!token) {
      token = await requestTokenFromFlutter();
    }
    if (token) {
      await registerTokenWithBackend(token);
    }
    // Stop after 60s regardless — we don't want to poll forever.
    if (_pollAttempts >= MAX_POLL_ATTEMPTS) {
      if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
      }
      // If we never got a token, log it for debugging.
      if (!_lastToken) {
        const w = window as any;
        console.warn('[fcm] no token after 60s of polling. concordiaNative =', {
          exists: !!w.concordiaNative,
          isNativeApp: w.concordiaNative?.isNativeApp,
          hasFcmToken: !!w.concordiaNative?.fcmToken,
          hasGetToken: typeof w.concordiaNative?.getToken,
          hasRequestTokenAsync: typeof w.concordiaNative?.requestTokenAsync,
        });
      }
    }
  }, 2000);
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

  // PULL mechanism: expose a function Flutter can call to ASK for the token.
  // (Flutter sets this to a wrapper around its MethodChannel.)
  // We also use it ourselves in requestTokenFromFlutter().

  // If the native shell already pushed a token before we registered the
  // handler (race condition), pick it up now.
  if (w.concordiaNative.fcmToken) {
    registerTokenWithBackend(w.concordiaNative.fcmToken);
  }

  // Start the background poll — this is the safety net that catches the token
  // no matter when Flutter delivers it.
  startTokenPoll();
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
 * This also kicks off a fresh pull from Flutter in case the token wasn't
 * delivered yet.
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
  // 3. Always restart the poll loop as a safety net — it will keep trying
  //    for 60s and then stop on its own.
  startTokenPoll();
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
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
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
  };
}
