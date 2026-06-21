'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Search, UserRound } from 'lucide-react';

type CandidateSearchResult = {
  id: string;
  full_name: string;
  username: string;
  role_title: string;
  bio: string;
  skills: string[];
  match_score?: number;
};

const PYTHON_API_URL = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');

function normalizeSkills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((skill) => String(skill).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((skill) => skill.trim()).filter(Boolean);
  }

  return [];
}

function normalizeCandidate(value: unknown): CandidateSearchResult | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  if (!id) return null;

  const username = typeof row.username === 'string' ? row.username.trim() : '';
  const fullName = typeof row.full_name === 'string' ? row.full_name.trim() : '';
  const roleTitle = [row.role_title, row.current_status, row.role].find(
    (field): field is string => typeof field === 'string' && Boolean(field.trim())
  );
  const rawMatchScore = Number(row.match_score);

  return {
    id,
    full_name: fullName || username || 'MeliusAI Candidate',
    username: username || id,
    role_title: roleTitle?.trim() || '',
    bio: typeof row.bio === 'string' ? row.bio.trim() : '',
    skills: normalizeSkills(row.skills),
    match_score: Number.isFinite(rawMatchScore) ? rawMatchScore : undefined,
  };
}

function CandidateCard({ candidate }: { candidate: CandidateSearchResult }) {
  return (
    <article className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0c1028] via-[#070a19] to-[#040611] p-6 shadow-xl">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold text-white">{candidate.full_name}</p>
            {candidate.match_score !== undefined ? (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">
                {candidate.match_score} matches
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-purple-300">
            {candidate.role_title || `@${candidate.username}`}
          </p>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
            {candidate.bio || 'Verified candidate profile.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {candidate.skills.length ? (
          candidate.skills.slice(0, 6).map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300"
            >
              {skill}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-600">Skills pending</span>
        )}
      </div>

      <Link
        href={`/profile/${encodeURIComponent(candidate.username)}`}
        className="mt-6 inline-flex rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-purple-100 transition hover:border-purple-300/60 hover:bg-purple-500/15"
      >
        View candidate
      </Link>
    </article>
  );
}

export default function OrganizationSearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CandidateSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage('');

      try {
        const response = await fetch(`${PYTHON_API_URL}/api/search-talent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Search server responded with status ${response.status}.`);
        }

        const data = (await response.json()) as unknown;
        const rawCandidates = Array.isArray(data) ? data : [];
        const candidates = rawCandidates
          .map((candidate) => normalizeCandidate(candidate))
          .filter((candidate): candidate is CandidateSearchResult => candidate !== null);

        if (active) setSearchResults(candidates);
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          setSearchResults([]);
          setErrorMessage(error instanceof Error ? error.message : 'Unable to search candidates.');
        }
      } finally {
        if (active) setIsSearching(false);
      }
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] px-5 py-10 text-white sm:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-2xl sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
            AI Talent Search
          </p>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Discover verified candidates</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Describe the skills, experience, and working preferences you need in natural language.
          </p>

          <div className="relative mt-7">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-300"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search candidate skills, experience, or preferences..."
              className="w-full rounded-2xl border border-slate-700/80 bg-[#06091a]/90 py-4 pl-14 pr-5 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          {isSearching ? (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-cyan-300">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              AI is analyzing candidates...
            </div>
          ) : null}
        </div>

        <div className="mt-7">
          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] px-6 py-5 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : searchResults.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {searchResults.map((candidate) => (
                <CandidateCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          ) : !isSearching ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-[#040615]/50 px-6 py-14 text-center">
              <Search className="mx-auto h-6 w-6 text-slate-600" aria-hidden="true" />
              <p className="mt-4 text-sm font-medium text-slate-400">No candidates found.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
