import { NextRequest, NextResponse } from 'next/server';

import {
  deleteGitHubConnection,
  getGitHubConnectionToken,
  GitHubConnectionStorageError,
} from '@/lib/github-connection';
import { GITHUB_ERROR_CODES, type GitHubErrorCode } from '@/lib/github-error-codes';
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

type GitHubApiFailure = {
  error: string;
  status: number;
  code: GitHubErrorCode;
};

function getGitHubApiFailure(githubResponse: Response, fallback: string): GitHubApiFailure {
  const requestId = githubResponse.headers.get('x-github-request-id');

  if (githubResponse.status === 401) {
    console.warn('GitHub repository blob token was rejected.', {
      code: GITHUB_ERROR_CODES.TOKEN_INVALID,
      status: githubResponse.status,
      requestId,
    });
    return {
      error: 'Your GitHub connection is no longer valid. Reconnect GitHub and try again.',
      status: 401,
      code: GITHUB_ERROR_CODES.TOKEN_INVALID,
    };
  }

  if (githubResponse.status === 403) {
    console.warn('GitHub repository blob access was denied.', {
      code: GITHUB_ERROR_CODES.ACCESS_FORBIDDEN,
      status: githubResponse.status,
      requestId,
    });
    return {
      error: 'GitHub denied access to this repository file. Check permissions and try again.',
      status: 403,
      code: GITHUB_ERROR_CODES.ACCESS_FORBIDDEN,
    };
  }

  if (githubResponse.status === 429) {
    console.warn('GitHub repository blob rate limit reached.', {
      code: GITHUB_ERROR_CODES.RATE_LIMITED,
      status: githubResponse.status,
      requestId,
    });
    return {
      error: 'GitHub rate limit reached. Please try again shortly.',
      status: 429,
      code: GITHUB_ERROR_CODES.RATE_LIMITED,
    };
  }

  console.warn('GitHub repository blob request failed.', {
    code: GITHUB_ERROR_CODES.UPSTREAM_UNAVAILABLE,
    status: githubResponse.status,
    requestId,
  });
  return { error: fallback, status: 502, code: GITHUB_ERROR_CODES.UPSTREAM_UNAVAILABLE };
}

async function removeInvalidGitHubConnection(userId: string) {
  try {
    await deleteGitHubConnection(userId);
  } catch (error) {
    console.error('Unable to remove an invalid GitHub connection:', error);
  }
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
      return response(
        {
          error: 'Your GitHub connection is missing. Reconnect GitHub and try again.',
          code: GITHUB_ERROR_CODES.AUTH_REQUIRED,
        },
        401
      );
    }

    const encodedRepository = repository.split('/').map(encodeURIComponent).join('/');
    let githubResponse: Response;
    try {
      githubResponse = await fetch(
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
    } catch (error) {
      console.error('Unable to reach GitHub for repository blob:', error);
      return response(
        { error: 'Unable to reach GitHub. Please try again.', code: GITHUB_ERROR_CODES.UPSTREAM_UNAVAILABLE },
        502
      );
    }
    if (!githubResponse.ok) {
      const failure = getGitHubApiFailure(githubResponse, 'GitHub could not load this repository file.');
      if (failure.code === GITHUB_ERROR_CODES.TOKEN_INVALID) {
        await removeInvalidGitHubConnection(user.id);
      }
      return response(failure, failure.status);
    }

    const blob = (await githubResponse.json()) as { content?: unknown; encoding?: unknown };
    if (typeof blob.content !== 'string' || typeof blob.encoding !== 'string') {
      return response(
        { error: 'GitHub returned an invalid repository file.', code: GITHUB_ERROR_CODES.RESPONSE_INVALID },
        502
      );
    }

    return response({ content: blob.content, encoding: blob.encoding });
  } catch (error) {
    console.error('Unable to load GitHub repository file:', error);
    if (error instanceof GitHubConnectionStorageError) {
      const code = error.code === GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
        ? GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
        : GITHUB_ERROR_CODES.CONNECTION_STORAGE_UNAVAILABLE;
      return response(
        {
          error: code === GITHUB_ERROR_CODES.CONNECTION_UNREADABLE
            ? 'Your stored GitHub connection needs to be reconnected.'
            : 'GitHub connection storage is unavailable.',
          code,
        },
        code === GITHUB_ERROR_CODES.CONNECTION_UNREADABLE ? 401 : 502
      );
    }
    return response(
      { error: 'Unable to load GitHub repository file.', code: GITHUB_ERROR_CODES.UPSTREAM_UNAVAILABLE },
      502
    );
  }
}
