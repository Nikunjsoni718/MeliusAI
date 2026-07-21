'use client';

import { File, FolderOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ProjectRow } from '@/types/supabase';

type ProjectFolderCardProps = {
  averageScore?: number | null;
  className?: string;
  fileCount: number;
  files?: ProjectRow[];
  isVerifying?: boolean;
  name: string;
  onClick: () => void;
  onVerify?: () => void;
};

function getFileName(file: ProjectRow) {
  return file.name?.split('/').pop()?.trim() || file.title?.trim() || 'Untitled file';
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.trim().toUpperCase();

  return extension && extension !== fileName.toUpperCase() ? extension : 'FILE';
}

export function ProjectFolderCard({
  averageScore = null,
  className,
  fileCount,
  files = [],
  isVerifying = false,
  name,
  onClick,
  onVerify,
}: ProjectFolderCardProps) {
  const fileLabel = `${fileCount} ${fileCount === 1 ? 'File' : 'Files'}`;
  const topFiles = files.slice(0, 4);
  const hiddenFileCount = Math.max(fileCount - topFiles.length, 0);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'relative w-full cursor-pointer overflow-hidden rounded-2xl border border-slate-800/60 bg-[#090e24] shadow-lg transition-all duration-300 hover:border-slate-700/80',
        className
      )}
      aria-label={`Open ${name}`}
    >
      <CardContent className="p-0">
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                WORKSPACE
              </span>
              <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-slate-400">
                {averageScore !== null ? `Score: ${averageScore}/100` : fileLabel}
              </span>
            </div>

            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="mb-1 truncate text-sm font-bold text-slate-100" title={name}>
                  {name}
                </h3>
                <p className="truncate text-[11px] text-slate-500">{fileLabel} in this workspace</p>
              </div>
              <div className="shrink-0 rounded px-2 py-0.5 text-[10px] font-mono tracking-wider text-slate-400">
                <FolderOpen className="h-4 w-4" strokeWidth={1.7} />
              </div>
            </div>

            <div className="relative mb-4 flex h-32 w-full overflow-hidden rounded-xl border border-slate-900 bg-slate-950/40">
              <div className="h-full w-full overflow-hidden bg-[#050b17]">
                <div className="flex items-center justify-between border-b border-white/10 bg-[#050b17]/95 px-4 py-2 text-xs text-slate-400 backdrop-blur">
                  <span>directory</span>
                  <span>{fileLabel}</span>
                </div>
                <div className="space-y-2 p-4 font-mono text-xs leading-5 text-slate-300">
                  {topFiles.length > 0 ? (
                    topFiles.map((file) => {
                      const fileName = getFileName(file);

                      return (
                        <div key={file.id} className="flex min-w-0 items-center gap-2">
                          <File className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" strokeWidth={1.7} />
                          <span className="shrink-0 rounded border border-slate-800 bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">
                            {getFileExtension(fileName)}
                          </span>
                          <span className="truncate text-slate-200">{fileName}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500">
                      <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.7} />
                      <span>No files indexed yet.</span>
                    </div>
                  )}
                  {hiddenFileCount > 0 ? (
                    <div className="pl-5 text-[11px] text-slate-500">
                      + {hiddenFileCount} more {hiddenFileCount === 1 ? 'file' : 'files'}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto flex w-full flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
              }}
              className="w-full cursor-pointer rounded-full border border-slate-800/60 bg-[#11162d] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-slate-300 transition-all duration-200 hover:border-slate-700 hover:text-white"
            >
              Open Workspace
            </button>
            {onVerify ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onVerify();
                }}
                disabled={isVerifying}
                aria-busy={isVerifying}
                className="w-full cursor-pointer rounded-full border border-slate-900 bg-[#070a19] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-slate-400 transition-all duration-200 hover:bg-[#11162d]/50 hover:text-slate-200 disabled:cursor-not-allowed disabled:bg-slate-950/20 disabled:text-slate-700"
              >
                {isVerifying ? 'Verifying...' : 'Verify with MeliusAI'}
              </button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
