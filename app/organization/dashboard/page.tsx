'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { useViewerProfile } from '@/lib/viewer-client';

type ActiveTab = 'overview' | 'ai_matcher';

export type OrganizationLinkedProfile = {
  id: string;
  name: string;
  role: string;
  profile_link: string;
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

type OrganizationRecord = {
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

      return {
        id,
        name:
          typeof item.name === 'string' && item.name.trim()
            ? item.name
            : profileHandle || 'Workspace Member',
        role: typeof item.role === 'string' ? item.role : 'Workspace Member',
        profile_link: profileLink,
      };
    })
    .filter((item) => item.id.trim().length > 0 && item.profile_link.trim().length > 0);
}

export default function OrganizationDashboard() {
  const router = useRouter();
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
    const targetQuery = searchQuery.trim();

    if (!targetQuery) {
      setSearchError('Enter a MeliusAI username or profile link to search.');
      setSearchResult(null);
      setIsModalOpen(false);
      return;
    }

    setIsAdding(true);
    setSearchError('');
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

          const { data: organization, error: organizationError } = await getOrganizationClient()
            .from('organizations')
            .select('bio, linked_profiles')
            .eq('id', activeUser.id)
            .maybeSingle();

          if (organizationError) {
            throw new Error(organizationError.message);
          }

          if (organization && active) {
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

                  <div className="mt-5 space-y-4 mb-6">
                    {linkedProfilesState.map((member, index) => (
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
                            href={member.profile_link}
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
                    ))}
                    {linkedProfilesState.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-800/70 bg-[#040615]/40 p-5 text-center text-xs text-slate-500">
                        No linked talent profiles yet. Add a verified username below to connect a member.
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
                          onClick={() => linkVerifiedMember(searchResult)}
                          className="mt-6 w-full rounded-xl bg-purple-600 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500 active:scale-[0.99]"
                        >
                          📩 Send Invitation to Workspace
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
        </div>
      </main>
    </div>
  );
}
