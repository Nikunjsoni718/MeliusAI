import { generateObject, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { z } from 'zod/v4';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const OPENAI_VERIFY_MODEL = process.env.OPENAI_VERIFY_ASSET_MODEL?.trim() || 'gpt-4o-mini';
const MAX_TEXT_CHARS_FOR_AUDIT = 32000;

const VERIFY_ASSET_SYSTEM_PROMPT = `
You are MeliusAI's strict AI auditing engine: a combined Senior Staff Engineer, Technical Recruiter, and Mentor.

Your job is to evaluate the uploaded asset as evidence of technical skill. Be fair, specific, and demanding. Do not inflate scores for boilerplate, notes, tutorials, config files, or basic examples.

PHASE 1: ASSET CLASSIFICATION (Internal Reasoning)
Before grading, silently classify the uploaded file into exactly one category:
- Trivial/Boilerplate: config files, basic static HTML, empty READMEs, generated files, simple scripts, package manifests, lockfiles, environment samples.
- Notes/Theory: Markdown notes, text explanations, conceptual writeups, setup notes, non-code documentation.
- Practice/Beginner: tutorial follow-alongs, basic loops, calculators, single-purpose exercises, beginner CRUD snippets, toy examples.
- Intermediate/Project Component: API routes, UI components with meaningful state, non-trivial scripts, basic algorithms, reusable modules, real app screens.
- Production-Grade/Complex: full system architecture, secure APIs, robust data flows, optimized algorithms, meaningful edge-case handling, tests, performance/security awareness.

PHASE 2: DYNAMIC SCORING BANDS (Strict Rubric)
Strictly cap the score based on the internal classification:
- Trivial/Config/Notes: MAX SCORE 25/100.
- Practice/Beginner: MAX SCORE 50/100.
- Intermediate: MAX SCORE 75/100.
- Production-Grade: Can score 76-100 only if the asset handles edge cases, security, error states, maintainability, and performance.
- A perfect config file is still just a config file. It cannot score highly as a display of programming skill.
- Deduct heavily for missing error handling, lack of useful comments around non-obvious logic, hardcoded values, poor variable naming, weak structure, security risks, brittle assumptions, missing accessibility, and absent tests where tests would naturally be expected.

RECRUITER-READINESS EVALUATION
- The executiveSummary must explicitly state one verdict: "Recruiter-Ready" or "For Learning/Practice".
- Separate market-readiness from private mentorship. Use language like "Recruiter-Readiness Verdict: ..." and "Mentor Note: ...".
- "Recruiter-Ready" means this exact asset is impressive enough to show a hiring manager on its own. Most notes, config files, beginner exercises, and incomplete snippets are "For Learning/Practice" even when well written.

LANGUAGE & CONTEXT AWARENESS
- Frontend files (HTML/CSS/JS/React/Vue/Svelte): judge responsiveness, accessibility, semantic structure, state management, UX completeness, browser behavior, and maintainability.
- Backend/scripts (Python, Java, C++, C, C#, Go, Rust, Node, SQL): judge correctness, time/space complexity, memory/resource handling, security, SQL injection risk, hardcoded secrets, input validation, and error handling.
- Markdown/README/text: judge clarity, setup instructions, architectural explanations, accuracy, and usefulness, but keep the score capped as notes/documentation unless the asset includes substantive implementation.

OUTPUT CONSTRAINTS
Return ONLY a JSON object with exactly these keys:
{
  "executiveSummary": "String (Must include Recruiter-Readiness verdict and overall impression)",
  "score": Number,
  "pros": ["Array of specific technical strengths"],
  "cons": ["Array of specific technical flaws, missing features, or security risks"],
  "recommendations": ["Array of actionable, senior-level advice to upgrade the code to the next level"]
}
Do not include markdown wrappers, prose outside JSON, hidden fields, comments, or extra keys.
`;

const auditSchema = z
  .object({
    executiveSummary: z
      .string()
      .min(1)
      .describe('Must include Recruiter-Readiness Verdict and Mentor Note.'),
    score: z.number().min(0).max(100).describe('Strictly banded score from 0 to 100.'),
    pros: z.array(z.string().min(1)).min(1).max(5),
    cons: z.array(z.string().min(1)).min(1).max(5),
    recommendations: z.array(z.string().min(1)).min(1).max(5),
  })
  .strict();

type AuditPayload = z.infer<typeof auditSchema>;

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

type ParsedDataUrl = {
  buffer: Buffer;
  data: string;
  isBase64: boolean;
  mediaType: string;
};

type ScoreBand = {
  label:
    | 'Trivial/Boilerplate'
    | 'Notes/Theory'
    | 'Practice/Beginner'
    | 'Intermediate/Project Component'
    | 'Production-Grade/Complex';
  maxScore: 25 | 50 | 75 | 100;
  reason: string;
};

type UserMessageContent = Extract<ModelMessage, { role: 'user' }>['content'];

const configFilenames = new Set([
  '.env',
  '.env.example',
  '.env.local',
  '.gitignore',
  '.prettierrc',
  '.eslintrc',
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
const codeExtensions = new Set([...frontendExtensions, ...backendExtensions, '.h', '.hpp', '.kt', '.kts', '.lua', '.sh', '.swift']);
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

function isTextLikeAsset(assetName: string, contentType: string) {
  const normalizedType = getNormalizedContentType(contentType);

  return (
    isTextLikeContentType(normalizedType) ||
    textExtensions.has(getExtension(assetName))
  );
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

function shouldAttachAsModelFile(mediaType: string) {
  const normalizedType = getNormalizedContentType(mediaType);

  return normalizedType === 'application/pdf' || normalizedType.startsWith('image/');
}

function getDocumentDataUrlContentType(assetName: string, responseContentType: string) {
  const normalizedResponseType = getNormalizedContentType(responseContentType);
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

  if (normalizedAssetName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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
    const data = isBase64 ? rawData.replace(/\s/g, '') : Buffer.from(decodeURIComponent(rawData), 'utf8').toString('base64');
    const buffer = Buffer.from(data, 'base64');

    return {
      buffer,
      data,
      isBase64,
      mediaType,
    };
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
  const textNodes = [...xml.matchAll(/<(?:a:t|w:t|t)[^>]*>([\s\S]*?)<\/(?:a:t|w:t|t)>/gi)].map((match) =>
    decodeXmlEntities(match[1].replace(/<[^>]+>/g, '').trim())
  );

  return textNodes.filter(Boolean).join('\n');
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

    if (documentXml) {
      return extractTextNodes(documentXml).trim();
    }
  } catch (error) {
    console.warn('Unable to extract Office document text for verification:', error);
  }

  return '';
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

function looksLikeBasicHtml(content: string) {
  const lowered = content.toLowerCase();
  const hasScriptOrForm = /<script\b|<form\b|<input\b|<button\b|<nav\b|<main\b|<section\b|<article\b|@media\b/i.test(content);
  const htmlTagCount = countMatches(lowered, /<([a-z][a-z0-9-]*)\b/g);

  return /<!doctype\s+html|<html[\s>]/i.test(content) && !hasScriptOrForm && htmlTagCount < 20;
}

function hasBeginnerSignals(content: string) {
  return /\b(tutorial|practice|exercise|hello world|calculator|todo app|follow along|lesson|beginner|learning)\b/i.test(content);
}

function hasIntermediateSignals(content: string) {
  return /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b|NextResponse|useState\s*\(|useEffect\s*\(|createSupabase|fetch\s*\(|class\s+\w+|async\s+function|router\.|app\.|SELECT\s+.+\s+FROM|INSERT\s+INTO/i.test(
    content
  );
}

function productionSignalCount(content: string) {
  const signals = [
    /auth|getUser|Authorization|JWT|session/i,
    /zod|schema|validate|sanitize|parse|safeParse/i,
    /try\s*{|catch\s*\(|throw new|error handling|NextResponse\.json/i,
    /rateLimit|csrf|xss|sql injection|escape|permission|RLS|policy/i,
    /cache|memo|index|pagination|batch|stream|timeout|AbortController|Promise\.all/i,
    /test\(|describe\(|expect\(|unit test|integration test/i,
    /transaction|rollback|idempotent|retry|dedupe|queue/i,
  ];

  return signals.filter((pattern) => pattern.test(content)).length;
}

function inferScoreBand(assetName: string, content: string): ScoreBand {
  const normalizedName = assetName.toLowerCase().split(/[\\/]/).pop() || assetName.toLowerCase();
  const extension = getExtension(assetName);
  const signalText = getSignalText(content);
  const nonEmptyLineCount = signalText.split(/\r?\n/).filter((line) => line.trim()).length;
  const isDataUrlOnly = Boolean(parseDataUrl(content)) && !signalText.trim();

  if (configFilenames.has(normalizedName) || configExtensions.has(extension)) {
    return {
      label: 'Trivial/Boilerplate',
      maxScore: 25,
      reason: 'configuration or boilerplate artifact',
    };
  }

  if (isReadme(assetName) || notesExtensions.has(extension)) {
    return {
      label: 'Notes/Theory',
      maxScore: 25,
      reason: 'documentation, notes, or theory rather than implementation',
    };
  }

  if (isDataUrlOnly) {
    return {
      label: 'Notes/Theory',
      maxScore: 25,
      reason: 'binary/non-text artifact with limited direct implementation evidence',
    };
  }

  if (!codeExtensions.has(extension) && extension) {
    return {
      label: 'Notes/Theory',
      maxScore: 25,
      reason: 'non-code artifact',
    };
  }

  if ((extension === '.html' || extension === '.htm') && looksLikeBasicHtml(signalText)) {
    return {
      label: 'Trivial/Boilerplate',
      maxScore: 25,
      reason: 'basic static HTML without meaningful application behavior',
    };
  }

  if (signalText.length > 3500 && nonEmptyLineCount >= 100 && productionSignalCount(signalText) >= 5) {
    return {
      label: 'Production-Grade/Complex',
      maxScore: 100,
      reason: 'substantial implementation with production-readiness signals',
    };
  }

  if (hasIntermediateSignals(signalText) || nonEmptyLineCount >= 45) {
    return {
      label: 'Intermediate/Project Component',
      maxScore: 75,
      reason: 'real project component or non-trivial implementation',
    };
  }

  if (hasBeginnerSignals(signalText) || nonEmptyLineCount < 45) {
    return {
      label: 'Practice/Beginner',
      maxScore: 50,
      reason: 'small or tutorial-scale code artifact',
    };
  }

  return {
    label: 'Intermediate/Project Component',
    maxScore: 75,
    reason: 'implementation has project-level signals but not enough production evidence',
  };
}

function getContextLens(assetName: string) {
  const extension = getExtension(assetName);

  if (notesExtensions.has(extension) || isReadme(assetName)) {
    return 'Markdown/README/text documentation lens: clarity, setup instructions, architectural explanation, accuracy.';
  }

  if (frontendExtensions.has(extension)) {
    return 'Frontend lens: responsiveness, accessibility, semantic markup, state management, UX completeness, browser behavior.';
  }

  if (backendExtensions.has(extension)) {
    return 'Backend/script lens: correctness, complexity, memory/resource handling, security, input validation, hardcoded secrets, error handling.';
  }

  return 'General artifact lens: evaluate only what this file proves technically; do not infer unseen implementation.';
}

function truncateForAudit(content: string) {
  if (content.length <= MAX_TEXT_CHARS_FOR_AUDIT) {
    return {
      text: content,
      truncated: false,
    };
  }

  return {
    text: `${content.slice(0, MAX_TEXT_CHARS_FOR_AUDIT)}\n\n[TRUNCATED: only the first ${MAX_TEXT_CHARS_FOR_AUDIT} characters were provided to the model. Penalize uncertainty where relevant.]`,
    truncated: true,
  };
}

function buildAuditMessages({
  assetName,
  content,
  scoreBand,
  userContextDescription,
}: {
  assetName: string;
  content: string;
  scoreBand: ScoreBand;
  userContextDescription: string;
}): ModelMessage[] {
  const parsedDataUrl = parseDataUrl(content);
  const signalText = getSignalText(content);
  const { text: auditText, truncated } = truncateForAudit(signalText);
  const promptText = [
    'Uploaded Artifact Metadata:',
    `- Asset name: ${assetName}`,
    `- Context lens: ${getContextLens(assetName)}`,
    `- Server-side pre-review classification signal: ${scoreBand.label}`,
    `- Server-side maximum score cap: ${scoreBand.maxScore}/100`,
    `- Server-side cap reason: ${scoreBand.reason}`,
    `- Content was truncated for model review: ${truncated ? 'yes' : 'no'}`,
    `- User-provided project context: ${userContextDescription || 'No user-written project description was supplied.'}`,
    '',
    'Instructions:',
    '- Use the server-side classification signal as a strong guardrail.',
    '- If the content clearly belongs in a lower category, score lower.',
    '- Never exceed the provided maximum score cap.',
    '- Make every pro, con, and recommendation specific to this asset.',
    '',
    auditText
      ? `Uploaded Content To Audit:\n<<<ASSET_CONTENT_START\n${auditText}\nASSET_CONTENT_END>>>`
      : 'Uploaded Content To Audit:\nA binary file is attached only if the model supports this media type. If no readable implementation content is available, evaluate the asset as low evidence of programming skill.',
  ].join('\n');

  const contentParts: Exclude<UserMessageContent, string> = [{ type: 'text', text: promptText }];

  if (parsedDataUrl && shouldAttachAsModelFile(parsedDataUrl.mediaType)) {
    contentParts.push({
      type: 'file',
      data: parsedDataUrl.data,
      filename: assetName,
      mediaType: parsedDataUrl.mediaType,
    });
  }

  return [
    {
      role: 'user',
      content: contentParts,
    },
  ];
}

function normalizeAuditList(items: string[], fallback: string) {
  const normalized = items.map((item) => item.trim()).filter(Boolean).slice(0, 5);

  return normalized.length ? normalized : [fallback];
}

function normalizeExecutiveSummary(summary: string, score: number, scoreBand: ScoreBand) {
  const verdict = score >= 76 && scoreBand.maxScore === 100 ? 'Recruiter-Ready' : 'For Learning/Practice';
  const withoutVerdict = summary
    .replace(/Recruiter-Readiness Verdict:\s*(Recruiter-Ready|For Learning\/Practice)\.?\s*/i, '')
    .trim();
  const withMentorNote = /Mentor Note:/i.test(withoutVerdict)
    ? withoutVerdict
    : `${withoutVerdict} Mentor Note: Upgrade the asset by addressing the highest-impact technical gaps before using it as portfolio evidence.`;

  return `Recruiter-Readiness Verdict: ${verdict}. ${withMentorNote}`.trim();
}

function normalizeAuditPayload(audit: AuditPayload, scoreBand: ScoreBand): AuditPayload {
  const score = Math.max(0, Math.min(scoreBand.maxScore, Math.round(audit.score)));

  return {
    executiveSummary: normalizeExecutiveSummary(audit.executiveSummary.trim(), score, scoreBand),
    score,
    pros: normalizeAuditList(audit.pros, 'The asset contains some readable structure or intent that can be built upon.'),
    cons: normalizeAuditList(audit.cons, 'The asset does not yet provide enough implementation evidence for a strong technical signal.'),
    recommendations: normalizeAuditList(
      audit.recommendations,
      'Add substantive implementation details, error handling, and evidence of real-world constraints.'
    ),
  };
}

async function persistAuditResult({
  audit,
  projectId,
  supabase,
  userContextDescription,
  userId,
}: {
  audit: AuditPayload;
  projectId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userContextDescription: string;
  userId: string;
}) {
  const auditJson = JSON.stringify(audit);
  const { error } = await supabase
    .from('projects')
    .update({
      score: audit.score,
      evaluation_score: audit.score,
      logic_score: audit.score,
      audit_summary: audit.executiveSummary,
      ai_summary: auditJson,
      description: audit.executiveSummary,
      summary: audit.executiveSummary,
      pros: audit.pros,
      cons: audit.cons,
      recommendations: audit.recommendations,
      user_description: userContextDescription || null,
      has_been_audited: true,
    })
    .eq('id', projectId)
    .or(`user_id.eq.${userId},owner_id.eq.${userId}`);

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

    const body = (await request.json().catch(() => null)) as VerifyAssetProxyPayload | null;

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
        { error: 'fileUrl is required.' },
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
    const { object } = await generateObject({
      model: openai(OPENAI_VERIFY_MODEL),
      system: VERIFY_ASSET_SYSTEM_PROMPT,
      messages: buildAuditMessages({
        assetName,
        content: contentForVerification,
        scoreBand,
        userContextDescription,
      }),
      schema: auditSchema,
      schemaName: 'melius_asset_audit',
      schemaDescription: 'Strict MeliusAI asset verification audit with exact frontend keys.',
      maxOutputTokens: 1800,
      providerOptions: {
        openai: {
          strictJsonSchema: true,
        },
      },
    });
    const audit = normalizeAuditPayload(object, scoreBand);

    await persistAuditResult({
      audit,
      projectId,
      supabase,
      userContextDescription,
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
