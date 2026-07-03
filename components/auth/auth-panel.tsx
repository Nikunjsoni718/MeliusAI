'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/supabase';

type AuthPanelProps = {
  authEnabled: boolean;
  className?: string;
  description?: string;
  onClose?: () => void;
  showCloseButton?: boolean;
  supabase: SupabaseClient<Database> | null;
  title?: string;
};

type ProfileBootstrapResponse = {
  error?: string;
  profile?: {
    id: string;
  };
  success?: boolean;
};

export function AuthPanel({
  authEnabled,
  className,
  description = 'Sign in or create your account first so MeliusAI can save your role, scan history, and verified portfolio trail.',
  onClose,
  showCloseButton = false,
  supabase,
  title = 'Start your free scan',
}: AuthPanelProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submitLabel = pending
    ? mode === 'signup'
      ? 'Creating account...'
      : 'Signing in...'
    : mode === 'signup'
      ? 'Create account'
      : 'Sign in';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authEnabled || !supabase) {
      setError('Add Supabase env vars to enable the compulsory sign-in gate.');
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);

    async function ensureProfile(accessToken?: string | null) {
      const headers = new Headers({
        'Content-Type': 'application/json',
      });

      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }

      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          role: 'talent',
          full_name: fullName.trim() || email.trim().split('@')[0],
        }),
      });
      const body = (await response.json().catch(() => null)) as ProfileBootstrapResponse | null;

      if (!response.ok || !body?.success || !body.profile?.id) {
        throw new Error(body?.error ?? 'Auth succeeded, but profile creation failed. Please try again.');
      }
    }

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              role: 'talent',
              full_name: fullName.trim() || email.trim().split('@')[0],
              display_name: fullName.trim() || email.trim().split('@')[0],
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (data.session) {
          await ensureProfile(data.session.access_token);
          window.location.assign('/choose-path');
          return;
        }

        setMessage('Check your inbox to confirm your account, then sign in to continue.');
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          throw signInError;
        }

        if (data.user) {
          await ensureProfile(data.session?.access_token);
          window.location.assign('/choose-path');
        }
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to continue with sign-in.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className={cn('w-full border-sky-500/20 bg-slate-950/90', className)}>
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription className="mt-2 text-base leading-7">
              {description}
            </CardDescription>
          </div>
          {showCloseButton && onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2 rounded-full border border-slate-800 bg-slate-950/90 p-1">
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm transition ${mode === 'signup' ? 'bg-sky-500 text-slate-950' : 'text-slate-300'}`}
            onClick={() => setMode('signup')}
          >
            Sign up
          </button>
          <button
            type="button"
            className={`flex-1 rounded-full px-4 py-2 text-sm transition ${mode === 'signin' ? 'bg-sky-500 text-slate-950' : 'text-slate-300'}`}
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'signup' ? (
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                autoComplete="name"
                placeholder="Aarav Sharma"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              autoComplete="email"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="At least 8 characters"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
          <Button className="w-full" size="lg" type="submit" disabled={pending}>
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
