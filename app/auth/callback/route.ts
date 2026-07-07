import type { User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export const runtime = 'nodejs';

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

function toUsername(value: string) {
  const username = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return username || 'member';
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (!hasSupabaseServerEnv()) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_oauth_code`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: authData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      throw exchangeError;
    }

    const user = authData.session?.user;

    if (!user?.id) {
      throw new Error('OAuth callback did not return an authenticated user.');
    }

    const fullName = getFullName(user);
    const avatarUrl = getAvatarUrl(user);
    const emailPrefix = user.email?.split('@')[0] ?? 'member';
    const generatedUsername = toUsername(fullName || emailPrefix);

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfileError) {
      console.error('OAuth callback profile lookup failed:', existingProfileError);
      throw existingProfileError;
    }

    const finalUsername =
      typeof existingProfile?.username === 'string' && existingProfile.username.trim()
        ? existingProfile.username.trim()
        : generatedUsername;

    const { error: profileUpsertError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        avatar_url: avatarUrl,
        username: finalUsername,
      },
      { onConflict: 'id' }
    );

    if (profileUpsertError) {
      console.error('OAuth callback profile upsert failed:', profileUpsertError);
      throw profileUpsertError;
    }

    return NextResponse.redirect(`${origin}/profile/${encodeURIComponent(finalUsername)}`);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : 'oauth_callback_failed';

    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(message)}`);
  }
}
