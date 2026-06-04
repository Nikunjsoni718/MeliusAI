import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

const scoreSelect = 'id, project_id, scored_by, source, score, summary, improvement_tips, created_at, updated_at';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('scores')
      .select(scoreSelect)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to list scores', error);
    return NextResponse.json({ error: 'Unable to list scores.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as {
      project_id?: string;
      score?: number;
      source?: 'gemini' | 'manual';
      summary?: string | null;
      improvement_tips?: string[];
    };

    if (!body.project_id || typeof body.score !== 'number') {
      return NextResponse.json({ error: 'project_id and score are required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('scores')
      .insert({
        project_id: body.project_id,
        scored_by: sessionData.user.id,
        source: body.source ?? 'manual',
        score: body.score,
        summary: body.summary ?? null,
        improvement_tips: body.improvement_tips ?? [],
      })
      .select(scoreSelect)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Failed to create score', error);
    return NextResponse.json({ error: 'Unable to create score.' }, { status: 500 });
  }
}
