import { NextRequest, NextResponse } from 'next/server';

import {
  deleteGitHubConnection,
  getGitHubConnectionToken,
  GitHubConnectionStorageError,
} from '@/lib/github-connection';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GITHUB_API_BASE_URL = 'https://api.github.com';
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i;
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const repository = request.nextUrl.searchParams.get('repository')?.trim() ?? '';
    const sha = request.nextUrl.searchParams.get('sha')?.trim() ?? '';
    if (!REPOSITORY_PATTERN.test(repository) || !SHA_PATTERN.test(sha)) {
      return response({ error: 'A valid repository file is required.' }, 400);
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return response({ error: 'Unauthorized' }, 401);
    }

    const token = await getGitHubConnectionToken(user.id);
    if (!token) {
      return response({ error: 'Your GitHub connection has expired. Reconnect GitHub and try again.' }, 401);
    }

    const encodedRepository = repository.split('/').map(encodeURIComponent).join('/');
    const githubResponse = await fetch(
      `${GITHUB_API_BASE_URL}/repos/${encodedRepository}/git/blobs/${encodeURIComponent(sha)}`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
      }
    );
    if (githubResponse.status === 401 || githubResponse.status === 403) {
      await deleteGitHubConnection(user.id);
      return response({ error: 'Your GitHub connection has expired. Reconnect GitHub and try again.' }, 401);
    }
    if (!githubResponse.ok) {
      return response({ error: 'GitHub could not load this repository file.' }, 502);
    }

    const blob = (await githubResponse.json()) as { content?: unknown; encoding?: unknown };
    if (typeof blob.content !== 'string' || typeof blob.encoding !== 'string') {
      return response({ error: 'GitHub returned an invalid repository file.' }, 502);
    }

    return response({ content: blob.content, encoding: blob.encoding });
  } catch (error) {
    console.error('Unable to load GitHub repository file:', error);
    return response(
      {
        error:
          error instanceof GitHubConnectionStorageError
            ? 'GitHub connection storage is unavailable.'
            : 'Unable to load GitHub repository file.',
      },
      502
    );
  }
}
