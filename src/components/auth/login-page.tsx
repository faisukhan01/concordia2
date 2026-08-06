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

// ==================== Concordia College — Sign In ====================
// Layout (v4.7.4 — refined):
//   • Full-page campus photograph as the background — clearly visible
//   • LEFT  — clean frosted-glass login card: logo, username, password,
//             single "Login" button, copyright, powered-by FaQ pill
//   • RIGHT — large "Powered by FaQ" product-owner branding (centered)
//
// The campus image covers the entire viewport. A subtle left-to-right
// gradient ensures the white card on the left has enough contrast, while
// the right side shows the campus in full colour.

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
      {/* ─── Full-page campus photograph — covers the entire viewport ─── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/concordia-campus.jpg)' }}
      />
      {/* v4.1.0: Theme toggle REMOVED — default light theme is the intended design. */}
      {/* Barely-there gradient — only the far-left edge is darkened slightly
          so the white login card has enough contrast. Campus photo stays
          bright everywhere else. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/15 via-transparent to-transparent" />
      {/* Bottom vignette so the copyright text is readable */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />

      {/* ─── Main two-column layout ─── */}
      <div className="relative z-20 min-h-screen flex items-stretch justify-between">
        {/* ═══════════ LEFT — fully transparent glassmorphism login card ═══════════ */}
        <div className="flex-1 lg:flex-[0.42] flex items-center justify-start px-6 sm:px-10 lg:pl-16 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-[400px]"
          >
            {/* Aesthetic frosted-glass card — 20% white opacity + backdrop blur.
                This is the sweet spot: the card is clearly defined as a distinct
                frosted panel (not transparent), while the campus photo remains
                softly visible through the blur. Inline style guarantees the exact
                opacity renders consistently across builds. */}
            <div
              className="rounded-2xl ring-1 ring-white/60 px-8 py-10 shadow-2xl shadow-black/30 backdrop-blur-xl backdrop-saturate-150"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.20)' }}
            >
              {/* Logo — white bg pill so it's always visible regardless of background */}
              <div className="mb-8 flex justify-center">
                <div className="rounded-xl bg-white px-5 py-3 shadow-lg shadow-black/10">
                  <BrandLogo size="lg" priority />
                </div>
              </div>

              {/* Heading */}
              <h1 className="text-[26px] leading-tight font-bold text-white tracking-tight text-center drop-shadow-sm">
                Sign in
              </h1>
              <p className="text-sm text-white/70 mt-1.5 text-center">
                Use your Concordia account to continue
              </p>

              {/* Form */}
              <form onSubmit={handleSubmit} className="mt-7 space-y-3.5">
                {/* Username */}
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/50 pointer-events-none" />
                  <input
                    id="login-email"
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="Enter Username"
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-white/20 bg-white/10 text-white text-sm outline-none transition-all focus:border-[#F26522] focus:bg-white/20 focus:ring-2 focus:ring-[#F26522]/30 placeholder:text-white/50"
                  />
                </div>

                {/* Password */}
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-white/50 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter Password"
                    className="w-full h-12 pl-11 pr-11 rounded-xl border border-white/20 bg-white/10 text-white text-sm outline-none transition-all focus:border-[#F26522] focus:bg-white/20 focus:ring-2 focus:ring-[#F26522]/30 placeholder:text-white/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>

                {/* Single Login button */}
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileTap={{ scale: 0.985 }}
                  className="w-full h-12 rounded-xl bg-[#F26522] hover:bg-[#D4541E] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#F26522]/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-1"
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

            <p className="text-center text-[11px] text-white/70 mt-5 drop-shadow">
              © {new Date().getFullYear()} Concordia College · All rights reserved
            </p>
            {/* Mobile-only powered-by (right side is hidden on mobile) */}
            <div className="mt-4 flex justify-center lg:hidden">
              <PoweredByFaq variant="on-dark" align="center" />
            </div>
          </motion.div>
        </div>

        {/* ═══════════ RIGHT — "Powered by FaQ" product-owner branding ═══════════ */}
        {/* v4.7.4: Demo accounts panel + student/teacher help text REMOVED.
            Now shows the FaQ Systems product-owner branding — large, centered,
            with a glassmorphism pill over the campus photo. */}
        <div className="hidden lg:flex lg:flex-[0.58] items-center justify-center px-8 py-12">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.4, 0, 0.2, 1] }}
            className="w-full max-w-[460px] flex flex-col items-center"
          >
            <PoweredByFaq variant="on-dark" align="center" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
