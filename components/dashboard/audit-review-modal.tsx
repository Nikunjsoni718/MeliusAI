'use client';

import { useEffect, useState } from 'react';

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

function cleanAuditLine(value: string) {
  return value
    .replace(/^[-*•\s]+/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function cleanDescriptionBlock(value: string) {
  return value
    .split('\n')
    .map((line) => cleanAuditLine(line.replace(/^[\s/]+/, '')))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseAuditLines(value: string, blockedLabel: string) {
  return value
    .split('\n')
    .map(cleanAuditLine)
    .filter((line) => line.length > 0 && !line.toLowerCase().includes(blockedLabel));
}

function getMarkdownSection(rawText: string, headingPattern: RegExp) {
  const match = rawText.match(headingPattern);

  if (!match || typeof match.index !== 'number') {
    return '';
  }

  const contentStart = match.index + match[0].length;
  const remainingContent = rawText.slice(contentStart);
  const nextHeading = remainingContent.match(/\n\s*##\s+/);

  return nextHeading && typeof nextHeading.index === 'number'
    ? remainingContent.slice(0, nextHeading.index).trim()
    : remainingContent.trim();
}

function getLegacyTableColumns(rawText: string) {
  const tableLines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('|') && !/^\|?[\s|:-]+\|?$/.test(line));

  if (tableLines.length < 2) {
    return {
      leftSideGoods: [] as string[],
      rightSideBads: [] as string[],
    };
  }

  const rows = tableLines.map((line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean)
  );
  const headerCells = rows[0].map((cell) => cell.toLowerCase());
  const goodsIndex = headerCells.findIndex((cell) => /good|strength|positive|asset|win|roadmap/.test(cell));
  const badsIndex = headerCells.findIndex((cell) => /bad|flaw|issue|risk|weak|vulnerab/.test(cell));
  const dataRow = rows.find((row, index) => index > 0 && row.some((cell) => !/^:?-{2,}:?$/.test(cell)));

  if (!dataRow) {
    return {
      leftSideGoods: [] as string[],
      rightSideBads: [] as string[],
    };
  }

  if (goodsIndex >= 0 || badsIndex >= 0) {
    return {
      leftSideGoods:
        goodsIndex >= 0
          ? dataRow[goodsIndex]?.split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean) ?? []
          : [],
      rightSideBads:
        badsIndex >= 0
          ? dataRow[badsIndex]?.split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean) ?? []
          : [],
    };
  }

  if (dataRow.length >= 2 && !/evaluation criteria|assigned grade/i.test(tableLines[0])) {
    return {
      leftSideGoods: dataRow[0].split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean),
      rightSideBads: dataRow[1].split(/<br\s*\/?>/i).map(cleanAuditLine).filter(Boolean),
    };
  }

  return {
    leftSideGoods: [] as string[],
    rightSideBads: [] as string[],
  };
}

function parseAuditReport(rawText: string) {
  let cleanDescriptionText = 'No asset description compiled yet.';
  let leftSideGoods: string[] = [];
  let rightSideBads: string[] = [];

  if (rawText.includes('[DESCRIPTION]') || rawText.includes('[GOODS]')) {
    const descBlock = rawText.match(/\[DESCRIPTION\]([\s\S]*?)(?=\[GOODS\]|$)/i);
    const goodsBlock = rawText.match(/\[GOODS\]([\s\S]*?)(?=\[BADS\]|$)/i);
    const badsBlock = rawText.match(/\[BADS\]([\s\S]*?)$/i);

    if (descBlock) {
      cleanDescriptionText = cleanDescriptionBlock(descBlock[1]);
    }

    if (goodsBlock) {
      leftSideGoods = parseAuditLines(goodsBlock[1], 'goods');
    }

    if (badsBlock) {
      rightSideBads = parseAuditLines(badsBlock[1], 'bads');
    }
  } else {
    const legacyDescription =
      getMarkdownSection(
        rawText,
        /##\s*(?:[^\w\n#]+\s*)?(?:executive\s+summary\s*\/\s*updated\s+description|updated\s+description|description)\s*/i
      ) || rawText.match(/\/\s*Updated Description([\s\S]*?)(?=##|$)/i)?.[1];
    const legacyGoods = getMarkdownSection(
      rawText,
      /##\s*(?:[^\w\n#]+\s*)?(?:strategic\s+positives(?:\s*&\s*roadmap)?|strategic\s+improvement\s+roadmap|goods?|strengths?)\s*/i
    );
    const legacyBads = getMarkdownSection(
      rawText,
      /##\s*(?:[^\w\n#]+\s*)?(?:technical\s+flaws(?:\s*&\s*bad\s+points)?|bad\s+points|bads?|flaws?|issues?|vulnerabilities?)\s*/i
    );
    const tableColumns = getLegacyTableColumns(rawText);

    if (legacyDescription) {
      cleanDescriptionText = cleanDescriptionBlock(legacyDescription);
    } else if (rawText.trim() && !rawText.includes('|')) {
      cleanDescriptionText = cleanDescriptionBlock(rawText);
    }

    leftSideGoods = parseAuditLines(legacyGoods, 'goods');
    rightSideBads = parseAuditLines(legacyBads, 'bads');

    if (leftSideGoods.length === 0) {
      leftSideGoods = tableColumns.leftSideGoods;
    }

    if (rightSideBads.length === 0) {
      rightSideBads = tableColumns.rightSideBads;
    }

    if (leftSideGoods.length === 0 || rightSideBads.length === 0) {
      const genericBulletLines = rawText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^[-*•]\s+/.test(line));

      if (leftSideGoods.length === 0) {
        leftSideGoods = genericBulletLines
          .filter((line) => !/bad|flaw|risk|issue|weak|vulnerab/i.test(line))
          .map(cleanAuditLine)
          .filter(Boolean);
      }

      if (rightSideBads.length === 0) {
        rightSideBads = genericBulletLines
          .filter((line) => /bad|flaw|risk|issue|weak|vulnerab/i.test(line))
          .map(cleanAuditLine)
          .filter(Boolean);
      }
    }
  }

  return {
    cleanDescriptionText: cleanDescriptionText || 'No asset description compiled yet.',
    leftSideGoods,
    rightSideBads,
  };
}

type StructuredAuditData = {
  id?: string | null;
  score?: number | null;
  evaluation_score?: number | null;
  logic_score?: number | null;
  ai_summary?: string | null;
  user_description?: string | null;
  audit_summary?: string | null;
  description?: string | null;
  executive_summary?: string | null;
  summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  has_been_audited?: boolean | null;
};

interface AuditReviewModalProps {
  assetTitle: string;
  projectId?: string | null;
  id?: string | null;
  onClose: () => void;
  onOpenFullFocus: () => void;
  reportText: string;
  auditData?: StructuredAuditData | null;
}

function getStructuredItems(value?: string[] | null) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && Boolean(item.trim())) : [];
}

