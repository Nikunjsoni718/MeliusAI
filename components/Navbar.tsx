"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const sectionScrollPositions: Record<string, number> = {
  top: 0,
  'how-it-works': 850,
  differentiation: 1700,
  'about-us': 2550,
};

export function Navbar() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (pathname !== '/') {
    return null;
  }

  const handleScroll = (e: React.MouseEvent, id: keyof typeof sectionScrollPositions) => {
    e.preventDefault();
    window.scrollTo({ top: sectionScrollPositions[id], behavior: 'smooth' });
  };

  return (
    <div className="w-full fixed top-6 left-0 right-0 z-50 px-4 md:px-12 pointer-events-none">
      <header className="max-w-7xl mx-auto h-20 rounded-full border border-neutral-800/80 bg-neutral-950/60 backdrop-blur-md flex items-center justify-between px-8 shadow-[0_12px_40px_rgba(0,0,0,0.5)] pointer-events-auto transition-all duration-300">
        <div
          onClick={(e) => handleScroll(e, 'top')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <img
            src="/favicon.png"
            alt="MeliusAI Logo"
            className="h-7 w-7 object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <span className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-neutral-200">
            MeliusAI
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-10">
          <button onClick={(e) => handleScroll(e, 'top')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">Introduction</button>
          <button onClick={(e) => handleScroll(e, 'how-it-works')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">How it Works</button>
          <button onClick={(e) => handleScroll(e, 'differentiation')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">What makes us different</button>
          <button onClick={(e) => handleScroll(e, 'about-us')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">About Us</button>
        </nav>

        <div>
          <button
            onClick={() => window.location.href = '/auth'}
            className="rounded-full bg-[#00a3ff] px-6 py-2 text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:bg-[#24b4ff] active:scale-[0.98]"
          >
            Sign In
          </button>
        </div>
      </header>
    </div>
  );
}
