'use client';

import { useSyncExternalStore } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { motion, useReducedMotion } from 'framer-motion';
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
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';

// ───────────────────────── Config ─────────────────────────
// Always points to the LATEST GitHub release — no version baked into the URL.
const APK_DOWNLOAD_URL =
  'https://github.com/faisukhan01/concordia2/releases/latest/download/concordia-college.apk';
const APK_VERSION = 'v3.6.1';
const APK_UPDATED = 'August 3, 2025';
const APK_SIZE = '45 MB';
const GITHUB_RELEASES = 'https://github.com/faisukhan01/concordia2/releases';

// ───────────────────────── Data ─────────────────────────

const highlights = [
  { icon: Bell, label: 'Push Notifications', sub: 'WhatsApp-style alerts' },
  { icon: Wallet, label: 'Fee Management', sub: 'Invoices & challans' },
  { icon: CalendarCheck, label: 'Attendance', sub: 'Live tracking' },
  { icon: Megaphone, label: 'Announcements', sub: 'Instant delivery' },
  { icon: GraduationCap, label: '8 Role Portals', sub: 'Admin → Parent' },
  { icon: Cpu, label: 'Native Performance', sub: 'Flutter WebView' },
];

// ───────────────────────── Component ─────────────────────────

export default function DownloadPage() {
  const isAndroid = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('android'),
    () => false,
  );
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const reduce = useReducedMotion();

  const buttonLabel = mounted && isAndroid ? 'Update App' : 'Download for Android';

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#1A1A1A] antialiased selection:bg-[#F26522]/20">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 sm:px-8 py-3.5">
          <BrandLogo size="sm" />
          <a
            href="/"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-[#F26522]"
          >
            <span className="opacity-50 transition-opacity group-hover:opacity-100">&larr;</span>
            Back to Portal
          </a>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          HERO — clean white background, orange accents, app icon,
          headline, download card with QR + button
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#FFF8F2] via-white to-white">
        {/* Subtle decorative dot pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(242,101,34,0.07) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />
        {/* Soft orange glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-[640px] rounded-full bg-[radial-gradient(circle,_rgba(242,101,34,0.12),_transparent_70%)] blur-2xl" />

        <div className="relative mx-auto max-w-5xl px-5 sm:px-8 py-12 sm:py-16">
          {/* Version pill */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F26522]/20 bg-[#FFF0E8] px-3.5 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F26522] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F26522]" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#D4541E]">
                Latest Build · {APK_VERSION}
              </span>
            </div>
          </motion.div>

          {/* App icon */}
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 flex justify-center"
          >
            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-[28%] bg-[#F26522]/25 blur-2xl scale-110" />
              <div className="relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-[28%] bg-[#F26522] shadow-[0_18px_40px_-10px_rgba(242,101,34,0.55)] ring-1 ring-black/5">
                <Image
                  src="/app-icon-512.png"
                  alt="Concordia College app icon"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 text-center"
          >
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl">
              Concordia College
            </h1>
            <p className="mt-3 text-base text-gray-500 sm:text-lg max-w-xl mx-auto">
              Your entire college — admissions, academics, fees, and notifications — in one
              beautiful Android app.
            </p>
          </motion.div>

          {/* ── Download card (QR + Button) — the centerpiece ── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 mx-auto max-w-2xl"
          >
            <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.12)]">
              {/* Top orange accent bar */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#F26522] via-[#FF8A4C] to-[#F26522]" />

              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                {/* QR code — branded, self-hosted */}
                <div className="flex flex-col items-center gap-3 shrink-0">
                  <div className="relative p-3 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    {/* Scan line animation */}
                    {!reduce && (
                      <motion.div
                        animate={{ top: ['8%', '92%', '8%'] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                        className="pointer-events-none absolute left-3 right-3 h-0.5 bg-gradient-to-r from-transparent via-[#F26522] to-transparent rounded-full"
                      />
                    )}
                    <QRCodeSVG
                      value={APK_DOWNLOAD_URL}
                      size={168}
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#1A1A1A"
                      marginSize={0}
                      imageSettings={{
                        src: '/app-icon-512.png',
                        height: 40,
                        width: 40,
                        excavate: true,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-[#D4541E]">
                    <QrCode className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      Scan to download
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="hidden sm:block h-32 w-px bg-gray-100" />

                {/* Download button + meta */}
                <div className="flex-1 flex flex-col items-center sm:items-start gap-4 w-full">
                  <div className="text-center sm:text-left">
                    <div className="text-lg font-bold text-gray-900">
                      {mounted && isAndroid ? 'Update your app' : 'Get the app'}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {mounted && isAndroid
                        ? 'Installs over your current version — login preserved.'
                        : 'Scan the QR with your phone, or tap below.'}
                    </div>
                  </div>

                  <a
                    href={APK_DOWNLOAD_URL}
                    className="group relative inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-[#F26522] px-7 py-4 text-base font-semibold text-white shadow-[0_12px_28px_-8px_rgba(242,101,34,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D4541E] hover:shadow-[0_16px_36px_-8px_rgba(242,101,34,0.6)]"
                  >
                    <Download className="h-5 w-5" />
                    <span>{buttonLabel}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>

                  {/* Meta chips */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <Chip>{APK_VERSION}</Chip>
                    <Chip>{APK_SIZE}</Chip>
                    <Chip icon={Smartphone}>Android 5.0+</Chip>
                    <Chip icon={ShieldCheck}>Verified</Chip>
                  </div>

                  <a
                    href={GITHUB_RELEASES}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#F26522] transition-colors"
                  >
                    View all releases <ChevronRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Android hint */}
          {mounted && isAndroid && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mt-6 mx-auto max-w-2xl flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm text-emerald-800">
                <strong className="text-emerald-900">You&rsquo;re on Android.</strong> Tap{' '}
                <span className="font-semibold text-emerald-700">Update App</span> above. Your login
                and data are preserved after the update.
              </p>
            </motion.div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          HIGHLIGHTS — compact strip of key capabilities
      ═══════════════════════════════════════════════════════════════ */}
      <section className="border-y border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {highlights.map((h, i) => (
              <motion.div
                key={h.label}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="group flex flex-col items-center text-center rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm hover:border-[#F26522]/30 transition-all"
              >
                <span className="grid place-items-center h-10 w-10 rounded-lg bg-[#FFF0E8] mb-2.5 group-hover:bg-[#F26522] transition-colors">
                  <h.icon className="h-[18px] w-[18px] text-[#F26522] group-hover:text-white transition-colors" strokeWidth={2} />
                </span>
                <div className="text-[13px] font-semibold text-gray-900 leading-tight">{h.label}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{h.sub}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          INSTALL STEPS — clean 3-step horizontal
      ═══════════════════════════════════════════════════════════════ */}
      <section className="flex-1">
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
            <div className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent md:block" />

            {[
              {
                n: 1,
                title: mounted && isAndroid ? 'Tap Update' : 'Download',
                desc:
                  mounted && isAndroid
                    ? 'Tap the Update App button above to start the download.'
                    : 'Tap the download button or scan the QR code with your phone camera.',
                icon: Download,
              },
              {
                n: 2,
                title: mounted && isAndroid ? 'Open the file' : 'Allow installs',
                desc:
                  mounted && isAndroid
                    ? 'Open from your notifications or Downloads folder, then tap Install.'
                    : 'Android may prompt to allow installs from unknown sources — allow it once.',
                icon: ShieldCheck,
              },
              {
                n: 3,
                title: 'Sign in',
                desc:
                  mounted && isAndroid
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
                  <div className="grid place-items-center h-14 w-14 rounded-full bg-white border border-gray-200 shadow-sm">
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

          {/* Final CTA */}
          <div className="mt-14 text-center">
            <a
              href={APK_DOWNLOAD_URL}
              className="group inline-flex items-center gap-2.5 rounded-2xl bg-[#F26522] px-8 py-4 text-base font-semibold text-white shadow-[0_12px_28px_-8px_rgba(242,101,34,0.5)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D4541E] hover:shadow-[0_16px_36px_-8px_rgba(242,101,34,0.6)]"
            >
              <Download className="h-5 w-5" />
              <span>{buttonLabel}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="mt-3 text-xs text-gray-400">
              Direct download from GitHub Releases · Always the latest version · {APK_SIZE}
            </p>
          </div>
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
                {APK_VERSION}
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
              &copy; {new Date().getFullYear()} Concordia College · {APK_VERSION} · Updated {APK_UPDATED} · Android 5.0+
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ───────────────────────── Helpers ─────────────────────────

function Chip({ icon: Icon, children }: { icon?: any; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">
      {Icon && <Icon className="h-3 w-3 text-[#F26522]" />}
      {children}
    </span>
  );
}
