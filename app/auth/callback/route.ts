import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const PROFILE_USERNAME_FETCH_ATTEMPTS = 3;
const PROFILE_USERNAME_FETCH_RETRY_MS = 500;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (!hasSupabaseServerEnv()) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  try {
    const supabase = await createSupabaseServerClient();

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        throw exchangeError;
      }
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      throw userError ?? new Error('OAuth callback did not return an authenticated user.');
    }

    let profileUsername: string | null = null;

    for (let attempt = 1; attempt <= PROFILE_USERNAME_FETCH_ATTEMPTS; attempt += 1) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.warn('OAuth callback could not load generated profile username:', profileError.message);
      }

      const username = typeof profile?.username === 'string' ? profile.username.trim() : '';
      if (username) {
        profileUsername = username;
        break;
      }

      if (attempt < PROFILE_USERNAME_FETCH_ATTEMPTS) {
        await wait(PROFILE_USERNAME_FETCH_RETRY_MS);
      }
    }

    const targetPath = profileUsername
      ? `/profile/${encodeURIComponent(profileUsername)}`
      : `/profile/${encodeURIComponent(user.id)}`;

    return NextResponse.redirect(`${origin}${targetPath}`);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const fallbackUrl = new URL('/auth/login', origin);
    fallbackUrl.searchParams.set('error', 'oauth_callback_failed');

    return NextResponse.redirect(fallbackUrl);
  }
}
