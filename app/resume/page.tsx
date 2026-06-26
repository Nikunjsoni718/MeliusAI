'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, Code2, FileText, FolderLock, Globe2, House, Maximize2, Play, Search, UserRound, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import type { ProfileRow, ProjectRow } from '@/types/supabase';

type ResumeStatus = string;
type SaveState = 'idle' | 'saving' | 'saved';
type ResumeExternalLink = {
  label: string;
  href: string;
};
type ResumeFormData = {
  name: string;
  age: string;
  status: ResumeStatus;
  qualifications: string[];
  experience: string[];
  hobbies: string[];
  skills: string[];
  featuredProjectIds: string[];
  externalLinks: ResumeExternalLink[];
};
type ResumeFields = Pick<
  ProfileRow,
  | 'id'
  | 'username'
  | 'full_name'
  | 'avatar_url'
  | 'age'
  | 'current_status'
  | 'qualifications'
  | 'experience'
  | 'hobbies'
  | 'skills'
  | 'resume_projects'
  | 'external_links'
> & {
  name?: string | null;
  status?: string | null;
};
type SpectatorResumeResponse = {
  profile?: ResumeFields | null;
  projects?: ProjectRow[] | null;
  detail?: string;
  message?: string;
};

const statusOptions: ResumeStatus[] = ['Studying', 'Working', 'Looking for an Opportunity'];
const BASE_RESUME_SELECT = 'id, username, full_name, avatar_url, age, current_status, qualifications, skills, experience, hobbies';
const EXTENDED_RESUME_SELECT = `${BASE_RESUME_SELECT}, resume_projects, external_links`;
const PROFILE_SPECTATOR_BASE_URL = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');
const navigationItems = [
  { href: '/profile', label: 'Home', icon: House },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/vault', label: 'Vault', icon: FolderLock },
  { href: '/resume', label: 'Resume', icon: FileText },
];
const fallbackSkills = ['React', 'Next.js', 'Python', 'UI/UX'];
const fallbackExternalLinks: ResumeExternalLink[] = [
  { label: 'GitHub', href: 'https://github.com' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com' },
  { label: 'Portfolio', href: 'https://example.com' },
];

function SidebarLink({
  active,
  href,
  icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-blue-950/30 transition-all duration-200 group',
        active ? 'bg-blue-950/35 text-white' : null
      )}
    >
      <span className="text-slate-400 transition-colors group-hover:text-cyan-400">{icon}</span>
      <span className="font-sans text-sm tracking-wide">{label}</span>
    </Link>
  );
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normalizeExternalLinks(value: unknown): ResumeExternalLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const label = typeof row.label === 'string' ? row.label : '';
      const href = typeof row.href === 'string' ? row.href : '';

      return { label, href };
    })
    .filter((item): item is ResumeExternalLink => item !== null);
}

function createDefaultFormData(): ResumeFormData {
  return {
    name: '',
    age: '',
    status: '',
    qualifications: [],
    experience: [],
    hobbies: [],
    skills: fallbackSkills,
    featuredProjectIds: [],
    externalLinks: fallbackExternalLinks,
  };
}

function getAssetName(project: ProjectRow) {
  return project.name?.trim() || project.file_name?.trim() || project.title?.trim() || 'Untitled Vault Asset';
}

function getAssetUrl(project: ProjectRow) {
  return project.file_url?.trim() || project.source_url?.trim() || null;
}

function getAssetSubtitle(project: ProjectRow) {
  return project.file_type?.trim() || project.source_kind?.trim() || project.status?.trim() || 'Vault asset';
}

