'use client';

import { GitBranch } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';

type GitHubLinkButtonProps = {
  username?: string | null;
};

const GITHUB_APP_INSTALLATION_URL = 'https://github.com/apps/meliusai/installations/new';

export function GitHubLinkButton({ username }: GitHubLinkButtonProps) {
  const errorId = useId();
  const normalizedUsername = username?.trim().replace(/^@+/, '') || null;
  const installationHref = normalizedUsername
    ? `${GITHUB_APP_INSTALLATION_URL}?state=${encodeURIComponent(normalizedUsername)}`
    : null;
  const errorMessage = installationHref
    ? null
    : 'Your profile username is unavailable. Refresh the page and try again.';

  return (
    <div className="flex flex-col items-end gap-1">
      {installationHref ? (
        <Button
          href={installationHref}
          target="_self"
          variant="secondary"
          size="sm"
          className="h-8 rounded-lg border-slate-700 bg-[#161b22] px-4 text-xs text-white hover:border-slate-600 hover:bg-slate-800"
        >
          <GitBranch className="h-4 w-4" aria-hidden="true" />
          Link GitHub
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-lg border-slate-700 bg-[#161b22] px-4 text-xs text-white hover:border-slate-600 hover:bg-slate-800"
          disabled
          aria-describedby={errorId}
        >
          <GitBranch className="h-4 w-4" aria-hidden="true" />
          Link GitHub
        </Button>
      )}

      {errorMessage ? (
        <p id={errorId} role="alert" className="max-w-64 text-right text-xs text-rose-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
