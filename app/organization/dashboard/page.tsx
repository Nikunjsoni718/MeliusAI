'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { useViewerProfile } from '@/lib/viewer-client';

type ActiveTab = 'overview' | 'ai_matcher';

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

type OrganizationInvitation = {
  id: string;
  organization_id: string;
  invited_profile_id: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'declined' | 'expired' | string;
  created_at?: string | null;
  expires_at?: string | null;
  profile?: MemberSearchUser | null;
  organization?: {
    id?: string | null;
    company_name?: string | null;
    org_username?: string | null;
    display_name?: string | null;
  } | null;
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

type OrganizationRecord = {
  id: string | null;
  company_name?: string | null;
  org_username?: string | null;
  bio: string | null;
  linked_profiles: unknown;
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
  tab: ActiveTab | null;
}> = [
  { label: 'Overview', tab: 'overview' },
  { label: 'AI Matcher', tab: 'ai_matcher' },
  { label: 'AI Scrutiny Hub', tab: null },
  { label: 'Talent Discovery', tab: null },
];

const MEMBER_SEARCH_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/search-member`;
const INVITE_MEMBER_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/invite-member`;
const ORGANIZATION_INVITATIONS_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/organization-invitations`;
const CANCEL_INVITATION_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/cancel-invitation`;
const MY_PENDING_INVITATIONS_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/my-pending-invitations`;
const RESPOND_INVITATION_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL}/api/respond-invitation`;

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

export default function OrganizationDashboard() {
  const router = useRouter();
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null);
  const [organizationRecord, setOrganizationRecord] = useState<OrganizationRecord | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [workspaceUsername, setWorkspaceUsername] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [bioState, setBioState] = useState<string>('');
  const [linkedProfilesState, setLinkedProfilesState] = useState<OrganizationLinkedProfile[]>([]);
  const [profileSaveState, setProfileSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MemberSearchUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [memberPanelTab, setMemberPanelTab] = useState<'members' | 'invitations'>('members');
  const [invitationError, setInvitationError] = useState('');
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<OrganizationInvitation | null>(null);
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [inviteResponseLoading, setInviteResponseLoading] = useState(false);
  const [inviteResponseMessage, setInviteResponseMessage] = useState('');
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  // The sidebar and invitation pipeline share this active organization row.
  const activeOrganization = organizationRecord;
  const resolvedOrganizationId = activeOrganization?.id || currentOrganizationId;

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

  function getInvitationStatusClass(status: string) {
    if (status === 'accepted') {
      return 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300';
    }

    if (status === 'pending') {
      return 'border-amber-500/30 bg-amber-950/30 text-amber-300';
    }

    return 'border-rose-500/30 bg-rose-950/30 text-rose-300';
  }

  function getInvitationTimeRemaining(expiresAt?: string | null) {
    if (!expiresAt) {
      return 'Expiration unavailable';
    }

    const expiresTime = new Date(expiresAt).getTime();

    if (Number.isNaN(expiresTime)) {
      return 'Expiration unavailable';
    }

    const remainingMs = expiresTime - currentTimeMs;

    if (remainingMs <= 0) {
      return 'Expired';
    }

    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
      return `${minutes}m remaining`;
    }

    return `${hours}h ${minutes}m remaining`;
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

  const fetchInvitations = useCallback(async () => {
    if (!resolvedOrganizationId) {
      return;
    }

    setInvitationLoading(true);
    setInvitationError('');

    try {
      const response = await fetch(
        `${ORGANIZATION_INVITATIONS_ENDPOINT}?organization_id=${encodeURIComponent(resolvedOrganizationId)}`,
      );
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        invitations?: OrganizationInvitation[];
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Invitation fetch failed with status ${response.status}.`);
      }

      setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
    } catch (error) {
      console.error('Unable to load organization invitations:', error);
      setInvitationError(error instanceof Error ? error.message : 'Unable to load invitations.');
    } finally {
      setInvitationLoading(false);
    }
  }, [resolvedOrganizationId]);

  const fetchIncomingInvitations = useCallback(async () => {
    if (!currentUserId) {
      return;
    }

    try {
      const response = await fetch(
        `${MY_PENDING_INVITATIONS_ENDPOINT}?profile_id=${encodeURIComponent(currentUserId)}`,
      );
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        invitations?: OrganizationInvitation[];
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Pending invitation fetch failed with status ${response.status}.`);
      }

      const firstPendingInvite = Array.isArray(data.invitations) ? data.invitations[0] : null;

      if (firstPendingInvite) {
        setIncomingInvite(firstPendingInvite);
        setShowInvitePopup(true);
      } else {
        setIncomingInvite(null);
        setShowInvitePopup(false);
      }
    } catch (error) {
      console.error('Unable to load incoming organization invitations:', error);
    }
  }, [currentUserId]);

  async function handleSendInvitationToWorkspace() {
    // Organization validation belongs only to the modal invitation action.
    const currentOrganizationIdForInvite = resolvedOrganizationId;

    if (!currentOrganizationIdForInvite) {
      setSearchError(
        'Error: No active organization ID found to tie this invitation to. Refresh the dashboard after the workspace finishes loading, then try again.',
      );
      return;
    }

    if (!searchResult?.id) {
      setSearchError('Unable to send invitation without a verified profile.');
      return;
    }

    setIsAdding(true);
    setSearchError('');

    try {
      const response = await fetch(INVITE_MEMBER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: currentOrganizationIdForInvite,
          invited_profile_id: searchResult.id,
        }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Invitation failed with status ${response.status}.`);
      }

      setIsModalOpen(false);
      setSearchResult(null);
      setSearchQuery('');
      setMemberPanelTab('invitations');
      await fetchInvitations();
    } catch (error) {
      console.error('Unable to dispatch organization invitation:', error);
      setSearchError(error instanceof Error ? error.message : 'Unable to send invitation.');
    } finally {
      setIsAdding(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setInvitationError('');

    try {
      const response = await fetch(CANCEL_INVITATION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: invitationId }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Cancellation failed with status ${response.status}.`);
      }

      await fetchInvitations();
    } catch (error) {
      console.error('Unable to cancel invitation:', error);
      setInvitationError(error instanceof Error ? error.message : 'Unable to cancel invitation.');
    }
  }

  async function handleRespondToIncomingInvitation(responseValue: 'yes' | 'no') {
    if (!incomingInvite?.id) {
      return;
    }

    setInviteResponseLoading(true);
    setInviteResponseMessage('');

    try {
      const response = await fetch(RESPOND_INVITATION_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitation_id: incomingInvite.id,
          response: responseValue,
        }),
      });
      const data = (await response.json()) as { success?: boolean; message?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Invitation response failed with status ${response.status}.`);
      }

      setShowInvitePopup(false);
      setIncomingInvite(null);

      if (responseValue === 'yes') {
        setInviteResponseMessage(data.message || 'Successfully joined the organization!');
        await fetchInvitations();
      }
    } catch (error) {
      console.error('Unable to respond to incoming invitation:', error);
      setInviteResponseMessage(error instanceof Error ? error.message : 'Unable to respond to invitation.');
    } finally {
      setInviteResponseLoading(false);
    }
  }

  async function handleSaveOrganizationProfile() {
    if (!supabase) {
      setProfileSaveState('error');
      setProfileSaveError('Supabase is not configured for this workspace.');
      return;
    }

    if (!currentUserId) {
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
        .eq('id', currentUserId);

      if (error) {
        throw new Error(error.message);
      }

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
          setCurrentOrganizationId(null);
          setOrganizationRecord(null);

          const sessionUser = activeUser as typeof activeUser & {
            raw_user_meta_data?: {
              company_name?: string;
              org_username?: string;
              bio?: string;
              linked_profiles?: unknown;
            };
          };
          const meta =
            sessionUser.raw_user_meta_data ??
            (sessionUser.user_metadata as
              | {
                  company_name?: string;
                  org_username?: string;
                  bio?: string;
                  linked_profiles?: unknown;
                }
              | undefined);

          const metadataCompanyName = meta?.company_name || 'Verified Organisation';
          const metadataWorkspaceUsername = meta?.org_username || 'workspace';

          setCompanyName(metadataCompanyName);
          setWorkspaceUsername(metadataWorkspaceUsername);
          setBioState(meta?.bio ?? '');
          setLinkedProfilesState(normalizeLinkedProfiles(meta?.linked_profiles));

          async function resolveOrganizationBy(column: string, value?: string | null) {
            if (!value) {
              return null;
            }

            const { data, error } = await getOrganizationClient()
              .from('organizations')
              .select('id, company_name, org_username, bio, linked_profiles')
              .eq(column, value)
              .maybeSingle();

            if (error) {
              console.warn(`Unable to resolve organization by ${column}:`, error.message);
              return null;
            }

            return data;
          }

          const organization =
            (await resolveOrganizationBy('id', activeUser.id)) ||
            (await resolveOrganizationBy('org_username', metadataWorkspaceUsername)) ||
            (await resolveOrganizationBy('username', metadataWorkspaceUsername)) ||
            (await resolveOrganizationBy('slug', metadataWorkspaceUsername)) ||
            (await resolveOrganizationBy('company_name', metadataCompanyName));

          if (organization && active) {
            setCurrentOrganizationId(organization.id);
            setOrganizationRecord(organization);
            setCompanyName(organization.company_name || metadataCompanyName);
            setWorkspaceUsername(organization.org_username || metadataWorkspaceUsername);
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

  useEffect(() => {
    void fetchInvitations();
  }, [fetchInvitations]);

  useEffect(() => {
    void fetchIncomingInvitations();
  }, [fetchIncomingInvitations]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    clearPersistedAuthState();
    router.replace('/');
  }
  return (
    <div className="flex min-h-screen w-full bg-[#030512] text-slate-100 overflow-hidden">
      <aside className="w-64 border-r border-slate-800/60 bg-[#060817] flex flex-col justify-between p-6 h-screen shrink-0">
        <div>
          <div className="mb-10 rounded-2xl border border-slate-800/60 bg-gradient-to-br from-[#191336] via-[#070a1e] to-[#030512] p-4">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-950/40 text-sm font-bold tracking-widest text-purple-200">
              {companyName ? companyName.substring(0, 2).toUpperCase() : 'HQ'}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Workspace Profile</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-300">
              Verified Organisation
            </p>
            <h1 className="mt-4 truncate text-lg font-semibold tracking-tight text-white">
              {isLoading ? 'Loading...' : companyName}
            </h1>
            {workspaceUsername ? (
              <p className="mt-1 truncate text-[11px] font-medium text-slate-500">@{workspaceUsername}</p>
            ) : null}
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map((item, index) => {
              const isActive = item.tab === activeTab;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.tab) {
                      setActiveTab(item.tab);
                    }
                  }}
                  className={`group flex items-center gap-3 rounded-xl p-3 text-left text-sm transition-all hover:bg-slate-800/40 hover:text-white ${
                    isActive ? 'bg-slate-800/60 text-white font-medium' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border text-[10px] transition-colors group-hover:border-purple-400/40 group-hover:text-purple-300 ${
                      isActive
                        ? 'border-purple-400/40 bg-purple-950/30 text-purple-200'
                        : 'border-slate-800/70 bg-slate-950/50 text-slate-500'
                    }`}
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

      <main className="flex-1 h-screen overflow-y-auto bg-gradient-to-br from-[#0a0c24] via-[#030512] to-[#030512] p-8 md:p-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <header className="rounded-[2rem] border border-slate-800/60 bg-[#060817]/50 p-7 backdrop-blur-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-purple-300">Enterprise Overview</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Welcome back, {companyName || 'Organization'}
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              Here is your organization&apos;s talent pipeline tracking metrics for today.
            </p>
            {inviteResponseMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 text-xs font-medium text-emerald-300">
                {inviteResponseMessage}
              </p>
            ) : null}
          </header>

          {activeTab === 'overview' ? (
            <section className="space-y-6">
              <div className="bg-gradient-to-br from-[#0c0e2b] via-[#05071a] to-[#030512] border border-slate-800/60 rounded-2xl p-6">
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

              

                {profileSaveError ? (
                  <p className="mt-3 text-xs font-medium text-rose-400">{profileSaveError}</p>
                ) : null}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleSaveOrganizationProfile()}
                    disabled={profileSaveState === 'saving'}
                    className="mt-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg px-5 py-2.5 transition-all shadow-lg shadow-purple-900/20 active:scale-[0.98] self-end"
                  >
                    {profileSaveState === 'saving'
                      ? 'Saving...'
                      : profileSaveState === 'saved'
                        ? 'Saved ✓'
                        : 'Save Profile'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col space-y-6 w-full">
                <div className="rounded-2xl border border-slate-800/60 bg-[#060817]/50 p-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Workspace Members</p>

                  <div className="mt-5 flex flex-col gap-2 rounded-xl border border-slate-800/50 bg-[#040615]/40 p-1.5 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setMemberPanelTab('members')}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                        memberPanelTab === 'members'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/20'
                          : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-200'
                      }`}
                    >
                      Active Members
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemberPanelTab('invitations')}
                      className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                        memberPanelTab === 'invitations'
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/20'
                          : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-200'
                      }`}
                    >
                      Invitations Log ({invitations.filter((invitation) => invitation.status === 'pending').length} Pending)
                    </button>
                  </div>

                  {memberPanelTab === 'members' ? (
                    <>
                      <div className="mt-5 space-y-4 mb-6">
                        {linkedProfilesState.map((member, index) => {
                          const memberUsername =
                            member.profiles?.username ||
                            member.username ||
                            member.profile_link.replace('/profile/', '').replaceAll('/', '').trim();
                          const memberProfileHref = memberUsername ? `/profile/${memberUsername}` : member.profile_link;

                          return (
                            <div
                              key={member.id}
                              className="flex items-center gap-3 rounded-xl border border-slate-900/70 bg-[#040615]/60 p-4"
                            >
                              <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center overflow-hidden text-xs font-semibold text-slate-300">
                                {getInitials(member.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-200">{member.name}</p>
                                <p className="text-xs text-slate-400">{member.role}</p>
                                <a
                                  href={memberProfileHref}
                                  className="mt-2 inline-block text-xs text-purple-400 hover:text-purple-300 transition-all font-medium underline underline-offset-4"
                                >
                                  View MeliusAI Profile
                                </a>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteLinkedProfile(index)}
                                className="text-xs text-rose-500 hover:text-rose-400/80 p-2 transition-all"
                              >
                                Delete
                              </button>
                            </div>
                          );
                        })}
                        {linkedProfilesState.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-slate-800/70 bg-[#040615]/40 p-5 text-center text-xs text-slate-500">
                            No linked talent profiles yet. Search for a verified MeliusAI user below.
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-slate-800/50 bg-[#040615]/40 p-4">
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
                            {isAdding ? 'Searching...' : '🔍 Search Member'}
                          </button>
                        </div>
                        {searchError ? <p className="mt-2 text-xs font-medium text-rose-500">{searchError}</p> : null}
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-slate-800/60 bg-[#040615]/40 p-4">
                      {invitationLoading ? (
                        <p className="py-6 text-center text-xs font-medium text-slate-500">Loading invitations...</p>
                      ) : null}
                      {invitationError ? (
                        <p className="mb-3 text-xs font-medium text-rose-500">{invitationError}</p>
                      ) : null}
                      {!invitationLoading && invitations.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-800/70 bg-[#030512]/50 p-6 text-center">
                          <p className="text-xs font-semibold text-slate-400">No invitations dispatched yet.</p>
                          <p className="mt-2 text-[11px] text-slate-500">
                            Search a verified MeliusAI profile and send an invitation to begin tracking activity.
                          </p>
                        </div>
                      ) : null}
                      <div className="space-y-3">
                        {invitations.map((invitation) => {
                          const profile = invitation.profile;
                          const displayName = profile?.full_name || profile?.username || 'Unknown profile';
                          const username = profile?.username || 'unknown';

                          return (
                            <div
                              key={invitation.id}
                              className="flex flex-col gap-4 rounded-xl border border-slate-900/70 bg-[#030512]/70 p-4 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-800 bg-slate-900 text-xs font-bold text-purple-200">
                                  {profile?.avatar_url ? (
                                    <img src={profile.avatar_url} alt={username} className="h-full w-full object-cover" />
                                  ) : (
                                    getInitials(displayName)
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-200">{displayName}</p>
                                  <p className="truncate text-xs text-purple-300">@{username}</p>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {invitation.status === 'pending'
                                      ? getInvitationTimeRemaining(invitation.expires_at)
                                      : invitation.expires_at
                                        ? `Expired window: ${new Date(invitation.expires_at).toLocaleString()}`
                                        : 'No expiration timestamp'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 md:justify-end">
                                <span
                                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getInvitationStatusClass(invitation.status)}`}
                                >
                                  {invitation.status}
                                </span>
                                {invitation.status === 'pending' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelInvitation(invitation.id)}
                                    className="rounded-full border border-rose-500/30 bg-rose-950/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-300 transition-all hover:border-rose-400/60 hover:text-rose-200"
                                  >
                                    Cancel Invite
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                          onClick={() => void handleSendInvitationToWorkspace()}
                          disabled={isAdding}
                          className="mt-6 w-full rounded-xl bg-purple-600 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500 active:scale-[0.99]"
                        >
                          {isAdding ? 'Dispatching...' : '📩 Send Invitation to Workspace'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'ai_matcher' ? (
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-800/60 bg-[#060817]/50 p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-purple-300">AI Matching Engine</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">MeliusAI Matcher Console</h3>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
                  Cross-referencing global creator profiles against your active workspace blueprint requirements.
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800/60 bg-gradient-to-br from-[#0c0e2b] via-[#05071a] to-[#030512] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-white">
                        Ar. Sarah Chen - Senior Spatial Architect - Match Index: 96%
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {['Spatial Logic: 98%', 'BIM Compliance: 94%'].map((metric) => (
                          <span
                            key={metric}
                            className="rounded-full border border-slate-800/80 bg-slate-950/50 px-3 py-1 text-[11px] font-medium text-slate-300"
                          >
                            {metric}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-purple-500/30 bg-purple-950/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-purple-100 transition-all hover:border-purple-300/60 hover:text-white"
                    >
                      Review CAD Blueprint Audit
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800/60 bg-gradient-to-br from-[#0c0e2b] via-[#05071a] to-[#030512] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-white">
                        Marcus Vance - 3D Environment Asset Designer - Match Index: 92%
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {['Asset Hygiene: 95%', 'Polygon Optimization: 89%'].map((metric) => (
                          <span
                            key={metric}
                            className="rounded-full border border-slate-800/80 bg-slate-950/50 px-3 py-1 text-[11px] font-medium text-slate-300"
                          >
                            {metric}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-purple-500/30 bg-purple-950/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-purple-100 transition-all hover:border-purple-300/60 hover:text-white"
                    >
                      Open Layer File Hygiene Report
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {showInvitePopup && incomingInvite ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
              <div className="relative w-full max-w-lg rounded-3xl border border-slate-800/70 bg-slate-950 p-7 text-center shadow-2xl shadow-purple-950/30">
                <button
                  type="button"
                  onClick={() => {
                    setShowInvitePopup(false);
                    setIncomingInvite(null);
                  }}
                  className="absolute right-4 top-4 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-slate-400 transition-all hover:border-slate-700 hover:text-white"
                >
                  X
                </button>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-950/40 text-2xl">
                  🏢
                </div>
                <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-purple-300">
                  Workspace Invitation
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                  {incomingInvite.organization?.display_name ||
                    incomingInvite.organization?.company_name ||
                    'A verified organization'}{' '}
                  has invited you to collaborate in their workspace.
                </h3>
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  Would you like to accept this invitation and join their official organization roster?
                </p>
                <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleRespondToIncomingInvitation('yes')}
                    disabled={inviteResponseLoading}
                    className="rounded-xl bg-purple-600 px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500"
                  >
                    {inviteResponseLoading ? 'Processing...' : 'YES / JOIN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRespondToIncomingInvitation('no')}
                    disabled={inviteResponseLoading}
                    className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-5 py-3 text-xs font-semibold text-slate-300 transition-all hover:border-slate-700 hover:text-white disabled:text-slate-600"
                  >
                    NO / DECLINE
                  </button>
                </div>
                {inviteResponseMessage ? (
                  <p className="mt-4 text-xs font-medium text-slate-400">{inviteResponseMessage}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
