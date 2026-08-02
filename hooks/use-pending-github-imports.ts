'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PendingImportRow } from '@/types/supabase';

type PendingGitHubImportsOptions = {
  enabled: boolean;
  supabase: ReturnType<typeof createSupabaseBrowserClient> | null;
  userId: string | null;
};

const PENDING_IMPORT_SELECT = [
  'id',
  'user_id',
  'provider',
  'provider_repository_id',
  'repository_full_name',
  'repository_name',
  'html_url',
  'default_branch',
  'is_private',
  'status',
  'webhook_delivery_id',
  'repository_payload',
  'detected_at',
  'resolved_at',
  'created_at',
  'updated_at',
].join(', ');

export function usePendingGitHubImports({
  enabled,
  supabase,
  userId,
}: PendingGitHubImportsOptions) {
  const [pendingImports, setPendingImports] = useState<PendingImportRow[]>([]);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const requestKey = enabled && userId ? `github:${userId}` : null;

  const refresh = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;

    if (!requestKey || !supabase || !userId) {
      setPendingImports([]);
      setError(null);
      setLoadedRequestKey(requestKey);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('pending_imports')
      .select(PENDING_IMPORT_SELECT)
      .eq('user_id', userId)
      .eq('provider', 'github')
      .eq('status', 'pending')
      .eq('is_private', false)
      .order('detected_at', { ascending: false })
      .limit(10);

    if (requestSequence !== requestSequenceRef.current) {
      return;
    }

    if (queryError) {
      setError(queryError.message);
      setLoadedRequestKey(requestKey);
      return;
    }

    setPendingImports((data ?? []) as unknown as PendingImportRow[]);
    setError(null);
    setLoadedRequestKey(requestKey);
  }, [requestKey, supabase, userId]);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(refreshTimer);
      requestSequenceRef.current += 1;
    };
  }, [refresh]);

  const markRepositoriesImported = useCallback(
    async (repositoryNames: string[]) => {
      if (!supabase || !userId) {
        return;
      }

      const normalizedRepositories = Array.from(
        new Set(repositoryNames.map((repository) => repository.trim().toLowerCase()).filter(Boolean))
      );
      if (normalizedRepositories.length === 0) {
        return;
      }

      const resolvedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('pending_imports')
        .update({ status: 'imported', resolved_at: resolvedAt })
        .eq('user_id', userId)
        .eq('provider', 'github')
        .eq('status', 'pending')
        .in('repository_full_name', normalizedRepositories);

      if (updateError) {
        throw updateError;
      }

      setPendingImports((currentImports) =>
        currentImports.filter(
          (pendingImport) =>
            !normalizedRepositories.includes(pendingImport.repository_full_name.toLowerCase())
        )
      );
    },
    [supabase, userId]
  );

  return useMemo(
    () => ({
      error,
      isReady: requestKey === null || loadedRequestKey === requestKey,
      markRepositoriesImported,
      pendingImport: pendingImports[0] ?? null,
      pendingImports,
      refresh,
    }),
    [error, loadedRequestKey, markRepositoriesImported, pendingImports, refresh, requestKey]
  );
}
