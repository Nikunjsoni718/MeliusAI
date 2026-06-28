'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Mail, X } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type OpportunityCardItem = {
  id: string;
  organization_id: string;
  organizations?: { id?: string | null } | null;
  recruiter_name: string;
  role_title: string;
  core_skills: string;
  match_score: number;
  matched_skills: string[];
  match_explanation: string;
  company_email: string | null;
  status: string;
};

type CandidateOpportunityCardProps = {
  item: OpportunityCardItem;
  displayName: string;
  onDismiss: (opportunityId: string) => void | Promise<void>;
};

type MatchTheme = {
  accentText: string;
  ambientGlow: string;
  applyButton: string;
  badge: string;
  card: string;
  matchPanel: string;
  skillTag: string;
  statusBadge: string;
};

function splitTags(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function getMatchTheme(score: number): MatchTheme {
  if (score >= 90) {
    return {
      accentText: 'text-purple-300',
      ambientGlow: 'bg-purple-500/20 shadow-[0_0_52px_rgba(168,85,247,0.26)]',
      applyButton:
        'border-purple-400/45 bg-purple-500/10 text-purple-50 shadow-[0_0_28px_rgba(168,85,247,0.14)] hover:border-purple-300 hover:bg-purple-500/20 hover:shadow-[0_0_34px_rgba(168,85,247,0.24)]',
      badge:
        'border-purple-400/45 bg-purple-500/15 text-purple-100 shadow-[0_0_28px_rgba(168,85,247,0.24)]',
      card:
        'border-purple-500/30 bg-slate-900/70 shadow-[0_0_42px_rgba(168,85,247,0.12)] hover:border-purple-400/50',
      matchPanel: 'border-purple-400/20 bg-purple-500/[0.07]',
      skillTag: 'border-purple-500/35 bg-purple-500/10 text-purple-200',
      statusBadge: 'border-purple-400/25 bg-purple-500/10 text-purple-200',
    };
  }

  if (score >= 70) {
    return {
      accentText: 'text-blue-300',
      ambientGlow: 'bg-blue-500/20 shadow-[0_0_48px_rgba(59,130,246,0.22)]',
      applyButton:
        'border-blue-400/40 bg-blue-500/10 text-blue-50 shadow-[0_0_26px_rgba(59,130,246,0.12)] hover:border-blue-300 hover:bg-blue-500/20 hover:shadow-[0_0_32px_rgba(59,130,246,0.22)]',
      badge:
        'border-blue-400/40 bg-blue-500/15 text-blue-100 shadow-[0_0_24px_rgba(59,130,246,0.2)]',
      card:
        'border-blue-500/20 bg-slate-900/70 shadow-[0_0_34px_rgba(59,130,246,0.1)] hover:border-blue-400/45',
      matchPanel: 'border-blue-400/20 bg-blue-500/[0.07]',
      skillTag: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
      statusBadge: 'border-blue-400/25 bg-blue-500/10 text-blue-200',
    };
  }

  return {
    accentText: 'text-slate-300',
    ambientGlow: 'bg-transparent shadow-none',
    applyButton:
      'border-slate-600/80 bg-slate-900/60 text-slate-200 hover:border-slate-400 hover:bg-slate-800/80 hover:text-white',
    badge: 'border-slate-600/70 bg-slate-800/60 text-slate-200 shadow-none',
    card: 'border-slate-700/60 bg-slate-900/70 shadow-none hover:border-slate-500/70',
    matchPanel: 'border-slate-700/60 bg-slate-800/35',
    skillTag: 'border-slate-600/70 bg-slate-800/50 text-slate-300',
    statusBadge: 'border-slate-600/70 bg-slate-800/50 text-slate-300',
  };
}

export function CandidateOpportunitySkeleton() {
  return (
    <Card className="overflow-hidden border-blue-950/50 bg-slate-900/70 backdrop-blur-md">
      <CardContent className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="h-6 w-32 rounded-full bg-slate-700/70" />
              <div className="h-7 w-2/3 rounded-lg bg-slate-700/70" />
              <div className="flex flex-wrap gap-2">
                <div className="h-7 w-20 rounded-md bg-slate-800" />
                <div className="h-7 w-24 rounded-md bg-slate-800" />
                <div className="h-7 w-16 rounded-md bg-slate-800" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="h-9 w-24 rounded-full bg-slate-800" />
              <div className="h-9 w-9 rounded-full bg-slate-800" />
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-700/60 bg-slate-800/30 px-4 py-3">
            <div className="h-3 w-48 rounded-full bg-slate-700/70" />
            <div className="h-4 w-full rounded-full bg-slate-800" />
            <div className="h-4 w-5/6 rounded-full bg-slate-800" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <div className="h-11 w-40 rounded-xl bg-slate-800" />
            <div className="h-11 w-28 rounded-xl bg-slate-800" />
            <div className="h-11 w-52 rounded-xl bg-slate-800" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CandidateOpportunityCard({ item, displayName, onDismiss }: CandidateOpportunityCardProps) {
  const router = useRouter();
  const matchScore = Math.round(item.match_score);
  const theme = getMatchTheme(matchScore);

  const matchedKeywords = item.matched_skills.join(', ');
  const matchDescription = matchedKeywords
    ? `You match this role because your profile contains verified expertise in: ${matchedKeywords}`
    : item.match_explanation;
  const gmailComposeUrl = item.company_email
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.company_email)}&su=${encodeURIComponent(`MeliusAI Opportunity Application — ${displayName}`)}`
    : null;

  const handleReadManifesto = () => {
    const targetId = item.organization_id || item.organizations?.id;

    if (!targetId) {
      console.error('Missing organization ID. Current data:', item);
      alert('Data syncing. Please refresh your feed.');
      return;
    }

    router.push(`/organization/dashboard/about?orgId=${targetId}`);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, scale: 1, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0, marginTop: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <Card className={cn('relative overflow-hidden backdrop-blur-md transition-all duration-300', theme.card)}>
        <div className={cn('pointer-events-none absolute -right-24 -top-24 h-48 w-48 rounded-full blur-3xl', theme.ambientGlow)} />
        <CardContent className="relative flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]', theme.statusBadge)}>
                {item.recruiter_name}
              </span>
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">{item.role_title}</h3>
              {item.core_skills ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {splitTags(item.core_skills).map((skill, index) => (
                    <span key={`${skill}-${index}`} className={cn('rounded-md border px-3 py-1 text-xs font-bold tracking-wide', theme.skillTag)}>
                      {skill}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className={cn('inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.16em]', theme.statusBadge)}>
                {item.status}
              </span>
              <button
                type="button"
                onClick={() => void onDismiss(item.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/40 text-slate-400 transition duration-300 hover:border-red-400/40 hover:bg-red-900/40 hover:text-red-100"
                aria-label={`Discard ${item.role_title} opportunity`}
                title="Discard"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className={cn('rounded-2xl border px-4 py-3', theme.matchPanel)}>
            <span className={cn('block text-[10px] font-bold uppercase tracking-[0.18em]', theme.accentText)}>
              Verified skill match: {matchedKeywords || 'Broad role alignment'}
            </span>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-200">{matchDescription}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleReadManifesto}
              className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition duration-300', theme.applyButton)}
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Read Manifesto
            </button>
            <span className={cn('inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-bold', theme.badge)}>
              {matchScore}% MATCH
            </span>
            {gmailComposeUrl ? (
              <a
                href={gmailComposeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition duration-300', theme.applyButton)}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Apply directly via Gmail
              </a>
            ) : (
              <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                Application email unavailable
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
