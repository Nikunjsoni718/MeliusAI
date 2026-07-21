'use client';

import { useEffect, useRef, useState } from 'react';

import { ShareScoreModal } from '@/components/dashboard/share-score-modal';
import {
  getMotivationalBannerClassName,
  getMotivationalMessage,
} from '@/lib/audit-motivation';
import {
  AUDIT_CAPTURE_TARGET_ID,
  downloadFullAuditReport,
} from '@/lib/download-audit-report';
import { normalizeAuditReport } from '@/lib/audit-report-normalizer';
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

export type AuditAsset = {
  kind: 'file' | 'folder';
  id: string | null;
  name: string;
  score?: number | string | null;
  executiveSummary?: string | null;
  strengths?: string[] | string | null;
  weaknesses?: string[] | string | null;
  recommendations?: string[] | string | null;
  reportText?: string | null;
  previousScore?: number | null;
  lastImprovedSummary?: string | null;
  hasBeenAudited?: boolean | null;
};

interface AuditReviewModalProps {
  asset: AuditAsset;
  onClose: () => void;
  onOpenFullFocus?: () => void;
  onReAudit?: () => void;
  isReAuditing?: boolean;
}

export function FeedbackBanner({ score }: { score: number }) {
  return (
    <div
      role="status"
      className={`mb-5 rounded-xl border px-5 py-4 ${getMotivationalBannerClassName(score)}`}
    >
      <p className="m-0 text-sm font-medium leading-6">{getMotivationalMessage(score)}</p>
    </div>
  );
}

export function ScoreGauge({ score, previousScore = null }: { score: number; previousScore?: number | null }) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const normalizedPreviousScore =
    typeof previousScore === 'number' && Number.isFinite(previousScore)
      ? Math.max(0, Math.min(100, Math.round(previousScore)))
      : null;
  const scoreDelta = normalizedPreviousScore === null ? null : normalizedScore - normalizedPreviousScore;

  return (
    <section className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border border-[#1a2332] p-6">
      <svg viewBox="0 0 36 36" className="h-auto w-full max-w-[120px]" aria-label={`${normalizedScore} out of 100`}>
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          pathLength="100"
          stroke="#1a2332"
          strokeWidth="4"
        />
        <path
          data-audit-score-arc="svg"
          data-score={normalizedScore}
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          pathLength="100"
          shapeRendering="geometricPrecision"
          stroke="#00d2ff"
          strokeDasharray={`${normalizedScore} ${100 - normalizedScore}`}
          strokeDashoffset="0"
          strokeLinecap="round"
          strokeWidth="4"
          style={{ animation: 'none', opacity: 1, transition: 'none', visibility: 'visible' }}
        />
        <text x="18" y="20.5" className="fill-white text-[10px] font-bold" textAnchor="middle">
          {normalizedScore}
        </text>
        <text x="18" y="26" className="fill-[#666] text-[4px]" textAnchor="middle">
          / 100
        </text>
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
    </section>
  );
}

export function AuditMetricCard({
  emptyText,
  items,
  title,
  tone,
}: {
  emptyText: string;
  items: string[];
  title: string;
  tone: 'emerald' | 'rose' | 'cyan';
}) {
  const titleClasses = {
    emerald: 'text-[#00ff88] [text-shadow:0_0_10px_rgba(0,255,136,0.4)]',
    rose: 'text-[#ff4444] [text-shadow:0_0_10px_rgba(255,68,68,0.4)]',
    cyan: 'text-[#00d2ff] [text-shadow:0_0_10px_rgba(0,210,255,0.4)]',
  };

  return (
    <section className="min-h-56 rounded-lg border border-[#1a2332] p-5">
      <h3 className={`m-0 mb-[15px] text-xs font-bold uppercase tracking-[1px] ${titleClasses[tone]}`}>
        {title}
      </h3>
      <ul className="m-0 list-disc space-y-2.5 pl-4 text-[13px] leading-relaxed text-[#ccc]">
        {items.length > 0 ? (
          items.map((item, index) => (
            <li key={`${title}-${index}`} className="break-words pl-1">
              {item}
            </li>
          ))
        ) : (
          <li className="list-none italic text-slate-500">{emptyText}</li>
        )}
      </ul>
    </section>
  );
}

