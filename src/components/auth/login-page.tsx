'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';
import {
  Lock, Eye, EyeOff, Loader2, ArrowRight, User as UserIcon,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { BrandLogo } from '@/components/brand-logo';
import { PoweredByFaq } from '@/components/powered-by-faq';
// v4.1.0: ThemeToggle import REMOVED — user requested removal of the theme
// switcher from the entire app (default light theme is the intended design).
// v4.7.4: Demo accounts panel + student/teacher help text REMOVED per user
// request. The right side now shows the "Powered by FaQ" product-owner
// branding (the user is the product owner of the platform).
// v4.7.6: Login card redesigned as a STUNNING premium glass crystal — lower
// opacity, stronger blur, iridescent edge gradient, inset highlights, outer
// glow. FaQ logo moved to the BOTTOM-RIGHT corner with an aesthetic WHITE
// card background (replacing the centered transparent glass pill).
// v4.7.7: MOBILE-ONLY refinements (desktop untouched): smaller FaQ logo
// (120px via size="sm"), reduced card padding on small screens, softer
// iridescent halo on mobile, smaller heading/logo on mobile. Portal footer
// FaQ logo REMOVED (both web + mobile). Sidebar FaQ logo shrunk further
// (180→140px expanded, 84→64px collapsed).

// ==================== Concordia College — Sign In ====================
// Layout (v4.7.6 — refined premium glass):
//   • Full-page campus photograph as the background — clearly visible
//   • LEFT  — stunning premium frosted-glass crystal card: logo, username,
//             password, single "Login" button, copyright
//   • FaQ   — bottom-right corner, aesthetic WHITE card (pops against
//             the campus photo, premium product-owner credit)
//
// The campus image covers the entire viewport. A subtle left-to-right
// gradient ensures the white card on the left has enough contrast, while
// the right side shows the campus in full colour. The FaQ credit sits at
// the bottom-right corner as a refined white card.

export function LoginPage() {
  const setView = useApp(s => s.setView);
  const setUser = useApp(s => s.setUser);
  const setToken = useApp(s => s.setToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: 'All fields are required', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      setToken(token);
      setUser(user);
      if (user.blockedMessage) {
        toast({ title: 'Access Blocked', description: user.blockedMessage, variant: 'destructive' });
      } else {
        toast({
          title: `Welcome back, ${user.name?.split(' ')[0] || ''}`,
          description: `Signed in as ${user.roleLabel}`,
        });
      }
      setView('portal');
    } catch (err: any) {
      const msg = err.message || 'Sign in failed';
      if (msg.includes('Cannot connect') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        toast({ title: 'Connection Error', description: 'Cannot reach the server. Please wait a moment and try again.', variant: 'destructive' });
      } else if (msg.includes('locked') || msg.includes('Too many') || msg.includes('429')) {
        toast({ title: 'Account Temporarily Locked', description: msg, variant: 'destructive' });
      } else if (msg.includes('Invalid') || msg.includes('401') || msg.includes('incorrect')) {
        toast({
          title: 'Login failed',
          description: 'Invalid username or password. Please check your credentials and try again.',
          variant: 'destructive',
        });
      } else if (msg.includes('blocked') || msg.includes('Blocked') || msg.includes('retired')) {
        toast({ title: 'Access Blocked', description: msg, variant: 'destructive' });
      } else {
        toast({ title: 'Login failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* ─── Full-page campus photograph — sharp HD, no blur ───
          Uses the high-quality HD JPEG (1920×1440, q92, 4:4:4 chroma)
          generated from the original PNG. NO blur filter — the campus
          building + signage stay crisp and legible at any viewport.
          A light brightness/contrast/saturate grade sets the mood; the
          login card on top uses its own backdrop-blur for readability. */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url(/concordia-campus-hd.jpg)',
          filter: 'brightness(0.94) contrast(1.06) saturate(1.10)',
        }}
      />
      {/* v4.1.0: Theme toggle REMOVED — default light theme is the intended design. */}
      {/* v4.7.8: Refined gradient overlays — a soft aesthetic wash that
          enhances the premium glass look while keeping the campus visible.
          Left side gets a subtle darkening for card contrast; right side
          stays brighter with a warm tint for an inviting, polished mood. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/25 via-black/8 to-black/15" />
      {/* Subtle warm tint overlay for an aesthetic, cohesive mood */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(242, 101, 34, 0.06) 0%, transparent 40%, rgba(15, 118, 110, 0.05) 100%)',
        }}
      />
      {/* Bottom vignette so the copyright + bottom-right FaQ card read clearly */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/55 to-transparent" />

      {/* ─── Main layout — left card + bottom-right FaQ credit ─── */}
      <div className="relative z-20 min-h-screen flex items-stretch justify-between">
        {/* ═══════════ LEFT — STUNNING premium glass crystal card ═══════════ */}
        <div className="flex-1 lg:flex-[0.42] flex items-center justify-start px-5 sm:px-10 lg:pl-16 py-10 lg:py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-[380px] lg:max-w-[420px]"
          >
            {/* Premium glass crystal card — very transparent, strong blur,
                iridescent edge, inset highlights, outer glow.
                This is the v4.7.6 stunning redesign: lower opacity (0.10),
                stronger backdrop blur (3xl + saturate 1.8), a soft iridescent
                edge gradient wrapper, inset top highlight, and a deep outer
                glow. The card feels like a floating crystal over the campus.
                v4.7.7: Mobile uses tighter padding + softer halo; desktop
                (lg:) keeps the original spacious premium feel. */}
            <div className="relative">
              {/* Iridescent edge glow — soft halo behind the card.
                  Mobile: subtler (opacity-40, blur-md) so it doesn't overwhelm
                  a small screen. Desktop: full (opacity-70, blur-lg). */}
              <div
                className="absolute -inset-1.5 rounded-[28px] opacity-40 blur-md lg:opacity-70 lg:blur-lg"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(242,101,34,0.15) 35%, rgba(255,255,255,0.25) 65%, rgba(15,118,110,0.18) 100%)',
                }}
              />

              {/* Main glass card — mobile: px-6 py-8, desktop: px-9 py-11 */}
              <div
                className="relative rounded-[20px] lg:rounded-[24px] px-6 py-8 lg:px-9 lg:py-11 backdrop-blur-3xl backdrop-saturate-[1.8]"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.10)',
                  border: '1px solid rgba(255, 255, 255, 0.30)',
                  boxShadow:
                    '0 24px 64px rgba(0, 0, 0, 0.28), 0 8px 24px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Logo — white bg pill so it's always visible regardless of background.
                    Mobile: smaller pill (px-5 py-3). Desktop: px-6 py-3.5. */}
                <div className="mb-6 lg:mb-8 flex justify-center">
                  <div
                    className="rounded-2xl bg-white px-5 py-3 lg:px-6 lg:py-3.5"
                    style={{
                      boxShadow:
                        '0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 1)',
                    }}
                  >
                    <BrandLogo size="lg" priority />
                  </div>
                </div>

                {/* Heading — refined premium typography.
                    Mobile: 24px. Desktop: 28px. */}
                <h1
                  className="text-[24px] lg:text-[28px] leading-tight font-bold text-white tracking-tight text-center"
                  style={{ textShadow: '0 2px 12px rgba(0, 0, 0, 0.35)' }}
                >
                  Sign in
                </h1>
                <p
                  className="text-[13px] lg:text-sm text-white/80 mt-1.5 lg:mt-2 text-center tracking-wide"
                  style={{ textShadow: '0 1px 6px rgba(0, 0, 0, 0.3)' }}
                >
                  Use your Concordia account to continue
                </p>

                {/* Subtle accent divider */}
                <div className="mt-5 mb-6 lg:mt-6 lg:mb-7 flex justify-center">
                  <div
                    className="h-px w-14 lg:w-16 rounded-full"
                    style={{
                      background:
                        'linear-gradient(to right, transparent, rgba(255,255,255,0.5), transparent)',
                    }}
                  />
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {/* Username */}
                  <div className="relative group">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/55 pointer-events-none transition-colors group-focus-within:text-white" />
                    <input
                      id="login-email"
                      type="text"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="username"
                      placeholder="Enter Username"
                      className="w-full h-12 pl-12 pr-4 rounded-xl border border-white/20 bg-white/10 text-white text-sm outline-none transition-all focus:border-[#F26522] focus:bg-white/15 focus:ring-2 focus:ring-[#F26522]/40 placeholder:text-white/55"
                    />
                  </div>

                  {/* Password */}
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/55 pointer-events-none transition-colors group-focus-within:text-white" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Enter Password"
                      className="w-full h-12 pl-12 pr-12 rounded-xl border border-white/20 bg-white/10 text-white text-sm outline-none transition-all focus:border-[#F26522] focus:bg-white/15 focus:ring-2 focus:ring-[#F26522]/40 placeholder:text-white/55"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/55 hover:text-white transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>

                  {/* Single Login button — premium gradient + glow */}
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileTap={{ scale: 0.985 }}
                    whileHover={{ scale: 1.01 }}
                    className="w-full h-12 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2 relative overflow-hidden"
                    style={{
                      background:
                        'linear-gradient(135deg, #F26522 0%, #D4541E 100%)',
                      boxShadow:
                        '0 10px 28px rgba(242, 101, 34, 0.45), 0 2px 8px rgba(242, 101, 34, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
                    }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Logging in…
                      </>
                    ) : (
                      <>
                        Login
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </motion.button>
                </form>
              </div>
            </div>

            <p
              className="text-center text-[11px] text-white/80 mt-5 tracking-wide"
              style={{ textShadow: '0 1px 4px rgba(0, 0, 0, 0.4)' }}
            >
              © {new Date().getFullYear()} Concordia College · All rights reserved
            </p>
            {/* Mobile-only powered-by — aesthetic white card (matches the
                desktop bottom-right corner credit). Right side FaQ is
                hidden on mobile, so we show the white card here instead.
                v4.7.9: Uses size="xs" (92px) — refined and proportional on
                small screens, less dominant than the previous 'sm' (120px). */}
            <div className="mt-4 flex justify-center lg:hidden">
              <PoweredByFaq variant="on-light" align="center" size="xs" />
            </div>
          </motion.div>
        </div>

        {/* ═══════════ RIGHT — empty (campus photo visible) ═══════════ */}
        {/* v4.7.4 had the FaQ logo centered here. v4.7.6 MOVES it to the
            bottom-right corner (see absolute element below) so the right
            side shows the campus photo in full, and the FaQ credit sits
            as a refined white card at the corner — premium and intentional. */}
        <div className="hidden lg:block lg:flex-[0.58]" />

        {/* ═══════════ FaQ credit — BOTTOM-RIGHT corner, aesthetic WHITE card ═══════════ */}
        {/* Sits at the bottom-right corner of the page (where the user's
            red-lined box was). White aesthetic background (not transparent)
            so the teal FaQ logo pops against the campus photo. Premium
            product-owner credit, refined and intentional. */}
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="hidden lg:block absolute bottom-7 right-7 z-30"
        >
          <PoweredByFaq variant="on-light" align="center" size="xs" />
        </motion.div>
      </div>
    </div>
  );
}
