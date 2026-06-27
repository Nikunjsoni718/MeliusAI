'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, FolderLock, House, Mail, Search } from 'lucide-react';

import faviconLogo from '@/app/favicon.png';
import { AuditReviewModal } from '@/components/dashboard/audit-review-modal';
import { AssetPreviewModal } from '@/components/dashboard/asset-preview-modal';
import { CandidateOpportunityCard } from '@/components/dashboard/candidate-opportunity-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import type { ProfileRow, ProjectRow, UserRow } from '@/types/supabase';

type ProjectPreviewKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'code'
  | 'presentation'
  | 'archive'
  | 'document'
  | 'generic';

type ProjectItem = {
  id: string;
  title: string;
  user_id?: string | null;
  owner_id?: string | null;
  is_public?: boolean | null;
  source_url?: string | null;
  source_kind: string | null;
  status: string | null;
  target_company?: string | null;
  preview_url?: string | null;
  preview_kind?: ProjectPreviewKind;
  text_preview?: string | null;
  mime_type?: string | null;
  file_size_label?: string | null;
  file_extension?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  code_language?: string | null;
  description?: string | null;
  user_description?: string | null;
  score?: number | null;
  audit_summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  evaluation_score?: number | null;
  has_been_audited?: boolean | null;
  logic_score?: number | null;
  ai_summary?: string | null;
  created_at?: string | null;
  is_local?: boolean;
};

type LiveOpportunityItem = {
  id: string;
  organization_id: string;
  organizations: { id: string | null } | null;
  recruiter_name: string;
  role_title: string;
  core_skills: string;
  match_score: number;
  matched_skills: string[];
  match_explanation: string;
  company_email: string | null;
  status: string;
  mission_text: string;
  pillar1_title: string;
  tech_input: string;
  perks_input: string;
};
type SavedProfileItem = Pick<ProfileRow, 'full_name' | 'username' | 'birth_date' | 'bio' | 'avatar_url'> & {
  id?: string | null;
  email?: string | null;
  avg_project_score?: number | null;
  average_project_score?: number | null;
  skills?: string[] | null;
};
type SpectatorScanItem = {
  id: string;
  project_id?: string | null;
  title?: string | null;
  score?: number | null;
  evaluation_score?: number | null;
  logic_score?: number | null;
  summary?: string | null;
  ai_summary?: string | null;
  description?: string | null;
  created_at?: string | null;
};
type SpectateProfileResponse = {
  success?: boolean;
  profile?: SavedProfileItem | null;
  projects?: ProjectRow[] | null;
  scans?: SpectatorScanItem[] | null;
  detail?: string;
  message?: string;
};
type DashboardNavigationItem = {
  href: string;
  label: string;
  icon: ReactNode;
};
type ProfileDraft = {
  displayName: string;
  username: string;
  birthDate: string;
};

const PROFILE_EMBEDDING_SYNC_ENDPOINT = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/profile/sync-embedding`
  : '';
const PROFILE_UPDATE_ENDPOINT = '/api/profile/update';
const PROFILE_SPECTATOR_BASE_URL = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');

async function syncProfileVectorEmbedding(payload: Record<string, unknown>) {
  if (!PROFILE_EMBEDDING_SYNC_ENDPOINT) {
    console.warn('Profile vector sync skipped: NEXT_PUBLIC_API_URL is not configured.');
    return;
  }

  try {
    const response = await fetch(PROFILE_EMBEDDING_SYNC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(`Profile vector sync returned HTTP ${response.status}.`);
    }
  } catch (embeddingSyncError) {
    console.warn('Profile saved, but vector embedding sync failed quietly:', embeddingSyncError);
  }
}

type PortfolioLinks = {
  artstation: string;
  behance: string;
  github: string;
  linkedin: string;
};

type SyncState = 'idle' | 'syncing' | 'error';
type BioSaveState = 'idle' | 'saving' | 'saved';

type UploadState = {
  fileName: string;
  progress: number;
  status: 'uploading' | 'done' | 'failed';
  error?: string;
};

function formatBirthday(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeProfileUsername(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const normalizedValue = decodeURIComponent(value).replace(/^@+/, '').trim();
    return normalizedValue && normalizedValue !== 'undefined' && normalizedValue !== 'null'
      ? normalizedValue
      : null;
  } catch {
    return null;
  }
}

function normalizeRouteIdentity(value: string | null | undefined) {
  return normalizeProfileUsername(value)?.toLowerCase() ?? null;
}

function getProfileUsernameFromPathname(pathname: string) {
  const profilePathMatch = pathname.match(/^\/profile\/([^/?#]+)/);
  return normalizeProfileUsername(profilePathMatch?.[1]);
}

function formatScanDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recent scan';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeLiveOpportunity(value: unknown): LiveOpportunityItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const opportunity = value as Record<string, unknown>;
  const opportunityId = typeof opportunity.id === 'string' ? opportunity.id.trim() : '';
  const roleTitle = typeof opportunity.role_title === 'string' ? opportunity.role_title.trim() : '';
  if (!opportunityId || !roleTitle) {
    return null;
  }

  const rawMatchScore = Number(opportunity.match_score ?? 0);
  const organizationRelation = opportunity.organizations;
  const nestedOrganizationId =
    organizationRelation && typeof organizationRelation === 'object' && !Array.isArray(organizationRelation)
      ? (organizationRelation as Record<string, unknown>).id
      : null;
  const matchedSkills = Array.isArray(opportunity.matched_skills)
    ? opportunity.matched_skills
        .filter((skill): skill is string => typeof skill === 'string')
        .map((skill) => skill.trim())
        .filter(Boolean)
    : [];

  return {
    id: opportunityId,
    organization_id:
      typeof opportunity.organization_id === 'string' ? opportunity.organization_id.trim() : '',
    organizations: {
      id: typeof nestedOrganizationId === 'string' ? nestedOrganizationId.trim() : null,
    },
    recruiter_name:
      typeof opportunity.recruiter_name === 'string' && opportunity.recruiter_name.trim()
        ? opportunity.recruiter_name.trim()
        : 'Verified Organisation',
    role_title: roleTitle,
    core_skills:
      typeof opportunity.core_skills === 'string'
        ? opportunity.core_skills.trim()
        : Array.isArray(opportunity.core_skills)
          ? opportunity.core_skills.map(String).join(', ')
          : '',
    match_score: Number.isFinite(rawMatchScore) ? Math.max(0, Math.min(100, rawMatchScore)) : 0,
    matched_skills: matchedSkills,
    match_explanation:
      typeof opportunity.match_explanation === 'string' && opportunity.match_explanation.trim()
        ? opportunity.match_explanation.trim()
        : `Matches your skills: ${matchedSkills.join(', ')}`,
    company_email:
      typeof opportunity.company_email === 'string' && opportunity.company_email.trim()
        ? opportunity.company_email.trim()
        : null,
    mission_text: typeof opportunity.mission_text === 'string' ? opportunity.mission_text.trim() : '',
    pillar1_title: typeof opportunity.pillar1_title === 'string' ? opportunity.pillar1_title.trim() : '',
    tech_input: typeof opportunity.tech_input === 'string' ? opportunity.tech_input.trim() : '',
    perks_input: typeof opportunity.perks_input === 'string' ? opportunity.perks_input.trim() : '',
    status: typeof opportunity.status === 'string' && opportunity.status.trim() ? opportunity.status.trim() : 'active',
  };
}

function toTitleCase(value: string) {
  if (!value) {
    return 'File';
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

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
const officeBridgeExtensions = new Set(['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']);

function getCodeLanguage(extension: string) {
  return codeLanguageMap[extension] ?? null;
}

const forcedUtf8CodeExtensions = new Set(['js', 'jsx', 'ts', 'tsx']);

function getFileExtensionFromSource(source?: string | null) {
  if (!source) {
    return '';
  }

  const withoutQuery = source.split('?')[0]?.split('#')[0] ?? source;

  try {
    return getFileExtension(new URL(withoutQuery).pathname);
  } catch {
    return getFileExtension(withoutQuery);
  }
}

function shouldForceUtf8CodeRead(...sources: Array<string | null | undefined>) {
  return sources.some((source) => forcedUtf8CodeExtensions.has(getFileExtensionFromSource(source)));
}

async function readRemoteTextAsUtf8(src: string) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('Unable to read code preview.');
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(await response.arrayBuffer());
}

function getUploadContentType(file: File) {
  if (shouldForceUtf8CodeRead(file.name)) {
    return 'text/plain; charset=utf-8';
  }

  return file.type || 'application/octet-stream';
}

function resolvePreviewKind({
  fileName,
  mimeType,
  storedKind,
}: {
  fileName: string;
  mimeType?: string | null;
  storedKind?: ProjectPreviewKind | null;
}): ProjectPreviewKind {
  if (storedKind) {
    return storedKind;
  }

  const extension = getFileExtension(fileName);
  const mime = mimeType ?? '';

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

function getProjectExtension(project: ProjectItem) {
  return project.file_extension ?? getFileExtension(project.title);
}

function getProjectFileType(project: ProjectItem) {
  const extension = getProjectExtension(project);

  if (extension) {
    return extension.toUpperCase();
  }

  if (project.mime_type) {
    return project.mime_type.split('/').pop()?.toUpperCase() ?? 'FILE';
  }

  return project.source_kind?.toUpperCase() ?? 'FILE';
}

function getProjectDownloadHref(project: ProjectItem) {
  return project.preview_url ?? project.source_url ?? null;
}

function mapProjectRowToProjectItem(row: ProjectRow): ProjectItem {
  const fileName = row.file_name ?? row.name ?? row.title ?? 'Project';
  const fileUrl = row.file_url ?? row.source_url ?? null;
  const fileType = row.file_type ?? null;
  const fileExtension = getFileExtension(fileName);

  return {
    id: row.id,
    user_id: row.user_id ?? null,
    owner_id: row.owner_id ?? null,
    is_public: row.is_public ?? null,
    title: fileName,
    source_url: fileUrl,
    source_kind: fileExtension ? fileExtension.toUpperCase() : row.source_kind ?? null,
    status: row.status ?? null,
    target_company: row.target_company ?? null,
    preview_url: fileUrl,
    preview_kind: resolvePreviewKind({ fileName, mimeType: fileType }),
    text_preview: null,
    mime_type: fileType,
    file_size_label: typeof row.file_size === 'number' ? formatFileSize(row.file_size) : null,
    file_extension: fileExtension || null,
    file_name: row.file_name ?? fileName,
    file_url: fileUrl,
    code_language: getCodeLanguage(fileExtension),
    description: row.description ?? null,
    user_description: row.user_description ?? null,
    score: typeof row.score === 'number' ? row.score : null,
    audit_summary: row.audit_summary ?? null,
    pros: Array.isArray(row.pros) ? row.pros : null,
    cons: Array.isArray(row.cons) ? row.cons : null,
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : null,
    evaluation_score: typeof row.evaluation_score === 'number' ? row.evaluation_score : null,
    has_been_audited: row.has_been_audited ?? null,
    logic_score: typeof row.logic_score === 'number' ? row.logic_score : null,
    ai_summary: row.ai_summary ?? null,
    created_at: row.created_at ?? null,
    is_local: false,
  };
}

function getOfficeBridgeSourceUrl(project: ProjectItem) {
  const href = project.source_url ?? project.preview_url ?? null;

  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    const isWebUrl = url.protocol === 'https:' || url.protocol === 'http:';
    const isLocalHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0' ||
      url.hostname.endsWith('.local');

    if (!isWebUrl || isLocalHost) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getOfficeViewerUrl(project: ProjectItem) {
  const sourceUrl = getOfficeBridgeSourceUrl(project);
  return sourceUrl
    ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(sourceUrl)}`
    : null;
}

