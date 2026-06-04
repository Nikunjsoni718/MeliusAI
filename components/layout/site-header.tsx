'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: 'Introduction' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/difference', label: 'What makes us different' },
  { href: '/melius+', label: 'Melius+' },
  { href: '/about-us', label: 'About Us' },
];

export function SiteHeader() {
  const pathname = usePathname() ?? '/';

  return (
    <header className="sticky top-0 z-40 px-4 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-full border border-slate-800/80 bg-slate-950/75 px-5 py-4 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-500/25 bg-sky-500/10 text-sm font-semibold text-sky-300 shadow-[0_0_45px_rgba(0,112,243,0.2)]">
            MI
          </div>
          <div>
            <p className="text-base font-semibold text-white">MeliusIQ</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Career OS</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-slate-300 lg:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`transition ${active ? 'text-white' : 'text-slate-300 hover:text-white'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Button size="sm" href="/auth">
          Sign In
        </Button>
      </div>
    </header>
  );
}
