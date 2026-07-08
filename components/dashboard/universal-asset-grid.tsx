'use client';

import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { AssetPreviewModal } from '@/components/dashboard/asset-preview-modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ProjectFolderRow, ProjectRow } from '@/types/supabase';

type AssetPreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'code'
  | 'presentation'
  | 'archive'
  | 'document'
  | 'generic';

type UniversalAssetGridProps = {
  assets: ProjectRow[];
  className?: string;
  deletingAssetId?: string | null;
  emptyMessage?: string;
  folders?: ProjectFolderRow[];
  gridClassName?: string;
  isSpectator?: boolean;
  verifyingAssetId?: string | null;
  visibilityUpdatingIds?: string[];
  onDelete?: (projectId: string) => void;
  onFolderOpen?: (folder: ProjectFolderRow) => void;
  onProjectUpdated?: (projectId: string, projectPatch: Partial<ProjectRow>) => void;
  onReadProtocol?: (project: ProjectRow) => void;
  onToggleVisibility?: (projectId: string, currentVisibilityStatus: boolean) => void;
  onVerify?: (project: ProjectRow, event?: MouseEvent<HTMLButtonElement>) => void;
};

type UniversalGridItem =
  | { type: 'folder'; folder: ProjectFolderRow }
  | { type: 'asset'; asset: ProjectRow };

const codeLanguageMap: Record<string, string> = {
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  csv: 'csv',
  cxx: 'cpp',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  go: 'go',
  h: 'c',
  hs: 'haskell',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  kts: 'kotlin',
  lua: 'lua',
  m: 'objective-c',
  md: 'markdown',
  mjs: 'javascript',
  mm: 'objective-cpp',
  php: 'php',
  pl: 'perl',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  scala: 'scala',
  scss: 'scss',
  sh: 'bash',
  sql: 'sql',
  svelte: 'svelte',
  swift: 'swift',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  txt: 'text',
  vue: 'vue',
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

async function readRemoteTextAsUtf8(src: string) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('Unable to read code preview.');
  }

  return response.text();
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

export function getUniversalAssetName(project: ProjectRow) {
  return project.name?.trim() || project.file_name?.trim() || project.title?.trim() || 'Untitled Asset';
}

export function getUniversalAssetUrl(project: ProjectRow) {
  return project.file_url?.trim() || project.source_url?.trim() || null;
}

function getUniversalAssetFileType(project: ProjectRow) {
  const extension = getFileExtension(getUniversalAssetName(project));

  if (extension) {
    return extension.toUpperCase();
  }

  if (project.file_type) {
    return project.file_type.split('/').pop()?.toUpperCase() ?? 'FILE';
  }

  return project.source_kind?.toUpperCase() ?? 'FILE';
}

function getUniversalAssetSizeLabel(project: ProjectRow) {
  return formatFileSize(project.file_size);
}

function getAssetScore(project: ProjectRow) {
  const score = project.evaluation_score ?? project.logic_score ?? project.score ?? null;

  return typeof score === 'number' && Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : null;
}

