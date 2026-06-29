"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';

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

  const handleScroll = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Attempt direct DOM selection across different structural configurations
    const element = document.getElementById(id) || 
                    document.getElementById(`${id}-section`) || 
                    document.querySelector(`[data-section="${id}"]`);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Direct absolute height pixel scrolling percentage fallback if section elements lack IDs
      if (id === 'how-it-works') {
        window.scrollTo({ top: window.innerHeight * 0.9, behavior: 'smooth' });
      } else if (id === 'differentiation') {
        window.scrollTo({ top: window.innerHeight * 1.8, behavior: 'smooth' });
      } else if (id === 'about-us') {
        window.scrollTo({ top: window.innerHeight * 2.7, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="w-full fixed top-6 left-0 right-0 z-50 px-4 md:px-12 pointer-events-none">
      <header className="max-w-7xl mx-auto h-20 rounded-full border border-neutral-800/80 bg-neutral-950/60 backdrop-blur-md flex items-center justify-between px-8 shadow-[0_12px_40px_rgba(0,0,0,0.5)] pointer-events-auto transition-all duration-300">
        
        {/* Left Side: Branding with Stable Static Asset */}
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

        {/* Center Section: Core Navigation Links */}
        <nav className="hidden md:flex items-center gap-10">
          <button onClick={(e) => handleScroll(e, 'top')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">Introduction</button>
          <button onClick={(e) => handleScroll(e, 'how-it-works')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">How it Works</button>
          <button onClick={(e) => handleScroll(e, 'differentiation')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">What makes us different</button>
          <button onClick={(e) => handleScroll(e, 'about-us')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">About Us</button>
        </nav>

        {/* Right Side: Button Stylings Matched with Hero Secondary Actions */}
        <div>
          <button 
            onClick={() => window.location.href = '/auth'}
            className="rounded-full border border-neutral-800 bg-[#030712]/40 px-6 py-2 text-sm font-medium text-slate-100 backdrop-blur-md transition-all hover:bg-neutral-900/80 hover:text-white"
          >
            Sign In
          </button>
        </div>

      </header>
    </div>
  );
}
