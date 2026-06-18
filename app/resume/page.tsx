'use client';

import {
  useEffect,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, FolderLock, House, Search, Settings, Sparkles, UserRound } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import type { ProfileRow } from '@/types/supabase';

type ResumeStatus = string;
type SaveState = 'idle' | 'saving' | 'saved';
type ResumeDraft = {
  name: string;
  age: string;
  currentStatus: ResumeStatus;
  qualificationsList: string[];
  experienceList: string[];
  hobbiesList: string[];
};
type ResumeFields = Pick<
  ProfileRow,
  'full_name' | 'avatar_url' | 'age' | 'current_status' | 'qualifications' | 'experience' | 'hobbies'
> & {
  name?: string | null;
  status?: string | null;
};
type SpectatorResumeResponse = {
  profile?: ResumeFields | null;
  detail?: string;
  message?: string;
};

const statusOptions: ResumeStatus[] = ['Studying', 'Working', 'Looking for an Opportunity'];
const PROFILE_SPECTATOR_BASE_URL = (
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL || 'https://meliusai.onrender.com'
).replace(/\/$/, '');
const sectionActionClass =
  'w-full text-center py-2 bg-[#071329]/60 hover:bg-[#0b1d38]/80 text-slate-400 hover:text-cyan-400 font-sans text-xs border border-blue-950/60 hover:border-cyan-500/30 rounded-full transition-all duration-200 cursor-pointer';
