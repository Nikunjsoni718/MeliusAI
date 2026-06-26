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
  missionTitle: string;
  missionDesc: string;
  featureOneTitle: string;
  featureOneDesc: string;
  infrastructureTitle: string;
  infrastructureDesc: string;
  benefitTitle: string;
  benefitDesc: string;
};

type OrganizationRecord = Record<string, unknown>;

const emptyOrgData: OrgProfileData = {
  missionTitle: '',
  missionDesc: '',
  featureOneTitle: '',
  featureOneDesc: '',
  infrastructureTitle: '',
  infrastructureDesc: '',
  benefitTitle: '',
  benefitDesc: '',
};

const fallbacks: OrgProfileData = {
  missionTitle: 'Click Edit to add your company mission',
  missionDesc: 'Share the promise your company makes to candidates, collaborators, and the market.',
  featureOneTitle: 'Click Edit to add your first company principle',
  featureOneDesc: 'Describe the way your team turns intent into execution.',
  infrastructureTitle: 'Click Edit to add your company infrastructure',
  infrastructureDesc: 'Describe the systems, tools, or operating model behind your work.',
  benefitTitle: 'Click Edit to add your company benefit',
  benefitDesc: 'Describe why ambitious people should build with your organization.',
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
    missionTitle: readText(row, ['mission_title']) || companyName,
    missionDesc: readText(row, ['mission_desc', 'mission_text', 'description', 'bio']),
    featureOneTitle: readText(row, ['feature_one_title', 'pillar1_title']),
    featureOneDesc: readText(row, ['feature_one_desc', 'pillar1_desc']),
    infrastructureTitle: readText(row, ['infrastructure_title', 'pillar2_title']),
    infrastructureDesc: readText(row, ['infrastructure_desc', 'tech_input']),
    benefitTitle: readText(row, ['benefit_title']),
    benefitDesc: readText(row, ['benefit_desc', 'perks_input']),
  };
}

function normalizeOrgData(data: OrgProfileData): OrgProfileData {
  return {
    missionTitle: data.missionTitle.trim(),
    missionDesc: data.missionDesc.trim(),
    featureOneTitle: data.featureOneTitle.trim(),
    featureOneDesc: data.featureOneDesc.trim(),
    infrastructureTitle: data.infrastructureTitle.trim(),
    infrastructureDesc: data.infrastructureDesc.trim(),
    benefitTitle: data.benefitTitle.trim(),
    benefitDesc: data.benefitDesc.trim(),
  };
}

