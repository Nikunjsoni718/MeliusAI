"use client";

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();

  // Strip browser anchor hash links out of the URL bar if they exist on initial load
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Only render the navbar on the root landing layout routes. 
  // It will completely disappear on '/login', '/dashboard', etc.
  if (pathname !== '/') {
    return null;
  }

  const handleScroll = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full fixed top-6 left-0 right-0 z-50 px-4 md:px-12 pointer-events-none">
      <header className="max-w-7xl mx-auto h-20 rounded-full border border-slate-800/40 bg-[#030712]/40 backdrop-blur-xl flex items-center justify-between px-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] pointer-events-auto transition-all duration-300">
        
        {/* Left Side: Branding and Custom Logo Container */}
        <div 
          onClick={(e) => handleScroll(e, 'top')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <span className="text-sm font-black text-white tracking-tighter">M</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-100">
            Melius<span className="text-blue-500">AI</span>
          </span>
        </div>

        {/* Center Section: Core Navigation Links */}
        <nav className="hidden md:flex items-center gap-10">
          <button onClick={(e) => handleScroll(e, 'top')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">Introduction</button>
          <button onClick={(e) => handleScroll(e, 'how-it-works')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">How it Works</button>
          <button onClick={(e) => handleScroll(e, 'differentiation')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">What makes us different</button>
          <button onClick={(e) => handleScroll(e, 'about-us')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">About Us</button>
        </nav>

        {/* Right Side: Primary Interactive Call to Action */}
        <div>
          <button 
            onClick={() => window.location.href = '/login'}
            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign In
          </button>
        </div>

      </header>
    </div>
  );
}
