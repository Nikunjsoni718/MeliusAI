'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import faviconLogo from '@/app/favicon.png';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: 'Introduction' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/difference', label: 'What makes us different' },
  { href: '/about-us', label: 'About Us' },
];

export function SiteHeader() {
  const pathname = usePathname() ?? '/';

  return (
    <header className="sticky top-0 z-40 px-4 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-full border border-slate-800/80 bg-slate-950/75 px-5 py-4 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
        <Link href="/" className="flex items-center" aria-label="Go to MeliusAI home">
          <Image
            src={faviconLogo}
            alt="MeliusAI Logo"
            width={40}
            height={40}
            priority
            className="object-contain cursor-pointer"
          />
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
