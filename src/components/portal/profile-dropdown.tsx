'use client';

// v4.5.2 — Profile dropdown menu (replaces the static avatar+name block in the navbar).
//
// Clicking the avatar in the navbar opens a Radix DropdownMenu with:
//   • User info card (photo / initials, name, email, role badge)
//   • My Profile   → switches to the Settings module
//   • Notifications → switches to the Notifications module
//   • Help & Support → switches to the Help module
//   • What's New    → opens the WhatsNewDialog
//   • Download App  → opens /download in a new tab
//   • Sign Out      → logs the user out
//
// The avatar shows the user's photoUrl (if set) or a gradient initials badge
// as a fallback. The sidebar avatar (in role-portal.tsx) is also updated to
// honor photoUrl so the experience is consistent everywhere.

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  User as UserIcon,
  Bell,
  LifeBuoy,
  Sparkles,
  Download,
  LogOut,
  ChevronDown,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProfileDropdownUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  photoUrl?: string | null;
  campus?: string;
  rollNo?: string;
} | null;

type Props = {
  user: ProfileDropdownUser;
  onNavigate: (moduleId: 'settings' | 'notifications' | 'help') => void;
  onShowWhatsNew: () => void;
  onDownloadApp: () => void;
  onSignOut: () => void;
};

function initials(name: string): string {
  return (name || 'A')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ProfileDropdown({
  user,
  onNavigate,
  onShowWhatsNew,
  onDownloadApp,
  onSignOut,
}: Props) {
  if (!user) return null;
  const name = user.name || 'User';
  const email = user.email || '';
  const photo = user.photoUrl || undefined;
  const ini = initials(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 rounded-lg p-1 sm:pl-2 sm:pr-2.5 sm:py-1 hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-label="Open profile menu"
        >
          <Avatar className="h-8 w-8 ring-1 ring-gray-200 group-hover:ring-[#F26522]/40 transition">
            {photo ? (
              <AvatarImage src={photo} alt={name} className="object-cover" />
            ) : null}
            <AvatarFallback
              className="text-white text-[11px] font-bold"
              style={{
                background:
                  'linear-gradient(135deg, #F26522 0%, #D4541E 100%)',
              }}
            >
              {ini}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:block leading-tight text-left">
            <div className="text-[13px] font-semibold text-[#1A1A1A] truncate max-w-[140px]">
              {name}
            </div>
            <div className="text-[11px] text-gray-400 truncate max-w-[140px]">
              {user.roleLabel || user.role}
            </div>
          </div>
          <ChevronDown className="hidden md:block h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 p-0 rounded-xl shadow-lg border-border/80 overflow-hidden"
      >
        {/* ── User info card (header) ── */}
        <div className="relative bg-gradient-to-br from-[#FFF0E8] via-white to-[#FFF7F1] px-4 pt-4 pb-4 border-b border-border">
          <div className="absolute top-0 right-0 h-16 w-16 rounded-full bg-[#F26522]/8 blur-2xl" aria-hidden />
          <div className="flex items-center gap-3 relative">
            <Avatar className="h-12 w-12 ring-2 ring-white shadow-sm">
              {photo ? (
                <AvatarImage src={photo} alt={name} className="object-cover" />
              ) : null}
              <AvatarFallback
                className="text-white text-sm font-bold"
                style={{
                  background:
                    'linear-gradient(135deg, #F26522 0%, #D4541E 100%)',
                }}
              >
                {ini}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#1A1A1A] truncate">
                {name}
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                {email}
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant="secondary"
                  className="text-[10px] py-0 px-1.5 font-semibold bg-[#F26522]/10 text-[#D4541E] border-[#F26522]/20 hover:bg-[#F26522]/15"
                >
                  {user.roleLabel || user.role}
                </Badge>
                {user.rollNo && (
                  <span className="text-[10px] text-gray-400">
                    Roll #{user.rollNo}
                  </span>
                )}
              </div>
            </div>
          </div>
          {user.campus && (
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate">{user.campus}</span>
            </div>
          )}
        </div>

        {/* ── Quick links ── */}
        <div className="p-1.5">
          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Account
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onNavigate('settings');
            }}
            className="rounded-md cursor-pointer py-2 px-2 focus:bg-accent"
          >
            <UserIcon className="h-4 w-4 mr-2.5 text-gray-500" />
            <span className="text-sm">My Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onNavigate('notifications');
            }}
            className="rounded-md cursor-pointer py-2 px-2 focus:bg-accent"
          >
            <Bell className="h-4 w-4 mr-2.5 text-gray-500" />
            <span className="text-sm">Notifications</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onNavigate('help');
            }}
            className="rounded-md cursor-pointer py-2 px-2 focus:bg-accent"
          >
            <LifeBuoy className="h-4 w-4 mr-2.5 text-gray-500" />
            <span className="text-sm">Help &amp; Support</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Discover
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onShowWhatsNew();
            }}
            className="rounded-md cursor-pointer py-2 px-2 focus:bg-accent"
          >
            <Sparkles className="h-4 w-4 mr-2.5 text-[#F26522]" />
            <span className="text-sm font-medium">What&apos;s New</span>
            <span className="ml-auto text-[10px] font-semibold text-white bg-[#F26522] rounded-full px-1.5 py-0.5">
              v4.5.2
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onDownloadApp();
            }}
            className="rounded-md cursor-pointer py-2 px-2 focus:bg-accent"
          >
            <Download className="h-4 w-4 mr-2.5 text-gray-500" />
            <span className="text-sm">Download Mobile App</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onSignOut();
            }}
            className={cn(
              'rounded-md cursor-pointer py-2 px-2 focus:bg-rose-50',
              'text-rose-600 focus:text-rose-700',
            )}
          >
            <LogOut className="h-4 w-4 mr-2.5" />
            <span className="text-sm font-medium">Sign out</span>
          </DropdownMenuItem>
        </div>

        {/* ── Footer ── */}
        <div className="px-3 py-2 bg-muted/30 border-t border-border/60 text-[10px] text-gray-400 flex items-center justify-between">
          <span>Concordia College</span>
          <span className="font-mono">v4.5.2</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
