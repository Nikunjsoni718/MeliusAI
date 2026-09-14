'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { SWRConfig, unstable_serialize, type Key } from 'swr';

import type { ViewerBootstrap } from '@/lib/workspace-bootstrap';

const ViewerBootstrapContext = createContext<ViewerBootstrap | null>(null);

export function useViewerBootstrap() {
  return useContext(ViewerBootstrapContext);
}

type WorkspaceFallbackEntry = {
  key: Key;
  value: unknown;
};

/**
 * Adds route-specific server data to the root SWR cache without changing its
 * global revalidation policy. Values in this component are intentionally
 * serializable, token-free response objects.
 */
export function WorkspaceDataHydration({
  children,
  entries = [],
  viewer,
}: {
  children: ReactNode;
  entries?: WorkspaceFallbackEntry[];
  viewer?: ViewerBootstrap | null;
}) {
  const fallback = Object.fromEntries(
    entries.map(({ key, value }) => [unstable_serialize(key), value])
  );

  const content = <SWRConfig value={{ fallback }}>{children}</SWRConfig>;

  return viewer === undefined ? (
    content
  ) : (
    <ViewerBootstrapContext.Provider value={viewer}>{content}</ViewerBootstrapContext.Provider>
  );
}
