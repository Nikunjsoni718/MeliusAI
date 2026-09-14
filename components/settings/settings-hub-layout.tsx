'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Bell, CreditCard, FolderLock, GitBranch, ShieldCheck, UserRound } from 'lucide-react';

import { settingsTabs } from '@/lib/settings-tabs';
import { cn } from '@/lib/utils';
import { useViewerProfile } from '@/lib/viewer-client';

type SettingsViewer = ReturnType<typeof useViewerProfile>;
const SettingsViewerContext = createContext<SettingsViewer | null>(null);
const settingsTabIcons = {
  account: ShieldCheck,
  'public-profile': UserRound,
  vault: FolderLock,
  integrations: GitBranch,
  notifications: Bell,
  billing: CreditCard,
} as const;

export function useSettingsViewer() {
  const viewer = useContext(SettingsViewerContext);
  if (!viewer) {
    throw new Error('Settings controls must be rendered inside SettingsHubLayout.');
  }
  return viewer;
}

function SettingsHubSkeleton() {
  return (
    <main className="min-h-[100dvh] bg-[#050b17] px-3 py-8 text-slate-200 sm:px-6">
      <div className="max-w-6xl w-[85%] mx-auto mt-12 flex min-h-[75vh] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-blue-950/50 bg-[#090d1f]/90 shadow-2xl backdrop-blur-md">
        <aside className="w-52 shrink-0 overflow-y-auto border-r border-white/10 bg-[#0A0F1C]/70 backdrop-blur-lg sm:w-64">
          <div className="border-b border-white/10 px-5 py-5 md:px-6">
            <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-3 h-6 w-28 animate-pulse rounded-md bg-slate-800/50" />
          </div>
          <div className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-5">
            {settingsTabs.map((tab) => (
              <div key={tab.slug} className="h-10 w-full animate-pulse rounded-md bg-slate-800/50" />
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto bg-[#090d1f]/40 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-3xl">
            <div className="h-3 w-20 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-4 h-9 w-64 animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-4 h-5 w-full max-w-xl animate-pulse rounded-md bg-slate-800/50" />
            <div className="mt-8 h-40 animate-pulse rounded-md border border-blue-950/50 bg-[#050b1b]/60" />
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
      <main className="min-h-[100dvh] bg-[#050b17] px-3 py-8 text-slate-200 sm:px-6">
        <div className="max-w-6xl w-[85%] mx-auto mt-12 flex min-h-[75vh] max-h-[calc(100dvh-6rem)] overflow-hidden rounded-xl border border-blue-950/50 bg-[#090d1f]/90 shadow-2xl backdrop-blur-md">
          <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#0A0F1C]/70 backdrop-blur-lg sm:w-64">
            <div className="border-b border-white/10 px-5 py-5 md:px-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Workspace</p>
              <h1 className="mt-2 text-lg font-semibold text-slate-200">Settings</h1>
            </div>

            <nav aria-label="Settings categories" className="flex flex-col gap-2 px-3 py-3 sm:px-4 sm:py-5">
              {settingsTabs.map((tab) => {
                const href = `/settings/${tab.slug}`;
                const isActive = pathname === href;
                const Icon = settingsTabIcons[tab.slug];

                return (
                  <Link
                    key={tab.slug}
                    href={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-blue-950/30 hover:text-cyan-400',
                      isActive && 'bg-blue-950/30 text-cyan-400'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-cyan-400',
                        isActive && 'text-cyan-400'
                      )}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-[#090d1f]/40 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</div>
        </div>
      </main>
    </SettingsViewerContext.Provider>
  );
}
