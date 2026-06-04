'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { AuditReviewModal } from '@/components/dashboard/audit-review-modal';
import { AssetPreviewModal } from '@/components/dashboard/asset-preview-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { extractEvaluationScore, streamAssetAudit } from '@/lib/client-agent-audit';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ProjectRow } from '@/types/supabase';

type VaultPreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'presentation' | 'archive' | 'document' | 'generic';

type VaultAuditReport = {
  score: number | null;
  summary: string;
  architecturalAssets: string[];
  architecturalVulnerabilities: string[];
};

type VaultToastState = {
  id: number;
  message: string;
};

const vaultDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const codeLanguageMap: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  css: 'css',
  csv: 'csv',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  php: 'php',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'tsx',
  txt: 'text',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif']);
const videoExtensions = new Set(['mp4', 'mov', 'webm', 'ogg', 'mkv']);
const audioExtensions = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const presentationExtensions = new Set(['ppt', 'pptx', 'odp', 'key']);
const archiveExtensions = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2']);
const documentExtensions = new Set(['doc', 'docx', 'xls', 'xlsx', 'rtf', 'odt', 'ods']);

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 3.8h5.7l4.5 4.5v11.9c0 .9-.7 1.6-1.6 1.6H8c-.9 0-1.6-.7-1.6-1.6V5.4c0-.9.7-1.6 1.6-1.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.5 3.8v4.5H18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.4 13h5.2M9.4 16.2h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="m12 3.8 7 4v8.5l-7 4-7-4V7.8l7-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="m5.2 8 6.8 3.9L18.8 8M12 11.9v8.3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M8 3.8h6l4 4v12.4c0 .9-.7 1.6-1.6 1.6H8c-.9 0-1.6-.7-1.6-1.6V5.4c0-.9.7-1.6 1.6-1.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3.8v4H18" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M8.2 8.7v9.1M12 8.7v9.1M15.8 8.7v9.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M5.2 6.4h13.6M9.2 6.4l.7-2h4.2l.7 2M7 6.4l.8 14h8.4l.8-14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

function getCodeLanguage(extension: string) {
  return codeLanguageMap[extension] ?? null;
}

function formatFileSize(bytes?: number | null) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function getVaultAssetName(project: ProjectRow) {
  return project.name?.trim() || project.file_name?.trim() || project.title?.trim() || 'Untitled Asset';
}

function getVaultAssetUrl(project: ProjectRow) {
  return project.file_url?.trim() || project.source_url?.trim() || null;
}

function getVaultAssetFileType(project: ProjectRow) {
  const extension = getFileExtension(getVaultAssetName(project));

  if (extension) {
    return extension.toUpperCase();
  }

  if (project.file_type) {
    return project.file_type.split('/').pop()?.toUpperCase() ?? 'FILE';
  }

  return project.source_kind?.toUpperCase() ?? 'FILE';
}

function getVaultAssetSizeLabel(project: ProjectRow) {
  return formatFileSize(project.file_size);
}

function formatVaultAssetDate(createdAt?: string | null) {
  if (!createdAt) {
    return 'Timestamp unavailable';
  }

  try {
    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
      return createdAt;
    }

    return vaultDateFormatter.format(date);
  } catch {
    return createdAt;
  }
}

function resolvePreviewKind(project: ProjectRow): VaultPreviewKind {
  const fileName = getVaultAssetName(project);
  const extension = getFileExtension(fileName);
  const mime = project.file_type ?? '';

  if (mime.startsWith('image/') || imageExtensions.has(extension)) {
    return 'image';
  }
  if (mime.startsWith('video/') || videoExtensions.has(extension)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || audioExtensions.has(extension)) {
    return 'audio';
  }
  if (mime === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }
  if (mime.includes('ms-powerpoint') || mime.includes('presentationml') || presentationExtensions.has(extension)) {
    return 'presentation';
  }
  if (archiveExtensions.has(extension)) {
    return 'archive';
  }
  if (getCodeLanguage(extension) || mime.startsWith('text/')) {
    return 'code';
  }
  if (
    documentExtensions.has(extension) ||
    mime.includes('officedocument') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('rtf')
  ) {
    return 'document';
  }

  return 'generic';
}

