import type { User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { after, NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';
import { appendUsernameSuffix, generateUsername, normalizeUsername } from '@/lib/username';

export const runtime = 'nodejs';

const OAUTH_CALLBACK_OPERATION_TIMEOUT_MS = 12_000;
const PROFILE_EMBEDDING_SYNC_TIMEOUT_MS = 5_000;

async function withOAuthCallbackTimeout<T>(
  operation: PromiseLike<T>,
  operationName: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`OAuth callback ${operationName} timed out.`));
    }, OAUTH_CALLBACK_OPERATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(operation), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getProfileEmbeddingSyncEndpoint() {
  const explicitEndpoint =
    process.env.PYTHON_BACKEND_PROFILE_SYNC_URL ||
    process.env.NEXT_PUBLIC_PYTHON_BACKEND_PROFILE_SYNC_URL;

  if (explicitEndpoint?.trim()) {
    return explicitEndpoint.trim();
  }

  const backendBaseUrl = process.env.PYTHON_BACKEND_URL || process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL;

  if (backendBaseUrl?.trim()) {
    return `${backendBaseUrl.trim().replace(/\/$/, '')}/api/profile/sync-embedding`;
  }

  return 'https://meliusai.onrender.com/api/profile/sync-embedding';
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getMetadataText(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getFullName(user: User) {
  return (
    getMetadataText(user, 'full_name') ??
    getMetadataText(user, 'name') ??
    getMetadataText(user, 'display_name') ??
    user.email?.split('@')[0] ??
    'Member'
  );
}

function getAvatarUrl(user: User) {
  return getMetadataText(user, 'avatar_url') ?? getMetadataText(user, 'picture');
}

async function triggerProfileEmbeddingSync({
  accessToken,
  avatarUrl,
  bio,
  fullName,
  userId,
  username,
}: {
  accessToken?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  fullName: string;
  userId: string;
  username: string;
}) {
  if (!accessToken) {
    console.warn('OAuth profile embedding sync skipped: missing Supabase access token.');
    return;
  }

  const endpoint = getProfileEmbeddingSyncEndpoint();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    PROFILE_EMBEDDING_SYNC_TIMEOUT_MS
  );

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: userId,
        user_id: userId,
        username,
        full_name: fullName,
        avatar_url: avatarUrl,
        bio: bio ?? '',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(
        `OAuth profile embedding sync failed with HTTP ${response.status}: ${errorText || response.statusText}`
      );
      return;
    }

    console.log('OAuth profile embedding sync triggered successfully.');
  } catch (error) {
    console.error('OAuth profile embedding sync request failed:', error);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!hasSupabaseServerEnv()) {
    return NextResponse.redirect(new URL('/auth/login', requestUrl));
  }

  if (!code) {
    const missingCodeUrl = new URL('/auth/login', requestUrl);
    missingCodeUrl.searchParams.set('error', 'missing_oauth_code');
    return NextResponse.redirect(missingCodeUrl);
  }

  let redirectUrl: URL;

  try {
    const supabase = await createSupabaseServerClient();
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: authData, error: exchangeError } = await withOAuthCallbackTimeout(
      supabase.auth.exchangeCodeForSession(code),
      'session exchange'
    );

    if (exchangeError) {
      throw exchangeError;
    }

    const user = authData.session?.user;

    if (!user?.id) {
      throw new Error('OAuth callback did not return an authenticated user.');
    }

    const fullName = getFullName(user);
    const avatarUrl = getAvatarUrl(user);
    const generatedUsername = generateUsername(user);

    const { data: existingProfile, error: existingProfileError } =
      await withOAuthCallbackTimeout(
        supabaseAdmin.from('profiles').select('username').eq('id', user.id).maybeSingle(),
        'profile lookup'
      );

    if (existingProfileError) {
      console.error('OAuth callback profile lookup failed:', existingProfileError);
      throw existingProfileError;
    }

    let finalUsername =
      typeof existingProfile?.username === 'string' && existingProfile.username.trim()
        ? normalizeUsername(existingProfile.username)
        : generatedUsername;

    if (!existingProfile?.username) {
      const { data: conflictingProfile, error: usernameLookupError } =
        await withOAuthCallbackTimeout(
          supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('username', finalUsername)
            .neq('id', user.id)
            .limit(1)
            .maybeSingle(),
          'username lookup'
        );

      if (usernameLookupError) {
        throw usernameLookupError;
      }

      if (conflictingProfile) {
        finalUsername = appendUsernameSuffix(finalUsername, user.id);
      }
    }

    const saveOAuthProfile = () =>
      supabaseAdmin.from('profiles').upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          avatar_url: avatarUrl,
          username: finalUsername,
        },
        { onConflict: 'id' }
      );
    let { error: profileUpsertError } = await withOAuthCallbackTimeout(
      saveOAuthProfile(),
      'profile upsert'
    );

    if (profileUpsertError?.code === '23505' && !existingProfile?.username) {
      finalUsername = appendUsernameSuffix(generatedUsername, user.id);
      ({ error: profileUpsertError } = await withOAuthCallbackTimeout(
        saveOAuthProfile(),
        'profile upsert retry'
      ));
    }

    if (profileUpsertError) {
      console.error('OAuth callback profile upsert failed:', profileUpsertError);
      throw profileUpsertError;
    }

    const onboardingWasCompleted =
      user.user_metadata?.is_new_user === false ||
      (typeof user.user_metadata?.onboarding_initialized_at === 'string' &&
        user.user_metadata.onboarding_initialized_at.trim().length > 0);
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
    const isNewUser =
      !onboardingWasCompleted &&
      (user.user_metadata?.is_new_user === true || accountAgeMs < 15 * 60 * 1000);

    const { error: metadataUpdateError } = await withOAuthCallbackTimeout(
      supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          is_new_user: isNewUser,
          username: finalUsername,
        },
      }),
      'user metadata update'
    );

    if (metadataUpdateError) {
      console.warn('OAuth profile saved, but username metadata could not be synchronized:', metadataUpdateError);
    }

    after(() =>
      triggerProfileEmbeddingSync({
        accessToken: authData.session?.access_token,
        avatarUrl,
        bio: null,
        fullName,
        userId: user.id,
        username: finalUsername,
      })
    );

    redirectUrl = new URL(`/profile/${encodeURIComponent(finalUsername)}`, requestUrl);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : 'oauth_callback_failed';

    redirectUrl = new URL('/auth/login', requestUrl);
    redirectUrl.searchParams.set('error', message);
  }

  return NextResponse.redirect(redirectUrl);
}
