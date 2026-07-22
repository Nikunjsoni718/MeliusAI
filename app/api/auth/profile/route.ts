import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendUsernameSuffix, generateUsername, normalizeUsername as normalizeGeneratedUsername } from '@/lib/username';
import type { UserRole } from '@/types/supabase';

export const runtime = 'nodejs';

const PROFILE_SELECT = 'id, username, full_name, birth_date, bio, avatar_url, updated_at, email, created_at';

type ProfileBootstrapPayload = {
  display_name?: unknown;
  full_name?: unknown;
  is_new_user?: unknown;
  onboarding_initialized_at?: unknown;
  role?: unknown;
  role_selected_at?: unknown;
  username?: unknown;
};

type ProfileRecord = {
  id: string;
  username: string | null;
  full_name: string | null;
  birth_date?: string | null;
  bio?: string | null;
  avatar_url: string | null;
  updated_at?: string | null;
  email?: string | null;
  created_at?: string | null;
};

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function getMetadataText(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown): UserRole {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (role === 'recruiter' || role === 'corporate' || role === 'organization' || role === 'organisation') {
    return 'recruiter';
  }

  return 'talent';
}

function normalizeUsername(value: unknown) {
  const rawValue = normalizeText(value);
  const normalized = rawValue ? normalizeGeneratedUsername(rawValue) : null;

  return normalized && normalized.length >= 3 ? normalized.slice(0, 24) : null;
}

function getDisplayName(user: User, payload: ProfileBootstrapPayload) {
  return (
    normalizeText(payload.full_name) ??
    normalizeText(payload.display_name) ??
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

async function getProfileUsername(user: User, payload: ProfileBootstrapPayload, existingUsername?: string | null) {
  const savedUsername = normalizeUsername(existingUsername);

  if (savedUsername) {
    return savedUsername;
  }

  const baseUsername =
    normalizeUsername(payload.username) ??
    normalizeUsername(getMetadataText(user, 'username')) ??
    normalizeUsername(getMetadataText(user, 'preferred_username')) ??
    generateUsername({
      ...user,
      user_metadata: {
        ...user.user_metadata,
        display_name: getDisplayName(user, payload),
      },
    });
  const admin = createSupabaseAdminClient();
  const { data: matchingProfile, error } = await admin
    .from('profiles')
    .select('id')
    .eq('username', baseUsername)
    .neq('id', user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Username availability check failed: ${error.message}`);
  }

  return matchingProfile ? appendUsernameSuffix(baseUsername, user.id) : baseUsername;
}

async function readAuthenticatedUser(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (user) {
    return { user, error: null };
  }

  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!bearerToken) {
    return { user: null, error };
  }

  const admin = createSupabaseAdminClient();
  const {
    data: { user: bearerUser },
    error: bearerError,
  } = await admin.auth.getUser(bearerToken);

  return { user: bearerUser ?? null, error: bearerError ?? error };
}

async function readProfile(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Profile lookup failed: ${error.message}`);
  }

  return (profile as ProfileRecord | null) ?? null;
}

function toViewerProfile(user: User, profile: ProfileRecord) {
  const role = normalizeRole(user.user_metadata?.role);
  const displayName =
    profile.full_name ??
    getMetadataText(user, 'display_name') ??
    getMetadataText(user, 'full_name') ??
    user.email?.split('@')[0] ??
    '';

  return {
    id: user.id,
    role,
    role_selected_at: getMetadataText(user, 'role_selected_at'),
    display_name: displayName,
    username: profile.username ?? getMetadataText(user, 'username'),
    birth_date: profile.birth_date ?? getMetadataText(user, 'birth_date'),
    headline: null,
    company_name: null,
    github_username: null,
    avatar_url: profile.avatar_url ?? getMetadataText(user, 'avatar_url'),
  };
}

async function upsertProfile(user: User, payload: ProfileBootstrapPayload) {
  const admin = createSupabaseAdminClient();
  const existingProfile = await readProfile(user.id);
  const fullName = getDisplayName(user, payload);
  let username = await getProfileUsername(user, payload, existingProfile?.username);
  const avatarUrl = getAvatarUrl(user);

  const saveProfile = () =>
    admin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          avatar_url: avatarUrl,
          username,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select(PROFILE_SELECT)
      .single();
  let { data: profile, error } = await saveProfile();

  if (error?.code === '23505' && !existingProfile?.username) {
    username = appendUsernameSuffix(username, user.id);
    ({ data: profile, error } = await saveProfile());
  }

  if (error) {
    throw new Error(`App profile upsert failed: ${error.message}`);
  }

  if (getMetadataText(user, 'username') !== username) {
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        username,
      },
    });

    if (metadataError) {
      console.warn('Profile saved, but auth username metadata could not be synchronized:', metadataError);
    }
  }

  return profile as ProfileRecord;
}