function getDisplay(value: string, fallback: string) {
  return value.trim() || fallback;
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
      missionTitle: getDisplay(orgData.missionTitle, fallbacks.missionTitle),
      missionDesc: getDisplay(orgData.missionDesc, fallbacks.missionDesc),
      featureOneTitle: getDisplay(orgData.featureOneTitle, fallbacks.featureOneTitle),
      featureOneDesc: getDisplay(orgData.featureOneDesc, fallbacks.featureOneDesc),
      infrastructureTitle: getDisplay(orgData.infrastructureTitle, fallbacks.infrastructureTitle),
      infrastructureDesc: getDisplay(orgData.infrastructureDesc, fallbacks.infrastructureDesc),
      benefitTitle: getDisplay(orgData.benefitTitle, fallbacks.benefitTitle),
      benefitDesc: getDisplay(orgData.benefitDesc, fallbacks.benefitDesc),
    }),
    [orgData]
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
      const payload = {
        user_id: userId,
        company_name: displayCompanyName,
        name: displayCompanyName,
        description: normalizedData.missionDesc || null,
        mission_text: normalizedData.missionDesc || null,
        mission_title: normalizedData.missionTitle || null,
        mission_desc: normalizedData.missionDesc || null,
        feature_one_title: normalizedData.featureOneTitle || null,
        feature_one_desc: normalizedData.featureOneDesc || null,
        infrastructure_title: normalizedData.infrastructureTitle || null,
        infrastructure_desc: normalizedData.infrastructureDesc || null,
        benefit_title: normalizedData.benefitTitle || null,
        benefit_desc: normalizedData.benefitDesc || null,
        pillar1_title: normalizedData.featureOneTitle || null,
        pillar1_desc: normalizedData.featureOneDesc || null,
        pillar2_title: normalizedData.infrastructureTitle || null,
        pillar2_desc: normalizedData.infrastructureDesc || null,
        tech_input: normalizedData.infrastructureDesc || null,
        perks_input: normalizedData.benefitDesc || null,
      };

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
          .update(payload)
          .eq('id', nextOrganizationId);

        if (error) {
          throw error;
        }
      } else {
        const { data, error } = await supabase
          .from('organizations')
          .insert([payload])
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
            Verified Workspace
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
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-slate-500">
            {displayCompanyName}
          </p>
          {isEditing ? (
            <EditorTextarea
              label="Mission title"
              value={orgData.missionTitle}
              onChange={(value) => updateOrgField('missionTitle', value)}
              rows={2}
              className="mt-5 text-4xl font-black leading-tight sm:text-6xl"
            />
          ) : (
            <h1 className="mt-5 max-w-6xl bg-gradient-to-r from-white via-cyan-100 to-purple-300 bg-clip-text text-5xl font-black leading-[0.95] tracking-[-0.05em] text-transparent sm:text-7xl lg:text-[7.4rem]">
              {displayData.missionTitle}
            </h1>
          )}
          {isEditing ? (
            <EditorTextarea
              label="Mission description"
              value={orgData.missionDesc}
              onChange={(value) => updateOrgField('missionDesc', value)}
              rows={5}
              className="mt-6 text-lg leading-8"
            />
          ) : (
            <p className="mt-8 max-w-4xl text-xl font-medium leading-9 text-slate-300 sm:text-2xl sm:leading-10">
              {displayData.missionDesc}
            </p>
          )}
          {isLoading ? (
            <p className="mt-8 text-xs font-medium text-slate-600" role="status">Synchronizing verified workspace details...</p>
          ) : null}
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-purple-300">Company feature</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">How we turn intent into execution.</h2>
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
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">Infrastructure</p>
            {isEditing ? (
              <EditorInput
                label="Infrastructure title"
                value={orgData.infrastructureTitle}
                onChange={(value) => updateOrgField('infrastructureTitle', value)}
                className="mt-4 text-2xl font-semibold"
              />
            ) : (
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {displayData.infrastructureTitle}
              </h2>
            )}
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-7">
            {isEditing ? (
              <EditorTextarea
                label="Infrastructure description"
                value={orgData.infrastructureDesc}
                onChange={(value) => updateOrgField('infrastructureDesc', value)}
                rows={6}
              />
            ) : (
              <p className="text-base leading-8 text-slate-300">{displayData.infrastructureDesc}</p>
            )}
          </div>
        </section>

        <section className="border-t border-white/10 py-16 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Benefits</p>
          {isEditing ? (
            <EditorInput
              label="Benefit title"
              value={orgData.benefitTitle}
              onChange={(value) => updateOrgField('benefitTitle', value)}
              className="mt-4 text-2xl font-semibold"
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
                  value={orgData.benefitDesc}
                  onChange={(value) => updateOrgField('benefitDesc', value)}
                  rows={4}
                />
              ) : (
                <p className="text-sm font-semibold leading-7 text-slate-200">{displayData.benefitDesc}</p>
              )}
            </div>
          </div>
        </section>

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
            value={title}
            onChange={onTitleChange}
            className="mt-8 text-xl font-semibold"
          />
        ) : (
          <h3 className="mt-8 text-2xl font-semibold">{titleFallback}</h3>
        )}
        {isEditing ? (
          <EditorTextarea
            label={descriptionLabel}
            value={description}
            onChange={onDescriptionChange}
            rows={5}
            className="mt-4"
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
  value,
  onChange,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block w-full">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10 ${className ?? ''}`}
      />
    </label>
  );
}

function EditorTextarea({
  className,
  label,
  value,
  onChange,
  rows = 4,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block w-full">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className={`mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-7 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-purple-300/50 focus:ring-2 focus:ring-purple-300/10 ${className ?? ''}`}
      />
    </label>
  );
}
