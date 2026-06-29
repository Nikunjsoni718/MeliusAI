import { NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type VerifyAssetProxyPayload = {
  fileUrl?: unknown;
  filename?: unknown;
  assetName?: unknown;
  assetTextContent?: unknown;
  userContextDescription?: unknown;
  projectId?: unknown;
  project_id?: unknown;
  fileId?: unknown;
  file_id?: unknown;
};

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL?.trim().replace(/\/$/, '');

    if (!backendUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_PYTHON_BACKEND_URL is not configured.' },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const body = (await request.json()) as VerifyAssetProxyPayload;
    const fileUrl = getString(body.fileUrl);
    const filename = getString(body.filename) || 'asset.txt';
    const assetName = getString(body.assetName) || filename;
    const assetTextContent = getString(body.assetTextContent);
    const userContextDescription = getString(body.userContextDescription);
    const projectId =
      getString(body.projectId) ||
      getString(body.project_id) ||
      getString(body.fileId) ||
      getString(body.file_id);

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required.' },
        { status: 400 }
      );
    }

    if (assetTextContent) {
      const pythonResponse = await fetch(`${backendUrl}/api/verify-asset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ projectId, assetName, assetTextContent, userContextDescription }),
      });

      const responseBody = await pythonResponse.text();

      return new Response(responseBody, {
        status: pythonResponse.status,
        headers: {
          'Content-Type': pythonResponse.headers.get('content-type') ?? 'application/json',
        },
      });
    }

    if (!fileUrl) {
      return NextResponse.json(
        { error: 'fileUrl is required.' },
        { status: 400 }
      );
    }

    const pythonResponse = await fetch(`${backendUrl}/api/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ fileUrl, filename, projectId }),
    });

    const responseBody = await pythonResponse.text();

    return new Response(responseBody, {
      status: pythonResponse.status,
      headers: {
        'Content-Type': pythonResponse.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    console.error('Verify asset proxy failed:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to verify asset.' },
      { status: 500 }
    );
  }
}
