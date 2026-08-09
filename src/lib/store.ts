import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { readSession, writeSession, clearSession } from '@/lib/session-store';

export type View = 'login' | 'portal';

// A generic per-view navigation blob (e.g. a portal's drill-down state:
// { dept, part, cls, section }). Keyed by a stable string (usually the module
// id). Stored globally so page.tsx can mirror it into the URL + browser
// history — that's what makes the Back button step through drill levels.
export type NavState = Record<string, unknown>;

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
  // When the Accountant finishes the New Enrollments wizard (challan generated),
  // we stash the processed student's id here so the Fee & Installments page can
  // drill straight to that student's record. Cleared on consumption / navigation.
  feeFocusStudentId: string | null;
  // Per-view drill/navigation state (see NavState). Mirrored to the URL.
  nav: NavState;
  // v4.6.0: App update availability — set by the update-checker hook.
  // When true, the sidebar "Update App" button shows a badge + bold styling.
  appUpdateAvailable: boolean;
  latestAppVersion: string | null;
  setView: (v: View) => void;
  setUser: (u: AuthUser) => void;
  setToken: (t: string | null) => void;
  setActiveModule: (m: string) => void;
  setPendingExamName: (n: string | null) => void;
  setFeeFocusStudentId: (id: string | null) => void;
  setNav: (key: string, value: unknown | ((prev: unknown) => unknown)) => void;
  setNavAll: (nav: NavState) => void;
  setAppUpdateAvailable: (available: boolean, version?: string | null) => void;
  logout: () => void;
};

// ─────────────────────────────────────────────────────────────────────────
// PERSISTENCE — per-tab in browser, cross-restart in mobile app (v4.6.3)
// ─────────────────────────────────────────────────────────────────────────
// PROBLEM (v4.6.2 and earlier):
//   The whole app state lived in localStorage under `concordia-app`.
//   localStorage is shared across all browser tabs, so opening the Admin
//   portal in tab A and the Teacher portal in tab B overwrote the shared
//   entry — refreshing tab A then loaded tab B's portal. See
//   `src/lib/session-store.ts` for the full diagnosis.
//
// FIX:
//   • Browser → sessionStorage. Per-tab (each tab keeps its own portal/user),
//     survives refresh, cleared on tab close. This is the correct behaviour
//     for a multi-tab web session.
//   • Mobile app → localStorage. The mobile app is a single WebView (no
//     multi-tab concern), and localStorage survives app kills / phone reboots,
//     which is a prerequisite for reliable background FCM push delivery (the
//     device token is registered to the logged-in user, so the session must
//     persist).
//
// The adapter below delegates to session-store.ts, which picks the right
// storage based on `isNativeApp()` and handles one-time migration of any
// legacy localStorage entry into sessionStorage.
const sessionAdapter = {
  getItem: (_name: string) => readSession(),
  setItem: (_name: string, value: string) => writeSession(value),
  removeItem: (_name: string) => clearSession(),
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      view: 'login',
      user: null,
      token: null,
      activeModule: 'dashboard',
      pendingExamName: null,
      feeFocusStudentId: null,
      nav: {},
      appUpdateAvailable: false,
      latestAppVersion: null,
      setView: (v) => set({ view: v }),
      setUser: (u) => set({ user: u, activeModule: 'dashboard' }),
      setToken: (t) => set({ token: t }),
      setActiveModule: (m) => set({ activeModule: m }),
      setPendingExamName: (n) => set({ pendingExamName: n }),
      setFeeFocusStudentId: (id) => set({ feeFocusStudentId: id }),
      setNav: (key, value) => set((s) => {
        const prev = s.nav[key];
        const next = typeof value === 'function' ? (value as (p: unknown) => unknown)(prev) : value;
        return { nav: { ...s.nav, [key]: next } };
      }),
      setNavAll: (nav) => set({ nav: nav || {} }),
      setAppUpdateAvailable: (available, version = null) => set({ appUpdateAvailable: available, latestAppVersion: version }),
      logout: () => set({ view: 'login', user: null, token: null, activeModule: 'dashboard', pendingExamName: null, feeFocusStudentId: null, nav: {}, appUpdateAvailable: false, latestAppVersion: null }),
    }),
    {
      name: 'concordia-app',
      storage: createJSONStorage(() => sessionAdapter),
    }
  )
);

// ─────────────────────────────────────────────────────────────
// useNavState — a drop-in replacement for useState that stores the value in
// the global `nav` slice under `key`, so page.tsx can mirror it into the URL
// and browser history. This is what makes the Back button step through a
// portal's drill levels (Department → Part → Class → Section) instead of
// leaving the page.
//
// Usage (identical API to useState, incl. functional updates):
//   const [drill, setDrill] = useNavState('admissions-students', EMPTY_DRILL);
// ─────────────────────────────────────────────────────────────
export function useNavState<T>(
  key: string,
  initial: T,
): [T, (updater: T | ((prev: T) => T)) => void] {
  // Select the raw stored value (stable reference: undefined or the object) so
  // the snapshot never churns.
  const stored = useApp((s) => s.nav[key]) as T | undefined;
  const setNav = useApp((s) => s.setNav);
  const value = stored === undefined ? initial : stored;
  const setValue = (updater: T | ((prev: T) => T)) => {
    setNav(key, (prev: unknown) => {
      const base = (prev === undefined ? initial : prev) as T;
      return typeof updater === 'function' ? (updater as (p: T) => T)(base) : updater;
    });
  };
  return [value, setValue];
}
