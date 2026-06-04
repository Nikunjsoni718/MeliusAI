import type { PortfolioSourceKind, ScoreSource } from '@/types/supabase';

type Signal = { title: string; detail: string };
type Preset = {
  role: string;
  keywords: string[];
  boost: number;
  penalty: number;
  goods: [Signal, Signal];
  bads: [Signal, Signal];
  roadmap: [string, string, string, string];
  companyNeeds: [string, string, string];
};

const PRESETS: Preset[] = [
  {
    role: 'Product Engineer',
    keywords: ['developer', 'engineer', 'frontend', 'backend', 'full stack'],
    boost: 8,
    penalty: 6,
    goods: [
      { title: 'Your work feels real', detail: 'It looks like real product work.' },
      { title: 'Your thinking is clear', detail: 'People can follow what you built.' },
    ],
    bads: [
      { title: 'Explain key choices more', detail: 'Add simple notes on why you chose this approach.' },
      { title: 'Show testing more', detail: 'Add proof that your work is reliable.' },
    ],
    roadmap: [
      'Show one strong project first.',
      'Add simple notes on your decisions.',
      'Show how you handle quality.',
      'Turn your best work into a case study.',
    ],
    companyNeeds: ['system design', 'quality proof', 'clear decisions'],
  },
  {
    role: 'Product Designer',
    keywords: ['designer', 'ux', 'ui', 'product design', 'visual'],
    boost: 6,
    penalty: 7,
    goods: [
      { title: 'Your style is clear', detail: 'Your work feels polished right away.' },
      { title: 'Your thinking shows up', detail: 'People can see the problem you solved.' },
    ],
    bads: [
      { title: 'Explain your choices', detail: 'Show why you made each design move.' },
      { title: 'Show the results', detail: 'Add user or business outcomes.' },
    ],
    roadmap: [
      'Turn one project into a full case study.',
      'Show what changed during the work.',
      'Show how you worked with others.',
      'Balance polish with product thinking.',
    ],
    companyNeeds: ['case studies', 'teamwork proof', 'measured results'],
  },
  {
    role: 'Growth Marketer',
    keywords: ['marketer', 'marketing', 'growth', 'content'],
    boost: 5,
    penalty: 8,
    goods: [
      { title: 'Your ideas feel practical', detail: 'Your work feels ready for the market.' },
      { title: 'Your examples feel useful', detail: 'They show real business value.' },
    ],
    bads: [
      { title: 'Show your tests', detail: 'Make your experiments easier to follow.' },
      { title: 'Show the numbers', detail: 'Make the results easier to see.' },
    ],
    roadmap: [
      'Show one campaign from idea to result.',
      'Explain why you chose each channel.',
      'Add one clear report or chart.',
      'Lead with outcome, not activity.',
    ],
    companyNeeds: ['testing proof', 'clear metrics', 'channel choices'],
  },
  {
    role: 'Talent Operations Partner',
    keywords: ['hr', 'human resources', 'talent', 'people ops', 'recruiter'],
    boost: 4,
    penalty: 9,
    goods: [
      { title: 'Your people focus is clear', detail: 'Your work shows care and structure.' },
      { title: 'Your process feels solid', detail: 'It looks repeatable and reliable.' },
    ],
    bads: [
      { title: 'Show business impact', detail: 'Connect your work to team or company results.' },
      { title: 'Explain your process', detail: 'Show how you make decisions.' },
    ],
    roadmap: [
      'Show one workflow you improved.',
      'Explain the choices you made.',
      'Add one example of team alignment.',
      'Show how your work removes friction.',
    ],
    companyNeeds: ['process proof', 'team alignment', 'measured impact'],
  },
];

const DEFAULT_PRESET: Preset = {
  role: 'Career Builder',
  keywords: [],
  boost: 3,
  penalty: 9,
  goods: [
    { title: 'Your intent is clear', detail: 'This already feels like serious work.' },
    { title: 'You have good material', detail: 'A little structure will help a lot.' },
  ],
  bads: [
    { title: 'Tell your story faster', detail: 'Make your value clear right away.' },
    { title: 'Show your results', detail: 'Add proof that your work made a difference.' },
  ],
  roadmap: [
    'Lead with your best work.',
    'Show clear results.',
    'Make your choices easy to follow.',
    'Tailor the story to the role you want.',
  ],
  companyNeeds: ['clear proof', 'strong results', 'good decisions'],
};

const SOURCE_SIGNALS: Record<PortfolioSourceKind, { good: Signal; bad: Signal }> = {
  github: {
    good: { title: 'Your proof is clear', detail: 'GitHub helps people trust your work.' },
    bad: { title: 'Tell the story better', detail: 'Add scope, choices, and results.' },
  },
  behance: {
    good: { title: 'Your work looks polished', detail: 'People can judge your craft quickly.' },
    bad: { title: 'Add more context', detail: 'Show the process behind the final work.' },
  },
  drive: {
    good: { title: 'Your work is easy to group', detail: 'Drive works well for bigger project sets.' },
    bad: { title: 'Lead with your best work', detail: 'Put your strongest proof first.' },
  },
  website: {
    good: { title: 'Your brand feels thoughtful', detail: 'A personal site shows care and effort.' },
    bad: { title: 'Add more proof', detail: 'Link results, details, or examples.' },
  },
};