function isOfficeBridgeFile(project: ProjectItem) {
  return officeBridgeExtensions.has(getProjectExtension(project));
}

function getDocumentTag(project: ProjectItem) {
  const extension = getProjectExtension(project);

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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M5.5 12.5 10 17l8.5-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 15.5V5.5M12 5.5l-3.5 3.5M12 5.5l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5v1c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M8.5 8.2 4.7 12l3.8 3.8M15.5 8.2l3.8 3.8-3.8 3.8M13.5 6l-3 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 4.8v9.4M12 14.2l-3.4-3.4M12 14.2l3.4-3.4M5.3 18.2v.7c0 .9.7 1.6 1.6 1.6h10.2c.9 0 1.6-.7 1.6-1.6v-.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function SidebarNavButton({
  label,
  active,
  href,
  icon,
  onClick,
}: {
  label: string;
  active?: boolean;
  href: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-blue-950/30 transition-all duration-200 group',
        label === 'MeliusAI' ? 'text-cyan-400/90 hover:text-cyan-400' : null,
        active
          ? 'bg-blue-950/35 text-white'
          : null
      )}
    >
      <span className="text-slate-400 transition-colors group-hover:text-cyan-400">{icon}</span>
      <span className="font-sans text-sm tracking-wide">{label}</span>
    </Link>
  );
}

function SidebarProfileLink({
  active,
  avatarUrl,
  href,
  onClick,
}: {
  active?: boolean;
  avatarUrl: string | null;
  href: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-label="Profile"
      title="Profile"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-300 transition-all duration-200 hover:bg-blue-950/30 hover:text-white',
        active ? 'bg-blue-950/35 text-white' : null
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-blue-950/60 bg-[#09152b]/70">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <SilhouetteIcon className="h-6 w-6" />
        )}
      </span>
      <span className="font-sans text-sm tracking-wide">Account</span>
    </Link>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M7.5 7.7l1-1.6c.3-.5.9-.8 1.5-.8h4c.6 0 1.2.3 1.5.8l1 1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 8.2h10.6c1.3 0 2.4 1.1 2.4 2.4v6.7c0 1.3-1.1 2.4-2.4 2.4H7c-1.3 0-2.4-1.1-2.4-2.4v-6.7c0-1.3 1.1-2.4 2.4-2.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12.3" cy="13.7" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.2 12a7.5 7.5 0 0 0-.08-1.05l1.55-1.2-1.65-2.86-1.9.72a7.7 7.7 0 0 0-1.82-1.05L15 4.6h-3.3l-.3 1.96c-.64.24-1.26.6-1.82 1.05l-1.9-.72-1.65 2.86 1.55 1.2c-.06.34-.08.7-.08 1.05 0 .36.02.71.08 1.05l-1.55 1.2 1.65 2.86 1.9-.72c.56.45 1.18.8 1.82 1.05l.3 1.96H15l.3-1.96c.64-.24 1.26-.6 1.82-1.05l1.9.72 1.65-2.86-1.55-1.2c.06-.34.08-.69.08-1.05Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SilhouetteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 12.2a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4.8 20.4c1.6-3.7 4.4-5.6 7.2-5.6s5.6 1.9 7.2 5.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfilePhoto({
  fallbackLabel,
  sizeClass,
  src,
  uploading,
  onSelect,
}: {
  fallbackLabel?: string;
  sizeClass: string;
  src: string | null;
  uploading?: boolean;
  onSelect?: (file: File) => void;
}) {
  const inputId = useId();

  return (
    <div className={cn('relative shrink-0', sizeClass)}>
      <div className="relative h-full w-full overflow-hidden rounded-full border border-sky-400/35 bg-[#050b1b]/70 shadow-[0_0_35px_rgba(56,189,248,0.35)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-semibold uppercase tracking-wide text-slate-300">
            {fallbackLabel?.trim()?.charAt(0) || <SilhouetteIcon className="h-[62%] w-[62%]" />}
          </div>
        )}
        {uploading ? <div className="absolute inset-0 animate-pulse bg-sky-500/10" /> : null}
      </div>

      {onSelect ? (
        <>
          <label
            htmlFor={inputId}
            aria-label="Upload profile photo"
            className="absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-blue-950/50 bg-[#050b1b]/90 text-slate-200 backdrop-blur-xl transition hover:border-sky-400/40 hover:text-sky-100"
          >
            <CameraIcon className="h-4 w-4" />
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              if (!file) {
                return;
              }
              onSelect(file);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function GenericFilePreview({
  title,
  subtitle,
  tag,
  icon,
  expanded = false,
  className,
}: {
  title: string;
  subtitle?: string | null;
  tag?: string | null;
  icon?: ReactNode;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center text-center',
        expanded ? 'gap-4 px-8 py-10' : 'gap-3 px-4 py-5',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-[1.4rem] border border-white/10 bg-white/5 text-sky-100 shadow-[0_0_30px_rgba(56,189,248,0.12)]',
          expanded ? 'h-20 w-20' : 'h-14 w-14'
        )}
      >
        {icon ?? <FileIcon className={expanded ? 'h-9 w-9' : 'h-7 w-7'} />}
      </div>
      {tag ? (
        <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-100">
          {tag}
        </Badge>
      ) : null}
      <div className="space-y-1">
        <p className={cn('font-semibold text-white', expanded ? 'text-lg' : 'text-sm')}>{title}</p>
        {subtitle ? (
          <p className={cn('mx-auto max-w-xl text-slate-400', expanded ? 'text-sm' : 'text-xs')}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function CodePreview({
  code,
  language,
  src,
  expanded = false,
}: {
  code: string | null | undefined;
  language?: string | null;
  src?: string | null;
  expanded?: boolean;
}) {
  const [remotePreview, setRemotePreview] = useState<{
    src: string | null;
    code: string | null;
  }>({
    src: null,
    code: null,
  });
  const shouldReadRemote = !code?.trim() && Boolean(src);
  const isReading = shouldReadRemote && remotePreview.src !== src;
  const content = code?.trim()
    ? code
    : remotePreview.src === src && remotePreview.code?.trim()
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
          setRemotePreview({ src, code: text.slice(0, 50000) });
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
    <div className={cn('h-full w-full overflow-hidden bg-[#050b17]', expanded ? 'overflow-auto' : null)}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#050b17]/95 px-4 py-2 text-xs text-slate-400 backdrop-blur">
        <span>{language ?? 'code'}</span>
        <span>Stored in Vault</span>
      </div>
      <pre
        className={cn(
          'm-0 min-h-full overflow-hidden p-4 font-mono leading-6 text-slate-200',
          expanded ? 'text-sm' : 'text-xs'
        )}
      >
        <code className="block whitespace-pre-wrap break-words">{content}</code>
      </pre>
    </div>
  );
}

function LoadingDocument() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#050b1b]/80 text-center backdrop-blur-sm">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-400/25 border-t-sky-300" />
      <p className="text-sm font-medium text-slate-100">Loading Document...</p>
    </div>
  );
}

function DownloadToViewFallback({
  project,
  onDownload,
  note = 'This file needs to be opened outside the web viewer.',
}: {
  project: ProjectItem;
  onDownload?: (project: ProjectItem) => void;
  note?: string;
}) {
  const canDownload = Boolean(getProjectDownloadHref(project));

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-[1.4rem] border border-white/10 bg-white/5 text-sky-100">
        <DocumentIcon className="h-10 w-10" />
      </div>
      <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-sky-100">
        {getDocumentTag(project)}
      </Badge>
      <div className="max-w-lg space-y-2">
        <p className="text-lg font-semibold text-white">{project.title}</p>
        <p className="text-sm text-slate-400">{note}</p>
      </div>
      <Button
        type="button"
        onClick={() => onDownload?.(project)}
        disabled={!canDownload || !onDownload}
        className="mt-2"
      >
        <DownloadIcon className="h-4 w-4" />
        Download to View
      </Button>
    </div>
  );
}

function OfficeDocumentPreview({
  project,
  onDownload,
}: {
  project: ProjectItem;
  onDownload?: (project: ProjectItem) => void;
}) {
  const viewerUrl = getOfficeViewerUrl(project);
  const loadedRef = useRef(false);
  const [viewerState, setViewerState] = useState<{
    url: string | null;
    loaded: boolean;
    failed: boolean;
  }>({
    url: null,
    loaded: false,
    failed: false,
  });
  const hasFailed = !viewerUrl || (viewerState.url === viewerUrl && viewerState.failed);
  const isLoading = Boolean(viewerUrl) && !hasFailed && !(viewerState.url === viewerUrl && viewerState.loaded);

  useEffect(() => {
    loadedRef.current = false;

    if (!viewerUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!loadedRef.current) {
        setViewerState({ url: viewerUrl, loaded: false, failed: true });
      }
    }, 15000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [viewerUrl]);

  if (!viewerUrl || hasFailed) {
    return (
      <DownloadToViewFallback
        project={project}
        onDownload={onDownload}
        note="The online viewer could not open this file."
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050b1b]">
      {isLoading ? <LoadingDocument /> : null}
      <iframe
        title={project.title}
        src={viewerUrl}
        className={cn('h-full w-full rounded-[inherit] bg-white transition-opacity', isLoading ? 'opacity-0' : 'opacity-100')}
        onLoad={() => {
          loadedRef.current = true;
          setViewerState({ url: viewerUrl, loaded: true, failed: false });
        }}
        onError={() => {
          setViewerState({ url: viewerUrl, loaded: false, failed: true });
        }}
      />
    </div>
  );
}

function getPreviewCardMeta(project: ProjectItem) {
  const previewKind = resolvePreviewKind({
    fileName: project.title,
    mimeType: project.mime_type,
    storedKind: project.preview_kind,
  });
  const fileType = getProjectFileType(project);

  if (previewKind === 'presentation') {
    return {
      previewKind,
      tag: getDocumentTag(project),
      subtitle: 'Open to view this document.',
      icon: <DocumentIcon className="h-7 w-7" />,
    };
  }

  if (previewKind === 'archive') {
    return {
      previewKind,
      tag: 'Package',
      subtitle: 'Compressed file stored in your vault.',
      icon: <PackageIcon className="h-7 w-7" />,
    };
  }

  if (previewKind === 'document') {
    return {
      previewKind,
      tag: getDocumentTag(project),
      subtitle: `${fileType} file stored in your vault.`,
      icon: <DocumentIcon className="h-7 w-7" />,
    };
  }

  if (previewKind === 'generic') {
    return {
      previewKind,
      tag: 'Generic File',
      subtitle: `${fileType} file stored in your vault.`,
      icon: <FileIcon className="h-7 w-7" />,
    };
  }

  return {
    previewKind,
    tag: null,
    subtitle: project.file_size_label ?? null,
    icon: <FileIcon className="h-7 w-7" />,
  };
}

