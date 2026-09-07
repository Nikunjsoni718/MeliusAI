import { NextResponse } from 'next/server';
import JSZip from 'jszip';

import { verifyMeliusAsset } from '@/lib/mentor';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TEXT_CHARS_FOR_AUDIT = 32000;

type VerifyAssetPayload = {
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

type AuditPayload = {
  ai_summary: string;
  score: number;
  score_delta: number;
  delta_summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  finding_impacts: {
    pros: Array<{ text: string; impactScore: number }>;
    cons: Array<{ text: string; impactScore: number }>;
    recommendations: Array<{ text: string; impactScore: number }>;
  };
};

type ParsedDataUrl = {
  buffer: Buffer;
  mediaType: string;
};

const notesExtensions = new Set(['.md', '.mdx', '.rst', '.txt']);
const frontendExtensions = new Set(['.css', '.html', '.htm', '.js', '.jsx', '.scss', '.svelte', '.ts', '.tsx', '.vue']);
const backendExtensions = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.go',
  '.ipynb',
  '.java',
  '.js',
  '.mjs',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.sql',
  '.ts',
]);
const codeExtensions = new Set([
  ...frontendExtensions,
  ...backendExtensions,
  '.h',
  '.hpp',
  '.kt',
  '.kts',
  '.lua',
  '.sh',
  '.swift',
]);
const textExtensions = new Set([...codeExtensions, ...notesExtensions, '.csv', '.json', '.xml']);

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getExtension(assetName: string) {
  const normalizedName = assetName.toLowerCase();
  const dotIndex = normalizedName.lastIndexOf('.');

  return dotIndex >= 0 ? normalizedName.slice(dotIndex) : '';
}

