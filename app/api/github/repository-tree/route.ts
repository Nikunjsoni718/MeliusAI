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
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

function githubHeaders(token: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2026-03-10',
  };
}

export async function GET(request: NextRequest) {
  try {
    const repository = request.nextUrl.searchParams.get('repository')?.trim() ?? '';
    const ref = request.nextUrl.searchParams.get('ref')?.trim() ?? '';
    if (!REPOSITORY_PATTERN.test(repository) || !ref || ref.length > 256) {
      return response({ error: 'A valid repository and branch are required.' }, 400);
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
    const commitResponse = await fetch(
      `${GITHUB_API_BASE_URL}/repos/${encodedRepository}/commits/${encodeURIComponent(ref)}`,
      { cache: 'no-store', headers: githubHeaders(token) }
    );
    if (commitResponse.status === 401 || commitResponse.status === 403) {
      await deleteGitHubConnection(user.id);
      return response({ error: 'Your GitHub connection has expired. Reconnect GitHub and try again.' }, 401);
    }
    if (!commitResponse.ok) {
      return response({ error: 'GitHub could not load this repository branch.' }, 502);
    }

    const commit = (await commitResponse.json()) as { sha?: unknown; commit?: { tree?: { sha?: unknown } } };
    const commitSha = typeof commit.sha === 'string' ? commit.sha : '';
    const treeSha = typeof commit.commit?.tree?.sha === 'string' ? commit.commit.tree.sha : '';
    if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(commitSha) || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(treeSha)) {
      return response({ error: 'GitHub returned an invalid repository commit.' }, 502);
    }

    const treeUrl = new URL(`/repos/${encodedRepository}/git/trees/${encodeURIComponent(treeSha)}`, GITHUB_API_BASE_URL);
    treeUrl.searchParams.set('recursive', '1');
    const treeResponse = await fetch(treeUrl, { cache: 'no-store', headers: githubHeaders(token) });
    if (treeResponse.status === 401 || treeResponse.status === 403) {
      await deleteGitHubConnection(user.id);
      return response({ error: 'Your GitHub connection has expired. Reconnect GitHub and try again.' }, 401);
    }
    if (!treeResponse.ok) {
      return response({ error: 'GitHub could not load this repository tree.' }, 502);
    }

    const tree = (await treeResponse.json()) as { tree?: unknown; truncated?: unknown };
    return response({
      commitSha,
      tree: Array.isArray(tree.tree) ? tree.tree : [],
      truncated: Boolean(tree.truncated),
    });
  } catch (error) {
    console.error('Unable to load GitHub repository tree:', error);
    return response(
      {
        error:
          error instanceof GitHubConnectionStorageError
            ? 'GitHub connection storage is unavailable.'
            : 'Unable to load GitHub repository files.',
      },
      502
    );
  }
}
