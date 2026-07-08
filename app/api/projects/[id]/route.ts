import { NextRequest, NextResponse } from 'next/server';

import { inferPortfolioSourceKind } from '@/lib/mentor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PortfolioSourceKind, ProjectRow, ProjectStatus } from '@/types/supabase';

const projectSelect =
  'id, owner_id, is_public, title, description, file_url, folder_id, source_kind, profession, target_company, auto_apply_enabled, summary, stack, status, created_at, updated_at';
const vaultBucketName = 'vault';

type DeletableProjectRow = ProjectRow & {
  preview_url?: string | null;
  storage_path?: string | null;
  file_path?: string | null;
  object_path?: string | null;
};

function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === 'draft' || value === 'submitted' || value === 'reviewed' || value === 'archived';
}

function createOptionalAdminClient() {
  try {
    return createSupabaseAdminClient();
  } catch (error) {
    console.warn('Project delete is using the user-scoped Supabase client.', error);
    return null;
  }
}

function getProjectOwnerIds(project: DeletableProjectRow) {
  return [project.user_id, project.owner_id].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
}

function extractVaultStoragePath(value: unknown, userId: string) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (
    !trimmedValue ||
    trimmedValue.startsWith('blob:') ||
    trimmedValue.startsWith('data:') ||
    trimmedValue.startsWith('meliusai://')
  ) {
    return null;
  }

  let candidatePath: string | null = null;

  try {
    const url = new URL(trimmedValue);
    const pathSegments = url.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    const bucketIndex = pathSegments.findIndex((segment) => segment === vaultBucketName);

    if (bucketIndex >= 0) {
      candidatePath = pathSegments.slice(bucketIndex + 1).join('/');
    }
  } catch {
    candidatePath = trimmedValue;
  }

  const normalizedPath = candidatePath?.replace(/^\/+/, '') ?? '';

  if (!normalizedPath || !normalizedPath.startsWith(`${userId}/`)) {
    return null;
  }

  return normalizedPath;
}

function getProjectVaultStoragePaths(project: DeletableProjectRow, userId: string) {
  const storagePathCandidates = [
    project.storage_path,
    project.file_path,
    project.object_path,
    project.file_url,
    project.preview_url,
  ];

  return Array.from(
    new Set(
      storagePathCandidates
        .map((candidate) => extractVaultStoragePath(candidate, userId))
        .filter((path): path is string => Boolean(path))
    )
  );
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
      file_url: string;
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
        file_url: body.file_url,
        is_public: body.is_public,
        source_kind: body.source_kind ?? (body.file_url ? inferPortfolioSourceKind(body.file_url) : undefined),
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
    const adminSupabase = createOptionalAdminClient();
    const privilegedSupabase = adminSupabase ?? supabase;
    const { data: sessionData, error: sessionError } = await supabase.auth.getUser();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: projectData, error: projectError } = await privilegedSupabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (projectError) {
      throw projectError;
    }

    const project = projectData as DeletableProjectRow | null;

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const ownerIds = getProjectOwnerIds(project);

    if (!ownerIds.includes(sessionData.user.id)) {
      return NextResponse.json({ error: 'Forbidden: you can only delete your own assets.' }, { status: 403 });
    }

    const storagePaths = getProjectVaultStoragePaths(project, sessionData.user.id);

    if (storagePaths.length > 0) {
      const { error: storageDeleteError } = await privilegedSupabase.storage
        .from(vaultBucketName)
        .remove(storagePaths);

      if (storageDeleteError) {
        console.error('Failed to delete project storage objects', {
          projectId: id,
          storagePaths,
          error: storageDeleteError,
        });
        throw new Error(storageDeleteError.message || 'Unable to delete the stored asset file.');
      }
    }

    const { data: deletedProjects, error: deleteError } = await privilegedSupabase
      .from('projects')
      .delete()
      .eq('id', id)
      .select('id');

    if (deleteError) {
      console.error('Failed to delete primary project row', {
        projectId: id,
        error: deleteError,
      });
      throw deleteError;
    }

    if (!deletedProjects || deletedProjects.length === 0) {
      return NextResponse.json(
        { error: 'Project delete was blocked or the asset was already removed.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      deletedProjectId: id,
      deletedStoragePaths: storagePaths,
    });
  } catch (error) {
    console.error('Failed to delete project', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete project.' },
      { status: 500 }
    );
  }
}
