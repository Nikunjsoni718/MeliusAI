import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.warn('OAuth callback could not load generated profile username:', profileError.message);
    }

    const targetPath = profile?.username ? `/profile/${profile.username}` : `/profile/${user.id}`;

    return NextResponse.redirect(`${origin}${targetPath}`);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const fallbackUrl = new URL('/auth/login', origin);
    fallbackUrl.searchParams.set('error', 'oauth_callback_failed');

    return NextResponse.redirect(fallbackUrl);
  }
}
