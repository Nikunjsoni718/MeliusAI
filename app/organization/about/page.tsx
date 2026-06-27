'use client';

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  Cpu,
  Mail,
  Pencil,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

const DEFAULT_COMPANY = 'MeliusAI';

type OrgProfileData = {
  company_email: string;
  hero_eyebrow: string;
  mission_title: string;
  mission_text: string;
  section1_heading: string;
  pillar1_title: string;
  pillar1_desc: string;
  pillar2_title: string;
  pillar2_desc: string;
  section2_heading: string;
  tech_input: string;
  pillar3_title: string;
  pillar3_desc: string;
  perks_input: string;
  loadingStatusText: string;
};

type OrganizationRecord = Record<string, unknown>;
type OrganizationUpdateColumn =
  | 'company_email'
  | 'mission_text'
  | 'pillar1_title'
  | 'pillar1_desc'
  | 'pillar2_title'
  | 'pillar2_desc'
  | 'pillar3_title'
  | 'pillar3_desc'
  | 'tech_input'
  | 'perks_input';

type OrganizationUpdatePayload = Partial<Record<OrganizationUpdateColumn, string | null>>;
type OrganizationInsertPayload = OrganizationUpdatePayload & {
  user_id: string;
  company_name: string;
};

const emptyOrgData: OrgProfileData = {
  company_email: '',
  hero_eyebrow: '',
  mission_title: '',
  mission_text: '',
  section1_heading: '',
  pillar1_title: '',
  pillar1_desc: '',
  pillar2_title: '',
  pillar2_desc: '',
  section2_heading: '',
  tech_input: '',
  pillar3_title: '',
  pillar3_desc: '',
  perks_input: '',
  loadingStatusText: '',
};

const fallbacks: OrgProfileData = {
  company_email: '',
  hero_eyebrow: '',
  mission_title: 'Click Edit to add your company mission',
  mission_text: 'Share the promise your company makes to candidates, collaborators, and the market.',
  section1_heading: 'Features of the company',
  pillar1_title: 'Click Edit to add your first company principle',
  pillar1_desc: 'Describe the way your team turns intent into execution.',
  pillar2_title: 'Click Edit to add your company infrastructure',
  pillar2_desc: 'Describe the systems, tools, or operating model behind your work.',
  section2_heading: 'How we work',
  tech_input: 'Describe the systems, tools, or operating model behind your work.',
  pillar3_title: 'Benefits of working with us',
  pillar3_desc: 'Describe why ambitious people should build with your organization.',
  perks_input: 'Describe why ambitious people should build with your organization.',
  loadingStatusText: 'Synchronizing verified workspace details...',
};

const placeholderValues = new Set(['your description here...', 'feature one', 'ai-native operations']);

function cleanText(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmedValue = value.trim();
  return placeholderValues.has(trimmedValue.toLowerCase()) ? '' : trimmedValue;
}

function readText(row: OrganizationRecord | null, keys: string[]) {
  if (!row) {
    return '';
  }

  for (const key of keys) {
    const value = cleanText(row[key]);
    if (value) {
      return value;
    }
  }

  return '';
}

function mapOrganizationToProfile(row: OrganizationRecord | null, companyName: string): OrgProfileData {
  return {
    company_email: readText(row, ['company_email', 'contact_email', 'org_email']),
    hero_eyebrow: readText(row, ['hero_eyebrow']),
    mission_title: readText(row, ['mission_title']) || companyName,
    mission_text: readText(row, ['mission_text', 'mission_desc', 'description', 'bio']),
    section1_heading: readText(row, ['section1_heading']),
    pillar1_title: readText(row, ['pillar1_title', 'feature_one_title']),
    pillar1_desc: readText(row, ['pillar1_desc', 'feature_one_desc']),
    pillar2_title: readText(row, ['pillar2_title', 'infrastructure_title']),
    pillar2_desc: readText(row, ['pillar2_desc', 'infrastructure_desc']),
    section2_heading: readText(row, ['section2_heading', 'pillar2_title', 'infrastructure_title']),
    tech_input: readText(row, ['tech_input', 'section2_desc', 'infrastructure_desc', 'pillar2_desc']),
    pillar3_title: readText(row, ['pillar3_title', 'benefit_title']),
    pillar3_desc: readText(row, ['pillar3_desc', 'benefit_desc', 'perks_input']),
    perks_input: readText(row, ['perks_input', 'pillar3_desc', 'benefit_desc']),
    loadingStatusText: readText(row, ['loading_status_text']),
  };
}