function getDocumentTag(project: ProjectRow) {
  const extension = getFileExtension(getVaultAssetName(project));

  if (extension === 'ppt' || extension === 'pptx') {
    return 'Slide Deck';
  }
  if (extension === 'doc' || extension === 'docx') {
    return 'Word File';
  }
  if (extension === 'xls' || extension === 'xlsx') {
    return 'Spreadsheet';
  }

  return 'Document';
}

function normalizeAuditList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(/\r?\n|[•·]/)
    .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function pickFirstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
  }

  return null;
}

function extractSectionItems(source: string, startPattern: RegExp, endPattern?: RegExp) {
  if (!source.trim()) {
    return [];
  }

  const startMatch = source.match(startPattern);
  if (!startMatch || typeof startMatch.index !== 'number') {
    return [];
  }

  const afterStart = source.slice(startMatch.index + startMatch[0].length);
  const boundedSection = endPattern ? afterStart.split(endPattern)[0] ?? afterStart : afterStart;

  return boundedSection
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^[:\-]$/.test(line));
}

function parseVaultAuditReport(project: ProjectRow): VaultAuditReport {
  const fallbackScore = typeof project.logic_score === 'number' ? Math.round(project.logic_score) : null;
  const fallbackSummary =
    'This asset is stored in your vault, but a structured MeliusAI validation report is not available yet.';

  try {
    if (!project.ai_summary?.trim()) {
      throw new Error('Missing audit payload.');
    }

    const parsed = JSON.parse(project.ai_summary) as {
      score?: unknown;
      logic_score?: unknown;
      logicScore?: unknown;
      summary?: unknown;
      executive_summary?: unknown;
      executiveSummary?: unknown;
      assets?: unknown;
      vulnerabilities?: unknown;
      architectural_assets?: unknown;
      architectural_vulnerabilities?: unknown;
      architecturalAssets?: unknown;
      architecturalVulnerabilities?: unknown;
      breakdown?: {
        strengths?: unknown;
        weaknesses?: unknown;
        assets?: unknown;
        vulnerabilities?: unknown;
      };
    };

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Unsupported audit format.');
    }

    const score = pickFirstNumber(parsed.logicScore, parsed.logic_score, parsed.score, fallbackScore);
    const summary =
      pickFirstString(parsed.executiveSummary, parsed.executive_summary, parsed.summary) ?? fallbackSummary;
    const architecturalAssets =
      normalizeAuditList(parsed.architecturalAssets).length > 0
        ? normalizeAuditList(parsed.architecturalAssets)
        : normalizeAuditList(parsed.architectural_assets).length > 0
          ? normalizeAuditList(parsed.architectural_assets)
          : normalizeAuditList(parsed.assets).length > 0
            ? normalizeAuditList(parsed.assets)
            : normalizeAuditList(parsed.breakdown?.assets).length > 0
              ? normalizeAuditList(parsed.breakdown?.assets)
              : normalizeAuditList(parsed.breakdown?.strengths);
    const architecturalVulnerabilities =
      normalizeAuditList(parsed.architecturalVulnerabilities).length > 0
        ? normalizeAuditList(parsed.architecturalVulnerabilities)
        : normalizeAuditList(parsed.architectural_vulnerabilities).length > 0
          ? normalizeAuditList(parsed.architectural_vulnerabilities)
          : normalizeAuditList(parsed.vulnerabilities).length > 0
            ? normalizeAuditList(parsed.vulnerabilities)
            : normalizeAuditList(parsed.breakdown?.vulnerabilities).length > 0
              ? normalizeAuditList(parsed.breakdown?.vulnerabilities)
              : normalizeAuditList(parsed.breakdown?.weaknesses);

    return {
      score,
      summary,
      architecturalAssets,
      architecturalVulnerabilities,
    };
  } catch {
    const payload = project.ai_summary?.trim() ?? '';
    const summaryMatch = payload.match(
      /(?:executive\s+summary|summary)\s*[:\-]\s*([\s\S]*?)(?=(?:architectural\s+assets|architectural\s+vulnerabilities|$))/i
    );
    const fallbackSummaryText =
      summaryMatch?.[1]?.replace(/\s+/g, ' ').trim() ||
      payload.split(/architectural\s+assets|architectural\s+vulnerabilities/i)[0]?.replace(/\s+/g, ' ').trim() ||
      fallbackSummary;
    const scoreMatch = payload.match(/(?:logic[_\s]?score|score)\s*[:=]\s*(\d{1,3})/i);

    return {
      score: scoreMatch ? Number(scoreMatch[1]) : fallbackScore,
      summary: fallbackSummaryText || fallbackSummary,
      architecturalAssets: extractSectionItems(
        payload,
        /architectural\s+assets\s*[:\-]*/i,
        /architectural\s+vulnerabilities\s*[:\-]*/i
      ),
      architecturalVulnerabilities: extractSectionItems(payload, /architectural\s+vulnerabilities\s*[:\-]*/i),
    };
  }
}

