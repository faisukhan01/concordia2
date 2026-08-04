'use client';

// ════════════════════════════════════════════════════════════════════════
// Concordia College — Notifications Page (v4.3.0)
//
// A DEDICATED full-page view of ALL notifications for the logged-in user.
// The bell dropdown in the navbar shows only the latest 5 — this page shows
// EVERYTHING with filtering, search, mark-as-read, and auto-refresh.
//
// Features:
//   • Fetches up to 200 notifications (vs 5 in the bell dropdown)
//   • Filter tabs: All / Unread / by type (Announcements, Fees, Attendance, …)
//   • Search by title/body text
//   • Mark individual or all as read
//   • Auto-refreshes every 30s
//   • Responsive (mobile + desktop)
//   • Same card design as the bell dropdown for consistency
// ════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { useApp } from '@/lib/store';
import {
  Bell, Megaphone, CalendarDays, ClipboardList, GraduationCap,
  CalendarCheck, Wallet, BadgeCheck, Receipt, Award, AlertCircle,
  Download, CheckCheck, Search, X, Inbox, RefreshCw, Filter,
} from 'lucide-react';

// ─── Notification icon + color mapping (mirrors role-portal.tsx) ───────────
const notifIconMap: Record<string, { Icon: any; text: string; bg: string; label: string }> = {
  announcement: { Icon: Megaphone,      text: 'text-primary',     bg: 'bg-primary/10',     label: 'Announcements' },
  exam:         { Icon: CalendarDays,   text: 'text-violet-600',  bg: 'bg-violet-500/10',  label: 'Exams' },
  'date-sheet': { Icon: ClipboardList,  text: 'text-violet-600',  bg: 'bg-violet-500/10',  label: 'Date Sheets' },
  marks:        { Icon: GraduationCap,  text: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Marks' },
  attendance:   { Icon: CalendarCheck,  text: 'text-sky-500',     bg: 'bg-sky-500/10',     label: 'Attendance' },
  'fee-due':    { Icon: Wallet,         text: 'text-amber-600',   bg: 'bg-amber-500/10',   label: 'Fees Due' },
  'fee-paid':   { Icon: BadgeCheck,     text: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Fees Paid' },
  fee:          { Icon: Receipt,        text: 'text-orange-600',  bg: 'bg-orange-500/10',  label: 'Fees' },
  'app-update': { Icon: Download,       text: 'text-primary',     bg: 'bg-primary/10',     label: 'App Updates' },
  result:       { Icon: Award,          text: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Results' },
  salary:       { Icon: Wallet,         text: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Salary' },
  complaint:    { Icon: AlertCircle,    text: 'text-rose-500',    bg: 'bg-rose-500/10',    label: 'Complaints' },
  general:      { Icon: Bell,           text: 'text-muted-foreground', bg: 'bg-muted',     label: 'General' },
};

function notifMeta(type: string) {
  return notifIconMap[type] || { Icon: Bell, text: 'text-muted-foreground', bg: 'bg-muted', label: 'Other' };
}

// ─── Relative time formatting (mirrors role-portal.tsx) ────────────────────
// CRITICAL: SQLite datetime('now') returns UTC without a timezone marker.
// We append 'Z' so JS parses it as UTC, not local time.
function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  let normalized = iso;
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

// ─── Full date formatting for expanded view ────────────────────────────────
function formatFullDate(iso: string): string {
  if (!iso) return '';
  let normalized = iso;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(normalized) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized = normalized.replace(' ', 'T') + 'Z';
  }
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Filter tab type ───────────────────────────────────────────────────────
type FilterTab = 'all' | 'unread' | string;

interface NotificationsPageProps {
  user: any;
}

export function NotificationsPage({ user }: NotificationsPageProps) {
  const { setActiveModule } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const firstLoadRef = useRef(true);

  // ── Fetch all notifications ──
  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.getNotifications(200);
      const newItems = Array.isArray(data?.items) ? data.items : [];
      setItems(newItems);
    } catch (e) {
      console.error('[notifications-page] load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(() => loadNotifications(true), 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // ── Derived: unread count + available type filters ──
  const unreadCount = items.filter((n) => !n?.read).length;
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    items.forEach((n) => { if (n?.type) types.add(n.type); });
    return Array.from(types).sort();
  }, [items]);

  // ── Derived: filtered + searched items ──
  const filteredItems = useMemo(() => {
    let result = items;
    if (filter === 'unread') {
      result = result.filter((n) => !n?.read);
    } else if (filter !== 'all') {
      result = result.filter((n) => n?.type === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((n) =>
        (n?.title || '').toLowerCase().includes(q) ||
        (n?.body || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, filter, search]);

  // ── Mark single as read + navigate ──
  const handleNotifClick = useCallback(async (n: any) => {
    // Toggle expand
    setExpandedId((prev) => (prev === n?.id ? null : n?.id ?? null));
    // Mark as read
    if (!n?.read) {
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: 1 } : x));
      try {
        await api.markNotificationRead(n.id);
      } catch (e) {
        console.error('[notifications-page] markRead failed:', e);
      }
    }
    // Navigate based on route
    const data = typeof n?.data === 'string' ? (() => { try { return JSON.parse(n.data); } catch { return {}; } })() : (n?.data || {});
    const route = data?.route;
    if (route) {
      // Use the same navigation logic as the FCM bridge
      const w = window as any;
      if (w?.concordiaNative?.onNotificationTap) {
        w.concordiaNative.onNotificationTap(data);
      } else {
        // Fallback: navigate within the app
        switch (route) {
          case 'announcements':
            setActiveModule('announcements');
            break;
          case 'fees':
            setActiveModule('student-fees');
            break;
          case 'attendance':
            setActiveModule('student-attendance');
            break;
          case 'results':
            setActiveModule('student-results');
            break;
          default:
            break;
        }
      }
    }
  }, [setActiveModule]);

  // ── Mark all as read ──
  const handleMarkAllRead = useCallback(async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: 1 })));
    try {
      await api.markAllNotificationsRead();
      toast({ title: 'All notifications marked as read' });
    } catch (e) {
      toast({ title: 'Failed to mark notifications as read', variant: 'destructive' });
    }
  }, []);

  // ── Filter tab button ──
  const FilterButton = ({ tab, label, count }: { tab: FilterTab; label: string; count?: number }) => {
    const active = filter === tab;
    return (
      <button
        onClick={() => setFilter(tab)}
        className={cn(
          'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap',
          active
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <span>{label}</span>
        {count !== undefined && count > 0 && (
          <span className={cn(
            'inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold leading-none',
            active ? 'bg-white/25 text-white' : 'bg-rose-500 text-white',
          )}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      {/* ─── Page header ─── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-primary tracking-tight">Notifications</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {items.length} total
                  {unreadCount > 0 && (
                    <span className="text-rose-500 font-medium"> · {unreadCount} unread</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadNotifications(true)}
                disabled={refreshing}
                className="gap-1.5"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {unreadCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="gap-1.5 bg-primary hover:bg-primary/90"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mark all read</span>
                  <span className="sm:hidden">Read all</span>
                </Button>
              )}
            </div>
          </div>

          {/* ─── Search bar ─── */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="w-full h-10 pl-9 pr-9 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md hover:bg-muted text-muted-foreground transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* ─── Filter tabs ─── */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto scroll-fancy pb-1 -mx-1 px-1">
            <FilterButton tab="all" label="All" count={items.length} />
            <FilterButton tab="unread" label="Unread" count={unreadCount} />
            {/* Type filter dropdown */}
            <button
              onClick={() => setShowTypeFilter((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap',
                filter !== 'all' && filter !== 'unread'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              {filter !== 'all' && filter !== 'unread'
                ? notifMeta(filter).label
                : 'By Type'}
            </button>
            {/* Quick type chips (show top 4 types) */}
            {availableTypes.slice(0, 5).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap',
                  filter === type
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent',
                )}
              >
                {notifMeta(type).label}
              </button>
            ))}
          </div>

          {/* Type filter dropdown panel */}
          <AnimatePresence>
            {showTypeFilter && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-1.5 pt-3 pb-1">
                  {availableTypes.map((type) => {
                    const meta = notifMeta(type);
                    const count = items.filter((n) => n?.type === type).length;
                    return (
                      <button
                        key={type}
                        onClick={() => { setFilter(type); setShowTypeFilter(false); }}
                        className={cn(
                          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition border',
                          filter === type
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-border hover:bg-muted',
                        )}
                      >
                        <span className={cn('h-5 w-5 rounded grid place-items-center', meta.bg)}>
                          <meta.Icon className={cn('h-3 w-3', meta.text)} />
                        </span>
                        {meta.label}
                        <span className="opacity-60">({count})</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Notifications list ─── */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Loading skeleton */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card animate-pulse">
                <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                  <div className="h-2.5 w-1/4 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="h-20 w-20 rounded-full bg-muted/50 grid place-items-center mb-5">
              <Inbox className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-primary mb-1">
              {search ? 'No matching notifications' :
               filter === 'unread' ? 'No unread notifications' :
               filter !== 'all' ? `No ${notifMeta(filter).label.toLowerCase()}` :
               'No notifications yet'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search
                ? 'Try a different search term or clear the search.'
                : filter === 'unread'
                ? 'You\u2019re all caught up. Switch to "All" to see your full history.'
                : filter !== 'all'
                ? `You have no ${notifMeta(filter).label.toLowerCase()} notifications. Try another filter.`
                : 'When announcements, fees, attendance, or marks are posted, they\u2019ll appear here.'}
            </p>
            {(search || filter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-5 gap-1.5"
                onClick={() => { setSearch(''); setFilter('all'); }}
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </motion.div>
        ) : (
          /* Notification list */
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {filteredItems.map((n, idx) => {
                const { Icon, text, bg } = notifMeta(n?.type);
                const isExpanded = expandedId === n?.id;
                return (
                  <motion.div
                    key={n?.id ?? idx}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2) }}
                  >
                    <button
                      type="button"
                      onClick={() => handleNotifClick(n)}
                      className={cn(
                        'w-full text-left flex items-start gap-3 p-4 rounded-xl border transition group',
                        n?.read
                          ? 'bg-card border-border hover:bg-accent/50 hover:border-border/80'
                          : 'bg-primary/[0.03] border-primary/20 hover:bg-primary/[0.06] hover:border-primary/30',
                      )}
                    >
                      {/* Icon */}
                      <div className={cn('h-10 w-10 rounded-full grid place-items-center shrink-0', bg)}>
                        <Icon className={cn('h-4 w-4', text)} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'text-sm truncate',
                            n?.read ? 'font-medium text-foreground' : 'font-semibold text-primary',
                          )}>
                            {n?.title}
                          </span>
                          {!n?.read && (
                            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0 ring-2 ring-background" />
                          )}
                        </div>
                        {n?.body && (
                          <p className={cn(
                            'text-sm text-muted-foreground mt-1',
                            isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
                          )}>
                            {n.body}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-muted-foreground/70 font-medium">
                            {formatRelativeTime(n?.createdAt)}
                          </span>
                          {isExpanded && n?.createdAt && (
                            <>
                              <span className="text-[11px] text-muted-foreground/40">·</span>
                              <span className="text-[11px] text-muted-foreground/60">
                                {formatFullDate(n?.createdAt)}
                              </span>
                            </>
                          )}
                          {n?.type && (
                            <>
                              <span className="text-[11px] text-muted-foreground/40">·</span>
                              <span className={cn('text-[11px] font-medium', text)}>
                                {notifMeta(n.type).label}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Unread indicator on the right */}
                      {!n?.read && (
                        <div className="shrink-0 pt-1">
                          <div className="h-2 w-2 rounded-full bg-rose-500" />
                        </div>
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Footer info */}
            {filteredItems.length > 0 && (
              <div className="text-center pt-6 pb-2">
                <p className="text-xs text-muted-foreground">
                  Showing {filteredItems.length} of {items.length} notification{items.length !== 1 ? 's' : ''}
                  {items.length >= 200 && ' (showing latest 200)'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

