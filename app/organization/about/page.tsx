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
  Pencil,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useViewerProfile } from '@/lib/viewer-client';

const DEFAULT_COMPANY = 'MeliusAI';

type OrgProfileData = {
  heroEyebrow: string;
  missionTitle: string;
  missionDesc: string;
  section1Subheading: string;
  section1Heading: string;
  featureOneTitle: string;
  featureOneDesc: string;
  infrastructureTitle: string;
  infrastructureDesc: string;
  section2Subheading: string;
  section2Heading: string;
  section2Desc: string;
  section3Subheading: string;
  benefitTitle: string;
  benefitDesc: string;
  loadingStatusText: string;
};

type OrganizationRecord = Record<string, unknown>;
type OrganizationUpdateColumn =
  | 'user_id'
  | 'company_name'
  | 'mission_text'
  | 'hero_eyebrow'
  | 'mission_title'
  | 'mission_desc'
  | 'section1_subheading'
  | 'section1_heading'
  | 'feature_one_title'
  | 'feature_one_desc'
  | 'infrastructure_title'
  | 'infrastructure_desc'
  | 'section2_subheading'
  | 'section2_heading'
  | 'section2_desc'
  | 'section3_subheading'
  | 'benefit_title'
  | 'benefit_desc'
  | 'loading_status_text'
  | 'pillar1_title'
  | 'pillar1_desc'
  | 'pillar2_title'
  | 'pillar2_desc'
  | 'tech_input'
  | 'perks_input';

type OrganizationUpdatePayload = Partial<Record<OrganizationUpdateColumn, string | null>>;

const emptyOrgData: OrgProfileData = {
  heroEyebrow: '',
  missionTitle: '',
  missionDesc: '',
  section1Subheading: '',
  section1Heading: '',
  featureOneTitle: '',
  featureOneDesc: '',
  infrastructureTitle: '',
  infrastructureDesc: '',
  section2Subheading: '',
  section2Heading: '',
  section2Desc: '',
  section3Subheading: '',
  benefitTitle: '',
  benefitDesc: '',
  loadingStatusText: '',
};

const fallbacks: OrgProfileData = {
  heroEyebrow: '',
  missionTitle: 'Click Edit to add your company mission',
  missionDesc: 'Share the promise your company makes to candidates, collaborators, and the market.',
  section1Subheading: 'Company feature',
  section1Heading: 'How we turn intent into execution.',
  featureOneTitle: 'Click Edit to add your first company principle',
  featureOneDesc: 'Describe the way your team turns intent into execution.',
  infrastructureTitle: 'Click Edit to add your company infrastructure',
  infrastructureDesc: 'Describe the systems, tools, or operating model behind your work.',
  section2Subheading: 'Infrastructure',
  section2Heading: 'Click Edit to add your infrastructure headline',
  section2Desc: 'Describe the systems, tools, or operating model behind your work.',
  section3Subheading: 'Benefits',
  benefitTitle: 'Click Edit to add your company benefit',
  benefitDesc: 'Describe why ambitious people should build with your organization.',
  loadingStatusText: 'Synchronizing verified workspace details...',
};

const placeholderValues = new Set(['your description here...']);

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
    heroEyebrow: readText(row, ['hero_eyebrow']),
    missionTitle: readText(row, ['mission_title']) || companyName,
    missionDesc: readText(row, ['mission_desc', 'mission_text', 'description', 'bio']),
    section1Subheading: readText(row, ['section1_subheading']),
    section1Heading: readText(row, ['section1_heading']),
    featureOneTitle: readText(row, ['feature_one_title', 'pillar1_title']),
    featureOneDesc: readText(row, ['feature_one_desc', 'pillar1_desc']),
    infrastructureTitle: readText(row, ['infrastructure_title', 'pillar2_title']),
    infrastructureDesc: readText(row, ['infrastructure_desc', 'tech_input']),
    section2Subheading: readText(row, ['section2_subheading']),
    section2Heading: readText(row, ['section2_heading', 'infrastructure_title', 'pillar2_title']),
    section2Desc: readText(row, ['section2_desc', 'infrastructure_desc', 'tech_input', 'pillar2_desc']),
    section3Subheading: readText(row, ['section3_subheading']),
    benefitTitle: readText(row, ['benefit_title']),
    benefitDesc: readText(row, ['benefit_desc', 'perks_input']),
    loadingStatusText: readText(row, ['loading_status_text']),
  };
}

