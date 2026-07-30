'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import {
  BarChart3,
  Wallet,
  CalendarCheck,
  FileText,
  Megaphone,
  Users,
  Download,
  ArrowRight,
  ShieldCheck,
  Crown,
  Building2,
  UserPlus,
  Calculator,
  BookOpen,
  Presentation,
  GraduationCap,
  HeartHandshake,
  Sparkles,
  Check,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';

const APK_DOWNLOAD_URL =
  'https://github.com/faisukhan01/concordia2/releases/latest/download/concordia-college.apk';
const QR_CODE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
  APK_DOWNLOAD_URL,
)}`;
const APK_VERSION = 'v1.1.0';
const APK_UPDATED = 'July 30, 2026';
const APK_SIZE = '~11 MB';

const whatsNew = [
  {
    title: 'Instant sign-out',
    desc: 'Sign Out now clears your session immediately — no more tapping 4-5 times waiting for it to respond.',
  },
  {
    title: 'No more sign-in flash',
    desc: 'The router is now created once, so logging in no longer rebuilds the whole screen.',
  },
  {
    title: 'Premium admin sub-tab bar',
    desc: 'The Admissions / Accountant / Academic tab pills got a Concordia-orange gradient redesign with a soft glow.',
  },
  {
    title: 'Smarter navigation',
    desc: 'Sub-portal tab bars now show only for admins (who need them) — portal roles already have those items in the bottom nav.',
  },
  {
    title: 'Cleaner side drawer',
    desc: 'Removed dead links, added Notifications / Change Password / Settings / Send Feedback. Download App is now Update App.',
  },
  {
    title: 'Logo-only footer',
    desc: 'Above Sign Out you now see just the Concordia logo — no text, no version clutter.',
  },
];

const features = [
  {
    icon: BarChart3,
    title: 'Real-time Dashboards',
    desc: 'Revenue, attendance, and performance analytics at a glance — refreshed live as data flows in.',
  },
  {
    icon: Wallet,
    title: 'Fee Management',
    desc: 'Generate invoices, record payments, and download PDF challans directly from your phone.',
  },
  {
    icon: CalendarCheck,
    title: 'Attendance Tracking',
    desc: 'Mark attendance class-by-class and surface at-risk students before they slip through.',
  },
  {
    icon: FileText,
    title: 'Results & Report Cards',
    desc: 'Compile grades, auto-generate report cards, and publish them to students and parents instantly.',
  },
  {
    icon: Megaphone,
    title: 'Announcements',
    desc: 'Send targeted messages to branches, classes, teachers, or parents — read receipts included.',
  },
  {
    icon: Users,
    title: 'Multi-Role Access',
    desc: 'Eight role-based portals in one app — each user sees exactly what they need, nothing more.',
  },
];

const roles = [
  { icon: Crown, name: 'Super Admin', desc: 'Full platform control across every branch and role.' },
  { icon: Building2, name: 'Admin', desc: 'Branch-level management of staff, students, and fees.' },
  { icon: UserPlus, name: 'Admissions Office', desc: 'Process applications and enroll new students.' },
  { icon: Calculator, name: 'Accountant', desc: 'Generate invoices, collect fees, and reconcile payments.' },
  { icon: BookOpen, name: 'Academic Office', desc: 'Manage classes, timetables, and curriculum.' },
  { icon: Presentation, name: 'Teacher', desc: 'Mark attendance, post results, and message students.' },
  { icon: GraduationCap, name: 'Student', desc: 'View attendance, results, fees, and announcements.' },
  { icon: HeartHandshake, name: 'Parent', desc: 'Track your child\u2019s progress, attendance, and fee status.' },
];

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function DownloadPage() {
  const [isAndroid, setIsAndroid] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const android = ua.includes('android');
    // Defer setState to a microtask to avoid synchronous state updates inside the effect
    // (which trigger cascading renders).
    Promise.resolve().then(() => {
      setIsAndroid(android);
      setMounted(true);
    });
  }, []);

  const buttonLabel = mounted && isAndroid ? 'Update App' : 'Download for Android';

  return (
    <div className="min-h-screen bg-[#FCFBF9] text-[#1A1A1A] antialiased selection:bg-[#F26522]/20">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b border-orange-100/60 bg-[#FCFBF9]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <BrandLogo size="sm" />
          <a
            href="/"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A] transition-colors hover:text-[#F26522]"
          >
            <span className="opacity-60 transition-opacity group-hover:opacity-100">&larr;</span>
            Back to Portal
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#FFF6EE] via-[#FDF6EF] to-[#FCFBF9]">
        {/* Radial glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/4 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,_rgba(242,101,34,0.18),_transparent_60%)] blur-2xl" />
          <div className="absolute top-24 right-0 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,_rgba(242,101,34,0.10),_transparent_65%)] blur-2xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-2">
          {/* Left: copy + CTAs */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-white/70 px-3.5 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F26522] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F26522]" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#F26522]">
                Now Available
              </span>
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-[#1A1A1A] sm:text-5xl md:text-6xl">
              Concordia College
              <span className="block bg-gradient-to-r from-[#F26522] to-[#FF8C42] bg-clip-text text-transparent">
                in your pocket
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600">
              Manage your school, branches, staff, and students from anywhere. The complete
              Concordia College management platform — now native on Android.
            </p>

            <div className="mt-8 flex flex-col items-start gap-3">
              <a
                href={APK_DOWNLOAD_URL}
                className="group inline-flex items-center gap-2.5 rounded-2xl bg-[#F26522] px-7 py-4 text-base font-semibold text-white shadow-[0_10px_30px_-8px_rgba(242,101,34,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D4541E] hover:shadow-[0_14px_36px_-8px_rgba(242,101,34,0.65)]"
              >
                <Download className="h-5 w-5" />
                <span>{buttonLabel}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <p className="text-sm text-gray-500">
                {mounted && isAndroid
                  ? `${APK_SIZE} · Installs over current version · Free`
                  : `${APK_SIZE} · Android 5.0+ · Free`}
              </p>
              {/* Version badge */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200/70 bg-white/80 px-3 py-1 font-semibold text-[#F26522] backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {APK_VERSION} · Latest
                </span>
                <span className="rounded-full border border-orange-100 bg-white/70 px-3 py-1 text-gray-600 backdrop-blur-sm">
                  Updated {APK_UPDATED}
                </span>
              </div>
            </div>

            {/* App icon card + QR card */}
            <div className="mt-8 flex flex-wrap items-stretch gap-3">
              <div className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white p-3 pr-5 shadow-sm">
                <div className="relative h-14 w-14 overflow-hidden rounded-2xl shadow-md ring-1 ring-black/5">
                  <Image
                    src="/app-icon-512.png"
                    alt="Concordia College app icon"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">Concordia College</p>
                  <p className="text-xs text-gray-500">Student &amp; Staff Portal</p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm">
                {/* QR code from api.qrserver.com — using a plain <img> to avoid configuring next/image remote patterns */}
                <img
                  src={QR_CODE_URL}
                  alt="Scan to download the Concordia College Android app"
                  width={88}
                  height={88}
                  className="rounded-md"
                />
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                  Scan to download
                </p>
              </div>
            </div>

            {/* Android hint banner */}
            {mounted && isAndroid && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-200/70 bg-[#FFF4ED] p-4"
              >
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#F26522]" />
                <p className="text-sm text-orange-900/80">
                  <strong className="text-[#1A1A1A]">You&rsquo;re on Android.</strong> Tap{' '}
                  <span className="font-semibold text-[#F26522]">Update App</span> to download the
                  latest APK. Your login is preserved after the update.
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Right: phone mockup */}
          <div className="relative mx-auto lg:mx-0">
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* What's new in this version */}
      <section className="border-y border-orange-100/60 bg-gradient-to-b from-[#FFF6EE] to-[#FCFBF9]">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/70 bg-white/80 px-3.5 py-1.5 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-[#F26522]" />
              <span className="text-xs font-semibold uppercase tracking-wide text-[#F26522]">
                Just shipped · {APK_VERSION}
              </span>
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#1A1A1A] sm:text-4xl">
              What&rsquo;s new in this version
            </h2>
            <p className="mt-3 text-lg text-gray-600">
              Updated {APK_UPDATED} · {APK_SIZE} · This is the build you&rsquo;ll download today.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {whatsNew.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.06}>
                <div className="group h-full rounded-2xl border border-orange-100/70 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_12px_28px_-12px_rgba(242,101,34,0.25)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFE8DC] to-[#FFD3B8] ring-1 ring-orange-200/50">
                    <Check className="h-5 w-5 text-[#F26522]" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#1A1A1A]">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Reassurance banner */}
          <Reveal delay={0.2}>
            <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-orange-200/70 bg-white p-6 text-center shadow-sm sm:flex-row sm:text-left">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F26522] to-[#D4541E] text-white shadow-lg">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-[#1A1A1A]">
                  This exact build is live right now
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  The button above downloads the APK from the official GitHub release at{' '}
                  <code className="rounded bg-orange-50 px-1.5 py-0.5 font-mono text-xs text-[#F26522]">
                    github.com/faisukhan01/concordia2
                  </code>
                  . Every install gets the same {APK_VERSION} ({APK_SIZE}) premium build — white
                  icon, redesigned portals, and the faster cache.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F26522]">
            Built for everyone
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1A1A1A] sm:text-4xl">
            Everything you need, on the go
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Six core capabilities, tuned for the realities of running a modern college — all
            available offline-first on Android.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <div className="group h-full rounded-2xl border border-orange-100/70 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-orange-200 hover:shadow-[0_12px_28px_-12px_rgba(242,101,34,0.25)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFE8DC] to-[#FFD3B8] ring-1 ring-orange-200/50 transition-transform duration-300 group-hover:scale-105">
                  <f.icon className="h-6 w-6 text-[#F26522]" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#1A1A1A]">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="border-y border-orange-100/60 bg-gradient-to-b from-[#FFF6EE] to-[#FCFBF9]">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#F26522]">
              One app, every role
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#1A1A1A] sm:text-4xl">
              Eight role-based portals
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Each user signs in to a tailored experience. No clutter, no permissions to manage —
              just the right tools for the job.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((r, i) => (
              <Reveal key={r.name} delay={i * 0.05}>
                <div className="group h-full rounded-2xl border border-orange-100/70 bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_24px_-12px_rgba(242,101,34,0.3)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF4ED] ring-1 ring-orange-200/40 transition-colors duration-300 group-hover:bg-[#F26522]">
                    <r.icon className="h-5 w-5 text-[#F26522] transition-colors duration-300 group-hover:text-white" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#1A1A1A]">{r.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{r.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How to install */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-[#1A1A1A] p-8 sm:p-12 md:p-16">
            {/* Decorative glow */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(242,101,34,0.25),_transparent_65%)] blur-2xl" />
              <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(242,101,34,0.10),_transparent_65%)] blur-2xl" />
            </div>

            <div className="relative">
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#FF8C42]">
                  {mounted && isAndroid ? 'How to update' : 'How to install'}
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {mounted && isAndroid ? 'Update in three taps' : 'Get started in three steps'}
                </h2>
              </div>

              <div className="relative mt-14 grid gap-8 md:grid-cols-3">
                {/* Connecting line on md+ */}
                <div className="pointer-events-none absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent md:block" />

                {[
                  {
                    n: 1,
                    title: mounted && isAndroid ? 'Tap Update' : 'Download the APK',
                    desc:
                      mounted && isAndroid
                        ? 'Tap the Update App button above to start the download.'
                        : 'Tap the download button or scan the QR code with your phone camera.',
                  },
                  {
                    n: 2,
                    title: mounted && isAndroid ? 'Open the file' : 'Allow unknown sources',
                    desc:
                      mounted && isAndroid
                        ? 'Open the file from your notifications or Downloads folder and tap Install.'
                        : 'Android may prompt you to allow installs from unknown sources — allow it once.',
                  },
                  {
                    n: 3,
                    title: 'Sign in',
                    desc:
                      mounted && isAndroid
                        ? 'Open Concordia College — your previous login is preserved.'
                        : 'Open the app and sign in with your existing portal credentials.',
                  },
                ].map((s) => (
                  <div key={s.n} className="relative text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F26522] text-lg font-bold text-white shadow-[0_8px_20px_-6px_rgba(242,101,34,0.6)] ring-4 ring-white/5">
                      {s.n}
                    </div>
                    <h3 className="mt-5 text-lg font-bold text-white">{s.title}</h3>
                    <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-white/60">
                      {s.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-orange-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <BrandLogo size="sm" />
            <div className="text-center sm:text-right">
              <p className="text-sm text-gray-600">
                &copy; 2025 Concordia College. All rights reserved.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Android is a trademark of Google LLC.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Phone mockup ---------- */

function PhoneMockup() {
  const reduce = useReducedMotion();
  const bars = [40, 65, 50, 80, 55, 90, 70];

  const cardAnim = (delay: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay } }
      : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <div className="relative mx-auto w-[280px] sm:w-[300px]">
      {/* Floating app icon badge */}
      <motion.div
        {...cardAnim(0.35)}
        className="absolute -left-6 top-20 z-20 hidden rounded-2xl border border-orange-100 bg-white p-2 shadow-xl lg:block"
      >
        <div className="relative h-12 w-12 overflow-hidden rounded-xl ring-1 ring-black/5">
          <Image src="/app-icon-512.png" alt="Concordia app icon" fill className="object-cover" />
        </div>
      </motion.div>

      {/* Floating notification card */}
      <motion.div
        {...cardAnim(0.55)}
        className="absolute -right-4 bottom-24 z-20 hidden w-44 rounded-2xl border border-orange-100 bg-white p-3 shadow-xl lg:block"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF4ED]">
            <Wallet className="h-4 w-4 text-[#F26522]" />
          </div>
          <div>
            <p className="text-[10px] text-gray-500">Payment received</p>
            <p className="text-xs font-bold text-[#1A1A1A]">Rs 18,500</p>
          </div>
        </div>
      </motion.div>

      {/* Phone frame */}
      <motion.div
        {...cardAnim(0.15)}
        className="relative rounded-[2.75rem] bg-[#1A1A1A] p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.35),0_18px_36px_-18px_rgba(242,101,34,0.25)]"
      >
        {/* Notch */}
        <div className="absolute left-1/2 top-3 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />

        {/* Screen */}
        <div className="relative h-[560px] overflow-hidden rounded-[2.25rem] bg-[#FCFBF9]">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[10px] font-semibold text-[#1A1A1A]">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="flex h-1.5 w-1.5 rounded-full bg-[#1A1A1A]" />
              <span className="flex h-2 w-4 items-center rounded-[2px] border border-[#1A1A1A]/70 px-[1px]">
                <span className="block h-3/4 w-3/4 rounded-[1px] bg-[#1A1A1A]" />
              </span>
            </span>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div>
              <p className="text-[10px] text-gray-500">Good morning,</p>
              <p className="text-sm font-bold text-[#1A1A1A]">Concordia Admin</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#F26522] to-[#FF8C42]" />
          </div>

          {/* Content */}
          <div className="space-y-3 px-4">
            {/* Revenue card */}
            <div className="rounded-2xl bg-gradient-to-br from-[#F26522] to-[#D4541E] p-3.5 text-white shadow-lg">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                  Revenue · November
                </p>
                <BarChart3 className="h-3.5 w-3.5 opacity-80" />
              </div>
              <p className="mt-1 text-2xl font-extrabold tracking-tight">Rs 1.24M</p>
              <div className="mt-2 flex h-10 items-end gap-1">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-white/40"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Two small cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-orange-100 bg-white p-3">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-[#F26522]" />
                  <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500">
                    Students
                  </p>
                </div>
                <p className="mt-1 text-lg font-bold text-[#1A1A1A]">2,847</p>
                <p className="text-[9px] font-semibold text-[#F26522]">&uarr; 12 this week</p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-white p-3">
                <div className="flex items-center gap-1.5">
                  <CalendarCheck className="h-3 w-3 text-[#F26522]" />
                  <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500">
                    Attendance
                  </p>
                </div>
                <p className="mt-1 text-lg font-bold text-[#1A1A1A]">94.2%</p>
                <p className="text-[9px] font-semibold text-[#F26522]">Today</p>
              </div>
            </div>

            {/* Recent activity list */}
            <div className="rounded-2xl border border-orange-100 bg-white p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Recent activity
              </p>
              <div className="space-y-2">
                {[
                  { name: 'Fee paid — Areeb Khan', time: '2m', amt: '+Rs 4,500', dot: 'bg-[#F26522]' },
                  { name: 'New admission — Class 7-B', time: '18m', amt: '', dot: 'bg-[#FF8C42]' },
                  { name: 'Attendance marked — 9-A', time: '1h', amt: '', dot: 'bg-[#FFD3B8]' },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
                    <p className="flex-1 truncate text-[11px] text-gray-700">{a.name}</p>
                    {a.amt && (
                      <span className="text-[10px] font-semibold text-[#F26522]">{a.amt}</span>
                    )}
                    <span className="text-[9px] text-gray-400">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around border-t border-orange-100 bg-white/95 px-4 py-2.5 backdrop-blur">
            {[
              { i: BarChart3, label: 'Home', active: true },
              { i: Wallet, label: 'Fees', active: false },
              { i: CalendarCheck, label: 'Attend', active: false },
              { i: FileText, label: 'Results', active: false },
              { i: Users, label: 'Roles', active: false },
            ].map((n, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <n.i className={`h-4 w-4 ${n.active ? 'text-[#F26522]' : 'text-gray-400'}`} />
                <span
                  className={`text-[8px] ${
                    n.active ? 'font-bold text-[#F26522]' : 'text-gray-400'
                  }`}
                >
                  {n.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