function getStructuredSummary(auditData?: StructuredAuditData | null) {
  const storedSummary =
    auditData?.ai_summary?.trim() ||
    auditData?.user_description?.trim() ||
    auditData?.audit_summary?.trim() ||
    auditData?.executive_summary?.trim() ||
    auditData?.summary?.trim() ||
    auditData?.description?.trim() ||
    '';

  return storedSummary
    .replace(/^\s*#{1,6}\s*executive summary\s*/i, '')
    .split(/\n\s*(?:#{1,6}\s*)?(?:pros|strengths|cons|weaknesses|strategic recommendations|recommendations|scorecard)\b/i)[0]
    .trim();
}

export function AuditReviewModal({
  assetTitle,
  projectId,
  id,
  onClose,
  onOpenFullFocus,
  reportText,
  auditData,
}: AuditReviewModalProps) {
  const resolvedProjectId = projectId ?? id ?? auditData?.id ?? null;
  const [hydratedProjectId, setHydratedProjectId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [auditSummary, setAuditSummary] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [pros, setPros] = useState<string[] | null>(null);
  const [cons, setCons] = useState<string[] | null>(null);
  const [recommendations, setRecommendations] = useState<string[] | null>(null);
  const [hasBeenAudited, setHasBeenAudited] = useState<boolean | null>(null);

  useEffect(() => {
    if (!resolvedProjectId || !hasSupabaseBrowserEnv()) {
      return;
    }

    let active = true;

    const hydrateSavedAudit = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from('projects')
          .select('score, evaluation_score, logic_score, audit_summary, ai_summary, pros, cons, recommendations, has_been_audited')
          .eq('id', resolvedProjectId)
          .maybeSingle();

        if (!active) {
          return;
        }

        if (error) {
          console.error('Failed to hydrate saved MeliusAI audit report:', error);
          return;
        }

        if (!data) {
          return;
        }

        setHydratedProjectId(resolvedProjectId);
        setScore(data.score ?? data.evaluation_score ?? data.logic_score ?? null);
        setAuditSummary(data.audit_summary ?? null);
        setAiSummary(data.ai_summary ?? null);
        setPros(Array.isArray(data.pros) ? data.pros : []);
        setCons(Array.isArray(data.cons) ? data.cons : []);
        setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
        setHasBeenAudited(data.has_been_audited ?? false);
      } catch (error) {
        if (active) {
          console.error('Failed to hydrate saved MeliusAI audit report:', error);
        }
      }
    };

    void hydrateSavedAudit();

    return () => {
      active = false;
    };
  }, [resolvedProjectId]);

  const hasHydratedProject = Boolean(resolvedProjectId && hydratedProjectId === resolvedProjectId);
  const hydratedAuditData: StructuredAuditData = {
    ...(auditData ?? {}),
    score: hasHydratedProject
      ? score ?? auditData?.score ?? auditData?.evaluation_score ?? auditData?.logic_score ?? null
      : auditData?.score ?? auditData?.evaluation_score ?? auditData?.logic_score ?? null,
    audit_summary: hasHydratedProject ? auditSummary ?? auditData?.audit_summary ?? null : auditData?.audit_summary ?? null,
    ai_summary: hasHydratedProject ? aiSummary ?? auditData?.ai_summary ?? null : auditData?.ai_summary ?? null,
    pros: hasHydratedProject ? pros ?? auditData?.pros ?? null : auditData?.pros ?? null,
    cons: hasHydratedProject ? cons ?? auditData?.cons ?? null : auditData?.cons ?? null,
    recommendations: hasHydratedProject
      ? recommendations ?? auditData?.recommendations ?? null
      : auditData?.recommendations ?? null,
    has_been_audited: hasHydratedProject
      ? hasBeenAudited ?? auditData?.has_been_audited ?? null
      : auditData?.has_been_audited ?? null,
  };
  const hydratedReportText = hasHydratedProject ? auditSummary ?? aiSummary ?? reportText : reportText;
  const { cleanDescriptionText, leftSideGoods, rightSideBads } = parseAuditReport(hydratedReportText);
  const structuredSummary = getStructuredSummary(hydratedAuditData);
  const structuredPros = getStructuredItems(hydratedAuditData.pros);
  const structuredCons = getStructuredItems(hydratedAuditData.cons);
  const structuredRecommendations = getStructuredItems(hydratedAuditData.recommendations);
  const activeFile = {
    name: assetTitle,
    evaluated_score: hydratedAuditData.score ?? 0,
    executive_summary: structuredSummary || cleanDescriptionText || 'Audit complete. Review the insights below.',
    pros: structuredPros.length > 0 ? structuredPros : leftSideGoods,
    cons: structuredCons.length > 0 ? structuredCons : rightSideBads,
    recommendations: structuredRecommendations,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div style={{ background: '#0a0f1c', border: '1px solid #1a2332', borderRadius: '12px', padding: '24px', color: '#fff', width: '100%', maxWidth: '1200px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{activeFile.name}</h2>
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>{activeFile.name}</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ background: 'rgba(0, 210, 255, 0.1)', color: '#00d2ff', border: '1px solid rgba(0, 210, 255, 0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {activeFile.name.split('.').pop()} FILE
            </span>
            <button onClick={onOpenFullFocus} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }} type="button">Full Focus Mode</button>
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} type="button" aria-label="Close audit protocol">×</button>
          </div>
        </div>

        <div style={{ border: '1px solid #1a2332', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#00d2ff', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>AI Executive Summary</h3>
          <p style={{ margin: 0, color: '#ccc', fontSize: '14px', lineHeight: '1.6', wordWrap: 'break-word', whiteSpace: 'normal' }}>
            {activeFile.executive_summary || 'Audit complete. Review the insights below.'}
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <button style={{ background: 'transparent', border: '1px solid #00d2ff', color: '#00d2ff', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }} type="button">
            Verify with MeliusAI
          </button>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
          <div style={{ flex: '0 0 200px', border: '1px solid #1a2332', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '30px' }}>
            <svg viewBox="0 0 36 36" style={{ width: '100%', maxWidth: '120px', height: 'auto' }}>
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1a2332" strokeWidth="4" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00d2ff" strokeWidth="4" strokeDasharray={`${activeFile.evaluated_score || 0}, 100`} />
              <text x="18" y="20.5" style={{ fill: '#fff', fontSize: '10px', fontWeight: 'bold', textAnchor: 'middle' }}>{activeFile.evaluated_score || 0}</text>
              <text x="18" y="26" style={{ fill: '#666', fontSize: '4px', textAnchor: 'middle' }}>/ 100</text>
            </svg>
          </div>

          {/* Box 2: Strengths */}
          <div style={{ flex: 1, border: '1px solid #1a2332', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#00ff88', textShadow: '0 0 10px rgba(0, 255, 136, 0.4)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Strengths</h3>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#ccc', fontSize: '13px', lineHeight: '1.6', listStyleType: 'disc' }}>
              {activeFile.pros?.map((item: string, i: number) => <li key={i} style={{ marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'normal', paddingLeft: '4px' }}>{item}</li>)}
            </ul>
          </div>

          {/* Box 3: Weaknesses */}
          <div style={{ flex: 1, border: '1px solid #1a2332', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#ff4444', textShadow: '0 0 10px rgba(255, 68, 68, 0.4)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Weaknesses</h3>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#ccc', fontSize: '13px', lineHeight: '1.6', listStyleType: 'disc' }}>
              {activeFile.cons?.map((item: string, i: number) => <li key={i} style={{ marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'normal', paddingLeft: '4px' }}>{item}</li>)}
            </ul>
          </div>

          {/* Box 4: Recommendations */}
          <div style={{ flex: 1, border: '1px solid #1a2332', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#00d2ff', textShadow: '0 0 10px rgba(0, 210, 255, 0.4)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Recommendations</h3>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#ccc', fontSize: '13px', lineHeight: '1.6', listStyleType: 'disc' }}>
              {activeFile.recommendations?.map((item: string, i: number) => <li key={i} style={{ marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'normal', paddingLeft: '4px' }}>{item}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
