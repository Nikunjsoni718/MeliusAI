"use client";
import React, { useEffect } from 'react';


export function Navbar() {
  // Automatically strip hashes like #about-us out of the URL bar if they exist on mount
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const handleScroll = (e: React.MouseEvent, id: string) => {
    e.preventDefault(); // 👈 Prevents the browser from appending #id to the URL bar
    
    // Smoothly scroll to the target container
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full fixed top-4 left-0 right-0 z-50 px-4 md:px-8 pointer-events-none">
      <header className="max-w-7xl mx-auto h-16 rounded-full border border-slate-850 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 shadow-xl pointer-events-auto">
        
        {/* Left: Branding */}
        <div 
          onClick={(e) => handleScroll(e, 'top')}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-xs font-black text-white tracking-tighter">M</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-50">
            Melius<span className="text-blue-500">AI</span>
          </span>
        </div>

        {/* Center: Interactive Scroll Triggers */}
        <nav className="hidden md:flex items-center gap-8">
          <button onClick={(e) => handleScroll(e, 'top')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">Introduction</button>
          <button onClick={(e) => handleScroll(e, 'how-it-works')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">How it Works</button>
          <button onClick={(e) => handleScroll(e, 'differentiation')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">What makes us different</button>
          <button onClick={(e) => handleScroll(e, 'about-us')} className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">About Us</button>
        </nav>

        {/* Right: CTA Link */}
        <div>
          <button 
            onClick={() => window.location.href = '/login'}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-slate-50 transition-all hover:bg-blue-500"
          >
            Sign In
          </button>
        </div>

      </header>
    </div>
  );
}
