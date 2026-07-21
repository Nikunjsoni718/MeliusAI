export type NormalizedAuditReport = {
  score: number | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

type AuditSection = 'summary' | 'strengths' | 'weaknesses' | 'recommendations' | 'score';

const nestedAuditKeys = [
  'project',
  'report',
  'audit_data',
  'auditData',
  'audit_report',
  'auditReport',
  'result',
  'data',
] as const;

const reportTextKeys = [
  'reportText',
  'report_text',
  'ai_summary',
  'aiSummary',
  'audit_summary',
  'auditSummary',
  'description',
  'executive_summary',
  'executiveSummary',
  'summary',
] as const;

const sectionAliases: Record<AuditSection, string[]> = {
  summary: ['ai executive summary', 'executive summary', 'project description', 'the breakdown', 'breakdown', 'summary'],
  strengths: [
    'systemic strengths',
    'architectural strengths',
    'the good stuff',
    'good stuff',
    'strengths',
    'pros',
    'goods',
  ],
  weaknesses: [
    'structural vulnerabilities',
    'systemic weaknesses',
    'architectural weaknesses',
    'growth areas',
    'weaknesses',
    'cons',
    'bads',
  ],
  recommendations: [
    'actionable recommendations',
    'strategic recommendations',
    'recommendations',
    'improvements',
  ],
  score: [
    'cumulative evaluation score',
    'meliusai verification score',
    'mentor score',
    'overall score',
    'final score',
    'scorecard',
    'score',
  ],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonRecord(value: unknown) {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) {
    return null;
  }

  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function collectAuditSources(value: unknown) {
  const sources: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();

  function visit(candidate: unknown, depth: number) {
    if (depth > 4) {
      return;
    }

    const record = asRecord(candidate) ?? parseJsonRecord(candidate);

    if (!record || seen.has(record)) {
      return;
    }

    seen.add(record);
    sources.push(record);

    nestedAuditKeys.forEach((key) => visit(record[key], depth + 1));
    reportTextKeys.forEach((key) => {
      const parsedReport = parseJsonRecord(record[key]);
      if (parsedReport) {
        visit(parsedReport, depth + 1);
      }
    });
  }

  visit(value, 0);
  return sources;
}

function normalizeHeading(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\*{1,2}/g, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/:$/, '')
    .trim()
    .toLowerCase();
}

function getSectionForHeading(line: string): { section: AuditSection; inlineContent: string } | null {
  const heading = normalizeHeading(line);

  for (const [section, aliases] of Object.entries(sectionAliases) as Array<[AuditSection, string[]]>) {
    const alias = aliases.find((candidate) => heading === candidate || heading.startsWith(`${candidate}:`));

    if (alias) {
      return {
        section,
        inlineContent: heading === alias ? '' : line.slice(line.indexOf(':') + 1).replace(/\*{1,2}/g, '').trim(),
      };
    }
  }

  return null;
}

function extractMarkdownSection(text: string, requestedSection: AuditSection) {
  const lines = text.replace(/\r/g, '').split('\n');
  let collecting = false;
  const collected: string[] = [];

  for (const line of lines) {
    const headingMatch = getSectionForHeading(line);

    if (headingMatch) {
      if (collecting) {
        break;
      }

      collecting = headingMatch.section === requestedSection;
      if (collecting && headingMatch.inlineContent) {
        collected.push(headingMatch.inlineContent);
      }
      continue;
    }

    if (collecting) {
      collected.push(line);
    }
  }

  return collected.join('\n').trim();
}

function cleanListLine(line: string) {
  return line
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^\*{1,2}|\*{1,2}$/g, '')
    .trim();
}

export function normalizeAuditList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeAuditList(item))
      .filter((item, index, items) => items.indexOf(item) === index);
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  const trimmedValue = value.trim();

  if (trimmedValue.startsWith('[')) {
    try {
      return normalizeAuditList(JSON.parse(trimmedValue));
    } catch {
      // Fall through and parse the value as plain text.
    }
  }

  return trimmedValue
    .replace(/\r/g, '')
    .split('\n')
    .map(cleanListLine)
    .filter(Boolean);
}

