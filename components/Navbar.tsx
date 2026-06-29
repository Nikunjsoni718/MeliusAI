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

    // Try finding the container directly or via marketing layout fallbacks
    const element = document.getElementById(id) || 
                    document.getElementById(`${id}-section`) || 
                    document.querySelector(`[data-section="${id}"]`);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      console.warn(`MeliusAI Navbar: Target container element with ID '#${id}' was not rendered on the viewport DOM framework. Make sure your component file sections wrap their markup with matching id="..." strings.`);
    }
  };

  return (
    <div className="w-full fixed top-6 left-0 right-0 z-50 px-4 md:px-12 pointer-events-none">
      <header className="max-w-7xl mx-auto h-20 rounded-full border border-neutral-800/80 bg-neutral-950/60 backdrop-blur-md flex items-center justify-between px-8 shadow-[0_12px_40px_rgba(0,0,0,0.5)] pointer-events-auto transition-all duration-300">
        
        {/* Left Side: Branding with explicit favicon.png resource */}
        <div 
          onClick={(e) => handleScroll(e, 'top')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <img 
            src="/favicon.png" 
            alt="MeliusAI" 
            className="h-8 w-8 object-contain transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              // Fallback block if favicon.png path location differs
              e.currentTarget.src = '/favicon.ico';
            }}
          />
          <span className="text-xl font-bold tracking-tight text-neutral-100">
            Melius<span className="text-blue-500">AI</span>
          </span>
        </div>

        {/* Center Section: Core Navigation Links */}
        <nav className="hidden md:flex items-center gap-10">
          <button onClick={(e) => handleScroll(e, 'top')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">Introduction</button>
          <button onClick={(e) => handleScroll(e, 'how-it-works')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">How it Works</button>
          <button onClick={(e) => handleScroll(e, 'differentiation')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">What makes us different</button>
          <button onClick={(e) => handleScroll(e, 'about-us')} className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors">About Us</button>
        </nav>

        {/* Right Side: Primary Interactive Call to Action routing to /auth */}
        <div>
          <button 
            onClick={() => window.location.href = '/auth'}
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In
          </button>
        </div>

      </header>
    </div>
  );
}
