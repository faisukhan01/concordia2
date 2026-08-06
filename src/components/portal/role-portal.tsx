'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/lib/store';
import { ROLE_MODULES, roleAccent } from '@/lib/role-modules';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/brand-logo';
import { SidebarFaqCredit, PoweredByFaq } from '@/components/powered-by-faq';
import {
  GraduationCap, Search, Bell, Menu, LogOut,
  PanelLeftClose, PanelLeft, Shield,
  CheckCircle2, AlertCircle, Receipt, Award, CalendarCheck, X,
  ChevronDown, Sparkles,
  Volume2, VolumeX,
} from 'lucide-react';

import { SuperAdminPortal } from './super-admin-portal';
import { AdminPortal } from './admin-portal';
import { AdmissionsPortal } from './admissions-portal';
import { AccountantPortal } from './accountant-portal';
import { AcademicPortal } from './academic-portal';
import { TeacherPortal } from './teacher-portal';
import { StudentPortal } from './student-portal';
import { SettingsPage } from './settings-page';
import { NotificationsPage } from './notifications-page';
import { HelpPage } from './help-page';
import { CommandPalette } from './command-palette';
import { OnboardingTips } from '@/components/onboarding/onboarding-tooltips';
import { HelpWidget } from '@/components/ui/help-widget';
import { ProfileDropdown } from '@/components/portal/profile-dropdown';
import { WhatsNewDialog, useWhatsNewAutoOpen } from '@/components/portal/whats-new-dialog';
import { api, setOnBlocked } from '@/lib/api';
import { useAppUpdateChecker } from '@/lib/use-app-update-checker';
import { initFcmBridge, isNativeApp, refreshFcmTokenAfterLogin, showLocalNotification } from '@/lib/fcm-bridge';
import { toast } from '@/hooks/use-toast';
import { Megaphone, CalendarDays, ClipboardList, Wallet, BadgeCheck, Download, Send, Activity, Smartphone, Server, CheckCircle2 as CheckCircle, XCircle, ShieldAlert } from 'lucide-react';
// v4.1.0: ThemeToggle REMOVED per user request — the default light theme is
// the intended design and the toggle was never requested. Removed from both
// the portal header and the login page.

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
  'app-update': { Icon: Download,       text: 'text-primary',    bg: 'bg-primary/10' },
  result:       { Icon: Award,          text: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  complaint:    { Icon: AlertCircle,    text: 'text-rose-500',   bg: 'bg-rose-500/10' },
  general:      { Icon: Bell,           text: 'text-muted-foreground', bg: 'bg-muted' },
};

function notifMeta(type: string) {
  return notifIconMap[type] || { Icon: Bell, text: 'text-muted-foreground', bg: 'bg-muted' };
}

