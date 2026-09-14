import type { ReactNode } from 'react';

import { WorkspaceAppShell } from '@/components/layout/workspace-app-shell';
import { WorkspaceDataHydration } from '@/components/providers/workspace-data-hydration';
import { loadWorkspaceBootstrap } from '@/lib/server/workspace-bootstrap';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const bootstrap = await loadWorkspaceBootstrap();
  const viewerId = bootstrap.viewer.user?.id ?? null;

  return (
    <WorkspaceDataHydration
      viewer={bootstrap.viewer}
      entries={
        viewerId && bootstrap.viewer.profile
          ? [{ key: workspaceCacheKeys.viewerProfile(viewerId), value: bootstrap.viewer.profile }]
          : []
      }
    >
      <WorkspaceAppShell>{children}</WorkspaceAppShell>
    </WorkspaceDataHydration>
  );
}
