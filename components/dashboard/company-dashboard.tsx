'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { getDashboardHref, useViewerProfile } from '@/lib/viewer-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const candidates = [
  {
    name: 'Aarav Sharma',
    profession: 'Product Engineer',
    company: 'Google',
    score: 93,
    readyMeter: 91,
    goods: 'Strong shipping proof, crisp frontend execution, and recruiter-ready portfolio packaging.',
    bads: 'Needs slightly deeper architecture narration for senior reviewers.',
  },
  {
    name: 'Mira Iyer',
    profession: 'Product Designer',
    company: 'Zomato',
    score: 90,
    readyMeter: 88,
    goods: 'Taste is immediate and the case-study structure already feels professional.',
    bads: 'Needs stronger outcome metrics tied to the final design decisions.',
  },
  {
    name: 'Kabir Nanda',
    profession: 'Growth Marketer',
    company: 'Stripe',
    score: 89,
    readyMeter: 86,
    goods: 'Channel strategy and campaign framing feel commercially relevant.',
    bads: 'Performance reporting needs to be more visible before auto-routing to interviews.',
  },
];

export function CompanyDashboard() {
  const router = useRouter();
  const { authEnabled, loading, profile, supabase, user } = useViewerProfile();

  useEffect(() => {
    if (!authEnabled || loading) {
      return;
    }

    if (!user) {
      router.replace('/auth/organization');
      return;
    }

    if (profile?.role_selected_at && profile.role === 'talent') {
      router.replace('/home');
      return;
    }

    if (profile && !profile.role_selected_at) {
      router.replace('/choose-path');
    }
  }, [authEnabled, loading, profile, router, user]);

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    clearPersistedAuthState();
    router.replace('/');
  }

  if (!authEnabled) {
    return renderRecruiterShell({ demoMode: true });
  }

  if (
    loading ||
    !user ||
    profile?.role === 'talent' ||
    Boolean(profile && !profile.role_selected_at)
  ) {
    return null;
  }

  return renderRecruiterShell({
    demoMode: false,
    onSignOut: () => void handleSignOut(),
    recruiterName: profile?.display_name ?? 'Recruiter',
    roleLabel: getDashboardHref(profile?.role ?? 'recruiter'),
  });
}

function renderRecruiterShell(input: {
  demoMode: boolean;
  onSignOut?: () => void;
  recruiterName?: string;
  roleLabel?: string;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.6)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-6 border-b border-slate-800/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="creative">Recruiter dashboard</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Hire AI-verified talent with 0% guesswork.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              Review a shortlist built from verified proof, explicit strengths, visible weaknesses, and company-specific readiness before outreach even starts.
            </p>
            {input.demoMode ? <p className="mt-3 text-sm text-amber-200">Demo mode: connect Supabase to enforce recruiter auth and save live queues.</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" href="/">Back to landing</Button>
            <Button href="/choose-path">Switch path</Button>
            {input.onSignOut ? <Button variant="ghost" onClick={input.onSignOut}>Sign out</Button> : null}
          </div>
        </div>

        <section className="grid gap-5 py-6 lg:grid-cols-[1fr_0.9fr]">
          <Card className="border-fuchsia-500/15">
            <CardHeader>
              <CardTitle>Recruiter promise</CardTitle>
              <CardDescription>Every card in this shortlist is built from verified work, not resume guesswork.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {[
                ['Candidate confidence', '93%'],
                ['Median review time', '11 min'],
                ['Guesswork removed', '0%'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mono mt-3 text-2xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shortlist logic</CardTitle>
              <CardDescription>Goods, bads, and readiness stay visible together so hiring teams can make faster, calmer decisions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                'Proof-first candidate ranking',
                'Visible gap analysis for every application target',
                'Verified portfolio packets routed the moment a candidate is ready',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5">
          {candidates.map((candidate) => (
            <Card key={candidate.name} className="border-slate-800/80">
              <CardContent className="grid gap-5 p-6 lg:grid-cols-[0.86fr_0.74fr_0.4fr] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xl font-semibold text-white">{candidate.name}</p>
                    <Badge variant="outline">{candidate.profession}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">Targeting {candidate.company} with an AI-verified portfolio packet and a visible job-readiness trail.</p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Goods</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{candidate.goods}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Bads</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{candidate.bads}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Melius Score</p>
                    <p className="mono mt-3 text-3xl font-semibold text-fuchsia-200">{candidate.score}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ready Meter</p>
                    <p className="mono mt-3 text-3xl font-semibold text-white">{candidate.readyMeter}%</p>
                    <div className="mt-3">
                      <Progress value={candidate.readyMeter} indicatorClassName="bg-gradient-to-r from-fuchsia-500 via-violet-400 to-sky-400" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}