// Relative time formatting: "just now", "3m ago", "2h ago", "1d ago", "3w ago", "5mo ago", "1y ago".
//
// CRITICAL: The server stores `createdAt` as SQLite `datetime('now')`, which
// returns a UTC timestamp in the format `YYYY-MM-DD HH:MM:SS` (NO timezone
// marker). JavaScript's `new Date(iso)` treats a string WITHOUT a timezone
// marker as LOCAL time — which means a notification created right now would
// appear as "5h ago" for a user in Karachi (UTC+5). To fix this, we append
// 'Z' to timestamps that look like UTC-without-tz so they're parsed as UTC.
function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  let normalized = iso;
  // SQLite datetime('now') format: "YYYY-MM-DD HH:MM:SS" (space, no T, no Z).
  // Convert to ISO 8601 UTC: "YYYY-MM-DDTHH:MM:SSZ".
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(normalized) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized = normalized.replace(' ', 'T') + 'Z';
  }
  const then = new Date(normalized).getTime();
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
  const appUpdateAvailable = useApp((s: any) => s.appUpdateAvailable);
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
                      const isUpdateBtn = m.id === 'download-app';
                      const showUpdateBadge = isUpdateBtn && appUpdateAvailable && !isActive;
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
                              : showUpdateBadge
                                ? 'bg-[#FFF0E8] text-[#F26522] ring-1 ring-[#F26522]/30 font-bold'
                                : 'text-gray-600 hover:bg-[#FFF0E8] hover:text-[#F26522]'
                          )}
                        >
                          <m.icon className={cn(
                            'h-[17px] w-[17px] shrink-0 transition-colors',
                            isActive ? 'text-white' : showUpdateBadge ? 'text-[#F26522]' : 'text-gray-400 group-hover:text-[#F26522]'
                          )} />
                          {!collapsed && <span className="truncate flex-1 text-left">{m.name}</span>}
                          {/* Update Available badge */}
                          {showUpdateBadge && !collapsed && (
                            <span className="flex items-center gap-1 shrink-0">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-[#F26522] opacity-75 animate-ping" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#F26522]" />
                              </span>
                              <span className="text-[9px] font-bold uppercase tracking-wide text-[#F26522] bg-white px-1.5 py-0.5 rounded-full border border-[#F26522]/20">
                                New
                              </span>
                            </span>
                          )}
                          {/* Collapsed mode: just a dot */}
                          {showUpdateBadge && collapsed && (
                            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full rounded-full bg-[#F26522] opacity-75 animate-ping" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F26522] ring-1 ring-white" />
                            </span>
                          )}
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
              {user?.photoUrl ? (
                <AvatarImage src={user.photoUrl} alt={user?.name || 'User'} className="object-cover" />
              ) : null}
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

      {/* ─── Product-owner credit — FaQ Systems ───
          Thin dark metallic strip at the very bottom of the sidebar.
          Collapses to just the FaQ mark on the 72px rail. */}
      <SidebarFaqCredit collapsed={collapsed} />
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
  // v4.6.0: Silent app-update checker — shows a badge on the sidebar
  // "Update App" button when a new version is available. Replaces the
  // annoying "update your app" push notifications.
  useAppUpdateChecker();
  // v4.5.2: What's New dialog (auto-opens once per version).
  const [whatsNewOpen, setWhatsNewOpen] = useWhatsNewAutoOpen();
  // v4.5.2: Snooze the "must change password" banner for 7 days. The banner
  // re-appears automatically after the snooze window expires, so the user
  // is still nudged to secure their account — just not on every single page.
  const [pwBannerSnoozed, setPwBannerSnoozed] = useState(false);
  useEffect(() => {
    try {
      const snoozedAt = Number(localStorage.getItem('concordia:pw-banner-snoozed') || 0);
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      if (snoozedAt && Date.now() - snoozedAt < SEVEN_DAYS) {
        setPwBannerSnoozed(true);
      } else if (snoozedAt) {
        // expired — clear it so the banner shows again.
        localStorage.removeItem('concordia:pw-banner-snoozed');
      }
    } catch {}
  }, []);
  const snoozePwBanner = () => {
    try { localStorage.setItem('concordia:pw-banner-snoozed', String(Date.now())); } catch {}
    setPwBannerSnoozed(true);
  };

  // --- Notifications dropdown state ---
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<any[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  // Filter tab for the notifications panel: 'all' shows everything, 'unread'
  // shows only unread items. Persisted in localStorage so the user's choice
  // survives reloads (matches WhatsApp/Gmail behavior).
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>(() => {
    try {
      const v = localStorage.getItem('concordia:notif-filter');
      return v === 'unread' ? 'unread' : 'all';
    } catch { return 'all'; }
  });
  // In-app notification sound toggle. When enabled, the web app plays a short
  // tone when a new foreground notification arrives (the native app handles
  // its own sound via the FCM channel; this is for browser/PWA users).
  // Persisted in localStorage so it survives reloads.
  const [notifSoundOn, setNotifSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('concordia:notif-sound') !== 'off';
    } catch { return true; }
  });

  const fetchNotifs = useCallback(async () => {
    setNotifLoading(true);
    try {
      // v4.3.0: Fetch only the latest 5 for the bell dropdown (the full list
      // is on the dedicated Notifications page). The poller below still fetches
      // 15 so it can detect new notifications even if more than 5 arrive
      // between polls.
      const data = await api.getNotifications(5);
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

  // ── Track which notification IDs we've already shown as a toast banner,
  //    so we don't re-toast them on every poll. Persisted in localStorage so
  //    it survives page refreshes.
  const seenNotifIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem('concordia:seen-notifs');
      if (raw) seenNotifIds.current = new Set(JSON.parse(raw));
    } catch {}
  }, []);

  // ── Active notification poller: fetches full notifications every 25s and
  //    shows an in-app toast banner for any NEW unread notification. This
  //    guarantees the user sees notifications inside the WebView (the mobile
  //    app) even when FCM server-side push is not configured — the banner
  //    appears the moment the notification is persisted to the DB.
  //
  // v4.1.0 FIX — "notification with sound on every app open":
  //   Previously the first poll after mount treated ALL unread notifications
  //   as "new" (because seenNotifIds started empty / localStorage hadn't
  //   loaded yet) and fired a toast + chime for EACH one. The user heard a
  //   sound every single time they opened the app. The fix: the FIRST poll
  //   is now SILENT — it just populates seenNotifIds with every existing
  //   notification ID. Only notifications that arrive AFTER the app opened
  //   (i.e. on the 2nd, 3rd, … poll) trigger toasts + sounds. This matches
  //   WhatsApp / Gmail behavior — you don't get re-notified for things you
  //   already saw last time.
  const firstPollRef = useRef(true);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        // v4.4.0: Fetch 15 for new-notification DETECTION (so we don't miss
        // any if more than 5 arrive between polls), but only DISPLAY the
        // latest 5 in the bell dropdown. The full list lives on the
        // dedicated Notifications page.
        const data = await api.getNotifications(15);
        if (!active || !Array.isArray(data?.items)) return;
        // Update the unread badge count.
        setNotifUnread(typeof data.unread === 'number' ? data.unread : 0);
        // Cap the displayed dropdown list at 5 — the user explicitly asked
        // for "latest/recent 5 notifications" in the navbar icon.
        const displayItems = data.items.slice(0, 5);
        if (firstPollRef.current) {
          // SILENT first poll: mark every existing notification as "seen"
          // WITHOUT showing toasts or playing sounds. This prevents the
          // "notification with sound on every app open" bug.
          for (const n of data.items) {
            seenNotifIds.current.add(n.id);
          }
          // Still refresh the bell panel so the items show in the dropdown.
          setNotifItems(displayItems);
          firstPollRef.current = false;
          // Persist the seen set.
          try {
            const arr = Array.from(seenNotifIds.current).slice(-200);
            localStorage.setItem('concordia:seen-notifs', JSON.stringify(arr));
          } catch {}
          return;
        }
        // Show a toast for each new unread notification we haven't seen yet.
        const newOnes = data.items.filter(
          (n) => !n.read && !seenNotifIds.current.has(n.id),
        );
        for (const n of newOnes) {
          seenNotifIds.current.add(n.id);
          toast({
            title: n.title || 'Concordia College',
            description: n.body || '',
          });
          // Play a subtle in-app chime for browser/PWA users when a new
          // notification arrives. The native mobile app handles its own sound
          // via the FCM channel, so we only play in the browser.
          playNotifSound();
          // v4.2.0: BULLETPROOF LOCAL NOTIFICATION FALLBACK — when running
          // inside the native app, ask Flutter to show a LOCAL SYSTEM
          // notification (lock screen + notification shade) via
          // flutter_local_notifications. This works EVEN IF FCM push fails,
          // because it uses the web app's HTTP poll (not FCM) to detect the
          // notification, then Flutter's local notification API to display it.
          // The notification appears IDENTICALLY to the keep-alive service
          // notification — same channel (concordia_notifications_v4), same
          // sound, same high-importance heads-up banner.
          if (isNativeApp()) {
            showLocalNotification(
              n.title || 'Concordia College',
              n.body || '',
              { route: (n as any).data?.route || 'notifications', notificationId: n.id },
            );
          }
        }
        if (newOnes.length > 0) {
          // Persist the seen set (cap at 200 entries to avoid unbounded growth).
          try {
            const arr = Array.from(seenNotifIds.current).slice(-200);
            localStorage.setItem('concordia:seen-notifs', JSON.stringify(arr));
          } catch {}
          // Refresh the bell panel list so the new items appear there too.
          setNotifItems(displayItems);
        }
      } catch {}
    };
    // Initial poll after a short delay (lets the first fetchNotifs settle).
    // v4.2.0: Reduced poll interval from 25s → 15s so local notifications
    // appear faster (the user wants activity notifications promptly).
    const t = setTimeout(poll, 3000);
    const id = setInterval(poll, 15_000);
    return () => { active = false; clearTimeout(t); clearInterval(id); };
  }, []);

  // ── App version check: on mount, ask the server if the current app version
  //    is outdated. If so, the server auto-creates an "Update your Concordia
  //    app" notification for this user (de-duped per 24h). The notification
  //    then shows up via the poller above + the bell panel.
  useEffect(() => {
    if (!user?.id) return;
    const nativeVer = (window as any).concordiaNative?.appVersion as string | undefined;
    const currentVer = nativeVer || '3.4.0'; // fallback for APKs that don't expose their version yet
    api.checkAppVersion(currentVer).catch(() => {});
  }, [user?.id]);

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
      // The fcm-bridge handles the actual navigation via onNotificationTap.
      // We call it directly here for in-app clicks.
      const w = window as any;
      const data = typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {});
      // For app-update, the bridge navigates to the download page — close
      // the panel first so the navigation is clean.
      if (route === 'app-update') {
        setNotifOpen(false);
      } else {
        // Re-use the FCM bridge's tap handler by dispatching the same event
        window.dispatchEvent(new CustomEvent('concordia:open-notifications'));
      }
      if (w.concordiaNative?.onNotificationTap) {
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

  // Send a test push notification. Available both inside the native app
  // (from the notification panel) and from the FCM diagnostics modal (for
  // admins on desktop). Returns detailed diagnostic info.
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const onSendTest = async () => {
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await api.sendTestNotification();
      setTestResult(res);
      if (res?.success) {
        if (!res.fcmEnabled) {
          toast({
            title: 'Push notifications not configured',
            description: 'The server FIREBASE_SERVICE_ACCOUNT env var is not set. Ask the admin to add it in Vercel.',
            variant: 'destructive',
          });
        } else if (res.tokenCount === 0) {
          toast({
            title: 'No device registered',
            description: 'Your phone has not registered its FCM token yet. Open the Concordia app on your phone and sign in, then try again.',
            variant: 'destructive',
          });
        } else if (res.fcmSuccess > 0) {
          toast({
            title: '✓ Test push sent!',
            description: `FCM accepted delivery for ${res.fcmSuccess} of ${res.tokenCount} device(s). Check your phone's notification panel — it should arrive within a few seconds. If it doesn't, see the Realme setup steps below.`,
          });
        } else {
          toast({
            title: 'FCM delivery failed',
            description: `${res.fcmFailed} of ${res.tokenCount} device(s) failed. See the error details below.`,
            variant: 'destructive',
          });
        }
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

  // Broadcast "Update your app" notification to ALL users (admin/super-admin only).
  const [broadcasting, setBroadcasting] = useState(false);
  const onBroadcastAppUpdate = async () => {
    setBroadcasting(true);
    try {
      const res = await api.broadcastAppUpdate('3.5.0');
      toast({
        title: 'Update notification sent to all users',
        description: `Delivered to ${res.recipients} user(s)${res.pushed > 0 ? ` (${res.pushed} push)` : ''}. They'll see it in their bell + as a banner.`,
      });
      setTimeout(fetchNotifs, 500);
    } catch (e: any) {
      toast({
        title: 'Failed to broadcast update notification',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBroadcasting(false);
    }
  };

  // ── Notification sound player ──
  // Plays a short, pleasant two-tone chime using the Web Audio API. No audio
  // file needed — synthesized on the fly. Only plays in the browser (the
  // native mobile app handles its own sound via the FCM v4 channel). Respects
  // the user's notifSoundOn toggle (persisted in localStorage).
  //
  // IMPORTANT: reads the sound preference directly from localStorage (not the
  // React state) so the value is always current — the notification poller
  // effect captures this function once on mount, so reading state would give
  // a stale value after the user toggles. localStorage is the source of truth.
  const playNotifSound = () => {
    if (typeof window === 'undefined') return;
    // Don't play if the user is on the native app — it has its own sound.
    if ((window as any).concordiaNative?.isNativeApp) return;
    // Read the live preference from localStorage to avoid stale-closure bugs.
    let soundOn = true;
    try { soundOn = localStorage.getItem('concordia:notif-sound') !== 'off'; } catch {}
    if (!soundOn) return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      // Two-note ascending chime (E5 → A5) — gentle and recognizable.
      const notes = [
        { freq: 659.25, start: 0,    dur: 0.12 }, // E5
        { freq: 880.00, start: 0.10, dur: 0.18 }, // A5
      ];
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = n.freq;
        // Envelope: quick attack, gentle decay, no click.
        gain.gain.setValueAtTime(0, now + n.start);
        gain.gain.linearRampToValueAtTime(0.18, now + n.start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.02);
      }
      // Close the context after the sound finishes to free resources.
      setTimeout(() => { try { ctx.close(); } catch {} }, 500);
    } catch {
      // AudioContext may be blocked before user interaction — silent fail.
    }
  };

  // Toggle the in-app notification sound on/off. Persisted to localStorage.
  const toggleNotifSound = () => {
    const next = !notifSoundOn;
    setNotifSoundOn(next);
    try { localStorage.setItem('concordia:notif-sound', next ? 'on' : 'off'); } catch {}
    // When enabling, play a sample chime immediately so the user knows what
    // it sounds like. We synthesize the tone directly here (not via
    // playNotifSound, which checks localStorage — already updated above, so
    // it would work too, but this avoids any timing ambiguity).
    if (next) {
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 880; // A5
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.18, now + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.22);
          setTimeout(() => { try { ctx.close(); } catch {} }, 400);
        }
      } catch {}
    }
    toast({
      title: next ? 'Notification sound on' : 'Notification sound off',
      description: next ? 'You will hear a chime when new notifications arrive.' : 'Notifications will be silent in the browser.',
    });
  };

  // Switch the notifications panel filter tab. Persisted to localStorage.
  const switchNotifFilter = (filter: 'all' | 'unread') => {
    setNotifFilter(filter);
    try { localStorage.setItem('concordia:notif-filter', filter); } catch {}
  };

  // Derived: the filtered list shown in the panel based on the active tab.
  const filteredNotifItems = notifFilter === 'unread'
    ? notifItems.filter((n) => !n?.read)
    : notifItems;

  // FCM diagnostics — admin/super-admin only. Opens a modal showing the live
  // server-side FCM config status + how many device tokens are registered.
  // This is the fastest way to verify the notification pipeline end-to-end.
  const [fcmDiagOpen, setFcmDiagOpen] = useState(false);
  const [fcmDiag, setFcmDiag] = useState<any>(null);
  const [fcmDiagLoading, setFcmDiagLoading] = useState(false);
  const [bridgeDiag, setBridgeDiag] = useState<any>(null);
  const [reregistering, setReregistering] = useState(false);
  const [reregisterResult, setReregisterResult] = useState<string | null>(null);
  const onOpenFcmDiag = async () => {
    setFcmDiagOpen(true);
    setFcmDiagLoading(true);
    setReregisterResult(null);
    try {
      const res = await api.getFcmStatus();
      setFcmDiag(res);
    } catch (e: any) {
      setFcmDiag({ error: e?.message || 'Failed to fetch FCM status' });
    } finally {
      setFcmDiagLoading(false);
    }
    // Also gather client-side bridge diagnostics (what does window.concordiaNative look like?).
    try {
      const { getFcmBridgeDiagnostics } = await import('@/lib/fcm-bridge');
      setBridgeDiag(getFcmBridgeDiagnostics());
    } catch (e: any) {
      setBridgeDiag({ error: e?.message || 'Failed to get bridge diagnostics' });
    }
  };
  // Manually re-register the FCM token (pulls from Flutter via the JS bridge).
  // Useful when the user just opened the app and the auto-poll hasn't fired yet.
  const onReregisterToken = async () => {
    setReregistering(true);
    setReregisterResult(null);
    try {
      const { refreshFcmTokenAfterLogin } = await import('@/lib/fcm-bridge');
      await refreshFcmTokenAfterLogin();
      // Wait a moment for the registration to complete.
      await new Promise((r) => setTimeout(r, 1500));
      // Re-fetch server status to see if totalDeviceTokens increased.
      const res = await api.getFcmStatus();
      setFcmDiag(res);
      // Re-fetch bridge diagnostics.
      const { getFcmBridgeDiagnostics } = await import('@/lib/fcm-bridge');
      setBridgeDiag(getFcmBridgeDiagnostics());
      setReregisterResult(
        res.totalDeviceTokens > 0
          ? '✓ Token registered successfully! This device will now receive push notifications.'
          : 'Token pull completed but no device token registered. Check the bridge diagnostics below — if hasFcmToken is false, the Flutter shell may not have delivered the token yet.'
      );
    } catch (e: any) {
      setReregisterResult('✗ Failed: ' + (e?.message || 'Unknown error'));
    } finally {
      setReregistering(false);
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
    // v4.3.0: Dedicated Notifications page — shows ALL notifications (the bell
    // dropdown only shows the latest 5). Available to every role.
    if (activeModule === 'notifications') return <NotificationsPage user={user} />;
    // v4.5.1: Dedicated Help & Support page — FAQs + contact info + report
    // an issue form. Available to every role.
    if (activeModule === 'help') return <HelpPage user={user} />;
    // v4.1.0: "Download App" sidebar link → opens /download page in a new tab.
    if (activeModule === 'download-app') {
      if (typeof window !== 'undefined') window.open('/download', '_blank');
      // Immediately switch back to the dashboard so the user doesn't see a blank page.
      setTimeout(() => setActiveModule(ROLE_MODULES[user.role]?.[0]?.items?.[0]?.id || 'dashboard'), 0);
      return null;
    }
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
            {/* v4.1.0: ThemeToggle removed — default light theme is the intended design. */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={toggleNotifs}
                aria-label="Notifications"
                aria-expanded={notifOpen}
                className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-accent text-muted-foreground transition"
              >
                <Bell className="h-[18px] w-[18px]" />
                {notifUnread > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-card" />
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[380px] max-w-[400px] max-h-[min(80vh,520px)] bg-card border border-border rounded-xl shadow-lg z-50 flex flex-col overflow-hidden">
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
                    <div className="flex items-center gap-1">
                      {/* Sound toggle — persisted in localStorage. Only affects
                          the in-app browser chime (the native app uses FCM channel sound). */}
                      <button
                        onClick={toggleNotifSound}
                        aria-label={notifSoundOn ? 'Mute notification sound' : 'Unmute notification sound'}
                        title={notifSoundOn ? 'Mute notification sound' : 'Unmute notification sound'}
                        className={cn(
                          'h-8 w-8 grid place-items-center rounded-md transition',
                          notifSoundOn
                            ? 'text-primary hover:bg-accent'
                            : 'text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground'
                        )}
                      >
                        {notifSoundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setNotifOpen(false)}
                        aria-label="Close notifications"
                        className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-accent transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Filter tabs — All / Unread */}
                  <div className="flex items-center gap-1 px-2 py-2 border-b border-border shrink-0 bg-muted/20">
                    {(['all', 'unread'] as const).map((tab) => {
                      const active = notifFilter === tab;
                      const count = tab === 'all' ? notifItems.length : notifItems.filter((n) => !n?.read).length;
                      return (
                        <button
                          key={tab}
                          onClick={() => switchNotifFilter(tab)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition',
                            active
                              ? 'bg-card text-primary shadow-sm border border-border'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          )}
                        >
                          <span className="capitalize">{tab}</span>
                          {count > 0 && (
                            <span className={cn(
                              'inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold leading-none',
                              active
                                ? (tab === 'unread' ? 'bg-rose-500 text-white' : 'bg-primary/15 text-primary')
                                : 'bg-muted text-muted-foreground'
                            )}>
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto scroll-fancy max-h-[min(60vh,400px)]">
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
                    ) : filteredNotifItems.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <div className="mx-auto h-12 w-12 rounded-full bg-muted grid place-items-center mb-3">
                          <Bell className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium text-primary">
                          {notifFilter === 'unread' ? 'No unread notifications' : 'No notifications'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {notifFilter === 'unread'
                            ? 'You&rsquo;re all caught up. Switch to "All" to see history.'
                            : 'You&rsquo;re all caught up.'}
                        </div>
                      </div>
                    ) : (
                      <ul className="p-2 space-y-1">
                        {filteredNotifItems.map((n) => {
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

                  {/* Footer — View all + Mark all read + Send test (native app only) */}
                  <div className="border-t border-border shrink-0 bg-muted/30">
                    {/* Admin-only: Broadcast "Update your app" to all users */}
                    {(role === 'admin' || role === 'super-admin') && (
                      <>
                        <button
                          onClick={onBroadcastAppUpdate}
                          disabled={broadcasting}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold text-white bg-[#F26522] hover:bg-[#D4541E] transition disabled:opacity-50"
                        >
                          <Send className={cn('h-3 w-3', broadcasting && 'animate-pulse')} />
                          {broadcasting ? 'Broadcasting…' : 'Broadcast "Update App" to all users'}
                        </button>
                        <button
                          onClick={onOpenFcmDiag}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-gray-600 hover:text-[#F26522] hover:bg-[#FFF4ED] transition border-t border-border"
                        >
                          <Activity className="h-3 w-3" />
                          FCM Diagnostics
                        </button>
                      </>
                    )}
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
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
                    {/* v4.3.0: "View all notifications" — opens the dedicated
                        Notifications page (shows ALL notifications, not just 5). */}
                    <button
                      onClick={() => { setNotifOpen(false); setActiveModule('notifications'); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold text-primary bg-primary/5 hover:bg-primary/10 transition border-t border-border"
                    >
                      View all notifications
                    </button>
                  </div>
                </div>
              )}

              {/* FCM Diagnostics modal — admin/super-admin only.
                  Shows live server-side FCM config + registered device tokens
                  so the admin can verify the notification pipeline end-to-end. */}
              <AnimatePresence>
                {fcmDiagOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setFcmDiagOpen(false)}
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm grid place-items-center p-4"
                  >
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-200"
                    >
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-[#FFF4ED] grid place-items-center">
                            <Activity className="h-4 w-4 text-[#F26522]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">FCM Diagnostics</h3>
                            <p className="text-[11px] text-gray-500">Live server-side push notification status</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setFcmDiagOpen(false)}
                          className="h-8 w-8 grid place-items-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="p-5 space-y-4">
                        {fcmDiagLoading ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <div className="h-8 w-8 rounded-full border-2 border-[#F26522] border-t-transparent animate-spin" />
                            <p className="text-xs text-gray-500">Checking FCM status…</p>
                          </div>
                        ) : fcmDiag?.error ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex items-start gap-2">
                            <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-rose-900">Failed to fetch status</p>
                              <p className="text-xs text-rose-700 mt-0.5">{fcmDiag.error}</p>
                            </div>
                          </div>
                        ) : fcmDiag ? (
                          <>
                            {/* Server config status */}
                            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                              <div className="flex items-center gap-2 mb-3">
                                <Server className="h-4 w-4 text-gray-500" />
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Server Config</span>
                              </div>
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Env var set</span>
                                  {fcmDiag.envVarSet ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                      <CheckCircle className="h-3.5 w-3.5" /> Yes ({fcmDiag.envVarLength} chars)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                                      <XCircle className="h-3.5 w-3.5" /> No
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">JSON valid</span>
                                  {fcmDiag.parseError ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                                      <XCircle className="h-3.5 w-3.5" /> Invalid
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                      <CheckCircle className="h-3.5 w-3.5" /> Valid
                                    </span>
                                  )}
                                </div>
                                {fcmDiag.parseError && (
                                  <div className="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-700 font-mono break-all">
                                    {fcmDiag.parseError}
                                  </div>
                                )}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Firebase project ID</span>
                                  <span className="text-xs font-mono text-gray-900">{fcmDiag.projectId || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-600">Client email</span>
                                  <span className="text-xs font-mono text-gray-900 truncate max-w-[200px]">{fcmDiag.clientEmail || '—'}</span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                                  <span className="text-xs font-semibold text-gray-700">FCM push enabled</span>
                                  {fcmDiag.fcmEnabled ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                                      <CheckCircle className="h-4 w-4" /> ENABLED
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                                      <XCircle className="h-4 w-4" /> DISABLED
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Device tokens registered */}
                            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Smartphone className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Registered Devices</span>
                                </div>
                                <span className="text-lg font-bold text-gray-900 tabular-nums">{fcmDiag.totalDeviceTokens}</span>
                              </div>
                              {fcmDiag.tokensByRole && fcmDiag.tokensByRole.length > 0 ? (
                                <div className="space-y-1.5">
                                  {fcmDiag.tokensByRole.map((r: any) => (
                                    <div key={r.role} className="flex items-center justify-between text-xs">
                                      <span className="text-gray-600 capitalize">{r.role}</span>
                                      <span className="font-semibold text-gray-900 tabular-nums">
                                        {r.count} token(s) · {r.users} user(s)
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 italic">
                                  No devices registered yet. Open the mobile app on your phone and sign in — the FCM token will register automatically.
                                </p>
                              )}
                            </div>

                            {/* My devices */}
                            {fcmDiag.myDevices && fcmDiag.myDevices.length > 0 && (
                              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Smartphone className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Your Devices</span>
                                </div>
                                <div className="space-y-1.5">
                                  {fcmDiag.myDevices.map((d: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                      <span className="font-mono text-gray-500">{d.tokenPreview}</span>
                                      <span className="text-gray-400">{d.platform} · {d.lastSeen}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* This Device — client-side bridge diagnostics.
                                Shows what window.concordiaNative looks like ON THIS
                                DEVICE so the admin can see if the Flutter shell
                                has delivered the FCM token. Critical for
                                diagnosing "no notifications" issues. */}
                            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Activity className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">This Device (Bridge)</span>
                                </div>
                                <button
                                  onClick={onReregisterToken}
                                  disabled={reregistering}
                                  className="text-[11px] font-semibold text-white bg-[#F26522] hover:bg-[#D4541E] disabled:opacity-60 disabled:cursor-not-allowed px-2.5 py-1 rounded-md transition"
                                >
                                  {reregistering ? 'Pulling…' : 'Re-register token'}
                                </button>
                              </div>
                              {reregisterResult && (
                                <div className={`mb-3 rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed ${reregisterResult.startsWith('✓') ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                                  {reregisterResult}
                                </div>
                              )}
                              {bridgeDiag && !bridgeDiag.error ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">Running in native app</span>
                                    {bridgeDiag.isNativeApp ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Yes</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"><XCircle className="h-3 w-3" /> No (browser)</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">App version</span>
                                    <span className="font-mono text-gray-900">{bridgeDiag.appVersion || '—'}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">FCM token received from Flutter</span>
                                    {bridgeDiag.hasFcmToken ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Yes ({bridgeDiag.fcmTokenLength} chars)</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"><XCircle className="h-3 w-3" /> No</span>
                                    )}
                                  </div>
                                  {bridgeDiag.fcmTokenPreview && (
                                    <div className="rounded-md bg-white border border-gray-200 px-2.5 py-1.5 text-[11px] font-mono text-gray-600 break-all">
                                      {bridgeDiag.fcmTokenPreview}
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">Pull bridge available</span>
                                    {bridgeDiag.hasRequestTokenAsync ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Yes</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><XCircle className="h-3 w-3" /> No (old APK)</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-600">Token registered with backend</span>
                                    {bridgeDiag.lastTokenRegistered ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Yes</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><XCircle className="h-3 w-3" /> Not yet</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 italic">
                                  {bridgeDiag?.error || 'Bridge diagnostics unavailable.'}
                                </p>
                              )}
                            </div>

                            {/* Send Test Push + Result — the fastest way to
                                verify the ENTIRE pipeline end-to-end. Sends
                                a real FCM push to THIS user's devices and
                                shows the detailed result (token count, FCM
                                success/failure, error messages). */}
                            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Send className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Test Push</span>
                                </div>
                                <button
                                  onClick={onSendTest}
                                  disabled={sendingTest}
                                  className="text-[11px] font-semibold text-white bg-[#F26522] hover:bg-[#D4541E] disabled:opacity-60 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition inline-flex items-center gap-1.5"
                                >
                                  <Sparkles className={cn('h-3 w-3', sendingTest && 'animate-spin')} />
                                  {sendingTest ? 'Sending…' : 'Send test push'}
                                </button>
                              </div>
                              {testResult && (
                                <div className="space-y-2 mt-3">
                                  {testResult.fcmEnabled ? (
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                      <div className="rounded-lg bg-white border border-gray-200 px-2 py-2">
                                        <div className="text-lg font-bold text-gray-900 tabular-nums">{testResult.tokenCount}</div>
                                        <div className="text-[10px] text-gray-500 uppercase tracking-wide">Devices</div>
                                      </div>
                                      <div className="rounded-lg bg-white border border-emerald-200 px-2 py-2">
                                        <div className="text-lg font-bold text-emerald-700 tabular-nums">{testResult.fcmSuccess}</div>
                                        <div className="text-[10px] text-emerald-600 uppercase tracking-wide">FCM OK</div>
                                      </div>
                                      <div className="rounded-lg bg-white border border-rose-200 px-2 py-2">
                                        <div className="text-lg font-bold text-rose-700 tabular-nums">{testResult.fcmFailed}</div>
                                        <div className="text-[10px] text-rose-600 uppercase tracking-wide">Failed</div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-2 text-[11px] text-rose-700">
                                      FIREBASE_SERVICE_ACCOUNT env var is not set on the server. Push notifications cannot be sent until it's configured in Vercel.
                                    </div>
                                  )}
                                  {testResult.tokenCount === 0 && (
                                    <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800 leading-relaxed">
                                      <strong>No devices registered.</strong> Open the Concordia app on your phone, sign in, and wait 30 seconds. Then tap "Re-register token" above, followed by "Send test push" again.
                                    </div>
                                  )}
                                  {testResult.errors && testResult.errors.length > 0 && (
                                    <div className="rounded-md bg-rose-50 border border-rose-200 p-2.5 space-y-1.5">
                                      <p className="text-[11px] font-semibold text-rose-900">FCM errors:</p>
                                      {testResult.errors.map((err: any, i: number) => (
                                        <div key={i} className="text-[10px] text-rose-700 font-mono break-all">
                                          <span className="text-rose-500">{err.tokenPreview}:</span> {err.error}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {testResult.fcmSuccess > 0 && (
                                    <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-2 text-[11px] text-emerald-800 leading-relaxed">
                                      <strong>FCM accepted the push.</strong> If your phone still doesn't show the notification within 30 seconds, the issue is on the device side — see the Realme / Chinese OEM setup steps below. The most common cause is that the app's "Auto-start" permission is off (Realme requires this manually).
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Device info + Realme / Chinese OEM setup guidance.
                                Reads window.concordiaNative.deviceInfo (injected
                                by the Flutter shell in v3.9.0+) and shows
                                OEM-specific steps for enabling background
                                delivery. This is the #1 fix for Realme phones. */}
                            {(() => {
                              const di = typeof window !== 'undefined' ? (window as any).concordiaNative?.deviceInfo : null;
                              if (!di) return null;
                              const isRealme = di.oemFamily === 'realme' || di.oemFamily === 'oppo' || di.oemFamily === 'oneplus';
                              const isXiaomi = di.oemFamily === 'xiaomi';
                              const isHuawei = di.oemFamily === 'huawei';
                              const isVivo = di.oemFamily === 'vivo';
                              const needsAutoStart = di.needsAutoStart;
                              if (!needsAutoStart) return null;
                              return (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4 text-amber-700" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                                      {isRealme ? 'Realme' : isXiaomi ? 'Xiaomi / Redmi' : isHuawei ? 'Huawei / Honor' : isVivo ? 'Vivo' : 'Chinese OEM'} Setup Required
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-amber-900 leading-relaxed">
                                    <strong>Detected: {di.manufacturer} {di.model}</strong> (Android {di.androidVersion}). Your device manufacturer uses aggressive battery management that kills background apps — even with all standard permissions granted. You MUST enable the following proprietary settings for WhatsApp-style always-on notifications:
                                  </p>
                                  <ol className="text-[11px] text-amber-900 leading-relaxed space-y-1.5 list-decimal list-inside">
                                    {isRealme && (
                                      <>
                                        <li><strong>Settings → App management → Auto-start</strong> → find "Concordia College" → toggle it <strong>ON</strong>.</li>
                                        <li><strong>Settings → App management → Concordia College → Battery</strong> → select "Allow background activity" (NOT "Optimize" or "Restrict").</li>
                                        <li><strong>Settings → App management → Concordia College → Notifications</strong> → ensure "Concordia Notifications" channel is set to <strong>High importance</strong> with sound. Also enable "Allow notifications while screen off".</li>
                                        <li>Recents screen: pull down on the Concordia app card → tap the <strong>🔒 lock icon</strong> to pin/lock it (prevents Realme from killing it).</li>
                                      </>
                                    )}
                                    {isXiaomi && (
                                      <>
                                        <li><strong>Security app → Permissions → Autostart</strong> → find "Concordia College" → toggle it <strong>ON</strong>.</li>
                                        <li><strong>Settings → Apps → Concordia College → Battery saver</strong> → select "No restrictions".</li>
                                        <li>Recents: long-press the Concordia card → tap the <strong>🔒 lock</strong> icon.</li>
                                      </>
                                    )}
                                    {isHuawei && (
                                      <>
                                        <li><strong>Phone Manager → Startup management</strong> → find "Concordia College" → toggle it <strong>ON</strong>.</li>
                                        <li><strong>Settings → Apps → Concordia College → Battery</strong> → "App launch" → enable "Auto-launch", "Secondary launch", "Run in background".</li>
                                      </>
                                    )}
                                    {isVivo && (
                                      <>
                                        <li><strong>i Manager → App manager → Auto-start manager</strong> → find "Concordia College" → toggle it <strong>ON</strong>.</li>
                                        <li><strong>Settings → Battery → Background power consumption</strong> → find "Concordia College" → set to "Allow background".</li>
                                      </>
                                    )}
                                    {!isRealme && !isXiaomi && !isHuawei && !isVivo && (
                                      <li>Open your phone's <strong>Security</strong> or <strong>Phone Manager</strong> app → find <strong>Auto-start</strong> or <strong>Startup management</strong> → enable Concordia College.</li>
                                    )}
                                  </ol>
                                  <div className="flex items-center gap-2 pt-1">
                                    <span className="text-[10px] text-amber-700">Battery optimization:</span>
                                    {di.isIgnoringBatteryOptimizations ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Whitelisted</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700"><XCircle className="h-3 w-3" /> Not whitelisted</span>
                                    )}
                                    <span className="text-[10px] text-amber-700">· Keep-alive service:</span>
                                    {di.keepAliveRunning ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Running</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700"><XCircle className="h-3 w-3" /> Stopped</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Help text */}
                            <div className="rounded-lg bg-[#FFF4ED] border border-[#F26522]/20 p-3 space-y-2">
                              <p className="text-[11px] text-[#D4541E] leading-relaxed">
                                <strong>How push notifications work:</strong> When the mobile app opens, Flutter gets an FCM token from Firebase and passes it to this web app, which POSTs it to the server. The server then uses that token to send pushes via Firebase Cloud Messaging — these arrive even when the app is closed (WhatsApp-style).
                              </p>
                              <p className="text-[11px] text-[#D4541E] leading-relaxed">
                                <strong>If "Registered Devices" is 0:</strong> The phone hasn't registered its token yet. Open the Concordia app on the phone, sign in, then tap "Re-register token" above. If "FCM token received from Flutter" shows No, the Flutter shell couldn't get a token (check notification permission + Google Play Services on the phone).
                              </p>
                              <p className="text-[11px] text-[#D4541E] leading-relaxed">
                                <strong>If FCM push is DISABLED:</strong> The <code className="font-mono bg-white/50 px-1 rounded">FIREBASE_SERVICE_ACCOUNT</code> env var is missing or invalid on Vercel. Download the firebase-adminsdk JSON from Firebase Console → Project Settings → Service Accounts → Generate new private key, then set the entire JSON as the env var value in Vercel.
                              </p>
                              <p className="text-[11px] text-[#D4541E] leading-relaxed">
                                <strong>v3.9.0 improvements:</strong> The app now creates the notification channel BEFORE Firebase init (so it always exists), starts a foreground keep-alive service (prevents Realme/Xiaomi from killing the app — same as WhatsApp), and re-registers the token every time you resume the app. Make sure you've updated to v3.9.0 or later.
                              </p>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* v4.5.2: Profile dropdown menu — replaces the static avatar+name block.
                Clicking opens a Radix DropdownMenu with: My Profile, Notifications,
                Help & Support, What's New, Download App, Sign Out. Shows photoUrl. */}
            <div className="flex items-center pl-1.5 sm:pl-2 sm:border-l border-border">
              <ProfileDropdown
                user={user ? {
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  roleLabel: user.roleLabel,
                  photoUrl: user.photoUrl ?? null,
                  campus: user.campus,
                  rollNo: user.rollNo,
                } : null}
                onNavigate={(id) => setActiveModule(id)}
                onShowWhatsNew={() => setWhatsNewOpen(true)}
                onDownloadApp={() => {
                  if (typeof window !== 'undefined') window.open('/download', '_blank');
                }}
                onSignOut={logout}
              />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {/* Onboarding tips banner — dismissible, remembered via localStorage */}
          <OnboardingTips />
          {/* Must change password banner — shown on ALL portals when user has
              default/admin-assigned password. v4.5.2: snoozeable for 7 days so
              it doesn't follow the user on every page forever. Re-appears
              automatically after the snooze window expires. */}
          {user?.mustChangePassword && activeModule !== 'settings' && !pwBannerSnoozed && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="mb-4"
            >
              <div className="relative overflow-hidden rounded-xl border border-rose-200/70 bg-white shadow-sm">
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-rose-500 to-orange-500" />
                {/* Soft decorative gradient */}
                <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-rose-50/80 blur-2xl" aria-hidden />

                <div className="relative flex items-center gap-3.5 py-3 pl-4 pr-3">
                  {/* Icon */}
                  <div className="relative h-9 w-9 shrink-0">
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 shadow-sm" />
                    <Shield className="absolute inset-0 m-auto h-4 w-4 text-white" strokeWidth={2.2} />
                  </div>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-gray-900">
                      Secure your account
                    </div>
                    <div className="text-[12px] text-gray-500 mt-0.5 leading-snug">
                      You're using an admin-assigned password. Please change it to protect your account.
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={snoozePwBanner}
                      title="Snooze for 7 days"
                      className="hidden sm:flex h-7 px-2.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md transition-colors"
                    >
                      Later
                    </button>
                    <button
                      onClick={() => setActiveModule('settings')}
                      className="h-7 px-3.5 text-[11px] font-semibold text-white bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 rounded-md transition-all shadow-sm"
                    >
                      Change now
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          <AnimatePresence mode="wait">
            <motion.div key={activeModule} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {renderPortal()}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-auto border-t border-border px-6 py-3 text-xs text-muted-foreground flex items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Concordia College</span>
          <PoweredByFaq variant="inline" />
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
