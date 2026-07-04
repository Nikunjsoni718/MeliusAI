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

function getDocumentDataUrlContentType(assetName: string, responseContentType: string) {
  const normalizedResponseType = responseContentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const normalizedAssetName = assetName.toLowerCase();

  if (normalizedResponseType) {
    return normalizedResponseType;
  }

  if (normalizedAssetName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (normalizedAssetName.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }

  return 'application/octet-stream';
}

function shouldForwardAsDataUrl(assetName: string, responseContentType: string) {
  const normalizedResponseType = responseContentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const normalizedAssetName = assetName.toLowerCase();

  return (
    normalizedAssetName.endsWith('.pdf') ||
    normalizedAssetName.endsWith('.pptx') ||
    normalizedResponseType === 'application/pdf' ||
    normalizedResponseType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
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

    let contentForVerification = assetTextContent;

    if (!contentForVerification && !fileUrl) {
      return NextResponse.json(
        { error: 'fileUrl is required.' },
        { status: 400 }
      );
    }

    if (!contentForVerification) {
      const assetResponse = await fetch(fileUrl);

      if (!assetResponse.ok) {
        return NextResponse.json(
          { error: 'Unable to download the uploaded asset for verification.' },
          { status: assetResponse.status }
        );
      }

      const responseContentType = assetResponse.headers.get('content-type') ?? '';
      const assetBuffer = Buffer.from(await assetResponse.arrayBuffer());

      if (shouldForwardAsDataUrl(assetName, responseContentType)) {
        const dataUrlContentType = getDocumentDataUrlContentType(assetName, responseContentType);
        contentForVerification = `data:${dataUrlContentType};base64,${assetBuffer.toString('base64')}`;
      } else {
        contentForVerification = assetBuffer.toString('utf8');
      }
    }

    const pythonResponse = await fetch(`${backendUrl}/api/verify-asset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        projectId,
        assetName,
        code: contentForVerification,
        assetTextContent: contentForVerification,
        userContextDescription,
      }),
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
