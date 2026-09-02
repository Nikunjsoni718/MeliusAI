import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_PROVIDER_TOKEN_HEADER = 'x-github-provider-token';
const GITHUB_PAGE_SIZE = 100;
const MAX_GITHUB_REPOSITORY_PAGES = 100;
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
  owner: {
    login: string;
  };
};

class RouteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

function isGitHubRepository(value: unknown): value is GitHubRepository {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const repository = value as Partial<GitHubRepository>;
  return (
    typeof repository.id === 'number' &&
    Number.isFinite(repository.id) &&
    typeof repository.name === 'string' &&
    typeof repository.full_name === 'string' &&
    (typeof repository.description === 'string' || repository.description === null) &&
    typeof repository.default_branch === 'string' &&
    typeof repository.html_url === 'string' &&
    (typeof repository.language === 'string' || repository.language === null) &&
    typeof repository.stargazers_count === 'number' &&
    Number.isFinite(repository.stargazers_count) &&
    typeof repository.updated_at === 'string' &&
    typeof repository.private === 'boolean' &&
    Boolean(repository.owner && typeof repository.owner.login === 'string')
  );
}

function getGitHubFailure(response: Response, message: string) {
  if (response.status === 401 || response.status === 403) {
    return new RouteError('Your GitHub connection has expired. Reconnect GitHub and try again.', 403);
  }

  if (response.status === 429) {
    return new RouteError('GitHub rate limit reached. Please try again shortly.', 429);
  }

  return new RouteError(message, 502);
}

async function fetchLiveGitHubRepositories(providerToken: string) {
  const repositories: GitHubRepository[] = [];

  for (let page = 1; page <= MAX_GITHUB_REPOSITORY_PAGES; page += 1) {
    const url = new URL('/user/repos', GITHUB_API_BASE_URL);
    url.searchParams.set('affiliation', 'owner');
    url.searchParams.set('visibility', 'public');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', String(GITHUB_PAGE_SIZE));
    url.searchParams.set('page', String(page));

    let response: Response;
    try {
      response = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${providerToken}`,
          'X-GitHub-Api-Version': '2026-03-10',
        },
      });
    } catch {
      throw new RouteError('Unable to reach GitHub. Please try again.', 502);
    }

    if (!response.ok) {
      throw getGitHubFailure(response, 'GitHub could not load your repositories.');
    }

    let pageRepositories: unknown;
    try {
      pageRepositories = await response.json();
    } catch {
      throw new RouteError('GitHub returned an invalid repository response.', 502);
    }

    if (!Array.isArray(pageRepositories) || !pageRepositories.every(isGitHubRepository)) {
      throw new RouteError('GitHub returned an invalid repository response.', 502);
    }

    repositories.push(...pageRepositories);

    if (pageRepositories.length < GITHUB_PAGE_SIZE) {
      return repositories;
    }
  }

  throw new RouteError('GitHub returned too many repository pages to synchronize safely.', 502);
}

async function removeMissingPendingImports(userId: string, repositories: GitHubRepository[]) {
  const admin = createSupabaseAdminClient();
  const { data: pendingImports, error: pendingImportsError } = await admin
    .from('pending_imports')
    .select('id, provider_repository_id')
    .eq('user_id', userId)
    .eq('provider', 'github');

  if (pendingImportsError) {
    throw new RouteError('Unable to synchronize deleted GitHub repositories.', 502);
  }

  const liveRepositoryIds = new Set(repositories.map((repository) => String(repository.id)));
  const stalePendingImportIds = (pendingImports ?? [])
    .filter((pendingImport) => !liveRepositoryIds.has(pendingImport.provider_repository_id))
    .map((pendingImport) => pendingImport.id);

  if (stalePendingImportIds.length === 0) {
    return 0;
  }

  const { error: deleteError } = await admin
    .from('pending_imports')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'github')
    .in('id', stalePendingImportIds);

  if (deleteError) {
    throw new RouteError('Unable to synchronize deleted GitHub repositories.', 502);
  }

  return stalePendingImportIds.length;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonError('Unauthorized', 401);
    }

    const providerToken = request.headers.get(GITHUB_PROVIDER_TOKEN_HEADER)?.trim();
    if (!providerToken) {
      return jsonError('GitHub connection token is missing. Reconnect GitHub and try again.', 400);
    }

    const repositories = await fetchLiveGitHubRepositories(providerToken);
    const removed = await removeMissingPendingImports(user.id, repositories);

    return NextResponse.json(
      { repositories, sync: { removed } },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return jsonError(error.message, error.status);
    }

    console.error('Unable to synchronize GitHub repositories:', error);
    return jsonError('Unable to synchronize GitHub repositories.', 502);
  }
}
