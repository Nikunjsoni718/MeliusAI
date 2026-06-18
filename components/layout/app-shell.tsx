'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

const hiddenChromeRoutes = [
  '/auth',
  '/choose-path',
  '/company',
  '/home',
  '/profile',
  '/vault',
  '/resume',
  '/search',
  '/meliusai',
  '/settings',
  '/review-queue',
  '/organization',
];

function shouldHideChrome(pathname: string) {
  return hiddenChromeRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const hideChrome = shouldHideChrome(pathname);

  if (hideChrome) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
