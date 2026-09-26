'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown } from 'lucide-react';

import { ShareScoreModal } from '@/components/dashboard/share-score-modal';
import { advanceProductTour, pauseProductTour } from '@/components/onboarding/product-tour';
import {
  normalizeAuditReport,
  resolveAuditDirective,
  type AuditFinding,
} from '@/lib/audit-report-normalizer';
import {
  AUDIT_CAPTURE_TARGET_ID,
  downloadFullAuditReport,
} from '@/lib/download-audit-report';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

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
const previewProjectSelect =
  'id, name, title, file_url, file_type, description, evaluation_score, logic_score, score, delta_summary, ai_summary, audit_summary, pros, cons, recommendations, audit_findings, updated_at, github_synced_at';

function advanceReportTourToCompletion() {
  return advanceProductTour(12, 13) || advanceProductTour(11, 13);
}

export type PreviewProject = {
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
  delta_summary?: string | null;
  evaluation_score?: number | null;
  has_been_audited?: boolean | null;
  logic_score?: number | null;
  previous_score?: number | null;
  last_improved_summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  audit_findings?: unknown;
  audit_data?: unknown;
  auditData?: unknown;
  audit_report?: unknown;
  auditReport?: unknown;
  updated_at?: string | null;
  github_synced_at?: string | null;
};

export type AuditPreviewAsset = PreviewProject & {
  kind: 'file' | 'folder';
  name: string;
  previewUrl?: string | null;
};

type AssetPreviewModalProps = {
  asset: AuditPreviewAsset | null;
  canVerify?: boolean;
  hideAudit?: boolean;
  isReAuditing?: boolean;
  onReAudit?: () => void;
  onAuditCommitted?: (projectId: string, projectPatch: Partial<PreviewProject>) => void;
  onProjectUpdated?: (projectId: string, projectPatch: Partial<PreviewProject>) => void;
  onClose: () => void;
  publicProfileUsername?: string | null;
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
    finding_impacts?: unknown;
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
  delta_summary?: string | null;
  previous_score?: number;
  last_improved_summary?: string;
  improvement_summary?: string;
  grade?: string;
  strengths?: string[];
  weaknesses?: string[];
  pros?: string[];
  cons?: string[];
  recommendations?: string[];
  finding_impacts?: unknown;
  audit_data?: unknown;
  auditData?: unknown;
  audit_report?: unknown;
  auditReport?: unknown;
};

type PendingAuditUpdate = {
  projectId: string;
  patch: Partial<PreviewProject>;
  score: number | null;
  deltaSummary: string | null;
};

function getAuditScore(project: PreviewProject) {
  for (const value of [project.evaluation_score, project.score, project.logic_score]) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.min(98, Math.round(value)));
    }
  }

  return null;
}

function getDeltaSummary(project: PreviewProject) {
  return typeof project.delta_summary === 'string' && project.delta_summary.trim()
    ? project.delta_summary.trim()
    : null;
}

function confirmsPendingAuditUpdate(project: PreviewProject, pendingUpdate: PendingAuditUpdate) {
  return (
    getAuditScore(project) === pendingUpdate.score &&
    getDeltaSummary(project) === pendingUpdate.deltaSummary
  );
}

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

function appendCacheBuster(src: string, cacheKey: string) {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return src;
  }

  try {
    const url = new URL(src);
    url.searchParams.set('t', cacheKey);
    return url.toString();
  } catch {
    const hashIndex = src.indexOf('#');
    const pathAndQuery = hashIndex >= 0 ? src.slice(0, hashIndex) : src;
    const hash = hashIndex >= 0 ? src.slice(hashIndex) : '';
    const separator = pathAndQuery.includes('?') ? '&' : '?';
    return `${pathAndQuery}${separator}t=${encodeURIComponent(cacheKey)}${hash}`;
  }
}

