'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { useViewerProfile } from '@/lib/viewer-client';

export type OrganizationLinkedProfile = {
  id: string;
  name: string;
  role: string;
  profile_link: string;
  username?: string;
  profiles?: {
    username?: string | null;
  } | null;
};

type MemberSearchUser = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type MemberVerificationResponse =
  | {
      success: true;
      user: MemberSearchUser;
    }
  | {
      success: false;
      message: string;
    };

interface CandidateProfile {
  id: string;
  full_name?: string;
  username: string;
  bio: string;
  skills: string[];
  avg_project_score: number;
  vector_match: number;
  composite_match_index: number;
  matchScore?: number;
  aiReasoning?: string;
}

type UiFeedback = {
  type: 'error' | 'info' | null;
  message: string | null;
};

type OrganizationRecord = {
  id: string | null;
  company_name?: string | null;
  slug?: string | null;
  bio: string | null;
  linked_profiles: unknown;
};

type ActiveWorkspaceContext = {
  id: string | null;
  title: string;
  slug: string;
};

type OrganizationTableClient = {
  from: (table: 'organizations') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: OrganizationRecord | null; error: { message: string } | null }>;
      };
    };
    update: (values: {
      bio: string;
      linked_profiles: OrganizationLinkedProfile[];
    }) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

const navItems: Array<{
  label: string;
  targetId: string;
}> = [
  { label: 'Overview', targetId: 'overview' },
  { label: 'AI Matcher', targetId: 'ai-matcher' },
  { label: 'Talent Discovery', targetId: 'talent-discovery' },
];

const mobileNavItems: Array<{
  label: string;
  targetId: string;
  icon: 'overview' | 'spark' | 'talent' | 'members' | 'settings';
}> = [
  { label: 'Home', targetId: 'overview', icon: 'overview' },
  { label: 'Match', targetId: 'ai-matcher', icon: 'spark' },
  { label: 'Talent', targetId: 'talent-discovery', icon: 'talent' },
  { label: 'Members', targetId: 'talent-discovery', icon: 'members' },
  { label: 'Profile', targetId: 'overview', icon: 'settings' },
];

const MEMBER_SEARCH_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/search-member`;
const TALENT_MATCH_ENDPOINT = '/api/match-talent';
const TALENT_MATCH_FEEDBACK_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/match-feedback`;
const OPPORTUNITY_CREATE_ENDPOINT = '/api/opportunities/create';

function normalizeLinkedProfiles(value: unknown): OrganizationLinkedProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => {
      return typeof item === 'object' && item !== null;
    })
    .map((item) => {
      const id =
        typeof item.id === 'string'
          ? item.id
          : typeof item.userId === 'string'
            ? item.userId
            : '';
      const legacyUsername = typeof item.username === 'string' ? item.username : '';
      const profileLink =
        typeof item.profile_link === 'string'
          ? item.profile_link
          : legacyUsername
            ? `/profile/${legacyUsername}`
            : '';
      const profileHandle = profileLink.replace('/profile/', '').trim();
      const nestedProfiles =
        typeof item.profiles === 'object' && item.profiles !== null
          ? (item.profiles as Record<string, unknown>)
          : null;
      const nestedUsername =
        nestedProfiles && typeof nestedProfiles.username === 'string' ? nestedProfiles.username : '';

      return {
        id,
        name:
          typeof item.name === 'string' && item.name.trim()
            ? item.name
            : profileHandle || 'Workspace Member',
        role: typeof item.role === 'string' ? item.role : 'Workspace Member',
        profile_link: profileLink,
        username: legacyUsername || nestedUsername || profileHandle || undefined,
        profiles: nestedUsername ? { username: nestedUsername } : null,
      };
    })
    .filter((item) => item.id.trim().length > 0 && item.profile_link.trim().length > 0);
}

function getNumberValue(value: unknown, fallback = 0) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeDecimalMatch(value: unknown) {
  const numericValue = getNumberValue(value, 0);
  return numericValue > 1 ? numericValue / 100 : numericValue;
}

