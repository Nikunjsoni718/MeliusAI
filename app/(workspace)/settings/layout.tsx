import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { SettingsHubLayout } from '@/components/settings/settings-hub-layout';
import { WorkspaceDataHydration } from '@/components/providers/workspace-data-hydration';
import { getGitHubConnectionToken } from '@/lib/github-connection';
import type { PersistedSettings } from '@/lib/settings';
import { loadWorkspaceBootstrap } from '@/lib/server/workspace-bootstrap';
import { workspaceCacheKeys } from '@/lib/workspace-cache';

function toPersistedSettings(
  profile: NonNullable<Awaited<ReturnType<typeof loadWorkspaceBootstrap>>['viewer']['profile']>
): PersistedSettings {
  return {
    username: profile.username,
    current_status: profile.current_status as PersistedSettings['current_status'],
    public_profile_enabled: profile.public_profile_enabled ?? true,
    public_scorecard_enabled: profile.public_scorecard_enabled ?? true,
    public_contact_email_enabled: profile.public_contact_email_enabled ?? false,
    default_asset_is_public: profile.default_asset_is_public ?? true,
    audit_alerts_enabled: profile.audit_alerts_enabled ?? true,
    opportunity_match_alerts_enabled: profile.opportunity_match_alerts_enabled ?? true,
  };
}

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const bootstrap = await loadWorkspaceBootstrap();
  const user = bootstrap.viewer.user;
  const profile = bootstrap.viewer.profile;

  if (!user) redirect('/auth');

  const settings = profile ? toPersistedSettings(profile) : null;
  const githubConnection = await getGitHubConnectionToken(user.id)
    .then((token) => ({ connected: Boolean(token) }))
    .catch((error) => {
      console.warn('Unable to server-render GitHub connection status:', error);
      return null;
    });

  return (
    <WorkspaceDataHydration
      viewer={bootstrap.viewer}
      entries={[
        ...(settings ? [{ key: workspaceCacheKeys.settings(user.id), value: settings }] : []),
        ...(githubConnection
          ? [{ key: workspaceCacheKeys.githubConnection(user.id), value: githubConnection }]
          : []),
      ]}
    >
      <SettingsHubLayout>{children}</SettingsHubLayout>
    </WorkspaceDataHydration>
  );
}
