import 'server-only';

import { PROFILE_SPECTATOR_BASE_URL } from '@/lib/spectate-profile-shared';

const PROFILE_SERVER_TIMEOUT_MS = 1_200;

export type ServerSpectatorProfileResult =
  | { kind: 'success'; payload: unknown }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

/**
 * Render is an external dependency. Bound the first server request so an
 * outage cannot delay the app shell's first bytes for its full timeout.
 */
export async function loadServerSpectatorProfile(
  username: string,
  accessToken: string | null
): Promise<ServerSpectatorProfileResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_SERVER_TIMEOUT_MS);

  try {
    const headers = new Headers();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

    const response = await fetch(
      `${PROFILE_SPECTATOR_BASE_URL}/api/spectate-profile/${encodeURIComponent(username)}`,
      {
        cache: 'no-store',
        headers,
        signal: controller.signal,
      }
    );

    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'unavailable' };

    const payload = await response.json().catch(() => null);
    return payload ? { kind: 'success', payload } : { kind: 'unavailable' };
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.warn('Server spectator profile request failed:', error.message);
    }
    return { kind: 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
