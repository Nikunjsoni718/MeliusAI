import { NextRequest, NextResponse } from 'next/server';

import {
  deleteGitHubConnection,
  getGitHubConnectionToken,
  GitHubConnectionStorageError,
  upsertGitHubConnection,
} from '@/lib/github-connection';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function response(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return error || !user ? null : user;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return response({ connected: false, error: 'Unauthorized' }, 401);
    }

    return response({ connected: Boolean(await getGitHubConnectionToken(user.id)) });
  } catch (error) {
    console.error('Unable to read GitHub connection status:', error);
    return response(
      {
        connected: false,
        error:
          error instanceof GitHubConnectionStorageError
            ? 'GitHub connection storage is unavailable.'
            : 'Unable to read GitHub connection status.',
      },
      502
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return response({ error: 'Unauthorized' }, 401);
    }

    const payload = (await request.json().catch(() => null)) as { providerToken?: unknown } | null;
    const providerToken =
      typeof payload?.providerToken === 'string' ? payload.providerToken.trim() : '';
    if (!providerToken) {
      return response({ error: 'GitHub provider token is required.' }, 400);
    }

    const hasGitHubIdentity =
      user.identities?.some((identity) => identity.provider === 'github') ||
      (Array.isArray(user.app_metadata?.providers) &&
        user.app_metadata.providers.some(
          (provider) => typeof provider === 'string' && provider.toLowerCase() === 'github'
        ));
    if (!hasGitHubIdentity) {
      return response({ error: 'A linked GitHub identity is required.' }, 409);
    }

    await upsertGitHubConnection(user.id, providerToken);
    return response({ connected: true });
  } catch (error) {
    console.error('Unable to save GitHub connection:', error);
    return response({ error: 'Unable to save GitHub connection.' }, 502);
  }
}

export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return response({ connected: false, error: 'Unauthorized' }, 401);
    }

    await deleteGitHubConnection(user.id);
    return response({ connected: false });
  } catch (error) {
    console.error('Unable to remove GitHub connection:', error);
    return response({ error: 'Unable to remove GitHub connection.' }, 502);
  }
}
