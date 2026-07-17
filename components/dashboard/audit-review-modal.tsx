'use client';

import { useEffect, useState } from 'react';

import { ShareScoreModal } from '@/components/dashboard/share-score-modal';
import {
  getMotivationalBannerClassName,
  getMotivationalMessage,
} from '@/lib/audit-motivation';
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
  previous_score?: number | null;
  last_improved_summary?: string | null;
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
  onReAudit?: () => void;
  isReAuditing?: boolean;
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
  onReAudit,
  isReAuditing = false,
  reportText,
  auditData,
}: AuditReviewModalProps) {
  const resolvedProjectId = projectId ?? id ?? auditData?.id ?? null;
  const [hydratedProjectId, setHydratedProjectId] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [lastImprovedSummary, setLastImprovedSummary] = useState<string | null>(null);
  const [auditSummary, setAuditSummary] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [pros, setPros] = useState<string[] | null>(null);
  const [cons, setCons] = useState<string[] | null>(null);
  const [recommendations, setRecommendations] = useState<string[] | null>(null);
  const [hasBeenAudited, setHasBeenAudited] = useState<boolean | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

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
          .select('score, evaluation_score, logic_score, previous_score, last_improved_summary, audit_summary, ai_summary, pros, cons, recommendations, has_been_audited')
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
        setPreviousScore(data.previous_score ?? null);
        setLastImprovedSummary(data.last_improved_summary ?? null);
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
    previous_score: hasHydratedProject
      ? previousScore ?? auditData?.previous_score ?? null
      : auditData?.previous_score ?? null,
    last_improved_summary: hasHydratedProject
      ? lastImprovedSummary ?? auditData?.last_improved_summary ?? null
      : auditData?.last_improved_summary ?? null,
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
  const isFile = activeFile?.name?.includes('.');
  const badgeText = isFile ? `${activeFile.name.split('.').pop()} FILE`.toUpperCase() : 'PROJECT FOLDER';
  const comparisonSummary = hydratedAuditData.last_improved_summary?.trim() || '';
  const normalizedPreviousScore =
    typeof hydratedAuditData.previous_score === 'number' && Number.isFinite(hydratedAuditData.previous_score)
      ? Math.round(hydratedAuditData.previous_score)
      : null;
  const scoreDelta =
    normalizedPreviousScore === null
      ? null
      : Math.round(activeFile.evaluated_score) - normalizedPreviousScore;
  const currentScore = Math.max(0, Math.min(100, Math.round(activeFile.evaluated_score)));

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      {/* Unified Main Container - Polished Wide Version */}
      <div style={{ background: '#0a0f1c', border: '1px solid #1a2332', borderRadius: '12px', padding: '30px', color: '#fff', width: '90%', maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{activeFile.name}</h2>
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
              {isFile ? activeFile.name : 'Project Directory Audit'}
            </p>
          </div>
          
          {/* Top Right Button Group */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ background: 'rgba(0, 210, 255, 0.1)', color: '#00d2ff', border: '1px solid rgba(0, 210, 255, 0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              {badgeText}
            </span>
            
            {isFile && (
              <button 
                onClick={onOpenFullFocus} 
                style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Full Focus Mode
              </button>
            )}
            
            <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        <div
          role="status"
          className={`mb-5 rounded-xl border px-5 py-4 ${getMotivationalBannerClassName(currentScore)}`}
        >
          <p className="m-0 text-sm font-medium leading-6">
            {getMotivationalMessage(currentScore)}
          </p>
        </div>

        {comparisonSummary ? (
          <section className="mb-5 rounded-xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/10 via-cyan-500/[0.07] to-transparent p-5 shadow-[0_0_28px_rgba(16,185,129,0.08)]">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-xs text-emerald-300">
                ↗
              </span>
              <h3 className="m-0 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                Version Improvement
              </h3>
            </div>
            <p className="mb-0 mt-3 text-sm leading-relaxed text-slate-200">{comparisonSummary}</p>
          </section>
        ) : null}

        {/* AI Executive Summary Box */}
        <div style={{ border: '1px solid #1a2332', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#00d2ff', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>AI Executive Summary</h3>
          <p style={{ margin: 0, color: '#ccc', fontSize: '14px', lineHeight: '1.6', wordWrap: 'break-word', whiteSpace: 'normal' }}>
            {activeFile.executive_summary || "Audit complete. Review the insights below."}
          </p>
        </div>

        {/* Share and Re-Audit Button Row */}
        <div className="mb-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            disabled={!resolvedProjectId}
            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Share your ${currentScore} out of 100 MeliusAI audit score`}
          >
            Share Score
          </button>

          {onReAudit ? (
            <button
              type="button"
              onClick={onReAudit}
              disabled={isReAuditing}
              className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600"
            >
              {isReAuditing ? 'Re-Auditing via GPT Engine...' : 'Re-Audit with MeliusAI'}
            </button>
          ) : null}
        </div>

        {/* 4-Column Bottom Grid */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
          
          <div style={{ flex: '0 0 200px', border: '1px solid #1a2332', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '30px' }}>
            <svg viewBox="0 0 36 36" style={{ width: '100%', maxWidth: '120px', height: 'auto' }}>
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1a2332" strokeWidth="4" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00d2ff" strokeWidth="4" strokeDasharray={`${activeFile.evaluated_score || 0}, 100`} />
              <text x="18" y="20.5" style={{ fill: '#fff', fontSize: '10px', fontWeight: 'bold', textAnchor: 'middle' }}>{activeFile.evaluated_score || 0}</text>
              <text x="18" y="26" style={{ fill: '#666', fontSize: '4px', textAnchor: 'middle' }}>/ 100</text>
            </svg>
            {scoreDelta !== null ? (
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide ${
                  scoreDelta > 0
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                    : scoreDelta < 0
                      ? 'border-rose-400/30 bg-rose-400/10 text-rose-300'
                      : 'border-slate-700 bg-slate-800/70 text-slate-300'
                }`}
                title={`Previous score: ${normalizedPreviousScore}/100`}
              >
                {scoreDelta > 0 ? '▲ +' : scoreDelta < 0 ? '▼ ' : '• '}
                {scoreDelta} Points
              </span>
            ) : null}
          </div>

          <div style={{ flex: 1, border: '1px solid #1a2332', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#00ff88', textShadow: '0 0 10px rgba(0, 255, 136, 0.4)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Strengths</h3>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#ccc', fontSize: '13px', lineHeight: '1.6', listStyleType: 'disc' }}>
              {activeFile.pros?.map((item: string, i: number) => <li key={i} style={{ marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'normal', paddingLeft: '4px' }}>{item}</li>)}
            </ul>
          </div>

          <div style={{ flex: 1, border: '1px solid #1a2332', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#ff4444', textShadow: '0 0 10px rgba(255, 68, 68, 0.4)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Weaknesses</h3>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#ccc', fontSize: '13px', lineHeight: '1.6', listStyleType: 'disc' }}>
              {activeFile.cons?.map((item: string, i: number) => <li key={i} style={{ marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'normal', paddingLeft: '4px' }}>{item}</li>)}
            </ul>
          </div>

          <div style={{ flex: 1, border: '1px solid #1a2332', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#00d2ff', textShadow: '0 0 10px rgba(0, 210, 255, 0.4)', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Recommendations</h3>
            <ul style={{ margin: 0, paddingLeft: '16px', color: '#ccc', fontSize: '13px', lineHeight: '1.6', listStyleType: 'disc' }}>
              {activeFile.recommendations?.map((item: string, i: number) => <li key={i} style={{ marginBottom: '10px', wordWrap: 'break-word', whiteSpace: 'normal', paddingLeft: '4px' }}>{item}</li>)}
            </ul>
          </div>

        </div>

        {isShareModalOpen && resolvedProjectId ? (
          <ShareScoreModal
            assetId={resolvedProjectId}
            score={currentScore}
            onClose={() => setIsShareModalOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
