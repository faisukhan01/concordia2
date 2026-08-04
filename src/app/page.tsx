'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useApp } from '@/lib/store';
import { LoginPage } from '@/components/auth/login-page';
import { RolePortal } from '@/components/portal/role-portal';

// useSyncExternalStore returns the client snapshot during hydration/render
// and the server snapshot during SSR. This gives us a hydration-safe
// "isMounted" flag without setting state inside an effect (which would
// trigger react-hooks/set-state-in-effect).
const emptySubscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

// ─────────────────────────────────────────────────────────────────────────
// URL ↔ navigation sync
//
// The app is a single-route SPA whose current page lives in the Zustand store
// (view + activeModule). Previously the URL never changed, so the browser /
// mobile back button had nothing to go back to and would EXIT the app.
//
// This hook mirrors every navigation into the URL as query params
// (`/?view=portal&m=admissions-students`) and pushes a real history entry on
// each in-portal module change, so:
//   • the URL always reflects the current action (shareable / bookmarkable),
//   • the browser Back/Forward buttons move through the pages you visited,
//   • the Android app's WebView Back button (which calls goBack()) does the
//     same — no native change needed, because it walks this same history.
//
// Login ↔ portal transitions use replaceState (not push) so signing in/out
// never leaves a stale login/portal entry in the back stack.
// ─────────────────────────────────────────────────────────────────────────
// Normalise a (possibly namespaced) module id to the key portals store their
// drill state under — e.g. 'admissions:admissions-students' → 'admissions-students'.
function navKeyFor(m: string) {
  return m && m.includes(':') ? m.split(':', 2)[1] : m;
}

function useUrlHistorySync() {
  const view = useApp((s) => s.view);
  const activeModule = useApp((s) => s.activeModule);
  const nav = useApp((s) => s.nav);
  const setView = useApp((s) => s.setView);
  const setActiveModule = useApp((s) => s.setActiveModule);
  const setNavAll = useApp((s) => s.setNavAll);

  const inited = useRef(false);
  const popping = useRef(false);
  const prevView = useRef<string>(view);

  // Build the query string for a given state, including the current module's
  // drill (Department / Part / Section) so every action is visible in the URL.
  const buildUrl = (v: string, m: string, n: Record<string, any>) => {
    const p = new URLSearchParams();
    p.set('view', v);
    if (v === 'portal' && m) {
      p.set('m', m);
      const d = n[navKeyFor(m)] as any;
      if (d && typeof d === 'object') {
        if (d.dept) p.set('dept', d.dept);
        if (d.part) p.set('part', d.part);
        const secLetter = d.section?.section || d.cls?.section;
        if (d.section && secLetter) p.set('sec', secLetter);
        else if (d.cls) p.set('cls', d.cls.name || '');
      }
    }
    return '?' + p.toString();
  };

  // ── 1. Restore from the URL / history on first mount ──
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view');
    const urlModule = params.get('m');
    const histNav = (window.history.state && window.history.state.nav) || undefined;

    popping.current = true;
    if (urlView === 'login' || urlView === 'portal') setView(urlView);
    if (urlModule) setActiveModule(urlModule);
    // A full drill snapshot survives refresh in history.state — restore it so
    // the Back button and a page reload both land on the same drill level.
    if (histNav) setNavAll(histNav);
    popping.current = false;

    const v = urlView === 'login' || urlView === 'portal' ? urlView : view;
    const m = urlModule || activeModule;
    prevView.current = v;
    window.history.replaceState({ view: v, m, nav: histNav || nav }, '', buildUrl(v, m, histNav || nav));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Reflect store changes (view / module / drill) into URL + history ──
  useEffect(() => {
    if (!inited.current || popping.current) return;
    const url = buildUrl(view, activeModule, nav);
    if (url !== window.location.search) {
      // Push a new entry for any navigation inside the portal (module change
      // OR a drill step); login↔portal transitions replace in place.
      if (view === 'portal' && prevView.current === 'portal') {
        window.history.pushState({ view, m: activeModule, nav }, '', url);
      } else {
        window.history.replaceState({ view, m: activeModule, nav }, '', url);
      }
    }
    prevView.current = view;
  }, [view, activeModule, nav]);

  // ── 3. Restore state when the user presses Back / Forward ──
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      popping.current = true;
      const st = (e.state || {}) as { view?: string; m?: string; nav?: Record<string, unknown> };
      const params = new URLSearchParams(window.location.search);
      const v = st.view || params.get('view') || 'portal';
      const m = st.m || params.get('m') || 'dashboard';
      if (v === 'login' || v === 'portal') setView(v);
      setActiveModule(m);
      setNavAll(st.nav || {});
      prevView.current = v;
      // Release the guard after React flushes the state updates.
      requestAnimationFrame(() => { popping.current = false; });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setView, setActiveModule, setNavAll]);
}

export default function Home() {
  const view = useApp((s) => s.view);
  const mounted = useSyncExternalStore(emptySubscribe, isClient, isServer);

  // Keep the URL and the browser history in sync with in-app navigation.
  useUrlHistorySync();

  if (!mounted) {
    // Minimal, branded loading shell — no layout shift, no flash of wrong view.
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-xs text-muted-foreground">Loading Concordia College…</p>
        </div>
      </div>
    );
  }

  // No landing page — go straight to login or portal.
  if (view === 'portal') return <RolePortal />;
  return <LoginPage />;
}
