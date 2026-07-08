import { NextRequest, NextResponse } from 'next/server';

import { analyzeVaultProject } from '@/lib/mentor';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const scoreSelect = 'id, project_id, scored_by, source, score, summary, improvement_tips, created_at, updated_at';

function stringifyAssetContent(value: unknown): string {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyAssetContent(item)).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value).trim();
}

function getStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
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
  const traceId = globalThis.crypto?.randomUUID?.() ?? `trace_${Date.now()}`;
  let executionPhase = 'payload_extraction';

  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const metadata =
      body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const userId = getStringValue(body?.user_id, metadata.user_id, sessionData.user.id);
    const projectTitle = getStringValue(
      body?.project_title,
      body?.title,
      metadata.project_title,
      metadata.title,
      metadata.file_name
    );
    const rawAssetContent = stringifyAssetContent(
      body?.raw_asset_content ??
        body?.asset_content ??
        body?.content ??
        body?.description ??
        metadata.raw_asset_content ??
        metadata.asset_content ??
        metadata.content ??
        metadata.description
    );

    if (!userId || !projectTitle || !rawAssetContent) {
      return NextResponse.json(
        {
          error: 'user_id, project_title, and raw asset content are required.',
          trace_id: traceId,
        },
        { status: 400 }
      );
    }

    if (userId !== sessionData.user.id) {
      return NextResponse.json(
        {
          error: 'Forbidden: project ingestion user_id must match the authenticated user.',
          trace_id: traceId,
        },
        { status: 403 }
      );
    }

    executionPhase = 'profile_context_fetch';
    const { data: profileData } = await supabase.from('profiles').select('bio').eq('id', userId).maybeSingle();
    const profile = profileData as { bio?: string | null } | null;

    executionPhase = 'industrial_evaluation_suite';
    const fileName = getStringValue(body?.file_name, metadata.file_name, projectTitle);
    const fileType = getStringValue(body?.file_type, body?.mime_type, metadata.file_type, metadata.mime_type, 'asset');
    const fileUrl = getStringValue(body?.file_url, metadata.file_url) || null;
    const analysis = await analyzeVaultProject({
      fileName,
      fileType,
      fileUrl,
      description: rawAssetContent,
      aboutText: profile?.bio ?? '',
    });
    const computed_score = Number.parseFloat(String(analysis.logicScore));

    if (!Number.isFinite(computed_score)) {
      throw new Error('Industrial evaluation suite returned an invalid computed_score metric.');
    }

    executionPhase = 'atomic_project_insert';
    const createdAt = new Date().toISOString();
    const project_payload = {
      user_id: userId,
      owner_id: userId,
      title: projectTitle,
      name: projectTitle,
      description: rawAssetContent,
      score: computed_score,
      evaluation_score: computed_score,
      logic_score: computed_score,
      has_been_audited: true,
      ai_summary: JSON.stringify(analysis.audit),
      summary: analysis.audit.summary,
      file_url: fileUrl ?? `meliusai://dynamic-ingestion/${traceId}`,
      file_type: 'website',
      stack: Array.isArray(body?.stack) ? body.stack : Array.isArray(metadata.stack) ? metadata.stack : [],
      status: 'reviewed',
      created_at: createdAt,
      updated_at: createdAt,
    };

    const { data, error } = await supabase
      .from('projects')
      .insert(project_payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        data,
        analysis,
        computed_score,
        trace_id: traceId,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown project ingestion failure.';
    console.error('Project ingestion engine failed', {
      traceId,
      executionPhase,
      error,
    });

    return NextResponse.json(
      {
        error: 'Project ingestion engine failed.',
        trace_id: traceId,
        telemetry: {
          route: '/api/scores',
          phase: executionPhase,
          message,
          rollback: 'No partial project row was committed when the atomic insert failed.',
        },
      },
      { status: 500 }
    );
  }
}
