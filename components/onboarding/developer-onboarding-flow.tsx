'use client';

import { useState, type ChangeEvent, type DragEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type DeveloperOnboardingData = {
  profilePhoto: File | null;
  bio: string;
  qualifications: string;
  skills: string;
  experienceAndRole: string;
  techFixations: string;
  repositoryFiles: File[];
  talentPoolOptIn: boolean;
};

type DeveloperOnboardingFlowProps = {
  onComplete?: (data: DeveloperOnboardingData) => void | Promise<void>;
};

const initialFormData: DeveloperOnboardingData = {
  profilePhoto: null,
  bio: '',
  qualifications: '',
  skills: '',
  experienceAndRole: '',
  techFixations: '',
  repositoryFiles: [],
  talentPoolOptIn: false,
};

const loadingMessages = [
  'Parsing Identity...',
  'Calibrating Engine...',
  'Analyzing Repository Ecosystem...',
] as const;

const progressByStep = {
  1: 33,
  2: 66,
  3: 100,
} as const;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.75 7.25A2.25 2.25 0 0 1 6 5h3.15c.6 0 1.17.24 1.59.66l1.09 1.09H18A2.25 2.25 0 0 1 20.25 9v8A2.25 2.25 0 0 1 18 19.25H6A2.25 2.25 0 0 1 3.75 17V7.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 12.25h9M12 9.75v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <span className="relative flex h-12 w-12 items-center justify-center" aria-hidden="true">
      <span className="absolute inset-0 rounded-full border border-sky-400/20" />
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sky-400 border-r-blue-500" />
      <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.85)]" />
    </span>
  );
}

