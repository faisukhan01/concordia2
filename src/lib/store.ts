import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type View = 'login' | 'portal';

export type Role = 'super-admin' | 'admin' | 'admissions' | 'accountant' | 'academic' | 'teacher' | 'student' | 'parent' | 'institute-admin' | 'branch-manager';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
  title: string;
  status: string;
  mustChangePassword?: boolean;
  blocked?: boolean;
  blockedMessage?: string;
  instituteId?: string | null;
  instituteName?: string | null;
  instituteShort?: string | null;
  branchId?: string | null;
  branchName?: string | null;
  campus: string;
  subjects?: string[];
  classes?: string[];
  class?: string;
  section?: string;
  rollNo?: string;
  // v4.5.2: Profile photo (data URL from Settings → Profile Photo upload).
  photoUrl?: string | null;
  // v4.5.2: Last-seen timestamp for "online/away" indicator in profile dropdown.
  lastLoginAt?: number | null;
} | null;

type AppState = {
  view: View;
  user: AuthUser;
  token: string | null;
  activeModule: string;
  // When the Academic Office clicks an exam card on the Exams page, we stash
  // the exam name here so the Date Sheet page can pre-fill it. Cleared on
  // consumption / navigation.
  pendingExamName: string | null;
  // v4.6.0: App update availability — set by the update-checker hook.
  // When true, the sidebar "Update App" button shows a badge + bold styling.
  appUpdateAvailable: boolean;
  latestAppVersion: string | null;
  setView: (v: View) => void;
  setUser: (u: AuthUser) => void;
  setToken: (t: string | null) => void;
  setActiveModule: (m: string) => void;
  setPendingExamName: (n: string | null) => void;
  setAppUpdateAvailable: (available: boolean, version?: string | null) => void;
  logout: () => void;
};

// ─────────────────────────────────────────────────────────────────────────
// PERSISTENCE: localStorage (NOT sessionStorage)
// ─────────────────────────────────────────────────────────────────────────
// WhatsApp-style session persistence: the user stays logged in across app
// restarts, phone reboots, and WebView process kills. sessionStorage is wiped
// the moment the WebView closes — which is exactly why the mobile app was
// logging users out whenever they closed the app, and why background FCM
// pushes had no live session to target.
//
// localStorage survives until the user explicitly logs out (or clears app
// data), which is the correct behavior for a college portal. This is also a
// prerequisite for reliable background notifications: the FCM device-token is
// registered to the logged-in user, so the session must persist for pushes to
// keep flowing to the right account.
//
// Multi-tab note: in a browser, two tabs share the same localStorage entry.
// This is fine for this app (single-institution, single-session). The mobile
// app has exactly one WebView so there's no multi-tab concern there at all.
const localStorageAdapter = {
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {}
  },
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      view: 'login',
      user: null,
      token: null,
      activeModule: 'dashboard',
      pendingExamName: null,
      appUpdateAvailable: false,
      latestAppVersion: null,
      setView: (v) => set({ view: v }),
      setUser: (u) => set({ user: u, activeModule: 'dashboard' }),
      setToken: (t) => set({ token: t }),
      setActiveModule: (m) => set({ activeModule: m }),
      setPendingExamName: (n) => set({ pendingExamName: n }),
      setAppUpdateAvailable: (available, version = null) => set({ appUpdateAvailable: available, latestAppVersion: version }),
      logout: () => set({ view: 'login', user: null, token: null, activeModule: 'dashboard', pendingExamName: null, appUpdateAvailable: false, latestAppVersion: null }),
    }),
    {
      name: 'concordia-app',
      storage: createJSONStorage(() => localStorageAdapter),
    }
  )
);
