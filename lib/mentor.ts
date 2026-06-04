export { generatePortfolioAssessment, inferPortfolioSourceKind } from './mentor-portfolio';
export type { PortfolioAssessmentResult } from './mentor-portfolio';

export const GEMINI_REPO_ANALYSIS_MODEL = "gemini-1.5-flash";
export const GEMINI_VAULT_ANALYSIS_MODEL = "gemini-1.5-flash";
export const REPO_ANALYSIS_TIP_COUNT = 3;
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_RAW_BASE_URL = "https://raw.githubusercontent.com";
const MAX_REPO_FILES = 12;
const MAX_FILE_CHARACTERS = 4000;
const MAX_TOTAL_CONTEXT_CHARACTERS = 18000;
const GITHUB_ALLOWED_EXTENSIONS = new Set([
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const GITHUB_IGNORED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
]);

export type RepoAnalysisInput = {
  githubUrl: string;
  apiKey?: string;
  githubToken?: string;
  fetchImpl?: typeof fetch;
};

export type RepoAnalysisResult = {
  score: number;
  tips: [string, string, string];
};

type GeminiCandidate = {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
  };
};

type VaultAssetCategory = "document" | "code" | "media" | "general";

export type VaultProjectAnalysisInput = {
  fileName: string;
  fileType: string;
  fileUrl?: string | null;
  description?: string | null;
  aboutText?: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

export type VaultProjectAudit = {
  conceptualAlignment: string;
  architecturalLogic: string;
  meliusVerificationScore: number;
  score: number;
  summary: string;
  breakdown: {
    strengths: string[];
    weaknesses: string[];
  };
};

export type VaultProjectAnalysisResult = {
  logicScore: number;
  aiSummary: string;
  audit: VaultProjectAudit;
  source: "gemini" | "simulated";
};

type GitHubRepoRef = {
  normalizedUrl: string;
  owner: string;
  repo: string;
};

type GitHubRepoResponse = {
  default_branch?: string;
};

type GitHubTreeEntry = {
  path?: string;
  type?: "blob" | "tree";
};

type GitHubTreeResponse = {
  tree?: GitHubTreeEntry[];
};

type RepoFileSample = {
  path: string;
  content: string;
};

type RepoSnapshot = {
  defaultBranch: string;
  files: RepoFileSample[];
};

export function validateGithubRepoUrl(githubUrl: string): string {
  return parseGithubRepoUrl(githubUrl).normalizedUrl;
}

function parseGithubRepoUrl(githubUrl: string): GitHubRepoRef {
  const normalized = githubUrl.trim();

  if (!normalized) {
    throw new Error("Expected a GitHub repository URL.");
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Expected a valid GitHub repository URL.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Expected a GitHub repository URL.");
  }

  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error("Expected a GitHub repository URL.");
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");

  if (!owner || !repo) {
    throw new Error("Expected a GitHub repository URL.");
  }

  return {
    normalizedUrl: `https://github.com/${owner}/${repo}`,
    owner,
    repo,
  };
}

export function buildRepoAnalysisPrompt(
  githubUrl: string,
  snapshot: RepoSnapshot
): string {
  const fileList = snapshot.files.map((file) => `- ${file.path}`).join("\n");
  const fileSnippets = snapshot.files
    .map(
      (file) =>
        `FILE: ${file.path}\n${truncateText(file.content, MAX_FILE_CHARACTERS)}`
    )
    .join("\n\n---\n\n");

  return [
    "You are MeliusIQ's repository scorer.",
    `Analyze the repository at ${githubUrl}.`,
    `Default branch: ${snapshot.defaultBranch}.`,
    "Base your answer only on the supplied repository snapshot.",
    "Repository files included:",
    fileList,
    "",
    "Repository snapshot:",
    fileSnippets,
    "",
    "Return only valid JSON with this exact shape:",
    '{ "score": 1, "tips": ["tip 1", "tip 2", "tip 3"] }',
    "Rules:",
    "- score must be an integer from 1 to 100",
    "- tips must contain exactly 3 strings",
    "- each tip must be specific, actionable, and grounded in the repo",
    "- do not include markdown, code fences, or any extra keys",
    "- favor concrete file, architecture, testing, security, or DX improvements",
  ].join("\n");
}

export async function analyzeRepo(input: RepoAnalysisInput): Promise<RepoAnalysisResult> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const githubToken =
    input.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.GITHUB_ACCESS_TOKEN;
  const fetchImpl = input.fetchImpl ?? fetch;
  const repoRef = parseGithubRepoUrl(input.githubUrl);

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const snapshot = await buildRepoSnapshot({
    repoRef,
    fetchImpl,
    githubToken,
  });

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_REPO_ANALYSIS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildRepoAnalysisPrompt(repoRef.normalizedUrl, snapshot),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 512,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${errorText || response.statusText}`);
  }

  const body = (await response.json()) as GeminiResponse;
  const text = extractGeminiText(body);
  const parsed = parseAnalysisPayload(text);

  return {
    score: parsed.score,
    tips: parsed.tips,
  };
}

export async function analyzeVaultProject(
  input: VaultProjectAnalysisInput
): Promise<VaultProjectAnalysisResult> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const fetchImpl = input.fetchImpl ?? fetch;

  if (!apiKey) {
    return simulateVaultProjectAnalysis(input);
  }

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VAULT_ANALYSIS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildVaultProjectPrompt(input),
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          topP: 0.8,
          maxOutputTokens: 420,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("MeliusAI request failed", await response.text().catch(() => response.statusText));
    return simulateVaultProjectAnalysis(input);
  }

  const body = (await response.json()) as GeminiResponse;
  const text = extractGeminiText(body);
  const parsed = parseVaultProjectPayload(text);

  return {
    logicScore: parsed.score,
    aiSummary: JSON.stringify(parsed),
    audit: parsed,
    source: "gemini",
  };
}

function buildVaultProjectPrompt(input: VaultProjectAnalysisInput) {
  const category = resolveVaultAssetCategory(input.fileName, input.fileType);
  const categoryRules = getVaultCategoryRules(category);

  return [
    "You are MeliusAI, an institutional code auditor and technical judge.",
    "Review the relationship between the project asset metadata and the user's written project description.",
    "Do not assume implementation details that the metadata or description does not establish.",
    "Cross-examine the engineering claim using the category-specific rubric below.",
    "Be precise, contextual, professionally skeptical, and fair.",
    "",
    `File name: ${input.fileName}`,
    `File type: ${input.fileType}`,
    `Detected category: ${category}`,
    `Category rubric: ${categoryRules}`,
    `File URL: ${input.fileUrl ?? "Not provided"}`,
    `Project description: ${truncateText(input.description?.trim() || "Not provided", 2000)}`,
    `About Me: ${truncateText(input.aboutText?.trim() || "Not provided", 1200)}`,
    "",
    "Return only valid JSON with this exact shape:",
    '{ "conceptualAlignment": "Whether the metadata supports what the user described.", "architecturalLogic": "Whether the stated technical logic is coherent.", "meliusVerificationScore": 85, "score": 85, "summary": "A precise, highly contextual 2-sentence cross-examination.", "breakdown": { "strengths": ["Specific validated point 1", "Specific validated point 2"], "weaknesses": ["Specific concern 1", "Specific concern 2"] } }',
    "Rules:",
    "- Conceptual Alignment must judge whether the asset metadata indicates that the user executed what they described",
    "- Architectural Logic must judge whether the engineering structure described is technically sound",
    "- meliusVerificationScore and score must be the same integer from 0 to 100",
    "- summary must be exactly 2 concise sentences",
    "- breakdown.strengths must contain 2 to 4 specific points",
    "- breakdown.weaknesses must contain 2 to 4 specific vulnerabilities",
    "- do not include markdown, code fences, or extra keys",
  ].join("\n");
}

function simulateVaultProjectAnalysis(input: VaultProjectAnalysisInput): VaultProjectAnalysisResult {
  const fileName = input.fileName.trim() || "project";
  const fileType = input.fileType.trim().toLowerCase() || "file";
  const category = resolveVaultAssetCategory(fileName, fileType);
  const aboutText = input.aboutText?.trim() ?? "";
  const description = input.description?.trim() ?? "";
  const seed = hashText(`${fileName}:${fileType}:${description}:${aboutText}`);
  const hasStory = aboutText.length >= 80;
  const hasSpecifics = /\b(goal|built|created|designed|learned|impact|skills|team|user|client)\b/i.test(aboutText);
  const hasDescription = description.length >= 40;
  const hasArchitecturalDetail =
    /\b(architecture|api|database|supabase|component|react|next|typescript|pipeline|authentication|schema|stack)\b/i.test(
      description
    );
  const score = clampVaultScore(
    50 + (seed % 20) + (hasStory ? 6 : 0) + (hasSpecifics ? 5 : 0) + (hasDescription ? 10 : 0) + (hasArchitecturalDetail ? 9 : 0)
  );
  const categoryFeedback = getSimulatedCategoryFeedback(category, fileName, fileType, hasStory, hasSpecifics);
  const audit: VaultProjectAudit = {
    conceptualAlignment: hasDescription
      ? `The submitted ${fileType.toUpperCase()} asset is associated with a written implementation claim, but direct execution proof requires inspecting the stored deliverable.`
      : "No detailed project description was provided, so the asset cannot be meaningfully compared with an engineering claim.",
    architecturalLogic: hasArchitecturalDetail
      ? "The description identifies technical architecture signals that can support a structured review, subject to validation in the asset itself."
      : "The description does not yet provide enough concrete architecture, data flow, or stack detail for strong logic validation.",
    meliusVerificationScore: score,
    score,
    summary: categoryFeedback.summary,
    breakdown: {
      strengths: categoryFeedback.strengths,
      weaknesses: categoryFeedback.weaknesses,
    },
  };

  return {
    logicScore: audit.score,
    aiSummary: JSON.stringify(audit),
    audit,
    source: "simulated",
  };
}

function resolveVaultAssetCategory(fileName: string, fileType: string): VaultAssetCategory {
  const extension = normalizeVaultExtension(fileName, fileType);

  if (["ppt", "pptx", "pdf", "doc", "docx"].includes(extension)) {
    return "document";
  }

  if (["html", "js", "jsx", "ts", "tsx", "py", "css"].includes(extension)) {
    return "code";
  }

  if (["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm"].includes(extension)) {
    return "media";
  }

  return "general";
}

function normalizeVaultExtension(fileName: string, fileType: string) {
  const nameExtension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  const typeExtension = fileType.split("/").pop()?.trim().toLowerCase() ?? "";
  return nameExtension || typeExtension || "file";
}

function getVaultCategoryRules(category: VaultAssetCategory) {
  if (category === "document") {
    return "For presentations and documents (.pptx, .pdf, .docx), focus scoring, strengths, and weaknesses on narrative architecture, business flow, slide/data structure, information density, sequencing, and clarity of decision logic.";
  }

  if (category === "code") {
    return "For application code (.html, .js, .py, .css), evaluate modular cleanliness, syntax organization, semantic integrity, execution viability, maintainability, and structural output logic.";
  }

  if (category === "media") {
    return "For visual assets and media (.jpg, .png, .mp4), judge compositional balance, presentation clarity, design layout weight, visual hierarchy, data visualization correctness, and communicative precision.";
  }

  return "For general files, evaluate clarity of purpose, evidence quality, organization, completion signals, and how well the asset supports the user's professional story.";
}

function getSimulatedCategoryFeedback(
  category: VaultAssetCategory,
  fileName: string,
  fileType: string,
  hasStory: boolean,
  hasSpecifics: boolean
) {
  if (category === "document") {
    return {
      summary: `${fileName} reads as a document-led asset, so the strongest signal is its potential narrative architecture and business flow. ${
        hasStory
          ? "Your bio adds helpful strategic context, but the file still needs visible proof of slide logic, data structure, and information density."
          : "The asset needs stronger surrounding context before MeliusAI can validate the reasoning behind its sequence and density."
      }`,
      strengths: [
        "The asset format is appropriate for structured storytelling, business logic, or decision presentation.",
        hasSpecifics
          ? "Your profile adds enough directional context to infer the intended professional narrative."
          : "The file metadata gives a clean starting point for document-level validation.",
      ],
      weaknesses: [
        "The upload does not yet expose slide hierarchy, evidence quality, or narrative transitions.",
        "The review needs clearer proof of business flow, data structure, and information density.",
      ],
    };
  }

  if (category === "code") {
    return {
      summary: `${fileName} is being judged as application code, so the audit focuses on structure, execution viability, and semantic cleanliness. ${
        hasStory
          ? "Your bio clarifies intent, but the project still needs stronger evidence of modularity and output logic."
          : "Without more context, MeliusAI can only validate the file as a code asset, not the full execution architecture."
      }`,
      strengths: [
        `The ${fileType.toUpperCase()} asset is recognizable as implementation material rather than a generic portfolio artifact.`,
        hasSpecifics
          ? "Your profile provides some intent signals that help frame the code's purpose."
          : "The project has enough metadata to begin a structural code review.",
      ],
      weaknesses: [
        "The upload does not yet show module boundaries, dependency flow, or runtime behavior.",
        "The audit needs clearer proof of syntax organization, semantic integrity, and execution viability.",
      ],
    };
  }

  if (category === "media") {
    return {
      summary: `${fileName} is being judged as a visual/media asset, so the audit prioritizes composition, clarity, hierarchy, and presentation weight. ${
        hasStory
          ? "Your bio helps frame the creative intent, but the asset still needs stronger proof of layout decisions and communicative precision."
          : "The asset needs more contextual explanation before its design logic can be judged deeply."
      }`,
      strengths: [
        "The asset format is suitable for fast visual judgment of composition and presentation quality.",
        hasSpecifics
          ? "Your profile gives useful signals about the intended audience or creative direction."
          : "The file can still be assessed for baseline visual clarity and layout weight.",
      ],
      weaknesses: [
        "The upload does not yet expose process rationale, audience constraints, or iteration history.",
        "The review needs stronger proof of visual hierarchy, data correctness, and compositional balance.",
      ],
    };
  }

  return {
    summary: `${fileName} is a general Vault asset, so the audit focuses on clarity, organization, and professional evidence quality. ${
      hasStory
        ? "Your bio helps connect the asset to your goals, but the project still needs stronger proof of outcomes."
        : "The project needs more context before MeliusAI can judge its deeper logic with confidence."
    }`,
    strengths: [
      "The project is organized enough to be stored and reviewed as a professional asset.",
      hasSpecifics ? "Your profile adds useful intent signals." : "The metadata provides a baseline review signal.",
    ],
    weaknesses: [
      "The asset does not yet expose enough process, constraints, or decision history.",
      "The review needs clearer evidence of purpose, impact, and completion quality.",
    ],
  };
}

function parseVaultProjectPayload(rawText: string): VaultProjectAudit {
  const jsonText = extractJsonLikeText(rawText);

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("MeliusAI output was not valid JSON.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("MeliusAI output had an unexpected shape.");
  }

  const payload = data as {
    conceptualAlignment?: unknown;
    architecturalLogic?: unknown;
    meliusVerificationScore?: unknown;
    score?: unknown;
    summary?: unknown;
    breakdown?: {
      strengths?: unknown;
      weaknesses?: unknown;
    };
  };

  const score = normalizeVaultScore(payload.meliusVerificationScore ?? payload.score);

  return {
    conceptualAlignment: normalizeJudgment(
      payload.conceptualAlignment,
      "Conceptual alignment could not be extracted from this audit response."
    ),
    architecturalLogic: normalizeJudgment(
      payload.architecturalLogic,
      "Architectural logic could not be extracted from this audit response."
    ),
    meliusVerificationScore: score,
    score,
    summary: normalizeSummary(payload.summary),
    breakdown: {
      strengths: normalizeAuditList(payload.breakdown?.strengths, "strengths"),
      weaknesses: normalizeAuditList(payload.breakdown?.weaknesses, "weaknesses"),
    },
  };
}

function normalizeVaultScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) {
    throw new Error("MeliusAI output did not include a valid score.");
  }

  return clampVaultScore(score);
}

function normalizeSummary(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("MeliusAI output did not include a summary.");
  }

  return truncateText(value.trim(), 320);
}

function normalizeJudgment(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? truncateText(value.trim(), 320) : fallback;
}

function normalizeAuditList(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`MeliusAI output did not include ${label}.`);
  }

  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);

  if (items.length < 2) {
    throw new Error(`MeliusAI output must include at least 2 ${label}.`);
  }

  return items;
}

async function buildRepoSnapshot(input: {
  repoRef: GitHubRepoRef;
  fetchImpl: typeof fetch;
  githubToken?: string;
}): Promise<RepoSnapshot> {
  const repoInfo = await githubRequest<GitHubRepoResponse>({
    fetchImpl: input.fetchImpl,
    githubToken: input.githubToken,
    path: `/repos/${input.repoRef.owner}/${input.repoRef.repo}`,
    errorLabel: "load repository metadata",
  });

  const defaultBranch = repoInfo.default_branch;
  if (!defaultBranch) {
    throw new Error("GitHub repository metadata did not include a default branch.");
  }

  const tree = await githubRequest<GitHubTreeResponse>({
    fetchImpl: input.fetchImpl,
    githubToken: input.githubToken,
    path: `/repos/${input.repoRef.owner}/${input.repoRef.repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    errorLabel: "load repository tree",
  });

  const fileCandidates = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path as string)
    .filter(shouldIncludeRepoPath)
    .sort((left, right) => scoreRepoPath(right) - scoreRepoPath(left))
    .slice(0, MAX_REPO_FILES);

  const files = await fetchRepoFiles({
    repoRef: input.repoRef,
    defaultBranch,
    paths: fileCandidates,
    fetchImpl: input.fetchImpl,
    githubToken: input.githubToken,
  });

  if (files.length === 0) {
    throw new Error("No text-based repository files were available for analysis.");
  }

  return {
    defaultBranch,
    files,
  };
}

