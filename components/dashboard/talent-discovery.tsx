'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileText,
  Send,
  Sparkles,
} from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

const OPPORTUNITY_API_BASE = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');

const TARGET_ROLES = ['UI/UX Designer', 'Frontend Developer', 'Fullstack Engineer'] as const;

type OpportunityForm = {
  job_title: string;
  target_role: (typeof TARGET_ROLES)[number];
  job_description: string;
};

export function OrganizationJobPostingHub() {
  const { loading, profile, user } = useViewerProfile();
  const [formData, setFormData] = useState<OpportunityForm>({
    job_title: '',
    target_role: 'UI/UX Designer',
    job_description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  function updateField<Field extends keyof OpportunityForm>(field: Field, value: OpportunityForm[Field]) {
    setFormData((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organizationId) {
      setErrorMessage('Unable to identify the active organization workspace. Please sign in again.');
      return;
    }

    if (!formData.job_title.trim() || !formData.job_description.trim()) {
      setErrorMessage('Add a job title and core requirement description before broadcasting.');
      return;
    }

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${OPPORTUNITY_API_BASE}/api/create-opportunity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          job_title: formData.job_title.trim(),
          job_description: formData.job_description.trim(),
          organization_id: organizationId,
          organization_name: organizationName,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; detail?: string }
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.detail || `Opportunity broadcast failed (HTTP ${response.status}).`);
      }

      setFormData({
        job_title: '',
        target_role: 'UI/UX Designer',
        job_description: '',
      });
      setSuccessMessage('Opportunity successfully broadcasted to the candidate network!');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The opportunity could not be broadcasted. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
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

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-[#1F223D] bg-[#121424]/95 shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="border-b border-[#1F223D] bg-gradient-to-r from-purple-500/[0.08] via-transparent to-cyan-500/[0.08] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <BriefcaseBusiness className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Create a new opportunity</h2>
                <p className="mt-1 text-xs text-slate-500">All fields are shared with matching candidates.</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-300">
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

              <label className="space-y-2 text-sm font-medium text-slate-300">
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-300" />
                  Target role
                </span>
                <select
                  name="target_role"
                  value={formData.target_role}
                  onChange={(event) =>
                    updateField('target_role', event.target.value as OpportunityForm['target_role'])
                  }
                  className="h-12 w-full rounded-xl border border-[#1F223D] bg-[#090b19] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/15"
                >
                  {TARGET_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-slate-300">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-cyan-300" />
                Core requirements
              </span>
              <textarea
                name="job_description"
                required
                rows={9}
                value={formData.job_description}
                onChange={(event) => updateField('job_description', event.target.value)}
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
                disabled={isSubmitting || loading || !organizationId}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/25 px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.14)] transition hover:border-cyan-200/70 hover:shadow-[0_0_34px_rgba(34,211,238,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? 'Broadcasting...' : 'Broadcast Opportunity'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

export default OrganizationJobPostingHub;
