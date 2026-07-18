'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { ShareScoreModal } from '@/components/dashboard/share-score-modal';
import {
  getMotivationalBannerClassName,
  getMotivationalMessage,
} from '@/lib/audit-motivation';
import {
  AUDIT_CAPTURE_TARGET_ID,
  downloadFullAuditReport,
} from '@/lib/download-audit-report';

const officeViewerExtensions = new Set(['ppt', 'pptx', 'xls', 'xlsx', 'doc', 'docx']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif']);
const videoExtensions = new Set(['mp4', 'mov', 'webm', 'ogg', 'mkv']);
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const auditTextFileExtensions = new Set([
  'c',
  'cc',
  'cjs',
  'cpp',
  'cs',
  'css',
  'cxx',
  'dart',
  'ex',
  'exs',
  'go',
  'h',
  'hpp',
  'hs',
  'htm',
  'html',
  'ipynb',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'kts',
  'lua',
  'm',
  'md',
  'mjs',
  'mm',
  'php',
  'pl',
  'py',
  'r',
  'rb',
  'rs',
  'scala',
  'scss',
  'sh',
  'sql',
  'svelte',
  'swift',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

type PreviewProject = {
  id?: string;
  name?: string | null;
  title?: string;
  file_name?: string | null;
  file_url?: string | null;
  preview_url?: string | null;
  file_extension?: string | null;
  mime_type?: string | null;
  file_type?: string | null;
  user_description?: string | null;
  bio?: string | null;
  raw_text?: string | null;
  text_preview?: string | null;
  description?: string | null;
  executive_summary?: string | null;
  summary?: string | null;
  ai_summary?: string | null;
  audit_summary?: string | null;
  score?: number | null;
  evaluation_score?: number | null;
  logic_score?: number | null;
  previous_score?: number | null;
  last_improved_summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
};

type AssetPreviewModalProps = {
  activePreviewName: string | null;
  activePreviewUrl: string | null;
  canVerify?: boolean;
  previewProject?: PreviewProject | null;
  onProjectUpdated?: (projectId: string, projectPatch: Partial<PreviewProject>) => void;
  onClose: () => void;
};

type VerifyAssetResponse = {
  success?: boolean;
  error?: string;
  report?: {
    calculatedScore?: number;
    score?: number;
    ai_summary?: string;
    user_description?: string;
    executiveSummary?: string;
    pros?: string[];
    cons?: string[];
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string[];
    strategicRecommendations?: string[];
    last_improved_summary?: string;
  };
  project?: PreviewProject;
  reportText?: string;
  ai_summary?: string;
  user_description?: string;
  description?: string;
  executive_summary?: string;
  summary?: string;
  score?: number;
  previous_score?: number;
  last_improved_summary?: string;
  improvement_summary?: string;
  grade?: string;
  strengths?: string[];
  weaknesses?: string[];
  pros?: string[];
  cons?: string[];
  recommendations?: string[];
};

function getFileExtensionFromUrlOrName(previewUrl: string | null, fileName: string | null) {
  const fromName = fileName?.split('.').pop()?.trim().toLowerCase();

  if (fromName) {
    return fromName;
  }

  if (!previewUrl) {
    return '';
  }

  try {
    const url = new URL(previewUrl);
    return url.pathname.split('.').pop()?.trim().toLowerCase() ?? '';
  } catch {
    return previewUrl.split('?')[0]?.split('#')[0]?.split('.').pop()?.trim().toLowerCase() ?? '';
  }
}

function getViewerSrc(previewUrl: string | null, fileName: string | null) {
  if (!previewUrl) {
    return null;
  }

  const extension = getFileExtensionFromUrlOrName(previewUrl, fileName);

  if (officeViewerExtensions.has(extension)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewUrl)}`;
  }

  return previewUrl;
}

function getFallbackFileName(previewUrl: string | null) {
  if (!previewUrl) {
    return 'Asset Preview';
  }

  try {
    const url = new URL(previewUrl);
    return decodeURIComponent(url.pathname.split('/').pop() ?? 'Asset Preview') || 'Asset Preview';
  } catch {
    return decodeURIComponent(previewUrl.split('/').pop() ?? 'Asset Preview') || 'Asset Preview';
  }
}

function getPreviewExtension(previewUrl: string | null, fileName: string | null, project?: PreviewProject | null) {
  return (
    project?.file_extension?.trim().toLowerCase() ||
    getFileExtensionFromUrlOrName(previewUrl, fileName) ||
    project?.file_type?.trim().toLowerCase() ||
    ''
  );
}

function shouldForceUtf8CodeRead(previewUrl: string | null, fileName: string | null, project?: PreviewProject | null) {
  return auditTextFileExtensions.has(getPreviewExtension(previewUrl, fileName, project));
}

async function readRemoteTextAsUtf8(src: string) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('Unable to read code content.');
  }

  return response.text();
}

function getScore(project?: PreviewProject | null) {
  const score = project?.evaluation_score ?? project?.logic_score ?? project?.score ?? null;
  return typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
}

function getProjectBio(project?: PreviewProject | null) {
  return project?.user_description?.trim() || project?.bio?.trim() || '';
}

function getExecutiveSummaryText(project?: PreviewProject | null) {
  const storedSummary =
    project?.user_description?.trim() ||
    project?.ai_summary?.trim() ||
    project?.audit_summary?.trim() ||
    project?.executive_summary?.trim() ||
    project?.summary?.trim() ||
    '';
  let rawSummary = storedSummary;

  if (storedSummary.startsWith('{')) {
    try {
      const parsed = JSON.parse(storedSummary) as {
        ai_summary?: unknown;
        user_description?: unknown;
        executiveSummary?: unknown;
        summary?: unknown;
      };
      rawSummary =
        [parsed.ai_summary, parsed.user_description, parsed.executiveSummary, parsed.summary]
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
          ?.trim() || storedSummary;
    } catch {
      rawSummary = storedSummary;
    }
  }

  return rawSummary
    .replace(/^\s*#{1,6}\s*executive summary\s*/i, '')
    .split(/\n\s*(?:#{1,6}\s*)?(?:pros|strengths|cons|weaknesses|strategic recommendations|recommendations|scorecard)\b/i)[0]
    .trim();
}

function getProjectAssetText(project: PreviewProject | null | undefined, previewName: string) {
  return (
    project?.raw_text?.trim() ||
    project?.text_preview?.trim() ||
    project?.ai_summary?.trim() ||
    project?.description?.trim() ||
    project?.audit_summary?.trim() ||
    project?.file_name?.trim() ||
    previewName
  );
}

function getMetricItems(project: PreviewProject | null | undefined, kind: 'pros' | 'cons' | 'recommendations') {
  const directItems = getStringArray(project?.[kind]);

  if (directItems.length > 0) {
    return directItems;
  }

  return [];
}

function MetricList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'emerald' | 'rose' | 'cyan';
  items: string[];
}) {
  const toneClasses = {
    emerald: 'border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-300',
    rose: 'border-rose-500/15 bg-rose-500/[0.04] text-rose-300',
    cyan: 'border-cyan-500/15 bg-cyan-500/[0.04] text-cyan-300',
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em]">{title}</h4>
      <ul className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <li key={`${title}-${item}-${index}`} className="flex gap-2 text-xs leading-relaxed text-slate-300">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
              <span>{item}</span>
            </li>
          ))
        ) : (
          <li className="text-xs italic leading-relaxed text-slate-500">No entries generated yet.</li>
        )}
      </ul>
    </div>
  );
}

export function AssetPreviewModal({
  activePreviewName,
  activePreviewUrl,
  canVerify = true,
  previewProject,
  onProjectUpdated,
  onClose,
}: AssetPreviewModalProps) {
  const [isPortalMounted, setIsPortalMounted] = useState(false);
  const [liveProject, setLiveProject] = useState<PreviewProject | null>(previewProject ?? null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isExpandedViewer, setIsExpandedViewer] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const auditCaptureRef = useRef<HTMLDivElement | null>(null);
  const [textPreview, setTextPreview] = useState<{
    url: string | null;
    text: string | null;
    isLoading: boolean;
    error: string | null;
  }>({
    url: null,
    text: null,
    isLoading: false,
    error: null,
  });
  const previewName = activePreviewName ?? previewProject?.title ?? getFallbackFileName(activePreviewUrl);
  const viewerSrc = useMemo(
    () => getViewerSrc(activePreviewUrl, previewName),
    [activePreviewUrl, previewName]
  );
  const extension = getPreviewExtension(activePreviewUrl, previewName, liveProject);
  const shouldRenderTextPreview = shouldForceUtf8CodeRead(activePreviewUrl, previewName, liveProject);
  const projectTextPreview = liveProject?.raw_text?.trim() || liveProject?.text_preview?.trim() || null;
  const renderedTextPreview =
    projectTextPreview || (textPreview.url === activePreviewUrl ? textPreview.text : null);
  const score = getScore(liveProject);
  const lastImprovedSummary = liveProject?.last_improved_summary?.trim() || '';
  const previousScore =
    typeof liveProject?.previous_score === 'number' && Number.isFinite(liveProject.previous_score)
      ? Math.round(liveProject.previous_score)
      : null;
  const scoreDelta = previousScore === null ? null : score - previousScore;
  const pros = getMetricItems(liveProject, 'pros');
  const cons = getMetricItems(liveProject, 'cons');
  const recommendations = getMetricItems(liveProject, 'recommendations');
  const fileTypeBadge = extension ? `${extension.toUpperCase()} File` : 'Asset File';
  const executiveSummaryMarkdown =
    getExecutiveSummaryText(liveProject) ||
    "This project asset is awaiting verification. Click 'Verify with MeliusAI' to generate an intelligent executive summary.";

  useEffect(() => {
    setIsPortalMounted(true);
  }, []);

  useEffect(() => {
    setLiveProject(previewProject ?? null);
    setIsExpandedViewer(false);
    setIsShareModalOpen(false);
    setIsDownloadingReport(false);
    setDownloadFeedback(null);
  }, [previewProject]);

  useEffect(() => {
    if (!activePreviewUrl || !shouldRenderTextPreview) {
      setTextPreview({ url: null, text: null, isLoading: false, error: null });
      return;
    }

    if (projectTextPreview) {
      setTextPreview({ url: activePreviewUrl, text: projectTextPreview, isLoading: false, error: null });
      return;
    }

    let isActive = true;
    setTextPreview({ url: activePreviewUrl, text: null, isLoading: true, error: null });

    void readRemoteTextAsUtf8(activePreviewUrl)
      .then((text) => {
        if (isActive) {
          setTextPreview({ url: activePreviewUrl, text, isLoading: false, error: null });
        }
      })
      .catch(() => {
        if (isActive) {
          setTextPreview({
            url: activePreviewUrl,
            text: null,
            isLoading: false,
            error: 'Preview not available for this file yet.',
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [activePreviewUrl, projectTextPreview, shouldRenderTextPreview]);

  useEffect(() => {
    if (!activePreviewUrl) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isShareModalOpen) {
          setIsShareModalOpen(false);
          return;
        }

        setIsExpandedViewer(false);
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePreviewUrl, isShareModalOpen, onClose]);

  if (!isPortalMounted || !activePreviewUrl || !viewerSrc) {
    return null;
  }

  async function handleDownloadFullReport() {
    if (!auditCaptureRef.current || isDownloadingReport) {
      return;
    }

    setIsDownloadingReport(true);
    setDownloadFeedback(null);

    try {
      await downloadFullAuditReport(auditCaptureRef.current, liveProject?.title ?? previewName);
      setDownloadFeedback('Full audit report downloaded.');
    } catch (error) {
      console.error('Full audit report download failed:', error);
      setDownloadFeedback('The full report could not be downloaded. Please try again.');
    } finally {
      setIsDownloadingReport(false);
    }
  }

  async function handleRunAIVerification(projectId: string, event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!liveProject || isVerifying) {
      return;
    }

    setIsVerifying(true);

    try {
      if (!activePreviewUrl) {
        throw new Error('MeliusAI verification requires a file URL.');
      }

      const filename = liveProject.name || liveProject.title || liveProject.file_name || previewName;
      const response = await fetch('/api/verify-asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          fileUrl: activePreviewUrl,
          filename,
        }),
      });
      const data = (await response.json()) as VerifyAssetResponse;

      if (!response.ok) {
        throw new Error(data.error || 'MeliusAI verification failed.');
      }

      const report = data.report;
      const pythonScore = typeof data.score === 'number' ? data.score : undefined;
      const executiveSummary =
        data.ai_summary?.trim() ||
        report?.ai_summary?.trim() ||
        data.user_description?.trim() ||
        report?.user_description?.trim() ||
        report?.executiveSummary?.trim() ||
        data.project?.ai_summary?.trim() ||
        data.project?.user_description?.trim() ||
        data.project?.audit_summary?.trim() ||
        getExecutiveSummaryText(liveProject) ||
        '';
      const strengthsList = data.strengths ?? report?.strengths ?? data.pros ?? report?.pros ?? [];
      const weaknessesList = data.weaknesses ?? report?.weaknesses ?? data.cons ?? report?.cons ?? [];
      const recommendationList = data.recommendations ?? report?.recommendations ?? report?.strategicRecommendations ?? [];
      const summaryOnlyText =
        data.ai_summary?.trim() ||
        data.user_description?.trim() ||
        data.project?.ai_summary?.trim() ||
        data.project?.user_description?.trim() ||
        executiveSummary;
      const projectPatch: Partial<PreviewProject> = {
        ...(data.project ?? {}),
        score: report?.score ?? report?.calculatedScore ?? pythonScore ?? data.project?.score ?? liveProject.score,
        evaluation_score:
          report?.score ?? report?.calculatedScore ?? pythonScore ?? data.project?.evaluation_score ?? liveProject.evaluation_score,
        logic_score: report?.score ?? report?.calculatedScore ?? pythonScore ?? data.project?.logic_score ?? liveProject.logic_score,
        ai_summary: data.ai_summary ?? data.project?.ai_summary ?? (summaryOnlyText || liveProject.ai_summary),
        user_description: data.user_description ?? data.project?.user_description ?? (summaryOnlyText || liveProject.user_description),
        audit_summary: summaryOnlyText || report?.executiveSummary || data.project?.audit_summary || liveProject.audit_summary,
        executive_summary: data.executive_summary ?? summaryOnlyText ?? data.project?.executive_summary ?? liveProject.executive_summary,
        summary: data.summary ?? summaryOnlyText ?? data.project?.summary ?? liveProject.summary,
        pros: strengthsList.length > 0 ? strengthsList : data.project?.pros ?? liveProject.pros,
        cons: weaknessesList.length > 0 ? weaknessesList : data.project?.cons ?? liveProject.cons,
        recommendations:
          recommendationList.length > 0 ? recommendationList : data.project?.recommendations ?? liveProject.recommendations,
        last_improved_summary:
          data.last_improved_summary ??
          data.improvement_summary ??
          report?.last_improved_summary ??
          data.project?.last_improved_summary ??
          liveProject.last_improved_summary,
        previous_score:
          data.previous_score ?? data.project?.previous_score ?? liveProject.previous_score,
        description: data.project?.description ?? (summaryOnlyText || liveProject.description),
      };

      setLiveProject((currentProject) => ({
        ...(currentProject ?? liveProject),
        ...projectPatch,
      }));
      onProjectUpdated?.(projectId, projectPatch);
    } catch (error) {
      console.error('Preview modal AI verification failed:', error);
    } finally {
      setIsVerifying(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[9999] h-full w-full bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div
        className={`relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col transition-all duration-300 ${
          isExpandedViewer ? 'max-h-[85vh]' : 'max-h-[90vh] overflow-y-auto'
        }`}
      >
        <div className="sticky top-0 z-30 flex justify-end gap-2 border-b border-slate-900/70 bg-slate-950/90 p-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setIsExpandedViewer((currentValue) => !currentValue)}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-cyan-400 bg-slate-900 border border-slate-800 rounded-md transition-all flex items-center gap-1.5 shadow-sm"
            aria-pressed={isExpandedViewer}
          >
            {isExpandedViewer ? 'Exit Focus Mode' : 'Full Focus Mode'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsShareModalOpen(false);
              setIsExpandedViewer(false);
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 text-slate-400 shadow-xl backdrop-blur transition hover:border-rose-500/50 hover:text-rose-200"
            aria-label="Close asset preview"
          >
            ×
          </button>
        </div>

        <div
          className={`w-full ${
            isExpandedViewer
              ? 'h-[75vh] md:h-[80vh] rounded-xl'
              : 'aspect-video md:h-[45vh] rounded-t-xl border-b border-slate-800'
          } bg-black relative overflow-hidden transition-all duration-300`}
        >
          {shouldRenderTextPreview ? (
            <div className="h-full w-full overflow-auto bg-[#050b17] text-left">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#050b17]/95 px-4 py-2 text-xs text-slate-400 backdrop-blur">
                <span>{extension || 'code'}</span>
                <span>Text Preview</span>
              </div>
              <pre className="m-0 min-h-full p-4 font-mono text-xs leading-6 text-slate-200">
                <code className="block whitespace-pre-wrap break-words">
                  {renderedTextPreview ??
                    (textPreview.isLoading ? 'Loading code preview...' : textPreview.error ?? 'Preview not available.')}
                </code>
              </pre>
            </div>
          ) : videoExtensions.has(extension) ? (
            <video src={activePreviewUrl} controls autoPlay className="w-full h-full object-contain" />
          ) : imageExtensions.has(extension) ? (
            <Image
              src={activePreviewUrl}
              alt={previewName}
              fill
              unoptimized
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 896px"
            />
          ) : audioExtensions.has(extension) ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-slate-950 px-8 text-center">
              <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                Audio Asset
              </div>
              <audio src={activePreviewUrl} controls autoPlay className="w-full max-w-2xl" />
            </div>
          ) : (
            <iframe
              title={previewName}
              src={viewerSrc}
              className="h-full w-full bg-black"
              allow="autoplay; fullscreen"
            />
          )}
        </div>

        {!isExpandedViewer && (
        <div
          id={AUDIT_CAPTURE_TARGET_ID}
          ref={auditCaptureRef}
          className="flex h-auto max-h-none flex-col gap-4 overflow-visible border-t border-slate-800 bg-black p-6 animate-fadeIn"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold tracking-tight text-slate-50">{liveProject?.title ?? previewName}</h2>
              <p className="mt-1 truncate text-xs text-slate-500">{liveProject?.file_name ?? previewName}</p>
            </div>
            <span className="w-fit rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              {fileTypeBadge}
            </span>
          </div>

          <div
            role="status"
            className={`rounded-xl border px-4 py-3.5 ${getMotivationalBannerClassName(score)}`}
          >
            <p className="text-sm font-medium leading-6">
              {getMotivationalMessage(score)}
            </p>
          </div>

          {lastImprovedSummary ? (
            <section className="rounded-xl border border-emerald-400/25 bg-gradient-to-r from-emerald-500/10 via-cyan-500/[0.07] to-transparent p-4 shadow-[0_0_28px_rgba(16,185,129,0.08)]">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 text-xs text-emerald-300">
                  ↗
                </span>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                  Version Improvement
                </h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">{lastImprovedSummary}</p>
            </section>
          ) : null}

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">AI Executive Summary</p>
            <div className="prose prose-invert prose-sm mt-3 max-w-none text-gray-300 leading-relaxed prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-slate-100 prose-h2:text-base prose-h2:font-semibold prose-p:my-2 prose-strong:text-slate-100 prose-ul:my-2 prose-li:my-1 prose-li:marker:text-cyan-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{executiveSummaryMarkdown}</ReactMarkdown>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2" data-html2canvas-ignore="true">
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
              disabled={!liveProject?.id}
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Share your ${score} out of 100 MeliusAI audit score`}
            >
              Share Score
            </button>

            {canVerify ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (liveProject?.id) {
                    void handleRunAIVerification(liveProject.id, event);
                  }
                }}
                disabled={!liveProject?.id || isVerifying}
                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600"
              >
                {isVerifying ? 'Re-Auditing via GPT Engine...' : 'Re-Audit with MeliusAI'}
              </button>
            ) : null}
          </div>

          {downloadFeedback ? (
            <p
              className="m-0 text-right text-xs text-slate-400"
              role="status"
              aria-live="polite"
              data-html2canvas-ignore="true"
            >
              {downloadFeedback}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <div className="relative flex h-32 w-32 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full border border-slate-800"
                  style={{
                    background: `conic-gradient(from 90deg, rgba(34,211,238,0.9) ${score * 3.6}deg, rgba(15,23,42,0.95) 0deg)`,
                  }}
                />
                <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                  <span className="text-3xl font-bold text-white">{score}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">/100</span>
                </div>
              </div>
              {scoreDelta !== null ? (
                <div
                  className={`rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide ${
                    scoreDelta > 0
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                      : scoreDelta < 0
                        ? 'border-rose-400/30 bg-rose-400/10 text-rose-300'
                        : 'border-slate-700 bg-slate-800/70 text-slate-300'
                  }`}
                  title={`Previous score: ${previousScore}/100`}
                >
                  {scoreDelta > 0 ? '▲ +' : scoreDelta < 0 ? '▼ ' : '• '}
                  {scoreDelta} Points
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MetricList title="Strengths" tone="emerald" items={pros} />
              <MetricList title="Weaknesses" tone="rose" items={cons} />
              <MetricList title="Recommendations" tone="cyan" items={recommendations} />
            </div>
          </div>
        </div>
        )}
      </div>

      {isShareModalOpen && liveProject?.id ? (
        <ShareScoreModal
          score={score}
          onClose={() => setIsShareModalOpen(false)}
        />
      ) : null}
    </div>
  );

  return createPortal(modal, document.body);
}
