'use client';

// ─────────────────────────────────────────────────────────────
// Concordia College — Theme Provider
//
// Wraps next-themes to enable light/dark mode across the app.
// The dark mode CSS variables are already defined in globals.css
// under the `.dark` selector. This provider toggles the `dark`
// class on the <html> element based on the user's preference.
//
// The theme is persisted in localStorage and respects the user's
// system preference on first visit.
// ─────────────────────────────────────────────────────────────

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps } from 'next-themes';

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