async function fetchRepoFiles(input: {
  repoRef: GitHubRepoRef;
  defaultBranch: string;
  paths: string[];
  fetchImpl: typeof fetch;
  githubToken?: string;
}): Promise<RepoFileSample[]> {
  const files: RepoFileSample[] = [];
  let remainingCharacters = MAX_TOTAL_CONTEXT_CHARACTERS;

  for (const path of input.paths) {
    if (remainingCharacters <= 0) {
      break;
    }

    const content = await fetchRepoFileContent({
      repoRef: input.repoRef,
      defaultBranch: input.defaultBranch,
      path,
      fetchImpl: input.fetchImpl,
      githubToken: input.githubToken,
    });

    if (!content) {
      continue;
    }

    const trimmed = truncateText(
      content,
      Math.min(MAX_FILE_CHARACTERS, remainingCharacters)
    );

    if (!trimmed) {
      continue;
    }

    files.push({
      path,
      content: trimmed,
    });
    remainingCharacters -= trimmed.length;
  }

  return files;
}

async function fetchRepoFileContent(input: {
  repoRef: GitHubRepoRef;
  defaultBranch: string;
  path: string;
  fetchImpl: typeof fetch;
  githubToken?: string;
}): Promise<string | null> {
  const encodedPath = input.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await input.fetchImpl(
    `${GITHUB_RAW_BASE_URL}/${input.repoRef.owner}/${input.repoRef.repo}/${encodeURIComponent(input.defaultBranch)}/${encodedPath}`,
    {
      headers: buildGitHubHeaders(input.githubToken),
    }
  );

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.startsWith("text/") && !contentType.includes("json")) {
    return null;
  }

  const text = normalizeRepoFileContent(await response.text());
  return text || null;
}

