'use client';

import type { User } from '@supabase/supabase-js';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  createSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
} from '@/lib/supabase/client';

const GITHUB_APP_INSTALLATION_URL = 'https://github.com/apps/meliusai/installations/new';
const GITHUB_APP_PROMPTED_KEY = 'github_app_prompted';
const GITHUB_LINK_INTENT_KEY = 'intent_to_link_github';

function getMetadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getGitHubUsernameFromUser(user: User | null | undefined) {
  const userMetadata = user?.user_metadata as Record<string, unknown> | null | undefined;
  const githubIdentity = user?.identities?.find((identity) => identity.provider === 'github');
  const identityData = githubIdentity?.identity_data as
    | Record<string, unknown>
    | null
    | undefined;
  const candidates = [
    getMetadataText(userMetadata, 'preferred_username'),
    getMetadataText(userMetadata, 'user_name'),
    getMetadataText(userMetadata, 'login'),
    getMetadataText(userMetadata, 'github_username'),
    getMetadataText(identityData, 'preferred_username'),
    getMetadataText(identityData, 'user_name'),
    getMetadataText(identityData, 'login'),
  ];

  return candidates.find((candidate): candidate is string => Boolean(candidate)) ?? null;
}

export default function GitHubAppSetupPage() {
  const hasStartedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    if (!hasSupabaseBrowserEnv()) {
      setErrorMessage('GitHub setup is unavailable because authentication is not configured.');
      return;
    }

    let isActive = true;

    const completeOAuthAndInstallApp = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const callbackUrl = new URL(window.location.href);
        const code = callbackUrl.searchParams.get('code');
        const authResult = code
          ? await supabase.auth.exchangeCodeForSession(code)
          : await supabase.auth.getSession();

        if (authResult.error) {
          throw authResult.error;
        }

        const linkedUser = authResult.data.session?.user;
        const providers = linkedUser?.app_metadata?.providers || [];
        const hasGitHubProvider =
          Array.isArray(providers) && providers.includes('github');

        if (!linkedUser || !hasGitHubProvider) {
          throw new Error('GitHub OAuth completed without a linked GitHub provider.');
        }

        const githubUsername = getGitHubUsernameFromUser(linkedUser);
        if (!githubUsername) {
          throw new Error('GitHub OAuth completed without a GitHub username.');
        }

        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({
            github_username: githubUsername,
            updated_at: new Date().toISOString(),
          })
          .eq('id', linkedUser.id);

        if (profileUpdateError) {
          throw profileUpdateError;
        }

        if (!isActive) {
          return;
        }

        window.history.replaceState({}, document.title, '/profile/setup-app');
        sessionStorage.removeItem(GITHUB_LINK_INTENT_KEY);
        localStorage.setItem(GITHUB_APP_PROMPTED_KEY, 'true');
        window.location.href = GITHUB_APP_INSTALLATION_URL;
      } catch (error) {
        if (!isActive) {
          return;
        }

        console.error('GitHub OAuth handoff failed:', error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'GitHub linking did not finish. Please return to your profile and try again.'
        );
      }
    };

    void completeOAuthAndInstallApp();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="flex max-w-md flex-col items-center gap-4">
        {errorMessage ? null : (
          <LoaderCircle className="h-7 w-7 animate-spin text-sky-400" aria-hidden="true" />
        )}
        <p className={errorMessage ? 'text-sm text-rose-300' : 'text-sm text-slate-300'}>
          {errorMessage ?? 'GitHub Linked! Redirecting to setup repositories...'}
        </p>
      </div>
    </main>
  );
}
