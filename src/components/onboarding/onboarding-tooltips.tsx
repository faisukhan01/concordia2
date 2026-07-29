'use client';

import { useSyncExternalStore, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Info, Lightbulb, X, ChevronRight, Target, BookOpen } from 'lucide-react';

// Onboarding tips banner — shown at the top of the dashboard area for first-time users.
// Dismissed state is persisted to localStorage so the banner never re-appears.
// localStorage key is versioned (`_v1`) so future onboarding refreshes can reset it.
//
// Implementation note: we read dismissed-state via `useSyncExternalStore` rather than
// the (anti-pattern) "read localStorage in useEffect + setState" combo. This is the
// React-recommended way to subscribe a component to an external store, keeps SSR safe
// (server snapshot defaults to dismissed=true → no flash on first paint), and avoids
// the `react-hooks/set-state-in-effect` lint error.

const STORAGE_KEY = 'concordia_onboarding_dismissed_v1';
const STORAGE_EVENT = 'concordia:onboarding-change';

type TipDef = { id: string; icon: typeof Info; text: string };

const TIPS: TipDef[] = [
  {
    id: 'sidebar',
    icon: Lightbulb,
    text: 'Click any module in the sidebar to jump straight to that feature.',
  },
  {
    id: 'cmdk',
    icon: Target,
    text: 'Use Cmd+K (or Ctrl+K) to open the command palette and search anything.',
  },
  {
    id: 'help',
    icon: BookOpen,
    text: 'Hover over any field label to see help text.',
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
    // localStorage may throw in private mode / sandboxed iframes — default to dismissed.
    return true;
  }
}

function getServerSnapshot(): boolean {
  // Server render + first client render: assume dismissed to avoid SSR/CSR mismatch flash.
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
      // ignore — best-effort persistence
    }
  };

  const nextTip = () => setIndex((i) => (i + 1) % TIPS.length);

  if (dismissed) return null;

  const tip = TIPS[index];
  const TipIcon = tip.icon;
  const tipText = tip.text;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="mb-4"
      >
        <Card className="p-0 overflow-hidden border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5">
          <div className="flex items-center gap-3 p-3 sm:p-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 grid place-items-center shrink-0 shadow-sm">
              <TipIcon className="h-5 w-5 text-white" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Quick Tip
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {index + 1} of {TIPS.length}
                </span>
              </div>
              <p className="text-sm text-foreground mt-0.5 leading-snug">
                {tipText}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={nextTip}
              >
                Next tip
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
              <Button
                size="sm"
                className="h-8 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={dismiss}
              >
                Got it
              </Button>
              <button
                onClick={dismiss}
                aria-label="Dismiss tip"
                className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-amber-500/10 hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

export default OnboardingTips;
