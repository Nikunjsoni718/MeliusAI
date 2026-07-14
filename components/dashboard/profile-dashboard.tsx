'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { BriefcaseBusiness, FileText, FolderLock, House, Mail, Search } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import useSWR, { useSWRConfig } from 'swr';

import faviconLogo from '@/app/favicon.png';
import { AssetPreviewModal } from '@/components/dashboard/asset-preview-modal';
import { CandidateOpportunityCard, CandidateOpportunitySkeleton } from '@/components/dashboard/candidate-opportunity-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { PROFILE_SPECTATOR_BASE_URL } from '@/lib/spectate-profile';
import { useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import type { ProjectFolderRow, ProjectRow, UserRow } from '@/types/supabase';

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
  folder_id?: string | null;
  is_public?: boolean | null;
  file_type: string | null;
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
  executive_summary?: string | null;
  summary?: string | null;
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
  last_improvement_summary?: string | null;
  created_at?: string | null;
  asset_data_url?: string | null;
  is_local?: boolean;
};

type WorkAssetGridItem =
  | { type: 'folder'; folder: ProjectFolderRow }
  | { type: 'project'; project: ProjectItem };

type FolderAuditItem = ProjectFolderRow & {
  evaluated_score?: number | string | null;
  melius_score?: number | string | null;
  score?: number | string | null;
  evaluation_score?: number | string | null;
  logic_score?: number | string | null;
  executive_summary?: string | null;
  audit_summary?: string | null;
  ai_summary?: string | null;
  description?: string | null;
  summary?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  recommendations?: string[] | null;
  has_been_audited?: boolean | null;
};

type AuditModalAsset = ProjectItem | FolderAuditItem;

type AuditScoreItem = {
  id?: string | null;
  evaluated_score?: number | string | null;
  melius_score?: number | string | null;
  score?: number | string | null;
  evaluation_score?: number | string | null;
  logic_score?: number | string | null;
};

type StagedFile = {
  path: string;
  name: string;
  content: string;
  sourceFile?: File;
  contentType?: string;
  selected: boolean;
};

const BLOCKED_FILES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pipfile',
  '.env',
  '.ds_store',
];

const BLOCKED_EXTENSIONS = [
  '.lock',
  '.exe',
  '.dll',
  '.bin',
  '.iso',
  '.dmg',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.pyc',
  '.o',
  '.obj',
  '.pickle',
  '.pkl',
];

function isBlockedStagedFile(sourceFileName: string) {
  const fileName = sourceFileName.split('/').pop()?.toLowerCase() || "";
  const isBlockedExtension = BLOCKED_EXTENSIONS.some((extension) =>
    fileName.endsWith(extension)
  );
  const isBlockedFile = BLOCKED_FILES.includes(fileName);

  return isBlockedExtension || isBlockedFile;
}

function normalizeAuditScore(rawScore: number | string | null | undefined) {
  if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
    return Math.max(0, Math.min(100, Math.round(rawScore)));
  }

  if (typeof rawScore === 'string' && rawScore.trim()) {
    const parsedScore = Number.parseInt(rawScore, 10);
    if (Number.isFinite(parsedScore)) {
      return Math.max(0, Math.min(100, parsedScore));
    }
  }

  return null;
}

function getAuditAssetScore(asset: AuditScoreItem | null | undefined) {
  const scoreCandidates = [
    asset?.evaluated_score,
    asset?.melius_score,
    asset?.score,
    asset?.evaluation_score,
    asset?.logic_score,
  ];

  for (const scoreCandidate of scoreCandidates) {
    const normalizedScore = normalizeAuditScore(scoreCandidate);

    if (normalizedScore !== null && normalizedScore > 0) {
      return normalizedScore;
    }
  }

  return null;
}

function getFolderAuditScore(folder: FolderAuditItem | null | undefined) {
  return getAuditAssetScore(folder);
}

function isProjectAuditAsset(asset: AuditModalAsset | null | undefined): asset is ProjectItem {
  return Boolean(asset && 'title' in asset);
}

function getAuditModalAssetTitle(asset: AuditModalAsset) {
  return isProjectAuditAsset(asset) ? asset.title : asset.name;
}

function getAuditModalAssetSummary(asset: AuditModalAsset) {
  return (
    asset.ai_summary?.trim() ||
    asset.audit_summary?.trim() ||
    asset.executive_summary?.trim() ||
    asset.summary?.trim() ||
    asset.description?.trim() ||
    (isProjectAuditAsset(asset) ? asset.user_description?.trim() : '') ||
    'Audit complete. Review the insights below.'
  );
}

function getAuditModalAssetReportText(asset: AuditModalAsset) {
  const score = getAuditAssetScore(asset) ?? 0;
  const pros = Array.isArray(asset.pros) ? asset.pros : [];
  const cons = Array.isArray(asset.cons) ? asset.cons : [];
  const recommendations = Array.isArray(asset.recommendations) ? asset.recommendations : [];

  return [
    getAuditModalAssetSummary(asset),
    pros.length > 0 ? `Strengths\n${pros.map((item) => `- ${item}`).join('\n')}` : '',
    cons.length > 0 ? `Weaknesses\n${cons.map((item) => `- ${item}`).join('\n')}` : '',
    recommendations.length > 0 ? `Recommendations\n${recommendations.map((item) => `- ${item}`).join('\n')}` : '',
    `MeliusAI Score: ${score}/100`,
  ]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

function getAuditReportDataUrl(asset: AuditModalAsset) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(getAuditModalAssetReportText(asset))}`;
}

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

type CandidateOpportunityDismissalsClient = {
  from: (table: 'candidate_opportunity_dismissals') => {
    insert: (row: { candidate_id: string; opportunity_id: string }) => PromiseLike<{
      error: { message?: string; code?: string; details?: string; hint?: string } | null;
    }>;
  };
};

type SpectatorProfilePayload = {
  id?: string | null;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  age?: number | null;
  current_status?: string | null;
  qualifications?: string[] | null;
  experience?: string[] | string | null;
  hobbies?: string[] | null;
  skills?: string[] | null;
  projects?: ProjectRow[] | null;
  projectFolders?: ProjectFolderRow[] | null;
};
type SavedProfileItem = SpectatorProfilePayload & {
  birth_date?: string | null;
  avg_project_score?: number | null;
  average_project_score?: number | null;
};
type SpectatorRatingItem = SpectatorScanItem & {
  project_id?: string | null;
  score?: number | null;
  summary?: string | null;
  improvement_tips?: unknown;
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
type NormalizedSpectateProfileResponse = {
  detail: string | null;
  isOwner: boolean;
  message: string | null;
  profile: SavedProfileItem | null;
  projects: ProjectRow[];
  projectFolders: ProjectFolderRow[];
  ratings: unknown[];
  opportunities: unknown[];
  authenticationStatus: string | null;
  viewerType: string | null;
};
type DashboardNavigationItem = {
  href: string;
  label: string;
  icon: ReactNode;
  ownerOnly?: boolean;
};
type ProfileDraft = {
  displayName: string;
  username: string;
  birthDate: string;
};
type AuthStorageDebugState = {
  cookieNames: string[];
  localStorageKeys: string[];
};

const PROFILE_EMBEDDING_SYNC_ENDPOINT = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api/profile/sync-embedding`
  : '';
const FOLDER_AUDIT_ENDPOINT = `${PROFILE_SPECTATOR_BASE_URL}/api/audit-project`;
const PROFILE_UPDATE_ENDPOINT = '/api/profile/update';
const DASHBOARD_PROFILE_CACHE_MS = 30 * 60 * 1000;
const PROFILE_DASHBOARD_COLUMNS =
  'id, username, full_name, bio, current_status, avg_project_score, avatar_url, email';
const PROJECT_DASHBOARD_COLUMNS =
  'id, user_id, folder_id, name, file_url, file_type, created_at, logic_score, ai_summary, is_public, description, evaluation_score, has_been_audited, score, audit_summary, pros, cons, recommendations, status, user_description, title, file_size';
const DASHBOARD_PROJECT_LIMIT = 80;
async function syncProfileVectorEmbedding(payload: Record<string, unknown>, accessToken?: string | null) {
  if (!PROFILE_EMBEDDING_SYNC_ENDPOINT) {
    console.warn('Profile vector sync skipped: NEXT_PUBLIC_API_URL is not configured.');
    return;
  }

  try {
    const response = await fetch(PROFILE_EMBEDDING_SYNC_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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

function getProfileUsernameFromPathname(pathname: string) {
  const profilePathMatch = pathname.match(/^\/profile\/([^/?#]+)/);
  return normalizeProfileUsername(profilePathMatch?.[1]);
}

function normalizeDisplayUsername(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || null;
}

function resolveDisplayUsername({
  fullName,
  id,
  username,
}: {
  fullName?: string | null;
  id?: string | null;
  username?: string | null;
}) {
  return normalizeDisplayUsername(username) ?? normalizeDisplayUsername(fullName) ?? normalizeDisplayUsername(id) ?? 'member';
}

const USERNAME_TAKEN_MESSAGE = 'This username is already taken.';

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }

  return String(error ?? '');
}

function isUsernameConflictError(error: unknown) {
  const errorText = getErrorText(error).toLowerCase();
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  return (
    errorCode === '23505' ||
    errorText.includes('duplicate key') ||
    errorText.includes('unique constraint') ||
    errorText.includes('already exists')
  );
}

function normalizeProfileList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

type SpectatorProfileCacheKey = readonly ['spectate-profile', string, string];

async function fetchSpectatorProfile([
  ,
  targetUsername,
]: SpectatorProfileCacheKey, supabase?: SupabaseClient): Promise<NormalizedSpectateProfileResponse> {
  if (!supabase) {
    throw new Error('Supabase is not configured for dashboard profile loading.');
  }

  const username = normalizeProfileUsername(targetUsername);
  if (!username) {
    throw new Error('Unable to load candidate profile without a username.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.warn('Dashboard ownership check could not read the Supabase user:', userError.message);
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_DASHBOARD_COLUMNS)
    .eq('username', username)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message || `Unable to load candidate profile "${username}".`);
  }

  let savedProfile = profileData as SavedProfileItem | null;

  if (!savedProfile && user?.id === username) {
    const { data: profileById, error: profileByIdError } = await supabase
      .from('profiles')
      .select(PROFILE_DASHBOARD_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();

    if (profileByIdError) {
      console.warn('Dashboard UUID fallback could not load profile by id:', profileByIdError.message);
    }

    savedProfile = profileById as SavedProfileItem | null;
  }

  if (!savedProfile?.id) {
    const fallbackProfile = {
      id: user?.id ?? username,
      username,
      full_name: null,
      bio: null,
      current_status: null,
      avg_project_score: null,
      avatar_url: null,
      email: user?.email ?? null,
    } satisfies SavedProfileItem;
    const fallbackIsOwner = Boolean(user?.id && user.id === fallbackProfile.id);

    return {
      detail: `Profile "${username}" was not found.`,
      isOwner: fallbackIsOwner,
      message: 'Profile not found.',
      profile: fallbackProfile,
      projects: [],
      projectFolders: [],
      ratings: [],
      opportunities: [],
      authenticationStatus: user ? 'authenticated' : 'anonymous',
      viewerType: fallbackIsOwner ? 'owner' : user ? 'authenticated' : 'public',
    };
  }

  const isOwner = user?.id === savedProfile.id;
  let projectsQuery = supabase
    .from('projects')
    .select(PROJECT_DASHBOARD_COLUMNS)
    .eq('user_id', savedProfile.id)
    .order('created_at', { ascending: false })
    .limit(DASHBOARD_PROJECT_LIMIT);

  if (!isOwner) {
    projectsQuery = projectsQuery.eq('is_public', true);
  }

  const { data: projectsData, error: projectsError } = await projectsQuery;
  const { data: projectFoldersData, error: projectFoldersError } = await supabase
    .from('project_folders')
    .select('*')
    .eq('user_id', savedProfile.id)
    .order('created_at', { ascending: false });

  if (projectsError) {
    throw new Error(projectsError.message || `Unable to load projects for "${username}".`);
  }

  if (projectFoldersError) {
    throw new Error(projectFoldersError.message || `Unable to load project folders for "${username}".`);
  }

  const projects = Array.isArray(projectsData) ? (projectsData as ProjectRow[]) : [];
  const projectFolders = Array.isArray(projectFoldersData) ? (projectFoldersData as ProjectFolderRow[]) : [];

  return {
    detail: null,
    isOwner,
    message: null,
    profile: savedProfile,
    projects,
    projectFolders,
    ratings: [],
    opportunities: [],
    authenticationStatus: user ? 'authenticated' : 'anonymous',
    viewerType: isOwner ? 'owner' : user ? 'authenticated' : 'public',
  };
}

function formatScanDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recent scan';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeSpectatorRating(value: unknown): SpectatorScanItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rating = value as Record<string, unknown>;
  const id = typeof rating.id === 'string' && rating.id.trim()
    ? rating.id.trim()
    : typeof rating.project_id === 'string'
      ? `rating-${rating.project_id}`
      : '';

  if (!id) {
    return null;
  }

  const rawScore = Number(rating.logic_score ?? rating.evaluation_score ?? rating.score);
  const improvementTips = Array.isArray(rating.improvement_tips)
    ? rating.improvement_tips.map((item) => String(item)).filter(Boolean)
    : [];

  return {
    id,
    project_id: typeof rating.project_id === 'string' ? rating.project_id : null,
    title: typeof rating.title === 'string' ? rating.title : null,
    score: Number.isFinite(rawScore) ? rawScore : null,
    evaluation_score: Number.isFinite(rawScore) ? rawScore : null,
    logic_score: Number.isFinite(rawScore) ? rawScore : null,
    summary: typeof rating.summary === 'string' ? rating.summary : null,
    ai_summary: typeof rating.ai_summary === 'string' ? rating.ai_summary : null,
    description:
      typeof rating.description === 'string'
        ? rating.description
        : improvementTips.length > 0
          ? improvementTips.join('\n')
          : null,
    created_at: typeof rating.created_at === 'string' ? rating.created_at : null,
  };
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
  ipynb: 'python',
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
const officeBridgeExtensions = new Set(['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx']);

function getCodeLanguage(extension: string) {
  return codeLanguageMap[extension] ?? null;
}

const auditTextFileExtensions = new Set(Object.keys(codeLanguageMap));

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
  return sources.some((source) => auditTextFileExtensions.has(getFileExtensionFromSource(source)));
}

const extractCodeAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result ?? ''));
    reader.onerror = () => reject(new Error("Failed"));
    reader.readAsText(file, "UTF-8");
  });

