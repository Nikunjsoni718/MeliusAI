'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { GitBranch, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function GitHubSignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleGitHubSignIn() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase: SupabaseClient = createSupabaseBrowserClient();
      const redirectUrl = new URL('/auth/callback', window.location.origin);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: 'read:user user:email public_repo admin:repo_hook',
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'GitHub authentication could not be started. Please try again.';

      console.error('GitHub OAuth sign-in failed:', error);
      setErrorMessage(message);
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        variant="secondary"
        className="w-full rounded-lg border-gray-700 bg-[#161b22] text-white hover:border-gray-600 hover:bg-gray-800"
        disabled={isLoading}
        aria-describedby={errorMessage ? 'github-auth-error' : undefined}
        onClick={() => void handleGitHubSignIn()}
      >
        {isLoading ? (
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <GitBranch className="h-5 w-5" aria-hidden="true" />
        )}
        {isLoading ? 'Connecting...' : 'Continue with GitHub'}
      </Button>

      {errorMessage ? (
        <p id="github-auth-error" role="alert" className="mt-2 text-sm text-rose-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