function ProjectPreviewSurface({
  project,
  expanded = false,
  onDownload,
}: {
  project: ProjectItem;
  expanded?: boolean;
  onDownload?: (project: ProjectItem) => void;
}) {
  const { previewKind, tag, subtitle, icon } = getPreviewCardMeta(project);
  const previewUrl = project.preview_url ?? null;

  if (previewKind === 'image') {
    return (
      previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={project.title}
            className={cn('h-full w-full bg-[#050b1b]/80', expanded ? 'object-contain' : 'object-cover')}
          />
        </>
      ) : (
        <GenericFilePreview
          title={project.title}
          subtitle="Image stored in your vault."
          tag="Image"
          icon={<FileIcon className="h-7 w-7" />}
          expanded={expanded}
        />
      )
    );
  }

  if (previewKind === 'video') {
    return previewUrl ? (
      <video
        src={previewUrl}
        className={cn('h-full w-full rounded-[inherit] bg-[#050b1b]/80', expanded ? 'object-contain' : 'object-cover')}
        controls={expanded}
        muted={!expanded}
        playsInline
      />
    ) : (
      <GenericFilePreview
        title={project.title}
        subtitle="Video stored in your vault."
        tag="Video"
        icon={<FileIcon className="h-7 w-7" />}
        expanded={expanded}
      />
    );
  }

  if (previewKind === 'audio') {
    return expanded ? (
      <div className="flex h-full w-full flex-col justify-center px-6">
        <GenericFilePreview
          title={project.title}
          subtitle={project.file_size_label ?? 'Audio file'}
          tag="Audio"
          icon={<FileIcon className="h-7 w-7" />}
          className="mb-6"
          expanded
        />
        {previewUrl ? <audio src={previewUrl} className="w-full" controls /> : null}
      </div>
    ) : (
      <GenericFilePreview
        title="Audio File"
        subtitle={project.file_size_label ?? 'Open to listen'}
        tag="Audio"
        icon={<FileIcon className="h-7 w-7" />}
      />
    );
  }

  if (previewKind === 'pdf') {
    if (!previewUrl) {
      return (
        <GenericFilePreview
          title={project.title}
          subtitle="PDF stored in your vault."
          tag="PDF"
          icon={<DocumentIcon className="h-7 w-7" />}
          expanded={expanded}
        />
      );
    }

    return expanded ? (
      <iframe title={project.title} src={`${previewUrl}#toolbar=0`} className="h-full w-full rounded-[inherit]" />
    ) : (
      <iframe
        title={project.title}
        src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
        className="pointer-events-none h-full w-full rounded-[inherit]"
      />
    );
  }

  if (previewKind === 'code') {
    return (
      <CodePreview
        code={project.text_preview}
        language={project.code_language}
        src={project.preview_url ?? project.source_url ?? null}
        expanded={expanded}
      />
    );
  }

  if ((previewKind === 'presentation' || previewKind === 'document') && isOfficeBridgeFile(project)) {
    if (expanded) {
      return <OfficeDocumentPreview project={project} onDownload={onDownload} />;
    }

    return (
      <GenericFilePreview
        title={project.title}
        subtitle={subtitle ?? 'Open to view this document.'}
        tag={tag}
        icon={icon}
      />
    );
  }

  return (
    <GenericFilePreview
      title={project.title}
      subtitle={subtitle ?? project.file_size_label ?? project.mime_type ?? 'Stored in your vault.'}
      tag={tag}
      icon={icon}
      expanded={expanded}
    />
  );
}

function ProjectDropzone({
  upload,
  onFileSelect,
  onRetry,
  compact = false,
}: {
  upload: UploadState | null;
  onFileSelect: (file: File) => void;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const inputId = useId();
  const [isDragActive, setIsDragActive] = useState(false);
  const disabled = upload !== null && upload.status === 'uploading';

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (disabled) {
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }

  return (
    <label
      htmlFor={inputId}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) {
          setIsDragActive(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setIsDragActive(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDragActive(false);
        }
      }}
      onDrop={handleDrop}
      className={cn(
        'flex w-full cursor-pointer flex-col rounded-[1.75rem] border border-dashed bg-[#050b1b]/40 p-6 transition',
        compact ? 'min-h-[252px] justify-center' : 'min-h-[240px] justify-center',
        disabled ? 'cursor-default border-sky-400/30 bg-sky-500/[0.06]' : 'border-white/20 hover:border-sky-400/40 hover:bg-white/[0.03]',
        isDragActive && !disabled ? 'border-sky-400/50 bg-sky-500/[0.08]' : null
      )}
    >
      <input
        id={inputId}
        type="file"
        accept="*/*"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) {
            onFileSelect(file);
          }
        }}
      />

      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sky-100">
        <UploadIcon className="h-6 w-6" />
      </div>

      {upload ? (
        <div className="mt-5 space-y-3">
          <p className="text-base font-semibold text-white">{upload.fileName}</p>
          <p className="text-sm text-slate-400">
            {upload.status === 'done' ? 'Done' : upload.status === 'failed' ? 'Save failed' : 'Uploading'}
          </p>
          <Progress value={upload.progress} className="bg-slate-900/90" />
          {upload.status === 'failed' ? (
            <div className="space-y-3">
              {upload.error ? <p className="text-sm text-rose-200">{upload.error}</p> : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRetry?.();
                }}
              >
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          <p className="text-base font-semibold text-white">Upload</p>
          <p className="max-w-sm text-sm text-slate-400">
            Drag and drop your project here, or click to browse
          </p>
        </div>
      )}
    </label>
  );
}