function normalizeOrgData(data: OrgProfileData): OrgProfileData {
  return {
    company_email: data.company_email.trim(),
    hero_eyebrow: data.hero_eyebrow.trim(),
    mission_title: data.mission_title.trim(),
    mission_text: data.mission_text.trim(),
    section1_heading: data.section1_heading.trim(),
    pillar1_title: data.pillar1_title.trim(),
    pillar1_desc: data.pillar1_desc.trim(),
    pillar2_title: data.pillar2_title.trim(),
    pillar2_desc: data.pillar2_desc.trim(),
    section2_heading: data.section2_heading.trim(),
    tech_input: data.tech_input.trim(),
    pillar3_title: data.pillar3_title.trim(),
    pillar3_desc: data.pillar3_desc.trim(),
    perks_input: data.perks_input.trim(),
    loadingStatusText: data.loadingStatusText.trim(),
  };
}

function getDisplay(value: string, fallback: string) {
  return value.trim() || fallback;
}

function stripUndefinedFields(payload: OrganizationUpdatePayload): OrganizationUpdatePayload {
  const cleanedPayload: OrganizationUpdatePayload = {};

  for (const [key, value] of Object.entries(payload) as [OrganizationUpdateColumn, string | null | undefined][]) {
    if (value !== undefined) {
      cleanedPayload[key] = value;
    }
  }

  return cleanedPayload;
}

