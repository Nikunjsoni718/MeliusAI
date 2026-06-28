'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  History,
  Pencil,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

const OPPORTUNITY_API_BASE = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');

type OpportunityForm = {
  job_title: string;
  core_requirements: string;
};

type OpportunityHistoryItem = {
  id: string;
  recruiter_name: string;
  role_title: string;
  description: string;
  core_skills: string;
  created_at: string | null;
};

export function OrganizationJobPostingHub() {
  const { loading, profile, supabase, user } = useViewerProfile();
  const [formData, setFormData] = useState<OpportunityForm>({
    job_title: '',
    core_requirements: '',
  });
  const [coreSkills, setCoreSkills] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<OpportunityHistoryItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);

  const userMetadata = (user?.user_metadata ?? {}) as {
    organization_id?: string;
    org_id?: string;
    workspace_id?: string;
    company_name?: string;
  };
  const organizationId =
    userMetadata.organization_id || userMetadata.org_id || userMetadata.workspace_id || profile?.id || user?.id || '';
  const organizationName =
    userMetadata.company_name || profile?.company_name || profile?.display_name || 'Verified Organisation';

  const getSessionAccessToken = useCallback(async () => {
    if (!supabase) {
      return null;
    }

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    return session?.access_token ?? null;
  }, [supabase]);

  const fetchHistory = useCallback(async () => {
    if (loading) {
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        setHistoryList([]);
        throw new Error('Please sign in to view your opportunity archive.');
      }

      const response = await fetch(
        `${OPPORTUNITY_API_BASE}/api/organization-opportunities?recruiter_name=${encodeURIComponent(organizationName)}`,
        {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const detail =
          payload && typeof payload === 'object' && 'detail' in payload
            ? String((payload as { detail?: unknown }).detail || '')
            : '';
        throw new Error(detail || `History request failed (HTTP ${response.status}).`);
      }
      if (!Array.isArray(payload)) {
        throw new Error('Opportunity history returned an invalid response.');
      }

      const normalizedHistory = payload
        .map((value): OpportunityHistoryItem | null => {
          if (!value || typeof value !== 'object') {
            return null;
          }

          const row = value as Record<string, unknown>;
          const id = typeof row.id === 'string' ? row.id.trim() : '';
          const roleTitle = typeof row.role_title === 'string' ? row.role_title.trim() : '';
          if (!id || !roleTitle) {
            return null;
          }

          const descriptionSource = row.description ?? row.job_description ?? row.core_requirements;
          return {
            id,
            recruiter_name:
              typeof row.recruiter_name === 'string' ? row.recruiter_name.trim() : organizationName,
            role_title: roleTitle,
            description: typeof descriptionSource === 'string' ? descriptionSource.trim() : '',
            core_skills: typeof row.core_skills === 'string' ? row.core_skills.trim() : '',
            created_at: typeof row.created_at === 'string' ? row.created_at : null,
          };
        })
        .filter((item): item is OpportunityHistoryItem => item !== null);

      setHistoryList(normalizedHistory);
      setHistoryError(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to load broadcast history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [getSessionAccessToken, loading, organizationName]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  function updateField<Field extends keyof OpportunityForm>(field: Field, value: OpportunityForm[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleEdit(item: OpportunityHistoryItem) {
    setEditingId(item.id);
    setFormData({
      job_title: item.role_title,
      core_requirements: item.description,
    });
    setCoreSkills(item.core_skills);
    setSuccessMessage(null);
    setErrorMessage(null);

    window.requestAnimationFrame(() => {
      document.getElementById('opportunity-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleDelete(id: string) {
    setHistoryActionId(id);
    setHistoryError(null);
    setSuccessMessage(null);

    try {
      const accessToken = await getSessionAccessToken();

      if (!accessToken) {
        throw new Error('Please sign in to delete this opportunity.');
      }

      const response = await fetch(
        `${OPPORTUNITY_API_BASE}/api/delete-opportunity?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; detail?: string }
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || `Delete request failed (HTTP ${response.status}).`);
      }

      if (editingId === id) {
        setEditingId(null);
        setFormData({ job_title: '', core_requirements: '' });
        setCoreSkills('');
      }
      setSuccessMessage('Opportunity deleted successfully.');
      await fetchHistory();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Unable to delete this opportunity.');
    } finally {
      setHistoryActionId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formData.job_title.trim() || !formData.core_requirements.trim()) {
      setErrorMessage('Add a job title and core requirements before broadcasting.');
      return;
    }

    setIsPublishing(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const isEditing = Boolean(editingId);
      const keywordResponse = await fetch('/api/extract-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: formData.core_requirements.trim() }),
      });
      const keywordPayload = (await keywordResponse.json().catch(() => null)) as
        | { tags?: string; error?: string }
        | null;

      if (!keywordResponse.ok || !keywordPayload?.tags?.trim()) {
        throw new Error(
          keywordPayload?.error || `Keyword extraction failed (HTTP ${keywordResponse.status}).`
        );
      }

      const extractedCoreSkills = keywordPayload.tags.trim();
      setCoreSkills(extractedCoreSkills);

      const authResult = supabase ? await supabase.auth.getUser() : null;
      if (authResult?.error) {
        throw authResult.error;
      }

      const loggedInUser = authResult?.data.user || user;
      if (!loggedInUser?.id) {
        throw new Error('Unable to identify the authenticated organization account. Please sign in again.');
      }

      let resolvedOrganizationId = organizationId;
      if (supabase) {
        const { data: organizationRows, error: organizationError } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', loggedInUser.id)
          .limit(1);

        if (organizationError) {
          throw organizationError;
        }

        resolvedOrganizationId = organizationRows?.[0]?.id || resolvedOrganizationId;
      }

      resolvedOrganizationId ||= loggedInUser.id;
      const loggedInUserEmail =
        loggedInUser.email?.trim().toLowerCase() ||
        '';
      const accessToken = await getSessionAccessToken();

      if (!isEditing && !loggedInUserEmail) {
        throw new Error('Unable to resolve the authenticated organization email. Please sign in again.');
      }
      if (!accessToken) {
        throw new Error('Your session expired. Please sign in again before broadcasting.');
      }

      const response = await fetch(
        `${OPPORTUNITY_API_BASE}${isEditing ? '/api/update-opportunity' : '/api/create-opportunity'}`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-Organization-Id': resolvedOrganizationId,
            'X-Company-Name': encodeURIComponent(organizationName),
            'X-Company-Email': loggedInUserEmail,
          },
          body: JSON.stringify({
            ...(editingId ? { id: editingId } : {}),
            job_title: formData.job_title.trim(),
            core_requirements: formData.core_requirements.trim(),
            core_skills: extractedCoreSkills,
            company_email: loggedInUserEmail,
            organization_id: resolvedOrganizationId,
          }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; detail?: string }
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || `Opportunity broadcast failed (HTTP ${response.status}).`);
      }

      setFormData({
        job_title: '',
        core_requirements: '',
      });
      setCoreSkills('');
      setEditingId(null);
      setSuccessMessage(
        isEditing
          ? 'Opportunity broadcast updated successfully!'
          : 'Opportunity successfully broadcasted to the candidate network!'
      );
      await fetchHistory();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The opportunity could not be broadcasted. Please try again.'
      );
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(88,28,135,0.24),transparent_34%),linear-gradient(135deg,#080a18_0%,#030512_55%,#071124_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/5 blur-3xl" />

      {successMessage ? (
        <div
          className="fixed right-5 top-5 z-50 flex max-w-md items-start gap-3 rounded-2xl border border-emerald-400/30 bg-[#071a18]/95 px-5 py-4 text-sm text-emerald-100 shadow-[0_0_38px_rgba(52,211,153,0.16)] backdrop-blur-xl"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          {successMessage}
        </div>
      ) : null}

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="border-b border-[#1F223D] pb-7">
          <Link
            href="/organization/dashboard"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-cyan-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Organization Dashboard
          </Link>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-purple-200 shadow-[0_0_28px_rgba(168,85,247,0.15)]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-purple-300">Recruiter Broadcast Console</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Organization Job Posting Hub</h1>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1F223D] bg-[#121424]/80 px-4 py-3 text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Active workspace</p>
              <p className="mt-1 max-w-56 truncate text-sm font-semibold text-cyan-100">
                {loading ? 'Resolving organization...' : organizationName}
              </p>
            </div>
          </div>

          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-400">
            Publish a clear role brief to the verified MeliusAI candidate network. Strong requirements make stronger matches.
          </p>
        </header>

        <section
          id="opportunity-form"
          className="mt-8 scroll-mt-6 overflow-hidden rounded-[2rem] border border-[#1F223D] bg-[#121424]/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl"
        >
          <div className="border-b border-[#1F223D] bg-gradient-to-r from-purple-500/[0.08] via-transparent to-cyan-500/[0.08] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {editingId ? 'Edit opportunity broadcast' : 'Create a new opportunity'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">All fields are shared with matching candidates.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
            <div className="w-full">
              <label className="block w-full space-y-2 text-sm font-medium text-slate-300">
                <span className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 text-purple-300" />
                  Job title
                </span>
                <input
                  name="job_title"
                  type="text"
                  required
                  value={formData.job_title}
                  onChange={(event) => updateField('job_title', event.target.value)}
                  placeholder="Frontend Developer - React specialist"
                  className="h-12 w-full rounded-xl border border-[#1F223D] bg-[#090b19] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/15"
                />
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-slate-300">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-cyan-300" />
                Core requirements
              </span>
              <textarea
                name="core_requirements"
                required
                rows={9}
                value={formData.core_requirements}
                onChange={(event) => updateField('core_requirements', event.target.value)}
                placeholder="Describe the role, expected outcomes, essential skills, seniority, and the kind of verified portfolio evidence you want to see..."
                className="w-full resize-y rounded-2xl border border-[#1F223D] bg-[#090b19] px-4 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-slate-600 focus:border-purple-400/60 focus:ring-2 focus:ring-purple-400/15"
              />
            </label>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-4 border-t border-[#1F223D] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500">
                Posting as <span className="font-semibold text-slate-300">{organizationName}</span>
              </p>
              <button
                type="submit"
                disabled={isPublishing || loading || !organizationId}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/25 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.14)] transition hover:border-cyan-200/70 hover:shadow-[0_0_34px_rgba(34,211,238,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPublishing ? <Sparkles className="h-4 w-4 animate-pulse" /> : editingId ? <Pencil className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {isPublishing
                  ? 'Analyzing & Posting...'
                  : editingId
                    ? '⚠️ UPDATE BROADCAST'
                    : 'Broadcast Opportunity'}
              </button>
            </div>
          </form>
        </section>

        <div className="my-10 h-px w-full bg-gradient-to-r from-transparent via-[#1F223D] to-transparent" />

        <section aria-labelledby="broadcast-history-title" className="pb-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
              <History className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Opportunity archive</p>
              <h2 id="broadcast-history-title" className="mt-1 text-2xl font-semibold tracking-tight text-white">
                Your Broadcast History
              </h2>
            </div>
          </div>

          {historyError ? (
            <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
              {historyError}
            </div>
          ) : null}

          <div className="mt-6 space-y-3">
            {historyLoading ? (
              [0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-2xl border border-[#1F223D] bg-[#121424]/75 px-5 py-5"
                >
                  <div className="h-5 w-2/3 rounded-full bg-white/10" />
                  <div className="mt-3 h-3 w-36 rounded-full bg-white/5" />
                </div>
              ))
            ) : historyList.length > 0 ? (
              historyList.map((item) => {
                const createdDate = item.created_at ? new Date(item.created_at) : null;
                const dateLabel =
                  createdDate && !Number.isNaN(createdDate.getTime())
                    ? createdDate.toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Date unavailable';

                return (
                  <article
                    key={item.id}
                    className="flex flex-col gap-5 rounded-2xl border border-[#1F223D] bg-gradient-to-r from-[#101326] to-[#090b19] px-5 py-5 shadow-[0_16px_45px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-100">{item.role_title}</h3>
                      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        Published {dateLabel}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        disabled={historyActionId === item.id}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-100 transition hover:border-cyan-300/60 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit Post
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        disabled={historyActionId === item.id}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-200 transition hover:border-rose-300/70 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {historyActionId === item.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-[#1F223D] bg-[#0b0d1b]/70 px-5 py-8 text-center text-sm text-slate-500">
                No opportunity broadcasts have been published yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default OrganizationJobPostingHub;
