'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Mail, X } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

type OpportunityCardItem = {
  organization_id: string;
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
};

function splitTags(value: string) {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function CandidateOpportunityCard({ item, displayName }: CandidateOpportunityCardProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  if (isRemoved) return null;

  const matchedKeywords = item.matched_skills.join(', ');
  const matchDescription = matchedKeywords
    ? `You match this role because your profile contains verified expertise in: ${matchedKeywords}`
    : item.match_explanation;
  const gmailComposeUrl = item.company_email
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.company_email)}&su=${encodeURIComponent(`MeliusAI Opportunity Application — ${displayName}`)}`
    : null;

  console.log('Current Opportunity Data:', item);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={isDismissed ? { opacity: 0, y: -8, scale: 0.98, height: 0 } : { opacity: 1, y: 0, scale: 1, height: 'auto' }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      onAnimationComplete={() => {
        if (isDismissed) setIsRemoved(true);
      }}
      className="overflow-hidden"
    >
      <Card className="overflow-hidden border-blue-950/50 bg-gradient-to-br from-[#0b1024]/95 via-[#090d1f]/90 to-[#071329]/80 backdrop-blur-md">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                {item.recruiter_name}
              </span>
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">{item.role_title}</h3>
              {item.core_skills ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {splitTags(item.core_skills).map((skill, index) => (
                    <span key={`${skill}-${index}`} className="rounded-md border border-purple-700/50 bg-purple-900/30 px-3 py-1 text-xs font-bold tracking-wide text-purple-300">
                      {skill}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
                {item.status}
              </span>
              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950/40 text-slate-400 transition duration-200 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
                aria-label={`Discard ${item.role_title} opportunity`}
                title="Discard"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.06] px-4 py-3">
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              Verified skill match: {matchedKeywords || 'Broad role alignment'}
            </span>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-200">{matchDescription}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push(`/organization/dashboard/manifesto?orgId=${item.organization_id}`)
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-600/80 bg-slate-900/55 px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-200 transition hover:border-purple-400/50 hover:bg-purple-500/10 hover:text-purple-100"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Read Manifesto
            </button>
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-purple-400/40 bg-purple-500/15 px-4 py-2 text-sm font-bold text-purple-100 shadow-[0_0_26px_rgba(168,85,247,0.18)]">
              {Math.round(item.match_score)}% MATCH
            </span>
            {gmailComposeUrl ? (
              <a
                href={gmailComposeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/45 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 px-5 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.15)] transition hover:border-cyan-200 hover:from-cyan-500/30 hover:to-blue-500/30"
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
