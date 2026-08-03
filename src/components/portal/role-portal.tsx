'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/lib/store';
import { ROLE_MODULES, roleAccent } from '@/lib/role-modules';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/brand-logo';
import {
  GraduationCap, Search, Bell, Menu, LogOut,
  PanelLeftClose, PanelLeft, Shield,
  CheckCircle2, AlertCircle, Receipt, Award, CalendarCheck, X,
  ChevronDown, Sparkles,
} from 'lucide-react';

import { SuperAdminPortal } from './super-admin-portal';
import { AdminPortal } from './admin-portal';
import { AdmissionsPortal } from './admissions-portal';
import { AccountantPortal } from './accountant-portal';
import { AcademicPortal } from './academic-portal';
import { TeacherPortal } from './teacher-portal';
import { StudentPortal } from './student-portal';
import { SettingsPage } from './settings-page';
import { CommandPalette } from './command-palette';
import { OnboardingTips } from '@/components/onboarding/onboarding-tooltips';
import { HelpWidget } from '@/components/ui/help-widget';
import { api, setOnBlocked } from '@/lib/api';
import { initFcmBridge, isNativeApp, refreshFcmTokenAfterLogin } from '@/lib/fcm-bridge';
import { toast } from '@/hooks/use-toast';
import { Megaphone, CalendarDays, ClipboardList, Wallet, BadgeCheck } from 'lucide-react';

