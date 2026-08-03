// Concordia College — FCM bridge (client side)
//
// This module runs INSIDE the web app (inside the WebView). It listens for
// FCM tokens + notification-tap events that the native Flutter shell injects
// via window.concordiaNative, and calls the API to register the token.
//
// When NOT running inside the native app (i.e. a regular browser tab), this
// module is a no-op — the web app still works, just without push notifications.

import { api } from '@/lib/api';
import { useApp } from '@/lib/store';

let _registered = false;
let _lastToken: string | null = null;

/** Register a token with the backend, linked to the logged-in user. */
async function registerTokenWithBackend(token: string) {
  if (token === _lastToken) return; // de-dupe
  _lastToken = token;
  try {
    await api.registerDeviceToken(token, 'android');
    console.info('[fcm] device token registered with backend');
  } catch (e) {
    console.error('[fcm] failed to register device token:', e);
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

  // Register a handler that the native shell calls when it has a token.
  w.concordiaNative.onToken = (token: string) => {
    // Only register if the user is logged in. If not, hold the token and
    // wait — the native shell re-injects it on every page load, so once the
    // user signs in and the portal mounts, we'll get it again.
    const user = useApp.getState().user;
    const apiToken = useApp.getState().token;
    if (user && apiToken) {
      registerTokenWithBackend(token);
    }
  };

  // Register a handler that the native shell calls when the user taps a
  // notification. We navigate to the right page based on the `route` data.
  w.concordiaNative.onNotificationTap = (data: any) => {
    if (!data || typeof data !== 'object') return;
    const route = data.route;
    if (!route) return;
    // Use the store to set the active module / view.
    const setActiveModule = useApp.getState().setActiveModule;
    const setView = useApp.getState().setView;
    setView('portal');
    // Map notification route -> module id.
    // The module ids follow the pattern '<portal>:<module>' (e.g. 'academic:academic-exams').
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
        // Open the download page so the user can update the app.
        // The notification's data.url points to the /download page.
        if (data.url) {
          window.location.href = data.url;
        } else {
          window.location.href = 'https://concordia-colleges.vercel.app/download';
        }
        break;
      case 'notifications':
        // Open the notifications panel (bell icon click is handled by the header).
        // Dispatch a custom event the header listens for.
        window.dispatchEvent(new CustomEvent('concordia:open-notifications'));
        break;
      default:
        // Unknown route — just make sure we're on the portal.
        break;
    }
  };

  // If the native shell already pushed a token before we registered the
  // handler (race condition), pick it up now.
  if (w.concordiaNative.fcmToken) {
    w.concordiaNative.onToken(w.concordiaNative.fcmToken);
  }
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
 */
export function refreshFcmTokenAfterLogin() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.concordiaNative?.fcmToken) {
    registerTokenWithBackend(w.concordiaNative.fcmToken);
  }
}

/** Unregister the device token on logout. */
export async function unregisterFcmToken() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.concordiaNative?.fcmToken) {
    try {
      await api.unregisterDeviceToken(w.concordiaNative.fcmToken);
    } catch (e) {
      // best-effort — don't block logout
    }
    _lastToken = null;
  }
}
