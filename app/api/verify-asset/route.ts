import { NextResponse } from 'next/server';
import JSZip from 'jszip';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OPENAI_VERIFY_MODEL = process.env.OPENAI_VERIFY_ASSET_MODEL?.trim() || 'gpt-4o';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TEXT_CHARS_FOR_AUDIT = 32000;

const VERIFY_ASSET_SYSTEM_PROMPT = `SYSTEM ROLE: You are an elite Y Combinator CTO, Senior Staff Engineer, and Technical Mentor. Your job is to audit user-uploaded code and return a highly intelligent, contextual, and deeply analytical JSON report.

RULE 1: CONTEXTUAL, FAIR GRADING
Grade the file strictly on its intended scope. Do not punish an HTML file for lacking CSS. Grade it purely on HTML semantics, DOM structure, and accessibility. 

RULE 2: HYPER-SPECIFICITY (THE ELITE BRAIN)
You are strictly forbidden from using generic phrases like "Good structure" or "Needs better accessibility." You MUST act like a senior engineer reviewing a PR. 
- You must reference EXACT concepts, tags, or patterns you see in the code.
- Instead of "Good HTML", write: "Excellent use of semantic <header> and <section> tags which creates a highly readable DOM tree."
- Instead of "Needs accessibility", write: "Missing \`aria-label\` attributes on the navigation links and lacks a \`main\` landmark."

RULE 3: THE EXECUTIVE SUMMARY
Write a supportive, highly detailed 4-5 sentence technical analysis. Start with **[Recruiter-Ready]** or **[Practice & Growth]**. Explain exactly why it received its score by referencing the specific architecture and logic of the uploaded file. 

RULE 4: STRICT JSON OUTPUT & LENGTH ENFORCEMENT
Return ONLY a raw JSON object. Use these exact keys. You MUST write at least 15-25 words for EVERY bullet point in the arrays to ensure maximum technical depth.
{
  "ai_summary": "Your elite 4-5 sentence paragraph.",
  "score": <Number out of 100>,
  "strengths": [
    "Highly detailed, specific strength referencing exact code concepts (min 15 words).",
    "Highly detailed, specific strength referencing exact code concepts (min 15 words)."
  ],
  "weaknesses": [
    "Deeply technical weakness explaining the exact flaw (min 15 words).",
    "Deeply technical weakness explaining the exact flaw (min 15 words)."
  ],
  "recommendations": [
    "Actionable, senior-level next step with exact implementation advice (min 15 words).",
    "Actionable, senior-level next step with exact implementation advice (min 15 words)."
  ]
}`;

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
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

type ParsedDataUrl = {
  buffer: Buffer;
  mediaType: string;
};

type ScoreBand = {
  label: 'CATEGORY A' | 'CATEGORY B' | 'CATEGORY C' | 'CATEGORY D' | 'CATEGORY E';
  maxScore: 20 | 30 | 55 | 75 | 100;
  reason: string;
};

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const configFilenames = new Set([
  '.env',
  '.env.example',
  '.env.local',
  '.eslintrc',
  '.gitignore',
  '.prettierrc',
  'components.json',
  'dockerfile',
  'eslint.config.js',
  'eslint.config.mjs',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'postcss.config.js',
  'postcss.config.mjs',
  'requirements.txt',
  'tailwind.config.js',
  'tailwind.config.ts',
  'tsconfig.json',
  'vite.config.js',
  'vite.config.ts',
  'yarn.lock',
]);

const configExtensions = new Set(['.config', '.ini', '.lock', '.toml', '.yaml', '.yml']);
const notesExtensions = new Set(['.md', '.mdx', '.rst', '.txt']);
const frontendExtensions = new Set(['.css', '.html', '.htm', '.js', '.jsx', '.scss', '.svelte', '.ts', '.tsx', '.vue']);
const backendExtensions = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.go',
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
    normalizedType === 'application/javascript' ||
    normalizedType === 'application/typescript' ||
    normalizedType === 'application/xml' ||
    normalizedType === 'application/x-sh'
  );
}

