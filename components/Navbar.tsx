"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Introduction' },
  { href: '/how-it-works', label: 'How it Works' },
  { href: '/difference', label: 'What makes us different' },
  { href: '/about-us', label: 'About Us' },
];
const publicMarketingRoutes = ['/', '/how-it-works', '/difference', '/about-us'];

export function Navbar() {
  const [logoFailed, setLogoFailed] = useState(false);
  const pathname = usePathname();

  if (!publicMarketingRoutes.includes(pathname)) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-6 z-50 w-full px-4 md:px-12">
      <header className="pointer-events-auto mx-auto flex h-20 max-w-7xl items-center justify-between rounded-full border border-neutral-800/80 bg-neutral-950/60 px-8 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300">
        <Link href="/" className="group flex items-center gap-3 select-none" aria-label="Go to MeliusAI introduction">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-transparent">
            {logoFailed ? (
              <span className="flex h-full w-full items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-xs font-black tracking-tighter text-white">
                M
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/favicon.png"
                alt=""
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  setLogoFailed(true);
                }}
              />
            )}
          </div>
          <span className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-neutral-200">
            MeliusAI
          </span>
        </Link>

        <nav className="hidden items-center gap-10 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/auth"
          className="rounded-full bg-[#00a3ff] px-6 py-2.5 text-sm font-semibold text-black transition-all hover:bg-opacity-90"
        >
          Sign In
        </Link>
      </header>
    </div>
  );
}
