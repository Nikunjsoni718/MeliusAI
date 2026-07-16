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
import { FileText, FolderLock, House, LoaderCircle, Pencil, Save, Search, UserRound } from 'lucide-react';
import { useSWRConfig } from 'swr';

import { UniversalAssetGrid } from '@/components/dashboard/universal-asset-grid';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { fetchSpectateProfileResponse } from '@/lib/spectate-profile';
import { useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import type { ProjectRow } from '@/types/supabase';

type ResumeStatus = string;
type EditableResumeSection = 'coreMetrics' | 'qualifications' | 'skills' | 'experience' | 'hobbies';
type EditableListField = 'qualifications' | 'experience' | 'hobbies' | 'skills';
type ResumeFormData = {
  name: string;
  age: string;
  status: ResumeStatus;
  qualifications: string[];
  experience: string[];
  hobbies: string[];
  skills: string[];
  featuredProjectIds: string[];
};
type ResumeFields = {
  id?: string | null;
  username?: string | null;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  age?: number | string | null;
  current_status?: string | null;
  qualifications?: unknown;
  experience?: unknown;
  hobbies?: unknown;
  skills?: unknown;
  projects?: ProjectRow[] | null;
  name?: string | null;
  status?: string | null;
  isOwner?: boolean;
};
type SpectatorResumePayload = {
  id?: string | null;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  age?: number | string | null;
  current_status?: string | null;
  qualifications?: string[] | null;
  experience?: string[] | string | null;
  hobbies?: string[] | null;
  skills?: string[] | null;
  projects?: ProjectRow[] | null;
  detail?: string;
  message?: string;
};
type WrappedSpectatorResumeResponse = {
  profile?: ResumeFields | null;
  resume?: ResumeFields | null;
  projects?: ProjectRow[] | null;
  vault_assets?: ProjectRow[] | null;
  vaultAssets?: ProjectRow[] | null;
  files?: ProjectRow[] | null;
  isOwner?: boolean;
  viewerType?: string;
  detail?: string;
  message?: string;
};
type SpectatorResumeResponse = SpectatorResumePayload | WrappedSpectatorResumeResponse;

const statusOptions: ResumeStatus[] = ['Studying', 'Working', 'Looking for an Opportunity'];
const BASE_RESUME_SELECT = 'id, username, full_name, avatar_url, age, current_status, qualifications, skills, experience, hobbies';
const navigationItems = [
  { href: '/profile', label: 'Home', icon: House },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/vault', label: 'Vault', icon: FolderLock },
  { href: '/resume', label: 'Resume', icon: FileText },
];

function SidebarLink({
  active,
  href,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
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

function normalizeAge(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function nullableProjects(value: unknown) {
  return Array.isArray(value) ? (value as ProjectRow[]) : null;
}

function normalizeSpectatorResumeFields(value: unknown, targetUsername: string): ResumeFields | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const hasResumeShape = [
    'id',
    'username',
    'full_name',
    'email',
    'avatar_url',
    'age',
    'current_status',
    'qualifications',
    'experience',
    'hobbies',
    'skills',
    'projects',
  ].some((key) => key in record);

  if (!hasResumeShape) {
    return null;
  }

  return {
    id: nullableString(record.id),
    username: nullableString(record.username) ?? targetUsername,
    email: nullableString(record.email),
    full_name: nullableString(record.full_name),
    avatar_url: nullableString(record.avatar_url),
    age: typeof record.age === 'number' || typeof record.age === 'string' ? record.age : null,
    current_status: nullableString(record.current_status),
    qualifications: normalizeList(record.qualifications),
    skills: normalizeList(record.skills),
    experience: normalizeList(record.experience),
    hobbies: normalizeList(record.hobbies),
    projects: nullableProjects(record.projects),
  };
}

function getSpectatorResume(payload: SpectatorResumeResponse | null, targetUsername: string) {
  const payloadRecord = asRecord(payload);
  const directProfile = normalizeSpectatorResumeFields(payload, targetUsername);
  const wrappedProfile = normalizeSpectatorResumeFields(payloadRecord?.profile, targetUsername);
  const wrappedResume = normalizeSpectatorResumeFields(payloadRecord?.resume, targetUsername);
  const profile = wrappedProfile ?? directProfile;

  if (!profile) {
    return null;
  }

  return {
    ...profile,
    ...(wrappedResume ?? {}),
    id: profile.id ?? wrappedResume?.id ?? null,
    username: profile.username ?? wrappedResume?.username ?? targetUsername,
    full_name: wrappedResume?.full_name ?? wrappedResume?.name ?? profile.full_name ?? profile.name ?? null,
    avatar_url: wrappedResume?.avatar_url ?? profile.avatar_url ?? null,
    age: wrappedResume?.age ?? profile.age ?? null,
    current_status: wrappedResume?.current_status ?? wrappedResume?.status ?? profile.current_status ?? profile.status ?? null,
    qualifications: wrappedResume?.qualifications ?? profile.qualifications ?? [],
    skills: wrappedResume?.skills ?? profile.skills ?? [],
    experience: wrappedResume?.experience ?? profile.experience ?? [],
    hobbies: wrappedResume?.hobbies ?? profile.hobbies ?? [],
    projects: wrappedResume?.projects ?? profile.projects ?? null,
  } satisfies ResumeFields;
}

function getSpectatorResumeAssets(payload: SpectatorResumeResponse | null) {
  const payloadRecord = asRecord(payload);
  const profileRecord = asRecord(payloadRecord?.profile);
  const resumeRecord = asRecord(payloadRecord?.resume);
  const projects =
    nullableProjects(payloadRecord?.projects) ??
    nullableProjects(profileRecord?.projects) ??
    nullableProjects(resumeRecord?.projects) ??
    nullableProjects(payloadRecord?.vault_assets) ??
    nullableProjects(payloadRecord?.vaultAssets) ??
    nullableProjects(payloadRecord?.files) ??
    [];

  return Array.isArray(projects)
    ? projects.filter((project) => project.is_public !== false)
    : [];
}

function createDefaultFormData(): ResumeFormData {
  return {
    name: '',
    age: '',
    status: '',
    qualifications: [],
    experience: [],
    hobbies: [],
    skills: [],
    featuredProjectIds: [],
  };
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

function SectionHeader({
  editDisabled,
  isEditing,
  isOwner,
  isSaving,
  label,
  onEdit,
  onSave,
}: {
  editDisabled: boolean;
  isEditing: boolean;
  isOwner: boolean;
  isSaving: boolean;
  label: string;
  onEdit: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</h2>
      {isOwner ? (
        isEditing ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-200 transition hover:border-emerald-300/45 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            disabled={editDisabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-950/60 bg-[#050b1b]/60 text-slate-500 transition hover:border-cyan-500/35 hover:bg-cyan-500/10 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`Edit ${label}`}
            title={`Edit ${label}`}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
          </button>
        )
      ) : null}
    </div>
  );
}

function EditableStringListSection({
  addLabel,
  editDisabled,
  emptyLabel,
  isOwner,
  isEditing,
  isSaving,
  items,
  label,
  onAdd,
  onDelete,
  onEdit,
  onSave,
  onUpdate,
  placeholder,
  variant = 'bullet',
}: {
  addLabel: string;
  editDisabled: boolean;
  emptyLabel: string;
  isOwner: boolean;
  isEditing: boolean;
  isSaving: boolean;
  items: string[];
  label: string;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (index: number, value: string) => void;
  placeholder: string;
  variant?: 'bullet' | 'pill';
}) {
  const visibleItems = items.filter((item) => item.trim());

  return (
    <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
      <SectionHeader
        editDisabled={editDisabled}
        isEditing={isEditing}
        isOwner={isOwner}
        isSaving={isSaving}
        label={label}
        onEdit={onEdit}
        onSave={onSave}
      />
      {isOwner && isEditing ? (
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

function DashboardResumePageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUsername = searchParams.get('profile')?.trim().replace(/^@+/, '') || null;
  const normalizedTargetUsername = targetUsername?.toLowerCase() ?? null;
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const { mutate } = useSWRConfig();
  const [spectatedOwnership, setSpectatedOwnership] = useState<{
    isOwner: boolean;
    username: string;
  } | null>(null);
  const hasOwnershipForTarget = Boolean(
    normalizedTargetUsername && spectatedOwnership?.username === normalizedTargetUsername
  );
  const isOwner = normalizedTargetUsername
    ? Boolean(!loading && hasOwnershipForTarget && spectatedOwnership?.isOwner)
    : Boolean(user?.id);
  const isSpectator = Boolean(targetUsername && !loading && !isOwner);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const visibleNavigationItems = useMemo(
    () => (isOwner ? navigationItems : navigationItems.filter((item) => item.label !== 'Search')),
    [isOwner]
  );
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<number | null>(null);
  const [formData, setFormData] = useState<ResumeFormData>(() => createDefaultFormData());
  const [topProjects, setTopProjects] = useState<ProjectRow[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(true);
  const [isEditingCoreMetrics, setIsEditingCoreMetrics] = useState(false);
  const [isEditingQualifications, setIsEditingQualifications] = useState(false);
  const [isEditingSkills, setIsEditingSkills] = useState(false);
  const [isEditingExperience, setIsEditingExperience] = useState(false);
  const [isEditingHobbies, setIsEditingHobbies] = useState(false);
  const [savingSection, setSavingSection] = useState<EditableResumeSection | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isEditingAnySection =
    isEditingCoreMetrics ||
    isEditingQualifications ||
    isEditingSkills ||
    isEditingExperience ||
    isEditingHobbies;

  useEffect(() => {
    setSpectatedOwnership(null);
  }, [user?.id]);

  useEffect(() => {
    if (!isSpectator && !loading && authEnabled && !user) {
      router.replace('/auth');
    }
  }, [authEnabled, isSpectator, loading, router, user]);

  useEffect(() => {
    if (loading) {
      return;
    }

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
        let nextSpectatedOwnership: { isOwner: boolean; username: string } | null = null;

        if (isSpectator && targetUsername) {
          const response = await fetchSpectateProfileResponse(targetUsername, { supabase });
          const payload = (await response.json().catch(() => null)) as SpectatorResumeResponse | null;
          const spectatorResume = getSpectatorResume(payload, targetUsername);
          const payloadRecord = asRecord(payload);
          const profileRecord = asRecord(payloadRecord?.profile);

          if (!response.ok || !spectatorResume) {
            throw new Error(payload?.detail || payload?.message || 'Unable to load this public resume.');
          }

          nextSpectatedOwnership = {
            username: normalizedTargetUsername ?? targetUsername.toLowerCase(),
            isOwner: payloadRecord?.isOwner === true || profileRecord?.isOwner === true,
          };
          resume = spectatorResume;
          profileUuid = resume?.id ?? null;
          fallbackAssets = getSpectatorResumeAssets(payload);
        } else if (supabase && user) {
          const profileResponse = await supabase
            .from('profiles')
            .select(BASE_RESUME_SELECT)
            .eq('id', user.id)
            .maybeSingle();

          if (profileResponse.error) {
            throw profileResponse.error;
          }

          resume = profileResponse.data as ResumeFields | null;
          profileUuid = resume?.id ?? user.id;
        }

        profileUuid = profileUuid ?? resume?.id ?? (!isSpectator ? user?.id ?? null : null);

        if (!isSpectator && profileUuid && supabase) {
          const { data: assetData, error: assetError } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', profileUuid);

          if (assetError) {
            console.warn('Resume asset fetch failed; using available payload assets if present.', assetError);
            assets = fallbackAssets;
          } else {
            const queriedAssets = Array.isArray(assetData) ? (assetData as ProjectRow[]) : [];
            assets = queriedAssets;
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

        if (nextSpectatedOwnership) {
          setSpectatedOwnership(nextSpectatedOwnership);
        }

        const nextFormData = createDefaultFormData();
        const topProjects = isSpectator ? assets.slice(0, 4) : getTopScoringAssets(assets);
        const topProjectIds = topProjects.map((asset) => asset.id);
        const fallbackName = !isSpectator
          ? (user?.user_metadata?.full_name as string | undefined) ??
            (user?.user_metadata?.name as string | undefined) ??
            ''
          : '';
        const fallbackAvatarUrl = !isSpectator
          ? (user?.user_metadata?.avatar_url as string | undefined) ??
            (user?.user_metadata?.picture as string | undefined) ??
            null
          : null;

        setFormData({
          ...nextFormData,
          name:
            resume?.full_name ??
            resume?.name ??
            fallbackName,
          age: normalizeAge(resume?.age),
          status: resume?.current_status ?? resume?.status ?? '',
          qualifications: resume ? normalizeList(resume.qualifications) : nextFormData.qualifications,
          skills: resume ? normalizeList(resume.skills) : nextFormData.skills,
          experience: resume ? normalizeList(resume.experience) : nextFormData.experience,
          hobbies: resume ? normalizeList(resume.hobbies) : nextFormData.hobbies,
          featuredProjectIds: topProjectIds,
        });
        setTopProjects(topProjects);
        setAvatarUrl(resume?.avatar_url ?? fallbackAvatarUrl);
      } catch (error) {
        console.error('Failed to load resume intake data', error);
        if (active) {
          setFormError(
            isSpectator
              ? `Unable to load ${targetUsername ?? 'this candidate'}'s resume right now.`
              : 'Unable to load your resume profile right now.'
          );
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
  }, [isSpectator, loading, normalizedTargetUsername, supabase, targetUsername, user]);

  useEffect(() => {
    if (isSpectator) {
      setIsEditingCoreMetrics(false);
      setIsEditingQualifications(false);
      setIsEditingSkills(false);
      setIsEditingExperience(false);
      setIsEditingHobbies(false);
      setSavingSection(null);
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

  function updateStringList(field: EditableListField, index: number, value: string) {
    setFormData((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addStringItem(field: EditableListField) {
    setFormData((current) => ({ ...current, [field]: [...current[field], ''] }));
  }

  function deleteStringItem(field: EditableListField, index: number) {
    setFormData((current) => ({
      ...current,
      [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function setSectionEditing(section: EditableResumeSection, isEditing: boolean) {
    if (section === 'coreMetrics') setIsEditingCoreMetrics(isEditing);
    if (section === 'qualifications') setIsEditingQualifications(isEditing);
    if (section === 'skills') setIsEditingSkills(isEditing);
    if (section === 'experience') setIsEditingExperience(isEditing);
    if (section === 'hobbies') setIsEditingHobbies(isEditing);
  }

  function beginEditingSection(section: EditableResumeSection) {
    if (!isOwner || isEditingAnySection || savingSection) {
      return;
    }

    setFormError(null);
    setSuccessMessage(null);
    setSectionEditing(section, true);
  }

  async function handleSectionSave(section: EditableResumeSection) {
    if (!isOwner || !supabase || !user || savingSection) {
      return;
    }

    setSavingSection(section);
    setFormError(null);

    try {
      let updatePayload: Record<string, unknown>;

      if (section === 'coreMetrics') {
        const parsedAge = formData.age.trim() ? Number.parseInt(formData.age, 10) : null;
        updatePayload = {
          full_name: formData.name.trim() || null,
          age: Number.isFinite(parsedAge) ? parsedAge : null,
          current_status: formData.status || null,
        };
      } else {
        const normalizedItems = formData[section].map((item) => item.trim()).filter(Boolean);
        updatePayload = { [section]: normalizedItems };
      }

      const { data: updatedProfileData, error } = await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id)
        .select(BASE_RESUME_SELECT)
        .single();

      if (error) {
        throw error;
      }

      const updatedProfile = updatedProfileData as ResumeFields;
      const updatedProfileHandle = (
        updatedProfile.username ??
        normalizedTargetUsername ??
        user.id
      ).toLowerCase();

      await mutate(
        (cacheKey) =>
          Array.isArray(cacheKey) &&
          cacheKey[0] === 'spectate-profile' &&
          typeof cacheKey[1] === 'string' &&
          cacheKey[1].toLowerCase() === updatedProfileHandle &&
          cacheKey[2] === user.id,
        (cachedPayload: unknown) => {
          if (!cachedPayload || typeof cachedPayload !== 'object') {
            return cachedPayload;
          }

          const dashboardPayload = cachedPayload as {
            profile?: ResumeFields | null;
            [key: string]: unknown;
          };

          return {
            ...dashboardPayload,
            profile: {
              ...(dashboardPayload.profile ?? {}),
              ...updatedProfile,
            },
          };
        },
        { revalidate: false }
      );

      setFormData((current) => {
        if (section === 'coreMetrics') {
          return {
            ...current,
            name: updatedProfile.full_name ?? '',
            age: normalizeAge(updatedProfile.age),
            status: updatedProfile.current_status ?? '',
          };
        }

        return {
          ...current,
          [section]: normalizeList(updatedProfile[section]),
        };
      });
      setSectionEditing(section, false);
      const sectionLabel = section === 'coreMetrics'
        ? 'Core metrics'
        : section.charAt(0).toUpperCase() + section.slice(1);
      setSuccessMessage(`${sectionLabel} saved.`);
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setSuccessMessage(null);
      }, 2600);
    } catch (error) {
      console.error('Failed to save resume profile', error);
      setFormError('This resume section could not be saved. Please try again.');
    } finally {
      setSavingSection(null);
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (!isOwner || !file || !supabase || !user) {
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
    <main className="relative flex h-screen w-full overflow-hidden bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-white">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(0,112,243,0.16),transparent_55%)]" />

      <div className="relative z-10 flex h-full w-full overflow-hidden">
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
            'fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col justify-between border-r border-blue-950/40 bg-slate-950 p-4 transition-transform duration-300 ease-in-out md:relative md:z-40 md:h-full md:min-w-[16rem] md:translate-x-0 md:bg-[#060b1e]',
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
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
                    targetUsername
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
                        onClick={() => setIsSidebarOpen(false)}
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

        <section className="scrollbar-hide relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto">
          <button
            type="button"
            aria-label="Toggle sidebar"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-950/60 bg-slate-950/90 text-slate-100 shadow-lg shadow-black/20 backdrop-blur transition hover:border-cyan-500/40 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:hidden"
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
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-8 pt-16 sm:px-6 sm:py-8">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-400">Profile Intake Terminal</p>
                <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Resume</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                  Build a focused technical profile for career matching and MeliusAI context.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {successMessage ? (
                <p className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                  {successMessage}
                </p>
              ) : null}

              <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
                <SectionHeader
                  editDisabled={isEditingAnySection}
                  isEditing={isEditingCoreMetrics}
                  isOwner={isOwner}
                  isSaving={savingSection === 'coreMetrics'}
                  label="Core Metrics"
                  onEdit={() => beginEditingSection('coreMetrics')}
                  onSave={() => void handleSectionSave('coreMetrics')}
                />
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
                    {isOwner && (
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
                      <Label htmlFor={isEditingCoreMetrics ? 'resume-name' : undefined}>Name</Label>
                      {isEditingCoreMetrics ? (
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
                      <Label htmlFor={isEditingCoreMetrics ? 'resume-age' : undefined}>Age</Label>
                      {isEditingCoreMetrics ? (
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
                      <Label htmlFor={isEditingCoreMetrics ? 'resume-current-status' : undefined}>Current Status</Label>
                      {isEditingCoreMetrics ? (
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

                  </div>
                </div>
              </div>

              <EditableStringListSection
                addLabel="Qualification"
                editDisabled={isEditingAnySection}
                emptyLabel="No qualifications added yet."
                isOwner={isOwner}
                isEditing={isEditingQualifications}
                isSaving={savingSection === 'qualifications'}
                items={formData.qualifications}
                label="Qualifications"
                onAdd={() => addStringItem('qualifications')}
                onDelete={(index) => deleteStringItem('qualifications', index)}
                onEdit={() => beginEditingSection('qualifications')}
                onSave={() => void handleSectionSave('qualifications')}
                onUpdate={(index, value) => updateStringList('qualifications', index, value)}
                placeholder="Passed 10th from..."
              />

              <EditableStringListSection
                addLabel="Skill"
                editDisabled={isEditingAnySection}
                emptyLabel="No skills added yet."
                isOwner={isOwner}
                isEditing={isEditingSkills}
                isSaving={savingSection === 'skills'}
                items={formData.skills}
                label="Skills"
                onAdd={() => addStringItem('skills')}
                onDelete={(index) => deleteStringItem('skills', index)}
                onEdit={() => beginEditingSection('skills')}
                onSave={() => void handleSectionSave('skills')}
                onUpdate={(index, value) => updateStringList('skills', index, value)}
                placeholder="React"
                variant="pill"
              />

              <EditableStringListSection
                addLabel="Experience"
                editDisabled={isEditingAnySection}
                emptyLabel="No professional experience added yet."
                isOwner={isOwner}
                isEditing={isEditingExperience}
                isSaving={savingSection === 'experience'}
                items={formData.experience}
                label="Professional Experience"
                onAdd={() => addStringItem('experience')}
                onDelete={(index) => deleteStringItem('experience', index)}
                onEdit={() => beginEditingSection('experience')}
                onSave={() => void handleSectionSave('experience')}
                onUpdate={(index, value) => updateStringList('experience', index, value)}
                placeholder="Software Engineer at..."
              />

              <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300">
                <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">Featured Projects</p>
                {isOwner ? (
                  <p className="mb-4 text-sm leading-6 text-slate-400">
                    Your top 4 highest-scoring projects are automatically featured on your public profile.
                  </p>
                ) : null}
                <UniversalAssetGrid
                  assets={topProjects}
                  isSpectator={!isOwner}
                  gridClassName="gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4"
                  emptyMessage="No verified Vault assets found yet."
                />
              </div>

              <EditableStringListSection
                addLabel="Hobby"
                editDisabled={isEditingAnySection}
                emptyLabel="No hobbies added yet."
                isOwner={isOwner}
                isEditing={isEditingHobbies}
                isSaving={savingSection === 'hobbies'}
                items={formData.hobbies}
                label="Hobbies"
                onAdd={() => addStringItem('hobbies')}
                onDelete={(index) => deleteStringItem('hobbies', index)}
                onEdit={() => beginEditingSection('hobbies')}
                onSave={() => void handleSectionSave('hobbies')}
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
