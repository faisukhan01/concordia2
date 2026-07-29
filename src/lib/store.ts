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
  setView: (v: View) => void;
  setUser: (u: AuthUser) => void;
  setToken: (t: string | null) => void;
  setActiveModule: (m: string) => void;
  setPendingExamName: (n: string | null) => void;
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
      setView: (v) => set({ view: v }),
      setUser: (u) => set({ user: u, activeModule: 'dashboard' }),
      setToken: (t) => set({ token: t }),
      setActiveModule: (m) => set({ activeModule: m }),
      setPendingExamName: (n) => set({ pendingExamName: n }),
      logout: () => set({ view: 'login', user: null, token: null, activeModule: 'dashboard', pendingExamName: null }),
    }),
    {
      name: 'concordia-app',
      storage: createJSONStorage(() => sessionStorageAdapter),
    }
  )
);
