import { notFound } from 'next/navigation';

import { ProfileDashboard } from '@/components/dashboard/profile-dashboard';
import { WorkspaceDataHydration } from '@/components/providers/workspace-data-hydration';
import { loadServerSpectatorProfile } from '@/lib/server/spectate-profile';
import { loadWorkspaceBootstrap } from '@/lib/server/workspace-bootstrap';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: encodedUsername } = await params;
  const username = decodeURIComponent(encodedUsername).trim().replace(/^@+/, '');
  const bootstrap = await loadWorkspaceBootstrap();
  const result = username
    ? await loadServerSpectatorProfile(username, bootstrap.accessToken)
    : { kind: 'not-found' as const };

  if (result.kind === 'not-found') notFound();

  const viewerId = bootstrap.viewer.user?.id ?? null;
  const initialPayload = result.kind === 'success' ? result.payload : null;

  return (
    <WorkspaceDataHydration
      entries={
        initialPayload
          ? [
              {
                key: workspaceCacheKeys.spectatorProfile(username, viewerId),
                value: initialPayload,
              },
            ]
          : []
      }
    >
      <ProfileDashboard
        insideWorkspaceShell
        initialSpectatorProfile={initialPayload}
        profileUsername={username}
      />
    </WorkspaceDataHydration>
  );
}
