'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  clearPersistedAuthState,
  getAuthenticatedDestination,
  persistAuthenticatedUser,
} from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

type SessionRouteGuardProps = {
  children: ReactNode;
};

function PublicRouteLoadingFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030512] px-4 text-slate-400">
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 px-5 py-4 text-center shadow-2xl shadow-slate-950/40">
        <div className="mx-auto h-8 w-8 animate-pulse rounded-full border border-cyan-500/20 bg-cyan-500/10" />
        <p className="mt-3 text-xs font-semibold tracking-wide">Checking your workspace session...</p>
      </div>
    </main>
  );
}

export function SessionRouteGuard({ children }: SessionRouteGuardProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [authenticatedDestination, setAuthenticatedDestination] = useState<string | null>(null);
  const supabase = useMemo(() => {
    if (!hasSupabaseBrowserEnv()) {
      return null;
    }

    try {
      return createSupabaseBrowserClient();
    } catch (error) {
      console.error('Unable to initialize session route guard:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    async function resolveSessionDestination() {
      if (!supabase) {
        clearPersistedAuthState();
        if (isMounted) {
          setAuthenticatedDestination(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error || !session?.user) {
          clearPersistedAuthState();
          if (isMounted) {
            setAuthenticatedDestination(null);
            setIsLoading(false);
          }
          return;
        }

        persistAuthenticatedUser(session.user);
        if (isMounted) {
          setAuthenticatedDestination(getAuthenticatedDestination(session.user));
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Unable to resolve persistent workspace session:', error);
        clearPersistedAuthState();
        if (isMounted) {
          setAuthenticatedDestination(null);
          setIsLoading(false);
        }
      }
    }

    void resolveSessionDestination();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (isLoading || !authenticatedDestination) {
      return;
    }

    router.replace(authenticatedDestination);
  }, [authenticatedDestination, isLoading, router]);

  if (isLoading || authenticatedDestination) {
    return <PublicRouteLoadingFallback />;
  }

  return <>{children}</>;
}
