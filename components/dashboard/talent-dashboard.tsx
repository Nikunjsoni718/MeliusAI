'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import type { PortfolioAssessmentResult } from '@/lib/mentor';
import { useViewerProfile } from '@/lib/viewer-client';

const professionOptions = ['Developer', 'Designer', 'Marketer', 'HR', 'Product Manager'];

type ReviewPayload = PortfolioAssessmentResult & {
  savedProjectId?: string | null;
};

function getFirstName(name: string) {
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

export function TalentDashboard() {
  const router = useRouter();
  const { authEnabled, loading, profile, supabase, user } = useViewerProfile();
  const [sourceUrl, setSourceUrl] = useState('');
  const [description, setDescription] = useState('');
  const [profession, setProfession] = useState('Developer');
  const [targetCompany, setTargetCompany] = useState('Google');
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [reviewResult, setReviewResult] = useState<ReviewPayload | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    if (profile?.role_selected_at && profile.role === 'recruiter') {
      router.replace('/company');
    }

    if (profile && !profile.role_selected_at) {
      router.replace('/choose-path');
    }
  }, [profile, router]);

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewError(null);
    setApplyMessage(null);
    setIsReviewing(true);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceUrl,
          description,
          profession,
          targetCompany,
          autoApplyEnabled: agentEnabled,
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        data?: ReviewPayload;
        error?: string;
      } | null;

      if (!response.ok || !body?.data) {
        throw new Error(body?.error ?? "We couldn't review that project right now.");
      }

      setReviewResult(body.data);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "We couldn't review that project right now.");
    } finally {
      setIsReviewing(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    clearPersistedAuthState();
    router.replace('/');
  }

  function handleAutoApply() {
    setApplyMessage('Looks good. We will apply for you when the role is ready.');
  }

  if (!authEnabled) {
    return renderDashboard({
      agentEnabled,
      applyMessage,
      isDemoMode: true,
      isReviewing,
      onAutoApply: handleAutoApply,
      onReview: handleReview,
      profession,
      reviewError,
      reviewResult,
      setAgentEnabled,
      setProfession,
      setSourceUrl,
      setDescription,
      setTargetCompany,
      sourceUrl,
      description,
      targetCompany,
      viewerName: 'Friend',
    });
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-slate-300">Loading your dashboard...</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <Card className="w-full">
          <CardHeader>
            <Badge variant="outline" className="w-fit">Sign in required</Badge>
            <CardTitle className="text-3xl">Please sign in first.</CardTitle>
            <CardDescription className="text-base leading-7">
              Sign in to save your work and reviews.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button href="/auth">Sign In</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return renderDashboard({
    agentEnabled,
    applyMessage,
    isDemoMode: false,
    isReviewing,
    onAutoApply: handleAutoApply,
    onReview: handleReview,
    onSignOut: () => void handleSignOut(),
    profession,
    reviewError,
    reviewResult,
    setAgentEnabled,
    setProfession,
    setSourceUrl,
    setDescription,
    setTargetCompany,
    sourceUrl,
    description,
    targetCompany,
    viewerName: profile?.display_name ?? 'there',
  });
}

function renderDashboard(input: {
  agentEnabled: boolean;
  applyMessage: string | null;
  isDemoMode: boolean;
  isReviewing: boolean;
  onAutoApply: () => void;
  onReview: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSignOut?: () => void;
  profession: string;
  description: string;
  reviewError: string | null;
  reviewResult: ReviewPayload | null;
  setAgentEnabled: (value: boolean) => void;
  setProfession: (value: string) => void;
  setSourceUrl: (value: string) => void;
  setDescription: (value: string) => void;
  setTargetCompany: (value: string) => void;
  sourceUrl: string;
  targetCompany: string;
  viewerName: string;
}) {
  const firstName = getFirstName(input.viewerName);
  const reviewState = input.isReviewing
    ? 'Reviewing...'
    : input.reviewResult
      ? 'Verified'
      : 'Ready for Review';

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-slate-800/80 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.6)] backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-6 border-b border-slate-800/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="accent">Dashboard</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Hey {firstName}, welcome back.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              Everything looks good. Your work is safe here.
            </p>
            {input.isDemoMode ? (
              <p className="mt-3 text-sm text-amber-200">Demo mode. Connect Supabase to save your work.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" href="/">Back home</Button>
            {input.onSignOut ? <Button onClick={input.onSignOut}>Sign out</Button> : null}
          </div>
        </div>

        <section className="grid gap-5 py-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-sky-500/15">
            <CardHeader>
              <CardTitle>Upload Project</CardTitle>
              <CardDescription>Add code, art, or design.</CardDescription>
            </CardHeader>
            <CardContent>
              {!input.reviewResult && !input.isReviewing ? (
                <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                  Your vault is empty! Drop your first project (code, art, or design) here to get an AI review.
                </div>
              ) : null}

              <form className="space-y-4" onSubmit={input.onReview}>
                <div className="space-y-2">
                  <Label htmlFor="portfolio-url">Project link</Label>
                  <Input
                    id="portfolio-url"
                    placeholder="https://github.com/yourname/project"
                    value={input.sourceUrl}
                    onChange={(event) => input.setSourceUrl(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-description">Project description</Label>
                  <Textarea
                    id="project-description"
                    placeholder="Describe your project architecture, engineering challenges, and tech stack in detail..."
                    value={input.description}
                    onChange={(event) => input.setDescription(event.target.value)}
                    className="h-24 w-full resize-none rounded-xl border border-blue-950/60 bg-[#090d1f]/60 p-3 text-sm text-slate-300 transition-all placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profession">Profession</Label>
                    <Select
                      id="profession"
                      value={input.profession}
                      onChange={(event) => input.setProfession(event.target.value)}
                    >
                      {professionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="target-company">Target company</Label>
                    <Input
                      id="target-company"
                      placeholder="Google, Zomato, Stripe"
                      value={input.targetCompany}
                      onChange={(event) => input.setTargetCompany(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                  <div>
                    <p className="text-sm font-medium text-white">Activate MeliusAI</p>
                    <p className="mt-1 text-sm text-slate-400">We will apply once you hit 90.</p>
                  </div>
                  <Switch checked={input.agentEnabled} onCheckedChange={input.setAgentEnabled} />
                </div>

                {input.reviewError ? <p className="text-sm text-rose-300">{input.reviewError}</p> : null}

                <Button size="lg" type="submit" disabled={input.isReviewing || !input.sourceUrl.trim()}>
                  {input.isReviewing ? 'Reviewing...' : 'Upload Project'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{reviewState}</CardTitle>
                  <CardDescription>
                    {input.isReviewing
                      ? 'We are checking your project now.'
                      : input.reviewResult
                        ? input.reviewResult.verifiedHeadline
                        : 'Upload one project to get started.'}
                  </CardDescription>
                </div>
                <Badge variant={input.reviewResult ? 'accent' : 'outline'}>{reviewState}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {input.reviewResult ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Melius Score</p>
                      <p className="mt-2 mono text-5xl font-semibold text-sky-300">{input.reviewResult.meliusScore}</p>
                    </div>
                    <Badge variant="accent">{input.reviewResult.targetRole}</Badge>
                  </div>
                  <Progress value={input.reviewResult.meliusScore} />
                  <p className="text-sm leading-6 text-slate-300">{input.reviewResult.summary}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Source</p>
                      <p className="mt-3 text-base text-white">{input.reviewResult.sourceKind}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Saved Review</p>
                      <p className="mt-3 text-base text-white">{input.reviewResult.savedProjectId ? 'Saved' : 'Not saved yet'}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                  Your first review will show up here.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {input.reviewResult ? (
          <section className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            <Card>
              <CardHeader>
                <CardTitle>Goods vs. Bads</CardTitle>
                <CardDescription>Here is what looks strong. Here is what to fix next.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <Badge variant="accent" className="w-fit">Goods</Badge>
                  {input.reviewResult.goods.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <Badge variant="creative" className="w-fit">Bads</Badge>
                  {input.reviewResult.bads.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Upgrade Your Skills</CardTitle>
                  <CardDescription>These are the next steps.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {input.reviewResult.roadmap.map((item, index) => (
                    <div key={item} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sm font-semibold text-sky-300">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-6 text-slate-300">{item}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Target a Job</CardTitle>
                  <CardDescription>See how close you are.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Ready Meter</p>
                      <p className="mt-2 mono text-4xl font-semibold text-white">{input.reviewResult.readyMeter ?? '--'}%</p>
                    </div>
                    <Badge variant={input.reviewResult.readyMeter !== null && input.reviewResult.readyMeter >= 90 ? 'accent' : 'outline'}>
                      {input.reviewResult.targetCompany ?? 'Set a target'}
                    </Badge>
                  </div>
                  <Progress value={input.reviewResult.readyMeter ?? 0} />
                  <Separator />
                  {input.reviewResult.gaps.map((gap) => (
                    <div key={gap} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                      {gap}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-sky-500/20">
                <CardHeader>
                  <CardTitle>MeliusAI Agent</CardTitle>
                  <CardDescription>Turn a good review into action.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <div>
                      <p className="text-sm font-medium text-white">Agent status</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {input.agentEnabled ? 'On and waiting.' : 'Off for now.'}
                      </p>
                    </div>
                    <Switch checked={input.agentEnabled} onCheckedChange={input.setAgentEnabled} />
                  </div>
                  {input.agentEnabled && input.reviewResult.autoApplyEligible ? (
                    <Button size="lg" onClick={input.onAutoApply}>Apply Automatically</Button>
                  ) : (
                    <p className="text-sm text-slate-400">Turn this on when your Ready Meter hits 90.</p>
                  )}
                  {input.applyMessage ? <p className="text-sm text-emerald-300">{input.applyMessage}</p> : null}
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