const navigationItems = [
  { href: '/profile', label: 'Home', icon: House },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/meliusai', label: 'MeliusAI', icon: Sparkles },
  { href: '/vault', label: 'Vault', icon: FolderLock },
  { href: '/resume', label: 'Resume', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function SidebarLink({
  active,
  href,
  icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-blue-950/30 transition-all duration-200 group',
        label === 'MeliusAI' ? 'text-cyan-400/90 hover:text-cyan-400' : null,
        active ? 'bg-blue-950/35 text-white' : null
      )}
    >
      <span className="text-slate-400 transition-colors group-hover:text-cyan-400">{icon}</span>
      <span className="font-sans text-sm tracking-wide">{label}</span>
    </Link>
  );
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function BulletInput({
  id,
  label,
  placeholder,
  value,
  items,
  isEditing,
  onChange,
  onKeyDown,
  onRemove,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  items: string[];
  isEditing: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
      <Label htmlFor={isEditing ? id : undefined}>{label}</Label>
      {isEditing ? (
        <>
          <Input
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="mt-3 rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
          />
          <p className="mt-2 text-xs text-zinc-600">Press Enter to add an item.</p>
        </>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="flex items-center gap-2 text-sm text-zinc-300 font-sans my-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
              <span className="flex-1">{item}</span>
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="rounded px-1.5 text-zinc-600 transition-colors hover:text-rose-400"
                  aria-label={`Remove ${item}`}
                >
                  &times;
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">No entries added yet.</p>
      )}

    </div>
  );
}

function DashboardResumePageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUsername = searchParams.get('profile')?.trim().replace(/^@+/, '') || null;
  const isSpectator = Boolean(targetUsername);
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const editSnapshotRef = useRef<ResumeDraft | null>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [age, setAge] = useState('');
  const [currentStatus, setCurrentStatus] = useState<ResumeStatus>('');
  const [qualificationText, setQualificationText] = useState('');
  const [experienceText, setExperienceText] = useState('');
  const [hobbyText, setHobbyText] = useState('');
  const [qualificationsList, setQualificationsList] = useState<string[]>([]);
  const [experienceList, setExperienceList] = useState<string[]>([]);
  const [hobbiesList, setHobbiesList] = useState<string[]>([]);
  const [formLoading, setFormLoading] = useState(true);
  const [isEditingGlobal, setIsEditingGlobal] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canEdit = !isSpectator && isEditingGlobal;

  useEffect(() => {
    if (!isSpectator && !loading && authEnabled && !user) {
      router.replace('/auth');
    }
  }, [authEnabled, isSpectator, loading, router, user]);

  useEffect(() => {
    if (!isSpectator && (!supabase || !user)) {
      setFormLoading(false);
      return;
    }

    if (isSpectator && !targetUsername) {
      setFormLoading(false);
      return;
    }

    let active = true;

    const loadResume = async () => {
      setFormLoading(true);
      setFormError(null);

      try {
        let resume: ResumeFields | null = null;

        if (isSpectator && targetUsername) {
          const response = await fetch(
            `${PROFILE_SPECTATOR_BASE_URL}/api/spectate-profile/${encodeURIComponent(targetUsername)}`,
            { cache: 'no-store' }
          );
          const payload = (await response.json().catch(() => null)) as SpectatorResumeResponse | null;

          if (!response.ok || !payload?.profile) {
            throw new Error(payload?.detail || payload?.message || 'Unable to load this public resume.');
          }

          resume = payload.profile;
        } else if (supabase && user) {
          const { data, error } = await supabase
            .from('profiles')
            .select('full_name, avatar_url, age, current_status, qualifications, experience, hobbies')
            .eq('id', user.id)
            .maybeSingle();

          if (error) {
            throw error;
          }

          resume = data as ResumeFields | null;
        }

        if (!active) {
          return;
        }

        setName(
          resume?.full_name ??
            resume?.name ??
            (user?.user_metadata?.full_name as string | undefined) ??
            (user?.user_metadata?.name as string | undefined) ??
            ''
        );
        setAvatarUrl(
          resume?.avatar_url ??
            (user?.user_metadata?.avatar_url as string | undefined) ??
            (user?.user_metadata?.picture as string | undefined) ??
            null
        );
        setAge(typeof resume?.age === 'number' ? String(resume.age) : '');
        setCurrentStatus(resume?.current_status ?? resume?.status ?? '');
        setQualificationsList(normalizeList(resume?.qualifications));
        setExperienceList(normalizeList(resume?.experience));
        setHobbiesList(normalizeList(resume?.hobbies));
      } catch (error) {
        console.error('Failed to load resume intake data', error);
        if (active) {
          setFormError('Unable to load your resume profile right now.');
        }
      } finally {
        if (active) {
          setFormLoading(false);
        }
      }
    };

    void loadResume();

    return () => {
      active = false;
    };
  }, [isSpectator, supabase, targetUsername, user]);

  useEffect(() => {
    if (isSpectator) {
      setIsEditingGlobal(false);
    }
  }, [isSpectator]);

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    currentTextValue: string,
    setList: Dispatch<SetStateAction<string[]>>,
    clearText: () => void
  ) {
    if (event.key === 'Enter' && currentTextValue.trim() !== '') {
      event.preventDefault();
      setList((previous) => [...previous, currentTextValue.trim()]);
      clearText();
    }
  }

  function removeListItem(setList: Dispatch<SetStateAction<string[]>>, index: number) {
    setList((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSaveProfile() {
    if (isSpectator || !supabase || !user || saveState === 'saving') {
      return;
    }

    setSaveState('saving');
    setFormError(null);

    try {
      const parsedAge = age.trim() ? Number.parseInt(age, 10) : null;
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: name.trim() || null,
          age: Number.isFinite(parsedAge) ? parsedAge : null,
          current_status: currentStatus || null,
          qualifications: qualificationsList,
          experience: experienceList,
          hobbies: hobbiesList,
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      setSaveState('saved');
      setIsEditingGlobal(false);
      editSnapshotRef.current = null;
    } catch (error) {
      console.error('Failed to save resume profile', error);
      setSaveState('idle');
      setFormError('Profile sync failed. Please try again.');
    }
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';

    if (isSpectator || !file || !supabase || !user) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFormError('Please choose an image file.');
      return;
    }

    setAvatarUploading(true);
    setFormError(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filePath = `${user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
        upsert: true,
        contentType: file.type,
      });

      if (uploadError) {
        throw uploadError;
      }

      const publicUrl = supabase.storage.from('avatars').getPublicUrl(filePath).data.publicUrl;
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      setAvatarUrl(publicUrl);
    } catch (error) {
      console.error('Failed to upload resume avatar', error);
      setFormError('Photo upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }

  if (loading || formLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-slate-400">
        <p className="text-sm">Loading resume workspace...</p>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-screen overflow-hidden bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-white">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(0,112,243,0.16),transparent_55%)]" />

      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <aside className="w-64 min-w-[16rem] h-full sticky top-0 bg-[#060b1e] border-r border-blue-950/40 p-4 flex flex-col justify-between z-40">
          <div>
            <div className="mb-8 flex items-center gap-3 px-3 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-950/60 text-cyan-400">
                <span className="text-sm font-semibold">M</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">MeliusAI</p>
                <p className="text-[11px] tracking-wide text-slate-500">Workspace</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
            {navigationItems.map((item) => {
              if (isSpectator && (item.label === 'MeliusAI' || item.label === 'Settings')) {
                return null;
              }

              const Icon = item.icon;
              const href =
                isSpectator && targetUsername
                  ? item.label === 'Home'
                    ? `/profile/${encodeURIComponent(targetUsername)}`
                    : item.label === 'Vault' || item.label === 'Resume'
                      ? `${item.href}?profile=${encodeURIComponent(targetUsername)}`
                      : item.href
                  : item.href;
              return (
                <SidebarLink
                  key={item.href}
                  href={href}
                  label={item.label}
                  active={pathname === item.href}
                  icon={<Icon className="h-5 w-5" strokeWidth={1.8} />}
                />
              );
            })}
            </nav>
          </div>
          <div className="rounded-xl border border-blue-950/40 bg-[#090d1f]/40 p-3 text-xs text-slate-500">
            Secure profile workspace
          </div>
        </aside>

        <section className="flex h-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-400">Profile Intake Terminal</p>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Resume</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Build a focused technical profile for career matching and MeliusAI context.
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
                <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">Core Metrics</p>
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                  <div className="shrink-0">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-cyan-500/30 bg-[#050b1b]/70 text-slate-400 shadow-[0_0_26px_rgba(6,182,212,0.12)]">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-9 w-9" strokeWidth={1.4} />
                      )}
                    </div>
                    {!isSpectator && (
                      <>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarUploading}
                          className="mt-3 rounded-full border border-blue-950/60 bg-[#050b1b]/70 px-3 py-2 text-[11px] text-slate-400 transition-colors hover:border-cyan-500/30 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {avatarUploading ? 'Uploading...' : 'Add Profile Photo'}
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => void handleAvatarUpload(event)}
                        />
                      </>
                    )}
                  </div>
                  <div className="grid w-full gap-5 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={canEdit ? 'resume-name' : undefined}>Name</Label>
                      {canEdit ? (
                        <Input
                          id="resume-name"
                          name="full_name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="e.g., Nikunj Sharma"
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        />
                      ) : (
                        <p className="rounded-xl border border-transparent py-3 text-base text-zinc-200">
                          {name || 'Name not provided'}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={canEdit ? 'resume-age' : undefined}>Age</Label>
                      {canEdit ? (
                        <Input
                          id="resume-age"
                          name="age"
                          type="number"
                          min={0}
                          max={150}
                          value={age}
                          onChange={(event) => setAge(event.target.value)}
                          placeholder="e.g., 22"
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        />
                      ) : (
                        <p className="py-3 text-sm text-zinc-300">{age || 'Not specified'}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={canEdit ? 'resume-current-status' : undefined}>Current Status</Label>
                      {canEdit ? (
                        <Select
                          id="resume-current-status"
                          name="current_status"
                          value={currentStatus}
                          onChange={(event) => setCurrentStatus(event.target.value as ResumeStatus)}
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        >
                          <option value="">Select your current status</option>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <p className="py-3 text-sm text-zinc-300">{currentStatus || 'Not specified'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <BulletInput
                id="resume-qualifications"
                label="Qualifications"
                placeholder="Type a milestone (e.g., Passed 10th from...) and press Enter..."
                value={qualificationText}
                items={qualificationsList}
                isEditing={canEdit}
                onChange={setQualificationText}
                onKeyDown={(event) =>
                  handleKeyDown(event, qualificationText, setQualificationsList, () => setQualificationText(''))
                }
                onRemove={(index) => removeListItem(setQualificationsList, index)}
              />

              <BulletInput
                id="resume-experience"
                label="Professional Experience"
                placeholder="Type a position (e.g., Software Engineer at...) and press Enter..."
                value={experienceText}
                items={experienceList}
                isEditing={canEdit}
                onChange={setExperienceText}
                onKeyDown={(event) =>
                  handleKeyDown(event, experienceText, setExperienceList, () => setExperienceText(''))
                }
                onRemove={(index) => removeListItem(setExperienceList, index)}
              />

              <BulletInput
                id="resume-hobbies"
                label="Hobbies"
                placeholder="Type an interest (e.g., Photography) and press Enter..."
                value={hobbyText}
                items={hobbiesList}
                isEditing={canEdit}
                onChange={setHobbyText}
                onKeyDown={(event) => handleKeyDown(event, hobbyText, setHobbiesList, () => setHobbyText(''))}
                onRemove={(index) => removeListItem(setHobbiesList, index)}
              />

              {formError ? (
                <p className="rounded-xl border border-rose-900/70 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
                  {formError}
                </p>
              ) : null}

              {!isSpectator && (
              <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-5 backdrop-blur-md">
                <p className="mb-4 text-xs uppercase tracking-[0.2em] text-slate-500">Profile Controls</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setSaveState('idle');
                      if (isEditingGlobal) {
                        const snapshot = editSnapshotRef.current;
                        if (snapshot) {
                          setName(snapshot.name);
                          setAge(snapshot.age);
                          setCurrentStatus(snapshot.currentStatus);
                          setQualificationsList(snapshot.qualificationsList);
                          setExperienceList(snapshot.experienceList);
                          setHobbiesList(snapshot.hobbiesList);
                        }
                        editSnapshotRef.current = null;
                        setIsEditingGlobal(false);
                      } else {
                        editSnapshotRef.current = {
                          name,
                          age,
                          currentStatus,
                          qualificationsList: [...qualificationsList],
                          experienceList: [...experienceList],
                          hobbiesList: [...hobbiesList],
                        };
                        setIsEditingGlobal(true);
                      }
                    }}
                    disabled={saveState === 'saving'}
                    className={cn(sectionActionClass, 'sm:flex-1 disabled:cursor-not-allowed disabled:opacity-60')}
                  >
                    {isEditingGlobal ? 'Cancel / Lock' : 'Edit Profile'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    disabled={!isEditingGlobal || saveState === 'saving' || saveState === 'saved'}
                    className={cn(
                      'w-full rounded-full border py-2 text-center text-xs transition-all duration-200 sm:flex-1',
                      saveState === 'saved'
                        ? 'pointer-events-none border-emerald-800/80 bg-emerald-950/30 text-emerald-400'
                        : 'border-blue-950/60 bg-[#071329]/60 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                  >
                    {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save Profile'}
                  </button>
                </div>
              </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function DashboardResumePage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-screen items-center justify-center bg-gradient-to-br from-[#020617] via-[#030712] to-[#010b24] text-slate-400">
          <p className="text-sm">Loading resume workspace...</p>
        </main>
      }
    >
      <DashboardResumePageContent />
    </Suspense>
  );
}