function findFirstString(sources: Record<string, unknown>[], keys: readonly string[]) {
  for (const key of keys) {
    for (const source of sources) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return '';
}

function getReportTexts(sources: Record<string, unknown>[]) {
  const texts: string[] = [];

  for (const source of sources) {
    for (const key of reportTextKeys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim() && !texts.includes(value.trim())) {
        texts.push(value.trim());
      }
    }
  }

  return texts;
}

function getScore(sources: Record<string, unknown>[], reportTexts: string[]) {
  const scoreKeys = [
    'evaluation_score',
    'evaluationScore',
    'evaluated_score',
    'evaluatedScore',
    'logic_score',
    'logicScore',
    'score',
    'calculatedScore',
    'calculated_score',
    'melius_score',
  ];
  const scores: number[] = [];

  for (const key of scoreKeys) {
    for (const source of sources) {
      const value = source[key];
      const score = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

      if (Number.isFinite(score)) {
        scores.push(Math.max(0, Math.min(100, Math.round(score))));
      }
    }
  }

  const storedScore = scores.find((score) => score > 0) ?? scores[0] ?? null;

  if (storedScore !== null && storedScore > 0) {
    return storedScore;
  }

  for (const reportText of reportTexts) {
    const match = reportText.match(/(?:score[^\n]*?[:\s])?(\d{1,3})\s*\/\s*100/i);
    if (match) {
      return Math.max(0, Math.min(100, Number.parseInt(match[1], 10)));
    }
  }

  return storedScore;
}

function getItems(
  sources: Record<string, unknown>[],
  directKeys: readonly string[],
  markdownSection: AuditSection,
  reportTexts: string[]
) {
  for (const key of directKeys) {
    for (const source of sources) {
      const items = normalizeAuditList(source[key]);
      if (items.length > 0) {
        return items;
      }
    }
  }

  for (const reportText of reportTexts) {
    const items = normalizeAuditList(extractMarkdownSection(reportText, markdownSection));
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function getSummary(sources: Record<string, unknown>[], reportTexts: string[]) {
  for (const reportText of reportTexts) {
    const sectionSummary = extractMarkdownSection(reportText, 'summary');
    if (sectionSummary) {
      return sectionSummary;
    }
  }

  const summary = findFirstString(sources, [
    'executive_summary',
    'executiveSummary',
    'audit_summary',
    'auditSummary',
    'ai_summary',
    'aiSummary',
    'summary',
    'user_description',
    'userDescription',
    'description',
  ]);

  return summary
    .replace(/^\s*#{1,6}\s*(?:ai\s+)?executive summary\s*:?[ \t]*/i, '')
    .split(
      /\n\s*(?:#{1,6}\s*)?(?:\*{1,2})?(?:systemic strengths|architectural strengths|strengths|pros|goods|structural vulnerabilities|systemic weaknesses|weaknesses|cons|bads|actionable recommendations|strategic recommendations|recommendations|overall score|final score|scorecard)(?:\*{1,2})?\s*:?[ \t]*(?:\n|$)/i
    )[0]
    .trim();
}

export function normalizeAuditReport(value: unknown): NormalizedAuditReport {
  const sources = collectAuditSources(value);
  const reportTexts = getReportTexts(sources);
  const weaknesses = getItems(
    sources,
    ['weaknesses', 'cons', 'systemic_weaknesses', 'systemicWeaknesses', 'structural_vulnerabilities'],
    'weaknesses',
    reportTexts
  );
  const recommendations = getItems(
    sources,
    ['recommendations', 'strategicRecommendations', 'strategic_recommendations', 'actionable_recommendations'],
    'recommendations',
    reportTexts
  );

  return {
    score: getScore(sources, reportTexts),
    summary: getSummary(sources, reportTexts),
    strengths: getItems(
      sources,
      ['strengths', 'pros', 'systemic_strengths', 'systemicStrengths'],
      'strengths',
      reportTexts
    ),
    weaknesses,
    recommendations:
      recommendations.length > 0 || !reportTexts.some((text) => /growth areas/i.test(text))
        ? recommendations
        : weaknesses,
  };
}
