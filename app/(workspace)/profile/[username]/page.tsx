import { notFound } from 'next/navigation';

import { ProfileDashboard } from '@/components/dashboard/profile-dashboard';
import { WorkspaceDataHydration } from '@/components/providers/workspace-data-hydration';
import { loadServerSpectatorProfile } from '@/lib/server/spectate-profile';
import { loadWorkspaceBootstrap } from '@/lib/server/workspace-bootstrap';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username: encodedUsername } = await params;
  let username = '';

  try {
    username = decodeURIComponent(encodedUsername).trim().replace(/^@+/, '');
  } catch {
    notFound();
  }

  const bootstrap = await loadWorkspaceBootstrap();
  const result = username
    ? await loadServerSpectatorProfile(username, bootstrap.accessToken)
    : { kind: 'not-found' as const };

  if (result.kind === 'not-found') notFound();
  if (result.kind === 'unavailable') {
    return (
      <main className="flex min-h-full items-center justify-center px-6 py-16 text-center text-slate-100">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-950/70 p-8 shadow-2xl">
          <h1 className="text-xl font-semibold">Profile temporarily unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This public profile could not be loaded right now. Please refresh and try again.
          </p>
        </div>
      </main>
    );
  }

  const viewerId = bootstrap.viewer.user?.id ?? null;
  const initialPayload = result.payload;

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
