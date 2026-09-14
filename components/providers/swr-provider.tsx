'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

function WorkspaceAuthCacheBoundary({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const previousViewerIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!hasSupabaseBrowserEnv()) return;

    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextViewerId = session?.user?.id ?? null;
      const previousViewerId = previousViewerIdRef.current;
      previousViewerIdRef.current = nextViewerId;

      // Public spectator payloads and owner payloads have separate keys, but
      // remove every workspace entry when identity changes so a late request
      // from a prior account can never paint in the new session.
      if (previousViewerId !== nextViewerId) {
        void mutate(
          (key) => Array.isArray(key) && key[0] === 'workspace',
          undefined,
          { revalidate: false }
        );
      }

      void mutate(workspaceCacheKeys.viewerSession, session ?? null, { revalidate: false });
    });

    return () => subscription.unsubscribe();
  }, [mutate]);

  return <>{children}</>;
}

export function WorkspaceSWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 30_000,
        revalidateIfStale: true,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        shouldRetryOnError: false,
        suspense: false,
      }}
    >
      <WorkspaceAuthCacheBoundary>{children}</WorkspaceAuthCacheBoundary>
    </SWRConfig>
  );
}
