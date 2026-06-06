"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

import { SessionRouteGuard } from '@/components/auth/session-route-guard';
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
      ? 'bg-[#0091ff] text-white rounded-xl py-2 px-6 shadow-md shadow-blue-500/10'
      : 'text-slate-500 hover:text-slate-300 rounded-xl py-2 px-6';

  return (
    <SessionRouteGuard>
    <div className="min-h-screen bg-[#030512] flex items-center justify-center p-4 font-[var(--font-sans)] text-slate-100 select-none">
      <div className="w-full max-w-md rounded-[24px] border border-slate-800/60 bg-gradient-to-br from-[#191336] via-[#070a1e] to-[#030512] p-6 shadow-2xl shadow-slate-950/50 md:p-8">
        <div className="text-center">
          <span className="inline-flex rounded-full border border-purple-700/40 bg-purple-950/35 px-3.5 py-1 text-[10px] font-bold tracking-wide text-purple-300">
            Verified Organisation
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white">
            {activeTab === 'login' ? 'Sign In' : 'Create Account'}
          </h1>
          <p className="mt-3 text-sm font-medium tracking-wide text-slate-400">Choose how you want to sign in.</p>
        </div>

        <div className="mt-7 grid grid-cols-2 rounded-full border border-slate-800/80 bg-[#060817] p-1 text-center text-xs font-bold transition-all">
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
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-slate-800 bg-[#080916] px-4 py-2.5 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-700 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="w-full rounded-xl border border-slate-800 bg-[#080916] py-2.5 pl-4 pr-14 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-800 focus:border-blue-500"
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[#1a446c] px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-blue-950/20 transition-all hover:bg-[#21527f] active:scale-[0.99]"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCorporateRegister} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Company Name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-xl border border-slate-800 bg-[#080916] px-4 py-2.5 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-700 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Workspace Username
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  required
                  value={workspaceUsername}
                  onChange={(event) =>
                    setWorkspaceUsername(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }
                  placeholder="acme-engineering"
                  className="w-full rounded-xl border border-slate-800 bg-[#080916] py-2.5 pl-4 pr-28 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-700 focus:border-blue-500"
                />
                <span className="absolute right-3 border-l border-slate-800/80 pl-3 text-[10px] font-bold tracking-wide text-slate-500">
                  .meliusai.com
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Work Email
              </label>
              <input
                type="email"
                required
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-xl border border-slate-800 bg-[#080916] px-4 py-2.5 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-700 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Password
              </label>
              <div className="relative flex items-center">
                <input
                  type={showRegisterPassword ? 'text' : 'password'}
                  required
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="w-full rounded-xl border border-slate-800 bg-[#080916] py-2.5 pl-4 pr-14 text-sm font-medium text-slate-200 outline-none transition-all placeholder:text-slate-800 focus:border-blue-500"
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[#1a446c] px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-white shadow-lg shadow-blue-950/20 transition-all hover:bg-[#21527f] active:scale-[0.99]"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>
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
    </SessionRouteGuard>
  );
}
