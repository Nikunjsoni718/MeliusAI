import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient, hasSupabaseServerEnv } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CallbackProfile = {
  username: string | null;
};

function getMetadataText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toUsernameBase(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized && normalized.length >= 3 ? normalized.slice(0, 24) : 'member';
}

function createUsername(baseValue: string | null | undefined) {
  return `${toUsernameBase(baseValue).slice(0, 24)}_${randomBytes(2).toString('hex')}`;
}

function getDisplayName(metadata: Record<string, unknown> | undefined, email: string | null | undefined) {
  return (
    getMetadataText(metadata, 'full_name') ??
    getMetadataText(metadata, 'name') ??
    getMetadataText(metadata, 'display_name') ??
    email?.split('@')[0] ??
    'Member'
  );
}

function getAvatarUrl(metadata: Record<string, unknown> | undefined) {
  return getMetadataText(metadata, 'avatar_url') ?? getMetadataText(metadata, 'picture');
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (!hasSupabaseServerEnv()) {
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const supabaseAdmin = createSupabaseAdminClient();

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

    const { data: existingProfile, error: profileReadError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    if (profileReadError) {
      throw profileReadError;
    }

    let finalUsername = existingProfile?.username?.trim() || null;

    if (!finalUsername) {
      const metadata = user.user_metadata as Record<string, unknown> | undefined;
      const displayName = getDisplayName(metadata, user.email);
      const usernameSeed =
        getMetadataText(metadata, 'full_name') ??
        getMetadataText(metadata, 'name') ??
        user.email?.split('@')[0] ??
        'member';

      for (let attempt = 1; attempt <= 3 && !finalUsername; attempt += 1) {
        const generatedUsername = createUsername(usernameSeed);
        const { error: insertError } = await supabaseAdmin
          .from('profiles')
          .upsert(
            {
              id: user.id,
              email: user.email ?? null,
              full_name: displayName,
              username: generatedUsername,
              avatar_url: getAvatarUrl(metadata),
            },
            { onConflict: 'id' }
          );

        if (!insertError) {
          finalUsername = generatedUsername;
          break;
        }

        console.error('CRITICAL ERROR saving profile:', insertError);

        if (insertError.code !== '23505' || attempt === 3) {
          throw insertError;
        }
      }
    }

    if (!finalUsername) {
      throw new Error('OAuth callback could not resolve or create a profile username.');
    }

    return NextResponse.redirect(`${origin}/profile/${encodeURIComponent(finalUsername)}`);
  } catch (error) {
    console.error('OAuth callback failed:', error);
    const fallbackUrl = new URL('/auth/login', origin);
    fallbackUrl.searchParams.set('error', 'oauth_callback_failed');

    return NextResponse.redirect(fallbackUrl);
  }
}
