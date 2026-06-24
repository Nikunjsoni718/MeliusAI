'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, LoaderCircle, Search, Users } from 'lucide-react';

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

type DirectoryTab = 'people' | 'companies';

type PersonResult = {
  id: string;
  full_name: string;
  username: string;
  headline: string;
  avatar_url: string;
};

type CompanyResult = {
  id: string;
  company_name: string;
  handle: string;
  industry: string;
  logo_url: string;
};

function readText(row: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = row[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function normalizePerson(value: unknown): PersonResult | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  const id = readText(row, ['id']);
  if (!id) return null;

  const username = readText(row, ['username']);

  return {
    id,
    full_name: readText(row, ['full_name']) || username || 'MeliusAI Member',
    username,
    headline: readText(row, ['headline', 'current_status']) || 'Verified MeliusAI member',
    avatar_url: readText(row, ['avatar_url']),
  };
}

function normalizeCompany(value: unknown): CompanyResult | null {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  const id = readText(row, ['id']);
  if (!id) return null;

  const companyName = readText(row, ['company_name', 'name']);

  return {
    id,
    company_name: companyName || 'MeliusAI Organization',
    handle: readText(row, ['handle', 'slug', 'username']),
    industry: readText(row, ['industry', 'description', 'bio']) || 'Verified organization',
    logo_url: readText(row, ['logo_url', 'avatar_url']),
  };
}

function DirectoryAvatar({ imageUrl, label }: { imageUrl: string; label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  const safeImageUrl = imageUrl.replaceAll('"', '%22');

  return (
    <span
      role={imageUrl ? 'img' : undefined}
      aria-label={imageUrl ? `${label} image` : undefined}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/20 to-cyan-500/10 bg-cover bg-center text-lg font-bold text-purple-100"
      style={imageUrl ? { backgroundImage: `url("${safeImageUrl}")` } : undefined}
    >
      {imageUrl ? null : initial}
    </span>
  );
}

export default function GlobalDirectorySearchPage() {
  const [supabase] = useState(() =>
    hasSupabaseBrowserEnv() ? createSupabaseBrowserClient() : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>([]);
  const [companyResults, setCompanyResults] = useState<CompanyResult[]>([]);
  const [activeTab, setActiveTab] = useState<DirectoryTab>('people');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      setPeopleResults([]);
      setCompanyResults([]);
      setIsSearching(false);
      setErrorMessage('');
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage('');

      try {
        if (!supabase) {
          throw new Error('Directory search is unavailable because Supabase is not configured.');
        }

        const searchPattern = `%${query}%`;
        const [peopleResponse, companyResponse] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, username, current_status, avatar_url')
            .ilike('full_name', searchPattern)
            .limit(10),
          supabase
            .from('organizations')
            .select('*')
            .ilike('company_name', searchPattern)
            .limit(10),
        ]);

        if (peopleResponse.error) throw peopleResponse.error;
        if (companyResponse.error) throw companyResponse.error;

        const people = (peopleResponse.data ?? [])
          .map((person) => normalizePerson(person))
          .filter((person): person is PersonResult => person !== null);
        const companies = (companyResponse.data ?? [])
          .map((company) => normalizeCompany(company))
          .filter((company): company is CompanyResult => company !== null);

        if (active) {
          setPeopleResults(people);
          setCompanyResults(companies);
        }
      } catch (error) {
        if (active) {
          setPeopleResults([]);
          setCompanyResults([]);
          setErrorMessage(error instanceof Error ? error.message : 'Directory search failed.');
        }
      } finally {
        if (active) setIsSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, supabase]);

  const activeResults = activeTab === 'people' ? peopleResults : companyResults;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#050819] to-[#010b24] px-5 py-10 text-white sm:px-8 lg:py-16">
      <section className="mx-auto max-w-6xl">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Global Directory</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Find the right people and companies
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Search the MeliusAI network directly, with results delivered as you type.
          </p>
        </header>

        <div className="relative mx-auto mt-10 max-w-4xl">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-purple-300" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search people or companies..."
            autoComplete="off"
            className="w-full rounded-[1.6rem] border border-white/10 bg-[#090d22]/90 py-6 pl-16 pr-6 text-xl text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] outline-none transition placeholder:text-slate-600 focus:border-purple-400/60 focus:ring-4 focus:ring-purple-500/10 sm:text-2xl"
          />
        </div>

        <div className="mx-auto mt-7 flex w-fit rounded-2xl border border-white/10 bg-white/[0.04] p-1.5">
          {([
            { id: 'people' as const, label: 'People', icon: Users, count: peopleResults.length },
            { id: 'companies' as const, label: 'Companies', icon: Building2, count: companyResults.length },
          ]).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-purple-500/20 text-white shadow-sm ring-1 ring-purple-400/30'
                    : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
                {searchQuery.trim() ? (
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">{tab.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-8">
          {isSearching ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-[#06091a]/70 px-6 py-14 text-sm text-cyan-300">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              Searching the global directory...
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] px-6 py-5 text-sm text-rose-100">{errorMessage}</div>
          ) : !searchQuery.trim() ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-[#040615]/50 px-6 py-16 text-center">
              <Search className="mx-auto h-7 w-7 text-slate-600" aria-hidden="true" />
              <p className="mt-4 text-sm font-medium text-slate-400">Start typing to explore the directory.</p>
            </div>
          ) : activeResults.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-[#040615]/50 px-6 py-16 text-center">
              <p className="text-sm font-medium text-slate-400">
                {activeTab === 'people' ? 'No people found' : 'No companies found'}
              </p>
            </div>
          ) : activeTab === 'people' ? (
            <div className="grid gap-4 md:grid-cols-2">
              {peopleResults.map((person) => (
                <Link
                  key={person.id}
                  href={`/profile/${encodeURIComponent(person.username || person.id)}`}
                  className="block w-full"
                >
                  <div className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0c1028] via-[#070a19] to-[#040611] p-5 shadow-xl transition hover:-translate-y-0.5 hover:border-purple-400/35">
                    <DirectoryAvatar imageUrl={person.avatar_url} label={person.full_name} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white group-hover:text-purple-100">{person.full_name}</p>
                      <p className="mt-1 truncate text-sm text-slate-400">{person.headline}</p>
                      {person.username ? <p className="mt-1 truncate text-xs text-purple-400">@{person.username}</p> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {companyResults.map((company) => (
                <Link
                  key={company.id}
                  href={`/organization/about?orgId=${encodeURIComponent(company.id)}`}
                  className="block w-full"
                >
                  <div className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0c1028] via-[#070a19] to-[#040611] p-5 shadow-xl transition hover:-translate-y-0.5 hover:border-cyan-400/35">
                    <DirectoryAvatar imageUrl={company.logo_url} label={company.company_name} />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white group-hover:text-cyan-100">{company.company_name}</p>
                      <p className="mt-1 truncate text-sm text-slate-400">{company.industry}</p>
                      {company.handle ? <p className="mt-1 truncate text-xs text-cyan-400">@{company.handle}</p> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
