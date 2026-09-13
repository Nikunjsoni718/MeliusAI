'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { settingsTabs } from '@/lib/settings-tabs';
import { cn } from '@/lib/utils';
import { useViewerProfile } from '@/lib/viewer-client';

function SettingsHubSkeleton() {
  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-200">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col md:flex-row">
        <aside className="border-b border-slate-800 bg-[#0B1021] md:h-[100dvh] md:w-72 md:shrink-0 md:border-b-0 md:border-r">
          <div className="border-b border-slate-800 px-5 py-5 md:px-6">
            <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-3 h-6 w-28 animate-pulse rounded-md bg-slate-800/50" />
          </div>
          <div className="flex gap-2 overflow-hidden px-3 py-3 md:flex-col md:px-4 md:py-5">
            {settingsTabs.map((tab) => (
              <div key={tab.slug} className="h-10 w-44 shrink-0 animate-pulse rounded-md bg-slate-800/50 md:w-full" />
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-3xl">
            <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-4 h-9 w-64 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-4 h-5 w-full max-w-xl animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-8 h-40 animate-pulse rounded-md border border-slate-800 bg-[#0B1021]" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function SettingsHubLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { authEnabled, loading, user } = useViewerProfile();

  useEffect(() => {
    if (!loading && authEnabled && !user) {
      router.replace('/auth');
    }
  }, [authEnabled, loading, router, user]);

  if (loading) {
    return <SettingsHubSkeleton />;
  }

  if (authEnabled && !user) {
    return null;
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 text-slate-200">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col md:flex-row">
        <aside className="border-b border-slate-800 bg-[#0B1021] md:sticky md:top-0 md:flex md:h-[100dvh] md:w-72 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
          <div className="border-b border-slate-800 px-5 py-5 md:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Workspace</p>
            <h1 className="mt-2 text-lg font-semibold text-slate-200">Settings</h1>
          </div>

          <nav aria-label="Settings categories" className="flex gap-2 overflow-x-auto px-3 py-3 md:flex-col md:overflow-y-auto md:px-4 md:py-5">
            {settingsTabs.map((tab) => {
              const href = `/settings/${tab.slug}`;
              const isActive = pathname === href;

              return (
                <Link
                  key={tab.slug}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-slate-800 hover:bg-slate-950/50 hover:text-slate-200 md:w-full',
                    isActive && 'border-slate-800 bg-slate-950/50 text-slate-200'
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</div>
      </div>
    </main>
  );
}