export type PortfolioAssessmentInput = {
  sourceUrl: string;
  profession: string;
  targetCompany?: string | null;
};

export type PortfolioAssessmentResult = {
  sourceKind: PortfolioSourceKind;
  meliusScore: number;
  summary: string;
  verifiedHeadline: string;
  targetRole: string;
  targetCompany: string | null;
  readyMeter: number | null;
  autoApplyEligible: boolean;
  scoreSource: ScoreSource;
  goods: [Signal, Signal, Signal];
  bads: [Signal, Signal, Signal];
  roadmap: [string, string, string, string];
  gaps: [string, string, string];
  improvementTips: [string, string, string];
};

export function inferPortfolioSourceKind(sourceUrl: string): PortfolioSourceKind {
  try {
    const url = new URL(sourceUrl.trim());
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes('github.com')) return 'github';
    if (hostname.includes('behance.net')) return 'behance';
    if (hostname.includes('drive.google.com') || hostname.includes('docs.google.com')) return 'drive';
    return 'website';
  } catch {
    return 'website';
  }
}

export async function generatePortfolioAssessment(
  input: PortfolioAssessmentInput
): Promise<PortfolioAssessmentResult> {
  const normalizedUrl = normalizeUrl(input.sourceUrl);
  const sourceKind = inferPortfolioSourceKind(normalizedUrl);
  const preset = resolvePreset(input.profession);
  const targetCompany = normalizeText(input.targetCompany);
  const seed = hashSeed(`${normalizedUrl}:${input.profession}`);
  const meliusScore = clampScore(70 + preset.boost + (seed % 13));
  const readyMeter = targetCompany
    ? clampScore(meliusScore - preset.penalty - (hashSeed(targetCompany) % 8) + (sourceKind === 'github' ? 4 : 1))
    : null;
  const goods: [Signal, Signal, Signal] = [preset.goods[0], SOURCE_SIGNALS[sourceKind].good, preset.goods[1]];
  const bads: [Signal, Signal, Signal] = [preset.bads[0], SOURCE_SIGNALS[sourceKind].bad, preset.bads[1]];
  const autoApplyEligible = Boolean(targetCompany && readyMeter !== null && readyMeter >= 90);

  return {
    sourceKind,
    meliusScore,
    summary: buildSummary(input.profession, sourceKind, meliusScore, targetCompany),
    verifiedHeadline: buildHeadline(preset.role, targetCompany),
    targetRole: preset.role,
    targetCompany,
    readyMeter,
    autoApplyEligible,
    scoreSource: 'manual',
    goods,
    bads,
    roadmap: preset.roadmap,
    gaps: buildGaps(targetCompany, preset.companyNeeds, bads[0].title),
    improvementTips: [preset.roadmap[0], preset.roadmap[1], preset.roadmap[2]],
  };
}

function normalizeUrl(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error('Enter a GitHub, Behance, Drive, or portfolio URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Enter a valid portfolio URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Portfolio URLs must start with http:// or https://.');
  }

  return parsed.toString();
}

function resolvePreset(profession: string) {
  const normalized = profession.trim().toLowerCase();

  return PRESETS.find((preset) => preset.keywords.some((keyword) => normalized.includes(keyword))) ?? DEFAULT_PRESET;
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildHeadline(role: string, targetCompany: string | null) {
  return targetCompany ? `${role} review for ${targetCompany}` : `${role} review`;
}

function buildSummary(
  profession: string,
  sourceKind: PortfolioSourceKind,
  score: number,
  targetCompany: string | null
) {
  const sourceText =
    sourceKind === 'github'
      ? 'GitHub gives us clear proof.'
      : sourceKind === 'behance'
        ? 'Your portfolio looks polished.'
        : sourceKind === 'drive'
          ? 'Your work is easy to review.'
          : 'Your work is easy to understand.';
  const companyText = targetCompany ? `You are getting closer to ${targetCompany}.` : 'You are off to a good start.';
  return `${sourceText} Score: ${score}/100 for ${profession}. ${companyText}`;
}

function buildGaps(
  targetCompany: string | null,
  companyNeeds: [string, string, string],
  topBadTitle: string
): [string, string, string] {
  const company = targetCompany ?? 'Your target company';
  return [
    `${company} wants stronger ${companyNeeds[0]}.`,
    `${company} wants clearer ${companyNeeds[1]}.`,
    `Fix this next: ${topBadTitle}.`,
  ];
}

function hashSeed(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100000;
  }
  return Math.abs(hash);
}

function clampScore(value: number) {
  return Math.min(100, Math.max(1, Math.round(value)));
}
