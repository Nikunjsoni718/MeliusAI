import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProfileRow, UserRole } from '@/types/supabase';

export const runtime = 'nodejs';

const PROFILE_SELECT =
  'id, email, full_name, username, birth_date, bio, skills, avatar_url, age, current_status, created_at, updated_at';

type ProfileBootstrapPayload = {
  birth_date?: unknown;
  company_name?: unknown;
  display_name?: unknown;
  full_name?: unknown;
  role?: unknown;
  role_selected_at?: unknown;
  username?: unknown;
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
  const normalized = normalizeText(value)?.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '') ?? null;
  return normalized && normalized.length >= 3 ? normalized.slice(0, 24) : null;
}

function normalizeBirthDate(value: unknown) {
  const birthDate = normalizeText(value);

  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return null;
  }

  const parsedDate = new Date(`${birthDate}T00:00:00.000Z`);

  return Number.isNaN(parsedDate.getTime()) ? null : birthDate;
}

function normalizeTimestamp(value: unknown) {
  const timestamp = normalizeText(value);

  if (!timestamp) {
    return null;
  }

  const parsedDate = new Date(timestamp);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function getDisplayName(user: User, payload: ProfileBootstrapPayload) {
  return (
    normalizeText(payload.full_name) ??
    normalizeText(payload.display_name) ??
    getMetadataText(user, 'display_name') ??
    getMetadataText(user, 'full_name') ??
    getMetadataText(user, 'name') ??
    getMetadataText(user, 'company_name') ??
    user.email?.split('@')[0] ??
    'Member'
  );
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

function toViewerProfile(user: User, profile: ProfileRow, appUser: Record<string, unknown> | null) {
  const role = normalizeRole(appUser?.role ?? user.user_metadata?.role);
  const displayName =
    normalizeText(appUser?.display_name) ??
    profile.full_name ??
    getMetadataText(user, 'display_name') ??
    getMetadataText(user, 'full_name') ??
    user.email?.split('@')[0] ??
    '';

  return {
    id: user.id,
    role,
    role_selected_at: normalizeText(appUser?.role_selected_at),
    display_name: displayName,
    username: profile.username ?? normalizeText(appUser?.username) ?? getMetadataText(user, 'username'),
    birth_date: profile.birth_date ?? normalizeText(appUser?.birth_date) ?? getMetadataText(user, 'birth_date'),
    headline: normalizeText(appUser?.headline),
    company_name: normalizeText(appUser?.company_name) ?? getMetadataText(user, 'company_name'),
    github_username: normalizeText(appUser?.github_username) ?? getMetadataText(user, 'github_username'),
    avatar_url: profile.avatar_url ?? normalizeText(appUser?.avatar_url) ?? getMetadataText(user, 'avatar_url'),
  };
}

async function readVerifiedProfile(user: User) {
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Profile lookup failed: ${profileError.message}`);
  }

  if (!profile) {
    return { appUser: user.user_metadata as Record<string, unknown>, profile: null };
  }

  return { appUser: user.user_metadata as Record<string, unknown>, profile: profile as ProfileRow };
}

async function upsertAndVerifyProfile(user: User, payload: ProfileBootstrapPayload) {
  const admin = createSupabaseAdminClient();
  const existingProfile = await readVerifiedProfile(user);

  if (existingProfile.profile) {
    return existingProfile;
  }

  const role = normalizeRole(payload.role ?? user.user_metadata?.role);
  const displayName = getDisplayName(user, payload);
  const username = normalizeUsername(payload.username) ?? normalizeUsername(user.user_metadata?.username);
  const birthDate = normalizeBirthDate(payload.birth_date) ?? normalizeBirthDate(user.user_metadata?.birth_date);
  const roleSelectedAt = normalizeTimestamp(payload.role_selected_at ?? user.user_metadata?.role_selected_at);
  const avatarUrl =
    getMetadataText(user, 'avatar_url') ??
    getMetadataText(user, 'picture') ??
    null;
  const companyName = normalizeText(payload.company_name) ?? getMetadataText(user, 'company_name');
  const now = new Date().toISOString();

  const nextUserMetadata = {
    ...user.user_metadata,
    role,
    role_selected_at: roleSelectedAt,
    display_name: displayName,
    full_name: displayName,
    username,
    birth_date: birthDate,
    avatar_url: avatarUrl,
    company_name: companyName,
  };

  const { data: metadataUpdateData, error: metadataUpdateError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextUserMetadata,
  });

  if (metadataUpdateError) {
    throw new Error(`Auth metadata update failed: ${metadataUpdateError.message}`);
  }

  const { error: userUpsertError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      role,
      role_selected_at: roleSelectedAt,
      display_name: displayName,
      username,
      birth_date: birthDate,
      avatar_url: avatarUrl,
      company_name: companyName,
      updated_at: now,
    },
    { onConflict: 'id' }
  );

  if (userUpsertError) {
    throw new Error(`App user upsert failed: ${userUpsertError.message}`);
  }

  const { error: profileUpsertError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: displayName,
      username,
      birth_date: birthDate,
      avatar_url: avatarUrl,
      updated_at: now,
    },
    { onConflict: 'id' }
  );

  if (profileUpsertError) {
    throw new Error(`App profile upsert failed: ${profileUpsertError.message}`);
  }

  const verifiedUser = metadataUpdateData.user ?? ({ ...user, user_metadata: nextUserMetadata } as User);
  const { appUser, profile } = await readVerifiedProfile(verifiedUser);

  if (!profile) {
    throw new Error('App profile verification failed: no row returned from public.profiles.');
  }

  return { appUser, profile };
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await readAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        {
          email: null,
          id: null,
          role: 'user',
        },
        { status: 200 }
      );
    }

    const { appUser, profile } = await readVerifiedProfile(user);

    if (!profile) {
      const bootstrapped = await upsertAndVerifyProfile(user, {});
      const bootstrappedProfileData = toViewerProfile(user, bootstrapped.profile, bootstrapped.appUser);

      return NextResponse.json(
        {
          data: bootstrappedProfileData,
          email: user.email ?? null,
          id: bootstrappedProfileData.id,
          profile: bootstrapped.profile,
          role: bootstrappedProfileData.role,
          success: true,
        },
        { status: 200 }
      );
    }

    const profileData = toViewerProfile(user, profile, appUser);

    return NextResponse.json(
      {
        data: profileData,
        email: user.email ?? null,
        id: profileData.id,
        role: profileData.role,
      },
      { status: 200 }
    );
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

    const { appUser, profile } = await upsertAndVerifyProfile(user, payload);
    const profileData = toViewerProfile(user, profile, appUser);

    return NextResponse.json(
      {
        data: profileData,
        profile,
        success: true,
      },
      { status: 200 }
    );
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
    const roleSelectedAt = normalizeTimestamp(payload.role_selected_at) ?? new Date().toISOString();

    const nextUserMetadata = {
      ...user.user_metadata,
      role,
      role_selected_at: roleSelectedAt,
    };

    const { data: metadataUpdateData, error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: nextUserMetadata,
    });

    if (updateError) {
      throw new Error(`Role update failed: ${updateError.message}`);
    }

    const verifiedUser = metadataUpdateData.user ?? ({ ...user, user_metadata: nextUserMetadata } as User);
    const { appUser, profile } = await readVerifiedProfile(verifiedUser);

    if (!profile) {
      return jsonError(
        'Role was updated, but the MeliusAI profiles row is missing. Please retry profile setup.',
        409,
        { userId: user.id }
      );
    }

    const profileData = toViewerProfile(user, profile, appUser);

    return NextResponse.json(
      {
        data: profileData,
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Profile role update failed:', error);

    return jsonError(error instanceof Error ? error.message : 'Unable to update profile.', 500);
  }
}
