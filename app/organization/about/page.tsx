'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Clock3,
  Cpu,
  Gauge,
  Laptop,
  Pencil,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

const FALLBACK_COMPANY_NAME = 'MeliusAI';
const FALLBACK_MISSION =
  'We build intelligent career infrastructure that turns verified work into trusted opportunity, helping ambitious people and modern teams move with greater clarity.';

const pillars = [
  {
    title: 'Autonomous Execution',
    description:
      'We trust people with meaningful ownership, clear outcomes, and the room to make high-impact decisions from day one.',
    icon: Rocket,
    accent: 'from-cyan-400/20 to-blue-500/5',
  },
  {
    title: 'Velocity > Bureaucracy',
    description:
      'Small, focused teams ship quickly, learn from real signals, and turn strong ideas into useful products without ceremony.',
    icon: Gauge,
    accent: 'from-purple-400/20 to-fuchsia-500/5',
  },
  {
    title: 'AI-Native Operations',
    description:
      'AI is woven into how we research, build, verify, and improve—not added as a decorative layer after the work is done.',
    icon: Cpu,
    accent: 'from-emerald-400/20 to-cyan-500/5',
  },
] as const;

const technologies = ['Next.js', 'Tailwind CSS', 'FastAPI', 'Supabase', 'PostgreSQL', 'AI Matcher Engine'] as const;

const perks = [
  {
    title: 'Flexible Hours',
    description: 'Protect your highest-energy hours and build a sustainable rhythm around meaningful outcomes.',
    icon: Clock3,
  },
  {
    title: 'Hybrid Independence',
    description: 'Work with real autonomy while staying closely connected to a focused, collaborative team.',
    icon: Laptop,
  },
  {
    title: 'Equipment Allowances',
    description: 'Get the tools and workspace support needed to do exceptional work without friction.',
    icon: WalletCards,
  },
  {
    title: 'Competitive Equity',
    description: 'Share meaningfully in the long-term value you help create as the organization grows.',
    icon: TrendingUp,
  },
] as const;