function GenericFilePreview({
  title,
  subtitle,
  tag,
  icon,
  className,
}: {
  title: string;
  subtitle?: string | null;
  tag?: string | null;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full w-full flex-col items-center justify-center gap-3 px-4 py-5 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] border border-white/10 bg-white/5 text-sky-100 shadow-[0_0_30px_rgba(56,189,248,0.12)]">
        {icon ?? <FileIcon className="h-7 w-7" />}
      </div>
      {tag ? (
        <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-100">
          {tag}
        </Badge>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle ? <p className="mx-auto max-w-xl text-xs text-slate-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function CodeCardPreview({ src, language }: { src?: string | null; language?: string | null }) {
  const [remotePreview, setRemotePreview] = useState<{
    src: string | null;
    code: string | null;
  }>({
    src: null,
    code: null,
  });
  const shouldReadRemote = Boolean(src);
  const isReading = shouldReadRemote && remotePreview.src !== src;
  const content = remotePreview.src === src && remotePreview.code?.trim()
    ? remotePreview.code
    : isReading
      ? 'Loading code...'
      : '// Preview not ready for this file yet.';

  useEffect(() => {
    if (!shouldReadRemote || !src) {
      return;
    }

    let active = true;

    void fetch(src)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to read code preview.');
        }
        return response.text();
      })
      .then((text) => {
        if (active) {
          setRemotePreview({ src, code: text.slice(0, 3000) });
        }
      })
      .catch(() => {
        if (active) {
          setRemotePreview({ src, code: '// Preview not ready for this file yet.' });
        }
      });

    return () => {
      active = false;
    };
  }, [shouldReadRemote, src]);

  return (
    <div className="h-full w-full overflow-hidden bg-[#050b17]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#050b17]/95 px-4 py-2 text-xs text-slate-400 backdrop-blur">
        <span>{language ?? 'code'}</span>
        <span>Stored in Vault</span>
      </div>
      <pre className="m-0 min-h-full overflow-hidden p-4 font-mono text-xs leading-6 text-slate-200">
        <code className="block whitespace-pre-wrap break-words">{content}</code>
      </pre>
    </div>
  );
}

function VaultPreviewSurface({ project }: { project: ProjectRow }) {
  const assetName = getVaultAssetName(project);
  const assetUrl = getVaultAssetUrl(project);
  const previewKind = resolvePreviewKind(project);
  const fileType = getVaultAssetFileType(project);
  const fileSizeLabel = getVaultAssetSizeLabel(project);
  const extension = getFileExtension(assetName);

  if (previewKind === 'image') {
    return assetUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={assetUrl} alt={assetName} className="h-full w-full bg-[#050b1b]/80 object-cover" />
    ) : (
      <GenericFilePreview title={assetName} subtitle="Image stored in your vault." tag="Image" icon={<FileIcon className="h-7 w-7" />} />
    );
  }

  if (previewKind === 'video') {
    return assetUrl ? (
      <video src={assetUrl} className="h-full w-full rounded-[inherit] bg-[#050b1b]/80 object-cover" muted playsInline />
    ) : (
      <GenericFilePreview title={assetName} subtitle="Video stored in your vault." tag="Video" icon={<FileIcon className="h-7 w-7" />} />
    );
  }

  if (previewKind === 'audio') {
    return (
      <GenericFilePreview
        title="Audio File"
        subtitle={fileSizeLabel ?? 'Open in a new tab to listen.'}
        tag="Audio"
        icon={<FileIcon className="h-7 w-7" />}
      />
    );
  }

  if (previewKind === 'pdf') {
    if (!assetUrl) {
      return (
        <GenericFilePreview title={assetName} subtitle="PDF stored in your vault." tag="PDF" icon={<DocumentIcon className="h-7 w-7" />} />
      );
    }

    return (
      <iframe
        title={assetName}
        src={`${assetUrl}#toolbar=0&navpanes=0&scrollbar=0`}
        className="pointer-events-none h-full w-full rounded-[inherit]"
      />
    );
  }

  if (previewKind === 'code') {
    return <CodeCardPreview src={assetUrl} language={getCodeLanguage(extension)} />;
  }

  if (previewKind === 'presentation') {
    return (
      <GenericFilePreview
        title={assetName}
        subtitle="Open to view this document."
        tag={getDocumentTag(project)}
        icon={<DocumentIcon className="h-7 w-7" />}
      />
    );
  }

  if (previewKind === 'archive') {
    return (
      <GenericFilePreview
        title={assetName}
        subtitle="Compressed file stored in your vault."
        tag="Package"
        icon={<PackageIcon className="h-7 w-7" />}
      />
    );
  }

  if (previewKind === 'document') {
    return (
      <GenericFilePreview
        title={assetName}
        subtitle={`${fileType} file stored in your vault.`}
        tag={getDocumentTag(project)}
        icon={<DocumentIcon className="h-7 w-7" />}
      />
    );
  }

  return (
    <GenericFilePreview
      title={assetName}
      subtitle={fileSizeLabel ?? `${fileType} file stored in your vault.`}
      tag="Generic File"
      icon={<FileIcon className="h-7 w-7" />}
    />
  );
}

