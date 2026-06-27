import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const auditReportSchema = z.object({
  calculatedScore: z.number().min(0).max(100),
  executiveSummary: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  strategicRecommendations: z.array(z.string()),
});

type AuditReport = z.infer<typeof auditReportSchema>;

type VerifyAssetPayload = {
  projectId?: unknown;
  assetName?: unknown;
  assetTextContent?: unknown;
  codeContent?: unknown;
  userContextDescription?: unknown;
};

type VerificationInput = {
  projectId: string;
  assetName: string;
  assetTextContent: string;
  codeContent: string;
  userContextDescription: string;
};

type ProjectRecord = Record<string, unknown>;

const MAX_CODE_CONTENT_BYTES = 5 * 1024 * 1024;
const STORAGE_BUCKET_NAME = 'vault';
const FORCED_UTF8_CODE_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx']);
const CODE_TEXT_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'html',
  'java',
  'js',
  'jsx',
  'json',
  'kt',
  'md',
  'mjs',
  'php',
  'py',
  'rb',
  'rs',
  'sh',
  'sql',
  'swift',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getProjectString(project: ProjectRecord | null | undefined, key: string) {
  return getString(project?.[key]);
}

function getAssetNameFromProject(project: ProjectRecord | null | undefined, fallback: string) {
  return (
    getProjectString(project, 'name') ||
    getProjectString(project, 'file_name') ||
    getProjectString(project, 'title') ||
    fallback ||
    'Project Asset'
  );
}

function getProjectFileUrl(project: ProjectRecord | null | undefined) {
  return getProjectString(project, 'file_url') || getProjectString(project, 'source_url');
}

function getProjectFilePath(project: ProjectRecord | null | undefined) {
  return (
    getProjectString(project, 'file_path') ||
    getProjectString(project, 'storage_path') ||
    getProjectString(project, 'path')
  );
}

function getExtensionFromNameOrUrl(value: string) {
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? value;
  const cleanValue = (() => {
    try {
      return new URL(withoutQuery).pathname;
    } catch {
      return withoutQuery;
    }
  })();
  return cleanValue.split('/').pop()?.split('.').pop()?.trim().toLowerCase() ?? '';
}

function shouldForceUtf8CodeRead(...values: string[]) {
  return values.some((value) => FORCED_UTF8_CODE_EXTENSIONS.has(getExtensionFromNameOrUrl(value)));
}

function decodeUtf8Text(buffer: ArrayBuffer) {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer).trim();
}

function isTextLikeContent(filename: string, contentType: string) {
  const normalizedType = contentType.toLowerCase();
  const extension = getExtensionFromNameOrUrl(filename);

  return (
    CODE_TEXT_EXTENSIONS.has(extension) ||
    normalizedType.startsWith('text/') ||
    normalizedType.includes('javascript') ||
    normalizedType.includes('json') ||
    normalizedType.includes('typescript') ||
    normalizedType.includes('xml') ||
    normalizedType.includes('yaml')
  );
}

async function readUploadedCodeContent(file: File) {
  if (file.size > MAX_CODE_CONTENT_BYTES) {
    throw new Error('Raw code content must be 5 MB or smaller.');
  }

  return decodeUtf8Text(await file.arrayBuffer());
}

function getStoragePathFromUrl(fileUrl: string, bucketName: string) {
  if (!fileUrl) {
    return '';
  }

  try {
    const url = new URL(fileUrl);
    const storageMarkers = [
      `/storage/v1/object/public/${bucketName}/`,
      `/storage/v1/object/sign/${bucketName}/`,
      `/storage/v1/object/authenticated/${bucketName}/`,
    ];
    const marker = storageMarkers.find((candidate) => url.pathname.includes(candidate));

    if (!marker) {
      return '';
    }

    const markerIndex = url.pathname.indexOf(marker);
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return '';
  }
}

async function downloadStoredCodeContent({
  assetName,
  filePath,
  fileUrl,
  supabase,
}: {
  assetName: string;
  filePath: string;
  fileUrl: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  const storagePath = filePath || getStoragePathFromUrl(fileUrl, STORAGE_BUCKET_NAME);

  if (!storagePath) {
    return '';
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET_NAME).download(storagePath);

  if (error || !data) {
    throw new Error('Failed to download file from storage');
  }

  const contentType = data.type ?? '';
  const forceUtf8CodeRead = shouldForceUtf8CodeRead(assetName, storagePath, fileUrl);
  if (
    !forceUtf8CodeRead &&
    !isTextLikeContent(assetName, contentType) &&
    !isTextLikeContent(storagePath, contentType)
  ) {
    return '';
  }

  if (data.size > MAX_CODE_CONTENT_BYTES) {
    throw new Error('Raw code content must be 5 MB or smaller.');
  }

  return decodeUtf8Text(await data.arrayBuffer());
}

async function readVerificationInput(req: Request): Promise<VerificationInput> {
  const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file');
    const formAssetName = getString(formData.get('assetName'));
    const uploadedFile = file instanceof File ? file : null;

    return {
      projectId: getString(formData.get('projectId')),
      assetName: uploadedFile?.name?.trim() || formAssetName || 'Project Asset',
      assetTextContent: getString(formData.get('assetTextContent')),
      codeContent: uploadedFile ? await readUploadedCodeContent(uploadedFile) : getString(formData.get('codeContent')),
      userContextDescription: getString(formData.get('userContextDescription')),
    };
  }

  const body = (await req.json()) as VerifyAssetPayload;

  return {
    projectId: getString(body.projectId),
    assetName: getString(body.assetName) || 'Project Asset',
    assetTextContent: getString(body.assetTextContent),
    codeContent: getString(body.codeContent),
    userContextDescription: getString(body.userContextDescription),
  };
}

