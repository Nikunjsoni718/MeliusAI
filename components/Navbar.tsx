'use client';

import Image from 'next/image';
import Link from 'next/link';

import faviconLogo from '@/app/favicon.png';
import { Button } from '@/components/ui/button';

export function Navbar() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

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
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="transition hover:text-white"
          >
            Introduction
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('how-it-works')}
            className="transition hover:text-white"
          >
            How it Works
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('differentiation')}
            className="transition hover:text-white"
          >
            What makes us different
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('about-us')}
            className="transition hover:text-white"
          >
            About Us
          </button>
        </nav>

        <Button size="sm" href="/auth">
          Sign In
        </Button>
      </div>
    </header>
  );
}
