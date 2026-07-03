'use client';

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

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
  init?: RequestInit;
  signal?: AbortSignal;
  supabase?: SupabaseSessionClient | null;
};

export const PROFILE_SPECTATOR_BASE_URL = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');

let fallbackSupabaseClient: SupabaseSessionClient | null = null;

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
  const accessToken = await getSupabaseAccessToken(options.supabase);

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

  return fetch(
    `${PROFILE_SPECTATOR_BASE_URL}/api/spectate-profile/${encodeURIComponent(targetUsername)}`,
    requestInit
  );
}