function isTextLikeAsset(assetName: string, contentType: string) {
  return isTextLikeContentType(contentType) || textExtensions.has(getExtension(assetName));
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

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function isExtremelySimpleScript(content: string) {
  const nonEmptyLineCount = content.split(/\r?\n/).filter((line) => line.trim()).length;
  const hasStructure = /\b(function|class|def|try|catch|except|validate|schema|interface|type)\b/i.test(content);

  return nonEmptyLineCount <= 15 && !hasStructure;
}

function looksLikeBasicHtml(content: string) {
  const htmlTagCount = countMatches(content.toLowerCase(), /<([a-z][a-z0-9-]*)\b/g);
  const hasAppSignals = /<script\b|useState\s*\(|fetch\s*\(|<nav\b|<main\b|<section\b|<article\b|@media\b/i.test(content);

  return /<!doctype\s+html|<html[\s>]|<form\b/i.test(content) && !hasAppSignals && htmlTagCount < 25;
}

function hasBeginnerSignals(content: string) {
  return /\b(tutorial|practice|exercise|hello world|calculator|todo app|follow along|lesson|beginner|learning)\b/i.test(content);
}

function hasIntermediateSignals(content: string) {
  return /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b|NextResponse|useState\s*\(|useEffect\s*\(|fetch\s*\(|createSupabase|class\s+\w+|async\s+function|SELECT\s+.+\s+FROM|INSERT\s+INTO/i.test(
    content
  );
}

function productionSignalCount(content: string) {
  const signals = [
    /auth|getUser|Authorization|JWT|session/i,
    /zod|schema|validate|sanitize|parse|safeParse/i,
    /try\s*{|catch\s*\(|throw new|raise\s+|except\s+/i,
    /rateLimit|csrf|xss|sql injection|escape|permission|RLS|policy/i,
    /cache|memo|index|pagination|batch|stream|timeout|AbortController|Promise\.all/i,
    /test\(|describe\(|expect\(|pytest|unittest|assert\s+/i,
    /transaction|rollback|idempotent|retry|queue/i,
  ];

  return signals.filter((pattern) => pattern.test(content)).length;
}

function inferScoreBand(assetName: string, content: string): ScoreBand {
  const normalizedName = assetName.toLowerCase().split(/[\\/]/).pop() || assetName.toLowerCase();
  const extension = getExtension(assetName);
  const signalText = getSignalText(content);
  const nonEmptyLineCount = signalText.split(/\r?\n/).filter((line) => line.trim()).length;
  const isDataUrlOnly = Boolean(parseDataUrl(content)) && !signalText.trim();

  if (
    configFilenames.has(normalizedName) ||
    configExtensions.has(extension) ||
    looksLikeBasicHtml(signalText) ||
    isExtremelySimpleScript(signalText)
  ) {
    return {
      label: 'CATEGORY A',
      maxScore: 20,
      reason: 'trivial, boilerplate, basic HTML, config/package, or extremely simple script',
    };
  }

  if (isReadme(assetName) || notesExtensions.has(extension) || isDataUrlOnly || (!codeExtensions.has(extension) && extension)) {
    return {
      label: 'CATEGORY B',
      maxScore: 30,
      reason: 'notes, theory, documentation, non-code, or low implementation evidence',
    };
  }

  if (signalText.length > 4000 && nonEmptyLineCount >= 100 && productionSignalCount(signalText) >= 5) {
    return {
      label: 'CATEGORY E',
      maxScore: 100,
      reason: 'substantial implementation with production-grade signals',
    };
  }

  if (hasIntermediateSignals(signalText) || nonEmptyLineCount >= 50 || productionSignalCount(signalText) >= 3) {
    return {
      label: 'CATEGORY D',
      maxScore: 75,
      reason: 'intermediate component, API route, stateful UI, or moderate algorithm/module',
    };
  }

  if (hasBeginnerSignals(signalText) || codeExtensions.has(extension)) {
    return {
      label: 'CATEGORY C',
      maxScore: 55,
      reason: 'beginner/practice code or single-file basic logic',
    };
  }

  return {
    label: 'CATEGORY B',
    maxScore: 30,
    reason: 'insufficient evidence of implementation depth',
  };
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

function buildUserPrompt({
  assetName,
  content,
  scoreBand,
  userContextDescription,
}: {
  assetName: string;
  content: string;
  scoreBand: ScoreBand;
  userContextDescription: string;
}) {
  const signalText = getSignalText(content);
  const { text: auditText, truncated } = truncateForAudit(signalText);

  return [
    'Uploaded Artifact Metadata:',
    `- Asset name: ${assetName}`,
    `- Context lens: ${getContextLens(assetName)}`,
    `- Server-side scope hint: ${scoreBand.label}`,
    `- Server-side scope reason: ${scoreBand.reason}`,
    `- Content truncated: ${truncated ? 'yes' : 'no'}`,
    `- User-provided project context: ${userContextDescription || 'No user-written project description was supplied.'}`,
    '',
    'Use the scope hint only as context. Grade the artifact by its intended scope, not by file size or line count.',
    'Return only the raw JSON object with ai_summary, score, strengths, weaknesses, and recommendations.',
    'Every strengths, weaknesses, and recommendations item must be specific to the uploaded code and at least 15-25 words long.',
    '',
    auditText
      ? `Uploaded Content To Audit:\n<<<ASSET_CONTENT_START\n${auditText}\nASSET_CONTENT_END>>>`
      : 'Uploaded Content To Audit:\nNo readable implementation content was extractable. Treat this as low evidence of programming skill.',
  ].join('\n');
}

function extractJsonObject(rawText: string) {
  const trimmedText = rawText
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(trimmedText) as Record<string, unknown>;
  } catch {
    const firstBrace = trimmedText.indexOf('{');
    const lastBrace = trimmedText.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmedText.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }

    throw new Error('AI audit response was not valid JSON.');
  }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeAiSummary(summary: unknown) {
  const rawSummary = String(summary || '').trim();
  const withoutMarkdownHeader = rawSummary.replace(/^\s*#{1,6}\s*.*$/gm, '').trim();

  if (!withoutMarkdownHeader) {
    throw new Error('AI audit response was missing ai_summary.');
  }

  return withoutMarkdownHeader;
}

function normalizeAuditPayload(parsed: Record<string, unknown>): AuditPayload {
  const rawScore = Number(parsed.score);
  const finiteScore = Number.isFinite(rawScore) ? rawScore : 0;
  const score = Math.max(0, Math.min(100, Math.round(finiteScore)));

  return {
    ai_summary: normalizeAiSummary(parsed.ai_summary ?? parsed.user_description ?? parsed.executiveSummary),
    score,
    strengths: normalizeStringArray(parsed.strengths ?? parsed.pros),
    weaknesses: normalizeStringArray(parsed.weaknesses ?? parsed.cons),
    recommendations: normalizeStringArray(parsed.recommendations),
  };
}

async function runOpenAIAudit({
  assetName,
  content,
  scoreBand,
  userContextDescription,
}: {
  assetName: string;
  content: string;
  scoreBand: ScoreBand;
  userContextDescription: string;
}) {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_VERIFY_MODEL,
      messages: [
        { role: 'system', content: VERIFY_ASSET_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildUserPrompt({
            assetName,
            content,
            scoreBand,
            userContextDescription,
          }),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2200,
      temperature: 0.05,
    }),
  });

  const responseJson = (await response.json().catch(() => ({}))) as OpenAIChatCompletionResponse;

  if (!response.ok) {
    throw new Error(responseJson.error?.message || 'OpenAI asset audit request failed.');
  }

  const rawContent = responseJson.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error('AI audit response was empty.');
  }

  return normalizeAuditPayload(extractJsonObject(rawContent));
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
      audit_summary: audit.ai_summary,
      ai_summary: audit.ai_summary,
      description: audit.ai_summary,
      pros: audit.strengths,
      cons: audit.weaknesses,
      recommendations: audit.recommendations,
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
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured.' },
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

    const scoreBand = inferScoreBand(assetName, contentForVerification);
    const audit = await runOpenAIAudit({
      assetName,
      content: contentForVerification,
      scoreBand,
      userContextDescription,
    });

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
