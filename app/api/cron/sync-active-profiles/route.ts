import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_FASTAPI_SYNC_ENDPOINT = 'https://meliusai.onrender.com/api/admin/sync-embeddings';

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') ?? '';

  if (!cronSecret) {
    console.error('CRON_SECRET is not configured for sync-active-profiles.');
    return false;
  }

  return secureCompare(authHeader, `Bearer ${cronSecret}`);
}

function getFastApiSyncEndpoint() {
  const explicitEndpoint = process.env.FASTAPI_ADMIN_SYNC_ENDPOINT?.trim();

  if (explicitEndpoint) {
    return explicitEndpoint;
  }

  const backendBaseUrl = (
    process.env.PYTHON_BACKEND_URL ||
    process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL ||
    ''
  ).trim();

  if (backendBaseUrl) {
    return `${backendBaseUrl.replace(/\/$/, '')}/api/admin/sync-embeddings`;
  }

  return DEFAULT_FASTAPI_SYNC_ENDPOINT;
}

async function readBackendPayload(response: Response) {
  const rawText = await response.text().catch(() => '');

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized', success: false }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const backendToken =
    process.env.FASTAPI_ADMIN_SYNC_TOKEN ||
    process.env.PYTHON_BACKEND_ADMIN_TOKEN ||
    cronSecret;
  const endpoint = getFastApiSyncEndpoint();
  const startedAt = Date.now();

  try {
    const backendResponse = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${backendToken}`,
        'Content-Type': 'application/json',
        ...(cronSecret ? { 'X-Cron-Secret': cronSecret } : {}),
      },
      body: JSON.stringify({
        job: 'sync-active-profiles',
        schedule: request.headers.get('x-vercel-cron-schedule') ?? '0 0 * * *',
        source: 'vercel-cron',
      }),
    });
    const backendPayload = await readBackendPayload(backendResponse);

    if (!backendResponse.ok) {
      console.error('FastAPI active profile sync failed:', {
        endpoint,
        payload: backendPayload,
        status: backendResponse.status,
      });

      return NextResponse.json(
        {
          backendStatus: backendResponse.status,
          durationMs: Date.now() - startedAt,
          error: 'FastAPI embedding sync failed.',
          result: backendPayload,
          success: false,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        backendStatus: backendResponse.status,
        durationMs: Date.now() - startedAt,
        result: backendPayload,
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unable to trigger FastAPI active profile sync:', error);

    return NextResponse.json(
      {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unable to trigger FastAPI embedding sync.',
        success: false,
      },
      { status: 502 }
    );
  }
}