function normalizeOrgData(data: OrgProfileData): OrgProfileData {
  return {
    heroEyebrow: data.heroEyebrow.trim(),
    missionTitle: data.missionTitle.trim(),
    missionDesc: data.missionDesc.trim(),
    section1Subheading: data.section1Subheading.trim(),
    section1Heading: data.section1Heading.trim(),
    featureOneTitle: data.featureOneTitle.trim(),
    featureOneDesc: data.featureOneDesc.trim(),
    infrastructureTitle: data.infrastructureTitle.trim(),
    infrastructureDesc: data.infrastructureDesc.trim(),
    section2Subheading: data.section2Subheading.trim(),
    section2Heading: data.section2Heading.trim(),
    section2Desc: data.section2Desc.trim(),
    section3Subheading: data.section3Subheading.trim(),
    benefitTitle: data.benefitTitle.trim(),
    benefitDesc: data.benefitDesc.trim(),
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
      heroEyebrow: getDisplay(orgData.heroEyebrow, displayCompanyName),
      missionTitle: getDisplay(orgData.missionTitle, fallbacks.missionTitle),
      missionDesc: getDisplay(orgData.missionDesc, fallbacks.missionDesc),
      section1Subheading: getDisplay(orgData.section1Subheading, fallbacks.section1Subheading),
      section1Heading: getDisplay(orgData.section1Heading, fallbacks.section1Heading),
      featureOneTitle: getDisplay(orgData.featureOneTitle, fallbacks.featureOneTitle),
      featureOneDesc: getDisplay(orgData.featureOneDesc, fallbacks.featureOneDesc),
      infrastructureTitle: getDisplay(orgData.infrastructureTitle, fallbacks.infrastructureTitle),
      infrastructureDesc: getDisplay(orgData.infrastructureDesc, fallbacks.infrastructureDesc),
      section2Subheading: getDisplay(orgData.section2Subheading, fallbacks.section2Subheading),
      section2Heading: getDisplay(orgData.section2Heading, fallbacks.section2Heading),
      section2Desc: getDisplay(orgData.section2Desc, fallbacks.section2Desc),
      section3Subheading: getDisplay(orgData.section3Subheading, fallbacks.section3Subheading),
      benefitTitle: getDisplay(orgData.benefitTitle, fallbacks.benefitTitle),
      benefitDesc: getDisplay(orgData.benefitDesc, fallbacks.benefitDesc),
      loadingStatusText: getDisplay(orgData.loadingStatusText, fallbacks.loadingStatusText),
    }),
    [displayCompanyName, orgData]
  );

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

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updatePayload = stripUndefinedFields({
        user_id: userId,
        company_name: displayCompanyName,
        mission_text: normalizedData.missionDesc || null,
        hero_eyebrow: normalizedData.heroEyebrow || null,
        mission_title: normalizedData.missionTitle || null,
        mission_desc: normalizedData.missionDesc || null,
        section1_subheading: normalizedData.section1Subheading || null,
        section1_heading: normalizedData.section1Heading || null,
        feature_one_title: normalizedData.featureOneTitle || null,
        feature_one_desc: normalizedData.featureOneDesc || null,
        infrastructure_title: normalizedData.infrastructureTitle || null,
        infrastructure_desc: normalizedData.infrastructureDesc || null,
        section2_subheading: normalizedData.section2Subheading || null,
        section2_heading: normalizedData.section2Heading || null,
        section2_desc: normalizedData.section2Desc || null,
        section3_subheading: normalizedData.section3Subheading || null,
        benefit_title: normalizedData.benefitTitle || null,
        benefit_desc: normalizedData.benefitDesc || null,
        loading_status_text: normalizedData.loadingStatusText || null,
        pillar1_title: normalizedData.featureOneTitle || null,
        pillar1_desc: normalizedData.featureOneDesc || null,
        pillar2_title: normalizedData.infrastructureTitle || null,
        pillar2_desc: normalizedData.infrastructureDesc || null,
        tech_input: normalizedData.infrastructureDesc || null,
        perks_input: normalizedData.benefitDesc || null,
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
          .eq('id', nextOrganizationId);

        if (error) {
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from('organizations')
          .insert([updatePayload])
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
              value={orgData.heroEyebrow}
              onChange={(value) => updateOrgField('heroEyebrow', value)}
              className="text-xs font-bold uppercase tracking-[0.28em] text-slate-300"
            />
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">
              {displayData.heroEyebrow}
            </p>
          )}
          {isEditing ? (
            <EditorTextarea
              label="Mission title"
              placeholder="Enter your main company heading..."
              value={orgData.missionTitle}
              onChange={(value) => updateOrgField('missionTitle', value)}
              rows={2}
              className="mt-5 max-w-6xl text-5xl font-black leading-[0.95] text-white sm:text-7xl lg:text-[7.4rem]"
            />
          ) : (
            <h1 className="mt-5 max-w-6xl bg-gradient-to-r from-white via-cyan-100 to-purple-300 bg-clip-text text-5xl font-black leading-[0.95] text-transparent sm:text-7xl lg:text-[7.4rem]">
              {displayData.missionTitle}
            </h1>
          )}
          {isEditing ? (
            <EditorTextarea
              label="Mission description"
              placeholder="Describe your company mission..."
              value={orgData.missionDesc}
              onChange={(value) => updateOrgField('missionDesc', value)}
              rows={5}
              className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10"
            />
          ) : (
            <p className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10">
              {displayData.missionDesc}
            </p>
          )}
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
            <EditorInput
              label="Section one subheading"
              placeholder="Enter section label..."
              value={orgData.section1Subheading}
              onChange={(value) => updateOrgField('section1Subheading', value)}
              className="text-xs font-bold uppercase tracking-[0.24em] text-purple-200"
            />
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-purple-300">
              {displayData.section1Subheading}
            </p>
          )}
          {isEditing ? (
            <EditorTextarea
              label="Section one heading"
              placeholder="Enter section heading..."
              value={orgData.section1Heading}
              onChange={(value) => updateOrgField('section1Heading', value)}
              rows={2}
              className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl"
            />
          ) : (
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              {displayData.section1Heading}
            </h2>
          )}
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <EditableProfileCard
              accent="from-cyan-400/20 to-blue-500/5"
              description={orgData.featureOneDesc}
              descriptionFallback={displayData.featureOneDesc}
              descriptionLabel="Feature description"
              icon={<Rocket className="h-6 w-6 text-white" />}
              isEditing={isEditing}
              onDescriptionChange={(value) => updateOrgField('featureOneDesc', value)}
              onTitleChange={(value) => updateOrgField('featureOneTitle', value)}
              title={orgData.featureOneTitle}
              titleFallback={displayData.featureOneTitle}
              titleLabel="Feature title"
            />
            <EditableProfileCard
              accent="from-purple-400/20 to-fuchsia-500/5"
              description={orgData.infrastructureDesc}
              descriptionFallback={displayData.infrastructureDesc}
              descriptionLabel="Infrastructure description"
              icon={<Cpu className="h-6 w-6 text-white" />}
              isEditing={isEditing}
              onDescriptionChange={(value) => updateOrgField('infrastructureDesc', value)}
              onTitleChange={(value) => updateOrgField('infrastructureTitle', value)}
              title={orgData.infrastructureTitle}
              titleFallback={displayData.infrastructureTitle}
              titleLabel="Infrastructure title"
            />
          </div>
        </section>

        <section className="grid gap-8 border-t border-white/10 py-16 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Sparkles className="h-6 w-6 text-cyan-300" />
            {isEditing ? (
              <EditorInput
                label="Section two subheading"
                placeholder="Enter section label..."
                value={orgData.section2Subheading}
                onChange={(value) => updateOrgField('section2Subheading', value)}
                className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-cyan-200"
              />
            ) : (
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
                {displayData.section2Subheading}
              </p>
            )}
            {isEditing ? (
              <EditorInput
                label="Section two heading"
                placeholder="Enter infrastructure heading..."
                value={orgData.section2Heading}
                onChange={(value) => updateOrgField('section2Heading', value)}
                className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl"
              />
            ) : (
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {displayData.section2Heading}
              </h2>
            )}
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-7">
            {isEditing ? (
              <EditorTextarea
                label="Section two description"
                placeholder="Describe your infrastructure..."
                value={orgData.section2Desc}
                onChange={(value) => updateOrgField('section2Desc', value)}
                rows={6}
                className="text-base leading-8 text-slate-300"
              />
            ) : (
              <p className="text-base leading-8 text-slate-300">{displayData.section2Desc}</p>
            )}
          </div>
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          {isEditing ? (
            <EditorInput
              label="Section three subheading"
              placeholder="Enter section label..."
              value={orgData.section3Subheading}
              onChange={(value) => updateOrgField('section3Subheading', value)}
              className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200"
            />
          ) : (
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              {displayData.section3Subheading}
            </p>
          )}
          {isEditing ? (
            <EditorInput
              label="Benefit title"
              placeholder="Enter benefits heading..."
              value={orgData.benefitTitle}
              onChange={(value) => updateOrgField('benefitTitle', value)}
              className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl"
            />
          ) : (
            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              {displayData.benefitTitle}
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
                  value={orgData.benefitDesc}
                  onChange={(value) => updateOrgField('benefitDesc', value)}
                  rows={4}
                  className="text-sm font-semibold leading-7 text-slate-200"
                />
              ) : (
                <p className="text-sm font-semibold leading-7 text-slate-200">{displayData.benefitDesc}</p>
              )}
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-4 border-t border-white/10 py-8 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 MeliusAI. Verified through MeliusIQ.</p>
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