function OrganizationManifestoPageContent() {
  const searchParams = useSearchParams();
  const publicOrgId = searchParams.get('orgId')?.trim() || null;
  const { loading: authLoading, profile, supabase, user } = useViewerProfile();
  const userId = user?.id ?? null;
  const userMetadata = (user?.user_metadata ?? {}) as { company_name?: string };
  const contextCompanyName =
    userMetadata.company_name || profile?.company_name || profile?.display_name || DEFAULT_COMPANY;

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationOwnerId, setOrganizationOwnerId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(contextCompanyName);
  const [orgData, setOrgData] = useState<OrgProfileData>(emptyOrgData);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const displayCompanyName = companyName || contextCompanyName || DEFAULT_COMPANY;
  const canEditProfile = Boolean(
    userId && ((organizationOwnerId && organizationOwnerId === userId) || (!publicOrgId && !organizationOwnerId))
  );
  const displayData = useMemo(
    () => ({
      hero_eyebrow: getDisplay(orgData.hero_eyebrow, displayCompanyName),
      mission_title: getDisplay(orgData.mission_title, fallbacks.mission_title),
      mission_text: getDisplay(orgData.mission_text, fallbacks.mission_text),
      section1_heading: getDisplay(orgData.section1_heading, fallbacks.section1_heading),
      pillar1_title: getDisplay(orgData.pillar1_title, fallbacks.pillar1_title),
      pillar1_desc: getDisplay(orgData.pillar1_desc, fallbacks.pillar1_desc),
      pillar2_title: getDisplay(orgData.pillar2_title, fallbacks.pillar2_title),
      pillar2_desc: getDisplay(orgData.pillar2_desc, fallbacks.pillar2_desc),
      section2_heading: getDisplay(orgData.section2_heading, fallbacks.section2_heading),
      tech_input: getDisplay(orgData.tech_input, fallbacks.tech_input),
      pillar3_title: getDisplay(orgData.pillar3_title, fallbacks.pillar3_title),
      pillar3_desc: getDisplay(orgData.pillar3_desc, fallbacks.pillar3_desc),
      perks_input: getDisplay(orgData.perks_input, fallbacks.perks_input),
      loadingStatusText: getDisplay(orgData.loadingStatusText, fallbacks.loadingStatusText),
    }),
    [displayCompanyName, orgData]
  );
  const contactEmail = orgData.company_email.trim();

  useEffect(() => {
    if (authLoading) {
      return;
    }

    let active = true;

    async function loadOrganizationProfile() {
      setIsLoading(true);
      setSaveError(null);

      try {
        if (!supabase) {
          if (active) {
            setCompanyName(contextCompanyName);
            setOrgData(emptyOrgData);
          }
          return;
        }

        let organization: OrganizationRecord | null = null;

        if (publicOrgId) {
          const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', publicOrgId)
            .maybeSingle();

          if (error) {
            throw error;
          }
          organization = (data as OrganizationRecord | null) ?? null;
        } else if (userId) {
          const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

          if (error) {
            throw error;
          }
          organization = (data as OrganizationRecord | null) ?? null;
        }

        if (!active) {
          return;
        }

        const loadedCompanyName =
          readText(organization, ['company_name', 'name']) || contextCompanyName || DEFAULT_COMPANY;
        const ownerId = readText(organization, ['user_id']);
        const loadedOrgId = readText(organization, ['id']);

        setCompanyName(loadedCompanyName);
        setOrganizationOwnerId(ownerId || (!publicOrgId && userId ? userId : null));
        setOrganizationId(loadedOrgId || null);
        setOrgData(mapOrganizationToProfile(organization, loadedCompanyName));
      } catch (error) {
        console.error('Unable to load the organization profile:', error);
        if (active) {
          setCompanyName(contextCompanyName);
          setOrgData(emptyOrgData);
          setOrganizationOwnerId(!publicOrgId && userId ? userId : null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadOrganizationProfile();
    return () => {
      active = false;
    };
  }, [authLoading, contextCompanyName, publicOrgId, supabase, userId]);

  function updateOrgField(field: keyof OrgProfileData, value: string) {
    setOrgData((currentData) => ({
      ...currentData,
      [field]: value,
    }));
  }

  async function handleSave() {
    if (!canEditProfile || !supabase || !userId) {
      setSaveError('Only the organization owner can edit this profile.');
      return;
    }

    const normalizedData = normalizeOrgData(orgData);
    if (normalizedData.company_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedData.company_email)) {
      setSaveError('Enter a valid contact email address.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updatePayload = stripUndefinedFields({
        company_email: normalizedData.company_email || null,
        mission_text: normalizedData.mission_text || null,
        pillar1_title: normalizedData.pillar1_title || null,
        pillar1_desc: normalizedData.pillar1_desc || null,
        pillar2_title: normalizedData.pillar2_title || null,
        pillar2_desc: normalizedData.pillar2_desc || null,
        pillar3_title: normalizedData.pillar3_title || null,
        pillar3_desc: normalizedData.pillar3_desc || normalizedData.perks_input || null,
        tech_input: normalizedData.tech_input || null,
        perks_input: normalizedData.perks_input || normalizedData.pillar3_desc || null,
      });

      let nextOrganizationId = organizationId;

      if (!nextOrganizationId) {
        const { data: existingRows, error: lookupError } = await supabase
          .from('organizations')
          .select('id')
          .eq('user_id', userId)
          .limit(1);

        if (lookupError) {
          throw lookupError;
        }
        nextOrganizationId = existingRows?.[0]?.id ?? null;
      }

      if (nextOrganizationId) {
        const { error } = await supabase
          .from('organizations')
          .update(updatePayload)
          .eq('user_id', userId);

        if (error) {
          throw error;
        }
      } else {
        const insertPayload: OrganizationInsertPayload = {
          ...updatePayload,
          user_id: userId,
          company_name: displayCompanyName,
        };
        const { data, error } = await supabase
          .from('organizations')
          .insert([insertPayload])
          .select('id')
          .single();

        if (error) {
          throw error;
        }
        nextOrganizationId = data?.id ?? null;
      }

      setOrganizationId(nextOrganizationId);
      setOrganizationOwnerId(userId);
      setOrgData(normalizedData);
      setIsEditing(false);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2400);
    } catch (error: any) {
      console.error('Organization profile save failed:', error);
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
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-200">
              <Boxes className="h-4 w-4" />
            </span>
            {displayCompanyName}
          </Link>
          <Link
            href={publicOrgId ? '/home' : '/organization/dashboard'}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-300/35 hover:text-cyan-100"
          >
            {publicOrgId ? 'Candidate dashboard' : 'Workspace dashboard'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>

        <div className="sticky top-4 z-40 mt-12 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-200 backdrop-blur-md">
            <BadgeCheck className="h-4 w-4" />
            VERIFIED WORKSPACE
          </div>
          {canEditProfile ? (
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  void handleSave();
                } else {
                  setSaveError(null);
                  setSaveSuccess(false);
                  setIsEditing(true);
                }
              }}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full border border-purple-300/25 bg-[#080b1b]/90 px-4 py-2 text-xs font-bold text-purple-100 shadow-2xl backdrop-blur-md transition hover:border-purple-200/50 hover:bg-purple-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isEditing ? <Save className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Edit Profile'}
            </button>
          ) : null}
        </div>

        {saveSuccess ? (
          <div className="fixed right-5 top-5 z-50 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-[#071a18]/95 px-4 py-3 text-sm font-semibold text-emerald-100 shadow-2xl" role="status">
            <CheckCircle2 className="h-4 w-4" />
            Organization profile updated
          </div>
        ) : null}

        {saveError ? (
          <p className="mt-6 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
            {saveError}
          </p>
        ) : null}

        <section className="py-20 sm:py-28 lg:py-32">
          {isEditing ? (
            <EditorInput
              label="Hero eyebrow"
              placeholder="Enter hero eyebrow..."
              value={orgData.hero_eyebrow}
              onChange={(value) => updateOrgField('hero_eyebrow', value)}
              className="text-xs font-bold uppercase tracking-[0.28em] text-slate-300"
            />
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">
              {displayData.hero_eyebrow}
            </p>
          )}
          {isEditing ? (
            <EditorTextarea
              label="Mission title"
              placeholder="Enter your main company heading..."
              value={orgData.mission_title}
              onChange={(value) => updateOrgField('mission_title', value)}
              rows={2}
              className="mt-5 max-w-6xl text-5xl font-black leading-[0.95] text-white sm:text-7xl lg:text-[7.4rem]"
            />
          ) : (
            <h1 className="mt-5 max-w-6xl bg-gradient-to-r from-white via-cyan-100 to-purple-300 bg-clip-text text-5xl font-black leading-[0.95] text-transparent sm:text-7xl lg:text-[7.4rem]">
              {displayData.mission_title}
            </h1>
          )}
          {isEditing ? (
            <EditorTextarea
              label="Mission description"
              placeholder="Describe your company mission..."
              value={orgData.mission_text}
              onChange={(value) => updateOrgField('mission_text', value)}
              rows={5}
              className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10"
            />
          ) : (
            <p className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10">
              {displayData.mission_text}
            </p>
          )}
          {isEditing ? (
            <EditorInput
              label="Contact email"
              placeholder="company@example.com"
              value={orgData.company_email}
              onChange={(value) => updateOrgField('company_email', value)}
              className="mt-6 max-w-md text-sm font-medium text-slate-200"
            />
          ) : contactEmail ? (
            <a
              href={`mailto:${contactEmail}`}
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/50"
            >
              <Mail className="h-4 w-4" />
              {contactEmail}
            </a>
          ) : null}
          {isLoading ? (
            isEditing ? (
              <EditorInput
                label="Loading status text"
                placeholder="Loading status text..."
                value={orgData.loadingStatusText}
                onChange={(value) => updateOrgField('loadingStatusText', value)}
                className="mt-8 text-xs font-medium text-slate-500"
              />
            ) : (
              <p className="mt-8 text-xs font-medium text-slate-600" role="status">
                {displayData.loadingStatusText}
              </p>
            )
          ) : null}
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          {isEditing ? (
            <EditorTextarea
              label="Section one heading"
              placeholder="Features of the company"
              value={orgData.section1_heading}
              onChange={(value) => updateOrgField('section1_heading', value)}
              rows={2}
              className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl"
            />
          ) : (
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              {displayData.section1_heading}
            </h2>
          )}
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <EditableProfileCard
              accent="from-cyan-400/20 to-blue-500/5"
              description={orgData.pillar1_desc}
              descriptionFallback={displayData.pillar1_desc}
              descriptionLabel="Feature description"
              icon={<Rocket className="h-6 w-6 text-white" />}
              isEditing={isEditing}
              onDescriptionChange={(value) => updateOrgField('pillar1_desc', value)}
              onTitleChange={(value) => updateOrgField('pillar1_title', value)}
              title={orgData.pillar1_title}
              titleFallback={displayData.pillar1_title}
              titleLabel="Feature title"
            />
            <EditableProfileCard
              accent="from-purple-400/20 to-fuchsia-500/5"
              description={orgData.pillar2_desc}
              descriptionFallback={displayData.pillar2_desc}
              descriptionLabel="Infrastructure description"
              icon={<Cpu className="h-6 w-6 text-white" />}
              isEditing={isEditing}
              onDescriptionChange={(value) => updateOrgField('pillar2_desc', value)}
              onTitleChange={(value) => updateOrgField('pillar2_title', value)}
              title={orgData.pillar2_title}
              titleFallback={displayData.pillar2_title}
              titleLabel="Infrastructure title"
            />
          </div>
        </section>

        <section className="grid gap-8 border-t border-white/10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Sparkles className="h-6 w-6 text-cyan-300" />
            {isEditing ? (
              <EditorInput
                label="Section two heading"
                placeholder="How we work"
                value={orgData.section2_heading}
                onChange={(value) => updateOrgField('section2_heading', value)}
                className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl"
              />
            ) : (
              <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
                {displayData.section2_heading}
              </h2>
            )}
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-7">
            {isEditing ? (
              <EditorTextarea
                label="Section two description"
                placeholder="Describe your infrastructure..."
                value={orgData.tech_input}
                onChange={(value) => updateOrgField('tech_input', value)}
                rows={6}
                className="text-base leading-8 text-slate-300"
              />
            ) : (
              <p className="text-base leading-8 text-slate-300">{displayData.tech_input}</p>
            )}
          </div>
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          {isEditing ? (
            <EditorInput
              label="Benefit title"
              placeholder="Benefits of working with us"
              value={orgData.pillar3_title}
              onChange={(value) => updateOrgField('pillar3_title', value)}
              className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl"
            />
          ) : (
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              {displayData.pillar3_title}
            </h2>
          )}
          <div className="mt-10 rounded-2xl border border-white/10 bg-[#080b19]/75 p-6">
            <div className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              {isEditing ? (
                <EditorTextarea
                  label="Benefit description"
                  placeholder="Describe your company benefits..."
                  value={orgData.perks_input}
                  onChange={(value) =>
                    setOrgData((currentData) => ({
                      ...currentData,
                      pillar3_desc: value,
                      perks_input: value,
                    }))
                  }
                  rows={4}
                  className="text-sm font-semibold leading-7 text-slate-200"
                />
              ) : (
                <p className="text-sm font-semibold leading-7 text-slate-200">{displayData.perks_input}</p>
              )}
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-white/10 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 MeliusAI. Verified through MeliusAI.</p>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Protected workspace profile
          </span>
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

function EditableProfileCard({
  accent,
  description,
  descriptionFallback,
  descriptionLabel,
  icon,
  isEditing,
  onDescriptionChange,
  onTitleChange,
  title,
  titleFallback,
  titleLabel,
}: {
  accent: string;
  description: string;
  descriptionFallback: string;
  descriptionLabel: string;
  icon: ReactNode;
  isEditing: boolean;
  onDescriptionChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  title: string;
  titleFallback: string;
  titleLabel: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a0d1d]/85 p-8">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative">
        {icon}
        {isEditing ? (
          <EditorInput
            label={titleLabel}
            placeholder={titleLabel === 'Feature title' ? 'Feature title...' : 'Infrastructure title...'}
            value={title}
            onChange={onTitleChange}
            className="mt-8 text-2xl font-semibold"
          />
        ) : (
          <h3 className="mt-8 text-2xl font-semibold">{titleFallback}</h3>
        )}
        {isEditing ? (
          <EditorTextarea
            label={descriptionLabel}
            placeholder={descriptionLabel === 'Feature description' ? 'Describe this feature...' : 'Describe this infrastructure...'}
            value={description}
            onChange={onDescriptionChange}
            rows={5}
            className="mt-4 max-w-xl text-sm leading-7 text-slate-400"
          />
        ) : (
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{descriptionFallback}</p>
        )}
      </div>
    </article>
  );
}

function EditorInput({
  className,
  label,
  placeholder,
  value,
  onChange,
}: {
  className?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block w-full">
      <span className="sr-only">{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`block w-full rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 ${className ?? ''}`}
      />
    </label>
  );
}

function EditorTextarea({
  className,
  label,
  placeholder,
  value,
  onChange,
  rows = 4,
}: {
  className?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block w-full">
      <span className="sr-only">{label}</span>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className={`block min-h-[100px] w-full resize-none rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm leading-7 text-slate-200 outline-none transition-all placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 ${className ?? ''}`}
      />
    </label>
  );
}
