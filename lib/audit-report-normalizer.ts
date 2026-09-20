export type NormalizedAuditReport = {
  score: number | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  findings: NormalizedAuditFindings;
};

export const AUDIT_SCORE_CEILING = 98;

export type AuditSeverity = 'CRITICAL' | 'WARNING' | 'OPTIMIZATION';
export type AuditImpactArea = 'security' | 'reliability' | 'performance' | 'maintainability' | 'operability';

export type AuditFinding = {
  text: string;
  findingId?: string;
  severity?: AuditSeverity;
  penalty?: number;
  scope?: string;
  location?: string;
  isCatastrophic?: boolean;
  impactArea?: AuditImpactArea;
};

/**
 * Links canonical directives to findings without making older persisted reports
 * lose their index-based recommendation pairing. Canonical finding IDs always
 * win; index matching is reserved for directive records without an ID.
 */
export function resolveAuditDirective(
  finding: AuditFinding,
  index: number,
  directives: readonly AuditFinding[]
): AuditFinding | undefined {
  const findingId = finding.findingId?.trim();

  if (findingId) {
    const linkedDirective = directives.find((directive) => directive.findingId?.trim() === findingId);
    if (linkedDirective) {
      return linkedDirective;
    }

    const indexedDirective = directives[index];
    return indexedDirective && !indexedDirective.findingId?.trim() ? indexedDirective : undefined;
  }

  return directives[index];
}

export type NormalizedAuditFindings = {
  strengths: AuditFinding[];
  weaknesses: AuditFinding[];
  recommendations: AuditFinding[];
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
    .replace(/^\[\s*(?:critical|warning|optimization)\s*\]\s*/i, '')
    .replace(/^(?:critical|warning|optimization)\s*[:\-\u2013\u2014]\s*/i, '')
    .trim();
}

function normalizeSeverity(value: unknown): AuditSeverity | undefined {
  const severity = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return severity === 'CRITICAL' || severity === 'WARNING' || severity === 'OPTIMIZATION'
    ? severity
    : undefined;
}

const AUDIT_PENALTY_RANGES: Record<AuditSeverity, readonly [number, number]> = {
  CRITICAL: [11, 13],
  WARNING: [4, 6],
  OPTIMIZATION: [0, 2],
};
const AUDIT_DEFAULT_PENALTIES: Record<AuditSeverity, number> = {
  CRITICAL: 12,
  WARNING: 5,
  OPTIMIZATION: 1,
};

function normalizePenalty(value: unknown, severity: AuditSeverity): number {
  const fallback = AUDIT_DEFAULT_PENALTIES[severity];
  const penalty = typeof value === 'number' && Number.isInteger(value) ? value : fallback;
  const [minimum, maximum] = AUDIT_PENALTY_RANGES[severity];
  return Math.max(minimum, Math.min(maximum, penalty));
}

function normalizeImpactArea(value: unknown): AuditImpactArea | undefined {
  const impactArea = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return impactArea === 'security' ||
    impactArea === 'reliability' ||
    impactArea === 'performance' ||
    impactArea === 'maintainability' ||
    impactArea === 'operability'
    ? impactArea
    : undefined;
}

function normalizeCatastrophic(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function severityFromLegacyImpact(value: unknown): AuditSeverity | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value >= 0) {
    return undefined;
  }

  if (value <= -15) {
    return 'CRITICAL';
  }

  if (value <= -6) {
    return 'WARNING';
  }

  return 'OPTIMIZATION';
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

function normalizeAuditFinding(value: unknown): AuditFinding | null {
  if (typeof value === 'string' && value.trim()) {
    const text = cleanListLine(value);
    return text ? { text } : null;
  }

  const record = asRecord(value);
  if (!record || typeof record.text !== 'string' || !record.text.trim()) {
    return null;
  }

  const rawFindingId = record.findingId ?? record.finding_id ?? record.deductionId ?? record.deduction_id;
  const findingId = typeof rawFindingId === 'string' && rawFindingId.trim()
    ? rawFindingId.trim()
    : undefined;
  const severity = normalizeSeverity(record.severity) ?? severityFromLegacyImpact(record.impactScore ?? record.impact_score);
  const penalty = severity ? normalizePenalty(record.penalty, severity) : undefined;
  const scope = typeof record.scope === 'string' && record.scope.trim() ? record.scope.trim() : undefined;
  const location = typeof record.location === 'string' && record.location.trim() ? record.location.trim() : undefined;
  const isCatastrophic = normalizeCatastrophic(record.isCatastrophic ?? record.is_catastrophic);
  const impactArea = normalizeImpactArea(record.impactArea ?? record.impact_area);
  const text = cleanListLine(record.text);

  if (!text) {
    return null;
  }

  return {
    text,
    ...(findingId !== undefined ? { findingId } : {}),
    ...(severity !== undefined ? { severity } : {}),
    ...(penalty !== undefined ? { penalty } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(isCatastrophic !== undefined ? { isCatastrophic } : {}),
    ...(impactArea !== undefined ? { impactArea } : {}),
  };
}

export function normalizeAuditFindings(value: unknown): AuditFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value.flatMap((item) => {
    const finding = normalizeAuditFinding(item);
    const identity = finding?.text.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    if (!finding || !identity || seen.has(identity)) {
      return [];
    }

    seen.add(identity);
    return [finding];
  });
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
        scores.push(Math.max(0, Math.min(AUDIT_SCORE_CEILING, Math.round(score))));
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
      return Math.max(0, Math.min(AUDIT_SCORE_CEILING, Number.parseInt(match[1], 10)));
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

function getFindingItems(
  sources: Record<string, unknown>[],
  keys: readonly string[],
  fallbackItems: string[]
): AuditFinding[] {
  const detailContainerKeys = ['audit_findings', 'auditFindings', 'finding_impacts', 'findingImpacts'];

  for (const source of sources) {
    for (const containerKey of detailContainerKeys) {
      const details = asRecord(source[containerKey]) ?? parseJsonRecord(source[containerKey]);
      if (!details) {
        continue;
      }

      for (const key of keys) {
        const findings = normalizeAuditFindings(details[key]);
        if (findings.length > 0) {
          return findings;
        }
      }
    }

    for (const key of keys) {
      const findings = normalizeAuditFindings(source[key]);
      if (findings.length > 0) {
        return findings;
      }
    }
  }

  return fallbackItems.map((text) => ({ text }));
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

  const strengths = getItems(
    sources,
    ['strengths', 'pros', 'systemic_strengths', 'systemicStrengths'],
    'strengths',
    reportTexts
  );
  const normalizedRecommendations =
    recommendations.length > 0 || !reportTexts.some((text) => /growth areas/i.test(text))
      ? recommendations
      : weaknesses;

  return {
    score: getScore(sources, reportTexts),
    summary: getSummary(sources, reportTexts),
    strengths,
    weaknesses,
    recommendations: normalizedRecommendations,
    findings: {
      strengths: getFindingItems(
        sources,
        ['strengths', 'pros', 'systemic_strengths', 'systemicStrengths'],
        strengths
      ),
      weaknesses: getFindingItems(
        sources,
        ['weaknesses', 'cons', 'systemic_weaknesses', 'systemicWeaknesses', 'structural_vulnerabilities'],
        weaknesses
      ),
      recommendations: getFindingItems(
        sources,
        ['recommendations', 'strategicRecommendations', 'strategic_recommendations', 'actionable_recommendations'],
        normalizedRecommendations
      ),
    },
  };
}
