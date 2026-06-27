"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { SessionRouteGuard } from '@/components/auth/session-route-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { persistAuthenticatedRouteState, persistAuthenticatedUser } from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from '@/lib/supabase/client';

type AuthTab = 'login' | 'register';

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return String(error);
}

export default function CorporateOrganisationAuthPage() {
  const router = useRouter();
  const [supabase] = useState(() => {
    if (!hasSupabaseBrowserEnv()) {
      return null;
    }

    try {
      return createSupabaseBrowserClient();
    } catch (error) {
      console.error('Supabase corporate auth client failed to initialize:', error);
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [workspaceUsername, setWorkspaceUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const readAuthRole = (user: unknown) => {
    const typedUser = user as {
      raw_user_meta_data?: { role?: string };
      user_metadata?: { role?: string };
    } | null;

    return typedUser?.raw_user_meta_data?.role ?? typedUser?.user_metadata?.role;
  };

  const handleCorporateLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (!supabase) {
      setAuthError('Corporate authentication is not configured yet.');
      setAuthMessage(null);
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (error) {
        throw error;
      }

      if (readAuthRole(data.user) === 'corporate') {
        if (data.user) {
          persistAuthenticatedUser(data.user);
        } else {
          persistAuthenticatedRouteState('organization');
        }
        router.replace('/organization/dashboard');
        return;
      }

      setAuthError('This account is not linked to a verified organisation workspace.');
    } catch (error) {
      console.error('Corporate sign-in failed:', error);
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCorporateRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (!supabase) {
      setAuthError('Corporate authentication is not configured yet.');
      setAuthMessage(null);
      return;
    }

    const orgUsername = workspaceUsername.trim().toLowerCase();

    setIsSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: registerEmail.trim().toLowerCase(),
        password: registerPassword,
        options: {
          data: {
            role: 'corporate',
            company_name: companyName.trim(),
            org_username: orgUsername,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session && readAuthRole(data.user) === 'corporate') {
        if (data.user) {
          persistAuthenticatedUser(data.user);
        } else {
          persistAuthenticatedRouteState('organization');
        }
        router.replace('/organization/dashboard');
        return;
      }

      setAuthMessage('Check your work email to confirm the organisation workspace.');
    } catch (error) {
      console.error('Corporate registration failed:', error);
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabClassName = (tab: AuthTab) =>
    activeTab === tab
      ? 'rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-[0_0_30px_rgba(0,112,243,0.2)]'
      : 'rounded-full px-4 py-2 text-sm font-medium text-slate-300 hover:text-white';

  return (
    <SessionRouteGuard>
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 font-[var(--font-sans)] text-slate-100 select-none sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,112,243,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.16),transparent_32%)]" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-sky-400/25 bg-white/[0.06] shadow-2xl shadow-slate-950/50 backdrop-blur-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,112,243,0.18),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.12),transparent_35%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
        <div className="relative p-6 sm:p-8">
        <div className="text-center">
          <span className="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-3.5 py-1 text-[10px] font-bold tracking-wide text-sky-200">
            Verified Organisation
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white">
            {activeTab === 'login' ? 'Sign In' : 'Create Account'}
          </h1>
          <p className="mt-3 text-sm font-medium tracking-wide text-slate-400">Choose how you want to sign in.</p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-slate-950/60 p-1 text-center transition-all">
          <button type="button" onClick={() => setActiveTab('login')} className={tabClassName('login')}>
            Sign In
          </button>
          <button type="button" onClick={() => setActiveTab('register')} className={tabClassName('register')}>
            Create Account
          </button>
        </div>

        {activeTab === 'login' ? (
          <form onSubmit={handleCorporateLogin} className="mt-7 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Email
              </label>
              <Input
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="you@company.com"
                className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Password
              </label>
              <div className="relative flex items-center">
                <Input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="border-white/10 bg-slate-950/60 pr-14 focus:border-sky-500/60 focus:ring-sky-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((value) => !value)}
                  className="absolute right-3 text-[10px] font-bold tracking-widest text-slate-500 hover:text-slate-300 uppercase transition-colors select-none focus:outline-none"
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleCorporateRegister} className="mt-7 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Company Name
              </label>
              <Input
                type="text"
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. Acme Corp"
                className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Workspace Username
              </label>
              <div className="relative flex items-center">
                <Input
                  type="text"
                  required
                  value={workspaceUsername}
                  onChange={(event) =>
                    setWorkspaceUsername(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }
                  placeholder="acme-engineering"
                  className="border-white/10 bg-slate-950/60 pr-28 focus:border-sky-500/60 focus:ring-sky-500/20"
                />
                <span className="absolute right-3 border-l border-slate-800/80 pl-3 text-[10px] font-bold tracking-wide text-slate-500">
                  .meliusai.com
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Work Email
              </label>
              <Input
                type="email"
                required
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                placeholder="name@company.com"
                className="border-white/10 bg-slate-950/60 focus:border-sky-500/60 focus:ring-sky-500/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">
                Password
              </label>
              <div className="relative flex items-center">
                <Input
                  type={showRegisterPassword ? 'text' : 'password'}
                  required
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="border-white/10 bg-slate-950/60 pr-14 focus:border-sky-500/60 focus:ring-sky-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword((value) => !value)}
                  className="absolute right-3 text-[10px] font-bold tracking-widest text-slate-500 hover:text-slate-300 uppercase transition-colors select-none focus:outline-none"
                >
                  {showRegisterPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        )}

        {authError ? (
          <div className="mt-5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-200">
            {authError}
          </div>
        ) : null}
        {authMessage ? (
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
            {authMessage}
          </div>
        ) : null}

        <div className="mt-7 border-t border-slate-800/50 pt-4 text-center">
          <button
            type="button"
            onClick={() => router.push('/auth')}
            className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-300"
          >
            ← Return to individual candidate gateway
          </button>
        </div>
      </div>
    </div>
    </div>
    </SessionRouteGuard>
  );
}
