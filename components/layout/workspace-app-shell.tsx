'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import {
  BriefcaseBusiness,
  FileText,
  FolderLock,
  House,
  Search,
  Settings,
} from 'lucide-react';

import faviconLogo from '@/app/favicon.png';
import { clearPersistedAuthState } from '@/lib/auth-session-routing';
import { isViewerProfileOwner, useViewerProfile } from '@/lib/viewer-client';
import { cn } from '@/lib/utils';
import { NotificationCenter } from '@/components/layout/notification-center';
import { PushPermissionPrompt } from '@/components/layout/push-permission-prompt';

type NavigationItem = {
  href: string;
  label: string;
  icon: ReactNode;
  ownerOnly?: boolean;
};

function profileUsernameFromPathname(pathname: string) {
  const match = pathname.match(/^\/profile\/([^/?#]+)/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]).replace(/^@+/, '').trim() || null;
  } catch {
    return null;
  }
}

export function WorkspaceAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, profile, supabase, user } = useViewerProfile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const targetUsername = profileUsernameFromPathname(pathname);
  const viewerUsername =
    profile?.username ??
    (typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : null);
  const isOwner =
    !loading &&
    Boolean(
      user &&
        (!targetUsername ||
          isViewerProfileOwner({
            viewerId: user.id,
            viewerUsername,
            // This shell has the viewer profile, not the profile being
            // viewed. Only the normalized route handle is safe here.
            profileId: null,
            targetUsername,
          }))
    );
  const profileHandle = targetUsername ?? viewerUsername ?? user?.id ?? null;
  const profileHref = profileHandle ? `/profile/${encodeURIComponent(profileHandle)}` : '/home';

  const navigation = useMemo<NavigationItem[]>(() => {
    const spectator = Boolean(targetUsername && !isOwner);
    const items: NavigationItem[] = [
      { href: profileHref, label: 'Home', icon: <House className="h-5 w-5" strokeWidth={1.8} /> },
      { href: '/search', label: 'Search', icon: <Search className="h-5 w-5" strokeWidth={1.8} />, ownerOnly: true },
      {
        href: spectator && targetUsername ? `/vault?profile=${encodeURIComponent(targetUsername)}` : '/vault',
        label: 'Vault',
        icon: <FolderLock className="h-5 w-5" strokeWidth={1.8} />,
      },
      {
        href: spectator && targetUsername ? `/resume?profile=${encodeURIComponent(targetUsername)}` : '/resume',
        label: 'Developer Profile',
        icon: <FileText className="h-5 w-5" strokeWidth={1.8} />,
      },
      {
        href: `${profileHref}#opportunities`,
        label: 'Opportunities',
        icon: <BriefcaseBusiness className="h-5 w-5" strokeWidth={1.8} />,
        ownerOnly: true,
      },
      { href: '/settings', label: 'Settings', icon: <Settings className="h-5 w-5" strokeWidth={1.8} />, ownerOnly: true },
    ];

    return items.filter((item) => !item.ownerOnly || isOwner);
  }, [isOwner, profileHref, targetUsername]);

  const signOut = async () => {
    await supabase?.auth.signOut();
    clearPersistedAuthState();
    router.replace('/auth');
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-slate-950 text-white">
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close workspace sidebar"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(16rem,85vw)] flex-col justify-between overflow-visible border-r border-white/10 bg-[#0A0F1C]/70 backdrop-blur-lg transition-transform duration-300 ease-in-out md:relative md:z-auto md:h-full md:w-64 md:flex-shrink-0 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4">
          <Link
            href="/home"
            prefetch={true}
            className="mb-8 flex items-center gap-3 px-3 py-2"
            aria-label="Go to candidate dashboard"
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-950/60 bg-blue-950/60 p-1">
              <Image src={faviconLogo} alt="MeliusAI Logo" width={36} height={36} className="cursor-pointer object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">MeliusAI</p>
              <p className="text-[11px] tracking-wide text-slate-500">Workspace</p>
            </div>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="Workspace navigation">
            {navigation.map((item) => {
              const routeHref = item.href.split('#')[0] || item.href;
              const active =
                pathname === routeHref ||
                (routeHref === profileHref && pathname.startsWith('/profile/')) ||
                (routeHref === '/settings' && pathname.startsWith('/settings/'));

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  prefetch={true}
                  aria-current={active ? 'page' : undefined}
                  onFocus={() => router.prefetch(routeHref)}
                  onMouseEnter={() => router.prefetch(routeHref)}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-300 transition-all duration-200 hover:bg-blue-950/30 hover:text-white',
                    active && 'bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                  )}
                >
                  <span className="text-slate-400 transition-colors group-hover:text-cyan-400">{item.icon}</span>
                  <span className="font-sans text-sm tracking-wide">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {isOwner ? (
          <div className="p-4">
            {user?.id ? <NotificationCenter userId={user.id} /> : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full justify-start rounded-lg border border-blue-950/60 bg-[#071329]/60 px-3 py-2.5 text-left text-xs text-slate-200 transition hover:border-cyan-500/30 hover:bg-[#0b1d38]/80"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <button
          type="button"
          aria-label="Toggle workspace sidebar"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/90 text-slate-100 shadow-lg shadow-black/20 backdrop-blur transition hover:border-cyan-500/40 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:hidden"
        >
          <span className="text-lg leading-none" aria-hidden="true">☰</span>
        </button>
        {children}
      </div>
      {isOwner ? <PushPermissionPrompt /> : null}
    </div>
  );
}