export default function OrganizationAboutPage() {
  const { loading: authLoading, profile, supabase, user } = useViewerProfile();
  const [companyName, setCompanyName] = useState(FALLBACK_COMPANY_NAME);
  const [missionText, setMissionText] = useState(FALLBACK_MISSION);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draftCompanyName, setDraftCompanyName] = useState(FALLBACK_COMPANY_NAME);
  const [draftMissionText, setDraftMissionText] = useState(FALLBACK_MISSION);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const userMetadata = (user?.user_metadata ?? {}) as { company_name?: string };
  const contextCompanyName =
    userMetadata.company_name || profile?.company_name || profile?.display_name || FALLBACK_COMPANY_NAME;

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    async function fetchOrgProfile() {
      setIsProfileLoading(true);

      try {
        if (!supabase) return;

        let organization: Record<string, unknown> | null = null;

        if (user?.id) {
          const { data: userRows, error: userLookupError } = await supabase
            .from('organizations')
            .select('*')
            .eq('user_id', user.id)
            .limit(1);

          if (userLookupError) throw userLookupError;
          organization = userRows && userRows.length > 0 ? userRows[0] : null;
        }

        if (!organization) {
          const { data: companyRows, error: companyLookupError } = await supabase
            .from('organizations')
            .select('*')
            .ilike('company_name', contextCompanyName)
            .limit(1);

          if (companyLookupError) throw companyLookupError;
          organization = companyRows && companyRows.length > 0 ? companyRows[0] : null;
        }

        if (organization && active) {
          const savedCompanyName =
            typeof organization.company_name === 'string' ? organization.company_name.trim() : '';
          const savedMission =
            typeof organization.mission_text === 'string' ? organization.mission_text.trim() : '';

          setCompanyName(savedCompanyName || contextCompanyName || FALLBACK_COMPANY_NAME);
          setMissionText(savedMission || FALLBACK_MISSION);
          setDraftCompanyName(savedCompanyName || contextCompanyName || FALLBACK_COMPANY_NAME);
          setDraftMissionText(savedMission || FALLBACK_MISSION);
        } else if (active) {
          setCompanyName(contextCompanyName || FALLBACK_COMPANY_NAME);
          setMissionText(FALLBACK_MISSION);
          setDraftCompanyName(contextCompanyName || FALLBACK_COMPANY_NAME);
          setDraftMissionText(FALLBACK_MISSION);
        }
      } catch (error) {
        console.error('Unable to load the public organization profile:', error);
        if (active) {
          setCompanyName(contextCompanyName || FALLBACK_COMPANY_NAME);
          setMissionText(FALLBACK_MISSION);
        }
      } finally {
        if (active) setIsProfileLoading(false);
      }
    }

    void fetchOrgProfile();
    return () => {
      active = false;
    };
  }, [authLoading, contextCompanyName, supabase, user?.id]);

  function enterEditMode() {
    setDraftCompanyName(companyName);
    setDraftMissionText(missionText);
    setSaveError(null);
    setIsEditing(true);
  }

  function cancelEditMode() {
    setDraftCompanyName(companyName);
    setDraftMissionText(missionText);
    setSaveError(null);
    setIsEditing(false);
  }

  async function handleSaveProfile() {
    if (!supabase || !user?.id) {
      setSaveError('Sign in to edit this organization profile.');
      return;
    }

    const nextCompanyName = draftCompanyName.trim();
    const nextMissionText = draftMissionText.trim();
    if (!nextCompanyName || !nextMissionText) {
      setSaveError('Company name and mission statement are required.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const { data: userRows, error: userLookupError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (userLookupError) throw userLookupError;
      let existingOrganization = userRows && userRows.length > 0 ? userRows[0] : null;

      if (!existingOrganization) {
        const { data: companyRows, error: companyLookupError } = await supabase
          .from('organizations')
          .select('id')
          .ilike('company_name', companyName)
          .limit(1);

        if (companyLookupError) throw companyLookupError;
        existingOrganization = companyRows && companyRows.length > 0 ? companyRows[0] : null;
      }

      if (existingOrganization?.id) {
        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            company_name: nextCompanyName,
            mission_text: nextMissionText,
            user_id: user.id,
          })
          .eq('id', existingOrganization.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('organizations').insert([
          {
            company_name: nextCompanyName,
            mission_text: nextMissionText,
            user_id: user.id,
          },
        ]);

        if (insertError) throw insertError;
      }

      setCompanyName(nextCompanyName);
      setMissionText(nextMissionText);
      setSaveError(null);
      setIsEditing(false);
    } catch (error: any) {
      console.error('Manifesto save failed:', error);
      setSaveError(
        error?.message ||
          error?.error_description ||
          (typeof error === 'object' ? JSON.stringify(error) : String(error))
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030512] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.13),transparent_30%),radial-gradient(circle_at_85%_8%,rgba(168,85,247,0.18),transparent_34%),radial-gradient(circle_at_50%_75%,rgba(37,99,235,0.09),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />

      <div className="relative mx-auto w-full max-w-7xl px-5 pb-20 pt-6 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-tight text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
              <Boxes className="h-4 w-4" />
            </span>
            MeliusIQ Workspace
          </Link>
          <Link
            href="/organization/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/35 hover:text-cyan-100"
          >
            Workspace dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>

        <section className="relative py-20 sm:py-28 lg:py-32">
          <div className="max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200 shadow-[0_0_30px_rgba(52,211,153,0.1)]">
                <BadgeCheck className="h-4 w-4" />
                Verified Workspace
              </div>
              {user?.id && !isEditing ? (
                <button
                  type="button"
                  onClick={enterEditMode}
                  className="inline-flex items-center gap-2 rounded-full border border-purple-300/25 bg-purple-500/10 px-4 py-2 text-xs font-bold text-purple-100 transition hover:border-purple-200/50 hover:bg-purple-500/15"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Profile
                </button>
              ) : null}
            </div>

            <p className="mt-8 text-xs font-bold uppercase tracking-[0.28em] text-slate-500">Meet the organization</p>
            {isEditing ? (
              <div className="mt-5 rounded-[1.75rem] border border-purple-300/20 bg-[#090c1c]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-7">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Company name</span>
                  <input
                    type="text"
                    value={draftCompanyName}
                    onChange={(event) => setDraftCompanyName(event.target.value)}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/25 px-5 py-4 text-2xl font-bold text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 sm:text-4xl"
                  />
                </label>

                <label className="mt-6 block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Mission statement</span>
                  <textarea
                    value={draftMissionText}
                    onChange={(event) => setDraftMissionText(event.target.value)}
                    rows={6}
                    className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-black/25 px-5 py-4 text-base leading-8 text-slate-200 outline-none transition focus:border-purple-300/50 focus:ring-2 focus:ring-purple-300/10"
                  />
                </label>

                {saveError ? (
                  <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
                    {saveError}
                  </p>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={cancelEditMode}
                    disabled={isSaving}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-5 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(34,211,238,0.12)] transition hover:border-cyan-200/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="mt-5 bg-gradient-to-r from-white via-cyan-100 to-purple-300 bg-clip-text text-5xl font-black leading-[0.95] tracking-[-0.05em] text-transparent sm:text-7xl lg:text-[7.4rem]">
                  {companyName}
                </h1>
                <p className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10">
                  {missionText}
                </p>
              </>
            )}

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/organization/talent-discovery"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 px-6 py-3 text-sm font-bold text-cyan-50 shadow-[0_0_36px_rgba(34,211,238,0.14)] transition hover:border-cyan-200/70 hover:shadow-[0_0_42px_rgba(34,211,238,0.22)]"
              >
                Explore our opportunity hub
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <ShieldCheck className="h-4 w-4 text-purple-300" />
                Profile verified by MeliusIQ
              </span>
            </div>

            {isProfileLoading ? (
              <div className="mt-8 flex items-center gap-2 text-xs font-medium text-slate-600" role="status">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
                Synchronizing verified workspace details
              </div>
            ) : null}
          </div>
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-purple-300">How we execute</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Built for people who move ideas forward.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pillars.map((pillar, index) => {
              const Icon = pillar.icon;
              return (
                <article
                  key={pillar.title}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a0d1d]/85 p-7 shadow-[0_24px_70px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-1 hover:border-white/20"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${pillar.accent} opacity-70`} />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-xs font-black tracking-[0.2em] text-white/20">0{index + 1}</span>
                    </div>
                    <h3 className="mt-8 text-xl font-semibold text-white">{pillar.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-slate-400">{pillar.description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 border-t border-white/10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Technology canvas</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              A modern stack for ambitious systems.
            </h2>
          </div>

          <div className="flex flex-wrap gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
            {technologies.map((technology) => (
              <span
                key={technology}
                className="rounded-full border border-purple-300/20 bg-purple-500/[0.08] px-4 py-2.5 text-sm font-semibold text-purple-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                {technology}
              </span>
            ))}
          </div>
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Workspace perks</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            High standards, human working conditions.
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {perks.map((perk) => {
              const Icon = perk.icon;
              return (
                <article key={perk.title} className="rounded-2xl border border-white/10 bg-[#080b19]/75 p-6">
                  <Icon className="h-5 w-5 text-emerald-300" />
                  <h3 className="mt-6 text-base font-semibold text-white">{perk.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{perk.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-white/10 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {companyName}. Verified through MeliusIQ.</p>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Protected workspace profile
          </span>
        </footer>
      </div>
    </main>
  );
}
