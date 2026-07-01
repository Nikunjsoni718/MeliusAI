'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

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
  source_url?: string | null;
  preview_url?: string | null;
  file_extension?: string | null;
  source_kind?: string | null;
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
    executiveSummary?: string;
    pros?: string[];
    cons?: string[];
    strategicRecommendations?: string[];
  };
  project?: PreviewProject;
  reportText?: string;
  description?: string;
  executive_summary?: string;
  summary?: string;
  score?: number;
  grade?: string;
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
    project?.source_kind?.trim().toLowerCase() ||
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
  const pros = getMetricItems(liveProject, 'pros');
  const cons = getMetricItems(liveProject, 'cons');
  const recommendations = getMetricItems(liveProject, 'recommendations');
  const fileTypeBadge = extension ? `${extension.toUpperCase()} File` : 'Asset File';

  useEffect(() => {
    setIsPortalMounted(true);
  }, []);

  useEffect(() => {
    setLiveProject(previewProject ?? null);
    setIsExpandedViewer(false);
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
        setIsExpandedViewer(false);
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePreviewUrl, onClose]);

  if (!isPortalMounted || !activePreviewUrl || !viewerSrc) {
    return null;
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
        data.description?.trim() ||
        data.executive_summary?.trim() ||
        data.summary?.trim() ||
        report?.executiveSummary?.trim() ||
        data.project?.description?.trim() ||
        data.project?.audit_summary?.trim() ||
        liveProject.description?.trim() ||
        liveProject.audit_summary?.trim() ||
        '';
      const reportText =
        data.reportText ??
        `## Executive Summary
${executiveSummary || 'No executive summary has been generated yet.'}

Grade: ${data.grade ?? 'N/A'}

## Pros
${(data.pros ?? report?.pros ?? []).map((item) => `- ${item}`).join('\n') || '- No strengths returned.'}

## Cons
${(data.cons ?? report?.cons ?? []).map((item) => `- ${item}`).join('\n') || '- No flaws returned.'}

## Strategic Recommendations
${(data.recommendations ?? report?.strategicRecommendations ?? []).map((item) => `- ${item}`).join('\n') || '- No recommendations returned.'}

## Scorecard
MeliusAI Verification Score: **${pythonScore ?? report?.calculatedScore ?? 0}/100**`;
      const projectPatch: Partial<PreviewProject> = {
        ...(data.project ?? {}),
        score: report?.calculatedScore ?? pythonScore ?? data.project?.score ?? liveProject.score,
        evaluation_score:
          report?.calculatedScore ?? pythonScore ?? data.project?.evaluation_score ?? liveProject.evaluation_score,
        logic_score: report?.calculatedScore ?? pythonScore ?? data.project?.logic_score ?? liveProject.logic_score,
        audit_summary: executiveSummary || report?.executiveSummary || data.project?.audit_summary || liveProject.audit_summary,
        executive_summary: data.executive_summary ?? data.project?.executive_summary ?? liveProject.executive_summary,
        summary: data.summary ?? data.project?.summary ?? liveProject.summary,
        pros: report?.pros ?? data.pros ?? data.project?.pros ?? liveProject.pros,
        cons: report?.cons ?? data.cons ?? data.project?.cons ?? liveProject.cons,
        recommendations:
          report?.strategicRecommendations ?? data.recommendations ?? data.project?.recommendations ?? liveProject.recommendations,
        ai_summary: reportText ?? data.project?.ai_summary ?? liveProject.ai_summary,
        description: reportText ?? data.project?.description ?? liveProject.description,
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
    <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
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
        <div className="p-6 flex flex-col gap-4 border-t border-slate-800 animate-fadeIn">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold tracking-tight text-slate-50">{liveProject?.title ?? previewName}</h2>
              <p className="mt-1 truncate text-xs text-slate-500">{liveProject?.file_name ?? previewName}</p>
            </div>
            <span className="w-fit rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              {fileTypeBadge}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">AI Executive Summary</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {liveProject?.description?.trim() ||
                liveProject?.executive_summary?.trim() ||
                liveProject?.summary?.trim() ||
                liveProject?.audit_summary?.trim() ||
                "This project asset is awaiting verification. Click 'Verify with MeliusAI' to generate an intelligent executive summary."}
            </p>
          </div>

          {canVerify ? (
          <div className="flex justify-end">
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
              {isVerifying ? 'Auditing via GPT Engine...' : 'Verify with MeliusAI'}
            </button>
          </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
            <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 p-5">
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
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MetricList title="AI Pros" tone="emerald" items={pros} />
              <MetricList title="AI Cons" tone="rose" items={cons} />
              <MetricList title="Recommendations" tone="cyan" items={recommendations} />
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
