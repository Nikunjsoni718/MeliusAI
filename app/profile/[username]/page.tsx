'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CandidateProfile = {
  id?: string;
  full_name?: string | null;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  headline?: string | null;
  skills?: string[] | string | null;
  average_project_score?: number | string | null;
  avg_project_score?: number | string | null;
};

type SpectateProfileResponse = {
  success?: boolean;
  profile?: CandidateProfile | null;
  user?: CandidateProfile | null;
  detail?: string;
  message?: string;
} & CandidateProfile;

function normalizeSkills(value: CandidateProfile['skills']) {
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

function getScore(profile: CandidateProfile | null) {
  const rawScore = profile?.average_project_score ?? profile?.avg_project_score ?? 0;
  const numericScore = typeof rawScore === 'number' ? rawScore : Number(rawScore);

  return Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : 0;
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'AI'
  );
}

export default function ProfilePage({ params }: { params: { username: string } }) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSpectatorProfile() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const backendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com';
        const cleanBackendUrl = backendUrl.replace(/\/$/, '');
        const response = await fetch(
          `${cleanBackendUrl}/api/spectate-profile/${encodeURIComponent(params.username)}`
        );
        const data = (await response.json()) as SpectateProfileResponse;

        if (!response.ok) {
          throw new Error(data.detail || data.message || 'Target candidate profile not found');
        }

        const profileRecord = data.profile ?? data.user ?? data;

        if (!profileRecord || !profileRecord.id) {
          throw new Error('Target candidate profile not found');
        }

        if (isActive) {
          setProfile(profileRecord);
        }
      } catch (error) {
        console.error('Spectator profile fetch failed:', error);
        if (isActive) {
          setProfile(null);
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load this candidate profile.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSpectatorProfile();

    return () => {
      isActive = false;
    };
  }, [params.username]);

  const displayName = profile?.full_name || profile?.username || 'Candidate';
  const username = profile?.username || params.username;
  const score = getScore(profile);
  const skills = useMemo(() => normalizeSkills(profile?.skills), [profile?.skills]);

  if (isLoading) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030512] text-slate-300">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(147,51,234,0.14),transparent_38%)]" />
        <div className="relative rounded-2xl border border-slate-800/70 bg-[#060817]/80 px-6 py-5 text-sm font-semibold tracking-wide shadow-2xl shadow-purple-950/20">
          Loading candidate matrix dossier...
        </div>
      </main>
    );
  }

  if (!profile || errorMessage) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030512] p-6 text-slate-300">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,51,234,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.35),transparent)]" />
        <section className="relative max-w-lg rounded-3xl border border-slate-800/70 bg-[#060817]/90 p-8 text-center shadow-2xl shadow-purple-950/20">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-purple-300">Spectator Matrix</p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Candidate profile unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {errorMessage || 'We could not locate a public profile for this candidate identifier.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (window.opener) {
                window.close();
              } else {
                window.location.href = '/organization/dashboard';
              }
            }}
            className="mt-6 inline-flex rounded-xl border border-purple-500/30 bg-purple-950/30 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-purple-100 transition hover:border-purple-300/60 hover:text-white"
          >
            Return to dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030512] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.11),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(147,51,234,0.16),transparent_35%),linear-gradient(135deg,#030512_0%,#070a1e_45%,#030512_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:42px_42px]" />

      <div className="relative flex min-h-screen w-full">
        <aside className="hidden w-72 shrink-0 border-r border-slate-800/60 bg-[#060817]/80 p-6 backdrop-blur-xl lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="rounded-3xl border border-slate-800/60 bg-gradient-to-br from-[#191336] via-[#070a1e] to-[#030512] p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-950/40 text-sm font-bold tracking-widest text-purple-200">
                {getInitials(displayName)}
              </div>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                Spectator Profile
              </p>
              <h2 className="mt-2 truncate text-lg font-semibold text-white">{displayName}</h2>
              <p className="mt-1 truncate text-xs text-slate-500">@{username}</p>
            </div>

            <div className="mt-6 space-y-2">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Verified Rating</p>
                <p className="mt-2 text-2xl font-semibold text-white">{score}/100</p>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Candidate UUID</p>
                <p className="mt-2 break-all text-xs leading-5 text-slate-400">{profile.id}</p>
              </div>
            </div>
          </div>

          <Link
            href="/organization/dashboard"
            className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-sm font-medium text-slate-300 transition hover:border-purple-400/40 hover:bg-slate-900/70 hover:text-white"
          >
            Back to recruiter console
          </Link>
        </aside>

        <section className="flex-1 overflow-y-auto p-5 md:p-8 lg:p-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <header className="rounded-[2rem] border border-slate-800/60 bg-[#060817]/70 p-6 shadow-2xl shadow-purple-950/20 backdrop-blur-xl md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-purple-500/30 bg-purple-950/40 text-xl font-bold tracking-widest text-purple-100">
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      getInitials(displayName)
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-purple-300">
                      Candidate Matrix Dossier
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                      {displayName}
                    </h1>
                    <p className="mt-2 text-sm font-medium text-slate-500">@{username}</p>
                  </div>
                </div>

                <div
                  className={`rounded-full border px-4 py-2 text-xs font-bold tracking-wide ${
                    score >= 80
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                      : 'border-purple-400/40 bg-purple-500/10 text-purple-100'
                  }`}
                >
                  Avg Score: {score}/100
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
              <section className="rounded-3xl border border-slate-800/60 bg-[#060817]/65 p-6 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">About Me</p>
                <p className="mt-5 text-sm leading-7 text-slate-300">
                  {profile.bio ||
                    'This candidate has not published a detailed bio yet. Verified work signals and profile metadata will appear here as they expand their MeliusAI portfolio.'}
                </p>
              </section>

              <section className="rounded-3xl border border-slate-800/60 bg-gradient-to-br from-[#0c0e2b] via-[#05071a] to-[#030512] p-6 shadow-xl shadow-purple-950/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-purple-300">Skill Signals</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {skills.length > 0 ? (
                    skills.slice(0, 12).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-500">
                      Skills pending
                    </span>
                  )}
                </div>
              </section>
            </div>

            <section className="rounded-3xl border border-slate-800/60 bg-[#060817]/55 p-6 shadow-xl shadow-slate-950/30">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Recruiter Viewing Mode
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    Public profile data streamed from MeliusAI backend
                  </h2>
                </div>
                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                  Live Spectator Canvas
                </span>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
