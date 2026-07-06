import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CallbackProfile = {
  username: string | null;
};

function getMetadataUsername(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getProfileRedirectPath(profile: CallbackProfile | null, userId: string, metadataUsername?: string | null) {
  const profileUsername = profile?.username?.trim();
  const redirectHandle = profileUsername || metadataUsername?.trim() || userId;

  return `/profile/${encodeURIComponent(redirectHandle)}`;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (!hasSupabaseServerEnv()) {
    return NextResponse.redirect(new URL('/auth/login', origin));
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn('OAuth callback could not load generated profile username:', profileError.message);
    }

    const metadataUsername =
      getMetadataUsername(user.user_metadata?.username) ??
      getMetadataUsername(user.user_metadata?.preferred_username);

    return NextResponse.redirect(
      new URL(getProfileRedirectPath((profile as CallbackProfile | null) ?? null, user.id, metadataUsername), origin)
    );
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const fallbackUrl = new URL('/auth/login', origin);
    fallbackUrl.searchParams.set('error', 'oauth_callback_failed');

    return NextResponse.redirect(fallbackUrl);
  }
}
