'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';

import {
  clearPersistedAuthState,
  getAuthenticatedDestination,
  persistAuthenticatedUser,
} from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

type SessionRouteGuardProps = {
  children: ReactNode;
};

const PUBLIC_SESSION_CHECK_TIMEOUT_MS = 3500;

export function SessionRouteGuard({ children }: SessionRouteGuardProps) {
  const router = useRouter();
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
        return;
      }

      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<'timeout'>((resolve) =>
            window.setTimeout(() => resolve('timeout'), PUBLIC_SESSION_CHECK_TIMEOUT_MS)
          ),
        ]);

        if (sessionResult === 'timeout') {
          console.warn('Session check timed out; showing public auth route.');
          return;
        }

        const {
          data: { session },
          error,
        } = sessionResult;

        if (error || !session?.user) {
          clearPersistedAuthState();
          return;
        }

        persistAuthenticatedUser(session.user);
        if (isMounted) {
          router.replace(getAuthenticatedDestination(session.user));
        }
      } catch (error) {
        console.error('Unable to resolve persistent workspace session:', error);
        clearPersistedAuthState();
      }
    }

    void resolveSessionDestination();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  return <>{children}</>;
}
