'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, Code2, FileText, FolderLock, Globe2, House, Search, UserRound } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import type { ProfileRow } from '@/types/supabase';

type ResumeStatus = string;
type SaveState = 'idle' | 'saving' | 'saved';
type ResumeProject = {
  title: string;
  subtitle: string;
  href: string;
  description: string;
};
type ResumeExternalLink = {
  label: string;
  href: string;
};
type ResumeFormData = {
  name: string;
  age: string;
  status: ResumeStatus;
  qualifications: string[];
  experience: string[];
  hobbies: string[];
  skills: string[];
  projects: ResumeProject[];
  externalLinks: ResumeExternalLink[];
};
type ResumeFields = Pick<
  ProfileRow,
  | 'full_name'
  | 'avatar_url'
  | 'age'
  | 'current_status'
  | 'qualifications'
  | 'experience'
  | 'hobbies'
  | 'skills'
  | 'resume_projects'
  | 'external_links'
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
const navigationItems = [
  { href: '/profile', label: 'Home', icon: House },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/vault', label: 'Vault', icon: FolderLock },
  { href: '/resume', label: 'Resume', icon: FileText },
];
const fallbackSkills = ['React', 'Next.js', 'Python', 'UI/UX'];
const fallbackProjects: ResumeProject[] = [
  {
    title: 'Portfolio Intelligence Dashboard',
    subtitle: 'github.com/meliusai/portfolio-lab',
    href: 'https://github.com',
    description:
      'A creator-facing workspace that turns uploaded work into structured signals for matching, review, and opportunity discovery.',
  },
  {
    title: 'Interactive Product Case Study',
    subtitle: 'portfolio.example.com/case-study',
    href: 'https://example.com',
    description:
      'A concise product walkthrough showing problem framing, design decisions, implementation notes, and measurable outcomes.',
  },
];
const fallbackExternalLinks: ResumeExternalLink[] = [
  { label: 'GitHub', href: 'https://github.com' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com' },
  { label: 'Portfolio', href: 'https://example.com' },
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

function normalizeProjects(value: unknown): ResumeProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title : '';
      const subtitle = typeof row.subtitle === 'string' ? row.subtitle : '';
      const href = typeof row.href === 'string' ? row.href : '';
      const description = typeof row.description === 'string' ? row.description : '';

      return { title, subtitle, href, description };
    })
    .filter((item): item is ResumeProject => item !== null);
}

function normalizeExternalLinks(value: unknown): ResumeExternalLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as Record<string, unknown>;
      const label = typeof row.label === 'string' ? row.label : '';
      const href = typeof row.href === 'string' ? row.href : '';

      return { label, href };
    })
    .filter((item): item is ResumeExternalLink => item !== null);
}

function createDefaultFormData(): ResumeFormData {
  return {
    name: '',
    age: '',
    status: '',
    qualifications: [],
    experience: [],
    hobbies: [],
    skills: fallbackSkills,
    projects: fallbackProjects,
    externalLinks: fallbackExternalLinks,
  };
}

function getExternalLinkIcon(label: string) {
  const normalizedLabel = label.toLowerCase();

  if (normalizedLabel.includes('github')) {
    return Code2;
  }

  if (normalizedLabel.includes('linkedin')) {
    return Briefcase;
  }

  return Globe2;
}