const readAssetAsDataURL = (asset: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read asset.'));
    reader.readAsDataURL(asset);
  });

async function readRemoteTextAsUtf8(src: string) {
  const response = await fetch(src);

  if (!response.ok) {
    throw new Error('Unable to read code preview.');
  }

  return response.text();
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

  return project.file_type?.toUpperCase() ?? 'FILE';
}

function getProjectDownloadHref(project: ProjectItem) {
  return project.preview_url ?? project.file_url ?? null;
}

function mapProjectRowToProjectItem(row: ProjectRow): ProjectItem {
  const rowWithAuditAliases = row as ProjectRow & {
    executive_summary?: string | null;
    summary?: string | null;
  };
  const fileName = row.file_name ?? row.name ?? row.title ?? 'Project';
  const fileUrl = row.file_url ?? null;
  const fileType = row.file_type ?? null;
  const fileExtension = getFileExtension(fileName);
  const hydratedScore = typeof row.score === 'number' ? row.score : null;
  const hydratedAuditSummary = row.audit_summary?.trim() || row.ai_summary?.trim() || null;
  const hydratedAiSummary = row.ai_summary?.trim() || row.audit_summary?.trim() || null;
  const hydratedSummary =
    rowWithAuditAliases.summary?.trim() ||
    rowWithAuditAliases.executive_summary?.trim() ||
    hydratedAuditSummary ||
    hydratedAiSummary;

  return {
    id: row.id,
    user_id: row.user_id ?? null,
    folder_id: row.folder_id ?? null,
    is_public: row.is_public ?? null,
    title: fileName,
    file_type: fileExtension ? fileExtension.toUpperCase() : row.file_type ?? null,
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
    description: row.description ?? hydratedAuditSummary ?? hydratedAiSummary,
    executive_summary: rowWithAuditAliases.executive_summary ?? hydratedAuditSummary ?? hydratedAiSummary,
    summary: hydratedSummary ?? null,
    user_description: row.user_description ?? null,
    score: hydratedScore,
    audit_summary: hydratedAuditSummary,
    pros: Array.isArray(row.pros) ? row.pros : null,
    cons: Array.isArray(row.cons) ? row.cons : null,
    recommendations: Array.isArray(row.recommendations) ? row.recommendations : null,
    evaluation_score: typeof row.evaluation_score === 'number' ? row.evaluation_score : hydratedScore,
    has_been_audited:
      row.has_been_audited ?? Boolean(hydratedScore !== null || hydratedAuditSummary || hydratedAiSummary),
    logic_score: typeof row.logic_score === 'number' ? row.logic_score : hydratedScore,
    ai_summary: hydratedAiSummary,
    last_improvement_summary: row.last_improvement_summary ?? null,
    created_at: row.created_at ?? null,
    is_local: false,
  };
}

function mergeProjectLists(currentProjects: ProjectItem[], incomingProjects: ProjectItem[]) {
  const incomingById = new Map(incomingProjects.map((project) => [project.id, project]));
  const currentById = new Map(currentProjects.map((project) => [project.id, project]));
  const mergedProjects = incomingProjects.map((incomingProject) => {
    const currentProject = currentById.get(incomingProject.id);

    if (!currentProject) {
      return incomingProject;
    }

    if (currentProject.has_been_audited && !incomingProject.has_been_audited) {
      return { ...incomingProject, ...currentProject };
    }

    return { ...currentProject, ...incomingProject };
  });

  currentProjects.forEach((currentProject) => {
    if (!incomingById.has(currentProject.id)) {
      mergedProjects.push(currentProject);
    }
  });

  return mergedProjects;
}

function mergeVerifiedProject(
  currentProject: ProjectItem,
  projectPatch: Partial<ProjectItem>,
  fallbackReportText: string
) {
  return {
    ...currentProject,
    ...projectPatch,
    has_been_audited: projectPatch.has_been_audited ?? true,
    evaluation_score: projectPatch.evaluation_score ?? projectPatch.score ?? currentProject.evaluation_score,
    logic_score: projectPatch.logic_score ?? projectPatch.score ?? currentProject.logic_score,
    score: projectPatch.score ?? projectPatch.logic_score ?? projectPatch.evaluation_score ?? currentProject.score,
    audit_summary: projectPatch.audit_summary ?? projectPatch.executive_summary ?? projectPatch.summary ?? currentProject.audit_summary,
    executive_summary: projectPatch.executive_summary ?? projectPatch.audit_summary ?? currentProject.executive_summary,
    summary: projectPatch.summary ?? projectPatch.audit_summary ?? currentProject.summary,
    ai_summary: projectPatch.ai_summary ?? fallbackReportText,
    description: projectPatch.description ?? fallbackReportText,
    pros: projectPatch.pros ?? currentProject.pros,
    cons: projectPatch.cons ?? currentProject.cons,
    recommendations: projectPatch.recommendations ?? currentProject.recommendations,
  };
}

function getOfficeBridgeSourceUrl(project: ProjectItem) {
  const href = project.file_url ?? project.preview_url ?? null;

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
  onPrefetch,
}: {
  label: string;
  active?: boolean;
  href: string;
  icon: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onPrefetch?: () => void;
}) {
  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      title={label}
      onClick={onClick}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
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
      aria-label="Account Settings"
      title="Account Settings"
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
      <span className="font-sans text-sm tracking-wide">Account Settings</span>
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

function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn('animate-pulse rounded-full bg-slate-800/70', className)} />;
}

function DashboardSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 opacity-100 transition-opacity duration-500">
      <div className="w-full min-w-0 rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md sm:p-6 lg:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col items-start gap-5 sm:flex-row sm:items-center">
            <div className="h-16 w-16 shrink-0 animate-pulse rounded-full border border-slate-800 bg-slate-800/70" />
            <div className="min-w-0 flex-1 space-y-4">
              <SkeletonBlock className="h-3 w-44" />
              <div className="flex flex-wrap gap-2">
                <SkeletonBlock className="h-6 w-20" />
                <SkeletonBlock className="h-6 w-24" />
                <SkeletonBlock className="h-6 w-28" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SkeletonBlock className="h-9 w-56 rounded-xl" />
                <SkeletonBlock className="h-7 w-24" />
                <SkeletonBlock className="h-7 w-32" />
              </div>
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-9 w-full max-w-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-28 rounded-lg" />
            <SkeletonBlock className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="space-y-10">
        <section className="space-y-4">
          <Card className="relative overflow-hidden border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
            <CardContent className="p-4 sm:p-6">
              <SkeletonBlock className="h-3 w-12" />
              <SkeletonBlock className="mt-3 h-7 w-36 rounded-lg" />
              <div className="mt-5 space-y-3 rounded-2xl border border-blue-950/40 bg-[#050b1b]/35 p-5">
                <SkeletonBlock className="h-4 w-full rounded-lg" />
                <SkeletonBlock className="h-4 w-11/12 rounded-lg" />
                <SkeletonBlock className="h-4 w-3/4 rounded-lg" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <SkeletonBlock className="h-7 w-44 rounded-lg" />
              <SkeletonBlock className="h-4 w-32 rounded-lg" />
            </div>
            <SkeletonBlock className="h-7 w-24" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Card key={item} className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                <CardContent className="p-5">
                  <SkeletonBlock className="h-4 w-2/3 rounded-lg" />
                  <SkeletonBlock className="mt-4 h-32 w-full rounded-2xl" />
                  <SkeletonBlock className="mt-4 h-4 w-full rounded-lg" />
                  <SkeletonBlock className="mt-2 h-4 w-4/5 rounded-lg" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="my-ratings" className="space-y-4">
          <div className="space-y-3">
            <SkeletonBlock className="h-7 w-36 rounded-lg" />
            <SkeletonBlock className="h-4 w-52 rounded-lg" />
          </div>
          <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
            <CardContent className="grid gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-center">
              <div className="space-y-6">
                <div className="flex items-center gap-5">
                  <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                    <div className="absolute inset-0 animate-pulse rounded-full border border-slate-800 bg-slate-800/70" />
                    <div className="relative h-24 w-24 animate-pulse rounded-full border border-slate-700 bg-slate-900/80" />
                  </div>
                  <div className="space-y-3">
                    <SkeletonBlock className="h-4 w-24 rounded-lg" />
                    <SkeletonBlock className="h-7 w-36 rounded-lg" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                    <SkeletonBlock className="h-3 w-20 rounded-lg" />
                    <SkeletonBlock className="mt-4 h-8 w-14 rounded-lg" />
                  </div>
                  <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                    <SkeletonBlock className="h-3 w-28 rounded-lg" />
                    <SkeletonBlock className="mt-4 h-8 w-14 rounded-lg" />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-6 w-56 rounded-lg" />
                  <SkeletonBlock className="h-7 w-20" />
                </div>
                <div className="mt-4 space-y-3">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4"
                    >
                      <div className="flex-1 space-y-3">
                        <SkeletonBlock className="h-4 w-2/5 rounded-lg" />
                        <SkeletonBlock className="h-3 w-1/4 rounded-lg" />
                        <SkeletonBlock className="h-3 w-4/5 rounded-lg" />
                      </div>
                      <SkeletonBlock className="h-7 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function ProfileIdentitySkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonBlock className="h-4 w-40 rounded-lg" />
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-6 w-20" />
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="h-6 w-28" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SkeletonBlock className="h-9 w-56 rounded-xl" />
        <SkeletonBlock className="h-7 w-24" />
      </div>
      <SkeletonBlock className="h-4 w-28 rounded-lg" />
      <SkeletonBlock className="h-9 w-full max-w-xs rounded-full" />
    </div>
  );
}