function profileResponse(user: User, profile: ProfileRecord) {
  const profileData = toViewerProfile(user, profile);

  return NextResponse.json(
    {
      data: profileData,
      email: user.email ?? null,
      id: profileData.id,
      profile,
      role: profileData.role,
      status: 'success',
      success: true,
    },
    { status: 200 }
  );
}

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await readAuthenticatedUser(request);

    if (error && !user) {
      return jsonError(error.message, 401);
    }

    if (!user) {
      return jsonError('Unauthorized', 401);
    }

    const profile = (await readProfile(user.id)) ?? (await upsertProfile(user, {}));

    return profileResponse(user, profile);
  } catch (error) {
    console.error('Profile route failed:', error);

    return jsonError(error instanceof Error ? error.message : 'Unable to load profile.', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as ProfileBootstrapPayload;
    const { user, error } = await readAuthenticatedUser(request);

    if (error && !user) {
      return jsonError(error.message, 401);
    }

    if (!user) {
      return jsonError('You must be signed in before MeliusAI can create your profile.', 401);
    }

    const profile = await upsertProfile(user, payload);

    return profileResponse(user, profile);
  } catch (error) {
    console.error('Profile bootstrap failed:', error);

    return jsonError(
      error instanceof Error ? error.message : 'Auth succeeded, but profile creation failed. Please try again.',
      500
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as ProfileBootstrapPayload;
    const { user, error } = await readAuthenticatedUser(request);

    if (error && !user) {
      return jsonError(error.message, 401);
    }

    if (!user) {
      return jsonError('Unauthorized profile update request.', 401);
    }

    const admin = createSupabaseAdminClient();
    const role = normalizeRole(payload.role ?? user.user_metadata?.role);
    const roleSelectedAt =
      normalizeText(payload.role_selected_at) ??
      getMetadataText(user, 'role_selected_at') ??
      new Date().toISOString();
    const nextUserMetadata: Record<string, unknown> = {
      ...user.user_metadata,
      role,
      role_selected_at: roleSelectedAt,
    };

    if (payload.is_new_user === false) {
      nextUserMetadata.is_new_user = false;
    }

    const onboardingInitializedAt = normalizeText(payload.onboarding_initialized_at);
    if (onboardingInitializedAt) {
      nextUserMetadata.onboarding_initialized_at = onboardingInitializedAt;
    }
    const { data: metadataUpdateData, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: nextUserMetadata,
    });

    if (updateError) {
      throw new Error(`Role update failed: ${updateError.message}`);
    }

    const verifiedUser = metadataUpdateData.user ?? ({ ...user, user_metadata: nextUserMetadata } as User);
    const profile = (await readProfile(verifiedUser.id)) ?? (await upsertProfile(verifiedUser, payload));

    return profileResponse(verifiedUser, profile);
  } catch (error) {
    console.error('Profile role update failed:', error);

    return jsonError(error instanceof Error ? error.message : 'Unable to update profile.', 500);
  }
}
