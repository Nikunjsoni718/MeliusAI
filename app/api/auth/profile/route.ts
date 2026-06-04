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
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('Profile lookup fallback:', error.message);
    }

    return NextResponse.json(
      {
        email: user.email ?? null,
        id: profile?.id ?? user.id,
        role: 'user',
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
