import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  // Per-view drill/navigation state (see NavState). Mirrored to the URL.
  nav: NavState;
  setView: (v: View) => void;
  setUser: (u: AuthUser) => void;
  setToken: (t: string | null) => void;
  setActiveModule: (m: string) => void;
  setPendingExamName: (n: string | null) => void;
  setNav: (key: string, value: unknown | ((prev: unknown) => unknown)) => void;
  setNavAll: (nav: NavState) => void;
  logout: () => void;
};

// Use sessionStorage so each browser tab has its own independent session.
// This prevents the "multiple tab" issue where signing in as a different user
// in one tab would overwrite the session in other tabs.
const sessionStorageAdapter = {
  getItem: (name: string) => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      sessionStorage.setItem(name, value);
    } catch {}
  },
  removeItem: (name: string) => {
    try {
      sessionStorage.removeItem(name);
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
      nav: {},
      setView: (v) => set({ view: v }),
      setUser: (u) => set({ user: u, activeModule: 'dashboard' }),
      setToken: (t) => set({ token: t }),
      setActiveModule: (m) => set({ activeModule: m }),
      setPendingExamName: (n) => set({ pendingExamName: n }),
      setNav: (key, value) => set((s) => {
        const prev = s.nav[key];
        const next = typeof value === 'function' ? (value as (p: unknown) => unknown)(prev) : value;
        return { nav: { ...s.nav, [key]: next } };
      }),
      setNavAll: (nav) => set({ nav: nav || {} }),
      logout: () => set({ view: 'login', user: null, token: null, activeModule: 'dashboard', pendingExamName: null, nav: {} }),
    }),
    {
      name: 'concordia-app',
      storage: createJSONStorage(() => sessionStorageAdapter),
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
