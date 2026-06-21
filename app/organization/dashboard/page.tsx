'use client';

import { Suspense, useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Compass, Cpu, Info, LayoutDashboard, MessageSquare, Search, type LucideIcon } from 'lucide-react';

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

interface CandidateProfile {
  id: string;
  full_name?: string;
  username: string;
  role_title?: string;
  bio: string;
  skills: string[];
  extracted_experience: string[];
  extracted_preferences: string[];
  avg_project_score: number;
  vector_match: number;
  composite_match_index: number;
  matchScore?: number;
  aiReasoning?: string;
}

type ActiveWorkspaceContext = {
  id: string | null;
  title: string;
  slug: string;
};

type DashboardTab = 'overview' | 'ai-matcher' | 'talent-discovery' | 'messages';

type OrganizationMessage = {
  id: string;
  body: string;
  sentAt: string;
};

const navItems: Array<{
  label: string;
  href: string;
  icon: LucideIcon;
  targetId?: DashboardTab;
}> = [
  { label: 'Overview', href: '/organization/dashboard', icon: LayoutDashboard, targetId: 'overview' },
  { label: 'AI Matcher', href: '/organization/dashboard?tab=matcher', icon: Cpu, targetId: 'ai-matcher' },
  { label: 'Talent Discovery', href: '/organization/talent-discovery', icon: Compass, targetId: 'talent-discovery' },
  { label: 'Search', href: '/organization/search', icon: Search },
  { label: 'Manifesto', href: '/organization/about', icon: Info },
];

const mobileNavItems: Array<{
  label: string;
  targetId: DashboardTab;
  icon: 'overview' | 'spark' | 'talent' | 'settings';
}> = [
  { label: 'Home', targetId: 'overview', icon: 'overview' },
  { label: 'Match', targetId: 'ai-matcher', icon: 'spark' },
  { label: 'Talent', targetId: 'talent-discovery', icon: 'talent' },
  { label: 'Profile', targetId: 'overview', icon: 'settings' },
];