function AuditReportModal({
  project,
  onClose,
}: {
  project: ProjectRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!project) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, project]);

  const report = project ? parseVaultAuditReport(project) : null;
  const assetName = project ? getVaultAssetName(project) : '';
  const assetUrl = project ? getVaultAssetUrl(project) : null;
  const architecturalAssets =
    report && report.architecturalAssets.length > 0
      ? report.architecturalAssets
      : ['This audit payload did not include a structured architectural asset stream.'];
  const architecturalVulnerabilities =
    report && report.architecturalVulnerabilities.length > 0
      ? report.architecturalVulnerabilities
      : ['This audit payload did not include a structured architectural vulnerability stream.'];

  return (
    <AnimatePresence>
      {project && report ? (
        <motion.div
          className="fixed inset-0 w-screen h-screen bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-[90vw] md:w-[70vw] lg:w-[65vw] h-[85vh] max-w-5xl max-h-[55rem] bg-[#060b1e]/95 border border-blue-950/80 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden transition-all duration-300 transform scale-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-blue-950/60 px-6 py-4">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-200">
                MeliusAI Validation Report
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-800 bg-white/[0.03] px-3 py-1 text-xs font-medium text-zinc-400 transition hover:border-cyan-400/40 hover:text-cyan-200"
              >
                [ESC CLOSE]
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-slate-300">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-white">{assetName}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    {project.created_at ? formatVaultAssetDate(project.created_at) : 'Vault asset'}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-right shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Score</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{report.score ?? '--'}</p>
                </div>
              </div>

              <div className="rounded-xl border border-blue-950/50 bg-[#050b1b]/70 p-4 backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Executive Summary</p>
                <p className="mt-2 text-sm italic leading-6 text-zinc-200">{report.summary}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">{'// Architectural Assets'}</p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-300">
                    {architecturalAssets.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.04] p-4">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-rose-300">
                    {'// Architectural Vulnerabilities'}
                  </p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-300">
                    {architecturalVulnerabilities.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {assetUrl ? (
                <div className="flex justify-end">
                  <a
                    href={assetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg border border-blue-950/60 bg-[#071329]/70 px-4 py-2 text-xs font-mono text-zinc-300 transition-colors duration-200 hover:border-cyan-500/30 hover:bg-[#0b1d38]/80"
                  >
                    Launch Raw Asset
                  </a>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function VaultProjectCard({
  project,
  deletingAssetId,
  isVisibilityUpdating,
  verifyingAssetId,
  onVerify,
  onReadProtocol,
  onToggleVisibility,
  onDelete,
}: {
  project: ProjectRow;
  deletingAssetId: string | null;
  isVisibilityUpdating: boolean;
  verifyingAssetId: string | null;
  onVerify: (project: ProjectRow) => void;
  onReadProtocol: (project: ProjectRow) => void;
  onToggleVisibility: (projectId: string, currentVisibilityStatus: boolean) => void;
  onDelete: (projectId: string) => void;
}) {
  const assetName = getVaultAssetName(project);
  const isDeleting = deletingAssetId === project.id;
  const isPublic = project.is_public ?? true;
  const isVerifying = verifyingAssetId === project.id;
  const assetUrl = getVaultAssetUrl(project);
  const arePrimaryActionsDisabled = isDeleting;
  const fileTypeLabel = `${getVaultAssetFileType(project)} File`;
  const fileName = project.file_name || project.name || assetName;

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-slate-800/60 bg-[#090e24] shadow-lg transition-all duration-300 hover:border-slate-700/80">
      <CardContent className="p-0">
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                {fileTypeLabel}
              </span>
              {project.has_been_audited ? (
                <span className="text-[11px] font-medium text-slate-400 bg-slate-950/60 px-2.5 py-0.5 rounded-md border border-slate-800/80 tracking-wide">
                  Score: {project.evaluation_score || project.logic_score || 0}/100
                </span>
              ) : null}
            </div>

            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="mb-1 truncate text-sm font-bold text-slate-100" title={assetName}>
                  {assetName}
                </h3>
                <p className="truncate text-[11px] text-slate-500">{fileName}</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleVisibility(project.id, isPublic);
                }}
                disabled={isVisibilityUpdating}
                className={cn(
                  'shrink-0 rounded px-2 py-0.5 text-[10px] font-mono tracking-wider cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-60',
                  isPublic
                    ? 'border border-cyan-800/80 bg-cyan-950/40 text-cyan-400'
                    : 'border border-blue-950/60 bg-[#071329]/70 text-slate-400'
                )}
                aria-label={`Set ${assetName} visibility to ${isPublic ? 'private' : 'public'}`}
              >
                {isPublic ? 'PUBLIC' : 'PRIVATE'}
              </button>
            </div>

            <div className="relative mb-4 flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-900 bg-slate-950/40">
              <VaultPreviewSurface project={project} />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-auto pt-2 w-full">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReadProtocol(project);
              }}
              className="w-full py-2 px-4 rounded-full bg-[#11162d] border border-slate-800/60 hover:border-slate-700 text-slate-300 hover:text-white font-medium text-[11px] tracking-wide transition-all duration-200 text-center cursor-pointer"
            >
              Read Full Audit Protocol
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onVerify(project);
              }}
              disabled={verifyingAssetId !== null || arePrimaryActionsDisabled || !assetUrl}
              aria-busy={isVerifying}
              className="w-full py-2 px-4 rounded-full bg-[#070a19] border border-slate-900 hover:bg-[#11162d]/50 disabled:bg-slate-950/20 disabled:text-slate-700 text-slate-400 hover:text-slate-200 font-medium text-[11px] tracking-wide transition-all duration-200 text-center cursor-pointer"
            >
              {isVerifying ? 'Auditing Asset...' : 'Verify with MeliusAI'}
            </button>
          </div>

          <div className="mt-2 flex w-full justify-end">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(project.id);
              }}
              disabled={deletingAssetId !== null}
              className="inline-flex items-center justify-center rounded-2xl border border-rose-900/60 bg-[#071329]/60 px-3 py-2 text-rose-300 transition hover:border-rose-800/80 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Delete ${assetName}`}
            >
              {isDeleting ? <span className="font-mono text-[10px]">...</span> : <TrashIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VaultPage() {
  const router = useRouter();
  const authEnabled = hasSupabaseBrowserEnv();
  const [supabase] = useState(() => {
    if (!authEnabled) {
      return null;
    }

    try {
      return createSupabaseBrowserClient();
    } catch {
      return null;
    }
  });
  const [vaultAssets, setVaultAssets] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(authEnabled);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [activePreviewProjectId, setActivePreviewProjectId] = useState<string | null>(null);
  const [activePreviewName, setActivePreviewName] = useState<string | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);
  const [viewingAuditAsset, setViewingAuditAsset] = useState<ProjectRow | null>(null);
  const [liveStreamText, setLiveStreamText] = useState('');
  const [visibilityUpdatingIds, setVisibilityUpdatingIds] = useState<string[]>([]);
  const [visibilityToast, setVisibilityToast] = useState<VaultToastState | null>(null);
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});
  const descriptionSaveTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!authEnabled || !supabase) {
      setLoading(false);
      setViewerId(null);
      setVaultAssets([]);
      setVaultError('Vault sync is unavailable until Supabase browser credentials are configured.');
      return;
    }

    let active = true;

    const resolveViewer = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        if (!active) {
          return;
        }

        if (!user?.id) {
          setViewerId(null);
          setVaultAssets([]);
          setLoading(false);
          router.replace('/auth');
          return;
        }

        setViewerId(user.id);
      } catch (error) {
        console.error('Failed to verify vault viewer', error);

        if (active) {
          setViewerId(null);
          setVaultAssets([]);
          setLoading(false);
          setVaultError('Unable to verify your secure session.');
        }
      }
    };

    void resolveViewer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) {
        return;
      }

      const nextViewerId = session?.user?.id ?? null;
      setViewerId(nextViewerId);

      if (!nextViewerId) {
        setVaultAssets([]);
        setLoading(false);
        router.replace('/auth');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [authEnabled, router, supabase]);

  useEffect(() => {
    if (!supabase || !viewerId) {
      if (!viewerId) {
        setLoading(false);
      }

      return;
    }

    let active = true;

    const fetchVaultAssets = async () => {
      setLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user?.id) {
          if (active) {
            setViewerId(null);
            setVaultAssets([]);
            setVaultError(null);
            router.replace('/auth');
          }
          return;
        }

        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (active) {
          const loadedAssets = Array.isArray(data) ? data : [];
          setViewerId(user.id);
          setVaultError(null);
          setVaultAssets(loadedAssets);
          setDescriptionDrafts((currentDrafts) =>
            Object.fromEntries(
              loadedAssets.map((asset) => [asset.id, currentDrafts[asset.id] ?? asset.description ?? ''])
            )
          );
        }
      } catch (error) {
        console.error('Failed to load vault assets', error);

        if (active) {
          setVaultAssets([]);
          setVaultError('Unable to sync vault assets right now.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchVaultAssets();

    return () => {
      active = false;
    };
  }, [router, supabase, syncToken, viewerId]);

  useEffect(() => {
    if (!supabase || !viewerId) {
      return;
    }

    const channel = supabase
      .channel(`vault-assets-${viewerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        setSyncToken((currentToken) => currentToken + 1);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, viewerId]);

  useEffect(() => {
    if (!visibilityToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisibilityToast((currentToast) => (currentToast?.id === visibilityToast.id ? null : currentToast));
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visibilityToast]);

  useEffect(() => {
    const descriptionSaveTimers = descriptionSaveTimersRef.current;

    return () => {
      Object.values(descriptionSaveTimers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  function handleDescriptionChange(projectId: string, textValue: string) {
    setDescriptionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [projectId]: textValue,
    }));
    setVaultAssets((currentAssets) =>
      currentAssets.map((asset) => (asset.id === projectId ? { ...asset, description: textValue } : asset))
    );

    const previousTimer = descriptionSaveTimersRef.current[projectId];
    if (previousTimer) {
      window.clearTimeout(previousTimer);
    }

    descriptionSaveTimersRef.current[projectId] = window.setTimeout(async () => {
      if (!supabase) {
        return;
      }

      const { error } = await supabase
        .from('projects')
        .update({ description: textValue.trim() || null })
        .eq('id', projectId);

      if (error) {
        console.error('Vault project description sync failed:', error);
        setVisibilityToast({
          id: Date.now(),
          message: 'Description sync failed. Please retry your project notes.',
        });
      }

      delete descriptionSaveTimersRef.current[projectId];
    }, 650);
  }

  async function handleToggleVisibility(projectId: string, currentVisibilityStatus: boolean) {
    if (!supabase || visibilityUpdatingIds.includes(projectId)) {
      return;
    }

    const nextVisibilityStatus = !currentVisibilityStatus;

    setVisibilityUpdatingIds((currentIds) => [...currentIds, projectId]);
    setVaultAssets((currentAssets) =>
      currentAssets.map((asset) =>
        asset.id === projectId
          ? {
              ...asset,
              is_public: nextVisibilityStatus,
            }
          : asset
      )
    );

    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_public: nextVisibilityStatus })
        .eq('id', projectId);

      if (error) {
        console.error('Supabase RLS/Schema Error:', error);
        throw error;
      }
    } catch (error) {
      setVaultAssets((currentAssets) =>
        currentAssets.map((asset) =>
          asset.id === projectId
            ? {
                ...asset,
                is_public: currentVisibilityStatus,
              }
            : asset
        )
      );

      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : '';
      const errorCode =
        typeof error === 'object' && error && 'code' in error && error.code
          ? String(error.code)
          : null;

      let warningReason = 'an unexpected server error interrupted the visibility sync.';

      if (errorCode === '42501' || /row-level security|permission denied|policy/i.test(errorMessage)) {
        warningReason = 'an RLS policy blocked the update request.';
      } else if (errorCode === '42703' || /column|schema|is_public/i.test(errorMessage)) {
        warningReason = 'the projects schema is missing the is_public column or is out of sync.';
      } else if (/fetch|network|timeout|failed to fetch|load failed/i.test(errorMessage)) {
        warningReason = 'a network issue interrupted the update request.';
      }

      console.warn(`Vault visibility toggle reverted because ${warningReason}`, error);
      setVisibilityToast({
        id: Date.now(),
        message: 'Visibility sync failed. Restoring the previous access state.',
      });
    } finally {
      setVisibilityUpdatingIds((currentIds) => currentIds.filter((id) => id !== projectId));
    }
  }

  async function handleVerifyWithMeliusAI(project: ProjectRow) {
    if (!supabase || verifyingAssetId || deletingAssetId) {
      return;
    }

    const fileUrl = getVaultAssetUrl(project);

    if (!fileUrl) {
      const missingFileMessage =
        'Verification Failed: This asset does not contain a valid storage file link (file_url is missing).';
      setVaultError(missingFileMessage);
      window.alert(`❌ ${missingFileMessage}`);
      return;
    }

    setVerifyingAssetId(project.id);
    setLiveStreamText('');
    setVaultError(null);
    if (descriptionSaveTimersRef.current[project.id]) {
      window.clearTimeout(descriptionSaveTimersRef.current[project.id]);
      delete descriptionSaveTimersRef.current[project.id];
    }

    try {
      const accumulatedReportText = await streamAssetAudit({
        fileUrl,
        filename: project.file_name || `asset_${project.id.slice(0, 5)}.pptx`,
        instruction: `Run a full MeliusAI asset audit for this vault file.
Project Title: ${getVaultAssetName(project)}
Current Notes: ${project.description || 'No existing project notes.'}
Return Markdown sections for goods, bads, project description, and a final score out of 100.`,
        onChunk: (incomingTokens) => {
          setLiveStreamText((previousText) => previousText + incomingTokens);
        },
      });
      const extractedScore = extractEvaluationScore(accumulatedReportText);
      const updatePayload = {
        ai_summary: accumulatedReportText,
        description: accumulatedReportText,
        evaluation_score: extractedScore,
        has_been_audited: true,
        logic_score: extractedScore,
      };
      const { error } = await supabase.from('projects').update(updatePayload).eq('id', project.id);

      if (error) {
        throw new Error(`Supabase Database Sync Failed: ${error.message}`);
      }

      setVaultAssets((currentAssets) =>
        currentAssets.map((asset) =>
          asset.id === project.id
            ? {
                ...asset,
                ...updatePayload,
              }
            : asset
        )
      );
      setDescriptionDrafts((currentDrafts) => ({
        ...currentDrafts,
        [project.id]: accumulatedReportText,
      }));
      setViewingAuditAsset((currentAsset) =>
        currentAsset?.id === project.id
          ? {
              ...currentAsset,
              ...updatePayload,
            }
          : currentAsset
      );
      window.alert(`Verification Complete! ${getVaultAssetName(project)} has been successfully audited.`);
    } catch (error) {
      console.error('Detailed Verification Diagnostic Log:', error);
      const message = error instanceof Error ? error.message : 'FastAPI Agent Reviewer failed.';
      setVaultError(message);
      window.alert(`Verification Failed: ${message}`);
    } finally {
      setVerifyingAssetId(null);
    }
  }

  function handleReadFullAuditProtocol(project: ProjectRow) {
    if (!project.has_been_audited) {
      window.alert(
        "This asset file has not been verified yet. Please click 'Verify Asset' to run the scanner first!"
      );
      return;
    }

    setViewingAuditAsset(project);
  }

  async function handleDeleteVaultAsset(id: string) {
    if (deletingAssetId) {
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this asset and its MeliusAI validation history?'
    );

    if (!confirmed) {
      return;
    }

    setDeletingAssetId(id);
    setVaultError(null);

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? 'Unable to delete project.');
      }

      setVaultAssets((currentAssets) => currentAssets.filter((asset) => asset.id !== id));
      setDescriptionDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[id];
        return nextDrafts;
      });
      if (descriptionSaveTimersRef.current[id]) {
        window.clearTimeout(descriptionSaveTimersRef.current[id]);
        delete descriptionSaveTimersRef.current[id];
      }
      setViewingAuditAsset((currentAsset) => (currentAsset?.id === id ? null : currentAsset));
      setActivePreviewProjectId((currentPreviewId) => (currentPreviewId === id ? null : currentPreviewId));
      if (activePreviewProjectId === id) {
        setActivePreviewName(null);
        setActivePreviewUrl(null);
      }
    } catch (error) {
      console.error('Failed to delete vault asset', error);
      setVaultError('Unable to delete this asset right now.');
    } finally {
      setDeletingAssetId(null);
    }
  }

  return (
    <>
      <main className="relative flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-white">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(0,112,243,0.16),transparent_55%)]" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative z-10 flex h-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto"
        >
          <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-white">Storage Vault</h1>
                <p className="mt-1 text-sm text-zinc-400">Your private vault for all your projects</p>
              </div>

              <Badge variant="outline" className="w-fit border-white/10 text-slate-200">
                Total Assets Committed: {vaultAssets.length}
              </Badge>
            </div>

            {vaultError ? (
              <div className="rounded-2xl border border-red-950/70 bg-red-950/20 px-4 py-3 font-mono text-xs text-red-200">
                [ Vault Sync Warning: {vaultError} ]
              </div>
            ) : null}

            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                    <CardContent className="p-0">
                      <div className="flex h-full flex-col p-5 sm:p-6">
                        <div className="h-5 w-2/3 animate-pulse rounded-full bg-white/10" />
                        <div className="mt-2 h-4 w-1/3 animate-pulse rounded-full bg-white/5" />
                        <div className="mt-5 h-36 animate-pulse rounded-2xl border border-blue-950/50 bg-[#050b1b]/60" />
                        <div className="mt-4 flex gap-3">
                          <div className="h-10 flex-1 animate-pulse rounded-2xl bg-[#071329]/60" />
                          <div className="h-10 w-12 animate-pulse rounded-2xl bg-[#071329]/60" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : vaultError ? null : vaultAssets.length === 0 ? (
              <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                <CardContent className="p-8">
                  <div className="rounded-2xl border border-dashed border-blue-950/60 py-20 text-center font-mono text-xs text-slate-500">
                    [ Storage Empty: No active project assets committed to this security protocol. ]
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {vaultAssets.map((project) => (
                  <VaultProjectCard
                    key={project.id}
                    project={project}
                    deletingAssetId={deletingAssetId}
                    isVisibilityUpdating={visibilityUpdatingIds.includes(project.id)}
                    verifyingAssetId={verifyingAssetId}
                    onVerify={(selectedProject) => void handleVerifyWithMeliusAI(selectedProject)}
                    onReadProtocol={handleReadFullAuditProtocol}
                    onToggleVisibility={(projectId, currentVisibilityStatus) =>
                      void handleToggleVisibility(projectId, currentVisibilityStatus)
                    }
                    onDelete={(projectId) => void handleDeleteVaultAsset(projectId)}
                  />
                ))}
              </div>
            )}
          </section>
        </motion.div>
      </main>

      <AnimatePresence>
        {visibilityToast ? (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-rose-900/70 bg-[#050b1b]/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
          >
            <p className="font-mono text-[11px] tracking-wide text-rose-300">{visibilityToast.message}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {viewingAuditAsset ? (
        <AuditReviewModal
          assetTitle={getVaultAssetName(viewingAuditAsset)}
          onClose={() => setViewingAuditAsset(null)}
          reportText={
            verifyingAssetId === viewingAuditAsset.id && liveStreamText.trim()
              ? liveStreamText
              : viewingAuditAsset.description ?? viewingAuditAsset.ai_summary ?? ''
          }
        />
      ) : null}

      <AssetPreviewModal
        activePreviewName={activePreviewName}
        activePreviewUrl={activePreviewUrl}
        onClose={() => {
          setActivePreviewProjectId(null);
          setActivePreviewName(null);
          setActivePreviewUrl(null);
        }}
      />
    </>
  );
}
