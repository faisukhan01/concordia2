'use client';

// ─────────────────────────────────────────────────────────────
// Concordia College — Theme Toggle
//
// A compact icon button that cycles between light and dark mode.
// Uses next-themes' useTheme hook. Renders a Sun icon in dark
// mode (click → switch to light) and a Moon icon in light mode
// (click → switch to dark).
//
// Mounted in the role-portal header next to the notifications bell.
// ─────────────────────────────────────────────────────────────

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — next-themes reads localStorage on the client.
  // This is the official next-themes pattern — the mounted flag ensures we
  // only render the actual icon after hydration to prevent SSR/client mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render a placeholder with the same dimensions to prevent layout shift.
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground opacity-0 ${className}`}
      >
        <Sun className="h-4 w-4" />
      </button>
    );
  }

  const current = resolvedTheme || theme || 'light';
  const isDark = current === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground hover:border-primary/30 active:scale-95 ${className}`}
    >
      {/* Sun icon — visible in dark mode (click to go light) */}
      <Sun
        className={`h-4 w-4 transition-all duration-300 ${
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
        } absolute`}
      />
      {/* Moon icon — visible in light mode (click to go dark) */}
      <Moon
        className={`h-4 w-4 transition-all duration-300 ${
          isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        } absolute`}
      />
    </button>
  );
}