// Notification icon + color mapping per type.
const notifIconMap: Record<string, { Icon: any; text: string; bg: string }> = {
  announcement: { Icon: Megaphone,      text: 'text-primary',    bg: 'bg-primary/10' },
  exam:         { Icon: CalendarDays,   text: 'text-violet-600', bg: 'bg-violet-500/10' },
  'date-sheet': { Icon: ClipboardList,  text: 'text-violet-600', bg: 'bg-violet-500/10' },
  marks:        { Icon: GraduationCap,  text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  attendance:   { Icon: CalendarCheck,  text: 'text-sky-500',    bg: 'bg-sky-500/10' },
  'fee-due':    { Icon: Wallet,         text: 'text-amber-600',  bg: 'bg-amber-500/10' },
  'fee-paid':   { Icon: BadgeCheck,     text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  fee:          { Icon: Receipt,        text: 'text-gold',       bg: 'bg-gold/10' },
  result:       { Icon: Award,          text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  complaint:    { Icon: AlertCircle,    text: 'text-rose-500',   bg: 'bg-rose-500/10' },
  general:      { Icon: Bell,           text: 'text-muted-foreground', bg: 'bg-muted' },
};

function notifMeta(type: string) {
  return notifIconMap[type] || { Icon: Bell, text: 'text-muted-foreground', bg: 'bg-muted' };
}

// Relative time formatting: "just now", "3m ago", "2h ago", "1d ago", "3w ago", "5mo ago", "1y ago".
function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function SidebarContent({ role, collapsed, groupOpen, setGroupOpen, activeModule, setActiveModule, setMobileOpen, user, logout }: any) {
  const groups = ROLE_MODULES[role] || [];
  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* ─── Brand header — fixed 64px height, perfectly aligned with the top bar ─── */}
      <div className={cn(
        'relative flex items-center h-16 border-b border-sidebar-border shrink-0',
        collapsed ? 'justify-center px-2' : 'px-5'
      )}>
        {collapsed ? (
          <BrandLogo size="xs" />
        ) : (
          <BrandLogo size="sidebar" />
        )}
      </div>

      {/* ─── Modules nav — restrained, consistent spacing, no role/campus badge ─── */}
      <nav className="flex-1 overflow-y-auto scroll-fancy px-3 py-4">
        <div className="space-y-5">
          {groups.map((group: any) => {
            const isOpen = groupOpen[group.group];
            const isFlat = group.flat === true;
            return (
              <div key={group.group}>
                {/* Section header — only for collapsible (non-flat) groups.
                    Flat groups (single-item like Admin Dashboard / Settings)
                    render their item directly with no toggle header. */}
                {!isFlat && !collapsed && (
                  <button
                    onClick={() => setGroupOpen((g: any) => ({ ...g, [group.group]: !g[group.group] }))}
                    className="w-full flex items-center justify-between px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <span>{group.group}</span>
                    <ChevronDown className={cn('h-3 w-3 transition-transform', !isOpen && '-rotate-90')} />
                  </button>
                )}
                {/* Flat groups always show items. Collapsible groups hide items when closed. */}
                <div className={cn(!isFlat && !isOpen && !collapsed && 'hidden')}>
                  <div className="space-y-0.5">
                    {group.items.map((m: any) => {
                      const isActive = activeModule === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setActiveModule(m.id); setMobileOpen(false); }}
                          title={collapsed ? m.name : undefined}
                          className={cn(
                            'group relative w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150',
                            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                            isActive
                              ? 'bg-[#F26522] text-white shadow-sm shadow-[#F26522]/20'
                              : 'text-gray-600 hover:bg-[#FFF0E8] hover:text-[#F26522]'
                          )}
                        >
                          <m.icon className={cn(
                            'h-[17px] w-[17px] shrink-0 transition-colors',
                            isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#F26522]'
                          )} />
                          {!collapsed && <span className="truncate flex-1 text-left">{m.name}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* ─── User card — minimal, clean, aligned with nav ─── */}
      <div className="border-t border-sidebar-border p-3 shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[#FFF0E8] transition-colors group">
            <Avatar className="h-9 w-9 shrink-0 ring-1 ring-gray-200">
              <AvatarFallback
                className="text-white text-xs font-bold"
                style={{ background: 'linear-gradient(135deg, #F26522 0%, #D4541E 100%)' }}
              >
                {(user?.name || 'Admin').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[#1A1A1A] truncate">{user?.name || 'User'}</div>
              <div className="text-[11px] text-gray-400 truncate">{user?.email}</div>
            </div>
            <button onClick={logout} title="Sign out" className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button onClick={logout} title="Sign out" className="w-full h-10 grid place-items-center rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function RolePortal() {
  const { user, activeModule, setActiveModule, logout } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // --- Notifications dropdown state ---
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<any[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    setNotifLoading(true);
    try {
      const data = await api.getNotifications();
      setNotifItems(Array.isArray(data?.items) ? data.items : []);
      setNotifUnread(typeof data?.unread === 'number' ? data.unread : 0);
    } catch {
      // silent — keep last known state
    } finally {
      setNotifLoading(false);
    }
  }, []);

  // Fetch unread count on mount so the bell badge appears without opening the panel.
  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  // ── FCM bridge: wire up the native push notification bridge + re-register
  // the token after login (the native shell may have pushed the token before
  // the user was authenticated).
  useEffect(() => {
    initFcmBridge();
    refreshFcmTokenAfterLogin();
  }, [user?.id]);

  // ── Poll for the unread count every 60s so the bell badge stays fresh
  //    without the user needing to open the panel. (Cheap endpoint — just a
  //    COUNT query.)
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const { unread } = await api.getUnreadCount();
        if (active) setNotifUnread(unread);
      } catch {}
    };
    const id = setInterval(poll, 60_000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Listen for "concordia:open-notifications" — dispatched by the FCM
  //    bridge when the user taps a notification with route='notifications'.
  useEffect(() => {
    function onOpen() {
      setNotifOpen(true);
      fetchNotifs();
    }
    window.addEventListener('concordia:open-notifications', onOpen);
    return () => window.removeEventListener('concordia:open-notifications', onOpen);
  }, [fetchNotifs]);

  // next-themes hydration guard
  useEffect(() => setMounted(true), []);

  // Click-away + Escape to close the notifications panel.
  useEffect(() => {
    if (!notifOpen) return;
    function onDocClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  const toggleNotifs = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) fetchNotifs();
  };

  // Mark a single notification as read + navigate based on its data.route.
  const onNotifClick = async (n: any) => {
    if (!n?.read && n?.id) {
      try {
        await api.markNotificationRead(n.id);
        // Optimistically update the local state
        setNotifItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: 1 } : x));
        setNotifUnread((u) => Math.max(0, u - 1));
      } catch {}
    }
    // Navigate based on the notification's data payload
    let route: string | undefined;
    try {
      route = n?.data ? (typeof n.data === 'string' ? JSON.parse(n.data).route : n.data.route) : undefined;
    } catch {}
    if (route) {
      // Re-use the FCM bridge's tap handler by dispatching the same event
      window.dispatchEvent(new CustomEvent('concordia:open-notifications'));
      // The fcm-bridge handles the actual navigation via onNotificationTap.
      // We call it directly here for in-app clicks.
      const w = window as any;
      if (w.concordiaNative?.onNotificationTap) {
        const data = typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {});
        w.concordiaNative.onNotificationTap(data);
      }
    }
  };

  // Mark all notifications as read.
  const onMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifItems((prev) => prev.map((x) => ({ ...x, read: 1 })));
      setNotifUnread(0);
      toast({ title: 'All notifications marked as read' });
    } catch {
      toast({ title: 'Failed to mark notifications as read', variant: 'destructive' });
    }
  };

  // Send a test push notification (only available inside the native app).
  const [sendingTest, setSendingTest] = useState(false);
  const onSendTest = async () => {
    setSendingTest(true);
    try {
      const res = await api.sendTestNotification();
      if (res?.success) {
        toast({
          title: 'Test push sent!',
          description: res.pushed > 0
            ? `Delivered to ${res.pushed} device(s). Check your phone's notification panel.`
            : 'No registered devices yet — open the app on your phone first.',
        });
        // Refresh the in-app bell so the test notification shows up there too.
        setTimeout(fetchNotifs, 500);
      } else {
        toast({
          title: 'Push notifications not configured',
          description: 'The server FIREBASE_SERVICE_ACCOUNT env var is not set yet. Ask the admin.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Failed to send test push',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const role = user?.role || 'student';
  const groups = ROLE_MODULES[role] || [];
  // All sidebar groups start COLLAPSED by default. The user explicitly
  // requested that dropdowns are NOT open by default — they open only when
  // clicked. The group containing the active module will still auto-expand
  // (see the auto-expand effect below) so navigation from the command
  // palette or deep links keeps the active item visible.
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(groups.map((g: any) => [g.group, false]))
  );
  const accent = roleAccent[role];

  // Register global blocked handler — when API returns 403/401 with "blocked",
  // show the blocked screen instead of silent errors
  useEffect(() => {
    setOnBlocked((msg: string) => {
      setBlockedMsg(msg);
    });
    return () => setOnBlocked(() => {});
  }, []);

  // Global Cmd+K / Ctrl+K to toggle the command palette.
  // ignoreKey: prevent opening while typing in inputs that explicitly opt out
  // (none currently, but the guard keeps the listener defensive).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Check if user has a blockedMessage from login (set by backend when institute/branch is blocked)
  // Derive blocked state directly from user — no effect needed
  const blockedFromUser = user?.blockedMessage || null;

  // Reset active module when role changes (e.g. on login)
  useEffect(() => {
    const firstModule = groups[0]?.items[0]?.id;
    if (firstModule && !groups.some((g: any) => g.items.some((m: any) => m.id === activeModule))) {
      setActiveModule(firstModule);
    }
  }, [role]);

  // Auto-expand the group that contains the active module — so when the
  // admin navigates to a sub-portal module (e.g. via command palette), its
  // dropdown opens automatically to show the active item.
  useEffect(() => {
    const containingGroup = groups.find((g: any) => g.items.some((m: any) => m.id === activeModule));
    if (containingGroup && !groupOpen[containingGroup.group]) {
      setGroupOpen((g: any) => ({ ...g, [containingGroup.group]: true }));
    }
  }, [activeModule]);

  const allModules = useMemo(() => groups.flatMap((g: any) => g.items), [groups]);

  // Resolve the active module for the header title.
  // For admin sub-portal modules (format `role:moduleId`), look up the
  // module name in that role's module catalog so the header shows the
  // correct title (e.g. "New Enrollment" instead of "Admission Office").
  const active = useMemo(() => {
    // Direct match in this role's sidebar
    const direct = allModules.find((m: any) => m.id === activeModule);
    if (direct) return direct;
    // Namespaced sub-portal module (admin viewing a sub-portal's module)
    if (activeModule && activeModule.includes(':')) {
      const [ns, modId] = activeModule.split(':', 2);
      if (modId === '__hub__') {
        // Hub view — find the portal entry in the admin sidebar
        const hubEntry = allModules.find((m: any) => m.id === activeModule);
        if (hubEntry) return hubEntry;
      }
      // Look up the module in the sub-portal's catalog
      const subGroups = ROLE_MODULES[ns];
      if (subGroups) {
        const subMod = subGroups.flatMap((g: any) => g.items).find((m: any) => m.id === modId);
        if (subMod) return subMod;
      }
    }
    return allModules[0] || { id: 'none', name: 'Home', icon: GraduationCap, color: 'from-primary to-primary/80' };
  }, [allModules, activeModule]);

  const renderPortal = () => {
    if (activeModule === 'settings') return <SettingsPage user={user} />;
    switch (role) {
      case 'super-admin': return <SuperAdminPortal activeModule={activeModule} user={user} />;
      case 'admin': return <AdminPortal activeModule={activeModule} user={user} />;
      case 'admissions': return <AdmissionsPortal activeModule={activeModule} user={user} />;
      case 'accountant': return <AccountantPortal activeModule={activeModule} user={user} />;
      case 'academic': return <AcademicPortal activeModule={activeModule} user={user} />;
      case 'teacher': return <TeacherPortal activeModule={activeModule} user={user} />;
      case 'student': return <StudentPortal activeModule={activeModule} user={user} />;
      case 'parent': return <StudentPortal activeModule={activeModule} user={user} />;
      default: return <StudentPortal activeModule={activeModule} user={user} />;
    }
  };

  const sidebarProps = { role, collapsed, groupOpen, setGroupOpen, activeModule, setActiveModule, setMobileOpen, user, logout };

  // Blocked screen — shown when Super Admin or Institute Admin blocks access
  // Can be triggered by: 1) blockedMessage from login, 2) 403/401 from API calls
  const effectiveBlockedMsg = blockedMsg || blockedFromUser;
  if (effectiveBlockedMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-950 via-slate-950 to-rose-950 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="rounded-3xl bg-white shadow-2xl p-8 text-center">
            <div className="inline-flex h-16 w-16 rounded-2xl bg-rose-100 items-center justify-center mb-5">
              <Shield className="h-8 w-8 text-rose-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Access Blocked</h1>
            <p className="text-sm text-slate-600 mb-1">Your access has been blocked by your administration.</p>
            <p className="text-xs text-slate-400 mb-6">{effectiveBlockedMsg}</p>
            <p className="text-xs text-slate-500 mb-6">Please contact your administrator to restore access.</p>
            <Button
              className="w-full bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => { logout(); setBlockedMsg(null); }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Back to Sign In
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className={cn('hidden lg:flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 fixed inset-y-0 left-0 z-30', collapsed ? 'w-[72px]' : 'w-[260px]')}>
        <SidebarContent {...sidebarProps} />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} className="lg:hidden fixed inset-0 bg-black/50 z-40" />
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-sidebar">
              <SidebarContent {...sidebarProps} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className={cn('flex-1 flex flex-col min-w-0', collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]')}>
        <header className="sticky top-0 z-20 h-16 bg-card border-b border-border flex items-center gap-3 px-4 sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden h-8 w-8 grid place-items-center rounded-md hover:bg-accent">
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => setCollapsed(v => !v)} className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent text-muted-foreground">
            {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="font-semibold text-sm sm:text-base truncate">{active?.name}</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              aria-label="Open command palette"
              className="group hidden md:flex items-center gap-2 h-9 w-48 lg:w-64 px-3 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition border border-transparent hover:border-border"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left truncate">Search…</span>
              <kbd className="hidden lg:inline-flex items-center gap-0.5 h-5 px-1.5 rounded border border-border bg-background/80 text-[10px] font-medium text-muted-foreground/80">
                <span className="text-[11px] leading-none">⌘</span>K
              </kbd>
            </button>
            {mounted && (
              <button
                onClick={() => setCmdOpen(true)}
                aria-label="Search"
                className="md:hidden h-9 w-9 grid place-items-center rounded-md hover:bg-accent text-muted-foreground transition"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
            )}
            <div className="relative" ref={notifRef}>
              <button
                onClick={toggleNotifs}
                aria-label="Notifications"
                aria-expanded={notifOpen}
                className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-accent text-muted-foreground transition"
              >
                <Bell className="h-[18px] w-[18px]" />
                {notifUnread > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-card" />
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-card border border-border rounded-xl shadow-lg z-50 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-primary">Notifications</span>
                      {notifUnread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-none">
                          {notifUnread > 99 ? '99+' : notifUnread}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setNotifOpen(false)}
                      aria-label="Close notifications"
                      className="h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:bg-accent transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto scroll-fancy max-h-[360px]">
                    {notifLoading ? (
                      <div className="p-2 space-y-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg">
                            <div className="h-9 w-9 rounded-full bg-muted animate-pulse shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                              <div className="h-2.5 w-full bg-muted rounded animate-pulse" />
                              <div className="h-2 w-1/3 bg-muted rounded animate-pulse" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : notifItems.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center mb-3">
                          <Bell className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium text-primary">No notifications</div>
                        <div className="text-xs text-muted-foreground mt-1">You&rsquo;re all caught up.</div>
                      </div>
                    ) : (
                      <ul className="p-2 space-y-1">
                        {notifItems.map((n) => {
                          const { Icon, text, bg } = notifMeta(n?.type);
                          return (
                            <li key={n?.id ?? Math.random()}>
                              <button
                                type="button"
                                onClick={() => onNotifClick(n)}
                                className={cn(
                                  'w-full text-left flex items-start gap-3 p-3 rounded-lg transition',
                                  n?.read ? 'hover:bg-accent' : 'bg-primary/5 hover:bg-primary/10'
                                )}
                              >
                                <div className={cn('h-9 w-9 rounded-full grid place-items-center shrink-0', bg)}>
                                  <Icon className={cn('h-4 w-4', text)} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-primary truncate">{n?.title}</span>
                                    {!n?.read && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                                    )}
                                  </div>
                                  {n?.body && (
                                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                                  )}
                                  <div className="text-[10px] text-muted-foreground/70 mt-1">
                                    {formatRelativeTime(n?.createdAt)}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Footer — Mark all read + Send test (native app only) */}
                  {(notifUnread > 0 || isNativeApp()) && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border shrink-0 bg-muted/30">
                      {notifUnread > 0 ? (
                        <button
                          onClick={onMarkAllRead}
                          className="text-[11px] font-medium text-primary hover:text-primary/80 transition"
                        >
                          Mark all as read
                        </button>
                      ) : <span />}
                      {isNativeApp() && (
                        <button
                          onClick={onSendTest}
                          disabled={sendingTest}
                          className="text-[11px] font-medium text-muted-foreground hover:text-primary transition inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Sparkles className={cn('h-3 w-3', sendingTest && 'animate-spin')} />
                          {sendingTest ? 'Sending…' : 'Send test push'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
              <Avatar className="h-8 w-8 ring-1 ring-gray-200">
                <AvatarFallback
                  className="text-white text-[11px] font-bold"
                  style={{ background: 'linear-gradient(135deg, #F26522 0%, #D4541E 100%)' }}
                >
                  {(user?.name || 'A').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block leading-tight">
                <div className="text-[13px] font-semibold text-[#1A1A1A] truncate max-w-[160px]">{user?.name}</div>
                <div className="text-[11px] text-gray-400 truncate max-w-[160px]">{user?.roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {/* Onboarding tips banner — dismissible, remembered via localStorage */}
          <OnboardingTips />
          {/* Must change password banner — shown on ALL portals when user has default/admin-assigned password */}
          {user?.mustChangePassword && activeModule !== 'settings' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-200/80 grid place-items-center shrink-0">
                  <Shield className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-amber-900">Please change your password</div>
                  <div className="text-xs text-amber-800">You're using a password assigned by your administrator. Change it now to secure your account.</div>
                </div>
              </div>
              <Button size="sm" className="bg-[#F26522] hover:bg-[#D4541E] text-white shrink-0 shadow-sm" onClick={() => setActiveModule('settings')}>
                Change now
              </Button>
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={activeModule} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {renderPortal()}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-auto border-t border-border px-6 py-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>© {new Date().getFullYear()} Concordia College</span>
        </footer>
      </div>

      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        user={user}
        modules={groups}
        onNavigate={(id) => {
          setActiveModule(id);
          setCmdOpen(false);
        }}
      />
      <HelpWidget />
    </div>
  );
}
