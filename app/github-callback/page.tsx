'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function GitHubCallbackLoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
      <div className="flex max-w-md flex-col items-center gap-4">
        <LoaderCircle className="h-7 w-7 animate-spin text-sky-400" aria-hidden="true" />
        <p className="text-sm text-slate-300">
          Connecting your GitHub repositories to MeliusAI...
        </p>
      </div>
    </main>
  );
}

function GitHubCallbackRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = searchParams.get('state');

  useEffect(() => {
    const username = state?.trim().replace(/^@+/, '') ?? '';
    const destination = /^[a-z0-9_]{3,24}$/i.test(username)
      ? `/profile/${encodeURIComponent(username)}`
      : '/profile';

    router.replace(destination);
  }, [router, state]);

  return <GitHubCallbackLoadingScreen />;
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<GitHubCallbackLoadingScreen />}>
      <GitHubCallbackRedirect />
    </Suspense>
  );
}