function resolvePreviewKind(project: ProjectRow): AssetPreviewKind {
  const fileName = getUniversalAssetName(project);
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
  const extension = getFileExtension(getUniversalAssetName(project));

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

    void readRemoteTextAsUtf8(src)
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

function UniversalPreviewSurface({ project }: { project: ProjectRow }) {
  const assetName = getUniversalAssetName(project);
  const assetUrl = getUniversalAssetUrl(project);
  const previewKind = resolvePreviewKind(project);
  const fileType = getUniversalAssetFileType(project);
  const fileSizeLabel = getUniversalAssetSizeLabel(project);
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

function UniversalAssetCard({
  project,
  isSpectator,
  deletingAssetId,
  isVisibilityUpdating,
  verifyingAssetId,
  onDelete,
  onPreview,
  onReadProtocol,
  onToggleVisibility,
  onVerify,
}: {
  project: ProjectRow;
  isSpectator: boolean;
  deletingAssetId: string | null;
  isVisibilityUpdating: boolean;
  verifyingAssetId: string | null;
  onDelete?: (projectId: string) => void;
  onPreview: (project: ProjectRow) => void;
  onReadProtocol?: (project: ProjectRow) => void;
  onToggleVisibility?: (projectId: string, currentVisibilityStatus: boolean) => void;
  onVerify?: (project: ProjectRow, event?: MouseEvent<HTMLButtonElement>) => void;
}) {
  const assetName = getUniversalAssetName(project);
  const isDeleting = deletingAssetId === project.id;
  const isPublic = project.is_public ?? true;
  const isVerifying = verifyingAssetId === project.id;
  const hasCompletedAudit = Boolean(project.has_been_audited);
  const assetUrl = getUniversalAssetUrl(project);
  const score = getAssetScore(project);
  const arePrimaryActionsDisabled = isDeleting;
  const fileTypeLabel = `${getUniversalAssetFileType(project)} File`;
  const fileName = project.file_name || project.name || assetName;

  function handlePreviewClick(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();

    if (assetUrl) {
      onPreview(project);
    }
  }

  function handlePreviewKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.key === 'Enter' || e.key === ' ') && assetUrl) {
      e.preventDefault();
      e.stopPropagation();
      onPreview(project);
    }
  }

  return (
    <Card className="relative w-full overflow-hidden rounded-2xl border border-slate-800/60 bg-[#090e24] shadow-lg transition-all duration-300 hover:border-slate-700/80">
      <CardContent className="p-0">
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                {fileTypeLabel}
              </span>
              {score !== null ? (
                <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-slate-400">
                  Score: {score}/100
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
              {!isSpectator && onToggleVisibility ? (
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
              ) : null}
            </div>

            <div
              role="button"
              tabIndex={assetUrl ? 0 : -1}
              aria-disabled={!assetUrl}
              onClick={handlePreviewClick}
              onKeyDown={handlePreviewKeyDown}
              className="group relative mb-4 flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-slate-900 bg-slate-950/40 text-left transition hover:border-cyan-500/35 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-default disabled:hover:border-slate-900"
              aria-label={`Preview ${assetName}`}
            >
              <UniversalPreviewSurface project={project} />
              {assetUrl ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-8 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-200 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Full Focus Mode
                </span>
              ) : null}
            </div>
          </div>

          {onReadProtocol || (!isSpectator && onVerify) ? (
            <div className="mt-auto flex w-full flex-col gap-2 pt-2">
              {onReadProtocol ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onReadProtocol(project);
                  }}
                  className="w-full cursor-pointer rounded-full border border-slate-800/60 bg-[#11162d] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-slate-300 transition-all duration-200 hover:border-slate-700 hover:text-white"
                >
                  Read Full Audit Protocol
                </button>
              ) : null}

              {!isSpectator && onVerify ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onVerify(project, event);
                  }}
                  disabled={verifyingAssetId !== null || arePrimaryActionsDisabled || !assetUrl}
                  aria-busy={isVerifying}
                  className="w-full cursor-pointer rounded-full border border-slate-900 bg-[#070a19] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-slate-400 transition-all duration-200 hover:bg-[#11162d]/50 hover:text-slate-200 disabled:bg-slate-950/20 disabled:text-slate-700"
                >
                  {isVerifying ? 'Auditing Asset...' : hasCompletedAudit ? 'AI Audit Completed' : 'Verify with MeliusAI'}
                </button>
              ) : null}
            </div>
          ) : null}

          {!isSpectator && onDelete ? (
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
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function UniversalFolderCard({
  folder,
  onOpen,
}: {
  folder: ProjectFolderRow;
  onOpen?: (folder: ProjectFolderRow) => void;
}) {
  const folderName = folder.name || 'Untitled Folder';

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onOpen) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(folder);
    }
  }

  return (
    <div
      className="project-folder-card card min-h-[252px] rounded-2xl"
      data-folder-id={folder.id}
      data-folder-name={folderName}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(folder)}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${folderName}`}
    >
      <div className="folder-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2" width="40" height="40" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <h3 className="folder-name">{folderName}</h3>
      <p className="folder-meta">Project Folder</p>
    </div>
  );
}

export function UniversalAssetGrid({
  assets,
  className,
  deletingAssetId = null,
  emptyMessage = 'No verified Vault assets found yet.',
  folders = [],
  gridClassName,
  isSpectator = false,
  verifyingAssetId = null,
  visibilityUpdatingIds = [],
  onDelete,
  onFolderOpen,
  onProjectUpdated,
  onReadProtocol,
  onToggleVisibility,
  onVerify,
}: UniversalAssetGridProps) {
  const [activePreviewProjectId, setActivePreviewProjectId] = useState<string | null>(null);
  const [localProjectPatches, setLocalProjectPatches] = useState<Record<string, Partial<ProjectRow>>>({});
  const patchedAssets = useMemo(
    () =>
      assets
        .map((asset) => ({ ...asset, ...(localProjectPatches[asset.id] ?? {}) }))
        .sort((a, b) => {
          const rightDate = b.created_at ? new Date(b.created_at).getTime() : 0;
          const leftDate = a.created_at ? new Date(a.created_at).getTime() : 0;
          return rightDate - leftDate;
        }),
    [assets, localProjectPatches]
  );
  const sortedFolders = useMemo(
    () =>
      [...folders].sort((a, b) => {
        const rightDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        const leftDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        return rightDate - leftDate;
      }),
    [folders]
  );
  const gridItems = useMemo<UniversalGridItem[]>(
    () =>
      [
        ...sortedFolders.map((folder) => ({
          type: 'folder' as const,
          folder,
        })),
        ...patchedAssets.map((asset) => ({
          type: 'asset' as const,
          asset,
        })),
      ].sort((left, right) => {
        const leftDate = left.type === 'folder' ? left.folder.created_at : left.asset.created_at;
        const rightDate = right.type === 'folder' ? right.folder.created_at : right.asset.created_at;
        const leftTime = leftDate ? new Date(leftDate).getTime() : 0;
        const rightTime = rightDate ? new Date(rightDate).getTime() : 0;
        return rightTime - leftTime;
      }),
    [patchedAssets, sortedFolders]
  );
  const activePreviewProject = activePreviewProjectId
    ? patchedAssets.find((project) => project.id === activePreviewProjectId) ?? null
    : null;
  const activePreviewModalProject = activePreviewProject
    ? {
        ...activePreviewProject,
        title: activePreviewProject.title ?? getUniversalAssetName(activePreviewProject),
      }
    : null;

  function handleProjectUpdated(projectId: string, projectPatch: Partial<ProjectRow>) {
    setLocalProjectPatches((currentPatches) => ({
      ...currentPatches,
      [projectId]: {
        ...(currentPatches[projectId] ?? {}),
        ...projectPatch,
      },
    }));
    onProjectUpdated?.(projectId, projectPatch);
  }

  if (gridItems.length === 0) {
    return <p className={cn('text-sm text-zinc-600', className)}>{emptyMessage}</p>;
  }

  return (
    <>
      <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full', gridClassName, className)}>
        {gridItems.map((item) =>
          item.type === 'folder' ? (
            <UniversalFolderCard
              key={`folder-${item.folder.id}`}
              folder={item.folder}
              onOpen={onFolderOpen}
            />
          ) : (
            <UniversalAssetCard
              key={item.asset.id}
              project={item.asset}
              isSpectator={isSpectator}
              deletingAssetId={deletingAssetId}
              isVisibilityUpdating={visibilityUpdatingIds.includes(item.asset.id)}
              verifyingAssetId={verifyingAssetId}
              onDelete={onDelete}
              onPreview={(selectedProject) => setActivePreviewProjectId(selectedProject.id)}
              onReadProtocol={onReadProtocol}
              onToggleVisibility={onToggleVisibility}
              onVerify={onVerify}
            />
          )
        )}
      </div>

      <AssetPreviewModal
        activePreviewName={activePreviewProject ? getUniversalAssetName(activePreviewProject) : null}
        activePreviewUrl={activePreviewProject ? getUniversalAssetUrl(activePreviewProject) : null}
        canVerify={!isSpectator && Boolean(onVerify)}
        previewProject={activePreviewModalProject}
        onProjectUpdated={(projectId, projectPatch) =>
          handleProjectUpdated(projectId, projectPatch as Partial<ProjectRow>)
        }
        onClose={() => setActivePreviewProjectId(null)}
      />
    </>
  );
}

export default UniversalAssetGrid;