function normalizeSkills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((skill) => String(skill).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeCandidateProfile(value: unknown): CandidateProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : typeof row.candidate_id === 'string' ? row.candidate_id : '';

  if (!id) {
    return null;
  }

  const username =
    typeof row.username === 'string' && row.username.trim()
      ? row.username.trim()
      : typeof row.full_name === 'string' && row.full_name.trim()
        ? row.full_name.trim()
        : 'profile';
  const bio =
    typeof row.bio === 'string'
      ? row.bio
      : typeof row.role === 'string'
        ? row.role
        : 'Verified MeliusAI talent profile.';
  const vectorMatch = normalizeDecimalMatch(row.vector_match ?? row.semantic_similarity ?? row.similarity);
  const compositeMatchIndex = normalizeDecimalMatch(
    row.composite_match_index ?? row.matchScore ?? row.match_index ?? row.match_score ?? row.score
  );
  const matchScore = getNumberValue(row.matchScore ?? row.match_index ?? compositeMatchIndex * 100, 0);

  return {
    id,
    full_name: typeof row.full_name === 'string' ? row.full_name : undefined,
    username,
    bio,
    skills: normalizeSkills(row.skills ?? row.tags),
    avg_project_score: getNumberValue(row.avg_project_score, 0),
    vector_match: vectorMatch,
    composite_match_index: compositeMatchIndex,
    matchScore,
    aiReasoning:
      typeof row.aiReasoning === 'string'
        ? row.aiReasoning
        : typeof row.reasoning === 'string'
          ? row.reasoning
          : undefined,
  };
}