const TALENT_MATCH_FEEDBACK_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/match-feedback`;

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
  const roleTitle =
    typeof row.role_title === 'string'
      ? row.role_title.trim()
      : typeof row.role === 'string'
        ? row.role.trim()
        : typeof row.current_status === 'string'
          ? row.current_status.trim()
        : '';
  const vectorMatch = normalizeDecimalMatch(row.vector_match ?? row.semantic_similarity ?? row.similarity);
  const compositeMatchIndex = normalizeDecimalMatch(
    row.composite_match_index ?? row.matchScore ?? row.match_index ?? row.match_score ?? row.score
  );
  const matchScore = getNumberValue(row.matchScore ?? row.match_index ?? compositeMatchIndex * 100, 0);

  return {
    id,
    full_name: typeof row.full_name === 'string' ? row.full_name : undefined,
    username,
    role_title: roleTitle || undefined,
    bio,
    skills: normalizeSkills(row.skills ?? row.tags),
    extracted_experience: normalizeSkills(row.extracted_experience),
    extracted_preferences: normalizeSkills(row.extracted_preferences),
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

function OrganizationDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const recipientId = searchParams.get('recipientId')?.trim() ?? '';
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
  const [orgEmail, setOrgEmail] = useState<string>('');
  const [linkedProfilesState, setLinkedProfilesState] = useState<OrganizationLinkedProfile[]>([]);
  const [profileSaveState, setProfileSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [matcherQuery, setMatcherQuery] = useState('Looking for a ui ux designer who is good at typescript');
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [matches, setMatches] = useState<CandidateProfile[]>([]);
  const [isCandidatePoolLoading, setIsCandidatePoolLoading] = useState(true);
  const [candidatePoolError, setCandidatePoolError] = useState('');
  const [isMatching, setIsMatching] = useState(false);
  const [searchError, setSearchError] = useState<string>('');
  const [hasRunMatcher, setHasRunMatcher] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [messageDraft, setMessageDraft] = useState('');
  const [messageThreads, setMessageThreads] = useState<Record<string, OrganizationMessage[]>>({});
  const sidebarCompanyName = activeWorkspace.title || companyName;
  const sidebarWorkspaceUsername = activeWorkspace.slug || workspaceUsername;
  const currentOrg = activeWorkspace;
  const currentOrgId = activeWorkspace.id;
  const isWorkspaceContextPending = loading || isLoading;
  const messageRecipients = Array.from(
    new Map(
      [
        ...candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.full_name?.trim() || `@${candidate.username}`,
          username: candidate.username,
        })),
        ...linkedProfilesState.map((profile) => ({
          id: profile.id,
          name: profile.name,
          username:
            profile.profiles?.username ||
            profile.username ||
            profile.profile_link.replace('/profile/', '').replaceAll('/', '').trim(),
        })),
      ].map((recipient) => [recipient.id, recipient])
    ).values()
  );
  const selectedRecipient = messageRecipients.find((recipient) => recipient.id === recipientId) ?? null;
  const selectedRecipientName = selectedRecipient?.name || (recipientId ? 'Selected Candidate' : 'No candidate selected');
  const activeMessageThread = recipientId ? messageThreads[recipientId] ?? [] : [];

  function scrollToSection(targetId: DashboardTab) {
    setActiveTab(targetId);

    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  async function handleSearchTalent(event?: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) {
    if (event) {
      event.preventDefault();
    }

    setSearchError('');
    const prompt = matcherQuery.trim();

    if (!prompt) {
      setSearchError('Search input required. Add clearer recruiter intent to continue.');
      return;
    }

    setIsMatching(true);
    setIsCandidatePoolLoading(false);
    setCandidatePoolError('');
    setHasRunMatcher(true);

    try {
      const targetUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com';
      const cleanUrl = targetUrl.replace(/\/$/, '');
      console.log('Initiating network payload stream out to:', targetUrl);

      const response = await fetch(`${cleanUrl}/api/match-talent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: matcherQuery.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status code ${response.status}`);
      }

      const data = await response.json();
      const rawCandidates = Array.isArray(data)
        ? data
        : Array.isArray(data?.candidates)
          ? data.candidates
          : Array.isArray(data?.ranked_candidates)
            ? data.ranked_candidates
            : [];
      const normalizedCandidates = rawCandidates
        .map((candidate: unknown) => normalizeCandidateProfile(candidate))
        .filter((candidate: CandidateProfile | null): candidate is CandidateProfile => Boolean(candidate));

      console.log('Candidates payload pulled successfully:', data);
      setMatches(normalizedCandidates);
      setCandidates(normalizedCandidates);
    } catch (err) {
      console.error('Caught search routine exception:', err);
      let errorMessage = '';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else {
        try {
          errorMessage = JSON.stringify(err) || String(err);
        } catch {
          errorMessage = String(err);
        }
      }

      setSearchError(errorMessage || 'Failed to successfully connect to our semantic match server.');
      setMatches([]);
    } finally {
      setIsMatching(false);
    }
  }

  async function handleMatchFeedback(candidate: CandidateProfile, action: 'clicked' | 'shortlisted' | 'skipped') {
    if (!currentOrg.id || !candidate.id || !matcherQuery.trim()) {
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
          search_prompt: matcherQuery,
          action,
        }),
      });
    } catch (error) {
      console.warn('Unable to capture talent match feedback signal:', error);
    }
  }

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextMessage = messageDraft.trim();
    if (!recipientId || !nextMessage) {
      return;
    }

    setMessageThreads((currentThreads) => ({
      ...currentThreads,
      [recipientId]: [
        ...(currentThreads[recipientId] ?? []),
        {
          id: `${recipientId}-${Date.now()}`,
          body: nextMessage,
          sentAt: new Date().toISOString(),
        },
      ],
    }));
    setMessageDraft('');
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

    const normalizedOrgEmail = orgEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedOrgEmail)) {
      setProfileSaveState('error');
      setProfileSaveError('Enter a valid hiring contact email.');
      return;
    }

    setProfileSaveState('saving');
    setProfileSaveError(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        throw new Error('Your organization session has expired. Please sign in again.');
      }

      const loggedInUserId = session.user.id || user?.id || currentUserId;
      if (!loggedInUserId) {
        throw new Error('Unable to resolve the authenticated organization account. Please sign in again.');
      }

      const normalizedCompanyName = companyName.trim();
      const profileUpdate = {
        mission_text: bioState.trim(),
        company_name: normalizedCompanyName,
        company_email: normalizedOrgEmail,
      };

      const { data: userRows, error: userLookupError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', loggedInUserId)
        .limit(1);

      if (userLookupError) {
        throw userLookupError;
      }

      let existingOrganization = userRows && userRows.length > 0 ? userRows[0] : null;
      if (!existingOrganization) {
        const { data: companyRows, error: companyLookupError } = await supabase
          .from('organizations')
          .select('id')
          .ilike('company_name', normalizedCompanyName)
          .limit(1);

        if (companyLookupError) {
          throw companyLookupError;
        }
        existingOrganization = companyRows && companyRows.length > 0 ? companyRows[0] : null;
      }

      let updatedOrganization;
      if (existingOrganization?.id) {
        const { data: updatedRows, error: updateError } = await supabase
          .from('organizations')
          .update({
            ...profileUpdate,
            user_id: loggedInUserId,
          })
          .eq('id', existingOrganization.id)
          .select('id, company_name, mission_text, company_email')
          .limit(1);

        if (updateError) {
          throw updateError;
        }
        if (!updatedRows || updatedRows.length === 0) {
          throw new Error('The organization row could not be returned after updating.');
        }
        updatedOrganization = updatedRows[0];
      } else {
        const { data: insertedRows, error: insertError } = await supabase
          .from('organizations')
          .insert([
            {
              ...profileUpdate,
              user_id: loggedInUserId,
            },
          ])
          .select('id, company_name, mission_text, company_email')
          .limit(1);

        if (insertError) {
          throw insertError;
        }
        if (!insertedRows || insertedRows.length === 0) {
          throw new Error('The organization row could not be returned after inserting.');
        }
        updatedOrganization = insertedRows[0];
      }

      const updatedCompanyName = updatedOrganization?.company_name?.trim() || normalizedCompanyName;
      setCompanyName(updatedCompanyName);
      setBioState(updatedOrganization?.mission_text ?? bioState);
      setOrgEmail(updatedOrganization?.company_email ?? normalizedOrgEmail);
      setActiveWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        id: updatedOrganization?.id ?? currentWorkspace.id,
        title: updatedCompanyName,
      }));

      setProfileSaveError(null);
      setProfileSaveState('saved');
      window.setTimeout(() => setProfileSaveState('idle'), 1600);
    } catch (err: any) {
      console.error('Direct save failed:', err);
      const rawMessage =
        err?.message ||
        err?.error_description ||
        (typeof err === 'object' ? JSON.stringify(err) : String(err));
      setProfileSaveState('error');
      setProfileSaveError(rawMessage);
    }
  }

  useEffect(() => {
    if (requestedTab === 'matcher') {
      setActiveTab('ai-matcher');
      return;
    }

    setActiveTab('overview');

    if (requestedTab === 'messages') {
      router.replace('/organization/dashboard', { scroll: false });
    }
  }, [requestedTab, router]);

  useEffect(() => {
    if (loading || hasRunMatcher) {
      return;
    }

    let active = true;

    async function loadCandidatePool() {
      setIsCandidatePoolLoading(true);
      setCandidatePoolError('');

      try {
        if (!supabase) {
          throw new Error('Candidate search is unavailable because Supabase is not configured.');
        }

        const { data, error } = await supabase
          .from('profiles')
          .select(
            'id, full_name, username, bio, skills, extracted_experience, extracted_preferences, avg_project_score, current_status'
          )
          .order('avg_project_score', { ascending: false });

        if (error) {
          throw error;
        }

        const normalizedCandidates = (data ?? [])
          .map((candidate: unknown) => normalizeCandidateProfile(candidate))
          .filter((candidate): candidate is CandidateProfile => candidate !== null);

        if (active) {
          setCandidates(normalizedCandidates);
        }
      } catch (error) {
        if (active) {
          setCandidatePoolError(
            error instanceof Error ? error.message : 'Unable to load candidate profiles.'
          );
        }
      } finally {
        if (active) {
          setIsCandidatePoolLoading(false);
        }
      }
    }

    void loadCandidatePool();

    return () => {
      active = false;
    };
  }, [hasRunMatcher, loading, supabase]);

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
              org_email?: string;
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
                  org_email?: string;
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
          setOrgEmail(meta?.org_email ?? activeUser.email ?? '');
          setLinkedProfilesState(normalizeLinkedProfiles(meta?.linked_profiles));

          const { data: userOrganizationRows, error: userOrganizationError } = await supabase
            .from('organizations')
            .select('*')
            .eq('user_id', activeUser.id)
            .limit(1);

          if (userOrganizationError) {
            throw userOrganizationError;
          }

          let organization =
            userOrganizationRows && userOrganizationRows.length > 0 ? userOrganizationRows[0] : null;

          if (!organization) {
            const { data: companyOrganizationRows, error: companyOrganizationError } = await supabase
              .from('organizations')
              .select('*')
              .ilike('company_name', metadataCompanyName)
              .limit(1);

            if (companyOrganizationError) {
              throw companyOrganizationError;
            }

            organization =
              companyOrganizationRows && companyOrganizationRows.length > 0
                ? companyOrganizationRows[0]
                : null;
          }

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
            setBioState(organization.mission_text ?? organization.bio ?? '');
            setOrgEmail(
              organization.company_email ??
                organization.contact_email ??
                organization.org_email ??
                meta?.org_email ??
                activeUser.email ??
                ''
            );
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
            {navItems.map((item) => {
              const Icon = item.icon;
              const isDashboardRoute = pathname === '/organization/dashboard';
              const isActive =
                item.href === '/organization/dashboard'
                  ? isDashboardRoute && activeTab === 'overview'
                  : item.href === '/organization/dashboard?tab=matcher'
                    ? isDashboardRoute && activeTab === 'ai-matcher'
                    : pathname === item.href || (isDashboardRoute && item.targetId ? activeTab === item.targetId : false);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => {
                    if (item.targetId) {
                      setActiveTab(item.targetId);
                    }
                  }}
                  className={`group flex items-center gap-3 rounded-xl p-3 text-left text-sm transition-all hover:bg-slate-800/40 hover:text-white ${
                    isActive ? 'bg-slate-800/60 text-white font-medium' : 'text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-3 text-slate-400 group-hover:text-purple-400 transition-colors" />
                  {item.label}
                </Link>
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
        className="flex-1 overflow-y-auto h-screen p-8 space-y-8 CustomScrollbar bg-gradient-to-br from-[#0a0c24] via-[#030512] to-[#030512]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-12 md:gap-10">
          {activeTab !== 'messages' ? (
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

              <label className="mt-5 block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Hiring Contact Email
                </span>
                <input
                  type="email"
                  value={orgEmail}
                  onChange={(event) => {
                    setOrgEmail(event.target.value);
                    setProfileSaveState('idle');
                    setProfileSaveError(null);
                  }}
                  placeholder="e.g., careers@meliusai.in"
                  autoComplete="email"
                  className="mt-2 w-full rounded-xl border border-slate-800/80 bg-[#040615]/60 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
                />
              </label>

              {isWorkspaceContextPending ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="h-3 w-3 animate-spin rounded-full border border-purple-400/20 border-t-purple-300" />
                  Resolving organization workspace...
                </div>
              ) : null}
              {profileSaveError && !isWorkspaceContextPending ? (
                <p className="mt-3 text-xs font-medium text-rose-400">{profileSaveError}</p>
              ) : null}
              {profileSaveState === 'saved' ? (
                <p
                  className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-100"
                  role="status"
                >
                  Organization profile and hiring contact updated successfully.
                </p>
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
                      : 'Save Profile Details'}
                </button>
              </div>
            </div>
          </section>
          ) : null}

          {activeTab !== 'messages' ? (
            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800/80 to-transparent" />
          ) : null}

          {activeTab !== 'messages' && searchError ? (            <div className="w-full bg-[#0d1533] border border-amber-400/30 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl md:mb-0 md:bg-gradient-to-br md:from-amber-950/25 md:via-[#080b1d] md:to-[#030512] md:p-6 md:shadow-[0_0_35px_rgba(245,158,11,0.08)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">Matcher Notice</p>
              <h4 className="mt-3 text-lg font-semibold text-white">The talent search needs a clean signal.</h4>
              <div className="mt-2 max-w-3xl text-sm leading-6 text-red-400">{String(searchError)}</div>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Include role seniority, required tools, domain context, and hard filters such as “fresher TypeScript
                React dashboard builder” or “experienced Python FastAPI architect”.
              </p>
            </div>
          ) : null}

          {activeTab !== 'messages' && isMatching ? (
            <div className="w-full bg-[#0d1533] border border-cyan-500/20 rounded-2xl p-5 mb-4 flex flex-col justify-between shadow-xl text-sm font-semibold text-cyan-300 shadow-[0_0_35px_rgba(34,211,238,0.08)] animate-pulse md:mb-0 md:bg-cyan-950/10">
              MeliusAI Machine Learning Engine mapping profile semantic vectors and optimizing feedback scores... Processing...
            </div>
          ) : null}

          {activeTab !== 'messages' ? (
            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800/80 to-transparent" />
          ) : null}


          {activeTab === 'messages' ? (
            <section id="messages" className="scroll-mt-20 space-y-6 md:scroll-mt-8">
              <div className="w-full rounded-2xl border border-slate-800/60 bg-[#060817]/50 p-6 shadow-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-purple-300">Messages</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">Candidate Communication Center</h3>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
                  Continue directly from talent matching into a focused conversation with the selected candidate.
                </p>

                <div className="mt-6 grid min-h-[520px] overflow-hidden rounded-2xl border border-slate-800/70 bg-gradient-to-br from-[#0c0e2b] via-[#05071a] to-[#030512] lg:grid-cols-[280px_minmax(0,1fr)]">
                  <aside className="border-b border-slate-800/70 p-4 lg:border-b-0 lg:border-r">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Candidate Channels</p>
                    <div className="mt-3 space-y-2">
                      {messageRecipients.length > 0 ? (
                        messageRecipients.map((recipient) => (
                          <Link
                            key={recipient.id}
                            href={`/organization/dashboard?tab=messages&recipientId=${encodeURIComponent(recipient.id)}`}
                            className={`block rounded-xl border px-3 py-3 transition-all ${
                              recipient.id === recipientId
                                ? 'border-purple-500/40 bg-purple-950/30 text-white'
                                : 'border-slate-800/70 bg-slate-950/30 text-slate-400 hover:border-purple-500/25 hover:text-white'
                            }`}
                          >
                            <p className="truncate text-sm font-semibold">{recipient.name}</p>
                            {recipient.username ? (
                              <p className="mt-1 truncate text-[11px] text-slate-500">@{recipient.username}</p>
                            ) : null}
                          </Link>
                        ))
                      ) : (
                        <p className="rounded-xl border border-dashed border-slate-800/70 p-4 text-xs leading-5 text-slate-500">
                          Run the AI Matcher and choose “MESSAGE THEM” to open a candidate channel.
                        </p>
                      )}
                    </div>
                  </aside>

                  <div className="flex min-h-[520px] flex-col">
                    <header className="border-b border-slate-800/70 px-5 py-4">
                      <p className="text-sm font-semibold text-white">{selectedRecipientName}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {recipientId ? 'Direct candidate conversation' : 'Select a candidate channel to begin'}
                      </p>
                    </header>

                    <div className="flex-1 space-y-3 overflow-y-auto p-5">
                      {activeMessageThread.length > 0 ? (
                        activeMessageThread.map((message) => (
                          <div key={message.id} className="flex justify-end">
                            <div className="max-w-[80%] rounded-2xl rounded-br-md border border-purple-500/30 bg-purple-950/30 px-4 py-3">
                              <p className="text-sm leading-6 text-slate-100">{message.body}</p>
                              <p className="mt-2 text-right text-[10px] text-slate-500">
                                {new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex h-full min-h-64 items-center justify-center text-center">
                          <div>
                            <MessageSquare className="mx-auto h-8 w-8 text-purple-300" strokeWidth={1.5} />
                            <p className="mt-4 text-sm font-semibold text-slate-300">No messages in this channel yet.</p>
                            <p className="mt-2 text-xs text-slate-500">Send a concise introduction to start the conversation.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleSendMessage} className="border-t border-slate-800/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <textarea
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          disabled={!recipientId}
                          placeholder={recipientId ? 'Write a message to this candidate...' : 'Select a candidate first'}
                          className="min-h-24 flex-1 resize-none rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm leading-6 text-white outline-none transition-all placeholder:text-slate-600 focus:border-purple-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={!recipientId || !messageDraft.trim()}
                          className="rounded-xl border border-purple-500/30 bg-purple-950/30 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-purple-100 transition-all hover:border-purple-300/60 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/60 disabled:text-slate-600"
                        >
                          Send Message
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0a0f29]/95 backdrop-blur-lg border-t border-slate-900 grid grid-cols-4 items-center justify-center md:hidden z-50 pb-safe">
        {mobileNavItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => scrollToSection(item.targetId)}
            className={`flex h-full flex-col items-center justify-center transition-colors hover:text-white ${
              activeTab === item.targetId ? 'text-white' : 'text-slate-500'
            }`}
          >
            <span className={activeTab === item.targetId ? 'text-purple-300' : 'text-slate-300'}>
              <MobileNavIcon icon={item.icon} />
            </span>
            <span className="text-[10px] font-medium mt-1 tracking-wide">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function OrganizationDashboard() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#060b26] text-slate-400">
          <p className="text-sm">Loading organization workspace...</p>
        </main>
      }
    >
      <OrganizationDashboardContent />
    </Suspense>
  );
}
