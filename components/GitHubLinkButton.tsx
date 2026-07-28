'use client';

import { GitBranch, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { GITHUB_IMPORT_INTENT } from '@/lib/auth-session-routing';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function GitHubLinkButton() {
  const errorId = useId();
  const [isLinking, setIsLinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLinkGitHub() {
    setIsLinking(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectUrl = new URL('/auth/callback', window.location.origin);
      redirectUrl.searchParams.set('intent', GITHUB_IMPORT_INTENT);
      const { error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          redirectTo: redirectUrl.toString(),
          scopes: 'public_repo admin:repo_hook',
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('GitHub identity linking failed:', error);
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
        onClick={() => void handleLinkGitHub()}
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
