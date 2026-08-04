'use client';

import { useSyncExternalStore, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, X, ChevronRight, Target, BookOpen, Sparkles } from 'lucide-react';

// Onboarding tips banner — shown at the top of the dashboard area for first-time users.
// Dismissed state is persisted to localStorage so the banner never re-appears.
// localStorage key is versioned (`_v1`) so future onboarding refreshes can reset it.
//
// v4.6.0: Completely redesigned — cleaner, more aesthetic, less cluttered.
// Uses a subtle gradient, better spacing, and a cleaner action layout.

const STORAGE_KEY = 'concordia_onboarding_dismissed_v2';
const STORAGE_EVENT = 'concordia:onboarding-change';

type TipDef = { id: string; icon: typeof Lightbulb; text: string; label: string };

const TIPS: TipDef[] = [
  {
    id: 'sidebar',
    icon: Lightbulb,
    label: 'Navigate',
    text: 'Click any module in the sidebar to jump straight to that feature.',
  },
  {
    id: 'cmdk',
    icon: Target,
    label: 'Search',
    text: 'Press Ctrl+K to open the command palette and search anything instantly.',
  },
  {
    id: 'help',
    icon: BookOpen,
    label: 'Learn',
    text: 'Need help? Visit the Help & Support page for FAQs and guides.',
  },
];

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function OnboardingTips() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [index, setIndex] = useState(0);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      // ignore
    }
  };

  const nextTip = () => setIndex((i) => (i + 1) % TIPS.length);

  if (dismissed) return null;

  const tip = TIPS[index];
  const TipIcon = tip.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-4"
      >
        <div className="relative overflow-hidden rounded-xl border border-orange-200/60 bg-white shadow-sm">
          {/* Subtle gradient accent bar on the left */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#F26522] to-[#FF8A4C]" />

          {/* Soft decorative gradient in the top-right */}
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-orange-50/80 blur-2xl" aria-hidden />

          <div className="relative flex items-center gap-3.5 py-3 pl-4 pr-3">
            {/* Icon with gradient background */}
            <div className="relative h-9 w-9 shrink-0">
              <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[#F26522] to-[#D4541E] shadow-sm" />
              <TipIcon className="absolute inset-0 m-auto h-4 w-4 text-white" strokeWidth={2.2} />
            </div>

            {/* Text content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#F26522]">
                  {tip.label}
                </span>
                <span className="text-[10px] font-medium text-gray-300">·</span>
                <span className="text-[10px] font-medium text-gray-400">
                  {index + 1} / {TIPS.length}
                </span>
              </div>
              <p className="text-[13px] text-gray-700 mt-0.5 leading-snug truncate">
                {tip.text}
              </p>
            </div>

            {/* Actions — clean, minimal */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={nextTip}
                className="hidden sm:flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-gray-500 hover:text-[#F26522] hover:bg-orange-50 rounded-md transition-colors"
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </button>
              <button
                onClick={dismiss}
                className="h-7 px-3 text-[11px] font-semibold text-white bg-[#F26522] hover:bg-[#D4541E] rounded-md transition-colors shadow-sm"
              >
                Got it
              </button>
              <button
                onClick={dismiss}
                aria-label="Dismiss tip"
                className="h-7 w-7 grid place-items-center rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Progress dots at the bottom */}
          <div className="flex items-center gap-1 px-4 pb-2">
            {TIPS.map((_, i) => (
              <div
                key={i}
                className={`h-0.5 rounded-full transition-all duration-300 ${
                  i === index ? 'w-6 bg-[#F26522]' : 'w-2 bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default OnboardingTips;
