import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const CALLBACK_PROFILE_COLUMNS = 'id, username';

function getMetadataText(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeUsername(value: string | null | undefined) {
  const normalized = value?.replace(/^@+/, '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  return normalized && normalized.length >= 3 ? normalized.slice(0, 24) : null;
}

function getDisplayName(user: User) {
  return (
    getMetadataText(user, 'full_name') ??
    getMetadataText(user, 'name') ??
    getMetadataText(user, 'display_name') ??
    user.email?.split('@')[0] ??
    'Member'
  );
}

function getOAuthUsername(user: User) {
  return (
    normalizeUsername(getMetadataText(user, 'username')) ??
    normalizeUsername(getMetadataText(user, 'preferred_username')) ??
    `user_${user.id.replace(/-/g, '').slice(0, 12)}`
  );
}

async function readOrCreateProfile(user: User) {
  const admin = createSupabaseAdminClient();
  const { data: existingProfile, error: readError } = await admin
    .from('profiles')
    .select(CALLBACK_PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (existingProfile) {
    return existingProfile as { id: string; username: string | null };
  }

  const now = new Date().toISOString();
  const { data: createdProfile, error: createError } = await admin
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: getDisplayName(user),
        username: getOAuthUsername(user),
        avatar_url: getMetadataText(user, 'avatar_url') ?? getMetadataText(user, 'picture'),
        updated_at: now,
      },
      { onConflict: 'id' }
    )
    .select(CALLBACK_PROFILE_COLUMNS)
    .single();

  if (createError) {
    throw createError;
  }

  return createdProfile as { id: string; username: string | null };
}

function getProfileRedirectPath(profile: { id: string; username: string | null }) {
  return `/profile/${encodeURIComponent(profile.username?.trim() || profile.id)}`;
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

    if (userError || !user) {
      throw userError ?? new Error('OAuth callback did not return an authenticated user.');
    }

    const profile = await readOrCreateProfile(user);

    return NextResponse.redirect(new URL(getProfileRedirectPath(profile), origin));
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const fallbackUrl = new URL('/auth/login', origin);
    fallbackUrl.searchParams.set('error', 'oauth_callback_failed');

    return NextResponse.redirect(fallbackUrl);
  }
}
