'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardHref, useViewerProfile } from '@/lib/viewer-client';
import type { UserRole } from '@/types/supabase';

const paths: Array<{
  role: UserRole;
  badge: 'accent' | 'creative';
  title: string;
  description: string;
  points: [string, string, string];
}> = [
  {
    role: 'talent',
    badge: 'accent',
    title: 'Individual (Talent)',
    description: 'Analyze my work and find my dream job.',
    points: ['Universal portfolio scan', 'Goods vs. bads breakdown', 'Auto-apply when ready'],
  },
  {
    role: 'recruiter',
    badge: 'creative',
    title: 'Company (Recruiter)',
    description: 'Hire AI-verified talent with 0% guesswork.',
    points: ['Verified candidate proof', 'Gap-based screening', 'High-confidence shortlists'],
  },
];

export function ChoosePathScreen() {
  const router = useRouter();
  const { authEnabled, loading, profile, user } = useViewerProfile();
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role_selected_at) {
      router.replace(getDashboardHref(profile.role));
    }
  }, [profile, router]);

  async function selectRole(role: UserRole) {
    setPendingRole(role);
    setError(null);

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role,
          role_selected_at: new Date().toISOString(),
        }),
      });

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error ?? 'Unable to save your role.');
      }

      router.replace(getDashboardHref(role));
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your role.');
      setPendingRole(null);
    }
  }

  if (!authEnabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <Card className="w-full border-sky-500/20">
          <CardHeader>
            <Badge variant="outline" className="w-fit">Auth not configured</Badge>
            <CardTitle className="text-3xl">Choose your path once Supabase is connected.</CardTitle>
            <CardDescription className="text-base leading-7">
              This onboarding route is ready, but the compulsory sign-in gate needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button href="/">Return to landing</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-10 sm:px-6">
        <Card className="w-full border-slate-800/80">
          <CardHeader>
            <CardTitle className="text-3xl">Sign in to choose your path.</CardTitle>
            <CardDescription className="text-base leading-7">
              MeliusAI asks every user to authenticate before saving their role and routing them into the right experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button href="/">Back to landing</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full space-y-8">
        <div className="space-y-4 text-center">
          <Badge variant="outline">Choose your path</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {profile?.display_name ? `${profile.display_name},` : 'Now'} pick the MeliusAI workspace built for you.
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            We save this role to your account and route you into the right dashboard immediately. You can change it later if your workflow evolves.
          </p>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {paths.map((path) => (
            <Card
              key={path.role}
              className={path.role === 'talent' ? 'border-sky-500/20' : 'border-fuchsia-500/20'}
            >
              <CardHeader>
                <Badge variant={path.badge} className="w-fit">{path.title}</Badge>
                <CardTitle className="text-3xl">{path.description}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  {path.points.map((point) => (
                    <div key={point} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
                      {point}
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => void selectRole(path.role)}
                  disabled={pendingRole !== null}
                >
                  {pendingRole === path.role ? 'Saving your path...' : `Continue as ${path.title}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