function MobileNavIcon({ icon }: { icon: (typeof mobileNavItems)[number]['icon'] }) {
  const commonProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (icon === 'spark') {
    return (
      <svg {...commonProps}>
        <path d="M12 3l1.9 5.7L20 12l-6.1 3.3L12 21l-1.9-5.7L4 12l6.1-3.3L12 3z" />
      </svg>
    );
  }

  if (icon === 'talent') {
    return (
      <svg {...commonProps}>
        <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (icon === 'members') {
    return (
      <svg {...commonProps}>
        <path d="M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M3.5 21a6.5 6.5 0 0 1 13 0" />
        <path d="M18 8.5a2.5 2.5 0 1 0 0-5" />
        <path d="M19 17a4.5 4.5 0 0 1 1.5 4" />
      </svg>
    );
  }

  if (icon === 'settings') {
    return (
      <svg {...commonProps}>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1h.1a2 2 0 0 1 0 4h-.1a1.8 1.8 0 0 0-1.6 1z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 12h16" />
      <path d="M4 6h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export default function OrganizationDashboard() {
  const router = useRouter();
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspaceContext>({
    id: null,
    title: '',
    slug: '',
  });
  const [companyName, setCompanyName] = useState<string>('');
  const [workspaceUsername, setWorkspaceUsername] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [bioState, setBioState] = useState<string>('');
  const [linkedProfilesState, setLinkedProfilesState] = useState<OrganizationLinkedProfile[]>([]);
  const [profileSaveState, setProfileSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MemberSearchUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [matchPrompt, setMatchPrompt] = useState('');
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [uiFeedback, setUiFeedback] = useState<UiFeedback>({ type: null, message: null });
  const [candidateInviteState, setCandidateInviteState] = useState<Record<string, 'inviting' | 'invited'>>({});
  const sidebarCompanyName = activeWorkspace.title || companyName;
  const sidebarWorkspaceUsername = activeWorkspace.slug || workspaceUsername;
  const currentOrg = activeWorkspace;
  const currentOrgId = activeWorkspace.id;
  const isWorkspaceContextPending = loading || isLoading;

  function scrollToSection(targetId: string) {
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getInitials(name: string) {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'TM'
    );
  }

  function getOrganizationClient() {
    return supabase as unknown as OrganizationTableClient;
  }

  function handleDeleteLinkedProfile(targetIndex: number) {
    setLinkedProfilesState((currentProfiles) => currentProfiles.filter((_, index) => index !== targetIndex));
    setProfileSaveState('idle');
    setProfileSaveError(null);
  }

  function appendVerifiedProfile(profile: OrganizationLinkedProfile) {
    const alreadyLinked = linkedProfilesState.some((linkedProfile) => {
      const sameId = linkedProfile.id === profile.id;
      const sameProfileLink =
        linkedProfile.profile_link.trim().toLowerCase() === profile.profile_link.trim().toLowerCase();

      return sameId || sameProfileLink;
    });

    if (alreadyLinked) {
      setSearchError(`${profile.name} is already linked to this workspace.`);
      return false;
    }

    setLinkedProfilesState((currentProfiles) => [...currentProfiles, profile]);
    setProfileSaveState('idle');
    return true;
  }

  function linkVerifiedMember(verifiedData: MemberSearchUser) {
    if (!verifiedData.id || !verifiedData.username) {
      setSearchError('Verification failed: This profile record is missing required account fields.');
      return;
    }

    const wasAdded = appendVerifiedProfile({
      id: verifiedData.id,
      name: verifiedData.full_name || verifiedData.username,
      role: 'Workspace Member',
      profile_link: `/profile/${verifiedData.username}`,
    });

    if (wasAdded) {
      setSearchError('');
      setSearchQuery('');
      setIsModalOpen(false);
      setSearchResult(null);
    }
  }

  async function handleSearchMember() {
    setSearchError('');

    const targetQuery = searchQuery.trim();

    if (!targetQuery) {
      setSearchError('Enter a MeliusAI username or profile link to search.');
      setSearchResult(null);
      setIsModalOpen(false);
      return;
    }

    setIsAdding(true);
    setSearchResult(null);
    setIsModalOpen(false);

    try {
      const response = await fetch(MEMBER_SEARCH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: targetQuery,
        }),
      });

      if (!response.ok) {
        let errorDetail = `Search failed with status ${response.status}.`;
        const errorText = await response.text();

        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText) as { detail?: string };
            errorDetail = errorJson.detail || errorText;
          } catch {
            errorDetail = errorText;
          }
        }

        throw new Error(errorDetail);
      }

      const verificationData = (await response.json()) as MemberVerificationResponse;

      if (!verificationData.success) {
        setSearchError(verificationData.message);
        setSearchResult(null);
        setIsModalOpen(false);
        return;
      }

      setSearchResult(verificationData.user);
      setIsModalOpen(true);
      setSearchError('');
    } catch (error) {
      console.error('Error searching workspace member profiles:', error);
      setSearchError(
        error instanceof Error
          ? `Verification failed: ${error.message}`
          : 'Verification failed: Member verification service is unavailable.',
      );
      setSearchResult(null);
      setIsModalOpen(false);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRunMatcher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = matchPrompt.trim();

    if (!prompt) {
      setCandidates([]);
      setUiFeedback({ type: 'error', message: 'Please add new information to bring clarity.' });
      return;
    }

    setIsSearching(true);
    setUiFeedback({ type: null, message: null });
    setCandidates([]);
    setCandidateInviteState({});

    try {
      const response = await fetch(TALENT_MATCH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requirement: prompt,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            data?.message ||
            'Enterprise Engine Exception: Network response validation failed.',
        );
      }

      const rawCandidates = Array.isArray(data) ? data : Array.isArray(data?.candidates) ? data.candidates : [];
      const normalizedCandidates = rawCandidates
        .map((candidate: unknown) => normalizeCandidateProfile(candidate))
        .filter((candidate: CandidateProfile | null): candidate is CandidateProfile => Boolean(candidate));

      setCandidates(normalizedCandidates);
      setUiFeedback(
        normalizedCandidates.length === 0
          ? {
              type: 'info',
              message:
                '0 talent vectors inside the platform database matched your rigid relational taxonomy skill parameters.',
            }
          : { type: null, message: null }
      );
    } catch (error) {
      console.error('Error running talent match engine:', error);
      setUiFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Enterprise Engine Exception: Network response validation failed.',
      });
    } finally {
      setIsSearching(false);
    }
  }

  async function handleMatchFeedback(candidate: CandidateProfile, action: 'clicked' | 'shortlisted' | 'skipped') {
    if (!currentOrg.id || !candidate.id || !matchPrompt.trim()) {
      return;
    }

    try {
      await fetch(TALENT_MATCH_FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
        body: JSON.stringify({
          organization_id: currentOrg.id,
          candidate_id: candidate.id,
          search_prompt: matchPrompt,
          action,
        }),
      });
    } catch (error) {
      console.warn('Unable to capture talent match feedback signal:', error);
    }
  }

  async function handleInviteToApply(candidate: CandidateProfile, matchScore: number) {
    if (!candidate.id || candidateInviteState[candidate.id] === 'inviting' || candidateInviteState[candidate.id] === 'invited') {
      return;
    }

    const roleTitle = matchPrompt.trim();
    const workspaceName = sidebarCompanyName || companyName || 'MeliusAI Workspace';

    if (!roleTitle) {
      setUiFeedback({ type: 'error', message: 'Please run the matcher with a role requirement before inviting talent.' });
      return;
    }

    setCandidateInviteState((current) => ({
      ...current,
      [candidate.id]: 'inviting',
    }));

    try {
      const response = await fetch(OPPORTUNITY_CREATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candidate_profile_id: candidate.id,
          company_name: workspaceName,
          role_title: roleTitle,
          match_score: matchScore,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Opportunity invite failed with HTTP ${response.status}.`);
      }

      setCandidateInviteState((current) => ({
        ...current,
        [candidate.id]: 'invited',
      }));
    } catch (error) {
      console.error('Unable to invite matched candidate to apply:', error);
      setCandidateInviteState((current) => {
        const nextState = { ...current };
        delete nextState[candidate.id];
        return nextState;
      });
      setUiFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to invite this candidate right now.',
      });
    }
  }

  async function handleSaveOrganizationProfile() {
    if (!supabase) {
      setProfileSaveState('error');
      setProfileSaveError('Supabase is not configured for this workspace.');
      return;
    }

    if (isWorkspaceContextPending) {
      setProfileSaveState('idle');
      setProfileSaveError(null);
      return;
    }

    if (!currentOrgId) {
      setProfileSaveState('error');
      setProfileSaveError('Unable to identify this organization workspace.');
      return;
    }

    setProfileSaveState('saving');
    setProfileSaveError(null);

    try {
      const { error } = await getOrganizationClient()
        .from('organizations')
        .update({
          bio: bioState,
          linked_profiles: linkedProfilesState,
        })
        .eq('id', currentOrgId);

      if (error) {
        throw new Error(error.message);
      }

      const { data: refreshedOrganization, error: refreshError } = await getOrganizationClient()
        .from('organizations')
        .select('id, company_name, slug, bio, linked_profiles')
        .eq('id', currentOrgId)
        .maybeSingle();

      if (refreshError) {
        console.warn('Organization profile saved, but refresh failed:', refreshError.message);
      }

      if (refreshedOrganization) {
        const refreshedTitle = refreshedOrganization.company_name || companyName;
        const refreshedSlug = refreshedOrganization.slug || workspaceUsername;

        setCompanyName(refreshedTitle);
        setWorkspaceUsername(refreshedSlug);
        setActiveWorkspace({
          id: refreshedOrganization.id,
          title: refreshedTitle,
          slug: refreshedSlug,
        });
        setBioState(refreshedOrganization.bio ?? '');
        setLinkedProfilesState(normalizeLinkedProfiles(refreshedOrganization.linked_profiles));
      }

      setProfileSaveError(null);
      setProfileSaveState('saved');
      window.setTimeout(() => setProfileSaveState('idle'), 1600);
    } catch (error) {
      console.error('Error saving organization profile data:', error);
      setProfileSaveState('error');
      setProfileSaveError(error instanceof Error ? error.message : 'Unable to save organization profile data.');
    }
  }

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!authEnabled || !user) {
      router.replace('/auth/organization');
    }
  }, [authEnabled, loading, router, user]);

  useEffect(() => {
    let active = true;

    async function fetchOrgData() {
      try {
        setIsLoading(true);

        if (!supabase) {
          return;
        }

        const {
          data: { user: activeUser },
          error,
        } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        if (activeUser && active) {
          setCurrentUserId(activeUser.id);
          setActiveWorkspace({
            id: null,
            title: '',
            slug: '',
          });

          const sessionUser = activeUser as typeof activeUser & {
            raw_user_meta_data?: {
              organization_id?: string;
              org_id?: string;
              workspace_id?: string;
              company_name?: string;
              slug?: string;
              org_username?: string;
              bio?: string;
              linked_profiles?: unknown;
            };
          };
          const meta =
            sessionUser.raw_user_meta_data ??
            (sessionUser.user_metadata as
              | {
                  organization_id?: string;
                  org_id?: string;
                  workspace_id?: string;
                  company_name?: string;
                  slug?: string;
                  org_username?: string;
                  bio?: string;
                  linked_profiles?: unknown;
                }
              | undefined);

          const metadataOrganizationId = meta?.organization_id || meta?.org_id || meta?.workspace_id || null;
          const metadataCompanyName = meta?.company_name || 'Verified Organisation';
          const metadataWorkspaceUsername = meta?.slug || meta?.org_username || 'workspace';

          setCompanyName(metadataCompanyName);
          setWorkspaceUsername(metadataWorkspaceUsername);
          setActiveWorkspace({
            id: metadataOrganizationId,
            title: metadataCompanyName,
            slug: metadataWorkspaceUsername,
          });
          setBioState(meta?.bio ?? '');
          setLinkedProfilesState(normalizeLinkedProfiles(meta?.linked_profiles));

          async function resolveOrganizationBy(column: string, value?: string | null) {
            if (!value) {
              return null;
            }

            const { data, error } = await getOrganizationClient()
              .from('organizations')
              .select('id, company_name, slug, bio, linked_profiles')
              .eq(column, value)
              .maybeSingle();

            if (error) {
              console.warn(`Unable to resolve organization by ${column}:`, error.message);
              return null;
            }

            return data;
          }

          const organization =
            (await resolveOrganizationBy('id', metadataOrganizationId)) ||
            (await resolveOrganizationBy('id', activeUser.id)) ||
            (await resolveOrganizationBy('slug', metadataWorkspaceUsername)) ||
            (await resolveOrganizationBy('company_name', metadataCompanyName));

          if (organization && active) {
            const resolvedWorkspaceTitle = organization.company_name || metadataCompanyName;
            const resolvedWorkspaceSlug = organization.slug || metadataWorkspaceUsername;

            setCompanyName(resolvedWorkspaceTitle);
            setWorkspaceUsername(resolvedWorkspaceSlug);
            setActiveWorkspace({
              id: organization.id,
              title: resolvedWorkspaceTitle,
              slug: resolvedWorkspaceSlug,
            });
            setBioState(organization.bio ?? '');
            setLinkedProfilesState(normalizeLinkedProfiles(organization.linked_profiles));
          }
        }
      } catch (err) {
        console.error('Error loading workspace session context:', err);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void fetchOrgData();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    clearPersistedAuthState();
    router.replace('/');
  }
  return (
    <div className="min-h-screen w-full bg-[#060b26] flex flex-col md:flex-row overflow-x-hidden text-slate-100">
      <header className="fixed top-0 left-0 right-0 h-14 bg-[#0a0f29]/90 backdrop-blur-md border-b border-slate-900 flex items-center justify-between px-4 md:hidden z-50">
        <button
          type="button"
          onClick={() => scrollToSection('overview')}
          className="flex items-center gap-2 text-left"
          aria-label="Go to organization overview"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-500/25 bg-purple-950/30 text-[11px] font-bold tracking-widest text-purple-200">
            {sidebarCompanyName ? sidebarCompanyName.substring(0, 2).toUpperCase() : 'HQ'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold tracking-tight text-white">
              {sidebarCompanyName || 'MeliusAI'}
            </span>
            <span className="block text-[10px] font-medium tracking-wide text-slate-500">
              {sidebarWorkspaceUsername ? `@${sidebarWorkspaceUsername}` : 'Workspace'}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => scrollToSection('talent-discovery')}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/50 text-slate-300 transition-all hover:border-purple-400/40 hover:text-white"
          aria-label="Open talent discovery"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 9.5a4 4 0 1 0 5 5L20 20" />
            <path d="M14 5h6v6" />
            <path d="M20 5l-6.5 6.5" />
          </svg>
        </button>
      </header>

      <aside className="hidden md:flex md:w-64 border-r border-slate-800/60 bg-[#060817] flex-col justify-between p-6 h-screen shrink-0">
        <div>
          <div className="mb-10 rounded-2xl border border-slate-800/60 bg-gradient-to-br from-[#191336] via-[#070a1e] to-[#030512] p-4">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/40 text-sm font-bold tracking-widest text-purple-200">
              {sidebarCompanyName ? sidebarCompanyName.substring(0, 2).toUpperCase() : 'HQ'}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Workspace Profile</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-300">
              Verified Organisation
            </p>
            <h1 className="mt-4 truncate text-lg font-semibold tracking-tight text-white">
              {isLoading ? 'Loading...' : sidebarCompanyName}
            </h1>
            {sidebarWorkspaceUsername ? (
              <p className="mt-1 truncate text-[11px] font-medium text-slate-500">@{sidebarWorkspaceUsername}</p>
            ) : null}
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item, index) => {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => scrollToSection(item.targetId)}
                  className="group flex items-center gap-3 rounded-xl p-3 text-left text-sm text-slate-400 transition-all hover:bg-slate-800/40 hover:text-white"
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-800/70 bg-slate-950/50 text-[10px] text-slate-500 transition-colors group-hover:border-purple-400/40 group-hover:text-purple-300"
                  >
                    {index + 1}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-800/60 pt-5">
          <button
            type="button"
            className="w-full rounded-xl p-3 text-left text-sm font-medium text-slate-400 transition-all hover:bg-slate-800/40 hover:text-white"
          >
            Team Settings
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-left text-sm font-medium text-slate-300 transition-all hover:border-purple-400/40 hover:bg-slate-900/70 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main
        className="flex-1 w-full overflow-y-auto px-4 pt-16 pb-24 md:h-screen md:p-8 bg-gradient-to-br from-[#0a0c24] via-[#030512] to-[#030512]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-12 md:gap-10">
          <section id="overview" className="scroll-mt-20 space-y-6 md:scroll-mt-8 md:space-y-8">
            <header className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:rounded-[2rem] md:border-slate-800/60 md:bg-[#060817]/50 md:p-7 md:backdrop-blur-xl">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-purple-300">Enterprise Overview</p>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                    Welcome back, {companyName || 'Organization'}
                  </h2>
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
                    Here is your organization&apos;s talent pipeline tracking metrics for today.
                  </p>
                </div>
              </div>
            </header>

            <div className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:bg-gradient-to-br md:from-[#0c0e2b] md:via-[#05071a] md:to-[#030512] md:border-slate-800/60 md:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-purple-300">
                Company Intelligence
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Company Profile & Mission</h3>
              <textarea
                value={bioState}
                onChange={(event) => {
                  setBioState(event.target.value);
                  setProfileSaveState('idle');
                  setProfileSaveError(null);
                }}
                placeholder="Enter your company bio, creative focus, or structural design philosophy here..."
                className="mt-5 w-full bg-[#040615]/60 border border-slate-800/80 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all resize-none h-28"
              />

              {isWorkspaceContextPending ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="h-3 w-3 animate-spin rounded-full border border-purple-400/20 border-t-purple-300" />
                  Resolving organization workspace...
                </div>
              ) : null}
              {profileSaveError && !isWorkspaceContextPending ? (
                <p className="mt-3 text-xs font-medium text-rose-400">{profileSaveError}</p>
              ) : null}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSaveOrganizationProfile()}
                  disabled={isWorkspaceContextPending || profileSaveState === 'saving'}
                  className="mt-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg px-5 py-2.5 transition-all shadow-lg shadow-purple-900/20 active:scale-[0.98] self-end"
                >
                  {isWorkspaceContextPending
                    ? 'Loading Workspace...'
                    : profileSaveState === 'saving'
                    ? 'Saving...'
                    : profileSaveState === 'saved'
                      ? 'Saved ✓'
                      : 'Save Profile'}
                </button>
              </div>
            </div>
          </section>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800/80 to-transparent" />

          <section id="ai-matcher" className="scroll-mt-20 space-y-6 md:scroll-mt-8">
            <div className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:border-slate-800/60 md:bg-[#060817]/50 md:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-purple-300">AI Matching Engine</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">MeliusAI Matcher Console</h3>
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
                Cross-referencing global creator profiles against your active workspace blueprint requirements.
              </p>

              <form onSubmit={handleRunMatcher} className="mt-6 space-y-4">
                <textarea
                  value={matchPrompt}
                  onChange={(event) => {
                    setMatchPrompt(event.target.value);
                    setUiFeedback({ type: null, message: null });
                  }}
                  placeholder="Describe your ideal candidate requirement specification here... (e.g., 'Looking for a Senior Python backend engineering architect who understands custom database clustering structures')"
                  className="min-h-36 w-full resize-none rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm leading-7 text-white outline-none transition-all placeholder:text-slate-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-slate-500">
                    The matcher scans profile bios, skill tags, and professional descriptors for semantic alignment.
                  </p>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="w-full rounded-xl bg-purple-600 px-5 py-3 text-xs font-bold tracking-wide text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500 active:scale-[0.99] sm:w-auto"
                  >
                    {isSearching ? 'Searching Talent Graph...' : 'Run AI Matcher Algorithm'}
                  </button>
                </div>
              </form>
            </div>

            {isSearching ? (
              <div className="w-full bg-[#0d1533] border border-cyan-500/20 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl text-sm font-semibold text-cyan-300 shadow-[0_0_35px_rgba(34,211,238,0.08)] animate-pulse md:mb-0 md:bg-cyan-950/10">
                MeliusAI Machine Learning Engine mapping profile semantic vectors and optimizing feedback scores... Processing...
              </div>
            ) : null}

            {uiFeedback.type === 'error' && uiFeedback.message ? (
              <div className="w-full bg-[#0d1533] border border-amber-400/30 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:bg-gradient-to-br md:from-amber-950/25 md:via-[#080b1d] md:to-[#030512] md:p-6 md:shadow-[0_0_35px_rgba(245,158,11,0.08)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Search Input Required</p>
                <h4 className="mt-3 text-lg font-semibold text-white">Add clearer recruiter intent to continue.</h4>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-100/80">{uiFeedback.message}</p>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Include role seniority, required tools, domain context, and hard filters such as “fresher TypeScript
                  React dashboard builder” or “experienced Python FastAPI architect”.
                </p>
              </div>
            ) : null}

            {uiFeedback.type !== 'error' && candidates.length > 0 ? (
              <div className="space-y-4">
                {candidates.map((profile, index) => {
                  const compositeMatchPercent = Math.round((profile?.composite_match_index ?? 0) * 100);
                  const vectorMatchPercent = Math.round((profile?.vector_match ?? 0) * 100);
                  const averageProjectMetric = profile?.avg_project_score ?? 0;
                  const username = profile?.username ?? 'profile';
                  const displayName = profile?.full_name?.trim() || `@${username}`;
                  const skills = profile?.skills ?? [];
                  const inviteState = candidateInviteState[profile.id];
                  const inviteDisabled = inviteState === 'inviting' || inviteState === 'invited';

                  return (
                    <div
                      key={profile?.id ?? `candidate-${index}`}
                      className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:border-slate-800/60 md:bg-gradient-to-br md:from-[#0c0e2b] md:via-[#05071a] md:to-[#030512]"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <p className="text-base font-semibold text-white tracking-tight">
                              {displayName} - Composite Match Index: {compositeMatchPercent}%
                            </p>
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {compositeMatchPercent}% Fit
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                            {profile?.aiReasoning ?? profile?.bio ?? 'No profile bio available yet.'}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-900/50 text-slate-300 rounded-md">
                              Vector Context Match: {vectorMatchPercent}%
                            </span>
                            <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-900/50 text-slate-300 rounded-md">
                              Avg Project Metric: {averageProjectMetric}/100
                            </span>
                            {skills.length > 0 ? (
                              skills.slice(0, 5).map((skill) => (
                                <span
                                  key={`${profile?.id ?? index}-${skill}`}
                                  className="text-[11px] font-medium px-2 py-0.5 bg-slate-900/50 text-slate-300 rounded-md"
                                >
                                  {skill}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-900/50 text-slate-500 rounded-md">
                                Skills pending
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-auto">
                          <button
                            type="button"
                            onClick={() => {
                              void handleMatchFeedback(profile, 'clicked');
                              router.push(`/profile/${profile?.username || profile?.id}`);
                            }}
                            className="w-full rounded-xl border border-purple-500/30 bg-purple-950/30 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-purple-100 transition-all hover:border-purple-300/60 hover:text-white lg:w-auto lg:py-2"
                          >
                            Review Profile Dossier
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleInviteToApply(profile, compositeMatchPercent)}
                            disabled={inviteDisabled}
                            className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-emerald-200 transition-all hover:border-emerald-300/50 hover:bg-emerald-500/15 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/60 disabled:text-slate-500 lg:w-auto lg:py-2"
                          >
                            {inviteState === 'invited'
                              ? 'Invited ✓'
                              : inviteState === 'inviting'
                                ? 'Inviting...'
                                : 'Invite to Apply'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {uiFeedback.type === 'info' && uiFeedback.message && !isSearching && candidates.length === 0 ? (
              <div className="w-full bg-[#0d1533] border border-dashed border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl text-center md:mb-0 md:border-slate-800/70 md:bg-[#040615]/40 md:p-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">No Recruiter Matches</p>
                <h4 className="mt-3 text-lg font-semibold text-white">0 talent vectors matched this taxonomy.</h4>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  {uiFeedback.message} Try relaxing required skills, broadening seniority, or adding adjacent tool
                  families to widen the enterprise search surface.
                </p>
              </div>
            ) : null}
          </section>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800/80 to-transparent" />

          <section id="talent-discovery" className="scroll-mt-20 space-y-6 md:scroll-mt-8">
            <div className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:border-slate-800/60 md:bg-[#060817]/50 md:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Talent Discovery</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Workspace Members</h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                Search verified MeliusAI talent profiles by handle or profile link, then review their public profile card.
              </p>

              <div className="mt-6 space-y-4 mb-6">
                {linkedProfilesState.map((member, index) => {
                  const memberUsername =
                    member.profiles?.username ||
                    member.username ||
                    member.profile_link.replace('/profile/', '').replaceAll('/', '').trim();
                  const memberProfileHref = memberUsername ? `/profile/${memberUsername}` : member.profile_link;

                  return (
                    <div
                      key={member.id}
                      className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:flex-row md:items-center md:gap-3 md:rounded-xl md:bg-[#040615]/60 md:p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center overflow-hidden text-xs font-semibold text-slate-300">
                          {getInitials(member.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-white tracking-tight md:text-sm md:font-medium md:text-slate-200">
                            {member.name}
                          </p>
                          <p className="text-xs text-slate-400">{member.role}</p>
                          <a
                            href={memberProfileHref}
                            className="mt-2 inline-block text-xs text-purple-400 hover:text-purple-300 transition-all font-medium underline underline-offset-4"
                          >
                            View MeliusAI Profile
                          </a>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteLinkedProfile(index)}
                        className="mt-4 rounded-xl border border-rose-500/20 bg-rose-950/10 px-4 py-2 text-xs text-rose-400 transition-all hover:text-rose-300 md:mt-0 md:border-transparent md:bg-transparent md:p-2 md:text-rose-500 md:hover:text-rose-400/80"
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
                {linkedProfilesState.length === 0 ? (
                  <div className="w-full bg-[#0d1533] border border-dashed border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl text-center text-xs text-slate-500 md:mb-0 md:border-slate-800/70 md:bg-[#040615]/40">
                    No linked talent profiles yet. Search for a verified MeliusAI user below.
                  </div>
                ) : null}
              </div>

              <div className="w-full bg-[#0d1533] border border-slate-900 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:rounded-xl md:border-slate-800/50 md:bg-[#040615]/40 md:p-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Search Members
                </label>
                <div className="mt-3 flex flex-col gap-3 md:flex-row">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchError('');
                      setSearchResult(null);
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-800/80 bg-[#030512] px-3 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600 focus:border-purple-500/50"
                    placeholder="Enter MeliusAI username or link..."
                  />
                  <button
                    type="button"
                    onClick={handleSearchMember}
                    disabled={isAdding}
                    className="rounded-lg bg-purple-600 px-5 py-2.5 text-xs font-medium text-white transition-all hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500"
                  >
                    {isAdding ? 'Searching...' : 'Search Member'}
                  </button>
                </div>
                {searchError ? <p className="mt-2 text-xs font-medium text-rose-500">{searchError}</p> : null}
              </div>

              {isModalOpen && searchResult ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                  <div className="relative w-full max-w-md rounded-3xl border border-slate-800/70 bg-slate-950 p-6 text-center shadow-xl shadow-purple-950/30">
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        setSearchResult(null);
                      }}
                      className="absolute right-4 top-4 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-slate-400 transition-all hover:border-slate-700 hover:text-white"
                    >
                      X
                    </button>
                    <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-purple-500/30 bg-slate-900 text-lg font-bold text-purple-200">
                      {searchResult.avatar_url ? (
                        <img
                          src={searchResult.avatar_url}
                          alt={searchResult.username || 'MeliusAI member'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(searchResult.full_name || searchResult.username || 'Member')
                      )}
                    </div>
                    <h4 className="mt-5 text-lg font-semibold tracking-tight text-white">
                      {searchResult.full_name || searchResult.username || 'Verified Member'}
                    </h4>
                    <p className="mt-1 text-sm font-medium text-purple-300">@{searchResult.username || 'unknown'}</p>
                    <button
                      type="button"
                      onClick={() => searchResult && linkVerifiedMember(searchResult)}
                      className="mt-6 w-full rounded-xl bg-purple-600 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500 active:scale-[0.99]"
                    >
                      Add to Workspace Members
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0a0f29]/95 backdrop-blur-lg border-t border-slate-900 grid grid-cols-5 items-center justify-center md:hidden z-50 pb-safe">
        {mobileNavItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => scrollToSection(item.targetId)}
            className="flex h-full flex-col items-center justify-center text-slate-500 transition-colors hover:text-white"
          >
            <span className="text-slate-300">
              <MobileNavIcon icon={item.icon} />
            </span>
            <span className="text-[10px] font-medium mt-1 tracking-wide">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
