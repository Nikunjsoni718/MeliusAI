'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, Building2, LoaderCircle, Search, UserRound } from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

type UserRole = 'organization' | 'candidate';

type CandidateResult = {
  kind: 'candidate';
  id: string;
  full_name: string;
  username: string;
  role_title: string;
  bio: string;
  skills: string[];
};

type OpportunityResult = {
  kind: 'opportunity';
  id: string;
  organization_id: string;
  role_title: string;
  recruiter_name: string;
  company_name: string;
  description: string;
  core_skills: string[];
  status: string;
};

type SearchResult = CandidateResult | OpportunityResult;

function normalizeSkills(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((skill) => skill.trim()).filter(Boolean);
  }

  return typeof value === 'string'
    ? value.split(',').map((skill) => skill.trim()).filter(Boolean)
    : [];
}

function readOrganizationName(value: unknown) {
  const organization = Array.isArray(value) ? value[0] : value;
  if (!organization || typeof organization !== 'object') return '';

  const companyName = (organization as Record<string, unknown>).company_name;
  return typeof companyName === 'string' ? companyName.trim() : '';
}

function CandidateCard({ candidate }: { candidate: CandidateResult }) {
  return (
    <article className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0c1028] via-[#070a19] to-[#040611] p-6 shadow-xl">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-white">{candidate.full_name}</p>
          <p className="mt-1 text-sm text-purple-300">{candidate.role_title || `@${candidate.username}`}</p>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
            {candidate.bio || 'Verified candidate profile.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {candidate.skills.length ? candidate.skills.slice(0, 6).map((skill) => (
          <span key={skill} className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
            {skill}
          </span>
        )) : <span className="text-xs text-slate-600">Skills pending</span>}
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