export function DeveloperOnboardingFlow({ onComplete }: DeveloperOnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<DeveloperOnboardingData>(initialFormData);
  const [isPhotoDragActive, setIsPhotoDragActive] = useState(false);
  const [isRepositoryDragActive, setIsRepositoryDragActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  function updateField<Key extends keyof DeveloperOnboardingData>(
    field: Key,
    value: DeveloperOnboardingData[Key]
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
    const nextFiles = Array.from(files);
    if (nextFiles.length > 0) {
      updateField('repositoryFiles', nextFiles);
    }
  }

  function handleRepositoryDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsRepositoryDragActive(false);
    selectRepositoryFiles(event.dataTransfer.files);
  }

  async function handleFinalSubmit() {
    await onComplete?.(formData);
  }

  async function handleRunBaselineAudit() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      for (let index = 0; index < loadingMessages.length; index += 1) {
        setLoadingMessageIndex(index);
        await wait(1000);
      }

      await handleFinalSubmit();
    } finally {
      setIsSubmitting(false);
    }
  }

  const repositoryRootName =
    formData.repositoryFiles[0]?.webkitRelativePath.split('/')[0] ||
    formData.repositoryFiles[0]?.name ||
    '';

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.12),transparent_30%)]" />

      <Card className="relative w-full max-w-3xl overflow-hidden border-slate-700/70 bg-[#07111f]/95 shadow-none backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-slate-800" aria-hidden="true">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-300 transition-[width] duration-500 ease-out"
            style={{ width: `${progressByStep[step]}%` }}
          />
        </div>

        <CardContent className="p-0">
          <div className="border-b border-slate-800/80 px-6 pb-5 pt-8 sm:px-10 sm:pt-10">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                MeliusAI Developer Protocol
              </p>
              <p className="font-mono text-[11px] text-slate-500">{progressByStep[step]}% configured</p>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
              {step === 1
                ? 'Step 1/3: Establish Developer Identity'
                : step === 2
                  ? 'Step 2/3: Engine Calibration'
                  : 'Step 3/3: Initialize Baseline Audit'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {step === 1
                ? 'Configure your public-facing MeliusAI profile.'
                : step === 2
                  ? 'MeliusAI tailors architectural recommendations based on your exact background.'
                  : 'Upload your best repository to generate your first verified architectural score.'}
            </p>
          </div>

          {isSubmitting ? (
            <section
              className="flex min-h-[470px] flex-col items-center justify-center px-6 py-16 text-center sm:px-10"
              aria-live="polite"
              aria-busy="true"
            >
              <LoadingSpinner />
              <p className="mt-7 font-mono text-sm font-semibold tracking-[0.08em] text-sky-200">
                {loadingMessages[loadingMessageIndex]}
              </p>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                Your onboarding configuration is locked while MeliusAI initializes the workspace baseline.
              </p>
            </section>
          ) : (
            <form
              className="px-6 py-7 sm:px-10 sm:py-9"
              onSubmit={(event) => event.preventDefault()}
            >
              {step === 1 ? (
                <div className="space-y-8">
                  <div className="flex flex-col items-center text-center">
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
                        'flex h-36 w-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-full border border-dashed bg-slate-950/80 px-5 text-center transition',
                        isPhotoDragActive
                          ? 'border-sky-300 bg-sky-500/10 text-sky-200'
                          : 'border-slate-600 text-slate-400 hover:border-sky-500/60 hover:bg-slate-900/80'
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
                      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
                        <path
                          d="M8.25 7.25 9.5 5.5h5l1.25 1.75H18A2.25 2.25 0 0 1 20.25 9.5v7A2.25 2.25 0 0 1 18 18.75H6a2.25 2.25 0 0 1-2.25-2.25v-7A2.25 2.25 0 0 1 6 7.25h2.25Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                        <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      <span className="mt-2 max-w-24 truncate font-mono text-[10px]">
                        {formData.profilePhoto?.name ?? 'Drop or browse'}
                      </span>
                    </label>
                    <p className="mt-3 text-xs text-slate-500">
                      Professional headshot or GitHub avatar recommended.
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <label htmlFor="onboarding-bio" className="text-sm font-medium text-slate-200">
                        Bio
                      </label>
                      <span className="font-mono text-[11px] text-slate-500">{formData.bio.length}/150</span>
                    </div>
                    <Textarea
                      id="onboarding-bio"
                      value={formData.bio}
                      maxLength={150}
                      rows={5}
                      onChange={(event) => updateField('bio', event.target.value)}
                      placeholder="e.g., Full-stack React & Python developer passionate about scalable backend architecture..."
                      className="resize-none border-slate-700/80 bg-[#091525] font-sans placeholder:font-mono placeholder:text-xs"
                    />
                  </div>

                  <Button className="w-full" size="lg" onClick={() => setStep(2)}>
                    Continue to Calibration
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
                      placeholder="e.g., B.Tech Computer Science, Self-Taught Full Stack..."
                      className="border-slate-700/80 bg-[#091525] placeholder:font-mono placeholder:text-xs"
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
                      placeholder="e.g., Python, React, PostgreSQL, Docker..."
                      className="border-slate-700/80 bg-[#091525] placeholder:font-mono placeholder:text-xs"
                    />
                    <p className="mt-2 text-xs text-slate-500">Please separate your top 5 skills with commas.</p>
                  </div>

                  <div>
                    <label htmlFor="onboarding-experience" className="mb-2 block text-sm font-medium text-slate-200">
                      Years of Experience &amp; Current Role
                    </label>
                    <Input
                      id="onboarding-experience"
                      value={formData.experienceAndRole}
                      onChange={(event) => updateField('experienceAndRole', event.target.value)}
                      placeholder="e.g., 3 Years - Junior React Developer"
                      className="border-slate-700/80 bg-[#091525] placeholder:font-mono placeholder:text-xs"
                    />
                  </div>

                  <div>
                    <label htmlFor="onboarding-fixations" className="mb-2 block text-sm font-medium text-slate-200">
                      Current Tech Fixations &amp; Side Quests
                    </label>
                    <Input
                      id="onboarding-fixations"
                      value={formData.techFixations}
                      onChange={(event) => updateField('techFixations', event.target.value)}
                      placeholder="e.g., Building indie games, AI image generation, homelab server hosting..."
                      className="border-slate-700/80 bg-[#091525] placeholder:font-mono placeholder:text-xs"
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button className="sm:min-w-44" size="lg" onClick={() => setStep(3)}>
                      Next Step
                    </Button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-6">
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
                      'flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition',
                      isRepositoryDragActive
                        ? 'border-sky-300 bg-sky-500/10'
                        : 'border-slate-600 bg-[#091525]/70 hover:border-sky-500/60 hover:bg-slate-900/70'
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
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                      <FolderIcon className="h-9 w-9" />
                    </span>
                    <span className="mt-5 text-base font-semibold text-slate-100">
                      {repositoryRootName || 'Drop your code folder or repository here'}
                    </span>
                    <span className="mt-2 max-w-md font-mono text-xs leading-5 text-slate-500">
                      {formData.repositoryFiles.length > 0
                        ? `${formData.repositoryFiles.length} files staged locally for the baseline audit.`
                        : 'Your files remain local until you run the final baseline audit.'}
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <input
                      type="checkbox"
                      checked={formData.talentPoolOptIn}
                      onChange={(event) => updateField('talentPoolOptIn', event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 accent-sky-500"
                    />
                    <span className="text-sm leading-6 text-slate-300">
                      Opt-in to the MeliusAI Talent Pool to get discovered by recruiters.
                    </span>
                  </label>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button className="sm:min-w-72" size="lg" onClick={() => void handleRunBaselineAudit()}>
                      Run Baseline Audit &amp; Enter Workspace
                    </Button>
                  </div>
                </div>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