function buildReportMarkdown(assetName: string, report: AuditReport) {
  const pros = report.pros.map((item) => `- ${item}`).join('\n');
  const cons = report.cons.map((item) => `- ${item}`).join('\n');
  const recommendations = report.strategicRecommendations.map((item) => `- ${item}`).join('\n');

  return `## Executive Summary
${report.executiveSummary}

## Pros
${pros || '- No explicit strengths were identified from the submitted content.'}

## Cons
${cons || '- No explicit risks were identified from the submitted content.'}

## Strategic Recommendations
${recommendations || '- Keep expanding the project context and validation evidence.'}

## Scorecard
Asset: ${assetName || 'Project Asset'}

MeliusAI Verification Score: **${report.calculatedScore}/100**`;
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const input = await readVerificationInput(req);
    const projectId = input.projectId;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required.' },
        { status: 400 }
      );
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (projectError) {
      throw new Error(`Supabase project lookup failed: ${projectError.message}`);
    }

    if (!projectData) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = projectData as ProjectRecord;
    const assetName = getAssetNameFromProject(project, input.assetName);
    const fileUrl = getProjectFileUrl(project);
    const filePath = getProjectFilePath(project);
    const storedCodeContent = input.codeContent
      ? ''
      : await downloadStoredCodeContent({
          assetName,
          filePath,
          fileUrl,
          supabase,
        });
    const rawCodeContent = input.codeContent || storedCodeContent;
    const codeContent = rawCodeContent || input.assetTextContent;
    const userContextDescription = input.userContextDescription;
    const textAssetExpected = isTextLikeContent(assetName, '') || isTextLikeContent(fileUrl, '');

    if (textAssetExpected && !rawCodeContent) {
      return NextResponse.json(
        { error: `Unable to read raw code content for ${assetName}.` },
        { status: 400 }
      );
    }

    if (!codeContent) {
      return NextResponse.json(
        { error: 'Unable to verify this asset because no readable file content was provided.' },
        { status: 400 }
      );
    }

    const rawCodeInstruction = `Here is the raw code content for ${assetName}. Analyze this specific code.`;
    const supplementalContext =
      input.assetTextContent && input.assetTextContent !== codeContent
        ? `\n\nSupplemental asset context:\n${input.assetTextContent.slice(0, 8000)}`
        : '';

    const { object: auditReport } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: auditReportSchema,
      system:
        `You are MeliusAI, a production-grade multimodal asset verification engine. ${rawCodeInstruction} Thoroughly audit the submitted asset text against the user-provided intent and context. Calculate an objective score out of 100 based on correctness, completeness, technical clarity, implementation quality, and alignment with the stated criteria. Return only structured data that satisfies the schema. The executiveSummary must be clean Markdown text detailing performance. The pros, cons, and strategicRecommendations arrays must contain specific, actionable observations.`,
      prompt: `Filename:
${assetName}

User context / audit criteria:
${userContextDescription || 'No explicit user criteria were provided. Infer reasonable verification criteria from the asset content.'}

${rawCodeInstruction}

codeContent:
\`\`\`
${codeContent.slice(0, 24000)}
\`\`\`${supplementalContext}`,
    });

    const reportText = buildReportMarkdown(assetName, auditReport);
    const updatePayload = {
      score: auditReport.calculatedScore,
      audit_summary: auditReport.executiveSummary,
      pros: auditReport.pros,
      cons: auditReport.cons,
      recommendations: auditReport.strategicRecommendations,
      user_description: userContextDescription,
      status: 'Verified',
      evaluation_score: auditReport.calculatedScore,
      logic_score: auditReport.calculatedScore,
      has_been_audited: true,
      ai_summary: reportText,
      description: reportText,
    };

    const { data: updatedProject, error: updateError } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError?.code === 'PGRST116') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (updateError) {
      throw new Error(`Supabase project audit persistence failed: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      report: auditReport,
      project: updatedProject,
      reportText,
      score: auditReport.calculatedScore,
    });
  } catch (error) {
    console.error('Serverless asset verification failed:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to verify asset.' },
      { status: 500 }
    );
  }
}