function getAssetExtension(project: ProjectRow) {
  const fileType = project.file_type?.toLowerCase() ?? '';

  if (fileType.includes('pdf')) {
    return 'pdf';
  }

  if (fileType.includes('wordprocessingml') || fileType.includes('msword')) {
    return 'docx';
  }

  if (fileType.startsWith('video/')) {
    return fileType.split('/').pop() || 'video';
  }

  if (fileType.startsWith('image/')) {
    return fileType.split('/').pop() || 'image';
  }

  const source = [project.file_name, project.name, project.title, project.file_url, project.source_url]
    .find((value) => typeof value === 'string' && value.trim().includes('.'))
    ?.trim();
  const cleanSource = source?.split('?')[0]?.split('#')[0] ?? '';
  const extension = cleanSource.match(/\.([a-z0-9]+)$/i)?.[1];

  return extension?.toLowerCase() ?? 'file';
}

function isVideoAsset(project: ProjectRow) {
  return Boolean(project.file_type?.toLowerCase().startsWith('video/')) ||
    ['mp4', 'webm', 'mov', 'm4v', 'ogg', 'quicktime'].includes(getAssetExtension(project));
}

function isPdfAsset(project: ProjectRow) {
  return getAssetExtension(project) === 'pdf';
}

function isImageAsset(project: ProjectRow) {
  return Boolean(project.file_type?.toLowerCase().startsWith('image/')) ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(getAssetExtension(project));
}

function getAssetScore(project: ProjectRow) {
  const extendedProject = project as ProjectRow & {
    ai_score?: number | string | null;
    marks?: number | string | null;
  };
  const rawScore =
    extendedProject.logic_score ??
    extendedProject.evaluation_score ??
    extendedProject.score ??
    extendedProject.marks ??
    extendedProject.ai_score ??
    null;
  const score = typeof rawScore === 'number' ? rawScore : Number(rawScore);

  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;
}

