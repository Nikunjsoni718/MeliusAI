'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { settingsTabs } from '@/lib/settings-tabs';
import { cn } from '@/lib/utils';
import { useViewerProfile } from '@/lib/viewer-client';

type SettingsViewer = ReturnType<typeof useViewerProfile>;
const SettingsViewerContext = createContext<SettingsViewer | null>(null);

export function useSettingsViewer() {
  const viewer = useContext(SettingsViewerContext);
  if (!viewer) {
    throw new Error('Settings controls must be rendered inside SettingsHubLayout.');
  }
  return viewer;
}

function SettingsHubSkeleton() {
  return (
    <main className="min-h-[100dvh] bg-slate-950 px-3 py-8 text-slate-200 sm:px-6">
      <div className="max-w-6xl w-[85%] mx-auto mt-12 flex min-h-[75vh] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-slate-800 bg-[#0B1021] shadow-2xl">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-slate-800 bg-[#0B1021] sm:w-64">
          <div className="border-b border-slate-800 px-5 py-5 md:px-6">
            <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-3 h-6 w-28 animate-pulse rounded-md bg-slate-800/50" />
          </div>
          <div className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-5">
            {settingsTabs.map((tab) => (
              <div key={tab.slug} className="h-10 w-full animate-pulse rounded-md bg-slate-800/50" />
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
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
  const viewer = useViewerProfile();
  const { authEnabled, loading, user } = viewer;

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
    <SettingsViewerContext.Provider value={viewer}>
      <main className="min-h-[100dvh] bg-slate-950 px-3 py-8 text-slate-200 sm:px-6">
        <div className="max-w-6xl w-[85%] mx-auto mt-12 flex min-h-[75vh] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-slate-800 bg-[#0B1021] shadow-2xl">
          <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-[#0B1021] sm:w-64">
            <div className="border-b border-slate-800 px-5 py-5 md:px-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Workspace</p>
              <h1 className="mt-2 text-lg font-semibold text-slate-200">Settings</h1>
            </div>

            <nav aria-label="Settings categories" className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-5">
              {settingsTabs.map((tab) => {
                const href = `/settings/${tab.slug}`;
                const isActive = pathname === href;

                return (
                  <Link
                    key={tab.slug}
                    href={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'rounded-md border border-transparent px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:border-slate-800 hover:bg-slate-950/50 hover:text-slate-200',
                      isActive && 'border-slate-800 bg-slate-950/50 text-slate-200'
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-[#0B1021] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</div>
        </div>
      </main>
    </SettingsViewerContext.Provider>
  );
}
