import { NextRequest, NextResponse } from 'next/server';

import { inferPortfolioSourceKind } from '@/lib/mentor';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PortfolioSourceKind, ProjectStatus } from '@/types/supabase';

const projectSelect =
  'id, owner_id, is_public, title, description, source_url, source_kind, profession, target_company, auto_apply_enabled, summary, stack, status, created_at, updated_at';

function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === 'draft' || value === 'submitted' || value === 'reviewed' || value === 'archived';
}

export async function GET(_: NextRequest, context: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await Promise.resolve(context.params);
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
      .select(projectSelect)
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to read project', error);
    return NextResponse.json({ error: 'Unable to load project.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Partial<{
      title: string;
      description: string | null;
      source_url: string;
      is_public: boolean;
      source_kind: PortfolioSourceKind;
      profession: string;
      target_company: string | null;
      auto_apply_enabled: boolean;
      summary: string | null;
      stack: string[];
      status: ProjectStatus;
    }>;

    if (typeof body.status !== 'undefined' && !isProjectStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid project status.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('projects')
      .update({
        title: body.title,
        description: typeof body.description === 'string' ? body.description.trim() || null : body.description,
        source_url: body.source_url,
        is_public: body.is_public,
        source_kind: body.source_kind ?? (body.source_url ? inferPortfolioSourceKind(body.source_url) : undefined),
        profession: body.profession,
        target_company: body.target_company,
        auto_apply_enabled: body.auto_apply_enabled,
        summary: body.summary,
        stack: body.stack,
        status: body.status,
      })
      .eq('id', id)
      .select(projectSelect)
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Failed to update project', error);
    return NextResponse.json({ error: 'Unable to update project.' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, context: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', sessionData.user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete project', error);
    return NextResponse.json({ error: 'Unable to delete project.' }, { status: 500 });
  }
}