function getAssetSummary(project: ProjectRow) {
  const summary =
    project.ai_summary?.trim() ||
    project.summary?.trim() ||
    project.user_description?.trim() ||
    project.description?.trim() ||
    '';

  return summary.replace(/##\s*Executive Summary/i, '').trim();
}

function isVerifiedAsset(project: ProjectRow) {
  return Boolean(project.has_been_audited || getAssetScore(project) !== null);
}

function getTopScoringAssets(assets: ProjectRow[]) {
  return [...assets]
    .filter(isVerifiedAsset)
    .sort((left, right) => {
      const scoreDifference = (getAssetScore(right) ?? 0) - (getAssetScore(left) ?? 0);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime();
    })
    .slice(0, 4);
}

function isMissingOptionalProfileColumn(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? '';

  return (
    error?.code === 'PGRST204' ||
    message.includes('resume_projects') ||
    message.includes('external_links') ||
    message.includes('could not find')
  );
}

function getExternalLinkIcon(label: string) {
  const normalizedLabel = label.toLowerCase();

  if (normalizedLabel.includes('github')) {
    return Code2;
  }

  if (normalizedLabel.includes('linkedin')) {
    return Briefcase;
  }

  return Globe2;
}

function EditableStringListSection({
  addLabel,
  emptyLabel,
  isEditing,
  items,
  label,
  onAdd,
  onDelete,
  onUpdate,
  placeholder,
  variant = 'bullet',
}: {
  addLabel: string;
  emptyLabel: string;
  isEditing: boolean;
  items: string[];
  label: string;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, value: string) => void;
  placeholder: string;
  variant?: 'bullet' | 'pill';
}) {
  const visibleItems = items.filter((item) => item.trim());

  return (
    <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
      <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      {isEditing ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${label}-${index}`} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(event) => onUpdate(index, event.target.value)}
                placeholder={placeholder}
                className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
              />
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-900/50 bg-rose-950/20 text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-950/35"
                aria-label={`Delete ${label} item`}
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/45 hover:bg-cyan-500/15"
          >
            + Add New {addLabel}
          </button>
        </div>
      ) : visibleItems.length > 0 ? (
        variant === 'pill' ? (
          <div className="flex flex-wrap gap-2">
            {visibleItems.map((item, index) => (
              <div
                key={`${item}-${index}`}
                className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200"
              >
                {item}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center gap-2 text-sm text-zinc-300 font-sans">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="text-sm text-zinc-600">{emptyLabel}</p>
      )}
    </div>
  );
}

function EditableProjectsSection({
  assets,
  isEditing,
  onFocusProject,
}: {
  assets: ProjectRow[];
  isEditing: boolean;
  onFocusProject: (project: ProjectRow) => void;
}) {
  const visibleProjects = assets;

  const renderScoreBadge = (project: ProjectRow) => {
    const score = getAssetScore(project);

    return score !== null ? (
      <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-slate-400">
        Score: {score}/100
      </span>
    ) : (
      <span className="rounded-md border border-slate-800/80 bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-slate-500">
        Pending verification
      </span>
    );
  };

  const renderAssetSummary = (project: ProjectRow) => (
    getAssetSummary(project) || 'AI parsing summary will appear here after the asset is verified.'
  );

  const renderThumbnail = (project: ProjectRow) => {
    const assetUrl = getAssetUrl(project);
    const extension = getAssetExtension(project).toUpperCase();
    const isVideo = isVideoAsset(project);
    const isImage = isImageAsset(project);

    return (
      <button
        type="button"
        onClick={() => onFocusProject(project)}
        className="group relative mt-4 h-32 w-full cursor-pointer overflow-hidden rounded-md border border-slate-800/70 bg-slate-800 text-left transition-all duration-300 hover:border-cyan-500/35 hover:shadow-[0_0_24px_rgba(6,182,212,0.12)] focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
        aria-label={`Open full focus view for ${getAssetName(project)}`}
      >
        {isVideo && assetUrl ? (
          <video
            src={assetUrl}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
          />
        ) : isImage && assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl}
            alt=""
            className="h-full w-full object-cover opacity-85 transition duration-300 group-hover:scale-[1.02] group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(8,13,31,0.96))] px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <FileText className="h-6 w-6" strokeWidth={1.6} />
            </div>
            <span className="rounded-full border border-slate-700/80 bg-slate-950/50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
              {extension}
            </span>
          </div>
        )}
        {isVideo ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-xl">
              <Play className="h-5 w-5 fill-current" strokeWidth={1.7} />
            </span>
          </span>
        ) : null}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-2 pt-8 text-[11px] font-medium text-slate-200 opacity-95">
          <span>Full focus</span>
          <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300">
      <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">Featured Projects</p>
      {isEditing ? (
        <p className="mb-4 text-sm leading-6 text-slate-400">
          Your top 4 highest-scoring projects are automatically featured on your public profile.
        </p>
      ) : null}
      {visibleProjects.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleProjects.map((project) => (
            <article
              key={project.id}
              className="rounded-2xl border border-slate-800/60 bg-[#090e24] p-5 shadow-lg transition-all duration-300 hover:border-slate-700/80"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  {getAssetSubtitle(project)}
                </span>
                {renderScoreBadge(project)}
              </div>
              <h2 className="truncate text-sm font-bold text-slate-100" title={getAssetName(project)}>
                {getAssetName(project)}
              </h2>
              {renderThumbnail(project)}
              <p className="mt-4 line-clamp-4 text-sm leading-6 text-zinc-400">
                {renderAssetSummary(project)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No verified Vault assets found yet. Upload and verify assets from Home or Vault to feature them here.</p>
      )}
    </div>
  );
}

function FeaturedProjectFocusModal({
  onClose,
  project,
}: {
  onClose: () => void;
  project: ProjectRow;
}) {
  const assetUrl = getAssetUrl(project);
  const extension = getAssetExtension(project).toUpperCase();
  const isVideo = isVideoAsset(project);
  const isPdf = isPdfAsset(project);
  const isImage = isImageAsset(project);
  const summary = getAssetSummary(project) || 'AI parsing summary will appear here after the asset is verified.';
  const score = getAssetScore(project);

  const renderFocusMedia = () => {
    if (isVideo && assetUrl) {
      return (
        <video
          src={assetUrl}
          controls
          autoPlay
          className="w-full max-h-[80vh] rounded-lg shadow-2xl"
        />
      );
    }

    if (isPdf && assetUrl) {
      return (
        <iframe
          src={assetUrl}
          title={`${getAssetName(project)} preview`}
          className="h-[80vh] w-full rounded-lg bg-white"
        />
      );
    }

    if (isImage && assetUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl}
          alt=""
          className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl"
        />
      );
    }

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 rounded-lg border border-slate-800 bg-[#050b1b] px-6 py-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
          <FileText className="h-10 w-10" strokeWidth={1.4} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">{extension}</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
            This asset is stored in Vault. Open the source file to inspect the original upload.
          </p>
        </div>
        {assetUrl ? (
          <a
            href={assetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-500/15"
          >
            Open asset
          </a>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm md:p-10"
      role="dialog"
      aria-modal="true"
      aria-label={`${getAssetName(project)} full focus view`}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-800 bg-[#070b1a] p-4 shadow-2xl md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 text-slate-300 transition hover:border-cyan-500/40 hover:text-white"
          aria-label="Close full focus view"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>

        <div className="pr-12">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-400">Full Focus</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{getAssetName(project)}</h2>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-black/40 p-2">
          {renderFocusMedia()}
        </div>

        <div className="grid gap-4 rounded-xl border border-slate-800/70 bg-[#090e24] p-4 md:grid-cols-[1fr_auto]">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{getAssetName(project)}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{summary}</p>
          </div>
          {score !== null ? (
            <div className="h-fit rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">AI Score</p>
              <p className="mt-1 text-2xl font-semibold text-white">{score}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExternalLinksEditor({
  isEditing,
  links,
  onAdd,
  onDelete,
  onUpdate,
}: {
  isEditing: boolean;
  links: ResumeExternalLink[];
  onAdd: () => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, field: keyof ResumeExternalLink, value: string) => void;
}) {
  const visibleLinks = links.filter((link) => link.label.trim() || link.href.trim());

  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">External Links</p>
      {isEditing ? (
        <div className="space-y-3">
          {links.map((link, index) => (
            <div key={`external-link-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]">
              <Input
                value={link.label}
                onChange={(event) => onUpdate(index, 'label', event.target.value)}
                placeholder="GitHub"
                className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
              />
              <Input
                value={link.href}
                onChange={(event) => onUpdate(index, 'href', event.target.value)}
                placeholder="https://..."
                className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
              />
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-900/50 bg-rose-950/20 text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-950/35"
                aria-label="Delete external link"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/45 hover:bg-cyan-500/15"
          >
            + Add New Link
          </button>
        </div>
      ) : visibleLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleLinks.map((item, index) => {
            const Icon = getExternalLinkIcon(item.label);

            return (
              <a
                key={`${item.label}-${index}`}
                href={item.href || '#'}
                target={item.href ? '_blank' : undefined}
                rel={item.href ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-2 rounded-full border border-blue-950/60 bg-[#050b1b]/70 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-300"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                {item.label || item.href || 'Link'}
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No external links added yet.</p>
      )}
    </div>
  );
}

function DashboardResumePageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUsername = searchParams.get('profile')?.trim().replace(/^@+/, '') || null;
  const isSpectator = Boolean(targetUsername);
  const visibleNavigationItems = useMemo(
    () => (isSpectator ? navigationItems.filter((item) => item.label !== 'Search') : navigationItems),
    [isSpectator]
  );
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<number | null>(null);
  const [formData, setFormData] = useState<ResumeFormData>(() => createDefaultFormData());
  const [uploadedAssets, setUploadedAssets] = useState<ProjectRow[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasCreatorProfileColumns, setHasCreatorProfileColumns] = useState(true);
  const [activeFocusId, setActiveFocusId] = useState<ProjectRow | null>(null);
  const canEdit = !isSpectator && isEditing;
  const closeFocus = () => setActiveFocusId(null);

  useEffect(() => {
    if (!isSpectator && !loading && authEnabled && !user) {
      router.replace('/auth');
    }
  }, [authEnabled, isSpectator, loading, router, user]);

  useEffect(() => {
    if (!isSpectator && (!supabase || !user)) {
      setFormLoading(false);
      return;
    }

    if (isSpectator && !targetUsername) {
      setFormLoading(false);
      return;
    }

    let active = true;

    const loadResume = async () => {
      setFormLoading(true);
      setFormError(null);

      try {
        let resume: ResumeFields | null = null;
        let assets: ProjectRow[] = [];
        let fallbackAssets: ProjectRow[] = [];
        let profileUuid: string | null = null;

        if (isSpectator && targetUsername) {
          const response = await fetch(
            `${PROFILE_SPECTATOR_BASE_URL}/api/spectate-profile/${encodeURIComponent(targetUsername)}`,
            { cache: 'no-store' }
          );
          const payload = (await response.json().catch(() => null)) as SpectatorResumeResponse | null;

          if (!response.ok || !payload?.profile) {
            throw new Error(payload?.detail || payload?.message || 'Unable to load this public resume.');
          }

          resume = payload.profile;
          profileUuid = resume?.id ?? null;
          fallbackAssets = Array.isArray(payload.projects)
            ? payload.projects.filter((project) => project.is_public !== false)
            : [];
        } else if (supabase && user) {
          const profileResponse = await supabase
            .from('profiles')
            .select(EXTENDED_RESUME_SELECT)
            .eq('id', user.id)
            .maybeSingle();

          if (profileResponse.error && isMissingOptionalProfileColumn(profileResponse.error)) {
            console.warn('Resume optional profile columns are unavailable; loading base profile fields only.');
            if (active) {
              setHasCreatorProfileColumns(false);
            }
            const fallbackProfileResponse = await supabase
              .from('profiles')
              .select(BASE_RESUME_SELECT)
              .eq('id', user.id)
              .maybeSingle();

            if (fallbackProfileResponse.error) {
              throw fallbackProfileResponse.error;
            }

            resume = fallbackProfileResponse.data as ResumeFields | null;
          } else if (profileResponse.error) {
            throw profileResponse.error;
          } else {
            if (active) {
              setHasCreatorProfileColumns(true);
            }
            resume = profileResponse.data as ResumeFields | null;
          }
          profileUuid = resume?.id ?? user.id;
        }

        profileUuid = profileUuid ?? resume?.id ?? (!isSpectator ? user?.id ?? null : null);

        if (profileUuid && supabase) {
          const { data: assetData, error: assetError } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', profileUuid);

          if (assetError) {
            console.warn('Resume asset fetch failed; using available spectator asset payload if present.', assetError);
            assets = fallbackAssets;
          } else {
            const queriedAssets = Array.isArray(assetData) ? (assetData as ProjectRow[]) : [];
            assets = isSpectator && queriedAssets.length === 0 && fallbackAssets.length > 0
              ? fallbackAssets
              : queriedAssets;
          }
        } else {
          assets = fallbackAssets;
        }

        if (isSpectator) {
          assets = assets.filter((project) => project.is_public !== false);
        }

        if (!active) {
          return;
        }

        const nextFormData = createDefaultFormData();
        const loadedExternalLinks = normalizeExternalLinks(resume?.external_links);
        const topProjects = getTopScoringAssets(assets);
        const topProjectIds = topProjects.map((asset) => asset.id);

        setFormData({
          ...nextFormData,
          name:
            resume?.full_name ??
            resume?.name ??
            (user?.user_metadata?.full_name as string | undefined) ??
            (user?.user_metadata?.name as string | undefined) ??
            '',
          age: typeof resume?.age === 'number' ? String(resume.age) : '',
          status: resume?.current_status ?? resume?.status ?? '',
          qualifications: resume ? normalizeList(resume.qualifications) : nextFormData.qualifications,
          skills: resume ? normalizeList(resume.skills) : nextFormData.skills,
          experience: resume ? normalizeList(resume.experience) : nextFormData.experience,
          hobbies: resume ? normalizeList(resume.hobbies) : nextFormData.hobbies,
          featuredProjectIds: topProjectIds,
          externalLinks: loadedExternalLinks.length > 0 ? loadedExternalLinks : nextFormData.externalLinks,
        });
        setUploadedAssets(topProjects);
        setAvatarUrl(
          resume?.avatar_url ??
            (user?.user_metadata?.avatar_url as string | undefined) ??
            (user?.user_metadata?.picture as string | undefined) ??
            null
        );
      } catch (error) {
        console.error('Failed to load resume intake data', error);
        if (active) {
          setFormError('Unable to load your resume profile right now.');
        }
      } finally {
        if (active) {
          setFormLoading(false);
        }
      }
    };

    void loadResume();

    return () => {
      active = false;
    };
  }, [isSpectator, supabase, targetUsername, user]);

  useEffect(() => {
    if (isSpectator) {
      setIsEditing(false);
    }
  }, [isSpectator]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  function updateFormField<K extends keyof ResumeFormData>(field: K, value: ResumeFormData[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function updateStringList(field: 'qualifications' | 'experience' | 'hobbies' | 'skills', index: number, value: string) {
    setFormData((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addStringItem(field: 'qualifications' | 'experience' | 'hobbies' | 'skills') {
    setFormData((current) => ({ ...current, [field]: [...current[field], ''] }));
  }

  function deleteStringItem(field: 'qualifications' | 'experience' | 'hobbies' | 'skills', index: number) {
    setFormData((current) => ({
      ...current,
      [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateExternalLink(index: number, field: keyof ResumeExternalLink, value: string) {
    setFormData((current) => ({
      ...current,
      externalLinks: current.externalLinks.map((link, itemIndex) =>
        itemIndex === index ? { ...link, [field]: value } : link
      ),
    }));
  }

  function addExternalLink() {
    setFormData((current) => ({
      ...current,
      externalLinks: [...current.externalLinks, { label: '', href: '' }],
    }));
  }

  function deleteExternalLink(index: number) {
    setFormData((current) => ({
      ...current,
      externalLinks: current.externalLinks.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSave() {
    if (isSpectator || !supabase || !user || saveState === 'saving') {
      return;
    }

    setSaveState('saving');
    setFormError(null);

    try {
      const parsedAge = formData.age.trim() ? Number.parseInt(formData.age, 10) : null;
      const nextFormData: ResumeFormData = {
        ...formData,
        name: formData.name.trim(),
        age: formData.age.trim(),
        qualifications: formData.qualifications.map((item) => item.trim()).filter(Boolean),
        experience: formData.experience.map((item) => item.trim()).filter(Boolean),
        hobbies: formData.hobbies.map((item) => item.trim()).filter(Boolean),
        skills: formData.skills.map((item) => item.trim()).filter(Boolean),
        featuredProjectIds: uploadedAssets.map((asset) => asset.id),
        externalLinks: formData.externalLinks
          .map((link) => ({ label: link.label.trim(), href: link.href.trim() }))
          .filter((link) => link.label || link.href),
      };
      const updatePayload: Record<string, unknown> = {
        full_name: nextFormData.name || null,
        age: Number.isFinite(parsedAge) ? parsedAge : null,
        current_status: nextFormData.status || null,
        qualifications: nextFormData.qualifications,
        experience: nextFormData.experience,
        hobbies: nextFormData.hobbies,
        skills: nextFormData.skills,
      };

      if (hasCreatorProfileColumns) {
        updatePayload.resume_projects = nextFormData.featuredProjectIds;
        updatePayload.external_links = nextFormData.externalLinks;
      }

      let savedCreatorColumns = hasCreatorProfileColumns;
      const { error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (error) {
        if (isMissingOptionalProfileColumn(error)) {
          savedCreatorColumns = false;
          setHasCreatorProfileColumns(false);
          const { error: fallbackError } = await supabase
            .from('profiles')
            .update({
              full_name: nextFormData.name || null,
              age: Number.isFinite(parsedAge) ? parsedAge : null,
              current_status: nextFormData.status || null,
              qualifications: nextFormData.qualifications,
              experience: nextFormData.experience,
              hobbies: nextFormData.hobbies,
              skills: nextFormData.skills,
            })
            .eq('id', user.id);

          if (fallbackError) {
            throw fallbackError;
          }
        } else {
          throw error;
        }
      }

      setFormData(nextFormData);
      setSaveState('saved');
      setIsEditing(false);
      setSuccessMessage(
        savedCreatorColumns
          ? 'Resume changes saved.'
          : 'Core resume saved. Apply the latest migration to persist featured pins and external links.'
      );
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setSuccessMessage(null);
        setSaveState('idle');
      }, 2600);
    } catch (error) {
      console.error('Failed to save resume profile', error);
      setSaveState('idle');
      setFormError('Profile sync failed. Please try again.');
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (isSpectator || !file || !supabase || !user) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFormError('Please choose an image file.');
      return;
    }

    setAvatarUploading(true);
    setFormError(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filePath = `${user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      });

      if (uploadError) {
        throw uploadError;
      }

      const publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      setAvatarUrl(publicUrl);
    } catch (error) {
      console.error('Failed to upload resume avatar', error);
      setFormError('Photo upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }

  if (loading || formLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-slate-400">
        <p className="text-sm">Loading resume workspace...</p>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-white">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(0,112,243,0.16),transparent_55%)]" />

      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <aside className="w-64 min-w-[16rem] h-full sticky top-0 bg-[#060b1e] border-r border-blue-950/40 p-4 flex flex-col justify-between z-40">
          <div>
            <div className="mb-8 flex items-center gap-3 px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-950/60 text-cyan-400">
                <span className="text-sm font-semibold">M</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">MeliusAI</p>
                <p className="text-[11px] tracking-wide text-slate-500">Workspace</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {visibleNavigationItems.map((item) => {
                  const Icon = item.icon;
                  const href =
                    isSpectator && targetUsername
                      ? item.label === 'Home'
                        ? `/profile/${encodeURIComponent(targetUsername)}`
                        : item.label === 'Vault' || item.label === 'Resume'
                          ? `${item.href}?profile=${encodeURIComponent(targetUsername)}`
                          : item.href
                      : item.href;
                  return (
                    <motion.div
                      key={item.href}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <SidebarLink
                        href={href}
                        label={item.label}
                        active={pathname === item.href}
                        icon={<Icon className="h-5 w-5" strokeWidth={1.8} />}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </nav>
          </div>
          <div className="rounded-xl border border-blue-950/40 bg-[#090d1f]/40 p-3 text-xs text-slate-500">
            Secure profile workspace
          </div>
        </aside>

        <section className="flex h-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-400">Profile Intake Terminal</p>
                <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Resume</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                  Build a focused technical profile for career matching and MeliusAI context.
                </p>
              </div>
              {!isSpectator ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setSuccessMessage(null);
                    setSaveState('idle');
                    if (isEditing) {
                      void handleSave();
                    } else {
                      setIsEditing(true);
                    }
                  }}
                  disabled={saveState === 'saving'}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60',
                    isEditing
                      ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300/60 hover:bg-emerald-500/20'
                      : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-500/15'
                  )}
                >
                  {saveState === 'saving' ? 'Saving...' : isEditing ? 'Save Changes' : 'Edit Profile'}
                </button>
              ) : null}
            </div>

            <div className="space-y-5">
              {successMessage ? (
                <p className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                  {successMessage}
                </p>
              ) : null}

              <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
                <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">Core Metrics</p>
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div className="shrink-0">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-cyan-500/30 bg-[#050b1b]/70 text-slate-400 shadow-[0_0_26px_rgba(6,182,212,0.12)]">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-9 w-9" strokeWidth={1.4} />
                      )}
                    </div>
                    {!isSpectator && (
                      <>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="mt-3 rounded-full border border-blue-950/60 bg-[#050b1b]/70 px-3 py-2 text-[11px] text-slate-400 transition-colors hover:border-cyan-500/30 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {avatarUploading ? 'Uploading...' : 'Add Profile Photo'}
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => void handleAvatarUpload(event)}
                        />
                      </>
                    )}
                  </div>
                  <div className="grid w-full gap-5 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={canEdit ? 'resume-name' : undefined}>Name</Label>
                      {canEdit ? (
                        <Input
                          id="resume-name"
                          name="full_name"
                          value={formData.name}
                          onChange={(event) => updateFormField('name', event.target.value)}
                          placeholder="e.g., Nikunj Sharma"
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        />
                      ) : (
                        <p className="rounded-xl border border-transparent py-3 text-base text-zinc-200">
                          {formData.name || 'Name not provided'}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={canEdit ? 'resume-age' : undefined}>Age</Label>
                      {canEdit ? (
                        <Input
                          id="resume-age"
                          name="age"
                          type="number"
                          min={0}
                          max={150}
                          value={formData.age}
                          onChange={(event) => updateFormField('age', event.target.value)}
                          placeholder="e.g., 22"
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        />
                      ) : (
                        <p className="py-3 text-sm text-zinc-300">{formData.age || 'Not specified'}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={canEdit ? 'resume-current-status' : undefined}>Current Status</Label>
                      {canEdit ? (
                        <Select
                          id="resume-current-status"
                          name="current_status"
                          value={formData.status}
                          onChange={(event) => updateFormField('status', event.target.value as ResumeStatus)}
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        >
                          <option value="">Select your current status</option>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <p className="py-3 text-sm text-zinc-300">{formData.status || 'Not specified'}</p>
                      )}
                    </div>

                    <ExternalLinksEditor
                      isEditing={canEdit}
                      links={formData.externalLinks}
                      onAdd={addExternalLink}
                      onDelete={deleteExternalLink}
                      onUpdate={updateExternalLink}
                    />
                  </div>
                </div>
              </div>

              <EditableStringListSection
                addLabel="Qualification"
                emptyLabel="No qualifications added yet."
                isEditing={canEdit}
                items={formData.qualifications}
                label="Qualifications"
                onAdd={() => addStringItem('qualifications')}
                onDelete={(index) => deleteStringItem('qualifications', index)}
                onUpdate={(index, value) => updateStringList('qualifications', index, value)}
                placeholder="Passed 10th from..."
              />

              <EditableStringListSection
                addLabel="Skill"
                emptyLabel="No skills added yet."
                isEditing={canEdit}
                items={formData.skills}
                label="Skills"
                onAdd={() => addStringItem('skills')}
                onDelete={(index) => deleteStringItem('skills', index)}
                onUpdate={(index, value) => updateStringList('skills', index, value)}
                placeholder="React"
                variant="pill"
              />

              <EditableStringListSection
                addLabel="Experience"
                emptyLabel="No professional experience added yet."
                isEditing={canEdit}
                items={formData.experience}
                label="Professional Experience"
                onAdd={() => addStringItem('experience')}
                onDelete={(index) => deleteStringItem('experience', index)}
                onUpdate={(index, value) => updateStringList('experience', index, value)}
                placeholder="Software Engineer at..."
              />

              <EditableProjectsSection
                assets={uploadedAssets}
                isEditing={canEdit}
                onFocusProject={setActiveFocusId}
              />

              <EditableStringListSection
                addLabel="Hobby"
                emptyLabel="No hobbies added yet."
                isEditing={canEdit}
                items={formData.hobbies}
                label="Hobbies"
                onAdd={() => addStringItem('hobbies')}
                onDelete={(index) => deleteStringItem('hobbies', index)}
                onUpdate={(index, value) => updateStringList('hobbies', index, value)}
                placeholder="Photography"
              />

              {formError ? (
                <p className="rounded-xl border border-rose-900/70 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
                  {formError}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
      {activeFocusId ? (
        <FeaturedProjectFocusModal
          project={activeFocusId}
          onClose={closeFocus}
        />
      ) : null}
    </main>
  );
}

export default function DashboardResumePage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-slate-400">
          <p className="text-sm">Loading resume workspace...</p>
        </main>
      }
    >
      <DashboardResumePageContent />
    </Suspense>
  );
}