async function githubRequest<T>(input: {
  fetchImpl: typeof fetch;
  githubToken?: string;
  path: string;
  errorLabel: string;
}): Promise<T> {
  const response = await input.fetchImpl(`${GITHUB_API_BASE_URL}${input.path}`, {
    headers: buildGitHubHeaders(input.githubToken),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Failed to ${input.errorLabel} from GitHub (${response.status}): ${errorText || response.statusText}`
    );
  }

  return (await response.json()) as T;
}

function buildGitHubHeaders(githubToken?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "MeliusIQ",
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  };
}

function shouldIncludeRepoPath(path: string): boolean {
  const lowercasePath = path.toLowerCase();
  const segments = lowercasePath.split("/");
  const extension = getFileExtension(lowercasePath);

  if (!extension || !GITHUB_ALLOWED_EXTENSIONS.has(extension)) {
    return false;
  }

  if (segments.some((segment) => GITHUB_IGNORED_SEGMENTS.has(segment))) {
    return false;
  }

  return true;
}

function getFileExtension(path: string): string {
  const lastDotIndex = path.lastIndexOf(".");
  return lastDotIndex === -1 ? "" : path.slice(lastDotIndex);
}

function scoreRepoPath(path: string): number {
  const lowercasePath = path.toLowerCase();
  let score = 0;

  if (lowercasePath === "readme.md") score += 200;
  if (lowercasePath === "package.json") score += 160;
  if (lowercasePath.startsWith("app/")) score += 150;
  if (lowercasePath.startsWith("src/")) score += 140;
  if (lowercasePath.startsWith("lib/")) score += 120;
  if (lowercasePath.startsWith("components/")) score += 110;
  if (lowercasePath.startsWith("supabase/")) score += 105;
  if (lowercasePath.startsWith("prisma/")) score += 100;
  if (lowercasePath.includes("test")) score += 90;
  if (lowercasePath.endsWith(".ts") || lowercasePath.endsWith(".tsx")) score += 80;
  if (lowercasePath.endsWith(".md")) score += 50;

  return score - lowercasePath.length;
}

function normalizeRepoFileContent(content: string): string {
  return content.replace(/\u0000/g, "").trim();
}

function truncateText(content: string, maxCharacters: number): string {
  if (content.length <= maxCharacters) {
    return content;
  }

  return `${content.slice(0, maxCharacters - 3).trimEnd()}...`;
}

function extractGeminiText(body: GeminiResponse): string {
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    const fallback = body.error?.message ?? "Gemini returned no analysis content.";
    throw new Error(fallback);
  }

  return text;
}

function parseAnalysisPayload(rawText: string): RepoAnalysisResult {
  const jsonText = extractJsonLikeText(rawText);

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("Gemini output was not valid JSON.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Gemini output had an unexpected shape.");
  }

  const score = normalizeScore((data as { score?: unknown }).score);
  const tips = normalizeTips((data as { tips?: unknown }).tips);

  return {
    score,
    tips,
  };
}

function extractJsonLikeText(rawText: string): string {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return rawText.trim();
}

function normalizeScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) {
    throw new Error("Gemini output did not include a valid score.");
  }

  const normalized = Math.round(score);
  if (normalized < 1 || normalized > 100) {
    throw new Error("Score must be between 1 and 100.");
  }

  return normalized;
}

function normalizeTips(value: unknown): [string, string, string] {
  if (!Array.isArray(value)) {
    throw new Error("Gemini output did not include improvement tips.");
  }

  const tips = value
    .map((tip) => (typeof tip === "string" ? tip.trim() : ""))
    .filter(Boolean)
    .slice(0, REPO_ANALYSIS_TIP_COUNT);

  if (tips.length !== REPO_ANALYSIS_TIP_COUNT) {
    throw new Error("Gemini output must include exactly 3 non-empty tips.");
  }

  return [tips[0], tips[1], tips[2]];
}

function hashText(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 33 + character.charCodeAt(0)) % 100000;
  }
  return Math.abs(hash);
}

function clampVaultScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

