'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

type TimelineStepProps = {
  heading: string;
  description: string;
  reversed?: boolean;
  children: React.ReactNode;
};

function TimelineStep({ heading, description, reversed = false, children }: TimelineStepProps) {
  return (
    <section className="relative z-10 grid gap-8 pl-10 md:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] md:items-center md:gap-y-0 md:pl-0">
      <div className={reversed ? 'md:col-start-3 md:row-start-1' : 'md:col-start-1'}>
        <h2 className="text-4xl font-bold tracking-tight text-white lg:text-5xl">{heading}</h2>
        <p className="mt-6 text-lg leading-8 text-slate-400">{description}</p>
      </div>
      <div
        className={
          reversed
            ? 'md:col-start-1 md:row-start-1'
            : 'md:col-start-3 md:row-start-1'
        }
      >
        {children}
      </div>
    </section>
  );
}

function GitHubConnectionMockup() {
  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold text-white">
            GH
          </span>
          <div>
            <p className="text-sm font-semibold text-white">GitHub Connection</p>
            <p className="text-xs text-slate-500">Secure identity link</p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          Connected
        </span>
      </div>

      <div className="mt-6 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.055] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-cyan-100">OAuth access granted</span>
          <span className="text-xs font-medium text-cyan-300">Read-only</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Repository metadata and source architecture stay securely connected to your workspace.
        </p>
      </div>
    </div>
  );
}

function WorkspaceSelectionMockup() {
  const repositories = [
    { name: 'meliusai-platform', detail: 'Verification workspace', selected: true },
    { name: 'portfolio-api', detail: 'Ready to select', selected: false },
    { name: 'design-system', detail: 'Ready to select', selected: false },
  ];

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">Repository Workspace</p>
          <p className="mt-1 text-xs text-slate-500">Select a source repository</p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
          3 repositories
        </span>
      </div>

      <div className="space-y-3">
        {repositories.map((repository) => (
          <div
            key={repository.name}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
              repository.selected
                ? 'border-cyan-400/40 bg-cyan-400/[0.08]'
                : 'border-slate-800 bg-slate-900/70'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium text-white">{repository.name}</p>
              <p className="mt-1 text-xs text-slate-500">{repository.detail}</p>
            </div>
            {repository.selected ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-xs font-bold text-slate-950">
                ✓
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditScorecardMockup() {
  const metrics = [
    { label: 'Architecture', value: '92/100' },
    { label: 'Reliability', value: '94/100' },
    { label: 'Security', value: '89/100' },
  ];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.36)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">Verified Audit Scorecard</p>
          <p className="mt-1 text-xs text-slate-500">Line-by-line analysis complete</p>
        </div>
        <div className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-200">
          94/100
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 px-5 py-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center">
            <p className="text-xs text-slate-500">{metric.label}</p>
            <p className="mt-2 text-sm font-semibold text-cyan-200">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-t border-slate-800 px-5 py-4 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Strength</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Clean module boundaries and dependable error handling.</p>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Improve next</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">Validate external inputs at every API boundary.</p>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksTimeline() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ['start end', 'end start'],
  });
  const progressScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div ref={timelineRef} className="relative mx-auto flex max-w-6xl flex-col gap-y-28 py-24 sm:gap-y-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-4 top-0 z-0 w-px bg-slate-800 md:left-1/2 md:-translate-x-1/2"
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-0 z-0 h-full w-px origin-top bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)] motion-reduce:!scale-y-100 md:left-1/2 md:-translate-x-1/2"
        style={{ scaleY: progressScale }}
      />

      <TimelineStep
        heading="1. Connect GitHub"
        description="Link your identity with secure OAuth. No manual uploads or zipped files—just direct, read-only access to the repositories you want to verify."
      >
        <GitHubConnectionMockup />
      </TimelineStep>

      <TimelineStep
        heading="2. Select a Workspace"
        description="Choose a repository to act as your verification workspace. MeliusAI syncs the architecture directly from the source."
        reversed
      >
        <WorkspaceSelectionMockup />
      </TimelineStep>

      <TimelineStep
        heading="3. Get Verified"
        description="Run the AI engine to generate an instant, line-by-line audit. Get a verified scorecard detailing your strengths, weaknesses, and overall technical depth."
      >
        <AuditScorecardMockup />
      </TimelineStep>
    </div>
  );
}
