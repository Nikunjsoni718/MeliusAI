'use client';

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
import { PROFILE_SPECTATOR_BASE_URL } from '@/lib/spectate-profile-shared';

type SupabaseSessionClient = {
  auth: {
    getSession: () => Promise<{
      data: {
        session: {
          access_token?: string | null;
        } | null;
      };
      error: Error | null;
    }>;
  };
};

type SpectateProfileFetchOptions = {
  accessToken?: string | null;
  init?: RequestInit;
  signal?: AbortSignal;
  supabase?: SupabaseSessionClient | null;
  view?: 'identity' | 'work';
};

type SpectateProfileErrorPayload = {
  error?: unknown;
  detail?: unknown;
  message?: unknown;
};

export { PROFILE_SPECTATOR_BASE_URL } from '@/lib/spectate-profile-shared';

let fallbackSupabaseClient: SupabaseSessionClient | null = null;

/**
 * The Python spectator API returns `error` for its safe public failures while
 * older deployments returned `detail` or `message`. Keep every spectator
 * surface compatible with both response shapes.
 */
export function getSpectateProfileErrorMessage(
  payload: unknown,
  fallback: string
) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const errorPayload = payload as SpectateProfileErrorPayload;
  for (const value of [errorPayload.error, errorPayload.detail, errorPayload.message]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function getFallbackSupabaseClient() {
  if (typeof window === 'undefined' || !hasSupabaseBrowserEnv()) {
    return null;
  }

  if (!fallbackSupabaseClient) {
    try {
      fallbackSupabaseClient = createSupabaseBrowserClient();
    } catch (error) {
      console.warn('Unable to initialize profile spectator auth client:', error);
      fallbackSupabaseClient = null;
    }
  }

  return fallbackSupabaseClient;
}

async function getSupabaseAccessToken(supabase?: SupabaseSessionClient | null) {
  const sessionClient = supabase ?? getFallbackSupabaseClient();

  if (!sessionClient) {
    return null;
  }

  try {
    const {
      data: { session },
      error,
    } = await sessionClient.auth.getSession();

    if (error) {
      console.warn('Unable to resolve profile spectator session:', error.message);
      return null;
    }

    return session?.access_token ?? null;
  } catch (error) {
    console.warn('Unable to read profile spectator session:', error);
    return null;
  }
}

export async function fetchSpectateProfileResponse(
  targetUsername: string,
  options: SpectateProfileFetchOptions = {}
) {
  const headers = new Headers(options.init?.headers);
  // Passing null explicitly skips the asynchronous session lookup so public
  // profile content can start loading on the component's first effect.
  const accessToken =
    options.accessToken !== undefined
      ? options.accessToken
      : await getSupabaseAccessToken(options.supabase);

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const requestInit: RequestInit = {
    ...options.init,
    cache: 'no-store',
    credentials: 'include',
    headers,
  };

  if (options.signal) {
    requestInit.signal = options.signal;
  }

  const endpoint = new URL(
    `${PROFILE_SPECTATOR_BASE_URL}/api/spectate-profile/${encodeURIComponent(targetUsername)}`
  );

  if (options.view) {
    endpoint.searchParams.set('view', options.view);
  }

  return fetch(endpoint, requestInit);
}