function getStructuredItems(value?: string[] | null) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && Boolean(item.trim())) : [];
}

function getStructuredSummary(auditData?: StructuredAuditData | null) {
  const storedSummary =
    auditData?.ai_summary?.trim() ||
    auditData?.audit_summary?.trim() ||
    auditData?.user_description?.trim() ||
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
  asset,
  onClose,
  onOpenFullFocus,
  onReAudit,
  isReAuditing = false,
}: AuditReviewModalProps) {
  const resolvedProjectId = asset.id;
  const normalizedAsset = normalizeAuditReport({
    score: asset.score,
    executiveSummary: asset.executiveSummary,
    strengths: asset.strengths,
    weaknesses: asset.weaknesses,
    recommendations: asset.recommendations,
    reportText: asset.reportText,
  });
  const assetAuditData: StructuredAuditData = {
    id: asset.id,
    score: normalizedAsset.score,
    previous_score: asset.previousScore ?? null,
    last_improved_summary: asset.lastImprovedSummary ?? null,
    ai_summary: normalizedAsset.summary || asset.executiveSummary || null,
    audit_summary: normalizedAsset.summary || asset.executiveSummary || null,
    pros: normalizedAsset.strengths,
    cons: normalizedAsset.weaknesses,
    recommendations: normalizedAsset.recommendations,
    has_been_audited: asset.hasBeenAudited ?? null,
  };
  const assetReportText = asset.reportText?.trim() || asset.executiveSummary?.trim() || '';
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
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const auditCaptureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (asset.kind === 'folder' || !resolvedProjectId || !hasSupabaseBrowserEnv()) {
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
        setPreviousScore(null);
        setLastImprovedSummary(null);
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
  }, [asset.kind, resolvedProjectId]);

  const hasHydratedProject = Boolean(
    asset.kind === 'file' && resolvedProjectId && hydratedProjectId === resolvedProjectId
  );
  const hydratedAuditData: StructuredAuditData = {
    ...assetAuditData,
    score: assetAuditData.score ?? (hasHydratedProject ? score : null),
    previous_score:
      assetAuditData.previous_score ?? (hasHydratedProject ? previousScore : null),
    last_improved_summary:
      assetAuditData.last_improved_summary ?? (hasHydratedProject ? lastImprovedSummary : null),
    audit_summary:
      assetAuditData.audit_summary || (hasHydratedProject ? auditSummary : null),
    ai_summary: assetAuditData.ai_summary || (hasHydratedProject ? aiSummary : null),
    pros:
      assetAuditData.pros?.length
        ? assetAuditData.pros
        : hasHydratedProject
          ? pros
          : assetAuditData.pros,
    cons:
      assetAuditData.cons?.length
        ? assetAuditData.cons
        : hasHydratedProject
          ? cons
          : assetAuditData.cons,
    recommendations:
      assetAuditData.recommendations?.length
        ? assetAuditData.recommendations
        : hasHydratedProject
          ? recommendations
          : assetAuditData.recommendations,
    has_been_audited:
      assetAuditData.has_been_audited ?? (hasHydratedProject ? hasBeenAudited : null),
  };
  const hydratedReportText =
    assetReportText || (hasHydratedProject ? auditSummary ?? aiSummary ?? '' : '');
  const { cleanDescriptionText, leftSideGoods, rightSideBads } = parseAuditReport(hydratedReportText);
  const structuredSummary = getStructuredSummary(hydratedAuditData);
  const structuredPros = getStructuredItems(hydratedAuditData.pros);
  const structuredCons = getStructuredItems(hydratedAuditData.cons);
  const structuredRecommendations = getStructuredItems(hydratedAuditData.recommendations);
  const activeFile = {
    name: asset.name,
    evaluated_score: hydratedAuditData.score ?? 0,
    executive_summary:
      hydratedAuditData.ai_summary?.trim() ||
      hydratedAuditData.audit_summary?.trim() ||
      structuredSummary ||
      cleanDescriptionText ||
      'Audit complete. Review the insights below.',
    pros: hydratedAuditData.pros?.length ? hydratedAuditData.pros : structuredPros.length > 0 ? structuredPros : leftSideGoods,
    cons: hydratedAuditData.cons?.length ? hydratedAuditData.cons : structuredCons.length > 0 ? structuredCons : rightSideBads,
    recommendations: hydratedAuditData.recommendations?.length ? hydratedAuditData.recommendations : structuredRecommendations,
  };
  const isFile = asset.kind === 'file';
  const badgeText = `${activeFile.name.split('.').pop()} FILE`.toUpperCase();
  const comparisonSummary = hydratedAuditData.last_improved_summary?.trim() || '';
  const normalizedPreviousScore =
    typeof hydratedAuditData.previous_score === 'number' && Number.isFinite(hydratedAuditData.previous_score)
      ? Math.round(hydratedAuditData.previous_score)
      : null;
  const currentScore = Math.max(0, Math.min(100, Math.round(activeFile.evaluated_score)));

  async function handleDownloadFullReport() {
    if (!auditCaptureRef.current || isDownloadingReport) {
      return;
    }

    setIsDownloadingReport(true);
    setDownloadFeedback(null);

    try {
      await downloadFullAuditReport(auditCaptureRef.current, asset.name);
      setDownloadFeedback('Full audit report downloaded.');
    } catch (error) {
      console.error('Full audit report download failed:', error);
      setDownloadFeedback('The full report could not be downloaded. Please try again.');
    } finally {
      setIsDownloadingReport(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      {/* Unified Main Container - Polished Wide Version */}
      <div
        id={AUDIT_CAPTURE_TARGET_ID}
        ref={auditCaptureRef}
        style={{ background: '#000000', border: '1px solid #1a2332', borderRadius: '12px', padding: '30px', color: '#fff', width: '90%', maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        
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
            {isFile ? (
              <span style={{ background: 'rgba(0, 210, 255, 0.1)', color: '#00d2ff', border: '1px solid rgba(0, 210, 255, 0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {badgeText}
              </span>
            ) : null}
            
            {isFile && onOpenFullFocus ? (
              <button
                data-image-export-ignore="true"
                onClick={onOpenFullFocus} 
                style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Full Focus Mode
              </button>
            ) : null}
            
            <button data-image-export-ignore="true" onClick={onClose} style={{ background: 'transparent', border: '1px solid #333', color: '#fff', width: '30px', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        <FeedbackBanner score={currentScore} />

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

          {/* Share and Re-Audit Button Row */}
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#1a2332] pt-4" data-image-export-ignore="true">
          <button
            type="button"
            onClick={() => void handleDownloadFullReport()}
            disabled={isDownloadingReport}
            className="inline-flex items-center rounded-full border border-cyan-400/50 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.12)] transition hover:border-cyan-300 hover:bg-cyan-500/30 disabled:cursor-wait disabled:opacity-60"
          >
            {isDownloadingReport ? 'Preparing Full Report...' : 'Download Full Report'}
          </button>

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

          {downloadFeedback ? (
            <p
              className="mb-0 mt-3 text-right text-xs text-slate-400"
              role="status"
              aria-live="polite"
              data-image-export-ignore="true"
            >
              {downloadFeedback}
            </p>
          ) : null}
        </div>

        {/* 4-Column Bottom Grid */}
        <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <ScoreGauge score={currentScore} previousScore={normalizedPreviousScore} />
          <AuditMetricCard
            title="Strengths"
            tone="emerald"
            items={activeFile.pros ?? []}
            emptyText="No strengths generated yet."
          />
          <AuditMetricCard
            title="Weaknesses"
            tone="rose"
            items={activeFile.cons ?? []}
            emptyText="No weaknesses generated yet."
          />
          <AuditMetricCard
            title="Recommendations"
            tone="cyan"
            items={activeFile.recommendations ?? []}
            emptyText="No recommendations generated yet."
          />
        </div>

        {isShareModalOpen && resolvedProjectId ? (
          <ShareScoreModal
            score={currentScore}
            onClose={() => setIsShareModalOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
