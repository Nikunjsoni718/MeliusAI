export type UsernameUser = {
  id?: string | null;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  raw_user_meta_data?: Record<string, unknown> | null;
};

const USERNAME_MAX_LENGTH = 24;

function readMetadataText(user: UsernameUser, key: string) {
  const value = user.user_metadata?.[key] ?? user.raw_user_meta_data?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeUsername(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, USERNAME_MAX_LENGTH)
      .replace(/_+$/g, '') || 'member'
  );
}

export function generateUsername(user: UsernameUser) {
  const displayName =
    readMetadataText(user, 'display_name') ??
    readMetadataText(user, 'full_name') ??
    readMetadataText(user, 'name');
  const emailPrefix = user.email?.trim().split('@')[0] || null;

  return normalizeUsername(displayName ?? emailPrefix ?? 'member');
}

export function appendUsernameSuffix(username: string, userId: string) {
  const suffix = userId.replace(/-/g, '').slice(0, 8).toLowerCase();
  const availableBaseLength = USERNAME_MAX_LENGTH - suffix.length - 1;
  const base = normalizeUsername(username).slice(0, availableBaseLength).replace(/_+$/g, '') || 'member';

  return `${base}_${suffix}`;
}
