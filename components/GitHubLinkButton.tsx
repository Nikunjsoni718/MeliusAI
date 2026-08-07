'use client';

import { GitBranch, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function GitHubLinkButton() {
  const errorId = useId();
  const [isLinking, setIsLinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLinkGitHub() {
    if (isLinking) {
      return;
    }

    setIsLinking(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/profile/setup-app`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          scopes: 'repo',
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error('GitHub OAuth did not return an authorization URL.');
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error('GitHub Auth Error:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'GitHub could not be linked. Please try again.'
      );
      setIsLinking(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 rounded-lg border-slate-700 bg-[#161b22] px-4 text-xs text-white hover:border-slate-600 hover:bg-slate-800"
        disabled={isLinking}
        aria-busy={isLinking}
        aria-describedby={errorMessage ? errorId : undefined}
        onClick={handleLinkGitHub}
      >
        {isLinking ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GitBranch className="h-4 w-4" aria-hidden="true" />
        )}
        {isLinking ? 'Connecting...' : 'Link GitHub'}
      </Button>

      {errorMessage ? (
        <p id={errorId} role="alert" className="max-w-64 text-right text-xs text-rose-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