async function readRemoteTextAsUtf8(src: string) {
  const response = await fetch(src, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Unable to read code content.');
  }

  return response.text();
}

function getProjectAssetText(project: PreviewProject | null | undefined, previewName: string) {
  return (
    project?.raw_text?.trim() ||
    project?.text_preview?.trim() ||
    project?.ai_summary?.trim() ||
    project?.audit_summary?.trim() ||
    project?.description?.trim() ||
    project?.file_name?.trim() ||
    previewName
  );
}

function MetricList({ title, items }: { title: string; items: AuditFinding[] }) {
  const toneClasses = {
    card: 'border-emerald-500/10 bg-emerald-500/[0.02]',
    heading: 'text-emerald-200',
    marker: 'text-emerald-300',
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClasses.card}`}>
      <h4 className={`text-[10px] font-bold uppercase tracking-[0.2em] ${toneClasses.heading}`}>{title}</h4>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.length > 0 ? (
          items.map((item, index) => (
            <li
              key={`${title}-${item.text}-${index}`}
              className="flex min-w-0 items-start gap-2 rounded-md border border-emerald-500/10 bg-emerald-500/[0.02] p-3 text-sm font-medium leading-relaxed text-white/90"
            >
              <span aria-hidden="true" className={`mt-0.5 shrink-0 text-sm leading-none ${toneClasses.marker}`}>
                ✓
              </span>
              <span className="min-w-0 flex-1">{item.text}</span>
            </li>
          ))
        ) : (
          <li className="text-xs italic leading-relaxed text-slate-500">No entries generated yet.</li>
        )}
      </ul>
    </div>
  );
}

function EngineeringFindings({
  items,
  directives,
  expandAllForExport = false,
}: {
  items: AuditFinding[];
  directives: AuditFinding[];
  expandAllForExport?: boolean;
}) {
  const [openFindingKey, setOpenFindingKey] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-rose-500/10 bg-rose-500/[0.02] p-4">
      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-200">Areas for Improvement</h4>
      <div className="mt-3 space-y-3">
        {items.length > 0 ? items.map((item, index) => {
          const findingKey = `${item.findingId ?? item.text}-${index}`;
          const directive = resolveAuditDirective(item, index, directives);
          const directiveRegionId = `audit-directive-${findingKey}`;
          const isExpanded = expandAllForExport || openFindingKey === findingKey;

          return (
            <article key={findingKey} className="rounded-lg border border-rose-500/10 bg-rose-500/[0.025] p-3">
              <p className="text-sm leading-relaxed text-white/90">{item.text}</p>
              {directive ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenFindingKey((currentKey) => currentKey === findingKey ? null : findingKey)}
                    aria-expanded={isExpanded}
                    aria-controls={directiveRegionId}
                    data-image-export-ignore="true"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400 transition hover:bg-cyan-500/15 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  >
                    <span>{isExpanded ? 'Hide recommendation' : 'View recommendation'}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isExpanded ? (
                    <div
                      id={directiveRegionId}
                      role="region"
                      className="mt-3 rounded-r-md border-l-2 border-cyan-500/50 bg-black/40 p-3.5"
                    >
                      <p className="text-sm leading-relaxed text-gray-300">{directive.text}</p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </article>
          );
        }) : <p className="text-xs italic text-slate-500">No verified findings were generated.</p>}
      </div>
    </section>
  );
}

export function AssetPreviewModal({
  asset,
  canVerify = true,
  hideAudit = false,
  isReAuditing = false,
  onReAudit,
  onAuditCommitted,
  onProjectUpdated,
  onClose,
  publicProfileUsername,
}: AssetPreviewModalProps) {
  const [isPortalMounted, setIsPortalMounted] = useState(false);
  const [liveProject, setLiveProject] = useState<PreviewProject | null>(asset ?? null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isExpandedViewer, setIsExpandedViewer] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [isCapturingFullReport, setIsCapturingFullReport] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isProjectLinkCopied, setIsProjectLinkCopied] = useState(false);
  const auditCaptureRef = useRef<HTMLDivElement | null>(null);
  const projectLinkCopiedTimeoutRef = useRef<number | null>(null);
  const onProjectUpdatedRef = useRef(onProjectUpdated);
  const projectRefreshRevisionRef = useRef(0);
  const pendingAuditUpdateRef = useRef<PendingAuditUpdate | null>(null);
  const supabase = useMemo(
    () => (hasSupabaseBrowserEnv() ? createSupabaseBrowserClient() : null),
    []
  );
  const [previewCacheNonce, setPreviewCacheNonce] = useState(() => Date.now());
  const [code, setCode] = useState('');
  const [codePreview, setCodePreview] = useState<{
    url: string | null;
    isLoading: boolean;
    error: string | null;
  }>({
    url: null,
    isLoading: false,
    error: null,
  });
  const isFolder = asset?.kind === 'folder';
  const activePreviewUrl =
    liveProject?.file_url ?? asset?.previewUrl ?? asset?.file_url ?? asset?.preview_url ?? null;
  const previewName =
    liveProject?.name ??
    liveProject?.title ??
    asset?.name ??
    asset?.title ??
    getFallbackFileName(activePreviewUrl);
  const previewCacheKey = `${liveProject?.updated_at ?? liveProject?.github_synced_at ?? 'current'}-${previewCacheNonce}`;
  const codeFetchUrl = useMemo(
    () => (activePreviewUrl ? appendCacheBuster(activePreviewUrl, previewCacheKey) : null),
    [activePreviewUrl, previewCacheKey]
  );
  const viewerSrc = useMemo(
    () => getViewerSrc(activePreviewUrl, previewName),
    [activePreviewUrl, previewName]
  );
  const extension = getPreviewExtension(activePreviewUrl, previewName, liveProject);
  const isCodeOnlyWorkspaceFile = hideAudit && !isFolder;
  const shouldRenderTextPreview =
    isCodeOnlyWorkspaceFile || shouldForceUtf8CodeRead(activePreviewUrl, previewName, liveProject);
  const renderedTextPreview = codePreview.url === codeFetchUrl ? code : null;
  const normalizedAudit = useMemo(() => normalizeAuditReport(liveProject), [liveProject]);
  const score = normalizedAudit.score ?? 0;
  const pros = normalizedAudit.findings.strengths;
  const cons = normalizedAudit.findings.weaknesses;
  const recommendations = normalizedAudit.findings.recommendations;
  const findingsReportKey = [
    ...cons.map((finding, index) => `finding:${finding.findingId ?? index}:${finding.text}`),
    ...recommendations.map((directive, index) => `directive:${directive.findingId ?? index}:${directive.text}`),
  ].join('\u0001');
  const hasWorkspaceAuditReport =
    isFolder &&
    liveProject?.has_been_audited === true &&
    Boolean(
      liveProject.executive_summary?.trim() ||
        liveProject.audit_summary?.trim() ||
        liveProject.ai_summary?.trim() ||
        pros.length > 0 ||
        cons.length > 0 ||
        recommendations.length > 0
    );
  const isWorkspaceAuditEmptyState = isFolder && !hasWorkspaceAuditReport;
  const fileTypeBadge = extension ? `${extension.toUpperCase()} File` : 'Asset File';
  const verificationInProgress = isVerifying || isReAuditing;
  const executiveSummaryMarkdown = normalizedAudit.summary;
  const publicProjectShareUrl =
    typeof window !== 'undefined' && liveProject?.id && publicProfileUsername
      ? `${window.location.origin}/profile/${publicProfileUsername}?projectId=${liveProject.id}`
      : '';

  useEffect(() => {
    setIsPortalMounted(true);
  }, []);

  useEffect(() => {
    onProjectUpdatedRef.current = onProjectUpdated;
  }, [onProjectUpdated]);

  useEffect(() => {
    const incomingProject = asset ?? null;
    const pendingAuditUpdate = pendingAuditUpdateRef.current;

    if (pendingAuditUpdate && pendingAuditUpdate.projectId !== incomingProject?.id) {
      pendingAuditUpdateRef.current = null;
    }

    setLiveProject(() => {
      const activePendingUpdate = pendingAuditUpdateRef.current;
      if (
        incomingProject &&
        activePendingUpdate &&
        activePendingUpdate.projectId === incomingProject.id
      ) {
        return { ...incomingProject, ...activePendingUpdate.patch };
      }

      return incomingProject;
    });
  }, [asset]);

  useEffect(() => {
    setPreviewCacheNonce(Date.now());
    setIsExpandedViewer(false);
    setIsShareModalOpen(false);
    setIsDownloadingReport(false);
    setDownloadFeedback(null);
    setIsProjectLinkCopied(false);
  }, [asset?.id]);

  useEffect(() => {
    return () => {
      if (projectLinkCopiedTimeoutRef.current !== null) {
        window.clearTimeout(projectLinkCopiedTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopyProjectLink() {
    if (!publicProjectShareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publicProjectShareUrl);
    } catch {
      return;
    }

    setIsProjectLinkCopied(true);
    if (projectLinkCopiedTimeoutRef.current !== null) {
      window.clearTimeout(projectLinkCopiedTimeoutRef.current);
    }
    projectLinkCopiedTimeoutRef.current = window.setTimeout(() => {
      setIsProjectLinkCopied(false);
      projectLinkCopiedTimeoutRef.current = null;
    }, 2_000);
  }

  useEffect(() => {
    if (!supabase || !asset?.id || isFolder) {
      return;
    }

    let isActive = true;
    const projectId = asset.id;

    const refreshProject = async () => {
      const refreshRevision = projectRefreshRevisionRef.current;
      const projectResult = await supabase
        .from('projects')
        .select(previewProjectSelect)
        .eq('id', projectId)
        .maybeSingle();

      if (!isActive || refreshRevision !== projectRefreshRevisionRef.current) {
        return;
      }

      if (projectResult.error) {
        console.warn('Unable to refresh the asset preview from projects:', projectResult.error);
        return;
      }

      if (projectResult.data) {
        const freshProject = projectResult.data as PreviewProject;
        const pendingAuditUpdate = pendingAuditUpdateRef.current;
        if (pendingAuditUpdate?.projectId === projectId) {
          if (!confirmsPendingAuditUpdate(freshProject, pendingAuditUpdate)) {
            return;
          }
          pendingAuditUpdateRef.current = null;
        }
        setLiveProject((currentProject) => ({ ...currentProject, ...freshProject }));
        setPreviewCacheNonce(Date.now());
        onProjectUpdatedRef.current?.(freshProject.id ?? projectId, freshProject);
      }
    };

    const refreshOnFocus = () => {
      void refreshProject();
    };

    void refreshProject();
    window.addEventListener('focus', refreshOnFocus);
    const projectChannel = supabase
      .channel(`asset-preview-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`,
        },
        refreshOnFocus
      )
      .subscribe();

    return () => {
      isActive = false;
      window.removeEventListener('focus', refreshOnFocus);
      void supabase.removeChannel(projectChannel);
    };
  }, [asset?.id, isFolder, supabase]);

  useEffect(() => {
    if (!codeFetchUrl || !shouldRenderTextPreview) {
      setCode('');
      setCodePreview({ url: null, isLoading: false, error: null });
      return;
    }

    let isActive = true;
    setCode('');
    setCodePreview({ url: codeFetchUrl, isLoading: true, error: null });

    void readRemoteTextAsUtf8(codeFetchUrl)
      .then((text) => {
        if (isActive) {
          setCode(text);
          setCodePreview({ url: codeFetchUrl, isLoading: false, error: null });
        }
      })
      .catch(() => {
        if (isActive) {
          setCode('');
          setCodePreview({
            url: codeFetchUrl,
            isLoading: false,
            error: 'Preview not available for this file yet.',
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [codeFetchUrl, shouldRenderTextPreview]);

  useEffect(() => {
    if (!asset) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isShareModalOpen) {
          setIsShareModalOpen(false);
          advanceReportTourToCompletion();
          return;
        }

        setIsExpandedViewer(false);
        advanceReportTourToCompletion();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [asset, isShareModalOpen, onClose]);

  if (!isPortalMounted || !asset || (!isFolder && (!activePreviewUrl || !viewerSrc))) {
    return null;
  }

  async function handleDownloadFullReport() {
    if (!auditCaptureRef.current || isDownloadingReport) {
      return;
    }

    setIsDownloadingReport(true);
    setIsCapturingFullReport(true);
    setDownloadFeedback(null);

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });
      await downloadFullAuditReport(auditCaptureRef.current, liveProject?.title ?? previewName);
      setDownloadFeedback('Full audit report downloaded.');
    } catch (error) {
      console.error('Full audit report download failed:', error);
      setDownloadFeedback('The full report could not be downloaded. Please try again.');
    } finally {
      setIsCapturingFullReport(false);
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
    setVerificationError(null);

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

      const normalizedResponse = normalizeAuditReport(data);
      const existingAudit = normalizeAuditReport(liveProject);
      const normalizedScore = normalizedResponse.score ?? existingAudit.score;
      const executiveSummary = normalizedResponse.summary || existingAudit.summary;
      const strengthsList =
        normalizedResponse.strengths.length > 0
          ? normalizedResponse.strengths
          : existingAudit.strengths;
      const weaknessesList =
        normalizedResponse.weaknesses.length > 0
          ? normalizedResponse.weaknesses
          : existingAudit.weaknesses;
      const recommendationList =
        normalizedResponse.recommendations.length > 0
          ? normalizedResponse.recommendations
          : existingAudit.recommendations;
      const projectPatch: Partial<PreviewProject> = {
        ...(data.project ?? {}),
        score: normalizedScore,
        evaluation_score: normalizedScore,
        logic_score: normalizedScore,
        ai_summary: executiveSummary || liveProject.ai_summary,
        user_description: executiveSummary || liveProject.user_description,
        audit_summary: executiveSummary || liveProject.audit_summary,
        executive_summary: executiveSummary || liveProject.executive_summary,
        summary: executiveSummary || liveProject.summary,
        pros: strengthsList,
        cons: weaknessesList,
        recommendations: recommendationList,
        audit_findings:
          data.finding_impacts ??
          data.report?.finding_impacts ??
          data.project?.audit_findings ??
          liveProject.audit_findings,
        last_improved_summary:
          data.last_improved_summary ??
          data.improvement_summary ??
          data.report?.last_improved_summary ??
          data.project?.last_improved_summary ??
          liveProject.last_improved_summary,
        previous_score:
          data.previous_score ?? data.project?.previous_score ?? liveProject.previous_score,
        delta_summary:
          data.delta_summary !== undefined
            ? data.delta_summary
            : data.project?.delta_summary !== undefined
              ? data.project.delta_summary
              : liveProject.delta_summary,
        description:
          (data.description ?? data.project?.description ?? executiveSummary) || liveProject.description,
      };
      const updatedProject = { ...liveProject, ...projectPatch };
      pendingAuditUpdateRef.current = {
        projectId,
        patch: projectPatch,
        score: getAuditScore(updatedProject),
        deltaSummary: getDeltaSummary(updatedProject),
      };
      projectRefreshRevisionRef.current += 1;

      setLiveProject((currentProject) => ({
        ...(currentProject ?? liveProject),
        ...projectPatch,
      }));
      onProjectUpdated?.(projectId, projectPatch);
      onAuditCommitted?.(projectId, projectPatch);
      setPreviewCacheNonce(Date.now());
    } catch (error) {
      console.error('Preview modal AI verification failed:', error);
      setVerificationError(error instanceof Error ? error.message : 'MeliusAI verification failed.');
    } finally {
      setIsVerifying(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[9999] h-full w-full bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn max-md:z-[13000]">
      <div
        className={`relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col transition-all duration-300 ${
          isExpandedViewer ? 'max-h-[85vh]' : 'max-h-[90vh] overflow-y-auto'
        }`}
      >
        <div className="sticky top-0 z-30 flex justify-end gap-2 border-b border-slate-900/70 bg-slate-950/90 p-3 backdrop-blur">
          {!isFolder && !isCodeOnlyWorkspaceFile ? (
            <button
              type="button"
              onClick={() => setIsExpandedViewer((currentValue) => !currentValue)}
              className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-400 shadow-sm transition-all hover:text-cyan-400 max-md:min-h-11 max-md:text-sm"
              aria-pressed={isExpandedViewer}
            >
              {isExpandedViewer ? 'Exit Focus Mode' : 'Full Focus Mode'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setIsShareModalOpen(false);
              setIsExpandedViewer(false);
              advanceReportTourToCompletion();
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 text-slate-400 shadow-xl backdrop-blur transition hover:border-rose-500/50 hover:text-rose-200 max-md:h-11 max-md:w-11"
            aria-label="Close asset preview"
          >
            ×
          </button>
        </div>

        {verificationError ? (
          <p className="mx-4 mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-100" role="alert">
            {verificationError}
          </p>
        ) : null}

        {!isFolder && viewerSrc && activePreviewUrl ? (
        <div
          className={`w-full ${
            isExpandedViewer || isCodeOnlyWorkspaceFile
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
                    (codePreview.isLoading ? 'Loading code preview...' : codePreview.error ?? 'Preview not available.')}
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
        ) : null}

        {!isExpandedViewer && !isCodeOnlyWorkspaceFile && (
        <div
          id={AUDIT_CAPTURE_TARGET_ID}
          ref={auditCaptureRef}
          className="flex h-auto max-h-none flex-col gap-4 overflow-visible border-t border-slate-800 bg-black p-6 animate-fadeIn"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold tracking-tight text-slate-50">
                {liveProject?.name ?? liveProject?.title ?? previewName}
              </h2>
              <p className="mt-1 truncate text-xs text-slate-500">
                {isFolder ? 'Workspace Audit' : liveProject?.file_name ?? previewName}
              </p>
            </div>
            <div className="flex w-fit flex-wrap items-center gap-2">
              {!isFolder && liveProject?.id && publicProfileUsername ? (
                <button
                  type="button"
                  onClick={() => void handleCopyProjectLink()}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100"
                >
                  {isProjectLinkCopied ? 'Copied!' : 'Copy Link'}
                </button>
              ) : null}
              {!isFolder ? (
                <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  {fileTypeBadge}
                </span>
              ) : null}
            </div>
          </div>

          {executiveSummaryMarkdown ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400">Audit Summary</p>
              <div className="prose prose-invert prose-sm mt-3 max-w-none text-gray-300 leading-relaxed prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-slate-100 prose-h2:text-base prose-h2:font-semibold prose-p:my-2 prose-strong:text-slate-100 prose-ul:my-2 prose-li:my-1 prose-li:marker:text-cyan-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{executiveSummaryMarkdown}</ReactMarkdown>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2" data-image-export-ignore="true">
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
              onClick={() => {
                pauseProductTour(12);
                setIsShareModalOpen(true);
              }}
              disabled={!publicProjectShareUrl}
              data-tour="share-score"
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Share your ${score} out of 100 MeliusAI engineering audit`}
            >
              Share Audit
            </button>

            {canVerify && (!isFolder || (onReAudit && !isWorkspaceAuditEmptyState)) ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isFolder) {
                    onReAudit?.();
                    return;
                  }
                  if (liveProject?.id) {
                    void handleRunAIVerification(liveProject.id, event);
                  }
                }}
                disabled={!liveProject?.id || verificationInProgress}
                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600"
              >
                {verificationInProgress ? 'Re-Auditing via GPT Engine...' : 'Re-Audit with MeliusAI'}
              </button>
            ) : null}
          </div>

          {downloadFeedback ? (
            <p
              className="m-0 text-right text-xs text-slate-400"
              role="status"
              aria-live="polite"
              data-image-export-ignore="true"
            >
              {downloadFeedback}
            </p>
          ) : null}

          {isWorkspaceAuditEmptyState ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex w-full max-w-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <div className="relative flex h-32 w-32 items-center justify-center">
                  <div
                    data-audit-score-arc="css"
                    data-score={score}
                    className="absolute inset-0 rounded-full border border-slate-800"
                    style={{
                      animation: 'none',
                      background: `conic-gradient(from 90deg, rgba(34,211,238,0.9) ${score * 3.6}deg, rgba(15,23,42,0.95) 0deg)`,
                      opacity: 1,
                      transition: 'none',
                      visibility: 'visible',
                    }}
                  />
                  <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                    <span className="text-3xl font-bold text-white">{score}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">/100</span>
                  </div>
                </div>
                {score >= 96 ? (
                  <p className="text-center text-[10px] leading-4 text-slate-400">
                    Baseline engineering standards met. Continued architectural review is recommended.
                  </p>
                ) : null}
              </div>

              <section className="w-full rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] px-6 py-8 text-center shadow-[0_0_28px_rgba(34,211,238,0.06)]">
                <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-300">
                  This preliminary assessment is based on the workspace file average. Run a full workspace audit for evidence-based findings and engineering directives.
                </p>
                {canVerify && onReAudit ? (
                  <button
                    type="button"
                    onClick={onReAudit}
                    disabled={verificationInProgress}
                    aria-busy={verificationInProgress}
                    className="mt-5 rounded-full bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.22)] transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60"
                  >
                    {verificationInProgress ? 'Generating Workspace Audit...' : 'Generate Workspace Audit'}
                  </button>
                ) : null}
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                  <div className="relative flex h-32 w-32 items-center justify-center">
                    <div
                      data-audit-score-arc="css"
                      data-score={score}
                      className="absolute inset-0 rounded-full border border-slate-800"
                      style={{
                        animation: 'none',
                        background: `conic-gradient(from 90deg, rgba(34,211,238,0.9) ${score * 3.6}deg, rgba(15,23,42,0.95) 0deg)`,
                        opacity: 1,
                        transition: 'none',
                        visibility: 'visible',
                      }}
                    />
                    <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border border-slate-800 bg-slate-950">
                      <span className="text-3xl font-bold text-white">{score}</span>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">/100</span>
                    </div>
                  </div>
                  {score >= 96 ? (
                    <p className="text-center text-[10px] leading-4 text-slate-400">
                      Baseline engineering standards met. Continued architectural review is recommended.
                    </p>
                  ) : null}
                </div>

                <MetricList title="Verified Strengths" items={pros} />
              </div>

              <EngineeringFindings
                key={findingsReportKey}
                items={cons}
                directives={recommendations}
                expandAllForExport={isCapturingFullReport}
              />
            </div>
          )}
        </div>
        )}
      </div>

      {isShareModalOpen && publicProjectShareUrl ? (
        <ShareScoreModal
          score={score}
          shareUrl={publicProjectShareUrl}
          onClose={() => {
            setIsShareModalOpen(false);
            advanceReportTourToCompletion();
          }}
        />
      ) : null}
    </div>
  );

  return createPortal(modal, document.body);
}
