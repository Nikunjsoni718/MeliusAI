import { NextRequest, NextResponse } from 'next/server';

import { analyzeVaultProject } from '@/lib/mentor';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProjectRow } from '@/types/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
      description?: string;
    } | null;

    if (!body?.projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError) {
      throw projectError;
    }

    const project = projectData as ProjectRow;
    const { data: profileData } = await supabase
      .from('profiles')
      .select('bio')
      .eq('id', user.id)
      .maybeSingle();
    const profile = profileData as { bio?: string | null } | null;
    const fileName = project.name ?? project.file_name ?? project.title ?? 'Project';
    const fileType = project.file_type ?? fileName.split('.').pop() ?? 'file';
    const fileUrl = project.file_url ?? project.source_url ?? null;
    const description =
      typeof body.description === 'string' ? body.description.trim() : project.description?.trim() || '';

    const analysis = await analyzeVaultProject({
      fileName,
      fileType,
      fileUrl,
      description,
      aboutText: profile?.bio ?? '',
    });

    const { data: updatedProject, error: updateError } = await supabase
      .from('projects')
      .update({
        logic_score: analysis.logicScore,
        ai_summary: JSON.stringify(analysis.audit),
        description: description || null,
      })
      .eq('id', body.projectId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Project AI Save Error:', updateError);
      throw updateError;
    }

    return NextResponse.json({
      data: updatedProject,
      analysis,
    });
  } catch (error) {
    console.error('Failed to analyze project', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to analyze project.' },
      { status: 500 }
    );
  }
}
