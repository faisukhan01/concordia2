'use client';

import { useSyncExternalStore, useEffect, useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import {
  Download,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Bell,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Wallet,
  CalendarCheck,
  Megaphone,
  QrCode,
  Cpu,
  Share2,
  Plus,
  Apple,
  Sparkles,
  Zap,
  Users,
  Star,
  Lock,
  WifiOff,
  Gauge,
  ChevronDown,
  Heart,
  ArrowUpRight,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { PoweredByFaq } from '@/components/powered-by-faq';

// ───────────────────────── Config ─────────────────────────
const APK_DOWNLOAD_URL =
  'https://github.com/faisukhan01/concordia2/releases/latest/download/concordia-college.apk';
const GITHUB_RELEASES = 'https://github.com/faisukhan01/concordia2/releases';
const APK_VERSION_FALLBACK = 'v4.7.8';

// ───────────────────────── Data ─────────────────────────

const highlights = [
  { icon: Bell, label: 'Push Notifications', sub: 'WhatsApp-style alerts', color: 'from-orange-500 to-red-500' },
  { icon: Wallet, label: 'Fee Management', sub: 'Invoices & challans', color: 'from-emerald-500 to-teal-500' },
  { icon: CalendarCheck, label: 'Attendance', sub: 'Live tracking', color: 'from-violet-500 to-purple-500' },
  { icon: Megaphone, label: 'Announcements', sub: 'Instant delivery', color: 'from-sky-500 to-blue-500' },
  { icon: GraduationCap, label: '8 Role Portals', sub: 'Admin → Parent', color: 'from-amber-500 to-orange-500' },
  { icon: Cpu, label: 'Native Performance', sub: 'Flutter WebView', color: 'from-rose-500 to-pink-500' },
];

const stats = [
  { value: '8', label: 'Role Portals', icon: Users },
  { value: '45MB', label: 'Lightweight APK', icon: Zap },
  { value: '5.0+', label: 'Android Support', icon: Smartphone },
  { value: '100%', label: 'Offline-Ready', icon: WifiOff },
];

const faqs = [
  {
    q: 'Is the app free to download?',
    a: 'Yes — completely free. The Concordia College app is distributed directly via GitHub Releases with no cost, no ads, and no in-app purchases.',
  },
  {
    q: 'Will my login work on the app?',
    a: 'Absolutely. The app uses the same login as the web portal. Your existing Concordia credentials work seamlessly — no separate sign-up needed.',
  },
  {
    q: 'Is it available on iPhone?',
    a: 'Apple doesn\'t allow APK-style sideloading, but iPhone/iPad users can add Concordia to their Home Screen from Safari. It opens full-screen like a native app — completely free, no App Store required.',
  },
  {
    q: 'How do updates work?',
    a: 'The app loads the live portal inside a native shell, so every web update appears automatically. For native shell updates (new features, bug fixes), just revisit this page and tap "Update App".',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is encrypted in transit (HTTPS) and the app only communicates with the official Concordia College servers. No third-party trackers, no data selling.',
  },
];

// Phone mockup screens — simulated app content
const phoneScreens = [
  {
    label: 'Dashboard',
    badge: 'Admin',
    content: (
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex items-center justify-between">
          <div className="h-2 w-16 rounded-full bg-orange-200" />
          <div className="h-2 w-2 rounded-full bg-orange-400" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 p-2">
            <div className="text-[7px] font-bold text-white/80">STUDENTS</div>
            <div className="text-sm font-bold text-white">1,284</div>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 p-2">
            <div className="text-[7px] font-bold text-white/80">TEACHERS</div>
            <div className="text-sm font-bold text-white">87</div>
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2 flex-1">
          <div className="mb-1.5 h-1.5 w-12 rounded-full bg-gray-300" />
          <div className="flex items-end gap-1 h-12">
            {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-orange-300 to-orange-500" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-gray-100" />
          <div className="h-1.5 w-2/3 rounded-full bg-gray-100" />
        </div>
      </div>
    ),
  },
  {
    label: 'Attendance',
    badge: 'Teacher',
    content: (
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="h-2 w-20 rounded-full bg-violet-200" />
        <div className="rounded-lg bg-violet-50 p-2">
          <div className="text-[7px] font-bold text-violet-600">TODAY</div>
          <div className="text-lg font-bold text-violet-900">92%</div>
          <div className="mt-1 h-1 rounded-full bg-violet-100">
            <div className="h-1 w-[92%] rounded-full bg-gradient-to-r from-violet-400 to-purple-500" />
          </div>
        </div>
        <div className="space-y-1 flex-1">
          {['Ayesha K.', 'Bilal R.', 'Hira M.', 'Usman A.', 'Zainab F.'].map((n, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-md bg-gray-50 px-1.5 py-1">
              <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-violet-300 to-purple-400" />
              <div className="flex-1 h-1 rounded-full bg-gray-200" style={{ width: `${60 - i * 5}%` }} />
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Fees',
    badge: 'Accountant',
    content: (
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="h-2 w-16 rounded-full bg-emerald-200" />
        <div className="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 text-white">
          <div className="text-[7px] font-bold opacity-80">COLLECTED THIS MONTH</div>
          <div className="text-base font-bold">Rs 4.2M</div>
          <div className="text-[7px] opacity-80">↑ 12% vs last month</div>
        </div>
        <div className="space-y-1 flex-1">
          {[
            { n: 'Invoice #1042', v: 'Rs 8,500', s: 'Paid' },
            { n: 'Invoice #1041', v: 'Rs 12,000', s: 'Paid' },
            { n: 'Invoice #1040', v: 'Rs 6,500', s: 'Pending' },
            { n: 'Invoice #1039', v: 'Rs 8,500', s: 'Paid' },
          ].map((inv, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-gray-50 px-1.5 py-1">
              <div className="h-1 w-16 rounded-full bg-gray-300" />
              <div className={`h-1.5 w-8 rounded-full ${inv.s === 'Paid' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ───────────────────────── Component ─────────────────────────

function useLatestRelease() {
  const [info, setInfo] = useState<{
    version: string;
    publishedAt: string | null;
    sizeMb: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('https://api.github.com/repos/faisukhan01/concordia2/releases/latest')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data) return;
        const tagName: string = data.tag_name || '';
        const apkAsset = (data.assets || []).find(
          (a: any) => a.name === 'concordia-college.apk'
        );
        const sizeBytes: number | undefined = apkAsset?.size;
        const sizeMb = sizeBytes
          ? `${Math.round(sizeBytes / (1024 * 1024))} MB`
          : null;
        const publishedAt: string | null = data.published_at || data.created_at || null;
        setInfo({
          version: tagName || APK_VERSION_FALLBACK,
          publishedAt,
          sizeMb,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setInfo({
          version: APK_VERSION_FALLBACK,
          publishedAt: null,
          sizeMb: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

function formatReleaseDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

export default function DownloadPage() {
  const isAndroid = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('android'),
    () => false,
  );
  const isIos = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof navigator === 'undefined') return false;
      const ua = navigator.userAgent.toLowerCase();
      return /iphone|ipod|ipad/.test(ua) ||
        (ua.includes('mac') && typeof document !== 'undefined' && 'ontouchend' in document);
    },
    () => false,
  );
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const reduce = useReducedMotion();
  const releaseInfo = useLatestRelease();

  const [activeScreen, setActiveScreen] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const apkVersion = releaseInfo?.version || APK_VERSION_FALLBACK;
  const apkUpdated = formatReleaseDate(releaseInfo?.publishedAt || null) || 'Latest release';
  const apkSize = releaseInfo?.sizeMb || '~45 MB';

  const buttonLabel = mounted && isAndroid ? 'Update App' : 'Download for Android';

  // Auto-rotate phone screens
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      setActiveScreen((s) => (s + 1) % phoneScreens.length);
    }, 3500);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#1A1A1A] antialiased selection:bg-[#F26522]/20 overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════════════
          STICKY HEADER — glass, minimal
      ═══════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-gray-100/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 sm:px-8 py-3.5">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-3">
            <a
              href={GITHUB_RELEASES}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-[#F26522]"
            >
              <Star className="h-3.5 w-3.5" />
              Releases
            </a>
            <a
              href="/"
              className="group inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-900 hover:text-white"
            >
              <span className="opacity-50 transition-opacity group-hover:opacity-100">&larr;</span>
              Portal
            </a>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          HERO — split layout: left content + right phone mockup
          Premium gradient mesh background, animated glow orbs
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* ── Background: warm gradient mesh ── */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F2] via-white to-[#FFF4EC]" />
        <div className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(242,101,34,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(255,138,76,0.10) 0%, transparent 50%), radial-gradient(circle at 50% 100%, rgba(242,101,34,0.06) 0%, transparent 50%)',
          }}
        />
        {/* Dot pattern */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(242,101,34,0.08) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        {/* Floating glow orbs */}
        {!reduce && (
          <>
            <motion.div
              animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              className="pointer-events-none absolute top-20 left-[10%] h-40 w-40 rounded-full bg-[#F26522]/20 blur-3xl"
            />
            <motion.div
              animate={{ y: [0, 25, 0], x: [0, -15, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
              className="pointer-events-none absolute bottom-20 right-[15%] h-52 w-52 rounded-full bg-amber-300/20 blur-3xl"
            />
          </>
        )}

        <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-12 sm:pb-20">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-8 items-center">
            {/* ── LEFT: Content ── */}
            <div className="text-center lg:text-left">
              {/* Version pill */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex justify-center lg:justify-start"
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-[#F26522]/20 bg-white/80 backdrop-blur px-3.5 py-1.5 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F26522] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F26522]" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#D4541E]">
                    Latest Build · {apkVersion}
                  </span>
                </div>
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl"
              >
                Your college,
                <br />
                <span className="bg-gradient-to-r from-[#F26522] via-[#FF8A4C] to-[#F26522] bg-clip-text text-transparent">
                  in your pocket.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12 }}
                className="mt-4 text-base text-gray-600 sm:text-lg max-w-lg mx-auto lg:mx-0 leading-relaxed"
              >
                Admissions, academics, fees, attendance, and instant notifications —
                one beautiful Android app for the entire Concordia community.
              </motion.p>

              {/* CTA row */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mt-7 flex flex-col sm:flex-row items-center gap-3 lg:justify-start justify-center"
              >
                <a
                  href={APK_DOWNLOAD_URL}
                  className="group relative inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-[#F26522] px-7 py-4 text-base font-semibold text-white shadow-[0_12px_28px_-8px_rgba(242,101,34,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D4541E] hover:shadow-[0_16px_40px_-8px_rgba(242,101,34,0.6)]"
                >
                  <Download className="h-5 w-5" />
                  <span>{buttonLabel}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a
                  href="#qr"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-4 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-white"
                >
                  <QrCode className="h-4 w-4 text-[#F26522]" />
                  Scan QR
                </a>
              </motion.div>

              {/* Meta chips */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-2"
              >
                <Chip icon={Smartphone}>{apkVersion}</Chip>
                <Chip icon={Gauge}>{apkSize}</Chip>
                <Chip icon={ShieldCheck}>Verified</Chip>
                <Chip icon={Lock}>Secure</Chip>
              </motion.div>

              {/* Updated date */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="mt-4 text-xs text-gray-400"
              >
                Updated {apkUpdated} · Direct from GitHub Releases
              </motion.p>
            </div>

            {/* ── RIGHT: Phone mockup with rotating screens ── */}
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex justify-center lg:justify-end"
            >
              {/* Glow behind phone */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-80 w-80 rounded-full bg-[#F26522]/15 blur-3xl" />
              </div>

              {/* Phone frame */}
              <div className="relative">
                <div className="relative h-[440px] w-[220px] rounded-[2.5rem] border-[6px] border-gray-900 bg-gray-900 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.4),0_0_0_2px_rgba(242,101,34,0.15)] overflow-hidden">
                  {/* Notch */}
                  <div className="absolute left-1/2 top-0 z-30 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-gray-900" />

                  {/* Screen content area */}
                  <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-white">
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-4 pt-2.5 pb-1">
                      <span className="text-[8px] font-bold text-gray-900">9:41</span>
                      <div className="flex items-center gap-0.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-900" />
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-900" />
                        <div className="h-1.5 w-3 rounded-sm bg-gray-900" />
                      </div>
                    </div>

                    {/* App header bar */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
                      <div className="flex items-center gap-1">
                        <div className="h-3.5 w-3.5 rounded bg-gradient-to-br from-[#F26522] to-[#D4541E]" />
                        <span className="text-[7px] font-bold text-gray-900">CONCORDIA</span>
                      </div>
                      <div className="h-3 w-3 rounded-full bg-gray-200" />
                    </div>

                    {/* Rotating screen content */}
                    <div className="relative h-[calc(100%-72px)]">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activeScreen}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.35 }}
                          className="absolute inset-0"
                        >
                          {phoneScreens[activeScreen].content}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Bottom nav bar */}
                    <div className="absolute bottom-0 inset-x-0 flex items-center justify-around border-t border-gray-100 bg-white py-1.5">
                      {phoneScreens.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveScreen(i)}
                          className={`h-1.5 rounded-full transition-all ${i === activeScreen ? 'w-5 bg-[#F26522]' : 'w-1.5 bg-gray-200'}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating badges around phone */}
                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  className="absolute -left-4 sm:-left-8 top-12 rounded-xl bg-white px-3 py-2 shadow-xl border border-gray-100"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="grid place-items-center h-6 w-6 rounded-lg bg-emerald-100">
                      <Bell className="h-3 w-3 text-emerald-600" />
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-gray-900 leading-tight">New Alert</div>
                      <div className="text-[7px] text-gray-500 leading-tight">Fee challan posted</div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.75 }}
                  className="absolute -right-2 sm:-right-6 bottom-20 rounded-xl bg-white px-3 py-2 shadow-xl border border-gray-100"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="grid place-items-center h-6 w-6 rounded-lg bg-orange-100">
                      <CalendarCheck className="h-3 w-3 text-[#F26522]" />
                    </div>
                    <div>
                      <div className="text-[8px] font-bold text-gray-900 leading-tight">Attendance</div>
                      <div className="text-[7px] text-emerald-600 leading-tight font-semibold">92% today</div>
                    </div>
                  </div>
                </motion.div>

                {/* Screen label */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-gray-900 px-3 py-1">
                  <span className="text-[9px] font-bold text-white">{phoneScreens[activeScreen].badge}</span>
                  <span className="text-[9px] text-gray-400">·</span>
                  <span className="text-[9px] font-medium text-gray-300">{phoneScreens[activeScreen].label}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Wave separator */}
        <div className="relative">
          <svg className="w-full h-[40px] sm:h-[60px]" viewBox="0 0 1440 60" preserveAspectRatio="none" fill="none">
            <path d="M0,30 C240,60 480,0 720,20 C960,40 1200,60 1440,25 L1440,60 L0,60 Z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          STATS BAR — compact, bold numbers
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-8 sm:py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="text-center"
              >
                <div className="inline-grid place-items-center h-9 w-9 rounded-xl bg-[#FFF0E8] mb-2">
                  <s.icon className="h-4 w-4 text-[#F26522]" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          HIGHLIGHTS — premium feature cards with gradient icons
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-b from-white to-[#FFF8F2]">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center max-w-xl mx-auto mb-10 sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F26522]">
              Everything you need
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Built for the whole campus
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Eight role-based portals, one unified experience.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {highlights.map((h, i) => (
              <motion.div
                key={h.label}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 hover:border-[#F26522]/20"
              >
                {/* Hover gradient sheen */}
                <div className={`pointer-events-none absolute -top-12 -right-12 h-24 w-24 rounded-full bg-gradient-to-br ${h.color} opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20`} />

                <div className={`inline-grid place-items-center h-11 w-11 rounded-xl bg-gradient-to-br ${h.color} mb-3 shadow-lg`}>
                  <h.icon className="h-5 w-5 text-white" strokeWidth={2} />
                </div>
                <div className="text-sm font-bold text-gray-900">{h.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{h.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          DOWNLOAD CARD — QR + button, the conversion centerpiece
      ═══════════════════════════════════════════════════════════════ */}
      <section id="qr" className="bg-[#FFF8F2] relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-[#F26522]/8 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-5 sm:px-8 py-14 sm:py-20">
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl bg-white border border-gray-100 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.12)]"
          >
            {/* Top accent bar */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#F26522] via-[#FF8A4C] to-[#F26522]" />

            <div className="grid md:grid-cols-2 gap-0">
              {/* LEFT — QR code */}
              <div className="flex flex-col items-center justify-center p-8 sm:p-10 border-b md:border-b-0 md:border-r border-gray-100">
                <div className="text-center mb-5">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0E8] px-3 py-1 mb-3">
                    <QrCode className="h-3 w-3 text-[#F26522]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#D4541E]">Scan to install</span>
                  </div>
                  <p className="text-sm text-gray-500 max-w-[200px]">
                    Point your phone camera at the code to download instantly
                  </p>
                </div>

                <div className="relative p-4 bg-white rounded-2xl border-2 border-gray-100 shadow-sm">
                  {/* Corner brackets */}
                  <div className="absolute -top-1 -left-1 h-4 w-4 border-t-2 border-l-2 border-[#F26522] rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 h-4 w-4 border-t-2 border-r-2 border-[#F26522] rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-[#F26522] rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-[#F26522] rounded-br-lg" />

                  {/* Scan line */}
                  {!reduce && (
                    <motion.div
                      animate={{ top: ['10%', '90%', '10%'] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                      className="pointer-events-none absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-[#F26522] to-transparent rounded-full z-10"
                    />
                  )}

                  <QRCodeSVG
                    value={APK_DOWNLOAD_URL}
                    size={180}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#1A1A1A"
                    marginSize={0}
                    imageSettings={{
                      src: '/app-icon-512.png',
                      height: 42,
                      width: 42,
                      excavate: true,
                    }}
                  />
                </div>

                <div className="mt-5 flex items-center gap-2 text-xs text-gray-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  Verified · No malware · Open source
                </div>
              </div>

              {/* RIGHT — Button + details */}
              <div className="flex flex-col justify-center p-8 sm:p-10 bg-gradient-to-br from-gray-50/50 to-white">
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="relative h-12 w-12 overflow-hidden rounded-[22%] bg-[#F26522] shadow-lg ring-1 ring-black/5 shrink-0">
                      <Image src="/app-icon-512.png" alt="Concordia app icon" fill className="object-cover" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-gray-900">Concordia College</div>
                      <div className="text-xs text-gray-500">Management Portal</div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-sm font-bold text-gray-900">
                    {mounted && isAndroid ? 'Update your app' : 'Get the app'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {mounted && isAndroid
                      ? 'Installs over your current version — login preserved.'
                      : 'Direct APK download from GitHub Releases.'}
                  </div>
                </div>

                <a
                  href={APK_DOWNLOAD_URL}
                  className="group relative inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#F26522] px-6 py-4 text-base font-semibold text-white shadow-[0_12px_28px_-8px_rgba(242,101,34,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D4541E] hover:shadow-[0_16px_36px_-8px_rgba(242,101,34,0.6)]"
                >
                  <Download className="h-5 w-5" />
                  <span>{buttonLabel}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 py-2">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Version</div>
                    <div className="text-xs font-bold text-gray-900">{apkVersion}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-2">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Size</div>
                    <div className="text-xs font-bold text-gray-900">{apkSize}</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-2">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Requires</div>
                    <div className="text-xs font-bold text-gray-900">Android 5+</div>
                  </div>
                </div>

                <a
                  href={GITHUB_RELEASES}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-[#F26522] transition-colors"
                >
                  View all releases <ChevronRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          </motion.div>

          {/* Android hint */}
          {mounted && isAndroid && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-800">
                <strong className="text-emerald-900">You&rsquo;re on Android.</strong> Tap{' '}
                <span className="font-semibold text-emerald-700">Update App</span> above. Your login
                and data are preserved after the update.
              </p>
            </motion.div>
          )}

          {/* iPhone / iPad */}
          {mounted && !isAndroid && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className={`mt-6 rounded-2xl border p-5 ${
                isIos ? 'border-[#F26522]/40 bg-[#FFF7F2]' : 'border-gray-200 bg-white/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white">
                  <Apple className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">
                    {isIos ? "You're on iPhone / iPad" : 'On iPhone or iPad?'} — install free, no App Store
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Apple doesn&rsquo;t allow APK-style installs, but you can add Concordia to your
                    Home Screen from Safari — it opens full-screen like a real app, completely free.
                  </p>
                  <ol className="mt-3 space-y-2 text-xs text-gray-700">
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F26522] text-white text-[10px] font-bold">1</span>
                      Open <span className="font-semibold">concordia-colleges.vercel.app</span> in <span className="font-semibold">Safari</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F26522] text-white text-[10px] font-bold">2</span>
                      Tap the <span className="inline-flex items-center gap-1 font-semibold"><Share2 className="h-3.5 w-3.5" /> Share</span> button
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F26522] text-white text-[10px] font-bold">3</span>
                      Choose <span className="inline-flex items-center gap-1 font-semibold"><Plus className="h-3.5 w-3.5" /> Add to Home Screen</span>
                    </li>
                  </ol>
                  {isIos && (
                    <a
                      href="/"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-black"
                    >
                      Open the portal in Safari <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          INSTALL STEPS — premium 3-step with connecting line
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white flex-1">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center max-w-xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F26522]">
              {mounted && isAndroid ? 'How to update' : 'How to install'}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {mounted && isAndroid ? 'Update in three taps' : 'Get started in three steps'}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {mounted && isAndroid
                ? 'Your existing login and data are preserved after the update.'
                : 'No sign-up required — use your existing portal credentials.'}
            </p>
          </div>

          <div className="mt-12 relative grid gap-8 md:grid-cols-3">
            {/* Connecting line */}
            <div className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-[#F26522]/30 to-transparent md:block" />

            {[
              {
                n: 1,
                title: mounted && isAndroid ? 'Tap Update' : 'Download',
                desc: mounted && isAndroid
                  ? 'Tap the Update App button above to start the download.'
                  : 'Tap the download button or scan the QR code with your phone camera.',
                icon: Download,
              },
              {
                n: 2,
                title: mounted && isAndroid ? 'Open the file' : 'Allow installs',
                desc: mounted && isAndroid
                  ? 'Open from your notifications or Downloads folder, then tap Install.'
                  : 'Android may prompt to allow installs from unknown sources — allow it once.',
                icon: ShieldCheck,
              },
              {
                n: 3,
                title: 'Sign in',
                desc: mounted && isAndroid
                  ? 'Open Concordia College — your previous login is preserved.'
                  : 'Open the app and sign in with your existing portal credentials.',
                icon: CheckCircle2,
              },
            ].map((s, i) => (
              <motion.div
                key={s.n}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="relative text-center"
              >
                <div className="relative mx-auto inline-flex">
                  <div className="grid place-items-center h-14 w-14 rounded-2xl bg-white border border-gray-100 shadow-md transition-all hover:shadow-lg hover:border-[#F26522]/30">
                    <s.icon className="h-5 w-5 text-[#F26522]" strokeWidth={2} />
                  </div>
                  <span className="absolute -top-1 -right-1 grid place-items-center h-5 w-5 rounded-full bg-[#F26522] text-[11px] font-bold text-white ring-2 ring-white">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-gray-900">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">
                  {s.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FAQ — accordion, clean
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-gradient-to-b from-white to-[#FFF8F2]">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F26522]">
              Questions?
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Frequently asked
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((f, i) => (
              <motion.div
                key={i}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50/50"
                >
                  <span className="text-sm font-semibold text-gray-900">{f.q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm leading-relaxed text-gray-600">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FINAL CTA — bold, gradient
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-14 sm:py-20">
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#F26522] via-[#D4541E] to-[#B8431A] px-6 py-12 sm:px-12 sm:py-16 text-center shadow-2xl"
          >
            {/* Decorative pattern */}
            <div className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            {/* Glow */}
            <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-80 rounded-full bg-white/20 blur-3xl" />

            <div className="relative">
              <Sparkles className="mx-auto h-8 w-8 text-white/80 mb-3" />
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                Ready to get started?
              </h2>
              <p className="mt-2 text-sm sm:text-base text-white/80 max-w-md mx-auto">
                Download the Concordia College app now and carry your campus with you — anywhere, anytime.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href={APK_DOWNLOAD_URL}
                  className="group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-white px-8 py-4 text-base font-bold text-[#F26522] shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
                >
                  <Download className="h-5 w-5" />
                  <span>{buttonLabel}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a
                  href="/"
                  className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/30 px-6 py-4 text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  Open Web Portal
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
              <p className="mt-4 text-xs text-white/60">
                {apkVersion} · {apkSize} · Updated {apkUpdated}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          FOOTER — minimal, sticky to bottom
      ═══════════════════════════════════════════════════════════════ */}
      <footer className="mt-auto border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandLogo size="sm" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF0E8] px-2.5 py-1 text-[11px] font-semibold text-[#D4541E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F26522]" />
                {apkVersion}
              </span>
            </div>
            <div className="flex items-center gap-5 text-sm text-gray-500">
              <a href="/" className="hover:text-[#F26522] transition-colors">Web Portal</a>
              <a
                href={GITHUB_RELEASES}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#F26522] transition-colors"
              >
                Releases
              </a>
              <a
                href={APK_DOWNLOAD_URL}
                className="inline-flex items-center gap-1 font-medium text-[#F26522] hover:text-[#D4541E] transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> APK
              </a>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Concordia College · {apkVersion} · Updated {apkUpdated} · Android 5.0+
            </p>
            <div className="mt-4 flex justify-center">
              <PoweredByFaq align="center" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ───────────────────────── Helpers ─────────────────────────

function Chip({ icon: Icon, children }: { icon?: any; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm">
      {Icon && <Icon className="h-3 w-3 text-[#F26522]" />}
      {children}
    </span>
  );
}
