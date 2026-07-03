import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    const { data: profile, error } = await supabase
      .from('users')
      .select('id, role, role_selected_at, display_name, username, birth_date, headline, company_name, github_username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('Profile lookup fallback:', error.message);
    }

    const profileData = profile ?? {
      id: user.id,
      role: user.user_metadata?.role === 'recruiter' ? 'recruiter' : 'talent',
      role_selected_at: null,
      display_name:
        (user.user_metadata?.display_name as string | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split('@')[0] ??
        '',
      username: (user.user_metadata?.username as string | undefined) ?? null,
      birth_date: (user.user_metadata?.birth_date as string | undefined) ?? null,
      headline: (user.user_metadata?.headline as string | undefined) ?? null,
      company_name: (user.user_metadata?.company_name as string | undefined) ?? null,
      github_username: (user.user_metadata?.github_username as string | undefined) ?? null,
      avatar_url:
        (user.user_metadata?.avatar_url as string | undefined) ??
        (user.user_metadata?.picture as string | undefined) ??
        null,
    };

    return NextResponse.json(
      {
        data: profileData,
        email: user.email ?? null,
        id: profileData.id ?? user.id,
        role: profileData.role ?? 'talent',
      },
      { status: 200 }
    );
  } catch (error) {
    console.warn('Profile route fallback:', error instanceof Error ? error.message : error);

    return NextResponse.json(
      {
        email: null,
        id: null,
        role: 'user',
      },
      { status: 200 }
    );
  }
}
