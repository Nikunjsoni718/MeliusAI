'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { enableWebPush, getWebPushPreference, syncPreviouslyEnabledWebPush, WEB_PUSH_PREFERENCE_KEY } from '@/lib/web-push';

type PushPermissionPromptProps = {
  userId: string | null;
  onboardingBlocked: boolean;
};

export function PushPermissionPrompt({ userId, onboardingBlocked }: PushPermissionPromptProps) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !('Notification' in window)) return;

    const preference = getWebPushPreference();
    if (preference === 'enabled' && Notification.permission === 'granted') {
      void syncPreviouslyEnabledWebPush().catch((syncError) => {
        console.warn('Unable to restore the previous Web Push subscription:', syncError);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (onboardingBlocked || !userId || !('Notification' in window)) return;

    const preference = getWebPushPreference();
    if (preference) return;
    if (Notification.permission === 'denied') {
      window.localStorage.setItem(WEB_PUSH_PREFERENCE_KEY, 'later');
      return;
    }
    // Defer this state transition until after the effect's synchronization
    // work has completed; React's lint rule flags direct effect updates.
    const timeoutId = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, [onboardingBlocked, userId]);

  async function enable() {
    setError(null);
    try {
      await enableWebPush();
      setVisible(false);
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : 'Unable to enable Web Push.');
    }
  }

  function later() {
    window.localStorage.setItem(WEB_PUSH_PREFERENCE_KEY, 'later');
    setVisible(false);
  }

  const promptVisible = visible && Boolean(userId) && !onboardingBlocked;

  return (
    <AnimatePresence>
      {promptVisible ? (
        <motion.aside
          aria-live="polite"
          initial={{ opacity: 0, y: -24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed top-6 left-1/2 z-[80] w-full max-w-md -translate-x-1/2 px-4 max-md:top-auto max-md:bottom-[calc(env(safe-area-inset-bottom)+1rem)] max-md:z-[13000] max-md:w-[calc(100%-2rem)] max-md:px-0"
        >
          <div className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#0B1221]/90 p-4 shadow-[0_0_25px_-5px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/20 backdrop-blur-xl">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-28 w-28 rounded-full bg-cyan-400/15 blur-3xl" />
            <div className="relative flex items-start gap-3 max-md:gap-3.5">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-[0_0_18px_rgba(6,182,212,0.18)] max-md:h-11 max-md:w-11">
                <BellRing className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white max-md:text-base">Stay in the loop</p>
                <p className="mt-1 text-sm leading-5 text-slate-400 max-md:text-sm">Get pinged when your audit score updates or cooldown finishes.</p>
                <div className="mt-4 flex items-center justify-end gap-2 max-md:gap-3">
                  <button type="button" onClick={later} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800/80 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 max-md:min-h-11 max-md:flex-1 max-md:text-sm">Maybe later</button>
                  <button type="button" onClick={() => void enable()} className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-medium text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition hover:bg-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1221] max-md:min-h-11 max-md:flex-1 max-md:text-sm">Enable push</button>
                </div>
                {error ? <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 max-md:text-sm" role="alert">{error}</p> : null}
              </div>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