function EditableStringListSection({
  addLabel,
  emptyLabel,
  isEditing,
  items,
  label,
  onAdd,
  onDelete,
  onUpdate,
  placeholder,
  variant = 'bullet',
}: {
  addLabel: string;
  emptyLabel: string;
  isEditing: boolean;
  items: string[];
  label: string;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, value: string) => void;
  placeholder: string;
  variant?: 'bullet' | 'pill';
}) {
  const visibleItems = items.filter((item) => item.trim());

  return (
    <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300 focus-within:border-cyan-500/40">
      <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      {isEditing ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${label}-${index}`} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(event) => onUpdate(index, event.target.value)}
                placeholder={placeholder}
                className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
              />
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-900/50 bg-rose-950/20 text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-950/35"
                aria-label={`Delete ${label} item`}
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/45 hover:bg-cyan-500/15"
          >
            + Add New {addLabel}
          </button>
        </div>
      ) : visibleItems.length > 0 ? (
        variant === 'pill' ? (
          <div className="flex flex-wrap gap-2">
            {visibleItems.map((item, index) => (
              <div
                key={`${item}-${index}`}
                className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200"
              >
                {item}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map((item, index) => (
              <div key={`${item}-${index}`} className="flex items-center gap-2 text-sm text-zinc-300 font-sans">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )
      ) : (
        <p className="text-sm text-zinc-600">{emptyLabel}</p>
      )}
    </div>
  );
}

function EditableProjectsSection({
  isEditing,
  onAdd,
  onDelete,
  onUpdate,
  projects,
}: {
  isEditing: boolean;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, field: keyof ResumeProject, value: string) => void;
  projects: ResumeProject[];
}) {
  const visibleProjects = projects.filter(
    (project) => project.title.trim() || project.subtitle.trim() || project.description.trim()
  );

  return (
    <div className="rounded-xl border border-blue-950/50 bg-[#090d1f]/40 p-6 backdrop-blur-md transition-all duration-300">
      <p className="mb-5 text-xs uppercase tracking-[0.2em] text-zinc-500">Featured Projects</p>
      {isEditing ? (
        <div className="space-y-4">
          {projects.map((project, index) => (
            <div key={`project-${index}`} className="rounded-xl border border-blue-950/50 bg-[#050b1b]/60 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={project.title}
                  onChange={(event) => onUpdate(index, 'title', event.target.value)}
                  placeholder="Project title"
                  className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                />
                <Input
                  value={project.subtitle}
                  onChange={(event) => onUpdate(index, 'subtitle', event.target.value)}
                  placeholder="Subtitle or short link label"
                  className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                />
                <Input
                  value={project.href}
                  onChange={(event) => onUpdate(index, 'href', event.target.value)}
                  placeholder="https://..."
                  className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10 md:col-span-2"
                />
                <Textarea
                  value={project.description}
                  onChange={(event) => onUpdate(index, 'description', event.target.value)}
                  placeholder="Short project description"
                  className="min-h-24 rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10 md:col-span-2"
                />
              </div>
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="mt-3 rounded-full border border-rose-900/50 bg-rose-950/20 px-3 py-1.5 text-xs text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-950/35"
              >
                Delete
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/45 hover:bg-cyan-500/15"
          >
            + Add New Project
          </button>
        </div>
      ) : visibleProjects.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleProjects.map((project, index) => (
            <article
              key={`${project.title}-${index}`}
              className="rounded-xl border border-blue-950/50 bg-[#050b1b]/60 p-4"
            >
              <h2 className="text-sm font-semibold text-zinc-100">{project.title || 'Untitled Project'}</h2>
              {project.href ? (
                <a
                  href={project.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-xs text-cyan-400 transition-colors hover:text-cyan-300"
                >
                  {project.subtitle || project.href}
                </a>
              ) : (
                <p className="mt-1 text-xs text-cyan-400">{project.subtitle}</p>
              )}
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {project.description || 'Project description pending.'}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No featured projects added yet.</p>
      )}
    </div>
  );
}

function ExternalLinksEditor({
  isEditing,
  links,
  onAdd,
  onDelete,
  onUpdate,
}: {
  isEditing: boolean;
  links: ResumeExternalLink[];
  onAdd: () => void;
  onDelete: (index: number) => void;
  onUpdate: (index: number, field: keyof ResumeExternalLink, value: string) => void;
}) {
  const visibleLinks = links.filter((link) => link.label.trim() || link.href.trim());

  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">External Links</p>
      {isEditing ? (
        <div className="space-y-3">
          {links.map((link, index) => (
            <div key={`external-link-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]">
              <Input
                value={link.label}
                onChange={(event) => onUpdate(index, 'label', event.target.value)}
                placeholder="GitHub"
                className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
              />
              <Input
                value={link.href}
                onChange={(event) => onUpdate(index, 'href', event.target.value)}
                placeholder="https://..."
                className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
              />
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-900/50 bg-rose-950/20 text-rose-300 transition hover:border-rose-500/50 hover:bg-rose-950/35"
                aria-label="Delete external link"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/45 hover:bg-cyan-500/15"
          >
            + Add New Link
          </button>
        </div>
      ) : visibleLinks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleLinks.map((item, index) => {
            const Icon = getExternalLinkIcon(item.label);

            return (
              <a
                key={`${item.label}-${index}`}
                href={item.href || '#'}
                target={item.href ? '_blank' : undefined}
                rel={item.href ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-2 rounded-full border border-blue-950/60 bg-[#050b1b]/70 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-300"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                {item.label || item.href || 'Link'}
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-600">No external links added yet.</p>
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
  const visibleNavigationItems = useMemo(
    () => (isSpectator ? navigationItems.filter((item) => item.label !== 'Search') : navigationItems),
    [isSpectator]
  );
  const { authEnabled, loading, supabase, user } = useViewerProfile();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<number | null>(null);
  const [formData, setFormData] = useState<ResumeFormData>(() => createDefaultFormData());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canEdit = !isSpectator && isEditing;

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
            .select('full_name, avatar_url, age, current_status, qualifications, skills, experience, hobbies, resume_projects, external_links')
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

        const nextFormData = createDefaultFormData();
        const loadedProjects = normalizeProjects(resume?.resume_projects);
        const loadedExternalLinks = normalizeExternalLinks(resume?.external_links);

        setFormData({
          ...nextFormData,
          name:
            resume?.full_name ??
            resume?.name ??
            (user?.user_metadata?.full_name as string | undefined) ??
            (user?.user_metadata?.name as string | undefined) ??
            '',
          age: typeof resume?.age === 'number' ? String(resume.age) : '',
          status: resume?.current_status ?? resume?.status ?? '',
          qualifications: resume ? normalizeList(resume.qualifications) : nextFormData.qualifications,
          skills: resume ? normalizeList(resume.skills) : nextFormData.skills,
          experience: resume ? normalizeList(resume.experience) : nextFormData.experience,
          hobbies: resume ? normalizeList(resume.hobbies) : nextFormData.hobbies,
          projects: resume ? loadedProjects : nextFormData.projects,
          externalLinks: resume ? loadedExternalLinks : nextFormData.externalLinks,
        });
        setAvatarUrl(
          resume?.avatar_url ??
            (user?.user_metadata?.avatar_url as string | undefined) ??
            (user?.user_metadata?.picture as string | undefined) ??
            null
        );
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
      setIsEditing(false);
    }
  }, [isSpectator]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  function updateFormField<K extends keyof ResumeFormData>(field: K, value: ResumeFormData[K]) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function updateStringList(field: 'qualifications' | 'experience' | 'hobbies' | 'skills', index: number, value: string) {
    setFormData((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addStringItem(field: 'qualifications' | 'experience' | 'hobbies' | 'skills') {
    setFormData((current) => ({ ...current, [field]: [...current[field], ''] }));
  }

  function deleteStringItem(field: 'qualifications' | 'experience' | 'hobbies' | 'skills', index: number) {
    setFormData((current) => ({
      ...current,
      [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateProject(index: number, field: keyof ResumeProject, value: string) {
    setFormData((current) => ({
      ...current,
      projects: current.projects.map((project, itemIndex) =>
        itemIndex === index ? { ...project, [field]: value } : project
      ),
    }));
  }

  function addProject() {
    setFormData((current) => ({
      ...current,
      projects: [...current.projects, { title: '', subtitle: '', href: '', description: '' }],
    }));
  }

  function deleteProject(index: number) {
    setFormData((current) => ({
      ...current,
      projects: current.projects.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateExternalLink(index: number, field: keyof ResumeExternalLink, value: string) {
    setFormData((current) => ({
      ...current,
      externalLinks: current.externalLinks.map((link, itemIndex) =>
        itemIndex === index ? { ...link, [field]: value } : link
      ),
    }));
  }

  function addExternalLink() {
    setFormData((current) => ({
      ...current,
      externalLinks: [...current.externalLinks, { label: '', href: '' }],
    }));
  }

  function deleteExternalLink(index: number) {
    setFormData((current) => ({
      ...current,
      externalLinks: current.externalLinks.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSave() {
    if (isSpectator || !supabase || !user || saveState === 'saving') {
      return;
    }

    setSaveState('saving');
    setFormError(null);

    try {
      const parsedAge = formData.age.trim() ? Number.parseInt(formData.age, 10) : null;
      const nextFormData: ResumeFormData = {
        ...formData,
        name: formData.name.trim(),
        age: formData.age.trim(),
        qualifications: formData.qualifications.map((item) => item.trim()).filter(Boolean),
        experience: formData.experience.map((item) => item.trim()).filter(Boolean),
        hobbies: formData.hobbies.map((item) => item.trim()).filter(Boolean),
        skills: formData.skills.map((item) => item.trim()).filter(Boolean),
        projects: formData.projects
          .map((project) => ({
            title: project.title.trim(),
            subtitle: project.subtitle.trim(),
            href: project.href.trim(),
            description: project.description.trim(),
          }))
          .filter((project) => project.title || project.subtitle || project.href || project.description),
        externalLinks: formData.externalLinks
          .map((link) => ({ label: link.label.trim(), href: link.href.trim() }))
          .filter((link) => link.label || link.href),
      };
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: nextFormData.name || null,
          age: Number.isFinite(parsedAge) ? parsedAge : null,
          current_status: nextFormData.status || null,
          qualifications: nextFormData.qualifications,
          experience: nextFormData.experience,
          hobbies: nextFormData.hobbies,
          skills: nextFormData.skills,
          resume_projects: nextFormData.projects,
          external_links: nextFormData.externalLinks,
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      setFormData(nextFormData);
      setSaveState('saved');
      setIsEditing(false);
      setSuccessMessage('Resume changes saved.');
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setSuccessMessage(null);
        setSaveState('idle');
      }, 2600);
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
              <AnimatePresence initial={false}>
                {visibleNavigationItems.map((item) => {
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
                    <motion.div
                      key={item.href}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <SidebarLink
                        href={href}
                        label={item.label}
                        active={pathname === item.href}
                        icon={<Icon className="h-5 w-5" strokeWidth={1.8} />}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </nav>
          </div>
          <div className="rounded-xl border border-blue-950/40 bg-[#090d1f]/40 p-3 text-xs text-slate-500">
            Secure profile workspace
          </div>
        </aside>

        <section className="flex h-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
            <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-400">Profile Intake Terminal</p>
                <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">Resume</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                  Build a focused technical profile for career matching and MeliusAI context.
                </p>
              </div>
              {!isSpectator ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setSuccessMessage(null);
                    setSaveState('idle');
                    if (isEditing) {
                      void handleSave();
                    } else {
                      setIsEditing(true);
                    }
                  }}
                  disabled={saveState === 'saving'}
                  className={cn(
                    'inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60',
                    isEditing
                      ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:border-emerald-300/60 hover:bg-emerald-500/20'
                      : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100 hover:border-cyan-300/60 hover:bg-cyan-500/15'
                  )}
                >
                  {saveState === 'saving' ? 'Saving...' : isEditing ? 'Save Changes' : 'Edit Profile'}
                </button>
              ) : null}
            </div>

            <div className="space-y-5">
              {successMessage ? (
                <p className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                  {successMessage}
                </p>
              ) : null}

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
                          value={formData.name}
                          onChange={(event) => updateFormField('name', event.target.value)}
                          placeholder="e.g., Nikunj Sharma"
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        />
                      ) : (
                        <p className="rounded-xl border border-transparent py-3 text-base text-zinc-200">
                          {formData.name || 'Name not provided'}
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
                          value={formData.age}
                          onChange={(event) => updateFormField('age', event.target.value)}
                          placeholder="e.g., 22"
                          className="rounded-xl border-blue-950/60 bg-[#050b1b]/70 focus:border-cyan-500/40 focus:ring-cyan-500/10"
                        />
                      ) : (
                        <p className="py-3 text-sm text-zinc-300">{formData.age || 'Not specified'}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={canEdit ? 'resume-current-status' : undefined}>Current Status</Label>
                      {canEdit ? (
                        <Select
                          id="resume-current-status"
                          name="current_status"
                          value={formData.status}
                          onChange={(event) => updateFormField('status', event.target.value as ResumeStatus)}
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
                        <p className="py-3 text-sm text-zinc-300">{formData.status || 'Not specified'}</p>
                      )}
                    </div>

                    <ExternalLinksEditor
                      isEditing={canEdit}
                      links={formData.externalLinks}
                      onAdd={addExternalLink}
                      onDelete={deleteExternalLink}
                      onUpdate={updateExternalLink}
                    />
                  </div>
                </div>
              </div>

              <EditableStringListSection
                addLabel="Qualification"
                emptyLabel="No qualifications added yet."
                isEditing={canEdit}
                items={formData.qualifications}
                label="Qualifications"
                onAdd={() => addStringItem('qualifications')}
                onDelete={(index) => deleteStringItem('qualifications', index)}
                onUpdate={(index, value) => updateStringList('qualifications', index, value)}
                placeholder="Passed 10th from..."
              />

              <EditableStringListSection
                addLabel="Skill"
                emptyLabel="No skills added yet."
                isEditing={canEdit}
                items={formData.skills}
                label="Skills"
                onAdd={() => addStringItem('skills')}
                onDelete={(index) => deleteStringItem('skills', index)}
                onUpdate={(index, value) => updateStringList('skills', index, value)}
                placeholder="React"
                variant="pill"
              />

              <EditableStringListSection
                addLabel="Experience"
                emptyLabel="No professional experience added yet."
                isEditing={canEdit}
                items={formData.experience}
                label="Professional Experience"
                onAdd={() => addStringItem('experience')}
                onDelete={(index) => deleteStringItem('experience', index)}
                onUpdate={(index, value) => updateStringList('experience', index, value)}
                placeholder="Software Engineer at..."
              />

              <EditableProjectsSection
                isEditing={canEdit}
                onAdd={addProject}
                onDelete={deleteProject}
                onUpdate={updateProject}
                projects={formData.projects}
              />

              <EditableStringListSection
                addLabel="Hobby"
                emptyLabel="No hobbies added yet."
                isEditing={canEdit}
                items={formData.hobbies}
                label="Hobbies"
                onAdd={() => addStringItem('hobbies')}
                onDelete={(index) => deleteStringItem('hobbies', index)}
                onUpdate={(index, value) => updateStringList('hobbies', index, value)}
                placeholder="Photography"
              />

              {formError ? (
                <p className="rounded-xl border border-rose-900/70 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
                  {formError}
                </p>
              ) : null}
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