function getNormalizedContentType(contentType: string) {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

function isReadme(assetName: string) {
  const normalizedName = assetName.toLowerCase().split(/[\\/]/).pop() ?? '';

  return normalizedName === 'readme' || normalizedName.startsWith('readme.');
}

function isTextLikeContentType(contentType: string) {
  const normalizedType = getNormalizedContentType(contentType);

  return (
    normalizedType.startsWith('text/') ||
    normalizedType === 'application/json' ||
    normalizedType === 'application/x-ipynb+json' ||
    normalizedType === 'application/x-jupyter-notebook' ||
    normalizedType === 'application/javascript' ||
    normalizedType === 'application/typescript' ||
    normalizedType === 'application/xml' ||
    normalizedType === 'application/x-sh'
  );
}

function isTextLikeAsset(assetName: string, contentType: string) {
  return isTextLikeContentType(contentType) || textExtensions.has(getExtension(assetName));
}

function isJupyterNotebookAsset(assetName: string, contentType: string) {
  const normalizedType = getNormalizedContentType(contentType);

  return (
    getExtension(assetName) === '.ipynb' ||
    normalizedType === 'application/x-ipynb+json' ||
    normalizedType === 'application/x-jupyter-notebook'
  );
}

function extractJupyterNotebookCells(rawNotebookText: string) {
  try {
    const notebook = JSON.parse(rawNotebookText) as { cells?: unknown };
    const cells = notebook && typeof notebook === 'object' ? notebook.cells : null;

    if (!Array.isArray(cells)) {
      return '';
    }

    return cells
      .map((cell, index) => {
        if (!cell || typeof cell !== 'object') {
          return '';
        }

        const notebookCell = cell as { cell_type?: unknown; source?: unknown };
        const cellType = String(notebookCell.cell_type || 'unknown').trim().toUpperCase() || 'UNKNOWN';
        const source = notebookCell.source ?? '';
        const cellText = Array.isArray(source)
          ? source.map((line) => String(line)).join('')
          : String(source);

        return cellText.trim()
          ? `--- [${cellType} CELL ${index + 1}] ---\n${cellText.trim()}`
          : '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
  } catch (error) {
    console.warn('Unable to extract Jupyter Notebook cells for verification:', error);
    return '';
  }
}

function isPdfAsset(assetName: string, contentType: string) {
  return getExtension(assetName) === '.pdf' || getNormalizedContentType(contentType) === 'application/pdf';
}

function isPptxAsset(assetName: string, contentType: string) {
  return (
    getExtension(assetName) === '.pptx' ||
    getNormalizedContentType(contentType) ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

function isDocxAsset(assetName: string, contentType: string) {
  return (
    getExtension(assetName) === '.docx' ||
    getNormalizedContentType(contentType) ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

function getDocumentDataUrlContentType(assetName: string, responseContentType: string) {
  const normalizedResponseType = getNormalizedContentType(responseContentType);

  if (normalizedResponseType) {
    return normalizedResponseType;
  }

  if (assetName.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf';
  }

  return 'application/octet-stream';
}

function parseDataUrl(value: string): ParsedDataUrl | null {
  const match = value.match(/^data:([^;,]+)?((?:;[^,]*)?),(.*)$/is);

  if (!match) {
    return null;
  }

  const mediaType = (match[1] || 'application/octet-stream').toLowerCase();
  const metadata = (match[2] || '').toLowerCase();
  const rawData = match[3] || '';
  const isBase64 = metadata.includes(';base64');

  try {
    const buffer = isBase64
      ? Buffer.from(rawData.replace(/\s/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(rawData), 'utf8');

    return { buffer, mediaType };
  } catch {
    return null;
  }
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codePoint: string) => String.fromCharCode(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codePoint: string) => String.fromCharCode(parseInt(codePoint, 16)))
    .replace(/&amp;/g, '&');
}

function extractTextNodes(xml: string) {
  return [...xml.matchAll(/<(?:a:t|w:t|t)[^>]*>([\s\S]*?)<\/(?:a:t|w:t|t)>/gi)]
    .map((match) => decodeXmlEntities(match[1].replace(/<[^>]+>/g, '').trim()))
    .filter(Boolean)
    .join('\n');
}

async function extractOpenXmlText(buffer: Buffer, assetName: string) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const normalizedAssetName = assetName.toLowerCase();
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    if (normalizedAssetName.endsWith('.pptx') || slideFiles.length > 0) {
      const slideBlocks = await Promise.all(
        slideFiles.map(async (name, index) => {
          const xml = await zip.file(name)?.async('string');
          const text = xml ? extractTextNodes(xml) : '';

          return text ? `--- [PRESENTATION SLIDE ${index + 1}] ---\n${text}` : '';
        })
      );

      return slideBlocks.filter(Boolean).join('\n\n').trim();
    }

    const documentXml = await zip.file('word/document.xml')?.async('string');

    return documentXml ? extractTextNodes(documentXml).trim() : '';
  } catch (error) {
    console.warn('Unable to extract Office document text for verification:', error);
    return '';
  }
}

async function normalizeProvidedAssetContent(content: string, assetName: string) {
  const parsedDataUrl = parseDataUrl(content);

  if (isJupyterNotebookAsset(assetName, parsedDataUrl?.mediaType ?? '')) {
    const notebookText = parsedDataUrl ? parsedDataUrl.buffer.toString('utf8') : content;
    const extractedNotebookCells = extractJupyterNotebookCells(notebookText);

    if (!extractedNotebookCells) {
      throw new Error('Unable to extract code or markdown cells from the Jupyter Notebook.');
    }

    return extractedNotebookCells;
  }

  if (!parsedDataUrl) {
    return content;
  }

  if (isPptxAsset(assetName, parsedDataUrl.mediaType) || isDocxAsset(assetName, parsedDataUrl.mediaType)) {
    const extractedText = await extractOpenXmlText(parsedDataUrl.buffer, assetName);

    if (extractedText) {
      return extractedText;
    }
  }

  if (isTextLikeAsset(assetName, parsedDataUrl.mediaType)) {
    return parsedDataUrl.buffer.toString('utf8').trim();
  }

  return content;
}

async function loadAssetContent({
  assetName,
  assetTextContent,
  fileUrl,
}: {
  assetName: string;
  assetTextContent: string;
  fileUrl: string;
}) {
  if (assetTextContent) {
    return normalizeProvidedAssetContent(assetTextContent, assetName);
  }

  if (!fileUrl) {
    throw new Error('fileUrl is required.');
  }

  const assetResponse = await fetch(fileUrl);

  if (!assetResponse.ok) {
    throw new Error('Unable to download the uploaded asset for verification.');
  }

  const responseContentType = assetResponse.headers.get('content-type') ?? '';
  const assetBuffer = Buffer.from(await assetResponse.arrayBuffer());

  if (isJupyterNotebookAsset(assetName, responseContentType)) {
    const extractedNotebookCells = extractJupyterNotebookCells(assetBuffer.toString('utf8'));

    if (!extractedNotebookCells) {
      throw new Error('Unable to extract code or markdown cells from the Jupyter Notebook.');
    }

    return extractedNotebookCells;
  }

  if (isPptxAsset(assetName, responseContentType) || isDocxAsset(assetName, responseContentType)) {
    const extractedText = await extractOpenXmlText(assetBuffer, assetName);

    if (extractedText) {
      return extractedText;
    }
  }

  if (isTextLikeAsset(assetName, responseContentType)) {
    return assetBuffer.toString('utf8').trim();
  }

  if (isPdfAsset(assetName, responseContentType)) {
    const dataUrlContentType = getDocumentDataUrlContentType(assetName, responseContentType);

    return `data:${dataUrlContentType};base64,${assetBuffer.toString('base64')}`;
  }

  return assetBuffer.toString('utf8').trim();
}

function getSignalText(content: string) {
  const parsedDataUrl = parseDataUrl(content);

  if (parsedDataUrl && isTextLikeContentType(parsedDataUrl.mediaType)) {
    return parsedDataUrl.buffer.toString('utf8');
  }

  return parsedDataUrl ? '' : content;
}

function getContextLens(assetName: string) {
  const extension = getExtension(assetName);

  if (notesExtensions.has(extension) || isReadme(assetName)) {
    return 'Markdown/README/text lens: clarity, setup instructions, completeness, examples, and whether this proves coding ability.';
  }

  if (frontendExtensions.has(extension)) {
    return 'Frontend lens: semantic HTML, accessibility, responsiveness, React/state boundaries, UX completeness, maintainability.';
  }

  if (backendExtensions.has(extension)) {
    return 'Backend/script lens: correctness, complexity, validation, security, hardcoded secrets, injection risk, error handling.';
  }

  return 'General artifact lens: evaluate only the technical evidence present in this file.';
}

function truncateForAudit(content: string) {
  if (content.length <= MAX_TEXT_CHARS_FOR_AUDIT) {
    return {
      text: content,
      truncated: false,
    };
  }

  return {
    text: `${content.slice(0, MAX_TEXT_CHARS_FOR_AUDIT)}\n\n[TRUNCATED: only the first ${MAX_TEXT_CHARS_FOR_AUDIT} characters were provided. Penalize uncertainty.]`,
    truncated: true,
  };
}

async function persistAuditResult({
  audit,
  projectId,
  supabase,
  userId,
}: {
  audit: AuditPayload;
  projectId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}) {
  const { error } = await supabase
    .from('projects')
    .update({
      score: audit.score,
      evaluation_score: audit.score,
      logic_score: audit.score,
      score_delta: audit.score_delta,
      delta_summary: audit.delta_summary,
      audit_summary: audit.ai_summary,
      ai_summary: audit.ai_summary,
      description: audit.ai_summary,
      pros: audit.strengths,
      cons: audit.weaknesses,
      recommendations: audit.recommendations,
      audit_findings: audit.finding_impacts,
      user_description: audit.ai_summary,
      has_been_audited: true,
    })
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured.' },
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

    const body = (await request.json().catch(() => null)) as VerifyAssetPayload | null;

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

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

    if (!assetTextContent && !fileUrl) {
      return NextResponse.json(
        { error: 'fileUrl or assetTextContent is required.' },
        { status: 400 }
      );
    }

    const contentForVerification = await loadAssetContent({
      assetName,
      assetTextContent,
      fileUrl,
    });

    if (!contentForVerification.trim()) {
      return NextResponse.json(
        { error: 'Uploaded content cannot be empty.' },
        { status: 400 }
      );
    }

    const { data: existingProject, error: existingProjectError } = await supabase
      .from('projects')
      .select('score, evaluation_score, logic_score')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingProjectError) {
      throw existingProjectError;
    }
    if (!existingProject) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const { text: auditContent } = truncateForAudit(getSignalText(contentForVerification));
    const result = await verifyMeliusAsset({
      assetName,
      content: auditContent,
      scopeHint: getContextLens(assetName),
      userContextDescription,
      previousScore:
        typeof existingProject.score === 'number'
          ? existingProject.score
          : typeof existingProject.evaluation_score === 'number'
            ? existingProject.evaluation_score
            : typeof existingProject.logic_score === 'number'
              ? existingProject.logic_score
              : null,
    });
    const audit: AuditPayload = {
      ai_summary: result.aiSummary,
      score: result.score,
      score_delta: result.scoreDelta,
      delta_summary: result.deltaSummary,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      recommendations: result.recommendations,
      finding_impacts: result.findingImpacts,
    };

    await persistAuditResult({
      audit,
      projectId,
      supabase,
      userId: user.id,
    });

    return NextResponse.json(audit);
  } catch (error) {
    console.error('Verify asset audit failed:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to verify asset.' },
      { status: 500 }
    );
  }
}
