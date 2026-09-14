'use client';

import { useEffect, type ReactNode } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

function WorkspaceAuthCacheBoundary({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (!hasSupabaseBrowserEnv()) return;

    const supabase = createSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void mutate(workspaceCacheKeys.viewerSession, session ?? null, { revalidate: false });
      if (!session?.user) {
        void mutate(
          (key) => Array.isArray(key) && key[0] === 'workspace' && key[1] !== 'viewer-session',
          undefined,
          { revalidate: false }
        );
      }
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
