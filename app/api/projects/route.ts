import { NextRequest, NextResponse } from 'next/server';

import { inferPortfolioSourceKind } from '@/lib/mentor';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PortfolioSourceKind, ProjectStatus } from '@/types/supabase';

const projectSelect =
  'id, owner_id, is_public, title, description, file_url, folder_id, file_type, profession, target_company, auto_apply_enabled, summary, stack, status, created_at, updated_at';
const projectCardSelect =
  'id, user_id, owner_id, is_public, folder_id, name, title, file_name, file_url, file_type, file_size, score, evaluation_score, logic_score, has_been_audited, previous_score, status, created_at, updated_at';

function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === 'draft' || value === 'submitted' || value === 'reviewed' || value === 'archived';
}

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
      .from('projects')
      .select(projectCardSelect)
      .is('folder_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to list projects', error);
    return NextResponse.json({ error: 'Unable to list projects.' }, { status: 500 });
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
      title?: string;
      description?: string | null;
      file_url?: string;
      is_public?: boolean;
      file_type?: PortfolioSourceKind;
      profession?: string;
      target_company?: string | null;
      auto_apply_enabled?: boolean;
      summary?: string | null;
      stack?: string[];
      status?: ProjectStatus;
    };

    if (!body.title || !body.file_url) {
      return NextResponse.json({ error: 'title and file_url are required.' }, { status: 400 });
    }

    if (typeof body.status !== 'undefined' && !isProjectStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid project status.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: sessionData.user.id,
        owner_id: sessionData.user.id,
        is_public: body.is_public ?? true,
        title: body.title,
        name: body.title,
        description: body.description?.trim() || null,
        file_url: body.file_url,
        file_type: body.file_type ?? inferPortfolioSourceKind(body.file_url),
        profession: body.profession ?? 'Developer',
        target_company: body.target_company ?? null,
        auto_apply_enabled: body.auto_apply_enabled ?? false,
        summary: body.summary ?? null,
        stack: body.stack ?? [],
        status: body.status ?? 'draft',
      })
      .select(projectSelect)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Failed to create project', error);
    return NextResponse.json({ error: 'Unable to create project.' }, { status: 500 });
  }
}
