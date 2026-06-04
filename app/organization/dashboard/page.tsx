'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useViewerProfile } from '@/lib/viewer-client';

type ActiveTab = 'overview' | 'ai_matcher';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl: string;
  meliusProfileUrl: string;
}

const navItems: Array<{
  label: string;
  tab: ActiveTab | null;
}> = [
  { label: 'Overview', tab: 'overview' },
  { label: 'AI Matcher', tab: 'ai_matcher' },
  { label: 'AI Scrutiny Hub', tab: null },
  { label: 'Talent Discovery', tab: null },
  { label: 'Company Profile', tab: null },
];

const WORKSPACE_BIO_STORAGE_KEY = 'melius_workspace_bio';
const WORKSPACE_MEMBERS_STORAGE_KEY = 'melius_workspace_members';

export default function OrganizationDashboard() {
  const router = useRouter();
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const [companyName, setCompanyName] = useState<string>('');
  const [workspaceUsername, setWorkspaceUsername] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [bio, setBio] = useState<string>('');
  const [bioSaveState, setBioSaveState] = useState<'idle' | 'saved'>('idle');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberRole, setNewMemberRole] = useState<string>('');
  const [newMemberProfileUrl, setNewMemberProfileUrl] = useState<string>('');
  const [memberError, setMemberError] = useState<string | null>(null);
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

  async function handleAddMember() {
    const inputUsername = newMemberProfileUrl
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace('/profile/', '')
      .replace(/^@/, '')
      .trim()
      .toLowerCase();

    if (!inputUsername || !supabase) {
      return;
    }

    setIsAdding(true);
    setMemberError(null);

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', inputUsername)
        .single();

      if (error || !profile) {
        setMemberError('No such account exists.');
        return;
      }

      const verifiedProfile = profile as {
        id?: string;
        username?: string | null;
        full_name?: string | null;
        avatar_url?: string | null;
      };
      const verifiedUsername = verifiedProfile.username || inputUsername;

      setMembers((currentMembers) => {
        const updatedList = [
          ...currentMembers,
          {
            id: verifiedProfile.id || Date.now().toString(),
            name: verifiedProfile.full_name || newMemberName.trim() || verifiedUsername,
            role: newMemberRole.trim() || 'Workspace Member',
            photoUrl: verifiedProfile.avatar_url || '',
            meliusProfileUrl: `/profile/${verifiedUsername}`,
          },
        ];

        localStorage.setItem(WORKSPACE_MEMBERS_STORAGE_KEY, JSON.stringify(updatedList));
        return updatedList;
      });
      setNewMemberName('');
      setNewMemberRole('');
      setNewMemberProfileUrl('');
    } catch (error) {
      console.error('Error validating workspace member profile:', error);
      setMemberError('No such account exists.');
    } finally {
      setIsAdding(false);
    }
  }

  function handleSaveBio() {
    localStorage.setItem(WORKSPACE_BIO_STORAGE_KEY, bio);
    setBioSaveState('saved');
    window.setTimeout(() => setBioSaveState('idle'), 1600);
  }

  function handleDeleteMember(targetId: string) {
    const filteredList = members.filter((member) => member.id !== targetId);
    setMembers(filteredList);
    localStorage.setItem(WORKSPACE_MEMBERS_STORAGE_KEY, JSON.stringify(filteredList));
  }

  useEffect(() => {
    const savedBio = localStorage.getItem(WORKSPACE_BIO_STORAGE_KEY);
    if (savedBio !== null) {
      setBio(savedBio);
    }

    const savedMembers = localStorage.getItem(WORKSPACE_MEMBERS_STORAGE_KEY);
    if (savedMembers) {
      try {
        const parsedMembers = JSON.parse(savedMembers);
        if (Array.isArray(parsedMembers)) {
          setMembers(parsedMembers);
        }
      } catch (e) {
        console.error('Failed to parse saved workspace roster profiles:', e);
      }
    }
  }, []);

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
          const sessionUser = activeUser as typeof activeUser & {
            raw_user_meta_data?: {
              company_name?: string;
              org_username?: string;
              bio?: string;
            };
          };
          const meta =
            sessionUser.raw_user_meta_data ??
            (sessionUser.user_metadata as
              | {
                  company_name?: string;
                  org_username?: string;
                  bio?: string;
                }
              | undefined);

          setCompanyName(meta?.company_name || 'Verified Organisation');
          setWorkspaceUsername(meta?.org_username || 'workspace');
          const savedBio = localStorage.getItem(WORKSPACE_BIO_STORAGE_KEY);
          if (savedBio !== null) {
            setBio(savedBio);
          } else if (meta?.bio) {
            setBio(meta.bio);
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
    window.location.assign('/auth/organization');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#030512] text-slate-400 text-sm tracking-wide">
        Loading organisation workspace...
      </div>
    );
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
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Enter your company bio, creative focus, or structural design philosophy here..."
                  className="mt-5 w-full bg-[#040615]/60 border border-slate-800/80 rounded-xl p-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 transition-all resize-none h-28"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveBio}
                    className="mt-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg px-5 py-2.5 transition-all shadow-lg shadow-purple-900/20 active:scale-[0.98] self-end"
                  >
                    {bioSaveState === 'saved' ? 'Saved ✓' : 'Save Bio'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col space-y-6 w-full">
                <div className="rounded-2xl border border-slate-800/60 bg-[#060817]/50 p-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Workspace Members</p>

                  <div className="mt-5 space-y-4 mb-6">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-900/70 bg-[#040615]/60 p-4"
                      >
                        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center overflow-hidden text-xs font-semibold text-slate-300">
                          {member.photoUrl ? (
                            <img src={member.photoUrl} alt={member.name} className="h-full w-full object-cover" />
                          ) : (
                            getInitials(member.name)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-200">{member.name}</p>
                          <p className="text-xs text-slate-400">{member.role}</p>
                          <a
                            href={member.meliusProfileUrl}
                            className="mt-2 inline-block text-xs text-purple-400 hover:text-purple-300 transition-all font-medium underline underline-offset-4"
                          >
                            View MeliusAI Profile
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteMember(member.id)}
                          className="text-xs text-rose-500 hover:text-rose-400/80 p-2 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#040615]/40 border border-slate-800/50 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        Member Name
                      </label>
                      <input
                        type="text"
                        value={newMemberName}
                        onChange={(event) => {
                          setNewMemberName(event.target.value);
                          setMemberError(null);
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-800/80 bg-[#030512] px-3 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600 focus:border-purple-500/50"
                        placeholder="e.g. Aarav Mehta"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        Role/Details
                      </label>
                      <input
                        type="text"
                        value={newMemberRole}
                        onChange={(event) => {
                          setNewMemberRole(event.target.value);
                          setMemberError(null);
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-800/80 bg-[#030512] px-3 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600 focus:border-purple-500/50"
                        placeholder="e.g. BIM Lead"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        MeliusAI Profile Link
                      </label>
                      <input
                        type="text"
                        value={newMemberProfileUrl}
                        onChange={(event) => {
                          setNewMemberProfileUrl(event.target.value);
                          setMemberError(null);
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-800/80 bg-[#030512] px-3 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600 focus:border-purple-500/50"
                        placeholder="/profile/name"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddMember}
                      disabled={isAdding}
                      className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-950 disabled:text-slate-500 text-white font-medium text-xs rounded-lg px-4 py-2.5 transition-all"
                    >
                      {isAdding ? 'Checking...' : '+ Add Member'}
                    </button>
                  </div>
                  {memberError && <p className="text-xs text-rose-500 font-medium mt-2">{memberError}</p>}
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