function ProjectCard({
  project,
  isSpectator,
  verifyingAssetId,
  deletingProjectId,
  verifiedAssetId,
  onVerify,
  onOpen,
  onReadProtocol,
  onDelete,
}: {
  project: ProjectItem;
  isSpectator: boolean;
  verifyingAssetId: string | null;
  deletingProjectId: string | null;
  verifiedAssetId: string | null;
  onVerify: (project: ProjectItem) => void;
  onOpen: (project: ProjectItem) => void;
  onReadProtocol: (project: ProjectItem) => void;
  onDelete: (projectId: string) => void;
}) {
  const isProjectVerifying = verifyingAssetId === project.id;
  const isProjectDeleting = deletingProjectId === project.id;
  const isProjectVerified = verifiedAssetId === project.id;
  const fileExtension = getProjectExtension(project).toUpperCase() || project.source_kind || 'Asset';
  const fileName = project.file_name || project.title;

  return (
    <Card className="relative w-full overflow-hidden rounded-2xl border border-slate-800/60 bg-[#090e24] shadow-lg transition-all duration-300 hover:border-slate-700/80">
      <CardContent className="p-0">
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                {fileExtension} File
              </span>
              {project.has_been_audited ? (
                <span className="text-[11px] font-medium text-slate-400 bg-slate-950/60 px-2.5 py-0.5 rounded-md border border-slate-800/80 tracking-wide">
                  Score: {project.evaluation_score || 0}/100
                </span>
              ) : null}
            </div>

            <h3 className="mb-1 truncate text-sm font-bold text-slate-100" title={project.title}>
              {project.title}
            </h3>
            <p className="mb-4 truncate text-[11px] text-slate-500">{fileName}</p>

            <button
              type="button"
              onClick={() => onOpen(project)}
              className="relative mb-4 flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-slate-900 bg-slate-950/40 transition hover:border-cyan-500/30"
              aria-label={`Preview ${project.title}`}
            >
              <ProjectPreviewSurface project={project} />
            </button>
          </div>

          <div className="flex flex-col gap-2 mt-auto pt-4 w-full">
            <button
              type="button"
              onClick={() => onReadProtocol(project)}
              className="w-full py-2 px-4 rounded-full bg-[#11162d] border border-slate-800/60 hover:border-slate-700 text-slate-300 hover:text-white font-medium text-[11px] tracking-wide transition-all duration-200 text-center cursor-pointer"
            >
              Read Full Audit Protocol
            </button>

            {!isSpectator && (
              <button
                type="button"
                onClick={() => onVerify(project)}
                disabled={verifyingAssetId !== null || isProjectDeleting}
                aria-busy={isProjectVerifying}
                className={cn(
                  'w-full py-2 px-4 rounded-full bg-[#070a19] border border-slate-900 hover:bg-[#11162d]/50 disabled:bg-slate-950/20 disabled:text-slate-700 text-slate-400 hover:text-slate-200 font-medium text-[11px] tracking-wide transition-all duration-200 text-center cursor-pointer',
                  isProjectVerifying && 'animate-pulse border-cyan-500/40 text-cyan-300',
                  isProjectVerified && !isProjectVerifying && 'border-emerald-500/30 text-emerald-300'
                )}
              >
                {isProjectVerifying
                  ? 'Auditing via GPT Engine...'
                  : isProjectVerified
                    ? 'Verified ✓'
                    : 'Verify with MeliusAI'}
              </button>
            )}
          </div>

          {!isSpectator && (
            <div className="mt-2 flex w-full justify-end">
              <button
                type="button"
                onClick={() => onDelete(project.id)}
                disabled={deletingProjectId !== null}
                className="p-1.5 bg-[#071329]/60 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 border border-blue-950/60 hover:border-rose-900/60 rounded transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Delete ${project.title}`}
              >
                {isProjectDeleting ? (
                  <span className="font-mono text-[10px]">...</span>
                ) : (
                  <TrashIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type ProfileDashboardProps = {
  profileId?: string;
  profileUsername?: string;
  variant?: 'profile' | 'organization';
};

export function ProfileDashboard({ profileId, profileUsername, variant = 'profile' }: ProfileDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const routeParams = useParams<{ username?: string | string[] }>();
  const isOrganizationWorkspace = variant === 'organization';
  const { authEnabled, loading, profile, supabase, user } = useViewerProfile();
  const currentUser = user;
  const [profileData, setProfileData] = useState<SavedProfileItem | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [scans, setScans] = useState<SpectatorScanItem[]>([]);
  const [showAllWork, setShowAllWork] = useState(false);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [projectRetryFile, setProjectRetryFile] = useState<File | null>(null);
  const [projectDescription, setProjectDescription] = useState('');
  const [projectDescriptions, setProjectDescriptions] = useState<Record<string, string>>({});
  const [liveJobs, setLiveJobs] = useState<LiveOpportunityItem[]>([]);
  const [loadingState, setLoadingState] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);
  const [verifiedAssetId, setVerifiedAssetId] = useState<string | null>(null);
  const [viewingAuditAsset, setViewingAuditAsset] = useState<ProjectItem | null>(null);
  const [liveStreamText, setLiveStreamText] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectVerifyError, setProjectVerifyError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [activePreviewProjectId, setActivePreviewProjectId] = useState<string | null>(null);
  const [activePreviewName, setActivePreviewName] = useState<string | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
  const [showRefresh, setShowRefresh] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    displayName: '',
    username: '',
    birthDate: '',
  });
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [profileSyncState, setProfileSyncState] = useState<SyncState>('idle');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const isSpectator = !isOwner;
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [bioText, setBioText] = useState('');
  const [rawSkillsInput, setRawSkillsInput] = useState('');
  const [bioSaveState, setBioSaveState] = useState<BioSaveState>('idle');
  const [bioToastMessage, setBioToastMessage] = useState<string | null>(null);
  const [portfolioLinks, setPortfolioLinks] = useState<PortfolioLinks>({
    artstation: '',
    behance: '',
    github: '',
    linkedin: '',
  });
  const [portfolioSaveState, setPortfolioSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const uploadClearRef = useRef<number | null>(null);
  const descriptionSaveTimersRef = useRef<Record<string, number>>({});
  const verifyErrorTimerRef = useRef<number | null>(null);
  const verifiedAssetTimerRef = useRef<number | null>(null);
  const lastSavedProfileRef = useRef<ProfileDraft | null>(null);
  const profileSaveSequenceRef = useRef(0);
  const bioSaveSequenceRef = useRef(0);
  const bioSavedTimerRef = useRef<number | null>(null);
  const bioToastTimerRef = useRef<number | null>(null);
  const lastSavedBioRef = useRef('');
  const lastSavedSkillsInputRef = useRef('');
  const [profileFallback, setProfileFallback] = useState<{
    displayName: string;
    username: string;
    birthDate: string | null;
    email: string;
    hasDbProfile: boolean;
    avatarUrl: string | null;
    avgProjectScore: number | null;
  } | null>(null);

  const targetUsername = useMemo(() => {
    const routeUsername = Array.isArray(routeParams?.username)
      ? routeParams.username[0]
      : routeParams?.username;

    return (
      normalizeProfileUsername(routeUsername) ??
      getProfileUsernameFromPathname(pathname) ??
      normalizeProfileUsername(profileUsername) ??
      normalizeProfileUsername(profileId)
    );
  }, [pathname, profileId, profileUsername, routeParams]);
  const routeProfileUsername = useMemo(() => getProfileUsernameFromPathname(pathname), [pathname]);
  const viewerMetadataUsername =
    typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : undefined;
  const viewerRouteIdentifiers = useMemo(() => {
    return new Set(
      [profile?.username, profile?.id, user?.id, viewerMetadataUsername]
        .map((value) => normalizeRouteIdentity(value))
        .filter((value): value is string => Boolean(value))
    );
  }, [profile?.id, profile?.username, user?.id, viewerMetadataUsername]);
  const isSpectatingProfileRoute = Boolean(
    routeProfileUsername &&
      !isOwner &&
      !viewerRouteIdentifiers.has(normalizeRouteIdentity(routeProfileUsername) ?? '')
  );

  const displayName =
    profileDraft.displayName ||
    profileFallback?.displayName ||
    profileData?.full_name ||
    (isOwner ? profile?.display_name : null) ||
    (isOwner ? user?.user_metadata?.full_name : null) ||
    (isOwner ? user?.user_metadata?.name : null) ||
    'Member';
  const username =
    profileDraft.username ||
    profileFallback?.username ||
    profileData?.username ||
    (isOwner ? profile?.username : null) ||
    (isOwner ? user?.user_metadata?.username : null) ||
    targetUsername ||
    'member';
  const profileHandle = targetUsername || username;
  const profileHref = `/profile/${encodeURIComponent(profileHandle)}`;
  const email =
    profileData?.email?.trim() ||
    profileFallback?.email?.trim() ||
    (isOwner ? user?.email?.trim() : '') ||
    '';
  const avatarUrl =
    avatarPreviewUrl ??
    profileFallback?.avatarUrl ??
    profileData?.avatar_url ??
    (isOwner ? profile?.avatar_url : null) ??
    (isOwner ? (user?.user_metadata?.avatar_url as string | undefined) : null) ??
    (isOwner ? (user?.user_metadata?.picture as string | undefined) : null) ??
    null;
  const avgProjectScore =
    typeof profileFallback?.avgProjectScore === 'number'
      ? Math.round(profileFallback.avgProjectScore)
      : 0;
  const dashboardNavigation = useMemo<DashboardNavigationItem[]>(
    () => {
      const items = [
        {
          href: profileHref,
          label: 'Home',
          icon: <House className="h-5 w-5" strokeWidth={1.8} />,
        },
        {
          href: '/search',
          label: 'Search',
          icon: <Search className="h-5 w-5" strokeWidth={1.8} />,
        },
        {
          href:
            isSpectator && targetUsername
              ? `/vault?profile=${encodeURIComponent(targetUsername)}`
              : '/vault',
          label: 'Vault',
          icon: <FolderLock className="h-5 w-5" strokeWidth={1.8} />,
        },
        {
          href:
            isSpectator && targetUsername
              ? `/resume?profile=${encodeURIComponent(targetUsername)}`
              : '/resume',
          label: 'Resume',
          icon: <FileText className="h-5 w-5" strokeWidth={1.8} />,
        },
      ];

      return isSpectatingProfileRoute
        ? items.filter((item) => item.label !== 'Search')
        : items;
    },
    [isSpectatingProfileRoute, isSpectator, profileHref, targetUsername]
  );

  const firstName = useMemo(() => displayName.trim().split(/\s+/)[0] ?? 'there', [displayName]);
  const isUploading = uploadState?.status === 'uploading';
  const isSyncing =
    profileSyncState === 'syncing' ||
    bioSaveState === 'saving' ||
    verifyingAssetId !== null ||
    deletingProjectId !== null ||
    isUploading;
  const allProjects = projects;
  const needsReviewCount = useMemo(() => {
    return allProjects.filter((project) => typeof project.logic_score !== 'number').length;
  }, [allProjects]);
  const verifiedProjects = useMemo(() => {
    return allProjects
      .filter((project) => typeof project.logic_score === 'number')
      .sort((left, right) => {
        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      });
  }, [allProjects]);
  const spectatorScanProjects = useMemo(() => {
    return scans
      .map((scan) => {
        const relatedProject = scan.project_id
          ? allProjects.find((project) => project.id === scan.project_id) ?? null
          : null;
        const scanScore = scan.logic_score ?? scan.evaluation_score ?? scan.score ?? relatedProject?.logic_score ?? null;

        return {
          id: scan.id,
          title: scan.title ?? relatedProject?.title ?? 'Portfolio asset',
          source_kind: relatedProject?.source_kind ?? null,
          status: relatedProject?.status ?? null,
          logic_score: typeof scanScore === 'number' ? scanScore : null,
          ai_summary: scan.ai_summary ?? scan.summary ?? relatedProject?.ai_summary ?? null,
          description: scan.description ?? relatedProject?.description ?? null,
          created_at: scan.created_at ?? relatedProject?.created_at ?? null,
        } satisfies ProjectItem;
      })
      .sort((left, right) => {
        const leftDate = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightDate = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightDate - leftDate;
      });
  }, [allProjects, scans]);
  const totalScoreSum = useMemo(() => {
    return verifiedProjects.reduce((total, project) => total + (project.logic_score ?? 0), 0);
  }, [verifiedProjects]);
  const scanCount = verifiedProjects.length;
  const computedAverageScore =
    scanCount > 0 ? Math.max(0, Math.min(100, Math.round(totalScoreSum / scanCount))) : avgProjectScore;
  const normalizedScore = scanCount > 0 ? computedAverageScore : null;
  const initialProjects = allProjects;
  const initialReviews = spectatorScanProjects.length > 0 ? spectatorScanProjects : verifiedProjects;
  const visibleProjects = useMemo(() => {
    return showAllWork ? initialProjects : initialProjects.slice(0, 4);
  }, [initialProjects, showAllWork]);
  const activePreviewProject = useMemo(() => {
    return activePreviewProjectId
      ? allProjects.find((project) => project.id === activePreviewProjectId) ?? null
      : null;
  }, [activePreviewProjectId, allProjects]);
  const scanHistory = useMemo(() => {
    return showAllRatings ? initialReviews : initialReviews.slice(0, 3);
  }, [initialReviews, showAllRatings]);

  const getConfirmedUserId = useCallback(async () => {
    if (!supabase) {
      console.log('No user session found');
      return null;
    }

    const {
      data: { user: activeUser },
      error,
    } = await supabase.auth.getUser();

    if (error || !activeUser?.id) {
      console.log('No user session found');
      return null;
    }

    return activeUser.id;
  }, [supabase]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const hasPublicSpectatorTarget = Boolean(targetUsername);

    if ((!authEnabled || !user) && !hasPublicSpectatorTarget) {
      router.replace('/auth');
    }
  }, [authEnabled, loading, router, targetUsername, user]);

  useEffect(() => {
    if (loading) {
      return;
    }

    let active = true;
    setProfileLoading(true);
    setShowRefresh(false);
    setIsOwner(false);
    setIsEditing(false);
    setSettingsOpen(false);
    setResolvedProfileId(null);
    setProfileData(null);
    setProjects([]);
    setScans([]);
    setProjectDescriptions({});
    setProjectDescription('');
    setLiveJobs([]);
    setLoadingState(true);
    setFetchError(null);
    setViewingAuditAsset(null);
    setActivePreviewProjectId(null);
    setActivePreviewName(null);
    setActivePreviewUrl(null);
    setShowAllWork(false);
    setShowAllRatings(false);
    setProfileDraft({ displayName: '', username: '', birthDate: '' });
    setProfileFallback(null);
    setBioText('');
    setRawSkillsInput('');
    setAvatarPreviewUrl(null);

    const refreshTimer = window.setTimeout(() => {
      if (active) {
        setShowRefresh(true);
      }
    }, 3000);

    const loadProfile = async () => {
      if (!targetUsername) {
        console.warn('MeliusAI Hydration Guard: Aborting premature API call. Parameters not settled.');
        if (active) {
          setProfileLoading(false);
        }
        return;
      }

      try {
        let sessionUser: typeof user = null;
        let authenticatedProfile: SavedProfileItem | null = null;

        if (supabase) {
          const {
            data: { user: authenticatedUser },
            error: sessionUserError,
          } = await supabase.auth.getUser();

          if (sessionUserError) {
            console.warn('Unable to resolve active profile session:', sessionUserError.message);
          }

          sessionUser = authenticatedUser ?? null;

          if (sessionUser) {
            const authenticatedProfileResponse = await supabase
              .from('profiles')
              .select('*')
              .eq('id', sessionUser.id)
              .maybeSingle();

            authenticatedProfile = authenticatedProfileResponse.data as SavedProfileItem | null;

            if (authenticatedProfileResponse.error) {
              console.warn(
                `Unable to resolve the authenticated profile row for "${sessionUser.id}":`,
                authenticatedProfileResponse.error.message
              );
            }
          }
        }

        const sessionRawMetadata = (sessionUser as {
          raw_user_meta_data?: {
            username?: string;
            bio?: string;
            avatar_url?: string;
            picture?: string;
            portfolio_links?: Partial<PortfolioLinks>;
          };
        } | null)?.raw_user_meta_data;
        const sessionUserMetadata = (sessionUser?.user_metadata ?? {}) as {
          username?: string;
          full_name?: string;
          name?: string;
          bio?: string;
          avatar_url?: string;
          picture?: string;
          portfolio_links?: Partial<PortfolioLinks>;
        };
        const authenticatedUsername = authenticatedProfile?.username?.trim() ?? null;
        const normalizedTargetIdentity = normalizeRouteIdentity(targetUsername);
        const ownsProfile = Boolean(
          sessionUser &&
            normalizedTargetIdentity &&
            (normalizeRouteIdentity(authenticatedUsername) === normalizedTargetIdentity ||
              normalizeRouteIdentity(sessionUser.id) === normalizedTargetIdentity)
        );
        const isOwnProfile = ownsProfile;
        let savedProfile: SavedProfileItem | null = null;

        if (isOwnProfile) {
          savedProfile = authenticatedProfile;
          if (active) {
            setProfileData(authenticatedProfile);
            setScans([]);
          }
        } else {
          const spectatorResponse = await fetch(
            `${PROFILE_SPECTATOR_BASE_URL}/api/spectate-profile/${encodeURIComponent(targetUsername)}`,
            { cache: 'no-store' }
          );
          const spectatorPayload = (await spectatorResponse.json()) as SpectateProfileResponse;

          if (!spectatorResponse.ok || !spectatorPayload.profile) {
            throw new Error(
              spectatorPayload.detail || spectatorPayload.message || 'Target candidate profile not found.'
            );
          }

          savedProfile = spectatorPayload.profile;
          if (active) {
            const spectatorProjects = (spectatorPayload.projects ?? []).map(mapProjectRowToProjectItem);

            setProfileData(spectatorPayload.profile);
            setProjects(spectatorProjects);
            setScans(spectatorPayload.scans ?? []);
            setProjectDescriptions(
              Object.fromEntries(
                spectatorProjects.map((project) => [
                  project.id,
                  project.user_description ?? project.description ?? '',
                ])
              )
            );
          }
        }

        const fallbackName = isOwnProfile
          ? sessionUserMetadata?.full_name ??
            sessionUserMetadata?.name ??
            sessionUser?.email?.split('@')[0] ??
            targetUsername
          : targetUsername;
        const fallbackUsername = isOwnProfile
          ? authenticatedUsername ?? targetUsername
          : targetUsername;
        const hasDbProfile = Boolean(savedProfile);
        const birthDate = savedProfile?.birth_date ?? null;
        const displayName = savedProfile?.full_name ?? fallbackName;
        const usernameValue = savedProfile?.username ?? fallbackUsername;
        const bioValue = savedProfile?.bio ??
          (isOwnProfile ? sessionUserMetadata?.bio ?? sessionRawMetadata?.bio ?? '' : '');
        const skillsInputValue = Array.isArray(savedProfile?.skills) ? savedProfile.skills.join(', ') : '';
        const resolvedProfileIdValue = savedProfile?.id ?? (isOwnProfile ? sessionUser?.id ?? null : null);
        const avatarUrl = savedProfile?.avatar_url ??
          (isOwnProfile
            ? sessionUserMetadata?.avatar_url ??
              sessionRawMetadata?.avatar_url ??
              sessionUserMetadata?.picture ??
              sessionRawMetadata?.picture ??
              null
            : null);
        const savedAverageScore = savedProfile?.average_project_score ?? savedProfile?.avg_project_score;
        const avgProjectScoreValue = typeof savedAverageScore === 'number' ? savedAverageScore : null;

        const hydratedDraft = {
          displayName,
          username: usernameValue,
          birthDate: birthDate ?? '',
        };

        if (active) {
          const storedPortfolioLinks =
            sessionRawMetadata?.portfolio_links ?? sessionUserMetadata?.portfolio_links ?? undefined;

          setIsOwner(ownsProfile);
          if (storedPortfolioLinks && isOwnProfile) {
            setPortfolioLinks((currentLinks) => ({
              ...currentLinks,
              artstation: storedPortfolioLinks.artstation ?? currentLinks.artstation,
              behance: storedPortfolioLinks.behance ?? currentLinks.behance,
              github: storedPortfolioLinks.github ?? currentLinks.github,
              linkedin: storedPortfolioLinks.linkedin ?? currentLinks.linkedin,
            }));
          }
          lastSavedProfileRef.current = hydratedDraft;
          lastSavedBioRef.current = bioValue;
          lastSavedSkillsInputRef.current = skillsInputValue;
          setResolvedProfileId(resolvedProfileIdValue);
          setProfileDraft(hydratedDraft);
          setBioText(bioValue);
          setRawSkillsInput(skillsInputValue);
          setProfileHydrated(true);
          setProfileFallback({
            displayName,
            username: usernameValue,
            birthDate,
            email: savedProfile?.email?.trim() || (isOwnProfile ? sessionUser?.email ?? '' : ''),
            hasDbProfile,
            avatarUrl,
            avgProjectScore: avgProjectScoreValue,
          });
          setProfileSaveError(null);
          setProfileSyncState('idle');
          setBioSaveState('idle');
          setProfileLoading(false);
        }
      } catch (err) {
        console.error('Error running security guard verification:', err);
        if (active) {
          setIsOwner(false);
          setProfileLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
    };
  }, [loading, supabase, targetUsername]);

  useEffect(() => {
    if (!isOwner) {
      setIsEditing(false);
      setSettingsOpen(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (isSpectator || !authEnabled || !supabase) {
      return;
    }

    let active = true;

    const loadProjects = async () => {
      try {
        const userId = resolvedProfileId;
        if (!userId) {
          if (active) {
            setProjects([]);
          }
          return;
        }

        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        if (active) {
          const loadedProjects = (data ?? []).map(mapProjectRowToProjectItem);
          setProjects(loadedProjects);
          setProjectDescriptions(
            Object.fromEntries(
              loadedProjects.map((project) => [project.id, project.user_description ?? project.description ?? ''])
            )
          );
        }
      } catch {
        if (active) {
          setProjects([]);
        }
      }
    };

    void loadProjects();

    return () => {
      active = false;
    };
  }, [authEnabled, isSpectator, resolvedProfileId, supabase]);

  useEffect(() => {
    if (isSpectator || !profileHydrated || !currentUser?.id || !supabase) {
      setLiveJobs([]);
      setLoadingState(false);
      setFetchError(null);
      return;
    }

    const controller = new AbortController();

    const loadOpportunities = async () => {
      setLoadingState(true);
      setFetchError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
          throw new Error('Unable to load opportunities. Please sign in again.');
        }

        const response = await fetch(`${PROFILE_SPECTATOR_BASE_URL}/api/get-opportunities`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          const detail =
            data && typeof data === 'object' && 'detail' in data
              ? String((data as { detail?: unknown }).detail || '')
              : '';
          throw new Error(detail || `Opportunity service returned HTTP ${response.status}.`);
        }

        if (!Array.isArray(data)) {
          throw new Error('Opportunity service returned an invalid response.');
        }

        if (!controller.signal.aborted) {
          setLiveJobs(
            data
              .map(normalizeLiveOpportunity)
              .filter((job): job is LiveOpportunityItem => job !== null)
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLiveJobs([]);
          setFetchError(error instanceof Error ? error.message : 'Unable to load matching opportunities.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingState(false);
        }
      }
    };

    void loadOpportunities();

    return () => {
      controller.abort();
    };
  }, [currentUser?.id, isSpectator, profileHydrated, supabase]);

  async function handleDismiss(opportunityId: string) {
    const dismissedOpportunity = liveJobs.find((opportunity) => opportunity.id === opportunityId);
    if (!dismissedOpportunity) return;

    setLiveJobs((currentOpportunities) =>
      currentOpportunities.filter((opportunity) => opportunity.id !== opportunityId)
    );
    setFetchError(null);

    if (!currentUser?.id) {
      setLiveJobs((currentOpportunities) =>
        [...currentOpportunities, dismissedOpportunity].sort(
          (left, right) => right.match_score - left.match_score
        )
      );
      setFetchError('Unable to persist this dismissal. Please sign in again.');
      return;
    }

    try {
      if (!supabase) {
        throw new Error('Unable to persist this dismissal. Please sign in again.');
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('Unable to persist this dismissal. Please sign in again.');
      }

      const response = await fetch(`${PROFILE_SPECTATOR_BASE_URL}/api/dismiss-opportunity`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          opportunity_id: opportunityId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;

      if (!response.ok) {
        throw new Error(
          typeof payload?.detail === 'string'
            ? payload.detail
            : `Dismissal service returned HTTP ${response.status}.`
        );
      }
    } catch (error) {
      setLiveJobs((currentOpportunities) =>
        [...currentOpportunities, dismissedOpportunity].sort(
          (left, right) => right.match_score - left.match_score
        )
      );
      setFetchError(
        error instanceof Error
          ? `${error.message} The opportunity has been restored.`
          : 'Unable to save this dismissal. The opportunity has been restored.'
      );
    }
  }

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    const descriptionSaveTimers = descriptionSaveTimersRef.current;

    return () => {
      if (uploadClearRef.current) {
        window.clearTimeout(uploadClearRef.current);
      }
      if (verifyErrorTimerRef.current) {
        window.clearTimeout(verifyErrorTimerRef.current);
      }
      if (verifiedAssetTimerRef.current) {
        window.clearTimeout(verifiedAssetTimerRef.current);
      }
      if (bioSavedTimerRef.current) {
        window.clearTimeout(bioSavedTimerRef.current);
      }
      if (bioToastTimerRef.current) {
        window.clearTimeout(bioToastTimerRef.current);
      }
      Object.values(descriptionSaveTimers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  function getStorageFileName(fileName: string) {
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    return cleanName || 'project-file';
  }

  async function saveProfileDraft(nextDraft = profileDraft) {
    if (!isOwner) {
      return;
    }

    if (!supabase) {
      setProfileSaveError('Profile sync is not ready.');
      setProfileSyncState('error');
      return;
    }

    const normalizedDraft = {
      displayName: nextDraft.displayName.trim(),
      username: nextDraft.username.trim().replace(/^@+/, ''),
      birthDate: nextDraft.birthDate.trim(),
    };

    const lastSaved = lastSavedProfileRef.current;
    if (
      lastSaved?.displayName === normalizedDraft.displayName &&
      lastSaved.username === normalizedDraft.username &&
      lastSaved.birthDate === normalizedDraft.birthDate
    ) {
      return;
    }

    const sequence = profileSaveSequenceRef.current + 1;
    profileSaveSequenceRef.current = sequence;
    setProfileSyncState('syncing');
    setProfileSaveError(null);

    try {
      const userId = await getConfirmedUserId();
      if (!userId) {
        setProfileSyncState('error');
        setProfileSaveError('Profile sync is not ready.');
        return;
      }

      const { error } = await supabase.from('profiles').upsert({
        id: userId,
        full_name: normalizedDraft.displayName,
        username: normalizedDraft.username,
        birth_date: normalizedDraft.birthDate || null,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      void syncProfileVectorEmbedding({
        id: userId,
        full_name: normalizedDraft.displayName,
        username: normalizedDraft.username,
        birth_date: normalizedDraft.birthDate || null,
        avatar_url: avatarUrl,
        bio: bioText,
      });

      if (profileSaveSequenceRef.current === sequence) {
        lastSavedProfileRef.current = normalizedDraft;
        setProfileFallback((previous) =>
          previous
            ? {
                ...previous,
                displayName: normalizedDraft.displayName || previous.displayName,
                username: normalizedDraft.username || previous.username,
                birthDate: normalizedDraft.birthDate || null,
                hasDbProfile: true,
              }
            : previous
        );
        setProfileSyncState('idle');
        setProfileSaveError(null);
      }
    } catch (error) {
      if (profileSaveSequenceRef.current === sequence) {
        setProfileSyncState('error');
        setProfileSaveError(error instanceof Error ? error.message : 'We could not save your profile.');
      }
    }
  }

  function updateProfileDraft(field: keyof ProfileDraft, value: string) {
    if (!isOwner) {
      return;
    }

    const nextDraft = {
      ...profileDraft,
      [field]: value,
    };

    setProfileDraft(nextDraft);

    if (profileHydrated) {
      void saveProfileDraft(nextDraft);
    }
  }

  function showBioToast(message: string) {
    setBioToastMessage(message);

    if (bioToastTimerRef.current) {
      window.clearTimeout(bioToastTimerRef.current);
    }

    bioToastTimerRef.current = window.setTimeout(() => {
      setBioToastMessage(null);
    }, 3200);
  }

  function showBioSavedState() {
    setBioSaveState('saved');

    if (bioSavedTimerRef.current) {
      window.clearTimeout(bioSavedTimerRef.current);
    }

    bioSavedTimerRef.current = window.setTimeout(() => {
      setBioSaveState('idle');
    }, 1600);
  }

  async function saveBio(nextBio = bioText) {
    if (!isOwner) {
      return;
    }

    if (!supabase) {
      setBioSaveState('idle');
      showBioToast('Sync Error: Please check your connection.');
      return;
    }

    const nextBioText = nextBio.trim();
    const formattedSkills = rawSkillsInput
      .split(',')
      .map((skill) => skill.trim().toLowerCase())
      .filter(Boolean);
    const formattedSkillsInput = formattedSkills.join(', ');

    if (lastSavedBioRef.current === nextBioText && lastSavedSkillsInputRef.current === formattedSkillsInput) {
      showBioSavedState();
      return;
    }

    const sequence = bioSaveSequenceRef.current + 1;
    bioSaveSequenceRef.current = sequence;
    setBioSaveState('saving');

    try {
      const response = await fetch(PROFILE_UPDATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bio: nextBioText,
          skills: formattedSkills,
        }),
      });
      const updateData = (await response.json()) as {
        error?: string;
        profile?: {
          id?: string;
          bio?: string | null;
          skills?: string[] | null;
          internal_keywords?: string[] | null;
        } | null;
      };

      if (!response.ok) {
        throw new Error(updateData.error || 'Profile update failed.');
      }

      const savedProfile = updateData.profile;
      if (!savedProfile?.id) {
        throw new Error('Profile update completed without a returned profile id.');
      }

      console.log('Profile platform data sync completed:', savedProfile);

      void syncProfileVectorEmbedding({
        id: savedProfile.id,
        full_name: profileDraft.displayName,
        username: profileDraft.username,
        birth_date: profileDraft.birthDate || null,
        avatar_url: avatarUrl,
        bio: savedProfile.bio ?? nextBioText,
        skills: savedProfile.skills ?? formattedSkills,
        internal_keywords: savedProfile.internal_keywords ?? [],
      });

      if (bioSaveSequenceRef.current === sequence) {
        lastSavedBioRef.current = nextBioText;
        lastSavedSkillsInputRef.current = formattedSkillsInput;
        setRawSkillsInput(formattedSkillsInput);
        setProfileFallback((previous) =>
          previous
            ? {
                ...previous,
                hasDbProfile: true,
              }
            : previous
        );
        showBioSavedState();
      }
    } catch (error) {
      console.error('Profile dynamic platform data sync failed:', error);
      if (bioSaveSequenceRef.current === sequence) {
        setBioSaveState('idle');
        showBioToast('Sync Error: Please check your connection.');
      }
    }
  }

  function updateBio(value: string) {
    if (!isOwner) {
      return;
    }

    setBioText(value);

    if (bioSaveState === 'saved') {
      setBioSaveState('idle');
    }
  }

  function updateRawSkillsInput(value: string) {
    if (!isOwner) {
      return;
    }

    setRawSkillsInput(value);

    if (bioSaveState === 'saved') {
      setBioSaveState('idle');
    }
  }

  function updatePortfolioLink(field: keyof PortfolioLinks, value: string) {
    if (!isOwner) {
      return;
    }

    setPortfolioLinks((currentLinks) => ({
      ...currentLinks,
      [field]: value,
    }));

    if (portfolioSaveState === 'saved') {
      setPortfolioSaveState('idle');
    }
  }

  async function savePortfolioLinks() {
    if (!supabase || !isOwner) {
      return;
    }

    setPortfolioSaveState('saving');

    try {
      const normalizedLinks = {
        artstation: portfolioLinks.artstation.trim(),
        behance: portfolioLinks.behance.trim(),
        github: portfolioLinks.github.trim(),
        linkedin: portfolioLinks.linkedin.trim(),
      };
      const { error } = await supabase.auth.updateUser({
        data: {
          portfolio_links: normalizedLinks,
        },
      });

      if (error) {
        throw error;
      }

      setPortfolioSaveState('saved');
      window.setTimeout(() => setPortfolioSaveState('idle'), 1600);
    } catch (error) {
      console.error('Portfolio link sync failed:', error);
      setPortfolioSaveState('idle');
      showBioToast('Link Sync Error: Please check your connection.');
    }
  }

  async function uploadProjectFile(file: File, description: string) {
    if (!isOwner) {
      throw new Error('Only the profile owner can add work assets.');
    }

    if (!supabase) {
      throw new Error('Vault sync is not ready.');
    }

    const userId = await getConfirmedUserId();
    if (!userId) {
      throw new Error('Vault sync is not ready.');
    }

    setUploadState({
      fileName: file.name,
      progress: 20,
      status: 'uploading',
    });

    const path = `${userId}/${getStorageFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('vault').upload(path, file, {
      upsert: true,
      contentType: getUploadContentType(file),
    });

    if (uploadError) {
      console.log('Storage Error:', uploadError.message);
      throw uploadError;
    }

    setUploadState({
      fileName: file.name,
      progress: 70,
      status: 'uploading',
    });

    const fileUrl = supabase.storage.from('vault').getPublicUrl(path).data.publicUrl;
    if (!fileUrl) {
      throw new Error('Could not create a public file URL.');
    }

    const fileExtension = getFileExtension(file.name) || 'file';
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: file.name,
        file_url: fileUrl,
        file_type: fileExtension,
        description: description.trim() || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('Project DB Error:', error);
      throw error;
    }

    return mapProjectRowToProjectItem(data);
  }

  function handleOpenProject(project: ProjectItem) {
    const previewUrl = getProjectDownloadHref(project);

    if (!previewUrl) {
      return;
    }

    setActivePreviewProjectId(project.id);
    setActivePreviewName(project.title);
    setActivePreviewUrl(previewUrl);
  }

  function handleDownloadProject(project: ProjectItem) {
    const href = getProjectDownloadHref(project);
    if (!href) {
      return;
    }

    const link = document.createElement('a');
    link.href = href;
    link.rel = 'noreferrer';

    if (href.startsWith('blob:')) {
      link.download = project.title;
    } else {
      link.target = '_blank';
    }

    link.click();
  }

  async function handleProjectFile(file: File) {
    if (!isOwner) {
      return;
    }

    if (uploadClearRef.current) {
      window.clearTimeout(uploadClearRef.current);
    }

    setProjectRetryFile(null);
    setUploadState({
      fileName: file.name,
      progress: 5,
      status: 'uploading',
    });

    try {
      const savedProject = await uploadProjectFile(file, projectDescription);
      setUploadState({
        fileName: file.name,
        progress: 100,
        status: 'done',
      });

      setProjects((currentProjects) =>
        savedProject.is_public === false ? currentProjects : [savedProject, ...currentProjects]
      );
      setProjectDescriptions((currentDescriptions) => ({
        ...currentDescriptions,
        [savedProject.id]: savedProject.user_description ?? savedProject.description ?? '',
      }));
      setProjectDescription('');

      uploadClearRef.current = window.setTimeout(() => {
        setUploadState(null);
        uploadClearRef.current = null;
      }, 450);
    } catch (error) {
      setProjectRetryFile(file);
      setUploadState({
        fileName: file.name,
        progress: 100,
        status: 'failed',
        error: error instanceof Error ? error.message : 'We could not save this project.',
      });
    }
  }

  function showProjectVerifyError(message: string) {
    setProjectVerifyError(message);

    if (verifyErrorTimerRef.current) {
      window.clearTimeout(verifyErrorTimerRef.current);
    }

    verifyErrorTimerRef.current = window.setTimeout(() => {
      setProjectVerifyError(null);
    }, 3600);
  }

  function handlePreviewProjectUpdated(projectId: string, projectPatch: Partial<ProjectItem>) {
    setProjects((currentProjects) =>
      currentProjects.map((project) => (project.id === projectId ? { ...project, ...projectPatch } : project))
    );

    if ('user_description' in projectPatch) {
      setProjectDescriptions((currentDescriptions) => ({
        ...currentDescriptions,
        [projectId]: projectPatch.user_description ?? '',
      }));
    }

    setViewingAuditAsset((currentAsset) =>
      currentAsset?.id === projectId ? { ...currentAsset, ...projectPatch } : currentAsset
    );
  }

  async function handleVerifyWithMeliusAI(project: ProjectItem) {
    if (!isOwner) {
      return;
    }

    if (!supabase || verifyingAssetId || deletingProjectId) {
      return;
    }

    const userContextDescription = projectDescriptions[project.id] ?? '';
    const projectSourceHref = getProjectDownloadHref(project);
    const assetTextContent = [
      project.text_preview,
      project.ai_summary,
      project.description,
      project.file_name,
      project.source_kind,
    ]
      .filter(Boolean)
      .join('\n\n');

    setVerifyingAssetId(project.id);
    setLiveStreamText('');
    setProjectVerifyError(null);
    setVerifiedAssetId(null);

    if (verifiedAssetTimerRef.current) {
      window.clearTimeout(verifiedAssetTimerRef.current);
      verifiedAssetTimerRef.current = null;
    }

    if (descriptionSaveTimersRef.current[project.id]) {
      window.clearTimeout(descriptionSaveTimersRef.current[project.id]);
      delete descriptionSaveTimersRef.current[project.id];
    }

    try {
      const codeContent =
        projectSourceHref && shouldForceUtf8CodeRead(project.file_name, project.title, projectSourceHref)
          ? await readRemoteTextAsUtf8(projectSourceHref)
              .then((text) => text.trim())
              .catch(() => '')
          : '';
      const response = await fetch('/api/verify-asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          assetName: project.file_name || project.title,
          assetTextContent,
          codeContent,
          userContextDescription,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        project?: ProjectItem;
        reportText?: string;
        score?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'MeliusAI GPT verification failed.');
      }

      const updatedProject = payload.project;
      const accumulatedReportText =
        payload.reportText ?? updatedProject?.description ?? updatedProject?.ai_summary ?? '';

      setLiveStreamText(accumulatedReportText);
      setProjects((currentProjects) =>
        currentProjects.map((currentProject) =>
          currentProject.id === project.id
            ? {
                ...currentProject,
                ...(updatedProject ?? {}),
                has_been_audited: updatedProject?.has_been_audited ?? true,
                evaluation_score: updatedProject?.evaluation_score ?? payload.score ?? currentProject.evaluation_score,
                logic_score: updatedProject?.logic_score ?? payload.score ?? currentProject.logic_score,
                ai_summary: updatedProject?.ai_summary ?? accumulatedReportText,
                description: updatedProject?.description ?? accumulatedReportText,
              }
            : currentProject
        )
      );
      setProjectDescriptions((currentDescriptions) => ({
        ...currentDescriptions,
        [project.id]: userContextDescription,
      }));
      setViewingAuditAsset((currentAsset) =>
        currentAsset?.id === project.id
          ? {
              ...currentAsset,
              ...(updatedProject ?? {}),
              has_been_audited: updatedProject?.has_been_audited ?? true,
              evaluation_score: updatedProject?.evaluation_score ?? payload.score ?? currentAsset.evaluation_score,
              logic_score: updatedProject?.logic_score ?? payload.score ?? currentAsset.logic_score,
              ai_summary: updatedProject?.ai_summary ?? accumulatedReportText,
              description: updatedProject?.description ?? accumulatedReportText,
            }
          : currentAsset
      );
      setVerifiedAssetId(project.id);
      verifiedAssetTimerRef.current = window.setTimeout(() => {
        setVerifiedAssetId(null);
        verifiedAssetTimerRef.current = null;
      }, 2400);
    } catch (error) {
      console.error('Detailed Verification Diagnostic Log:', error);
      const message = error instanceof Error ? error.message : 'MeliusAI GPT verification failed.';
      showProjectVerifyError(message);
    } finally {
      setVerifyingAssetId(null);
    }
  }

  function handleReadFullAuditProtocol(project: ProjectItem) {
    if (!project.has_been_audited) {
      window.alert(
        "This asset file has not been verified yet. Please click 'Verify Asset' to run the scanner first!"
      );
      return;
    }

    setViewingAuditAsset(project);
  }

  async function handleDeleteProject(projectId: string) {
    if (!isOwner) {
      return;
    }

    if (deletingProjectId) {
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to permanently delete this asset and its MeliusAI validation history?'
    );

    if (!confirmed) {
      return;
    }

    setDeletingProjectId(projectId);
    setProjectVerifyError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? 'Unable to delete project.');
      }

      setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));
      setProjectDescriptions((currentDescriptions) => {
        const nextDescriptions = { ...currentDescriptions };
        delete nextDescriptions[projectId];
        return nextDescriptions;
      });
      if (descriptionSaveTimersRef.current[projectId]) {
        window.clearTimeout(descriptionSaveTimersRef.current[projectId]);
        delete descriptionSaveTimersRef.current[projectId];
      }
      setViewingAuditAsset((currentAsset) => (currentAsset?.id === projectId ? null : currentAsset));
      setActivePreviewProjectId((currentPreviewId) => (currentPreviewId === projectId ? null : currentPreviewId));
      if (activePreviewProjectId === projectId) {
        setActivePreviewName(null);
        setActivePreviewUrl(null);
      }
    } catch {
      showProjectVerifyError('We could not delete this asset.');
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function handleAvatarSelect(file: File) {
    if (!isOwner) {
      return;
    }

    if (!supabase) {
      setAvatarError('Photo upload is not ready right now.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Please use a smaller photo (under 5MB).');
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);

    const localPreview = URL.createObjectURL(file);
    setAvatarPreviewUrl(localPreview);

    try {
      const {
        data: { user: confirmedUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !confirmedUser) {
        throw new Error('Unauthorized access.');
      }

      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${confirmedUser.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('vault').upload(path, file, {
        upsert: true,
        cacheControl: '0',
        contentType: file.type,
      });

      if (uploadError) {
        console.log('Storage Error:', uploadError.message);
        throw uploadError;
      }

      const publicUrl = supabase.storage.from('vault').getPublicUrl(path).data.publicUrl;

      const { error: profilePhotoError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', confirmedUser.id);

      if (profilePhotoError) {
        throw profilePhotoError;
      }

      setAvatarPreviewUrl(publicUrl);
      setProfileFallback((previous) =>
        previous
          ? { ...previous, avatarUrl: publicUrl, hasDbProfile: true }
          : {
              displayName,
              username,
              birthDate: profileDraft.birthDate || null,
              email,
              hasDbProfile: true,
              avatarUrl: publicUrl,
              avgProjectScore: null,
            }
      );
    } catch (error) {
      console.error('Avatar system sync fault:', error);
      setAvatarError(error instanceof Error ? error.message : 'We could not upload that photo.');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }
    await supabase.auth.signOut();
    clearPersistedAuthState();
    router.replace('/');
  }


  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-white">
          <aside className="w-64 h-full flex-shrink-0 flex flex-col justify-between border-r border-slate-800 bg-slate-900">
            <div className="p-4">
              <Link href="/home" className="mb-8 flex items-center gap-3 px-3 py-2" aria-label="Go to candidate dashboard">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-950/60 bg-blue-950/60 p-1">
                  <Image src={faviconLogo} alt="MeliusAI Logo" width={36} height={36} className="object-contain cursor-pointer" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">MeliusAI</p>
                  <p className="text-[11px] tracking-wide text-slate-500">Workspace</p>
                </div>
              </Link>
              <nav className="flex flex-col gap-1">
                <AnimatePresence initial={false}>
                  {dashboardNavigation.map((item) => (
                    <motion.div
                      key={item.label}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <SidebarNavButton
                        href={item.href}
                        label={item.label}
                        active={
                          pathname === item.href ||
                          (item.href === profileHref && pathname.startsWith('/profile/'))
                        }
                        icon={item.icon}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </nav>
            </div>
            <div className="space-y-2 p-4">
              <SidebarProfileLink
                active={pathname === profileHref || pathname.startsWith('/profile/')}
                avatarUrl={avatarUrl}
                href={profileHref}
              />
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="w-full justify-start rounded-lg border border-blue-950/60 bg-[#071329]/60 px-3 py-2.5 text-xs text-slate-200 hover:border-cyan-500/30 hover:bg-[#0b1d38]/80"
              >
                Sign out
              </Button>
            </div>
          </aside>

          <main className="flex-1 h-full overflow-y-auto relative p-8">
            <AnimatePresence>
              {bioToastMessage ? (
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="fixed right-5 top-5 z-50 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.16)] backdrop-blur-2xl"
                  role="status"
                >
                  {bioToastMessage}
                </motion.div>
              ) : null}
              {projectVerifyError ? (
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="fixed right-5 top-20 z-50 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 shadow-[0_0_30px_rgba(56,189,248,0.16)] backdrop-blur-2xl"
                  role="status"
                >
                  {projectVerifyError}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {isUploading ? (
              <div className="flex min-h-full items-center justify-center px-4 text-slate-300">
                <div className="w-full max-w-xl rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-6 text-center backdrop-blur-md">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-100">
                    <UploadIcon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-lg font-semibold text-white">Uploading {uploadState?.fileName ?? 'asset'}...</p>
                  <p className="mt-2 text-sm text-slate-400">Keep this tab open while your vault syncs.</p>
                  <Progress value={uploadState?.progress ?? 5} className="mt-5 bg-slate-900/90" />
                </div>
              </div>
            ) : profileLoading ? (
              <div className="flex min-h-full items-center justify-center px-4 text-slate-300">
                <div className="w-full max-w-xl rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-6 text-center backdrop-blur-md">
                  <div className="mx-auto h-12 w-12 animate-pulse rounded-full border border-white/10 bg-white/5" />
                  <p className="mt-4 text-lg">Loading your profile...</p>
                  {showRefresh ? (
                    <Button className="mt-5" onClick={() => window.location.reload()}>
                      Try Refreshing Your Vault
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
            <div className="flex w-full flex-col gap-6">
            <div className="rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6 lg:p-7">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-col items-start gap-5 sm:flex-row sm:items-center">
                    <ProfilePhoto
                      fallbackLabel={displayName}
                      sizeClass="h-16 w-16"
                      src={avatarUrl}
                      uploading={avatarUploading}
                      onSelect={!isSpectator && isEditing ? handleAvatarSelect : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-400">
                        {!isSpectator ? `Hey ${firstName}, welcome back.` : 'Talent profile preview.'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Individual</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Status: Active</span>
                        {isSyncing ? (
                          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-100">
                            Syncing...
                          </span>
                        ) : null}
                        {profileSyncState === 'error' ? (
                          <button
                            type="button"
                            onClick={() => void saveProfileDraft()}
                            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-rose-100 transition hover:border-rose-300/50"
                          >
                            Retry
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {isEditing ? (
                          <Input
                            aria-label="Full name"
                            className="h-auto min-w-[220px] max-w-sm border-blue-950/50 bg-[#050b1b]/60 px-3 py-2 text-3xl font-semibold text-white focus:border-sky-500/60 focus:ring-sky-500/20"
                            value={profileDraft.displayName}
                            onChange={(event) => updateProfileDraft('displayName', event.target.value)}
                          />
                        ) : (
                          <h1 className="text-3xl font-semibold text-white">{displayName}</h1>
                        )}
                        <Badge className="border-emerald-400/40 bg-emerald-500/15 text-emerald-100" variant="outline">
                          Confirmed
                        </Badge>
                        {profileLoading ? (
                          <span className="h-7 w-32 animate-pulse rounded-full border border-slate-800 bg-white/5" />
                        ) : (
                          <Link
                            href="#my-ratings"
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-sm transition hover:scale-[1.02] hover:border-cyan-300/60 hover:text-white',
                              computedAverageScore >= 80
                                ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-100'
                                : 'border-purple-400/45 bg-purple-500/10 text-purple-100'
                            )}
                          >
                            {`Avg Score: ${computedAverageScore}/100`}
                          </Link>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-400">@{username}</p>
                      {email ? (
                        <a
                          href={`mailto:${email}?subject=MeliusAI Connection — Interested in your verified profile`}
                          className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-medium text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.1)] transition-all hover:border-cyan-300/60 hover:bg-cyan-500/15 hover:text-white hover:shadow-[0_0_28px_rgba(34,211,238,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                        >
                          <Mail className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                          <span className="truncate sm:whitespace-normal sm:break-all">{email}</span>
                        </a>
                      ) : (
                        <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/30 px-3.5 py-2 text-xs text-slate-500">
                          <Mail className="h-4 w-4" aria-hidden="true" />
                          Email unavailable
                        </span>
                      )}
                      {profileSaveError ? <p className="mt-2 text-sm text-rose-200">{profileSaveError}</p> : null}
                      {avatarError ? <p className="mt-2 text-sm text-slate-400">Photo update did not finish. Try again.</p> : null}
                    </div>
                  </div>

                  <div className="flex w-full items-start justify-start lg:w-auto lg:justify-end">
                    {!isSpectator && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing((value) => !value);
                            setSettingsOpen(false);
                          }}
                          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                        >
                          {isEditing ? 'Done Editing' : 'Edit Profile'}
                        </button>
                        {isEditing ? (
                          <button
                            id="settings"
                            type="button"
                            onClick={() => setSettingsOpen((value) => !value)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-slate-200 transition hover:border-sky-400/40 hover:bg-white/[0.06] hover:text-white"
                            aria-label="Open settings"
                          >
                            <GearIcon className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

              <AnimatePresence>
                {settingsOpen && !isSpectator && isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute right-6 top-6 w-[min(360px,calc(100%-3rem))] rounded-3xl border border-blue-950/50 bg-[#090d1f]/90 p-5 backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Settings</p>
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(false)}
                        className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <Label htmlFor="profile-name" className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Name
                        </Label>
                        <Input
                          id="profile-name"
                          className="mt-3 border-blue-950/50 bg-[#050b1b]/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                          value={profileDraft.displayName}
                          onChange={(event) => updateProfileDraft('displayName', event.target.value)}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <Label htmlFor="profile-username" className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Username
                        </Label>
                        <Input
                          id="profile-username"
                          className="mt-3 border-blue-950/50 bg-[#050b1b]/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                          value={profileDraft.username}
                          onChange={(event) => updateProfileDraft('username', event.target.value)}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Email</p>
                          <Badge variant="outline" className="border-emerald-400/40 text-emerald-100">
                            Verified
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-white">{email}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <Label htmlFor="profile-birth-date" className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Birth date
                        </Label>
                        <Input
                          id="profile-birth-date"
                          className="mt-3 border-blue-950/50 bg-[#050b1b]/60 focus:border-sky-500/60 focus:ring-sky-500/20"
                          type="date"
                          value={profileDraft.birthDate}
                          onChange={(event) => updateProfileDraft('birthDate', event.target.value)}
                        />
                        {profileDraft.birthDate ? (
                          <p className="mt-2 text-xs text-slate-500">{formatBirthday(profileDraft.birthDate)}</p>
                        ) : null}
                        {!profileFallback?.hasDbProfile ? (
                          <p className="mt-2 text-xs text-slate-500">Set up your profile</p>
                        ) : null}
                      </div>
                    </div>

                    {profileSaveError ? (
                      <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                        <p className="text-sm text-rose-100">{profileSaveError}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3 border-rose-400/30 text-rose-100 hover:border-rose-300/50"
                          onClick={() => void saveProfileDraft()}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-5">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Link accounts</p>
                      <div className="mt-3 grid gap-3">
                        {[
                          ['github', 'GitHub'],
                          ['behance', 'Behance'],
                          ['artstation', 'ArtStation'],
                          ['linkedin', 'LinkedIn'],
                        ].map(([field, label]) => (
                          <div key={field} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                            <Label
                              htmlFor={`profile-link-${field}`}
                              className="text-[10px] uppercase tracking-[0.2em] text-slate-500"
                            >
                              {label}
                            </Label>
                            <Input
                              id={`profile-link-${field}`}
                              className="mt-2 border-blue-950/50 bg-[#050b1b]/60 text-xs focus:border-sky-500/60 focus:ring-sky-500/20"
                              value={portfolioLinks[field as keyof PortfolioLinks]}
                              onChange={(event) => updatePortfolioLink(field as keyof PortfolioLinks, event.target.value)}
                              placeholder={`Paste your ${label} URL`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void savePortfolioLinks()}
                          disabled={portfolioSaveState === 'saving'}
                          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {portfolioSaveState === 'saving'
                            ? 'Saving...'
                            : portfolioSaveState === 'saved'
                              ? 'Saved Links'
                              : 'Save Links'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              </div>

            <div className="space-y-10">
              <section className="space-y-4">
              <Card className="relative overflow-hidden border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                {bioSaveState === 'saving' ? (
                  <div className="absolute right-6 top-6 h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.9)]" />
                ) : null}
                <CardContent className="p-6">
                  <div>
                    <div>
                      <p className="text-sm text-slate-400">Bio</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">About Me</h2>
                    </div>
                  </div>

                  {isEditing ? (
                    <>
                      <Textarea
                        value={bioText}
                        onChange={(event) => updateBio(event.target.value)}
                        placeholder="Tell the creative community or hiring organizations about your design methodology or building focus..."
                        className="mt-5 min-h-40 resize-none border-transparent bg-[#050b1b]/35 text-base leading-7 shadow-none focus:border-sky-500/60 focus:bg-[#050b1b]/55"
                      />
                      <div className="mt-4">
                        <Label htmlFor="profile-skills" className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          Skills Matrix
                        </Label>
                        <Textarea
                          id="profile-skills"
                          value={rawSkillsInput}
                          onChange={(event) => updateRawSkillsInput(event.target.value)}
                          placeholder="React, TypeScript, Figma"
                          className="mt-2 min-h-24 resize-none border-transparent bg-[#050b1b]/35 text-sm leading-6 text-slate-200 shadow-none focus:border-sky-500/60 focus:bg-[#050b1b]/55"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Separate skills with commas. MeliusAI stores them as clean lowercase database tags.
                        </p>
                      </div>
                      <div className="mt-5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void saveBio(bioText)}
                          disabled={bioSaveState === 'saving'}
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-5 py-2.5 text-sm font-medium text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.18)] transition hover:border-emerald-300/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {bioSaveState === 'saved' ? <CheckIcon className="h-4 w-4" /> : null}
                          {bioSaveState === 'saving'
                            ? 'Syncing Platform Data...'
                            : bioSaveState === 'saved'
                              ? 'Profile Dynamic Live ✅'
                              : 'Save Profile'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-blue-950/40 bg-[#050b1b]/35 p-5 text-base leading-7 text-slate-300">
                      {bioText.trim()
                        ? bioText
                        : 'This profile is ready for a stronger public story. When the owner adds a bio, their design methodology, technical focus, and creative direction will appear here.'}
                      {rawSkillsInput.trim() ? (
                        <div className="mt-5 flex flex-wrap gap-2 border-t border-blue-950/40 pt-4">
                          {rawSkillsInput
                            .split(',')
                            .map((skill) => skill.trim())
                            .filter(Boolean)
                            .map((skill) => (
                              <span
                                key={skill}
                                className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-100"
                              >
                                {skill}
                              </span>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section id="my-work-assets" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">My Work Assets</h2>
                  <p className="mt-1 text-sm text-slate-400">Your projects live here.</p>
                </div>
                {allProjects.length > 0 ? (
                  <Badge variant="outline" className="w-fit border-white/10 text-slate-200">
                    {allProjects.length} projects
                  </Badge>
                ) : null}
              </div>

              {allProjects.length === 0 ? (
                <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                  <CardContent className="p-8">
                    {!isSpectator ? (
                      <ProjectDropzone
                        upload={uploadState}
                        onFileSelect={(file) => void handleProjectFile(file)}
                        onRetry={() => {
                          if (projectRetryFile) {
                            void handleProjectFile(projectRetryFile);
                          }
                        }}
                      />
                    ) : (
                      <div className="rounded-[1.75rem] border border-blue-950/40 bg-[#050b1b]/35 p-8 text-center">
                        <p className="text-base font-semibold text-white">No public work assets yet.</p>
                        <p className="mt-2 text-sm text-slate-400">
                          This profile owner has not shared portfolio files in this workspace.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
                    {visibleProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        isSpectator={isSpectator}
                        verifyingAssetId={verifyingAssetId}
                        deletingProjectId={deletingProjectId}
                        verifiedAssetId={verifiedAssetId}
                        onVerify={(selectedProject) => void handleVerifyWithMeliusAI(selectedProject)}
                        onOpen={handleOpenProject}
                        onReadProtocol={handleReadFullAuditProtocol}
                        onDelete={(projectId) => void handleDeleteProject(projectId)}
                      />
                    ))}

                    {!isSpectator && (
                      <ProjectDropzone
                        upload={uploadState}
                        onFileSelect={(file) => void handleProjectFile(file)}
                        onRetry={() => {
                          if (projectRetryFile) {
                            void handleProjectFile(projectRetryFile);
                          }
                        }}
                        compact
                      />
                    )}
                  </div>

                  {allProjects.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllWork((value) => !value)}
                      className="mt-6 mx-auto block px-5 py-2 bg-blue-950/40 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-900/60 hover:border-blue-500 rounded-lg font-mono text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer"
                    >
                      {showAllWork ? 'Collapse Assets' : `See All Uploaded Assets (${initialProjects.length})`}
                    </button>
                  ) : null}
                </>
              )}
            </section>

            <section id="my-ratings" className="scroll-mt-24 space-y-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">My Ratings</h2>
                <p className="mt-1 text-sm text-slate-400">Your score and recent scans.</p>
              </div>

              <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                <CardContent className="grid gap-8 p-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-center">
                  <div className="space-y-6">
                    <div className="flex items-center gap-5">
                      {typeof normalizedScore === 'number' ? (
                        <div className="relative flex h-28 w-28 items-center justify-center">
                          <div
                            className="absolute inset-0 rounded-full border border-white/10"
                            style={{
                              background: `conic-gradient(from 90deg, rgba(56,189,248,0.9) ${normalizedScore * 3.6}deg, rgba(56,189,248,0.15) 0deg)`,
                            }}
                          />
                          <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full border border-blue-950/50 bg-[#050b1b]/80">
                            <p className="mono text-3xl font-semibold text-white">{normalizedScore}</p>
                            <p className="text-[11px] text-slate-400">/100</p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative flex h-28 w-28 items-center justify-center">
                          <div className="absolute inset-0 rounded-full bg-sky-500/15 blur-xl" />
                          <div className="relative h-24 w-24 rounded-full border border-sky-400/40 bg-[#050b1b]/70 shadow-[0_0_30px_rgba(56,189,248,0.45)]">
                            <div className="absolute inset-0 animate-pulse rounded-full bg-sky-500/10" />
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-sm text-slate-400">Current status</p>
                        <p className="mt-2 text-xl font-semibold text-white">
                          {typeof normalizedScore === 'number' ? 'Verified' : 'Ready for review'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">My Work</p>
                        <p className="mt-3 text-2xl font-semibold text-white">{allProjects.length}</p>
                      </div>
                      <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Needs Review</p>
                        <p className="mt-3 text-2xl font-semibold text-white">{needsReviewCount}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white">MeliusAI Validation Stream</h3>
                      <Badge variant="outline" className="border-white/10 text-slate-200">
                        {scanHistory.length} scans
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-3">
                      {scanHistory.length === 0 ? (
                        <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                          <p className="text-sm text-white">No scans yet.</p>
                          <p className="mt-1 text-sm text-slate-400">Add a project to start your first review.</p>
                        </div>
                      ) : (
                        scanHistory.map((project) => (
                          <div
                            key={project.id}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4"
                          >
                            <div>
                              <p className="text-sm font-medium text-white">{project.title}</p>
                              <p className="mt-1 text-sm text-slate-400">
                                {project.created_at ? formatScanDate(project.created_at) : 'Recent scan'}
                              </p>
                              {project.description ? (
                                <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                                  {project.description.replace(/##\s*Executive Summary/i, '').trim()}
                                </p>
                              ) : null}
                            </div>
                            <Badge variant="outline" className="border-sky-400/30 text-sky-100">
                              {Math.round(project.logic_score ?? 0)}/100
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                    {initialReviews.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllRatings((value) => !value)}
                        className="mt-6 block px-5 py-2 bg-blue-950/40 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-900/60 hover:border-blue-500 rounded-lg font-mono text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer"
                      >
                        {showAllRatings ? 'Collapse Reviews' : `See All Reviews (${initialProjects.length})`}
                      </button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </section>

            {!isSpectator && (
              <section className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Opportunities</h2>
                <p className="mt-1 text-sm text-slate-400">Open roles for your next step.</p>
              </div>

              {loadingState ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((item) => (
                    <Card key={item} className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                      <CardContent className="p-5">
                        <div className="animate-pulse space-y-4">
                          <div className="h-3 w-28 rounded-full bg-cyan-400/10" />
                          <div className="h-6 w-2/3 rounded-full bg-white/10" />
                          <div className="space-y-2">
                            <div className="h-3 w-full rounded-full bg-white/5" />
                            <div className="h-3 w-5/6 rounded-full bg-white/5" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : fetchError ? (
                <Card className="border-rose-400/20 bg-rose-500/[0.07] backdrop-blur-md">
                  <CardContent className="p-6">
                    <p className="text-sm text-rose-100">{fetchError}</p>
                  </CardContent>
                </Card>
              ) : liveJobs.length > 0 ? (
                <div className="space-y-4">
                  {liveJobs.map((item, index) => (
                    <CandidateOpportunityCard
                      key={item.id || `${item.recruiter_name}-${item.role_title}-${index}`}
                      item={item}
                      displayName={displayName}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </div>
              ) : (
                <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                  <CardContent className="p-6">
                    <p className="text-sm text-slate-300">
                      No active opportunities are seeking your specific specialization right now. Keep optimizing your profile score!
                    </p>
                  </CardContent>
                </Card>
              )}
              </section>
            )}

            </div>
            </div>
            )}

            {viewingAuditAsset ? (
              <AuditReviewModal
                assetTitle={viewingAuditAsset.title}
                onClose={() => setViewingAuditAsset(null)}
                reportText={
                  verifyingAssetId === viewingAuditAsset.id && liveStreamText.trim()
                    ? liveStreamText
                    : viewingAuditAsset.description ?? viewingAuditAsset.ai_summary ?? ''
                }
                auditData={{
                  audit_summary: viewingAuditAsset.audit_summary,
                  pros: viewingAuditAsset.pros,
                  cons: viewingAuditAsset.cons,
                  recommendations: viewingAuditAsset.recommendations,
                }}
              />
            ) : null}

            <AssetPreviewModal
              activePreviewName={activePreviewName}
              activePreviewUrl={activePreviewUrl}
              previewProject={activePreviewProject}
              onProjectUpdated={handlePreviewProjectUpdated}
              onClose={() => {
                setActivePreviewProjectId(null);
                setActivePreviewName(null);
                setActivePreviewUrl(null);
              }}
            />
          </main>
    </div>
  );
}
