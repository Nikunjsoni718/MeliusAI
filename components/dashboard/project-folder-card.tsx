'use client';

import { FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ProjectFolderCardProps = {
  averageScore?: number | null;
  className?: string;
  fileCount: number;
  name: string;
  onClick: () => void;
};

export function ProjectFolderCard({
  averageScore = null,
  className,
  fileCount,
  name,
  onClick,
}: ProjectFolderCardProps) {
  const fileLabel = `${fileCount} ${fileCount === 1 ? 'file' : 'files'}`;

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
        'group relative w-full cursor-pointer overflow-hidden rounded-2xl border border-cyan-900/40 bg-[#081126] shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/50 hover:shadow-cyan-950/30',
        className
      )}
      aria-label={`Open ${name}`}
    >
      <CardContent className="flex min-h-[18rem] flex-col justify-between p-5">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
              <FolderOpen className="h-7 w-7" strokeWidth={1.7} />
            </div>
            <Badge variant="outline" className="border-cyan-400/25 bg-cyan-500/10 text-cyan-100">
              {fileLabel}
            </Badge>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
              Folder Project
            </p>
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-white" title={name}>
              {name}
            </h3>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-xs text-slate-400">Open project files</span>
          {averageScore !== null ? (
            <span className="rounded-full border border-slate-700/70 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-200">
              Avg {averageScore}/100
            </span>
          ) : (
            <span className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs text-slate-500">
              Not scored
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
