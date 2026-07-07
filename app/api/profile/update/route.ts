import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type ProfileUpdateBody = {
  avatar_url?: unknown;
  bio?: unknown;
  birth_date?: unknown;
  current_status?: unknown;
  full_name?: unknown;
  skills?: unknown;
  username?: unknown;
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function normalizeUsername(value: unknown) {
  const username = normalizeText(value);

  return username
    ?.replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSkills(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((skill) => String(skill).trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ProfileUpdateBody;
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const username = normalizeUsername(body.username);
    const bio = normalizeText(body.bio);
    const fullName = normalizeText(body.full_name);
    const avatarUrl = normalizeText(body.avatar_url);
    const birthDate = normalizeText(body.birth_date);
    const currentStatus = normalizeText(body.current_status);
    const skills = normalizeSkills(body.skills);

    if (username !== undefined) {
      updatePayload.username = username || null;
    }

    if (bio !== undefined) {
      updatePayload.bio = bio;
    }

    if (fullName !== undefined) {
      updatePayload.full_name = fullName || null;
    }

    if (avatarUrl !== undefined) {
      updatePayload.avatar_url = avatarUrl || null;
    }

    if (birthDate !== undefined) {
      updatePayload.birth_date = birthDate || null;
    }

    if (currentStatus !== undefined) {
      updatePayload.current_status = currentStatus || null;
    }

    if (skills !== undefined) {
      updatePayload.skills = skills;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', session.user.id)
      .select('id, username, full_name, bio, skills, avatar_url, birth_date, current_status, updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!profile?.id) {
      return NextResponse.json({ error: 'Profile update did not return an updated profile row.' }, { status: 400 });
    }

    return NextResponse.json(
      {
        profile,
        status: 'success',
        success: true,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error('Profile update route failed:', e);

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