function OpportunityCard({ opportunity }: { opportunity: OpportunityResult }) {
  return (
    <article className="rounded-2xl border border-slate-800/80 bg-gradient-to-br from-[#0c1028] via-[#070a19] to-[#040611] p-6 shadow-xl">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/10 text-purple-200">
          <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-white">{opportunity.role_title}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-cyan-300">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            {opportunity.company_name || opportunity.recruiter_name}
          </p>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
            {opportunity.description || 'Open opportunity from a verified MeliusIQ organization.'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {opportunity.core_skills.length ? opportunity.core_skills.slice(0, 6).map((skill) => (
          <span key={skill} className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
            {skill}
          </span>
        )) : <span className="text-xs text-slate-600">Requirements coming soon</span>}
      </div>

      <span className="mt-6 inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
        {opportunity.status}
      </span>
    </article>
  );
}

export default function SearchPage() {
  const { loading: viewerLoading, supabase } = useViewerProfile();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (viewerLoading) return;

    let active = true;

    async function resolveUserRole() {
      try {
        if (!supabase) throw new Error('Search is unavailable because Supabase is not configured.');

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error('Sign in to use network search.');

        const { data: organizations, error: organizationError } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', authData.user.id)
          .limit(1);

        if (organizationError) throw organizationError;
        if (active) setUserRole(organizations?.length ? 'organization' : 'candidate');
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to identify your search role.');
          setIsLoading(false);
        }
      }
    }

    void resolveUserRole();
    return () => {
      active = false;
    };
  }, [supabase, viewerLoading]);

  useEffect(() => {
    if (!userRole) return;

    let active = true;

    async function loadResults() {
      setIsLoading(true);
      setErrorMessage('');

      try {
        if (!supabase) throw new Error('Search is unavailable because Supabase is not configured.');

        if (userRole === 'organization') {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, username, current_status, bio, skills')
            .order('full_name', { ascending: true });

          if (error) throw error;

          const candidates = (data ?? []).map((row) => ({
            kind: 'candidate' as const,
            id: String(row.id),
            full_name: row.full_name?.trim() || row.username?.trim() || 'MeliusIQ Candidate',
            username: row.username?.trim() || String(row.id),
            role_title: row.current_status?.trim() || '',
            bio: row.bio?.trim() || '',
            skills: normalizeSkills(row.skills),
          }));

          if (active) setResults(candidates);
          return;
        }

        const selectWithOrganization =
          'id, organization_id, role_title, job_title, title, recruiter_name, description, job_description, core_skills, status, organizations(company_name)';
        const joinedResponse = await supabase
          .from('opportunities')
          .select(selectWithOrganization)
          .in('status', ['active', 'open'])
          .order('created_at', { ascending: false });

        let opportunityRows = joinedResponse.data as unknown[] | null;
        let companyNames = new Map<string, string>();

        if (joinedResponse.error) {
          const fallbackResponse = await supabase
            .from('opportunities')
            .select('id, organization_id, role_title, job_title, title, recruiter_name, description, job_description, core_skills, status')
            .in('status', ['active', 'open'])
            .order('created_at', { ascending: false });

          if (fallbackResponse.error) throw fallbackResponse.error;
          opportunityRows = fallbackResponse.data as unknown[] | null;

          const organizationIds = Array.from(new Set((opportunityRows ?? []).map((value) => {
            const row = value as Record<string, unknown>;
            return typeof row.organization_id === 'string' ? row.organization_id : '';
          }).filter(Boolean)));

          if (organizationIds.length) {
            const organizationResponse = await supabase
              .from('organizations')
              .select('id, company_name')
              .in('id', organizationIds);

            if (organizationResponse.error) throw organizationResponse.error;
            companyNames = new Map(
              (organizationResponse.data ?? []).map((organization) => [
                String(organization.id),
                organization.company_name?.trim() || '',
              ])
            );
          }
        }

        const opportunities = (opportunityRows ?? []).map((value) => {
          const row = value as Record<string, unknown>;
          const organizationId = typeof row.organization_id === 'string' ? row.organization_id : '';
          const recruiterName = typeof row.recruiter_name === 'string' ? row.recruiter_name.trim() : '';
          const roleTitle = [row.role_title, row.job_title, row.title].find(
            (field): field is string => typeof field === 'string' && Boolean(field.trim())
          );
          const description = [row.description, row.job_description].find(
            (field): field is string => typeof field === 'string' && Boolean(field.trim())
          );

          return {
            kind: 'opportunity' as const,
            id: String(row.id),
            organization_id: organizationId,
            role_title: roleTitle?.trim() || 'Open Opportunity',
            recruiter_name: recruiterName || 'Verified Organization',
            company_name: readOrganizationName(row.organizations) || companyNames.get(organizationId) || recruiterName,
            description: description?.trim() || '',
            core_skills: normalizeSkills(row.core_skills),
            status: typeof row.status === 'string' ? row.status : 'active',
          };
        });

        if (active) setResults(opportunities);
      } catch (error) {
        if (active) {
          setResults([]);
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load search results.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadResults();
    return () => {
      active = false;
    };
  }, [supabase, userRole]);

  const filteredResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return results;

    return results.filter((result) => {
      if (userRole === 'organization' && result.kind === 'candidate') {
        return [result.role_title, result.bio, ...result.skills]
          .some((value) => value.toLowerCase().includes(query));
      }

      if (userRole === 'candidate' && result.kind === 'opportunity') {
        return [result.role_title, result.recruiter_name, result.company_name]
          .some((value) => value.toLowerCase().includes(query));
      }

      return false;
    });
  }, [results, searchQuery, userRole]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] px-5 py-10 text-white sm:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-2xl sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Dual Network Search</p>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">
            {userRole === 'organization' ? 'Discover verified candidates' : 'Discover open opportunities'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            {userRole === 'organization'
              ? 'Search candidate roles, bios, and verified skill tags in real time.'
              : 'Search roles and verified organizations across the MeliusIQ opportunity network.'}
          </p>

          <div className="relative mt-7">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-300" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={userRole === 'organization' ? 'Search candidate skills, roles, or keywords...' : 'Search roles or companies...'}
              className="w-full rounded-2xl border border-slate-700/80 bg-[#06091a]/90 py-4 pl-14 pr-5 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20"
            />
          </div>
        </div>

        <div className="mt-7">
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-[#06091a]/70 px-6 py-14 text-sm text-slate-400">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              Loading network results...
            </div>
          ) : errorMessage ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] px-6 py-5 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : filteredResults.length ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {filteredResults.map((result) =>
                result.kind === 'candidate' ? (
                  <CandidateCard key={result.id} candidate={result} />
                ) : (
                  <OpportunityCard key={result.id} opportunity={result} />
                )
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-[#040615]/50 px-6 py-14 text-center">
              <Search className="mx-auto h-6 w-6 text-slate-600" aria-hidden="true" />
              <p className="mt-4 text-sm font-medium text-slate-400">No results match your search.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
