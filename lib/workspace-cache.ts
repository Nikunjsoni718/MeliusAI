/**
 * Stable, account-scoped SWR keys for client workspace data. Keep credentials
 * out of keys: identity is enough to keep owner and visitor responses apart.
 */
export const workspaceCacheKeys = {
  viewerSession: ['workspace', 'viewer-session'] as const,
  viewerProfile: (userId: string) => ['workspace', 'viewer-profile', userId] as const,
  settings: (userId: string) => ['workspace', 'settings', userId] as const,
  notifications: (userId: string) => ['workspace', 'notifications', userId] as const,
  githubConnection: (userId: string) => ['workspace', 'github-connection', userId] as const,
  resumeIdentity: (scope: 'owner' | 'shared', identity: string, viewerId: string | null) =>
    ['workspace', 'resume-identity', scope, identity, viewerId ?? 'public'] as const,
  resumeWork: (scope: 'owner' | 'shared', identity: string, viewerId: string | null) =>
    ['workspace', 'resume-work', scope, identity, viewerId ?? 'public'] as const,
  spectatorProfile: (username: string, viewerId: string | null) =>
    ['workspace', 'spectator-profile', username.toLowerCase(), viewerId ?? 'public'] as const,
  opportunities: (userId: string) => ['workspace', 'opportunities', userId] as const,
  vaultOwner: (userId: string) => ['workspace', 'vault', 'owner', userId] as const,
  vaultSpectator: (username: string, viewerId: string | null) =>
    ['workspace', 'vault', 'spectator', username.toLowerCase(), viewerId ?? 'public'] as const,
};
