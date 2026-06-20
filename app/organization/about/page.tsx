'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  Cpu,
  Pencil,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

const DEFAULT_COMPANY = 'MeliusAI';
const DEFAULT_BIO =
  'We build intelligent career infrastructure that turns verified work into trusted opportunity for ambitious people and modern teams.';
const DEFAULT_PILLAR_1_TITLE = 'Core Principle';
const DEFAULT_PILLAR_1_DESC = 'Your description here...';
const DEFAULT_PILLAR_2_TITLE = 'Execution Style';
const DEFAULT_PILLAR_2_DESC = 'Your description here...';
const DEFAULT_TECH = 'Next.js, Supabase';
const DEFAULT_PERKS = 'Flexible Hours, Competitive Equity';

type BrochureFields = {
  companyName: string;
  bioText: string;
  pillar1Title: string;
  pillar1Desc: string;
  pillar2Title: string;
  pillar2Desc: string;
  techInput: string;
  perksInput: string;
};

function readText(row: Record<string, unknown>, key: string, fallback: string) {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseCommaList(value: string, fallback: string) {
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback.split(',').map((item) => item.trim());
}

function OrganizationManifestoPageContent() {
  const searchParams = useSearchParams();
  const publicOrganizationId = searchParams.get('organization_id')?.trim() || null;
  const { loading: authLoading, profile, supabase, user } = useViewerProfile();
  const [companyName, setCompanyName] = useState('');
  const [bioText, setBioText] = useState('');
  const [pillar1Title, setPillar1Title] = useState(DEFAULT_PILLAR_1_TITLE);
  const [pillar1Desc, setPillar1Desc] = useState(DEFAULT_PILLAR_1_DESC);
  const [pillar2Title, setPillar2Title] = useState(DEFAULT_PILLAR_2_TITLE);
  const [pillar2Desc, setPillar2Desc] = useState(DEFAULT_PILLAR_2_DESC);
  const [techInput, setTechInput] = useState(DEFAULT_TECH);
  const [perksInput, setPerksInput] = useState(DEFAULT_PERKS);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const editSnapshot = useRef<BrochureFields | null>(null);

  const userMetadata = (user?.user_metadata ?? {}) as { company_name?: string };
  const contextCompanyName =
    userMetadata.company_name || profile?.company_name || profile?.display_name || DEFAULT_COMPANY;

  const currentFields = (): BrochureFields => ({
    companyName,
    bioText,
    pillar1Title,
    pillar1Desc,
    pillar2Title,
    pillar2Desc,
    techInput,
    perksInput,
  });

  function applyFields(fields: BrochureFields) {
    setCompanyName(fields.companyName);
    setBioText(fields.bioText);
    setPillar1Title(fields.pillar1Title);
    setPillar1Desc(fields.pillar1Desc);
    setPillar2Title(fields.pillar2Title);
    setPillar2Desc(fields.pillar2Desc);
    setTechInput(fields.techInput);
    setPerksInput(fields.perksInput);
  }

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    async function fetchOrgProfile() {
      setIsLoading(true);

      try {
        if (!supabase) return;

        let organization: Record<string, unknown> | null = null;
        if (publicOrganizationId) {
          const { data: publicRows, error: publicError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', publicOrganizationId)
            .limit(1);

          if (publicError) throw publicError;
          organization = publicRows && publicRows.length > 0 ? publicRows[0] : null;
        } else if (user?.id) {
          const { data: userRows, error: userError } = await supabase
            .from('organizations')
            .select('*')
            .eq('user_id', user.id)
            .limit(1);

          if (userError) throw userError;
          organization = userRows && userRows.length > 0 ? userRows[0] : null;
        }

        if (!organization && !publicOrganizationId) {
          const { data: companyRows, error: companyError } = await supabase
            .from('organizations')
            .select('*')
            .ilike('company_name', contextCompanyName)
            .limit(1);

          if (companyError) throw companyError;
          organization = companyRows && companyRows.length > 0 ? companyRows[0] : null;
        }

        if (!active) return;

        const loadedFields: BrochureFields = organization
          ? {
              companyName: readText(organization, 'company_name', contextCompanyName),
              bioText: readText(organization, 'mission_text', DEFAULT_BIO),
              pillar1Title: readText(organization, 'pillar1_title', DEFAULT_PILLAR_1_TITLE),
              pillar1Desc: readText(organization, 'pillar1_desc', DEFAULT_PILLAR_1_DESC),
              pillar2Title: readText(organization, 'pillar2_title', DEFAULT_PILLAR_2_TITLE),
              pillar2Desc: readText(organization, 'pillar2_desc', DEFAULT_PILLAR_2_DESC),
              techInput: readText(organization, 'tech_input', DEFAULT_TECH),
              perksInput: readText(organization, 'perks_input', DEFAULT_PERKS),
            }
          : {
              companyName: contextCompanyName,
              bioText: DEFAULT_BIO,
              pillar1Title: DEFAULT_PILLAR_1_TITLE,
              pillar1Desc: DEFAULT_PILLAR_1_DESC,
              pillar2Title: DEFAULT_PILLAR_2_TITLE,
              pillar2Desc: DEFAULT_PILLAR_2_DESC,
              techInput: DEFAULT_TECH,
              perksInput: DEFAULT_PERKS,
            };

        applyFields(loadedFields);
      } catch (error) {
        console.error('Unable to load the organization manifesto:', error);
        if (active) {
          setCompanyName(contextCompanyName);
          setBioText(DEFAULT_BIO);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void fetchOrgProfile();
    return () => {
      active = false;
    };
  }, [authLoading, contextCompanyName, publicOrganizationId, supabase, user?.id]);

  function enterEditMode() {
    editSnapshot.current = currentFields();
    setSaveError(null);
    setSaveSuccess(false);
    setIsEditing(true);
  }

  function cancelEditMode() {
    if (editSnapshot.current) applyFields(editSnapshot.current);
    setSaveError(null);
    setIsEditing(false);
  }

  async function handleSaveProfile() {
    if (!supabase || !user?.id) {
      setSaveError('Sign in to edit this organization profile.');
      return;
    }

    const normalizedFields: BrochureFields = {
      companyName: companyName.trim(),
      bioText: bioText.trim(),
      pillar1Title: pillar1Title.trim(),
      pillar1Desc: pillar1Desc.trim(),
      pillar2Title: pillar2Title.trim(),
      pillar2Desc: pillar2Desc.trim(),
      techInput: techInput.trim(),
      perksInput: perksInput.trim(),
    };

    if (!normalizedFields.companyName || !normalizedFields.bioText) {
      setSaveError('Company name and mission statement are required.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const { data: userRows, error: userLookupError } = await supabase
        .from('organizations')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      if (userLookupError) throw userLookupError;
      let organization = userRows && userRows.length > 0 ? userRows[0] : null;

      if (!organization) {
        const lookupName = editSnapshot.current?.companyName || contextCompanyName;
        const { data: companyRows, error: companyLookupError } = await supabase
          .from('organizations')
          .select('id')
          .ilike('company_name', lookupName)
          .limit(1);

        if (companyLookupError) throw companyLookupError;
        organization = companyRows && companyRows.length > 0 ? companyRows[0] : null;
      }

      const databaseFields = {
        user_id: user.id,
        company_name: normalizedFields.companyName,
        mission_text: normalizedFields.bioText,
        pillar1_title: normalizedFields.pillar1Title,
        pillar1_desc: normalizedFields.pillar1Desc,
        pillar2_title: normalizedFields.pillar2Title,
        pillar2_desc: normalizedFields.pillar2Desc,
        tech_input: normalizedFields.techInput,
        perks_input: normalizedFields.perksInput,
      };

      if (organization?.id) {
        const { error: updateError } = await supabase
          .from('organizations')
          .update(databaseFields)
          .eq('id', organization.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('organizations').insert([databaseFields]);
        if (insertError) throw insertError;
      }

      applyFields(normalizedFields);
      editSnapshot.current = null;
      setSaveError(null);
      setSaveSuccess(true);
      setIsEditing(false);
      window.setTimeout(() => setSaveSuccess(false), 2400);
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

  const displayCompanyName = companyName || DEFAULT_COMPANY;
  const displayBio = bioText || DEFAULT_BIO;
  const techTags = parseCommaList(techInput, DEFAULT_TECH);
  const perkItems = parseCommaList(perksInput, DEFAULT_PERKS);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030512] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,0.13),transparent_30%),radial-gradient(circle_at_85%_8%,rgba(168,85,247,0.18),transparent_34%),radial-gradient(circle_at_50%_75%,rgba(37,99,235,0.09),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />

      <div className="relative mx-auto w-full max-w-7xl px-5 pb-20 pt-6 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
              <Boxes className="h-4 w-4" />
            </span>
            MeliusIQ Workspace
          </Link>
          <Link
            href={publicOrganizationId ? '/home' : '/organization/dashboard'}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/35 hover:text-cyan-100"
          >
            {publicOrganizationId ? 'Candidate dashboard' : 'Workspace dashboard'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200">
            <BadgeCheck className="h-4 w-4" />
            Verified Workspace
          </div>
          {user?.id && !publicOrganizationId && !isEditing ? (
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

        {saveSuccess ? (
          <div className="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-[#071a18]/95 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-2xl" role="status">
            <CheckCircle2 className="h-4 w-4" />
            Manifesto updated successfully
          </div>
        ) : null}

        {isEditing ? (
          <section className="my-10 rounded-[2rem] border border-purple-300/20 bg-[#090c1c]/95 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.38)] sm:p-9">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Hero</p>
              <div className="mt-5 grid gap-5">
                <EditorInput label="Company name" value={companyName} onChange={setCompanyName} />
                <EditorTextarea label="Mission statement" value={bioText} onChange={setBioText} rows={5} />
              </div>
            </div>

            <EditorSection title="Company Principles">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <EditorInput label="Principle one title" value={pillar1Title} onChange={setPillar1Title} />
                  <EditorTextarea label="Principle one description" value={pillar1Desc} onChange={setPillar1Desc} />
                </div>
                <div className="space-y-4">
                  <EditorInput label="Principle two title" value={pillar2Title} onChange={setPillar2Title} />
                  <EditorTextarea label="Principle two description" value={pillar2Desc} onChange={setPillar2Desc} />
                </div>
              </div>
            </EditorSection>

            <EditorSection title="Infrastructure">
              <EditorTextarea
                label="Technology badges (comma-separated)"
                value={techInput}
                onChange={setTechInput}
                rows={3}
              />
            </EditorSection>

            <EditorSection title="Benefits">
              <EditorTextarea
                label="Workspace perks (comma-separated)"
                value={perksInput}
                onChange={setPerksInput}
                rows={3}
              />
            </EditorSection>

            {saveError ? (
              <p className="mt-6 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
                {saveError}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={cancelEditMode}
                disabled={isSaving}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-300 transition hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveProfile()}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-5 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(34,211,238,0.12)] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>
        ) : (
          <>
            <section className="py-20 sm:py-28 lg:py-32">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">Meet the organization</p>
              <h1 className="mt-5 max-w-6xl bg-gradient-to-r from-white via-cyan-100 to-purple-300 bg-clip-text text-5xl font-black leading-[0.95] tracking-[-0.05em] text-transparent sm:text-7xl lg:text-[7.4rem]">
                {displayCompanyName}
              </h1>
              <p className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10">
                {displayBio}
              </p>
              {isLoading ? (
                <p className="mt-8 text-xs font-medium text-slate-600" role="status">Synchronizing verified workspace details...</p>
              ) : null}
            </section>

            <section className="border-t border-white/10 py-16 sm:py-20">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-purple-300">Company principles</p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">How we turn intent into execution.</h2>
              <div className="mt-10 grid gap-5 md:grid-cols-2">
                {[
                  { title: pillar1Title, description: pillar1Desc, icon: Rocket, accent: 'from-cyan-400/20 to-blue-500/5' },
                  { title: pillar2Title, description: pillar2Desc, icon: Cpu, accent: 'from-purple-400/20 to-fuchsia-500/5' },
                ].map((pillar, index) => {
                  const Icon = pillar.icon;
                  return (
                    <article key={`${pillar.title}-${index}`} className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a0d1d]/85 p-8">
                      <div className={`absolute inset-0 bg-gradient-to-br ${pillar.accent}`} />
                      <div className="relative">
                        <Icon className="h-6 w-6 text-white" />
                        <h3 className="mt-8 text-2xl font-semibold">{pillar.title || `Principle ${index + 1}`}</h3>
                        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{pillar.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-8 border-t border-white/10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <Sparkles className="h-6 w-6 text-cyan-300" />
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Infrastructure</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">The ecosystem behind the work.</h2>
              </div>
              <div className="flex flex-wrap content-start gap-3 rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-7">
                {techTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-purple-300/20 bg-purple-500/[0.08] px-4 py-2.5 text-sm font-semibold text-purple-100">
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            <section className="border-t border-white/10 py-16 sm:py-20">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Benefits</p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">A workspace designed for sustainable ambition.</h2>
              <ul className="mt-10 grid gap-4 sm:grid-cols-2">
                {perkItems.map((perk) => (
                  <li key={perk} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#080b19]/75 p-5 text-sm font-semibold text-slate-200">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <footer className="flex flex-col gap-4 border-t border-white/10 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {displayCompanyName}. Verified through MeliusIQ.</p>
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Protected workspace profile</span>
        </footer>
      </div>
    </main>
  );
}

export default function OrganizationManifestoPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#030512]" />}>
      <OrganizationManifestoPageContent />
    </Suspense>
  );
}

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-white/10 pt-8">
      <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-purple-300">{title}</p>
      {children}
    </section>
  );
}

function EditorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10"
      />
    </label>
  );
}

function EditorTextarea({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-7 text-slate-200 outline-none transition focus:border-purple-300/50 focus:ring-2 focus:ring-purple-300/10"
      />
    </label>
  );
}
