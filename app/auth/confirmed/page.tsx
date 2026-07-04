'use client';

import Image from 'next/image';
import { useEffect } from 'react';

import faviconLogo from '@/app/favicon.png';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

export default function ConfirmedPage() {
  useEffect(() => {
    if (!hasSupabaseBrowserEnv()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');

    if (!code) {
      void supabase.auth.getSession();
      return;
    }

    void supabase.auth.exchangeCodeForSession(code).finally(() => {
      window.history.replaceState({}, document.title, '/auth/confirmed');
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <section className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-slate-950/40">
          <Image src={faviconLogo} alt="MeliusAI Logo" width={44} height={44} className="object-contain" />
        </div>
        <h1 className="mt-8 text-4xl font-bold tracking-tight text-white">Email Confirmed! ✅</h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          Your account is verified. You can securely close this tab and return to your original window.
        </p>
      </section>
    </main>
  );
}