function BioSectionSkeleton() {
  return (
    <section className="space-y-4">
      <Card className="relative overflow-hidden border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
        <CardContent className="p-4 sm:p-6">
          <div>
            <SkeletonBlock className="h-4 w-12 rounded-lg" />
            <SkeletonBlock className="mt-3 h-7 w-36 rounded-lg" />
          </div>
          <div className="mt-5 space-y-3 rounded-2xl border border-blue-950/40 bg-[#050b1b]/35 p-5">
            <SkeletonBlock className="h-4 w-full rounded-lg" />
            <SkeletonBlock className="h-4 w-11/12 rounded-lg" />
            <SkeletonBlock className="h-4 w-4/5 rounded-lg" />
            <SkeletonBlock className="h-4 w-2/3 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function WorkAssetsSkeleton() {
  return (
    <section id="my-work-assets" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <SkeletonBlock className="h-7 w-44 rounded-lg" />
          <SkeletonBlock className="h-4 w-32 rounded-lg" />
        </div>
        <SkeletonBlock className="h-7 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
            <CardContent className="p-5">
              <SkeletonBlock className="h-4 w-2/3 rounded-lg" />
              <SkeletonBlock className="mt-4 h-32 w-full rounded-2xl" />
              <SkeletonBlock className="mt-4 h-4 w-full rounded-lg" />
              <SkeletonBlock className="mt-2 h-4 w-4/5 rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function RatingsSectionSkeleton() {
  return (
    <section id="my-ratings" className="scroll-mt-24 space-y-4">
      <div className="space-y-3">
        <SkeletonBlock className="h-7 w-36 rounded-lg" />
        <SkeletonBlock className="h-4 w-52 rounded-lg" />
      </div>
      <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
        <CardContent className="grid gap-8 p-4 sm:p-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-center">
          <div className="space-y-6">
            <div className="flex items-center gap-5">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                <div className="absolute inset-0 animate-pulse rounded-full border border-slate-800 bg-slate-800/70" />
                <div className="relative h-24 w-24 animate-pulse rounded-full border border-slate-700 bg-slate-900/80" />
              </div>
              <div className="space-y-3">
                <SkeletonBlock className="h-4 w-24 rounded-lg" />
                <SkeletonBlock className="h-7 w-36 rounded-lg" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                <SkeletonBlock className="h-3 w-20 rounded-lg" />
                <SkeletonBlock className="mt-4 h-8 w-14 rounded-lg" />
              </div>
              <div className="rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
                <SkeletonBlock className="h-3 w-28 rounded-lg" />
                <SkeletonBlock className="mt-4 h-8 w-14 rounded-lg" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-6 w-56 rounded-lg" />
              <SkeletonBlock className="h-7 w-20 rounded-full" />
            </div>
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-blue-950/50 bg-[#050b1b]/60 p-4"
                >
                  <div className="flex-1 space-y-3">
                    <SkeletonBlock className="h-4 w-2/5 rounded-lg" />
                    <SkeletonBlock className="h-3 w-1/4 rounded-lg" />
                    <SkeletonBlock className="h-3 w-4/5 rounded-lg" />
                  </div>
                  <SkeletonBlock className="h-7 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
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
        src={project.preview_url ?? project.file_url ?? null}
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

function ProjectCard({
  project,
  isSpectator,
  verifyingAssetId,
  deletingProjectId,
  verifiedAssetId,
  onVerify,
  handleReUpload,
  onOpen,
  onDelete,
}: {
  project: ProjectItem;
  isSpectator: boolean;
  verifyingAssetId: string | null;
  deletingProjectId: string | null;
  verifiedAssetId: string | null;
  onVerify: (project: ProjectItem, event?: MouseEvent<HTMLButtonElement>) => void;
  handleReUpload: (event: ChangeEvent<HTMLInputElement>, projectId: string) => Promise<void>;
  onOpen: (project: ProjectItem) => void;
  onDelete: (projectId: string) => void;
}) {
  const reuploadInputRef = useRef<HTMLInputElement | null>(null);
  const isProjectVerifying = verifyingAssetId === project.id;
  const isProjectDeleting = deletingProjectId === project.id;
  const isProjectVerified = verifiedAssetId === project.id;
  const hasCompletedAudit = Boolean(project.has_been_audited);
  const fileExtension = getProjectExtension(project).toUpperCase() || project.file_type || 'Asset';
  const fileName = project.file_name || project.title;

  function handlePreviewClick(e: MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    onOpen(project);
  }

  function handlePreviewKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onOpen(project);
    }
  }

  return (
    <Card className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-slate-800/60 bg-[#090e24] shadow-lg transition-all duration-300 hover:border-slate-700/80">
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

            <div
              role="button"
              tabIndex={0}
              onClick={handlePreviewClick}
              onKeyDown={handlePreviewKeyDown}
              className="relative mb-4 flex h-32 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-slate-900 bg-slate-950/40 transition hover:border-cyan-500/30"
              aria-label={`Preview ${project.title}`}
            >
              <ProjectPreviewSurface project={project} />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-auto pt-4 w-full">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                if (!hasCompletedAudit && !isSpectator) {
                  onVerify(project, event);
                  return;
                }

                onOpen(project);
              }}
              className="w-full py-2 px-4 rounded-full bg-[#11162d] border border-slate-800/60 hover:border-slate-700 text-slate-300 hover:text-white font-medium text-[11px] tracking-wide transition-all duration-200 text-center cursor-pointer"
            >
              Read Full Audit Protocol
            </button>

            {!isSpectator && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onVerify(project, event);
                }}
                disabled={verifyingAssetId !== null || isProjectDeleting}
                aria-busy={isProjectVerifying}
                className={cn(
                  'w-full py-2 px-4 rounded-full bg-[#070a19] border border-slate-900 hover:bg-[#11162d]/50 disabled:bg-slate-950/20 disabled:text-slate-700 text-slate-400 hover:text-slate-200 font-medium text-[11px] tracking-wide transition-all duration-200 text-center cursor-pointer',
                  isProjectVerifying && 'animate-pulse border-cyan-500/40 text-cyan-300',
                  (isProjectVerified || hasCompletedAudit) && !isProjectVerifying && 'border-emerald-500/30 text-emerald-300'
                )}
              >
                {isProjectVerifying
                  ? 'Auditing via GPT Engine...'
                  : hasCompletedAudit || isProjectVerified
                    ? 'AI Audit Completed'
                    : 'Verify with MeliusAI'}
              </button>
            )}

            {!isSpectator && hasCompletedAudit ? (
              <>
                <input
                  ref={reuploadInputRef}
                  type="file"
                  accept="*/*"
                  className="sr-only"
                  aria-label={`Choose a replacement file for ${project.title}`}
                  onChange={(event) => void handleReUpload(event, project.id)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    reuploadInputRef.current?.click();
                  }}
                  disabled={verifyingAssetId !== null || isProjectDeleting}
                  className="h-auto w-full rounded-full border-slate-800/80 bg-slate-950/50 px-4 py-2 text-[11px] tracking-wide text-slate-400 shadow-none hover:border-cyan-500/40 hover:bg-cyan-950/20 hover:text-cyan-200 hover:shadow-[0_0_16px_rgba(34,211,238,0.08)]"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  Re-upload Asset
                </Button>
              </>
            ) : null}
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
  const {
    authEnabled,
    hasAccessToken,
    loading,
    profile,
    session,
    supabase,
    user,
  } = useViewerProfile();
  const { mutate } = useSWRConfig();
  const currentUser = user;
  const [profileData, setProfileData] = useState<SavedProfileItem | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectFolders, setProjectFolders] = useState<ProjectFolderRow[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [scans, setScans] = useState<SpectatorScanItem[]>([]);
  const [showAllWork, setShowAllWork] = useState(false);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [stagingFolderName, setStagingFolderName] = useState<string>('');
  const [isStagingModalOpen, setIsStagingModalOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [, setProjectRetryFile] = useState<File | null>(null);
  const [projectDescription, setProjectDescription] = useState('');
  const [projectDescriptions, setProjectDescriptions] = useState<Record<string, string>>({});
  const [liveJobs, setLiveJobs] = useState<LiveOpportunityItem[]>([]);
  const [loadingState, setLoadingState] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState(false);
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);
  const [verifiedAssetId, setVerifiedAssetId] = useState<string | null>(null);
  const [liveStreamText, setLiveStreamText] = useState('');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [auditingFolders, setAuditingFolders] = useState<Record<string, boolean>>({});
  const [projectVerifyError, setProjectVerifyError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [activePreviewProjectId, setActivePreviewProjectId] = useState<string | null>(null);
  const [activePreviewProjectOverride, setActivePreviewProjectOverride] = useState<ProjectItem | null>(null);
  const [activePreviewName, setActivePreviewName] = useState<string | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [resolvedProfileId, setResolvedProfileId] = useState<string | null>(null);
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
  const [usernameSaveError, setUsernameSaveError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const isSpectator = !isOwner;
  const [authStorageDebug, setAuthStorageDebug] = useState<AuthStorageDebugState>({
    cookieNames: [],
    localStorageKeys: [],
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFolderInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionSaveTimersRef = useRef<Record<string, number>>({});
  const verifyErrorTimerRef = useRef<number | null>(null);
  const verifiedAssetTimerRef = useRef<number | null>(null);
  const hydratedProfileKeyRef = useRef<string | null>(null);
  const lastSavedProfileRef = useRef<ProfileDraft | null>(null);
  const profileSaveSequenceRef = useRef(0);
  const bioSaveSequenceRef = useRef(0);
  const bioSavedTimerRef = useRef<number | null>(null);
  const bioToastTimerRef = useRef<number | null>(null);
  const lastSavedBioRef = useRef('');
  const lastSavedSkillsInputRef = useRef('');
  const dashboardPrefetchKeysRef = useRef<Set<string>>(new Set());
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
  const spectatorProfileKey = useMemo(
    () => {
      if (!targetUsername) {
        return null;
      }

      if (authEnabled && loading) {
        return null;
      }

      return ['spectate-profile', targetUsername, user?.id ?? 'anonymous'] as const;
    },
    [authEnabled, loading, targetUsername, user?.id]
  );
  const dashboardProfileFetcher = useCallback(
    (cacheKey: SpectatorProfileCacheKey) => fetchSpectatorProfile(cacheKey, supabase ?? undefined),
    [supabase]
  );
  const {
    data: spectatorProfilePayload,
    error: spectatorProfileError,
    isLoading: spectatorProfileLoading,
  } = useSWR(spectatorProfileKey, dashboardProfileFetcher, {
    dedupingInterval: DASHBOARD_PROFILE_CACHE_MS,
    errorRetryInterval: 15_000,
    errorRetryCount: 2,
    focusThrottleInterval: DASHBOARD_PROFILE_CACHE_MS,
    keepPreviousData: true,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const prefetchDashboardProfilePayload = useCallback(() => {
    if (!spectatorProfileKey || spectatorProfileLoading || spectatorProfilePayload) {
      return;
    }

    const prefetchKey = spectatorProfileKey.join(':');
    if (dashboardPrefetchKeysRef.current.has(prefetchKey)) {
      return;
    }

    dashboardPrefetchKeysRef.current.add(prefetchKey);
    void mutate<NormalizedSpectateProfileResponse>(
      spectatorProfileKey,
      dashboardProfileFetcher(spectatorProfileKey),
      {
        populateCache: true,
        revalidate: false,
        rollbackOnError: false,
      }
    ).catch((error) => {
      dashboardPrefetchKeysRef.current.delete(prefetchKey);
      console.warn('Dashboard profile prefetch skipped:', error);
    });
  }, [dashboardProfileFetcher, mutate, spectatorProfileKey, spectatorProfileLoading, spectatorProfilePayload]);
  const prefetchDashboardNavigation = useCallback(
    (item: DashboardNavigationItem) => {
      const routeHref = item.href.split('#')[0] || item.href;

      router.prefetch(routeHref);

      if (item.label === 'Vault' || item.label === 'Home' || item.label === 'Resume') {
        prefetchDashboardProfilePayload();
      }
    },
    [prefetchDashboardProfilePayload, router]
  );
  const viewerMetadataUsername =
    typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : undefined;

  const displayName =
    profileDraft.displayName ||
    profileData?.full_name ||
    profileFallback?.displayName ||
    (isOwner ? profile?.display_name : null) ||
    (isOwner ? user?.user_metadata?.full_name : null) ||
    (isOwner ? user?.user_metadata?.name : null) ||
    'Member';
  const displayUsername = resolveDisplayUsername({
    username:
      profileDraft.username ||
      profileData?.username ||
      profileFallback?.username ||
      (isOwner ? profile?.username : null) ||
      (isOwner ? user?.user_metadata?.username : null),
    fullName: profileData?.full_name || profileDraft.displayName || profileFallback?.displayName || displayName,
    id: profileData?.id ?? resolvedProfileId ?? (isOwner ? user?.id : undefined) ?? targetUsername ?? profileId,
  });
  const username = displayUsername;
  const isSpectating = !isOwner && Boolean(targetUsername);
  const profileHandle = username || targetUsername || 'member';
  const profileHref = `/profile/${encodeURIComponent(profileHandle)}`;
  const email =
    profileData?.email?.trim() ||
    profileFallback?.email?.trim() ||
    (isOwner ? user?.email?.trim() : '') ||
    '';
  const profileAge = typeof profileData?.age === 'number' ? profileData.age : null;
  const profileCurrentStatus = profileData?.current_status?.trim() ?? '';
  const displayBio = profileData?.bio?.trim() || bioText.trim();
  const avatarUrl =
    profileData?.avatar_url ??
    avatarPreviewUrl ??
    profileFallback?.avatarUrl ??
    (isOwner ? profile?.avatar_url : null) ??
    (isOwner ? (user?.user_metadata?.avatar_url as string | undefined) : null) ??
    (isOwner ? (user?.user_metadata?.picture as string | undefined) : null) ??
    null;
  const avgProjectScore =
    typeof profileData?.avg_project_score === 'number'
      ? Math.round(profileData.avg_project_score)
      : typeof profileFallback?.avgProjectScore === 'number'
      ? Math.round(profileFallback.avgProjectScore)
      : 0;
  const isProfilePayloadPending = Boolean(targetUsername) && !profileData && !spectatorProfileError;
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
          ownerOnly: true,
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
        {
          href: `${profileHref}#opportunities`,
          label: 'Opportunities',
          icon: <BriefcaseBusiness className="h-5 w-5" strokeWidth={1.8} />,
          ownerOnly: true,
        },
      ];

      return items.filter((item) => !item.ownerOnly || isOwner);
    },
    [isOwner, isSpectator, profileHref, targetUsername]
  );

  const firstName = useMemo(() => displayName.trim().split(/\s+/)[0] ?? 'there', [displayName]);
  const isProjectUploading = uploadState?.status === 'uploading';
  const isSyncing =
    profileSyncState === 'syncing' ||
    bioSaveState === 'saving' ||
    verifyingAssetId !== null ||
    deletingProjectId !== null ||
    isProjectUploading ||
    isUploading;
  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const rightDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        const leftDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        return rightDate - leftDate;
      }),
    [projects]
  );
  const sortedProjectFolders = useMemo(
    () =>
      [...projectFolders].sort((a, b) => {
        const rightDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        const leftDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        return rightDate - leftDate;
      }),
    [projectFolders]
  );
  const allProjects = sortedProjects;
  const standaloneProjects = useMemo(
    () => allProjects.filter((project) => !project.folder_id),
    [allProjects]
  );
  const activeFolder = useMemo(
    () => projectFolders.find((folder) => folder.id === activeFolderId) ?? null,
    [activeFolderId, projectFolders]
  );
  const activeFolderProjects = useMemo(
    () => (activeFolderId ? allProjects.filter((project) => project.folder_id === activeFolderId) : []),
    [activeFolderId, allProjects]
  );
  const rootWorkItems = useMemo<WorkAssetGridItem[]>(
    () =>
      [
        ...sortedProjectFolders.map((folder) => ({
          type: 'folder' as const,
          folder,
        })),
        ...standaloneProjects.map((project) => ({
          type: 'project' as const,
          project,
        })),
      ].sort((left, right) => {
        const leftDate =
          left.type === 'folder'
            ? left.folder.created_at
            : left.project.created_at;
        const rightDate =
          right.type === 'folder'
            ? right.folder.created_at
            : right.project.created_at;
        const leftTime = leftDate ? new Date(leftDate).getTime() : 0;
        const rightTime = rightDate ? new Date(rightDate).getTime() : 0;
        return rightTime - leftTime;
      }),
    [sortedProjectFolders, standaloneProjects]
  );
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
          file_type: relatedProject?.file_type ?? null,
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
  const allAuditableAssets = useMemo<AuditScoreItem[]>(
    () => [...projectFolders, ...allProjects],
    [projectFolders, allProjects]
  );
  const auditedAssets = useMemo(
    () =>
      allAuditableAssets.filter((asset) => {
        const assetScore = getAuditAssetScore(asset);
        return assetScore !== null && assetScore > 0;
      }),
    [allAuditableAssets]
  );
  const totalScore = useMemo(
    () => auditedAssets.reduce((sum, asset) => sum + (getAuditAssetScore(asset) ?? 0), 0),
    [auditedAssets]
  );
  const globalAverageScore =
    auditedAssets.length > 0 ? Math.round(totalScore / auditedAssets.length) : 0;
  const computedAverageScore = globalAverageScore;
  const normalizedScore = auditedAssets.length > 0 ? globalAverageScore : null;
  const initialProjects = allProjects;
  const initialWorkItems = rootWorkItems;
  const initialReviews = spectatorScanProjects.length > 0 ? spectatorScanProjects : verifiedProjects;
  const visibleWorkItems = useMemo(() => {
    return showAllWork ? initialWorkItems : initialWorkItems.slice(0, 4);
  }, [initialWorkItems, showAllWork]);
  const activePreviewProject = useMemo(() => {
    if (activePreviewProjectOverride) {
      return activePreviewProjectOverride;
    }

    return activePreviewProjectId
      ? allProjects.find((project) => project.id === activePreviewProjectId) ?? null
      : null;
  }, [activePreviewProjectId, activePreviewProjectOverride, allProjects]);
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

  const getCurrentAccessToken = useCallback(async () => {
    if (!supabase) {
      return null;
    }

    const {
      data: { session: activeSession },
    } = await supabase.auth.getSession();

    return activeSession?.access_token ?? null;
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
    const profileKey = targetUsername ?? null;
    const hasHydratedCurrentProfile = Boolean(profileKey) && hydratedProfileKeyRef.current === profileKey;
    const shouldBlockForInitialProfileLoad = profileKey
      ? !hasHydratedCurrentProfile
      : !hydratedProfileKeyRef.current;

    if (!profileKey) {
      setProfileLoading(false);
      return;
    }

    if (shouldBlockForInitialProfileLoad) {
      setProfileLoading(true);
      setIsOwner(false);
      setIsEditing(false);
      setSettingsOpen(false);
      setResolvedProfileId(null);
      setProfileData(null);
      setProjects([]);
      setProjectFolders([]);
      setActiveFolderId(null);
      setScans([]);
      setProjectDescriptions({});
      setProjectDescription('');
      setLiveJobs([]);
      setLoadingState(true);
      setFetchError(null);
      setActivePreviewProjectId(null);
      setActivePreviewProjectOverride(null);
      setActivePreviewName(null);
      setActivePreviewUrl(null);
      setShowAllWork(false);
      setShowAllRatings(false);
      setProfileDraft({ displayName: '', username: '', birthDate: '' });
      setProfileFallback(null);
      setBioText('');
      setRawSkillsInput('');
      setAvatarPreviewUrl(null);
    } else {
      setProfileLoading(false);
      setFetchError(null);
    }
  }, [targetUsername]);

  useEffect(() => {
    if (!targetUsername) {
      console.warn('MeliusAI Hydration Guard: Aborting premature API call. Parameters not settled.');
      setProfileLoading(false);
      return;
    }

    if (spectatorProfileError) {
      console.error('Error running security guard verification:', spectatorProfileError);
      setIsOwner(false);
      setLoadingState(false);
      setProfileLoading(false);
      setFetchError(spectatorProfileError instanceof Error ? spectatorProfileError.message : 'Unable to load profile.');
      return;
    }

    if (spectatorProfileLoading || !spectatorProfilePayload) {
      if (hydratedProfileKeyRef.current !== targetUsername) {
        setProfileLoading(true);
      }
      return;
    }

    try {
      const sessionUserMetadata = (user?.user_metadata ?? {}) as {
        username?: string;
        full_name?: string;
        name?: string;
        bio?: string;
        avatar_url?: string;
        picture?: string;
        portfolio_links?: Partial<PortfolioLinks>;
      };
      const savedProfile = spectatorProfilePayload.profile;

      if (!savedProfile?.id) {
        throw new Error(`Target candidate profile "${targetUsername}" not found.`);
      }

      const authenticatedUsername =
        profile?.username?.trim() ??
        viewerMetadataUsername?.trim() ??
        (typeof user?.user_metadata?.preferred_username === 'string'
          ? user.user_metadata.preferred_username.trim()
          : null);
      const isOwnProfile = spectatorProfilePayload.isOwner;
      const payloadProjects = spectatorProfilePayload.projects;
      const loadedProjects = payloadProjects.length > 0
        ? payloadProjects
            .map(mapProjectRowToProjectItem)
            .filter((project) => isOwnProfile || project.is_public !== false)
        : [];
      const payloadProjectFolders = spectatorProfilePayload.projectFolders;
      const loadedProjectFolders = Array.isArray(payloadProjectFolders) ? payloadProjectFolders : [];
      const payloadRatings = spectatorProfilePayload.ratings;
      const hydratedScans = payloadRatings
        .map(normalizeSpectatorRating)
        .filter((scan): scan is SpectatorScanItem => scan !== null);
      const hydratedOpportunities = spectatorProfilePayload.opportunities
        .map(normalizeLiveOpportunity)
        .filter((opportunity): opportunity is LiveOpportunityItem => opportunity !== null);

      setProfileData(savedProfile);
      setProjects((currentProjects) =>
        hydratedProfileKeyRef.current === targetUsername
          ? mergeProjectLists(currentProjects, loadedProjects)
          : loadedProjects
      );
      setProjectFolders(loadedProjectFolders);
      setScans(hydratedScans);
      if (!isOwnProfile || hydratedOpportunities.length > 0) {
        setLiveJobs(hydratedOpportunities);
      }
      setLoadingState(false);
      setProjectDescriptions(
        Object.fromEntries(
          loadedProjects.map((project) => [project.id, project.user_description ?? project.description ?? ''])
        )
      );

      const fallbackName = isOwnProfile
        ? sessionUserMetadata?.full_name ??
          sessionUserMetadata?.name ??
          user?.email?.split('@')[0] ??
          targetUsername
        : targetUsername;
      const fallbackUsername = resolveDisplayUsername({
        username: isOwnProfile ? authenticatedUsername : null,
        fullName: savedProfile?.full_name ?? fallbackName,
        id: savedProfile?.id ?? targetUsername,
      });
      const hasDbProfile = Boolean(savedProfile);
      const birthDate = savedProfile?.birth_date ?? null;
      const displayName = savedProfile?.full_name ?? fallbackName;
      const usernameValue = resolveDisplayUsername({
        username: savedProfile?.username ?? fallbackUsername,
        fullName: displayName,
        id: savedProfile?.id ?? targetUsername,
      });
      const bioValue = savedProfile?.bio ??
        (isOwnProfile ? sessionUserMetadata?.bio ?? '' : '');
      const skillsInputValue = Array.isArray(savedProfile?.skills) ? savedProfile.skills.join(', ') : '';
      const resolvedProfileIdValue = savedProfile?.id ?? (isOwnProfile ? user?.id ?? null : null);
      const avatarUrl = savedProfile?.avatar_url ??
        (isOwnProfile
          ? sessionUserMetadata?.avatar_url ??
            sessionUserMetadata?.picture ??
            null
          : null);
      const savedAverageScore = savedProfile?.average_project_score ?? savedProfile?.avg_project_score;
      const avgProjectScoreValue = typeof savedAverageScore === 'number' ? savedAverageScore : null;

      const hydratedDraft = {
        displayName,
        username: usernameValue,
        birthDate: birthDate ?? '',
      };
      const storedPortfolioLinks =
        sessionUserMetadata?.portfolio_links ?? undefined;

      setIsOwner(isOwnProfile);
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
      hydratedProfileKeyRef.current = targetUsername;
      setProfileFallback({
        displayName,
        username: usernameValue,
        birthDate,
        email: savedProfile?.email?.trim() || (isOwnProfile ? user?.email ?? '' : ''),
        hasDbProfile,
        avatarUrl,
        avgProjectScore: avgProjectScoreValue,
      });
      setFetchError(null);
      setProfileSaveError(null);
      setUsernameSaveError(null);
      setProfileSyncState('idle');
      setBioSaveState('idle');
      setProfileLoading(false);
    } catch (err) {
      console.error('Error running security guard verification:', err);
      setIsOwner(false);
      setLoadingState(false);
      setProfileLoading(false);
      setFetchError(err instanceof Error ? err.message : 'Unable to load profile.');
    }
  }, [
    profile?.username,
    spectatorProfileError,
    spectatorProfileLoading,
    spectatorProfilePayload,
    targetUsername,
    user,
    viewerMetadataUsername,
  ]);

  useEffect(() => {
    if (isSpectating) {
      setIsEditing(false);
      setSettingsOpen(false);
    }
  }, [isSpectating]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
      return;
    }

    const localStorageKeys = Object.keys(window.localStorage).filter((key) => {
      const normalizedKey = key.toLowerCase();
      return (
        normalizedKey.includes('supabase') ||
        normalizedKey.startsWith('sb-') ||
        normalizedKey.includes('auth')
      );
    });
    const cookieNames = document.cookie
      .split(';')
      .map((cookie) => cookie.split('=')[0]?.trim())
      .filter((name): name is string => Boolean(name))
      .filter((name) => {
        const normalizedName = name.toLowerCase();
        return normalizedName.includes('supabase') || normalizedName.startsWith('sb-');
      });
    const nextDebugState = { cookieNames, localStorageKeys };

    setAuthStorageDebug(nextDebugState);
    console.info('[MeliusAI mobile auth debug]', {
      sessionExists: Boolean(session),
      userId: user?.id ?? null,
      accessTokenExists: hasAccessToken,
      authLoading: loading,
      backendIsOwner: spectatorProfilePayload?.isOwner ?? null,
      backendViewerType: spectatorProfilePayload?.viewerType ?? null,
      backendAuthenticationStatus: spectatorProfilePayload?.authenticationStatus ?? null,
      supabaseCookieNames: cookieNames,
      supabaseLocalStorageKeys: localStorageKeys,
    });
  }, [
    hasAccessToken,
    loading,
    session,
    spectatorProfilePayload?.authenticationStatus,
    spectatorProfilePayload?.isOwner,
    spectatorProfilePayload?.viewerType,
    user?.id,
  ]);

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
          credentials: 'include',
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
    const previousOpportunities = liveJobs;
    const dismissedOpportunity = previousOpportunities.find((opportunity) => opportunity.id === opportunityId);
    if (!dismissedOpportunity) {
      return;
    }

    setLiveJobs((currentOpportunities) =>
      currentOpportunities.filter((opportunity) => opportunity.id !== opportunityId)
    );
    setFetchError(null);

    if (!currentUser?.id) {
      setLiveJobs(previousOpportunities);
      setFetchError('Unable to persist this dismissal. Please sign in again.');
      return;
    }

    try {
      if (!supabase) {
        throw new Error('Unable to persist this dismissal. Please sign in again.');
      }

      const { error } = await (supabase as unknown as CandidateOpportunityDismissalsClient)
        .from('candidate_opportunity_dismissals')
        .insert({
          candidate_id: currentUser.id,
          opportunity_id: opportunityId,
        });

      console.log('[Opportunities] dismissal insert response', {
        candidate_id: currentUser.id,
        opportunity_id: opportunityId,
        error,
      });

      if (error) {
        throw new Error(error.message || 'Unable to save this dismissal.');
      }
    } catch (error) {
      console.error('[Opportunities] failed to dismiss opportunity', error);
      setLiveJobs(previousOpportunities);
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

  async function saveProfileDraft(nextDraft = profileDraft): Promise<boolean> {
    if (!isOwner) {
      return false;
    }

    if (!supabase) {
      setProfileSaveError('Profile sync is not ready.');
      setProfileSyncState('error');
      return false;
    }

    const normalizedDraft = {
      displayName: nextDraft.displayName.trim(),
      username: resolveDisplayUsername({
        username: nextDraft.username,
        fullName: nextDraft.displayName || displayName,
        id: resolvedProfileId ?? user?.id ?? profileId,
      }),
      birthDate: nextDraft.birthDate.trim(),
    };

    const lastSaved = lastSavedProfileRef.current;
    if (
      lastSaved?.displayName === normalizedDraft.displayName &&
      lastSaved.username === normalizedDraft.username &&
      lastSaved.birthDate === normalizedDraft.birthDate
    ) {
      return true;
    }

    const sequence = profileSaveSequenceRef.current + 1;
    profileSaveSequenceRef.current = sequence;
    setProfileSyncState('syncing');
    setProfileSaveError(null);
    setUsernameSaveError(null);

    try {
      const userId = await getConfirmedUserId();
      if (!userId) {
        setProfileSyncState('error');
        setProfileSaveError('Profile sync is not ready.');
        return false;
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
      }, await getCurrentAccessToken());

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
        setUsernameSaveError(null);
      }

      return true;
    } catch (error) {
      if (profileSaveSequenceRef.current === sequence) {
        if (isUsernameConflictError(error)) {
          setProfileSyncState('idle');
          setProfileSaveError(null);
          setUsernameSaveError(USERNAME_TAKEN_MESSAGE);
        } else {
          setProfileSyncState('error');
          setProfileSaveError(error instanceof Error ? error.message : 'We could not save your profile.');
        }
      }

      return false;
    }
  }

  function updateProfileDraft(field: keyof ProfileDraft, value: string) {
    if (!isOwner) {
      return;
    }

    if (field === 'username') {
      setUsernameSaveError(null);
      setProfileSaveError(null);
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
    setUsernameSaveError(null);

    try {
      const response = await fetch(PROFILE_UPDATE_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bio: nextBioText,
          full_name: profileDraft.displayName || displayName,
          skills: formattedSkills,
          username: profileDraft.username || username,
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
      }, await getCurrentAccessToken());

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
        setUsernameSaveError(null);
        showBioSavedState();
      }
    } catch (error) {
      console.error('Profile dynamic platform data sync failed:', error);
      if (bioSaveSequenceRef.current === sequence) {
        setBioSaveState('idle');
        if (isUsernameConflictError(error)) {
          setUsernameSaveError(USERNAME_TAKEN_MESSAGE);
          return;
        }
        showBioToast('Sync Error: Please check your connection.');
      }
    }
  }

  async function saveCompleteProfile() {
    const profileSaved = await saveProfileDraft();
    if (!profileSaved) {
      return;
    }

    await saveBio(bioText);
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

  async function uploadProjectFile(
    file: File,
    description: string,
    options: { folderId?: string | null; userId?: string } = {}
  ) {
    if (!isOwner) {
      throw new Error('Only the profile owner can add work assets.');
    }

    if (!supabase) {
      throw new Error('Vault sync is not ready.');
    }

    const userId = options.userId ?? (await getConfirmedUserId());
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
    const uploadDescription = description.trim() || null;
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        folder_id: options.folderId ?? null,
        name: file.name,
        file_url: fileUrl,
        file_type: fileExtension,
        description: uploadDescription,
        user_description: uploadDescription,
        is_public: false,
        has_been_audited: false,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) {
      console.error('Project DB Error:', error);
      throw error;
    }

    return mapProjectRowToProjectItem(data);
  }

  function handleOpenProjectPreview(asset: AuditModalAsset) {
    if (isProjectAuditAsset(asset)) {
      const previewUrl = getProjectDownloadHref(asset) ?? getAuditReportDataUrl(asset);
      const previewFileName = getProjectDownloadHref(asset)
        ? asset.title
        : `${asset.title || 'Audit Report'}.txt`;

      setActivePreviewProjectOverride(null);
      setActivePreviewProjectId(asset.id);
      setActivePreviewName(previewFileName);
      setActivePreviewUrl(previewUrl);
      return;
    }

    const auditReportText = getAuditModalAssetReportText(asset);
    const previewUrl = getAuditReportDataUrl(asset);
    const previewName = `${asset.name || 'Project Directory Audit'}.txt`;
    const folderPreviewProject: ProjectItem = {
      id: `folder-preview-${asset.id}`,
      title: asset.name,
      folder_id: asset.id,
      file_type: 'txt',
      status: 'audited',
      preview_url: previewUrl,
      preview_kind: 'code',
      text_preview: auditReportText,
      file_name: previewName,
      file_url: previewUrl,
      description: getAuditModalAssetSummary(asset),
      executive_summary: asset.executive_summary ?? asset.audit_summary ?? asset.ai_summary ?? null,
      summary: asset.summary ?? asset.ai_summary ?? null,
      score: getFolderAuditScore(asset),
      audit_summary: asset.audit_summary ?? asset.executive_summary ?? asset.ai_summary ?? null,
      pros: Array.isArray(asset.pros) ? asset.pros : null,
      cons: Array.isArray(asset.cons) ? asset.cons : null,
      recommendations: Array.isArray(asset.recommendations) ? asset.recommendations : null,
      evaluation_score: getFolderAuditScore(asset),
      has_been_audited: true,
      logic_score: getFolderAuditScore(asset),
      ai_summary: asset.ai_summary ?? asset.executive_summary ?? asset.audit_summary ?? null,
      created_at: asset.created_at ?? null,
    };

    setActivePreviewProjectOverride(folderPreviewProject);
    setActivePreviewProjectId(folderPreviewProject.id);
    setActivePreviewName(previewName);
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

  const handleGithubFetch = async () => {
    if (!githubRepoUrl.includes("github.com")) {
      return alert("Please enter a valid GitHub repository URL.");
    }

    try {
      setIsFetchingGithub(true);

      // 1. Extract owner and repo name from the URL
      const urlParts = githubRepoUrl.replace(/\/$/, '').split('/');
      const repoName = urlParts.pop();
      const owner = urlParts.pop();

      if (!owner || !repoName) {
        throw new Error("Could not parse GitHub URL. Ensure it looks like https://github.com/username/repo");
      }

      // 2. Fetch repository details to find the default branch (main vs master)
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`);
      if (!repoRes.ok) throw new Error("Repository not found or is private.");
      const repoData = await repoRes.json();
      const defaultBranch = repoData.default_branch;

      // 3. Fetch the entire file tree recursively
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees/${defaultBranch}?recursive=1`);
      if (!treeRes.ok) throw new Error("Failed to fetch repository tree.");
      const treeData = await treeRes.json();

      // 4. Filter and process the files
      const ignoreList = ['node_modules', '.git', '.next', 'venv', 'dist', 'build'];
      const parsedFiles: any[] = [];
      const validFiles = treeData.tree.filter((item: any) => item.type === 'blob');

      for (const file of validFiles) {
        const pathParts = file.path.split('/');

        // Skip junk folders and files we never want to import
        if (pathParts.some((part: string) => ignoreList.includes(part))) continue;
        if (isBlockedStagedFile(file.path)) continue;

        // 5. Fetch the raw content for the valid files
        const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repoName}/${defaultBranch}/${file.path}`);
        if (!rawRes.ok) continue;
        const fileName = pathParts[pathParts.length - 1];
        const rawBlob = await rawRes.blob();
        const shouldReadAsText = shouldForceUtf8CodeRead(file.path) || rawBlob.type.startsWith('text/');
        const content = shouldReadAsText ? await rawBlob.text() : '';
        const sourceFile = shouldReadAsText
          ? undefined
          : new File([rawBlob], fileName, { type: rawBlob.type || 'application/octet-stream' });

        parsedFiles.push({
          path: file.path,
          name: fileName,
          content,
          sourceFile,
          contentType: rawBlob.type || undefined,
          selected: true
        });
      }

      if (parsedFiles.length === 0) {
        throw new Error("No readable code files found in this repository.");
      }

      // 6. Transition to the Staging Modal
      setStagedFiles(parsedFiles);
      setIsGithubModalOpen(false); // Close Github URL modal
      setGithubRepoUrl(""); // Clear the input
      setIsStagingModalOpen(true); // Open the file checklist modal

    } catch (error: any) {
      console.error("GitHub Fetch Error:", error);
      alert(`GitHub Import Failed: ${error.message}`);
    } finally {
      setIsFetchingGithub(false);
    }
  };

  async function handleFolderSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const getRelativePath = (file: File) =>
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const firstFilePath = getRelativePath(files[0]);
    const folderName = firstFilePath.split('/')[0] || 'New Project Folder';
    setStagingFolderName(folderName);

    const parsedFiles: StagedFile[] = [];
    const ignoreList = ['node_modules', '.git', '.next', 'venv', 'dist', 'build'];

    try {
      for (const file of Array.from(files)) {
        const relativePath = getRelativePath(file);
        const pathParts = relativePath.split('/');
        if (pathParts.some((part) => ignoreList.includes(part))) {
          continue;
        }

        const content = shouldForceUtf8CodeRead(relativePath) ? await file.text() : '';
        parsedFiles.push({
          path: relativePath,
          name: file.name,
          content,
          sourceFile: file,
          contentType: file.type || undefined,
          selected: true,
        });
      }

      setStagedFiles(parsedFiles);
      setIsIngestionModalOpen(false);
      setIsStagingModalOpen(true);
    } catch (error) {
      alert(`Staging Failed: ${error instanceof Error ? error.message : 'Unable to read selected folder files.'}`);
    } finally {
      if (projectFolderInputRef.current) {
        projectFolderInputRef.current.value = '';
      }
    }
  }

  async function handleConfirmUpload() {
    if (isUploading) {
      return;
    }

    if (!user || !user.id) {
      alert('User session missing.');
      return;
    }

    if (!supabase) {
      alert('Upload Failed: Vault sync is not ready.');
      return;
    }

    const safeFilesToUpload = stagedFiles.filter((file) => {
      if (!file.selected) return false;

      const fileName = file.name.split('/').pop()?.toLowerCase() || "";

      const isBlockedExtension = BLOCKED_EXTENSIONS.some((extension) => fileName.endsWith(extension));
      const isBlockedFile = BLOCKED_FILES.includes(fileName);

      return !isBlockedExtension && !isBlockedFile;
    });

    if (safeFilesToUpload.length === 0) {
      alert("No valid code files selected to upload.");
      return;
    }

    try {
      setIsUploading(true);

      const { data: folderData, error: folderError } = await supabase
        .from('project_folders')
        .insert({ name: stagingFolderName, source: 'local', user_id: user.id })
        .select()
        .single();

      if (folderError) {
        throw folderError;
      }

      if (!folderData?.id) {
        throw new Error('Folder was created without a returned ID.');
      }

      const uploadResults = await Promise.all(
        safeFilesToUpload.map(async (file) => {
          const uploadBody = file.sourceFile ?? new Blob([file.content], { type: 'text/plain; charset=utf-8' });
          const filePath = `${user.id}/${folderData.id}/${getStorageFileName(file.name)}`;
          const contentType =
            file.contentType || (file.sourceFile ? file.sourceFile.type : 'text/plain; charset=utf-8') || 'application/octet-stream';

          const { error: storageError } = await supabase.storage
            .from('vault')
            .upload(filePath, uploadBody, {
              upsert: true,
              contentType,
            });

          if (storageError) {
            throw storageError;
          }

          const { data: publicUrlData } = supabase.storage
            .from('vault')
            .getPublicUrl(filePath);

          if (!publicUrlData.publicUrl) {
            throw new Error(`Could not create a public file URL for ${file.name}.`);
          }

          return supabase
            .from('projects')
            .insert({
              name: file.name,
              folder_id: folderData.id,
              user_id: user.id,
              file_type: file.name.split('.').pop(),
              file_url: publicUrlData.publicUrl,
              status: 'pending',
            })
            .select(PROJECT_DASHBOARD_COLUMNS)
            .single();
        })
      );
      const projectError = uploadResults.find((result) => result.error)?.error;

      if (projectError) {
        throw projectError;
      }

      const savedFolder = folderData as ProjectFolderRow;
      const savedProjects = uploadResults
        .map((result) => result.data)
        .filter(Boolean)
        .map((row) => mapProjectRowToProjectItem(row as ProjectRow));

      setIsStagingModalOpen(false);
      setStagedFiles([]);
      setGithubRepoUrl("");

      setProjectFolders((currentFolders) => [
        savedFolder,
        ...currentFolders.filter((folder) => folder.id !== savedFolder.id),
      ]);
      setProjects((currentProjects) => [
        ...savedProjects,
        ...currentProjects.filter(
          (project) => !savedProjects.some((savedProject) => savedProject.id === project.id)
        ),
      ]);
      setActiveFolderId(savedFolder.id);
      setStagingFolderName('');
      setProjectDescription('');

      if (spectatorProfileKey) {
        await mutate(spectatorProfileKey);
      }
      router.refresh();
    } catch (error: any) {
      console.error("Upload Error:", error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleProjectFile(
    file: File,
    description = projectDescription,
    options: { folderId?: string | null; userId?: string } = {}
  ) {
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
      const assetDataUrl = await readAssetAsDataURL(file);
      const extractedCodeContent = shouldForceUtf8CodeRead(file.name)
        ? await extractCodeAsText(file).then((text) => text.trim())
        : '';
      const savedProject = await uploadProjectFile(file, description, options);
      const projectWithExtractedCode = {
        ...savedProject,
        asset_data_url: assetDataUrl,
        ...(extractedCodeContent ? { text_preview: extractedCodeContent } : {}),
      };
      setUploadState({
        fileName: file.name,
        progress: 100,
        status: 'done',
      });

      setProjects((currentProjects) => [
        projectWithExtractedCode,
        ...currentProjects.filter((project) => project.id !== projectWithExtractedCode.id),
      ]);
      setProjectDescriptions((currentDescriptions) => ({
        ...currentDescriptions,
        [projectWithExtractedCode.id]: projectWithExtractedCode.user_description ?? projectWithExtractedCode.description ?? '',
      }));
      setProjectDescription('');
      router.refresh();

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

  async function handleReUpload(
    event: ChangeEvent<HTMLInputElement>,
    projectId: string
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file || !supabase) return;

    try {
      const assetContent = await file.text();

      if (!assetContent.trim()) {
        throw new Error("The selected file is empty.");
      }

      const { error } = await supabase
        .from("projects")
        .update({
          asset_content: assetContent,
        })
        .eq("id", projectId);

      if (error) throw error;

      setProjects((projects) =>
        projects.map((project) =>
          project.id === projectId
            ? { ...project, text_preview: assetContent }
            : project
        )
      );

      setUploadState({
        fileName: file.name,
        progress: 100,
        status: "done",
      });
    } catch (error) {
      showProjectVerifyError(
        error instanceof Error ? error.message : "Unable to replace the asset."
      );
    } finally {
      input.value = "";
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

    setActivePreviewProjectOverride((currentProject) =>
      currentProject?.id === projectId ? { ...currentProject, ...projectPatch } : currentProject
    );
  }

  async function handleVerifyWithMeliusAI(project: ProjectItem, event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();

    if (!isOwner) {
      return;
    }

    if (!supabase || verifyingAssetId || deletingProjectId) {
      return;
    }

    const userContextDescription = projectDescriptions[project.id] ?? '';
    const projectSourceHref = getProjectDownloadHref(project);
    const filename = project.file_name || project.title;

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
      if (!projectSourceHref) {
        throw new Error('Verification Failed: This asset does not contain a valid file URL.');
      }

      const isJupyterNotebook = getFileExtensionFromSource(filename) === 'ipynb';
      const shouldReadAssetAsText = shouldForceUtf8CodeRead(filename) || project.mime_type?.startsWith('text/');
      let assetTextContent = isJupyterNotebook
        ? ''
        : shouldReadAssetAsText
          ? project.text_preview || ''
          : project.asset_data_url || '';

      if (!assetTextContent && !isJupyterNotebook) {
        const assetResponse = await fetch(projectSourceHref);

        if (!assetResponse.ok) {
          throw new Error('Verification Failed: This asset could not be downloaded for review.');
        }

        assetTextContent = shouldReadAssetAsText ? await assetResponse.text() : await readAssetAsDataURL(await assetResponse.blob());
      }

      const response = await fetch('/api/verify-asset', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          fileUrl: projectSourceHref,
          filename,
          assetName: filename,
          assetTextContent,
          userContextDescription,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        grade?: string;
        ai_summary?: string;
        user_description?: string;
        strengths?: string[];
        weaknesses?: string[];
        pros?: string[];
        cons?: string[];
        recommendations?: string[];
        project?: ProjectItem;
        report?: {
          calculatedScore?: number;
          score?: number;
          ai_summary?: string;
          user_description?: string;
          executiveSummary?: string;
          strengths?: string[];
          weaknesses?: string[];
          pros?: string[];
          cons?: string[];
          recommendations?: string[];
          strategicRecommendations?: string[];
        };
        reportText?: string;
        description?: string;
        executive_summary?: string;
        summary?: string;
        score?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'MeliusAI GPT verification failed.');
      }

      const updatedProject = payload.project;
      const pythonScore = typeof payload.score === 'number' ? payload.score : null;
      const executiveSummary =
        payload.ai_summary?.trim() ||
        payload.report?.ai_summary?.trim() ||
        payload.user_description?.trim() ||
        payload.report?.user_description?.trim() ||
        payload.report?.executiveSummary?.trim() ||
        updatedProject?.ai_summary?.trim() ||
        updatedProject?.user_description?.trim() ||
        updatedProject?.executive_summary?.trim() ||
        updatedProject?.summary?.trim() ||
        updatedProject?.audit_summary?.trim() ||
        '';
      const prosList = payload.strengths ?? payload.report?.strengths ?? payload.pros ?? payload.report?.pros ?? [];
      const consList = payload.weaknesses ?? payload.report?.weaknesses ?? payload.cons ?? payload.report?.cons ?? [];
      const recommendationList = payload.recommendations ?? payload.report?.recommendations ?? payload.report?.strategicRecommendations ?? [];
      const generatedReportText = [
        executiveSummary,
        prosList.length > 0 ? `Strengths\n${prosList.map((item) => `- ${item}`).join('\n')}` : '',
        consList.length > 0 ? `Weaknesses\n${consList.map((item) => `- ${item}`).join('\n')}` : '',
        recommendationList.length > 0
          ? `Recommendations\n${recommendationList.map((item) => `- ${item}`).join('\n')}`
          : '',
        `MeliusAI Verification Score: ${pythonScore ?? payload.report?.score ?? payload.report?.calculatedScore ?? 0}/100`,
      ]
        .filter((section) => section.trim().length > 0)
        .join('\n\n');
      const accumulatedReportText =
        payload.reportText?.trim() || updatedProject?.description?.trim() || updatedProject?.ai_summary?.trim() || generatedReportText;

      setLiveStreamText(accumulatedReportText);
      const verifiedProjectPatch: Partial<ProjectItem> = {
        ...(updatedProject ?? {}),
        has_been_audited: updatedProject?.has_been_audited ?? true,
        evaluation_score: updatedProject?.evaluation_score ?? pythonScore,
        logic_score: updatedProject?.logic_score ?? pythonScore,
        score: updatedProject?.score ?? pythonScore,
        ai_summary: payload.ai_summary ?? updatedProject?.ai_summary ?? executiveSummary,
        user_description: payload.user_description ?? updatedProject?.user_description ?? executiveSummary,
        audit_summary: executiveSummary || updatedProject?.audit_summary,
        executive_summary: payload.executive_summary ?? updatedProject?.executive_summary,
        summary: payload.summary ?? updatedProject?.summary,
        description: updatedProject?.description ?? executiveSummary,
        pros: prosList.length > 0 ? prosList : updatedProject?.pros,
        cons: consList.length > 0 ? consList : updatedProject?.cons,
        recommendations: recommendationList.length > 0 ? recommendationList : updatedProject?.recommendations,
      };

      setProjects((currentProjects) => {
        const projectExists = currentProjects.some((currentProject) => currentProject.id === project.id);

        return projectExists
          ? currentProjects.map((currentProject) =>
              currentProject.id === project.id
                ? mergeVerifiedProject(currentProject, verifiedProjectPatch, accumulatedReportText)
                : currentProject
            )
          : [mergeVerifiedProject(project, verifiedProjectPatch, accumulatedReportText), ...currentProjects];
      });
      setProjectDescriptions((currentDescriptions) => ({
        ...currentDescriptions,
        [project.id]: userContextDescription,
      }));
      setActivePreviewProjectOverride((currentProject) =>
        currentProject?.id === project.id
          ? mergeVerifiedProject(currentProject, verifiedProjectPatch, accumulatedReportText)
          : currentProject
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
        credentials: 'include',
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
      setActivePreviewProjectOverride((currentProject) =>
        currentProject?.id === projectId ? null : currentProject
      );
      setActivePreviewProjectId((currentPreviewId) => (currentPreviewId === projectId ? null : currentPreviewId));
      if (activePreviewProjectId === projectId) {
        setActivePreviewName(null);
        setActivePreviewUrl(null);
      }
    } catch (error) {
      console.error('Failed to delete project asset', error);
      showProjectVerifyError(error instanceof Error ? error.message : 'We could not delete this asset.');
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

  const handleRenameFolder = async (folderId: string) => {
    const nextFolderName = editFolderName.trim();

    if (!nextFolderName) {
      setEditingFolderId(null);
      return;
    }

    if (!isOwner) {
      return;
    }

    if (!supabase) {
      alert('Failed to rename folder: Vault sync is not ready.');
      return;
    }

    try {
      const { error } = await supabase
        .from('project_folders')
        .update({ name: nextFolderName })
        .eq('id', folderId);

      if (error) throw error;

      setProjectFolders((prev) =>
        prev.map((folder) =>
          folder.id === folderId ? { ...folder, name: nextFolderName } : folder
        )
      );

      setEditingFolderId(null);
      setEditFolderName("");

      if (spectatorProfileKey) {
        await mutate(spectatorProfileKey);
      }
      router.refresh();
    } catch (error: any) {
      console.error("Error renaming folder:", error);
      alert("Failed to rename folder. Please try again.");
    }
  };

  const handleVerifyFolder = async (folderId: string) => {
    if (!isOwner || auditingFolders[folderId]) {
      return;
    }

    try {
      setAuditingFolders((prev) => ({ ...prev, [folderId]: true }));

      const userId = user?.id ?? (await getConfirmedUserId());
      const accessToken = session?.access_token ?? (await getCurrentAccessToken());

      if (!userId || !accessToken) {
        throw new Error('User session missing.');
      }

      const response = await fetch(FOLDER_AUDIT_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          folder_id: folderId,
          user_id: userId,
        }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(errorPayload?.detail || 'Failed to audit folder');
      }

      const data = await response.json();
      console.log("Audit complete:", data);
      alert("Folder audit completed successfully!");

      if (spectatorProfileKey) {
        await mutate(spectatorProfileKey);
      }
      router.refresh();
    } catch (error) {
      console.error("Error verifying folder:", error);
      alert("An error occurred during the AI audit.");
    } finally {
      setAuditingFolders((prev) => ({ ...prev, [folderId]: false }));
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!isOwner) {
      return;
    }

    if (!window.confirm("Are you sure you want to delete this project? All files inside will be permanently lost.")) {
      return;
    }

    if (!supabase) {
      alert('Failed to delete folder: Vault sync is not ready.');
      return;
    }

    try {
      const { error: filesError } = await supabase
        .from('projects')
        .delete()
        .eq('folder_id', folderId);

      if (filesError) {
        throw filesError;
      }

      const { error: folderError } = await supabase
        .from('project_folders')
        .delete()
        .eq('id', folderId);

      if (folderError) {
        throw folderError;
      }

      setProjectFolders((prev) => prev.filter((folder) => folder.id !== folderId));
      setProjects((prev) => prev.filter((project) => project.folder_id !== folderId));
      if (activeFolderId === folderId) {
        setActiveFolderId(null);
      }
      if (spectatorProfileKey) {
        await mutate(spectatorProfileKey);
      }
    } catch (error: any) {
      console.error("Delete Error:", error);
      alert(`Failed to delete folder: ${error.message}`);
    }
  };

  // Group files by their immediate parent directory path
  const groupedFiles = stagedFiles.reduce((acc, file) => {
    // Extract directory path (e.g., "folder/subfolder/file.js" -> "folder/subfolder")
    const dirPath = file.path.substring(0, file.path.lastIndexOf('/')) || stagingFolderName;
    if (!acc[dirPath]) acc[dirPath] = [];
    acc[dirPath].push(file);
    return acc;
  }, {} as Record<string, typeof stagedFiles>);

  const toggleFolderSelection = (dirPath: string, isSelected: boolean) => {
    setStagedFiles((prev) =>
      prev.map((file) => {
        if (file.path.startsWith(dirPath)) {
          return { ...file, selected: isSelected };
        }
        return file;
      })
    );
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-white md:flex-row">
          {isSidebarOpen ? (
            <button
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          ) : null}
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex w-[min(16rem,85vw)] transform flex-col justify-between overflow-y-auto border-r border-slate-800 bg-slate-950 transition-transform duration-300 ease-in-out md:relative md:z-auto md:h-full md:w-64 md:flex-shrink-0 md:translate-x-0 md:overflow-visible md:bg-slate-900',
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <div className="p-4">
              <Link
                href="/home"
                className="mb-8 flex items-center gap-3 px-3 py-2"
                aria-label="Go to candidate dashboard"
                onClick={() => setIsSidebarOpen(false)}
              >
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
                        onPrefetch={() => prefetchDashboardNavigation(item)}
                        onClick={
                          item.label === 'Opportunities'
                            ? (event) => {
                                event.preventDefault();
                                const opportunitiesHref = `${profileHref}#opportunities`;
                                router.replace(opportunitiesHref);
                                setIsSidebarOpen(false);
                              }
                            : () => setIsSidebarOpen(false)
                        }
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </nav>
            </div>
            <div className="space-y-2 p-4">
              {isOwner ? (
                <>
                  <SidebarProfileLink
                    active={pathname === profileHref || pathname.startsWith('/profile/')}
                    avatarUrl={avatarUrl}
                    href={profileHref}
                    onClick={() => setIsSidebarOpen(false)}
                  />
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="w-full justify-start rounded-lg border border-blue-950/60 bg-[#071329]/60 px-3 py-2.5 text-xs text-slate-200 hover:border-cyan-500/30 hover:bg-[#0b1d38]/80"
                  >
                    Sign out
                  </Button>
                </>
              ) : null}
            </div>
          </aside>

          <main className="relative h-full min-w-0 flex-1 overflow-y-auto p-4 pt-16 md:p-8 md:pt-8">
            <button
              type="button"
              aria-label="Toggle sidebar"
              aria-expanded={isSidebarOpen}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/90 text-slate-100 shadow-lg shadow-black/20 backdrop-blur transition hover:border-cyan-500/40 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            </button>
            {process.env.NODE_ENV !== 'production' ? (
              <div className="fixed bottom-3 left-3 z-[60] max-w-[calc(100vw-1.5rem)] rounded-xl border border-cyan-400/30 bg-slate-950/95 p-3 text-[11px] text-cyan-50 shadow-2xl shadow-black/40 backdrop-blur md:left-auto md:right-3 md:max-w-sm">
                <p className="font-semibold text-white">Mobile auth debug</p>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                  <dt className="text-slate-400">session</dt>
                  <dd>{session ? 'yes' : 'no'}</dd>
                  <dt className="text-slate-400">user</dt>
                  <dd className="truncate">{user?.id ?? 'none'}</dd>
                  <dt className="text-slate-400">token</dt>
                  <dd>{hasAccessToken ? 'yes' : 'no'}</dd>
                  <dt className="text-slate-400">auth loading</dt>
                  <dd>{loading ? 'yes' : 'no'}</dd>
                  <dt className="text-slate-400">backend owner</dt>
                  <dd>{spectatorProfilePayload?.isOwner === true ? 'yes' : 'no'}</dd>
                  <dt className="text-slate-400">viewer type</dt>
                  <dd>{spectatorProfilePayload?.viewerType ?? 'unknown'}</dd>
                  <dt className="text-slate-400">auth status</dt>
                  <dd>{spectatorProfilePayload?.authenticationStatus ?? 'unknown'}</dd>
                  <dt className="text-slate-400">cookies</dt>
                  <dd className="truncate">{authStorageDebug.cookieNames.join(', ') || 'none'}</dd>
                  <dt className="text-slate-400">storage</dt>
                  <dd className="truncate">{authStorageDebug.localStorageKeys.join(', ') || 'none'}</dd>
                </dl>
              </div>
            ) : null}
            <AnimatePresence>
              {bioToastMessage ? (
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="fixed left-4 right-4 top-4 z-50 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.16)] backdrop-blur-2xl sm:left-auto sm:right-5 sm:max-w-sm"
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
                  className="fixed left-4 right-4 top-20 z-50 rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 shadow-[0_0_30px_rgba(56,189,248,0.16)] backdrop-blur-2xl sm:left-auto sm:right-5 sm:max-w-sm"
                  role="status"
                >
                  {projectVerifyError}
                </motion.div>
              ) : null}
            </AnimatePresence>
            {isProjectUploading ? (
              <div className="flex min-h-full items-center justify-center px-4 text-slate-300">
                <div className="w-full max-w-xl rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-4 text-center backdrop-blur-md sm:p-6">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-100">
                    <UploadIcon className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-lg font-semibold text-white">Uploading {uploadState?.fileName ?? 'asset'}...</p>
                  <p className="mt-2 text-sm text-slate-400">Keep this tab open while your vault syncs.</p>
                  <Progress value={uploadState?.progress ?? 5} className="mt-5 bg-slate-900/90" />
                </div>
              </div>
            ) : (
            <Suspense fallback={<DashboardSkeleton />}>
            <div className="flex w-full min-w-0 flex-col gap-6 opacity-100 transition-opacity duration-500">
            <div className="w-full min-w-0 rounded-[2rem] border border-blue-950/50 bg-[#090d1f]/40 p-4 backdrop-blur-md sm:p-6 lg:p-7">
                <div className="flex min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-col items-start gap-5 sm:flex-row sm:items-center">
                    <ProfilePhoto
                      fallbackLabel={displayName}
                      sizeClass="h-16 w-16"
                      src={avatarUrl}
                      uploading={avatarUploading}
                      onSelect={isOwner && isEditing ? handleAvatarSelect : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      {isProfilePayloadPending ? (
                        <ProfileIdentitySkeleton />
                      ) : (
                        <>
                      <p className="text-sm text-slate-400">
                        {isOwner ? `Hey ${firstName}, welcome back.` : 'Talent profile preview.'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Individual</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                          Age: {profileAge ?? 'Not set'}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                          Status: {profileCurrentStatus || 'Not set'}
                        </span>
                        {isSyncing ? (
                          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-100">
                            Syncing...
                          </span>
                        ) : null}
                        {isOwner && profileSyncState === 'error' ? (
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
                            className="h-auto w-full min-w-0 max-w-sm border-blue-950/50 bg-[#050b1b]/60 px-3 py-2 text-2xl font-semibold text-white focus:border-sky-500/60 focus:ring-sky-500/20 sm:min-w-[220px] sm:text-3xl"
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
                      {isEditing ? (
                        <>
                          <label className="mt-2 flex w-full max-w-sm items-center rounded-lg border border-blue-950/50 bg-[#050b1b]/60 text-sm text-slate-300 transition focus-within:border-sky-500/60 focus-within:ring-2 focus-within:ring-sky-500/20">
                            <span className="flex h-10 items-center border-r border-blue-950/50 px-3 text-slate-500">
                              @
                            </span>
                            <input
                              type="text"
                              aria-label="Profile username"
                              placeholder={displayUsername}
                              value={profileDraft.username}
                              onChange={(event) =>
                                updateProfileDraft('username', event.target.value.replace(/^@+/, ''))
                              }
                              className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-600"
                            />
                          </label>
                          {usernameSaveError ? (
                            <p className="mt-2 text-sm font-medium text-rose-300">{usernameSaveError}</p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">@{displayUsername}</p>
                      )}
                      {email ? (
                        <a
                          href={`mailto:${email}`}
                          className="mt-3 inline-flex w-full max-w-full items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-medium text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.1)] transition-all hover:border-cyan-300/60 hover:bg-cyan-500/15 hover:text-white hover:shadow-[0_0_28px_rgba(34,211,238,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:w-auto"
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
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full items-start justify-start lg:w-auto lg:justify-end">
                    {isOwner && (
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
                {settingsOpen && isOwner && isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute left-4 right-4 top-4 w-auto rounded-3xl border border-blue-950/50 bg-[#090d1f]/90 p-4 backdrop-blur-md sm:left-auto sm:right-6 sm:top-6 sm:w-[min(360px,calc(100%-3rem))] sm:p-5"
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
                        <div className="mt-3 flex items-center rounded-lg border border-blue-950/50 bg-[#050b1b]/60 text-sm text-slate-300 transition focus-within:border-sky-500/60 focus-within:ring-2 focus-within:ring-sky-500/20">
                          <span className="flex h-10 items-center border-r border-blue-950/50 px-3 text-slate-500">
                            @
                          </span>
                          <input
                            id="profile-username"
                            type="text"
                            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-600"
                            placeholder={displayUsername}
                            value={profileDraft.username}
                            onChange={(event) =>
                              updateProfileDraft('username', event.target.value.replace(/^@+/, ''))
                            }
                          />
                        </div>
                        {usernameSaveError ? (
                          <p className="mt-2 text-xs font-medium text-rose-300">{usernameSaveError}</p>
                        ) : null}
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
              <Suspense fallback={<BioSectionSkeleton />}>
                {isProfilePayloadPending ? (
                  <BioSectionSkeleton />
                ) : (
              <section className="space-y-4">
              <Card className="relative overflow-hidden border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                {bioSaveState === 'saving' ? (
                  <div className="absolute right-6 top-6 h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.9)]" />
                ) : null}
                <CardContent className="p-4 sm:p-6">
                  <div>
                    <div>
                      <p className="text-sm text-slate-400">Bio</p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">About Me</h2>
                    </div>
                  </div>

                  {isOwner && isEditing ? (
                    <>
                      <Textarea
                        value={bioText}
                        onChange={(event) => updateBio(event.target.value)}
                        placeholder="Tell the creative community or hiring organizations about your design methodology or building focus..."
                        className="mt-5 min-h-40 resize-none border-transparent bg-[#050b1b]/35 text-base leading-7 shadow-none focus:border-sky-500/60 focus:bg-[#050b1b]/55"
                      />
                      <div className="mt-5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void saveCompleteProfile()}
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
                    <div className="mt-5 rounded-2xl border border-blue-950/40 bg-[#050b1b]/35 p-4 text-base leading-7 text-slate-300 sm:p-5">
                      {displayBio || 'No bio provided yet.'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
                )}
              </Suspense>

              <Suspense fallback={<WorkAssetsSkeleton />}>
                {isProfilePayloadPending ? (
                  <WorkAssetsSkeleton />
                ) : (
            <section id="my-work-assets" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">My Work Assets</h2>
                  <p className="mt-1 text-sm text-slate-400">Your projects live here.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {isOwner ? (
                    <>
                      <button
                        id="create-project-btn"
                        className="btn primary"
                        type="button"
                        onClick={() => setIsIngestionModalOpen(true)}
                      >
                        + Create Project Folder
                      </button>
                      <input
                        ref={projectFileInputRef}
                        type="file"
                        accept="*/*"
                        disabled={isProjectUploading}
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = '';
                          if (file) {
                            void handleProjectFile(file);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn primary"
                        disabled={isProjectUploading}
                        onClick={() => projectFileInputRef.current?.click()}
                      >
                        + UPLOAD FILE
                      </button>
                    </>
                  ) : null}
                  {rootWorkItems.length > 0 ? (
                    <Badge variant="outline" className="w-fit border-white/10 text-slate-200">
                      {rootWorkItems.length} items
                    </Badge>
                  ) : null}
                </div>
              </div>

              {activeFolderId !== null ? (
                <div id="nested-folder-view">
                  <div className="folder-header">
                    <button
                      id="back-to-vault-btn"
                      className="btn subtle"
                      type="button"
                      onClick={() => setActiveFolderId(null)}
                    >
                      ← Back to Work Assets
                    </button>
                    <h2 id="current-folder-title">{activeFolder?.name ?? 'Project Folder'}</h2>
                  </div>

                  <div id="folder-contents-grid" className="projects-grid grid w-full grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {activeFolderProjects.length > 0 ? (
                      activeFolderProjects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          isSpectator={isSpectating}
                          verifyingAssetId={verifyingAssetId}
                          deletingProjectId={deletingProjectId}
                          verifiedAssetId={verifiedAssetId}
                          onVerify={(selectedProject, event) => void handleVerifyWithMeliusAI(selectedProject, event)}
                          handleReUpload={handleReUpload}
                          onOpen={handleOpenProjectPreview}
                          onDelete={(projectId) => void handleDeleteProject(projectId)}
                        />
                      ))
                    ) : (
                      <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md md:col-span-2 lg:col-span-3 xl:col-span-4">
                        <CardContent className="p-8 text-center text-sm text-slate-400">
                          This project folder is empty.
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              ) : rootWorkItems.length === 0 ? (
                isOwner ? null : (
                  <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                    <CardContent className="p-4 sm:p-8">
                      <div className="rounded-[1.75rem] border border-blue-950/40 bg-[#050b1b]/35 p-4 text-center sm:p-8">
                        <p className="text-base font-semibold text-white">No public work assets yet.</p>
                        <p className="mt-2 text-sm text-slate-400">
                          This profile owner has not shared portfolio files in this workspace.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : (
                <>
                  <div id="main-assets-grid" className="projects-grid grid w-full grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {visibleWorkItems.length > 0 &&
                      visibleWorkItems.map((item) => {
                        if (item.type === 'folder') {
                          const folder = item.folder;
                          const folderAudit = folder as FolderAuditItem;
                          const folderAuditScore = getFolderAuditScore(folderAudit);
                          const openFolderAuditProtocol = () => {
                            handleOpenProjectPreview(folderAudit);
                          };
                          const handleOpenFolderAuditProtocol = (event: MouseEvent<HTMLElement>) => {
                            event.stopPropagation();
                            openFolderAuditProtocol();
                          };

                          return (
                            <div
                              key={folder.id}
                              className="project-folder-card card"
                              onClick={() => setActiveFolderId(folder.id)}
                              style={{ position: 'relative' }}
                            >
                              {isOwner ? (
                                <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '8px', zIndex: 10 }}>
                                  <button
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditingFolderId(folder.id);
                                      setEditFolderName(folder.name);
                                    }}
                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8892b0', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    title="Rename Folder"
                                    type="button"
                                    aria-label={`Rename ${folder.name || 'workspace'}`}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                    </svg>
                                  </button>

                                  <button
                                    className="folder-delete-btn"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteFolder(folder.id);
                                    }}
                                    style={{ position: 'static', top: 'auto', right: 'auto', padding: '6px', borderRadius: '6px' }}
                                    title="Delete Workspace"
                                    type="button"
                                    aria-label={`Delete ${folder.name || 'workspace'}`}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"></path>
                                    </svg>
                                  </button>
                                </div>
                              ) : null}

                              <div className="folder-card-body">
                                <div
                                  className="folder-icon-glow"
                                  onClick={folderAuditScore ? handleOpenFolderAuditProtocol : undefined}
                                  onKeyDown={(event) => {
                                    if (!folderAuditScore) {
                                      return;
                                    }

                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openFolderAuditProtocol();
                                    }
                                  }}
                                  role={folderAuditScore ? 'button' : undefined}
                                  tabIndex={folderAuditScore ? 0 : undefined}
                                  aria-label={folderAuditScore ? `Read full audit protocol for ${folder.name}` : undefined}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                  </svg>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '10px', width: '100%', textAlign: 'center' }}>
                                  {editingFolderId === folder.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }} onClick={(event) => event.stopPropagation()}>
                                      <input
                                        type="text"
                                        value={editFolderName}
                                        onChange={(event) => setEditFolderName(event.target.value)}
                                        style={{
                                          width: '80%',
                                          padding: '6px 10px',
                                          borderRadius: '4px',
                                          background: 'rgba(255,255,255,0.1)',
                                          border: '1px solid #00d2ff',
                                          color: '#fff',
                                          outline: 'none',
                                          fontSize: '16px',
                                          textAlign: 'center',
                                        }}
                                        autoFocus
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') void handleRenameFolder(folder.id);
                                          if (event.key === 'Escape') {
                                            setEditingFolderId(null);
                                            setEditFolderName("");
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleRenameFolder(folder.id);
                                        }}
                                        style={{ background: '#00d2ff', color: '#000', border: 'none', padding: '4px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                                        type="button"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  ) : (
                                    <h3 style={{ color: '#fff', margin: 0, fontSize: '18px', textAlign: 'center', fontWeight: 'bold' }}>
                                      {folder.name}
                                    </h3>
                                  )}
                                </div>
                                <span className="folder-badge">Project Workspace</span>
                              </div>
                              <div className="folder-card-footer">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
                                  <button
                                    className="open-folder-btn"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveFolderId(folder.id);
                                    }}
                                    type="button"
                                  >
                                    Open Workspace &rarr;
                                  </button>

                                  {isOwner ? (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleVerifyFolder(folder.id);
                                      }}
                                      disabled={auditingFolders[folder.id]}
                                      style={{
                                        background: auditingFolders[folder.id] ? 'rgba(255,255,255,0.05)' : 'transparent',
                                        border: '1px solid #00d2ff',
                                        color: '#00d2ff',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        cursor: auditingFolders[folder.id] ? 'not-allowed' : 'pointer',
                                        width: '100%',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        transition: 'all 0.2s',
                                      }}
                                      type="button"
                                    >
                                      {auditingFolders[folder.id] ? 'Auditing via GPT Engine...' : (folderAuditScore ? 'Re-Verify with MeliusAI' : 'Verify with MeliusAI')}
                                    </button>
                                  ) : null}

                                  {folderAuditScore ? (
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleOpenProjectPreview(folderAudit);
                                      }}
                                      style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid #444',
                                        color: '#fff',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        width: '100%',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        transition: 'all 0.2s',
                                        marginTop: '2px',
                                      }}
                                      type="button"
                                    >
                                      Read Full Audit Protocol
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <ProjectCard
                            key={item.project.id}
                            project={item.project}
                            isSpectator={isSpectating}
                            verifyingAssetId={verifyingAssetId}
                            deletingProjectId={deletingProjectId}
                            verifiedAssetId={verifiedAssetId}
                            onVerify={(selectedProject, event) => void handleVerifyWithMeliusAI(selectedProject, event)}
                            handleReUpload={handleReUpload}
                            onOpen={handleOpenProjectPreview}
                            onDelete={(projectId) => void handleDeleteProject(projectId)}
                          />
                        );
                      })}

                  </div>

                  {rootWorkItems.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllWork((value) => !value)}
                      className="mt-6 mx-auto block px-5 py-2 bg-blue-950/40 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-900/60 hover:border-blue-500 rounded-lg font-mono text-xs tracking-wider uppercase transition-all duration-200 cursor-pointer"
                    >
                      {showAllWork ? 'Collapse Assets' : `See All Uploaded Assets (${initialWorkItems.length})`}
                    </button>
                  ) : null}
                </>
              )}
            </section>
                )}
              </Suspense>

              <Suspense fallback={<RatingsSectionSkeleton />}>
                {isProfilePayloadPending ? (
                  <RatingsSectionSkeleton />
                ) : (
            <section id="my-ratings" className="scroll-mt-24 space-y-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">My Ratings</h2>
                <p className="mt-1 text-sm text-slate-400">Your score and recent scans.</p>
              </div>

              <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                <CardContent className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-center lg:gap-8">
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
                )}
              </Suspense>

            {isOwner && (
              <section id="opportunities" className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Opportunities</h2>
                <p className="mt-1 text-sm text-slate-400">Open roles for your next step.</p>
              </div>

              {loadingState ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((item) => (
                    <CandidateOpportunitySkeleton key={item} />
                  ))}
                </div>
              ) : fetchError ? (
                <Card className="border-rose-400/20 bg-rose-500/[0.07] backdrop-blur-md">
                  <CardContent className="p-4 sm:p-6">
                    <p className="text-sm text-rose-100">{fetchError}</p>
                  </CardContent>
                </Card>
              ) : liveJobs.length > 0 ? (
                <div className="space-y-4">
                  <AnimatePresence initial={false}>
                    {liveJobs.map((item, index) => (
                      <CandidateOpportunityCard
                        key={item.id || `${item.recruiter_name}-${item.role_title}-${index}`}
                        item={item}
                        displayName={displayName}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <Card className="border-blue-950/50 bg-[#090d1f]/40 backdrop-blur-md">
                  <CardContent className="p-4 sm:p-6">
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
            </Suspense>
            )}

            {isOwner ? (
              <>
                <input
                  ref={projectFolderInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => void handleFolderSelect(event)}
                  {...{ webkitdirectory: '', directory: '' }}
                />

                <div
                  id="ingestion-modal"
                  className={`modal ${isIngestionModalOpen ? '' : 'hidden'}`}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="ingestion-modal-title"
                  onClick={(event) => {
                    if (event.target === event.currentTarget) {
                      setIsIngestionModalOpen(false);
                    }
                  }}
                >
                  <div className="modal-content card">
                    <div className="modal-header">
                      <h2 id="ingestion-modal-title">Import Project</h2>
                      <button
                        className="close-btn"
                        id="close-modal"
                        aria-label="Close"
                        type="button"
                        onClick={() => setIsIngestionModalOpen(false)}
                      >
                        &times;
                      </button>
                    </div>
                    <p className="tagline">Where is your code located?</p>

                    <div className="ingestion-grid">
                      <button
                        className="ingestion-btn"
                        id="btn-github"
                        type="button"
                        onClick={() => {
                          setIsIngestionModalOpen(false);
                          setIsGithubModalOpen(true);
                        }}
                      >
                        <div className="icon-circle">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" aria-hidden="true">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"></path>
                          </svg>
                        </div>
                        <span className="btn-label">GitHub URL</span>
                      </button>

                      <button
                        className="ingestion-btn"
                        id="btn-local"
                        type="button"
                        onClick={() => projectFolderInputRef.current?.click()}
                      >
                        <div className="icon-circle">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            width="32"
                            height="32"
                            aria-hidden="true"
                          >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                          </svg>
                        </div>
                        <span className="btn-label">Browse Folder</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            <AssetPreviewModal
              activePreviewName={activePreviewName}
              activePreviewUrl={activePreviewUrl}
              previewProject={activePreviewProject}
              onProjectUpdated={handlePreviewProjectUpdated}
              onClose={() => {
                setActivePreviewProjectId(null);
                setActivePreviewProjectOverride(null);
                setActivePreviewName(null);
                setActivePreviewUrl(null);
              }}
            />
          </main>

          {isGithubModalOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#0b1120', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '500px', border: '1px solid #00d2ff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <h2 style={{ color: '#fff', marginTop: 0, marginBottom: '10px' }}>Import from GitHub</h2>
                <p style={{ color: '#8892b0', marginBottom: '20px', fontSize: '14px' }}>Paste the public URL of the repository you want to audit.</p>

                <input
                  type="text"
                  placeholder="https://github.com/username/repository"
                  value={githubRepoUrl}
                  onChange={(e) => setGithubRepoUrl(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', marginBottom: '20px', outline: 'none' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                  <button onClick={() => setIsGithubModalOpen(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #8892b0', color: '#8892b0', borderRadius: '6px', cursor: 'pointer' }} type="button">Cancel</button>
                  <button
                    onClick={handleGithubFetch}
                    disabled={isFetchingGithub}
                    style={{ padding: '10px 20px', background: '#00d2ff', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: isFetchingGithub ? 'not-allowed' : 'pointer', opacity: isFetchingGithub ? 0.7 : 1 }}
                    type="button"
                  >
                    {isFetchingGithub ? 'Fetching...' : 'Fetch Repository'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isStagingModalOpen && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#0b1120', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid #00d2ff' }}>
                <h2 style={{ color: '#fff', marginTop: 0 }}>Review Files ({stagedFiles.filter((file) => file.selected).length} selected)</h2>
                <p style={{ color: '#8892b0' }}>Uncheck files you don&apos;t want to audit.</p>

                <div style={{ flexGrow: 1, overflowY: 'auto', margin: '20px 0', borderTop: '1px solid #1f2937', borderBottom: '1px solid #1f2937', padding: '15px 0' }}>
                  {Object.entries(groupedFiles).map(([dirPath, filesInDir]) => {
                    const allSelected = filesInDir.every((file) => file.selected);
                    const someSelected = filesInDir.some((file) => file.selected);

                    return (
                      <details key={dirPath} open style={{ marginBottom: '15px', paddingLeft: '5px' }}>
                        <summary
                          style={{
                            cursor: 'pointer',
                            color: '#e2e8f0',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            listStyle: 'none',
                            padding: '8px 0',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someSelected && !allSelected;
                            }}
                            onChange={(event) => toggleFolderSelection(dirPath, event.target.checked)}
                            onClick={(event) => event.stopPropagation()}
                            style={{ accentColor: '#00d2ff', width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8892b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                          </svg>
                          <span style={{ flexGrow: 1, letterSpacing: '0.3px' }}>{dirPath}</span>
                          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'normal', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {filesInDir.length} files
                          </span>
                        </summary>

                        <div style={{ paddingLeft: '32px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {filesInDir.map((file) => (
                            <label key={file.path} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: '#94a3b8', padding: '4px 0' }}>
                              <input
                                type="checkbox"
                                checked={file.selected}
                                onChange={() => {
                                  setStagedFiles((prev) =>
                                    prev.map((previousFile) =>
                                      previousFile.path === file.path
                                        ? { ...previousFile, selected: !previousFile.selected }
                                        : previousFile
                                    )
                                  );
                                }}
                                style={{ accentColor: '#00d2ff', width: '14px', height: '14px', cursor: 'pointer' }}
                              />
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                <polyline points="13 2 13 9 20 9"></polyline>
                              </svg>
                              <span style={{ fontSize: '13px', letterSpacing: '0.2px' }}>{file.name}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                  <button onClick={() => setIsStagingModalOpen(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #8892b0', color: '#8892b0', borderRadius: '6px', cursor: 'pointer' }} type="button">Cancel</button>
                  <button
                    onClick={() => void handleConfirmUpload()}
                    disabled={isUploading}
                    style={{ padding: '10px 20px', background: '#00d2ff', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '6px', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.5 : 1 }}
                    type="button"
                  >
                    {isUploading ? "Uploading..." : "Confirm & Upload"}
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}
