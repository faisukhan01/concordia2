'use client';

// v4.5.2 — "What's New" changelog dialog.
//
// Shows a modal with the latest feature highlights for the current version.
// Auto-opens ONCE per version (tracked in localStorage via `whatsnew_seen_<ver>`).
// Can be manually opened from the ProfileDropdown → "What's New" item.

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  X,
  Bell,
  Image as ImageIcon,
  ShieldCheck,
  HelpCircle,
  Clock,
  Smartphone,
  Settings,
  Palette,
  type LucideIcon,
} from 'lucide-react';

export const APP_VERSION = '4.5.2';

type ReleaseNote = {
  version: string;
  date: string;
  title: string;
  highlight?: boolean;
  items: {
    icon: LucideIcon;
    title: string;
    desc: string;
    accent: string; // tailwind color class for icon bg
  }[];
};

// ── Changelog ──
const CHANGELOG: ReleaseNote[] = [
  {
    version: '4.5.2',
    date: 'August 2026',
    title: 'Profile Menu & What’s New',
    highlight: true,
    items: [
      {
        icon: Settings,
        title: 'Profile Dropdown Menu',
        desc: 'Click your avatar in the top bar to access your profile, notifications, help, what\u2019s new, and sign out \u2014 all in one place.',
        accent: 'bg-[#F26522]/10 text-[#D4541E]',
      },
      {
        icon: ImageIcon,
        title: 'Avatar Photo Everywhere',
        desc: 'Your profile photo now appears in the navbar and sidebar (not just Settings). Falls back to gradient initials if no photo is set.',
        accent: 'bg-violet-100 text-violet-700',
      },
      {
        icon: Sparkles,
        title: 'What’s New Dialog',
        desc: 'A friendly changelog that auto-opens when we ship a new version so you never miss a feature.',
        accent: 'bg-amber-100 text-amber-700',
      },
      {
        icon: ShieldCheck,
        title: 'Dismissible Password Banner',
        desc: 'The \u201Cplease change your password\u201D reminder can now be snoozed for 7 days instead of following you on every page forever.',
        accent: 'bg-emerald-100 text-emerald-700',
      },
      {
        icon: Clock,
        title: 'Recent Activity on Dashboard',
        desc: 'The Admin dashboard now surfaces a live feed of the latest fee payments, enrollments, and attendance marks.',
        accent: 'bg-sky-100 text-sky-700',
      },
    ],
  },
  {
    version: '4.5.1',
    date: 'August 2026',
    title: 'Help Center & Profile Photo',
    items: [
      {
        icon: HelpCircle,
        title: 'Help & Support Page',
        desc: 'Browse 18 FAQs across 5 categories, view contact info, and report issues directly to staff with a reference number.',
        accent: 'bg-blue-100 text-blue-700',
      },
      {
        icon: ImageIcon,
        title: 'Profile Photo Upload',
        desc: 'Upload your photo from Settings \u2192 Profile Information. Validates type, size (max 2 MB), and updates instantly.',
        accent: 'bg-violet-100 text-violet-700',
      },
      {
        icon: Clock,
        title: 'Reliable Timestamps',
        desc: 'Fixed \u201CJan 1, 1970\u201D bug in Settings \u2192 Account & Sessions by parsing all three timestamp formats (epoch, ISO, SQLite datetime).',
        accent: 'bg-rose-100 text-rose-700',
      },
    ],
  },
  {
    version: '4.5.0',
    date: 'August 2026',
    title: 'App-Closed Notifications',
    items: [
      {
        icon: Smartphone,
        title: 'Auto-start Permission Prompt',
        desc: 'The mobile app now shows a dialog explaining how to enable Auto-start + battery whitelist \u2014 required for WhatsApp-like delivery on Realme/Xiaomi.',
        accent: 'bg-emerald-100 text-emerald-700',
      },
      {
        icon: Bell,
        title: 'Notification Preferences',
        desc: 'Mute specific notification types, set Do Not Disturb hours, and toggle the notification sound \u2014 all from Settings.',
        accent: 'bg-[#F26522]/10 text-[#D4541E]',
      },
      {
        icon: Palette,
        title: 'Settings Page Rewrite',
        desc: 'A richer Settings experience with Account & Sessions, registered devices, and sign-out-all-devices.',
        accent: 'bg-amber-100 text-amber-700',
      },
    ],
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function WhatsNewDialog({ open, onOpenChange }: Props) {
  // Auto-open on version change (controlled by parent via `open` prop).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        {/* Hero header */}
        <div className="relative bg-gradient-to-br from-[#F26522] via-[#E85A1F] to-[#D4541E] px-6 pt-6 pb-8 text-white overflow-hidden">
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-white/5 blur-xl" aria-hidden />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 h-8 w-8 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              What&apos;s New
            </span>
          </div>
          <h2 className="relative text-2xl font-extrabold mb-1">
            Concordia v4.5.2
          </h2>
          <p className="relative text-sm text-white/85 max-w-sm">
            A friendlier profile menu, smarter notifications, and a fresh new
            look for your avatar — here’s what’s new.
          </p>
        </div>

        {/* Changelog list */}
        <ScrollArea className="max-h-[55vh]">
          <div className="px-6 py-5 space-y-6">
            {CHANGELOG.map((release) => (
              <div key={release.version}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#F26522] rounded-full px-2 py-0.5">
                    v{release.version}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {release.date}
                  </span>
                  {release.highlight && (
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      Latest
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-[#1A1A1A] mb-3">
                  {release.title}
                </h3>
                <ul className="space-y-2.5">
                  {release.items.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <div
                        className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${item.accent}`}
                      >
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {item.title}
                        </div>
                        <div className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                          {item.desc}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 bg-muted/20">
          <p className="text-[11px] text-gray-500">
            We ship updates regularly. Stay tuned for more!
          </p>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-[#F26522] hover:bg-[#D4541E] text-white"
          >
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Hook: auto-open the dialog when the version changes ──
//
// Returns [open, setOpen]. The dialog auto-opens ONCE per version (tracked in
// localStorage). After the user closes it, it won't open again until the
// APP_VERSION constant changes.
export function useWhatsNewAutoOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const STORAGE_KEY = `concordia:whatsnew_seen_${APP_VERSION}`;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        // Small delay so the portal has time to render before the modal pops.
        const t = setTimeout(() => setOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable (private mode etc.) — skip auto-open.
    }
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      try {
        localStorage.setItem(
          `concordia:whatsnew_seen_${APP_VERSION}`,
          Date.now().toString(),
        );
      } catch {
        // ignore
      }
    }
  };

  return [open, handleOpenChange] as const;
}
