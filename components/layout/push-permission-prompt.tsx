'use client';

import { useEffect, useState } from 'react';

import { enableWebPush, getWebPushPreference, syncPreviouslyEnabledWebPush, WEB_PUSH_PREFERENCE_KEY } from '@/lib/web-push';

export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('Notification' in window)) return;
    const preference = getWebPushPreference();
    if (preference === 'enabled' && Notification.permission === 'granted') {
      void syncPreviouslyEnabledWebPush().catch((syncError) => {
        console.warn('Unable to restore the previous Web Push subscription:', syncError);
      });
      return;
    }
    if (preference) return;
    if (Notification.permission === 'denied') {
      window.localStorage.setItem(WEB_PUSH_PREFERENCE_KEY, 'later');
      return;
    }
    // Defer this state transition until after the effect's synchronization
    // work has completed; React's lint rule flags direct effect updates.
    const timeoutId = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

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

  if (!visible) return null;
  return (
    <aside className="fixed bottom-4 right-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-cyan-900/70 bg-[#081120]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <p className="text-sm font-medium text-white">Get pinged when your audit score updates or cooldown finishes.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={later} className="rounded-md px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-100">Maybe later</button>
        <button type="button" onClick={() => void enable()} className="rounded-md bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300">Enable push</button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </aside>
  );
}
