'use client';

import { GitBranch, LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function GitHubLinkButton() {
  const errorId = useId();
  const inputId = useId();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const [isLinking, setIsLinking] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [githubIdentifier, setGitHubIdentifier] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const linkingAttemptRef = useRef(false);

  useEffect(() => {
    if (!isPromptOpen || isLinking) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPromptOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isLinking, isPromptOpen]);

  function openLinkPrompt() {
    setErrorMessage(null);
    setIsPromptOpen(true);
  }

  async function handleLinkGitHub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();

    const identifier = githubIdentifier.trim();
    if (!identifier) {
      setErrorMessage('Enter your GitHub username or email before continuing.');
      return;
    }

    if (linkingAttemptRef.current) {
      return;
    }

    linkingAttemptRef.current = true;
    setIsLinking(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }
      if (!session) {
        throw new Error('Your session has expired. Sign in again before linking GitHub.');
      }

      console.log("Starting GitHub Link");
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          scopes: 'repo',
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.url) {
        throw new Error('Supabase did not return a GitHub authorization URL.');
      }

      // linkIdentity redirects automatically in the browser. Assigning the
      // returned URL also covers clients where that automatic handoff stalls.
      window.location.assign(data.url);
    } catch (error) {
      console.error(error);
      linkingAttemptRef.current = false;
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
        aria-describedby={errorMessage && !isPromptOpen ? errorId : undefined}
        aria-expanded={isPromptOpen}
        aria-haspopup="dialog"
        onClick={openLinkPrompt}
      >
        {isLinking ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GitBranch className="h-4 w-4" aria-hidden="true" />
        )}
        {isLinking ? 'Connecting...' : 'Link GitHub'}
      </Button>

      {errorMessage && !isPromptOpen ? (
        <p id={errorId} role="alert" className="max-w-64 text-right text-xs text-rose-300">
          {errorMessage}
        </p>
      ) : null}

      {isPromptOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isLinking) {
              setIsPromptOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 p-6 text-left shadow-2xl shadow-black/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={dialogTitleId} className="text-lg font-semibold text-white">
                  Link your GitHub account
                </h2>
                <p id={dialogDescriptionId} className="mt-1 text-sm leading-6 text-slate-400">
                  Enter your GitHub username or email to link.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close GitHub linking dialog"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                disabled={isLinking}
                onClick={() => setIsPromptOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleLinkGitHub}>
              <div className="space-y-2">
                <Label htmlFor={inputId}>GitHub username or email</Label>
                <Input
                  id={inputId}
                  name="github-identifier"
                  type="text"
                  value={githubIdentifier}
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="octocat or you@example.com"
                  disabled={isLinking}
                  aria-describedby={errorMessage ? errorId : dialogDescriptionId}
                  onChange={(event) => {
                    setGitHubIdentifier(event.target.value);
                    if (errorMessage) {
                      setErrorMessage(null);
                    }
                  }}
                />
              </div>

              {errorMessage ? (
                <p id={errorId} role="alert" className="text-sm text-rose-300">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isLinking}
                  onClick={() => setIsPromptOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLinking || !githubIdentifier.trim()}>
                  {isLinking ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isLinking ? 'Connecting...' : 'Continue to GitHub'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
