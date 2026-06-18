'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Filter, ShieldCheck, Sparkles } from 'lucide-react';

type TalentCandidate = {
  id: string;
  full_name: string;
  bio: string;
  role: string;
  experience_level: string;
  avg_project_score: number;
  skills: string[];
};

const TALENT_DISCOVERY_API_BASE = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');

function normalizeTalentCandidate(value: unknown): TalentCandidate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  if (!id) {
    return null;
  }

  const rawScore = Number(candidate.avg_project_score ?? 0);
  const skills = Array.isArray(candidate.skill_tags)
    ? candidate.skill_tags.map((skill) => String(skill).trim()).filter(Boolean)
    : [];

  return {
    id,
    full_name:
      typeof candidate.full_name === 'string' && candidate.full_name.trim()
        ? candidate.full_name.trim()
        : 'MeliusAI Talent',
    bio: typeof candidate.bio === 'string' ? candidate.bio : '',
    role:
      typeof candidate.role === 'string' && candidate.role.trim()
        ? candidate.role.trim()
        : 'Verified Talent',
    experience_level:
      typeof candidate.experience_level === 'string' && candidate.experience_level.trim()
        ? candidate.experience_level.trim()
        : 'Verified Professional',
    avg_project_score: Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0,
    skills,
  };
}

export function TalentDiscoveryCenter() {
  const [talentList, setTalentList] = useState<TalentCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState('All');
  const [selectedMinScore, setSelectedMinScore] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTalent() {
      let responseStatus: number | null = null;
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`${TALENT_DISCOVERY_API_BASE}/api/talent-discovery`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        responseStatus = response.status;

        if (!response.ok) {
          throw new Error('Talent discovery request failed.');
        }

        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) {
          throw new Error('Talent discovery returned an invalid payload.');
        }

        const candidates = payload
          .map(normalizeTalentCandidate)
          .filter((candidate): candidate is TalentCandidate => candidate !== null);

        setTalentList(candidates);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setTalentList([]);
        setErrorMessage(
          responseStatus
            ? `Talent Discovery is temporarily unavailable (HTTP ${responseStatus}).`
            : error instanceof Error
              ? `Talent Discovery is temporarily unavailable: ${error.message}`
              : 'Talent Discovery is temporarily unavailable. Please try again shortly.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadTalent();

    return () => controller.abort();
  }, []);

  const roleOptions = [
    'All',
    ...Array.from(new Set(talentList.map((candidate) => candidate.role))).sort((a, b) => a.localeCompare(b)),
  ];

  const filteredTalent = talentList.filter((candidate) => {
    const matchesRole = selectedRole === 'All' || candidate.role === selectedRole;
    const matchesScore = candidate.avg_project_score >= selectedMinScore;
    return matchesRole && matchesScore;
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(88,28,135,0.2),transparent_34%),linear-gradient(135deg,#080a18_0%,#030512_55%,#071124_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="flex flex-col gap-6 border-b border-[#1F223D] pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href="/organization/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-cyan-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Organization Dashboard
            </Link>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-purple-200 shadow-[0_0_28px_rgba(168,85,247,0.15)]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-purple-300">Live Talent Index</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Talent Discovery Center</h1>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              Explore verified candidate profiles directly from the MeliusAI talent graph.
            </p>
          </div>

          {!isLoading && !errorMessage ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              {talentList.length} verified profiles live
            </div>
          ) : null}
        </header>

        <section className="mt-7 rounded-3xl border border-[#1F223D] bg-[#121424] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            <Filter className="h-4 w-4 text-cyan-300" />
            Discovery Filters
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-xs font-medium text-slate-400">
              <span>Specialization</span>
              <select
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value)}
                className="h-12 w-full rounded-xl border border-[#1F223D] bg-[#090b19] px-4 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/15"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs font-medium text-slate-400">
              <span>Score benchmark</span>
              <select
                value={selectedMinScore}
                onChange={(event) => setSelectedMinScore(Number(event.target.value))}
                className="h-12 w-full rounded-xl border border-[#1F223D] bg-[#090b19] px-4 text-sm text-slate-100 outline-none transition focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400/15"
              >
                <option value={0}>All verified scores</option>
                <option value={70}>70+ score</option>
                <option value={80}>80+ score</option>
                <option value={85}>85+ score</option>
                <option value={90}>90+ score</option>
              </select>
            </label>
          </div>
        </section>

        {isLoading ? (
          <div className="grid gap-5 py-10 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading verified talent">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-72 animate-pulse rounded-3xl border border-[#1F223D] bg-gradient-to-br from-[#121424] to-[#090b19] shadow-[0_0_32px_rgba(34,211,238,0.04)]"
              />
            ))}
          </div>
        ) : errorMessage ? (
          <div className="mt-8 rounded-3xl border border-rose-400/25 bg-rose-500/10 p-8 text-center text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : filteredTalent.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[#1F223D] bg-[#121424]/70 p-12 text-center text-sm text-slate-400">
            No verified talent matches the selected filters.
          </div>
        ) : (
          <section className="grid gap-5 py-8 md:grid-cols-2 xl:grid-cols-3">
            {filteredTalent.map((candidate) => {
              const scoreIsElite = candidate.avg_project_score >= 85;

              return (
                <article
                  key={candidate.id}
                  className="group flex min-h-[310px] flex-col rounded-3xl border border-[#1F223D] bg-gradient-to-br from-[#121424] via-[#0d1021] to-[#080a17] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.2)] transition duration-300 hover:-translate-y-1 hover:border-cyan-400/30 hover:shadow-[0_26px_80px_rgba(8,145,178,0.1)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-purple-400/25 bg-purple-500/10 text-sm font-bold text-purple-100">
                        {candidate.full_name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-white">{candidate.full_name}</h2>
                        <p className="mt-1 truncate text-sm text-slate-400">{candidate.role}</p>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                      <p className={scoreIsElite ? 'text-lg font-bold text-cyan-300' : 'text-lg font-bold text-purple-300'}>
                        {candidate.avg_project_score.toFixed(1)}
                      </p>
                      <p className="text-[9px] uppercase tracking-[0.18em] text-slate-600">Avg score</p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center gap-2 text-xs text-slate-400">
                    <BriefcaseBusiness className="h-4 w-4 text-slate-500" />
                    {candidate.experience_level}
                  </div>

                  {candidate.bio ? <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-500">{candidate.bio}</p> : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {candidate.skills.length > 0 ? (
                      candidate.skills.slice(0, 6).map((skill) => (
                        <code
                          key={`${candidate.id}-${skill}`}
                          className="rounded-md border border-cyan-400/15 bg-cyan-500/[0.06] px-2 py-1 text-[11px] text-cyan-100"
                        >
                          {skill}
                        </code>
                      ))
                    ) : (
                      <code className="rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-600">
                        Skills pending
                      </code>
                    )}
                  </div>

                  <Link
                    href={`/profile/${encodeURIComponent(candidate.id)}`}
                    className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/35 bg-purple-500/10 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-purple-100 transition hover:border-cyan-300/55 hover:bg-cyan-500/10 hover:text-white"
                  >
                    Review Profile Dossier
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

export default TalentDiscoveryCenter;
