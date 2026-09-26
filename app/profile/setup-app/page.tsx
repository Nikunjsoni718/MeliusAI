'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { advanceProductTour } from '@/components/onboarding/product-tour';
import {
  createSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
} from '@/lib/supabase/client';

const GITHUB_LINK_ERROR_TOAST_KEY = 'meliusai:github-link-error-toast';
const GITHUB_IDENTITY_ALREADY_LINKED_MESSAGE =
  'This GitHub account is already linked to another user.';

export default function GitHubAppSetupPage() {
  const hasStartedRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    const callbackUrl = new URL(window.location.href);
    if (callbackUrl.searchParams.get('error_code') === 'identity_already_exists') {
      // The server callback preserves provider errors for this destination.
      // Hand the profile dashboard a one-time toast instead of leaving the
      // user on a terminal OAuth error screen.
      try {
        window.sessionStorage.setItem(
          GITHUB_LINK_ERROR_TOAST_KEY,
          GITHUB_IDENTITY_ALREADY_LINKED_MESSAGE
        );
      } catch {
        // Storage can be disabled by the browser; the safe profile redirect is
        // still preferable to leaving the user on the callback page.
      }

      window.location.replace('/profile');
      return;
    }

    if (callbackUrl.searchParams.get('error')) {
      setErrorMessage(
        callbackUrl.searchParams.get('error_description') ??
          'GitHub linking did not finish. Please return to your profile and try again.'
      );
      return;
    }

    if (!hasSupabaseBrowserEnv()) {
      setErrorMessage('GitHub setup is unavailable because authentication is not configured.');
      return;
    }

    let isActive = true;

    const completePostAuthSetup = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        const linkedUser = data.session?.user;
        const providers = linkedUser?.app_metadata?.providers || [];
        const hasGitHubIdentity = linkedUser?.identities?.some(
          (identity) => identity.provider === 'github'
        );
        const hasGitHubProvider =
          hasGitHubIdentity ||
          (Array.isArray(providers) &&
            providers.some(
              (provider) => typeof provider === 'string' && provider.toLowerCase() === 'github'
            ));

        if (!linkedUser || !hasGitHubProvider) {
          throw new Error('GitHub OAuth completed without a linked GitHub provider.');
        }

        if (!isActive) {
          return;
        }

        // `/auth/callback` owns the PKCE exchange, profile synchronization,
        // and token persistence. This client page only resumes onboarding.
        advanceProductTour(8, 9);
        window.history.replaceState({}, document.title, '/profile/setup-app');
        window.location.replace('/profile');
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

    void completePostAuthSetup();

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
          {errorMessage ?? 'GitHub Linked! Redirecting to your Developer Profile...'}
        </p>
      </div>
    </main>
  );
}
