'use client';

import {
  Camera,
  Check,
  FileCode2,
  FolderUp,
  LoaderCircle,
  Upload,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type OnboardingFormData = {
  profilePhoto: File | null;
  bio: string;
  qualifications: string;
  skills: string;
  experienceAndRole: string;
  repositoryFiles: File[];
  talentPoolOptIn: boolean;
};

type OnboardingOverlayProps = {
  onComplete: (formData: OnboardingFormData) => void | Promise<void>;
};

const initialFormData: OnboardingFormData = {
  profilePhoto: null,
  bio: '',
  qualifications: '',
  skills: '',
  experienceAndRole: '',
  repositoryFiles: [],
  talentPoolOptIn: true,
};

const progressByStep = {
  1: 33,
  2: 66,
  3: 100,
} as const;

const loadingMessages = [
  'Parsing Profile...',
  'Calibrating AI...',
  'Auditing Repository...',
] as const;

const stepContent = {
  1: {
    eyebrow: 'Profile setup',
    title: 'Complete Your Profile',
    description: 'Tell us a bit about yourself to initialize your workspace.',
  },
  2: {
    eyebrow: 'Background signal',
    title: 'Engine Calibration',
    description: 'Enter your background so the AI can accurately evaluate your code.',
  },
  3: {
    eyebrow: 'Repository baseline',
    title: 'Final Step: Initialize Workspace',
    description: 'Upload a code folder or repository to generate your baseline score.',
  },
} as const;

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

export function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<OnboardingFormData>(initialFormData);
  const [isPhotoDragActive, setIsPhotoDragActive] = useState(false);
  const [isRepositoryDragActive, setIsRepositoryDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function keepFocusInsideOverlay(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && (document.activeElement === firstElement || document.activeElement === dialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', keepFocusInsideOverlay, true);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', keepFocusInsideOverlay, true);
    };
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isSubmitting, step]);

  function updateField<Key extends keyof OnboardingFormData>(
    field: Key,
    value: OnboardingFormData[Key]
  ) {
    setFormData((currentData) => ({
      ...currentData,
      [field]: value,
    }));
  }

  function selectProfilePhoto(files: FileList | File[]) {
    const photo = Array.from(files).find((file) => file.type.startsWith('image/')) ?? null;
    if (photo) {
      updateField('profilePhoto', photo);
    }
  }

  function handlePhotoDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsPhotoDragActive(false);
    selectProfilePhoto(event.dataTransfer.files);
  }

  function selectRepositoryFiles(files: FileList | File[]) {
    const repositoryFiles = Array.from(files);
    if (repositoryFiles.length > 0) {
      updateField('repositoryFiles', repositoryFiles);
    }
  }

  function handleRepositoryDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsRepositoryDragActive(false);
    selectRepositoryFiles(event.dataTransfer.files);
  }

  async function handleFinalSubmit() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      for (let index = 0; index < loadingMessages.length; index += 1) {
        setLoadingMessageIndex(index);
        await wait(1000);
      }

      await onComplete(formData);
    } catch {
      setIsSubmitting(false);
      setLoadingMessageIndex(0);
    }
  }

  const progress = progressByStep[step];
  const content = stepContent[step];
  const repositoryRootName =
    formData.repositoryFiles[0]?.webkitRelativePath.split('/')[0] ||
    formData.repositoryFiles[0]?.name ||
    '';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-overlay-title"
      aria-describedby="onboarding-overlay-description"
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 px-4 py-5 outline-none backdrop-blur-sm sm:px-6"
    >
      <Card className="relative w-full max-w-[500px] overflow-hidden border-slate-700/80 bg-[#07101d] shadow-[0_30px_100px_rgba(0,0,0,0.72)]">
        <Progress
          value={progress}
          aria-label={`Onboarding progress: step ${step} of 3`}
          className="absolute inset-x-0 top-0 z-10 h-1 rounded-none bg-slate-800 ring-0"
          indicatorClassName="rounded-none bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-300 duration-500"
        />

        <div className="max-h-[calc(100vh-2.5rem)] overflow-y-auto">
          <header className="border-b border-slate-800/90 px-6 pb-5 pt-8 sm:px-8">
            <div className="mb-4 flex items-center justify-between gap-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em]">
              <span className="text-sky-300">{content.eyebrow}</span>
              <span className="text-slate-500">Step {step} / 3</span>
            </div>
            <h2
              id="onboarding-overlay-title"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              {content.title}
            </h2>
            <p
              id="onboarding-overlay-description"
              className="mt-2 text-sm leading-6 text-slate-400"
            >
              {content.description}
            </p>
          </header>

          {isSubmitting ? (
            <section
              className="flex min-h-[410px] flex-col items-center justify-center px-8 py-14 text-center"
              aria-live="assertive"
              aria-busy="true"
            >
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/[0.07]">
                <LoaderCircle className="h-8 w-8 animate-spin text-sky-300" aria-hidden="true" />
                <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.9)]" />
              </div>
              <p className="mt-7 font-mono text-sm font-semibold tracking-[0.08em] text-sky-100">
                {loadingMessages[loadingMessageIndex]}
              </p>
              <div className="mt-5 flex gap-2" aria-hidden="true">
                {loadingMessages.map((message, index) => (
                  <span
                    key={message}
                    className={cn(
                      'h-1 w-8 rounded-full transition-colors duration-300',
                      index <= loadingMessageIndex ? 'bg-sky-400' : 'bg-slate-800'
                    )}
                  />
                ))}
              </div>
              <p className="mt-5 max-w-xs text-xs leading-5 text-slate-500">
                Your workspace is locked while MeliusAI builds your baseline.
              </p>
            </section>
          ) : (
            <form className="px-6 py-6 sm:px-8" onSubmit={(event) => event.preventDefault()}>
              {step === 1 ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-5">
                    <label
                      htmlFor="onboarding-profile-photo"
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsPhotoDragActive(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setIsPhotoDragActive(false)}
                      onDrop={handlePhotoDrop}
                      className={cn(
                        'group flex h-24 w-24 shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full border border-dashed bg-slate-950/80 text-center transition',
                        isPhotoDragActive
                          ? 'border-sky-300 bg-sky-500/10 text-sky-200'
                          : 'border-slate-600 text-slate-400 hover:border-sky-500/70 hover:bg-slate-900'
                      )}
                    >
                      <input
                        id="onboarding-profile-photo"
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          if (event.target.files) {
                            selectProfilePhoto(event.target.files);
                          }
                        }}
                      />
                      {formData.profilePhoto ? (
                        <>
                          <Check className="h-6 w-6 text-emerald-300" aria-hidden="true" />
                          <span className="mt-1 max-w-16 truncate font-mono text-[9px] text-slate-300">
                            {formData.profilePhoto.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <Camera className="h-6 w-6 transition-transform group-hover:scale-105" aria-hidden="true" />
                          <span className="mt-1 font-mono text-[9px] uppercase tracking-wider">Upload</span>
                        </>
                      )}
                    </label>
                    <div>
                      <p className="text-sm font-medium text-slate-100">Profile photo</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Drop an image or click to browse. A square image works best.
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label htmlFor="onboarding-bio" className="text-sm font-medium text-slate-200">
                        Bio
                      </label>
                      <span className="font-mono text-[10px] text-slate-500">
                        {formData.bio.length}/150
                      </span>
                    </div>
                    <Textarea
                      id="onboarding-bio"
                      value={formData.bio}
                      maxLength={150}
                      rows={5}
                      onChange={(event) => updateField('bio', event.target.value)}
                      placeholder="e.g., Full-stack developer focused on dependable systems and thoughtful developer tooling..."
                      className="min-h-32 resize-none border-slate-700/80 bg-[#0a1524] placeholder:font-mono placeholder:text-xs"
                    />
                  </div>

                  <Button className="w-full" size="lg" onClick={() => setStep(2)}>
                    Next: Experience &amp; Skills
                  </Button>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="onboarding-qualifications" className="mb-2 block text-sm font-medium text-slate-200">
                      Primary Qualifications
                    </label>
                    <Input
                      id="onboarding-qualifications"
                      value={formData.qualifications}
                      onChange={(event) => updateField('qualifications', event.target.value)}
                      placeholder="e.g., Self-Taught, B.Tech CS"
                      className="border-slate-700/80 bg-[#0a1524] placeholder:font-mono placeholder:text-xs"
                    />
                  </div>

                  <div>
                    <label htmlFor="onboarding-skills" className="mb-2 block text-sm font-medium text-slate-200">
                      Core Tech Stack &amp; Skills
                    </label>
                    <Input
                      id="onboarding-skills"
                      value={formData.skills}
                      onChange={(event) => updateField('skills', event.target.value)}
                      placeholder="e.g., React, TypeScript, PostgreSQL, Docker"
                      className="border-slate-700/80 bg-[#0a1524] placeholder:font-mono placeholder:text-xs"
                    />
                    <p className="mt-2 font-mono text-[10px] text-slate-500">Separate skills with commas</p>
                  </div>

                  <div>
                    <label htmlFor="onboarding-experience" className="mb-2 block text-sm font-medium text-slate-200">
                      Years of Experience &amp; Current Role
                    </label>
                    <Input
                      id="onboarding-experience"
                      value={formData.experienceAndRole}
                      onChange={(event) => updateField('experienceAndRole', event.target.value)}
                      placeholder="e.g., 4 years — Senior Frontend Engineer"
                      className="border-slate-700/80 bg-[#0a1524] placeholder:font-mono placeholder:text-xs"
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <Button variant="ghost" className="px-3 text-sm" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button size="lg" className="sm:min-w-60" onClick={() => setStep(3)}>
                      Next: Project Upload
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-5">
                  <label
                    htmlFor="onboarding-repository"
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsRepositoryDragActive(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setIsRepositoryDragActive(false)}
                    onDrop={handleRepositoryDrop}
                    className={cn(
                      'group flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition',
                      isRepositoryDragActive
                        ? 'border-sky-300 bg-sky-500/10'
                        : 'border-slate-600 bg-[#0a1524]/80 hover:border-sky-500/70 hover:bg-slate-900/80'
                    )}
                  >
                    <input
                      id="onboarding-repository"
                      type="file"
                      multiple
                      className="sr-only"
                      {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        if (event.target.files) {
                          selectRepositoryFiles(event.target.files);
                        }
                      }}
                    />
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                      {formData.repositoryFiles.length > 0 ? (
                        <FileCode2 className="h-7 w-7" aria-hidden="true" />
                      ) : (
                        <FolderUp className="h-7 w-7 transition-transform group-hover:-translate-y-0.5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="mt-4 text-sm font-semibold text-slate-100">
                      {repositoryRootName || 'Drag & drop your code folder'}
                    </span>
                    <span className="mt-2 font-mono text-[10px] leading-5 text-slate-500">
                      {formData.repositoryFiles.length > 0
                        ? `${formData.repositoryFiles.length} files ready for audit`
                        : 'or click to select a local repository'}
                    </span>
                    {!repositoryRootName ? (
                      <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-sky-300">
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        Browse files
                      </span>
                    ) : null}
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <input
                      type="checkbox"
                      checked={formData.talentPoolOptIn}
                      onChange={(event) => updateField('talentPoolOptIn', event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-600 bg-slate-900 accent-sky-500"
                    />
                    <span className="text-xs leading-5 text-slate-300">
                      Opt-in to the MeliusAI Talent Pool to get discovered by recruiters.
                    </span>
                  </label>

                  <div className="flex flex-col gap-2">
                    <Button className="w-full" size="lg" onClick={() => void handleFinalSubmit()}>
                      Run Baseline Audit &amp; Enter Workspace
                    </Button>
                    <Button variant="ghost" className="h-9 text-xs" onClick={() => setStep(2)}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : null}
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
